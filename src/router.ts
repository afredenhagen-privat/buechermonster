import { createRouter, createWebHistory } from 'vue-router';
import ShelfView from './views/ShelfView.vue';
import BookDetailView from './views/BookDetailView.vue';
import AddBookView from './views/AddBookView.vue';
import LoansView from './views/LoansView.vue';
import SettingsView from './views/SettingsView.vue';

export default createRouter({
  // BASE_URL kommt von Vite und ist damit automatisch synchron mit dem
  // base-Pfad aus vite.config.ts. Nicht durch einen festen Wert ersetzen.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'shelf', component: ShelfView },
    { path: '/buch/:id', name: 'book', component: BookDetailView, props: true },
    { path: '/hinzufuegen', name: 'add', component: AddBookView },
    { path: '/ausleihen', name: 'loans', component: LoansView },
    { path: '/einstellungen', name: 'settings', component: SettingsView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
