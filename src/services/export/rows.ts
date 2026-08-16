import type { Book, Loan } from '@/types';
import { STATUS_LABEL } from '@/types';
import { formatDate } from '../display';

/**
 * Aus Büchern werden flache Zeilen, bevor irgendein Exportformat ins Spiel
 * kommt. PDF und XLSX teilen sich damit dieselbe Aufbereitung, und die
 * Aufbereitung ist ohne PDF-Bibliothek testbar.
 */

export interface ExportContext {
  genreNamesOf: (bookId: number) => string[];
  seriesNameOf: (seriesId: number | null) => string;
  ownerNameOf: (ownerId: number | null) => string;
  openLoanOf: (bookId: number) => Loan | undefined;
}

export interface ExportRow {
  title: string;
  subtitle: string;
  authors: string;
  series: string;
  volume: string;
  genres: string;
  status: string;
  /** Sterne als Text — für Excel, das kann Unicode. */
  rating: string;
  /** Dieselbe Bewertung als Zahl — fürs PDF, siehe Hinweis unten. */
  ratingValue: number;
  owner: string;
  isbn: string;
  publisher: string;
  year: string;
  pages: string;
  loan: string;
  notes: string;
}

export function buildExportRows(books: readonly Book[], ctx: ExportContext): ExportRow[] {
  return books.map((book) => ({
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join(', '),
    series: ctx.seriesNameOf(book.seriesId),
    volume: book.seriesIndex === null ? '' : String(book.seriesIndex),
    genres: ctx.genreNamesOf(book.id).join(', '),
    status: STATUS_LABEL[book.status],
    // Zwei Schreibweisen mit Absicht: die Standardschriften von jsPDF können
    // nur WinAnsi, und ★ (U+2605) gehört nicht dazu — im PDF käme die Spalte
    // sonst leer heraus. Excel hat damit kein Problem und bekommt die Sterne.
    rating: book.rating ? '★'.repeat(book.rating) : '',
    ratingValue: book.rating,
    owner: ctx.ownerNameOf(book.ownerId),
    isbn: book.isbn13 ?? book.isbn10 ?? '',
    publisher: book.publisher ?? '',
    year: book.publishedYear === null ? '' : String(book.publishedYear),
    pages: book.pageCount === null ? '' : String(book.pageCount),
    loan: describeLoan(ctx.openLoanOf(book.id)),
    notes: book.notes,
  }));
}

function describeLoan(loan: Loan | undefined): string {
  if (!loan) return '';
  const direction = loan.direction === 'out' ? 'verliehen an' : 'geliehen von';
  const due = loan.dueAt ? `, zurück bis ${formatDate(loan.dueAt)}` : '';
  return `${direction} ${loan.personName}${due}`;
}

export function buildExportFilename(
  extension: string,
  base = 'buecherregal',
  now = new Date(),
): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${base}-${yyyy}-${mm}-${dd}.${extension}`;
}
