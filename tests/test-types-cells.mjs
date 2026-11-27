import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Str, Directory, Tagged, Unit, RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isDirectory, isName, isString, isNumber, isTagged, isList,
  isVector, isMatrix, isSymbolic, Decimal, TYPES, bigintText, isStackOverflow,
} from '../www/src/rpl/types.js';
import { readFileSync } from 'node:fs';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatSource, formatStackTop } from '../www/src/rpl/formatter.js';
import { setWordsize, getWordsize } from '../www/src/rpl/state.js';
import { assert, assertThrows, runOp, runLine } from './helpers.mjs';

/* The type-support cells: wrapper additions, cell audits and the rejection pins. */

/* ================================================================
   HEAVISIDE / DIRAC L / V / M / T wrapper-add
   Both ops wrapped with _withTaggedUnary(_withListUnary(_withVMUnary(…)))
 matching the same 3-deep composition used by XPON/MANT.
   HEAVISIDE: step function — scalar arm returns Real(1)/Real(0) or
   Integer(1)/Integer(0) depending on input type.  DIRAC: impulse —
   non-zero scalar folds to Real(0)/Integer(0); x=0 lifts to Symbolic.
   ================================================================ */
{

  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session191: { } HEAVISIDE → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('h', RList([])));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 0,
      `session191: :h:{ } HEAVISIDE → :h:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — value-precise: HEAVISIDE(2)=1
  {
    const s = new Stack();
    s.push(RList([Real(2)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(item) && item.value.toNumber() === 1,
      `session191: { Real(2) } HEAVISIDE → { Real(1) } (n=1 bare List; got item=${item?.value?.toString()})`);
  }

  // n=2 heterogeneous bare List — HEAVISIDE(2)=1, HEAVISIDE(-1)=0 distinct per slot
  {
    const s = new Stack();
    s.push(RList([Real(2), Real(-1)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: { Real(2) Real(-1) } HEAVISIDE → { Real(1) Real(0) } (n=2 bare List heterogeneous step output; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — outer tag re-wrapped
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(2), Real(-1)])));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: :h:{ Real(2) Real(-1) } HEAVISIDE → :h:{ Real(1) Real(0) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: HEAVISIDE(1)=1, HEAVISIDE(-1)=0
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-1)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: [Real(1) Real(-1)] HEAVISIDE → [Real(1) Real(0)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: 1×2 [[1 -1]] → [[1 0]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(-1)]]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const row = v?.rows?.[0] ?? [];
    assert(isMatrix(v) && v.rows.length === 1 && row.length === 2
        && isReal(row[0]) && row[0].value.toNumber() === 1
        && isReal(row[1]) && row[1].value.toNumber() === 0,
      `session191: [[Real(1) Real(-1)]] HEAVISIDE → [[Real(1) Real(0)]] (Matrix element-wise; got r00=${row[0]?.value?.toString()} r01=${row[1]?.value?.toString()})`);
  }

  // scalar Tagged-of-Real — tag preserved, inner folded
  {
    const s = new Stack();
    s.push(Tagged('x', Real(3)));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'x' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session191: :x:Real(3) HEAVISIDE → :x:Real(1) (scalar Tagged; HEAVISIDE(3)=1; got tag=${v?.tag} val=${v?.value?.value?.toString()})`);
  }


  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session191: { } DIRAC → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('d', RList([])));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'd' && isList(v.value) && v.value.items.length === 0,
      `session191: :d:{ } DIRAC → :d:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — at-zero: DIRAC(Real(0)) → Symbolic(DIRAC(0)) propagates through wrapper
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1
        && isSymbolic(item) && item.expr?.kind === 'fn' && item.expr?.name === 'DIRAC',
      `session191: { Real(0) } DIRAC → { Symbolic(DIRAC(0)) } (n=1 bare List; at-zero lifts to Symbolic through wrapper; got item type=${item?.type} expr=${JSON.stringify(item?.expr)})`);
  }

  // n=2 bare List non-zero — DIRAC(1)=0, DIRAC(2)=0 per slot
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: { Real(1) Real(2) } DIRAC → { Real(0) Real(0) } (n=2 bare List non-zero; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — outer tag re-wrapped
  {
    const s = new Stack();
    s.push(Tagged('d', RList([Real(1), Real(2)])));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'd' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: :d:{ Real(1) Real(2) } DIRAC → :d:{ Real(0) Real(0) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: DIRAC(1)=0, DIRAC(3)=0
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(3)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: [Real(1) Real(3)] DIRAC → [Real(0) Real(0)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: 1×1 [[Real(1)]] → [[Real(0)]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(1)]]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1
        && isReal(cell) && cell.value.toNumber() === 0,
      `session191: [[Real(1)]] DIRAC → [[Real(0)]] (Matrix element-wise; got cell=${cell?.value?.toString()})`);
  }

  // scalar Tagged-of-Real — tag preserved, inner folded
  {
    const s = new Stack();
    s.push(Tagged('x', Real(5)));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'x' && isReal(v.value) && v.value.value.toNumber() === 0,
      `session191: :x:Real(5) DIRAC → :x:Real(0) (scalar Tagged; DIRAC(5)=0; got tag=${v?.tag} val=${v?.value?.value?.toString()})`);
  }
}

/* ================================================================
   session196: TRUNC — List distribution + Tagged transparency
   (_withTaggedBinary(_withListBinary(_symbolicRoundingOp('TRUNC', …))) wrapper-add)

   TRUNC is a 2-arg op: (x n → y), truncates x to n decimal places.
   Binary Tagged transparency drops the tag (unlike unary, which re-applies).
   V/M are deliberately ✗ — no _withVMBinary; mirrors MOD/MIN/MAX policy.
   ================================================================ */
{
  // n=0 empty-List bare — passthrough: { } 1 TRUNC → { }
  {
    const v = runOp('TRUNC', RList([]), Integer(1n));
    assert(isList(v) && v.items.length === 0,
      `session196: { } Integer(1) TRUNC → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 Tagged-of-List — binary drops tag: :t:{ } 1 TRUNC → { }
  {
    const v = runOp('TRUNC', Tagged('t', RList([])), Integer(1n));
    assert(isList(v) && v.items.length === 0,
      `session196: :t:{ } Integer(1) TRUNC → { } (n=0 Tagged-of-List; binary tag drop; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=1 bare List single element: { Real(3.567) } Integer(1) TRUNC → { Real(3.5) }
  {
    const s = new Stack();
    s.push(RList([Real(3.567)]));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1
        && isReal(item) && item.value.toNumber() === 3.5,
      `session196: { Real(3.567) } Integer(1) TRUNC → { Real(3.5) } (n=1 bare List; got item=${item?.value?.toString()})`);
  }

  // n=2 bare List heterogeneous values: { Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) }
  {
    const s = new Stack();
    s.push(RList([Real(1.567), Real(2.891)]));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1.5
        && isReal(b) && b.value.toNumber() === 2.8,
      `session196: { Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) } (n=2 bare List; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — binary drops tag: :t:{ Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) }
  {
    const s = new Stack();
    s.push(Tagged('t', RList([Real(1.567), Real(2.891)])));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1.5
        && isReal(b) && b.value.toNumber() === 2.8,
      `session196: :t:{ Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) } (Tagged-of-List; tag dropped; got type=${v?.type} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // scalar Tagged — binary drops tag: :t:Real(3.567) Integer(1) TRUNC → Real(3.5)
  {
    const v = runOp('TRUNC', Tagged('t', Real(3.567)), Integer(1n));
    assert(isReal(v) && !isTagged(v) && v.value.toNumber() === 3.5,
      `session196: :t:Real(3.567) Integer(1) TRUNC → Real(3.5) (scalar Tagged; tag dropped; got type=${v?.type} val=${v?.value?.toString()})`);
  }

  // pairwise List × List: { Real(1.99) Real(2.345) } { Integer(0) Integer(2) } TRUNC → { Real(1) Real(2.34) }
  {
    const s = new Stack();
    s.push(RList([Real(1.99), Real(2.345)]));
    s.push(RList([Integer(0n), Integer(2n)]));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && Math.abs(b.value.toNumber() - 2.34) < 1e-10,
      `session196: { Real(1.99) Real(2.345) } { Integer(0) Integer(2) } TRUNC → { Real(1) Real(2.34) } (pairwise L×L; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector rejection — V stays ✗ (no _withVMBinary; mirrors MOD/MIN/MAX)
  assertThrows(
    () => runOp('TRUNC', Vector([Real(1.5), Real(2.5)]), Integer(1n)),
    /Bad argument type/,
    'session196: Vector Integer(1) TRUNC → Bad argument type (V deliberately ✗)');
}

/* ================================================================
   session351: TRUNC V/M rejection — symmetric across both operand
   positions + the x-slot Matrix arm.

   session196 pinned only the x-slot (level 2) VECTOR rejection, which
   trips `_roundingOp`'s `!isReal(xv) && !isInteger(xv)` guard.  Two arms
   stayed unpinned: the x-slot MATRIX (same guard, different kind) and
   BOTH n-slot (level 1) V/M arms — n routes through
   `Number(isInteger(nv) ? nv.value : toRealOrThrow(nv))`, so a V/M in the
   n position is rejected by `toRealOrThrow` ('expected real, got
   vector/matrix') rather than the x-slot guard.  `_withListBinary`
   distributes Lists only, so a V/M in either slot reaches `_symbolicRoundingOp`'s
   inner numeric handler.  Pins guard a refactor that drops the second-
   operand `toRealOrThrow` check or narrows the x-slot type guard to
   Vector-only.  No source change — the rejection was already correct.
   ================================================================ */
{
  // x-slot Matrix (level 2) — same _roundingOp guard as the Vector arm
  assertThrows(
    () => runOp('TRUNC', Matrix([[Real(1.5), Real(2.5)]]), Integer(1n)),
    /Bad argument type/,
    'session351: Matrix Integer(1) TRUNC → Bad argument type (x-slot M ✗; _roundingOp !isReal&&!isInteger)');

  // n-slot Vector (level 1) — rejected by toRealOrThrow, not the x-slot guard
  assertThrows(
    () => runOp('TRUNC', Real(3.14159), Vector([Real(1), Real(2)])),
    /expected real, got vector/i,
    'session351: Real(3.14159) Vector TRUNC → expected real, got vector (n-slot V ✗ via toRealOrThrow)');

  // n-slot Matrix (level 1) — same toRealOrThrow path
  assertThrows(
    () => runOp('TRUNC', Real(3.14159), Matrix([[Integer(1n)]])),
    /expected real, got matrix/i,
    'session351: Real(3.14159) Matrix TRUNC → expected real, got matrix (n-slot M ✗ via toRealOrThrow)');

  // n-slot V/M reject regardless of a valid Integer x (operand-position symmetry)
  assertThrows(
    () => runOp('TRUNC', Integer(5n), Vector([Real(1)])),
    /expected real, got vector/i,
    'session351: Integer(5) Vector TRUNC → expected real, got vector (n-slot V ✗, valid Integer x)');
}

/* ================================================================
   session200: GAMMA / LNGAMMA / erf / erfc — L/V/M/T verification
   (stale `·` cells → ✓ in DATA_TYPES.md matrix)

   These ops were already wrapped in their current registrations:
     GAMMA   → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     LNGAMMA → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     erf     → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     erfc    → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
   The DATA_TYPES.md matrix carried `·` (not-applicable) for L/V/M on
   all four ops — a documentation lag from when the wrappers were added.
   No source changes; this cluster adds the missing hard assertions
   and promotes the matrix cells.

   Integer operands are used throughout because the inner handlers have
   an EXACT-mode integer-stay-exact arm:
     GAMMA(Integer(n))  = Integer((n-1)!)  for small n (≤ 170).
     GAMMA(Integer(2))  = Integer(1),  GAMMA(Integer(5)) = Integer(24).
     LNGAMMA(Integer(2)) = Real(0)  (ln 1! = ln 1 = 0, exact fp result).
     erf(Integer(0))    = Real(0)   (zero special-case, no series).
     erfc(Integer(0))   = Real(1)   (zero special-case).
   These clean-integer inputs give deterministic, floating-point-exact
   outputs that pin the wrapper dispatch without needing tolerance guards.
   ================================================================ */
{

  // n=0 bare-List passthrough: { } GAMMA → { }
  {
    const v = runOp('GAMMA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session200: { } GAMMA → { } (n=0 bare-List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 Tagged-of-List: :g:{ } GAMMA → :g:{ }
  {
    const v = runOp('GAMMA', Tagged('g', RList([])));
    assert(isTagged(v) && v.tag === 'g' && isList(v.value) && v.value.items.length === 0,
      `session200: :g:{ } GAMMA → :g:{ } (n=0 T+L; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=2 bare-List integer-exact: { Integer(1) Integer(5) } GAMMA → { Integer(1) Integer(24) }
  {
    const v = runOp('GAMMA', RList([Integer(1n), Integer(5n)]));
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: { Integer(1) Integer(5) } GAMMA → { Integer(1) Integer(24) } (n=2 bare-List integer-exact; got a=${a?.value} b=${b?.value})`);
  }

  // n=2 Tagged-of-List: :g:{ Integer(1) Integer(5) } GAMMA → :g:{ Integer(1) Integer(24) }
  {
    const v = runOp('GAMMA', Tagged('g', RList([Integer(1n), Integer(5n)])));
    const inner = v?.value;
    const [a, b] = inner?.items ?? [];
    assert(isTagged(v) && v.tag === 'g' && isList(inner)
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: :g:{ Integer(1) Integer(5) } GAMMA → :g:{ Integer(1) Integer(24) } (T+L; tag preserved; got tag=${v?.tag} a=${a?.value} b=${b?.value})`);
  }

  // Vector axis: [ Integer(1) Integer(5) ] GAMMA → [ Integer(1) Integer(24) ]
  {
    const v = runOp('GAMMA', Vector([Integer(1n), Integer(5n)]));
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: [ Integer(1) Integer(5) ] GAMMA → [ Integer(1) Integer(24) ] (V integer-exact; got a=${a?.value} b=${b?.value})`);
  }

  // Matrix axis: [[ Integer(2) Integer(3) ]] GAMMA → [[ Integer(1) Integer(2) ]]
  {
    const v = runOp('GAMMA', Matrix([[Integer(2n), Integer(3n)]]));
    const row = v?.rows?.[0] ?? [];
    assert(isMatrix(v) && v.rows.length === 1 && row.length === 2
        && isInteger(row[0]) && row[0].value === 1n
        && isInteger(row[1]) && row[1].value === 2n,
      `session200: [[ Integer(2) Integer(3) ]] GAMMA → [[ Integer(1) Integer(2) ]] (M integer-exact; got r00=${row[0]?.value} r01=${row[1]?.value})`);
  }


  // n=0 bare-List passthrough: { } LNGAMMA → { }
  {
    const v = runOp('LNGAMMA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session200: { } LNGAMMA → { } (n=0 bare-List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // Matrix axis: [[ Integer(2) ]] LNGAMMA → [[ Real(0) ]]   (lngamma(2) = ln(1!) = 0 exactly)
  {
    const v = runOp('LNGAMMA', Matrix([[Integer(2n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && isReal(cell) && cell.value.toNumber() === 0,
      `session200: [[ Integer(2) ]] LNGAMMA → [[ Real(0) ]] (M; lngamma(2)=0 exact fp; got cell=${cell?.value?.toString()})`);
  }

  // Tagged scalar: :h:Integer(2) LNGAMMA → :h:Real(0)
  {
    const v = runOp('LNGAMMA', Tagged('h', Integer(2n)));
    assert(isTagged(v) && v.tag === 'h' && isReal(v.value) && v.value.value.toNumber() === 0,
      `session200: :h:Integer(2) LNGAMMA → :h:Real(0) (T scalar; lngamma(2)=0; got tag=${v?.tag} val=${v?.value?.value?.toNumber()})`);
  }

  // Vector axis: [ Integer(2) ] LNGAMMA → [ Real(0) ]
  {
    const v = runOp('LNGAMMA', Vector([Integer(2n)]));
    const a = v?.items?.[0];
    assert(isVector(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: [ Integer(2) ] LNGAMMA → [ Real(0) ] (V; lngamma(2)=0; got a=${a?.value?.toString()})`);
  }


  // bare-List: { Integer(0) } erf → { Real(0) }   (erf(0) = 0, zero special-case)
  {
    const v = runOp('erf', RList([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: { Integer(0) } erf → { Real(0) } (bare-List; erf(0)=0; got a=${a?.value?.toString()})`);
  }

  // Vector axis: [ Integer(0) ] erf → [ Real(0) ]
  {
    const v = runOp('erf', Vector([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isVector(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: [ Integer(0) ] erf → [ Real(0) ] (V; erf(0)=0; got a=${a?.value?.toString()})`);
  }


  // Tagged scalar: :e:Integer(0) erfc → :e:Real(1)   (erfc(0) = 1, zero special-case)
  {
    const v = runOp('erfc', Tagged('e', Integer(0n)));
    assert(isTagged(v) && v.tag === 'e' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session200: :e:Integer(0) erfc → :e:Real(1) (T scalar; erfc(0)=1; got tag=${v?.tag} val=${v?.value?.value?.toNumber()})`);
  }
}

/* ================================================================
   session204: erfc L/V/M/T+L stale-dot-cell promotion.
   erfc is registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
   _erfcScalar(Integer(0)) = Real(1)  (zero special-case, no series).
   _erfcScalar(Integer(1)) = Real(_regGammaQ(0.5, 1)) ≈ Real(0.1573) — distinct
   from _erfcScalar(Integer(0)), giving heterogeneous output on a 2-element list.
   pinned the T scalar path only; this cluster pins the three
   remaining collection axes: bare-List (n=0, n=1, n=2 heterogeneous),
   Tagged-of-List (n=0 T+L, n=1 T+L), Vector, Matrix.
   ================================================================ */
{
  // n=0 empty-List bare: { } erfc → { }
  {
    const v = runOp('erfc', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session204: { } erfc → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // n=0 Tagged-of-List: :e:{ } erfc → :e:{ }
  {
    const v = runOp('erfc', Tagged('e', RList([])));
    assert(isTagged(v) && v.tag === 'e' && isList(v.value) && v.value.items.length === 0,
      `session204: :e:{ } erfc → :e:{ } (T+L empty; got tag=${v?.tag} inner=${v?.value?.type})`);
  }

  // n=1 bare-List: { Integer(0) } erfc → { Real(1) }  (zero special-case through wrapper)
  {
    const v = runOp('erfc', RList([Integer(0n)]));
    assert(isList(v) && v.items.length === 1 && isReal(v.items[0]) && v.items[0].value.toNumber() === 1,
      `session204: { Integer(0) } erfc → { Real(1) } (bare-List n=1; got ${v?.items?.[0]?.value?.toNumber()})`);
  }

  // n=1 Tagged-of-List: :e:{ Integer(0) } erfc → :e:{ Real(1) }
  {
    const v = runOp('erfc', Tagged('e', RList([Integer(0n)])));
    assert(isTagged(v) && v.tag === 'e' && isList(v.value) &&
           v.value.items.length === 1 && isReal(v.value.items[0]) &&
           v.value.items[0].value.toNumber() === 1,
      `session204: :e:{ Integer(0) } erfc → :e:{ Real(1) } (T+L n=1; got tag=${v?.tag} val=${v?.value?.items?.[0]?.value?.toNumber()})`);
  }

  // n=2 bare-List heterogeneous output: { Integer(0) Integer(1) } erfc → { Real(1) Real(≈0.1573) }
  // erfc(0)=1, erfc(1)≈0.1573 — distinct values confirm element-wise dispatch
  {
    const v = runOp('erfc', RList([Integer(0n), Integer(1n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isList(v) && v.items.length === 2 &&
           isReal(a) && a.value.toNumber() === 1 &&
           isReal(b) && b.value.toNumber() > 0.15 && b.value.toNumber() < 0.16,
      `session204: { Integer(0) Integer(1) } erfc → { Real(1) Real(≈0.1573) } (bare-List n=2 heterogeneous; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // Vector axis: [ Integer(0) ] erfc → [ Real(1) ]
  {
    const v = runOp('erfc', Vector([Integer(0n)]));
    assert(isVector(v) && v.items.length === 1 && isReal(v.items[0]) && v.items[0].value.toNumber() === 1,
      `session204: [ Integer(0) ] erfc → [ Real(1) ] (V; erfc(0)=1; got ${v?.items?.[0]?.value?.toNumber()})`);
  }

  // Matrix axis: [[ Integer(0) ]] erfc → [[ Real(1) ]]
  {
    const v = runOp('erfc', Matrix([[Integer(0n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && cell.value.toNumber() === 1,
      `session204: [[ Integer(0) ]] erfc → [[ Real(1) ]] (M; erfc(0)=1; got ${cell?.value?.toNumber()})`);
  }

  // session208: erf M-cell promotion (documentation lag same as erfc/session204).
  // erf is registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
  // The M branch (rows.map(r => r.map(_erfScalar))) has been in the handler
  // since the op was first wrapped; session200 only pinned L and V.
  // _erfScalar(Integer(0)) = Real(0)  (erf(0) = 0, zero special-case).

  // Matrix axis: [[ Integer(0) ]] erf → [[ Real(0) ]]
  {
    const v = runOp('erf', Matrix([[Integer(0n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && cell.value.toNumber() === 0,
      `session208: [[ Integer(0) ]] erf → [[ Real(0) ]] (M; erf(0)=0; got ${cell?.value?.toNumber()})`);
  }

  // session212: ZETA / LAMBERT Z/L/V/M stale-·-cell promotion.
  // Both are registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
  // Their scalar functions accept isInteger(v) — the Z column was also stale.
  // Anchor values: ζ(0) = -1/2 (exact fp); W(0) = 0 (exact branch in _lambertW0).


  // Z axis: Integer(0) ZETA → Real(-0.5)  (ζ(0) = -1/2, exact fp)
  {
    const v = runOp('ZETA', Integer(0n));
    assert(isReal(v) && v.value.toNumber() === -0.5,
      `session212: Integer(0) ZETA → Real(-0.5) (Z; ζ(0)=-1/2 exact; got ${v?.value?.toNumber()})`);
  }

  // L{}: { } ZETA → { }  (empty-list passthrough)
  {
    const v = runOp('ZETA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session212: { } ZETA → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(2)}: { Integer(2) } ZETA → { Real(ζ(2)) }
  {
    const v = runOp('ZETA', RList([Integer(2n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 &&
           isReal(a) && Math.abs(a.value.toNumber() - Math.PI ** 2 / 6) < 1e-10,
      `session212: { Integer(2) } ZETA → { Real(ζ(2)) } (bare-List; got ${a?.value?.toNumber()})`);
  }

  // V: [ Integer(2) Integer(0) ] ZETA → [ Real(ζ(2)) Real(-0.5) ]
  {
    const v = runOp('ZETA', Vector([Integer(2n), Integer(0n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - Math.PI ** 2 / 6) < 1e-10 &&
           isReal(b) && b.value.toNumber() === -0.5,
      `session212: [ Integer(2) Integer(0) ] ZETA → [ Real(ζ(2)) Real(-0.5) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(2) ]] ZETA → [[ Real(ζ(2)) ]]
  {
    const v = runOp('ZETA', Matrix([[Integer(2n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - Math.PI ** 2 / 6) < 1e-10,
      `session212: [[ Integer(2) ]] ZETA → [[ Real(ζ(2)) ]] (M; got ${cell?.value?.toNumber()})`);
  }


  // Z axis: Integer(0) LAMBERT → Real(0)  (W(0) = 0, exact branch in _lambertW0)
  {
    const v = runOp('LAMBERT', Integer(0n));
    assert(isReal(v) && v.value.toNumber() === 0,
      `session212: Integer(0) LAMBERT → Real(0) (Z; W(0)=0 exact; got ${v?.value?.toNumber()})`);
  }

  // L{}: { } LAMBERT → { }  (empty-list passthrough)
  {
    const v = runOp('LAMBERT', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session212: { } LAMBERT → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(0)}: { Integer(0) } LAMBERT → { Real(0) }
  {
    const v = runOp('LAMBERT', RList([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session212: { Integer(0) } LAMBERT → { Real(0) } (bare-List; W(0)=0; got ${a?.value?.toNumber()})`);
  }

  // V: [ Integer(0) Integer(1) ] LAMBERT → [ Real(0) Real(Ω) ]  (Ω ≈ 0.5671)
  {
    const v = runOp('LAMBERT', Vector([Integer(0n), Integer(1n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    const OMEGA = 0.5671432904097838;
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && a.value.toNumber() === 0 &&
           isReal(b) && Math.abs(b.value.toNumber() - OMEGA) < 1e-12,
      `session212: [ Integer(0) Integer(1) ] LAMBERT → [ Real(0) Real(Ω) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(1) ]] LAMBERT → [[ Real(Ω) ]]
  {
    const v = runOp('LAMBERT', Matrix([[Integer(1n)]]));
    const cell = v?.rows?.[0]?.[0];
    const OMEGA = 0.5671432904097838;
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - OMEGA) < 1e-12,
      `session212: [[ Integer(1) ]] LAMBERT → [[ Real(Ω) ]] (M; got ${cell?.value?.toNumber()})`);
  }
}

/* ================================================================
 — data-type-support lane.

   PSI L/V/M stale-`·`-cell promotion — documentation-only fix
   (pin additions only).

   The 1-arg digamma handler dispatches bespoke branches for
   List, Vector, and Matrix (parallel to the GAMMA/LNGAMMA shape);
   the DATA_TYPES.md matrix carried `·` for L/V/M as a
   documentation lag.  No source changes.

   Note: Tagged-of-List/Vector/Matrix is NOT covered — the bespoke
   `isTagged` branch calls `_psiScalar` directly on `v.value`,
   which throws when `v.value` is a List/Vector/Matrix.  Only bare
   scalar Tagged inputs route correctly.  T=✓ in the matrix reflects
   the scalar-Tagged path only.

   +5 `session216:` pins: L-empty passthrough; L {Integer(1)} value-
   precise (ψ(1) = −γ, tolerance 1e-12); L {Integer(1) Integer(2)}
   heterogeneous-output; V [Integer(1) Integer(2)]; M [[Integer(1)]].
   PSI matrix row: L/V/M `·`→`✓`.
   ================================================================ */
{
  const PSI_1 = -0.5772156649015329; // ψ(1) = −γ (Euler-Mascheroni constant)
  const PSI_2 =  0.4227843350984671; // ψ(2) =  1 − γ

  // L-empty: {} PSI → {}  (empty-list passthrough)
  {
    const v = runOp('PSI', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session216: {} PSI → {} (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(1)}: { Integer(1) } PSI → { Real(ψ(1)) }  (value-precise)
  {
    const v = runOp('PSI', RList([Integer(1n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12,
      `session216: { Integer(1) } PSI → { Real(ψ(1)) } (bare-List; ψ(1)=−γ; got ${a?.value?.toNumber()})`);
  }

  // L{Integer(1) Integer(2)}: heterogeneous-output (two distinct values per element)
  {
    const v = runOp('PSI', RList([Integer(1n), Integer(2n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isList(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12 &&
           isReal(b) && Math.abs(b.value.toNumber() - PSI_2) < 1e-12,
      `session216: { Integer(1) Integer(2) } PSI → { Real(ψ(1)) Real(ψ(2)) } (bare-List 2-elem; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // V: [ Integer(1) Integer(2) ] PSI → [ Real(ψ(1)) Real(ψ(2)) ]
  {
    const v = runOp('PSI', Vector([Integer(1n), Integer(2n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12 &&
           isReal(b) && Math.abs(b.value.toNumber() - PSI_2) < 1e-12,
      `session216: [ Integer(1) Integer(2) ] PSI → [ Real(ψ(1)) Real(ψ(2)) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(1) ]] PSI → [[ Real(ψ(1)) ]]
  {
    const v = runOp('PSI', Matrix([[Integer(1n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - PSI_1) < 1e-12,
      `session216: [[ Integer(1) ]] PSI → [[ Real(ψ(1)) ]] (M; got ${cell?.value?.toNumber()})`);
  }
}

/* ================================================================
 — session231: Q-cell audit — ARG / % / %T / %CH / GCD / LCM

   Closes six `·` (untested) cells in the DATA_TYPES.md Q column.

   ARG: a rational gives 0 when positive and π when negative, as a real does.  Q=✓.

   % / %T / %CH: all three dispatch through `toRealOrThrow`, which
   has an explicit `isRational(v)` branch returning Number(n)/Number(d).
   Rational inputs are accepted; result is Real (Q→R degradation,
   same as MOD/MIN/MAX from session 125).  Q=✓.

   GCD / LCM: dispatch through `_toBigIntOrThrow`, which handles only
   Integer and integer-valued Real.  Rational falls through to
   `throw new RPLError('Bad argument type')`.  Correct by design —
   GCD/LCM are integer-domain ops.  Q=✗.

   +7 session231 pins.
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    lookup('ARG').fn(s);
    assert(isReal(s.peek()) && s.peek().value.toNumber() === 0, 'session231: ARG Rational(1,2) → 0');
  }
  {
    const s = new Stack();
    s.push(Rational(-1n, 2n));
    lookup('ARG').fn(s);
    assert(isReal(s.peek()) && Math.abs(s.peek().value.toNumber() - Math.PI) < 1e-9, 'session231: ARG Rational(-1,2) → π');
  }

  // toRealOrThrow handles isRational: Number(v.n)/Number(v.d).
  // x = Rational(1,2) = 0.5, y (percent) = Real(50) → 0.5*50/100 = 0.25.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(50));
    lookup('%').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 0.25) < 1e-12,
      `session231: Rational(1,2) Real(50) % → Real(0.25) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // %T formula: 100*y/x.  x = Rational(1,4) = 0.25, y = Real(1) → 100*1/0.25 = 400.
  {
    const s = new Stack();
    s.push(Rational(1n, 4n));
    s.push(Real(1));
    lookup('%T').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 400) < 1e-12,
      `session231: Rational(1,4) Real(1) %T → Real(400) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // %CH formula: 100*(y-x)/x.  x = Rational(1,2) = 0.5, y = Real(1) → 100*(1-0.5)/0.5 = 100.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(1));
    lookup('%CH').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 100) < 1e-12,
      `session231: Rational(1,2) Real(1) %CH → Real(100) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // _toBigIntOrThrow has no isRational branch; Rational → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(2n));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      `session231: Rational(1,2) Integer(2) GCD → 'Bad argument type' (_toBigIntOrThrow rejects Rational; GCD is integer-domain)`);
  }

  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(2n));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      `session231: Rational(1,2) Integer(2) LCM → 'Bad argument type' (_toBigIntOrThrow rejects Rational; LCM is integer-domain)`);
  }

  // session337: GCD/LCM b-slot (second-operand) Rational rejection.
  // session231 pinned only the a-slot (Rational a, Integer b).  The handler
  // calls `_toBigIntOrThrow(a)` THEN `_toBigIntOrThrow(b)`, so a valid Integer
  // a passes and the Rational b throws — the symmetric-operand gap session330
  // closed for COMB/PERM/IQUOT/IREMAINDER.  `_withListBinary` distributes Lists
  // only, so a scalar Rational b reaches the inner handler's b-arm.  Even an
  // integer-valued Rational(5,1) rejects (Q-as-distinct-type, not silently
  // coerced — matches the a-slot stance).
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      `session337: Integer(2) Rational(1,2) GCD → 'Bad argument type' (b-slot _toBigIntOrThrow rejects Rational after a passes)`);
  }
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      `session337: Integer(2) Rational(1,2) LCM → 'Bad argument type' (b-slot _toBigIntOrThrow rejects Rational after a passes)`);
  }
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Rational(5n, 1n));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      `session337: Integer(2) Rational(5,1) GCD → 'Bad argument type' (integer-valued Q b still rejects; Q not coerced)`);
  }
  {
    const s = new Stack();
    s.push(Real(6));
    s.push(Rational(1n, 3n));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      `session337: Real(6) Rational(1,3) LCM → 'Bad argument type' (Real a passes, Rational b rejects)`);
  }
}

/* ================================================================
 — session236: Q-cell audit — LNP1 / EXPM / TRUNC / ZETA / LAMBERT / PSI

   Closes six `·` (untested) cells in the DATA_TYPES.md Q column.

   LNP1 / EXPM: inner handlers call `toRealOrThrow(v)` which has an
   explicit `isRational(v)` branch returning Number(n)/Number(d).
   Rational input accepted; result is Real (Q→R degradation).  Q=✓.

   TRUNC (x operand, level 2): `_roundingOp` checks
   `if (!isReal(xv) && !isInteger(xv)) throw new RPLError('Bad argument type')`.
   Rational x → rejected.  Q=✗.  The n operand (level 1) goes through
   `toRealOrThrow` and would accept a Rational n (integer-valued Q
   gives Bad argument value rather than Bad argument type), but the
   primary Q question concerns the value operand.

   ZETA / LAMBERT / PSI: scalar handlers use the pattern
   `const x = isInteger(v) ? … : isReal(v) ? … : null; if null throw`.
   Rational falls through to null → Bad argument type.  Q=✗.

   +6 session236 pins.
   ================================================================ */
{
  // toRealOrThrow handles isRational; log1p(0.5) is the expected value.
  {
    const v = runOp('LNP1', Rational(1n, 2n));
    assert(isReal(v) && Math.abs(v.value.toNumber() - Math.log1p(0.5)) < 1e-12,
      `session236: LNP1 Rational(1,2) → Real(log1p(0.5)) (Q→R degradation; got ${v?.value?.toNumber()})`);
  }

  // toRealOrThrow handles isRational; expm1(0.5) is the expected value.
  {
    const v = runOp('EXPM', Rational(1n, 2n));
    assert(isReal(v) && Math.abs(v.value.toNumber() - Math.expm1(0.5)) < 1e-12,
      `session236: EXPM Rational(1,2) → Real(expm1(0.5)) (Q→R degradation; got ${v?.value?.toNumber()})`);
  }

  // _roundingOp checks `!isReal(xv) && !isInteger(xv)` → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Integer(1n));
    assertThrows(() => lookup('TRUNC').fn(s), /Bad argument type/i,
      `session236: Rational(3,2) Integer(1) TRUNC → 'Bad argument type' (_roundingOp rejects non-Real/non-Integer x)`);
  }

  // _zetaScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      `session236: ZETA Rational(1,2) → 'Bad argument type' (_zetaScalar has no isRational branch)`);
  }

  // _lambertScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      `session236: LAMBERT Rational(1,2) → 'Bad argument type' (_lambertScalar has no isRational branch)`);
  }

  // _psiScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      `session236: PSI Rational(1,2) → 'Bad argument type' (_psiScalar has no isRational branch)`);
  }
}

/* ================================================================
   Session 240 — Q-cell audit: stat-dist + combinatorial families.

   Inspected each scalar handler and pinned ✓/✗ for Rational input:

   Stat-dist (all Q=✗):
     GAMMA/LNGAMMA: `x = isInteger ? … : isReal ? … : null; if null throw`
     ERF/ERFC:      same pattern in _erfScalar / _erfcScalar
     BETA:          aNum/bNum = isInteger ? … : isReal ? … : null
     UTPC/UTPF/UTPT: local `asReal` only accepts Integer and Real
     HEAVISIDE/DIRAC: explicit isReal/isInteger/isBinaryInteger/isSym branches only

   Combinatorial (Q=✗ except XROOT):
     COMB/PERM:      _combPermArgs guard: `!isInteger && !isReal → throw`
     IQUOT/IREMAINDER: _intQuotientArg: only Integer/Real
     XROOT:          degree x uses `toRealOrThrow` (accepts Rational, Q→R);
                     radicand y goes through `^` which accepts Rational.
                     Both sides Q=✓ (Q→R degradation to Real).

   15 new assertions (5525 → 5540).
   ================================================================ */
{
  // _gammaScalar: `x = isInteger ? … : isReal ? … : null` → Rational → null → throw.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      `session240: GAMMA Rational(1,2) → 'Bad argument type' (_gammaScalar has no isRational branch)`);
  }

  // _lngammaScalar: same isInteger/isReal/null pattern.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      `session240: LNGAMMA Rational(1,2) → 'Bad argument type' (_lngammaScalar has no isRational branch)`);
  }

  // _erfScalar: `x = isInteger ? … : isReal ? … : null` → Rational → null → throw.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      `session240: erf Rational(1,2) → 'Bad argument type' (_erfScalar has no isRational branch)`);
  }

  // _erfcScalar: same isInteger/isReal/null pattern.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      `session240: erfc Rational(1,2) → 'Bad argument type' (_erfcScalar has no isRational branch)`);
  }

  // _betaScalar: aNum = isInteger ? … : isReal ? … : null; if null → throw.
  // Rational on level 2 (a-arg) is rejected before bNum is even evaluated.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));  // a (level 2)
    s.push(Integer(1n));       // b (level 1)
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session240: Beta Rational(1,2) Integer(1) → 'Bad argument type' (_betaScalar has no isRational branch)`);
  }

  // local asReal: only Integer and Real → throw for Rational.
  // Testing Rational on the ν (degree-of-freedom) arg.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // ν — Rational (level 2)
    s.push(Real(1));           // x (level 1)
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session240: UTPC Rational(3,2) Real(1) → 'Bad argument type' (asReal has no isRational branch)`);
  }

  // Same asReal helper used for all three args (n, d, F); Rational on n triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // n — Rational (level 3)
    s.push(Integer(2n));       // d (level 2)
    s.push(Real(1));           // F (level 1)
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session240: UTPF Rational(3,2) Integer(2) Real(1) → 'Bad argument type' (asReal rejects Rational on n)`);
  }

  // Same asReal helper; Rational on ν triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // ν — Rational (level 2)
    s.push(Real(1));           // t (level 1)
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session240: UTPT Rational(3,2) Real(1) → 'Bad argument type' (asReal rejects Rational on ν)`);
  }

  // Handler checks isReal / isInteger / isBinaryInteger / _isSymOperand only — no isRational branch.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      `session240: HEAVISIDE Rational(1,2) → 'Bad argument type' (no isRational branch in scalar handler)`);
  }

  // Same handler structure as HEAVISIDE — no isRational branch.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      `session240: DIRAC Rational(1,2) → 'Bad argument type' (no isRational branch in scalar handler)`);
  }

  // _combPermArgs guard: `!isInteger(a) && !isReal(a) → throw 'Bad argument type'`.
  // Rational on level 2 (n-arg) triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(5n, 1n));  // n — Rational (integer-valued but still Q-typed)
    s.push(Integer(2n));       // m
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      `session240: COMB Rational(5,1) Integer(2) → 'Bad argument type' (_combPermArgs rejects Rational even when integer-valued)`);
  }

  // Same _combPermArgs guard as COMB.
  {
    const s = new Stack();
    s.push(Rational(5n, 1n));  // n — Rational
    s.push(Integer(2n));       // m
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      `session240: PERM Rational(5,1) Integer(2) → 'Bad argument type' (_combPermArgs rejects Rational even when integer-valued)`);
  }

  // _intQuotientArg: only isInteger and isReal branches → Rational → throw.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));  // a (level 2)
    s.push(Integer(2n));       // b (level 1)
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      `session240: IQUOT Rational(7,2) Integer(2) → 'Bad argument type' (_intQuotientArg has no isRational branch)`);
  }

  // Same _intQuotientArg guard as IQUOT.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));  // a (level 2)
    s.push(Integer(2n));       // b (level 1)
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      `session240: IREMAINDER Rational(7,2) Integer(2) → 'Bad argument type' (_intQuotientArg has no isRational branch)`);
  }

  // Degree x uses `toRealOrThrow` which accepts Rational (Number(n)/Number(d)).
  // Radicand y goes through '^' which accepts Rational.
  // Both sides Q→R via toRealOrThrow / ^ dispatch; result is always Real.
  // (1) degree=Rational(3,1): XROOT(Integer(8), Rational(3,1)) = 8^(1/3) = Real(2).
  {
    const s = new Stack();
    s.push(Integer(8n));        // y (radicand, level 2)
    s.push(Rational(3n, 1n));   // x (degree, level 1) — Rational accepted via toRealOrThrow
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 2) < 1e-12,
      `session240: XROOT Integer(8) Rational(3,1) → Real(2) (degree Q→R via toRealOrThrow; got ${v.value})`);
  }
  // (2) radicand=Rational(1,4), degree=Integer(2): XROOT(Rational(1,4), Integer(2)) = (1/4)^(1/2) = 0.5.
  {
    const s = new Stack();
    s.push(Rational(1n, 4n));   // y (radicand, level 2) — Rational accepted via ^
    s.push(Integer(2n));        // x (degree, level 1)
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session240: XROOT Rational(1,4) Integer(2) → 1/2, exact for an exact root (got ${v.type})`);
  }
}

/* ================================================================
   Session 244 — Z-cell doc-lag audit: ERF / ERFC / UTPC / UTPF /
   UTPT + BETA L/V/M + UTPC/UTPF/UTPT L/V/M rejection pins.

   Background: sessions 200/204/208 added List/Vector/Matrix pins for
   erf/erfc using Integer(0) as the operand — but these were always
   routed through the wrappers (_withListUnary / bespoke V/M).  The
   bare-scalar Z column for erf and erfc was never independently
   pinned.  The scalar handlers (_erfScalar / _erfcScalar) both
   contain `const x = isInteger(v) ? Number(v.value) : ...`, so
   Integer is accepted at the scalar level — a documentation lag.

   Similarly, UTPC / UTPF / UTPT share a local `asReal` helper
   (`if (isInteger(v)) return Number(v.value)`) but no Z-axis pin
   existed, despite the handler accepting Integer on every argument.

   BETA has a `_withListBinary` wrapper (registered as
   `_withTaggedBinary(_withListBinary(handler))`), so bare-List
   distribution should work — L=· is a documentation lag.  V and M
   have no `_withVMBinary` wrapper; `_betaScalar` rejects Vector /
   Matrix with 'Bad argument type'.

   UTPC / UTPF / UTPT are registered as bare handlers (no list /
   vector / matrix wrappers), so List / Vector / Matrix inputs reach
   `asReal`, which rejects them.
   ================================================================ */
{
  // erf(Integer(0)) = 0 (zero special-case, exact Real).
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('erf').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 0,
      `session244: erf Integer(0) → Real(0) (Z bare scalar; zero special-case; got ${v.value})`);
  }
  // erf(Integer(1)) → Real(erf(1)) ≈ 0.8427.  Pins the non-zero Integer path.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('erf').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.8427007929497154) < 1e-12,
      `session244: erf Integer(1) → Real(erf(1)) (Z bare scalar; non-zero integer path; got ${v.value})`);
  }

  // erfc(Integer(0)) = 1 (zero special-case, exact Real).
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('erfc').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 1,
      `session244: erfc Integer(0) → Real(1) (Z bare scalar; zero special-case; got ${v.value})`);
  }
  // erfc(Integer(2)) → Real(erfc(2)) ≈ 0.00468.  Pins the positive-x Integer path
  // (routes through _regGammaQ(0.5, 4), distinct from the x=0 shortcut).
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('erfc').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.004677734981047287) < 1e-12,
      `session244: erfc Integer(2) → Real(erfc(2)) (Z bare scalar; positive-x integer path; got ${v.value})`);
  }

  // UTPC(Integer(3), Integer(0)) — X≤0 branch returns Real(1) exactly.
  // Push order: ν (level 2) then x (level 1).
  {
    const s = new Stack();
    s.push(Integer(3n));   // ν — degrees of freedom
    s.push(Integer(0n));   // x — X≤0 short-circuit → tail = 1
    lookup('UTPC').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 1,
      `session244: UTPC Integer(3) Integer(0) → Real(1) (Z×Z; X≤0 short-circuit; got ${v.value})`);
  }
  // UTPC(Integer(2), Integer(2)) — for df=2, UTPC = exp(−x/2) = exp(−1) ≈ 0.3679.
  {
    const s = new Stack();
    s.push(Integer(2n));   // ν = 2
    s.push(Integer(2n));   // x = 2
    lookup('UTPC').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - Math.exp(-1)) < 1e-10,
      `session244: UTPC Integer(2) Integer(2) → Real(exp(-1)) (Z×Z; df=2 tail; tol 1e-10; got ${v.value})`);
  }

  // UTPF(n=Integer(2), d=Integer(2), F=Integer(1)).
  // Push order: n (level 3), d (level 2), F (level 1).
  // w = d/(d+n·F) = 2/(2+2·1) = 0.5; I_{0.5}(1, 1) = 0.5 — clean half-integer.
  {
    const s = new Stack();
    s.push(Integer(2n));   // n
    s.push(Integer(2n));   // d
    s.push(Integer(1n));   // F
    lookup('UTPF').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session244: UTPF Integer(2) Integer(2) Integer(1) → Real(0.5) (Z×Z×Z; I_0.5(1,1)=0.5; got ${v.value})`);
  }

  // UTPT(ν=Integer(5), t=Integer(0)) — t=0 exact branch returns Real(0.5).
  // Push order: ν (level 2), t (level 1).
  {
    const s = new Stack();
    s.push(Integer(5n));   // ν
    s.push(Integer(0n));   // t = 0 → exact short-circuit → 0.5
    lookup('UTPT').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 0.5,
      `session244: UTPT Integer(5) Integer(0) → Real(0.5) (Z×Z; t=0 exact branch; got ${v.value})`);
  }

  // { Integer(1) Integer(2) } { Integer(1) Integer(3) } Beta
  //   → { Real(B(1,1)) Real(B(2,3)) }
  //   = { Real(≈1.0)   Real(≈0.0833) }
  // B(1,1) = Γ(1)Γ(1)/Γ(2) = 1.  B(2,3) = Γ(2)Γ(3)/Γ(5) = 1·2/24 = 1/12.
  // Push order: left operand (level 2 = "a" arg), right operand (level 1 = "b" arg).
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(2n)]));   // a-list (level 2)
    s.push(RList([Integer(1n), Integer(3n)]));   // b-list (level 1)
    lookup('Beta').fn(s);
    const result = s.peek();
    assert(isList(result) && result.items.length === 2,
      `session244: Beta({Z(1),Z(2)},{Z(1),Z(3)}) → List of 2 (L×L pairwise; got ${result?.type})`);
    const b11 = result.items[0].value.toNumber();
    const b23 = result.items[1].value.toNumber();
    assert(Math.abs(b11 - 1) < 1e-12,
      `session244: Beta({Z(1),...},{Z(1),...})[0] = B(1,1) ≈ 1 (got ${b11})`);
    assert(Math.abs(b23 - 1 / 12) < 1e-12,
      `session244: Beta({...,Z(2)},{...,Z(3)})[1] = B(2,3) = 1/12 (got ${b23})`);
  }

  // Vector input: _betaScalar receives Vector as the 'a' arg — isInteger/isReal both
  // false → aNum = null → throws 'Bad argument type'.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(1)]));
    s.push(Integer(1n));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session244: Beta(Vector, Integer) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }
  // Matrix input: same rejection path.
  {
    const s = new Stack();
    s.push(Matrix([[Real(2)]]));
    s.push(Integer(1n));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session244: Beta(Matrix, Integer) → 'Bad argument type' (no _withVMBinary; M=✗)`);
  }

  // session323: b-arg (right-side) V/M rejection — the analogous unpinned cell.
  // session244 pinned only V/M in the a-arg slot.  _withListBinary distributes
  // Lists only, so a Vector/Matrix in the b slot falls through to _betaScalar:
  // aNum resolves fine, bNum = null → throws 'Bad argument type'.
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Vector([Real(2), Real(1)]));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session323: Beta(Integer, Vector) → 'Bad argument type' (b-arg V; no _withVMBinary)`);
  }
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Matrix([[Real(2)]]));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session323: Beta(Integer, Matrix) → 'Bad argument type' (b-arg M; no _withVMBinary)`);
  }
  // Real a-arg variant: confirms the bNum=null path fires regardless of a's kind.
  {
    const s = new Stack();
    s.push(Real(2.5));
    s.push(Vector([Real(2)]));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session323: Beta(Real, Vector) → 'Bad argument type' (b-arg V; a=Real)`);
  }
  {
    const s = new Stack();
    s.push(Real(2.5));
    s.push(Matrix([[Real(2)]]));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session323: Beta(Real, Matrix) → 'Bad argument type' (b-arg M; a=Real)`);
  }

  // n=0 empty-list passthrough.
  {
    const s = new Stack();
    s.push(RList([]));
    s.push(RList([]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 0,
      `session248: UTPC {} {} → {} (n=0 empty-list passthrough; got ${JSON.stringify(v)})`);
  }
  // n=1 bare-list: X≤0 short-circuit → Real(1).
  {
    const s = new Stack();
    s.push(RList([Integer(2n)]));
    s.push(RList([Integer(0n)]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           v.items[0].type === 'real' && Number(v.items[0].value) === 1,
      `session248: UTPC {Integer(2)} {Integer(0)} → {Real(1)} (n=1 bare-list; X≤0 branch; got ${JSON.stringify(v)})`);
  }
  // n=2 pairwise bare-list: {nu=2,nu=5} {x=0,x=2} → {Real(1), Real(UTPC(5,2))}.
  // UTPC(2,0)=1 (X≤0); UTPC(5,2)=_regGammaQ(2.5,1)≈0.8491 (tol 1e-6).
  {
    const s = new Stack();
    s.push(RList([Integer(2n), Integer(5n)]));
    s.push(RList([Integer(0n), Integer(2n)]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 2 &&
           Number(v.items[0].value) === 1 &&
           Math.abs(Number(v.items[1].value) - 0.8491450360846099) < 1e-6,
      `session248: UTPC {Z(2) Z(5)} {Z(0) Z(2)} → {R(1) R(≈0.849)} (n=2 pairwise; got ${JSON.stringify(v)})`);
  }
  // Tagged-of-List (binary tag-drop: both unwrapped, tag NOT re-applied).
  {
    const s = new Stack();
    s.push(Tagged('nu', RList([Integer(2n)])));
    s.push(Tagged('x', RList([Integer(0n)])));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 1,
      `session248: UTPC :nu:{Z(2)} :x:{Z(0)} → {R(1)} (T+L; tag dropped; got ${JSON.stringify(v)})`);
  }
  // Scalar Tagged (both Tagged, result untagged — binary tag-drop convention).
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(2n)));
    s.push(Tagged('x', Integer(0n)));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'real' && Number(v.value) === 1,
      `session248: UTPC :n:Z(2) :x:Z(0) → R(1) (Tagged scalar; tag dropped; got ${JSON.stringify(v)})`);
  }
  // V=✗ — _withVMBinary not applied; Vector reaches _utpcScalar as the x arg → Bad argument type.
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session248: UTPC Integer(2) Vector([Real(1)]) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }

  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(2n));
    s.push(RList([Real(1)]));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session244: UTPF Integer(2) Integer(2) List({Real(1)}) → 'Bad argument type' (3-arg bare handler; L=✗)`);
  }
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(2n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session244: UTPF Integer(2) Integer(2) Vector([Real(1)]) → 'Bad argument type' (3-arg bare handler; V=✗)`);
  }

  // n=0 empty-list passthrough.
  {
    const s = new Stack();
    s.push(RList([]));
    s.push(RList([]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 0,
      `session248: UTPT {} {} → {} (n=0 empty-list passthrough; got ${JSON.stringify(v)})`);
  }
  // n=1 bare-list: t=0 short-circuit → Real(0.5).
  {
    const s = new Stack();
    s.push(RList([Integer(5n)]));
    s.push(RList([Integer(0n)]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 0.5,
      `session248: UTPT {Z(5)} {Z(0)} → {R(0.5)} (n=1 bare-list; t=0 exact branch; got ${JSON.stringify(v)})`);
  }
  // n=2 pairwise bare-list: both t=0 → both Real(0.5).
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Integer(10n)]));
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 2 &&
           Number(v.items[0].value) === 0.5 &&
           Number(v.items[1].value) === 0.5,
      `session248: UTPT {Z(5) Z(10)} {Z(0) Z(0)} → {R(0.5) R(0.5)} (n=2 pairwise; t=0 exact; got ${JSON.stringify(v)})`);
  }
  // Tagged-of-List (binary tag-drop).
  {
    const s = new Stack();
    s.push(Tagged('nu', RList([Integer(5n)])));
    s.push(Tagged('t', RList([Integer(0n)])));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 0.5,
      `session248: UTPT :nu:{Z(5)} :t:{Z(0)} → {R(0.5)} (T+L; tag dropped; got ${JSON.stringify(v)})`);
  }
  // Scalar Tagged (both Tagged, result untagged).
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('t', Integer(0n)));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'real' && Number(v.value) === 0.5,
      `session248: UTPT :n:Z(5) :t:Z(0) → R(0.5) (Tagged scalar; tag dropped; got ${JSON.stringify(v)})`);
  }
  // V=✗ — Vector reaches _utptScalar as the t arg → Bad argument type.
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session248: UTPT Integer(3) Vector([Real(1)]) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }
}

// ── session316: UTPC/UTPT — M=✗ and ν-position V/M rejection pins ───────────
// session248 pinned only Vector in the x/t (variate) slot for UTPC/UTPT, but
// both ops document M=✗ and the ν (first-operand) collection cells too.
// `_withListBinary` distributes Lists only, so a Vector/Matrix in EITHER slot
// reaches the scalar dispatcher's `asReal` (isInteger/isReal only) → Bad
// argument type — mirroring session310's UTPF variate+ν sweep. No source
// change; guards a refactor that adds `_withVMBinary` or widens `asReal`.
{
  // UTPC — Matrix in the x slot.
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Matrix([[Real(1), Real(2)]]));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session316: UTPC Integer(2) Matrix([[Real(1) Real(2)]]) → 'Bad argument type' (no _withVMBinary; M=✗)`);
  }
  // UTPC — Vector in the ν slot.
  {
    const s = new Stack();
    s.push(Vector([Real(1)]));
    s.push(Integer(2n));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session316: UTPC Vector([Real(1)]) Integer(2) → 'Bad argument type' (ν-position; V=✗)`);
  }
  // UTPC — Matrix in the ν slot.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)]]));
    s.push(Integer(2n));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session316: UTPC Matrix([[Real(1) Real(2)]]) Integer(2) → 'Bad argument type' (ν-position; M=✗)`);
  }
  // UTPT — Matrix in the t slot.
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Matrix([[Real(1), Real(2)]]));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session316: UTPT Integer(3) Matrix([[Real(1) Real(2)]]) → 'Bad argument type' (no _withVMBinary; M=✗)`);
  }
  // UTPT — Vector in the ν slot.
  {
    const s = new Stack();
    s.push(Vector([Real(1)]));
    s.push(Integer(0n));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session316: UTPT Vector([Real(1)]) Integer(0) → 'Bad argument type' (ν-position; V=✗)`);
  }
  // UTPT — Matrix in the ν slot.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)]]));
    s.push(Integer(0n));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session316: UTPT Matrix([[Real(1) Real(2)]]) Integer(0) → 'Bad argument type' (ν-position; M=✗)`);
  }
}

// ── session253: Ordered comparators < > ≤ ≥ — L/V/M/T/U rejection pins ──────
// comparePair() accepts: BinaryInteger (promoted), Symbolic-lift, String lex,
// and isNumber (Real/Integer/Rational/Complex).  Everything else — List, Vector,
// Matrix, Tagged, Unit — falls through to `!isNumber` throw.  All 20 cells
// (4 ops × 5 types) all verified ✗ — each rejects with Bad argument type.
{
  const ops = ['<', '>', '≤', '≥'];
  // L=✗ — List is not isNumber; both operands must be scalar numeric.
  for (const op of ops) {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    s.push(RList([Real(3), Real(4)]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: {R(1) R(2)} {R(3) R(4)} ${op} → 'Bad argument type' (L=✗; comparePair is scalar-only)`);
  }
  // V=✗ — Vector is not isNumber.
  for (const op of ops) {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4)]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: V[R(1),R(2)] V[R(3),R(4)] ${op} → 'Bad argument type' (V=✗; comparePair is scalar-only)`);
  }
  // M=✗ — Matrix is not isNumber.
  for (const op of ops) {
    const s = new Stack();
    s.push(Matrix([[Real(1)]]));
    s.push(Matrix([[Real(2)]]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: M[[R(1)]] M[[R(2)]] ${op} → 'Bad argument type' (M=✗; comparePair is scalar-only)`);
  }
  // T=✗ — Tagged is not isNumber and not a sym-operand; tag is NOT transparently unwrapped
  // on the ordered-compare surface (contrast with the unary T-transparency pattern).
  for (const op of ops) {
    const s = new Stack();
    s.push(Tagged('x', Real(1)));
    s.push(Real(2));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: :x:R(1) R(2) ${op} → 'Bad argument type' (T=✗; Tagged not unwrapped by comparePair)`);
  }
  // U — a Unit orders against another Unit, converted to common units (AUR).
  for (const [op, expected] of [['<', 1], ['>', 0], ['≤', 1], ['≥', 0]]) {
    const s = new Stack();
    s.push(Unit(1, [['m', 1]]));
    s.push(Unit(2, [['m', 1]]));
    lookup(op).fn(s);
    assert(s.peek().value.eq(expected), `session253: 1_m 2_m ${op} → ${expected} (a Unit compares with a Unit)`);
  }
}

// ── session256: Ordered comparators < > ≤ ≥ — cross-type asymmetric rejection pins ──────────
// session253 covered homogeneous bad-type pairs (L×L, V×V, M×M, T×T, U×U).
// These 8 pins cover the asymmetric case where exactly one operand is a valid numeric scalar
// and the other is a non-number, confirming the `!isNumber(a) || !isNumber(b)` OR-guard fires
// regardless of which operand is bad and regardless of stack position.
{
  // R(level-2) × L(level-1): scalar on top-of-effective-input, List below.
  const s = new Stack();
  s.push(Real(3));
  s.push(RList([Real(1)]));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: R(3) {R(1)} < → Bad argument type (R×L cross-type; L on level-1 fires OR-guard)');
}
{
  // L(level-2) × R(level-1): List on level-2, scalar on level-1 — guards that OR not AND logic
  // means the List side fires even when the other operand is a valid Real.
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Real(3));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: {R(1)} R(3) < → Bad argument type (L×R cross-type; L on level-2 fires OR-guard)');
}
{
  // R × V: Real level-2, Vector level-1.  Different op (>) to spread coverage across all four.
  const s = new Stack();
  s.push(Real(3));
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => lookup('>').fn(s), /Bad argument type/i,
    'session256: R(3) V[R(1),R(2)] > → Bad argument type (R×V cross-type asymmetric rejection)');
}
{
  // R × M: Real level-2, Matrix level-1.
  const s = new Stack();
  s.push(Real(3));
  s.push(Matrix([[Real(1)]]));
  assertThrows(() => lookup('>').fn(s), /Bad argument type/i,
    'session256: R(3) M[[R(1)]] > → Bad argument type (R×M cross-type asymmetric rejection)');
}
{
  // R × T: Real level-2, Tagged level-1.  Confirms Tagged NOT transparently unwrapped even in
  // the asymmetric position (the level-2 Real cannot "see through" the Tagged on level-1).
  const s = new Stack();
  s.push(Real(3));
  s.push(Tagged('x', Real(1)));
  assertThrows(() => lookup('≤').fn(s), /Bad argument type/i,
    'session256: R(3) :x:R(1) ≤ → Bad argument type (R×T cross-type; T not unwrapped on level-1)');
}
{
  // Z × U: Integer level-2, Unit level-1.  Guards that the BinInt→Integer promotion step
  // that runs before the isNumber guard does not accidentally accept Unit as a numeric.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Unit(1, [['m', 1]]));
  assertThrows(() => lookup('≥').fn(s), /Bad argument type/i,
    'session256: Integer(1) 1_m ≥ → Bad argument type (Z×U cross-type; Unit not numeric)');
}
{
  // R × S: Real level-2, String level-1.  The String compare arm requires BOTH operands to be
  // String; a Real+String mix bypasses that arm and hits the !isNumber guard (String is not
  // isNumber), so this throws rather than lex-comparing.
  const s = new Stack();
  s.push(Real(5));
  s.push(Str('hello'));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: R(5) "hello" < → Bad argument type (R×S; String arm requires both-String)');
}
{
  // S × R: String level-2, Real level-1.  Symmetric to the R×S case above — confirms the
  // guard fires in both level orientations for mixed String+numeric.
  const s = new Stack();
  s.push(Str('hello'));
  s.push(Real(5));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: "hello" R(5) < → Bad argument type (S×R; String arm requires both-String)');
}


/* ================================================================
   BinaryInteger (B column) rejection pins
   ---------------------------------------------------------------
   All unary and binary scalar ops that dispatch through handlers
   requiring `isReal`, `isInteger`, `isRational`, or `isComplex`
   reject BinaryInteger with Bad argument type.  BinaryInteger is
   accepted on the binary arithmetic surface (add/sub/mul/div via
   the BinInt fast path) and by the rounding family
   (FLOOR/CEIL/IP/FP — B=✓ separately pinned), but NOT by the
   general numeric-math surface.

   22 ops all return `Bad argument type`:
     INV / SQ / SQRT / ABS / SIN..ATANH (group) /
     FACT / LN..ALOG (group) / LNP1 / EXPM /
     SIGN / ARG /
     MOD / MIN / MAX / GCD / LCM / % / %T / %CH /
     CONJ / RE / IM
   ================================================================ */
{

  // INV
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('INV').fn(s), /Bad argument type/i,
      'session258: INV BinaryInteger → Bad argument type (B=✗; no isB branch in _invScalar)');
  }
  // SQ
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SQ').fn(s), /Bad argument type/i,
      'session258: SQ BinaryInteger → Bad argument type (B=✗; _sqScalar requires numeric scalar)');
  }
  // SQRT
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SQRT').fn(s), /Bad argument type/i,
      'session258: SQRT BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // ABS
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('ABS').fn(s), /Bad argument type/i,
      'session258: ABS BinaryInteger → Bad argument type (B=✗; _absScalar isReal/isInteger/isRational/isComplex only)');
  }
  // SIN — representative for the grouped SIN..ACOSH..ATANH row
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SIN').fn(s), /Bad argument type/i,
      'session258: SIN BinaryInteger → Bad argument type (B=✗; _unaryCx→toRealOrThrow rejects BinInt; representative for trig/hyp group)');
  }
  // FACT
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('FACT').fn(s), /Bad argument type/i,
      'session258: FACT BinaryInteger → Bad argument type (B=✗; _factScalar isReal/isInteger only)');
  }
  // LN — representative for grouped LN / LOG / EXP / ALOG row
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('LN').fn(s), /Bad argument type/i,
      'session258: LN BinaryInteger → Bad argument type (B=✗; _unaryCx→toRealOrThrow rejects BinInt; representative for LN/LOG/EXP/ALOG group)');
  }
  // LNP1
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('LNP1').fn(s), /Bad argument type/i,
      'session258: LNP1 BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // EXPM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('EXPM').fn(s), /Bad argument type/i,
      'session258: EXPM BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // SIGN
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SIGN').fn(s), /Bad argument type/i,
      'session258: SIGN BinaryInteger → Bad argument type (B=✗; _signScalar isReal/isInteger/isRational/isComplex only)');
  }
  // ARG
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      'session258: ARG BinaryInteger → Bad argument type (B=✗; _argScalar isReal/isInteger only)');
  }
  // CONJ
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session258: CONJ BinaryInteger → Bad argument type (B=✗; _conjScalar isReal/isInteger/isRational/isComplex/isName/isSym only)');
  }
  // RE
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
      'session258: RE BinaryInteger → Bad argument type (B=✗; _reScalar same dispatch as _conjScalar)');
  }
  // IM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session258: IM BinaryInteger → Bad argument type (B=✗; _imScalar same dispatch; Integer(0) branch not reached for BinInt)');
  }

  // --- Binary math ops — BinaryInteger rejected on both sides -

  // MOD
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MOD').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MOD → Bad argument type (B=✗; toRealOrThrow rejects BinInt in _modScalar)');
  }
  // MIN
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MIN').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MIN → Bad argument type (B=✗; _minMaxScalar requires isNumber)');
  }
  // MAX
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MAX').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MAX → Bad argument type (B=✗; _minMaxScalar requires isNumber)');
  }
  // GCD
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) GCD → Bad argument type (B=✗; _toBigIntOrThrow no isBinaryInteger branch)');
  }
  // LCM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) LCM → Bad argument type (B=✗; same _toBigIntOrThrow guard as GCD)');
  }
  // %
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) % → Bad argument type (B=✗; toRealOrThrow rejects BinInt in percent handler)');
  }
  // %T
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%T').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) %T → Bad argument type (B=✗; same toRealOrThrow path as %)');
  }
  // %CH
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%CH').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) %CH → Bad argument type (B=✗; same toRealOrThrow path as %)');
  }
}

/* ================================================================
   Session 263 — Unit (U column) rejection-pin pass
   19 new rejection pins across the unary numeric-math surface,
   CONJ/RE/IM, and the binary scalar surface.
   No source changes — all rejections were already correct behavior,
   just untested.  Unit values need a normalised uexpr array
   (the [sym, exp] form from parseUnitExpr); plain-string uexpr
   would crash inside inverseUexpr/powerUexpr before reaching the
   type guard, so all pins use Unit(1, [['m', 1]]).
   ================================================================ */
{
  const U1 = Unit(1, [['m', 1]]);   // 1_m  (level 2 / unary arg)
  const U2 = Unit(2, [['m', 1]]);   // 2_m  (level 1 / second binary arg)

  // ── Cluster 1: Unary numeric-math surface (U=✗) ───────────────
  // SQRT — toRealOrThrow rejects Unit (no isUnit branch in _sqrtScalar)
  {
    const s = new Stack(); s.push(U1);
    lookup('SQRT').fn(s);
    assert(s.peek().value === 1 && s.peek().uexpr[0][0] === 'm' && s.peek().uexpr[0][1] === 0.5,
      'session263: 1_m SQRT → 1_m^.5 (AUR: the root of a unit halves its exponents)');
  }
  // SIN — representative for trig/hyp group (_unaryCx → toRealOrThrow)
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('SIN').fn(s), /Bad argument type/i,
      'session263: 1_m SIN → Bad argument type (U=✗; _unaryCx → toRealOrThrow rejects Unit; applies to entire trig/hyp group)');
  }
  // FACT — _factScalar isReal/isInteger only
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('FACT').fn(s), /Bad argument type/i,
      'session263: 1_m FACT → Bad argument type (U=✗; _factScalar isReal/isInteger only)');
  }
  // LN — representative for LN/LOG/EXP/ALOG group (_unaryCx → toRealOrThrow)
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('LN').fn(s), /Bad argument type/i,
      'session263: 1_m LN → Bad argument type (U=✗; _unaryCx → toRealOrThrow rejects Unit; applies to LN/LOG/EXP/ALOG group)');
  }
  // LNP1 — toRealOrThrow rejects Unit
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('LNP1').fn(s), /Bad argument type/i,
      'session263: 1_m LNP1 → Bad argument type (U=✗; toRealOrThrow rejects Unit in LNP1 handler)');
  }
  // EXPM — toRealOrThrow rejects Unit
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('EXPM').fn(s), /Bad argument type/i,
      'session263: 1_m EXPM → Bad argument type (U=✗; toRealOrThrow rejects Unit in EXPM handler)');
  }
  // SIGN — _signScalar isReal/isInteger/isRational/isComplex only; no isUnit branch
  {
    const s = new Stack(); s.push(U1);
    lookup('SIGN').fn(s);
    assert(s.peek().value.eq(1), 'session263: 1_m SIGN → 1 (AUR: the sign of the number of a unit)');
  }
  // ARG — _argScalar isReal/isInteger only; no isUnit branch
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      'session263: 1_m ARG → Bad argument type (U=✗; _argScalar isReal/isInteger only)');
  }

  // ── Cluster 2: CONJ / RE / IM (U=✗) ──────────────────────────
  // _conjScalar / _reScalar / _imScalar: isReal/isInteger/isRational/isComplex/isName/isSym
  // dispatch — no isUnit branch; Unit falls through to final throw.
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session263: 1_m CONJ → Bad argument type (U=✗; _conjScalar no isUnit branch)');
  }
  {
    const s = new Stack(); s.push(U1);
    lookup('RE').fn(s);
    assert(isReal(s.peek()) && s.peek().value.toNumber() === 1,
      'session263: 1_m RE → 1 (the AUR gives x_unit → x)');
  }
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session263: 1_m IM → Bad argument type (U=✗; _imScalar no isUnit branch)');
  }

  // ── Cluster 3: Binary scalar surface (U=✗) ────────────────────
  // All binary scalar ops reject Unit on either operand position.
  // Using U1 (level 2) and U2 (level 1) for consistency.
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('MOD').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m MOD → Bad argument type (U=✗; toRealOrThrow rejects Unit in _modScalar)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    lookup('MIN').fn(s);
    assert(s.peek() === U1, 'session263: 1_m 2_m MIN → 1_m (AUR: MIN and MAX take two units and return the one they pick)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    lookup('MAX').fn(s);
    assert(s.peek() === U2, 'session263: 1_m 2_m MAX → 2_m (same unit pick as MIN)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m GCD → Bad argument type (U=✗; _toBigIntOrThrow no isUnit branch)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m LCM → Bad argument type (U=✗; same _toBigIntOrThrow guard as GCD)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('%').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m % → Bad argument type (U=✗; toRealOrThrow rejects Unit in percent handler)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    lookup('%T').fn(s);
    assert(s.peek().value.eq(200), 'session263: 1_m 2_m %T → 200 (AUR: two units are converted, and the result is a plain number)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    lookup('%CH').fn(s);
    assert(s.peek().value.eq(100), 'session263: 1_m 2_m %CH → 100 (AUR: the change from 1 m to 2 m is 100%)');
  }
}

/* ================================================================
   Session 267 — C (Complex) and S (String) column rejection-pin pass,
   plus V/M rejection pins for the combinatorial family.
   26 matrix cells flipped ·→✗ across three table groups:
     (1) C column — Real-decomp family: ZETA / LAMBERT / PSI           (3 cells)
     (2) C column — Stat-dist family:   DIRAC / ERF / ERFC / BETA /
                                         UTPC / UTPF / UTPT             (7 cells)
     (3) C column — Combinatorial:      COMB / PERM / IQUOT /
                                         IREMAINDER / XROOT             (5 cells)
     (4) S column — Reference rows:     CONJ / RE / IM                  (3 cells)
     (5) V/M columns — Combinatorial:   COMB / PERM / IQUOT /
                                         IREMAINDER (V + M each)        (8 cells)
   No source changes — all rejections were already correct behavior,
   just untested.  Complex(1,2) is the representative Complex input;
   Str('x') the String input; Vector/Matrix with Real elements for V/M.
   ================================================================ */
{
  const C1 = Complex(1, 2);   // 1+2i — representative Complex input
  const C2 = Complex(2, 1);   // 2+i  — for binary ops
  const S1 = Str('x');        // String — representative String input
  const V1 = Vector([Real(1), Real(2)]);
  const V2 = Vector([Real(3), Real(4)]);
  const M1 = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ZETA → Bad argument type (C=✗; _zetaScalar isInteger/isReal only; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) LAMBERT → Bad argument type (C=✗; _lambertScalar isInteger/isReal only; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) PSI → Bad argument type (C=✗; _psiScalar isInteger/isReal only; Complex → null → throw)');
  }

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) DIRAC → Bad argument type (C=✗; DIRAC scalar: isReal/isInteger/isBinaryInteger/isSym only; Complex falls through)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ERF → Bad argument type (C=✗; _erfScalar isInteger/isReal/null pattern; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ERFC → Bad argument type (C=✗; _erfcScalar isInteger/isReal/null pattern; Complex → null → throw)');
  }
  {
    // BETA is arity 2: level2=a, level1=b
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('BETA').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) BETA → Bad argument type (C=✗; _betaScalar aNum = isInteger?…:isReal?…:null; Complex a-arg → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) UTPC → Bad argument type (C=✗; asReal helper isInteger/isReal only; Complex nu-arg → throw)');
  }
  {
    // UTPF is arity 3: level3=v1, level2=v2, level1=x
    const s = new Stack(); s.push(C1); s.push(C2); s.push(C1);
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) Complex(1,2) UTPF → Bad argument type (C=✗; same asReal helper; Complex v1-arg → throw)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) UTPT → Bad argument type (C=✗; same asReal helper; Complex nu-arg → throw)');
  }

  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) COMB → Bad argument type (C=✗; _combPermArgs: !isInteger&&!isReal → throw; applies to PERM same guard)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) PERM → Bad argument type (C=✗; same _combPermArgs guard as COMB)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) IQUOT → Bad argument type (C=✗; _intQuotientArg: isInteger/isReal only; Complex → throw; applies to IREMAINDER same guard)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) IREMAINDER → Bad argument type (C=✗; same _intQuotientArg guard as IQUOT)');
  }
  {
    // XROOT: level2=radicand y, level1=degree x — both args Complex → Bad argument type on degree
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) XROOT → Bad argument type: expected real, got complex (C=✗; degree x goes through toRealOrThrow which explicitly rejects Complex)');
  }

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session267: Str("x") CONJ → Bad argument type (S=✗; _conjScalar isReal/isInteger/isRational/isComplex/isName/isSym dispatch; no isString branch)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
      'session267: Str("x") RE → Bad argument type (S=✗; _reScalar same dispatch structure; no isString branch)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session267: Str("x") IM → Bad argument type (S=✗; _imScalar same dispatch; no isString branch)');
  }

  // COMB: representative for all four ops (COMB/PERM/IQUOT/IREMAINDER)
  // All use _combPermArgs or _intQuotientArg — neither has isVector/isMatrix branch.
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] COMB → Bad argument type (V=✗; _combPermArgs !isInteger&&!isReal rejects Vector; representative for PERM/IQUOT/IREMAINDER same path)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: M[[1,2],[3,4]] M[[1,2],[3,4]] COMB → Bad argument type (M=✗; same _combPermArgs guard; representative for PERM/IQUOT/IREMAINDER same path)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] PERM → Bad argument type (V=✗; same _combPermArgs guard as COMB V pin)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: M PERM → Bad argument type (M=✗; same _combPermArgs guard as COMB M pin)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] IQUOT → Bad argument type (V=✗; _intQuotientArg rejects Vector; same for IREMAINDER)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: M IQUOT → Bad argument type (M=✗; same _intQuotientArg guard; same for IREMAINDER)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] IREMAINDER → Bad argument type (V=✗; same _intQuotientArg guard as IQUOT V pin)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: M IREMAINDER → Bad argument type (M=✗; same _intQuotientArg guard as IQUOT M pin)');
  }
}

/* ====================================================================
   session330: combinatorial family — b-slot (right-operand) V/M rejection
   ----------------------------------------------------------------
   session267 pinned V/M=✗ for COMB/PERM/IQUOT/IREMAINDER using
   both-operand Vector (V V) / Matrix (M M) inputs, which trip the
   FIRST-operand check: `_combPermArgs` rejects `a` at the `!isInteger(a)
   && !isReal(a)` arm (ops.js ~1827) and IQUOT/IREMAINDER reject `a` at
   `_intQuotientArg(a)` (ops.js ~1998/2012, evaluated before `b`).  The
   SECOND-operand arm — a valid Integer `a` with a Vector/Matrix `b` —
   was unguarded, the analogue of BETA's b-arg cell pinned session323.
   `_withListBinary` distributes Lists only, so a Vector/Matrix in the b
   slot falls through to the inner handler where the b-arm throws.
   No source change — guards a refactor that drops the second-operand
   type check or short-circuits before it.
   ================================================================ */
{
  const Ia = Integer(5n);     // valid left operand
  const V = Vector([Real(1), Real(2)]);
  const M = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);

  for (const op of ['COMB', 'PERM']) {
    {
      const s = new Stack(); s.push(Ia); s.push(V);
      assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
        `session330: Integer(5) Vector ${op} → Bad argument type (b-slot V=✗; _combPermArgs rejects b at !isInteger(b)&&!isReal(b))`);
    }
    {
      const s = new Stack(); s.push(Ia); s.push(M);
      assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
        `session330: Integer(5) Matrix ${op} → Bad argument type (b-slot M=✗; same _combPermArgs b-arm)`);
    }
  }
  for (const op of ['IQUOT', 'IREMAINDER']) {
    {
      const s = new Stack(); s.push(Ia); s.push(V);
      assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
        `session330: Integer(5) Vector ${op} → Bad argument type (b-slot V=✗; _intQuotientArg(b) rejects Vector)`);
    }
    {
      const s = new Stack(); s.push(Ia); s.push(M);
      assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
        `session330: Integer(5) Matrix ${op} → Bad argument type (b-slot M=✗; same _intQuotientArg(b) arm)`);
    }
  }
}

/* ====================================================================
   session268: C-column rejection pins — GAMMA / LNGAMMA / HEAVISIDE
   ----------------------------------------------------------------
   Closes the three stat-dist family ops session 267 skipped when it
   pinned C=✗ on DIRAC/ERF/ERFC/BETA/UTPC/UTPF/UTPT.  All three reject
   Complex, but the cells carried ✗ with no documenting note or pin.
     • _gammaScalar / _lngammaScalar: `x = isInteger?…:isReal?…:null`;
       Complex → null → throw 'Bad argument type'.
     • HEAVISIDE scalar: isReal/isInteger/isBinaryInteger/isSym only;
       Complex falls through to the final throw.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const C1 = Complex(1, 2);   // 1+2i — representative Complex input

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) GAMMA → Bad argument type (C=✗; _gammaScalar x = isInteger?…:isReal?…:null; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) LNGAMMA → Bad argument type (C=✗; _lngammaScalar same isInteger/isReal/null pattern; Complex → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) HEAVISIDE → Bad argument type (C=✗; scalar arm isReal/isInteger/isBinaryInteger/isSym only; Complex falls through)');
  }
}

/* ====================================================================
   session269: S-column (String) rejection pins — combinatorial /
   integer-divmod family (COMB / PERM / IQUOT / IREMAINDER / XROOT)
   ----------------------------------------------------------------
   Adds the S column to the combinatorial-family matrix table (it had
   R/Z/Q/C/N/Sy/L/V/M/T only — no S column), continuing session 267's
   S-column work on CONJ/RE/IM.  All five reject String:
     • COMB / PERM:        `_combPermArgs` — `!isInteger(a) && !isReal(a) → throw`.
     • IQUOT / IREMAINDER: `_intQuotientArg` — isInteger/isReal only.
     • XROOT:              degree x via `toRealOrThrow` → 'expected real, got string'.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") COMB → Bad argument type (S=✗; _combPermArgs !isInteger&&!isReal → throw; PERM shares guard)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") PERM → Bad argument type (S=✗; same _combPermArgs guard as COMB)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") IQUOT → Bad argument type (S=✗; _intQuotientArg isInteger/isReal only; IREMAINDER shares guard)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") IREMAINDER → Bad argument type (S=✗; same _intQuotientArg guard as IQUOT)');
  }
  {
    // XROOT: level2=radicand y, level1=degree x — degree String rejects via toRealOrThrow
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") XROOT → Bad argument type: expected real, got string (S=✗; degree x via toRealOrThrow rejects String)');
  }
}

/* ====================================================================
   session304: XROOT V/M doc↔code drift — Vector/Matrix radicand reject
   ----------------------------------------------------------------
   The DATA_TYPES XROOT row carried V `✓` / M `✓`, but those cells went
   stale when session298 changed `^`'s V/M semantics.  XROOT(y, x) is
   pure plumbing — it pushes `1/x` and delegates to `^` — so the radicand
   y inherits whatever `^` does with a Vector/Matrix base:
     • Vector base → `^` rejects ('Bad argument type'; there is no vector
       power).  `_withListBinary` only distributes Lists, NOT Vectors, so
       a Vector y reaches the inner handler and hits `^`'s rejection.
       V = ✗.
     • Matrix base → `^` matrix-power, which requires a whole-number
       exponent.  The exponent is `1/x`, whole only at x = ±1 (and `^`
       rejects negative exponents for matrices), so any genuine root
       rejects: non-whole `1/x` → 'Bad argument value'; non-square M →
       'Invalid dimension'.  The lone non-error path is the degenerate
       x=1 identity (`M^1 = M`), which is `^`'s no-op, not a matrix root —
       so M = ✗.
   No source change — the behavior is already correct post-298; this
   pins it and the doc row is corrected to match.
   ================================================================ */
{
  // V = ✗ — Vector radicand → `^` rejects the vector base.
  {
    const s = new Stack();
    s.push(Vector([Real(8), Real(27)]));
    s.push(Integer(3n));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session304: V[8,27] 3 XROOT → Bad argument type (V=✗; radicand routes through `^`, which rejects a Vector base — no vector power)');
  }
  // M = ✗ — square Matrix radicand with non-whole 1/x → matrix-power rejects.
  {
    const s = new Stack();
    s.push(Matrix([[Real(8), Real(27)], [Real(1), Real(1)]]));
    s.push(Integer(3n));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument value/i,
      'session304: M[[8,27],[1,1]] 3 XROOT → Bad argument value (M=✗; 1/3 is not a whole-number exponent for `^`s matrix power)');
  }
  // M = ✗ — non-square Matrix radicand → matrix-power dimension reject.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)]]));
    s.push(Integer(1n));
    assertThrows(() => lookup('XROOT').fn(s), /Invalid dimension/i,
      'session304: M[[1,2,3]] 1 XROOT → Invalid dimension (M=✗; non-square has no matrix power)');
  }
  // Degenerate exception — square M with x=1 → `^`s M^1 no-op (NOT a matrix
  // root).  Documents the lone non-error path behind the M=✗ classification.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
    s.push(Integer(1n));
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(isMatrix(v) && v.rows[0][0].value.toString() === '1' &&
           v.rows[1][1].value.toString() === '4',
      `session304: M[[1,2],[3,4]] 1 XROOT → M^1 = the same matrix (degenerate x=1 identity, not a root; got ${v?.type})`);
  }
}

/* ====================================================================
   session371: XROOT degree-slot (level 1) V/M rejection — closes the
   symmetric-slot gap left by session304
   ----------------------------------------------------------------
   session304 pinned the RADICAND slot (level 2): a Vector/Matrix y
   routes through `^` and rejects there.  The DEGREE slot (level 1, the
   `x` in `y x XROOT`) is a DISTINCT code path — `x` is coerced via
   `toRealOrThrow` (`ops.js` ~1319: `new Decimal(isInteger(x) ? … :
   toRealOrThrow(x))`) BEFORE the `^` delegation, so a Vector/Matrix
   degree never reaches `^` — it trips `toRealOrThrow`'s 'expected real,
   got vector/matrix'.  This is the same slot where Complex (session267)
   and String (session269) already reject; V/M there were unpinned.  This
   completes XROOT's V/M rejection symmetry across both operand positions
   (the same sweep MOD/MIN/MAX, GCD/LCM, percent, TRUNC, COMB-family, and
   BETA-family received).  No source change — pins existing behavior.
   ================================================================ */
{
  // V = ✗ in the degree slot — Vector x → toRealOrThrow rejects before `^`.
  {
    const s = new Stack();
    s.push(Integer(8n));
    s.push(Vector([Real(2), Real(3)]));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session371: Integer(8) V[2,3] XROOT → Bad argument type: expected real, got vector (V=✗ in degree slot; toRealOrThrow rejects before the `^` delegation — distinct from session304s radicand path)');
  }
  // M = ✗ in the degree slot — Matrix x → toRealOrThrow rejects before `^`.
  {
    const s = new Stack();
    s.push(Integer(8n));
    s.push(Matrix([[Real(2), Real(3)], [Real(1), Real(1)]]));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session371: Integer(8) M[[2,3],[1,1]] XROOT → Bad argument type: expected real, got matrix (M=✗ in degree slot)');
  }
  // Real radicand + Vector degree — same degree-slot reject (radicand kind
  // is irrelevant; the degree coercion fires first).
  {
    const s = new Stack();
    s.push(Real(8));
    s.push(Vector([Real(2), Real(3)]));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session371: Real(8) V[2,3] XROOT → Bad argument type (degree-slot V reject independent of radicand kind)');
  }
}

/* ====================================================================
   session271: S-column (String) rejection pins — special-function
   family (XPON / MANT / TRUNC / ZETA / LAMBERT / PSI)
   ----------------------------------------------------------------
   Adds the S column to the special-function table (it had
   R/Z/Q/C/N/Sy/L/V/M/T only — no S column), continuing session 269's
   S-column work on the combinatorial family.  All six reject String:
     • XPON / MANT:        handler guard `!isReal(v) && !isInteger(v) → throw`.
     • ZETA / LAMBERT / PSI: `_*Scalar` — `isInteger ? … : isReal ? … : null`
                            → String → null → 'Bad argument type'.
     • TRUNC:              x via `_roundingOp` `!isReal && !isInteger → throw`;
                            n (level 1) via `toRealOrThrow` → 'expected real, got string'.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('XPON').fn(s), /Bad argument type/i,
      'session271: Str("x") XPON → Bad argument type (S=✗; handler guard !isReal&&!isInteger → throw; MANT shares guard)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('MANT').fn(s), /Bad argument type/i,
      'session271: Str("x") MANT → Bad argument type (S=✗; same !isReal&&!isInteger guard as XPON)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      'session271: Str("x") ZETA → Bad argument type (S=✗; _zetaScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      'session271: Str("x") LAMBERT → Bad argument type (S=✗; _lambertScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      'session271: Str("x") PSI → Bad argument type (S=✗; _psiScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    // TRUNC x-operand (level 2) String → Bad argument type via _roundingOp guard
    const s = new Stack(); s.push(S1); s.push(Real(2));
    assertThrows(() => lookup('TRUNC').fn(s), /Bad argument type/i,
      'session271: Str("x") Real(2) TRUNC → Bad argument type (S=✗; x via _roundingOp !isReal&&!isInteger → throw)');
  }
  {
    // TRUNC n-operand (level 1) String → 'expected real, got string' via toRealOrThrow
    const s = new Stack(); s.push(Real(3.14159)); s.push(S1);
    assertThrows(() => lookup('TRUNC').fn(s), /expected real, got string/i,
      'session271: Real(3.14159) Str("x") TRUNC → Bad argument type: expected real, got string (S=✗; n via toRealOrThrow)');
  }
}

/* ====================================================================
   session281: S-column (String) rejection pins — special-function /
   stat-dist family (HEAVISIDE / DIRAC / GAMMA / LNGAMMA / ERF / ERFC /
   BETA / UTPC / UTPF / UTPT)
   ----------------------------------------------------------------
   Adds the S column to the stat-dist table (it had R/Z/Q/C/N/Sy/L/V/M/T
   only — no S column), completing the DATA_TYPES "Next-session widening
   candidates" item after session 271's special-function S-column.  All
   ten reject String with 'Bad argument type':
     • HEAVISIDE / DIRAC:   scalar arm isReal/isInteger/isBinaryInteger/isSym
                            only; String falls through to the closing throw.
     • GAMMA / LNGAMMA / ERF / ERFC: `_*Scalar` `isInteger ? … : isReal ? …
                            : null` → String → null → throw.
     • BETA:                `_betaScalar` aNum `isInteger ? … : isReal ? …
                            : null` → String → null → throw.
     • UTPC / UTPF / UTPT:  shared `asReal` helper (isInteger/isReal only)
                            throws on the first String operand.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      'session281: Str("x") HEAVISIDE → Bad argument type (S=✗; scalar arm isReal/isInteger/isBinaryInteger/isSym only)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      'session281: Str("x") DIRAC → Bad argument type (S=✗; same arm as HEAVISIDE)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      'session281: Str("x") GAMMA → Bad argument type (S=✗; _gammaScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      'session281: Str("x") LNGAMMA → Bad argument type (S=✗; _lngammaScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      'session281: Str("x") ERF → Bad argument type (S=✗; _erfScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      'session281: Str("x") ERFC → Bad argument type (S=✗; _erfcScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") BETA → Bad argument type (S=✗; _betaScalar aNum null → throw)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") UTPC → Bad argument type (S=✗; asReal rejects String ν)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y')); s.push(Str('z'));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") Str("z") UTPF → Bad argument type (S=✗; asReal rejects String ν₁)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") UTPT → Bad argument type (S=✗; asReal rejects String ν)');
  }
}

/* ================================================================
   session385: HEAVISIDE / DIRAC BinaryInteger-accept arm (B=✓).
   The scalar handlers carry an explicit `isBinaryInteger` branch
   (ops.js ~16365 / ~16389) — "BinaryInteger is accepted the same as
   Integer" per the source comment — but every prior pin (session267/
   268/281) only ever reached the FINAL throw with Complex / String,
   documenting the arm in a comment while never exercising it. So the
   positive B-accept had zero coverage: a refactor folding the BinInt
   branch into the Integer guard, or dropping it, would pass green.
   HEAVISIDE maps BinInt through `_realStepValue` → Integer step (B is
   non-negative so step is always 1, incl. #0h → 1, right-continuous);
   DIRAC maps non-zero BinInt → Integer(0) and #0h → Symbolic DIRAC(0)
   (the at-origin spike, same as the Integer arm). Probed live first
   (CAS-free): #5h/#0h HEAVISIDE → Integer(1); #5h DIRAC → Integer(0);
   #0h DIRAC → Symbolic; #3b (base cosmetic) DIRAC → Integer(0).
   ================================================================ */
{
  {
    const s = new Stack(); s.push(new BinaryInteger(5n, 'h'));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session385: #5h HEAVISIDE → Integer(1) (B=✓; isBinaryInteger arm → _realStepValue step) (value=${v.value})`);
  }
  {
    const s = new Stack(); s.push(new BinaryInteger(0n, 'h'));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session385: #0h HEAVISIDE → Integer(1) (B=✓; right-continuous at 0, step=1) (value=${v.value})`);
  }
  {
    const s = new Stack(); s.push(new BinaryInteger(5n, 'h'));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session385: #5h DIRAC → Integer(0) (B=✓; non-zero BinInt → 0, same as Integer arm) (value=${v.value})`);
  }
  {
    const s = new Stack(); s.push(new BinaryInteger(0n, 'h'));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isSymbolic(v),
      'session385: #0h DIRAC → Symbolic (B=✓; at-origin spike stays symbolic, same as Integer(0) arm)');
  }
  {
    const s = new Stack(); s.push(new BinaryInteger(3n, 'b'));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session385: #3b (binary base) DIRAC → Integer(0) (B=✓; base is cosmetic, value-driven) (value=${v.value})`);
  }
}

