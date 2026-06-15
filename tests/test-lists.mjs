import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isList,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* List ops — GET / PUT / HEAD / TAIL / SUB / →LIST / LIST→ / POS. */

  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    s.push(Integer(2));
    lookup('GET').fn(s);
    assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(20),
      'GET { 10 20 30 } 2 → 20');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    s.push(Integer(5));
    try { lookup('GET').fn(s); assert(false, 'should throw on OOB GET'); }
    catch (e) { assert(e.message.match(/argument/i), 'GET OOB throws'); }
  }

  {
    const s = new Stack();
    s.push(Vector([Real(7), Real(8), Real(9)]));
    s.push(Integer(3));
    lookup('GET').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(9),
      'GET [ 7 8 9 ] 3 → 9');
  }

  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(RList([Integer(2), Integer(1)]));
    lookup('GET').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(3),
      'GET [[1 2][3 4]] {2 1} → 3');
  }

  {
    const s = new Stack();
    s.push(Str('hello'));
    s.push(Integer(1));
    lookup('GET').fn(s);
    assert(isString(s.peek()) && s.peek().value === 'h',
      'GET "hello" 1 → "h"');
  }

  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(Integer(2));
    s.push(Real(99));
    lookup('PUT').fn(s);
    const out = s.peek();
    assert(out.type === 'list' && out.items.length === 3
        && out.items[1].value.eq(99) && out.items[0].value.eq(1),
      'PUT { 1 2 3 } 2 99 → { 1 99 3 }');
  }

  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(RList([Integer(1), Integer(2)]));
    s.push(Real(50));
    lookup('PUT').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix' && m.rows[0][1].value.eq(50)
        && m.rows[1][1].value.eq(4),
      'PUT [[1 2][3 4]] {1 2} 50 → [[1 50][3 4]]');
  }

  {
    const s = new Stack();
    s.push(RList([Real(7), Real(8), Real(9)]));
    lookup('HEAD').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(7),
      'HEAD { 7 8 9 } → 7');
  }
  {
    const s = new Stack();
    s.push(Str('abc'));
    lookup('HEAD').fn(s);
    assert(isString(s.peek()) && s.peek().value === 'a',
      'HEAD "abc" → "a"');
  }

  {
    const s = new Stack();
    s.push(RList([Real(7), Real(8), Real(9)]));
    lookup('TAIL').fn(s);
    const t = s.peek();
    assert(t.type === 'list' && t.items.length === 2
        && t.items[0].value.eq(8) && t.items[1].value.eq(9),
      'TAIL { 7 8 9 } → { 8 9 }');
  }
  {
    const s = new Stack();
    s.push(RList([Real(42)]));
    lookup('TAIL').fn(s);
    const t = s.peek();
    assert(t.type === 'list' && t.items.length === 0,
      'TAIL { 42 } → { }');
  }
  {
    const s = new Stack();
    s.push(Str('abc'));
    lookup('TAIL').fn(s);
    assert(isString(s.peek()) && s.peek().value === 'bc',
      'TAIL "abc" → "bc"');
  }

  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3), Real(4), Real(5)]));
    s.push(Integer(2));
    s.push(Integer(4));
    lookup('SUB').fn(s);
    const out = s.peek();
    assert(out.type === 'list' && out.items.length === 3
        && out.items[0].value.eq(2) && out.items[2].value.eq(4),
      'SUB { 1 2 3 4 5 } 2 4 → { 2 3 4 }');
  }
  {
    const s = new Stack();
    s.push(Str('HELLO'));
    s.push(Integer(2));
    s.push(Integer(4));
    lookup('SUB').fn(s);
    assert(isString(s.peek()) && s.peek().value === 'ELL',
      'SUB "HELLO" 2 4 → "ELL"');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(Integer(5));
    s.push(Integer(10));
    lookup('SUB').fn(s);
    const out = s.peek();
    assert(out.type === 'list' && out.items.length === 0,
      'SUB OOB window → empty list');
  }

  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
    s.push(Integer(3));
    lookup('→LIST').fn(s);
    const out = s.peek();
    assert(s.depth === 1 && out.type === 'list' && out.items.length === 3
        && out.items[0].value.eq(10) && out.items[2].value.eq(30),
      '10 20 30 3 →LIST → { 10 20 30 }');
  }
  {
    const s = new Stack();
    s.push(Integer(0));
    lookup('->LIST').fn(s);
    assert(s.depth === 1 && s.peek().type === 'list' && s.peek().items.length === 0,
      '0 ->LIST → { } (empty list)');
  }

  {
    const s = new Stack();
    s.push(RList([Real(7), Real(8), Real(9)]));
    lookup('LIST→').fn(s);
    assert(s.depth === 4
        && isInteger(s.peek(1)) && s.peek(1).value === 3n
        && isReal(s.peek(2)) && s.peek(2).value.eq(9)
        && isReal(s.peek(3)) && s.peek(3).value.eq(8)
        && isReal(s.peek(4)) && s.peek(4).value.eq(7),
      '{ 7 8 9 } LIST→ → 7 8 9 3');
  }

  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    s.push(Real(20));
    lookup('POS').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === 2n,
      'POS { 10 20 30 } 20 → 2');
  }
  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20)]));
    s.push(Real(99));
    lookup('POS').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === 0n,
      'POS list needle-not-found → 0');
  }
  {
    // Cross-type numeric equality: Integer(20) matches Real(20)
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    s.push(Integer(20));
    lookup('POS').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === 2n,
      'POS matches Integer 20 against Real 20 element');
  }
  {
    // String POS: substring match
    const s = new Stack();
    s.push(Str('Hello world'));
    s.push(Str('world'));
    lookup('POS').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === 7n,
      'POS "Hello world" "world" → 7');
  }
  {
    const s = new Stack();
    s.push(Str('Hello'));
    s.push(Str('z'));
    lookup('POS').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === 0n,
      'POS substring not found → 0');
  }

  {
    const s = new Stack();
    const original = RList([Real(10), Real(20), Real(30)]);
    s.push(original);
    lookup('LIST→').fn(s);            // 10 20 30 3
    lookup('→LIST').fn(s);            // { 10 20 30 }
    const out = s.peek();
    assert(out.type === 'list'
        && out.items.length === 3
        && out.items[0].value.eq(10)
        && out.items[2].value.eq(30),
      'LIST→ then →LIST round-trips a list');
  }


