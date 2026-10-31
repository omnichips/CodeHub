// Assembles the whole site into dist/: the launcher at the root and every app in apps.json under /<id>/.
// HUB_REGISTRY and HUB_OUT override the registry file and output folder (the tests use this).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { validateRegistry } from './registry.mjs';

const hub = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryFile = resolve(hub, process.env.HUB_REGISTRY ?? 'apps.json');
const out = resolve(hub, process.env.HUB_OUT ?? 'dist');
const MAX_APP_MB = 50; // Vercel's free plan has size limits; one big app should not sink the deploy

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
const problems = validateRegistry(registry);
if (problems.length) fail(`${basename(registryFile)} has problems:\n  - ${problems.join('\n  - ')}`);

// Which build this is, for a static app to show (/*HUB_BUILD*/ in its index.html): short commit · UTC date.
// Vercel gives the commit in VERCEL_GIT_COMMIT_SHA; a local build asks git.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: hub, encoding: 'utf8' }).stdout || '').trim().slice(0, 7) || 'local';
const buildLabel = `${commit} · ${new Date().toISOString().slice(0, 10)}`;

const sizeOf = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((sum, f) => sum + sizeOf(join(p, f)), 0) : statSync(p).size);
const SKIP = ['node_modules', '.git', 'dist', '__pycache__']; // never copied or zipped

// A folder as a .zip (deflated, entries under the folder's own name), so it unzips into that folder.
function zip(dir) {
  const files = readdirSync(dir, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => !f.split('/').some((p) => SKIP.includes(p)) && statSync(join(dir, f)).isFile()).sort();
  const u16 = (n) => Buffer.from([n & 255, n >> 8]);
  const u32 = (n) => Buffer.from(new Uint32Array([n]).buffer);
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const local = [], central = [];
  let offset = 0;
  for (const f of files) {
    const data = readFileSync(join(dir, f)), packed = deflateRawSync(data), name = Buffer.from(`${basename(dir)}/${f}`);
    // version 2.0, UTF-8 names, deflate, time, date, crc, sizes, name length, no extra field
    const head = Buffer.concat([u16(20), u16(0x800), u16(8), u16(time), u16(date), u32(crc32(data)), u32(packed.length), u32(data.length), u16(name.length), u16(0)]);
    local.push(u32(0x04034b50), head, name, packed);
    central.push(u32(0x02014b50), u16(20), head, Buffer.alloc(10), u32(offset), name); // no comment, disk 0, no attributes
    offset += 30 + name.length + packed.length;
  }
  const dirSize = central.reduce((sum, b) => sum + b.length, 0);
  return Buffer.concat([...local, ...central, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(dirSize), u32(offset), u16(0)]);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, '_icons'), { recursive: true });

// The loading screen (src/splash.html) goes at the top of the hub's page and of every app's.
const splash = readFileSync(join(hub, 'src', 'splash.html'), 'utf8');
const withSplash = (page) => page.replace(/<body[^>]*>/i, (tag) => tag + splash);

