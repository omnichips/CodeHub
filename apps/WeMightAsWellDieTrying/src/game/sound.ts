// Sound. Shots and small explosions are made by code like the art: each a short buffer of shaped noise and a falling
// tone, built once. The rest are recordings (src/sounds): the A-10, the missile, big blasts, the wave alarm, and the
// soldiers' voice lines over the radio when one is picked (scripts/voices.ts), and the
// zombies, whose groans, death rattles and the horde's growl underneath it all. Anti-noise rules keep a big fight from turning into a roar:
//  - same-class shots close together merge into the one already playing, which gets a little louder instead;
//  - a cap on how many copies of one sound, and how many sounds in all, play at once;
//  - every copy plays slightly higher or lower;
//  - the more is going on, the more everything is turned down (ducking), and a compressor catches the peaks.
// Browsers only start audio from a tap or a key, so nothing is made until the first one. A phone counts a tap when the
// finger lifts, not when it lands. An iPhone's web audio obeys its ring/silent switch, so the game asks for the media
// channel instead (like a video): sound plays with the switch on silent. That channel stops other apps' music, so with
// "play over other apps' music" set it asks for the ambient one (mixed in, obeying the switch) and plays no music of
// its own: a media element playing takes a phone's audio from Spotify and the like.
import { profile } from '../meta/profile.ts';
import a10 from '../sounds/a10.mp3';
import alarm from '../sounds/alarm.mp3';
import panic from '../sounds/city-panic.mp3';
import explosion from '../sounds/explosion.mp3';
import horde from '../sounds/horde.mp3';
import floorboard from '../sounds/last-floorboard.mp3';
import missile from '../sounds/missile.mp3';
import call from '../sounds/zombie-call.mp3';
import dying from '../sounds/zombie-dying.mp3';
import groan from '../sounds/zombie-groan.mp3';
import scream from '../sounds/zombie-scream.mp3';
import screech from '../sounds/zombie-screech.mp3';
import radio from '../sounds/voices.mp3';
import lines from '../data/voices.json' with { type: 'json' };

interface Recipe {
  len: number; // seconds
  cut: number; // noise lowpass, 0 to 1: low is a dull thump, high a sharp crack
  decay: number; // seconds for the noise to fall to a third
  attack?: number; // seconds to swell in (whooshes)
  tone?: [number, number]; // a sine falling from one pitch to the other, in Hz: the body of the sound
  toneAmp?: number;
  toneDecay?: number;
  gain: number;
  window: number; // seconds within which repeats merge
  voices: number; // copies at once
}

