import { RPLError } from '../stack.js';
import { inScratchState, varRecall, varStore, getPict, setPict, getBinaryBase, toRadians, getLcd, setLcdGrob } from '../state.js';
import { Complex, Real, Name, RList, Str, BinaryInteger, Grob, Symbolic, isComplex, isReal, isInteger, isBinaryInteger, isName, isList, isString, isGrob, isSymbolic, isUnit, isMatrix, isVector, toRealOrThrow } from '../types.js';
import { register, lookup } from './registry.js';
import { statPlotData } from './statistics.js';
import { TRUE, FALSE, withLocalVariable } from './internal.js';
import { format, currentDisplay, withFractionMark } from '../formatter.js';
import { textGrob, CELL_WIDTH, CELL_HEIGHT } from '../pixel-font.js';


let _graphicsHook = null;

export function setGraphicsHook(fn) {
  _graphicsHook = typeof fn === 'function' ? fn : null;
}

function _requestPlot(kind, s, data = null) {
  if (inScratchState()) return;
  if (!_graphicsHook) {
    throw new RPLError('No graphics view');
  }
  _graphicsHook(kind, s, data);
}


register('SCATRPLOT', (s) => _requestPlot('scatter', s, statPlotData('scatter')), { category: 'Graphics', categoryOrder: 2, label: "SCATRPLOT" });

// BAR, HISTOGRAM and SCATTER draw ΣDAT at once, as FUNCTION and the other plot types do here.
register('SCATTER',   (s) => _requestPlot('scatter', s, statPlotData('scatter')), { category: 'Graphics', categoryOrder: 2.5, label: "SCATTER" });

register('BARPLOT',   (s) => _requestPlot('bar', s, statPlotData('bar')), { category: 'Graphics', categoryOrder: 0, label: "BARPLOT" });

register('BAR',       (s) => _requestPlot('bar', s, statPlotData('bar')), { category: 'Graphics', categoryOrder: 0.5, label: "BAR" });

register('HISTPLOT',  (s) => _requestPlot('hist', s, statPlotData('hist')), { category: 'Graphics', categoryOrder: 1, label: "HISTPLOT" });

register('HISTOGRAM', (s) => _requestPlot('hist', s, statPlotData('hist')), { category: 'Graphics', categoryOrder: 1.5, label: "HISTOGRAM" });

register('FUNCTION',  (s) => _requestPlot('function', s), { category: 'Graphics', categoryOrder: 3, label: "FUNCTION" });

register('POLAR',     (s) => _requestPlot('polar', s), { category: 'Graphics', categoryOrder: 4, label: "POLAR" });

// PLOT stores level 1 in EQ and plots it, PLOTADD adds it to EQ's list and to the plot, each as PPAR's plot type says.
const PTYPE_KINDS = Object.freeze({ FUNCTION: 'function', POLAR: 'polar', PARAMETRIC: 'parametric', DIFFEQ: 'diffeq', SLOPEFIELD: 'slopefield', CONIC: 'conic', TRUTH: 'truth', PCONTOUR: 'contour', WIREFRAME: 'wireframe', YSLICE: 'yslice', FAST3D: 'fast3d', GRIDMAP: 'gridmap' });

function _plotKind() {
  const ptype = plotParameters()[5];
  return PTYPE_KINDS[isName(ptype) ? ptype.id : ''] ?? 'function';
}

const _plottable = (v) => {
  if (!isSymbolic(v) && !isName(v)) throw new RPLError('Bad argument type');
  return v;
};

register('PLOT', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  varStore('EQ', _plottable(s.peek()));
  _requestPlot(_plotKind(), s);
}, { category: 'Graphics', categoryOrder: 3.1, label: "PLOT" });

register('PLOTADD', (s) => {
  const f = _plottable(s.pop());
  const eq = varRecall('EQ');
  varStore('EQ', eq === undefined ? f : RList([...(isList(eq) ? eq.items : [eq]), f]));
  s.push(f);
  try {
    _requestPlot(_plotKind(), s);
  } finally {
    s.pop();
  }
}, { category: 'Graphics', categoryOrder: 3.2, label: "PLOTADD" });

register('PARAMETRIC',(s) => _requestPlot('parametric', s), { category: 'Graphics', categoryOrder: 5, label: "PARAMETRIC" });

register('DIFFEQ',    (s) => _requestPlot('diffeq', s), { category: 'Graphics', categoryOrder: 7, label: "DIFFEQ" });

register('SLOPEFIELD', (s) => _requestPlot('slopefield', s), { category: 'Graphics', categoryOrder: 7.5, label: "SLOPEFIELD" });

register('CONIC', (s) => _requestPlot('conic', s), { category: 'Graphics', categoryOrder: 7.6, label: "CONIC" });

register('TRUTH', (s) => _requestPlot('truth', s), { category: 'Graphics', categoryOrder: 7.7, label: "TRUTH" });

register('PCONTOUR', (s) => _requestPlot('contour', s), { category: 'Graphics', categoryOrder: 7.8, label: "PCONTOUR" });

register('WIREFRAME', (s) => _requestPlot('wireframe', s), { category: 'Graphics', categoryOrder: 7.9, label: 'WIREFRAME' });

register('YSLICE', (s) => _requestPlot('yslice', s), { category: 'Graphics', categoryOrder: 7.91, label: 'YSLICE' });

register('FAST3D', (s) => _requestPlot('fast3d', s), { category: 'Graphics', categoryOrder: 7.915, label: 'FAST3D' });

register('GRIDMAP', (s) => _requestPlot('gridmap', s), { category: 'Graphics', categoryOrder: 7.93, label: 'GRIDMAP' });

// DRAW3DMATRIX takes the matrix and vmin vmax from the stack, as the AUR has it, and draws its values in 3D.
register('DRAW3DMATRIX', (s) => {
  const [m, lo, hi] = s.popN(3);
  if (!isMatrix(m) || !m.rows.every((row) => row.every((v) => isReal(v) || isInteger(v)))) throw new RPLError('Bad argument type');
  const rows = m.rows.map((row) => row.map(toRealOrThrow));
  _requestPlot('matrix3d', s, { rows, low: _real(lo), high: _real(hi), source: m });
}, { category: 'Graphics', categoryOrder: 7.94, label: 'DRAW3DMATRIX' });

