// Life on a painted map, only drawn (the fight never sees it). The camp's helicopter (or the headlights, lit windows and
// lamps of what waits there instead, the water lapping at a ship), fire glowing on burning roofs,
// reticles on the spots soldiers can go up to, dust blowing across the screen. Lights: street lamps glowing, a few on the blink;
// traffic lights at the junctions changing; Tokyo's video screens. Water: ripples running on rivers and canals, a
// fountain's spray. Wind: trees stirring, the Zocalo's flag flying, litter blowing down the street. Critters: crows and
// pigeons about the streets and roofs, that fly off when zombies come near or a gun goes off beside them.
import Phaser from 'phaser';
import palette from '../data/palette.json' with { type: 'json' };
import { profile } from '../meta/profile.ts';
import type { Grid, MapData } from '../sim/grid.ts';

type Decor = import('./mapart.ts').Drawn;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const WIND = { x: 16, y: 5 }; // px a second litter blows (the flag flies east too)
const CYCLE = 14; // seconds a traffic light takes to go round: green, amber, red
const SCREENS = [palette.navy2, palette.teal2, palette.red2, palette.flash1, palette.maroon2, palette.snow2].map(hex);
/** The same roll for the same thing every time. */
const roll = (x: number, y: number, salt = 0) => (Math.imul(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ salt, 2654435761) >>> 0) / 4294967296;

/** What the map's life needs to know of the fight: where whatever would put up a bird at (x, y) is, if anything; and
 *  whether the defence is still being planned. */
export interface Fight { scare(x: number, y: number): [number, number] | undefined; planning(): boolean }

/** Sets it all going on `scene`; call what it returns each frame with the seconds gone by. `amount` (0 to 1) thins the
 *  litter and birds on a slow device. */
