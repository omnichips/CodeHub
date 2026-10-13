'use strict';
// QSendr on a phone: share a file, or open a room, straight from this page. No laptop and no server of ours.
//
// Devices connect to each other directly (WebRTC), and files go straight between them. PeerJS's free public service only
// introduces the two devices (it sees who is connecting, never the files). The sender or host keeps this page open.
//   #s=<id>  someone scanned a shared file's QR: receive it.
//   #r=<id>  someone scanned a room's QR: join it.
//   (none)   the app itself: the same screens as the laptop's page, run from this phone (ui.js).

const MAX_FILE = 100 * 1024 * 1024;       // per file
const ROOM_MEMORY = 400 * 1024 * 1024;    // what phones send into a room is held in this device's memory, up to this much
const SHARE_SECONDS = 600;                // a shared file's QR closes after ten minutes
const IDLE_SECONDS = 600;                 // a room closes after ten quiet minutes
const MAX_TEXT = 100000, MAX_MEMBERS = 12, MAX_PIN_TRIES = 5, CH = 16 * 1024;
const RISKY = new Set(['.exe', '.bat', '.cmd', '.com', '.msi', '.msix', '.appx', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr',
  '.pif', '.lnk', '.reg', '.hta', '.cpl', '.msc', '.jar', '.dll', '.iso', '.img', '.vhd', '.apk']);
const IMAGES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const NO_SERVICE = "Couldn't reach the connection service. Check that this device is online, then try again.";
const extOf = (name) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i).toLowerCase(); };
const safeName = (n) => String(n).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 150) || 'file';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomId = () => 'qs' + [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(36).padStart(2, '0')).join('');
const pageUrl = (kind, id) => `${location.origin}${location.pathname}#${kind}=${id}`;

// ---- Connections ----
// Tests point this at a local signaling server (?signal=localhost:9000), and only on localhost.
function peerOptions() {
  const o = { debug: 0 };
  const sig = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('signal');
  if (sig) { const [host, port] = sig.split(':'); Object.assign(o, { host, port: +port, secure: false, path: '/' }); }
  return o;
}
function makePeer(id) {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => { p.destroy(); reject(new Error('timeout')); }, 15000);
    p.on('open', () => { clearTimeout(timer); resolve(p); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); }); // after it opens, callers watch for their own errors
  });
}

// Sends a file in small pieces, keeping the data channel's queue short so the phone's memory stays flat.
async function streamBlob(conn, blob, onProgress) {
  const dc = conn.dataChannel;
  dc.bufferedAmountLowThreshold = 1 << 20;
  for (let off = 0; off < blob.size;) {
    const buf = await blob.slice(off, off + 256 * 1024).arrayBuffer();
    for (let o = 0; o < buf.byteLength; o += CH) {
      if (!conn.open) return false;
      if (dc.bufferedAmount > 2 << 20) {
        await new Promise((res) => {
          const done = () => { dc.removeEventListener('bufferedamountlow', done); clearTimeout(t); res(); };
          const t = setTimeout(done, 1000);
          dc.addEventListener('bufferedamountlow', done);
        });
        if (!conn.open) return false;
      }
      conn.send(new Uint8Array(buf, o, Math.min(CH, buf.byteLength - o)));
    }
    off += buf.byteLength;
    onProgress(off);
  }
  return true;
}

