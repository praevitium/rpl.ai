import {
  isNum, parseAlgebra, evalAst, defaultFnEval, Bin,
} from '../rpl/algebra.js';
import {
  isMatrix, isVector, isList, isSymbolic,
  toRealOrThrow, Matrix, Real,
} from '../rpl/types.js';
import { evalFitModel } from '../rpl/state.js';
import { _expandUserCalls } from '../rpl/ops/internal.js';
import { equationToSymbolic, valueToEquationDraft } from './equation-editor.js';

export { evalFitModel };

export const TRACE_COLORS = Object.freeze([
  '#e5534b', '#4a9eed', '#57ab5a', '#b083f0', '#f0883e', '#2bb8b3',
]);

const CONSTS = Object.freeze({
  pi: Math.PI, π: Math.PI,
  e: Math.E,
});

// PPAR's independent variable, when it names one, is bound beside the usual X, T and θ.
function bindIndependentVariable(v, name) {
  const bound = { x: v, X: v, t: v, T: v, θ: v, theta: v };
  if (name) bound[name] = v;
  return bound;
}

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

// A user function such as one DEFINE made is plotted through its body.
export function parsePlotExpr(src) {
  return _expandUserCalls(parseAlgebra(String(src).trim()));
}

export function sampleFunction(ast, xMin, xMax, n, env, opts = {}) {
  const count = Math.max(2, n | 0);
  const dx = (xMax - xMin) / (count - 1);
  const ySpan = opts.ySpan ?? Infinity;
  const jump = Number.isFinite(ySpan) ? ySpan * 8 : Infinity;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = xMin + dx * i;
    const y = evalNumeric(ast, { ...env, ...bindIndependentVariable(x, opts.indep) }, opts);
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
    const r = evalNumeric(ast, { ...env, ...bindIndependentVariable(th, opts.indep) }, opts);
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
    const local = { ...env, ...bindIndependentVariable(t, opts.indep) };
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

// A span narrower than the spacing of doubles at its magnitude has no ticks to draw.
export function hasUsableSpan(min, max) {
  return max - min > Math.max(Math.abs(min), Math.abs(max)) * 1e-12;
}

export function niceTicks(min, max, maxTicks = 8) {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return { ticks: [Number.isFinite(min) ? min : 0], step: 1 };
  }
  const range = niceNum(max - min, false);
  let step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  const ulp = Math.max(Number.EPSILON * scale, Number.MIN_VALUE);
  if (!(step > 0) || !Number.isFinite(step) || step < ulp * 2) {
    return { ticks: [min, max], step: max - min };
  }
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  const cap = Math.max(1, maxTicks) + 2;
  let prev = -Infinity;
  for (let i = 0; i < cap; i++) {
    const v = start + i * step;
    if (!(v > prev)) break;
    prev = v;
    if (v > max + step * 0.5) break;
    const t = Number(v.toPrecision(12));
    if (t >= min - step * 1e-6 && t <= max + step * 1e-6) ticks.push(t);
  }
  if (ticks.length === 0) ticks.push(min);
  return { ticks, step };
}

