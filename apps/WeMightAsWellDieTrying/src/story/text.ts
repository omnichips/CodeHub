// What the player works out from the data before it draws anything: the pages each line is shown in (at most two
// lines of the font, split at sentence ends), how long each takes to type and read, the letters a bad signal drops,
// title cards and notebook text from the map rows, and who is still in the squad. Pure, so the tests use it too.
import { wrap } from './font.ts';
import { STORY } from './storyConfig.ts';
import { DEPARTURES, MEMBERS, TAG_MOODS, mapOf, sceneIds, voiceOf, type Line, type Member, type MapRow, type Mood, type Scene, type Shot, type Story, type Voice } from './types.ts';

/** The speaker's portrait takes the bar's left end; text runs from here to the right edge, less a margin. */
export const TEXT_X = 46;
export const TEXT_W = STORY.W - TEXT_X - 4;

const SENTENCE = /(?<=[.!?…—])\s+/;

/** A page as shown: wrapped to the text width; one too long for two lines is split at sentence ends into several. */
export function fit(page: string, voice: Voice): string[][] {
  const lines = wrap(page, voice, TEXT_W);
  if (lines.length <= 2) return [lines];
  const out: string[][] = [];
  let run = '';
  for (const s of page.split(SENTENCE)) {
    const next = run ? `${run} ${s}` : s;
    if (run && wrap(next, voice, TEXT_W).length > 2) { out.push(wrap(run, voice, TEXT_W)); run = s; } else run = next;
  }
  if (run) out.push(wrap(run, voice, TEXT_W));
  return out; // a single sentence longer than two lines stays as it is: the tests catch it
}

/** Milliseconds from one letter to the next: the typing speed, more after a comma or a full stop. */
export const letterDelay = (ch: string) => 1000 / STORY.cps + (ch === ',' ? STORY.comma : '.!?…'.includes(ch) ? STORY.stop : 0);
export const typeTime = (text: string) => [...text].reduce((n, ch) => n + letterDelay(ch), 0);
export const readTime = (text: string) => STORY.readBase + STORY.readPerChar * text.length;

/** A page without its [tags], and the mood each tag sets, by the letter it comes before. */
export function untag(page: string) {
  const tags: string[] = [], moods: [number, Mood][] = [];
  let text = '';
  for (const ch of page.replace(/\s*\[([^\]]*)\]\s*/g, (_, tag: string) => (tags.push(tag.trim().toLowerCase()), '\u0001'))) {
    if (ch !== '\u0001') { text += ch; continue; }
    if (text) text += ' ';
    moods.push([text.length, TAG_MOODS[tags[moods.length]] ?? 'neutral']);
  }
  return { text: text.trimEnd(), moods };
}
/** The face at letter `k` of a page. */
export const moodAt = (moods: [number, Mood][], k: number): Mood => moods.reduce<Mood>((m, [at, mood]) => (at <= k ? mood : m), 'neutral');

/** Every page a line is shown in, with the pause before it and its moods (a page's tags, carried on to the next of
 *  the same page's parts). */
export function pagesOf(line: Line, voice: Voice) {
  return line.pages.flatMap((p, k) => {
    const pause = (line.pauseBefore ?? []).filter((i) => i === k).length * STORY.pause, u = untag(p);
    let start = 0, carry: Mood = 'neutral';
    return fit(u.text, voice).map((lines, j) => {
      const text = lines.join(' '), end = start + text.length;
      const moods: [number, Mood][] = [[0, carry], ...u.moods.filter(([at]) => at >= start && at <= end).map(([at, m]): [number, Mood] => [at - start, m])];
      carry = moods.at(-1)![1];
      start = end + 1;
      return { lines, text, pause: j ? 0 : pause, moods };
    });
  });
}

export const silenceOf = (s: Shot) => (s.silence === true ? STORY.silence : typeof s.silence === 'number' ? s.silence : 0) * 1000;

