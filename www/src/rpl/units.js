/* Unit catalog and unit-expression algebra.  A uexpr is a canonical
   frozen list of [symbol, exponent] pairs, sorted by symbol with zero
   exponents dropped, so equality is a pairwise scan.  Each catalog entry
   has a scale to SI base units and a dims vector over BASE_SYMBOLS.
   Units are purely multiplicative: affine temperatures (°C, °F) would
   need an offset as well. */

const BASE_SYMBOLS = Object.freeze(['m', 'kg', 's', 'A', 'K', 'mol', 'cd']);
const BASE_DIMS_LEN = BASE_SYMBOLS.length;

const D_L   = Object.freeze([1, 0, 0, 0, 0, 0, 0]);
const D_M   = Object.freeze([0, 1, 0, 0, 0, 0, 0]);
const D_T   = Object.freeze([0, 0, 1, 0, 0, 0, 0]);
const D_I   = Object.freeze([0, 0, 0, 1, 0, 0, 0]);
const D_TH  = Object.freeze([0, 0, 0, 0, 1, 0, 0]);
const D_N   = Object.freeze([0, 0, 0, 0, 0, 1, 0]);
const D_J   = Object.freeze([0, 0, 0, 0, 0, 0, 1]);
const D_L3  = Object.freeze([3, 0, 0, 0, 0, 0, 0]);   // volume
const D_iT  = Object.freeze([0, 0, -1, 0, 0, 0, 0]);  // frequency (Hz)
const D_F   = Object.freeze([1, 1, -2, 0, 0, 0, 0]);  // force (N)
const D_E   = Object.freeze([2, 1, -2, 0, 0, 0, 0]);  // energy (J)
const D_P   = Object.freeze([2, 1, -3, 0, 0, 0, 0]);  // power (W)
const D_Pa  = Object.freeze([-1, 1, -2, 0, 0, 0, 0]); // pressure
const D_V   = Object.freeze([2, 1, -3, -1, 0, 0, 0]); // voltage
const D_Ohm = Object.freeze([2, 1, -3, -2, 0, 0, 0]); // resistance
const D_Q   = Object.freeze([0, 0, 1, 1, 0, 0, 0]);   // charge (C)

export const UNIT_CATALOG = new Map([
  // ---- SI base units ----
  ['m',   { scale: 1,                 dims: D_L }],
  ['kg',  { scale: 1,                 dims: D_M }],
  ['s',   { scale: 1,                 dims: D_T }],
  ['A',   { scale: 1,                 dims: D_I }],
  ['K',   { scale: 1,                 dims: D_TH }],
  ['mol', { scale: 1,                 dims: D_N }],
  ['cd',  { scale: 1,                 dims: D_J }],

  // ---- Length ----
  ['cm',  { scale: 0.01,              dims: D_L }],
  ['mm',  { scale: 0.001,             dims: D_L }],
  ['km',  { scale: 1000,              dims: D_L }],
  ['in',  { scale: 0.0254,            dims: D_L }],
  ['ft',  { scale: 0.3048,            dims: D_L }],
  ['yd',  { scale: 0.9144,            dims: D_L }],
  ['mi',  { scale: 1609.344,          dims: D_L }],

  // ---- Mass ----
  ['g',   { scale: 0.001,             dims: D_M }],
  ['mg',  { scale: 1e-6,              dims: D_M }],
  ['lb',  { scale: 0.45359237,        dims: D_M }],
  ['oz',  { scale: 0.028349523125,    dims: D_M }],

  // ---- Time ----
  ['ms',  { scale: 1e-3,              dims: D_T }],
  ['us',  { scale: 1e-6,              dims: D_T }],
  ['ns',  { scale: 1e-9,              dims: D_T }],
  ['min', { scale: 60,                dims: D_T }],
  ['h',   { scale: 3600,              dims: D_T }],
  ['d',   { scale: 86400,             dims: D_T }],
  ['yr',  { scale: 31557600,          dims: D_T }],    // Julian year

  // ---- Volume ----
  ['L',   { scale: 1e-3,              dims: D_L3 }],
  ['mL',  { scale: 1e-6,              dims: D_L3 }],

  // ---- Derived SI ----
  ['Hz',  { scale: 1,                 dims: D_iT }],
  ['N',   { scale: 1,                 dims: D_F }],
  ['J',   { scale: 1,                 dims: D_E }],
  ['W',   { scale: 1,                 dims: D_P }],
  ['Pa',  { scale: 1,                 dims: D_Pa }],
  ['kPa', { scale: 1000,              dims: D_Pa }],
  ['bar', { scale: 1e5,               dims: D_Pa }],
  ['atm', { scale: 101325,            dims: D_Pa }],
  ['V',   { scale: 1,                 dims: D_V }],
  ['Ω',   { scale: 1,                 dims: D_Ohm }],
  ['ohm', { scale: 1,                 dims: D_Ohm }],  // ASCII alias
  ['C',   { scale: 1,                 dims: D_Q }],    // coulomb
]);

