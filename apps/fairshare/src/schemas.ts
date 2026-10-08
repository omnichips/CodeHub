import { z } from 'zod';
import { RATE_RE } from './engine/money';

const id = z.uuid();
const minor = z.number().int().nonnegative();
const currency = z.string().regex(/^[A-Z]{3}$/);

// Every synced record carries these four fields.
const sync = {
  ver: z.number().int().nonnegative(), // per-trip logical (Lamport) counter
  deviceId: z.string().min(1), // who wrote it; tie-break for equal ver
  deleted: z.boolean(),
  updatedAt: z.number().int().nonnegative(), // epoch ms, display only
};

export const TripSchema = z.object({
  id,
  name: z.string().trim().min(1),
  baseCurrency: currency,
  clock: z.number().int().nonnegative(), // highest ver seen in this trip
  archived: z.boolean(),
  ...sync,
});

export const MemberSchema = z.object({ id, tripId: id, name: z.string().trim().min(1), active: z.boolean(), ...sync });

/** A photo of a receipt: shrunk JPEG as base64 text, so it travels in the same JSON as everything else. Never edited, only added. */
export const ReceiptPhotoSchema = z.object({ id, tripId: id, data: z.string().max(1_500_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) });

export const SplitModeSchema = z.enum(['equal', 'exact', 'shares', 'percent', 'items']);
export const SplitInputSchema = z.object({ memberId: id, value: minor });
export const OwedSchema = z.object({ memberId: id, amountMinor: minor });
/** A receipt line, in the expense currency, shared equally by memberIds. Only on 'items' expenses. */
export const ItemSchema = z.object({ name: z.string().trim().min(1), amountMinor: minor.positive(), memberIds: z.array(id).min(1) });

export const ExpenseSchema = z
  .object({
    id,
    tripId: id,
    title: z.string().trim().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payerId: id,
    amountMinor: minor.positive(),
    currency,
    rate: z.string().regex(RATE_RE).nullable(), // "1 EUR = 65.20 PHP"; null when in the base currency
    baseAmountMinor: minor,
    splitMode: SplitModeSchema,
    splitInputs: z.array(SplitInputSchema).min(1),
    owed: z.array(OwedSchema).min(1),
    items: z.array(ItemSchema).min(1).optional(),
    receipts: z.array(id).max(12).optional(), // ids of this expense's receipt photos (see ReceiptPhotoSchema)
    ...sync,
  })
  .refine((e) => (e.splitMode === 'items') === (e.items !== undefined), { message: 'items go with the items split mode' })
  .refine((e) => e.owed.reduce((a, o) => a + o.amountMinor, 0) === e.baseAmountMinor, { message: 'owed must sum to baseAmountMinor' });

export const PaymentSchema = z
  .object({
    id,
    tripId: id,
    fromId: id,
    toId: id,
    amountMinor: minor.positive(), // base currency
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ...sync,
  })
  .refine((p) => p.fromId !== p.toId, { message: 'cannot pay yourself' });

// Never synced.
export const DeviceSchema = z.object({ deviceId: id, settings: z.record(z.string(), z.unknown()) });

export type Trip = z.infer<typeof TripSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Expense = z.infer<typeof ExpenseSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type SplitMode = z.infer<typeof SplitModeSchema>;
export type SplitInput = z.infer<typeof SplitInputSchema>;
export type Owed = z.infer<typeof OwedSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type ReceiptPhoto = z.infer<typeof ReceiptPhotoSchema>;