/* ================================================================
   Session 292 — `^` BinInt (B) column correction.

   DATA_TYPES marked B=✗ on the `^` row ("BinInt ✗ for the base"), but
   that contradicts both the BinInt masking contract (which lists all
   five arithmetic ops incl. `^`) and the existing pins session045
   (#2h 8 ^ → #100h) / session110 (#2h ^ Integer(10) masked).  BinInt is
   accepted as base AND exponent: BinInt^BinInt routes through
   binIntBinary; an Integer/Real base with a BinInt exponent (or vice
   versa) routes through _scalarBinaryMixed → binIntBinary with the
   BinInt side's base preserved.  The result is always masked to the
   current wordsize.  Already-pinned: BinInt-base ^ Integer-exponent.
   Gap closed here: BinInt^BinInt and Integer-base ^ BinInt-exponent,
   plus their wordsize-mask edges.  No source change — behavior was
   already correct; the matrix cell was the error.
   ================================================================ */
{
  const wsEntry = getWordsize();

  // BinInt ^ BinInt at the default wordsize: #2h ^ #3h → #8h.
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(BinaryInteger(3n, 'h'));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 8n && v.base === 'h',
      `session292: #2h ^ #3h → #8h (B=✓ base+exponent; binIntBinary) (value=${v.value})`);
  }

  // Integer base ^ BinInt exponent (operand-order mirror of session110):
  // Z2 ^ #5h → #32h (2^5=32; BinInt exponent's base wins via _scalarBinaryMixed).
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(BinaryInteger(5n, 'h'));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 32n && v.base === 'h',
      `session292: Integer(2) ^ #5h → #32h (B exponent coerces Integer base; base preserved) (value=${v.value})`);
  }

  // ws=8 BinInt^BinInt overflow: #2h ^ #Ah (10) = 1024 & 0xFF = 0 → #0h.
  setWordsize(8);
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(BinaryInteger(10n, 'h'));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 0n && v.base === 'h',
      `session292: ws=8 #2h ^ #Ah → #0h (1024 masked to 8 bits; both-BinInt path) (value=${v.value})`);
  }

  // ws=8 BinInt^BinInt non-trivial mask: #FFh ^ #2h = 65025 & 0xFF = 1 → #1h.
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    s.push(BinaryInteger(2n, 'h'));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 1n && v.base === 'h',
      `session292: ws=8 #FFh ^ #2h → #1h (255²=65025 masked to 8 bits) (value=${v.value})`);
  }

  setWordsize(wsEntry);
}

