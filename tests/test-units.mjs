import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Unit, isReal, isUnit, isInteger,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatSource } from '../www/src/rpl/formatter.js';
import {
  parseUnitExpr, formatUnitExpr, normalizeUexpr,
  multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr,
  sameDims, scaleOf, toBaseUexpr, uexprEqual, unitSize,
} from '../www/src/rpl/units.js';
import { assert, assertThrows, runLine } from './helpers.mjs';

{
  const u = parseUnitExpr('m');
  assert(u.length === 1 && u[0][0] === 'm' && u[0][1] === 1,
         `parse 'm' → [[m,1]]`);
}
{
  const u = parseUnitExpr('m/s^2');
  assert(u.length === 2 && u[0][0] === 'm' && u[0][1] === 1
      && u[1][0] === 's' && u[1][1] === -2,
         `parse 'm/s^2' → [[m,1],[s,-2]]`);
}
{
  // HP50 left-to-right: '/' inverts only the immediately next factor.
  const u = parseUnitExpr('m/s*s');
  assert(u.length === 1 && u[0][0] === 'm' && u[0][1] === 1,
         `parse 'm/s*s' cancels s → [[m,1]] (got ${JSON.stringify(u)})`);
}
{
  const u = parseUnitExpr('kg*m/s^2');
  const syms = u.map(([s]) => s).join(',');
  assert(syms === 'kg,m,s', `parse 'kg*m/s^2' sorted alphabetically: ${syms}`);
  const sMap = new Map(u);
  assert(sMap.get('kg') === 1 && sMap.get('m') === 1 && sMap.get('s') === -2,
         `parse 'kg*m/s^2' exponents`);
}
{
  assertThrows(() => parseUnitExpr('foobar'), null,
    `parseUnitExpr rejects unknown symbol`);
}

{
  const m_per_s = parseUnitExpr('m/s');
  const s       = parseUnitExpr('s');
  const prod    = multiplyUexpr(m_per_s, s);
  assert(prod.length === 1 && prod[0][0] === 'm' && prod[0][1] === 1,
         `(m/s) * s → m`);
}
{
  const m_per_s2 = parseUnitExpr('m/s^2');
  const inv = inverseUexpr(m_per_s2);
  const map = new Map(inv);
  assert(map.get('m') === -1 && map.get('s') === 2,
         `inverse of m/s^2 is s^2/m`);
}
{
  const sq = powerUexpr(parseUnitExpr('m'), 2);
  assert(sq[0][0] === 'm' && sq[0][1] === 2, `m^2`);
}
{
  assert(sameDims(parseUnitExpr('ft'), parseUnitExpr('m')),
         `ft and m are dimensionally equal`);
  assert(!sameDims(parseUnitExpr('m'), parseUnitExpr('s')),
         `m and s differ`);
}

{
  const vals = parseEntry('9.8_m/s^2');
  assert(Array.isArray(vals) && vals.length === 1 && isUnit(vals[0]),
         `'9.8_m/s^2' parses to a single Unit`);
  assert(Math.abs(vals[0].value - 9.8) < 1e-12, `value is 9.8`);
}
{
  const vals = parseEntry('1_kg*m/s^2');
  assert(vals.length === 1 && isUnit(vals[0]), `kg*m/s^2 parses`);
  const map = new Map(vals[0].uexpr);
  assert(map.get('kg') === 1 && map.get('m') === 1 && map.get('s') === -2,
         `Newton-shape uexpr`);
}
{
  assertThrows(() => parseEntry('1_zzz'), null,
    `'1_zzz' (unknown unit) throws`);
}

{
  const u = Unit(9.8, parseUnitExpr('m/s^2'));
  const s = format(u);
  assert(s.includes('9.8') && s.includes('_m/s^2'),
         `format Unit 9.8_m/s^2 → '${s}'`);
}
{
  const u = Unit(1, parseUnitExpr('kg*m/s^2'));
  const s = format(u);
  assert(s.includes('_kg*m/s^2'),
         `format Unit 1_kg*m/s^2 → '${s}'`);
}
{
  // Two negative factors get parens so the output round-trips.
  const u = Unit(2, parseUnitExpr('m/s^2/kg'));
  const fu = formatUnitExpr(u.uexpr);
  assert(fu.includes('/(') || fu.startsWith('1/('),
         `denominator with multiple factors parenthesised: '${fu}'`);
  const reparsed = parseUnitExpr(fu);
  assert(uexprEqual(u.uexpr, reparsed), `round-trip: ${fu}`);
}

{
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  s.push(parseEntry('500_m')[0]);
  lookup('+').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.uexpr[0][0] === 'm' && r.value === 1500,
         `1_km + 500_m → 1500_m (the sum is in level 1's unit; got ${JSON.stringify(r)})`);
}
{
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  s.push(parseEntry('1_s')[0]);
  assertThrows(() => lookup('+').fn(s), null,
    `1_m + 1_s throws Inconsistent units`);
}
{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Real(3));
  lookup('*').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 6 && r.uexpr[0][0] === 'm',
         `2_m * 3 → 6_m`);
}
{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(parseEntry('3_s')[0]);
  lookup('*').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 6,
         `2_m * 3_s → Unit 6 (got value ${r.value})`);
  const map = new Map(r.uexpr);
  assert(map.get('m') === 1 && map.get('s') === 1,
         `...with uexpr m*s`);
}
{
  const s = new Stack();
  s.push(parseEntry('6_m')[0]);
  s.push(parseEntry('2_m')[0]);
  lookup('/').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value.eq(3),
         `6_m / 2_m → Real(3) (got ${JSON.stringify(r)})`);
}
{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Integer(3));
  lookup('^').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 8 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === 3,
         `2_m ^ 3 → 8_m^3`);
}