// Asks another device for a file and collects it. Resolves { blob, name }; the other side counts the file as delivered
// when it gets our "done". Rejects with a sentence that can be shown as is.
function receiveFrom(peer, targetId, metadata, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const c = peer.connect(targetId, { serialization: 'raw', reliable: true, metadata });
    const chunks = [];
    let size = -1, got = 0, name = 'file', type = '', finished = false;
    const fail = (message) => { if (finished) return; finished = true; try { c.close(); } catch {} peer.off('error', onPeerError); reject(new Error(message)); };
    const onPeerError = (e) => { if (e.type === 'peer-unavailable') fail('GONE'); };
    peer.on('error', onPeerError);
    const finish = () => {
      finished = true; peer.off('error', onPeerError);
      try { c.send('done'); } catch {}
      setTimeout(() => { try { c.close(); } catch {} }, 500);
      resolve({ blob: new Blob(chunks, { type }), name });
    };
    c.on('data', (d) => {
      if (finished) return;
      if (typeof d === 'string') {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.err) return fail(String(m.err));
        if (size >= 0 || !Number.isFinite(m.size) || m.size < 0) return;
        size = m.size; name = String(m.name || 'file'); type = String(m.type || '');
        if (size > MAX_FILE) return fail('That file is over the 100 MB limit.');
        onProgress(0, size, name);
        if (size === 0) finish();
        return;
      }
      if (size < 0 || !d.byteLength) return;
      chunks.push(d); got += d.byteLength;
      if (got > size + CH) return fail('The other device sent more than it said.');
      onProgress(Math.min(got, size), size, name);
      if (got >= size) finish();
    });
    c.on('close', () => fail('The connection closed before the file finished.'));
    c.on('error', () => fail('The connection failed.'));
    setTimeout(() => { if (size < 0) fail('No answer. It may have closed, or this network blocks direct connections.'); }, 20000);
  });
}

function saveBlob(blob, name) {
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = safeName(name);
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); // iOS keeps the link while its save sheet is open
}

function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// When the signaling link drops (a sleeping phone), rejoin under the same id so new scans still work. A peer that is being closed
// on purpose must not do this: PeerJS announces "disconnected" while destroying it, and rejoining would leave a ghost that answers nobody.
function keepJoined(peer) { peer.on('disconnected', () => { if (!peer.closing && !peer.destroyed) peer.reconnect(); }); }
function closePeer(peer) { peer.closing = true; peer.destroy(); }

// A phone that is sharing or hosting keeps its screen on, or the connections would stall.
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); }
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}
let awakeWanted = () => false;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && awakeWanted()) keepAwake(true); });

// =====================================================================================================================
// This phone is the host
// =====================================================================================================================
const log = [], T = new Map();          // activity, and the transfers the screens draw
let nextT = 1, notice = '';
const note = (text) => { log.unshift([new Date().toTimeString().slice(0, 5), text]); log.length = Math.min(log.length, 50); };
function track(name, who, dir, total, dev = 0) {
  const t = { id: nextT++, name, who, dir, done: 0, total, start: Date.now(), dev };
  T.set(t.id, t);
  return t;
}
const untrack = (t) => { if (t) T.delete(t.id); };

// ---- One file, one QR ----
let share = null; // { peer, file, url, qr, deadline, downloads }

async function shareFile(file) {
  if (!file) return;
  notice = ''; showNotice('');
  if (file.size > MAX_FILE) return showNotice(`${file.name} is ${size(file.size)}. Files up to 100 MB can be shared.`);
  stopShare(null);
  copying = true; $('drop').hidden = true; $('copying').hidden = false;
  $('ctext').replaceChildren(el('span', null, 'spin'), ` Getting ${file.name} ready…`);
  $('cbarwrap').classList.add('unknown');
  try {
    const peer = await makePeer(randomId());
    const url = pageUrl('s', peer.id);
    share = { peer, file, url, qr: qrSvg(url), deadline: Date.now() + SHARE_SECONDS * 1000, downloads: 0 };
    peer.on('connection', serveShare);
    keepJoined(peer);
    peer.on('error', (e) => note(`Connection problem (${e.type})`));
    note(`Sharing ${file.name} by QR code for ${SHARE_SECONDS / 60} minutes`);
    keepAwake(true);
  } catch { notice = NO_SERVICE; showNotice(notice); }
  copying = false;
  render();
}

function serveShare(conn) {
  const sh = share;
  if (!sh || conn.metadata?.op !== 'get') return conn.on('open', () => conn.close());
  let t = null, delivered = false;
  conn.on('open', async () => {
    t = track(sh.file.name, 'to a phone', 'down', sh.file.size);
    conn.send(JSON.stringify({ name: sh.file.name, size: sh.file.size, type: sh.file.type }));
    const sent = await streamBlob(conn, sh.file, (n) => (t.done = n));
    if (sent) for (let i = 0; i < 100 && !delivered && conn.open; i++) await sleep(100); // wait for the other side's "done"
    untrack(t);
    if (!delivered) note('A phone stopped downloading ' + sh.file.name);
  });
  conn.on('data', (d) => { if (d === 'done' && !delivered) { delivered = true; sh.downloads++; note('A phone downloaded ' + sh.file.name); } });
  conn.on('close', () => untrack(t));
}

