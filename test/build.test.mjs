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
  assert.equal(html.split('</script>').length, 3, 'only the two real script tags close'); // data script + launcher script
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
