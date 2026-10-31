// Service worker: it can be killed at any time, so all state lives in chrome.storage.session.
const FLOOR = 100 * 1024; // ignore known-size media below this (tracking pixels, tiny clips)
const FILTER = { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] };
importScripts('types.js');
const EXT = __vsniffTypes;
const SIZED = ['MP4', 'WEBM', 'VIDEO', 'AUDIO'];
const key = (id) => 'tab:' + id;

function classify(url, ct = '') {
  let path;
  try { path = new URL(url).pathname; } catch { return null; }
  const ext = /\.([a-z0-9]{2,4})$/i.exec(path)?.[1].toLowerCase();
  if (EXT[ext]) return EXT[ext];
  ct = ct.toLowerCase();
  if (ct.includes('mpegurl')) return 'HLS';
  if (ct.includes('dash+xml')) return 'DASH';
  if (ct === 'video/mp2t') return 'SEG';
  if (ct.startsWith('video/webm')) return 'WEBM';
  if (ct.startsWith('video/mp4')) return 'MP4';
  if (ct.startsWith('video/')) return 'VIDEO';
  if (ct.startsWith('audio/')) return 'AUDIO';
  return null;
}

// One item per file: drop the hash and Facebook-style byte-range params.
function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.delete('bytestart');
    u.searchParams.delete('byteend');
    return u.href;
  } catch { return null; }
}

const header = (d, name, list = d.responseHeaders) => list?.find((h) => h.name.toLowerCase() === name)?.value;
const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
// YouTube is left to yt-dlp: its chunks are signed, split and useless on their own. Only the page itself is listed.
const isYouTube = (u) => /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|googlevideo\.com)$/.test(host(u));

function sizeOf(d) {
  const total = /\/(\d+)$/.exec(header(d, 'content-range') ?? '')?.[1];
  if (total) return +total;
  const len = header(d, 'content-length');
  return len && d.statusCode === 200 ? +len : null;
}

// Read-modify-write on storage races across events, so run them one at a time.
let q = Promise.resolve();
const enqueue = (fn) => { q = q.then(fn).catch(console.error); };

const load = async (id) => (await chrome.storage.session.get(key(id)))[key(id)] ?? { items: [], drm: false };

// Same page, ignoring the #fragment. Items, the DRM flag and the badge follow the page the tab shows now.
const samePage = (a, b) => typeof a === 'string' && typeof b === 'string' && a.split('#')[0] === b.split('#')[0];

async function save(id, d) {
  await chrome.storage.session.set({ [key(id)]: d });
  const page = (await chrome.tabs.get(id).catch(() => null))?.url;
  const n = d.items.filter((i) => i.type !== 'SEG' && samePage(i.page, page) && !d.hidden?.includes(i.url)).length;
  chrome.action.setBadgeText({ tabId: id, text: n ? String(n) : '' }).catch(() => {});
  chrome.action.setTitle({ tabId: id, title: d.blocked ? `Video Sniffer · ${d.blocked} blocked on this page` : 'Video Sniffer' }).catch(() => {});
}

function record(tabId, c) {
  if (tabId < 0) return;
  enqueue(async () => {
    if (c.type === 'SEG' && !(await chrome.storage.local.get('showAll')).showAll) return;
    const page = (await chrome.tabs.get(tabId).catch(() => null))?.url;
    if (c.type !== 'MSE' && (isYouTube(page) || isYouTube(c.url))) return;
    const url = page && normalize(c.type === 'MSE' ? page : c.url);
    if (!url) return;
    const d = await load(tabId);
    const i = d.items.findIndex((x) => x.url === url);
    if (c.size != null && c.size < FLOOR && SIZED.includes(c.type)) {
      if (i < 0) return;
      d.items.splice(i, 1);
    } else if (i >= 0) {
      d.items[i].size = c.size ?? d.items[i].size;
      d.items[i].ts = Date.now(); // last seen: a video still loading keeps its row
      d.items[i].referer ??= c.referer;
      d.items[i].thumb ??= c.thumb;
      d.items[i].origin ??= c.origin;
      if (c.type !== 'VIDEO') d.items[i].type = c.type;
    } else {
      // page is kept per item: sites that change pages without reloading (X, Reddit...) are filtered by it in the popup.
      d.items.push({ url, type: c.type, size: c.size ?? null, page, referer: c.referer, origin: c.origin, thumb: c.thumb, ts: Date.now() });
      if (d.items.length > 200) d.items.shift();
      if (!(await chrome.alarms.get('prune'))) chrome.alarms.create('prune', { periodInMinutes: 1 });
    }
    await save(tabId, d);
  });
}

