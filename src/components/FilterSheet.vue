<script setup lang="ts">
import BottomSheet from './BottomSheet.vue';
import { useBooksStore, useGenresStore, useOwnersStore, useSeriesStore } from '@/stores';
import { BOOK_STATUSES, STATUS_LABEL, type BookStatus } from '@/types';
import type { LoanFilter } from '@/services/filters';

defineProps<{ modelValue: boolean }>();
defineEmits<{ 'update:modelValue': [boolean] }>();

const books = useBooksStore();
const genres = useGenresStore();
const owners = useOwnersStore();
const series = useSeriesStore();

const LOAN_OPTIONS: { value: LoanFilter; label: string }[] = [
  { value: 'out', label: 'Verliehen' },
  { value: 'in', label: 'Geliehen' },
  { value: 'late', label: 'Überfällig' },
];

function toggleStatus(status: BookStatus) {
  const current = books.filter.statuses;
  books.filter.statuses = current.includes(status)
    ? current.filter((s) => s !== status)
    : [...current, status];
}

function toggleGenre(id: number) {
  const current = books.filter.genreIds;
  books.filter.genreIds = current.includes(id)
    ? current.filter((g) => g !== id)
    : [...current, id];
}

function toggleValue<T>(key: 'minRating' | 'ownerId' | 'seriesId' | 'loan', value: T, empty: T) {
  const filter = books.filter as Record<string, unknown>;
  filter[key] = filter[key] === value ? empty : value;
}
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    title="Filter"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="mb-4">
      <span class="label">Status</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="status in BOOK_STATUSES"
          :key="status"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.statuses.includes(status) }"
          @click="toggleStatus(status)"
        >
          {{ STATUS_LABEL[status] }}
        </button>
      </div>
    </div>

    <div class="mb-4">
      <span class="label">Genre</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="genre in genres.genres"
          :key="genre.id"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.genreIds.includes(genre.id) }"
          @click="toggleGenre(genre.id)"
        >
          {{ genre.name }}
        </button>
      </div>
    </div>

    <div class="mb-4">
      <span class="label">Mindestbewertung</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="stars in [1, 2, 3, 4, 5]"
          :key="stars"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.minRating === stars }"
          @click="toggleValue('minRating', stars, 0)"
        >
          ab {{ stars }} ★
        </button>
      </div>
    </div>

    <div class="mb-4">
      <span class="label">Gehört</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="owner in owners.owners"
          :key="owner.id"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.ownerId === owner.id }"
          @click="toggleValue('ownerId', owner.id, null)"
        >
          {{ owner.name }}
        </button>
      </div>
    </div>

    <div class="mb-4">
      <span class="label">Ausleihe</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in LOAN_OPTIONS"
          :key="option.value"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.loan === option.value }"
          @click="toggleValue('loan', option.value, '')"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="series.series.length" class="mb-4">
      <span class="label">Reihe</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="entry in series.series"
          :key="entry.id"
          type="button"
          class="pill"
          :class="{ 'pill-on': books.filter.seriesId === entry.id }"
          @click="toggleValue('seriesId', entry.id, null)"
        >
          {{ entry.name }}
        </button>
      </div>
    </div>

    <div class="flex gap-2 pt-1">
      <button type="button" class="btn-ghost flex-1" @click="books.resetFilter()">
        Zurücksetzen
      </button>
      <button type="button" class="btn-primary flex-1" @click="$emit('update:modelValue', false)">
        Fertig
      </button>
    </div>
  </BottomSheet>
</template>
