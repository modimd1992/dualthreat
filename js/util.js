// Small shared helpers: dates in the game's time zone, seeded randomness, text.
// No DOM here, so the Node tools can import this file too.
import { GAME } from './config.js';

function partsIn(d, tz) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

// Calendar date "YYYY-MM-DD" in the game's time zone (Eastern by default).
export function dateKey(d = new Date(), tz = GAME.timeZone) {
  const p = partsIn(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

// Seconds until the next contest (next midnight in the game's time zone), DST-safe.
export function secondsUntilNextDay(now = new Date(), tz = GAME.timeZone) {
  const p = partsIn(now, tz);
  const today = `${p.year}-${p.month}-${p.day}`;
  let s = 86400 - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second));
  const at = (sec) => dateKey(new Date(now.getTime() + sec * 1000), tz);
  if (at(s - 1) !== today) s -= 3600;
  else if (at(s) === today) s += 3600;
  return Math.max(0, s);
}

export function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
export const contestNumber = (key) => dayIndex(key) - dayIndex(GAME.launchDate) + 1;

// FNV-1a string hash -> 32-bit seed.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(list, seed) {
  const out = [...list];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Lowercase, no accents or punctuation: "Nidoran♀" -> "nidoran", "Farfetch'd" -> "farfetchd".
export function normalize(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export function formatCountdown(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
