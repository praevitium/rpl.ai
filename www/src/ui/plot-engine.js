import {
  isNum, parseAlgebra, evalAst, defaultFnEval,
} from '../rpl/algebra.js';
import {
  isMatrix, isVector, isList, isSymbolic,
  toRealOrThrow, Matrix, Real,
} from '../rpl/types.js';
import { evalFitModel } from '../rpl/state.js';
import { equationToSymbolic, valueToEquationDraft } from './equation-editor.js';

export { evalFitModel };

export const TRACE_COLORS = Object.freeze([
  '#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000',
]);

const CONSTS = Object.freeze({
  pi: Math.PI, π: Math.PI,
  e: Math.E,
});

export function nextTraceColor(index) {
  return TRACE_COLORS[index % TRACE_COLORS.length];
}

export function lookupEnv(name, env) {
  if (env && Object.prototype.hasOwnProperty.call(env, name)) return env[name];
  if (env) {
    const lower = String(name).toLowerCase();
    for (const k of Object.keys(env)) {
      if (k.toLowerCase() === lower) return env[k];
    }
  }
  if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
  const folded = String(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONSTS, folded)) return CONSTS[folded];
  return undefined;
}

function plotFnEval(name, args, opts = {}) {
  if (args.some(a => !Number.isFinite(a))) return NaN;
  const toRad = opts.toRad || (x => x);
  const fromRad = opts.fromRad || (x => x);
  if (args.length === 1) {
    const x = args[0];
    switch (String(name).toUpperCase()) {
      case 'SIN': return Math.sin(toRad(x));
      case 'COS': return Math.cos(toRad(x));
      case 'TAN': return Math.tan(toRad(x));
      case 'ASIN': return x >= -1 && x <= 1 ? fromRad(Math.asin(x)) : NaN;
      case 'ACOS': return x >= -1 && x <= 1 ? fromRad(Math.acos(x)) : NaN;
      case 'ATAN': return fromRad(Math.atan(x));
      default: break;
    }
  }
  const folded = defaultFnEval(name, args);
  return Number.isFinite(folded) ? folded : NaN;
}

export function evalNumeric(ast, env, opts = {}) {
  const node = evalAst(
    ast,
    (name) => {
      const v = lookupEnv(name, env);
      return Number.isFinite(v) ? v : null;
    },
    (name, args) => plotFnEval(name, args, opts),
  );
  return isNum(node) && Number.isFinite(node.value) ? node.value : NaN;
}

export function parsePlotExpr(src) {
  return parseAlgebra(String(src).trim());
}

export function sampleFunction(ast, xMin, xMax, n, env, opts = {}) {
  const count = Math.max(2, n | 0);
  const dx = (xMax - xMin) / (count - 1);
  const ySpan = opts.ySpan ?? Infinity;
  const jump = Number.isFinite(ySpan) ? ySpan * 8 : Infinity;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = xMin + dx * i;
    const y = evalNumeric(ast, { ...env, x, X: x }, opts);
    pts.push([x, y]);
  }
  return segmentPoints(pts, jump);
}

export function samplePolar(ast, thetaMin, thetaMax, n, env, opts = {}) {
  const count = Math.max(2, n | 0);
  const d = (thetaMax - thetaMin) / (count - 1);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = thetaMin + d * i;
    const r = evalNumeric(ast, { ...env, t: th, T: th, θ: th, theta: th }, opts);
    if (!Number.isFinite(r)) { pts.push([NaN, NaN]); continue; }
    const rad = (opts.toRad || (x => x))(th);
    pts.push([r * Math.cos(rad), r * Math.sin(rad)]);
  }
  return segmentPoints(pts, Infinity);
}

export function sampleParametric(astX, astY, tMin, tMax, n, env, opts = {}) {
  const count = Math.max(2, n | 0);
  const dt = (tMax - tMin) / (count - 1);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = tMin + dt * i;
    const local = { ...env, t, T: t };
    pts.push([
      evalNumeric(astX, local, opts),
      evalNumeric(astY, local, opts),
    ]);
  }
  return segmentPoints(pts, Infinity);
}

