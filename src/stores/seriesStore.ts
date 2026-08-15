import { defineStore } from 'pinia';
import { db } from '@/db/database';
import { compareGerman } from '@/services/sortKeys';
import type { Series } from '@/types';

export const useSeriesStore = defineStore('series', {
  state: () => ({
    series: [] as Series[],
    loaded: false,
  }),

  getters: {
    byId:
      (state) =>
      (id: number | null): Series | undefined =>
        id === null ? undefined : state.series.find((s) => s.id === id),

    nameOf() {
      return (id: number | null, fallback = ''): string => this.byId(id)?.name ?? fallback;
    },

    byName:
      (state) =>
      (name: string): Series | undefined => {
        const needle = name.trim().toLocaleLowerCase('de');
        return state.series.find((s) => s.name.toLocaleLowerCase('de') === needle);
      },
  },

  actions: {
    async load() {
      this.series = sortSeries(await db.series.toArray());
      this.loaded = true;
    },

    /** Zwei Bücher derselben Reihe sollen auf denselben Eintrag zeigen, egal wie getippt wurde. */
    async findOrCreateByName(name: string): Promise<Series> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Der Reihenname darf nicht leer sein.');

      const existing = this.byName(trimmed);
      if (existing) return existing;

      const id = await db.series.add({ name: trimmed });
      const created = { id, name: trimmed };
      this.series.push(created);
      this.series = sortSeries(this.series);
      return created;
    },

    async rename(id: number, name: string): Promise<void> {
      const series = this.byId(id);
      if (!series) throw new Error('Diese Reihe gibt es nicht.');

      const trimmed = name.trim();
      if (!trimmed) throw new Error('Der Reihenname darf nicht leer sein.');
      const clash = this.byName(trimmed);
      if (clash && clash.id !== id) throw new Error(`Die Reihe "${clash.name}" gibt es schon.`);

      await db.series.update(id, { name: trimmed });
      series.name = trimmed;
      this.series = sortSeries(this.series);
    },

    /**
     * Reihen ohne Bücher aufräumen. Läuft nach jedem Löschen und nach jeder
     * Umsortierung, damit die Filterliste nicht mit Karteileichen zuwächst.
     */
    async pruneUnused(): Promise<number> {
      const used = new Set<number>();
      await db.books.each((book) => {
        if (book.seriesId !== null) used.add(book.seriesId);
      });

      const orphans = this.series.filter((s) => !used.has(s.id));
      if (orphans.length === 0) return 0;

      await db.series.bulkDelete(orphans.map((s) => s.id));
      this.series = this.series.filter((s) => used.has(s.id));
      return orphans.length;
    },
  },
});

function sortSeries(rows: Series[]): Series[] {
  return [...rows].sort((a, b) => compareGerman(a.name, b.name));
}
