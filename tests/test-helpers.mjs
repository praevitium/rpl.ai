/* Unit tests for the test helpers themselves.

   helpers.mjs exposes `assertThrows`, `rplEqual`, `runOp`, and
   `runOpStack`.  This file asserts the helpers' own contracts so a
   future change doesn't silently break on an edge case (e.g. the
   `binaryInteger` type-tag, or the Real-vs-Integer cross-type
   distinction). */

import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Tagged, Unit,
  RList, Vector, Matrix, Symbolic, Program, Directory,
} from '../www/src/rpl/types.js';
import { assert, assertThrows, rplEqual, runOp, runOpStack } from './helpers.mjs';

/* ================================================================
   assertThrows — pattern can be a RegExp, a string, or null.
   ================================================================ */
{
  // RegExp match: passes.
  assertThrows(() => { throw new Error('Bad argument type'); },
    /Bad argument type/, 'helpers: assertThrows catches RegExp match');
}
{
  // String substring match: passes.
  assertThrows(() => { throw new Error('Too few arguments'); },
    'Too few arguments', 'helpers: assertThrows catches string-substring match');
}
{
  // null pattern: any throw counts.
  assertThrows(() => { throw new Error('whatever'); },
    null, 'helpers: assertThrows with null pattern accepts any throw');
}
{
  // Returns the caught error for secondary inspection.
  const err = assertThrows(() => { throw new TypeError('oops'); },
    /oops/, 'helpers: assertThrows returns the caught error');
  assert(err instanceof TypeError,
    'helpers: assertThrows-returned error is the original Error instance');
}

/* ================================================================
   rplEqual — type-by-type coverage.
   ================================================================ */

/* --- scalar identity / inequality --- */
assert(rplEqual(Real(3.14), Real(3.14)),
  'helpers: rplEqual on matching Reals');
assert(!rplEqual(Real(3.14), Real(3.15)),
  'helpers: rplEqual rejects Reals with different values');
assert(rplEqual(Integer(42n), Integer(42n)),
  'helpers: rplEqual on matching Integers (BigInt)');
assert(!rplEqual(Integer(42n), Real(42)),
  'helpers: rplEqual rejects type mismatch Integer vs Real (type-distinct)');
assert(rplEqual(Complex(1, 2), Complex(1, 2)),
  'helpers: rplEqual on matching Complex');
assert(!rplEqual(Complex(1, 2), Complex(2, 1)),
  'helpers: rplEqual rejects Complex with swapped re/im');
assert(rplEqual(Str('hello'), Str('hello')),
  'helpers: rplEqual on matching Strings');
assert(!rplEqual(Str('a'), Str('b')),
  'helpers: rplEqual rejects different Strings');

/* --- Name equality uses id + quoted + local flags --- */
assert(rplEqual(Name('X'), Name('X')),
  'helpers: rplEqual on two bare Names with same id');
assert(!rplEqual(Name('X'), Name('Y')),
  'helpers: rplEqual rejects distinct Name ids');
assert(!rplEqual(Name('X'), Name('X', { quoted: true })),
  'helpers: rplEqual treats quoted Name as distinct from bare');
assert(!rplEqual(Name('X'), Name('X', { local: true })),
  'helpers: rplEqual treats local Name as distinct from global');

/* --- BinaryInteger: base is part of identity --- */
assert(rplEqual(BinaryInteger(0xFFn, 'h'), BinaryInteger(0xFFn, 'h')),
  'helpers: rplEqual on two #FFh matches');
assert(!rplEqual(BinaryInteger(255n, 'h'), BinaryInteger(255n, 'd')),
  'helpers: rplEqual rejects base mismatch even when value matches');

/* --- Tagged: tag string + recursive value --- */
assert(rplEqual(Tagged('x', Real(1)), Tagged('x', Real(1))),
  'helpers: rplEqual recurses into Tagged.value');
assert(!rplEqual(Tagged('a', Real(1)), Tagged('b', Real(1))),
  'helpers: rplEqual rejects different tag strings');

/* --- Container equality: List / Vector / Matrix / Program --- */
assert(rplEqual(
    RList([Real(1), Real(2), Real(3)]),
    RList([Real(1), Real(2), Real(3)])),
  'helpers: rplEqual structural on matching Lists');
