/* Arrow-op alias coverage.

   HP50 has many ops whose canonical name uses a Unicode arrow (→ or
   its reverse), e.g. `→STR`, `R→D`, `C→R`, `→LIST`, `→UNIT`, etc.
   The real HP50 offers no ASCII alternative, but this implementation
   registers ASCII aliases (e.g. `->STR`, `R->D`, `C->R`) so users on
   keyboards without composition support can still reach the op.

   The aliases are the kind of code that silently rots: one half gets
   updated, the other half drifts.  This file pins them down.  For each
   arrow op below we:

     1. Exercise the Unicode form with a representative input.
     2. Exercise the ASCII form with the SAME input on a fresh stack.
     3. Assert the two outputs are structurally identical.

   That gives both a positive happy-path test AND a regression guard
   against the two halves drifting apart.

   Ops covered:
     R→D / R->D            Radians → degrees
     D→R / D->R            Degrees → radians
     R→B / B→R / ->B / ->R Real ↔ BinaryInteger
     →LIST / ->LIST        Compose list from stack
     →STR / ->STR          Value → String
     →V2 / →V3 / ->V2/V3   Compose Vector
     V→ / V->              Decompose Vector
     →Q / ->Q              Real → rational Symbolic
     →Qπ / ->Qπ            Real → rational·π Symbolic
     →HMS / HMS→ + ASCII   Decimal hours ↔ HMS form
     →TAG / ->TAG          Value + tag → Tagged
     →UNIT / ->UNIT        Real + template Unit → Unit
*/

import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Str, Name, Tagged, Unit,
  RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isBinaryInteger, isComplex, isTagged, isUnit,
  isString, isVector, isSymbolic,
} from '../www/src/rpl/types.js';
import { setBinaryBase, resetBinaryState, setWordsize } from '../www/src/rpl/state.js';
import { Fn } from '../www/src/rpl/algebra.js';
import { assert, assertThrows } from './helpers.mjs';

/* Helper: deep-equal for the common RPL value shapes we hit here.
   Purposefully narrow — arrow ops mostly return scalars / vectors
   / strings / tagged, and we want an assertion-free path that lets
   us say "alias produces the same thing as the canonical op". */
function rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  switch (a.type) {
    case 'integer':        return a.value === b.value;
    case 'real':           return a.value.eq(b.value);
    case 'binaryInteger':  return a.value === b.value && a.base === b.base;
    case 'complex':        return a.re === b.re && a.im === b.im;
    case 'string':         return a.value === b.value;
    case 'name':           return a.id === b.id;
    case 'symbolic':       return JSON.stringify(a) === JSON.stringify(b);
    case 'tagged':         return a.tag === b.tag && rplEqual(a.value, b.value);
    case 'vector':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'matrix':
      if (a.rows.length !== b.rows.length) return false;
      for (let i = 0; i < a.rows.length; i++) {
        if (a.rows[i].length !== b.rows[i].length) return false;
        for (let j = 0; j < a.rows[i].length; j++) {
          if (!rplEqual(a.rows[i][j], b.rows[i][j])) return false;
        }
      }
      return true;
    case 'list':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'unit':
      return a.value === b.value && JSON.stringify(a.uexpr) === JSON.stringify(b.uexpr);
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

function run(opName, pre) {
  const s = new Stack();
  for (const v of pre) s.push(v);
  lookup(opName).fn(s);
  return s.peek();
}

const unaryPairs = [
  ['R→D', 'R->D', [Real(Math.PI)], 'R→D(π) ≈ 180'],
  ['D→R', 'D->R', [Real(180)],     'D→R(180) ≈ π'],
  ['→Q',  '->Q',  [Real(0.5)],     '→Q(0.5) → 1/2'],
  ['→Qπ', '->Qπ', [Real(Math.PI / 2)], '→Qπ(π/2) → π/2'],
  ['→HMS', '->HMS', [Real(2.5)],   '→HMS(2.5) → 2.3 (HH.MMSS)'],
  ['HMS→', 'HMS->', [Real(2.3)],   'HMS→(2.3) → 2.5'],
  ['→STR', '->STR', [Real(42)],    '→STR(42) → "42"'],
  ['V→',   'V->',   [Vector([Real(1), Real(2), Real(3)])], 'V→ decomposes 3-vec'],
  ['C→R',  'C->R',  [Complex(3, 4)], 'C→R((3,4)) → 3 on L2, 4 on L1'],
];

for (const [canon, ascii, pre, label] of unaryPairs) {
  const sCanon = new Stack();
  const sAscii = new Stack();
  for (const v of pre) { sCanon.push(v); sAscii.push(v); }
  lookup(canon).fn(sCanon);
  lookup(ascii).fn(sAscii);
  const snapA = sCanon.snapshot();
  const snapB = sAscii.snapshot();
  const ok = snapA.length === snapB.length
         && snapA.every((v, i) => rplEqual(v, snapB[i]));
  assert(ok, `session064: ${canon} and ${ascii} agree — ${label}`);
}

{
  resetBinaryState();
  setWordsize(64);
  setBinaryBase('h');

  const sU = new Stack();
  sU.push(Real(255));
  lookup('R→B').fn(sU);
  const uBI = sU.peek();

  const sA = new Stack();
  sA.push(Real(255));
  lookup('R->B').fn(sA);
  const aBI = sA.peek();

  assert(isBinaryInteger(uBI) && isBinaryInteger(aBI) && rplEqual(uBI, aBI),
    'session064: R→B and R->B both produce the same BinaryInteger (255 → #FFh)');

  const sU2 = new Stack();
  sU2.push(uBI);
  lookup('B→R').fn(sU2);
  const sA2 = new Stack();
  sA2.push(aBI);
  lookup('B->R').fn(sA2);
  assert(rplEqual(sU2.peek(), sA2.peek()) && sU2.peek().value.eq(255),
    'session064: B→R and B->R agree (#FFh → 255.0)');
}

{
  const pre = [Integer(1n), Integer(2n), Integer(3n), Integer(3n)];
  const sU = new Stack(); for (const v of pre) sU.push(v);
  const sA = new Stack(); for (const v of pre) sA.push(v);
  lookup('→LIST').fn(sU);
  lookup('->LIST').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && sU.peek().type === 'list'
         && sU.peek().items.length === 3,
    'session064: →LIST and ->LIST both build the same 3-element list');
}

{
  const sU = new Stack(); sU.push(Real(1)); sU.push(Real(2));
  const sA = new Stack(); sA.push(Real(1)); sA.push(Real(2));
  lookup('→V2').fn(sU);
  lookup('->V2').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isVector(sU.peek())
         && sU.peek().items.length === 2,
    'session064: →V2 and ->V2 both compose [1 2]');

  const tU = new Stack(); tU.push(Real(1)); tU.push(Real(2)); tU.push(Real(3));
  const tA = new Stack(); tA.push(Real(1)); tA.push(Real(2)); tA.push(Real(3));
  lookup('→V3').fn(tU);
  lookup('->V3').fn(tA);
  assert(rplEqual(tU.peek(), tA.peek()) && isVector(tU.peek())
         && tU.peek().items.length === 3,
    'session064: →V3 and ->V3 both compose [1 2 3]');
}

{
  const sU = new Stack(); sU.push(Real(3.14)); sU.push(Str('pi'));
  const sA = new Stack(); sA.push(Real(3.14)); sA.push(Str('pi'));
  lookup('→TAG').fn(sU);
  lookup('->TAG').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isTagged(sU.peek())
         && sU.peek().tag === 'pi',
    'session064: →TAG and ->TAG both attach tag "pi"');
}

{
  // The unit template lives at L1; the value is at L2.  We construct
  // a Unit with value=1 just to supply the uexpr.
  const tmpl = Unit(1, { kind: 'atom', name: 'm' });
  const sU = new Stack(); sU.push(Real(5)); sU.push(tmpl);
  const sA = new Stack(); sA.push(Real(5)); sA.push(tmpl);
  lookup('→UNIT').fn(sU);
  lookup('->UNIT').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isUnit(sU.peek())
         && sU.peek().value === 5,
    'session064: →UNIT and ->UNIT both produce 5_m');
}

