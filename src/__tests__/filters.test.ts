import { describe, expect, it } from 'vitest';
import type { Book, Loan } from '@/types';
import {
  EMPTY_FILTER,
  countActiveFilters,
  filterBooks,
  isOverdue,
  sortBooks,
  type BookFilter,
  type FilterContext,
} from '@/services/filters';
import { authorSortKey, titleSortKey } from '@/services/sortKeys';
import { makeBook } from './factories';

const NOW = new Date('2026-08-15T12:00:00.000Z');

function book(id: number, over: Partial<Book> = {}): Book {
  const base = makeBook(over);
  return {
    ...base,
    id,
    titleSort: titleSortKey(base.title),
    authorSort: authorSortKey(base.authors[0]),
  };
}

const BOOKS: Book[] = [
  book(1, { title: 'Tintenherz', authors: ['Cornelia Funke'], status: 'read', rating: 5, seriesId: 1, seriesIndex: 1, ownerId: 1, addedAt: '2026-01-01T00:00:00.000Z' }),
  book(2, { title: 'Der Distelfink', authors: ['Donna Tartt'], status: 'reading', rating: 0, ownerId: 1, notes: 'Zieht sich in der Mitte.', addedAt: '2026-02-01T00:00:00.000Z' }),
  book(3, { title: 'Das Lied der Krähen', authors: ['Leigh Bardugo'], status: 'read', rating: 5, seriesId: 2, seriesIndex: 1, ownerId: 1, addedAt: '2026-03-01T00:00:00.000Z' }),
  book(4, { title: 'Der Schwarm', authors: ['Frank Schätzing'], status: 'unread', rating: 0, ownerId: 2, addedAt: '2026-04-01T00:00:00.000Z' }),
  book(5, { title: 'Tintenblut', authors: ['Cornelia Funke'], status: 'unread', rating: 0, seriesId: 1, seriesIndex: 2, ownerId: 1, addedAt: '2026-05-01T00:00:00.000Z' }),
];

const GENRES: Record<number, number[]> = { 1: [3, 9], 2: [1], 3: [3], 4: [2, 4], 5: [3] };

const LOANS: Record<number, Loan> = {
  4: { id: 1, bookId: 4, direction: 'out', personName: 'Jonas', startedAt: '2026-06-02', dueAt: '2026-09-30', returnedAt: null },
  2: { id: 2, bookId: 2, direction: 'in', personName: 'Lisa', startedAt: '2026-05-20', dueAt: '2026-08-12', returnedAt: null },
};

const SERIES: Record<number, string> = { 1: 'Tintenwelt', 2: 'Glory or Grave' };

const ctx: FilterContext = {
  genreIdsOf: (id) => GENRES[id] ?? [],
  openLoanOf: (id) => LOANS[id],
  seriesNameOf: (id) => (id === null ? '' : (SERIES[id] ?? '')),
  now: NOW,
};

function run(partial: Partial<BookFilter>): string[] {
  return filterBooks(BOOKS, { ...EMPTY_FILTER, ...partial }, ctx).map((b) => b.title);
}

describe('isOverdue', () => {
  it('ist überfällig, wenn der Termin vorbei und nichts zurück ist', () => {
    expect(isOverdue(LOANS[2], NOW)).toBe(true);
  });

  it('ist nicht überfällig vor dem Termin', () => {
    expect(isOverdue(LOANS[4], NOW)).toBe(false);
  });

  it('ist nie überfällig ohne Termin oder nach Rückgabe', () => {
    expect(isOverdue({ ...LOANS[4]!, dueAt: null }, NOW)).toBe(false);
    expect(isOverdue({ ...LOANS[2]!, returnedAt: '2026-08-01' }, NOW)).toBe(false);
    expect(isOverdue(undefined, NOW)).toBe(false);
  });
});

