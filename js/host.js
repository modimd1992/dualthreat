// Host Mode big screen: share this window on stream. You control the clues and when to
// move on; viewers answer on their phones at /join with the room code.
import { GAME, MODES, PLAY, modeById, multiplierAt } from './config.js';
import { loadData } from './data.js';
import { poolFor } from './daily.js';
import { available } from './game.js';
import { pad3 } from './gen1.js';
import { isLocal, roomApi, standings } from './room.js';
import { toast } from './ui.js';
import { cloudEnabled } from './cloud.js';
import { esc } from './util.js';

const el = document.getElementById('host');
const rooms = roomApi();
let data = null;
let code = null;
let room = null;
let players = [];
let hideControls = false;
let ticker = null;

const joinUrl = () => {
  const base = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${location.host}${location.pathname.replace(/host(\.html)?$/, '')}join.html`
    : `${GAME.siteUrl}/join`;
  return isLocal() ? `${base}?local` : base;
};
const currentQ = () => (room ? data.byId.get(room.ids[room.q]) : null);
const answersFor = (qi) => players.map((p) => p.answers?.[qi]).filter(Boolean);

// ---------- setup ----------
function renderSetup() {
  const saved = JSON.parse(localStorage.getItem('modimatch:hostPrefs') || '{}');
  const opt = (name, list, cur) => list.map(([v, label]) =>
    `<label class="chip-opt"><input type="radio" name="${name}" value="${v}" ${String(cur) === String(v) ? 'checked' : ''}><span>${label}</span></label>`).join('');
  el.innerHTML = `
    <div class="host-setup">
      <div class="setup-brand"><img src="assets/icon.svg" width="56" height="56" alt=""><h1>Modi<span>Match</span> <small>Host Mode</small></h1></div>
      <p class="muted">Share this window on your stream. Viewers answer on their phones with a room code, and the leaderboard updates live.</p>
      ${isLocal() ? `<p class="local-note">🧪 Local test mode: rooms only work between tabs of this browser. Open <b>${esc(joinUrl())}</b> in other tabs to play along.</p>` : ''}
      ${!isLocal() && !cloudEnabled() ? `<p class="local-note">Firebase isn't set up, so only local test mode works. Add <b>?local</b> to the address.</p>` : ''}
      <form id="setup">
        <fieldset><legend>Sport</legend><div class="chips">${opt('mode', MODES.map((m) => [m.id, `${m.emoji} ${m.label}`]), saved.mode || 'all')}</div></fieldset>
        <fieldset><legend>Questions</legend><div class="chips">${opt('count', [[5, '5'], [10, '10'], [15, '15']], saved.count || 10)}</div></fieldset>
        <fieldset><legend>New clue every</legend><div class="chips">${opt('secs', [[10, '10 s'], [15, '15 s'], [20, '20 s'], [0, 'Manual']], saved.secs ?? 15)}</div></fieldset>
        <button class="btn btn-primary btn-big" type="submit">Create room</button>
      </form>
      <p class="small">Keys during the game: <b>Space</b> next clue · <b>A</b> auto clues on/off · <b>R</b> reveal · <b>N</b> next question · <b>H</b> hide these controls · <b>F</b> full screen</p>
      <p class="small"><a href="./">← Back to ${esc(GAME.name)}</a></p>
    </div>`;
  el.querySelector('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const prefs = { mode: f.get('mode'), count: Number(f.get('count')), secs: Number(f.get('secs')) };
    localStorage.setItem('modimatch:hostPrefs', JSON.stringify(prefs));
    const pool = poolFor(data.questions, modeById(prefs.mode));
    // Random order, never the same Pokémon twice in one game.
    const picked = [];
    for (const q of [...pool].sort(() => Math.random() - 0.5)) {
      if (picked.length >= prefs.count) break;
      if (!picked.some((p) => p.pokemon === q.pokemon)) picked.push(q);
    }
    try {
      e.target.querySelector('button').disabled = true;
      code = await rooms.createRoom({
        mode: prefs.mode, ids: picked.map((q) => q.id), q: 0, clue: 1, phase: 'lobby',
        auto: prefs.secs > 0, clueSeconds: prefs.secs || 15, clueAt: Date.now(),
      });
      sessionStorage.setItem('modimatch:hostRoom', code);
      enterRoom();
    } catch (err) {
      console.warn(err);
      e.target.querySelector('button').disabled = false;
      toast(err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed'
        ? 'Turn on Anonymous sign-in in Firebase first (see README).' : 'Could not create the room. Check the connection and Firebase rules.', 4000);
    }
  });
}

// ---------- in a room ----------
function enterRoom() {
  history.replaceState(null, '', `${location.pathname}${location.search}#${code}`);
  rooms.watchRoom(code, (r) => {
    room = r;
    if (!r || r.phase === 'closed') { sessionStorage.removeItem('modimatch:hostRoom'); location.hash = ''; renderSetup(); return; }
    render();
  });
  rooms.watchPlayers(code, (list) => { players = list; render(); });
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
}

