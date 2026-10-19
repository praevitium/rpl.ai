import { icon } from './icons.js';
import { escapeHtml } from './display.js';
import { holdToClear } from './input-area.js';

// Alpha a..z runs along the keypad's rows: a..f across the top row, g..l across the second,
// then m..z on the main keys (LASTARG=m … ÷=z). Unlike the HP 50g it types
// lowercase; op lookup is case-insensitive, so `sin` and SIN run the same command.
function mk(primary, opts = {}) {
  return {
    primary,
    shiftL:       opts.shiftL       ?? '',
    shiftR:       opts.shiftR       ?? '',
    alpha:        opts.alpha        ?? '',
    action:       opts.action       ?? null,
    shiftLAction: opts.shiftLAction ?? null,
    shiftRAction: opts.shiftRAction ?? null,
    kind:         opts.kind         ?? 'op',
    className:    opts.className    ?? '',
  };
}

const type   = text =>              (e) => e.type(text);
// ENTER and cancel go through the App so a pending level edit is committed or restored.
const enter  =                  (_e, _s, app) => app.commitEntry();
const back   =                      (e) => e.backspace();
const chs    =                      (e) => e.toggleSign();
const eex    =                      (e) => e.eex();
const cancel =                  (_e, _s, app) => app.runAction('ui.escape');

// As on the HP, these enter the command line and run, but type inside an open object.
const typeExec     = (ch, op) =>    (e) => e.pressOperator(ch, op);
const typeExecFn   = fn =>          (e) => e.pressFunction(fn);
const typeExecName = op =>          (e) => e.pressCommand(op);

export const SOFT_KEYS = [
  mk('F1', { className: 'menu', action: (e, s, app) => app.pressSoftKey(0) }),
  mk('F2', { className: 'menu', action: (e, s, app) => app.pressSoftKey(1) }),
  mk('F3', { className: 'menu', action: (e, s, app) => app.pressSoftKey(2) }),
  mk('F4', { className: 'menu', action: (e, s, app) => app.pressSoftKey(3) }),
  mk('F5', { className: 'menu', action: (e, s, app) => app.pressSoftKey(4) }),
  mk('F6', { className: 'menu', action: (e, s, app) => app.pressSoftKey(5) }),
];

export const NAV_KEYS = [
  mk('VARS', { alpha: 'a', action: (e, s, app) => app.showVarsMenu() }),
  mk('PREV', { alpha: 'b', action: (e, s, app) => app.prevMenuPage() }),
  mk('NEXT', { alpha: 'c', action: (e, s, app) => app.nextMenuPage() }),
  mk('HOME', { alpha: 'g', action: typeExecName('HOME') }),
  mk('STO',  { alpha: 'h', action: typeExecName('STO') }),
  mk('RCL',  { alpha: 'i', action: typeExecName('RCL') }),
];

export const ARROW_KEYS = [
  mk('CST', { alpha: 'd', kind: 'menu', className: 'cst-key',
              action: (_e, _s, app) => app.showCustomMenu() }),
  mk('▲', { alpha: 'e', kind: 'arrow', className: 'arrow-up',
            action: (e, _s, app) => {
              if (e.buffer.length === 0) app.selectLevel(1);
              else e.cursorUp();
            } }),
  mk('CAT', { alpha: 'f', kind: 'cat', className: 'cat-key',
              action: (_e, _s, app) => app.drawers.toggle('catalog') }),
  mk('◀', { alpha: 'j', kind: 'arrow', className: 'arrow-left',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorLeft();
              else app.prevMenuPage();
            } }),
  mk('▶', { alpha: 'l', kind: 'arrow', className: 'arrow-right',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorRight();
              else if (app.stack.depth >= 2) app.swapTop();
              else app.nextMenuPage();
            } }),
  mk('▼', { alpha: 'k', kind: 'arrow', className: 'arrow-down', shiftL: 'SST',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorDown();
              else if (app.stack.depth >= 1) app.editLevel(1);
            },
            shiftLAction: typeExecName('SST') }),
];

