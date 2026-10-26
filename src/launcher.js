// Draws the home screen from the list of apps the build embedded in index.html.
const { apps } = JSON.parse(document.getElementById('apps').textContent);
const home = document.getElementById('home');
const dock = document.getElementById('dock');

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, ...(text !== undefined && { textContent: text }) });

function icon(app) {
  const tile = el('span', 'icon');
  tile.style.setProperty('--c', app.color);
  if (app.icon) {
    const img = el('img');
    Object.assign(img, { src: `/${app.icon}`, alt: '', draggable: false });
    tile.append(img);
  } else {
    tile.textContent = [...app.name][0].toUpperCase(); // no icon file: a coloured tile with the first letter
  }
  return tile;
}

function appLink(app) {
  const a = el('a', 'app');
  a.href = `/${app.id}/`;
  a.setAttribute('aria-label', app.name);
  a.title = app.name;
  a.style.setProperty('--c', app.color);
  a.append(icon(app), el('span', 'label', app.name));
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // let "open in new tab" work
    e.preventDefault();
    launch(a);
  });
  return a;
}

// The loading screen (splash.html) comes up over the hub and starts drawing the logo while the app loads; the app's page
// has the same screen and carries on the drawing from where it got to.
function launch(a) {
  const splash = hubSplash.cloneNode(true);
  splash.classList.add('launch');
  document.body.append(splash);
  try {
    sessionStorage.setItem('hub.launch', Date.now());
  } catch {}
  requestAnimationFrame(() => requestAnimationFrame(() => (location.href = a.href))); // once it is on screen
}

function folderButton(name, members) {
  const button = el('button', 'app');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', `${name} folder, ${members.length} ${members.length === 1 ? 'app' : 'apps'}`);
  button.title = name;
  const tile = el('span', 'icon folder');
  members.slice(0, 9).forEach((m) => tile.append(icon(m)));
  button.append(tile, el('span', 'label', name));
  button.addEventListener('click', () => {
    const grid = el('div', 'grid');
    grid.append(...members.map(appLink));
    openSheet(name, grid, button);
  });
  return button;
}

// A dialog over the home screen (a folder's apps, settings); closes with Escape or a tap outside.
function openSheet(title, content, opener) {
  const overlay = el('div', 'overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  const sheet = el('div', 'sheet');
  sheet.append(el('h2', '', title), content);
  overlay.append(sheet);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    opener.focus();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  overlay.addEventListener('click', (e) => e.target === overlay && close()); // tap outside the sheet
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  content.querySelector('a, button')?.focus();
}

// Docked apps sit at the bottom; the rest fill the grid, with each folder placed where its first app appears.
dock.append(...apps.filter((a) => a.dock).map(appLink));
const folders = new Map();
const items = [];
for (const app of apps.filter((a) => !a.dock)) {
  if (!app.folder) items.push(appLink(app));
  else if (folders.has(app.folder)) folders.get(app.folder).push(app);
  else {
    folders.set(app.folder, [app]);
    items.push(app.folder);
  }
}
home.append(...items.map((item) => (typeof item === 'string' ? folderButton(item, folders.get(item)) : item)));
if (apps.length === 0) home.append(el('p', 'empty', 'No apps yet'));
[...home.children, ...dock.children].forEach((n, i) => n.style.setProperty('--i', i)); // the order cards pop in

// Coming back with the Back button restores this page from memory, loading screen and all.
addEventListener('pageshow', () => document.querySelectorAll('.hub-splash.launch').forEach((s) => s.remove()));

// The clock shows Philippine time, the same clock the Meadow wallpaper's daylight follows (see manilaClock).
const clock = document.getElementById('clock');
const tick = () => {
  const m = Math.floor(manilaClock().minutes), hour = Math.floor(m / 60) % 24;
  clock.textContent = `${((hour + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
tick();
setInterval(tick, 1000);

// The wallpaper, remembered on this device. Storage can be blocked (private browsing), so every use is guarded.
const WALLPAPER_KEY = 'hub.wallpaper';
const setWallpaper = startWallpaper(document.getElementById('bg'));
let wallpaper;
try {
  wallpaper = setWallpaper(localStorage.getItem(WALLPAPER_KEY));
} catch {
  wallpaper = setWallpaper();
}

const settings = document.getElementById('settings');
settings.addEventListener('click', () => {
  const list = el('div', 'wallpapers');
  for (const wp of WALLPAPERS) {
    const button = el('button', 'wallpaper');
    button.type = 'button';
    button.setAttribute('aria-pressed', wp.id === wallpaper);
    const thumb = Object.assign(el('canvas'), { width: 40, height: 26 });
    drawThumb(thumb, wp);
    button.append(thumb, el('span', '', wp.name));
    button.addEventListener('click', () => {
      wallpaper = setWallpaper(wp.id);
      try {
        localStorage.setItem(WALLPAPER_KEY, wallpaper);
      } catch {}
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === button));
    });
    list.append(button);
  }
  openSheet('Wallpaper', list, settings);
});