/** How long a shot runs: its minimum, or its dissolves, silence and lines if those take longer. */
export function shotLength(s: Shot, sceneId: string, order: string[]) {
  const lines = (s.lines ?? []).flatMap((l) => pagesOf(l, voiceOf(l, sceneId, order))).reduce((n, p) => n + p.pause + typeTime(p.text) + readTime(p.text), 0);
  return Math.max(s.ms, STORY.dissolve + silenceOf(s) + lines);
}
export const sceneLength = (sc: Scene, order: string[]) => sc.shots.filter((s) => !s.optional || STORY.sting).reduce((n, s) => n + shotLength(s, sc.id, order), 0);
export const planned = (sc: Scene) => sc.shots.filter((s) => !s.optional || STORY.sting).reduce((n, s) => n + s.ms, 0);

/** The share of letters the radio loses on a map (its number, 1 to 9, or 0 for the Ending). */
export function dropRate(story: Story, sceneId: string, flagged: boolean) {
  const rate = sceneId === 'ending' ? STORY.dropoutEnding : STORY.dropout[story.maps.indexOf(mapOf(sceneId, story))] ?? 0;
  return flagged ? Math.max(rate, STORY.flagged) : rate;
}
/** The text with letters lost to a bad signal (the same ones every time for the same text), and where each word
 *  that lost one starts. */
export function dropout(text: string, rate: number) {
  let seed = [...text].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [...text].map((ch) => (/[\p{L}\p{N}]/u.test(ch) && rnd() < rate ? ' ' : ch));
  const hits = new Set<number>();
  let start = 0;
  out.forEach((ch, k) => {
    if (text[k] === ' ') start = k + 1;
    else if (ch !== text[k]) hits.add(start);
  });
  return { text: out.join(''), hits };
}

const num = (n: number) => n.toLocaleString('en-US');
/** A map's tally: "Chicago: 410 / 6,000", or Rome's "Rome: 3,000 alive?". */
export const tally = (m: MapRow) => (m.got === null ? `${m.short}: ${num(m.needed)} ${m.gotLabel}` : `${m.short}: ${num(m.got)} / ${num(m.needed)}`);
/** A notebook page's line: "CHICAGO had 6,000. got 410." (Rome's has no number: see the notebook shot). */
export const notebookLine = (m: MapRow) => `${m.short.toUpperCase()} had ${num(m.needed)}. got ${m.got === null ? m.gotLabel : `${num(m.got)}.`}`;
/** A title card: "DAY 3 · 05:10 · CHICAGO", and under it the tally of the map before (none for the Opening). */
export function titleCard(sc: Scene, story: Story) {
  const m = mapOf(sc.id, story), k = story.maps.indexOf(m);
  return { text: `DAY ${sc.day} · ${sc.time} · ${m.place}`, tally: sc.id === 'opening' || k === 0 ? '' : tally(story.maps[k - 1]) };
}

/** Who has left the squad by the start of a scene: the first of the departures, as many as the map's squad is short. */
export const goneAtStart = (sceneId: string, story: Story): Member[] => [...DEPARTURES.slice(0, MEMBERS.length - mapOf(sceneId, story).squad)];

/** Every scene in order, for the Story log and the tests. */
export const order = (story: Story) => sceneIds(story.maps.map((m) => m.id));

/** A scene cut down for the Short setting: title cards and notebook pages at once, and every line over black. */
export function shortened(sc: Scene): Shot[] {
  return sc.shots.flatMap((s): Shot[] => {
    if (s.type === 'title') return [{ ...s, ms: 1500 }];
    if (s.type === 'notebook') return [{ ...s, ms: 2500 }];
    if (s.type === 'photo') return [{ ...s, ms: 3000 }]; // the squad's snapshot stays, quicker
    return s.lines?.length ? [{ type: 'title', ms: 0, lines: s.lines, leaves: s.leaves, dropout: s.dropout, text: '' }] : [];
  });
}
