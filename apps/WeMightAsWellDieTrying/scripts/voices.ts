// Makes the soldiers' voice lines with Kokoro (an open-weight speech model, Apache 2.0, run offline) and writes them,
// through a radio filter, into one file: src/sounds/voices.mp3, with where each line sits in src/data/voices.json.
// Its packages are not the game's, so install them first, without saving:
//   npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7
//   node scripts/voices.ts
// The first run downloads the model (about 90 MB) to the Hugging Face cache.
import { writeFileSync } from 'node:fs';
import { Mp3Encoder } from '@breezystack/lamejs';
import { KokoroTTS } from 'kokoro-js';

/** Each class: a Kokoro voice and what he says when picked. */
const LINES: Record<string, [string, string[]]> = {
  rifleman: ['am_michael', ['Rifleman, ready.', 'On my way.', 'Eyes on the street.']],
  shield: ['am_onyx', ['Shield up!', 'I will hold them.', 'Stay behind me!']],
  shotgunner: ['am_puck', ['Shotgun, ready.', 'Let them get close.', 'Up close and personal.']],
  machinegunner: ['am_fenrir', ['Gun is hot.', 'Loaded and ready.', 'I will keep their heads down.']],
  marksman: ['am_eric', ['Marksman, in position.', 'I see them.', 'Picking my shots.']],
  sniper: ['bm_george', ['Sniper, on overwatch.', 'One shot, one kill.', 'Scope is on.']],
  grenadier: ['am_liam', ['Grenades ready.', 'Fire in the hole!', 'Lobbing them over.']],
  bazooka: ['am_adam', ['Rocket ready.', 'Point me at the big ones.', 'Back blast clear!']],
  flamethrower: ['am_santa', ['Let it burn.', 'Tank is full.', 'Who ordered barbecue?']],
  medic: ['af_bella', ['Medic here.', 'Who is hurt?', 'I have got you.']],
  engineer: ['bm_lewis', ['Engineer, ready.', 'I will patch it up.', 'Leave the barricades to me.']],
  mortar: ['bm_daniel', ['Mortar team, standing by.', 'Give me a target.', 'Rounds ready.']],
  operator: ['am_echo', ['Sentry operator, ready.', 'Turret is online.', 'Setting up the gun.']],
  down: ['am_fenrir', ['Man down!', 'We lost one!', 'Soldier down!', 'Medic! Man down!']], // someone on the radio, when a soldier falls
  saved: ['am_michael', ['They made it!', 'Civilian secured, thank you!', 'One more out!']], // on the radio, a civilian safe in the camp
  'civ-scream': ['af_sarah', ['Aaah! No!', 'Help! Help me!']], // a civilian caught by the horde: in the street, not on the radio
};
/** Lines said in the street, not over the radio: no radio filter on them. */
const DRY = new Set(['civ-scream']);
const GAP = 0.35; // seconds of quiet between lines, so a take never catches the next one

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const parts: Float32Array[] = [], at: Record<string, [number, number][]> = {};
let rate = 24000, length = 0;

/** A field radio: nothing under about 350 Hz or over about 3 kHz, a little overdriven, then made as loud as it goes. */
function radio(x: Float32Array, sr: number) {
  const a = (hz: number) => 1 - Math.exp((-2 * Math.PI * hz) / sr), out = new Float32Array(x.length);
  let lo1 = 0, lo2 = 0, hp1 = 0, hp2 = 0, peak = 1e-6;
  for (let i = 0; i < x.length; i++) {
    hp1 += (x[i] - hp1) * a(350); hp2 += (x[i] - hp1 - hp2) * a(350); // two poles of high-pass (the low end taken out)
    const high = x[i] - hp1 - hp2;
    lo1 += (high - lo1) * a(3000); lo2 += (lo1 - lo2) * a(3000);
    out[i] = Math.tanh(lo2 * 2.2);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.9;
  return out;
}

/** As loud as it goes, nothing else done to it. */
function loud(x: Float32Array) {
  let peak = 1e-6;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  return x.map((v) => (v / peak) * 0.9);
}

for (const [kind, [voice, lines]] of Object.entries(LINES)) {
  at[kind] = [];
  for (const text of lines) {
    const audio = await tts.generate(text, { voice: voice as 'am_michael' });
    rate = audio.sampling_rate;
    const said = DRY.has(kind) ? loud(audio.audio) : radio(audio.audio, rate), from = length / rate;
    parts.push(said, new Float32Array(Math.round(GAP * rate)));
    length += said.length + Math.round(GAP * rate);
    at[kind].push([+(from).toFixed(3), +(from + said.length / rate + 0.05).toFixed(3)]);
    console.log(kind, voice, text);
  }
}

const enc = new Mp3Encoder(1, rate, 48), mp3: Uint8Array[] = [], pcm = new Int16Array(length);
let k = 0;
for (const p of parts) for (const v of p) pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
for (let i = 0; i < pcm.length; i += 1152) mp3.push(new Uint8Array(enc.encodeBuffer(pcm.subarray(i, i + 1152))));
mp3.push(new Uint8Array(enc.flush()));
const app = (file: string) => new URL(`../${file}`, import.meta.url);
writeFileSync(process.argv[2] ?? app('src/sounds/voices.mp3'), Buffer.concat(mp3));
writeFileSync(process.argv[3] ?? app('src/data/voices.json'), `{\n${Object.entries(at).map(([k, a]) => `  ${JSON.stringify(k)}: ${JSON.stringify(a)}`).join(',\n')}\n}\n`);
console.log(`${(length / rate).toFixed(1)} s of lines`);