// Auto clues: the host's screen advances the room on a timer.
function tick() {
  if (!room || room.phase !== 'question') return;
  const q = currentQ();
  const total = q.clues.length;
  const limit = room.clue < total ? room.clueSeconds : PLAY.finalSeconds;
  const left = Math.max(0, limit - (Date.now() - room.clueAt) / 1000);
  const ring = el.querySelector('[data-ring]');
  if (ring) {
    ring.style.setProperty('--p', room.auto ? left / limit : 1);
    el.querySelector('[data-secs]').textContent = room.auto ? Math.ceil(left) : '⏸';
    el.querySelector('[data-ring-label]').textContent = !room.auto ? 'paused' : room.clue < total ? 'next clue' : 'reveal in';
  }
  if (room.auto && left <= 0 && !tick.busy) {
    tick.busy = true;
    (room.clue < total ? nextClue() : reveal()).finally(() => { tick.busy = false; });
  }
}

const update = (patch) => rooms.updateRoom(code, patch).catch((e) => { console.warn(e); toast('Could not update the room'); });
const nextClue = () => (room.phase === 'question' && room.clue < currentQ().clues.length ? update({ clue: room.clue + 1, clueAt: Date.now() }) : Promise.resolve());
const reveal = () => (room.phase === 'question' ? update({ phase: 'reveal' }) : Promise.resolve());
const toggleAuto = () => update({ auto: !room.auto, clueAt: Date.now() });
function startOrNext() {
  if (room.phase === 'lobby') return update({ phase: 'question', q: 0, clue: 1, clueAt: Date.now() });
  if (room.phase === 'reveal') {
    return room.q + 1 < room.ids.length
      ? update({ phase: 'question', q: room.q + 1, clue: 1, clueAt: Date.now() })
      : update({ phase: 'final' });
  }
  return Promise.resolve();
}
async function endRoom() {
  if (!confirm('End this room for everyone?')) return;
  clearInterval(ticker);
  await rooms.closeRoom(code, players);
}

function controlsHtml() {
  if (!room) return '';
  const q = currentQ();
  const b = (key, label, act, primary = false, disabled = false) =>
    `<button class="btn ${primary ? 'btn-primary' : ''}" data-act="${act}" ${disabled ? 'disabled' : ''}><kbd>${key}</kbd> ${label}</button>`;
  let btns = '';
  if (room.phase === 'lobby') btns = b('N', 'Start the game', 'next', true, !players.length && !isLocal());
  if (room.phase === 'question') {
    btns = b('Space', 'Next clue', 'clue', false, room.clue >= q.clues.length)
      + b('A', room.auto ? 'Auto: on' : 'Auto: off', 'auto')
      + b('R', 'Reveal answer', 'reveal', true);
  }
  if (room.phase === 'reveal') btns = b('N', room.q + 1 < room.ids.length ? 'Next question' : 'Final standings', 'next', true);
  if (room.phase === 'final') btns = '';
  return `<div class="host-controls" ${hideControls ? 'hidden' : ''}>${btns}
    <span class="spacer"></span><button class="btn btn-small" data-act="hide"><kbd>H</kbd> Hide</button><button class="btn btn-small" data-act="end">End room</button></div>`;
}

