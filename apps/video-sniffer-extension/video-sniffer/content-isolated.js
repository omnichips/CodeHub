// Isolated world: relays MAIN-world reports to the service worker and scans the DOM.
// Starts at document_start so no early postMessage from content-main.js is missed.
const TAG = '__vsniff';
const RELAY = ['url', 'mse', 'drm', 'blocked']; // the only kinds a page script may report
const sent = new Set();
const scanned = new WeakSet();
// Same list as types.js (test.js checks they match); content scripts can't rely on another file's globals.
const URL_RE = /https?:\/\/[^"'\s\\<>]+?\.(?:mp4|m4v|mov|webm|m3u8|mpd)(?:\?[^"'\s\\<>]*)?/gi;

function send(m) {
  try { chrome.runtime.sendMessage(m).catch(() => {}); } catch {} // context gone after an extension reload
}

function report(m) {
  const id = m.kind + (m.url ?? '');
  if (m.url && sent.has(id)) return;
  sent.add(id);
  send(m);
}

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data?.[TAG] || !RELAY.includes(e.data.kind)) return;
  const { kind, url, what } = e.data;
  if (kind === 'blocked') send({ kind, what: String(what), url: String(url ?? '').slice(0, 2000) });
  else report({ kind, url });
});

// Real clicks and key presses, for the tab-level popup closer. isTrusted can't be faked by the page.
let lastGesture = 0;
const gesture = (e) => {
  if (!e.isTrusted || Date.now() - lastGesture < 1000) return;
  lastGesture = Date.now();
  send({ kind: 'gesture' });
};
addEventListener('pointerdown', gesture, true);
addEventListener('keydown', gesture, true);
addEventListener('contextmenu', (e) => { if (e.isTrusted) send({ kind: 'menu' }); }, true);

const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };

function scan() {
  for (const el of document.querySelectorAll('video[src], source[src]')) {
    const url = abs(el.getAttribute('src'));
    if (url?.startsWith('http')) report({ kind: 'video', url, mime: el.type, poster: el.closest('video')?.poster || undefined });
  }
  // The page's own preview image, top frame only (frames are often ads).
  const og = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.content;
  if (window === top && og) report({ kind: 'thumb', url: abs(og) });
  for (const m of document.querySelectorAll('meta[property^="og:video"], meta[name^="twitter:player:stream"]')) {
    const url = abs(m.content);
    if (url?.startsWith('http')) report({ kind: 'url', url });
  }
  for (const s of document.querySelectorAll('script:not([src])')) {
    if (scanned.has(s) || s.textContent.length > 2e6) continue;
    scanned.add(s);
    // JSON in pages escapes slashes and ampersands.
    const text = s.textContent.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/');
    for (const [url] of text.matchAll(URL_RE)) report({ kind: 'url', url });
  }
}

// Scan retry: an invisible layer over the middle of the page can hide a player that already loaded.
function clearCenter() {
  let n = 0;
  for (const el of document.elementsFromPoint(innerWidth / 2, innerHeight / 2)) {
    if (el.matches('video, iframe, body, html')) break;
    const pos = getComputedStyle(el).position;
    if ((pos === 'fixed' || pos === 'absolute') && el.innerText.trim().length < 20 && !el.querySelector('button, input, select, textarea, video')) {
      el.setAttribute('data-vsniff-hidden', '');
      el.style.setProperty('pointer-events', 'none', 'important');
      n++;
    }
  }
  if (n) send({ kind: 'blocked', what: 'overlay', url: location.href });
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  // The biggest video on screen, in page pixels, for the popup's preview screenshot.
  if (m.kind === 'videoRect') {
    let best = null;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const x = Math.max(r.left, 0), y = Math.max(r.top, 0);
      const w = Math.min(r.right, innerWidth) - x, h = Math.min(r.bottom, innerHeight) - y;
      if (w > 80 && h > 45 && (!best || w * h > best.w * best.h)) best = { x, y, w, h, vw: innerWidth };
    }
    return reply(best);
  }
  if (m.kind === 'rescan') {
    clearCenter();
    sent.clear(); // the list may have been cleared since; re-report everything
    scan();
  } else if (m.kind === 'restore') {
    for (const el of document.querySelectorAll('[data-vsniff-hidden]')) {
      el.style.removeProperty('pointer-events');
      el.removeAttribute('data-vsniff-hidden');
    }
  }
});

let timer;
const schedule = () => { timer ??= setTimeout(() => { timer = null; scan(); }, 1500); };
document.addEventListener('DOMContentLoaded', scan);
window.addEventListener('load', scan);
new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