export const MAIN_KEYS = [
  mk('LASTARG', { alpha: 'm', action: typeExecName('LASTARG') }),
  mk('EVAL',  { alpha: 'n', action: typeExecName('EVAL') }),
  // ` stands in for the HP 50g ' key: backticks delimit algebraics, and a literal ' is on ↱3.
  mk('`',     { alpha: 'o', shiftL: 'i', shiftR: 'EQW',
                action:       type('`'),
                shiftLAction: type('i'),
                shiftRAction: (_e, _s, app) => app.openEquationEditor() }),
  // UNDO and REDO skip execOp, whose undo snapshot would make the first UNDO a no-op.
  mk('UNDO',  { alpha: 'p', shiftL: '∠', shiftR: 'REDO',
                action: (e) => {
                  if (e.isEditing()) { e.type('UNDO '); return; }
                  try { e.performUndo(); } catch (err) { e.flashError(err); }
                },
                shiftLAction: type('∠'),
                shiftRAction: (e) => {
                  if (e.isEditing()) { e.type('REDO '); return; }
                  try { e.performRedo(); } catch (err) { e.flashError(err); }
                } }),
  mk('⌫',     { kind: 'back', shiftL: 'DEL', shiftR: 'CLEAR',
                action:       back,
                shiftLAction: cancel,
                shiftRAction: typeExecName('CLEAR') }),

  mk('yˣ',  { alpha: 'q', shiftL: 'eˣ',   shiftR: 'LN',
              action: typeExec('^', '^'),
              shiftLAction: typeExecFn('EXP'),
              shiftRAction: typeExecFn('LN') }),
  mk('√x',  { alpha: 'r', shiftL: 'x²',   shiftR: 'ⁿ√y',
              action:       typeExecFn('SQRT'),
              shiftLAction: typeExecFn('SQ'),
              shiftRAction: typeExecFn('XROOT') }),
  mk('SIN', { alpha: 's', shiftL: 'ASIN', shiftR: 'Σ',
              action: typeExecFn('SIN'), shiftLAction: typeExecFn('ASIN'),
              shiftRAction: typeExecFn('SUM') }),
  mk('COS', { alpha: 't', shiftL: 'ACOS', shiftR: '∂',
              action: typeExecFn('COS'), shiftLAction: typeExecFn('ACOS'),
              shiftRAction: typeExecFn('DERIV') }),
  mk('TAN', { alpha: 'u', shiftL: 'ATAN', shiftR: '∫',
              action: typeExecFn('TAN'), shiftLAction: typeExecFn('ATAN'),
              shiftRAction: typeExecFn('INTEG') }),

  mk('EEX', { alpha: 'v', shiftL: '10ˣ', shiftR: 'LOG',
              action: eex, shiftLAction: typeExecFn('ALOG'),
              shiftRAction: typeExecFn('LOG') }),
  mk('+/-', { alpha: 'w', shiftL: '≠',   shiftR: '=',
              action:       chs,
              shiftLAction: typeExec('≠', '≠'),
              shiftRAction: type(' = ') }),
  mk('x',   { alpha: 'x', shiftL: '≤',   shiftR: '<',
              action:       type('x'),
              shiftLAction: typeExec('≤', '≤'),
              shiftRAction: typeExec('<', '<') }),
  mk('1/x', { alpha: 'y', shiftL: '≥',   shiftR: '>',
              action:       typeExecFn('INV'),
              shiftLAction: typeExec('≥', '≥'),
              shiftRAction: typeExec('>', '>') }),
  mk('÷',   { alpha: 'z', shiftL: 'ABS', shiftR: 'ARG',
              action: typeExec('/', '/'),
              shiftLAction: typeExecFn('ABS'),
              shiftRAction: typeExecFn('ARG') }),

  mk('α',   { className: 'alpha-key', kind: 'alpha', shiftL: 'USER' }),
  mk('7',   { kind: 'digit', action: type('7') }),
  mk('8',   { kind: 'digit', action: type('8') }),
  mk('9',   { kind: 'digit', shiftR: '|',
              action: type('9'),
              shiftRAction: type('|') }),
  mk('×',   { shiftL: '[ ]', shiftR: '" "',
              action: typeExec('*', '*'),
              shiftLAction: (e) => e.typeObject('[ ]', 2),
              shiftRAction: (e) => e.typeWithCursor('""', 1) }),

  mk('↰', { className: 'shift-l-key', kind: 'shiftL' }),
  mk('4',  { kind: 'digit', action: type('4') }),
  mk('5',  { kind: 'digit', action: type('5') }),
  mk('6',  { kind: 'digit', action: type('6') }),
  mk('−',  { shiftL: '( )', shiftR: '_',
             action: typeExec('-', '-'),
             shiftLAction: (e) => e.typeWithCursor('()', 1),
             shiftRAction: type('_') }),

  mk('↱', { className: 'shift-r-key', kind: 'shiftR' }),
  mk('1',  { kind: 'digit', action: type('1') }),
  mk('2',  { kind: 'digit', action: type('2') }),
  mk('3',  { kind: 'digit', shiftL: '#', shiftR: "'",
             action:       type('3'),
             shiftLAction: type('#'),
             shiftRAction: type("'") }),
  mk('+',  { shiftL: '{ }', shiftR: '« »',
             action: typeExec('+', '+'),
             shiftLAction: (e) => e.typeObject('{ }', 2),
             shiftRAction: (e) => e.typeObject('«  »', 2) }),

  mk('ON',    { kind: 'cancel', action: cancel,
                shiftL: 'CONT',
                shiftLAction: typeExecName('CONT') }),
  mk('0',     { kind: 'digit', shiftL: '∞',   shiftR: '→',
                action:       type('0'),
                shiftLAction: type('∞'),
                shiftRAction: (e) => e.pressArrow() }),
  mk('.',     { kind: 'digit', shiftL: '::',  shiftR: '↵',
                action:       type('.'),
                shiftLAction: type('::'),
                shiftRAction: type('\n') }),
  mk('SPC',   { shiftL: 'π',   shiftR: ',',
                action: type(' '),
                shiftLAction: type('π'),
                shiftRAction: type(', ') }),
  mk('ENTER', { className: 'enter', shiftR: '→NUM',
                action:       enter,
                shiftRAction: typeExecName('→NUM') }),
];

