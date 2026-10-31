// Runs in the page's own world at document_start. Reports to content-isolated.js via postMessage.
(() => {
  const TAG = '__vsniff';
  // Same list as types.js (test.js checks they match); content scripts can't rely on another file's globals.
  const MEDIA = /\.(mp4|m4v|mov|webm|m3u8|mpd)(\?|#|$)/i;
  const send = (m) => window.postMessage({ [TAG]: 1, ...m }, '*');
  const seen = (u) => {
    try {
      const url = new URL(String(u), location.href).href;
      if (MEDIA.test(url)) send({ kind: 'url', url });
    } catch {}
  };

  const f = window.fetch;
  window.fetch = function (input) {
    seen(input instanceof Request ? input.url : input);
    return f.apply(this, arguments);
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    seen(url);
    return open.apply(this, arguments);
  };

  // Blob/MediaSource players have no useful URL; flag the page so yt-dlp can be pointed at it.
  if (window.MediaSource) {
    const add = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function () {
      send({ kind: 'mse' });
      return add.apply(this, arguments);
    };
  }

  // 'encrypted' fires only when the media really is EME-protected (unlike requestMediaKeySystemAccess probes).
  window.addEventListener('encrypted', () => send({ kind: 'drm' }), true);
})();
