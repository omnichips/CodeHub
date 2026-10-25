// Animated pixel-art wallpapers. Each draws on a small canvas that CSS scales up with hard edges, so one canvas
// pixel is PX screen pixels. To add a wallpaper, add an entry: init(w, h) makes its state, draw(...) paints a frame.
const PX = 4;
const rand = (a, b) => a + Math.random() * (b - a);
const mod = (n, m) => ((n % m) + m) % m;
const many = (n, make) => Array.from({ length: Math.ceil(n) }, make);

function fillGradient(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function glow(ctx, x, y, r, rgb) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function disc(ctx, cx, cy, r) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

const WALLPAPERS = [
  {
    id: 'aurora',
    name: 'Aurora',
    init: (w, h) => ({ dust: many((w * h) / 400, () => ({ x: rand(0, w), y: rand(0, h), v: rand(1, 4) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      const r = Math.max(w, h);
      fillGradient(ctx, w, h, '#1a2547', '#121428');
      glow(ctx, w * (0.1 + 0.1 * Math.sin(sec / 9)), 0, r * 0.8, '59,122,87');
      glow(ctx, w * (1 - 0.1 * Math.sin(sec / 11)), h, r * 0.75, '108,75,209');
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const d of s.dust) ctx.fillRect(mod(d.x + Math.sin(sec + d.y) * 2, w) | 0, mod(d.y - sec * d.v, h) | 0, 1, 1);
    },
  },
  {
    id: 'stars',
    name: 'Starfield',
    init: (w, h) => ({ stars: many((w * h) / 50, () => ({ x: rand(0, w), y: rand(0, h) | 0, z: 1 + ((Math.random() * 3) | 0), p: rand(0, 7) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      ctx.fillStyle = '#060818';
      ctx.fillRect(0, 0, w, h);
      ['#2c3566', '#7484c4', '#ffffff'].forEach((color, i) => {
        ctx.fillStyle = color;
        for (const star of s.stars) {
          if (star.z !== i + 1) continue;
          const x = mod(star.x - sec * star.z * 3, w) | 0; // nearer stars drift faster
          if (star.z === 3 && Math.sin(sec * 2 + star.p) > 0.85) {
            ctx.fillRect(x - 1, star.y, 3, 1);
            ctx.fillRect(x, star.y - 1, 1, 3);
          } else ctx.fillRect(x, star.y, 1, 1);
        }
      });
    },
  },
  {
    id: 'city',
    name: 'Rainy city',
    init(w, h) {
      const buildings = [];
      for (let x = 0; x < w; ) {
        const bw = rand(6, 16) | 0;
        const bh = rand(h * 0.12, h * 0.42) | 0;
        const windows = [];
        for (let wy = h - bh + 2; wy < h - 2; wy += 3)
          for (let wx = x + 2; wx < x + bw - 2; wx += 3) windows.push({ x: wx, y: wy, p: Math.random(), on: Math.random() < 0.5 });
        buildings.push({ x, w: bw, h: bh, windows });
        x += bw + ((Math.random() * 2) | 0);
      }
      return { buildings, rain: many((w * h) / 80, () => ({ x: rand(0, w), y: rand(0, h), v: rand(50, 80) })) };
    },
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      fillGradient(ctx, w, h, '#0d0b24', '#3b1d5e');
      ctx.fillStyle = '#f5f0ff';
      disc(ctx, (w * 0.78) | 0, (h * 0.18) | 0, 5);
      ctx.fillStyle = '#0a0918';
      for (const b of s.buildings) ctx.fillRect(b.x, h - b.h, b.w, b.h);
      ctx.fillStyle = '#fbbf24';
      for (const b of s.buildings)
        for (const win of b.windows) if (win.on !== mod(sec / 6 + win.p, 1) < 0.08) ctx.fillRect(win.x, win.y, 1, 1); // now and then a light flips
      ctx.fillStyle = 'rgba(150,170,255,0.45)';
      for (const d of s.rain) ctx.fillRect(mod(d.x - sec * d.v * 0.25, w) | 0, mod(d.y + sec * d.v, h) | 0, 1, 2);
    },
  },
  {
    id: 'embers',
    name: 'Embers',
    init: (w, h) => ({ sparks: many((w * h) / 90, () => ({ x: rand(0, w), y: rand(0, h), v: rand(4, 14), p: rand(0, 7) })) }),
    draw(ctx, w, h, t, s) {
      const sec = t / 1000;
      fillGradient(ctx, w, h, '#0c0606', '#3a1206');
      const colors = ['#9a3412', '#f97316', '#fde047']; // cooler as they rise
      const buckets = colors.map(() => []);
      for (const p of s.sparks) {
        const y = mod(p.y - sec * p.v, h);
        buckets[Math.min(2, ((y / h) * 3) | 0)].push(mod(p.x + Math.sin(sec * 0.8 + p.p) * 3, w) | 0, y | 0);
      }
      buckets.forEach((xy, i) => {
        ctx.fillStyle = colors[i];
        for (let j = 0; j < xy.length; j += 2) ctx.fillRect(xy[j], xy[j + 1], 1, 1);
      });
    },
  },
];

// Runs a wallpaper on the canvas at ~15 fps (plenty for pixel art, easy on phones). Returns set(id), which switches
// wallpaper (an unknown id gets the first) and returns the id in use. With reduced motion it paints one still frame.
function startWallpaper(canvas) {
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let wp, state, w, h, last = 0;
  const paint = () => wp.draw(ctx, w, h, still ? 4000 : performance.now(), state);
  const size = () => {
    w = canvas.width = Math.ceil(canvas.clientWidth / PX);
    h = canvas.height = Math.ceil(canvas.clientHeight / PX);
    state = wp.init(w, h);
  };
  const set = (next) => {
    wp = WALLPAPERS.find((x) => x.id === next) ?? WALLPAPERS[0];
    size();
    paint();
    return wp.id;
  };
  // The canvas is sized in lvh, so the phone's address bar showing and hiding does not reshuffle it.
  addEventListener('resize', () => {
    if (Math.ceil(canvas.clientWidth / PX) === w && Math.ceil(canvas.clientHeight / PX) === h) return;
    size();
    paint();
  });
  const frame = (t) => {
    if (t - last >= 66) {
      last = t;
      paint();
    }
    requestAnimationFrame(frame); // the browser pauses this while the tab is hidden
  };
  if (!still) requestAnimationFrame(frame); // set() runs before the first frame
  return set;
}

function drawThumb(canvas, wp) {
  wp.draw(canvas.getContext('2d'), canvas.width, canvas.height, 4000, wp.init(canvas.width, canvas.height));
}
