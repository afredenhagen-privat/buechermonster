import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { clearAllData, db, initDatabase } from '@/db/database';
import { seedDefaults } from '@/db/seed';
import {
  useBooksStore,
  useGenresStore,
  useLoansStore,
  useOwnersStore,
  useSeriesStore,
  useSettingsStore,
  loadAllStores,
} from '@/stores';

beforeEach(async () => {
  setActivePinia(createPinia());
  await initDatabase();
  await clearAllData();
  await seedDefaults();
  await loadAllStores();
});

describe('ownersStore', () => {
  it('legt die beiden Standardnamen an, "Mir" ist vorbelegt', () => {
    const owners = useOwnersStore();
    expect(owners.owners.map((o) => o.name)).toEqual(['Mir', 'Adi']);
    expect(owners.nameOf(owners.defaultOwnerId)).toBe('Mir');
  });

  it('legt einen weiteren Namen an', async () => {
    const owners = useOwnersStore();
    const created = await owners.create('Oma');
    expect(created.isDefault).toBe(false);
    expect(owners.owners).toHaveLength(3);
  });

  it('lehnt denselben Namen ein zweites Mal ab, egal wie geschrieben', async () => {
    const owners = useOwnersStore();
    await expect(owners.create('adi')).rejects.toThrow(/gibt es schon/);
    await expect(owners.create('   ')).rejects.toThrow(/leer/);
  });

  it('benennt um, ohne den Eintrag neu anzulegen', async () => {
    const owners = useOwnersStore();
    const adi = owners.owners.find((o) => o.name === 'Adi')!;
    await owners.rename(adi.id, 'Adrian');

    expect(owners.byId(adi.id)?.name).toBe('Adrian');
    expect((await db.owners.get(adi.id))?.name).toBe('Adrian');
  });

  it('hat immer genau eine Vorbelegung', async () => {
    const owners = useOwnersStore();
    const adi = owners.owners.find((o) => o.name === 'Adi')!;
    await owners.setDefault(adi.id);

    expect(owners.owners.filter((o) => o.isDefault)).toHaveLength(1);
    expect(owners.defaultOwnerId).toBe(adi.id);
  });

  it('löscht keinen Namen, an dem noch Bücher hängen', async () => {
    const owners = useOwnersStore();
    const books = useBooksStore();
    const adi = owners.owners.find((o) => o.name === 'Adi')!;
    await books.create({ title: 'Der Schwarm', ownerId: adi.id });

    await expect(owners.remove(adi.id)).rejects.toThrow(/1 Buch/);
    expect(owners.owners).toHaveLength(2);
  });
});

describe('genresStore', () => {
  it('verknüpft Genres mit einem Buch und wieder los', async () => {
    const genres = useGenresStore();
    const books = useBooksStore();
    const fantasy = genres.byName('Fantasy')!;
    const jugend = genres.byName('Kinder- & Jugendbuch')!;
    const book = await books.create({ title: 'Tintenherz' });

    await genres.setBookGenres(book.id, [fantasy.id, jugend.id]);
    expect(genres.genreIdsOf(book.id).sort()).toEqual([fantasy.id, jugend.id].sort());

    await genres.setBookGenres(book.id, [fantasy.id]);
    expect(genres.genreIdsOf(book.id)).toEqual([fantasy.id]);
    expect(await db.book_genres.where('bookId').equals(book.id).count()).toBe(1);
  });

  it('legt keine doppelte Verknüpfung an', async () => {
    const genres = useGenresStore();
    const books = useBooksStore();
    const fantasy = genres.byName('Fantasy')!;
    const book = await books.create({ title: 'Tintenherz' });

    await genres.setBookGenres(book.id, [fantasy.id, fantasy.id]);
    await genres.setBookGenres(book.id, [fantasy.id]);
    expect(await db.book_genres.where('bookId').equals(book.id).count()).toBe(1);
  });

  it('behält beim Umbenennen alle Zuordnungen', async () => {
    const genres = useGenresStore();
    const books = useBooksStore();
    const fantasy = genres.byName('Fantasy')!;
    const book = await books.create({ title: 'Tintenherz', genreIds: [fantasy.id] });

    await genres.update(fantasy.id, { name: 'Phantastik' });

    expect(genres.byId(fantasy.id)?.name).toBe('Phantastik');
    expect(genres.genreIdsOf(book.id)).toEqual([fantasy.id]);
  });

  it('lehnt einen bereits vergebenen Genrenamen ab', async () => {
    const genres = useGenresStore();
    const fantasy = genres.byName('Fantasy')!;
    await expect(genres.update(fantasy.id, { name: 'horror' })).rejects.toThrow(/gibt es schon/);
    await expect(genres.create('Fantasy')).rejects.toThrow(/gibt es schon/);
  });

  it('räumt beim Löschen die Verknüpfungen mit weg', async () => {
    const genres = useGenresStore();
    const books = useBooksStore();
    const fantasy = genres.byName('Fantasy')!;
    const book = await books.create({ title: 'Tintenherz', genreIds: [fantasy.id] });

    await genres.remove(fantasy.id);

    expect(genres.genreIdsOf(book.id)).toEqual([]);
    expect(await db.book_genres.count()).toBe(0);
  });

  it('zählt, wie viele Bücher an einem Genre hängen', async () => {
    const genres = useGenresStore();
    const books = useBooksStore();
    const fantasy = genres.byName('Fantasy')!;
    await books.create({ title: 'A', genreIds: [fantasy.id] });
    await books.create({ title: 'B', genreIds: [fantasy.id] });

    expect(genres.linkCountOf(fantasy.id)).toBe(2);
  });
});

