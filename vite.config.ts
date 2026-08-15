/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const REPO_NAME = 'buechermonster';

export default defineConfig(({ mode }) => {
  // Muss synchron bleiben mit: router.ts (via BASE_URL), manifest.start_url,
  // manifest.scope und workbox.navigateFallback. Siehe docs/specs/.
  const base = mode === 'production' ? `/${REPO_NAME}/` : '/';

  return {
    base,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
        ],
        manifest: {
          name: 'Büchermonster',
          short_name: 'Büchermonster',
          description: 'Bücherschrank erfassen, ganz ohne Server.',
          theme_color: '#b4552d',
          background_color: '#faf7f2',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          lang: 'de',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: `${base}index.html`,
          // Die Export-Bibliotheken werden lazy geladen und sind einzeln
          // größer als das Default-Limit von 2 MB.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    server: { host: true, port: 5173 },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/__tests__/setup.ts'],
    },
  };
});
