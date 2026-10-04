/* Unit catalog and unit-expression algebra.  A uexpr is a canonical
   frozen list of [symbol, exponent] pairs, sorted by symbol with zero
   exponents dropped, so equality is a pairwise scan.  Each catalog entry
   has a scale to SI base units and a dims vector over BASE_SYMBOLS; an SI
   prefix may stand before a `prefixable` one (kJ, MHz, uA).  Units are
   multiplicative except a bare °C or °F, a thermometer reading whose zero
   is the entry's `offset` in kelvin; inside any other expression a
   temperature is a difference. */

const BASE_SYMBOLS = Object.freeze(['m', 'kg', 's', 'A', 'K', 'mol', 'cd', 'r']);
const BASE_DIMS_LEN = BASE_SYMBOLS.length;

const D_L   = Object.freeze([1, 0, 0, 0, 0, 0, 0, 0]);
const D_M   = Object.freeze([0, 1, 0, 0, 0, 0, 0, 0]);
const D_T   = Object.freeze([0, 0, 1, 0, 0, 0, 0, 0]);
const D_I   = Object.freeze([0, 0, 0, 1, 0, 0, 0, 0]);
const D_TH  = Object.freeze([0, 0, 0, 0, 1, 0, 0, 0]);
const D_N   = Object.freeze([0, 0, 0, 0, 0, 1, 0, 0]);
const D_J   = Object.freeze([0, 0, 0, 0, 0, 0, 1, 0]);
const D_L2  = Object.freeze([2, 0, 0, 0, 0, 0, 0, 0]);   // area
const D_L3  = Object.freeze([3, 0, 0, 0, 0, 0, 0, 0]);   // volume
const D_v   = Object.freeze([1, 0, -1, 0, 0, 0, 0, 0]);  // speed
const D_Gy  = Object.freeze([2, 0, -2, 0, 0, 0, 0, 0]);  // absorbed dose (Gy, Sv)
const D_lx  = Object.freeze([-2, 0, 0, 0, 0, 0, 1, 0]);  // illuminance
const D_Cap = Object.freeze([-2, -1, 4, 2, 0, 0, 0, 0]); // capacitance (F)
const D_Ind = Object.freeze([2, 1, -2, -2, 0, 0, 0, 0]); // inductance (H)
const D_Gs  = Object.freeze([-2, -1, 3, 2, 0, 0, 0, 0]); // conductance (S)
const D_B   = Object.freeze([0, 1, -2, -1, 0, 0, 0, 0]); // magnetic flux density (T)
const D_Wb  = Object.freeze([2, 1, -2, -1, 0, 0, 0, 0]); // magnetic flux (Wb)
const D_iT  = Object.freeze([0, 0, -1, 0, 0, 0, 0, 0]);  // frequency (Hz)
const D_F   = Object.freeze([1, 1, -2, 0, 0, 0, 0, 0]);  // force (N)
const D_E   = Object.freeze([2, 1, -2, 0, 0, 0, 0, 0]);  // energy (J)
const D_P   = Object.freeze([2, 1, -3, 0, 0, 0, 0, 0]);  // power (W)
const D_Pa  = Object.freeze([-1, 1, -2, 0, 0, 0, 0, 0]); // pressure
const D_V   = Object.freeze([2, 1, -3, -1, 0, 0, 0, 0]); // voltage
const D_Ohm = Object.freeze([2, 1, -3, -2, 0, 0, 0, 0]); // resistance
const D_Q   = Object.freeze([0, 0, 1, 1, 0, 0, 0, 0]);   // charge (C)
const D_Ang = Object.freeze([0, 0, 0, 0, 0, 0, 0, 1]);   // plane angle (r)
const D_Sr  = Object.freeze([0, 0, 0, 0, 0, 0, 0, 2]);   // solid angle (sr)

const FT = 0.3048;
const LB = 0.45359237;
const G0 = 9.80665;
const GAL = 3.785411784e-3;
const FTLBF = FT * LB * G0;