// Rows expire __vsniffRowLife after they were last seen. A once-a-minute alarm, only while any rows exist,
// so the badge drops too even when the page goes quiet.
async function prune() {
  const all = await chrome.storage.session.get(null);
  const jobs = all.jobs ?? {};
  let left = 0;
  for (const [k, d] of Object.entries(all)) {
    if (!k.startsWith('tab:')) continue;
    const keep = d.items.filter((i) => Date.now() - i.ts < __vsniffRowLife || (jobs[i.url] && !jobs[i.url].done && !jobs[i.url].error));
    if (keep.length !== d.items.length) {
      d.items = keep;
      d.hidden = d.hidden?.filter((u) => keep.some((i) => i.url === u));
      await save(+k.slice(4), d);
    }
    left += keep.length;
  }
  if (!left) chrome.alarms.clear('prune');
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'prune') enqueue(prune); });

// onSendHeaders sees the real Referer and Origin (with extraHeaders), which some servers need to repeat the request.
chrome.webRequest.onSendHeaders.addListener((d) => {
  const type = classify(d.url);
  if (type) record(d.tabId, { url: d.url, type, referer: header(d, 'referer', d.requestHeaders), origin: header(d, 'origin', d.requestHeaders) });
}, FILTER, ['requestHeaders', 'extraHeaders']);

chrome.webRequest.onHeadersReceived.addListener((d) => {
  if (d.statusCode !== 200 && d.statusCode !== 206) return;
  const type = classify(d.url, header(d, 'content-type'));
  if (type) record(d.tabId, { url: d.url, type, size: sizeOf(d) });
}, FILTER, ['responseHeaders']);


const setJob = (url, job) => enqueue(async () => {
  const { jobs = {} } = await chrome.storage.session.get('jobs');
  jobs[url] = job;
  await chrome.storage.session.set({ jobs });
});

// Helper downloads, one at a time (sites limit bulk downloading). The open native port keeps this worker alive
// (Chrome 105+), so the running job and the in-memory queue outlive the popup.
// Job state goes to storage, keyed by the link, for the popup to show. Cookies pass through and are never stored.
const HOST = 'com.videosniffer.helper';
const queue = [];
let running = null; // { url, port }

function startJob(m) {
  if (running) {
    queue.push(m);
    setJob(m.url, { queued: true });
    return;
  }
  let last = { pct: 0 };
  setJob(m.url, last);
  const port = chrome.runtime.connectNative(HOST);
  running = { url: m.url, port };
  const finish = (job) => {
    if (job) setJob(m.url, job);
    running = null;
    if (queue.length) startJob(queue.shift());
  };
  port.onMessage.addListener((r) => {
    setJob(m.url, (last = r));
    if (r.done || r.error) { port.disconnect(); finish(); }
  });
  port.onDisconnect.addListener(() => {
    const why = chrome.runtime.lastError?.message;
    finish(last.done || last.error ? null : { error: 'helper', detail: why ?? 'The helper stopped.' });
  });
  const { url, format, referer, origin, playlist, cookies } = m;
  port.postMessage({ cmd: 'download', url, format, referer, origin, playlist, cookies });
}