{
  const s = new Stack();
  s.push(parseEntry('5_m')[0]);
  lookup('NEG').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === -5 && r.uexpr[0][0] === 'm',
         `NEG 5_m → -5_m`);
}
{
  const s = new Stack();
  s.push(parseEntry('-5_m')[0]);
  lookup('ABS').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 5, `ABS -5_m → 5_m`);
}
{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  lookup('INV').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 0.5 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === -1,
         `INV 2_m → 0.5_1/m`);
}
{
  const s = new Stack();
  s.push(parseEntry('3_m')[0]);
  lookup('SQ').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 9 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === 2,
         `SQ 3_m → 9_m^2`);
}

{
  const s = new Stack();
  s.push(parseEntry('3.5_km')[0]);
  lookup('UVAL').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value.eq(3.5), `UVAL 3.5_km → Real(3.5)`);
}
{
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  lookup('UBASE').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 1000 && r.uexpr[0][0] === 'm',
         `UBASE 1_km → 1000_m (got ${JSON.stringify(r)})`);
}
{
  const s = new Stack();
  s.push(parseEntry('1_N')[0]);
  lookup('UBASE').fn(s);
  const r = s.peek();
  const map = new Map(r.uexpr);
  assert(isUnit(r) && Math.abs(r.value - 1) < 1e-12
      && map.get('kg') === 1 && map.get('m') === 1 && map.get('s') === -2,
         `UBASE 1_N → 1_kg*m/s^2`);
}
{
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  s.push(parseEntry('1_ft')[0]);
  lookup('CONVERT').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.uexpr[0][0] === 'ft',
         `CONVERT result in ft`);
  assert(Math.abs(r.value - 3280.8398950131) < 1e-6,
         `1_km converts to ≈3280.84_ft (got ${r.value})`);
}
{
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  s.push(parseEntry('1_s')[0]);
  assertThrows(() => lookup('CONVERT').fn(s), null,
    `CONVERT m → s throws`);
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(parseEntry('1_kg')[0]);
  lookup('→UNIT').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 5 && r.uexpr[0][0] === 'kg',
         `5 1_kg →UNIT → 5_kg`);
}

{
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  lookup('TYPE').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value.eq(13), `TYPE of a Unit is 13 (got ${r.value})`);
}

/* ================================================================
   session137: Unit op surface — symmetric / composite / mixed-dim
   coverage closure.

   The session-prior block has the canonical happy-path pins for
   `+ * /` and `^ NEG ABS INV SQ`, plus error pins for `+` mixed
   dims and `CONVERT` mixed dims.  This block fills the obvious
   omissions a future regression could slip past:

     • `-` (subtraction) was never exercised.  Same-unit
       (`5_m - 2_m → 3_m`) and cross-scale (`1_km - 500_m →
       0.5_km`, mirrors the existing `+` cross-scale pin).
     • `Real * Unit` (left-Real reorder).  The existing pin
       only covers `Unit * Real`; the symmetric `3 * 2_m → 6_m`
       form catches a regression that special-cases the
       Unit-on-L1 dispatch.
     • `Unit / Real` — existing pins cover Unit*Real and
       Unit/Unit dimensionless but not the scalar-divisor case
       (`6_m / 2 → 3_m`).
     • `Unit / Unit` mixed dims — existing pin only covers
       same-dim cancellation (`6_m / 2_m → Real(3)`); the
       composite-uexpr case (`6_m / 2_s → 3_m/s`) goes through
       `multiplyUexpr(_, inverseUexpr(_))` and was unpinned.
     • `INV` on a composite Unit (`INV 2_m/s → 0.5_s/m`) —
       existing INV pin is single-atom only.
     • `SQ` on a composite Unit (`SQ 3_m/s → 9_m^2/s^2`) —
       existing SQ pin is single-atom only.
     • `NEG` on a Newton (composite uexpr derived from a unit
       alias) — the existing NEG pin is single-atom only;
       `1_N` exercises the path where the `uexpr` array has
       more than one factor.
     • `Unit / 0` → Infinite result.  Distinct error path
       from "Inconsistent units" — the divide-by-zero check
       on the Real branch must surface for Unit/Real too.
   ================================================================ */

{
  const s = new Stack();
  s.push(parseEntry('5_m')[0]);
  s.push(parseEntry('2_m')[0]);
  lookup('-').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 3) < 1e-12 && r.uexpr[0][0] === 'm',
    `session137: 5_m - 2_m → 3_m (got ${JSON.stringify(r)})`);
}

{
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  s.push(parseEntry('500_m')[0]);
  lookup('-').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.uexpr[0][0] === 'm' && r.value === 500,
    `session137: 1_km - 500_m → 500_m (subtraction mirror of the + cross-scale pin; got ${JSON.stringify(r)})`);
}

{
  const s = new Stack();
  s.push(Real(3));
  s.push(parseEntry('2_m')[0]);
  lookup('*').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 6) < 1e-12 && r.uexpr[0][0] === 'm',
    `session137: 3 * 2_m → 6_m (Real*Unit; symmetric to Unit*Real)`);
}

