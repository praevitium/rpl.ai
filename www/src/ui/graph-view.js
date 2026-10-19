import {
  TRACE_COLORS, TRACE_KINDS, nextTraceColor, defaultView, zoomView, panView, pinchView, DEFAULT_TURN, turnBy,
  worldToPixel, pixelToWorld, axisTicks, hasUsableSpan,
  sampleTrace, fitViewToTraces, evalTraceAtX,
  stackValueToTrace, traceToStackValues, traceInputError, traceFromInputs, retypeTrace,
} from './plot-engine.js';
import { escapeHtml } from './display.js';
import { icon } from './icons.js';
import { isSymbolic, isName, isMatrix, isVector, isList, Real } from '../rpl/types.js';
import { state as calcState, varRecall, getLastFitModel, toRadians, fromRadians, getPict, subscribe as subscribeState } from '../rpl/state.js';
import { plotSettings, pictWindow, pictGrid, pictPoint, viewVolume } from '../rpl/ops/graphics.js';
import { downloadFile } from '../rpl/persist.js';

export { stackValueToTrace, traceToStackValues };

let _traceSeq = 0;

const PLOT_KINDS = Object.freeze([
  ['function', 'Function', 'y = f(x)'],
  ['polar', 'Polar', 'r = f(θ)'],
  ['parametric', 'Parametric', 'x(t), y(t)'],
  ['diffeq', 'dy/dx', 'dy/dx = f(x, y)'],
  ['slopefield', 'Slopes', 'dy/dx = f(x, y) as a slope field'],
  ['conic', 'Conic', 'f(x, y) = 0, a second-order curve'],
  ['truth', 'Truth', 'Shade where a condition in x and y holds'],
  ['contour', 'Contour', 'Level curves of f(x, y)'],
  ['wireframe', 'Wireframe', 'z = f(x, y) in perspective, from VPAR'],
  ['yslice', 'Y-slice', 'Slices of z = f(x, y) across x, in perspective'],
  ['fast3d', 'Fast 3D', 'z = f(x, y) to turn with a drag or the arrow keys'],
  ['scatter', 'Scatter', 'Points from ΣDAT or the stack'],
  ['bar', 'Bar', 'Bar chart from ΣDAT or the stack'],
  ['hist', 'Histogram', 'Histogram from ΣDAT or the stack'],
]);
const RANGE_FIELDS = Object.freeze([['xmin', 'x from'], ['xmax', 'x to'], ['ymin', 'y from'], ['ymax', 'y to']]);
const TAP_SLOP_PX = 6;
const TOUCH = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
const IDLE_READOUT = TOUCH
  ? 'Tap to read values · drag to pan · pinch to zoom'
  : 'Hover, or press T to trace · drag to pan · scroll to zoom';
const TURN_READOUT = TOUCH ? 'Drag to turn · pinch to zoom' : 'Drag or use the arrow keys to turn · scroll to zoom';
// A drag turns a FAST3D surface this far per pixel; an arrow key, a twelfth of a turn.
const TURN_PER_PIXEL = 0.01;
const TURN_STEP = Math.PI / 12;

// Once PPAR holds a plot window, as XRNG, YRNG and the other plot commands leave it, a plot starts there as on the
// HP; until then the view fits what it draws.
function pparView() {
  return plotSettings()?.view ?? null;
}

// How traces are sampled: INDEP's range is POLAR's and PARAMETRIC's, and RES their step, once PPAR sets them.
function sampleOpts(extra) {
  const ppar = plotSettings();
  const range = ppar?.indep.range;
  return {
    angleOpts: angleOpts(),
    thetaRange: range ? { min: range[0], max: range[1] } : thetaRange(),
    tRange: range ? { min: range[0], max: range[1] } : { min: -10, max: 10 },
    indep: ppar?.indep ?? null,
    depend: ppar?.depend ?? null,
    res: ppar?.res ?? null,
    volume: viewVolume(),
    ...extra,
  };
}

// PVIEW shows PICT in PPAR's window, or in a window that size with the given point at its top left.
function pviewWindow(point, window) {
  if (isList(point) && !point.items.length) return window;
  const { x, y } = pictPoint(point);
  return { xmin: x, xmax: x + window.xmax - window.xmin, ymin: y - (window.ymax - window.ymin), ymax: y };
}

function canSharePng() {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'plot.png', { type: 'image/png' })] });
}

function angleOpts() {
  return { toRad: toRadians, fromRad: fromRadians };
}

function thetaRange() {
  return { min: 0, max: { DEG: 360, GRD: 400 }[calcState.angle] ?? 2 * Math.PI };
}

const isData = (v) => isMatrix(v) || isVector(v) || isList(v);

function makeTrace(partial = {}) {
  const id = partial.id || `t${++_traceSeq}`;
  return {
    id,
    color: partial.color || nextTraceColor(_traceSeq - 1),
    enabled: partial.enabled !== false,
    kind: partial.kind || 'function',
    expr: partial.expr || '',
    exprY: partial.exprY || '',
    exprZ: partial.exprZ || '',
    points: partial.points || null,
    source: partial.source || null,
    label: partial.label || '',
    model: partial.model
      ? { kind: partial.model.kind, a: partial.model.a, b: partial.model.b }
      : null,
  };
}

