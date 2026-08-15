/**
 * Alle Datenformen der App an einer Stelle.
 *
 * Status und Ausleihrichtung sind Union-Typen und keine losen Strings: ein
 * Tippfehler in einem Filter ist damit ein Build-Fehler statt eines Filters,
 * der stillschweigend nichts findet.
 */

export type BookStatus = 'unread' | 'reading' | 'read';

/** 'out' = ich habe verliehen, 'in' = ich habe geliehen. */
export type LoanDirection = 'out' | 'in';

export const BOOK_STATUSES: readonly BookStatus[] = ['unread', 'reading', 'read'] as const;

export const STATUS_LABEL: Record<BookStatus, string> = {
  unread: 'Ungelesen',
  reading: 'Lese gerade',
  read: 'Gelesen',
};

export interface Book {
  id: number;
  title: string;
  subtitle: string | null;
  /** Kleingeschrieben und ohne führenden Artikel, siehe services/sortKeys.ts. */
  titleSort: string;
  authors: string[];
  /** "funke, cornelia" — vom ersten Autor abgeleitet, in der Detailansicht überschreibbar. */
  authorSort: string;
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  language: string | null;
  /** Base64-Miniatur, damit Cover auch ohne Netz da sind. */
  coverDataUrl: string | null;
  status: BookStatus;
  /** 0 heißt nicht bewertet, 1–5 sind Sterne. Nie null. */
  rating: number;
  ownerId: number | null;
  seriesId: number | null;
  seriesIndex: number | null;
  notes: string;
  addedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface Genre {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface BookGenre {
  id: number;
  bookId: number;
  genreId: number;
}

export interface Series {
  id: number;
  name: string;
}

/**
 * Der Schrank gehört einer Person, ein Teil der Bücher gehört jemand anderem.
 * Deshalb ein Verweis statt eines Booleans: "gehört mir" wäre aus Sicht der
 * Benutzerin genau die falsche Aussage für ein Buch, das Adi gehört.
 */
export interface Owner {
  id: number;
  name: string;
  /** Vorbelegung beim Anlegen neuer Bücher. Genau ein Eintrag trägt true. */
  isDefault: boolean;
}

export interface Loan {
  id: number;
  bookId: number;
  direction: LoanDirection;
  personName: string;
  startedAt: string;
  /** Rückgabetermin, optional. */
  dueAt: string | null;
  /** Solange null, gilt die Ausleihe als offen. */
  returnedAt: string | null;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** Was der ISBN-Abruf liefert, bevor die Benutzerin es bestätigt. */
export interface LookupResult {
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  language: string | null;
  coverUrl: string | null;
  /** Rohe Kategorien der Quelle, noch nicht auf eigene Genres übersetzt. */
  categories: string[];
  source: 'google' | 'openlibrary';
}
