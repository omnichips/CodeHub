import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db';

/** Longest side of a stored cover photo. A card shows it at about 180 px wide, so this is plenty and stays small. */
const MAX_SIDE = 800;

export async function setTripPhoto(tripId: string, photo: Blob) {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read the photo'))), 'image/jpeg', 0.82));
  await db.photos.put({ tripId, jpeg: await blob.arrayBuffer() });
}

export const removeTripPhoto = (tripId: string) => db.photos.delete(tripId);

/** Object URLs of every trip's cover photo, by trip ID; revoked when the photos change or the screen closes. */
export function useTripPhotos(): Record<string, string> {
  const rows = useLiveQuery(() => db.photos.toArray(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!rows) return;
    const next = Object.fromEntries(rows.map((r) => [r.tripId, URL.createObjectURL(new Blob([r.jpeg], { type: 'image/jpeg' }))]));
    setUrls(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [rows]);
  return urls;
}
