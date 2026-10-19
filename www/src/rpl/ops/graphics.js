import { RPLError } from '../stack.js';
import { inScratchState, varRecall, varStore, getPict, setPict, getBinaryBase, toRadians } from '../state.js';
import { Complex, Real, Name, RList, Str, BinaryInteger, Grob, isComplex, isReal, isInteger, isBinaryInteger, isName, isList, isString, isGrob, toRealOrThrow } from '../types.js';
import { register } from './registry.js';
import { statPlotData } from './statistics.js';
import { TRUE, FALSE } from './internal.js';


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
export function plotSettings() {
  if (!isList(varRecall('PPAR'))) return null;
  const [lo, hi, indep, res, axes, , depend] = plotParameters();
  const view = isComplex(lo) && isComplex(hi) && hi.re > lo.re && hi.im > lo.im
    ? { xmin: lo.re, xmax: hi.re, ymin: lo.im, ymax: hi.im }
    : null;
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
  return (g.bytes[row * Math.ceil(g.width / 8) + (col >> 3)] >> (col & 7)) & 1;
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

function _lineCommand(how) {
  return (s) => {
    const [a, b] = s.popN(2).map(_pixelOf);
    _paint((plot) => _line(a, b, (c, r) => plot(c, r, how)));
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

