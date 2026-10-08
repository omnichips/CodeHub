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

/** The hare mark (same shapes as public/icon.svg, without the background). Colour comes from CSS. */
export function Hare({ size = 56 }: { size?: number }) {
  return (
    <svg className="hare" viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="158" y="56" width="76" height="210" rx="38" />
      <rect x="278" y="56" width="76" height="210" rx="38" />
      <ellipse cx="256" cy="340" rx="140" ry="118" />
      <circle className="eye" cx="306" cy="322" r="16" />
    </svg>
  );
}

export function EmptyState({ children }: { children: string }) {
  return (
    <div className="empty">
      <Hare />
      <p>{children}</p>
    </div>
  );
}