// PARSURFACE plots the list or vector of x, y and z of two variables on level 1.
register('PARSURFACE', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const v = s.peek();
  if (!(isList(v) || isVector(v)) || v.items.length !== 3) throw new RPLError('Bad argument type');
  _requestPlot('parsurface', s, v);
}, { category: 'Graphics', categoryOrder: 7.92, label: 'PARSURFACE' });

register('DRAW',      (s) => _requestPlot('draw', s), { category: 'Graphics', categoryOrder: 6, label: "DRAW" });


// PPAR holds { (xmin,ymin) (xmax,ymax) indep res axes ptype depend }, the HP 50g's defaults until a command sets it.
const PPAR_DEFAULT = () => [Complex(-6.5, -3.9), Complex(6.5, 4), Name('X'), Real(0), Complex(0, 0), Name('FUNCTION'), Name('Y')];
// PICT is at least the 50g's 131 × 80 and at most 2048 wide; a tick mark comes every 10 pixels.
const PICT_MIN_WIDTH = 131, PICT_MIN_HEIGHT = 80, PICT_MAX_WIDTH = 2048, TICK_PIXELS = 10;
const GROB_MAX_PIXELS = 1 << 23;

export function plotParameters() {
  const par = varRecall('PPAR');
  const items = isList(par) ? par.items : [];
  return PPAR_DEFAULT().map((v, i) => items[i] ?? v);
}

const _number = (v) => (isReal(v) || isInteger(v) ? toRealOrThrow(v) : NaN);

// INDEP's or DEPND's name and two numbers, as given and as a range low to high.
function _variableSetting(v, fallback) {
  const [name, a, b] = isList(v) ? v.items : [v];
  const values = [_number(a), _number(b)];
  const range = [...values].sort((p, q) => p - q);
  return {
    name: isName(name) ? name.id : fallback,
    values: values.every(Number.isFinite) ? values : null,
    range: range[1] > range[0] ? range : null,
  };
}

// RES counts from the start of the plotting range, or the window's left edge without one.
function _resSetting(v, from) {
  if (isBinaryInteger(v)) return v.value > 0n ? { pixels: Number(v.value), from } : null;
  const step = Math.abs(_number(v));
  return step > 0 ? { step, from } : null;
}

// A tick spacing in pixels is left to the plot view, whose pixels aren't the 50g's.
function _axesSetting(v) {
  const [origin, tick] = isList(v) ? v.items : [v];
  const ticks = isList(tick) ? tick.items.map(_number) : [_number(tick), _number(tick)];
  return {
    x: isComplex(origin) ? origin.re : 0,
    y: isComplex(origin) ? origin.im : 0,
    tick: ticks.length === 2 && ticks.every((t) => t > 0) ? ticks : null,
  };
}

// What a plot takes from PPAR, as plain numbers; null until something stores PPAR.
// The window PICT spans: PPAR's corners, the 50g's defaults until PPAR exists.
export function pictWindow() {
  const [lo, hi] = plotParameters();
  return isComplex(lo) && isComplex(hi) && hi.re > lo.re && hi.im > lo.im
    ? { xmin: lo.re, xmax: hi.re, ymin: lo.im, ymax: hi.im }
    : null;
}

export function plotSettings() {
  if (!isList(varRecall('PPAR'))) return null;
  const [, , indep, res, axes, , depend] = plotParameters();
  const view = pictWindow();
  const variable = _variableSetting(indep, 'X');
  return {
    view,
    indep: variable,
    depend: _variableSetting(depend, 'Y'),
    res: _resSetting(res, variable.range?.[0] ?? view?.xmin ?? 0),
    axes: _axesSetting(axes),
  };
}

function _setPpar(changes) {
  const items = plotParameters();
  for (const [i, v] of Object.entries(changes)) items[i] = v;
  varStore('PPAR', RList(items));
}

function _corners() {
  const [lo, hi] = plotParameters();
  if (!isComplex(lo) || !isComplex(hi)) throw new RPLError('Invalid PPAR');
  return { xmin: lo.re, ymin: lo.im, xmax: hi.re, ymax: hi.im };
}

function _setCorners({ xmin, ymin, xmax, ymax }) {
  _setPpar({ 0: Complex(xmin, ymin), 1: Complex(xmax, ymax) });
}

const _real = (v) => {
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  return toRealOrThrow(v);
};

const _point = (v) => {
  if (isComplex(v)) return v;
  if (isReal(v) || isInteger(v)) return Complex(toRealOrThrow(v), 0);
  throw new RPLError('Bad argument type');
};

// PICT's last column and row, and its centre pixel: column 65 and row 40 on the 50g's 131 × 80.
function _pictPixels() {
  const { width, height } = getPict();
  const w = Math.max(width, PICT_MIN_WIDTH), h = Math.max(height, PICT_MIN_HEIGHT);
  return { cols: w - 1, rows: h - 1, centerCol: Math.floor(w / 2), centerRow: Math.floor(h / 2) };
}

// The user-unit point under the centre pixel, and the size of one pixel.
function _grid() {
  const c = _corners();
  const p = _pictPixels();
  const dx = (c.xmax - c.xmin) / p.cols, dy = (c.ymax - c.ymin) / p.rows;
  return { cx: c.xmin + p.centerCol * dx, cy: c.ymax - p.centerRow * dy, dx, dy };
}

function _setGrid({ cx, cy, dx, dy }) {
  const p = _pictPixels();
  _setCorners({
    xmin: cx - p.centerCol * dx, xmax: cx + (p.cols - p.centerCol) * dx,
    ymin: cy - (p.rows - p.centerRow) * dy, ymax: cy + p.centerRow * dy,
  });
}

register('PMIN', (s) => {
  const [v] = s.popN(1);
  if (!isComplex(v)) throw new RPLError('Bad argument type');
  _setPpar({ 0: v });
}, { category: 'Graphics', categoryOrder: 8, label: "PMIN" });

register('PMAX', (s) => {
  const [v] = s.popN(1);
  if (!isComplex(v)) throw new RPLError('Bad argument type');
  _setPpar({ 1: v });
}, { category: 'Graphics', categoryOrder: 8.1, label: "PMAX" });

register('XRNG', (s) => {
  const [lo, hi] = s.popN(2).map(_real);
  _setCorners({ ..._corners(), xmin: lo, xmax: hi });
}, { category: 'Graphics', categoryOrder: 8.2, label: "XRNG" });