function stopShare(why) {
  const sh = share; share = null;
  if (!sh) return;
  closePeer(sh.peer);
  for (const t of [...T.values()]) if (t.who === 'to a phone') untrack(t);
  if (why) note(why);
}

// ---- The room ----
const R = { open: false, peer: null, devices: new Map(), items: [], nextId: 1, settings: { approve: true, use_pin: false, autodelete: false },
  pin: '', wrongPins: 0, deadline: 0, last: 0, memory: 0, url: '', qr: '', error: '' };
const cleanName = (n) => String(n || '').replace(/[\x00-\x1f]/g, '').trim().slice(0, 30) || 'Phone';
const isRisky = (name) => RISKY.has(extOf(name));

async function openRoom(minutes) {
  const ms = Math.max(1, Math.min(+minutes || 30, 240)) * 60000;
  R.error = '';
  if (R.open) { R.deadline = Date.now() + ms; return; }
  let peer;
  try { peer = await makePeer(randomId()); } catch { R.error = NO_SERVICE; return; }
  Object.assign(R, { open: true, peer, devices: new Map(), items: [], nextId: 1, pin: String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0'),
    wrongPins: 0, deadline: Date.now() + ms, last: Date.now(), memory: 0, url: pageUrl('r', peer.id) });
  R.qr = qrSvg(R.url);
  peer.on('connection', onRoomConnection);
  keepJoined(peer);
  peer.on('error', (e) => note(`Connection problem (${e.type})`));
  note('Room opened');
  keepAwake(true);
}

function closeRoom(why) {
  if (!R.open) return;
  for (const d of R.devices.values()) { try { d.conn.send({ t: 'closed' }); } catch {} }
  const peer = R.peer;
  peer.closing = true;
  setTimeout(() => peer.destroy(), 400); // let the goodbye go out first
  for (const it of R.items) if (it.thumb) URL.revokeObjectURL(it.thumb);
  for (const t of [...T.values()]) if (t.dev) untrack(t);
  Object.assign(R, { open: false, peer: null, devices: new Map(), items: [], memory: 0, url: '', qr: '' });
  note(why);
}

function onRoomConnection(conn) {
  const op = conn.metadata?.op;
  if (!R.open) return conn.on('open', () => conn.close());
  if (op === 'ctl') return roomControl(conn);
  if (op === 'put') return roomPut(conn);
  if (op === 'get') return roomGet(conn);
  conn.on('open', () => conn.close());
}

function roomControl(conn) {
  conn.on('open', () => conn.send({ t: 'hello', pin: R.settings.use_pin }));
  conn.on('data', (m) => { if (m && typeof m === 'object') { R.last = Date.now(); roomMessage(conn, m); render(); } });
  conn.on('close', () => {
    const d = R.devices.get(conn.peer);
    if (d && d.conn === conn) { R.devices.delete(conn.peer); note(`${d.name} left`); broadcast(); render(); }
  });
}

