import { defineStore } from 'pinia';
import { db } from '@/db/database';
import { compareGerman } from '@/services/sortKeys';
import type { Owner } from '@/types';

export const useOwnersStore = defineStore('owners', {
  state: () => ({
    owners: [] as Owner[],
    loaded: false,
  }),

  getters: {
    byId:
      (state) =>
      (id: number | null): Owner | undefined =>
        id === null ? undefined : state.owners.find((o) => o.id === id),

    /** Vorbelegung beim Anlegen neuer Bücher. */
    defaultOwnerId(state): number | null {
      return state.owners.find((o) => o.isDefault)?.id ?? state.owners[0]?.id ?? null;
    },

    nameOf() {
      return (id: number | null, fallback = ''): string => this.byId(id)?.name ?? fallback;
    },
  },

  actions: {
    async load() {
      this.owners = sortOwners(await db.owners.toArray());
      this.loaded = true;
    },

    async create(name: string): Promise<Owner> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Der Name darf nicht leer sein.');
      if (this.owners.some((o) => o.name.toLocaleLowerCase('de') === trimmed.toLocaleLowerCase('de'))) {
        throw new Error(`"${trimmed}" gibt es schon.`);
      }

      const owner = { name: trimmed, isDefault: this.owners.length === 0 };
      const id = await db.owners.add(owner);
      const created = { id, ...owner };
      this.owners.push(created);
      this.owners = sortOwners(this.owners);
      return created;
    },

    async rename(id: number, name: string): Promise<void> {
      const owner = this.byId(id);
      if (!owner) throw new Error('Diesen Eintrag gibt es nicht.');

      const trimmed = name.trim();
      if (!trimmed) throw new Error('Der Name darf nicht leer sein.');
      const clash = this.owners.find(
        (o) => o.id !== id && o.name.toLocaleLowerCase('de') === trimmed.toLocaleLowerCase('de'),
      );
      if (clash) throw new Error(`"${clash.name}" gibt es schon.`);

      await db.owners.update(id, { name: trimmed });
      owner.name = trimmed;
      this.owners = sortOwners(this.owners);
    },

    /** Genau ein Eintrag ist die Vorbelegung — der alte verliert sie dabei. */
    async setDefault(id: number): Promise<void> {
      if (!this.byId(id)) throw new Error('Diesen Eintrag gibt es nicht.');

      await db.transaction('rw', db.owners, async () => {
        for (const owner of this.owners) {
          const shouldBeDefault = owner.id === id;
          if (owner.isDefault !== shouldBeDefault) {
            await db.owners.update(owner.id, { isDefault: shouldBeDefault });
          }
        }
      });
      for (const owner of this.owners) owner.isDefault = owner.id === id;
    },

    /**
     * Löschen wird abgelehnt, solange noch Bücher daran hängen. Die Alternative
     * wäre, deren Besitz still zu verlieren — dann steht am Ende bei Adis
     * Büchern niemand mehr dran und keiner weiß, warum.
     */
    async remove(id: number): Promise<void> {
      if (this.owners.length <= 1) throw new Error('Der letzte Eintrag kann nicht weg.');

      const inUse = await db.books.where('ownerId').equals(id).count();
      if (inUse > 0) {
        throw new Error(
          `Daran hängen noch ${inUse} ${inUse === 1 ? 'Buch' : 'Bücher'}. Erst umtragen, dann löschen.`,
        );
      }

      const wasDefault = this.byId(id)?.isDefault ?? false;
      await db.owners.delete(id);
      this.owners = this.owners.filter((o) => o.id !== id);

      if (wasDefault && this.owners[0]) await this.setDefault(this.owners[0].id);
    },
  },
});

function sortOwners(rows: Owner[]): Owner[] {
  // Die Vorbelegung steht oben, der Rest alphabetisch.
  return [...rows].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || compareGerman(a.name, b.name),
  );
}