register('YRNG', (s) => {
  const [lo, hi] = s.popN(2).map(_real);
  _setCorners({ ..._corners(), ymin: lo, ymax: hi });
}, { category: 'Graphics', categoryOrder: 8.3, label: "YRNG" });

register('RES', (s) => {
  const [v] = s.popN(1);
  if (!isReal(v) && !isInteger(v) && !isBinaryInteger(v)) throw new RPLError('Bad argument type');
  _setPpar({ 3: isInteger(v) ? Real(Number(v.value)) : v });
}, { category: 'Graphics', categoryOrder: 8.4, label: "RES" });

// PPAR's axes entry is the crossing point alone, or { point atick "x label" "y label" }; a tick every 10 pixels
// and no labels until something sets them.
function _setAxes(change) {
  const current = plotParameters()[4];
  const parts = isList(current) ? [...current.items] : [current];
  change(parts);
  for (let i = 1; i < parts.length; i++) parts[i] ??= i === 1 ? BinaryInteger(10n, 'd') : Str('');
  _setPpar({ 4: parts.length === 1 ? parts[0] : RList(parts) });
}

const _isTick = (v) => isReal(v) || isInteger(v) || isBinaryInteger(v) || isList(v);

// AXES takes the crossing point, or a list of any of it, the tick spacing and the two labels; a list changes only
// what it holds.
register('AXES', (s) => {
  const [v] = s.popN(1);
  if (!isComplex(v) && !isList(v)) throw new RPLError('Bad argument type');
  _setAxes((parts) => {
    if (isComplex(v)) {
      parts[0] = v;
      return;
    }
    v.items.filter(isString).forEach((label, i) => { parts[2 + i] = label; });
    for (const item of v.items) {
      if (isComplex(item)) parts[0] = item;
      else if (_isTick(item)) parts[1] = item;
    }
  });
}, { category: 'Graphics', categoryOrder: 8.5, label: "AXES" });

register('ATICK', (s) => {
  const [v] = s.popN(1);
  if (!_isTick(v)) throw new RPLError('Bad argument type');
  _setAxes((parts) => { parts[1] = v; });
}, { category: 'Graphics', categoryOrder: 8.55, label: "ATICK" });

register('CENTR', (s) => {
  const [v] = s.popN(1);
  const p = _point(v);
  _setGrid({ ..._grid(), cx: p.re, cy: p.im });
}, { category: 'Graphics', categoryOrder: 8.6, label: "CENTR" });

// SCALE sets the user units per tick mark, a tick every 10 pixels.
register('SCALE', (s) => {
  const [xs, ys] = s.popN(2).map(_real);
  if (xs <= 0 || ys <= 0) throw new RPLError('Bad argument value');
  _setGrid({ ..._grid(), dx: xs / TICK_PIXELS, dy: ys / TICK_PIXELS });
}, { category: 'Graphics', categoryOrder: 8.7, label: "SCALE" });

function _scaleBy(axis) {
  return (s) => {
    const [f] = s.popN(1).map(_real);
    if (f <= 0) throw new RPLError('Bad argument value');
    const g = _grid();
    _setGrid({ ...g, [axis]: g[axis] * f });
  };
}

register('SCALEW', _scaleBy('dx'), { category: 'Graphics', categoryOrder: 8.8, label: "SCALEW" });
register('SCALEH', _scaleBy('dy'), { category: 'Graphics', categoryOrder: 8.9, label: "SCALEH" });
// *W and *H are the HP 48's names for SCALEW and SCALEH.
register('*W', _scaleBy('dx'), { category: 'Graphics', categoryOrder: 8.91, label: "*W" });
register('*H', _scaleBy('dy'), { category: 'Graphics', categoryOrder: 8.92, label: "*H" });

// INDEP and DEPND take a name, { name }, { name start end }, { start end } or start end; LASTARG gets a list back
// for the last, as the AUR says.
function _variableSpec(index) {
  return (s) => {
    const twoNumbers = s.depth >= 2 && [s.peek(1), s.peek(2)].every((v) => isReal(v) || isInteger(v));
    let spec;
    if (twoNumbers) {
      const [a, b] = s.popN(2);
      spec = RList([a, b]);
      s.saveArgsAs([spec]);
    } else {
      [spec] = s.popN(1);
    }
    const current = plotParameters()[index];
    const name = isList(current) ? current.items[0] : current;
    const range = isList(current) ? current.items.slice(1) : [];
    if (isName(spec)) {
      _setPpar({ [index]: Name(spec.id) });
      return;
    }
    if (!isList(spec)) throw new RPLError('Bad argument type');
    const items = spec.items;
    const numeric = (v) => isReal(v) || isInteger(v);
    if (items.length === 1 && isName(items[0])) {
      _setPpar({ [index]: range.length ? RList([Name(items[0].id), ...range]) : Name(items[0].id) });
    } else if (items.length === 3 && isName(items[0]) && numeric(items[1]) && numeric(items[2])) {
      _setPpar({ [index]: RList([Name(items[0].id), items[1], items[2]]) });
    } else if (items.length === 2 && items.every(numeric)) {
      _setPpar({ [index]: RList([name, ...items]) });
    } else {
      throw new RPLError('Bad argument value');
    }
  };
}

register('INDEP', _variableSpec(2), { category: 'Graphics', categoryOrder: 9, label: "INDEP" });
register('DEPND', _variableSpec(6), { category: 'Graphics', categoryOrder: 9.1, label: "DEPND" });

// VPAR holds { xleft xright ynear yfar zlow zhigh xmin xmax ymin ymax xeye yeye zeye xstep ystep } for the 3D plots,
// the HP 48G plot form's defaults until a command sets it.
const VPAR_DEFAULT = () => [-1, 1, -1, 1, -1, 1, -1, 1, -1, 1, 0, -3, 0, 10, 8].map(Real);

export function viewParameters() {
  const par = varRecall('VPAR');
  const items = isList(par) ? par.items : [];
  return VPAR_DEFAULT().map((v, i) => items[i] ?? v);
}

// What the 3D plots take from VPAR, as plain numbers.
export function viewVolume() {
  const n = viewParameters().map(_number);
  return { x: [n[0], n[1]], y: [n[2], n[3]], z: [n[4], n[5]], input: { x: [n[6], n[7]], y: [n[8], n[9]] }, eye: [n[10], n[11], n[12]], steps: [n[13], n[14]] };
}

