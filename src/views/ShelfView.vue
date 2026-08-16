<script setup lang="ts">
import { computed, ref } from 'vue';
import BookRow from '@/components/BookRow.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import FilterSheet from '@/components/FilterSheet.vue';
import ScanButton from '@/components/ScanButton.vue';
import { useBooksStore, useGenresStore, useOwnersStore, useSeriesStore, useSettingsStore } from '@/stores';
import { SORT_OPTIONS, countActiveFilters, type SortKey } from '@/services/filters';
import { pluralBooks } from '@/services/display';
import { STATUS_LABEL } from '@/types';

const books = useBooksStore();
const genres = useGenresStore();
const owners = useOwnersStore();
const series = useSeriesStore();
const settings = useSettingsStore();

const showFilter = ref(false);
const showSort = ref(false);

const activeCount = computed(() => countActiveFilters(books.filter));
const sortLabel = computed(
  () => SORT_OPTIONS.find((o) => o.key === books.sort)?.label ?? '',
);

/** Jeder gesetzte Filter als einzeln wegtippbarer Chip. */
const activeChips = computed(() => {
  const chips: { label: string; clear: () => void }[] = [];
  const f = books.filter;

  if (f.query.trim()) chips.push({ label: `„${f.query.trim()}"`, clear: () => (f.query = '') });
  for (const status of f.statuses) {
    chips.push({
      label: STATUS_LABEL[status],
      clear: () => (f.statuses = f.statuses.filter((s) => s !== status)),
    });
  }
  for (const id of f.genreIds) {
    chips.push({
      label: genres.nameOf(id),
      clear: () => (f.genreIds = f.genreIds.filter((g) => g !== id)),
    });
  }
  if (f.minRating) chips.push({ label: `ab ${f.minRating} ★`, clear: () => (f.minRating = 0) });
  if (f.ownerId !== null) {
    chips.push({ label: owners.nameOf(f.ownerId), clear: () => (f.ownerId = null) });
  }
  if (f.seriesId !== null) {
    chips.push({ label: series.nameOf(f.seriesId), clear: () => (f.seriesId = null) });
  }
  if (f.loan) {
    const labels = { out: 'Verliehen', in: 'Geliehen', late: 'Überfällig' } as const;
    chips.push({ label: labels[f.loan], clear: () => (f.loan = '') });
  }
  return chips;
});

function pickSort(key: SortKey) {
  books.sort = key;
  showSort.value = false;
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
          v-model="books.filter.query"
          type="search"
          class="input pl-8"
          placeholder="Titel, Autor, Reihe, Notiz…"
          autocomplete="off"
          aria-label="Im Regal suchen"
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
      <button
        type="button"
        class="relative w-10 shrink-0 rounded-lg border bg-surface text-lg"
        :class="activeCount ? 'border-accent bg-accent-soft text-accent' : 'border-line'"
        aria-label="Filter"
        @click="showFilter = true"
      >
        ⚙
        <span
          v-if="activeCount"
          class="absolute right-1 top-1 h-[7px] w-[7px] rounded-full bg-accent"
          aria-hidden="true"
        />
      </button>
    </div>

    <div v-if="activeChips.length" class="mb-2.5 flex flex-wrap gap-1.5">
      <button
        v-for="chip in activeChips"
        :key="chip.label"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent"
        @click="chip.clear()"
      >
        {{ chip.label }}
        <span aria-hidden="true" class="opacity-60">✕</span>
      </button>
    </div>

    <router-link
      v-if="settings.backupOverdue && books.stats.total > 0"
      to="/einstellungen"
      class="mb-3 flex items-start gap-2 rounded-xl bg-overdue/10 p-2.5 text-xs text-overdue"
    >
      <span aria-hidden="true">💾</span>
      <span>
        <b>{{ settings.lastBackupAt ? `Letztes Backup vor ${settings.daysSinceBackup} Tagen.` : 'Noch kein Backup gemacht.' }}</b>
        Die Daten liegen nur auf diesem Gerät.
      </span>
    </router-link>

    <p class="mb-2.5 text-xs text-muted">
      <template v-if="activeCount">
        {{ pluralBooks(books.visibleBooks.length) }} von {{ books.stats.total }}
      </template>
      <template v-else>
        {{ pluralBooks(books.stats.total) }} · sortiert nach {{ sortLabel.toLowerCase() }}
      </template>
    </p>

    <div v-if="books.visibleBooks.length" class="flex flex-col gap-2">
      <BookRow v-for="book in books.visibleBooks" :key="book.id" :book="book" />
    </div>

    <div v-else-if="books.stats.total === 0" class="py-14 text-center text-muted">
      <div class="mb-3 text-4xl" aria-hidden="true">🐉</div>
      <p class="mb-4">Das Regal ist noch leer.</p>
      <router-link to="/hinzufuegen" class="btn-primary">Erstes Buch erfassen</router-link>
    </div>

    <div v-else class="py-14 text-center text-muted">
      <div class="mb-3 text-4xl" aria-hidden="true">🔍</div>
      <p class="mb-4">Kein Buch passt zu diesem Filter.</p>
      <button type="button" class="btn-ghost" @click="books.resetFilter()">
        Filter zurücksetzen
      </button>
    </div>

    <ScanButton />

    <FilterSheet v-model="showFilter" />

    <BottomSheet v-model="showSort" title="Sortieren nach">
      <div class="flex flex-col gap-2">
        <button
          v-for="option in SORT_OPTIONS"
          :key="option.key"
          type="button"
          class="pill text-left"
          :class="{ 'pill-on': books.sort === option.key }"
          @click="pickSort(option.key)"
        >
          {{ option.label }}
        </button>
      </div>
    </BottomSheet>
  </div>
</template>
