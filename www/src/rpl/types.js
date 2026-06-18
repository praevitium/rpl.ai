/* =================================================================
   RPL value types.

   Every value on the stack is a tagged immutable object of the shape
   { type: <string>, ...payload }.  Constructors below enforce that
   shape and provide type predicates.

   Types implemented:
     Real      — decimal.js Decimal instance at 15-digit precision
                 (HP50 STD display crops to 12; the extra 3 digits are
                 guard precision that heal IEEE-754 artefacts across
                 chained arithmetic).  The stored value is ALWAYS a
                 Decimal — callers that need a JS number call
                 `.toNumber()` explicitly.  See `toRealOrThrow` which
                 is the canonical coercion helper.
     Integer   — arbitrary precision via BigInt
     Rational  — exact ratio of integers via Fraction.js; participates in
                 the Integer ⊂ Rational ⊂ Real ⊂ Complex promotion lattice.
                 Stored as { n: BigInt, d: BigInt } in lowest terms with
                 d ≥ 1n.  Fraction.js is vendored at
                 `www/src/vendor/fraction.js/`.
     Complex   — { re, im } real pair
     String    — quoted string literal
     Name      — global or local identifier
     Symbolic  — algebraic expression (parsed AST stored as .expr)
     List      — ordered heterogeneous sequence
     Vector    — 1-D array of Reals/Complex
     Matrix    — 2-D array of Reals/Complex
     Program   — compiled RPL program (sequence of tokens)
     Tagged    — value wrapped with a string label
     Directory — mutable named container for variables (HOME and its
                 subdirectories); STO writes into it, PURGE removes from
                 it.  See the `Directory` constructor below.
     BinaryInteger — non-negative integer with a display base (h/d/o/b),
                     written `#NNNNh` etc.  Produced by ERRN and by
                     HEX/DEC/OCT/BIN literals.  Payload is a BigInt so
                     wide values (up to the HP50's 64-bit STWS) round-trip.

   Unit — numeric value carried with a dimensional expression, e.g.
       3_m, 5_kg*m/s^2.  Stored as { value, dims, expr } — see the
       `Unit` constructor below.  Arithmetic obeys dimensional rules
       (see ops.js) and CONVERT/UBASE/UVAL handle unit→unit coercion.
   Grob — rectangular bitmap (Graphics Object).  A value-only shell:
       the plotting system that produces and consumes GROBs is out of
       scope, but the type exists so TYPE, →STR, persistence, and
       future graphics primitives have something to round-trip.
   ================================================================= */

import Decimal from '../vendor/decimal.js/decimal.mjs';
/* decimal.js runtime config — precision/rounding are set once in
   ops.js at module load, which runs before any stack values are built
   in normal operation.  If a caller constructs a Real before ops.js
   has had a chance to configure Decimal, they'll just get the
   library defaults (20 digits, ROUND_HALF_UP); the Real is still
   well-formed and arithmetic re-rounds on every op. */
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

/** Valid Binary-Integer display bases: h(16) d(10) o(8) b(2). */
export const BIN_BASES = Object.freeze(['h', 'd', 'o', 'b']);

/* --------------------------- constructors --------------------------- */

/**
 * A Real — 15-digit decimal-backed number.
 *
 * Accepts any input Decimal.js can swallow: a JS Number (finite, not
 * NaN), a decimal string (`'0.1'`, `'-3.14e2'`), a BigInt, or another
 * Decimal instance.  The payload is always stored as a Decimal so
 * chained arithmetic preserves 15 significant digits without IEEE-754
 * drift.  Callers that need a plain JS number read `.value.toNumber()`
 * (or use `toRealOrThrow(v)`, which does the unwrap for them).
 *
 * NaN is rejected at construction — the HP50 has no NaN; failed
 * arithmetic raises an error instead.
 */
export function Real(n) {
  // Decimal doesn't throw on NaN; it stores and propagates — opposite
  // of the HP50, which has no NaN.
  if (typeof n === 'number' && Number.isNaN(n)) {
    throw new TypeError('Real() does not accept NaN');
  }
  const d = (n instanceof Decimal) ? n : new Decimal(n);
  if (d.isNaN()) {
    throw new TypeError(`Real() does not accept NaN (from ${n})`);
  }
  return Object.freeze({ type: TYPES.REAL, value: d });
}

export function Integer(n) {
  const b = typeof n === 'bigint' ? n : BigInt(n);
  return Object.freeze({ type: TYPES.INTEGER, value: b });
}

