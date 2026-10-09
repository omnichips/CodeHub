import { decimals, parseAmount } from '../engine/money';

export interface ParsedReceipt {
  items: { name: string; price: string }[];
  /** The receipt's grand total, if a "Total" / "Amount due" / 合計 / Kabuuan line was found. */
  total: string | null;
  /** The receipt's subtotal (before tax, service, discounts), if it prints one. */
  subtotal?: string;
}

// A price at the end of a line: "1,234.50", "1.234,50", "300", "₱ 300.00", "PHP 300.00", "300.00 V", "¥1,200", "1,200円",
// "¥1,360外". OCR often reads "," for ".". A space is never a thousands separator: "@33.50 100.50" is two numbers.
// A currency code (or "P", OCR for ₱) only counts when it stands apart, so "TOTAL" keeps its "TAL".
// "\" is how many Japanese receipt fonts print ¥; 外 and 内 mark tax added or included.
const PRICE_AT_END = /^(.*?)[\s.:]*(?:\s(?:[A-Z]{3}|P)\s*|[₱$€£¥₩₹\\]\s*)?(-?\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,3})?|-?\d+(?:[.,]\d{1,3})?)\s*(?:円|[A-Z*※外内])?$/;
// English, Tagalog and Japanese words. Japanese has no word boundaries, so its words match anywhere in the name.
const TOTAL = /\b(grand\s*total|total\s*(amount|due)?|amount\s*due|balance\s*due|kabuuan)\b|合計|お会計/i;
const SUBTOTAL = /sub\s*-?\s*total|小計/i;
// Lines that are money but not something bought: their effect is already in the total, which is shared by subtotal.
const NOT_ITEM = new RegExp(
  [
    String.raw`sub\s*-?\s*total|\btax\b|\bvat|vatable|exempt|rated|\bsales\b|service|\btip\b|gratuity|discount|\bsenior\b|\bpwd\b`,
    String.raw`change|cash|card|visa|master|amex|gcash|maya|\batm\b|tender|payment|paid|\bdue\b|balance|total|amount|rounding|points?\b`,
    String.raw`\bqty\b|items?\s*sold|\btel\b|\bno\.?$`, // "No." at the end: a table, slip or till number
    'sukli|buwis|bayad|diskwento|kabuuan', // Tagalog: change, tax, payment, discount, total
    '小計|合計|会計|現計|税|預|釣|現金|クレジット|カード|値引|割引|ポイント|点数|買上|支払|対象|サービス|電話|伝票|テーブル|レジ', // Japanese
  ].join('|'),
  'i',
);
// Dates and times are never items: "12/19/2022", "2019年 7月18日", "19:44".
const DATE_OR_TIME = /\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}\s*年|\d:\d{2}/;
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々`;
// Japanese OCR output often has a space between every character: "ラ ー メ ン" -> "ラーメン".
const CJK_GAP = new RegExp(String.raw`([${CJK}])\s+(?=[${CJK}])`, 'gu');
// A name needs two letters, or one Japanese character (水 is a whole item).
const NAMEISH = new RegExp(String.raw`\p{L}{2}|[${CJK}]`, 'u');
// A real word: two letters in a token with no digits ("Sprite", not a barcode such as "7489BSBOIAS").
const WORDY = new RegExp(String.raw`(?:^|\s)[^\s\d]*\p{L}{2}[^\s\d]*(?=\s|$)|[${CJK}]`, 'u');

/** "1,234.50" -> "1234.50" for a currency with `d` decimals; null if it is not a usable price. */
function cleanPrice(raw: string, d: number): string | null {
  const s = raw.replace(/^-/, '');
  const m = d > 0 ? new RegExp(`^(.*)[.,](\\d{${d}})$`).exec(s) : null;
  const whole = (m ? m[1] : s).replace(/[.,]/g, '');
  // In a currency with cents, receipts always print them; a bare number is a table, quantity or phone number.
  if (!/^\d+$/.test(whole) || (d > 0 && !m)) return null;
  // Without cents (yen, won), a price under 10 is a house number, table or count.
  if (d === 0 && Number(whole) < 10) return null;
  const price = m ? `${Number(whole)}.${m[2]}` : String(Number(whole));
  return /^0(\.0+)?$/.test(price) ? null : price;
}

const tidy = (s: string) => s.replace(/[^\p{L}\p{N})]+$/u, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

/**
 * Turns OCR text into item lines and a total. Best effort: the user reviews every line before saving.
 * Handles the two-line layout of supermarket receipts (name, then "qty barcode price amount") and the Japanese
 * "@unit x qty total" line under an item.
 */
export function parseReceipt(text: string, currency: string): ParsedReceipt {
  const d = decimals(currency);
  const items: ParsedReceipt['items'] = [];
  let total: string | null = null;
  let subtotal: string | undefined;
  // The line before: its text when it had no price (a name waiting for one), or the item it became.
  let prev: { text?: string; item?: ParsedReceipt['items'][number] } = {};
  // NFKC turns full-width digits and signs (１,２００, ￥) into plain ones.
  for (const line of text.normalize('NFKC').split(/\r?\n/)) {
    const clean = line.trim().replace(CJK_GAP, '$1');
    const m = PRICE_AT_END.exec(clean);
    const price = m && !DATE_OR_TIME.test(clean) ? cleanPrice(m[2], d) : null;
    if (!m || !price || m[2].startsWith('-')) {
      prev = DATE_OR_TIME.test(clean) ? {} : { text: tidy(clean) };
      continue;
    }
    let name = tidy(m[1]);
    if (!WORDY.test(name)) {
      if (prev.text && WORDY.test(prev.text)) name = prev.text; // name on the line above
      else if (prev.item && !/\p{L}/u.test(name)) {
        prev.item.price = price; // "@97 15 ¥1,455" under "寿司皿90円": the line total wins
        prev = {};
        continue;
      }
    }
    prev = {};
    if (!NAMEISH.test(name)) continue;
    if (SUBTOTAL.test(name)) subtotal = price;
    else if (TOTAL.test(name)) total = price; // the last one wins: grand total comes after subtotal
    else if (!NOT_ITEM.test(name)) items.push((prev.item = { name, price }));
  }
  return { items, total, ...(subtotal && { subtotal }) };
}

/**
 * Do the items add up? To the subtotal if the receipt prints one; otherwise they must not be more than the total (the
 * rest is tax, service or a tip). Amounts in minor units. null when the receipt has neither, so there is nothing to check.
 */
export function checkSum(r: ParsedReceipt, currency: string) {
  const sum = r.items.reduce((a, i) => a + parseAmount(i.price, currency), 0);
  if (r.subtotal) {
    const expected = parseAmount(r.subtotal, currency);
    return { ok: sum === expected, sum, expected, against: 'subtotal' as const };
  }
  if (r.total) {
    const expected = parseAmount(r.total, currency);
    return { ok: sum <= expected, sum, expected, against: 'total' as const };
  }
  return null;
}

/**
 * How good a reading is. `good`: it found items, and they add up when the receipt says what they should add up to.
 * `score` ranks two readings of one photo: items matching the subtotal beat everything (the strongest check), then
 * more items; "not more than the total" only breaks ties, since a reading that missed items passes it too.
 */
export function rateReading(text: string, currency: string) {
  const r = parseReceipt(text, currency);
  const c = checkSum(r, currency);
  return { good: r.items.length > 0 && (c?.ok ?? true), score: (c?.ok && c.against === 'subtotal' ? 1000 : 0) + r.items.length * 2 + (c?.ok ? 1 : 0) };
}
