// Sound. Most is recorded (src/sounds): the guns, blasts, the A-10, the missile's launch, the wave alarm, the soldiers'
// voice lines over the radio when one is picked (scripts/voices.ts), and the zombies: groans, death rattles, and the
// horde's growl and footsteps underneath it all. The pistol, machine guns, grenade launcher and napalm are still made by
// code like the art: each a short buffer of shaped noise and a falling tone, built once. Each city has its own sound
// under a fight, and each cutscene backdrop its own (wind, rain, trains, crowds), streamed like the music. Anti-noise rules keep a big fight from turning into a roar:
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
import boatHorn from '../sounds/boat-horn.mp3';
import bells from '../sounds/church-bells.mp3';
import crowd from '../sounds/crowd.mp3';
import crowdPanic from '../sounds/crowd-panic.mp3';
import death1 from '../sounds/soldier-death-1.mp3';
import death2 from '../sounds/soldier-death-2.mp3';
import distant from '../sounds/distant-explosion.mp3';
import flamer from '../sounds/flamethrower.mp3';
import footsteps from '../sounds/zombie-footsteps.mp3';
import heli from '../sounds/helicopter.mp3';
import launch from '../sounds/missile-launch.mp3';
import mortar from '../sounds/mortar.mp3';
import nylon from '../sounds/broken-nylon-prayer.mp3';
import peaceful from '../sounds/peaceful-city.mp3';
import police from '../sounds/police-beep.mp3';
import rain from '../sounds/rain.mp3';
import revolver from '../sounds/revolver-click.mp3';
import rifle from '../sounds/rifle.mp3';
import river from '../sounds/river.mp3';
import roadblock from '../sounds/roadblock-break.mp3';
import rocket from '../sounds/rocket-launcher.mp3';
import shotgun from '../sounds/shotgun.mp3';
import small from '../sounds/small-explosion.mp3';
import sniper from '../sounds/sniper.mp3';
import train from '../sounds/train.mp3';
import wind1 from '../sounds/wind-1.mp3';
import wind2 from '../sounds/wind-2.mp3';
import wind3 from '../sounds/wind-3.mp3';
import winter from '../sounds/winter-on-the-wire.mp3';
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
  pistol: { len: 0.18, cut: 0.5, decay: 0.03, tone: [260, 120], toneAmp: 0.4, toneDecay: 0.02, gain: 0.3, window: 0.06, voices: 3 },
  mg: { len: 0.15, cut: 0.4, decay: 0.03, tone: [150, 70], toneAmp: 0.5, toneDecay: 0.025, gain: 0.35, window: 0.05, voices: 4 },
  thunk: { len: 0.3, cut: 0.08, decay: 0.06, tone: [140, 60], toneAmp: 1, toneDecay: 0.08, gain: 0.45, window: 0.08, voices: 3 },
  napalm: { len: 1.8, cut: 0.06, decay: 0.7, attack: 0.1, tone: [50, 30], toneAmp: 0.6, gain: 0.75, window: 0.2, voices: 2 },
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
  missile: { takes: [[launch, 0, 2.02]], gain: 0.9, window: 0.3, voices: 2 }, // the launch, as it is called in; it lands as a 'blast'
  blast: { takes: [[explosion, 0.12, 2.6]], gain: 0.75, window: 0.12, voices: 3 },
  alarm: { takes: [[alarm, 0.15, 3.6]], gain: 0.4, window: 5, voices: 1, fade: 1 },
  scream: { takes: [[scream, 0.2, 3.2]], gain: 0.5, window: 2, voices: 1, fade: 0.8 },
  boss: { takes: [[screech, 0.04, 3.02]], gain: 0.55, window: 4, voices: 1 },
  groan: {
    takes: [[call, 0.6, 1.08], [call, 1.26, 1.78], [call, 2.16, 2.56], [call, 2.9, 3.3], [call, 3.68, 4.2], [call, 4.46, 5.28], [groan, 0.08, 1.2], [groan, 1.66, 2.76], [groan, 3.08, 3.94]],
    gain: 0.35, window: 0.9, voices: 2,
  },
  // The soldiers' guns, by kind (the world's noise is the soldier's kind). A recording too long for one shot is cut short and faded.
  rifleman: { takes: [[rifle, 0, 2]], gain: 0.45, window: 0.06, voices: 4, fade: 0.6 }, // the file's first 2 s
  marksman: { takes: [[sniper, 0, 2.5]], gain: 0.55, window: 0.1, voices: 3, fade: 0.6 },
  sniper: { takes: [[sniper, 0, 2.5]], gain: 0.65, window: 0.1, voices: 3, fade: 0.6 },
  shotgunner: { takes: [[shotgun, 0, 2.23]], gain: 0.55, window: 0.08, voices: 3, fade: 0.5 },
  flamethrower: { takes: [1, 4, 7, 10, 13, 16, 19, 22, 25].map((t): [string, number, number] => [flamer, t, t + 1.2]), gain: 0.35, window: 0.3, voices: 2, fade: 0.4 }, // slices of one long burn
  bazooka: { takes: [[rocket, 0, 2]], gain: 0.5, window: 0.1, voices: 3, fade: 0.8 },
  mortar: { takes: [[mortar, 0, 0.47]], gain: 0.55, window: 0.08, voices: 3 },
  boom: { takes: [[small, 0, 2.9]], gain: 0.6, window: 0.08, voices: 3, fade: 0.6 }, // a small blast: grenades, shells, rockets landing
  broken: { takes: [[roadblock, 0, 5.07]], gain: 0.7, window: 0.25, voices: 2, fade: 1.5 }, // a roadblock giving way
  fallen: { takes: [[death1, 0, 1.58], [death2, 0, 2.09]], gain: 0.6, window: 0.4, voices: 2 }, // a soldier hit and falling
  // Now and then under a city's fight, and in the cutscenes.
  police: { takes: [[police, 0, 0.38]], gain: 0.3, window: 0.5, voices: 1 }, // the radio's beep before Nora or JEC speaks
  bells: { takes: [[bells, 0, 17.04]], gain: 0.35, window: 15, voices: 1, fade: 3 },
  horn: { takes: [[boatHorn, 0, 3.84]], gain: 0.4, window: 5, voices: 1 },
  crash: { takes: [[distant, 0, 6.86]], gain: 0.6, window: 3, voices: 1 }, // far off: a helicopter going down, a bridge blown
  click: { takes: [[revolver, 0.96, 1.2]], gain: 0.5, window: 0.05, voices: 2, fade: 0.08 }, // a revolver's hammer, any button pressed: only the click (the file is silent until 0.8 s, its click at 1 s)
  heli: { takes: [[heli, 0, 10.03]], gain: 0.4, window: 8, voices: 1, fade: 2 },
  die: { takes: [[dying, 0.3, 1.04], [dying, 1.16, 2.62], [dying, 2.94, 4.26], [dying, 4.4, 5.42]], gain: 0.45, window: 0.35, voices: 2 },
};
// What each soldier says when picked: 'say-rifleman' and so on, one of his lines at random.
for (const [kind, takes] of Object.entries(lines)) CLIPS[`say-${kind}`] = { takes: takes.map(([from, to]): [string, number, number] => [radio, from, to]), gain: 0.85, window: 0.5, voices: 1 };
/** Which recipe each noise from the world uses: soldiers by kind, the rest by name. */
const USES: Record<string, string> = {
  shield: 'pistol', machinegunner: 'mg', operator: 'mg', turret: 'mg', grenadier: 'thunk', napalm: 'napalm', // the rest are CLIPS
  tick: 'tick', static: 'static', thud: 'thud', paper: 'paper', // the story's
};
const MAX_VOICES = 16;