export class GraphView {
  constructor({ app } = {}) {
    this.app = app;
    this.view = defaultView();
    this._turn = { ...DEFAULT_TURN };
    this.traces = [];
    this._drag = null;
    this._pointers = new Map();
    this._hover = null;
    this.tracing = false;
    this.traceX = null;
    this.el = document.createElement('div');
    this.el.className = 'gr-view';
    this.el.innerHTML = `
      <div class="pl-main">
        <div class="pl-box" tabindex="0" role="application" aria-label="Plot. Arrows pan, plus and minus zoom, 0 resets, T traces, F goes full screen.">
          <canvas class="gr-canvas" aria-hidden="true"></canvas>
          <div class="pl-tools${TOUCH ? ' folded' : ''}" role="toolbar" aria-label="Plot tools">
            <button type="button" class="pl-fold" data-gr="fold" title="Plot tools" aria-label="Plot tools" aria-expanded="${!TOUCH}">${icon('more', 'sm')}</button>
            <button type="button" data-gr="zin" title="Zoom in (+)" aria-label="Zoom in">${icon('plus', 'sm')}</button>
            <button type="button" data-gr="zout" title="Zoom out (−)" aria-label="Zoom out">${icon('minus', 'sm')}</button>
            <button type="button" data-gr="fit" title="Fit the traces" aria-label="Fit">${icon('fit', 'sm')}</button>
            <button type="button" data-gr="reset" title="Reset the view (0)" aria-label="Reset">${icon('target', 'sm')}</button>
            <button type="button" data-gr="trace" title="Trace (T): arrows move along the curve" aria-label="Trace" aria-pressed="false">${icon('trace', 'sm')}</button>
            <button type="button" data-gr="copy" title="Copy the plot as an image" aria-label="Copy as image">${icon('copy', 'sm')}</button>
            <button type="button" data-gr="png" title="Download the plot as a PNG" aria-label="Download as PNG">${icon('down', 'sm')}</button>
            ${canSharePng() ? `<button type="button" data-gr="share" title="Share the plot as an image" aria-label="Share">${icon('share', 'sm')}</button>` : ''}
          </div>
        </div>
        <div class="gr-readout" aria-live="polite">${IDLE_READOUT}</div>
      </div>
      <div class="pl-side">
        <div class="pl-kinds" role="group" aria-label="Plot type">${PLOT_KINDS.map(([kind, label, title]) => `<button type="button" class="chip" data-kind="${kind}" title="${escapeHtml(title)}" aria-pressed="${kind === 'function'}">${escapeHtml(label)}</button>`).join('')}</div>
        <div class="sec-h">Traces<button type="button" class="btn ghost" data-gr="from" title="Plot stack level 1">${icon('plus', 'sm')}Level 1</button></div>
        <div class="gr-exprs" aria-label="Traces"></div>
        <div class="gr-data" hidden><span>Plot the data in</span><button type="button" class="btn" data-gr="data-level1">Level 1</button><button type="button" class="btn" data-gr="data-sigma">ΣDAT</button></div>
        <form class="gr-add">
          <input type="text" class="gr-add-x" spellcheck="false" autocomplete="off" placeholder="SIN(X)" aria-label="Expression" />
          <input type="text" class="gr-add-y hidden" spellcheck="false" autocomplete="off" placeholder="COS(T)" aria-label="Y expression" />
          <button type="submit" class="btn" title="Add this trace">Add</button>
        </form>
        <div class="sec-h">Window</div>
        <div class="pl-range">${RANGE_FIELDS.map(([key, label], i) => `${i % 2 ? '<span>to</span>' : `<span>${key[0]}</span>`}<input type="text" inputmode="decimal" data-rng="${key}" aria-label="${label}" spellcheck="false" autocomplete="off">`).join('')}</div>
      </div>
    `;
    this._box = this.el.querySelector('.pl-box');
    this._exprs = this.el.querySelector('.gr-exprs');
    this._addX = this.el.querySelector('.gr-add-x');
    this._addY = this.el.querySelector('.gr-add-y');
    this._form = this.el.querySelector('.gr-add');
    this._canvas = this.el.querySelector('.gr-canvas');
    this._ctx = this._canvas.getContext('2d');
    this._readout = this.el.querySelector('.gr-readout');
    this._kind = 'function';
    this._selectedId = null;
    this._bind();
    this._renderExprs();
    this._pict = calcState.pict;
    this._samples = new WeakMap();
    subscribeState(() => {
      if (calcState.pict === this._pict) return;
      this._pict = calcState.pict;
      this.draw();
    });
  }