// Ticks every spacing from the axes' crossing, as AXES and ATICK set them, in whole multiples of it when they would
// crowd the axis; nice ticks when no spacing is set.
export function axisTicks(min, max, origin = 0, spacing = 0, maxTicks = 8) {
  const nice = niceTicks(min, max, 8);
  if ((!(spacing > 0) && origin === 0) || !(max > min) || !Number.isFinite(min + max + origin)) return nice;
  const base = spacing > 0 ? spacing : nice.step;
  const step = base * Math.max(1, Math.ceil((max - min) / base / Math.max(2, maxTicks)));
  const ticks = [];
  for (let k = Math.ceil((min - origin) / step), n = 0; n <= maxTicks + 2; k++, n++) {
    const t = Number((origin + k * step).toPrecision(12));
    if (t > max + step * 1e-6) break;
    ticks.push(t);
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

// Two fingers moved from `from` to `to` (pixel pairs): the view scales by how far
// they spread, and the point under their first midpoint follows their midpoint.
export function pinchView(view, from, to, width, height) {
  const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const spread = ([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (!spread(from) || !spread(to)) return view;
  const [wx, wy] = pixelToWorld(...mid(from), view, width, height);
  const zoomed = zoomView(view, wx, wy, spread(from) / spread(to));
  const [vx, vy] = pixelToWorld(...mid(to), zoomed, width, height);
  return panView(zoomed, wx - vx, wy - vy);
}

export function defaultView() {
  return { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
}

function widenedSpan(min, max) {
  const pad = Math.max(1, Math.max(Math.abs(min), Math.abs(max)) * 1e-6);
  return [min - pad, max + pad];
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
  if (!hasUsableSpan(minX, maxX)) [minX, maxX] = widenedSpan(minX, maxX);
  if (!hasUsableSpan(minY, maxY)) [minY, maxY] = widenedSpan(minY, maxY);
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
  return pts.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function odeSlope(ast, x, y, opts) {
  const env = { ...bindIndependentVariable(x, opts?.indep), y, Y: y };
  if (opts?.depend) env[opts.depend] = y;
  return evalNumeric(ast, env, opts || {});
}

// A slope field: at each point of a grid across the view a dash of slope f(x, y), the same length on screen whatever
// the slope.
const SLOPE_CELL_PIXELS = 24;

export function sampleSlopeField(ast, view, width, height, opts) {
  const cols = Math.max(2, Math.round(width / SLOPE_CELL_PIXELS));
  const rows = Math.max(2, Math.round(height / SLOPE_CELL_PIXELS));
  const xPx = width / (view.xmax - view.xmin), yPx = height / (view.ymax - view.ymin);
  const half = SLOPE_CELL_PIXELS * 0.35;
  const dashes = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = view.xmin + (i + 0.5) * (view.xmax - view.xmin) / cols;
      const y = view.ymin + (j + 0.5) * (view.ymax - view.ymin) / rows;
      const slope = odeSlope(ast, x, y, opts);
      if (!Number.isFinite(slope)) continue;
      const len = Math.hypot(xPx, slope * yPx);
      const dx = half / len, dy = slope * half / len;
      dashes.push([[x - dx, y - dy], [x + dx, y + dy]]);
    }
  }
  return dashes;
}

// CONIC takes f(x, y) = 0, an equation's two sides subtracted, as a quadratic in y at each x: its second-order Taylor
// form about y = 0, as on the HP. The two roots make two branches, joined where the discriminant reaches zero so an
// ellipse closes.
const CONIC_EDGE_STEPS = 40;

export function sampleConic(ast, xmin, xmax, count, ySpan, opts) {
  const f = ast.kind === 'bin' && ast.op === '=' ? Bin('-', ast.l, ast.r) : ast;
  const h = 1e-3 * Math.max(1, ySpan);
  const roots = (x) => {
    const f0 = odeSlope(f, x, 0, opts), up = odeSlope(f, x, h, opts), down = odeSlope(f, x, -h, opts);
    const a = (up - 2 * f0 + down) / (2 * h * h), b = (up - down) / (2 * h), c = f0;
    if (![a, b, c].every(Number.isFinite)) return null;
    if (Math.abs(a) <= 1e-6 * (Math.abs(b) + Math.abs(c) + 1)) return b === 0 ? null : [-c / b, -c / b];
    const d = b * b - 4 * a * c;
    if (d < 0) return null;
    const r = Math.sqrt(d);
    return [(-b - r) / (2 * a), (-b + r) / (2 * a)];
  };
  // Where the roots appear or vanish between two samples, bisection finds the x where they meet.
  const edge = (inside, outside) => {
    for (let i = 0; i < CONIC_EDGE_STEPS; i++) {
      const mid = (inside + outside) / 2;
      if (roots(mid)) inside = mid; else outside = mid;
    }
    return [inside, roots(inside)];
  };
  const pieces = [];
  let low = [], high = [], last = null;
  const close = () => {
    if (low.length) pieces.push(low, high);
    low = [];
    high = [];
  };
  for (let i = 0; i < count; i++) {
    const x = xmin + (xmax - xmin) * i / (count - 1);
    const ys = roots(x);
    if (ys && !low.length && last !== null) {
      const [ex, [y0, y1]] = edge(x, last);
      low.push([ex, y0]);
      high.push([ex, y1]);
    }
    if (ys) {
      low.push([x, ys[0]]);
      high.push([x, ys[1]]);
    } else if (low.length) {
      const [ex, [y0, y1]] = edge(xmin + (xmax - xmin) * (i - 1) / (count - 1), x);
      low.push([ex, y0]);
      high.push([ex, y1]);
      close();
    }
    last = x;
  }
  close();
  return pieces.map((piece) => segmentPoints(piece, ySpan * 8)).flat();
}

// TRUTH shades the cells of a grid where f(x, y) is non-zero, each run of cells along a row as one rectangle from its
// lower left to its upper right corner. Cells grow past 3 pixels to keep to about the HP's 131 x 80 evaluations.
const TRUTH_CELL_PIXELS = 3;
const TRUTH_MAX_CELLS = 10000;

const clipRange = (lo, hi, range) => [Math.max(lo, range?.[0] ?? lo), Math.min(hi, range?.[1] ?? hi)];

export function sampleTruth(ast, view, width, height, opts) {
  const [xmin, xmax] = clipRange(view.xmin, view.xmax, opts?.xRange);
  const [ymin, ymax] = clipRange(view.ymin, view.ymax, opts?.yRange);
  if (!(xmax > xmin && ymax > ymin)) return [];
  const cell = Math.max(TRUTH_CELL_PIXELS, Math.sqrt(width * height / TRUTH_MAX_CELLS));
  const cols = Math.ceil(width * (xmax - xmin) / (view.xmax - view.xmin) / cell);
  const rows = Math.ceil(height * (ymax - ymin) / (view.ymax - view.ymin) / cell);
  const xAt = (i) => xmin + (xmax - xmin) * i / cols, yAt = (j) => ymin + (ymax - ymin) * j / rows;
  const isTrue = (i, j) => {
    const v = odeSlope(ast, xAt(i + 0.5), yAt(j + 0.5), opts);
    return Number.isFinite(v) && v !== 0;
  };
  const cells = [];
  for (let j = 0; j < rows; j++) {
    let start = -1;
    for (let i = 0; i <= cols; i++) {
      const on = i < cols && isTrue(i, j);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        cells.push([[xAt(start), yAt(j)], [xAt(i), yAt(j + 1)]]);
        start = -1;
      }
    }
  }
  return cells;
}

// PCONTOUR draws ten level curves of f(x, y) between its lowest and highest values in the view, by marching squares
// over a grid of about 8-pixel cells; a saddle cell takes its centre's side.
const CONTOUR_CELL_PIXELS = 8;
const CONTOUR_LEVELS = 10;

export function sampleContour(ast, view, width, height, opts) {
  const cols = Math.max(2, Math.round(width / CONTOUR_CELL_PIXELS));
  const rows = Math.max(2, Math.round(height / CONTOUR_CELL_PIXELS));
  const xAt = (i) => view.xmin + (view.xmax - view.xmin) * i / cols;
  const yAt = (j) => view.ymin + (view.ymax - view.ymin) * j / rows;
  const values = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => odeSlope(ast, xAt(i), yAt(j), opts)));
  const finite = values.flat().filter(Number.isFinite);
  if (!finite.length) return [];
  const lo = Math.min(...finite), hi = Math.max(...finite);
  if (!(hi > lo)) return [];
  const segments = [];
  for (let k = 1; k <= CONTOUR_LEVELS; k++) {
    const level = lo + (hi - lo) * k / (CONTOUR_LEVELS + 1);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) segments.push(...contourCell(values, i, j, level, xAt, yAt));
    }
  }
  return segments;
}

