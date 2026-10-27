import { useEffect, useRef } from 'react';
import { paintPlayerSprite } from './sprite';

const W = 72, H = 26;

// Two pixel kids playing tag across a crayon line while the room connects.
export function LoadingKid() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const frames = [0, 1, 2].map((frame) => [false, true].map((it) => paintPlayerSprite(document.createElement('canvas'), { color: it ? 0 : 1, avatar: '', frame, it })));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    const kid = (x: number, frame: number, it: boolean) => {
      g.save();
      g.translate(Math.round(x), 12);
      g.rotate(Math.PI / 2); // sprites face up; run to the right
      g.drawImage(frames[frame][it ? 1 : 0], -10, -10);
      g.restore();
    };

    const draw = (time: number) => {
      g.clearRect(0, 0, W, H);
      // wobbly crayon ground line
      g.fillStyle = '#2b2a3a';
      for (let x = 0; x < W; x += 1) if ((x * 7) % 11 !== 0) g.fillRect(x, 23 + (Math.sin(x * 0.7) > 0.6 ? 1 : 0), 1, 1);
      const frame = still ? 0 : 1 + (Math.floor(time / 120) % 2);
      // the pair loops across; the chaser stays on screen most of the time
      const lead = ((time / 22) % (W + 24)) + 4;
      // dust behind the runner
      g.fillStyle = 'rgba(176, 138, 90, .7)';
      for (let puff = 1; puff <= 3; puff += 1) if (Math.floor(time / 90 + puff) % 3) g.fillRect(Math.round(lead - 10 - puff * 3), 20 - (puff % 2), puff > 2 ? 2 : 1, 1);
      kid(lead, frame, false);
      kid(lead - 20 + Math.sin(time / 300) * 3, frame === 1 ? 2 : frame === 2 ? 1 : 0, true);
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="loading-kid" aria-hidden="true" />;
}
