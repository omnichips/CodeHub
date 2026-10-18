// The weather and the light over a painted map, only drawn. Each city's weather (meta/profile.ts) darkens or tints the
// ground under everything that moves; street lamps throw pools of light, Tokyo's neon signs glow and flicker, fires and
// burnt-out cars light the street orange, and every shot fired lights the ground round the gun for a moment. Rain
// streaks down the screen; fog banks drift over the map. What the fight does to the street stays: scorch marks where
// big blasts went off, craters where shells landed, debris where a roadblock gave way.
import type Phaser from 'phaser';
import type { Weather } from '../meta/profile.ts';

type Decor = { kind: string; x: number; y: number; n?: number };

/** How each weather looks: the colour laid over the ground and how thick, how bright the lamps' pools are. */
const LOOK: Record<Weather, { tint: number; alpha: number; lamps: number }> = {
  clear: { tint: 0x000000, alpha: 0, lamps: 0.16 },
  night: { tint: 0x060c1c, alpha: 0.52, lamps: 0.55 },
  dusk: { tint: 0x3a1c34, alpha: 0.3, lamps: 0.38 },
  rain: { tint: 0x0c1620, alpha: 0.3, lamps: 0.4 },
  fog: { tint: 0x8a949a, alpha: 0.12, lamps: 0.34 },
  haze: { tint: 0xc8a050, alpha: 0.1, lamps: 0.2 },
  dust: { tint: 0x8a6a40, alpha: 0.13, lamps: 0.2 },
};
const FLASHES = 24; // muzzle flashes lit at once, at most

export interface Atmosphere {
  step(dt: number): void;
  /** A gun fired at (x, y): the ground round it lit for a moment. */
  flash(x: number, y: number): void;
  /** A mark left on the street: a scorch (a big blast), a crater (a shell or grenade) or debris (a roadblock broken). */
  scar(kind: 'scorch' | 'crater' | 'debris', x: number, y: number, size: number): void;
}

/** Sets it going over a map `w` × `h` with its decor; `amount` (0 to 1) thins the rain and fog on a slow device. */
export function atmosphere(scene: Phaser.Scene, weather: Weather, decor: Decor[], w: number, h: number, amount: number): Atmosphere {
  // A soft round light, smooth from its middle to nothing (the pixel-art glow is too coarse blown up this big).
  if (!scene.textures.exists('fx-light')) {
    const tex = scene.textures.createCanvas('fx-light', 128, 128)!, g = tex.context, grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    tex.setFilter(1); // linear: smooth, not pixelated
    tex.refresh();
  }
  const look = LOOK[weather], glow = (x: number, y: number, tint: number, scale: number) => scene.add.image(x, y, 'fx-light').setBlendMode('ADD').setTint(tint).setScale(scale / 8).setDepth(0.7);
  // The weather's colour over the ground (and the lamps under it), under the cones, bodies, barricades and the living.
  if (look.alpha) scene.add.rectangle(w / 2, h / 2, w * 3, h * 3, look.tint, look.alpha).setDepth(0.6);
  // Lamps' pools of light, neon, fires.
  const lamps = decor.filter((d) => d.kind === 'lamp').map((d, k) => ({ img: glow(d.x + 6, d.y - 2, 0xffd890, 5), phase: k * 1.7 }));
  const neon = decor.filter((d) => d.kind === 'neon').map((d, k) => ({ img: glow(d.x, d.y + 3, d.n ?? 0xff4fa0, 2.6), phase: k * 2.3 }));
  const fires = decor.filter((d) => d.kind === 'blaze' || d.kind === 'burnt' || d.kind === 'campfire').map((d, k) => ({ img: glow(d.x, d.y, 0xff7a30, d.kind === 'campfire' ? 4 : 6), phase: k * 3.1 }));
  // Muzzle flashes, from a pool.
  const flashes = Array.from({ length: FLASHES }, () => ({ img: glow(0, 0, 0xffd28a, 2.6).setVisible(false), t: 0 }));
  let nextFlash = 0;
  // Marks that stay, painted into one texture over the map (under the dead and everything else).
  const scars = scene.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(1.2), pen = scene.make.graphics({}, false);
  // Rain down the screen; fog banks drifting over the map.
  const rain = weather === 'rain' ? scene.add.graphics().setScrollFactor(0).setDepth(11) : undefined;
  const drops = rain ? Array.from({ length: Math.round(160 * amount) + 40 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.6, len: 12 + Math.random() * 14 })) : [];
  const banks = weather === 'fog' ? Array.from({ length: Math.round(24 * amount) + 6 }, () => ({
    img: scene.add.image(Math.random() * w, Math.random() * h, 'fx-light').setTint(0xc8d0d4).setScale(3 + Math.random() * 3).setAlpha(0.22 + Math.random() * 0.14).setDepth(9),
    v: 4 + Math.random() * 6,
  })) : [];
  let t = 0;
  return {
    step(dt) {
      t += dt;
      for (const l of lamps) l.img.setAlpha(look.lamps * (0.92 + 0.08 * Math.sin(t * 2 + l.phase)));
      for (const n of neon) n.img.setAlpha((weather === 'night' ? 0.7 : 0.4) * (Math.sin(t * 17 + n.phase) > 0.97 ? 0.2 : 0.9 + 0.1 * Math.sin(t * 3 + n.phase)));
      for (const f of fires) f.img.setAlpha(0.3 + 0.1 * Math.sin(t * 9 + f.phase) + 0.06 * Math.sin(t * 23 + f.phase * 2));
      for (const f of flashes) if (f.t > 0) { f.t -= dt; f.img.setAlpha(Math.max(0, f.t / 0.09) * 0.7).setVisible(f.t > 0); }
      if (rain) {
        const W = scene.scale.width, H = scene.scale.height;
        rain.clear().lineStyle(1.5, 0xc4d8ea, 0.5);
        for (const d of drops) {
          d.y += d.v * dt * 1.6;
          if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
          const x = d.x * W, y = d.y * H;
          rain.lineBetween(x, y, x - d.len * 0.25, y + d.len);
        }
      }
      for (const b of banks) { b.img.x += b.v * dt; if (b.img.x > w + 200) b.img.x = -200; }
    },
    flash(x, y) {
      const f = flashes[nextFlash++ % FLASHES];
      f.t = 0.09;
      f.img.setPosition(x, y).setVisible(true);
    },
    scar(kind, x, y, size) {
      pen.clear();
      if (kind === 'scorch') {
        for (let k = 0; k < 7; k++) { const a = k * 0.9, r = size * (0.35 + 0.25 * Math.sin(k * 2.7)); pen.fillStyle(0x0c0a08, 0.12).fillCircle(x + Math.cos(a) * size * 0.25, y + Math.sin(a) * size * 0.25, r); }
        pen.fillStyle(0x0c0a08, 0.25).fillCircle(x, y, size * 0.35);
      } else if (kind === 'crater') {
        pen.fillStyle(0x0c0a08, 0.2).fillCircle(x, y, size * 0.7).fillStyle(0x2a2622, 0.6).fillCircle(x, y, size * 0.4).fillStyle(0x0c0a08, 0.5).fillCircle(x + 1, y + 1, size * 0.25);
        pen.lineStyle(1, 0x6a6458, 0.5).strokeCircle(x, y, size * 0.42);
      } else
        for (let k = 0; k < 10; k++) pen.fillStyle([0x6a4a2a, 0x5a5650, 0x8a7a60, 0x3a3836][k % 4], 0.9).fillRect(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, 1 + Math.random() * 3, 1 + Math.random() * 2);
      scars.draw(pen);
    },
  };
}
