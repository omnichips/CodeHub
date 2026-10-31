// No helper installed: fetch an HLS media playlist's segments and join them into one file in memory.
// Plain .ts segments join into a .ts file (plays in VLC); fMP4 segments with an init segment join into an .mp4.
// ponytail: sequential, in memory, not resumable; fine for short videos, which is all this is offered for.
const cancelled = new Set();
chrome.runtime.onMessage.addListener((m) => {
  if (m.kind === 'offscreen-join') { cancelled.delete(m.key); join(m); }
  else if (m.kind === 'offscreen-cancel') cancelled.add(m.key);
});

async function get(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}

async function join({ key, url, name }) {
  const report = (job) => chrome.runtime.sendMessage({ kind: 'progress', key, job }).catch(() => {});
  try {
    const text = await (await get(url)).text();
    if (/#EXT-X-STREAM-INF/.test(text)) throw new Error('Expected a media playlist, got a master playlist');
    if (/#EXT-X-BYTERANGE|#EXT-X-KEY:METHOD=(?!NONE)/.test(text)) return report({ error: 'nojoin' });
    const init = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(text)?.[1];
    const segs = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (init) segs.unshift(init);
    const parts = [];
    for (let k = 0; k < segs.length; k++) {
      if (cancelled.has(key)) return; // background.js already marked it cancelled
      parts.push(await (await get(new URL(segs[k], url).href)).arrayBuffer());
      if (k % 5 === 0) report({ pct: Math.floor((100 * k) / segs.length) });
    }
    const blob = URL.createObjectURL(new Blob(parts, { type: init ? 'video/mp4' : 'video/mp2t' }));
    chrome.runtime.sendMessage({ kind: 'joined', key, blob, name: name + (init ? '.mp4' : '.ts') }).catch(() => {});
    // ponytail: freed after 10 minutes; a "Save as" dialog left open longer than that loses the file.
    setTimeout(() => URL.revokeObjectURL(blob), 10 * 60e3);
  } catch (e) {
    report({ error: 'expired', detail: e.message });
  }
}
