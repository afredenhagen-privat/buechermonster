<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import BookCover from '@/components/BookCover.vue';
import { useBarcodeScanner } from '@/composables/useBarcodeScanner';
import { useToast } from '@/composables/useToast';
import { useBooksStore, useGenresStore, useOwnersStore } from '@/stores';
import { InvalidIsbnError, LookupOfflineError, fetchCoverDataUrl, lookupIsbn } from '@/services/bookLookup';
import { mapCategories } from '@/services/genreMapping';
import { parseSeries } from '@/services/seriesParser';
import { isValidIsbn, splitIsbn } from '@/services/isbn';
import { BOOK_STATUSES, STATUS_LABEL, type BookStatus } from '@/types';

const router = useRouter();
const books = useBooksStore();
const genres = useGenresStore();
const owners = useOwnersStore();
const { show, showError } = useToast();

const scanner = useBarcodeScanner();
const videoRef = useTemplateRef<HTMLVideoElement>('video');

const isbnInput = ref('');
const busy = ref(false);
const statusLine = ref('');
const suggestedGenres = ref<string[]>([]);

/* Das Formular ist immer die letzte Instanz — nichts wird ungeprüft gespeichert. */
const form = ref({
  open: false,
  title: '',
  subtitle: '',
  authors: '',
  isbn13: null as string | null,
  isbn10: null as string | null,
  publisher: null as string | null,
  publishedYear: null as number | null,
  pageCount: null as number | null,
  language: null as string | null,
  coverDataUrl: null as string | null,
  status: 'unread' as BookStatus,
  ownerId: null as number | null,
  seriesName: '',
  seriesIndex: '',
  genreIds: [] as number[],
});

const duplicate = computed(() => books.byIsbn13(form.value.isbn13));

async function toggleCamera() {
  if (scanner.running.value) {
    scanner.stop();
    return;
  }
  const video = videoRef.value;
  if (!video) return;

  await scanner.start(video, (code) => {
    scanner.stop();
    isbnInput.value = code;
    void search();
  });
}

onBeforeUnmount(() => scanner.stop());

async function search() {
  const raw = isbnInput.value.trim();
  if (!raw) return;
  if (!isValidIsbn(raw)) {
    showError(new InvalidIsbnError());
    return;
  }

  busy.value = true;
  statusLine.value = 'Buchdatenbanken werden gefragt…';
  suggestedGenres.value = [];

  try {
    const result = await lookupIsbn(raw);

    if (!result) {
      statusLine.value = '';
      prefillManual(raw);
      show('Zu dieser ISBN gibt es keinen Eintrag. Bitte von Hand ausfüllen.');
      return;
    }

    const series = parseSeries(result.title, result.subtitle);
    const mapping = mapCategories(result.categories);
    suggestedGenres.value = mapping.unmatched.slice(0, 3);

    form.value = {
      open: true,
      title: series?.cleanTitle ?? result.title,
      subtitle: result.subtitle ?? '',
      authors: result.authors.join(', '),
      isbn13: result.isbn13,
      isbn10: result.isbn10,
      publisher: result.publisher,
      publishedYear: result.publishedYear,
      pageCount: result.pageCount,
      language: result.language,
      coverDataUrl: null,
      status: 'unread',
      ownerId: owners.defaultOwnerId,
      seriesName: series?.seriesName ?? '',
      seriesIndex: series ? String(series.seriesIndex) : '',
      genreIds: mapping.matched
        .map((name) => genres.byName(name)?.id)
        .filter((id): id is number => id !== undefined),
    };

    statusLine.value = `Gefunden bei ${result.source === 'google' ? 'Google Books' : 'OpenLibrary'}`;

    // Cover im Hintergrund holen — klappt es nicht, bleibt die Farbkachel.
    void fetchCoverDataUrl(result.coverUrl).then((dataUrl) => {
      if (dataUrl && form.value.open) form.value.coverDataUrl = dataUrl;
    });
  } catch (error) {
    statusLine.value = '';
    if (error instanceof LookupOfflineError) {
      prefillManual(raw);
      show('Keine Verbindung zu den Buchdatenbanken. Du kannst trotzdem von Hand erfassen.');
    } else {
      showError(error);
    }
  } finally {
    busy.value = false;
  }
}

