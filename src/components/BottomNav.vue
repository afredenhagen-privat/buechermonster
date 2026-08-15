<script setup lang="ts">
import { computed } from 'vue';
import { useLoansStore } from '@/stores';

const loans = useLoansStore();
const overdueCount = computed(() => loans.overdue().length);

const tabs = [
  { to: '/', label: 'Regal', icon: '📚' },
  { to: '/hinzufuegen', label: 'Hinzufügen', icon: '📷' },
  { to: '/ausleihen', label: 'Ausleihen', icon: '🤝' },
  { to: '/einstellungen', label: 'Einstellungen', icon: '⚙️' },
];
</script>

<template>
  <nav
    class="shrink-0 border-t border-line bg-surface"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <ul class="mx-auto flex max-w-2xl">
      <li v-for="tab in tabs" :key="tab.to" class="flex-1">
        <router-link
          :to="tab.to"
          class="relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold text-muted transition active:scale-95"
          active-class="text-accent"
          :aria-label="tab.label"
        >
          <span class="text-xl leading-tight" aria-hidden="true">{{ tab.icon }}</span>
          {{ tab.label }}
          <span
            v-if="tab.to === '/ausleihen' && overdueCount > 0"
            class="absolute right-1/2 top-1 -mr-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-overdue px-1 text-[10px] font-bold text-white"
            :aria-label="`${overdueCount} überfällig`"
          >
            {{ overdueCount }}
          </span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>
