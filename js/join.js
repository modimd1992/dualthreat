// A viewer's phone in Host Mode: join with the room code, answer each question as the
// host reveals clues, and see your score and rank.
import { loadData } from './data.js';
import { modeById } from './config.js';
import { newState, resultCode, score } from './game.js';
import { mountQuestion, revealHtml } from './question.js';
import { isLocal, roomApi, standings } from './room.js';
import { initCloud, myHandle, isRealUser } from './cloud.js';
import { toast } from './ui.js';
import { esc } from './util.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const rooms = roomApi();
let data = null;
let code = null;
let room = null;
let me = null;          // my player row
let players = [];
let ctrl = null;        // mounted question
let mountedQ = null;    // question index that's mounted
const states = {};      // my per-question state, by question index

const saveKey = () => `dualthreat:join:${code}`;
const saveLocal = () => sessionStorage.setItem(saveKey(), JSON.stringify({ states }));

function renderJoin(msg = '') {
  const params = new URLSearchParams(location.search);
  const preCode = (params.get('code') || location.hash.slice(1) || '').toUpperCase().slice(0, 4);
  const lastName = localStorage.getItem('dualthreat:joinName') || myHandle() || '';
  app.innerHTML = `
    <section class="panel join-panel">
      <p class="eyebrow">Playing along with a stream?</p>
      <h2>Join a game</h2>
      ${isLocal() ? '<p class="small">🧪 Local test mode</p>' : ''}
      <form id="join">
        <label class="field"><span>Room code</span>
          <input name="code" required maxlength="4" minlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(preCode)}" class="code-input" placeholder="ABCD"></label>
        <label class="field"><span>Your name on the leaderboard</span>
          <input name="name" required maxlength="16" autocomplete="nickname" value="${esc(lastName)}" placeholder="Name"></label>
        <button class="btn btn-primary btn-block btn-big" type="submit">Join</button>
      </form>
      ${msg ? `<p class="form-msg">${esc(msg)}</p>` : ''}
      <p class="small">No account needed. Keep it friendly: the host can remove names.</p>
    </section>`;
  app.querySelector('#join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const c = String(f.get('code')).trim().toUpperCase();
    const name = String(f.get('name')).trim().slice(0, 16);
    if (!/^[A-Z]{4}$/.test(c) || !name) return;
    e.target.querySelector('button').disabled = true;
    try {
      const r = await rooms.getRoom(c);
      if (!r || r.phase === 'closed') { renderJoin(`No game with code ${c}. Check the code on stream.`); return; }
      localStorage.setItem('dualthreat:joinName', name);
      code = c;
      const uid = await rooms.uid();
      if (r.banned?.includes(uid)) { renderJoin('The host removed you from this game.'); return; }
      await rooms.setMe(code, { name, score: 0, answers: {}, joinedAt: Date.now() });
      enterRoom();
    } catch (err) {
      console.warn(err);
      renderJoin(err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed'
        ? "Guest joining isn't switched on yet. Tell the host!" : "Couldn't join. Check your connection and try again.");
    }
  });
}

function enterRoom() {
  try { Object.assign(states, JSON.parse(sessionStorage.getItem(saveKey()))?.states || {}); } catch { /* none */ }
  history.replaceState(null, '', `${location.pathname}${location.search}#${code}`);
  sessionStorage.setItem('dualthreat:joinRoom', code);
  rooms.watchRoom(code, (r) => { room = r; render(); });
  rooms.watchMe(code, (p) => {
    const wasIn = !!me;
    me = p;
    if (!p && wasIn && room?.phase !== 'closed') { leave('The host removed you from this game.'); return; }
    renderStatus();
  });
  rooms.watchPlayers(code, (list) => { players = list; renderStatus(); if (room?.phase === 'reveal' || room?.phase === 'final') render(true); });
}

function leave(msg) {
  ctrl?.destroy(); ctrl = null; mountedQ = null;
  sessionStorage.removeItem('dualthreat:joinRoom');
  code = null; room = null; me = null;
  statusEl.textContent = '';
  history.replaceState(null, '', location.pathname + location.search);
  renderJoin(msg);
}

function myRank() {
  const st = standings(players);
  const mine = st.find((p) => p.uid === me?.uid) || st.find((p) => p.name === me?.name && p.score === me?.score);
  return mine ? `${mine.rank}${['th', 'st', 'nd', 'rd'][(mine.rank % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][mine.rank % 100] || 'th'} of ${st.length}` : '';
}
function renderStatus() {
  statusEl.innerHTML = me ? `<b>${esc(me.name)}</b> · ${me.score || 0} pts${code ? ` · <span class="code-tag">${code}</span>` : ''}` : '';
}

