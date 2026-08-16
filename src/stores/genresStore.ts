import { defineStore } from 'pinia';
import { db } from '@/db/database';
import { compareGerman } from '@/services/sortKeys';
import type { BookGenre, Genre } from '@/types';

/** Farben für neu angelegte Genres, damit niemand einen Farbwähler bedienen muss. */
const FALLBACK_COLORS = [
  '#8d6e63', '#37474f', '#6a4c93', '#00695c', '#795548', '#ad1457',
  '#ef6c00', '#1565c0', '#558b2f', '#c62828', '#00838f', '#4a148c',
];

export const useGenresStore = defineStore('genres', {
  state: () => ({
    genres: [] as Genre[],
    /** Alle Verknüpfungen im Speicher — bei ein paar hundert Büchern ist das nichts. */
    links: [] as BookGenre[],
    loaded: false,
  }),

  getters: {
    byId:
      (state) =>
      (id: number | null): Genre | undefined =>
        id === null ? undefined : state.genres.find((g) => g.id === id),

    nameOf() {
      return (id: number | null, fallback = ''): string => this.byId(id)?.name ?? fallback;
    },

    byName:
      (state) =>
      (name: string): Genre | undefined => {
        const needle = name.trim().toLocaleLowerCase('de');
        return state.genres.find((g) => g.name.toLocaleLowerCase('de') === needle);
      },

    genreIdsOf:
      (state) =>
      (bookId: number): number[] =>
        state.links.filter((l) => l.bookId === bookId).map((l) => l.genreId),

    genresOf(): (bookId: number) => Genre[] {
      return (bookId: number) =>
        this.genreIdsOf(bookId)
          .map((id) => this.byId(id))
          .filter((g): g is Genre => g !== undefined)
          .sort((a, b) => compareGerman(a.name, b.name));
    },

    /**
     * Alle Verknüpfungen, Regal und Wunschliste zusammen. Gedacht für die
     * Rückfrage vor dem Löschen — dort zählt, wie viele Einträge insgesamt
     * das Genre verlieren. Für die Anzeige des Bestands gibt es
     * `booksStore.shelfCountOfGenre`, das Wünsche weglässt.
     */
    linkCountOf:
      (state) =>
      (genreId: number): number =>
        state.links.filter((l) => l.genreId === genreId).length,
  },

  actions: {
    async load() {
      const [genres, links] = await Promise.all([db.genres.toArray(), db.book_genres.toArray()]);
      this.genres = sortGenres(genres);
      this.links = links;
      this.loaded = true;
    },

    async create(name: string, color?: string): Promise<Genre> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Der Genrename darf nicht leer sein.');
      const clash = this.byName(trimmed);
      if (clash) throw new Error(`Das Genre "${clash.name}" gibt es schon.`);

      const genre = {
        name: trimmed,
        color: color ?? FALLBACK_COLORS[this.genres.length % FALLBACK_COLORS.length]!,
        isDefault: false,
      };
      const id = await db.genres.add(genre);
      const created = { id, ...genre };
      this.genres = sortGenres([...this.genres, created]);
      return created;
    },

    async findOrCreateByName(name: string): Promise<Genre> {
      return this.byName(name) ?? (await this.create(name));
    },

    /** Umbenennen und nicht neu anlegen — sonst verlieren alle Bücher ihre Zuordnung. */
    async update(id: number, patch: { name?: string; color?: string }): Promise<void> {
      const genre = this.byId(id);
      if (!genre) throw new Error('Dieses Genre gibt es nicht.');

      const safe: { name?: string; color?: string } = {};
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        if (!trimmed) throw new Error('Der Genrename darf nicht leer sein.');
        const clash = this.byName(trimmed);
        if (clash && clash.id !== id) throw new Error(`Das Genre "${clash.name}" gibt es schon.`);
        safe.name = trimmed;
      }
      if (patch.color !== undefined) safe.color = patch.color;
      if (Object.keys(safe).length === 0) return;

      await db.genres.update(id, safe);
      Object.assign(genre, safe);
      this.genres = sortGenres(this.genres);
    },

    /** IndexedDB kennt keine Fremdschlüssel, die Verknüpfungen müssen von Hand mit weg. */
    async remove(id: number): Promise<void> {
      await db.transaction('rw', db.genres, db.book_genres, async () => {
        await db.book_genres.where('genreId').equals(id).delete();
        await db.genres.delete(id);
      });
      this.genres = this.genres.filter((g) => g.id !== id);
      this.links = this.links.filter((l) => l.genreId !== id);
    },

    async setBookGenres(bookId: number, genreIds: readonly number[]): Promise<void> {
      const wanted = [...new Set(genreIds)];
      const current = this.genreIdsOf(bookId);
      const toAdd = wanted.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !wanted.includes(id));
      if (toAdd.length === 0 && toRemove.length === 0) return;

      await db.transaction('rw', db.book_genres, async () => {
        for (const genreId of toRemove) {
          await db.book_genres.where({ bookId, genreId }).delete();
        }
        for (const genreId of toAdd) {
          await db.book_genres.add({ bookId, genreId });
        }
      });

      this.links = this.links.filter((l) => l.bookId !== bookId || wanted.includes(l.genreId));
      for (const genreId of toAdd) {
        const row = await db.book_genres.where({ bookId, genreId }).first();
        if (row) this.links.push(row);
      }
    },

    async removeLinksForBook(bookId: number): Promise<void> {
      await db.book_genres.where('bookId').equals(bookId).delete();
      this.links = this.links.filter((l) => l.bookId !== bookId);
    },
  },
});

function sortGenres(rows: Genre[]): Genre[] {
  return [...rows].sort((a, b) => compareGerman(a.name, b.name));
}