describe('seriesStore', () => {
  it('führt zwei Bücher derselben Reihe auf denselben Eintrag', async () => {
    const series = useSeriesStore();
    const first = await series.findOrCreateByName('Tintenwelt');
    const second = await series.findOrCreateByName('  tintenwelt ');

    expect(second.id).toBe(first.id);
    expect(series.series).toHaveLength(1);
  });

  it('räumt Reihen ohne Bücher weg', async () => {
    const series = useSeriesStore();
    const books = useBooksStore();
    const tintenwelt = await series.findOrCreateByName('Tintenwelt');
    await series.findOrCreateByName('Verwaist');
    await books.create({ title: 'Tintenherz', seriesId: tintenwelt.id, seriesIndex: 1 });

    expect(await series.pruneUnused()).toBe(1);
    expect(series.series.map((s) => s.name)).toEqual(['Tintenwelt']);
  });
});

describe('loansStore', () => {
  async function bookWithLoan() {
    const books = useBooksStore();
    const loans = useLoansStore();
    const book = await books.create({ title: 'Der Herr der Ringe' });
    const loan = await loans.lend({
      bookId: book.id,
      direction: 'out',
      personName: 'Jonas',
      dueAt: '2026-09-30T00:00:00.000Z',
    });
    return { book, loan, loans };
  }

  it('trägt eine Ausleihe ein und findet sie als offen', async () => {
    const { book, loans } = await bookWithLoan();
    expect(loans.openLoanOf(book.id)?.personName).toBe('Jonas');
    expect(loans.lentOut).toHaveLength(1);
    expect(loans.borrowed).toHaveLength(0);
  });

  it('verleiht kein Buch zweimal gleichzeitig', async () => {
    const { book, loans } = await bookWithLoan();
    await expect(
      loans.lend({ bookId: book.id, direction: 'out', personName: 'Marie' }),
    ).rejects.toThrow(/schon ausgeliehen/);
  });

  it('besteht auf einem Namen', async () => {
    const books = useBooksStore();
    const loans = useLoansStore();
    const book = await books.create({ title: 'X' });
    await expect(
      loans.lend({ bookId: book.id, direction: 'in', personName: '  ' }),
    ).rejects.toThrow(/Namen/);
  });

  it('macht aus einer Rückgabe einen Historieneintrag', async () => {
    const { book, loan, loans } = await bookWithLoan();
    await loans.giveBack(loan.id, new Date('2026-08-15T10:00:00.000Z'));

    expect(loans.openLoanOf(book.id)).toBeUndefined();
    expect(loans.historyOf(book.id)).toHaveLength(1);
    expect((await db.loans.get(loan.id))?.returnedAt).toBe('2026-08-15T10:00:00.000Z');
  });

  it('erlaubt nach der Rückgabe eine neue Ausleihe', async () => {
    const { book, loan, loans } = await bookWithLoan();
    await loans.giveBack(loan.id);
    await expect(
      loans.lend({ bookId: book.id, direction: 'out', personName: 'Marie' }),
    ).resolves.toBeDefined();
  });

  it('meldet überfällige Rückgaben, aber erst nach dem Termin', async () => {
    const { loans } = await bookWithLoan();
    expect(loans.overdue(new Date('2026-08-15T00:00:00.000Z'))).toHaveLength(0);
    expect(loans.overdue(new Date('2026-10-01T00:00:00.000Z'))).toHaveLength(1);
  });
});