/* ================================================================
   session298: `^` on a Matrix base is the *matrix power* (repeated
   matmul, M^0 = identity), per HP50 AUR ("`^` can also apply to a
   square matrix raised to a whole-number power").  session292's drift
   watch flagged the old `^` row: a Matrix base ran the generic
   element-wise broadcast (`M[[1,2],[3,4]] ^ 2` → element-wise
   `[[1,4],[9,16]]`) and a Vector base broadcast too.  Source fix:
   `binaryMath` now intercepts `op==='^'` for Matrix/Vector bases —
   square Matrix^whole-number routes through the new `_matrixPow`
   (which shares `_matMul` with the `*` branch); Vector base and a
   non-whole-number exponent reject.  A negative whole exponent is the
   power of INV(M), as a TI's [A]^-1 (an extension: the AUR says
   whole-number).  These pins lock the corrected behavior plus a
   `*`-matmul regression for the extracted `_matMul` helper.
   ================================================================ */
{
  const M22 = () => Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]);
  const rowsEqual = (m, expected) =>
    isMatrix(m) && m.rows.length === expected.length &&
    m.rows.every((row, i) =>
      row.length === expected[i].length &&
      row.every((x, j) => isInteger(x) && x.value === expected[i][j]));

  // M^2 = M·M = [[7,10],[15,22]] (NOT element-wise [[1,4],[9,16]]).
  {
    const s = new Stack();
    s.push(M22());
    s.push(Integer(2n));
    lookup('^').fn(s);
    assert(rowsEqual(s.peek(), [[7n, 10n], [15n, 22n]]),
      'session298: M[[1,2],[3,4]] ^ 2 → [[7,10],[15,22]] (matrix power, not element-wise)');
  }

  // M^0 = identity.
  {
    const s = new Stack();
    s.push(M22());
    s.push(Integer(0n));
    lookup('^').fn(s);
    assert(rowsEqual(s.peek(), [[1n, 0n], [0n, 1n]]),
      'session298: M ^ 0 → identity [[1,0],[0,1]]');
  }

  // M^1 = M.
  {
    const s = new Stack();
    s.push(M22());
    s.push(Integer(1n));
    lookup('^').fn(s);
    assert(rowsEqual(s.peek(), [[1n, 2n], [3n, 4n]]),
      'session298: M ^ 1 → M unchanged');
  }

  // M^3 = M^2·M = [[37,54],[81,118]].
  {
    const s = new Stack();
    s.push(M22());
    s.push(Integer(3n));
    lookup('^').fn(s);
    assert(rowsEqual(s.peek(), [[37n, 54n], [81n, 118n]]),
      'session298: M ^ 3 → [[37,54],[81,118]] (repeated matmul)');
  }

  // Whole-number Real exponent is accepted (integer-valued Real arm).
  {
    const s = new Stack();
    s.push(M22());
    s.push(Real(2));
    lookup('^').fn(s);
    assert(rowsEqual(s.peek(), [[7n, 10n], [15n, 22n]]),
      'session298: M ^ Real(2) → matrix power (integer-valued Real exponent)');
  }

  // Vector base has no defined `^` — reject (V cell is genuinely ✗).
  assertThrows(() => {
    const s = new Stack();
    s.push(Vector([Integer(2n), Integer(3n)]));
    s.push(Integer(2n));
    lookup('^').fn(s);
  }, 'Bad argument type', 'session298: V[2,3] ^ 2 → Bad argument type (no vector power)');

  // Non-square matrix base — matrix power undefined.
  assertThrows(() => {
    const s = new Stack();
    s.push(Matrix([[Integer(1n), Integer(2n), Integer(3n)], [Integer(4n), Integer(5n), Integer(6n)]]));
    s.push(Integer(2n));
    lookup('^').fn(s);
  }, 'Invalid dimension', 'session298: M(2x3) ^ 2 → Invalid dimension (square only)');

  // Negative whole exponent — the power of the inverse, exact for exact entries.
  {
    const power = (src) => runLine(src).peek();
    const rows = (src) => formatSource(power(src));
    assert(rows('[[1 2][3 4]] -1 ^') === '[[ -2 1 ][ 3/2 -1/2 ]]',
      `session298: M ^ -1 → INV(M) (got ${rows('[[1 2][3 4]] -1 ^')})`);
    assert(rows('[[1 2][3 4]] -2 ^') === '[[ 11/2 -5/2 ][ -15/4 7/4 ]]',
      `session298: M ^ -2 → INV(M)^2 (got ${rows('[[1 2][3 4]] -2 ^')})`);
    assert(rows('[[1 2][3 4]] -3 ^') === rows('[[1 2][3 4]] INV 3 ^'),
      'session298: M ^ -3 → INV(M)^3');
    assert(rows('[[1 2][3 4]] -1. ^') === '[[ -2 1 ][ 3/2 -1/2 ]]',
      'session298: M ^ -1. → integer-valued Real exponent also takes the inverse');
    assert(rows('[[1 2][3 4]] -4 ^ [[1 2][3 4]] 4 ^ *') === '[[ 1 0 ][ 0 1 ]]',
      'session298: M ^ -4 * M ^ 4 → identity');
    assert(rows('[[2.5 2][3 4]] -1 ^') === '[[ 1. -0.5 ][ -0.75 0.625 ]]',
      'session298: decimal M ^ -1 → decimal inverse');
    assert(rows("[[1 2][3 4]] 'A' STO 'A^-1' EVAL 'A' PURGE") === '[[ -2 1 ][ 3/2 -1/2 ]]',
      "session298: 'A^-1' EVAL → inverse of the stored matrix, as a TI's [A]^-1");
    assert(rows("[[1 2][3 4]] 'A' STO 'A^(-2)' EVAL 'A' PURGE") === '[[ 11/2 -5/2 ][ -15/4 7/4 ]]',
      "session298: 'A^(-2)' EVAL → inverse of the stored matrix squared");
  }
  assertThrows(() => runLine('[[1 2][2 4]] -1 ^'), 'Infinite result',
    'session298: singular M ^ -1 → Infinite result (as INV)');
  assertThrows(() => runLine('[[1 2 3][4 5 6]] -1 ^'), 'Invalid dimension',
    'session298: M(2x3) ^ -1 → Invalid dimension (square only)');
  assertThrows(() => runLine('[[1 2][3 4]] -1.5 ^'), 'Bad argument value',
    'session298: M ^ -1.5 → Bad argument value (whole-number only)');
  assertThrows(() => runLine('[1 2] -1 ^'), 'Bad argument type',
    'session298: V ^ -1 → Bad argument type (no vector power)');

  // Non-integer exponent — rejected.
  assertThrows(() => {
    const s = new Stack();
    s.push(M22());
    s.push(Real(1.5));
    lookup('^').fn(s);
  }, 'Bad argument value', 'session298: M ^ 1.5 → Bad argument value (whole-number only)');

  // Regression for the extracted `_matMul`: M·M still matmul.
  {
    const s = new Stack();
    s.push(M22());
    s.push(M22());
    lookup('*').fn(s);
    assert(rowsEqual(s.peek(), [[7n, 10n], [15n, 22n]]),
      'session298: M * M → [[7,10],[15,22]] (matmul via extracted _matMul helper)');
  }
}

