// Quality and size estimates from HLS and DASH manifests. Pure functions: popup.js fetches, test.js checks.
// Options have the same shape as the helper's: { value: 'best' | height | 'audio', label, size, approx, url? }.
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function isoDuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(s ?? '');
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : null;
}

function parseHls(text, base) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants = [];
  lines.forEach((l, k) => {
    if (!l.startsWith('#EXT-X-STREAM-INF:')) return;
    const uri = lines.slice(k + 1).find((x) => x && !x.startsWith('#'));
    if (!uri) return;
    // AVERAGE-BANDWIDTH is the better size estimate; BANDWIDTH is the peak.
    const bw = +(/AVERAGE-BANDWIDTH=(\d+)/.exec(l) ?? /[:,]BANDWIDTH=(\d+)/.exec(l))?.[1] || null;
    variants.push({ bw, height: +/RESOLUTION=\d+x(\d+)/.exec(l)?.[1] || null, url: new URL(uri, base).href });
  });
  return {
    variants,
    duration: lines.reduce((s, l) => s + (+/^#EXTINF:([\d.]+)/.exec(l)?.[1] || 0), 0),
    live: !lines.includes('#EXT-X-ENDLIST'),
    drm: /METHOD=SAMPLE-AES/.test(text),
    // Separate audio track, whatever order the attributes come in (Reddit puts URI first).
    splitAudio: /^#EXT-X-MEDIA:(?=[^\n]*TYPE=AUDIO)(?=[^\n]*URI=)/m.test(text),
  };
}

function parseDash(xml) {
  const reps = [];
  for (const [, set, body] of xml.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g)) {
    for (const [, rep] of body.matchAll(/<Representation\b([^>]*)>/g)) {
      const a = { ...attrs(set), ...attrs(rep) };
      reps.push({ kind: (a.contentType || a.mimeType || '').split('/')[0], bw: +a.bandwidth || null, height: +a.height || null });
    }
  }
  return {
    video: reps.filter((r) => r.kind === 'video' || (r.kind !== 'audio' && r.height)),
    audioBw: Math.max(0, ...reps.filter((r) => r.kind === 'audio').map((r) => r.bw ?? 0)),
    duration: isoDuration(/mediaPresentationDuration="([^"]+)"/.exec(xml)?.[1]),
    live: /\btype="dynamic"/.test(xml),
    drm: /<ContentProtection\b/.test(xml),
  };
}

// Size = bitrate x duration / 8, so every size here is an estimate. No duration (live) means no size.
function qualities(video, audioBw, duration) {
  const size = (bw) => (bw && duration ? Math.round((bw * duration) / 8) : null);
  const byHeight = new Map();
  for (const v of video) if (v.height && (byHeight.get(v.height)?.bw ?? -1) < (v.bw ?? 0)) byHeight.set(v.height, v);
  const best = video.reduce((a, b) => ((b.bw ?? 0) > (a?.bw ?? -1) ? b : a), null);
  const opt = (value, label, v) => ({ value, label, size: size(v.bw && v.bw + audioBw), approx: true, url: v.url });
  return [
    ...(best ? [opt('best', 'Best', best)] : []),
    ...[...byHeight.keys()].sort((a, b) => b - a).map((h) => opt(h, h + 'p', byHeight.get(h))),
    ...(audioBw ? [{ value: 'audio', label: 'Audio only', size: size(audioBw), approx: true }] : []),
  ];
}