describe('filterBooks', () => {
  it('gibt ohne Filter alles zurück', () => {
    expect(run({})).toHaveLength(5);
  });

  it('sucht in Titel, Autor, Reihe und Notizen', () => {
    expect(run({ query: 'tinten' })).toEqual(['Tintenherz', 'Tintenblut']);
    expect(run({ query: 'funke' })).toEqual(['Tintenherz', 'Tintenblut']);
    expect(run({ query: 'glory' })).toEqual(['Das Lied der Krähen']);
    expect(run({ query: 'zieht sich' })).toEqual(['Der Distelfink']);
  });

  it('ignoriert Groß- und Kleinschreibung', () => {
    expect(run({ query: 'DISTELFINK' })).toEqual(['Der Distelfink']);
  });

  it('filtert nach Status, auch nach mehreren', () => {
    expect(run({ statuses: ['reading'] })).toEqual(['Der Distelfink']);
    expect(run({ statuses: ['read', 'unread'] })).toHaveLength(4);
  });

  it('filtert nach Genre über die Verknüpfungstabelle', () => {
    expect(run({ genreIds: [3] })).toEqual(['Tintenherz', 'Das Lied der Krähen', 'Tintenblut']);
  });

  it('nimmt bei mehreren Genres alles, was mindestens eines davon hat', () => {
    expect(run({ genreIds: [1, 2] })).toEqual(['Der Distelfink', 'Der Schwarm']);
  });

  it('filtert nach Mindestbewertung', () => {
    expect(run({ minRating: 5 })).toEqual(['Tintenherz', 'Das Lied der Krähen']);
    expect(run({ minRating: 1 })).toHaveLength(2);
  });

  it('filtert nach Besitzer', () => {
    expect(run({ ownerId: 2 })).toEqual(['Der Schwarm']);
  });

  it('filtert nach Reihe', () => {
    expect(run({ seriesId: 1 })).toEqual(['Tintenherz', 'Tintenblut']);
  });

  it('trennt verliehen, geliehen und überfällig', () => {
    expect(run({ loan: 'out' })).toEqual(['Der Schwarm']);
    expect(run({ loan: 'in' })).toEqual(['Der Distelfink']);
    expect(run({ loan: 'late' })).toEqual(['Der Distelfink']);
  });

  it('kombiniert mehrere Filter mit UND', () => {
    expect(run({ genreIds: [3], minRating: 5 })).toEqual(['Tintenherz', 'Das Lied der Krähen']);
    expect(run({ genreIds: [3], minRating: 5, statuses: ['unread'] })).toEqual([]);
  });

  it('gibt eine leere Liste zurück, wenn nichts passt', () => {
    expect(run({ query: 'gibtsnicht' })).toEqual([]);
  });
});

describe('countActiveFilters', () => {
  it('zählt nichts, wenn nichts gesetzt ist', () => {
    expect(countActiveFilters(EMPTY_FILTER)).toBe(0);
  });

  it('zählt jeden gesetzten Filter einzeln', () => {
    expect(
      countActiveFilters({
        ...EMPTY_FILTER,
        query: 'x',
        statuses: ['read', 'unread'],
        genreIds: [1],
        minRating: 3,
        loan: 'late',
      }),
    ).toBe(6);
  });

  it('zählt reine Leerzeichen nicht als Suche', () => {
    expect(countActiveFilters({ ...EMPTY_FILTER, query: '   ' })).toBe(0);
  });
});

describe('sortBooks', () => {
  const titles = (key: Parameters<typeof sortBooks>[1]) =>
    sortBooks(BOOKS, key, ctx).map((b) => b.title);

  it('sortiert nach Titel ohne führenden Artikel', () => {
    expect(titles('title')).toEqual([
      'Der Distelfink',
      'Das Lied der Krähen',
      'Der Schwarm',
      'Tintenblut',
      'Tintenherz',
    ]);
  });

  it('dreht die Titelsortierung um', () => {
    expect(titles('titleDesc')[0]).toBe('Tintenherz');
  });

  it('sortiert nach Nachnamen', () => {
    expect(titles('author')).toEqual([
      'Das Lied der Krähen',
      'Tintenblut',
      'Tintenherz',
      'Der Schwarm',
      'Der Distelfink',
    ]);
  });

  it('sortiert die beste Bewertung nach oben', () => {
    expect(titles('rating').slice(0, 2)).toEqual(['Das Lied der Krähen', 'Tintenherz']);
  });

  it('stellt zuletzt Hinzugefügtes nach vorn', () => {
    expect(titles('added')[0]).toBe('Tintenblut');
  });

  it('gruppiert Reihen und hängt Einzelbücher hinten an', () => {
    expect(titles('series')).toEqual([
      'Das Lied der Krähen',
      'Tintenherz',
      'Tintenblut',
      'Der Distelfink',
      'Der Schwarm',
    ]);
  });

  it('lässt die Ausgangsliste unangetastet', () => {
    const before = BOOKS.map((b) => b.title);
    sortBooks(BOOKS, 'titleDesc', ctx);
    expect(BOOKS.map((b) => b.title)).toEqual(before);
  });
});