{
  // session364: ->UNIT is a delegating wrapper (`OPS.get('→UNIT').fn(s)`),
  // not a shared fn reference, so its rejections route through the canonical
  // and would silently break if the alias were reimplemented inline.  s064
  // pinned only the happy-path equivalence; pin both operand-position rejects.
  const tmpl = Unit(1, { kind: 'atom', name: 'm' });
  // L1 (template) not a Unit → →UNIT's `!isUnit(u)` guard.
  assertThrows(() => { const s = new Stack(); s.push(Real(5)); s.push(Real(2)); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-Unit template (Real) → Bad argument type');
  assertThrows(() => { const s = new Stack(); s.push(Real(5)); s.push(Str('m')); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-Unit template (String) → Bad argument type');
  assertThrows(() => { const s = new Stack(); s.push(Real(5)); s.push(Vector([Real(1)])); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-Unit template (Vector) → Bad argument type');
  // L2 (value) not Real/Integer → →UNIT's `_numVal` guard.
  assertThrows(() => { const s = new Stack(); s.push(Str('x')); s.push(tmpl); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-numeric value (String) → Bad argument type');
  assertThrows(() => { const s = new Stack(); s.push(Vector([Real(1)])); s.push(tmpl); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-numeric value (Vector) → Bad argument type');
  assertThrows(() => { const s = new Stack(); s.push(Unit(1, { kind: 'atom', name: 's' })); s.push(tmpl); lookup('->UNIT').fn(s); },
    'Bad argument type', 'session364: ->UNIT non-numeric value (Unit) → Bad argument type');
  // Positive Integer value still flows through the delegation.
  const s = new Stack(); s.push(Integer(7n)); s.push(tmpl); lookup('->UNIT').fn(s);
  assert(isUnit(s.peek()) && s.peek().value === 7,
    'session364: ->UNIT Integer(7) value flows through delegation → 7_m');
  // The alias delegates (distinct wrapper), it is not the canonical fn reference.
  assert(lookup('->UNIT').fn !== lookup('→UNIT').fn,
    'session364: ->UNIT is a delegating wrapper, not the canonical fn reference');
}

{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('→Q').fn(s);
  assert(isSymbolic(s.peek()),
    'session064: →Q(0.25) returns a Symbolic (=1/4)');
}

{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('→HMS').fn(s);
  lookup('HMS→').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 2.5) < 1e-12,
    'session064: →HMS / HMS→ round-trip preserves 2.5');
}

{
  let bothThrew = 0;
  for (const op of ['R→B', 'R->B']) {
    const s = new Stack();
    s.push(Str('oops'));
    try { lookup(op).fn(s); } catch (e) {
      if (/Bad argument type/.test(e.message)) bothThrew++;
    }
  }
  assert(bothThrew === 2,
    'session064: R→B and R->B both reject String with Bad argument type');
}

// session430: reject-symmetry across the four bitwise R↔B converters.
// `B→R`/`B->R`/`R→B`/`R->B` are FOUR independent `register(...)` closures
// (probed: `lookup('B→R').fn !== lookup('B->R').fn`, same for R↔B), each
// re-deriving its own type guard — not the shared-fn-instance shape of
// C→R/C→P.  Prior coverage was lopsided: session064 above pins only the
// String reject of R→B/R->B (not Complex/BinInt), and test-binary-int's
// B→R-on-Real / R→B-on-BinInt rejects use a loose `null` matcher and never
// touch the ASCII aliases at all.  So a refactor dropping the guard from one
// alias closure — e.g. `B->R` silently accepting a Real, or `R->B` accepting
// a Complex — would pass every prior pin.  B→R/B->R accept only BinaryInteger
// (reject Real/Integer/Complex/String); R→B/R->B accept Real/Integer (reject
// Complex/String/BinInt).  All rejects are `Bad argument type`, CAS-free.
{
  const bRejects = { Real: () => Real(3), Integer: () => Integer(3n),
    Complex: () => Complex(1, 2), String: () => Str('x') };
  for (const op of ['B→R', 'B->R']) {
    for (const [name, mk] of Object.entries(bRejects)) {
      const s = new Stack();
      s.push(mk());
      assertThrows(() => lookup(op).fn(s), 'Bad argument type',
        `session430: ${op} on ${name} → Bad argument type`);
    }
  }

  const rRejects = { Complex: () => Complex(1, 2), String: () => Str('x'),
    BinInt: () => BinaryInteger(5n, 'h') };
  for (const op of ['R→B', 'R->B']) {
    for (const [name, mk] of Object.entries(rRejects)) {
      const s = new Stack();
      s.push(mk());
      assertThrows(() => lookup(op).fn(s), 'Bad argument type',
        `session430: ${op} on ${name} → Bad argument type`);
    }
  }
}

// session343: rejection-path coverage for the ASCII conversion aliases
// `->Q` / `->Qπ` / `Q->`.  session064 above pins only their happy-path
// equivalence to the Unicode canonicals; the canonicals' own rejections
// are pinned (session047/048/052 in test-numerics.mjs) but the ASCII
// aliases — separate `lookup(canonical).fn(s)` registrations — never had
// rejection coverage.  Each rejection here throws inside the canonical's
// validators with NO CAS involvement, so a future inline reimplementation
// of an alias that drops the delegation is caught.
{
  // `->Q` inherits →Q's type guard (non-Real/Integer → Bad argument type)
  // and finiteness guard (∞ → Bad argument value).
  const sType = new Stack();
  sType.push(Complex(1, 2));
  assertThrows(() => { lookup('->Q').fn(sType); }, /Bad argument type/,
               'session343: ->Q on Complex → Bad argument type (→Q type guard)');
  const sInf = new Stack();
  sInf.push(Real(Infinity));
  assertThrows(() => { lookup('->Q').fn(sInf); }, /Bad argument value/,
               'session343: ->Q on ∞ → Bad argument value (→Q finiteness guard)');

  // `->Qπ` shares the same two guards.
  const pType = new Stack();
  pType.push(Complex(1, 2));
  assertThrows(() => { lookup('->Qπ').fn(pType); }, /Bad argument type/,
               'session343: ->Qπ on Complex → Bad argument type (→Qπ type guard)');
  const pInf = new Stack();
  pInf.push(Real(Infinity));
  assertThrows(() => { lookup('->Qπ').fn(pInf); }, /Bad argument value/,
               'session343: ->Qπ on ∞ → Bad argument value (→Qπ finiteness guard)');

  // `Q->` inherits Q→'s non-integer-Real → Bad argument value, non-q-shape
  // Symbolic → Bad argument type, and non-Symbolic/numeric → Bad argument type.
  const qReal = new Stack();
  qReal.push(Real(3.14));
  assertThrows(() => { lookup('Q->').fn(qReal); }, /Bad argument value/,
               'session343: Q-> on non-integer Real → Bad argument value (Q→ value guard)');
  const qShape = new Stack();
  qShape.push(Symbolic(Fn('SIN', [{ kind: 'var', name: 'X' }])));
  assertThrows(() => { lookup('Q->').fn(qShape); }, /Bad argument type/,
               'session343: Q-> on SIN(X) → Bad argument type (Q→ shape guard)');
  const qType = new Stack();
  qType.push(Complex(1, 2));
  assertThrows(() => { lookup('Q->').fn(qType); }, /Bad argument type/,
               'session343: Q-> on Complex → Bad argument type (Q→ type guard)');
}

// session350: rejection-path coverage for the two remaining un-swept
// thin-wrapper aliases — `->TAG` (ASCII alias of `→TAG`) and `!` (postfix
// factorial alias of `FACT`).  Both are pure `lookup(canonical).fn(s)`
// delegations; session064 pins `->TAG`'s happy-path equivalence to `→TAG`
// but neither alias ever had a rejection pin, so an inline reimplementation
// that drops the delegation would pass green.  Each rejection throws inside
// the canonical's validators with NO CAS involvement.
{
  // `->TAG` inherits →TAG's `_asTagString` guard: the level-1 tag must be a
  // String or Name, else Bad argument type.  Assert the alias and canonical
  // reject the same bad tag identically.
  const aReal = new Stack(); aReal.push(Real(5)); aReal.push(Real(1));
  assertThrows(() => { lookup('->TAG').fn(aReal); }, /Bad argument type/,
               'session350: ->TAG with Real tag → Bad argument type (→TAG _asTagString guard)');
  const uReal = new Stack(); uReal.push(Real(5)); uReal.push(Real(1));
  assertThrows(() => { lookup('→TAG').fn(uReal); }, /Bad argument type/,
               'session350: →TAG with Real tag → Bad argument type (canonical, same reject)');
  const aVec = new Stack(); aVec.push(Real(5)); aVec.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('->TAG').fn(aVec); }, /Bad argument type/,
               'session350: ->TAG with Vector tag → Bad argument type');

  // `!` delegates to FACT: Complex (and other non-numeric/non-symbolic) →
  // Bad argument type, negative Integer → Bad argument value, negative
  // integer-valued Real → Infinite result (gamma pole).
  const bC = new Stack(); bC.push(Complex(1, 2));
  assertThrows(() => { lookup('!').fn(bC); }, /Bad argument type/,
               'session350: ! on Complex → Bad argument type (FACT type guard)');
  const fC = new Stack(); fC.push(Complex(1, 2));
  assertThrows(() => { lookup('FACT').fn(fC); }, /Bad argument type/,
               'session350: FACT on Complex → Bad argument type (canonical, same reject)');
  const bNeg = new Stack(); bNeg.push(Integer(-3n));
  assertThrows(() => { lookup('!').fn(bNeg); }, /Bad argument value/,
               'session350: ! on Integer(-3) → Bad argument value (FACT negative-integer)');
  const bPole = new Stack(); bPole.push(Real(-2));
  assertThrows(() => { lookup('!').fn(bPole); }, /Infinite result/,
               'session350: ! on Real(-2) → Infinite result (FACT gamma pole)');
  const bStr = new Stack(); bStr.push(Str('x'));
  assertThrows(() => { lookup('!').fn(bStr); }, /Bad argument type/,
               'session350: ! on String → Bad argument type');
}

// session370: rejection-path coverage for the last two un-swept thin-wrapper
// arrow aliases — `->PRG` (ASCII alias of `→PRG`) and `->NUM` (ASCII alias of
// `→NUM`).  Both are delegating wrappers (`OPS.get(canonical).fn(s)`), distinct
// fn references — not shared — so an inline reimplementation that dropped the
// delegation would pass green.  `->PRG`'s happy path is pinned in
// test-reflection (session067), `->NUM`'s in test-algebra (session200), but
// neither alias ever had a rejection pin under its own name.  Every reject here
// fires inside the canonical's guards with NO CAS involvement.
{
  // `->PRG` inherits →PRG's _toCountIdx guards plus the n<0 / popN-underflow
  // checks: String count → Bad argument type, negative or fractional Real/Integer
  // count → Bad argument value, count > stack depth → Too few arguments.
  assertThrows(() => { const s = new Stack(); s.push(Integer(1n)); s.push(Integer(2n)); s.push(Integer(-1n)); lookup('->PRG').fn(s); },
    'Bad argument value', 'session370: ->PRG negative count → Bad argument value (→PRG n<0 guard)');
  assertThrows(() => { const s = new Stack(); s.push(Integer(1n)); s.push(Str('x')); lookup('->PRG').fn(s); },
    'Bad argument type', 'session370: ->PRG String count → Bad argument type (→PRG _toCountIdx guard)');
  assertThrows(() => { const s = new Stack(); s.push(Integer(1n)); s.push(Integer(2n)); s.push(Real(2.5)); lookup('->PRG').fn(s); },
    'Bad argument value', 'session370: ->PRG fractional Real count → Bad argument value (→PRG _toCountIdx integrality)');
  assertThrows(() => { const s = new Stack(); s.push(Integer(1n)); s.push(Integer(2n)); s.push(Integer(5n)); lookup('->PRG').fn(s); },
    'Too few arguments', 'session370: ->PRG count exceeding stack depth → Too few arguments (popN underflow)');
  // Positive delegation: a valid count still builds the Program through the alias.
  const sOk = new Stack(); sOk.push(Integer(1n)); sOk.push(Integer(2n)); sOk.push(Integer(2n));
  lookup('->PRG').fn(sOk);
  assert(sOk.peek().type === 'program' && sOk.peek().tokens.length === 2,
    'session370: ->PRG Integer(2) count flows through delegation → 2-token Program');
  assert(lookup('->PRG').fn !== lookup('→PRG').fn,
    'session370: ->PRG is a delegating wrapper, not the canonical fn reference');

  // `->NUM` delegates to →NUM → EVAL (APPROX-forced) with no scalar type guard,
  // so its rejection surface is EVAL's empty-stack underflow.
  assertThrows(() => { lookup('->NUM').fn(new Stack()); }, 'Too few arguments',
    'session370: ->NUM on empty stack → Too few arguments (→NUM/EVAL underflow)');
  assert(lookup('->NUM').fn !== lookup('→NUM').fn,
    'session370: ->NUM is a delegating wrapper, not the canonical fn reference');
}

// session423: rejection-path coverage for the angle-conversion family
// `R→D` / `D→R` and their ASCII aliases `R->D` / `D->R`.  Unlike the
// delegating-wrapper aliases above (`->UNIT`, `->PRG`, `->NUM`) and the
// shared-fn-instance aliases (`C->R`, `->V2`), each ASCII form here is its
// own independent `unaryReal(...)` registration (a THIRD shape) — a separate
// closure that re-derives the same `toRealOrThrow` guard rather than borrowing
// the canonical's.  session064's unaryPairs pins only the happy-path
// equivalence, so the shared rejection contract was never exercised: a refactor
// dropping the `toRealOrThrow` guard from one closure but not the other would
// pass every prior pin.  Every reject fires inside `toRealOrThrow` with NO CAS
// involvement.
{
  // The aliases are distinct fn instances (independent unaryReal closures),
  // not the canonical fn reference and not delegating wrappers.
  assert(lookup('R->D').fn !== lookup('R→D').fn,
    'session423: R->D is an independent unaryReal instance, not the canonical fn reference');
  assert(lookup('D->R').fn !== lookup('D→R').fn,
    'session423: D->R is an independent unaryReal instance, not the canonical fn reference');

  // All four reject non-real scalars through toRealOrThrow: String / Vector /
  // Matrix / im≠0 Complex → Bad argument type.  (List distributes element-wise
  // via _withListUnary and a real-valued Complex coerces, so neither rejects —
  // pinning the rejecting shapes guards the guard, not the widening.)
  for (const op of ['R→D', 'R->D', 'D→R', 'D->R']) {
    assertThrows(() => { const s = new Stack(); s.push(Str('x')); lookup(op).fn(s); },
      'Bad argument type', `session423: ${op} on String → Bad argument type (toRealOrThrow guard)`);
    assertThrows(() => { const s = new Stack(); s.push(Vector([Real(1), Real(2)])); lookup(op).fn(s); },
      'Bad argument type', `session423: ${op} on Vector → Bad argument type`);
    assertThrows(() => { const s = new Stack(); s.push(Matrix([[Real(1)]])); lookup(op).fn(s); },
      'Bad argument type', `session423: ${op} on Matrix → Bad argument type`);
    assertThrows(() => { const s = new Stack(); s.push(Complex(1, 2)); lookup(op).fn(s); },
      'Bad argument type', `session423: ${op} on im≠0 Complex → Bad argument type`);
  }
}
