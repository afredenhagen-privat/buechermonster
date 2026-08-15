import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, db, initDatabase } from '@/db/database';
import { DEFAULT_GENRES, DEFAULT_OWNERS, seedDefaults } from '@/db/seed';
import { makeBook } from './factories';

beforeEach(async () => {
  await initDatabase();
  await clearAllData();
});

describe('Schema', () => {
  it('legt alle Stores an', () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['book_genres', 'books', 'genres', 'loans', 'owners', 'series', 'settings'].sort(),
    );
  });

  it('vergibt fortlaufende IDs', async () => {
    const first = await db.books.add(makeBook());
    const second = await db.books.add(makeBook());
    expect(second).toBe(first + 1);
  });

  it('findet ein Buch über jeden seiner Autoren', async () => {
    await db.books.add(makeBook({ authors: ['Neil Gaiman', 'Terry Pratchett'] }));
    await db.books.add(makeBook({ authors: ['Donna Tartt'] }));

    const found = await db.books.where('authors').equals('Terry Pratchett').toArray();
    expect(found).toHaveLength(1);
    expect(found[0]?.authors).toContain('Neil Gaiman');
  });

  it('lässt kein zweites Genre mit demselben Namen zu', async () => {
    await db.genres.add({ name: 'Fantasy', color: '#000', isDefault: false });
    await expect(
      db.genres.add({ name: 'Fantasy', color: '#fff', isDefault: false }),
    ).rejects.toThrow();
  });

  it('leert mit clearAllData jede Tabelle', async () => {
    await db.books.add(makeBook());
    await seedDefaults();
    await clearAllData();

    const counts = await Promise.all(db.tables.map((t) => t.count()));
    expect(counts.every((c) => c === 0)).toBe(true);
  });
});

describe('seedDefaults', () => {
  it('legt Genres und Besitzer beim ersten Start an', async () => {
    const result = await seedDefaults();
    expect(result.genres).toBe(DEFAULT_GENRES.length);
    expect(result.owners).toBe(DEFAULT_OWNERS.length);
    expect(await db.genres.count()).toBe(DEFAULT_GENRES.length);
  });

  it('tut beim zweiten Aufruf nichts mehr', async () => {
    await seedDefaults();
    const second = await seedDefaults();
    expect(second).toEqual({ genres: 0, owners: 0 });
    expect(await db.genres.count()).toBe(DEFAULT_GENRES.length);
  });

  it('legt genau einen vorbelegten Besitzer an', async () => {
    await seedDefaults();
    const defaults = await db.owners.filter((o) => o.isDefault).toArray();
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe('Mir');
  });
});