export function normalizeUexpr(factors) {
  const merged = new Map();
  for (const [sym, exp] of factors) {
    if (!UNIT_CATALOG.has(sym)) throw new Error(`Unknown unit: ${sym}`);
    merged.set(sym, (merged.get(sym) ?? 0) + exp);
  }
  const out = [...merged.entries()]
    .filter(([, e]) => e !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, e]) => Object.freeze([s, e]));
  return Object.freeze(out);
}

export function multiplyUexpr(a, b) { return normalizeUexpr([...a, ...b]); }
export function inverseUexpr(a)      { return normalizeUexpr(a.map(([s, e]) => [s, -e])); }
export function divideUexpr(a, b)    { return multiplyUexpr(a, inverseUexpr(b)); }
export function powerUexpr(a, n)     { return normalizeUexpr(a.map(([s, e]) => [s, e * n])); }

export function uexprEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

function dimsOf(uexpr) {
  const d = new Array(BASE_DIMS_LEN).fill(0);
  for (const [sym, exp] of uexpr) {
    const c = UNIT_CATALOG.get(sym);
    for (let i = 0; i < BASE_DIMS_LEN; i++) d[i] += c.dims[i] * exp;
  }
  return d;
}

export function scaleOf(uexpr) {
  let s = 1;
  for (const [sym, exp] of uexpr) {
    const c = UNIT_CATALOG.get(sym);
    s *= Math.pow(c.scale, exp);
  }
  return s;
}

export function sameDims(a, b) {
  const da = dimsOf(a), db = dimsOf(b);
  for (let i = 0; i < BASE_DIMS_LEN; i++) if (da[i] !== db[i]) return false;
  return true;
}

// 1_km → { scale: 1000, uexpr: [['m', 1]] }; the caller multiplies the value by scale.
export function toBaseUexpr(uexpr) {
  const dims = dimsOf(uexpr);
  const base = BASE_SYMBOLS.map((sym, i) => [sym, dims[i]]);
  return { scale: scaleOf(uexpr), uexpr: normalizeUexpr(base) };
}

/* uexpr  := factor ( ('*' | '/') factor )*
   factor := SYMBOL ( '^' ('-'|'+')? DIGITS )? | '(' uexpr ')' | '1'
   '/' inverts only the next factor, reading left to right as the HP50
   does, so m/s*s is m.  formatUnitExpr parenthesizes a denominator with
   several factors so its output parses back unchanged. */

export function parseUnitExpr(src) {
  const n = src.length;
  let i = 0;

  function readFactor() {
    if (src[i] === '(') {
      i++;
      const sub = readExpr(')');
      if (src[i] === ')') i++;
      else throw new Error(`Unclosed '(' in unit expression: ${src}`);
      return sub;
    }
    if (src[i] === '1' && !/^\d/.test(src.slice(i + 1))) { i++; return normalizeUexpr([]); }
    const m = src.slice(i).match(/^[A-Za-zΩμ°]+/);
    if (!m) throw new Error(`Bad unit expression near '${src[i]}': ${src}`);
    const sym = m[0];
    i += sym.length;
    let exp = 1;
    if (src[i] === '^') {
      i++;
      const em = src.slice(i).match(/^[-+]?\d+/);
      if (!em) throw new Error(`Bad exponent in unit expression: ${src}`);
      exp = parseInt(em[0], 10);
      i += em[0].length;
    }
    return normalizeUexpr([[sym, exp]]);
  }

  function readExpr(stopChar) {
    let result = normalizeUexpr([]);
    let invertNext = false;
    while (i < n && src[i] !== stopChar) {
      const c = src[i];
      if (c === '*') { invertNext = false; i++; continue; }
      if (c === '/') { invertNext = true;  i++; continue; }
      const factor = readFactor();
      result = multiplyUexpr(result, invertNext ? inverseUexpr(factor) : factor);
      invertNext = false;
    }
    return result;
  }

  return readExpr(undefined);
}

export function formatUnitExpr(uexpr) {
  if (uexpr.length === 0) return '';
  const pos = uexpr.filter(([, e]) => e > 0);
  const neg = uexpr.filter(([, e]) => e < 0);
  const fmt = ([s, e]) => Math.abs(e) === 1 ? s : `${s}^${Math.abs(e)}`;
  const ps = pos.map(fmt).join('*');
  const ns = neg.map(fmt).join('*');
  if (neg.length === 0) return ps;
  if (pos.length === 0) return neg.length === 1 ? '1/' + ns : `1/(${ns})`;
  return ps + '/' + (neg.length === 1 ? ns : `(${ns})`);
}