// Closing the port makes the helper stop yt-dlp. Joins are stopped inside the offscreen document.
function cancel(url) {
  const k = queue.findIndex((m) => m.url === url);
  if (k >= 0) queue.splice(k, 1);
  if (running?.url === url) {
    running.port.disconnect();
    running = null;
    if (queue.length) startJob(queue.shift());
  }
  chrome.runtime.sendMessage({ kind: 'offscreen-cancel', key: url }).catch(() => {});
  enqueue(async () => {
    const { jobs = {} } = await chrome.storage.session.get('jobs');
    if (jobs[url]?.dl != null) chrome.downloads.cancel(jobs[url].dl).catch(() => {});
  });
  setJob(url, { error: 'cancelled' });
}

// Chrome's own downloads (direct files, joined streams): the job keeps the download id; the popup polls it for
// progress, and the result lands here whether or not the popup is open.
function browserDownload(key, url, filename) {
  chrome.downloads.download({ url, filename }, (id) => {
    setJob(key, id == null ? { error: 'error', detail: chrome.runtime.lastError?.message } : { pct: 0, dl: id });
  });
}
chrome.downloads.onChanged.addListener((d) => {
  const state = d.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  enqueue(async () => {
    const { jobs = {} } = await chrome.storage.session.get('jobs');
    const key = Object.keys(jobs).find((k) => jobs[k].dl === d.id);
    if (!key) return;
    const [item] = await chrome.downloads.search({ id: d.id });
    jobs[key] = state === 'complete' ? { done: true, files: [item?.filename ?? ''] }
      : { error: d.error?.current === 'USER_CANCELED' ? 'cancelled' : 'expired', detail: d.error?.current };
    await chrome.storage.session.set({ jobs });
  });
});

// No helper: an offscreen document joins HLS segments in memory and hands back a blob URL to save.
let offscreen;
async function startJoin({ key, url, name }) {
  setJob(key, { pct: 0 });
  offscreen ??= chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Join video segments into one file',
  }).catch(() => {}); // already open after a worker restart
  await offscreen;
  chrome.runtime.sendMessage({ kind: 'offscreen-join', key, url, name }).catch(() => {});
}

function fromExtension(m) {
  if (m.kind === 'cancel') cancel(m.url);
  else if (m.kind === 'join') startJoin(m);
  else if (m.kind === 'progress') setJob(m.key, m.job);
  else if (m.kind === 'joined') browserDownload(m.key, m.blob, m.name);
  // The x hides a row (still tracked, so it stays fresh); pressing Scan shows hidden rows again.
  else if (m.kind === 'forget' || m.kind === 'unhide') enqueue(async () => {
    const d = await load(m.tabId);
    d.hidden = m.kind === 'unhide' ? [] : [...(d.hidden ?? []), m.url];
    await save(m.tabId, d);
  });
  else if (m.kind === 'browser-download') browserDownload(m.url, m.url, m.filename);
}

const bump = (id, what, url) => enqueue(async () => {
  const d = await load(id);
  d.blocked = (d.blocked ?? 0) + 1;
  d.last = { what, url };
  await save(id, d);
});

// Downloads arrive on their own port, so the login cookies they may carry reach only this worker
// (a broadcast message would also reach the offscreen document).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'download' || !port.sender?.url?.startsWith(chrome.runtime.getURL(''))) return;
  port.onMessage.addListener((m) => { startJob(m); port.disconnect(); });
});

