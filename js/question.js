// The question screen: clues, countdown, the two answer boxes and the reveal.
// Used by the Daily Contest, Practice, and players' phones in Host Mode.
import { PLAY, SPORTS, multiplierAt } from './config.js';
import { attachAutocomplete } from './autocomplete.js';
import { available, boxOpen, bothClosed, guess, score, triesLeft } from './game.js';
import { GEN1, pad3 } from './gen1.js';
import { esc } from './util.js';

// ---------- autocomplete lists ----------
export function athleteItems(athletes) {
  return athletes.map((a) => ({
    value: a.id, label: a.name, names: [a.name, ...(a.aliases || [])],
    meta: `${SPORTS[a.sport]?.emoji || ''} ${a.teamAbbr} · ${a.position}`,
  }));
}
const POKE_ALIASES = { 'Nidoran♀': ['Nidoran F', 'Nidoran female'], 'Nidoran♂': ['Nidoran M', 'Nidoran male'], 'Mr. Mime': ['Mr Mime'], "Farfetch'd": ['Farfetchd'] };
export const POKEMON_ITEMS = GEN1.map((name, i) => ({
  value: name, label: name, meta: `#${pad3(i + 1)}`, names: [name, ...(POKE_ALIASES[name] || [])],
}));

const nameOf = (athletes, id) => athletes.find((a) => a.id === id)?.name || id;