let ctx: AudioContext | undefined, bus: GainNode;
/** The horde underneath it all, as loud as hordeLevel() says: its growl and its feet, each at its own share. */
const BED: [string, number][] = [[horde, 0.3], [footsteps, 0.25]];
const bed: GainNode[] = [];
const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; // Safari's say over the phone's audio
const buffers: Record<string, AudioBuffer> = {};
const files: Record<string, AudioBuffer> = {}; // recordings by url, once decoded
const playing: Record<string, number> = {};
const latest: Record<string, { at: number; gain: GainNode; base: number; n: number }> = {};
let voices = 0, heat = 0, heatAt = 0;

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
    const squash = ctx.createDynamicsCompressor();
    bus = ctx.createGain();
    bus.connect(squash).connect(ctx.destination);
    if (!profile.settings.mix) for (const url of new Set(Object.values(SCORES).flat().map(([u]) => u))) track(ctx, url);
    for (const [name, r] of Object.entries(RECIPES)) buffers[name] = make(ctx, r);
    const c = ctx;
    for (const url of new Set([...BED.map(([u]) => u), ...Object.values(CLIPS).flatMap((k) => k.takes.map((t) => t[0]))]))
      void fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((b) => {
        files[url] = b;
        const k = BED.findIndex(([u]) => u === url);
        if (k >= 0) {
          // The horde's growl and feet loop under everything.
          const src = c.createBufferSource();
          bed[k] = c.createGain();
          bed[k].gain.value = 0;
          src.buffer = b;
          src.loop = true;
          src.connect(bed[k]).connect(bus);
          src.start();
        }
      }).catch(() => { /* no file, no sound */ });
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => { /* not a tap that counts: the next one */ });
  cue();
}

