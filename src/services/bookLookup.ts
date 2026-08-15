import type { LookupResult } from '@/types';
import { isValidIsbn, normalizeIsbn, splitIsbn, toIsbn13 } from './isbn';

/**
 * ISBN-Abfrage: erst Google Books, dann OpenLibrary. Beide sind ohne
 * Schlüssel erreichbar und erlauben Cross-Origin-Anfragen.
 *
 * Rückgabewerte sind bewusst unterscheidbar:
 *   Treffer            → LookupResult
 *   nichts gefunden    → null
 *   keine Quelle da    → LookupOfflineError
 * Die drei Fälle brauchen im UI verschiedene Sätze — "nicht gefunden" und
 * "du bist offline" sind für die Benutzerin nicht dasselbe.
 */

export class LookupOfflineError extends Error {
  constructor() {
    super('Keine der beiden Buchdatenbanken war erreichbar.');
    this.name = 'LookupOfflineError';
  }
}

export class InvalidIsbnError extends Error {
  constructor() {
    super('Diese ISBN stimmt nicht — bitte die Ziffern prüfen.');
    this.name = 'InvalidIsbnError';
  }
}

export interface LookupOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Zeitlimit je Quelle. */
  timeoutMs?: number;
}

/**
 * Acht Sekunden pro Quelle. Ohne dieses Limit bleibt eine Anfrage, die weder
 * antwortet noch abbricht, ewig hängen — und die Ansicht steht dauerhaft auf
 * "Buchdatenbanken werden gefragt…", ohne dass man da wieder rauskommt.
 */
const DEFAULT_TIMEOUT_MS = 8000;

export async function lookupIsbn(
  rawIsbn: string,
  options: LookupOptions = {},
): Promise<LookupResult | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isValidIsbn(isbn)) throw new InvalidIsbnError();

  const isbn13 = toIsbn13(isbn) ?? isbn;
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let sourcesReached = 0;

  for (const source of [fromGoogleBooks, fromOpenLibrary]) {
    try {
      const result = await withTimeout(
        (signal) => source(isbn13, doFetch, signal),
        timeoutMs,
        options.signal,
      );
      sourcesReached += 1;
      if (result) return result;
    } catch {
      // Quelle nicht erreichbar, zu langsam oder Antwort unbrauchbar —
      // die nächste versuchen.
    }
  }

  if (sourcesReached === 0) throw new LookupOfflineError();
  return null;
}

/**
 * Bricht die Anfrage ab UND gibt das Versprechen auf. Der Abbruch allein
 * reicht nicht: eine fetch-Implementierung, die das Signal ignoriert, würde
 * die Oberfläche sonst trotzdem blockieren.
 */
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  external?.addEventListener('abort', abort, { once: true });

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abort();
      reject(new Error('Zeitüberschreitung bei der Buchsuche.'));
    }, timeoutMs);

    const done = () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    };

    run(controller.signal).then(
      (value) => {
        done();
        resolve(value);
      },
      (error: unknown) => {
        done();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function fromGoogleBooks(
  isbn13: string,
  doFetch: typeof fetch,
  signal?: AbortSignal,
): Promise<LookupResult | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`;
  const response = await doFetch(url, { signal });
  if (!response.ok) throw new Error(`Google Books antwortete mit ${response.status}`);

  const json = (await response.json()) as GoogleBooksResponse;
  const volume = json.items?.[0]?.volumeInfo;
  if (!volume?.title) return null;

  const identifiers = volume.industryIdentifiers ?? [];
  const fromApi13 = identifiers.find((i) => i.type === 'ISBN_13')?.identifier ?? null;
  const fromApi10 = identifiers.find((i) => i.type === 'ISBN_10')?.identifier ?? null;
  const fallback = splitIsbn(isbn13);

  return {
    title: volume.title,
    subtitle: volume.subtitle ?? null,
    authors: volume.authors ?? [],
    isbn13: fromApi13 ?? fallback.isbn13,
    isbn10: fromApi10 ?? fallback.isbn10,
    publisher: volume.publisher ?? null,
    publishedYear: parseYear(volume.publishedDate),
    pageCount: volume.pageCount ?? null,
    language: volume.language ?? null,
    coverUrl: cleanCoverUrl(volume.imageLinks?.thumbnail ?? volume.imageLinks?.smallThumbnail),
    categories: volume.categories ?? [],
    source: 'google',
  };
}

async function fromOpenLibrary(
  isbn13: string,
  doFetch: typeof fetch,
  signal?: AbortSignal,
): Promise<LookupResult | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
  const response = await doFetch(url, { signal });
  if (!response.ok) throw new Error(`OpenLibrary antwortete mit ${response.status}`);

  const json = (await response.json()) as Record<string, OpenLibraryVolume | undefined>;
  const volume = json[`ISBN:${isbn13}`];
  if (!volume?.title) return null;

  const fallback = splitIsbn(isbn13);

  return {
    title: volume.title,
    subtitle: volume.subtitle ?? null,
    authors: (volume.authors ?? []).map((a) => a.name).filter(Boolean),
    isbn13: fallback.isbn13,
    isbn10: fallback.isbn10,
    publisher: volume.publishers?.[0]?.name ?? null,
    publishedYear: parseYear(volume.publish_date),
    pageCount: volume.number_of_pages ?? null,
    language: null,
    coverUrl: cleanCoverUrl(volume.cover?.medium ?? volume.cover?.large ?? volume.cover?.small),
    categories: (volume.subjects ?? []).map((s) => s.name).filter(Boolean),
    source: 'openlibrary',
  };
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const hit = /(\d{4})/.exec(value);
  return hit ? Number(hit[1]) : null;
}

/**
 * Google liefert die Cover-URLs als http und mit einem aufgerollten Eselsohr.
 * Auf einer https-Seite blockiert der Browser http-Bilder als Mixed Content,
 * deshalb wird das Schema hochgezogen.
 */
function cleanCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

/**
 * Lädt das Cover herunter und macht eine Data-URL daraus, damit es auch ohne
 * Netz da ist. Scheitert das an CORS oder fehlender Verbindung, gibt es null
 * zurück — dann zeigt die Liste eben die Initiale statt des Bildes.
 */
export async function fetchCoverDataUrl(
  url: string | null,
  options: LookupOptions = {},
): Promise<string | null> {
  if (!url) return null;
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  try {
    const response = await doFetch(url, { signal: options.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface GoogleBooksResponse {
  items?: { volumeInfo?: GoogleVolumeInfo }[];
}

interface GoogleVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
  categories?: string[];
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
}

interface OpenLibraryVolume {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: { name: string }[];
  cover?: { small?: string; medium?: string; large?: string };
}