// The compact keypad: the keys an RPN session reaches for most, six by five, with
// trig on the shifted 7 8 9. Under α its keys run a..z, skipping α ⌫ SPC ENTER.
const main = (primary, opts) => ({ ...MAIN_KEYS.find((k) => k.primary === primary), ...opts });
const shiftKey = (kind, alpha) => ({ ...MAIN_KEYS.find((k) => k.kind === kind), alpha });
const trigDigit = (d, alpha, fn) => mk(d, { kind: 'digit', alpha, shiftL: fn, shiftR: `A${fn}`,
  action: type(d), shiftLAction: typeExecFn(fn), shiftRAction: typeExecFn(`A${fn}`) });
const stackKey = (name, alpha, left, right) => mk(name, { alpha, shiftL: left, shiftR: right,
  action: typeExecName(name), shiftLAction: typeExecName(left), shiftRAction: typeExecName(right) });

export const COMPACT_KEYS = [
  shiftKey('shiftL', 'a'), shiftKey('shiftR', 'b'), main('α'),
  main('`', { alpha: 'c', shiftL: 'EVAL', shiftLAction: typeExecName('EVAL') }),
  main('UNDO', { alpha: 'd', shiftL: '', shiftLAction: null }),
  main('⌫'),
  stackKey('SWAP', 'e', 'OVER', 'ROT'), trigDigit('7', 'f', 'SIN'), trigDigit('8', 'g', 'COS'), trigDigit('9', 'h', 'TAN'),
  main('yˣ', { alpha: 'i' }), main('÷', { alpha: 'j' }),
  stackKey('DROP', 'k', 'DUP', 'CLEAR'), main('4', { alpha: 'l' }), main('5', { alpha: 'm' }), main('6', { alpha: 'n' }),
  main('√x', { alpha: 'o' }), main('×', { alpha: 'p' }),
  main('+/-', { alpha: 'q' }), main('1', { alpha: 'r' }), main('2', { alpha: 's' }), main('3', { alpha: 't' }),
  main('1/x', { alpha: 'u' }), main('−', { alpha: 'v' }),
  main('EEX', { alpha: 'w' }), main('0', { alpha: 'x' }), main('.', { alpha: 'y' }), main('SPC'), main('ENTER'),
  main('+', { alpha: 'z' }),
];