// ---------- the reveal ----------
export function revealHtml(q, state) {
  const a = q.athlete;
  const pts = score(state);
  const side = (label, title, sub, hit, got) => `
    <div class="reveal-side${hit ? ' is-hit' : ''}">
      <span class="reveal-label">${label}</span>
      <b class="reveal-name">${esc(title)}</b>
      <span class="reveal-sub">${sub}</span>
      <span class="reveal-mark">${hit ? `✓ +${got}` : '✗'}</span>
    </div>`;
  return `
    <div class="reveal">
      <div class="reveal-pair">
        ${side('Athlete', a.name, `${SPORTS[a.sport]?.emoji || ''} ${esc(a.position)} · ${esc(a.team)}`, !!state.a.hit, pts.athlete)}
        <div class="reveal-link" aria-hidden="true">⇄</div>
        ${side('Gen 1 comp', q.pokemon, `#${pad3(q.dex)}`, !!state.p.hit, pts.pokemon)}
      </div>
      <p class="why"><span>Why they match</span>${esc(q.why)}</p>
      <p class="pts-line">${pts.total ? `<b>+${pts.total}</b> points` : 'No points this time'}${pts.bonus ? ` · includes a <b>+${pts.bonus}</b> bonus for getting both` : ''}</p>
    </div>`;
}

// ---------- the question ----------
/**
 * mountQuestion(el, opts) -> controller
 * opts: q, state, athletes (answer pool), label, hostDriven, onChange(state), onDone(state)
 * Self-timed (Daily/Practice): reveals a clue every PLAY.clueSeconds and ends after
 * PLAY.finalSeconds on the last clue. Host-driven: call setShown(n) and end().
 */
export function mountQuestion(el, opts) {
  const { q, state, athletes, hostDriven = false } = opts;
  const items = athleteItems(athletes);
  const total = q.clues.length;
  let timer = null;
  let clueStart = performance.now();
  let acs = [];
  let ended = false;

  el.innerHTML = `
    <section class="qcard" aria-live="polite">
      <div class="q-head">
        <span class="q-label">${esc(opts.label || '')}</span>
        <span class="q-avail" data-avail></span>
      </div>
      <ol class="clue-list" data-clues></ol>
      <div class="timer" data-timer ${hostDriven ? 'hidden' : ''}>
        <div class="timer-bar"><span data-bar></span></div>
        <div class="timer-row">
          <span class="timer-text" data-ttext></span>
          <button class="btn btn-small" data-next type="button">Next clue ▸</button>
        </div>
      </div>
      <p class="host-note" ${hostDriven ? '' : 'hidden'}>New clues appear when the host reveals them.</p>
      <div class="boxes">
        <div class="abox" data-box="athlete"></div>
        <div class="abox" data-box="pokemon"></div>
      </div>
      <div class="q-foot" ${hostDriven ? 'hidden' : ''}>
        <button class="link-btn" data-giveup type="button">Reveal the answer</button>
      </div>
    </section>`;
  const $ = (s) => el.querySelector(s);

  function renderClues() {
    const shownCount = state.done ? total : state.shown;
    const open = q.clues.slice(0, shownCount).map((c, i) => {
      const n = i + 1;
      return `<li class="clue is-open${n === state.shown && !state.done ? ' is-new' : ''}"><span class="clue-n">${n}</span><p>${esc(c)}</p><span class="clue-x" title="Points multiplier">×${multiplierAt(n)}</span></li>`;
    }).join('');
    // Clues still to come sit in one compact row, so the answer boxes stay near the top.
    const rest = q.clues.slice(shownCount).map((_, i) => {
      const n = shownCount + i + 1;
      return `<span class="lock-chip">Clue ${n} <b>×${multiplierAt(n)}</b></span>`;
    }).join('');
    $('[data-clues]').innerHTML = open + (rest ? `<li class="locked-row" aria-label="Clues still to come">${rest}</li>` : '');
    const av = available(state.shown);
    $('[data-avail]').innerHTML = state.done ? '' : `Now <b>×${av.mult}</b> · 🏃 ${av.athlete} · 🧩 ${av.pokemon} · both <b>${av.both}</b>`;
    const next = $('[data-next]');
    next.disabled = state.shown >= total || state.done;
  }

  function renderBox(which) {
    const b = which === 'athlete' ? state.a : state.p;
    const box = el.querySelector(`[data-box="${which}"]`);
    const title = which === 'athlete' ? '🏃 Athlete' : '🧩 Gen 1 Pokémon';
    const dots = Array.from({ length: PLAY.attempts }, (_, i) => `<span class="dot${i < b.tries.length - (b.hit ? 1 : 0) ? ' used' : ''}"></span>`).join('');
    const misses = b.tries.filter((t) => !(b.hit && t === b.tries[b.tries.length - 1]))
      .map((t) => `<span class="miss-chip">✗ ${esc(which === 'athlete' ? nameOf(athletes, t) : t)}</span>`).join('');
    let body;
    if (b.hit) {
      const got = which === 'athlete' ? score(state).athlete : score(state).pokemon;
      body = `<div class="abox-locked">✓ <b>${esc(which === 'athlete' ? q.athlete.name : q.pokemon)}</b> <span>+${got} · locked at clue ${b.hit}</span></div>`;
    } else if (!boxOpen(b)) {
      body = `<div class="abox-out">Out of guesses</div>`;
    } else if (state.done) {
      body = `<div class="abox-out">Not answered</div>`;
    } else {
      const ph = which === 'athlete' ? 'Type an athlete…' : 'Type a Gen 1 Pokémon…';
      body = `<div class="ac-wrap">
          <input type="text" class="ans-input" data-input="${which}" placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false"
            role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="list-${which}" aria-label="${title.slice(2)} guess">
          <ul class="ac-list" id="list-${which}" role="listbox" hidden></ul>
        </div>`;
    }
    box.className = `abox${b.hit ? ' is-hit' : ''}${!b.hit && !boxOpen(b) ? ' is-out' : ''}`;
    box.innerHTML = `
      <div class="abox-head"><span class="abox-title">${title}</span>
        <span class="tries" aria-label="${triesLeft(b)} guesses left">${b.hit ? '' : dots}</span></div>
      ${body}
      ${misses ? `<div class="misses">${misses}</div>` : ''}`;
    const input = box.querySelector('input');
    if (input) {
      const ac = attachAutocomplete({
        input, list: box.querySelector('.ac-list'),
        getItems: () => (which === 'athlete' ? items : POKEMON_ITEMS),
        getExclude: () => new Set(b.tries),
        emptyText: which === 'athlete' ? 'No athlete by that name in this mode' : 'Not one of the original 151',
        onPick: (it) => onGuess(which, it.value),
      });
      acs.push(ac);
    }
  }

  function onGuess(which, value) {
    const r = guess(state, q, which, value);
    if (!r) return;
    renderBox(which);
    opts.onChange?.(state, { which, result: r });
    if (r === 'miss') {
      const input = el.querySelector(`[data-input="${which}"]`);
      if (input) input.focus();
      el.querySelector(`[data-box="${which}"]`)?.classList.add('shake');
    } else if (which === 'athlete') {
      el.querySelector('[data-input="pokemon"]')?.focus({ preventScroll: true });
    }
    if (bothClosed(state)) end();
  }

  function showClue(n) {
    if (n <= state.shown || n > total || state.done) return;
    state.shown = n;
    clueStart = performance.now();
    renderClues();
    // Boxes show "locked at clue N", which doesn't change; no re-render needed.
    opts.onChange?.(state, { clue: n });
  }

  function tick() {
    if (state.done) return;
    const limit = state.shown < total ? PLAY.clueSeconds : PLAY.finalSeconds;
    const elapsed = (performance.now() - clueStart) / 1000;
    const left = Math.max(0, limit - elapsed);
    $('[data-bar]').style.width = `${(left / limit) * 100}%`;
    $('[data-timer]').classList.toggle('is-final', state.shown >= total);
    $('[data-ttext]').textContent = state.shown < total
      ? `Clue ${state.shown + 1} in ${Math.ceil(left)}s`
      : `Last clue · answer in ${Math.ceil(left)}s`;
    if (left <= 0) {
      if (state.shown < total) showClue(state.shown + 1);
      else end();
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    state.done = true;
    clearInterval(timer);
    acs.forEach((a) => a.destroy());
    acs = [];
    renderClues();
    renderBox('athlete');
    renderBox('pokemon');
    el.querySelector('[data-timer]').hidden = true;
    el.querySelector('.q-foot').hidden = true;
    el.querySelector('.host-note').hidden = true;
    opts.onChange?.(state, { done: true });
    opts.onDone?.(state);
  }

  $('[data-next]').addEventListener('click', () => showClue(state.shown + 1));
  $('[data-giveup]').addEventListener('click', end);
  renderClues();
  renderBox('athlete');
  renderBox('pokemon');
  el.addEventListener('animationend', (e) => e.target.classList.remove('shake'));

  if (state.done) end(); // reopened after the reveal (e.g. a reload): show the answer again
  else if (!hostDriven) { timer = setInterval(tick, 200); tick(); }

  return {
    setShown: showClue,
    end,
    destroy() { clearInterval(timer); acs.forEach((a) => a.destroy()); },
  };
}
