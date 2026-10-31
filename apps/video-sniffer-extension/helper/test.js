// Run: node test.js  (pure helpers + one round trip over the native-messaging framing; no yt-dlp needed)
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeUrl, formatArg, failure, options, withCookies, leftovers, outName } = require('./vsniff-helper.js');

assert.strictEqual(safeUrl('https://a.com/x y"z'), 'https://a.com/x%20y%22z');
assert.throws(() => safeUrl('--exec calc'));
assert.throws(() => safeUrl('file:///c:/windows'));

assert.strictEqual(formatArg(720), 'bv*[height<=720]+ba/b[height<=720]');
assert.strictEqual(formatArg('audio'), 'ba/b');
assert.strictEqual(formatArg('720; rm'), 'bv*+ba/b');

assert.strictEqual(failure('ERROR: [generic] Unsupported URL: https://x.com/login').error, 'unsupported');
assert.strictEqual(failure('ERROR: [youtube] x: Sign in to confirm you\'re not a bot').error, 'blocked');
assert.strictEqual(failure('ERROR: This video is DRM protected').error, 'protected');
assert.strictEqual(failure('ERROR: [instagram] x: This content is private. Log in').error, 'login');
assert.strictEqual(failure('ERROR: unable to download video data: HTTP Error 403: Forbidden').error, 'expired');
assert.strictEqual(failure('WARNING: a\nERROR: boom\nmore').detail, 'ERROR: boom');

const info = {
  duration: 10,
  formats: [
    { format_id: 'a', vcodec: 'none', acodec: 'mp4a', filesize: 100 },
    { format_id: 'v360', vcodec: 'avc1', acodec: 'none', height: 360, filesize: 1000 },
    { format_id: 'v720', vcodec: 'avc1', acodec: 'none', height: 720, tbr: 8 }, // no size: estimated from bitrate
    { format_id: 'sb', vcodec: 'none', acodec: 'none', ext: 'mhtml' }, // storyboard: ignored
  ],
};
assert.deepStrictEqual(options(info), [
  { value: 'best', label: 'Best', size: 10000 + 100, approx: true },
  { value: 720, label: '720p', size: 10000 + 100, approx: true },
  { value: 360, label: '360p', size: 1100, approx: false },
  { value: 'audio', label: 'Audio only', size: 100, approx: false },
]);
// A combined file (video with sound) is not paired with extra audio.
assert.deepStrictEqual(options({ formats: [{ vcodec: 'avc1', acodec: 'mp4a', filesize: 5 }] }), [
  { value: 'best', label: 'Best', size: 5, approx: false },
]);

// Cookie file exists only during the run, in Netscape format.
let seen;
withCookies('.x.com\tTRUE\t/\tTRUE\t0\tsid\tabc', async ([flag, file]) => {
  assert.strictEqual(flag, '--cookies');
  seen = file;
  assert.match(fs.readFileSync(file, 'utf8'), /^# Netscape HTTP Cookie File\n\.x\.com\tTRUE/);
}).then(() => assert.ok(!fs.existsSync(seen)));
withCookies(undefined, async (c) => assert.deepStrictEqual(c, []));

// Cancel cleanup removes only unfinished pieces from this job.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsniff-test-'));
fs.mkdirSync(path.join(dir, 'List'));
const mk = (n) => { const f = path.join(dir, n); fs.writeFileSync(f, ''); return f; };
const want = [mk('a [x].mp4.part'), mk('a [x].f137.mp4'), mk('a [x].mp4.ytdl'), mk('List/001 b [y].fhls-720p.mp4'), mk('a [x].mp4.part-Frag12')];
const done = mk('List/000 c [z].mp4');
const keep = [mk('My.fun.mp4'), done];
const old = mk('old.mp4.part');
fs.utimesSync(old, new Date(0), new Date(0));
assert.deepStrictEqual(leftovers(dir, Date.now() - 60e3, keep).sort(), want.sort());
fs.rmSync(dir, { recursive: true });

// Framing round trip: a bad link is refused before yt-dlp or config.json is touched.
const p = spawn(process.execPath, [__dirname + '/vsniff-helper.js']);
const body = Buffer.from(JSON.stringify({ cmd: 'probe', url: 'file:///c:/x' }));
const head = Buffer.alloc(4);
head.writeUInt32LE(body.length);
p.stdin.write(Buffer.concat([head, body]));
p.stdout.once('data', (d) => {
  const reply = JSON.parse(d.subarray(4, 4 + d.readUInt32LE(0)));
  assert.strictEqual(reply.error, 'error');
  assert.match(reply.detail, /Not a web link/);
  p.stdin.end();
  console.log('ok');
});

// File names carry the resolution; page names are cleaned of path characters and template markers.
assert.match(outName({}), /\[%\(id\)s\] %\(resolution\)s\.%\(ext\)s$/);
assert.strictEqual(outName({ name: 'a/b: 100% "real"' }), 'a_b_ 100_ _real_ %(resolution)s.%(ext)s');
assert.match(outName({ playlist: true, name: 'x' }), /^%\(playlist_title\)/);