export function mapAnims(scene: Phaser.Scene, map: MapData, grid: Grid, decor: Decor[], amount: number, env: Fight) {
  const { scare } = env;
  textures(scene);
  const { w, h, tile: T, wall } = grid, S = map.scale ?? 1, steps: ((t: number, dt: number) => void)[] = [];
  const cam = scene.cameras.main;
  /** A random open (or, with `roofs`, any) spot in the camera's view, or anywhere on the map. */
  const spot = (inView: boolean, roofs = false): [number, number] | undefined => {
    const v = cam.worldView;
    for (let k = 0; k < 12; k++) {
      const x = inView ? v.x + Math.random() * v.width : Math.random() * w * T, y = inView ? v.y + Math.random() * v.height : Math.random() * h * T, i = grid.at(x, y);
      if (i >= 0 && (roofs ? wall[i] === 1 : !wall[i]) && !grid.goal[i]) return [x, y];
    }
  };

  // ---- Lights ----
  const lamps = decor.filter((d) => d.kind === 'lamp').map((d) => ({
    glow: scene.add.image(d.x + 6, d.y - 6, 'fx-glow').setBlendMode('ADD').setTint(0xffd890).setScale(1.7).setDepth(0.5),
    broken: roll(d.x, d.y) < 0.15, phase: roll(d.y, d.x) * 10,
  }));
  const signals = decor.filter((d) => d.kind.startsWith('signal')).map((d) => ({
    lamp: scene.add.image(d.x, d.y, 'fx-px').setOrigin(0).setScale(2).setDepth(0.5),
    glow: scene.add.image(d.x + 1, d.y, 'fx-glow').setBlendMode('ADD').setScale(0.7).setDepth(0.5),
    y: d.y, late: d.kind === 'signal2' ? CYCLE / 2 : 0,
  }));
  const screens = decor.filter((d) => d.kind === 'billboard').map((d) => ({
    face: scene.add.image(Math.floor(d.x / T) * T + 2, Math.floor(d.y / T) * T + 3, 'fx-px').setOrigin(0).setScale(T - 4, T - 7).setAlpha(0.6).setDepth(0.5),
    next: 0,
  }));
  steps.push((t) => {
    for (const l of lamps) l.glow.setAlpha(l.broken ? (Math.sin(t * 23 + l.phase) + Math.sin(t * 7.3 + l.phase * 2) > 1.1 ? 0.04 : 0.45) : 0.36 + 0.04 * Math.sin(t * 2 + l.phase));
    for (const s of signals) {
      const at = (t + s.late) % CYCLE, k = at < 6 ? 2 : at < 8 ? 1 : 0, col = [0xff4030, 0xffc040, 0x60ff80][k]; // red on top, amber, green at the foot
      s.lamp.setY(s.y - 3 + k * 3).setTint(col);
      s.glow.setY(s.y - 2 + k * 3).setTint(col).setAlpha(0.5);
    }
    for (const s of screens) if (t >= s.next) {
      s.next = t + 1.5 + Math.random() * 3;
      s.face.setTint(Math.random() < 0.1 ? 0xffffff : SCREENS[(Math.random() * SCREENS.length) | 0]); // now and then a white flash between adverts
    }
  });

  // ---- Water: two layers of ripples, drifting different ways, seen only over the water tiles ----
  const runs: [number, number, number][] = [];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  map.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      if (row[x] !== '~') continue;
      let end = x;
      while (row[end + 1] === '~') end++;
      runs.push([x, y, end]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, end); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      x = end;
    }
  });
  if (runs.length) {
    const shape = scene.make.graphics({}, false).fillStyle(0xffffff);
    for (const [x, y, end] of runs) shape.fillRect(x * T, y * T, (end - x + 1) * T, T);
    const mask = shape.createGeometryMask(), size = [(x1 - x0 + 1) * T, (y1 - y0 + 1) * T] as const;
    const layers = [[9, 3, 0.55], [-6, 2, 0.35]].map(([vx, vy, a]) => ({ vx, vy, s: scene.add.tileSprite(x0 * T, y0 * T, size[0], size[1], 'fx-ripple').setOrigin(0).setAlpha(a).setMask(mask).setDepth(0.1) }));
    layers[1].s.setFlipY(true);
    steps.push((_t, dt) => { for (const l of layers) { l.s.tilePositionX -= l.vx * dt; l.s.tilePositionY -= l.vy * dt; } });
  }
  for (const d of decor.filter((k) => k.kind === 'fountain'))
    scene.add.particles(d.x, d.y, 'fx-px', {
      speed: { min: 5 * S, max: 13 * S }, angle: { min: 0, max: 360 }, lifespan: 650, scale: { start: 1.6 * S, end: 0.4 }, alpha: { start: 0.85, end: 0 },
      tint: [0xffffff, 0xbfe8f0, 0x9fd0d8], frequency: 30, quantity: 2,
    }).setDepth(1.45);

  // ---- Wind ----
  // Trees: a crown over each painted one (the painter says where, and how big), a little bigger, stirring a pixel or
  // so, gusting now and then.
  const CROWNS: Record<string, number> = { crown: 14, 'crown-small': 11, tree: 12 }; // their radius as painted
  const trees = decor.filter((d) => d.kind in CROWNS).map((d) => {
    const [x, y] = d.kind === 'tree' ? [(Math.floor(d.x / T) + 0.5) * T, (Math.floor(d.y / T) + 0.5) * T] : [d.x, d.y];
    return { img: scene.add.image(x, y, 'fx-crown').setScale((CROWNS[d.kind] + 0.6) / 16).setDepth(0.6), x, y, phase: roll(x, y) * 6.3 };
  });
  if (trees.length) steps.push((t) => {
    const gust = 0.6 + Math.max(0, Math.sin(t * 0.35)) * 0.8;
    for (const k of trees) k.img.setPosition(k.x + Math.sin(t * 1.4 + k.phase) * 0.7 * gust, k.y + Math.sin(t * 1.1 + k.phase * 1.7) * 0.4 * gust);
  });
  // The flag: green, white and red in strips, each a little behind the one nearer the pole in a wave down its length.
  for (const d of decor.filter((k) => k.kind === 'flag')) {
    const g = scene.add.graphics().setDepth(0.6), fx = d.x + 3 * S, fy = d.y - 13 * S, fw = 54 * S, fh = 30 * S, cols = ['#2f6b45', palette.snow1, palette.red1].map(hex);
    steps.push((t) => {
      g.clear();
      for (let k = 0; k < fw; k += 2 * S) {
        const along = k / fw, lift = Math.sin(t * 3.2 - k / (7 * S)) * 1.8 * S * along, light = Math.cos(t * 3.2 - k / (7 * S)) * along;
        g.fillStyle(0x000000, 0.22).fillRect(fx + k + 6 * S, fy + lift + 8 * S, 2 * S, fh); // its shadow on the square
        g.fillStyle(hex(palette.outline), 1).fillRect(fx + k, fy + lift - 1, 2 * S, fh + 2);
        g.fillStyle(cols[Math.min(2, Math.floor(along * 3))], 1).fillRect(fx + k, fy + lift, 2 * S, fh);
        if (light < -0.3) g.fillStyle(0x000000, -light * 0.25).fillRect(fx + k, fy + lift, 2 * S, fh); // in the fold
        if (Math.abs(along - 0.5) < 0.05) g.fillStyle(hex(palette.brown1), 1).fillRect(fx + k, fy + lift + fh / 2 - 3 * S, 2 * S, 6 * S); // the eagle
      }
    });
  }
  // Litter: scraps of paper tumbling downwind, each for a while, then another somewhere else in view.
  const scraps = Array.from({ length: Math.round(14 * amount) }, () => ({ img: scene.add.image(0, 0, 'fx-px').setDepth(1.45).setAlpha(0), life: 0, age: 0, spin: 0 }));
  steps.push((t, dt) => {
    const gust = 0.5 + Math.max(0, Math.sin(t * 0.35)) * 1.6;
    for (const p of scraps) {
      if ((p.age += dt) >= p.life || !cam.worldView.contains(p.img.x, p.img.y)) {
        const at = spot(true);
        if (!at) continue;
        Object.assign(p, { age: 0, life: 5 + Math.random() * 8, spin: (Math.random() - 0.5) * 8 });
        p.img.setPosition(...at).setScale(1 + Math.random() * 1.5, 1 + Math.random()).setTint([0xeadfae, 0xffffff, 0xc9c2a8][(Math.random() * 3) | 0]);
      }
      const i = grid.at(p.img.x + WIND.x * gust * dt * 4, p.img.y + WIND.y * gust * dt * 4), stop = i < 0 || wall[i]; // against a wall it stops
      p.img.setPosition(p.img.x + (stop ? 0 : WIND.x * gust * dt), p.img.y + (stop ? 0 : (WIND.y + Math.sin(t * 3 + p.life) * 6) * dt)).setRotation(p.img.rotation + p.spin * gust * dt);
      p.img.setAlpha(Math.min(1, p.age, p.life - p.age) * 0.9);
    }
  });

  // ---- Critters ----
  const birds = Array.from({ length: Math.round(16 * amount) }, (_, k) => ({
    img: scene.add.image(0, 0, 'fx-bird0').setTint(k % 3 ? 0x8f949c : 0x2a2a30).setAlpha(0), // pigeons, and every third a crow
    state: 'away' as 'sit' | 'fly' | 'away', t: Math.random() * 4, vx: 0, vy: 0, look: 0,
  }));
  steps.push((_t, dt) => {
    for (const b of birds) {
      b.t -= dt;
      if (b.state === 'away' && b.t <= 0) {
        // Back down somewhere quiet: a street, or now and then a roof.
        const at = spot(false, Math.random() < 0.3);
        if (!at || scare(...at)) { b.t = 1; continue; }
        b.img.setPosition(...at).setTexture('fx-bird0').setScale(1).setAlpha(1).setDepth(1.45).setRotation(Math.random() * 6.3);
        Object.assign(b, { state: 'sit', t: 1 + Math.random() * 2, look: 0 });
      } else if (b.state === 'sit') {
        if ((b.look -= dt) <= 0) {
          b.look = 0.25;
          const from = scare(b.img.x, b.img.y);
          if (from) {
            const a = Math.atan2(b.img.y - from[1], b.img.x - from[0]) + (Math.random() - 0.5);
            Object.assign(b, { state: 'fly', t: 2.5, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 });
            b.img.setRotation(a).setDepth(9.5);
            continue;
          }
        }
        if (b.t <= 0) { // a hop, or a turn to peck somewhere else
          b.t = 0.6 + Math.random() * 2.5;
          b.img.setRotation(b.img.rotation + (Math.random() - 0.5) * 2).setPosition(b.img.x + (Math.random() - 0.5) * 3, b.img.y + (Math.random() - 0.5) * 3);
        }
      } else if (b.state === 'fly') {
        b.img.setPosition(b.img.x + b.vx * dt, b.img.y + b.vy * dt).setTexture(((b.t * 12) | 0) % 2 ? 'fx-bird1' : 'fx-bird2');
        b.img.setScale(1 + (2.5 - b.t) * 0.3).setAlpha(Math.min(1, b.t)); // up and away
        if (b.t <= 0) Object.assign(b, { state: 'away', t: 8 + Math.random() * 15 });
      }
    }
  });

  // ---- Fire: a glow over each burning roof, flickering (its flames and smoke are game/ambience.ts) ----
  const blazes = decor.filter((d) => d.kind === 'blaze').map((d) => ({ img: scene.add.image(d.x, d.y, 'fx-glow').setBlendMode('ADD').setTint(0xff7a30).setScale(3.2).setDepth(1.4), phase: roll(d.x, d.y) * 9 }));
  if (blazes.length) steps.push((t) => { for (const b of blazes) b.img.setAlpha(0.28 + 0.12 * Math.sin(t * 9 + b.phase) + 0.08 * Math.sin(t * 23 + b.phase * 2)); });

  // ---- Where a soldier can go up: an amber reticle on each window and roof spot, pulsing while the defence is planned ----
  const marks = (map.slots ?? []).map(([x, y]) => scene.add.image((x + 0.5) * T, (y + 0.5) * T, 'fx-reticle').setDepth(1.46));
  if (marks.length) steps.push((t) => {
    const planning = env.planning(), a = planning ? 0.6 + 0.4 * Math.sin(t * 4) : 0.3, s = planning ? 1 + 0.12 * Math.sin(t * 4) : 0.9;
    for (const m of marks) m.setAlpha(a).setScale(s);
  });

  // ---- The camp's Chinook: on its pad, its two rotors turning over (opposite ways); now and then it lifts off, flies
  // off the map and comes back in from the other side to land ----
  for (const d of decor.filter((k) => k.kind === 'heli')) {
    const shadow = scene.add.image(d.x, d.y, 'fx-heli').setTint(0x000000).setAlpha(0.35).setDepth(1.45);
    const body = scene.add.image(d.x, d.y, 'fx-heli').setDepth(2.95);
    const rotors = [26, -28].map((at) => ({ at, img: scene.add.image(d.x + at, d.y, 'fx-rotor').setDepth(2.96), blur: scene.add.image(d.x + at, d.y, 'fx-rotor-blur').setDepth(2.97) }));
    const beacon = scene.add.image(d.x, d.y, 'fx-glow').setBlendMode('ADD').setTint(0xff3020).setDepth(2.98); // anti-collision, on its back
    // It flies one way the whole time, east or north (the camp's own pick), out over the edge of the map and back in
    // from the far edge to its pad: away somewhere, and home again.
    const east = roll(d.y, d.x, 5) < 0.5, heading = east ? 0 : -Math.PI / 2, v = 220 * S, past = 300 * S; // px a second; how far off the map it turns back
    const away = east ? w * T - d.x + past : d.y + past, home = east ? d.x + past : h * T - d.y + past, flight = (away + home) / v;
    const up = 56, down = up + flight, PERIOD = down + 6, late = roll(d.x, d.y) * PERIOD;
    let spin = 0;
    steps.push((t, dt) => {
      const k = (t + late) % PERIOD;
      // Parked (rotors idling), spinning up, lifting, away and home, coming down, spinning down.
      const speed = k < 50 ? 2 : k < 53 ? 2 + (k - 50) * 9 : k < down + 3 ? 29 : 29 - (k - down - 3) * 9;
      const lift = k < 53 ? 0 : k < up ? (k - 53) / 3 : k < down ? 1 : k < down + 3 ? (down + 3 - k) / 3 : 0;
      let x = d.x, y = d.y;
      if (k >= up && k < down) {
        const p = (k - up) * v, along = p < away ? p : p - away - home; // out to past the edge, then in from the far one
        if (east) x = d.x + along;
        else y = d.y - along;
      }
      spin += speed * dt;
      const size = (1 + lift * 0.35) * S, off = lift * 34 * S; // as big as the map's scale makes everything else
      const by = y - lift * 6 * S, fast = Math.min(1, Math.max(0, (speed - 8) / 14)); // how far into a blur the rotors are
      body.setPosition(x, by).setRotation(heading).setScale(size / HELI_RES).setDepth(lift > 0 ? 11 : 2.95);
      for (const [k, r] of rotors.entries()) {
        const rx = x + Math.cos(heading) * r.at * size, ry = by + Math.sin(heading) * r.at * size;
        r.img.setPosition(rx, ry).setRotation(k ? -spin : spin + 0.5).setScale(size / HELI_RES).setDepth(lift > 0 ? 11.1 : 2.96).setAlpha(1 - fast * 0.6);
        r.blur.setPosition(rx, ry).setScale(size / HELI_RES).setDepth(lift > 0 ? 11.2 : 2.97).setAlpha(fast);
      }
      // The beacon flashes twice a second and a bit while the engines run; brighter in the air.
      beacon.setPosition(x - Math.cos(heading) * 4 * size, by - Math.sin(heading) * 4 * size).setScale(size * 0.45).setDepth(lift > 0 ? 11.3 : 2.98)
        .setAlpha(speed > 2 && (t * 2.2) % 1 < 0.15 ? 0.6 + lift * 0.4 : 0);
      shadow.setPosition(x + off, y + off * 0.6).setRotation(heading).setScale(((1 - lift * 0.1) * S) / HELI_RES).setAlpha(0.35 - lift * 0.15);
    });
  }

  // ---- What waits on the safe zone instead of a helicopter (game/mapart.ts): headlights on, a train's windows lit
  // and flickering, the checkpoint's amber lamps blinking, the water lapping along a hull ----
  const GLOW: Record<string, [number, number]> = { headlight: [0xfff0c0, 1.1], window: [0xffd890, 0.55], beacon: [0xffa030, 0.9] }; // tint, size
  const glows = decor.filter((d) => d.kind in GLOW).map((d) => ({
    kind: d.kind, img: scene.add.image(d.x, d.y, 'fx-glow').setBlendMode('ADD').setTint(GLOW[d.kind][0]).setScale(GLOW[d.kind][1] * S).setDepth(0.5), phase: roll(d.x, d.y) * 10,
  }));
  const foam = decor.filter((d) => d.kind === 'foam').map((d) => ({ img: scene.add.image(d.x, d.y, 'fx-px').setScale(4 * S, S).setTint(0xdcddd3).setDepth(0.5), x: d.x, phase: roll(d.x, d.y) * 10 }));
  // Boats at the quay, riding the water: rocking a little, drifting toward and off the quay on their lines.
  const boats = decor.filter((d) => d.kind === 'boat' && d.frame).map((d) => ({ img: scene.add.image(d.x, d.y, 'sprites', d.frame).setRotation(d.a ?? 0).setDepth(0.55), d, phase: roll(d.x, d.y) * 10 }));
  if (boats.length) steps.push((t) => {
    for (const { img, d, phase } of boats) {
      const a = d.a ?? 0, sway = Math.sin(t * 0.6 + phase) * 1.2 * S, surge = Math.sin(t * 0.37 + phase * 2) * 0.8 * S;
      img.setPosition(d.x + Math.cos(a) * surge - Math.sin(a) * sway, d.y + Math.sin(a) * surge + Math.cos(a) * sway).setRotation(a + Math.sin(t * 0.8 + phase) * 0.008);
    }
  });
  // People walking in to the top of the stairs and going down them, darker and smaller into the dark, and more after.
  const flows = decor.filter((d) => d.kind === 'flow' && d.to).flatMap((d) => {
    const [tx, ty] = d.to!, walk = Math.hypot(tx - d.x, ty - d.y), down = d.len ?? 40, total = walk + down, n = d.n ?? 5;
    return Array.from({ length: n }, (_, k) => {
      const look = d.frame === 'umbrella' ? 7 + ((k + Math.floor(d.x)) % 3) : (k * 3 + Math.floor(d.x)) % 7; // the civilians' looks: art/sprites.ts
      return { s: scene.add.sprite(d.x, d.y, 'sprites').setDepth(1).play({ key: `civ${look}-walk`, startFrame: k % 2 }), d, tx, ty, walk, down, total, p: (k / n) * total, speed: 8 + roll(k, d.x) * 4 };
    });
  });
  if (flows.length) steps.push((_t, dt) => {
    for (const f of flows) {
      f.p = (f.p + f.speed * dt) % f.total;
      const a = f.d.a ?? 0, toward = Math.atan2(f.ty - f.d.y, f.tx - f.d.x);
      if (f.p < f.walk) {
        const u = f.p / f.walk;
        f.s.setPosition(f.d.x + (f.tx - f.d.x) * u, f.d.y + (f.ty - f.d.y) * u).setRotation(toward).setScale(1).setAlpha(Math.min(1, f.p / 12)).clearTint();
      } else {
        const u = (f.p - f.walk) / f.down, g = Math.round(255 * (1 - u * 0.85));
        f.s.setPosition(f.tx + Math.cos(a) * (f.p - f.walk), f.ty + Math.sin(a) * (f.p - f.walk)).setRotation(a).setScale(1 - u * 0.25).setAlpha(1 - u * u).setTint(Phaser.Display.Color.GetColor(g, g, g));
      }
    }
  });
  if (glows.length || foam.length) steps.push((t) => {
    for (const g of glows) g.img.setAlpha(
      g.kind === 'beacon' ? ((t * 1.2 + g.phase) % 1 < 0.5 ? 0.75 : 0.05)
        : g.kind === 'window' ? 0.32 + 0.08 * Math.sin(t * 1.7 + g.phase) - (Math.sin(t * 13 + g.phase * 3) > 0.96 ? 0.22 : 0) // now and then a flicker
          : 0.5 + 0.04 * Math.sin(t * 9 + g.phase));
    for (const f of foam) { const k = Math.sin(t * 1.4 + f.phase); f.img.setAlpha(Math.max(0, k) * 0.55).setX(f.x + k * 1.5 * S); }
  });

  // ---- Dust blowing across the screen, as much as the setting says ----
  const motes = Array.from({ length: 160 }, () => ({
    img: scene.add.image(0, 0, 'fx-px').setDepth(12).setTint([0xc9bc94, 0xa49873, 0xeadfae][(Math.random() * 3) | 0]),
    u: Math.random(), v: Math.random(), speed: 0.05 + Math.random() * 0.2, size: 1 + Math.random() * 2.5, alpha: 0.15 + Math.random() * 0.35, wave: Math.random() * 6.3,
  }));
  steps.push((t, dt) => {
    const n = Math.round(motes.length * profile.settings.dust), v = cam.worldView, gust = 0.7 + Math.max(0, Math.sin(t * 0.35)) * 1.2;
    motes.forEach((m, k) => {
      m.img.setVisible(k < n);
      if (k >= n) return;
      m.u += m.speed * gust * dt;
      m.v += Math.sin(t * 1.3 + m.wave) * 0.02 * dt;
      if (m.u > 1.05) { m.u = -0.05; m.v = Math.random(); }
      m.img.setPosition(v.x + m.u * v.width, v.y + m.v * v.height).setScale(m.size / cam.zoom).setAlpha(m.alpha);
    });
  });

  let t = 0;
  return (dt: number) => {
    t += dt;
    for (const step of steps) step(t, dt);
  };
}

