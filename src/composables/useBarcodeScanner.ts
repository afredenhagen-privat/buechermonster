import { ref, shallowRef } from 'vue';
import { createDecoder, type Decoder } from '@/services/barcodeDecoder';

/**
 * Live-Scannen über die Kamera.
 *
 * Auf Android steckt hinter der Erkennung ML Kit, also dasselbe wie in guten
 * Scanner-Apps. Wenn ein Strichcode trotzdem nicht gelesen wird, liegt es fast
 * nie an der Erkennung, sondern am Bild — deshalb dreht sich hier das meiste
 * um die Kamera und nicht um den Decoder:
 *
 *  - **Objektiv.** Chrome nimmt bei `facingMode: environment` irgendeine
 *    Rückkamera. Erwischt es die Ultraweitwinkel- oder Tele-Linse, hat die oft
 *    Fixfokus oder eine Naheinstellgrenze von 20 cm und wird nie scharf.
 *    Deshalb lassen sich alle Kameras auflisten und durchschalten.
 *  - **Fokus.** `focusMode: 'continuous'` beim Start, dazu Antippen fürs
 *    Nachfokussieren.
 *  - **Zoom.** Die meisten Handys stellen unter 10 cm gar nicht scharf. Weiter
 *    weg gehen und hineinzoomen schlägt näher rangehen.
 *  - **Auflösung.** Bei 640×480 hat ein EAN-13 zu wenige Pixel pro Strich.
 */

export interface CameraOption {
  deviceId: string;
  label: string;
}

export interface ScannerDiagnostics {
  engine: string;
  formats: string[];
  resolution: string;
  cameraLabel: string;
  focusModes: string[];
  zoomRange: string;
  torch: boolean;
  cameraCount: number;
}

export function useBarcodeScanner() {
  const running = ref(false);
  const error = ref('');
  const cameras = ref<CameraOption[]>([]);
  const activeCameraId = ref<string | null>(null);

  const torchAvailable = ref(false);
  const torchOn = ref(false);
  const zoomAvailable = ref(false);
  const zoom = ref(1);
  const zoomRange = ref({ min: 1, max: 1, step: 0.1 });
  const diagnostics = ref<ScannerDiagnostics | null>(null);

  const stream = shallowRef<MediaStream | null>(null);
  const track = shallowRef<MediaStreamTrack | null>(null);
  let frameHandle: number | null = null;
  let stopped = true;

  /**
   * Namen bekommt man erst, nachdem die Kamera einmal freigegeben wurde —
   * vorher liefert der Browser leere Labels.
   */
  async function listCameras(): Promise<CameraOption[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Kamera ${index + 1}`,
        }));
    } catch {
      cameras.value = [];
    }
    return cameras.value;
  }

  async function start(
    video: HTMLVideoElement,
    onDetect: (code: string) => void,
    deviceId?: string,
  ) {
    error.value = '';
    if (running.value) stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Dieser Browser gibt keinen Zugriff auf die Kamera.';
      return;
    }

    const constraints: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } };

    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: {
          ...constraints,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Best-effort: unbekannte Optionen ignoriert der Browser, ohne den
          // Stream scheitern zu lassen.
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        },
        audio: false,
      });

      track.value = stream.value.getVideoTracks()[0] ?? null;
      activeCameraId.value = track.value?.getSettings().deviceId ?? deviceId ?? null;
      readCapabilities();

      video.srcObject = stream.value;
      await video.play();
      running.value = true;
      stopped = false;
    } catch {
      error.value = 'Die Kamera lässt sich nicht öffnen. Erlaubt der Browser den Zugriff?';
      return;
    }

    await listCameras();

    const { decoder, info } = await createDecoder();
    diagnostics.value = {
      engine: info.engine,
      formats: info.formats,
      resolution: describeResolution(),
      cameraLabel: track.value?.label || 'unbekannt',
      focusModes: capabilities().focusMode ?? [],
      zoomRange: zoomAvailable.value
        ? `${zoomRange.value.min}–${zoomRange.value.max}`
        : 'nicht steuerbar',
      torch: torchAvailable.value,
      cameraCount: cameras.value.length,
    };

    scanLoop(decoder, video, onDetect);
  }

  function scanLoop(decoder: Decoder, video: HTMLVideoElement, onDetect: (code: string) => void) {
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await decoder.detect(video);
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

  function capabilities(): MediaTrackCapabilities & {
    torch?: boolean;
    zoom?: { min: number; max: number; step: number };
    focusMode?: string[];
  } {
    return track.value?.getCapabilities?.() ?? {};
  }

  function readCapabilities() {
    const caps = capabilities();

    torchAvailable.value = caps.torch === true;
    torchOn.value = false;

    if (caps.zoom) {
      zoomAvailable.value = caps.zoom.max > caps.zoom.min;
      zoomRange.value = {
        min: caps.zoom.min,
        max: caps.zoom.max,
        step: caps.zoom.step || 0.1,
      };
      zoom.value = (track.value?.getSettings() as { zoom?: number } | undefined)?.zoom ?? caps.zoom.min;
    } else {
      zoomAvailable.value = false;
    }
  }

  function describeResolution(): string {
    const settings = track.value?.getSettings();
    return settings?.width && settings.height
      ? `${settings.width}×${settings.height}`
      : 'unbekannt';
  }

  async function setZoom(value: number) {
    if (!track.value || !zoomAvailable.value) return;
    zoom.value = value;
    try {
      await track.value.applyConstraints({
        advanced: [{ zoom: value } as MediaTrackConstraintSet],
      });
    } catch {
      // Manche Geräte melden Zoom, lassen ihn aber nicht setzen.
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

  /**
   * Antippen zum Scharfstellen. Wo der Browser das nicht anbietet, wird
   * ersatzweise der Dauerfokus neu angestoßen — das reicht auf vielen Geräten,
   * um eine neue Fokussuche auszulösen.
   */
  async function refocus(x?: number, y?: number) {
    const current = track.value;
    if (!current) return;

    const modes = capabilities().focusMode ?? [];
    try {
      if (x !== undefined && y !== undefined && modes.includes('single-shot')) {
        await current.applyConstraints({
          advanced: [
            { focusMode: 'single-shot', pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet,
          ],
        });
        return;
      }
      if (modes.includes('continuous')) {
        await current.applyConstraints({
          advanced: [{ focusMode: 'manual' } as MediaTrackConstraintSet],
        });
        await current.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Fokussteuerung ist auf vielen Geräten nicht verfügbar.
    }
  }

  function stop() {
    stopped = true;
    running.value = false;
    torchOn.value = false;

    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }

    // Ohne das bleibt die Kameraleuchte an, auch wenn die Ansicht längst weg ist.
    for (const t of stream.value?.getTracks() ?? []) t.stop();
    stream.value = null;
    track.value = null;
  }

  return {
    running,
    error,
    cameras,
    activeCameraId,
    torchAvailable,
    torchOn,
    zoomAvailable,
    zoom,
    zoomRange,
    diagnostics,
    listCameras,
    start,
    stop,
    setZoom,
    toggleTorch,
    refocus,
  };
}