{
  const s = new Stack();
  s.push(RList([Real(3), Real(1), Real(4), Real(1), Real(5), Real(9), Real(2)]));
  lookup('SORT').fn(s);
  const out = s.peek(1);
  assert(out.type === 'list' && out.items.length === 7,
    'SORT returns a List of the same length');
  const vals = out.items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([1, 1, 2, 3, 4, 5, 9]),
    'SORT ascending numeric: 3 1 4 1 5 9 2 → 1 1 2 3 4 5 9');
}
{
  const s = new Stack();
  s.push(RList([Real(2.5), Integer(1n), Real(3)]));
  lookup('SORT').fn(s);
  const out = s.peek(1);
  const num = v => typeof v.value === 'bigint' ? Number(v.value) : v.value.toNumber();
  const vals = out.items.map(num);
  assert(JSON.stringify(vals) === JSON.stringify([1, 2.5, 3]),
    'SORT handles mixed Real / Integer numeric types');
}
{
  const s = new Stack();
  s.push(RList([Str('banana'), Str('apple'), Str('Apple'), Str('cherry')]));
  lookup('SORT').fn(s);
  const out = s.peek(1);
  assert(JSON.stringify(out.items.map(x => x.value))
         === JSON.stringify(['Apple', 'apple', 'banana', 'cherry']),
    'SORT strings: lexicographic with case-sensitive ordering');
}
{
  const s = new Stack();
  s.push(RList([]));
  lookup('SORT').fn(s);
  assert(s.peek(1).type === 'list' && s.peek(1).items.length === 0,
    'SORT on {} → {}');
}
{
  const s = new Stack();
  s.push(RList([Real(42)]));
  lookup('SORT').fn(s);
  assert(s.peek(1).items.length === 1 && s.peek(1).items[0].value.eq(42),
    'SORT on {42} → {42}');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Str('a'), Real(2)]));
  try { lookup('SORT').fn(s); assert(false, 'SORT mixed should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'SORT mixed numeric+string → Bad argument type'); }
}
{
  const s = new Stack();
  s.push(Real(5));
  try { lookup('SORT').fn(s); assert(false, 'SORT non-list should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'SORT on non-list → Bad argument type'); }
}
{
  const src = RList([Real(3), Real(1), Real(2)]);
  const s = new Stack();
  s.push(src);
  lookup('SORT').fn(s);
  assert(src.items[0].value.eq(3) && src.items[1].value.eq(1)
      && src.items[2].value.eq(2),
    'SORT does not mutate the original List');
}

/* ---- SORT: negative reals (regression guard).
   _rplCompare routes both operands through
   Number() so the comparator always works on JS numbers. ---- */
{
  const s = new Stack();
  s.push(RList([Real(-3.5), Real(0), Real(-1.5), Real(5)]));
  lookup('SORT').fn(s);
  const vals = s.peek(1).items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([-3.5, -1.5, 0, 5]),
    'session151b: SORT { -3.5 0 -1.5 5 } → { -3.5 -1.5 0 5 } (negatives ordered numerically)');
}
/* ---- SORT: mixed-sign reals two-decimal ---- */
{
  const s = new Stack();
  s.push(RList([Real(-10.5), Real(-2.5), Real(-100.25), Real(-1.25)]));
  lookup('SORT').fn(s);
  const vals = s.peek(1).items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([-100.25, -10.5, -2.5, -1.25]),
    'session151b: SORT all-negative reals: -10.5 -2.5 -100.25 -1.25 → -100.25 -10.5 -2.5 -1.25');
}
/* ---- SORT: mixed-magnitude positive reals (string-vs-numeric divergence) ---- */
{
  const s = new Stack();
  // "10" < "9" lexicographically, but 10 > 9 numerically.  Pre-fix
  // would have returned the lex order.
  s.push(RList([Real(10), Real(9), Real(11), Real(2), Real(100)]));
  lookup('SORT').fn(s);
  const vals = s.peek(1).items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([2, 9, 10, 11, 100]),
    'session151b: SORT { 10 9 11 2 100 } → { 2 9 10 11 100 } (numeric, not lex)');
}
/* ---- SORT: mixed Integer/Real with negatives ---- */
{
  const s = new Stack();
  s.push(RList([Integer(-3n), Real(-2.5), Integer(0n), Real(-10), Integer(5n)]));
  lookup('SORT').fn(s);
  const num = v => typeof v.value === 'bigint' ? Number(v.value) : v.value.toNumber();
  const vals = s.peek(1).items.map(num);
  assert(JSON.stringify(vals) === JSON.stringify([-10, -3, -2.5, 0, 5]),
    'session151b: SORT mixed Integer/Real with negatives ordered correctly');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  lookup('REVLIST').fn(s);
  const out = s.peek(1);
  assert(out.type === 'list'
      && out.items.map(x => x.value).join(',') === '4,3,2,1',
    'REVLIST: {1 2 3 4} → {4 3 2 1}');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Str('two'), Name('three')]));
  lookup('REVLIST').fn(s);
  const out = s.peek(1);
  assert(out.items[0].type === 'name' && out.items[0].id === 'three'
      && out.items[2].value.eq(1),
    'REVLIST works on heterogeneous lists');
}
{
  const s = new Stack();
  s.push(RList([]));
  lookup('REVLIST').fn(s);
  assert(s.peek(1).type === 'list' && s.peek(1).items.length === 0,
    'REVLIST on {} → {}');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('REVLIST').fn(s);
  lookup('REVLIST').fn(s);
  const out = s.peek(1);
  assert(out.items.map(x => x.value).join(',') === '1,2,3',
    'REVLIST twice = identity');
}
{
  const s = new Stack();
  s.push(Str('hi'));
  try { lookup('REVLIST').fn(s); assert(false, 'REVLIST non-list should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'REVLIST on non-list → Bad argument type'); }
}

/* ================================================================
   ΣLIST / ΠLIST / ΔLIST + REPL / SREPL.

   ΣLIST, ΠLIST: fold list items through + / *.
   ΔLIST: successive differences xi - x(i-1).
   REPL: splice patch into host at position n (String / List / Vector /
         Matrix with {r c} for Matrix).
   SREPL: replace-all on strings; pushes (result, count).
   ================================================================ */

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  lookup('ΣLIST').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(10),
    'ΣLIST {1 2 3 4} → 10');
}
{
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(3n), Integer(5n)]));
  lookup('ΣLIST').fn(s);
  const v = s.peek(1);
  const num = typeof v.value === 'bigint' ? Number(v.value) : v.value;
  assert(num === 10, 'ΣLIST {2 3 5} → 10 (Integer or Real)');
}
{
  const s = new Stack();
  s.push(RList([]));
  lookup('ΣLIST').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(0),
    'ΣLIST {} → 0');
}
{
  const s = new Stack();
  s.push(RList([Real(42)]));
  lookup('ΣLIST').fn(s);
  assert(s.peek(1).value.eq(42),
    'ΣLIST {42} → 42');
}
{
  const s = new Stack();
  s.push(Real(1));
  try { lookup('ΣLIST').fn(s); assert(false, 'ΣLIST non-list should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'ΣLIST on non-list → Bad argument type'); }
}
{
  const s = new Stack();
  s.push(RList([Real(10), Real(20)]));
  lookup('SLIST').fn(s);
  assert(s.peek(1).value.eq(30), 'ASCII alias SLIST works like ΣLIST');
}

{
  const s = new Stack();
  s.push(RList([Real(2), Real(3), Real(4)]));
  lookup('ΠLIST').fn(s);
  assert(s.peek(1).value.eq(24), 'ΠLIST {2 3 4} → 24');
}
{
  const s = new Stack();
  s.push(RList([]));
  lookup('ΠLIST').fn(s);
  assert(s.peek(1).value.eq(1), 'ΠLIST {} → 1');
}
{
  const s = new Stack();
  s.push(RList([Real(7)]));
  lookup('ΠLIST').fn(s);
  assert(s.peek(1).value.eq(7), 'ΠLIST {7} → 7');
}
{
  const s = new Stack();
  s.push(RList([Real(2), Real(5)]));
  lookup('PLIST').fn(s);
  assert(s.peek(1).value.eq(10), 'ASCII alias PLIST works like ΠLIST');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(4), Real(9), Real(16)]));
  lookup('ΔLIST').fn(s);
  const out = s.peek(1);
  assert(out.type === 'list' && out.items.length === 3,
    'ΔLIST of 4 items → list of 3');
  const vals = out.items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([3, 5, 7]),
    'ΔLIST {1 4 9 16} → {3 5 7}');
}
{
  const s = new Stack();
  s.push(RList([]));
  lookup('ΔLIST').fn(s);
  assert(s.peek(1).items.length === 0, 'ΔLIST {} → {}');
}
{
  const s = new Stack();
  s.push(RList([Real(5)]));
  lookup('ΔLIST').fn(s);
  assert(s.peek(1).items.length === 0, 'ΔLIST {5} → {}');
}
{
  const s = new Stack();
  s.push(Real(1));
  try { lookup('ΔLIST').fn(s); assert(false, 'ΔLIST non-list should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'ΔLIST on non-list → Bad argument type'); }
}
{
  const s = new Stack();
  s.push(RList([Real(10), Real(7), Real(3)]));
  lookup('DLIST').fn(s);
  const vals = s.peek(1).items.map(x => x.value.toNumber());
  assert(JSON.stringify(vals) === JSON.stringify([-3, -4]),
    'ASCII alias DLIST works like ΔLIST');
}

{
  const s = new Stack();
  s.push(Str('HELLO WORLD'));
  s.push(Integer(7n));
  s.push(Str('CLAUD'));
  lookup('REPL').fn(s);
  assert(isString(s.peek(1)) && s.peek(1).value === 'HELLO CLAUD',
    'REPL "HELLO WORLD" 7 "CLAUD" → "HELLO CLAUD"');
}
{
  const s = new Stack();
  s.push(Str('ABC'));
  s.push(Integer(2n));
  s.push(Str('XYZW')); // 2+4-1 = 5 > 3
  try { lookup('REPL').fn(s); assert(false, 'REPL should throw on overflow'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'REPL with overflow → Bad argument value'); }
}
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4), Real(5)]));
  s.push(Integer(3n));
  s.push(RList([Name('A'), Name('B')]));
  lookup('REPL').fn(s);
  const out = s.peek(1);
  assert(out.type === 'list' && out.items.length === 5,
    'REPL on list preserves length');
  assert(out.items[2].id === 'A' && out.items[3].id === 'B'
      && out.items[0].value.eq(1) && out.items[4].value.eq(5),
    'REPL {1 2 3 4 5} 3 {A B} → {1 2 A B 5}');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  s.push(Integer(2n));
  s.push(Vector([Real(20), Real(30)]));
  lookup('REPL').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector'
      && v.items[0].value.eq(1) && v.items[1].value.eq(20)
      && v.items[2].value.eq(30) && v.items[3].value.eq(4),
    'REPL [1 2 3 4] 2 [20 30] → [1 20 30 4]');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1),Real(2),Real(3)],
                 [Real(4),Real(5),Real(6)],
                 [Real(7),Real(8),Real(9)]]));
  s.push(RList([Integer(2n), Integer(2n)]));
  s.push(Matrix([[Real(50), Real(60)]]));
  lookup('REPL').fn(s);
  const m = s.peek(1);
  assert(m.type === 'matrix'
      && m.rows[1][1].value.eq(50) && m.rows[1][2].value.eq(60)
      && m.rows[0][0].value.eq(1) && m.rows[2][2].value.eq(9),
    'REPL 3×3 {2 2} [[50 60]] splices at (row 2, col 2)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1),Real(2)],[Real(3),Real(4)]]));
  s.push(RList([Integer(2n), Integer(1n)]));
  s.push(Matrix([[Real(7),Real(8)],[Real(9),Real(10)]]));
  try { lookup('REPL').fn(s); assert(false, 'REPL matrix overflow should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'REPL on Matrix with overflow → Bad argument value'); }
}
{
  const s = new Stack();
  s.push(Str('ABC'));
  s.push(Integer(1n));
  s.push(RList([Str('X')]));
  try { lookup('REPL').fn(s); assert(false, 'REPL mismatch should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'REPL with String host and List patch → Bad argument type'); }
}

{
  const s = new Stack();
  s.push(Str('the cat in the hat'));
  s.push(Str('the'));
  s.push(Str('a'));
  lookup('SREPL').fn(s);
  assert(isInteger(s.peek(1)) && s.peek(1).value === 2n,
    'SREPL pushes count (2n) on level 1');
  assert(isString(s.peek(2)) && s.peek(2).value === 'a cat in a hat',
    'SREPL result on level 2 is the replaced string');
}
{
  const s = new Stack();
  s.push(Str('HELLO'));
  s.push(Str('Z'));
  s.push(Str('Q'));
  lookup('SREPL').fn(s);
  assert(s.peek(1).value === 0n,
    'SREPL with no matches pushes count 0');
  assert(s.peek(2).value === 'HELLO',
    'SREPL unchanged source when no matches');
}
{
  const s = new Stack();
  s.push(Str('a_a_a'));
  s.push(Str('a'));
  s.push(Str('XXX'));
  lookup('SREPL').fn(s);
  assert(s.peek(2).value === 'XXX_XXX_XXX' && s.peek(1).value === 3n,
    'SREPL grows the string when replacement is longer');
}
{
  const s = new Stack();
  s.push(Str('remove me please'));
  s.push(Str('me '));
  s.push(Str(''));
  lookup('SREPL').fn(s);
  assert(s.peek(2).value === 'remove please' && s.peek(1).value === 1n,
    'SREPL with empty replacement deletes matches');
}
{
  const s = new Stack();
  s.push(Str('abc'));
  s.push(Str(''));
  s.push(Str('x'));
  try { lookup('SREPL').fn(s); assert(false, 'SREPL empty needle should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'SREPL with empty needle → Bad argument value'); }
}
{
  const s = new Stack();
  s.push(Str('abc'));
  s.push(Real(1));
  s.push(Str('x'));
  try { lookup('SREPL').fn(s); assert(false, 'SREPL bad type should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'SREPL with Real needle → Bad argument type'); }
}


{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Program([Real(2), Name('*')]));     // << 2 * >>
  lookup('MAP').fn(s);
  const out = s.peek();
  assert(out.type === 'list' && out.items.length === 3,
         'session044: MAP list returns list');
  assert(isReal(out.items[0]) && out.items[0].value.eq(2),
         'session044: MAP list[0] = 2');
  assert(isReal(out.items[1]) && out.items[1].value.eq(4),
         'session044: MAP list[1] = 4');
  assert(isReal(out.items[2]) && out.items[2].value.eq(6),
         'session044: MAP list[2] = 6');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  s.push(Program([Name('SQ')]));
  lookup('MAP').fn(s);
  const out = s.peek();
  assert(out.type === 'vector' && out.items.length === 3,
         'session044: MAP vector returns vector');
  assert(out.items[0].value.eq(1) && out.items[1].value.eq(4) && out.items[2].value.eq(9),
         'session044: MAP vector SQ → [1 4 9]');
}

{
  const s = new Stack();
  s.push(RList([]));
  s.push(Program([Real(2), Name('*')]));
  lookup('MAP').fn(s);
  const out = s.peek();
  assert(out.type === 'list' && out.items.length === 0,
         'session044: MAP on empty list is empty list');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Program([Real(10), Name('*')]));
  lookup('MAP').fn(s);
  const out = s.peek();
  assert(out.type === 'matrix' && out.rows.length === 2 && out.rows[0].length === 2,
         'session044: MAP matrix preserves 2x2 shape');
  assert(out.rows[0][0].value.eq(10) && out.rows[0][1].value.eq(20) &&
         out.rows[1][0].value.eq(30) && out.rows[1][1].value.eq(40),
         'session044: MAP matrix [[10,20],[30,40]]');
}

{
  const s = new Stack();
  s.push(Real(99));           // leave an unrelated value on the stack
  s.push(RList([Real(1), Real(2)]));
  s.push(Program([Real(1), Name('+')]));
  lookup('MAP').fn(s);
  assert(s.depth === 2, 'session044: MAP leaves one extra stack item and the result');
  assert(s.peek().type === 'list' && s.peek().items[1].value.eq(3),
         'session044: MAP { 1 2 } << 1 + >> → { 2 3 }');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(Program([Name('DROP')]));     // consumes the element, pushes nothing
  assertThrows(() => lookup('MAP').fn(s), /MAP: bad program/i,
               'session044: MAP with 1-in 0-out program throws MAP: bad program');
}

{
  const s = new Stack();
  s.push(Real(5));
  s.push(Program([Name('SQ')]));
  assertThrows(() => lookup('MAP').fn(s), /Bad argument type/i,
               'session044: MAP on Real throws Bad argument type');
}

{
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Real(5));          // not a program
  assertThrows(() => lookup('MAP').fn(s), /Bad argument type/i,
               'session044: MAP with Real combinator throws Bad argument type');
}


{
  const s = new Stack();
  s.push(Program([Name('X'), Real(2), Name('^')]));   // expr: X 2 ^
  s.push(Name('X', { quoted: true }));
  s.push(Real(1));
  s.push(Real(4));
  s.push(Real(1));
  lookup('SEQ').fn(s);
  const L = s.peek();
  assert(L && L.type === 'list' && L.items.length === 4 &&
         L.items[0].value.eq(1) && L.items[1].value.eq(4) &&
         L.items[2].value.eq(9) && L.items[3].value.eq(16),
         'session045: SEQ X^2 1..4 step 1 → { 1 4 9 16 }');
}

{
  const s = new Stack();
  s.push(Program([Name('X')]));            // expr: X
  s.push(Name('X', { quoted: true }));
  s.push(Real(5));
  s.push(Real(1));
  s.push(Real(-2));
  lookup('SEQ').fn(s);
  const L = s.peek();
  assert(L && L.items.length === 3 &&
         L.items[0].value.eq(5) && L.items[1].value.eq(3) && L.items[2].value.eq(1),
         'session045: SEQ X 5..1 step -2 → { 5 3 1 }');
}

{
  const s = new Stack();
  s.push(Program([Name('X')]));
  s.push(Name('X', { quoted: true }));
  s.push(Real(1));
  s.push(Real(5));
  s.push(Real(0));
  assertThrows(() => lookup('SEQ').fn(s), /Bad argument value/,
               'session045: SEQ with step=0 throws Bad argument value');
}

{
  const s = new Stack();
  s.push(Program([Name('X')]));
  s.push(Name('X', { quoted: true }));
  s.push(Real(5));
  s.push(Real(1));
  s.push(Real(1));            // positive step but start > end
  lookup('SEQ').fn(s);
  const L = s.peek();
  assert(L && L.type === 'list' && L.items.length === 0,
         'session045: SEQ with start past end → {}');
}

{
  varStore('Y', Real(99));
  const s = new Stack();
  s.push(Program([Name('Y'), Real(2), Name('*')]));   // expr: Y 2 *
  s.push(Name('Y', { quoted: true }));
  s.push(Real(1));
  s.push(Real(3));
  s.push(Real(1));
  lookup('SEQ').fn(s);
  assert(varRecall('Y').value.eq(99),
         'session045: SEQ restores prior Y binding after loop');
  varPurge('Y');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(10), Real(20), Real(30)]));
  s.push(Integer(2n));
  s.push(Program([Name('+')]));
  lookup('DOLIST').fn(s);
  const L = s.peek();
  assert(L && L.type === 'list' && L.items.length === 3 &&
         L.items[0].value.eq(11) && L.items[1].value.eq(22) && L.items[2].value.eq(33),
         'session045: DOLIST n=2 elementwise + → { 11 22 33 }');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Program([Name('SQ')]));
  lookup('DOLIST').fn(s);
  const L = s.peek();
  assert(L && L.items.length === 3 &&
         L.items[0].value.eq(1) && L.items[1].value.eq(4) && L.items[2].value.eq(9),
         'session045: DOLIST implicit n=1 with SQ → { 1 4 9 }');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  s.push(RList([Real(10), Real(20)]));    // shorter
  s.push(Integer(2n));
  s.push(Program([Name('+')]));
  lookup('DOLIST').fn(s);
  const L = s.peek();
  assert(L && L.items.length === 2 &&
         L.items[0].value.eq(11) && L.items[1].value.eq(22),
         'session045: DOLIST truncates to shortest list');
}

{
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Real(1.5));                      // not integer
  s.push(Program([Name('DUP')]));
  assertThrows(() => lookup('DOLIST').fn(s), /Bad argument type/,
               'session045: DOLIST with non-integer n throws');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  s.push(Integer(2n));
  s.push(Program([Name('+')]));
  lookup('DOSUBS').fn(s);
  const L = s.peek();
  assert(L && L.items.length === 3 &&
         L.items[0].value.eq(3) && L.items[1].value.eq(5) && L.items[2].value.eq(7),
         'session045: DOSUBS window=2 + → { 3 5 7 }');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(Integer(5n));
  s.push(Program([Name('+')]));
  lookup('DOSUBS').fn(s);
  const L = s.peek();
  assert(L && L.type === 'list' && L.items.length === 0,
         'session045: DOSUBS with window > length → {}');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(0n));
  s.push(Program([Name('+')]));
  lookup('DOSUBS').fn(s);
  const L = s.peek();
  assert(L && L.type === 'list' && L.items.length === 0,
         'session045: DOSUBS with window=0 → {}');
}

