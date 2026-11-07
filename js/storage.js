// Saves in the browser (localStorage): daily games in progress, results and stats.
import { GAME } from './config.js';
import { dayIndex } from './util.js';

const P = GAME.storagePrefix;
function read(key, fallback) {
  try { const v = localStorage.getItem(`${P}:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(`${P}:${key}`, JSON.stringify(value)); } catch { /* full or blocked */ }
}

export const getPref = (k, d) => read(`pref:${k}`, d);
export const setPref = (k, v) => write(`pref:${k}`, v);

// A daily game: { ids: [questionIds], idx, states: [...], finished, score, grid, posted }
export const loadDaily = (date, modeId) => read(`daily:${modeId}@${date}`, null);
export const saveDaily = (date, modeId, game) => write(`daily:${modeId}@${date}`, game);

// Finished results per mode: { [date]: { score, grid } }
export function recordResult(modeId, date, score, grid) {
  const all = read(`results:${modeId}`, {});
  all[date] = { score, grid };
  write(`results:${modeId}`, all);
}

export function statsFor(modeId) {
  const all = read(`results:${modeId}`, {});
  const dates = Object.keys(all).sort();
  const scores = dates.map((d) => all[d].score);
  let streak = 0, best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev != null && dayIndex(d) - dayIndex(prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  streak = run;
  return {
    played: dates.length,
    best: scores.length ? Math.max(...scores) : 0,
    avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    bothTotal: dates.reduce((n, d) => n + (all[d].grid.match(/B/g) || []).length, 0),
    streak, bestStreak: best, lastDate: prev,
    recent: dates.slice(-7).map((d) => ({ date: d, ...all[d] })),
  };
}

// Practice: remember recent questions so practice doesn't repeat too soon.
export const recentPractice = () => read('practice:recent', []);
export function pushPractice(id, keep = 30) {
  const r = recentPractice().filter((x) => x !== id);
  r.push(id);
  write('practice:recent', r.slice(-keep));
}
export const practiceBest = () => read('practice:best', 0);
export const setPracticeBest = (n) => write('practice:best', n);
