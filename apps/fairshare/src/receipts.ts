import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ReceiptPhoto } from './schemas';

/** Longest side of a stored receipt photo: readable when zoomed, about 100 KB, so a trip of them still travels in a file. */
const MAX_SIDE = 1000;

/** A receipt photo as stored and synced: shrunk JPEG, base64 text. */
export async function receiptFromBlob(tripId: string, photo: Blob): Promise<ReceiptPhoto> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read the photo'))), 'image/jpeg', 0.7));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { id: crypto.randomUUID(), tripId, data: btoa(text) };
}

export const photoSrc = (p: ReceiptPhoto) => `data:image/jpeg;base64,${p.data}`;

/** Saved photos by id. A photo missing from this phone (the expense came by QR code, which carries no photos) is left out. */
export function useReceiptPhotos(ids: string[]): Record<string, ReceiptPhoto> {
  const rows = useLiveQuery(() => db.receipts.bulkGet(ids), [ids.join(',')]);
  return Object.fromEntries((rows ?? []).flatMap((r) => (r ? [[r.id, r]] : [])));
}
