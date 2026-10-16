// Progress kept on the device: up to SLOTS saves, each its own chips, skills, cities and statistics, plus one set of
// settings shared by all. Every app on the hub shares one origin, so the keys are this game's own. A save carries a
// version so an older one can be brought up to date; export and import guard against a wiped browser.
import oldCosts from '../data/skilltree-v2-costs.json' with { type: 'json' };
import { PRIORITIES, ROADBLOCKS, STRUCTS, UNITS, type Setup } from '../sim/world.ts';
import { NODE, STARTING } from './progress.ts';

export interface Settings {
  gore: 'none' | 'some' | 'normal';
  quality: 'low' | 'medium' | 'high';
  lefty: boolean;
  bodies: number; // most dead bodies left lying at once (fewer is lighter on a slow device); 0 for none
  master: number; // 0 to 1
  sfx: number;
  music: number;
}
export interface Stats {
  runs: number;
  wins: number;
  kills: number;
  leaks: number;
  chips: number; // earned, all told
  time: number; // seconds of fighting
}
export interface Save {
  version: 4;
  name: string;
  chips: number;
  skills: Record<string, number>; // skill web node: levels bought
  cleared: Record<string, boolean>; // maps won
  tutorialDone: boolean;
  stats: Stats;
  setups: Record<string, Setup>; // each city's defence as it was last started, to put down again
  played: number; // when it was last opened, ms since 1970
}

export const SLOTS = 3;
/** The choices for how many dead bodies may lie about at once. */
export const BODIES = [0, 50, 150, 300];
export const VERSION = 4;
const key = (slot: number) => (slot ? `dietrying.save.${slot + 1}` : 'dietrying.save'); // slot 1 keeps the key of the days before slots
const SETTINGS = 'dietrying.settings';

export const noStats = (): Stats => ({ runs: 0, wins: 0, kills: 0, leaks: 0, chips: 0, time: 0 });
export const fresh = (name = 'Save'): Save => ({ version: VERSION, name, chips: 0, skills: { ...STARTING }, cleared: {}, tutorialDone: false, stats: noStats(), setups: {}, played: Date.now() });
export const defaults = (): Settings => ({ gore: 'normal', quality: 'high', lefty: false, bodies: 300, master: 0.8, sfx: 0.8, music: 0.6 });

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 500) : []).filter((o): o is Record<string, unknown> => !!o && typeof o === 'object');
const finite = (o: Record<string, unknown>, ...keys: string[]) => keys.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]));
/** A kept setup from untrusted JSON: only known kinds and finite numbers; the world checks where things fit. */
function setupFrom(raw: unknown): Setup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    soldiers: list(r.soldiers).filter((o) => (o.kind as string) in UNITS && o.kind !== 'turret' && finite(o, 'x', 'y', 'angle', 'reach')).map((o) => ({
      kind: o.kind as Setup['soldiers'][number]['kind'], x: o.x as number, y: o.y as number, angle: o.angle as number, reach: o.reach as number,
      priority: pick(o.priority, PRIORITIES, 'nearest'),
      turrets: list(o.turrets).filter((t) => finite(t, 'x', 'y', 'angle', 'reach')).map((t) => ({ x: t.x as number, y: t.y as number, angle: t.angle as number, reach: t.reach as number })),
    })),
    blocks: list(r.blocks).filter((o) => (o.kind as string) in ROADBLOCKS && finite(o, 'tx', 'ty')).map((o) => ({ kind: o.kind as Setup['blocks'][number]['kind'], tx: o.tx as number, ty: o.ty as number, vertical: o.vertical === true })),
    props: list(r.props).filter((o) => finite(o, 'tx', 'ty')).map((o) => ({ tx: o.tx as number, ty: o.ty as number, vertical: o.vertical === true })),
    structures: list(r.structures).filter((o) => (o.kind as string) in STRUCTS && finite(o, 'tx', 'ty', 'angle')).map((o) => ({ kind: o.kind as Setup['structures'][number]['kind'], tx: o.tx as number, ty: o.ty as number, vertical: o.vertical === true, angle: o.angle as number })),
  };
}
const json = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
const RENAMED: Record<string, string> = { harlem: 'london', 'red-hook': 'white-house', 'wall-street': 'rome', 'times-square': 'tokyo', brooklyn: 'chicago', queens: 'manila', 'central-park': 'mexico' };

