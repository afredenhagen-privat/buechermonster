<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BookCover from '@/components/BookCover.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import StarRating from '@/components/StarRating.vue';
import { useBooksStore, useGenresStore, useLoansStore, useOwnersStore, useSeriesStore } from '@/stores';
import { isOverdue } from '@/services/filters';
import { formatDate, fromDateInput } from '@/services/display';
import { useToast } from '@/composables/useToast';
import { BOOK_STATUSES, STATUS_LABEL, type BookStatus, type LoanDirection } from '@/types';

const props = defineProps<{ id: string }>();

const router = useRouter();
const books = useBooksStore();
const genres = useGenresStore();
const loans = useLoansStore();
const owners = useOwnersStore();
const series = useSeriesStore();
const { show, showError } = useToast();

const bookId = computed(() => Number(props.id));
const book = computed(() => books.byId(bookId.value));

const STATUS_CLASS = {
  unread: 'text-unread',
  reading: 'text-reading',
  read: 'text-read',
} as const;

/* --- Buchdaten: direkt im Feld bearbeiten, beim Verlassen speichern ---
   Die Angaben aus der Buchdatenbank sind nicht immer richtig: bei der DNB
   steht der Reihenname manchmal im Titel, Übersetzer landen gelegentlich
   bei den Autoren, und Auflage und Erscheinungsjahr gehen durcheinander.
   Alles davon muss korrigierbar sein, ohne das Buch neu anzulegen. */
const details = ref({
  title: '',
  subtitle: '',
  authors: '',
  publisher: '',
  publishedYear: '',
  pageCount: '',
});

watch(
  book,
  (value) => {
    if (!value) return;
    details.value = {
      title: value.title,
      subtitle: value.subtitle ?? '',
      authors: value.authors.join(', '),
      publisher: value.publisher ?? '',
      publishedYear: value.publishedYear === null ? '' : String(value.publishedYear),
      pageCount: value.pageCount === null ? '' : String(value.pageCount),
    };
  },
  { immediate: true },
);

async function saveDetails() {
  const current = book.value;
  if (!current) return;

  const patch: Record<string, unknown> = {};

  const title = details.value.title.trim();
  if (!title) {
    details.value.title = current.title;
    showError(new Error('Ohne Titel geht es nicht.'));
    return;
  }
  if (title !== current.title) patch.title = title;

  const subtitle = details.value.subtitle.trim() || null;
  if (subtitle !== current.subtitle) patch.subtitle = subtitle;

  const authors = details.value.authors.split(',').map((a) => a.trim()).filter(Boolean);
  if (authors.join('|') !== current.authors.join('|')) patch.authors = authors;

  const publisher = details.value.publisher.trim() || null;
  if (publisher !== current.publisher) patch.publisher = publisher;

  const year = parseYear(details.value.publishedYear);
  if (year === 'ungültig') {
    details.value.publishedYear = current.publishedYear === null ? '' : String(current.publishedYear);
    showError(new Error('Das Erscheinungsjahr sieht nicht nach einer Jahreszahl aus.'));
    return;
  }
  if (year !== current.publishedYear) patch.publishedYear = year;

  const pages = parseCount(details.value.pageCount);
  if (pages !== current.pageCount) patch.pageCount = pages;

  if (Object.keys(patch).length === 0) return;

  try {
    await books.update(current.id, patch);
    show('Gespeichert');
  } catch (error) {
    showError(error);
  }
}

function parseYear(raw: string): number | null | 'ungültig' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  // Gutenberg nach unten, ein bisschen Luft nach oben für Vorabdrucke.
  if (!Number.isInteger(value) || value < 1450 || value > new Date().getFullYear() + 2) {
    return 'ungültig';
  }
  return value;
}

function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/* --- Notizen: lokal tippen, beim Verlassen des Feldes speichern --- */
const notes = ref('');
watch(book, (value) => { notes.value = value?.notes ?? ''; }, { immediate: true });

async function saveNotes() {
  if (!book.value || notes.value === book.value.notes) return;
  try {
    await books.setNotes(book.value.id, notes.value);
    show('Notiz gespeichert');
  } catch (error) {
    showError(error);
  }
}

/* --- Reihe --- */
const seriesName = ref('');
const seriesIndex = ref('');
watch(
  book,
  (value) => {
    seriesName.value = value?.seriesId !== null && value ? series.nameOf(value.seriesId) : '';
    seriesIndex.value = value?.seriesIndex ? String(value.seriesIndex) : '';
  },
  { immediate: true },
);

async function saveSeries() {
  if (!book.value) return;
  try {
    const index = seriesIndex.value.trim() ? Number(seriesIndex.value) : null;
    await books.setSeriesByName(book.value.id, seriesName.value.trim() || null, index);
  } catch (error) {
    showError(error);
  }
}