const NAV_ORDER = [
  NAV_KEYS[0], NAV_KEYS[1], NAV_KEYS[2], ARROW_KEYS[0], ARROW_KEYS[1], ARROW_KEYS[2],
  NAV_KEYS[3], NAV_KEYS[4], NAV_KEYS[5], ARROW_KEYS[3], ARROW_KEYS[5], ARROW_KEYS[4],
];


const FACE_ICONS = { '▲': 'tri-u', '▼': 'tri-d', '◀': 'tri-l', '▶': 'tri-r', '⌫': 'back', '↵': 'enter' };
const SUPERSCRIPT_FACES = { 'yˣ': 'y<sup>x</sup>', 'eˣ': 'e<sup>x</sup>', '10ˣ': '10<sup>x</sup>', 'x²': 'x<sup>2</sup>', 'ⁿ√y': '<sup>n</sup>√y' };
const KEY_CLASS = { shiftL: 'shl', shiftR: 'shr', alpha: 'alp' };

const PHYSICAL_HINTS = Object.freeze({
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': '.', '+': '+', '−': '-', '×': '*', '÷': '/', 'yˣ': '^', 'SPC': 'Space', 'ENTER': '↵',
  '⌫': '⌫', 'ON': 'Esc', '▲': '↑', '▼': '↓', '◀': '←', '▶': '→', 'PREV': 'PgUp', 'NEXT': 'PgDn',
});

const MODIFIER_KEY_NAMES = Object.freeze({ shiftL: 'Left shift', shiftR: 'Right shift', alpha: 'Alpha' });
const KEY_NAMES = Object.freeze({ '⌫': 'Backspace', '▲': 'Up', '▼': 'Down', '◀': 'Left', '▶': 'Right' });

// The HP 50g's key codes for WAIT, row and column as rc: rows 4 to 10 match the HP keyboard, VARS, STO and NEXT are
// its VAR, STO and NXT, the keys rpl.ai adds beside them take the codes of its APPS, MODE and TOOL row, and the
// compact keypad's SWAP and DROP are the ▶ and ⌫ keys that do their work on an empty line.
const KEY_CODES = Object.freeze({
  F1: 11, F2: 12, F3: 13, F4: 14, F5: 15, F6: 16,
  HOME: 21, PREV: 22, RCL: 23, CST: 24, '▲': 25, CAT: 26,
  VARS: 31, STO: 32, NEXT: 33, '◀': 34, '▼': 35, '▶': 36,
  LASTARG: 41, EVAL: 42, '`': 43, UNDO: 44, '⌫': 45,
  'yˣ': 51, '√x': 52, SIN: 53, COS: 54, TAN: 55,
  EEX: 61, '+/-': 62, x: 63, '1/x': 64, '÷': 65,
  'α': 71, 7: 72, 8: 73, 9: 74, '×': 75,
  '↰': 81, 4: 82, 5: 83, 6: 84, '−': 85,
  '↱': 91, 1: 92, 2: 93, 3: 94, '+': 95,
  ON: 101, 0: 102, '.': 103, SPC: 104, ENTER: 105,
  SWAP: 36, DROP: 45,
});
const KEY_PLANES = Object.freeze({ L: 2, R: 3, A: 4 });

export function hpKeyCode(primary, layer = null) {
  const rc = KEY_CODES[primary];
  return rc == null ? null : Number(`${rc}.${KEY_PLANES[layer] ?? 1}`);
}

// A character typed on a keyboard while a program waits for a key: the keypad key that types it, a letter's under α.
const TYPED_KEYS = Object.freeze({ '+': '+', '-': '−', '*': '×', '/': '÷', '^': 'yˣ', ' ': 'SPC', '.': '.' });

export function typedKeyCode(text) {
  if (typeof text !== 'string' || text.length !== 1) return null;
  if (/[0-9]/.test(text)) return hpKeyCode(text);
  if (TYPED_KEYS[text]) return hpKeyCode(TYPED_KEYS[text]);
  const key = [...NAV_KEYS, ...ARROW_KEYS, ...MAIN_KEYS].find((k) => k.alpha === text.toLowerCase());
  return key ? hpKeyCode(key.primary, 'A') : null;
}