// ---- Music ----
// Streamed through <audio> elements into the mix, not decoded: minutes of music decoded would fill a phone's memory.
// The menu has The Last Floorboard over a city in panic (sirens, screaming; the recording's last 5 seconds cut); a fight
// has Winter on the Wire with the city in panic under it; a cutscene Broken Nylon Prayer. Changing screens crossfades.
// The ambience (a city's wind and trains under a fight, a cutscene backdrop's crowd) streams the same way, but through
// the sound-effects bus: it follows the effects volume, not the music's.

/** Each screen's tracks, with each one's share of the music volume. */
const SCORES = { menu: [[floorboard, 1], [panic, 0.5]], game: [[winter, 1], [panic, 0.35]], story: [[nylon, 0.6]] } as const satisfies Record<string, readonly (readonly [string, number])[]>;
const tracks = new Map<string, { el: HTMLAudioElement; gain: GainNode }>();
let score: keyof typeof SCORES | undefined;
/** Seconds left off the end of a track: the city in panic's last 5. */
const CUT: Record<string, number> = { [panic]: 5 };

/** Each city's sound under a fight: loops, each at its level, and now and then (every 20 to 60 s) one of `now`. */
const CITIES: Record<string, { loops: [string, number][]; now?: string[] }> = {
  'main-street': { loops: [[wind1, 0.5]] },
  chicago: { loops: [[wind2, 0.5], [train, 0.25]] }, // the L overhead
  'new-york': { loops: [[wind3, 0.5]] },
  manila: { loops: [[river, 0.4], [crowd, 0.3]] }, // the canal
  mexico: { loops: [[crowd, 0.3]], now: ['bells'] }, // the cathedral
  rome: { loops: [[wind3, 0.5]], now: ['bells'] },
  tokyo: { loops: [[train, 0.25], [crowd, 0.3]] },
  london: { loops: [[rain, 0.5], [river, 0.3]], now: ['horn'] },
  'white-house': { loops: [[heli, 0.35], [wind1, 0.4]], now: ['crash'] },
};
/** Each cutscene backdrop's loops: the quiet city before, the crowd panicking at the evacuations. */
const BACKDROPS: Record<string, [string, number][]> = {
  'street-night': [[peaceful, 0.4]], 'new-york-avenue': [[peaceful, 0.4]], 'rome-arches': [[peaceful, 0.3]], 'mexico-square': [[peaceful, 0.35]], 'white-house-lawn': [[peaceful, 0.25]],
  'school-lot': [[crowdPanic, 0.35]], 'chicago-pier': [[crowdPanic, 0.35]], 'new-york-harbor': [[crowdPanic, 0.35]],
  'manila-river-port': [[crowdPanic, 0.3], [river, 0.3]], 'london-bridge': [[crowdPanic, 0.3], [river, 0.25]], 'tokyo-platform': [[crowdPanic, 0.25], [train, 0.25]],
  'rome-depot': [[train, 0.3]], 'manila-alley': [[crowd, 0.25]], 'tokyo-crossing': [[crowd, 0.3]],
};
let cityLoops: [string, number][] = [], storyLoops: [string, number][] = [], cityTimer = 0;
/** What is wanted playing: each track's url and its gain. */
let want = new Map<string, number>();

/** A fight in city `id` began (none: it ended): its loops play under it, and its one-offs now and then. */
export function city(id?: string) {
  const c = id ? CITIES[id] : undefined, now = c?.now;
  cityLoops = c?.loops ?? [];
  clearTimeout(cityTimer);
  const next = () => { cityTimer = window.setTimeout(() => { if (now && score === 'game') play(now[(Math.random() * now.length) | 0], 0.6); next(); }, 20000 + Math.random() * 40000); };
  if (now) next();
  cue();
}
/** A cutscene shot on `name` began (none: the scene ended): that backdrop's loops play under it. */
export function backdrop(name?: string) {
  storyLoops = name ? BACKDROPS[name] ?? [] : [];
  cue();
}
let storyQuiet = 1;
/** A close shot (the radio, Nora, the notebook, the photo): the backdrop's crowd turned well down under it, or back up. */
export function quietBackdrop(on: boolean) {
  storyQuiet = on ? 0.25 : 1;
  cue();
}

/** A looping <audio> element into the mix: the ambience (`fx`) through the effects bus, the music straight out. */
function track(c: AudioContext, url: string, fx = false) {
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
  c.createMediaElementSource(el).connect(gain).connect(fx ? bus : c.destination);
  tracks.set(url, (t = { el, gain }));
  void el.play().then(() => { if (!wanted(url)) el.pause(); }, () => {});
  return t;
}
const wanted = (url: string) => want.has(url);

