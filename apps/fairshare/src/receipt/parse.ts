import { decimals } from '../engine/money';

export interface ParsedReceipt {
  items: { name: string; price: string }[];
  /** The receipt's grand total, if a "Total" / "Amount due" / 合計 / Kabuuan line was found. */
  total: string | null;
}

// A price at the end of a line: "1,234.50", "1.234,50", "300", "₱ 300.00", "PHP 300.00", "300.00 V", "¥1,200", "1,200円".
// OCR often reads "," for ".". A currency code (or "P", OCR for ₱) only counts when it stands apart, so "TOTAL" keeps
// its "TAL". "\" is how many Japanese receipt fonts print ¥.
const PRICE_AT_END = /^(.*?)[\s.:]*(?:(?<=\s)(?:[A-Z]{3}|P)\s*|[₱$€£¥₩₹\\]\s*)?(-?\d{1,3}(?:[ ,.]\d{3})*(?:[.,]\d{1,3})?|-?\d+(?:[.,]\d{1,3})?)\s*(?:円|[A-Z*※])?$/;
// English, Tagalog and Japanese words. Japanese has no word boundaries, so its words match anywhere in the name.
const TOTAL = /\b(grand\s*total|total\s*(amount|due)?|amount\s*due|balance\s*due|kabuuan)\b|合計|お会計/i;
const SUBTOTAL = /sub\s*-?\s*total|小計/i;
// Lines that are money but not food: their effect is already in the total, which is shared by subtotal.
const NOT_ITEM = new RegExp(
  [
    String.raw`sub\s*-?\s*total|\btax\b|\bvat|vatable|exempt|zero.?rated|service|\btip\b|gratuity|discount|\bsenior\b|\bpwd\b`,
    String.raw`change|cash|card|visa|master|amex|gcash|maya|tender|payment|paid|\bdue\b|balance|total|rounding|\bqty\b|items?\s*sold`,
    'sukli|buwis|bayad|diskwento|kabuuan', // Tagalog: change, tax, payment, discount, total
    '小計|合計|会計|税|預|釣|現金|クレジット|カード|値引|割引|ポイント|点数|買上|支払|対象', // Japanese
  ].join('|'),
  'i',
);
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々`;
// Japanese OCR output often has a space between every character: "ラ ー メ ン" -> "ラーメン".
const CJK_GAP = new RegExp(String.raw`(?<=[${CJK}])\s+(?=[${CJK}])`, 'gu');
// A name needs two letters, or one Japanese character (水 is a whole item).
const NAMEISH = new RegExp(String.raw`\p{L}{2}|[${CJK}]`, 'u');

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
  // NFKC turns full-width digits and signs (１,２００, ￥) into plain ones.
  for (const line of text.normalize('NFKC').split(/\r?\n/)) {
    const clean = line.trim().replace(CJK_GAP, '');
    const m = PRICE_AT_END.exec(clean);
    if (!m || /\d:\d{2}$/.test(clean)) continue; // a time such as 12:31, not ¥31
    const name = m[1].replace(/[^\p{L}\p{N})]+$/u, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const price = cleanPrice(m[2], d);
    if (!price || !NAMEISH.test(name)) continue;
    if (TOTAL.test(name) && !SUBTOTAL.test(name)) total = price; // the last one wins: grand total comes after subtotal
    else if (!NOT_ITEM.test(name) && !m[2].startsWith('-')) items.push({ name, price });
  }
  return { items, total };
}