{
  const s = new Stack();
  s.push(parseEntry('6_m')[0]);
  s.push(Real(2));
  lookup('/').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 3) < 1e-12
      && r.uexpr.length === 1 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === 1,
    `session137: 6_m / 2 → 3_m (Unit/Real keeps uexpr, scales value)`);
}

{
  const s = new Stack();
  s.push(parseEntry('6_m')[0]);
  s.push(parseEntry('2_s')[0]);
  lookup('/').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 3) < 1e-12,
    `session137: 6_m / 2_s value → 3 (got ${r.value})`);
  const map = new Map(r.uexpr);
  assert(map.get('m') === 1 && map.get('s') === -1,
    `session137: 6_m / 2_s uexpr → m^1 * s^-1 (composite via multiplyUexpr+inverseUexpr)`);
}

{
  const s = new Stack();
  s.push(parseEntry('2_m/s')[0]);
  lookup('INV').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 0.5) < 1e-12,
    `session137: INV 2_m/s value → 0.5 (got ${r.value})`);
  const map = new Map(r.uexpr);
  assert(map.get('m') === -1 && map.get('s') === 1,
    `session137: INV 2_m/s uexpr → s/m (each exponent flipped — composite inversion, not just scalar)`);
}

{
  const s = new Stack();
  s.push(parseEntry('3_m/s')[0]);
  lookup('SQ').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 9) < 1e-12,
    `session137: SQ 3_m/s value → 9 (got ${r.value})`);
  const map = new Map(r.uexpr);
  assert(map.get('m') === 2 && map.get('s') === -2,
    `session137: SQ 3_m/s uexpr → m^2/s^2 (powerUexpr applied to all factors)`);
}

{
  const s = new Stack();
  s.push(parseEntry('1_N')[0]);
  lookup('NEG').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - (-1)) < 1e-12 && r.uexpr[0][0] === 'N',
    `session137: NEG 1_N → -1_N (NEG keeps uexpr atomic-N intact, only flips value)`);
}

{
  const s = new Stack();
  s.push(parseEntry('6_m')[0]);
  s.push(Real(0));
  assertThrows(() => lookup('/').fn(s), /Infinite result/,
    `session137: 6_m / 0 → Infinite result (zero-divisor check applies on the Unit/Real branch too)`);
}

/* ================================================================
   session147: Unit op surface — mixed-dim subtraction reject +
   different-dim-pair add reject + composite-ABS + ^ negative-
   exponent / zero-exponent edge coverage closure.

   The session-prior block has the canonical happy-path pins for
   `+ - * / ^ NEG ABS INV SQ`, plus error pins for `+` mixed dims
 (m vs s) and `CONVERT` mixed dims, and added `-`
   positive coverage (same-unit + cross-scale).  Four gaps remain:

     • `-` (subtraction) mixed-dim reject was never pinned.
       The `+` mixed-dim pin at line 144 (`1_m + 1_s` →
       Inconsistent units) covers the additive arm; the
       subtractive arm has its own dispatch and a refactor
       that special-cased the additive sign branch and forgot
       the subtractive sign branch would slip past today's
       coverage.
     • `+` mixed-dim with a *different dim pair* (mass vs
       length, e.g. `1_kg + 1_m`).  The existing `m vs s`
       pin only exercises one combination; a defensive second
       pin guards against a refactor that special-cased the
       length-vs-time pair.
     • `ABS` on a composite-uexpr Unit (`-1_N`) — the existing
       ABS pin at line 207 is `-5_m` (single-atom uexpr); ABS
       on a Newton-shaped uexpr exercises the path where the
       value is signed but the multi-factor uexpr stays
 intact. Mirror of 's `NEG -1_N` composite-
       NEG pin on the ABS arm.
     • `Unit ^ negative integer` (`2_m ^ -1`) and `Unit ^ 0`
       (`2_m ^ 0`).  The existing `^` pin uses a positive
       exponent (3); negative exponents flip the uexpr sign
       (closing the inverseUexpr path through the powerUexpr
       composition), and zero-exponent collapses every uexpr
       factor to power 0 → empty uexpr → dimensionless
       result, which the formatter unwraps to a bare Real(1).
       Both edge cases were unpinned.
   ================================================================ */

{
  const s = new Stack();
  s.push(parseEntry('5_m')[0]);
  s.push(parseEntry('1_s')[0]);
  assertThrows(() => lookup('-').fn(s), /Inconsistent units/,
    `session147: 5_m - 1_s → Inconsistent units ('-' subtractive-arm reject; existing s064 pin only covers '+' additive arm)`);
}

{
  const s = new Stack();
  s.push(parseEntry('1_kg')[0]);
  s.push(parseEntry('1_m')[0]);
  assertThrows(() => lookup('+').fn(s), /Inconsistent units/,
    `session147: 1_kg + 1_m → Inconsistent units (different dim pair than the existing m-vs-s pin; defense against a refactor that special-cased length-vs-time)`);
}

{
  const s = new Stack();
  s.push(parseEntry('-1_N')[0]);
  lookup('ABS').fn(s);
  const r = s.peek();
  assert(isUnit(r) && Math.abs(r.value - 1) < 1e-12 && r.uexpr[0][0] === 'N',
    `session147: ABS -1_N → 1_N (composite-uexpr ABS keeps the Newton-alias uexpr intact, only flips sign; mirror of session-137's NEG -1_N pin on the ABS arm)`);
}

