// Native messaging host: Chrome starts it and talks over stdin/stdout; it runs your own copy of yt-dlp.
// Safety: no shell is ever used. yt-dlp gets an argument array, links must be http(s) and come after "--",
// files are saved only under config.downloads, and nothing here fetches updates.
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const children = new Set();
const cookieFiles = new Set();
let current = null; // the running download: { dir, since, files } for cleanup if it is cancelled
const PROBE_LIMIT = 90e3; // a stuck check (slow site, bot wall) gives up instead of spinning forever

// yt-dlp.exe starts a child process of its own, so stop the whole tree.
function stop(p) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true });
  else p.kill();
}

// Unfinished pieces yt-dlp leaves behind: .part/.ytdl files, fragments, and single-format files waiting to be merged.
// Only files written since the job started, and never a file the job already finished.
function leftovers(dir, since, keep) {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(part|ytdl)$|\.part-Frag\d+$|\.f[\w-]+\.\w{2,4}$/.test(e.name))
    .map((e) => path.join(e.parentPath ?? e.path, e.name))
    .filter((f) => !keep.includes(f) && fs.statSync(f).mtimeMs >= since);
}

function config() {
  const c = require('./config.json'); // written by install.ps1
  // ponytail: Windows-only exe name; add a platform switch when the helper runs on Mac/Linux.
  return { ytdlp: path.join(c.tools, 'yt-dlp.exe'), ffmpeg: path.join(c.tools, 'ffmpeg.exe'), tools: c.tools, downloads: c.downloads };
}

function safeUrl(u) {
  let url;
  try { url = new URL(u); } catch {}
  if (!url || !/^https?:$/.test(url.protocol)) throw new Error('Not a web link: ' + String(u).slice(0, 100));
  return url.href; // href percent-encodes quotes and spaces
}

function formatArg(q) {
  if (q === 'audio') return 'ba/b';
  if (Number.isInteger(q) && q > 0) return `bv*[height<=${q}]+ba/b[height<=${q}]`;
  return 'bv*+ba/b';
}

// Order matters: YouTube's bot check says "Sign in", so it must match "blocked" before "login".
const REASONS = [
  ['protected', /DRM/],
  ['unsupported', /Unsupported URL|No video formats|no video|not a video/i],
  ['blocked', /HTTP Error 429|rate.?limit|not a bot|captcha|too many requests/i],
  ['region', /country|geo.?restrict|region/i],
  ['login', /private|log ?in|sign ?in|cookies|authenticat|members.only|age.?restrict|confirm your age/i],
  ['expired', /HTTP Error (403|410)|expired/i],
];

function failure(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  return {
    error: REASONS.find(([, re]) => re.test(text))?.[0] ?? 'error',
    detail: (lines.filter((l) => l.startsWith('ERROR')).pop() ?? lines.pop() ?? 'yt-dlp failed').slice(0, 300),
  };
}

// Quality choices with a size each, mirroring yt-dlp's own "bv*+ba/b" pick (formats are sorted worst to best).
function options(info) {
  const f = info.formats ?? [];
  const size = (x) => x.filesize ?? x.filesize_approx ?? (x.tbr && info.duration ? Math.round(x.tbr * 125 * info.duration) : null);
  const video = f.filter((x) => x.vcodec !== 'none');
  const audio = f.filter((x) => x.vcodec === 'none' && x.acodec && x.acodec !== 'none');
  const ba = audio.at(-1);
  const opt = (value, label, parts) => {
    parts = parts.filter(Boolean);
    if (!parts.length) return null;
    const sizes = parts.map(size);
    return { value, label, size: sizes.includes(null) ? null : sizes.reduce((a, b) => a + b), approx: parts.some((x) => !x.filesize) };
  };
  const withAudio = (v) => [v, v && v.acodec === 'none' ? ba : null];
  const heights = [...new Set(video.map((x) => x.height).filter(Boolean))].sort((a, b) => b - a);
  return [
    opt('best', 'Best', withAudio(video.at(-1))),
    ...heights.map((h) => opt(h, h + 'p', withAudio(video.filter((x) => (x.height ?? 0) <= h).at(-1)))),
    opt('audio', 'Audio only', [ba]),
  ].filter(Boolean);
}

