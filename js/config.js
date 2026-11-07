// Game-wide settings. Most things you'd want to tweak live here.

export const GAME = {
  name: 'ModiMatch',
  tagline: 'Guess the athlete and their Gen 1 comp',
  hashtag: '#ModiMatch',
  // The live address, used in share text. Change it when the domain is set up.
  siteUrl: 'playmodimatch.com',
  // The sister site, linked in the header menu and footer.
  sisterUrl: 'https://playmodidex.com',
  sisterName: 'ModiDex',
  // Where the footer's Feedback link goes. null hides it.
  feedbackUrl: 'https://forms.gle/tth2EbPTuCr1Bf1HA',
  // Daily Contest #1 is this date. Changing it renumbers every contest.
  launchDate: '2026-11-06',
  // New daily contests at midnight in this time zone (same as ModiDex).
  timeZone: 'America/New_York',
  questionsPerDay: 10,
  storagePrefix: 'modimatch:v1',
};

// Where the athlete data comes from. ModiDex owns it; this site only reads it.
// On your computer, `node tools/serve.mjs` also serves your local ModiDex folder at
// /_modidex/, and the game reads that first, so you can test new comps before
// publishing ModiDex. On the live site that path doesn't exist and it uses ModiDex live.
export const DATA = {
  athletesUrl: 'https://playmodidex.com/data/athletes.json',
  localAthletesUrl: '/_modidex/data/athletes.json',
  cluesUrl: './data/clues.json',
};

// Timing and scoring.
export const PLAY = {
  clueSeconds: 10,     // a new clue every 10 seconds (or tap "Next clue")
  finalSeconds: 20,    // after the last clue, this long to finish before the reveal
  attempts: 3,         // wrong guesses allowed per box
  athletePts: 1,
  pokemonPts: 1,
  bonusPts: 1,         // extra point for getting both (1 + 1 + 1 = 3)
};

// Points multiplier by the clue you answer on: clue 1 ×5, clue 2 ×4 ... clue 5+ ×1.
export const multiplierAt = (cluesShown) => Math.max(1, 6 - cluesShown);

export const SPORTS = {
  NFL: { label: 'NFL', emoji: '🏈' },
  NBA: { label: 'NBA', emoji: '🏀' },
  MLB: { label: 'MLB', emoji: '⚾' },
};

export const MODES = [
  { id: 'all', label: 'All Sports', short: 'ALL', emoji: '🌐', sports: ['NFL', 'NBA', 'MLB'] },
  { id: 'nfl', label: 'NFL', short: 'NFL', emoji: '🏈', sports: ['NFL'] },
  { id: 'nba', label: 'NBA', short: 'NBA', emoji: '🏀', sports: ['NBA'] },
  { id: 'mlb', label: 'MLB', short: 'MLB', emoji: '⚾', sports: ['MLB'] },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

// Full position names for the {position} clue token.
export const POSITION_NAMES = {
  NFL: {
    QB: 'quarterback', RB: 'running back', FB: 'fullback', WR: 'wide receiver', TE: 'tight end',
    OT: 'offensive tackle', OG: 'guard', C: 'center', DE: 'defensive end', DT: 'defensive tackle',
    EDGE: 'edge rusher', LB: 'linebacker', CB: 'cornerback', S: 'safety', K: 'kicker', P: 'punter',
  },
  NBA: {
    PG: 'point guard', SG: 'shooting guard', SF: 'small forward', PF: 'power forward',
    C: 'center', G: 'guard', F: 'forward',
  },
  MLB: {
    SP: 'starting pitcher', RP: 'relief pitcher', CP: 'closer', C: 'catcher', '1B': 'first baseman',
    '2B': 'second baseman', '3B': 'third baseman', SS: 'shortstop', LF: 'left fielder',
    CF: 'center fielder', RF: 'right fielder', DH: 'designated hitter', TWP: 'two-way player',
  },
};
