import { formatAmount } from './engine/money';

export const money = (minor: number, currency: string) => `${currency} ${formatAmount(minor, currency)}`;
export const signed = (minor: number, currency: string) =>
  minor === 0 ? money(0, currency) : `${minor > 0 ? '+' : '−'}${money(Math.abs(minor), currency)}`;

const FALLBACK = ['PHP', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'SGD', 'KRW', 'KWD'];
const CURRENCIES = (() => {
  try {
    return Intl.supportedValuesOf('currency');
  } catch {
    return FALLBACK;
  }
})();

export function CurrencySelect(props: { id?: string; label: string; value: string; onChange: (c: string) => void }) {
  return (
    <select id={props.id} aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {CURRENCIES.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}