export function segmentPoints(pts, jump) {
  const segs = [];
  let cur = [];
  let prevY = null;
  for (const [x, y] of pts) {
    const ok = Number.isFinite(x) && Number.isFinite(y);
    const hopped = ok && prevY != null && Number.isFinite(jump)
      && Math.abs(y - prevY) > jump;
    if (!ok || hopped) {
      if (cur.length >= 2) segs.push(cur);
      cur = ok ? [[x, y]] : [];
      prevY = ok ? y : null;
      continue;
    }
    cur.push([x, y]);
    prevY = y;
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

export function niceNum(range, round) {
  const exp = Math.floor(Math.log10(Math.abs(range) || 1));
  const frac = range / Math.pow(10, exp);
  let nice;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

export function niceTicks(min, max, maxTicks = 8) {
  if (!(max > min)) return { ticks: [min], step: 1 };
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    const t = Number(v.toPrecision(12));
    if (t >= min - step * 1e-6 && t <= max + step * 1e-6) ticks.push(t);
  }
  return { ticks, step };
}

export function worldToPixel(x, y, view, width, height, pad = 0) {
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  const px = pad + (x - view.xmin) / (view.xmax - view.xmin) * w;
  const py = pad + (view.ymax - y) / (view.ymax - view.ymin) * h;
  return [px, py];
}

export function pixelToWorld(px, py, view, width, height, pad = 0) {
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  const x = view.xmin + (px - pad) / w * (view.xmax - view.xmin);
  const y = view.ymax - (py - pad) / h * (view.ymax - view.ymin);
  return [x, y];
}

export function zoomView(view, cx, cy, factor) {
  const f = factor > 0 ? factor : 1;
  return {
    xmin: cx - (cx - view.xmin) * f,
    xmax: cx + (view.xmax - cx) * f,
    ymin: cy - (cy - view.ymin) * f,
    ymax: cy + (view.ymax - cy) * f,
  };
}

export function panView(view, dxWorld, dyWorld) {
  return {
    xmin: view.xmin + dxWorld,
    xmax: view.xmax + dxWorld,
    ymin: view.ymin + dyWorld,
    ymax: view.ymax + dyWorld,
  };
}

export function defaultView() {
  return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
}

export function boundsOfPoints(points, padFrac = 0.08) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return defaultView();
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const dx = (maxX - minX) * padFrac;
  const dy = (maxY - minY) * padFrac;
  return { xmin: minX - dx, xmax: maxX + dx, ymin: minY - dy, ymax: maxY + dy };
}

function scalarToNumber(v) {
  try { return toRealOrThrow(v); }
  catch { return NaN; }
}

function isRowContainer(v) {
  return (isList(v) || isVector(v)) && Array.isArray(v.items);
}

function cellsToPoint(cells, i) {
  if (!cells || !cells.length) return null;
  if (cells.length >= 2) return [scalarToNumber(cells[0]), scalarToNumber(cells[1])];
  return [i + 1, scalarToNumber(cells[0])];
}

export function valueToPoints(v) {
  if (isMatrix(v)) {
    const pts = [];
    v.rows.forEach((row, i) => {
      const p = cellsToPoint(row, i);
      if (p) pts.push(p);
    });
    return pts;
  }
  if (isVector(v) || isList(v)) {
    const items = v.items;
    if (items.length && items.every(isRowContainer)) {
      const pts = [];
      items.forEach((row, i) => {
        const p = cellsToPoint(row.items, i);
        if (p) pts.push(p);
      });
      return pts;
    }
    return items.map((item, i) => [i + 1, scalarToNumber(item)]);
  }
  return null;
}

export function valuesFromColumn(v, col = 0) {
  if (isMatrix(v)) {
    return v.rows.map(row => scalarToNumber(row[col] ?? row[0]));
  }
  if (isVector(v) || isList(v)) {
    const items = v.items;
    if (items.length && items.every(isRowContainer)) {
      return items.map(row => scalarToNumber(row.items[col] ?? row.items[0]));
    }
    return items.map(scalarToNumber);
  }
  return null;
}

export function histogram(values, binCount) {
  const nums = (values || []).filter(Number.isFinite);
  if (!nums.length) return { edges: [], counts: [], width: 0 };
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) max = min + 1;
  const n = Math.max(1, binCount || Math.max(5, Math.round(Math.sqrt(nums.length))));
  const width = (max - min) / n;
  const counts = Array(n).fill(0);
  for (const x of nums) {
    let i = Math.floor((x - min) / width);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    counts[i]++;
  }
  const edges = [];
  for (let i = 0; i <= n; i++) edges.push(min + i * width);
  return { edges, counts, width };
}

