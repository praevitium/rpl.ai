import { RPLError } from '../stack.js';
import { inScratchState, varRecall, varStore } from '../state.js';
import { Complex, Real, Name, RList, Str, BinaryInteger, isComplex, isReal, isInteger, isBinaryInteger, isName, isList, isString, toRealOrThrow } from '../types.js';
import { register } from './registry.js';
import { statPlotData } from './statistics.js';


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

register('BARPLOT',   (s) => _requestPlot('bar', s, statPlotData('bar')), { category: 'Graphics', categoryOrder: 0, label: "BARPLOT" });

register('HISTPLOT',  (s) => _requestPlot('hist', s, statPlotData('hist')), { category: 'Graphics', categoryOrder: 1, label: "HISTPLOT" });

register('FUNCTION',  (s) => _requestPlot('function', s), { category: 'Graphics', categoryOrder: 3, label: "FUNCTION" });

register('POLAR',     (s) => _requestPlot('polar', s), { category: 'Graphics', categoryOrder: 4, label: "POLAR" });

register('PARAMETRIC',(s) => _requestPlot('parametric', s), { category: 'Graphics', categoryOrder: 5, label: "PARAMETRIC" });

register('DIFFEQ',    (s) => _requestPlot('diffeq', s), { category: 'Graphics', categoryOrder: 7, label: "DIFFEQ" });

register('DRAW',      (s) => _requestPlot('draw', s), { category: 'Graphics', categoryOrder: 6, label: "DRAW" });


// PPAR holds { (xmin,ymin) (xmax,ymax) indep res axes ptype depend }, the HP 50g's defaults until a command sets it.
const PPAR_DEFAULT = () => [Complex(-6.5, -3.9), Complex(6.5, 4), Name('X'), Real(0), Complex(0, 0), Name('FUNCTION'), Name('Y')];
// The 50g's PICT is 131 x 80 pixels; CENTR and the scale commands keep column 65 and row 40 on the plot's centre.
const PICT_COLS = 130, PICT_ROWS = 79, CENTER_COL = 65, CENTER_ROW = 40, TICK_PIXELS = 10;

export function plotParameters() {
  const par = varRecall('PPAR');
  const items = isList(par) ? par.items : [];
  return PPAR_DEFAULT().map((v, i) => items[i] ?? v);
}

const _number = (v) => (isReal(v) || isInteger(v) ? toRealOrThrow(v) : NaN);

function _indepSetting(v) {
  const [name, a, b] = isList(v) ? v.items : [v];
  const range = [_number(a), _number(b)].sort((p, q) => p - q);
  return { name: isName(name) ? name.id : 'X', range: range[1] > range[0] ? range : null };
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
export function plotSettings() {
  if (!isList(varRecall('PPAR'))) return null;
  const [lo, hi, indep, res, axes] = plotParameters();
  const view = isComplex(lo) && isComplex(hi) && hi.re > lo.re && hi.im > lo.im
    ? { xmin: lo.re, xmax: hi.re, ymin: lo.im, ymax: hi.im }
    : null;
  const variable = _indepSetting(indep);
  return {
    view,
    indep: variable,
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

// The user-unit point under the centre pixel, and the size of one pixel.
function _grid() {
  const c = _corners();
  const dx = (c.xmax - c.xmin) / PICT_COLS, dy = (c.ymax - c.ymin) / PICT_ROWS;
  return { cx: c.xmin + CENTER_COL * dx, cy: c.ymax - CENTER_ROW * dy, dx, dy };
}

function _setGrid({ cx, cy, dx, dy }) {
  _setCorners({
    xmin: cx - CENTER_COL * dx, xmax: cx + (PICT_COLS - CENTER_COL) * dx,
    ymin: cy - (PICT_ROWS - CENTER_ROW) * dy, ymax: cy + CENTER_ROW * dy,
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
