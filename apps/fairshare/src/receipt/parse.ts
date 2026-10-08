import { decimals } from '../engine/money';

export interface ParsedReceipt {
  items: { name: string; price: string }[];
  /** The receipt's grand total, if a "Total" / "Amount due" line was found. */
  total: string | null;
}

// A price at the end of a line: "1,234.50", "1.234,50", "300", "₱ 300.00", "PHP 300.00", "300.00 V". OCR often reads "," for ".".
// A currency code (or "P", OCR for ₱) only counts when it stands apart, so "TOTAL" keeps its "TAL".
const PRICE_AT_END = /^(.*?)[\s.:]*(?:(?<=\s)(?:[A-Z]{3}|P)\s*|[₱$€£¥₩₹]\s*)?(-?\d{1,3}(?:[ ,.]\d{3})*(?:[.,]\d{1,3})?|-?\d+(?:[.,]\d{1,3})?)\s*[A-Z*]?$/;
const TOTAL = /\b(grand\s*total|total\s*(amount|due)?|amount\s*due|balance\s*due)\b/i;
// Lines that are money but not food: their effect is already in the total, which is shared by subtotal.
const NOT_ITEM =
  /sub\s*-?\s*total|\btax\b|\bvat|vatable|exempt|zero.?rated|service|\btip\b|gratuity|discount|\bsenior\b|\bpwd\b|change|cash|card|visa|master|amex|gcash|maya|tender|payment|paid|\bdue\b|balance|total|rounding|\bqty\b|items?\s*sold/i;

/** "1,234.50" -> "1234.50" for a currency with `d` decimals; null if it is not a usable price. */
function cleanPrice(raw: string, d: number): string | null {
  const s = raw.replace(/\s/g, '').replace(/^-/, '');
  const m = d > 0 ? new RegExp(`^(.*)[.,](\\d{${d}})$`).exec(s) : null;
  const whole = (m ? m[1] : s).replace(/[.,]/g, '');
  // In a currency with cents, receipts always print them; a bare number is a table, quantity or phone number.
  if (!/^\d+$/.test(whole) || (d > 0 && !m)) return null;
  const price = m ? `${Number(whole)}.${m[2]}` : String(Number(whole));
  return /^0(\.0+)?$/.test(price) ? null : price;
}

/** Turns OCR text into item lines and a total. Best effort: the user reviews every line before saving. */
export function parseReceipt(text: string, currency: string): ParsedReceipt {
  const d = decimals(currency);
  const items: ParsedReceipt['items'] = [];
  let total: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = PRICE_AT_END.exec(line.trim());
    if (!m) continue;
    const name = m[1].replace(/[^\p{L}\p{N})]+$/u, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const price = cleanPrice(m[2], d);
    if (!price || !/\p{L}{2}/u.test(name)) continue;
    if (TOTAL.test(name) && !/sub/i.test(name)) total = price; // the last one wins: grand total comes after subtotal
    else if (!NOT_ITEM.test(name) && !m[2].startsWith('-')) items.push({ name, price });
  }
  return { items, total };
}