assert(!rplEqual(
    RList([Real(1), Real(2)]),
    RList([Real(1), Real(2), Real(3)])),
  'helpers: rplEqual rejects Lists of different length');
assert(rplEqual(
    Vector([Real(1), Real(2)]),
    Vector([Real(1), Real(2)])),
  'helpers: rplEqual structural on matching Vectors');
assert(rplEqual(
    Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]),
    Matrix([[Real(1), Real(2)], [Real(3), Real(4)]])),
  'helpers: rplEqual structural on matching Matrices');
assert(!rplEqual(
    Matrix([[Real(1), Real(2)]]),
    Matrix([[Real(1), Real(2), Real(3)]])),
  'helpers: rplEqual rejects Matrices with row-shape mismatch');
assert(rplEqual(
    Program([Integer(1n), Integer(2n), Name('+')]),
    Program([Integer(1n), Integer(2n), Name('+')])),
  'helpers: rplEqual on matching Programs');
assert(!rplEqual(
    Program([Integer(1n), Name('+')]),
    Program([Integer(1n), Name('-')])),
  'helpers: rplEqual rejects Programs with different tokens');

/* --- Symbolic: JSON-based AST equality --- */
assert(rplEqual(
    Symbolic({ k: 'var', id: 'X' }),
    Symbolic({ k: 'var', id: 'X' })),
  'helpers: rplEqual on matching Symbolic ASTs');
assert(!rplEqual(
    Symbolic({ k: 'var', id: 'X' }),
    Symbolic({ k: 'var', id: 'Y' })),
  'helpers: rplEqual rejects different Symbolic ASTs');

/* --- Unit: value + uexpr --- */
const u1 = Unit(5, { kind: 'atom', name: 'm' });
const u2 = Unit(5, { kind: 'atom', name: 'm' });
const u3 = Unit(5, { kind: 'atom', name: 'kg' });
assert(rplEqual(u1, u2),
  'helpers: rplEqual on matching Units');
assert(!rplEqual(u1, u3),
  'helpers: rplEqual rejects different unit dimensions');

/* --- Directory: reference equality only --- */
const dA = Directory({ name: 'HOME' });
const dB = Directory({ name: 'HOME' });
assert(rplEqual(dA, dA), 'helpers: rplEqual on same Directory reference');
assert(!rplEqual(dA, dB),
  'helpers: rplEqual on distinct-but-equal Directories is false (identity)');

/* --- cross-type rejection --- */
assert(!rplEqual(Real(1), Integer(1n)),
  'helpers: rplEqual rejects Real vs Integer cross-type (HP50 keeps these distinct)');
assert(!rplEqual(null, Real(1)),
  'helpers: rplEqual(null, v) is false without throwing');
assert(!rplEqual(undefined, Real(1)),
  'helpers: rplEqual(undefined, v) is false without throwing');
assert(rplEqual(null, null),
  'helpers: rplEqual(null, null) is true (ref-equal)');

/* ================================================================
   runOp / runOpStack — end-to-end smoke.
   ================================================================ */
{
  const top = runOp('+', Real(1), Real(2));
  assert(rplEqual(top, Real(3)),
    'helpers: runOp("+", 1, 2) returns Real(3)');
}
{
  // OBJ→ on a 3-list leaves 3 items + a count; runOpStack returns them all
  // (level-1-first per snapshot() convention).
  const stack = runOpStack('OBJ→', RList([Real(1), Real(2), Real(3)]));
  assert(stack.length === 4, 'helpers: runOpStack("OBJ→", 3-list) returns 4 values');
  assert(rplEqual(stack[0], Integer(3n)),
    'helpers: runOpStack[0] = level-1 = Integer(3) (count)');
  assert(rplEqual(stack[3], Real(1)),
    'helpers: runOpStack[3] = level-4 = Real(1) (first list item)');
}
{
  // runOp re-throws so callers can wrap it in assertThrows.
  assertThrows(() => runOp('CHR', Real(-1)),
    /Bad argument value/i,
    'helpers: runOp re-throws op errors cleanly');
}