/** The pixels it draws with, made once (the menu's helicopter uses them too). */
export function textures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx-px')) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1).generateTexture('fx-px', 1, 1);
  g.clear().fillStyle(0xffffff, 0.12).fillCircle(8, 8, 8).fillStyle(0xffffff, 0.22).fillCircle(8, 8, 5).fillStyle(0xffffff, 0.45).fillCircle(8, 8, 2.5).generateTexture('fx-glow', 16, 16);
  // Ripples: short bright dashes, scattered so the tiling does not show.
  g.clear();
  for (let k = 0; k < 22; k++) g.fillStyle(k % 3 ? hex(palette.teal1) : hex(palette.teal2), 0.8).fillRect((Math.random() * 60) | 0, (Math.random() * 64) | 0, 3 + ((Math.random() * 4) | 0), 1);
  g.generateTexture('fx-ripple', 64, 64);
  // A tree's crown, as the map painter draws it (scaled down to each tree: it stirs over the painted one).
  const c = 17, r = 16;
  g.clear().fillStyle(hex(palette.olive0)).fillCircle(c, c, r).fillStyle(hex(palette.olive1)).fillCircle(c - r * 0.2, c - r * 0.2, r * 0.75)
    .fillStyle(hex(palette.olive2)).fillCircle(c - r * 0.35, c - r * 0.35, r * 0.4).fillStyle(hex(palette.rot0)).fillCircle(c + r * 0.35, c + r * 0.3, r * 0.35);
  g.fillStyle(hex(palette.rot2)).fillRect(c - 6, c - 8, 2, 2).fillRect(c + 2, c - 2, 2, 2).fillRect(c - 2, c + 6, 2, 2);
  g.generateTexture('fx-crown', 34, 34);
  // An amber reticle: where a soldier can go up into a window or onto a roof.
  g.clear().lineStyle(1.5, hex(palette.flash0), 1).strokeCircle(8, 8, 6).fillStyle(hex(palette.flash1), 1)
    .fillRect(7.25, 0, 1.5, 4).fillRect(7.25, 12, 1.5, 4).fillRect(0, 7.25, 4, 1.5).fillRect(12, 7.25, 4, 1.5).fillRect(7.25, 7.25, 1.5, 1.5);
  g.generateTexture('fx-reticle', 16, 16);
  heli(scene);
  // A bird from above, facing east: sitting, then two frames of flapping. White and grey, tinted per bird.
  g.clear().fillStyle(0xbdbdbd).fillRect(0, 2, 2, 1).fillStyle(0xffffff).fillRect(1, 1, 4, 3).fillRect(5, 2, 2, 1).fillStyle(0x777777).fillRect(7, 2, 1, 1).generateTexture('fx-bird0', 8, 5);
  g.clear().fillStyle(0xffffff).fillRect(1, 3, 5, 2).fillRect(6, 3, 2, 1).fillStyle(0xdddddd).fillRect(2, 0, 2, 3).fillRect(2, 5, 2, 3).generateTexture('fx-bird1', 8, 8);
  g.clear().fillStyle(0xffffff).fillRect(1, 3, 5, 2).fillRect(6, 3, 2, 1).fillStyle(0xdddddd).fillRect(1, 2, 3, 1).fillRect(1, 5, 3, 1).generateTexture('fx-bird2', 8, 8);
  g.destroy();
}

