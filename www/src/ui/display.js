import { format, formatStackTop, DEFAULT_DISPLAY } from '../rpl/formatter.js';
import { astToSvg } from '../rpl/pretty.js';
import { TYPES, isSymbolic, isMatrix, isVector, isList, isTagged, isNumber, isBinaryInteger, isUnit, isString, isGrob } from '../rpl/types.js';
import { state as calcState, currentPath } from '../rpl/state.js';
import { icon } from './icons.js';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const GROB_PICTURE_MAX = { width: 240, height: 96, scale: 3 };

// A graphics object's pixels in the stack's ink, scaled up by whole steps while it is small; a frame shows its edges.
function grobPicture(g) {
  const canvas = document.createElement('canvas');
  canvas.className = 'grob';
  canvas.width = Math.max(1, g.width);
  canvas.height = Math.max(1, g.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stack-ink').trim() || '#000';
  const rowBytes = Math.ceil(g.width / 8);
  for (let row = 0; row < g.height; row++) {
    for (let col = 0; col < g.width; col++) {
      if ((g.bytes[row * rowBytes + (col >> 3)] >> (col & 7)) & 1) ctx.fillRect(col, row, 1, 1);
    }
  }
  const fit = Math.min(GROB_PICTURE_MAX.scale, GROB_PICTURE_MAX.width / canvas.width, GROB_PICTURE_MAX.height / canvas.height);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  canvas.style.width = `${canvas.width * scale}px`;
  return canvas;
}

const rowSig = (flat, svgSize, oneLine) => `${svgSize}|${calcState.textbookMode ? 1 : 0}|${oneLine ? 1 : 0}|${flat}`;
// Above level 1, as on the HP, a list keeps to one line, and so does a matrix taller than this, in its typed form.
const DEEP_GRID_ROWS = 3;
const gridRows = (v) => isMatrix(v) ? v.rows.length : isVector(v) && v.items.every(isVector) ? v.items.length : 1;
const oneLine = (value, level) => level > 1 && calcState.textbookMode && (isList(value) || gridRows(value) > DEEP_GRID_ROWS);
const levelTitle = (level) => `Level ${level}. Click to select, double-click to edit, drag to move.`;
const fromBottom = (view) => view.scrollHeight - view.scrollTop - view.clientHeight;
const scrollEdges = (el) => [el.scrollLeft > 1, el.scrollLeft + el.clientWidth < el.scrollWidth - 1];

function setScrollEdges(el, [left, right]) {
  el.classList.toggle('more-l', left);
  el.classList.toggle('more-r', right);
}

// Classes for edge fades on a sideways scroller, showing which way there is more.
export function markScrollEdges(el) {
  setScrollEdges(el, scrollEdges(el));
}

export function binaryBaseLabel(base) {
  return { h: 'HEX', d: 'DEC', o: 'OCT', b: 'BIN' }[base];
}

export function displayModeLabel(mode, digits) {
  const m = String(mode || 'STD').toUpperCase();
  return m === 'STD' ? 'STD' : `${m} ${digits}`;
}

export function coordModeGlyph(mode) {
  return { RECT: 'XYZ', CYLIN: 'R∠Z', SPHERE: 'R∠∠' }[mode] || 'XYZ';
}

const SUSPENDED_CONTEXT = 8;
// The faded top edge of a stack with levels above it; calc.css .stack-view.more-t and its scroll-padding-top match.
const TOP_FADE = 36;

// A level that fits shows whole, its toolbar included; a taller one from its top. The fade gives way to it (_measureMore).
function tallLevelScroll(view, v, r) {
  const at = r.top - v.top + view.scrollTop, top = Math.floor(at), toEnd = Math.ceil(at + r.height - v.height);
  return toEnd > top ? top : Math.min(Math.max(view.scrollTop, toEnd), top);
}
// Every level drawn costs layout on each command, so the stack draws the levels nearest level 1 and more on request.
const LEVEL_WINDOW = 50;
// A long formula shrinks to fit only this far; past it, it keeps a readable size and scrolls sideways as a wide matrix does.
const MIN_FORMULA_SCALE = 0.75;
// A grid of plain entries in em, for calc.css to shrink it to its line: Plex Mono's 0.6em advance per character,
// .1em of padding per entry, .9em between columns and .5em at each bracket.
const gridWidthEm = (texts) => {
  const cols = texts[0].map((_, j) => Math.max(...texts.map((r) => [...r[j]].length)) * 0.6 + 0.1);
  return (cols.reduce((a, b) => a + b, 0) + 0.9 * (cols.length - 1) + 1).toFixed(2);
};

export function suspendedProgramText(halted, display = DEFAULT_DISPLAY) {
  if (!halted || !Array.isArray(halted.tokens)) return '';
  const tokens = halted.tokens;
  const raw = halted.index;
  const index = Number.isInteger(raw) && raw >= 0
    ? Math.min(raw, tokens.length)
    : tokens.length;
  const fmt = (tok) => format(tok, display);
  const beforeAll = tokens.slice(0, index).map(fmt);
  const next = index < tokens.length ? fmt(tokens[index]) : null;
  const afterAll = index < tokens.length ? tokens.slice(index + 1).map(fmt) : [];
  const before = beforeAll.slice(-SUSPENDED_CONTEXT);
  const after = afterAll.slice(0, SUSPENDED_CONTEXT);
  const chunks = ['«'];
  if (beforeAll.length > SUSPENDED_CONTEXT) chunks.push('…');
  if (before.length) chunks.push(before.join(' '));
  chunks.push(next == null ? '▸' : `▸${next}`);
  if (after.length) chunks.push(after.join(' '));
  if (afterAll.length > SUSPENDED_CONTEXT) chunks.push('…');
  chunks.push('»');
  return chunks.join(' ');
}

const TYPE_NAMES = Object.freeze({
  [TYPES.REAL]: 'Real number',
  [TYPES.INTEGER]: 'Integer',
  [TYPES.RATIONAL]: 'Fraction',
  [TYPES.BININT]: 'Binary integer',
  [TYPES.COMPLEX]: 'Complex number',
  [TYPES.STRING]: 'String',
  [TYPES.NAME]: 'Name',
  [TYPES.SYMBOLIC]: 'Expression',
  [TYPES.LIST]: 'List',
  [TYPES.VECTOR]: 'Vector',
  [TYPES.MATRIX]: 'Matrix',
  [TYPES.PROGRAM]: 'Program',
  [TYPES.TAGGED]: 'Tagged object',
  [TYPES.DIRECTORY]: 'Directory',
  [TYPES.UNIT]: 'Unit object',
  [TYPES.GROB]: 'Graphic',
});

export function typeName(value) {
  return TYPE_NAMES[value?.type] ?? 'Object';
}

const clipText = (text, max = 28) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function describeValue(value) {
  const type = typeName(value);
  const shown = clipText(format(value));
  switch (value?.type) {
    case TYPES.STRING: return { type, text: `the string ${shown}` };
    case TYPES.NAME: return { type, text: `the name ${shown}` };
    case TYPES.SYMBOLIC: return { type, text: `the expression ${shown}` };
    case TYPES.PROGRAM: return { type, text: 'a program' };
    case TYPES.LIST: return { type, text: `a list of ${value.items.length} item${value.items.length === 1 ? '' : 's'}` };
    case TYPES.MATRIX: return { type, text: `a ${value.rows.length}×${value.rows[0]?.length ?? 0} matrix` };
    case TYPES.VECTOR: return { type, text: `a vector of ${value.items.length}` };
    case TYPES.DIRECTORY: return { type, text: 'a folder' };
    case TYPES.UNIT: return { type, text: `the unit object ${shown}` };
    case TYPES.TAGGED: return { type, text: `the tagged object ${shown}` };
    default: return { type, text: `the ${type.toLowerCase()} ${shown}` };
  }
}

export function suspendedProgramHtml(halted, display = DEFAULT_DISPLAY) {
  const text = suspendedProgramText(halted, display);
  if (!text) return '';
  const at = text.indexOf('▸');
  if (at < 0) return escapeHtml(text);
  const rest = text.slice(at + 1);
  const end = rest.search(/\s|$/);
  const next = rest.slice(0, end);
  return `${escapeHtml(text.slice(0, at))}<mark>${escapeHtml(next || 'end')}</mark>${escapeHtml(rest.slice(end))}`;
}

const MARK_TAGS = Object.freeze({ arg: 'argument', culprit: 'this one' });

const MODE_NAMES = Object.freeze({
  angle: 'angle', fmt: 'number format', exact: 'exact or approximate',
  complex: 'real or complex', coord: 'coordinates', base: 'integer base',
});

const editTarget = (editing) => (typeof editing === 'number' ? `level ${editing}` : editing);

const prefersReducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const swipeThreshold = (width) => Math.min(120, width * 0.35);
export const LONG_PRESS_MS = 450;

export class Display {
  constructor({ stackView, cmdline, statusLine }) {
    this.stackView = stackView;
    this.cmdline = cmdline;
    this.statusLine = statusLine;
    this.displayOpts = { ...DEFAULT_DISPLAY };
    this.selectedLevel = null;
    this.shownLevels = LEVEL_WINDOW;
    this._hidden = 0;
    this._fromBottom = 0;
    this._anchor = null;
    this._stack = null;
    this.marks = null;
    this.ghosts = null;
    this.previewLabel = '';
    this.previewFails = false;
    this.emptyHtml = '';
    this.rowActionsHtml = null;
    this.onRowClick = null;
    this.onRowDoubleClick = null;
    this.onRowAction = null;
    this.onRowMove = null;
    this.onRowSwipe = null;
    this.onStatusAction = null;
    this.onEmptyAction = null;
    this._ids = new WeakMap();
    this._rowSigs = new WeakMap();
    this._nextId = 1;
    this._dragLevel = null;
    this._live = null;
    this._more = null;
    this._installHandlers();
  }

  _installHandlers() {
    const view = this.stackView;
    view.addEventListener('click', (ev) => {
      if (performance.now() - this._swipedAt < 400) return;
      if (ev.target.closest?.('.st-older')) { this._showOlder(); return; }
      const empty = ev.target.closest?.('[data-empty-act]');
      if (empty) { this.onEmptyAction?.(empty.dataset.emptyAct, empty); return; }
      const row = ev.target.closest?.('.st-row[data-level]');
      if (!row) return;
      const level = Number(row.dataset.level);
      const act = ev.target.closest?.('[data-row-act]');
      if (act) { this.onRowAction?.(level, act.dataset.rowAct, act); return; }
      // The first click re-renders the rows, so the browser's dblclick would land on a removed element.
      if (ev.detail === 2 && !ev.target.closest?.('.st-acts')) { this.onRowDoubleClick?.(level); return; }
      this.onRowClick?.(level, ev);
    });
    view.addEventListener('dragstart', (ev) => {
      const row = ev.target.closest?.('.st-row[data-level]');
      if (!row) return;
      this._dragLevel = Number(row.dataset.level);
      row.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', row.querySelector('.value-text')?.textContent ?? ''); ev.dataTransfer.effectAllowed = 'move'; }
      catch { /* some engines refuse setData outside a trusted drag */ }
    });
    view.addEventListener('dragover', (ev) => {
      if (this._dragLevel == null) return;
      const row = ev.target.closest?.('.st-row[data-level]');
      view.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      if (!row) return;
      ev.preventDefault();
      row.classList.add('drag-over');
    });
    view.addEventListener('drop', (ev) => {
      if (this._dragLevel == null) return;
      ev.preventDefault();
      const row = ev.target.closest?.('.st-row[data-level]');
      const from = this._dragLevel;
      this._dragLevel = null;
      if (row) this.onRowMove?.(from, Number(row.dataset.level));
    });
    view.addEventListener('dragend', () => {
      this._dragLevel = null;
      view.querySelectorAll('.dragging, .drag-over').forEach((el) => el.classList.remove('dragging', 'drag-over'));
    });
    this._installSwipe(view);
    this._installLongPress(view);
    view.addEventListener('scroll', () => {
      if (this._renderScroll) return;
      this._fromBottom = fromBottom(view);
      this._updateMore();
    }, { passive: true });
    view.addEventListener('scroll', (ev) => {
      if (ev.target.classList?.contains('st-val')) markScrollEdges(ev.target);
    }, { capture: true, passive: true });
    // A view that shrinks under a writer, the keyboard or a turned phone keeps the selected level, or else level 1, in
    // sight (W-M16). Level 1 goes by the distance from the bottom last seen, since a writer closing grows the view and
    // the keypad's refit shrinks it again in one frame.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const selected = view.querySelector('.st-row.sel');
        if (selected) this._reveal(selected);
        else if (this._fromBottom <= 2) view.scrollTop = view.scrollHeight;
        this._fromBottom = fromBottom(view);
        const markEdges = this._measureEdges();
        const more = this._measureMore();
        markEdges();
        this._showMore(more);
      }).observe(view);
    }
    const statusAction = (el) => this.onStatusAction?.(el.dataset.status, el.dataset, el);
    this.statusLine?.addEventListener?.('click', (ev) => {
      const el = ev.target.closest?.('[data-status]');
      if (el) statusAction(el);
    });
    this.statusLine?.addEventListener?.('keydown', (ev) => {
      const el = (ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('[data-status][role="button"]');
      if (!el) return;
      ev.preventDefault();
      statusAction(el);
    });
  }

  _installSwipe(view) {
    this._swipedAt = -Infinity;
    let swipe = null;
    view.addEventListener('pointerdown', (ev) => {
      swipe = null;
      if (this._dropping || ev.pointerType === 'mouse' || !ev.isPrimary || ev.target.closest?.('.st-acts')) return;
      const row = ev.target.closest?.('.st-row[data-key]');
      if (row) swipe = { row, id: ev.pointerId, pen: ev.pointerType === 'pen', x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY, dx: 0, active: false };
    });
    // A pen starts the rows' native drag before it moves far enough to swipe, and
    // dragstart reports the press point, so the direction comes from the last move:
    // a clearly vertical start keeps the drag to reorder, anything else swipes.
    view.addEventListener('dragstart', (ev) => {
      if (!swipe?.pen) return;
      if (Math.abs(swipe.lastY - swipe.y) > Math.abs(swipe.lastX - swipe.x)) { swipe = null; return; }
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }, true);
    view.addEventListener('pointermove', (ev) => {
      if (swipe?.id !== ev.pointerId) return;
      if (this._held) { swipe = null; return; }
      swipe.lastX = ev.clientX;
      swipe.lastY = ev.clientY;
      const dx = ev.clientX - swipe.x;
      if (!swipe.active) {
        if (Math.abs(ev.clientY - swipe.y) > 10) { swipe = null; return; }
        if (Math.abs(dx) < 10) return;
        swipe.active = true;
        swipe.row.setPointerCapture?.(ev.pointerId);
        swipe.row.classList.add('swiping');
      }
      swipe.dx = dx;
      const width = swipe.row.offsetWidth || 1;
      swipe.row.style.transform = `translateX(${dx}px)`;
      swipe.row.style.opacity = String(1 - Math.min(0.6, Math.abs(dx) / width));
      swipe.row.classList.toggle('swipe-armed', Math.abs(dx) > swipeThreshold(width));
    });
    const end = (ev) => {
      if (swipe?.id !== ev.pointerId) return;
      const { row, dx, active } = swipe;
      swipe = null;
      if (!active) return;
      this._swipedAt = performance.now();
      const width = row.offsetWidth || 1;
      const drop = ev.type === 'pointerup' && Math.abs(dx) > swipeThreshold(width);
      const to = drop ? Math.sign(dx) * width : 0;
      // Until the drop lands, the levels are not final, so another swipe waits.
      this._dropping = drop;
      const settle = () => {
        this._dropping = false;
        row.classList.remove('swiping', 'swipe-armed');
        row.style.transform = '';
        row.style.opacity = '';
        if (drop) this.onRowSwipe?.(Number(row.dataset.level));
      };
      if (prefersReducedMotion() || !row.animate) { settle(); return; }
      const anim = row.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${to}px)`, opacity: drop ? 0 : 1 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = () => { anim.cancel(); settle(); };
    };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
  }

  // A finger held on a level opens its menu. iOS fires no contextmenu for a touch, so a timer stands in;
  // on Android whichever comes first opens it and the native menu stays shut.
  _installLongPress(view) {
    this._held = false;
    let hold = null;
    const cancel = () => { clearTimeout(hold?.timer); hold = null; };
    const fire = () => {
      const level = hold.level;
      cancel();
      this._held = true;
      this.onRowHold?.(level);
    };
    // The finger lifts over the menu it opened, and that release is no tap on the menu.
    const doc = view.ownerDocument;
    doc?.addEventListener('pointerdown', () => { this._held = false; }, true);
    doc?.addEventListener('click', (ev) => {
      if (!this._held) return;
      this._held = false;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    view.addEventListener('pointerdown', (ev) => {
      cancel();
      if (ev.pointerType !== 'touch' || !ev.isPrimary || ev.target.closest?.('.st-acts')) return;
      const row = ev.target.closest?.('.st-row[data-key]');
      if (row) hold = { level: Number(row.dataset.level), x: ev.clientX, y: ev.clientY, timer: setTimeout(fire, LONG_PRESS_MS) };
    });
    view.addEventListener('pointermove', (ev) => {
      if (hold && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 10) cancel();
    });
    view.addEventListener('pointerup', cancel);
    view.addEventListener('pointercancel', cancel);
    view.addEventListener('contextmenu', (ev) => {
      if (!hold && !this._held) return;
      ev.preventDefault();
      if (hold) fire();
    });
  }

  _idOf(value) {
    if (value === null || typeof value !== 'object') return `p${String(value)}`;
    let id = this._ids.get(value);
    if (!id) { id = this._nextId++; this._ids.set(value, id); }
    return id;
  }

  _positions() {
    const map = new Map();
    for (const row of this.stackView.querySelectorAll('.st-row[data-key]')) {
      map.set(row.dataset.key, row.getBoundingClientRect().top);
    }
    return map;
  }

  renderStack(stack) {
    this._stack = stack;
    const view = this.stackView;
    const before = this._positions();
    // Inside the app's size container a style read after the rows change lays the whole page out, so read it now.
    const svgSize = parseFloat(getComputedStyle(view).fontSize) || 18;
    const values = stack.snapshot();
    const depth = values.length;
    this.displayOpts.mode = calcState.displayMode || 'STD';
    this.displayOpts.digits = calcState.displayDigits ?? 12;
    if (this.selectedLevel != null && this.selectedLevel > depth) this.selectedLevel = depth || null;
    if (depth <= LEVEL_WINDOW) this.shownLevels = LEVEL_WINDOW;
    const shown = Math.min(depth, Math.max(this.shownLevels, this.selectedLevel ?? 0));
    this._hidden = depth - shown;
    if (!depth && !this.ghosts?.length) {
      view.innerHTML = this.emptyHtml;
      view.dataset.empty = '1';
      this._updateMore();
      return;
    }
    const entries = [];
    const seen = new Map();
    for (let level = shown; level >= 1; level--) {
      const value = values[level - 1];
      const id = this._idOf(value);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      const flat = formatStackTop(value, this.displayOpts);
      entries.push({ value, level, key: `${id}.${n}`, flat, sig: rowSig(flat, svgSize, oneLine(value, level)) });
    }
    const frag = this._placeRows(entries, svgSize);
    delete view.dataset.empty;
    (this.ghosts ?? []).forEach((value, j, all) => {
      const row = this._row(value, all.length - j, null, svgSize);
      row.classList.add('ghost');
      row.querySelector('.st-tag').textContent = 'result';
      frag.appendChild(row);
    });
    if (this.previewLabel) {
      const label = document.createElement('div');
      label.className = `st-preview-label${this.previewFails ? ' fails' : ''}`;
      label.textContent = this.previewLabel;
      frag.appendChild(label);
    }
    view.appendChild(frag);
    const selected = view.querySelector('.st-row.sel');
    if (this._anchor != null) view.scrollTop = view.scrollHeight - this._anchor;
    else if (selected) this._reveal(selected);
    else view.scrollTop = view.scrollHeight;
    this._anchor = null;
    // The scroll event this causes would measure the rows again for the pill, which the lines below do.
    this._renderScroll = true;
    requestAnimationFrame(() => { this._renderScroll = false; });
    // Every measurement comes before any change, so the rows are laid out once, not once per change. A program that
    // WAITs in a loop redraws the stack many times a second, so its rows change in place, as on the HP's display.
    const animate = !this.ghosts && !this.marks && before.size && !prefersReducedMotion() && calcState.halted?.kind !== 'wait';
    const after = animate ? this._positions() : null;
    this._fromBottom = fromBottom(view);
    const markEdges = this._measureEdges();
    const more = view.parentElement ? this._measureMore() : null;
    if (animate) this._animate(before, after);
    markEdges();
    if (more) this._showMore(more);
  }

  // The levels above the first one a change reaches keep their rows, so a key lays out only the rows it touched.
  // Returns the rows that go below the kept ones.
  _placeRows(entries, svgSize) {
    const view = this.stackView;
    const old = view.dataset.empty || this.marks ? [] : [...view.querySelectorAll(':scope > .st-row[data-key]')];
    const first = old.findIndex((row) => row.dataset.key === entries[0]?.key);
    const from = Math.max(0, first);
    const to = first >= 0 ? 0 : Math.max(0, entries.findIndex((e) => e.key === old[0]?.dataset.key));
    let n = 0;
    while (from + n < old.length && to + n < entries.length && this._reusable(old[from + n], entries[to + n])) n++;
    const kept = old.slice(from, from + n);
    const keep = new Set(kept);
    for (const child of [...view.children]) if (!keep.has(child)) child.remove();
    const head = document.createDocumentFragment();
    const spacer = document.createElement('div');
    spacer.className = 'st-spacer';
    head.appendChild(spacer);
    if (this._hidden) head.appendChild(this._olderButton());
    for (const e of entries.slice(0, to)) head.appendChild(this._row(e.value, e.level, e.key, svgSize));
    view.insertBefore(head, kept[0] ?? null);
    kept.forEach((row, k) => this._relevel(row, entries[to + k]));
    const tail = document.createDocumentFragment();
    for (const e of entries.slice(to + n)) tail.appendChild(this._row(e.value, e.level, e.key, svgSize));
    return tail;
  }

  _reusable(row, entry) {
    return row.className === 'st-row' && row.dataset.key === entry.key && this.selectedLevel !== entry.level
      && this._rowSigs.get(row) === entry.sig;
  }

  _relevel(row, { level, flat }) {
    if (row.dataset.level === String(level)) return;
    row.dataset.level = String(level);
    row.querySelector('.st-lvl').textContent = String(level);
    row.title = levelTitle(level);
    row.setAttribute('aria-label', `Level ${level}: ${flat}`);
  }

  _olderButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip st-older';
    button.textContent = `Show ${Math.min(LEVEL_WINDOW, this._hidden)} more of ${this._hidden.toLocaleString('en-US')} levels`;
    return button;
  }

  // The levels already in view stay where they are; the older ones arrive above them.
  _showOlder() {
    const view = this.stackView;
    this._anchor = view.scrollHeight - view.scrollTop;
    this.shownLevels += LEVEL_WINDOW;
    this.renderStack(this._stack);
  }

  // Measures now and marks later, so a caller can take every measurement before changing anything.
  _measureEdges() {
    const vals = [...this.stackView.querySelectorAll('.st-val')];
    const edges = vals.map(scrollEdges);
    return () => vals.forEach((el, i) => setScrollEdges(el, edges[i]));
  }

  // Rects rounded outward, not offsets: a level's fractional height rounded away leaves its bottom edge under the
  // view's, as scrollIntoView would, which also keeps a level too tall for the fade's padding under it and scrolls the app.
  _reveal(row) {
    const view = this.stackView, v = view.getBoundingClientRect(), r = row.getBoundingClientRect();
    if (r.height > v.height - TOP_FADE) view.scrollTop = tallLevelScroll(view, v, r);
    else if (r.bottom > v.bottom) view.scrollTop += Math.ceil(r.bottom - v.bottom);
    else if (r.top < v.top + TOP_FADE) view.scrollTop -= Math.ceil(v.top + TOP_FADE - r.top);
  }

  _updateMore() {
    if (this.stackView?.parentElement) this._showMore(this._measureMore());
  }

  // A level that ends inside the faded top edge, under the pill, can't be read, so it counts as above; a selected level reaching through it puts both away.
  _measureMore() {
    const view = this.stackView, edge = view.scrollTop + TOP_FADE, top = view.offsetTop + 6;
    const sel = view.querySelector('.st-row.sel');
    if (sel && sel.offsetTop < edge && sel.offsetTop + sel.offsetHeight > edge) return { above: 0, top };
    const rows = [...view.querySelectorAll('.st-row[data-key]')];
    const above = rows.filter((row) => row.offsetTop + row.offsetHeight <= edge).length;
    // A top level cut by a short view fades as well, though the pill counts only levels wholly above.
    return { above, top, cut: rows.length > 0 && rows[0].offsetTop < view.scrollTop };
  }

  _showMore({ above, top, cut }) {
    const view = this.stackView;
    view.classList.toggle('more-t', above > 0 || cut);
    const count = above && above + this._hidden;
    if (!this._more) {
      this._more = document.createElement('button');
      this._more.type = 'button';
      this._more.className = 'st-more';
      this._more.addEventListener('click', () => view.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
      view.parentElement.appendChild(this._more);
    }
    this._more.hidden = !count;
    this._more.textContent = `${count.toLocaleString('en-US')} more level${count === 1 ? '' : 's'} above`;
    this._more.style.top = `${top}px`;
  }

  // Measure every row before starting any animation: a measurement after one starts lays out the whole stack again.
  _animate(before, after) {
    for (const row of this.stackView.querySelectorAll('.st-row[data-key]')) {
      const top = after.get(row.dataset.key);
      const old = before.get(row.dataset.key);
      if (old == null) {
        row.animate?.([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else if (Math.abs(old - top) > 1) {
        row.animate?.([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
  }

  _row(value, level, key, svgSize) {
    const row = document.createElement('div');
    row.className = 'st-row';
    row.setAttribute('role', 'listitem');
    row.dataset.level = String(level);
    if (key) {
      row.dataset.key = key;
      row.draggable = true;
      row.title = levelTitle(level);
    }
    const mark = this.marks?.[level];
    if (mark && key) row.classList.add(mark);
    const selected = key && this.selectedLevel === level;
    if (selected) row.classList.add('sel');
    const lvl = document.createElement('span');
    lvl.className = 'st-lvl';
    lvl.textContent = String(level);
    const tag = document.createElement('span');
    tag.className = 'st-tag';
    tag.textContent = (mark && key && MARK_TAGS[mark]) || typeName(value);
    const cell = document.createElement('span');
    cell.className = 'st-val';
    const short = !selected && oneLine(value, level);
    const text = this._fillValue(cell, value, svgSize, short);
    this._rowSigs.set(row, rowSig(text, svgSize, short));
    row.setAttribute('aria-label', `Level ${level}: ${text}`);
    row.append(lvl, tag, cell);
    if (selected && this.rowActionsHtml) row.insertAdjacentHTML('beforeend', this.rowActionsHtml(level, value));
    return row;
  }

  _fillValue(cell, value, svgSize, short = false) {
    const flat = formatStackTop(value, this.displayOpts);
    if (short) cell.classList.add('one-line');
    if (calcState.textbookMode && isSymbolic(value)) {
      const { svg, width } = astToSvg(value.expr, { size: svgSize });
      cell.innerHTML = svg;
      cell.firstElementChild.style.minWidth = `${Math.round(width * MIN_FORMULA_SCALE)}px`;
      cell.classList.add('textbook');
    } else if (calcState.textbookMode && isList(value)) {
      cell.innerHTML = this._renderTextbookList(value, svgSize);
      cell.classList.add('textbook');
    } else if (calcState.textbookMode && (isMatrix(value) || isVector(value)) && !short) {
      cell.innerHTML = this._renderTextbookGrid(value);
      cell.classList.add('textbook');
    } else if (isGrob(value) && !short) {
      const box = document.createElement('span');
      box.className = 'grob-value';
      const size = document.createElement('span');
      size.className = 'value-text';
      size.textContent = flat;
      box.append(grobPicture(value), size);
      cell.appendChild(box);
    } else {
      const span = document.createElement('span');
      span.className = 'value-text';
      const label = isTagged(value) ? `${value.tag}: ` : null;
      if (label && flat.startsWith(label)) {
        // A long tag gives way to the value it labels, each ending in an ellipsis of its own.
        span.classList.add('tagged');
        const name = document.createElement('span');
        name.className = 'tag-name';
        name.textContent = value.tag;
        const rest = document.createElement('span');
        rest.className = 'tag-value';
        rest.textContent = flat.slice(label.length - 2);
        span.append(name, rest);
      } else if (isNumber(value) || isBinaryInteger(value) || isUnit(value)) {
        // A number wraps, breaking before an exponent first, where an ellipsis would hide its exponent or last digits;
        // a unit also breaks before its _ and after a * or / outside parentheses, never inside s^3 or (A*s^3).
        span.classList.add('num');
        flat.split(isUnit(value) ? /(?=[E_])|(?<=[*/])(?![^(]*\))/ : /(?=E)/).forEach((part, i) => span.append(...(i ? [document.createElement('wbr')] : []), part));
      } else {
        if (isString(value)) span.classList.add('str');
        span.textContent = flat;
      }
      cell.appendChild(span);
    }
    return flat;
  }

  // A vector of equal-length vectors (how the parser reads [[1 2][3 4]]) lays out as a matrix.
  _renderTextbookGrid(val) {
    let rows;
    if (isMatrix(val)) {
      rows = val.rows;
    } else if (
      isVector(val) &&
      val.items.length > 0 &&
      val.items.every(it => isVector(it)) &&
      val.items.every(it => it.items.length === val.items[0].items.length)
    ) {
      rows = val.items.map(v => v.items);
    } else {
      rows = [val.items];
    }
    const ncols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const texts = rows.map(r => r.concat(Array(Math.max(0, ncols - r.length)).fill(null))
      .map(cell => (cell === null ? '' : isSymbolic(cell) ? null : format(cell, this.displayOpts))));
    const cells = texts.map((r, i) => r.map((text, j) => {
      if (text !== null) return `<span class="mcell">${escapeHtml(text)}</span>`;
      const { svg } = astToSvg(rows[i][j].expr, { size: 18 });
      return `<span class="mcell mcell-sym">${svg}</span>`;
    }).join(''));
    const fit = ncols > 0 && texts.every(r => !r.includes(null));
    const cls = `matrix-grid${isMatrix(val) ? '' : ' vector-grid'}${fit ? ' fit' : ''}`;
    return `<span class="${cls}" style="--mcols:${Math.max(1, ncols)}${fit ? `;--mw:${gridWidthEm(texts)}` : ''}">${cells.join('')}</span>`;
  }

  _renderTextbookList(val, svgSize = 22) {
    const items = val.items.map(item => {
      if (isSymbolic(item)) {
        const { svg } = astToSvg(item.expr, { size: svgSize });
        return `<span class="lcell lcell-sym">${svg}</span>`;
      }
      if (isList(item)) return `<span class="lcell">${this._renderTextbookList(item, svgSize)}</span>`;
      return `<span class="lcell">${escapeHtml(format(item, this.displayOpts))}</span>`;
    });
    return `<span class="list-inline">{ ${items.join('<span class="lsep"> </span>')} }</span>`;
  }

  renderCmdline(entry) {
    this.cmdline.classList.toggle('empty', entry.buffer.length === 0);
  }

  renderStatus({ classic = false, minimal = false, shift = null, halted = null, editing = null, alarm = false } = {}) {
    const el = this.statusLine;
    if (!el) return;
    const layer = shift?.startsWith('shiftL') ? 'l' : shift?.startsWith('shiftR') ? 'r' : shift?.startsWith('alpha') ? 'a' : '';
    const locked = !!shift?.endsWith('Lock');
    const pathHtml = pathSegmentsHtml(currentPath());
    const minimalButtons = minimal
      ? `<button type="button" class="ann-btn" data-status="menu" title="Menu" aria-label="Menu" aria-haspopup="menu">${icon('more', 'sm')}</button><button type="button" class="ann-btn" data-status="fullscreen" title="Full screen" aria-label="Full screen">${icon('full', 'sm')}</button><button type="button" class="ann-btn" data-status="leave-minimal" title="Leave minimal view" aria-label="Leave minimal view">${icon('collapse', 'sm')}</button>`
      : '';
    const editMark = editing ? `<button type="button" class="ann-m e" data-status="cancel-edit" title="Editing ${escapeHtml(editTarget(editing))}: tap to cancel" aria-label="Cancel editing ${escapeHtml(editTarget(editing))}">${icon('edit', 'sm')}${typeof editing === 'number' ? editing : ''}</button>` : '';
    const alarmMark = alarm ? `<button type="button" class="${minimal || classic ? 'ann-m' : 'pill'} alarm" data-status="alarm" title="An alarm is past due: tap to see it" aria-label="An alarm is past due">((•))</button>` : '';
    if (classic) {
      const g = (items, cls = '', mode = '') => `<div class="ann-g ${cls}"${mode ? ` data-status="mode" data-mode="${mode}" role="button" tabindex="0" title="Change ${MODE_NAMES[mode]}"` : ''}>${items.map(([t, on, c]) => `<span class="${on ? 'on' : ''} ${c || ''}">${t}</span>`).join('')}</div>`;
      el.innerHTML = [
        g([['↰', layer === 'l', 'l'], ['↱', layer === 'r'], ['α', layer === 'a']]),
        g([['RAD', calcState.angle === 'RAD'], ['DEG', calcState.angle === 'DEG'], ['GRD', calcState.angle === 'GRD']], '', 'angle'),
        g([['XYZ', calcState.coordMode === 'RECT'], ['R∠Z', calcState.coordMode === 'CYLIN'], ['R∠∠', calcState.coordMode === 'SPHERE']], 'opt', 'coord'),
        g([['=', !calcState.approxMode], ['~', calcState.approxMode]], '', 'exact'),
        g([['ℝ', !calcState.complexMode], ['ℂ', calcState.complexMode]], '', 'complex'),
        g([['HALT', !!halted]], 'opt'),
        alarmMark,
        editMark,
        `<div class="ann-path">${pathHtml}</div>`,
        minimal ? `<div class="ann-g" style="gap:0">${minimalButtons}</div>` : '',
      ].join('');
      el.className = 'status-line';
      return;
    }
    if (minimal) {
      const modes = [
        ['angle', calcState.angle],
        ['coord', coordModeGlyph(calcState.coordMode)],
        ['base', binaryBaseLabel(calcState.binaryBase) ?? ''],
        ['fmt', displayModeLabel(calcState.displayMode, calcState.displayDigits)],
        ['complex', calcState.complexMode ? 'ℂ' : 'ℝ'],
        ['exact', calcState.approxMode ? '~' : '='],
      ].filter(([, t]) => t);
      const layerMark = layer ? `<span class="ann-m ${layer}">${{ l: '↰', r: '↱', a: 'α' }[layer]}${locked ? ' LOCK' : ''}</span>` : '';
      const haltMark = halted ? '<span class="ann-m l halt">HALT</span>' : '';
      el.innerHTML = `<div class="ann-status">${modes.map(([m, t]) => `<button type="button" class="ann-m" data-status="mode" data-mode="${m}" title="Change ${MODE_NAMES[m]}">${escapeHtml(t)}</button>`).join('')}${layerMark}${haltMark}${alarmMark}${editMark}<span class="ann-sp"></span><span class="ann-path">${pathHtml}</span>${minimalButtons}</div>`;
      el.className = 'status-line';
      return;
    }
    const pills = [];
    if (layer === 'l') pills.push(`<span class="pill l">↰ ${locked ? 'LOCKED' : 'SHIFT'}</span>`);
    if (layer === 'r') pills.push(`<span class="pill r">↱ ${locked ? 'LOCKED' : 'SHIFT'}</span>`);
    if (layer === 'a') pills.push(`<span class="pill a">α ${locked ? 'LOCKED' : 'ALPHA'}</span>`);
    if (editing) pills.push(`<span class="pill e">EDITING ${escapeHtml(editTarget(editing).toUpperCase())}</span>`);
    if (alarm) pills.push(alarmMark);
    el.innerHTML = pills.join('');
    el.className = pills.length ? 'status-line has-pills' : 'status-line';
  }

  announce(text) {
    if (typeof document === 'undefined') return;
    if (!this._live) {
      this._live = document.createElement('div');
      this._live.className = 'sr-only';
      this._live.setAttribute('aria-live', 'polite');
      document.body.appendChild(this._live);
    }
    this._live.textContent = '';
    requestAnimationFrame(() => { this._live.textContent = text; });
  }
}

export function pathSegmentsHtml(segments) {
  return `{ ${segments.map((name, i) => (i === segments.length - 1
    ? `<span>${escapeHtml(name)}</span>`
    : `<button type="button" data-status="path" data-index="${i}" title="Go to ${escapeHtml(name)}">${escapeHtml(name)}</button>`)).join(' ')} }`;
}