function roomMessage(conn, m) {
  const d = R.devices.get(conn.peer);
  if (m.t === 'join' && !d) {
    if (R.devices.size >= MAX_MEMBERS) return conn.send({ t: 'full' });
    if (R.settings.use_pin && String(m.pin) !== R.pin) {
      R.wrongPins++;
      note(`Wrong PIN (${R.wrongPins} of ${MAX_PIN_TRIES})`);
      if (R.wrongPins >= MAX_PIN_TRIES) return closeRoom(`Room locked after ${MAX_PIN_TRIES} wrong PINs. Open a new room to continue.`);
      return conn.send({ t: 'pin', left: MAX_PIN_TRIES - R.wrongPins });
    }
    const taken = new Set([...R.devices.values()].map((x) => x.name).concat(['Host', 'You']));
    const label = cleanName(m.name);
    let name = label, n = 2;
    while (taken.has(name)) name = `${label} ${n++}`;
    const dev = { id: R.nextId++, name, in: !R.settings.approve, conn };
    R.devices.set(conn.peer, dev);
    note(dev.in ? `${name} joined` : `${name} is asking to join`);
    conn.send({ t: dev.in ? 'in' : 'wait', id: dev.id, name });
    broadcast();
  } else if (m.t === 'text' && d?.in) {
    const text = String(m.text || '');
    if (text.trim() && text.length <= MAX_TEXT) addItem({ kind: 'text', name: 'Text', text, from: d.name, from_id: d.id, owner: conn.peer });
  }
}

// What a device in the room is told: the items (its own marked "You") and who is at the tables.
function publicItem(it, forPeer) {
  return { id: it.id, kind: it.kind, name: it.name, size: it.size, text: it.text, risky: it.risky, from: it.owner === forPeer ? 'You' : it.from, from_id: it.from_id };
}
function broadcast() {
  for (const [peerId, d] of R.devices) {
    if (!d.in) continue;
    try { d.conn.send({ t: 'state', items: R.items.map((it) => publicItem(it, peerId)) }); } catch {}
  }
}
function addItem(fields) {
  const it = { id: R.nextId++, risky: fields.kind === 'file' && isRisky(fields.name), ...fields };
  if (it.kind === 'file' && it.blob.size && it.blob.size <= 15 * 1024 * 1024 && IMAGES.has(extOf(it.name))) it.thumb = URL.createObjectURL(it.blob);
  R.items.push(it);
  R.last = Date.now();
  note(`${it.from} ${it.kind === 'text' ? 'sent text' : 'added ' + it.name}`);
  broadcast();
  return it;
}
function removeItem(id) {
  const i = R.items.findIndex((it) => it.id === id);
  if (i < 0) return;
  const [it] = R.items.splice(i, 1);
  if (it.thumb) URL.revokeObjectURL(it.thumb);
  if (it.owner) R.memory -= it.size || 0; // only what other devices sent counts: the host's own files are read from disk
  broadcast();
}

// A device sends a file into the room.
function roomPut(conn) {
  const meta = conn.metadata || {};
  conn.on('open', () => {
    const d = R.devices.get(conn.peer);
    const total = Number(meta.size), name = safeName(meta.name);
    const refuse = (err) => { conn.send(JSON.stringify({ err })); setTimeout(() => conn.close(), 300); };
    if (!d?.in) return refuse('This device is not in the room.');
    if (!Number.isFinite(total) || total < 0 || total > MAX_FILE) return refuse('Files up to 100 MB can be sent.');
    if (R.memory + total > ROOM_MEMORY) return refuse("The host's phone is full. Ask for some files to be taken off the tables.");
    R.memory += total;
    const t = track(name, `from ${d.name}`, 'up', total, d.id);
    const chunks = [];
    let got = 0, finished = false;
    const end = (ok) => {
      if (finished) return; finished = true; untrack(t);
      if (!ok || !R.open) { R.memory -= total; if (!ok) note(`${d.name} stopped sending ${name}`); return; }
      addItem({ kind: 'file', name, size: total, blob: new Blob(chunks, { type: String(meta.type || '') }), from: d.name, from_id: d.id, owner: conn.peer });
      try { conn.send('done'); } catch {}
      render();
    };
    conn.on('data', (c) => {
      if (finished || typeof c === 'string' || !c.byteLength) return;
      chunks.push(c); got += c.byteLength; t.done = got; R.last = Date.now();
      if (got > total) { end(false); conn.close(); } else if (got === total) end(true);
    });
    conn.on('close', () => end(false));
    conn.send(JSON.stringify({ ok: true }));
    if (total === 0) end(true);
  });
}