function contourCell(values, i, j, level, xAt, yAt) {
  const v = [values[j][i], values[j][i + 1], values[j + 1][i + 1], values[j + 1][i]];
  const below = v.filter((x) => x < level).length;
  if (below === 0 || below === 4 || !v.every(Number.isFinite)) return [];
  const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([c, r], k) => ({ c, r, v: v[k] - level }));
  const crossings = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e], b = corners[(e + 1) % 4];
    if ((a.v < 0) === (b.v < 0)) continue;
    const t = a.v / (a.v - b.v);
    crossings.push([xAt(a.c + (b.c - a.c) * t), yAt(a.r + (b.r - a.r) * t)]);
  }
  if (crossings.length === 2) return [crossings];
  if (crossings.length !== 4) return [];
  const centre = corners.reduce((sum, p) => sum + p.v, 0) / 4;
  return (centre < 0) === (corners[0].v < 0)
    ? [[crossings[0], crossings[3]], [crossings[1], crossings[2]]]
    : [[crossings[0], crossings[1]], [crossings[2], crossings[3]]];
}

function rk4Step(ast, x, y, h, opts) {
  const k1 = odeSlope(ast, x, y, opts);
  const k2 = odeSlope(ast, x + h / 2, y + (h * k1) / 2, opts);
  const k3 = odeSlope(ast, x + h / 2, y + (h * k2) / 2, opts);
  const k4 = odeSlope(ast, x + h, y + h * k3, opts);
  if (![k1, k2, k3, k4].every(Number.isFinite)) return null;
  const next = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  return Number.isFinite(next) ? next : null;
}