/* ================================================================
   session335: types.js file-header "Types implemented:" list ↔ TYPES
   const drift guard (code-review R-014 class). The header comment
   enumerates every implemented type; it had drifted by omitting
   Directory (a fully constructed type — Directory ctor + isDirectory
   predicate + TYPES.DIRECTORY). Each TYPES value is camelCase, so its
   PascalCase display name is just the first letter upper-cased
   (binaryInteger → BinaryInteger, directory → Directory) — derive it
   rather than hand-copy the list, and assert it appears in the header
   block (the comment above the first import). Fails loudly if a future
   type is added to TYPES without documenting it in the header.
   ================================================================ */
{
  const src = readFileSync(new URL('../www/src/rpl/types.js', import.meta.url), 'utf8');
  const header = src.slice(0, src.indexOf('import '));
  const displayName = v => v[0].toUpperCase() + v.slice(1);
  const documented = v => new RegExp(`\\b${displayName(v)}\\b`).test(header);

  const typeValues = Object.values(TYPES);
  assert(typeValues.length >= 16,
    `session335: TYPES exposes >= 16 kinds (extraction guard), got ${typeValues.length}`);
  for (const v of typeValues) {
    assert(documented(v),
      `session335: types.js header documents ${displayName(v)} (TYPES.${v})`);
  }
  // The drift that was just fixed: Directory must be named in the header.
  assert(/\bDirectory\b/.test(header),
    'session335: header lists Directory (regression for the omitted-kind drift)');
}

