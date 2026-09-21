import { isInteger, isReal, RList, Integer, isList } from '../types.js';
import { RPLError } from '../stack.js';
import { state as _calcState, setUserFlag, clearUserFlag, testUserFlag, clearAllUserFlags } from '../state.js';
import { register } from './registry.js';
import { FALSE, TRUE } from './internal.js';



/* ----------------------------------------------------------------
   User / system flag ops — SF / CF / FS? / FC? / FS?C / FC?C.

   Reference: HP50 Advanced Guide §2 (Flag commands).  Flag numbers
   are integers in [-128, -1] ∪ [1, 128]; positive = user flags,
   negative = system flags.  Zero is rejected.

   Semantics:
     SF   ( n      → )           set flag n
     CF   ( n      → )           clear flag n
     FS?  ( n  → 0/1 )           push 1 if set, 0 if clear
     FC?  ( n  → 0/1 )           push 1 if clear, 0 if set  (= NOT FS?)
     FS?C ( n  → 0/1 )           FS?, then clear as a side effect
     FC?C ( n  → 0/1 )           FC?, then clear as a side effect

   The side-effecting variants "test-and-clear" are the HP50's way of
   handling "was an event flagged?" cheaply in one op.  Both return
   the pre-clear test value.

   No specific system flag yet has cross-cutting effects tied to it
   in this codebase — SF/CF are pure bookkeeping that future features
   can consult.
   ---------------------------------------------------------------- */

function _popFlagNumber(s) {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v))    n = v.value.toNumber();
  else                   throw new RPLError('Bad argument type');
  if (!Number.isInteger(n) || n === 0 || n < -128 || n > 128) {
    throw new RPLError('Bad argument value');
  }
  return n;
}


register('SF', (s) => {
  const n = _popFlagNumber(s);
  setUserFlag(n);
}, { category: 'Flags', categoryOrder: 0, label: "SF" });


register('CF', (s) => {
  const n = _popFlagNumber(s);
  clearUserFlag(n);
}, { category: 'Flags', categoryOrder: 1, label: "CF" });


register('FS?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? TRUE : FALSE);
}, { category: 'Flags', categoryOrder: 2, label: "FS?" });


register('FC?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? FALSE : TRUE);
}, { category: 'Flags', categoryOrder: 3, label: "FC?" });


register('FS?C', (s) => {
  const n = _popFlagNumber(s);
  const was = testUserFlag(n);
  if (was) clearUserFlag(n);
  s.push(was ? TRUE : FALSE);
}, { category: 'Flags', categoryOrder: 4, label: "FS?C" });


register('FC?C', (s) => {
  const n = _popFlagNumber(s);
  const was = testUserFlag(n);
  if (was) clearUserFlag(n);
  // FC?C returns the test of "was the flag CLEAR" — i.e. the inverse
  // of was — and then (side effect) clears the flag regardless.
  s.push(was ? FALSE : TRUE);
}, { category: 'Flags', categoryOrder: 5, label: "FC?C" });


/* ================================================================
   STOF / RCLF (flag save/restore)
   →STR / STR→ (object ⇄ string)
   ΣLIST / ΠLIST / ΔLIST (list aggregations)
   V→ / →V2 / →V3 (vector compose/decompose)
   REPL / SREPL (string and list replacement)

   Advanced Guide refs: §2 (STOF/RCLF), §4 (→STR/STR→), §5 (ΣLIST,
   ΠLIST, ΔLIST), §13 (V→/→V2/→V3, REPL), §14 (SREPL).
   ================================================================ */

/* ----------------------------------------------------------------
   STOF / RCLF — save and restore the current flag-set.

   HP50 Advanced Guide §2 documents STOF / RCLF in terms of a pair of
   64-bit binary integers (user + system), one bit per flag.  We use a
   Set<number> representation for the same bookkeeping surface.  The
   practical surface:

     RCLF (   → { n1 n2 … } )
       Pushes a List of the currently-set flag numbers, sorted
       ascending so user flags (1..128) come after system flags
       (-128..-1).  An empty flag set pushes `{ }`.

     STOF ( { n1 n2 … } →   )
       Clears every flag, then sets exactly the numbers in the list.
       Each element must be an Integer / Real that passes _validFlag
       (non-zero, |n| ≤ 128).  A non-list argument, or any element
       that isn't a valid flag number, throws — the flag set is NOT
       partially-mutated on a bad element (we validate up front).

   This is the "simpler" half of HP50's pair: programs can snapshot
   and restore a flag set without juggling 64-bit words.  The
   binary-integer variant can be layered on later.
   ---------------------------------------------------------------- */

register('RCLF', (s) => {
  const flags = [..._calcState.userFlags].sort((a, b) => a - b);
  s.push(RList(flags.map(n => Integer(BigInt(n)))));
}, { category: 'Flags', categoryOrder: 6, label: "RCLF" });


register('STOF', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  // Validate every element before mutating — an error mid-list would
  // leave the flag set in an inconsistent state otherwise.
  const nums = [];
  for (const item of l.items) {
    let n;
    if (isInteger(item))   n = Number(item.value);
    else if (isReal(item)) n = item.value.toNumber();
    else throw new RPLError('Bad argument type');
    if (!Number.isInteger(n) || n === 0 || n < -128 || n > 128) {
      throw new RPLError('Bad argument value');
    }
    nums.push(n);
  }
  clearAllUserFlags();
  for (const n of nums) setUserFlag(n);
}, { category: 'Flags', categoryOrder: 7, label: "STOF" });
