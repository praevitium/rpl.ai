import {
  TRACE_COLORS, TRACE_KINDS, nextTraceColor, defaultView, zoomView, panView,
  worldToPixel, pixelToWorld, niceTicks,
  sampleTrace, fitViewToTraces, evalTraceAtX,
  stackValueToTrace, traceToStackValues, traceInputError, traceFromInputs,
} from './plot-engine.js';
import { escapeHtml } from './display.js';
import { icon } from './icons.js';
import { isSymbolic, isMatrix, isVector, isList } from '../rpl/types.js';
import { varRecall, getLastFitModel, toRadians, fromRadians } from '../rpl/state.js';

export { stackValueToTrace, traceToStackValues };

let _traceSeq = 0;

const PLOT_KINDS = Object.freeze([
  ['function', 'Function', 'y = f(x)'],
  ['polar', 'Polar', 'r = f(θ)'],
  ['parametric', 'Parametric', 'x(t), y(t)'],
  ['diffeq', 'dy/dx', 'dy/dx = f(x, y)'],
  ['scatter', 'Scatter', 'Points from ΣDAT or the stack'],
  ['bar', 'Bar', 'Bar chart from ΣDAT or the stack'],
  ['hist', 'Histogram', 'Histogram from ΣDAT or the stack'],
]);
const RANGE_FIELDS = Object.freeze([['xmin', 'x from'], ['xmax', 'x to'], ['ymin', 'y from'], ['ymax', 'y to']]);
const IDLE_READOUT = 'Hover, or press T to trace · drag to pan · scroll to zoom';

function angleOpts() {
  return { toRad: toRadians, fromRad: fromRadians };
}

function thetaRange() {
  const rad = toRadians(1);
  if (Math.abs(rad - Math.PI / 180) < 1e-9) return { min: 0, max: 360 };
  if (Math.abs(rad - Math.PI / 200) < 1e-9) return { min: 0, max: 400 };
  return { min: 0, max: 2 * Math.PI };
}