const RECIPES: Record<string, Recipe> = {
  rifle: { len: 0.25, cut: 0.35, decay: 0.045, tone: [180, 60], toneAmp: 0.5, toneDecay: 0.03, gain: 0.45, window: 0.06, voices: 4 },
  pistol: { len: 0.18, cut: 0.5, decay: 0.03, tone: [260, 120], toneAmp: 0.4, toneDecay: 0.02, gain: 0.3, window: 0.06, voices: 3 },
  mg: { len: 0.15, cut: 0.4, decay: 0.03, tone: [150, 70], toneAmp: 0.5, toneDecay: 0.025, gain: 0.35, window: 0.05, voices: 4 },
  crack: { len: 0.6, cut: 0.6, decay: 0.09, tone: [120, 40], toneAmp: 0.6, toneDecay: 0.12, gain: 0.6, window: 0.1, voices: 3 },
  shotgun: { len: 0.4, cut: 0.25, decay: 0.08, tone: [110, 45], toneAmp: 0.8, toneDecay: 0.06, gain: 0.55, window: 0.08, voices: 3 },
  flame: { len: 0.45, cut: 0.12, decay: 0.25, attack: 0.08, gain: 0.3, window: 0.15, voices: 2 },
  rocket: { len: 0.6, cut: 0.15, decay: 0.3, attack: 0.04, tone: [220, 420], toneAmp: 0.25, gain: 0.4, window: 0.1, voices: 3 },
  thunk: { len: 0.3, cut: 0.08, decay: 0.06, tone: [140, 60], toneAmp: 1, toneDecay: 0.08, gain: 0.45, window: 0.08, voices: 3 },
  boom: { len: 1.6, cut: 0.035, decay: 0.45, tone: [65, 28], toneAmp: 0.9, toneDecay: 0.6, gain: 0.85, window: 0.08, voices: 4 },
  napalm: { len: 1.8, cut: 0.06, decay: 0.7, attack: 0.1, tone: [50, 30], toneAmp: 0.6, gain: 0.75, window: 0.2, voices: 2 },
  smash: { len: 0.8, cut: 0.45, decay: 0.16, tone: [95, 38], toneAmp: 0.8, toneDecay: 0.2, gain: 0.75, window: 0.25, voices: 2 }, // a roadblock giving way
  cry: { len: 0.75, cut: 0, decay: 1, gain: 0.6, window: 0.4, voices: 2 }, // a soldier hit and falling: its buffer is made by cry()
  // The story's: a letter typed, a burst of radio static, a far-off thud.
  tick: { len: 0.03, cut: 0.9, decay: 0.006, tone: [1900, 1400], toneAmp: 0.3, toneDecay: 0.004, gain: 0.1, window: 0.025, voices: 2 },
  static: { len: 0.5, cut: 0.95, decay: 0.22, gain: 0.16, window: 0.4, voices: 1 },
  paper: { len: 0.3, cut: 0.55, decay: 0.09, gain: 0.14, window: 0.2, voices: 1 },
  thud: { len: 1.2, cut: 0.03, decay: 0.4, tone: [55, 30], toneAmp: 0.8, toneDecay: 0.5, gain: 0.45, window: 0.3, voices: 1 },
};
/** A recording: `takes` are [file, from, to] in seconds, one picked at random each time (a file can hold several
 *  groans). Repeats within `window` are dropped, not merged: a recording already says it all. `fade` ends a take
 *  cut short of its file's end. */
interface Clip { takes: [string, number, number][]; gain: number; window: number; voices: number; fade?: number }
const CLIPS: Record<string, Clip> = {
  a10: { takes: [[a10, 0, 3.06]], gain: 0.8, window: 2.5, voices: 1 }, // the cannon over the strafe, then the jet
  missile: { takes: [[missile, 0.4, 3.02]], gain: 0.9, window: 0.3, voices: 2 }, // its boom is 1.4 s in: lands as the missile does, 1 s after the call
  blast: { takes: [[explosion, 0.12, 2.6]], gain: 0.75, window: 0.12, voices: 3 },
  alarm: { takes: [[alarm, 0.15, 3.6]], gain: 0.4, window: 5, voices: 1, fade: 1 },
  scream: { takes: [[scream, 0.2, 3.2]], gain: 0.5, window: 2, voices: 1, fade: 0.8 },
  boss: { takes: [[screech, 0.04, 3.02]], gain: 0.55, window: 4, voices: 1 },
  groan: {
    takes: [[call, 0.6, 1.08], [call, 1.26, 1.78], [call, 2.16, 2.56], [call, 2.9, 3.3], [call, 3.68, 4.2], [call, 4.46, 5.28], [groan, 0.08, 1.2], [groan, 1.66, 2.76], [groan, 3.08, 3.94]],
    gain: 0.35, window: 0.9, voices: 2,
  },
  die: { takes: [[dying, 0.3, 1.04], [dying, 1.16, 2.62], [dying, 2.94, 4.26], [dying, 4.4, 5.42]], gain: 0.45, window: 0.35, voices: 2 },
};
// What each soldier says when picked: 'say-rifleman' and so on, one of his lines at random.
for (const [kind, takes] of Object.entries(lines)) CLIPS[`say-${kind}`] = { takes: takes.map(([from, to]): [string, number, number] => [radio, from, to]), gain: 0.85, window: 0.5, voices: 1 };
/** Which recipe each noise from the world uses: soldiers by kind, the rest by name. */
const USES: Record<string, string> = {
  rifleman: 'rifle', shield: 'pistol', machinegunner: 'mg', operator: 'mg', turret: 'mg', marksman: 'crack', sniper: 'crack',
  shotgunner: 'shotgun', flamethrower: 'flame', bazooka: 'rocket', mortar: 'thunk', grenadier: 'thunk', boom: 'boom', napalm: 'napalm', broken: 'smash', fallen: 'cry',
  tick: 'tick', static: 'static', thud: 'thud', paper: 'paper', // the story's
};
const MAX_VOICES = 16;