function joinPill() {
  return `<div class="join-pill"><span>Play along at</span><b>${esc(joinUrl())}</b><span class="code">${code}</span></div>`;
}

function boardHtml(limit = 8, qi = null) {
  const st = standings(players).slice(0, limit);
  if (!st.length) return `<p class="muted">No players yet.</p>`;
  return `<ol class="host-board">${st.map((p) => {
    const d = qi != null ? p.answers?.[qi]?.pts || 0 : 0;
    return `<li><span class="rank">${p.rank}</span><span class="who">${esc(p.name)}</span>${qi != null && d ? `<span class="delta">+${d}</span>` : ''}<b>${p.score || 0}</b></li>`;
  }).join('')}</ol>`;
}

function render() {
  if (!room || !data) return;
  const mode = modeById(room.mode);
  const q = currentQ();
  // Animate a clue or answer only the first time it appears, not on every redraw.
  const key = `${room.phase}:${room.q}:${room.clue}`;
  const anim = key !== render.lastKey ? ' anim' : '';
  render.lastKey = key;
  let body = '';
  if (room.phase === 'lobby') {
    body = `
      <div class="lobby">
        <p class="eyebrow">${mode.emoji} ${esc(mode.label)} · ${room.ids.length} questions</p>
        <h1 class="lobby-title">Grab your phone and join!</h1>
        <div class="lobby-join"><span>Go to</span><b>${esc(joinUrl())}</b><span>and enter code</span><div class="big-code">${code}</div></div>
        <p class="muted">${players.length} player${players.length === 1 ? '' : 's'} in</p>
        <div class="lobby-players">${players.map((p) => `<span class="pchip">${esc(p.name)}<button class="kick" data-kick="${p.uid}" title="Remove" aria-label="Remove ${esc(p.name)}">✕</button></span>`).join('')}</div>
      </div>`;
  } else if (room.phase === 'question') {
    const av = available(room.clue);
    const answered = answersFor(room.q);
    const gotA = answered.filter((a) => a.a).length, gotP = answered.filter((a) => a.p).length;
    body = `
      <div class="stage">
        <div class="stage-main">
          <div class="stage-head"><span class="eyebrow">Question ${room.q + 1} of ${room.ids.length}</span>${joinPill()}</div>
          <ol class="host-clues">${q.clues.map((c, i) => i < room.clue
            ? `<li class="${i + 1 === room.clue ? `is-new${anim}` : ''}"><span class="n">${i + 1}</span><p>${esc(c)}</p><span class="x">×${multiplierAt(i + 1)}</span></li>`
            : `<li class="is-locked"><span class="n">${i + 1}</span><p>Clue ${i + 1}</p><span class="x">×${multiplierAt(i + 1)}</span></li>`).join('')}</ol>
        </div>
        <aside class="stage-side">
          <div class="ring" data-ring style="--p:1"><div><b data-secs></b><span data-ring-label></span></div></div>
          <div class="side-card"><span class="eyebrow">Worth right now</span>
            <p class="worth">🏃 <b>${av.athlete}</b> · 🧩 <b>${av.pokemon}</b><br>both <b class="lime">${av.both}</b></p></div>
          <div class="side-card"><span class="eyebrow">Locked in</span><p class="worth">🏃 ${gotA} · 🧩 ${gotP} <span class="muted">of ${players.length}</span></p></div>
          <div class="side-card"><span class="eyebrow">Leaderboard</span>${boardHtml(5)}</div>
        </aside>
      </div>`;
  } else if (room.phase === 'reveal') {
    const ans = answersFor(room.q);
    const both = ans.filter((a) => a.a && a.p).length;
    body = `
      <div class="stage">
        <div class="stage-main">
          <div class="stage-head"><span class="eyebrow">Question ${room.q + 1} of ${room.ids.length} · Answer</span>${joinPill()}</div>
          <div class="host-reveal${anim}">
            <div class="hr-side"><span class="eyebrow">Athlete</span><b>${esc(q.athlete.name)}</b><span class="muted">${esc(q.athlete.position)} · ${esc(q.athlete.team)}</span></div>
            <div class="hr-link">⇄</div>
            <div class="hr-side"><span class="eyebrow">Gen 1 comp</span><b>${esc(q.pokemon)}</b><span class="muted">#${pad3(q.dex)}</span></div>
          </div>
          <p class="why host-why"><span>Why they match</span>${esc(q.why)}</p>
          <ol class="reveal-clues">${q.clues.map((c, i) => `<li><span>${i + 1}</span>${esc(c)}</li>`).join('')}</ol>
          <p class="hr-stats">🏃 ${ans.filter((a) => a.a).length} got the athlete · 🧩 ${ans.filter((a) => a.p).length} got the Pokémon · 🟩 ${both} made the connection</p>
        </div>
        <aside class="stage-side"><div class="side-card"><span class="eyebrow">Leaderboard</span>${boardHtml(10, room.q)}</div></aside>
      </div>`;
  } else if (room.phase === 'final') {
    const st = standings(players);
    const pod = st.slice(0, 3);
    body = `
      <div class="final">
        <p class="eyebrow">${mode.emoji} ${esc(mode.label)} · Final standings</p>
        <div class="podium">${pod.map((p, i) => `<div class="pod pod-${i + 1}"><span class="medal">${['🥇', '🥈', '🥉'][i]}</span><b>${esc(p.name)}</b><span>${p.score || 0} pts</span></div>`).join('')}</div>
        ${st.length > 3 ? boardHtml(10) : ''}
        <p class="muted">Thanks for playing! Daily Contest at ${esc(GAME.siteUrl)}</p>
        <button class="btn btn-primary" data-act="again">New game</button>
      </div>`;
  }
  // Keep the timer ring from flickering: only redraw when something visible changed.
  const html = `${body}${controlsHtml()}`;
  if (html !== render.last) { el.innerHTML = html; render.last = html; tick(); }
}