export const UNIT_CATALOG = new Map([
  // ---- SI base units ----
  ['m',   { scale: 1,                 dims: D_L,   prefixable: true }],
  ['kg',  { scale: 1,                 dims: D_M }],
  ['s',   { scale: 1,                 dims: D_T,   prefixable: true }],
  ['A',   { scale: 1,                 dims: D_I,   prefixable: true }],
  ['K',   { scale: 1,                 dims: D_TH,  prefixable: true }],
  ['°C',  { scale: 1,                 dims: D_TH,  offset: 273.15 }],
  ['°F',  { scale: 5 / 9,             dims: D_TH,  offset: 459.67 * 5 / 9 }],
  ['°R',  { scale: 5 / 9,             dims: D_TH }],
  ['degC', { scale: 1,                dims: D_TH,  offset: 273.15 }],
  ['degF', { scale: 5 / 9,            dims: D_TH,  offset: 459.67 * 5 / 9 }],
  ['degR', { scale: 5 / 9,            dims: D_TH }],
  ['mol', { scale: 1,                 dims: D_N,   prefixable: true }],
  ['cd',  { scale: 1,                 dims: D_J,   prefixable: true }],

  // ---- Length ----
  ['cm',  { scale: 0.01,              dims: D_L }],
  ['mm',  { scale: 0.001,             dims: D_L }],
  ['km',  { scale: 1000,              dims: D_L }],
  ['in',  { scale: 0.0254,            dims: D_L }],
  ['ft',  { scale: FT,                dims: D_L }],
  ['yd',  { scale: 0.9144,            dims: D_L }],
  ['mi',  { scale: 1609.344,          dims: D_L }],
  ['nmi', { scale: 1852,              dims: D_L }],
  ['mil', { scale: 2.54e-5,           dims: D_L }],
  ['au',  { scale: 149597870700,      dims: D_L }],
  ['ly',  { scale: 9460730472580800,  dims: D_L }],
  ['pc',  { scale: 3.0856775814913673e16, dims: D_L }],

  // ---- Area ----
  ['ha',  { scale: 1e4,               dims: D_L2 }],
  ['acre', { scale: 4046.8564224,     dims: D_L2 }],

  // ---- Mass ----
  ['g',   { scale: 0.001,             dims: D_M,   prefixable: true }],
  ['mg',  { scale: 1e-6,              dims: D_M }],
  ['lb',  { scale: LB,                dims: D_M }],
  ['oz',  { scale: 0.028349523125,    dims: D_M }],
  ['ton', { scale: 907.18474,         dims: D_M }],
  ['tonne', { scale: 1000,            dims: D_M }],
  ['ct',  { scale: 2e-4,              dims: D_M }],
  ['grain', { scale: 6.479891e-5,     dims: D_M }],
  ['ozt', { scale: 0.0311034768,      dims: D_M }],
  ['lbt', { scale: 0.3732417216,      dims: D_M }],
  ['slug', { scale: LB * G0 / FT,     dims: D_M }],

  // ---- Time ----
  ['ms',  { scale: 1e-3,              dims: D_T }],
  ['us',  { scale: 1e-6,              dims: D_T }],
  ['ns',  { scale: 1e-9,              dims: D_T }],
  ['min', { scale: 60,                dims: D_T }],
  ['h',   { scale: 3600,              dims: D_T }],
  ['d',   { scale: 86400,             dims: D_T }],
  ['yr',  { scale: 31557600,          dims: D_T }],    // Julian year

  // ---- Speed ----
  ['mph', { scale: 0.44704,           dims: D_v }],
  ['kph', { scale: 1000 / 3600,       dims: D_v }],
  ['knot', { scale: 1852 / 3600,      dims: D_v }],

  // ---- Volume ----
  ['L',   { scale: 1e-3,              dims: D_L3,  prefixable: true }],
  ['l',   { scale: 1e-3,              dims: D_L3,  prefixable: true }],
  ['mL',  { scale: 1e-6,              dims: D_L3 }],
  ['gal', { scale: GAL,               dims: D_L3 }],
  ['qt',  { scale: GAL / 4,           dims: D_L3 }],
  ['pt',  { scale: GAL / 8,           dims: D_L3 }],
  ['cup', { scale: GAL / 16,          dims: D_L3 }],
  ['ozfl', { scale: GAL / 128,        dims: D_L3 }],
  ['tbsp', { scale: GAL / 256,        dims: D_L3 }],
  ['tsp', { scale: GAL / 768,         dims: D_L3 }],
  ['galUK', { scale: 4.54609e-3,      dims: D_L3 }],
  ['bbl', { scale: 42 * GAL,          dims: D_L3 }],

  // ---- Force ----
  ['N',   { scale: 1,                 dims: D_F,   prefixable: true }],
  ['lbf', { scale: LB * G0,           dims: D_F }],
  ['kip', { scale: 1000 * LB * G0,    dims: D_F }],
  ['kgf', { scale: G0,                dims: D_F }],
  ['dyn', { scale: 1e-5,              dims: D_F }],

  // ---- Energy and power ----
  ['J',   { scale: 1,                 dims: D_E,   prefixable: true }],
  ['cal', { scale: 4.1868,            dims: D_E,   prefixable: true }],
  ['Btu', { scale: 1055.05585262,     dims: D_E }],
  ['eV',  { scale: 1.602176634e-19,   dims: D_E,   prefixable: true }],
  ['Wh',  { scale: 3600,              dims: D_E,   prefixable: true }],
  ['erg', { scale: 1e-7,              dims: D_E }],
  ['ftlbf', { scale: FTLBF,           dims: D_E }],
  ['W',   { scale: 1,                 dims: D_P,   prefixable: true }],
  ['hp',  { scale: 33000 * FTLBF / 60, dims: D_P }],

  // ---- Pressure ----
  ['Pa',  { scale: 1,                 dims: D_Pa,  prefixable: true }],
  ['kPa', { scale: 1000,              dims: D_Pa }],
  ['bar', { scale: 1e5,               dims: D_Pa,  prefixable: true }],
  ['atm', { scale: 101325,            dims: D_Pa }],
  ['psi', { scale: LB * G0 / 0.0254 ** 2, dims: D_Pa }],
  ['torr', { scale: 101325 / 760,     dims: D_Pa }],
  ['mmHg', { scale: 133.322387415,    dims: D_Pa }],
  ['inHg', { scale: 3386.388640341,   dims: D_Pa }],

  // ---- Electricity and magnetism ----
  ['Hz',  { scale: 1,                 dims: D_iT,  prefixable: true }],
  ['V',   { scale: 1,                 dims: D_V,   prefixable: true }],
  ['Ω',   { scale: 1,                 dims: D_Ohm, prefixable: true }],
  ['ohm', { scale: 1,                 dims: D_Ohm, prefixable: true }],  // ASCII alias
  ['C',   { scale: 1,                 dims: D_Q,   prefixable: true }],    // coulomb
  ['F',   { scale: 1,                 dims: D_Cap, prefixable: true }],
  ['H',   { scale: 1,                 dims: D_Ind, prefixable: true }],
  ['S',   { scale: 1,                 dims: D_Gs,  prefixable: true }],
  ['T',   { scale: 1,                 dims: D_B,   prefixable: true }],
  ['Wb',  { scale: 1,                 dims: D_Wb,  prefixable: true }],

  // ---- Radiation and light ----
  ['Bq',  { scale: 1,                 dims: D_iT,  prefixable: true }],
  ['Gy',  { scale: 1,                 dims: D_Gy,  prefixable: true }],
  ['Sv',  { scale: 1,                 dims: D_Gy,  prefixable: true }],
  ['lm',  { scale: 1,                 dims: D_J,   prefixable: true }],
  ['lx',  { scale: 1,                 dims: D_lx,  prefixable: true }],

  // ---- Angle: a base dimension of its own, as on the HP 50g ----
  ['r',   { scale: 1,                 dims: D_Ang }],
  ['°',   { scale: Math.PI / 180,     dims: D_Ang }],
  ['grad', { scale: Math.PI / 200,    dims: D_Ang }],
  ['arcmin', { scale: Math.PI / 10800, dims: D_Ang }],
  ['arcs', { scale: Math.PI / 648000, dims: D_Ang }],
  ['sr',  { scale: 1,                 dims: D_Sr }],
]);

