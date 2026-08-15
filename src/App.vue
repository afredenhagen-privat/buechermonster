<script setup lang="ts">
import { computed } from 'vue';
import BottomNav from './components/BottomNav.vue';
import ToastHost from './components/ToastHost.vue';
import { useBooksStore } from './stores';
import { pluralBooks } from './services/display';

const books = useBooksStore();
const count = computed(() => pluralBooks(books.stats.total));
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-accent to-accent/70 text-sm font-extrabold text-accent-ink"
        aria-hidden="true"
      >
        BM
      </div>
      <h1 class="font-title text-lg font-bold tracking-tight">Büchermonster</h1>
      <span class="ml-auto text-xs text-muted">{{ count }}</span>
    </header>

    <main class="flex-1 overflow-y-auto">
      <router-view />
    </main>

    <BottomNav />
    <ToastHost />
  </div>
</template>