function faceHtml(label) {
  if (FACE_ICONS[label]) return icon(FACE_ICONS[label]);
  if (SUPERSCRIPT_FACES[label]) return SUPERSCRIPT_FACES[label];
  return escapeHtml(label);
}

function cornerHtml(label) {
  return SUPERSCRIPT_FACES[label] ?? escapeHtml(label === '↵' ? '⏎' : label);
}

function keyTitle(key, hint) {
  if (MODIFIER_KEY_NAMES[key.kind]) return MODIFIER_KEY_NAMES[key.kind];
  const bits = [KEY_NAMES[key.primary] ?? key.primary];
  if (key.shiftL) bits.push(`↰ ${key.shiftL}`);
  if (key.shiftR) bits.push(`↱ ${key.shiftR}`);
  if (hint) bits.push(`keyboard ${hint}`);
  return `${bits.join(' · ')}. Right-click for every layer.`;
}

const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 80;

// A held key repeats while canRepeat() holds, as the HP's cursor keys do. A long touch on Android
// also asks for a context menu, which would open the key's layers mid-repeat.
export function holdToRepeat(el, canRepeat, press) {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  const tick = (ms) => { timer = setTimeout(() => { if (canRepeat()) { press(); tick(REPEAT_MS); } else stop(); }, ms); };
  el.addEventListener('pointerdown', (ev) => {
    stop();
    if (ev.button === 0 && canRepeat()) tick(REPEAT_DELAY_MS);
  }, { capture: true });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, stop);
  el.addEventListener('contextmenu', (ev) => { if (timer) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, { capture: true });
}

// Arrows repeat where they move a cursor or walk the selected level; on an empty line ◀ ▶ ▼ turn
// pages, swap or edit, and a shifted arrow jumps, all of which happen once.
function arrowRepeats(key, app) {
  if (app.shift) return false;
  if (app.inputMode !== 'rpl' || app.entry.buffer) return true;
  return key.primary === '▲' || (key.primary === '▼' && app.selection != null);
}