{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Integer(-1n));
  lookup('^').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 0.5 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === -1,
    `session147: 2_m ^ -1 → 0.5_m^-1 (negative-exponent power flips uexpr sign via powerUexpr; existing ^ pin uses positive 3)`);
}

{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Integer(0n));
  lookup('^').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value.eq(1),
    `session147: 2_m ^ 0 → Real(1) (zero-exponent collapses uexpr to empty → unwraps to dimensionless Real(1); previously unpinned edge of the ^ dispatch)`);
}

/* session422 (code-review, R-026): normalizeUexpr is imported here but never
   called directly — every prior pin reaches it only through parseUnitExpr /
   multiplyUexpr / inverseUexpr / powerUexpr, all of which feed it factor lists
   that are already single-symbol or already sorted. So the four arms the
   units.js file-header documents as the canonical-uexpr contract ("a canonical,
   frozen array of [symbol, exponent] tuples, sorted alphabetically by symbol,
   with zero-exponent factors dropped") were never positively exercised on a raw
   multi-symbol input: merging duplicate symbols, dropping a merged-to-zero
   factor, sorting an out-of-order list, and the deep freeze (each tuple + the
   outer array). A refactor dropping the merge, the zero-filter, the sort, or
   either Object.freeze would pass every prior pin. Probed all arms live first. */
{
  const merged = normalizeUexpr([['m', 1], ['m', 2]]);
  assert(merged.length === 1 && merged[0][0] === 'm' && merged[0][1] === 3,
    `session422: normalizeUexpr merges duplicate symbols ([m,1],[m,2] → [m,3])`);

  const dropped = normalizeUexpr([['m', 1], ['m', -1]]);
  assert(dropped.length === 0,
    `session422: normalizeUexpr drops a factor that merges to exponent 0 ([m,1],[m,-1] → [])`);

  const sorted = normalizeUexpr([['s', -2], ['kg', 1], ['m', 1]]);
  assert(sorted.map(([s]) => s).join(',') === 'kg,m,s',
    `session422: normalizeUexpr sorts factors alphabetically by symbol`);

  const frozen = normalizeUexpr([['m', 1], ['s', -1]]);
  assert(Object.isFrozen(frozen) && Object.isFrozen(frozen[0]),
    `session422: normalizeUexpr deep-freezes the outer array and each tuple`);
  assertThrows(() => { frozen.push(['kg', 1]); }, null,
    `session422: normalizeUexpr result rejects a push (outer array frozen)`);
  assertThrows(() => { frozen[0][1] = 99; }, null,
    `session422: normalizeUexpr result rejects a tuple mutation (tuple frozen)`);

  assertThrows(() => normalizeUexpr([['foobar', 1]]), null,
    `session422: normalizeUexpr throws on an unknown symbol`);

  const empty = normalizeUexpr([]);
  assert(empty.length === 0 && Object.isFrozen(empty),
    `session422: normalizeUexpr([]) → frozen empty uexpr`);
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assert(unitLine('5_ft 9_in +') === '69._in' && unitLine('25_ft 8_in -') === '292._in',
    'AUR: 5_ft 9_in + is 69_in and 25_ft 8_in - is 292_in (the result is in level 1\'s unit)');
  assert(unitLine('0.03_ft DUP -') === '0._ft' && unitLine('1_ft 12_in -') === '0._in' && unitLine('0.1_m 0.2_m + 0.3_m ==') === '1.',
    'a unit magnitude has 12 digits, so a value minus itself or its conversion is zero');
  assert(unitLine('3_yd 1_ft CONVERT IP') === '9._ft' && unitLine('1_km 1000_m CONVERT') === '1000._m',
    'CONVERT rounds to 12 digits, so 3_yd 1_ft CONVERT IP is 9');
  assert(unitLine('1_m 100_cm ==') === '1.' && unitLine('1_m 100_cm SAME') === '0.' && unitLine('1_m 1_s ==') === '0.' && unitLine('1_m 1_s ≠') === '1.',
    '== converts units while SAME wants the same ones, and different dimensions are never equal');
  assert(unitLine('1_m 50_cm >') === '1.' && unitLine('50_cm 1_m <') === '1.' && unitLine('1_ft 12_in ≤') === '1.',
    '< > ≤ ≥ convert both units');
  assertThrows(() => runLine('1_m 1_s <'), /Inconsistent units/, 'ordering units of different dimensions is Inconsistent units');
  assert(unitLine('0.5_1/m') === '0.5_1/m' && unitLine('2_m INV DUP ->STR STR→ DROP') === '0.5_1/m',
    'a unit with only a denominator (1/m) enters, prints and reads back');
  assert(unitLine('2_m 1 2 / *') === '1._m', 'a rational multiplies a unit');
  assert(unitLine('1_m 9_cm MAX') === '1._m' && unitLine('1_m 9_cm MIN') === '9._cm' && unitLine('9_cm 1_m MAX') === '1._m',
    'AUR: 1_m 9_cm MAX is 1_m and MIN is 9_cm, each in the unit it was given');
  assertThrows(() => runLine('1_m 1_s MAX'), /Inconsistent units/, 'MAX of units of different dimensions is Inconsistent units');
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assert(unitLine('5_kJ 1_J CONVERT') === '5000._J' && unitLine('1_MHz 1_Hz CONVERT') === '1000000._Hz'
    && unitLine('1_hPa 1_Pa CONVERT') === '100._Pa' && unitLine('3_dm 1_cm CONVERT') === '30._cm'
    && unitLine('1_dam 1_m CONVERT') === '10._m' && unitLine('1_Dm 1_m CONVERT') === '10._m',
    'an SI prefix goes before a prefixable unit: kJ, MHz, hPa, dm, dam and the HP\'s D for deka');
  assert(unitLine('1_\u03BCm 1_nm CONVERT') === '1000._nm' && unitLine('1_\u00B5s 1_us CONVERT') === '1._us'
    && unitLine('1_uA 1_A CONVERT') === '0.000001_A' && unitLine('1_k\u2126 1_\u03A9 CONVERT') === '1000._\u03A9',
    'micro is \u03BC, the micro sign \u00B5 or u, and the ohm sign is the Greek capital omega');
  assert(unitLine('5_min 1_s CONVERT') === '300._s' && unitLine('1_mi 1_m CONVERT') === '1609.344_m' && unitLine('1_cd UBASE') === '1._cd',
    'a listed unit wins over a prefix: min is the minute, mi the mile and cd the candela');
  for (const bad of ['5_zork', '5_mn', '5_mh', '5_kft', '5_kmin']) {
    assertThrows(() => runLine(bad), /Unknown unit/, `${bad} is not a unit: a prefix only goes before a prefixable one`);
  }
  assert(unitLine('5_kJ UBASE') === '5000._kg*m^2/s^2' && unitLine('1_kJ 500_J +') === '1500._J' && unitLine('1_kW 1000_W ==') === '1.',
    'a prefixed unit has its dimensions and scale for UBASE, sums and comparisons');
  assert(unitLine('1_lbf 1_N CONVERT') === '4.44822161526_N' && unitLine('1_psi 1_Pa CONVERT') === '6894.75729317_Pa'
    && unitLine('1_gal 1_L CONVERT') === '3.785411784_L' && unitLine('1_mph 1_kph CONVERT') === '1.609344_kph'
    && unitLine('1_hp 1_W CONVERT') === '745.699871582_W' && unitLine('1_kWh 1_MJ CONVERT') === '3.6_MJ'
    && unitLine('1_acre 1_ha CONVERT') === '0.40468564224_ha' && unitLine('1_cal 1_J CONVERT') === '4.1868_J',
    'common US and engineering units: lbf, psi, gal, mph, hp, kWh, acre and cal');
  assertThrows(() => runLine('1_lbf 1_kg CONVERT'), /Inconsistent units/, 'a force does not convert to a mass');
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assert(unitLine('100_°C 1_°F CONVERT') === '212._°F' && unitLine('32_°F 1_°C CONVERT') === '0._°C'
    && unitLine('-40_°C 1_°F CONVERT') === '-40._°F' && unitLine('300_K 1_°C CONVERT') === '26.85_°C'
    && unitLine('0_°C 1_K CONVERT') === '273.15_K' && unitLine('0_°F 1_°R CONVERT') === '459.67_°R',
    'a bare °C or °F converts as a thermometer reading: 100_°C is 212_°F, 0_°C is 273.15_K');
  assert(unitLine('0_°C UBASE') === '273.15_K' && unitLine('100_°F UBASE') === '310.927777778_K' && unitLine('37_degC 1_degF CONVERT') === '98.6_degF',
    'UBASE turns a thermometer reading into kelvin, and degC and degF spell the units without a degree sign');
  assert(unitLine('0_°C 273.15_K ==') === '1.' && unitLine('20_°C 68_°F ==') === '1.' && unitLine('30_°C 80_°F <') === '0.'
    && unitLine('50_°F 5_°C MIN') === '5._°C',
    'comparisons and MIN read temperatures as thermometer readings');
  assert(unitLine('10_°C 5_°C +') === '15._°C' && unitLine('10_°C 5_°C -') === '5._°C' && unitLine('10_K 5_°R +') === '23._°R'
    && unitLine('20_°C 2 *') === '40._°C',
    'sums and differences of temperatures have no additive constant, and a product scales the degrees');
  for (const bad of ['10_°C 5_K +', '1_°C 1_°F +', '10_K 5_°C -']) {
    assertThrows(() => runLine(bad), /Inconsistent units/, `${bad} mixes a thermometer scale with another: Inconsistent units`);
  }
  assert(unitLine('5_°C/min 1_K/s CONVERT') === '0.0833333333333_K/s',
    'a temperature inside a compound unit is a difference, so it has no offset');
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assert(unitLine('9_m^2 SQRT') === '3._m' && unitLine('9_m SQRT') === '3._m^.5' && unitLine('4_m SQRT SQ') === '4._m' && unitLine('16_m^4 SQRT SQRT') === '2._m',
    'AUR: the root of a unit halves its exponents, so 9_m^2 SQRT is 3_m and 9_m SQRT is 3_m^.5');
  assertThrows(() => runLine('-9_m SQRT'), /Bad argument value/, 'the root of a negative unit is Bad argument value');
  assert(unitLine('27_m 3 XROOT') === '3._m^.333333333333' && unitLine('8_m^3 3 XROOT') === '2._m',
    'AUR: XROOT of a unit takes the x-th root of its exponents');
  assert(unitLine('4_m 0.5 ^') === '2._m^.5' && unitLine('4_m 1 2 / ^') === '2._m^.5' && unitLine('4_m^2 0.5 ^') === '2._m' && unitLine('2_m^.5 2 ^') === '4._m'
    && unitLine('1_m^.5 1_m^.5 *') === '1._m',
    'AUR: x_unit y ^ takes a fractional power, and fractional exponents add up');
  assert(unitLine('2_m^.5 DUP ->STR STR→ SAME') === '1.' && formatUnitExpr(parseUnitExpr('1/m^.5')) === '1/m^.5' && formatUnitExpr(parseUnitExpr('m^1.5*s^-0.5')) === 'm^1.5/s^.5'
    && sameDims(parseUnitExpr('m^.5*m^.5'), parseUnitExpr('m')) && sameDims(parseUnitExpr('m^.1*m^.2*m^.3'), parseUnitExpr('m^.6')),
    'a fractional unit exponent prints without its zero, reads back, and compares by dimension');
  for (const overflow of ['1E308_m 10 *', '1E200_m SQ', '0_m -1 ^', '1E308_m 1E308_m *']) {
    assertThrows(() => runLine(overflow), /Infinite result/, `${overflow} is Infinite result, not an infinite unit`);
  }
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assert(unitLine('32_ft SIGN') === '1.' && unitLine('-5_m SIGN') === '-1.' && unitLine('0_m SIGN') === '0.',
    'AUR: SIGN of a unit is the sign of its number, as a plain real');
  assert(unitLine('5.678_m 1 RND') === '5.7_m' && unitLine('5.678_m 1 TRNC') === '5.6_m' && unitLine('5.678_m -2 TRNC') === '5.6_m' && unitLine('5.678_m 0 RND') === '6._m',
    'AUR: RND and TRNC round or truncate the number of a unit');
  assert(unitLine('15 176_kg %') === '26.4_kg' && unitLine('100_°C 50 %') === '50._°C' && unitLine('50 3_m %') === '1.5_m',
    'AUR: % takes a unit and a number, and keeps the unit');
  assertThrows(() => runLine('3_m 4_m %'), /Bad argument type/, 'two units are not a percentage');
  assert(unitLine('1_m 500_cm %CH') === '400.' && unitLine('1_m 500_cm %T') === '500.' && unitLine('100_K 150_K %CH') === '50.' && unitLine('100_K 50_K %T') === '50.',
    'AUR: %CH and %T of two units convert the second and return a plain number');
  assertThrows(() => runLine('10_°C 20_K %CH'), /Inconsistent units/, '%CH of a Celsius and a kelvin temperature is Inconsistent units');
  assertThrows(() => runLine('1_m 1_s %T'), /Inconsistent units/, '%T of different dimensions is Inconsistent units');
  assertThrows(() => runLine('0_m 5_m %CH'), /Infinite result/, '%CH from a zero unit is Infinite result');
  assertThrows(() => runLine('5_m 2 %T'), /Bad argument type/, '%T of a unit and a number is Bad argument type');
}

