<script setup lang="ts">
import { computed } from 'vue';
import BookCover from '@/components/BookCover.vue';
import { useBooksStore, useLoansStore } from '@/stores';
import { isOverdue } from '@/services/filters';
import { formatDate } from '@/services/display';
import { useToast } from '@/composables/useToast';
import type { Loan } from '@/types';

const books = useBooksStore();
const loans = useLoansStore();
const { show, showError } = useToast();

const now = new Date();
const byOverdueFirst = (a: Loan, b: Loan) =>
  Number(isOverdue(b, now)) - Number(isOverdue(a, now));

const lentOut = computed(() => [...loans.lentOut].sort(byOverdueFirst));
const borrowed = computed(() => [...loans.borrowed].sort(byOverdueFirst));
const overdueCount = computed(() => loans.overdue(now).length);

async function giveBack(loan: Loan) {
  const book = books.byId(loan.bookId);
  const who = loan.direction === 'out' ? `von ${loan.personName} zurück` : `an ${loan.personName} zurück`;
  if (!window.confirm(`"${book?.title ?? 'Das Buch'}" ${who}?`)) return;

  try {
    await loans.giveBack(loan.id);
    show('Als zurückgegeben eingetragen');
  } catch (error) {
    showError(error);
  }
}
</script>

<template>
  <div class="px-4 pb-6 pt-3">
    <div
      v-if="overdueCount"
      class="mb-4 flex items-start gap-2 rounded-xl bg-overdue/10 p-3 text-xs text-overdue"
    >
      <span aria-hidden="true">⏰</span>
      <span>
        <b>{{ overdueCount }} Rückgabe{{ overdueCount > 1 ? 'n' : '' }}</b>
        {{ overdueCount > 1 ? 'sind' : 'ist' }} überfällig.
      </span>
    </div>

    <section v-for="group in [
      { title: 'Ich habe verliehen', rows: lentOut, empty: 'Nichts verliehen.', preposition: 'bei' },
      { title: 'Ich habe geliehen', rows: borrowed, empty: 'Nichts geliehen.', preposition: 'von' },
    ]" :key="group.title" class="mb-6">
      <h2 class="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{{ group.title }}</h2>

      <p v-if="!group.rows.length" class="rounded-xl border border-line bg-surface p-4 text-center text-sm text-muted">
        {{ group.empty }}
      </p>

      <div v-else class="flex flex-col gap-2">
        <div
          v-for="loan in group.rows"
          :key="loan.id"
          class="flex gap-3 rounded-xl border bg-surface p-2.5"
          :class="isOverdue(loan, now) ? 'border-overdue' : 'border-line'"
        >
          <router-link :to="`/buch/${loan.bookId}`" class="flex min-w-0 flex-1 gap-3">
            <BookCover
              :title="books.byId(loan.bookId)?.title ?? '?'"
              :src="books.byId(loan.bookId)?.coverDataUrl"
            />
            <div class="min-w-0 flex-1">
              <div class="font-title text-[15px] font-semibold leading-tight">
                {{ books.byId(loan.bookId)?.title ?? 'Unbekanntes Buch' }}
              </div>
              <div class="mt-0.5 text-[13px] text-muted">
                {{ books.byId(loan.bookId)?.authors.join(', ') }}
              </div>
              <div
                class="mt-1.5 rounded-md px-2 py-1 text-[11.5px]"
                :class="isOverdue(loan, now) ? 'bg-overdue/10 font-semibold text-overdue' : 'bg-surface2 text-muted'"
              >
                {{ isOverdue(loan, now) ? '⏰ überfällig · ' : '' }}{{ group.preposition }}
                <b>{{ loan.personName }}</b> seit {{ formatDate(loan.startedAt) }}
                <template v-if="loan.dueAt"> · bis {{ formatDate(loan.dueAt) }}</template>
              </div>
            </div>
          </router-link>

          <button type="button" class="btn-ghost btn-sm self-center" @click="giveBack(loan)">
            Zurück
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