// Buttons are built once and relabeled in place, so focus on a key survives shift changes.
export class Keypad {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    this.buttons = [];
    el.innerHTML = `<div class="kp-head"><b>Keypad</b><div class="minseg" role="group" aria-label="Keypad layout"><button type="button" data-kp="full">Full</button><button type="button" data-kp="compact">Compact</button><button type="button" data-kp="hidden">Hide</button></div><button type="button" class="icon-btn sm" data-kp-dock title="Dock the keypad on the other side" aria-label="Dock the keypad on the other side">${icon('dock', 'sm')}</button></div><div class="kp"><div class="kp-nav"></div><div class="kp-main"></div><div class="kp-compact"></div></div>`;
    this.kp = el.querySelector('.kp');
    NAV_ORDER.forEach((key) => this._add(el.querySelector('.kp-nav'), key));
    MAIN_KEYS.forEach((key) => this._add(el.querySelector('.kp-main'), key));
    COMPACT_KEYS.forEach((key) => this._add(el.querySelector('.kp-compact'), key));
    if (typeof ResizeObserver === 'function') {
      const fit = new ResizeObserver(() => this.fit());
      for (const child of el.parentElement?.children ?? []) fit.observe(child);
    }
    el.querySelector('.kp-head').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kp]');
      if (b) app.setKeypadLayout(b.dataset.kp);
      if (e.target.closest('[data-kp-dock]')) app.runAction('keypad.side');
    });
  }

  _add(parent, key) {
    const el = document.createElement('button');
    el.type = 'button';
    const entry = { el, key };
    if (key.kind === 'back') holdToClear(el, this.app);
    const press = () => {
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 80);
      this.app.handleKey(key);
    };
    if (key.kind === 'arrow') holdToRepeat(el, () => arrowRepeats(key, this.app), press);
    el.addEventListener('mousedown', (evt) => evt.preventDefault());
    el.addEventListener('pointerdown', (evt) => {
      if (evt.button !== 0) return;
      evt.preventDefault();
      press();
    });
    el.addEventListener('click', (evt) => {
      if (evt.detail !== 0) return;
      press();
      el.focus({ preventScroll: true });
    });
    el.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      this.app.showKeyLayers(key, el);
    });
    parent.appendChild(el);
    this.buttons.push(entry);
  }

  // When a writer or banner leaves the keypad less than its height, every key gives up the same
  // amount, down to 26 px, rather than the bottom row scrolling out of reach. A squeeze shows up as
  // the keypad's own resize; the room coming back does not, so every update refits, once a frame.
  fit() {
    const { el } = this;
    el.style.removeProperty('--key-h');
    const over = el.scrollHeight - el.clientHeight;
    if (over <= 0) return;
    const keys = this.buttons.map((b) => b.el).filter((k) => k.offsetParent);
    const rows = new Set(keys.map((k) => k.offsetTop)).size;
    if (!rows) return;
    const height = keys[0].getBoundingClientRect().height;
    el.style.setProperty('--key-h', `${Math.max(26, Math.floor(height - over / rows))}px`);
  }

  _scheduleFit() {
    if (this._fitPending || typeof requestAnimationFrame !== 'function') return;
    this._fitPending = true;
    requestAnimationFrame(() => { this._fitPending = false; this.fit(); });
  }

  update() {
    this._scheduleFit();
    const { app } = this;
    const layout = app.prefs.keypad;
    this.compact = app.keypadLayout() === 'compact';
    this.el.classList.toggle('kp-hidden', layout === 'hidden');
    this.el.querySelectorAll('[data-kp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kp === layout)));
    const layer = app.layer();
    const locked = app.shiftLocked();
    this.kp.classList.toggle('compact', this.compact);
    this.kp.classList.toggle('hints', !!(app.prefs.hints || app.showKeyHints));
    this.kp.dataset.layer = layer ?? '';
    for (const entry of this.buttons) {
      const { el, key } = entry;
      const modifier = KEY_CLASS[key.kind];
      const active = modifier && app.shiftKind() === key.kind;
      let face = key.primary;
      let flipped = false;
      let dim = false;
      if (layer && (!modifier || (layer === 'A' && key.alpha) || (layer === 'L' && key.kind === 'alpha'))) {
        const alt = layer === 'L' ? key.shiftL : layer === 'R' ? key.shiftR : key.alpha;
        if (alt) { face = alt; flipped = true; } else dim = true;
      }
      const caption = layer ? '' : app.keyCaption(key);
      const hint = PHYSICAL_HINTS[key.primary] ?? '';
      const txt = !FACE_ICONS[face] && !SUPERSCRIPT_FACES[face] && face.length > 2;
      const long = face.length > 5;
      const cls = ['k', key.kind === 'digit' ? 'digit' : '', key.className === 'enter' ? 'enter' : '', modifier ?? '',
        active ? 'active' : '', dim ? 'dim' : '', flipped ? 'flip' : ''].filter(Boolean).join(' ');
      const html = `${!layer && key.shiftL && !modifier ? `<span class="l">${cornerHtml(key.shiftL)}</span>` : ''}${!layer && key.shiftR && !modifier ? `<span class="r">${cornerHtml(key.shiftR)}</span>` : ''}<span class="p${txt ? ' txt' : ''}${long ? ' long' : ''}${flipped ? ' lay' : ''}">${faceHtml(face)}</span>${caption ? `<span class="cap">${escapeHtml(caption)}</span>` : ''}${active && locked ? '<span class="lock">LOCK</span>' : ''}${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}`;
      if (el.className !== cls) el.className = cls;
      if (entry.html !== html) { el.innerHTML = html; entry.html = html; }
      el.title = keyTitle(key, hint);
      const label = keyAccessibleName(key);
      if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    }
  }
}

export function keyAccessibleName(key) {
  if (MODIFIER_KEY_NAMES[key.kind]) return MODIFIER_KEY_NAMES[key.kind];
  return [
    KEY_NAMES[key.primary] ?? key.primary,
    key.shiftL && `left shift ${key.shiftL}`,
    key.shiftR && `right shift ${key.shiftR}`,
  ].filter(Boolean).join(', ');
}
