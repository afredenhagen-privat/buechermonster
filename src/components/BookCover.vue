<script setup lang="ts">
import { computed } from 'vue';
import { coverGradient, coverInitial } from '@/services/display';

const props = withDefaults(
  defineProps<{ title: string; src?: string | null; size?: 'sm' | 'lg' }>(),
  { src: null, size: 'sm' },
);

const style = computed(() => ({ background: coverGradient(props.title) }));
</script>

<template>
  <div
    class="shrink-0 overflow-hidden rounded-[5px] shadow-[inset_-3px_0_6px_rgba(0,0,0,0.22)]"
    :class="size === 'lg' ? 'h-[118px] w-[82px]' : 'h-[66px] w-[46px]'"
    :style="style"
  >
    <img
      v-if="src"
      :src="src"
      :alt="`Cover von ${title}`"
      class="h-full w-full object-cover"
      loading="lazy"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center font-title font-bold text-white"
      :class="size === 'lg' ? 'text-3xl' : 'text-xl'"
      aria-hidden="true"
    >
      {{ coverInitial(title) }}
    </div>
  </div>
</template>
