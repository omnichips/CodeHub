// Short synthesized beeps and buzzes, so there are no audio files to download.
// The context only starts after a tap (the host's PRESS START screen), as browsers require.
let ctx: AudioContext | undefined;

export const unlockSound = () => { ctx ??= new AudioContext(); void ctx.resume(); };

export function beep(freq: number, ms = 90, type: OscillatorType = 'square', volume = 0.08, slideTo?: number) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + ms / 1000);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

export const sfx = {
  join: () => { beep(523, 70); window.setTimeout(() => beep(784, 110), 70); },
  leave: () => beep(330, 160, 'square', 0.06, 160),
  start: () => [262, 330, 392, 523].forEach((f, i) => window.setTimeout(() => beep(f, 120), i * 110)),
  tick: () => beep(1200, 25, 'square', 0.03),
  buzz: () => beep(110, 400, 'sawtooth', 0.07, 55),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => window.setTimeout(() => beep(f, 140, 'triangle', 0.1), i * 120)),
};
