const $ = (id) => document.getElementById(id);
const post = (action, body = {}) => fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const size = (n) => n < 1e6 ? Math.max(1, Math.ceil(n / 1e3)) + ' KB' : n < 1e9 ? (n / 1e6).toFixed(1) + ' MB' : (n / 1e9).toFixed(2) + ' GB';
const secs = (s) => s == null || !isFinite(s) ? '' : s < 60 ? Math.ceil(s) + ' s left' : Math.ceil(s / 60) + ' min left';
const rate = (done, total, speed) => [total ? Math.floor(100 * done / total) + '%' : size(done), speed > 0 ? size(speed) + '/s' : '', total && speed > 0 ? secs((total - done) / speed) : ''].filter(Boolean).join(' · ');
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function button(text, onclick, cls, label) {
  const b = el('button', text, cls); b.type = 'button'; b.onclick = onclick; if (label) b.setAttribute('aria-label', label); return b;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  // Plain http (the phone page) has no clipboard API; a selected hidden textarea still copies.
  const t = el('textarea'); t.value = text; t.readOnly = true; t.className = 'vh'; document.body.append(t);
  t.select(); t.setSelectionRange(0, text.length);
  const ok = document.execCommand('copy'); t.remove(); return ok;
}
function copyButton(text) {
  const b = button('Copy', async () => { b.textContent = (await copyText(text)) ? 'Copied' : 'Select and copy'; setTimeout(() => (b.textContent = 'Copy'), 1500); });
  return b;
}

// A glow follows the pointer around the page, and a click or tap leaves a ripple where it landed.
const still = matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('pointermove', (e) => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
}, { passive: true });
document.addEventListener('pointerdown', (e) => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
  const t = e.target.closest('button, .btn, .drop');
  if (!t || still.matches) return;
  // Drawn over the button, not inside it, so a button that changes its own text on click keeps its ripple.
  const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, rip = el('span', null, 'rip'), dot = el('i'), css = getComputedStyle(t);
  Object.assign(rip.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: css.borderRadius, color: css.color });
  Object.assign(dot.style, { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' });
  rip.append(dot); document.body.append(rip);
  setTimeout(() => rip.remove(), 700);
}, { passive: true });

// Every phone in a room gets its own shape and colour, picked from its id, so it looks the same everywhere.
const SHAPES = {
  circle: '<circle cx="20" cy="20" r="16"/>',
  square: '<rect x="5" y="5" width="30" height="30" rx="8"/>',
  triangle: '<path d="M20 4 36 34H4z"/>',
  diamond: '<path d="M20 3 37 20 20 37 3 20z"/>',
  hexagon: '<path d="M12 4h16l9 16-9 16H12L3 20z"/>',
  star: '<path d="m20 3 5 11 12 1.5-9 8.5 2.5 12L20 30l-10.5 6 2.5-12-9-8.5L15 14z"/>',
  pentagon: '<path d="m20 3 17 12.5-6.5 20.5h-21L3 15.5z"/>',
  drop: '<path d="M20 4c7 8 13 14 13 21a13 13 0 0 1-26 0c0-7 6-13 13-21z"/>',
};
const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#f72585', '#fb8500', '#80ed99', '#4895ef', '#ff9f1c'];
function look(id) {
  const n = Math.imul((id + 1) ^ 0x9e3779b9, 2654435761) >>> 0, kinds = Object.keys(SHAPES);
  return { shape: kinds[n % kinds.length], color: COLORS[(n >>> 7) % COLORS.length] };
}
function shapeEl(id, px = 28) {
  const s = el('span', null, 'shape');
  if (!id) { const img = el('img'); img.src = ICON; img.alt = ''; img.width = img.height = px; s.append(img); return s; } // the laptop
  const { shape, color } = look(id);
  s.innerHTML = `<svg viewBox="0 0 40 40" width="${px}" height="${px}" aria-hidden="true"><g fill="${color}" stroke="${color}" stroke-width="2.5" stroke-linejoin="round">${SHAPES[shape]}</g>` +
    `<ellipse cx="15" cy="13" rx="6" ry="3" fill="#fff" opacity=".35" transform="rotate(-25 15 13)"/></svg>`; // shapes and colours are this page's own
  return s;
}
function itemRow(it, actions) {
  const li = el('li', null, 'item'), name = el('div', null, 'name');
  if (it.preview) {
    const img = el('img', null, 'thumb'); img.src = 'p/' + it.id; img.alt = ''; img.loading = 'lazy';
    img.onerror = () => img.remove(); // e.g. an iPhone HEIC photo on Android
    li.append(img);
  }
  const who = el('span', null, 'who muted');
  who.append(shapeEl(it.from_id, 16), it.from === 'You' ? 'You' : it.from);
  if (it.kind === 'text') name.append(who, el('p', it.text, 'text'));
  else name.append(el('div', it.name), who, el('span', ' · ' + size(it.size), 'muted'));
  if (it.risky) name.append(el('div', "⚠ Program file. Only open it if you trust who sent it.", 'warn'));
  li.append(name, ...actions);
  return li;
}

