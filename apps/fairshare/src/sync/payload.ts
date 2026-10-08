import { deflate, Inflate } from 'pako';
import { z } from 'zod';
import { ExpenseSchema, MemberSchema, PaymentSchema, TripSchema } from '../schemas';
import type { Snapshot } from './merge';

/** Upper bound for a payload, as text or inflated. A 60-expense trip is about 40 KB, so this is generous. */
export const MAX_SIZE = 2_000_000;
/** Characters of compressed data per QR frame. Smaller scans more reliably; larger needs fewer frames. */
export const FRAME_CHARS = 600;
const MAX_FRAMES = 500;

const NOT_FAIRSHARE = 'This is not a FairShare trip';
const DAMAGED = 'The data is damaged. Please try again';
const TOO_LARGE = 'This trip is too large to import';

const consistent = (b: Snapshot) => {
  const people = new Set(b.members.map((m) => m.id));
  const tables = [b.members, b.expenses, b.payments];
  return (
    tables.every((rs) => new Set(rs.map((r) => r.id)).size === rs.length && rs.every((r) => r.tripId === b.trip.id)) &&
    b.expenses.every((e) => [e.payerId, ...e.owed.map((o) => o.memberId), ...e.splitInputs.map((s) => s.memberId), ...(e.items ?? []).flatMap((i) => i.memberIds)].every((id) => people.has(id))) &&
    b.payments.every((p) => people.has(p.fromId) && people.has(p.toId))
  );
};

const BodySchema = z
  .object({ trip: TripSchema, members: z.array(MemberSchema), expenses: z.array(ExpenseSchema), payments: z.array(PaymentSchema) })
  .refine(consistent, { message: 'Records do not belong together' });

/** Fixed key order, so the checksum is the same on every phone. */
const bodyOf = (s: Record<string, unknown>) =>
  JSON.stringify({ trip: s.trip, members: s.members, expenses: s.expenses, payments: s.payments });

async function checksum(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One trip as text: the .fairshare file, and the input to the QR frames. `sum` identifies this exact content. */
export async function encodePayload(snapshot: Snapshot): Promise<{ text: string; sum: string }> {
  const body = BodySchema.parse(snapshot);
  const sum = await checksum(bodyOf(body));
  return { sum, text: JSON.stringify({ format: 'fairshare', version: 2, sum, ...body }) };
}

/** Validates everything before returning, so a bad payload never reaches the database. */
export async function decodePayload(text: string): Promise<Snapshot> {
  if (text.length > MAX_SIZE) throw new Error(TOO_LARGE);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(NOT_FAIRSHARE);
  }
  if (!raw || typeof raw !== 'object' || raw.format !== 'fairshare' || (raw.version !== 1 && raw.version !== 2)) throw new Error(NOT_FAIRSHARE);
  // Version 1 files (phase 3 backups) have no checksum.
  if (raw.version === 2 && raw.sum !== (await checksum(bodyOf(raw)))) throw new Error(DAMAGED);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) throw new Error('This FairShare trip has invalid data');
  return parsed.data;
}

// ---- QR frames: "FS1.<id>.<index>.<count>.<base64 chunk>" ----

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function toFrames(text: string, sum: string): string[] {
  const data = toB64(deflate(new TextEncoder().encode(text), { level: 9 }));
  const count = Math.ceil(data.length / FRAME_CHARS);
  return Array.from({ length: count }, (_, i) => `FS1.${sum.slice(0, 8)}.${i}.${count}.${data.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS)}`);
}

/** Inflates with a size cap, so a tiny crafted code cannot expand into gigabytes. */
function inflateToText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  const inflator = new Inflate();
  inflator.onData = (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) throw new Error(TOO_LARGE);
    text += utf8.decode(chunk, { stream: true });
  };
  inflator.push(bytes, true);
  if (inflator.err) throw new Error(DAMAGED);
  return text + utf8.decode();
}

const FRAME = /^FS1\.([0-9a-f]{8})\.(\d{1,3})\.(\d{1,3})\.([A-Za-z0-9+/=]+)$/;

/** Collects frames in any order. A frame from a different trip starts the collection over. */
export function createCollector() {
  let id = '';
  let count = 0;
  let chunks = new Map<number, string>();
  return {
    add(frame: string) {
      const m = FRAME.exec(frame);
      if (!m) return;
      const [i, n] = [Number(m[2]), Number(m[3])];
      if (n < 1 || n > MAX_FRAMES || i >= n) return;
      if (m[1] !== id || n !== count) {
        [id, count, chunks] = [m[1], n, new Map()];
      }
      chunks.set(i, m[4]);
    },
    get have() {
      return chunks.size;
    },
    get total() {
      return count;
    },
    get complete() {
      return count > 0 && chunks.size === count;
    },
    /** The reassembled payload text. Run it through decodePayload before trusting it. */
    text(): string {
      let bytes: Uint8Array;
      try {
        const data = Array.from({ length: count }, (_, i) => chunks.get(i)).join('');
        bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      } catch {
        throw new Error(DAMAGED);
      }
      try {
        return inflateToText(bytes);
      } catch (e) {
        throw new Error((e as Error).message === TOO_LARGE ? TOO_LARGE : DAMAGED);
      }
    },
  };
}