function _setVpar(at, values) {
  const items = viewParameters();
  values.forEach((v, i) => { items[at + i] = Real(v); });
  varStore('VPAR', RList(items));
}

// YVOL's ynear must be less than its yfar.
function _vparRange(at, ordered = false) {
  return (s) => {
    const [lo, hi] = s.popN(2).map(_real);
    if (ordered && !(lo < hi)) throw new RPLError('Bad argument value');
    _setVpar(at, [lo, hi]);
  };
}

function _vparSteps(at) {
  return (s) => {
    const [n] = s.popN(1).map(_real);
    if (!(n >= 2)) throw new RPLError('Bad argument value');
    _setVpar(at, [n]);
  };
}

register('XVOL', _vparRange(0), { category: 'Graphics', categoryOrder: 9.11, label: 'XVOL' });
register('YVOL', _vparRange(2, true), { category: 'Graphics', categoryOrder: 9.12, label: 'YVOL' });
register('ZVOL', _vparRange(4), { category: 'Graphics', categoryOrder: 9.13, label: 'ZVOL' });
register('XXRNG', _vparRange(6), { category: 'Graphics', categoryOrder: 9.14, label: 'XXRNG' });
register('YYRNG', _vparRange(8), { category: 'Graphics', categoryOrder: 9.15, label: 'YYRNG' });

register('EYEPT', (s) => {
  _setVpar(10, s.popN(3).map(_real));
}, { category: 'Graphics', categoryOrder: 9.16, label: 'EYEPT' });

register('NUMX', _vparSteps(13), { category: 'Graphics', categoryOrder: 9.17, label: 'NUMX' });
register('NUMY', _vparSteps(14), { category: 'Graphics', categoryOrder: 9.18, label: 'NUMY' });


const _extent = (values) => values.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);

// A range from lo to hi, one unit wider each way when they meet.
const _span = ([lo, hi]) => (hi > lo ? [lo, hi] : [lo - 1, hi + 1]);

// ΣDAT's XCOL values, and its YCOL values for a scatter plot, as numbers.
function _statColumns(kind) {
  const data = statPlotData(kind);
  const rows = isMatrix(data) ? data.rows : data.items.map((v) => [v]);
  if (!rows.length || rows[0].length < (kind === 'scatter' ? 2 : 1)) throw new RPLError('Invalid dimension');
  return rows[0].map((_, c) => rows.map((row) => toRealOrThrow(row[c])));
}

// SCLΣ fits PPAR's window to ΣDAT's XCOL and YCOL values.
function _scaleToData() {
  const [xs, ys] = _statColumns('scatter');
  const [xmin, xmax] = _span(_extent(xs));
  const [ymin, ymax] = _span(_extent(ys));
  _setCorners({ xmin, ymin, xmax, ymax });
}

register('SCLΣ', _scaleToData, { category: 'Graphics', categoryOrder: 9.2, label: "SCLΣ" });

const AUTO_SAMPLES = 40;

const _samples = (a, b) => Array.from({ length: AUTO_SAMPLES }, (_, i) => a + (b - a) * i / (AUTO_SAMPLES - 1));

// EQ's expressions: each item of a list, both sides of an equation.
function _equations() {
  const eq = varRecall('EQ');
  if (eq === undefined) throw new RPLError('Undefined Name');
  return (isList(eq) ? eq.items : [eq]).flatMap((v) => (
    isSymbolic(v) && v.expr.kind === 'bin' && v.expr.op === '=' ? [Symbolic(v.expr.l), Symbolic(v.expr.r)] : [v]
  ));
}

// Each expression's values at the points with the plot variable bound, as →NUM gives them; null where it has none.
function _eqValues(s, name, points) {
  return _equations().flatMap((expr) => withLocalVariable(name, (bind) => points.map((p) => {
    bind(Real(p));
    const depth = s.depth;
    let v = null;
    try {
      s.push(expr);
      lookup('→NUM').fn(s);
      if (s.depth === depth + 1) v = s.pop();
    } catch {
      v = null;
    }
    while (s.depth > depth) s.pop();
    return v;
  })));
}

const _numberOf = (v) => (v && (isReal(v) || isInteger(v)) ? toRealOrThrow(v) : NaN);


const AUTO_SCALES = {
  FUNCTION(s, c, indep) {
    const ys = _eqValues(s, indep.name, _samples(c.xmin, c.xmax)).map(_numberOf).filter(Number.isFinite);
    if (!ys.length) return;
    const [ymin, ymax] = _span(_extent([0, ...ys]));
    _setCorners({ ...c, ymin, ymax });
  },
  // Both ranges hold every point of the curve and the origin.
  POLAR(s, c, indep) {
    const [a, b] = indep.values ?? [0, 2 * Math.PI / toRadians(1)];
    const thetas = _samples(a, b);
    const points = _eqValues(s, indep.name, thetas).map((v, i) => {
      const r = _numberOf(v), t = toRadians(thetas[i % AUTO_SAMPLES]);
      return [r * Math.cos(t), r * Math.sin(t)];
    }).filter((p) => p.every(Number.isFinite));
    if (!points.length) return;
    const [xmin, xmax] = _span(_extent([0, ...points.map(([x]) => x)]));
    const [ymin, ymax] = _span(_extent([0, ...points.map(([, y]) => y)]));
    _setCorners({ xmin, ymin, xmax, ymax });
  },
  CONIC(s, c) {
    const { cols, rows } = _pictPixels();
    const half = (c.xmax - c.xmin) / cols * rows / 2, cy = (c.ymin + c.ymax) / 2;
    _setCorners({ ...c, ymin: cy - half, ymax: cy + half });
  },
  BAR(s, c) {
    const [xs] = _statColumns('bar');
    const [ymin, ymax] = _span(_extent([0, ...xs]));
    _setCorners({ xmin: 0, xmax: xs.length + 1, ymin, ymax });
  },
  HISTOGRAM() {
    const [xs] = _statColumns('hist');
    const [xmin, xmax] = _span(_extent(xs));
    _setCorners({ xmin, xmax, ymin: 0, ymax: xs.length });
  },
  SCATTER: _scaleToData,
};

