// The story's data (src/data/story.json): its shape, the closed lists everything in it is drawn from, and a check that
// fails on anything else (an unknown speaker, motion, backdrop or vehicle).

export type Voice = 'person' | 'radio' | 'loudspeaker' | 'jec';
export type Camera = 'hold' | 'drift-left' | 'drift-right' | 'tilt-up' | 'pan-north' | 'pan-south' | 'descend' | 'pull-back' | 'push-in' | 'follow-tracks';
export type ShotType = 'title' | 'map' | 'diorama' | 'closeup' | 'notebook' | 'travel';
export type Member = 'reyes' | 'pike' | 'dunne' | 'hollis' | 'okoye' | 'vega';

export interface Line { who: string; voice?: Voice; pages: string[]; gloss?: string; pauseBefore?: number[] } // pauseBefore: page indices, a [pause] each (twice for a long one)
export interface Shot {
  type: ShotType;
  ms: number; // a minimum: the shot lasts until its last line has been read
  camera?: Camera;
  backdrop?: string;
  object?: 'radio' | 'loudspeaker' | 'pencil';
  motion?: string[];
  lines?: Line[];
  silence?: boolean | number; // seconds
  leaves?: Exclude<Member, 'reyes' | 'dunne'>;
  objective?: string;
  overlay?: 'title';
  paper?: boolean;
  dropout?: boolean;
  optional?: boolean;
  page?: string; // notebook: a map id, or 'names'
  edit?: { page: string; after: 'got'; add: string };
  vehicle?: string;
  from?: number;
  to?: number;
  sky?: Sky;
  text?: string; // a title card's own text (the sting)
  clock?: string[]; // times typed over the picture one after another (HH:MM)
  beats?: string; // what happens, for whoever stages it; never shown
}
export interface Scene { id: string; day: number; time: string; shots: Shot[] }
export interface MapRow {
  id: string; short: string; place: string; day: number; stage: 1 | 2 | 3 | 4 | 5; posture: 1 | 2 | 3 | 4;
  squad: number; needed: number; got: number | null; gotLabel?: string; note?: string;
}
export interface Story { maps: MapRow[]; scenes: Scene[] }

export const SHOTS: ShotType[] = ['title', 'map', 'diorama', 'closeup', 'notebook', 'travel'];
export const CAMERAS: Camera[] = ['hold', 'drift-left', 'drift-right', 'tilt-up', 'pan-north', 'pan-south', 'descend', 'pull-back', 'push-in', 'follow-tracks'];
export const MOTIONS = ['idle2', 'walk4', 'loop3', 'ripple2', 'sway2', 'tilt', 'lurch', 'slide', 'flicker3', 'led', 'tear', 'flash', 'dither-out', 'silence'];
export const BACKDROPS = ['street-night', 'school-lot', 'chicago-pier', 'new-york-avenue', 'new-york-harbor', 'manila-alley', 'manila-river-port', 'mexico-square', 'rome-arches', 'rome-depot', 'tokyo-crossing', 'tokyo-platform', 'london-bridge', 'white-house-lawn'];
export const VEHICLES = ['bus', 'ferry', 'ship', 'helicopter', 'cargo-helicopter', 'train-6car', 'cargo-plane', 'army-truck', 'freight-train'];
export const SKIES = ['night', 'dawn', 'grey', 'pink', 'noon', 'dark'] as const;
export type Sky = (typeof SKIES)[number];
export const OBJECTS = ['radio', 'loudspeaker', 'pencil'];
export const MEMBERS: Member[] = ['reyes', 'pike', 'dunne', 'hollis', 'okoye', 'vega'];
/** The order the squad leaves in: one per map row's squad size below six. */
export const DEPARTURES = ['hollis', 'okoye', 'pike', 'vega'] as const;

/** Who can speak, and in what voice. Before Tokyo JEC talks like the radio; from Tokyo: Before on, in its own voice. */
const PEOPLE = ['Reyes', 'Pike', 'Dunne', 'Hollis', 'Okoye', 'Vega', 'Lola', 'Vendor', 'Harbor master', 'Captain', 'Pilot', 'South bank commander'];
export const SPEAKERS: Record<string, Voice> = { ...Object.fromEntries(PEOPLE.map((p) => [p, 'person'])), Nora: 'radio', Radio: 'radio', JEC: 'radio', Loudspeaker: 'loudspeaker' };
const JEC_FROM = 'before:tokyo';

