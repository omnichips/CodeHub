// Assembles the whole site into dist/: the launcher at the root and every app in apps.json under /<id>/.
// HUB_REGISTRY and HUB_OUT override the registry file and output folder (the tests use this).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, '_icons'), { recursive: true });

const published = [];
for (const app of registry.apps) {
  const src = resolve(dirname(registryFile), app.source.dir);
  const dest = join(out, app.id);
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
  } else {
    const entry = app.source.entry ?? 'index.html';
    if (!existsSync(join(src, entry))) fail(`${app.id}: entry file not found: ${join(src, entry)}`);
    if (sizeOf(src) > MAX_APP_MB * 1024 * 1024) fail(`${app.id}: ${src} is over ${MAX_APP_MB} MB. Point "source.dir" at a smaller folder.`);
    cpSync(src, dest, { recursive: true, filter: (p) => !['node_modules', '.git', 'dist', '__pycache__'].includes(basename(p)) });
    if (entry !== 'index.html') cpSync(join(src, entry), join(dest, 'index.html'));
    const page = readFileSync(join(dest, 'index.html'), 'utf8');
    if (page.includes('/*HUB_BUILD*/')) writeFileSync(join(dest, 'index.html'), page.replaceAll('/*HUB_BUILD*/', buildLabel));
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
  published.push({ id: app.id, name: app.name.trim(), color: app.color ?? '#4b5563', icon, dock: !!app.dock, folder: app.folder?.trim() });
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const data = JSON.stringify({ apps: published }).replaceAll('<', '\\u003c'); // cannot close the script tag
const html = readFileSync(join(hub, 'src', 'index.html'), 'utf8').replaceAll('{{TITLE}}', escape(registry.title.trim())).replace('{{APPS}}', () => data);
writeFileSync(join(out, 'index.html'), html);
for (const f of ['style.css', 'launcher.js', 'wallpapers.js', 'icon.svg', 'fonts']) cpSync(join(hub, 'src', f), join(out, f), { recursive: true });
cpSync(join(hub, 'vercel.json'), join(out, 'vercel.json')); // so deploying the dist folder carries its own settings

console.log(`\n✓ ${published.length} app${published.length === 1 ? '' : 's'} built into ${out}`);
