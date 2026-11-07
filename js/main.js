// Main page: Daily Contest and Practice.
import { GAME, MODES, modeById } from './config.js';
import { loadData } from './data.js';
import { dailyQuestions, poolFor } from './daily.js';
import { maxPerQuestion, newState, resultCode, score } from './game.js';
import { mountQuestion, revealHtml } from './question.js';
import { shareText, share } from './share.js';
import {
  getPref, setPref, loadDaily, saveDaily, recordResult, statsFor,
  recentPractice, pushPractice, practiceBest, setPracticeBest,
} from './storage.js';
import { dailyBoard, initCloud, isRealUser, myDailyScore, onCloudChange, postDailyScore, cloudEnabled } from './cloud.js';
import { accountHtml, canPost, openDialog, toast, wireAccount } from './ui.js';
import { contestNumber, dateKey, esc, formatCountdown, secondsUntilNextDay } from './util.js';
import { CODE_EMOJI } from './game.js';

const app = document.getElementById('app');
let data = null;
let view = { kind: 'daily', modeId: 'all' };
let current = null; // mounted question controller
let today = dateKey();
let practice = { score: 0, played: 0, q: null, state: null };

// ---------- routing: #daily/nba, #practice/all, or just #nba ----------
function readHash() {
  const h = location.hash.replace(/^#/, '').toLowerCase();
  const [a, b] = h.split('/');
  if (a === 'practice' || a === 'daily') view = { kind: a, modeId: modeById(b || view.modeId).id };
  else if (MODES.some((m) => m.id === a)) view = { kind: 'daily', modeId: a };
  else view = { kind: getPref('kind', 'daily'), modeId: getPref('mode', 'all') };
}
function go(kind, modeId) {
  view = { kind, modeId };
  setPref('kind', kind); setPref('mode', modeId);
  history.replaceState(null, '', `#${kind}/${modeId}`);
  render();
}

function renderNav() {
  const kinds = document.getElementById('kinds');
  kinds.innerHTML = [['daily', '📅 Daily Contest'], ['practice', '🎯 Practice']].map(([k, label]) =>
    `<button class="kind-tab${view.kind === k ? ' is-active' : ''}" data-kind="${k}" aria-pressed="${view.kind === k}">${label}</button>`).join('');
  kinds.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => go(b.dataset.kind, view.modeId)));

  const modes = document.getElementById('modes');
  modes.style.setProperty('--n', MODES.length);
  modes.innerHTML = MODES.map((m) => {
    const g = loadDaily(today, m.id);
    const mark = view.kind === 'daily' && g?.finished ? `<span class="mark">✓</span>` : '';
    return `<button class="mode-tab${m.id === view.modeId ? ' is-active' : ''}" data-mode="${m.id}" aria-pressed="${m.id === view.modeId}">
      <span class="mode-emoji">${m.emoji}</span><span class="mode-label">${esc(m.short)}</span>${mark}</button>`;
  }).join('');
  modes.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => go(view.kind, b.dataset.mode)));
}

function render() {
  current?.destroy();
  current = null;
  renderNav();
  if (view.kind === 'practice') renderPractice();
  else renderDaily();
  window.scrollTo({ top: 0 });
}

const athletesFor = (mode) => data.athletes.filter((a) => mode.sports.includes(a.sport));

// ---------- Daily Contest ----------
function dailyGame(mode) {
  const qs = dailyQuestions(data.questions, mode, today);
  let g = loadDaily(today, mode.id);
  // Saved games keep their own question list, so a mid-day data update can't swap questions.
  if (!g) g = { ids: qs.map((q) => q.id), idx: 0, states: [], started: false, finished: false };
  const list = g.ids.map((id) => data.byId.get(id)).filter(Boolean);
  if (list.length !== g.ids.length) { g = { ids: qs.map((q) => q.id), idx: 0, states: [], started: false, finished: false }; }
  return { g, list: g.ids.map((id) => data.byId.get(id)) };
}
const maxFor = (n) => n * maxPerQuestion();
const totalScore = (g) => g.states.reduce((n, s) => n + score(s).total, 0);
const gridOf = (g) => g.states.map(resultCode).join('');