/** Reads a save from untrusted JSON (storage or an imported file). Anything unusable is dropped or reset, never
 *  trusted: unknown nodes, negative or non-number chips. Returns undefined if it is not a save at all. */
export function parse(text: string): Save | undefined {
  const raw = json(text);
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || r.version < 1 || r.version > VERSION) return;
  // Version 1 had no name or statistics, and kept the settings inside the save; those now live apart (see settingsFrom).
  // Versions 1 and 2 owned nodes of the old skill web, one buy each. The web was rebuilt with levels in version 3, so
  // an older save starts the new web afresh and gets back every chip it spent on the old one.
  let refund = 0;
  const skills: Record<string, number> = { ...STARTING };
  if (r.version < 3) {
    if (!Array.isArray(r.owned)) return;
    for (const id of new Set(r.owned)) if (typeof id === 'string') refund += (oldCosts as Record<string, number>)[id] ?? 0;
  } else {
    if (!r.skills || typeof r.skills !== 'object') return;
    for (const [id, lv] of Object.entries(r.skills)) {
      const n = NODE.get(id);
      if (n && typeof lv === 'number' && lv > 0) skills[id] = Math.max(skills[id] ?? 0, Math.min(n.max, Math.floor(lv)));
    }
  }
  // Four New York maps were swapped for cities in October 2026, and Brooklyn, Queens and Central Park became Chicago,
  // Manila and Mexico City; one cleared counts as the city now in its place.
  const cleared = r.cleared && typeof r.cleared === 'object' ? Object.fromEntries(Object.entries(r.cleared).filter(([, v]) => v === true).map(([id]) => [RENAMED[id] ?? id, true])) : {};
  const st = (r.stats ?? {}) as Record<string, unknown>;
  return {
    version: VERSION,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 24) : 'Save',
    chips: count(r.chips) + refund,
    skills,
    cleared,
    tutorialDone: r.tutorialDone === true,
    // Every map was made twice as big in version 4: a defence kept from before would land in the wrong places.
    setups: r.version < 4 ? {} : Object.fromEntries(Object.entries(r.setups && typeof r.setups === 'object' ? r.setups : {}).slice(0, 50).map(([id, v]) => [id, setupFrom(v)])),
    stats: { runs: count(st.runs), wins: count(st.wins), kills: count(st.kills), leaks: count(st.leaks), chips: count(st.chips), time: count(st.time) },
    played: count(r.played) || Date.now(), // version 1 never said
  };
}

/** Settings from untrusted JSON; anything unusable falls back to the default. */
export function settingsFrom(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, base = defaults();
  return {
    gore: pick(s.gore, ['none', 'some', 'normal'] as const, base.gore),
    quality: pick(s.quality, ['low', 'medium', 'high'] as const, base.quality),
    lefty: s.lefty === true,
    bodies: BODIES.includes(s.bodies as number) ? (s.bodies as number) : base.bodies,
    master: unit(s.master, base.master),
    sfx: unit(s.sfx, base.sfx),
    music: unit(s.music, base.music),
  };
}

// Storage can be blocked (private mode) or full: then progress lasts the session, and export is the way to keep it.
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* see above */ } };

/** The save in a slot, or undefined if the slot is empty. */
export function load(slot: number): Save | undefined {
  const text = read(key(slot)), save = text ? parse(text) : undefined;
  if (save && !(json(text!) as { name?: unknown }).name) save.name = `Save ${slot + 1}`; // from before saves had names
  return save;
}
export const store = (slot: number, save: Save) => write(key(slot), JSON.stringify(save));
export const remove = (slot: number) => write(key(slot), null);

/** The settings; before they had their own key, they lived in the (one) save. */
export function loadSettings(): Settings {
  const own = read(SETTINGS), old = read(key(0));
  return settingsFrom(own ? json(own) : old ? (json(old) as { settings?: unknown } | undefined)?.settings : undefined);
}
export const storeSettings = (s: Settings) => write(SETTINGS, JSON.stringify(s));

/** Offers the save as a file to keep. */
export function exportSave(save: Save) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(save, null, 1)], { type: 'application/json' })),
    download: `die-trying-${save.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