/** Drawn this many pixels to each of its own, so a helicopter scaled up with the map keeps the map's fine pixels. */
export const HELI_RES = 2;

/** A Chinook from above, nose to the east, 80 by 24: the long body lit from the north, panel seams and rivets, the fuel
 *  sponsons down its sides, the two engines either side of the tall pylon at the back, the ramp; the front mast's
 *  fairing, the framed cockpit glass, the nav lights (red to port, green to starboard), a star. And one of its two
 *  three-bladed rotors (tips painted yellow), and the blur of one turning fast. */
function heli(scene: Phaser.Scene) {
  const canvas = (key: string, w: number, h: number) => {
    const c = scene.textures.createCanvas(key, w * HELI_RES, h * HELI_RES)!, x = c.context;
    x.scale(HELI_RES, HELI_RES);
    return { c, x };
  };
  const { c: body, x } = canvas('fx-heli', 80, 24);
  const fill = (col: string, path: () => void) => { x.fillStyle = col; x.beginPath(); path(); x.fill(); };
  const box = (col: string, l: number, t: number, w: number, h: number, r = 0) => fill(col, () => x.roundRect(l, t, w, h, r));
  const P = palette;
  // The sponsons, under the body: outline, then the tank, lit along its top.
  box(P.outline, 25, 1.5, 28, 21, 4);
  box(P.olive0, 26, 2.5, 26, 19, 3);
  box(P.olive1, 27, 3, 24, 2, 1);
  box(P.olive1, 27, 19, 24, 1.5, 1);
  for (const sx of [33, 40, 47]) { box('rgba(0,0,0,0.35)', sx, 2.5, 0.5, 19); }
  // The engines, either side of the pylon: pods out past the body, intake at the front, exhaust at the back.
  for (const ey of [2, 18]) {
    box(P.outline, 5, ey - 0.5, 19, 5, 2.5);
    box(P.metal1, 6, ey, 17, 4, 2);
    box(P.metal2, 7, ey + 0.5, 15, 1.2, 0.6);
    box(P.snow0, 21.5, ey + 0.5, 1.5, 3, 0.5); // the intake screen
    box(P.metal0, 5.5, ey + 0.5, 2, 3, 1); // the exhaust
  }
  // The body: outline, then three bands, light on top, dark underneath.
  box(P.outline, 3, 5, 75, 14, 6);
  box(P.olive0, 4, 6, 73, 12, 5);
  box(P.olive1, 4, 6, 73, 9, 5);
  box(P.olive2, 8, 7, 66, 2.5, 1.2);
  // The ramp at the tail, its hinge.
  box(P.olive0, 3.5, 7, 4, 10, 2);
  box(P.outline, 7.5, 7, 0.6, 10);
  // Seams across the body, rivets along them; a dark non-skid walk down its spine.
  for (const sx of [14, 24, 32, 41, 50, 58]) {
    box('rgba(0,0,0,0.4)', sx, 6, 0.5, 12);
    for (let ry = 7.5; ry < 17; ry += 2.5) box('rgba(234,223,174,0.35)', sx + 0.8, ry, 0.5, 0.5);
  }
  box('rgba(0,0,0,0.2)', 26, 11, 32, 2);
  // The pylon at the back, standing up tall: a tapering hump, lit on top, up to the rear rotor's mast.
  fill(P.outline, () => { x.moveTo(5, 7); x.lineTo(24, 8.5); x.lineTo(28, 12); x.lineTo(24, 15.5); x.lineTo(5, 17); x.closePath(); });
  fill(P.olive0, () => { x.moveTo(6, 8); x.lineTo(23.5, 9.3); x.lineTo(26.5, 12); x.lineTo(23.5, 14.7); x.lineTo(6, 16); x.closePath(); });
  fill(P.olive1, () => { x.moveTo(6, 8); x.lineTo(23.5, 9.3); x.lineTo(25.5, 11.3); x.lineTo(6, 11.3); x.closePath(); });
  box(P.olive2, 9, 8.8, 13, 0.8);
  for (const vx of [10, 13, 16, 19]) box(P.outline, vx, 12.8, 1.6, 0.5); // louvres
  // The front rotor's mast fairing.
  box(P.outline, 59, 8, 11, 8, 3);
  box(P.olive0, 59.5, 8.5, 10, 7, 2.5);
  box(P.olive1, 60, 8.8, 9, 3, 1.5);
  // The nose and the cockpit: its frame, two windscreens and the side windows, a glint.
  box(P.olive1, 70, 6.5, 7, 11, 5);
  box(P.outline, 70.5, 7, 6.5, 10, 4);
  box(P.navy1, 71, 7.5, 5.5, 9, 3.5);
  box(P.navy2, 71.5, 8, 3, 3.5, 1.5);
  box(P.outline, 70.5, 11.75, 6.5, 0.6); // the frame down the middle
  box(P.outline, 73.6, 7, 0.5, 10);
  box(P.navy2, 71.5, 12.6, 2, 3, 1);
  box(P.snow2, 72, 8.5, 1, 1);
  // A star on the back, behind the cockpit; the nav lights on the sponsons' tips.
  x.fillStyle = P.snow1;
  x.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 1 : 2.4; x.lineTo(45 + Math.cos(a) * r, 15.3 + Math.sin(a) * r); }
  x.fill();
  box(P.red2, 50, 2, 1.5, 1.5, 0.75);
  box(P.teal2, 50, 20.5, 1.5, 1.5, 0.75);
  body.refresh();

  // A rotor: three long blades, dark, a lighter leading edge, the tips yellow; the hub and its blade grips.
  const { c: rotor, x: r } = canvas('fx-rotor', 64, 64);
  r.translate(32, 32);
  for (let k = 0; k < 3; k++) {
    r.save();
    r.rotate((k * 2 * Math.PI) / 3);
    r.fillStyle = 'rgba(12,13,14,0.9)';
    r.beginPath(); r.moveTo(2, -1.1); r.lineTo(31, -0.9); r.lineTo(31, 0.9); r.lineTo(2, 1.1); r.fill();
    r.fillStyle = P.metal1;
    r.fillRect(3, -1, 25, 0.5);
    r.fillStyle = P.hivis2;
    r.fillRect(28, -0.9, 3, 1.8);
    r.fillStyle = P.metal2;
    r.fillRect(1.5, -1.6, 4, 3.2);
    r.restore();
  }
  r.fillStyle = P.outline; r.beginPath(); r.arc(0, 0, 3.4, 0, 7); r.fill();
  r.fillStyle = P.metal1; r.beginPath(); r.arc(0, 0, 2.6, 0, 7); r.fill();
  r.fillStyle = P.metal2; r.beginPath(); r.arc(-0.6, -0.6, 1.2, 0, 7); r.fill();
  rotor.refresh();
  // Turning fast: a dim disc, darker toward the tips, ringed yellow where the tips go round.
  const { c: blur, x: b } = canvas('fx-rotor-blur', 64, 64);
  const shade = b.createRadialGradient(32, 32, 3, 32, 32, 31);
  shade.addColorStop(0, 'rgba(12,13,14,0.05)');
  shade.addColorStop(0.85, 'rgba(12,13,14,0.22)');
  shade.addColorStop(1, 'rgba(12,13,14,0.3)');
  b.fillStyle = shade; b.beginPath(); b.arc(32, 32, 31, 0, 7); b.fill();
  b.strokeStyle = 'rgba(214,162,62,0.35)'; b.lineWidth = 2.5; b.beginPath(); b.arc(32, 32, 29.5, 0, 7); b.stroke();
  blur.refresh();
}