// A device downloads a file from the room.
function roomGet(conn) {
  conn.on('open', async () => {
    const d = R.devices.get(conn.peer);
    const it = R.items.find((x) => x.id === Number(conn.metadata?.item));
    if (!d?.in || !it || it.kind !== 'file') { conn.send(JSON.stringify({ err: 'That file is no longer on the tables.' })); return setTimeout(() => conn.close(), 300); }
    const t = track(it.name, `to ${d.name}`, 'down', it.size, d.id);
    let delivered = false;
    conn.on('data', (m) => {
      if (m !== 'done' || delivered) return;
      delivered = true; note(`${d.name} downloaded ${it.name}`);
      if (R.settings.autodelete && it.owner !== conn.peer && R.items.includes(it)) { removeItem(it.id); note(`${it.name} left the tables after its download`); }
      render();
    });
    conn.send(JSON.stringify({ name: it.name, size: it.size, type: it.blob.type }));
    const sent = await streamBlob(conn, it.blob, (n) => { t.done = n; R.last = Date.now(); });
    if (sent) for (let i = 0; i < 100 && !delivered && conn.open; i++) await sleep(100);
    untrack(t);
  });
}

const findDevice = (id) => [...R.devices].find(([, d]) => d.id === id);
function letIn(id) {
  const f = findDevice(id);
  if (!f || f[1].in) return;
  f[1].in = true; note(`${f[1].name} joined`);
  try { f[1].conn.send({ t: 'in', id: f[1].id, name: f[1].name }); } catch {}
  broadcast();
}
function kick(id) {
  const f = findDevice(id);
  if (!f) return;
  const [peerId, d] = f;
  R.devices.delete(peerId);
  note(`${d.name} ${d.in ? 'removed' : 'was not let in'}`);
  try { d.conn.send({ t: 'out' }); } catch {}
  setTimeout(() => d.conn.close(), 300);
  for (const t of [...T.values()]) if (t.dev === d.id) untrack(t);
}

// ---- What the shared screens (ui.js) ask of this page ----
async function act(action, body = {}) {
  if (action === 'unshare') stopShare('Stopped sharing');
  else if (action === 'open') await openRoom(body.minutes);
  else if (action === 'close') closeRoom('Room closed');
  else if (action === 'settings') { for (const k of Object.keys(R.settings)) if (k in body) R.settings[k] = !!body[k]; }
  else if (action === 'let_in') letIn(body.id);
  else if (action === 'kick') kick(body.id);
  else if (action === 'remove') removeItem(body.id);
  else if (action === 'text' && R.open && String(body.text).trim() && String(body.text).length <= MAX_TEXT) addItem({ kind: 'text', name: 'Text', text: String(body.text), from: 'Host', from_id: 0, owner: null });
  render();
}
function refresh() { render(); }

function roomAddFiles(files) {
  if (!R.open) return;
  const big = files.filter((f) => f.size > MAX_FILE);
  for (const f of files) if (f.size <= MAX_FILE) addItem({ kind: 'file', name: safeName(f.name), size: f.size, blob: f, from: 'Host', from_id: 0, owner: null });
  if (big.length) R.error = `Too big to add: ${big.map((f) => f.name).join(', ')} (the limit is 100 MB).`;
  render();
}
function itemActions(it) {
  if (it.kind === 'text') return [copyButton(it.text)];
  const item = R.items.find((x) => x.id === it.id);
  if (!item || !item.owner) return []; // the host's own files are already on this phone
  return [button('Download', () => saveBlob(item.blob, item.name), 'primary', 'Download ' + it.name)];
}