const published = [];
for (const app of registry.apps) {
  const src = resolve(dirname(registryFile), app.source.dir);
  const dest = join(out, app.id);
  let download;
  if (!existsSync(src)) fail(`${app.id}: folder not found: ${src}`);
  console.log(`\n→ ${app.name} (${app.source.type}) from ${src}`);

  if (app.source.type === 'vite') {
    if (!existsSync(join(src, 'node_modules'))) fail(`${app.id}: run "npm install" in ${src} first`);
    // The app is built for /<id>/ so its files, service worker and install scope all live under that address.
    // Run from Node (not Git Bash, which rewrites "/id/" into a Windows path).
    const command = (app.source.command ?? 'npm run build -- --base={base} --outDir "{out}" --emptyOutDir')
      .replaceAll('{base}', `/${app.id}/`)
      .replaceAll('{out}', dest);
    if (spawnSync(command, { cwd: src, shell: true, stdio: 'inherit' }).status !== 0) fail(`${app.id}: the build failed`);
    if (!existsSync(join(dest, 'index.html'))) fail(`${app.id}: the build produced no index.html in ${dest}`);
    // ponytail: added after the build, so a PWA's precache keeps the old revision until the app itself changes
    writeFileSync(join(dest, 'index.html'), withSplash(readFileSync(join(dest, 'index.html'), 'utf8')));
  } else if (app.source.type === 'download') {
    // No page: the card offers /<id>/<file> (a folder becomes <folder>.zip) after the "confirm" checklist.
    const from = join(src, app.source.file);
    if (!existsSync(from)) fail(`${app.id}: file to download not found: ${from}`);
    const isFolder = statSync(from).isDirectory();
    const name = basename(from) + (isFolder ? '.zip' : '');
    mkdirSync(dest, { recursive: true });
    if (isFolder) writeFileSync(join(dest, name), zip(from));
    else cpSync(from, join(dest, name));
    const bytes = statSync(join(dest, name)).size;
    if (bytes > MAX_APP_MB * 1024 * 1024) fail(`${app.id}: ${name} is over ${MAX_APP_MB} MB.`);
    download = { href: `/${app.id}/${encodeURIComponent(name)}`, name, bytes, confirm: app.confirm ?? [] };
  } else {
    const entry = app.source.entry ?? 'index.html';
    if (!existsSync(join(src, entry))) fail(`${app.id}: entry file not found: ${join(src, entry)}`);
    if (sizeOf(src) > MAX_APP_MB * 1024 * 1024) fail(`${app.id}: ${src} is over ${MAX_APP_MB} MB. Point "source.dir" at a smaller folder.`);
    cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.includes(basename(p)) });
    if (entry !== 'index.html') cpSync(join(src, entry), join(dest, 'index.html'));
    writeFileSync(join(dest, 'index.html'), withSplash(readFileSync(join(dest, 'index.html'), 'utf8')).replaceAll('/*HUB_BUILD*/', buildLabel));
    // An offline-capable static app ships a sw.js with [/*HUB_FILES*/] and /*HUB_VERSION*/ in it:
    // fill in every file it must cache and a hash of their contents, so each change is a new version.
    const sw = join(dest, 'sw.js');
    if (existsSync(sw)) {
      const files = readdirSync(dest, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => f !== 'sw.js' && statSync(join(dest, f)).isFile()).sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dest, f)));
      const code = readFileSync(sw, 'utf8');
      if (!code.includes('[/*HUB_FILES*/]') || !code.includes('/*HUB_VERSION*/')) fail(`${app.id}: sw.js needs [/*HUB_FILES*/] and /*HUB_VERSION*/ for the build to fill in`);
      writeFileSync(sw, code.replace('[/*HUB_FILES*/]', JSON.stringify(['./', ...files.map(encodeURI)])).replace('/*HUB_VERSION*/', hash.digest('hex').slice(0, 12)));
    }
  }

  let icon;
  if (app.icon) {
    const from = join(src, app.icon);
    if (!existsSync(from)) fail(`${app.id}: icon not found: ${from}`);
    icon = `_icons/${app.id}${extname(app.icon).toLowerCase()}`;
    cpSync(from, join(out, icon));
  }
  published.push({ id: app.id, name: app.name.trim(), color: app.color ?? '#4b5563', icon, dock: !!app.dock, folder: app.folder?.trim(), tag: app.tag, download });
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const data = JSON.stringify({ apps: published }).replaceAll('<', '\\u003c'); // cannot close the script tag
const html = readFileSync(join(hub, 'src', 'index.html'), 'utf8').replaceAll('{{TITLE}}', escape(registry.title.trim())).replace('{{APPS}}', () => data).replace('{{SPLASH}}', () => splash);
writeFileSync(join(out, 'index.html'), html);
for (const f of ['style.css', 'launcher.js', 'wallpapers.js', 'icon.svg', 'fonts']) cpSync(join(hub, 'src', f), join(out, f), { recursive: true });
cpSync(join(hub, 'vercel.json'), join(out, 'vercel.json')); // so deploying the dist folder carries its own settings

console.log(`\n✓ ${published.length} app${published.length === 1 ? '' : 's'} built into ${out}`);