describe('booksStore', () => {
  it('berechnet Sortierschlüssel und setzt den vorbelegten Besitzer', async () => {
    const books = useBooksStore();
    const owners = useOwnersStore();
    const book = await books.create({
      title: 'Der Herr der Ringe',
      authors: ['J. R. R. Tolkien'],
    });

    expect(book.titleSort).toBe('herr der ringe');
    expect(book.authorSort).toBe('tolkien, j. r. r.');
    expect(book.ownerId).toBe(owners.defaultOwnerId);
    expect(book.status).toBe('unread');
    expect(book.rating).toBe(0);
  });

  it('besteht auf einem Titel', async () => {
    const books = useBooksStore();
    await expect(books.create({ title: '   ' })).rejects.toThrow(/Titel/);
  });

  it('zieht die Sortierschlüssel beim Umbenennen nach', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Falscher Titel', authors: ['Anna Beispiel'] });

    await books.update(book.id, { title: 'Die Känguru-Chroniken', authors: ['Marc-Uwe Kling'] });

    expect(books.byId(book.id)?.titleSort).toBe('känguru-chroniken');
    expect(books.byId(book.id)?.authorSort).toBe('kling, marc-uwe');
    expect((await db.books.get(book.id))?.titleSort).toBe('känguru-chroniken');
  });

  it('lässt Titel und Erscheinungsjahr nachträglich korrigieren', async () => {
    // Was die Buchdatenbank liefert, ist nicht immer richtig — der Reihenname
    // steckt schon mal im Titel, und das Jahr meint die Auflage.
    const books = useBooksStore();
    const book = await books.create({
      title: 'Tintenherz (Tintenwelt 1)',
      authors: ['Cornelia Funke', 'Martina Petersen'],
      publishedYear: 2011,
    });

    await books.update(book.id, {
      title: 'Tintenherz',
      authors: ['Cornelia Funke'],
      publishedYear: 2003,
      publisher: 'Dressler',
      pageCount: 573,
    });

    const stored = await db.books.get(book.id);
    expect(stored).toMatchObject({
      title: 'Tintenherz',
      titleSort: 'tintenherz',
      authors: ['Cornelia Funke'],
      authorSort: 'funke, cornelia',
      publishedYear: 2003,
      publisher: 'Dressler',
      pageCount: 573,
    });
  });

  it('nimmt ein geleertes Erscheinungsjahr als "unbekannt" an', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'X', publishedYear: 2003 });

    await books.update(book.id, { publishedYear: null, pageCount: null });

    expect(books.byId(book.id)?.publishedYear).toBeNull();
    expect((await db.books.get(book.id))?.publishedYear).toBeNull();
  });

  it('setzt das Lesedatum beim Statuswechsel und räumt es wieder weg', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Verity' });

    await books.setStatus(book.id, 'read');
    expect(books.byId(book.id)?.finishedAt).not.toBeNull();

    await books.setStatus(book.id, 'unread');
    expect(books.byId(book.id)?.finishedAt).toBeNull();
  });

  it('lässt das Lesedatum stehen, wenn der Status gleich bleibt', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Verity', status: 'read' });
    const first = books.byId(book.id)?.finishedAt;

    await books.setStatus(book.id, 'read');
    expect(books.byId(book.id)?.finishedAt).toBe(first);
  });

  it('nimmt die Bewertung beim zweiten Tippen auf denselben Stern zurück', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Verity' });

    await books.setRating(book.id, 3);
    expect(books.byId(book.id)?.rating).toBe(3);

    await books.setRating(book.id, 3);
    expect(books.byId(book.id)?.rating).toBe(0);
  });

  it('hält die Bewertung zwischen 0 und 5', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'X', rating: 99 });
    expect(book.rating).toBe(5);

    await books.update(book.id, { rating: -4 });
    expect(books.byId(book.id)?.rating).toBe(0);
  });

  it('legt beim Setzen einer Reihe den Eintrag an und räumt den alten weg', async () => {
    const books = useBooksStore();
    const series = useSeriesStore();
    const book = await books.create({ title: 'Tintenherz' });

    await books.setSeriesByName(book.id, 'Tintenwelt', 1);
    expect(series.nameOf(books.byId(book.id)!.seriesId)).toBe('Tintenwelt');

    await books.setSeriesByName(book.id, null, null);
    expect(books.byId(book.id)?.seriesId).toBeNull();
    expect(series.series).toHaveLength(0);
  });

  it('räumt beim Löschen Genres, Ausleihen und die Reihe mit weg', async () => {
    const books = useBooksStore();
    const genres = useGenresStore();
    const loans = useLoansStore();
    const series = useSeriesStore();
    const fantasy = genres.byName('Fantasy')!;

    const book = await books.create({ title: 'Tintenherz', genreIds: [fantasy.id] });
    await books.setSeriesByName(book.id, 'Tintenwelt', 1);
    await loans.lend({ bookId: book.id, direction: 'out', personName: 'Jonas' });

    await books.remove(book.id);

    expect(books.byId(book.id)).toBeUndefined();
    expect(await db.book_genres.count()).toBe(0);
    expect(await db.loans.count()).toBe(0);
    expect(genres.genreIdsOf(book.id)).toEqual([]);
    expect(loans.openLoanOf(book.id)).toBeUndefined();
    expect(series.series).toHaveLength(0);
  });

  it('findet ein Buch über die ISBN, damit Dubletten auffallen', async () => {
    const books = useBooksStore();
    await books.create({ title: 'Tintenherz', isbn13: '9783791504650' });

    expect(books.byIsbn13('9783791504650')?.title).toBe('Tintenherz');
    expect(books.byIsbn13('9780306406157')).toBeUndefined();
    expect(books.byIsbn13(null)).toBeUndefined();
  });

  it('wendet Filter und Sortierung auf das an, was im Regal steht', async () => {
    const books = useBooksStore();
    const genres = useGenresStore();
    const fantasy = genres.byName('Fantasy')!;

    await books.create({ title: 'Der Schwarm', status: 'unread' });
    await books.create({ title: 'Tintenherz', status: 'read', rating: 5, genreIds: [fantasy.id] });
    await books.create({ title: 'Das Lied der Krähen', status: 'read', rating: 4 });

    expect(books.visibleBooks.map((b) => b.title)).toEqual([
      'Das Lied der Krähen',
      'Der Schwarm',
      'Tintenherz',
    ]);

    books.sort = 'rating';
    books.filter.statuses = ['read'];
    expect(books.visibleBooks.map((b) => b.title)).toEqual(['Tintenherz', 'Das Lied der Krähen']);

    books.filter.genreIds = [fantasy.id];
    expect(books.visibleBooks.map((b) => b.title)).toEqual(['Tintenherz']);

    books.resetFilter();
    expect(books.visibleBooks).toHaveLength(3);
  });

  it('zählt die Lesestände', async () => {
    const books = useBooksStore();
    await books.create({ title: 'A', status: 'read' });
    await books.create({ title: 'B', status: 'reading' });
    await books.create({ title: 'C' });

    expect(books.stats).toEqual({ total: 3, unread: 1, reading: 1, read: 1, wishes: 0 });
  });
});