// ---- Shared by the laptop page and the phone app: the main screen, the room and their panels. ----
// Before calling startApp(device), the page defines: act(action, body), refresh(), shareFile(file), roomAddFiles(files)
// and itemActions(item). Everything below draws from one state object `s`, whoever made it (the laptop's server or this phone).
const STATUS = { waiting: 'Open · waiting for phones', connected: 'Open', sending: 'Open · moving files', off: 'Closed' };
let shown = {};
const changed = (k, v) => { const s = JSON.stringify(v); if (shown[k] === s) return false; shown[k] = s; return true; };
const ext = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4) : 'file').toUpperCase();

const svgIcon = (size, w, d) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  room: (n = 24) => svgIcon(n, 2, '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  gear: () => svgIcon(24, 2, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  upload: () => svgIcon(56, 1.6, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  back: () => svgIcon(22, 2.2, '<path d="M15 18l-6-6 6-6"/>'),
};

// The page's fixed parts. `device` is "laptop" or "phone": whatever is hosting.
function shellHTML(device) {
  return `
<header>
  <span><button id="roombtn" class="iconbtn" type="button" aria-label="Room" aria-haspopup="dialog" aria-controls="room">${ICONS.room()}<span id="roomdot" class="dot" hidden></span></button></span>
  <h1><img src="${ICON}" alt="">Q<span>Sendr</span></h1>
  <span class="end"><span id="badge" class="badge" hidden></span>
    <button id="gear" class="iconbtn" type="button" aria-label="Settings" aria-haspopup="dialog" aria-controls="settings">${ICONS.gear()}</button></span>
</header>

<main id="home" class="home">
  <p id="notice" class="warn" role="status" hidden></p>
  <button id="drop" class="drop glass" type="button" aria-describedby="droplimit">
    ${ICONS.upload()}
    <span class="big">Click to choose a file</span>
    <span id="droplimit">or drop it here · up to 100 MB</span>
  </button>
  <input id="file" type="file" hidden>
  <div id="copying" class="drop busy glass" hidden>
    <p id="ctext" class="status" role="status"></p>
    <div id="cbarwrap" class="bar"><i id="cbar"></i></div>
  </div>
  <section id="sharing" class="sharecard" aria-labelledby="sname" hidden>
    <div id="sqr" class="qr"></div>
    <p id="sname" class="fname"></p>
    <p class="muted"><span id="smeta"></span> · <span id="sleft" class="countdown"></span></p>
    <p id="sdl" class="muted" role="status"></p>
    <div id="sbar" class="bar" style="width: min(320px, 100%); margin-top: 8px" hidden><i></i></div>
    <div class="row" style="justify-content: center; margin-top: 16px"><button id="unshare" class="primary" type="button">Close now</button>
      <button id="another" class="quiet" type="button">Share another file</button></div>
  </section>
</main>

<div id="room" class="panel" role="dialog" aria-modal="true" aria-labelledby="room-title" hidden>
  <div class="panelbar">
    <button class="iconbtn" type="button" data-close aria-label="Back to the main screen">${ICONS.back()}</button>
    <h2 id="room-title">Room</h2><span id="rstatus" class="pill"></span>
    <span class="end"><button id="rclose" type="button" hidden>Close room</button></span>
  </div>
  <div class="wrap">
    <section id="rclosed" class="closed">
      <span style="color: var(--accent)">${ICONS.room(64)}</span>
      <h3>Phones send too</h3>
      <p class="muted">Open the room when phones need to send files to this ${device} or to each other. They scan a QR code, pick a seat, and
        everyone shares across the tables. Nothing a phone sends is saved on this ${device} unless you download it.</p>
      <div class="row" style="justify-content: center"><label for="minutes">Open for</label>
        <select id="minutes"><option value="10">10 minutes</option><option value="30" selected>30 minutes</option>
          <option value="60">1 hour</option><option value="120">2 hours</option></select></div>
      <p id="rerror" class="warn" role="alert" hidden></p>
      <div class="row" style="justify-content: center"><button id="ropen" class="primary cta" type="button">Open room</button></div>
      <details style="text-align: left; margin-top: 20px"><summary>Room settings</summary><div class="rset"></div></details>
    </section>
    <div id="ropenview" class="roomgrid" hidden>
      <div>
        <div id="lunch" class="lunch" role="img" aria-label="The room from above">
          <div class="plant" style="left: 2%; top: 3%"></div><div class="plant" style="right: 2%; top: 3%"></div>
          <div class="counter"><img src="${ICON}" alt="">This ${device}</div>
          <div class="bench" style="left: 10%; top: 41%"></div><div class="bench" style="left: 10%; top: 62%"></div>
          <div class="bench" style="left: 60%; top: 41%"></div><div class="bench" style="left: 60%; top: 62%"></div>
          <div class="table" style="left: 8%"></div><div class="table" style="left: 58%"></div>
          <div class="door">door</div>
        </div>
        <section style="margin-top: 16px" aria-labelledby="items-h">
          <h2 id="items-h">On the tables</h2>
          <div class="composer">
            <button class="primary" type="button" id="addfiles">Add files</button>
            <div class="textsend"><label for="text" class="vh">Text or a link to send</label>
              <input id="text" type="text" placeholder="Text or a link to send"><button id="sendtext" type="button">Send</button></div>
          </div>
          <ul id="moving" class="moving"></ul>
          <ul id="items"></ul>
        </section>
      </div>
      <div>
        <section id="asks" class="pulse" aria-labelledby="asks-h" hidden><h3 id="asks-h">At the door</h3><ul id="asklist" class="asks"></ul></section>
        <section aria-labelledby="scan-h">
          <h3 id="scan-h">Scan to join</h3>
          <div id="rqr" class="qr"></div>
          <p id="rpin" class="pin" hidden></p>
          <p id="rleft" class="muted" style="text-align: center; margin: 10px 0 0"></p>
          <div class="row" style="justify-content: center"><button id="rfull" class="quiet" type="button">Full screen QR</button></div>
        </section>
        <section><details><summary>Room settings</summary><div class="rset"></div></details></section>
      </div>
    </div>
  </div>
</div>

<template id="rsettings">
  <label class="check"><input type="checkbox" data-setting="approve"><span>Ask me before a phone joins</span></label>
  <label class="check"><input type="checkbox" data-setting="use_pin"><span>Phones must type a 4-digit PIN</span></label>
  <label class="check"><input type="checkbox" data-setting="autodelete"><span>Take each file off the table once someone downloads it</span></label>
</template>`;
}

