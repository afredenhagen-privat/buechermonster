<script setup lang="ts">
withDefaults(defineProps<{ rating: number; interactive?: boolean }>(), { interactive: false });
const emit = defineEmits<{ pick: [number] }>();

const STARS = [1, 2, 3, 4, 5];
</script>

<template>
  <div v-if="!interactive" class="text-xs leading-none text-star" :aria-label="`${rating} von 5 Sternen`">
    <span v-for="star in STARS" :key="star" :class="star <= rating ? '' : 'text-line'">★</span>
  </div>

  <div v-else class="flex items-center gap-1">
    <button
      v-for="star in STARS"
      :key="star"
      type="button"
      class="text-3xl leading-none transition active:scale-90"
      :class="star <= rating ? 'text-star' : 'text-line'"
      :aria-label="`${star} von 5 Sternen`"
      :aria-pressed="star <= rating"
      @click="emit('pick', star)"
    >
      ★
    </button>
    <span class="ml-2 text-xs text-muted">
      {{ rating ? `${rating} von 5 · nochmal tippen löscht` : 'noch nicht bewertet' }}
    </span>
  </div>
</template>
