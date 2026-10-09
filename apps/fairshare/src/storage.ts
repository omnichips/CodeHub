import { db } from './db';

export type Slice = { label: string; bytes: number };

/** What FairsHare holds on this phone, by kind. The browser only reports one total, so "App files and trip data" is what is left after the rest. */
export async function storageUse(): Promise<{ slices: Slice[]; total: number }> {
  const [receipts, covers, packs, usage] = await Promise.all([
    db.receipts.toArray().then((rs) => rs.reduce((n, r) => n + r.data.length, 0)),
    db.photos.toArray().then((ps) => ps.reduce((n, p) => n + p.jpeg.byteLength, 0)),
    (async () => {
      try {
        const cache = await caches.open('ocr-packs');
        const sizes = await Promise.all((await cache.keys()).map(async (k) => (await (await cache.match(k))!.blob()).size));
        return sizes.reduce((a, b) => a + b, 0);
      } catch {
        return 0;
      }
    })(),
    navigator.storage?.estimate?.().then((e) => e.usage ?? 0, () => 0) ?? 0,
  ]);
  const known = receipts + covers + packs;
  const total = Math.max(usage, known);
  return {
    total,
    slices: [
      { label: 'Receipt photos', bytes: receipts },
      { label: 'Trip cover photos', bytes: covers },
      { label: 'Downloaded packs', bytes: packs },
      { label: 'App files and trip data', bytes: total - known },
    ],
  };
}
