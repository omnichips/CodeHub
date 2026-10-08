import { describe, expect, it } from 'vitest';
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
});