function renderDaily() {
  const mode = modeById(view.modeId);
  const { g, list } = dailyGame(mode);
  if (!list.length) { app.innerHTML = `<p class="loading">No clue sets for this sport yet.</p>`; return; }
  if (g.finished) return renderResults(mode, g);
  if (!g.started) return renderIntro(mode, g, list);
  playDailyQuestion(mode, g, list);
}

async function renderIntro(mode, g, list) {
  app.innerHTML = `
    <section class="panel intro">
      <p class="eyebrow">Daily Contest #${contestNumber(today)} · ${mode.emoji} ${esc(mode.label)}</p>
      <h2>${list.length} questions. Guess the athlete <em>and</em> the Pokémon.</h2>
      <ul class="intro-points">
        <li><b>1</b> point for the athlete, <b>1</b> for the Pokémon, <b>3</b> if you get both</li>
        <li>Answer on an earlier clue to multiply it: up to <b>×5</b></li>
        <li>3 guesses per box. Wrong guesses cost nothing.</li>
      </ul>
      <button class="btn btn-primary btn-block btn-big" data-start>Start · up to ${maxFor(list.length)} pts</button>
      <p class="small center" data-elsewhere></p>
    </section>`;
  app.querySelector('[data-start]').addEventListener('click', () => {
    g.started = true;
    saveDaily(today, mode.id, g);
    renderNav();
    playDailyQuestion(mode, g, list);
  });
  // Already played on another device? Show that instead of letting it be played twice.
  if (isRealUser()) {
    try {
      const posted = await myDailyScore(today, mode.id);
      const el = app.querySelector('[data-elsewhere]');
      if (posted && el) el.innerHTML = `You already scored <b>${posted.score}</b> today on another device. <button class="link-btn" data-board>See the leaderboard</button>`;
      el?.querySelector('[data-board]')?.addEventListener('click', () => openBoard(mode.id));
    } catch { /* offline */ }
  }
}

