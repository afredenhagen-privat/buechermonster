/**
 * Barcode-Erkennung an einer Stelle gebündelt.
 *
 * Zwei Wege, beide mit derselben Schnittstelle:
 *
 *  - **Nativ.** Android Chrome bringt die BarcodeDetector-API mit, dahinter
 *    steckt Googles ML Kit — dieselbe Erkennung, die auch gute Scanner-Apps
 *    benutzen. Schnell und ohne Download.
 *  - **ZXing-C++ als WebAssembly**, nachgeladen. Für iOS-Safari, und als
 *    zweite Meinung auf einem Standbild, wo Rechenzeit keine Rolle spielt.
 *
 * Der frühere TypeScript-Port von ZXing ist raus: von den freien Erkennern
 * ist er der schwächste, gerade bei leicht unscharfen EAN-13.
 */

/** Buchrücken tragen EAN-13; UPC ist bei Importen gelegentlich dabei. */
export const BOOK_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Decoder {
  detect: (source: CanvasImageSource | Blob | ImageData) => Promise<{ rawValue: string }[]>;
}

/** Was das Gerät tatsächlich kann — die Angaben landen in der Diagnose-Ansicht. */
export interface DecoderInfo {
  engine: 'nativ (ML Kit)' | 'ZXing-C++ (WebAssembly)';
  formats: string[];
}

let nativeFormats: string[] | null = null;

async function supportedNativeFormats(): Promise<string[]> {
  if (nativeFormats) return nativeFormats;
  if (!('BarcodeDetector' in window) || !window.BarcodeDetector) return (nativeFormats = []);
  try {
    nativeFormats = await window.BarcodeDetector.getSupportedFormats();
  } catch {
    nativeFormats = [];
  }
  return nativeFormats;
}

/**
 * Liefert die schnellste verfügbare Erkennung. `preferWasm` erzwingt den
 * gründlicheren Weg — sinnvoll bei einem einzelnen Foto, wo ein paar hundert
 * Millisekunden mehr niemanden stören.
 */
export async function createDecoder(
  preferWasm = false,
): Promise<{ decoder: Decoder; info: DecoderInfo }> {
  if (!preferWasm) {
    const supported = await supportedNativeFormats();
    const formats = BOOK_FORMATS.filter((f) => supported.includes(f));
    if (formats.length > 0 && window.BarcodeDetector) {
      try {
        const detector = new window.BarcodeDetector({ formats });
        return {
          decoder: { detect: (source) => detector.detect(source) },
          info: { engine: 'nativ (ML Kit)', formats },
        };
      } catch {
        // Fällt auf WebAssembly durch.
      }
    }
  }
  return createWasmDecoder();
}

async function createWasmDecoder(): Promise<{ decoder: Decoder; info: DecoderInfo }> {
  const { BarcodeDetector: WasmDetector, prepareZXingModule } = await import(
    'barcode-detector/ponyfill'
  );

  // Ohne diesen Eingriff holt die Bibliothek ihre .wasm-Datei von einem CDN.
  // Sie liegt aber im eigenen Build, damit die App keine fremde Adresse
  // braucht und der Service Worker sie mit ablegen kann.
  const wasmUrl = (await import('zxing-wasm/reader/zxing_reader.wasm?url')).default;
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : `${prefix}${path}`,
    },
  });

  const detector = new WasmDetector({ formats: [...BOOK_FORMATS] });
  return {
    decoder: { detect: (source) => detector.detect(source as ImageBitmapSource) },
    info: { engine: 'ZXing-C++ (WebAssembly)', formats: [...BOOK_FORMATS] },
  };
}

/**
 * Einzelnes Foto auswerten — der Weg über die Kamera-App des Handys.
 *
 * Der lohnt sich, weil die App des Systems selbst scharfstellt: Autofokus,
 * Makro, Belichtung, alles was der Browser über getUserMedia nur eingeschränkt
 * steuern kann. Ein scharfes Standbild schlägt jede Live-Erkennung auf einem
 * unscharfen Videobild.
 *
 * Wird das Bild nicht gelesen, folgt ein zweiter Versuch auf einer
 * hochskalierten Fassung — bei kleinen Strichcodes bringt das oft den Treffer.
 */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);

  try {
    // Erst die native Erkennung, falls vorhanden: die ist gut und kostet
    // keinen Download. Erst wenn die nichts findet, kommt WebAssembly dazu —
    // dann lohnt sich das Megabyte auch.
    const native = await createDecoder(false);
    const first = await tryDetect(native.decoder, bitmap);
    if (first) return first;

    const wasm = native.info.engine.startsWith('ZXing') ? native : await createDecoder(true);
    const second = await tryDetect(wasm.decoder, bitmap);
    if (second) return second;

    // Letzter Versuch auf einer hochskalierten Fassung — bei kleinen
    // Strichcodes bringt das oft noch den Treffer.
    const enlarged = upscale(bitmap, 2);
    return enlarged ? await tryDetect(wasm.decoder, enlarged) : null;
  } finally {
    bitmap.close();
  }
}

async function tryDetect(
  decoder: Decoder,
  source: CanvasImageSource | ImageData,
): Promise<string | null> {
  try {
    const codes = await decoder.detect(source);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

function upscale(bitmap: ImageBitmap, factor: number): ImageData | null {
  const width = Math.min(bitmap.width * factor, 4000);
  const height = Math.round((width / bitmap.width) * bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
