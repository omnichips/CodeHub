// Sound. Shots and small explosions are made by code like the art: each a short buffer of shaped noise and a falling
// tone, built once. The rest are recordings (src/sounds): the A-10, the missile, big blasts, the wave alarm, and the
// zombies, whose groans, death rattles and the horde's growl underneath it all. Anti-noise rules keep a big fight from turning into a roar:
//  - same-class shots close together merge into the one already playing, which gets a little louder instead;
//  - a cap on how many copies of one sound, and how many sounds in all, play at once;
//  - every copy plays slightly higher or lower;
//  - the more is going on, the more everything is turned down (ducking), and a compressor catches the peaks.
// Browsers only start audio from a tap or a key, so nothing is made until the first one.
import { profile } from '../meta/profile.ts';
import a10 from '../sounds/a10.mp3';
import alarm from '../sounds/alarm.mp3';
import explosion from '../sounds/explosion.mp3';
import horde from '../sounds/horde.mp3';
import missile from '../sounds/missile.mp3';
import call from '../sounds/zombie-call.mp3';
import dying from '../sounds/zombie-dying.mp3';
import groan from '../sounds/zombie-groan.mp3';
import scream from '../sounds/zombie-scream.mp3';
import screech from '../sounds/zombie-screech.mp3';

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
/** Which recipe each noise from the world uses: soldiers by kind, the rest by name. */
const USES: Record<string, string> = {
  rifleman: 'rifle', shield: 'pistol', machinegunner: 'mg', operator: 'mg', turret: 'mg', marksman: 'crack', sniper: 'crack',
  shotgunner: 'shotgun', flamethrower: 'flame', bazooka: 'rocket', mortar: 'thunk', grenadier: 'thunk', boom: 'boom', napalm: 'napalm',
};
const MAX_VOICES = 16;

let ctx: AudioContext | undefined, bus: GainNode, bed: GainNode | undefined;
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

function unlock() {
  if (!ctx) {
    // Older iPhones only have the prefixed one; with neither, the game is silent.
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    const squash = ctx.createDynamicsCompressor();
    bus = ctx.createGain();
    bus.connect(squash).connect(ctx.destination);
    for (const [name, r] of Object.entries(RECIPES)) buffers[name] = make(ctx, r);
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
  if (ctx.state !== 'running') void ctx.resume();
}
for (const e of ['pointerdown', 'touchend', 'keydown']) addEventListener(e, unlock, { capture: true });

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
function clip(name: string, near: number) {
  const k = CLIPS[name], take = k.takes[(Math.random() * k.takes.length) | 0], buf = ctx && files[take[0]];
  if (!ctx || ctx.state !== 'running' || !buf || near < 0.05) return;
  const now = ctx.currentTime;
  if (now - (lastClip[name] ?? -1e9) < k.window || (playing[name] ?? 0) >= k.voices || voices >= MAX_VOICES) return;
  lastClip[name] = now;
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
addEventListener('visibilitychange', () => { if (ctx) void (document.hidden ? ctx.suspend() : ctx.resume()); });
