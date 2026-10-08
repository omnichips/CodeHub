// A small static file server that behaves like the real host: directories get index.html, and /app redirects to /app/
// (the hub's vercel.json sets trailingSlash). Used for local preview and by the tests.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.txt': 'text/plain',
};

export function serve(dir, port = 0) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = resolve(join(root, decodeURIComponent(url.pathname)));
    if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
    try {
      if (statSync(file).isDirectory()) {
        if (!url.pathname.endsWith('/')) return res.writeHead(308, { location: url.pathname + '/' + url.search }).end();
        file = join(file, 'index.html');
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(file));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((ok) =>
    server.listen(port, '127.0.0.1', () =>
      ok({
        port: server.address().port,
        close: () => new Promise((done) => (server.closeAllConnections(), server.close(done))),
      }),
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'dist', port = '4180'] = process.argv.slice(2);
  const { port: p } = await serve(dir, Number(port));
  console.log(`Serving ${dir} at http://localhost:${p}/`);
}
