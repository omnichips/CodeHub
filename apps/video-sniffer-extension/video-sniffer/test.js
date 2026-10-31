// Run: node test.js  (loads background.js with a stubbed chrome API and checks the pure helpers)
const vm = require('vm');
const fs = require('fs');
const assert = require('assert');

const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub });
const ctx = vm.createContext({ chrome: stub, console, URL });
ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/background.js', 'utf8'), ctx);
const { classify, normalize, sizeOf } = ctx;
const { isYouTube, samePage } = vm.runInContext('({ isYouTube, samePage })', ctx);

assert.strictEqual(classify('https://x.com/a/v.mp4?sig=1'), 'MP4');
assert.strictEqual(classify('https://x.com/a/master.m3u8'), 'HLS');
assert.strictEqual(classify('https://x.com/a/m.mpd'), 'DASH');
assert.strictEqual(classify('https://x.com/seg1.ts'), 'SEG');
assert.strictEqual(classify('https://x.com/seg1.m4s'), 'SEG');
assert.strictEqual(classify('https://x.com/stream?id=1', 'application/vnd.apple.mpegurl'), 'HLS');
assert.strictEqual(classify('https://x.com/stream?id=1', 'video/mp4'), 'MP4');
assert.strictEqual(classify('https://x.com/stream?id=1', 'audio/mp4'), 'AUDIO');
assert.strictEqual(classify('https://x.com/page.html', 'text/html'), null);
assert.strictEqual(classify('not a url'), null);

assert.strictEqual(
  normalize('https://fb.com/v.mp4?a=1&bytestart=0&byteend=999#t'),
  'https://fb.com/v.mp4?a=1'
);
assert.strictEqual(normalize('nope'), null);

assert.ok(isYouTube('https://www.youtube.com/watch?v=x') && isYouTube('https://rr3---sn-x.googlevideo.com/videoplayback'));
assert.ok(!isYouTube('https://notyoutube.com/a.mp4') && !isYouTube('nope'));
assert.ok(samePage('https://x.com/a#t', 'https://x.com/a') && !samePage('https://x.com/a', 'https://x.com/b') && !samePage(true, 'https://x.com/a'));

const h = (statusCode, headers) => ({ statusCode, responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })) });
assert.strictEqual(sizeOf(h(206, { 'Content-Range': 'bytes 0-0/12345', 'Content-Length': '1' })), 12345);
assert.strictEqual(sizeOf(h(200, { 'Content-Length': '777' })), 777);
assert.strictEqual(sizeOf(h(206, { 'Content-Length': '777' })), null);
assert.strictEqual(sizeOf(h(200, {})), null);

console.log('ok');

// streams.js: manifest parsing and size estimates
const s = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(__dirname + '/streams.js', 'utf8'), s);
assert.strictEqual(s.isoDuration('PT1H2M3.5S'), 3723.5);
assert.strictEqual(s.isoDuration('PT45S'), 45);
assert.strictEqual(s.isoDuration('junk'), null);

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
https://cdn.x/hi.m3u8`;
const hm = s.parseHls(master, 'https://x.com/v/master.m3u8');
assert.deepStrictEqual(JSON.parse(JSON.stringify(hm.variants)), [
  { bw: 800000, height: 360, url: 'https://x.com/v/low/index.m3u8' },
  { bw: 3000000, height: 720, url: 'https://cdn.x/hi.m3u8' },
]);
const media = s.parseHls('#EXTM3U\n#EXTINF:4.0,\na.ts\n#EXTINF:6,\nb.ts\n#EXT-X-ENDLIST', 'https://x.com/');
assert.strictEqual(media.duration, 10);
assert.strictEqual(media.live, false);
assert.strictEqual(s.parseHls('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://k"', 'https://x.com/').drm, true);
assert.strictEqual(s.parseHls('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="a.m3u8"', 'https://x.com/').splitAudio, true);
assert.strictEqual(s.parseHls('#EXTM3U\n#EXT-X-MEDIA:URI="HLS_AUDIO_64.m3u8",TYPE=AUDIO,GROUP-ID="0"', 'https://x.com/').splitAudio, true);
assert.strictEqual(s.parseHls('#EXT-X-MEDIA:TYPE=SUBTITLES,URI="s.m3u8"', 'https://x.com/').splitAudio, false);

const q = JSON.parse(JSON.stringify(s.qualities(hm.variants, 0, 10)));
assert.deepStrictEqual(q.map((o) => [o.value, o.size]), [['best', 3750000], [720, 3750000], [360, 1000000]]);
assert.strictEqual(s.qualities(hm.variants, 0, null)[0].size, null); // live: unknown

const mpd = `<MPD type="static" mediaPresentationDuration="PT10S">
<AdaptationSet mimeType="video/mp4"><Representation id="1" bandwidth="1000000" height="480"/><Representation id="2" bandwidth="2000000" height="720"/></AdaptationSet>
<AdaptationSet contentType="audio"><Representation id="a" bandwidth="128000"/></AdaptationSet></MPD>`;
const d = s.parseDash(mpd);
assert.strictEqual(d.duration, 10);
assert.strictEqual(d.audioBw, 128000);
assert.strictEqual(d.drm, false);
const dq = JSON.parse(JSON.stringify(s.qualities(d.video, d.audioBw, d.duration)));
assert.deepStrictEqual(dq.map((o) => [o.value, o.size]), [['best', 2660000], [720, 2660000], [480, 1410000], ['audio', 160000]]);
assert.strictEqual(s.parseDash('<MPD type="dynamic"><ContentProtection/></MPD>').drm, true);

console.log('streams ok');

// The content scripts carry their own copy of the video file types; it must match types.js.
const t = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/types.js', 'utf8') + ';this.x = __vsniffVideoExt;', t);
const want = t.x.split('|').sort().join('|');
const listIn = (file, re) => re.exec(fs.readFileSync(__dirname + '/' + file, 'utf8'))?.[1].split('|').sort().join('|');
assert.strictEqual(listIn('content-main.js', /const MEDIA = \/\\.\(([a-z0-9|]+)\)/), want);
assert.strictEqual(listIn('content-isolated.js', /const URL_RE = .*?\\.\(\?:([a-z0-9|]+)\)/), want);
console.log('types ok');