{
  const [v] = parseEntry(':x:7.2');
  assert(isTagged(v) && v.tag === 'x' && v.value.type === 'real',
    'parser: :x:7.2 is a tagged Real');
  assertThrows(() => parseEntry(':x:'), /Missing object/,
    'parser: a bare :x: tag with no object is rejected');
}

{
  const s = new Stack();
  for (const v of parseEntry(':x:[1.5_m 2.7_m]')) s.push(v);
  lookup('FLOOR').fn(s);
  const out = s.peek();
  assert(isTagged(out) && out.tag === 'x' && format(out.value) === '[ 1._m 2._m ]',
    'FLOOR on a tagged vector of units keeps the tag and the units');
}

for (const src of ['{ :a:1 :b:"s" }', '« :a:1 DTAG »', ':o:{ :i:2 }']) {
  const text = formatSource(parseEntry(src)[0]);
  assert(formatSource(parseEntry(text)[0]) === text,
    `formatSource: ${src} re-parses to the same object`);
}

{
  const s = new Stack();
  s.push(Tagged('x', Integer(5n)));
  lookup('→STR').fn(s);
  assert(s.peek().value === ':x:5', '→STR on a tagged value gives the re-enterable :x:5 form');
  lookup('STR→').fn(s);
  assert(isTagged(s.peek()) && s.peek().tag === 'x', 'STR→ reads :x:5 back as a tagged value');
}

