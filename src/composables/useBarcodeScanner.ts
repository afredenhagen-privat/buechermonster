import { ref, shallowRef } from 'vue';

/**
 * Barcode-Erkennung mit zwei Wegen:
 *
 *  1. Die native BarcodeDetector-API. Android Chrome kann das ohne
 *     Zusatzcode und ohne Download.
 *  2. @zxing/browser, erst bei Bedarf nachgeladen — der Weg für iOS-Safari,
 *     wo es die native API nicht gibt.
 *
 * Drei Dinge, an denen ein Scanner sonst still scheitert:
 *
 *  - **Formatliste.** Die API kennt nur die Formate aus der Spezifikation.
 *    Ein erfundener Eintrag wie 'isbn' lässt schon den Konstruktor werfen,
 *    und dann läuft die Kamera, ohne je etwas zu erkennen. Deshalb wird
 *    zusätzlich gegen getSupportedFormats() abgeglichen.
 *  - **Autofokus.** Ohne 'continuous' stellt ein Handy auf Nahdistanz nicht
 *    scharf. Ein unscharfer Strichcode wird nie erkannt.
 *  - **Auflösung.** Bei 640×480 sind die schmalen Striche eines EAN-13
 *    schlicht zu wenige Pixel.
 */

export type ScannerEngine = 'native' | 'zxing' | null;

/** Buchrücken tragen EAN-13; UPC ist bei Importen gelegentlich dabei. */
const WANTED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function useBarcodeScanner() {
  const running = ref(false);
  const engine = ref<ScannerEngine>(null);
  const error = ref('');
  const torchAvailable = ref(false);
  const torchOn = ref(false);

  const stream = shallowRef<MediaStream | null>(null);
  const track = shallowRef<MediaStreamTrack | null>(null);
  const zxingControls = shallowRef<{ stop: () => void } | null>(null);
  let frameHandle: number | null = null;
  let stopped = true;

  async function start(video: HTMLVideoElement, onDetect: (code: string) => void) {
    error.value = '';
    if (running.value) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Dieser Browser gibt keinen Zugriff auf die Kamera.';
      return;
    }

    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Wird best-effort angewandt; unbekannte Optionen ignoriert der
          // Browser, ohne den Stream scheitern zu lassen.
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        },
        audio: false,
      });

      track.value = stream.value.getVideoTracks()[0] ?? null;
      torchAvailable.value =
        (track.value?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch === true;

      video.srcObject = stream.value;
      await video.play();
      running.value = true;
      stopped = false;
    } catch {
      error.value = 'Die Kamera lässt sich nicht öffnen. Erlaubt der Browser den Zugriff?';
      return;
    }

    const detector = await createNativeDetector();
    if (detector) {
      engine.value = 'native';
      scanLoop(detector, video, onDetect);
    } else {
      engine.value = 'zxing';
      await runZxing(video, onDetect);
    }
  }

  /** Gibt null zurück, wenn die native API fehlt oder sich nicht einrichten lässt. */
  async function createNativeDetector(): Promise<BarcodeDetector | null> {
    if (!('BarcodeDetector' in window) || !window.BarcodeDetector) return null;

    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return null;
      return new window.BarcodeDetector({ formats });
    } catch {
      return null;
    }
  }

  function scanLoop(
    detector: BarcodeDetector,
    video: HTMLVideoElement,
    onDetect: (code: string) => void,
  ) {
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        const code = codes[0]?.rawValue;
        if (code) {
          navigator.vibrate?.(120);
          stopped = true;
          onDetect(code);
          return;
        }
      } catch {
        // Einzelne Frames scheitern gelegentlich — das ist normal.
      }
      frameHandle = requestAnimationFrame(() => void tick());
    };
    void tick();
  }

  async function runZxing(video: HTMLVideoElement, onDetect: (code: string) => void) {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      zxingControls.value = await reader.decodeFromVideoElement(video, (result) => {
        const text = result?.getText();
        if (text && !stopped) {
          navigator.vibrate?.(120);
          stopped = true;
          onDetect(text);
        }
      });
    } catch {
      error.value = 'Die Barcode-Erkennung ließ sich nicht laden. Bitte die ISBN eintippen.';
      stop();
    }
  }

  async function toggleTorch() {
    if (!track.value || !torchAvailable.value) return;
    try {
      torchOn.value = !torchOn.value;
      await track.value.applyConstraints({
        advanced: [{ torch: torchOn.value } as MediaTrackConstraintSet],
      });
    } catch {
      torchOn.value = false;
    }
  }

  function stop() {
    stopped = true;
    running.value = false;
    torchOn.value = false;
    torchAvailable.value = false;

    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    zxingControls.value?.stop();
    zxingControls.value = null;

    // Ohne das bleibt die Kameraleuchte an, auch wenn die Ansicht längst weg ist.
    for (const t of stream.value?.getTracks() ?? []) t.stop();
    stream.value = null;
    track.value = null;
  }

  return { running, engine, error, torchAvailable, torchOn, start, stop, toggleTorch };
}