{
  const unitLine = (src) => formatSource(runLine(src).peek());
  assertThrows(() => runLine('(1_m, 2_s)'), /Bad complex literal/, 'a complex literal with units is refused, not read as (1, 2)');
  assertThrows(() => runLine('(1abc, 2)'), /Bad complex literal/, 'a complex part with trailing text is refused');
  assertThrows(() => runLine('(1.5E, 2)'), /Bad complex literal/, 'a complex part with a broken exponent is refused');
  assert(unitLine('(1/2, 3)') === '(0.5, 3)' && unitLine('(1.5E-3, -2)') === '(0.0015, -2)' && unitLine('(.5, 5.)') === '(0.5, 5)',
    'a complex part may be a fraction or a number with an exponent');
}

{
  const line = (src) => runLine(src).snapshot().map((v) => formatSource(v)).join(' ');
  for (const bad of ['1_', '1_m*', '1_m/', '1_*m', '1_m//s', '1_m*/s', '1_1', '1_m**2']) {
    assertThrows(() => runLine(bad), /Bad unit expression|Missing unit/, `${bad} is a malformed unit literal, not a unit it half reads`);
  }
  assert(line('1_/m') === '1._1/m' && line('1_(m)') === '1._m' && line('1_m/(s*kg)') === '1._m/(kg*s)' && line('1_m/m') === '1.',
    'a leading slash, parentheses and a cancelled unit still read');
  assert(unitSize(parseUnitExpr('m')) === 3 && unitSize(parseUnitExpr('km')) === 5 && unitSize(parseUnitExpr('m^2')) === 5
    && unitSize(parseUnitExpr('m/s^2')) === 7 && unitSize(parseUnitExpr('kg*m/s^2')) === 11 && unitSize(parseUnitExpr('1/s')) === 5
    && unitSize(parseUnitExpr('min')) === 3 && unitSize(parseUnitExpr('mmHg')) === 3,
    'unitSize counts the scalar, the underscore, each name, 2 per prefix, and each operator and exponent');
  assert(line('5_m SIZE') === '3' && line('5_km SIZE') === '5' && line('9.8_m/s^2 SIZE') === '7',
    'AUR: SIZE of a unit object counts its parts');
  assert(line('5.5 SIZE') === '1' && line('(1,2) SIZE') === '1' && line('`X` SIZE') === '1' && line(':a:5 SIZE') === '1',
    'AUR: SIZE of a type it does not list is 1');
  assert(line('12345 SIZE') === '5' && line('-12345 SIZE') === '5' && line('0 SIZE') === '1',
    'AUR: SIZE of an integer is its number of digits');
  assert(line('`X+1` SIZE') === '3' && line('`SIN(X)` SIZE') === '2' && line('`A+B*C` SIZE') === '5' && line('`-X` SIZE') === '2',
    'AUR: SIZE of an algebraic counts its objects, so X+1 is X 1 + and 3');
  assert(line('5_m RE') === '5.' && line('{ 5_m 6_s } RE') === '{ 5. 6. }' && line(':a:5_m RE') === ':a:5.',
    'AUR: RE of a unit is its number');
  assert(line('5_m `X` DERIV') === '0.' && line('5_m `X` ∂') === '0.', 'AUR: the derivative of a unit by a name is 0');
  assert(line('{ 3_m 1_m 2_m } SORT') === '{ 1._m 2._m 3._m }' && line('{ 3_ft 1_m 2_in } SORT') === '{ 2._in 3._ft 1._m }'
    && line('{ 10_°C 50_°F 280_K } SORT') === '{ 280._K 10._°C 50._°F }',
    'AUR: SORT orders unit objects by value, converting them to a common unit');
  assertThrows(() => runLine('{ 3_m 1_s } SORT'), /Inconsistent units/, 'SORT of incompatible units is Inconsistent units');
  assertThrows(() => runLine('{ 3 1_m } SORT'), /Bad argument type/, 'SORT of a number and a unit is Bad argument type');
  assert(line('{ `B` `A` `C` } SORT') === '{ `A` `B` `C` }' && line('{ { 3 "c" } { 1 "a" } { 2 "b" } } SORT') === '{ { 1 "a" } { 2 "b" } { 3 "c" } }',
    'AUR: SORT also orders names by character code and lists by their first element');
  assertThrows(() => runLine('{ { } { 1 } } SORT'), /Bad argument value/, 'SORT of an empty list among lists is Bad argument value');
  assert(line(':a:5_km UBASE') === ':a:5000._m' && line(':a:5_km UVAL') === ':a:5.' && line('{ 5_km 2_mi } UBASE') === '{ 5000._m 3218.688_m }'
    && line('{ 5_km 2_mi } UVAL') === '{ 5. 2. }',
    'UBASE and UVAL are functions: they keep a tag and map over a list');
}