/** Plays a screen's music: 'menu', 'game' or 'story' (it starts with the first tap if there has been none yet). */
export function music(which: keyof typeof SCORES) {
  score = which;
  cue();
}

/** Fades the wanted tracks in (the music to the music volume, the ambience to its level on the effects bus) and the
 *  rest out, pausing them once they are quiet. With "play over other apps' music" on, neither plays. */
function cue() {
  if (!ctx) return;
  const now = ctx.currentTime, { master, music: level, mix } = profile.settings;
  if (session) session.type = mix ? 'ambient' : 'playback';
  want = new Map();
  if (!mix && score) {
    for (const [url, share] of SCORES[score]) { track(ctx, url); want.set(url, master * level * share); } // made now if the game started with them off
    for (const [url, share] of score === 'game' ? cityLoops : score === 'story' ? storyLoops.map(([u, l]): [string, number] => [u, l * storyQuiet]) : []) { track(ctx, url, true); want.set(url, share); }
  }
  for (const [url, t] of tracks) {
    const share = want.get(url) ?? 0;
    t.gain.gain.setTargetAtTime(share, now, share ? 0.8 : 0.5);
    if (share && t.el.paused) void t.el.play().catch(() => {});
    if (!share && !t.el.paused) setTimeout(() => { if (!wanted(url)) t.el.pause(); }, 2500);
  }
}

/** The settings changed: the music follows its volume at once. */
export const retune = () => cue();
// The events a browser lets start audio: a finger lifting, a click, a key (and a mouse button going down).
for (const e of ['pointerup', 'touchend', 'click', 'keydown', 'mousedown']) addEventListener(e, unlock, { capture: true });
// Every button pressed, anywhere (menus, the skill tree, the HUD): the revolver's click.
addEventListener('click', (e) => { const b = (e.target as Element | null)?.closest?.('button'); if (b && !b.disabled) play('click'); }, { capture: true });

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
  if (talk && profile.settings.voices !== 'acting') return; // the soldiers only talk with Voices on Voice acting
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

/** How loud the horde (its growl and feet) is: 0 when no zombie is near, 1 for a street full of them. */
export function hordeLevel(level: number) {
  if (!ctx) return;
  const now = ctx.currentTime;
  mix(0);
  BED.forEach(([, share], k) => bed[k]?.gain.setTargetAtTime(share * Math.max(0, Math.min(1, level)), now, 0.6));
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

// ---- The story's blips (Voices on Blips): a short tone as the words type, each speaker in a key of their own, one of a
// few notes of it at random, like Undertale's. Radio voices come through a narrow band, as the radio does ----
const BLIPS: Record<string, [hz: number, wave: OscillatorType, notes: number[], radio?: boolean]> = {
  Reyes: [140, 'square', [0, 2, 4]], Pike: [200, 'square', [0, 3, 5, 7]], Dunne: [110, 'triangle', [0, 2]],
  Hollis: [170, 'square', [0, 2, 5]], Okoye: [120, 'triangle', [0, 3, 5]], Vega: [160, 'sawtooth', [0, 2, 4]],
  Lola: [330, 'triangle', [0, 4, 7]], Vendor: [190, 'sawtooth', [0, 4, 7, 9]], 'Harbor master': [125, 'sawtooth', [0, 1, 3]],
  Pilot: [180, 'square', [0, 2]], Captain: [130, 'square', [0, 2], true], 'South bank commander': [150, 'square', [0, 2, 3], true],
  Nora: [300, 'triangle', [0, 2, 4, 7], true], Radio: [260, 'square', [0], true], JEC: [220, 'square', [0], true], Loudspeaker: [180, 'square', [0], true],
};
/** Semitones a mood moves a voice: lower when angry or sad, higher when frightened. */
const MOOD_SHIFT: Record<string, number> = { angry: -2, stern: -1, sad: -3, worried: 2, shocked: 3, happy: 1 };
let lastBlip = 0;
/** One blip of `who`'s voice (skipped if the last was a moment ago, so fast typing does not buzz). */
export function blip(who: string, mood = '') {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - lastBlip < 0.05) return;
  lastBlip = now;
  mix(0);
  const [hz, wave, notes, radio] = BLIPS[who] ?? BLIPS.Reyes, semis = notes[(Math.random() * notes.length) | 0] + (MOOD_SHIFT[mood] ?? 0);
  const osc = ctx.createOscillator(), gain = ctx.createGain(), peak = wave === 'triangle' ? 0.16 : 0.07;
  osc.type = wave;
  osc.frequency.value = hz * 2 ** (semis / 12);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
  let last: AudioNode = osc.connect(gain);
  if (radio) { const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.9; last = last.connect(band); }
  last.connect(bus);
  osc.onended = () => gain.disconnect();
  osc.start(now);
  osc.stop(now + 0.07);
}