// AUTO scales PPAR's window for the plot type PPAR names, FUNCTION to start. PARAMETRIC is left, as a parametric plot
// here takes x(t) and y(t) apart rather than EQ's x+i*y; TRUTH, DIFFEQ and the 3D types are left as on the HP.
register('AUTO', (s) => {
  const [, , indep, , , ptype] = plotParameters();
  AUTO_SCALES[isName(ptype) ? ptype.id : '']?.(s, _corners(), _variableSetting(indep, 'X'));
}, { category: 'Graphics', categoryOrder: 9.3, label: "AUTO" });


// PICT puts the name PICT on the stack; RCL, STO, PURGE and SIZE take it for the graphics object itself.
export const isPict = (v) => isName(v) && v.id === 'PICT';

function _blank(width, height) {
  if (width * height > GROB_MAX_PIXELS) throw new RPLError('Insufficient memory');
  return Grob(width, height);
}

// A size in pixels: a binary integer, or a whole real.
function _pixels(v) {
  const n = isBinaryInteger(v) ? Number(v.value) : _real(v);
  if (!Number.isInteger(n) || n < 0) throw new RPLError('Bad argument value');
  return n;
}

// Only a graphics object goes in PICT, put in the top left corner of a blank 131 × 80 when it is smaller.
export function storePict(v) {
  if (!isGrob(v)) throw new RPLError('Bad argument type');
  if (v.width > PICT_MAX_WIDTH) throw new RPLError('Bad argument value');
  if (v.width >= PICT_MIN_WIDTH && v.height >= PICT_MIN_HEIGHT) {
    setPict(v);
    return;
  }
  const g = _blank(Math.max(v.width, PICT_MIN_WIDTH), Math.max(v.height, PICT_MIN_HEIGHT));
  const from = Math.ceil(v.width / 8), to = Math.ceil(g.width / 8);
  for (let y = 0; y < v.height; y++) g.bytes.set(v.bytes.subarray(y * from, (y + 1) * from), y * to);
  setPict(g);
}

export const purgePict = () => setPict(Grob(0, 0));

export function grobSize(v) {
  const g = isPict(v) ? getPict() : v;
  return [g.width, g.height].map((n) => BinaryInteger(BigInt(n), getBinaryBase() || 'd'));
}

function _resizePict(width, height) {
  if (width > PICT_MAX_WIDTH) throw new RPLError('Bad argument value');
  setPict(_blank(Math.max(width, PICT_MIN_WIDTH), Math.max(height, PICT_MIN_HEIGHT)));
}

register('PICT', (s) => s.push(Name('PICT')), { category: 'Graphics', categoryOrder: 10, label: "PICT" });

// PDIM with corners keeps the plot's scale, so PICT grows or shrinks with them; with pixels PPAR stays.
register('PDIM', (s) => {
  const [a, b] = s.popN(2);
  if (isComplex(a) && isComplex(b)) {
    if (!(b.re > a.re) || !(b.im > a.im)) throw new RPLError('Bad argument value');
    const { dx, dy } = _grid();
    _resizePict(Math.round((b.re - a.re) / dx) + 1, Math.round((b.im - a.im) / dy) + 1);
    _setCorners({ xmin: a.re, ymin: a.im, xmax: b.re, ymax: b.im });
    return;
  }
  if (!isBinaryInteger(a) || !isBinaryInteger(b)) throw new RPLError('Bad argument type');
  _resizePict(Number(a.value), Number(b.value));
}, { category: 'Graphics', categoryOrder: 10.1, label: "PDIM" });

register('ERASE', () => {
  const { width, height } = getPict();
  setPict(Grob(width, height));
}, { category: 'Graphics', categoryOrder: 10.2, label: "ERASE" });

register('BLANK', (s) => {
  const [width, height] = s.popN(2).map(_pixels);
  s.push(_blank(width, height));
}, { category: 'Graphics', categoryOrder: 10.3, label: "BLANK" });


// PICT's pixel grid in user units: the point at column 0 and row 0, and the size of a pixel.
export function pictGrid() {
  const { xmin, ymax } = _corners();
  const { dx, dy } = _grid();
  return { xmin, ymax, dx, dy };
}

const _isPixelPoint = (v) => isList(v) && v.items.length === 2 && v.items.every(isBinaryInteger);

// A point as PICT's column and row: { #n #m } in pixels, or (x, y) in user units through PPAR.
function _pixelOf(v) {
  if (_isPixelPoint(v)) return v.items.map((b) => Number(b.value));
  if (!isComplex(v)) throw new RPLError('Bad argument type');
  const g = pictGrid();
  return [Math.round((v.re - g.xmin) / g.dx), Math.round((g.ymax - v.im) / g.dy)];
}

// A point in user units, a pixel standing for its centre.
export function pictPoint(v) {
  if (isComplex(v)) return { x: v.re, y: v.im };
  const [col, row] = _pixelOf(v);
  const g = pictGrid();
  return { x: g.xmin + col * g.dx, y: g.ymax - row * g.dy };
}

const _pixelList = (cells) => RList(cells.map((n) => BinaryInteger(BigInt(n), getBinaryBase() || 'd')));

// Draws on a copy of PICT and makes it PICT; pixels off its edges are dropped.
function _paint(draw) {
  const p = getPict();
  const g = Grob(p.width, p.height, p.bytes.slice());
  const rowBytes = Math.ceil(g.width / 8);
  draw((col, row, how) => {
    if (col < 0 || row < 0 || col >= g.width || row >= g.height) return;
    const i = row * rowBytes + (col >> 3), bit = 1 << (col & 7);
    if (how === 'off') g.bytes[i] &= ~bit;
    else if (how === 'toggle') g.bytes[i] ^= bit;
    else g.bytes[i] |= bit;
  });
  setPict(g);
}

function _pixelOn(g, col, row) {
  if (col < 0 || row < 0 || col >= g.width || row >= g.height) return false;
  return !!((g.bytes[row * Math.ceil(g.width / 8) + (col >> 3)] >> (col & 7)) & 1);
}

// A copy to change before anyone else sees it; the pixel is in range.
const _copyGrob = (g) => Grob(g.width, g.height, g.bytes.slice());

function _setPixel(g, col, row, on) {
  const i = row * Math.ceil(g.width / 8) + (col >> 3), bit = 1 << (col & 7);
  g.bytes[i] = on ? g.bytes[i] | bit : g.bytes[i] & ~bit;
}

