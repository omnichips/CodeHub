// The art viewer (open the game with ?art): every sprite and animation, on asphalt.
// Idle / Walk / Shoot show every soldier class in every facing, plus every zombie; Street shows them at play size.
import Phaser from 'phaser';
import palette from './data/palette.json' with { type: 'json' };
import units from './data/units.json' with { type: 'json' };
import zombies from './data/zombies.json' with { type: 'json' };
import { bake, load } from './art/atlas.ts';
import { DIRS } from './art/sprites.ts';

const MODES = ['idle', 'walk', 'shoot', 'street'] as const;
type Mode = (typeof MODES)[number];
const facing = (dx: number, dy: number) => (Math.round(Math.atan2(dy, dx) / ((2 * Math.PI) / DIRS)) + DIRS) % DIRS;
const label = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '12px', color: palette.paint };

export class View extends Phaser.Scene {
  mode: Mode = 'idle';
  spinning: Phaser.GameObjects.Sprite[] = [];
  crowd: { s: Phaser.GameObjects.Sprite; speed: number; phase: number }[] = [];
  soldier?: Phaser.GameObjects.Sprite;
  target?: Phaser.Math.Vector2;
  dir = 6; // north
  zoom = 1;

  constructor() { super('view'); }

  init(data: { mode?: Mode }) {
    this.mode = data.mode ?? 'idle';
    this.spinning = [];
    this.crowd = [];
    this.soldier = this.target = undefined;
  }

  preload() { load(this); }

  create() {
    bake(this);
    this.button();
    const { width: W, height: H } = this.scale;
    const restart = () => this.scene.restart({ mode: this.mode });
    this.scale.once('resize', restart);
    this.events.once('shutdown', () => this.scale.off('resize', restart));
    if (this.mode === 'street') this.street(W, H);
    else this.sheet(W, H, this.mode);
  }

  sheet(W: number, H: number, anim: Mode) {
    const kinds = Object.keys(units) as (keyof typeof units)[], zs = Object.keys(zombies), cols = Math.max(DIRS, zs.length);
    const Z = (this.zoom = Math.max(1, Math.floor((W - 130) / (cols * 36)))), cell = 36 * Z, left = 130 + cell / 2, top = 12 + cell / 2;
    const rows = kinds.length + 3, height = top + rows * cell + cell / 2;
    this.add.tileSprite(0, 0, W, Math.max(H, height), 'asphalt').setOrigin(0).setTileScale(Z);
    kinds.forEach((kind, r) => {
      this.add.text(8, top + r * cell, units[kind].name, label).setOrigin(0, 0.5);
      for (let d = 0; d < DIRS; d++) this.add.sprite(left + d * cell, top + r * cell, 'sprites').setScale(Z).play(`${kind}-${anim}-${d}`);
    });
    const zy = top + kinds.length * cell + cell / 4;
    this.add.text(8, zy, 'Zombies\nany angle', label).setOrigin(0, 0.5);
    zs.forEach((z, k) => {
      const s = this.add.sprite(left + k * cell, zy, 'sprites').setScale(Z).setRotation(k).play({ key: `${z}-walk`, startFrame: k % 2 });
      this.spinning.push(s);
      this.add.text(left + k * cell, zy + cell * 0.75, zombies[z as keyof typeof zombies].name, { ...label, fontSize: '10px' }).setOrigin(0.5, 0);
    });
    // Roadblocks, structures and strike icons, two rows.
    const props = ['plastic', 'wood', 'sandbags', 'cement', 'car', 'rigged', 'watchtower', 'nest', 'incendiary', 'ammo', 'mine', 'wire', 'explosives', 'generator', 'spikes', 'noise', 'missile', 'a10', 'napalm', 'smoke', 'artillery', 'flare'];
    const py = zy + cell * 1.25, half = Math.ceil(props.length / 2);
    this.add.text(8, py + cell / 2, 'Built and\nstrikes', label).setOrigin(0, 0.5);
    props.forEach((name, k) => this.add.image(left + (k % half) * cell, py + Math.floor(k / half) * cell, 'sprites', `${name}/0`).setScale(Z));
    // Drag to scroll when it does not all fit.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, Math.max(H, height + cell));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) cam.scrollY -= p.y - p.prevPosition.y; });
  }

