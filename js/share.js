// Spoiler-free share text: one square per question.
import { GAME, modeById } from './config.js';
import { CODE_EMOJI } from './game.js';
import { contestNumber } from './util.js';

export function shareText({ date, modeId, score, grid, max }) {
  const mode = modeById(modeId);
  const squares = [...grid].map((c) => CODE_EMOJI[c] || '⬜');
  const rows = [];
  for (let i = 0; i < squares.length; i += 5) rows.push(squares.slice(i, i + 5).join(''));
  return [
    `${GAME.name} #${contestNumber(date)} · ${mode.emoji} ${mode.label}`,
    `${score}/${max} pts`,
    ...rows,
    '🟩 both · 🟦 athlete · 🟨 Pokémon',
    GAME.siteUrl,
  ].join('\n');
}

export async function share(text) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
