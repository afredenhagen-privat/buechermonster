<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BookCover from '@/components/BookCover.vue';
import { useBarcodeScanner } from '@/composables/useBarcodeScanner';
import { useToast } from '@/composables/useToast';
import { useBooksStore, useGenresStore, useOwnersStore } from '@/stores';
import {
  InvalidIsbnError,
  LookupOfflineError,
  coverUrlForIsbn,
  fetchCoverDataUrl,
  lookupIsbn,
} from '@/services/bookLookup';
import { decodeImageFile } from '@/services/barcodeDecoder';
import { mapCategories } from '@/services/genreMapping';
import { parseSeries } from '@/services/seriesParser';
import { isBookBarcode, isValidIsbn, splitIsbn, toIsbn13 } from '@/services/isbn';
import {
  BOOK_STATUSES,
  SOURCE_LABEL,
  STATUS_LABEL,
  type BookPlace,
  type BookStatus,
} from '@/types';

const route = useRoute();
const router = useRouter();
const books = useBooksStore();
const genres = useGenresStore();
const owners = useOwnersStore();
const { show, showError } = useToast();

const scanner = useBarcodeScanner();
const videoRef = useTemplateRef<HTMLVideoElement>('video');
const photoInput = useTemplateRef<HTMLInputElement>('photoInput');

const isbnInput = ref('');
const busy = ref(false);
const statusLine = ref('');
const suggestedGenres = ref<string[]>([]);
const showDiagnostics = ref(false);

/**
 * Vorbelegung aus dem Scan-Knopf: aus dem Regal heraus landet das Buch im
 * Regal, aus der Wunschliste heraus auf der Wunschliste. Bleibt über mehrere
 * Erfassungen hinweg stehen, damit man eine ganze Wunschliste am Stück
 * scannen kann.
 */
const targetPlace = ref<BookPlace>(route.query.wunsch === '1' ? 'wish' : 'shelf');

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
  place: 'shelf' as BookPlace,
  seriesName: '',
  seriesIndex: '',
  genreIds: [] as number[],
});

/**
 * Greift schon beim Tippen und direkt nach dem Scan, nicht erst nach dem
 * Netzabruf — die ISBN kennen wir sofort, also kann die Meldung sofort kommen
 * statt nach zwei Sekunden Wartezeit.
 */
const duplicate = computed(() => {
  const typed = isbnInput.value.trim();
  const candidate = form.value.isbn13 ?? (isValidIsbn(typed) ? toIsbn13(typed) : null);
  return books.byIsbn13(candidate);
});

/* ---------------- Kamera ---------------- */

async function toggleCamera() {
  if (scanner.running.value) {
    scanner.stop();
    return;
  }
  const video = videoRef.value;
  if (!video) return;
  await scanner.start(video, onCode);
}

async function switchCamera(deviceId: string) {
  const video = videoRef.value;
  if (!video) return;
  await scanner.start(video, onCode, deviceId);
}

/** Antippen des Bildes stellt neu scharf — wie in der Kamera-App. */
async function tapToFocus(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  await scanner.refocus((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
}

function onCode(code: string) {
  scanner.stop();
  isbnInput.value = code;

  // Ein EAN-13 von einer Shampooflasche hat dieselbe Prüfziffernrechnung wie
  // eine ISBN — ohne diese Unterscheidung liefe die Suche ins Leere, und die
  // Meldung wäre "nicht gefunden" statt "das ist kein Buch".
  if (!isBookBarcode(code)) {
    show(`${code} ist kein Buch-Barcode. Buch-Codes fangen mit 978 oder 979 an.`);
    return;
  }
  void search();
}

onBeforeUnmount(() => scanner.stop());

/* ---------------- Foto statt Live-Bild ---------------- */

/**
 * Der zuverlässigste Weg auf den meisten Handys: die Kamera-App des Systems
 * macht das Foto und stellt dabei selbst scharf — mit Autofokus, Makro und
 * allem, was der Browser über getUserMedia nur eingeschränkt steuern kann.
 * Ausgewertet wird das fertige Standbild.
 */
async function onPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  busy.value = true;
  statusLine.value = 'Foto wird ausgewertet…';
  try {
    const code = await decodeImageFile(file);
    if (!code) {
      statusLine.value = '';
      show('Auf dem Foto war kein Barcode zu erkennen. Näher ran und nochmal, oder ISBN eintippen.');
      return;
    }
    onCode(code);
  } catch {
    statusLine.value = '';
    show('Das Foto ließ sich nicht auswerten.');
  } finally {
    busy.value = false;
    if (photoInput.value) photoInput.value.value = '';
  }
}

/* ---------------- Suche ---------------- */

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
      place: targetPlace.value,
      seriesName: series?.seriesName ?? '',
      seriesIndex: series ? String(series.seriesIndex) : '',
      genreIds: mapping.matched
        .map((name) => genres.byName(name)?.id)
        .filter((id): id is number => id !== undefined),
    };

    statusLine.value = `Gefunden bei ${SOURCE_LABEL[result.source]}`;

    // Cover im Hintergrund holen — klappt es nicht, bleibt die Farbkachel.
    // Die DNB gibt keine Bilder heraus, dafür springt OpenLibrary ein.
    const coverUrl = result.coverUrl ?? coverUrlForIsbn(result.isbn13);
    void fetchCoverDataUrl(coverUrl).then((dataUrl) => {
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
    place: targetPlace.value,
    seriesName: '',
    seriesIndex: '',
    genreIds: [],
  };
  suggestedGenres.value = [];
  statusLine.value = '';
}

