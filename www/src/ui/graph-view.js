/* Graph view — Desmos-like cartesian plot in the side panel.

   Traces are sampled from Symbolic expressions (or from ΣDAT / the
   stack) by plot-engine.js and drawn on a pan/zoom canvas. */

import {
  TRACE_COLORS, nextTraceColor, defaultView, zoomView, panView,
  worldToPixel, pixelToWorld, niceTicks, parsePlotExpr,
  sampleFunction, samplePolar, sampleParametric, sampleFit,
  valueToPoints, valuesFromColumn, histogram, boundsOfPoints,
  fitViewToTraces,
} from './plot-engine.js';
import { formatAlgebra } from '../rpl/algebra.js';
import { isSymbolic, isMatrix, isVector, isList, Matrix, Real } from '../rpl/types.js';
import { varRecall, getLastFitModel, toRadians, fromRadians } from '../rpl/state.js';
import { equationToSymbolic, valueToEquationDraft } from './equation-editor.js';

let _traceSeq = 0;

function angleOpts() {
  return { toRad: toRadians, fromRad: fromRadians };
}

function thetaRange() {
  // Sample a full turn in the active angle unit so SIN(θ) honours DEG.
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
  };
}

/** Stack value → a plottable trace spec (no id/color).  Symbolics
 *  become expression traces; Matrix/Vector/List become data traces. */
export function stackValueToTrace(v, preferredKind = 'function') {
  if (isSymbolic(v)) {
    const expr = formatAlgebra(v.expr);
    const kind = (preferredKind === 'polar' || preferredKind === 'parametric')
      ? preferredKind : 'function';
    return { kind, expr, exprY: '', label: expr, points: null };
  }
  if (isMatrix(v) || isVector(v) || isList(v)) {
    const points = valueToPoints(v);
    if (!points || !points.length) return null;
    const kind = (preferredKind === 'bar' || preferredKind === 'hist')
      ? preferredKind : 'scatter';
    return { kind, points, label: kind, expr: '', exprY: '' };
  }
  const expr = valueToEquationDraft(v);
  if (!expr) return null;
  const kind = (preferredKind === 'polar' || preferredKind === 'parametric')
    ? preferredKind : 'function';
  return { kind, expr, exprY: '', label: expr, points: null };
}

/** Trace → RPL values to push (0–2).  Expressions become Symbolic;
 *  point traces become a 2-col Matrix. */
export function traceToStackValues(t) {
  if (!t) return [];
  if (t.kind === 'parametric') {
    const out = [];
    if (t.expr) out.push(equationToSymbolic(t.expr));
    if (t.exprY) out.push(equationToSymbolic(t.exprY));
    return out;
  }
  if (t.kind === 'function' || t.kind === 'polar' || t.kind === 'fit') {
    if (!t.expr) return [];
    return [equationToSymbolic(t.expr)];
  }
  if (t.points && t.points.length) {
    return [Matrix(t.points.map(([x, y]) => [
      Real(Number.isFinite(x) ? x : 0),
      Real(Number.isFinite(y) ? y : 0),
    ]))];
  }
  return [];
}

