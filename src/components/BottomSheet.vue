<script setup lang="ts">
/**
 * Bottom-Sheet statt zentriertem Dialog: auf dem Handy in Daumenreichweite,
 * auf breiten Bildschirmen mittig.
 */
defineProps<{ modelValue: boolean; title?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center"
        @click.self="close"
        @keydown.esc="close"
      >
        <div
          class="max-h-[88%] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface px-5 pt-2 sm:rounded-2xl"
          style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
          role="dialog"
          :aria-label="title"
        >
          <div class="mx-auto mb-3.5 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
          <h2 v-if="title" class="mb-3.5 font-title text-lg font-bold">{{ title }}</h2>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
