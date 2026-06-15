/* Coverage for HP50 stack-manipulation commands implemented in
   stack.js and ops.js.

   Ops covered (HP50 User Guide §C / AUR §2):

     DEPTH, OVER, ROT, ROLL, ROLLD, DUP2, DROP2, DROPN, DUPN, DUPDUP,
     NIP, PICK, PICK3, UNPICK, NDUPN, SWAP, CLEAR

   For each op we assert both a happy-path outcome AND the
   "Too few arguments" / "Bad argument value" rejection path, so a
   future regression that silently rearranges levels (the class of
   bug most likely to slip past ad-hoc testing) is caught.

   Values on the stack are Integers so we can compare .value directly
   without worrying about Real-vs-Integer promotion. */

import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Real, Integer, Str, isInteger, isReal } from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

/* Helper: return an array of .value fields from level-N-down to level-1.
   Reads via peek() so we don't touch stack._items directly from tests. */
function vals(s) {
  const out = [];
  for (let i = s.depth; i >= 1; i--) out.push(s.peek(i).value);
  return out;
}

{
  const s = new Stack();
  lookup('DEPTH').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 0n,
    'session064: DEPTH on empty stack pushes Integer 0');

  s.clear();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  lookup('DEPTH').fn(s);
  assert(s.depth === 4 && isInteger(s.peek()) && s.peek().value === 3n,
    'session064: DEPTH counts items BEFORE pushing result (3 items → push Integer 3)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  lookup('OVER').fn(s);
  const v = vals(s);
  assert(v.length === 3 && v[0] === 1n && v[1] === 2n && v[2] === 1n,
    'session064: OVER copies level 2 to top: (1 2 → 1 2 1)');

  const t = new Stack();
  t.push(Integer(1n));
  assertThrows(() => lookup('OVER').fn(t), /Too few/,
    'session064: OVER on depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(3n));
  lookup('ROT').fn(s);
  const v = vals(s);
  assert(v.length === 3 && v[0] === 2n && v[1] === 3n && v[2] === 1n,
    'session064: ROT cycles level 3 to top: (1 2 3 → 2 3 1)');

  const t = new Stack();
  t.push(Integer(1n));
  t.push(Integer(2n));
  assertThrows(() => lookup('ROT').fn(t), /Too few/,
    'session064: ROT on depth 2 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  lookup('DUP2').fn(s);
  const v = vals(s);
  assert(v.length === 4 && v[0] === 1n && v[1] === 2n && v[2] === 1n && v[3] === 2n,
    'session064: DUP2 copies levels 2,1 onto top: (1 2 → 1 2 1 2)');

  const t = new Stack();
  t.push(Integer(1n));
  assertThrows(() => lookup('DUP2').fn(t), /Too few/,
    'session064: DUP2 on depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(3n));
  lookup('DROP2').fn(s);
  const v = vals(s);
  assert(v.length === 1 && v[0] === 1n,
    'session064: DROP2 removes top two levels: (1 2 3 → 1)');

  const t = new Stack();
  t.push(Integer(1n));
  assertThrows(() => lookup('DROP2').fn(t), /Too few/,
    'session064: DROP2 on depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  s.push(Integer(40n));
  s.push(Integer(3n));                      // N = 3
  lookup('DROPN').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session064: 3 DROPN removes top three after N: (10 20 30 40 3 → 10)');

  const t = new Stack();
  t.push(Integer(99n));
  t.push(Integer(0n));
  lookup('DROPN').fn(t);
  assert(t.depth === 1 && t.peek().value === 99n,
    'session064: 0 DROPN is a no-op (count popped, no drops)');

  // Negative N is invalid per HP50 ("Bad argument value").
  const u = new Stack();
  u.push(Integer(1n));
  u.push(Integer(-1n));
  assertThrows(() => lookup('DROPN').fn(u), /Bad argument value/,
    'session064: -1 DROPN → Bad argument value');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(3n));
  s.push(Integer(2n));                      // N = 2
  lookup('DUPN').fn(s);
  const v = vals(s);
  assert(v.length === 5
      && v[0] === 1n && v[1] === 2n && v[2] === 3n
      && v[3] === 2n && v[4] === 3n,
    'session064: 2 DUPN duplicates top two: (1 2 3 2 → 1 2 3 2 3)');

  const t = new Stack();
  t.push(Integer(9n));
  t.push(Integer(0n));
  lookup('DUPN').fn(t);
  assert(t.depth === 1 && t.peek().value === 9n,
    'session064: 0 DUPN removes count only');
}

{
  const s = new Stack();
  assertThrows(() => lookup('DUPDUP').fn(s), /Too few/,
    'session064: DUPDUP on empty → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(3n));
  lookup('NIP').fn(s);
  const v = vals(s);
  assert(v.length === 2 && v[0] === 1n && v[1] === 3n,
    'session064: NIP drops level 2: (1 2 3 → 1 3)');

  const t = new Stack();
  t.push(Integer(1n));
  assertThrows(() => lookup('NIP').fn(t), /Too few/,
    'session064: NIP on depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  s.push(Integer(3n));                      // N = 3 → pick level 3 (=10)
  lookup('PICK').fn(s);
  assert(s.depth === 4 && s.peek().value === 10n,
    'session064: 3 PICK copies level 3 onto top');

  const t = new Stack();
  t.push(Integer(42n));
  t.push(Integer(1n));
  lookup('PICK').fn(t);
  assert(t.depth === 2 && t.peek(1).value === 42n && t.peek(2).value === 42n,
    'session064: 1 PICK behaves like DUP');

  // 0 PICK is invalid (HP50: "Bad argument value").
  const u = new Stack();
  u.push(Integer(9n));
  u.push(Integer(0n));
  assertThrows(() => lookup('PICK').fn(u), /Bad argument/,
    'session064: 0 PICK → Bad argument value');
}

{
  const s = new Stack();
  s.push(Integer(100n));
  s.push(Integer(200n));
  s.push(Integer(300n));
  lookup('PICK3').fn(s);
  assert(s.depth === 4 && s.peek().value === 100n,
    'session064: PICK3 copies level 3 (100) onto top');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  s.push(Integer(40n));
  s.push(Integer(3n));                      // N = 3
  lookup('ROLL').fn(s);
  const v = vals(s);
  // HP50 AUR: x_n ... x_1 n ROLL → x_(n-1) ... x_1 x_n
  // After popping N=3 we have (10 20 30 40); rolling 3 = level 3 (=20) to top:
  // result should be (10 30 40 20).
  assert(v.length === 4 && v[0] === 10n && v[1] === 30n && v[2] === 40n && v[3] === 20n,
    'session064: 3 ROLL moves level 3 (=20) to top: (10 20 30 40 3 → 10 30 40 20)');

  const t = new Stack();
  t.push(Integer(5n));
  t.push(Integer(1n));
  lookup('ROLL').fn(t);
  assert(t.depth === 1 && t.peek().value === 5n,
    'session064: 1 ROLL is a no-op (after count popped)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  s.push(Integer(40n));
  s.push(Integer(3n));                      // N = 3
  lookup('ROLLD').fn(s);
  const v = vals(s);
  // After popping N=3 we have (10 20 30 40); ROLLD 3 inserts 40 at level 3:
  // result should be (10 40 20 30).
  assert(v.length === 4 && v[0] === 10n && v[1] === 40n && v[2] === 20n && v[3] === 30n,
    'session064: 3 ROLLD moves top (=40) to level 3: (10 20 30 40 3 → 10 40 20 30)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(30n));
  s.push(Integer(99n));                     // value to write
  s.push(Integer(2n));                      // N = 2 → overwrite level 2 (which was 20)
  lookup('UNPICK').fn(s);
  const v = vals(s);
  // After pops we have stack (10 20 30); N=2 means "write 99 at level 2",
  // but the HP50 manual counts level AFTER popping N and value.  With the
  // remaining (10 20 30), level-2 = 20, so result should be (10 99 30).
  assert(v.length === 3 && v[0] === 10n && v[1] === 99n && v[2] === 30n,
    'session064: 99 2 UNPICK writes 99 at level 2: (10 20 30 99 2 → 10 99 30)');
}

{
  const s = new Stack();
  s.push(Integer(7n));                      // x
  s.push(Integer(3n));                      // count
  lookup('NDUPN').fn(s);
  const v = vals(s);
  // HP50: (x n → x x … x n) — n copies of x, then n back on top.
  assert(v.length === 4 && v[0] === 7n && v[1] === 7n && v[2] === 7n && v[3] === 3n,
    'session064: 7 3 NDUPN → (7 7 7 3)');

  const t = new Stack();
  t.push(Integer(42n));
  t.push(Integer(0n));
  lookup('NDUPN').fn(t);
  assert(t.depth === 1 && t.peek().value === 0n,
    'session064: x 0 NDUPN leaves just 0 on the stack (x consumed, no copies, n pushed)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => lookup('SWAP').fn(s), /Too few/,
    'session064: SWAP on depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(3n));
  lookup('CLEAR').fn(s);
  assert(s.depth === 0, 'session064: CLEAR empties the stack');

  let threw = false;
  try { lookup('CLEAR').fn(s); } catch (e) { threw = true; }
  assert(!threw && s.depth === 0,
    'session064: CLEAR on empty is a no-op (no error)');
}

{
  // With UNDO/LASTSTACK we need an explicit saveForUndo() snapshot; the
  // ops.js wrapper calls s.undo() which pops from the undo stack.  We
  // snapshot manually to verify the alias is wired to the same backend.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.saveForUndo();
  s.push(Integer(3n));                      // state now (1 2 3), undo has (1 2)
  lookup('LASTSTACK').fn(s);
  assert(s.depth === 2 && s.peek(1).value === 2n && s.peek(2).value === 1n,
    'session064: LASTSTACK is an alias for UNDO (restores pre-push snapshot)');
}

/* ================================================================
   session137: stack-op edge-path coverage closure.

 The block has thorough happy-path + first-arg
   "Too few" coverage but stops short of three rejection branches
   that share a `_toNonNegIntCount` / `_toPosIntIndex` /
   `s.depth < n` guard, plus DUPDUP's positive case (the file
   currently only pins DUPDUP's empty-stack rejection).  These
   additions pin:

     • DUPDUP positive — `7 → 7 7 7` (exercises the only
       branch the existing block doesn't: that DUPDUP actually
       pushes two copies of L1 rather than e.g. zero or one).
     • ROLL N>depth → Too few arguments (after popping the
       count, the `s.depth < n` guard fires).  Existing block
       only pins the L1-too-few rejection where N is missing.
     • ROLLD 0 → no-op after popping the count (mirror of the
       existing 1 ROLL no-op pin; `ROLLD`'s `n <= 1 return`
       branch was unverified).
     • ROLLD N>depth → Too few arguments (symmetric to ROLL).
     • UNPICK 0 → Bad argument value (the `_toPosIntIndex`
       guard rejects zero — distinct from the
       `_toNonNegIntCount` accept-zero contract used by ROLL/
       ROLLD/DROPN/DUPN/NDUPN).
     • UNPICK N>depth → Too few arguments (the `s.depth < n`
       guard).  Existing block has no UNPICK rejection.
     • DROPN N>depth → Too few arguments.  Existing block pins
       0 DROPN no-op + -1 DROPN Bad argument value but not the
       N>depth case.
     • DUPN N>depth → Too few arguments.  Symmetric to DROPN's
       missing branch.
     • NDUPN -1 → Bad argument value.  Existing block pins
       `x 0 NDUPN` no-op-with-count-restored but not the
       negative-count rejection (the `_toNonNegIntCount`
       guard).
   ================================================================ */

{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('DUPDUP').fn(s);
  const v = vals(s);
  assert(v.length === 3 && v[0] === 7n && v[1] === 7n && v[2] === 7n,
    'session137: DUPDUP on (7) → (7 7 7) — positive case (file previously only pinned DUPDUP empty rejection)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(5n));                      // N=5 > remaining depth=2
  assertThrows(() => lookup('ROLL').fn(s), /Too few/,
    'session137: 5 ROLL with only 2 items left → Too few arguments (s.depth<n guard)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Integer(0n));                      // N = 0
  lookup('ROLLD').fn(s);
  const v = vals(s);
  assert(v.length === 2 && v[0] === 10n && v[1] === 20n,
    'session137: 0 ROLLD is a no-op after popping count (mirror of existing 1 ROLL pin)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(5n));                      // N=5 > remaining depth=2
  assertThrows(() => lookup('ROLLD').fn(s), /Too few/,
    'session137: 5 ROLLD with only 2 items left → Too few arguments (symmetric to ROLL)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(99n));                     // value to write
  s.push(Integer(0n));                      // N = 0 (illegal; UNPICK uses _toPosIntIndex)
  assertThrows(() => lookup('UNPICK').fn(s), /Bad argument value/,
    'session137: 0 UNPICK → Bad argument value (UNPICK uses _toPosIntIndex which requires N≥1)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(99n));                     // value
  s.push(Integer(5n));                      // N = 5 > remaining depth=2
  assertThrows(() => lookup('UNPICK').fn(s), /Too few/,
    'session137: 5 UNPICK with only 2 items left → Too few arguments (s.depth<n guard)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(5n));                      // N=5 > remaining depth=1
  assertThrows(() => lookup('DROPN').fn(s), /Too few/,
    'session137: 5 DROPN with only 1 item left → Too few arguments (s.depth<n guard)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(5n));                      // N=5 > remaining depth=1
  assertThrows(() => lookup('DUPN').fn(s), /Too few/,
    'session137: 5 DUPN with only 1 item left → Too few arguments (s.depth<n guard)');
}

{
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Integer(-1n));                     // N=-1 (illegal)
  assertThrows(() => lookup('NDUPN').fn(s), /Bad argument value/,
    'session137: x -1 NDUPN → Bad argument value (_toNonNegIntCount rejects negative N)');
}

/* ================================================================
   session147: PICK / PICK3 / UNPICK / NDUPN rejection-path closure.

 The happy-path block + edge-path block
   between them pin most of the {ROLL, ROLLD, DROPN, DUPN, UNPICK,
   NDUPN, DUPDUP} surface.  PICK and PICK3 still have unverified
   rejection branches:

     • PICK rejects via a wrapper guard `!Number.isInteger(k) || k<1`
 (ops.js:174–179). The block pins the `k===0`
       case, but the *negative* case and the *non-integer Real* case
       (e.g. 1.5) follow distinct `< 1` / `!Number.isInteger`
       branches inside the same `if`; both go untested.
     • PICK on a non-Real stack value (e.g. String) routes to
       `toRealOrThrow` which throws 'Bad argument type' — this
       wrapper-side branch was unpinned (only Bad argument *value*
       paths were exercised).
     • PICK with N>depth dispatches into stack.js:129's
 `n < level` guard ('Too few arguments'). The
       block has happy-path PICK pins (`3 PICK`, `1 PICK ≡ DUP`)
       and a `0 PICK` reject, but the depth-overrun branch was
       only pinned for ROLL / ROLLD / UNPICK / DROPN / DUPN
, never for PICK itself.
     • PICK3 is registered as a thin wrapper `s.pick(3)` (ops.js
 :7213); the block has only the happy-path pin
       (`(100 200 300) PICK3 → 100`).  When depth<3 the
       `s.pick(3)` call hits the same `n < level` guard — the
       reject branch is unpinned for PICK3.
 • UNPICK -1: added 0-UNPICK and N>depth UNPICK
       reject pins, but the *negative-N* branch of
       `_toPosIntIndex` was never specifically exercised.  -1
       and 0 share the same `n < 1` rejection but going through
       different code paths (the `!Number.isInteger` branch
       takes the same exit, so a refactor that only checked
       `n === 0` would slip past the existing 0-UNPICK pin —
       the negative-N pin guards against that).
     • NDUPN with depth=1 (only the count on the stack, no `x`
       below it) hits the `if (s.depth < 1)` guard at
 `ops.js:7255` — distinct from 's NDUPN -1
       reject (which fires earlier at `_toNonNegIntCount`).
       Pinning this branch closes NDUPN's rejection grid.
   ================================================================ */

{
  const s = new Stack();
  s.push(Integer(9n));
  s.push(Integer(-1n));                     // N=-1
  assertThrows(() => lookup('PICK').fn(s), /Bad argument value/,
    'session147: -1 PICK → Bad argument value (negative-N branch of PICK wrapper k<1 guard; distinct from existing 0 PICK pin)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(5n));                      // N=5 > depth-after-pop=2
  assertThrows(() => lookup('PICK').fn(s), /Too few/,
    'session147: 5 PICK with only 2 items left → Too few arguments (Stack.pick n<level guard; closes PICK depth-overrun branch session-137 left for siblings)');
}

{
  const s = new Stack();
  s.push(Integer(9n));
  s.push(Real(1.5));                        // non-integer Real
  assertThrows(() => lookup('PICK').fn(s), /Bad argument value/,
    'session147: 1.5 PICK → Bad argument value (!Number.isInteger branch of PICK wrapper guard; distinct branch from negative/zero rejects)');
}

{
  const s = new Stack();
  s.push(Integer(9n));
  s.push(Str('foo'));                       // non-Real, non-Integer
  assertThrows(() => lookup('PICK').fn(s), /Bad argument type/,
    'session147: "foo" PICK → Bad argument type (toRealOrThrow rejection at wrapper; distinct from value-domain rejects)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));                     // depth = 2 < 3
  assertThrows(() => lookup('PICK3').fn(s), /Too few/,
    'session147: PICK3 on depth-2 stack → Too few arguments (closes PICK3 rejection branch — file previously had only the (100,200,300) happy-path pin)');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(99n));                     // value to write
  s.push(Integer(-1n));                     // N = -1 (illegal)
  assertThrows(() => lookup('UNPICK').fn(s), /Bad argument value/,
    'session147: -1 UNPICK → Bad argument value (negative-N branch of _toPosIntIndex; distinct from session-137 0-UNPICK pin — guards against a future refactor that only checks n===0)');
}

{
  const s = new Stack();
  s.push(Integer(2n));                      // count alone, no x below
  assertThrows(() => lookup('NDUPN').fn(s), /Too few/,
    'session147: NDUPN with only count on stack → Too few arguments (s.depth<1 guard at ops.js:7255 — distinct from session-137 NDUPN-negative-N reject which fires earlier in _toNonNegIntCount)');
}
