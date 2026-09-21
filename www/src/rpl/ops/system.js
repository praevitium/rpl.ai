import { isReal, Real, isInteger, Integer, isBinaryInteger, BinaryInteger, isRational, Rational, isComplex, Complex, isString, Str, isName, Name, isSymbolic, Symbolic, isList, RList, isVector, Vector, isMatrix, Matrix, isProgram, Program, isTagged, Tagged, isUnit, Unit } from '../types.js';
import { register } from './registry.js';



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
}, { category: 'System', categoryOrder: 1, label: "BYTES" });


register('NEWOB', (s) => {
  const [v] = s.popN(1);
  s.push(_newObCopy(v));
}, { category: 'System', categoryOrder: 2, label: "NEWOB" });


register('MEM', (s) => {
  // 1 GiB — a plausible, fixed "free memory" reading.  Unlike the HP50
  // this app has no bounded memory pool to measure; a constant keeps
  // MEM comparisons (`IF MEM 1000 < THEN ...`) predictable across runs.
  s.push(Real(1073741824));
}, { category: 'System', categoryOrder: 0, label: "MEM" });
