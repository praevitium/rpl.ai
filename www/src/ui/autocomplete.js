import { allOps, lookup } from '../rpl/ops.js';
import { endsInQuote } from '../rpl/parser.js';
import { varOrder, varRecall, state } from '../rpl/state.js';
import { shortDescription } from './command-reference.js';
import { fuzzyScore, matchPositions, highlightSegments } from './op-search.js';
import { escapeHtml, typeName, markScrollEnds, LONG_PRESS_MS } from './display.js';
import { UNIT_GROUPS, BRANCH_KEYS } from './menus.js';

const MAX_ROWS = 6;
const AC_MARGIN = 6;
const WORD_BREAK = /[\s{}[\]()"'`«»,+\-*/^=<>|]/;
const CLOSES_A_WORD = /^[\s)\]}»`']/;
const onTouch = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

export function wordBeforeCursor(text, cursor) {
  const before = String(text ?? '').slice(0, cursor);
  if ((before.match(/"/g) ?? []).length % 2 === 1) return null;
  let from = before.length;
  // A phone keyboard's -> stands for →, so ->S and R->B are one word, as →S and R→B are.
  for (;;) {
    while (from > 0 && !WORD_BREAK.test(before[from - 1])) from--;
    if (!before.slice(0, from).endsWith('->')) break;
    from -= 2;
  }
  const word = before.slice(from);
  return word ? { word, from } : null;
}

export const hpArrows = (word) => word.replaceAll('->', '→');

const firstLetter = (name) => name.match(/[A-Z]/i)?.[0].toUpperCase();

// One letter matches a name's first letter, so N offers →NUM after NEG; two or more match anywhere.
function completionScore(word, name) {
  const w = word.toUpperCase();
  const n = name.toUpperCase();
  if (n === w) return 2000;
  if (n.startsWith(w)) return 1500 - n.length;
  if (w.length === 1) return firstLetter(n) === w ? 1000 - n.length : 0;
  return Math.max(0, fuzzyScore(word, name));
}

// A phone keyboard has none of these, so each is offered for the word that spells it: pi gives π, inf ∞, sum Σ.
const SPELLED = Object.freeze({
  'π': ['pi'], '∞': ['inf', 'infinity'], 'Σ': ['sum', 'sigma'], '∫': ['integral'], '√': ['sqrt'], '∂': ['deriv', 'partial'],
});

// The BRCH menu's structures, offered whole as ⇦ on its keys types them, and the words that only continue one.
const STRUCTURES = BRANCH_KEYS.flatMap(([, ...forms]) => forms);
const STRUCTURE_WORDS = BRANCH_KEYS.filter(([, whole]) => !whole).map(([word]) => word);

function structureScore(word, [first, ...rest]) {
  const w = word.toUpperCase();
  return w.length < 2 || !first.startsWith(w) ? 0 : (first === w ? 1900 : 1490) - rest.length;
}

// Nor inside a name, so CLSIGMA finds CLΣ, DELTALIST ΔLIST and ->QPI →Qπ.
const spelledGreek = (name) => name.toUpperCase().replaceAll('Σ', 'SIGMA').replaceAll('Δ', 'DELTA').replaceAll('Π', 'PI');

function greekScore(word, name) {
  const spelled = spelledGreek(name);
  if (spelled === name.toUpperCase()) return 0;
  const w = word.toUpperCase();
  return spelled === w ? 1950 : w.length >= 3 && spelled.startsWith(w) ? 1500 - spelled.length : 0;
}

function spelledScore(word, spellings) {
  const w = word.toLowerCase();
  return Math.max(...spellings.map((s) => (s === w ? 1900 : w.length >= 3 && s.startsWith(w) ? 1500 - s.length : 0)));
}

export function completions(word, { names = [], variables = [], locals = [], structures = true } = {}) {
  if (!word || hpArrows(word) === '→') return [];
  const seen = new Set();
  return [
    ...locals.map((name) => ({ name, kind: 'local' })),
    ...variables.map((name) => ({ name, kind: 'variable' })),
    ...names.filter((n) => !n.includes('->')).map((name) => ({ name, kind: 'command' })),
    ...Object.entries(SPELLED).map(([name, spellings]) => ({ name, kind: 'command', spellings })),
    ...(structures ? [
      ...STRUCTURE_WORDS.map((name) => ({ name, kind: 'command', inner: true })),
      ...STRUCTURES.map((words) => ({ name: words.join(' … '), kind: 'structure', words })),
    ] : []),
  ]
    .map(({ spellings, inner, ...row }) => {
      const score = spellings ? spelledScore(word, spellings)
        : row.words ? structureScore(word, row.words)
        : inner && word.length < 2 ? 0
        : Math.max(completionScore(hpArrows(word), row.name), row.kind === 'command' ? greekScore(hpArrows(word), row.name) : 0);
      return { ...row, score: score && row.kind === 'local' ? score + 100 : score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .filter((row) => !seen.has(row.name.toUpperCase()) && seen.add(row.name.toUpperCase()))
    .slice(0, MAX_ROWS);
}

const isLocalName = (word) => /^[^\d«»'`"{}[\]()#][^«»'`"{}[\]()#]*$/.test(word ?? '');