function run(args, onLine = () => {}, exe = config().ytdlp, limit = 0) {
  return new Promise((resolve) => {
    const p = spawn(exe, exe === config().ytdlp ? ['--ignore-config', ...args] : args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    children.add(p);
    const out = [], err = [];
    const timer = limit && setTimeout(() => { err.push('ERROR: timed out'); stop(p); }, limit);
    p.on('close', () => clearTimeout(timer));
    readline.createInterface({ input: p.stdout }).on('line', (l) => { out.push(l); onLine(l, true); });
    readline.createInterface({ input: p.stderr }).on('line', (l) => { err.push(l); if (err.length > 30) err.shift(); onLine(l, false); });
    p.on('error', (e) => { children.delete(p); resolve({ code: -1, out, err: 'Could not start yt-dlp: ' + e.message }); });
    p.on('close', (code) => { children.delete(p); resolve({ code, out, err: err.join('\n') }); });
  });
}

async function version() {
  const [r, f] = await Promise.all([run(['--version']), run(['-version'], undefined, config().ffmpeg)]);
  if (r.code !== 0) return failure(r.err);
  // copied: when your copy of yt-dlp.exe was written, for the "refresh it monthly" reminder.
  return { version: r.out[0]?.trim(), copied: fs.statSync(config().ytdlp).mtimeMs, ffmpeg: /ffmpeg version (\S+)/.exec(f.out[0] ?? '')?.[1] ?? 'missing' };
}

// "Use my browser login": the extension sends the site's cookies, which live in a private temp file for one run only.
async function withCookies(text, fn) {
  if (typeof text !== 'string' || !text) return fn([]);
  const file = path.join(os.tmpdir(), `vsniff-${crypto.randomUUID()}.txt`);
  cookieFiles.add(file);
  fs.writeFileSync(file, '# Netscape HTTP Cookie File\n' + text + '\n', { mode: 0o600 });
  try { return await fn(['--cookies', file]); }
  finally { fs.rmSync(file, { force: true }); cookieFiles.delete(file); }
}

async function probe(url, cookies) {
  url = safeUrl(url);
  const r = await withCookies(cookies, (c) => run([...c, '-J', '--no-playlist', '--flat-playlist', '--', url], undefined, undefined, PROBE_LIMIT));
  if (r.err.endsWith('ERROR: timed out')) return { error: 'timeout', detail: `No answer from yt-dlp in ${PROBE_LIMIT / 1000} seconds` };
  if (r.code !== 0) return failure(r.err);
  const info = JSON.parse(r.out.join('\n'));
  if (info._type === 'playlist') {
    const entries = (info.entries ?? [])
      .map((e) => ({ title: e.title ?? e.url, url: e.webpage_url ?? e.url }))
      .filter((e) => /^https?:/.test(e.url))
      .slice(0, 100);
    return entries.length ? { title: info.title, url, entries } : { error: 'unsupported', detail: 'Empty playlist' };
  }
  const opts = options(info);
  return opts.length ? { title: info.title, url, thumbnail: info.thumbnail, options: opts } : { error: 'unsupported', detail: 'No video formats found' };
}

// File name: the resolution is part of it, so the same video at another quality is a new file instead of
// yt-dlp skipping it as "already downloaded". Streams found on a page are named after the page (m.name),
// since their own titles are things like "master" or "HLSPlaylist".
function outName(m) {
  if (m.playlist) return '%(playlist_title).80B/%(playlist_index)03d %(title).120B [%(id)s] %(resolution)s.%(ext)s';
  const name = typeof m.name === 'string' ? m.name.replace(/[\\/:*?"<>|%\x00-\x1f]/g, '_').trim().slice(0, 120) : '';
  return name ? `${name} %(resolution)s.%(ext)s` : '%(title).150B [%(id)s] %(resolution)s.%(ext)s';
}

async function download(m, send) {
  const url = safeUrl(m.url), referer = m.referer && safeUrl(m.referer);
  const origin = m.origin && new URL(safeUrl(m.origin)).origin;
  const { downloads, tools } = config();
  const args = [
    '-f', formatArg(m.format),
    '-P', downloads,
    '-o', outName(m),
    '--ffmpeg-location', tools,
    m.playlist ? '--yes-playlist' : '--no-playlist',
    '--no-mtime', '--newline', '--progress',
    '--progress-template', 'download:vsniff %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
    '--print', 'after_move:filepath',
  ];
  if (referer) args.push('--referer', referer);
  if (origin) args.push('--add-headers', 'Origin:' + origin);
  const files = [];
  current = { dir: downloads, since: Date.now() - 2000, files };
  let last = -1;
  const r = await withCookies(m.cookies, (c) => run([...c, ...args, '--', url], (l, isOut) => {
    const p = /^vsniff (\S+) (\S+) (\S+)/.exec(l);
    if (p) {
      const pct = Math.floor((100 * p[1]) / (+p[2] || +p[3]));
      if (pct >= 0 && pct <= 100 && pct !== last) send({ pct: (last = pct), saved: files.length });
    } else if (isOut && l.trim()) files.push(l.trim());
  }));
  current = null;
  // A playlist can save some items and still exit non-zero.
  send(r.code === 0 || files.length ? { done: true, files, partial: r.code !== 0 } : failure(r.err));
}

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([head, body]));
}

async function handle(m) {
  try {
    if (m.cmd === 'version') send(await version());
    else if (m.cmd === 'probe') send(await probe(m.url, m.cookies));
    else if (m.cmd === 'download') await download(m, send);
    else send({ error: 'error', detail: 'Unknown command' });
  } catch (e) {
    send({ error: 'error', detail: String(e.message ?? e) });
  }
}

if (require.main === module) {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const n = buf.readUInt32LE(0);
      const raw = buf.subarray(4, 4 + n);
      buf = buf.subarray(4 + n);
      let msg;
      try { msg = JSON.parse(raw); } catch { send({ error: 'error', detail: 'Bad message' }); continue; }
      handle(msg);
    }
  });
  // Chrome closed the port (popup cancelled, browser quit): stop yt-dlp too.
  process.stdin.on('end', () => {
    for (const c of children) stop(c);
    for (const f of cookieFiles) fs.rmSync(f, { force: true });
    // Windows can keep a file locked for a moment after its process is killed: retry for up to ~2 seconds.
    if (current) for (const f of leftovers(current.dir, current.since, current.files)) {
      try { fs.rmSync(f, { force: true, recursive: true, maxRetries: 10, retryDelay: 40 }); } catch {}
    }
    process.exit(0);
  });
}

module.exports = { safeUrl, formatArg, failure, options, withCookies, leftovers, outName };
