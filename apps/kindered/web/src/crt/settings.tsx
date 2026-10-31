import { useState } from 'react';

export type CrtLevel = 'full' | 'light' | 'off';
const KEY = 'kindered.crt';
const LEVELS: CrtLevel[] = ['full', 'light', 'off'];

const read = (fallback: CrtLevel): CrtLevel => {
  try { const v = localStorage.getItem(KEY) as CrtLevel; return LEVELS.includes(v) ? v : fallback; } catch { return fallback; }
};

// Phones default to Light: the full effect is for the big screen.
export const applyCrt = (fallback: CrtLevel) => { document.documentElement.dataset.crt = read(fallback); };

export function CrtToggle() {
  const [level, setLevel] = useState<CrtLevel>(() => (document.documentElement.dataset.crt as CrtLevel) ?? 'full');
  const next = () => {
    const v = LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
    setLevel(v);
    document.documentElement.dataset.crt = v;
    try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
  };
  return <button className="chip" onClick={next} aria-label={`CRT effects: ${level}. Tap to change.`}>CRT: {level.toUpperCase()}</button>;
}
