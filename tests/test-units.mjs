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
  sameDims, scaleOf, toBaseUexpr, uexprEqual,
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