{
  const line = (src) => runLine(src).snapshot().map((v) => formatSource(v)).join(' ');
  assert(line('1_W 1_N UFACT') === '1._m*N/s' && line('1_W 1_kN UFACT') === '0.001_kN*m/s' && line('1_J 1_W UFACT') === '1._s*W' && line('1_N 1_kg UFACT') === '1._kg*m/s^2',
    'AUR: UFACT factors the level 1 unit out of the level 2 unit, so 1_W 1_N UFACT is 1_N*m/s');
  assert(line('5_m 1_cm UFACT') === '500._cm' && line('100_km/h 1_m UFACT') === '27.7777777778_m/s' && line('5_m 1_s UFACT') === '5._m',
    'UFACT of a unit that divides it with nothing left over is a conversion, and one that does not divide it leaves a remainder in base units');
  assertThrows(() => runLine('3 1_m UFACT'), /Bad argument type/, 'UFACT needs two unit objects');
  assert(line('100_°C 32_°F TDELTA') === '100._°C' && line('25_°C 20_°C TDELTA') === '5._°C' && line('20_°C 25_°C TDELTA') === '-5._°C' && line('77_°F 20_°C TDELTA') === '9._°F' && line('50 20 TDELTA') === '30',
    'AUR: TDELTA is the change from the level 2 temperature to the level 1 one, in the units of level 2');
  assert(line('20_°C 9_°F TINC') === '25._°C' && line('20_°C 5_K TINC') === '25._°C' && line('68_°F 5_°C TINC') === '77._°F' && line('20_K 5_°C TINC') === '25._K' && line('20 5 TINC') === '25',
    'AUR: TINC adds an increment, taken as a difference, to a temperature and keeps its units');
  assert(line('{ 20_°C 30_°C } 5_K TINC') === '{ 25._°C 35._°C }' && line(':a:100_°C 32_°F TDELTA') === '100._°C',
    'TDELTA and TINC are functions: they map over a list and drop tags');
  assertThrows(() => runLine('5_m 2_s TDELTA'), /Inconsistent units/, 'TDELTA of unrelated units is Inconsistent units');
  assertThrows(() => runLine('5_m 2 TINC'), /Bad argument type/, 'TINC of a unit and a plain number is Bad argument type');
}