function prefillManual(raw?: string) {
  const isbn = raw ? splitIsbn(raw) : { isbn13: null, isbn10: null };
  form.value = {
    open: true,
    title: '',
    subtitle: '',
    authors: '',
    isbn13: isbn.isbn13,
    isbn10: isbn.isbn10,
    publisher: null,
    publishedYear: null,
    pageCount: null,
    language: 'de',
    coverDataUrl: null,
    status: 'unread',
    ownerId: owners.defaultOwnerId,
    seriesName: '',
    seriesIndex: '',
    genreIds: [],
  };
  suggestedGenres.value = [];
  statusLine.value = '';
}

function toggleGenre(id: number) {
  const current = form.value.genreIds;
  form.value.genreIds = current.includes(id)
    ? current.filter((g) => g !== id)
    : [...current, id];
}

async function acceptSuggestion(name: string) {
  try {
    const genre = await genres.create(name);
    form.value.genreIds = [...form.value.genreIds, genre.id];
    suggestedGenres.value = suggestedGenres.value.filter((s) => s !== name);
  } catch (error) {
    showError(error);
  }
}

async function save(openAfterwards: boolean) {
  busy.value = true;
  try {
    const book = await books.create({
      title: form.value.title,
      subtitle: form.value.subtitle || null,
      authors: form.value.authors.split(',').map((a) => a.trim()).filter(Boolean),
      isbn13: form.value.isbn13,
      isbn10: form.value.isbn10,
      publisher: form.value.publisher,
      publishedYear: form.value.publishedYear,
      pageCount: form.value.pageCount,
      language: form.value.language,
      coverDataUrl: form.value.coverDataUrl,
      status: form.value.status,
      ownerId: form.value.ownerId,
      genreIds: form.value.genreIds,
    });

    if (form.value.seriesName.trim()) {
      await books.setSeriesByName(
        book.id,
        form.value.seriesName,
        form.value.seriesIndex.trim() ? Number(form.value.seriesIndex) : null,
      );
    }

    reset();
    if (openAfterwards) {
      await router.push(`/buch/${book.id}`);
    } else {
      show(`"${book.title}" steht jetzt im Regal`);
    }
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function reset() {
  form.value.open = false;
  isbnInput.value = '';
  statusLine.value = '';
  suggestedGenres.value = [];
}
</script>

<template>
  <div class="px-4 pb-8 pt-3">
    <!-- Kamera -->
    <div class="relative mb-3 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
      <video ref="video" class="h-full w-full object-cover" muted playsinline />

      <div v-if="!scanner.running.value" class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <span class="text-4xl" aria-hidden="true">📷</span>
        <p class="px-6 text-xs text-white/70">
          Barcode auf dem Buchrücken scannen — die Kamera braucht eine https-Adresse.
        </p>
      </div>

      <div v-else class="pointer-events-none absolute inset-0">
        <div class="absolute left-[13%] right-[13%] top-[28%] h-[44%] rounded-lg border-2 border-accent" />
        <p class="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
          {{ scanner.engine.value === 'native' ? 'Barcode ins Feld halten' : 'Barcode ins Feld halten (Erkennung nachgeladen)' }}
        </p>
      </div>
    </div>

    <button type="button" class="btn-primary w-full" :disabled="busy" @click="toggleCamera">
      {{ scanner.running.value ? 'Kamera aus' : 'Kamera an und scannen' }}
    </button>
    <p v-if="scanner.error.value" class="mt-2 text-xs text-overdue">{{ scanner.error.value }}</p>

    <!-- ISBN eintippen -->
    <div class="my-4 flex items-center gap-2.5 text-xs text-muted">
      <span class="h-px flex-1 bg-line" />oder ISBN eintippen<span class="h-px flex-1 bg-line" />
    </div>

    <form class="flex gap-2" @submit.prevent="search">
      <input
        v-model="isbnInput"
        class="input"
        inputmode="numeric"
        placeholder="978…"
        aria-label="ISBN"
      />
      <button type="submit" class="btn-primary shrink-0" :disabled="busy">Suchen</button>
    </form>
    <p v-if="statusLine" class="mt-2 text-xs text-muted">{{ statusLine }}</p>

    <div class="my-4 flex items-center gap-2.5 text-xs text-muted">
      <span class="h-px flex-1 bg-line" />oder ohne ISBN<span class="h-px flex-1 bg-line" />
    </div>
    <button type="button" class="btn-ghost w-full" @click="prefillManual()">
      Buch von Hand anlegen
    </button>

    <!-- Formular -->
    <div v-if="form.open" class="mt-6 border-t border-line pt-5">
      <div v-if="duplicate" class="mb-4 rounded-xl bg-overdue/10 p-3 text-xs text-overdue">
        <b>„{{ duplicate.title }}" steht schon im Regal.</b>
        Wenn du es doppelt hast, kannst du es trotzdem anlegen.
      </div>

      <div class="mb-4 flex gap-3.5">
        <BookCover :title="form.title || '?'" :src="form.coverDataUrl" size="lg" />
        <div class="min-w-0 flex-1 space-y-2">
          <input v-model="form.title" class="input font-title font-semibold" placeholder="Titel" aria-label="Titel" />
          <input v-model="form.authors" class="input" placeholder="Autor, weiterer Autor" aria-label="Autoren" />
        </div>
      </div>

      <div class="mb-4 flex gap-2">
        <input
          v-model="form.seriesName"
          class="input flex-[2]"
          placeholder="Reihe (optional)"
          aria-label="Reihe"
        />
        <input
          v-model="form.seriesIndex"
          class="input w-20 flex-none"
          inputmode="numeric"
          placeholder="Bd."
          aria-label="Bandnummer"
        />
      </div>

      <div class="mb-4">
        <span class="label">Genre</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="genre in genres.genres"
            :key="genre.id"
            type="button"
            class="pill"
            :class="{ 'pill-on': form.genreIds.includes(genre.id) }"
            @click="toggleGenre(genre.id)"
          >
            {{ genre.name }}
          </button>
        </div>
        <div v-if="suggestedGenres.length" class="mt-2 flex flex-wrap gap-2">
          <button
            v-for="name in suggestedGenres"
            :key="name"
            type="button"
            class="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent"
            @click="acceptSuggestion(name)"
          >
            + „{{ name }}" als Genre anlegen
          </button>
        </div>
      </div>

      <div class="mb-4">
        <span class="label">Status</span>
        <div class="flex gap-1 rounded-xl bg-surface2 p-1">
          <button
            v-for="status in BOOK_STATUSES"
            :key="status"
            type="button"
            class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
            :class="form.status === status ? 'bg-surface shadow-sm' : 'text-muted'"
            @click="form.status = status"
          >
            {{ STATUS_LABEL[status] }}
          </button>
        </div>
      </div>

      <div class="mb-5">
        <span class="label">Gehört</span>
        <div class="flex gap-1 rounded-xl bg-surface2 p-1">
          <button
            v-for="owner in owners.owners"
            :key="owner.id"
            type="button"
            class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
            :class="form.ownerId === owner.id ? 'bg-surface shadow-sm' : 'text-muted'"
            @click="form.ownerId = owner.id"
          >
            {{ owner.name }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <button type="button" class="btn-primary w-full" :disabled="busy || !form.title.trim()" @click="save(false)">
          Ins Regal stellen und weiter scannen
        </button>
        <button type="button" class="btn-ghost w-full" :disabled="busy || !form.title.trim()" @click="save(true)">
          Ins Regal stellen und öffnen
        </button>
        <button type="button" class="btn-danger w-full" @click="reset">Verwerfen</button>
      </div>
    </div>
  </div>
</template>
