// Picks each day's Daily Contest questions: the same for everyone, no server needed.
// Each mode walks a shuffled deck of its clue sets, so nobody repeats until the whole
// pool has been used. Within one day there's never the same athlete or Pokémon twice
// (skipped sets wait for the next day).
import { GAME } from './config.js';
import { contestNumber, hashString, seededShuffle } from './util.js';

const cache = new Map();

export function poolFor(questions, mode) {
  return questions.filter((q) => mode.sports.includes(q.sport)).sort((x, y) => x.id.localeCompare(y.id));
}

export function dailyQuestions(questions, mode, key, n = GAME.questionsPerDay) {
  const pool = poolFor(questions, mode);
  const day = contestNumber(key) - 1;
  if (!pool.length || day < 0) return [];
  const count = Math.min(n, pool.length);
  const cacheKey = `${mode.id}|${pool.map((q) => q.id).join(',')}|${count}`;
  let memo = cache.get(cacheKey);
  if (!memo) { memo = { days: [], deck: [], cycle: 0, carry: [] }; cache.set(cacheKey, memo); }

  // Each pass through the pool is shuffled. With several sports (All Sports), the deck
  // alternates between them, so a day gets a fair mix instead of six of one sport.
  const shuffleDeck = (seed) => {
    if (mode.sports.length < 2) return seededShuffle(pool, seed);
    const bySport = seededShuffle(mode.sports, seed).map((s, i) => seededShuffle(pool.filter((q) => q.sport === s), seed + i + 1));
    const out = [];
    for (let i = 0; bySport.some((l) => i < l.length); i++) bySport.forEach((l) => { if (i < l.length) out.push(l[i]); });
    return out;
  };
  const draw = () => {
    if (!memo.deck.length) {
      // Yesterday's questions go to the back of a fresh deck, so they never come right back.
      const recent = new Set(memo.days[memo.days.length - 1] || []);
      const deck = shuffleDeck(hashString(`${GAME.name}:${mode.id}:${memo.cycle++}`));
      memo.deck = [...deck.filter((q) => !recent.has(q.id)), ...deck.filter((q) => recent.has(q.id))];
    }
    return memo.deck.shift();
  };
  while (memo.days.length <= day) {
    const today = [];
    const fits = (q) => !today.some((t) => t.id === q.id || t.pokemon === q.pokemon);
    const waiting = memo.carry;
    memo.carry = [];
    for (const q of waiting) (today.length < count && fits(q) ? today : memo.carry).push(q);
    let guard = 0;
    while (today.length < count && guard++ < count * 6) {
      const q = draw();
      (fits(q) ? today : memo.carry).push(q);
    }
    memo.days.push(today.map((q) => q.id));
  }
  const ids = memo.days[day];
  const byId = new Map(pool.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id));
}

// How many days each mode can go before a question repeats (for the validator).
export const freshDays = (poolSize, n = GAME.questionsPerDay) => Math.floor(poolSize / Math.max(1, Math.min(n, poolSize)));