{
  const line = (src) => runLine(src).snapshot().map((v) => formatSource(v)).join(' ');
  assert(line('1_° UBASE') === '0.0174532925199_r' && line('180_° 1_r CONVERT') === '3.14159265359_r' && line('1_r 1_° CONVERT') === '57.2957795131_°'
    && line('100_grad 1_° CONVERT') === '90._°' && line('1_arcmin 1_arcs CONVERT') === '60._arcs' && line('1_sr UBASE') === '1._r^2',
    'AUR: the angle units ° r grad arcmin arcs and sr convert among themselves, and a steradian is a square radian');
  assertThrows(() => runLine('1_° 1_m CONVERT'), /Inconsistent units/, 'an angle does not convert to a length');
  assert(line('30_° 2 *') === '60._°' && line('1_° 1_° +') === '2._°' && line('3_° 1_arcmin /') === '3._°/arcmin',
    'angle units take part in arithmetic like any other');
  runLine('DEG');
  const degrees = line('30_° SIN') + ' ' + line('1_r SIN') + ' ' + line('100_grad SIN');
  runLine('GRD');
  const grads = line('30_° SIN') + ' ' + line('1_r SIN') + ' ' + line('100_grad SIN');
  runLine('RAD');
  const radians = line('30_° SIN') + ' ' + line('1_r SIN') + ' ' + line('100_grad SIN');
  assert(degrees === grads && grads === radians && radians === '0.5 0.841470984808 1.',
    'AUR: an angle unit overrides the angle mode of SIN');
  assert(line('90_° COS') === '0.' && line('180_° SIN') === '0.' && line('270_° COS') === '0.' && line('720_° COS') === '1.' && line('-90_° SIN') === '-1.'
    && line('100_grad COS') === '0.' && line('5400_arcmin SIN') === '1.' && line('324000_arcs SIN') === '1.',
    'COS and SIN of whole quadrants given in degrees, grads, arc minutes or arc seconds are exact in every angle mode');
  assert(line('45_° TAN') === '1.' && line('0.5_r TAN') === '0.546302489844' && line('{ 30_° 60_° } COS') === '{ 0.866025403784 0.5 }' && line(':a:60_° COS') === ':a:0.5',
    'TAN and COS accept an angle unit, map over a list and keep a tag');
  assertThrows(() => runLine('90_° TAN'), /Infinite result/, 'TAN of a right angle in degrees is an Infinite result');
  assertThrows(() => runLine('1_m SIN'), /Bad argument type/, 'SIN of a length is Bad argument type');
  assertThrows(() => runLine('1_s^-1 COS'), /Bad argument type/, 'COS of a frequency is Bad argument type');
  assertThrows(() => runLine('1_sr TAN'), /Bad argument type/, 'TAN of a solid angle is Bad argument type');
}