export function sampleFit(model, xMin, xMax, n) {
  const count = Math.max(2, n | 0);
  const dx = (xMax - xMin) / (count - 1);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = xMin + dx * i;
    pts.push([x, evalFitModel(model, x)]);
  }
  return segmentPoints(pts, Infinity);
}

function finitePts(pts) {
  const out = [];
  for (const p of pts) {
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push(p);
  }
  return out;
}

function pointsSegment(pts) {
  const finite = finitePts(pts || []);
  return finite.length ? [finite] : [];
}

function nearestY(points, x, snapX) {
  let bestY = NaN;
  let bestD = Infinity;
  for (const p of points || []) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const d = Math.abs(p[0] - x);
    if (d < bestD) { bestD = d; bestY = p[1]; }
  }
  if (Number.isFinite(snapX) && bestD > snapX) return NaN;
  return bestY;
}

function expressionFromStack(kind, v) {
  if (v == null || isMatrix(v) || isVector(v) || isList(v)) return null;
  const expr = valueToEquationDraft(v);
  if (!expr) return null;
  return { kind, expr, exprY: '', label: expr, points: null };
}

function expressionToStack(t) {
  if (!t || !t.expr) return [];
  return [equationToSymbolic(t.expr)];
}

function pointsFromStack(kind, v) {
  const points = valueToPoints(v);
  if (!points || !points.length) return null;
  return { kind, points, label: kind, expr: '', exprY: '' };
}

function pointsToStack(t) {
  if (!t?.points?.length) return [];
  return [Matrix(t.points.map(([x, y]) => [
    Real(Number.isFinite(x) ? x : 0),
    Real(Number.isFinite(y) ? y : 0),
  ]))];
}

function histFromStack(v) {
  const nums = valuesFromColumn(v, 0);
  if (!nums) return null;
  const hist = histogram(nums);
  if (!hist.counts.length) return null;
  const points = hist.counts.map((count, i) => [
    (hist.edges[i] + hist.edges[i + 1]) / 2,
    count,
  ]);
  return { kind: 'hist', points, label: 'histogram', expr: '', exprY: '' };
}

function traceContext(view, opts = {}) {
  const v = view || defaultView();
  const raw = Number(opts.width);
  const width = Math.max(240, Number.isFinite(raw) && raw > 0 ? raw : 240);
  return {
    view: v,
    width,
    angleOpts: opts.angleOpts || {},
    thetaRange: opts.thetaRange || { min: 0, max: 2 * Math.PI },
    tRange: opts.tRange || { min: -10, max: 10 },
    fitModel: opts.fitModel || null,
    env: opts.env || {},
    snapX: opts.snapX,
  };
}

function kindSpec(t) {
  if (!t) return null;
  return TRACE_KINDS[t.kind] || (!t.kind ? TRACE_KINDS.function : null);
}

