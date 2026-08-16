import type { Book, Loan } from '@/types';

let counter = 0;

/** Ein vollständiges Buch mit unauffälligen Werten, damit Tests nur setzen, worum es ihnen geht. */
export function makeBook(overrides: Partial<Book> = {}): Omit<Book, 'id'> {
  counter += 1;
  const title = overrides.title ?? `Testbuch ${counter}`;
  const base: Omit<Book, 'id'> = {
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
    place: 'shelf',
    status: 'unread',
    rating: 0,
    ownerId: null,
    seriesId: null,
    seriesIndex: null,
    notes: '',
    addedAt: '2026-08-15T10:00:00.000Z',
    shelvedAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };

  // Ein Regalbuch kam dann ins Regal, als es angelegt wurde — sonst hätten
  // alle Testbücher denselben Zeitstempel und die Sortierung "zuletzt
  // hinzugefügt" wäre nicht prüfbar. Ein Wunsch steht noch nicht im Regal.
  if (overrides.shelvedAt === undefined) {
    base.shelvedAt = base.place === 'wish' ? null : base.addedAt;
  }
  return base;
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