// The names a → or a FOR earlier in the line binds: in « → a b « a b + » » the program's a and b, in 1 5 FOR k … NEXT its k.
export function localNames(text) {
  const words = String(text ?? '').split(/\s+/);
  const names = new Set();
  words.forEach((word, i) => {
    if (word === 'FOR' && isLocalName(words[i + 1])) names.add(words[i + 1]);
    if (word !== '→' && word !== '->') return;
    for (let j = i + 1; j < words.length && isLocalName(words[j]); j++) names.add(words[j]);
  });
  return [...names];
}

// After a number's _, the UNITS menu's units with their group: 9.8_m offers m, mm, mi, mph… Inside an algebraic a unit
// runs to the next operator, so there only plain units are offered: m^2 or m/s would need parentheses.
// A phone keyboard has no μ, Å, Ω or °, so a unit holding one is found spelled out: um gives μm, kohm kΩ, degC °C.
const UNIT_GLYPHS = Object.freeze({ 'μ': ['u', 'micro'], 'Å': ['angstrom', 'Angstrom'], 'Ω': ['ohm', 'Ohm'], '°': ['deg', 'Deg'] });

function unitSpellings(name) {
  return [...name].reduce((forms, ch) => forms.flatMap((f) => (UNIT_GLYPHS[ch] ?? [ch]).map((s) => f + s)), ['']);
}

function spelledUnitScore(word, name) {
  if (![...name].some((ch) => UNIT_GLYPHS[ch])) return 0;
  return Math.max(...unitSpellings(name).map((s) => (s === word ? 1400 : word.length >= 2 && s.startsWith(word) ? 900 - s.length : 0)));
}