{
  const [v] = parseEntry(':my tag:5');
  assert(isTagged(v) && v.tag === 'my tag', 'parser: a tag may contain a space, as →TAG allows');
  const [big] = parseEntry('`1E+3`');
  assert(big.type === 'symbolic' && big.expr.value === 1000, 'parser: `1E+3` is a Symbolic number');
}

{
  const text = (src) => runLine(src).snapshot().reverse().map((v) => formatStackTop(v)).join(' | ');
  assert(text('`X^2+1=Y` EQ→') === '`X^2 + 1` | `Y`' && text('`X=5` EQ→') === '`X` | 5',
    'EQ→ splits an equation into its two sides, a number side landing as a number');
  assert(text('`SIN(X)` EQ→') === '`SIN(X)` | 0.' && text('5 EQ→') === '5 | 0.' && text('3_m EQ→') === '3._m | 0.',
    'EQ→ treats an expression, number or unit as an equation equal to zero, as the AUR says');
  assertThrows(() => runLine('"s" EQ→'), 'Bad argument type', 'EQ→ refuses a string');
}

{
  const text = (src) => runLine(src).snapshot().reverse().map((v) => formatStackTop(v)).join(' | ');
  assert(text('GROB 9 2 FF10F010') === 'Graphic 9 × 2', 'GROB: a graphics object shows as Graphic width × height, as on the HP');
  assert(text('GROB 9 2 ff10f010 →STR') === '"GROB 9 2 FF10F010"' && text('GROB 9 2 FF10F010 DUP →STR STR→ SAME') === '1.',
    'GROB: →STR gives the GROB text, which reads back as the same object');
  assert(text('GROB 9 1 FFFF →STR') === '"GROB 9 1 FF10"', 'GROB: bits past the width are dropped');
  assertThrows(() => runLine('GROB 9 2 FF1'), /Invalid syntax/, 'GROB: the hex must fill every row');
  assert(text('GROB 9 2 FF10F010 TYPE') === '11.' && text('GROB 9 2 FF10F010 SIZE') === '#9d | #2d',
    'GROB: TYPE is 11 and SIZE gives the width and height');
  assert(text('GROB 9 2 FF10F010 GROB 9 2 FF10F000 SAME') === '0.', 'GROB: SAME compares the pixels');
  assert(text('#3d #2d BLANK →STR') === '"GROB 3 2 0000"' && text('3 2 BLANK') === 'Graphic 3 × 2',
    'BLANK makes a blank graphics object from two sizes in pixels');
  assertThrows(() => runLine('-1 2 BLANK'), /Bad argument value/, 'BLANK refuses a negative size');
  assertThrows(() => runLine('#10000d #10000d BLANK'), /Insufficient memory/, 'BLANK refuses an object too big to hold');
}