/**
 * A Rational — exact ratio of integers.
 *
 * Stored as two BigInts: `n` (numerator, sign-carrying) and `d`
 * (denominator, always positive, always ≥ 1 after reduction).  Always
 * in lowest terms — `gcd(|n|, d) === 1n` is an invariant.  `d === 0n`
 * is rejected at construction ("Division by zero" → RangeError).
 *
 * Constructor behavior:
 *   • Accepts BigInt or Number inputs (Numbers are BigInt-coerced;
 *     non-integer Numbers throw).
 *   • Normalizes sign onto `n` (so `Rational(1, -2)` ≡ `Rational(-1, 2)`).
 *   • Reduces via GCD (so `Rational(4, 6)` → `{ n: 2n, d: 3n }`).
 *   • Does NOT collapse to Integer on `d === 1n` — callers decide
 *     whether an integer result should be Integer or Rational.  Op
 *     handlers (e.g. `+`, `-`, `*`, `/`) typically check `d === 1n`
 *     after arithmetic and emit Integer in that case, so the user-
 *     visible stack stays consistent with HP50 semantics (`2 1 /` →
 *     Integer(2), not Rational(2/1)).
 *
 * Arithmetic is performed internally via Fraction.js (vendored at
 * `www/src/vendor/fraction.js/`), which is BigInt-backed so a Rational of
 * arbitrarily large numerator and denominator (e.g. a factorial ratio)
 * works out of the box.
 */
export function Rational(n, d = 1n) {
  const ni = (typeof n === 'bigint') ? n
           : (typeof n === 'number' && Number.isInteger(n)) ? BigInt(n)
           : (() => { throw new TypeError(`Rational numerator must be BigInt or integer Number, got ${typeof n}`); })();
  const di = (typeof d === 'bigint') ? d
           : (typeof d === 'number' && Number.isInteger(d)) ? BigInt(d)
           : (() => { throw new TypeError(`Rational denominator must be BigInt or integer Number, got ${typeof d}`); })();
  if (di === 0n) throw new RangeError('Division by zero');
  let num = ni, den = di;
  if (den < 0n) { num = -num; den = -den; }
  const g = _bigIntGcd(num < 0n ? -num : num, den);
  num = num / g;
  den = den / g;
  return Object.freeze({ type: TYPES.RATIONAL, n: num, d: den });
}

