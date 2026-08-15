<script setup lang="ts">
import { computed } from 'vue';
import BookCover from './BookCover.vue';
import StarRating from './StarRating.vue';
import { useGenresStore, useLoansStore, useOwnersStore, useSeriesStore } from '@/stores';
import { isOverdue } from '@/services/filters';
import { formatDate } from '@/services/display';
import { STATUS_LABEL, type Book } from '@/types';

const props = defineProps<{ book: Book }>();

const genres = useGenresStore();
const loans = useLoansStore();
const owners = useOwnersStore();
const series = useSeriesStore();

const STATUS_CLASS = {
  unread: 'text-unread',
  reading: 'text-reading',
  read: 'text-read',
} as const;

const seriesLine = computed(() => {
  if (props.book.seriesId === null) return '';
  const name = series.nameOf(props.book.seriesId);
  return props.book.seriesIndex ? `${name} · Band ${props.book.seriesIndex}` : name;
});

/** Nur abweichende Besitzer bekommen einen Chip — sonst stünde das an fast jedem Buch. */
const foreignOwner = computed(() => {
  const { ownerId } = props.book;
  if (ownerId === null || ownerId === owners.defaultOwnerId) return '';
  return owners.nameOf(ownerId);
});

const loan = computed(() => loans.openLoanOf(props.book.id));
const late = computed(() => isOverdue(loan.value, new Date()));

const loanLine = computed(() => {
  const current = loan.value;
  if (!current) return '';
  const direction = current.direction === 'out' ? 'Verliehen an' : 'Geliehen von';
  const due = current.dueAt ? ` · zurück bis ${formatDate(current.dueAt)}` : '';
  return `${direction} ${current.personName}${due}`;
});
</script>

<template>
  <router-link
    :to="`/buch/${book.id}`"
    class="flex w-full gap-3 rounded-xl border border-line bg-surface p-2.5 text-left transition active:scale-[0.985]"
  >
    <BookCover :title="book.title" :src="book.coverDataUrl" />

    <div class="min-w-0 flex-1">
      <div class="font-title text-[15px] font-semibold leading-tight">{{ book.title }}</div>
      <div class="mt-0.5 text-[13px] text-muted">
        {{ book.authors.join(', ') || 'Ohne Autor' }}
        <template v-if="book.publishedYear"> · {{ book.publishedYear }}</template>
      </div>
      <div v-if="seriesLine" class="mt-0.5 text-xs italic text-muted">{{ seriesLine }}</div>

      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="flex items-center gap-1 text-[11.5px] font-semibold" :class="STATUS_CLASS[book.status]">
          <span class="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
          {{ STATUS_LABEL[book.status] }}
        </span>
        <StarRating v-if="book.rating" :rating="book.rating" />
        <!-- Blass und nur umrandet: der Besitzer ist eine Randnotiz, und die
             Umrandung hält ihn trotzdem von den gefüllten Genre-Chips getrennt. -->
        <span v-if="foreignOwner" class="chip border border-line bg-transparent">
          Buch von {{ foreignOwner }}
        </span>
        <span v-for="genre in genres.genresOf(book.id)" :key="genre.id" class="chip">
          {{ genre.name }}
        </span>
      </div>

      <div
        v-if="loanLine"
        class="mt-1.5 rounded-md px-2 py-1 text-[11.5px]"
        :class="late ? 'bg-overdue/10 font-semibold text-overdue' : 'bg-surface2 text-muted'"
      >
        {{ late ? '⏰ ' : '' }}{{ loanLine }}
      </div>
    </div>
  </router-link>
</template>