describe('Wunschliste', () => {
  it('legt einen Wunsch ohne Besitzer und ohne Regal-Zeitpunkt an', async () => {
    const books = useBooksStore();
    const wish = await books.create({ title: 'Der Schwarm', place: 'wish' });

    expect(wish.place).toBe('wish');
    expect(wish.ownerId).toBeNull();
    expect(wish.shelvedAt).toBeNull();
  });

  it('hält Wünsche aus dem Regal heraus, überall', async () => {
    // Das ist die eigentliche Gefahr an einem Feld statt einer zweiten
    // Tabelle: ein Wunsch, der irgendwo als Bestand mitgezählt wird.
    const books = useBooksStore();
    const genres = useGenresStore();
    const owners = useOwnersStore();
    const fantasy = genres.byName('Fantasy')!;

    await books.create({ title: 'Im Regal', genreIds: [fantasy.id] });
    await books.create({ title: 'Nur gewünscht', place: 'wish', genreIds: [fantasy.id] });

    expect(books.shelfBooks.map((b) => b.title)).toEqual(['Im Regal']);
    expect(books.wishBooks.map((b) => b.title)).toEqual(['Nur gewünscht']);
    expect(books.visibleBooks.map((b) => b.title)).toEqual(['Im Regal']);
    expect(books.visibleWishes.map((b) => b.title)).toEqual(['Nur gewünscht']);
    expect(books.stats.total).toBe(1);
    expect(books.stats.wishes).toBe(1);
    expect(books.booksOfOwner(owners.defaultOwnerId!)).toBe(1);
    expect(books.shelfCountOfGenre(fantasy.id)).toBe(1);
  });

  it('sucht die ISBN bewusst überall, damit die Dublettenmeldung greift', async () => {
    const books = useBooksStore();
    await books.create({ title: 'Nur gewünscht', place: 'wish', isbn13: '9783791504650' });

    expect(books.byIsbn13('9783791504650')?.place).toBe('wish');
  });

  it('stellt einen bekommenen Wunsch ins Regal', async () => {
    const books = useBooksStore();
    const owners = useOwnersStore();
    const wish = await books.create({ title: 'Der Schwarm', place: 'wish' });

    await books.moveToShelf(wish.id);

    const book = books.byId(wish.id)!;
    expect(book.place).toBe('shelf');
    expect(book.ownerId).toBe(owners.defaultOwnerId);
    expect(book.shelvedAt).not.toBeNull();
    expect(books.visibleBooks.map((b) => b.title)).toEqual(['Der Schwarm']);
    expect((await db.books.get(wish.id))?.place).toBe('shelf');
  });

  it('schiebt ein Regalbuch als Korrektur zurück auf die Wunschliste', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Versehentlich erfasst' });

    await books.moveToWishlist(book.id);

    expect(books.byId(book.id)?.place).toBe('wish');
    expect(books.byId(book.id)?.ownerId).toBeNull();
    expect(books.byId(book.id)?.shelvedAt).toBeNull();
  });

  it('schiebt kein ausgeliehenes Buch auf die Wunschliste', async () => {
    const books = useBooksStore();
    const loans = useLoansStore();
    const book = await books.create({ title: 'Verliehen' });
    await loans.lend({ bookId: book.id, direction: 'out', personName: 'Jonas' });

    await expect(books.moveToWishlist(book.id)).rejects.toThrow(/ausgeliehen/);
    expect(books.byId(book.id)?.place).toBe('shelf');
  });

  it('tut nichts, wenn das Buch schon am Ziel ist', async () => {
    const books = useBooksStore();
    const book = await books.create({ title: 'Schon da' });
    const vorher = books.byId(book.id)!.shelvedAt;

    await books.moveToShelf(book.id);
    expect(books.byId(book.id)?.shelvedAt).toBe(vorher);
  });

  it('trennt Suche und Sortierung von Regal und Wunschliste', async () => {
    const books = useBooksStore();
    await books.create({ title: 'Regalbuch' });
    await books.create({ title: 'Wunschbuch', place: 'wish' });

    books.filter.query = 'Regal';
    expect(books.visibleBooks).toHaveLength(1);
    expect(books.visibleWishes).toHaveLength(1);

    books.wishFilter.query = 'gibtsnicht';
    expect(books.visibleWishes).toHaveLength(0);
    expect(books.visibleBooks).toHaveLength(1);
  });
});

describe('settingsStore', () => {
  it('erinnert ans Backup, solange noch nie eines lief', () => {
    const settings = useSettingsStore();
    expect(settings.lastBackupAt).toBeNull();
    expect(settings.backupOverdue).toBe(true);
  });

  it('erinnert direkt nach einem Backup nicht', async () => {
    const settings = useSettingsStore();
    await settings.markBackupDone();

    expect(settings.daysSinceBackup).toBe(0);
    expect(settings.backupOverdue).toBe(false);
  });

  it('erinnert wieder, wenn das Backup lange her ist', async () => {
    const settings = useSettingsStore();
    const longAgo = new Date(Date.now() - 45 * 86_400_000);
    await settings.markBackupDone(longAgo);

    expect(settings.daysSinceBackup).toBe(45);
    expect(settings.backupOverdue).toBe(true);
  });
});
