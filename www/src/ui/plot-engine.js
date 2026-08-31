/* Plot sampling, viewport math, and data extraction.
   DOM-free so Node tests can pin the graphing surface. */

import {
  isNum, isVar, isNeg, isBin, isFn, parseAlgebra, defaultFnEval,
} from '../rpl/algebra.js';
import {
  isMatrix, isVector, isList, isSymbolic, isNumber,
  toRealOrThrow,
} from '../rpl/types.js';

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

/** Map a variable name onto an env value.  Exact match first, then
 *  case-insensitive, then the small constants table (π, e). */
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

/**
 * Numeric eval of an algebra AST.  Returns a finite number or NaN.
 * `toRad` / `fromRad` default to identity so tests can stay in radians;
 * the graph view passes the calculator's angle-mode converters.
 */
export function evalNumeric(ast, env, opts = {}) {
  const toRad = opts.toRad || (x => x);
  const fromRad = opts.fromRad || (x => x);
  function ev(n) {
    if (!n) return NaN;
    if (isNum(n)) return n.value;
    if (isVar(n)) {
      const v = lookupEnv(n.name, env);
      return Number.isFinite(v) ? v : NaN;
    }
    if (isNeg(n)) return -ev(n.arg);
    if (isBin(n)) {
      const l = ev(n.l);
      const r = ev(n.r);
      switch (n.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? NaN : l / r;
        case '^': return Math.pow(l, r);
        default: return NaN;
      }
    }
    if (isFn(n)) {
      const args = n.args.map(ev);
      if (args.some(a => !Number.isFinite(a))) return NaN;
      const name = String(n.name).toUpperCase();
      if (args.length === 1) {
        const x = args[0];
        switch (name) {
          case 'SIN': return Math.sin(toRad(x));
          case 'COS': return Math.cos(toRad(x));
          case 'TAN': return Math.tan(toRad(x));
          case 'ASIN': return Number.isFinite(x) && x >= -1 && x <= 1 ? fromRad(Math.asin(x)) : NaN;
          case 'ACOS': return Number.isFinite(x) && x >= -1 && x <= 1 ? fromRad(Math.acos(x)) : NaN;
          case 'ATAN': return fromRad(Math.atan(x));
        }
      }
      const folded = defaultFnEval(n.name, args);
      return Number.isFinite(folded) ? folded : NaN;
    }
    return NaN;
  }
  const y = ev(ast);
  return Number.isFinite(y) ? y : NaN;
}

export function parsePlotExpr(src) {
  return parseAlgebra(String(src).trim());
}

/** Sample y = f(x) as a list of segments (gaps at NaN / big jumps). */
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

/** Polar r = f(θ).  `thetaMin`/`thetaMax` are in the caller's angle units. */
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
  // Guard against float drift at the end of the range.
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

/** Pull [x,y] pairs from a Matrix (1-col → (i,y), 2+-col → (x,y)),
 *  Vector (i, y), or List of numbers.  Indices are 1-based like HP50. */
export function valueToPoints(v) {
  if (isMatrix(v)) {
    const pts = [];
    v.rows.forEach((row, i) => {
      if (row.length >= 2) {
        pts.push([scalarToNumber(row[0]), scalarToNumber(row[1])]);
      } else if (row.length === 1) {
        pts.push([i + 1, scalarToNumber(row[0])]);
      }
    });
    return pts;
  }
  if (isVector(v)) {
    return v.items.map((item, i) => [i + 1, scalarToNumber(item)]);
  }
  if (isList(v)) {
    return v.items.map((item, i) => [i + 1, scalarToNumber(item)]);
  }
  return null;
}

export function valuesFromColumn(v, col = 0) {
  if (isMatrix(v)) {
    return v.rows.map(row => scalarToNumber(row[col] ?? row[0]));
  }
  if (isVector(v) || isList(v)) {
    const items = isVector(v) ? v.items : v.items;
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

export function evalFitModel(model, x) {
  if (!model || !Number.isFinite(x)) return NaN;
  switch (model.kind) {
    case 'LIN': return model.a + model.b * x;
    case 'LOG': return x > 0 ? model.a + model.b * Math.log(x) : NaN;
    case 'EXP': return model.a * Math.exp(model.b * x);
    case 'PWR': return x > 0 ? model.a * Math.pow(x, model.b) : NaN;
    default: return NaN;
  }
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

export function symbolicToAst(v) {
  return isSymbolic(v) ? v.expr : null;
}
