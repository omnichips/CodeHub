// Renders the iPhone launch screens (hare on the app background) into public/splash/. Run: node scripts/make-splash.mjs
// iOS picks one by exact screen size, so there is one per iPhone model size. Add a row for new models.
import { mkdirSync } from 'node:fs';
import { webkit } from '@playwright/test';

// [CSS width, CSS height, pixel ratio]
export const SCREENS = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [414, 896, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2], [414, 736, 3],
];

const page = (w) => `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f7f6f1;font:600 ${Math.round(w * 0.085)}px -apple-system,system-ui,sans-serif;color:#1b1b18">
<svg viewBox="0 0 512 512" width="${Math.round(w * 0.3)}" height="${Math.round(w * 0.3)}" fill="#3f7d46"><rect x="158" y="56" width="76" height="210" rx="38"/><rect x="278" y="56" width="76" height="210" rx="38"/><ellipse cx="256" cy="340" rx="140" ry="118"/><circle cx="306" cy="322" r="16" fill="#f7f6f1"/></svg>
<div style="margin-top:${Math.round(w * 0.04)}px">fairs<span style="color:#3f7d46;font-weight:700">hare</span></div></body>`;

if (process.argv[1].endsWith('make-splash.mjs')) {
  mkdirSync('public/splash', { recursive: true });
  const browser = await webkit.launch();
  for (const [w, h, d] of SCREENS) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: d });
    await p.setContent(page(w));
    await p.screenshot({ path: `public/splash/${w * d}x${h * d}.png` });
    await p.close();
  }
  await browser.close();
  console.log(SCREENS.map(([w, h, d]) => `<link rel="apple-touch-startup-image" href="/splash/${w * d}x${h * d}.png" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" />`).join('\n    '));
}