// 'da' stands before 'd' so that dam reads as deka-metre; D is the HP's deka.
const SI_PREFIXES = Object.freeze([
  ['da', 1e1], ['D', 1e1], ['Y', 1e24], ['Z', 1e21], ['E', 1e18], ['P', 1e15], ['T', 1e12],
  ['G', 1e9], ['M', 1e6], ['k', 1e3], ['h', 1e2], ['d', 1e-1], ['c', 1e-2], ['m', 1e-3],
  ['μ', 1e-6], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15], ['a', 1e-18],
  ['z', 1e-21], ['y', 1e-24],
]);

const prefixed = new Map();

// A catalog entry as listed, or a prefixable one with an SI prefix (kJ, MHz).
export function unitInfo(sym) {
  const listed = UNIT_CATALOG.get(sym);
  if (listed) return listed;
  if (!prefixed.has(sym)) {
    let info;
    for (const [prefix, factor] of SI_PREFIXES) {
      const base = sym.startsWith(prefix) ? UNIT_CATALOG.get(sym.slice(prefix.length)) : undefined;
      if (base?.prefixable) { info = { scale: factor * base.scale, dims: base.dims }; break; }
    }
    prefixed.set(sym, info);
  }
  return prefixed.get(sym);
}

// Exponents may be fractions (the root of 9_m is 3_m^.5), kept to 12 digits so that .1 * 3 equals .3.
const exact = (x) => Number(x.toPrecision(12));

export function normalizeUexpr(factors) {
  const merged = new Map();
  for (const [sym, exp] of factors) {
    if (!unitInfo(sym)) throw new Error(`Unknown unit: ${sym}`);
    merged.set(sym, exact((merged.get(sym) ?? 0) + exp));
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
    const c = unitInfo(sym);
    for (let i = 0; i < BASE_DIMS_LEN; i++) d[i] = exact(d[i] + c.dims[i] * exp);
  }
  return d;
}

export function scaleOf(uexpr) {
  let s = 1;
  for (const [sym, exp] of uexpr) {
    s *= Math.pow(unitInfo(sym).scale, exp);
  }
  return s;
}