// ---- Header ----
function header(s) {
  const asks = s.devices.filter((d) => !d.in).length, open = s.status !== 'off';
  $('roomdot').hidden = !open && !asks;
  $('roomdot').className = 'dot' + (asks ? ' ask pulse' : '');
  $('roomdot').textContent = asks || '';
  $('roombtn').setAttribute('aria-label', asks ? `Room: ${asks} at the door` : open ? 'Room (open)' : 'Room');
  document.title = asks ? `(${asks}) QSendr` : 'QSendr';
  $('badge').hidden = !s.network;
  $('badge').textContent = s.network ? `${s.network}${s.category === 'Public' ? ' · public' : ''}` : '';
}

// ---- Main screen: one file, one QR ----
let shareEnd = 0, hadShare = null, copying = false;
function home(s) {
  const sh = s.share;
  if (hadShare && !sh) showNotice(`Stopped sharing ${hadShare}.`);
  hadShare = sh && sh.name;
  if (s.notice) showNotice(s.notice);
  $('drop').hidden = !!sh || copying;
  $('copying').hidden = !copying;
  $('sharing').hidden = !sh;
  if (!sh) return;
  if (changed('share', sh.url)) { $('sqr').innerHTML = sh.qr; $('sqr').title = sh.url; $('sharing').classList.remove('pop'); void $('sharing').offsetWidth; $('sharing').classList.add('pop'); } // SVG made by the app itself
  $('sname').textContent = sh.name;
  $('smeta').textContent = size(sh.size);
  shareEnd = Date.now() + sh.seconds_left * 1000;
  tick();
  const moving = s.transfers.filter((t) => t.who.startsWith('to a phone'));
  $('sbar').hidden = !moving.length;
  if (moving.length) $('sbar').firstChild.style.width = (100 * moving[0].done / (moving[0].total || 1)) + '%';
  $('sdl').textContent = moving.length ? `↓ Sending to ${moving.length === 1 ? 'a phone' : moving.length + ' phones'} · ${rate(moving[0].done, moving[0].total, moving[0].speed)}`
    : sh.downloads ? `✓ Downloaded ${sh.downloads === 1 ? 'once' : sh.downloads + ' times'}` : 'Scan with a phone camera to download';
}
function tick() {
  const left = Math.max(0, Math.round((shareEnd - Date.now()) / 1000));
  $('sleft').textContent = `closes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}
function showNotice(text) { $('notice').textContent = text; $('notice').hidden = !text; }

// ---- Panels ----
let opener = null;
function openPanel(id) {
  closePanels(false);
  opener = document.activeElement;
  $(id).hidden = false; document.body.style.overflow = 'hidden'; document.body.classList.add('paneled');
  $(id).querySelector('[data-close]').focus();
}
function closePanels(refocus = true) {
  const was = ['room', 'settings'].some((id) => !$(id).hidden);
  for (const id of ['room', 'settings']) $(id).hidden = true;
  document.body.style.overflow = ''; document.body.classList.remove('paneled');
  if (was && refocus) opener?.focus?.();
}

// ---- The room: a lunch room seen from above ----
const COUNTER = ['50%', '20%']; // the counter's front edge, where files are handed over
const SEATS = [];  // three seats on each side of two long tables
for (const left of [8, 58]) for (const top of [37, 70]) for (const k of [1, 3, 5]) SEATS.push([left + 34 * k / 6, top]);
const DOOR = (i) => [`${86 - i * 11}%`, '88%'];
const seatEls = new Map(), travelEls = new Map();
let seatOf = new Map();

function room(s) {
  const open = s.status !== 'off';
  $('rclosed').hidden = open; $('ropenview').hidden = !open;
  $('rstatus').textContent = STATUS[s.status]; $('rstatus').className = 'pill' + (open ? ' on' : '');
  $('rclose').hidden = !open;
  $('rerror').hidden = !s.room_error; $('rerror').textContent = s.room_error || '';
  for (const c of document.querySelectorAll('[data-setting]')) c.checked = s.settings[c.dataset.setting];
  if (!open) { for (const e of seatEls.values()) e.remove(); seatEls.clear(); seatOf.clear(); return; }
  if (changed('rqr', s.url)) { $('rqr').innerHTML = s.qr; $('rqr').title = s.url; $('rqr').classList.remove('pop'); void $('rqr').offsetWidth; $('rqr').classList.add('pop'); }
  $('rpin').hidden = !s.pin; $('rpin').replaceChildren('PIN', el('b', s.pin));
  const m = Math.ceil(s.seconds_left / 60);
  $('rleft').textContent = `Closes in ${m} min, or after ${s.idle_minutes} quiet minutes`;
  scene(s);
  asks(s);
  moving(s);
  items(s);
}

function scene(s) {
  // Phones keep their seat while they stay; new ones take the first free seat, and those asking wait at the door.
  const inside = s.devices.filter((d) => d.in), waiting = s.devices.filter((d) => !d.in);
  const taken = new Set([...seatOf.entries()].filter(([id]) => inside.some((d) => d.id === id)).map(([, i]) => i));
  seatOf = new Map([...seatOf].filter(([id]) => inside.some((d) => d.id === id)));
  for (const d of inside) if (!seatOf.has(d.id)) { let i = 0; while (taken.has(i)) i++; seatOf.set(d.id, i); taken.add(i); }
  const live = new Set();
  waiting.forEach((d, i) => { live.add(d.id); put(d, DOOR(i), true); });
  for (const d of inside) { live.add(d.id); put(d, SEATS[seatOf.get(d.id) % SEATS.length].map((v) => v + '%'), false); }
  for (const [id, e] of seatEls) if (!live.has(id)) { e.style.opacity = '0'; setTimeout(() => e.remove(), 300); seatEls.delete(id); }
  // A file on the move: a dot of the phone's colour between its seat and the counter.
  const now = new Set();
  for (const t of s.transfers) {
    if (!t.dev || !seatOf.has(t.dev)) continue;
    now.add(t.id);
    if (travelEls.has(t.id)) continue;
    const seat = SEATS[seatOf.get(t.dev) % SEATS.length].map((v) => v + '%');
    const [x1, y1, x2, y2] = t.dir === 'up' ? [...seat, ...COUNTER] : [...COUNTER, ...seat];
    const dot = el('div', null, 'travel');
    dot.style.color = look(t.dev).color;
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) dot.style.setProperty('--' + k, v);
    $('lunch').append(dot); travelEls.set(t.id, dot);
  }
  for (const [id, e] of travelEls) if (!now.has(id)) { e.remove(); travelEls.delete(id); }
  $('lunch').setAttribute('aria-label', `The room from above: ${inside.length} phone${inside.length === 1 ? '' : 's'} at the tables` +
    (waiting.length ? `, ${waiting.length} at the door` : ''));
}
function put(d, [x, y], waiting) {
  let e = seatEls.get(d.id);
  if (!e) {
    e = el('div', null, 'seat pop');
    e.append(shapeEl(d.id, 40), el('span', d.name, 'label'),
      button('×', () => act('kick', { id: d.id }), 'kick', (waiting ? 'Deny ' : 'Remove ') + d.name));
    e.title = d.ip ? `${d.name} (${d.ip})` : d.name;
    e.style.left = x; e.style.top = y;
    $('lunch').append(e); seatEls.set(d.id, e);
  }
  e.classList.toggle('waiting', waiting);
  e.lastChild.setAttribute('aria-label', (waiting ? 'Deny ' : 'Remove ') + d.name);
  e.style.left = x; e.style.top = y; // walks from the door to a seat when let in
}

function asks(s) {
  const waiting = s.devices.filter((d) => !d.in);
  $('asks').hidden = !waiting.length;
  if (!changed('asks', waiting)) return;
  $('asklist').replaceChildren(...waiting.map((d) => {
    const li = el('li', null, 'enter'), name = el('span', null, 'name who');
    name.append(shapeEl(d.id, 24), `${d.name}`, ...(d.ip ? [el('span', d.ip, 'muted')] : []));
    li.append(name, button('Let in', () => act('let_in', { id: d.id }), 'primary', 'Let ' + d.name + ' in'),
      button('Deny', () => act('kick', { id: d.id }), 'quiet', 'Deny ' + d.name));
    return li;
  }));
}

const moveEls = new Map();
function moving(s) {
  const list = s.transfers.filter((t) => t.dev);
  const ids = new Set(list.map((t) => t.id));
  for (const [id, e] of moveEls) if (!ids.has(id)) { e.remove(); moveEls.delete(id); }
  for (const t of list) {
    let e = moveEls.get(t.id);
    if (!e) {
      e = el('li', null, 'enter');
      const top = el('div', null, 'who');
      top.append(shapeEl(t.dev, 18), `${t.dir === 'up' ? 'Arriving' : 'Leaving'}: ${t.name}`);
      e.append(top, el('div', '', 'muted'), Object.assign(el('div', null, 'bar' + (t.total ? '' : ' unknown')), { innerHTML: '<i></i>' }));
      $('moving').append(e); moveEls.set(t.id, e);
    }
    e.children[1].textContent = `${t.who} · ${rate(t.done, t.total, t.speed)}`;
    if (t.total) e.lastChild.firstChild.style.width = (100 * t.done / t.total) + '%';
  }
}

const seenItems = new Set();
function items(s) {
  if (!changed('items', s.items)) return;
  $('items').replaceChildren(...(s.items.length ? s.items.map((it) => {
    const li = el('li', null, 'item' + (seenItems.has(it.id) ? '' : ' enter')); seenItems.add(it.id);
    if (it.preview) { const img = el('img', null, 'thumb'); img.src = it.thumb || 'p/' + it.id; img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.replaceWith(el('span', ext(it.name), 'ftype')); li.append(img); }
    else li.append(el('span', it.kind === 'text' ? 'Aa' : ext(it.name), 'ftype' + (it.kind === 'text' ? ' text' : '')));
    const name = el('div', null, 'name'), who = el('span', null, 'who muted');
    who.append(shapeEl(it.from_id, 16), it.from);
    if (it.kind === 'text') name.append(who, el('p', it.text, 'text'));
    else name.append(el('div', it.name), who, el('span', ' · ' + size(it.size), 'muted'));
    if (it.risky) name.append(el('div', '⚠ Program file. Only open it if you trust who sent it.', 'warn'));
    li.append(name, ...itemActions(it), button('×', () => act('remove', { id: it.id }), 'icon quiet', 'Take ' + it.name + ' off the table'));
    return li;
  }) : [el('li', 'The tables are empty. Add a file, or wait for the phones.', 'muted')]));
}

// Puts the fixed parts on the page and wires the buttons they hold.
function startApp(device) {
  $('shell').outerHTML = shellHTML(device);
  for (const box of document.querySelectorAll('.rset')) box.append($('rsettings').content.cloneNode(true));
  $('roombtn').onclick = () => openPanel('room');
  $('gear').onclick = () => openPanel('settings');
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => closePanels();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });

  $('drop').onclick = () => $('file').click();
  $('file').onchange = () => { shareFile($('file').files[0]); $('file').value = ''; };
  $('unshare').onclick = async () => { hadShare = null; await act('unshare'); $('drop').focus(); };
  $('another').onclick = async () => { hadShare = null; await act('unshare'); $('file').click(); };
  $('sqr').ondblclick = () => $('sqr').requestFullscreen?.(); // double-click: full screen, to scan from across a table

  document.addEventListener('change', (e) => { if (e.target.dataset.setting) act('settings', { [e.target.dataset.setting]: e.target.checked }); });
  $('ropen').onclick = async () => {
    $('ropen').disabled = true; $('ropen').replaceChildren(el('span', null, 'spin'), ' Opening…');
    try { await act('open', { minutes: +$('minutes').value }); } finally { $('ropen').disabled = false; $('ropen').textContent = 'Open room'; }
  };
  $('rclose').onclick = () => act('close');
  $('rfull').onclick = () => $('rqr').requestFullscreen?.();
  const sendText = async () => { if ($('text').value.trim()) { const text = $('text').value; $('text').value = ''; await act('text', { text }); } };
  $('sendtext').onclick = sendText;
  $('text').onkeydown = (e) => { if (e.key === 'Enter') sendText(); };

  // Appearance (the radios live in each page's Settings).
  let theme = 'system'; try { theme = localStorage.getItem('qsendr-theme') || 'system'; } catch {}
  for (const r of document.querySelectorAll('input[name=theme]')) {
    r.checked = r.value === theme;
    r.onchange = () => {
      if (r.value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = r.value;
      try { localStorage.setItem('qsendr-theme', r.value); } catch {}
    };
  }

  // Drag and drop: on the main screen a file is shared by QR; with the room open it goes on the tables.
  document.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); $('drop').classList.remove('over');
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.());
    const files = [...e.dataTransfer.files].filter((f, i) => !entries[i]?.isDirectory);
    if (files.length < e.dataTransfer.files.length) showNotice('Folders can’t be shared. Choose files instead.');
    if (!$('room').hidden) return roomAddFiles(files);
    if (!$('settings').hidden || !files.length) return;
    await shareFile(files[0]);
    if (files.length > 1) showNotice(`One file at a time: shared ${files[0].name}.`);
  });
  setInterval(tick, 1000);
}