chrome.runtime.onMessage.addListener((m, sender) => {
  // Popup and offscreen messages. Content scripts relay page text, so their messages never reach this.
  if (sender.url?.startsWith(chrome.runtime.getURL(''))) return void fromExtension(m);
  const id = sender.tab?.id;
  if (id == null) return;
  if (m.kind === 'drm') {
    enqueue(async () => { const d = await load(id); d.drm = (await chrome.tabs.get(id).catch(() => null))?.url; await save(id, d); });
  } else if (m.kind === 'mse') {
    record(id, { type: 'MSE' });
  } else if (m.kind === 'blocked') {
    bump(id, m.what, m.url);
  } else if (m.kind === 'gesture' || m.kind === 'menu') {
    // Its own small key: rewriting the tab's whole list on every click would be wasteful.
    chrome.storage.session.set({ [`${m.kind}:${id}`]: Date.now() });
  } else if (m.kind === 'thumb') {
    // The page's preview image (og:image), used for rows that have no poster of their own.
    if (/^https?:/.test(m.url ?? '')) enqueue(async () => {
      const d = await load(id);
      d.thumb = { page: (await chrome.tabs.get(id).catch(() => null))?.url, url: m.url };
      await save(id, d);
    });
  } else if (typeof m.url === 'string') {
    const type = classify(m.url, m.mime) ?? (m.kind === 'video' ? 'VIDEO' : null);
    const thumb = /^https?:/.test(m.poster ?? '') ? m.poster : undefined;
    if (type) record(id, { url: m.url, type, thumb });
  }
});

// Blocker: registered for every site except the ones switched off in the popup (storage.local "allow").
const allowed = (allow, url) => {
  try { const h = new URL(url).hostname; return allow.some((a) => h === a || h.endsWith('.' + a)); } catch { return false; }
};
async function registerBlocker() {
  const { allow = [] } = await chrome.storage.local.get('allow');
  const excludeMatches = allow.filter((h) => /^[a-z0-9.-]+$/i.test(h))
    .flatMap((h) => (/[a-z]/i.test(h) ? [`*://${h}/*`, `*://*.${h}/*`] : [`*://${h}/*`]));
  await chrome.scripting.unregisterContentScripts({ ids: ['blocker'] }).catch(() => {});
  await chrome.scripting.registerContentScripts([{
    id: 'blocker', js: ['blocker.js'], matches: ['<all_urls>'], excludeMatches,
    runAt: 'document_start', world: 'MAIN', allFrames: true,
  }]).catch(console.error);
}
chrome.runtime.onInstalled.addListener(registerBlocker);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.allow) registerBlocker(); });

// Tab-level closer: a page opened a tab though its user has not clicked or pressed a key there for 3 seconds.
// Context-menu opens get a minute. A page that never reported a gesture (e.g. loaded before an extension reload) is left alone.
chrome.webNavigation.onCreatedNavigationTarget.addListener((n) => enqueue(async () => {
  const opener = await chrome.tabs.get(n.sourceTabId).catch(() => null);
  if (!/^https?:/.test(opener?.url ?? '')) return;
  const { allow = [] } = await chrome.storage.local.get('allow');
  if (allowed(allow, opener.url)) return;
  const g = `gesture:${n.sourceTabId}`, c = `menu:${n.sourceTabId}`;
  const { [g]: gesture, [c]: menu = 0 } = await chrome.storage.session.get([g, c]);
  const now = Date.now();
  if (!gesture || now - gesture < 3000 || now - menu < 60000) return;
  const d = await load(n.sourceTabId);
  await chrome.tabs.remove(n.tabId).catch(() => {});
  d.blocked = (d.blocked ?? 0) + 1;
  d.last = { what: 'tab', url: n.url };
  await save(n.sourceTabId, d);
}));

const clear = (id) => enqueue(async () => {
  await chrome.storage.session.remove([key(id), `gesture:${id}`, `menu:${id}`, `probe:${id}`, `shot:${id}`, `scanned:${id}`]);
  chrome.action.setBadgeText({ tabId: id, text: '' }).catch(() => {});
  chrome.action.setTitle({ tabId: id, title: 'Video Sniffer' }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(clear);
// Full page loads start a fresh list.
chrome.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0) clear(d.tabId); });
// In-page navigations keep the list (earlier posts stay findable with "show all") but the badge follows the new page.
chrome.webNavigation.onHistoryStateUpdated.addListener((n) => {
  if (n.frameId === 0) enqueue(async () => save(n.tabId, await load(n.tabId)));
});