{
  // Window of 3 pushes 3 values; use `+ +` to sum them down to 1.
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4), Real(5)]));
  s.push(Integer(3n));
  s.push(Program([Name('+'), Name('+')]));   // sum of 3 → one value
  lookup('DOSUBS').fn(s);
  const L = s.peek();
  assert(L && L.items.length === 3 &&
         L.items[0].value.eq(6) && L.items[1].value.eq(9) && L.items[2].value.eq(12),
         'session045: DOSUBS window=3 sum → { 6 9 12 }');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  s.push(Program([Name('+')]));
  lookup('STREAM').fn(s);
  assert(s.peek().value.eq(10),
         'session045: STREAM { 1 2 3 4 } + → 10');
}

{
  const s = new Stack();
  s.push(RList([Real(42)]));
  s.push(Program([Name('+')]));
  lookup('STREAM').fn(s);
  assert(s.peek().value.eq(42),
         'session045: STREAM on single-element list → that element');
}

{
  const s = new Stack();
  s.push(RList([]));
  s.push(Program([Name('+')]));
  assertThrows(() => lookup('STREAM').fn(s), /Invalid dimension/,
               'session045: STREAM on empty list throws Invalid dimension');
}

{
  const s = new Stack();
  s.push(RList([Real(3), Real(7), Real(1), Real(9), Real(5)]));
  s.push(Program([Name('MAX')]));
  lookup('STREAM').fn(s);
  assert(s.peek().value.eq(9),
         'session045: STREAM MAX → max of list');
}

