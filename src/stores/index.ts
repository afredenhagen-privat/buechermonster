import { useBooksStore } from './booksStore';
import { useGenresStore } from './genresStore';
import { useLoansStore } from './loansStore';
import { useOwnersStore } from './ownersStore';
import { useSeriesStore } from './seriesStore';
import { useSettingsStore } from './settingsStore';

/**
 * Nach dem Start und nach jedem Backup-Import müssen alle Stores neu lesen —
 * sonst zeigt die Oberfläche noch den Bestand von vor dem Import.
 */
export async function loadAllStores(): Promise<void> {
  await Promise.all([
    useOwnersStore().load(),
    useGenresStore().load(),
    useSeriesStore().load(),
    useLoansStore().load(),
    useBooksStore().load(),
    useSettingsStore().load(),
  ]);
}

export { useBooksStore, useGenresStore, useLoansStore, useOwnersStore, useSeriesStore, useSettingsStore };
