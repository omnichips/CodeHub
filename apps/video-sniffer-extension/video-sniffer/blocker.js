// Popup and overlay blocker, in the page's own world at document_start, all frames.
// background.js registers it for every site except the ones switched off in the popup.
// Precise on purpose: it only acts when a window is about to open without a real click on something meant to be clicked.
(() => {
  const TAG = '__vsniff';
  const report = (what, url) => window.postMessage({ [TAG]: 1, kind: 'blocked', what, url: String(url ?? '') }, '*');
  const newWindow = (target) => !!target && !/^_(self|top|parent)$/i.test(target);
  let last = { t: 0, el: null }; // last real pointer press or key press

  const remember = (e) => { if (e.isTrusted) last = { t: Date.now(), el: e.target }; };
  addEventListener('pointerdown', remember, true);
  addEventListener('keydown', remember, true);

  function covers(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return b.width * b.height > 0 && w > 0 && h > 0 && w * h >= 0.5 * b.width * b.height;
  }

  // An element nobody means to click: positioned, covering most of the screen or a player, no text, no controls.
  function overlayOf(el) {
    for (let n = el, k = 0; n instanceof Element && k < 4; n = n.parentElement, k++) {
      if (n.matches('html, body, video')) return null;
      const pos = getComputedStyle(n).position;
      if (pos !== 'fixed' && pos !== 'absolute') continue;
      const r = n.getBoundingClientRect();
      const big = r.width * r.height >= 0.5 * innerWidth * innerHeight;
      const overPlayer = [...document.querySelectorAll('video, iframe')].some((v) => !n.contains(v) && covers(r, v.getBoundingClientRect()));
      if ((big || overPlayer) && (n.innerText ?? '').trim().length < 20 && !n.querySelector('button, input, select, textarea, video')) return n;
    }
    return null;
  }

  const recent = () => Date.now() - last.t < 1000 && last.el instanceof Element;
  const meant = () => recent() && !last.el.matches('html, body, video') && !overlayOf(last.el);

  // First block: stop the overlay catching clicks. If it catches one again, the page reset it, so remove it.
  function block(what, url) {
    report(what, url);
    const o = recent() && overlayOf(last.el);
    if (!o) return;
    if (o.hasAttribute('data-vsniff-hidden')) o.remove();
    else {
      o.setAttribute('data-vsniff-hidden', '');
      o.style.setProperty('pointer-events', 'none', 'important');
    }
    report('overlay', location.href);
  }

  const open = window.open;
  window.open = function (url, target) {
    if (meant() || (target && !newWindow(target))) return open.apply(this, arguments);
    block('popup', url);
    return null;
  };

  // Links that open a new window: allow real clicks on real links, and script clicks right after one.
  const linkAllowed = (a, trusted) => trusted ? !overlayOf(a) : meant();
  addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[href]');
    if (!a || !newWindow(a.target) || linkAllowed(a, e.isTrusted)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    block('link', a.href);
  }, true);

  // Forms that submit into a new window: same rule as links.
  addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || !newWindow(f.target) || (e.isTrusted ? !overlayOf(f) : meant())) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    block('form', f.action);
  }, true);
  const submit = HTMLFormElement.prototype.submit; // form.submit() fires no submit event
  HTMLFormElement.prototype.submit = function () {
    if (newWindow(this.target) && !meant()) return block('form', this.action);
    return submit.apply(this, arguments);
  };

  // Script clicks on links that were never added to the page do not reach the listener above.
  const isLoneLink = (el) => el instanceof HTMLAnchorElement && !el.isConnected && newWindow(el.target);
  const click = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (isLoneLink(this) && !meant()) return block('link', this.href);
    return click.apply(this, arguments);
  };
  const dispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev?.type === 'click' && isLoneLink(this) && !meant()) { block('link', this.href); return false; }
    return dispatch.apply(this, arguments);
  };
})();
