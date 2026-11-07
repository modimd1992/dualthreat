// Turns clue sets (data/clues.json) + ModiDex athletes into playable questions,
// and checks clue sets for mistakes. No DOM, so tools/validate.mjs uses it too.
import { POSITION_NAMES, SPORTS } from './config.js';
import { GEN1 } from './gen1.js';
import { normalize } from './util.js';

// Tokens a clue can use. They're filled from ModiDex's live data, so a trade or a
// new jersey number never makes a clue wrong.
export const TOKENS = {
  sport: (a) => a.sport,
  team: (a) => a.team,
  position: (a) => POSITION_NAMES[a.sport]?.[a.position] || a.position,
  number: (a) => String(a.number ?? ''),
  division: (a) => (a.sport === 'NBA' ? `${a.division} Division` : `${a.league} ${a.division}`),
};

export function fillTokens(text, athlete) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => (TOKENS[key] ? TOKENS[key](athlete) : m));
}

const dexOf = (name) => GEN1.indexOf(name) + 1;

// A question = one clue set joined to its athlete. Returns { questions, problems }.
// Sets with problems (unknown athlete, changed comp, too few clues) are left out.
export function buildQuestions(athletes, sets) {
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const questions = [];
  const problems = [];
  const seen = new Set();
  for (const s of sets || []) {
    if (!s || s.draft) continue;
    const id = s.athleteId;
    const a = byId.get(id);
    if (seen.has(id)) { problems.push(`${id}: listed twice (only the first is used)`); continue; }
    seen.add(id);
    if (!a) { problems.push(`${id}: no athlete with this id in ModiDex`); continue; }
    if (!SPORTS[a.sport]) continue;
    if (!a.comp?.name) { problems.push(`${id}: athlete has no comp in ModiDex`); continue; }
    if (s.pokemon !== a.comp.name) {
      problems.push(`${id}: clues were written for ${s.pokemon}, but ModiDex now says ${a.comp.name}. Update "pokemon" and the clues.`);
      continue;
    }
    const clues = (s.clues || []).filter((c) => String(c).trim());
    if (clues.length < 3) { problems.push(`${id}: needs at least 3 clues`); continue; }
    questions.push({
      id,
      athlete: a,
      sport: a.sport,
      pokemon: a.comp.name,
      dex: a.comp.dex || dexOf(a.comp.name),
      clues: clues.map((c) => fillTokens(c, a)),
      why: fillTokens(s.why || a.comp.why || '', a),
    });
  }
  return { questions, problems };
}

// Words that would give the sport or position away too early.
const SPORT_WORDS = /\b(nfl|nba|mlb|football|basketball|baseball|quarterback|touchdowns?|dunks?|home runs?|homers?|pitcher|innings?|hoops?|gridiron|end zone|three-pointers?|rebounds?)\b/i;
const TYPE_WORDS = /\b(normal|fire|water|electric|grass|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy)[- ]types?\b/i;

// Style checks for one clue set against its athlete. Returns { errors, warnings }.
export function lintSet(s, athlete) {
  const errors = [];
  const warnings = [];
  const id = s.athleteId;
  const clues = s.clues || [];
  if (clues.length < 4 || clues.length > 5) warnings.push(`${id}: has ${clues.length} clues (aim for 4–5)`);
  if (!s.why) warnings.push(`${id}: no "why" (the ModiDex comp reason is shown instead)`);
  if (!athlete) return { errors, warnings };

  // Name parts (3+ letters) and the Pokémon must never appear. Nickname words are
  // often ordinary words ("Greek", "Smile"), so those are only flagged early on.
  const words3 = (n) => normalize(n).split(' ').filter((w) => w.length >= 3 && !['jr', 'iii', 'the', 'mr'].includes(w));
  const nameWords = new Set(words3(athlete.name));
  const aliasWords = new Set((athlete.aliases || []).flatMap(words3).filter((w) => !nameWords.has(w)));
  const poke = normalize(s.pokemon || '');
  // The team nickname ("Thunder", "Red Sox"): use {team} instead, so trades don't break clues.
  const teamWords = normalize(athlete.team || '').split(' ').slice(-1).filter((w) => w.length >= 3);

  clues.forEach((raw, i) => {
    const n = i + 1;
    const text = String(raw);
    const plain = normalize(text.replace(/\{\w+\}/g, ' '));
    const words = new Set(plain.split(' '));
    for (const w of nameWords) if (words.has(w)) errors.push(`${id} clue ${n}: uses "${w}" from the athlete's name`);
    if (n <= 3) for (const w of aliasWords) if (words.has(w)) warnings.push(`${id} clue ${n}: uses "${w}" from a nickname`);
    if (poke && (` ${plain} `).includes(` ${poke} `)) errors.push(`${id} clue ${n}: names the Pokémon`);
    for (const w of teamWords) if (words.has(w)) warnings.push(`${id} clue ${n}: mentions "${w}" from the team name. Use {team} so trades don't break it.`);
    for (const t of text.match(/\{(\w+)\}/g) || []) {
      if (!TOKENS[t.slice(1, -1)]) errors.push(`${id} clue ${n}: unknown token ${t}`);
    }
    if (text.length > 140) warnings.push(`${id} clue ${n}: long (${text.length} characters)`);
    if (n <= 2) {
      if (/\{(sport|team|position|number|division)\}/.test(text)) warnings.push(`${id} clue ${n}: uses a token this early; it may give the answer away`);
      if (SPORT_WORDS.test(text)) warnings.push(`${id} clue ${n}: names the sport or position this early`);
      if (TYPE_WORDS.test(text)) warnings.push(`${id} clue ${n}: names a type this early`);
    }
  });
  if (s.why && String(s.why).length > 260) warnings.push(`${id}: "why" is long`);
  return { errors, warnings };
}
