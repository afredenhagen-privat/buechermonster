import { defineStore } from 'pinia';
import { db } from '@/db/database';

const LAST_BACKUP = 'lastBackupAt';

/** Ab hier erinnert das Regal ans Backup. */
export const BACKUP_REMINDER_DAYS = 30;

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    values: {} as Record<string, unknown>,
    loaded: false,
  }),

  getters: {
    lastBackupAt(state): string | null {
      const value = state.values[LAST_BACKUP];
      return typeof value === 'string' ? value : null;
    },

    daysSinceBackup(): number | null {
      if (!this.lastBackupAt) return null;
      const then = new Date(this.lastBackupAt).getTime();
      if (Number.isNaN(then)) return null;
      return Math.floor((Date.now() - then) / 86_400_000);
    },

    /**
     * Erinnert auch dann, wenn noch nie ein Backup lief. Die Daten liegen nur
     * auf diesem Gerät — iOS räumt IndexedDB nicht installierter Web-Apps weg,
     * und ein Handywechsel tut es garantiert.
     */
    backupOverdue(): boolean {
      const days = this.daysSinceBackup;
      return days === null || days >= BACKUP_REMINDER_DAYS;
    },
  },

  actions: {
    async load() {
      this.values = Object.fromEntries((await db.settings.toArray()).map((s) => [s.key, s.value]));
      this.loaded = true;
    },

    async set(key: string, value: unknown): Promise<void> {
      await db.settings.put({ key, value });
      this.values[key] = value;
    },

    async markBackupDone(when = new Date()): Promise<void> {
      await this.set(LAST_BACKUP, when.toISOString());
    },
  },
});