// The entry of a bare temperature unit (K, °C, °F, °R), else null.
function simpleTemperature(uexpr) {
  if (uexpr.length !== 1 || uexpr[0][1] !== 1) return null;
  const info = unitInfo(uexpr[0][0]);
  return info.dims === D_TH ? info : null;
}

// Whether x_from + y_to is allowed for temperatures: both absolute (K, °R),
// both °C or both °F, as the AUR says for +, -, %CH and %T.
export function temperaturesAdd(from, to) {
  const a = simpleTemperature(from);
  const b = simpleTemperature(to);
  if (!a || !b) return true;
  return (a.offset === undefined && b.offset === undefined) || from[0][0] === to[0][0];
}

// `value` of the units `from`, in the units `to`.  Bare temperatures convert as
// thermometer readings (100_°C is 212_°F) unless `difference` says they are
// differences, as for + and -.
export function convertValue(value, from, to, { difference = false } = {}) {
  const a = difference ? null : simpleTemperature(from);
  const b = difference ? null : simpleTemperature(to);
  if (a && b) return (value * a.scale + (a.offset ?? 0) - (b.offset ?? 0)) / b.scale;
  return value * scaleOf(from) / scaleOf(to);
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

/* uexpr  := '/'? factor ( ('*' | '/') factor )*
   factor := SYMBOL ( '^' ('-'|'+')? NUMBER )? | '(' uexpr ')' | '1'
   '/' inverts only the next factor, reading left to right as the HP50
   does, so m/s*s is m.  formatUnitExpr parenthesizes a denominator with
   several factors so its output parses back unchanged.  An operator needs
   a factor on its right, and a unit needs at least one symbol. */

export function parseUnitExpr(text) {
  const src = text.normalize('NFKC');
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
      const em = src.slice(i).match(/^[-+]?(?:\d+\.?\d*|\.\d+)/);
      if (!em) throw new Error(`Bad exponent in unit expression: ${src}`);
      exp = Number(em[0]);
      i += em[0].length;
    }
    return normalizeUexpr([[sym, exp]]);
  }

  function readExpr(stopChar) {
    let result = normalizeUexpr([]);
    let invertNext = false;
    let expectFactor = false;
    let first = true;
    while (i < n && src[i] !== stopChar) {
      const c = src[i];
      if (c === '*' || c === '/') {
        // Only a leading '/' may stand without a factor before it, as in 1_/s.
        if (expectFactor || (first && c === '*')) throw new Error(`Bad unit expression near '${c}': ${src}`);
        invertNext = c === '/';
        expectFactor = true;
        first = false;
        i++;
        continue;
      }
      const factor = readFactor();
      result = multiplyUexpr(result, invertNext ? inverseUexpr(factor) : factor);
      invertNext = false;
      expectFactor = false;
      first = false;
    }
    if (expectFactor) throw new Error(`Bad unit expression, an operator needs a unit after it: ${src}`);
    return result;
  }

  if (!src) throw new Error('Missing unit after the underscore');
  if (!/[A-Za-zΩμ°]/.test(src)) throw new Error(`Bad unit expression, there is no unit in '${src}'`);
  return readExpr(undefined);
}

export function formatUnitExpr(uexpr) {
  if (uexpr.length === 0) return '';
  const pos = uexpr.filter(([, e]) => e > 0);
  const neg = uexpr.filter(([, e]) => e < 0);
  const fmt = ([s, e]) => Math.abs(e) === 1 ? s : `${s}^${String(Math.abs(e)).replace(/^0\./, '.')}`;
  const ps = pos.map(fmt).join('*');
  const ns = neg.map(fmt).join('*');
  if (neg.length === 0) return ps;
  if (pos.length === 0) return neg.length === 1 ? '1/' + ns : `1/(${ns})`;
  return ps + '/' + (neg.length === 1 ? ns : `(${ns})`);
}

const hasPrefix = (sym) => SI_PREFIXES.some(([p]) => sym.startsWith(p) && UNIT_CATALOG.get(sym.slice(p.length))?.prefixable);

// What SIZE counts in a unit object (AUR): the scalar and the underscore,
// each name, 2 for a prefix, and 1 for each operator and exponent.
export function unitSize(uexpr) {
  const side = (factors) => factors.reduce((n, [sym, e]) => n + 1 + (hasPrefix(sym) ? 2 : 0) + (Math.abs(e) === 1 ? 0 : 2), 0);
  const pos = uexpr.filter(([, e]) => e > 0);
  const neg = uexpr.filter(([, e]) => e < 0);
  const operators = Math.max(pos.length - 1, 0) + Math.max(neg.length - 1, 0) + (neg.length ? 1 : 0);
  return 2 + side(pos) + side(neg) + operators + (neg.length && !pos.length ? 1 : 0);
}