/* --- Ausleihe --- */
const openLoan = computed(() => (book.value ? loans.openLoanOf(book.value.id) : undefined));
const history = computed(() => (book.value ? loans.historyOf(book.value.id) : []));

const showLendSheet = ref(false);
const lendDirection = ref<LoanDirection>('out');
const lendPerson = ref('');
const lendDue = ref('');

function openLendSheet(direction: LoanDirection) {
  lendDirection.value = direction;
  lendPerson.value = '';
  lendDue.value = '';
  showLendSheet.value = true;
}

async function saveLoan() {
  if (!book.value) return;
  try {
    await loans.lend({
      bookId: book.value.id,
      direction: lendDirection.value,
      personName: lendPerson.value,
      dueAt: fromDateInput(lendDue.value),
    });
    showLendSheet.value = false;
    show(lendDirection.value === 'out' ? 'Als verliehen eingetragen' : 'Als geliehen eingetragen');
  } catch (error) {
    showError(error);
  }
}

async function giveBack() {
  if (!openLoan.value) return;
  try {
    await loans.giveBack(openLoan.value.id);
    show('Als zurückgegeben eingetragen');
  } catch (error) {
    showError(error);
  }
}

/* --- Übrige Aktionen --- */
async function act(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    showError(error);
  }
}

async function toggleGenre(genreId: number) {
  if (!book.value) return;
  const current = genres.genreIdsOf(book.value.id);
  const next = current.includes(genreId)
    ? current.filter((g) => g !== genreId)
    : [...current, genreId];
  await act(() => genres.setBookGenres(book.value!.id, next));
}

async function removeBook() {
  if (!book.value) return;
  if (!window.confirm(`"${book.value.title}" wirklich aus dem Regal löschen?`)) return;
  await act(async () => {
    await books.remove(book.value!.id);
    await router.push('/');
    show('Buch gelöscht');
  });
}
</script>

