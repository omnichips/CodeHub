import { createWorker, OEM, PSM } from 'tesseract.js';
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

/** How one reading pass treats the photo: cleaned up first or not, and Tesseract's page layout mode. */
export type Pass = { clean: boolean; psm: PSM };
// Measured on 20 rendered receipt photos (clean, faint, shadowed, on a table, all three): prices found went from 21
// of 110 (no cleanup, automatic layout) to 105 with cleanup and one-block layout; one-block alone found 81. Automatic
// layout reads the names and the prices as separate columns, so they no longer pair up.
export const PASSES: Pass[] = [
  { clean: true, psm: PSM.SINGLE_BLOCK },
  { clean: false, psm: PSM.SINGLE_BLOCK }, // second try: in case cleanup hurt this photo
];

async function prepare(photo: Blob, clean: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(photo); // applies the photo's EXIF rotation
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && !clean) return photo;
  const canvas = document.createElement('canvas');
  const [w, h] = [Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)];
  [canvas.width, canvas.height] = [w, h];
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  if (clean) {
    const image = g.getImageData(0, 0, w, h);
    flatten(image.data, w, h);
    g.putImageData(image, 0, 0);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.92));
}

/**
 * Evens out a phone photo of a receipt, in place (RGBA). Greyscale; then each pixel is divided by the paper brightness
 * around it, so a shadow or a dim corner turns back into white paper; then the contrast is stretched so faint thermal
 * print comes out dark. Tesseract picks one black-and-white cut-off for the whole image, which only works once the
 * lighting is even.
 */
export function flatten(px: Uint8ClampedArray, w: number, h: number) {
  const B = 32; // block size: bigger than a printed character, smaller than a shadow's soft edge
  const [gw, gh] = [Math.ceil(w / B), Math.ceil(h / B)];
  const grey = new Float32Array(w * h);
  const paper = new Float32Array(gw * gh); // brightest pixel in each block: the paper there
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      grey[i] = v;
      const c = ((y / B) | 0) * gw + ((x / B) | 0);
      if (v > paper[c]) paper[c] = v;
    }
  // Average each block with its neighbours, so block edges do not show.
  const soft = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, gy - 1); y <= Math.min(gh - 1, gy + 1); y++)
        for (let x = Math.max(0, gx - 1); x <= Math.min(gw - 1, gx + 1); x++) (sum += paper[y * gw + x]), n++;
      soft[gy * gw + gx] = Math.max(sum / n, 1);
    }
  // Divide by the paper brightness (smoothly between block centres), and count values for the stretch below.
  const counts = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max(y / B - 0.5, 0), gh - 1);
    const [y0, ty] = [Math.floor(fy), fy - Math.floor(fy)];
    const y1 = Math.min(y0 + 1, gh - 1);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max(x / B - 0.5, 0), gw - 1);
      const [x0, tx] = [Math.floor(fx), fx - Math.floor(fx)];
      const x1 = Math.min(x0 + 1, gw - 1);
      const top = soft[y0 * gw + x0] * (1 - tx) + soft[y0 * gw + x1] * tx;
      const bottom = soft[y1 * gw + x0] * (1 - tx) + soft[y1 * gw + x1] * tx;
      const i = y * w + x;
      const v = Math.min(255, (grey[i] / (top * (1 - ty) + bottom * ty)) * 255);
      grey[i] = v;
      counts[v | 0]++;
    }
  }
  // Darkest 1% becomes black; anything above 85% of the paper becomes white (stains, faint shading). The black point is
  // capped: on a photo with less than 1% ink, the darkest 1% is paper, and stretching from there would blacken it all.
  let lo = 0;
  for (let seen = 0; lo < 160 && (seen += counts[lo]) < w * h * 0.01; ) lo++;
  const hi = 217;
  for (let i = 0; i < w * h; i++) {
    const v = ((grey[i] - lo) / (hi - lo)) * 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; // clamped to 0..255 by the array type
  }
}

/**
 * Reads the text of receipt photos on this phone, one after another with one engine. onProgress gets the photo index
 * and 0..1. When `rate` says a reading is not good (the prices do not add up), the photo is read once more with the
 * next pass, and the better-scoring reading is kept.
 */
export async function readReceipts(
  photos: Blob[],
  lang: Lang,
  onProgress: (index: number, p: number, again: boolean) => void,
  rate?: (text: string) => { good: boolean; score: number },
  passes: Pass[] = PASSES,
): Promise<string[]> {
  let current = 0;
  let again = false;
  // English as well, since receipts in any language mix in English words, codes and prices.
  const worker = await createWorker(lang === 'eng' ? 'eng' : `${lang}+eng`, OEM.LSTM_ONLY, {
    workerPath: abs(workerUrl),
    corePath: abs(coreUrl),
    langPath: abs(`${import.meta.env.BASE_URL}ocr`),
    workerBlobURL: false,
    cacheMethod: 'none', // the language file is already precached; do not keep a second copy in IndexedDB
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(current, m.progress, again);
    },
  });
  const read = async (photo: Blob, pass: Pass) => {
    await worker.setParameters({ tessedit_pageseg_mode: pass.psm, user_defined_dpi: '300' });
    return (await worker.recognize(await prepare(photo, pass.clean))).data.text;
  };
  try {
    const texts: string[] = [];
    for (; current < photos.length; current++) {
      again = false;
      let text = await read(photos[current], passes[0]);
      const first = rate?.(text);
      if (rate && first && !first.good && passes[1]) {
        again = true;
        const second = await read(photos[current], passes[1]);
        if (rate(second).score > first.score) text = second;
      }
      texts.push(text);
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}