/* A long integer keeps its text for the redraw and the autosave that follow, where printing a million digits takes half a
   second; short ones, negative ones and a fifth long one past the cache's four all still print as toString does. */
{
  const long = (k) => 7n ** BigInt(20000 + k);
  const same = (n) => bigintText(n) === n.toString() && bigintText(n) === n.toString();
  assert(same(0n) && same(-12345678901234567890n) && same(10n ** 9998n) && same(10n ** 9999n) && same(-(10n ** 9999n)),
    'bigintText: small, negative and just-short-of-cached integers print as toString does, and so do ones past the cutoff');
  const many = [0, 1, 2, 3, 4, 5].map(long);
  assert(many.every(same) && same(many[0]) && same(many[5]), 'bigintText: six long integers in turn, past the four it keeps, each still print in full');
  const fraction = Rational(many[3], many[4] + 1n);
  assert(format(Integer(many[2])) === many[2].toString() && format(fraction) === `${fraction.n}/${fraction.d}`,
    'format: an integer and a fraction of long parts print through the same text');
}


{
  const recurse = (n) => recurse(n + 1) + 1;
  let real;
  try { recurse(0); } catch (e) { real = e; }
  const firefox = Object.assign(new Error('too much recursion'), { name: 'InternalError' });
  assert(isStackOverflow(real) && isStackOverflow(new RangeError('Maximum call stack size exceeded')) && isStackOverflow(firefox),
    'isStackOverflow: a real overflow, the RangeError V8 and JavaScriptCore throw and the InternalError Firefox throws');
  assert(!isStackOverflow(new RangeError('Invalid array length')) && !isStackOverflow(new Error('Maximum call stack size exceeded')) && !isStackOverflow(null) && !isStackOverflow(undefined) && !isStackOverflow('too much recursion'),
    'isStackOverflow: other range errors, a plain error with the words and a non-error are not one, so a DOERR message is left alone');
}
