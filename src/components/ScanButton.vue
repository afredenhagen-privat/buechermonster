<script setup lang="ts">
/**
 * Der Weg zum Erfassen, als runder Knopf über der Liste.
 *
 * `wish` bestimmt die Vorbelegung: aus dem Regal heraus landet das Buch im
 * Regal, aus der Wunschliste heraus auf der Wunschliste. Umentscheiden geht
 * im Formular.
 *
 * Wichtig für die Ansichten, die ihn einbinden: sie brauchen unten genug
 * Innenabstand, sonst verdeckt der Knopf die letzte Zeile.
 */
withDefaults(defineProps<{ wish?: boolean }>(), { wish: false });
</script>

<template>
  <router-link
    :to="wish ? '/hinzufuegen?wunsch=1' : '/hinzufuegen'"
    class="fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-accent pl-4 pr-5 text-accent-ink shadow-lg transition active:scale-95"
    style="bottom: calc(4.75rem + env(safe-area-inset-bottom))"
    :aria-label="wish ? 'Buch auf die Wunschliste scannen' : 'Buch ins Regal scannen'"
  >
    <span class="text-xl leading-none" aria-hidden="true">📷</span>
    <span class="text-sm font-bold">{{ wish ? 'Wunsch' : 'Scannen' }}</span>
  </router-link>
</template>