function _bigIntGcd(a, b) {
  while (b !== 0n) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * A Binary Integer — non-negative integer with a display base.
 *
 * HP50 binary integers are literal unsigned values up to the current
 * wordsize (STWS, default 64).  They are written `#NNNNh` (hex),
 * `#NNNNd` (decimal), `#NNNNo` (octal), `#NNNNb` (binary) in source.
 * The base is a display flag that travels with the value — the
 * numeric payload is always the same BigInt.
 *
 *   n    : BigInt (or coercible).  Negative inputs are clamped to 0 —
 *          HP50 has no concept of a signed BinInt and `#-1h` is not
 *          a legal literal.
 *   base : 'h' | 'd' | 'o' | 'b'.  Defaults to 'h', the HP50 default.
 *
 * Payload shape differs intentionally from Integer so that type
 * predicates (isInteger vs. isBinaryInteger) remain distinct; operations
 * that treat both the same can fall through numeric coercion.
 */
export function BinaryInteger(n, base = 'h') {
  const raw = typeof n === 'bigint' ? n : BigInt(n);
  const value = raw < 0n ? 0n : raw;
  const b = String(base).toLowerCase();
  if (!BIN_BASES.includes(b)) {
    throw new TypeError(`BinaryInteger base must be h/d/o/b, got ${base}`);
  }
  return Object.freeze({ type: TYPES.BININT, value, base: b });
}

export function Complex(re, im) {
  return Object.freeze({
    type: TYPES.COMPLEX,
    re: Number(re),
    im: Number(im),
  });
}

export function Str(s) {
  return Object.freeze({ type: TYPES.STRING, value: String(s) });
}

/**
 * A Name identifier.
 *
 *   quoted:  true  → the name was written as `'X'` in source, or otherwise
 *                    constructed as a literal reference.  Quoted names are
 *                    never auto-evaluated: EVAL and the entry-loop push them
 *                    back unchanged.  The formatter renders them with ticks.
 *                    Use this when you want to hand a name to STO, RCL,
 *                    PURGE, etc. without losing it to a variable lookup.
 *
 *            false → a "bare" identifier as it appears in a program body
 *                    (or in the command line without surrounding ticks).
 *                    Bare names are resolved at EVAL time: ops run, bound
 *                    variables auto-recall-and-eval, unbound names push.
 *
 *   local:   reserved for program-local bindings (↓X), unchanged here.
 *
 * HP50 parallel: the calculator's internal "GROB" vs. "algebraic name"
 * distinction collapses to this single flag for our purposes.
 */
export function Name(id, { local = false, quoted = false } = {}) {
  return Object.freeze({
    type: TYPES.NAME,
    id: String(id),
    local,
    quoted: Boolean(quoted),
  });
}

/* ------------------------------------------------------------------
   HP50-style global-identifier validation.

   The HP50 AUR (§2.2.4) says a valid user-variable name:
     1. Is 1 to 127 characters long.
     2. Starts with a letter — any ASCII letter A..Z / a..z or a Greek
        letter from the HP character set (α..ω, Α..Ω).
     3. Contains only letters, digits, or the underscore after the
        first position.  Arithmetic operators, punctuation, whitespace,
        brackets, etc. are rejected.
     4. Is not one of the reserved command / function names the
        calculator hard-codes (SIN, COS, STO, …).  Storing to a reserved
        name is refused by the HP50 with "Invalid name".

   Greek ranges here match the Unicode blocks that correspond to the
   HP character set's Greek letters — U+0391..U+03A9 (Α..Ω, with the
   final-sigma slot U+03A2 unused anyway) and U+03B1..U+03C9 (α..ω).
   Sticking to code-point ranges (not \p{L}) keeps behaviour close to
   the HP50 rather than accepting arbitrary Unicode letters that the
   device never exposed — "cyrillic A" looking like Latin A is exactly
   the confusing surface we want to avoid.

   Operator-name references (Name('+', quoted:true) etc.) are a
   separate concept used for passing operators as first-class values;
   they fail this check deliberately, and STO / RCL / CRDIR guard
   against them via isValidHpIdentifier.
   ------------------------------------------------------------------ */

const HP_IDENT_START_RE =
  /^[A-Za-z\u0391-\u03A9\u03B1-\u03C9]/;
const HP_IDENT_REST_RE =
  /^[A-Za-z0-9\u0391-\u03A9\u03B1-\u03C9_]*$/;

/** Reserved command / function names that cannot be overwritten as
 *  user variables on the HP50.  Populated lazily at first use to avoid
 *  a circular import with ops.js — ops.js fills this set via
 *  `registerReservedName` as it registers each op (see ops.js init
 *  block).  Callers that want to validate before ops.js has loaded
 *  get the current (possibly partial) view; in practice the flag-day
 *  is the ops.js module-load, which precedes any user interaction.
 */
const _RESERVED_NAMES = new Set();

/** Register a name as reserved (unavailable for STO target).
 *  ops.js calls this for every registered op; other callers can use
 *  it to flag additional names (e.g. internal slots). */
export function registerReservedName(name) {
  if (typeof name !== 'string' || name.length === 0) return;
  _RESERVED_NAMES.add(name);
  _RESERVED_NAMES.add(name.toUpperCase());
}

/** Is `name` a reserved HP50 command / function name (checked case-
 *  insensitively, matching the HP50's uppercase command surface)? */
export function isReservedHpName(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  return _RESERVED_NAMES.has(name) || _RESERVED_NAMES.has(name.toUpperCase());
}

/** Syntactic validity only — letters/digits/underscore, starts with
 *  letter, ≤127 chars.  Does NOT consult the reserved-name list; STO
 *  etc. layer that check on top. */
export function isValidHpIdentifier(name) {
  if (typeof name !== 'string') return false;
  const n = name.length;
  if (n === 0 || n > 127) return false;
  if (!HP_IDENT_START_RE.test(name)) return false;
  if (!HP_IDENT_REST_RE.test(name.slice(1))) return false;
  return true;
}

/** Combined STO-eligibility check: valid syntax AND not reserved. */
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

/**
 * A Unit: numeric value carrying a dimensional expression.
 *
 *   value : JS number (same flat shape Real uses).  Integer-typed input
 *           is coerced to a number at construction time — once the
 *           dimensional arithmetic takes over we're firmly in Real land
 *           anyway (CONVERT / UBASE produce decimals).
 *   uexpr : canonical frozen array of [symbol, exponent] tuples — see
 *           units.js's `normalizeUexpr`.  An empty uexpr is a legal
 *           shape but ops that produce a dimensionless result will
 *           normally unwrap to a plain Real.
 */
export function Unit(value, uexpr) {
  return Object.freeze({ type: TYPES.UNIT, value: Number(value), uexpr });
}

/**
 * A Directory is a mutable named container for variables.
 *
 * Unlike the other value types (which are frozen value objects), a
 * Directory owns live state — STO writes into it, PURGE removes from
 * it.  `entries` is a Map<string, Value>.  `parent` is another
 * Directory (or null for HOME).  `name` is the directory's label as
 * seen in the `{ HOME }` path annunciator.
 *
 * Intentionally NOT Object.freeze()d: its purpose is to be mutated.
 * If you need a snapshot, copy `entries`.
 */
export function Directory({ name = 'HOME', parent = null, entries = null } = {}) {
  return {
    type: TYPES.DIRECTORY,
    name: String(name),
    parent,
    entries: entries ?? new Map(),
  };
}

/* ----------------------------- predicates ----------------------------- */

export const isReal     = v => v && v.type === TYPES.REAL;
export const isInteger  = v => v && v.type === TYPES.INTEGER;
export const isRational = v => v && v.type === TYPES.RATIONAL;
export const isBinaryInteger = v => v && v.type === TYPES.BININT;
export const isComplex  = v => v && v.type === TYPES.COMPLEX;
export const isString   = v => v && v.type === TYPES.STRING;
export const isName       = v => v && v.type === TYPES.NAME;
export const isQuotedName = v => isName(v) && v.quoted === true;
export const isSymbolic = v => v && v.type === TYPES.SYMBOLIC;
export const isList     = v => v && v.type === TYPES.LIST;
export const isVector   = v => v && v.type === TYPES.VECTOR;
export const isMatrix   = v => v && v.type === TYPES.MATRIX;
export const isProgram  = v => v && v.type === TYPES.PROGRAM;
export const isTagged    = v => v && v.type === TYPES.TAGGED;
export const isDirectory = v => v && v.type === TYPES.DIRECTORY;
export const isUnit      = v => v && v.type === TYPES.UNIT;
// BinaryInteger is deliberately NOT in isNumber today — HP50 HEX/DEC
// arithmetic between BinInts follows a base-preservation rule
// (the left operand's base wins) that the default promoteNumericPair
// doesn't model yet.  Ops that want to accept a BinInt can do so via
// `isInteger(v) || isBinaryInteger(v)` and call `binIntToBigInt(v)`.
export const isNumber    = v => isReal(v) || isInteger(v) || isRational(v) || isComplex(v);

/* ------------------------ numeric coercion helpers ------------------------ */

/**
 * Coerce any numeric value to a JS number — used by transcendental ops
 * (SIN, COS, LN, …) that delegate to `Math.*`.  Real's Decimal payload
 * is unwrapped with `.toNumber()`.
 *
 * Precision-sensitive arithmetic (`+`, `-`, `*`, `/`, `^`) does NOT go
 * through this helper — it uses `toRealDecimal` / `promoteNumericPair`
 * so Decimal identity is preserved end-to-end.
 */
export function toRealOrThrow(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isRational(v)) return Number(v.n) / Number(v.d);
  if (isComplex(v) && v.im === 0) return v.re;
  throw new TypeError(`Bad argument type: expected real, got ${v?.type}`);
}

