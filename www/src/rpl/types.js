/* RPL value types, each a frozen { type, ...payload } object: Real
   (Decimal), Integer (BigInt), Rational (BigInt n/d), BinaryInteger,
   Complex, String, Name, Symbolic (algebra AST), List, Vector, Matrix,
   Program, Tagged, Unit and Grob, plus the one mutable type, Directory,
   whose entries Map STO and PURGE edit in place. */

import Decimal from '../../vendor/decimal.js/decimal.mjs';
import { RPLError } from './stack.js';
export { Decimal };

export const TYPES = Object.freeze({
  REAL:      'real',
  INTEGER:   'integer',
  RATIONAL:  'rational',
  BININT:    'binaryInteger',
  COMPLEX:   'complex',
  STRING:    'string',
  NAME:      'name',
  SYMBOLIC:  'symbolic',
  LIST:      'list',
  VECTOR:    'vector',
  MATRIX:    'matrix',
  PROGRAM:   'program',
  TAGGED:    'tagged',
  DIRECTORY: 'directory',
  UNIT:      'unit',
  GROB:      'grob',
});

export const BIN_BASES = Object.freeze(['h', 'd', 'o', 'b']);

const REAL_DIGITS = 12;

// The payload is always a Decimal.  The HP50 has no NaN, so a NaN result
// must surface as an error rather than a value.
export function Real(n) {
  let d = (n instanceof Decimal) ? n : new Decimal(n);
  if (d.isNaN()) {
    throw new TypeError(`Real() does not accept NaN (from ${n})`);
  }
  if (d.isFinite() && d.sd(true) > REAL_DIGITS) d = d.toSignificantDigits(REAL_DIGITS, Decimal.ROUND_HALF_UP);
  return Object.freeze({ type: TYPES.REAL, value: d });
}

export function Integer(n) {
  const b = typeof n === 'bigint' ? n : BigInt(n);
  return Object.freeze({ type: TYPES.INTEGER, value: b });
}

// Always in lowest terms with d >= 1n.  Never collapses to Integer when
// d === 1n: callers decide which type an integral result gets.
export function Rational(n, d = 1n) {
  let num = _bigIntArg(n, 'numerator');
  let den = _bigIntArg(d, 'denominator');
  if (den === 0n) throw new RangeError('Division by zero');
  if (den < 0n) { num = -num; den = -den; }
  const g = _bigIntGcd(num < 0n ? -num : num, den);
  return Object.freeze({ type: TYPES.RATIONAL, n: num / g, d: den / g });
}

function _bigIntArg(v, role) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  throw new TypeError(`Rational ${role} must be BigInt or integer Number, got ${typeof v}`);
}

function _bigIntGcd(a, b) {
  while (b !== 0n) { [a, b] = [b, a % b]; }
  return a;
}

// HP50 binary integers are unsigned, so negative input clamps to 0.  The
// base only affects display.
export function BinaryInteger(n, base = 'h') {
  const raw = typeof n === 'bigint' ? n : BigInt(n);
  const value = raw < 0n ? 0n : raw;
  const b = String(base).toLowerCase();
  if (!BIN_BASES.includes(b)) {
    throw new TypeError(`BinaryInteger base must be h/d/o/b, got ${base}`);
  }
  return Object.freeze({ type: TYPES.BININT, value, base: b });
}

const roundPart = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? Number(n.toPrecision(REAL_DIGITS)) : n;
};

export function Complex(re, im) {
  return Object.freeze({
    type: TYPES.COMPLEX,
    re: roundPart(re),
    im: roundPart(im),
  });
}

export function Str(s) {
  return Object.freeze({ type: TYPES.STRING, value: String(s) });
}

// A quoted name was written in ticks; EVAL and the entry loop push it back
// instead of looking it up.
export function Name(id, { local = false, quoted = false } = {}) {
  return Object.freeze({
    type: TYPES.NAME,
    id: String(id),
    local,
    quoted: Boolean(quoted),
  });
}

// HP50 AUR §2.2.4: 1 to 127 characters, a letter first, then letters, digits
// or _.  Greek is limited to the HP character set's letters rather than
// \p{L}, so look-alike letters from other scripts are refused.
const HP_IDENT_RE =
  /^[A-Za-zΑ-Ωα-ω][A-Za-z0-9Α-Ωα-ω_]{0,126}$/;

// Command names, upper-cased; register() adds each op so STO refuses them.
const _RESERVED_NAMES = new Set();

export function registerReservedName(name) {
  if (typeof name === 'string' && name.length > 0) _RESERVED_NAMES.add(name.toUpperCase());
}

export function isReservedHpName(name) {
  return typeof name === 'string' && _RESERVED_NAMES.has(name.toUpperCase());
}

