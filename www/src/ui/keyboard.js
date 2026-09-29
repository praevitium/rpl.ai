import { icon } from './icons.js';
import { escapeHtml } from './display.js';

// Alpha a..z runs across the first 26 keys (F1=a … ÷=z). Unlike the HP 50g it types
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

// While the command line has text these type into it; on an empty line they run the command.
const typeExec     = (ch, op) =>    (e) => e.typeOrExec(ch, op);
const typeExecFn   = fn =>          (e) => e.typeOrExecFn(fn);
const typeExecName = op =>          (e) => e.typeOrExecName(op);

export const SOFT_KEYS = [
  mk('F1', { alpha: 'a', className: 'menu', action: (e, s, app) => app.pressSoftKey(0) }),
  mk('F2', { alpha: 'b', className: 'menu', action: (e, s, app) => app.pressSoftKey(1) }),
  mk('F3', { alpha: 'c', className: 'menu', action: (e, s, app) => app.pressSoftKey(2) }),
  mk('F4', { alpha: 'd', className: 'menu', action: (e, s, app) => app.pressSoftKey(3) }),
  mk('F5', { alpha: 'e', className: 'menu', action: (e, s, app) => app.pressSoftKey(4) }),
  mk('F6', { alpha: 'f', className: 'menu', action: (e, s, app) => app.pressSoftKey(5) }),
];

export const NAV_KEYS = [
  mk('VARS', { alpha: 'g', action: (e, s, app) => app.showVarsMenu() }),
  mk('PREV', { alpha: 'h', action: (e, s, app) => app.prevMenuPage() }),
  mk('NEXT', { alpha: 'i', action: (e, s, app) => app.nextMenuPage() }),
  mk('HOME', { alpha: 'j', action: typeExecName('HOME') }),
  mk('STO',  { alpha: 'k', action: typeExecName('STO') }),
  mk('RCL',  { alpha: 'l', action: typeExecName('RCL') }),
];

export const ARROW_KEYS = [
  mk('CST', { kind: 'menu', className: 'cst-key',
              action: (_e, _s, app) => app.showCustomMenu() }),
  mk('▲', { kind: 'arrow', className: 'arrow-up',
            action: (e, _s, app) => {
              if (e.buffer.length === 0) app.selectLevel(1);
              else e.cursorUp();
            } }),
  mk('CAT', { kind: 'cat', className: 'cat-key',
              action: (_e, _s, app) => app.drawers.toggle('catalog') }),
  mk('◀', { kind: 'arrow', className: 'arrow-left',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorLeft();
              else app.prevMenuPage();
            } }),
  mk('▶', { kind: 'arrow', className: 'arrow-right',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorRight();
              else if (app.stack.depth >= 2) app.swapTop();
              else app.nextMenuPage();
            } }),
  mk('▼', { kind: 'arrow', className: 'arrow-down', shiftL: 'SST',
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

  mk('α',   { className: 'alpha-key', kind: 'alpha' }),
  mk('7',   { kind: 'digit', action: type('7') }),
  mk('8',   { kind: 'digit', action: type('8') }),
  mk('9',   { kind: 'digit', shiftR: '|',
              action: type('9'),
              shiftRAction: type('|') }),
  mk('×',   { shiftL: '[ ]', shiftR: '" "',
              action: typeExec('*', '*'),
              shiftLAction: (e) => e.typeWithCursor('[ ]', 2),
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
             shiftLAction: (e) => e.typeWithCursor('{ }', 2),
             shiftRAction: (e) => e.typeWithCursor('«  »', 2) }),

  mk('ON',    { kind: 'cancel', action: cancel,
                shiftL: 'CONT',
                shiftLAction: typeExecName('CONT') }),
  mk('0',     { kind: 'digit', shiftL: '∞',   shiftR: '→',
                action:       type('0'),
                shiftLAction: type('∞'),
                shiftRAction: type('→') }),
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

const NAV_ORDER = [
  NAV_KEYS[0], NAV_KEYS[1], NAV_KEYS[2], ARROW_KEYS[0], ARROW_KEYS[1], ARROW_KEYS[2],
  NAV_KEYS[3], NAV_KEYS[4], NAV_KEYS[5], ARROW_KEYS[3], ARROW_KEYS[5], ARROW_KEYS[4],
];

// The compact keypad hides the top two rows of five.
const COMPACT_HIDDEN = new Set(MAIN_KEYS.slice(0, 10));
const BACKSPACE_KEY = MAIN_KEYS.find((k) => k.kind === 'back');

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

// Buttons are built once and relabeled in place, so focus on a key survives shift changes.
export class Keypad {
  constructor({ el, app }) {
    this.el = el;
    this.app = app;
    this.buttons = [];
    el.innerHTML = `<div class="kp-head"><b>Keypad</b><div class="minseg" role="group" aria-label="Keypad layout"><button type="button" data-kp="full">Full</button><button type="button" data-kp="compact">Compact</button><button type="button" data-kp="hidden">Hide</button></div></div><div class="kp"><div class="kp-nav"></div><div class="kp-main"></div></div>`;
    this.kp = el.querySelector('.kp');
    NAV_ORDER.forEach((key) => this._add(el.querySelector('.kp-nav'), key));
    MAIN_KEYS.forEach((key) => this._add(el.querySelector('.kp-main'), key));
    el.querySelector('.kp-head').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kp]');
      if (b) app.setKeypadLayout(b.dataset.kp);
    });
  }

  _add(parent, key) {
    const el = document.createElement('button');
    el.type = 'button';
    const entry = { el, key };
    const effective = () => (this.compact && key.kind === 'cancel' ? BACKSPACE_KEY : key);
    const press = () => {
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 80);
      this.app.handleKey(effective());
    };
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
      this.app.showKeyLayers(effective(), el);
    });
    parent.appendChild(el);
    this.buttons.push(entry);
  }

  update() {
    const { app } = this;
    const layout = app.prefs.keypad;
    this.compact = layout === 'compact';
    this.el.classList.toggle('kp-hidden', layout === 'hidden');
    this.el.querySelectorAll('[data-kp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kp === layout)));
    const layer = app.layer();
    const locked = app.shiftLocked();
    this.kp.classList.toggle('compact', this.compact);
    this.kp.classList.toggle('hints', !!(app.prefs.hints || app.showKeyHints));
    this.kp.dataset.layer = layer ?? '';
    for (const entry of this.buttons) {
      const { el, key: raw } = entry;
      const key = this.compact && raw.kind === 'cancel' ? BACKSPACE_KEY : raw;
      const modifier = KEY_CLASS[key.kind];
      const active = modifier && app.shiftKind() === key.kind;
      let face = key.primary;
      let flipped = false;
      let dim = false;
      if (layer && !modifier) {
        const alt = layer === 'L' ? key.shiftL : layer === 'R' ? key.shiftR : key.alpha;
        if (alt) { face = alt; flipped = true; } else dim = true;
      }
      const caption = layer ? '' : app.keyCaption(key);
      const hint = PHYSICAL_HINTS[key.primary] ?? '';
      const txt = !FACE_ICONS[face] && !SUPERSCRIPT_FACES[face] && face.length > 2;
      const long = face.length > 5;
      const cls = ['k', key.kind === 'digit' ? 'digit' : '', key.className === 'enter' ? 'enter' : '', modifier ?? '',
        active ? 'active' : '', dim ? 'dim' : '', flipped ? 'flip' : '', COMPACT_HIDDEN.has(raw) ? 'hide-compact' : ''].filter(Boolean).join(' ');
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