/**
 * Coerce to a Decimal.  Unlike `toRealOrThrow` this keeps the full
 * 15-digit precision — it's the entry point `realBinary` uses to bring
 * Integer / Rational operands into Decimal space without round-tripping
 * through IEEE-754.
 */
export function toRealDecimal(v) {
  if (isReal(v)) return v.value;
  if (isInteger(v)) return new Decimal(v.value.toString());
  if (isRational(v)) {
    return new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
  }
  if (isComplex(v) && v.im === 0) return new Decimal(v.re);
  throw new TypeError(`Bad argument type: expected real, got ${v?.type}`);
}

/**
 * Coerce to complex { re, im }.  Re/Im are JS numbers (complex.js and
 * our Complex stack payload both live in IEEE-754 land).
 */
export function toComplex(v) {
  if (isComplex(v)) return { re: v.re, im: v.im };
  if (isReal(v))    return { re: v.value.toNumber(), im: 0 };
  if (isInteger(v)) return { re: Number(v.value), im: 0 };
  if (isRational(v)) return { re: Number(v.n) / Number(v.d), im: 0 };
  throw new TypeError(`Bad argument type: expected number, got ${v?.type}`);
}

/**
 * Promote a pair of numeric operands to a common numeric type.
 * Returns { a, b, kind } where kind is 'real' | 'complex' | 'integer'
 * | 'rational'.
 *
 * Promotion lattice (lowest → highest): Integer ⊂ Rational ⊂ Real ⊂ Complex.
 * A pair of Integers keeps the 'integer' kind for fast BigInt arithmetic.
 * Rationals promote to 'rational' when paired with Integer or Rational;
 * mixing with Real pushes to 'real' (the Real is inexact, so Rational's
 * exactness is already lost).  Mixing with Complex pushes to 'complex'.
 */
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

/**
 * Widen an Integer or Rational to the two-BigInt pair { n, d } that
 * rational arithmetic operates on.  Integer(k) → { n: k, d: 1n }.
 * Rational passes through its payload.  Throws otherwise — this is a
 * helper for the 'rational'-kind arithmetic path in promoteNumericPair,
 * never a general-purpose coercion.
 */
export function toRationalPair(v) {
  if (isRational(v)) return { n: v.n, d: v.d };
  if (isInteger(v))  return { n: v.value, d: 1n };
  throw new TypeError(`toRationalPair: expected Integer or Rational, got ${v?.type}`);
}