let ctx: AudioContext | undefined, bus: GainNode, bed: GainNode | undefined;
const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; // Safari's say over the phone's audio
const buffers: Record<string, AudioBuffer> = {};
const files: Record<string, AudioBuffer> = {}; // recordings by url, once decoded
const playing: Record<string, number> = {};
const latest: Record<string, { at: number; gain: GainNode; base: number; n: number }> = {};
let voices = 0, heat = 0, heatAt = 0;

/** A man's cry of pain, "aah" falling away: a buzz at the pitch of a voice, through the three resonances of an open
 *  vowel, with breath in it. */
function cry(c: AudioContext) {
  const rate = c.sampleRate, n = Math.ceil(0.75 * rate), b = c.createBuffer(1, n, rate), d = b.getChannelData(0);
  const formants = [[730, 90, 1], [1090, 110, 0.5], [2440, 170, 0.25]].map(([f, bw, amp]) => {
    const r = Math.exp((-Math.PI * bw) / rate);
    return { a1: 2 * r * Math.cos((2 * Math.PI * f) / rate), a2: -r * r, amp, y1: 0, y2: 0 };
  });
  let phase = 0, peak = 1e-6;
  for (let i = 0; i < n; i++) {
    const t = i / rate, pitch = 190 * Math.exp(-t * 0.9) * (1 + 0.03 * Math.sin(t * 38) + (Math.random() - 0.5) * 0.02);
    phase = (phase + pitch / rate) % 1;
    const source = (phase < 0.4 ? Math.sin((phase / 0.4) * Math.PI) : 0) + (Math.random() - 0.5) * 0.35; // a glottal pulse, and breath
    let v = 0;
    for (const f of formants) {
      const y = source * (1 - f.a1 - f.a2) + f.a1 * f.y1 + f.a2 * f.y2;
      f.y2 = f.y1;
      f.y1 = y;
      v += y * f.amp;
    }
    d[i] = v * Math.min(1, t / 0.03) * Math.exp(-t * 3.2);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= peak;
  return b;
}

function make(c: AudioContext, r: Recipe) {
  const rate = c.sampleRate, n = Math.ceil(r.len * rate), b = c.createBuffer(1, n, rate), d = b.getChannelData(0);
  let lp = 0, phase = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate, f = r.tone ? r.tone[0] + (r.tone[1] - r.tone[0]) * (t / r.len) : 0;
    lp += (Math.random() * 2 - 1 - lp) * r.cut;
    phase += (2 * Math.PI * f) / rate;
    let v = lp + (r.tone ? Math.sin(phase) * (r.toneAmp ?? 0.5) * Math.exp(-t / (r.toneDecay ?? r.decay)) : 0);
    d[i] = v * Math.min(1, t / (r.attack ?? 0.002)) * Math.exp(-t / r.decay) * Math.min(1, (r.len - t) / 0.02); // fade out the tail: no click
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= peak; // loudness is the recipe's gain, not the noise's luck
  return b;
}

/** A moment of silence as a WAV file. Played through an <audio> element on a tap, it moves an older iPhone's web audio
 *  to the media channel (newer ones have navigator.audioSession for that). */
function silence() {
  const n = 1600, b = new ArrayBuffer(44 + n), v = new DataView(b), text = (at: number, t: string) => [...t].forEach((ch, k) => v.setUint8(at + k, ch.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + n, true); text(8, 'WAVE'); text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); text(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128); // 8-bit silence
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

function unlock() {
  if (!ctx) {
    // Older iPhones only have the prefixed one; with neither, the game is silent.
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    if (session) session.type = profile.settings.mix ? 'ambient' : 'playback';
    else if (navigator.maxTouchPoints > 0 && !profile.settings.mix) { const quiet = new Audio(silence()); quiet.setAttribute('playsinline', ''); void quiet.play().catch(() => {}); }
    ctx = new Context();
    // Each track played once inside this tap, so a phone lets it start later without one.
    if (!profile.settings.mix) for (const url of new Set(Object.values(SCORES).flat().map(([u]) => u))) track(ctx, url);
    const squash = ctx.createDynamicsCompressor();
    bus = ctx.createGain();
    bus.connect(squash).connect(ctx.destination);
    for (const [name, r] of Object.entries(RECIPES)) buffers[name] = make(ctx, r);
    buffers.cry = cry(ctx);
    const c = ctx;
    for (const url of new Set([horde, ...Object.values(CLIPS).flatMap((k) => k.takes.map((t) => t[0]))]))
      void fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((b) => {
        files[url] = b;
        if (url === horde) {
          // The horde's growl loops under everything, as loud as hordeLevel() says.
          const src = c.createBufferSource();
          bed = c.createGain();
          bed.gain.value = 0;
          src.buffer = b;
          src.loop = true;
          src.connect(bed).connect(bus);
          src.start();
        }
      }).catch(() => { /* no file, no sound */ });
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => { /* not a tap that counts: the next one */ });
  cue();
}

// ---- Music ----
// Streamed through <audio> elements into the mix, not decoded: minutes of music decoded would fill a phone's memory.
// The menu has The Last Floorboard over a city in panic (sirens, screaming; the recording's first 5 and last 23 seconds
// cut); a fight has the city in panic alone, at full volume. Changing screens crossfades from one to the other.

/** Each screen's tracks, with each one's share of the music volume. */
const SCORES = { menu: [[floorboard, 1], [panic, 0.5]], game: [[panic, 1]], story: [] } as const satisfies Record<string, readonly (readonly [string, number])[]>;
const tracks = new Map<string, { el: HTMLAudioElement; gain: GainNode }>();
let score: keyof typeof SCORES | undefined;
/** Seconds left off the end of a track: the city in panic's last 5. */
const CUT: Record<string, number> = { [panic]: 5 };

function track(c: AudioContext, url: string) {
  let t = tracks.get(url);
  if (t) return t;
  const el = new Audio(url), gain = c.createGain();
  el.loop = true;
  // A track that should end early goes back to its start that much before the end of its file.
  const cut = CUT[url];
  if (cut) el.addEventListener('timeupdate', () => { if (el.duration && el.currentTime >= el.duration - cut) el.currentTime = 0; });
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  gain.gain.value = 0;
  c.createMediaElementSource(el).connect(gain).connect(c.destination);
  tracks.set(url, (t = { el, gain }));
  void el.play().then(() => { if (!wanted(url)) el.pause(); }, () => {});
  return t;
}
const wanted = (url: string) => !!score && !profile.settings.mix && SCORES[score].some(([u]) => u === url);

/** Plays a screen's music: 'menu', 'game' or 'story' (none: the story has no music) (it starts with the first tap if there has been none yet). */
export function music(which: keyof typeof SCORES) {
  score = which;
  cue();
}

/** Fades the wanted tracks in to the music volume and the rest out, pausing them once they are quiet. */
function cue() {
  if (!ctx || !score) return;
  const now = ctx.currentTime, { master, music: level, mix } = profile.settings;
  if (session) session.type = mix ? 'ambient' : 'playback';
  if (!mix) for (const [url] of SCORES[score]) track(ctx, url); // made now if the game started with them off
  for (const [url, t] of tracks) {
    const share = mix ? 0 : SCORES[score].find(([u]) => u === url)?.[1] ?? 0;
    t.gain.gain.setTargetAtTime(master * level * share, now, share ? 0.8 : 0.5);
    if (share && t.el.paused) void t.el.play().catch(() => {});
    if (!share && !t.el.paused) setTimeout(() => { if (!wanted(url)) t.el.pause(); }, 2500);
  }
}

/** The settings changed: the music follows its volume at once. */
export const retune = () => cue();
// The events a browser lets start audio: a finger lifting, a click, a key (and a mouse button going down).
for (const e of ['pointerup', 'touchend', 'click', 'keydown', 'mousedown']) addEventListener(e, unlock, { capture: true });

/** Plays the noise `kind` (see World.sounds). `near` is 1 on screen, less the farther off it is; `size` a blast radius. */
export function play(kind: string, near = 1, size = 0) {
  if (CLIPS[kind]) return clip(kind, near);
  const name = USES[kind], r = RECIPES[name];
  if (!ctx || ctx.state !== 'running' || !r) return;
  const now = ctx.currentTime;
  mix(1);
  const loud = r.gain * near * (size ? Math.min(1.6, Math.sqrt(size / 40)) : 1), last = latest[name];
  if (last && now - last.at < r.window) {
    // Merged: the one already playing stands for both, a little louder each time (doubling the shots adds a third).
    last.n++;
    last.gain.gain.setTargetAtTime(Math.min(last.base * 2, last.base * (1 + Math.log2(last.n) * 0.33)), now, 0.005);
    return;
  }
  if ((playing[name] ?? 0) >= r.voices || voices >= MAX_VOICES || loud < 0.02) return;
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buffers[name];
  src.playbackRate.value = (1 + (Math.random() * 2 - 1) * 0.06) * (size ? Math.max(0.75, 1.15 - size / 250) : 1); // bigger booms are deeper
  gain.gain.value = loud;
  src.connect(gain).connect(bus);
  playing[name] = (playing[name] ?? 0) + 1;
  voices++;
  src.onended = () => { playing[name]--; voices--; gain.disconnect(); };
  src.start();
  latest[name] = { at: now, gain, base: loud, n: 1 };
}

const lastClip: Record<string, number> = {};
let talking = 0; // until when a soldier is talking: one at a time, never two over each other
function clip(name: string, near: number) {
  const k = CLIPS[name], take = k.takes[(Math.random() * k.takes.length) | 0], buf = ctx && files[take[0]];
  if (!ctx || ctx.state !== 'running' || !buf || near < 0.05) return;
  const now = ctx.currentTime;
  const talk = name.startsWith('say-');
  if (now - (lastClip[name] ?? -1e9) < k.window || (playing[name] ?? 0) >= k.voices || voices >= MAX_VOICES || (talk && now < talking)) return;
  lastClip[name] = now;
  if (talk) talking = now + take[2] - take[1];
  mix(1);
  const src = ctx.createBufferSource(), gain = ctx.createGain(), [, from, to] = take, rate = 1 + (Math.random() * 2 - 1) * 0.05;
  src.buffer = buf;
  src.playbackRate.value = rate;
  gain.gain.value = k.gain * near;
  if (k.fade) gain.gain.setTargetAtTime(0, now + (to - from) / rate - k.fade, k.fade / 3);
  src.connect(gain).connect(bus);
  playing[name] = (playing[name] ?? 0) + 1;
  voices++;
  src.onended = () => { playing[name]--; voices--; gain.disconnect(); };
  src.start(now, from, to - from);
}

/** How loud the horde's growl is: 0 when no zombie is near, 1 for a street full of them. */
export function hordeLevel(level: number) {
  if (!ctx || !bed) return;
  mix(0);
  bed.gain.setTargetAtTime(0.3 * Math.max(0, Math.min(1, level)), ctx.currentTime, 0.6);
}

/** Everything goes through the bus: at the volume the settings say, turned down the more is going on (ducking).
 *  `count` is how many sounds this adds to the heat, roughly the sounds in the last second. */
function mix(count: number) {
  const now = ctx!.currentTime, { master, sfx } = profile.settings;
  heat = heat * Math.exp(-(now - heatAt) / 0.8) + count;
  heatAt = now;
  bus.gain.setTargetAtTime((master * sfx) / (1 + Math.max(0, heat - 6) / 12), now, 0.1);
}

// A hidden tab goes quiet (and the looping growl with it) until it is back.
addEventListener('visibilitychange', () => {
  if (!ctx) return;
  void (document.hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
  for (const [url, t] of tracks) if (document.hidden) t.el.pause(); else if (wanted(url)) void t.el.play().catch(() => {});
});

// ---- The story's beds: a low hum, rain, radio static, looping under a scene as loud as storyBed() says ----
const beds: Record<string, GainNode> = {};
/** A loop of noise or hum, made once. */
function bedLoop(c: AudioContext, kind: 'hum' | 'rain' | 'static') {
  const rate = c.sampleRate, n = rate * 2, b = c.createBuffer(1, n, rate), d = b.getChannelData(0);
  let lp = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate, white = Math.random() * 2 - 1;
    lp += (white - lp) * (kind === 'rain' ? 0.35 : 0.9);
    // Whole cycles in the 2 s loop (55 and 110 Hz) so the hum joins up without a click.
    d[i] = kind === 'hum' ? Math.sin(2 * Math.PI * 55 * t) * 0.7 + Math.sin(2 * Math.PI * 110 * t) * 0.3 + white * 0.03
      : kind === 'rain' ? lp * (0.7 + 0.3 * Math.sin(t * 9)) : (white - lp) * (Math.random() < 0.002 ? 4 : 1);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] /= peak;
  const src = c.createBufferSource(), gain = c.createGain();
  src.buffer = b;
  src.loop = true;
  gain.gain.value = 0;
  src.connect(gain).connect(bus);
  src.start();
  return gain;
}
/** Sets a story bed's level, 0 to 1 (0 stops it being heard). */
export function storyBed(kind: 'hum' | 'rain' | 'static', level: number) {
  if (!ctx || ctx.state !== 'running') return;
  if (!beds[kind] && level <= 0) return;
  const g = (beds[kind] ??= bedLoop(ctx, kind));
  g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * { hum: 0.2, rain: 0.25, static: 0.08 }[kind], ctx.currentTime, 0.4);
}

// ---- The story's voices: one file a scene (src/sounds/story, made by scripts/storyvoices.ts), decoded when the scene
// starts and let go when it ends, so only one scene's lines are ever held ----
const storyFiles = import.meta.glob('../sounds/story/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
let sceneVoices: { id: string; loading: boolean; buf?: AudioBuffer } | undefined;
let speaking: { src: AudioBufferSourceNode; until: number } | undefined;
/** Starts fetching a scene's voices (again, if the first tap came after it began). */
export function loadVoices(sceneId: string) {
  const url = storyFiles[`../sounds/story/${sceneId.replace(':', '-')}.mp3`];
  if (sceneVoices?.id !== sceneId) sceneVoices = { id: sceneId, loading: false };
  if (!ctx || !url || sceneVoices.loading || sceneVoices.buf) return;
  sceneVoices.loading = true;
  const c = ctx, want = sceneVoices;
  void fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((b) => { want.buf = b; }).catch(() => { want.loading = false; });
}
/** Says the stretch of the scene's file from `from` to `to` seconds; returns how long it takes, or 0 if it cannot yet. */
export function say(from: number, to: number) {
  hush();
  if (!ctx || ctx.state !== 'running' || !sceneVoices) return 0;
  if (!sceneVoices.buf) { loadVoices(sceneVoices.id); return 0; }
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = sceneVoices.buf;
  gain.gain.value = 1.1;
  src.connect(gain).connect(bus);
  src.onended = () => gain.disconnect();
  src.start(0, from, to - from);
  speaking = { src, until: ctx.currentTime + to - from };
  return to - from;
}
/** Stops the line being said. */
export function hush() {
  try { speaking?.src.stop(); } catch { /* already over */ }
  speaking = undefined;
}
export const voicePlaying = () => !!ctx && !!speaking && ctx.currentTime < speaking.until;
/** The scene is over: its voices are let go. */
export function dropVoices() { hush(); sceneVoices = undefined; }
