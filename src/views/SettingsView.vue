<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import { useToast } from '@/composables/useToast';
import {
  loadAllStores,
  useBooksStore,
  useGenresStore,
  useLoansStore,
  useOwnersStore,
  useSeriesStore,
  useSettingsStore,
} from '@/stores';
import { downloadBackup, exportBackup, importBackup, readBackupFile } from '@/db/backup';
import { buildExportRows } from '@/services/export/rows';
import { pluralBooks } from '@/services/display';
import type { Genre, Owner } from '@/types';

const books = useBooksStore();
const genres = useGenresStore();
const loans = useLoansStore();
const owners = useOwnersStore();
const series = useSeriesStore();
const settings = useSettingsStore();
const { show, showError } = useToast();

const busy = ref(false);
const exportAll = ref(false);
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const exportCount = computed(() =>
  exportAll.value ? books.stats.total : books.visibleBooks.length,
);

function rowsForExport() {
  // Der Regal-Export nimmt nie Wünsche mit — die haben ihren eigenen Knopf.
  const source = exportAll.value ? books.shelfBooks : books.visibleBooks;
  return buildExportRows(source, {
    genreNamesOf: (id) => genres.genresOf(id).map((g) => g.name),
    seriesNameOf: (id) => series.nameOf(id),
    ownerNameOf: (id) => owners.nameOf(id),
    openLoanOf: (id) => loans.openLoanOf(id),
  });
}

