import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initDatabase } from './db/database';
import { seedDefaults } from './db/seed';
import { loadAllStores } from './stores';
import './styles/main.css';

/**
 * Reihenfolge ist wichtig: Datenbank auf, Standardwerte anlegen, Pinia
 * aktivieren, alle Stores laden — und erst dann mounten. Sonst rendert die
 * erste Ansicht einen leeren Zustand, bevor die Daten da sind.
 */
async function bootstrap() {
  await initDatabase();
  await seedDefaults();

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);

  await loadAllStores();

  app.mount('#app');
}

void bootstrap();
