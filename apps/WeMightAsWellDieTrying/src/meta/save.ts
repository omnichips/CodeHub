// Progress kept on the device. Every app on the hub shares one origin, so the key is this game's own. A save carries a
// version so an older one can be brought up to date; export and import guard against a wiped browser.
import { NODE, STARTING } from './progress.ts';

export interface Settings {
  gore: 'none' | 'some' | 'normal';
  quality: 'low' | 'medium' | 'high';
  lefty: boolean;
  master: number; // 0 to 1
  sfx: number;
}
export interface Save {
  version: 1;
  chips: number;
  owned: string[]; // skill web nodes
  cleared: Record<string, boolean>; // maps won
  tutorialDone: boolean;
  settings: Settings;
}

const KEY = 'dietrying.save';
export const VERSION = 1;

export const fresh = (): Save => ({
  version: VERSION, chips: 0, owned: [...STARTING], cleared: {}, tutorialDone: false,
  settings: { gore: 'normal', quality: 'high', lefty: false, master: 0.8, sfx: 0.8 },
});

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

/** Reads a save from untrusted JSON (storage or an imported file). Anything unusable is dropped or reset, never
 *  trusted: unknown nodes, negative or non-number chips. Returns undefined if it is not a save at all. */
export function parse(text: string): Save | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return;
  }
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || r.version < 1 || r.version > VERSION || !Array.isArray(r.owned)) return;
  // (Later versions migrate here, one step at a time: if (r.version === 1) { ...; r.version = 2 }.)
  const base = fresh(), s = (r.settings ?? {}) as Record<string, unknown>;
  const owned = new Set([...STARTING, ...r.owned.filter((id): id is string => typeof id === 'string' && NODE.has(id))]);
  const cleared = r.cleared && typeof r.cleared === 'object' ? Object.fromEntries(Object.entries(r.cleared).filter(([, v]) => v === true)) : {};
  return {
    version: VERSION,
    chips: typeof r.chips === 'number' && Number.isFinite(r.chips) ? Math.max(0, Math.floor(r.chips)) : 0,
    owned: [...owned],
    cleared,
    tutorialDone: r.tutorialDone === true,
    settings: {
      gore: pick(s.gore, ['none', 'some', 'normal'] as const, base.settings.gore),
      quality: pick(s.quality, ['low', 'medium', 'high'] as const, base.settings.quality),
      lefty: s.lefty === true,
      master: unit(s.master, base.settings.master),
      sfx: unit(s.sfx, base.settings.sfx),
    },
  };
}

/** The save on this device, or a fresh one. Storage can be blocked (private mode): then progress lasts the session. */
export function load(): Save {
  try {
    const text = localStorage.getItem(KEY);
    return (text && parse(text)) || fresh();
  } catch {
    return fresh();
  }
}

export function store(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Full or blocked storage: the export button is the way to keep progress then.
  }
}

/** Offers the save as a file to keep. */
export function exportSave(save: Save) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' })),
    download: `die-trying-save-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