async function runExport(kind: 'pdf' | 'xlsx') {
  if (exportCount.value === 0) {
    show('Es gibt nichts zu exportieren.');
    return;
  }
  busy.value = true;
  try {
    const rows = rowsForExport();
    if (kind === 'pdf') {
      const { exportPdf } = await import('@/services/export/pdf');
      const subtitle = exportAll.value
        ? `${pluralBooks(rows.length)} · ${new Date().toLocaleDateString('de-DE')}`
        : `${pluralBooks(rows.length)} (gefiltert) · ${new Date().toLocaleDateString('de-DE')}`;
      await exportPdf(rows, subtitle);
    } else {
      const { exportXlsx } = await import('@/services/export/xlsx');
      await exportXlsx(rows);
    }
    show(`${kind.toUpperCase()} erzeugt`);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function runBackup() {
  busy.value = true;
  try {
    downloadBackup(await exportBackup());
    await settings.markBackupDone();
    show('Backup gespeichert');
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function onImportFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const confirmed = window.confirm(
    'Ein Import ersetzt den kompletten Bestand — alles, was jetzt im Regal steht, wird überschrieben. Fortfahren?',
  );
  if (!confirmed) {
    if (fileInput.value) fileInput.value.value = '';
    return;
  }

  busy.value = true;
  try {
    await importBackup(await readBackupFile(file));
    // Ohne das Neuladen zeigt die Oberfläche noch den Bestand von vor dem Import.
    await loadAllStores();
    books.resetFilter();
    show('Backup eingespielt');
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

/* --- Genres --- */
const genreSheet = ref<{ open: boolean; genre: Genre | null; name: string; color: string }>({
  open: false,
  genre: null,
  name: '',
  color: '#8d6e63',
});

function editGenre(genre: Genre | null) {
  genreSheet.value = {
    open: true,
    genre,
    name: genre?.name ?? '',
    color: genre?.color ?? '#8d6e63',
  };
}

async function saveGenre() {
  const { genre, name, color } = genreSheet.value;
  try {
    if (genre) await genres.update(genre.id, { name, color });
    else await genres.create(name, color);
    genreSheet.value.open = false;
  } catch (error) {
    showError(error);
  }
}

async function removeGenre() {
  const genre = genreSheet.value.genre;
  if (!genre) return;
  // Hier zählen Wünsche mit: auch sie verlieren das Genre.
  const count = genres.linkCountOf(genre.id);
  const question = count
    ? `"${genre.name}" löschen? Bei ${pluralBooks(count)} fällt das Genre dann weg.`
    : `"${genre.name}" löschen?`;
  if (!window.confirm(question)) return;

  try {
    await genres.remove(genre.id);
    genreSheet.value.open = false;
    show('Genre gelöscht');
  } catch (error) {
    showError(error);
  }
}

/* --- Besitzer --- */
const ownerSheet = ref<{ open: boolean; owner: Owner | null; name: string }>({
  open: false,
  owner: null,
  name: '',
});

function editOwner(owner: Owner | null) {
  ownerSheet.value = { open: true, owner, name: owner?.name ?? '' };
}

async function saveOwner() {
  const { owner, name } = ownerSheet.value;
  try {
    if (owner) await owners.rename(owner.id, name);
    else await owners.create(name);
    ownerSheet.value.open = false;
  } catch (error) {
    showError(error);
  }
}

async function makeDefaultOwner() {
  const owner = ownerSheet.value.owner;
  if (!owner) return;
  try {
    await owners.setDefault(owner.id);
    ownerSheet.value.open = false;
    show(`Neue Bücher gehören jetzt standardmäßig "${owner.name}"`);
  } catch (error) {
    showError(error);
  }
}

async function removeOwner() {
  const owner = ownerSheet.value.owner;
  if (!owner) return;
  if (!window.confirm(`"${owner.name}" löschen?`)) return;
  try {
    await owners.remove(owner.id);
    ownerSheet.value.open = false;
    show('Eintrag gelöscht');
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <div class="px-4 pb-8 pt-3">
    <div
      v-if="settings.backupOverdue"
      class="mb-3 flex items-start gap-2 rounded-xl bg-overdue/10 p-3 text-xs text-overdue"
    >
      <span aria-hidden="true">⚠️</span>
      <span>
        <b>{{ settings.lastBackupAt ? `Letztes Backup vor ${settings.daysSinceBackup} Tagen.` : 'Noch kein Backup gemacht.' }}</b><br />
        Die Daten liegen nur auf diesem Gerät. Geht das Handy verloren, ist das Regal weg.
      </span>
    </div>

    <!-- Export -->
    <div class="card mb-3">
      <h3 class="text-sm font-bold">Export</h3>
      <p class="mb-3 mt-1 text-xs text-muted">
        Läuft komplett auf dem Handy — es geht nichts an einen Dienst raus.
      </p>

      <label class="mb-3 flex items-center gap-2 text-xs text-muted">
        <input v-model="exportAll" type="checkbox" class="h-4 w-4 accent-accent" />
        Alle Bücher statt der gefilterten Auswahl
      </label>

      <p class="mb-3 text-xs">
        Exportiert werden <b>{{ pluralBooks(exportCount) }}</b>.
      </p>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="runExport('pdf')">
          📄 PDF
        </button>
        <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="runExport('xlsx')">
          📊 XLSX
        </button>
        <button type="button" class="btn-primary btn-sm" :disabled="busy" @click="runBackup">
          💾 JSON-Backup
        </button>
      </div>
    </div>

    <!-- Genres -->
    <div class="card mb-3">
      <h3 class="text-sm font-bold">Genres</h3>
      <p class="mb-1 mt-1 text-xs text-muted">Antippen zum Umbenennen oder Einfärben.</p>

      <button
        v-for="genre in genres.genres"
        :key="genre.id"
        type="button"
        class="flex w-full items-center gap-2.5 border-t border-line py-2.5 text-left text-sm"
        @click="editGenre(genre)"
      >
        <span class="h-3 w-3 shrink-0 rounded" :style="{ background: genre.color }" aria-hidden="true" />
        <span class="flex-1">{{ genre.name }}</span>
        <span class="text-xs text-muted">{{ books.shelfCountOfGenre(genre.id) }}</span>
      </button>

      <button type="button" class="btn-ghost btn-sm mt-3" @click="editGenre(null)">+ Genre</button>
    </div>

    <!-- Besitzer -->
    <div class="card mb-3">
      <h3 class="text-sm font-bold">Wem gehören die Bücher?</h3>
      <p class="mb-1 mt-1 text-xs text-muted">
        Nur abweichende Besitzer bekommen im Regal einen Chip.
      </p>

      <button
        v-for="owner in owners.owners"
        :key="owner.id"
        type="button"
        class="flex w-full items-center gap-2.5 border-t border-line py-2.5 text-left text-sm"
        @click="editOwner(owner)"
      >
        <span class="flex-1">{{ owner.name }}</span>
        <span v-if="owner.isDefault" class="chip bg-accent-soft text-accent">Vorbelegt</span>
        <span class="text-xs text-muted">{{ books.booksOfOwner(owner.id) }}</span>
      </button>

      <button type="button" class="btn-ghost btn-sm mt-3" @click="editOwner(null)">+ Name</button>
    </div>

    <!-- Import -->
    <div class="card mb-3">
      <h3 class="text-sm font-bold">Daten wiederherstellen</h3>
      <p class="mb-3 mt-1 text-xs text-muted">
        Ein Import ersetzt den kompletten Bestand, er ergänzt ihn nicht.
      </p>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="onImportFile"
      />
      <button type="button" class="btn-danger btn-sm" :disabled="busy" @click="fileInput?.click()">
        Backup einspielen
      </button>
    </div>

    <p class="py-2 text-center text-[11px] text-muted">
      Büchermonster · alle Daten bleiben auf diesem Gerät
    </p>

    <!-- Genre bearbeiten -->
    <BottomSheet
      v-model="genreSheet.open"
      :title="genreSheet.genre ? 'Genre bearbeiten' : 'Neues Genre'"
    >
      <div class="mb-4">
        <label class="label" for="genre-name">Name</label>
        <input id="genre-name" v-model="genreSheet.name" class="input" @keydown.enter="saveGenre" />
      </div>
      <div class="mb-4">
        <label class="label" for="genre-color">Farbe</label>
        <input id="genre-color" v-model="genreSheet.color" type="color" class="h-11 w-full rounded-lg border border-line bg-surface" />
      </div>
      <div class="flex gap-2">
        <button v-if="genreSheet.genre" type="button" class="btn-danger" @click="removeGenre">
          Löschen
        </button>
        <button type="button" class="btn-ghost flex-1" @click="genreSheet.open = false">Abbrechen</button>
        <button type="button" class="btn-primary flex-1" @click="saveGenre">Speichern</button>
      </div>
    </BottomSheet>

    <!-- Besitzer bearbeiten -->
    <BottomSheet
      v-model="ownerSheet.open"
      :title="ownerSheet.owner ? 'Name bearbeiten' : 'Neuer Name'"
    >
      <div class="mb-4">
        <label class="label" for="owner-name">Name</label>
        <input id="owner-name" v-model="ownerSheet.name" class="input" @keydown.enter="saveOwner" />
      </div>
      <button
        v-if="ownerSheet.owner && !ownerSheet.owner.isDefault"
        type="button"
        class="btn-ghost mb-4 w-full"
        @click="makeDefaultOwner"
      >
        Neue Bücher gehören standardmäßig diesem Namen
      </button>
      <div class="flex gap-2">
        <button v-if="ownerSheet.owner" type="button" class="btn-danger" @click="removeOwner">
          Löschen
        </button>
        <button type="button" class="btn-ghost flex-1" @click="ownerSheet.open = false">Abbrechen</button>
        <button type="button" class="btn-primary flex-1" @click="saveOwner">Speichern</button>
      </div>
    </BottomSheet>
  </div>
</template>
