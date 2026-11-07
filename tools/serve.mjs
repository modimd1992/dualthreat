// Local dev server: `node tools/serve.mjs` then open http://localhost:8090
// - Serves this folder like GitHub Pages does (/join finds join.html).
// - Serves your local ModiDex folder (../Pokemon by default) at /_modidex/, so the game
//   uses your unpublished ModiDex comps. Set MODIDEX_DIR to point somewhere else.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODIDEX = resolve(process.env.MODIDEX_DIR || join(ROOT, '..', 'Pokemon'));
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > 0 ? process.argv[argPort + 1] : process.env.PORT || 8090);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

async function findFile(base, urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let p = join(base, safe);
  if (!p.startsWith(base)) return null;
  for (const candidate of [p, join(p, 'index.html'), `${p}.html`]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* next */ }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // Dev only: tools/make-images.html saves the share image and icon here.
  const save = url.pathname.match(/^\/_save\/(og|apple-touch-icon)\.png$/);
  if (req.method === 'PUT' && save) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await writeFile(join(ROOT, 'assets', `${save[1]}.png`), Buffer.concat(chunks));
    res.writeHead(200); res.end('saved'); return;
  }
  let base = ROOT, path = url.pathname;
  if (path.startsWith('/_modidex/')) { base = MODIDEX; path = path.slice('/_modidex'.length); }
  const file = await findFile(base, path);
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`ModiMatch running at http://localhost:${PORT}`);
  console.log(`ModiDex data from ${MODIDEX}/data/athletes.json (falls back to the live site if missing)`);
});