function viewState() {
  const now = Date.now(), open = R.open;
  const devices = open ? [...R.devices.values()].map((d) => ({ id: d.id, name: d.name, ip: '', in: d.in })) : [];
  return {
    status: !open ? 'off' : T.size ? 'sending' : devices.some((d) => d.in) ? 'connected' : 'waiting',
    url: open ? R.url : '', qr: open ? R.qr : '', seconds_left: open ? Math.max(0, Math.round((R.deadline - now) / 1000)) : 0, idle_minutes: IDLE_SECONDS / 60,
    pin: open && R.settings.use_pin ? R.pin : '', settings: R.settings, devices,
    items: open ? R.items.map((it) => ({ ...publicItem(it, null), preview: !!it.thumb, thumb: it.thumb })) : [],
    transfers: [...T.values()].map((t) => {
      const speed = t.done / Math.max((now - t.start) / 1000, 0.001);
      return { id: t.id, name: t.name, who: t.who, dir: t.dir, done: t.done, total: t.total, dev: t.dev, speed, left: speed > 0 ? (t.total - t.done) / speed : null };
    }),
    share: share && { name: share.file.name, size: share.file.size, url: share.url, qr: share.qr, downloads: share.downloads, seconds_left: Math.max(0, Math.round((share.deadline - now) / 1000)) },
    notice, room_error: R.error, log,
  };
}
function render() {
  const s = viewState();
  header(s); home(s); room(s);
  if (changed('log', s.log)) $('log').replaceChildren(...s.log.map(([t, text]) => { const li = el('li'); li.append(el('time', t), text); return li; }));
}

function expire() {
  const now = Date.now();
  if (share && now > share.deadline) stopShare(`Stopped sharing ${share.file.name}: ${SHARE_SECONDS / 60} minutes are up`);
  if (R.open && now > R.deadline) closeRoom('Room closed: time is up');
  else if (R.open && !T.size && now > R.last + IDLE_SECONDS * 1000) closeRoom(`Room closed after ${IDLE_SECONDS / 60} minutes with nothing happening`);
  keepAwake(!!share || R.open);
}

function hostApp() {
  awakeWanted = () => !!share || R.open;
  startApp('phone');
  $('addfiles').onclick = () => { const i = el('input'); i.type = 'file'; i.multiple = true; i.onchange = () => roomAddFiles([...i.files]); i.click(); };
  render();
  setInterval(() => { expire(); render(); }, 500);
}

// =====================================================================================================================
// Another device's page: receiving a shared file, or being a guest in a room
// =====================================================================================================================
function mountGuest() {
  $('shell').remove();
  document.body.insertAdjacentHTML('afterbegin', `
<div class="gh"><h1><img src="${ICON}" alt="">Q<span>Sendr</span></h1><span id="gme"></span></div>
<main class="guest">
  <section id="gmsg"><p id="gtext" class="status" role="status"></p><div id="gbarwrap" class="bar" hidden><i id="gbar"></i></div><p id="gmeta" class="muted"></p><div id="gactions" class="row"></div></section>
  <section id="gjoin" hidden>
    <h2>Join the room</h2>
    <form id="gform">
      <label class="field" for="gname">Your name, as others see it</label>
      <input id="gname" type="text" maxlength="30" autocomplete="nickname" required>
      <div id="gpinbox" hidden><label class="field" for="gpin">PIN shown on the host's screen</label>
        <input id="gpin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"></div>
      <p id="gerror" class="warn" role="alert" hidden></p>
      <div class="row"><button class="primary cta" type="submit">Join</button></div>
    </form>
  </section>
  <div id="groom" hidden>
    <section>
      <input id="gpick" class="vh" type="file" multiple>
      <label for="gpick" class="btn primary cta">Send files</label>
      <div id="gprog" hidden><p id="gptext" class="status" style="margin: 12px 0 6px" role="status"></p><div class="bar"><i id="gpbar"></i></div><p class="muted">Keep this screen open while sending.</p></div>
      <p id="gsenderr" class="warn" role="alert" hidden></p>
      <details><summary>Send text or a link</summary>
        <label for="gtext2" class="vh">Text or a link</label><textarea id="gtext2" rows="3"></textarea>
        <div class="row"><button id="gsendtext" type="button">Send text</button></div></details>
    </section>
    <section><h2>On the tables</h2><ul id="gitems"></ul></section>
  </div>
</main>`);
  document.getElementById('settings').remove();
}
const say = (text, busy = false) => { $('gtext').replaceChildren(...(busy ? [el('span', null, 'spin'), ' '] : []), text); };
const view = (id) => { for (const v of ['gmsg', 'gjoin', 'groom']) $(v).hidden = v !== id; };

