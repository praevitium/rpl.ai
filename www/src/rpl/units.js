/* Units: dimensional catalog + unit-expression algebra.

   An HP50 Unit value pairs a number with a unit expression:
       9.8_m/s^2        value = 9.8,  uexpr = [[m,1],[s,-2]]
       1_kg*m/s^2       value = 1,    uexpr = [[kg,1],[m,1],[s,-2]]
       273.15_K         value = 273.15, uexpr = [[K,1]]

   The unit expression is a canonical, frozen array of [symbol, exponent]
   tuples, sorted alphabetically by symbol, with zero-exponent factors
   dropped.  This canonicalisation lets us test equality with a cheap
   pairwise scan and keeps formatting deterministic.

   Every symbol in the catalog has:
     scale — the multiplier to its SI-base equivalent (km → 1000, ft → 0.3048).
     dims  — a length-7 vector of base-dimension exponents:
             [length, mass, time, current, temperature, amount, luminous].
   `dimsOf(uexpr)` sums the per-factor dims; `scaleOf(uexpr)` multiplies
   the per-factor scales.  `sameDims` is the basis for dimensional
   compatibility checks used by `+`/`-` and CONVERT.

   First-pass scope: purely multiplicative units.  Affine temperature
   (°C/°F) is out — that needs offset+scale per unit, not just scale. */

// Base dimension order, fixed for the lifetime of the program.
// When adding a new fundamental dimension (e.g. information/bit) the
// catalog entries must all grow the same column.
const BASE_DIMS_LEN = 7;
const ZERO_DIMS = Object.freeze([0, 0, 0, 0, 0, 0, 0]);

// Shorthand for dim vectors so catalog entries stay one-line.
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
  // ---- SI base units (canonical: scale 1) ----
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

export function isKnownUnit(sym) { return UNIT_CATALOG.has(sym); }

/** Canonical uexpr: sort, merge, drop zero-exponent factors.  Throws on
 *  unknown symbols. */
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

/** Sum dimension-vectors across the factors. */
export function dimsOf(uexpr) {
  const d = new Array(BASE_DIMS_LEN).fill(0);
  for (const [sym, exp] of uexpr) {
    const c = UNIT_CATALOG.get(sym);
    for (let i = 0; i < BASE_DIMS_LEN; i++) d[i] += c.dims[i] * exp;
  }
  return d;
}

/** Multiplier from this uexpr to SI-base units. */
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

/** Reduce a uexpr to its SI base symbols.  Returns the base uexpr AND
 *  the numerical factor needed to preserve the value — the caller
 *  multiplies value by it:  ubase(1_km) → { scale: 1000, uexpr: [[m,1]] }. */
export function toBaseUexpr(uexpr) {
  const dims = dimsOf(uexpr);
  const scale = scaleOf(uexpr);
  const BASE_ORDER = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd'];
  const base = BASE_ORDER
    .map((sym, i) => [sym, dims[i]])
    .filter(([, e]) => e !== 0);
  return { scale, uexpr: normalizeUexpr(base) };
}

/* parser

   Grammar (right of the underscore):
     uexpr  := factor ( ('*' | '/') factor )*
     factor := SYMBOL ( '^' ('-'|'+')? DIGITS )?
             | '(' uexpr ')'

   Convention: '/' inverts only the IMMEDIATELY following factor
   (HP50 / left-to-right reading).  `m/s*s` therefore parses as
   (m/s)*s → m, not m/(s*s).  Parens group the enclosed sub-expression
   so '/(a*b)' inverts both a and b — this is what the formatter emits
   when a denominator has more than one factor, so a unit expression
   always round-trips through parse/format. */

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
    // Accept Latin letters plus common unit glyphs (Ω, μ, °).  The
    // catalog controls which symbols are legal; the regex is just the
    // lexer's "here's a symbol-looking token" rule.
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
    if (!UNIT_CATALOG.has(sym)) throw new Error(`Unknown unit: ${sym}`);
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

/* formatter

   Display style mirrors how the user typed it: positive factors first,
   joined by '*', then '/' + negative factors with positive exponents.
   Multiple negative factors get parens so the output round-trips through
   parseUnitExpr without sign drift. */

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

export { ZERO_DIMS, BASE_DIMS_LEN };
