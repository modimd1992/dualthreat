// One question's state and scoring. Pure functions, no DOM.
//
// state = {
//   id,             athlete id of the question
//   shown,          clues revealed so far (1 = first clue)
//   a: { tries: [athleteId...], hit: clueNumber|null },
//   p: { tries: [pokemonName...], hit: clueNumber|null },
//   done,           true once the answer is revealed
// }
import { PLAY, multiplierAt } from './config.js';

export function newState(q) {
  return { id: q.id, shown: 1, a: { tries: [], hit: null }, p: { tries: [], hit: null }, done: false };
}

const box = (state, which) => (which === 'athlete' ? state.a : state.p);
export const boxOpen = (b) => b.hit == null && b.tries.length < PLAY.attempts;
export const triesLeft = (b) => PLAY.attempts - b.tries.length;

// Is the guess right? Athletes by id, Pokémon by exact name.
export function isRight(q, which, value) {
  return which === 'athlete' ? value === q.id : value === q.pokemon;
}

// Records a guess. Returns 'hit', 'miss' or null (ignored: box closed or repeat).
export function guess(state, q, which, value) {
  const b = box(state, which);
  if (state.done || !boxOpen(b) || b.tries.includes(value)) return null;
  b.tries.push(value);
  if (isRight(q, which, value)) { b.hit = state.shown; return 'hit'; }
  return 'miss';
}

// Nothing left to guess: both boxes are locked or out of tries.
export const bothClosed = (state) => !boxOpen(state.a) && !boxOpen(state.p);

// Points for a finished (or in-progress) question.
// Athlete = 1 × multiplier when you got it, Pokémon the same, and the bonus point
// uses the multiplier of whichever you got second (that's when you made the connection).
export function score(state) {
  const ma = state.a.hit ? multiplierAt(state.a.hit) : 0;
  const mp = state.p.hit ? multiplierAt(state.p.hit) : 0;
  const athlete = ma * PLAY.athletePts;
  const pokemon = mp * PLAY.pokemonPts;
  const bonus = ma && mp ? Math.min(ma, mp) * PLAY.bonusPts : 0;
  return { athlete, pokemon, bonus, total: athlete + pokemon + bonus };
}

// What each answer is worth right now, for the "points available" line.
export function available(shown) {
  const m = multiplierAt(shown);
  return {
    mult: m,
    athlete: m * PLAY.athletePts,
    pokemon: m * PLAY.pokemonPts,
    both: m * (PLAY.athletePts + PLAY.pokemonPts + PLAY.bonusPts),
  };
}
export const maxPerQuestion = () => available(1).both;

// One letter per question for the share grid and leaderboard: B both, A athlete, P Pokémon, X none.
export function resultCode(state) {
  const a = !!state.a.hit, p = !!state.p.hit;
  return a && p ? 'B' : a ? 'A' : p ? 'P' : 'X';
}
export const CODE_EMOJI = { B: '🟩', A: '🟦', P: '🟨', X: '⬜' };
