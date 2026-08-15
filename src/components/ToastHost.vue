<script setup lang="ts">
import { useToast } from '@/composables/useToast';

const { toasts } = useToast();
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-6"
      style="padding-bottom: env(safe-area-inset-bottom)"
      role="status"
      aria-live="polite"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="max-w-sm rounded-lg px-4 py-2.5 text-center text-sm font-semibold shadow-lg"
        :class="toast.tone === 'error' ? 'bg-overdue text-white' : 'bg-ink text-canvas'"
      >
        {{ toast.message }}
      </div>
    </div>
  </Teleport>
</template>
