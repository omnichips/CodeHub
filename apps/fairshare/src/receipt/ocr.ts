import { createWorker, OEM } from 'tesseract.js';
import type { Lang } from './packs';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
// SIMD build only: every iPhone on iOS 16.4 or later has WebAssembly SIMD. The .wasm.js file has the WASM inside it.
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';

// By default tesseract.js downloads all three files from a CDN. Ours are bundled and precached instead, so reading a
// receipt works offline. Language files are loaded by fixed name from a folder, so vite.config.ts serves them
// unhashed at ocr/<code>.traineddata.gz. (Passing their bytes instead hits a tesseract.js 7.0.0 bug.)
const abs = (url: string) => new URL(url, location.href).href;

/** Longest side, in pixels, that the photo is scaled down to. Bigger is slower and rarely more accurate. */
const MAX_SIDE = 2000;

async function shrink(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo); // applies the photo's EXIF rotation
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return photo;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.9));
}

/** Reads the text of a receipt photo on this phone. onProgress gets 0..1. */
export async function readReceipt(photo: Blob, lang: Lang, onProgress: (p: number) => void): Promise<string> {
  const image = await shrink(photo);
  // English as well, since receipts in any language mix in English words, codes and prices.
  const worker = await createWorker(lang === 'eng' ? 'eng' : `${lang}+eng`, OEM.LSTM_ONLY, {
    workerPath: abs(workerUrl),
    corePath: abs(coreUrl),
    langPath: abs(`${import.meta.env.BASE_URL}ocr`),
    workerBlobURL: false,
    cacheMethod: 'none', // the language file is already precached; do not keep a second copy in IndexedDB
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  try {
    return (await worker.recognize(image)).data.text;
  } finally {
    await worker.terminate();
  }
}