export const TRACE_KINDS = Object.freeze({
  function: {
    render: 'stroke',
    data: false,
    sample(t, ctx) {
      if (!t.expr) return [];
      const view = ctx.view;
      return sampleFunction(
        parsePlotExpr(t.expr), view.xmin, view.xmax,
        Math.max(2, ctx.width | 0), ctx.env || {},
        { ...(ctx.angleOpts || {}), ySpan: view.ymax - view.ymin },
      );
    },
    evalAt(t, x, ctx) {
      if (!t.expr) return NaN;
      return evalNumeric(parsePlotExpr(t.expr), { x, X: x }, ctx.angleOpts || {});
    },
    fromStack(v) { return expressionFromStack('function', v); },
    toStack: expressionToStack,
  },
  polar: {
    render: 'stroke',
    data: true,
    sample(t, ctx) {
      if (!t.expr) return [];
      const th = ctx.thetaRange || { min: 0, max: 2 * Math.PI };
      return samplePolar(
        parsePlotExpr(t.expr), th.min, th.max, 720,
        ctx.env || {}, ctx.angleOpts || {},
      );
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('polar', v); },
    toStack: expressionToStack,
  },
  parametric: {
    render: 'stroke',
    data: true,
    sample(t, ctx) {
      if (!t.expr || !t.exprY) return [];
      const tr = ctx.tRange || { min: -10, max: 10 };
      return sampleParametric(
        parsePlotExpr(t.expr), parsePlotExpr(t.exprY),
        tr.min, tr.max, 480, ctx.env || {}, ctx.angleOpts || {},
      );
    },
    evalAt() { return NaN; },
    fromStack(v, below) { return stackValueToTrace(v, 'parametric', below); },
    toStack(t) {
      const out = [];
      if (t.expr) out.push(equationToSymbolic(t.expr));
      if (t.exprY) out.push(equationToSymbolic(t.exprY));
      return out;
    },
  },
  scatter: {
    render: 'points',
    data: true,
    sample(t) { return pointsSegment(t.points); },
    evalAt(t, x, ctx) { return nearestY(t.points, x, ctx.snapX); },
    fromStack(v) { return pointsFromStack('scatter', v); },
    toStack: pointsToStack,
  },
  bar: {
    render: 'bars',
    data: true,
    sample(t) { return pointsSegment(t.points); },
    evalAt(t, x, ctx) { return nearestY(t.points, x, ctx.snapX); },
    fromStack(v) { return pointsFromStack('bar', v); },
    toStack: pointsToStack,
  },
  hist: {
    render: 'bars',
    data: true,
    sample(t) { return pointsSegment(t.points); },
    evalAt(t, x, ctx) { return nearestY(t.points, x, ctx.snapX); },
    fromStack: histFromStack,
    toStack: pointsToStack,
  },
  fit: {
    render: 'stroke',
    data: false,
    sample(t, ctx) {
      const model = t.model || ctx.fitModel;
      if (!model) return [];
      return sampleFit(model, ctx.view.xmin, ctx.view.xmax, Math.max(2, ctx.width | 0));
    },
    evalAt(t, x, ctx) {
      const model = t.model || ctx.fitModel;
      if (model) return evalFitModel(model, x);
      if (!t.expr) return NaN;
      return evalNumeric(parsePlotExpr(t.expr), { x, X: x }, ctx.angleOpts || {});
    },
    fromStack(v) { return expressionFromStack('fit', v); },
    toStack: expressionToStack,
  },
});

export function sampleTrace(t, view, opts = {}) {
  const kind = kindSpec(t);
  if (!kind) return [];
  return kind.sample(t, traceContext(view, opts));
}

function isDataTrace(t) {
  return !!kindSpec(t)?.data;
}

export function sampleTraceForFit(t, view, opts = {}) {
  if (!t) return [];
  try {
    return finitePts(sampleTrace(t, view, opts).flat());
  } catch {
    return [];
  }
}

export function fitViewToTraces(traces, view, opts = {}) {
  const v = view || defaultView();
  const xy = [];
  const yOnly = [];
  for (const t of traces || []) {
    if (!t || t.enabled === false) continue;
    const pts = sampleTraceForFit(t, v, opts);
    if (!pts.length) continue;
    if (isDataTrace(t)) xy.push(...pts);
    else yOnly.push(...pts);
  }
  if (xy.length) return boundsOfPoints(xy);
  if (yOnly.length) {
    const b = boundsOfPoints(yOnly);
    return { xmin: v.xmin, xmax: v.xmax, ymin: b.ymin, ymax: b.ymax };
  }
  return { xmin: v.xmin, xmax: v.xmax, ymin: v.ymin, ymax: v.ymax };
}

export function evalTraceAtX(t, x, opts = {}) {
  if (!t || t.enabled === false || !Number.isFinite(x)) return NaN;
  const kind = TRACE_KINDS[t.kind];
  if (!kind) return NaN;
  try {
    return kind.evalAt(t, x, opts);
  } catch {
    return NaN;
  }
}

export function stackValueToTrace(v, preferredKind = 'function', below = null) {
  if (isMatrix(v) || isVector(v) || isList(v)) {
    const kind = (preferredKind === 'bar' || preferredKind === 'hist')
      ? preferredKind : 'scatter';
    return TRACE_KINDS[kind].fromStack(v);
  }
  if (preferredKind === 'parametric') {
    if (!isSymbolic(v)) return expressionFromStack('parametric', v);
    const y = valueToEquationDraft(v);
    if (!y) return null;
    const xExpr = isSymbolic(below) ? (valueToEquationDraft(below) || 'T') : 'T';
    return {
      kind: 'parametric',
      expr: xExpr,
      exprY: y,
      label: `(${xExpr}, ${y})`,
      points: null,
    };
  }
  const kind = preferredKind === 'polar' ? 'polar' : 'function';
  return TRACE_KINDS[kind].fromStack(v);
}

export function traceToStackValues(t) {
  if (!t) return [];
  const kind = TRACE_KINDS[t.kind];
  if (!kind) return [];
  return kind.toStack(t);
}
