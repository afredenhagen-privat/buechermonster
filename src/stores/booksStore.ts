import { defineStore } from 'pinia';
import { db } from '@/db/database';
import {
  EMPTY_FILTER,
  filterBooks,
  sortBooks,
  type BookFilter,
  type FilterContext,
  type SortKey,
} from '@/services/filters';
import { authorSortKey, titleSortKey } from '@/services/sortKeys';
import type { Book, BookStatus } from '@/types';
import { useGenresStore } from './genresStore';
import { useLoansStore } from './loansStore';
import { useOwnersStore } from './ownersStore';
import { useSeriesStore } from './seriesStore';

export interface NewBookInput {
  title: string;
  subtitle?: string | null;
  authors?: string[];
  isbn13?: string | null;
  isbn10?: string | null;
  publisher?: string | null;
  publishedYear?: number | null;
  pageCount?: number | null;
  language?: string | null;
  coverDataUrl?: string | null;
  status?: BookStatus;
  rating?: number;
  ownerId?: number | null;
  seriesId?: number | null;
  seriesIndex?: number | null;
  notes?: string;
  genreIds?: number[];
}

export type BookPatch = Partial<Omit<Book, 'id' | 'addedAt' | 'titleSort' | 'authorSort'>>;

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: [] as Book[],
    loaded: false,
    filter: { ...EMPTY_FILTER } as BookFilter,
    sort: 'title' as SortKey,
  }),

  getters: {
    byId:
      (state) =>
      (id: number): Book | undefined =>
        state.books.find((b) => b.id === id),

    /** Für die Dublettenwarnung beim Scannen. */
    byIsbn13:
      (state) =>
      (isbn13: string | null): Book | undefined =>
        isbn13 === null ? undefined : state.books.find((b) => b.isbn13 === isbn13),

    filterContext(): FilterContext {
      const genres = useGenresStore();
      const loans = useLoansStore();
      const series = useSeriesStore();
      return {
        genreIdsOf: (bookId) => genres.genreIdsOf(bookId),
        openLoanOf: (bookId) => loans.openLoanOf(bookId),
        seriesNameOf: (seriesId) => series.nameOf(seriesId),
        now: new Date(),
      };
    },

    /** Was im Regal steht: gefiltert und sortiert, in dieser Reihenfolge. */
    visibleBooks(state): Book[] {
      const ctx = this.filterContext;
      return sortBooks(filterBooks(state.books, state.filter, ctx), state.sort, ctx);
    },

    stats(state) {
      const count = (status: BookStatus) => state.books.filter((b) => b.status === status).length;
      return {
        total: state.books.length,
        unread: count('unread'),
        reading: count('reading'),
        read: count('read'),
      };
    },

    booksOfSeries:
      (state) =>
      (seriesId: number): Book[] =>
        state.books
          .filter((b) => b.seriesId === seriesId)
          .sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0)),

    booksOfOwner:
      (state) =>
      (ownerId: number): number =>
        state.books.filter((b) => b.ownerId === ownerId).length,
  },

  actions: {
    async load() {
      this.books = await db.books.toArray();
      this.loaded = true;
    },

    async create(input: NewBookInput): Promise<Book> {
      const title = input.title.trim();
      if (!title) throw new Error('Ohne Titel geht es nicht.');

      const authors = (input.authors ?? []).map((a) => a.trim()).filter(Boolean);
      const now = new Date().toISOString();
      const status = input.status ?? 'unread';

      const book: Omit<Book, 'id'> = {
        title,
        subtitle: input.subtitle ?? null,
        titleSort: titleSortKey(title),
        authors,
        authorSort: authorSortKey(authors[0]),
        isbn13: input.isbn13 ?? null,
        isbn10: input.isbn10 ?? null,
        publisher: input.publisher ?? null,
        publishedYear: input.publishedYear ?? null,
        pageCount: input.pageCount ?? null,
        language: input.language ?? null,
        coverDataUrl: input.coverDataUrl ?? null,
        status,
        rating: clampRating(input.rating ?? 0),
        ownerId: input.ownerId ?? useOwnersStore().defaultOwnerId,
        seriesId: input.seriesId ?? null,
        seriesIndex: input.seriesIndex ?? null,
        notes: input.notes ?? '',
        addedAt: now,
        updatedAt: now,
        finishedAt: status === 'read' ? now : null,
      };

      const id = await db.books.add(book);
      const created = { id, ...book };
      this.books.push(created);

      if (input.genreIds?.length) {
        await useGenresStore().setBookGenres(id, input.genreIds);
      }
      return created;
    },

    async update(id: number, patch: BookPatch): Promise<Book> {
      const book = this.byId(id);
      if (!book) throw new Error('Dieses Buch gibt es nicht.');

      const safe: Partial<Book> = { ...patch, updatedAt: new Date().toISOString() };

      // Sortierschlüssel hängen an Titel und Autor und müssen mitwandern,
      // sonst steht das Buch nach dem Umbenennen an der alten Stelle.
      if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title) throw new Error('Ohne Titel geht es nicht.');
        safe.title = title;
        safe.titleSort = titleSortKey(title);
      }
      if (patch.authors !== undefined) {
        const authors = patch.authors.map((a) => a.trim()).filter(Boolean);
        safe.authors = authors;
        safe.authorSort = authorSortKey(authors[0]);
      }
      if (patch.rating !== undefined) safe.rating = clampRating(patch.rating);

      await db.books.update(id, safe);
      Object.assign(book, safe);
      return book;
    },

    /**
     * Der Statuswechsel führt das Abschlussdatum mit: "Gelesen" setzt es,
     * ein Zurücksetzen räumt es wieder weg. Sonst steht bei einem als
     * ungelesen markierten Buch ein Lesedatum.
     */
    async setStatus(id: number, status: BookStatus): Promise<void> {
      const book = this.byId(id);
      if (!book) throw new Error('Dieses Buch gibt es nicht.');
      if (book.status === status) return;

      const finishedAt =
        status === 'read' ? (book.finishedAt ?? new Date().toISOString()) : null;
      await this.update(id, { status, finishedAt });
    },

    /** Nochmal auf denselben Stern tippen setzt die Bewertung zurück. */
    async setRating(id: number, rating: number): Promise<void> {
      const book = this.byId(id);
      if (!book) throw new Error('Dieses Buch gibt es nicht.');
      await this.update(id, { rating: book.rating === rating ? 0 : rating });
    },

    async setNotes(id: number, notes: string): Promise<void> {
      const book = this.byId(id);
      if (!book || book.notes === notes) return;
      await this.update(id, { notes });
    },

    /** Reihe per Name setzen; die Reihe wird angelegt, falls es sie noch nicht gibt. */
    async setSeriesByName(
      id: number,
      seriesName: string | null,
      seriesIndex: number | null,
    ): Promise<void> {
      const seriesStore = useSeriesStore();

      if (!seriesName?.trim()) {
        await this.update(id, { seriesId: null, seriesIndex: null });
      } else {
        const series = await seriesStore.findOrCreateByName(seriesName);
        await this.update(id, { seriesId: series.id, seriesIndex });
      }
      await seriesStore.pruneUnused();
    },

    /** IndexedDB kennt keine Fremdschlüssel — Genres und Ausleihen müssen von Hand mit weg. */
    async remove(id: number): Promise<void> {
      const genres = useGenresStore();
      const loans = useLoansStore();
      const series = useSeriesStore();

      await db.transaction('rw', db.books, db.book_genres, db.loans, async () => {
        await db.book_genres.where('bookId').equals(id).delete();
        await db.loans.where('bookId').equals(id).delete();
        await db.books.delete(id);
      });

      this.books = this.books.filter((b) => b.id !== id);
      genres.links = genres.links.filter((l) => l.bookId !== id);
      loans.loans = loans.loans.filter((l) => l.bookId !== id);
      await series.pruneUnused();
    },

    resetFilter() {
      this.filter = { ...EMPTY_FILTER };
    },
  },
});

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}