function playDailyQuestion(mode, g, list) {
  const i = g.idx;
  const q = list[i];
  const state = g.states[i] || (g.states[i] = newState(q));
  app.innerHTML = `
    <div class="run-bar"><span>${mode.emoji} Daily #${contestNumber(today)}</span><span>Score <b data-run>${totalScore(g)}</b></span></div>
    <div data-q></div>
    <div data-after></div>`;
  const after = app.querySelector('[data-after]');
  const showAfter = () => {
    after.innerHTML = `${revealHtml(q, state)}
      <button class="btn btn-primary btn-block btn-big" data-next>${i + 1 < list.length ? 'Next question ▸' : 'See my results'}</button>`;
    app.querySelector('[data-run]').textContent = totalScore(g);
    after.querySelector('[data-next]').addEventListener('click', () => {
      if (i + 1 < list.length) { g.idx = i + 1; saveDaily(today, mode.id, g); render(); }
      else finishDaily(mode, g);
    });
    after.querySelector('[data-next]').focus({ preventScroll: true });
    after.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  current = mountQuestion(app.querySelector('[data-q]'), {
    q, state, athletes: athletesFor(mode),
    label: `Question ${i + 1} of ${list.length}`,
    onChange: () => { saveDaily(today, mode.id, g); app.querySelector('[data-run]').textContent = totalScore(g); },
    onDone: showAfter,
  });
}

function finishDaily(mode, g) {
  g.finished = true;
  g.score = totalScore(g);
  g.grid = gridOf(g);
  saveDaily(today, mode.id, g);
  recordResult(mode.id, today, g.score, g.grid);
  document.dispatchEvent(new CustomEvent('modimatch:complete', { detail: { modeId: mode.id, date: today, score: g.score, grid: g.grid } }));
  render();
}

// Posts a finished daily score once the player is signed in with a username.
async function tryPost(mode, g) {
  if (!g.finished || g.posted || !canPost()) return null;
  try {
    const res = await postDailyScore(today, mode.id, g.score, g.grid);
    if (res) { g.posted = true; g.postedScore = res.score; saveDaily(today, mode.id, g); }
    return res;
  } catch (e) {
    console.warn('[leaderboard] could not post:', e);
    return null;
  }
}

function renderResults(mode, g) {
  const max = maxFor(g.ids.length);
  const grid = [...g.grid].map((c) => `<span class="sq sq-${c}" title="${{ B: 'Both', A: 'Athlete only', P: 'Pokémon only', X: 'Missed' }[c]}">${CODE_EMOJI[c]}</span>`).join('');
  const both = (g.grid.match(/B/g) || []).length;
  app.innerHTML = `
    <section class="panel results">
      <p class="eyebrow">Daily Contest #${contestNumber(today)} · ${mode.emoji} ${esc(mode.label)}</p>
      <p class="big-score"><b>${g.score}</b><span>/ ${max} pts</span></p>
      <p class="muted center">${both} of ${g.ids.length} connections made</p>
      <div class="grid-row">${grid}</div>
      <p class="small center">🟩 both · 🟦 athlete · 🟨 Pokémon · ⬜ missed</p>
      <button class="btn btn-primary btn-block btn-big" data-share>Share result</button>
      <div class="next-in">Next contest in <b data-countdown></b></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>Today's leaderboard</h3><button class="link-btn" data-refresh>Refresh</button></div>
      <div data-board><p class="muted">Loading…</p></div>
    </section>
    <section class="panel">
      <h3>Your answers</h3>
      <ol class="recap">${g.ids.map((id, i) => {
        const q = data.byId.get(id); const s = g.states[i]; const pts = s ? score(s).total : 0;
        return q ? `<li><span class="sq">${CODE_EMOJI[s ? resultCode(s) : 'X']}</span><span class="recap-names">${esc(q.athlete.name)} <span class="muted">⇄</span> ${esc(q.pokemon)}</span><b>+${pts}</b></li>` : '';
      }).join('')}</ol>
    </section>
    <div class="cta-row">
      <button class="btn btn-block" data-practice>🎯 Keep playing in Practice</button>
    </div>`;
  app.querySelector('[data-share]').addEventListener('click', async () => {
    const r = await share(shareText({ date: today, modeId: mode.id, score: g.score, grid: g.grid, max }));
    if (r === 'copied') toast('Result copied. Paste it anywhere!');
    else if (r === 'failed') toast("Couldn't copy. Try again.");
  });
  app.querySelector('[data-practice]').addEventListener('click', () => go('practice', mode.id));
  app.querySelector('[data-refresh]').addEventListener('click', () => fillBoard(app.querySelector('[data-board]'), mode, g));
  startCountdown(app.querySelector('[data-countdown]'));
  fillBoard(app.querySelector('[data-board]'), mode, g);
}

let countdownTimer = null;
function startCountdown(el) {
  clearInterval(countdownTimer);
  const tick = () => {
    if (!el.isConnected) { clearInterval(countdownTimer); return; }
    const s = secondsUntilNextDay();
    el.textContent = formatCountdown(s);
    if (dateKey() !== today) { today = dateKey(); render(); }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// Leaderboard table (results screen and the 🏆 dialog).
async function fillBoard(el, mode, g) {
  if (!cloudEnabled()) { el.innerHTML = `<p class="muted">The leaderboard isn't set up on this copy.</p>`; return; }
  await initCloud();
  if (g) await tryPost(mode, g);
  const prompt = !isRealUser()
    ? `<p class="board-cta">Sign in to put your score on the board. Same account as ModiDex. <button class="btn btn-small" data-signin>Sign in</button></p>`
    : !canPost() ? `<p class="board-cta">Pick a username to join the board. <button class="btn btn-small" data-signin>Pick one</button></p>` : '';
  try {
    const { rows, mine, total } = await dailyBoard(today, mode.id);
    const mineInTop = mine && rows.some((r) => r.uid === mine.uid);
    const row = (r) => `<li class="${mine && r.uid === mine.uid ? 'is-me' : ''}"><span class="rank">${r.rank}</span><span class="who">@${esc(r.handle)}</span><span class="grid-mini">${[...(r.grid || '')].map((c) => CODE_EMOJI[c] || '').join('')}</span><b>${r.score}</b></li>`;
    el.innerHTML = `${prompt}
      ${rows.length ? `<ol class="board">${rows.map(row).join('')}${mine && !mineInTop ? `<li class="gap">…</li>${row(mine)}` : ''}</ol>
        <p class="small">${total} player${total === 1 ? '' : 's'} today · ${esc(mode.label)}</p>`
        : `<p class="muted">No scores yet today. Be the first!</p>`}`;
  } catch (e) {
    console.warn('[leaderboard]', e);
    el.innerHTML = `${prompt}<p class="muted">The leaderboard couldn't load right now.</p>`;
  }
  el.querySelector('[data-signin]')?.addEventListener('click', openAccount);
}

function openBoard(modeId = view.modeId) {
  const mode = modeById(modeId);
  const dlg = openDialog('dlg-board', `🏆 Today · ${mode.emoji} ${esc(mode.label)}`, `
    <div class="seg" role="tablist">${MODES.map((m) => `<button class="seg-btn${m.id === mode.id ? ' is-active' : ''}" data-m="${m.id}">${m.emoji} ${esc(m.short)}</button>`).join('')}</div>
    <div data-board><p class="muted">Loading…</p></div>
    <p class="small">Daily Contest scores only. Practice doesn't count.</p>`);
  dlg.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => openBoard(b.dataset.m)));
  const g = loadDaily(today, mode.id);
  fillBoard(dlg.querySelector('[data-board]'), mode, g?.finished ? g : null);
}

// ---------- Practice ----------
function pickPractice(mode) {
  // Leave out today's unplayed Daily Contest questions so practice never spoils them.
  const spoilers = new Set();
  for (const m of MODES) {
    if (loadDaily(today, m.id)?.finished) continue;
    dailyQuestions(data.questions, m, today).forEach((q) => spoilers.add(q.id));
  }
  const all = poolFor(data.questions, mode);
  let pool = all.filter((q) => !spoilers.has(q.id));
  if (!pool.length) pool = all;
  const recent = recentPractice();
  const fresh = pool.filter((q) => !recent.includes(q.id) && q.id !== practice.q?.id);
  const from = fresh.length ? fresh : pool.filter((q) => q.id !== practice.q?.id);
  const list = from.length ? from : pool;
  return list[Math.floor(Math.random() * list.length)];
}

function renderPractice() {
  const mode = modeById(view.modeId);
  if (practice.modeId !== mode.id) practice = { score: 0, played: 0, q: null, state: null, modeId: mode.id };
  if (!practice.q || practice.state?.done) {
    practice.q = pickPractice(mode);
    practice.state = practice.q ? newState(practice.q) : null;
  }
  const { q, state } = practice;
  if (!q) { app.innerHTML = `<p class="loading">No clue sets for this sport yet.</p>`; return; }
  app.innerHTML = `
    <div class="run-bar"><span>🎯 Practice · ${mode.emoji} ${esc(mode.short)}</span><span>Score <b data-run>${practice.score}</b> · ${practice.played} played</span></div>
    <div data-q></div>
    <div data-after></div>`;
  current = mountQuestion(app.querySelector('[data-q]'), {
    q, state, athletes: athletesFor(mode),
    label: 'Practice · doesn\'t count',
    onDone: () => {
      const pts = score(state).total;
      practice.score += pts;
      practice.played += 1;
      pushPractice(q.id);
      const best = practiceBest();
      if (pts > best) setPracticeBest(pts);
      app.querySelector('[data-run]').textContent = practice.score;
      const after = app.querySelector('[data-after]');
      after.innerHTML = `${revealHtml(q, state)}<button class="btn btn-primary btn-block btn-big" data-next>Next question ▸</button>`;
      after.querySelector('[data-next]').addEventListener('click', () => render());
      after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
}

// ---------- dialogs ----------
function openHelp() {
  const dlg = openDialog('dlg-help', 'How to play', `
    <ol class="steps">
      <li><span class="step-n">1</span><div><b>Read the clues</b><p>Every clue describes an athlete <em>and</em> the Gen 1 Pokémon they play like. A new one appears every ${10} seconds, from vague to obvious. Tap <i>Next clue</i> if you can't wait.</p></div></li>
      <li><span class="step-n">2</span><div><b>Guess both</b><p>Type the athlete in one box and the Pokémon in the other. Lock in one and keep working on the other. 3 tries per box.</p></div></li>
      <li><span class="step-n">3</span><div><b>Bonus for both</b><p>1 point each, 3 for both. Earlier clues multiply it: clue 1 is ×5, so one question is worth up to 15.</p></div></li>
    </ol>
    <button class="btn btn-primary btn-block" data-ok>Let's play</button>`);
  dlg.querySelector('[data-ok]').addEventListener('click', () => dlg.close());
  setPref('seenHelp', true);
}

function openStats() {
  const rows = MODES.map((m) => {
    const s = statsFor(m.id);
    return `<tr><th>${m.emoji} ${esc(m.short)}</th><td>${s.played}</td><td>${s.avg}</td><td>${s.best}</td><td>${s.streak && s.lastDate === today ? s.streak : s.lastDate && contestNumber(today) - contestNumber(s.lastDate) === 1 ? s.streak : 0}</td></tr>`;
  }).join('');
  openDialog('dlg-stats', '📊 Your stats', `
    <table class="stats-table"><thead><tr><th></th><th>Played</th><th>Avg</th><th>Best</th><th>Streak</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small">Daily Contest results saved on this device. Best practice question: ${practiceBest()} pts.</p>`);
}

function openAccount() {
  const draw = () => {
    const dlg = openDialog('dlg-account', '👤 Account', accountHtml());
    wireAccount(dlg, draw);
  };
  draw();
}

// ---------- start ----------
async function start() {
  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.getElementById('btn-stats').addEventListener('click', openStats);
  document.getElementById('btn-account').addEventListener('click', openAccount);
  document.getElementById('btn-board').addEventListener('click', () => openBoard());
  if (GAME.feedbackUrl) document.getElementById('feedback-link').innerHTML = `<a href="${esc(GAME.feedbackUrl)}" target="_blank" rel="noopener">Feedback</a>`;

  readHash();
  try {
    data = await loadData();
  } catch (e) {
    app.innerHTML = `<p class="loading">Couldn't load the athletes from ModiDex. Check your connection and refresh.</p>`;
    console.error(e);
    return;
  }
  render();
  if (!getPref('seenHelp', false)) openHelp();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dateKey() !== today) { today = dateKey(); render(); }
  });

  initCloud();
  onCloudChange(async () => {
    const acct = document.getElementById('dlg-account');
    if (acct.open) { acct.querySelector('.dlg-body').innerHTML = accountHtml(); wireAccount(acct, openAccount); }
    // After signing in, post any finished daily scores from today.
    for (const m of MODES) {
      const g = loadDaily(today, m.id);
      if (g?.finished && !g.posted && canPost()) await tryPost(m, g);
    }
    const board = app.querySelector('[data-board]');
    if (board && view.kind === 'daily') {
      const g = loadDaily(today, view.modeId);
      if (g?.finished) fillBoard(board, modeById(view.modeId), g);
    }
  });
}

start();
