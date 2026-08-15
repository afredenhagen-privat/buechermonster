/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Chrome kann Barcodes nativ erkennen, TypeScript weiß das noch nicht.
// Nur die zwei Felder, die wir tatsächlich benutzen.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource | Blob | ImageData): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