export function makeTrace(partial = {}) {
  const id = partial.id || `t${++_traceSeq}`;
  return {
    id,
    color: partial.color || nextTraceColor(_traceSeq - 1),
    enabled: partial.enabled !== false,
    kind: partial.kind || 'function',
    expr: partial.expr || '',
    exprY: partial.exprY || '',
    points: partial.points || null,
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
    this.traces = [];
    this._drag = null;
    this._hover = null;
    this.tracing = false;
    this.traceX = null;
    this.el = document.createElement('div');
    this.el.className = 'gr-view';
    this.el.innerHTML = `
      <div class="pl-main">
        <div class="pl-box" tabindex="0" role="application" aria-label="Plot. Arrows pan, plus and minus zoom, 0 resets, T traces, F goes full screen.">
          <canvas class="gr-canvas" aria-hidden="true"></canvas>
          <div class="pl-tools" role="toolbar" aria-label="Plot tools">
            <button type="button" data-gr="zin" title="Zoom in (+)" aria-label="Zoom in">${icon('plus', 'sm')}</button>
            <button type="button" data-gr="zout" title="Zoom out (−)" aria-label="Zoom out">${icon('minus', 'sm')}</button>
            <button type="button" data-gr="fit" title="Fit the traces" aria-label="Fit">${icon('fit', 'sm')}</button>
            <button type="button" data-gr="reset" title="Reset the view (0)" aria-label="Reset">${icon('target', 'sm')}</button>
            <button type="button" data-gr="trace" title="Trace (T): arrows move along the curve" aria-label="Trace" aria-pressed="false">${icon('trace', 'sm')}</button>
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
  }

  _bind() {
    this.el.querySelector('.pl-kinds').addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-kind]');
      if (btn) this.setKind(btn.dataset.kind);
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
      else if (act === 'from') this.loadFromStack(1);
      else if (act === 'data-level1') this.loadData(this._kind, this.app?.stack?.depth ? this.app.stack.peek(1) : null);
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
      this._drag = { x: ev.offsetX, y: ev.offsetY, view: { ...this.view } };
      this._hover = null;
      this.draw();
    });
    canvas.addEventListener('pointerup', (ev) => {
      this._drag = null;
      this._hoverFromEvent(ev);
    });
    canvas.addEventListener('pointercancel', () => {
      this._drag = null;
      this._clearHover();
    });
    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      if (this._drag) {
        const [x0, y0] = pixelToWorld(this._drag.x, this._drag.y, this._drag.view, rect.width, rect.height);
        const [x1, y1] = pixelToWorld(ev.offsetX, ev.offsetY, this._drag.view, rect.width, rect.height);
        this.view = panView(this._drag.view, x0 - x1, y0 - y1);
        this.draw();
      } else {
        this._hoverFromEvent(ev);
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this._drag) this._clearHover();
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
      this.view = defaultView();
      this._hoverFromEvent(ev);
    });

    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(this._box);
  }

  setKind(kind) {
    if (kind !== this._kind) this._addY.value = '';
    this._kind = kind;
    this.el.querySelectorAll('.pl-kinds button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    });
    const spec = TRACE_KINDS[kind];
    if (spec) {
      const fields = spec.fields || [];
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
    this._renderExprs();
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
    if (err) {
      this.app?.entry?.flashError?.({ message: `Graph: ${err}` });
      return;
    }
    this._addTrace(traceFromInputs(kind, expr, exprY), { fit: !!spec.fitOnAdd });
    this._addX.value = '';
    this._addY.value = '';
  }

  loadData(kind, value) {
    const v = value || this._dataValue();
    if (!v) {
      this.app?.entry?.flashError?.({ message: 'Graph: no ΣDAT and stack top is not data' });
      return;
    }
    const spec = TRACE_KINDS[kind]?.fromStack(v);
    if (!spec) {
      this.app?.entry?.flashError?.({ message: 'Graph: no numeric points' });
      return;
    }
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
    const stack = this.app?.stack;
    if (stack && stack.depth >= 1) {
      const top = stack.peek();
      if (isMatrix(top) || isVector(top) || isList(top)) return top;
    }
    return varRecall('ΣDAT');
  }

  applyPlotOp(kind, stack) {
    if (kind === 'draw') {
      this.draw();
      return;
    }
    this.setKind(kind);
    const spec = TRACE_KINDS[kind];
    if (spec?.fields?.length) {
      const top = stack?.peek?.();
      if (!isSymbolic(top)) {
        this.app?.entry?.flashError?.({ message: `Graph: ${kind} expects a Symbolic on the stack` });
        return;
      }
      const below = stack.depth >= 2 ? stack.peek(2) : null;
      const built = stackValueToTrace(top, kind, below);
      if (!built) {
        this.app?.entry?.flashError?.({ message: `Graph: ${kind} expects a Symbolic on the stack` });
        return;
      }
      const err = traceInputError(kind, built, { adding: true });
      if (err) {
        this.app?.entry?.flashError?.({ message: `Graph: ${err}` });
        return;
      }
      this._addTrace(built, { fit: !!spec.fitOnAdd });
      return;
    }
    const top = stack?.peek?.();
    const data = (top && (isMatrix(top) || isVector(top) || isList(top)))
      ? top : varRecall('ΣDAT');
    this.loadData(kind, data);
  }

  loadFromStack(level = 1) {
    const stack = this.app?.stack;
    if (!stack || stack.depth < 1) {
      this.app?.entry?.flashError?.({ message: 'Graph: empty stack' });
      return true;
    }
    if (level < 1 || level > stack.depth) return true;
    const v = stack.peek(level);
    const below = stack.depth >= level + 1 ? stack.peek(level + 1) : null;
    const spec = stackValueToTrace(v, this._kind, below);
    if (!spec) {
      this.app?.entry?.flashError?.({ message: 'Graph: stack value is not an expression or data' });
      return true;
    }
    const err = traceInputError(spec.kind, spec, { adding: true });
    if (err) {
      this.app?.entry?.flashError?.({ message: `Graph: ${err}` });
      return true;
    }
    this.setKind(spec.kind);
    this._addTrace(spec, { fit: true });
    this._readout.textContent = `Copied L${level}`;
    return true;
  }

  pushTrace(id) {
    const t = this.traces.find(tr => tr.id === id);
    if (!t) return;
    try {
      const values = traceToStackValues(t);
      if (!values.length) {
        this.app?.entry?.flashError?.({ message: 'Graph: nothing to push' });
        return;
      }
      this.app.commitEntryAndPush(values);
      this._readout.textContent = `Pushed ${t.label || t.kind}`;
    } catch (e) {
      this.app?.entry?.flashError?.({ message: `Graph: ${e.message}` });
    }
  }

  _addTrace(partial, { fit = false, draw = true } = {}) {
    const first = !this.traces.length;
    const t = makeTrace(partial);
    this.traces.push(t);
    this._selectedId = t.id;
    if (draw) this._renderExprs();
    if (fit || first) this.fitView();
    else if (draw) this.draw();
    return t;
  }

  _selectTrace(id) {
    if (this._selectedId === id) return;
    this._selectedId = id;
    this._exprs.querySelectorAll('.gr-trace').forEach(row => {
      row.classList.toggle('selected', row.dataset.trace === id);
    });
  }

  _hoverOpts() {
    const rect = this._canvas.getBoundingClientRect();
    return {
      angleOpts: angleOpts(),
      snapX: (this.view.xmax - this.view.xmin) * 0.03,
      view: this.view,
      width: rect.width || 240,
    };
  }

  _hoverFromEvent(ev) {
    if (this.tracing) return;
    const rect = this._canvas.getBoundingClientRect();
    const [wx, wy] = pixelToWorld(ev.offsetX, ev.offsetY, this.view, rect.width, rect.height);
    this._hover = { x: wx, y: wy };
    this._readout.textContent = this._readoutAt(wx, wy);
    this.draw();
  }

  _clearHover() {
    this._hover = null;
    if (!this.tracing) this._readout.textContent = IDLE_READOUT;
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

  resetView() {
    this.view = defaultView();
    this.draw();
  }

  nudge(dir) {
    const v = this.view;
    const dx = (v.xmax - v.xmin) / 20;
    const dy = (v.ymax - v.ymin) / 20;
    if (this.tracing && (dir === 'left' || dir === 'right')) {
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
    this._readout.textContent = this.tracing ? this._readoutAt(this.traceX) : IDLE_READOUT;
    if (this.tracing) this.focus();
    this.draw();
  }

  fullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const request = this._box.requestFullscreen?.();
    const fallback = () => {
      this.app?.setPlotFocus?.(true);
      this.app?.toast?.("Full screen isn't allowed here, so the plot fills the window instead.");
    };
    if (request?.catch) request.catch(fallback);
    else if (!request) fallback();
  }

  _applyRange(input) {
    const value = Number(String(input.value).trim());
    const next = { ...this.view, [input.dataset.rng]: value };
    const valid = Number.isFinite(value) && next.xmin < next.xmax && next.ymin < next.ymax;
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
    this.view = fitViewToTraces(this.traces, this.view, {
      angleOpts: angleOpts(),
      thetaRange: thetaRange(),
      tRange: { min: -10, max: 10 },
      width: wrap?.clientWidth || 240,
      height: wrap?.clientHeight,
    });
    this.draw();
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
        <button type="button" class="mini" data-trace="${t.id}" data-act="push" title="Push it onto the stack" aria-label="Push onto the stack">${icon('down', 'sm')}</button>
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

    this._drawGrid(ctx, width, height);
    for (const t of this.traces) {
      if (!t.enabled) continue;
      this._drawTrace(ctx, t, width, height);
    }
    this._drawHover(ctx, width, height);
  }

  _drawGrid(ctx, width, height) {
    const view = this.view;
    const xt = niceTicks(view.xmin, view.xmax, 8);
    const yt = niceTicks(view.ymin, view.ymax, 8);
    ctx.save();
    ctx.lineWidth = 1;
    const colors = this._colors;
    ctx.font = colors.font;
    ctx.fillStyle = colors.label;
    for (const x of xt.ticks) {
      const [px] = worldToPixel(x, 0, view, width, height);
      ctx.strokeStyle = Math.abs(x) < xt.step * 1e-9 ? colors.axis : colors.grid;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      if (Math.abs(x) > xt.step * 1e-9) {
        const [, py0] = worldToPixel(0, 0, view, width, height);
        ctx.fillText(fmtAxis(x), px + 3, Math.min(height - 4, Math.max(12, py0 - 4)));
      }
    }
    for (const y of yt.ticks) {
      const [, py] = worldToPixel(0, y, view, width, height);
      ctx.strokeStyle = Math.abs(y) < yt.step * 1e-9 ? colors.axis : colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
      if (Math.abs(y) > yt.step * 1e-9) {
        const [px0] = worldToPixel(0, 0, view, width, height);
        ctx.fillText(fmtAxis(y), Math.min(width - 36, Math.max(4, px0 + 4)), py - 3);
      }
    }
    ctx.restore();
  }

  _drawTrace(ctx, t, width, height) {
    const spec = TRACE_KINDS[t.kind];
    if (!spec) return;
    let segs = [];
    try {
      segs = sampleTrace(t, this.view, {
        width,
        angleOpts: angleOpts(),
        thetaRange: thetaRange(),
        tRange: { min: -10, max: 10 },
      });
    } catch {
      return;
    }
    if (spec.render === 'bars') {
      this._drawBars(ctx, t, segs, width, height);
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

  _drawBars(ctx, t, segs, width, height) {
    const view = this.view;
    ctx.save();
    ctx.fillStyle = t.color;
    const pts = [];
    for (const seg of segs || []) {
      for (const p of seg) pts.push(p);
    }
    ctx.fillStyle = this._traceColor(t);
    const barW = pts.length > 1
      ? Math.abs(worldToPixel(pts[1][0], 0, view, width, height)[0]
        - worldToPixel(pts[0][0], 0, view, width, height)[0]) * 0.7
      : 16;
    const [, y0] = worldToPixel(0, 0, view, width, height);
    for (const [x, y] of pts) {
      const [px, py] = worldToPixel(x, y, view, width, height);
      const top = Math.min(py, y0);
      const h = Math.abs(py - y0);
      ctx.globalAlpha = 0.85;
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



