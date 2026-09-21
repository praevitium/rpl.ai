import { isInteger, isReal, Symbolic, Integer, Real, RList, Complex, isList } from '../types.js';
import { RPLError } from '../stack.js';
import { Fn as AstFn, Bin as AstBin, Num as AstNum, Neg as AstNeg } from '../algebra.js';
import { getCasModulo, setCasModulo } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { buildGiacCmd, giacToAst, astToGiac } from '../cas/giac-convert.mjs';
import { register, lookup } from './registry.js';
import { FALSE, TRUE, _ONE, _ZERO, _astToRplValue, _bigFactorial, _gamma, _isSymOperand, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary, _withVMUnary } from './internal.js';



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
})), { category: 'Integer / number theory', categoryOrder: 0, label: "GCD" });

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
})), { category: 'Integer / number theory', categoryOrder: 1, label: "LCM" });

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
}))), { category: 'Integer / number theory', categoryOrder: 2, label: "FACT" });


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
}, { category: 'Integer / number theory', categoryOrder: 15, label: "IDIV2" });


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
})), { category: 'Integer / number theory', categoryOrder: 16, label: "IQUOT" });


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
})), { category: 'Integer / number theory', categoryOrder: 17, label: "IREMAINDER" });


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
}, { category: 'Integer / number theory', categoryOrder: 14, label: "EUCLID" });


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
}, { category: 'Integer / number theory', categoryOrder: 24, label: "INVMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 19, label: "MODSTO" });


register('ADDTMOD', (s) => _modBinary(s, (a, b) => a + b, '+'), { category: 'Integer / number theory', categoryOrder: 20, label: "ADDTMOD" });

register('SUBTMOD', (s) => _modBinary(s, (a, b) => a - b, '-'), { category: 'Integer / number theory', categoryOrder: 21, label: "SUBTMOD" });

register('MULTMOD', (s) => _modBinary(s, (a, b) => a * b, '*'), { category: 'Integer / number theory', categoryOrder: 22, label: "MULTMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 23, label: "POWMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 28, label: "EXPANDMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 29, label: "FACTORMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 27, label: "GCDMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 25, label: "DIVMOD" });


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
}, { category: 'Integer / number theory', categoryOrder: 26, label: "DIV2MOD" });



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
register('!', (s) => { lookup('FACT').fn(s); }, { category: 'Integer / number theory', categoryOrder: 3, label: "!" });

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
}, { category: 'Integer / number theory', categoryOrder: 7, label: "ISPRIME?" });


register('NEXTPRIME', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  const p = _nextPrimeBig(n);
  s.push(Integer(p));
}, { category: 'Integer / number theory', categoryOrder: 8, label: "NEXTPRIME" });


register('PREVPRIME', (s) => {
  const [v] = s.popN(1);
  const n = _toBigIntStrict(v);
  const p = _prevPrimeBig(n);
  if (p === null) throw new RPLError('Bad argument value');
  s.push(Integer(p));
}, { category: 'Integer / number theory', categoryOrder: 9, label: "PREVPRIME" });


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
}, { category: 'Integer / number theory', categoryOrder: 18, label: "PA2B2" });


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
}, { category: 'Integer / number theory', categoryOrder: 6, label: "EULER" });


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
}, { category: 'Integer / number theory', categoryOrder: 4, label: "DIVIS" });


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
}, { category: 'Integer / number theory', categoryOrder: 5, label: "FACTORS" });


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
}, { category: 'Integer / number theory', categoryOrder: 11, label: "IBERNOULLI" });


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
}, { category: 'Integer / number theory', categoryOrder: 13, label: "IEGCD" });


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
}, { category: 'Integer / number theory', categoryOrder: 12, label: "ICHINREM" });


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
}, { category: 'Integer / number theory', categoryOrder: 10, label: "IABCUV" });
