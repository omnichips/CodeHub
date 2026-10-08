// All money is an integer in minor units. No floats anywhere in this file.

export const RATE_RE = /^1 ([A-Z]{3}) = (\d+(?:\.\d+)?) ([A-Z]{3})$/;

/** Minor-unit digits for a currency: 2 for USD/PHP, 0 for JPY, 3 for KWD. Throws on unknown codes. */
export function decimals(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "12.5" with d=2 -> 1250. Rejects negatives, too many decimals, and anything non-numeric. */
export function parseUnits(text: string, d: number): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m || (m[2] ?? '').length > d) throw new Error(`Invalid number: ${text}`);
  const n = Number(m[1] + (m[2] ?? '').padEnd(d, '0'));
  if (!Number.isSafeInteger(n)) throw new Error(`Number too large: ${text}`);
  return n;
}

export const parseAmount = (text: string, currency: string) => parseUnits(text, decimals(currency));

/** 1250 -> "12.50" (digits only; the caller adds the code or symbol). */
export function formatAmount(minor: number, currency: string): string {
  const d = decimals(currency);
  const s = String(Math.abs(minor)).padStart(d + 1, '0');
  return (minor < 0 ? '-' : '') + (d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s);
}

/** Parses "1 EUR = 65.20 PHP" into an exact fraction n/d. */
export function parseRate(text: string) {
  const m = RATE_RE.exec(text.trim());
  if (!m) throw new Error(`Invalid rate: ${text}`);
  const [whole, frac = ''] = m[2].split('.');
  const n = BigInt(whole + frac);
  if (n === 0n) throw new Error('Rate must be above zero');
  return { from: m[1], to: m[3], n, d: 10n ** BigInt(frac.length) };
}

/** Converts minor units using the typed rate, rounding half up once. */
export function convertMinor(amountMinor: number, rateText: string, from: string, to: string): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error('Amount must be a non-negative integer');
  const r = parseRate(rateText);
  if (r.from !== from || r.to !== to) throw new Error(`Rate "${rateText}" does not convert ${from} to ${to}`);
  const num = BigInt(amountMinor) * r.n * 10n ** BigInt(decimals(to));
  const den = r.d * 10n ** BigInt(decimals(from));
  return Number((2n * num + den) / (2n * den));
}
