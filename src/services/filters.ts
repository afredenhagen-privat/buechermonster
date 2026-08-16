import type { Book, BookStatus, Loan } from '@/types';
import { compareGerman } from './sortKeys';

export type SortKey =
  | 'title'
  | 'titleDesc'
  | 'author'
  | 'rating'
  | 'added'
  | 'series'
  | 'yearDesc'
  | 'yearAsc';

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Titel A–Z' },
  { key: 'titleDesc', label: 'Titel Z–A' },
  { key: 'author', label: 'Autor A–Z' },
  { key: 'rating', label: 'Bewertung, beste zuerst' },
  { key: 'yearDesc', label: 'Erscheinungsjahr, neueste zuerst' },
  { key: 'yearAsc', label: 'Erscheinungsjahr, älteste zuerst' },
  { key: 'added', label: 'Zuletzt hinzugefügt' },
  { key: 'series', label: 'Reihe und Band' },
] as const;

export type LoanFilter = '' | 'out' | 'in' | 'late';

export interface BookFilter {
  query: string;
  statuses: BookStatus[];
  genreIds: number[];
  /** 0 heißt "egal", sonst die Mindestzahl an Sternen. */
  minRating: number;
  ownerId: number | null;
  seriesId: number | null;
  loan: LoanFilter;
}

export const EMPTY_FILTER: BookFilter = {
  query: '',
  statuses: [],
  genreIds: [],
  minRating: 0,
  ownerId: null,
  seriesId: null,
  loan: '',
};

export interface FilterContext {
  genreIdsOf: (bookId: number) => number[];
  /** Die offene Ausleihe eines Buchs, falls es eine gibt. */
  openLoanOf: (bookId: number) => Loan | undefined;
  seriesNameOf: (seriesId: number | null) => string;
  now: Date;
}

export function isOverdue(loan: Loan | undefined, now: Date): boolean {
  if (!loan || loan.returnedAt || !loan.dueAt) return false;
  return new Date(loan.dueAt).getTime() < now.getTime();
}

export function countActiveFilters(filter: BookFilter): number {
  return (
    filter.statuses.length +
    filter.genreIds.length +
    (filter.minRating > 0 ? 1 : 0) +
    (filter.ownerId !== null ? 1 : 0) +
    (filter.seriesId !== null ? 1 : 0) +
    (filter.loan !== '' ? 1 : 0) +
    (filter.query.trim() !== '' ? 1 : 0)
  );
}

export function filterBooks(books: readonly Book[], filter: BookFilter, ctx: FilterContext): Book[] {
  const query = filter.query.trim().toLocaleLowerCase('de');

  return books.filter((book) => {
    if (query) {
      const haystack = [
        book.title,
        book.subtitle ?? '',
        book.authors.join(' '),
        ctx.seriesNameOf(book.seriesId),
        book.notes,
      ]
        .join(' ')
        .toLocaleLowerCase('de');
      if (!haystack.includes(query)) return false;
    }

    if (filter.statuses.length > 0 && !filter.statuses.includes(book.status)) return false;

    if (filter.genreIds.length > 0) {
      const own = ctx.genreIdsOf(book.id);
      if (!own.some((id) => filter.genreIds.includes(id))) return false;
    }

    if (filter.minRating > 0 && book.rating < filter.minRating) return false;
    if (filter.ownerId !== null && book.ownerId !== filter.ownerId) return false;
    if (filter.seriesId !== null && book.seriesId !== filter.seriesId) return false;

    if (filter.loan !== '') {
      const loan = ctx.openLoanOf(book.id);
      if (!loan) return false;
      if (filter.loan === 'out' && loan.direction !== 'out') return false;
      if (filter.loan === 'in' && loan.direction !== 'in') return false;
      if (filter.loan === 'late' && !isOverdue(loan, ctx.now)) return false;
    }

    return true;
  });
}

export function sortBooks(books: readonly Book[], key: SortKey, ctx: FilterContext): Book[] {
  const byTitle = (a: Book, b: Book) => compareGerman(a.titleSort, b.titleSort);

  const comparators: Record<SortKey, (a: Book, b: Book) => number> = {
    title: byTitle,
    titleDesc: (a, b) => -byTitle(a, b),
    author: (a, b) => compareGerman(a.authorSort, b.authorSort) || byTitle(a, b),
    rating: (a, b) => b.rating - a.rating || byTitle(a, b),
    // Bücher ohne Jahresangabe hängen in beiden Richtungen hinten dran. Sie
    // als ältestes oder neuestes einzusortieren wäre eine Behauptung, die
    // die Daten nicht hergeben.
    yearDesc: (a, b) => byYear(a, b, -1) || byTitle(a, b),
    yearAsc: (a, b) => byYear(a, b, 1) || byTitle(a, b),
    // Gemeint ist, wann das Buch ins Regal kam — bei einem lange gewünschten
    // Buch ist das nicht der Zeitpunkt des Anlegens. ISO-Zeitstempel sortieren
    // als Zeichenketten korrekt, dafür braucht es keinen Kollator.
    added: (a, b) => {
      const left = a.shelvedAt ?? a.addedAt;
      const right = b.shelvedAt ?? b.addedAt;
      return (left < right ? 1 : left > right ? -1 : 0) || byTitle(a, b);
    },
    series: (a, b) => {
      // Bücher ohne Reihe hängen hinten dran, sonst reißen sie die Bände auseinander.
      if (a.seriesId === null && b.seriesId === null) return byTitle(a, b);
      if (a.seriesId === null) return 1;
      if (b.seriesId === null) return -1;
      const byName = compareGerman(ctx.seriesNameOf(a.seriesId), ctx.seriesNameOf(b.seriesId));
      if (byName !== 0) return byName;
      return (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) || byTitle(a, b);
    },
  };

  return [...books].sort(comparators[key]);
}

/** `direction` ist -1 für neueste zuerst, 1 für älteste zuerst. */
function byYear(a: Book, b: Book, direction: 1 | -1): number {
  if (a.publishedYear === null && b.publishedYear === null) return 0;
  if (a.publishedYear === null) return 1;
  if (b.publishedYear === null) return -1;
  return (a.publishedYear - b.publishedYear) * direction;
}
