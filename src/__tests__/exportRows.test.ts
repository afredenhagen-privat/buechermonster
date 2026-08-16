import { describe, expect, it } from 'vitest';
import type { Book, Loan } from '@/types';
import { buildExportFilename, buildExportRows, type ExportContext } from '@/services/export/rows';
import { makeBook } from './factories';

function book(id: number, over: Partial<Book> = {}): Book {
  return { ...makeBook(over), id };
}

const LOAN: Loan = {
  id: 1,
  bookId: 1,
  direction: 'out',
  personName: 'Jonas',
  startedAt: '2026-06-02T00:00:00.000Z',
  dueAt: '2026-09-30T00:00:00.000Z',
  returnedAt: null,
};

const ctx: ExportContext = {
  genreNamesOf: (id) => (id === 1 ? ['Fantasy', 'Kinder- & Jugendbuch'] : []),
  seriesNameOf: (id) => (id === 7 ? 'Tintenwelt' : ''),
  ownerNameOf: (id) => (id === 2 ? 'Adi' : 'Mir'),
  openLoanOf: (id) => (id === 1 ? LOAN : undefined),
};

describe('buildExportRows', () => {
  it('macht aus einem Buch eine flache Zeile', () => {
    const row = buildExportRows(
      [
        book(1, {
          title: 'Tintenherz',
          authors: ['Cornelia Funke'],
          seriesId: 7,
          seriesIndex: 1,
          status: 'read',
          rating: 5,
          ownerId: 2,
          isbn13: '9783791504650',
          publisher: 'Dressler',
          publishedYear: 2003,
          pageCount: 576,
          notes: 'Trägt bis heute.',
        }),
      ],
      ctx,
    )[0]!;

    expect(row).toEqual({
      title: 'Tintenherz',
      subtitle: '',
      authors: 'Cornelia Funke',
      series: 'Tintenwelt',
      volume: '1',
      genres: 'Fantasy, Kinder- & Jugendbuch',
      status: 'Gelesen',
      rating: '★★★★★',
      ratingValue: 5,
      owner: 'Adi',
      isbn: '9783791504650',
      publisher: 'Dressler',
      year: '2003',
      pages: '576',
      loan: 'verliehen an Jonas, zurück bis 30.09.2026',
      notes: 'Trägt bis heute.',
    });
  });

  it('lässt leere Felder leer statt "null" hineinzuschreiben', () => {
    const row = buildExportRows([book(2, { title: 'Ohne alles' })], ctx)[0]!;

    expect(row.series).toBe('');
    expect(row.volume).toBe('');
    expect(row.isbn).toBe('');
    expect(row.publisher).toBe('');
    expect(row.year).toBe('');
    expect(row.pages).toBe('');
    expect(row.rating).toBe('');
    expect(row.ratingValue).toBe(0);
    expect(row.loan).toBe('');
  });

  it('liefert die Bewertung zusätzlich als Zahl', () => {
    // Die jsPDF-Standardschriften können kein ★ — das PDF braucht die Zahl,
    // sonst bleibt die Bewertungsspalte im Ausdruck leer.
    const row = buildExportRows([book(4, { rating: 3 })], ctx)[0]!;
    expect(row.rating).toBe('★★★');
    expect(row.ratingValue).toBe(3);
  });

  it('weicht bei fehlender ISBN-13 auf die ISBN-10 aus', () => {
    const row = buildExportRows([book(3, { isbn13: null, isbn10: '3791504657' })], ctx)[0]!;
    expect(row.isbn).toBe('3791504657');
  });

  it('beschreibt auch eine geliehene Ausleihe ohne Termin', () => {
    const borrowed: ExportContext = {
      ...ctx,
      openLoanOf: () => ({ ...LOAN, direction: 'in', personName: 'Lisa', dueAt: null }),
    };
    expect(buildExportRows([book(9)], borrowed)[0]!.loan).toBe('geliehen von Lisa');
  });

  it('behält die übergebene Reihenfolge bei', () => {
    const rows = buildExportRows([book(1, { title: 'B' }), book(2, { title: 'A' })], ctx);
    expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
  });
});

describe('buildExportFilename', () => {
  it('setzt Datum und Endung zusammen', () => {
    expect(buildExportFilename('pdf', 'buecherregal', new Date('2026-03-07T12:00:00'))).toBe(
      'buecherregal-2026-03-07.pdf',
    );
  });

  it('unterscheidet Regal und Wunschliste am Dateinamen', () => {
    expect(buildExportFilename('pdf', 'wunschliste', new Date('2026-03-07T12:00:00'))).toBe(
      'wunschliste-2026-03-07.pdf',
    );
  });
});
