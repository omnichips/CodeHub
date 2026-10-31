const $ = (s) => document.querySelector(s);
const HOST = 'com.videosniffer.helper';
const DIRECT = ['MP4', 'WEBM', 'VIDEO', 'AUDIO'];
const WHY = {
  protected: "Protected (DRM). It can't be downloaded.",
  login: 'This video needs a login. If you can watch it in this browser, turn on "Use my browser login" below and scan again.',
  noaccess: "Your account has no access to this video, so there's no way to get it.",
  blocked: 'The site is limiting downloads. Update yt-dlp, wait a while, then try one video at a time.',
  expired: 'The link was refused or has expired. Reload the page and scan again, or paste the link again.',
  region: 'Not available in your region.',
  unsupported: 'yt-dlp found no video there.',
  nojoin: "This stream can't be joined in the browser. Install the helper, or use Copy command.",
  timeout: 'yt-dlp took too long to answer. The site may be slow or blocking it; try again later.',
  helper: 'The helper did not respond. Check helper/SETUP.md.',
  error: 'yt-dlp failed. If the video plays in your browser, try a newer yt-dlp.',
};
const WHAT = { popup: 'popup', link: 'link', form: 'form', tab: 'tab' }; // for the undo button: "Reopen blocked tab"
const dlPct = new Map(); // browser downloads: link -> live percent, polled while this window is open
const chosen = new Map(); // picked quality by link; saved to session storage so it survives closing this window
const meta = new Map(); // item url -> what its manifest or size check said: { options, live, drm, splitAudio, media, size }
let tab, data = { items: [], drm: false }, showAll = false;
let helper = null; // { version } or { error, detail }; null until known
let probe = null; // last yt-dlp answer for a link
let manual = []; // pasted direct links when there is no helper
let jobs = {}; // downloads by link, written by background.js
let useLogin = false, allow = [], undoneAt = 0;

