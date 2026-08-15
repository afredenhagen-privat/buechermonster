import Dexie, { type EntityTable } from 'dexie';
import type { Book, BookGenre, Genre, Loan, Owner, Series, Setting } from '@/types';

export type BuechermonsterDB = Dexie & {
  books: EntityTable<Book, 'id'>;
  genres: EntityTable<Genre, 'id'>;
  book_genres: EntityTable<BookGenre, 'id'>;
  series: EntityTable<Series, 'id'>;
  owners: EntityTable<Owner, 'id'>;
  loans: EntityTable<Loan, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

export const db = new Dexie('buechermonster-db') as BuechermonsterDB;

/*
  Im Schema-String stehen nur indizierte Felder, alle übrigen sind freie
  Properties des Objekts. `*authors` ist ein multiEntry-Index: damit findet
  der Autorenfilter auch Bücher mit mehreren Autoren, ohne eigene Tabelle.
*/
db.version(1).stores({
  books: '++id, titleSort, authorSort, *authors, status, rating, seriesId, ownerId, isbn13, addedAt',
  genres: '++id, &name, isDefault',
  book_genres: '++id, bookId, genreId, [bookId+genreId]',
  series: '++id, &name',
  owners: '++id, &name, isDefault',
  loans: '++id, bookId, direction, returnedAt, dueAt',
  settings: '&key',
});

export async function initDatabase(): Promise<BuechermonsterDB> {
  if (!db.isOpen()) await db.open();
  return db;
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
