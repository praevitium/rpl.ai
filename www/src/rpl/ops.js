/* =================================================================
   Operation registry.

   Every RPL command (ADD, SIN, DUP, ...) lives here as a function
   `fn(stack, state)`.  The app looks up ops by their canonical name
   and calls them.  Keep this registry open-ended — new ops just
   register themselves.
   ================================================================= */

import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, RList, Str, Symbolic,
  Vector, Matrix, Tagged, Unit, Program,
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isNumber, isName, isString,
  isProgram, isTagged, isList, isSymbolic, isVector, isMatrix, isDirectory,
  isUnit,
  toRealOrThrow, toComplex, promoteNumericPair,
  isValidHpIdentifier, isStorableHpName, registerReservedName,
} from './types.js';
import { Fraction } from '../vendor/fraction.js/fraction.mjs';
import Decimal from '../vendor/decimal.js/decimal.mjs';
import Complex$ from '../vendor/complex.js/complex.mjs';

/* -------------------------------------------------------------
   Decimal.js — precision and rounding configured once at module load.
   MAX_EXP / MIN_EXP are set by state.js (it imports Decimal from
   types.js and calls Decimal.set there at boot) and kept in sync by
   setRealMaxExp().  This call only sets precision + rounding so it
   cannot reset the exponent limits state.js already established.

   Rounding mode 4 = ROUND_HALF_UP (HP50 rounds .5 away from zero).
   No-fallback rule: if Decimal throws, we let it through.
   ------------------------------------------------------------- */
Decimal.set({ precision: 15, rounding: Decimal.ROUND_HALF_UP });
import {
  multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr,
  sameDims, scaleOf, toBaseUexpr, uexprEqual,
} from './units.js';
// HALT raises via the generator-protocol sentinel — not a thrown class
// — so only RPLError + RPLAbort + setPushCoerce are needed from stack.js.
import { RPLError, RPLAbort, setPushCoerce } from './stack.js';
import {
  Var as AstVar, Num as AstNum,
  Bin as AstBin, Fn as AstFn, Neg as AstNeg,
  evalAst as algebraEvalAst, defaultFnEval as algebraDefaultFnEval,
  isNum as astIsNum, KNOWN_FUNCTIONS,
  formatAlgebra,
  freeVars as algebraFreeVars,
  isKnownFunction,
} from './algebra.js';
import { giac } from './cas/giac-engine.mjs';
import { astToGiac, giacToAst, buildGiacCmd, splitGiacList } from './cas/giac-convert.mjs';
import {
  format as formatValue,
  formatReal, formatBinaryInteger, DEFAULT_DISPLAY,
} from './formatter.js';
import {
  state as _calcState,
  setAngle, toRadians, fromRadians,
  varStore, varRecall, varPurge, varOrder, reorderCurrentEntries,
  setLastError, clearLastError, getLastError, restoreLastError,
  goHome, goUp, enterDirectory, makeSubdir, currentPath,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase,
  setCoordMode,
  setDisplay,
  setTextbookMode,
  setApproxMode, getApproxMode,
  getComplexMode, toggleComplexMode,
  setUserFlag, clearUserFlag, testUserFlag, clearAllUserFlags,
  seedPrng, nextPrngUnit, nextPrngInt9,
  setLastFitModel, getLastFitModel,
  setHalted, getHalted, clearHalted, takeHalted,
  // clearAllHalted, haltedDepth, varList, goInto, getTextbookMode,
  // setComplexMode, getPrngSeed are all exported from state.js and
  // used directly by tests or other modules; no op handler calls them.
  setCasVx, getCasVx,
  // ADDTMOD / SUBTMOD / MULTMOD / POWMOD / MODSTO consult and mutate
  // the global CAS MODULO state slot via these helpers.
  setCasModulo, getCasModulo,
  // PROMPT op uses these to publish/clear the prompt banner.
  // getPromptMessage is exported from state.js for tests / UI subscribers.
  setPromptMessage, clearPromptMessage,
  getRealMaxExp, setRealMaxExp,
  REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX,
} from './state.js';
// Used by OBJ→ on String: re-parse the string as RPL source.  parser.js
// deliberately does not import ops.js, so this top-level import is safe.
import { parseEntry as _parseEntryForObjTo } from './parser.js';

/* ------------------------------------------------------------------
   Truthiness for conditionals.

   HP50 booleans are Reals: 0. is false, anything else is true.  We
   accept Integer and Complex as well (non-zero / non-origin is true).
   Any other type passed as a test is a user bug — throw.
   ------------------------------------------------------------------ */
function isTruthy(v) {
  if (isReal(v))    return !v.value.isZero();
  if (isInteger(v)) return v.value !== 0n;
  if (isComplex(v)) return v.re !== 0 || v.im !== 0;
  throw new RPLError('Bad argument type');
}

/** HP50 boolean literal: TRUE is Real(1), FALSE is Real(0). */
const TRUE  = Real(1);
const FALSE = Real(0);

const OPS = new Map();

export function register(name, fn, opts = {}) {
  const key = name.toUpperCase();
  OPS.set(key, { fn, ...opts });
  // Every registered op name is a reserved HP50 identifier: STO, CRDIR,
  // SVX, etc. all refuse to overwrite a built-in command name.  We
  // register both the as-given and uppercase forms (types.js re-adds
  // the uppercase form anyway — this keeps the two sources in sync).
  registerReservedName(name);
}

export function lookup(name) {
  return OPS.get(String(name).toUpperCase());
}

export function hasOp(name) {
  return OPS.has(String(name).toUpperCase());
}

export function allOps() {
  return [...OPS.keys()].sort();
}

/* ------------------------------------------------------------------
   Stack ops
   ------------------------------------------------------------------ */
register('DUP',   (s) => s.dup());
register('DROP',  (s) => s.drop());
register('SWAP',  (s) => s.swap());
register('OVER',  (s) => s.over());
register('ROT',   (s) => s.rot());
register('DUP2',  (s) => s.dup2());
register('DROP2', (s) => s.drop2());
register('CLEAR', (s) => s.clear());
register('DEPTH', (s) => s.push(Integer(s.depth)));

/* ------------------- multi-level UNDO / REDO -----------------------
   Multi-level UNDO/REDO backed by a history stack and a companion
   redo stack.

   Commands:
     `UNDO` / `LASTSTACK` — pop the most recent snapshot and restore.
     `REDO`               — re-apply the most recently undone step.

   `LASTSTACK` is kept as an alias so HP50 user programs that use the
   canonical name still work; its behavior is indistinguishable from
   single-level LASTSTACK until you press UNDO more than once.

   Note: `saveForUndo()` fires BEFORE the op runs inside `execOp`,
   which would make the named invocation a no-op (the snap pushes the
   current stack onto history right before s.undo() pops it back) and
   would skip the var-state half of the undo.  The HIST SHIFT-R keypad
   binding bypasses execOp and calls `e.performUndo()` directly, and
   `Entry.enter()` short-circuits a bare-name UNDO/REDO/LASTSTACK to
   the same path — so typed and pressed UNDO behave identically.  The
   registered ops below still exist so user programs can call them.
   -------------------------------------------------------------------- */
register('UNDO',      (s) => s.undo());
register('LASTSTACK', (s) => s.undo());
register('REDO',      (s) => s.redo());

register('PICK', (s) => {
  const n = s.pop();
  const k = Number(isInteger(n) ? n.value : toRealOrThrow(n));
  if (!Number.isInteger(k) || k < 1) throw new RPLError('Bad argument value');
  s.pick(k);
});

register('DROPN', (s) => {
  const n = s.pop();
  const k = Number(isInteger(n) ? n.value : toRealOrThrow(n));
  if (!Number.isInteger(k) || k < 0) throw new RPLError('Bad argument value');
  s.dropN(k);
});

/* ------------------------------------------------------------------
   Arithmetic — real + complex + integer promotion

   Every binary / unary numeric op lifts into the symbolic domain when
   a Symbolic or Name operand is present, producing a Symbolic result
   whose AST is assembled from the operator plus coerced operands.
   HP50 behavior: any op on at least one symbolic/name operand returns
   the symbolic form, e.g. `'X' 'Y' +` → `'X+Y'` and `'X' SIN` →
   `'SIN(X)'`.  Constants on the other side coerce to Num:
   `5 'X' +` → `'5+X'`.  This is what makes the keypad usable for
   algebra entry at all — without it every operator key would throw
   "Bad argument type" the instant a Name landed on the stack.
   ------------------------------------------------------------------ */

/** Return true if `v` is a value that forces the symbolic code path.
 *  Names (quoted or bare — a bare name only reaches an op when
 *  recalled without evaluation) and Symbolics count.  Numbers do NOT
 *  — they'd rather take the fast Real/Integer/Complex path, and are
 *  coerced to AST only when they land on the OTHER side of a symbolic
 *  operand. */
function _isSymOperand(v) {
  return isSymbolic(v) || isName(v);
}

/** Coerce an RPL value to an algebra-AST node.  Used to build the
 *  symbolic result when at least one operand forces the symbolic path
 *  (see _isSymOperand).  Complex is rejected — the algebra AST has
 *  no Complex kind yet, so `'X' (2,3) +` would need extension of the
 *  AST before it can work.  Returns null on unsupported types and the
 *  caller translates to "Bad argument type". */
function _toAst(v) {
  if (isSymbolic(v))   return v.expr;
  if (isName(v))       return AstVar(v.id);
  if (isInteger(v))    return AstNum(Number(v.value));
  if (isReal(v))       return AstNum(v.value.toNumber());
  // Rational lifts to Bin('/', Num(n), Num(d)) so the ratio survives
  // into the symbolic expression exactly (rather than being coerced
  // to a float leaf via Number(n)/Number(d)).  The algebra AST has
  // no num-ratio leaf today; the Bin form prints as `n/d`, routes
  // through the normal simplifier, and preserves exactness for
  // downstream ops like FACTOR/EXPAND/INTEG via Giac.  BigInts above
  // 2^53 lose precision through Number() — acceptable for classroom
  // inputs; a dedicated 'ratio' AST kind is future work.
  if (isRational(v)) {
    return AstBin('/', AstNum(Number(v.n)), AstNum(Number(v.d)));
  }
  return null;
}

/** Convert an AST subtree to a pushable RPL value.  Leaves unwrap
 *  (Num → Real, Var → quoted Name); everything else is rewrapped as
 *  a Symbolic so the call site can push it onto the stack like any
 *  other value. */
function _astToRplValue(ast) {
  if (!ast) return Name('', { quoted: true });
  if (ast.kind === 'num') return Real(ast.value);
  if (ast.kind === 'var') return Name(ast.name, { quoted: true });
  // `Neg(Num(v))` is the AST shape parseAlgebra emits for any negative
  // numeric literal — Giac's `caseval` returns negative integers and
  // negative decimals as `"-1"`, `"-3.14"`, etc., which round-trip
  // through `giacToAst` as a Neg-wrapped Num.  Unwrap so EGVL / EGV /
  // GREDUCE / FACTOR present a negative numeric eigenvalue or
  // remainder as a plain Real(-v) instead of a Symbolic with a
  // single-leaf negation node.  (Surfaced by GREDUCE's AUR worked
  // example which returns `-1`.)
  if (ast.kind === 'neg' && ast.arg && ast.arg.kind === 'num') {
    return Real(-ast.arg.value);
  }
  return Symbolic(ast);
}

/** Decompose a Symbolic value one level: return the sequence of
 *  values OBJ→ should push, with a trailing Integer count.
 *
 *  Layout (matches the OBJ→-on-Program shape: args then count):
 *    Num(v)          → [Real(v), 1]
 *    Var(n)          → [Name(n, quoted), 1]
 *    Neg(a)          → [<a>, Name('NEG', quoted), 2]
 *    Bin(op, l, r)   → [<l>, <r>, Name(op, quoted), 3]
 *    Fn(name, args)  → [<a1> … <aN>, Name(name, quoted), N+1]
 *
 *  Where `<x>` = `_astToRplValue(x)` — Num/Var leaves unwrap to
 *  Real/Name; non-leaf subtrees stay Symbolic so callers can recurse
 *  with OBJ→ again.  The leading count tells generic rebuild loops
 *  (→PRG-style) how many items to gather. */
function _symbolicDecompose(v) {
  const ast = v.expr;
  if (!ast) return [Integer(0n)];
  if (ast.kind === 'num') {
    return [Real(ast.value), Integer(1n)];
  }
  if (ast.kind === 'var') {
    return [Name(ast.name, { quoted: true }), Integer(1n)];
  }
  if (ast.kind === 'neg') {
    return [_astToRplValue(ast.arg), Name('NEG', { quoted: true }), Integer(2n)];
  }
  if (ast.kind === 'bin') {
    return [
      _astToRplValue(ast.l),
      _astToRplValue(ast.r),
      Name(ast.op, { quoted: true }),
      Integer(3n),
    ];
  }
  if (ast.kind === 'fn') {
    const out = ast.args.map(_astToRplValue);
    out.push(Name(ast.name, { quoted: true }));
    out.push(Integer(BigInt(ast.args.length + 1)));
    return out;
  }
  // Unknown AST node — preserve the original Symbolic and emit a
  // count of 1 so callers don't lose the value.
  return [v, Integer(1n)];
}

/** Scalar ∘ Scalar: returns the result value directly.  Extracted
 *  from binaryMath so Vector/Matrix branches can apply the op
 *  element-wise without going through a temp stack. */
/** Coerce a numeric (Real or Integer) to a plain JS number.
 *  Throws if `v` isn't a plain numeric — the unit paths never mix Complex
 *  operands (HP50 doesn't allow complex-valued units either). */
function _numVal(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}

/** Wrap a Unit result: if the accumulated uexpr is empty (dimensionless),
 *  unwrap to a plain Real — matches how `_m / _m` simplifies to a number. */
function _makeUnit(value, uexpr) {
  return uexpr.length === 0 ? Real(value) : Unit(value, uexpr);
}

/** Binary arithmetic when at least one side is a Unit.
 *  +/-: dims must match; result inherits the left operand's uexpr
 *       (its scale too, so `1_km + 500_m` stays in km).
 *  *, /: combine uexprs; a plain number broadcasts as dimensionless.
 *  ^:   exponent must be a plain integer; scales each factor's exponent. */
function _unitBinary(op, a, b) {
  if (op === '+' || op === '-') {
    if (!isUnit(a) || !isUnit(b)) throw new RPLError('Bad argument type');
    if (!sameDims(a.uexpr, b.uexpr)) throw new RPLError('Inconsistent units');
    const inA = b.value * scaleOf(b.uexpr) / scaleOf(a.uexpr);
    const val = op === '+' ? a.value + inA : a.value - inA;
    return _makeUnit(val, a.uexpr);
  }
  if (op === '*') {
    if (isUnit(a) && isUnit(b)) return _makeUnit(a.value * b.value, multiplyUexpr(a.uexpr, b.uexpr));
    if (isUnit(a)) return _makeUnit(a.value * _numVal(b), a.uexpr);
    return _makeUnit(_numVal(a) * b.value, b.uexpr);
  }
  if (op === '/') {
    if (isUnit(a) && isUnit(b)) {
      if (b.value === 0) throw new RPLError('Infinite result');
      return _makeUnit(a.value / b.value, divideUexpr(a.uexpr, b.uexpr));
    }
    if (isUnit(a)) {
      const bv = _numVal(b);
      if (bv === 0) throw new RPLError('Infinite result');
      return _makeUnit(a.value / bv, a.uexpr);
    }
    if (b.value === 0) throw new RPLError('Infinite result');
    return _makeUnit(_numVal(a) / b.value, inverseUexpr(b.uexpr));
  }
  if (op === '^') {
    if (!isUnit(a)) throw new RPLError('Bad argument type');
    // Exponent must be an integer — fractional powers would introduce
    // non-integer exponents in the uexpr, which the catalog-backed
    // dimensional algebra doesn't model.
    const n = isInteger(b) ? Number(b.value)
            : isReal(b)    ? b.value.toNumber()
            : NaN;
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new RPLError('Bad argument value');
    }
    return _makeUnit(Math.pow(a.value, n), powerUexpr(a.uexpr, n));
  }
  throw new RPLError('Bad argument type');
}

function _scalarBinary(op, a, b) {
  if (isBinaryInteger(a) && isBinaryInteger(b)) return binIntBinary(op, a, b);
  if (isBinaryInteger(a) || isBinaryInteger(b)) {
    throw new RPLError('Bad argument type');
  }
  if (isUnit(a) || isUnit(b)) return _unitBinary(op, a, b);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a);
    const r = _toAst(b);
    if (l && r) return Symbolic(AstBin(op, l, r));
    throw new RPLError('Bad argument type');
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  const p = promoteNumericPair(a, b);
  if (p.kind === 'complex') {
    const r = complexBinary(op, p.a, p.b);
    return Complex(r.re, r.im);
  }
  if (p.kind === 'integer') {
    // Integer / Integer that doesn't divide evenly promotes to Rational
    // in EXACT mode, or to Real in APPROX.  Integer division that IS
    // exact stays Integer.  All other ops stay on the BigInt path.
    if (op === '/' && p.b !== 0n && p.a % p.b !== 0n) {
      if (getApproxMode()) {
        // Big integer → Decimal via string so precision isn't capped by
        // IEEE-754's 53-bit mantissa.  Division then rounds at 15 digits.
        const da = new Decimal(p.a.toString());
        const db = new Decimal(p.b.toString());
        return Real(da.div(db));
      }
      return Rational(p.a, p.b);
    }
    const r = integerBinary(op, p.a, p.b);
    return (typeof r === 'bigint') ? Integer(r) : Real(r);
  }
  if (p.kind === 'rational') {
    // In APPROX mode, collapse both operands to Real before arithmetic —
    // the flag says "give me decimals", and a Rational result would
    // contradict that.  In EXACT mode, arithmetic stays exact.
    if (getApproxMode()) {
      // Route through Decimal rather than Number() to keep 15-digit
      // precision across the rational → decimal collapse.  A
      // "big-numerator / big-denominator" Rational that can't round-
      // trip through IEEE-754 (e.g. a factorial ratio) still lands
      // cleanly in Decimal space.
      const ra = new Decimal(p.a.n.toString()).div(new Decimal(p.a.d.toString()));
      const rb = new Decimal(p.b.n.toString()).div(new Decimal(p.b.d.toString()));
      return Real(realBinary(op, ra, rb));
    }
    return _rationalBinary(op, p.a, p.b);
  }
  return Real(realBinary(op, p.a, p.b));
}

/* -------------------------------------------------------------
   Rational arithmetic via Fraction.js.

   Inputs `a` and `b` are { n: BigInt, d: BigInt } pairs produced by
   `toRationalPair` (Integers widen to { n, d:1n } before we get here).
   We hand them straight to Fraction.js and let it do the heavy lifting
   — GCD reduction, sign canonicalisation, arbitrary-precision
   arithmetic.  No fallback path: a Fraction.js runtime error
   (division by zero, bad input) propagates untouched.

   Result shaping:
     • a/b with b.d === 1n → emit Integer when the answer is integral,
       Rational otherwise.  Matches HP50 stack aesthetics: `4 2 /` →
       Integer(2), `1 3 /` → Rational(1/3).
     • `^` with non-integer exponent drops to Real (Fraction.js pow
       rejects irrational exponents, so we convert eagerly).
   ------------------------------------------------------------- */
function _rationalBinary(op, a, b) {
  const fa = new Fraction(a.n, a.d);
  const fb = new Fraction(b.n, b.d);
  let r;
  switch (op) {
    case '+': r = fa.add(fb); break;
    case '-': r = fa.sub(fb); break;
    case '*': r = fa.mul(fb); break;
    case '/': r = fa.div(fb); break;
    case '^': {
      // Fraction.pow only supports rational exponents whose denominator
      // is 1 (integer exponent) or whose result is representable as a
      // fraction.  For non-integer exponents: in APPROX mode we drop
      // to Real; in EXACT mode we lift to a Symbolic(base ^ exp) so the
      // irrational stays exact — `2 ^ (1/3)` leaves `2^(1/3)` on the
      // stack rather than 1.2599….  Integer exponents always stay exact.
      if (fb.d === 1n) { r = fa.pow(fb); break; }
      if (!getApproxMode()) {
        const signedBaseN = fa.s * fa.n;
        const signedExpN = fb.s * fb.n;
        const baseAst = a.d === 1n
          ? AstNum(Number(signedBaseN))
          : AstBin('/', AstNum(Number(signedBaseN)), AstNum(Number(fa.d)));
        const expAst = AstBin('/', AstNum(Number(signedExpN)), AstNum(Number(fb.d)));
        return Symbolic(AstBin('^', baseAst, expAst));
      }
      return Real(Math.pow(Number(fa.s * fa.n) / Number(fa.d),
                           Number(fb.s * fb.n) / Number(fb.d)));
    }
    default: throw new RPLError('Bad argument type');
  }
  const signedN = r.s * r.n;
  if (r.d === 1n) return Integer(signedN);
  return Rational(signedN, r.d);
}

/** Types that broadcast as a scalar across a Vector/Matrix. */
function _isScalarOperand(v) {
  return isNumber(v) || isBinaryInteger(v) || _isSymOperand(v);
}

/* ---- List distribution (HP50 AUR §12.3) ----
   Most scalar-domain commands distribute element-wise when given a
   List.  Rules:
     Unary:          {1 4 9} SQRT            → {1 2 3}
     List ∘ scalar:  {1 2 3} 2 *             → {2 4 6}
     Scalar ∘ list:  2 {1 2 3} *             → {2 4 6}
     List ∘ list:    {1 2 3} {10 20 30} *    → {10 40 90}  (same len)
     Nested:         {1 {2 3}} SIN           → {SIN(1) {SIN(2) SIN(3)}}

   `+` is the canonical exception: HP50 AUR §3-7 specifies *concatenation*
   semantics for list addition — `{1 2 3} 4 +` → `{1 2 3 4}`, `{1 2}
   {3 4} +` → `{1 2 3 4}` — and the bare `+` registration short-circuits
   list operands to that path before the generic `binaryMath` distributor
   ever runs.  Element-wise list addition is reserved for ADD / DOLIST.

   Wrapping a handler with `_withListUnary` / `_withListBinary` is the
   one integration point — at the leaves, the original handler sees a
   non-list operand and does its full scalar/vector/matrix dispatch.
   List-aware commands that treat the list as a whole (SIZE, HEAD,
   STO, PURGE, aggregate reducers) are wired directly and NOT wrapped.
   -------------------------------------------------------------------- */
function _withListUnary(handler) {
  const apply = (s, item) => {
    if (isList(item)) return RList(item.items.map(e => apply(s, e)));
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1 && isList(s.peek())) {
      const v = s.pop();
      s.push(apply(s, v));
      return;
    }
    // Equation dispatch: apply the op to both sides independently.
    //   f('X=Y') → 'f(X)=f(Y)'
    if (s.depth >= 1) {
      const top = s.peek();
      if (isSymbolic(top) && top.expr.kind === 'bin' && top.expr.op === '=') {
        s.pop();
        s.push(Symbolic(top.expr.l));
        handler(s);
        const lResult = s.pop();
        s.push(Symbolic(top.expr.r));
        handler(s);
        const rResult = s.pop();
        const lAst = _toAst(lResult);
        const rAst = _toAst(rResult);
        if (!lAst || !rAst) throw new RPLError('Bad argument type');
        s.push(Symbolic(AstBin('=', lAst, rAst)));
        return;
      }
    }
    handler(s);
  };
}

function _withListBinary(handler) {
  const apply = (s, a, b) => {
    if (isList(a) && isList(b)) {
      if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
      return RList(a.items.map((x, i) => apply(s, x, b.items[i])));
    }
    if (isList(a)) return RList(a.items.map(x => apply(s, x, b)));
    if (isList(b)) return RList(b.items.map(x => apply(s, a, x)));
    s.push(a); s.push(b);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 2 && (isList(s.peek(1)) || isList(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(apply(s, a, b));
      return;
    }
    handler(s);
  };
}

/* ---- Tagged transparency (HP50 AUR §3.4) ----
   A Tagged object (e.g. `Price:42.50`) is a label + value pair.  For
   numeric / symbolic operations HP50 unwraps the tag, applies the op
   to the underlying value, and in the unary case re-tags the result
   with the same label.  For binary ops the tag is dropped — when both
   sides carry tags there isn't a single obvious label to keep.

   Wrapping a handler with `_withTaggedUnary` / `_withTaggedBinary` is
   the one integration point — the inner handler sees a plain value on
   the stack and does its normal scalar/vector/matrix dispatch. */
function _withTaggedUnary(handler) {
  return (s) => {
    if (s.depth >= 1 && isTagged(s.peek())) {
      const t = s.pop();
      s.push(t.value);
      handler(s);
      const r = s.pop();
      s.push(Tagged(t.tag, r));
      return;
    }
    handler(s);
  };
}

function _withTaggedBinary(handler) {
  return (s) => {
    if (s.depth >= 2 && (isTagged(s.peek(1)) || isTagged(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(isTagged(a) ? a.value : a);
      s.push(isTagged(b) ? b.value : b);
      handler(s);
      return;  // binary drops the tag
    }
    handler(s);
  };
}

/* ---- Vector / Matrix element-wise unary dispatch ----
   For unary numeric ops whose Vector/Matrix semantics are simply
   "apply f to every element", wrapping with `_withVMUnary` adds that
   coverage with no per-op duplication.  At a leaf scalar the inner
   handler runs unchanged (it does its own R/Z/C/Sy dispatch).

   Ops with bespoke V/M semantics (ABS = Frobenius, SIGN/V = unit
   direction, INV/M = matrix inverse, SQ/M = M·M, …) bypass this
   wrapper and keep their hand-written branch — the wrapper only
   activates when the top is a Vector or Matrix value.

   Implementation note: we re-use the temp-stack pattern from
   `_withListUnary`, so the inner handler can throw and the wrapper
   propagates the error untouched (matches list / tagged behavior).
   */
function _withVMUnary(handler) {
  const apply = (s, item) => {
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1) {
      const top = s.peek();
      if (isVector(top)) {
        const v = s.pop();
        s.push(Vector(v.items.map(x => apply(s, x))));
        return;
      }
      if (isMatrix(top)) {
        const m = s.pop();
        s.push(Matrix(m.rows.map(row => row.map(x => apply(s, x)))));
        return;
      }
    }
    handler(s);
  };
}

/** Sum scalars with `+`.  Empty → Real(0). */
function _scalarSum(parts) {
  if (parts.length === 0) return Real(0);
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) acc = _scalarBinary('+', acc, parts[i]);
  return acc;
}

function binaryMath(op) {
  return _withListBinary((s) => {
    const [a, b] = s.popN(2);                   // level2, level1

    // Vector ∘ Vector: element-wise for +/- (same length), dot
    // product for * (matches HP50 `V V *`).
    if (isVector(a) && isVector(b)) {
      if (op === '+' || op === '-') {
        if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
        s.push(Vector(a.items.map((x, i) => _scalarBinary(op, x, b.items[i]))));
        return;
      }
      if (op === '*') {
        if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
        const parts = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
        s.push(_scalarSum(parts));
        return;
      }
      throw new RPLError('Bad argument type');
    }

    // Matrix ∘ Matrix: element-wise +/-, standard * (m×n · n×p).
    if (isMatrix(a) && isMatrix(b)) {
      const ar = a.rows.length, ac = a.rows[0]?.length ?? 0;
      const br = b.rows.length, bc = b.rows[0]?.length ?? 0;
      if (op === '+' || op === '-') {
        if (ar !== br || ac !== bc) throw new RPLError('Invalid dimension');
        s.push(Matrix(a.rows.map((row, i) =>
          row.map((x, j) => _scalarBinary(op, x, b.rows[i][j])))));
        return;
      }
      if (op === '*') {
        if (ac !== br) throw new RPLError('Invalid dimension');
        const out = [];
        for (let i = 0; i < ar; i++) {
          const row = new Array(bc);
          for (let j = 0; j < bc; j++) {
            const parts = new Array(ac);
            for (let k = 0; k < ac; k++) {
              parts[k] = _scalarBinary('*', a.rows[i][k], b.rows[k][j]);
            }
            row[j] = _scalarSum(parts);
          }
          out.push(row);
        }
        s.push(Matrix(out));
        return;
      }
      throw new RPLError('Bad argument type');
    }

    // Matrix * Vector (column) and Vector * Matrix (row).
    if (isMatrix(a) && isVector(b) && op === '*') {
      const cols = a.rows[0]?.length ?? 0;
      if (cols !== b.items.length) throw new RPLError('Invalid dimension');
      s.push(Vector(a.rows.map(row => {
        const parts = row.map((x, k) => _scalarBinary('*', x, b.items[k]));
        return _scalarSum(parts);
      })));
      return;
    }
    if (isVector(a) && isMatrix(b) && op === '*') {
      const rows = b.rows.length, cols = b.rows[0]?.length ?? 0;
      if (a.items.length !== rows) throw new RPLError('Invalid dimension');
      const out = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const parts = new Array(rows);
        for (let i = 0; i < rows; i++) {
          parts[i] = _scalarBinary('*', a.items[i], b.rows[i][j]);
        }
        out[j] = _scalarSum(parts);
      }
      s.push(Vector(out));
      return;
    }

    // Scalar ∘ Vector / Matrix: broadcast the op across every element.
    if (isVector(a) && _isScalarOperand(b)) {
      s.push(Vector(a.items.map(x => _scalarBinary(op, x, b))));
      return;
    }
    if (_isScalarOperand(a) && isVector(b)) {
      s.push(Vector(b.items.map(x => _scalarBinary(op, a, x))));
      return;
    }
    if (isMatrix(a) && _isScalarOperand(b)) {
      s.push(Matrix(a.rows.map(row => row.map(x => _scalarBinary(op, x, b)))));
      return;
    }
    if (_isScalarOperand(a) && isMatrix(b)) {
      s.push(Matrix(b.rows.map(row => row.map(x => _scalarBinary(op, a, x)))));
      return;
    }

    // Any remaining Vector/Matrix mix (e.g. Vector / Matrix) is an
    // unsupported shape pair — report clearly rather than falling
    // into the scalar path with the same generic error.
    if (isVector(a) || isVector(b) || isMatrix(a) || isMatrix(b)) {
      throw new RPLError('Bad argument type');
    }

    // Equation arithmetic: apply the op to both sides of the equation.
    //   equation ∘ non-equation → (L ∘ b) = (R ∘ b)
    //   non-equation ∘ equation → (a ∘ L) = (a ∘ R)
    //   equation ∘ equation     → (La ∘ Lb) = (Ra ∘ Rb)
    {
      const aIsEq = isSymbolic(a) && a.expr.kind === 'bin' && a.expr.op === '=';
      const bIsEq = isSymbolic(b) && b.expr.kind === 'bin' && b.expr.op === '=';
      if (aIsEq || bIsEq) {
        if (aIsEq && bIsEq) {
          s.push(Symbolic(AstBin('=',
            AstBin(op, a.expr.l, b.expr.l),
            AstBin(op, a.expr.r, b.expr.r)
          )));
        } else if (aIsEq) {
          const rhs = _toAst(b);
          if (!rhs) throw new RPLError('Bad argument type');
          s.push(Symbolic(AstBin('=',
            AstBin(op, a.expr.l, rhs),
            AstBin(op, a.expr.r, rhs)
          )));
        } else {
          const lhs = _toAst(a);
          if (!lhs) throw new RPLError('Bad argument type');
          s.push(Symbolic(AstBin('=',
            AstBin(op, lhs, b.expr.l),
            AstBin(op, lhs, b.expr.r)
          )));
        }
        return;
      }
    }

    s.push(_scalarBinary(op, a, b));
  });
}

/* ------------------------------------------------------------------
   Binary integer arithmetic.

   HP50 rules:
     * Both operands must be BinaryIntegers (no implicit coercion from
       Real/Integer) — mixed arguments give "Bad argument type".
     * The LEFT operand's base wins.  `#FFh #1d +` → `#100h`, not `#256d`.
     * Every result is masked to the current wordsize (STWS).  With
       ws=16, `#FFFFh #1h +` → `#0h` (wrap), and `#10000h` can't even
       exist as a literal — it truncates.
     * Division is BigInt truncated division.  `#7h #2h /` → `#3h`.
     * Division by zero throws 'Division by zero' — the integer-family
       error (HP50 0x303), distinct from 'Infinite result' (0x305) that
       fires for Real /0 (where IEEE-754 would yield ±Infinity).
       BinInts follow the integer/BinInt error family; Reals follow
       the floating-point family.
     * Pow (^) is wordsize-masked modular exponentiation.

   Also used by the AND/OR/XOR bitwise path; those have their own
   register-site below but share this module's helpers.
   ------------------------------------------------------------------ */

/** Mask a BigInt to the current wordsize's low bits. */
function _mask() { return getWordsizeMask(); }

function binIntBinary(op, a, b) {
  const m = _mask();
  const av = a.value & m;
  const bv = b.value & m;
  let r;
  switch (op) {
    case '+': r = av + bv; break;
    case '-': r = av - bv; break;
    case '*': r = av * bv; break;
    case '/':
      if (bv === 0n) throw new RPLError('Division by zero');
      r = av / bv;
      break;
    case '^':
      // Modular exponentiation, ws-wide.  Negative exponents aren't a
      // thing for BinInts (unsigned) — treat as 0 to match HP50.
      r = _modPow(av, bv, m + 1n);
      break;
    default:
      throw new RPLError('Unknown op ' + op);
  }
  return BinaryInteger(r & m, a.base);
}

/** x^e mod n via square-and-multiply (BigInt).  n must be > 0.  Used
 *  only by binIntBinary('^') — keeps exponentiation O(log e) bits and
 *  never builds an intermediate 2^64-bit number. */
function _modPow(x, e, n) {
  if (n === 1n) return 0n;
  let result = 1n;
  let base = x % n;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % n;
    exp >>= 1n;
    base = (base * base) % n;
  }
  return result;
}

/* -------------------------------------------------------------
   Real × Real arithmetic via decimal.js.

   The Real stack payload is a Decimal instance (see types.js).
   `realBinary` takes the two Decimal payloads straight from
   `promoteNumericPair` and returns a Decimal; the caller wraps it
   with `Real(...)` which stores the Decimal directly.

   Why keep it in Decimal end-to-end?  A chain like `1 3 / 3 *` rounds
   to 12 digits on the HP50 (`0.999999999999`) — storing the Decimal
   lets us reproduce that exactly.  Round-tripping through `.toNumber()`
   at every op injects the IEEE-754 representation of the intermediate
   (`0.333333333333333148…`), which then compounds across further ops.

   Division-by-zero stays explicit: throw 'Infinite result'.  Decimal
   would otherwise return `Infinity`; the explicit throw gives callers
   and tests a stable error message instead of a sentinel value.

   No fallback: any other Decimal error propagates untouched.
   ------------------------------------------------------------- */
function realBinary(op, a, b) {
  if (op === '/' && b.isZero()) throw new RPLError('Infinite result');
  switch (op) {
    case '+': return a.plus(b);
    case '-': return a.minus(b);
    case '*': return a.times(b);
    case '/': return a.div(b);
    case '^': return Decimal.pow(a, b);
  }
  throw new RPLError('Unknown op ' + op);
}

function integerBinary(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0n) throw new RPLError('Infinite result');
      // If it divides evenly, keep Integer; else return a float.
      if (a % b === 0n) return a / b;
      return Number(a) / Number(b);
    case '^':
      if (b < 0n) return Math.pow(Number(a), Number(b));
      return a ** b;
  }
  throw new RPLError('Unknown op ' + op);
}

/* -------------------------------------------------------------
   Complex × Complex arithmetic via complex.js.

   Inputs `a` and `b` are plain `{ re, im }` pairs (our internal
   shape matches complex.js's expected input exactly — `new Complex$(a)`
   parses the object directly).  We marshal into Complex$ instances,
   dispatch the op, then extract `.re` / `.im` back out.

   What complex.js buys over the hand-rolled version:
     • `i * i === -1` stays exactly -1 (identity preserved through
       the library's multiplication kernel rather than surviving as
       a floating-point accident).
     • `^` uses complex.js's polar-form pow, which handles both
       integer and fractional exponents correctly and applies the
       principal branch at negative reals.
     • Division-by-zero is caught explicitly so we keep our
       existing 'Infinite result' RPLError instead of complex.js's
       returned `Infinity + Infinity·i`.

   No fallback: a complex.js error propagates.  Per the
   no-fallback-for-numeric-libs rule.
   ------------------------------------------------------------- */
function complexBinary(op, a, b) {
  // Division-by-zero guard stays explicit: complex.js would return
  // Complex.INFINITY, but we raise an RPLError to match the numeric
  // binary path's `'Infinite result'` message.
  if (op === '/' && b.re === 0 && b.im === 0) {
    throw new RPLError('Infinite result');
  }
  const ca = new Complex$(a);
  const cb = new Complex$(b);
  let r;
  switch (op) {
    case '+': r = ca.add(cb); break;
    case '-': r = ca.sub(cb); break;
    case '*': r = ca.mul(cb); break;
    case '/': r = ca.div(cb); break;
    case '^': r = ca.pow(cb); break;
    default: throw new RPLError('Unknown op ' + op);
  }
  return { re: r.re, im: r.im };
}

/** When either operand of `+` is a String, the result is a concatenation
 *  of the two operands' display forms.  Matches HP50 behaviour:
 *    "ABC" "DEF" +  →  "ABCDEF"
 *    "ABC" 123   +  →  "ABC123"
 *    123   "ABC" +  →  "123ABC"
 *    "ABC" 'X'   +  →  "ABCX"        (Name renders without ticks here —
 *                                      in-string context)
 *  Non-string `+` keeps the numeric/symbolic dispatch in binaryMath. */
function _stringCoerce(v) {
  if (isString(v))  return v.value;
  if (isInteger(v)) return v.value.toString();
  if (isReal(v)) {
    // Use STD formatting so the representation matches what the user sees
    // on the stack — avoids surprise from JS default toString on floats.
    return formatReal(v.value, DEFAULT_DISPLAY);
  }
  if (isBinaryInteger(v)) return formatBinaryInteger(v);
  if (isComplex(v)) return `(${formatReal(v.re, DEFAULT_DISPLAY)}, ${formatReal(v.im, DEFAULT_DISPLAY)})`;
  if (isName(v))    return v.id;
  if (isSymbolic(v)) return formatAlgebra(v.expr);
  return null;
}
// Arithmetic +, -, *, /, ^ are registered later in this file via
// `_withTaggedBinary(_binaryMathMixed(op))` — that pass is the single
// source of truth for scalar arithmetic dispatch (Tagged, BinInt×Real
// mixing, String-concat on `+`).  The second-pass still calls
// `binaryMath('+')(s)` as the generic numeric fallback inside the `+`
// handler, so `binaryMath` itself is live.

/* -------------------- unary ops --------------------
   Each numeric unary op checks for a symbolic operand (Symbolic or
   Name) first and emits a Symbolic(AST) wrapping the operator; other-
   wise it dispatches on Real/Integer/Complex as before.  ABS is
   intentionally LEFT numeric-only for now (HP50's symbolic ABS is a
   stub that shows 'ABS(X)' but we don't represent an ABS AST node;
   adding one is straightforward once users ask for it).
   ---------------------------------------------------------------- */
/* NEG has Tagged transparency.  The unary wrapper unwraps the tag,
   applies NEG, and re-tags with the same label ("reactive:-x" stays
   "reactive:-x"-shaped).  List and V/M branches in the inner handler
   run unchanged. */
register('NEG', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstNeg(_toAst(v)))); return; }
  if (isReal(v))     s.push(Real(v.value.neg()));
  else if (isInteger(v)) s.push(Integer(-v.value));
  else if (isRational(v)) {
    // APPROX mode collapses to Real (flag says "decimals"); EXACT stays
    // exact — negate the numerator only.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString())).neg();
      s.push(Real(r));
    }
    else s.push(Rational(-v.n, v.d));
  }
  else if (isComplex(v)) s.push(Complex(-v.re, -v.im));
  else if (isUnit(v))    s.push(Unit(-v.value, v.uexpr));
  else if (isVector(v))  s.push(Vector(v.items.map(x => _scalarBinary('-', Real(0), x))));
  else if (isMatrix(v))  s.push(Matrix(v.rows.map(row => row.map(x => _scalarBinary('-', Real(0), x)))));
  else throw new RPLError('Bad argument type');
})));

/* INV has Tagged + List transparency.  V/M is NOT element-wise for
   INV — a Matrix here means "compute the matrix inverse", not "invert
   each element".  Tagged wraps outside List so `Tagged('M', RList(…))`
   and `Tagged('M', Matrix(…))` both retag the result. */
register('INV', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  {
    s.push(Symbolic(AstBin('/', AstNum(1), _toAst(v))));
    return;
  }
  if (isReal(v)) {
    if (v.value.isZero()) throw new RPLError('Infinite result');
    s.push(Real(new Decimal(1).div(v.value)));
  } else if (isInteger(v)) {
    if (v.value === 0n) throw new RPLError('Infinite result');
    // 1/n: exact Rational in EXACT mode, Real in APPROX mode.
    // Special case ±1 → ±1 (stay Integer); otherwise 1/n is a proper
    // fraction.
    if (getApproxMode()) s.push(Real(1 / Number(v.value)));
    else if (v.value === 1n || v.value === -1n) s.push(Integer(v.value));
    else s.push(Rational(1n, v.value));
  } else if (isRational(v)) {
    if (v.n === 0n) throw new RPLError('Infinite result');
    // (a/b)^-1 = b/a.  APPROX collapses to Real.  In EXACT, if |a|==1
    // the result is integer-valued (d=1) so we emit Integer instead of
    // Rational(k, 1) for display cleanliness.
    if (getApproxMode()) s.push(Real(Number(v.d) / Number(v.n)));
    else if (v.n === 1n)  s.push(Integer(v.d));
    else if (v.n === -1n) s.push(Integer(-v.d));
    else                  s.push(Rational(v.d, v.n));
  } else if (isComplex(v)) {
    const d = v.re * v.re + v.im * v.im;
    if (d === 0) throw new RPLError('Infinite result');
    s.push(Complex(v.re / d, -v.im / d));
  } else if (isUnit(v)) {
    if (v.value === 0) throw new RPLError('Infinite result');
    s.push(_makeUnit(1 / v.value, inverseUexpr(v.uexpr)));
  } else if (isMatrix(v)) {
    // Matrix inverse.  Requires square + numeric entries.
    // Non-square throws 'Invalid dimension'; singular throws 'Infinite
    // result' (matches scalar INV's division-by-zero error).  See
    // _invMatrixNumeric below.
    const n = v.rows.length;
    const cols = n > 0 ? v.rows[0].length : 0;
    if (n !== cols) throw new RPLError('Invalid dimension');
    if (n === 0) { s.push(v); return; }
    s.push(Matrix(_invMatrixNumeric(v.rows)));
  } else throw new RPLError('Bad argument type');
})));

/** Frobenius norm of a flat iterable of RPL numeric values (Real or Integer)
 *  using Decimal arithmetic throughout so large-exponent vectors work. */
function _decimalFrobeniusNorm(items) {
  let sum = new Decimal(0);
  for (const x of items) {
    const d = isReal(x) ? x.value : new Decimal(x.value.toString());
    sum = sum.plus(d.times(d));
  }
  return sum.sqrt();
}

/* ABS has Tagged transparency.  The inner V/M branches compute the
   Frobenius norm (a scalar); the re-tag then wraps that scalar, e.g.
   `v:[3 4] ABS` → `v:5`. */
register('ABS', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('ABS', [_toAst(v)]))); return; }
  if (isReal(v))    s.push(Real(v.value.abs()));
  else if (isInteger(v)) s.push(Integer(v.value < 0n ? -v.value : v.value));
  else if (isRational(v)) {
    // |a/b| = |a|/b (d is always positive by Rational invariant).
    // APPROX collapses to Real.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString())).abs();
      s.push(Real(r));
    }
    else s.push(Rational(v.n < 0n ? -v.n : v.n, v.d));
  }
  else if (isComplex(v)) s.push(Real(Math.hypot(v.re, v.im)));
  else if (isUnit(v))    s.push(Unit(Math.abs(v.value), v.uexpr));
  else if (isVector(v)) {
    // HP50 Advanced Guide: ABS on an array returns the Frobenius
    // (Euclidean) norm — identical behavior to NORM.  Use Decimal
    // arithmetic so large-exponent components don't saturate to Infinity.
    s.push(Real(_decimalFrobeniusNorm(v.items)));
  } else if (isMatrix(v)) {
    s.push(Real(_decimalFrobeniusNorm(v.rows.flat())));
  } else throw new RPLError('Bad argument type');
})));

/* SQ has Tagged transparency.  V/M is NOT wrapped — HP50 SQ on a
   Vector is `V · V` (dot product, scalar) and on a Matrix is `M · M`
   (matmul), both handled by the `*` op; an element-wise wrapper here
   would silently break that semantic. */
register('SQ', _withTaggedUnary(_withListUnary((s) => {             // ^2
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstBin('^', _toAst(v), AstNum(2)))); return; }
  if (isReal(v))    s.push(Real(v.value.times(v.value)));
  else if (isInteger(v)) s.push(Integer(v.value * v.value));
  else if (isRational(v)) {
    // (a/b)^2 = a^2/b^2 — gcd is still 1 (squaring preserves coprime).
    // Collapse to Real in APPROX; otherwise keep exact.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
      s.push(Real(r.times(r)));
    } else s.push(Rational(v.n * v.n, v.d * v.d));
  }
  else if (isComplex(v)) s.push(Complex(
    v.re * v.re - v.im * v.im,
    2 * v.re * v.im,
  ));
  else if (isUnit(v)) s.push(Unit(v.value * v.value, powerUexpr(v.uexpr, 2)));
  else throw new RPLError('Bad argument type');
})));

// SQRT has Tagged transparency and Vector/Matrix element-wise
// dispatch.  Element-wise on Vector/Matrix is the HP50 behavior —
// there's no whole-array SQRT (matrix square root is a SCHUR-style
// decomposition the calculator doesn't expose).
register('SQRT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('SQRT', [_toAst(v)]))); return; }
  if (isComplex(v) || (isReal(v) && v.value.isNegative()) ||
      (isInteger(v) && v.value < 0n) ||
      (isRational(v) && v.n < 0n)) {
    const c = toComplex(v);
    const r = Math.hypot(c.re, c.im);
    const re = Math.sqrt((r + c.re) / 2);
    const im = Math.sign(c.im || 1) * Math.sqrt((r - c.re) / 2);
    s.push(Complex(re, im));
  } else if (isRational(v) && !getApproxMode()) {
    // EXACT mode, non-negative Rational: attempt exact square-root.
    // Both numerator and denominator must be perfect squares — then
    // SQRT(a/b) = √a/√b stays a Rational (collapse to Integer when
    // d=1).  Otherwise lift to Symbolic(SQRT(a/b)) to preserve
    // exactness — pressing →NUM later folds to the decimal.
    const sn = _bigIntIsqrt(v.n);
    const sd = _bigIntIsqrt(v.d);
    if (sn !== null && sd !== null) {
      if (sd === 1n) s.push(Integer(sn));
      else           s.push(Rational(sn, sd));
    } else s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else if (isInteger(v) && !getApproxMode()) {
    // EXACT mode, non-negative Integer: exact sqrt if perfect square,
    // else lift to Symbolic(SQRT(n)) so the irrational stays symbolic
    // (HP50 flag -105 CLEAR semantics — press →NUM to decimate).
    const sn = _bigIntIsqrt(v.value);
    if (sn !== null) s.push(Integer(sn));
    else             s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else {
    // Use Decimal.sqrt() so values with |exp| > 308 work correctly.
    const d = isReal(v) ? v.value : new Decimal(isInteger(v) ? v.value.toString() : toRealOrThrow(v));
    if (d.isNegative()) throw new RPLError('Bad argument value');
    s.push(Real(d.sqrt()));
  }
}))));

/**
 * Integer square root for non-negative BigInt.  Returns the exact
 * BigInt sqrt if `n` is a perfect square, otherwise `null`.  Used by
 * SQRT's Rational fast-path to keep exactness when both numerator and
 * denominator are perfect squares (e.g. SQRT(4/9) → 2/3).
 *
 * Algorithm: Newton's method on BigInt.  Fast enough for any Rational
 * the user is realistically going to stack — we're not going to sqrt
 * a 10000-digit rational without a CAS anyway.
 */
function _bigIntIsqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  // Initial guess: 2^(ceil(bitlen/2))
  let x = 1n;
  const bits = n.toString(2).length;
  x <<= BigInt((bits + 1) >> 1);
  // Newton iteration.
  let prev;
  do {
    prev = x;
    x = (x + n / x) >> 1n;
  } while (x < prev);
  // prev is floor(sqrt(n)); check perfect-square.
  return prev * prev === n ? prev : null;
}

/* -------------------- unary real helpers --------------------
   `unaryReal(name, fn)` builds an op that evaluates fn(x) on a
   Real/Integer operand.  With a Symbolic/Name operand it emits
   `Symbolic(Fn(NAME, [ast]))` instead — this is what keeps LN/EXP/
   LOG/ALOG/SINH/… usable inside symbolic workflows.  The first
   argument is the canonical op NAME used in the AST (and thus shown
   on the LCD); old call sites that passed a bare fn still work —
   they get UPPER-cased `fn.name` or a fallback of 'FN'.
   ---------------------------------------------------------------- */
/* EXACT-mode lift for unary transcendentals.
   `LN(2)` / `SIN(30)` / `EXP(1)` with an Integer or Rational input in
   EXACT mode stays symbolic — the HP50 rule is "don't throw away
   exactness for a 15-digit decimal."  If the naive numeric evaluation
   happens to collapse to an integer (e.g. `LN(1)=0`, `SIN(0)=0`,
   `EXP(0)=1`), we DO fold so those common-case results don't stay
   wrapped as `LN(1)`.  The round-to-integer tolerance (1e-12) mirrors
   _approxGate in the Symbolic EVAL path so the two entry points agree.
   Returns a pushable RPL value. */
function _exactUnaryLift(fnName, yScalar, v) {
  if (Number.isFinite(yScalar)) {
    const rounded = Math.round(yScalar);
    if (Math.abs(yScalar - rounded) < 1e-12) {
      return Integer(BigInt(rounded));
    }
  }
  return Symbolic(AstFn(fnName, [_toAst(v)]));
}

function unaryReal(name, fn) {
  if (typeof name === 'function') { fn = name; name = null; }
  const fnName = (name || (fn && fn.name) || 'FN').toUpperCase();
  return _withListUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(fnName, [_toAst(v)])));
      return;
    }
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = isRational(v) ? Number(v.n) / Number(v.d) : Number(v.value);
      s.push(_exactUnaryLift(fnName, fn(x), v));
      return;
    }
    s.push(Real(fn(toRealOrThrow(v))));
  });
}

/* -------------------- trig (angle-mode aware) --------------------
   SIN/COS/TAN take an angle in the active mode (DEG/RAD/GRD) and
   convert to radians before calling the Math.* primitive.  Inverse
   trig returns an angle in the active mode.  Symbolic/Name operands
   are lifted to `SIN(X)` / `ACOS(X)` etc. with no angle-mode
   conversion — the AST carries intent, not units.

   In EXACT mode, an Integer/Rational input that would produce a
   non-integer result stays symbolic (see _exactUnaryLift).  This
   matches the HP50 behavior under flag -105 CLEAR: `30 SIN` leaves
   `SIN(30)` on the stack; pressing →NUM then folds to 0.5 (in DEG).
   ----------------------------------------------------------------- */
// Real-only SIN/COS/TAN/ASIN/ACOS/ATAN/LN/LOG/EXP/ALOG were registered
// here in the first pass via `trigFwd` / `trigInv` / `unaryReal`.
// The Complex-aware registrations near `_trigFwdCx` / `_unaryCx`
// (late in this file) are the authoritative entry points.
// `unaryReal` remains live — R→D / D→R still use it.

/* --------------------- hyperbolic ---------------------
   SINH/COSH/TANH/ASINH/ACOSH/ATANH live in KNOWN_FUNCTIONS for
   parseAlgebra (so they participate in symbolic odd/even identities)
   and are registered here as stack ops so the MTH->HYP soft-menu can
   dispatch to them directly.  ACOSH requires x >= 1 and ATANH requires
   |x| < 1 — we defer to Math.acosh / Math.atanh which already return
   NaN for out-of-domain inputs, and throw RPLError to match how other
   domain-violation ops report.
   -------------------------------------------------------------------- */
// Hyperbolic SINH/COSH/TANH/ASINH/ACOSH/ATANH — first-pass Real-only
// registrations lived here (unaryReal-based plus domain-checked ACOSH/
// ATANH bodies).  See the `_unaryCx`
// registrations late in this file for the complex-aware authoritative
// versions, and the `_withTaggedUnary(_withListUnary(_withVMUnary(...)))`
// wrapping for Tagged / List / V/M widening.

/* -------- XROOT — n-th root, `y x XROOT` = y^(1/x) ----
   HP50 behavior: xth root of y (two-arg op).  Delegates to the binary
   `^` machinery so it picks up the Real/Integer/Complex coercion
   already implemented there.  We push `1/x` and then `^`.  Pure
   plumbing — no new numeric code.
   -------------------------------------------------------------------- */
register('XROOT', _withListBinary((s) => {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const x = s.pop();
  const y = s.pop();
  // Symbolic/Name on either arg emits 'XROOT(y,x)' — the parser and
  // simplifier already treat XROOT as a two-arg function, so this
  // round-trips cleanly through print/parse.
  if (_isSymOperand(y) || _isSymOperand(x)) {
    const yAst = _toAst(y);
    const xAst = _toAst(x);
    if (yAst && xAst) { s.push(Symbolic(AstFn('XROOT', [yAst, xAst]))); return; }
    throw new RPLError('Bad argument type');
  }
  // Promote x to Decimal so 1/x stays in Decimal space (avoids JS Infinity
  // for large-exponent values).  Then y^(1/x) goes through the Decimal ^ path.
  const dx = isReal(x) ? x.value
           : new Decimal(isInteger(x) ? x.value.toString() : toRealOrThrow(x));
  if (dx.isZero()) throw new RPLError('Infinite result');
  s.push(y);
  s.push(Real(new Decimal(1).div(dx)));
  lookup('^').fn(s);
}));

/* ------------------------------------------------------------------
   More HP50 real-unary commands.

     FLOOR   greatest integer ≤ x          -1.2 FLOOR → -2
     CEIL    least integer ≥ x             -1.2 CEIL  → -1
     IP      integer part (truncate to 0)  -1.8 IP    → -1
     FP      fractional part, same sign     1.8 FP    →  0.8
     SIGN    -1 / 0 / 1 for real input; for Complex, the unit
             vector e^(iθ) — pushes a Complex of magnitude 1.
             HP50 returns 0 for exactly 0 (any type).

   FLOOR/CEIL/IP/FP preserve Integer type when the input is an
   Integer (no-op for IP/FLOOR/CEIL, 0n for FP) — matches HP50's
   tidy type behavior.  On a Real, they yield a Real (matching
   `toFixed(0)`-adjacent semantics).
   ------------------------------------------------------------------ */

/* FLOOR/CEIL/IP/FP cover R/Z plus element-wise on Vector / Matrix,
   Symbolic lift via KNOWN_FUNCTIONS, Tagged transparency (tag is
   preserved across the unary op), and Unit carriers.  Complex is
   rejected — HP50 raises "Bad Argument Type" on these for Complex
   since there is no well-defined ordering on C.  The symbolic form
   round-trips through the entry parser because FLOOR/CEIL/IP/FP are
   registered in KNOWN_FUNCTIONS (algebra.js).

   Unit: HP50 applies FLOOR/CEIL/IP/FP to the numeric part of a unit
   object and preserves the unit expression — `1.5_m FLOOR` -> `1_m`,
   `1.8_m FP` -> `.8_m`.  This is the real-valued scalar case (FP's
   fallback intFn returning `Integer(0n)` is never reached — a Unit
   carries a Real-typed value by construction, per types.js §Unit). */
function _rounderScalar(name, realFn, intFn) {
  return (v) => {
    if (isInteger(v))        return intFn(v);
    /* Rational: exact rounding via BigInt trunc/mod.  APPROX mode
       collapses to Real (consistent with the rest of the Rational
       plumbing — flag -3 says "decimals").  In EXACT mode, FLOOR/
       CEIL/IP return Integer, FP returns Rational (or Integer 0
       when the fractional part is zero). */
    if (isRational(v)) {
      if (getApproxMode()) {
        // Use Decimal so the division doesn't lose precision before rounding.
        const dr = new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
        let d;
        if      (name === 'FLOOR') d = dr.floor();
        else if (name === 'CEIL')  d = dr.ceil();
        else if (name === 'IP')    d = dr.trunc();
        else /* FP */              d = dr.minus(dr.trunc());
        return Real(d);
      }
      const n = v.n, d = v.d;           // d > 0 by Rational invariant
      const q = n / d;                  // BigInt trunc-toward-zero
      const r = n % d;                  // remainder, sign follows n
      if (name === 'FP') {
        return r === 0n ? Integer(0n) : Rational(r, d);
      }
      if (r === 0n)          return Integer(q);
      if (name === 'IP')     return Integer(q);
      if (name === 'FLOOR')  return Integer(n < 0n ? q - 1n : q);
      if (name === 'CEIL')   return Integer(n > 0n ? q + 1n : q);
    }
    /* BinaryInteger: BinInts are always integer-valued, so rounding is
       a no-op.  HP50 AUR §3 accepts BinInt on FLOOR/CEIL/IP/FP.  FP of
       any integer = 0; preserve base. */
    if (isBinaryInteger(v))  return name === 'FP'
      ? BinaryInteger(0n, v.base)
      : v;
    if (isReal(v)) {
      // Use Decimal methods so values beyond IEEE-754 range round correctly.
      let d;
      if      (name === 'FLOOR') d = v.value.floor();
      else if (name === 'CEIL')  d = v.value.ceil();
      else if (name === 'IP')    d = v.value.trunc();
      else /* FP */              d = v.value.minus(v.value.trunc());
      return Real(d);
    }
    if (isUnit(v))           return Unit(realFn(v.value), v.uexpr);  // Unit.value is JS number
    if (_isSymOperand(v))    return Symbolic(AstFn(name, [_toAst(v)]));
    throw new RPLError('Bad argument type');
  };
}
const _floorScalar = _rounderScalar('FLOOR', Math.floor, v => v);
const _ceilScalar  = _rounderScalar('CEIL',  Math.ceil,  v => v);
const _ipScalar    = _rounderScalar('IP',    Math.trunc, v => v);
const _fpScalar    = _rounderScalar('FP',    (x) => x - Math.trunc(x), () => Integer(0n));

function _registerRounder(name, scalarFn) {
  register(name, _withTaggedUnary(_withListUnary((s) => {
    const v = s.pop();
    if (isVector(v))      s.push(Vector(v.items.map(scalarFn)));
    else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(scalarFn))));
    else                  s.push(scalarFn(v));
  })));
}
_registerRounder('FLOOR', _floorScalar);
_registerRounder('CEIL',  _ceilScalar);
_registerRounder('IP',    _ipScalar);
_registerRounder('FP',    _fpScalar);

/* SIGN covers R/Z/C plus Vector (unit direction), Matrix element-wise
   (HP50's Matrix-SIGN is scalar-element-wise — a matrix has no single
   direction), Symbolic lift, and Tagged transparency. */
register('SIGN', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isReal(v)) {
    // Decimal.sign() returns -1, 0, or 1 without a .toNumber() round-trip.
    s.push(Real(new Decimal(v.value.isNegative() ? -1 : v.value.isZero() ? 0 : 1)));
  } else if (isInteger(v)) {
    if (v.value === 0n) s.push(Integer(0n));
    else s.push(Integer(v.value > 0n ? 1n : -1n));
  } else if (isRational(v)) {
    // d is always positive by invariant, so sign(n/d) = sign(n).
    // SIGN is already exact-valued (-1, 0, 1), so no APPROX branch.
    if (v.n === 0n)      s.push(Integer(0n));
    else                 s.push(Integer(v.n > 0n ? 1n : -1n));
  } else if (isComplex(v)) {
    // Unit vector e^(iθ) — zero input yields 0+0i.
    const mag = Math.hypot(v.re, v.im);
    if (mag === 0) s.push(Complex(0, 0));
    else s.push(Complex(v.re / mag, v.im / mag));
  } else if (isVector(v)) {
    // HP50 Advanced Guide defines SIGN on a vector as v / ||v||
    // (unit vector in the direction of v).  Zero vector stays zero —
    // matches the scalar-SIGN convention on 0.  Use Decimal so
    // large-exponent components don't saturate to Infinity.
    const mag = _decimalFrobeniusNorm(v.items);
    if (mag.isZero()) { s.push(v); return; }
    s.push(Vector(v.items.map(x => {
      const d = isReal(x) ? x.value : new Decimal(x.value.toString());
      return Real(d.div(mag));
    })));
  } else if (isMatrix(v)) {
    // Matrix: apply SIGN to each scalar entry.  Real/Integer/Complex
    // entries go through the scalar cases above via recursion.
    s.push(Matrix(v.rows.map(r => r.map(x => {
      if (isReal(x))    return Real(new Decimal(x.value.isNegative() ? -1 : x.value.isZero() ? 0 : 1));
      if (isInteger(x)) return x.value === 0n ? Integer(0n) : Integer(x.value > 0n ? 1n : -1n);
      if (isComplex(x)) {
        const m = Math.hypot(x.re, x.im);
        return m === 0 ? Complex(0, 0) : Complex(x.re / m, x.im / m);
      }
      if (_isSymOperand(x)) return Symbolic(AstFn('SIGN', [_toAst(x)]));
      throw new RPLError('Bad argument type');
    }))));
  } else if (_isSymOperand(v)) {
    s.push(Symbolic(AstFn('SIGN', [_toAst(v)])));
  } else {
    throw new RPLError('Bad argument type');
  }
})));

/* ------------------- complex-number ops ---------------
   ARG    argument θ of a complex number, in the active angle mode.
          On real inputs:  ≥0 → 0,  <0 → π (180° / 200 grad).
   CONJ   complex conjugate a+bi → a−bi; identity on Real/Integer.
   RE     real part: Real(a) from a+bi, identity on Real/Integer.
   IM     imaginary part:  b from a+bi,  0 from Real/Integer.

   Backs the CMPLX soft-menu (SHIFT-R + 1 → ABS / ARG / CONJ / RE /
   IM / i) and the shifted ÷ key (ARG).
   -------------------------------------------------------------------- */
/* ARG covers scalars (R/Z/C) plus Vector / Matrix element-wise,
   Symbolic lift, and Tagged transparency.  Result on a Real/Integer
   is angle-mode-sensitive (negative → π, non-negative → 0) —
   element-wise just broadcasts that. */
function _argScalar(v) {
  if (isReal(v))    return Real(fromRadians(v.value.isNegative() ? Math.PI : 0));
  if (isInteger(v)) return Real(fromRadians(v.value < 0n ? Math.PI : 0));
  if (isComplex(v)) return Real(fromRadians(Math.atan2(v.im, v.re)));
  if (_isSymOperand(v)) return Symbolic(AstFn('ARG', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}
register('ARG', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_argScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_argScalar))));
  else                  s.push(_argScalar(v));
})));

/* CONJ / RE / IM extend to element-wise on Vector & Matrix.  Today
   every entry is Real/Integer/Symbolic so CONJ is identity, RE is
   identity, and IM is a zero-valued array — but the element-wise
   dispatch is in place for when Complex entries can appear in arrays. */
function _conjScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Complex(v.re, -v.im);
  if (_isSymOperand(v)) return Symbolic(AstFn('CONJ', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}
function _reScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Real(v.re);
  if (_isSymOperand(v)) return Symbolic(AstFn('RE', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}
function _imScalar(v) {
  if (isReal(v))    return Real(0);
  if (isInteger(v) || isRational(v)) return Integer(0n);
  if (isComplex(v)) return Real(v.im);
  if (_isSymOperand(v)) return Symbolic(AstFn('IM', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}
/* CONJ / RE / IM have Tagged transparency.  Each uses the standard
   unary-Tagged shape: unwrap tag, apply, re-tag with the same label.
   Vector and Matrix inputs are element-wise and retag as
   Tagged(label, Vector/Matrix) — matches HP50 where the tag survives
   structural operations that return the same shape. */
register('CONJ', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_conjScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_conjScalar))));
  else s.push(_conjScalar(v));
})));
register('RE', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_reScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_reScalar))));
  else s.push(_reScalar(v));
})));
register('IM', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_imScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_imScalar))));
  else s.push(_imScalar(v));
})));

/* ------------------- integer GCD / LCM ----------------
   `a b GCD` → greatest common divisor of two Integers.  For Reals
   we coerce to BigInt via trunc; non-integer Reals throw since HP50
   rejects non-integer inputs to GCD/LCM.
   -------------------------------------------------------------------- */
function _toBigIntOrThrow(v) {
  if (isInteger(v)) return v.value;
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return BigInt(v.value.toFixed(0));
  }
  throw new RPLError('Bad argument type');
}
function _bigAbs(x) { return x < 0n ? -x : x; }
function _bigGcd(a, b) {
  a = _bigAbs(a); b = _bigAbs(b);
  while (b !== 0n) { [a, b] = [b, a % b]; }
  return a;
}
/* GCD / LCM cover Tagged + List + Symbolic/Name:
     - `_withTaggedBinary`  — unwrap either/both tags; binary drops tag.
     - `_withListBinary`    — element-wise distribution (same length
                              lists pair up; scalar broadcasts).
     - Sy / N lift          — either operand a Name or Symbolic lifts to
                              `Symbolic(AstFn('GCD'|'LCM', [a, b]))`.
                              Polynomial GCD on full symbolic expressions
                              is CAS work and deliberately deferred; the
                              lift here gets `'M' 'N' GCD` → `'GCD(M,N)'`
                              on the stack and round-tripping through
                              the entry parser via KNOWN_FUNCTIONS.
   Integer-only rejection for non-integer Real — matches HP50. */
register('GCD', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a); const r = _toAst(b);
    if (l && r) { s.push(Symbolic(AstFn('GCD', [l, r]))); return; }
    throw new RPLError('Bad argument type');
  }
  const ai = _toBigIntOrThrow(a);
  const bi = _toBigIntOrThrow(b);
  s.push(Integer(_bigGcd(ai, bi)));
})));
register('LCM', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a); const r = _toAst(b);
    if (l && r) { s.push(Symbolic(AstFn('LCM', [l, r]))); return; }
    throw new RPLError('Bad argument type');
  }
  const ai = _toBigIntOrThrow(a);
  const bi = _toBigIntOrThrow(b);
  if (ai === 0n || bi === 0n) { s.push(Integer(0n)); return; }
  const g = _bigGcd(ai, bi);
  s.push(Integer(_bigAbs(ai / g * bi)));
})));

/* ------------------- factorial ------------------------
   `n FACT` → n!.  Non-negative Integer input stays exact (BigInt).
   Non-negative Real input uses a Lanczos gamma approximation and
   returns `Γ(n+1)` as a Real — HP50 FACT accepts non-integer real
   arguments and returns the gamma-based factorial.
   Negative integers and negative integer-valued Reals throw since
   Γ has poles at the non-positive integers.
   -------------------------------------------------------------------- */
function _bigFactorial(n) {
  if (n < 0n) throw new RPLError('Bad argument value');
  let acc = 1n;
  for (let i = 2n; i <= n; i++) acc *= i;
  return acc;
}
/* Lanczos g=7, n=9 coefficients — standard public-domain set.
   Good to ~15 significant digits, which matches our Real precision. */
const _LANCZOS_G = 7;
const _LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];
function _gamma(x) {
  // Reflection: Γ(x) = π / (sin(πx) · Γ(1 − x))  for x < 0.5
  if (x < 0.5) {
    const s = Math.sin(Math.PI * x);
    if (s === 0) throw new RPLError('Infinite result'); // pole
    return Math.PI / (s * _gamma(1 - x));
  }
  x -= 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (x + i);
  const t = x + _LANCZOS_G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
/* FACT accepts R/Z plus Symbolic/Name (lifts to FACT(X) —
   KNOWN_FUNCTIONS has a non-negative-integer evaluator so constant-
   fold still works), List (element-wise — `{3 4 5} FACT` →
   `{6 24 120}`), Vector/Matrix (element-wise — `[2 3 4] FACT` →
   `[2 6 24]`), and Tagged (transparent — `n=5 FACT` → `n=120`).

   Complex is rejected: HP50's gamma is real-valued and the
   calculator's FACT throws "Bad argument type" on Complex (the AUR
   describes Γ via the Lanczos series only). */
register('FACT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) {
    s.push(Symbolic(AstFn('FACT', [_toAst(v)])));
    return;
  }
  if (isInteger(v)) {
    if (v.value < 0n) throw new RPLError('Bad argument value');
    s.push(Integer(_bigFactorial(v.value)));
    return;
  }
  if (isReal(v)) {
    const x = v.value.toNumber();
    // Non-positive integer-valued Real is a gamma pole.
    if (Number.isInteger(x) && x < 0) throw new RPLError('Infinite result');
    // Exact Integer when input is a non-negative integer-valued Real.
    if (Number.isInteger(x) && x >= 0) {
      s.push(Integer(_bigFactorial(BigInt(x))));
      return;
    }
    // Non-integer Real → Γ(x+1)
    s.push(Real(_gamma(x + 1)));
    return;
  }
  throw new RPLError('Bad argument type');
}))));

/* ------------------------------------------------------------------
   Binary real ops — MOD, MIN, MAX.

     MOD     a MOD b : remainder of a/b, HP50 convention (result has
             the sign of the divisor b).  Note this differs from JS `%`
             (which takes the sign of the dividend).
     MIN/MAX straightforward min / max of two numeric values.

   Type handling: Integer/Integer stays Integer, anything with a Real
   becomes Real.  Complex arguments are rejected (HP50 likewise).
   ------------------------------------------------------------------ */

/** HP50 MOD: result has the sign of the divisor.  (a - b * floor(a/b)) */
/** HP50 MOD on Decimals — floor-div convention (result has sign of divisor). */
function _hp50ModDecimal(a, b) {
  if (b.isZero()) throw new RPLError('Infinite result');
  // a mod b = a - b * floor(a/b)
  return a.minus(b.times(a.div(b).floor()));
}

function _hp50ModReal(a, b) {
  if (b === 0) throw new RPLError('Infinite result');
  return a - b * Math.floor(a / b);
}

/** HP50 MOD on BigInts — floor-div convention matches _hp50ModReal. */
function _hp50ModBigInt(a, b) {
  if (b === 0n) throw new RPLError('Infinite result');
  let r = a % b;
  // JS % on BigInt takes sign of dividend; flip to divisor's sign when
  // they disagree.
  if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b;
  return r;
}

/* MOD lifts to Symbolic when either operand is a Name / Symbolic
   (matches how +, -, * lift), and is transparent across Tagged
   wrappers.  Complex is rejected — HP50 has no complex-MOD definition
   (ordering & sign of divisor make no sense in C). */
register('MOD', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn('MOD', [l, r])));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    s.push(Integer(_hp50ModBigInt(a.value, b.value)));
  } else {
    // Promote both sides to Decimal so values beyond IEEE-754 range work.
    const da = isReal(a) ? a.value : new Decimal(isInteger(a) ? a.value.toString() : toRealOrThrow(a));
    const db = isReal(b) ? b.value : new Decimal(isInteger(b) ? b.value.toString() : toRealOrThrow(b));
    s.push(Real(_hp50ModDecimal(da, db)));
  }
})));

/* MIN/MAX have Symbolic lift (leaves MIN(X,3) un-evaluated when X is
   unbound) and Tagged transparency.  Complex is rejected — C has no
   total ordering. */
function _minMax(s, wantMin, name) {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn(name, [l, r])));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    const aWins = wantMin ? (a.value <= b.value) : (a.value >= b.value);
    s.push(Integer(aWins ? a.value : b.value));
  } else {
    // Promote to Decimal so large-exponent values compare correctly.
    const da = isReal(a) ? a.value : new Decimal(isInteger(a) ? a.value.toString() : toRealOrThrow(a));
    const db = isReal(b) ? b.value : new Decimal(isInteger(b) ? b.value.toString() : toRealOrThrow(b));
    const cmp = da.comparedTo(db);
    const aWins = wantMin ? (cmp <= 0) : (cmp >= 0);
    s.push(Real(aWins ? da : db));
  }
}
register('MIN', _withTaggedBinary(_withListBinary((s) => _minMax(s, true,  'MIN'))));
register('MAX', _withTaggedBinary(_withListBinary((s) => _minMax(s, false, 'MAX'))));

/* ------------------------------------------------------------------
   Combinatorics + integer div-mod + normal-CDF cluster

   COMB / PERM / IDIV2 / UTPN.  Commonly-used HP50 ops (COMB and PERM
   live under the MTH-NUM menu; IDIV2 under MTH-NUM-INTEG; UTPN on the
   STAT-DIST menu).  Kept co-located with the binary-op wrappers so the
   Tagged/List wrappers in scope are easy to reuse.

   ─── COMB(n, m) and PERM(n, m) ─────────────────────────────────
   Stack signature: level 2 = n, level 1 = m.  Both must be
   non-negative integers with n ≥ m — "Bad argument value" otherwise.
   Complex / unit / other types raise "Bad argument type".  Name /
   Symbolic lift to Symbolic(AstFn(...)) so `'N' 'K' COMB` produces
   `'COMB(N,K)'` on the stack.  Integer-valued Reals are accepted;
   truly non-integer Real → "Bad argument value".  Tagged transparency
   and List distribution come in automatically via the wrappers.

   ─── IDIV2(a, b) ────────────────────────────────────────────────
   Stack signature: level 2 = dividend, level 1 = divisor.  Returns
   TWO results: level 2 = quotient, level 1 = remainder, with
   a = q·b + r and r having the sign of the dividend (truncated
   division — matches HP50 and JS BigInt convention).  Integer-valued
   only; 0 divisor → "Infinite result".  Not wrapped in List/Tagged —
   the two-output stack effect doesn't compose with those wrappers.

   ─── UTPN(μ, σ², x) ─────────────────────────────────────────────
   Upper-tail normal probability: P(X > x) for X ~ Normal(μ, σ²).
   Stack (top-down): level 3 = μ, level 2 = σ², level 1 = x.
   Computed as 0.5·erfc((x − μ) / (σ·√2)) where σ = √σ².  σ² must
   be strictly positive — "Bad argument value" otherwise.  Real /
   Integer arguments only ("Bad argument type" for Complex, Unit,
   Name/Symbolic — no symbolic lift yet for 3-arg stats ops).
   ------------------------------------------------------------------ */

/** Parse a (Real | Integer | Symbolic-operand) pair for COMB/PERM.
 *  Returns { kind: 'sym', expr } for the Name/Symbolic lift path or
 *  { kind: 'int', n, m } for the numeric path.  Throws on any other
 *  type or on a non-integer-valued Real. */
function _combPermArgs(a, b, opName) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    return { kind: 'sym', expr: Symbolic(AstFn(opName, [l, r])) };
  }
  // Type guard mirrors `_intQuotientArg` (used by IQUOT / IREMAINDER /
  // IDIV2 / DIVMOD / DIV2MOD): only Integer or Real survive.  Rational
  // is explicitly rejected even when integer-valued (`5/1`) — HP50 AUR
  // §3-29 worked example shows the firmware rejects fractional COMB /
  // PERM arguments rather than coercing them; we match that contract
  // uniformly.  Complex is subsumed by !isInteger && !isReal.  Rational
  // is excluded explicitly because its payload is `{n, d}` — no `.value`
  // — so allowing it through would cause a JavaScript TypeError rather
  // than a clean RPLError at the downstream `v.value.isFinite()` check.
  if (!isInteger(a) && !isReal(a)) throw new RPLError('Bad argument type');
  if (!isInteger(b) && !isReal(b)) throw new RPLError('Bad argument type');
  const toBig = (v) => {
    if (isInteger(v)) return v.value;
    // Real is only accepted if integer-valued — COMB/PERM are defined
    // on the integers; HP50 AUR rejects fractional arguments as "Bad
    // argument value" rather than coercing via gamma (that's FACT's
    // job, not COMB's).
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    return BigInt(v.value.toFixed(0));
  };
  return { kind: 'int', n: toBig(a), m: toBig(b) };
}

register('COMB', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'COMB');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  if (n < 0n || m < 0n) throw new RPLError('Bad argument value');
  if (m > n)             throw new RPLError('Bad argument value');
  // Compute via the falling-factorial form so intermediates stay
  // near the final magnitude instead of blowing up into n! first.
  //   C(n, m) = (n · (n−1) · … · (n−m+1)) / m!
  let num = 1n, den = 1n;
  for (let i = 1n; i <= m; i++) { num *= (n - m + i); den *= i; }
  s.push(Integer(num / den));
})));

register('PERM', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'PERM');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  if (n < 0n || m < 0n) throw new RPLError('Bad argument value');
  if (m > n)             throw new RPLError('Bad argument value');
  // P(n, m) = n · (n−1) · … · (n−m+1) — m terms, no division needed.
  let out = 1n;
  for (let i = 0n; i < m; i++) out *= (n - i);
  s.push(Integer(out));
})));

register('IDIV2', (s) => {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const [a, b] = s.popN(2);
  const toBig = (v) => {
    if (isInteger(v)) return v.value;
    if (isReal(v)) {
      if (!v.value.isFinite() || !v.value.isInteger()) {
        throw new RPLError('Bad argument value');
      }
      return BigInt(v.value.toFixed(0));
    }
    throw new RPLError('Bad argument type');
  };
  const ba = toBig(a), bb = toBig(b);
  if (bb === 0n) throw new RPLError('Infinite result');
  // BigInt `/` truncates toward zero; `%` returns the remainder with
  // the sign of the dividend.  That's exactly the HP50 IDIV2 contract.
  const q = ba / bb;
  const r = ba - q * bb;
  s.push(Integer(q));
  s.push(Integer(r));
});

/* Hastings-style Chebyshev approximation for erfc.  Numerical Recipes
   (Press et al., §6.2) — relative error ≤ 1.2e-7 over the whole real
   line.  The HP50 STAT-DIST tables are traditionally quoted to 10
   digits; a tighter approximation (Cheb expansion, 28 coefficients)
   would match that but would 10× the code with no user-visible gain
   for the ops here — upgrade is straightforward if a later eval ever
   needs it. */
function _erfc(x) {
  if (!Number.isFinite(x)) return x > 0 ? 0 : 2;
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ans = t * Math.exp(
    -z * z - 1.26551223 +
    t * (1.00002368 +
    t * (0.37409196 +
    t * (0.09678418 +
    t * (-0.18628806 +
    t * (0.27886807 +
    t * (-1.13520398 +
    t * (1.48851587 +
    t * (-0.82215223 +
    t * 0.17087277))))))))
  );
  return x >= 0 ? ans : 2 - ans;
}

register('UTPN', (s) => {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [mu, var2, x] = s.popN(3);
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const m = asReal(mu);
  const V = asReal(var2);
  const X = asReal(x);
  if (!(V > 0) || !Number.isFinite(V)) {
    // σ² ≤ 0 or non-finite — a variance must be strictly positive.
    throw new RPLError('Bad argument value');
  }
  const sigma = Math.sqrt(V);
  const zScore = (X - m) / (sigma * Math.SQRT2);
  s.push(Real(0.5 * _erfc(zScore)));
});

/* ==================================================================
   Integer-division siblings, special functions, and a STAT-DIST
   upper-tail.

     ─── IQUOT(a, b) / IREMAINDER(a, b) ─────────────────────────
     Single-result siblings of IDIV2.  IQUOT returns the truncated
     quotient; IREMAINDER returns the remainder with the sign of the
     dividend.  Both wrap in Tagged + List transparency — unlike
     IDIV2, they produce a single stack result so the wrappers
     compose cleanly.  HP50 AUR p.3-37.

     ─── GAMMA(x) / LNGAMMA(x) ──────────────────────────────────
     The gamma function and its natural log.  GAMMA is HP50 AUR §3
     CAS-menu; LNGAMMA is the slog-safe companion for large x where
     Γ overflows IEEE double precision.  Tagged + List + V/M
     transparency, Symbolic lift via KNOWN_FUNCTIONS round-trip.
     Non-positive-integer inputs raise "Infinite result" (poles).
     Complex / String / Unit / etc. → "Bad argument type".

     ─── UTPC(ν, x) ─────────────────────────────────────────────
     Chi-square upper tail: P(X > x) for X ~ χ²(ν).  HP50 AUR
     p.15-22 (STAT-DIST menu).  Computed via the regularised upper
     incomplete gamma  Q(ν/2, x/2)  using either the series
     expansion (x ≤ ν/2 + 1) or the continued-fraction form
     (otherwise) — the two converge on complementary domains in a
     way that keeps ≤12-digit precision across the full stat-table
     range.  ν must be a strictly positive integer (degrees of
     freedom); x ≥ 0 for a finite tail.  Real / Integer arguments
     only; no Symbolic lift (terminal numeric op — same rationale
     as UTPN).
   ================================================================== */

/** Unwrap (Integer | integer-valued Real) to a BigInt.  Throws
 *  "Bad argument type" on any other type and "Bad argument value"
 *  on a non-integer-valued Real — matches IDIV2's argument contract.
 */
function _intQuotientArg(v) {
  if (isInteger(v)) return v.value;
  if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    return BigInt(v.value.toFixed(0));
  }
  throw new RPLError('Bad argument type');
}

register('IQUOT', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  // Symbolic lift — matches MOD's treatment: keep IQUOT(A, B) as a
  // Symbolic when either side is a Name or Symbolic, so the CAS path
  // round-trips through parseEntry.
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn('IQUOT', [l, r])));
    return;
  }
  const ba = _intQuotientArg(a), bb = _intQuotientArg(b);
  if (bb === 0n) throw new RPLError('Infinite result');
  // BigInt `/` truncates toward zero.  That's the HP50 IQUOT contract.
  s.push(Integer(ba / bb));
})));

register('IREMAINDER', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn('IREMAINDER', [l, r])));
    return;
  }
  const ba = _intQuotientArg(a), bb = _intQuotientArg(b);
  if (bb === 0n) throw new RPLError('Infinite result');
  // BigInt `%` returns a remainder with the sign of the dividend —
  // exactly the HP50 IREMAINDER contract.  Contrast with MOD, which
  // uses floor-div (sign of divisor) and needs _hp50ModBigInt.
  const q = ba / bb;
  s.push(Integer(ba - q * bb));
})));

/* ---- Extended Euclidean algorithm --------------------
   Returns `{ g, s, t }` with the invariant `s·a + t·b = g`, where
   `g = gcd(|a|, |b|)` is always non-negative.  Caller deals with the
   sign.  Handles a = 0 or b = 0 cleanly (gcd(0, b) = |b| with
   s = 0, t = sign(b); and vice-versa).  BigInt throughout so we stay
   exact for inputs of any size. */

function _extGcdBigInt(a, b) {
  // Work over absolute values to keep the loop uniform, then re-sign
  // the Bezout coefficients at the end.
  const aNeg = a < 0n, bNeg = b < 0n;
  let r0 = aNeg ? -a : a;
  let r1 = bNeg ? -b : b;
  let s0 = 1n, s1 = 0n;
  let t0 = 0n, t1 = 1n;
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  // r0 = gcd(|a|, |b|); s0·|a| + t0·|b| = r0.  Re-sign to match
  // the original operands so s·a + t·b = g.
  if (aNeg) s0 = -s0;
  if (bNeg) t0 = -t0;
  return { g: r0, s: s0, t: t0 };
}

/* ---- EUCLID — extended Euclidean (Bezout) on integers -------------
   HP50 AUR §2-39 (CAS-ARITH-INTEGER menu).  Integer-only first pass
   (the HP50 command accepts polynomials too via the shared
   CAS-polynomial coefficient form — routing that through the
   polynomial layer can be layered on later without disturbing this
   branch).

     a b EUCLID  ( Z Z → { u v g } )

   where u·a + v·b = g and g ≥ 0.  The returned RList is the tuple
   HP50 firmware emits: [level-1] a list, [level-2..] untouched.
   Both a and b = 0 throws Bad argument value — gcd(0, 0) is
   undefined on HP50; pick one non-zero pair and try again.

   Integer-valued Reals are accepted (matches the IDIV2 / IQUOT
   convention).  Symbolic and non-numeric types reject with
   Bad argument type.  No Tagged / List wrappers this pass — the
   op is terminal (returns a list, not a scalar) so the standard
   list-distribution wrappers don't apply. */

register('EUCLID', (s) => {
  const [a, b] = s.popN(2);
  const ba = _intQuotientArg(a);
  const bb = _intQuotientArg(b);
  if (ba === 0n && bb === 0n) {
    // gcd(0, 0) is undefined.  HP50 firmware returns an error here.
    throw new RPLError('Bad argument value');
  }
  const { g, s: u, t: v } = _extGcdBigInt(ba, bb);
  s.push(RList([Integer(u), Integer(v), Integer(g)]));
});

/* ---- INVMOD — modular multiplicative inverse ----------------------
   HP50 AUR §2-58 (CAS-ARITH-MODULO menu).  The HP50 firmware uses
   the global CAS MODULO state variable for the modulus; we take it
   explicitly on the stack here.  See MODSTO / ADDTMOD / SUBTMOD /
   MULTMOD / POWMOD below for the state-slot ops.

     a n INVMOD  ( Z Z → Z )    a · result ≡ 1  (mod n)

   Requires gcd(a, n) = 1 and n ≥ 2; otherwise throws
   `Bad argument value` (no inverse).  The returned representative is
   reduced into the range [0, n) — matching the convention the HP50
   uses for MODULO-style output.  Integer-valued Reals coerce
   through `_intQuotientArg` the same way IQUOT / IREMAINDER do.

   Deliberate deviation from HP50.  The HP50 firmware exposes INVMOD
   as a one-arg op that consumes the global `MODULO` state slot for
   the modulus.  rpl5050 takes the modulus explicitly on level 1 so
   programs can compute inverses against ad-hoc moduli without
   round-tripping through MODSTO.  ADDTMOD / SUBTMOD / MULTMOD /
   POWMOD do consume `state.casModulo`; INVMOD is the one outlier in
   the MODULO menu and is recorded as such in the Intentional
   Deviations table in `docs/@!MY_NOTES.md`. */

register('INVMOD', (s) => {
  const [a, n] = s.popN(2);
  const ba = _intQuotientArg(a);
  let bn = _intQuotientArg(n);
  if (bn < 0n) bn = -bn;              // negative modulus folds to |n|
  if (bn < 2n) throw new RPLError('Bad argument value');
  // Reduce a mod n into [0, n).  BigInt `%` returns a result with the
  // sign of the dividend, so negative a needs an explicit bump.
  let ra = ba % bn;
  if (ra < 0n) ra += bn;
  if (ra === 0n) throw new RPLError('Bad argument value');
  const { g, s: u } = _extGcdBigInt(ra, bn);
  if (g !== 1n) throw new RPLError('Bad argument value');
  // u·ra + t·bn = 1 → u ≡ ra^-1 (mod bn).  Reduce into [0, bn).
  let inv = u % bn;
  if (inv < 0n) inv += bn;
  s.push(Integer(inv));
});

/* ------------------------------------------------------------------
   MODSTO + ADDTMOD / SUBTMOD / MULTMOD / POWMOD

   The HP50 CAS MODULO ARITH menu (`!Þ MODULO`) — five ops that
   reduce arithmetic results modulo a global state slot.  MODSTO is
   the only writer; the other four are pure readers.  HP50 AUR
   §3-150 / §3-9 / §3-243 / §3-153 / §3-175.

   State slot lives in `state.casModulo` (BigInt, default 13n; see
   state.js setCasModulo).  Persists across reload via persist.js.

   Stack contracts (all match the AUR — numeric-or-symbolic):
     MODSTO        ( m → )                          — set the modulus
     ADDTMOD       ( a b → (a+b) mod m )
     SUBTMOD       ( a b → (a-b) mod m )
     MULTMOD       ( a b → (a*b) mod m )
     POWMOD        ( a n → (a^n) mod m )

   Representative convention:
     • Pure integer inputs (Integer / integer-Real on both levels)
       reduce natively with BigInt and return the *centered*
       representative — `5 mod 7` = `-2`, `2 mod 7` = `2`.  This
       matches the HP50 AUR worked example for ADDTMOD where
       `(X^2+3X+6)+(9X+3)` mod 7 lands as `X^2 - 2X + 2` (12 → -2,
       9 → 2).
     • Symbolic / Name / Rational inputs route through Giac with
       `((a) op (b)) mod m` (or `powmod(a,n,m)` for POWMOD).  Giac
       returns coefficients in its own centered convention which
       matches HP50.  No-fallback policy: Giac not ready → CAS not
       ready.
   ------------------------------------------------------------------ */

/** Return the centered representative of `a` mod `m`, m > 0.
 *  For odd m the range is [-(m-1)/2, (m-1)/2].
 *  For even m the range is (-m/2, m/2] (the +m/2 boundary stays). */
function _centerMod(a, m) {
  let r = a % m;
  if (r < 0n) r += m;          // r ∈ [0, m)
  if (2n * r > m) r -= m;       // shift the upper half into the negative side
  return r;
}

/** True when `v` is an Integer-shaped numeric (Integer or integer-Real).
 *  Used by the modular ops to decide between the native BigInt path
 *  and the Giac symbolic path. */
function _isIntLike(v) {
  if (isInteger(v)) return true;
  if (isReal(v)) return v.value.isFinite() && v.value.isInteger();
  return false;
}

/** Either ADDTMOD / SUBTMOD / MULTMOD shipped through this small
 *  helper since the three differ only in the BigInt op and the Giac
 *  command builder.  `intOp` is the native BigInt combiner; `giacOp`
 *  is the infix operator string (`+`, `-`, `*`). */
function _modBinary(s, intOp, giacOp) {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    const ba = isInteger(a) ? a.value : BigInt(a.value.toFixed(0));
    const bb = isInteger(b) ? b.value : BigInt(b.value.toFixed(0));
    s.push(Integer(_centerMod(intOp(ba, bb), m)));
    return;
  }
  // Symbolic / Name / Rational path — route through Giac.  Either side
  // may already be a Symbolic; the other coerces to AST via _toAst.
  // Reject anything _toAst can't handle.
  const lAst = _toAst(a), rAst = _toAst(b);
  if (!lAst || !rAst) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(
    AstBin(giacOp, lAst, rAst),
    (e) => `(${e}) mod ${m.toString()}`,
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
}

register('MODSTO', (s) => {
  const [v] = s.popN(1);
  // HP50 AUR §3-150: any integer or integer-valued expression.  Names
  // and Symbolics that don't fold to a numeric Integer can't define a
  // valid modulus — reject them at this layer.
  if (!_isIntLike(v)) throw new RPLError('Bad argument type');
  const m = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
  // setCasModulo handles the abs / 0|1 → 2 normalization (state.js).
  setCasModulo(m);
});

register('ADDTMOD', (s) => _modBinary(s, (a, b) => a + b, '+'));
register('SUBTMOD', (s) => _modBinary(s, (a, b) => a - b, '-'));
register('MULTMOD', (s) => _modBinary(s, (a, b) => a * b, '*'));

register('POWMOD', (s) => {
  const [a, e] = s.popN(2);
  const m = getCasModulo();
  // Native fast path: both base and exponent integer-typed.  HP50
  // AUR §3-175 doesn't say what happens for a negative exponent;
  // _powModBig assumes e ≥ 0, so we reject negatives explicitly to
  // surface a clean error rather than producing garbage.
  if (_isIntLike(a) && _isIntLike(e)) {
    const ba = isInteger(a) ? a.value : BigInt(a.value.toFixed(0));
    const be = isInteger(e) ? e.value : BigInt(e.value.toFixed(0));
    if (be < 0n) throw new RPLError('Bad argument value');
    // _powModBig already reduces into [0, m); re-center afterwards to
    // match the ADDTMOD/SUBTMOD/MULTMOD convention.
    const r = _powModBig(ba, be, m);
    s.push(Integer(_centerMod(r, m)));
    return;
  }
  // Symbolic / Name path — Giac's `powmod(base, exp, m)` does the
  // polynomial-modular exponentiation (HP50 AUR §3-175 mirror).
  const lAst = _toAst(a), rAst = _toAst(e);
  if (!lAst || !rAst) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  // Use buildGiacCmd with a placeholder AstBin('+', l, r) just so the
  // helper sees both subexpressions through one AST — the resulting
  // Giac string is discarded by `buildCmd` which rebuilds the actual
  // `powmod(base,exp,m)` call from the two halves directly.
  const cmd = buildGiacCmd(
    AstBin('+', lAst, rAst),
    (_) => `powmod(${astToGiac(lAst)},${astToGiac(rAst)},${m.toString()})`,
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
});

/* ------------------------------------------------------------------
   EXPANDMOD / FACTORMOD / GCDMOD / DIVMOD / DIV2MOD

   The remaining five !Þ MODULO ARITH ops (companions to MODSTO +
   ADDTMOD/SUBTMOD/MULTMOD/POWMOD).  All five read the same
   `state.casModulo` slot via `getCasModulo()`; none of them mutate
   it.  HP50 AUR §3-80 / §3-83 / §3-96 / §3-63 / §3-62.

   Stack contracts (mirror the AUR — numeric-or-symbolic):
     EXPANDMOD     ( a    → a' )           coefficient-reduce + expand
     FACTORMOD     ( p    → factored )     factorization in Z_m[X]
     GCDMOD        ( a b  → gcd )          GCD over Z_m[X]
     DIVMOD        ( a b  → quotient )     a · b⁻¹ mod m  (rational)
     DIV2MOD       ( a b  → q r )          Euclidean div: q on level 2,
                                           r on level 1

   Pure-integer operands (Integer / integer-valued Real on every level)
   take a native BigInt fast path that returns the centered representative
   `_centerMod(...)` (matches the ADDTMOD/SUBTMOD/MULTMOD convention).
   DIVMOD / DIV2MOD additionally require the divisor to
   be invertible mod m (gcd(b, m) = 1) — the HP50 User Guide p.5-14
   examples ("12/8 (mod 12) does not exist") show this rejection
   surfaces as `Bad argument value`.

   Symbolic / Name operands route through Giac with the inline
   `(... ) mod m` postfix wrapping the underlying call (`expand`,
   `factor`, `gcd`, `/`, `quo`, `rem`).  Result lifts back through
   `giacToAst` + `_astToRplValue` so a numeric-leaf result lands as
   Real and a polynomial result stays Symbolic.  No-fallback policy:
   Giac not ready → `CAS not ready`.

   FACTORMOD additionally validates the modulus per HP50 AUR p.3-83
   ("the modulus must be less than 100, and a prime number") — any
   other modulus raises `Bad argument value` rather than letting Giac
   silently return a non-unique factorization over a non-prime ring.
   ------------------------------------------------------------------ */

register('EXPANDMOD', (s) => {
  const v = s.pop();
  const m = getCasModulo();
  if (_isIntLike(v)) {
    // EXPANDMOD on a bare integer is just the centered representative
    // of `v` mod m — User Guide p.5-15 EXPANDMOD(125) ≡ 5 (mod 12).
    const ba = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
    s.push(Integer(_centerMod(ba, m)));
    return;
  }
  const a = _toAst(v);
  if (!a) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(a, (e) => `expand(${e}) mod ${m.toString()}`);
  s.push(_astToRplValue(giacToAst(giac.caseval(cmd))));
});

register('FACTORMOD', (s) => {
  const m = getCasModulo();
  // AUR p.3-83 modulus precondition.  Validate before consuming the
  // arg so a bad modulus surfaces independently of the operand type.
  if (m >= 100n || !_isPrimeBig(m)) {
    throw new RPLError('Bad argument value');
  }
  const v = s.pop();
  if (_isIntLike(v)) {
    // Integer "factorization" mod prime p collapses to the centered
    // representative — every nonzero element of Z/pZ is a unit, so
    // the only "factor" is the value itself.  HP50 firmware does
    // the same: a bare Integer round-trips as itself centered.
    const ba = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
    s.push(Integer(_centerMod(ba, m)));
    return;
  }
  const a = _toAst(v);
  if (!a) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(a, (e) => `factor(${e}) mod ${m.toString()}`);
  s.push(_astToRplValue(giacToAst(giac.caseval(cmd))));
});

register('GCDMOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    const ba = isInteger(a) ? a.value : BigInt(a.value.toFixed(0));
    const bb = isInteger(b) ? b.value : BigInt(b.value.toFixed(0));
    // gcd(0,0) is undefined per HP50 (matches EUCLID's contract).
    if (ba === 0n && bb === 0n) throw new RPLError('Bad argument value');
    const { g } = _extGcdBigInt(ba, bb);
    s.push(Integer(_centerMod(g, m)));
    return;
  }
  const lAst = _toAst(a), rAst = _toAst(b);
  if (!lAst || !rAst) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(
    AstBin('+', lAst, rAst),    // dummy bin for free-var detection only
    () => `gcd(${astToGiac(lAst)},${astToGiac(rAst)}) mod ${m.toString()}`,
  );
  s.push(_astToRplValue(giacToAst(giac.caseval(cmd))));
});

/** Native modular division on BigInts.  Two paths:
 *
 *  1. **Exact integer division.**  When `bb` divides `ba` exactly,
 *     return `ba / bb` regardless of whether `bb` is invertible mod m.
 *     This matches the HP50 User Guide p.5-14 examples
 *     (12/3 ≡ 4 mod 12 even though gcd(3,12)=3; 66/6 ≡ -1 mod 12
 *     even though gcd(6,12)=6).  The integer quotient takes priority
 *     because the modular reduction simply post-applies to the
 *     pre-existing integer answer.
 *
 *  2. **Modular inverse fallback.**  Otherwise reduce `bb` mod m and
 *     solve `b·x ≡ a (mod m)`; throws `Bad argument value` when `b`
 *     is not invertible (matches "12/8 (mod 12) does not exist"). */
function _modDivBigInt(ba, bb, m) {
  if (bb === 0n) throw new RPLError('Bad argument value');
  if (ba % bb === 0n) return ba / bb;
  let raB = bb % m;
  if (raB < 0n) raB += m;
  if (raB === 0n) throw new RPLError('Bad argument value');
  const { g, s: u } = _extGcdBigInt(raB, m);
  if (g !== 1n) throw new RPLError('Bad argument value');
  let invB = u % m;
  if (invB < 0n) invB += m;
  return ba * invB;
}

register('DIVMOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    const ba = isInteger(a) ? a.value : BigInt(a.value.toFixed(0));
    const bb = isInteger(b) ? b.value : BigInt(b.value.toFixed(0));
    s.push(Integer(_centerMod(_modDivBigInt(ba, bb, m), m)));
    return;
  }
  const lAst = _toAst(a), rAst = _toAst(b);
  if (!lAst || !rAst) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  // DIVMOD's polynomial path is the rational form `a/b mod m` —
  // AUR §3-63 example DIVMOD(5*X^2+4*X+2, X^2+1) mod 3 returns
  // `-((X^2-X+1)/X^2+1))`.
  const cmd = buildGiacCmd(
    AstBin('+', lAst, rAst),
    () => `(${astToGiac(lAst)})/(${astToGiac(rAst)}) mod ${m.toString()}`,
  );
  s.push(_astToRplValue(giacToAst(giac.caseval(cmd))));
});

register('DIV2MOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    // Integer DIV2MOD: treat operands as 0-degree polynomials in
    // Z_m[X].  User Guide p.5-14 examples (125/17 mod 12 → 1 r 0;
    // 68/7 mod 12 → -4 r 0) show the same a·b⁻¹ semantics as DIVMOD,
    // with remainder defined as `a - q·b` reduced and centered.
    const ba = isInteger(a) ? a.value : BigInt(a.value.toFixed(0));
    const bb = isInteger(b) ? b.value : BigInt(b.value.toFixed(0));
    const q = _centerMod(_modDivBigInt(ba, bb, m), m);
    const r = _centerMod(ba - q * bb, m);
    s.push(Integer(q));
    s.push(Integer(r));
    return;
  }
  const lAst = _toAst(a), rAst = _toAst(b);
  if (!lAst || !rAst) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  // Two Giac calls (one for `quo`, one for `rem`) is simpler than
  // parsing a list response from `divmod(a, b, m)`.  AUR §3-62
  // worked example DIV2MOD(X^3+4, X^2-1) mod 3 → {X, X+1}.
  const lStr = astToGiac(lAst), rStr = astToGiac(rAst);
  const cmdQ = buildGiacCmd(AstBin('+', lAst, rAst),
    () => `quo(${lStr},${rStr}) mod ${m.toString()}`);
  const cmdR = buildGiacCmd(AstBin('+', lAst, rAst),
    () => `rem(${lStr},${rStr}) mod ${m.toString()}`);
  s.push(_astToRplValue(giacToAst(giac.caseval(cmdQ))));
  s.push(_astToRplValue(giacToAst(giac.caseval(cmdR))));
});

/** Log-gamma via the same Lanczos coefficients as _gamma.  Implemented
 *  directly rather than as Math.log(_gamma(x)) so we stay finite for
 *  large x — Γ(200) overflows IEEE double, but ln Γ(200) ≈ 857.9 is
 *  well within range.  Uses the reflection formula for x < 0.5 so the
 *  domain is all real x except the non-positive integers (poles — the
 *  caller handles those).  Returns the natural log of |Γ(x)|; for
 *  negative non-integer x the true LNGAMMA has an imaginary part of
 *  k·πi depending on which reflection we cross.  HP50 LNGAMMA is
 *  real-valued (AUR §3-CAS), so we track |Γ| only.  */
function _lngamma(x) {
  if (x < 0.5) {
    // ln Γ(x) = ln π − ln|sin πx| − ln Γ(1 − x)
    const sinPx = Math.sin(Math.PI * x);
    if (sinPx === 0) throw new RPLError('Infinite result');
    return Math.log(Math.PI) - Math.log(Math.abs(sinPx)) - _lngamma(1 - x);
  }
  const y = x - 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (y + i);
  const t = y + _LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

function _gammaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('GAMMA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  // Integer-valued inputs at the non-positive integers are poles.
  if (Number.isInteger(x) && x <= 0) throw new RPLError('Infinite result');
  // Non-negative integer — exact factorial via Γ(n) = (n-1)!.
  if (isInteger(v) && v.value > 0n) {
    return Integer(_bigFactorial(v.value - 1n));
  }
  return Real(_gamma(x));
}

function _lngammaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('LNGAMMA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (Number.isInteger(x) && x <= 0) throw new RPLError('Infinite result');
  return Real(_lngamma(x));
}

register('GAMMA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_gammaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_gammaScalar))));
  else                  s.push(_gammaScalar(v));
})));

register('LNGAMMA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_lngammaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_lngammaScalar))));
  else                  s.push(_lngammaScalar(v));
})));

/* ---- PSI — digamma + polygamma ----------------------
   HP50 AUR §2 (CAS-SPECIAL).  One- and two-argument forms.

     PSI  ( x → ψ(x) )             1-arg: digamma  ψ(x) = Γ'(x)/Γ(x)
     PSI  ( x n → ψ^(n)(x) )       2-arg: n-th polygamma (n ≥ 0 integer).
                                   n = 0 is equivalent to the 1-arg form.

   Dispatch: if the top-of-stack is a non-negative Integer (or integer-
   valued Real) AND there is a second argument below it, the op is the
   two-arg form.  Otherwise 1-arg.  This matches the HP50 firmware
   convention used by the same command.

   Domain: both forms throw `Infinite result` at non-positive integers
   (the poles of ψ and its derivatives) and `Bad argument value` on
   non-finite input.  Symbolic / Name inputs lift to `PSI(x)` or
   `PSI(x, n)` AST nodes so round-trip through the parser is exact.

   Numerical implementation (real x, real n):
     - Digamma: reflection for x < 0.5 (ψ(1−x) − π cot πx), then
       integer-shift recurrence ψ(x+1) = ψ(x) + 1/x up to x ≥ 8,
       then the Bernoulli asymptotic
           ψ(x) ≈ ln x − 1/(2x) − Σ_k B_{2k}/(2k · x^{2k})
       truncated at 2k = 12 (gives ~1e−13 error at x = 8).
     - Polygamma (n ≥ 1): shift x up via
           ψ^(n)(x) = ψ^(n)(x+1) + (−1)^(n+1) n! / x^(n+1)
       accumulated as a running tail sum, then the asymptotic
           ψ^(n)(y) ≈ (−1)^(n+1) [(n−1)!/y^n + n!/(2 y^{n+1})
                    + Σ_k B_{2k} (2k+n−1)!/(2k)! / y^{2k+n}]
       with the same 2k = 12 truncation.
*/

function _digamma(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  // Reflection: ψ(x) = ψ(1 − x) − π cot(πx).  Used for x < 0.5 so the
  // recurrence-and-asymptotic pair below always starts with x ≥ 0.5.
  if (x < 0.5) {
    return _digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  }
  let r = 0;
  while (x < 8) { r -= 1 / x; x += 1; }
  const xi  = 1 / x;
  const xi2 = xi * xi;
  r += Math.log(x) - 0.5 * xi;
  // − Σ_k B_{2k}/(2k) · x^−2k   with  B_2..B_12 signs absorbed into
  // the factored Horner form below (alternating subtraction/addition).
  r -= xi2 * (1/12 - xi2 * (1/120 - xi2 * (1/252 - xi2 * (1/240
       - xi2 * (1/132 - xi2 * 691/32760)))));
  return r;
}

function _polygamma(n, x) {
  if (n === 0) return _digamma(x);
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  if (x < 0.5) {
    // Reflection for polygamma is messier than digamma (involves
    // d^n/dx^n cot πx).  For the expected use cases (integer n ≥ 1,
    // x not tiny-positive) we instead shift up from any positive-real
    // starting point using the recurrence tail sum; for x < 0.5 we
    // use the same recurrence but accept more shift iterations.
    let r = 0;
    const sgnShift = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
    let nf = 1;
    for (let i = 2; i <= n; i++) nf *= i;
    let y = x;
    while (y < 10) {
      r += sgnShift * nf * Math.pow(y, -(n + 1));
      y += 1;
    }
    return r + _polygammaAsymptotic(n, y);
  }
  const sgnShift = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
  let nf = 1;
  for (let i = 2; i <= n; i++) nf *= i;
  let y = x;
  let tail = 0;
  while (y < 10) {
    tail += Math.pow(y, -(n + 1));
    y += 1;
  }
  return sgnShift * nf * tail + _polygammaAsymptotic(n, y);
}

function _polygammaAsymptotic(n, y) {
  // (−1)^(n+1) · [(n−1)!/y^n + n!/(2 y^{n+1}) + Σ B_{2k} rf(2k)/y^{2k+n}]
  // where rf(2k) = (2k+1)(2k+2)…(2k+n−1) = (2k+n−1)!/(2k)! — evaluated
  // by a (n−1)-term running product.
  const sgn = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
  let nm1f = 1;
  for (let i = 2; i <= n - 1; i++) nm1f *= i;
  let nf = nm1f * n;
  let out = nm1f * Math.pow(y, -n) + (nf / 2) * Math.pow(y, -(n + 1));
  // B_{2k} for k = 1..6
  const B = [1/6, -1/30, 1/42, -1/30, 5/66, -691/2730];
  for (let k = 1; k <= B.length; k++) {
    const twoK = 2 * k;
    let rf = 1;
    for (let i = 1; i <= n - 1; i++) rf *= (twoK + i);
    out += B[k - 1] * rf * Math.pow(y, -(twoK + n));
  }
  return sgn * out;
}

function _psiScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('PSI', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_digamma(x));
}

function _polygammaScalar(n, v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('PSI', [_toAst(v), AstNum(n)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_polygamma(n, x));
}

register('PSI', (s) => {
  if (s.depth === 0) throw new RPLError('Too few arguments');
  // Two-arg dispatch: top is an Integer / integer-valued Real n ≥ 0,
  // and there is a second argument below.  Matches HP50 firmware.
  if (s.depth >= 2) {
    const top = s.peek(1);
    let n = null;
    if (isInteger(top)) {
      n = Number(top.value);
    } else if (isReal(top) && top.value.isFinite() &&
               top.value.isInteger()) {
      n = top.value.toNumber();
    }
    if (n !== null && n >= 0) {
      const [x] = s.popN(2).slice(0, 1);   // popN returns [x, n]
      // (n is discarded here — we already read it above)
      if (isList(x)) {
        s.push(RList(x.items.map(it => _polygammaScalar(n, it))));
      } else if (isTagged(x)) {
        s.push(Tagged(x.tag, _polygammaScalar(n, x.value)));
      } else {
        s.push(_polygammaScalar(n, x));
      }
      return;
    }
  }
  // 1-arg: digamma.  List / Tagged dispatch mirrors GAMMA / LNGAMMA.
  const v = s.pop();
  if (isList(v)) {
    s.push(RList(v.items.map(_psiScalar)));
  } else if (isTagged(v)) {
    s.push(Tagged(v.tag, _psiScalar(v.value)));
  } else if (isVector(v)) {
    s.push(Vector(v.items.map(_psiScalar)));
  } else if (isMatrix(v)) {
    s.push(Matrix(v.rows.map(r => r.map(_psiScalar))));
  } else {
    s.push(_psiScalar(v));
  }
});

/** Regularised upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a).
 *  Implementation follows Numerical Recipes (Press et al.) §6.2:
 *
 *    - For x < a + 1 use the lower-incomplete series  P(a, x)
 *      (converges quickly in this regime) and return 1 − P.
 *    - For x ≥ a + 1 use the upper-incomplete continued fraction
 *      (converges quickly in this regime) and return directly.
 *
 *  Precondition: a > 0, x ≥ 0.  The UTPC op enforces both.
 *  Precision: ≲ 1e-12 over the whole domain in double precision —
 *  comfortably inside the HP50 STAT-DIST 10-digit display.  */
function _regGammaQ(a, x) {
  if (x === 0) return 1;
  if (x < a + 1) {
    // Series for the lower-incomplete.  P(a,x) = γ(a,x) / Γ(a).
    let sum = 1 / a, term = 1 / a, n = 1;
    while (n < 1000) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      n++;
    }
    const P = sum * Math.exp(-x + a * Math.log(x) - _lngamma(a));
    return 1 - P;
  }
  // Continued fraction for the upper-incomplete.  Γ(a,x) / Γ(a).
  // Lentz's algorithm with a sentinel to avoid division by zero.
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - _lngamma(a));
}

/** Scalar dispatcher for UTPC.
 *  Accepts Integer or Real for both ν (degrees of freedom, must be a
 *  strictly positive integer value) and x (chi-square variate, must be
 *  finite).  Returns Real.  Throws RPLError on type or value errors so
 *  it composes cleanly through _withListBinary / _withTaggedBinary. */
function _utpcScalar(nu, x) {
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const n = asReal(nu), X = asReal(x);
  // Degrees of freedom must be a strictly positive integer — HP50
  // AUR describes UTPC in terms of integer ν only, and non-integer
  // "degrees" don't correspond to any standard table.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new RPLError('Bad argument value');
  }
  // x < 0 has no chi-square support; the tail is P(X > x) = 1.  We
  // accept it cleanly (matches how UTPN accepts any real x); only
  // non-finite x is rejected.
  if (!Number.isFinite(X)) throw new RPLError('Bad argument value');
  if (X <= 0) return Real(1);
  return Real(_regGammaQ(n / 2, X / 2));
}

register('UTPC', _withTaggedBinary(_withListBinary((s) => {
  const [nu, x] = s.popN(2);
  s.push(_utpcScalar(nu, x));
})));

/* ============================================================
   Beta-family special functions + STAT-DIST UTPF / UTPT + erf /
   erfc.

   Builds on the UTPC machinery:
     - `_regGammaQ(a, x)` (upper-incomplete, already registered
       under UTPC) and its complement P(a, x) = 1 − Q(a, x)
       drive erf / erfc.
     - A new `_regBetaI(a, b, x)` regularised incomplete beta
       function (Numerical Recipes §6.4) drives both UTPF and
       UTPT.  Single implementation, two HP50 entry points.

   New functions in this block:
     - `_regGammaP(a, x)` — lower-incomplete, direct route (avoids
       the 1 − Q cancellation for small x).
     - `_betaCF(a, b, x)` — NR §6.4 Lentz continued fraction.
     - `_regBetaI(a, b, x)` — public regularised beta entry point.
     - `_betaScalar(a, b)` — scalar dispatcher for the Beta op.
     - `_erfScalar(v)` / `_erfcScalar(v)` — scalar dispatchers.
     - `_utpcScalar(nu, x)` / `_utptScalar(nu, t)` — scalar dispatchers
       for UTPC and UTPT; enable _withListBinary / _withTaggedBinary lift.

   New HP50 ops:
     - `Beta`   — Β(a, b) = Γ(a)Γ(b)/Γ(a+b).  Exact factorial path
                  for positive integers; Lanczos log form for general
                  reals.  Tagged + List + Sym lift.
     - `erf`    — ∫₀ˣ (2/√π) e^(−t²) dt via P(1/2, x²).  Tagged + List
                  + V/M + Sym lift.
     - `erfc`   — 1 − erf(x) via Q(1/2, x²) for |x| > 0 (no
                  cancellation).  Tagged + List + V/M + Sym lift.
     - `UTPF(n, d, F)` — F-distribution upper tail (bare handler;
                  L/V/M not supported — 3-arg; no _withListBinary shape).
     - `UTPT(ν, t)`    — Student-t upper tail. Tagged + List lift.
   ============================================================ */

/** Regularised lower incomplete gamma P(a, x) = γ(a, x) / Γ(a).
 *  Mirrors _regGammaQ but returns the direct lower-incomplete value.
 *  The series form (x < a+1) is numerically well-behaved for erf's
 *  small-x regime; for x ≥ a+1 we delegate to Q via 1 − Q (this is
 *  where the cancellation would bite, which is why erfc uses Q there
 *  rather than erfc = 1 − erf).  */
function _regGammaP(a, x) {
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a, n = 1;
    while (n < 1000) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      n++;
    }
    return sum * Math.exp(-x + a * Math.log(x) - _lngamma(a));
  }
  return 1 - _regGammaQ(a, x);
}

/** Continued-fraction evaluation for I_x(a, b).  Numerical Recipes
 *  §6.4 Lentz form.  1000-iteration cap, 1e-16 convergence target,
 *  1e-300 denominator sentinel.  Precondition: 0 < x < 1.  */
function _betaCF(a, b, x) {
  const EPS = 1e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b) = B(x; a, b) / B(a, b).
 *  NR §6.4.  Uses the symmetry I_x(a,b) = 1 − I_{1-x}(b,a) to keep
 *  both sides in the fast-converging regime of the continued fraction.
 *  Precondition: a > 0, b > 0, 0 ≤ x ≤ 1.  */
function _regBetaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    _lngamma(a + b) - _lngamma(a) - _lngamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * _betaCF(a, b, x) / a;
  }
  return 1 - bt * _betaCF(b, a, 1 - x) / b;
}

/** Scalar Beta(a, b).  Positive-integer args route to exact factorials
 *  so Β(5, 3) = 1/105 returns as a reduced rational (here — since the
 *  result fits a double — we return Real(1/105) = 0.00952...).  For
 *  general real args we use the log form exp(lnΓ(a)+lnΓ(b)-lnΓ(a+b))
 *  to avoid intermediate overflow in Γ.  */
function _betaScalar(a, b) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    return Symbolic(AstFn('Beta', [_toAst(a), _toAst(b)]));
  }
  const aNum = isInteger(a) ? Number(a.value) : isReal(a) ? a.value.toNumber() : null;
  const bNum = isInteger(b) ? Number(b.value) : isReal(b) ? b.value.toNumber() : null;
  if (aNum === null || bNum === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
    throw new RPLError('Bad argument value');
  }
  // Poles: non-positive-integer a or b → Γ(a) or Γ(b) is infinite.
  if ((Number.isInteger(aNum) && aNum <= 0) ||
      (Number.isInteger(bNum) && bNum <= 0)) {
    throw new RPLError('Infinite result');
  }
  return Real(Math.exp(_lngamma(aNum) + _lngamma(bNum) - _lngamma(aNum + bNum)));
}

/** Scalar erf(x) = sign(x) · P(1/2, x²).  Avoids the cancellation of
 *  the raw series near 0 by routing through the regularised gamma
 *  helper already in the file.  Domain extends to all real x.  */
function _erfScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('erf', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) return Real(0);
  return Real((x < 0 ? -1 : 1) * _regGammaP(0.5, x * x));
}

/** Scalar erfc(x) = 1 − erf(x).  For x > 0 we use Q(1/2, x²) directly
 *  so the returned value never suffers from the 1 − erf(x) → 0
 *  cancellation when erf(x) is near 1 (e.g. erfc(5) ≈ 1.537e-12,
 *  which 1 − erf(5) cannot represent to any useful precision).  */
function _erfcScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('erfc', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) return Real(1);
  if (x > 0) return Real(_regGammaQ(0.5, x * x));
  // x < 0: erfc(x) = 2 − erfc(−x) = 1 + erf(|x|).
  return Real(1 + _regGammaP(0.5, x * x));
}

register('Beta', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  s.push(_betaScalar(a, b));
})));

register('erf', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_erfScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_erfScalar))));
  else                  s.push(_erfScalar(v));
})));

register('erfc', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_erfcScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_erfcScalar))));
  else                  s.push(_erfcScalar(v));
})));

/** UTPF(n, d, F) — F-distribution upper tail P(X > F) where X ~ F(n, d).
 *  Via the textbook relation UTPF = I_{d/(d+nF)}(d/2, n/2) — the
 *  incomplete-beta closed form from Abramowitz & Stegun 26.6.2.
 *  HP50 AUR requires n, d to be strictly positive integers.  F may be
 *  any real; F ≤ 0 short-circuits to 1 (the F distribution has support
 *  F ≥ 0, so the upper tail at non-positive F is trivially the whole
 *  distribution).  */
register('UTPF', (s) => {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [n, d, F] = s.popN(3);
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const nv = asReal(n), dv = asReal(d), Fv = asReal(F);
  if (!Number.isFinite(nv) || !Number.isInteger(nv) || nv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(dv) || !Number.isInteger(dv) || dv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(Fv)) throw new RPLError('Bad argument value');
  if (Fv <= 0) { s.push(Real(1)); return; }
  // A&S 26.6.2:  P(X > F) = I_w(d/2, n/2),  w = d / (d + nF).
  const w = dv / (dv + nv * Fv);
  s.push(Real(_regBetaI(dv / 2, nv / 2, w)));
});

/** Scalar dispatcher for UTPT.
 *  Accepts Integer or Real for both ν (degrees of freedom, must be a
 *  strictly positive integer value) and t (t-statistic, must be finite).
 *  Returns Real.  Throws RPLError on type or value errors so it composes
 *  cleanly through _withListBinary / _withTaggedBinary.
 *
 *  Closed-form via incomplete beta (A&S 26.7.3):
 *      P(|T| > |t|) = I_{ν/(ν+t²)}(ν/2, 1/2)
 *  so P(T > t) = 1/2 · I_{ν/(ν+t²)}(ν/2, 1/2)           for t ≥ 0,
 *     P(T > t) = 1 − 1/2 · I_{ν/(ν+t²)}(ν/2, 1/2)       for t < 0.
 *  At t = 0 the tail is exactly 0.5 (the t distribution is symmetric
 *  about 0); we return Real(0.5) without going through the CF.
 *  HP50 requires ν a strictly positive integer — non-integer "degrees
 *  of freedom" don't match any standard Student-t table.  */
function _utptScalar(nu, t) {
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const nv = asReal(nu), tv = asReal(t);
  if (!Number.isFinite(nv) || !Number.isInteger(nv) || nv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(tv)) throw new RPLError('Bad argument value');
  if (tv === 0) return Real(0.5);
  const w = nv / (nv + tv * tv);
  const I = _regBetaI(nv / 2, 0.5, w);
  return Real(tv > 0 ? 0.5 * I : 1 - 0.5 * I);
}

register('UTPT', _withTaggedBinary(_withListBinary((s) => {
  const [nu, t] = s.popN(2);
  s.push(_utptScalar(nu, t));
})));

/* ------------------- angle-mode commands ------------------- */
register('DEG', () => setAngle('DEG'));
register('RAD', () => setAngle('RAD'));
register('GRD', () => setAngle('GRD'));
// HP50 also accepts GRAD as an alias in some firmware versions.
register('GRAD', () => setAngle('GRD'));

/* -------------------- angle conversion helpers --------------------
   R→D (radians to degrees) and D→R (degrees to radians) operate on
   level 1 regardless of the active mode — they're explicit converters.
   ----------------------------------------------------------------- */
register('R→D', unaryReal(r => r * 180 / Math.PI));
register('D→R', unaryReal(d => d * Math.PI / 180));
// ASCII-friendly aliases matching what a user can type from a keyboard.
register('R->D', unaryReal(r => r * 180 / Math.PI));
register('D->R', unaryReal(d => d * Math.PI / 180));

/* ------------------------------------------------------------------
   Variables — STO / RCL / PURGE / VARS

   HP50 stack order for STO:
     level 2: value
     level 1: name (a Name object — typed as 'X' on the command line)
   STO consumes both and writes the value to the current directory.

   RCL, PURGE each take a name on level 1.  VARS takes no input and
   pushes a list of the current directory's variable names.

   We accept either a Name or a String for the name argument — the HP50
   accepts both, and entering plain text like "X" at the cmdline
   already parses to a Name.
   ------------------------------------------------------------------ */

function popNameId(s) {
  const v = s.pop();
  if (isName(v))   return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}

function _storeOneOrRPL(id, value) {
  try { varStore(id, value); }
  catch (e) {
    // varStore throws a plain Error('Directory not allowed: <id>') if
    // the name already refers to a subdirectory.  Convert so IFERR
    // catches and ERRN classifies.
    throw new RPLError(e.message || 'Bad argument value');
  }
}

register('STO', (s) => {
  // level 2 = value, level 1 = name (or list of names — HP50 AUR
  // stores the same value into each listed name, left-to-right).
  const [value, nameVal] = s.popN(2);
  if (isList(nameVal)) {
    for (const item of nameVal.items) {
      _storeOneOrRPL(_coerceStorableName(item), value);
    }
    return;
  }
  _storeOneOrRPL(_coerceStorableName(nameVal), value);
});

function _recallOneOrRPL(id) {
  const v = varRecall(id);
  if (v === undefined) throw new RPLError(`Undefined name: ${id}`);
  return v;
}

register('RCL', (s) => {
  // A list of names recalls each in order, pushing their values onto
  // the stack — matches HP50 AUR and the PURGE / STO list-shaped
  // conventions.  Single Name / String path unchanged.
  const v = s.pop();
  if (isList(v)) {
    for (const item of v.items) {
      s.push(_recallOneOrRPL(_coerceDirName(item)));
    }
    return;
  }
  s.push(_recallOneOrRPL(_coerceDirName(v)));
});

function _purgeOneOrRPL(id) {
  let gone;
  try { gone = varPurge(id); }
  catch (e) {
    // varPurge throws a plain Error('Directory not empty: <id>') for
    // non-empty subdirectories.  Wrap so IFERR can trap it.
    throw new RPLError(e.message || 'Bad argument value');
  }
  // HP50 PURGE on a missing variable errors quietly; mimic that with a
  // descriptive RPLError (the UI will flash it on the cmdline).
  if (!gone) throw new RPLError(`Undefined name: ${id}`);
}

register('PURGE', (s) => {
  const v = s.pop();
  if (isList(v)) {
    // HP50 convention (AUR §2.8): iterate left-to-right.  If any one
    // fails, earlier ones stay purged — no transactional rollback,
    // matching CRDIR's partial-commit behavior on the same shape.
    for (const item of v.items) {
      _purgeOneOrRPL(_coerceDirName(item));
    }
    return;
  }
  _purgeOneOrRPL(_coerceDirName(v));
});

register('VARS', (s) => {
  // Reverse-insertion order: the most-recently-stored / most-recently-
  // ORDERed name ends up at list[0], matching the left-to-right order
  // of names on a physical HP50 VAR menu (AUR §2.8).  ORDER has a
  // visible effect on this list, just in reversed orientation.
  s.push(RList(varOrder().slice().reverse().map(id => Name(id))));
});

/* ------------------------------------------------------------------
   TVARS — type-filtered VARS (AUR §3 p.2-261).

     n      TVARS  → { names }   names whose TYPE code == n
                                 (or != |n| when n < 0)
     {...}  TVARS  → { names }   union of positive type codes, minus
                                 any type codes listed as negatives

   Type codes match HP50 User Guide §2 (same table as the `TYPE` op);
   our `_hp50TypeCode` helper supplies them.  Non-integer Reals and
   non-integer Rationals are rejected as "Bad argument value".  Empty
   lists are accepted and select everything (HP50 parity — an empty
   include-set means "no positive filter applied").  Ordering of the
   returned list matches `VARS` (reverse-insertion), so CONT/KILL /
   repeated TVARS calls stay stable under ORDER.

   Follows HP50 semantics: only the current directory is searched
   (TVARS never walks up the dir chain — use PATH + VARS for that).
   ------------------------------------------------------------------ */
function _tvarsCoerceCode(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}

function _tvarsFilter(codes) {
  const include = new Set();
  const exclude = new Set();
  for (const n of codes) {
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new RPLError('Bad argument value');
    }
    if (n >= 0) include.add(n);
    else        exclude.add(-n);
  }
  const names = [];
  // Use the same reverse-insertion order as VARS so the returned list
  // is a drop-in filtered view.
  for (const id of varOrder().slice().reverse()) {
    const val = varRecall(id);
    if (val === undefined) continue;  // purged mid-walk — skip
    const code = _hp50TypeCode(val);
    if (include.size > 0 && !include.has(code)) continue;
    if (exclude.has(code)) continue;
    names.push(Name(id));
  }
  return names;
}

register('TVARS', (s) => {
  const v = s.pop();
  if (isList(v)) {
    const codes = v.items.map(_tvarsCoerceCode);
    s.push(RList(_tvarsFilter(codes)));
    return;
  }
  const code = _tvarsCoerceCode(v);
  s.push(RList(_tvarsFilter([code])));
});

/* ------------------------------------------------------------------
   Directory navigation — CRDIR / UPDIR / HOME / PATH.

   CRDIR  ( name  --  )    create an empty subdirectory of the current
                           dir, name supplied as a Name or String.
                           A List of names creates each in order.
                           HP50 does NOT descend into the new dir.

   UPDIR  ( -- )           cd to the current directory's parent.
                           No-op at HOME (matches HP50 silent behavior).

   HOME   ( -- )           cd to the root HOME directory.  Distinct
                           from the variable name 'HOME' — when typed
                           as a bare identifier at the cmdline, it
                           resolves to this op (ops beat variables in
                           the evalToken lookup order).

   PATH   ( -- list )      push a List of Names from HOME down to the
                           current directory.  Always starts with
                           Name('HOME').  `{ HOME }` at the root;
                           `{ HOME A B }` three levels deep.

   Name-argument handling matches STO/RCL/PURGE: either a Name or a
   String is accepted on level 1.  A List of Names (or Strings) is
   accepted by CRDIR for the "make several at once" shorthand that the
   HP50 UI exposes.
   ------------------------------------------------------------------ */

function _coerceDirName(v) {
  if (isName(v))   return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}

/**
 * Write-path name coercion.  Same shape as `_coerceDirName` but also
 * enforces HP50 §2.2.4 identifier rules (letters + digits + underscore,
 * ≤127 chars, starts with letter, not a reserved command name).  Used
 * by STO / STO+- etc. / CRDIR / SVX / STOF — anywhere a *new or
 * overwritten* variable binding is created.  Read-only paths (RCL,
 * PURGE, VARS) keep using `_coerceDirName` so they stay permissive and
 * can still address any name that already exists in a directory.  The
 * HP50 itself raises "Invalid name" for these cases; we use the same
 * wording so ERRN picks up a recognisable code.
 */
function _coerceStorableName(v) {
  const id = _coerceDirName(v);
  if (!isValidHpIdentifier(id)) {
    throw new RPLError(`Invalid name: ${id}`);
  }
  if (!isStorableHpName(id)) {
    // Syntactically valid but reserved (e.g. 'SIN', 'STO').
    throw new RPLError(`Invalid name: ${id}`);
  }
  return id;
}

function _mkSubdirOrRPL(id) {
  try { makeSubdir(id); }
  catch (e) {
    // makeSubdir throws a plain Error on a name collision; convert to
    // RPLError so IFERR can trap it and ERRN can classify it.
    throw new RPLError(e.message || 'Bad argument value');
  }
}

register('CRDIR', (s) => {
  const v = s.pop();
  if (isList(v)) {
    // HP50 convention: iterate left-to-right, creating each.  If any
    // one of them conflicts, the remainder are not created — but the
    // ones already created stand (we don't attempt a transactional
    // rollback, same as the real unit).
    for (const item of v.items) {
      _mkSubdirOrRPL(_coerceStorableName(item));
    }
    return;
  }
  _mkSubdirOrRPL(_coerceStorableName(v));
});

register('UPDIR', () => { goUp(); });

register('HOME',  () => { goHome(); });

register('PATH',  (s) => {
  s.push(RList(currentPath().map(seg => Name(seg))));
});

/* ------------------------------------------------------------------
   EVAL — the central evaluation primitive.

   Pops level 1 and dispatches by type:

     Program  → walk `.tokens` with a pointer (index-based).  At each
                token:
                  - If it's a bare Name whose uppercased id is a
                    control-flow opener (IF, WHILE, DO, START, FOR),
                    the control-flow handler takes over: it scans
                    forward through the token stream to find the
                    matching inner keywords (THEN/ELSE/REPEAT/UNTIL)
                    and closer (END/NEXT/STEP), honoring nested blocks,
                    and executes the appropriate sub-ranges.
                  - Bare closer/inner keywords found at the top of a
                    Program (no matching opener) are simply skipped —
                    HP50 ignores them in this context too.
                  - Otherwise the token is evaluated normally: op
                    lookup for bare Names, RCL-and-EVAL for bound
                    names, push-back for everything else.

     Name     → if bound, push the binding and EVAL it; else push.
     Tagged   → strip the tag and EVAL the inner value.
     Numeric / String / List / Vector / Matrix / Symbolic / Directory
              → push back unchanged (EVAL is idempotent for these).

   Atomicity: the full stack array is snapshotted at entry; if any
   inner op or sub-EVAL throws an RPLError, the stack is rolled back
   to its pre-EVAL state and the error is re-thrown.  This matches
   what users expect from `<< ... >>` EVAL — the program either
   completes cleanly or the stack is unchanged.

   Recursion depth is bounded so a runaway recursive program can't
   blow the JS call stack and brick the page.
   ------------------------------------------------------------------ */

const MAX_EVAL_DEPTH = 256;

/* Control-flow keyword sets.  Openers begin a block that must be
   matched by a closer at the same nesting level.  Inner keywords
   (THEN/ELSE/REPEAT/UNTIL) are block-internal separators.  These
   are NOT registered as ops — they're only meaningful while walking
   a Program's token stream, and are recognized here by name.
   CASE has an inner grammar of clauses of the shape
   `test THEN action END`, each clause self-delimited by its own END,
   with one extra outer END closing the CASE itself; handled by
   runCase.  CASE is still a CF_OPENER for the purposes of scanAtDepth0
   so a CASE nested inside another block counts toward that block's
   depth — but runCase never delegates to scanAtDepth0 across an
   OUTER boundary; it walks its own token range clause by clause. */
const CF_OPENERS = new Set(['IF', 'IFERR', 'WHILE', 'DO', 'START', 'FOR', 'CASE']);
const CF_CLOSERS = new Set(['END', 'NEXT', 'STEP']);
const CF_INNERS  = new Set(['THEN', 'ELSE', 'REPEAT', 'UNTIL']);

/** If tok is a bare (unquoted) Name, return its uppercased id; else null. */
function bareNameId(tok) {
  if (!isName(tok) || tok.quoted) return null;
  return tok.id.toUpperCase();
}

/** Scan `toks` starting at `from`, at the current block's depth 0,
 *  returning the first index whose bare-name id appears in `wanted`
 *  OR is a block closer.  Nested opener/closer pairs are skipped.
 *
 *  CASE is special: unlike IF/WHILE/DO/START/FOR/IFERR which each have
 *  a single closer, a CASE block contains N+1 depth-0 ENDs (one per
 *  inner THEN clause plus one outer END closing the CASE itself).  If
 *  scanAtDepth0 naively incremented/decremented `depth` on CASE, the
 *  very first inner END would appear to close the CASE — and any
 *  outer block containing that CASE would then mistake that inner END
 *  for its OWN closer.  To avoid that, when we encounter CASE we skip
 *  past the entire CASE (up to and including its outer END) in one
 *  step via `_skipPastCaseEnd`.
 *
 *  Returns { idx, kind } or null if we fall off the end. */
function scanAtDepth0(toks, from, wanted) {
  let depth = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (!id) { i++; continue; }
    if (id === 'CASE') {
      i = _skipPastCaseEnd(toks, i);
      continue;
    }
    if (CF_OPENERS.has(id)) { depth++; i++; continue; }
    if (CF_CLOSERS.has(id)) {
      if (depth === 0) return { idx: i, kind: id };
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && wanted && wanted.has(id)) {
      return { idx: i, kind: id };
    }
    i++;
  }
  return null;
}

/** Return the index immediately AFTER a CASE's outer END, given the
 *  index of the `CASE` opener.  Balancing rule:
 *    - start with pending = 1 (the CASE's own outer END)
 *    - each depth-0 THEN adds 1 to pending (another inner END coming)
 *    - each depth-0 END pays off one pending; pending = 0 → outer END
 *    - other CF openers increment a `nest` counter that is balanced
 *      by their own closers (and hides their internals from our count)
 *    - a nested CASE is handled by a recursive call so its own inner
 *      ENDs don't mistakenly decrement our pending count
 *  If the token stream ends before pending hits zero, return the end
 *  of the array so callers can report "CASE without END" cleanly. */
function _skipPastCaseEnd(toks, caseIdx) {
  let pending = 1;
  let nest = 0;
  let i = caseIdx + 1;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (id) {
      if (id === 'CASE') {
        i = _skipPastCaseEnd(toks, i);
        continue;
      }
      if (CF_OPENERS.has(id)) {
        nest++;
      } else if (CF_CLOSERS.has(id)) {
        if (nest > 0) nest--;
        else if (id === 'END') {
          pending--;
          if (pending === 0) return i + 1;
        }
        // NEXT / STEP at nest=0 inside a CASE is a malformed program.
        // We leave them as a no-op here; runCase's own dispatch will
        // fall through to the final `CASE without END` if they outnumber
        // their openers.
      } else if (nest === 0 && id === 'THEN') {
        pending++;
      }
    }
    i++;
  }
  return toks.length;
}

/* ------------------------------------------------------------------
   Compiled local environments — `→ a b … body`.

   HP50 AUR §21.1 defines a short-lived binding form that pops N values
   off the stack into lexically scoped locals for the duration of a
   single body evaluation.  Two body forms are accepted:

     → a b « … a + b … »      (program body; body is run)
     → a b 'a + b'            (algebraic body; body is EVAL'd)

   Frames are a LIFO stack owned by this module.  Name lookup in
   `evalToken` and the Name branch of `_evalValue` now consults
   `_localLookup` before the op table and the global variable store, so
   a local binding shadows both.  The frame is popped in a `finally`
   block so that an error or RPLAbort inside the body still unwinds the
   binding — leaks here would leave phantom vars visible to later code.

   The names themselves are captured as plain bare-name strings (not
   Name objects) and the frame is a `Map<string, Value>`.  Popping from
   the user's stack preserves HP50 convention: rightmost name → level 1.
   ------------------------------------------------------------------ */
const _localFrames = [];

function _localLookup(id) {
  for (let i = _localFrames.length - 1; i >= 0; i--) {
    const f = _localFrames[i];
    if (f.has(id)) return f.get(id);
  }
  return undefined;
}

function _pushLocalFrame(names, values) {
  const f = new Map();
  for (let i = 0; i < names.length; i++) f.set(names[i], values[i]);
  _localFrames.push(f);
  return f;
}

function _popLocalFrame() { _localFrames.pop(); }

/** Single-step debugger flag.  When `true`, `evalRange` yields after
 *  every token (in addition to the HALT-yield).  The SST / SST↓ /
 *  DBUG handlers manage this flag together with the haltedStack:
 *    - DBUG <prog>  : sets the flag, then EVALs the program — which
 *                     immediately yields before the first token,
 *                     suspending the program on the haltedStack so the
 *                     user can inspect the stack and step through it.
 *    - SST          : while a halted generator exists, drives gen.next()
 *                     exactly once.  Sets the flag, calls next() (which
 *                     causes evalRange to yield after one token), then
 *                     re-pushes the still-live generator onto the stack
 *                     so the next SST can resume from the next token.
 *                     Clears the flag if the generator finishes.
 *    - SST↓         : step-into.  Same drive mechanism as
 *                     SST but also sets `_stepInto = true` across the
 *                     gen.next() call.  `_evalValueGen` reads the flag
 *                     in its Program branch: with step-into active, it
 *                     leaves `_singleStepMode` set while running the
 *                     sub-program body, so the post-token yield inside
 *                     evalRange fires on each of the sub-program's
 *                     tokens.  Step-over (SST) temporarily clears the
 *                     flag around the body so the call completes in
 *                     one logical step.
 *  Module-private; tests reach it via the SST op or the public
 *  haltedDepth() / state.halted observers. */
let _singleStepMode = false;

/** `_stepInto` modulates whether single-stepping descends
 *  into sub-program calls reached via `evalToken` Name lookup.  SST
 *  leaves this `false` (step-over — the sub-program runs at full speed
 *  and we yield once after the call); SST↓ sets it `true` (step-into —
 *  the sub-program's own post-token yield fires on every inner token).
 *  The distinction only matters when a Name token resolves to a stored
 *  Program; for structural control-flow and ops that take a Program
 *  argument (IFT / IFTE / MAP / …) step-in is a no-op because those
 *  paths don't go through `_evalValueGen`. */
let _stepInto = false;

/** True while `evalRange` is running on a Program body reached via
 *  `evalToken` Name lookup (i.e. inside `_evalValueGen`'s Program
 *  branch).  Post-token yields check `(!_insideSubProgram ||
 *  _stepInto)` — in step-over mode this suppresses yielding inside the
 *  sub-program so one SST advances past the whole call; in step-into
 *  mode the check passes and the user stops on each inner token.  A
 *  module-private depth counter would also work; boolean is enough
 *  because yield conditions only care "are we inside a named sub-call
 *  right now", not how deeply nested the call chain is (step-into
 *  applies uniformly to every level once the user chose SST↓). */
let _insideSubProgram = false;

/** For tests: snapshot the current single-step flag without exposing
 *  the mutable binding.  Tests use this to pin the SST cleanup
 *  invariant (flag must be back to false once a stepped program
 *  finishes).  Also referenced from SST itself for the recursive
 *  drive — the local snapshot is what tells the post-yield code
 *  whether to re-push the generator. */
export function singleStepMode() { return _singleStepMode; }

/** For tests: snapshot the current step-into flag (SST vs SST↓).
 *  See the `_stepInto` docstring above for the distinction. */
export function stepIntoMode() { return _stepInto; }

/** Restore `_localFrames` to an earlier captured length.  Pops any
 *  extra entries that accumulated on top.  Used by `register('EVAL')`
 *  / `register('CONT')` in a top-level `finally` so that an abnormal
 *  unwind (non-RPLError throw, JS TypeError from a broken op, or an
 *  unanticipated path) can't leak a half-popped frame and poison the
 *  HALT pilot check that runs inside `evalRange`.  The normal path
 *  through `runArrow`'s own `finally` restores the length itself, so
 *  this is a no-op in the common case.  Kept internal to the module —
 *  no export needed. */
function _truncateLocalFrames(toLength) {
  while (_localFrames.length > toLength) _localFrames.pop();
}

/** Read-only view of the current local-frame depth.  Exposed so tests
 *  can assert the post-EVAL invariant `localFramesDepth() === 0` after
 *  a resetHome / resetState call. */
export function localFramesDepth() { return _localFrames.length; }

/** Execute a `→ n1 n2 … body` form starting at `toks[arrowIdx]`.
 *  Returns the index immediately past the body token.  Throws
 *  `RPLError` on malformed syntax or too-few stack values.  */
function* runArrow(s, toks, arrowIdx, to, depth) {
  // Collect consecutive bare (unquoted) Name tokens as local names.
  // Stop at the first non-Name / quoted-Name — that must be the body.
  const names = [];
  let i = arrowIdx + 1;
  while (i < to) {
    const t = toks[i];
    if (isName(t) && !t.quoted) {
      names.push(t.id);
      i++;
    } else {
      break;
    }
  }
  if (names.length === 0) {
    throw new RPLError('→: no local variable names');
  }
  if (i >= to) {
    throw new RPLError('→: missing body');
  }
  const body = toks[i];
  if (!isProgram(body) && !isSymbolic(body)) {
    throw new RPLError('→: body must be a program or algebraic');
  }
  if (s.depth < names.length) {
    throw new RPLError('Too few arguments');
  }
  // popN returns `[levelN, …, level1]`, which pairs with `names` by
  // index such that the rightmost name binds to stack level 1 — the
  // HP50 convention for the arrow form.
  const values = s.popN(names.length);
  _pushLocalFrame(names, values);
  try {
    if (isProgram(body)) {
      yield* evalRange(s, body.tokens, 0, body.tokens.length, depth + 1);
    } else {
      // Symbolic body — EVAL leaves the (possibly partially reduced)
      // value on the stack, matching HP50 behaviour.  Symbolic eval is
      // synchronous (no HALT path), so no yield* needed.
      // Pass an explicit caller label.  A pure-algebraic
      // body cannot reach a Program node (the AST has no embedding for
      // it), so this label is defensive — the only way to surface it
      // would be a future extension that lets a Symbolic carry a Program
      // sub-expression.  Keeping the label aligned with sibling sync-
      // path call sites (IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS /
      // STREAM) means a hypothetical future HALT rejection here would
      // already say `→ algebraic body` instead of the bare default.
      _evalValueSync(s, body, depth + 1, '→ algebraic body');
    }
  } finally {
    _popLocalFrame();
  }
  return i + 1;
}

/** Evaluate tokens in [from, to) as a flat sequence, respecting any
 *  nested control-flow structures.  `s` is the stack, `depth` tracks
 *  recursion.  Generator function: yields at every HALT encountered
 *  anywhere in the token stream — including inside control structures
 *  and `→` bodies — so the calling handler (EVAL/CONT) can store the
 *  live generator as the halted continuation.  Mutates the stack. */
function* evalRange(s, toks, from, to, depth) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }
  let i = from;
  while (i < to) {
    const tok = toks[i];
    const id = bareNameId(tok);
    if (id && CF_OPENERS.has(id)) {
      i = yield* runControl(s, toks, i, to, depth);
      if (_shouldStepYield()) yield;
      continue;
    }
    // Compiled local environment: `→ n1 n2 … body`.  `runArrow` collects
    // the local names, pops that many values from the stack, pushes a
    // binding frame, runs the body (Program or Symbolic), and pops the
    // frame.
    if (id === '→') {
      i = yield* runArrow(s, toks, i, to, depth);
      if (_shouldStepYield()) yield;
      continue;
    }
    // HALT — generator-based suspension.  `yield` here propagates up
    // through all `yield*` delegations to the top-level EVAL/CONT
    // handler, which stores this generator in state.haltedStack.  On
    // CONT, gen.next() resumes exactly here; we then advance past the
    // HALT token and continue the loop — matching the HP50's "resume
    // at the instruction after HALT" semantics.  Because the generator
    // preserves every call-frame on the JS engine's stack, HALT works
    // correctly at any structural depth (inside FOR, IF, →, etc.).
    if (id === 'HALT') {
      yield;
      i++;          // resume: advance past HALT
      continue;
    }
    // PROMPT.  HP50 AUR p.2-160: pop level 1, stash it
    // as the active prompt banner (state.promptMessage), then halt the
    // program.  Mechanically PROMPT is HALT-with-message: we use the
    // same `yield` channel so CONT/SST/KILL all just work.  Outside a
    // running program (the Name reaches `_dispatchOp` via the
    // registered handler below) PROMPT throws — matches our HALT-
    // outside-program behavior.
    //
    // The pop happens BEFORE the yield so the message is observable as
    // soon as the program suspends.  If the stack is empty, we throw
    // before yielding — the caller's `_truncateLocalFrames` safety net
    // still runs in EVAL/CONT's `finally`.
    if (id === 'PROMPT') {
      if (s.depth < 1) throw new RPLError('PROMPT: Too few arguments');
      const msg = s.pop();
      setPromptMessage(msg);
      yield;
      i++;          // resume: advance past PROMPT
      continue;
    }
    // IFT — stack-based conditional.  The action is EVAL'd via
    // `_evalValueGen` (yieldable) so a HALT/PROMPT inside it suspends
    // cleanly through this same evalRange chain.  The
    // `register('IFT', ...)` handler below stays as a sync fallback
    // for the rare path where IFT is reached via `evalToken` Name
    // dispatch (`'IFT' EVAL`, Tagged-wrapped Name(IFT) on stack);
    // those reject HALT through `_driveGen` with the
    // `IFT action` caller label.
    if (id === 'IFT') {
      yield* runIft(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    // IFTE — same pattern as IFT, with three pops
    // (test, t-action, f-action) and the chosen action EVAL'd via
    // `_evalValueGen`.  Sync fallback in `register('IFTE', ...)` below.
    if (id === 'IFTE') {
      yield* runIfte(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    // SEQ / MAP — list combinators whose body is EVAL'd once per
    // iteration (per-element).  The generator-flavor helpers below
    // (`runSeq` / `runMap`) drive each iteration through
    // `_evalValueGen` so a HALT/PROMPT inside an iteration's body lifts
    // cleanly through `yield*` up to the EVAL/CONT driver.  CONT
    // resumes inside the same iteration that suspended; the loop's
    // local accumulator (`out` array, current `i` for SEQ, the
    // already-mapped row prefix for MAP) survives across the suspension
    // because it lives in the generator's stack frame.  The
    // `register('SEQ', ...)` / `register('MAP', ...)` handlers below
    // stay as sync fallbacks (Name-dispatch, Tagged-wrapped Name, etc.)
    // and reject HALT through `_driveGen` with the caller labels
    // (`'SEQ expression'` / `'MAP program'`).
    if (id === 'SEQ') {
      yield* runSeq(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    if (id === 'MAP') {
      yield* runMap(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    // DOLIST / DOSUBS / STREAM — same generator-flavor pattern as
    // MAP / SEQ / IFT / IFTE: each iteration drives `prog` through
    // `_evalValueGen` so HALT/PROMPT suspends through `yield*`.
    // Per-iteration state (`out` accumulator, current `i`, DOSUBS
    // NSUB/ENDSUB frame) lives in the helper's stack frame, so CONT
    // resumes mid-iteration with all state intact.  Sync fallbacks in
    // `register('DOLIST', ...)` / `register('DOSUBS', ...)` /
    // `register('STREAM', ...)` keep the caller labels for the rare
    // Name-dispatch path.
    if (id === 'DOLIST') {
      yield* runDoList(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    if (id === 'DOSUBS') {
      yield* runDoSubs(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    if (id === 'STREAM') {
      yield* runStream(s, depth);
      i++;
      if (_shouldStepYield()) yield;
      continue;
    }
    if (id && (CF_CLOSERS.has(id) || CF_INNERS.has(id))) {
      // Orphan control keyword at depth 0 — skip silently (matches HP50
      // behavior where a stray END in a program body is a no-op; it
      // wouldn't have parsed successfully anyway on a real unit).
      i++;
      continue;
    }
    yield* evalToken(s, tok, depth);
    i++;
    // SST / SST↓ single-step debugger — when stepping is active, yield
    // after every token so the calling EVAL/CONT/SST handler suspends
    // the generator on the haltedStack.  `_shouldStepYield()` combines
    // `_singleStepMode` with `_stepInto` / `_insideSubProgram` so that
    // step-over (SST) doesn't yield on tokens inside a Name-reached
    // sub-program body, while step-into (SST↓) does.  Generator
    // semantics mean every structural-context frame (FOR counter, IF
    // branch, → local frame) is preserved across single-step
    // suspensions for free.
    if (_shouldStepYield()) yield;
  }
}

/** Post-token yield predicate for the single-step debugger.  Session
 *  106: modulated by `_insideSubProgram` and `_stepInto` — see those
 *  docstrings.  Breaking this out as a helper keeps the three callers
 *  (evalRange's three post-token yield sites) from duplicating the
 *  boolean expression. */
function _shouldStepYield() {
  return _singleStepMode && (!_insideSubProgram || _stepInto);
}

/** Evaluate a single non-control token.  Semantics mirror the pre-
 *  control-flow Program loop.
 *
 *  Generator function.  Any Name whose binding resolves
 *  to a Program is evaluated through `_evalValueGen`, which delegates
 *  to `evalRange` via `yield*` — so HALT inside a named sub-program
 *  (reached by variable lookup) now yields cleanly up to the top-level
 *  EVAL/CONT handler instead of rejecting through `_driveGen`.  Other
 *  value types (number, string, tagged-value, symbolic) are purely
 *  synchronous and never yield, so the generator just returns. */
function* evalToken(s, tok, depth) {
  if (isName(tok)) {
    if (tok.quoted) { s.push(tok); return; }
    // Compiled-local bindings shadow both ops and globals.
    const localVal = _localLookup(tok.id);
    if (localVal !== undefined) {
      yield* _evalValueGen(s, localVal, depth + 1);
      return;
    }
    const op = lookup(tok.id);
    if (op) { _dispatchOp(op, s, tok.id); return; }
    const bound = varRecall(tok.id);
    if (bound !== undefined) {
      yield* _evalValueGen(s, bound, depth + 1);
    } else {
      s.push(tok);
    }
    return;
  }
  s.push(tok);
}

// Invoke an op and, if it throws an RPLError, rewrap the message with
// the command name so the user sees `+: Too few arguments` instead of
// bare `Too few arguments`.  Messages that already carry a `WORD: `
// prefix are left alone (some helpers self-prefix — see _popOneReturn).
function _dispatchOp(op, s, name) {
  try {
    op.fn(s);
  } catch (e) {
    if (e instanceof RPLError && !/^[^\s:]+:\s/.test(e.message)) {
      throw new RPLError(`${name}: ${e.message}`);
    }
    throw e;
  }
}

/** Dispatch a control-flow structure starting at `toks[i]` (an opener).
 *  Generator: delegates to the appropriate run* generator so that a
 *  HALT inside any branch propagates yield up to the EVAL/CONT handler.
 *  Returns (via the generator return value) the index past the closer. */
function* runControl(s, toks, i, bound, depth) {
  const opener = bareNameId(toks[i]);

  switch (opener) {
    case 'IF':    return yield* runIf(s, toks, i, depth);
    case 'IFERR': return yield* runIfErr(s, toks, i, depth);
    case 'WHILE': return yield* runWhile(s, toks, i, depth);
    case 'DO':    return yield* runDo(s, toks, i, depth);
    case 'START': return yield* runStart(s, toks, i, depth);
    case 'FOR':   return yield* runFor(s, toks, i, depth);
    case 'CASE':  return yield* runCase(s, toks, i, depth);
  }
  throw new RPLError(`Bad opener: ${opener}`);
}

/** CASE dispatch:
 *    CASE
 *      test1 THEN action1 END
 *      test2 THEN action2 END
 *      ...
 *      [default-action]
 *    END
 *
 *  Semantics (HP50 AUR §21.3):
 *    - Evaluate each clause's test in turn.
 *    - The first truthy test runs its action and short-circuits to
 *      the outer END — remaining clauses are neither tested nor run.
 *    - If no clause matches, the tokens between the last inner END
 *      and the outer END form an optional default action and are run.
 *
 *  Layout note: CASE is a `CF_OPENER` so `scanAtDepth0` properly
 *  skips a nested CASE; but runCase's own forward scan must count
 *  THENs to identify which END is the OUTER one.  The key invariant
 *  is that each THEN clause is closed by the first END at depth 0,
 *  and the CASE itself is closed by the END that follows the last
 *  clause (or the only END when there are no clauses).
 *
 *  Our implementation walks clauses linearly:
 *    - `scanAtDepth0(toks, i, {THEN})` returns either the next THEN
 *       (a new clause starts here) or the next END at depth 0.  If
 *       it's END, we're past all clauses — the range [i, endIdx) is
 *       the default action.  Evaluate it and return `endIdx + 1`.
 *    - Otherwise we have a THEN; tokens in [i, thenIdx) are the test.
 *       Evaluate it and pop.  The matching END for this clause is the
 *       next depth-0 closer.  If the test is truthy, evaluate the
 *       action range and then scan forward for the OUTER CASE END
 *       (counting remaining THENs as "pending ENDs").  If false,
 *       advance past the clause's inner END and loop to the next
 *       clause. */
function* runCase(s, toks, openIdx, depth) {
  // Auto-close policy.  Any forward scan that falls off the end of the
  // token list is treated as an implicit END — matching the parser's
  // existing convenience on `«`, `}`, `]` (parser.js auto-closes when
  // the source runs out before the closing delimiter).  A Program built
  // from user input like `« CASE X THEN 1 END X>0 THEN 2` (missing the
  // trailing `END`) evaluates cleanly instead of raising "CASE without
  // END".
  const bound = toks.length;
  let i = openIdx + 1;

  while (i < bound) {
    const scan = scanAtDepth0(toks, i, new Set(['THEN']));
    if (!scan) {
      // Auto-close: no END found — [i, bound) is the default clause.
      yield* evalRange(s, toks, i, bound, depth + 1);
      return bound;
    }

    if (scan.kind === 'END') {
      // No THEN found — the range [i, scan.idx) is the default clause.
      yield* evalRange(s, toks, i, scan.idx, depth + 1);
      return scan.idx + 1;
    }

    if (scan.kind !== 'THEN') {
      throw new RPLError(`CASE: unexpected ${scan.kind}`);
    }

    const thenIdx = scan.idx;
    yield* evalRange(s, toks, i, thenIdx, depth + 1);
    const test = s.pop();

    const innerEnd = scanAtDepth0(toks, thenIdx + 1, null);
    // Auto-close when no inner END: treat the rest of the token list as
    // the action body for this clause.
    const innerEndIdx = (innerEnd && innerEnd.kind === 'END') ? innerEnd.idx : bound;
    const innerAutoClosed = (innerEndIdx === bound);

    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, innerEndIdx, depth + 1);
      if (innerAutoClosed) return bound;
      // Short-circuit to the outer CASE END.  After the inner END
      // we've matched one of N+1 depth-0 ENDs (one per clause plus
      // one for CASE).  `pending` tracks how many depth-0 ENDs we
      // still need to pass — starts at 1 (the CASE's own END).  Each
      // remaining THEN we skip adds one pending END (because it
      // opens a clause that will close with its own END).  Nested
      // openers (IF, WHILE, ...) are balanced by their own closers
      // and don't contribute to the pending count.  A nested CASE is
      // handled by `_skipPastCaseEnd` so its own inner ENDs don't
      // confuse our counter.
      let pending = 1;
      let nest = 0;
      let j = innerEndIdx + 1;
      while (j < bound) {
        const id = bareNameId(toks[j]);
        if (id) {
          if (id === 'CASE') {
            j = _skipPastCaseEnd(toks, j);
            continue;
          }
          if (CF_OPENERS.has(id)) {
            nest++;
          } else if (CF_CLOSERS.has(id)) {
            if (nest > 0) nest--;
            else if (id === 'END') {
              pending--;
              if (pending === 0) return j + 1;
            }
          } else if (nest === 0 && id === 'THEN') {
            pending++;
          }
        }
        j++;
      }
      // Auto-close the outer CASE too.
      return bound;
    }

    // Test was false: skip this clause's action and try the next.
    if (innerAutoClosed) return bound;
    i = innerEndIdx + 1;
  }
  return bound;
}

function* runIf(s, toks, openIdx, depth) {
  // IF <test> THEN <true-branch> [ELSE <false-branch>] END
  //
  // Auto-close policy (mirrors CASE and IFERR): a forward scan that
  // falls off the end of the token list is treated as an implicit END.
  // So
  //   « IF test THEN … »           runs the true-branch on truthy test
  //                                 and is otherwise a no-op — identical
  //                                 to the fully-closed « IF test THEN … END ».
  //   « IF test THEN … ELSE … »    also auto-closes the else-branch.
  // A missing THEN stays a hard error — we have no sensible default
  // clause for IF (unlike CASE where the whole body becomes the
  // default).  Motivating case: a CASE nested inside an IF whose own
  // END is missing would throw "IF without END" because
  // _skipPastCaseEnd returned toks.length and the outer scanAtDepth0
  // fell off the end.  With this auto-close the whole thing is
  // well-formed — same convenience as the parser's `« `/`{`/`[`
  // auto-close on unterminated openers.
  const bound = toks.length;
  const thenScan = scanAtDepth0(toks, openIdx + 1, new Set(['THEN']));
  if (!thenScan || thenScan.kind !== 'THEN') {
    throw new RPLError("IF without THEN");
  }
  const thenIdx = thenScan.idx;
  yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  const test = s.pop();
  const branchScan = scanAtDepth0(toks, thenIdx + 1, new Set(['ELSE']));

  let endIdx;
  let autoClosed = false;
  if (!branchScan) {
    // No ELSE or END found — auto-close at the end of the token list.
    // [thenIdx+1, bound) is the true-branch; no else-branch.
    endIdx = bound;
    autoClosed = true;
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, endIdx, depth + 1);
    }
  } else if (branchScan.kind === 'ELSE') {
    const endScan = scanAtDepth0(toks, branchScan.idx + 1, null);
    if (!endScan || endScan.kind !== 'END') {
      // ELSE present but no END — auto-close at the end of the token
      // list.  [branchScan.idx+1, bound) is the else-branch.
      endIdx = bound;
      autoClosed = true;
    } else {
      endIdx = endScan.idx;
    }
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, branchScan.idx, depth + 1);
    } else {
      yield* evalRange(s, toks, branchScan.idx + 1, endIdx, depth + 1);
    }
  } else if (branchScan.kind === 'END') {
    endIdx = branchScan.idx;
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, endIdx, depth + 1);
    }
  } else {
    throw new RPLError(`IF/THEN: unexpected ${branchScan.kind}`);
  }
  // Auto-close returns `bound` (same as IFERR / CASE) so the outer
  // evalRange's `while (i < to)` terminates immediately on the next
  // iteration without a spurious off-by-one.
  return autoClosed ? bound : endIdx + 1;
}

/** IFERR <trap> THEN <error clause> [ELSE <normal clause>] END
 *
 *  HP50 semantics:
 *    1. Snapshot the full stack.
 *    2. Evaluate the trap range.
 *    3. If the trap throws an RPLError:
 *         - Restore the stack to the snapshot (matching the HP50
 *           rule that the error clause starts with whatever was on
 *           the stack before IFERR).
 *         - Write the caught error to the last-error slot in state,
 *           so ERRM / ERRN / ERR0 inside the error clause can read
 *           or clear it.
 *         - Evaluate the error clause.
 *    4. If the trap completes normally and an ELSE branch is
 *       present, evaluate the ELSE branch.  (The stack is NOT
 *       rolled back in the success path — whatever the trap
 *       produced is what the ELSE branch sees.)
 *
 *  Non-RPLError exceptions (programmer bugs, TypeError, etc.) are
 *  intentionally NOT caught — those indicate a broken op or test,
 *  not a user-visible HP50 error, and shouldn't silently disappear.
 *
 *  Nesting: the last-error slot is saved on entry and restored on
 *  exit so an outer IFERR still sees its own caught error if an
 *  inner IFERR runs between catch and outer reference.  (A rare
 *  case, but the alternative is subtle action-at-a-distance.) */
function* runIfErr(s, toks, openIdx, depth) {
  // Auto-close policy (mirrors CASE and the parser's "forgot the `»`"
  // / "forgot the `}`" convenience): a forward scan that falls off the
  // end of the token list is treated as an implicit END.  So
  //   `« IFERR … THEN … »`     runs the error handler on throw and is
  //                            otherwise a no-op — identical to the
  //                            fully-terminated `« IFERR … THEN … END »`.
  //   `« IFERR … THEN … ELSE … »`   also auto-closes the ELSE clause.
  // A missing THEN *inside the source* still raises "IFERR without
  // THEN" because without a THEN we cannot locate the trap body's end
  // — there is no sensible default clause for IFERR, unlike CASE where
  // the whole body is a valid default.
  const bound = toks.length;

  const thenScan = scanAtDepth0(toks, openIdx + 1, new Set(['THEN']));
  if (!thenScan || thenScan.kind !== 'THEN') {
    throw new RPLError('IFERR without THEN');
  }
  const thenIdx = thenScan.idx;
  const branchScan = scanAtDepth0(toks, thenIdx + 1, new Set(['ELSE']));

  let elseIdx = -1;
  let endIdx;
  let autoClosed = false;
  if (!branchScan) {
    // No ELSE or END found — auto-close at the end of the token list.
    // The whole [thenIdx+1, bound) span is the error-handler clause.
    endIdx = bound;
    autoClosed = true;
  } else if (branchScan.kind === 'ELSE') {
    elseIdx = branchScan.idx;
    const endScan = scanAtDepth0(toks, elseIdx + 1, null);
    if (!endScan || endScan.kind !== 'END') {
      // ELSE present but no END — auto-close at the end of the token
      // list.  [elseIdx+1, bound) is the success-branch clause.
      endIdx = bound;
      autoClosed = true;
    } else {
      endIdx = endScan.idx;
    }
  } else if (branchScan.kind === 'END') {
    endIdx = branchScan.idx;
  } else {
    throw new RPLError(`IFERR/THEN: unexpected ${branchScan.kind}`);
  }

  const snap = s.save();
  const savedOuterError = getLastError();
  let caught = null;
  try {
    yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  } catch (e) {
    if (!(e instanceof RPLError)) throw e;    // let non-HP50 bugs bubble
    caught = e;
  }

  if (caught) {
    s.restore(snap);
    setLastError(caught);
    try {
      yield* evalRange(s, toks, thenIdx + 1, (elseIdx >= 0 ? elseIdx : endIdx), depth + 1);
    } finally {
      // Restore whatever last-error was visible to the outer scope once
      // the trap's THEN clause has had a chance to read it.  This keeps
      // nested IFERRs from clobbering an outer ERRM/ERRN reference.
      restoreLastError(savedOuterError);
    }
  } else if (elseIdx >= 0) {
    yield* evalRange(s, toks, elseIdx + 1, endIdx, depth + 1);
  }
  // When we auto-closed at the program boundary, return `bound` (same
  // index, not `bound + 1`) so the outer evalRange's `while (i < to)`
  // terminates immediately on the next iteration.  The exact same shape
  // runCase uses for its auto-close return.
  return autoClosed ? bound : endIdx + 1;
}

/* Stack-based conditionals — generator flavor.
 *
 * IFT and IFTE evaluate a Program off the stack as their action.
 * `evalRange` intercepts the IFT/IFTE Name tokens and delegates here;
 * the action is EVAL'd through `_evalValueGen` (yieldable), so a
 * HALT/PROMPT inside the action lifts cleanly through `yield*` up to
 * the top-level EVAL/CONT driver — same path used for `→` bodies and
 * named sub-program calls.
 *
 * The snap-and-restore wrapper preserves the "if the action errors,
 * restore the test+action operands" semantic of the
 * `register('IFT')` / `register('IFTE')` sync handlers.  catch fires
 * on RPLError thrown from inside the action; HALT yields don't trigger
 * catch (no exception), so a successful HALT-and-CONT cycle leaves the
 * stack in whatever state the action produced — matching HP50 behavior
 * where the suspended-stack contents are exactly what the program
 * built before suspending.
 *
 * The `register('IFT', ...)` / `register('IFTE', ...)` handlers stay
 * as a sync fallback for the rare path where IFT/IFTE is reached via
 * `evalToken` Name dispatch (`'IFT' EVAL`, Tagged-wrapped Name(IFT),
 * etc.).  Those drive these same generators through `_driveGen`, which
 * rejects HALT with the IFT/IFTE caller labels.
 */
function* runIft(s, depth) {
  const snap = s.save();
  try {
    const [test, action] = s.popN(2);
    if (isTruthy(test)) yield* _evalValueGen(s, action, depth + 1);
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}

function* runIfte(s, depth) {
  const snap = s.save();
  try {
    const [test, tAction, fAction] = s.popN(3);
    yield* _evalValueGen(s, isTruthy(test) ? tAction : fAction, depth + 1);
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}

function* runWhile(s, toks, openIdx, depth) {
  // WHILE <test> REPEAT <body> END
  //
  // Auto-close policy (mirrors IF / IFERR / CASE / parser): a forward
  // scan that falls off the end of the token list is treated as an
  // implicit END.  So
  //   « WHILE test REPEAT body »   runs as if the user had written
  //                                « WHILE test REPEAT body END » —
  //                                same convenience the parser already
  //                                gives for unterminated `«`.
  // A missing REPEAT stays a hard error: WHILE has no sensible default
  // body separator.  A spurious NEXT / STEP at depth 0 (in the END
  // slot) is also still a hard error — those are counter-loop closers
  // and don't belong here.
  const bound = toks.length;
  const repeatScan = scanAtDepth0(toks, openIdx + 1, new Set(['REPEAT']));
  if (!repeatScan || repeatScan.kind !== 'REPEAT') {
    throw new RPLError("WHILE without REPEAT");
  }
  const endScan = scanAtDepth0(toks, repeatScan.idx + 1, null);
  let endIdx;
  let autoClosed = false;
  if (!endScan) {
    endIdx = bound;
    autoClosed = true;
  } else if (endScan.kind === 'END') {
    endIdx = endScan.idx;
  } else {
    throw new RPLError("WHILE/REPEAT without END");
  }
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('WHILE loop iteration limit');
    }
    yield* evalRange(s, toks, openIdx + 1, repeatScan.idx, depth + 1);
    const test = s.pop();
    if (!isTruthy(test)) break;
    yield* evalRange(s, toks, repeatScan.idx + 1, endIdx, depth + 1);
  }
  return autoClosed ? bound : endIdx + 1;
}

function* runDo(s, toks, openIdx, depth) {
  // DO <body> UNTIL <test> END
  //
  // Auto-close policy (mirrors WHILE / IF / IFERR / CASE): a forward
  // scan that falls off the end of the token list is treated as an
  // implicit END, so
  //   « DO body UNTIL test »      runs as if the user had written
  //                               « DO body UNTIL test END ».
  // A missing UNTIL stays a hard error: DO has no sensible default
  // test separator.  A spurious NEXT / STEP at depth 0 in the END slot
  // is still a hard error — those are counter-loop closers.
  const bound = toks.length;
  const untilScan = scanAtDepth0(toks, openIdx + 1, new Set(['UNTIL']));
  if (!untilScan || untilScan.kind !== 'UNTIL') {
    throw new RPLError("DO without UNTIL");
  }
  const endScan = scanAtDepth0(toks, untilScan.idx + 1, null);
  let endIdx;
  let autoClosed = false;
  if (!endScan) {
    endIdx = bound;
    autoClosed = true;
  } else if (endScan.kind === 'END') {
    endIdx = endScan.idx;
  } else {
    throw new RPLError("DO/UNTIL without END");
  }
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('DO loop iteration limit');
    }
    yield* evalRange(s, toks, openIdx + 1, untilScan.idx, depth + 1);
    yield* evalRange(s, toks, untilScan.idx + 1, endIdx, depth + 1);
    const test = s.pop();
    if (isTruthy(test)) break;
  }
  return autoClosed ? bound : endIdx + 1;
}

function* runStart(s, toks, openIdx, depth) {
  // <start> <end> START <body> NEXT | STEP
  //
  // Auto-close policy (mirrors IF / IFERR / CASE / WHILE / DO): a
  // forward scan that falls off the end of the token list is treated
  // as an implicit NEXT (step = 1).  So
  //   « 1 5 START body »          runs as if the user had written
  //                               « 1 5 START body NEXT ».
  // A spurious END at depth 0 in the closer slot is still a hard
  // error: START has no END closer in HP50, only NEXT / STEP.
  const bound = toks.length;
  const [startVal, endVal] = s.popN(2);
  // Integer-preserving: if both bounds are Integers, keep the counter
  // as BigInt for the duration of the loop.  Otherwise coerce to Real.
  const intMode = isInteger(startVal) && isInteger(endVal);
  const a = intMode ? startVal.value : Number(isInteger(startVal) ? startVal.value : toRealOrThrow(startVal));
  const b = intMode ? endVal.value   : Number(isInteger(endVal)   ? endVal.value   : toRealOrThrow(endVal));
  const closeScan = scanAtDepth0(toks, openIdx + 1, null);
  let closer;
  let closerIdx;
  let autoClosed = false;
  if (!closeScan) {
    closer = 'NEXT';
    closerIdx = bound;
    autoClosed = true;
  } else if (closeScan.kind === 'NEXT' || closeScan.kind === 'STEP') {
    closer = closeScan.kind;
    closerIdx = closeScan.idx;
  } else {
    throw new RPLError("START without NEXT/STEP");
  }
  yield* runLoopBody(s, toks, openIdx + 1, closerIdx, closer, a, b, null, intMode, depth);
  return autoClosed ? bound : closerIdx + 1;
}

function* runFor(s, toks, openIdx, depth) {
  // <start> <end> FOR <var> <body> NEXT | STEP
  //
  // Auto-close policy (mirrors START / IF / IFERR / CASE / WHILE / DO):
  // a forward scan that falls off the end of the token list is treated
  // as an implicit NEXT (step = 1).  So
  //   « 1 5 FOR i body »          runs as if the user had written
  //                               « 1 5 FOR i body NEXT ».
  // A spurious END at depth 0 in the closer slot is still a hard error.
  // A missing FOR variable is still a hard error: there is no sensible
  // default name to bind the counter to.
  const bound = toks.length;
  const [startVal, endVal] = s.popN(2);
  const intMode = isInteger(startVal) && isInteger(endVal);
  const a = intMode ? startVal.value : Number(isInteger(startVal) ? startVal.value : toRealOrThrow(startVal));
  const b = intMode ? endVal.value   : Number(isInteger(endVal)   ? endVal.value   : toRealOrThrow(endVal));
  const varTok = toks[openIdx + 1];
  if (!isName(varTok)) throw new RPLError('FOR needs a name');
  const varName = varTok.id;
  const closeScan = scanAtDepth0(toks, openIdx + 2, null);
  let closer;
  let closerIdx;
  let autoClosed = false;
  if (!closeScan) {
    closer = 'NEXT';
    closerIdx = bound;
    autoClosed = true;
  } else if (closeScan.kind === 'NEXT' || closeScan.kind === 'STEP') {
    closer = closeScan.kind;
    closerIdx = closeScan.idx;
  } else {
    throw new RPLError("FOR without NEXT/STEP");
  }
  // Save any prior binding for this name so we can restore it after the loop.
  const saved = varRecall(varName);
  try {
    yield* runLoopBody(s, toks, openIdx + 2, closerIdx, closer, a, b, varName, intMode, depth);
  } finally {
    if (saved === undefined) varPurge(varName);
    else varStore(varName, saved);
  }
  return autoClosed ? bound : closerIdx + 1;
}

/* Safety net: HP50 has no hard iteration cap, but we do — a runaway
   loop inside a scheduled run would hang the shell.  1_000_000 is
   far higher than any sane user program and low enough to recover. */
const MAX_LOOP_ITERATIONS = 1_000_000;

/** Run the body of a counter-based loop (START or FOR).
 *
 *    bodyFrom, bodyTo: token range [from, to) to re-run each iteration.
 *    closer:           'NEXT' (step == 1) or 'STEP' (pop step each iter).
 *    startVal, endVal: numeric start and inclusive end of the counter.
 *                      In `intMode`, both are BigInts; otherwise Numbers.
 *    varName:          loop variable name, or null for START (no var).
 *    intMode:          true when both bounds came in as Integers and the
 *                      counter should stay a BigInt for the loop body.
 *                      A Real step at that point demotes the loop to
 *                      real-mode on the fly (matches how HP50 promotes
 *                      the counter when a Real STEP is popped).
 *
 *  HP50 STEP loops terminate when the counter has moved past endVal in
 *  the step's direction; a positive step stops at counter > endVal,
 *  a negative step stops at counter < endVal.  A zero step, as on the
 *  real machine, is an infinite loop — we throw instead. */
function* runLoopBody(s, toks, bodyFrom, bodyTo, closer, startVal, endVal, varName, intMode, depth) {
  let counter = startVal;
  let bound   = endVal;
  let mode    = intMode;            // may flip to false if a Real STEP arrives
  const ZERO  = 0n;
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('Loop iteration limit');
    }
    if (varName !== null) {
      varStore(varName, mode ? Integer(counter) : Real(counter));
    }
    yield* evalRange(s, toks, bodyFrom, bodyTo, depth + 1);
    let step;
    if (closer === 'STEP') {
      const stepVal = s.pop();
      if (mode && isInteger(stepVal)) {
        step = stepVal.value;                 // BigInt step, stay in int-mode
      } else {
        // Any non-Integer step demotes the whole loop to real-mode for the
        // rest of its life, matching HP50's Real/Integer blending.
        if (mode) {
          counter = Number(counter);
          bound   = Number(bound);
          mode    = false;
        }
        step = Number(isInteger(stepVal) ? stepVal.value : toRealOrThrow(stepVal));
      }
      if (mode ? step === ZERO : step === 0) throw new RPLError('STEP of 0');
    } else {
      step = mode ? 1n : 1;
    }
    counter = mode ? (counter + step) : (counter + step);
    const over = mode
      ? (step > ZERO ? counter > bound : counter < bound)
      : (step > 0     ? counter > bound : counter < bound);
    if (over) break;
  }
}

/** Built-in numeric constants — only folded in APPROX mode.  PI and E
 *  live here rather than as ordinary variable bindings because they are
 *  not user-owned and should stay symbolic under EXACT. */
/** Built-in symbolic constants.  The keys are spellings the user may
 *  type (parser and keypad both emit Name tokens with these ids) and
 *  the values are the RPL objects they fold to under APPROX / →NUM.
 *
 *  Case handling: we try the literal key first so we can distinguish
 *  Greek `π` from Latin `PI`, then fall back to the uppercased key so
 *  'pi', 'Pi', 'PI' all resolve.
 *
 *  The AST-level partial evaluator (algebraEvalAst) can only inline
 *  Real numbers, so `I`/`i` won't fold inside a larger symbolic
 *  expression — they stay as Names there.  The top-level EVAL path
 *  pushes the Complex directly, which is what the user sees when they
 *  type `'i' →NUM`. */
const SYM_CONSTANTS = Object.freeze({
  // --- Math constants --------------------------------------------
  PI:   Real(Math.PI),
  'π':  Real(Math.PI),
  'Π':  Real(Math.PI),
  E:    Real(Math.E),
  I:    Complex(0, 1),
  i:    Complex(0, 1),
  // MAXR / MINR are NOT here — they depend on the runtime realMaxExp
  // setting and are resolved dynamically in _symConstantRpl() below.
  // --- HP50 CONSTANTS-library physical constants -----------------
  // CODATA-2018 / SI-redefinition-2019 values; no units attached —
  // the fold produces a plain Real, matching how `e` behaves.  If
  // you need dimensional arithmetic, reach for the →UNIT/CONVERT
  // family after folding.  A user who wants one of these names as
  // a free symbolic variable can flip to EXACT mode (flag -105
  // CLEAR) and constants stop folding.
  c:    Real(299792458),              // speed of light, m/s (exact)
  h:    Real(6.62607015e-34),         // Planck constant, J·s (exact)
  'ħ':  Real(1.054571817e-34),        // reduced Planck (h / 2π)
  G:    Real(6.67430e-11),            // gravitational constant, m³/(kg·s²)
  g:    Real(9.80665),                // standard gravity, m/s² (exact)
  NA:   Real(6.02214076e23),          // Avogadro, /mol (exact)
  k:    Real(1.380649e-23),           // Boltzmann, J/K (exact)
  R:    Real(8.314462618),            // universal gas constant, J/(mol·K)
  Vm:   Real(0.02271095464),          // molar volume (STP), m³/mol
  'σ':  Real(5.670374419e-8),         // Stefan-Boltzmann, W/(m²·K⁴)
  'ε0': Real(8.8541878128e-12),       // vacuum permittivity, F/m
  'μ0': Real(1.25663706212e-6),       // vacuum permeability, N/A²
  q:    Real(1.602176634e-19),        // elementary charge, C (exact)
  me:   Real(9.1093837015e-31),       // electron rest mass, kg
  mp:   Real(1.67262192369e-27),      // proton rest mass, kg
  mn:   Real(1.67492749804e-27),      // neutron rest mass, kg
  F:    Real(96485.33212),            // Faraday, C/mol (= NA·q)
  'α':  Real(7.2973525693e-3),        // fine-structure, dimensionless
  // `re` (classical electron radius) deliberately omitted: name
  // uppercases to RE, which is the registered complex-real-part op.
  // Entry's bare-name dispatch runs the op before EVAL / →NUM ever
  // gets to fold the constant, so keeping both meanings would just
  // silently shadow RE.  Users who want the value can type it.
  a0:   Real(5.29177210903e-11),      // Bohr radius, m
  'μB': Real(9.2740100783e-24),       // Bohr magneton, J/T
  'μN': Real(5.0507837461e-27),       // nuclear magneton, J/T
  Rinf: Real(10973731.568160),        // Rydberg, /m (exact)
  'λc': Real(2.42631023867e-12),      // Compton wavelength, m
  'γe': Real(1.76085963023e11),       // electron gyromagnetic ratio, /(s·T)
  Z0:   Real(376.730313668),          // impedance of free space, Ω
  atm:  Real(101325),                 // standard atmosphere, Pa (exact)
  T0:   Real(273.15),                 // standard temperature, K (exact)
});
function _symConstantRpl(name) {
  if (!name) return undefined;
  // MAXR / MINR are dynamic — they derive from the current realMaxExp
  // setting so they can't live in the frozen SYM_CONSTANTS map.
  const upper = String(name).toUpperCase();
  if (upper === 'MAXR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`9.99999999999e+${e}`));
  }
  if (upper === 'MINR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`1e-${e}`));
  }
  if (Object.prototype.hasOwnProperty.call(SYM_CONSTANTS, name)) {
    return SYM_CONSTANTS[name];
  }
  if (Object.prototype.hasOwnProperty.call(SYM_CONSTANTS, upper)) {
    return SYM_CONSTANTS[upper];
  }
  return undefined;
}
/** Narrow helper for the AST evaluator — only returns a finite Number
 *  (i.e. a Real constant).  Complex constants can't be represented in
 *  an AstNum, so they stay symbolic during partial evaluation. */
function _symConstantValue(name) {
  const v = _symConstantRpl(name);
  if (v && v.type === 'real' && v.value.isFinite()) return v.value.toNumber();
  return undefined;
}

/** Drive an evalRange generator to completion synchronously.
 *  If the generator yields — meaning a HALT was encountered inside a
 *  sub-program reached through a sync-path caller (IFT / IFTE / MAP /
 *  SEQ body / DOLIST / DOSUBS / STREAM / → algebraic body / the
 *  `_evalValueSync` Name-and-Tagged recursion that those ops trigger)
 *  rather than through the lift-enabled `_evalValueGen` path — close
 *  the generator (so its `finally` blocks run, including any
 *  `_popLocalFrame()` from an enclosing `runArrow`) and then throw.
 *  Program-in-variable calls reached via `evalToken`'s Name-binding
 *  branch do NOT come through this path — that path runs through
 *  `_evalValueGen`, which `yield*`s the nested evalRange up to the
 *  top-level EVAL/CONT driver so HALT suspends cleanly.  Everything
 *  reached via `_evalValueSync` still rejects here.
 *
 *  `caller`, when supplied, is baked into the error message so the
 *  user learns which op blocked the HALT (e.g. "IFT action", "MAP
 *  program") rather than just "a sub-program call".  Callers with no
 *  useful label (the recursive Name/Tagged path inside
 *  `_evalValueSync`) pass `caller` through unchanged so the outermost
 *  originator's label sticks.
 *
 *  We close the generator (`gen.return()`) before throwing so its
 *  `finally` blocks run and the generator object is reclaimed promptly
 *  rather than waiting on GC.  The outer EVAL handler's
 *  `finally { _truncateLocalFrames(framesAtEntry) }` is the backstop
 *  that restores the compiled-local frame depth in any abnormal
 *  unwind. */
function _driveGen(gen, caller) {
  const result = gen.next();
  if (!result.done) {
    try { gen.return(); } catch (_) { /* ignore */ }
    const where = caller ? caller : 'a sub-program call';
    throw new RPLError(`HALT: cannot suspend inside ${where}`);
  }
}

/** Generator-flavored evaluator for Name-lookup-reached values.
 *  Reachable via `evalToken`'s Name-binding path (and its own recursion
 *  on nested Names / Tagged wrappers), and driven directly by the
 *  top-level EVAL handler so HALT lifts through Tagged-wrapped Programs
 *  and through Name values EVAL'd off the stack.  Other ops that take
 *  a Program argument (IFT / IFTE / MAP / SEQ / …) still use
 *  `_evalValueSync`, which rejects HALT via `_driveGen`.
 *
 *  For Program values this delegates to `evalRange` with `yield*`,
 *  propagating any HALT up through `evalToken` → `evalRange` (the outer
 *  one) → the EVAL/CONT driver that stores the live generator on
 *  `haltedStack`.  Non-program cases fall back to `_evalValueSync`
 *  (they cannot yield, so the sync call is exactly equivalent).
 *
 *  `isSubProgram` (default true) controls whether the Program branch
 *  flips `_insideSubProgram` for the duration of the body.  Sub-program
 *  callers (evalToken Name lookup, recursive Tagged/Name unwraps reached
 *  from within a token stream) keep the default — SST-step-over should
 *  run the body in one step.  The top-level EVAL handler passes false:
 *  the body is the *outer* program from the SST/DBUG point of view, so
 *  it must yield per token regardless of `_stepInto`.  Tagged unwraps
 *  and Name recursions preserve the parameter so a Name on the stack
 *  pointing at a Tagged-wrapped Program still respects the entry-point
 *  classification. */
function* _evalValueGen(s, v, depth, isSubProgram = true) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }

  if (isProgram(v)) {
    if (isSubProgram) {
      // Track that we're now inside a sub-program call so the body's own
      // post-token yields can consult `_stepInto` (see `_shouldStepYield`
      // in evalRange / runControl / runArrow tails).  We don't mutate
      // `_singleStepMode` itself — a stale `gen.return()` (e.g. KILL during
      // step-into) would otherwise run the finally and clobber the outer
      // flag.  Flipping `_insideSubProgram` instead keeps the sub-program
      // boundary a pure read-only predicate from the outer caller's side.
      const priorInside = _insideSubProgram;
      _insideSubProgram = true;
      try {
        yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
      } finally {
        _insideSubProgram = priorInside;
      }
    } else {
      // Top-level entry — `_insideSubProgram` stays whatever the caller
      // set it to (typically false).  evalRange's per-token yield is
      // controlled solely by `_singleStepMode` here.
      yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
    }
    return;
  }

  if (isName(v)) {
    if (getApproxMode()) {
      const crpl = _symConstantRpl(v.id);
      if (crpl !== undefined) { s.push(crpl); return; }
    }
    if (v.quoted) { s.push(v); return; }
    const localVal = _localLookup(v.id);
    if (localVal !== undefined) {
      yield* _evalValueGen(s, localVal, depth + 1, isSubProgram);
      return;
    }
    const bound = varRecall(v.id);
    if (bound !== undefined) {
      yield* _evalValueGen(s, bound, depth + 1, isSubProgram);
    } else {
      s.push(v);
    }
    return;
  }

  if (isTagged(v)) {
    // Deliberate deviation from HP50 AUR §3-77: HP50 EVAL on a
    // (non-port) Tagged value just pushes the untagged inner value
    // without further evaluation.  rpl5050 recurse-EVALs the inner
    // value so HALT/PROMPT inside a Tagged-wrapped Program suspends
    // cleanly through both the wrapper and the program body.
    // See test-control-flow.mjs HALT-through-Tagged tests for the
    // contract this branch upholds.
    yield* _evalValueGen(s, v.value, depth + 1, isSubProgram);
    return;
  }

  if (isList(v)) {
    // HP50 AUR §3-77: EVAL on a List enters each object — names
    // evaluated, commands evaluated, programs evaluated, other
    // objects pushed.  Note this differs from Program EVAL (where
    // an embedded Program is pushed as a literal): List EVAL
    // explicitly RUNS embedded Programs.
    //
    // Implementation: walk each item.  Names go through evalToken
    // (built-in op dispatch + local/global var lookup, matching
    // program-body semantics).  Programs and Tagged values recurse
    // through _evalValueGen (Tagged honors the HALT-through-wrappers
    // deviation noted above).  Everything else pushes literally.
    // HALT/PROMPT inside a list item lifts cleanly via `yield*`.
    for (const item of v.items) {
      if (isName(item)) {
        yield* evalToken(s, item, depth);
      } else if (isProgram(item) || isTagged(item)) {
        yield* _evalValueGen(s, item, depth + 1, isSubProgram);
      } else {
        s.push(item);
      }
    }
    return;
  }

  // Symbolic / numeric / string / container / …: synchronous, cannot
  // HALT.  Delegate to `_evalValueSync` for value-type-specific
  // semantics (AST reduction, unit pass-through, etc.) — it won't
  // reach the Program branch (we've already handled that above) so
  // `_driveGen` is not invoked.
  _evalValueSync(s, v, depth);
}

/** Evaluate an arbitrary value synchronously.  Used by all callers
 *  OTHER than the top-level EVAL/CONT handlers; those use the generator
 *  path directly so that HALT can yield through structural control flow.
 *  Delegates Program evaluation to evalRange via _driveGen (which
 *  rejects a HALT with a clear error rather than leaving the caller
 *  in an undefined state).
 *
 *  `caller` is an optional label passed through to `_driveGen` so a
 *  rejected HALT names the op at the boundary (e.g. "IFT action",
 *  "MAP program").  Internal recursion on Name/Tagged wrappers
 *  forwards the original label unchanged so the outermost originator's
 *  name reaches the error message. */
function _evalValueSync(s, v, depth, caller) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }

  if (isProgram(v)) {
    _driveGen(evalRange(s, v.tokens, 0, v.tokens.length, depth), caller);
    return;
  }

  if (isName(v)) {
    // In APPROX mode (incl. the →NUM span), built-in constants like PI
    // and E resolve to their numeric value even when tick-quoted —
    // `'PI' →NUM` should give 3.14159….  EXACT keeps them symbolic so
    // `'PI' EVAL` round-trips.
    if (getApproxMode()) {
      const crpl = _symConstantRpl(v.id);
      if (crpl !== undefined) { s.push(crpl); return; }
    }
    // A quoted Name stays a Name — EVAL on `'X'` is a no-op, same as on
    // a number or string.  This is what lets `'X' EVAL` round-trip.
    if (v.quoted) { s.push(v); return; }
    // Compiled-local bindings shadow globals.
    const localVal = _localLookup(v.id);
    if (localVal !== undefined) {
      _evalValueSync(s, localVal, depth + 1, caller);
      return;
    }
    const bound = varRecall(v.id);
    if (bound !== undefined) {
      _evalValueSync(s, bound, depth + 1, caller);
    } else {
      s.push(v);
    }
    return;
  }

  if (isTagged(v)) {
    // See _evalValueGen's Tagged comment — deliberate deviation from
    // HP50 AUR §3-77 to support HALT-through-Tagged.
    _evalValueSync(s, v.value, depth + 1, caller);
    return;
  }

  if (isList(v)) {
    // HP50 AUR §3-77: EVAL on a List enters each object — names
    // evaluated, commands evaluated, programs evaluated, others
    // pushed.  Sync path: same dispatch as the generator version
    // above, but Names go through `_driveGen(evalToken(...))` so a
    // HALT/PROMPT inside a list item is rejected with a clear error
    // (matching the Program sync-fallback behavior at the top of
    // this function).  Programs and Tagged values recurse through
    // `_evalValueSync` (which itself drives evalRange via _driveGen
    // for Programs).
    for (const item of v.items) {
      if (isName(item)) {
        _driveGen(evalToken(s, item, depth), caller);
      } else if (isProgram(item) || isTagged(item)) {
        _evalValueSync(s, item, depth + 1, caller);
      } else {
        s.push(item);
      }
    }
    return;
  }

  // Symbolic: EVAL attempts to numerically reduce the AST by
  // substituting any bound variables in the active directory and
  // evaluating function calls in the active angle mode.
  //
  //   1. Walk the AST with algebraEvalAst:
  //      - Var(X) → Num(lookup(X)) when X resolves to a real-valued
  //                 binding (Real or Integer); else left symbolic.
  //      - Fn(SIN, [u]) → SIN evaluated in the current angle mode,
  //        provided u evaluates to a Num.  LN/EXP/LOG/SQRT/ABS go
  //        through the mode-independent eval in KNOWN_FUNCTIONS.
  //      - Bin nodes fold when both children are Num.
  //   2. If the result is a lone Num AST, push a Real.
  //   3. Otherwise wrap the (possibly partially-reduced) AST back in
  //      a Symbolic and push that — EVAL is best-effort, not all-or-
  //      nothing.
  //
  // This matches HP50 behavior: `'X^2+1' EVAL` with X stored leaves a
  // number; `'X+Y' EVAL` with only X stored leaves `'5 + Y'` (or the
  // like) on the stack.
  if (isSymbolic(v)) {
    const approx = getApproxMode();
    const lookup = (name) => {
      // Compiled-local bindings shadow globals so that an algebraic
      // body under `→ a b 'a+b'` resolves a/b against the frame
      // pushed by runArrow.
      const localVal = _localLookup(name);
      if (localVal !== undefined) {
        if (isReal(localVal)) return localVal.value.toNumber();
        if (isInteger(localVal)) return Number(localVal.value);
        return null;
      }
      const bound = varRecall(name);
      if (bound !== undefined) {
        if (isReal(bound)) return bound.value.toNumber();
        if (isInteger(bound)) return Number(bound.value);
        return null;
      }
      // Built-in constants resolve only in APPROX mode — EXACT keeps
      // them symbolic so `'SIN(PI/4)' EVAL` stays as a Symbolic.
      if (approx) {
        const cval = _symConstantValue(name);
        if (cval !== undefined) return cval;
      }
      return null;
    };
    // In EXACT mode, thread the approx gate through so pure-numeric
    // Bin folds that produce a non-integer result are left symbolic
    // (`'1/3'` stays as '1/3', not 0.333…).  In APPROX, no gate → fold
    // everything.
    const binGate = approx
      ? null
      : (_op, args, result) => _approxGate(result, args);
    const reduced = algebraEvalAst(v.expr, lookup, _angleAwareFnEval, binGate);
    if (reduced && reduced.kind === 'num') {
      s.push(Real(reduced.value));
    } else {
      s.push(Symbolic(reduced));
    }
    return;
  }

  // EVAL on a Directory navigates into it (same semantics as pressing
  // the VARS soft-key for that directory).  Applies both when the user
  // evaluates a Name bound to a directory (varRecall resolves, then
  // this recurses with the Directory value) and when a raw directory
  // value is already on the stack.
  if (isDirectory(v)) {
    enterDirectory(v);
    return;
  }

  // Numeric / String / Vector / Matrix — EVAL is a no-op push per
  // AUR §3-77's "Other Objects" rule (List has its own branch above
  // that evaluates each item HP50-style).
  s.push(v);
}

/** Angle-mode-aware numeric evaluator for Fn nodes used by Symbolic
 *  EVAL.  Applies SIN/COS/TAN in the active angle mode via toRadians;
 *  ASIN/ACOS/ATAN return their answers in the active mode via
 *  fromRadians.  Everything else falls back to the mode-independent
 *  table in algebra.js.
 *
 *  Honors the EXACT/APPROX flag.  APPROX returns whatever JS Math
 *  produces; EXACT returns null (→ leave symbolic) unless the
 *  computation stays entirely in integer-land — every arg is integer,
 *  and the result is integer within 1e-12.  So `SQRT(9) → 3` folds
 *  under EXACT but `SQRT(2)` stays as `'SQRT(2)'`.  Rationale: HP50
 *  EXACT mode avoids lossy decimal folding; we approximate that by
 *  only allowing folds whose result is exact in `double`. */
function _approxGate(result, args) {
  if (getApproxMode()) return result;                 // APPROX — fold freely
  if (result === null || result === undefined) return result;
  if (!Number.isFinite(result)) return result;
  // EXACT: fold only if every input is integer AND the result is
  // (numerically) integer — captures SQRT(9)=3, LN(1)=0, EXP(0)=1,
  // SIN(0)=0, etc. while keeping SQRT(2), LN(2), PI(), SIN(30)-in-DEG
  // symbolic.
  const allIntArgs = args.every(a => Number.isFinite(a) && Math.abs(a - Math.round(a)) < 1e-12);
  if (!allIntArgs) return null;
  const rounded = Math.round(result);
  if (Math.abs(result - rounded) < 1e-12) return rounded;
  return null;
}
function _angleAwareFnEval(name, args) {
  if (args.length === 1) {
    const x = args[0];
    let result;
    switch (String(name).toUpperCase()) {
      case 'SIN':  result = Math.sin(toRadians(x)); return _approxGate(result, args);
      case 'COS':  result = Math.cos(toRadians(x)); return _approxGate(result, args);
      case 'TAN':  result = Math.tan(toRadians(x)); return _approxGate(result, args);
      case 'ASIN': result = fromRadians(Math.asin(x)); return _approxGate(result, args);
      case 'ACOS': result = fromRadians(Math.acos(x)); return _approxGate(result, args);
      case 'ATAN': result = fromRadians(Math.atan(x)); return _approxGate(result, args);
    }
  }
  const raw = algebraDefaultFnEval(name, args);
  return _approxGate(raw, args);
}

register('EVAL', (s) => {
  // Snapshot AFTER the pop so that on error the EVAL'd value stays
  // popped — only the body's partial pushes get unwound.  HP50-fidelity
  // user expectation: pressing a soft key on a buggy program (or running
  // `« 1 0 / » EVAL` directly) leaves the program *gone*, not waiting
  // on level 1 to be pressed again.  The same shape applies to every
  // EVAL path: entry-line `EVAL`, soft-key VARS / CST press (the
  // surrounding `safeRun` in app.js takes a pre-push snapshot so the
  // outer rollback is consistent with this inner one), `→NUM`, DBUG,
  // and `'NAME' EVAL` on a stored Program.
  //
  // RPLAbort (thrown by ABORT) is deliberately NOT restored: HP50
  // ABORT preserves stack state at the point of the abort rather than
  // rewinding to pre-pop, so we let the signal pass through untouched.
  // The Program is consumed in the ABORT case as well.
  //
  // HALT inside a Program is handled via the generator mechanism:
  //   1. evalRange is a generator; it yields when a HALT token is hit.
  //   2. _evalValueGen wraps Program/Name/Tagged dispatch in a generator
  //      that `yield*`s evalRange so the yield reaches the driver loop
  //      below intact.
  //   3. EVAL drives _evalValueGen with gen.next().  Tagged-wrapped
  //      Programs and Name-on-stack values lift HALT through their
  //      wrappers so all semantically-transparent program references
  //      suspend cleanly.
  //   4. If the generator yields (not done), the live generator is stored
  //      in state.haltedStack via setHalted.  We do NOT truncate
  //      _localFrames — the generator is still live and any → frames
  //      it pushed are still needed.
  //   5. CONT calls gen.next() to resume from exactly where HALT left off.
  //   The generator mechanism captures all structural context (FOR
  //   counter, IF branch, → locals) automatically, so HALT works at
  //   any structural depth.
  //
  // `isSubProgram=false` is passed to _evalValueGen because the body
  // here is the *outer* program from the SST/DBUG perspective — the
  // entry point, not a nested call.  This keeps `_insideSubProgram`
  // unflipped at the entry so SST yields per-token at the outer level
  // and preserves SST↓ step-into semantics for any sub-programs the body
  // reaches via Name lookup.  See `_evalValueGen`'s docstring for the
  // full rationale.
  //
  // Symbolic / Numeric / String / List / Vector values fall through
  // _evalValueGen's tail to _evalValueSync — they cannot HALT, so the
  // generator returns done=true on the first .next() call.
  //
  // _localFrames safety net: truncate to framesAtEntry only when the
  // generator finishes (done=true) or throws.  While halted, leave the
  // frames intact so the generator can see them on resume.
  const framesAtEntry = _localFrames.length;
  let halted = false;
  let snap = null;
  try {
    const v = s.pop();
    // Snapshot is taken AFTER the pop.  If the pop itself threw (empty
    // stack), `snap` stays null and the catch below skips restore — the
    // pop's natural failure semantics already left the stack intact.
    snap = s.save();
    const gen = _evalValueGen(s, v, 0, /* isSubProgram = */ false);
    const result = gen.next();
    if (!result.done) {
      // Suspended at HALT — store live generator, leave frames.
      halted = true;
      setHalted({ generator: gen });
      return;
    }
  } catch (e) {
    if (!(e instanceof RPLAbort) && snap !== null) s.restore(snap);
    throw e;
  } finally {
    if (!halted) _truncateLocalFrames(framesAtEntry);
  }
});

/* ------------------------------------------------------------------
   APPROX / EXACT mode toggles + →NUM forced-approximation.

   HP50 flag -105 controls whether numeric ops fold transcendentals.
   `APPROX` (flag SET) folds `SQRT(2)` to 1.41421356237; `EXACT` (flag
   CLEAR) leaves it symbolic.  The web calculator boots in APPROX;
   `EXACT` is the "call me when you actually need a number" mode.

   `→NUM` (SHIFT-R ENTER on the physical unit) forces APPROX for a
   single EVAL and restores the previous setting.  Users in EXACT mode
   reach for →NUM when they want a decimal without changing the global
   flag.
   ------------------------------------------------------------------ */
register('APPROX', () => { setApproxMode(true); });
register('EXACT',  () => { setApproxMode(false); });

register('→NUM', (s, entry) => {
  // Force APPROX mode for the span of one EVAL, then restore whatever
  // the user had set.  Use try/finally so a domain error inside EVAL
  // still leaves the mode flag the way we found it.
  const prev = getApproxMode();
  setApproxMode(true);
  try {
    OPS.get('EVAL').fn(s, entry);
  } finally {
    setApproxMode(prev);
  }
});
// Ascii alias — so users on keyboards without `→` can type `->NUM` or
// `NUM` and still reach the op via the entry line.  Mirrors the style
// used for `→LIST`, `→STR` elsewhere in the registry.
register('->NUM', (s, entry) => { OPS.get('→NUM').fn(s, entry); });

/* ------------------------------------------------------------------
   Stack-based conditionals: IFT, IFTE.

   IFT   ( test action -- )       test true  → EVAL action
                                  test false → drop both
   IFTE  ( test t-act f-act -- )  test true  → EVAL t-act
                                  test false → EVAL f-act

   "EVAL" here means the full evaluator: a Program runs, a Name
   auto-recalls, a number pushes itself.  This is what HP50 users
   expect — IFTE on a pair of Reals is effectively a value-select.
   ------------------------------------------------------------------ */

// Drive the generator flavor (`runIft` / `runIfte`) so the program-body
// intercept in `evalRange` and this Name-dispatch fallback share the
// same evaluation path.  `_driveGen` rejects any yield with the
// IFT/IFTE caller label — HALT/PROMPT inside an action reached via
// `'IFT' EVAL` (sync, not body-intercept) throws
// `HALT: cannot suspend inside IFT action`.  The outer snap/restore
// preserves operand rollback on the HALT-rejection path:
// `gen.return()` runs only finally blocks, not catch, so the helper's
// own snap/catch can't restore here.
register('IFT', (s) => {
  const snap = s.save();
  try {
    _driveGen(runIft(s, 0), 'IFT action');
  } catch (e) {
    s.restore(snap);
    throw e;
  }
});

register('IFTE', (s) => {
  const snap = s.save();
  try {
    _driveGen(runIfte(s, 0), 'IFTE action');
  } catch (e) {
    s.restore(snap);
    throw e;
  }
});

/* ------------------------------------------------------------------
   Comparison + logic ops.

   Booleans are HP50-style Reals: 0. / 1.  Comparison ops accept any
   two numeric operands (Real, Integer, Complex with both imaginary
   parts zero).  AND/OR/XOR/NOT treat any non-zero as true; NOT of 0
   is 1, NOT of anything else is 0.

   Registered canonical names + ASCII aliases so a user typing on a
   physical keyboard (no ≠ / ≤ / ≥ glyphs) can still reach them.
   ------------------------------------------------------------------ */

function popNumericPair(s) {
  const [a, b] = s.popN(2);
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  return promoteNumericPair(a, b);
}

function eqValues(a, b) {
  // Equality across numeric types.  Uses JS == on promoted scalars.
  if (isNumber(a) && isNumber(b)) {
    const p = promoteNumericPair(a, b);
    if (p.kind === 'complex')  return p.a.re === p.b.re && p.a.im === p.b.im;
    if (p.kind === 'integer')  return p.a === p.b;
    if (p.kind === 'rational') return p.a.n === p.b.n && p.a.d === p.b.d;
    // 'real' kind: p.a and p.b are Decimal instances — compare by value.
    return p.a.eq(p.b);
  }
  /* BinaryInteger structural equality.
     BinInt stays out of `isNumber` (base-preservation rules for
     arithmetic), so BinInt × BinInt handled here explicitly.  HP50
     AUR §4-1 compares BinInts by masked numeric value: display base
     is not semantic, so `#FFh == #255d` is 1.  Cross-family BinInt ×
     Integer / Real / Complex widening is done in the `==` / `≠` /
     `<>` op wrappers (NOT here) so that `SAME` — which uses
     `eqValues` directly — stays strict on types.
     Masking note: `BinaryInteger()` does NOT apply the wordsize mask
     at construction, so `#100h` at ws=8 stores `value = 256n`, not
     `0n`.  We mask both operands against the current wordsize before
     comparing so HP50-visible equal values (all bits outside the
     wordsize are meaningless) compare equal. */
  if (isBinaryInteger(a) && isBinaryInteger(b)) {
    const m = getWordsizeMask();
    return (a.value & m) === (b.value & m);
  }
  // Name / String / everything else: structural comparison by id/value.
  if (isName(a) && isName(b)) return a.id === b.id;
  if (isString(a) && isString(b)) return a.value === b.value;
  /* Structural equality on collection and expression types.
     HP50 AUR §4-2 documents == / SAME as structural equality for
     Lists / Vectors / Matrices; §4-7 ditto for Symbolics. */
  if (isList(a)   && isList(b))   return _eqArr(a.items, b.items);
  if (isVector(a) && isVector(b)) return _eqArr(a.items, b.items);
  if (isMatrix(a) && isMatrix(b)) {
    if (a.rows.length !== b.rows.length) return false;
    for (let i = 0; i < a.rows.length; i++) {
      if (!_eqArr(a.rows[i], b.rows[i])) return false;
    }
    return true;
  }
  if (isSymbolic(a) && isSymbolic(b)) return _astStructEqual(a.expr, b.expr);
  if (isTagged(a)   && isTagged(b)) {
    return a.tag === b.tag && eqValues(a.value, b.value);
  }
  if (isUnit(a) && isUnit(b)) {
    // Unit equality: same numeric value AND the same dimension algebra.
    // `sameDims` only checks dimension equivalence; we want strict
    // structural equality on the uexpr for ==/SAME so `1_m ==  1_km` is
    // false even though both are lengths.  Raw JSON compare is
    // sufficient here because uexpr is a plain frozen-object tree.
    if (a.value !== b.value) return false;
    return JSON.stringify(a.uexpr) === JSON.stringify(b.uexpr);
  }
  /* Program structural equality.
     HP50 AUR §4-7: two Programs are == / SAME iff their token streams
     are structurally identical (token count + recursive eqValues on
     each token).  Uses _eqArr which already recurses via eqValues, so
     nested Programs round-trip correctly. */
  if (isProgram(a) && isProgram(b)) return _eqArr(a.tokens, b.tokens);
  /* Directory reference-identity.
     HP50 AUR §4-7: SAME on Directories is reference identity — two
     distinct Directory allocations are never "the same", even if they
     hold the same entries.  Directories are identifiable containers,
     not values. `==` follows the same rule because there is no
     meaningful "structural" notion of directory equality on the HP50. */
  if (isDirectory(a) && isDirectory(b)) return a === b;
  return false;
}

/** Elementwise eqValues over two arrays (used by List / Vector / Matrix-row
 *  structural compare). */
function _eqArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!eqValues(a[i], b[i])) return false;
  }
  return true;
}

/** Structural compare of two Symbolic AST nodes.
 *  Mirrors `astEqual` in algebra.js but stays local to ops.js so we don't
 *  add another import for a four-line helper.  Supports the four AST
 *  node kinds produced by the parser (`num`, `var`, `neg`, `bin`, `fn`). */
function _astStructEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'num': return a.value === b.value;
    case 'var': return a.name === b.name;
    case 'neg': return _astStructEqual(a.arg, b.arg);
    case 'bin': return a.op === b.op
                  && _astStructEqual(a.l, b.l)
                  && _astStructEqual(a.r, b.r);
    case 'fn': {
      if (a.name !== b.name) return false;
      if (a.args.length !== b.args.length) return false;
      for (let i = 0; i < a.args.length; i++) {
        if (!_astStructEqual(a.args[i], b.args[i])) return false;
      }
      return true;
    }
    default:
      // Unknown AST kind — don't silently accept.
      return false;
  }
}

/** If either operand is a Symbolic/Name, push Symbolic(Bin(op, …)) and
 *  return true.  Otherwise return false so the caller proceeds with a
 *  numeric comparison.  Used by every comparison op (=, ==, ≠, <, >, ≤,
 *  ≥, and their ASCII aliases) — matches HP50 behaviour where comparing
 *  symbolic operands defers evaluation by building an equation. */
function _trySymCompare(s, a, b, op) {
  if (!_isSymOperand(a) && !_isSymOperand(b)) return false;
  const l = _toAst(a);
  const r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstBin(op, l, r)));
  return true;
}

// `=` is the equation-builder: always produces a symbolic result, even
// when both operands are numeric.  `2 3 =` → `'2=3'`.  Matches how
// HP50's EquationWriter treats the `=` key.
register('=', (s) => {
  const [a, b] = s.popN(2);
  const l = _toAst(a);
  const r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstBin('=', l, r)));
});

/** Cross-family BinInt ↔ Integer/Real/Complex widening for the `==` /
 *  `≠` family.  HP50 AUR §4-1: `==` compares numeric operands by value
 *  across the numeric family, so `#10h == Integer(16)` is 1.  SAME is
 *  explicitly NOT in this widening — it stays strict on types
 *  (`SAME #10h Integer(16)` = 0). */
function _binIntCrossNormalize(a, b) {
  // Apply the wordsize mask before coercing to Integer — `#100h` at
  // ws=8 compares as 0, not 256.  Matches the masking rule in the
  // eqValues BinInt×BinInt branch and in comparePair.
  const m = getWordsizeMask();
  if (isBinaryInteger(a) && !isBinaryInteger(b) && isNumber(b)) {
    return [Integer(a.value & m), b];
  }
  if (isBinaryInteger(b) && !isBinaryInteger(a) && isNumber(a)) {
    return [a, Integer(b.value & m)];
  }
  return [a, b];
}

register('==', (s) => {
  // `==` is a strict structural equality test — it always returns a
  // boolean (1./0.), even on symbolic operands.  Use `=` instead to
  // build an equation: `'X' 'X' =` → `'X=X'`.
  // Cross-family BinInt widening at the outer level
  // (see _binIntCrossNormalize above).
  const [a0, b0] = s.popN(2);
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? TRUE : FALSE);
});
register('SAME', (s) => {
  // HP50: SAME is structural equality including types; for primitive
  // values it coincides with ==.  We use the same comparator.  SAME
  // stays strictly boolean — it does NOT lift to symbolic, since SAME's
  // contract is "are these the same object?", not "are they equal?".
  // Deliberately does NOT cross-normalize BinInt — `SAME
  // #10h Integer(16)` = 0 per AUR §4-7 ("SAME does not type-coerce").
  const [a, b] = s.popN(2);
  s.push(eqValues(a, b) ? TRUE : FALSE);
});

register('≠', (s) => {
  const [a0, b0] = s.popN(2);
  if (_trySymCompare(s, a0, b0, '≠')) return;
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? FALSE : TRUE);
});
register('<>', (s) => {
  // ASCII alias for ≠.
  const [a0, b0] = s.popN(2);
  if (_trySymCompare(s, a0, b0, '≠')) return;
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? FALSE : TRUE);
});

function comparePair(s, cmp, op) {
  let [a, b] = s.popN(2);                 // a = level 2, b = level 1
  /* BinaryInteger comparator widening.
     HP50 AUR §4-1 accepts BinInts on `<` / `>` / `≤` / `≥` by
     masked numeric value.  `isNumber` deliberately excludes BinInt,
     so we promote each BinInt operand to an Integer with the masked
     BigInt payload — that lets the symbolic-lift path lift via
     `_toAst` (which accepts Integer), and the numeric path route
     through `promoteNumericPair` with the `integer` kind.  Display
     base is dropped here because it isn't semantic for comparison
     (cf. == widening above).  Apply the wordsize mask to the
     payload — `#100h < #200h` at ws=8 must compare masked values
     (both 0), not unmasked payloads. */
  {
    const m = getWordsizeMask();
    if (isBinaryInteger(a)) a = Integer(a.value & m);
    if (isBinaryInteger(b)) b = Integer(b.value & m);
  }
  // Symbolic lift first — `x y >` with Name/Symbolic operands yields
  // `'x>y'` instead of an error.
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a);
    const r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstBin(op, l, r)));
    return;
  }
  /* String lexicographic compare.
     HP50 User Guide App. J: string comparisons are char-code
     lexicographic.  Both operands must be Strings; mixing String
     with a non-String is "Bad argument type" (no cross-type lift). */
  if (isString(a) && isString(b)) {
    s.push(cmp(a.value, b.value) ? TRUE : FALSE);
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  const p = promoteNumericPair(a, b);
  // Complex < / > / ≤ / ≥ isn't well-defined on HP50 either — only compare real parts
  // when imaginary parts are zero; otherwise error.
  let av, bv;
  if (p.kind === 'complex') {
    if (p.a.im !== 0 || p.b.im !== 0) throw new RPLError('Bad argument type');
    av = p.a.re; bv = p.b.re;
  } else if (p.kind === 'integer') {
    av = Number(p.a); bv = Number(p.b);
  } else if (p.kind === 'rational') {
    // Cross-multiply to compare without forming a real; d is always positive.
    av = p.a.n * p.b.d; bv = p.b.n * p.a.d;
  } else {
    // 'real' kind — p.a and p.b are Decimal instances.  Coerce to JS
    // number for the `<` / `>` / `≤` / `≥` comparator lambdas.  Ordering
    // is preserved within the 15-digit Decimal precision we use.
    av = p.a.toNumber(); bv = p.b.toNumber();
  }
  s.push(cmp(av, bv) ? TRUE : FALSE);
}

register('<',  (s) => comparePair(s, (a, b) => a <  b, '<'));
register('>',  (s) => comparePair(s, (a, b) => a >  b, '>'));
register('≤',  (s) => comparePair(s, (a, b) => a <= b, '≤'));
register('<=', (s) => comparePair(s, (a, b) => a <= b, '≤'));
register('≥',  (s) => comparePair(s, (a, b) => a >= b, '≥'));
register('>=', (s) => comparePair(s, (a, b) => a >= b, '≥'));

/* ---- logical ops: treat any non-zero as true; return 1./0. ----
   On two BinaryIntegers, AND/OR/XOR are BITWISE (HP50 overloads these
   exact names — same on a real unit).  The result is wordsize-masked
   and inherits the LEFT operand's display base.  Mixed BinInt+other
   is rejected with "Bad argument type", same as the arithmetic path.
   Everything else goes through the boolean-logic path: treat any non-
   zero as true, return Real(1) / Real(0).
   NOT on a BinaryInteger is bitwise complement within the wordsize;
   on anything else it's boolean (HP50 also overloads NOT). */
function binaryLogic(op) {
  return (s) => {
    const [a, b] = s.popN(2);
    if (isBinaryInteger(a) && isBinaryInteger(b)) {
      const m = _mask();
      const av = a.value & m;
      const bv = b.value & m;
      let r;
      switch (op) {
        case 'AND': r = av & bv; break;
        case 'OR':  r = av | bv; break;
        case 'XOR': r = av ^ bv; break;
      }
      s.push(BinaryInteger(r & m, a.base));
      return;
    }
    if (isBinaryInteger(a) || isBinaryInteger(b)) {
      throw new RPLError('Bad argument type');
    }
    const x = isTruthy(a), y = isTruthy(b);
    let r;
    switch (op) {
      case 'AND': r = x && y; break;
      case 'OR':  r = x || y; break;
      case 'XOR': r = x !== y; break;
    }
    s.push(r ? TRUE : FALSE);
  };
}
register('AND', binaryLogic('AND'));
register('OR',  binaryLogic('OR'));
register('XOR', binaryLogic('XOR'));

register('NOT', (s) => {
  const v = s.pop();
  if (isBinaryInteger(v)) {
    // Bitwise complement within the current wordsize (XOR with the mask).
    const m = _mask();
    s.push(BinaryInteger((v.value & m) ^ m, v.base));
    return;
  }
  s.push(isTruthy(v) ? FALSE : TRUE);
});

register('TRUE',  (s) => { s.push(TRUE); });
register('FALSE', (s) => { s.push(FALSE); });

/* ------------------------------------------------------------------
   Error-introspection ops: ERRM / ERRN / ERR0.

   IFERR's THEN clause is the natural home for these — they read the
   last-error slot written when the trap caught.  On an HP50 the slot
   persists until the next ERR0 (or the next caught error), which is
   what we do here; calling ERRM / ERRN outside an IFERR trap is legal
   and yields the most recent caught error (empty string / 0 if none).

     ERRM   ( -- string )   the last error's message text
     ERRN   ( -- integer )  the last error's number (see state.js
                            _ERROR_NUMBERS for the current map — 0
                            for unknown / none)
     ERR0   ( -- )          clear the last-error slot
   ------------------------------------------------------------------ */

register('ERRM', (s) => {
  const le = getLastError();
  s.push(Str(le ? le.message : ''));
});

register('ERRN', (s) => {
  // HP50: ERRN returns a Binary Integer in hex (e.g. #502h for
  // "Directory not allowed").  The stack shows `#502h` directly,
  // matching what the Advanced User's Reference uses as the
  // canonical error form.
  //
  // `le.number === 0` when no classification matched (unknown error,
  // or no error since the last ERR0) — still emit it as `#0h` so the
  // stack shape is stable; a caller who wants the numeric value can
  // `B→R` (future) or compare against `#0h` directly.
  const le = getLastError();
  s.push(BinaryInteger(le ? le.number : 0, 'h'));
});

register('ERR0', () => {
  clearLastError();
});

/* ------------------------------------------------------------------
   STWS / RCWS — Binary integer wordsize control.

     STWS  ( n -- )       set wordsize to n bits (1..64, clamped).  HP50
                          accepts a Real, Integer, or BinaryInteger here;
                          we convert via the usual numeric coercion.
     RCWS  ( -- bin )     recall wordsize as a BinaryInteger in the
                          current display base (or hex when the display
                          override is null).  HP50 behavior matches.

   HEX / DEC / OCT / BIN — display-base modes.  Each sets the global
   `state.binaryBase` override so every BinInt renders in that base AND
   pads to the current wordsize.  There's no "un-set" op today — the
   user issues a different base or keeps the current one.
   ------------------------------------------------------------------ */

register('STWS', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))           n = Number(v.value);
  else if (isBinaryInteger(v)) n = Number(v.value);
  else if (isReal(v))         n = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(n)) throw new RPLError('Bad argument value');
  setWordsize(Math.trunc(n));
});

register('RCWS', (s) => {
  // HP50 returns the wordsize as a Binary Integer; base follows the
  // display override when set, else hex.  (A user in HEX mode wants
  // `#40h` back from RCWS, not `#64d`.)
  s.push(BinaryInteger(BigInt(getWordsize()), getBinaryBase() || 'h'));
});

register('HEX', () => { setBinaryBase('h'); });
register('DEC', () => { setBinaryBase('d'); });
register('OCT', () => { setBinaryBase('o'); });
register('BIN', () => { setBinaryBase('b'); });
/** CLB — clear display-base override.  After CLB, each BinInt
 *  renders in its stored base (HP50 default behavior before any
 *  HEX/DEC/OCT/BIN has been issued).  Padding to STWS is also
 *  dropped — the address hasn't been mode-locked, so minimum-
 *  width rendering is used.  (HP50 firmware doesn't ship this
 *  exact name; the closest built-in is clearing flag -67.  We use
 *  CLB for brevity — `CLear Binary mode`.) */
register('CLB', () => { setBinaryBase(null); });

/* ------------------------------------------------------------------
   RECT / CYLIN / SPHERE — coordinate-display mode.

   HP50 flags -15 / -16 control rendering of Complex and Vector values:
     -15 CLR -16 CLR → Rectangular    `(1, 1)`      — "XYZ"
     -15 SET -16 CLR → Cylindrical    `(SQRT(2), ∠π/4)` — "R∠Z"
     -15 CLR -16 SET → Spherical      — for 3-vectors, "R∠∠"
   This build keeps them as three named modes rather than shipping
   the flag interface; the formatter reads state.coordMode.  No
   arithmetic behavior changes — only display.  The ops stay 0-arg
   so they can be dropped into any program or the side-panel
   Commands tab.
   ------------------------------------------------------------------ */
register('RECT',   () => { setCoordMode('RECT'); });
register('CYLIN',  () => { setCoordMode('CYLIN'); });
register('SPHERE', () => { setCoordMode('SPHERE'); });

/* ------------------------------------------------------------------
   TEXTBOOK / FLAT — toggle 2D pretty-print of Symbolic stack rows.

   TEXTBOOK  ( --- )   Enable pretty-print for Symbolic values.  After
                       TEXTBOOK, each stack row holding a Symbolic
                       renders via src/rpl/pretty.js's astToSvg (SVG)
                       instead of the flat-text formatter.  Other
                       value types are unaffected.
   FLAT      ( --- )   Return to flat-text rendering for everything.

   HP50 expresses the same thing via system flag -80 — we provide
   named ops for discoverability / keypad-reachability without taking
   a position on flag numbers yet.  The flag-bit wiring can land
   alongside once flags land as a feature. */
register('TEXTBOOK', () => { setTextbookMode(true); });
register('FLAT',     () => { setTextbookMode(false); });

/* ------------------------------------------------------------------
   B→R and R→B — BinaryInteger ↔ Real conversion.

     B→R  ( bin -- real )   push the BinInt's value as a Real.  For
                            wide BinInts the Number coercion loses
                            precision above 2^53, matching the HP50's
                            12-digit decimal limit behavior.
     R→B  ( x   -- bin )    push x as a BinInt at the current wordsize.
                            x may be Real or Integer.  The low ws bits
                            become the payload; negatives wrap (two's-
                            complement style) which matches HP50's
                            truncation behavior.  Base follows the
                            display override (or 'h' if none).
   ------------------------------------------------------------------ */

register('B→R', (s) => {
  const v = s.pop();
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
  s.push(Real(Number(v.value & _mask())));
});
register('B->R', (s) => {          // ASCII alias
  const v = s.pop();
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
  s.push(Real(Number(v.value & _mask())));
});

register('R→B', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))       n = v.value;
  else if (isReal(v))     n = BigInt(v.value.trunc().toFixed(0));
  else throw new RPLError('Bad argument type');
  const m = _mask();
  // Mask: for negatives, JS BigInt AND with a positive mask gives the
  // two's-complement low bits already (because BigInt is arbitrary-
  // precision signed), so `n & m` is what we want.
  const payload = n & m;
  const base = getBinaryBase() || 'h';
  s.push(BinaryInteger(payload, base));
});
register('R->B', (s) => {          // ASCII alias
  const v = s.pop();
  let n;
  if (isInteger(v))       n = v.value;
  else if (isReal(v))     n = BigInt(v.value.trunc().toFixed(0));
  else throw new RPLError('Bad argument type');
  const m = _mask();
  const payload = n & m;
  const base = getBinaryBase() || 'h';
  s.push(BinaryInteger(payload, base));
});

/* ------------------------------------------------------------------
   Unit ops.

     UVAL     ( u        -- x )           numeric value, unit stripped
     UBASE    ( u        -- u' )          reduce to SI-base units
     →UNIT    ( x u      -- u' )          attach u's unit to x
     CONVERT  ( u1 u2    -- u3 )          express u1 in u2's units
                                          (u2's value is ignored — only
                                          its uexpr matters, matching
                                          the HP50's unit-shape role)

   `CONVERT` requires u1 and u2 to share a dimension vector; otherwise
   throws 'Inconsistent units'.  The result value is
       u1.value * scale(u1) / scale(u2)
   so `1_km 1_ft CONVERT` → `3280.839…_ft`.
   ------------------------------------------------------------------ */
register('UVAL', (s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Real(u.value));
});

register('UBASE', (s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const { scale, uexpr } = toBaseUexpr(u.uexpr);
  s.push(_makeUnit(u.value * scale, uexpr));
});

register('→UNIT', (s) => {
  const [x, u] = s.popN(2);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const xv = _numVal(x);
  s.push(Unit(xv, u.uexpr));
});
register('->UNIT', (s) => OPS.get('→UNIT').fn(s));  // ASCII alias

register('CONVERT', (s) => {
  const [u1, u2] = s.popN(2);
  if (!isUnit(u1) || !isUnit(u2)) throw new RPLError('Bad argument type');
  if (!sameDims(u1.uexpr, u2.uexpr)) throw new RPLError('Inconsistent units');
  // If u1 and u2 already share the same canonical uexpr, skip the
  // scale arithmetic — avoids floating-point drift for identity
  // conversions (`1_m 1_m CONVERT` stays exactly 1_m).
  if (uexprEqual(u1.uexpr, u2.uexpr)) { s.push(u1); return; }
  const val = u1.value * scaleOf(u1.uexpr) / scaleOf(u2.uexpr);
  s.push(Unit(val, u2.uexpr));
});

/* ------------------------------------------------------------------
   CAS — symbolic differentiation.

   DERIV  ( expr 'var' -- d-expr )

   Pops a Symbolic and a variable Name; pushes a Symbolic that is the
   derivative of `expr` with respect to `var`.  Fully simplified.

     '2*X + 3' 'X' DERIV   →   '2'
     'X^3 + 2*X' 'X' DERIV →   '3*X^2 + 2'
     'X^2 + Y^2' 'X' DERIV →   '2*X'       (Y treated as constant)

   For numeric-only inputs we accept a Real/Integer as shorthand: the
   derivative of a number w.r.t. anything is 0, so pushing Real(0) is
   harmless and lets users evaluate DERIV without first constructing
   a Symbolic.  Anything else is "Bad argument type".

   Shape of `var` argument: a Name (quoted or not).  We read .id.  If
   the user accidentally typed a plain string we ALSO accept it, to
   be forgiving — HP50 canonical form is a Name.

   This is the first slice of the longstanding CAS wishlist.  Followups
   will add INTVX, EXPAND, COLLECT, FACTOR on top of the same AST.
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   EXPAND  ( expr -- expanded )

   Distribute products and small integer powers of sums, then pass the
   result through the simplifier so the like-terms combiner sums
   coefficients.  Classic CAS expansion:

     '(X+1)^2' EXPAND      →  'X^2 + 2*X + 1'
     '(X+1)*(X-1)' EXPAND  →  'X^2 - 1'
     '(2*X+1)^3' EXPAND    →  '8*X^3 + 12*X^2 + 6*X + 1'

   Unsupported operand shapes (rational / negative / non-numeric
   exponents, fractional bases, etc.) pass through unchanged — EXPAND
   is partial by design and composes with DERIV / EVAL.  Constants
   and lone variables are idempotent.
   ------------------------------------------------------------------ */

register('EXPAND', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `expand(${e})`);
    const ast = giacToAst(giac.caseval(cmd));
    s.push(Symbolic(ast));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    // Numbers and bare Names are idempotent under EXPAND.  Pushing the
    // value back keeps EXPAND a no-op in those cases — matches the HP50
    // convention that EXPAND on a non-algebraic is a pass-through.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   COLLECT  ( expr -- collected )                      (1-arg form)
   COLLECT  ( expr 'var' -- collected )                (2-arg form)

   The 1-arg form is a simplify alias so the CAS menu's COLLECT slot
   has a sensible target.  The 2-arg form is a polynomial collector:
   when the top of stack is a quoted Name (or a String), the op pops
   it as the collection variable and groups the expression below by
   powers of that variable:

     'X + A*X + B*X + C' 'X' COLLECT   →  '(A + B + 1)*X + C'
     'X^2 + 2*X^2 + X'  'X' COLLECT   →  '3*X^2 + X'

   Dispatch rule: look at the top of stack; if it's a Name / String
   AND the level-2 value is a Symbolic, treat it as the 2-arg form.
   Otherwise fall back to 1-arg (simplifier's like-terms combiner).

   Idempotent on numbers and bare names with stack depth 1, matching
   EXPAND's behavior so users can blindly compose either against any
   algebraic.
   ------------------------------------------------------------------ */
register('COLLECT', (s) => {
  // 2-arg form — top is a variable specifier and level-2 is a Symbolic.
  // Routes through Giac's `collect(expr,var)` which groups by powers of
  // the named variable.  We test level-2 first so a lone Name at depth
  // 1 still hits the pass-through path below.
  if (s.depth >= 2) {
    const top = s.peek(1);
    const below = s.peek(2);
    if ((isName(top) || isString(top)) && isSymbolic(below)) {
      const varName = isName(top) ? top.id : top.value;
      s.pop();                             // discard the variable spec
      const expr = s.pop();
      if (!giac.isReady()) throw new RPLError('CAS not ready');
      const cmd = buildGiacCmd(expr.expr, (e) => `collect(${e},${varName})`, [varName]);
      s.push(Symbolic(giacToAst(giac.caseval(cmd))));
      return;
    }
  }
  // 1-arg form — simplify alias.  Giac's `simplify()` combines like
  // terms and canonicalises — same intent as the old algebra.simplify.
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `simplify(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   SIMPLIFY  ( expr -- simplified )

   HP50 CAS command.  Canonicalises an expression — combines like
   terms, cancels common factors, folds constants.  Thin shim over
   Giac's `simplify()` (the same call COLLECT's 1-arg form uses); the
   dedicated op exists so the HP50 CAS menu's SIMPLIFY slot and user
   programs that spell out `'expr' SIMPLIFY` keep working unchanged
   after the algebra.js retirement.  Numbers and bare names are
   idempotent — pushed back untouched.
   ------------------------------------------------------------------ */
register('SIMPLIFY', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `simplify(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) { s.push(v); return; }
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   FACTOR  ( expr -- factored )

   Attempts to factor a polynomial.  Current coverage:

     monic quadratic with integer roots
       'X^2 + 2*X + 1'  FACTOR  →  '(X + 1)^2'
       'X^2 - 1'        FACTOR  →  '(X - 1)*(X + 1)'
       'X^2 + 5*X + 6'  FACTOR  →  '(X + 2)*(X + 3)'

   Unsupported shapes (non-monic, irrational roots, degree > 2,
   multi-variable) pass through unchanged — matches EXPAND's partial
   convention so composition stays safe.

   Accepts Symbolic directly.  Integer (and integer-valued Real)
   operands prime-factorise:
       12 FACTOR  →  '2^2*3'
        7 FACTOR  →  '7'            (already prime)
      -12 FACTOR  →  '-(2^2*3)'
   0 / ±1 / non-integer Real / Name pass through unchanged — no
   meaningful factorisation, and the user's input shape is preserved
   so FACTOR remains composition-safe.
   ------------------------------------------------------------------ */
register('FACTOR', (s) => {
  const v = s.pop();

  // Symbolic input: route to Giac.  Convert the AST to a Giac expression
  // string, call factor(...), then parse Giac's output back into an AST.
  // No fallback — if Giac isn't ready or the call errors, the op errors.
  if (isSymbolic(v)) {
    if (!giac.isReady()) {
      throw new RPLError('CAS not ready');
    }
    const cmd = buildGiacCmd(v.expr, (e) => `factor(${e})`);
    const giacResult = giac.caseval(cmd);
    const ast = giacToAst(giacResult);
    s.push(Symbolic(ast));
    return;
  }

  // Integer input: keep the native trial-division path. It's fast for
  // the classroom-calculator range, handles negatives/zero/one/huge-int
  // edge cases crisply, and doesn't need Giac. (Routing it to Giac would
  // actually regress — caseval("factor(12)") returns "(2)^2*3" which is
  // not what HP50 users expect.)
  if (isInteger(v) || (isReal(v) && v.value.isInteger())) {
    const bv = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
    const abs = bv < 0n ? -bv : bv;
    // 0 and ±1 have no meaningful prime factorisation; primes above
    // 2^53 exceed what an AstNum can hold without precision loss, so
    // in both cases pass the value through.  Users rarely run FACTOR
    // on 20-digit primes and the trial-division loop wouldn't finish
    // on them anyway.
    if (abs < 2n || abs > BigInt(Number.MAX_SAFE_INTEGER)) {
      s.push(v);
      return;
    }
    const factors = _primeFactor(abs);
    let ast = _factorsToAst(factors);
    if (bv < 0n) ast = AstNeg(ast);
    s.push(Symbolic(ast));
    return;
  }
  if (isReal(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/** Prime factorise a positive BigInt ≥ 2.  Returns an array of
 *  `{ p: BigInt, e: number }` ascending by prime.  Trial division
 *  with a 2-then-odds wheel; fine for values up to ~2^53 (FACTOR
 *  bails out past that).  Not a cryptographic primitive — just a
 *  classroom-calculator factoriser. */
function _primeFactor(n) {
  const factors = [];
  let rem = n;
  if (rem % 2n === 0n) {
    let e = 0;
    while (rem % 2n === 0n) { rem /= 2n; e++; }
    factors.push({ p: 2n, e });
  }
  for (let p = 3n; p * p <= rem; p += 2n) {
    if (rem % p !== 0n) continue;
    let e = 0;
    while (rem % p === 0n) { rem /= p; e++; }
    factors.push({ p, e });
  }
  if (rem > 1n) factors.push({ p: rem, e: 1 });
  return factors;
}

/** Build a Symbolic AST for the product `p1^e1 * p2^e2 * …`.  Single
 *  factor with exponent 1 (i.e. the input was prime) gives a lone
 *  Num; longer lists left-fold into a `*` chain. */
function _factorsToAst(factors) {
  const terms = factors.map(({ p, e }) => {
    const pAst = AstNum(Number(p));
    return e === 1 ? pAst : AstBin('^', pAst, AstNum(e));
  });
  return terms.reduce((acc, t) => AstBin('*', acc, t));
}

/* ------------------------------------------------------------------
   SOLVE  ( eqn 'var' -- { eqn1 eqn2 ... } )
   SOLVE  ( expr 'var' -- { eqn1 eqn2 ... } )     (expr = 0 implied)

   Solve a single-variable linear or quadratic equation.  Returns a
   list of Symbolic equations — one per root,
   in the order the closed-form formula produces them (larger root
   first for quadratics; rational-root order for cubic / quartic
   via FACTOR).

       'X^2 - 4'   'X' SOLVE    →  { 'X = 2' 'X = -2' }
       'X^2 = X'   'X' SOLVE    →  { 'X = 1' 'X = 0' }
       '2*X - 4'   'X' SOLVE    →  { 'X = 2' }
       'X^2 + X - 1' 'X' SOLVE  →  { 'X = (-1 + √5)/2' 'X = (-1 - √5)/2' }
       'X^2 + 1'   'X' SOLVE    →  { }   (no real roots; complex TBD)
       'X^3 - 6X^2 + 11X - 6' 'X' SOLVE  →  { 'X = 1' 'X = 3' 'X = 2' }

   The variable can be a Name (HP50 canonical) or a String for typed
   convenience; either way we pull out the identifier and pass it
   into algebraSolve.  Expressions whose shape isn't recognised
   (non-polynomial, symbolic coefficients, degree > 4) fall through
   as an empty list.
   ------------------------------------------------------------------ */
register('SOLVE', (s) => {
  const varArg  = s.pop();
  const exprArg = s.pop();

  // Pull variable identifier.
  let varName;
  if (isName(varArg))      varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Pull expression AST.  Real/Integer/Name get treated as bare
  // expressions (constants / single variables) — a constant has
  // no root unless it's zero; a Name matches only when it equals
  // varName and gives X = 0.
  let ast;
  if (isSymbolic(exprArg))        ast = exprArg.expr;
  else if (isName(exprArg))       ast = AstVar(exprArg.id);
  else if (isReal(exprArg))       ast = AstNum(exprArg.value.toNumber());
  else if (isInteger(exprArg))    ast = AstNum(Number(exprArg.value));
  else throw new RPLError('Bad argument type');

  // Normalise equation form `lhs = rhs` to expression form `lhs - rhs`
  // before handing to Giac.  Giac's `solve` accepts both shapes, but the
  // bare-expression form is unambiguous regardless of caseval mode flags
  // (Xcas vs Maple/Mupad parsing of `=`), so we can stop worrying about
  // a future build of giacwasm.js shipping with a different default.
  // `=` is the only comparison form HP50 SOLVE recognises (≠/≥/… aren't
  // equation roots in the textbook sense); anything else passes through
  // unchanged and Giac will reject it the same way it does today.
  if (ast && ast.kind === 'bin' && ast.op === '=') {
    ast = AstBin('-', ast.l, ast.r);
  }

  // Route through Giac: `solve(expr,var)` returns a list literal like
  // `[r1,r2,…]`.  We split the list (nesting-aware via splitGiacList),
  // parse each root, and wrap each as an equation `var = root` —
  // matches the HP50 convention that SOLVE yields a list of equations.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(ast, (e) => `solve(${e},${varName})`, [varName]);
  let raw = giac.caseval(cmd);
  // Numeric fallback: when Giac can't reduce a root to closed-form
  // radicals (typically a cubic with no rational roots, or higher-
  // degree polynomials), it returns its `rootof([[…]],[[…]])`
  // placeholder syntax.  Our algebra parser can't decode that nested-
  // array argument shape, so retry with `fsolve` which returns real
  // roots numerically (e.g. `[-0.6388…]`).  Matches the HP50
  // convention that SOLVE returns real roots only.
  if (typeof raw === 'string' && raw.includes('rootof')) {
    const cmdN = buildGiacCmd(ast, (e) => `fsolve(${e},${varName})`, [varName]);
    raw = giac.caseval(cmdN);
  }
  let parts = splitGiacList(raw);
  // Giac returns `[]` for "no solutions", or — on some inputs / build
  // configurations — a bare scalar when it has a single root and didn't
  // wrap it in a list.  Treat the bare-scalar case as a one-element list
  // so `'X-1' 'X' SOLVE` doesn't collapse to `{ }` in builds that elide
  // the brackets.  Genuine no-solution stays `[]` → empty list.
  if (parts === null) {
    const trimmed = String(raw).trim();
    if (trimmed.length > 0) parts = [trimmed];
  }
  if (parts === null || parts.length === 0) {
    s.push(RList([]));
    return;
  }
  const items = parts.map((rootStr) => {
    const rootAst = giacToAst(rootStr);
    return Symbolic(AstBin('=', AstVar(varName), rootAst));
  });
  s.push(RList(items));
});

/* ------------------------------------------------------------------
   ISOL  ( expr 'var' -- { eqn1 eqn2 ... } )

   HP50 CAS command — "isolate" a variable.  On the stock HP50 ISOL
   inverts an expression algebraically and returns a single equation
   `X = …` with sign-placeholder variables for the ambiguous branches.
   Giac doesn't expose an `isolate` primitive; the closest semantic
   match is `solve(expr,var)` which returns every branch as a concrete
   root.  We therefore register ISOL as a thin alias of SOLVE: same
   inputs, same output shape (list of `var=root` equations).  Users
   writing `'expr' 'X' ISOL` in programs imported from an HP50 will
   see a list instead of a single equation for multi-branch cases —
   slightly more informative than the HP's sign-placeholder form, and
   still composable (DUP HEAD / first-element access picks the branch
   they'd have gotten natively).

       'A*X + B'  'X' ISOL    →  { 'X = -B/A' }
       'X^2 - 4'  'X' ISOL    →  { 'X = 2' 'X = -2' }
   ------------------------------------------------------------------ */
register('ISOL', lookup('SOLVE').fn);

/* ------------------------------------------------------------------
   SUBST  ( expr 'var' value -- result )                (3-arg form)
   SUBST  ( expr { 'var' value ... } -- result )        (2-arg list)

   Substitute a value into an expression.  The
   3-argument form takes a Name / String as the target variable and
   any AST-representable value (Real, Integer, Symbolic, Name).  The
   list form accepts a List of alternating (name, value) pairs for
   convenient multi-substitution:

     'X^2 + 1' 'X' 3 SUBST              →  10
     'A*X + B' 'X' 'Y+1' SUBST          →  'A*(Y + 1) + B'
     'X + Y' { 'X' 2 'Y' 3 } SUBST      →  5

   After every substitution the expression is simplified, so numeric
   substitutions collapse to a Real when all free variables bind to
   concrete numbers.  Anything more exotic stays symbolic.

   Unwrap rule: if the post-simplify AST is a pure Num, we push a
   Real; otherwise we push a Symbolic.  Matches DERIV's unwrap
   convention ('0' comes back as Real(0)).
   ------------------------------------------------------------------ */
register('SUBST', (s) => {
  // SUBST routes through Giac: each (var → value) binding becomes
  // `subst(expr, var=valueExpr)`.  Multi-substitution is applied
  // sequentially — Giac's own multi-subst is associative but the
  // sequential form keeps the code path identical between the list
  // and 3-arg forms.  We purge the binding var as well as the free
  // vars of both expr and value so Xcas built-ins stay neutralised.
  const substViaGiac = (ast, vname, valueAst) => {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const valueGiac = astToGiac(valueAst);
    // `freeVars(valueAst)` doesn't get walked by `buildGiacCmd` (which
    // only walks exprAst) so we pass the value's free vars in via
    // extraVars, plus the binding variable itself.
    const extra = [vname, ...algebraFreeVars(valueAst)];
    const cmd = buildGiacCmd(
      ast,
      (e) => `subst(${e},${vname}=${valueGiac})`,
      extra,
    );
    return giacToAst(giac.caseval(cmd));
  };

  const top = s.peek();

  // Form A: list form.  Walks items looking for either a
  //   Symbolic equation (one item, Bin('=', Var, rhs)), or
  //   a (name, value) pair (two consecutive items).
  // Equation entries coexist with strict-pair semantics: pairs are
  // used when no equations appear.
  if (isList(top)) {
    const items = top.items;
    s.pop();
    const exprVal = s.pop();
    if (!isSymbolic(exprVal) && !isName(exprVal)) {
      throw new RPLError('Bad argument type');
    }
    let ast = isSymbolic(exprVal) ? exprVal.expr
            : AstVar(exprVal.id);
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (_isEquationSymbolic(item)) {
        ast = substViaGiac(ast, item.expr.l.name, item.expr.r);
        i += 1;
      } else {
        if (i + 1 >= items.length) {
          throw new RPLError('SUBST: list needs pairs or equations');
        }
        const nameVal  = item;
        const valueVal = items[i + 1];
        const vname = isName(nameVal)    ? nameVal.id
                    : isString(nameVal)  ? nameVal.value
                    : null;
        if (vname === null) throw new RPLError('SUBST: bad variable name in list');
        ast = substViaGiac(ast, vname, coerceToAst(valueVal));
        i += 2;
      }
    }
    _pushSubstResult(s, ast);
    return;
  }

  // Form B: equation on top.  `expr 'X = 3' SUBST` — the HP50-canonical
  // 2-arg form.
  if (s.depth >= 2 && _isEquationSymbolic(top)) {
    const eqn = s.pop();
    const exprVal = s.pop();
    let ast;
    if (isSymbolic(exprVal))     ast = exprVal.expr;
    else if (isName(exprVal))    ast = AstVar(exprVal.id);
    else if (isReal(exprVal))    ast = AstNum(exprVal.value.toNumber());
    else if (isInteger(exprVal)) ast = AstNum(Number(exprVal.value));
    else throw new RPLError('Bad argument type');
    const result = substViaGiac(ast, eqn.expr.l.name, eqn.expr.r);
    _pushSubstResult(s, result);
    return;
  }

  // Form C: 3-arg form: expr 'var' value.
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [exprVal, varVal, valueVal] = s.popN(3);
  let ast;
  if (isSymbolic(exprVal))    ast = exprVal.expr;
  else if (isName(exprVal))   ast = AstVar(exprVal.id);
  else if (isReal(exprVal))   ast = AstNum(exprVal.value.toNumber());
  else if (isInteger(exprVal)) ast = AstNum(Number(exprVal.value));
  else throw new RPLError('Bad argument type');
  const vname = isName(varVal)   ? varVal.id
              : isString(varVal) ? varVal.value
              : null;
  if (vname === null) throw new RPLError('SUBST: bad variable');
  const result = substViaGiac(ast, vname, coerceToAst(valueVal));
  _pushSubstResult(s, result);
});

/** True when v is a Symbolic whose AST is `Bin('=', Var(name), rhs)` —
 *  the shape SUBST consumes as a one-shot variable binding. */
function _isEquationSymbolic(v) {
  return isSymbolic(v) && v.expr && v.expr.kind === 'bin' &&
         v.expr.op === '=' && v.expr.l && v.expr.l.kind === 'var';
}

/** Coerce a stack value to an algebra AST node for substitution. */
function coerceToAst(v) {
  if (isSymbolic(v)) return v.expr;
  if (isReal(v))     return AstNum(v.value.toNumber());
  if (isInteger(v))  return AstNum(Number(v.value));
  if (isName(v))     return AstVar(v.id);
  throw new RPLError('SUBST: unsupported value type');
}

/** Push the simplified result of a SUBST — unwrap Num to Real for
 *  users who substitute numeric values into every free variable. */
function _pushSubstResult(s, ast) {
  if (ast && ast.kind === 'num') { s.push(Real(ast.value)); return; }
  if (ast && ast.kind === 'var') { s.push(Name(ast.name)); return; }
  s.push(Symbolic(ast));
}

register('DERIV', (s) => {
  const [expr, varArg] = s.popN(2);     // level2=expr, level1=var
  // Variable: accept Name (preferred) or String.
  let varName;
  if (isName(varArg))      varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Expression: Symbolic → route through Giac's diff(expr, var).
  // `buildGiacCmd` adds `purge(…)` for every free variable (the diff
  // variable included, via extraVars) so Xcas built-in names like
  // `UI`/`GF` don't collide with the user's identifiers.
  if (isSymbolic(expr)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(expr.expr, (e) => `diff(${e},${varName})`, [varName]);
    const ast = giacToAst(giac.caseval(cmd));
    s.push(Symbolic(ast));
    return;
  }
  // Constant shortcut — number → 0.
  if (isReal(expr) || isInteger(expr)) {
    s.push(Real(0));
    return;
  }
  // Bare Name: treat as the variable itself.  `'X' 'X' DERIV` should
  // yield `1`; `'Y' 'X' DERIV` yields `0`.  Pushing an Integer is fine,
  // and keeps the result usable from numeric code without unwrapping a
  // Symbolic just to read the 1 back out.
  if (isName(expr)) {
    s.push(Integer(expr.id === varName ? 1n : 0n));
    return;
  }
  throw new RPLError('Bad argument type');
});

/** INTEG — indefinite integral of a symbolic expression w.r.t. a variable.
 *
 *  Stack:  level2=expr, level1=var  →  antiderivative
 *
 *  Expression types accepted:
 *    Symbolic       — routed through algebra.integ (polynomial + linearity
 *                     + a handful of direct-arg trig/exp/log cases)
 *    Real/Integer   — constants integrate to c*var
 *    Name           — bare name behaves like a Symbolic Var
 *  Anything that doesn't simplify to a closed form comes back as
 *  a Symbolic `INTEG(expr, var)` so the result round-trips. */
register('INTEG', (s) => {
  const [expr, varArg] = s.popN(2);
  let varName;
  if (isName(varArg))        varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Helper: call Giac's integrate(expr,var).  `extraVars` includes the
  // integration variable so it gets purged alongside the free vars —
  // without this, `integrate(UI, UI)` would see Giac's reserved `UI`.
  const integrateViaGiac = (ast) => {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(ast, (e) => `integrate(${e},${varName})`, [varName]);
    return giacToAst(giac.caseval(cmd));
  };

  if (isSymbolic(expr)) {
    s.push(Symbolic(integrateViaGiac(expr.expr)));
    return;
  }
  if (isReal(expr) || isInteger(expr)) {
    const c = isInteger(expr) ? Number(expr.value) : expr.value;
    if (c === 0) { s.push(Integer(0n)); return; }
    s.push(Symbolic(integrateViaGiac(AstNum(c))));
    return;
  }
  if (isName(expr)) {
    s.push(Symbolic(integrateViaGiac(AstVar(expr.id))));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- INTVX / DERVX — VX-implicit forms --------------------
 *
 * HP50 AUR §3.4.  Same engines as INTEG / DERIV but the variable comes
 * from the CAS-main slot rather than the stack — convenient when the
 * user has already SVX'd their preferred variable.  Implemented as a
 * thin shim that pushes `Name(VX)` and delegates to the explicit-var
 * sibling so any future refinement of INTEG / DERIV is automatically
 * inherited.
 *
 * `DERIVX` is the verbose spelling some HP family programs use; we
 * register it as an alias so either name works. */

register('INTVX', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  s.push(Name(getCasVx()));
  OPS.get('INTEG').fn(s);
});

/* The HP50 token `∫` decompiles to the integration function.  The AUR
   shows it as a 4-arg form (lower upper integrand var → ∫); this app
   only ships the 2-arg INTEG semantics so we register the glyph as an
   alias for INTEG.  Programs that produce `∫` from the keyboard or via
   `→PRG` therefore still execute. */
register('∫', (s) => { OPS.get('INTEG').fn(s); });

register('DERVX', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  s.push(Name(getCasVx()));
  OPS.get('DERIV').fn(s);
});
register('DERIVX', (s) => { OPS.get('DERVX').fn(s); });

/** SUM — sum the elements of a list or vector, or wrap a symbolic
 *  operand as an unevaluated Σ(expr).
 *
 *  Stack:  level1=list|vector|number|symbolic  →  scalar | symbolic
 *
 *  Numeric rule: List / Vector elements must all be numeric (Real,
 *  Integer, or Complex — same promotion rules as the `+` op).  A
 *  single-level list of scalars is enough; nested lists are not
 *  flattened.  Empty list/vector sums to Integer(0). */
register('SUM', (s) => {
  const v = s.pop();
  if (isList(v) || isVector(v)) {
    const items = v.items;
    if (items.length === 0) { s.push(Integer(0n)); return; }
    let acc = items[0];
    for (let i = 1; i < items.length; i++) {
      const { a, b, kind } = promoteNumericPair(acc, items[i]);
      if (kind === 'integer')     acc = Integer(a + b);
      else if (kind === 'real')   acc = Real(a + b);
      else if (kind === 'complex') acc = Complex(a.re + b.re, a.im + b.im);
      else throw new RPLError('Bad argument type');
    }
    s.push(acc);
    return;
  }
  if (isSymbolic(v)) {
    s.push(Symbolic(AstFn('SUM', [v.expr])));
    return;
  }
  if (isName(v)) {
    s.push(Symbolic(AstFn('SUM', [AstVar(v.id)])));
    return;
  }
  if (isReal(v) || isInteger(v) || isComplex(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ================================================================
   Matrix / Vector ops — starter set

   SIZE and TRN are 1-arg ops that don't commit to a promotion rule
   for mixed scalar/matrix inputs.  Element-wise +/- on two Vectors
   of equal length is wired into the main `+` handler and
   `binaryMath('-')` dispatch — see the `_withTaggedBinary`-wrapped
   second-pass registrations near the end of this file (the authoritative
   sites; earlier arithmetic register() calls are left as historical
   no-ops, overridden by these later ones per Map semantics).

   HP50 SIZE/TRN semantics:
     SIZE  Vector([a b c])      → { 3 }            list of one integer
     SIZE  Matrix([[...][...]]) → { rows cols }    list of two integers
     TRN   Matrix m×n           → Matrix n×m       (pure transpose —
                                                    no complex conjugate
                                                    since we don't have
                                                    complex entries in
                                                    matrices yet)
   ================================================================ */

register('SIZE', (s) => {
  const [v] = s.popN(1);
  // HP50 Advanced Guide spec: SIZE on array-shaped values returns a
  // list of REAL numbers (not Integers).  Aligned so downstream ops
  // reading the list don't have to worry about Integer → Real
  // promotion at the boundary.
  if (isVector(v)) {
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  // HP50 also defines SIZE on strings (returns count) and lists (same).
  // Provide those while we're here — they're trivial and the HP50
  // User Guide documents a single SIZE op that overloads across
  // sequence-like types.  String/List SIZE returns a scalar Integer,
  // not a list, on the real HP50 — we keep that shape.
  if (isString(v)) { s.push(Integer(BigInt(v.value.length))); return; }
  if (isList(v))   { s.push(Integer(BigInt(v.items.length))); return; }
  // HP50 AUR §5.3: SIZE on a Program returns an Integer count of the
  // objects (tokens) in the program body.  Matches the HP50's general
  // principle that SIZE reports the number of "elements" in a composite
  // object.  Empty program « » → 0; deeply nested programs count only
  // the top-level tokens (sub-programs count as 1 token each).
  if (isProgram(v)) { s.push(Integer(BigInt(v.tokens.length))); return; }
  throw new RPLError('Bad argument type');
});

register('TRN', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const rows = m.rows.length;
  const cols = rows > 0 ? m.rows[0].length : 0;
  if (rows === 0 || cols === 0) { s.push(m); return; }
  // Build the transpose: new[j][i] = m.rows[i][j].
  const out = [];
  for (let j = 0; j < cols; j++) {
    const row = new Array(rows);
    for (let i = 0; i < rows; i++) {
      row[i] = m.rows[i][j];
    }
    out.push(row);
  }
  s.push(Matrix(out));
});

/* ================================================================
   Matrix / Vector ops — MATRICES soft-menu slots

   Builds on the starter set (SIZE, TRN, element-wise +/-, dot-on-`*`,
   matmul) with the remaining MATRICES soft-menu ops:

     DOT    V V →  scalar       — explicit dot product (alias of `V V *`)
     CROSS  V V →  V            — 3-vector cross product
     IDN    n   →  Matrix(n×n)  — identity (n an Integer or square Matrix)
     NORM   V   →  Real         — Euclidean norm  (√(Σ xᵢ²))
     NORM   M   →  Real         — Frobenius norm  (√(Σ mᵢⱼ²))
     DET    M   →  scalar       — determinant (Laplace expansion; 1×1/2×2
                                  closed-form fast paths)
     INV    M   →  Matrix       — inverse (Gauss-Jordan with partial
                                  pivoting; only added to the existing
                                  scalar-INV registration, see the branch
                                  we add in-place below)

   Error surface:
     - Non-square input to DET/INV/IDN(Matrix) → 'Invalid dimension'
     - Length mismatch on DOT → 'Invalid dimension'
     - CROSS requires both operands length 3 → 'Invalid dimension'
     - Singular matrix to INV → 'Infinite result' (matches scalar INV)
     - Non-numeric entry reaching INV → 'Bad argument type' (symbolic
       matrix inverse is not supported; DET does tolerate symbolic
       entries because cofactor expansion routes through _scalarBinary
       which lifts Name/Symbolic to AST form).
   ================================================================ */

/** Cofactor-expansion determinant.  Works on any square row matrix
 *  whose entries are values `_scalarBinary` can add/subtract/multiply
 *  (so Real/Integer/Complex/Symbolic all compose — no Float coercion
 *  so Integer-only matrices stay Integer throughout). */
function _det(rows) {
  const n = rows.length;
  if (n === 1) return rows[0][0];
  if (n === 2) {
    const ad = _scalarBinary('*', rows[0][0], rows[1][1]);
    const bc = _scalarBinary('*', rows[0][1], rows[1][0]);
    return _scalarBinary('-', ad, bc);
  }
  // Laplace expansion along row 0.  O(n!), fine for HP50-sized inputs.
  let det = null;
  for (let j = 0; j < n; j++) {
    const minor = rows.slice(1).map(row => row.filter((_, k) => k !== j));
    const cof = _det(minor);
    let term = _scalarBinary('*', rows[0][j], cof);
    if ((j & 1) === 1) term = _scalarBinary('-', Real(0), term);
    det = (det === null) ? term : _scalarBinary('+', det, term);
  }
  return det;
}

register('DET', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const n = m.rows.length;
  const cols = n > 0 ? m.rows[0].length : 0;
  if (n !== cols) throw new RPLError('Invalid dimension');
  if (n === 0) { s.push(Real(1)); return; }
  s.push(_det(m.rows));
});

register('DOT', (s) => {
  const [a, b] = s.popN(2);
  if (!isVector(a) || !isVector(b)) throw new RPLError('Bad argument type');
  if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
  const parts = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
  s.push(_scalarSum(parts));
});

register('CROSS', (s) => {
  const [a, b] = s.popN(2);
  if (!isVector(a) || !isVector(b)) throw new RPLError('Bad argument type');
  if (a.items.length !== 3 || b.items.length !== 3) {
    throw new RPLError('Invalid dimension');
  }
  const [a0, a1, a2] = a.items;
  const [b0, b1, b2] = b.items;
  const c0 = _scalarBinary('-',
    _scalarBinary('*', a1, b2),
    _scalarBinary('*', a2, b1));
  const c1 = _scalarBinary('-',
    _scalarBinary('*', a2, b0),
    _scalarBinary('*', a0, b2));
  const c2 = _scalarBinary('-',
    _scalarBinary('*', a0, b1),
    _scalarBinary('*', a1, b0));
  s.push(Vector([c0, c1, c2]));
});

register('IDN', (s) => {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v)) n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else if (isMatrix(v)) {
    // HP50: IDN on a matrix uses its row count (must be square).
    n = v.rows.length;
    if (n > 0 && v.rows[0].length !== n) throw new RPLError('Invalid dimension');
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n <= 0) throw new RPLError('Bad argument value');
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(Real(0));
    row[i] = Real(1);
    rows.push(row);
  }
  s.push(Matrix(rows));
});

register('NORM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    s.push(Real(_decimalFrobeniusNorm(v.items)));
    return;
  }
  if (isMatrix(v)) {
    // Frobenius norm = √(Σᵢⱼ mᵢⱼ²).
    s.push(Real(_decimalFrobeniusNorm(v.rows.flat())));
    return;
  }
  throw new RPLError('Bad argument type');
});

/** Numeric-only matrix inverse via Gauss-Jordan with partial pivoting.
 *  Returns a new array-of-arrays of Real values.  Throws on singular
 *  and on non-numeric entries (symbolic matrix inverse is beyond the
 *  scope of this pass — we document the limitation in the ops.js
 *  block comment above). */
function _invMatrixNumeric(rows) {
  const n = rows.length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) throw new RPLError('Bad argument type');
    }
  }
  // Convert to plain JS numbers and build augmented [A | I].
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
    // Partial pivot: find max |a[i][k]| for i >= k.
    let best = k, bestAbs = Math.abs(a[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs === 0) throw new RPLError('Infinite result');
    if (best !== k) {
      [a[k], a[best]] = [a[best], a[k]];
      [I[k], I[best]] = [I[best], I[k]];
    }
    const piv = a[k][k];
    for (let j = 0; j < n; j++) { a[k][j] /= piv; I[k][j] /= piv; }
    // Eliminate all other rows.
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = a[i][k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[i][j] -= f * a[k][j];
        I[i][j] -= f * I[k][j];
      }
    }
  }
  return I.map(row => row.map(x => Real(x)));
}

/* ================================================================
   List ops: GET / PUT / HEAD / TAIL / SUB
             →LIST / LIST→ / POS
   Stored-var arithmetic: STO+ / STO- / STO* / STO/
   Reflection: TYPE / OBJ→

   User Guide refs: §3 (Lists) and §2 (Types / OBJ→).

   List-ops design notes
   ---------------------
   All indices are 1-based to match HP50 convention.  Invalid indices
   throw `Bad argument value` (matches HP50 "Invalid Dimension").

   GET / PUT overload:
     list      n          →  element              (GET)
     vector    n          →  element
     matrix    {row col}  →  element              (row col = 2-element list)
     string    n          →  1-char string

     list      n val      →  list'                (PUT)
     vector    n val      →  vector'
     matrix    {r c} val  →  matrix'

   HEAD / TAIL take a list or string.  TAIL of a length-1 list is
   the empty list (HP50 behavior).

   SUB is inclusive; m > len and n > len clamp to len.  m > n yields
   an empty slice.

   →LIST / LIST→ accept / produce a Real or Integer count marker.
   Both ASCII (`->LIST` / `LIST->`) and Unicode aliases register.

   POS returns an Integer index, 0 when not found.  String-in-string
   POS uses JS `indexOf` for substring match; list POS compares items
   structurally via a recursive `_rplEqual` that matches HP50's SAME.
   ================================================================ */

// Coerce a Real/Integer/BinaryInteger to a 1-based integer index.
// Rejects non-ints, negatives, and zero — matches HP50 "Bad Argument
// Type" for anything that isn't a plain non-negative whole number.
//
// BinaryInteger branch matches the BinInt widening that
// `_toCountIdx` (→PRG, →STREAM, etc.) has.  `→LIST 3 ENTER #3h ENTER`
// behaves identically to `→LIST 3 ENTER 3 ENTER` — BinInt is a
// first-class integer type throughout the stack.
function _toIntIdx(v) {
  if (isInteger(v)) {
    const n = Number(v.value);
    if (n < 1 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    const n = v.value.toNumber();
    if (n < 1) throw new RPLError('Bad argument value');
    return n;
  }
  if (isBinaryInteger(v)) {
    const n = Number(v.value);
    if (n < 1 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  throw new RPLError('Bad argument type');
}

// Same as _toIntIdx but permits 0 (used by counts like →LIST N).
// BinaryInteger branch added for parity with →PRG.
function _toCountN(v) {
  if (isInteger(v)) {
    const n = Number(v.value);
    if (n < 0 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    const n = v.value.toNumber();
    if (n < 0) throw new RPLError('Bad argument value');
    return n;
  }
  if (isBinaryInteger(v)) {
    const n = Number(v.value);
    if (n < 0 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  throw new RPLError('Bad argument type');
}

// Structural equality for RPL values.  Used by POS.  Mirrors the
// semantics of SAME: numerically equal reals/integers compare equal,
// lists compare element-wise, strings/names compare by content.
function _rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  // Numeric cross-type equality (Integer vs Real).
  if (isNumber(a) && isNumber(b)) {
    if (isComplex(a) || isComplex(b)) {
      const ca = toComplex(a), cb = toComplex(b);
      return ca.re === cb.re && ca.im === cb.im;
    }
    return toRealOrThrow(a) === toRealOrThrow(b);
  }
  if (a.type !== b.type) return false;
  if (isString(a))  return a.value === b.value;
  if (isName(a))    return a.id === b.id && a.quoted === b.quoted;
  if (isList(a)) {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      if (!_rplEqual(a.items[i], b.items[i])) return false;
    }
    return true;
  }
  if (isVector(a)) {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      if (!_rplEqual(a.items[i], b.items[i])) return false;
    }
    return true;
  }
  if (isBinaryInteger(a)) return a.value === b.value;
  if (isTagged(a))        return a.tag === b.tag && _rplEqual(a.value, b.value);
  return false;
}

register('GET', (s) => {
  const [coll, idx] = s.popN(2);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    s.push(coll.items[n - 1]);
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    s.push(coll.items[n - 1]);
    return;
  }
  if (isMatrix(coll)) {
    // Index is { row col } — a 2-element list of indices.
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r > coll.rows.length) throw new RPLError('Bad argument value');
    const row = coll.rows[r - 1];
    if (c > row.length) throw new RPLError('Bad argument value');
    s.push(row[c - 1]);
    return;
  }
  if (isString(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.value.length) throw new RPLError('Bad argument value');
    s.push(Str(coll.value[n - 1]));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('PUT', (s) => {
  const [coll, idx, val] = s.popN(3);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    s.push(RList(items));
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    s.push(Vector(items));
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r > coll.rows.length) throw new RPLError('Bad argument value');
    const row = coll.rows[r - 1];
    if (c > row.length) throw new RPLError('Bad argument value');
    const newRows = coll.rows.map((ri, i) => {
      if (i !== r - 1) return ri;
      const copy = [...ri];
      copy[c - 1] = val;
      return copy;
    });
    s.push(Matrix(newRows));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('HEAD', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(v.items[0]);
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value[0]));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('TAIL', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(RList(v.items.slice(1)));
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value.slice(1)));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('SUB', (s) => {
  const [v, mVal, nVal] = s.popN(3);
  // Clamp indices HP50-style: 0/negative → 1; > len → len; m > n → empty.
  function _clampLo(x) { return x < 1 ? 1 : x; }
  if (isList(v)) {
    const m = _clampLo(_toCountN(mVal));
    const n = _toCountN(nVal);
    const len = v.items.length;
    if (m > len || n < m) { s.push(RList([])); return; }
    const hi = Math.min(n, len);
    s.push(RList(v.items.slice(m - 1, hi)));
    return;
  }
  if (isString(v)) {
    const m = _clampLo(_toCountN(mVal));
    const n = _toCountN(nVal);
    const len = v.value.length;
    if (m > len || n < m) { s.push(Str('')); return; }
    const hi = Math.min(n, len);
    s.push(Str(v.value.slice(m - 1, hi)));
    return;
  }
  throw new RPLError('Bad argument type');
});

// →LIST (and ASCII ->LIST alias): `x1 x2 … xn n → { x1 x2 … xn }`.
const _toListOp = (s) => {
  const nVal = s.pop();
  const n = _toCountN(nVal);
  if (n === 0) { s.push(RList([])); return; }
  const items = s.popN(n);
  s.push(RList(items));
};
register('→LIST',  _toListOp);
register('->LIST', _toListOp);

// LIST→ (and ASCII LIST-> alias): `{ x1 … xn } → x1 … xn n`.
const _fromListOp = (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  for (const item of l.items) s.push(item);
  s.push(Integer(BigInt(l.items.length)));
};
register('LIST→',  _fromListOp);
register('LIST->', _fromListOp);

register('POS', (s) => {
  const [coll, needle] = s.popN(2);
  if (isList(coll)) {
    for (let i = 0; i < coll.items.length; i++) {
      if (_rplEqual(coll.items[i], needle)) {
        s.push(Integer(BigInt(i + 1)));
        return;
      }
    }
    s.push(Integer(0n));
    return;
  }
  if (isString(coll)) {
    if (!isString(needle)) throw new RPLError('Bad argument type');
    const idx = coll.value.indexOf(needle.value);
    s.push(Integer(BigInt(idx + 1)));   // 0 if not found (indexOf=-1+1)
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ----------------------------------------------------------------
   Stored-variable arithmetic — STO+, STO-, STO*, STO/.

   HP50 accepts EITHER stack order:
     value  'name'  STO+          ('name'  value  STO+  too)
   We detect which operand is the Name/String and which is the value.

   If NEITHER operand is a name, HP50 treats STO+/STO- etc. as a form
   of object arithmetic (store add-into-level-2-object) but that path
   is rare; we throw "Bad argument type" rather than guess.
   ---------------------------------------------------------------- */
function _stoArith(opSymbol) {
  // Deferred lookup — the arithmetic op registrations live later in this
  // file, so `lookup(opSymbol)` at module-load time would find nothing.
  // Resolving at call time also means `_stoArith` always picks up the
  // authoritative dispatch even if the registry is re-wired later.
  return (s) => {
    const binop = lookup(opSymbol);
    if (!binop) throw new RPLError(`Bad argument value`);
    const [a, b] = s.popN(2);
    let nameVal, value;
    if (isName(a) || isString(a))      { nameVal = a; value = b; }
    else if (isName(b) || isString(b)) { nameVal = b; value = a; }
    else { throw new RPLError('Bad argument type'); }
    // STO+ / -/ * / /  always writes back into `id`, so validate up-front
    // against the same rules STO enforces.  Recalling a reserved or
    // syntactically broken name would only get us to "Undefined name"
    // anyway — fail earlier with the accurate "Invalid name" error.
    const id = _coerceStorableName(nameVal);
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    // Build a tiny stack, apply binop.  HP50 semantics: STO+ computes
    // stored + value (commutative for +/*; for -  and / the STORED
    // value is the LEFT operand, per HP50 Advanced Guide §3).
    s.push(stored);
    s.push(value);
    binop.fn(s);
    const [result] = s.popN(1);
    varStore(id, result);
  };
}

register('STO+', _stoArith('+'));
register('STO-', _stoArith('-'));
register('STO*', _stoArith('*'));
register('STO/', _stoArith('/'));

/* ----------------------------------------------------------------
   TYPE — returns the HP50 type code of the object on level 1.

   Our internal type set doesn't line up perfectly with the HP50's
   numeric catalogue (we don't distinguish real arrays from complex
   arrays, we merge Vector/Matrix into "array" = 3, and our arbitrary-
   precision Integer maps to HP50's ZINT = 28).  The mapping below
   favors the most commonly-used User-RPL numbers and matches what
   programs typically branch on.

   Codes follow HP50 User Guide §2 (Object types):
      0  Real
      1  Complex
      2  String
      3  Real array
      4  Complex array
      5  List
      6  Global name
      7  Local name
      8  Program
      9  Algebraic
     10  Binary integer
     11  Graphics object (grob)
     12  Tagged object
     13  Unit
     15  Directory
     28  Integer (ZINT)
   ---------------------------------------------------------------- */
function _hp50TypeCode(v) {
  if (isReal(v))          return 0;
  if (isComplex(v))       return 1;
  if (isString(v))        return 2;
  if (isVector(v)) {
    // complex array = 4, real array = 3
    return v.items.some(isComplex) ? 4 : 3;
  }
  if (isMatrix(v)) {
    for (const row of v.rows) {
      for (const x of row) if (isComplex(x)) return 4;
    }
    return 3;
  }
  if (isList(v))          return 5;
  if (isName(v))          return v.local ? 7 : 6;
  if (isProgram(v))       return 8;
  if (isSymbolic(v))      return 9;
  if (isBinaryInteger(v)) return 10;
  if (isTagged(v))        return 12;
  if (isUnit(v))          return 13;
  if (isDirectory(v))     return 15;
  if (isInteger(v))       return 28;
  // Grob (not fully wired yet) falls through; return -1 so programs can
  // still test.  HP50 never returns a negative code, but we've got no
  // better answer and this is a cleaner signal than throwing.
  return -1;
}

register('TYPE', (s) => {
  const [v] = s.popN(1);
  const code = _hp50TypeCode(v);
  s.push(Real(code));
});

/* ----------------------------------------------------------------
   OBJ→ — decompose level-1 object into its parts.

   Dispatch (matches HP50 AUR §3-149 Input/Output table):
     Complex(re,im)      → re im
     Tagged(tag, value)  → value "tag"             ← tag is a String per AUR
     List { x1 … xn }    → x1 … xn n
     Vector [ x1 … xn ]  → x1 … xn { n }
     Matrix [[...][...]] → x11 x12 … xmn { m n }
     String  "src"       → evaluate src (parse + push each result)
     Symbolic 'expr'     → arg1 … argn  n  'function'
     Program « t1 … tn » → t1 … tn n
     Real / Integer  x   → x                       ← AUR §3-149 lists no
                                                     numeric-scalar case;
                                                     AUR-fidelity choice
                                                     is to push back
                                                     unchanged.  The
                                                     mantissa / exponent
                                                     split is the job of
                                                     MANT / XPON (AUR
                                                     p.3-6 / p.3-9).
     BinaryInteger #n    → #n                      ← Same AUR-fidelity
                                                     choice as Real /
                                                     Integer: §3-149
                                                     lists no row, so
                                                     push back unchanged
                                                     rather than
                                                     auto-converting to
                                                     Real (that's what
                                                     B→R is for, AUR
                                                     p.3-46) or rejecting
                                                     with `Bad argument
                                                     type`.
     Rational  n/d       → n/d                     ← Same as above; the
                                                     N/D split lives at
                                                     →NUM (numerator) /
                                                     →DEN (denominator)
                                                     where applicable.
                                                     Push back unchanged
                                                     here.
     Unit  x_unit        → x  1_unit                ← AUR §3-149 row.
                                                     The bare numeric
                                                     value rides level 2
                                                     as a Real; the unit
                                                     prototype `1_unit`
                                                     (same uexpr, value
                                                     1) rides level 1.
                                                     `x  1_unit  *` is
                                                     the natural
                                                     round-trip: the
                                                     dimensionless Real
                                                     scales the unit
                                                     prototype back to
                                                     the original value.

   Tagged note: AUR §3-149 shows the tag output as `"tag"` — String,
   not Name.  See →TAG (AUR p.3-247) which accepts either a String OR
   a Name as the tag-side input but OBJ→'s canonical decomposition
   uses the String form.  Don't "fix" Str(v.tag) into Name(v.tag) —
   that would diverge from the AUR.

   Unit note: the Unit branch uses the bare `Unit(1, v.uexpr)`
   constructor rather than `_makeUnit` so a (theoretically possible)
   empty-uexpr Unit would still emit `Unit(1, [])` rather than
   collapsing to `Real(1)` — preserving the AUR table's
   shape-preserving "1_unit" output.  In practice the codebase's
   arithmetic invariant ensures Units on the stack always have
   non-empty uexpr (anything dimensionless flows through `_makeUnit`'s
   collapse), but the bare constructor keeps the OBJ→ branch robust
   against any future Unit constructor that doesn't go through that
   path.

   The Program case is the "program-as-data" hook RPL metaprogrammers
   reach for: `« ... » OBJ→` returns each token (as a stack-pushable
   value) followed by the integer token count.  The inverse is `→PRG`
   (see below).  Round-trip is guaranteed for any program token stream
   since each token is itself a value-type — Names, numbers, strings,
   nested Programs, etc.
   ---------------------------------------------------------------- */
register('OBJ→', (s) => {
  const [v] = s.popN(1);
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isTagged(v)) {
    // AUR §3-149: `:tag:obj  →  obj  "tag"` — the tag is a String.
    // (Don't switch to Name(v.tag) — see header block.)
    s.push(v.value);
    s.push(Str(v.tag));
    return;
  }
  if (isList(v)) {
    for (const item of v.items) s.push(item);
    s.push(Integer(BigInt(v.items.length)));
    return;
  }
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  if (isString(v)) {
    // OBJ→ on a string parses the string as RPL source, evaluates each
    // top-level token, and leaves the results on the stack.  We reuse
    // parseEntry so this stays consistent with typed entry.
    const parsed = _parseStringForObjTo(v.value);
    for (const item of parsed) s.push(item);
    return;
  }
  if (isProgram(v)) {
    // Push each token followed by an Integer count.  Matches the List
    // decomposition shape so generic metaprogramming loops can treat
    // the two symmetrically.  The tokens are already value-typed (from
    // the parser) so no re-wrapping is needed.
    for (const tok of v.tokens) s.push(tok);
    s.push(Integer(BigInt(v.tokens.length)));
    return;
  }
  if (isSymbolic(v)) {
    // Peel one layer off the algebraic.  For a leaf Num or Var we
    // push the corresponding RPL scalar (Real / quoted Name) and a
    // count of 1.  For a Bin / Fn / Neg node, we push each argument
    // as its own pushable value (leaves unwrap to Real / Name; non-leaf
    // subtrees stay Symbolic) followed by a quoted-Name for the head
    // (operator or function id) and a total count = args + 1.
    //
    // Rationale: the layout mirrors `OBJ→` on Program — args then a
    // leading count — and dovetails with `→PRG` so a user can
    // macro-rewrite an algebraic via the same "gather / edit / rebuild"
    // idiom we already support for programs.
    for (const item of _symbolicDecompose(v)) s.push(item);
    return;
  }
  if (isReal(v) || isInteger(v) || isBinaryInteger(v) || isRational(v)) {
    // HP50 AUR §3-149 lists no numeric-scalar entry in the OBJ→ table —
    // a Real, Integer, BinaryInteger, or Rational has no internal
    // structure to decompose into separate stack items.  AUR-fidelity
    // choice is to push the value back unchanged (1-in / 1-out).
    // Users who want format-specific splits should reach for MANT /
    // XPON (Real, AUR p.3-6 / p.3-9) or B→R (BinaryInteger → Real,
    // AUR p.3-46).  All those ops are wired separately and unaffected
    // by this branch.
    s.push(v);
    return;
  }
  if (isUnit(v)) {
    // AUR §3-149: `x_unit  →  x  1_unit`.
    // Push the bare numeric value (Real on level 2) and the
    // unit prototype `1_unit` (Unit with value=1, same uexpr) on
    // level 1.  Round-trip via `*` reconstructs the original Unit
    // because `_unitBinary` on Real*Unit folds the scalar into
    // `b.value` (1 * x = x), preserving the uexpr.  Use the bare
    // Unit() constructor here, NOT _makeUnit, to avoid an
    // empty-uexpr collapse — see the header comment block above.
    s.push(Real(v.value));
    s.push(Unit(1, v.uexpr));
    return;
  }
  throw new RPLError('Bad argument type');
});
register('OBJ->', (s) => OPS.get('OBJ→').fn(s));

/* ----------------------------------------------------------------
   →PRG — compose a Program from N level-1 tokens.

   Stack signature:  t1 … tn  n  →  « t1 … tn »

   Inverse of OBJ→ on a Program.  N is an Integer, Real, or
   BinaryInteger-shaped non-negative count; zero is legal (produces
   an empty program `« »`).  Any stack value may be a token: the
   parser emits a flat list of Name / Integer / Real / Complex /
   Str / RList / Vector / Matrix / Program / Tagged / Symbolic /
   Unit / BinaryInteger values and any of those can appear in a
   program body, so we don't validate the token kind here.

   Aliases:
     →PRG   (canonical, Unicode arrow)
     ->PRG  (ASCII fallback for keyboards that can't produce →)

   HP50 AUR §21.  Pairs with `→STR` / `STR→` for code-as-data work,
   and with OBJ→ for metaprogramming loops of the shape
   `« obj OBJ→ ... transform ... →PRG »`.
   ---------------------------------------------------------------- */
function _toCountIdx(v) {
  if (isInteger(v))              return Number(v.value);
  if (isBinaryInteger(v))        return Number(v.value);
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}
register('→PRG', (s) => {
  const cv = s.pop();
  const n = _toCountIdx(cv);
  if (n < 0) throw new RPLError('Bad argument value');
  if (n === 0) { s.push(Program([])); return; }
  const items = s.popN(n);
  s.push(Program(items));
});
register('->PRG', (s) => OPS.get('→PRG').fn(s));

function _parseStringForObjTo(src) {
  // parseEntry may return a single value, an array, or something
  // falsy for an empty string.  Normalize to a plain array of pushable
  // values.  Throws propagate as RPL parse errors, matching HP50
  // "OBJ→ Syntax Error" behavior on bad inputs.
  const r = _parseEntryForObjTo(src);
  if (r == null) return [];
  return Array.isArray(r) ? r : [r];
}

/* ================================================================
   INCR / DECR
   →ARRY / ARRY→ (array compose / decompose)
   SORT / REVLIST (list combinators)
   SF / CF / FS? / FC? / FS?C / FC?C (user flags)
   CHR / NUM (string codepoint ops)

   Advanced Guide refs: §3 (INCR / DECR), §13 (→ARRY / ARRY→),
   §5 (SORT / REVLIST), §2 (flag ops), §14 (CHR / NUM).

   All 14 ops are user-reachable from the typed catalog.
   ================================================================ */

/* ----------------------------------------------------------------
   INCR / DECR — increment / decrement a stored variable by 1 and
   leave the NEW value on the stack.

   HP50 behavior (Advanced Guide §3):
     'X' INCR  →  X := X + 1 ;  pushes new X
     'X' DECR  →  X := X - 1 ;  pushes new X

   Accepts either a Name or a String as the level-1 argument (mirrors
   STO+ / STO-).  The stored value is the LEFT operand of the bin-op
   (so DECR on X=10 gives 9, not -9).  Missing variable → "Undefined
   name".  Stored value must be arithmetic-compatible with Real(1) —
   numeric types and Symbolic all pass through the same `+` / `-`
   dispatch that STO+ / STO- use, so this works for `Symbolic('X')`
   too.
   ---------------------------------------------------------------- */
function _incrDecrOp(opSymbol) {
  // Deferred lookup — see _stoArith for rationale.
  return (s) => {
    const binop = lookup(opSymbol);
    if (!binop) throw new RPLError('Bad argument value');
    const [nameVal] = s.popN(1);
    if (!isName(nameVal) && !isString(nameVal)) {
      throw new RPLError('Bad argument type');
    }
    // INCR / DECR writes through to `id`, so validate up-front.
    const id = _coerceStorableName(nameVal);
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    s.push(stored);
    s.push(Real(1));
    binop.fn(s);
    const [result] = s.popN(1);
    varStore(id, result);
    s.push(result);
  };
}

register('INCR', _incrDecrOp('+'));
register('DECR', _incrDecrOp('-'));

/* ----------------------------------------------------------------
   →ARRY / ARRY→ — compose and decompose Vector / Matrix on the stack.

   →ARRY (Advanced Guide §13):
     x1 … xn  n        → [ x1 … xn ]            (Integer / Real count → Vector)
     x1 … xn  { n }    → [ x1 … xn ]            (size-list → Vector)
     x1 … xmn {m n}    → [[ x1 … xn ] … ]       (2-elem size-list → Matrix,
                                                 elements row-major)

   The HP50 accepts a bare count on level 1 for vectors; the more
   common form (matching OBJ→'s output) is a 1- or 2-element list.
   Both are accepted here.

   ARRY→ is the inverse.  Identical in behavior to OBJ→ on a Vector /
   Matrix, but registered under its canonical name for programs that
   call it explicitly.  Both Unicode (→ARRY / ARRY→) and ASCII
   (->ARRY / ARRY->) aliases register.
   ---------------------------------------------------------------- */

// Convert a level-1 "dimension spec" to either a 1-elem [n] or
// 2-elem [m,n] integer array.  A bare Real / Integer / BinaryInteger
// → [n].  A List → each item is a positive integer index.
//
// BinaryInteger is accepted as a bare count to match →PRG / →LIST.
// Inside a size-list the branch is `_toIntIdx` which also accepts
// BinInt.
function _toDimSpec(v) {
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    return [_toIntIdx(v)];
  }
  if (isList(v)) {
    if (v.items.length < 1 || v.items.length > 2) {
      throw new RPLError('Bad argument value');
    }
    return v.items.map(_toIntIdx);
  }
  throw new RPLError('Bad argument type');
}

const _toArrayOp = (s) => {
  const dimVal = s.pop();
  const dims = _toDimSpec(dimVal);
  if (dims.length === 1) {
    const n = dims[0];
    if (n === 0) { s.push(Vector([])); return; }
    const items = s.popN(n);
    s.push(Vector(items));
    return;
  }
  // 2-D Matrix — m rows, n cols, elements row-major.
  const [m, n] = dims;
  const total = m * n;
  const items = s.popN(total);
  const rows = [];
  for (let r = 0; r < m; r++) {
    rows.push(items.slice(r * n, r * n + n));
  }
  s.push(Matrix(rows));
};
register('→ARRY',  _toArrayOp);
register('->ARRY', _toArrayOp);

const _fromArrayOp = (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  throw new RPLError('Bad argument type');
};
register('ARRY→',  _fromArrayOp);
register('ARRY->', _fromArrayOp);

/* ----------------------------------------------------------------
   SORT / REVLIST — list combinators.

   SORT ( { x1 … xn } → { y1 … yn } ):  ascending sort.  Item types
   must be mutually comparable:
     - Reals, Integers, and BinInts compare numerically.
     - Strings compare lexicographically.
     - Mixing numeric and string in the same list throws
       "Bad argument type" (HP50 also refuses heterogeneous sorts).
   The returned list is a NEW List; the input is not mutated (RPL
   values are immutable-by-convention so our implementation naturally
   preserves that).

   REVLIST ( { x1 … xn } → { xn … x1 } ):  reverse, no comparator
   needed, element types unchanged.
   ---------------------------------------------------------------- */

// Compare two RPL values for SORT.  Returns negative / 0 / positive.
// Throws "Bad argument type" on unsupported or mismatched types.
//
// Real values carry a decimal.js `Decimal` payload, NOT a JS number.
// Decimal#valueOf() returns a string, so JS `<` / `>` between two
// Decimals does *string* comparison, which mis-orders negatives
// (e.g. "-3.5" > "-1.5" lexicographically).  The fix: route every
// numeric comparison through `Number()` of the operand's payload —
// BigInt for Integer / BinaryInteger, `.toNumber()` for Decimal —
// so the comparator always works on JS numbers.  Precision loss
// from Number coercion is acceptable for SORT (HP50's own SORT runs
// at hardware float precision, which is less than IEEE 754 double).
function _toCompareNumber(v) {
  if (isReal(v))           return v.value.toNumber();
  if (isInteger(v))        return Number(v.value);
  if (isBinaryInteger(v))  return Number(v.value);
  return null;             // unreachable for callers that gate on isAnyNum
}

function _rplCompare(a, b) {
  const isAnyNum = v => isReal(v) || isInteger(v) || isBinaryInteger(v);
  if (isAnyNum(a) && isAnyNum(b)) {
    const an = _toCompareNumber(a);
    const bn = _toCompareNumber(b);
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  if (isString(a) && isString(b)) {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  }
  throw new RPLError('Bad argument type');
}

register('SORT', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const sorted = [...l.items].sort(_rplCompare);
  s.push(RList(sorted));
});

register('REVLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const reversed = [...l.items].reverse();
  s.push(RList(reversed));
});

/* ----------------------------------------------------------------
   User / system flag ops — SF / CF / FS? / FC? / FS?C / FC?C.

   Reference: HP50 Advanced Guide §2 (Flag commands).  Flag numbers
   are integers in [-128, -1] ∪ [1, 128]; positive = user flags,
   negative = system flags.  Zero is rejected.

   Semantics:
     SF   ( n      → )           set flag n
     CF   ( n      → )           clear flag n
     FS?  ( n  → 0/1 )           push 1 if set, 0 if clear
     FC?  ( n  → 0/1 )           push 1 if clear, 0 if set  (= NOT FS?)
     FS?C ( n  → 0/1 )           FS?, then clear as a side effect
     FC?C ( n  → 0/1 )           FC?, then clear as a side effect

   The side-effecting variants "test-and-clear" are the HP50's way of
   handling "was an event flagged?" cheaply in one op.  Both return
   the pre-clear test value.

   No specific system flag yet has cross-cutting effects tied to it
   in this codebase — SF/CF are pure bookkeeping that future features
   can consult.
   ---------------------------------------------------------------- */

function _popFlagNumber(s) {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v))    n = v.value.toNumber();
  else                   throw new RPLError('Bad argument type');
  if (!Number.isInteger(n) || n === 0 || n < -128 || n > 128) {
    throw new RPLError('Bad argument value');
  }
  return n;
}

register('SF', (s) => {
  const n = _popFlagNumber(s);
  setUserFlag(n);
});

register('CF', (s) => {
  const n = _popFlagNumber(s);
  clearUserFlag(n);
});

register('FS?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? TRUE : FALSE);
});

register('FC?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? FALSE : TRUE);
});

register('FS?C', (s) => {
  const n = _popFlagNumber(s);
  const was = testUserFlag(n);
  if (was) clearUserFlag(n);
  s.push(was ? TRUE : FALSE);
});

register('FC?C', (s) => {
  const n = _popFlagNumber(s);
  const was = testUserFlag(n);
  if (was) clearUserFlag(n);
  // FC?C returns the test of "was the flag CLEAR" — i.e. the inverse
  // of was — and then (side effect) clears the flag regardless.
  s.push(was ? FALSE : TRUE);
});

/* ----------------------------------------------------------------
   CHR / NUM — single-codepoint String ⇄ Integer.

   HP50 Advanced Guide §14:
     CHR ( n  → "c" )    n is an ASCII / Unicode codepoint; push the
                         1-character string containing that codepoint.
     NUM ( "s" → n  )    return the codepoint of the FIRST character
                         of s as an Integer.  Empty string throws
                         "Bad argument value".

   We use JS's `String.fromCodePoint` / `String.prototype.codePointAt`
   so the full Unicode range works; the real HP50 was ASCII-only but
   our web version has no reason to limit itself.  NUM on a multi-
   char string silently returns the first code point — matches HP50
   behavior of "first character only".
   ---------------------------------------------------------------- */

register('CHR', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    n = v.value.toNumber();
  } else                  throw new RPLError('Bad argument type');
  if (n < 0 || n > 0x10FFFF) throw new RPLError('Bad argument value');
  s.push(Str(String.fromCodePoint(n)));
});

register('NUM', (s) => {
  const v = s.pop();
  if (!isString(v)) throw new RPLError('Bad argument type');
  if (v.value.length === 0) throw new RPLError('Bad argument value');
  const code = v.value.codePointAt(0);
  s.push(Integer(BigInt(code)));
});

/* ================================================================
   STOF / RCLF (flag save/restore)
   →STR / STR→ (object ⇄ string)
   ΣLIST / ΠLIST / ΔLIST (list aggregations)
   V→ / →V2 / →V3 (vector compose/decompose)
   REPL / SREPL (string and list replacement)

   Advanced Guide refs: §2 (STOF/RCLF), §4 (→STR/STR→), §5 (ΣLIST,
   ΠLIST, ΔLIST), §13 (V→/→V2/→V3, REPL), §14 (SREPL).
   ================================================================ */

/* ----------------------------------------------------------------
   STOF / RCLF — save and restore the current flag-set.

   HP50 Advanced Guide §2 documents STOF / RCLF in terms of a pair of
   64-bit binary integers (user + system), one bit per flag.  We use a
   Set<number> representation for the same bookkeeping surface.  The
   practical surface:

     RCLF (   → { n1 n2 … } )
       Pushes a List of the currently-set flag numbers, sorted
       ascending so user flags (1..128) come after system flags
       (-128..-1).  An empty flag set pushes `{ }`.

     STOF ( { n1 n2 … } →   )
       Clears every flag, then sets exactly the numbers in the list.
       Each element must be an Integer / Real that passes _validFlag
       (non-zero, |n| ≤ 128).  A non-list argument, or any element
       that isn't a valid flag number, throws — the flag set is NOT
       partially-mutated on a bad element (we validate up front).

   This is the "simpler" half of HP50's pair: programs can snapshot
   and restore a flag set without juggling 64-bit words.  The
   binary-integer variant can be layered on later.
   ---------------------------------------------------------------- */

register('RCLF', (s) => {
  const flags = [..._calcState.userFlags].sort((a, b) => a - b);
  s.push(RList(flags.map(n => Integer(BigInt(n)))));
});

register('STOF', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  // Validate every element before mutating — an error mid-list would
  // leave the flag set in an inconsistent state otherwise.
  const nums = [];
  for (const item of l.items) {
    let n;
    if (isInteger(item))   n = Number(item.value);
    else if (isReal(item)) n = item.value.toNumber();
    else throw new RPLError('Bad argument type');
    if (!Number.isInteger(n) || n === 0 || n < -128 || n > 128) {
      throw new RPLError('Bad argument value');
    }
    nums.push(n);
  }
  clearAllUserFlags();
  for (const n of nums) setUserFlag(n);
});

/* ----------------------------------------------------------------
   →STR / STR→ — object to/from string form.

   HP50 Advanced Guide §4:
     →STR  ( any  →  "text" )  serialise level-1 value to its display form
     STR→  ( "src"  → any… )   parse the source and push each produced value

   →STR uses the shared `format(v)` utility so the resulting string is
   exactly what the formatter would render in STD mode on a non-stack
   context (bare Name stays bare, Symbolic is ticked, etc.).  A Real
   like `3.14` → `"3.14"`, a Name `X` → `"X"`, a Symbolic `'X+1'` →
   `"'X+1'"`.  This matches the HP50 convention of "what you'd see if
   you disassembled the object back to characters".

   STR→ is the inverse: we reuse parseEntry (same path OBJ→ on a
   String uses) and push each parsed value.  Empty string pushes
   nothing (matches OBJ→ convention — and HP50 semantics).  Parse
   errors bubble up as RPLError so IFERR traps work.

   ASCII aliases `->STR` / `STR->` register alongside the Unicode glyphs.
   ---------------------------------------------------------------- */

const _toStrOp = (s) => {
  const [v] = s.popN(1);
  // Use STD display mode explicitly so the serialized form is stable
  // (independent of any future FIX/SCI/ENG state).  context is left
  // as non-'stack' so Names come out bare unless they were quoted,
  // matching what an OBJ→-then-STR→ round-trip would expect.
  s.push(Str(formatValue(v, DEFAULT_DISPLAY)));
};
register('→STR',  _toStrOp);
register('->STR', _toStrOp);

/* ----------------------------------------------------------------
   DECOMP — program → string source form.

   HP50 AUR p.1-12 defines DECOMP as the inverse of a Program's
   tokenization: it yields the program's source-code string.  In
   effect this is `→STR` specialised to the Program case with a
   guaranteed string whose `STR→` round-trip reproduces the Program.

   We enforce the "Program only" shape because DECOMP on non-Program
   values is ill-defined on real hardware (the equivalent user op for
   arbitrary objects is `→STR`).  Rejecting non-Program with
   `Bad argument type` matches the AUR error prefix.
   ---------------------------------------------------------------- */
register('DECOMP', (s) => {
  const [v] = s.popN(1);
  if (!isProgram(v)) throw new RPLError('Bad argument type');
  s.push(Str(formatValue(v, DEFAULT_DISPLAY)));
});

const _fromStrOp = (s) => {
  const [v] = s.popN(1);
  if (!isString(v)) throw new RPLError('Bad argument type');
  const parsed = _parseStringForObjTo(v.value);
  for (const item of parsed) s.push(item);
};
register('STR→',  _fromStrOp);
register('STR->', _fromStrOp);

/* ----------------------------------------------------------------
   ΣLIST / ΠLIST / ΔLIST — list aggregations.

   HP50 Advanced Guide §5:
     ΣLIST  ( { x1 … xn }  →  Σxi )
     ΠLIST  ( { x1 … xn }  →  Πxi )
     ΔLIST  ( { x1 … xn }  →  { x2-x1, x3-x2, …, xn-xn-1 } )

   All three delegate to the existing arithmetic dispatch via
   `lookup('+').fn` / `lookup('*').fn` / `lookup('-').fn`, so the full
   numeric-plus-symbolic matrix just works — a list of Symbolics sums
   to a Symbolic, a list of Reals sums to a Real, and mixing Integer
   and Real promotes to Real.

   Empty-list conventions (HP50):
     ΣLIST{}  → 0  (identity element for +)
     ΠLIST{}  → 1  (identity element for *)
     ΔLIST{}  → {} (empty difference series)
   Single-element:
     ΣLIST{x} → x
     ΠLIST{x} → x
     ΔLIST{x} → {} (no differences to take)

   ASCII aliases SLIST / PLIST / DLIST register for ASCII-only input.
   ---------------------------------------------------------------- */

// Fold a list's items through a binary op registered in OPS.  Empty
// list yields the supplied identity value.  The fold leaves the
// accumulated value on the stack (via the underlying op's dispatch).
//
// Lookup is deferred to call time — the arithmetic `+ *` registrations
// live past this factory site, so resolving at module load would find
// undefined.
function _foldListOp(opSymbol, identity) {
  return (s) => {
    const binop = lookup(opSymbol);
    const [l] = s.popN(1);
    if (!isList(l)) throw new RPLError('Bad argument type');
    if (l.items.length === 0) { s.push(identity); return; }
    if (l.items.length === 1) { s.push(l.items[0]); return; }
    s.push(l.items[0]);
    for (let i = 1; i < l.items.length; i++) {
      s.push(l.items[i]);
      binop.fn(s);
    }
  };
}

register('ΣLIST', _foldListOp('+', Real(0)));
register('ΠLIST', _foldListOp('*', Real(1)));
register('SLIST', _foldListOp('+', Real(0)));
register('PLIST', _foldListOp('*', Real(1)));

register('ΔLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  if (l.items.length <= 1) { s.push(RList([])); return; }
  const binop = lookup('-');
  const diffs = [];
  for (let i = 1; i < l.items.length; i++) {
    // Compute xi - x(i-1) via the shared - op so Symbolic/Integer/Real
    // mixes work the same way as ΣLIST / ΠLIST.
    s.push(l.items[i]);
    s.push(l.items[i - 1]);
    binop.fn(s);
    const [d] = s.popN(1);
    diffs.push(d);
  }
  s.push(RList(diffs));
});
register('DLIST', (s) => OPS.get('ΔLIST').fn(s));

/* ----------------------------------------------------------------
   V→ / →V2 / →V3 — simple vector compose/decompose companions
   to the →ARRY / ARRY→ family.

   →V2 ( x y → [x y] )        — build 2-vector from two stack scalars
   →V3 ( x y z → [x y z] )    — build 3-vector from three stack scalars
   V→  ( [x1 … xn] → x1 … xn) — decompose vector WITHOUT pushing a
                                size-list (the difference from ARRY→)

   →V2 / →V3 do NOT accept a size-spec and are NOT variadic; they are
   the specialized "two" and "three" forms HP50 exposes on the keypad.
   V→ is the plain decompose — handy when the caller will push a new
   size-list themselves or knows the arity ahead of time.

   ASCII aliases `->V2` / `->V3` / `V->` also register.
   ---------------------------------------------------------------- */

const _toV2Op = (s) => {
  const [x, y] = s.popN(2);
  s.push(Vector([x, y]));
};
register('→V2',  _toV2Op);
register('->V2', _toV2Op);

const _toV3Op = (s) => {
  const [x, y, z] = s.popN(3);
  s.push(Vector([x, y, z]));
};
register('→V3',  _toV3Op);
register('->V3', _toV3Op);

const _fromVecOp = (s) => {
  const [v] = s.popN(1);
  if (!isVector(v)) throw new RPLError('Bad argument type');
  for (const item of v.items) s.push(item);
};
register('V→',  _fromVecOp);
register('V->', _fromVecOp);

/* ----------------------------------------------------------------
   REPL / SREPL — string and list replacement.

   REPL — Advanced Guide §13.  Splices a second object into the first
   starting at position n (1-indexed), replacing the overlapping range.

     REPL ( L1 n L2 → L )     replace items n..n+|L2|-1 of L1 with L2
     REPL ( S1 n S2 → S )     replace chars n..n+|S2|-1 of S1 with S2
     REPL ( V1 n V2 → V )     vector form
     REPL ( M1 {r c} M2 → M ) matrix form — M2 is a sub-matrix whose
                              top-left corner lands at (r, c) of M1

   HP50 throws "Bad argument value" when the splice would extend past
   the end of the host; we mirror that.

   SREPL — Advanced Guide §14.  String search/replace, replacing ALL
   occurrences of the second string with the third inside the first.

     SREPL ( "hay" "needle" "repl" → "result" n )
       returns the post-replacement string AND the count of substitutions
       (HP50 convention — the count is an Integer).  Zero matches leaves
       the haystack unchanged and pushes 0.
   ---------------------------------------------------------------- */

register('REPL', (s) => {
  const [host, pos, patch] = s.popN(3);

  // Matrix: index is a {row col} list; patch must be a Matrix too.
  if (isMatrix(host)) {
    if (!isList(pos) || pos.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    if (!isMatrix(patch)) throw new RPLError('Bad argument type');
    const r0 = _toIntIdx(pos.items[0]);
    const c0 = _toIntIdx(pos.items[1]);
    const hostRows = host.rows.length;
    const hostCols = hostRows > 0 ? host.rows[0].length : 0;
    const pRows = patch.rows.length;
    const pCols = pRows > 0 ? patch.rows[0].length : 0;
    if (r0 + pRows - 1 > hostRows || c0 + pCols - 1 > hostCols) {
      throw new RPLError('Bad argument value');
    }
    const newRows = host.rows.map(r => [...r]);
    for (let i = 0; i < pRows; i++) {
      for (let j = 0; j < pCols; j++) {
        newRows[r0 - 1 + i][c0 - 1 + j] = patch.rows[i][j];
      }
    }
    s.push(Matrix(newRows));
    return;
  }

  // Sequence types (String / List / Vector): pos is a single integer.
  const n = _toIntIdx(pos);

  if (isString(host)) {
    if (!isString(patch)) throw new RPLError('Bad argument type');
    const hostText = host.value;
    const patchText = patch.value;
    if (n + patchText.length - 1 > hostText.length) {
      throw new RPLError('Bad argument value');
    }
    const out = hostText.slice(0, n - 1) + patchText
              + hostText.slice(n - 1 + patchText.length);
    s.push(Str(out));
    return;
  }

  if (isList(host)) {
    if (!isList(patch)) throw new RPLError('Bad argument type');
    const items = host.items;
    const rep   = patch.items;
    if (n + rep.length - 1 > items.length) {
      throw new RPLError('Bad argument value');
    }
    const out = [...items];
    for (let i = 0; i < rep.length; i++) out[n - 1 + i] = rep[i];
    s.push(RList(out));
    return;
  }

  if (isVector(host)) {
    if (!isVector(patch)) throw new RPLError('Bad argument type');
    const items = host.items;
    const rep   = patch.items;
    if (n + rep.length - 1 > items.length) {
      throw new RPLError('Bad argument value');
    }
    const out = [...items];
    for (let i = 0; i < rep.length; i++) out[n - 1 + i] = rep[i];
    s.push(Vector(out));
    return;
  }

  throw new RPLError('Bad argument type');
});

register('SREPL', (s) => {
  const [hay, needle, repl] = s.popN(3);
  if (!isString(hay) || !isString(needle) || !isString(repl)) {
    throw new RPLError('Bad argument type');
  }
  if (needle.value.length === 0) {
    throw new RPLError('Bad argument value');
  }
  // Count occurrences manually so the push result matches the string
  // produced by String.prototype.replaceAll (no overlap surprises).
  let count = 0;
  let out = '';
  let i = 0;
  const src = hay.value;
  while (i < src.length) {
    if (src.startsWith(needle.value, i)) {
      out += repl.value;
      i += needle.value.length;
      count++;
    } else {
      out += src[i];
      i++;
    }
  }
  s.push(Str(out));
  s.push(Integer(BigInt(count)));
});

/* =================================================================
   More stack ops (DUPN/NIP/PICK3/ROLL/ROLLD/UNPICK/DUPDUP/NDUPN)
   Complex decomposition (C→R / R→C)
   Real decomposition  (XPON / MANT)
   Numerically-stable log/exp (LNP1 / EXPM)
   Rounding (RND / TRNC)
   Percent family (%, %T, %CH)

   Advanced Guide refs: §3 (stack), §6 (complex), §3.1 (XPON/MANT/
   RND/TRNC/%), §3.1/13.6 (LNP1/EXPM).
   ================================================================= */

// Helpers: pull an Integer count from a stack value.  Rejects non-real,
// non-integer-valued Real, and negative values via out-of-range errors
// that match existing ops in this file (PICK / DROPN).
function _toNonNegIntCount(v) {
  const n = Number(isInteger(v) ? v.value : toRealOrThrow(v));
  if (!Number.isInteger(n) || n < 0) throw new RPLError('Bad argument value');
  return n;
}
function _toPosIntIndex(v) {
  const n = Number(isInteger(v) ? v.value : toRealOrThrow(v));
  if (!Number.isInteger(n) || n < 1) throw new RPLError('Bad argument value');
  return n;
}

/* --------------- additional stack manipulation ---------------
   DUPN  ( x1 … xn n → x1 … xn x1 … xn )
     Pops the top (must be a non-negative integer), then duplicates
     the top `n` items.  `0 DUPN` is a no-op.
   DUPDUP ( a → a a a )
     Equivalent to DUP DUP.
   NIP   ( a b → b )
     Drops level 2.
   PICK3 ( — → … )
     Shortcut for `3 PICK` (no stack argument).
   ROLL  ( xn … x1 n → xn-1 … x1 xn )
     Pops n, takes level-(n+1), moves it to level 1.  `0 ROLL` is a
     no-op; `1 ROLL` is a no-op (level 1 moves to level 1).
   ROLLD ( xn … x1 n → x1 xn … x2 )  (HP50 docs: "Roll Down")
     Pops n, takes level 1, inserts at level (n+1).  Inverse of ROLL.
   UNPICK ( x_n … x_1 v n → x_n … v … x_1 )
     Pops n (level 1) then v (level 2), writes v back at level n.
     Inverse of PICK.
   NDUPN  ( x n → x x … x n )   (HP49 synonym of DUPN-with-count-on-top)
     Duplicates x  n times and pushes n back.  `x 0 NDUPN` leaves
     `0` on the stack.  Per HP50 AUR p. 2-11 the `n` return is needed
     by variadic programs that dispatched on count.
   ---------------------------------------------------------- */
register('DUPN', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (s.depth < n) throw new RPLError('Too few arguments');
  if (n === 0) return;
  // Copy the top-N references; stack values are immutable so sharing is safe.
  const copies = [];
  for (let i = n; i >= 1; i--) copies.push(s.peek(i));
  for (const v of copies) s.push(v);
});

register('DUPDUP', (s) => {
  const v = s.peek(1);
  if (v === undefined) throw new RPLError('Too few arguments');
  s.push(v);
  s.push(v);
});

register('NIP', (s) => {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const top = s.pop();
  s.pop();       // drop former level 2
  s.push(top);
});

register('PICK3', (s) => {
  s.pick(3);
});

register('ROLL', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;                 // 0 and 1 ROLL are no-ops
  if (s.depth < n) throw new RPLError('Too few arguments');
  // Take the level-n item out and push it on top.
  const arr = s._items;               // intentional use of internal for splice
  const idx = arr.length - n;
  const [x] = arr.splice(idx, 1);
  arr.push(x);
  s._emit();
});

register('ROLLD', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;                 // 0 and 1 ROLLD are no-ops
  if (s.depth < n) throw new RPLError('Too few arguments');
  // Take level 1 and splice it into the level-n slot.
  const arr = s._items;
  const top = arr.pop();
  arr.splice(arr.length - (n - 1), 0, top);
  s._emit();
});

register('UNPICK', (s) => {
  const n = _toPosIntIndex(s.pop());
  if (s.depth < n) throw new RPLError('Too few arguments');
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const v = s.pop();
  // Write v at level n (1-indexed from top of remaining stack).
  const arr = s._items;
  if (arr.length < n) throw new RPLError('Too few arguments');
  arr[arr.length - n] = v;
  s._emit();
});

register('NDUPN', (s) => {
  const nv = s.pop();
  const n = _toNonNegIntCount(nv);
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const x = s.pop();
  for (let i = 0; i < n; i++) s.push(x);
  s.push(Integer(BigInt(n)));
});

/* --------------- Complex decomposition / construction ---------------
   R→C ( x y → (x, y) )
     Build a Complex from two Reals.  Integer input coerces to Real.
     HP50 AUR: "REAL, REAL → COMPLEX".
   C→R ( (x, y) → x y )
     Decompose a Complex into its two Real components (Re on L2, Im on L1).
   Vector branch (HP50 docs §13.6 note): R→C on two real N-vectors
     returns a single N-vector of Complex components; C→R on a complex
     vector returns the two component real vectors.  Implemented so the
     common "assemble a complex vector" workflow works end-to-end.
   ASCII aliases: R->C, C->R  (HP50 user programs without Unicode in
     source).  Real→Real on a real-valued Complex round-trip:
     `(3,4) C→R R→C` gives `(3,4)` back.
   -------------------------------------------------------------- */
function _coerceRealComponent(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}

function _rToCOp(s) {
  const im = s.pop();
  const re = s.pop();
  // Vector branch: two real vectors → complex vector of same length.
  if (isVector(re) && isVector(im)) {
    const a = re.items, b = im.items;
    if (a.length !== b.length) throw new RPLError('Invalid dimension');
    const out = [];
    for (let i = 0; i < a.length; i++) {
      out.push(Complex(_coerceRealComponent(a[i]), _coerceRealComponent(b[i])));
    }
    s.push(Vector(out));
    return;
  }
  s.push(Complex(_coerceRealComponent(re), _coerceRealComponent(im)));
}
register('R→C',  _rToCOp);
register('R->C', _rToCOp);

function _cToROp(s) {
  const v = s.pop();
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isReal(v) || isInteger(v)) {
    // HP50 permits real input — pushes the value and 0.
    s.push(Real(_coerceRealComponent(v)));
    s.push(Real(0));
    return;
  }
  if (isVector(v)) {
    // Vector of Complex → two vectors of the component reals.
    const re = [], im = [];
    for (const e of v.items) {
      if (isComplex(e))       { re.push(Real(e.re));                    im.push(Real(e.im)); }
      else if (isReal(e))     { re.push(e);                             im.push(Real(0));     }
      else if (isInteger(e))  { re.push(Real(Number(e.value)));         im.push(Real(0));     }
      else throw new RPLError('Bad argument type');
    }
    s.push(Vector(re));
    s.push(Vector(im));
    return;
  }
  throw new RPLError('Bad argument type');
}
register('C→R',  _cToROp);
register('C->R', _cToROp);

/* --------------- XPON / MANT — Real decomposition ---------------
   HP50 AUR p.3-6 / p.3-9.  Given a real `x`, the mantissa `m` and
   exponent `e` are such that `m * 10^e = x` with `|m| < 10` and
   `|m| >= 1` for x != 0.  XPON returns e (as a Real), MANT returns m
   (as a Real).  XPON(0) = 0 by HP50 convention; MANT(0) = 0.
   Integer inputs coerce to Real first.
   ---------------------------------------------------------------- */
function _xponOf(x) {
  if (x === 0) return 0;
  return Math.floor(Math.log10(Math.abs(x)));
}
register('XPON', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('XPON', [_toAst(v)]))); return; }
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  const x = Number(isInteger(v) ? v.value : v.value);
  s.push(Real(_xponOf(x)));
}))));
register('MANT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('MANT', [_toAst(v)]))); return; }
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  const x = Number(isInteger(v) ? v.value : v.value);
  if (x === 0) { s.push(Real(0)); return; }
  const e = _xponOf(x);
  s.push(Real(x / Math.pow(10, e)));
}))));

/* --------------- LNP1 / EXPM — stable near zero ---------------
   LNP1(x) = ln(1 + x), evaluated without catastrophic cancellation
   when |x| << 1.  EXPM(x) = exp(x) - 1, same story.  Both delegate to
   JS's Math.log1p / Math.expm1, which implement the standard IEEE
   fused operations.  Symbolic inputs lift to LNP1(X) / EXPM(X) AST
   nodes so they round-trip through the parser.
   ---------------------------------------------------------------- */
// LNP1 / EXPM support Tagged + Vector / Matrix element-wise dispatch,
// matching the broader log / exp family.  Complex is *not* included —
// the stable-near-zero formulations are real-only on the HP50 (no
// Complex log1p / expm1 in the Advanced Reference).
register('LNP1', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('LNP1', [_toAst(v)]))); return; }
  const x = toRealOrThrow(v);
  if (x <= -1) throw new RPLError('Infinite result');
  s.push(Real(Math.log1p(x)));
}))));
register('EXPM', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('EXPM', [_toAst(v)]))); return; }
  const x = toRealOrThrow(v);
  s.push(Real(Math.expm1(x)));
}))));

/* --------------- RND / TRNC — rounding to n places ---------------
   HP50 AUR p.3-9.  Two stack args: value (Real/Complex), count.
   COUNT semantics:
     n >= 0       → round to n decimal places
     -1..-11      → round to (−n) significant figures  (rare; we accept
                    the range but clamp to the precision JS can offer)
   RND  ( x n → y )  nearest, half-away-from-zero (matches HP50 spec)
   TRNC ( x n → y )  toward zero
   Complex input rounds each component independently.  Integer input
   with n >= 0 rounds back to Integer-typed output; with significant
   figures it's returned as Real (consistent with HP50).
   ---------------------------------------------------------------- */
function _roundHalfAwayFromZero(x, n) {
  const p = Math.pow(10, n);
  return (x >= 0 ? Math.floor(x * p + 0.5) : -Math.floor(-x * p + 0.5)) / p;
}
function _truncTowardZero(x, n) {
  const p = Math.pow(10, n);
  return Math.trunc(x * p) / p;
}
function _applyRoundReal(x, n, fn) {
  // n >= 0 → decimal places.  n < 0 → significant figures (|n| digits).
  if (n >= 0) return fn(x, n);
  if (x === 0) return 0;
  const sig = -n;
  const xpon = _xponOf(x);
  // Round so the most significant digit is the `sig`-th digit.
  const places = (sig - 1) - xpon;
  return fn(x, places);
}
function _roundingOp(name, fn) {
  return (s) => {
    const nv = s.pop();
    const xv = s.pop();
    const n = Number(isInteger(nv) ? nv.value : toRealOrThrow(nv));
    if (!Number.isInteger(n) || n < -11 || n > 11) {
      throw new RPLError('Bad argument value');
    }
    if (isComplex(xv)) {
      s.push(Complex(_applyRoundReal(xv.re, n, fn),
                     _applyRoundReal(xv.im, n, fn)));
      return;
    }
    if (isInteger(xv) && n >= 0) {
      // Integer rounded to a non-negative decimal place is itself.
      s.push(xv);
      return;
    }
    if (!isReal(xv) && !isInteger(xv)) throw new RPLError('Bad argument type');
    const x = isInteger(xv) ? Number(xv.value) : xv.value;
    s.push(Real(_applyRoundReal(x, n, fn)));
  };
}
register('RND',  _roundingOp('RND',  _roundHalfAwayFromZero));
register('TRNC', _roundingOp('TRNC', _truncTowardZero));

/* --------------- TRUNC — CAS-form truncate ---------------
   HP50 AUR §3.1 lists TRUNC as a CAS sibling of TRNC with identical
   numeric semantics but an additional Symbolic lift: a Name / Symbolic
   value leaves an unevaluated `TRUNC(x, n)` node on the stack instead
   of erroring.  Same (x, n → y) stack shape as TRNC; same half-digit
   behaviour; same rejection error strings.  Reuses `_roundingOp` so
   any future precision fix on the rounding helpers lands on both ops.

   Symbolic lift applies when either argument is a Name or Symbolic:
   `'X' 3 TRUNC` → `'TRUNC(X,3)'`.  If `n` is symbolic, we keep the
   expression unevaluated (the CAS caller may substitute later).  The
   numeric rejection rules from `_roundingOp` still fire for plain
   numeric inputs — e.g. non-integer `n`, `n` outside [-11, 11].  */

function _truncOp() {
  const numeric = _roundingOp('TRUNC', _truncTowardZero);
  return (s) => {
    if (s.depth < 2) throw new RPLError('Too few arguments');
    const nv = s.peek(1);
    const xv = s.peek(2);
    if (_isSymOperand(xv) || _isSymOperand(nv)) {
      s.popN(2);
      const l = _toAst(xv), r = _toAst(nv);
      if (!l || !r) throw new RPLError('Bad argument type');
      s.push(Symbolic(AstFn('TRUNC', [l, r])));
      return;
    }
    numeric(s);
  };
}
// Tagged transparency + List distribution.  n (level 1) may also be a
// List (pairwise broadcast) or a scalar applied to every x in a List.
// Vector/Matrix are deliberately rejected — no _withVMBinary exists and
// TRUNC element-wise on V/M has no HP50 precedent (mirrors MOD/MIN/MAX).
register('TRUNC', _withTaggedBinary(_withListBinary(_truncOp())));

/* --------------- Percent family — %, %T, %CH ---------------
   HP50 AUR p.3-1.
     %   ( x y → x*y/100 )                 percent of a number
     %T  ( x y → 100*y/x )                 y is what percent of x
     %CH ( x y → 100*(y-x)/x )             percent change from x to y
   All three are numeric (Real/Integer).  Symbolic/Name input on
   either operand lifts to a Symbolic expression using the canonical
   AST fold — matches how +, *, / behave for symbolic inputs.
   ---------------------------------------------------------------- */
function _percentAst(kind, l, r) {
  // kind: 'PCT', 'PCTT', 'PCTCH'
  if (kind === 'PCT')  return AstBin('/', AstBin('*', l, r), AstNum(100));
  if (kind === 'PCTT') return AstBin('/', AstBin('*', AstNum(100), r), l);
  /* PCTCH */         return AstBin('/', AstBin('*', AstNum(100),
                          AstBin('-', r, l)), l);
}
/* The percent family picks up Tagged transparency and List distribution.
   V/M broadcast is intentionally NOT added — HP50 AUR describes
   %/%T/%CH only for scalar operands; making them broadcast element-wise
   over a vector would be a unilateral invention.  Complex is rejected
   (`toRealOrThrow` on Complex throws). */
function _percentOp(kind, computeNumeric, errorsOnZeroX) {
  return _withTaggedBinary(_withListBinary((s) => {
    const y = s.pop();
    const x = s.pop();
    if (_isSymOperand(x) || _isSymOperand(y)) {
      s.push(Symbolic(_percentAst(kind, _toAst(x), _toAst(y))));
      return;
    }
    const xn = toRealOrThrow(x);
    const yn = toRealOrThrow(y);
    if (errorsOnZeroX && xn === 0) throw new RPLError('Infinite result');
    s.push(Real(computeNumeric(xn, yn)));
  }));
}
register('%',   _percentOp('PCT',   (x, y) => x * y / 100,          false));
register('%T',  _percentOp('PCTT',  (x, y) => 100 * y / x,          true));
register('%CH', _percentOp('PCTCH', (x, y) => 100 * (y - x) / x,    true));

/* =================================================================
   Real constants (MAXR / MINR),
   HMS family (→HMS / HMS→ / HMS+ / HMS-),
   BinInt shift / rotate (SL, SR, SLB, SRB, ASR,
                          RL, RR, RLB, RRB),
   List/Vector/Matrix combinator (MAP).

   Advanced Guide refs: §3.1 (MAXR/MINR), §3.3 (HMS family),
   §10.1 (shift/rotate), §15 (MAP).
   ================================================================= */

/* --------------- MAXR / MINR — real-limit constants ---------------
   HP50 AUR p. 3-1.  MAXR is the largest representable finite real and
   MINR is the smallest positive normal real.  These derive from the
   current `realMaxExp` setting (default 999, configurable via STMXE):
     MAXR = 9.99999999999e+<realMaxExp>
     MINR = 1e-<realMaxExp>
   decimal.js represents them exactly since its exponent range reaches
   9e15.  No arguments, no symbolic lift — literal pushes.
   ---------------------------------------------------------------- */
register('MAXR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`9.99999999999e+${e}`)));
});
register('MINR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`1e-${e}`)));
});

/* --------------- STMXE / RCMXE — configure max Real exponent --------
   rpl5050 extension (no HP50 equivalent).  `STMXE` pops an Integer or
   Real from level 1, validates it, and sets `realMaxExp` — the exponent
   magnitude that defines both MAXR/MINR and the Decimal overflow limit.
   `RCMXE` pushes the current setting as an Integer.

   Legal range: REAL_MAX_EXP_MIN (10) .. REAL_MAX_EXP_MAX (9e15).
   ---------------------------------------------------------------- */
register('STMXE', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v))    n = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isInteger(n) || n < REAL_MAX_EXP_MIN || n > REAL_MAX_EXP_MAX) {
    throw new RPLError('Bad argument value');
  }
  setRealMaxExp(n);
});

register('RCMXE', (s) => {
  s.push(Integer(BigInt(getRealMaxExp())));
});

/* --------------- HMS family — hours/minutes/seconds ---------------
   HP50 represents a time-of-day / duration value as a decimal number
   formatted HH.MMSSsss — hours in the integer part, minutes (00..59)
   in the first two digits after the decimal, seconds (00..59) in the
   next two, and fractional seconds continuing after that.  So:

       2.3000   → 2h 30m 00s      =  2.5     decimal hours
       1.4530   → 1h 45m 30s      =  1.7583…
       0.0059   → 0h 0m 59s       =  0.01638…

   Sign applies to the whole value; `-1.3000` is "−1h 30m".

     →HMS  ( h      → hms )    decimal hours → HH.MMSS form
     HMS→  ( hms    → h   )    HH.MMSS form → decimal hours
     HMS+  ( a  b   → hms )    add two HMS values (a + b, result HMS)
     HMS-  ( a  b   → hms )    subtract two HMS values (a - b, HMS)

   HP50 AUR p. 3-10.  We reject Complex inputs (Bad argument type) but
   accept Integer (coerces via `toRealOrThrow`).  Fractional seconds
   are preserved out to double precision on the HMS side and
   round-tripped via the decimal-hours form in +/-.

   ASCII aliases registered alongside the Unicode glyph (`->HMS`,
   `HMS->`) to match ops like `→STR`/`->STR` for keyboards without
   direct Unicode entry.
   ----------------------------------------------------------------- */

// Parse HH.MMSS decimal into decimal-hours.  `h` may be negative; we
// work on the absolute value and re-apply the sign at the end.
function _hmsToHours(h) {
  if (!Number.isFinite(h)) throw new RPLError('Bad argument value');
  const sign = h < 0 ? -1 : 1;
  const x = Math.abs(h);
  const hh = Math.floor(x);
  // The next two digits (minutes) are the integer part of (x - hh) * 100.
  // We intentionally scale with a small epsilon to avoid `1.45` being
  // read as "1h 44m 59.9999…s" due to float noise; this matches HP50's
  // 12-BCD behavior.
  const afterPoint = (x - hh) * 100;
  const mm = Math.floor(afterPoint + 1e-9);
  const ss = (afterPoint - mm) * 100;
  if (mm >= 60) throw new RPLError('Bad argument value');
  if (ss >= 60) throw new RPLError('Bad argument value');
  return sign * (hh + mm / 60 + ss / 3600);
}

// Format a decimal-hours value as HH.MMSSsss.  Keeps fractional seconds
// beyond 4 decimal places by preserving the ss as a true JS number.
function _hoursToHms(hours) {
  if (!Number.isFinite(hours)) throw new RPLError('Bad argument value');
  const sign = hours < 0 ? -1 : 1;
  const x = Math.abs(hours);
  const hh = Math.floor(x);
  const minsPart = (x - hh) * 60;
  const mm = Math.floor(minsPart + 1e-12);
  const ss = (minsPart - mm) * 60;
  // Assemble HH.MMSSsss.  Use string assembly for the integer minutes
  // part so leading zeros stay in the right position (`2.0530` not
  // `2.0053`).
  const mmStr = String(mm).padStart(2, '0');
  // Seconds: need two integer digits + fractional tail.  Compute
  // numerically then format: HH + (mm*100 + ss) / 10000.
  const combined = hh + (mm * 100 + ss) / 10000;
  return sign * combined;
}

function _hmsUnary(name, fn) {
  return (s) => {
    const v = s.pop();
    if (isComplex(v)) throw new RPLError('Bad argument type');
    const x = toRealOrThrow(v);
    s.push(Real(fn(x)));
  };
}

function _hmsBinary(name, fn) {
  return (s) => {
    const b = s.pop();
    const a = s.pop();
    if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
    const ah = _hmsToHours(toRealOrThrow(a));
    const bh = _hmsToHours(toRealOrThrow(b));
    s.push(Real(_hoursToHms(fn(ah, bh))));
  };
}

register('→HMS',  _hmsUnary('→HMS',  (h) => _hoursToHms(h)));
register('->HMS', _hmsUnary('->HMS', (h) => _hoursToHms(h)));
register('HMS→',  _hmsUnary('HMS→',  (h) => _hmsToHours(h)));
register('HMS->', _hmsUnary('HMS->', (h) => _hmsToHours(h)));
register('HMS+',  _hmsBinary('HMS+', (a, b) => a + b));
register('HMS-',  _hmsBinary('HMS-', (a, b) => a - b));

/* --------------- BinaryInteger shift / rotate ---------------
   HP50 AUR §10.1.  All 9 ops take a BinInt and return a BinInt; the
   display base is inherited from the input, and the value is masked
   to the current wordsize (STWS, default 64).  Mixed operands /
   wrong type throws 'Bad argument type'.

     SL   ( bin → bin' )   shift left by 1 bit (bit lost off top)
     SR   ( bin → bin' )   shift right by 1 bit (zero fill at top)
     ASR  ( bin → bin' )   shift right preserving sign-bit (top bit)
     RL   ( bin → bin' )   rotate left by 1 bit
     RR   ( bin → bin' )   rotate right by 1 bit
     SLB  ( bin → bin' )   shift left by 8 bits (1 byte)
     SRB  ( bin → bin' )   shift right by 8 bits (1 byte)
     RLB  ( bin → bin' )   rotate left by 8 bits
     RRB  ( bin → bin' )   rotate right by 8 bits

   Sign-bit handling in ASR: if the MSB of the wordsize is set, the
   right-shifted result keeps that bit set (i.e. arithmetic shift of a
   two's-complement value).  Wordsize 1 is a degenerate case — ASR is
   effectively a no-op there; we treat it that way.
   ---------------------------------------------------------------- */

function _requireBinInt(v) {
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
}

// Shift left by `k` bits.  Bits shifted off the high end are discarded
// via the wordsize mask.
function _shiftLeft(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const out = (v.value << BigInt(k)) & m;
  return BinaryInteger(out, v.base);
}

// Logical shift right by `k` bits.  High bits become 0.
function _shiftRight(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const out = (v.value & m) >> BigInt(k);
  return BinaryInteger(out, v.base);
}

// Arithmetic shift right by 1 bit — preserves the sign bit (MSB).
function _asr1(v) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  if (w <= 1n) return BinaryInteger(v.value & m, v.base);
  const msb = (v.value & m) >> (w - 1n);                // 0n or 1n
  let out = (v.value & m) >> 1n;
  if (msb === 1n) out |= (1n << (w - 1n));
  return BinaryInteger(out & m, v.base);
}

// Rotate left by `k` bits.
function _rotateLeft(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  const shift = BigInt(k) % w;
  if (shift === 0n) return BinaryInteger(v.value & m, v.base);
  const val = v.value & m;
  const left = (val << shift) & m;
  const right = val >> (w - shift);
  return BinaryInteger((left | right) & m, v.base);
}

// Rotate right by `k` bits.
function _rotateRight(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  const shift = BigInt(k) % w;
  if (shift === 0n) return BinaryInteger(v.value & m, v.base);
  const val = v.value & m;
  const right = val >> shift;
  const left = (val << (w - shift)) & m;
  return BinaryInteger((right | left) & m, v.base);
}

register('SL',  (s) => { const v = s.pop(); s.push(_shiftLeft(v, 1)); });
register('SR',  (s) => { const v = s.pop(); s.push(_shiftRight(v, 1)); });
register('ASR', (s) => { const v = s.pop(); s.push(_asr1(v)); });
register('SLB', (s) => { const v = s.pop(); s.push(_shiftLeft(v, 8)); });
register('SRB', (s) => { const v = s.pop(); s.push(_shiftRight(v, 8)); });
register('RL',  (s) => { const v = s.pop(); s.push(_rotateLeft(v, 1)); });
register('RR',  (s) => { const v = s.pop(); s.push(_rotateRight(v, 1)); });
register('RLB', (s) => { const v = s.pop(); s.push(_rotateLeft(v, 8)); });
register('RRB', (s) => { const v = s.pop(); s.push(_rotateRight(v, 8)); });

/* --------------- MAP — list/vector/matrix combinator ---------------
   HP50 AUR §15.  `MAP` applies a program (or quoted name) to each
   element of a list, vector or matrix, returning a new container of
   the same kind and shape with the result of each application.

     MAP  ( { a1 a2 … } prog → { prog(a1) prog(a2) … } )
     MAP  ( [ a1 a2 … ] prog → [ prog(a1) prog(a2) … ] )
     MAP  ( [[ a b ] [ c d ]] prog → [[ prog(a) prog(b) ] …] )

   `prog` may be a Program, a Symbolic expression, or a Name (whose
   binding must itself be a Program).  Each invocation must leave
   exactly one net result on top of the stack — a delta other than +1
   throws 'MAP: bad program'.

   Errors inside `prog` propagate unchanged (the stack is left with
   whatever partial work had completed — matches HP50 behavior; MAP is
   not transactional on real firmware either).  Non-container top-of-
   stack throws 'Bad argument type'.
   ---------------------------------------------------------------- */
// Generator flavor — yieldable per-iteration evaluation so a
// HALT/PROMPT inside `prog` lifts cleanly through the `evalRange`
// body intercept.  Mirrors the IFT/IFTE pattern.  The sync
// `_mapOneValue` helper below stays on as a sync analogue for any
// future op that wants the same shape without committing to a
// generator caller.
function* _mapOneValueGen(s, prog, e, depth) {
  const before = s.depth;
  s.push(e);
  yield* _evalValueGen(s, prog, depth + 1);
  const delta = s.depth - before;
  if (delta !== 1) {
    // Match the sync helper's error: a non-+1 delta is a programming
    // bug in `prog`, not a recoverable runtime condition.  See the
    // comment in `_mapOneValue` below for why we don't try to undo
    // the partial effect.
    throw new RPLError('MAP: bad program');
  }
  return s.pop();
}

function _mapOneValue(s, prog, e) {
  const before = s.depth;
  s.push(e);
  _evalValueSync(s, prog, 0, 'MAP program');
  const delta = s.depth - before;
  if (delta !== 1) {
    // Undo any partial effect so the error message is actionable.
    // We can't really roll back the user's data, but we can pop any
    // surplus so the stack is well-formed for the caller.
    throw new RPLError('MAP: bad program');
  }
  return s.pop();
}

/* MAP — generator flavor.
 *
 * `evalRange` intercepts the MAP token and delegates here so a HALT or
 * PROMPT inside the per-element `prog` body suspends through the same
 * `yield` channel HALT itself uses.  The accumulator (`out`, `rows`,
 * `newRow`) lives in this generator's stack frame, so a CONT after a
 * mid-iteration HALT resumes inside the same iteration with the
 * already-mapped prefix intact.  When the generator finally returns,
 * the resulting container is pushed onto the stack.
 *
 * Iteration order: list → left-to-right; vector → left-to-right;
 * matrix → row-major (whole row 0 before row 1).  An iteration that
 * yields mid-element preserves the *partial-row* state too — `newRow`
 * is closed over by the inner for-loop, so CONT picks up at element K
 * of the row in flight.
 *
 * The `register('MAP', ...)` handler below stays as a sync fallback
 * for the rare path where MAP is reached via Name dispatch
 * (`'MAP' EVAL`, Tagged-wrapped `Name('MAP')`).  Sync drives this same
 * generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside MAP program`.
 */
function* runMap(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  const obj  = s.pop();
  if (!isProgram(prog) && !isName(prog) && !isSymbolic(prog)) {
    throw new RPLError('Bad argument type');
  }
  if (isList(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(RList(out));
    return;
  }
  if (isVector(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(Vector(out));
    return;
  }
  if (isMatrix(obj)) {
    const rows = [];
    for (const row of obj.rows) {
      const newRow = [];
      for (const e of row) newRow.push(yield* _mapOneValueGen(s, prog, e, depth));
      rows.push(newRow);
    }
    s.push(Matrix(rows));
    return;
  }
  throw new RPLError('Bad argument type');
}

register('MAP', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // MAP caller label.  An RPLError thrown from inside the body
  // (validation or partial-eval failure) propagates with whatever
  // stack state the generator left behind; this sync path does not
  // snap/restore.
  _driveGen(runMap(s, 0), 'MAP program');
});

/* =================================================================
   List combinators (SEQ, DOLIST, DOSUBS, STREAM),
   Complex-aware unary math (LN / LOG / EXP / ALOG /
     SIN / COS / TAN / ASIN / ACOS / ATAN /
     SINH / COSH / TANH / ASINH / ACOSH / ATANH),
   Mixed BinInt ↔ Real/Integer arithmetic promotion.

   Advanced Guide refs: §15 (list combinators), §11 (complex
     elementary functions), §10.1 (BinInt arithmetic w/ mixed types).

   Every op below is user-reachable via the typed catalog today; no
   keypad wiring changes are needed.  The Complex-aware unaries
   accept Complex inputs on the principal branch; Real inputs still
   go through the existing real-only paths.
   ================================================================= */

/* ------------------- Complex arithmetic primitives ------------------- */
function _cx(re, im) { return { re, im }; }
function _cxAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function _cxSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function _cxMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function _cxDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new RPLError('Infinite result');
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}
function _cxExp(z) {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
}
// Principal-branch natural log: ln r + i*θ, θ ∈ (-π, π].
function _cxLn(z) {
  const r = Math.hypot(z.re, z.im);
  if (r === 0) throw new RPLError('Infinite result');
  return { re: Math.log(r), im: Math.atan2(z.im, z.re) };
}
// Principal square root.
function _cxSqrt(z) {
  if (z.im === 0) {
    if (z.re >= 0) return { re: Math.sqrt(z.re), im: 0 };
    return { re: 0, im: Math.sqrt(-z.re) };
  }
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt((r + z.re) / 2);
  const im = (z.im >= 0 ? 1 : -1) * Math.sqrt((r - z.re) / 2);
  return { re, im };
}
// Hyperbolic via exp: sinh(z) = (e^z - e^-z)/2, cosh(z) = (e^z + e^-z)/2.
function _cxSinh(z) {
  const ea = Math.exp(z.re), eb = Math.exp(-z.re);
  return {
    re: 0.5 * (ea - eb) * Math.cos(z.im),
    im: 0.5 * (ea + eb) * Math.sin(z.im),
  };
}
function _cxCosh(z) {
  const ea = Math.exp(z.re), eb = Math.exp(-z.re);
  return {
    re: 0.5 * (ea + eb) * Math.cos(z.im),
    im: 0.5 * (ea - eb) * Math.sin(z.im),
  };
}
function _cxTanh(z) {
  // tanh(a + bi) = (sinh(2a) + i sin(2b)) / (cosh(2a) + cos(2b))
  const a2 = 2 * z.re, b2 = 2 * z.im;
  const d = Math.cosh(a2) + Math.cos(b2);
  if (d === 0) throw new RPLError('Infinite result');
  return { re: Math.sinh(a2) / d, im: Math.sin(b2) / d };
}
// Trig via Euler: sin(z) = (e^iz - e^-iz)/(2i), cos(z) = (e^iz + e^-iz)/2.
function _cxSin(z) {
  // sin(a+bi) = sin a cosh b + i cos a sinh b
  return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) };
}
function _cxCos(z) {
  // cos(a+bi) = cos a cosh b - i sin a sinh b
  return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) };
}
function _cxTan(z) {
  return _cxDiv(_cxSin(z), _cxCos(z));
}
// Inverse hyperbolic.
function _cxAsinh(z) {
  // asinh(z) = ln(z + sqrt(z^2 + 1))
  const zsq = _cxMul(z, z);
  const s = _cxSqrt(_cxAdd(zsq, _cx(1, 0)));
  return _cxLn(_cxAdd(z, s));
}
function _cxAcosh(z) {
  // acosh(z) = ln(z + sqrt(z-1)*sqrt(z+1))  — keeps the right branch
  // along the real-axis cut (principal: Re ≥ 0).
  const a = _cxSqrt(_cxSub(z, _cx(1, 0)));
  const b = _cxSqrt(_cxAdd(z, _cx(1, 0)));
  return _cxLn(_cxAdd(z, _cxMul(a, b)));
}
function _cxAtanh(z) {
  // atanh(z) = (ln(1+z) - ln(1-z)) / 2
  const one = _cx(1, 0);
  const num = _cxAdd(one, z);
  const den = _cxSub(one, z);
  return _cxMul(_cx(0.5, 0), _cxLn(_cxDiv(num, den)));
}
// Inverse trig.
function _cxAsin(z) {
  // asin(z) = -i * ln(iz + sqrt(1 - z^2))
  const i = _cx(0, 1);
  const minusI = _cx(0, -1);
  const zsq = _cxMul(z, z);
  const inside = _cxSqrt(_cxSub(_cx(1, 0), zsq));
  return _cxMul(minusI, _cxLn(_cxAdd(_cxMul(i, z), inside)));
}
function _cxAcos(z) {
  // acos(z) = π/2 - asin(z)
  const as = _cxAsin(z);
  return _cxSub(_cx(Math.PI / 2, 0), as);
}
function _cxAtan(z) {
  // atan(z) = (i/2) * (ln(1-iz) - ln(1+iz))
  const i = _cx(0, 1);
  const iz = _cxMul(i, z);
  const num = _cxLn(_cxSub(_cx(1, 0), iz));
  const den = _cxLn(_cxAdd(_cx(1, 0), iz));
  return _cxMul(_cx(0, 0.5), _cxSub(num, den));
}

/* ------------------- Complex-aware op builders ------------------- */

// Decimal-aware angle conversion helpers.  toRadians / fromRadians in
// state.js operate on JS numbers; these operate on Decimal instances so
// large or high-precision angles don't lose digits in conversion.
// π is cached at module-load precision (15 sig figs matches Decimal.set).
const _PI_D = new Decimal(Math.PI);
function _toRadiansDecimal(d) {
  switch (_calcState.angle) {
    case 'DEG': return d.times(_PI_D).div(180);
    case 'GRD': return d.times(_PI_D).div(200);
    default:    return d;
  }
}
function _fromRadiansDecimal(d) {
  switch (_calcState.angle) {
    case 'DEG': return d.times(180).div(_PI_D);
    case 'GRD': return d.times(200).div(_PI_D);
    default:    return d;
  }
}

// Build a unary op that accepts Real/Integer or Complex, falling through
// to a Symbolic lift for Name/Symbolic operands.
//
// Every Cx-aware builder also picks up Vector/Matrix element-wise
// dispatch (`_withVMUnary`) and Tagged transparency (`_withTaggedUnary`).
// Wrapper order — Tagged → List → V/M → scalar — matches the convention
// used by FLOOR / CEIL / IP / FP / SIGN / ARG: Tagged outermost so a
// tagged-of-list or tagged-of-matrix unwraps before dispatch and
// re-tags the container; List inside Tagged so list distribution
// re-enters the scalar handler at each leaf; V/M innermost so a bare
// Vector/Matrix distributes to per-element scalar handling.
//
// `decimalFn` — a (Decimal) => Decimal function used for Real operands.
// `realFn`    — kept for the EXACT-mode Integer/Rational fold check only
//               (those inputs are always small, so JS Math is fine there).
function _unaryCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(r.re, r.im));
      return;
    }
    // EXACT-mode transcendental preservation: Integer/Rational inputs to
    // LN/EXP/LOG/ALOG/SINH/COSH/TANH/ASINH stay symbolic unless the fold
    // produces a clean integer (LN(1)=0, EXP(0)=1, etc.).
    // These inputs are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = toRealOrThrow(v);
      const y = realFn(x);
      s.push(_exactUnaryLift(name, y, v));
      return;
    }
    // Real branch: promote to Decimal and apply decimalFn.
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    const result = decimalFn(d);
    if (!result.isFinite()) {
      // Out-of-domain or overflow.  Under CMPLX mode lift to the
      // principal complex branch; otherwise raise a clean RPL error.
      if (getComplexMode() && cxFn) {
        const x = d.toNumber();
        const r = cxFn({ re: x, im: 0 });
        s.push(Complex(r.re, r.im));
        return;
      }
      throw new RPLError('Bad argument value');
    }
    s.push(Real(result));
  })));
}

// Trig forward (SIN/COS/TAN): angle in active mode on reals; Complex
// inputs are treated as radians (the only mathematically well-defined
// convention) and return a Complex.  Same Tagged / List / V/M wrapping
// as `_unaryCx`.
//
// `decimalFn` — (Decimal radians) => Decimal; applied after angle conversion.
function _trigFwdCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(r.re, r.im));
      return;
    }
    // EXACT-mode: Integer/Rational inputs stay symbolic unless the fold
    // produces a clean integer (e.g. SIN(0)=0 in RAD).  These inputs
    // are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const y = realFn(toRadians(toRealOrThrow(v)));
      s.push(_exactUnaryLift(name, y, v));
      return;
    }
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    s.push(Real(decimalFn(_toRadiansDecimal(d))));
  })));
}

// Inverse trig (ASIN/ACOS/ATAN): result in active angle mode for reals;
// for Complex inputs, the real and imaginary parts of the computed
// radian value are both scaled through fromRadians (a no-op in RAD,
// the standard HP50-style behavior in DEG/GRD — the real part becomes
// degrees, the imaginary part is scaled the same so angle-mode
// round-trips through SIN/COS/TAN).  Same Tagged / List / V/M wrapping
// as `_unaryCx`.
//
// `decimalFn` — (Decimal) => Decimal returning radians; domain errors
//               return a non-finite Decimal.
function _trigInvCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
      return;
    }
    // EXACT-mode: Integer/Rational inputs stay symbolic unless the fold
    // produces a clean integer in the active angle mode (e.g. ASIN(0)=0).
    // These inputs are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = toRealOrThrow(v);
      const y = realFn(x);
      if (Number.isFinite(y)) {
        s.push(_exactUnaryLift(name, fromRadians(y), v));
        return;
      }
      // Out-of-domain: fall through so CMPLX-mode or error handling below
      // still applies.
    }
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    const result = decimalFn(d);
    if (!result.isFinite()) {
      // |x| > 1 for ASIN/ACOS (or other out-of-domain input) lifts to
      // Complex under CMPLX mode, throws "Bad argument value" otherwise.
      if (getComplexMode() && cxFn) {
        const x = d.toNumber();
        const r = cxFn({ re: x, im: 0 });
        s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
        return;
      }
      throw new RPLError('Bad argument value');
    }
    s.push(Real(_fromRadiansDecimal(result)));
  })));
}

/* ------------------ Re-register elementary functions ------------------
   Replaces the earlier (real-only) registrations at the top of ops.js.
   `register()` uses Map.set under the hood — last registration wins —
   so every earlier call site (EVAL, parser, catalog lookup) now goes
   through the Complex-aware path automatically.

   The fourth argument to _unaryCx / _trigFwdCx / _trigInvCx is the
   Decimal-native implementation used for Real operands.  The third
   argument (realFn / JS Math) is kept only for the EXACT-mode
   Integer/Rational fold check where inputs are always small.
   ----------------------------------------------------------------- */
register('LN',   _unaryCx('LN',   Math.log,   _cxLn,   d => d.ln()));
register('LOG',  _unaryCx('LOG',  Math.log10, (z) => _cxDiv(_cxLn(z), _cx(Math.LN10, 0)),
                                              d => d.ln().div(new Decimal(Math.LN10))));
register('EXP',  _unaryCx('EXP',  Math.exp,   _cxExp,  d => d.exp()));
register('ALOG', _unaryCx('ALOG', (x) => Math.pow(10, x),
                                       (z) => _cxExp(_cxMul(z, _cx(Math.LN10, 0))),
                                       d => new Decimal(10).pow(d)));

// SINH/COSH/TANH: Decimal.js's native Taylor-series methods hang for
// large arguments (|x| > ~100,000) because the series converges too
// slowly.  Replace with exp-based identities that are O(1) in the
// magnitude of the argument:
//   sinh(x) = (eˣ − e⁻ˣ) / 2
//   cosh(x) = (eˣ + e⁻ˣ) / 2
//   tanh(x) = (eˣ − e⁻ˣ) / (eˣ + e⁻ˣ)
// For very large |x|, d.exp() overflows to Infinity immediately (fast),
// which _unaryCx already handles by throwing RPLError / lifting to Complex.
// For TANH specifically, |tanh(x)| ≥ 1 − 2e⁻⁴³ for |x| > 50 so the
// Taylor series would converge anyway (just slowly); we short-circuit to
// ±1 directly — exact to 15 significant digits.
register('SINH',  _unaryCx('SINH',  Math.sinh,  _cxSinh,
  d => { const ex = d.exp(), enx = d.negated().exp(); return ex.minus(enx).div(2); }));
register('COSH',  _unaryCx('COSH',  Math.cosh,  _cxCosh,
  d => { const ex = d.exp(), enx = d.negated().exp(); return ex.plus(enx).div(2); }));
register('TANH',  _unaryCx('TANH',  Math.tanh,  _cxTanh,
  d => {
    if (d.abs().gt(50)) return new Decimal(d.isNegative() ? -1 : 1);
    return d.tanh();
  }));
register('ASINH', _unaryCx('ASINH', Math.asinh, _cxAsinh, d => d.asinh()));
// ACOSH and ATANH preserve their domain checks on the real branch
// (x ≥ 1 for ACOSH, |x| < 1 for ATANH); Complex input goes to the
// principal-branch formula without a domain check.
// Same Tagged / List / V/M wrapping as the rest of the hyperbolic
// family.  ACOSH and ATANH have hand-written domain logic (ACOSH lifts
// x<1 to Complex; ATANH throws on x=±1) so they can't be expressed as
// plain `_unaryCx` calls — but the wrapper layers below are identical.
register('ACOSH', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ACOSH', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAcosh({ re: v.re, im: v.im });
    s.push(Complex(r.re, r.im));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= 1) { s.push(_exactUnaryLift('ACOSH', Math.acosh(x), v)); return; }
    // x < 1: fall through to Complex lift below.
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  if (d.gte(1)) { s.push(Real(d.acosh())); return; }
  // Real x < 1 lifts to Complex (principal branch).
  const r = _cxAcosh({ re: d.toNumber(), im: 0 });
  s.push(Complex(r.re, r.im));
}))));
register('ATANH', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ATANH', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAtanh({ re: v.re, im: v.im });
    s.push(Complex(r.re, r.im));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x === 1 || x === -1) throw new RPLError('Infinite result');
    if (x > -1 && x < 1) { s.push(_exactUnaryLift('ATANH', Math.atanh(x), v)); return; }
    // |x| > 1: fall through to Complex lift below.
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const one = new Decimal(1);
  if (d.abs().eq(one)) throw new RPLError('Infinite result');
  if (d.abs().lt(one)) { s.push(Real(d.atanh())); return; }
  // |x| > 1 lifts to Complex.
  const r = _cxAtanh({ re: d.toNumber(), im: 0 });
  s.push(Complex(r.re, r.im));
}))));

// SIN/COS/TAN: Decimal handles angle conversion and trig in full precision.
register('SIN', _trigFwdCx('SIN', Math.sin, _cxSin, d => d.sin()));
register('COS', _trigFwdCx('COS', Math.cos, _cxCos, d => d.cos()));
register('TAN', _trigFwdCx('TAN', Math.tan, _cxTan, d => d.tan()));

// ASIN/ACOS/ATAN: now use Decimal for real branch; domain handling and
// Complex lift are identical to before.
register('ASIN', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ASIN', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAsin({ re: v.re, im: v.im });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= -1 && x <= 1) { s.push(_exactUnaryLift('ASIN', fromRadians(Math.asin(x)), v)); return; }
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const result = d.asin();
  if (!result.isFinite()) {
    const r = _cxAsin({ re: d.toNumber(), im: 0 });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  s.push(Real(_fromRadiansDecimal(result)));
}))));
register('ACOS', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ACOS', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAcos({ re: v.re, im: v.im });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= -1 && x <= 1) { s.push(_exactUnaryLift('ACOS', fromRadians(Math.acos(x)), v)); return; }
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const result = d.acos();
  if (!result.isFinite()) {
    const r = _cxAcos({ re: d.toNumber(), im: 0 });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  s.push(Real(_fromRadiansDecimal(result)));
}))));
register('ATAN', _trigInvCx('ATAN', Math.atan, _cxAtan, d => d.atan()));

/* --------------- List combinators — SEQ, DOLIST, DOSUBS, STREAM ---------------
   HP50 AUR §15 "Lists and sequences".  MAP covers the 1-in/1-out
   elementwise case; this batch adds the four remaining combinators
   users actually reach for.

     SEQ     ( expr name start end step → list )
       Evaluate `expr` with `name` bound to start, start+step, … while
       the counter hasn't passed `end` in step's direction.  Returns a
       list of the results.  Zero step → Loop iteration limit (infinite
       loop).  Sign of `step` decides direction.
     DOLIST  ( list_1 … list_n n prog → list )
       Apply `prog` to the i-th element of each of the n lists; collect
       results.  Length of result = min(len(list_1), …, len(list_n)).
       Two-arg form `list prog DOLIST` defaults n=1.
     DOSUBS  ( list n prog → list )
       Sliding window of size n.  For each window, push its n elements
       and call `prog`; collect results.  Len(result) = len(list) - n + 1.
       n = 0 or n > len(list) → empty list.
     STREAM  ( list prog → value )
       Binary reduction.  Push first element, then for each subsequent
       element push it and call `prog`.  Single-element list → that
       element; empty list throws 'Invalid dimension' (HP50 error).

   All four combinators delegate per-call evaluation to `_evalValue`
   (the same entry point MAP / EVAL / IFT use), so Program / Name /
   Symbolic pass-through works for free and recursion depth is enforced.
   The `prog` slot accepts Program, Name, or Symbolic — same as MAP.
   ----------------------------------------------------------------- */

function _combinatorProgCheck(prog) {
  if (!isProgram(prog) && !isName(prog) && !isSymbolic(prog)) {
    throw new RPLError('Bad argument type');
  }
}

// Pop one return value after evaluating prog; guard against non-1 delta.
// `errLabel` ("DOLIST" / "DOSUBS" / …) does double-duty: stitched into
// the bad-program error AND into the caller-label passed to `_driveGen`
// so a rejected HALT names the right op.
function _popOneReturn(s, prog, baseDepth, errLabel) {
  _evalValueSync(s, prog, 0, errLabel + ' program');
  const delta = s.depth - baseDepth;
  if (delta !== 1) throw new RPLError(errLabel + ': bad program');
  return s.pop();
}

// Coerce an Integer / Real value to a plain JS number, accepting
// integer-valued Reals as integer counts.  Used by SEQ/DOLIST/DOSUBS.
function _toIntCount(v, errLabel) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError(errLabel);
}

/* SEQ — generator flavor.
 *
 * `evalRange` intercepts the SEQ token and delegates here so a HALT or
 * PROMPT inside the per-iteration `expr` body suspends through the
 * same `yield` channel HALT itself uses.  All loop state — the `out`
 * accumulator, the current loop counter `i`, the `iterations` cap
 * counter, the saved binding of the loop variable — lives in this
 * generator's stack frame, so a CONT after a mid-iteration HALT
 * resumes inside the same iteration with the partial accumulator
 * intact.  The loop variable is also saved/restored in `finally`, so
 * a KILL during a halted SEQ tears down the binding cleanly via
 * `gen.return()`.
 *
 * The `register('SEQ', ...)` handler below stays as a sync fallback
 * for the rare path where SEQ is reached via Name dispatch
 * (`'SEQ' EVAL`, Tagged-wrapped `Name('SEQ')`).  Sync drives this
 * same generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside SEQ expression`.
 */
function* runSeq(s, depth) {
  if (s.depth < 5) throw new RPLError('Too few arguments');
  const step  = s.pop();
  const end   = s.pop();
  const start = s.pop();
  const name  = s.pop();
  const expr  = s.pop();
  if (!isName(name)) throw new RPLError('Bad argument type');
  _combinatorProgCheck(expr);          // expr can be a Program/Name/Symbolic
  const a = toRealOrThrow(start);
  const b = toRealOrThrow(end);
  const st = toRealOrThrow(step);
  if (st === 0) throw new RPLError('Bad argument value');
  const varName = name.id;
  const saved = varRecall(varName);
  const out = [];
  let iterations = 0;
  try {
    let i = a;
    while ((st > 0 && i <= b) || (st < 0 && i >= b)) {
      if (++iterations > MAX_LOOP_ITERATIONS) throw new RPLError('Loop iteration limit');
      varStore(varName, Real(i));
      const baseDepth = s.depth;
      yield* _evalValueGen(s, expr, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('SEQ: bad program');
      out.push(s.pop());
      i += st;
    }
  } finally {
    if (saved === undefined) varPurge(varName);
    else varStore(varName, saved);
  }
  s.push(RList(out));
}

register('SEQ', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // SEQ caller label.  The generator pops operands first, so an
  // RPLError mid-iteration leaves the operands consumed (no
  // snap/restore on this path).
  _driveGen(runSeq(s, 0), 'SEQ expression');
});

/* DOLIST — generator flavor.
 *
 * `evalRange` intercepts the DOLIST token and delegates here so a HALT
 * or PROMPT inside the per-iteration `prog` body suspends through the
 * same `yield` channel HALT itself uses.  Loop state — the `out`
 * accumulator, the `lists` array, the current `i` — lives in this
 * generator's stack frame, so a CONT after a mid-iteration HALT
 * resumes inside the same iteration with the partial accumulator
 * intact.
 *
 * The `register('DOLIST', ...)` handler below stays as a sync fallback
 * for the rare path where DOLIST is reached via Name dispatch
 * (`'DOLIST' EVAL`, Tagged-wrapped `Name('DOLIST')`).  Sync drives this
 * same generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside DOLIST program`.
 */
function* runDoList(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  // Decide whether the next value is a count (Integer/integer-Real)
  // or the single-list form (list).
  const top = s.peek();
  let n;
  if (isList(top)) {
    n = 1;                               // implicit-n form
  } else {
    const nVal = s.pop();
    n = _toIntCount(nVal, 'Bad argument type');
    if (n < 1) throw new RPLError('Bad argument value');
  }
  if (s.depth < n) throw new RPLError('Too few arguments');
  const lists = [];
  for (let i = 0; i < n; i++) lists.push(s.pop());   // in reverse order
  lists.reverse();
  for (const L of lists) if (!isList(L)) throw new RPLError('Bad argument type');
  const minLen = lists.reduce((m, L) => Math.min(m, L.items.length), Infinity);
  const len = Number.isFinite(minLen) ? minLen : 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    const baseDepth = s.depth;
    for (const L of lists) s.push(L.items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('DOLIST: bad program');
    out.push(s.pop());
  }
  s.push(RList(out));
}

register('DOLIST', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // DOLIST caller label.  The generator pops operands first, so an
  // RPLError mid-iteration leaves the operands consumed (no
  // snap/restore on this path).
  _driveGen(runDoList(s, 0), 'DOLIST program');
});

/* DOSUBS context stack: a per-call frame pushed while DOSUBS iterates,
   so NSUB / ENDSUB called inside the window-program can read the
   current window index and the total number of windows.  A JS array
   is used as a stack so nested DOSUBS calls nest the context naturally
   — NSUB/ENDSUB always read the innermost frame.  The frame is
   pushed/popped inside `runDoSubs`'s `try/finally`, so a KILL of a
   halted DOSUBS closes the generator via `gen.return()` and the
   `finally` tears down the frame. */
const _DOSUBS_STACK = [];
function _currentDosubsFrame() {
  return _DOSUBS_STACK.length === 0
    ? null
    : _DOSUBS_STACK[_DOSUBS_STACK.length - 1];
}
// Test-side observer — pins that the DOSUBS frame stack is empty
// after a halted-DOSUBS KILL.
export function dosubsStackDepth() { return _DOSUBS_STACK.length; }

/* DOSUBS — generator flavor.
 *
 * Window-iteration combinator (HP50 AUR §13.5).  Same generator-flavor
 * pattern as runMap / runSeq / runDoList: pop the three operands, push
 * the NSUB/ENDSUB frame, then iterate windows; each window pushes `n`
 * elements and EVAL's `prog` through `_evalValueGen` so a HALT/PROMPT
 * inside the body suspends through the `yield` channel.  The
 * `_DOSUBS_STACK.pop()` call is in the `finally` so KILL of a halted
 * DOSUBS tears down the frame — `gen.return()` runs the finally
 * synchronously and NSUB/ENDSUB called outside DOSUBS afterwards
 * correctly throw `Undefined local name`.
 *
 * The `register('DOSUBS', ...)` handler below stays as a sync fallback
 * (Name dispatch).  Sync drives this same generator through
 * `_driveGen`, which rejects a HALT with `HALT: cannot suspend inside
 * DOSUBS program`.
 */
function* runDoSubs(s, depth) {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const nVal = s.pop();
  const n = _toIntCount(nVal, 'Bad argument type');
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  if (n < 0) throw new RPLError('Bad argument value');
  const items = list.items;
  if (n === 0 || n > items.length) { s.push(RList([])); return; }
  const totalWindows = items.length - n + 1;
  const frame = { index: 1, total: totalWindows };
  _DOSUBS_STACK.push(frame);
  const out = [];
  try {
    for (let i = 0; i + n <= items.length; i++) {
      frame.index = i + 1;                       // 1-based per HP50
      const baseDepth = s.depth;
      for (let k = 0; k < n; k++) s.push(items[i + k]);
      yield* _evalValueGen(s, prog, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('DOSUBS: bad program');
      out.push(s.pop());
    }
  } finally {
    _DOSUBS_STACK.pop();
  }
  s.push(RList(out));
}

register('DOSUBS', (s) => {
  // Sync fallback — drive the generator; reject yields with the
  // DOSUBS caller label.
  _driveGen(runDoSubs(s, 0), 'DOSUBS program');
});

/* NSUB / ENDSUB — only meaningful inside a DOSUBS window-program.
   HP50 AUR §13.5: NSUB pushes the 1-based index of the current
   window; ENDSUB pushes the total number of windows DOSUBS will
   process.  Called outside DOSUBS, both throw 'Undefined local
   name' — the HP50 error for these ops when there's no active
   DOSUBS frame.  We use the same RPLError text so program-level
   IFERR traps see a consistent message. */
register('NSUB', (s) => {
  const fr = _currentDosubsFrame();
  if (!fr) throw new RPLError('Undefined local name: NSUB');
  s.push(Integer(BigInt(fr.index)));
});

register('ENDSUB', (s) => {
  const fr = _currentDosubsFrame();
  if (!fr) throw new RPLError('Undefined local name: ENDSUB');
  s.push(Integer(BigInt(fr.total)));
});

/* STREAM — generator flavor.
 *
 * Reduce-over-list combinator (HP50 AUR §13.5).  Pops a list and a
 * binary `prog`, and folds `prog` over the list left-to-right: with
 * items `{a b c d}` the sequence is `a b prog → r1; r1 c prog → r2;
 * r2 d prog → r3` and `r3` is pushed.  Same generator-flavor pattern:
 * the accumulator lives on the *RPL* stack between iterations, and
 * each `prog` invocation goes through `_evalValueGen` so HALT/PROMPT
 * inside the body suspends through the `yield` channel.  CONT resumes
 * inside the same fold step; the in-progress accumulator is *already
 * on the RPL stack* at suspension time, so the user sees it on the
 * halted-stack display during the suspension — same observability as
 * a HALT inside any other structural op.
 *
 * One-element list short-circuits before any HALT can fire.  Empty
 * list throws `Invalid dimension` (HP50's own STREAM-on-empty error).
 *
 * The `register('STREAM', ...)` handler below stays as a sync fallback
 * (Name dispatch).  Sync drives this generator through `_driveGen`,
 * which rejects HALT with `HALT: cannot suspend inside STREAM
 * program`.
 */
function* runStream(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  const items = list.items;
  if (items.length === 0) throw new RPLError('Invalid dimension');
  if (items.length === 1) { s.push(items[0]); return; }
  s.push(items[0]);
  for (let i = 1; i < items.length; i++) {
    const baseDepth = s.depth - 1;       // the accumulator is already on top
    s.push(items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('STREAM: bad program');
  }
}

register('STREAM', (s) => {
  // Sync fallback — drive the generator; reject yields with the
  // STREAM caller label.
  _driveGen(runStream(s, 0), 'STREAM program');
});

/* --------------- Mixed BinInt ↔ Real/Integer arithmetic ---------------
   HP50 AUR §10.1: when a BinaryInteger meets a Real or Integer in a
   numeric op, the Real/Integer is coerced to a BinInt by truncating
   toward zero and masking to the current wordsize.  The BinInt
   operand's display base wins.

       #FFh 3 +         → #102h          (3 is coerced to #3h)
       3 #FFh +         → #102h          (base is still 'h' — BinInt's)
       #20h 2.7 *       → #40h           (2.7 → #2h via trunc)
       #5h 0 *          → #0h            (kept as BinInt zero)

   Dividing by a coerced-zero throws the integer-family 'Division by
   zero'.  A Complex operand on either side is still 'Bad argument
   type' — BinInt promotion is integer-only.

   Implementation: patch `_scalarBinary`'s early reject of mixed-type
   BinInt operands into a coercion branch that routes through
   `binIntBinary` with the BinInt side's base preserved.  This change
   is deliberately minimal — no new pathway in `binaryMath`, since the
   Vector/Matrix/Unit branches never see BinInt arguments.
   ----------------------------------------------------------------- */

/** Coerce a Real/Integer value to a BinaryInteger by truncating toward
 *  zero.  Masking to wordsize happens inside binIntBinary already, so
 *  we hand over the raw BigInt payload.  Base is provided by the
 *  caller (the actual-BinInt operand's base). */
function _coerceToBinInt(v, base) {
  if (isBinaryInteger(v)) return v;
  if (isInteger(v)) {
    // Negative integers wrap via two's-complement at mask time; clamp
    // to non-negative in the constructor by adding 2^w.  Since the
    // mask happens inside binIntBinary, just hand over the raw BigInt.
    const raw = v.value;
    // BinaryInteger ctor clamps negative to 0, but we want wrap.  Do
    // the wrap here: add 2^w if negative.
    if (raw < 0n) {
      const w = BigInt(getWordsize());
      const mod = 1n << w;
      return BinaryInteger(((raw % mod) + mod) % mod, base);
    }
    return BinaryInteger(raw, base);
  }
  if (isReal(v)) {
    if (!v.value.isFinite()) throw new RPLError('Bad argument value');
    const bi = BigInt(v.value.trunc().toFixed(0));
    if (bi < 0n) {
      const w = BigInt(getWordsize());
      const mod = 1n << w;
      return BinaryInteger(((bi % mod) + mod) % mod, base);
    }
    return BinaryInteger(bi, base);
  }
  throw new RPLError('Bad argument type');
}

// Replace the original _scalarBinary entirely; last registration wins.
// We export the mutation by re-defining the op functions that capture
// _scalarBinary.  Since _scalarBinary is used internally (not exported)
// and referenced by `binaryMath` through closure, we patch those
// registrations rather than the helper.  Approach: add a new helper
// `_scalarBinaryMixed` that tries BinInt-mixed coercion first, then
// falls back to the original logic via a direct inline copy for the
// non-BinInt branches.
function _scalarBinaryMixed(op, a, b) {
  const aBin = isBinaryInteger(a);
  const bBin = isBinaryInteger(b);
  if (aBin && bBin) return binIntBinary(op, a, b);
  if (aBin && (isInteger(b) || isReal(b))) {
    const bb = _coerceToBinInt(b, a.base);
    return binIntBinary(op, a, bb);
  }
  if (bBin && (isInteger(a) || isReal(a))) {
    const aa = _coerceToBinInt(a, b.base);
    return binIntBinary(op, aa, b);
  }
  // Mixed BinInt with a non-numeric (Complex, Symbolic, Unit, String…)
  // falls through to the original _scalarBinary for its existing
  // error / symbolic / unit / string handling.  We can call it
  // directly — it throws 'Bad argument type' for the mixed case
  // because it is still gated on `aBin || bBin` at the top.  To avoid
  // that early reject, route non-BinInt pairs only.
  if (aBin || bBin) {
    // e.g. BinInt + Complex  or  BinInt + Symbolic
    if (_isSymOperand(a) || _isSymOperand(b)) {
      // Same fallback path as _scalarBinary's symbolic branch — lift
      // both to an AST.  BinInt doesn't have an AST representation,
      // so this will throw 'Bad argument type' via _toAst's null
      // return.  Keep as-is.
      const l = _toAst(a);
      const r = _toAst(b);
      if (l && r) return Symbolic(AstBin(op, l, r));
    }
    throw new RPLError('Bad argument type');
  }
  return _scalarBinary(op, a, b);
}

// Rewire +, -, *, /, ^ through the mixed-aware scalar combiner.  We
// don't touch binaryMath itself; instead we replace the registered
// fns with wrappers that try the mixed-BinInt path first and hand
// off to binaryMath when no BinInt is involved.
function _binaryMathMixed(op) {
  const orig = binaryMath(op);
  return (s) => {
    if (s.depth >= 2) {
      const a = s.peek(2);               // level2
      const b = s.peek(1);               // level1
      const aBin = isBinaryInteger(a);
      const bBin = isBinaryInteger(b);
      if ((aBin && !bBin && (isInteger(b) || isReal(b))) ||
          (bBin && !aBin && (isInteger(a) || isReal(a)))) {
        s.popN(2);
        s.push(_scalarBinaryMixed(op, a, b));
        return;
      }
    }
    orig(s);
  };
}

/* Tagged transparency wrapped around the arithmetic family.
   `_withTaggedBinary` drops the tag(s) before the handler sees either
   operand.  This plays correctly with every existing branch:
     - String concat inside `+` sees the untagged String (so
       `Tagged('note','hi') "!" +` → `"hi!"` rather than a type error).
     - BinInt + Real/Integer promotion operates on the untagged numeric
       sides.
     - The inner `binaryMath(op)` sees the untagged operands and runs
       its existing V/M, scalar, and _scalarBinary dispatch unchanged.
   Binary ops drop the tag (there is no single obvious tag to keep).
   */
register('+', _withTaggedBinary((s) => {
  // List ∘ anything (or anything ∘ List) → HP50 AUR §3-7 list addition:
  //   { a … } { b … } +   → { a … b … }   (concatenate)
  //   { a … }      x  +   → { a … x }     (append)
  //        x  { a … } +   → { x a … }     (prepend)
  // Lists take precedence over String concatenation and over the
  // generic numeric / element-wise binaryMath fallback — element-wise
  // list arithmetic is reserved for ADD / DOLIST.  Tagged operands are
  // unwrapped by `_withTaggedBinary` before this handler sees them, so
  // a Tagged-wrapped list still hits this branch.
  if (s.depth >= 2) {
    const a = s.peek(2), b = s.peek(1);
    const aL = isList(a), bL = isList(b);
    if (aL || bL) {
      s.popN(2);
      if (aL && bL)  s.push(RList([...a.items, ...b.items]));
      else if (aL)   s.push(RList([...a.items, b]));
      else           s.push(RList([a, ...b.items]));
      return;
    }
    if (isString(a) || isString(b)) {
      const [x, y] = s.popN(2);
      const l = _stringCoerce(x), r = _stringCoerce(y);
      if (l == null || r == null) throw new RPLError('Bad argument type');
      s.push(Str(l + r));
      return;
    }
    const aBin = isBinaryInteger(a);
    const bBin = isBinaryInteger(b);
    if ((aBin && !bBin && (isInteger(b) || isReal(b))) ||
        (bBin && !aBin && (isInteger(a) || isReal(a)))) {
      s.popN(2);
      s.push(_scalarBinaryMixed('+', a, b));
      return;
    }
  }
  binaryMath('+')(s);
}));
register('-',  _withTaggedBinary(_binaryMathMixed('-')));
register('*',  _withTaggedBinary(_binaryMathMixed('*')));
register('/',  _withTaggedBinary(_binaryMathMixed('/')));
register('^',  _withTaggedBinary(_binaryMathMixed('^')));


/* =================================================================
   LAST / LASTARG, SNEG / SINV / SCONJ, PGDIR.

   NSUB / ENDSUB live next to DOSUBS (see the list-combinators block
   above) because they share the thread-local `_DOSUBS_STACK` context
   frame with DOSUBS.  The engine-plumbing for LAST / LASTARG —
   Stack.runOp / Stack._lastArgs — lives in `src/rpl/stack.js`; callers
   in `src/ui/entry.js` wrap each user-facing op invocation in runOp
   so LASTARG reflects the most-recent user command.

   Advanced Guide refs:
     §2.2   LASTARG, LAST CMD, LAST STACK (our LAST/LASTARG share
            the LASTARG definition)
     §3     SNEG, SINV, SCONJ — stored-variable in-place mutations
     §7     PGDIR — purge a subdirectory, including non-empty ones
     §15.8  NSUB, ENDSUB — see DOSUBS block above
   ================================================================= */

/* --------------- LAST / LASTARG ---------------
   HP50 AUR §2.2.  Both names resolve to the same op — LAST is the
   HP49g+ short form, LASTARG is spelled out in programs.  Push each
   recorded argument back onto the stack in original level order.
   Throws 'No last arguments' when no op with consumed args has run
   (or after a LASTARG/LAST call itself, which is 0-arg).
   ----------------------------------------------------------------- */
function _pushLastArgs(s) {
  if (!s.hasLastArgs()) throw new RPLError('No last arguments');
  const args = s.getLastArgs();
  for (const v of args) s.push(v);
}
register('LAST',    _pushLastArgs);
register('LASTARG', _pushLastArgs);

/* --------------- SNEG / SINV / SCONJ ---------------
   Parallel to the STO+ / STO- / STO(mul) / STO(div) family.  Read the
   stored value, apply the single-operand op, write it back.  Accepts
   Name or String identifier on level 1.  A name that doesn't exist
   throws 'Undefined name'.  The underlying NEG / INV / CONJ ops do
   the type-dispatch and throw on operands they can't handle (e.g.
   SCONJ on a String stored-value — 'Bad argument type').
   ----------------------------------------------------------------- */
function _storedUnary(opSymbol) {
  const unaryOp = lookup(opSymbol);
  if (!unaryOp) throw new Error('_storedUnary bootstrap: unknown op ' + opSymbol);
  const apply = (s, id) => {
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    s.push(stored);
    unaryOp.fn(s);
    const [result] = s.popN(1);
    try { varStore(id, result); }
    catch (e) { throw new RPLError(e.message || 'Bad argument value'); }
  };
  return (s) => {
    const v = s.pop();
    if (isList(v)) {
      for (const item of v.items) apply(s, _coerceDirName(item));
      return;
    }
    apply(s, _coerceDirName(v));
  };
}
register('SNEG',  _storedUnary('NEG'));
register('SINV',  _storedUnary('INV'));
register('SCONJ', _storedUnary('CONJ'));

/* --------------- PGDIR ---------------
   HP50 AUR §7.  PGDIR is like PURGE but specifically for
   subdirectories, and unlike PURGE it is allowed to purge a
   non-empty subdirectory (recursive delete).  The HP50 silently
   accepts PGDIR on a name that refers to a non-directory as well,
   but we throw 'Bad argument type' — the user almost certainly
   meant PURGE, and a quiet accept is harder to debug later.

   Non-existent name: 'Undefined name: <id>' (matches PURGE).
   Target is a Directory but non-empty: allowed (recursive-delete
   via a `.entries.clear()` before the delete call, so varPurge's
   "Directory not empty" guard doesn't trip).
   ----------------------------------------------------------------- */
function _pgdirOneOrRPL(id) {
  const existing = _calcState.current.entries.get(id);
  if (existing === undefined) throw new RPLError(`Undefined name: ${id}`);
  if (!isDirectory(existing)) throw new RPLError('Bad argument type');
  // Recursively clear all nested entries so the built-in "Directory not
  // empty" guard in varPurge doesn't reject the delete.  Clearing in
  // place is fine — nothing else holds references to these entries.
  const _drop = (dir) => {
    for (const [k, v] of dir.entries) {
      if (v && v.type === 'directory') _drop(v);
      dir.entries.delete(k);
    }
  };
  _drop(existing);
  // Now the dir is empty; delete it from the parent.
  const gone = varPurge(id);
  if (!gone) throw new RPLError(`Undefined name: ${id}`);
}

register('PGDIR', (s) => {
  const v = s.pop();
  if (isList(v)) {
    for (const item of v.items) {
      _pgdirOneOrRPL(_coerceDirName(item));
    }
    return;
  }
  _pgdirOneOrRPL(_coerceDirName(v));
});


/* =================================================================
   Factorial `!` bang, →Q rationalize, ORDER reorder variables,
   BYTES / NEWOB / MEM bookkeeping trio, TRACE matrix trace.

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §3.4   (FACT and its `!` bang form)
     §3.5   (→Q continued-fraction rationalize)
     §2.8   (ORDER reshapes VARS output)
     §2.4   (BYTES), §2.6 (NEWOB, MEM)
     §15.4  (TRACE)
   ================================================================= */

/* --------------- `!` — postfix factorial alias for FACT ---------------
   HP50 keyboard's `!` key binds to FACT (same op).  Parser tokenises a
   bare `!` as an `ident` of that text; registering `!` here as an op
   delegating to FACT makes the user-level surface match the real unit.
   Works for `5 !`, `5.5 !` (non-integer Real goes through gamma), and
   `'X !'` symbolic inputs that FACT already accepts.  Negative-integer
   arg throws 'Bad argument value' / 'Infinite result' through FACT.
   ----------------------------------------------------------------- */
register('!', (s) => { lookup('FACT').fn(s); });

/* --------------- →Q — rationalize a Real to a fraction ---------------
   HP50 AUR §3.5.  Given a Real x, finds the best Integer/Integer
   fraction within a bounded denominator that equals x to double
   precision.  Output is a Symbolic AST of `a/b` (or just `a` when
   denom=1, or the value as a Num when x is already an exact integer).

   Algorithm: Stern-Brocot continued-fraction convergents — standard
   textbook approach.  Iterate until the convergent matches x to
   double precision OR the denominator passes a cap (1e10, well above
   any HP50-realistic "best rational").  The convergent's denominator
   is a canonical expression of the precision limit: x = 0.1 → `1/10`,
   x = 0.333333333333 → `1/3`, x = 3.14159265358979 → `245850922/78256779`.

   Integer input or integer-valued Real: returns `Num(n)` (no /1 form).
   Negative: wrap the numerator's sign so the `/` stays between
   positive integers (e.g. -0.5 → Neg(1/2)).  Complex / String etc.
   are rejected.
   ----------------------------------------------------------------- */
const _QMAX_DENOM = 1e10;
const _QMAX_ITERS = 64;

function _continuedFractionConvergent(x) {
  // Stern-Brocot mediant: track two convergents (h0/k0, h1/k1) and
  // advance via `a = floor(b)`; `h2 = a*h1 + h0`, `k2 = a*k1 + k0`.
  const sign = x < 0 ? -1 : 1;
  let b = Math.abs(x);
  let h0 = 0, h1 = 1;
  let k0 = 1, k1 = 0;
  for (let i = 0; i < _QMAX_ITERS; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > _QMAX_DENOM) break;
    h0 = h1; h1 = h2;
    k0 = k1; k1 = k2;
    const frac = b - a;
    if (frac < 1e-15) break;    // converged within Real precision
    b = 1 / frac;
    if (!Number.isFinite(b)) break;
  }
  return { n: sign * h1, d: k1 };
}

register('→Q', (s) => {
  const [v] = s.popN(1);
  // Integer stays integer: represent as Symbolic(Num(n)) per HP50 spec
  // that →Q returns a Symbolic, but no /1 denominator.
  if (isInteger(v)) {
    s.push(Symbolic(AstNum(Number(v.value))));
    return;
  }
  if (!isReal(v)) throw new RPLError('Bad argument type');
  const x = v.value.toNumber();
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  if (Number.isInteger(x)) { s.push(Symbolic(AstNum(x))); return; }
  const { n, d } = _continuedFractionConvergent(x);
  if (d === 1) { s.push(Symbolic(AstNum(n))); return; }
  // Compose a/b with sign carried by the numerator's sign.  For a
  // negative-numerator rational we wrap in Neg so the printed form
  // reads `-(3/4)` rather than `(-3)/4` — matches HP50 display.
  if (n < 0) {
    s.push(Symbolic(AstNeg(AstBin('/', AstNum(-n), AstNum(d)))));
  } else {
    s.push(Symbolic(AstBin('/', AstNum(n), AstNum(d))));
  }
});
register('->Q', (s) => { lookup('→Q').fn(s); });

/* --------------- ORDER — reorder current-directory entries ---------------
   HP50 AUR §2.8.  Pops a List of Names (or Strings) and rearranges the
   current directory so those names appear first in the given order,
   with remaining entries preserved in their existing relative order.
   Unknown / missing names in the input list are silently ignored
   (matches HP50 forgiving behavior).  Duplicates take effect at their
   first occurrence only.  Non-List input throws Bad argument type.
   ----------------------------------------------------------------- */
register('ORDER', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const names = [];
  for (const item of l.items) {
    if (isName(item))        names.push(item.id);
    else if (isString(item)) names.push(item.value);
    else throw new RPLError('Bad argument type');
  }
  reorderCurrentEntries(names);
});

/* --------------- BYTES / NEWOB / MEM — bookkeeping trio ---------------
   HP50 AUR §2.4/§2.6.  In our web implementation we don't track real
   memory pages or CRC checksums, so we provide plausible surrogates:

     BYTES  ( obj  →  checksum size )
            — `checksum` is Integer(0) on our implementation (HP50 uses a
              CRC over the object's binary encoding; we don't have one).
              `size` is an Integer estimate of the object's serialized
              JSON length.  Level-2 checksum, level-1 size — matches HP50
              stack layout.
     NEWOB  ( obj  →  obj' )
            — force a new copy of the object.  HP50 uses this when a
              value was recalled by reference (shared underlying memory);
              with our frozen immutable RPL values this is effectively
              an identity, but we return a freshly-constructed clone so
              reference-equality (`===`) with the pre-op value is false.
              Composite containers (List / Vector / Matrix / Program) are
              rebuilt shallowly via their factories — outer object is a
              fresh `Object.freeze`d wrapper, inner-element identities
              are preserved (nested-Program and List-of-Rational pins
              both codify this contract).
              Scalar atoms (Real / Integer / BinaryInteger / Rational /
              Complex) are re-wrapped via their constructor to produce a
              new frozen object.  Tagged / Unit / String / Name / Symbolic
              go through the same single-arg constructor path.  Every
              enumerated branch produces an `Object.isFrozen() === true`
              result — pinned by the freeze-parity test assertions.
              Directory and Grob fall through the enumerated branches
              and return identity — Directories are live mutable
              containers (NEWOB has no useful semantics there) and Grobs
              flow through their dedicated value-copy ops, not the
              generic NEWOB path.
     MEM    ( → mem-free )
            — available memory.  HP50 reports the free Port 0 / Port 1
              bytes.  Our sentinel: Real(Number.MAX_SAFE_INTEGER) — big
              enough that user programs testing `MEM` against a
              threshold always pass.
   ----------------------------------------------------------------- */

function _sizeEstimate(v) {
  // A best-effort byte estimate via JSON round-tripping.  RPL values
  // are frozen and structurally simple so JSON.stringify survives on
  // everything except the Program type (which contains arbitrary
  // tokens).  On the HP50 every object carries a 5-byte prologue
  // overhead; we mimic with a +5 additive constant.
  try {
    // BigInt isn't JSON-serialisable; replace with decimal string.
    const s = JSON.stringify(v, (_k, val) =>
      typeof val === 'bigint' ? val.toString() + 'n' : val);
    return (s ? s.length : 0) + 5;
  } catch (_e) {
    // Cyclic or non-serialisable — return a small nonzero sentinel.
    return 5;
  }
}

function _newObCopy(v) {
  if (isReal(v))    return Real(v.value);
  if (isInteger(v)) return Integer(v.value);
  if (isBinaryInteger(v)) return BinaryInteger(v.value, v.base);
  if (isRational(v)) return Rational(v.n, v.d);
  if (isComplex(v)) return Complex(v.re, v.im);
  if (isString(v))  return Str(v.value);
  if (isName(v))    return Name(v.id, { local: v.local, quoted: v.quoted });
  if (isSymbolic(v)) return Symbolic(v.expr);
  if (isList(v))    return RList(v.items.slice());
  if (isVector(v))  return Vector(v.items.slice());
  if (isMatrix(v))  return Matrix(v.rows.map(r => r.slice()));
  if (isProgram(v)) return Program(v.tokens);
  if (isTagged(v))  return Tagged(v.tag, v.value);
  if (isUnit(v))    return Unit(v.value, v.uexpr);
  // Directory or anything unknown: return as-is.  NEWOB on a Directory
  // is meaningless (a Directory is a live mutable container, not a
  // pass-by-reference value the way HP50 NEWOB is meant to "decouple").
  // Grob is also intentionally not enumerated — graphics objects flow
  // through the dedicated Grob ops, not the value-copy machinery.
  // Every enumerated shape uses its factory function so that
  // `Object.isFrozen(copy) === true` holds for the returned value,
  // matching the invariant of the input.  NEWOB's contract per HP50
  // AUR §3-130 is "force a new copy"; for immutable frozen scalars
  // (e.g. Rational) this is observable only through `===` identity.
  // Freeze-parity is pinned in `tests/test-reflection.mjs`.
  return v;
}

register('BYTES', (s) => {
  const [v] = s.popN(1);
  const size = _sizeEstimate(v);
  // Push: level 2 = checksum (0), level 1 = size
  s.push(Integer(0n));
  s.push(Integer(BigInt(size)));
});

register('NEWOB', (s) => {
  const [v] = s.popN(1);
  s.push(_newObCopy(v));
});

register('MEM', (s) => {
  // 1 GiB — a plausible, fixed "free memory" reading.  Unlike the HP50
  // this app has no bounded memory pool to measure; a constant keeps
  // MEM comparisons (`IF MEM 1000 < THEN ...`) predictable across runs.
  s.push(Real(1073741824));
});

/* --------------- TRACE — matrix trace ---------------
   HP50 AUR §15.4.  Given a square Matrix, sum the main-diagonal
   entries and push the result as a scalar.  Uses `_scalarBinary('+', …)`
   (the same combiner DET uses) so mixed Integer / Real / Complex /
   Symbolic entries all compose — an integer-only matrix stays exactly
   integer.  Non-Matrix / non-square inputs throw.
   ----------------------------------------------------------------- */
register('TRACE', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const rows = m.rows.length;
  const cols = rows > 0 ? m.rows[0].length : 0;
  if (rows !== cols) throw new RPLError('Invalid dimension');
  if (rows === 0) { s.push(Real(0)); return; }
  let acc = m.rows[0][0];
  for (let i = 1; i < rows; i++) {
    acc = _scalarBinary('+', acc, m.rows[i][i]);
  }
  s.push(acc);
});


/* =================================================================
   Q→ decompose, D→HMS / HMS→D bridges,
   RREF / RANK (Gauss-Jordan), CON constant matrix/vector.

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §3.5   (Q→ decompose the Symbolic n/d from →Q)
     §3.3   (D→HMS / HMS→D — degree aliases for →HMS / HMS→)
     §15.4  (RREF / RANK — Gauss-Jordan row reduction)
     §15.2  (CON — constant-fill matrix/vector builder)
   ================================================================= */

/* --------------- Q→ — decompose Symbolic n/d back to integer pair ------
   HP50 AUR §3.5.  Inverse of →Q.  Pops a Symbolic of the shape produced
   by →Q (an integer, `n/d`, or `-(n/d)`) and pushes two Integers: the
   (signed) numerator at level 2 and the denominator at level 1.  A bare
   integer Symbolic decomposes as `( n 1 )` — `d = 1` — matching the HP50
   convention that "every integer is an integer over one".

   Accepted shapes (all produced by →Q or commonly parseable):
     Symbolic(Num(n))                  →  ( n 1 )
     Symbolic(Bin('/', Num(n), Num(d)))→  ( n d )
     Symbolic(Neg(Bin('/', Num(n), Num(d))))  →  ( -n d )
     Symbolic(Neg(Num(n)))             →  ( -n 1 )
     Integer(n) / Real(n)              →  ( n 1 )  (convenience — HP50
                                                    also accepts bare
                                                    numerics on Q→)

   Non-integer numerator/denominator (e.g. 1/3.14) throws Bad argument
   value — Q→ is specifically about integer rationals.  Any other
   Symbolic shape (a*b, a+b, SIN(x), etc.) throws Bad argument type.
   ----------------------------------------------------------------- */

function _astIntOrThrow(n, msg = 'Bad argument value') {
  if (!n || n.kind !== 'num') throw new RPLError(msg);
  if (!Number.isFinite(n.value) || !Number.isInteger(n.value)) {
    throw new RPLError(msg);
  }
  return BigInt(n.value);
}

function _qDecompose(sym) {
  // Returns [num, den] as BigInts.
  if (sym.kind === 'num') {
    return [_astIntOrThrow(sym), 1n];
  }
  if (sym.kind === 'neg') {
    const [n, d] = _qDecompose(sym.arg);
    return [-n, d];
  }
  if (sym.kind === 'bin' && sym.op === '/') {
    const n = _astIntOrThrow(sym.l);
    const d = _astIntOrThrow(sym.r);
    if (d === 0n) throw new RPLError('Infinite result');
    return [n, d];
  }
  throw new RPLError('Bad argument type');
}

register('Q→', (s) => {
  const [v] = s.popN(1);
  // Bare numerics: convenience pass-through.  HP50's Q→ accepts these
  // too (the integer-over-one form) so programs that round-trip
  // `3 →Q Q→` see `3 1` on the stack.
  if (isInteger(v))  { s.push(Integer(v.value)); s.push(Integer(1n)); return; }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    s.push(Integer(BigInt(v.value.toFixed(0)))); s.push(Integer(1n)); return;
  }
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const [n, d] = _qDecompose(v.expr);
  s.push(Integer(n));
  s.push(Integer(d));
});
register('Q->', (s) => { lookup('Q→').fn(s); });

/* --------------- D→HMS / HMS→D — degree aliases for →HMS / HMS→ -------
   HP50 AUR §3.3.  D→HMS converts a decimal-degree value into DD.MMSS
   form; HMS→D goes the other way.  The numeric format is identical to
   the H:M:S form used by →HMS / HMS→ (the leading integer is the whole
   unit, next two digits are minutes/arcminutes, remaining are
   seconds/arcseconds).  So these are registered as aliases of the
   existing `_hmsUnary` helpers.  ASCII aliases `D->HMS` / `HMS->D`
   register alongside the Unicode glyphs so users on keyboards without
   `→` can type them.
   ----------------------------------------------------------------- */
register('D→HMS',  _hmsUnary('D→HMS',  (h) => _hoursToHms(h)));
register('D->HMS', _hmsUnary('D->HMS', (h) => _hoursToHms(h)));
register('HMS→D',  _hmsUnary('HMS→D',  (h) => _hmsToHours(h)));
register('HMS->D', _hmsUnary('HMS->D', (h) => _hmsToHours(h)));

/* --------------- RREF / RANK — row reduction and rank --------------
   HP50 AUR §15.4.  RREF produces the reduced-row-echelon form of its
   argument Matrix; RANK counts the non-zero rows of the RREF.

   Reuses the Gauss-Jordan machinery from `_invMatrixNumeric` but
   without the augmented-identity trick (since we only care about the
   left-hand side).  Handles rectangular (m×n with m ≠ n) matrices:
   the inversion path requires square but RREF does not.  Works on
   Real / Integer entries; Complex / Symbolic entries throw
   `Bad argument type` (same policy as INV).

   RANK counts the rows whose max |entry| exceeds a small tolerance
   (1e-10 times the row's 1-norm-scale).  This is the usual numerical
   rank definition — bit-exact zero tests are fragile after floating-
   point row ops.
   ----------------------------------------------------------------- */
function _rrefNumeric(rows) {
  const m = rows.length;
  if (m === 0) return [];
  const n = rows[0].length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  // Convert to a mutable 2-D array of JS numbers.
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  // Standard Gauss-Jordan elimination with partial pivoting.
  let r = 0; // current pivot row
  for (let c = 0; c < n && r < m; c++) {
    // Find pivot in column c, rows >= r.
    let best = r, bestAbs = Math.abs(a[r][c]);
    for (let i = r + 1; i < m; i++) {
      const v = Math.abs(a[i][c]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) continue;           // column is already clean
    if (best !== r) {
      [a[r], a[best]] = [a[best], a[r]];
    }
    const piv = a[r][c];
    for (let j = 0; j < n; j++) a[r][j] /= piv;
    a[r][c] = 1;                             // kill residual FP noise
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = a[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < n; j++) a[i][j] -= f * a[r][j];
      a[i][c] = 0;                           // kill residual FP noise
    }
    r++;
  }
  return a;
}

function _numericRank(rrefArr) {
  // Row is non-zero if any entry exceeds the tolerance.
  let k = 0;
  for (const row of rrefArr) {
    let maxAbs = 0;
    for (const x of row) {
      const v = Math.abs(x);
      if (v > maxAbs) maxAbs = v;
    }
    if (maxAbs > 1e-10) k++;
  }
  return k;
}

register('RREF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _rrefNumeric(v.rows);
  s.push(Matrix(out.map(row => row.map(x => Real(x)))));
});

register('RANK', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _rrefNumeric(v.rows);
  s.push(Integer(BigInt(_numericRank(out))));
});

/* --------------- CON — constant-fill matrix / vector ------------------
   HP50 AUR §15.2.  Two stack signatures:

     n      value   →  Vector         (n-long vector filled with value)
     {n}    value   →  Vector
     {m n}  value   →  Matrix         (m×n matrix filled with value)
     M      value   →  Matrix'        (M's shape, every entry replaced)
     V      value   →  Vector'        (V's shape, every entry replaced)

   `value` is a scalar (Real / Integer / Complex / Symbolic) — no nested
   containers.  The count/shape element may be Integer or Real (any
   non-negative integer-valued Real).  Integer shape stays Integer when
   fed back via SIZE → CON round-trip; Real values stay Real.

   Error surface:
     - shape-list neither {n} nor {m n}  →  Invalid dimension
     - count <= 0 for a dimension        →  Bad argument value
     - scalar-wrapped non-scalar value   →  Bad argument type
   ----------------------------------------------------------------- */

function _conShapeFrom(v) {
  // Returns {m,n} where n===null means "vector of length m".  Accepts
  // Integer, Real (integer-valued), {n}, {m n}, Vector, Matrix.
  if (isInteger(v))           return { m: Number(v.value), n: null };
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return { m: v.value.toNumber(), n: null };
  }
  if (isList(v)) {
    if (v.items.length === 1) {
      const k = v.items[0];
      if (isInteger(k))       return { m: Number(k.value), n: null };
      if (isReal(k) && k.value.isInteger()) return { m: k.value.toNumber(), n: null };
      throw new RPLError('Bad argument type');
    }
    if (v.items.length === 2) {
      const [a, b] = v.items;
      const mm = isInteger(a) ? Number(a.value)
               : (isReal(a) && a.value.isInteger()) ? a.value.toNumber()
               : (() => { throw new RPLError('Bad argument type'); })();
      const nn = isInteger(b) ? Number(b.value)
               : (isReal(b) && b.value.isInteger()) ? b.value.toNumber()
               : (() => { throw new RPLError('Bad argument type'); })();
      return { m: mm, n: nn };
    }
    throw new RPLError('Invalid dimension');
  }
  if (isVector(v))  return { m: v.items.length, n: null };
  if (isMatrix(v))  {
    return { m: v.rows.length, n: v.rows.length > 0 ? v.rows[0].length : 0 };
  }
  throw new RPLError('Bad argument type');
}

register('CON', (s) => {
  const [shape, value] = s.popN(2);
  // The value must be a scalar-ish thing: Real, Integer, Complex, or Symbolic.
  // Reject nested containers / strings / etc. — HP50 CON is scalar-fill.
  if (!(isReal(value) || isInteger(value) || isComplex(value) || isSymbolic(value))) {
    throw new RPLError('Bad argument type');
  }
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  if (n === null) {
    s.push(Vector(new Array(m).fill(value)));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) rows.push(new Array(n).fill(value));
    s.push(Matrix(rows));
  }
});


/* =================================================================
   REF, HADAMARD, RANM, LSQ.

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §15.4  (REF — row echelon form, Gaussian elimination)
     §15.6  (HADAMARD — element-wise matrix product)
     §15.2  (RANM — random-integer matrix/vector of given shape)
     §15.4  (LSQ — minimum-norm least-squares solution of A x = b)
   ================================================================= */

/* --------------- REF — row echelon form (Gaussian elimination) -----
   HP50 AUR §15.4.  REF produces an upper-triangular row echelon form
   of its argument Matrix via Gaussian elimination with partial
   pivoting.  Unlike RREF, REF does NOT back-substitute to clear the
   entries above each pivot — so pivots stay 1 and entries above them
   can be any real.  For a 2×2 with row2 = 2·row1, REF → [[1 2][0 0]]
   is identical to RREF's output (same zero row); but for [[1 2][3 4]],
   REF → [[1 2][0 1]] (upper triangular), while RREF → [[1 0][0 1]].

   Shares the `_rrefNumeric` loop but with the above-pivot elimination
   step disabled via a `fullReduction` flag.
   ----------------------------------------------------------------- */
function _refNumeric(rows) {
  // Gaussian elimination WITHOUT back-substitution (REF, not RREF).
  // Structurally identical to `_rrefNumeric` but `i < r` rows are
  // left alone — only rows strictly below the pivot row get zeroed.
  const m = rows.length;
  if (m === 0) return [];
  const n = rows[0].length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let best = r, bestAbs = Math.abs(a[r][c]);
    for (let i = r + 1; i < m; i++) {
      const v = Math.abs(a[i][c]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) continue;
    if (best !== r) [a[r], a[best]] = [a[best], a[r]];
    const piv = a[r][c];
    for (let j = 0; j < n; j++) a[r][j] /= piv;
    a[r][c] = 1;                           // kill residual FP noise on pivot
    // Eliminate BELOW the pivot only — that's the REF vs RREF difference.
    for (let i = r + 1; i < m; i++) {
      const f = a[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < n; j++) a[i][j] -= f * a[r][j];
      a[i][c] = 0;
    }
    r++;
  }
  return a;
}

register('REF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _refNumeric(v.rows);
  s.push(Matrix(out.map(row => row.map(x => Real(x)))));
});

/* --------------- HADAMARD — element-wise matrix/vector product ------
   HP50 AUR §15.6.  HADAMARD takes two matrices (or two vectors) of
   the same shape and returns a result of the same shape whose (i,j)
   entry is the product of the two inputs' (i,j) entries.  Distinct
   from the default `*` which treats two matrices as matrix-multiply
   and two vectors as dot product.

   Dispatches through `_scalarBinary('*', a, b)` so Integer / Real /
   Complex / Symbolic entries compose naturally.
   ----------------------------------------------------------------- */
register('HADAMARD', (s) => {
  const [a, b] = s.popN(2);
  if (isVector(a) && isVector(b)) {
    if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
    const out = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
    s.push(Vector(out));
    return;
  }
  if (isMatrix(a) && isMatrix(b)) {
    const ma = a.rows.length, na = ma > 0 ? a.rows[0].length : 0;
    const mb = b.rows.length, nb = mb > 0 ? b.rows[0].length : 0;
    if (ma !== mb || na !== nb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      const row = [];
      for (let j = 0; j < na; j++) {
        row.push(_scalarBinary('*', a.rows[i][j], b.rows[i][j]));
      }
      rows.push(row);
    }
    s.push(Matrix(rows));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- RANM — random-integer matrix/vector ----------------
   HP50 AUR §15.2.  RANM takes a shape specifier (same forms as CON)
   and returns a Matrix (or Vector) of random integers in the range
   [-9, 9] — matching the HP50 documented behaviour.

   Shape inputs accepted (mirrors `_conShapeFrom`):
     n       →  Vector of length n
     {n}     →  Vector of length n
     {m n}   →  m×n Matrix
     V       →  Vector of V's length
     M       →  Matrix of M's shape

   RNG: shared seeded LCG in state.js (`nextPrngInt9`).  RANM shares
   state with RAND and RDZ so `RDZ 12345 { 2 3 } RANM` produces a
   deterministic matrix — exactly matching HP50 semantics where the
   same seed always regenerates the same random matrix.  Tests pin the
   seed at session boot via resetPrng() so draws are reproducible.
   ----------------------------------------------------------------- */

register('RANM', (s) => {
  const [shape] = s.popN(1);
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  if (n === null) {
    const v = [];
    for (let i = 0; i < m; i++) v.push(Real(nextPrngInt9()));
    s.push(Vector(v));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(Real(nextPrngInt9()));
      rows.push(row);
    }
    s.push(Matrix(rows));
  }
});

/* --------------- LSQ — least-squares solver -------------------------
   HP50 AUR §15.4.  LSQ solves A x = b in the least-squares sense.
   Stack layout: level 2 = b, level 1 = A.  Returns x.

   Three shape regimes (rows m, cols n of A):
     m = n (square):           x = A^-1 b   — direct solve via
                               Gauss-Jordan.  Singular → throws
                               `Infinite result` (inherits the
                               `_invMatrixNumeric` rejection).
     m > n (overdetermined):   normal equations (A^T A) x = A^T b.
                               Unique x whenever A has full column
                               rank.
     m < n (underdetermined):  minimum-norm solution via A^T (A A^T)^-1 b.
                               Unique x whenever A has full row rank.

   b may be a Vector of length m (single RHS → Vector x of length n)
   or a Matrix with m rows (multiple RHS → Matrix x with n rows).  The
   current implementation handles the Vector-b case directly; Matrix-b
   loops over its columns.

   Only numeric (Real / Integer) entries are accepted on both sides,
   matching the `_invMatrixNumeric` rejection policy.
   ----------------------------------------------------------------- */
function _asNumArray2D(rows) {
  // rows is Array<Array<RPLValue>>.  Returns Array<Array<number>>;
  // throws Bad argument type on any non-Real/non-Integer entry.
  return rows.map(row => row.map(x => {
    if (isInteger(x)) return Number(x.value);
    if (isReal(x)) return x.value.toNumber();
    throw new RPLError('Bad argument type');
  }));
}

function _asNumArray1D(items) {
  return items.map(x => {
    if (isInteger(x)) return Number(x.value);
    if (isReal(x)) return x.value.toNumber();
    throw new RPLError('Bad argument type');
  });
}

function _matMulNum(a, b) {
  // Plain 2-D number arrays; a is m×k, b is k×n → m×n.
  const m = a.length;
  const k = a[0].length;
  const n = b[0].length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(n).fill(0);
    for (let p = 0; p < k; p++) {
      const aip = a[i][p];
      if (aip === 0) continue;
      for (let j = 0; j < n; j++) row[j] += aip * b[p][j];
    }
    out.push(row);
  }
  return out;
}

function _matVecNum(a, v) {
  // a is m×n, v is length n → length m.
  const m = a.length;
  const n = a[0].length;
  const out = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let acc = 0;
    for (let j = 0; j < n; j++) acc += a[i][j] * v[j];
    out[i] = acc;
  }
  return out;
}

function _transposeNum(a) {
  const m = a.length;
  const n = a[0].length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(m);
    for (let i = 0; i < m; i++) row[i] = a[i][j];
    out.push(row);
  }
  return out;
}

function _invSquareNum(a) {
  // Plain-number Gauss-Jordan invert.  Throws Infinite result if
  // singular (mirrors `_invMatrixNumeric`).  Pure-number helper for
  // LSQ internals — doesn't box/unbox Real wrappers.
  const n = a.length;
  const ext = a.map(r => r.slice());
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
    let best = k, bestAbs = Math.abs(ext[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(ext[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) throw new RPLError('Infinite result');
    if (best !== k) {
      [ext[k], ext[best]] = [ext[best], ext[k]];
      [I[k], I[best]] = [I[best], I[k]];
    }
    const piv = ext[k][k];
    for (let j = 0; j < n; j++) { ext[k][j] /= piv; I[k][j] /= piv; }
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = ext[i][k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        ext[i][j] -= f * ext[k][j];
        I[i][j] -= f * I[k][j];
      }
    }
  }
  return I;
}

function _lsqSolveVec(Anum, bnum) {
  // Anum: m×n, bnum: length m.  Returns length-n solution vector.
  const m = Anum.length;
  const n = Anum[0].length;
  if (m === n) {
    const invA = _invSquareNum(Anum);
    return _matVecNum(invA, bnum);
  }
  if (m > n) {
    // Overdetermined: normal equations (A^T A) x = A^T b.
    const At = _transposeNum(Anum);
    const AtA = _matMulNum(At, Anum);           // n×n
    const Atb = _matVecNum(At, bnum);           // length n
    const invAtA = _invSquareNum(AtA);
    return _matVecNum(invAtA, Atb);
  }
  // Underdetermined: minimum-norm x = A^T (A A^T)^-1 b.
  const At = _transposeNum(Anum);
  const AAt = _matMulNum(Anum, At);            // m×m
  const invAAt = _invSquareNum(AAt);
  const y = _matVecNum(invAAt, bnum);          // length m
  return _matVecNum(At, y);                    // length n
}

register('LSQ', (s) => {
  const [b, A] = s.popN(2);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const Anum = _asNumArray2D(A.rows);
  const m = Anum.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = Anum[0].length;

  if (isVector(b)) {
    if (b.items.length !== m) throw new RPLError('Invalid dimension');
    const bnum = _asNumArray1D(b.items);
    const x = _lsqSolveVec(Anum, bnum);
    s.push(Vector(x.map(v => Real(v))));
    return;
  }
  if (isMatrix(b)) {
    if (b.rows.length !== m) throw new RPLError('Invalid dimension');
    const bnum = _asNumArray2D(b.rows);
    const k = b.rows[0].length;
    // Column-by-column: build X with n rows and k columns.
    const cols = [];
    for (let c = 0; c < k; c++) {
      const bc = new Array(m);
      for (let i = 0; i < m; i++) bc[i] = bnum[i][c];
      cols.push(_lsqSolveVec(Anum, bc));
    }
    const rowsOut = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(k);
      for (let c = 0; c < k; c++) row[c] = Real(cols[c][i]);
      rowsOut.push(row);
    }
    s.push(Matrix(rowsOut));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* =================================================================
   ROW+ / ROW- / COL+ / COL- (matrix row/col edit),
   CNRM / RNRM (column / row max-sum norms), AUGMENT (horizontal
   concatenate), RAND / RDZ (seeded PRNG; shared with RANM above).

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §15.3  (ROW+, ROW-, COL+, COL- — matrix row/column insert/delete)
     §15.4  (CNRM — column norm, RNRM — row norm)
     §15.3  (AUGMENT — horizontal concat of matrix/vector)
     §17.5  (RAND — uniform Real in [0,1), RDZ — seed the PRNG)
   ================================================================= */

/* --------------- ROW+ / ROW- / COL+ / COL- --------------------------
   HP50 AUR §15.3.  Matrix row/column insert/delete.

   ROW+  ( M v n → M' )
         Insert Vector v as new row n (1-based) of Matrix M.  After
         the insert, the new matrix has m+1 rows; the former row-n
         and everything below it shift down one.  v must be a Vector
         of length = n-cols of M.  n must be in [1, m+1] (inserting
         at m+1 appends at the bottom).

   ROW-  ( M n → M' v )
         Remove row n of M.  Pushes the reduced matrix on level 2
         and the removed row (as a Vector) on level 1.  n must be in
         [1, m].

   COL+  ( M v n → M' )
         Insert Vector v as new column n (1-based) of M.  v must be
         a Vector of length = n-rows of M.  n must be in [1, p+1].

   COL-  ( M n → M' v )
         Remove column n.  Pushes reduced matrix on level 2 and the
         removed column (as a Vector) on level 1.

   Element polymorphism: since these are pure array manipulations
   (no arithmetic on entries), the matrix/vector entries can be any
   type the Matrix constructor already accepts — Real, Integer,
   Complex, Symbolic.  No coercion; the inserted/extracted values
   are pushed through unchanged.
   ----------------------------------------------------------------- */

function _indexAsInt(v, op) {
  // Accepts Integer or integer-valued Real; returns a JS number index.
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isInteger()) return v.value.toNumber();
  throw new RPLError('Bad argument type');
}

register('ROW+', (s) => {
  const [M, vec, idx] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!isVector(vec)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'ROW+');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (vec.items.length !== cols) throw new RPLError('Invalid dimension');
  if (n < 1 || n > m + 1) throw new RPLError('Invalid dimension');
  const newRow = vec.items.slice();
  const out = M.rows.map(r => r.slice());
  out.splice(n - 1, 0, newRow);
  s.push(Matrix(out));
});

register('ROW-', (s) => {
  const [M, idx] = s.popN(2);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'ROW-');
  const m = M.rows.length;
  if (n < 1 || n > m) throw new RPLError('Invalid dimension');
  const rows = M.rows.map(r => r.slice());
  const removed = rows.splice(n - 1, 1)[0];
  s.push(Matrix(rows));
  s.push(Vector(removed));
});

register('COL+', (s) => {
  const [M, vec, idx] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!isVector(vec)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'COL+');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (vec.items.length !== m) throw new RPLError('Invalid dimension');
  if (n < 1 || n > cols + 1) throw new RPLError('Invalid dimension');
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = M.rows[i].slice();
    row.splice(n - 1, 0, vec.items[i]);
    out.push(row);
  }
  s.push(Matrix(out));
});

register('COL-', (s) => {
  const [M, idx] = s.popN(2);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'COL-');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (n < 1 || n > cols) throw new RPLError('Invalid dimension');
  const rows = [];
  const removedCol = [];
  for (let i = 0; i < m; i++) {
    const row = M.rows[i].slice();
    removedCol.push(row[n - 1]);
    row.splice(n - 1, 1);
    rows.push(row);
  }
  s.push(Matrix(rows));
  s.push(Vector(removedCol));
});

/* --------------- CNRM / RNRM — column / row max-sum norms -----------
   HP50 AUR §15.4.

   CNRM  (column norm): max over columns of the sum of absolute values
         of the column's entries.  Matrix input: max_j Σ_i |A[i][j]|.
         Vector input: sum of |entries| (equivalent to treating the
         Vector as a column matrix).  Standard "1-norm" of a matrix.

   RNRM  (row norm):   max over rows of the sum of absolute values of
         the row's entries.  Matrix input: max_i Σ_j |A[i][j]|.
         Vector input: max of |entries| (equivalent to treating the
         Vector as a row matrix).  Standard "∞-norm" of a matrix.

   Entry type policy: Real / Integer / Complex.  Symbolic entries
   throw Bad argument type (no magnitude function for arbitrary
   Symbolic expressions this cheap; lift is a CAS job).  Same policy
   as NORM.
   ----------------------------------------------------------------- */

function _magEntry(x) {
  // |x| for a numeric matrix/vector cell.  Throws Bad argument type
  // on Symbolic / other non-numeric.
  if (isReal(x)) return x.value.abs().toNumber();
  if (isInteger(x)) { const n = x.value; return Number(n < 0n ? -n : n); }
  if (isComplex(x)) return Math.hypot(x.re, x.im);
  throw new RPLError('Bad argument type');
}

register('CNRM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Sum of |entries| — treat vector as a column.
    let sum = 0;
    for (const x of v.items) sum += _magEntry(x);
    s.push(Real(sum));
    return;
  }
  if (isMatrix(v)) {
    const m = v.rows.length;
    if (m === 0) { s.push(Real(0)); return; }
    const cols = v.rows[0].length;
    let best = 0;
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let i = 0; i < m; i++) sum += _magEntry(v.rows[i][j]);
      if (sum > best) best = sum;
    }
    s.push(Real(best));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('RNRM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Max of |entries| — treat vector as a row.
    let best = 0;
    for (const x of v.items) {
      const mag = _magEntry(x);
      if (mag > best) best = mag;
    }
    s.push(Real(best));
    return;
  }
  if (isMatrix(v)) {
    const m = v.rows.length;
    if (m === 0) { s.push(Real(0)); return; }
    let best = 0;
    for (const row of v.rows) {
      let sum = 0;
      for (const x of row) sum += _magEntry(x);
      if (sum > best) best = sum;
    }
    s.push(Real(best));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- AUGMENT — horizontal concat ------------------------
   HP50 AUR §15.3.  Concatenate two matrices or a matrix + vector
   horizontally (along the column axis).

   Signatures:
     ( M_a M_b       →  M  )   Matrix + Matrix (same row count)
                                → m × (p_a + p_b) matrix
     ( M v           →  M  )   Matrix + Vector  (len v = row count)
                                → append v as a new column
     ( v M           →  M  )   Vector + Matrix  (HP50 symmetry)
                                → prepend v as a new column
     ( v_a v_b       →  v  )   Vector + Vector  — HP50 AUR also
                                documents this; concatenates entries.

   Mismatched row count → Invalid dimension.  Other type combos →
   Bad argument type.
   ----------------------------------------------------------------- */

register('AUGMENT', (s) => {
  const [a, b] = s.popN(2);
  // Matrix + Matrix: same row count → concat columns.
  if (isMatrix(a) && isMatrix(b)) {
    const ma = a.rows.length;
    const mb = b.rows.length;
    if (ma !== mb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      rows.push([...a.rows[i], ...b.rows[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Matrix + Vector: vector length = row count → append as column.
  if (isMatrix(a) && isVector(b)) {
    const ma = a.rows.length;
    if (b.items.length !== ma) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      rows.push([...a.rows[i], b.items[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Vector + Matrix: vector length = row count → prepend as column.
  if (isVector(a) && isMatrix(b)) {
    const mb = b.rows.length;
    if (a.items.length !== mb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < mb; i++) {
      rows.push([a.items[i], ...b.rows[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Vector + Vector: concat entries.
  if (isVector(a) && isVector(b)) {
    s.push(Vector([...a.items, ...b.items]));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- RAND / RDZ — seeded PRNG ---------------------------
   HP50 AUR §17.5.

   RAND  ( → r )   Push a uniform Real in [0, 1) drawn from the PRNG
                   (Park-Miller minimal-standard LCG; see state.js).

   RDZ   ( n → )   Re-seed the PRNG.  n = 0 → use the system clock
                   (Date.now()), otherwise use n as the seed (reduced
                   into the LCG's valid range).  Takes Integer or
                   Real (integer-valued).  Complex / Symbolic throws.

   The PRNG state is shared with RANM so `RDZ 12345 { 2 3 } RANM`
   produces a deterministic matrix every time the same seed is used —
   matching HP50 behaviour.
   ----------------------------------------------------------------- */

register('RAND', (s) => {
  s.push(Real(nextPrngUnit()));
});

register('RDZ', (s) => {
  const [v] = s.popN(1);
  if (isInteger(v)) { seedPrng(v.value); return; }
  if (isReal(v)) {
    // HP50 accepts any Real; we require integer-valued to avoid
    // silently losing the fractional part.
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    seedPrng(v.value.toNumber());
    return;
  }
  throw new RPLError('Bad argument type');
});

/* =================================================================
   ROW→ / →ROW / COL→ / →COL (matrix decompose / compose by row or by
   column), RSWP / CSWP (swap rows / columns), RCI / RCIJ (elementary
   row ops — multiply a row by a constant; add c*row_i to row_j).
   All items user-reachable from the typed catalog today.  No UI
   wiring changes.

   Advanced Guide refs:
     §15.3  (ROW→ / →ROW / COL→ / →COL — matrix explode / assemble by
             row / column vectors)
     §15.3  (RSWP / CSWP / RCI / RCIJ — elementary row/column ops —
             complement to ROW+ / ROW- / COL+ / COL-)

   Shape and index conventions reuse the `_indexAsInt` helper (accepts
   Integer or integer-valued Real; throws Bad argument type on anything
   else).  The ROW+ / ROW- family always represents matrix rows/cols as
   a Vector when pushed to the stack — these ops follow the same
   convention so `ROW+ ROW→` and `ROW→ →ROW` round-trip exactly.
   ================================================================= */

/* --------------- ROW→ / →ROW / COL→ / →COL --------------------------
   HP50 AUR §15.3.  Decompose / compose a Matrix into / from its rows
   or columns as Vectors.

   ROW→  ( M → v_1 v_2 ... v_m m )
         Explodes M into m row Vectors pushed deepest-row-first,
         followed by the row count m as a Real on top (matches the
         trailing-count pattern ARRY→ uses).

   →ROW  ( v_1 v_2 ... v_m m → M )
         Inverse: pops m, then pops m Vectors (all same length),
         assembles them as the rows of M.  ASCII alias `->ROW`.

   COL→  ( M → v_1 v_2 ... v_n n )
         Explodes M into n column Vectors, count on top.

   →COL  ( v_1 v_2 ... v_n n → M )
         Inverse: pops n, then pops n Vectors (all same length),
         treats each Vector as a column of M.

   Unicode + ASCII aliases register side-by-side (ROW→ / ROW->, etc.).
   Element polymorphism: these are pure container manipulations — no
   arithmetic on entries, so Real / Integer / Complex / Symbolic cell
   values pass through unchanged.
   ----------------------------------------------------------------- */

const _rowDecompose = (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  for (const row of M.rows) s.push(Vector(row.slice()));
  s.push(Real(M.rows.length));
};
register('ROW→',  _rowDecompose);
register('ROW->', _rowDecompose);

const _rowCompose = (s) => {
  const [countVal] = s.popN(1);
  const m = _indexAsInt(countVal, '→ROW');
  if (m < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(m);
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const cols = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== cols) throw new RPLError('Invalid dimension');
  }
  const rows = vecs.map(v => v.items.slice());
  s.push(Matrix(rows));
};
register('→ROW',  _rowCompose);
register('->ROW', _rowCompose);

const _colDecompose = (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  for (let j = 0; j < cols; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = M.rows[i][j];
    s.push(Vector(col));
  }
  s.push(Real(cols));
};
register('COL→',  _colDecompose);
register('COL->', _colDecompose);

const _colCompose = (s) => {
  const [countVal] = s.popN(1);
  const n = _indexAsInt(countVal, '→COL');
  if (n < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(n);
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const rows = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== rows) throw new RPLError('Invalid dimension');
  }
  // Build m×n matrix whose column j is vecs[j].
  const out = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = vecs[j].items[i];
    out.push(row);
  }
  s.push(Matrix(out));
};
register('→COL',  _colCompose);
register('->COL', _colCompose);

/* --------------- RSWP / CSWP / RCI / RCIJ --------------------------
   HP50 AUR §15.3.  Elementary row / column operations.  These are the
   "Gauss-Jordan by hand" primitives: swap two rows, swap two columns,
   scale a row by a constant, or add a scalar multiple of one row to
   another.

   RSWP  ( M i j → M' )   Swap rows i and j (1-based).
   CSWP  ( M i j → M' )   Swap columns i and j.
   RCI   ( M c i → M' )   Replace row i with c * row i (scalar c).
   RCIJ  ( M c i j → M' ) Replace row j with row j + c * row i.

   Index ranges are validated against m (rows) or n (cols); out-of-range
   throws Invalid dimension.  Non-integer or non-numeric indices throw
   Bad argument type via `_indexAsInt`.  The scalar c in RCI / RCIJ can
   be any scalar operand (Real, Integer, Complex, BinaryInteger, or
   Symbolic / Name) — `_scalarBinary('*' / '+', ...)` handles the
   promotion / symbolic-lift uniformly, same as the existing arithmetic
   ops on Matrix entries do.
   ----------------------------------------------------------------- */

register('RSWP', (s) => {
  const [M, iv, jv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RSWP');
  const j = _indexAsInt(jv, 'RSWP');
  const m = M.rows.length;
  if (i < 1 || i > m || j < 1 || j > m) {
    throw new RPLError('Invalid dimension');
  }
  const rows = M.rows.map(r => r.slice());
  if (i !== j) {
    const tmp = rows[i - 1]; rows[i - 1] = rows[j - 1]; rows[j - 1] = tmp;
  }
  s.push(Matrix(rows));
});

register('CSWP', (s) => {
  const [M, iv, jv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'CSWP');
  const j = _indexAsInt(jv, 'CSWP');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (i < 1 || i > cols || j < 1 || j > cols) {
    throw new RPLError('Invalid dimension');
  }
  const rows = M.rows.map(r => r.slice());
  if (i !== j) {
    for (let k = 0; k < m; k++) {
      const t = rows[k][i - 1]; rows[k][i - 1] = rows[k][j - 1]; rows[k][j - 1] = t;
    }
  }
  s.push(Matrix(rows));
});

register('RCI', (s) => {
  const [M, c, iv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!_isScalarOperand(c)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RCI');
  const m = M.rows.length;
  if (i < 1 || i > m) throw new RPLError('Invalid dimension');
  const rows = M.rows.map(r => r.slice());
  const target = rows[i - 1];
  for (let k = 0; k < target.length; k++) {
    target[k] = _scalarBinary('*', c, target[k]);
  }
  s.push(Matrix(rows));
});

register('RCIJ', (s) => {
  const [M, c, iv, jv] = s.popN(4);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!_isScalarOperand(c)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RCIJ');
  const j = _indexAsInt(jv, 'RCIJ');
  const m = M.rows.length;
  if (i < 1 || i > m || j < 1 || j > m) {
    throw new RPLError('Invalid dimension');
  }
  // HP50 accepts i === j (becomes "scale row_i by (1+c)") — we follow
  // suit.  The copy below uses the ORIGINAL i-row values, so the self-
  // add case `row_i + c*row_i` still reads from the pre-update row
  // even though src and dst alias the same row.
  const origSrc = M.rows[i - 1].slice();
  const rows = M.rows.map(r => r.slice());
  const dst = rows[j - 1];
  for (let k = 0; k < dst.length; k++) {
    const scaled = _scalarBinary('*', c, origSrc[k]);
    dst[k] = _scalarBinary('+', dst[k], scaled);
  }
  s.push(Matrix(rows));
});

/* =================================================================
   Stats (MEAN / SDEV / VAR / TOT), test-matrix constructors
   (VANDERMONDE / HILBERT), π-rationalization (→Qπ), list iterators
   (GETI / PUTI).  All user-reachable today from the typed catalog;
   no UI wiring needed.

   Advanced Guide refs:
     §18    (MEAN / SDEV / VAR / TOT — stat reductions on a
             Vector / Matrix that stands in for ΣDAT.  Matrix input
             reduces COLUMN-WISE — each column is one variable,
             each row is one observation — and the result is a
             Vector of per-column stats.  Vector input is the
             single-variable special case: the result is a scalar.)
     §15.6  (VANDERMONDE / HILBERT — canonical "test matrices" used
             for interpolation and ill-conditioning demos.)
     §12.4  (→Qπ — rationalize a Real as a rational multiple of π.
             Mirror of →Q, but tries to detect the π factor first.)
     §13.2  (GETI / PUTI — GET / PUT with auto-increment.  The
             index advances and wraps to 1 when the end is reached —
             the classic HP "each consecutive call walks through the
             container" idiom that makes DOSUBS-style loops trivial.)
   ================================================================= */

/* --------------- MEAN / SDEV / VAR / TOT — stat reductions -----------
   HP50 AUR §18.  Scalar statistics over a Vector (single-variable
   sample) or Matrix (each column is a variable, rows are
   observations → per-column Vector of stats).

     TOT   ( V → s )     sum of elements
     MEAN  ( V → s )     arithmetic mean
     VAR   ( V → s )     sample variance (Bessel n-1 denominator)
     SDEV  ( V → s )     sqrt(VAR)

     TOT   ( M → v )     column sums  (1×n Vector)
     MEAN  ( M → v )     per-column means
     VAR   ( M → v )     per-column sample variances
     SDEV  ( M → v )     per-column sample SDs

   Type policy:
     - TOT / MEAN accept Real / Integer / Complex entries.  Vector of
       Complex returns a Complex scalar (sum / mean of imaginary and
       real parts independently).
     - VAR / SDEV accept Real / Integer entries only.  Complex raises
       Bad argument type (HP50 SDEV-on-complex is not meaningfully
       defined without choosing a conjugate-pair convention, so we
       punt until the CAS side wants it).
     - Symbolic / Name / BinaryInteger entries in any path throw
       Bad argument type (same policy as CNRM / RNRM / NORM).
     - Empty Vector ⇒ Bad argument value (no data to reduce).

   Single-observation samples: VAR / SDEV on a length-1 Vector return
   0 (matches HP50 AUR §18.1, which defines SDEV of a 1-row ΣDAT as
   zero rather than "undefined").
   ----------------------------------------------------------------- */

function _statsNumericEntry(x) {
  if (isReal(x))    return x.value.toNumber();
  if (isInteger(x)) return Number(x.value);
  throw new RPLError('Bad argument type');
}

function _statsNumOrComplexEntry(x) {
  if (isReal(x))    return { re: x.value.toNumber(), im: 0, complex: false };
  if (isInteger(x)) return { re: Number(x.value), im: 0, complex: false };
  if (isComplex(x)) return { re: x.re, im: x.im, complex: true };
  throw new RPLError('Bad argument type');
}

function _wrapComplexOrReal(re, im, sawComplex) {
  if (sawComplex && im !== 0) return Complex(re, im);
  if (sawComplex) return Complex(re, 0);
  return Real(re);
}

/** Sum of a 1-D numeric array (Vector entries).  Returns Real or
 *  Complex as appropriate.  Throws Bad argument type on non-numeric. */
function _sumItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  let re = 0, im = 0, sawComplex = false;
  for (const x of items) {
    const p = _statsNumOrComplexEntry(x);
    re += p.re; im += p.im;
    if (p.complex) sawComplex = true;
  }
  return _wrapComplexOrReal(re, im, sawComplex);
}

/** Arithmetic mean over items.  Returns Real / Complex. */
function _meanItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  let re = 0, im = 0, sawComplex = false;
  for (const x of items) {
    const p = _statsNumOrComplexEntry(x);
    re += p.re; im += p.im;
    if (p.complex) sawComplex = true;
  }
  const n = items.length;
  return _wrapComplexOrReal(re / n, im / n, sawComplex);
}

/** Sample variance over items.  Bessel correction: divide by n-1.
 *  n==1 returns 0.  Real / Integer entries only. */
function _varItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  if (items.length === 1) {
    // Validate the entry still — a single Complex would otherwise
    // pass silently.
    _statsNumericEntry(items[0]);
    return 0;
  }
  let sum = 0;
  const vals = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const x = _statsNumericEntry(items[i]);
    vals[i] = x; sum += x;
  }
  const mean = sum / items.length;
  let ss = 0;
  for (const x of vals) {
    const d = x - mean;
    ss += d * d;
  }
  return ss / (items.length - 1);
}

function _sdevItems(items) {
  return Math.sqrt(_varItems(items));
}

/** Apply a per-column reducer to a Matrix.  `reduce(entries)` returns
 *  a plain scalar or RPL value.  If `wrap` is given, it wraps each
 *  reducer output (so Real-only reducers stay Real).  Result is a
 *  Vector of length n (one entry per column). */
function _perColumn(M, reduceItems, wrap) {
  const m = M.rows.length;
  if (m === 0) throw new RPLError('Bad argument value');
  const n = M.rows[0].length;
  const out = new Array(n);
  for (let j = 0; j < n; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = M.rows[i][j];
    const r = reduceItems(col);
    out[j] = wrap ? wrap(r) : r;
  }
  return Vector(out);
}

register('TOT', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(_sumItems(v.items)); return; }
  if (isMatrix(v)) {
    // Column sums — reducer returns an RPL value already.
    s.push(_perColumn(v, (col) => _sumItems(col)));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('MEAN', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(_meanItems(v.items)); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _meanItems(col)));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('VAR', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_varItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _varItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('SDEV', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_sdevItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _sdevItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- VANDERMONDE / HILBERT — test matrices ---------------
   HP50 AUR §15.6.  Canonical constructors for classical test
   matrices — primarily used for polynomial-interpolation problems
   and as demonstrations of ill-conditioning.

     VANDERMONDE  ( L → M )   L = {v₁ v₂ … vₙ} of n numeric values.
                              Returns the n×n matrix whose (i, j)
                              entry is  vᵢ^(j-1)  (so column 1 is
                              all ones; column 2 is the values
                              themselves; column 3 is their squares;
                              etc.).  HP50 also accepts Vector input.
     HILBERT      ( n → M )   Integer n ≥ 1.  Returns the n×n Hilbert
                              matrix with H[i][j] = 1/(i+j-1)
                              (1-based indexing).  Notoriously
                              ill-conditioned beyond n ≈ 11; we
                              still accept arbitrary n but emit
                              IEEE-rounded entries past that point.

   Entry-type policy: VANDERMONDE tolerates Real / Integer / Complex /
   Symbolic values in the source list — powers are computed through
   `_scalarBinary('*')` so any type flows through (Symbolic inputs
   produce a Symbolic-entry matrix, e.g. `{ X Y Z } VANDERMONDE` →
   [[1 X X²][1 Y Y²][1 Z Z²]]).  HILBERT always produces Real
   entries — the inverse is expressed as decimal fractions rather
   than rationals.
   ----------------------------------------------------------------- */

register('VANDERMONDE', (s) => {
  const [v] = s.popN(1);
  let src;
  if (isList(v))        src = v.items;
  else if (isVector(v)) src = v.items;
  else throw new RPLError('Bad argument type');
  const n = src.length;
  if (n < 1) throw new RPLError('Bad argument value');
  for (const x of src) {
    // Sanity-check the type up front so a bad entry near the end
    // doesn't leave a half-built matrix on the stack.
    if (!isReal(x) && !isInteger(x) && !isComplex(x) && !_isSymOperand(x)) {
      throw new RPLError('Bad argument type');
    }
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const vi = src[i];
    const row = new Array(n);
    // Column j has entry vi^(j-1).  Running multiplier avoids repeated
    // `^` ops and keeps Integer entries as Integers when possible
    // (since `_scalarBinary('*', Integer, Integer)` stays Integer).
    let acc = Integer(1n);
    for (let j = 0; j < n; j++) {
      row[j] = acc;
      if (j < n - 1) acc = _scalarBinary('*', acc, vi);
    }
    rows.push(row);
  }
  s.push(Matrix(rows));
});

register('HILBERT', (s) => {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v)) n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else throw new RPLError('Bad argument type');
  if (n < 1) throw new RPLError('Bad argument value');
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const row = new Array(n);
    for (let j = 1; j <= n; j++) {
      row[j - 1] = Real(1 / (i + j - 1));
    }
    rows.push(row);
  }
  s.push(Matrix(rows));
});

/* --------------- →Qπ — rationalize as rational multiple of π ---------
   HP50 AUR §12.4.  Extension of →Q that tries to recognize a π factor
   in the input before rationalizing.  The quotient `x / π` is run
   through the same continued-fraction convergent as →Q; if it
   rationalizes to a reasonable p/d, the result is wrapped in a
   Symbolic multiplication by PI.

   Representation:
     numerator n = ±1, denominator 1:  ±π    →  Symbolic Var('PI')
                                                (or Neg of it)
     n = ±1, d > 1:                    ±π/d  →  PI / d
     |n| > 1, d = 1:                   ±n·π  →  n * PI
     |n| > 1, d > 1:                   ±n·π/d → (n * PI) / d
     n = 0:                            0      →  Symbolic Num(0)

   If the quotient doesn't rationalize cleanly (i.e. the continued
   fraction runs out before converging), we still emit the best
   p/d * π form — convergents are always rational.  Input must be a
   Real / Integer; Complex / Symbolic throws Bad argument type.
   ----------------------------------------------------------------- */

function _piSymbolic(n, d) {
  // Build the Symbolic AST for the rational multiple n/d of π.
  // Caller guarantees d ≥ 1 and sign is NOT reflected in n (always
  // positive numerator).  Returns an AST node ready for Symbolic().
  const PI = AstVar('PI');
  let core;
  if (n === 1) core = PI;
  else core = AstBin('*', AstNum(n), PI);
  if (d === 1) return core;
  return AstBin('/', core, AstNum(d));
}

register('→Qπ', (s) => {
  const [v] = s.popN(1);
  let x;
  if (isInteger(v)) x = Number(v.value);
  else if (isReal(v)) x = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  const sign = x < 0 ? -1 : 1;
  const q = Math.abs(x) / Math.PI;
  const { n, d } = _continuedFractionConvergent(q);
  if (n === 0) {
    // Couldn't find any rational multiple of π close enough — fall back
    // to →Q semantics on the Real input.
    if (Number.isInteger(x)) { s.push(Symbolic(AstNum(x))); return; }
    const r = _continuedFractionConvergent(x);
    if (r.d === 1) { s.push(Symbolic(AstNum(r.n))); return; }
    if (r.n < 0) {
      s.push(Symbolic(AstNeg(AstBin('/', AstNum(-r.n), AstNum(r.d)))));
    } else {
      s.push(Symbolic(AstBin('/', AstNum(r.n), AstNum(r.d))));
    }
    return;
  }
  const core = _piSymbolic(n, d);
  if (sign < 0) {
    s.push(Symbolic(AstNeg(core)));
  } else {
    s.push(Symbolic(core));
  }
});
register('->Qπ', (s) => { lookup('→Qπ').fn(s); });

/* --------------- GETI / PUTI — auto-incrementing GET / PUT -----------
   HP50 AUR §13.2.  Like GET / PUT but leave the container on the
   stack and produce the (wrapping) next index — the classic "walk
   through a list element-by-element inside a loop" primitive.

     GETI  ( L i → L i+1 elt )
             Pops a container and a 1-based index; pushes back the
             container, the NEXT index (wrapping to 1 after the end),
             and the element at the ORIGINAL index.

     PUTI  ( L i val → L' i+1 )
             Like PUT but returns the incremented index on top instead
             of the replaced container alone.  Wrapping matches GETI.

   Wrapping rule: when the original index is the last valid slot, the
   next index wraps to 1 (HP50 behavior — lets `« GETI » DUPx` loops
   cycle forever; a user wanting a bounded walk pairs GETI with a
   size check).  The container pushed back is unchanged for GETI; for
   PUTI it's the patched container.

   Supported container types:
     - GETI: List, Vector, Matrix ({r c}), String.  Matrix indexing
       advances column-major: (r, c) → (r, c+1); wrapping c → 1 also
       advances r (and wrapping r → 1 when past the last row).
     - PUTI: List, Vector, Matrix.  String PUTI isn't defined by HP50
       (strings are immutable one-char-at-a-time here); throws.
   ----------------------------------------------------------------- */

function _advance1DIndex(idx, length) {
  // 1-based wrap.  Caller has already validated idx ∈ [1, length].
  return idx >= length ? 1 : idx + 1;
}

function _advanceMatrixIndex(r, c, rows, cols) {
  // Column-major advance so GETI walks a row before dropping down.
  if (c < cols) return { r, c: c + 1 };
  if (r < rows) return { r: r + 1, c: 1 };
  return { r: 1, c: 1 };                  // full wrap
}

register('GETI', (s) => {
  const [coll, idx] = s.popN(2);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(coll.items[n - 1]);
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(coll.items[n - 1]);
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const rows = coll.rows.length;
    const cols = rows > 0 ? coll.rows[0].length : 0;
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r < 1 || r > rows || c < 1 || c > cols) {
      throw new RPLError('Bad argument value');
    }
    const nxt = _advanceMatrixIndex(r, c, rows, cols);
    s.push(coll);
    s.push(RList([Integer(BigInt(nxt.r)), Integer(BigInt(nxt.c))]));
    s.push(coll.rows[r - 1][c - 1]);
    return;
  }
  if (isString(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.value.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.value.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(Str(coll.value[n - 1]));
    return;
  }
  throw new RPLError('Bad argument type');
});

register('PUTI', (s) => {
  const [coll, idx, val] = s.popN(3);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(RList(items));
    s.push(Integer(BigInt(nxt)));
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(Vector(items));
    s.push(Integer(BigInt(nxt)));
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const rows = coll.rows.length;
    const cols = rows > 0 ? coll.rows[0].length : 0;
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r < 1 || r > rows || c < 1 || c > cols) {
      throw new RPLError('Bad argument value');
    }
    const newRows = coll.rows.map((ri, i) => {
      if (i !== r - 1) return ri;
      const copy = [...ri];
      copy[c - 1] = val;
      return copy;
    });
    const nxt = _advanceMatrixIndex(r, c, rows, cols);
    s.push(Matrix(newRows));
    s.push(RList([Integer(BigInt(nxt.r)), Integer(BigInt(nxt.c))]));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* =================================================================
   Mixed cluster drawn from §11 (CAS number-theory), §13 (List),
   §16 (Types & Tags), §19 (Statistics), §9 (Display), and §8
   (Error/Debug):

     §11 CAS: ISPRIME? / NEXTPRIME / PREVPRIME; EULER; DIVIS / FACTORS;
              IBERNOULLI; IEGCD; ICHINREM / IABCUV;
              HORNER; PCOEF / FCOEF.
     §13 Lists: APPEND.
     §16 Types: →TAG / DTAG / VTYPE / KIND / UNDER.
     §19 Stats: MEDIAN; CORR / COV.
     §9  Display: STD / FIX / SCI / ENG.
     §8  Errors: DOERR.

   All ops are user-reachable from the typed catalog today.  The
   display-mode quartet (STD/FIX/SCI/ENG) updates `state.display*`
   fields that tests assert on via `→STR`; wiring them into the live
   LCD render is a future UI task.
   ================================================================= */

/* --------------- Number-theoretic helpers (integer land) -----------
   All the primality / totient / divisor ops work over BigInt so
   HP50-size integers (64+ bits) round-trip cleanly.  Small-n paths
   use BigInt math anyway — the constants below avoid a Number
   coercion for readability. */

const _ZERO = 0n;
const _ONE  = 1n;
const _TWO  = 2n;

/** Modular exponentiation a^e mod m on BigInt. */
function _powModBig(a, e, m) {
  if (m === _ONE) return _ZERO;
  let r = _ONE;
  a = ((a % m) + m) % m;
  while (e > _ZERO) {
    if (e & _ONE) r = (r * a) % m;
    e >>= _ONE;
    a = (a * a) % m;
  }
  return r;
}

/** Deterministic Miller-Rabin primality for BigInt n.  The witness
 *  set {2,3,5,7,11,13,17,19,23,29,31,37} is sufficient for all
 *  n < 3.3 × 10^24 — well past HP50 64-bit range.  Returns boolean. */
function _isPrimeBig(n) {
  if (n < _TWO) return false;
  // Small-prime sieve for speed.
  const small = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  for (const p of small) {
    if (n === p) return true;
    if (n % p === _ZERO) return false;
  }
  // Write n-1 = 2^s * d with d odd.
  let d = n - _ONE, s = 0n;
  while ((d & _ONE) === _ZERO) { d >>= _ONE; s += _ONE; }
  const witnesses = small;
  outer:
  for (const a of witnesses) {
    if (a >= n) continue;
    let x = _powModBig(a, d, n);
    if (x === _ONE || x === n - _ONE) continue;
    for (let r = _ONE; r < s; r++) {
      x = (x * x) % n;
      if (x === n - _ONE) continue outer;
    }
    return false;
  }
  return true;
}

/** Next prime strictly greater than n.  n may be any BigInt. */
function _nextPrimeBig(n) {
  if (n < _TWO) return _TWO;
  let c = n + _ONE;
  if (c === _TWO) return _TWO;
  if ((c & _ONE) === _ZERO) c += _ONE;           // skip to odd
  while (!_isPrimeBig(c)) c += _TWO;
  return c;
}

/** Previous prime strictly less than n.  Returns null if none exists
 *  (i.e. n ≤ 2).  Callers should raise Bad argument value in that case. */
function _prevPrimeBig(n) {
  if (n <= _TWO) return null;
  if (n === 3n) return _TWO;
  let c = n - _ONE;
  if ((c & _ONE) === _ZERO) c -= _ONE;           // skip to odd
  if (c < 3n) return _TWO;
  while (c >= 3n && !_isPrimeBig(c)) c -= _TWO;
  return c < _TWO ? _TWO : c;
}

/** Trial-division factorization of a positive BigInt.  Returns an
 *  Array of [prime, exponent] BigInt pairs, sorted ascending by prime.
 *  1n returns an empty array; 0n is rejected upstream.  Uses a
 *  2-3-5 wheel step which is good enough for HP50 integers; numbers
 *  above ~2^50 with a large prime factor will be slow but will still
 *  terminate. */
function _factorIntBig(n) {
  if (n <= _ZERO) throw new RPLError('Bad argument value');
  const out = [];
  // Strip small primes (2, 3, 5) first.
  for (const p of [_TWO, 3n, 5n]) {
    if (n < p * p) break;
    let k = _ZERO;
    while (n % p === _ZERO) { n /= p; k++; }
    if (k > _ZERO) out.push([p, k]);
  }
  // Wheel of {7,11,13,17,19,23,29,31} then +30 increments.
  const wheelAdds = [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n];
  let p = 7n, w = 0;
  while (p * p <= n) {
    let k = _ZERO;
    while (n % p === _ZERO) { n /= p; k++; }
    if (k > _ZERO) out.push([p, k]);
    p += wheelAdds[w % 8];
    w++;
  }
  if (n > _ONE) out.push([n, _ONE]);
  return out;
}

/** Divisor list for positive BigInt n, in ascending order.  Built
 *  via prime factorization + expansion. */
function _divisorsBig(n) {
  if (n <= _ZERO) throw new RPLError('Bad argument value');
  if (n === _ONE) return [_ONE];
  const fs = _factorIntBig(n);
  let divs = [_ONE];
  for (const [p, e] of fs) {
    const next = [];
    let pk = _ONE;
    for (let k = _ZERO; k <= e; k++) {
      for (const d of divs) next.push(d * pk);
      pk *= p;
    }
    divs = next;
  }
  divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return divs;
}

/** Euler's totient φ(n) via prime factorization.  φ(1) = 1. */
function _eulerBig(n) {
  if (n <= _ZERO) throw new RPLError('Bad argument value');
  if (n === _ONE) return _ONE;
  const fs = _factorIntBig(n);
  let phi = n;
  for (const [p] of fs) phi = phi / p * (p - _ONE);
  return phi;
}

/** Extended GCD on BigInt.  Returns { g, u, v } with u*a + v*b = g.
 *  g is non-negative; when a = b = 0, g = 0 and u = v = 0 (HP50's
 *  IEGCD-on-zero-zero convention). */
function _extGcdBig(a, b) {
  let old_r = a < _ZERO ? -a : a;
  let r     = b < _ZERO ? -b : b;
  let old_s = _ONE, s = _ZERO;
  let old_t = _ZERO, t = _ONE;
  while (r !== _ZERO) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
    [old_t, t] = [t, old_t - q * t];
  }
  // Flip signs to reflect original a / b signs — since we negated
  // abs values on the way in, positive old_s / old_t map to the
  // sign of the original operand.
  if (a < _ZERO) old_s = -old_s;
  if (b < _ZERO) old_t = -old_t;
  return { g: old_r, u: old_s, v: old_t };
}

/** Coerce an RPL value to a BigInt or throw.  Accepts Integer and
 *  integer-valued Real (no fractional part).  Rejects Complex /
 *  BinaryInteger / Symbolic — callers pick the policy. */
function _toBigIntStrict(v) {
  if (isInteger(v)) return v.value;
  if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    return BigInt(v.value.toFixed(0));
  }
  throw new RPLError('Bad argument type');
}

/* --------------- ISPRIME? / NEXTPRIME / PREVPRIME --------------------
   HP50 AUR §12.6.  Primality predicate plus walk-forward / walk-back
   to the nearest prime.

     ISPRIME?  ( n → b )    b = TRUE (Real 1) or FALSE (Real 0)
     NEXTPRIME ( n → p )    smallest prime p > n
     PREVPRIME ( n → p )    largest prime p < n; n ≤ 2 → Bad argument value

   Inputs accepted: Integer, integer-valued Real.  Complex /
   BinaryInteger / Symbolic throw Bad argument type.  Negative input
   for ISPRIME? returns FALSE (primes are positive); NEXTPRIME on a
   negative input returns 2.  PREVPRIME on n ≤ 2 throws (no prime
   below 2).
   ----------------------------------------------------------------- */

register('ISPRIME?', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  s.push(_isPrimeBig(n) ? TRUE : FALSE);
});

register('NEXTPRIME', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  const p = _nextPrimeBig(n);
  s.push(Integer(p));
});

register('PREVPRIME', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  const p = _prevPrimeBig(n);
  if (p === null) throw new RPLError('Bad argument value');
  s.push(Integer(p));
});

/* --------------- PA2B2 — prime as sum of two squares -----------------
   HP50 AUR §3-162.  Takes a prime p with p = 2 or p ≡ 1 (mod 4) and
   returns a Gaussian integer a + ib such that p = a² + b².  For p = 2
   the unique (up to units) decomposition is 1 + i.  For p ≡ 1 (mod 4)
   the decomposition exists and is unique up to order/sign — Fermat's
   theorem on sums of two squares.

     PA2B2  ( Z → C )    Integer or integer-valued Real input;
                         output is a native Complex (Gaussian integer).

   Rejects with Bad argument value when p is not prime, p = 3 (prime
   but ≡ 3 mod 4 cannot be written as a² + b² — Fermat), or p is any
   prime with p mod 4 = 3.  Rejects with Bad argument type for non-
   integer inputs.

   Algorithm — Cornacchia (classical).  For p ≡ 1 (mod 4), −1 is a
   quadratic residue, so we can find r with r² ≡ −1 (mod p):
     1. Find a quadratic non-residue z: z^((p−1)/2) ≡ −1 (mod p).
        For random z this succeeds in ~2 tries on average; we scan
        z = 2, 3, 4, ... which always terminates (there are (p−1)/2
        QNRs).
     2. Set r = z^((p−1)/4) (mod p); then r² = z^((p−1)/2) ≡ −1.
     3. Euclidean reduction: start (a, b) = (p, r) and iterate
        (a, b) ← (b, a mod b) until b ≤ ⌊√p⌋.  The resulting b
        satisfies b² + c² = p where c = ⌊√(p − b²)⌋.

   Output convention: we emit Complex(min(b, c), max(b, c)) so the
   result is deterministic (small real part, larger imaginary part).
   BigInt values are coerced to Number at the boundary — Complex
   stores doubles; for primes up to ~2^106 both components fit in a
   53-bit mantissa.  ----------------------------------------------- */

/** floor(√n) for non-negative BigInt n.  Pairs with `_bigIntIsqrt`
 *  (which returns null when n is not a perfect square) for callers
 *  that need the floor regardless.  Newton iteration — terminates
 *  when the sequence stops decreasing. */
function _bigIntSqrtFloor(n) {
  if (n < 0n) throw new RPLError('Bad argument value');
  if (n < 2n) return n;
  let x = 1n;
  const bits = n.toString(2).length;
  x <<= BigInt((bits + 1) >> 1);
  let prev;
  do {
    prev = x;
    x = (x + n / x) >> 1n;
  } while (x < prev);
  return prev;
}

register('PA2B2', (s) => {
  const [v] = s.popN(1);
  const p = _toBigIntStrict(v);
  if (p < 2n) throw new RPLError('Bad argument value');
  if (!_isPrimeBig(p)) throw new RPLError('Bad argument value');
  if (p === 2n) {
    s.push(Complex(1, 1));
    return;
  }
  if (p % 4n !== 1n) throw new RPLError('Bad argument value');
  // Find quadratic non-residue z via Euler's criterion.
  const pm1 = p - 1n;
  const half = pm1 >> 1n;
  let z = 2n;
  while (_powModBig(z, half, p) !== pm1) z += 1n;
  // r² ≡ −1 (mod p)
  const r = _powModBig(z, pm1 >> 2n, p);
  const sp = _bigIntSqrtFloor(p);
  // Euclidean reduction of (p, r) until the second component ≤ √p.
  let a = p, b = r;
  while (b > sp) {
    const next = a % b;
    a = b;
    b = next;
  }
  const rem = p - b * b;
  const c = _bigIntSqrtFloor(rem);
  if (c * c !== rem) {
    // Should not happen for a valid prime ≡ 1 (mod 4); defensive.
    throw new RPLError('Bad argument value');
  }
  const re = c < b ? c : b;
  const im = c < b ? b : c;
  s.push(Complex(Number(re), Number(im)));
});

/* --------------- EULER — Euler's totient φ(n) ------------------------
   HP50 AUR §12.6.  Count of integers k in [1, n] with gcd(k, n) = 1.
   Built on top of prime factorization — trivial once _factorIntBig is
   around.

     EULER  ( n → φ(n) )    n ≥ 1.  Integer or integer-valued Real.
                             n = 1 returns 1 (by convention).
                             n ≤ 0 → Bad argument value.
   ----------------------------------------------------------------- */

register('EULER', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  const phi = _eulerBig(n);
  s.push(Integer(phi));
});

/* --------------- DIVIS / FACTORS — integer divisor / factoring -------
   HP50 AUR §12.6.

     DIVIS    ( n → L )    L is the ascending list of positive
                           divisors of |n|.  `DIVIS 12` = {1 2 3 4 6 12}.
                           n = 0 → Bad argument value.  n < 0 uses |n|
                           (HP50 returns divisors of absolute value).
     FACTORS  ( n → L )    L is a flat list {p₁ e₁ p₂ e₂ … pₖ eₖ} of
                           (prime, exponent) pairs.  `FACTORS 12` =
                           {2 2 3 1}.  n = 1 returns {}.
                           n ≤ 0 → Bad argument value.  The Symbolic/
                           polynomial form of FACTORS is deferred — this
                           is the integer-only path that's cheap today.
   ----------------------------------------------------------------- */

register('DIVIS', (s) => {
  const [v] = s.popN(1);
  const n0 = _toBigIntStrict(v);
  if (n0 === _ZERO) throw new RPLError('Bad argument value');
  const n = n0 < _ZERO ? -n0 : n0;
  const ds = _divisorsBig(n);
  s.push(RList(ds.map((d) => Integer(d))));
});

register('FACTORS', (s) => {
  const [v] = s.popN(1);
  const n0 = _toBigIntStrict(v);
  if (n0 <= _ZERO) throw new RPLError('Bad argument value');
  if (n0 === _ONE) { s.push(RList([])); return; }
  const fs = _factorIntBig(n0);
  const flat = [];
  for (const [p, e] of fs) {
    flat.push(Integer(p));
    flat.push(Integer(e));
  }
  s.push(RList(flat));
});

/* --------------- IBERNOULLI — Bernoulli number B(n) ------------------
   HP50 AUR §12.6.  Returns B_n as an exact rational Symbolic for n ≥ 0.
   Uses the Akiyama-Tanigawa algorithm with arbitrary-precision rational
   arithmetic (BigInt numerator / denominator).  Signs follow the
   B_1 = -1/2 convention (HP50 also uses -1/2, not +1/2).

     IBERNOULLI ( n → Sy )   n ≥ 0.  B_0 = 1, B_1 = -1/2, B_{2k+1} = 0
                             for k ≥ 1, B_{2k} is the nontrivial even-
                             indexed rational.  Large n becomes slow
                             (O(n²) time, O(n) rationals held at once).

   Output format: a Symbolic whose body is Num (integer-valued),
   Bin('/', n, d), or Neg thereof — matches how →Q renders small
   rationals, so `IBERNOULLI 6` prints as `'1/42'`.  No floating-point
   rounding, ever.
   ----------------------------------------------------------------- */

function _gcdBig(a, b) {
  a = a < _ZERO ? -a : a;
  b = b < _ZERO ? -b : b;
  while (b !== _ZERO) { const t = a % b; a = b; b = t; }
  return a;
}

function _ratNormalize(n, d) {
  if (d === _ZERO) throw new RPLError('Infinite result');
  if (d < _ZERO) { n = -n; d = -d; }
  const g = _gcdBig(n < _ZERO ? -n : n, d);
  return g === _ZERO ? [n, d] : [n / g, d / g];
}
function _ratSub(a, b) {
  return _ratNormalize(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
}
function _ratMul(a, b) {
  return _ratNormalize(a[0] * b[0], a[1] * b[1]);
}

/** Build a Symbolic AST from a [num, den] rational.  Uses Num(Number)
 *  which loses precision for numerators above 2^53 — good enough for
 *  small-index Bernoulli numbers but flagged for larger indices.
 *  Future work: extend the AST Num kind to carry a BigInt payload so
 *  `IBERNOULLI 30` = 8615841276005/14322 doesn't lose its tail. */
function _ratToSymbolic(n, d) {
  if (d === _ONE) return Symbolic(AstNum(Number(n)));
  if (n === _ZERO) return Symbolic(AstNum(0));
  if (n < _ZERO) {
    return Symbolic(AstNeg(AstBin('/', AstNum(Number(-n)), AstNum(Number(d)))));
  }
  return Symbolic(AstBin('/', AstNum(Number(n)), AstNum(Number(d))));
}

register('IBERNOULLI', (s) => {
  const [v] = s.popN(1);
  const nBig = _toBigIntStrict(v);
  if (nBig < _ZERO) throw new RPLError('Bad argument value');
  const n = Number(nBig);
  if (!Number.isSafeInteger(n) || n > 100) {
    // Hard cap — O(n²) rational work balloons past this.
    throw new RPLError('Bad argument value');
  }
  // Odd n ≥ 3 is zero.
  if (n >= 3 && (n & 1) === 1) { s.push(Symbolic(AstNum(0))); return; }
  // Akiyama-Tanigawa.  Work with an array of [num, den] pairs.
  const a = new Array(n + 1);
  for (let m = 0; m <= n; m++) {
    a[m] = [_ONE, BigInt(m + 1)];                // A[m] = 1/(m+1)
    for (let j = m; j >= 1; j--) {
      // A[j-1] = j * (A[j-1] - A[j])
      const diff = _ratSub(a[j - 1], a[j]);
      a[j - 1] = _ratMul([BigInt(j), _ONE], diff);
    }
  }
  // Akiyama-Tanigawa yields the "second" Bernoulli series B^+_n
  // (B^+_1 = +1/2).  HP50 and Knuth use the "first" series B^-_n
  // (B^-_1 = -1/2); for n = 1 flip the sign to land on that
  // convention.  All other indices agree between the two series.
  let [num, den] = a[0];
  if (n === 1) num = -num;
  s.push(_ratToSymbolic(num, den));
});

/* --------------- IEGCD — integer extended GCD ------------------------
   HP50 AUR §12.6.

     IEGCD  ( a b → u v g )   g = gcd(|a|, |b|); u, v are integers
                               satisfying  u·a + v·b = g.  Both
                               inputs Integer or integer-valued Real;
                               Complex/Symbolic/BinInt reject.  g is
                               always non-negative.  a = b = 0 returns
                               0 0 0.

   HP50's EGCD expects Symbolic operands (polynomial extended GCD);
   that's a CAS-infrastructure item deferred until the polynomial-
   normalize pass lands.  IEGCD is the integer-typed sibling and is
   the op used in practice for Bézout coefficients.
   ----------------------------------------------------------------- */

register('IEGCD', (s) => {
  const [av, bv] = s.popN(2);
  const a = _toBigIntStrict(av);
  const b = _toBigIntStrict(bv);
  const { g, u, v } = _extGcdBig(a, b);
  s.push(Integer(u));
  s.push(Integer(v));
  s.push(Integer(g));
});

/* --------------- ICHINREM / IABCUV — integer CRT and Bézout ----------
   HP50 AUR §12.6.

     ICHINREM  ( {a m} {b n} → {x p} )
                           Chinese Remainder Theorem over the integers.
                           x ≡ a (mod m), x ≡ b (mod n), p = m*n / gcd
                           (when gcd(m,n) divides a−b and a solution
                           exists; otherwise raise Bad argument value).
                           Result is reduced to [0, p).

     IABCUV    ( a b c → u v )
                           Solve a·u + b·v = c over the integers.
                           Requires gcd(a, b) | c; otherwise raise.
                           Picks the canonical small-coefficient
                           solution scaled from Bézout (u, v) for
                           gcd(a, b).
   ----------------------------------------------------------------- */

function _popIntPair(list) {
  if (!isList(list) || list.items.length !== 2) {
    throw new RPLError('Bad argument type');
  }
  return [_toBigIntStrict(list.items[0]), _toBigIntStrict(list.items[1])];
}

register('ICHINREM', (s) => {
  const [l1, l2] = s.popN(2);
  const [a, m] = _popIntPair(l1);
  const [b, n] = _popIntPair(l2);
  if (m === _ZERO || n === _ZERO) throw new RPLError('Bad argument value');
  const mAbs = m < _ZERO ? -m : m;
  const nAbs = n < _ZERO ? -n : n;
  const { g, u } = _extGcdBig(mAbs, nAbs);
  const diff = b - a;
  if (diff % g !== _ZERO) throw new RPLError('Bad argument value');
  const lcm = (mAbs / g) * nAbs;                    // lcm = m*n/gcd
  // x = a + m * u * ((b - a) / g), reduced mod lcm
  let x = a + mAbs * u * (diff / g);
  x = ((x % lcm) + lcm) % lcm;
  s.push(RList([Integer(x), Integer(lcm)]));
});

register('IABCUV', (s) => {
  const [av, bv, cv] = s.popN(3);
  const a = _toBigIntStrict(av);
  const b = _toBigIntStrict(bv);
  const c = _toBigIntStrict(cv);
  const { g, u, v } = _extGcdBig(a, b);
  if (g === _ZERO) {
    // a = b = 0: only c = 0 has a solution; pick u = v = 0.
    if (c !== _ZERO) throw new RPLError('Bad argument value');
    s.push(Integer(_ZERO));
    s.push(Integer(_ZERO));
    return;
  }
  if (c % g !== _ZERO) throw new RPLError('Bad argument value');
  const k = c / g;
  s.push(Integer(u * k));
  s.push(Integer(v * k));
});

/* --------------- HORNER — synthetic division of polynomial -----------
   HP50 AUR §12.6.  Applied to a polynomial presented as a coefficient
   list in DESCENDING order of degree (same convention as PCOEF's
   output), HORNER synthetically divides by (x − a).

     HORNER  ( {c_n … c_1 c_0} a → {q_{n-1} … q_0} r a )

   Result: { c_n,  c_{n-1} + a·q_{n-1},  … } — i.e. the Horner-scheme
   quotient, plus the remainder (= value of the polynomial at x = a),
   and `a` itself re-pushed on top to match HP50's 3-level return.
   Empty coefficient list throws Bad argument value.  Coefficients and
   a are Real / Integer / Complex; Symbolic coefficients are rejected
   in this list-form (Symbolic-polynomial HORNER is the CAS-side op
   deferred with the polynomial-normalize pass).
   ----------------------------------------------------------------- */

register('HORNER', (s) => {
  const [poly, a] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  // Accept Real / Integer / Complex / BinaryInteger-less numerics only.
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(a) && !isInteger(a) && !isComplex(a)) {
    throw new RPLError('Bad argument type');
  }
  const coefs = poly.items;
  const n = coefs.length;
  const q = new Array(n - 1);
  let r = coefs[0];
  for (let i = 1; i < n; i++) {
    q[i - 1] = r;
    // r = r * a + c_i  (via _scalarBinary for mixed numeric-type safety)
    r = _scalarBinary('+', _scalarBinary('*', r, a), coefs[i]);
  }
  s.push(RList(q));
  s.push(r);
  s.push(a);
});

/* --------------- PCOEF / FCOEF — roots ↔ polynomial ------------------
   HP50 AUR §12.6.

     PCOEF   ( {r_1 … r_n} → {1 c_1 … c_n} )
              Given a list of roots, returns the coefficient list of
              the monic polynomial (x − r_1)(x − r_2)…(x − r_n).  Leading
              coefficient is always Integer(1) — suitable for feeding
              straight into HORNER.  Real / Integer / Complex roots all
              flow through.  Empty roots list returns {1}.

     FCOEF   ( {r_1 m_1 … r_k m_k} → Sy )
              Given (root, multiplicity) pairs, returns the Symbolic
              polynomial in VX.  Zero-multiplicity pairs are silently
              skipped (matches HP50).  Negative multiplicity throws
              Bad argument value.  Numeric roots become AstNum; Symbolic
              roots lift directly.  Output is always Symbolic.
   ----------------------------------------------------------------- */

register('PCOEF', (s) => {
  const [rootsList] = s.popN(1);
  if (!isList(rootsList)) throw new RPLError('Bad argument type');
  const roots = rootsList.items;
  // Accept Real / Integer / Complex roots.  Symbolic rejected — the
  // symbolic form needs the full CAS polynomial expander.
  for (const r of roots) {
    if (!isReal(r) && !isInteger(r) && !isComplex(r)) {
      throw new RPLError('Bad argument type');
    }
  }
  // Start with polynomial [1].  For each root r, multiply by (x − r):
  // new[0..n] = old[0..n-1] shifted up  −  r * old[0..n-1]
  let coefs = [Integer(_ONE)];
  for (const r of roots) {
    const m = coefs.length;
    const next = new Array(m + 1);
    next[0] = coefs[0];                             // shifted-up leading
    for (let i = 1; i < m; i++) {
      next[i] = _scalarBinary('-', coefs[i],
        _scalarBinary('*', r, coefs[i - 1]));
    }
    next[m] = _scalarBinary('-', Integer(_ZERO),
      _scalarBinary('*', r, coefs[m - 1]));
    coefs = next;
  }
  s.push(RList(coefs));
});

/** Build `(VX - root)` as an AST. */
function _vxMinusRoot(root) {
  const vx = AstVar('X');
  const ast = _toAst(root);
  if (!ast) throw new RPLError('Bad argument type');
  return AstBin('-', vx, ast);
}

register('FCOEF', (s) => {
  const [pairList] = s.popN(1);
  if (!isList(pairList)) throw new RPLError('Bad argument type');
  if (pairList.items.length % 2 !== 0) {
    throw new RPLError('Bad argument value');
  }
  let acc = null;      // null = polynomial "1"
  for (let i = 0; i < pairList.items.length; i += 2) {
    const root = pairList.items[i];
    const multV = pairList.items[i + 1];
    if (!isInteger(multV) &&
        !(isReal(multV) && multV.value.isInteger())) {
      throw new RPLError('Bad argument type');
    }
    const m = isInteger(multV) ? Number(multV.value) : multV.value.toNumber();
    if (m < 0) throw new RPLError('Bad argument value');
    for (let k = 0; k < m; k++) {
      const fac = _vxMinusRoot(root);
      acc = acc === null ? fac : AstBin('*', acc, fac);
    }
  }
  if (acc === null) acc = AstNum(1);       // empty product = 1
  s.push(Symbolic(acc));
});

/* --------------- →TAG / DTAG / VTYPE / KIND / UNDER ------------------
   HP50 AUR §4.6 and §4.1.  Tagged objects and type-introspection ops.

     →TAG   ( value tag → tagged )
              Wrap `value` with a string `tag`.  HP50 accepts the tag
              as a String OR a Name; we accept both and coerce to the
              string form (Name.id without the tick).  Empty tag OK
              (mirrors HP50).  Existing tag is replaced — double-tagging
              is a no-op on top of an already-tagged value.

     DTAG   ( tagged → value )
              Strip a tag, leaving the inner value.  On an UN-tagged
              value, passes through unchanged (matches HP50 defensive
              semantics).

     VTYPE  ( N → n )
              Recall the stored value for `N` and return its HP50
              TYPE code.  `N` must be a Name; missing name throws
              Undefined name.  Saves a DUP-RCL-TYPE triple.

     KIND   ( v → n )
              Same mapping as TYPE but with HP50's finer subdivision
              for composites.  In our implementation today the
              numbers agree with TYPE; reserved for future refinement
              once the type taxonomy diverges (e.g. for HP49+ library
              objects).

     UNDER  ( tagged → value tag )
              Explode a tagged into (value, tag-string).  Symmetric
              inverse of →TAG.  UN-tagged value throws Bad argument type.
   ----------------------------------------------------------------- */

function _asTagString(v) {
  if (isString(v)) return v.value;
  if (isName(v))   return v.id;
  throw new RPLError('Bad argument type');
}

register('→TAG', (s) => {
  const [val, tagV] = s.popN(2);
  const tag = _asTagString(tagV);
  // If value is already tagged, replace the outer tag (HP50 behavior).
  const inner = isTagged(val) ? val.value : val;
  s.push(Tagged(tag, inner));
});
register('->TAG', (s) => { lookup('→TAG').fn(s); });

register('DTAG', (s) => {
  const [v] = s.popN(1);
  if (isTagged(v)) { s.push(v.value); return; }
  s.push(v);   // HP50: DTAG on non-tagged is a no-op pass-through
});

register('VTYPE', (s) => {
  const [nameV] = s.popN(1);
  if (!isName(nameV)) throw new RPLError('Bad argument type');
  const stored = varRecall(nameV.id);
  if (stored === undefined) throw new RPLError(`Undefined name: ${nameV.id}`);
  s.push(Real(_hp50TypeCode(stored)));
});

register('KIND', (s) => {
  const [v] = s.popN(1);
  s.push(Real(_hp50TypeCode(v)));
});

register('UNDER', (s) => {
  const [v] = s.popN(1);
  if (!isTagged(v)) throw new RPLError('Bad argument type');
  s.push(v.value);
  s.push(Str(v.tag));
});

/* --------------- DOERR — raise a user-supplied error -----------------
   HP50 AUR §14.2.

     DOERR ( S → ) raise an RPL error whose message is the string S.
     DOERR ( n → ) raise an error whose number is `n` — looks up the
                   canonical error-message text if the number is
                   known; otherwise emits `Error: #Nh` as a fallback.
     DOERR ( 0 → ) no-op.  HP50 uses "DOERR 0" to mean "clear state
                   and do nothing"; we treat it the same.

   Ideal partners: IFERR (the trap) and ERRM/ERRN/ERR0 (introspection).
   A DOERR raised inside an IFERR trap is routed to the THEN clause
   with the last-error slot populated exactly as if a built-in op had
   failed.
   ----------------------------------------------------------------- */

register('DOERR', (s) => {
  const [v] = s.popN(1);
  if (isString(v)) {
    if (v.value === '') throw new RPLError('Interrupted');
    throw new RPLError(v.value);
  }
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    let code;
    if (isInteger(v))            code = Number(v.value);
    else if (isReal(v))          code = v.value.toNumber();
    else                         code = Number(v.value);
    if (code === 0) return;                   // DOERR 0 = clear / no-op
    // Reverse-lookup the canonical message for known codes; fall back
    // to a generic hex form otherwise.  The reverse table is built on
    // demand each call — cheap, ops.js already owns the forward table
    // indirectly via setLastError.
    const known = {
      0x201: 'Too few arguments',
      0x202: 'Bad argument type',
      0x204: 'Bad argument value',
      0x303: 'Division by zero',
      0x305: 'Infinite result',
      0x501: 'Name conflict',
      0x502: 'Directory not allowed',
      0x503: 'Directory not empty',
    };
    const msg = known[code] || `Error: #${code.toString(16).toUpperCase()}h`;
    throw new RPLError(msg);
  }
  throw new RPLError('Bad argument type');
});

/* --------------- ABORT — program-interrupt primitive ---------------
 * AUR p.1-27.  ABORT unwinds the currently-executing program (all
 * nested IF/WHILE/CASE/etc frames) without taking any stack argument
 * and without producing a trappable RPLError — IFERR cannot catch it.
 *
 * Implementation: throws an RPLAbort (subclass of Error but NOT
 * RPLError).  `evalRange`/`runControl` have no try/catch of their own,
 * so the signal bubbles straight to the outer EVAL, whose snapshot-
 * restore catch has been taught to let RPLAbort pass through without
 * restoring — ABORT preserves stack state at the point of the abort,
 * matching HP50 behavior.  The top-level entry.js safeRun loop treats
 * RPLAbort as a clean program termination (no `flashError`, no
 * rollback) — see the EVAL catch below and the entry.js integration
 * we'll add alongside the UI-side display work.
 */
register('ABORT', () => {
  throw new RPLAbort('Abort');
});

/* --------------- HALT / CONT / KILL / RUN ---------------------------
 * HP50 AUR p.2-135 / p.2-52 / p.2-140 / p.2-177.  The suspended-
 * execution substrate: HALT pauses the running program, CONT resumes
 * it where it left off, KILL clears the suspension without resuming.
 * RUN is a debug-aware resume — without DBUG active, it behaves
 * identically to CONT (AUR p.2-177).
 *
 * HALT is intercepted by `evalRange` before it can dispatch to an op
 * — it needs the token list and instruction pointer, which `evalRange`
 * has and a plain op body would not.  See the `id === 'HALT'` branch
 * in evalRange for the capture code.  The body here exists only so
 * that `HALT EVAL` (evaluating the bare name from the stack, not from
 * inside a program body) produces the same "HALT used outside a
 * program" semantics HP50 implements.
 *
 * CONT reads the top of `state.haltedStack` (exposed as `state.halted`
 * for single-slot back-compat), pops it, and resumes the saved
 * generator.  No token-list copy or rehydration — resumption is O(1)
 * in program size.
 *
 * KILL clears the TOP halted slot without resuming.  AUR p.2-140
 * describes KILL as terminating "any currently-halted program(s)";
 * we match the singular reading — one KILL peels one suspension off
 * the stack.  Users who want to drain every suspension can KILL
 * repeatedly or use the CLI/reset path.
 *
 * haltedStack is a LIFO of halted records.  Multi-slot matters when
 * the user runs a second program from the keypad while an earlier one
 * is still halted; CONT resumes the most recent halt first, and older
 * ones remain reachable via subsequent CONT calls.
 * --------------------------------------------------------------- */

register('HALT', () => {
  // HALT called outside a Program body (i.e. not captured by evalRange):
  // HP50 treats this as a no-op at best, error at worst.  We throw a
  // clear RPLError so the user understands HALT only suspends programs.
  throw new RPLError('HALT: not inside a running program');
});

// PROMPT — HP50 AUR p.2-160 form: pop level 1 (the prompt message) and
// halt the program with that message displayed as a banner.
// evalRange's intercept handles the inside-a-program case (pop +
// setPromptMessage + yield).  Reaching this registered handler means
// PROMPT was reached via Name dispatch outside a running program (e.g.
// `'PROMPT' EVAL` from the keypad) — the HP50 has no useful behavior
// there, and we surface the same "not inside a running program" error
// HALT raises so the user gets a consistent message.
register('PROMPT', () => {
  throw new RPLError('PROMPT: not inside a running program');
});

register('CONT', (s) => {
  if (!getHalted()) throw new RPLError('No halted program');
  // CONT consumes the active prompt banner.  PROMPT is a one-shot:
  // the user has provided whatever input the program asked for and
  // is resuming.  If the resumed program HALTs again with a fresh
  // PROMPT, that call sets the message anew; if it HALTs without
  // one, the banner stays cleared.  We clear up-front (before
  // takeHalted / next()) so the cleared state is visible during
  // resumption — including to any UI subscribers that re-render on
  // every emit.
  clearPromptMessage();
  // takeHalted pops the top record WITHOUT closing its generator —
  // clearHalted (used by KILL) closes it; takeHalted leaves it live
  // so gen.next() below can resume it.  The slot is removed before
  // resuming so that a fresh HALT inside the resumed program can
  // push a new record cleanly on top of any remaining older ones.
  //
  // LIFO semantics: older halted records remain on haltedStack and
  // are reachable via subsequent CONT calls.  Generator-based
  // resumption preserves ALL structural state (FOR counter, IF
  // branch, → local frames) automatically.
  //
  // _localFrames safety: do NOT truncate while halted — the
  // generator's own finally blocks handle cleanup.  Truncation only
  // runs when the generator finishes (done=true) or throws.
  const h = takeHalted();
  const framesAtEntry = _localFrames.length;
  let halted = false;
  try {
    const result = h.generator.next();
    if (!result.done) {
      // Generator yielded again (another HALT) — push it back.
      halted = true;
      setHalted({ generator: h.generator });
    }
  } finally {
    if (!halted) _truncateLocalFrames(framesAtEntry);
  }
});

register('KILL', () => {
  // KILL is valid even when there is no halted program — the HP50 op
  // is a no-op in that case (AUR p.2-140 "KILL terminates any
  // currently-halted program, or does nothing").  KILL pops one
  // record off the halted stack; older halts are preserved.
  clearHalted();
  // Any active PROMPT banner belongs to the killed program; clearing
  // it here keeps the banner from outliving the program that posted
  // it.  In the multi-slot case where older halts remain, we still
  // clear the global banner — there's no per-slot prompt tracking,
  // and the next CONT/SST will either re-set or start fresh.
  clearPromptMessage();
});

/* RUN — AUR p.2-177.  Resumes the most-recently-halted program at full
 * speed regardless of any single-step state that was active when the
 * program was suspended.  AUR p.2-177 specifies "no more single steps
 * are permitted" after RUN; the explicit zeroing of _singleStepMode /
 * _stepInto before handing off to CONT enforces that guarantee
 * defensively, even if a future code path leaves either flag set when
 * RUN is called.  The save/restore in the finally block is a safety
 * net: in normal use both flags are already false when RUN is entered
 * (SST/DBUG each reset them in their own finally blocks), so the
 * restore is a no-op; in an abnormal path it prevents the caller from
 * inheriting a zeroed step state it didn't expect. */
register('RUN', (s) => {
  const wasStepping = _singleStepMode;
  const wasInto     = _stepInto;
  _singleStepMode = false;
  _stepInto       = false;
  try {
    OPS.get('CONT').fn(s);
  } finally {
    _singleStepMode = wasStepping;
    _stepInto       = wasInto;
  }
});

/* ---------------- SST / SST↓ — single-step debugger ----------------
 * Single-step substrate built on the generator-based evalRange.  The
 * implementation is a thin wrapper around CONT plus a module-level
 * `_singleStepMode` flag that `evalRange` consults after every token
 * (see the post-token `if (_singleStepMode) yield;` line in evalRange
 * and runControl / runArrow tails).
 *
 * SST drives the top of the haltedStack forward by exactly one
 * token.  Implementation is symmetrical with CONT:
 *   1. takeHalted() to peel the live generator off the stack
 *      (without closing it — clearHalted closes; takeHalted leaves
 *      the generator live so we can call gen.next() on it).
 *   2. Set `_singleStepMode = true` so the next post-token yield
 *      in evalRange causes the generator to suspend after exactly
 *      one token.
 *   3. gen.next() — runs one token, then either (a) yields again
 *      (single-step suspension), (b) finishes (program done), or
 *      (c) throws (program errored).  In case (a) we re-push the
 *      generator on the haltedStack via setHalted so the next SST
 *      can drive it forward another step; in cases (b) and (c) the
 *      flag is cleared in `finally` and the generator is gone.
 *   4. Clear the flag in `finally` so subsequent CONT/RUN/EVAL
 *      calls don't single-step.  (If the user wants more steps,
 *      they call SST again — which sets the flag, runs one token,
 *      and clears it.)
 *
 * SST↓ adds step-into.  `_evalValueGen` (the generator flavor of
 * `_evalValueSync`, reached only via `evalToken` Name lookup)
 * consults `_stepInto` around a sub-program body: SST
 * (`_stepInto === false`) clears `_singleStepMode` while the body
 * runs so it completes in one step; SST↓ (`_stepInto === true`)
 * leaves the flag set so the body's own evalRange also yields
 * after each token, letting the user descend.  Op-argument paths
 * (IFT / IFTE / MAP / …) go through `_evalValueSync` and retain
 * the reject-on-HALT behavior.
 *
 * Errors:
 *   - SST with no halted program → `No halted program` (same as
 *     CONT).  This is intentional — SST is a step within an
 *     already-suspended program, not a "step the next op on the
 *     current input" op.  To start single-stepping a fresh
 *     program, use DBUG.
 * --------------------------------------------------------------- */

function _stepOnce(s, into = false) {
  if (!getHalted()) throw new RPLError('No halted program');
  // SST/SST↓ resume the program by one token, which is enough to
  // advance past a PROMPT.  The prompt banner is consumed by any form
  // of resumption — same rationale as CONT above.  If the single step
  // lands on a fresh PROMPT, that intercept will set the banner anew
  // before the post-step re-suspend.
  clearPromptMessage();
  const h = takeHalted();
  const framesAtEntry = _localFrames.length;
  let halted = false;
  const wasStepping = _singleStepMode;
  const wasInto = _stepInto;
  _singleStepMode = true;
  _stepInto = into;
  try {
    const result = h.generator.next();
    if (!result.done) {
      // Generator yielded again (the post-token single-step yield, OR
      // a fresh HALT inside the program).  Re-push it so the next
      // SST/CONT/RUN can resume.
      halted = true;
      setHalted({ generator: h.generator });
    }
  } finally {
    _singleStepMode = wasStepping;     // typically false
    _stepInto = wasInto;               // typically false
    if (!halted) _truncateLocalFrames(framesAtEntry);
  }
}

// SST (step-over) runs a named sub-program call at full speed, yielding
// once after the call returns.  SST↓ (step-into) keeps single-stepping
// active while descending into the sub-program, stopping on each of
// its tokens.  The distinction is modulated by the `_stepInto` flag
// consulted in `_evalValueGen`'s Program branch.
register('SST',  (s) => { _stepOnce(s, /* into = */ false); });
register('SST↓', (s) => { _stepOnce(s, /* into = */ true);  });

/* ---------------- DBUG — start a program in single-step mode --------
 * HP50 AUR p.2-95: DBUG pops a Program off level 1 and begins
 * executing it under the single-step debugger.  The program is not
 * pre-evaluated — it's halted before its first token, so the user
 * can SST through it from the very start.
 *
 * Implementation: pop the Program, set `_singleStepMode = true`,
 * delegate to EVAL.  evalRange yields after the first token (which
 * may be a no-op — the body of `« 1 2 + »` yields after pushing 1,
 * leaving the stack with [..., 1] and the generator suspended); EVAL
 * captures that yield exactly the same way it captures a HALT.  The
 * flag is cleared in `finally` so a downstream CONT/RUN won't
 * single-step.  The user drives subsequent steps with SST.
 *
 * Tagged wrappers are peeked through for the type check — Tagged
 * values are transparent to EVAL, and DBUG is EVAL-with-stepping.
 * The actual peel happens inside EVAL via _evalValueGen's Tagged
 * recursion.
 *
 * Errors:
 *   - DBUG on a non-Program (after peeling Tagged) → `Bad argument type`.
 * --------------------------------------------------------------- */
register('DBUG', (s) => {
  // Peel Tagged wrappers for the type check.  Tagged values are
  // transparent for EVAL purposes; DBUG must accept the same set of
  // arguments.  This is a pure read-through — the actual peel happens
  // inside EVAL via _evalValueGen's Tagged recursion.
  let probe = s.peek();
  while (probe && isTagged(probe)) probe = probe.value;
  if (!isProgram(probe)) throw new RPLError('Bad argument type');
  // EVAL handler does its own pop; we just toggle the flag around it.
  // wasStepping is virtually always false here, but guard against the
  // pathological "DBUG inside a halted single-step program" case.
  // _stepInto is reset to false — a fresh DBUG session starts in
  // step-over mode.  Users choose step-into per-step by driving with
  // SST↓ instead of SST.
  const wasStepping = _singleStepMode;
  const wasInto = _stepInto;
  _singleStepMode = true;
  _stepInto = false;
  try {
    OPS.get('EVAL').fn(s);
  } finally {
    _singleStepMode = wasStepping;
    _stepInto = wasInto;
  }
});

/* --------------- APPEND — add element to end of a list ---------------
   HP50 AUR §15.1.

     APPEND  ( L v → L' )  Append `v` as a new last element of list L.

   Accepts an RList host; any value type on the right.  Empty list OK.
   Polymorphic on Vector (append scalar to vector) and String (append
   character-string to string) was rejected by the HP50 spec — APPEND
   is the list op.  For a Vector, use `ARRY→ SWAP 1 + →ARRY`-style
   sequences.
   ----------------------------------------------------------------- */

register('APPEND', (s) => {
  const [host, val] = s.popN(2);
  if (!isList(host)) throw new RPLError('Bad argument type');
  s.push(RList([...host.items, val]));
});

/* --------------- STD / FIX / SCI / ENG — number-format modes ---------
   HP50 AUR §3.2.  Each op routes through `setDisplay()` so the state
   emitter fires — the LCD renderer reads `state.displayMode` /
   `state.displayDigits` before each stack repaint, and the status-line
   annunciator updates via the same subscribe path.  `→STR` and any
   other op that passes the state's display mode to `format()` sees
   the same update.

     STD                     ( — )       set mode = STD, digits ignored
     FIX    ( n → )                      set mode = FIX, digits = clamp(n, 0, 11)
     SCI    ( n → )                      set mode = SCI, digits = clamp(n, 0, 11)
     ENG    ( n → )                      set mode = ENG, digits = clamp(n, 0, 11)

   Non-integer Real and negative digits throw Bad argument value.
   ----------------------------------------------------------------- */

function _popNumDigits(s) {
  const [n] = s.popN(1);
  let d;
  if (isInteger(n)) d = Number(n.value);
  else if (isReal(n)) {
    if (!n.value.isInteger()) throw new RPLError('Bad argument value');
    d = n.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (d < 0) throw new RPLError('Bad argument value');
  if (d > 11) d = 11;                               // HP50 cap
  return d;
}

register('STD', () => { setDisplay('STD'); });
register('FIX', (s) => { const d = _popNumDigits(s); setDisplay('FIX', d); });
register('SCI', (s) => { const d = _popNumDigits(s); setDisplay('SCI', d); });
register('ENG', (s) => { const d = _popNumDigits(s); setDisplay('ENG', d); });

/* --------------- MEDIAN — order-statistic over a Vector --------------
   HP50 AUR §18.  Standard odd/even convention: middle entry when n is
   odd, arithmetic mean of the two middle entries when n is even.

     MEDIAN  ( V → m )     Vector V; Real / Integer entries only.
     MEDIAN  ( M → v )     Matrix M; per-column median as Vector.

   Rejects Complex / Symbolic / BinInt entries (same policy as VAR /
   SDEV).  Empty Vector throws Bad argument value.  Ties on the
   ordering go stable — two equal values side-by-side sort to their
   input order; doesn't affect the median value.
   ----------------------------------------------------------------- */

function _medianItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  const arr = items.map(_statsNumericEntry).slice().sort((a, b) => a - b);
  const n = arr.length;
  if ((n & 1) === 1) return arr[(n - 1) >> 1];
  return (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

register('MEDIAN', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_medianItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _medianItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- CORR / COV — paired-sample correlation / covariance -
   HP50 AUR §18.4.  The HP50 operates on columns of ΣDAT (two
   independent variables); we accept an m×2 Matrix directly — no
   sidecar slot required.  Column 1 is X, column 2 is Y.

     CORR  ( M → r )   Pearson product-moment correlation
                       r = cov(X,Y) / (sdev(X) * sdev(Y))
                       -1 ≤ r ≤ 1.  Zero-variance columns throw
                       Infinite result (division by zero in the
                       denominator).
     COV   ( M → s )   Sample covariance (Bessel n-1 denominator)
                       s = Σ (xᵢ - μX)(yᵢ - μY) / (n − 1)

   Input M must be m×2 with m ≥ 2; fewer rows throws Bad argument
   value (can't form a sample variance).  Real/Integer entries
   only.  A Vector input is explicitly rejected — the paired-sample
   ops need two parallel columns.
   ----------------------------------------------------------------- */

function _twoColsOrThrow(M) {
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const m = M.rows.length;
  if (m < 2) throw new RPLError('Bad argument value');
  if (M.rows[0].length !== 2) throw new RPLError('Invalid dimension');
  const X = new Array(m), Y = new Array(m);
  for (let i = 0; i < m; i++) {
    X[i] = _statsNumericEntry(M.rows[i][0]);
    Y[i] = _statsNumericEntry(M.rows[i][1]);
  }
  return { X, Y, m };
}

function _meanArr(a) {
  let s = 0; for (const x of a) s += x; return s / a.length;
}

function _covArr(X, Y) {
  const mX = _meanArr(X), mY = _meanArr(Y);
  let s = 0;
  for (let i = 0; i < X.length; i++) s += (X[i] - mX) * (Y[i] - mY);
  return s / (X.length - 1);
}

function _varArr(A) {
  const m = _meanArr(A);
  let s = 0;
  for (const x of A) { const d = x - m; s += d * d; }
  return s / (A.length - 1);
}

register('COV', (s) => {
  const [M] = s.popN(1);
  const { X, Y } = _twoColsOrThrow(M);
  s.push(Real(_covArr(X, Y)));
});

register('CORR', (s) => {
  const [M] = s.popN(1);
  const { X, Y } = _twoColsOrThrow(M);
  const vX = _varArr(X), vY = _varArr(Y);
  if (vX === 0 || vY === 0) throw new RPLError('Infinite result');
  s.push(Real(_covArr(X, Y) / Math.sqrt(vX * vY)));
});

/* ==================================================================
   Polynomial roots + division, LU, stats aggregates, regression
   family, CMPLX mode, MERGE directory op.

   HP50 AUR: §12.6 (PROOT), §12.5 (QUOT/REMAINDER), §15.3 (LU),
   §18.1 (stats aggregates, ΣX/ΣY/…), §18.1 (LINFIT/LOGFIT/EXPFIT/
   PWRFIT, BESTFIT), §4.2.4 (CMPLX system flag -103), §3.2 (MERGE).

   All ops below are user-reachable via the typed catalog today.  No
   UI touches.  PROOT rejects Symbolic coefficients (deferred until
   CAS polynomial-normalize lands).  Stats-aggregate family (NΣ, ΣX,
   ΣY, ΣXY, ΣX², ΣY², MAXΣ, MINΣ) takes a Matrix argument directly —
   matches the HP50 ΣDAT-bypass convention.  The regression family
   (LINFIT / LOGFIT / EXPFIT / PWRFIT / BESTFIT) follows the same
   convention: takes a 2-column Matrix, returns the fitted-model
   Symbolic (or the best-fit family label for BESTFIT).
   ================================================================= */

/* --------------- PROOT — polynomial root-finder ----------------------
   HP50 AUR §12.6.

     PROOT  ( {c_n … c_1 c_0} → [ z_1 … z_n ] )

   Returns a Vector of the n roots of the polynomial, in whatever
   order Durand-Kerner converges to.  Real / Integer / Complex
   coefficients accepted; Symbolic rejected (deferred until the CAS
   polynomial-normalize pass lands).  Empty list → Bad argument value.
   Leading-zero coefficients are trimmed before iteration (so
   { 0 1 -3 2 } PROOT works).  Zero polynomial throws Bad argument
   value.  Linear polynomial short-circuits to the closed form.

   Algorithm: Durand-Kerner / Weierstrass.  Start roots at evenly
   spaced points on a circle of radius 1 + max|c_i/c_n| (Cauchy's
   bound + 1 — places the initial approximants outside the disk that
   contains all roots), rotated off the real axis so no two initial
   points land on each other.  Iterate
        z_i  ←  z_i - p(z_i) / ∏_{j≠i} (z_i - z_j)
   to a max of 200 sweeps or until all deltas drop below 1e-12 · |z_i|
   (plus a floor of 1e-14 for roots near zero).
   ----------------------------------------------------------------- */

function _coefToCx(c) {
  if (isInteger(c)) return _cx(Number(c.value), 0);
  if (isReal(c))    return _cx(c.value.toNumber(), 0);
  if (isComplex(c)) return _cx(c.re, c.im);
  throw new RPLError('Bad argument type');
}

function _cxAbs(z) { return Math.hypot(z.re, z.im); }

function _polyEvalCx(coefs, z) {
  // coefs in descending degree order, already _cx.
  let r = coefs[0];
  for (let i = 1; i < coefs.length; i++) {
    r = _cxAdd(_cxMul(r, z), coefs[i]);
  }
  return r;
}

register('PROOT', (s) => {
  const [poly] = s.popN(1);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  // Convert coefficients and validate.
  const cxRaw = poly.items.map(_coefToCx);
  // Trim leading zeros — degenerate polynomial leading with 0 is
  // semantically lower-degree.  Zero polynomial → Bad argument value.
  let start = 0;
  while (start < cxRaw.length - 1
         && cxRaw[start].re === 0 && cxRaw[start].im === 0) {
    start++;
  }
  const cx = cxRaw.slice(start);
  if (cx.length === 1) {
    // Pure constant (post-trim): no roots.  HP50 returns a 0-length
    // result — but Vector with 0 entries is illegal.  Honour HP50:
    // zero constant → Bad argument value; non-zero constant → still
    // no roots, so return an empty List (HP50 actually produces
    // `[ ]`, which our Vector rejects — list is the safe compromise).
    if (cx[0].re === 0 && cx[0].im === 0) {
      throw new RPLError('Bad argument value');
    }
    s.push(RList([]));
    return;
  }
  const n = cx.length - 1;           // polynomial degree
  const a = cx[0];                    // leading coef
  // Normalize to monic (safer for the ∏ denominator); store monic in `p`.
  const p = cx.map((c) => _cxDiv(c, a));
  // Linear shortcut: x + p[1] = 0 → z = -p[1].
  if (n === 1) {
    const z0 = { re: -p[1].re, im: -p[1].im };
    // Real-coef polynomial with real root → return Real, else Complex
    // (mirrors the general-path polish at the bottom of this op).
    const polyIsReal1 = poly.items.every(
      (c) => isInteger(c) || isReal(c) || (isComplex(c) && c.im === 0));
    if (polyIsReal1 && Math.abs(z0.im) < 1e-12) {
      s.push(Vector([ Real(z0.re) ]));
    } else {
      s.push(Vector([ Complex(z0.re, z0.im) ]));
    }
    return;
  }
  // Cauchy bound: R = 1 + max |p[i]| for i = 1..n.
  let R = 0;
  for (let i = 1; i <= n; i++) {
    const m = _cxAbs(p[i]);
    if (m > R) R = m;
  }
  R = 1 + R;
  // Initial estimates on a circle of radius R, phase 2π(k + 0.25)/n.
  const roots = new Array(n);
  for (let k = 0; k < n; k++) {
    const ang = 2 * Math.PI * (k + 0.25) / n;
    roots[k] = { re: R * Math.cos(ang), im: R * Math.sin(ang) };
  }
  // Durand-Kerner iteration.
  const MAX_ITER = 400;
  const TOL = 1e-12;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const zi = roots[i];
      // numerator: p(zi)
      const num = _polyEvalCx(p, zi);
      // denominator: ∏_{j≠i} (zi - roots[j])
      let den = _cx(1, 0);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        den = _cxMul(den, _cxSub(zi, roots[j]));
      }
      // Guard against a coincident initial point (den == 0) — nudge.
      if (den.re === 0 && den.im === 0) {
        next[i] = { re: zi.re + 1e-8, im: zi.im + 1e-8 };
        continue;
      }
      const delta = _cxDiv(num, den);
      next[i] = _cxSub(zi, delta);
      const dmag = _cxAbs(delta);
      const scale = Math.max(_cxAbs(zi), 1);
      if (dmag / scale > maxDelta) maxDelta = dmag / scale;
    }
    for (let i = 0; i < n; i++) roots[i] = next[i];
    if (maxDelta < TOL) break;
  }
  // Clean up near-zero imaginary parts (so real roots surface as Real).
  // HP50 actually always returns Complex for PROOT; we match that — but
  // if the polynomial is real and the root's |im| is tiny relative to
  // |re|, collapse to a clean real.
  const polyIsReal = poly.items.every(
    (c) => isInteger(c) || (isReal(c)) || (isComplex(c) && c.im === 0));
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const z = roots[i];
    if (polyIsReal && Math.abs(z.im) < 1e-9 * Math.max(Math.abs(z.re), 1)) {
      out[i] = Real(z.re);
    } else {
      out[i] = Complex(z.re, z.im);
    }
  }
  s.push(Vector(out));
});

/* --------------- QUOT / REMAINDER — polynomial division --------------
   HP50 AUR §12.5.

     QUOT       ( {a_n … a_0} {b_m … b_0} → {q_{n-m} … q_0} )
     REMAINDER  ( {a_n … a_0} {b_m … b_0} → {r_{m-1} … r_0} )

   Long division of coefficient lists in descending-degree order
   (matching HORNER / PCOEF convention).  Dividend-degree < divisor-
   degree → quotient {0}, remainder = dividend.  Divisor = {0}-only
   (or empty) → Infinite result.  Real / Integer / Complex entries
   accepted on both sides via `_scalarBinary`; Symbolic rejected
   (same deferral as HORNER / PCOEF).

   Leading zeros are trimmed from both inputs before dividing.  The
   remainder list is truncated to length (divisor-degree), padded with
   a leading zero if the cancellation drops the degree further; if
   the remainder is the zero polynomial, we return a one-element
   `{ 0 }` list so callers never see an empty list.
   ----------------------------------------------------------------- */

function _polyValidateList(items) {
  for (const c of items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
}

function _polyTrimLeading(items) {
  let i = 0;
  while (i < items.length - 1 && _isNumericZero(items[i])) i++;
  return items.slice(i);
}

function _isNumericZero(x) {
  if (isInteger(x)) return x.value === 0n;
  if (isReal(x))    return x.value.isZero();
  if (isComplex(x)) return x.re === 0 && x.im === 0;
  return false;
}

function _polyDivide(A, B) {
  // A, B are arrays of RPL numerics in descending order (after trim).
  if (B.length === 0 || (B.length === 1 && _isNumericZero(B[0]))) {
    throw new RPLError('Infinite result');
  }
  const n = A.length - 1, m = B.length - 1;
  if (n < m) {
    return { q: [Integer(_ZERO)], r: A.slice() };
  }
  // Work on mutable arrays for the in-place subtract.
  const rem = A.slice();
  const q = new Array(n - m + 1);
  const leadB = B[0];
  for (let i = 0; i <= n - m; i++) {
    // Highest remaining term: rem[i] / leadB.
    const qi = _scalarBinary('/', rem[i], leadB);
    q[i] = qi;
    // rem[i+k] -= qi * B[k]  for k = 0..m.
    for (let k = 0; k <= m; k++) {
      rem[i + k] = _scalarBinary('-', rem[i + k],
        _scalarBinary('*', qi, B[k]));
    }
  }
  // Remainder occupies the last m entries of rem (one degree less than B).
  let r = rem.slice(n - m + 1);
  // Strip leading zeros; empty → {0}.
  r = _polyTrimLeading(r);
  if (r.length === 0) r = [Integer(_ZERO)];
  return { q, r };
}

register('QUOT', (s) => {
  const [A, B] = s.popN(2);
  if (!isList(A) || !isList(B)) throw new RPLError('Bad argument type');
  if (A.items.length === 0 || B.items.length === 0) {
    throw new RPLError('Bad argument value');
  }
  _polyValidateList(A.items);
  _polyValidateList(B.items);
  const At = _polyTrimLeading(A.items);
  const Bt = _polyTrimLeading(B.items);
  const { q } = _polyDivide(At, Bt);
  s.push(RList(q));
});

register('REMAINDER', (s) => {
  const [A, B] = s.popN(2);
  if (!isList(A) || !isList(B)) throw new RPLError('Bad argument type');
  if (A.items.length === 0 || B.items.length === 0) {
    throw new RPLError('Bad argument value');
  }
  _polyValidateList(A.items);
  _polyValidateList(B.items);
  const At = _polyTrimLeading(A.items);
  const Bt = _polyTrimLeading(B.items);
  const { r } = _polyDivide(At, Bt);
  s.push(RList(r));
});

/* --------------- LU — LU decomposition with partial pivoting ---------
   HP50 AUR §15.3.

     LU  ( A → L U P )   A is an n×n Matrix; L is lower-triangular
                         with unit diagonal, U is upper-triangular,
                         P is the permutation matrix with P·A = L·U.
                         Real / Integer entries only (matching
                         `_invMatrixNumeric` / LSQ rejection policy).
                         Singular A → Infinite result.
                         Non-square A → Invalid dimension.

   Algorithm: Doolittle-style LU with partial pivoting (row
   interchanges).  We track the permutation as a 1-D index array
   `piv[i]` meaning "row i of P·A = row piv[i] of A", and materialize
   the full P matrix at the end.
   ----------------------------------------------------------------- */

register('LU', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  // Copy to plain-number working array; rejects non-numeric entries.
  const M = _asNumArray2D(A.rows).map(r => r.slice());
  const piv = new Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    // Partial-pivot: largest |M[i][k]| over i = k..n-1.
    let best = k, bestAbs = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-14) throw new RPLError('Infinite result');
    if (best !== k) {
      [M[k], M[best]] = [M[best], M[k]];
      [piv[k], piv[best]] = [piv[best], piv[k]];
    }
    // Elimination: M[i][k] ← M[i][k]/M[k][k]; M[i][j] -= M[i][k]*M[k][j]
    const pivv = M[k][k];
    for (let i = k + 1; i < n; i++) {
      M[i][k] /= pivv;
      const mik = M[i][k];
      for (let j = k + 1; j < n; j++) {
        M[i][j] -= mik * M[k][j];
      }
    }
  }
  // Split M into L (unit-diagonal lower) and U (upper).
  const Lrows = [], Urows = [], Prows = [];
  for (let i = 0; i < n; i++) {
    const Lr = new Array(n), Ur = new Array(n), Pr = new Array(n);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        Lr[j] = Real(1);
        Ur[j] = Real(M[i][j]);
      } else if (i > j) {
        Lr[j] = Real(M[i][j]);
        Ur[j] = Real(0);
      } else {
        Lr[j] = Real(0);
        Ur[j] = Real(M[i][j]);
      }
      Pr[j] = Real(piv[i] === j ? 1 : 0);
    }
    Lrows.push(Lr); Urows.push(Ur); Prows.push(Pr);
  }
  s.push(Matrix(Lrows));
  s.push(Matrix(Urows));
  s.push(Matrix(Prows));
});

/* --------------- Stats aggregates: NΣ / ΣX / ΣY / ΣXY / ΣX² / ΣY² ----
   HP50 AUR §18.1.  The full row of column-wise statistics that feeds
   the regression family.  Per the ΣDAT-bypass convention, these take
   the Matrix argument directly rather than reading it from the hidden
   ΣDAT variable — so they accept Integer / Real entries via
   `_statsNumericEntry`.

     NΣ    ( M → N )      Row count (Real).
     ΣX    ( M → Σx )     Sum of column 1.
     ΣY    ( M → Σy )     Sum of column 2.  Needs ≥ 2 columns.
     ΣXY   ( M → Σxy )    Sum of column-1 * column-2.  ≥ 2 columns.
     ΣX²   ( M → Σx² )    Sum of column-1 squared.
     ΣY²   ( M → Σy² )    Sum of column-2 squared.  ≥ 2 columns.
     MAXΣ  ( M → V )      Per-column maximum.  Vector of length n.
     MINΣ  ( M → V )      Per-column minimum.  Vector of length n.

   All return Real (scalar) or Vector (per-column).  Empty Matrix →
   Bad argument value.  HP50 also accepts Vector input for ΣX, NΣ,
   ΣX²; we mirror that on the one-column ops but require ≥ 2-column
   Matrix for the paired ones.  Both MAXΣ / MINΣ accept Vector too
   (returning a 1-vector).
   ----------------------------------------------------------------- */

function _matStatsCol(M, j) {
  // Extract column j of Matrix M as numeric array.  Caller validates
  // that j < M.rows[0].length.
  const m = M.rows.length;
  if (m === 0) throw new RPLError('Bad argument value');
  const out = new Array(m);
  for (let i = 0; i < m; i++) out[i] = _statsNumericEntry(M.rows[i][j]);
  return out;
}

function _sumOfArr(a)  { let s = 0; for (const x of a) s += x; return s; }
function _sumOfSq(a)   { let s = 0; for (const x of a) s += x*x; return s; }
function _sumOfProd(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function _statsVectorOrMatrixCol0(v) {
  // For ΣX / ΣX² / NΣ — accept Vector (whole items) or Matrix (column 0).
  if (isVector(v)) {
    const n = v.items.length;
    if (n === 0) throw new RPLError('Bad argument value');
    return v.items.map(_statsNumericEntry);
  }
  if (isMatrix(v)) {
    return _matStatsCol(v, 0);
  }
  throw new RPLError('Bad argument type');
}

register('NSIGMA', (s) => {
  // Canonical name NΣ.  We register both the Unicode symbol NΣ and
  // this ASCII form so programs that type `NSIGMA` still work.
  const [M] = s.popN(1);
  if (isVector(M)) {
    if (M.items.length === 0) throw new RPLError('Bad argument value');
    s.push(Real(M.items.length));
    return;
  }
  if (isMatrix(M)) {
    if (M.rows.length === 0) throw new RPLError('Bad argument value');
    s.push(Real(M.rows.length));
    return;
  }
  throw new RPLError('Bad argument type');
});
register('NΣ', (s) => { lookup('NSIGMA').fn(s); });

register('ΣX', (s) => {
  const [v] = s.popN(1);
  const X = _statsVectorOrMatrixCol0(v);
  s.push(Real(_sumOfArr(X)));
});
register('SX', (s) => { lookup('ΣX').fn(s); });       // ASCII alias

register('ΣX2', (s) => {
  const [v] = s.popN(1);
  const X = _statsVectorOrMatrixCol0(v);
  s.push(Real(_sumOfSq(X)));
});
register('SX2', (s) => { lookup('ΣX2').fn(s); });

register('ΣY', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  s.push(Real(_sumOfArr(_matStatsCol(M, 1))));
});
register('SY', (s) => { lookup('ΣY').fn(s); });

register('ΣY2', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  s.push(Real(_sumOfSq(_matStatsCol(M, 1))));
});
register('SY2', (s) => { lookup('ΣY2').fn(s); });

register('ΣXY', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  const X = _matStatsCol(M, 0);
  const Y = _matStatsCol(M, 1);
  s.push(Real(_sumOfProd(X, Y)));
});
register('SXY', (s) => { lookup('ΣXY').fn(s); });

/* MAXΣ / MINΣ — per-column max / min. */
register('MAXΣ', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    const a = v.items.map(_statsNumericEntry);
    s.push(Vector([Real(Math.max(...a))]));
    return;
  }
  if (isMatrix(v)) {
    if (v.rows.length === 0) throw new RPLError('Bad argument value');
    const n = v.rows[0].length;
    const out = new Array(n);
    for (let j = 0; j < n; j++) {
      const col = _matStatsCol(v, j);
      out[j] = Real(Math.max(...col));
    }
    s.push(Vector(out));
    return;
  }
  throw new RPLError('Bad argument type');
});
register('MAXS', (s) => { lookup('MAXΣ').fn(s); });

register('MINΣ', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    const a = v.items.map(_statsNumericEntry);
    s.push(Vector([Real(Math.min(...a))]));
    return;
  }
  if (isMatrix(v)) {
    if (v.rows.length === 0) throw new RPLError('Bad argument value');
    const n = v.rows[0].length;
    const out = new Array(n);
    for (let j = 0; j < n; j++) {
      const col = _matStatsCol(v, j);
      out[j] = Real(Math.min(...col));
    }
    s.push(Vector(out));
    return;
  }
  throw new RPLError('Bad argument type');
});
register('MINS', (s) => { lookup('MINΣ').fn(s); });

/* --------------- LINFIT / LOGFIT / EXPFIT / PWRFIT / BESTFIT ----------
   HP50 AUR §18.1.  Regression family: fit the column-1 / column-2
   data in `M` (a 2-column Matrix) to one of four models:

     LINFIT : y = a + b·x            (linear)
     LOGFIT : y = a + b·ln x         (logarithmic)
     EXPFIT : y = a · e^(b·x)        (exponential)
     PWRFIT : y = a · x^b            (power)

   Each fit op returns two values on the stack:
     - the fitted-model Symbolic (a closed-form expression in `X`)
     - the correlation coefficient r (Real in [-1, 1])
   This matches HP50's `ΣLINE`-plus-`CORR` two-output convention so
   the user can see the quality of the fit alongside the model.

   BESTFIT selects the model with the largest |r| by trying all four
   and pushes the model name (String) — NOT the expression — on the
   stack.  This is the HP50 behavior: BESTFIT is diagnostic (which
   family is the best match?) rather than computational; the user
   then runs the chosen fit op to get the equation.

   Transformations that require positive values (log X, log Y, etc.)
   throw Bad argument value if a data point violates the domain.
   Real / Integer entries only; Complex is rejected by
   `_statsNumericEntry`.  Rows < 2 → Bad argument value.
   ----------------------------------------------------------------- */

function _linearFit(X, Y) {
  // Compute a + b·X fit; returns {a, b, r}.
  const n = X.length;
  const mX = _meanArr(X), mY = _meanArr(Y);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - mX, dy = Y[i] - mY;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx === 0) throw new RPLError('Infinite result');
  const b = sxy / sxx;
  const a = mY - b * mX;
  const r = (syy === 0) ? (sxy === 0 ? 1 : 0) : sxy / Math.sqrt(sxx * syy);
  return { a, b, r };
}

function _modelToSym(model, a, b) {
  // Build the AST for the fitted model.  `a`, `b` are plain numbers.
  const X = AstVar('X');
  if (model === 'LIN') {
    // a + b*X
    return Symbolic(AstBin('+', AstNum(a), AstBin('*', AstNum(b), X)));
  }
  if (model === 'LOG') {
    // a + b*ln(X)
    return Symbolic(AstBin('+', AstNum(a),
      AstBin('*', AstNum(b), AstFn('LN', [X]))));
  }
  if (model === 'EXP') {
    // a * exp(b*X)
    return Symbolic(AstBin('*', AstNum(a),
      AstFn('EXP', [AstBin('*', AstNum(b), X)])));
  }
  if (model === 'PWR') {
    // a * X^b
    return Symbolic(AstBin('*', AstNum(a), AstBin('^', X, AstNum(b))));
  }
  throw new RPLError('Bad argument value');
}

function _fitLINFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  const { a, b, r } = _linearFit(X, Y);
  return { sym: _modelToSym('LIN', a, b), r, a, b };
}
function _fitLOGFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const x of X) if (x <= 0) throw new RPLError('Bad argument value');
  const lnX = X.map(Math.log);
  const { a, b, r } = _linearFit(lnX, Y);
  return { sym: _modelToSym('LOG', a, b), r, a, b };
}
function _fitEXPFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const y of Y) if (y <= 0) throw new RPLError('Bad argument value');
  const lnY = Y.map(Math.log);
  const { a: A, b, r } = _linearFit(X, lnY);
  // Model: y = e^A · e^(b·x);  so a = e^A.
  const a = Math.exp(A);
  return { sym: _modelToSym('EXP', a, b), r, a, b };
}
function _fitPWRFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const x of X) if (x <= 0) throw new RPLError('Bad argument value');
  for (const y of Y) if (y <= 0) throw new RPLError('Bad argument value');
  const lnX = X.map(Math.log);
  const lnY = Y.map(Math.log);
  const { a: A, b, r } = _linearFit(lnX, lnY);
  const a = Math.exp(A);
  return { sym: _modelToSym('PWR', a, b), r, a, b };
}

register('LINFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitLINFIT(M);
  setLastFitModel('LIN', a, b);
  s.push(sym); s.push(Real(r));
});

register('LOGFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitLOGFIT(M);
  setLastFitModel('LOG', a, b);
  s.push(sym); s.push(Real(r));
});

register('EXPFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitEXPFIT(M);
  setLastFitModel('EXP', a, b);
  s.push(sym); s.push(Real(r));
});

register('PWRFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitPWRFIT(M);
  setLastFitModel('PWR', a, b);
  s.push(sym); s.push(Real(r));
});

register('BESTFIT', (s) => {
  const [M] = s.popN(1);
  // Try each fit; catch domain errors so negative-X data doesn't kill
  // the whole op when at least one fit succeeds.
  const candidates = [];
  try { const { r } = _fitLINFIT(M); candidates.push({ name: 'LIN', r }); } catch (_) {}
  try { const { r } = _fitLOGFIT(M); candidates.push({ name: 'LOG', r }); } catch (_) {}
  try { const { r } = _fitEXPFIT(M); candidates.push({ name: 'EXP', r }); } catch (_) {}
  try { const { r } = _fitPWRFIT(M); candidates.push({ name: 'PWR', r }); } catch (_) {}
  if (candidates.length === 0) {
    // Data violates every fit's domain — re-run LINFIT to surface the
    // underlying error message (typically Bad argument value / type).
    _fitLINFIT(M);
    // If the re-run didn't throw, bail generically.
    throw new RPLError('Bad argument value');
  }
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c.r) > Math.abs(best.r)) best = c;
  }
  s.push(Str(best.name));
});

/* --------------- CMPLX / CMPLX? — complex-mode toggle ----------------
   HP50 system flag -103 (`_Complex_` when SET, `_Real_` when CLEAR).

     CMPLX   ( →   )   Toggle the CMPLX flag.  No stack side effects;
                       fires a state-change event so any future MODES
                       annunciator redraws.
     CMPLX?  ( → b )   Push TRUE (1.) if CMPLX is currently ON, FALSE
                       (0.) otherwise.

   When CMPLX is ON, real-domain-violating ops (LN/LOG on negative
   Real, ACOS/ASIN on |x|>1) return the principal-branch Complex
   result instead of throwing.  Fresh calculators boot with CMPLX
   CLEAR — matches a factory-reset HP50.
   ----------------------------------------------------------------- */

register('CMPLX', (s) => {
  toggleComplexMode();
});

register('CMPLX?', (s) => {
  s.push(Real(getComplexMode() ? 1 : 0));
});

/* --------------- MERGE — directory merge --------------------------------
   HP50 AUR §3.2 (directory manipulation — this slot is `MERGE` in the
   `MEMORY` soft-menu; documented in §3.2.3 on the 49g+/50g ROM 2.15).

     MERGE  ( D → )   D is a list of (name, value) pairs — exactly the
                      output shape of VARS → ORDER-agnostic listing, i.e.
                      { NAME1 VAL1 NAME2 VAL2 ... }.  Each pair is stored
                      in the current directory, overwriting any
                      existing entry with the same name (HP50 behavior).
                      Empty list is a no-op.  Odd-length list or
                      non-Name keys → Bad argument value.  Accepts a
                      Directory value in the top position too: the
                      merged entries are taken from that directory's
                      Map (HP50 extension — useful for
                      programmatic configuration merges).

   Every merged value goes through `varStore`, which fires the
   state-change event once per store so subscribers redraw.
   ----------------------------------------------------------------- */

register('MERGE', (s) => {
  const [arg] = s.popN(1);
  if (isDirectory(arg)) {
    for (const [name, value] of arg.entries) {
      varStore(name, value);
    }
    return;
  }
  if (!isList(arg)) throw new RPLError('Bad argument type');
  const items = arg.items;
  if (items.length % 2 !== 0) {
    throw new RPLError('Bad argument value');
  }
  // Validate all keys first so a bad pair near the end doesn't leave
  // a half-merged directory.
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    if (!isName(key) && !isString(key)) {
      throw new RPLError('Bad argument value');
    }
  }
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    const val = items[i + 1];
    const name = isName(key) ? key.id : key.value;
    varStore(name, val);
  }
});

/* ==================================================================
   PEVAL / PTAYL / GRAMSCHMIDT / QR / CHOLESKY /
   C→P / P→C / EPSX0 / DISTRIB / RDM.

   HP50 AUR: §12.6 (PEVAL / PTAYL), §15.3 (GRAMSCHMIDT / QR /
   CHOLESKY), §4.4 (C→P / P→C), §11.6 (EPSX0), §11.3 (DISTRIB),
   §15.2 (RDM).

   All ops below are user-reachable via the typed catalog today.  No
   UI work.  GRAMSCHMIDT / QR / CHOLESKY / RDM operate on numeric
   Real/Integer entries (matching the `_invMatrixNumeric` /
   LSQ/LU rejection policy); PEVAL / PTAYL take coefficient lists in
   descending-degree order (same convention as HORNER / PCOEF /
   PROOT / QUOT / REMAINDER).  C→P / P→C are angle-mode aware so a
   user can flip DEG/RAD and see the ARG coordinate change.  EPSX0
   walks a Symbolic AST zeroing |num| below a fixed 1e-10 threshold;
   DISTRIB performs a single-pass distributive-law rewrite
   (a*(b+c) → a*b+a*c).
   ================================================================= */

/* --------------- PEVAL — evaluate polynomial at a point ---------------
   HP50 AUR §12.6.

     PEVAL  ( {c_n … c_0} x → p(x) )

   Evaluates a polynomial whose coefficients are in the list (descending
   order, same convention as HORNER / PCOEF / PROOT) at the scalar `x`
   via Horner's scheme.  Real / Integer / Complex coefficients and `x`
   accepted; Symbolic deferred with the polynomial-normalize pass.
   Empty list throws Bad argument value.  Single-element (constant
   polynomial) returns that constant regardless of `x`.
   ----------------------------------------------------------------- */

register('PEVAL', (s) => {
  const [poly, x] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(x) && !isInteger(x) && !isComplex(x)) {
    throw new RPLError('Bad argument type');
  }
  let r = poly.items[0];
  for (let i = 1; i < poly.items.length; i++) {
    r = _scalarBinary('+', _scalarBinary('*', r, x), poly.items[i]);
  }
  s.push(r);
});

/* --------------- PTAYL — polynomial Taylor basis change ---------------
   HP50 AUR §12.6.

     PTAYL  ( {c_n … c_0} a → {b_n … b_0} )

   Given a polynomial `p(x) = c_n x^n + … + c_0` as a coefficient list
   in descending degree, returns the coefficient list (also descending)
   of the same polynomial expressed in the shifted basis (x − a):
       p(x) = b_n (x − a)^n + b_{n−1} (x − a)^{n−1} + … + b_0.

   Equivalently, `b_k = p^{(k)}(a) / k!`, but we compute via iterated
   synthetic division at `a` (Horner-scheme); that also sidesteps any
   factorial precision concerns for large n.  The algorithm is:

     remainders = []
     while poly.length > 1:
       (poly, r) = syntheticDivide(poly, a)
       remainders.push(r)
     remainders.push(poly[0])
     return remainders.reverse()  // descending order

   Real / Integer / Complex coefficients and `a` accepted; Symbolic
   deferred.  Empty list throws Bad argument value.
   ----------------------------------------------------------------- */

register('PTAYL', (s) => {
  const [poly, a] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(a) && !isInteger(a) && !isComplex(a)) {
    throw new RPLError('Bad argument type');
  }
  // Repeated synthetic-division by (x − a).  After each sweep, the
  // quotient is one degree lower and the remainder is one shifted
  // coefficient.  Collect them low-order first, then reverse.
  let coefs = poly.items.slice();
  const shifted = [];                     // low-order first (b_0, b_1, …)
  while (coefs.length > 1) {
    // One Horner sweep: b[0]=c[0]; b[i] = b[i-1]·a + c[i].  Last b is
    // the remainder (= p_current(a)); the rest are the new quotient.
    const next = new Array(coefs.length - 1);
    let r = coefs[0];
    for (let i = 1; i < coefs.length; i++) {
      next[i - 1] = r;
      r = _scalarBinary('+', _scalarBinary('*', r, a), coefs[i]);
    }
    shifted.push(r);                      // b_k for current pass
    coefs = next;
  }
  shifted.push(coefs[0]);                 // the final leading b_n
  // Reverse to descending order (b_n … b_0).
  shifted.reverse();
  s.push(RList(shifted));
});

/* --------------- GRAMSCHMIDT — orthogonalize columns -------------------
   HP50 AUR §15.3.

     GRAMSCHMIDT  ( A → Q )

   Returns the matrix Q whose columns form an orthonormal basis for the
   column space of A, produced by the modified-Gram-Schmidt process.
   For a full-column-rank A, Q has the same shape as A; if a column
   becomes linearly dependent during orthogonalization (near-zero norm),
   we throw Infinite result — matching the HP50 behavior on singular
   inputs.  Real / Integer entries only (same policy as LU / LSQ).

   Algorithm (modified Gram-Schmidt, numerically stabler than classical):
     for k in 0..n-1:
       v_k = A[:,k]
       for j in 0..k-1:
         v_k = v_k - (Q[:,j] · v_k) · Q[:,j]
       r = ||v_k||
       if r < tol: throw Infinite result
       Q[:,k] = v_k / r
   ----------------------------------------------------------------- */

function _gramSchmidtNum(A) {
  // A is a plain 2-D number array (m × n).  Returns Q (m × n) with
  // orthonormal columns.  Throws Infinite result on near-singular.
  const m = A.length;
  const n = A[0].length;
  if (n > m) throw new RPLError('Invalid dimension');
  // Work column-major for clarity.
  const cols = [];
  for (let j = 0; j < n; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = A[i][j];
    cols.push(col);
  }
  const Q = [];
  for (let k = 0; k < n; k++) {
    let v = cols[k].slice();
    for (let j = 0; j < k; j++) {
      // proj = (Q[j] · v);  v -= proj · Q[j]
      let proj = 0;
      for (let i = 0; i < m; i++) proj += Q[j][i] * v[i];
      for (let i = 0; i < m; i++) v[i] -= proj * Q[j][i];
    }
    let norm = 0;
    for (let i = 0; i < m; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) throw new RPLError('Infinite result');
    for (let i = 0; i < m; i++) v[i] /= norm;
    Q.push(v);
  }
  // Rebuild as m × n row-major matrix from column slices.
  const rows = new Array(m);
  for (let i = 0; i < m; i++) {
    rows[i] = new Array(n);
    for (let j = 0; j < n; j++) rows[i][j] = Q[j][i];
  }
  return rows;
}

register('GRAMSCHMIDT', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  if (A.rows.length === 0) throw new RPLError('Invalid dimension');
  const Anum = _asNumArray2D(A.rows);
  const Q = _gramSchmidtNum(Anum);
  s.push(Matrix(Q.map(row => row.map(x => Real(x)))));
});

/* --------------- QR — QR decomposition ---------------------------------
   HP50 AUR §15.3.

     QR  ( A → Q R P )   A is m×n with m ≥ n.
                         Q is m×n with orthonormal columns
                         (Q^T · Q = I_n).  R is n×n upper-triangular.
                         P is the n×n permutation matrix selected by
                         column-pivoted QR — for the no-pivot path used
                         here, P is simply the identity (left in place
                         so callers can do `A · P = Q · R` in either
                         regime).  A = Q · R when P = I; else
                         A · P = Q · R.

   Real / Integer entries only.  Singular column (rank deficient)
   throws Infinite result via the underlying GRAMSCHMIDT helper.
   ----------------------------------------------------------------- */

register('QR', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (n === 0) throw new RPLError('Invalid dimension');
  if (m < n) throw new RPLError('Invalid dimension');
  const Anum = _asNumArray2D(A.rows);
  const Qnum = _gramSchmidtNum(Anum);   // m × n
  // R = Q^T · A, but only its upper-triangular (R[j][k] for j ≤ k).
  const R = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      if (k < j) { row[k] = 0; continue; }
      let acc = 0;
      for (let i = 0; i < m; i++) acc += Qnum[i][j] * Anum[i][k];
      row[k] = acc;
    }
    R.push(row);
  }
  // Identity permutation (no column pivoting in this path).
  const P = [];
  for (let i = 0; i < n; i++) {
    const pr = new Array(n).fill(0);
    pr[i] = 1;
    P.push(pr);
  }
  s.push(Matrix(Qnum.map(row => row.map(x => Real(x)))));
  s.push(Matrix(R.map(row => row.map(x => Real(x)))));
  s.push(Matrix(P.map(row => row.map(x => Real(x)))));
});

/* --------------- CHOLESKY — Cholesky decomposition ---------------------
   HP50 AUR §15.3.

     CHOLESKY  ( A → L )   A is an n×n symmetric positive-definite
                           Matrix.  L is the lower-triangular factor
                           with L·L^T = A.  Non-square → Invalid
                           dimension; non-symmetric → Bad argument
                           value; non-positive-definite (any pivot ≤ 0
                           inside the sqrt) → Infinite result.
                           Real / Integer entries only.

   Algorithm (standard Cholesky-Banachiewicz):
     for i = 0..n-1:
       for j = 0..i:
         s = A[i][j] - sum_{k=0..j-1} L[i][k] * L[j][k]
         L[i][j] = (i == j) ? sqrt(s) : s / L[j][j]
   ----------------------------------------------------------------- */

register('CHOLESKY', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  const M = _asNumArray2D(A.rows);
  // Symmetry check.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(M[i][j] - M[j][i]) > 1e-10 * (1 + Math.abs(M[i][j]))) {
        throw new RPLError('Bad argument value');
      }
    }
  }
  const L = [];
  for (let i = 0; i < n; i++) L.push(new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let acc = M[i][j];
      for (let k = 0; k < j; k++) acc -= L[i][k] * L[j][k];
      if (i === j) {
        if (acc <= 0) throw new RPLError('Infinite result');
        L[i][j] = Math.sqrt(acc);
      } else {
        if (L[j][j] === 0) throw new RPLError('Infinite result');
        L[i][j] = acc / L[j][j];
      }
    }
  }
  s.push(Matrix(L.map(row => row.map(x => Real(x)))));
});

/* --------------- C→P / P→C — complex cartesian ↔ polar ---------------
   HP50 AUR §4.4.  Converts between rectangular (x, y) and polar
   (r, θ) representations of a Complex value.  θ is expressed in the
   current angle mode via `fromRadians` / `toRadians` so the same op
   round-trips across DEG / RAD / GRAD.

     C→P  ( (x, y) → (r, θ) )
              where r = √(x²+y²), θ = atan2(y, x) converted from
              radians.  Real input promotes to (x, 0), then r = |x|,
              θ = 0 (positive) or π (negative).  Zero → (0, 0).
     P→C  ( (r, θ) → (x, θ)_x,y )
              Inverse: x = r·cos θ, y = r·sin θ with θ interpreted in
              the current angle mode.  r may be negative: HP50 treats
              that as flipping 180°, so the result is still a valid
              Cartesian pair.

   Both come in ASCII-alias forms `C->P` / `P->C` too.  Vector / Matrix
   and Symbolic inputs rejected — the op is strictly scalar-complex.
   ----------------------------------------------------------------- */

function _cToPOp(s) {
  const v = s.pop();
  let re, im;
  if (isComplex(v))       { re = v.re;                im = v.im; }
  else if (isReal(v))     { re = v.value.toNumber();  im = 0;    }
  else if (isInteger(v))  { re = Number(v.value);     im = 0;    }
  else throw new RPLError('Bad argument type');
  const r = Math.hypot(re, im);
  const th = Math.atan2(im, re);
  s.push(Complex(r, fromRadians(th)));
}
register('C→P',  _cToPOp);
register('C->P', _cToPOp);

function _pToCOp(s) {
  const v = s.pop();
  let r, thUser;
  if (isComplex(v))       { r = v.re;                thUser = v.im; }
  else if (isReal(v))     { r = v.value.toNumber();  thUser = 0;    }
  else if (isInteger(v))  { r = Number(v.value);     thUser = 0;    }
  else throw new RPLError('Bad argument type');
  const th = toRadians(thUser);
  s.push(Complex(r * Math.cos(th), r * Math.sin(th)));
}
register('P→C',  _pToCOp);
register('P->C', _pToCOp);

/* --------------- EPSX0 — zero out small numeric values ----------------
   HP50 AUR §11.6.  Walks a Symbolic AST and replaces every numeric
   node whose absolute value is below the CAS threshold (HP50 reads the
   variable `EPS` from the current directory; we use a fixed 1e-10 as
   the default, matching the HP50 factory setting).  The replacement
   is done in a fresh AST so the input expression is not mutated.

   Pass-through on non-Symbolic (Real / Integer / BinInt / Complex) —
   the scalar is compared directly and, if below threshold, replaced
   with Integer(0).  List / Vector / Matrix inputs apply the op
   element-wise.

     EPSX0  ( Sy → Sy' )
              Walks the AST.  Numeric node with |value| < 1e-10 → 0.
              Other nodes recurse into children.

   Simplification after substitution is deferred to the caller
   (chaining with SIMPLIFY is the HP50 idiom).  Output is always
   Symbolic, preserving the input kind so `SIMPLIFY` can close the
   loop.
   ----------------------------------------------------------------- */

const _EPSX0_THRESHOLD = 1e-10;

function _epsx0Ast(ast) {
  if (astIsNum(ast)) {
    if (Math.abs(ast.value) < _EPSX0_THRESHOLD) return AstNum(0);
    return ast;
  }
  if (ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _epsx0Ast(ast.arg);
    // If inner collapsed to num 0, drop the neg.
    if (astIsNum(inner) && inner.value === 0) return AstNum(0);
    return AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    return AstBin(ast.op, _epsx0Ast(ast.l), _epsx0Ast(ast.r));
  }
  if (ast.kind === 'fn') {
    return AstFn(ast.name, ast.args.map(_epsx0Ast));
  }
  return ast;
}

function _epsx0Scalar(v) {
  if (isInteger(v)) {
    // Integers are exact — below-threshold only if the value is 0.
    return v.value === 0n ? Integer(_ZERO) : v;
  }
  if (isReal(v)) {
    return v.value.abs().lt(_EPSX0_THRESHOLD) ? Real(0) : v;
  }
  if (isComplex(v)) {
    const r = Math.abs(v.re) < _EPSX0_THRESHOLD ? 0 : v.re;
    const i = Math.abs(v.im) < _EPSX0_THRESHOLD ? 0 : v.im;
    if (i === 0) return Real(r);
    return Complex(r, i);
  }
  return v;
}

register('EPSX0', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    s.push(Symbolic(_epsx0Ast(v.expr)));
    return;
  }
  if (isReal(v) || isInteger(v) || isComplex(v)) {
    s.push(_epsx0Scalar(v));
    return;
  }
  if (isList(v)) {
    s.push(RList(v.items.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    })));
    return;
  }
  if (isVector(v)) {
    s.push(Vector(v.items.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    })));
    return;
  }
  if (isMatrix(v)) {
    s.push(Matrix(v.rows.map(row => row.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    }))));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* --------------- DISTRIB — distribute multiplication over addition ----
   HP50 AUR §11.3.  Applies the distributive law to the outermost
   eligible binary node of a Symbolic expression — that is:

     a*(b+c) → a*b + a*c
     a*(b-c) → a*b - a*c
     (b+c)*a → b*a + c*a
     (b-c)*a → b*a - c*a

   and likewise for division over addition on the left:

     (b+c)/a → b/a + c/a
     (b-c)/a → b/a - c/a

   The HP50 applies exactly ONE distribute step per invocation — to
   expand fully, the user calls DISTRIB repeatedly (or uses EXPAND).
   Our implementation is top-down: recurse through the AST until the
   first distributable node is found, rewrite it, return — no further
   passes on the same tree.  Non-distributable expression is
   returned unchanged.  Non-Symbolic input throws Bad argument type.
   ----------------------------------------------------------------- */

function _distribOnce(ast) {
  // Returns [newAst, changed].  Visits in pre-order (root first),
  // rewrites the first a*(b±c), (b±c)*a, or (b±c)/a it finds, and
  // stops.  If none found, returns [ast, false].
  if (ast.kind === 'bin') {
    if (ast.op === '*') {
      if (ast.r.kind === 'bin' && (ast.r.op === '+' || ast.r.op === '-')) {
        // a * (b op c) → (a*b) op (a*c)
        return [AstBin(ast.r.op,
          AstBin('*', ast.l, ast.r.l),
          AstBin('*', ast.l, ast.r.r)), true];
      }
      if (ast.l.kind === 'bin' && (ast.l.op === '+' || ast.l.op === '-')) {
        // (b op c) * a → (b*a) op (c*a)
        return [AstBin(ast.l.op,
          AstBin('*', ast.l.l, ast.r),
          AstBin('*', ast.l.r, ast.r)), true];
      }
    }
    if (ast.op === '/') {
      if (ast.l.kind === 'bin' && (ast.l.op === '+' || ast.l.op === '-')) {
        // (b op c) / a → (b/a) op (c/a)
        return [AstBin(ast.l.op,
          AstBin('/', ast.l.l, ast.r),
          AstBin('/', ast.l.r, ast.r)), true];
      }
    }
    // Recurse into children — left first.
    const [lNew, lCh] = _distribOnce(ast.l);
    if (lCh) return [AstBin(ast.op, lNew, ast.r), true];
    const [rNew, rCh] = _distribOnce(ast.r);
    if (rCh) return [AstBin(ast.op, ast.l, rNew), true];
    return [ast, false];
  }
  if (ast.kind === 'neg') {
    const [inner, ch] = _distribOnce(ast.arg);
    return ch ? [AstNeg(inner), true] : [ast, false];
  }
  if (ast.kind === 'fn') {
    for (let i = 0; i < ast.args.length; i++) {
      const [newArg, ch] = _distribOnce(ast.args[i]);
      if (ch) {
        const newArgs = ast.args.slice();
        newArgs[i] = newArg;
        return [AstFn(ast.name, newArgs), true];
      }
    }
    return [ast, false];
  }
  return [ast, false];
}

register('DISTRIB', (s) => {
  const v = s.pop();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const [newAst, _ch] = _distribOnce(v.expr);
  s.push(Symbolic(newAst));
});

/* --------------- RDM — redimension Vector / Matrix --------------------
   HP50 AUR §15.2.

     RDM  ( V {n}    → V' )     reshape Vector to length-n Vector
     RDM  ( V {m n}  → M )      reshape Vector to m×n Matrix
     RDM  ( M {n}    → V )      reshape Matrix to length-n Vector
     RDM  ( M {m n}  → M' )     reshape Matrix to m'×n' Matrix

   The total element count must match (m·n == |V| or m'·n' == m·n);
   otherwise throws Invalid dimension.  Reading / writing is row-major
   for Matrix shapes.  Entries are preserved as-is (no coercion); the
   shape list may be `{n}` or `{m n}`.  Negative / zero dimensions →
   Bad argument value.

   Source entries can be any type — we just shuffle them.  Unlike
   CON / IDN / RANM, RDM keeps heterogeneous entries too (Real and
   Integer mixed, Symbolic, Complex).
   ----------------------------------------------------------------- */

function _shapeFromList(L) {
  // Extract a shape from a list (either {n} or {m n}).  Returns
  // { rows, cols } with rows === null for 1-D (Vector) reshape.
  if (!isList(L)) throw new RPLError('Bad argument type');
  if (L.items.length === 1) {
    const n = L.items[0];
    if (!isInteger(n) && !(isReal(n) && n.value.isInteger())) {
      throw new RPLError('Bad argument type');
    }
    const nn = isInteger(n) ? Number(n.value) : n.value.toNumber();
    if (nn <= 0) throw new RPLError('Bad argument value');
    return { rows: null, cols: nn };
  }
  if (L.items.length === 2) {
    const m = L.items[0], n = L.items[1];
    if ((!isInteger(m) && !(isReal(m) && m.value.isInteger())) ||
        (!isInteger(n) && !(isReal(n) && n.value.isInteger()))) {
      throw new RPLError('Bad argument type');
    }
    const mm = isInteger(m) ? Number(m.value) : m.value.toNumber();
    const nn = isInteger(n) ? Number(n.value) : n.value.toNumber();
    if (mm <= 0 || nn <= 0) throw new RPLError('Bad argument value');
    return { rows: mm, cols: nn };
  }
  throw new RPLError('Bad argument value');
}

register('RDM', (s) => {
  const [src, shape] = s.popN(2);
  const { rows, cols } = _shapeFromList(shape);
  // Flatten source to a single array (row-major for Matrix).
  let flat;
  if (isVector(src)) {
    flat = src.items.slice();
  } else if (isMatrix(src)) {
    flat = [];
    for (const row of src.rows) for (const e of row) flat.push(e);
  } else {
    throw new RPLError('Bad argument type');
  }
  const want = rows === null ? cols : rows * cols;
  if (flat.length !== want) throw new RPLError('Invalid dimension');
  if (rows === null) {
    s.push(Vector(flat));
    return;
  }
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push(flat.slice(i * cols, (i + 1) * cols));
  }
  s.push(Matrix(out));
});

/* =================================================================
   LQ, COND, HERMITE, LEGENDRE, TCHEBYCHEFF.

   HP50 AUR: §15.3 (LQ), §15.4 (COND), §12.5 (HERMITE / LEGENDRE /
   TCHEBYCHEFF orthogonal-polynomial generators).

   All ops below are user-reachable via the typed catalog today.  No
   UI work.  LQ is the row-analog of QR — same `_gramSchmidtNum` helper
   but applied to Aᵀ, so the result rows are orthonormal instead of
   the columns.  COND is the 1-norm condition number (`CNRM(A) ·
   CNRM(INV A)`), so its building blocks (CNRM + matrix INV) already
   ship.  The polynomial-generator trio return a Symbolic expression
   in `X` — the HP50 firmware form.  Construction goes through the
   `_coefArrToSymbolicX` helper so DISTRIB / EPSX0 / SUBST can be
   composed downstream.
   ================================================================= */

/* --------------- LQ — LQ decomposition --------------------------------
   HP50 AUR §15.3.

     LQ  ( A → L Q P )   A is m×n with m ≤ n.
                         L is m×m lower-triangular.
                         Q is m×n with orthonormal rows
                         (Q · Qᵀ = I_m).  P is the m×m row-permutation
                         matrix selected by row-pivoted LQ — for the
                         no-pivot path used here, P is the identity,
                         so `A = L · Q` directly.

   Real / Integer entries only.  Rank-deficient row (residual norm
   below 1e-12) throws Infinite result via `_gramSchmidtNum` on Aᵀ.

   Algorithm:  LQ(A) ≡ transpose of QR(Aᵀ).
     Let Aᵀ = Q₁ · R₁ via Gram-Schmidt on Aᵀ (columns of Aᵀ = rows of A).
     Then A = R₁ᵀ · Q₁ᵀ; set L = R₁ᵀ, Q = Q₁ᵀ.
   ----------------------------------------------------------------- */

register('LQ', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (n === 0) throw new RPLError('Invalid dimension');
  if (m > n) throw new RPLError('Invalid dimension');
  // Build Aᵀ as a plain m×n-transposed (n×m) numeric array.
  const Anum = _asNumArray2D(A.rows);
  const AtNum = new Array(n);
  for (let i = 0; i < n; i++) {
    AtNum[i] = new Array(m);
    for (let j = 0; j < m; j++) AtNum[i][j] = Anum[j][i];
  }
  // Q₁ is n×m with orthonormal columns (Gram-Schmidt on columns of Aᵀ).
  const Q1 = _gramSchmidtNum(AtNum);
  // R₁ (m×m upper-tri) = Q₁ᵀ · Aᵀ; we only need R₁[j][k] for j ≤ k.
  const R1 = [];
  for (let j = 0; j < m; j++) {
    const row = new Array(m).fill(0);
    for (let k = j; k < m; k++) {
      let acc = 0;
      for (let i = 0; i < n; i++) acc += Q1[i][j] * AtNum[i][k];
      row[k] = acc;
    }
    R1.push(row);
  }
  // L = R₁ᵀ (m×m, lower-triangular).
  const L = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(m).fill(0);
    for (let j = 0; j <= i; j++) row[j] = R1[j][i];
    L.push(row);
  }
  // Q = Q₁ᵀ (m×n with orthonormal rows).
  const Q = [];
  for (let j = 0; j < m; j++) {
    const row = new Array(n);
    for (let i = 0; i < n; i++) row[i] = Q1[i][j];
    Q.push(row);
  }
  // Identity row-permutation (no pivoting in this path).
  const P = [];
  for (let i = 0; i < m; i++) {
    const pr = new Array(m).fill(0);
    pr[i] = 1;
    P.push(pr);
  }
  s.push(Matrix(L.map(row => row.map(x => Real(x)))));
  s.push(Matrix(Q.map(row => row.map(x => Real(x)))));
  s.push(Matrix(P.map(row => row.map(x => Real(x)))));
});

/* --------------- COND — 1-norm condition number -----------------------
   HP50 AUR §15.4.

     COND  ( A → κ )   A must be square.  κ = CNRM(A) · CNRM(INV A),
                       the 1-norm (max column absolute-sum) condition
                       number.  A singular (INV throws Infinite result)
                       → Infinite result.  Non-square → Invalid
                       dimension.  Real / Integer entries only.

   Uses the `CNRM` and `INV` paths already in place — the 1-norm of an
   m×m numeric matrix plus one explicit inverse.  For a perfectly-
   conditioned matrix the result is 1; for singular or near-singular
   inputs it blows up.  HP50 also documents `COND(I) = n` for the
   identity; we get `CNRM(I) = 1` and `CNRM(INV I) = CNRM(I) = 1`,
   so our value is 1 — matching what most linear-algebra texts call
   the 1-norm condition number.  The HP50's `COND(I) = n` is a
   documentation curiosity (it uses the row 1-norm on a different
   scaling); we follow the textbook definition, which is more useful.
   ----------------------------------------------------------------- */

register('COND', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (m !== n) throw new RPLError('Invalid dimension');
  // Reject Symbolic entries up front (same policy as CNRM / NORM /
  // _invMatrixNumeric).  Complex is allowed: |z| magnitude is fine,
  // and INV handles complex matrices via _invMatrixNumeric.
  for (const row of A.rows) {
    for (const x of row) {
      if (!isReal(x) && !isInteger(x) && !isComplex(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  // CNRM(A).
  let normA = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += _magEntry(A.rows[i][j]);
    if (sum > normA) normA = sum;
  }
  // CNRM(INV A).  Propagates Infinite result on singular inputs.
  const Ainv = _invMatrixNumeric(A.rows);
  let normI = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += _magEntry(Ainv[i][j]);
    if (sum > normI) normI = sum;
  }
  s.push(Real(normA * normI));
});

/* --------------- HERMITE / LEGENDRE / TCHEBYCHEFF ----------------------
   HP50 AUR §12.5.  Orthogonal-polynomial generators.  Each takes a
   non-negative Integer / Real-integer `n` and returns the order-n
   polynomial as a Symbolic expression in `X`.

     HERMITE      (n → H_n(X))    physicist's Hermite:
                  H_0 = 1, H_1 = 2X,
                  H_{k+1} = 2·X·H_k - 2·k·H_{k-1}
     LEGENDRE     (n → P_n(X))    P_0 = 1, P_1 = X,
                  (k+1) P_{k+1} = (2k+1)·X·P_k - k·P_{k-1}
     TCHEBYCHEFF  (n → T_n(X))    first-kind Chebyshev:
                  T_0 = 1, T_1 = X,
                  T_{k+1} = 2·X·T_k - T_{k-1}
                  HP50 also accepts negative n for the second-kind
                  variant U_{|n|-1} — not implemented here (returns
                  Bad argument value); deferred until the full
                  TCHEBYCHEFF suite is needed.

   ASCII aliases: `TCHEB` (the HP50 catalog spelling uses two forms;
   the web UI already auto-completes the full spelling).

   The work happens on a plain JS coefficient array (descending
   degree) via the standard three-term recurrences.  Once the array
   is built, `_coefArrToSymbolicX` converts it into an expanded
   Symbolic AST (no fancy collection — the recurrences already keep
   each polynomial in normal form).
   ----------------------------------------------------------------- */

function _coefArrToSymbolicX(coefs) {
  // coefs: descending-degree plain-number array.  Builds a Symbolic
  // AST in `X`.  Zero entries are skipped; the leading sign is
  // absorbed into the first non-zero term so the output looks
  // textbook-like (e.g. "2·X^3 - X" not "2·X^3 + -1·X").
  const X = AstVar('X');
  const deg = coefs.length - 1;
  let ast = null;
  for (let i = 0; i < coefs.length; i++) {
    const c = coefs[i];
    if (c === 0) continue;
    const pow = deg - i;
    // Build the |c|·X^pow term (without sign), then attach with + or -.
    const ac = Math.abs(c);
    let factor;
    if (pow === 0) {
      factor = AstNum(ac);
    } else {
      const Xpow = (pow === 1) ? X : AstBin('^', X, AstNum(pow));
      factor = (ac === 1) ? Xpow : AstBin('*', AstNum(ac), Xpow);
    }
    if (ast === null) {
      ast = c < 0 ? AstNeg(factor) : factor;
    } else {
      ast = AstBin(c < 0 ? '-' : '+', ast, factor);
    }
  }
  if (ast === null) ast = AstNum(0);
  return Symbolic(ast);
}

function _nFromIntegerArg(v) {
  // Accept Integer or integer-valued Real.  Return a non-negative
  // plain JS number; negative or non-integer throws the usual errors.
  let n;
  if (isInteger(v)) {
    n = Number(v.value);
  } else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n < 0) throw new RPLError('Bad argument value');
  return n;
}

function _polyScale(arr, k) {
  // arr (descending-degree); multiply every entry by k (plain number).
  return arr.map(c => c * k);
}

function _polyShiftUp(arr) {
  // Multiply poly (descending-degree) by X → append a trailing 0.
  return arr.concat([0]);
}

function _polyAdd(a, b) {
  // Add two descending-degree polys, aligning by trailing (constant)
  // end.  Returns a new descending-degree array whose length is
  // max(len(a), len(b)).
  const la = a.length, lb = b.length;
  const L = Math.max(la, lb);
  const out = new Array(L).fill(0);
  for (let i = 0; i < la; i++) out[L - la + i] += a[i];
  for (let i = 0; i < lb; i++) out[L - lb + i] += b[i];
  return out;
}

register('HERMITE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  // Recurrence on coefficient arrays (descending degree).
  //   H_0 = [1], H_1 = [2, 0],
  //   H_{k+1} = 2·X·H_k − 2k·H_{k-1}
  if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (n === 1) { s.push(_coefArrToSymbolicX([2, 0])); return; }
  let prev = [1];        // H_0
  let curr = [2, 0];     // H_1
  for (let k = 1; k < n; k++) {
    // 2·X·H_k  (shift up, scale by 2)
    const twoXHk = _polyScale(_polyShiftUp(curr), 2);
    // 2k·H_{k-1}
    const twoKPrev = _polyScale(prev, 2 * k);
    // H_{k+1} = 2·X·H_k − 2k·H_{k-1}
    const next = _polyAdd(twoXHk, _polyScale(twoKPrev, -1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
});

register('LEGENDRE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  // Recurrence (Bonnet):
  //   P_0 = [1], P_1 = [1, 0],
  //   (k+1) P_{k+1} = (2k+1)·X·P_k − k·P_{k-1}
  if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (n === 1) { s.push(_coefArrToSymbolicX([1, 0])); return; }
  let prev = [1];        // P_0
  let curr = [1, 0];     // P_1
  for (let k = 1; k < n; k++) {
    const a = _polyScale(_polyShiftUp(curr), 2 * k + 1);
    const b = _polyScale(prev, k);
    const sumArr = _polyAdd(a, _polyScale(b, -1));
    const next = _polyScale(sumArr, 1 / (k + 1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
});

function _tchebOp(s) {
  const [v] = s.popN(1);
  // TCHEBYCHEFF accepts Integer / integer-valued Real.  Non-negative
  // n selects the first-kind Chebyshev polynomial T_n(X); negative n
  // selects the second-kind U_{|n|-1}(X), matching HP50 AUR §12.5.
  // Non-integer or non-numeric throws.
  let n;
  if (isInteger(v)) {
    n = Number(v.value);
  } else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n >= 0) {
    // First-kind: T_0 = [1], T_1 = [1, 0],
    //             T_{k+1} = 2·X·T_k − T_{k-1}
    if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
    if (n === 1) { s.push(_coefArrToSymbolicX([1, 0])); return; }
    let prev = [1];        // T_0
    let curr = [1, 0];     // T_1
    for (let k = 1; k < n; k++) {
      const twoXTk = _polyScale(_polyShiftUp(curr), 2);
      const next = _polyAdd(twoXTk, _polyScale(prev, -1));
      prev = curr;
      curr = next;
    }
    s.push(_coefArrToSymbolicX(curr));
    return;
  }
  // Second-kind U_{|n|-1}(X): U_0 = [1], U_1 = [2, 0],
  //                           U_{k+1} = 2·X·U_k − U_{k-1}
  const m = (-n) - 1;
  if (m === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (m === 1) { s.push(_coefArrToSymbolicX([2, 0])); return; }
  let prev = [1];         // U_0
  let curr = [2, 0];      // U_1
  for (let k = 1; k < m; k++) {
    const twoXUk = _polyScale(_polyShiftUp(curr), 2);
    const next = _polyAdd(twoXUk, _polyScale(prev, -1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
}
register('TCHEBYCHEFF', _tchebOp);
register('TCHEB',       _tchebOp);

/* --------------- CYCLOTOMIC — nth cyclotomic polynomial --------------
   HP50 AUR §12.6.  CYCLOTOMIC(n) returns Φ_n(X) as a Symbolic in X —
   the monic polynomial in Z[X] whose roots are exactly the primitive
   n-th roots of unity.  Degree is Euler's totient φ(n).

     CYCLOTOMIC  ( n → Sy )

   Computed recursively via the identity
       X^n − 1 = ∏_{d | n} Φ_d(X)
   rearranged to
       Φ_n(X) = (X^n − 1) / ∏_{d | n, d < n} Φ_d(X)
   Walking d = 1 upward and caching every Φ_d produces Φ_n in n exact
   polynomial divisions over Z[X].  BigInt coefficients internally
   because cyclotomic coefficients can explode in magnitude for
   composite n (Φ_105 has a −2, Φ_385 has a −22, and the family grows
   unboundedly).  Output rides through `_coefArrToSymbolicX` after
   converting BigInt→Number with a MAX_SAFE_INTEGER guard; n > 200
   rejects with `Bad argument value` because that's the practical
   boundary where coefficient magnitude can exceed 2^53 in rare cases
   and the in-tree Symbolic AST uses plain-Number literals.

   Rejections:
     n ≤ 0                 → Bad argument value
     non-integer Real      → Bad argument value (via _nFromIntegerArg)
     non-numeric           → Bad argument type (via _nFromIntegerArg)
     n > 200               → Bad argument value (precision cap).
*/

function _polyDivBig(p, q) {
  // p / q, both descending-degree BigInt arrays; assumes q divides p
  // exactly over Z[X] (cyclotomic invariant).  Returns the quotient.
  const pa = p.slice();
  const ql = q.length;
  const qLead = q[0];
  const quotLen = pa.length - ql + 1;
  const out = new Array(quotLen);
  for (let i = 0; i < quotLen; i++) {
    const factor = pa[i] / qLead;
    out[i] = factor;
    for (let j = 0; j < ql; j++) {
      pa[i + j] -= factor * q[j];
    }
  }
  return out;
}

function _cyclotomicCoefsBig(n) {
  // n ≥ 1.  Φ_n as a descending-degree BigInt coefficient array.
  if (n === 1) return [1n, -1n];
  const phi = new Map();
  phi.set(1, [1n, -1n]);
  for (let k = 2; k <= n; k++) {
    // Numerator X^k − 1  →  [1, 0, …, 0, −1]  (length k+1)
    let num = new Array(k + 1).fill(0n);
    num[0] = 1n;
    num[k] = -1n;
    for (let d = 1; d < k; d++) {
      if (k % d === 0) num = _polyDivBig(num, phi.get(d));
    }
    phi.set(k, num);
  }
  return phi.get(n);
}

function _coefBigArrToSymbolicX(coefs) {
  // Convert BigInt descending-degree coef array to Symbolic(X), via
  // the same helper the Hermite/Legendre/Tcheb families use.  Throws
  // `Bad argument value` if any coefficient exceeds MAX_SAFE_INTEGER
  // (i.e. BigInt→Number loses precision).
  const asNums = coefs.map(c => {
    const asNum = Number(c);
    if (!Number.isFinite(asNum) || BigInt(asNum) !== c) {
      throw new RPLError('Bad argument value');
    }
    return asNum;
  });
  return _coefArrToSymbolicX(asNums);
}

register('CYCLOTOMIC', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  if (n < 1) throw new RPLError('Bad argument value');
  if (n > 200) throw new RPLError('Bad argument value');
  s.push(_coefBigArrToSymbolicX(_cyclotomicCoefsBig(n)));
});

/* ---- ZETA — Riemann zeta ---------------------------------------------
   HP50 AUR §2 (CAS-SPECIAL).  One-arg Riemann zeta function.

     ZETA  ( s → ζ(s) )       1-arg: real Riemann zeta.

   Domain handling:
     s = 1                    → Infinite result   (simple pole)
     s = even negative Integer → exact 0           (trivial zeros)
     s = 0                    → -1/2 (Real)
     s < 1/2 (and s ≠ 0)      → functional-equation reflection
                                 ζ(s) = 2ˢ π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s)
     s ≥ 1/2 (and s ≠ 1)      → Euler-Maclaurin direct summation

   Euler-Maclaurin (NR §5.3):
     ζ(s) ≈ Σ_{k=1}^{N-1} k⁻ˢ + N^(1-s)/(s-1) + (1/2)N⁻ˢ
            + Σ_{j=1}^{M} (B_{2j}/(2j)!) (s)_{2j-1} N^(-s-2j+1)
   with N = 15 and M = 6 Bernoulli terms (B_2 … B_12 used).
   Accuracy ≲ 1e-13 over s ∈ [1/2, ∞)\{1} in double precision; plenty
   for the HP50 10-digit display.

   Symbolic / Name input lifts to `ZETA(x)`; Tagged transparent;
   List / Vector / Matrix distribute element-wise.
*/
const _ZETA_EM_N = 15;
const _ZETA_EM_B = Object.freeze([
  1/6,        // B_2
  -1/30,      // B_4
  1/42,       // B_6
  -1/30,      // B_8
  5/66,       // B_10
  -691/2730,  // B_12
]);
const _ZETA_EM_F = Object.freeze([
  2,          // 2!
  24,         // 4!
  720,        // 6!
  40320,      // 8!
  3628800,    // 10!
  479001600,  // 12!
]);

function _zetaEulerMaclaurin(s) {
  // Precondition: s >= 0.5 and s !== 1.  Direct summation with EM tail.
  let sum = 0;
  for (let k = 1; k < _ZETA_EM_N; k++) sum += Math.pow(k, -s);
  sum += Math.pow(_ZETA_EM_N, 1 - s) / (s - 1);
  sum += 0.5 * Math.pow(_ZETA_EM_N, -s);
  // EM correction — add Σ (B_{2j}/(2j)!) · (s)_{2j-1} · N^(-s-2j+1).
  // (Derived from Σ_{k≥N} f(k) ≈ ∫ + f(N)/2 − Σ B_{2m}/(2m)! f^(2m-1)(N);
  //  f^(2m-1)(N) = −(s)_{2m-1} N^(-s-2m+1), so the two minuses combine to +.)
  let poch = s;                              // (s)_1 at j = 1
  let Nexp = Math.pow(_ZETA_EM_N, -s - 1);   // N^(-s-2j+1) at j = 1
  const invNsq = 1 / (_ZETA_EM_N * _ZETA_EM_N);
  for (let j = 1; j <= _ZETA_EM_B.length; j++) {
    sum += (_ZETA_EM_B[j - 1] / _ZETA_EM_F[j - 1]) * poch * Nexp;
    // Step: Pochhammer picks up two more factors (s+2j-1)(s+2j);
    // exponent drops by 2 (multiply by 1/N²).
    poch *= (s + 2 * j - 1) * (s + 2 * j);
    Nexp *= invNsq;
  }
  return sum;
}

function _zeta(s) {
  if (!Number.isFinite(s)) throw new RPLError('Bad argument value');
  if (s === 1) throw new RPLError('Infinite result');
  if (s === 0) return -0.5;
  // Trivial zeros: ζ(-2k) = 0 for k ≥ 1.  Catch as exact 0 so the
  // reflection path doesn't multiply Γ(1-s) → finite by a computed
  // sin(πs/2) that's only near-zero.
  if (s < 0 && Number.isInteger(s) && (s % 2) === 0) return 0;
  if (s < 0.5) {
    // Reflection: ζ(s) = 2^s π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s).
    // 1-s ≥ 0.5, so the recursive call lands in the EM branch.
    const sinPart = Math.sin(Math.PI * s / 2);
    const g = _gamma(1 - s);
    const z = _zeta(1 - s);
    return Math.pow(2, s) * Math.pow(Math.PI, s - 1) * sinPart * g * z;
  }
  return _zetaEulerMaclaurin(s);
}

function _zetaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('ZETA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_zeta(x));
}

register('ZETA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_zetaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_zetaScalar))));
  else                  s.push(_zetaScalar(v));
})));

/* ---- LAMBERT — principal-branch Lambert W₀ ---------------------------
   HP50 AUR §2 (CAS-SPECIAL).  One-arg Lambert W function, principal
   branch W₀.  Solves  W · e^W = x  for W ∈ ℝ given real x ≥ -1/e.

     LAMBERT  ( x → W₀(x) )

   Domain:
     x < -1/e              → Bad argument value (no real solution)
     x = -1/e              → W₀(-1/e) = -1  (branch point)
     x = 0                 → 0
     x > 0                 → unique positive W
     -1/e < x < 0          → unique W in (-1, 0)

   Numerical method: Halley iteration on f(W) = W eᵂ − x.  Halley's
   correction vs. plain Newton kills the quadratic-convergence edge
   cases near the branch point (where f' → 0) by factoring in f''.
   Starting guess:
     x ≥ e         : W₀ ≈ ln x − ln ln x          (asymptotic)
     |x| ≤ 0.5     : W₀ ≈ x − x² + (3/2)x³        (Taylor)
     elsewhere     : W₀ ≈ log(1 + x) / (1 + 0.5·log(1+x))

   Converges in ≲ 8 iterations to machine precision for all x.

   Symbolic / Name input lifts to `LAMBERT(x)`; Tagged transparent;
   List / Vector / Matrix distribute element-wise.
*/
const _INV_E = -1 / Math.E;

function _lambertW0(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  // Guard the branch point via p² = 2(ex + 1) ≥ 0.  Using ep1 directly
  // tolerates the 1-ulp roundoff in a computed -1/e without an ad-hoc
  // fudge constant, and gives the Puiseux series a ready-made argument.
  const ep1 = Math.E * x + 1;
  if (ep1 < 0) {
    if (ep1 < -1e-13) throw new RPLError('Bad argument value');
    return -1;
  }
  if (x === 0) return 0;
  // Choose a starting guess that puts Halley in its monotone regime.
  let w;
  if (ep1 < 0.25) {
    // Puiseux series at the branch point (Corless et al. 1996, eq 4.22):
    //   W(x) = -1 + p − p²/3 + 11 p³/72 − 43 p⁴/540 + 769 p⁵/17280 − …
    // with p = √(2(ex+1)).  Gives f ≲ 1e-10 at the initial guess, so
    // Halley's cubic convergence then hits machine precision in ≤ 2
    // steps — fixes the linear-convergence stall at the branch point,
    // where f'(−1) = 0 would otherwise defeat Halley alone.
    const p = Math.sqrt(2 * ep1);
    w = -1 + p * (1 + p * (-1/3 + p * (11/72 + p * (-43/540 + p * (769/17280)))));
  } else if (x >= Math.E) {
    const ln1 = Math.log(x);
    w = ln1 - Math.log(ln1);
  } else if (Math.abs(x) <= 0.5) {
    // Taylor around 0: W(x) = x − x² + (3/2)x³ − …
    w = x * (1 - x + 1.5 * x * x);
  } else {
    const l = Math.log(1 + x);
    w = l / (1 + 0.5 * l);
  }
  // Halley: W ← W − f/(f' − f f''/(2 f'))
  //          f   = W eᵂ − x
  //          f'  = eᵂ (W + 1)
  //          f'' = eᵂ (W + 2)
  for (let i = 0; i < 32; i++) {
    const e = Math.exp(w);
    const wew = w * e;
    const f = wew - x;
    if (f === 0) return w;
    const fp = e * (w + 1);
    if (fp === 0) break;  // avoid singular update at the branch point
    const fpp = e * (w + 2);
    const delta = f / (fp - (f * fpp) / (2 * fp));
    const wNext = w - delta;
    if (Math.abs(wNext - w) <= 1e-15 * Math.max(1, Math.abs(wNext))) {
      return wNext;
    }
    w = wNext;
  }
  return w;
}

function _lambertScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('LAMBERT', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_lambertW0(x));
}

register('LAMBERT', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_lambertScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_lambertScalar))));
  else                  s.push(_lambertScalar(v));
})));

/* ---- Ei / Si / Ci — exponential, sine, cosine integrals ---------------
   HP50 AUR §2 (CAS-SPECIAL).  Three classical special-function integrals,
   defined by:
     Ei(x) = -∫_{-x}^{∞} e^{-t}/t dt         (Cauchy PV for x > 0)
     Si(x) = ∫_0^x sin(t)/t dt               (entire, odd)
     Ci(x) = γ + ln(x) + ∫_0^x (cos(t)-1)/t dt   (x > 0 in HP50 real mode)

   Native implementations — Giac has these but the RPL calling convention
   expects Real outputs on Real inputs (Giac would return numeric-string
   Symbolics).  Three algorithmic branches per function:

     Ei(x)
       x  = 0          → Infinite result
       x  > 0 && x < 40 → power series γ + ln(x) + Σ x^k/(k·k!)
       x  ≥ 40         → asymptotic (e^x/x)·Σ k!/x^k truncated at smallest
       x  < 0, |x|<1   → series for E1(-x), then Ei = -E1
       x  < 0, |x|≥1   → modified-Lentz continued fraction for E1

     Si(x)
       x = 0           → 0
       |x| ≤ 4         → odd power series
       |x| > 4         → complex Lentz CF for E1(i·|x|): Si = π/2 + Im(E1(i·|x|))·sgn

     Ci(x)
       x  = 0          → Infinite result
       x  < 0          → Bad argument value (HP50 real-mode convention)
       x  ≤ 4          → γ + ln(x) + Σ (-1)^k x^{2k}/((2k)·(2k)!)
       x  > 4          → Re(-E1(i·x)) via the same Lentz CF as Si

   Relative error verified against Abramowitz & Stegun Tables 5.1/5.3 at
   machine precision.

   Symbolic / Name input lifts to `Ei(x)` / `Si(x)` / `Ci(x)`.  Tagged
   transparent; List / Vector / Matrix distribute element-wise.
*/
const _EI_EULER = 0.5772156649015329;

function _eiE1ContinuedFraction(t) {
  // Modified Lentz for E1(t), t > 0:   E1(t) = e^{-t} · CF
  //   CF = 1/(t+1-) 1·1/(t+3-) 2·2/(t+5-) …
  const TINY = 1e-300, EPS = 1e-15, MAX = 2000;
  let b = t + 1;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX; i++) {
    const a = -i * i;
    b += 2;
    d = a * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + a / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = c * d;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h * Math.exp(-t);
}

function _eiSeriesPositive(x) {
  // Ei(x) = γ + ln(x) + Σ_{k=1}^∞ x^k / (k · k!), x > 0
  const EPS = 1e-16, MAX = 1000;
  let term = 1;
  let sum = 0;
  for (let k = 1; k < MAX; k++) {
    term *= x / k;
    const inc = term / k;
    sum += inc;
    if (Math.abs(inc) < Math.abs(sum) * EPS) break;
  }
  return _EI_EULER + Math.log(x) + sum;
}

function _eiAsymptotic(x) {
  // Ei(x) ≈ (e^x/x) · Σ k!/x^k — divergent series, truncate at smallest term.
  const MAX = 200;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < MAX; k++) {
    const next = term * k / x;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next) >= Math.abs(term)) break;
    term = next;
    sum += term;
  }
  return Math.exp(x) / x * sum;
}

function _ei(x) {
  if (x === 0) throw new RPLError('Infinite result');
  if (x > 0) return x < 40 ? _eiSeriesPositive(x) : _eiAsymptotic(x);
  // x < 0: Ei(x) = -E1(-x).  Use series for small |x|, CF otherwise.
  const t = -x;
  if (t < 1) {
    const EPS = 1e-16, MAX = 1000;
    let term = 1, sum = 0;
    for (let k = 1; k < MAX; k++) {
      term *= -t / k;
      const inc = term / k;
      sum += inc;
      if (Math.abs(inc) < Math.abs(sum) * EPS) break;
    }
    const e1 = -_EI_EULER - Math.log(t) - sum;
    return -e1;
  }
  return -_eiE1ContinuedFraction(t);
}

function _siSeries(x) {
  // Si(x) = Σ_{k=0}^∞ (-1)^k x^{2k+1} / ((2k+1)(2k+1)!)
  const EPS = 1e-17, MAX = 1000;
  const x2 = x * x;
  let t = x;
  let s = x;
  for (let k = 1; k < MAX; k++) {
    t *= -x2 / ((2 * k) * (2 * k + 1));
    const entry = t / (2 * k + 1);
    s += entry;
    if (Math.abs(entry) < Math.abs(s) * EPS) break;
  }
  return s;
}

function _ciSeries(x) {
  // Ci(x) = γ + ln(x) + Σ_{k=1}^∞ (-1)^k x^{2k} / ((2k)(2k)!)
  const EPS = 1e-17, MAX = 1000;
  const x2 = x * x;
  let t = 1;
  let s = 0;
  for (let k = 1; k < MAX; k++) {
    t *= -x2 / ((2 * k - 1) * (2 * k));
    const entry = t / (2 * k);
    s += entry;
    if (Math.abs(entry) < Math.abs(s) * EPS) break;
  }
  return _EI_EULER + Math.log(x) + s;
}

function _siCiLentz(x) {
  // Complex modified-Lentz CF for E1(i·x) on real x > 0:
  //   E1(i·x) = e^{-i·x} · h,  h converges via the same recursion as real CF
  //   but with complex b₀ = 1 + i·x.  Returned real parts satisfy
  //     Si(x) - π/2 = Im(E1(i·x))
  //     -Ci(x)     = Re(E1(i·x))
  const TINY = 1e-300, EPS = 1e-16, MAX = 2000;
  let bRe = 1, bIm = x;
  let cRe = 1 / TINY, cIm = 0;
  const dDenom = bRe * bRe + bIm * bIm;
  let dRe = bRe / dDenom, dIm = -bIm / dDenom;
  let hRe = dRe, hIm = dIm;
  for (let i = 1; i < MAX; i++) {
    const a = -i * i;
    bRe += 2;
    let ndRe = a * dRe + bRe;
    let ndIm = a * dIm + bIm;
    if (Math.hypot(ndRe, ndIm) < TINY) { ndRe = TINY; ndIm = 0; }
    const cMag2 = cRe * cRe + cIm * cIm;
    let ncRe = bRe + (a * cRe) / cMag2;
    let ncIm = bIm + (a * -cIm) / cMag2;
    if (Math.hypot(ncRe, ncIm) < TINY) { ncRe = TINY; ncIm = 0; }
    const ndDenom = ndRe * ndRe + ndIm * ndIm;
    const dNewRe = ndRe / ndDenom;
    const dNewIm = -ndIm / ndDenom;
    const delRe = ncRe * dNewRe - ncIm * dNewIm;
    const delIm = ncRe * dNewIm + ncIm * dNewRe;
    const hNewRe = hRe * delRe - hIm * delIm;
    const hNewIm = hRe * delIm + hIm * delRe;
    cRe = ncRe; cIm = ncIm;
    dRe = dNewRe; dIm = dNewIm;
    hRe = hNewRe; hIm = hNewIm;
    if (Math.hypot(delRe - 1, delIm) < EPS) break;
  }
  // E1(i·x) = (cos x - i·sin x) · h
  const cx = Math.cos(x), sx = Math.sin(x);
  const eRe = cx * hRe + sx * hIm;
  const eIm = cx * hIm - sx * hRe;
  return { siMinusHalfPi: eIm, minusCi: eRe };
}

function _si(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax <= 4) return sign * _siSeries(ax);
  const { siMinusHalfPi } = _siCiLentz(ax);
  return sign * (Math.PI / 2 + siMinusHalfPi);
}

function _ci(x) {
  if (x === 0) throw new RPLError('Infinite result');
  if (x < 0) throw new RPLError('Bad argument value');
  if (x <= 4) return _ciSeries(x);
  const { minusCi } = _siCiLentz(x);
  return -minusCi;
}

function _eiScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Ei', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_ei(x));
}

function _siScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Si', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_si(x));
}

function _ciScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Ci', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_ci(x));
}

register('Ei', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_eiScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_eiScalar))));
  else                  s.push(_eiScalar(v));
})));

register('Si', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_siScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_siScalar))));
  else                  s.push(_siScalar(v));
})));

register('Ci', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_ciScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_ciScalar))));
  else                  s.push(_ciScalar(v));
})));

/* ---- XNUM / XQ — ASCII aliases ---------------------------------------
   HP50 AUR p.2-211.  `XNUM` and `XQ` are the mode-agnostic names HP50
   firmware uses for `→NUM` and `→Q` in contexts where the arrow glyph
   is inconvenient (keyboards without `→`, textual catalog output).
   Implement as thin wrappers that delegate to the shipped handlers.
*/
register('XNUM', (s, entry) => { OPS.get('→NUM').fn(s, entry); });
register('XQ',   (s, entry) => { OPS.get('→Q').fn(s, entry); });


/* ========================================================================
   MAD, AXL / AXM, FROOTS, TCHEBYCHEFF second-kind.

   HP50 AUR references:
     §18.1 (MAD)            column-wise Mean Absolute Deviation
     §15.2 (AXL / AXM)      List ↔ Matrix / Vector bridges
     §12.5 (FROOTS)         polynomial factoring — from a Symbolic
                            polynomial in X, returns roots w/
                            multiplicities as an RList `{r1 m1 r2 m2 …}`.

   TCHEBYCHEFF negative-n (second-kind U_{|n|-1}) is handled inside
   `_tchebOp` directly (immediately above): the argument-sign branch
   distinguishes first- from second-kind.
   ==================================================================== */

/* ---- MAD — Mean Absolute Deviation -----------------------------------
   HP50 AUR §18.1.  `MAD(v) = mean(|v_i − mean(v)|)` for a Vector;
   column-wise for a Matrix (matches MEAN / VAR / SDEV / MEDIAN).
   Real / Integer entries only (same policy as VAR / SDEV — Complex
   entries make "absolute deviation" ambiguous: do you use magnitude
   or complex-valued deviation?  HP50 firmware rejects Complex here,
   so we do too).
   --------------------------------------------------------------------- */
function _madItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  // Single-observation samples: mean absolute deviation is zero.
  if (items.length === 1) {
    _statsNumericEntry(items[0]);   // validate type even in the degenerate case
    return 0;
  }
  // Two-pass: compute mean, then mean of |x - mean|.  One-pass online
  // algorithms don't exist for MAD (unlike VAR), but two passes over
  // numeric arrays is cheap.
  const vals = new Array(items.length);
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    const x = _statsNumericEntry(items[i]);
    vals[i] = x; sum += x;
  }
  const mean = sum / items.length;
  let absSum = 0;
  for (const x of vals) absSum += Math.abs(x - mean);
  return absSum / items.length;
}

register('MAD', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_madItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _madItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ---- AXL / AXM — List ↔ Vector / Matrix bridges ----------------------
   HP50 AUR §15.2.

     AXL   ( V → L )     Vector → flat List of its entries
           ( M → L )     Matrix → List of Lists (one sub-list per row)
           ( L → L )     List already; no-op (idempotent per HP50 spec)

     AXM   ( L → V )     flat-item List → Vector (no nested sub-lists)
           ( L → M )     List of same-length sub-lists → Matrix
                         (all sub-lists checked; mismatched length →
                          Invalid dimension)
           ( V → V )     Vector no-op
           ( M → M )     Matrix no-op

   Entry-type policy: we don't coerce — entries flow through unchanged,
   which matches the HP50's behaviour (AXL on a Matrix with a mix of
   Integer / Real / Complex / Symbolic entries emits a List of Lists
   with those same entries).  AXM with a List containing non-numeric
   (e.g. Symbolic) entries still builds the Vector / Matrix; the
   downstream ops are the ones that reject non-numeric entries.  HP50
   actually coerces some entry types during AXM — e.g. a plain Integer
   in a numeric column stays Integer — but the Vector/Matrix builders
   don't enforce any type uniformity so we match the HP50 surface.

   AXL and AXM are not exact inverses in all cases because AXL on a
   plain List is a no-op (HP50 idempotent rule): AXL(AXM({a b c})) ≡
   AXL([a b c]) ≡ {a b c}, so the round-trip is preserved for flat
   lists and rectangular-row lists; ragged lists throw on the AXM side.
   --------------------------------------------------------------------- */

register('AXL', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Flat Vector → flat List of same entries.
    s.push(RList([...v.items]));
    return;
  }
  if (isMatrix(v)) {
    // Matrix → List of Lists (row-major).
    s.push(RList(v.rows.map(row => RList([...row]))));
    return;
  }
  if (isList(v)) {
    // Idempotent — already a list.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

register('AXM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v) || isMatrix(v)) {
    // Already a matrix-ish form — no-op (HP50 idempotency).
    s.push(v);
    return;
  }
  if (!isList(v)) throw new RPLError('Bad argument type');
  const items = v.items;
  if (items.length === 0) throw new RPLError('Bad argument value');
  // If any item is itself a List, the result is a Matrix.  All sub-
  // lists must match in length (rectangular).  Otherwise the result
  // is a flat Vector of the item values.
  const nested = items.some(isList);
  if (!nested) {
    s.push(Vector([...items]));
    return;
  }
  // Every row must be a List; mixed-shape input is a user bug.
  if (!items.every(isList)) throw new RPLError('Bad argument type');
  const cols = items[0].items.length;
  if (cols === 0) throw new RPLError('Bad argument value');
  const rows = items.map(row => {
    if (row.items.length !== cols) throw new RPLError('Invalid dimension');
    return [...row.items];
  });
  s.push(Matrix(rows));
});

/* ---- FROOTS — polynomial factoring (Symbolic direction) --------------
   HP50 AUR §12.5.  Takes a Symbolic polynomial in a single variable
   (main variable inferred via the algebra-module `freeVars` walk;
   we default to `X` when the expression is a constant in no variable
   — consistent with HERMITE / LEGENDRE / TCHEBYCHEFF).

     FROOTS  ( Sy → L )   L = { r1 m1 r2 m2 … }
                          alternating root / multiplicity pairs.  The
                          HP50 emits Real multiplicities; we emit
                          Integer to keep the cluster count exact.
                          Zero polynomial → Bad argument value.
                          Non-polynomial shape (non-integer exponent,
                          denominator containing the variable, etc.)
                          → Bad argument value.

   Implementation piggy-backs on the `PROOT` Durand-Kerner core:
   we expand the Symbolic with `algebraExpand`, walk the sum-of-
   monomials to build a descending-degree numeric coefficient array,
   wrap that array in an `RList`, push it onto a scratch stack, and
   invoke `PROOT` directly.  That returns a Vector of roots which we
   then cluster by proximity (tolerance `1e-6 · max(|r|, 1)`) to
   collapse repeated roots into `{root, multiplicity}` entries.

   Non-goals (deferred with the full `_polyNormalize` CAS work):
     - Rational / fractional inputs.  HP50's FROOTS also emits poles
       with negative multiplicities when given a Symbolic rational
       `p(X)/q(X)`; we reject those here.
     - Multi-variable polynomials.  A term like `A·X² + B` with more
       than one free variable is rejected.
     - Symbolic coefficients (e.g. `A·X² + 1` with `A` a free variable).
       A future CAS slice can substitute numeric values into the
       coefficient AST; for now they're rejected.
   --------------------------------------------------------------------- */

/* Extract a descending-degree numeric coefficient array from a
   polynomial AST in `varName`.  Returns `{ coefs, polyIsReal }` —
   `polyIsReal` is `true` iff every coefficient folded cleanly to a
   plain JS Real number (no Complex).  Throws `Bad argument value`
   on anything that isn't a polynomial with numeric coefficients. */
/* Distribute `*` over `+` / `-` / unary-Neg chains so FROOTS' walker
   sees a flat sum-of-monomials.  Does NOT combine like terms — the
   walker itself accumulates `coef · X^power` terms into a coefficient
   array, so `X·X·X` (three factors contributing 1 to the power) is
   fine without a `X^3` fold. */
function _frootsAdditiveTerms(ast) {
  const out = [];
  (function walk(n, sign) {
    if (!n) return;
    if (n.kind === 'bin' && (n.op === '+' || n.op === '-')) {
      walk(n.l, sign);
      walk(n.r, n.op === '+' ? sign : -sign);
    } else if (n.kind === 'neg') {
      walk(n.arg, -sign);
    } else {
      out.push({ sign, term: n });
    }
  })(ast, 1);
  return out;
}
function _frootsRebuildSum(parts) {
  if (parts.length === 0) return AstNum(0);
  let result = parts[0].sign < 0 ? AstNeg(parts[0].term) : parts[0].term;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    result = AstBin(p.sign < 0 ? '-' : '+', result, p.term);
  }
  return result;
}
function _frootsExpandProduct(a, b) {
  const aTerms = _frootsAdditiveTerms(a);
  const bTerms = _frootsAdditiveTerms(b);
  const parts = [];
  for (const ta of aTerms) {
    for (const tb of bTerms) {
      parts.push({ sign: ta.sign * tb.sign, term: AstBin('*', ta.term, tb.term) });
    }
  }
  return _frootsRebuildSum(parts);
}
function _frootsExpand(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') return AstNeg(_frootsExpand(ast.arg));
  if (ast.kind === 'fn') return AstFn(ast.name, ast.args.map(_frootsExpand));
  if (ast.kind === 'bin') {
    const l = _frootsExpand(ast.l);
    const r = _frootsExpand(ast.r);
    if (ast.op === '*') return _frootsExpandProduct(l, r);
    if (ast.op === '^' && r.kind === 'num' && Number.isInteger(r.value)
        && r.value >= 0 && r.value <= 16) {
      const n = r.value;
      if (n === 0) return AstNum(1);
      if (n === 1) return l;
      let acc = l;
      for (let i = 2; i <= n; i++) acc = _frootsExpandProduct(acc, l);
      return acc;
    }
    return AstBin(ast.op, l, r);
  }
  return ast;
}

function _symbolicPolyToNumCoefs(ast, varName) {
  const expanded = _frootsExpand(ast);
  // Walk the top-level +/- structure, emit terms with a ± sign.
  const terms = [];
  (function walk(node, sign) {
    if (!node) return;
    if (astIsNum(node)) { terms.push({ node, sign }); return; }
    if (node.kind === 'neg') { walk(node.arg, -sign); return; }
    if (node.kind === 'bin') {
      if (node.op === '+') { walk(node.l, sign); walk(node.r, sign); return; }
      if (node.op === '-') { walk(node.l, sign); walk(node.r, -sign); return; }
    }
    terms.push({ node, sign });
  })(expanded, 1);
  // For each term, collect the numeric coefficient and power of varName.
  // Real-only first-pass: Complex coefficients would need `_cx` threading
  // through both arms below.  The FROOTS op doesn't support Complex
  // coefficients today (see the op-level comment).
  const coefByPow = new Map();   // power → running Real
  for (const { node, sign } of terms) {
    let coef = sign;
    let power = 0;
    let failed = false;
    (function walk(n, mult) {
      if (failed) return;
      if (astIsNum(n)) { coef *= Math.pow(n.value, mult); return; }
      if (n.kind === 'neg') { coef *= -1; walk(n.arg, mult); return; }
      if (n.kind === 'bin' && n.op === '*') {
        walk(n.l, mult); walk(n.r, mult); return;
      }
      if (n.kind === 'bin' && n.op === '/') {
        // Only accept `A / num` — division by the variable (or any
        // sub-tree containing the variable) makes this a rational.
        walk(n.l, mult);
        if (astIsNum(n.r)) coef *= Math.pow(n.r.value, -mult);
        else failed = true;
        return;
      }
      if (n.kind === 'var' && n.name === varName) {
        power += mult;
        return;
      }
      if (n.kind === 'bin' && n.op === '^'
          && n.l.kind === 'var' && n.l.name === varName
          && astIsNum(n.r) && Number.isInteger(n.r.value) && n.r.value >= 0) {
        power += mult * n.r.value;
        return;
      }
      // Anything else is a non-numeric / non-polynomial shape.
      failed = true;
    })(node, 1);
    if (failed) throw new RPLError('Bad argument value');
    if (power < 0 || !Number.isInteger(power)) {
      throw new RPLError('Bad argument value');
    }
    coefByPow.set(power, (coefByPow.get(power) || 0) + coef);
  }
  const maxPow = [...coefByPow.keys()].reduce((a, b) => Math.max(a, b), 0);
  const out = new Array(maxPow + 1).fill(0);
  for (const [p, c] of coefByPow) out[maxPow - p] = c;
  // Zero polynomial after simplification ⇒ Bad argument value.
  if (out.every(c => c === 0)) throw new RPLError('Bad argument value');
  return { coefs: out, polyIsReal: true };
}

/* Cluster approximate roots by proximity, return { root, mult } pairs.
   Each entry stores the averaged representative plus a count.  Stable
   by first-seen order.

   Durand-Kerner (the PROOT inner loop) converges slowly near repeated
   roots — a degree-3 polynomial with a triple root typically lands
   with the three iterates spread across a disc of radius ~1e-5 around
   the true root, well above the default 1e-9 Real-vs-Complex
   collapse threshold used inside PROOT.  So we cluster with a
   tolerance of `max(1e-4 · scale, 1e-7)`, which is tight enough to
   keep distinct real roots separate (typical separation is ≥ 1) and
   loose enough to merge near-repeated ones.

   After clustering we collapse clusters with an imaginary part below
   the same tolerance back to a plain Real. */
function _clusterRoots(roots) {
  const out = [];
  const compOf = (r) => isReal(r)
    ? { re: r.value, im: 0 }
    : { re: r.re, im: r.im };
  for (const r of roots) {
    const { re, im } = compOf(r);
    let matched = false;
    for (const g of out) {
      const scale = Math.max(Math.abs(g.reSum / g.mult),
                             Math.abs(g.imSum / g.mult),
                             Math.abs(re), Math.abs(im), 1);
      const tol = Math.max(1e-4 * scale, 1e-7);
      if (Math.abs(re - g.reSum / g.mult) < tol &&
          Math.abs(im - g.imSum / g.mult) < tol) {
        g.reSum += re;
        g.imSum += im;
        g.mult += 1;
        matched = true;
        break;
      }
    }
    if (!matched) out.push({ reSum: re, imSum: im, mult: 1 });
  }
  return out.map(g => {
    const re = g.reSum / g.mult;
    const im = g.imSum / g.mult;
    const imTol = Math.max(1e-4 * Math.max(Math.abs(re), 1), 1e-7);
    const isRealClust = Math.abs(im) < imTol;
    return {
      root: isRealClust
        ? (Number.isInteger(re) ? Integer(BigInt(re)) : Real(re))
        : Complex(re, im),
      mult: g.mult,
    };
  });
}

/* ---- FROOTS rational-root pre-scan helper ----------------------------
   Before running Durand-Kerner, enumerate candidate rational roots
   `p / q` where `p | c_0` and `q | c_n` (Rational-Root Theorem).
   Test each candidate via Horner; when it evaluates exactly to zero,
   synthetically divide it out and recurse on the reduced polynomial
   until no more rational roots are found.  Returns
   `{ roots, residualCoefs }` — an array of rational roots (each with
   their multiplicity counted) and the coefficient array of the
   polynomial that remains after dividing them out.  The residual
   polynomial is then fed to PROOT to pick up any irrational /
   complex roots.

   Coefficients must be integers (or integer-valued Reals) for this
   path to apply; the caller falls through to plain Durand-Kerner
   otherwise.  The guard keeps `X^2 − 5X + 6` in Integer form but
   leaves `X^2 − 0.5X + 0.1` on the numeric path where it belongs. */

function _allIntegerCoefs(coefs) {
  for (const c of coefs) {
    if (!Number.isFinite(c)) return false;
    if (!Number.isInteger(c)) return false;
  }
  return true;
}

/** Positive integer divisors of |n| (n an integer).  For rational-root
 *  enumeration.  Returns [1] for n=0 (by convention — we only call
 *  this for non-zero coefficients). */
function _posDivisors(n) {
  const N = Math.abs(Math.trunc(n));
  if (N === 0) return [1];
  const out = [];
  for (let d = 1; d * d <= N; d++) {
    if (N % d === 0) {
      out.push(d);
      if (d * d !== N) out.push(N / d);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Integer GCD of two non-negative integers. */
function _igcd(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b !== 0) { const t = a % b; a = b; b = t; }
  return a;
}

/** Evaluate `p(x)` at the rational `num/den` using Horner on
 *  homogenized coordinates — equivalent to `Σ coefs[i] · num^(n-i) · den^i`
 *  then dividing by den^n.  Returns 0 exactly when `num/den` is a
 *  root; non-zero otherwise.  All arithmetic in Number; fine for the
 *  bounded-denominator candidate list since |num| ≤ |c_0| and
 *  |den| ≤ |c_n| are small. */
function _evalRational(coefs, num, den) {
  // p(num/den) · den^n  =  Σ_{i=0..n} coefs[i] · num^(n-i) · den^i
  const n = coefs.length - 1;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    sum += coefs[i] * Math.pow(num, n - i) * Math.pow(den, i);
  }
  return sum;
}

/** Synthetic divide `coefs` (descending-degree) by `(x − num/den)`,
 *  returning a new descending-degree coefficient array of degree n-1
 *  with Number entries.  Does NOT assume coefs are integers — works
 *  on any Real coefficient array (so chained division by rational
 *  roots after the first pass still works; later quotients can pick
 *  up rational entries). */
function _syntheticDivRational(coefs, num, den) {
  const out = new Array(coefs.length - 1).fill(0);
  // Re-parameterize: p(x) = den·q(x)·(x − num/den) where q is what we
  // want.  Standard synthetic division at r = num/den: q[0] = c[0],
  // q[k] = c[k] + r · q[k-1].
  const r = num / den;
  out[0] = coefs[0];
  for (let k = 1; k < coefs.length - 1; k++) {
    out[k] = coefs[k] + r * out[k - 1];
  }
  // Remainder is coefs[n] + r · q[n-1]; should be ~0 for a true root.
  return out;
}

/** Peel off all rational roots of an integer-coefficient polynomial.
 *  Returns `{ rationalRoots, residualCoefs }`.  `rationalRoots` is an
 *  array of `{ num, den, mult }` in de-duplicated form (duplicates
 *  peeled again and their count accumulated).  The residual polynomial
 *  is Number-valued (may carry floating drift).  Leading coefficient
 *  of the residual equals `coefs[0]` (we do NOT renormalize). */
function _peelRationalRoots(coefs) {
  let current = coefs.slice();
  const out = [];
  // Root x = 0 is the easy case: c_n = 0 ⇒ x divides p ⇒ deflate.
  while (current.length > 1 && current[current.length - 1] === 0) {
    current = current.slice(0, -1);
    const hit = out.find(r => r.num === 0 && r.den === 1);
    if (hit) hit.mult += 1;
    else out.push({ num: 0, den: 1, mult: 1 });
  }
  // Outer loop: try all p/q candidates against the current polynomial.
  // Each successful hit deflates once; repeat until no candidate works.
  let progress = true;
  while (progress && current.length > 1) {
    progress = false;
    const leadInt = Math.round(current[0]);
    const tailInt = Math.round(current[current.length - 1]);
    // If either rounded to 0 or we've drifted off integer coefs (e.g.
    // after a previous rational-root deflate), stop the rational-root
    // search.  The caller will run Durand-Kerner on whatever remains.
    if (!_allIntegerCoefs(current)) break;
    if (tailInt === 0 || leadInt === 0) break;
    const pDivs = _posDivisors(tailInt);
    const qDivs = _posDivisors(leadInt);
    // Iterate smallest candidates first so repeated roots (p=q=±1 or
    // small integers) deflate before we dig into larger candidates.
    outer: for (const q of qDivs) {
      for (const p of pDivs) {
        if (_igcd(p, q) !== 1) continue;  // skip unreduced p/q
        for (const sign of [1, -1]) {
          const num = sign * p;
          const den = q;
          const val = _evalRational(current, num, den);
          if (val === 0) {
            current = _syntheticDivRational(current, num, den);
            const hit = out.find(r => r.num === num && r.den === den);
            if (hit) hit.mult += 1;
            else out.push({ num, den, mult: 1 });
            progress = true;
            break outer;
          }
        }
      }
    }
  }
  return { rationalRoots: out, residualCoefs: current };
}

/** Decompose `|n|` as `k² · m` with `m` squarefree, returning `{k, m}`.
 *  Building block for FROOTS' exact-irrational quadratic-residual
 *  pass: the radical `√|n|` simplifies to `k · √m`.  Uses trial
 *  division up to `√|n|` — fine for the discriminants encountered
 *  (bounded by the user-typed polynomial's coefficients). */
function _squareFactorDecompose(n) {
  n = Math.abs(Math.round(n));
  if (n === 0) return { k: 0, m: 0 };
  let k = 1;
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    while (m % (p * p) === 0) {
      k *= p;
      m = m / (p * p);
    }
  }
  return { k, m };
}

/** Try to factor a degree-2 integer-coefficient residual into two exact
 *  symbolic roots via the quadratic formula.  Returns an array of
 *  `{ast, mult}` pairs or `null` when the case doesn't apply.  The
 *  null cases are:
 *    - D < 0  (complex conjugate roots — fall through to Durand-Kerner
 *              so the existing Complex path handles them)
 *    - D = 0  (double rational root — would've been peeled already)
 *    - `√D` exact integer (rational roots — would've been peeled)
 *  A non-null return always produces two entries with multiplicity 1
 *  (the roots are distinct under this branch). */
function _quadraticExactResidualRoots(coefs) {
  if (coefs.length !== 3) return null;
  if (!_allIntegerCoefs(coefs)) return null;
  const a = Math.round(coefs[0]);
  const b = Math.round(coefs[1]);
  const c = Math.round(coefs[2]);
  if (a === 0) return null;
  const D = b * b - 4 * a * c;
  if (D < 0) return null;             // complex path defers to Durand-Kerner
  if (D === 0) return null;           // double rational root
  const sqrtD = Math.sqrt(D);
  if (Number.isInteger(sqrtD)) return null;   // rational roots — peeled
  const { k, m } = _squareFactorDecompose(D);
  if (m === 1) return null;           // redundant (caught by isInteger test)
  // Reduce `-b ± k·√m` / `2a` by gcd(|b|, k, |2a|).
  const twoA = 2 * a;
  const g = _igcd(_igcd(Math.abs(b), k), Math.abs(twoA));
  const nb = -b / g;
  const nk = k / g;
  const nd = twoA / g;
  // Flip so denominator is positive.
  const signFlip = nd < 0 ? -1 : 1;
  const RB = nb * signFlip;    // real part numerator
  const K  = nk * signFlip;    // coefficient on √m for the '+' root
  const DEN = Math.abs(nd);
  const sqrtAst = AstFn('SQRT', [AstNum(m)]);
  function _build(sign) {
    const kSigned = sign * K;
    let numAst;
    if (RB === 0) {
      // numerator = kSigned · √m (no real part)
      if (kSigned === 1) numAst = sqrtAst;
      else if (kSigned === -1) numAst = AstNeg(sqrtAst);
      else if (kSigned > 0) numAst = AstBin('*', AstNum(kSigned), sqrtAst);
      else numAst = AstNeg(AstBin('*', AstNum(-kSigned), sqrtAst));
    } else if (kSigned > 0) {
      const kMag = kSigned === 1 ? sqrtAst : AstBin('*', AstNum(kSigned), sqrtAst);
      numAst = AstBin('+', AstNum(RB), kMag);
    } else {
      const absK = -kSigned;
      const kMag = absK === 1 ? sqrtAst : AstBin('*', AstNum(absK), sqrtAst);
      numAst = AstBin('-', AstNum(RB), kMag);
    }
    return DEN === 1 ? numAst : AstBin('/', numAst, AstNum(DEN));
  }
  return [
    { ast: _build(+1), mult: 1 },
    { ast: _build(-1), mult: 1 },
  ];
}

/** Convert a `{ num, den }` pair into a stack value: Integer when
 *  den=1, Symbolic(num/den) otherwise.  Symbolic rationals match the
 *  HP50 convention where `→Q` / `Q→` exchange `n/d` as a Symbolic —
 *  so FROOTS emits `Integer(2) 1 Integer(3) 1` for `X^2 − 5X + 6`
 *  and `Sym(1/2) 1 Sym(1/3) 1` for `6X^2 − 5X + 1`. */
function _rationalRootValue(num, den) {
  if (den === 1) return Integer(BigInt(num));
  // Construct the Symbolic fraction with a sign-bearing numerator.
  // `_pushSubstResult`-style collapse isn't needed — num/den is
  // already in lowest terms by the enumeration above.
  const sgn = num < 0 ? -1 : 1;
  const absN = Math.abs(num);
  const frac = AstBin('/', AstNum(absN), AstNum(den));
  return Symbolic(sgn < 0 ? AstNeg(frac) : frac);
}

register('FROOTS', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  // Pick the main variable.  Exactly one free variable ⇒ that one.
  // Zero free variables ⇒ the polynomial is a pure constant; handle
  // here: non-zero constant has no roots, zero constant is a user
  // error (same policy as PROOT).
  const varsSet = algebraFreeVars(v.expr);
  if (varsSet.size > 1) throw new RPLError('Bad argument value');
  // Expand then simplify to a coefficient list.
  let varName;
  if (varsSet.size === 1) varName = [...varsSet][0];
  else                    varName = 'X';   // constant polynomial fallback
  const { coefs } = _symbolicPolyToNumCoefs(v.expr, varName);
  if (coefs.length === 1) {
    // Pure constant — non-zero ⇒ no roots ⇒ empty list.
    s.push(RList([]));
    return;
  }
  // Rational-root pre-scan.  Peel off every `p/q` root that evaluates
  // exactly to zero under Horner.  Keeps Integer roots Integer in the
  // output (a pure Durand-Kerner path would return e.g. `2.0000…`).
  const outItems = [];
  let residual = coefs;
  if (_allIntegerCoefs(coefs)) {
    const { rationalRoots, residualCoefs } = _peelRationalRoots(coefs);
    for (const rr of rationalRoots) {
      outItems.push(_rationalRootValue(rr.num, rr.den));
      outItems.push(Integer(BigInt(rr.mult)));
    }
    residual = residualCoefs;
  }
  // Exact-irrational quadratic-residual pass.  If what remains is a
  // degree-2 integer polynomial with non-square positive discriminant,
  // emit the two roots in closed form `(-b ± k·√m)/(2a)` as Symbolic
  // so `X² - 2 FROOTS` returns `√2` / `-√2` exactly instead of falling
  // through to Durand-Kerner floats.  D < 0 or D a perfect square
  // fall through to the standard path.
  if (residual.length === 3 && _allIntegerCoefs(residual)) {
    const quadRoots = _quadraticExactResidualRoots(residual);
    if (quadRoots) {
      for (const qr of quadRoots) {
        outItems.push(Symbolic(qr.ast));
        outItems.push(Integer(BigInt(qr.mult)));
      }
      residual = [residual[0]];   // degree-0 leftover ⇒ no further roots.
    }
  }
  // Biquadratic residual pass.  Degree-4 integer residual of the
  // shape `a·X⁴ + b·X² + c` (coef[1] = coef[3] = 0) with both
  // u = X² roots exact-irrational.  Emits ±√u₁, ±√u₂ as Symbolic so
  // `X⁴ - 10X² + 1 FROOTS` returns `√(5+2√6)`-family radicals
  // directly rather than deferring to Durand-Kerner floats.
  if (residual.length === 5 && _allIntegerCoefs(residual)) {
    const biqRoots = _biquadResidualRoots(residual);
    if (biqRoots) {
      for (const br of biqRoots) {
        outItems.push(Symbolic(br.ast));
        outItems.push(Integer(BigInt(br.mult)));
      }
      residual = [residual[0]];
    }
  }
  // Residual polynomial still has degree ≥ 1?  Hand to PROOT for the
  // irrational / complex roots.  Degree-0 residual ⇒ fully factored.
  if (residual.length > 1) {
    const coefList = RList(residual.map((c) =>
      Number.isInteger(c) ? Integer(BigInt(c)) : Real(c)));
    const scratch = new (s.constructor)();
    scratch.push(coefList);
    lookup('PROOT').fn(scratch);
    const rootsVec = scratch.pop();
    if (isVector(rootsVec)) {
      const groups = _clusterRoots([...rootsVec.items]);
      for (const g of groups) {
        outItems.push(g.root);
        outItems.push(Integer(BigInt(g.mult)));
      }
    }
  }
  s.push(RList(outItems));
});

/* ====================================================================
   PREDV / PREDX / PREVAL / TAN2SC / LAPLACE / ILAP.
   ====================================================================

   Each op below slots into the CAS / stats family.  Cross-cutting
   state reuse: PREDV / PREDX read the `lastFitModel` slot published
   by LINFIT / LOGFIT / EXPFIT / PWRFIT; the other four ops are pure
   AST rewrites on their input.  See the per-op comment for the
   user-reachable demo keypress sequence.
   ==================================================================== */

/* ---- PREDV — evaluate last fit at a scalar x -----------------------
   HP50 AUR §18.1.  After running one of LINFIT / LOGFIT / EXPFIT /
   PWRFIT the calculator remembers the fit model; PREDV takes an x
   value and returns the predicted y for that model.

     x PREDV  ( R → R )   y-prediction at x using the last-run fit.

   No fit run yet ⇒ Undefined name.  Non-Real/Integer x rejected with
   Bad argument type.  Domain violations (LOG of x≤0, PWR of x≤0)
   surface as Infinite result, not silent NaN — mirrors the ops'
   domain-error surface. */

function _evalFitModel(model, x) {
  switch (model.kind) {
    case 'LIN': return model.a + model.b * x;
    case 'LOG':
      if (x <= 0) throw new RPLError('Infinite result');
      return model.a + model.b * Math.log(x);
    case 'EXP': return model.a * Math.exp(model.b * x);
    case 'PWR':
      if (x <= 0) throw new RPLError('Infinite result');
      return model.a * Math.pow(x, model.b);
    default: throw new RPLError('Bad argument value');
  }
}

/* Inverse of the fit model: solve `y = f(x)` for x.  Real only — no
   multi-valued / Complex branch picking.  Returns `null` when the
   inverse is undefined (e.g. b=0 in a LIN fit, or log of a non-
   positive argument). */
function _invertFitModel(model, y) {
  const { kind, a, b } = model;
  switch (kind) {
    case 'LIN':
      if (b === 0) return null;
      return (y - a) / b;
    case 'LOG':
      // y = a + b·ln(x)  ⇒  x = exp((y-a)/b)
      if (b === 0) return null;
      return Math.exp((y - a) / b);
    case 'EXP':
      // y = a·e^(b·x)  ⇒  x = ln(y/a) / b
      if (a === 0 || b === 0) return null;
      const r = y / a;
      if (r <= 0) return null;
      return Math.log(r) / b;
    case 'PWR':
      // y = a·x^b  ⇒  x = (y/a)^(1/b)
      if (a === 0 || b === 0) return null;
      const q = y / a;
      if (q <= 0) return null;
      return Math.pow(q, 1 / b);
    default: return null;
  }
}

/** Accept Real / Integer / (integer-valued BinInt) as the scalar arg
 *  for PREDV / PREDX.  Complex is rejected — the fit models are
 *  real-valued and the inverse is real-to-real. */
function _fitScalar(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isBinaryInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}

register('PREDV', (s) => {
  const [xv] = s.popN(1);
  const model = getLastFitModel();
  if (!model) throw new RPLError('Undefined name');
  const x = _fitScalar(xv);
  const y = _evalFitModel(model, x);
  if (!Number.isFinite(y)) throw new RPLError('Infinite result');
  s.push(Real(y));
});

/* ---- PREDX — evaluate inverse fit at a scalar y --------------------
   Inverse of PREDV: given a predicted y, back out the x that would
   have produced it under the last-run fit.

     y PREDX  ( R → R )   x such that f(x) = y under last-run fit.

   No fit ⇒ Undefined name.  Non-invertible model (b=0 in LIN/LOG,
   a=0 in EXP/PWR) ⇒ Infinite result.  Domain violation of the
   inverse (e.g. y ≤ 0 for EXP/PWR when a > 0) ⇒ Infinite result. */

register('PREDX', (s) => {
  const [yv] = s.popN(1);
  const model = getLastFitModel();
  if (!model) throw new RPLError('Undefined name');
  const y = _fitScalar(yv);
  const x = _invertFitModel(model, y);
  if (x === null || !Number.isFinite(x)) throw new RPLError('Infinite result');
  s.push(Real(x));
});

/* ---- VX / SVX — CAS main variable -----------------------------------
   HP50 AUR §2.6.  VX is the CAS "main variable" the firmware falls
   back on whenever a CAS op has to pick a canonical variable from a
   multi-free-variable or constant argument: LAPLACE, ILAP, PREVAL,
   DERVX, INTVX, TABVAL, TAYLOR0, etc.  On real hardware VX is a
   directory variable in CASDIR the user stores into from the stack;
   we back it with a dedicated `state.casVx` slot instead so the
   setter is free of HOME/VAR bookkeeping and survives persistence.

     VX   ( → Name )    push the current CAS main variable as a Name.
     SVX  ( Name → )    set the CAS main variable from a Name (or
                        string — HP50 accepts either at the prompt).

   Rejection: SVX with anything other than Name/String throws
   `Bad argument type`.  Empty-string / empty-name throws
   `Bad argument value`.  VX never throws — it pushes the default
   Name `'X'` on a freshly-booted unit.

   The slot survives page reloads via `persist.js`.  Both ops emit a
   state-change event through the `setCasVx` helper so future status-
   line annunciators can display the active VX. */

register('VX', (s) => {
  s.push(Name(getCasVx()));
});

register('SVX', (s) => {
  const [v] = s.popN(1);
  let name;
  if (isName(v))        name = v.id;
  else if (isString(v)) name = v.value;
  else throw new RPLError('Bad argument type');
  if (!isValidHpIdentifier(name)) {
    // HP50 rejects empty strings and any non-conforming name for SVX.
    // We use the validator here (not isStorableHpName) because the CAS
    // main variable legitimately overlaps the reserved-ops space on
    // the HP50 — `'X' SVX` is the factory default, yet 'X' is also a
    // command-line name slot.  Only syntactic validity is enforced.
    throw new RPLError(`Invalid name: ${name}`);
  }
  setCasVx(name);
});

/* ---- PREVAL — evaluate F at two endpoints --------------------------
   HP50 AUR §11.  The workhorse for "definite integral via
   antiderivative": evaluate `F(X)` at two scalars and subtract.

     F(X) a b PREVAL  ( Sy + R + R → Sy )    F(b) - F(a)

   HP50 firmware also accepts `F(X) {a b}` as a List-form convenience
   — we support that too.  The single free variable of F(X) is
   inferred via `freeVars`; when F has multiple free variables
   (F(X,Y)) we reject with Bad argument value.  F with no free
   variables is legal — PREVAL then returns `0` (F(b) - F(a) is 0
   when F is constant), matching HP50.

   Numeric endpoints (Real / Integer / BinInt) substitute in and let
   `algebraSubst` collapse the result.  When F has a closed-form
   that simplifies to a Number after substitution, PREVAL returns
   Real.  When it doesn't simplify, PREVAL returns Symbolic. */

register('PREVAL', (s) => {
  // Accept the list form: F {a b} PREVAL ⇒ rewrite to three-arg form.
  if (s.depth >= 2) {
    const top = s.peek(1);
    if (isList(top) && top.items.length === 2) {
      const lst = s.pop();
      s.push(lst.items[0]);
      s.push(lst.items[1]);
    }
  }
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [fVal, aVal, bVal] = s.popN(3);
  if (!isSymbolic(fVal)) throw new RPLError('Bad argument type');
  // Pick the variable to substitute.  HP50 firmware consults the CAS
  // main variable (VX).  Selection priority:
  //
  //   VX ∈ free(F)         → substitute VX.              (HP50 canonical)
  //   |free(F)| == 1       → substitute that single var. (classic
  //                          single-var PREVAL — the common case.)
  //   otherwise            → substitute VX anyway.  When VX isn't a
  //                          free variable the substitution is a
  //                          no-op and F(b) - F(a) folds to 0 (or
  //                          stays symbolic).  Matches HP50 AUR's
  //                          "the current variable is VX" phrasing
  //                          without rejecting the input.
  const vars = algebraFreeVars(fVal.expr);
  const vx = getCasVx();
  let varName;
  if (vars.has(vx))         varName = vx;
  else if (vars.size === 1) varName = [...vars][0];
  else                      varName = vx;
  const endpointToAst = (v) => {
    if (isReal(v))    return AstNum(v.value.toNumber());
    if (isInteger(v)) return AstNum(Number(v.value));
    if (isBinaryInteger(v)) return AstNum(Number(v.value));
    if (isSymbolic(v)) return v.expr;
    if (isName(v))    return AstVar(v.id);
    throw new RPLError('Bad argument type');
  };
  const aAst = endpointToAst(aVal);
  const bAst = endpointToAst(bVal);
  // Route through Giac.  One `subst` call per endpoint, followed by
  // Giac's own `simplify` to fold the difference.  All free-variable
  // names (of F, `a`, `b`) get purged so Xcas built-ins can't shadow
  // user variables.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const aG = astToGiac(aAst);
  const bG = astToGiac(bAst);
  const extra = [
    varName,
    ...algebraFreeVars(aAst),
    ...algebraFreeVars(bAst),
  ];
  const cmd = buildGiacCmd(
    fVal.expr,
    (e) => `simplify(subst(${e},${varName}=${bG})-subst(${e},${varName}=${aG}))`,
    extra,
  );
  const diff = giacToAst(giac.caseval(cmd));
  if (diff && diff.kind === 'num') { s.push(Real(diff.value)); return; }
  s.push(Symbolic(diff));
});

/* ---- TAN2SC — rewrite TAN(X) as SIN(X) / COS(X) -------------------
   HP50 AUR §5.6 / §11.9.  Single-pass AST rewrite: every occurrence
   of `TAN(arg)` becomes `SIN(arg) / COS(arg)`.  The argument is
   unchanged — TAN2SC is NOT recursive into `arg` (TAN nested inside
   the argument, e.g. `TAN(TAN(X))`, is handled by the outer walk
   because we recurse through all children before matching).

     Sy TAN2SC  ( Sy → Sy )   TAN(arg) → SIN(arg) / COS(arg), deep.

   Non-Symbolic input rejects with Bad argument type.  Pairs with
   TCOLLECT / TEXPAND once those land. */

function _tan2scWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tan2scWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tan2scWalk(ast.l);
    const r = _tan2scWalk(ast.r);
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tan2scWalk);
    if (ast.name === 'TAN' && args.length === 1) {
      // TAN(arg) → SIN(arg) / COS(arg)
      return AstBin('/', AstFn('SIN', [args[0]]), AstFn('COS', [args[0]]));
    }
    // Any other function: keep name, rebuild args if anything changed.
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}

register('TAN2SC', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tan2scWalk(v.expr)));
});

/* ---- EXLR — Extract Left and Right sides of a symbolic -----------
   HP50 AUR §4.9 / §11.4 (SYMBOLIC → OBJECT).  Splits the top-level
   binary operator of its Symbolic argument into two stack entries.
   The op itself is discarded; only the operands come back.

     Sy EXLR  ( Sy → Sy Sy )

   Operator classes matched at the top level:
     arithmetic   +  -  *  /  ^
     comparison   =  ≠  <  >  ≤  ≥

   Typical usage is on an equation `A = B`:

       'A = B' EXLR              →  'A'   'B'
       'X^2 + 2·X + 1 = 0' EXLR  →  'X^2+2·X+1'   '0'

   Non-binary-operator input (a bare Var / Num, a unary Neg, a
   function call) rejects with `Bad argument value` — there is no
   unambiguous "left" and "right" to extract.  Non-Symbolic input
   rejects with `Bad argument type`.  Both sides are returned as
   Symbolic regardless of whether the operand happens to be a lone
   variable or a number; users who want to unwrap can apply EVAL. */

register('EXLR', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const ast = v.expr;
  if (!ast || ast.kind !== 'bin') {
    // Leaf (num/var), unary (neg), or function call — no bin to split.
    throw new RPLError('Bad argument value');
  }
  s.push(Symbolic(ast.l));
  s.push(Symbolic(ast.r));
});

/* ------------------------------------------------------------------
   LNAME    (HP50 AUR §3-136)
   List variable names contained in a Symbolic expression.

     Input :  level 1 = 'symb'
     Output:  level 2 = 'symb'                (preserved)
              level 1 = [ Name1 Name2 ... ]   (Vector of Names)

   The HP50 walks the AST and collects:
     • every bare variable identifier (Var node), and
     • every USER-DEFINED function name (Fn node whose name is not on
       the calculator's built-in function list — `isKnownFunction`).
   Built-in calls like SIN, COS, INV, LN, … contribute their *arguments*
   but not their own names — `LNAME(COS(B)/2*A + MYFUNC(PQ) + INV(T))`
   yields `[MYFUNC PQ A B T]`, with COS / INV omitted.

   Sort order (per AUR p.3-136):
     • by length descending (longest first), then
     • alphabetically ascending within equal length.

   Non-Symbolic input rejects with `Bad argument type`.  The original
   argument is preserved on level 2 so callers can chain LNAME with
   another op without re-pushing it (matches the LASTARG pattern most
   reflection ops use).
   ------------------------------------------------------------------ */
register('LNAME', (s) => {
  const v = s.peek();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');

  const seen = new Map();   // canonical id -> insertion-position (for stability)
  function visit(node) {
    if (!node) return;
    if (node.kind === 'var') {
      if (!seen.has(node.name)) seen.set(node.name, seen.size);
    } else if (node.kind === 'neg') {
      visit(node.arg);
    } else if (node.kind === 'bin') {
      visit(node.l);
      visit(node.r);
    } else if (node.kind === 'fn') {
      // User-defined function names participate; built-ins do not.
      if (!isKnownFunction(node.name) && !seen.has(node.name)) {
        seen.set(node.name, seen.size);
      }
      for (const a of node.args) visit(a);
    }
  }
  visit(v.expr);

  const ids = [...seen.keys()].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  s.push(Vector(ids.map((id) => Name(id))));
});

/* ---- LAPLACE / ILAP — Laplace transform and inverse --------------
   HP50 AUR §11.8.  Rules-based AST rewrite over the CAS main
   variable (VX, which we surface as `X` here until the VX state
   slot lands).  Implemented shapes:

     LAPLACE :  X^n        → n! / X^(n+1)           for n ∈ ℕ
                EXP(a·X)   → 1 / (X - a)
                SIN(a·X)   → a / (X^2 + a^2)
                COS(a·X)   → X / (X^2 + a^2)
                SINH(a·X)  → a / (X^2 - a^2)
                COSH(a·X)  → X / (X^2 - a^2)
                c·f(X)     → c·LAPLACE(f(X))        for constant c
                f + g      → LAPLACE(f) + LAPLACE(g)
                f - g      → LAPLACE(f) - LAPLACE(g)
                1          → 1/X

     ILAP   : inverse of the above table (same shapes mirrored).

   Non-recognised shapes fall through and are returned wrapped in a
   sentinel `LAP(...)` / `ILAP(...)` node so the user sees which
   sub-expression tripped the rule engine.  Pure Symbolic round-trip
   shape; no numeric evaluation.  Input non-Symbolic ⇒ Bad argument
   type.  Note that the HP50 firmware uses the CAS VX variable —
   we mirror that by picking the single free variable in the
   input (fall back to the current `getCasVx()` — default `x` — when
   the input is a constant). */

function _lapVarName(ast) {
  const vx = getCasVx();
  const vars = algebraFreeVars(ast);
  if (vars.size === 0) return vx;
  if (vars.size === 1) return [...vars][0];
  // Multi-variable input: HP50 uses VX.  If the CAS main variable is
  // one of the free vars, pick it; otherwise the first free var in
  // iteration order.
  return vars.has(vx) ? vx : [...vars][0];
}

/** Is `ast` a Num node? */
function _isNumNode(ast) { return ast && ast.kind === 'num'; }

register('LAPLACE', (s) => {
  const [v] = s.popN(1);
  let expr;
  if (isSymbolic(v))   expr = v.expr;
  else if (isName(v))  expr = AstVar(v.id);
  else throw new RPLError('Bad argument type');
  // Route through Giac.  HP50 convention: same variable for input
  // and output (`X → X`).  Giac's `laplace(f, x, s)` signature wants
  // three args — we pass the same name twice to keep the output in
  // X, matching the HP50's "transform in place" idiom.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const varName = _lapVarName(expr);
  const cmd = buildGiacCmd(
    expr,
    (e) => `laplace(${e},${varName},${varName})`,
    [varName],
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
});

register('ILAP', (s) => {
  const [v] = s.popN(1);
  let expr;
  if (isSymbolic(v))   expr = v.expr;
  else if (isName(v))  expr = AstVar(v.id);
  else throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const varName = _lapVarName(expr);
  const cmd = buildGiacCmd(
    expr,
    (e) => `ilaplace(${e},${varName},${varName})`,
    [varName],
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
});

/* ====================================================================
   HALFTAN / TAN2SC2 / TAN2CS2 / inverse-trig rewrites.
   ====================================================================

   Closes the HP50 tangent-half-angle family that TAN2SC opens, plus
   four inverse-trig identity rewrites (ACOS2S, ASIN2C, ASIN2T, ATAN2S)
   from the AUR's "…Ñ TRIG" menu.  The exact FROOTS residual-quadratic
   extractor above handles the `a ± √b` case the rational-root
   pre-scan deliberately leaves to Durand-Kerner — so `X² - 2 FROOTS`
   returns `Sym(√2)` / `Sym(-√2)` exactly instead of floats.

   All the rewrites here share the same `_trigIdentityWalk` substrate:
   a shallow AST walker that recurses into children, then consults a
   `{ FNNAME: rewrite(arg) → newAst }` map at each `fn` node.  The
   rewrite is NOT re-walked — so HALFTAN introducing a `TAN(X/2)` does
   NOT trigger the TAN-handler recursively (matching HP50 semantics).
   ==================================================================== */

/** Generic shallow rewrite walker for function-call identities.  Map
 *  keys are function names (e.g. 'SIN', 'TAN', 'ACOS'); values are
 *  `(arg) => newAst | null`.  A `null` return means "not applicable —
 *  keep the node".  Children are walked bottom-up, then the handler
 *  consults the map.  Once a rewrite succeeds, the result is NOT
 *  re-walked (so HALFTAN's TAN(x/2) output doesn't get handed back to
 *  its own TAN handler). */
function _trigIdentityWalk(ast, rewriteMap) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _trigIdentityWalk(ast.arg, rewriteMap);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _trigIdentityWalk(ast.l, rewriteMap);
    const r = _trigIdentityWalk(ast.r, rewriteMap);
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(a => _trigIdentityWalk(a, rewriteMap));
    if (rewriteMap[ast.name] && args.length === 1) {
      const r = rewriteMap[ast.name](args[0]);
      if (r != null) return r;
    }
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}

/* ---- HALFTAN — rewrite SIN / COS / TAN via tan(x/2) identities ------
   HP50 AUR §3-102.  Tangent-half-angle substitution:

     SIN(x) → 2·TAN(x/2) / (1 + TAN(x/2)²)
     COS(x) → (1 - TAN(x/2)²) / (1 + TAN(x/2)²)
     TAN(x) → 2·TAN(x/2) / (1 - TAN(x/2)²)

   Sibling to TAN2SC2 / TAN2CS2 below.  Non-Symbolic input throws Bad
   argument type.  Shallow walk — the introduced TAN(x/2) is NOT
   re-rewritten (that would infinite-loop).  Idempotent only in the
   trivial sense: a second invocation rewrites the *new* TAN(x/2) to
   yet-smaller-argument forms. */

function _halfTanOf(arg) {
  return AstFn('TAN', [AstBin('/', arg, AstNum(2))]);
}

register('HALFTAN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('*', AstNum(2), t),
        AstBin('+', AstNum(1), tsq));
    },
    COS: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('-', AstNum(1), tsq),
        AstBin('+', AstNum(1), tsq));
    },
    TAN: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('*', AstNum(2), t),
        AstBin('-', AstNum(1), tsq));
    },
  });
  s.push(Symbolic(out));
});

/* ---- TAN2SC2 — TAN(x) → SIN(2x) / (1 + COS(2x)) ---------------------
   HP50 AUR §3-249.  Double-angle companion of TAN2SC.  The argument
   stays as-is in both SIN and COS; we multiply by `2` outside the
   function call.  Shallow walk: nested TAN(TAN(X)) rewrites inner
   first (since children are recursed), then outer — so the final
   result still expresses only in SIN / COS of the rewritten inner
   argument. */

register('TAN2SC2', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    TAN: (arg) => {
      const twoArg = AstBin('*', AstNum(2), arg);
      return AstBin('/',
        AstFn('SIN', [twoArg]),
        AstBin('+', AstNum(1), AstFn('COS', [twoArg])));
    },
  });
  s.push(Symbolic(out));
});

/* ---- TAN2CS2 — TAN(x) → (1 - COS(2x)) / SIN(2x) ---------------------
   HP50 AUR §3-248.  Dual of TAN2SC2 using `(1 - cos(2x))/sin(2x)`.
   Same shallow-walk semantics. */

register('TAN2CS2', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    TAN: (arg) => {
      const twoArg = AstBin('*', AstNum(2), arg);
      return AstBin('/',
        AstBin('-', AstNum(1), AstFn('COS', [twoArg])),
        AstFn('SIN', [twoArg]));
    },
  });
  s.push(Symbolic(out));
});

/* ---- Inverse-trig identity rewrites ---------------------------------
   HP50 AUR §3-7 (ACOS2S), §3-17 (ASIN2C, ASIN2T), §3-21 (ATAN2S).
   Each is a single shallow-walk identity:

     ACOS2S : ACOS(x) → π/2 − ASIN(x)
     ASIN2C : ASIN(x) → π/2 − ACOS(x)
     ASIN2T : ASIN(x) → ATAN(x / √(1 − x²))
     ATAN2S : ATAN(x) → ASIN(x / √(x² + 1))

   `PI` is emitted as `AstVar('PI')` so it round-trips through EXACT
   mode (under APPROX, `→NUM` / EVAL would fold it to 3.14159…). */

function _piOver2Ast() {
  return AstBin('/', AstVar('PI'), AstNum(2));
}

register('ACOS2S', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ACOS: (arg) => AstBin('-', _piOver2Ast(), AstFn('ASIN', [arg])),
  });
  s.push(Symbolic(out));
});

register('ASIN2C', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ASIN: (arg) => AstBin('-', _piOver2Ast(), AstFn('ACOS', [arg])),
  });
  s.push(Symbolic(out));
});

register('ASIN2T', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ASIN: (arg) => {
      // ATAN(x / √(1 - x²))
      const xsq = AstBin('^', arg, AstNum(2));
      const radicand = AstBin('-', AstNum(1), xsq);
      const denom = AstFn('SQRT', [radicand]);
      return AstFn('ATAN', [AstBin('/', arg, denom)]);
    },
  });
  s.push(Symbolic(out));
});

register('ATAN2S', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ATAN: (arg) => {
      // ASIN(x / √(x² + 1))
      const xsq = AstBin('^', arg, AstNum(2));
      const radicand = AstBin('+', xsq, AstNum(1));
      const denom = AstFn('SQRT', [radicand]);
      return AstFn('ASIN', [AstBin('/', arg, denom)]);
    },
  });
  s.push(Symbolic(out));
});

/* ====================================================================
   TEXPAND / TLIN / TCOLLECT / EXPLN.
   ====================================================================

   Rounds out the HP50 trig-CAS family alongside TAN2SC and the
   HALFTAN / TAN2SC2 / TAN2CS2 / inverse-trig rewrites.

     TEXPAND   — HP50 AUR §3-252.  Expand SIN/COS/TAN of sums via the
                 addition formulae.
     TLIN      — HP50 AUR §3-253.  Linearize products of SIN/COS via
                 product-to-sum identities.
     TCOLLECT  — HP50 AUR §3-250.  Collect SIN±SIN / COS±COS into
                 products (sum-to-product).
     EXPLN     — HP50 AUR §3-75.  Rewrite trig and hyperbolic in terms
                 of real / complex exponentials (e^x, e^(ix)).

   TEXPAND and EXPLN reuse `_trigIdentityWalk` (both dispatch on the
   function name at a `fn` node).  TLIN and TCOLLECT match on `bin`
   nodes instead — a multiplication for TLIN, an addition/subtraction
   for TCOLLECT — so they each carry a small custom walker.  All four
   are shallow-walk: rewrite results are not re-processed (recursion-
   safety invariant).
   ==================================================================== */

/* ---- TEXPAND — addition-formula expansion of SIN / COS / TAN --------
   HP50 AUR §3-252.  Identities applied at each SIN/COS/TAN fn node:

     SIN(a+b) = SIN(a)·COS(b) + COS(a)·SIN(b)
     SIN(a-b) = SIN(a)·COS(b) - COS(a)·SIN(b)
     COS(a+b) = COS(a)·COS(b) - SIN(a)·SIN(b)
     COS(a-b) = COS(a)·COS(b) + SIN(a)·SIN(b)
     TAN(a+b) = (TAN(a) + TAN(b)) / (1 - TAN(a)·TAN(b))
     TAN(a-b) = (TAN(a) - TAN(b)) / (1 + TAN(a)·TAN(b))

   Plus the parity identities for a unary-negated argument:

     SIN(-x) = -SIN(x),  COS(-x) = COS(x),  TAN(-x) = -TAN(x)

   Anything else (a bare variable, a number, a product, a power, etc.)
   is left unchanged so composed AST shapes survive round-trips.  The
   walker is single-pass: nested sums produce one level of expansion
   per invocation (SIN((a+b)+c) first becomes SIN(a+b)·COS(c)+
   COS(a+b)·SIN(c); a second TEXPAND expands the two SIN(a+b) /
   COS(a+b) calls).  Non-Symbolic input throws Bad argument type. */

function _texpandSinArg(arg) {
  if (arg.kind === 'bin' && arg.op === '+') {
    return AstBin('+',
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('COS', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'bin' && arg.op === '-') {
    return AstBin('-',
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('COS', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'neg') {
    // SIN(-x) = -SIN(x)
    return AstNeg(AstFn('SIN', [arg.arg]));
  }
  return null;
}

function _texpandCosArg(arg) {
  if (arg.kind === 'bin' && arg.op === '+') {
    return AstBin('-',
      AstBin('*', AstFn('COS', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'bin' && arg.op === '-') {
    return AstBin('+',
      AstBin('*', AstFn('COS', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'neg') {
    // COS(-x) = COS(x)
    return AstFn('COS', [arg.arg]);
  }
  return null;
}

function _texpandTanArg(arg) {
  if (arg.kind === 'bin' && (arg.op === '+' || arg.op === '-')) {
    const op  = arg.op;                    // '+' or '-'
    const dop = op === '+' ? '-' : '+';    // denominator uses the dual sign
    const ta = AstFn('TAN', [arg.l]);
    const tb = AstFn('TAN', [arg.r]);
    return AstBin('/',
      AstBin(op,  ta, tb),
      AstBin(dop, AstNum(1), AstBin('*', ta, tb)));
  }
  if (arg.kind === 'neg') {
    // TAN(-x) = -TAN(x)
    return AstNeg(AstFn('TAN', [arg.arg]));
  }
  return null;
}

register('TEXPAND', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN: _texpandSinArg,
    COS: _texpandCosArg,
    TAN: _texpandTanArg,
  });
  s.push(Symbolic(out));
});

/* ---- TLIN — product-to-sum linearization ----------------------------
   HP50 AUR §3-253.  Rewrites products of SIN/COS (and squares of SIN
   or COS) into linear combinations via product-to-sum:

     SIN(a)·SIN(b) = (COS(a-b) - COS(a+b))/2
     COS(a)·COS(b) = (COS(a-b) + COS(a+b))/2
     SIN(a)·COS(b) = (SIN(a+b) + SIN(a-b))/2
     COS(a)·SIN(b) = (SIN(a+b) - SIN(a-b))/2
     SIN(a)²       = (1 - COS(2a))/2
     COS(a)²       = (1 + COS(2a))/2

   Walker matches at `bin('*')` nodes (two fn children), at `bin('^')`
   nodes whose exponent is the literal integer 2 and whose base is a
   SIN/COS fn node, and recurses into all other shapes.  Children are
   linearized first (bottom-up).  Non-SIN/non-COS products are left
   unchanged.  Non-Symbolic input throws Bad argument type. */

function _tlinProductRewrite(l, r) {
  if (l.kind !== 'fn' || r.kind !== 'fn') return null;
  if (l.args.length !== 1 || r.args.length !== 1) return null;
  if ((l.name !== 'SIN' && l.name !== 'COS') ||
      (r.name !== 'SIN' && r.name !== 'COS')) return null;
  const a       = l.args[0];
  const b       = r.args[0];
  const aPlusB  = AstBin('+', a, b);
  const aMinusB = AstBin('-', a, b);
  const two     = AstNum(2);
  if (l.name === 'SIN' && r.name === 'SIN') {
    return AstBin('/',
      AstBin('-', AstFn('COS', [aMinusB]), AstFn('COS', [aPlusB])),
      two);
  }
  if (l.name === 'COS' && r.name === 'COS') {
    return AstBin('/',
      AstBin('+', AstFn('COS', [aMinusB]), AstFn('COS', [aPlusB])),
      two);
  }
  if (l.name === 'SIN' && r.name === 'COS') {
    return AstBin('/',
      AstBin('+', AstFn('SIN', [aPlusB]), AstFn('SIN', [aMinusB])),
      two);
  }
  // COS·SIN
  return AstBin('/',
    AstBin('-', AstFn('SIN', [aPlusB]), AstFn('SIN', [aMinusB])),
    two);
}

function _tlinSquareRewrite(base, exp) {
  if (base.kind !== 'fn' || base.args.length !== 1) return null;
  if (exp.kind !== 'num' || exp.value !== 2) return null;
  if (base.name !== 'SIN' && base.name !== 'COS') return null;
  const a    = base.args[0];
  const twoA = AstBin('*', AstNum(2), a);
  if (base.name === 'SIN') {
    // SIN²(a) = (1 - COS(2a))/2
    return AstBin('/',
      AstBin('-', AstNum(1), AstFn('COS', [twoA])),
      AstNum(2));
  }
  // COS²(a) = (1 + COS(2a))/2
  return AstBin('/',
    AstBin('+', AstNum(1), AstFn('COS', [twoA])),
    AstNum(2));
}

function _tlinWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tlinWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tlinWalk(ast.l);
    const r = _tlinWalk(ast.r);
    if (ast.op === '*') {
      const prod = _tlinProductRewrite(l, r);
      if (prod !== null) return prod;
    }
    if (ast.op === '^') {
      const sq = _tlinSquareRewrite(l, r);
      if (sq !== null) return sq;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tlinWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}

register('TLIN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tlinWalk(v.expr)));
});

/* ---- TCOLLECT — sum-to-product ---------------------------------------
   HP50 AUR §3-250.  The inverse of TLIN's "product → sum" direction:
   collects matching `SIN(A) ± SIN(B)` / `COS(A) ± COS(B)` pairs into
   product form via the sum-to-product identities:

     SIN(A) + SIN(B) =  2·SIN((A+B)/2)·COS((A-B)/2)
     SIN(A) - SIN(B) =  2·COS((A+B)/2)·SIN((A-B)/2)
     COS(A) + COS(B) =  2·COS((A+B)/2)·COS((A-B)/2)
     COS(A) - COS(B) = -2·SIN((A+B)/2)·SIN((A-B)/2)

   Walker matches at `bin('+' | '-')` nodes whose l and r are fn
   nodes with the same name (both SIN or both COS) and a single arg
   each.  Otherwise children are walked recursively.  The rewrite is
   NOT re-walked (so a fresh TCOLLECT result doesn't get re-collected
   into nested products).  Non-matching bin shapes fall through
   unchanged. */

function _tcollectSumRewrite(op, l, r) {
  if (l.kind !== 'fn' || r.kind !== 'fn') return null;
  if (l.args.length !== 1 || r.args.length !== 1) return null;
  if (l.name !== r.name) return null;
  if (l.name !== 'SIN' && l.name !== 'COS') return null;
  const A    = l.args[0];
  const B    = r.args[0];
  const sum  = AstBin('/', AstBin('+', A, B), AstNum(2));
  const diff = AstBin('/', AstBin('-', A, B), AstNum(2));
  if (l.name === 'SIN' && op === '+') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('SIN', [sum])),
      AstFn('COS', [diff]));
  }
  if (l.name === 'SIN' && op === '-') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('COS', [sum])),
      AstFn('SIN', [diff]));
  }
  if (l.name === 'COS' && op === '+') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('COS', [sum])),
      AstFn('COS', [diff]));
  }
  // COS - COS  → -2·SIN((A+B)/2)·SIN((A-B)/2)
  return AstNeg(AstBin('*',
    AstBin('*', AstNum(2), AstFn('SIN', [sum])),
    AstFn('SIN', [diff])));
}

function _tcollectWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tcollectWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tcollectWalk(ast.l);
    const r = _tcollectWalk(ast.r);
    if (ast.op === '+' || ast.op === '-') {
      const rw = _tcollectSumRewrite(ast.op, l, r);
      if (rw !== null) return rw;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tcollectWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}

register('TCOLLECT', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tcollectWalk(v.expr)));
});

/* ---- EXPLN — rewrite trig / hyperbolic as exponentials ---------------
   HP50 AUR §3-75.  Euler-formula substitutions for the six core
   trig/hyperbolic functions, using `Var('i')` for the imaginary unit
   (the project-wide convention — see the FROOTS complex-conjugate
   branch in `algebra.js` §2778 for precedent).

     SIN(x)  → (e^(i·x) - e^(-i·x)) / (2·i)
     COS(x)  → (e^(i·x) + e^(-i·x)) / 2
     TAN(x)  → (e^(i·x) - e^(-i·x)) / (i·(e^(i·x) + e^(-i·x)))
     SINH(x) → (e^x - e^(-x)) / 2
     COSH(x) → (e^x + e^(-x)) / 2
     TANH(x) → (e^x - e^(-x)) / (e^x + e^(-x))

   Shallow-walk on `_trigIdentityWalk`: the `EXP(i·x)` nodes introduced
   for SIN/COS/TAN are NOT re-processed (EXP has no entry in the
   rewrite map).  Non-Symbolic input throws Bad argument type.

   Inverse-trig (ASIN/ACOS/ATAN) and inverse-hyperbolic (ASINH/...)
   rewrites are intentionally deferred — the ACOS2S / ASIN2C / ASIN2T
   / ATAN2S ops already cover the inverse-trig identity surface in a
   non-exponential form; adding log-of-complex forms alongside makes
   the output even less tractable without `_polyNormalize`. */

function _iAst()  { return AstVar('i'); }
function _negIAst() { return AstNeg(AstVar('i')); }

function _explnSinArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  return AstBin('/',
    AstBin('-', AstFn('EXP', [ix]), AstFn('EXP', [mx])),
    AstBin('*', AstNum(2), _iAst()));
}

function _explnCosArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  return AstBin('/',
    AstBin('+', AstFn('EXP', [ix]), AstFn('EXP', [mx])),
    AstNum(2));
}

function _explnTanArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  const ep = AstFn('EXP', [ix]);
  const em = AstFn('EXP', [mx]);
  return AstBin('/',
    AstBin('-', ep, em),
    AstBin('*', _iAst(), AstBin('+', ep, em)));
}

function _explnSinhArg(arg) {
  return AstBin('/',
    AstBin('-', AstFn('EXP', [arg]), AstFn('EXP', [AstNeg(arg)])),
    AstNum(2));
}

function _explnCoshArg(arg) {
  return AstBin('/',
    AstBin('+', AstFn('EXP', [arg]), AstFn('EXP', [AstNeg(arg)])),
    AstNum(2));
}

function _explnTanhArg(arg) {
  const ep = AstFn('EXP', [arg]);
  const em = AstFn('EXP', [AstNeg(arg)]);
  return AstBin('/',
    AstBin('-', ep, em),
    AstBin('+', ep, em));
}

register('EXPLN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN:   _explnSinArg,
    COS:   _explnCosArg,
    TAN:   _explnTanArg,
    SINH:  _explnSinhArg,
    COSH:  _explnCoshArg,
    TANH:  _explnTanhArg,
    // Inverse-trig / inverse-hyperbolic extensions.  Hoisted forward
    // refs; definitions appear in the TSIMP / HEAVISIDE / DIRAC block.
    ASIN:  _explnAsinArg,
    ACOS:  _explnAcosArg,
    ATAN:  _explnAtanArg,
    ASINH: _explnAsinhArg,
    ACOSH: _explnAcoshArg,
    ATANH: _explnAtanhArg,
  });
  s.push(Symbolic(out));
});

/* ====================================================================
   TSIMP, HEAVISIDE / DIRAC, LAPLACE / ILAP extensions, EXPLN inverse
   family, LNCOLLECT, FROOTS biquadratic.
   ====================================================================

   Three surfaces covered:

     • §11 trig-CAS:  TSIMP — bounded fixed-point Pythagorean-identity
       simplifier, closes the surface modulo `_polyNormalize`.
     • EXPLN:  ASIN / ACOS / ATAN / ASINH / ACOSH / ATANH rewrites to
       LN-of-complex forms, using the same `_trigIdentityWalk`
       substrate (six entries in the rewrite map).
     • LAPLACE / ILAP:  HEAVISIDE and DIRAC as first-class ops, their
       transforms and inverses in the table, plus the frequency-shift
       theorem L{e^(αX)·f(X)} = F(X − α) and its ILAP inverse (pure
       Dirac round-trips).

   Two standalone additions round out the cluster:

     • LNCOLLECT — the logarithm-collection sibling of EXPLN.  Collects
       LN(a) ± LN(b) into LN(a·b) / LN(a/b) and n·LN(a) into LN(a^n).
       Shallow bottom-up walk.
     • FROOTS biquadratic pass — before Durand-Kerner, detect a residual
       `X⁴ + bX² + c` (degree-4 with `coef[1] = coef[3] = 0`), treat it
       as `u² + bu + c` where u = X², find the two u-roots via the
       quadratic-residual machinery, then emit ±√u₁, ±√u₂ as exact
       Symbolic radicals.
   ==================================================================== */

/* ---- HEAVISIDE — unit step, Symbolic carrier ------------------------
   Real/Integer input collapses to 1 (x ≥ 0) or 0 (x < 0), matching the
   HP50 convention where HEAVISIDE(0) = 1 (right-continuous at the
   origin).  Symbolic input is kept symbolic — the LAPLACE / ILAP
   dispatcher recognises `HEAVISIDE(X - a)` as a first-class shape.
   BinaryInteger is accepted the same as Integer. */

function _realStepValue(x) { return x >= 0 ? 1 : 0; }

register('HEAVISIDE', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  if (isReal(v))          { s.push(Real(_realStepValue(v.value.toNumber()))); return; }
  if (isInteger(v))       { s.push(Integer(BigInt(_realStepValue(Number(v.value))))); return; }
  if (isBinaryInteger(v)) { s.push(Integer(BigInt(_realStepValue(Number(v.value))))); return; }
  if (_isSymOperand(v))   { s.push(Symbolic(AstFn('HEAVISIDE', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))));

/* ---- DIRAC — Dirac impulse, Symbolic carrier ------------------------
   Real/Integer non-zero input collapses to 0.  A literal 0 stays
   Symbolic (the spike at the origin is singular; returning 0 would be
   wrong, returning ∞ would lose the integral — HP50 leaves it
   symbolic).  Symbolic input is kept symbolic so LAPLACE /  ILAP can
   round-trip `DIRAC(X - a)` through the table. */

register('DIRAC', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  if (isReal(v)) {
    if (v.value.isZero()) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Real(0));
    return;
  }
  if (isInteger(v)) {
    if (v.value === 0n) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Integer(0n));
    return;
  }
  if (isBinaryInteger(v)) {
    if (v.value === 0n) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Integer(0n));
    return;
  }
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('DIRAC', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))));

/* ---- TSIMP — trig simplifier (Giac-backed) --------------------------
   HP50 AUR §3-254.  `tsimplify(expr)` runs Giac's Pythagorean-identity
   surface (SIN²+COS²→1, 1−SIN²→COS², TAN·COS→SIN, SIN/COS→TAN, and
   their duals) followed by its own simplify pass.  Non-Symbolic input
   throws Bad argument type. */

register('TSIMP', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(v.expr, (e) => `tsimplify(${e})`);
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
});

/* ---- EXPLN inverse-trig / inverse-hyperbolic rewrite closures ------
   Hoisted — referenced from the `register('EXPLN', …)` map above.  Six
   new branches:

     ASIN(x)  → -i · LN(i·x + √(1 - x²))
     ACOS(x)  → -i · LN(x + i·√(1 - x²))
     ATAN(x)  → -(i/2) · LN((1 + i·x) / (1 - i·x))
     ASINH(x) →  LN(x + √(x² + 1))                 (real)
     ACOSH(x) →  LN(x + √(x² - 1))                 (real)
     ATANH(x) →  (1/2) · LN((1 + x) / (1 - x))     (real)

   The trig identities use the project-wide `Var('i')` convention for
   the imaginary unit (see `_iAst` above).  The hyperbolic identities
   are real-valued and don't reference `i`.

   The walker is still `_trigIdentityWalk`; the new rewrites produce
   `LN` and `SQRT` nodes that are NOT re-processed (no LN / SQRT
   entry in the map).  Branch cuts are a known follow-up — under
   APPROX mode the user may get a different principal value than
   the built-in ASIN / ACOS / ATAN; under EXACT / Symbolic the
   expressions are formally correct. */

function _explnAsinArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', AstNum(1), x2);
  const sqrtTerm = AstFn('SQRT', [radic]);
  const ix = AstBin('*', _iAst(), arg);
  const inner = AstBin('+', ix, sqrtTerm);
  return AstNeg(AstBin('*', _iAst(), AstFn('LN', [inner])));
}

function _explnAcosArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', AstNum(1), x2);
  const sqrtTerm = AstFn('SQRT', [radic]);
  const iSqrt = AstBin('*', _iAst(), sqrtTerm);
  const inner = AstBin('+', arg, iSqrt);
  return AstNeg(AstBin('*', _iAst(), AstFn('LN', [inner])));
}

function _explnAtanArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const num = AstBin('+', AstNum(1), ix);
  const den = AstBin('-', AstNum(1), ix);
  const logFrac = AstFn('LN', [AstBin('/', num, den)]);
  const halfI = AstBin('/', _iAst(), AstNum(2));
  return AstNeg(AstBin('*', halfI, logFrac));
}

function _explnAsinhArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('+', x2, AstNum(1));
  const inner = AstBin('+', arg, AstFn('SQRT', [radic]));
  return AstFn('LN', [inner]);
}

function _explnAcoshArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', x2, AstNum(1));
  const inner = AstBin('+', arg, AstFn('SQRT', [radic]));
  return AstFn('LN', [inner]);
}

function _explnAtanhArg(arg) {
  const num = AstBin('+', AstNum(1), arg);
  const den = AstBin('-', AstNum(1), arg);
  return AstBin('*',
    AstBin('/', AstNum(1), AstNum(2)),
    AstFn('LN', [AstBin('/', num, den)]));
}

/* ---- LNCOLLECT — collect logarithms ---------------------------------
   HP50 AUR §3-144.  The inverse direction of EXPLN's LN-expansion
   surface: collect LN(a) ± LN(b) into LN(a·b) / LN(a/b), and rewrite
   n · LN(a) as LN(a^n) (where n is a numeric literal).  Shallow
   bottom-up walk at `bin('+' | '-' | '*')` nodes.  Non-matching
   shapes fall through unchanged.

   The rewrite is NOT re-walked (so a fresh LNCOLLECT result isn't
   re-processed into nested LNs).  Non-Symbolic input rejects with
   Bad argument type.

   The coefficient branch matches both `n · LN(a)` and `LN(a) · n`
   — the latter is unusual but valid AST shape.  Non-numeric
   coefficients (like `Y · LN(X)`) don't match — HP50 LNCOLLECT
   collects only numeric powers. */

function _lncollectSumRewrite(op, l, r) {
  // LN(a) ± LN(b) → LN(a·b) or LN(a/b)
  if (!l || l.kind !== 'fn' || l.name !== 'LN' || !l.args || l.args.length !== 1) return null;
  if (!r || r.kind !== 'fn' || r.name !== 'LN' || !r.args || r.args.length !== 1) return null;
  const a = l.args[0];
  const b = r.args[0];
  const combined = op === '+'
    ? AstBin('*', a, b)
    : AstBin('/', a, b);
  return AstFn('LN', [combined]);
}

function _lncollectCoefRewrite(l, r) {
  // n · LN(a) → LN(a^n)  (n must be a Num)
  if (_isNumNode(l) && r && r.kind === 'fn' && r.name === 'LN'
      && r.args && r.args.length === 1) {
    return AstFn('LN', [AstBin('^', r.args[0], l)]);
  }
  if (_isNumNode(r) && l && l.kind === 'fn' && l.name === 'LN'
      && l.args && l.args.length === 1) {
    return AstFn('LN', [AstBin('^', l.args[0], r)]);
  }
  return null;
}

function _lncollectWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _lncollectWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _lncollectWalk(ast.l);
    const r = _lncollectWalk(ast.r);
    if (ast.op === '+' || ast.op === '-') {
      const rw = _lncollectSumRewrite(ast.op, l, r);
      if (rw !== null) return rw;
    }
    if (ast.op === '*') {
      const rw = _lncollectCoefRewrite(l, r);
      if (rw !== null) return rw;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_lncollectWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}

register('LNCOLLECT', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_lncollectWalk(v.expr)));
});

/* ---- PROPFRAC / PARTFRAC / COSSIN -----------------------------------
   Three HP50 ALG / REWRITE menu ops, all thin wrappers over Giac.

     PROPFRAC  (HP50 AUR §3-197)
       Proper-fraction form: rewrite a rational expression as
       `quotient + remainder/divisor` with degree(remainder) < degree(divisor).
       Works on purely numeric rationals too:  43/12  →  3 + 7/12.
       Routed through Giac `propfrac(expr)`.

     PARTFRAC  (HP50 AUR §3-180)
       Partial-fraction decomposition.  Splits a rational expression
       whose denominator factors into distinct linear / quadratic
       pieces into a sum of simpler fractions.
       Routed through Giac `partfrac(expr)`.

     COSSIN    (HP50 AUR §3-64)
       Rewrite trigonometric surface in terms of SIN and COS by
       expanding every TAN(x) as SIN(x)/COS(x).  Giac's
       `tan2sincos(expr)` is the direct analogue.

   Common shape — mirrors EXPAND / SIMPLIFY:
     • Symbolic input routes through Giac.  No-fallback policy: if
       Giac isn't ready or caseval throws, the op throws.
     • Rational input (PROPFRAC only — the other two are pure trig /
       algebra ops that are a no-op on a bare ratio) lifts to
       Symbolic via `_toAst` first, then Giac.
     • Real / Integer / Name are pass-through, matching EXPAND /
       COLLECT / FACTOR leniency so these ops compose against any
       numeric operand without blowing up.
     • Any other type throws `Bad argument type`.
   ------------------------------------------------------------------ */

register('PROPFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `propfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isRational(v)) {
    // Lift the BigInt ratio into a Symbolic Bin('/', Num(n), Num(d))
    // (via `_toAst`) so Giac receives, e.g., `propfrac(43/12)`.  The
    // Giac result `3+7/12` parses back through `giacToAst` into a
    // plain Symbolic sum.
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(_toAst(v), (e) => `propfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

register('PARTFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `partfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    // A pure number / ratio / bare name has no non-trivial partial-
    // fraction decomposition — pass through untouched.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

register('COSSIN', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `tan2sincos(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   LIN     (HP50 AUR §3-131)
   Linearize an expression in exponentials.  Giac's `lin(expr)` collapses
   products / powers of exponentials so that, e.g., `e^X * e^Y → e^(X+Y)`
   and `(e^X)^3 → e^(3*X)`.  Single-arg, mirrors PROPFRAC / PARTFRAC /
   COSSIN: Symbolic routes through Giac; Real / Integer / Rational / Name
   pass through (a bare number / ratio / name has no non-trivial
   linearization).  No-fallback policy.
   ------------------------------------------------------------------ */
register('LIN', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `lin(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   LIMIT / lim    (HP50 AUR §3-131, §lim entry)
   Limit of an expression as its variable approaches a value.

     ( expr 'var=val' → limit )      explicit equation form
     ( expr val       → limit )      use current CAS variable VX

   HP50 fidelity:
     • Level 2 must be Symbolic (the expression).
     • Level 1 is either a Symbolic equation `var = val` or a bare
       numeric value (Real / Integer / Rational).  When level 1 is bare,
       the variable defaults to VX (`getCasVx()`).  Per the AUR `lim`
       entry: "If the variable approaching a value is the current CAS
       variable, it is sufficient to give its value alone."
     • The HP50 also accepts `∞` for plus/minus infinity; we accept the
       Symbolic Var nodes `INFINITY` / `+INFINITY` / `-INFINITY` and
       translate to Giac's `+infinity` / `-infinity`.
   `LIMIT` is the canonical name (HP49 backward-compat); `lim` is
   registered as a thin alias that delegates to LIMIT's fn so any
   future refinement picks up automatically (mirrors XNUM / XQ and
   CHARPOL).
   No-fallback policy: Giac not ready → `CAS not ready`.
   ------------------------------------------------------------------ */
function _limitPointToGiac(pointArg) {
  // Returns { varName, valGiac } or throws RPLError.
  if (isSymbolic(pointArg)) {
    const ast = pointArg.expr;
    // Equation form: var = val (HP equality is `=`; AST lays it as
    // bin('=' or '==', l, r)).  Either operator is acceptable on
    // input — both render the same on the keypad.
    if (ast && ast.kind === 'bin' && (ast.op === '=' || ast.op === '==')) {
      if (!ast.l || ast.l.kind !== 'var') {
        throw new RPLError('Bad argument value');
      }
      return { varName: ast.l.name, valGiac: astToGiac(ast.r) };
    }
    // Bare Symbolic value (no equation) — use current VX.
    return { varName: getCasVx(), valGiac: astToGiac(ast) };
  }
  if (isInteger(pointArg))  return { varName: getCasVx(), valGiac: pointArg.value.toString() };
  if (isReal(pointArg))     return { varName: getCasVx(), valGiac: pointArg.value.toString() };
  if (isRational(pointArg)) return {
    varName: getCasVx(),
    valGiac: `(${pointArg.n.toString()}/${pointArg.d.toString()})`,
  };
  if (isName(pointArg)) {
    // `'INFINITY' LIMIT` is rare in practice (most users push a Symbolic
    // equation), but accepting bare Names here keeps `'X=INFINITY'`
    // parsing-compatible — astToGiac handles INFINITY mapping.  Pass the
    // bare Name as the value (same effect as a leaf Var Symbolic).
    return { varName: getCasVx(), valGiac: astToGiac(AstVar(pointArg.id)) };
  }
  throw new RPLError('Bad argument type');
}

register('LIMIT', (s) => {
  const [exprArg, pointArg] = s.popN(2);
  if (!isSymbolic(exprArg) && !isName(exprArg)) {
    // Numeric expressions still have a well-defined limit (themselves),
    // but the HP50 AUR limits the input to "an expression" — non-Symbolic
    // / non-Name rejects with Bad argument type.  Accepting Name lets
    // `'X' 'X=2' LIMIT → 2` work (the bare variable is the single-leaf
    // Symbolic in disguise).
    throw new RPLError('Bad argument type');
  }
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const exprAst = isName(exprArg) ? AstVar(exprArg.id) : exprArg.expr;
  const { varName, valGiac } = _limitPointToGiac(pointArg);
  const cmd = buildGiacCmd(
    exprAst,
    (e) => `limit(${e},${varName},${valGiac})`,
    [varName],
  );
  const ast = giacToAst(giac.caseval(cmd));
  // Numeric-leaf result (Giac returned e.g. `2`) → push as Real so the
  // caller can do further numeric math without unwrapping a Symbolic.
  if (ast && ast.kind === 'num') { s.push(Real(ast.value)); return; }
  s.push(Symbolic(ast));
});

// `lim` — HP50 lowercase alias.  Per AUR p.3-131, LIMIT is the HP49G
// backward-compat name and `lim` is the canonical HP50 form; both behave
// identically.  Thin wrapper so any future refinement of LIMIT lifts
// automatically (mirrors CHARPOL, XNUM/XQ alias pattern).
register('lim', (s) => { OPS.get('LIMIT').fn(s); });

/* ------------------------------------------------------------------
   Matrix-symbolic ops — PCAR / CHARPOL / EGVL

   Three CAS-backed matrix ops that take an n×n Matrix and route
   through Giac.  Matrix is serialized to Giac's `[[a,b],[c,d]]`
   bracket literal via `_matrixToGiacStr`; scalar entries use
   `_scalarToGiacStr` (Integer / Real / Rational / Complex /
   Symbolic / Name → Giac-valid string).

   PCAR     (HP50 AUR §3-196)
     Characteristic polynomial det(X·I − A) of a square matrix A.
     HP50 name is PCAR.  Giac equivalent: `charpoly(M, X)`.  Returns
     a Symbolic in the current CAS variable (VX — default `X`).
     The listed `CHARPOL` alias is registered as a thin wrapper so
     code imported from other HP-family calculators still resolves.

   EGVL     (HP50 AUR §3-90)
     Eigenvalues of a square matrix, returned as a Vector.  Giac
     equivalent: `eigenvals(M)` (the list form — note `egvl(M)` in
     Xcas prints the Jordan-form diagonal matrix instead, which isn't
     what HP50 EGVL wants; eigenvals is the bracket-list companion).
     Each element is lifted back through `giacToAst` and unwrapped to
     a Real / Integer / Symbolic / Complex value via `_astToRplValue`.

   Shared shape:
     • Input must be a square (n×n) Matrix.  Empty matrix ⇒
       `Invalid dimension`; rectangular ⇒ `Invalid dimension`.
     • Non-Matrix input ⇒ `Bad argument type`.
     • `!giac.isReady()` ⇒ `CAS not ready` (no-fallback policy).
   ------------------------------------------------------------------ */

/** Serialize one scalar Matrix/Vector entry as a Giac-parseable token.
 *  Handles the numeric family (Integer / Real / Rational / Complex),
 *  plus Symbolic (recurse via astToGiac) and bare Name.  Anything else
 *  throws — callers propagate as `Bad argument type`. */
function _scalarToGiacStr(v) {
  if (isInteger(v))  return v.value.toString();                 // BigInt → "n"
  if (isReal(v))     return v.value.toString();                 // Decimal → "3.14"
  if (isRational(v)) return `(${v.n.toString()}/${v.d.toString()})`;
  if (isComplex(v))  return `(${v.re}+(${v.im})*i)`;
  if (isSymbolic(v)) return `(${astToGiac(v.expr)})`;
  if (isName(v))     return v.id;
  throw new RPLError('Bad argument type');
}

/** Serialize a Matrix as a Giac `[[r1c1,r1c2,…],[r2c1,…]]` literal. */
function _matrixToGiacStr(m) {
  const rows = m.rows.map((row) => {
    const elts = row.map(_scalarToGiacStr);
    return `[${elts.join(',')}]`;
  });
  return `[${rows.join(',')}]`;
}

/** Shared validator for PCAR / EGVL-style matrix ops.  Returns the
 *  square n; throws `Invalid dimension` for non-square / empty,
 *  `Bad argument type` for non-Matrix. */
function _popSquareMatrix(s) {
  const m = s.pop();
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const n = m.rows.length;
  const cols = n > 0 ? m.rows[0].length : 0;
  if (n === 0 || n !== cols) throw new RPLError('Invalid dimension');
  return { matrix: m, n };
}

register('PCAR', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vx = getCasVx();
  const matStr = _matrixToGiacStr(matrix);
  const cmd = `charpoly(${matStr},${vx})`;
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
});

/** `CHARPOL` — alias for PCAR.  Some HP-family codebases use the
 *  descriptive name; register as a thin wrapper so it picks up any
 *  future refinement of PCAR automatically (mirrors the XNUM / XQ
 *  alias pattern XNUM / XQ use). */
register('CHARPOL', (s) => { OPS.get('PCAR').fn(s); });

register('EGVL', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);
  const raw = giac.caseval(`eigenvals(${matStr})`);
  // `eigenvals` prints a flat `[λ1, λ2, …]` list per Xcas convention.
  // If Giac (or a future mock) returns something else, splitGiacList
  // yields null; surface that as `Bad argument value` so the user gets
  // a clean error instead of a garbled result.
  const parts = splitGiacList(raw);
  if (parts === null) throw new RPLError('Bad argument value');
  const items = parts.map((elt) => {
    const ast = giacToAst(elt);
    return _astToRplValue(ast);
  });
  s.push(Vector(items));
});

/* ------------------------------------------------------------------
   EGV   (HP50 AUR §3-73)
   Eigenvalues + right eigenvectors of a square matrix.

     Input :  level 1 = [[ M ]]   (n × n)
     Output:  level 2 = [[ EVec ]]  (n × n; columns = right eigenvectors)
              level 1 = [ EVal  ]   (n-vector of eigenvalues)

   HP50 fidelity:
     • EVec column i corresponds to EVal entry i.
     • For real input with a complex eigenpair, both EVec and EVal
       widen to complex — same as EGVL.

   Implementation:
     • Eigenvalue vector via Giac `eigenvals(M)` — same call EGVL
       uses, so the eigenvalue order matches EGVL exactly.
     • Eigenvector matrix via Giac `egv(M)`.  Xcas `egv(M)` returns
       the matrix P whose columns are right eigenvectors such that
       M·P = P·diag(eigenvals(M)) — the orientation HP50 asks for.
       (`egvl(M)`, by contrast, returns the diagonal eigenvalue
       matrix; the n_a_m_e similarity is treacherous.)
     • Both calls go through the same `_matrixToGiacStr` /
       `_astToRplValue` pipeline as EGVL/PCAR; if either Giac call
       returns a non-list shape, surface `Bad argument value` to keep
       the error wording identical to the EGVL no-list case.
     • No-fallback policy: `!giac.isReady()` ⇒ `CAS not ready`.
   ------------------------------------------------------------------ */
register('EGV', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);

  // --- eigenvector matrix ---
  const evecRaw = giac.caseval(`egv(${matStr})`);
  const evecRows = splitGiacList(evecRaw);
  if (evecRows === null) throw new RPLError('Bad argument value');
  const matrixRows = evecRows.map((rowStr) => {
    const cols = splitGiacList(rowStr);
    if (cols === null) throw new RPLError('Bad argument value');
    return cols.map((c) => _astToRplValue(giacToAst(c)));
  });

  // --- eigenvalue vector --- (same call EGVL uses → same ordering)
  const evalRaw = giac.caseval(`eigenvals(${matStr})`);
  const evalParts = splitGiacList(evalRaw);
  if (evalParts === null) throw new RPLError('Bad argument value');
  const evalItems = evalParts.map((elt) => _astToRplValue(giacToAst(elt)));

  // Push matrix first (it ends up at level 2), then the vector.
  s.push(Matrix(matrixRows));
  s.push(Vector(evalItems));
});

/* ------------------------------------------------------------------
   SCHUR   (HP50 AUR §3-218)
   Schur decomposition of a square matrix.

     Input :  level 1 = [[ M ]]   (n × n)
     Output:  level 2 = [[ Q ]]   (orthogonal / unitary)
              level 1 = [[ T ]]   (upper quasi-triangular)
   such that  M = Q · T · TRN(Q).

   Giac exposes `SCHUR(A) = hessenberg(A,-1)`, returning the pair
   `[P, B]` with `B = inv(P)·A·P`.  P is orthogonal, so `inv(P) =
   TRN(P)` and the identity matches HP50's Q / T exactly (P↔Q, B↔T).
   Both matrices flow through the same `_matrixToGiacStr` /
   `_astToRplValue` pipeline as EGV; a non-pair / non-matrix shape from
   Giac surfaces `Bad argument value`.  No-fallback: `!giac.isReady()`
   ⇒ `CAS not ready`.
   ------------------------------------------------------------------ */
register('SCHUR', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);
  const pair = splitGiacList(giac.caseval(`SCHUR(${matStr})`));
  if (pair === null || pair.length !== 2) throw new RPLError('Bad argument value');
  const toMatrix = (mStr) => {
    const rows = splitGiacList(mStr);
    if (rows === null) throw new RPLError('Bad argument value');
    return Matrix(rows.map((rowStr) => {
      const cols = splitGiacList(rowStr);
      if (cols === null) throw new RPLError('Bad argument value');
      return cols.map((c) => _astToRplValue(giacToAst(c)));
    }));
  };
  s.push(toMatrix(pair[0]));
  s.push(toMatrix(pair[1]));
});

/* ------------------------------------------------------------------
   RSD   (HP50 AUR §3-213)
   Residual command — returns B − A·Z.

     Input :  level 3 = B  (vector or matrix)
              level 2 = A  (m × k matrix)
              level 1 = Z  (vector of length k, OR k × n matrix)
     Output:  level 1 = R = B − A·Z (same shape as B)

   Shape constraints (per AUR p.3-213):
     • A must be a matrix.
     • cols(A) must equal len(Z) (Z vector) or rows(Z) (Z matrix).
     • rows(A) must equal len(B) (B vector) or rows(B) (B matrix).
     • B and Z must both be vectors or both be matrices.
     • If both matrices, cols(B) must equal cols(Z).

   Numeric path only — entries must be Real or Integer.  Mirrors the
   LSQ rejection policy (`_asNumArray*`).  The result is a Real-typed
   Vector or Matrix (matching how LSQ / RREF return Real entries on
   the numeric branch).
   ------------------------------------------------------------------ */
register('RSD', (s) => {
  const [B, A, Z] = s.popN(3);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');

  const m = A.rows.length;
  const k = m > 0 ? A.rows[0].length : 0;
  if (m === 0 || k === 0) throw new RPLError('Invalid dimension');

  // Promote A to plain numbers up-front; this also surfaces the
  // Real/Integer-only contract on A's entries before we look at B/Z.
  const aNum = _asNumArray2D(A.rows);

  // Vector branch — B and Z both vectors.
  if (isVector(B) && isVector(Z)) {
    if (Z.items.length !== k) throw new RPLError('Invalid dimension');
    if (B.items.length !== m) throw new RPLError('Invalid dimension');
    const bNum = _asNumArray1D(B.items);
    const zNum = _asNumArray1D(Z.items);
    const az = _matVecNum(aNum, zNum);
    const out = new Array(m);
    for (let i = 0; i < m; i++) out[i] = Real(bNum[i] - az[i]);
    s.push(Vector(out));
    return;
  }

  // Matrix branch — B and Z both matrices.
  if (isMatrix(B) && isMatrix(Z)) {
    const zRows = Z.rows.length;
    const zCols = zRows > 0 ? Z.rows[0].length : 0;
    if (zRows !== k) throw new RPLError('Invalid dimension');
    if (zCols === 0) throw new RPLError('Invalid dimension');
    const bRows = B.rows.length;
    const bCols = bRows > 0 ? B.rows[0].length : 0;
    if (bRows !== m) throw new RPLError('Invalid dimension');
    if (bCols !== zCols) throw new RPLError('Invalid dimension');
    const bNum = _asNumArray2D(B.rows);
    const zNum = _asNumArray2D(Z.rows);
    const az = _matMulNum(aNum, zNum);
    const rows = new Array(m);
    for (let i = 0; i < m; i++) {
      const row = new Array(zCols);
      for (let j = 0; j < zCols; j++) row[j] = Real(bNum[i][j] - az[i][j]);
      rows[i] = row;
    }
    s.push(Matrix(rows));
    return;
  }

  // Mixed shapes (vector + matrix) and any other combination → reject.
  throw new RPLError('Bad argument type');
});

/* ------------------------------------------------------------------
   GREDUCE   (HP50 AUR §3-99)
   Reduce a polynomial with respect to a Grœbner basis.

     Input :  level 3 = poly      (Symbolic / Name / numeric)
              level 2 = basis     (Vector of polynomials)
              level 1 = vars      (Vector of bare Names — variable list)
     Output:  level 1 = the input polynomial reduced modulo the basis

   Bridges to Giac `greduce(p, [b1,…,bN], [v1,…,vM])`.  The result is a
   single polynomial — push it back through the same `giacToAst →
   _astToRplValue` chain PCAR/EGVL use, so a numeric remainder lands
   as a Real / Integer and a polynomial remainder as a Symbolic.

   Argument shape rejections:
     • level 1 must be a Vector of bare Names (with isName predicate);
       a Vector of strings or Symbolics rejects with `Bad argument type`.
     • level 2 must be a Vector of polynomials — Symbolic / Name /
       Integer / Real / Rational entries OK (lifted via _scalarToGiacStr).
     • level 3 likewise.
     • Empty basis or empty var-list → `Invalid dimension`.

   No-fallback: `!giac.isReady()` ⇒ `CAS not ready`.

   Example (AUR p.3-99):
     GREDUCE( X^2*Y - X*Y - 1, [X, 2*Y^3 - 1], [X, Y] )  →  -1
   ------------------------------------------------------------------ */
register('GREDUCE', (s) => {
  const [poly, basisV, varsV] = s.popN(3);
  if (!isVector(varsV))  throw new RPLError('Bad argument type');
  if (!isVector(basisV)) throw new RPLError('Bad argument type');
  if (varsV.items.length === 0)  throw new RPLError('Invalid dimension');
  if (basisV.items.length === 0) throw new RPLError('Invalid dimension');

  // Variable list must be bare Names — anything else (Symbolic, String)
  // would produce nonsense Giac calls.
  for (const v of varsV.items) {
    if (!isName(v)) throw new RPLError('Bad argument type');
  }

  if (!giac.isReady()) throw new RPLError('CAS not ready');

  const polyStr = _scalarToGiacStr(poly);
  const basisParts = basisV.items.map(_scalarToGiacStr);
  const varsParts  = varsV.items.map((n) => n.id);
  const cmd = `greduce(${polyStr},[${basisParts.join(',')}],[${varsParts.join(',')}])`;
  const raw = giac.caseval(cmd);
  // greduce returns a single polynomial (or constant), not a list.
  // Hand it through the same lift PCAR uses — numerics unwrap, the
  // rest stay Symbolic.
  s.push(_astToRplValue(giacToAst(raw)));
});

/* ------------------------------------------------------------------
   GBASIS    (HP50 AUR §3-95)
   Compute a Grœbner basis of the ideal generated by a vector of
   polynomials over a given variable list.

     Input :  level 2 = F     (Vector of polynomials)
              level 1 = vars  (Vector of bare Names)
     Output: level 1 = G      (Vector containing the basis polynomials)

   Bridges to Giac `gbasis([p1,…,pN], [v1,…,vM])`.  Giac's `gbasis`
   returns a bracketed list of polynomials — split with
   `splitGiacList`, lift each through `giacToAst → _astToRplValue` so
   numeric basis entries land as Real/Integer and non-trivial
   polynomial entries stay Symbolic (mirrors GREDUCE / EGVL).

   Argument shape rejections:
     • level 1 must be a Vector of bare Names; non-Name elements →
       `Bad argument type`.
     • level 2 must be a Vector of polynomials — Symbolic / Name /
       Integer / Real / Rational entries are accepted (`_scalarToGiacStr`).
     • Empty F or empty vars list → `Invalid dimension`.
     • Non-Vector level 1 / level 2 → `Bad argument type`.
     • Giac returning a non-list result → `Bad argument value`
       (defensive — should never happen for a well-formed gbasis call).

   No-fallback: `!giac.isReady()` ⇒ `CAS not ready`.

   Example (AUR p.3-95):
     GBASIS( [ X^2 + 2*X*Y^2, X*Y + 2*Y^3 - 1 ], [ X, Y ] )
       →  [ X, 2*Y^3 - 1 ]
   ------------------------------------------------------------------ */
register('GBASIS', (s) => {
  const [polysV, varsV] = s.popN(2);
  if (!isVector(varsV))  throw new RPLError('Bad argument type');
  if (!isVector(polysV)) throw new RPLError('Bad argument type');
  if (varsV.items.length === 0)  throw new RPLError('Invalid dimension');
  if (polysV.items.length === 0) throw new RPLError('Invalid dimension');

  for (const v of varsV.items) {
    if (!isName(v)) throw new RPLError('Bad argument type');
  }

  if (!giac.isReady()) throw new RPLError('CAS not ready');

  const polysParts = polysV.items.map(_scalarToGiacStr);
  const varsParts  = varsV.items.map((n) => n.id);
  const cmd = `gbasis([${polysParts.join(',')}],[${varsParts.join(',')}])`;
  const raw = giac.caseval(cmd);

  const parts = splitGiacList(raw);
  if (parts === null) throw new RPLError('Bad argument value');
  const items = parts.map((elt) => _astToRplValue(giacToAst(elt)));
  s.push(Vector(items));
});

/* ---- FROOTS biquadratic residual pass -------------------------------
   A natural follow-on to the exact-irrational quadratic residual.
   If after rational-root peeling the residual polynomial is
   degree 4 with `coef[1] = coef[3] = 0` (`X⁴ + bX² + c` with
   optional leading coefficient), treat it as the quadratic
   `u² + Bu + C` in `u = X²` where B = coefs[2]/coefs[0] and
   C = coefs[4]/coefs[0].  Find the two u-roots via the existing
   `_quadraticExactResidualRoots`, then emit the four roots
   ±√u₁, ±√u₂ as Symbolic radicals.

   Constraints:
     • All five coefficients must be integers (the underlying quadratic
       residual pass requires that).
     • The `u` roots must be exact-irrational (the quadratic residual
       pass returns null otherwise — complex u-roots or rational u-roots
       would have already been peeled or fall to Durand-Kerner).
     • The quadratic in u becomes `a·u² + b·u + c` with leading `a`;
       we pass `[a, b, c]` unchanged to the quadratic residual pass.

   Returns an array of four `{ast, mult}` items, or null on no-match.

   NOTE: we don't bother with the `u` root being rational — the
   rational-root peeler upstream would already have extracted those
   factors when the residual was degree-5+ or via the full-poly scan.
   For a pure `X⁴ + bX² + c` with rational `u` roots, the current
   peeler misses them (it scans X-linear roots only), so a future
   extension can add a `u`-rational path here. */

function _biquadResidualRoots(coefs) {
  if (coefs.length !== 5) return null;
  if (!_allIntegerCoefs(coefs)) return null;
  if (coefs[1] !== 0 || coefs[3] !== 0) return null;
  if (coefs[0] === 0) return null;
  // Pass [a, b, c] = [coefs[0], coefs[2], coefs[4]] to the quadratic
  // residual solver — it returns two exact-irrational u roots or null.
  const uRoots = _quadraticExactResidualRoots([coefs[0], coefs[2], coefs[4]]);
  if (!uRoots) return null;
  // For each u-root, emit ±√u as Symbolic.  We don't attempt to
  // simplify √(k·√m + RB/DEN)-style — the nested radical stays literal
  // in the AST.  Matches the HP50 behaviour on `X⁴ - 10X² + 1` which
  // returns the four nested-radical roots directly.
  const out = [];
  for (const ur of uRoots) {
    const sqrtU = AstFn('SQRT', [ur.ast]);
    out.push({ ast: sqrtU, mult: 1 });
    out.push({ ast: AstNeg(sqrtU), mult: 1 });
  }
  return out;
}

/* ------------------------------------------------------------------
   APPROX-mode push-time coercion.

   When flag -105 is SET ("_approx_"), values that land on the stack
   fresh get collapsed to Real on the way in — this is the user-facing
   rule "in APPROX mode, fractions and integers are converted to
   decimal upon entry, in expressions too."  Scope:

     Integer   → Real (BigInt → Decimal via string so precision holds
                 above 2^53 — a 30-digit factorial decimates cleanly).
     Rational  → Real via Decimal(n).div(Decimal(d)).
     Symbolic  → Real when the AST has no free variables AND the
                 numeric evaluator (algebraEvalAst) reduces it to a
                 Num node.  `X+1` stays symbolic; `1/3` folds to
                 0.333…; `2^(1/3)` folds to 1.2599… .

   Types we DON'T touch: Real (already decimal), Complex, BinaryInteger
   (integer arithmetic domain), Unit (carries a Real value already),
   Vector/Matrix (their numeric entries are Real-typed by construction
   on entry), List, Program, Tagged, Name, Directory, String, Grob.

   The coercion consults getApproxMode() on every call — so a flag
   flip takes effect immediately for the next push, no re-registration
   needed.  EXACT mode makes this a true no-op.

   Install-time placement: bottom of ops.js, after every helper the
   coercion might touch (algebraEvalAst) and every type predicate is
   already in scope from the module imports.
   ------------------------------------------------------------------ */
setPushCoerce((v) => {
  if (!getApproxMode()) return v;
  if (v == null) return v;
  if (isInteger(v)) {
    return Real(new Decimal(v.value.toString()));
  }
  if (isRational(v)) {
    const n = new Decimal(v.n.toString());
    const d = new Decimal(v.d.toString());
    return Real(n.div(d));
  }
  if (isSymbolic(v)) {
    // Only fold if there are no free variables to look up — otherwise
    // the expression is load-bearing (`X+1`) and must stay symbolic.
    const vars = algebraFreeVars(v.expr);
    if (vars.size === 0) {
      // No lookup; no angle-mode (a pure-numeric Symbolic without
      // trig args doesn't care).  A `num` result folds to Real;
      // anything else (partial fold, function we can't evaluate) stays
      // Symbolic so the user sees exactly what they entered.
      const reduced = algebraEvalAst(v.expr, () => null, _angleAwareFnEval, null);
      if (reduced && reduced.kind === 'num' && Number.isFinite(reduced.value)) {
        return Real(reduced.value);
      }
    }
  }
  return v;
});