/* ---- DOLIST / DOSUBS / STREAM: bad-program detection ---- */
//
// The delta check is "does the program have the expected +1 net effect
// on the stack per call?" — so a prog that leaves the stack deeper or
// shallower than +1 throws.  For STREAM/DOSUBS the pushed-args count
// matters: a window-2 DOSUBS with `DROP` (consumes 1, leaves 1) lands
// at the same stack depth as the happy path (coincidence), so we need
// a clearly-bad program like `DROP DROP` to surface the error reliably.
{
  // STREAM: `DROP DROP` consumes both args and produces 0 → delta 0
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Program([Name('DROP'), Name('DROP')]));
  assertThrows(() => lookup('STREAM').fn(s), /bad program/i,
               'session045: STREAM with DROP-DROP program throws bad program');
}
{
  // DOSUBS window=2 with `DROP DROP` consumes both window items → delta 0
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(2n));
  s.push(Program([Name('DROP'), Name('DROP')]));
  assertThrows(() => lookup('DOSUBS').fn(s), /bad program/i,
               'session045: DOSUBS with DROP-DROP program throws bad program');
}
{
  // DOLIST with a 2-push program (net +1 per element expected, not +2)
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(Program([Name('DUP')]));         // net +1 extra per call
  assertThrows(() => lookup('DOLIST').fn(s), /bad program/i,
               'session045: DOLIST with DUP (delta=+2) throws bad program');
}


