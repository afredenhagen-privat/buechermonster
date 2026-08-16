import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, db, initDatabase } from '@/db/database';
import { seedDefaults } from '@/db/seed';
import { buildBackupFilename, exportBackup, importBackup } from '@/db/backup';
import { makeBook, makeLoan } from './factories';

/*
  Achtung: clearAllData() leert die Tabellen, setzt aber den Auto-Increment-
  Zähler von IndexedDB nicht zurück. IDs sind zwischen Tests deshalb nicht
  vorhersagbar — immer die zurückgegebene ID benutzen, nie 1 annehmen.
*/
async function fillShelf() {
  await seedDefaults();
  const genre = await db.genres.toCollection().first();
  const bookId = await db.books.add(
    makeBook({ title: 'Tintenherz', status: 'read', rating: 5, notes: 'Der Anfang trägt alles.' }),
  );
  await db.book_genres.add({ bookId, genreId: genre!.id });
  const loanId = await db.loans.add(makeLoan({ bookId, dueAt: '2026-09-30T00:00:00.000Z' }));
  return { bookId, loanId };
}

beforeEach(async () => {
  await initDatabase();
  await clearAllData();
});

describe('exportBackup / importBackup', () => {
  it('stellt den Bestand vollständig wieder her', async () => {
    const { bookId } = await fillShelf();
    const backup = await exportBackup();

    await clearAllData();
    expect(await db.books.count()).toBe(0);

    await importBackup(backup);

    const book = await db.books.get(bookId);
    expect(book?.title).toBe('Tintenherz');
    expect(book?.notes).toBe('Der Anfang trägt alles.');
    expect(book?.rating).toBe(5);
    expect(await db.book_genres.count()).toBe(1);
    expect(await db.loans.count()).toBe(1);
    expect(await db.genres.count()).toBeGreaterThan(0);
  });

  it('behält IDs, damit Verknüpfungen nicht ins Leere zeigen', async () => {
    const { bookId } = await fillShelf();
    const backup = await exportBackup();
    await clearAllData();
    await importBackup(backup);

    const link = await db.book_genres.toCollection().first();
    expect(link?.bookId).toBe(bookId);
    expect(await db.books.get(bookId)).toBeDefined();
  });

  it('behält eine offene Ausleihe als offen', async () => {
    const { loanId } = await fillShelf();
    const backup = await exportBackup();
    await clearAllData();
    await importBackup(backup);

    const loan = await db.loans.get(loanId);
    expect(loan?.returnedAt).toBeNull();
    expect(loan?.personName).toBe('Jonas');
    expect(loan?.dueAt).toBe('2026-09-30T00:00:00.000Z');
  });

  it('trägt Kennung und Version im Payload', async () => {
    const backup = await exportBackup();
    expect(backup.app).toBe('buechermonster');
    expect(backup.version).toBe(2);
  });

  it('lehnt eine unbekannte Version ab', async () => {
    await expect(importBackup({ version: 99, data: {} })).rejects.toThrow(/Version/);
  });

  it('nimmt ein Backup aus der Zeit vor der Wunschliste an', async () => {
    // Version 1 kannte weder place noch shelvedAt. Ohne Ergänzung wären die
    // Bücher nach dem Import weder im Regal noch auf der Wunschliste — also
    // in der Datenbank vorhanden, aber nirgends sichtbar.
    const alt = {
      app: 'buechermonster',
      version: 1,
      exportedAt: '2026-08-15T12:00:00.000Z',
      data: {
        books: [
          {
            id: 1,
            title: 'Tintenherz',
            subtitle: null,
            titleSort: 'tintenherz',
            authors: ['Cornelia Funke'],
            authorSort: 'funke, cornelia',
            isbn13: '9783791504650',
            isbn10: null,
            publisher: 'Dressler',
            publishedYear: 2003,
            pageCount: 573,
            language: 'de',
            coverDataUrl: null,
            status: 'read',
            rating: 5,
            ownerId: 1,
            seriesId: null,
            seriesIndex: null,
            notes: 'Trägt bis heute.',
            addedAt: '2026-03-01T09:00:00.000Z',
            updatedAt: '2026-03-01T09:00:00.000Z',
            finishedAt: '2026-04-01T09:00:00.000Z',
          },
        ],
        genres: [],
        book_genres: [],
        series: [],
        owners: [{ id: 1, name: 'Mir', isDefault: true }],
        loans: [],
        settings: [],
      },
    };

    await importBackup(alt);

    const book = await db.books.get(1);
    expect(book?.place).toBe('shelf');
    expect(book?.shelvedAt).toBe('2026-03-01T09:00:00.000Z');
    expect(book?.title).toBe('Tintenherz');
    expect(book?.notes).toBe('Trägt bis heute.');
  });

  it('lehnt ein Backup mit fehlendem Bereich ab', async () => {
    const backup = await exportBackup();
    const broken = { ...backup, data: { ...backup.data, loans: undefined } };
    await expect(importBackup(broken)).rejects.toThrow(/loans/);
  });

  it('lehnt Unsinn ab', async () => {
    await expect(importBackup(null)).rejects.toThrow();
    await expect(importBackup('nö')).rejects.toThrow();
  });

  it('löscht nichts, wenn die Datei ungültig ist', async () => {
    await fillShelf();
    const before = await db.books.count();

    await expect(importBackup({ version: 99, data: {} })).rejects.toThrow();

    expect(await db.books.count()).toBe(before);
  });
});

describe('buildBackupFilename', () => {
  it('enthält das Datum mit führenden Nullen', () => {
    expect(buildBackupFilename(new Date('2026-03-07T12:00:00'))).toBe(
      'buechermonster-backup-2026-03-07.json',
    );
  });
});