// The part of a segment within a pixel of PICT, so a far-off point can't make a long loop.
function _clip([c0, r0], [c1, r1], width, height) {
  if ([c0, c1].every((c) => c >= -1 && c <= width) && [r0, r1].every((r) => r >= -1 && r <= height)) return [[c0, r0], [c1, r1]];
  let t0 = 0, t1 = 1;
  const dc = c1 - c0, dr = r1 - r0;
  for (const [p, q] of [[-dc, c0 + 1], [dc, width - c0], [-dr, r0 + 1], [dr, height - r0]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [[Math.round(c0 + t0 * dc), Math.round(r0 + t0 * dr)], [Math.round(c0 + t1 * dc), Math.round(r0 + t1 * dr)]];
}

// Bresenham's line, each pixel once.
function _line(from, to, plot) {
  const { width, height } = getPict();
  const ends = _clip(from, to, width, height);
  if (!ends) return;
  let [[c, r], [c1, r1]] = ends;
  const dc = Math.abs(c1 - c), dr = -Math.abs(r1 - r), sc = c < c1 ? 1 : -1, sr = r < r1 ? 1 : -1;
  let err = dc + dr;
  for (;;) {
    plot(c, r);
    if (c === c1 && r === r1) return;
    const e2 = 2 * err;
    if (e2 >= dr) { err += dr; c += sc; }
    if (e2 <= dc) { err += dc; r += sr; }
  }
}

function _pixelCommand(how) {
  return (s) => {
    const [v] = s.popN(1);
    const [col, row] = _pixelOf(v);
    _paint((plot) => plot(col, row, how));
  };
}

register('PIXON', _pixelCommand('on'), { category: 'Graphics', categoryOrder: 11, label: "PIXON" });
register('PIXOFF', _pixelCommand('off'), { category: 'Graphics', categoryOrder: 11.1, label: "PIXOFF" });

register('PIX?', (s) => {
  const [col, row] = _pixelOf(s.popN(1)[0]);
  s.push(_pixelOn(getPict(), col, row) ? TRUE : FALSE);
}, { category: 'Graphics', categoryOrder: 11.2, label: "PIX?" });

// A line on PICT between two points, its pixels turned on, off or flipped; PICTURE's DOT+ and DOT- draw with it too.
export function pictLine(from, to, how) {
  const [a, b] = [from, to].map(_pixelOf);
  _paint((plot) => _line(a, b, (c, r) => plot(c, r, how)));
}

function _lineCommand(how) {
  return (s) => {
    const [a, b] = s.popN(2);
    pictLine(a, b, how);
  };
}

register('LINE', _lineCommand('on'), { category: 'Graphics', categoryOrder: 11.3, label: "LINE" });
register('TLINE', _lineCommand('toggle'), { category: 'Graphics', categoryOrder: 11.4, label: "TLINE" });

register('BOX', (s) => {
  const [[c0, r0], [c1, r1]] = s.popN(2).map(_pixelOf);
  _paint((plot) => {
    const on = (c, r) => plot(c, r, 'on');
    _line([c0, r0], [c1, r0], on);
    _line([c1, r0], [c1, r1], on);
    _line([c1, r1], [c0, r1], on);
    _line([c0, r1], [c0, r0], on);
  });
}, { category: 'Graphics', categoryOrder: 11.5, label: "BOX" });

// ARC's radius is in pixels: #n as given, or a user-unit radius measured from the centre to where the arc starts.
register('ARC', (s) => {
  const [center, radius, a1, a2] = s.popN(4);
  const [t1, t2] = [a1, a2].map((a) => toRadians(_real(a)));
  const [cx, cy] = _pixelOf(center);
  let r;
  if (isComplex(center) && (isReal(radius) || isInteger(radius))) {
    const rr = _real(radius);
    const [sx, sy] = _pixelOf(Complex(center.re + rr * Math.cos(t1), center.im + rr * Math.sin(t1)));
    r = Math.hypot(sx - cx, sy - cy);
  } else if (_isPixelPoint(center) && isBinaryInteger(radius)) {
    r = Number(radius.value);
  } else {
    throw new RPLError('Bad argument type');
  }
  const sweep = Math.abs(t2 - t1) > 2 * Math.PI ? 2 * Math.PI * Math.sign(t2 - t1) : t2 - t1;
  const steps = Math.min(20000, Math.max(1, Math.ceil(Math.abs(sweep) * Math.max(r, 1))));
  const at = (k) => {
    const t = t1 + (sweep * k) / steps;
    return [Math.round(cx + r * Math.cos(t)), Math.round(cy - r * Math.sin(t))];
  };
  _paint((plot) => {
    const on = (c, row) => plot(c, row, 'on');
    let prev = at(0);
    on(...prev);
    if (sweep === 0) return;
    for (let k = 1; k <= steps; k++) {
      const next = at(k);
      _line(prev, next, on);
      prev = next;
    }
  });
}, { category: 'Graphics', categoryOrder: 11.6, label: "ARC" });

register('C→PX', (s) => {
  const [v] = s.popN(1);
  if (!isComplex(v)) throw new RPLError('Bad argument type');
  s.push(_pixelList(_pixelOf(v)));
}, { category: 'Graphics', categoryOrder: 11.7, label: "C→PX" });

register('PX→C', (s) => {
  const [v] = s.popN(1);
  if (!_isPixelPoint(v)) throw new RPLError('Bad argument type');
  const { x, y } = pictPoint(v);
  s.push(Complex(x, y));
}, { category: 'Graphics', categoryOrder: 11.8, label: "PX→C" });

// PVIEW shows PICT: { } in PPAR's window, or with a point at the view's top left.
register('PVIEW', (s) => {
  const [v] = s.popN(1);
  if (!(isList(v) && v.items.length === 0)) pictPoint(v);
  _requestPlot('pview', s, v);
}, { category: 'Graphics', categoryOrder: 11.9, label: "PVIEW" });

// PICTURE (GRAPH, the HP 28's name) shows PICT as { } PVIEW does, with the graphics cursor.
const _picture = (s) => _requestPlot('picture', s, RList([]));
register('PICTURE', _picture, { category: 'Graphics', categoryOrder: 11.91, label: "PICTURE" });
register('GRAPH', _picture, { category: 'Graphics', categoryOrder: 11.92, label: "GRAPH" });

// ANIMATE plays the graphics objects over PICT from the deepest level up, each replacing the pixels at #x #y, 0.1 s
// apart; rep 0, the default, plays until the plot view closes. The stack is left as it was.
const _frameOf = (v) => {
  const g = isName(v) ? varRecall(v.id) : v;
  if (!isGrob(g)) throw new RPLError('Bad argument type');
  return g;
};

register('ANIMATE', (s) => {
  const spec = s.peek();
  let count = spec, at = [0, 0], delay = 0.1, rep = 0;
  if (isList(spec)) {
    if (spec.items.length !== 4 || !_isPixelPoint(spec.items[1])) throw new RPLError('Bad argument type');
    count = spec.items[0];
    at = _pixelOf(spec.items[1]);
    delay = _real(spec.items[2]);
    rep = _real(spec.items[3]);
  }
  const n = _real(count);
  if (!Number.isInteger(n) || n < 1 || !(delay >= 0) || !Number.isInteger(rep) || rep < 0) throw new RPLError('Bad argument value');
  if (s.depth < n + 1) throw new RPLError('Too few arguments');
  const frames = Array.from({ length: n }, (_, i) => _frameOf(s.peek(n + 1 - i)));
  _requestPlot('animate', s, { frames, at, delay, rep });
}, { category: 'Graphics', categoryOrder: 11.95, label: "ANIMATE" });

// TEXT goes back from the plot to the stack; without a plot view there is nothing to leave.
register('TEXT', (s) => {
  if (!inScratchState()) _graphicsHook?.('text', s);
}, { category: 'Graphics', categoryOrder: 11.93, label: "TEXT" });


// The graphics object a command works on and how it hands back the result: PICT is changed where it is.
function _target(v, s) {
  if (isPict(v)) return { grob: getPict(), give: setPict };
  if (isGrob(v)) return { grob: v, give: (g) => s.push(g) };
  throw new RPLError('Bad argument type');
}

// grob laid over target with its top left at (col, row): OR, XOR or in place of what was there, cut at the edges.
function _overlay(target, [col, row], grob, how) {
  const out = _copyGrob(target);
  for (let r = Math.max(0, -row); r < grob.height && row + r < out.height; r++) {
    for (let c = Math.max(0, -col); c < grob.width && col + c < out.width; c++) {
      const on = _pixelOn(grob, c, r), was = _pixelOn(out, col + c, row + r);
      _setPixel(out, col + c, row + r, how === 'or' ? was || on : how === 'xor' ? was !== on : on);
    }
  }
  return out;
}

function _combine(how) {
  return (s) => {
    const [target, at, grob] = s.popN(3);
    if (!isGrob(grob)) throw new RPLError('Bad argument type');
    const t = _target(target, s);
    t.give(_overlay(t.grob, _pixelOf(at), grob, how));
  };
}

register('GOR', _combine('or'), { category: 'Graphics', categoryOrder: 12, label: "GOR" });
register('GXOR', _combine('xor'), { category: 'Graphics', categoryOrder: 12.1, label: "GXOR" });

// GROBADD sets the second graphics object under the first, both against the left edge.
register('GROBADD', (s) => {
  const [top, bottom] = s.popN(2);
  if (!isGrob(top) || !isGrob(bottom)) throw new RPLError('Bad argument type');
  const out = _blank(Math.max(top.width, bottom.width), top.height + bottom.height);
  s.push(_overlay(_overlay(out, [0, 0], top, 'replace'), [0, top.height], bottom, 'replace'));
}, { category: 'Graphics', categoryOrder: 12.15, label: "GROBADD" });

// REPL with a graphics object: the target is unchanged when the corner is off it.
export function replGrob(s, target, at, grob) {
  if (!isGrob(grob)) throw new RPLError('Bad argument type');
  const t = _target(target, s);
  const [col, row] = _pixelOf(at);
  const on = col >= 0 && row >= 0 && col < t.grob.width && row < t.grob.height;
  t.give(on ? _overlay(t.grob, [col, row], grob, 'replace') : t.grob);
}

// SUB with a graphics object: the rectangle between two corners, both included, each kept on the object.
export function subGrob(s, target, a, b) {
  const g = _target(target, s).grob;
  const [[c1, r1], [c2, r2]] = [a, b].map(_pixelOf).map(([c, r]) => [
    Math.min(Math.max(c, 0), g.width - 1), Math.min(Math.max(r, 0), g.height - 1),
  ]);
  if (!g.width || !g.height) {
    s.push(Grob(0, 0));
    return;
  }
  const left = Math.min(c1, c2), top = Math.min(r1, r2);
  const out = Grob(Math.abs(c2 - c1) + 1, Math.abs(r2 - r1) + 1);
  for (let r = 0; r < out.height; r++) {
    for (let c = 0; c < out.width; c++) if (_pixelOn(g, left + c, top + r)) _setPixel(out, c, r, true);
  }
  s.push(out);
}

// NEG of a graphics object turns every pixel over; the bits past its width stay clear.
export function negGrob(s, v) {
  const t = _target(v, s);
  const out = _copyGrob(t.grob);
  const rowBytes = Math.ceil(out.width / 8), lastMask = out.width % 8 ? 0xff >> (8 - (out.width % 8)) : 0xff;
  out.bytes.forEach((b, i) => { out.bytes[i] = ~b & ((i + 1) % rowBytes === 0 ? lastMask : 0xff); });
  t.give(out);
}

// DRAX draws the axes through AXES' crossing, with a tick mark three pixels long every ATICK: #n pixels (#10 to start)
// or user units, for both axes or as { x y }.
register('DRAX', () => {
  const axes = plotParameters()[4];
  const [origin, tick = BinaryInteger(10n, 'd')] = isList(axes) ? axes.items : [axes];
  const [col, row] = _pixelOf(isComplex(origin) ? origin : Complex(0, 0));
  const { dx, dy } = _grid();
  const [tx, ty] = isList(tick) ? tick.items : [tick, tick];
  const spacing = (t, unit) => (isBinaryInteger(t) ? Number(t.value) : Math.abs(_number(t)) / unit);
  const [sx, sy] = [spacing(tx, dx), spacing(ty, dy)];
  const { width, height } = getPict();
  _paint((plot) => {
    const on = (c, r) => plot(c, r, 'on');
    _line([0, row], [width - 1, row], on);
    _line([col, 0], [col, height - 1], on);
    for (let k = Math.ceil(-col / sx); sx >= 2 && col + k * sx < width; k++) {
      const c = Math.round(col + k * sx);
      on(c, row - 1);
      on(c, row + 1);
    }
    for (let k = Math.ceil(-row / sy); sy >= 2 && row + k * sy < height; k++) {
      const r = Math.round(row + k * sy);
      on(col - 1, r);
      on(col + 1, r);
    }
  });
}, { category: 'Graphics', categoryOrder: 12.2, label: "DRAX" });

// →GROB draws an object as the stack shows it, in rpl.ai's one pixel font whatever the size; size 0 leaves the quotes
// off an algebraic or unit, standing in for the Equation Writer's picture.
register('→GROB', (s) => {
  const [v, sizeArg] = s.popN(2);
  const size = _real(sizeArg);
  if (![0, 1, 2, 3].includes(size)) throw new RPLError('Bad argument value');
  const shown = isString(v) ? v.value : withFractionMark(format(v, undefined, { context: 'stack' }).replace(/`/g, "'"));
  s.push(textGrob(size === 0 && (isSymbolic(v) || isUnit(v)) ? shown.replace(/^'|'$/g, '') : shown));
}, { category: 'Graphics', categoryOrder: 12.3, label: "→GROB" });

// The 50g's display above its menu row, where →LCD and DISPXY draw; each replaces the pixels it covers.
const LCD_WIDTH = 131, LCD_HEIGHT = 72, LCD_COLUMNS = Math.floor(LCD_WIDTH / CELL_WIDTH);

function _drawOnLcd(at, grob) {
  const lcd = getLcd();
  setLcdGrob(_overlay(lcd?.grob ?? Grob(LCD_WIDTH, LCD_HEIGHT), at, grob, 'replace'), [...(lcd?.drawn ?? []), [...at, grob.width, grob.height]]);
}

register('→LCD', (s) => {
  const grob = s.pop();
  if (!isGrob(grob)) throw new RPLError('Bad argument type');
  _drawOnLcd([0, 0], grob);
}, { category: 'Graphics', categoryOrder: 12.35, label: "→LCD" });

function _levelText(level, v) {
  const label = `${level}:`;
  const room = LCD_COLUMNS - label.length - 1;
  const shown = withFractionMark(format(v, currentDisplay())).replace(/\s*\n\s*/g, ' ');
  const text = shown.length > room ? `${shown.slice(0, room - 1)}…` : shown;
  return label.padEnd(LCD_COLUMNS - text.length) + text;
}

// LCD→ pictures the display as the HP lays it out: the stack's levels up from the menu row, which is left blank, each
// value right-aligned and cut with an ellipsis; DISP's lines and what →LCD and DISPXY drew replace what they cover.
register('LCD→', (s) => {
  const lcd = getLcd();
  let screen = Grob(LCD_WIDTH, LCD_HEIGHT + CELL_HEIGHT);
  for (let level = 1; level <= Math.min(s.depth, LCD_HEIGHT / CELL_HEIGHT); level++) {
    screen = _overlay(screen, [0, LCD_HEIGHT - level * CELL_HEIGHT], textGrob(_levelText(level, s.peek(level))), 'replace');
  }
  (lcd?.lines ?? []).forEach((line, i) => {
    if (line) screen = _overlay(screen, [0, i * CELL_HEIGHT], textGrob(line.padEnd(LCD_COLUMNS + 1)), 'replace');
  });
  screen = _copyGrob(screen);
  for (const [x, y, w, h] of lcd?.drawn ?? []) {
    for (let r = Math.max(0, y); r < Math.min(y + h, LCD_HEIGHT); r++) {
      for (let c = Math.max(0, x); c < Math.min(x + w, LCD_WIDTH); c++) _setPixel(screen, c, r, _pixelOn(lcd.grob, c, r));
    }
  }
  s.push(screen);
}, { category: 'Graphics', categoryOrder: 12.36, label: "LCD→" });

// DISPXY writes as DISP does, from pixel #x #y; both its font sizes are rpl.ai's one pixel font.
register('DISPXY', (s) => {
  const [obj, at, size] = s.popN(3);
  if (!_isPixelPoint(at) || !(isReal(size) || isInteger(size))) throw new RPLError('Bad argument type');
  if (![1, 2].includes(_real(size))) throw new RPLError('Bad argument value');
  _drawOnLcd(_pixelOf(at), textGrob(isString(obj) ? obj.value : withFractionMark(format(obj, currentDisplay()))));
}, { category: 'Display / base', categoryOrder: 26.5, label: "DISPXY" });

// LABEL writes the axes' names by their ends, and the window's limits where the axes leave PICT: the x values under
// the horizontal axis, the y values beside the vertical one, each moved to the other side when it would fall off.
register('LABEL', () => {
  const [, , indep, , axes, , depend] = plotParameters();
  const { xmin, xmax, ymin, ymax } = _corners();
  const { width, height } = getPict();
  const [col, row] = _pixelOf(isList(axes) && isComplex(axes.items[0]) ? axes.items[0] : isComplex(axes) ? axes : Complex(0, 0))
    .map((n, i) => Math.min(Math.max(n, 0), (i ? height : width) - 1));
  const nameOf = (v) => (isList(v) ? v.items[0] : v)?.id ?? '';
  const [xName, yName] = isList(axes)
    ? [axes.items[2], axes.items[3]].map((l) => (isString(l) ? l.value : ''))
    : [nameOf(indep), nameOf(depend)];
  const num = (n) => withFractionMark(format(Real(n)));
  const below = row + 2 + CELL_HEIGHT <= height ? row + 2 : row - 1 - CELL_HEIGHT;
  const above = below > row ? row - 1 - CELL_HEIGHT : row + 2;
  const beside = (g) => (col + 3 + g.width <= width ? col + 3 : col - 2 - g.width);
  const labels = [];
  const put = (text, at) => {
    if (!text) return;
    const g = textGrob(text);
    labels.push([g, at(g)]);
  };
  put(num(xmin), () => [0, below]);
  put(num(xmax), (g) => [width - g.width, below]);
  put(xName, (g) => [width - g.width, above]);
  put(num(ymax), (g) => [beside(g), 0]);
  put(num(ymin), (g) => [beside(g), height - CELL_HEIGHT]);
  put(yName, (g) => (col - 2 - g.width >= 0 ? [col - 2 - g.width, 0] : [col + 3, CELL_HEIGHT + 1]));
  setPict(labels.reduce((pict, [g, at]) => _overlay(pict, at, g, 'or'), getPict()));
}, { category: 'Graphics', categoryOrder: 12.4, label: "LABEL" });