function ivpAnchor(xMin, xMax) {
  return xMin <= 0 && xMax >= 0 ? 0 : xMin;
}

function ivpSteps(n) {
  return Math.max(8, n | 0);
}

function integrateOde(ast, x0, y0, x1, count, opts) {
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1)) return [];
  if (x0 === x1) return [[x0, y0]];
  const steps = Math.max(1, count | 0);
  const h = (x1 - x0) / steps;
  const pts = [[x0, y0]];
  let x = x0;
  let y = y0;
  for (let i = 0; i < steps; i++) {
    const next = rk4Step(ast, x, y, h, opts);
    if (next == null) break;
    x += h;
    y = next;
    pts.push([x, y]);
  }
  return pts;
}

function yOnSampledIvp(pts, x, tol) {
  let prev = null;
  for (const p of pts) {
    if (prev && (prev[0] - x) * (p[0] - x) <= 0) {
      const span = p[0] - prev[0];
      if (span === 0) return p[1];
      const t = (x - prev[0]) / span;
      return prev[1] + t * (p[1] - prev[1]);
    }
    prev = p;
  }
  if (!pts.length) return NaN;
  const ends = [pts[0], pts[pts.length - 1]];
  for (const p of ends) {
    if (Math.abs(p[0] - x) <= tol) return p[1];
  }
  return NaN;
}

export function sampleDiffEq(ast, y0, xMin, xMax, n, opts = {}) {
  const yStart = Number(y0);
  if (!Number.isFinite(yStart) || !Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin === xMax) {
    return [];
  }
  const steps = ivpSteps(n);
  const x0 = ivpAnchor(xMin, xMax);
  const forward = integrateOde(ast, x0, yStart, xMax, steps, opts);
  const backward = integrateOde(ast, x0, yStart, xMin, steps, opts);
  const pts = backward.slice(0, -1).reverse().concat(forward);
  return segmentPoints(pts, Infinity);
}

