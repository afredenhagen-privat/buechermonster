import type { Book, Loan } from '@/types';

let counter = 0;

/** Ein vollständiges Buch mit unauffälligen Werten, damit Tests nur setzen, worum es ihnen geht. */
export function makeBook(overrides: Partial<Book> = {}): Omit<Book, 'id'> {
  counter += 1;
  const title = overrides.title ?? `Testbuch ${counter}`;
  return {
    title,
    subtitle: null,
    titleSort: title.toLocaleLowerCase('de'),
    authors: ['Test Autorin'],
    authorSort: 'autorin, test',
    isbn13: null,
    isbn10: null,
    publisher: null,
    publishedYear: null,
    pageCount: null,
    language: 'de',
    coverDataUrl: null,
    status: 'unread',
    rating: 0,
    ownerId: null,
    seriesId: null,
    seriesIndex: null,
    notes: '',
    addedAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

export function makeLoan(overrides: Partial<Loan> = {}): Omit<Loan, 'id'> {
  return {
    bookId: 1,
    direction: 'out',
    personName: 'Jonas',
    startedAt: '2026-06-02T10:00:00.000Z',
    dueAt: null,
    returnedAt: null,
    ...overrides,
  };
}