export function isValidHpIdentifier(name) {
  return typeof name === 'string' && HP_IDENT_RE.test(name);
}

export function isStorableHpName(name) {
  return isValidHpIdentifier(name) && !isReservedHpName(name);
}

export function Symbolic(expr) {
  return Object.freeze({ type: TYPES.SYMBOLIC, expr });
}

export function RList(items) {
  return Object.freeze({ type: TYPES.LIST, items: Object.freeze([...items]) });
}

export function Vector(items) {
  return Object.freeze({ type: TYPES.VECTOR, items: Object.freeze([...items]) });
}

export function Matrix(rows) {
  return Object.freeze({
    type: TYPES.MATRIX,
    rows: Object.freeze(rows.map(r => Object.freeze([...r]))),
  });
}

export function Program(tokens) {
  return Object.freeze({
    type: TYPES.PROGRAM,
    tokens: Object.freeze([...tokens]),
  });
}

export function Tagged(tag, value) {
  return Object.freeze({ type: TYPES.TAGGED, tag: String(tag), value });
}

// uexpr is a canonical [symbol, exponent] list from units.js normalizeUexpr.
export function Unit(value, uexpr) {
  return Object.freeze({ type: TYPES.UNIT, value: Number(value), uexpr });
}

export function Directory({ name = 'HOME', parent = null, entries = null } = {}) {
  return {
    type: TYPES.DIRECTORY,
    name: String(name),
    parent,
    entries: entries ?? new Map(),
  };
}

export const isReal     = v => v && v.type === TYPES.REAL;
export const isInteger  = v => v && v.type === TYPES.INTEGER;
export const isRational = v => v && v.type === TYPES.RATIONAL;
export const isBinaryInteger = v => v && v.type === TYPES.BININT;
export const isComplex  = v => v && v.type === TYPES.COMPLEX;
export const isString   = v => v && v.type === TYPES.STRING;
export const isName       = v => v && v.type === TYPES.NAME;
export const isSymbolic = v => v && v.type === TYPES.SYMBOLIC;
export const isList     = v => v && v.type === TYPES.LIST;
export const isVector   = v => v && v.type === TYPES.VECTOR;
export const isMatrix   = v => v && v.type === TYPES.MATRIX;
export const isProgram  = v => v && v.type === TYPES.PROGRAM;
export const isTagged    = v => v && v.type === TYPES.TAGGED;
export const isDirectory = v => v && v.type === TYPES.DIRECTORY;
export const isUnit      = v => v && v.type === TYPES.UNIT;
// BinaryInteger is left out: its arithmetic keeps the left operand's base,
// which promoteNumericPair does not model.
export const isNumber    = v => isReal(v) || isInteger(v) || isRational(v) || isComplex(v);

// For Math.* callers; exact arithmetic goes through toRealDecimal instead.
export function toRealOrThrow(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isRational(v)) return Number(v.n) / Number(v.d);
  if (isComplex(v) && v.im === 0) return v.re;
  throw new RPLError(`Bad argument type: expected real, got ${v?.type}`);
}

export function toRealDecimal(v) {
  if (isReal(v)) return v.value;
  if (isInteger(v)) return new Decimal(v.value.toString());
  if (isRational(v)) {
    return new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
  }
  if (isComplex(v) && v.im === 0) return new Decimal(v.re);
  throw new RPLError(`Bad argument type: expected real, got ${v?.type}`);
}

export function toComplex(v) {
  if (isComplex(v)) return { re: v.re, im: v.im };
  if (isReal(v))    return { re: v.value.toNumber(), im: 0 };
  if (isInteger(v)) return { re: Number(v.value), im: 0 };
  if (isRational(v)) return { re: Number(v.n) / Number(v.d), im: 0 };
  throw new RPLError(`Bad argument type: expected number, got ${v?.type}`);
}

// Promotes along Integer ⊂ Rational ⊂ Real ⊂ Complex.  kind is 'integer'
// (BigInt payloads), 'rational' ({ n, d }), 'real' (Decimal) or 'complex'.
export function promoteNumericPair(a, b) {
  if (isComplex(a) || isComplex(b)) {
    return { a: toComplex(a), b: toComplex(b), kind: 'complex' };
  }
  if (isInteger(a) && isInteger(b)) {
    return { a: a.value, b: b.value, kind: 'integer' };
  }
  if ((isRational(a) || isInteger(a)) && (isRational(b) || isInteger(b))) {
    return { a: toRationalPair(a), b: toRationalPair(b), kind: 'rational' };
  }
  return {
    a: toRealDecimal(a),
    b: toRealDecimal(b),
    kind: 'real',
  };
}

function toRationalPair(v) {
  return isRational(v) ? { n: v.n, d: v.d } : { n: v.value, d: 1n };
}