{
  const s = new Stack();
  try { lookup('NSUB').fn(s); assert(false, 'NSUB outside DOSUBS should throw'); }
  catch (e) { assert(/Undefined local name/i.test(e.message),
    'session046: NSUB outside DOSUBS → Undefined local name'); }
}
{
  const s = new Stack();
  try { lookup('ENDSUB').fn(s); assert(false, 'ENDSUB outside DOSUBS should throw'); }
  catch (e) { assert(/Undefined local name/i.test(e.message),
    'session046: ENDSUB outside DOSUBS → Undefined local name'); }
}

/* ---- NSUB inside DOSUBS: collect window indices with a
       « DROP DROP NSUB » program that returns the 1-based index ---- */
{
  const s = new Stack();
  s.push(RList([Real(10), Real(20), Real(30), Real(40)]));
  s.push(Integer(2));
  s.push(Program(parseEntry('« DROP DROP NSUB »')[0].tokens));
  lookup('DOSUBS').fn(s);
  const out = s.peek();
  assert(s.depth === 1 && isInteger(out.items[0]) && Number(out.items[0].value) === 1,
    'session046: NSUB first window → 1');
  assert(Number(out.items[1].value) === 2,  'session046: NSUB second window → 2');
  assert(Number(out.items[2].value) === 3,  'session046: NSUB third window → 3');
  assert(out.items.length === 3,            'session046: 4-len / width-2 = 3 windows');
}

