// What a scene leaves in the save, whether it was watched, skipped or switched off: it is marked seen, and an After
// scene (or the Ending) writes its map's notebook page. London's also puts a question mark after Tokyo's number.
import data from '../data/story.json' with { type: 'json' };
import type { Story } from './types.ts';

export const story = data as Story;

export interface NotebookEntry { needed: number; got: number | null; gotLabel?: string; note?: string }
export interface StoryState { seen: string[]; notebook: Record<string, NotebookEntry> }

export const noStory = (): StoryState => ({ seen: [], notebook: {} });

/** Marks a scene seen and writes what it writes. */
export function record(st: StoryState, sceneId: string) {
  if (!st.seen.includes(sceneId)) st.seen.push(sceneId);
  const sc = story.scenes.find((s) => s.id === sceneId);
  const id = sceneId === 'ending' ? story.maps.at(-1)!.id : sceneId.startsWith('after:') ? sceneId.slice(6) : '';
  const m = story.maps.find((x) => x.id === id);
  if (!m) return;
  st.notebook[m.id] = { needed: m.needed, got: m.got, ...(m.gotLabel ? { gotLabel: m.gotLabel } : {}), ...(m.note ? { note: m.note } : {}) };
  for (const s of sc?.shots ?? []) {
    const e = s.edit && st.notebook[s.edit.page];
    if (s.edit && e && !(e.gotLabel ?? '').endsWith(s.edit.add)) e.gotLabel = `${(e.got ?? 0).toLocaleString('en-US')}${s.edit.add}`;
    else if (s.edit && !e) { // its page was never written (an old save): write it now, marked
      const t = story.maps.find((x) => x.id === s.edit!.page)!;
      st.notebook[t.id] = { needed: t.needed, got: t.got, gotLabel: `${(t.got ?? 0).toLocaleString('en-US')}${s.edit.add}`, ...(t.note ? { note: t.note } : {}) };
    }
  }
}

/** For a save from before the story: every map already cleared has its scenes marked seen (and its page written),
 *  so nobody is shown a scene for a map beaten long ago. They can still be replayed from the Story log. */
export function fromCleared(cleared: Record<string, boolean>): StoryState {
  const st = noStory(), ids = story.maps.map((m) => m.id);
  ids.forEach((id, k) => {
    if (!cleared[id]) return;
    if (k === 0) st.seen.push('opening'); else st.seen.push(`before:${id}`);
    if (k === ids.length - 1) record(st, 'ending'); else record(st, `after:${id}`);
  });
  return st;
}

/** Story state from untrusted JSON: known scene ids only, notebook pages rebuilt from the data. */
export function storyFrom(raw: unknown): StoryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { seen?: unknown };
  const st = noStory(), seen = new Set(Array.isArray(r.seen) ? r.seen : []);
  for (const sc of story.scenes) if (seen.has(sc.id)) record(st, sc.id); // in story order, so London's mark lands on Tokyo's page
  return st;
}