// Saves this question's result to my player row, so the host's leaderboard updates.
function pushAnswer(qi) {
  const s = states[qi];
  const pts = score(s).total;
  const answers = { ...(me?.answers || {}), [qi]: { a: s.a.hit || 0, p: s.p.hit || 0, pts } };
  const total = Object.values(answers).reduce((n, a) => n + (a.pts || 0), 0);
  rooms.setMe(code, { answers, score: total }).catch((e) => console.warn('[join] save failed', e));
}

function render(boardOnly = false) {
  if (!room) { leave('That game has ended.'); return; }
  if (room.phase === 'closed') { leave('The host ended the game. Thanks for playing!'); return; }
  const mode = modeById(room.mode);
  if (room.phase === 'lobby') {
    ctrl?.destroy(); ctrl = null; mountedQ = null;
    app.innerHTML = `
      <section class="panel center">
        <p class="eyebrow">${mode.emoji} ${esc(mode.label)} · ${room.ids.length} questions</p>
        <h2>You're in! 🎉</h2>
        <p class="muted">Watch the stream. The first question shows up here when the host starts.</p>
        <p class="small">${players.length} player${players.length === 1 ? '' : 's'} joined</p>
      </section>`;
    return;
  }
  const qi = room.q;
  const q = data.byId.get(room.ids[qi]);
  if (!q) { app.innerHTML = `<p class="loading">Loading this question… (refresh if it doesn't appear)</p>`; return; }
  if (!states[qi]) { states[qi] = newState(q); states[qi].shown = Math.max(1, room.clue); saveLocal(); }
  const s = states[qi];

  if (room.phase === 'question') {
    if (mountedQ !== qi || !ctrl) {
      ctrl?.destroy();
      mountedQ = qi;
      app.innerHTML = `<div data-q></div>`;
      ctrl = mountQuestion(app.querySelector('[data-q]'), {
        q, state: s, athletes: data.athletes.filter((a) => mode.sports.includes(a.sport)),
        label: `Question ${qi + 1} of ${room.ids.length}`, hostDriven: true,
        onChange: (st, info) => { saveLocal(); if (info?.result === 'hit' || info?.done) pushAnswer(qi); },
      });
    }
    ctrl.setShown(room.clue);
    return;
  }

  if (room.phase === 'reveal' || room.phase === 'final') {
    if (mountedQ === qi && ctrl && !s.done) ctrl.end();
    if (!s.done) { s.done = true; saveLocal(); }
    ctrl?.destroy(); ctrl = null; mountedQ = null;
    const rank = myRank();
    if (room.phase === 'reveal') {
      const html = `
        <p class="eyebrow center">Question ${qi + 1} of ${room.ids.length} · ${{ B: '🟩 Both!', A: '🟦 Athlete', P: '🟨 Pokémon', X: '⬜ Missed' }[resultCode(s)]}</p>
        ${revealHtml(q, s)}
        <div class="panel center"><p class="big-score"><b>${me?.score || 0}</b><span>pts</span></p><p class="muted">${rank ? `You're ${rank}` : ''}</p><p class="small">Next question when the host is ready.</p></div>`;
      if (!boardOnly || app.dataset.view !== `reveal${qi}`) { app.innerHTML = html; app.dataset.view = `reveal${qi}`; }
      else app.querySelector('.panel.center').outerHTML = html.slice(html.lastIndexOf('<div class="panel center">'));
    } else {
      const st = standings(players).slice(0, 10);
      app.dataset.view = 'final';
      app.innerHTML = `
        <section class="panel center">
          <p class="eyebrow">Final standings</p>
          <p class="big-score"><b>${me?.score || 0}</b><span>pts</span></p>
          <p class="muted">${rank ? `You finished ${rank}` : ''}</p>
          <ol class="board">${st.map((p) => `<li class="${p.uid === me?.uid ? 'is-me' : ''}"><span class="rank">${p.rank}</span><span class="who">${esc(p.name)}</span><b>${p.score || 0}</b></li>`).join('')}</ol>
          <a class="btn btn-primary btn-block btn-big" href="./" style="display:grid;place-items:center;text-decoration:none">Play today's Daily Contest</a>
        </section>`;
    }
  }
}

async function start() {
  try { data = await loadData(); } catch { app.innerHTML = `<p class="loading">Couldn't load the game data. Check your connection.</p>`; return; }
  if (!isLocal()) initCloud();
  // Rejoin after a refresh.
  const again = location.hash.slice(1).toUpperCase() || sessionStorage.getItem('dualthreat:joinRoom');
  if (again && /^[A-Z]{4}$/.test(again) && sessionStorage.getItem('dualthreat:joinRoom') === again) {
    try {
      const r = await rooms.getRoom(again);
      if (r && r.phase !== 'closed') { code = again; enterRoom(); return; }
    } catch { /* fall through */ }
  }
  renderJoin();
}
start();