el.addEventListener('click', (e) => {
  const kick = e.target.closest('[data-kick]');
  if (kick) { rooms.kick(code, kick.dataset.kick); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  ({
    clue: nextClue, auto: toggleAuto, reveal, next: startOrNext, end: endRoom,
    hide: () => { hideControls = true; render.last = null; render(); toast('Press H to show the controls'); },
    again: async () => { await rooms.closeRoom(code, players); },
  })[act]?.();
});

document.addEventListener('keydown', (e) => {
  if (!room || e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); nextClue(); } else if (k === 'a') toggleAuto();
  else if (k === 'r') reveal();
  else if (k === 'n') startOrNext();
  else if (k === 'h') { hideControls = !hideControls; render.last = null; render(); }
  else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
});

async function start() {
  try { data = await loadData(); } catch { el.innerHTML = `<p class="loading">Couldn't load athlete data from ModiDex.</p>`; return; }
  // Refreshing the host page goes back into the same room.
  const again = location.hash.slice(1) || sessionStorage.getItem('modimatch:hostRoom');
  if (again && /^[A-Z]{4}$/.test(again)) {
    try {
      const r = await rooms.getRoom(again);
      if (r && r.host === await rooms.uid() && r.phase !== 'closed') { code = again; enterRoom(); return; }
    } catch { /* fall through to setup */ }
  }
  renderSetup();
}
start();
