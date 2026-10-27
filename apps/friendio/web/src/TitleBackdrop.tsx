import { useEffect, useRef } from 'react';
import { paintPlayground } from './playground';

import { ART_H, ART_W, GATE_X } from './playground';

// lamp heads in art pixels: the toilet block light, the two gate posts, and two posts by the fence
const LAMPS = [[Math.round(ART_W * 0.2), ART_H - 12], [GATE_X - 9, ART_H - 5], [GATE_X + 7, ART_H - 5], [Math.round(ART_W * 0.13), Math.round(ART_H * 0.43)], [Math.round(ART_W * 0.87), Math.round(ART_H * 0.43)]];
// kids playing tag around the dirt yard; the first one is IT
const KIDS = [{ color: '#e85d75', phase: 0 }, { color: '#f7c95b', phase: 0.55 }, { color: '#5bc0f7', phase: 1.5 }, { color: '#7de2a8', phase: 3.4 }];

// The Tag playground at dusk: a tinted copy of the arena art with flickering lamps, fireflies and kids running.
export function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const base = paintPlayground(document.createElement('canvas'));
    const { width, height } = base;
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d')!;

    // bake the dusk tint once
    const dusk = document.createElement('canvas');
    dusk.width = width;
    dusk.height = height;
    const d = dusk.getContext('2d')!;
    d.drawImage(base, 0, 0);
    d.globalCompositeOperation = 'multiply';
    const sky = d.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#9a6a9a');
    sky.addColorStop(1, '#3a2a62');
    d.fillStyle = sky;
    d.fillRect(0, 0, width, height);
    d.globalCompositeOperation = 'source-over';

    const flies = Array.from({ length: 22 }, () => ({ x: Math.random() * width, y: Math.random() * height, phase: Math.random() * Math.PI * 2 }));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;

    const draw = (time: number) => {
      g.drawImage(dusk, 0, 0);
      for (const [x, y] of LAMPS) { g.fillStyle = '#2a2a30'; g.fillRect(x, y, 1, 3); g.fillStyle = '#ffe08a'; g.fillRect(x, y, 1, 1); }
      g.globalCompositeOperation = 'lighter';
      LAMPS.forEach(([x, y], index) => {
        // mostly steady, with the odd quick flicker
        const flicker = Math.sin(time / 90 + index * 7) > 0.97 ? 0.4 : 0.85 + 0.15 * Math.sin(time / 400 + index);
        const glow = g.createRadialGradient(x + 0.5, y + 0.5, 0, x + 0.5, y + 0.5, 16);
        glow.addColorStop(0, `rgba(255, 200, 110, ${0.45 * flicker})`);
        glow.addColorStop(1, 'rgba(255, 200, 110, 0)');
        g.fillStyle = glow;
        g.fillRect(x - 16, y - 16, 33, 33);
      });
      for (const fly of flies) {
        const glow = 0.5 + 0.5 * Math.sin(time / 500 + fly.phase);
        g.fillStyle = `rgba(240, 255, 150, ${glow * 0.9})`;
        g.fillRect(Math.round(fly.x + Math.sin(time / 1700 + fly.phase) * 6), Math.round(fly.y + Math.cos(time / 2100 + fly.phase) * 4), 1, 1);
      }
      g.globalCompositeOperation = 'source-over';
      KIDS.forEach((kid, index) => {
        const angle = time / 2600 + kid.phase + Math.sin(time / 700 + index) * 0.08;
        const x = Math.round(ART_W * 0.49 + Math.cos(angle) * ART_W * 0.3), y = Math.round(ART_H * 0.49 + Math.sin(angle) * ART_H * 0.25);
        g.fillStyle = 'rgba(0, 0, 0, .4)';
        g.fillRect(x, y + 2, 3, 1);
        g.fillStyle = '#0b0914';
        g.fillRect(x - 1, y - 2, 5, 5);
        g.fillStyle = kid.color;
        g.fillRect(x, y - 1, 3, 3);
        if (index === 0) { g.fillStyle = `rgba(255, 60, 60, ${0.35 + 0.25 * Math.sin(time / 150)})`; g.fillRect(x - 2, y - 3, 7, 7); }
      });
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} className="title-backdrop" aria-hidden="true" />;
}
