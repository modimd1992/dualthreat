// Checks data/clues.json against ModiDex's athlete data.
//   node tools/validate.mjs                 check everything
//   node tools/validate.mjs --show <name>   print one set with tokens filled in
//   node tools/validate.mjs --today         today's Daily Contest questions (spoilers!)
//
// Athlete data comes from your local ModiDex folder (../Pokemon) if it's there,
// otherwise from the live site, the same as the game.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, MODES, GAME } from '../js/config.js';
import { buildQuestions, lintSet, fillTokens } from '../js/clueset.js';
import { dailyQuestions, poolFor, freshDays } from '../js/daily.js';
import { dateKey, normalize } from '../js/util.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODIDEX = resolve(process.env.MODIDEX_DIR || join(ROOT, '..', 'Pokemon'));
const args = process.argv.slice(2);

export async function loadAthletes() {
  const local = join(MODIDEX, 'data', 'athletes.json');
  if (existsSync(local)) return { athletes: JSON.parse(await readFile(local, 'utf8')).athletes, from: local };
  const res = await fetch(DATA.athletesUrl);
  return { athletes: (await res.json()).athletes, from: DATA.athletesUrl };
}

const { athletes, from } = await loadAthletes();
const clueFile = JSON.parse(await readFile(join(ROOT, 'data', 'clues.json'), 'utf8'));
const sets = clueFile.sets || [];
const byId = new Map(athletes.map((a) => [a.id, a]));

if (args[0] === '--show') {
  const q = normalize(args.slice(1).join(' '));
  const s = sets.find((x) => x.athleteId.includes(q.replace(/ /g, '-')) || normalize(byId.get(x.athleteId)?.name || '').includes(q));
  if (!s) { console.log('No clue set matches that.'); process.exit(1); }
  const a = byId.get(s.athleteId);
  console.log(`\n${a?.name} ⇄ ${s.pokemon}  (${s.athleteId})\n`);
  s.clues.forEach((c, i) => console.log(`  ${i + 1}. ${a ? fillTokens(c, a) : c}`));
  console.log(`\n  Why: ${a ? fillTokens(s.why || '', a) : s.why}\n`);
  process.exit(0);
}

const { questions, problems } = buildQuestions(athletes, sets);
let errors = [...problems];
let warnings = [];
for (const s of sets) {
  if (s.draft) continue;
  const r = lintSet(s, byId.get(s.athleteId));
  errors = errors.concat(r.errors);
  warnings = warnings.concat(r.warnings);
}
const drafts = sets.filter((s) => s.draft);

if (args[0] === '--today') {
  const key = dateKey();
  console.log(`\nDaily Contest for ${key} (spoilers!)\n`);
  for (const m of MODES) {
    console.log(`${m.emoji} ${m.label}`);
    dailyQuestions(questions, m, key).forEach((q, i) => console.log(`  ${i + 1}. ${q.athlete.name} ⇄ ${q.pokemon}`));
  }
  process.exit(0);
}

console.log(`\nAthletes from: ${from}`);
console.log(`Clue sets: ${sets.length} (${questions.length} playable${drafts.length ? `, ${drafts.length} drafts` : ''})\n`);
for (const m of MODES) {
  const n = poolFor(questions, m).length;
  console.log(`  ${m.emoji} ${m.label.padEnd(10)} ${String(n).padStart(3)} sets · about ${freshDays(n)} day(s) of Daily Contests before questions repeat`);
}
if (drafts.length) console.log(`\nDrafts (not in the game yet): ${drafts.map((d) => d.athleteId).join(', ')}`);
if (warnings.length) console.log(`\n⚠️  ${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
if (errors.length) {
  console.log(`\n❌ ${errors.length} problem(s) to fix:\n  ${errors.join('\n  ')}\n`);
  process.exit(1);
}
console.log(`\n✅ No problems found.${GAME.questionsPerDay ? '' : ''}\n`);