<template>
  <div v-if="book" class="px-4 pb-8 pt-3">
    <button type="button" class="mb-3.5 flex items-center gap-1.5 text-sm text-muted" @click="router.back()">
      ← Zurück
    </button>

    <div class="mb-4 flex gap-3.5">
      <BookCover :title="book.title" :src="book.coverDataUrl" size="lg" />
      <div class="min-w-0 flex-1">
        <input
          v-model="details.title"
          class="w-full rounded-md bg-transparent font-title text-xl font-bold leading-tight outline-none focus:bg-surface2 focus:px-1.5 focus:py-1"
          aria-label="Titel"
          @blur="saveDetails"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <input
          v-model="details.subtitle"
          class="mt-1 w-full rounded-md bg-transparent text-sm italic text-muted outline-none placeholder-muted/60 focus:bg-surface2 focus:px-1.5 focus:py-1"
          placeholder="Untertitel"
          aria-label="Untertitel"
          @blur="saveDetails"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <input
          v-model="details.authors"
          class="mt-1 w-full rounded-md bg-transparent text-sm text-muted outline-none placeholder-muted/60 focus:bg-surface2 focus:px-1.5 focus:py-1"
          placeholder="Autor, weiterer Autor"
          aria-label="Autoren"
          @blur="saveDetails"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
      </div>
    </div>

    <section class="mb-5">
      <span class="label">Buchdaten</span>
      <div class="grid grid-cols-[1fr_5rem] gap-2">
        <input
          v-model="details.publisher"
          class="input col-span-2"
          placeholder="Verlag"
          aria-label="Verlag"
          @blur="saveDetails"
        />
        <input
          v-model="details.publishedYear"
          class="input"
          inputmode="numeric"
          placeholder="Erscheinungsjahr"
          aria-label="Erscheinungsjahr"
          @blur="saveDetails"
        />
        <input
          v-model="details.pageCount"
          class="input"
          inputmode="numeric"
          placeholder="Seiten"
          aria-label="Seitenzahl"
          @blur="saveDetails"
        />
      </div>
      <p v-if="book.isbn13 || book.isbn10" class="mt-1.5 text-xs text-muted">
        ISBN {{ book.isbn13 ?? book.isbn10 }}
      </p>
    </section>

    <section class="mb-5">
      <span class="label">Status</span>
      <div class="flex gap-1 rounded-xl bg-surface2 p-1">
        <button
          v-for="status in BOOK_STATUSES"
          :key="status"
          type="button"
          class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
          :class="book.status === status ? `bg-surface ${STATUS_CLASS[status]} shadow-sm` : 'text-muted'"
          @click="act(() => books.setStatus(book!.id, status as BookStatus))"
        >
          {{ STATUS_LABEL[status] }}
        </button>
      </div>
      <p v-if="book.finishedAt" class="mt-1.5 text-xs text-muted">
        Gelesen am {{ formatDate(book.finishedAt) }}
      </p>
    </section>

    <section class="mb-5">
      <span class="label">Bewertung</span>
      <StarRating
        :rating="book.rating"
        interactive
        @pick="(stars) => act(() => books.setRating(book!.id, stars))"
      />
    </section>

    <section class="mb-5">
      <span class="label">Genre</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="genre in genres.genres"
          :key="genre.id"
          type="button"
          class="pill"
          :class="{ 'pill-on': genres.genreIdsOf(book.id).includes(genre.id) }"
          @click="toggleGenre(genre.id)"
        >
          {{ genre.name }}
        </button>
      </div>
    </section>

    <section class="mb-5">
      <span class="label">Reihe</span>
      <div class="flex gap-2">
        <input
          v-model="seriesName"
          class="input flex-[2]"
          list="reihen"
          placeholder="Keiner Reihe zugeordnet"
          aria-label="Reihenname"
          @blur="saveSeries"
        />
        <input
          v-model="seriesIndex"
          class="input w-20 flex-none"
          inputmode="numeric"
          placeholder="Bd."
          aria-label="Bandnummer"
          @blur="saveSeries"
        />
      </div>
      <datalist id="reihen">
        <option v-for="entry in series.series" :key="entry.id" :value="entry.name" />
      </datalist>
    </section>

    <section class="mb-5">
      <span class="label">Gehört</span>
      <div class="flex gap-1 rounded-xl bg-surface2 p-1">
        <button
          v-for="owner in owners.owners"
          :key="owner.id"
          type="button"
          class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
          :class="book.ownerId === owner.id ? 'bg-surface shadow-sm' : 'text-muted'"
          @click="act(() => books.update(book!.id, { ownerId: owner.id }))"
        >
          {{ owner.name }}
        </button>
      </div>
    </section>

    <section class="mb-5">
      <span class="label">Ausleihe</span>

      <div
        v-if="openLoan"
        class="rounded-xl border p-3"
        :class="isOverdue(openLoan, new Date()) ? 'border-overdue bg-overdue/10' : 'border-accent bg-accent-soft'"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold">
              {{ openLoan.direction === 'out' ? 'Verliehen an' : 'Geliehen von' }}
              {{ openLoan.personName }}
            </div>
            <div class="mt-0.5 text-xs text-muted">
              seit {{ formatDate(openLoan.startedAt) }}
              <template v-if="openLoan.dueAt"> · zurück bis {{ formatDate(openLoan.dueAt) }}</template>
              <template v-else> · kein Termin</template>
              <template v-if="isOverdue(openLoan, new Date())"> · überfällig</template>
            </div>
          </div>
          <button type="button" class="btn-primary btn-sm" @click="giveBack">Zurück</button>
        </div>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <button type="button" class="pill" @click="openLendSheet('out')">Verleihen</button>
        <button type="button" class="pill" @click="openLendSheet('in')">Als geliehen eintragen</button>
      </div>

      <div v-if="history.length" class="mt-2.5">
        <div v-for="entry in history" :key="entry.id" class="border-t border-line py-1.5 text-xs text-muted">
          {{ entry.direction === 'out' ? 'an' : 'von' }} {{ entry.personName }} ·
          {{ formatDate(entry.startedAt) }} – {{ formatDate(entry.returnedAt) }}
        </div>
      </div>
    </section>

    <section class="mb-6">
      <span class="label">Notizen</span>
      <textarea
        v-model="notes"
        class="input min-h-32 resize-y leading-relaxed"
        placeholder="Was dir zu dem Buch einfällt…"
        aria-label="Notizen zum Buch"
        @blur="saveNotes"
      />
    </section>

    <button type="button" class="btn-danger w-full" @click="removeBook">
      Buch aus dem Regal löschen
    </button>

    <BottomSheet
      v-model="showLendSheet"
      :title="lendDirection === 'out' ? 'An wen verliehen?' : 'Von wem geliehen?'"
    >
      <div class="mb-4">
        <label class="label" for="lend-person">Name</label>
        <input id="lend-person" v-model="lendPerson" class="input" placeholder="z. B. Jonas" />
      </div>
      <div class="mb-4">
        <label class="label" for="lend-due">Zurück bis (optional)</label>
        <input id="lend-due" v-model="lendDue" type="date" class="input" />
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-ghost flex-1" @click="showLendSheet = false">Abbrechen</button>
        <button type="button" class="btn-primary flex-1" @click="saveLoan">Eintragen</button>
      </div>
    </BottomSheet>
  </div>

  <div v-else class="px-4 py-14 text-center text-muted">
    <p class="mb-4">Dieses Buch gibt es nicht (mehr).</p>
    <router-link to="/" class="btn-ghost">Zurück ins Regal</router-link>
  </div>
</template>
