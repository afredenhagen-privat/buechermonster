import { describe, expect, it, vi } from 'vitest';
import {
  InvalidIsbnError,
  LookupOfflineError,
  coverUrlForIsbn,
  lookupIsbn,
} from '@/services/bookLookup';

const ISBN = '9783791504650';

function response(body: string | object, init: { ok?: boolean; status?: number } = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  } as unknown as Response;
}

const DNB_HIT = response(`<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><records><record><recordData><dc xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Tintenherz / Cornelia Funke</dc:title>
<dc:creator>Funke, Cornelia [Verfasser]</dc:creator>
<dc:publisher>Hamburg : Dressler</dc:publisher>
<dc:date>2003</dc:date>
<dc:format>573 S.</dc:format>
</dc></recordData></record></records></searchRetrieveResponse>`);

const DNB_MISS = response(
  `<?xml version="1.0"?><searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>0</numberOfRecords><records/></searchRetrieveResponse>`,
);

const OPENLIBRARY_HIT = response({
  [`ISBN:${ISBN}`]: {
    title: 'Inkheart',
    authors: [{ name: 'Cornelia Funke' }],
    publishers: [{ name: 'Scholastic' }],
    publish_date: '2003',
    number_of_pages: 534,
    subjects: [{ name: 'Fantasy' }],
    cover: { medium: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
  },
});

const GOOGLE_HIT = response({
  items: [
    {
      volumeInfo: {
        title: 'Tintenherz',
        authors: ['Cornelia Funke'],
        publishedDate: '2003-09-01',
        pageCount: 576,
        categories: ['Juvenile Fiction / Fantasy & Magic'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN }],
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&edge=curl' },
      },
    },
  ],
});

describe('lookupIsbn', () => {
  it('lehnt eine ungültige ISBN ab, ohne das Netz zu bemühen', async () => {
    const fetchImpl = vi.fn();
    await expect(lookupIsbn('9783791504651', { fetchImpl })).rejects.toThrow(InvalidIsbnError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fragt zuerst die DNB und hört bei einem Treffer auf', async () => {
    // Reihenfolge ist Absicht: die DNB kennt deutsche Bücher am besten und
    // hat kein Kontingentproblem.
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => DNB_HIT);
    const result = await lookupIsbn(ISBN, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('services.dnb.de');
    expect(result).toMatchObject({
      title: 'Tintenherz',
      authors: ['Cornelia Funke'],
      publisher: 'Dressler',
      pageCount: 573,
      source: 'dnb',
    });
  });

  it('geht bei einer der DNB unbekannten ISBN zu OpenLibrary weiter', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(DNB_MISS)
      .mockResolvedValueOnce(OPENLIBRARY_HIT);

    const result = await lookupIsbn(ISBN, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ title: 'Inkheart', source: 'openlibrary' });
  });

  it('nimmt Google Books erst, wenn beide vorherigen Quellen nichts haben', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(DNB_MISS)
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(GOOGLE_HIT);

    const result = await lookupIsbn(ISBN, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ source: 'google' });
  });

  it('überspringt eine Quelle, die mit einem Fehlercode antwortet', async () => {
    // Google liefert ohne API-Schlüssel regelmäßig 429, weil das gemeinsame
    // Tageskontingent erschöpft ist. Das darf die Suche nicht abwürgen.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response('', { ok: false, status: 503 }))
      .mockResolvedValueOnce(OPENLIBRARY_HIT);

    expect(await lookupIsbn(ISBN, { fetchImpl })).toMatchObject({ source: 'openlibrary' });
  });

  it('zieht die Cover-Adresse von Google auf https hoch', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(DNB_MISS)
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(GOOGLE_HIT);

    const result = await lookupIsbn(ISBN, { fetchImpl });
    expect(result?.coverUrl).toBe('https://books.google.com/books/content?id=abc');
  });

  it('gibt null zurück, wenn keine Quelle das Buch kennt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(DNB_MISS)
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ totalItems: 0 }));

    expect(await lookupIsbn(ISBN, { fetchImpl })).toBeNull();
  });

  it('unterscheidet "nicht gefunden" von "keine Verbindung"', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(lookupIsbn(ISBN, { fetchImpl })).rejects.toThrow(LookupOfflineError);
  });

  it('gibt auf, wenn keine Quelle antwortet', async () => {
    // Ohne Zeitlimit bliebe die Ansicht dauerhaft auf "wird gefragt" stehen.
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    await expect(lookupIsbn(ISBN, { fetchImpl, timeoutMs: 20 })).rejects.toThrow(
      LookupOfflineError,
    );
  });

  it('nimmt die nächste Quelle, wenn die erste nur hängt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(OPENLIBRARY_HIT);

    expect(await lookupIsbn(ISBN, { fetchImpl, timeoutMs: 20 })).toMatchObject({
      source: 'openlibrary',
    });
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

  it('rechnet eine ISBN-10 vor der Abfrage um', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => DNB_HIT);
    await lookupIsbn('0-306-40615-2', { fetchImpl });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('9780306406157');
  });
});

describe('coverUrlForIsbn', () => {
  it('baut die Cover-Adresse von OpenLibrary, weil die DNB keine Bilder hat', () => {
    expect(coverUrlForIsbn(ISBN)).toBe(
      `https://covers.openlibrary.org/b/isbn/${ISBN}-M.jpg?default=false`,
    );
  });

  it('gibt ohne ISBN null zurück', () => {
    expect(coverUrlForIsbn(null)).toBeNull();
  });
});