/** Every scene, in the order they play. */
export function sceneIds(mapIds: string[]) {
  return ['opening', ...mapIds.flatMap((id, k) => [...(k ? [`before:${id}`] : []), ...(k < mapIds.length - 1 ? [`after:${id}`] : [])]), 'ending'];
}

/** The voice a line is spoken in: its own, or its speaker's (JEC's changes at Tokyo). */
export function voiceOf(line: Line, sceneId: string, order: string[]): Voice {
  if (line.voice) return line.voice;
  if (line.who === 'JEC' && order.indexOf(sceneId) >= order.indexOf(JEC_FROM)) return 'jec';
  return SPEAKERS[line.who] ?? 'person';
}

/** The map a scene belongs to: the Opening is Main Street's, the Ending the White House's. */
export function mapOf(sceneId: string, story: Story) {
  const id = sceneId === 'opening' ? story.maps[0].id : sceneId === 'ending' ? story.maps.at(-1)!.id : sceneId.split(':')[1];
  return story.maps.find((m) => m.id === id)!;
}

/** Everything wrong with the story: [] if it is sound. */
export function validate(story: Story, mapIds: string[]): string[] {
  const errors: string[] = [], err = (where: string, what: string) => errors.push(`${where}: ${what}`);
  const ids = sceneIds(mapIds), have = story.scenes.map((s) => s.id);
  for (const id of ids) if (!have.includes(id)) err(id, 'missing');
  for (const id of have) if (!ids.includes(id)) err(id, 'not a scene');
  if (story.maps.map((m) => m.id).join() !== mapIds.join()) err('maps', `must be ${mapIds.join(', ')} in order`);
  for (const m of story.maps) {
    if (!(m.stage >= 1 && m.stage <= 5 && m.posture >= 1 && m.posture <= 4 && m.squad >= 2 && m.squad <= 6)) err(m.id, 'stage, posture or squad out of range');
    if (m.got === null && !m.gotLabel) err(m.id, 'no got and no label for it');
  }
  for (const sc of story.scenes) {
    if (!Number.isInteger(sc.day) || !/^\d\d:\d\d$/.test(sc.time ?? '')) err(sc.id, 'day or time');
    sc.shots.forEach((s, k) => {
      const at = `${sc.id} #${k + 1}`;
      if (!SHOTS.includes(s.type)) err(at, `type ${s.type}`);
      if (!(s.ms > 0)) err(at, 'ms');
      if (s.camera && !CAMERAS.includes(s.camera)) err(at, `camera ${s.camera}`);
      for (const m of s.motion ?? []) if (!MOTIONS.includes(m)) err(at, `motion ${m}`);
      if (s.type === 'diorama' && !BACKDROPS.includes(s.backdrop ?? '')) err(at, `backdrop ${s.backdrop}`);
      if (s.type === 'closeup' && !OBJECTS.includes(s.object ?? '')) err(at, `object ${s.object}`);
      if (s.type === 'travel' && (!VEHICLES.includes(s.vehicle ?? '') || !(s.from! < s.to!) || !SKIES.includes(s.sky!))) err(at, 'vehicle, days or sky');
      if (s.type === 'notebook' && s.page !== 'names' && !mapIds.includes(s.page ?? '')) err(at, `page ${s.page}`);
      if (s.edit && !mapIds.includes(s.edit.page)) err(at, `edit of page ${s.edit.page}`);
      if (s.clock?.some((c) => !/^\d\d:\d\d$/.test(c))) err(at, 'clock');
      if (s.leaves && !(DEPARTURES as readonly string[]).includes(s.leaves)) err(at, `leaves ${s.leaves}`);
      for (const l of s.lines ?? []) {
        if (!(l.who in SPEAKERS)) err(at, `speaker ${l.who}`);
        if (!l.pages?.length || l.pages.some((p) => typeof p !== 'string' || !p.trim())) err(at, `${l.who}: empty page`);
        if (l.pauseBefore?.some((i) => !(i >= 0 && i < l.pages.length))) err(at, `${l.who}: pause before no page`);
      }
    });
  }
  return errors;
}