  _bind() {
    this.el.querySelector('.pl-kinds').addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-kind]');
      if (btn) this.retypeSelectionAndSetKind(btn.dataset.kind);
    });
    this.el.addEventListener('click', (ev) => {
      const tool = ev.target.closest?.('[data-gr]');
      if (!tool) return;
      const act = tool.dataset.gr;
      if (act === 'zin') this.zoomBy(1 / 1.25);
      else if (act === 'zout') this.zoomBy(1.25);
      else if (act === 'fit') this.fitView();
      else if (act === 'reset') this.resetView();
      else if (act === 'trace') this.setTraceMode(!this.tracing);
      else if (act === 'fold') this._toggleTools(tool);
      else if (act === 'png') this.downloadPng();
      else if (act === 'copy') this.copyPng();
      else if (act === 'share') this.sharePng();
      else if (act === 'from') this.loadFromStack(1);
      else if (act === 'data-level1') this.loadData(this._kind, this.app.stack.peek(1));
      else if (act === 'data-sigma') this.loadData(this._kind, varRecall('ΣDAT'));
    });
    this.el.querySelector('.pl-range').addEventListener('change', (ev) => {
      const input = ev.target.closest?.('input[data-rng]');
      if (input) this._applyRange(input);
    });
    this.el.querySelector('.pl-range').addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); this._applyRange(ev.target); }
    });
    document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => this.draw()));
    this._form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.addFromInputs();
    });
    this._exprs.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-trace]');
      if (btn) {
        const id = btn.dataset.trace;
        if (btn.dataset.act === 'remove') this.removeTrace(id);
        else if (btn.dataset.act === 'toggle') this.toggleTrace(id);
        else if (btn.dataset.act === 'push') this.pushTrace(id);
        return;
      }
      const row = ev.target.closest?.('.gr-trace');
      if (row?.dataset.trace) this._selectTrace(row.dataset.trace);
    });
    this._exprs.addEventListener('change', (ev) => {
      const box = ev.target.closest?.('input[data-act="toggle"]');
      if (box) this.toggleTrace(box.dataset.trace);
    });
    this._exprs.addEventListener('input', (ev) => {
      const input = ev.target.closest?.('input.gr-expr');
      if (input) this._onTraceExprInput(input);
    });
    this._exprs.addEventListener('keydown', (ev) => {
      if (!ev.target.closest?.('input.gr-expr')) return;
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.target.blur();
      }
    });
    this._addX.addEventListener('keydown', (ev) => ev.stopPropagation());
    this._addY.addEventListener('keydown', (ev) => ev.stopPropagation());

    const canvas = this._canvas;
    canvas.addEventListener('pointerdown', (ev) => {
      this.focus();
      canvas.setPointerCapture(ev.pointerId);
      this._pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
      this._startGesture();
      this._hover = null;
      this.draw();
    });
    canvas.addEventListener('pointerup', (ev) => {
      const drag = this._drag;
      const tap = drag && !drag.ids && Math.hypot(ev.offsetX - drag.x, ev.offsetY - drag.y) < TAP_SLOP_PX;
      this._pointers.delete(ev.pointerId);
      this._startGesture();
      if (this._drag) return;
      if (this.tracing && tap) this._traceTo(ev.offsetX);
      else this._hoverFromEvent(ev);
    });
    canvas.addEventListener('pointercancel', (ev) => {
      this._pointers.delete(ev.pointerId);
      this._startGesture();
      this._clearHover();
    });
    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      if (this._pointers.has(ev.pointerId)) this._pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
      if (this._drag?.ids) {
        const to = this._drag.ids.map((id) => this._pointers.get(id));
        this.view = pinchView(this._drag.view, this._drag.from, to, rect.width, rect.height);
        this.draw();
      } else if (this._drag && this._turnable()) {
        this._turn = turnBy(this._drag.turn, (ev.offsetX - this._drag.x) * TURN_PER_PIXEL, (ev.offsetY - this._drag.y) * TURN_PER_PIXEL);
        this.draw();
      } else if (this._drag) {
        const [x0, y0] = pixelToWorld(this._drag.x, this._drag.y, this._drag.view, rect.width, rect.height);
        const [x1, y1] = pixelToWorld(ev.offsetX, ev.offsetY, this._drag.view, rect.width, rect.height);
        this.view = panView(this._drag.view, x0 - x1, y0 - y1);
        this.draw();
      } else {
        this._hoverFromEvent(ev);
      }
    });
    // A finger leaves as it lifts, so a tap's readout stays until the next touch.
    canvas.addEventListener('pointerleave', (ev) => {
      if (!this._drag && ev.pointerType !== 'touch') this._clearHover();
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const [cx, cy] = pixelToWorld(ev.offsetX, ev.offsetY, this.view, rect.width, rect.height);
      const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      this.view = zoomView(this.view, cx, cy, factor);
      this._hoverFromEvent(ev);
    }, { passive: false });
    canvas.addEventListener('dblclick', (ev) => {
      this.resetView();
      this._hoverFromEvent(ev);
    });

    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(this._box);
  }

  // On a phone the tools fold into one button so they leave the plot to the fingers.
  _toggleTools(fold) {
    const folded = fold.parentElement.classList.toggle('folded');
    fold.setAttribute('aria-expanded', String(!folded));
  }

  // One pointer pans and two pinch; each change of fingers starts afresh from the
  // current view so the plot doesn't jump.
  _startGesture() {
    const [a, b] = this._pointers.entries();
    if (!a) this._drag = null;
    else if (b) this._drag = { ids: [a[0], b[0]], from: [a[1], b[1]], view: { ...this.view } };
    else this._drag = { x: a[1][0], y: a[1][1], view: { ...this.view }, turn: this._turn };
  }

  // On a phone the kinds scroll in one row; keep the chosen one in sight.
  _revealKind() {
    const row = this.el.querySelector('.pl-kinds');
    const chip = row.querySelector('[aria-pressed="true"]');
    if (!chip || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect(), c = chip.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }

  setKind(kind) {
    if (kind !== this._kind) this._addY.value = '';
    this._kind = kind;
    this.el.querySelectorAll('.pl-kinds button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    });
    this._revealKind();
    const fields = TRACE_KINDS[kind].fields || [];
    const yField = fields.find(f => f.key === 'exprY');
    this._form.hidden = !fields.length;
    this.el.querySelector('.gr-data').hidden = !!fields.length;
    this._addY.classList.toggle('hidden', !yField);
    this._addX.placeholder = fields[0]?.placeholder || 'data from stack / ΣDAT';
    if (fields.length) this._addX.setAttribute('aria-label', fields[0].aria);
    if (yField) {
      this._addY.placeholder = yField.placeholder;
      this._addY.setAttribute('aria-label', yField.aria);
    }
  }

  _fail(message) {
    this.app.entry.flashError({ message: `Plot: ${message}` });
  }

  retypeSelectionAndSetKind(kind) {
    const composing = this._addX.value.trim() || this._addY.value.trim();
    const t = composing ? null : this.traces.find(tr => tr.id === this._selectedId);
    const retyped = t ? retypeTrace(t, kind) : null;
    const leavesXYBounds = !!retyped && TRACE_KINDS[t.kind].data && !TRACE_KINDS[kind].data;
    if (retyped) Object.assign(t, retyped);
    this.setKind(kind);
    if (!retyped) return;
    this._renderExprs();
    if (leavesXYBounds) {
      const { xmin, xmax } = defaultView();
      this.view = { ...this.view, xmin, xmax };
    }
    this.fitView();
  }

  addFromInputs() {
    const kind = this._kind;
    const spec = TRACE_KINDS[kind];
    if (!spec?.fields?.length) {
      this.loadData(kind);
      return;
    }
    const expr = this._addX.value.trim();
    const exprY = this._addY.value.trim();
    if (!expr) return;
    const err = traceInputError(kind, { expr, exprY }, { adding: true });
    if (err) { this._fail(err); return; }
    this._addTrace(traceFromInputs(kind, expr, exprY), { fit: !!spec.fitOnAdd });
    this._addX.value = '';
    this._addY.value = '';
  }

  loadData(kind, value) {
    const v = value || this._dataValue();
    if (!v) { this._fail('no ΣDAT, and level 1 is not data'); return; }
    const spec = TRACE_KINDS[kind]?.fromStack(v);
    if (!spec) { this._fail('no numeric points'); return; }
    if (kind === 'hist') {
      this._addTrace(spec, { fit: true });
      return;
    }
    const t = this._addTrace(spec, { fit: false, draw: false });
    const fit = getLastFitModel();
    if (kind === 'scatter' && fit) {
      this.traces.push(makeTrace({
        kind: 'fit',
        label: `${fit.kind} fit`,
        color: TRACE_COLORS[4],
        model: { kind: fit.kind, a: fit.a, b: fit.b },
      }));
    }
    this._selectedId = t.id;
    this._renderExprs();
    this.fitView();
  }

  _dataValue() {
    const top = this.app.stack.peek();
    return isData(top) ? top : varRecall('ΣDAT');
  }

  applyPlotOp(kind, stack, data = null) {
    if (kind === 'animate') {
      this.view = pictWindow() ?? this.view;
      this._animate(data);
      return;
    }
    if (kind === 'draw' || kind === 'pview') {
      const window = (kind === 'pview' ? pictWindow() : pparView()) ?? this.view;
      this.view = kind === 'pview' ? pviewWindow(data, window) : window;
      this.draw();
      return;
    }
    this.setKind(kind);
    const spec = TRACE_KINDS[kind];
    const top = stack.peek();
    if (!spec.fields?.length) {
      this.loadData(kind, data);
      return;
    }
    const built = isSymbolic(top) || isName(top) ? stackValueToTrace(top, kind, this._below(kind, stack)) : null;
    if (!built) { this._fail(`${kind.toUpperCase()} needs an expression on level 1`); return; }
    const err = traceInputError(kind, built, { adding: true });
    if (err) { this._fail(err); return; }
    this._addTrace(built, { fit: !!spec.fitOnAdd, view: pparView() });
  }

  // DIFFEQ's initial value is DEPND's once PPAR gives one, as on the HP, else level 2's.
  _below(kind, stack) {
    const y0 = kind === 'diffeq' ? plotSettings()?.depend.values?.[0] : undefined;
    if (y0 !== undefined) return Real(y0);
    return stack.depth >= 2 ? stack.peek(2) : null;
  }

  loadFromStack(level) {
    const { stack } = this.app;
    if (!stack.depth) { this._fail('the stack is empty'); return; }
    if (level > stack.depth) return;
    const below = stack.depth > level ? stack.peek(level + 1) : null;
    const spec = stackValueToTrace(stack.peek(level), this._kind, below);
    if (!spec) { this._fail(`level ${level} is not an expression or data`); return; }
    const err = traceInputError(spec.kind, spec, { adding: true });
    if (err) { this._fail(err); return; }
    this.setKind(spec.kind);
    this._addTrace(spec, { fit: true });
    this._readout.textContent = `Added level ${level}`;
  }

  pushTrace(id) {
    const t = this.traces.find(tr => tr.id === id);
    if (!t) return;
    try {
      const values = traceToStackValues(t);
      if (!values.length) { this._fail('nothing to push'); return; }
      this.app.commitEntryAndPush(values);
      this._readout.textContent = `Pushed ${t.label || t.kind}`;
    } catch (e) {
      this._fail(e.message);
    }
  }

  _addTrace(partial, { fit = false, draw = true, view = null } = {}) {
    const first = !this.traces.length;
    const t = makeTrace(partial);
    this.traces.push(t);
    this._selectedId = t.id;
    if (draw) this._renderExprs();
    if (view) {
      this.view = view;
      if (draw) this.draw();
    } else if (fit || first) {
      this.fitView();
    } else if (draw) {
      this.draw();
    }
    return t;
  }

  _selectTrace(id) {
    if (this._selectedId === id) return;
    this._selectedId = id;
    this._exprs.querySelectorAll('.gr-trace').forEach(row => {
      row.classList.toggle('selected', row.dataset.trace === id);
    });
    const kind = this.traces.find(tr => tr.id === id)?.kind;
    if (PLOT_KINDS.some(([k]) => k === kind)) this.setKind(kind);
  }

  _hoverOpts() {
    const rect = this._canvas.getBoundingClientRect();
    return sampleOpts({
      snapX: (this.view.xmax - this.view.xmin) * 0.03,
      view: this.view,
      width: rect.width || 240,
    });
  }

  // A 3D picture has no x and y to read.
  _hoverFromEvent(ev) {
    if (this.tracing) return;
    if (this._projected()) {
      this._clearHover();
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const [wx, wy] = pixelToWorld(ev.offsetX, ev.offsetY, this.view, rect.width, rect.height);
    this._hover = { x: wx, y: wy };
    this._readout.textContent = this._readoutAt(wx, wy);
    this.draw();
  }

  _traceTo(px) {
    const rect = this._canvas.getBoundingClientRect();
    [this.traceX] = pixelToWorld(px, 0, this.view, rect.width, rect.height);
    this._readout.textContent = this._readoutAt(this.traceX);
    this.draw();
  }

  _clearHover() {
    this._hover = null;
    if (!this.tracing) this._readout.textContent = this._idleReadout();
    this.draw();
  }

  _readoutAt(wx, wy = null) {
    const bits = [`x = ${fmtAxis(wx)}`];
    if (wy != null) bits.push(`y = ${fmtAxis(wy)}`);
    const opts = this._hoverOpts();
    for (const t of this.traces) {
      if (!t.enabled) continue;
      const yv = evalTraceAtX(t, wx, opts);
      if (!Number.isFinite(yv)) continue;
      bits.push(`${t.label || t.expr || t.kind} = ${fmtAxis(yv)}`);
    }
    return bits.join('  ·  ');
  }

  _cursor() {
    return this.tracing ? { x: this.traceX } : this._hover;
  }

  focus() { this._box.focus({ preventScroll: true }); }

  zoomBy(factor) {
    const v = this.view;
    this.view = zoomView(v, (v.xmin + v.xmax) / 2, (v.ymin + v.ymax) / 2, factor);
    this.draw();
  }

  // A 3D picture's reset turns it back and fits it; the default window would shrink it to a dot.
  resetView() {
    if (!this._projected()) {
      this.view = defaultView();
      this.draw();
      return;
    }
    this._turn = { ...DEFAULT_TURN };
    this.fitView();
  }

  _projected() {
    return this.traces.some((t) => t.enabled && TRACE_KINDS[t.kind]?.projected);
  }

  _turnable() {
    return this.traces.some((t) => t.enabled && TRACE_KINDS[t.kind]?.turnable);
  }

  _idleReadout() {
    return this._turnable() ? TURN_READOUT : IDLE_READOUT;
  }

  nudge(dir) {
    const v = this.view;
    const dx = (v.xmax - v.xmin) / 20;
    const dy = (v.ymax - v.ymin) / 20;
    if (!this.tracing && this._turnable()) {
      const turn = { left: [-TURN_STEP, 0], right: [TURN_STEP, 0], up: [0, TURN_STEP], down: [0, -TURN_STEP] }[dir] ?? [0, 0];
      this._turn = turnBy(this._turn, ...turn);
    } else if (this.tracing && (dir === 'left' || dir === 'right')) {
      this.traceX += (dir === 'left' ? -dx : dx) / 4;
      if (this.traceX < v.xmin) this.view = panView(v, this.traceX - v.xmin - dx, 0);
      if (this.traceX > v.xmax) this.view = panView(v, this.traceX - v.xmax + dx, 0);
      this._readout.textContent = this._readoutAt(this.traceX);
    } else {
      this.view = panView(v, dir === 'left' ? -dx : dir === 'right' ? dx : 0, dir === 'down' ? -dy : dir === 'up' ? dy : 0);
    }
    this.draw();
  }

  setTraceMode(on) {
    this.tracing = !!on;
    const v = this.view;
    if (this.tracing && (this.traceX == null || this.traceX < v.xmin || this.traceX > v.xmax)) this.traceX = (v.xmin + v.xmax) / 2;
    this.el.querySelector('[data-gr="trace"]').setAttribute('aria-pressed', String(this.tracing));
    this._readout.textContent = this.tracing ? this._readoutAt(this.traceX) : this._idleReadout();
    if (this.tracing) this.focus();
    this.draw();
  }

  // The canvas as drawn, without the hover readout, at the screen's pixel density.
  _png() {
    this._hover = null;
    this.draw();
    return new Promise((resolve, reject) => this._canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The plot could not be drawn'))), 'image/png'));
  }

  _fileName() {
    const first = this.traces.find((t) => t.enabled && t.expr);
    const stem = first ? first.expr.replace(/[^A-Za-z0-9+\-^]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) : '';
    return `plot${stem ? `-${stem}` : ''}.png`;
  }

  async downloadPng() {
    try { this.app.toast(`Saved ${downloadFile(await this._png(), this._fileName(), 'image/png')}`); }
    catch (e) { this.app.notifyError(`Download failed: ${e.message}`); }
  }

  async copyPng() {
    try {
      if (typeof ClipboardItem !== 'function' || !navigator.clipboard?.write) throw new Error('this browser cannot copy images');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await this._png() })]);
      this.app.toast('Copied the plot as an image');
    } catch (e) { this.app.notifyError(`Copy failed: ${e.message}`); }
  }

  // Built synchronously so share() still runs inside the tap, which Safari requires.
  _pngFile() {
    this._hover = null;
    this.draw();
    const bytes = Uint8Array.from(atob(this._canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0));
    return new File([bytes], this._fileName(), { type: 'image/png' });
  }

  async sharePng() {
    try { await navigator.share({ files: [this._pngFile()] }); }
    catch (e) { if (e.name !== 'AbortError') this.app.notifyError(`Share failed: ${e.message}`); }
  }

  fullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const request = this._box.requestFullscreen?.();
    const fallback = () => {
      this.app.setPlotFocus(true);
      this.app.toast("Full screen isn't allowed here, so the plot fills the window instead.");
    };
    if (request?.catch) request.catch(fallback);
    else if (!request) fallback();
  }

  _applyRange(input) {
    const text = String(input.value).trim();
    const value = text ? Number(text) : NaN;
    const next = { ...this.view, [input.dataset.rng]: value };
    const valid = Number.isFinite(value) && hasUsableSpan(next.xmin, next.xmax) && hasUsableSpan(next.ymin, next.ymax);
    input.classList.toggle('bad', !valid);
    if (!valid) return;
    this.view = next;
    this.draw();
  }

  _syncRanges() {
    for (const input of this.el.querySelectorAll('input[data-rng]')) {
      if (document.activeElement === input) continue;
      input.value = String(Number(this.view[input.dataset.rng].toPrecision(4)));
      input.classList.remove('bad');
    }
  }

  _drawHover(ctx, width, height) {
    const h = this._cursor();
    if (!h || this._drag) return;
    const view = this.view;
    const [px] = worldToPixel(h.x, 0, view, width, height);
    ctx.save();
    ctx.strokeStyle = this.tracing ? this._colors.label : this._colors.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    ctx.setLineDash([]);
    const opts = this._hoverOpts();
    for (const t of this.traces) {
      if (!t.enabled) continue;
      const yv = evalTraceAtX(t, h.x, opts);
      if (!Number.isFinite(yv)) continue;
      const [dx, dy] = worldToPixel(h.x, yv, view, width, height);
      ctx.fillStyle = this._traceColor(t);
      ctx.strokeStyle = this._colors.bg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  _onTraceExprInput(input) {
    const t = this.traces.find(tr => tr.id === input.dataset.trace);
    if (!t) return;
    if (input.dataset.field === 'y') t.exprY = input.value;
    else t.expr = input.value;
    const spec = TRACE_KINDS[t.kind];
    if (spec?.label) t.label = spec.label(t);
    const err = traceInputError(t.kind, t);
    this._readout.textContent = err || '';
    this.draw();
  }

  removeTrace(id) {
    this.traces = this.traces.filter(t => t.id !== id);
    if (this._selectedId === id) this._selectedId = null;
    this._renderExprs();
    this.draw();
  }

  toggleTrace(id) {
    const t = this.traces.find(tr => tr.id === id);
    if (!t) return;
    t.enabled = !t.enabled;
    this._renderExprs();
    this.draw();
  }

  fitView() {
    const wrap = this._canvas?.parentElement;
    this.view = fitViewToTraces(this.traces, this.view, sampleOpts({
      width: wrap?.clientWidth || 240,
      height: wrap?.clientHeight,
      tools: this._toolsCorner(wrap),
      turn: this._turn,
    }));
    this.draw();
  }

  // The room the tools take from the plot's top right corner, with a small gap.
  _toolsCorner(wrap) {
    const tools = this.el.querySelector('.pl-tools');
    if (!wrap || !tools?.offsetParent) return null;
    const box = wrap.getBoundingClientRect();
    const r = tools.getBoundingClientRect();
    return { width: box.right - r.left + 4, height: r.bottom - box.top + 4 };
  }

  _traceColor(t) {
    return document.documentElement.dataset.theme === 'classic' ? this._colors.label : t.color;
  }

  _renderExprs() {
    this._exprs.innerHTML = this.traces.map(t => {
      const spec = TRACE_KINDS[t.kind];
      const fields = spec?.editable ? (spec.fields || []) : [];
      const body = fields.length
        ? fields.map((field, i) => {
            const sep = i > 0 && spec.fieldSep
              ? `<span class="gr-param-sep">${escapeHtml(spec.fieldSep)}</span>`
              : '';
            const key = field.key === 'exprY' ? 'y' : 'x';
            const value = field.key === 'exprY' ? t.exprY : t.expr;
            return `${sep}<input class="gr-expr" data-trace="${t.id}" data-field="${key}"
                    spellcheck="false" aria-label="${escapeHtml(field.aria)}"
                    value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder)}" />`;
          }).join('')
        : `<span class="gr-trace-label">${escapeHtml(t.label || t.kind)}</span>`;
      return `
      <div class="gr-trace ${t.enabled ? '' : 'off'}${t.id === this._selectedId ? ' selected' : ''}"
           data-trace="${t.id}">
        <input type="checkbox" class="gr-show" data-trace="${t.id}" data-act="toggle" ${t.enabled ? 'checked' : ''}
               style="accent-color:${t.color}" title="Show or hide this trace" aria-label="Show ${escapeHtml(t.label || t.expr || t.kind)}">
        ${body}
        <button type="button" class="mini" data-trace="${t.id}" data-act="push" title="Push it onto the stack" aria-label="Push onto the stack">${icon('enter', 'sm')}</button>
        <button type="button" class="mini" data-trace="${t.id}" data-act="remove" title="Remove" aria-label="Remove">${icon('x', 'sm')}</button>
      </div>`;
    }).join('') || '<div class="gr-empty">Select an expression on the stack and press PLOT, add level 1 here, or type one below.</div>';
  }

  resize() { this.draw(); }

  _palette() {
    const css = getComputedStyle(this._canvas);
    const token = (name) => css.getPropertyValue(name).trim();
    return {
      bg: token('--plot-bg'),
      grid: token('--plot-grid'),
      axis: token('--plot-axis'),
      label: token('--plot-label'),
      ink: token('--ink'),
      font: `11px ${token('--font-mono')}`,
    };
  }

  draw() {
    this._syncRanges();
    const canvas = this._canvas;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, wrap.clientWidth);
    const height = Math.max(1, wrap.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = this._ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this._colors = this._palette();
    ctx.fillStyle = this._colors.bg;
    ctx.fillRect(0, 0, width, height);

    // A 3D picture's x and y are the screen's, not the plot's, so the grid would mislead.
    if (!this._projected()) this._drawGrid(ctx, width, height);
    const idle = this._idleReadout();
    if (!this.tracing && [IDLE_READOUT, TURN_READOUT].includes(this._readout.textContent) && this._readout.textContent !== idle) this._readout.textContent = idle;
    for (const t of this.traces) {
      if (!t.enabled) continue;
      this._drawTrace(ctx, t, width, height);
    }
    this._drawPict(ctx, width, height);
    this._drawHover(ctx, width, height);
  }

  // The axes cross where AXES puts them, (0,0) by default, with grid lines every ATICK units from there.
  _drawGrid(ctx, width, height) {
    const view = this.view;
    const axes = plotSettings()?.axes ?? { x: 0, y: 0, tick: null };
    const xt = axisTicks(view.xmin, view.xmax, axes.x, axes.tick?.[0], width / 28);
    const yt = axisTicks(view.ymin, view.ymax, axes.y, axes.tick?.[1], height / 18);
    const [px0, py0] = worldToPixel(axes.x, axes.y, view, width, height);
    ctx.save();
    ctx.lineWidth = 1;
    const colors = this._colors;
    ctx.font = colors.font;
    ctx.fillStyle = colors.label;
    for (const x of xt.ticks) {
      const [px] = worldToPixel(x, 0, view, width, height);
      const onAxis = Math.abs(x - axes.x) < xt.step * 1e-9;
      ctx.strokeStyle = onAxis ? colors.axis : colors.grid;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      if (!onAxis) ctx.fillText(fmtAxis(x), px + 3, Math.min(height - 4, Math.max(12, py0 - 4)));
    }
    for (const y of yt.ticks) {
      const [, py] = worldToPixel(0, y, view, width, height);
      const onAxis = Math.abs(y - axes.y) < yt.step * 1e-9;
      ctx.strokeStyle = onAxis ? colors.axis : colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
      if (!onAxis) ctx.fillText(fmtAxis(y), Math.min(width - 36, Math.max(4, px0 + 4)), py - 3);
    }
    ctx.restore();
  }

  // PICT's lit pixels over the plot, each the cell of PPAR's window it stands for, as the drawing commands left them.
  // ANIMATE's frames take turns over PICT until rep runs out (never for rep 0) or the plot view is hidden.
  _animate({ frames, at, delay, rep }) {
    clearTimeout(this._animation?.timer);
    const total = rep === 0 ? Infinity : frames.length * rep;
    const show = (i) => {
      const playing = i < total && (i === 0 || this._canvas.offsetParent);
      this._animation = playing ? { frame: frames[i % frames.length], at, timer: setTimeout(() => show(i + 1), delay * 1000) } : null;
      this.draw();
    };
    show(0);
  }

  _drawPict(ctx, width, height) {
    const pict = getPict();
    const frame = this._animation;
    if (!frame && !pict.bytes.some(Boolean)) return;
    let grid;
    try {
      grid = pictGrid();
    } catch {
      return;
    }
    const edge = (col, row) => worldToPixel(grid.xmin + (col - 0.5) * grid.dx, grid.ymax - (row - 0.5) * grid.dy, this.view, width, height).map(Math.round);
    ctx.save();
    ctx.fillStyle = this._colors.ink;
    this._drawGrob(ctx, pict, [0, 0], edge);
    if (frame) {
      const [col, row] = frame.at;
      const [x0, y0] = edge(col, row);
      const [x1, y1] = edge(Math.min(col + frame.frame.width, pict.width), Math.min(row + frame.frame.height, pict.height));
      ctx.fillStyle = this._colors.bg;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = this._colors.ink;
      this._drawGrob(ctx, frame.frame, frame.at, edge, pict);
    }
    ctx.restore();
  }

  // Lit pixels of g with its top left at PICT pixel [col, row], cut to PICT's edges when given.
  _drawGrob(ctx, g, [col, row], edge, within = g) {
    const rowBytes = Math.ceil(g.width / 8);
    for (let r = 0; r < g.height && row + r < within.height; r++) {
      for (let k = 0; k < rowBytes; k++) {
        const byte = g.bytes[r * rowBytes + k];
        for (let bit = 0; byte && bit < 8; bit++) {
          const c = k * 8 + bit;
          if (!(byte & (1 << bit)) || col + c >= within.width) continue;
          const [x0, y0] = edge(col + c, row + r);
          const [x1, y1] = edge(col + c + 1, row + r + 1);
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
    }
  }

  _drawTrace(ctx, t, width, height) {
    const spec = TRACE_KINDS[t.kind];
    if (!spec) return;
    let segs = [];
    try {
      segs = spec.grid ? this._gridSamples(t, width, height) : sampleTrace(t, this.view, sampleOpts({ width, height, turn: this._turn }));
    } catch {
      return;
    }
    if (spec.render === 'bars') {
      this._drawBars(ctx, t, segs, width, height);
      return;
    }
    if (spec.render === 'cells') {
      this._drawCells(ctx, t, segs, width, height);
      return;
    }
    const view = this.view;
    ctx.save();
    ctx.strokeStyle = this._traceColor(t);
    ctx.fillStyle = this._traceColor(t);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const seg of segs) {
      if (spec.render === 'points') {
        for (const [x, y] of seg) {
          const [px, py] = worldToPixel(x, y, view, width, height);
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      if (seg.length < 2) continue;
      ctx.beginPath();
      seg.forEach(([x, y], i) => {
        const [px, py] = worldToPixel(x, y, view, width, height);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // Truth and contour plots evaluate f at thousands of grid points, so a redraw that only moves the hover keeps them.
  _gridSamples(t, width, height) {
    const opts = sampleOpts({ width, height });
    const key = JSON.stringify([t.expr, this.view, width, height, calcState.angle, opts.indep, opts.depend]);
    const cached = this._samples.get(t);
    if (cached?.key === key) return cached.segs;
    const segs = sampleTrace(t, this.view, opts);
    this._samples.set(t, { key, segs });
    return segs;
  }

  // Edges are rounded to whole pixels so neighbouring rows meet without a seam.
  _drawCells(ctx, t, cells, width, height) {
    const view = this.view;
    ctx.save();
    ctx.fillStyle = this._traceColor(t);
    ctx.globalAlpha = 0.45;
    for (const [[x0, y0], [x1, y1]] of cells) {
      const [left, top] = worldToPixel(x0, y1, view, width, height).map(Math.round);
      const [right, bottom] = worldToPixel(x1, y0, view, width, height).map(Math.round);
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    ctx.restore();
  }

  _drawBars(ctx, t, segs, width, height) {
    const view = this.view;
    ctx.save();
    const pts = segs.flat();
    ctx.fillStyle = this._traceColor(t);
    ctx.globalAlpha = 0.85;
    const barW = pts.length > 1
      ? Math.abs(worldToPixel(pts[1][0], 0, view, width, height)[0]
        - worldToPixel(pts[0][0], 0, view, width, height)[0]) * 0.7
      : 16;
    const [, y0] = worldToPixel(0, 0, view, width, height);
    for (const [x, y] of pts) {
      const [px, py] = worldToPixel(x, y, view, width, height);
      const top = Math.min(py, y0);
      const h = Math.abs(py - y0);
      ctx.fillRect(px - barW / 2, top, barW, Math.max(1, h));
    }
    ctx.restore();
  }
}

function fmtAxis(n) {
  if (!Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return n.toExponential(2);
  return String(Number(n.toPrecision(6)));
}
