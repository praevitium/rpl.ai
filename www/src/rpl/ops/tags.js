import { Real, isString, isName, isTagged, Tagged } from '../types.js';
import { RPLError } from '../stack.js';
import { varRecall } from '../state.js';
import { register } from './registry.js';
import { _hp50TypeCode } from './internal.js';



register('TYPE', (s) => {
  const [v] = s.popN(1);
  const code = _hp50TypeCode(v);
  s.push(Real(code));
}, { category: 'Types & tags', categoryOrder: 0, label: "TYPE" });


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
}, { category: 'Types & tags', categoryOrder: 3, label: "→TAG" });


register('DTAG', (s) => {
  const [v] = s.popN(1);
  if (isTagged(v)) { s.push(v.value); return; }
  s.push(v);   // HP50: DTAG on non-tagged is a no-op pass-through
}, { category: 'Types & tags', categoryOrder: 4, label: "DTAG" });


register('VTYPE', (s) => {
  const [nameV] = s.popN(1);
  if (!isName(nameV)) throw new RPLError('Bad argument type');
  const stored = varRecall(nameV.id);
  if (stored === undefined) throw new RPLError(`Undefined name: ${nameV.id}`);
  s.push(Real(_hp50TypeCode(stored)));
}, { category: 'Types & tags', categoryOrder: 2, label: "VTYPE" });


register('KIND', (s) => {
  const [v] = s.popN(1);
  s.push(Real(_hp50TypeCode(v)));
}, { category: 'Types & tags', categoryOrder: 1, label: "KIND" });
