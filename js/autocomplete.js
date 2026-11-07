// Accessible autocomplete for the two answer boxes.
// items: [{ value, label, meta, names: [name, ...aliases] }]
import { esc, normalize } from './util.js';

function score(item, q) {
  let best = 0;
  item.names.forEach((n, i) => {
    const name = normalize(n);
    const words = name.split(' ');
    let s = 0;
    if (name === q) s = 100;
    else if (words.includes(q)) s = 90;
    else if (name.startsWith(q)) s = 80;
    else if (words.some((w) => w.startsWith(q))) s = 60;
    else if (name.includes(q)) s = 40;
    if (s && i > 0) s -= 1; // a real name beats a nickname on a tie
    best = Math.max(best, s);
  });
  return best;
}

export function search(items, query, exclude = new Set(), limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  return items
    .filter((it) => !exclude.has(it.value))
    .map((it) => ({ it, s: score(it, q) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.it.label.localeCompare(y.it.label))
    .slice(0, limit)
    .map((x) => x.it);
}

let seq = 0;

// Wires an <input> + <ul> into a combobox. onPick(item) runs when a choice is made.
export function attachAutocomplete({ input, list, getItems, getExclude = () => new Set(), onPick, emptyText = 'No match' }) {
  const prefix = `ac${++seq}`;
  let results = [];
  let active = -1;

  function close() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function render() {
    if (!results.length) {
      if (normalize(input.value)) {
        list.innerHTML = `<li class="ac-empty">${esc(emptyText)}</li>`;
        list.hidden = false;
      } else close();
      return;
    }
    list.innerHTML = results.map((it, i) => `
      <li id="${prefix}-${i}" role="option" class="ac-item${i === active ? ' is-active' : ''}" aria-selected="${i === active}" data-i="${i}">
        <span class="ac-name">${esc(it.label)}</span>
        <span class="ac-meta">${esc(it.meta || '')}</span>
      </li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${prefix}-${active}`);
  }

  function update() {
    results = search(getItems(), input.value, getExclude());
    active = results.length ? 0 : -1;
    render();
  }

  function pick(i) {
    const it = results[i];
    if (!it) return;
    input.value = '';
    close();
    onPick(it);
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => input.value && update());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault(); active = (active + 1) % results.length; render();
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault(); active = (active - 1 + results.length) % results.length; render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(active);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  const outside = (e) => { if (!list.contains(e.target) && e.target !== input) close(); };
  document.addEventListener('pointerdown', outside);

  return {
    close,
    destroy() { document.removeEventListener('pointerdown', outside); },
  };
}
