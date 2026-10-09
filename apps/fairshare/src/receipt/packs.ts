// Receipt languages. English is built in (precached). The others are packs downloaded on request: the one network
// call in the app, made only when the user taps Download. A pack is stored in the 'ocr-packs' cache, which the
// service worker serves from (runtimeCaching in vite.config.ts), so it works offline afterwards.
export const PACKS = [
  { code: 'eng', name: 'English', size: '' },
  { code: 'jpn', name: 'Japanese (日本語)', size: '2 MB' },
  { code: 'tgl', name: 'Tagalog', size: '3.3 MB' },
] as const;
export type Lang = (typeof PACKS)[number]['code'];

const CACHE = 'ocr-packs'; // same name as in vite.config.ts; also holds the PDF font pack
const urlOf = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;
const packUrl = (code: Lang) => urlOf(`ocr/${code}.traineddata.gz`);

/** The PDF font for Japanese and Chinese names (M PLUS 1p, open licence). Downloaded on request like the receipt packs. */
export const FONT_PACK = { path: 'fonts/MPLUS1p-Regular.ttf', name: 'Japanese PDF font', size: '1.7 MB' } as const;

export async function hasPack(code: Lang): Promise<boolean> {
  if (code === 'eng') return true;
  try {
    return !!(await (await caches.open(CACHE)).match(packUrl(code)));
  } catch {
    return false;
  }
}

export const downloadPack = (code: Lang, onProgress: (p: number) => void) => downloadToCache(packUrl(code), onProgress);

export async function hasFontPack(): Promise<boolean> {
  try {
    return !!(await (await caches.open(CACHE)).match(urlOf(FONT_PACK.path)));
  } catch {
    return false;
  }
}
export const downloadFontPack = (onProgress: (p: number) => void) => downloadToCache(urlOf(FONT_PACK.path), onProgress);

/** The downloaded font as base64 (what jsPDF takes), or null if it has not been downloaded. */
export async function fontPackBase64(): Promise<string | null> {
  try {
    const res = await (await caches.open(CACHE)).match(urlOf(FONT_PACK.path));
    if (!res) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  } catch {
    return null;
  }
}

/** Frees the space: the pack can be downloaded again later. */
export const deletePack = async (code: Lang) => void (await caches.open(CACHE)).delete(packUrl(code));
export const deleteFontPack = async () => void (await caches.open(CACHE)).delete(urlOf(FONT_PACK.path));

/** Downloads a file into the cache. onProgress gets 0..1 when the size is known. */
async function downloadToCache(url: string, onProgress: (p: number) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const size = Number(res.headers.get('content-length')) || 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let got = 0;
  const reader = res.body.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
    got += r.value.length;
    if (size) onProgress(Math.min(1, got / size));
  }
  await (await caches.open(CACHE)).put(url, new Response(new Blob(chunks)));
}

const KEY = 'receipt-lang'; // a per-device UI preference, not trip data
export const savedLang = (): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    return PACKS.some((p) => p.code === v) ? (v as Lang) : 'eng';
  } catch {
    return 'eng';
  }
};
export const saveLang = (code: Lang) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* storage blocked: remembered for this session only */
  }
};
