// Loads ModiDex's athlete data (the shared source) and this site's clue sets.
import { DATA, SPORTS } from './config.js';
import { buildQuestions } from './clueset.js';
import { GAME } from './config.js';

const CACHE_KEY = `${GAME.storagePrefix}:athleteCache`;
const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Only the fields this site needs, so a cached copy stays small.
const slim = (a) => ({
  id: a.id, name: a.name, aliases: a.aliases, sport: a.sport, league: a.league, division: a.division,
  team: a.team, teamAbbr: a.teamAbbr, position: a.position, number: a.number,
  type: a.type, type2: a.type2, category: a.category, comp: a.comp,
});

// ModiDex data, newest first: local ModiDex server (when testing on this computer),
// then the live site, then the last copy this browser saw (if both are down).
async function loadAthletes() {
  const sources = [];
  const override = new URLSearchParams(location.search).get('data');
  if (override === 'live') sources.push(DATA.athletesUrl);
  else {
    if (isLocalHost()) sources.push(DATA.localAthletesUrl);
    sources.push(DATA.athletesUrl);
  }
  for (const url of sources) {
    try {
      const file = await getJson(url, url === DATA.localAthletesUrl ? 1500 : 8000);
      const athletes = (file.athletes || []).filter((a) => SPORTS[a.sport]).map(slim);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ athletes, dataAsOf: file.dataAsOf })); } catch { /* full or blocked */ }
      return { athletes, dataAsOf: file.dataAsOf, source: url };
    } catch (e) {
      if (url !== DATA.localAthletesUrl) console.warn(`[data] could not load ${url}:`, e);
    }
  }
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached?.athletes?.length) return { ...cached, source: 'cache' };
  } catch { /* none */ }
  throw new Error('Could not load athlete data from ModiDex.');
}

export async function loadData() {
  const [ath, clueFile] = await Promise.all([loadAthletes(), getJson(DATA.cluesUrl)]);
  const { questions, problems } = buildQuestions(ath.athletes, clueFile.sets);
  if (problems.length) console.warn(`[clues.json] ${problems.length} clue set(s) skipped:\n` + problems.join('\n'));
  return {
    athletes: ath.athletes,
    questions,
    byId: new Map(questions.map((q) => [q.id, q])),
    dataAsOf: ath.dataAsOf,
    source: ath.source,
  };
}