export function unitCompletions(word, { plain = false } = {}) {
  const seen = new Set();
  const score = (name) => Math.max(name.startsWith(word) ? 1500 - name.length
    : name.toUpperCase().startsWith(word.toUpperCase()) ? 1000 - name.length : 0, spelledUnitScore(word, name));
  return UNIT_GROUPS.flatMap((g) => g.units.map((name) => ({ name, kind: 'unit', group: g.title })))
    .filter((row) => !(plain && /[*/^]/.test(row.name)) && !seen.has(row.name) && seen.add(row.name))
    .map((row) => ({ ...row, score: score(row.name) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS);
}

// The unit part of a word that holds a _, as the word to complete, or the word itself. A phone keyboard keeps _ a
// page or two away, so letters typed straight after a number (9.8kg, not the exponent of 2e or 1E5) are a unit too,
// and a pick puts the _ in.
function unitPart(at) {
  const i = at?.word.lastIndexOf('_') ?? -1;
  const unit = i >= 0 ? at.word.slice(i + 1) : '';
  if (/^\p{L}/u.test(unit)) return { word: unit, from: at.from + i + 1, unit: true };
  const [, number, letters] = at?.word.match(/^([-+]?(?:\d+\.?\d*|\.\d+))(\p{L}.*)$/u) ?? [];
  return letters && !/^[eE]\d*$/.test(letters) ? { word: letters, from: at.from + number.length, unit: true, glue: '_' } : at;
}

export function isInsideAlgebraic(text, offset) {
  return endsInQuote(String(text ?? '').slice(0, offset));
}

export class Autocomplete {
  constructor({ host, cmdline, app }) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'ac';
    this.el.hidden = true;
    this.el.setAttribute('role', 'listbox');
    this.el.setAttribute('aria-label', 'Completions');
    host.appendChild(this.el);
    this.rows = [];
    this.index = 0;
    this.word = null;
    this.shown = null;
    this._dismissedWord = null;
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      const row = e.target.closest('.ac-row');
      if (row) this.accept(Number(row.dataset.i));
    });
    this._bindHold();
    this.el.addEventListener('scroll', () => markScrollEnds(this.el), { passive: true });
    // A turn or the keyboard resizes the window under an open list, which fits it again a frame later, as a popover does.
    window.addEventListener('resize', () => requestAnimationFrame(() => {
      if (!this.isOpen()) return;
      this._fit();
      markScrollEnds(this.el);
    }));
    cmdline.addEventListener('keydown', (e) => this._onKey(e), true);
    cmdline.addEventListener('focusout', () => this.close());
    document.addEventListener('pointerdown', (e) => { if (this.isOpen() && !e.target.closest?.('.ac, .keys, #cmdline')) this.close(); }, true);
  }

  isOpen() { return !this.el.hidden; }

  update() {
    const { entry } = this.app;
    const text = entry.buffer;
    // An INPUT's answer is text the program reads back, so it gets no command completions.
    const typing = this.app.inputMode === 'rpl' && (entry.hasFocus() || this.app.typingOnKeypad) && state.halted?.kind !== 'input';
    const active = typing && !this.app.errorBanner && !text.trimStart().startsWith('?');
    const at = active ? unitPart(wordBeforeCursor(text, entry.cursor)) : null;
    // A name ending in a word break, STO* or ΣX^2, is no word before the cursor, but it is still the one ↑ and ↓ put there.
    const stillShown = this.shown && (at ? at.from === this._shownFrom && at.word === this.shown : active && text.slice(this._shownFrom, entry.cursor) === this.shown);
    if (stillShown) return;
    this.shown = null;
    if (!at) this._dismissedWord = null;
    const after = text.slice(entry.cursor);
    if (!at || (at.word.length < 2 && !/^[a-z]$/i.test(at.word)) || /^[0-9.#_]/.test(at.word) || (after && !CLOSES_A_WORD.test(after)) || at.word === this._dismissedWord) {
      this.close();
      return;
    }
    const rows = at.unit ? unitCompletions(at.word, { plain: isInsideAlgebraic(text, at.from) })
      : completions(at.word, { names: allOps().map((n) => lookup(n).name), variables: varOrder(), locals: localNames(text.slice(0, at.from)), structures: !isInsideAlgebraic(text, at.from) });
    if (!rows.length || (rows.length === 1 && rows[0].name === at.word && !at.glue)) { this.close(); return; }
    if (this.word?.word !== at.word) this.index = 0;
    this.word = at;
    this.rows = rows;
    this._render();
  }

  _render() {
    const { word } = this.word;
    const rowsHtml = this.rows.map((row, i) => {
      const segments = highlightSegments(row.name, matchPositions(hpArrows(word), row.name));
      const label = escapeHtml(this.word.glue ?? '') + (segments.length
        ? segments.map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('')
        : escapeHtml(row.name));
      const info = row.kind === 'command' ? this.app.commandInfo(row.name) : null;
      const detail = row.kind === 'variable' ? `Variable · ${typeName(varRecall(row.name))}`
        : row.kind === 'local' ? 'Local variable'
        : row.kind === 'unit' ? 'Unit'
        : row.kind === 'structure' ? 'Program structure'
        : info ? shortDescription(info.entry, 90) : '';
      const sig = info?.signature ?? row.group ?? '';
      return `<div class="ac-row${i === this.index ? ' on' : ''}${sig ? '' : ' nosig'}" role="option" aria-selected="${i === this.index}" data-i="${i}"><b>${label}</b><span>${escapeHtml(detail)}</span><em>${escapeHtml(sig)}</em></div>`;
    }).join('');
    const foot = onTouch() ? '<span>Tap completes · hold for the reference</span><span>Tap elsewhere closes</span>'
      : '<span>Tab completes · ↑↓ choose · → reference</span><span>Esc closes</span>';
    this.el.innerHTML = `${rowsHtml}<div class="ac-foot">${foot}</div>`;
    // A program's banner sits just above the line, so the list goes over it and INPUT's question and PROMPT's keys stay in view.
    const banner = globalThis.document?.getElementById('banner')?.offsetHeight;
    this.el.style.bottom = banner ? `calc(100% - 2px + ${banner}px)` : '';
    if (this.el.hidden) this.app.toasts?.dismiss('view');
    this.el.hidden = false;
    this._fit();
    markScrollEnds(this.el);
  }

  // The phone's keyboard can leave less room above the line than the rows take: the list then scrolls, the chosen
  // row in sight, instead of running off the top of the screen.
  _fit() {
    this.el.style.maxHeight = '';
    const r = this.el.getBoundingClientRect(), on = this.el.querySelector('.on');
    const oneRow = (on?.offsetHeight ?? 0) + this.el.offsetHeight - this.el.clientHeight;
    if (r.top < AC_MARGIN) this.el.style.maxHeight = `${Math.max(r.bottom - AC_MARGIN, oneRow)}px`;
    if (on) this.el.scrollTop = Math.max(0, on.offsetTop + on.offsetHeight - this.el.clientHeight);
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.rows = [];
    this.index = 0;
    this.shown = null;
  }

  // ↑ and ↓ put the highlighted completion in the line as they move; the list stays the one for what was typed.
  move(step) {
    if (!this.isOpen() || !this.rows.length) return false;
    this.index = (this.index + step + this.rows.length) % this.rows.length;
    const row = this.rows[this.index];
    this._replaceWord(row.words?.[0] ?? row.name);
    if (this.isOpen()) this._render();
    return true;
  }

  // A finger held on a command's row opens its reference, as → does from a keyboard; the click its lift makes is eaten.
  _bindHold() {
    let hold = null, held = false;
    const cancel = () => { if (hold) clearTimeout(hold.timer); hold = null; };
    document.addEventListener('pointerdown', () => { held = false; }, true);
    this.el.addEventListener('pointerdown', (e) => {
      const row = this.rows[e.target.closest('.ac-row')?.dataset.i];
      if (e.pointerType === 'mouse' || row?.kind !== 'command') return;
      const fire = () => { hold = null; held = true; this.app.buzzHold(); this.close(); this.app.drawers.showReference(row.name); };
      hold = { x: e.clientX, y: e.clientY, timer: setTimeout(fire, LONG_PRESS_MS) };
    });
    this.el.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) cancel(); });
    for (const type of ['pointerup', 'pointercancel']) this.el.addEventListener(type, cancel);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('click', (e) => { if (held) { held = false; e.preventDefault(); e.stopPropagation(); } }, true);
  }

  _replaceWord(text, glue = this.word.glue ?? '') {
    const { entry } = this.app;
    const { from } = this.word;
    this.shown = text;
    this._shownFrom = from + glue.length;
    entry._dispatch({ changes: { from, to: entry.cursor, insert: glue + text }, selection: { anchor: this._shownFrom + text.length } });
    entry._emit();
  }

  accept(i = this.index) {
    const row = this.rows[i];
    if (!row || !this.word) return;
    const { entry } = this.app;
    const { from } = this.word;
    const to = entry.cursor;
    if (row.words) {
      entry._dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
      this._dismissedWord = row.words[0];
      this.close();
      entry.typeStructure(row.words);
      return;
    }
    const text = entry.buffer;
    const spaced = (row.kind === 'command' || row.kind === 'local') && !isInsideAlgebraic(text, from) && !/^\s/.test(text.slice(to));
    const insert = `${this.word.glue ?? ''}${spaced ? `${row.name} ` : row.name}`;
    entry._dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
    this._dismissedWord = row.name;
    this.close();
    entry._emit();
  }

  _onKey(e) {
    if (!this.isOpen()) return;
    const { entry } = this.app;
    const consume = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      consume();
      this.move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      consume();
      this.accept();
    } else if (e.key === 'ArrowRight' && entry.cursor === entry.buffer.length && this.rows[this.index]?.kind === 'command') {
      consume();
      this.app.drawers.showReference(this.rows[this.index].name);
    } else if (e.key === 'Escape') {
      consume();
      this._dismissedWord = this.word?.word ?? null;
      if (this.shown) this._replaceWord(this.word.word, '');
      this.close();
    }
  }
}