{
  const line = (src) => runLine(src).snapshot().map((v) => formatSource(v)).join(' ');
  const value = (src) => line(`${src} UVAL`);
  const cases = [
    ['1_Å 1_m CONVERT', '0.0000000001'], ['1_fermi 1_m CONVERT', '1E-15'], ['1_μ 1_μm CONVERT', '1.'], ['1_ftUS 1_ft CONVERT', '1.000002'],
    ['1_miUS 1_m CONVERT', '1609.34721869'], ['1_chain 1_ftUS CONVERT', '66.'], ['1_rd 1_ftUS CONVERT', '16.5'], ['1_fath 1_ftUS CONVERT', '6.'],
    ['1_Mpc 1_pc CONVERT', '1000000.'], ['1_lyr 1_ly CONVERT', '1.'], ['1_a 1_m^2 CONVERT', '100.'], ['1_b 1_m^2 CONVERT', '1E-28'],
    ['1_galC 1_galUK CONVERT', '1.'], ['1_ozUK 1_mL CONVERT', '28.4130625'], ['1_cu 1_cup CONVERT', '1.'], ['1_bu 1_L CONVERT', '35.2390701669'],
    ['4_pk 1_bu CONVERT', '1.'], ['1_fbm 1_in^3 CONVERT', '144.'], ['1_st 1_m^3 CONVERT', '1.'], ['1_c 1_m/s CONVERT', '299792458.'],
    ['1_ga 1_m/s^2 CONVERT', '9.80665'], ['1_t 1_kg CONVERT', '1000.'], ['1_tonUK 1_lb CONVERT', '2240.'], ['1_u 1_kg CONVERT', '1.6605390666E-27'],
    ['1_gf 1_N CONVERT', '0.00980665'], ['1_pdl 1_N CONVERT', '0.138254954376'], ['1_Kcal 1_cal CONVERT', '1000.'], ['1_therm 1_Btu CONVERT', '100000.'],
    ['1_inH2O 1_Pa CONVERT', '248.84'], ['1_Fdy 1_C CONVERT', '96485.3321233'], ['1_mho 1_S CONVERT', '1.'], ['1_fc 1_lx CONVERT', '10.7639104167'],
    ['1_ph 1_lx CONVERT', '10000.'], ['1_lam 1_cd/m^2 CONVERT', '3183.09886184'], ['1_rad 1_Gy CONVERT', '0.01'], ['1_rem 1_mSv CONVERT', '10.'],
    ['1_Ci 1_GBq CONVERT', '37.'], ['1_mCi 1_Bq CONVERT', '37000000.'], ['1_R 1_C/kg CONVERT', '0.000258'], ['1_P 1_Pa*s CONVERT', '0.1'],
    ['1_cP 1_mPa*s CONVERT', '1.'], ['1_St 1_m^2/s CONVERT', '0.0001'], ['1_cSt 1_mm^2/s CONVERT', '1.'],
  ];
  const wrong = cases.filter(([src, expected]) => value(src) !== expected).map(([src, expected]) => `${src} gave ${value(src)}, not ${expected}`);
  assert(wrong.length === 0, `the rest of the HP 50g unit catalog converts as its table defines (${wrong.join('; ')})`);
  assertThrows(() => runLine('1_P 1_St CONVERT'), /Inconsistent units/, 'dynamic and kinematic viscosity do not convert into each other');
  assert(line('1_m/m') === '1.' && line('1_m/m TYPE') === '0.' && line('1_m/m 2 +') === '3.' && line('6_kg*m/(m*kg) 2 /') === '3.',
    'units that cancel in a literal leave a plain real number, as 2_m 2_m / does');
}