const hasHelper = () => !!helper?.version;
const why = (r) => (r.error === 'login' && useLogin ? WHY.noaccess : WHY[r.error] ?? WHY.error);
const fmtSize = (n) => n == null ? 'size unknown' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
const fmtAge = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; };
const clean = (s) => (s ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || 'video';
const quote = (u) => '"' + u.replace(/"/g, '%22') + '"';
const fmt = (q) => q === 'audio' ? 'ba/b' : +q ? `bv*[height<=${+q}]+ba/b[height<=${+q}]` : '';
const command = (i, q) => i.type === 'MSE'
  ? `yt-dlp --no-playlist ${quote(i.url)}`
  : `yt-dlp ${fmt(q) ? `-f "${fmt(q)}" ` : ''}--referer ${quote(i.referer ?? i.page)} ${quote(i.url)}`;
const ffmpeg = (i, src) => `ffmpeg -referer ${quote(i.referer ?? i.page)} -i ${quote(src ?? i.url)} -c copy ${quote(clean(tab.title) + '.mp4')}`;
const label = (i) => i.type === 'MSE' ? 'STREAM' : i.type;
const name = (i) => {
  const u = new URL(i.url);
  const file = decodeURIComponent(u.pathname.split('/').pop() || '');
  // "master.m3u8" or "index.mpd" says nothing; the page title does.
  if (i.type === 'MSE' || /(master|index|playlist|manifest|chunklist)[\w-]*\.(m3u8|mpd)$/i.test(file)) return tab.title || file || u.hostname;
  return file || u.hostname;
};
// Same page, ignoring the #fragment. Sites like X and Reddit change pages without reloading, so the list follows the
// page shown now; "show all" also brings back earlier pages and stream segments.
const samePage = (a, b) => typeof a === 'string' && typeof b === 'string' && a.split('#')[0] === b.split('#')[0];
const pageItems = () => [...manual, ...data.items]
  .filter((i) => showAll || (i.type !== 'SEG' && (i.manual || samePage(i.page, tab.url))))
  .filter((i) => i.manual || Date.now() - i.ts < __vsniffRowLife || active(jobs[i.url]))
  .filter((i) => !data.hidden?.includes(i.url))
  .sort((a, b) => b.ts - a.ts);
const pageDrm = () => data.drm === true || samePage(data.drm, tab.url);
const isYouTube = (u) => { try { return /(^|\.)(youtube\.com|youtu\.be)$/.test(new URL(u).hostname); } catch { return false; } };
const active = (j) => j && !j.done && !j.error;
const onAllowlist = () => { try { const h = new URL(tab.url).hostname; return allow.some((a) => h === a || h.endsWith('.' + a)); } catch { return false; } };

async function ask(msg) {
  try { return await chrome.runtime.sendNativeMessage(HOST, msg); }
  catch (e) { return { error: /not found/i.test(e.message) ? 'missing' : 'helper', detail: e.message }; }
}

// "Use my browser login": this site's cookies go to your own yt-dlp for one run, only while the switch is on.
async function cookiesFor(url) {
  if (!useLogin) return undefined;
  // ponytail: last two labels as the site; wrong for co.uk-style domains, use a public-suffix list if one matters.
  const domain = new URL(url).hostname.split('.').slice(-2).join('.');
  const list = await chrome.cookies.getAll({ domain });
  return list.map((c) => [c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE',
    Math.round(c.expirationDate ?? 0), c.name, c.value].join('\t')).join('\n');
}

const saveChosen = () => chrome.storage.session.set({ chosen: Object.fromEntries(chosen) });
const pct = (url) => dlPct.get(url) ?? jobs[url]?.pct;
// Preview: the video's poster, else the page's preview image, else a screenshot of the video on screen.
let snap = null; // { page, url } from snapshot()
let pageFound = null; // after a scan with page results: the status prefix, so the count follows the list
// Candidates in order; the next one is tried when an image fails to load (sites often block hotlinking).
const thumbOf = (i) => [i.thumb, samePage(snap?.page, tab.url) && snap.url, samePage(data.thumb?.page, tab.url) && data.thumb.url];

function jobText(j, url) {
  if (!j) return '';
  if (j.error === 'cancelled') return 'Cancelled';
  if (j.error) return 'Failed: ' + why(j);
  if (j.queued) return 'Queued, one download at a time';
  if (j.done) return j.partial ? `Done, but some failed (${j.files.length} saved)` : 'Saved: ' + (j.files.at(-1)?.split(/[\\/]/).pop() ?? 'done');
  const p = pct(url);
  if (p == null) return 'Downloading…';
  return p >= 100 ? 'Finishing…' : `Downloading ${p}%` + (j.saved ? ` · ${j.saved} saved` : '');
}

// A bar under anything downloading; no value while queued or before the size is known.
function progress(url) {
  const j = jobs[url];
  if (!active(j)) return null;
  const bar = el('progress');
  bar.max = 100;
  if (!j.queued && pct(url) != null) bar.value = pct(url);
  bar.setAttribute('aria-label', 'Download progress');
  return bar;
}

// Small preview so you can tell it is the right video. Broken or blocked images just disappear.
function thumb(srcs, cls = 'thumb') {
  const list = [].concat(srcs).filter((s) => /^(https?:|data:image\/)/.test(s || ''));
  if (!list.length) return null;
  const img = el('img', cls);
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => (list.length ? (img.src = list.shift()) : img.remove());
  img.src = list.shift();
  return img;
}

// Helper downloads and in-browser joins run in background.js, so they keep going after this window closes.
async function dl(url, format, extra = {}, site = url) {
  chrome.runtime.connect({ name: 'download' }).postMessage({ url, format, ...extra, cookies: await cookiesFor(site) });
}
const cancel = (url) => chrome.runtime.sendMessage({ kind: 'cancel', url });
const cancelButton = (url) => button('Cancel', () => cancel(url));
const join = (i, url) => chrome.runtime.sendMessage({ kind: 'join', key: i.url, url, name: clean(tab.title) });

// Direct files: Chrome's own downloader, tracked by background.js like every other job.
function download(i) {
  const ext = /\.(mp4|m4v|mov|webm|m4a|mp3|aac)$/i.exec(new URL(i.url).pathname)?.[1] ?? { WEBM: 'webm', AUDIO: 'm4a' }[i.type] ?? 'mp4';
  chrome.runtime.sendMessage({ kind: 'browser-download', url: i.url, filename: `${clean(tab.title)}.${ext}` });
}

// Chrome reports no progress events for downloads, so ask while this window is open.
setInterval(async () => {
  const live = Object.entries(jobs).filter(([, j]) => j.dl != null && active(j));
  if (!live.length) return;
  for (const [url, j] of live) {
    const [d] = await chrome.downloads.search({ id: j.dl });
    if (d?.totalBytes > 0) dlPct.set(url, Math.floor((100 * d.bytesReceived) / d.totalBytes));
  }
  render();
}, 700);

// Qualities and sizes for streams the page scan found: read the manifest, or ask the server for a direct file's size.
async function get(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}
async function inspect(i) {
  meta.set(i.url, {});
  let m = {};
  try {
    if (i.type === 'HLS') {
      const top = parseHls(await (await get(i.url)).text(), i.url);
      const v = top.variants[0];
      const media = v ? parseHls(await (await get(v.url)).text(), v.url) : top;
      m = { live: media.live, drm: top.drm || media.drm, splitAudio: top.splitAudio, media: v ? null : i.url,
        options: qualities(top.variants, 0, media.live ? null : media.duration) };
    } else if (i.type === 'DASH') {
      const d = parseDash(await (await get(i.url)).text());
      m = { live: d.live, drm: d.drm, options: qualities(d.video, d.audioBw, d.live ? null : d.duration) };
    } else if (DIRECT.includes(i.type) && i.size == null) {
      const r = await fetch(i.url, { headers: { Range: 'bytes=0-0' }, credentials: 'include' });
      r.body?.cancel();
      m = { size: +/\/(\d+)$/.exec(r.headers.get('content-range') ?? '')?.[1] || (r.status === 200 && +r.headers.get('content-length')) || null };
    }
  } catch {} // expired or refused: the row keeps "size unknown"
  meta.set(i.url, m);
  render();
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(text, onclick, cls) {
  const b = el('button', cls, text);
  b.onclick = onclick;
  return b;
}

// Removing a row only clears it from this list; a saved file stays on disk.
function forget(i) {
  if (i.manual) { manual = manual.filter((x) => x !== i); return render(); }
  chrome.runtime.sendMessage({ kind: 'forget', tabId: tab.id, url: i.url });
}
function removeButton(onclick) {
  const b = button('', onclick, 'icon');
  b.setAttribute('aria-label', 'Remove from list');
  b.title = 'Remove from list';
  b.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
  return b;
}

function row(...kids) {
  const d = el('div', 'actions');
  d.append(...kids);
  return d;
}

function picker(key, options) {
  const sel = el('select');
  sel.setAttribute('aria-label', 'Quality');
  sel.append(...options.map((o) => {
    const op = el('option', null, `${o.label} · ${o.approx && o.size != null ? '~' : ''}${fmtSize(o.size)}`);
    op.value = o.value;
    return op;
  }));
  if (chosen.has(key)) sel.value = chosen.get(key);
  sel.onchange = () => { chosen.set(key, sel.value); saveChosen(); };
  return sel;
}

function copy(b, text) {
  navigator.clipboard.writeText(text).then(() => {
    b.textContent = 'Copied';
    setTimeout(() => { openMenu = null; render(); }, 1200);
  });
}

// Copy actions sit behind one "Copy…" disclosure; with a single option it is just a button.
// The open menu is remembered so a list update does not snap it shut.
let openMenu = null;
function copyMenu(key, entries) {
  if (entries.length === 1) return button('Copy ' + entries[0][0], function () { copy(this, entries[0][1]()); });
  const d = el('details', 'more');
  d.open = openMenu === key;
  d.ontoggle = () => { if (d.open) openMenu = key; else if (openMenu === key) openMenu = null; };
  const menu = el('div', 'menu');
  menu.append(...entries.map(([text, get]) => button(text, function () { copy(this, get()); }, 'link')));
  d.append(el('summary', null, 'Copy…'), menu);
  return d;
}

const setStatus = (t) => { $('#status').textContent = t; };

function setProblem(r) {
  $('#problem').hidden = !r;
  if (r) $('#problem').textContent = why(r) + (r.detail ? ' (' + r.detail + ')' : '');
}

// The top note appears only when something needs attention; versions live in Settings.
function renderNote() {
  let note = '', versions = '';
  if (helper?.version) {
    // Age of your copy (when you last refreshed it), not of the release: a current release can be months old.
    const days = Math.floor((Date.now() - (helper.copied ?? new Date(helper.version.slice(0, 10).replace(/\./g, '-')))) / 864e5);
    versions = `yt-dlp ${helper.version}${days >= 0 ? `, copied ${days} days ago` : ''} · ffmpeg ${helper.ffmpeg ?? 'unknown'}`;
    if (days > 30) note = `Your copy of yt-dlp is ${days} days old. Check for a newer release if downloads start failing.`;
    if (helper.ffmpeg === 'missing') note = "ffmpeg is missing from the tools folder, so video and audio can't be joined.";
  } else if (helper?.error === 'missing') {
    note = 'Install yt-dlp for better results (helper/SETUP.md).';
    versions = 'Helper not installed.';
  } else if (helper?.error) note = 'Helper problem: ' + helper.detail;
  $('#note').textContent = note;
  $('#versions').textContent = versions;
}

// Step 1 result: one video with a quality picker, or a playlist/feed to choose from.
function renderYt() {
  const box = $('#yt');
  box.hidden = !probe;
  if (!probe) return;
  const head = el('div', 'head');
  head.append(...[el('div', 'name', probe.title ?? probe.url), active(jobs[probe.url]) ? null : removeButton(() => {
    probe = null;
    chrome.storage.session.remove('probe:' + tab.id);
    render();
  })].filter(Boolean));
  const kids = [thumb(probe.thumbnail, 'poster'), head].filter(Boolean);
  if (probe.entries) {
    kids.push(el('div', 'meta', `${probe.entries.length} videos. Choose one, or download them all.`));
    const ul = el('ul');
    ul.append(...probe.entries.map((e) => {
      const li = el('li', 'entry');
      li.append(el('span', 'name', e.title), button('Choose', () => scan(e.url, true)));
      return li;
    }));
    kids.push(ul, row(button('Download all (best)', () => dl(probe.url, 'best', { playlist: true }))));
  } else {
    const sel = picker(probe.url, probe.options);
    const actions = row(sel);
    // A video opened from a playlist: ask, defaulting to just this one.
    let whole;
    if (new URL(probe.url).searchParams.has('list')) {
      whole = el('select');
      whole.setAttribute('aria-label', 'Playlist');
      whole.append(new Option('Just this one', ''), new Option('All of the playlist', '1'));
      whole.value = chosen.get(probe.url + '#list') ?? '';
      whole.onchange = () => { chosen.set(probe.url + '#list', whole.value); saveChosen(); };
      actions.append(whole);
    }
    if (!active(jobs[probe.url])) actions.append(button('Download', () => dl(probe.url, +sel.value || sel.value, { playlist: !!whole?.value }), 'primary'));
    kids.push(actions);
  }
  const st = jobText(jobs[probe.url], probe.url);
  const bar = progress(probe.url);
  if (bar) kids.push(bar);
  if (st) kids.push(row(el('p', 'meta status', st), ...(active(jobs[probe.url]) ? [cancelButton(probe.url)] : [])));
  box.replaceChildren(...kids);
}

function renderFooter() {
  const web = /^https?:/.test(tab.url ?? '');
  $('#block').disabled = !web;
  $('#block').checked = web && !onAllowlist();
  $('#login').checked = useLogin;
  $('#blocked').hidden = !data.blocked;
  $('#blocked-text').textContent = data.blocked ? `Blocked ${data.blocked} on this page.` : '';
  $('#undo').hidden = !data.last || undoneAt === data.blocked;
  // Name what the undo does: reopen the last blocked window, or let the overlay catch clicks again.
  $('#undo').textContent = data.last?.what === 'overlay' ? 'Restore overlay' : 'Reopen blocked ' + (WHAT[data.last?.what] ?? 'popup');
}

// No poster or preview image on the page: screenshot the tab and crop to the biggest video on screen.
// Needs the video to be visible; the last good snapshot is kept for when it is scrolled away.
async function snapshot() {
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { kind: 'videoRect' }, { frameId: 0 });
    if (!r) return;
    const img = new Image();
    img.src = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
    await img.decode();
    const k = img.width / r.vw; // page pixels to screenshot pixels (covers zoom and screen scaling)
    const c = el('canvas');
    c.width = 320;
    c.height = Math.round((320 * r.h) / r.w);
    c.getContext('2d').drawImage(img, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
    snap = { page: tab.url, url: c.toDataURL('image/jpeg', 0.75) };
    chrome.storage.session.set({ ['shot:' + tab.id]: snap });
    render();
  } catch {} // no content script (chrome:// pages), or the capture was refused
}

function render() {
  // Rebuilding the list closes an open quality menu, so wait until the user has picked.
  if (document.activeElement?.tagName === 'SELECT') {
    document.activeElement.addEventListener('blur', render, { once: true });
    return;
  }
  renderYt();
  renderFooter();
  if (pageFound != null) setStatus(pageItems().length ? `${pageFound}Found ${pageItems().length} on the page.` : '');
  $('#page').hidden = !!probe;
  const items = pageItems();
  $('#drm').hidden = !pageDrm();
  $('#empty').hidden = items.length > 0 || !$('#paste').hidden; // after a scan the status line says it
  $('#list').replaceChildren(...items.map((i, k) => {
    if (!meta.has(i.url) && k < 15) inspect(i);
    const m = meta.get(i.url) ?? {};
    const opts = m.options?.length && !m.drm ? m.options : null;
    const sel = opts && picker(i.url, opts);
    const q = () => (sel ? +sel.value || sel.value : 'best');
    const li = el('li');
    const title = el('div', 'name', name(i));
    title.title = i.url;
    const head = el('div', 'head');
    const text = el('div', 'text');
    const variant = () => opts?.find((o) => String(o.value) === String(q()))?.url;
    text.append(title, el('div', 'meta', [
      label(i),
      m.live ? 'live' : opts ? '' : fmtSize(i.size ?? m.size),
      'seen ' + fmtAge(i.ts),
      i.type === 'MSE' && !hasHelper() ? (isYouTube(i.url) ? 'YouTube splits video and audio, needs yt-dlp' : 'needs yt-dlp') : '',
      m.drm ? 'protected' : jobText(jobs[i.url], i.url),
    ].filter(Boolean).join(' · ')));
    head.append(...[thumb(thumbOf(i)), text, active(jobs[i.url]) ? null : removeButton(() => forget(i))].filter(Boolean));
    li.append(...[head, progress(i.url)].filter(Boolean));
    const actions = row();
    const copies = [];
    if (!m.drm && i.type !== 'SEG') {
      if (sel) actions.append(sel);
      if (active(jobs[i.url])) actions.append(cancelButton(i.url));
      else if (hasHelper()) actions.append(button('Download', () => dl(i.url, q(), { referer: i.referer ?? i.page, origin: i.origin, name: clean(tab.title) }, i.page)));
      else if (DIRECT.includes(i.type)) actions.append(button('Download', () => download(i)));
      else if (i.type === 'HLS' && !m.live && !m.splitAudio && (opts || m.media)) {
        actions.append(button('Save in browser', () => join(i, opts ? variant() : m.media)));
      }
      if (!hasHelper() && !DIRECT.includes(i.type)) {
        copies.push(['yt-dlp command', () => command(i, q())]);
        if (i.type !== 'MSE') copies.push(['ffmpeg command', () => ffmpeg(i, variant())]);
      }
    }
    copies.push(['link', () => i.url]);
    actions.append(copyMenu(i.url, copies));
    li.append(actions);
    return li;
  }));
}

// Scan flow: yt-dlp check, then the page scan, then the paste box. Each step runs only if the one before found nothing.
async function scan(url, pasted = false) {
  pageFound = null;
  if (!pasted) { // a fresh scan shows rows you removed
    data.hidden = [];
    chrome.runtime.sendMessage({ kind: 'unhide', tabId: tab.id });
  }
  probe = null;
  chrome.storage.session.remove('probe:' + tab.id);
  setProblem(null);
  $('#paste').hidden = true;
  if (!/^https?:/.test(url)) { setStatus('Open a web page first.'); return render(); }
  let r = { error: 'missing' };
  if (helper?.error !== 'missing') {
    setStatus('Checking with yt-dlp…');
    render();
    $('#scan').disabled = true;
    r = await ask({ cmd: 'probe', url, cookies: await cookiesFor(url) });
    $('#scan').disabled = false;
    if (r.error === 'missing' || r.error === 'helper') { helper = r; renderNote(); }
  }
  if (!r.error) {
    probe = { ...r, page: tab.url };
    chrome.storage.session.set({ ['probe:' + tab.id]: probe }); // shown again when this window reopens on this page
    setStatus('');
    return render();
  }
  if (r.error === 'protected') { setStatus(WHY.protected); return render(); }
  if (r.error !== 'missing' && r.error !== 'unsupported') setProblem(r);

  if (pasted) {
    $('#paste').hidden = false;
    if (hasHelper()) setStatus(r.error === 'unsupported' ? WHY.unsupported : '');
    else {
      const ext = new RegExp(String.raw`\.(${__vsniffVideoExt})(?:[?#]|$)`, 'i').exec(url)?.[1].toLowerCase();
      const type = __vsniffTypes[ext];
      if (type) { manual.unshift({ url, type, page: url, manual: true, size: null, ts: Date.now() }); setStatus('Added below.'); }
      else setStatus('Page links need yt-dlp. Install it, or paste a direct video link.');
    }
    return render();
  }

  // The page scan runs all the time in the content scripts; this step shows what it found, retrying once.
  const before = r.error === 'unsupported' ? 'yt-dlp found nothing. ' : '';
  let n = pageItems().length;
  if (!n && !pageDrm()) {
    setStatus(`${before}Scanning the page again after clearing overlays…`);
    await chrome.tabs.sendMessage(tab.id, { kind: 'rescan' }).catch(() => {});
    await new Promise((done) => setTimeout(done, 2000));
    n = pageItems().length;
  }
  if (pageDrm()) setStatus(WHY.protected);
  else if (n) pageFound = before;
  else { setStatus(`${before}No video found on the page. Paste a link:`); $('#paste').hidden = false; }
  render();
}

$('#scan').onclick = () => scan(tab.url);
$('#paste').onsubmit = (e) => { e.preventDefault(); scan($('#link').value.trim(), true); };
$('#all').onchange = (e) => {
  showAll = e.target.checked;
  chrome.storage.local.set({ showAll });
  render();
};
$('#block').onchange = async (e) => {
  const h = new URL(tab.url).hostname;
  allow = e.target.checked ? allow.filter((a) => a !== h && !h.endsWith('.' + a)) : [...allow, h];
  await chrome.storage.local.set({ allow });
  setStatus('Reload the page to apply.');
};
$('#login').onchange = (e) => {
  useLogin = e.target.checked;
  chrome.storage.local.set({ useLogin });
};
$('#sites').onclick = () => chrome.runtime.openOptionsPage();
$('#undo').onclick = () => {
  const l = data.last;
  if (l.what === 'overlay') chrome.tabs.sendMessage(tab.id, { kind: 'restore' }).catch(() => {});
  else if (/^https?:/.test(l.url)) chrome.tabs.create({ url: l.url });
  undoneAt = data.blocked;
  renderFooter();
};

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  ({ showAll = false, useLogin = false, allow = [] } = await chrome.storage.local.get(['showAll', 'useLogin', 'allow']));
  $('#all').checked = showAll;
  const k = 'tab:' + tab.id;
  const s = await chrome.storage.session.get([k, 'jobs', 'chosen', 'probe:' + tab.id]);
  data = s[k] ?? data;
  jobs = s.jobs ?? {};
  for (const [key, v] of Object.entries(s.chosen ?? {})) chosen.set(key, v);
  probe = samePage(s['probe:' + tab.id]?.page, tab.url) ? s['probe:' + tab.id] : null; // sites that change pages in place
  snap = (await chrome.storage.session.get('shot:' + tab.id))['shot:' + tab.id] ?? null;
  snapshot();
  render();
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'session') return;
    if (c[k]) data = c[k].newValue ?? { items: [], drm: false };
    if (c.jobs) jobs = c.jobs.newValue ?? {};
    if (c[k] || c.jobs) render();
  });
  // The helper's last answer, so the right buttons show at once; the real check takes a few seconds.
  helper = (await chrome.storage.session.get('helper')).helper ?? null;
  renderNote();
  render();
  autoScan();
  helper = await ask({ cmd: 'version' });
  chrome.storage.session.set({ helper });
  renderNote();
  render();
  autoScan();
})();

// With the helper installed, check the page with yt-dlp as soon as the window opens: one result with a
// preview and qualities. Once per page; Scan runs it again.
let autoScanned = false;
async function autoScan() {
  const k = 'scanned:' + tab.id;
  if (autoScanned || !hasHelper() || probe || !/^https?:/.test(tab.url ?? '')) return;
  autoScanned = true;
  if (samePage((await chrome.storage.session.get(k))[k], tab.url)) return;
  chrome.storage.session.set({ [k]: tab.url });
  scan(tab.url);
}