function toggleGenre(id: number) {
  const current = form.value.genreIds;
  form.value.genreIds = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
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
      place: form.value.place,
      genreIds: form.value.genreIds,
    });

    if (form.value.seriesName.trim()) {
      await books.setSeriesByName(
        book.id,
        form.value.seriesName,
        form.value.seriesIndex.trim() ? Number(form.value.seriesIndex) : null,
      );
    }

    const wasWish = form.value.place === 'wish';
    reset();
    if (openAfterwards) {
      await router.push(`/buch/${book.id}`);
    } else {
      show(
        wasWish
          ? `"${book.title}" steht auf deiner Wunschliste`
          : `"${book.title}" steht jetzt im Regal`,
      );
    }
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function setTarget(place: BookPlace) {
  targetPlace.value = place;
  if (form.value.open) form.value.place = place;
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
    <!-- Steht ganz oben, damit vor dem Scannen klar ist, wo das Buch landet. -->
    <div class="mb-3">
      <span class="label">Wohin damit?</span>
      <div class="flex gap-1 rounded-xl bg-surface2 p-1">
        <button
          type="button"
          class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
          :class="targetPlace === 'shelf' ? 'bg-surface shadow-sm' : 'text-muted'"
          @click="setTarget('shelf')"
        >
          📚 Ins Regal
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg py-2 text-[13px] font-semibold transition"
          :class="targetPlace === 'wish' ? 'bg-surface text-accent shadow-sm' : 'text-muted'"
          @click="setTarget('wish')"
        >
          ⭐ Auf die Wunschliste
        </button>
      </div>
    </div>

    <!-- Sobald die ISBN bekannt ist, also direkt nach dem Scan und noch vor
         dem Netzabruf. Anklickbar, sonst wüsste man von dem Fund und käme
         trotzdem nicht hin. -->
    <router-link
      v-if="duplicate"
      :to="`/buch/${duplicate.id}`"
      class="mb-3 flex items-start gap-2 rounded-xl border border-accent bg-accent-soft p-3 text-xs"
    >
      <span aria-hidden="true">💡</span>
      <span class="flex-1">
        <b>„{{ duplicate.title }}"</b>
        {{ duplicate.place === 'wish' ? 'steht schon auf deiner Wunschliste.' : 'steht schon in deinem Regal.' }}
        Antippen zum Anschauen — anlegen kannst du es trotzdem.
      </span>
      <span class="text-muted" aria-hidden="true">›</span>
    </router-link>

    <!-- Kamera -->
    <div class="relative mb-3 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
      <video
        ref="video"
        class="h-full w-full object-cover"
        muted
        playsinline
        @click="tapToFocus"
      />

      <div
        v-if="!scanner.running.value"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
      >
        <span class="text-4xl" aria-hidden="true">📷</span>
        <p class="px-6 text-xs text-white/70">
          Barcode auf dem Buchrücken scannen — die Kamera braucht eine https-Adresse.
        </p>
      </div>

      <template v-else>
        <div class="pointer-events-none absolute inset-0">
          <div class="absolute left-[13%] right-[13%] top-[28%] h-[44%] rounded-lg border-2 border-accent" />
          <p class="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
            Zum Scharfstellen aufs Bild tippen
          </p>
        </div>

        <button
          v-if="scanner.torchAvailable.value"
          type="button"
          class="absolute right-3 top-3 rounded-full px-3 py-1.5 text-sm"
          :class="scanner.torchOn.value ? 'bg-star text-black' : 'bg-black/60 text-white'"
          :aria-label="scanner.torchOn.value ? 'Licht aus' : 'Licht an'"
          @click.stop="scanner.toggleTorch()"
        >
          💡
        </button>
      </template>
    </div>

    <!-- Zoom: hilft mehr als näher rangehen, weil Handys unter 10 cm nicht scharfstellen -->
    <div v-if="scanner.running.value && scanner.zoomAvailable.value" class="mb-3">
      <label class="mb-1 block text-xs text-muted" for="zoom">
        Zoom — weiter weg halten und heranzoomen wird schärfer als nah ran
      </label>
      <input
        id="zoom"
        type="range"
        class="w-full accent-accent"
        :min="scanner.zoomRange.value.min"
        :max="scanner.zoomRange.value.max"
        :step="scanner.zoomRange.value.step"
        :value="scanner.zoom.value"
        @input="scanner.setZoom(Number(($event.target as HTMLInputElement).value))"
      />
    </div>

    <button type="button" class="btn-primary w-full" :disabled="busy" @click="toggleCamera">
      {{ scanner.running.value ? 'Kamera aus' : 'Kamera an und scannen' }}
    </button>

    <!-- Objektivwahl: Chrome erwischt oft eine Linse mit Fixfokus -->
    <div v-if="scanner.running.value && scanner.cameras.value.length > 1" class="mt-2">
      <label class="mb-1 block text-xs text-muted" for="kamera">
        Falls es nicht scharf wird: andere Linse probieren
      </label>
      <select
        id="kamera"
        class="input"
        :value="scanner.activeCameraId.value ?? ''"
        @change="switchCamera(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="cam in scanner.cameras.value" :key="cam.deviceId" :value="cam.deviceId">
          {{ cam.label }}
        </option>
      </select>
    </div>

    <p v-if="scanner.error.value" class="mt-2 text-xs text-overdue">{{ scanner.error.value }}</p>
    <p v-else-if="scanner.focusWarning.value" class="mt-2 text-xs text-overdue">
      {{ scanner.focusWarning.value }}
    </p>

    <!-- Foto über die Kamera-App -->
    <div class="my-4 flex items-center gap-2.5 text-xs text-muted">
      <span class="h-px flex-1 bg-line" />oder ein Foto machen<span class="h-px flex-1 bg-line" />
    </div>

    <input
      ref="photoInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="onPhoto"
    />
    <button type="button" class="btn-ghost w-full" :disabled="busy" @click="photoInput?.click()">
      📸 Foto vom Barcode machen
    </button>
    <p class="mt-1.5 text-xs text-muted">
      Öffnet die Kamera-App deines Handys. Die stellt selbst scharf und liefert ein deutlich besseres
      Bild als die Live-Ansicht — wenn das Scannen hakt, ist das der zuverlässigere Weg.
    </p>

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

    <!-- Diagnose -->
    <div v-if="scanner.diagnostics.value" class="mt-4">
      <button
        type="button"
        class="text-xs text-muted underline"
        @click="showDiagnostics = !showDiagnostics"
      >
        {{ showDiagnostics ? 'Technische Angaben ausblenden' : 'Was kann meine Kamera?' }}
      </button>
      <dl
        v-if="showDiagnostics"
        class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface2 p-3 text-[11px] text-muted"
      >
        <dt class="font-semibold">Erkennung</dt>
        <dd>{{ scanner.diagnostics.value.engine }}</dd>
        <dt class="font-semibold">Formate</dt>
        <dd>{{ scanner.diagnostics.value.formats.join(', ') || '—' }}</dd>
        <dt class="font-semibold">Auflösung</dt>
        <dd>{{ scanner.diagnostics.value.resolution }}</dd>
        <dt class="font-semibold">Objektiv</dt>
        <dd>{{ scanner.diagnostics.value.cameraLabel }}</dd>
        <dt class="font-semibold">Objektivwahl</dt>
        <dd>{{ scanner.diagnostics.value.lensChoice }}</dd>
        <dt class="font-semibold">Kameras</dt>
        <dd>{{ scanner.diagnostics.value.cameraCount }}</dd>
        <dt class="font-semibold">Fokus</dt>
        <dd>{{ scanner.diagnostics.value.focusModes.join(', ') || 'nicht steuerbar' }}</dd>
        <dt class="font-semibold">Zoom</dt>
        <dd>{{ scanner.diagnostics.value.zoomRange }}</dd>
        <dt class="font-semibold">Licht</dt>
        <dd>{{ scanner.diagnostics.value.torch ? 'steuerbar' : 'nicht steuerbar' }}</dd>
      </dl>
    </div>

    <!-- Formular -->
    <div v-if="form.open" class="mt-6 border-t border-line pt-5">
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

      <!-- Ein Wunsch hat weder Lesestatus noch Besitzer — man hat das Buch ja
           noch nicht. Beides taucht auf, sobald es ins Regal wandert. -->
      <template v-if="form.place === 'shelf'">
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
      </template>

      <div class="flex flex-col gap-2">
        <button type="button" class="btn-primary w-full" :disabled="busy || !form.title.trim()" @click="save(false)">
          {{ form.place === 'wish' ? 'Auf die Wunschliste und weiter scannen' : 'Ins Regal stellen und weiter scannen' }}
        </button>
        <button type="button" class="btn-ghost w-full" :disabled="busy || !form.title.trim()" @click="save(true)">
          {{ form.place === 'wish' ? 'Auf die Wunschliste und öffnen' : 'Ins Regal stellen und öffnen' }}
        </button>
        <button type="button" class="btn-danger w-full" @click="reset">Verwerfen</button>
      </div>
    </div>
  </div>
</template>