function plotConstant(src) {
  try {
    const y = evalNumeric(parsePlotExpr(src), {}, {});
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

function diffeqInitialY(t) {
  return plotConstant(String(t?.exprY ?? '').trim() || '0');
}

function functionLabel(t) {
  return t.expr || '';
}

function parametricLabel(t) {
  return `(${t.expr}, ${t.exprY})`;
}

function diffeqLabel(t) {
  return `y'=${t.expr}`;
}

function diffeqSteps(ctx) {
  return Math.max(48, ctx?.width | 0);
}

function diffeqOpts(ctx) {
  return { ...(ctx.angleOpts || {}), indep: ctx.indep?.name, depend: ctx.depend?.name };
}

// With INDEP's two numbers in PPAR, DIFFEQ runs from the first to the second, as on the HP.
function diffeqFromIndep(t, y0, ctx) {
  const [x0, x1] = ctx.indep.values;
  return integrateOde(parsePlotExpr(t.expr), x0, y0, x1, diffeqSteps(ctx), diffeqOpts(ctx));
}

function plotFieldError(fields, values, adding) {
  for (const field of fields) {
    const raw = String(values?.[field.key] ?? '').trim();
    const required = adding && !field.optional && field.key === 'exprY';
    if (!raw && !required) continue;
    try {
      parsePlotExpr(raw);
    } catch (e) {
      return e.message;
    }
    if (raw && field.constant && !Number.isFinite(plotConstant(raw))) {
      return 'initial value is not a number';
    }
  }
  return null;
}

function diffeqFromStack(v, below) {
  const expr = valueToEquationDraft(v);
  if (!expr) return null;
  const exprY = valueToEquationDraft(below) || '0';
  return {
    kind: 'diffeq',
    expr,
    exprY,
    label: diffeqLabel({ expr, exprY }),
    points: null,
  };
}

function diffeqToStack(t) {
  if (!t?.expr) return [];
  const y = diffeqInitialY(t);
  if (!Number.isFinite(y)) throw new Error('initial value is not a number');
  return [Real(y), equationToSymbolic(t.expr)];
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
  if (!t?.expr) return [];
  return [equationToSymbolic(t.expr)];
}

function parametricFromStack(v, below) {
  if (!isSymbolic(v)) return expressionFromStack('parametric', v);
  const y = valueToEquationDraft(v);
  if (!y) return null;
  const xExpr = isSymbolic(below) ? (valueToEquationDraft(below) || 'T') : 'T';
  return {
    kind: 'parametric',
    expr: xExpr,
    exprY: y,
    label: parametricLabel({ expr: xExpr, exprY: y }),
    points: null,
  };
}

function pointsFromStack(kind, v) {
  const points = valueToPoints(v);
  if (!points || !points.length) return null;
  return { kind, points, label: kind, expr: '', exprY: '', source: v };
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
  return { kind: 'hist', points, label: 'histogram', expr: '', exprY: '', source: v };
}

function traceContext(view, opts = {}) {
  const v = view || defaultView();
  const raw = Number(opts.width);
  const width = Math.max(240, Number.isFinite(raw) && raw > 0 ? raw : 240);
  return {
    view: v,
    width,
    height: Number(opts.height) > 0 ? Number(opts.height) : null,
    angleOpts: opts.angleOpts || {},
    thetaRange: opts.thetaRange || { min: 0, max: 2 * Math.PI },
    tRange: opts.tRange || { min: -10, max: 10 },
    fitModel: opts.fitModel || null,
    env: opts.env || {},
    snapX: opts.snapX,
    indep: opts.indep || null,
    depend: opts.depend || null,
    res: opts.res || null,
  };
}

const MAX_SAMPLES_PER_PIXEL = 4;
const MAX_STEPS = 20000;

const inIndepRange = (ctx, x) => !ctx.indep?.range || (x >= ctx.indep.range[0] && x <= ctx.indep.range[1]);

// FUNCTION plots across the window, or only over INDEP's range; RES sets the interval between values, in user units
// or in pixels, counted from where RES says.
function functionSampling(ctx) {
  const { view, width, res } = ctx;
  const range = ctx.indep?.range;
  const from = Math.max(view.xmin, range?.[0] ?? -Infinity);
  const to = Math.min(view.xmax, range?.[1] ?? Infinity);
  if (!(to > from)) return null;
  const pixel = (view.xmax - view.xmin) / width;
  const step = res?.step ?? (res?.pixels ?? 0) * pixel;
  if (!(step > 0)) return { from, to, count: Math.max(2, ((to - from) / pixel + 1e-9) | 0) };
  const anchor = res.from ?? from;
  const first = anchor + Math.floor((from - anchor) / step) * step;
  let last = first + Math.ceil((to - first) / step) * step;
  if (range && last > range[1] + step * 1e-9) last -= step;
  const count = Math.round((last - first) / step) + 1;
  return { from: first, to: last, count: Math.min(count, Math.ceil((to - from) / pixel) * MAX_SAMPLES_PER_PIXEL) };
}

// POLAR and PARAMETRIC step through their range by RES in user units; a RES in pixels means nothing to them.
function stepSampling(range, res, fallback) {
  const step = res?.step;
  if (!(step > 0)) return { ...range, count: fallback };
  const count = Math.floor((range.max - range.min) / step + 1e-9) + 1;
  if (count > MAX_STEPS) return { ...range, count: MAX_STEPS };
  return { min: range.min, max: range.min + (count - 1) * step, count: Math.max(2, count) };
}

function kindSpec(t) {
  if (!t) return null;
  return TRACE_KINDS[t.kind] || (!t.kind ? TRACE_KINDS.function : null);
}

export const TRACE_KINDS = Object.freeze({
  function: {
    render: 'stroke',
    data: false,
    editable: true,
    fitOnAdd: false,
    fields: [{ key: 'expr', placeholder: 'SIN(X)', aria: 'Expression' }],
    label: functionLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      const view = ctx.view;
      const xs = functionSampling(ctx);
      if (!xs) return [];
      return sampleFunction(
        parsePlotExpr(t.expr), xs.from, xs.to, xs.count, ctx.env,
        { ...ctx.angleOpts, ySpan: view.ymax - view.ymin, indep: ctx.indep?.name },
      );
    },
    evalAt(t, x, ctx) {
      if (!t.expr || !inIndepRange(ctx, x)) return NaN;
      return evalNumeric(parsePlotExpr(t.expr), bindIndependentVariable(x, ctx.indep?.name), ctx.angleOpts || {});
    },
    fromStack(v) { return expressionFromStack('function', v); },
    toStack: expressionToStack,
  },
  polar: {
    render: 'stroke',
    data: true,
    equalAxes: true,
    editable: true,
    fitOnAdd: true,
    fields: [{ key: 'expr', placeholder: '1 + COS(θ)', aria: 'Expression' }],
    label: functionLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      const th = stepSampling(ctx.thetaRange, ctx.res, 720);
      return samplePolar(
        parsePlotExpr(t.expr), th.min, th.max, th.count,
        ctx.env, { ...ctx.angleOpts, indep: ctx.indep?.name },
      );
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('polar', v); },
    toStack: expressionToStack,
  },
  parametric: {
    render: 'stroke',
    data: true,
    equalAxes: true,
    editable: true,
    fitOnAdd: true,
    fieldSep: ',',
    fields: [
      { key: 'expr', placeholder: 'COS(T)', aria: 'X expression' },
      { key: 'exprY', placeholder: 'SIN(T)', aria: 'Y expression' },
    ],
    label: parametricLabel,
    sample(t, ctx) {
      if (!t.expr || !t.exprY) return [];
      const tr = stepSampling(ctx.tRange, ctx.res, 480);
      return sampleParametric(
        parsePlotExpr(t.expr), parsePlotExpr(t.exprY),
        tr.min, tr.max, tr.count, ctx.env, { ...ctx.angleOpts, indep: ctx.indep?.name },
      );
    },
    evalAt() { return NaN; },
    fromStack: parametricFromStack,
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
  diffeq: {
    render: 'stroke',
    data: false,
    editable: true,
    fitOnAdd: true,
    fields: [
      { key: 'expr', placeholder: 'X+Y', aria: 'dy/dx' },
      { key: 'exprY', placeholder: '0', aria: 'Initial y', optional: true, blank: '0', constant: true },
    ],
    label: diffeqLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      const y0 = diffeqInitialY(t);
      if (!Number.isFinite(y0)) return [];
      if (ctx.indep?.values) return segmentPoints(diffeqFromIndep(t, y0, ctx), Infinity);
      const view = ctx.view;
      return sampleDiffEq(
        parsePlotExpr(t.expr), y0,
        view.xmin, view.xmax, diffeqSteps(ctx),
        diffeqOpts(ctx),
      );
    },
    evalAt(t, x, ctx) {
      if (!t.expr || !Number.isFinite(x)) return NaN;
      const view = ctx.view;
      if (!view || !Number.isFinite(view.xmin) || !Number.isFinite(view.xmax) || view.xmin === view.xmax) {
        return NaN;
      }
      const y0 = diffeqInitialY(t);
      if (!Number.isFinite(y0)) return NaN;
      const steps = diffeqSteps(ctx);
      const span = ctx.indep?.values;
      if (span) {
        if (x === span[0]) return y0;
        return yOnSampledIvp(diffeqFromIndep(t, y0, ctx), x, Math.abs(span[1] - span[0]) / steps);
      }
      if (x === ivpAnchor(view.xmin, view.xmax)) return y0;
      const pts = sampleDiffEq(
        parsePlotExpr(t.expr), y0,
        view.xmin, view.xmax, steps,
        diffeqOpts(ctx),
      ).flat();
      return yOnSampledIvp(pts, x, Math.abs(view.xmax - view.xmin) / ivpSteps(steps));
    },
    fromStack: diffeqFromStack,
    toStack: diffeqToStack,
  },
  slopefield: {
    render: 'stroke',
    data: false,
    editable: true,
    fitOnAdd: false,
    fields: [{ key: 'expr', placeholder: 'X-Y', aria: 'dy/dx' }],
    label: diffeqLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      return sampleSlopeField(parsePlotExpr(t.expr), ctx.view, ctx.width, ctx.height ?? ctx.width * 0.6, diffeqOpts(ctx));
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('slopefield', v); },
    toStack: expressionToStack,
  },
  conic: {
    render: 'stroke',
    data: false,
    editable: true,
    fitOnAdd: false,
    fields: [{ key: 'expr', placeholder: 'X^2/4+Y^2=1', aria: 'Equation in X and Y' }],
    label: functionLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      const xs = functionSampling(ctx);
      if (!xs) return [];
      return sampleConic(parsePlotExpr(t.expr), xs.from, xs.to, xs.count, ctx.view.ymax - ctx.view.ymin, diffeqOpts(ctx));
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('conic', v); },
    toStack: expressionToStack,
  },
  contour: {
    render: 'stroke',
    grid: true,
    data: false,
    editable: true,
    fitOnAdd: false,
    fields: [{ key: 'expr', placeholder: 'X^2+Y^2', aria: 'f(x, y)' }],
    label: functionLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      return sampleContour(parsePlotExpr(t.expr), ctx.view, ctx.width, ctx.height ?? ctx.width * 0.6, diffeqOpts(ctx));
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('contour', v); },
    toStack: expressionToStack,
  },
  truth: {
    render: 'cells',
    grid: true,
    data: false,
    editable: true,
    fitOnAdd: false,
    fields: [{ key: 'expr', placeholder: 'X^2+Y^2<4', aria: 'Condition in X and Y' }],
    label: functionLabel,
    sample(t, ctx) {
      if (!t.expr) return [];
      return sampleTruth(parsePlotExpr(t.expr), ctx.view, ctx.width, ctx.height ?? ctx.width * 0.6,
        { ...diffeqOpts(ctx), xRange: ctx.indep?.range, yRange: ctx.depend?.range });
    },
    evalAt() { return NaN; },
    fromStack(v) { return expressionFromStack('truth', v); },
    toStack: expressionToStack,
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
      return evalNumeric(parsePlotExpr(t.expr), bindIndependentVariable(x), ctx.angleOpts || {});
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

const EQUAL_AXES_MAX_STRETCH = 4;

function withEqualAxes(view, width, height) {
  if (!(width > 0 && height > 0)) return view;
  const xUnitsPerPixel = (view.xmax - view.xmin) / width;
  const yUnitsPerPixel = (view.ymax - view.ymin) / height;
  const unitsPerPixel = Math.max(xUnitsPerPixel, yUnitsPerPixel);
  if (unitsPerPixel > EQUAL_AXES_MAX_STRETCH * Math.min(xUnitsPerPixel, yUnitsPerPixel)) return view;
  const cx = (view.xmin + view.xmax) / 2;
  const cy = (view.ymin + view.ymax) / 2;
  const halfX = unitsPerPixel * width / 2;
  const halfY = unitsPerPixel * height / 2;
  return { xmin: cx - halfX, xmax: cx + halfX, ymin: cy - halfY, ymax: cy + halfY };
}

// The plot tools sit over the top right corner, where the data's last or highest point lands, so a fitted view
// leaves them room at the right or at the top, whichever costs less. A function's x range is the user's to keep,
// so only data widens it, and a function gives up no more than a quarter of the height.
function clearOfTools(view, { width, height, tools }, dataX) {
  if (!(width > 0 && height > 0 && tools?.width > 0 && tools?.height > 0)) return view;
  const right = tools.width / width, top = tools.height / height;
  if (dataX && right <= top && right < 0.5) return { ...view, xmax: view.xmax + (view.xmax - view.xmin) * right / (1 - right) };
  if (top < (dataX ? 0.5 : 0.25)) return { ...view, ymax: view.ymax + (view.ymax - view.ymin) * top / (1 - top) };
  return view;
}

export function fitViewToTraces(traces, view, opts = {}) {
  const v = view || defaultView();
  const shown = (traces || []).filter((t) => t && t.enabled !== false);
  const functions = shown.filter((t) => !isDataTrace(t));
  const xy = shown.filter(isDataTrace).flatMap((t) => sampleTraceForFit(t, v, opts));
  if (!xy.length) {
    const ys = functions.flatMap((t) => sampleTraceForFit(t, v, opts));
    if (!ys.length) return { xmin: v.xmin, xmax: v.xmax, ymin: v.ymin, ymax: v.ymax };
    const b = boundsOfPoints(ys);
    return clearOfTools({ xmin: v.xmin, xmax: v.xmax, ymin: b.ymin, ymax: b.ymax }, opts, false);
  }
  const data = boundsOfPoints(xy);
  const across = { ...v, xmin: data.xmin, xmax: data.xmax };
  const ys = functions.flatMap((t) => sampleTraceForFit(t, across, opts));
  const all = ys.length ? boundsOfPoints([...xy, ...ys]) : data;
  const fitted = { xmin: data.xmin, xmax: data.xmax, ymin: all.ymin, ymax: all.ymax };
  const hasCurve = shown.some((t) => kindSpec(t)?.equalAxes);
  const hasPointData = shown.some((t) => isDataTrace(t) && !kindSpec(t)?.equalAxes);
  return hasCurve && !hasPointData ? withEqualAxes(fitted, opts.width, opts.height) : clearOfTools(fitted, opts, true);
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

export function traceInputError(kind, values, { adding = false } = {}) {
  const spec = TRACE_KINDS[kind];
  if (!spec?.fields?.length) return null;
  return plotFieldError(spec.fields, values, adding);
}

export function traceFromInputs(kind, expr, exprY) {
  const spec = TRACE_KINDS[kind];
  const yField = spec?.fields?.find(f => f.key === 'exprY');
  const typedY = String(exprY ?? '').trim();
  const blankY = yField?.optional ? yField.blank ?? '' : '';
  const storedY = yField ? typedY || blankY : '';
  const storedX = String(expr ?? '').trim();
  const t = { expr: storedX, exprY: storedY };
  return {
    kind,
    expr: storedX,
    exprY: storedY,
    label: spec?.label ? spec.label(t) : storedX,
    points: null,
  };
}

export function retypeTrace(t, kind) {
  const from = kindSpec(t);
  const to = TRACE_KINDS[kind];
  if (!from || !to || t.kind === kind) return null;
  if (from.fields && to.fields) {
    const single = t.kind === 'parametric' ? t.exprY : t.expr;
    if (!single) return null;
    return kind === 'parametric' ? traceFromInputs(kind, 'T', single) : traceFromInputs(kind, single, '');
  }
  if (!from.fields && !to.fields && t.source && to.fromStack) return to.fromStack(t.source);
  return null;
}

export function stackValueToTrace(v, preferredKind = 'function', below = null) {
  if (isMatrix(v) || isVector(v) || isList(v)) {
    const kind = (preferredKind === 'bar' || preferredKind === 'hist')
      ? preferredKind : 'scatter';
    return TRACE_KINDS[kind].fromStack(v);
  }
  const preferred = TRACE_KINDS[preferredKind];
  const spec = preferred?.fields ? preferred : TRACE_KINDS.function;
  return spec.fromStack(v, below);
}

export function traceToStackValues(t) {
  if (!t) return [];
  const kind = TRACE_KINDS[t.kind];
  if (!kind) return [];
  return kind.toStack(t);
}
