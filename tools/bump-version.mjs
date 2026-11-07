// Stamps a new version on every script and stylesheet in the site's pages, so browsers
// never mix an old cached file with a new one after you push code.
//   node tools/bump-version.mjs
// Run it after changing anything in js/ or css/ (clue-only changes don't need it).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const modules = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).sort();
const map = { imports: Object.fromEntries(modules.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) };
const mapTag = `<script type="importmap">\n${JSON.stringify(map, null, 2)}\n  </script>`;

for (const page of ['index.html', 'host.html', 'join.html', 'privacy.html']) {
  const file = join(root, page);
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  // Put the import map right before the first module script.
  html = html.replace(/(\s*)<script type="module"/, `$1${mapTag}$1<script type="module"`);
  html = html.replace(/(<script type="module" src="js\/\w+\.js)[^"]*"/g, `$1?v=${v}"`);
  html = html.replace(/href="css\/(\w+)\.css[^"]*"/g, `href="css/$1.css?v=${v}"`);
  writeFileSync(file, html);
}
console.log(`Version ${v} stamped on ${modules.length} scripts and the stylesheets in 4 pages.`);
