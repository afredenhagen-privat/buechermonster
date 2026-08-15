import type { LookupResult } from '@/types';
import { buildDnbUrl, parseDnbResponse } from './dnb';
import { isValidIsbn, normalizeIsbn, splitIsbn, toIsbn13 } from './isbn';

/**
 * ISBN-Abfrage über drei Quellen, in dieser Reihenfolge:
 *
 *   1. Deutsche Nationalbibliothek — kennt praktisch jedes deutsche Buch,
 *      braucht keinen Schlüssel, erlaubt Cross-Origin-Anfragen.
 *   2. OpenLibrary — springt bei fremdsprachigen Titeln ein.
 *   3. Google Books — steht hinten, weil es ohne API-Schlüssel unzuverlässig
 *      ist: das gemeinsame Tageskontingent für schlüssellose Anfragen ist
 *      regelmäßig erschöpft und die Antwort dann 429. Ein Schlüssel kommt
 *      nicht in Frage, das Repository ist öffentlich.
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
    super('Keine der Buchdatenbanken war erreichbar. Bist du offline?');
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

type Source = (
  isbn13: string,
  doFetch: typeof fetch,
  signal: AbortSignal,
) => Promise<LookupResult | null>;

const SOURCES: Source[] = [fromDnb, fromOpenLibrary, fromGoogleBooks];

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

  for (const source of SOURCES) {
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

async function fromDnb(
  isbn13: string,
  doFetch: typeof fetch,
  signal: AbortSignal,
): Promise<LookupResult | null> {
  const response = await doFetch(buildDnbUrl(isbn13), { signal });
  if (!response.ok) throw new Error(`Die DNB antwortete mit ${response.status}`);
  return parseDnbResponse(await response.text(), isbn13);
}

async function fromOpenLibrary(
  isbn13: string,
  doFetch: typeof fetch,
  signal: AbortSignal,
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
    coverUrl: upgradeToHttps(volume.cover?.medium ?? volume.cover?.large ?? volume.cover?.small),
    categories: (volume.subjects ?? []).map((s) => s.name).filter(Boolean),
    source: 'openlibrary',
  };
}

async function fromGoogleBooks(
  isbn13: string,
  doFetch: typeof fetch,
  signal: AbortSignal,
): Promise<LookupResult | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`;
  const response = await doFetch(url, { signal });
  if (!response.ok) throw new Error(`Google Books antwortete mit ${response.status}`);

  const json = (await response.json()) as GoogleBooksResponse;
  const volume = json.items?.[0]?.volumeInfo;
  if (!volume?.title) return null;

  const identifiers = volume.industryIdentifiers ?? [];
  const fallback = splitIsbn(isbn13);

  return {
    title: volume.title,
    subtitle: volume.subtitle ?? null,
    authors: volume.authors ?? [],
    isbn13: identifiers.find((i) => i.type === 'ISBN_13')?.identifier ?? fallback.isbn13,
    isbn10: identifiers.find((i) => i.type === 'ISBN_10')?.identifier ?? fallback.isbn10,
    publisher: volume.publisher ?? null,
    publishedYear: parseYear(volume.publishedDate),
    pageCount: volume.pageCount ?? null,
    language: volume.language ?? null,
    coverUrl: upgradeToHttps(volume.imageLinks?.thumbnail ?? volume.imageLinks?.smallThumbnail),
    categories: volume.categories ?? [],
    source: 'google',
  };
}

/**
 * Titelbild über die Cover-Adresse von OpenLibrary, unabhängig davon, welche
 * Quelle die Daten geliefert hat — die DNB gibt keine Bilder heraus.
 * `default=false` liefert 404 statt eines grauen Platzhalters.
 */
export function coverUrlForIsbn(isbn13: string | null): string | null {
  return isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false` : null;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const hit = /(\d{4})/.exec(value);
  return hit ? Number(hit[1]) : null;
}

/**
 * Google liefert die Cover-Adressen als http und mit einem aufgerollten
 * Eselsohr. Auf einer https-Seite blockiert der Browser http-Bilder als
 * Mixed Content, deshalb wird das Schema hochgezogen.
 */
function upgradeToHttps(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
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
    if (!blob.type.startsWith('image/') || blob.size === 0) return null;

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
