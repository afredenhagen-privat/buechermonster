<script setup lang="ts">
import { computed, ref } from 'vue';
import BookRow from '@/components/BookRow.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import ScanButton from '@/components/ScanButton.vue';
import { useBooksStore, useGenresStore, useLoansStore, useOwnersStore, useSeriesStore } from '@/stores';
import { SORT_OPTIONS, type SortKey } from '@/services/filters';
import { buildExportRows } from '@/services/export/rows';
import { pluralBooks } from '@/services/display';
import { useToast } from '@/composables/useToast';

const books = useBooksStore();
const genres = useGenresStore();
const loans = useLoansStore();
const owners = useOwnersStore();
const series = useSeriesStore();
const { show, showError } = useToast();

const showSort = ref(false);
const busy = ref(false);

const sortLabel = computed(() => SORT_OPTIONS.find((o) => o.key === books.wishSort)?.label ?? '');

function pickSort(key: SortKey) {
  books.wishSort = key;
  showSort.value = false;
}

/**
 * Exportiert immer die gesamte Wunschliste, nicht nur das gerade Gesuchte.
 * Wer die Liste verschickt, will sie vollständig — eine halbe Wunschliste
 * wäre ein stiller Fehler.
 */
async function runExport(kind: 'pdf' | 'xlsx') {
  if (books.wishBooks.length === 0) {
    show('Die Wunschliste ist leer.');
    return;
  }

  busy.value = true;
  try {
    const rows = buildExportRows(books.wishBooks, {
      genreNamesOf: (id) => genres.genresOf(id).map((g) => g.name),
      seriesNameOf: (id) => series.nameOf(id),
      ownerNameOf: (id) => owners.nameOf(id),
      openLoanOf: (id) => loans.openLoanOf(id),
    });

    if (kind === 'pdf') {
      const { exportPdf } = await import('@/services/export/pdf');
      await exportPdf(
        rows,
        `${pluralBooks(rows.length)} · Stand ${new Date().toLocaleDateString('de-DE')}`,
        'wish',
      );
    } else {
      const { exportXlsx } = await import('@/services/export/xlsx');
      await exportXlsx(rows, 'wish');
    }
    show(`${kind.toUpperCase()} erzeugt`);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- pb-28 hält die letzte Zeile frei vom schwebenden Scan-Knopf. -->
  <div class="px-4 pb-28 pt-3">
    <div class="mb-3 flex gap-2">
      <div class="relative flex-1">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">
          🔍
        </span>
        <input
          v-model="books.wishFilter.query"
          type="search"
          class="input pl-8"
          placeholder="Titel, Autor, Reihe, Notiz…"
          autocomplete="off"
          aria-label="In der Wunschliste suchen"
        />
      </div>
      <button
        type="button"
        class="w-10 shrink-0 rounded-lg border border-line bg-surface text-lg"
        aria-label="Sortierung"
        @click="showSort = true"
      >
        ↕
      </button>
    </div>

    <div v-if="books.wishBooks.length" class="mb-3 flex flex-wrap items-center gap-2">
      <span class="mr-auto text-xs text-muted">
        <template v-if="books.wishFilter.query.trim()">
          {{ pluralBooks(books.visibleWishes.length) }} von {{ books.wishBooks.length }}
        </template>
        <template v-else>
          {{ pluralBooks(books.wishBooks.length) }} · sortiert nach {{ sortLabel.toLowerCase() }}
        </template>
      </span>
      <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="runExport('pdf')">
        📄 PDF
      </button>
      <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="runExport('xlsx')">
        📊 XLSX
      </button>
    </div>

    <p v-if="books.wishBooks.length" class="mb-3 text-xs text-muted">
      Der Export enthält die ISBN, damit derjenige, der dir etwas schenkt, die richtige Ausgabe findet.
    </p>

    <div v-if="books.visibleWishes.length" class="flex flex-col gap-2">
      <BookRow v-for="book in books.visibleWishes" :key="book.id" :book="book" />
    </div>

    <div v-else-if="books.wishBooks.length === 0" class="py-14 text-center text-muted">
      <div class="mb-3 text-4xl" aria-hidden="true">⭐</div>
      <p class="mb-1">Noch keine Wünsche.</p>
      <p class="mx-auto max-w-xs text-xs">
        Scanne ein Buch, das du dir wünschst — die Liste kannst du dann als PDF verschicken, wenn dich
        jemand fragt.
      </p>
    </div>

    <div v-else class="py-14 text-center text-muted">
      <div class="mb-3 text-4xl" aria-hidden="true">🔍</div>
      <p class="mb-4">Kein Wunsch passt zu dieser Suche.</p>
      <button type="button" class="btn-ghost" @click="books.resetWishFilter()">
        Suche zurücksetzen
      </button>
    </div>

    <ScanButton wish />

    <BottomSheet v-model="showSort" title="Sortieren nach">
      <div class="flex flex-col gap-2">
        <button
          v-for="option in SORT_OPTIONS"
          :key="option.key"
          type="button"
          class="pill text-left"
          :class="{ 'pill-on': books.wishSort === option.key }"
          @click="pickSort(option.key)"
        >
          {{ option.label }}
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