  street(W: number, H: number) {
    const Z = (this.zoom = 2); // roughly the zoom the game will play at
    this.add.tileSprite(0, 0, W, H, 'asphalt').setOrigin(0).setTileScale(Z);
    const paint = this.add.graphics().fillStyle(Phaser.Display.Color.HexStringToColor(palette.paint).color, 0.55);
    for (let y = 0; y < H; y += 22 * Z) paint.fillRect(Math.round(W / 2 - Z), y, 2 * Z, 12 * Z); // faded centre line
    for (let x = 0; x < W; x += 9 * Z) paint.fillRect(x, Math.round(H * 0.6), 5 * Z, 22 * Z); // crosswalk
    for (let i = 0; i < 80; i++) {
      const s = this.add.sprite(Math.random() * W, Math.random() * H * 2 - H, 'sprites').setScale(Z);
      this.crowd.push({ s: s.play({ key: 'normal-walk', startFrame: i % 2 }), speed: (5 + Math.random() * 6) * Z, phase: Math.random() * 6 });
    }
    this.soldier = this.add.sprite(W / 2, H * 0.8, 'sprites').setScale(Z).setDepth(1).play('rifleman-idle-6');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.target = new Phaser.Math.Vector2(p.x, p.y)));
    this.add.text(8, H - 8, 'Tap to move the Rifleman. Standing still, he aims at the nearest zombie.', label).setOrigin(0, 1).setDepth(2);
  }

  update(time: number, ms: number) {
    const dt = ms / 1000, Z = this.zoom, { width: W, height: H } = this.scale;
    for (const s of this.spinning) s.rotation += dt * 0.4;
    for (const z of this.crowd) {
      const vx = Math.sin(time / 900 + z.phase) * 3 * Z, vy = z.speed;
      z.s.setPosition(z.s.x + vx * dt, z.s.y + vy * dt).setRotation(Math.atan2(vy, vx));
      if (z.s.y > H + 20 * Z) z.s.setPosition(Math.random() * W, -20 * Z);
    }
    const s = this.soldier;
    if (!s) return;
    if (this.target) {
      const dx = this.target.x - s.x, dy = this.target.y - s.y, dist = Math.hypot(dx, dy), step = Math.min(dist, 35 * Z * dt);
      if (dist < 1) this.target = undefined;
      else {
        s.setPosition(s.x + (dx / dist) * step, s.y + (dy / dist) * step);
        s.play(`rifleman-walk-${(this.dir = facing(dx, dy))}`, true);
        return;
      }
    }
    let near: Phaser.GameObjects.Sprite | undefined, best = (110 * Z) ** 2;
    for (const { s: z } of this.crowd) {
      const d2 = (z.x - s.x) ** 2 + (z.y - s.y) ** 2;
      if (d2 < best) { best = d2; near = z; }
    }
    if (near) s.play(`rifleman-shoot-${(this.dir = facing(near.x - s.x, near.y - s.y))}`, true);
    else s.play(`rifleman-idle-${this.dir}`, true);
  }

  /** The Sheet / Street switch, in HTML so it stays sharp. */
  button() {
    let b = document.getElementById('mode');
    if (!b) {
      b = Object.assign(document.createElement('button'), { id: 'mode', type: 'button' });
      b.addEventListener('click', () => this.scene.restart({ mode: MODES[(MODES.indexOf(this.mode) + 1) % MODES.length] }));
      document.body.append(b);
    }
    const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    b.textContent = next[0].toUpperCase() + next.slice(1);
  }
}
