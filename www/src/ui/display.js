import { format, formatStackTop, DEFAULT_DISPLAY } from '../rpl/formatter.js';
import { astToSvg } from '../rpl/pretty.js';
import { TYPES, isSymbolic, isMatrix, isVector, isList } from '../rpl/types.js';
import { state as calcState, currentPath } from '../rpl/state.js';
import { icon } from './icons.js';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

const prefersReducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const swipeThreshold = (width) => Math.min(120, width * 0.35);

export class Display {
  constructor({ stackView, cmdline, statusLine }) {
    this.stackView = stackView;
    this.cmdline = cmdline;
    this.statusLine = statusLine;
    this.displayOpts = { ...DEFAULT_DISPLAY };
    this.selectedLevel = null;
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
    view.addEventListener('scroll', () => this._updateMore(), { passive: true });
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
      if (ev.pointerType === 'mouse' || !ev.isPrimary || ev.target.closest?.('.st-acts')) return;
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
      const settle = () => {
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
    const view = this.stackView;
    const before = this._positions();
    const values = stack.snapshot();
    const depth = values.length;
    this.displayOpts.mode = calcState.displayMode || 'STD';
    this.displayOpts.digits = calcState.displayDigits ?? 12;
    if (this.selectedLevel != null && this.selectedLevel > depth) this.selectedLevel = depth || null;
    view.textContent = '';
    if (!depth && !this.ghosts?.length) {
      view.innerHTML = this.emptyHtml;
      view.dataset.empty = '1';
      this._updateMore();
      return;
    }
    delete view.dataset.empty;
    const svgSize = parseFloat(getComputedStyle(view).fontSize) || 18;
    const frag = document.createDocumentFragment();
    const spacer = document.createElement('div');
    spacer.className = 'st-spacer';
    frag.appendChild(spacer);
    const seen = new Map();
    for (let level = depth; level >= 1; level--) {
      const value = values[level - 1];
      const id = this._idOf(value);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      frag.appendChild(this._row(value, level, `${id}.${n}`, svgSize));
    }
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
    if (selected) selected.scrollIntoView?.({ block: 'nearest' });
    else view.scrollTop = view.scrollHeight;
    if (!this.ghosts && !this.marks && before.size && !prefersReducedMotion()) this._animate(before);
    this._updateMore();
  }

  _updateMore() {
    const view = this.stackView;
    if (!view?.parentElement) return;
    const above = [...view.querySelectorAll('.st-row[data-key]')].filter((row) => row.offsetTop + row.offsetHeight <= view.scrollTop + 1).length;
    if (!this._more) {
      this._more = document.createElement('button');
      this._more.type = 'button';
      this._more.className = 'st-more';
      this._more.addEventListener('click', () => view.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
      view.parentElement.appendChild(this._more);
    }
    this._more.hidden = !above;
    this._more.textContent = `${above} more level${above === 1 ? '' : 's'} above`;
    this._more.style.top = `${view.offsetTop + 6}px`;
  }

  _animate(before) {
    for (const row of this.stackView.querySelectorAll('.st-row[data-key]')) {
      const top = row.getBoundingClientRect().top;
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
      row.title = `Level ${level}. Click to select, double-click to edit, drag to move.`;
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
    const text = this._fillValue(cell, value, svgSize);
    row.setAttribute('aria-label', `Level ${level}: ${text}`);
    row.append(lvl, tag, cell);
    if (selected && this.rowActionsHtml) row.insertAdjacentHTML('beforeend', this.rowActionsHtml(level, value));
    return row;
  }

  _fillValue(cell, value, svgSize) {
    const flat = formatStackTop(value, this.displayOpts);
    if (calcState.textbookMode && isSymbolic(value)) {
      cell.innerHTML = astToSvg(value.expr, { size: svgSize }).svg;
      cell.classList.add('textbook');
    } else if (calcState.textbookMode && isList(value)) {
      cell.innerHTML = this._renderTextbookList(value, svgSize);
      cell.classList.add('textbook');
    } else if (calcState.textbookMode && (isMatrix(value) || isVector(value))) {
      cell.innerHTML = this._renderTextbookGrid(value);
      cell.classList.add('textbook');
    } else {
      const span = document.createElement('span');
      span.className = 'value-text';
      span.textContent = flat;
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
    const cells = rows.map(r => {
      const padded = r.concat(Array(Math.max(0, ncols - r.length)).fill(null));
      return padded.map(cell => {
        if (cell === null) return '<span class="mcell"></span>';
        if (isSymbolic(cell)) {
          const { svg } = astToSvg(cell.expr, { size: 18 });
          return `<span class="mcell mcell-sym">${svg}</span>`;
        }
        return `<span class="mcell">${escapeHtml(format(cell, this.displayOpts))}</span>`;
      }).join('');
    });
    const cls = isMatrix(val) ? 'matrix-grid' : 'matrix-grid vector-grid';
    return `<span class="${cls}" style="--mcols:${Math.max(1, ncols)}">${cells.join('')}</span>`;
  }

  _renderTextbookList(val, svgSize = 22) {
    const items = val.items.map(item => {
      if (isSymbolic(item)) {
        const { svg } = astToSvg(item.expr, { size: svgSize });
        return `<span class="lcell lcell-sym">${svg}</span>`;
      }
      return `<span class="lcell">${escapeHtml(format(item, this.displayOpts))}</span>`;
    });
    return `<span class="list-inline">{ ${items.join('<span class="lsep"> </span>')} }</span>`;
  }

  renderCmdline(entry) {
    this.cmdline.classList.toggle('empty', entry.buffer.length === 0);
  }

  renderStatus({ classic = false, minimal = false, shift = null, halted = null, editing = null } = {}) {
    const el = this.statusLine;
    if (!el) return;
    const layer = shift?.startsWith('shiftL') ? 'l' : shift?.startsWith('shiftR') ? 'r' : shift?.startsWith('alpha') ? 'a' : '';
    const locked = !!shift?.endsWith('Lock');
    const pathHtml = pathSegmentsHtml(currentPath());
    const minimalButtons = minimal
      ? `<button type="button" class="ann-btn" data-status="fullscreen" title="Full screen" aria-label="Full screen">${icon('full', 'sm')}</button><button type="button" class="ann-btn" data-status="leave-minimal" title="Leave minimal view" aria-label="Leave minimal view">${icon('collapse', 'sm')}</button>`
      : '';
    if (classic) {
      const g = (items, cls = '', mode = '') => `<div class="ann-g ${cls}"${mode ? ` data-status="mode" data-mode="${mode}" role="button" tabindex="0" title="Change ${MODE_NAMES[mode]}"` : ''}>${items.map(([t, on, c]) => `<span class="${on ? 'on' : ''} ${c || ''}">${t}</span>`).join('')}</div>`;
      el.innerHTML = [
        g([['↰', layer === 'l', 'l'], ['↱', layer === 'r'], ['α', layer === 'a']]),
        g([['RAD', calcState.angle === 'RAD'], ['DEG', calcState.angle === 'DEG'], ['GRD', calcState.angle === 'GRD']], '', 'angle'),
        g([['XYZ', calcState.coordMode === 'RECT'], ['R∠Z', calcState.coordMode === 'CYLIN'], ['R∠∠', calcState.coordMode === 'SPHERE']], 'opt', 'coord'),
        g([['=', !calcState.approxMode], ['~', calcState.approxMode]], '', 'exact'),
        g([['ℝ', !calcState.complexMode], ['ℂ', calcState.complexMode]], '', 'complex'),
        g([['HALT', !!halted]], 'opt'),
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
      const haltMark = halted ? '<span class="ann-m l">HALT</span>' : '';
      el.innerHTML = `<div class="ann-status">${modes.map(([m, t]) => `<button type="button" class="ann-m" data-status="mode" data-mode="${m}" title="Change ${MODE_NAMES[m]}">${escapeHtml(t)}</button>`).join('')}${layerMark}${haltMark}<span class="ann-sp"></span><span class="ann-path">${pathHtml}</span>${minimalButtons}</div>`;
      el.className = 'status-line';
      return;
    }
    const pills = [];
    if (layer === 'l') pills.push(`<span class="pill l">↰ ${locked ? 'LOCKED' : 'SHIFT'}</span>`);
    if (layer === 'r') pills.push(`<span class="pill r">↱ ${locked ? 'LOCKED' : 'SHIFT'}</span>`);
    if (layer === 'a') pills.push(`<span class="pill a">α ${locked ? 'LOCKED' : 'ALPHA'}</span>`);
    if (editing) pills.push(`<span class="pill e">EDITING LEVEL ${editing}</span>`);
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