/* ---- ENDSUB inside DOSUBS: return the total number of windows ---- */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4), Real(5)]));
  s.push(Integer(2));
  s.push(Program(parseEntry('« DROP DROP ENDSUB »')[0].tokens));
  lookup('DOSUBS').fn(s);
  const out = s.peek();
  assert(out.items.length === 4, 'session046: DOSUBS len=5 win=2 → 4 windows');
  for (const r of out.items) {
    assert(isInteger(r) && Number(r.value) === 4,
      'session046: ENDSUB pushes total = 4');
  }
}

/* ---- NSUB / ENDSUB frame cleared after DOSUBS finishes ---- */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(Integer(1));
  s.push(Program(parseEntry('« NSUB + »')[0].tokens));
  lookup('DOSUBS').fn(s);
  try { lookup('NSUB').fn(s); assert(false, 'NSUB after DOSUBS frame pop should throw'); }
  catch (e) { assert(/Undefined local name/i.test(e.message),
    'session046: NSUB cleared after DOSUBS completes'); }
}

/* ---- NSUB + ENDSUB combined inside DOSUBS: pack into a pair ---- */
{
  // Program: « DROP NSUB ENDSUB 2 →LIST » — per window, return
  // { nsub endsub } as a small list so the outer result is a
  // list-of-lists.  Bypasses the Integer/Integer arithmetic nuance.
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
  s.push(Integer(1));
  s.push(Program(parseEntry('« DROP NSUB ENDSUB 2 →LIST »')[0].tokens));
  lookup('DOSUBS').fn(s);
  const out = s.peek();
  assert(out.items.length === 4, 'session046: 4 windows for len=4 win=1');
  for (let i = 0; i < 4; i++) {
    const pair = out.items[i];
    assert(isList(pair) && pair.items.length === 2
        && Number(pair.items[0].value) === i + 1
        && Number(pair.items[1].value) === 4,
      `session046: window ${i + 1} → { ${i + 1} 4 } (NSUB/ENDSUB together)`);
  }
}

/* ---- Nested DOSUBS: inner frame wins ---- */
{
  // Outer DOSUBS over a 2-elem list, window 1, program that invokes
  // an inner DOSUBS.  Inner DOSUBS runs over a separate list; inside
  // the inner program, NSUB should read the INNER frame's index.
  //
  // We build a list of lists and use MAP-like composition.  Easier
  // to verify: outer list is {10 20}; inner program pushes a list
  // {100 200} and runs DOSUBS over it with window 1, returning
  // each NSUB.  So every outer iteration, inner DOSUBS returns
  // {1 2}.  Outer collects 2 copies of that list.
  const s = new Stack();
  s.push(RList([Real(10), Real(20)]));
  s.push(Integer(1));
  s.push(Program(parseEntry(
    '« DROP { 100 200 } 1 « DROP NSUB » DOSUBS »')[0].tokens));
  lookup('DOSUBS').fn(s);
  const outer = s.peek();
  assert(outer.items.length === 2, 'session046: outer DOSUBS → 2 windows');
  for (const inner of outer.items) {
    assert(isList(inner) && inner.items.length === 2
        && Number(inner.items[0].value) === 1
        && Number(inner.items[1].value) === 2,
      'session046: nested DOSUBS — inner NSUB reads inner frame');
  }
}


{
  const s = new Stack();
  s.push(RList([Real(10), Real(20), Real(30)]));
  s.push(Integer(2));
  lookup('GETI').fn(s);
  assert(s.depth === 3, 'session052: GETI pushes container+idx+elt (3 items)');
  const elt = s.pop();
  const nxt = s.pop();
  const lst = s.pop();
  assert(isList(lst) && lst.items.length === 3, 'session052: GETI leaves list intact');
  assert(isInteger(nxt) && nxt.value === 3n, 'session052: GETI advances 2 → 3');
  assert(isReal(elt) && elt.value.eq(20), 'session052: GETI returns item at original idx');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(3));
  lookup('GETI').fn(s);
  const elt = s.pop();
  const nxt = s.pop();
  s.pop();   // drop list
  assert(isInteger(nxt) && nxt.value === 1n,
    'session052: GETI wraps last idx (3) → 1');
  assert(elt.value.eq(3), 'session052: GETI last-idx item is the last element');
}

{
  const s = new Stack();
  s.push(Vector([Real(5), Real(6), Real(7)]));
  s.push(Integer(1));
  lookup('GETI').fn(s);
  const elt = s.pop();
  const nxt = s.pop();
  assert(isInteger(nxt) && nxt.value === 2n, 'session052: GETI on Vector idx 1 → 2');
  assert(elt.value.eq(5), 'session052: GETI on Vector returns first element');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(Integer(5));
  assertThrows(() => lookup('GETI').fn(s), /Bad argument/,
               'session052: GETI out-of-range throws');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2), Real(3)],
    [Real(4), Real(5), Real(6)],
  ]));
  s.push(RList([Integer(1), Integer(2)]));    // start at (1,2)
  lookup('GETI').fn(s);
  const elt = s.pop();
  const nxt = s.pop();
  s.pop();    // drop matrix
  assert(isList(nxt) && nxt.items.length === 2
      && nxt.items[0].value === 1n && nxt.items[1].value === 3n,
    'session052: GETI Matrix (1,2) → next (1,3) column-major');
  assert(elt.value.eq(2), 'session052: GETI Matrix returns (1,2) entry');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(10), Real(20)],
    [Real(30), Real(40)],
  ]));
  s.push(RList([Integer(1), Integer(2)]));    // last col of row 1
  lookup('GETI').fn(s);
  s.pop();      // elt
  const nxt = s.pop();
  s.pop();      // matrix
  assert(nxt.items[0].value === 2n && nxt.items[1].value === 1n,
    'session052: GETI Matrix (1,last-col) wraps to (2,1)');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(10), Real(20)],
    [Real(30), Real(40)],
  ]));
  s.push(RList([Integer(2), Integer(2)]));
  lookup('GETI').fn(s);
  s.pop();
  const nxt = s.pop();
  s.pop();
  assert(nxt.items[0].value === 1n && nxt.items[1].value === 1n,
    'session052: GETI Matrix (last,last) wraps to (1,1)');
}

{
  const s = new Stack();
  s.push(Str('hello'));
  s.push(Integer(1));
  lookup('GETI').fn(s);
  const elt = s.pop();
  const nxt = s.pop();
  s.pop();
  assert(isString(elt) && elt.value === 'h',
    'session052: GETI String returns 1-char Str');
  assert(nxt.value === 2n, 'session052: GETI String advances index');
}

{
  const s = new Stack();
  s.push(Real(42));
  s.push(Integer(1));
  assertThrows(() => lookup('GETI').fn(s), /Bad argument/,
               'session052: GETI on Real throws Bad argument type');
}

