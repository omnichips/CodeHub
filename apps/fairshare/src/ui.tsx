import { useId } from 'react';
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

/**
 * Loading screen: the hare pops out of its burrow and ducks back in, on a loop. It fades in after a short delay
 * (styles.css), so a quick load shows nothing at all. Same shapes as the mark, scaled from its 512 grid.
 */
export function BunnyLoader({ label }: { label: string }) {
  const clip = useId();
  return (
    <div className="loader" role="status">
      <svg viewBox="0 0 120 110" width="140" height="128" aria-hidden="true" focusable="false">
        <ellipse className="burrow-ground" cx="60" cy="92" rx="46" ry="10" />
        <ellipse className="burrow-hole" cx="60" cy="92" rx="30" ry="7" />
        <clipPath id={clip}>
          <rect x="0" y="0" width="120" height="92" />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <g className="burrow-hare">
            <g className="hare" transform="translate(26.7 32.5) scale(0.13)">
              <rect className="ear" x="158" y="56" width="76" height="210" rx="38" />
              <rect className="ear ear-right" x="278" y="56" width="76" height="210" rx="38" />
              <ellipse cx="256" cy="340" rx="140" ry="118" />
              <circle className="eye" cx="306" cy="322" r="16" />
            </g>
          </g>
        </g>
      </svg>
      <p>{label}</p>
    </div>
  );
}

/** Asks before using mobile data. Nothing downloads until "Download" is tapped; the app never downloads on its own. */
export function DownloadAsk(props: { what: string; size: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="card ask" role="group" aria-label={`Download ${props.what}?`}>
      <p>
        Download <strong>{props.what}</strong>? It is about {props.size} and needs an internet connection. If you are on mobile data it will use some of your plan. After this it works offline.
      </p>
      <div className="two">
        <button className="primary" onClick={props.onYes}>Download</button>
        <button onClick={props.onNo}>Not now</button>
      </div>
    </div>
  );
}
