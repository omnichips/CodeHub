import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// By default the library downloads its WASM from a CDN. Serve our own copy (precached by the service worker),
// so scanning works offline and the app makes no network calls.
prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });

const detector = new BarcodeDetector({ formats: ['qr_code'] });

/** Text of every QR code found in a video frame, image or photo. */
export async function readCodes(source: ImageBitmapSource): Promise<string[]> {
  return (await detector.detect(source)).map((c) => c.rawValue);
}
