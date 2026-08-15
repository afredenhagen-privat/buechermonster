import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(outDir, { recursive: true });

const ACCENT = '#b4552d';
const ACCENT_DARK = '#7d3418';

/** @param {number} size @param {boolean} maskable */
function svg(size, maskable) {
  // Maskable-Icons werden vom System beschnitten, deshalb bleibt das Logo
  // in der inneren Safe Area und der Hintergrund läuft randlos durch.
  const radius = maskable ? 0 : Math.round(size * 0.18);
  const fontSize = Math.round(size * (maskable ? 0.26 : 0.33));
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}"
        font-weight="700" letter-spacing="${size * 0.01}" fill="#fff">BM</text>
</svg>`);
}

await sharp(svg(192, false)).png().toFile(resolve(outDir, 'icon-192.png'));
await sharp(svg(512, false)).png().toFile(resolve(outDir, 'icon-512.png'));
await sharp(svg(512, true)).png().toFile(resolve(outDir, 'icon-maskable-512.png'));
console.log('PWA-Icons erzeugt:', outDir);
