import { describe, expect, it, vi } from 'vitest';
import {
  InvalidIsbnError,
  LookupOfflineError,
  lookupIsbn,
} from '@/services/bookLookup';

const ISBN = '9783791504650';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

const GOOGLE_HIT = {
  items: [
    {
      volumeInfo: {
        title: 'Tintenherz',
        subtitle: 'Roman',
        authors: ['Cornelia Funke'],
        publisher: 'Cecilie Dressler Verlag',
        publishedDate: '2003-09-01',
        pageCount: 576,
        language: 'de',
        categories: ['Juvenile Fiction / Fantasy & Magic'],
        industryIdentifiers: [
          { type: 'ISBN_13', identifier: '9783791504650' },
          { type: 'ISBN_10', identifier: '3791504657' },
        ],
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&edge=curl' },
      },
    },
  ],
};

const OPENLIBRARY_HIT = {
  [`ISBN:${ISBN}`]: {
    title: 'Tintenherz',
    authors: [{ name: 'Cornelia Funke' }],
    publishers: [{ name: 'Dressler' }],
    publish_date: '2003',
    number_of_pages: 576,
    subjects: [{ name: 'Fantasy' }],
    cover: { medium: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
  },
};

describe('lookupIsbn', () => {
  it('lehnt eine ungültige ISBN ab, ohne das Netz zu bemühen', async () => {
    const fetchImpl = vi.fn();
    await expect(lookupIsbn('9783791504651', { fetchImpl })).rejects.toThrow(InvalidIsbnError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('übernimmt einen Google-Books-Treffer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GOOGLE_HIT));
    const result = await lookupIsbn(ISBN, { fetchImpl });

    expect(result).toMatchObject({
      title: 'Tintenherz',
      subtitle: 'Roman',
      authors: ['Cornelia Funke'],
      publisher: 'Cecilie Dressler Verlag',
      publishedYear: 2003,
      pageCount: 576,
      isbn13: '9783791504650',
      isbn10: '3791504657',
      categories: ['Juvenile Fiction / Fantasy & Magic'],
      source: 'google',
    });
  });

  it('zieht die Cover-Adresse auf https hoch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GOOGLE_HIT));
    const result = await lookupIsbn(ISBN, { fetchImpl });

    // http-Bilder werden auf einer https-Seite als Mixed Content blockiert.
    expect(result?.coverUrl).toBe('https://books.google.com/books/content?id=abc');
  });

  it('fragt bei Google ohne Treffer die zweite Quelle', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ totalItems: 0 }))
      .mockResolvedValueOnce(jsonResponse(OPENLIBRARY_HIT));

    const result = await lookupIsbn(ISBN, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ title: 'Tintenherz', source: 'openlibrary' });
  });

  it('weicht auch bei einem Serverfehler auf die zweite Quelle aus', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 503 }))
      .mockResolvedValueOnce(jsonResponse(OPENLIBRARY_HIT));

    expect(await lookupIsbn(ISBN, { fetchImpl })).toMatchObject({ source: 'openlibrary' });
  });

  it('gibt null zurück, wenn beide Quellen das Buch nicht kennen', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ totalItems: 0 }))
      .mockResolvedValueOnce(jsonResponse({}));

    expect(await lookupIsbn(ISBN, { fetchImpl })).toBeNull();
  });

  it('gibt auf, wenn eine Quelle gar nicht antwortet', async () => {
    // Ohne Zeitlimit bliebe die Ansicht dauerhaft auf "wird gefragt" stehen.
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));

    await expect(lookupIsbn(ISBN, { fetchImpl, timeoutMs: 20 })).rejects.toThrow(
      LookupOfflineError,
    );
  });

  it('nimmt die zweite Quelle, wenn die erste nur hängt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(jsonResponse(OPENLIBRARY_HIT));

    const result = await lookupIsbn(ISBN, { fetchImpl, timeoutMs: 20 });
    expect(result).toMatchObject({ source: 'openlibrary' });
  });

  it('bricht die hängende Anfrage auch wirklich ab', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal ??= init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    await expect(lookupIsbn(ISBN, { fetchImpl, timeoutMs: 20 })).rejects.toThrow();
    expect(seenSignal?.aborted).toBe(true);
  });

  it('unterscheidet "nicht gefunden" von "keine Verbindung"', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(lookupIsbn(ISBN, { fetchImpl })).rejects.toThrow(LookupOfflineError);
  });

  it('kommt mit einer ISBN-10 und Bindestrichen klar', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(GOOGLE_HIT),
    );
    await lookupIsbn('0-306-40615-2', { fetchImpl });

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('isbn:9780306406157');
  });

  it('verkraftet einen Treffer ohne Zusatzangaben', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ items: [{ volumeInfo: { title: 'Nur ein Titel' } }] }),
    );
    const result = await lookupIsbn(ISBN, { fetchImpl });

    expect(result).toMatchObject({
      title: 'Nur ein Titel',
      authors: [],
      publisher: null,
      publishedYear: null,
      pageCount: null,
      coverUrl: null,
      categories: [],
    });
  });
});
