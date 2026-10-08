// Draws the home screen from the list of apps the build embedded in index.html.
const { apps } = JSON.parse(document.getElementById('apps').textContent);
const home = document.getElementById('home');
const dock = document.getElementById('dock');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  a.append(icon(app), el('span', 'label', app.name));
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return; // let "open in new tab" work
    e.preventDefault();
    document.body.classList.add('launching');
    setTimeout(() => (location.href = a.href), reduceMotion ? 0 : 200);
  });
  return a;
}

function folderButton(name, members) {
  const button = el('button', 'app');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', `${name} folder, ${members.length} ${members.length === 1 ? 'app' : 'apps'}`);
  const tile = el('span', 'icon folder');
  members.slice(0, 9).forEach((m) => tile.append(icon(m)));
  button.append(tile, el('span', 'label', name));
  button.addEventListener('click', () => openFolder(name, members, button));
  return button;
}

function openFolder(name, members, opener) {
  const overlay = el('div', 'overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', name);
  const sheet = el('div', 'sheet');
  const grid = el('div', 'grid');
  grid.append(...members.map(appLink));
  sheet.append(el('h2', '', name), grid);
  overlay.append(sheet);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    opener.focus();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  overlay.addEventListener('click', (e) => e.target === overlay && close()); // tap outside the folder
  document.addEventListener('keydown', onKey);
  document.querySelector('.phone').append(overlay);
  grid.querySelector('a')?.focus();
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

// Coming back with the Back button restores this page from memory, still zoomed away.
addEventListener('pageshow', () => document.body.classList.remove('launching'));

const clock = document.getElementById('clock');
const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
tick();
setInterval(tick, 10_000);
