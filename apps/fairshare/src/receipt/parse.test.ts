import { describe, expect, it } from 'vitest';
import samples from './ocr-samples.json';
import { parseReceipt } from './parse';

describe('parseReceipt', () => {
  it('reads items and the grand total from a typical restaurant receipt', () => {
    const text = `
      MANG INASAL - SM CEBU
      TIN 123-456-789-000
      08/10/2026 19:42   Table 7
      2 Chicken Inasal      398.00
      Pancit Canton         245.50
      Halo-halo .......... ₱ 1,120.00
      Iced Tea              85.00 V
      SUBTOTAL            1,848.50
      Service Charge 10%    184.85
      VAT 12%               221.82
      TOTAL               2,033.35
      CASH                3,000.00
      CHANGE                966.65
      Thank you! Call 0917 123 4567`;
    expect(parseReceipt(text, 'PHP')).toEqual({
      items: [
        { name: '2 Chicken Inasal', price: '398.00' },
        { name: 'Pancit Canton', price: '245.50' },
        { name: 'Halo-halo', price: '1120.00' },
        { name: 'Iced Tea', price: '85.00' },
      ],
      total: '2033.35',
    });
  });

  it('handles comma decimals, zero-decimal currencies and junk lines', () => {
    expect(parseReceipt('Pasta 12,50\nDiscount -2,00\nAmount due 10,50', 'EUR')).toEqual({
      items: [{ name: 'Pasta', price: '12.50' }],
      total: '10.50',
    });
    expect(parseReceipt('Ramen 1,200\nGyoza 450\nTotal 1,650', 'JPY')).toEqual({
      items: [{ name: 'Ramen', price: '1200' }, { name: 'Gyoza', price: '450' }],
      total: '1650',
    });
    expect(parseReceipt('Order 123456789\n12/10\n----\n   \nx 0.00', 'USD')).toEqual({ items: [], total: null });
  });

  it('reads a Japanese receipt, including spaced-out OCR text, full-width digits and yen signs', () => {
    const text = String.raw`
      ラーメン横丁 新宿店
      2026年10月08日 12:31
      醤 油 ラ ー メ ン        ¥980
      餃子 2点              \1,000
      生ビール               ６５０円
      水                     ¥0
      小計                  ¥2,630
      (内消費税等             ¥239)
      合 計                 ¥2,630
      お預り                ¥3,000
      お釣り                  ¥370`;
    expect(parseReceipt(text, 'JPY')).toEqual({
      items: [
        { name: '醤油ラーメン', price: '980' },
        { name: '餃子 2点', price: '1000' },
        { name: '生ビール', price: '650' },
      ],
      total: '2630',
    });
  });

  it('reads Tagalog words for total, tax and change', () => {
    const text = 'Lechon kawali   250.00\nSinigang na baboy  320.00\nBuwis   68.40\nKabuuan   638.40\nBayad  1,000.00\nSukli   361.60';
    expect(parseReceipt(text, 'PHP')).toEqual({
      items: [{ name: 'Lechon kawali', price: '250.00' }, { name: 'Sinigang na baboy', price: '320.00' }],
      total: '638.40',
    });
  });
});

// Real OCR output (tesseract.js, as the app runs it) from photos of real receipts, personal details removed.
// The expected prices include the engine's own misreads (82.00 read as 62.00, 321.00 as 21.00): this locks in what
// the parser makes of real text, so a parser change that loses items shows up here.

describe('parseReceipt on real OCR output', () => {
  it.each(samples)('$label', ({ text, currency, prices, total }) => {
    const parsed = parseReceipt(text, currency);
    expect(parsed.items.map((i) => i.price)).toEqual(prices);
    expect(parsed.total).toBe(total);
  });
});
