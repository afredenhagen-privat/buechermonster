import { ref, shallowRef } from 'vue';
import { createDecoder, type Decoder } from '@/services/barcodeDecoder';

/**
 * Live-Scannen über die Kamera.
 *
 * Auf Android steckt hinter der Erkennung ML Kit, also dasselbe wie in guten
 * Scanner-Apps. Wird ein Strichcode trotzdem nicht gelesen, liegt es fast nie
 * an der Erkennung, sondern am Bild — und dort am häufigsten am Objektiv:
 *
 * `facingMode: 'environment'` überlässt Chrome die Wahl, und Chrome greift
 * sich gerne die Ultraweitwinkellinse. Die hat auf den meisten Handys einen
 * **Fixfokus** und meldet als einzigen Modus `manual`. Sie kann also gar nicht
 * scharfstellen, egal wie lange man draufhält. Deshalb wird nach dem Start
 * geprüft, ob die gewählte Linse Autofokus anbietet, und andernfalls
 * automatisch auf eine umgeschaltet, die es tut.
 *
 * Dazu die üblichen Punkte: hohe Auflösung, weil ein EAN-13 bei 640×480 zu
 * wenige Pixel je Strich hat, und Zoom statt Nähe, weil Handys unter 10 cm
 * ohnehin nicht scharfstellen.
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
  lensChoice: string;
}

type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
};

interface OpenCamera {
  stream: MediaStream;
  track: MediaStreamTrack;
}

export function useBarcodeScanner() {
  const running = ref(false);
  const error = ref('');
  const cameras = ref<CameraOption[]>([]);
  const activeCameraId = ref<string | null>(null);
  const focusWarning = ref('');

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

  /** Namen liefert der Browser erst, nachdem die Kamera einmal freigegeben wurde. */
  async function listCameras(): Promise<CameraOption[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${index + 1}` }));
    } catch {
      cameras.value = [];
    }
    return cameras.value;
  }

  async function openCamera(constraints: MediaTrackConstraints): Promise<OpenCamera | null> {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
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
      const videoTrack = media.getVideoTracks()[0];
      if (!videoTrack) {
        for (const t of media.getTracks()) t.stop();
        return null;
      }
      return { stream: media, track: videoTrack };
    } catch {
      return null;
    }
  }

  function hasAutofocus(candidate: MediaStreamTrack): boolean {
    const modes = (candidate.getCapabilities?.() as CameraCapabilities | undefined)?.focusMode ?? [];
    return modes.includes('continuous') || modes.includes('single-shot');
  }

  /**
   * Sucht unter den übrigen rückwärtigen Kameras eine mit Autofokus. Jede
   * Kandidatin muss dafür kurz geöffnet werden — die Fähigkeiten stehen erst
   * am laufenden Track. Das kostet einmalig ein paar hundert Millisekunden
   * und erspart dem Benutzer, blind Objektive durchzuprobieren.
   */
  async function findAutofocusCamera(excludeId: string | undefined): Promise<OpenCamera | null> {
    const candidates = (await listCameras()).filter(
      (c) => c.deviceId && c.deviceId !== excludeId && !/front|vorder|user/i.test(c.label),
    );

    for (const candidate of candidates) {
      const opened = await openCamera({ deviceId: { exact: candidate.deviceId } });
      if (!opened) continue;
      if (hasAutofocus(opened.track)) return opened;
      for (const t of opened.stream.getTracks()) t.stop();
    }
    return null;
  }

  async function start(
    video: HTMLVideoElement,
    onDetect: (code: string) => void,
    deviceId?: string,
  ) {
    error.value = '';
    focusWarning.value = '';
    if (running.value) stop();

    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Dieser Browser gibt keinen Zugriff auf die Kamera.';
      return;
    }

    let opened = await openCamera(
      deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
    );
    if (!opened) {
      error.value = 'Die Kamera lässt sich nicht öffnen. Erlaubt der Browser den Zugriff?';
      return;
    }

    // Nur wenn der Browser die Linse ausgesucht hat, wird nachgebessert —
    // eine bewusste Auswahl bleibt stehen.
    let lensChoice = 'vom Browser gewählt';
    if (!deviceId && !hasAutofocus(opened.track)) {
      const better = await findAutofocusCamera(opened.track.getSettings().deviceId);
      if (better) {
        for (const t of opened.stream.getTracks()) t.stop();
        opened = better;
        lensChoice = 'automatisch auf Autofokus gewechselt';
      } else {
        lensChoice = 'keine Linse mit Autofokus gefunden';
        focusWarning.value =
          'Keine deiner Kameras bietet Autofokus an. Ein Foto über die Kamera-App ist hier der zuverlässigere Weg.';
      }
    }

    stream.value = opened.stream;
    track.value = opened.track;
    activeCameraId.value = opened.track.getSettings().deviceId ?? deviceId ?? null;
    readCapabilities();

    try {
      video.srcObject = opened.stream;
      await video.play();
    } catch {
      error.value = 'Das Kamerabild lässt sich nicht anzeigen.';
      stop();
      return;
    }

    running.value = true;
    stopped = false;
    await listCameras();

    const { decoder, info } = await createDecoder();
    diagnostics.value = {
      engine: info.engine,
      formats: info.formats,
      resolution: describeResolution(),
      cameraLabel: opened.track.label || 'unbekannt',
      focusModes: capabilities().focusMode ?? [],
      zoomRange: zoomAvailable.value
        ? `${zoomRange.value.min}–${zoomRange.value.max}`
        : 'nicht steuerbar',
      torch: torchAvailable.value,
      cameraCount: cameras.value.length,
      lensChoice,
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

  function capabilities(): CameraCapabilities {
    return (track.value?.getCapabilities?.() as CameraCapabilities | undefined) ?? {};
  }

  function readCapabilities() {
    const caps = capabilities();

    torchAvailable.value = caps.torch === true;
    torchOn.value = false;

    if (caps.zoom) {
      zoomAvailable.value = caps.zoom.max > caps.zoom.min;
      zoomRange.value = { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 };
      zoom.value =
        (track.value?.getSettings() as { zoom?: number } | undefined)?.zoom ?? caps.zoom.min;
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
   * Antippen zum Scharfstellen. Wo `single-shot` fehlt, wird ersatzweise der
   * Dauerfokus neu angestoßen — das löst auf vielen Geräten eine neue
   * Fokussuche aus. Bei einer Fixfokuslinse ist beides wirkungslos, deshalb
   * die automatische Objektivwahl weiter oben.
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
    focusWarning,
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