{
  const s = new Stack();
  s.push(RList([Real(10), Real(20), Real(30)]));
  s.push(Integer(2));
  s.push(Real(99));
  lookup('PUTI').fn(s);
  assert(s.depth === 2, 'session052: PUTI leaves container + next idx');
  const nxt = s.pop();
  const lst = s.pop();
  assert(isInteger(nxt) && nxt.value === 3n, 'session052: PUTI advances 2 → 3');
  assert(isList(lst) && lst.items.length === 3
      && lst.items[1].value.eq(99),
    'session052: PUTI patches index 2 → 99');
  assert(lst.items[0].value.eq(10) && lst.items[2].value.eq(30),
    'session052: PUTI leaves other items alone');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(3));
  s.push(Real(42));
  lookup('PUTI').fn(s);
  const nxt = s.pop();
  const lst = s.pop();
  assert(nxt.value === 1n, 'session052: PUTI wraps last idx → 1');
  assert(lst.items[2].value.eq(42), 'session052: PUTI still writes at original idx');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  s.push(Integer(1));
  s.push(Real(7));
  lookup('PUTI').fn(s);
  const nxt = s.pop();
  const v = s.pop();
  assert(v.items[0].value.eq(7) && nxt.value === 2n,
    'session052: PUTI on Vector writes + advances');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(3), Real(4)],
  ]));
  s.push(RList([Integer(1), Integer(2)]));
  s.push(Real(99));
  lookup('PUTI').fn(s);
  const nxt = s.pop();
  const M = s.pop();
  assert(M.rows[0][1].value.eq(99), 'session052: PUTI Matrix writes at (1,2)');
  assert(nxt.items[0].value === 2n && nxt.items[1].value === 1n,
    'session052: PUTI Matrix (1,2) advances to (2,1) column-major');
  assert(M.rows[0][0].value.eq(1) && M.rows[1][0].value.eq(3) && M.rows[1][1].value.eq(4),
    'session052: PUTI Matrix leaves other cells alone');
}

{
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Integer(5));
  s.push(Real(0));
  assertThrows(() => lookup('PUTI').fn(s), /Bad argument/,
               'session052: PUTI out-of-range throws');
}

{
  const s = new Stack();
  s.push(Str('abc'));
  s.push(Integer(1));
  s.push(Str('z'));
  assertThrows(() => lookup('PUTI').fn(s), /Bad argument/,
               'session052: PUTI on String throws (strings immutable)');
}



{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(Integer(3n));
  lookup('APPEND').fn(s);
  const l = s.peek();
  assert(l.type === 'list' && l.items.length === 3 &&
         l.items.map(i => i.value).join(',') === '1,2,3',
    'session053: APPEND {1 2} 3 → {1 2 3}');
}

{
  const s = new Stack();
  s.push(RList([]));
  s.push(Str('first'));
  lookup('APPEND').fn(s);
  const l = s.peek();
  assert(l.items.length === 1 && l.items[0].value === 'first',
    'session053: APPEND on empty list');
}

{
  const s = new Stack();
  s.push(RList([Integer(1n)]));
  s.push(Real(2.5));
  lookup('APPEND').fn(s);
  s.push(Str('three'));
  lookup('APPEND').fn(s);
  const l = s.peek();
  assert(l.items.length === 3 &&
         l.items[0].type === 'integer' && l.items[1].type === 'real' && l.items[2].type === 'string',
    'session053: APPEND builds heterogeneous list');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  assertThrows(() => lookup('APPEND').fn(s), /Bad argument/,
               'session053: APPEND on non-list throws');
}

{
  const original = RList([Integer(1n), Integer(2n)]);
  const s = new Stack();
  s.push(original);
  s.push(Integer(3n));
  lookup('APPEND').fn(s);
  assert(original.items.length === 2,
    'session053: APPEND does not mutate source list (immutable model)');
}

/* =================================================================
   List distribution — HP50 AUR §12.3.  Most scalar-domain commands
   auto-distribute element-wise when given a List.
   ================================================================= */

// Perfect squares stay exact (Integer) in EXACT mode.
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(4n), Integer(9n)]));
  lookup('SQRT').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 3
      && Number(out.items[0].value) === 1
      && Number(out.items[1].value) === 2
      && Number(out.items[2].value) === 3,
    'list-distribute: {1 4 9} SQRT → {1 2 3}');
}

{
  const s = new Stack();
  s.push(RList([Real(-3), Real(4), Real(-5)]));
  lookup('ABS').fn(s);
  const out = s.peek();
  assert(out.items.map(v => v.value).join(',') === '3,4,5',
    'list-distribute: {-3 4 -5} ABS → {3 4 5}');
}

{
  const s = new Stack();
  s.push(RList([Integer(0n), Integer(1n), Integer(2n)]));
  lookup('NEG').fn(s);
  const out = s.peek();
  assert(out.items.map(v => Number(v.value)).join(',') === '0,-1,-2',
    'list-distribute: {0 1 2} NEG → {0 -1 -2}');
}

// ---- `+` on a list is HP50 concatenation, NOT element-wise (AUR §3-7) ----
//      {1 2 3} 2 +    → {1 2 3 2}        (append)
//      2 {1 2 3} +    → {2 1 2 3}        (prepend)
//      {1 2 3} {10 20 30} + → {1 2 3 10 20 30}  (concatenate)
//      Mismatched-length lists STILL concatenate — there is no
//      "Invalid dimension" branch for `+` over lists; element-wise
//      list arithmetic is reserved for ADD / DOLIST.
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  s.push(Integer(2n));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.map(v => Number(v.value)).join(',') === '1,2,3,2',
    'list +: {1 2 3} 2 + → {1 2 3 2}  (append)');
}

{
  const s = new Stack();
  s.push(Integer(2n));
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.map(v => Number(v.value)).join(',') === '2,1,2,3',
    'list +: 2 {1 2 3} + → {2 1 2 3}  (prepend)');
}

// `*` and the rest of the binary family STILL distribute element-wise —
// the HP50 carve-out is only for `+`.  Keep this assertion to lock that.
{
  const s = new Stack();
  s.push(Integer(10n));
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('*').fn(s);
  const out = s.peek();
  assert(out.items.map(v => Number(v.value)).join(',') === '10,20,30',
    'list-distribute: 10 {1 2 3} * → {10 20 30}  (`*` still distributes)');
}

