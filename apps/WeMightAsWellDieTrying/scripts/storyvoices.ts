// Voices every line of the story with Kokoro (an open-weight speech model, Apache 2.0, run offline): each page as the
// player shows it, in its speaker's voice; the radio's voices through a radio filter (Nora's losing words where the
// signal fails), the loudspeaker's with an echo. One file a scene, so a phone only ever holds one scene's lines:
// src/sounds/story/<scene>.mp3, with where each page sits in src/data/storyvoices.json.
// Its packages are not the game's, so install them first, without saving:
//   npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7
//   node scripts/storyvoices.ts
// The first run downloads the model (about 90 MB) to the Hugging Face cache.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Mp3Encoder } from '@breezystack/lamejs';
import { KokoroTTS } from 'kokoro-js';
import data from '../src/data/story.json' with { type: 'json' };
import { dropRate, order, pagesOf } from '../src/story/text.ts';
import { voiceOf, type Story } from '../src/story/types.ts';

const story = data as Story;
/** Each speaker: a Kokoro voice, how fast, and how they come through (in the room, over a radio, over a loudspeaker). */
const CAST: Record<string, [voice: string, speed: number, via: 'room' | 'radio' | 'speaker']> = {
  Reyes: ['am_michael', 0.88, 'room'],
  Pike: ['am_puck', 1.02, 'room'],
  Dunne: ['bm_george', 0.88, 'room'],
  Hollis: ['am_liam', 0.95, 'room'],
  Okoye: ['am_onyx', 0.92, 'room'],
  Vega: ['am_eric', 0.95, 'room'],
  Lola: ['bf_isabella', 0.85, 'room'],
  Vendor: ['am_santa', 0.95, 'room'],
  'Harbor master': ['am_fenrir', 0.95, 'room'],
  Pilot: ['am_echo', 0.95, 'room'],
  Captain: ['bm_daniel', 0.95, 'radio'],
  'South bank commander': ['bm_lewis', 1.05, 'radio'],
  Nora: ['af_heart', 0.95, 'radio'],
  Radio: ['af_sarah', 1, 'radio'],
  JEC: ['bf_emma', 0.92, 'radio'],
  Loudspeaker: ['am_adam', 0.9, 'speaker'],
};
/** How a few things are said (the screen keeps what is written). */
const SAY: [RegExp, string][] = [[/\bJEC\b/g, 'J. E. C.'], [/\b09:00\b/g, 'oh nine hundred'], [/\b02:10\b/g, 'oh two ten'], [/\b05:00\b/g, 'oh five hundred'], [/—/g, '...']];
const GAP = 0.3; // seconds of quiet between lines in a file

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });

/** Two poles of high-pass at `low` Hz and of low-pass at `high`, overdriven by `drive`, made as loud as it goes. */
function band(x: Float32Array, sr: number, low: number, high: number, drive: number) {
  const a = (hz: number) => 1 - Math.exp((-2 * Math.PI * hz) / sr), out = new Float32Array(x.length);
  let lo1 = 0, lo2 = 0, hp1 = 0, hp2 = 0, peak = 1e-6;
  for (let i = 0; i < x.length; i++) {
    hp1 += (x[i] - hp1) * a(low); hp2 += (x[i] - hp1 - hp2) * a(low);
    const hi = x[i] - hp1 - hp2;
    lo1 += (hi - lo1) * a(high); lo2 += (lo1 - lo2) * a(high);
    out[i] = Math.tanh(lo2 * drive);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.9;
  return out;
}
/** Made as loud as it goes, nothing else. */
function level(x: Float32Array) {
  let peak = 1e-6;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  return x.map((v) => (v / peak) * 0.85);
}
/** A failing signal: bits of the line cut out (the same bits every time for the same text), a crackle at each cut. */
function dropouts(x: Float32Array, sr: number, rate: number, text: string) {
  let seed = [...text].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296), chunk = Math.round(sr * 0.07);
  for (let i = 0; i < x.length; i += chunk) if (rnd() < rate * 1.6) for (let j = i; j < Math.min(x.length, i + chunk); j++) x[j] = j - i < 40 ? (Math.random() * 2 - 1) * 0.5 : 0;
  return x;
}
/** A loudspeaker on a pole: hard and narrow, with the square answering back. */
function speaker(x: Float32Array, sr: number) {
  const dry = band(x, sr, 500, 2600, 3), d = Math.round(sr * 0.23), out = new Float32Array(dry.length + d * 2);
  for (let i = 0; i < dry.length; i++) { out[i] += dry[i]; out[i + d] += dry[i] * 0.35; out[i + 2 * d] += dry[i] * 0.12; }
  return level(out);
}

const all = order(story), index: Record<string, Record<string, [number, number]>> = {};
mkdirSync(new URL('../src/sounds/story/', import.meta.url), { recursive: true });
let total = 0;
for (const sc of story.scenes) {
  const parts: Float32Array<ArrayBufferLike>[] = [], at: Record<string, [number, number]> = {};
  let rate = 24000, length = 0;
  for (const shot of sc.shots)
    for (const line of shot.lines ?? []) {
      const [voice, speed, via] = CAST[line.who], drop = line.who === 'Nora' ? dropRate(story, sc.id, !!shot.dropout) : 0;
      for (const page of pagesOf(line, voiceOf(line, sc.id, all))) {
        const key = `${line.who}|${page.text}`;
        if (at[key]) continue;
        const said = SAY.reduce((s, [re, to]) => s.replace(re, to), page.text);
        const audio = await tts.generate(said, { voice: voice as 'am_michael', speed });
        rate = audio.sampling_rate;
        let x: Float32Array<ArrayBufferLike> = via === 'room' ? level(audio.audio) : via === 'radio' ? band(audio.audio, rate, 350, 3000, 2.2) : speaker(audio.audio, rate);
        if (drop > 0) x = dropouts(x, rate, drop, page.text);
        const from = length / rate;
        parts.push(x, new Float32Array(Math.round(GAP * rate)));
        length += x.length + Math.round(GAP * rate);
        at[key] = [+from.toFixed(3), +(from + x.length / rate).toFixed(3)];
        console.log(sc.id, line.who, page.text);
      }
    }
  index[sc.id] = at;
  if (!length) continue;
  const enc = new Mp3Encoder(1, rate, 48), mp3: Uint8Array[] = [], pcm = new Int16Array(length);
  let k = 0;
  for (const p of parts) for (const v of p) pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < pcm.length; i += 1152) mp3.push(new Uint8Array(enc.encodeBuffer(pcm.subarray(i, i + 1152))));
  mp3.push(new Uint8Array(enc.flush()));
  writeFileSync(new URL(`../src/sounds/story/${sc.id.replace(':', '-')}.mp3`, import.meta.url), Buffer.concat(mp3));
  total += length / rate;
}
writeFileSync(new URL('../src/data/storyvoices.json', import.meta.url), `{\n${Object.entries(index).map(([id, at]) => `  ${JSON.stringify(id)}: {\n${Object.entries(at).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n  }`).join(',\n')}\n}\n`);
console.log(`${total.toFixed(1)} s of lines in ${story.scenes.length} scenes`);
