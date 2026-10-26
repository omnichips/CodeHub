import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const build = fileURLToPath(new URL('../scripts/build.mjs', import.meta.url));

/** Writes a registry and a tiny static app into a temp folder, builds it, and returns the result. */
function run(apps, { files = { 'index.html': '<h1>hi</h1>' } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-'));
  mkdirSync(join(dir, 'app'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'app', name), text);
  writeFileSync(join(dir, 'apps.json'), JSON.stringify({ title: 'Test <&> "site"', apps }));
  const result = spawnSync(process.execPath, [build], { env: { ...process.env, HUB_REGISTRY: join(dir, 'apps.json'), HUB_OUT: join(dir, 'out') }, encoding: 'utf8' });
  return { ...result, out: join(dir, 'out') };
}
const good = { id: 'one', name: 'One', source: { type: 'static', dir: 'app' } };

test('a good registry builds a launcher and the app', () => {
  const r = run([good]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(r.out, 'one', 'index.html')));
  assert.ok(existsSync(join(r.out, 'vercel.json')));
  const html = readFileSync(join(r.out, 'index.html'), 'utf8');
  assert.ok(html.includes('<title>Test &lt;&amp;&gt; &quot;site&quot;</title>'), 'title is escaped');
  assert.ok(html.includes('"id":"one"'));
});

test('an app name cannot break out of the page data', () => {
  const r = run([{ ...good, name: '</script><script>alert(1)</script>' }]);
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(r.out, 'index.html'), 'utf8');
  assert.equal(html.split('</script>').length, 5, 'only the four real script tags close'); // splash + data + wallpapers + launcher
});

test('a mistake stops the build with a clear message and writes no site', () => {
  const cases = [
    [[{ ...good, id: 'Bad Id' }], /"id" must be/],
    [[good, good], /duplicate id/],
    [[{ ...good, source: { type: 'static', dir: 'nowhere' } }], /folder not found/],
    [[{ ...good, source: { type: 'static', dir: 'app', entry: 'missing.html' } }], /entry file not found/],
    [[{ ...good, icon: 'nope.svg' }], /icon not found/],
    [[{ ...good, source: { type: 'vite', dir: 'app' } }], /npm install/],
  ];
  for (const [apps, message] of cases) {
    const r = run(apps);
    assert.equal(r.status, 1, JSON.stringify(apps));
    assert.match(r.stderr, message);
  }
});

test('an unfinished build never leaves a deployable index.html behind', () => {
  const r = run([good, { ...good, id: 'two', source: { type: 'static', dir: 'nowhere' } }]);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(join(r.out, 'index.html')), 'the launcher is only written after every app built');
});

test("a static app's sw.js gets its file list and a version that changes with the files", () => {
  const sw = "const FILES = [/*HUB_FILES*/];\nconst VERSION = '/*HUB_VERSION*/';\n";
  const built = (text) => {
    const r = run([good], { files: { 'index.html': text, 'my pic.png': 'x', 'sw.js': sw } });
    assert.equal(r.status, 0, r.stderr);
    const code = readFileSync(join(r.out, 'one', 'sw.js'), 'utf8');
    return { files: JSON.parse(code.match(/const FILES = (\[.*\]);/)[1]), version: code.match(/const VERSION = '(\w+)'/)[1] };
  };
  const a = built('<h1>hi</h1>');
  assert.deepEqual(a.files, ['./', 'index.html', 'my%20pic.png'], 'every file but sw.js, URL-encoded');
  assert.equal(built('<h1>hi</h1>').version, a.version, 'same files, same version');
  assert.notEqual(built('<h1>changed</h1>').version, a.version, 'a changed file is a new version');

  const r = run([good], { files: { 'index.html': 'hi', 'sw.js': 'const FILES = [];' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sw\.js needs/);
});

test("a static app's /*HUB_BUILD*/ becomes the commit and date it was built from", () => {
  const r = run([good], { files: { 'index.html': "<script>const BUILD = '/*HUB_BUILD*/';</script>" } });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(r.out, 'one', 'index.html'), 'utf8');
  assert.match(html, /const BUILD = '(\w{7}|local) · \d{4}-\d{2}-\d{2}';/);
});
