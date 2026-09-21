import { isUnit, Real, Unit } from '../types.js';
import { RPLError } from '../stack.js';
import { toBaseUexpr, sameDims, uexprEqual, scaleOf } from '../units.js';
import { register } from './registry.js';
import { _makeUnit, _numVal } from './internal.js';



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
}, { category: 'Units', categoryOrder: 0, label: "UVAL" });


register('UBASE', (s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const { scale, uexpr } = toBaseUexpr(u.uexpr);
  s.push(_makeUnit(u.value * scale, uexpr));
}, { category: 'Units', categoryOrder: 1, label: "UBASE" });


register('→UNIT', (s) => {
  const [x, u] = s.popN(2);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const xv = _numVal(x);
  s.push(Unit(xv, u.uexpr));
}, { category: 'Units', categoryOrder: 2, label: "→UNIT" });
  // ASCII alias

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
}, { category: 'Units', categoryOrder: 3, label: "CONVERT" });
