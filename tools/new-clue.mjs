// Starts a new clue set for an athlete.
//   node tools/new-clue.mjs judge
//   node tools/new-clue.mjs "cade cunningham"
//   node tools/new-clue.mjs --list nba          athletes in a sport with no clue set yet
//
// It adds a draft entry to the end of data/clues.json, with the athlete's ModiDex comp
// and playstyle notes for reference. Fill in the 5 clues and "why", delete the
// "draft": true line, then run: node tools/validate.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../js/util.js';
import { existsSync } from 'node:fs';
import { DATA } from '../js/config.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODIDEX = resolve(process.env.MODIDEX_DIR || join(ROOT, '..', 'Pokemon'));
const FILE = join(ROOT, 'data', 'clues.json');

async function loadAthletes() {
  const local = join(MODIDEX, 'data', 'athletes.json');
  if (existsSync(local)) return JSON.parse(await readFile(local, 'utf8')).athletes;
  return (await (await fetch(DATA.athletesUrl)).json()).athletes;
}

const args = process.argv.slice(2);
const athletes = (await loadAthletes()).filter((a) => ['NFL', 'NBA', 'MLB'].includes(a.sport));
const file = JSON.parse(await readFile(FILE, 'utf8'));
const have = new Set(file.sets.map((s) => s.athleteId));

if (args[0] === '--list') {
  const sport = (args[1] || '').toUpperCase();
  const left = athletes.filter((a) => !have.has(a.id) && (!sport || a.sport === sport));
  console.log(`${left.length} athlete(s) without a clue set${sport ? ` in ${sport}` : ''}:\n`);
  left.forEach((a) => console.log(`  ${a.name.padEnd(28)} ${a.comp?.name || ''}`));
  process.exit(0);
}

const q = normalize(args.join(' '));
if (!q) { console.log('Usage: node tools/new-clue.mjs <athlete name>   (or --list nba)'); process.exit(1); }
const matches = athletes.filter((a) => normalize(a.name).includes(q) || a.id.includes(q.replace(/ /g, '-')));
if (!matches.length) { console.log(`No athlete matches "${args.join(' ')}".`); process.exit(1); }
if (matches.length > 1 && !matches.some((a) => normalize(a.name) === q)) {
  console.log('More than one match. Be more specific:');
  matches.slice(0, 12).forEach((a) => console.log(`  ${a.name} (${a.sport}, ${a.teamAbbr})`));
  process.exit(1);
}
const a = matches.find((x) => normalize(x.name) === q) || matches[0];
if (have.has(a.id)) { console.log(`${a.name} already has a clue set. Edit it in data/clues.json (search for "${a.id}").`); process.exit(1); }

file.sets.push({
  athleteId: a.id,
  pokemon: a.comp.name,
  draft: true,
  clues: [
    'Clue 1: very vague. True of both, gives neither away.',
    'Clue 2: a little more specific.',
    'Clue 3: can hint at the type, evolution stage or signature trait.',
    'Clue 4: can name the {sport} and {position}.',
    'Clue 5: makes both gettable, e.g. wears #{number} for the {team}, plus an unmistakable trait.',
  ],
  why: '',
  _ref: `${a.name} · ${a.sport} ${a.position} · ${a.type}${a.type2 ? '/' + a.type2 : ''} · ${a.category}. Bio: ${a.bio} Comp: #${a.comp.dex} ${a.comp.name}: ${a.comp.why}`,
});
await writeFile(FILE, JSON.stringify(file, null, 2) + '\n');
console.log(`Added a draft for ${a.name} ⇄ ${a.comp.name} at the end of data/clues.json.`);
console.log('Fill in the clues and "why", delete the "draft": true line, then run: node tools/validate.mjs');