export class GraphView {
  constructor({ app } = {}) {
    this.app = app;
    this.view = defaultView();
    this.traces = [];
    this._drag = null;
    this.el = document.createElement('div');
    this.el.className = 'gr-view';
    this.el.innerHTML = `
      <div class="ed-toolbar gr-toolbar">
        <span class="gr-modes" role="group" aria-label="Plot type">
          <button type="button" data-kind="function" class="active" title="y = f(x)">y=f(x)</button>
          <button type="button" data-kind="polar" title="r = f(θ)">polar</button>
          <button type="button" data-kind="parametric" title="x(t), y(t)">param</button>
          <button type="button" data-kind="scatter" title="Scatter from ΣDAT or stack">scatter</button>
          <button type="button" data-kind="bar" title="Bar chart">bar</button>
          <button type="button" data-kind="hist" title="Histogram">hist</button>
        </span>
        <button type="button" data-gr="from" title="Copy stack level 1 into a new trace">From stack</button>
        <button type="button" data-gr="to" title="Push the selected (or last) trace onto the stack">To stack</button>
        <button type="button" data-gr="reset" title="Reset view">Reset</button>
        <button type="button" data-gr="fit" title="Fit view to data">Fit</button>
      </div>
      <div class="gr-exprs" aria-label="Expressions"></div>
      <form class="gr-add">
        <input type="text" class="gr-add-x" spellcheck="false"
               placeholder="SIN(X)" aria-label="Expression" />
        <input type="text" class="gr-add-y hidden" spellcheck="false"
               placeholder="COS(T)" aria-label="Y expression" />
        <button type="submit" title="Add expression">Add</button>
      </form>
      <div class="gr-canvas-wrap">
        <canvas class="gr-canvas" aria-label="Graph"></canvas>
      </div>
      <div class="gr-readout" aria-live="polite"></div>
    `;
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
    this.el.querySelector('.gr-modes').addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-kind]');
      if (!btn) return;
      this.setKind(btn.dataset.kind);
    });
    this.el.querySelector('[data-gr="reset"]').addEventListener('click', () => {
      this.view = defaultView();
      this.draw();
    });
    this.el.querySelector('[data-gr="fit"]').addEventListener('click', () => {
      this.fitView();
    });
    this.el.querySelector('[data-gr="from"]').addEventListener('click', () => {
      this.loadFromStack(1);
    });
    this.el.querySelector('[data-gr="to"]').addEventListener('click', () => {
      this.pushToStack();
    });
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
      if (row?.dataset.trace) {
        this._selectedId = row.dataset.trace;
        this._renderExprs();
      }
    });
    this._addX.addEventListener('keydown', (ev) => ev.stopPropagation());
    this._addY.addEventListener('keydown', (ev) => ev.stopPropagation());

    const canvas = this._canvas;
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      this._drag = { x: ev.offsetX, y: ev.offsetY, view: { ...this.view } };
    });
    canvas.addEventListener('pointerup', () => { this._drag = null; });
    canvas.addEventListener('pointercancel', () => { this._drag = null; });
    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      if (this._drag) {
        const [x0, y0] = pixelToWorld(this._drag.x, this._drag.y, this._drag.view, rect.width, rect.height);
        const [x1, y1] = pixelToWorld(ev.offsetX, ev.offsetY, this._drag.view, rect.width, rect.height);
        this.view = panView(this._drag.view, x0 - x1, y0 - y1);
        this.draw();
      } else {
        const [wx, wy] = pixelToWorld(ev.offsetX, ev.offsetY, this.view, rect.width, rect.height);
        this._readout.textContent = `${fmtAxis(wx)}, ${fmtAxis(wy)}`;
      }
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this._drag) this._readout.textContent = '';
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const [cx, cy] = pixelToWorld(ev.offsetX, ev.offsetY, this.view, rect.width, rect.height);
      const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      this.view = zoomView(this.view, cx, cy, factor);
      this.draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', () => {
      this.view = defaultView();
      this.draw();
    });

    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(this.el.querySelector('.gr-canvas-wrap'));
  }

  setKind(kind) {
    this._kind = kind;
    this.el.querySelectorAll('.gr-modes button').forEach(b => {
      b.classList.toggle('active', b.dataset.kind === kind);
    });
    const parametric = kind === 'parametric';
    this._addY.classList.toggle('hidden', !parametric);
    this._addX.placeholder =
      kind === 'polar' ? '1 + COS(θ)' :
      kind === 'parametric' ? 'COS(T)' :
      kind === 'function' ? 'SIN(X)' :
      'data from stack / ΣDAT';
    this._addY.placeholder = 'SIN(T)';
    this._renderExprs();
  }

  addFromInputs() {
    const kind = this._kind;
    if (kind === 'scatter' || kind === 'bar' || kind === 'hist') {
      this.loadData(kind);
      return;
    }
    const expr = this._addX.value.trim();
    const exprY = this._addY.value.trim();
    if (!expr) return;
    try {
      parsePlotExpr(expr);
      if (kind === 'parametric') parsePlotExpr(exprY);
    } catch (e) {
      this.app?.entry?.flashError?.({ message: `Graph: ${e.message}` });
      return;
    }
    this.traces.push(makeTrace({
      kind,
      expr,
      exprY: kind === 'parametric' ? exprY : '',
      label: kind === 'parametric' ? `(${expr}, ${exprY})` : expr,
    }));
    this._addX.value = '';
    this._addY.value = '';
    this._renderExprs();
    this.draw();
  }

  loadData(kind, value) {
    const v = value || this._dataValue();
    if (!v) {
      this.app?.entry?.flashError?.({ message: 'Graph: no ΣDAT and stack top is not data' });
      return;
    }
    if (kind === 'hist') {
      const nums = valuesFromColumn(v, 0) || [];
      const hist = histogram(nums);
      const points = hist.counts.map((count, i) => [
        (hist.edges[i] + hist.edges[i + 1]) / 2,
        count,
      ]);
      this.traces.push(makeTrace({
        kind: 'hist',
        points,
        label: 'histogram',
      }));
    } else {
      const points = valueToPoints(v);
      if (!points || !points.length) {
        this.app?.entry?.flashError?.({ message: 'Graph: no numeric points' });
        return;
      }
      this.traces.push(makeTrace({
        kind,
        points,
        label: kind === 'bar' ? 'bar' : 'scatter',
      }));
      const fit = getLastFitModel();
      if (kind === 'scatter' && fit) {
        this.traces.push(makeTrace({
          kind: 'fit',
          label: `${fit.kind} fit`,
          color: TRACE_COLORS[4],
        }));
      }
    }
    this.fitView();
    this._renderExprs();
    this.draw();
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
    this.setKind(kind);
    if (kind === 'draw') {
      this.draw();
      return;
    }
    if (kind === 'function' || kind === 'polar' || kind === 'parametric') {
      const top = stack?.peek?.();
      if (isSymbolic(top)) {
        const expr = formatAlgebra(top.expr);
        if (kind === 'parametric') {
          // Need two symbolics: y on level 1, x on level 2.
          const y = expr;
          const xVal = stack.depth >= 2 ? stack.peek(2) : null;
          const xExpr = isSymbolic(xVal) ? formatAlgebra(xVal.expr) : 'T';
          this.traces.push(makeTrace({
            kind: 'parametric', expr: xExpr, exprY: y,
            label: `(${xExpr}, ${y})`,
          }));
        } else {
          this.traces.push(makeTrace({ kind, expr, label: expr }));
        }
        this._renderExprs();
        this.draw();
        return;
      }
      this.app?.entry?.flashError?.({ message: `Graph: ${kind} expects a Symbolic on the stack` });
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
    if (this._kind === 'parametric' && isSymbolic(v)) {
      const y = formatAlgebra(v.expr);
      const xVal = stack.depth >= level + 1 ? stack.peek(level + 1) : null;
      const xExpr = isSymbolic(xVal) ? formatAlgebra(xVal.expr) : 'T';
      const t = makeTrace({
        kind: 'parametric', expr: xExpr, exprY: y,
        label: `(${xExpr}, ${y})`,
      });
      this.traces.push(t);
      this._selectedId = t.id;
      this._renderExprs();
      this.draw();
      this._readout.textContent = `Copied L${level}`;
      return true;
    }
    const spec = stackValueToTrace(v, this._kind);
    if (!spec) {
      this.app?.entry?.flashError?.({ message: 'Graph: stack value is not an expression or data' });
      return true;
    }
    const t = makeTrace(spec);
    this.traces.push(t);
    this._selectedId = t.id;
    this.setKind(t.kind);
    this.fitView();
    this._renderExprs();
    this.draw();
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
      const entry = this.app?.entry;
      if (entry?.buffer?.trim?.().length > 0) entry.enter();
      for (const v of values) this.app.stack.push(v);
      this._readout.textContent = `Pushed ${t.label || t.kind}`;
    } catch (e) {
      this.app?.entry?.flashError?.({ message: `Graph: ${e.message}` });
    }
  }

  pushToStack() {
    const id = this._selectedId
      || [...this.traces].reverse().find(t => t.enabled)?.id
      || this.traces[this.traces.length - 1]?.id;
    if (!id) {
      this.app?.entry?.flashError?.({ message: 'Graph: no traces' });
      return;
    }
    this.pushTrace(id);
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
      fitModel: getLastFitModel(),
      width: wrap?.clientWidth || 240,
    });
    this.draw();
  }

  _renderExprs() {
    this._exprs.innerHTML = this.traces.map(t => `
      <div class="gr-trace ${t.enabled ? '' : 'off'}${t.id === this._selectedId ? ' selected' : ''}"
           data-trace="${t.id}">
        <button type="button" class="gr-swatch" data-trace="${t.id}" data-act="toggle"
                style="--swatch:${t.color}" title="Toggle" aria-label="Toggle"></button>
        <span class="gr-trace-label">${escapeHtml(t.label || t.expr || t.kind)}</span>
        <button type="button" data-trace="${t.id}" data-act="push" title="Push onto the stack">To stack</button>
        <button type="button" data-trace="${t.id}" data-act="remove" title="Remove">×</button>
      </div>
    `).join('') || '<div class="gr-empty">From stack copies level 1 here. To stack pushes a trace. Or type an expression and Add.</div>';
  }

  resize() { this.draw(); }

  draw() {
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

    ctx.fillStyle = '#fbfbfd';
    ctx.fillRect(0, 0, width, height);

    this._drawGrid(ctx, width, height);
    for (const t of this.traces) {
      if (!t.enabled) continue;
      this._drawTrace(ctx, t, width, height);
    }
  }

  _drawGrid(ctx, width, height) {
    const view = this.view;
    const xt = niceTicks(view.xmin, view.xmax, 8);
    const yt = niceTicks(view.ymin, view.ymax, 8);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px Inter, Helvetica Neue, Arial, sans-serif';
    ctx.fillStyle = '#7b8190';
    for (const x of xt.ticks) {
      const [px] = worldToPixel(x, 0, view, width, height);
      ctx.strokeStyle = Math.abs(x) < xt.step * 1e-9 ? '#2a3140' : '#e4e7ee';
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
      ctx.strokeStyle = Math.abs(y) < yt.step * 1e-9 ? '#2a3140' : '#e4e7ee';
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
    const view = this.view;
    const opts = { ...angleOpts(), ySpan: view.ymax - view.ymin };
    let segs = [];
    try {
      if (t.kind === 'function') {
        const ast = parsePlotExpr(t.expr);
        segs = sampleFunction(ast, view.xmin, view.xmax, Math.max(240, width), {}, opts);
      } else if (t.kind === 'polar') {
        const ast = parsePlotExpr(t.expr);
        const th = thetaRange();
        segs = samplePolar(ast, th.min, th.max, 720, {}, opts);
      } else if (t.kind === 'parametric') {
        const ax = parsePlotExpr(t.expr);
        const ay = parsePlotExpr(t.exprY);
        segs = sampleParametric(ax, ay, -10, 10, 480, {}, opts);
      } else if (t.kind === 'fit') {
        const model = getLastFitModel();
        if (model) segs = sampleFit(model, view.xmin, view.xmax, Math.max(240, width));
      } else if (t.points) {
        if (t.kind === 'bar' || t.kind === 'hist') {
          this._drawBars(ctx, t, width, height);
          return;
        }
        segs = [t.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))];
      }
    } catch {
      return;
    }
    ctx.save();
    ctx.strokeStyle = t.color;
    ctx.fillStyle = t.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const seg of segs) {
      if (t.kind === 'scatter') {
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

  _drawBars(ctx, t, width, height) {
    const view = this.view;
    ctx.save();
    ctx.fillStyle = t.color;
    const pts = t.points || [];
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}