{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  s.push(RList([Integer(10n), Integer(20n), Integer(30n)]));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.map(v => Number(v.value)).join(',') === '1,2,3,10,20,30',
    'list +: {1 2 3} {10 20 30} + → {1 2 3 10 20 30}  (concat)');
}

// Mismatched lengths NO LONGER throw — concatenation is length-agnostic.
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(RList([Integer(10n), Integer(20n), Integer(30n)]));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.map(v => Number(v.value)).join(',') === '1,2,10,20,30',
    'list +: mismatched-length lists concatenate, no Invalid dimension');
}

// Heterogeneous: a String operand is treated as a list element, NOT
// promoted to string-concat semantics — list precedence beats String.
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(Str('hi'));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.length === 3
      && Number(out.items[0].value) === 1
      && Number(out.items[1].value) === 2
      && isString(out.items[2])
      && out.items[2].value === 'hi',
    'list +: {1 2} "hi" + → {1 2 "hi"}  (list precedence over String)');
}

// Nested list + scalar: scalar appended at the OUTER level,
// inner list is preserved as a single element.
{
  const s = new Stack();
  s.push(RList([Integer(1n), RList([Integer(2n), Integer(3n)])]));
  s.push(Integer(9n));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out)
      && out.items.length === 3
      && Number(out.items[0].value) === 1
      && isList(out.items[1])
      && out.items[1].items.map(v => Number(v.value)).join(',') === '2,3'
      && Number(out.items[2].value) === 9,
    'list +: {1 {2 3}} 9 + → {1 {2 3} 9}  (no recursive distribution)');
}

// Perfect squares stay exact (Integer) in EXACT mode.
{
  const s = new Stack();
  s.push(RList([Integer(1n), RList([Integer(4n), Integer(9n)])]));
  lookup('SQRT').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 2
      && Number(out.items[0].value) === 1
      && isList(out.items[1]) && out.items[1].items.length === 2
      && Number(out.items[1].items[0].value) === 2
      && Number(out.items[1].items[1].value) === 3,
    'list-distribute: nested {1 {4 9}} SQRT → {1 {2 3}}');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(RList([Real(0), Real(Math.PI / 2)]));
  lookup('SIN').fn(s);
  const out = s.peek();
  assert(Math.abs(out.items[0].value) < 1e-15 && Math.abs(out.items[1].value - 1) < 1e-15,
    'list-distribute: {0 π/2} SIN → {0 1}');
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(Math.E)]));
  lookup('LN').fn(s);
  const out = s.peek();
  assert(Math.abs(out.items[0].value) < 1e-15 && Math.abs(out.items[1].value - 1) < 1e-15,
    'list-distribute: {1 e} LN → {0 1}');
}

{
  const s = new Stack();
  s.push(RList([]));
  lookup('SQRT').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 0, 'list-distribute: {} SQRT → {}');
}

// ---- Empty list `+` scalar = single-element list (HP50 append) ----
//      {} 5 +  → {5}     (append into the empty list)
//      5 {} +  → {5}     (prepend into the empty list)
//      {} {} + → {}      (concat of two empties)
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Integer(5n));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 1 && Number(out.items[0].value) === 5,
    'list +: {} 5 + → {5}');
}
{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(RList([]));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 1 && Number(out.items[0].value) === 5,
    'list +: 5 {} + → {5}');
}
{
  const s = new Stack();
  s.push(RList([]));
  s.push(RList([]));
  lookup('+').fn(s);
  const out = s.peek();
  assert(isList(out) && out.items.length === 0,
    'list +: {} {} + → {}');
}

{
  const s = new Stack();
  s.push(RList([Integer(3n), Integer(1n), Integer(7n)]));
  s.push(RList([Integer(5n), Integer(2n), Integer(4n)]));
  lookup('MIN').fn(s);
  const out = s.peek();
  assert(out.items.map(v => Number(v.value)).join(',') === '3,1,4',
    'list-distribute: element-wise MIN');
}

{
  const s = new Stack();
  s.push(RList([Integer(8n), Integer(27n)]));
  s.push(Integer(3n));
  lookup('XROOT').fn(s);
  const out = s.peek();
  assert(Math.abs(out.items[0].value - 2) < 1e-10
      && Math.abs(out.items[1].value - 3) < 1e-10,
    'list-distribute: {8 27} 3 XROOT → {2 3}');
}

/* ================================================================
   List EVAL — HP50 AUR §3-77 says EVAL on a List "enters each
   object: names evaluated, commands evaluated, programs evaluated,
   other objects put on the stack."  Mechanically equivalent to
   running the items as the body of an anonymous program.

   Pinning at ship-prep 2026-04-25-r4 to lock the new behavior;
   pre-r4 List EVAL was a no-op push that fell through to the
   _evalValueSync catch-all.
   ================================================================ */

{
  const s = new Stack();
  s.push(RList([]));
  lookup('EVAL').fn(s);
  assert(s.depth === 0, 'List EVAL: empty list consumes itself, pushes nothing');
}

{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Name('+')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1, 'List EVAL: { 1 2 + } leaves one value');
  assert(s.peek().value === 3n, 'List EVAL: { 1 2 + } yields 3');
}

{
  const s = new Stack();
  s.push(RList([Integer(10n), Integer(20n), Integer(30n)]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'List EVAL: { 10 20 30 } pushes three values');
  assert(s._items[0].value === 10n
      && s._items[1].value === 20n
      && s._items[2].value === 30n,
         'List EVAL: literal items land in order');
}

{
  resetHome();
  varStore('K', Real(99));
  const s = new Stack();
  s.push(RList([Name('K')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value.eq(99),
    'List EVAL: { K } looks up K and pushes its bound value');
  resetHome();
}

{
  const s = new Stack();
  s.push(RList([Program([Integer(7n), Integer(8n), Name('*')])]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 56n,
    'List EVAL: { « 7 8 * » } runs the embedded program');
}

{
  const s = new Stack();
  s.push(RList([Name('X', { quoted: true })]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isName(s.peek()) && s.peek().id === 'X' && s.peek().quoted,
    'List EVAL: quoted Name stays a quoted Name (matches program-body semantics)');
}

// Error in a list item rolls back to the post-pop snapshot — the list
// itself is consumed (R-009 generalization), partial pushes unwound.
{
  resetHome();
  const s = new Stack();
  s.push(Real(100));                 // pre-existing item — should survive
  s.push(RList([Integer(1n), Integer(0n), Name('/')]));
  let threw = false;
  try { lookup('EVAL').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'List EVAL with 1/0 throws');
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(100),
    'List EVAL error: list consumed, body pushes unwound, pre-existing Real(100) survives');
  resetHome();
}
