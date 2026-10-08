// Receipt languages. English is built in (precached). The others are packs downloaded on request: the one network
// call in the app, made only when the user taps Download. A pack is stored in the 'ocr-packs' cache, which the
// service worker serves from (runtimeCaching in vite.config.ts), so it works offline afterwards.
export const PACKS = [
  { code: 'eng', name: 'English', size: '' },
  { code: 'jpn', name: 'Japanese (日本語)', size: '2 MB' },
  { code: 'tgl', name: 'Tagalog', size: '3.3 MB' },
] as const;
export type Lang = (typeof PACKS)[number]['code'];

const CACHE = 'ocr-packs'; // same name as in vite.config.ts
const packUrl = (code: Lang) => new URL(`${import.meta.env.BASE_URL}ocr/${code}.traineddata.gz`, location.href).href;

export async function hasPack(code: Lang): Promise<boolean> {
  if (code === 'eng') return true;
  try {
    return !!(await (await caches.open(CACHE)).match(packUrl(code)));
  } catch {
    return false;
  }
}

/** Downloads a pack into the cache. onProgress gets 0..1 when the size is known. */
export async function downloadPack(code: Lang, onProgress: (p: number) => void): Promise<void> {
  const res = await fetch(packUrl(code));
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
  await (await caches.open(CACHE)).put(packUrl(code), new Response(new Blob(chunks)));
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
