import { ref, shallowRef } from 'vue';

/**
 * Barcode-Erkennung mit zwei Wegen:
 *
 *  1. Die native BarcodeDetector-API. Android Chrome kann das ohne
 *     Zusatzcode und ohne Download.
 *  2. @zxing/browser, erst bei Bedarf nachgeladen. Das ist der Weg für
 *     iOS-Safari, wo es die native API nicht gibt.
 *
 * Die Kamera braucht in beiden Fällen https oder localhost.
 */

export type ScannerEngine = 'native' | 'zxing' | null;

export function useBarcodeScanner() {
  const running = ref(false);
  const engine = ref<ScannerEngine>(null);
  const error = ref('');

  const stream = shallowRef<MediaStream | null>(null);
  const zxingControls = shallowRef<{ stop: () => void } | null>(null);
  let nativeTimer: number | null = null;

  async function start(video: HTMLVideoElement, onDetect: (code: string) => void) {
    error.value = '';
    if (running.value) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Dieser Browser gibt keinen Zugriff auf die Kamera.';
      return;
    }

    try {
      // Rückkamera, sonst filmt das Handy die Decke.
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      video.srcObject = stream.value;
      await video.play();
      running.value = true;
    } catch {
      error.value = 'Die Kamera lässt sich nicht öffnen. Erlaubt der Browser den Zugriff?';
      return;
    }

    if ('BarcodeDetector' in window && window.BarcodeDetector) {
      engine.value = 'native';
      await runNative(video, onDetect);
    } else {
      engine.value = 'zxing';
      await runZxing(video, onDetect);
    }
  }

  async function runNative(video: HTMLVideoElement, onDetect: (code: string) => void) {
    const detector = new window.BarcodeDetector!({ formats: ['ean_13', 'ean_8', 'isbn'] });

    nativeTimer = window.setInterval(async () => {
      if (!running.value) return;
      try {
        const codes = await detector.detect(video);
        const first = codes[0]?.rawValue;
        if (first) onDetect(first);
      } catch {
        // Einzelne Frames scheitern gelegentlich — das ist normal, weiter geht's.
      }
    }, 400);
  }

  async function runZxing(video: HTMLVideoElement, onDetect: (code: string) => void) {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      zxingControls.value = await reader.decodeFromVideoElement(video, (result) => {
        const text = result?.getText();
        if (text) onDetect(text);
      });
    } catch {
      error.value = 'Die Barcode-Erkennung ließ sich nicht laden. Bitte die ISBN eintippen.';
      stop();
    }
  }

  function stop() {
    running.value = false;

    if (nativeTimer !== null) {
      window.clearInterval(nativeTimer);
      nativeTimer = null;
    }
    zxingControls.value?.stop();
    zxingControls.value = null;

    // Ohne das bleibt die Kameraleuchte an, auch wenn die Ansicht längst weg ist.
    for (const track of stream.value?.getTracks() ?? []) track.stop();
    stream.value = null;
  }

  return { running, engine, error, start, stop };
}