// ---- Someone scanned a shared file's QR ----
async function guestShare(id) {
  mountGuest(); view('gmsg');
  say('Connecting to the sender…', true);
  let peer;
  try { peer = await makePeer(); } catch { return say(NO_SERVICE); }
  keepAwake(true);
  try {
    const { blob, name } = await receiveFrom(peer, id, { op: 'get' }, (got, total, fname) => {
      $('gbarwrap').hidden = false; $('gbar').style.width = (100 * got / (total || 1)) + '%';
      say(`Receiving ${fname}`, true); $('gmeta').textContent = `${size(got)} of ${size(total)}`;
    });
    $('gbarwrap').hidden = true;
    say(`✓ ${name} is ready`); $('gmeta').textContent = size(blob.size);
    $('gactions').replaceChildren(button('Save again', () => saveBlob(blob, name), 'primary'));
    saveBlob(blob, name);
  } catch (e) {
    $('gbarwrap').hidden = true; $('gmeta').textContent = '';
    say(e.message === 'GONE' ? 'This file is no longer shared. Ask for a new QR code.' : e.message);
  }
  keepAwake(false);
}

// ---- Someone scanned a room's QR ----
async function guestRoom(id) {
  mountGuest(); view('gmsg');
  say('Connecting to the room…', true);
  let peer;
  try { peer = await makePeer(); } catch { return say(NO_SERVICE); }
  const conn = peer.connect(id, { serialization: 'json', reliable: true, metadata: { op: 'ctl' } });
  let phase = 'connecting', mine = 0, sending = false;
  const end = (text) => { phase = 'ended'; view('gmsg'); $('gbarwrap').hidden = true; say(text); $('gactions').replaceChildren(button('Try again', () => location.reload())); keepAwake(false); };
  setTimeout(() => { if (phase === 'connecting') end("Couldn't reach the room. It may have closed, or this network blocks direct connections."); }, 20000);
  peer.on('error', (e) => { if (e.type === 'peer-unavailable') end('This room is closed, or the link is old.'); });
  keepJoined(peer);

  let saved = ''; try { saved = localStorage.getItem('qsendr-name') || ''; } catch {}
  const ua = navigator.userAgent;
  $('gname').value = saved || (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Phone');

  conn.on('data', (m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { phase = 'joining'; $('gpinbox').hidden = !m.pin; $('gpin').required = !!m.pin; view('gjoin'); }
    else if (m.t === 'wait') { view('gmsg'); say('Waiting at the door for the host to let you in…', true); }
    else if (m.t === 'in') { phase = 'in'; mine = m.id; $('gme').replaceChildren(shapeEl(m.id, 26), m.name); view('groom'); keepAwake(true); }
    else if (m.t === 'pin') { view('gjoin'); $('gerror').hidden = false; $('gerror').textContent = `Wrong PIN. ${m.left} ${m.left === 1 ? 'try' : 'tries'} left before the room locks.`; }
    else if (m.t === 'full') end('This room is full.');
    else if (m.t === 'out') end('The host did not let you in, or removed you.');
    else if (m.t === 'closed') end('The room has closed.');
    else if (m.t === 'state' && Array.isArray(m.items)) guestItems(m.items);
  });
  conn.on('close', () => { if (phase !== 'ended') end('The connection to the room was lost.'); });

  $('gform').onsubmit = (e) => {
    e.preventDefault();
    const name = $('gname').value.trim();
    try { localStorage.setItem('qsendr-name', name); } catch {}
    $('gerror').hidden = true;
    conn.send({ t: 'join', name, pin: $('gpin').value });
  };

  let shownItems = '';
  const seen = new Set();
  function guestItems(items) {
    const now = JSON.stringify(items);
    if (now === shownItems) return;
    shownItems = now;
    $('gitems').replaceChildren(...(items.length ? items.map((it) => {
      const row = el('li', null, 'item' + (seen.has(it.id) ? '' : ' enter')); seen.add(it.id);
      const name = el('div', null, 'name'), who = el('span', null, 'who muted');
      who.append(shapeEl(it.from_id, 16), it.from);
      if (it.kind === 'text') name.append(who, el('p', it.text, 'text'));
      else name.append(el('div', it.name), who, el('span', ' · ' + size(it.size), 'muted'));
      if (it.risky) name.append(el('div', '⚠ Program file. Only open it if you trust who sent it.', 'warn'));
      row.append(name);
      if (it.kind === 'text') row.append(copyButton(it.text));
      else if (it.from !== 'You') row.append(downloadButton(it));
      return row;
    }) : [el('li', 'Nothing on the tables yet. Send something, or wait for the others.', 'muted')]));
  }
  function downloadButton(it) {
    const b = button('Download', async () => {
      b.disabled = true; b.replaceChildren(el('span', null, 'spin'), ' 0%');
      try {
        const { blob, name } = await receiveFrom(peer, id, { op: 'get', item: it.id }, (got, total) => (b.lastChild.textContent = ` ${Math.floor(100 * got / (total || 1))}%`));
        saveBlob(blob, name); b.textContent = 'Saved';
      } catch (e) { b.textContent = 'Try again'; $('gsenderr').hidden = false; $('gsenderr').textContent = e.message === 'GONE' ? 'The room has closed.' : e.message; }
      b.disabled = false;
    }, 'primary', 'Download ' + it.name);
    return b;
  }

  // Sending files into the room, one after another.
  function putFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const c = peer.connect(id, { serialization: 'raw', reliable: true, metadata: { op: 'put', name: file.name, size: file.size, type: file.type } });
      let started = false, finished = false;
      const settle = (fn, v) => { if (finished) return; finished = true; try { c.close(); } catch {} fn(v); };
      c.on('data', async (d) => {
        if (typeof d !== 'string') return;
        if (d === 'done') return settle(resolve);
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.err) return settle(reject, new Error(m.err));
        if (m.ok && !started) { started = true; if (!(await streamBlob(c, file, onProgress))) settle(reject, new Error('Connection lost. Keep this screen open while sending.')); }
      });
      c.on('close', () => settle(reject, new Error('The connection closed before the file arrived.')));
      c.on('error', () => settle(reject, new Error('The connection failed.')));
      setTimeout(() => { if (!started) settle(reject, new Error('No answer from the room.')); }, 20000);
    });
  }
  $('gpick').onchange = async () => {
    const files = [...$('gpick').files]; $('gpick').value = '';
    const big = files.filter((f) => f.size > MAX_FILE), go = files.filter((f) => f.size <= MAX_FILE);
    $('gsenderr').hidden = !big.length;
    $('gsenderr').textContent = big.length ? `Too big to send: ${big.map((f) => f.name).join(', ')} (the limit is 100 MB).` : '';
    if (!go.length || sending) return;
    sending = true; $('gprog').hidden = false;
    try {
      for (const [i, f] of go.entries()) {
        $('gptext').textContent = `Sending ${go.length > 1 ? `${i + 1} of ${go.length}: ` : ''}${f.name}`;
        $('gpbar').style.width = '0%';
        await putFile(f, (n) => ($('gpbar').style.width = (100 * n / (f.size || 1)) + '%'));
      }
      $('gptext').textContent = `✓ Sent ${go.length === 1 ? go[0].name : go.length + ' files'}`; $('gpbar').style.width = '100%';
      setTimeout(() => { if (!sending) $('gprog').hidden = true; }, 4000);
    } catch (e) { $('gprog').hidden = true; $('gsenderr').hidden = false; $('gsenderr').textContent = e.message === 'GONE' ? 'The room has closed.' : e.message; }
    sending = false;
  };
  $('gsendtext').onclick = () => {
    const text = $('gtext2').value;
    if (!text.trim() || text.length > MAX_TEXT) return;
    conn.send({ t: 'text', text }); $('gtext2').value = '';
  };
}

// =====================================================================================================================
const params = new URLSearchParams(location.hash.slice(1));
if (params.get('s')) guestShare(params.get('s'));
else if (params.get('r')) guestRoom(params.get('r'));
else hostApp();
addEventListener('hashchange', () => location.reload()); // a new link opened inside the installed app
