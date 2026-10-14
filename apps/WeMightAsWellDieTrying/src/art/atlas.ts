// Loads the sprite atlas drawn at build time (one texture, so a crowd draws in few calls) and makes the animations.
import Phaser from 'phaser';
import atlas from 'virtual:atlas';
import palette from '../data/palette.json' with { type: 'json' };

/** Call from a scene's preload(). */
export function load(scene: Phaser.Scene) {
  if (!scene.textures.exists('sprites')) scene.load.image('sprites', atlas.image);
}

/** Call from a scene's create(): names the frames, makes the animations and the asphalt tile. */
export function bake(scene: Phaser.Scene) {
  const tex = scene.textures.get('sprites');
  if (tex.has(atlas.frames[0].name)) return;
  for (const f of atlas.frames) tex.add(f.name, 0, f.x, f.y, f.size, f.size);
  for (const [key, { fps, count }] of Object.entries(atlas.anims))
    scene.anims.create({ key, frameRate: fps, repeat: -1, frames: Array.from({ length: count }, (_, k) => ({ key: 'sprites', frame: `${key}/${k}` })) });

  const road = scene.textures.createCanvas('asphalt', 64, 64)!, ctx = road.context;
  ctx.fillStyle = palette.asphalt1;
  ctx.fillRect(0, 0, 64, 64);
  for (let k = 0; k < 300; k++) {
    ctx.fillStyle = k % 2 ? palette.asphalt0 : palette.asphalt2;
    ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1, 1);
  }
  road.refresh();
}

/** One frame as an image URL, for buttons drawn in HTML. */
export function icon(scene: Phaser.Scene, frame: string) {
  const f = scene.textures.getFrame('sprites', frame), cv = document.createElement('canvas');
  cv.width = f.width;
  cv.height = f.height;
  cv.getContext('2d')!.drawImage(f.source.image as HTMLImageElement, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);
  return cv.toDataURL();
}
