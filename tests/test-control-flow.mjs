import { Stack } from '../www/src/rpl/stack.js';
import { lookup, localFramesDepth, singleStepMode, stepIntoMode, dosubsStackDepth } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
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
  setHalted, getHalted, clearHalted, clearAllHalted, haltedDepth,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* Control flow — IFT / IFTE, IF/THEN/ELSE/END, WHILE, DO/UNTIL, START,
   FOR/NEXT/STEP (incl. Integer-aware variant), IFERR. */

/* ================================================================
   IFT / IFTE — stack-based conditionals
   ================================================================ */

// IFT: test true runs the action
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));                     // test = true
  s.push(Program([Integer(99)]));      // action: pushes 99
  lookup('IFT').fn(s);
  assert(s.depth === 1 && s.peek().value === 99n,
         'IFT with true test runs the action');
}

// IFT: test false drops both without running
{
  resetHome();
  const s = new Stack();
  s.push(Real(0));
  s.push(Program([Integer(99)]));
  lookup('IFT').fn(s);
  assert(s.depth === 0, 'IFT with false test consumed both, ran nothing');
}

// IFT with a plain value as the action pushes it
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Integer(7));                  // non-program action
  lookup('IFT').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
         'IFT with true + plain value pushes value');
}

// IFTE: test true runs t-action
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Program([Integer(10)]));
  s.push(Program([Integer(20)]));
  lookup('IFTE').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n, 'IFTE true → t-action');
}

// IFTE: test false runs f-action
{
  resetHome();
  const s = new Stack();
  s.push(Real(0));
  s.push(Program([Integer(10)]));
  s.push(Program([Integer(20)]));
  lookup('IFTE').fn(s);
  assert(s.depth === 1 && s.peek().value === 20n, 'IFTE false → f-action');
}

// IFTE with plain values selects between them
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(3.14));
  s.push(Real(2.71));
  lookup('IFTE').fn(s);
  assert(Math.abs(s.peek().value - 3.14) < 1e-12, 'IFTE selects 3.14 when true');
}

/* ================================================================
   IF / THEN / ELSE / END inside Programs
   ================================================================ */

// IF/THEN/END with true
{
  resetHome();
  const s = new Stack();
  // << 1 IF 1 THEN 2 + END >>  ⇒ 3
  s.push(Program([
    Integer(1),
    Name('IF'), Integer(1), Name('THEN'), Integer(2), Name('+'), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
         '<< 1 IF 1 THEN 2 + END >> leaves 3');
}

// IF/THEN/END with false skips the branch
{
  resetHome();
  const s = new Stack();
  // << 42 IF 0 THEN DROP END >>  ⇒ 42 left alone
  s.push(Program([
    Integer(42),
    Name('IF'), Integer(0), Name('THEN'), Name('DROP'), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
         'IF 0 skips the THEN branch');
}

// IF/THEN/ELSE/END with true selects THEN
{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN 'YES' ELSE 'NO' END >>
  s.push(Program([
    Name('IF'), Integer(1), Name('THEN'),
    Str('YES'),
    Name('ELSE'),
    Str('NO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 'YES', 'IF 1 THEN...ELSE... picks THEN');
}

// IF/THEN/ELSE/END with false selects ELSE
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(0), Name('THEN'),
    Str('YES'),
    Name('ELSE'),
    Str('NO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 'NO', 'IF 0 THEN...ELSE... picks ELSE');
}

// Nested IF: test that inner END doesn't match outer IF
{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN IF 1 THEN 100 END 200 + END >>
  // Inner IF pushes 100; outer adds 200 → 300
  s.push(Program([
    Name('IF'), Integer(1), Name('THEN'),
      Name('IF'), Integer(1), Name('THEN'), Integer(100), Name('END'),
      Integer(200), Name('+'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 300n,
         'nested IFs match their own ENDs');
}

// IF test uses a comparison op
{
  resetHome();
  const s = new Stack();
  // << 5 IF DUP 3 > THEN 'BIG' ELSE 'SMALL' END >>
  // DUP leaves 5 on top; 3 > compares; still 5 on stack; if true push 'BIG'
  s.push(Program([
    Integer(5),
    Name('IF'), Name('DUP'), Integer(3), Name('>'), Name('THEN'),
      Str('BIG'),
    Name('ELSE'),
      Str('SMALL'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  // Stack should be: level 2 = 5, level 1 = 'BIG'
  assert(s.depth === 2 && s.peek(2).value === 5n && s.peek().value === 'BIG',
         'IF test with comparison picks THEN for 5 > 3');
}

// Parse an IF directly from source
{
  resetHome();
  const s = new Stack();
  const vs = parseEntry('<< IF 1 THEN 7 ELSE 9 END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 7n, 'parsed IF/THEN/ELSE/END picks THEN for 1');
}

/* ================================================================
   WHILE / REPEAT / END and DO / UNTIL / END
   ================================================================ */

// WHILE: sum 1..5 using a counter
{
  resetHome();
  varStore('N', Real(1));
  varStore('TOTAL', Real(0));
  const s = new Stack();
  // << WHILE 'N' RCL 5 ≤ REPEAT
  //      'TOTAL' RCL 'N' RCL + 'TOTAL' STO
  //      'N' RCL 1 + 'N' STO
  //    END >>
  s.push(Program([
    Name('WHILE'),
      Name('N', { quoted: true }), Name('RCL'), Integer(5), Name('≤'),
    Name('REPEAT'),
      Name('TOTAL', { quoted: true }), Name('RCL'),
      Name('N', { quoted: true }),  Name('RCL'), Name('+'),
      Name('TOTAL', { quoted: true }), Name('STO'),
      Name('N', { quoted: true }),  Name('RCL'), Integer(1), Name('+'),
      Name('N', { quoted: true }),  Name('STO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  const sum = varRecall('TOTAL');
  assert(sum && sum.value.eq(15), 'WHILE loop sums 1..5 to 15');
}

// WHILE with a false test from the start never enters the body
{
  resetHome();
  const s = new Stack();
  // << 0 WHILE 0 REPEAT 1 + END >>
  s.push(Program([
    Integer(0),
    Name('WHILE'), Integer(0), Name('REPEAT'),
      Integer(1), Name('+'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 0n,
         'WHILE 0 never runs the body');
}

// DO/UNTIL runs at least once
{
  resetHome();
  const s = new Stack();
  // << 0 DO 1 + UNTIL DUP 3 ≥ END >>  — runs 3 times, leaves 3
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'),
    Name('UNTIL'),
      Name('DUP'), Integer(3), Name('≥'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
         'DO/UNTIL increments until test true, leaves 3');
}

/* ================================================================
   START / NEXT / STEP counter loops
   ================================================================ */

// START/NEXT: body runs (end - start + 1) times
{
  resetHome();
  const s = new Stack();
  // 0 on stack; then 1 3 START 1 + NEXT  ⇒ body runs 3 times → 3
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('START'),
      Integer(1), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 3n, 'START/NEXT 1..3 runs body 3 times');
}

// START/STEP with positive step
{
  resetHome();
  const s = new Stack();
  // 0 on stack; 1 10 START 1 + 3 STEP  — counter 1,4,7,10 → 4 iterations → 4
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(10), Name('START'),
      Integer(1), Name('+'),
      Integer(3),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 4n, 'START/STEP 1..10 step 3 runs body 4 times');
}

// START/STEP with negative step
{
  resetHome();
  const s = new Stack();
  // 0 on stack; 10 1 START 1 + -3 STEP — counter 10,7,4,1 → 4 iterations → 4
  s.push(Integer(0));
  s.push(Program([
    Integer(10), Integer(1), Name('START'),
      Integer(1), Name('+'),
      Integer(-3),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 4n, 'START/STEP 10..1 step -3 runs body 4 times');
}

/* ================================================================
   FOR / NEXT / STEP — counter bound to a loop variable
   ================================================================ */

// FOR/NEXT: sum I for I = 1..5 → 15
//   Both bounds Integer ⇒ loop counter stays Integer (BigInt) for
//   the whole loop, so the accumulator stays Integer too.
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  // 1 5 FOR I I + NEXT
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 15n,
         'FOR/NEXT sum of 1..5 = 15 (Integer preserved)');
  // Loop variable should be purged after the loop (was unbound before).
  assert(varRecall('I') === undefined, 'FOR loop var I purged after exit');
}

// FOR/STEP with step = 2 sums 1 + 3 + 5 = 9
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
      Integer(2),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'FOR/STEP 1..5 step 2 sum is 9 (Integer preserved)');
}

// FOR with a prior binding is restored after the loop
{
  resetHome();
  varStore('I', Real(99));
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 6n,
         'FOR loop computes 1+2+3 = 6 (Integer preserved)');
  assert(varRecall('I')?.value.eq(99),
         'prior binding of I restored after FOR loop');
}

// Nested FOR: multiplication table-ish — sum of i*j for i=1..3, j=1..3
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Integer(1), Integer(3), Name('FOR'), Name('J'),
        Name('I'), Name('J'), Name('*'), Name('+'),
      Name('NEXT'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  // sum i*j for i,j in 1..3 = (1+2+3)*(1+2+3) = 36
  assert(isInteger(s.peek()) && s.peek().value === 36n,
         'nested FOR computes 36 (Integer preserved)');
}

// Parse + EVAL from source: IF reads test from the stack (empty test block)
{
  resetHome();
  const s = new Stack();
  // Note: "YES" (double quotes) parses as String; 'YES' (single quotes)
  // would be a quoted Name — different type.  HP50 programs typically
  // evaluate the test *inside* IF..THEN, but both forms are legal.
  const vs = parseEntry('<< 10 5 > IF THEN "YES" ELSE "NO" END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 'YES',
         'HP50-style IF with empty test block reads test from stack');
}

// Atomicity: error mid-loop restores the original stack
{
  resetHome();
  const s = new Stack();
  s.push(Real(100));
  // Program divides by zero on the 2nd iteration
  s.push(Program([
    Integer(1), Integer(2), Name('START'),
      Integer(1), Integer(0), Name('/'),
    Name('NEXT'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'START loop with 1/0 in body throws');
  // Pin the HP50 error-message shape on the START div-by-zero surface.
  assert(/Infinite result/.test(err.message),
    'session122: START div-by-zero raises "Infinite result"');
  // EVAL's snapshot is post-pop, so on error the erroring Program is
  // consumed and only the pre-EVAL Real(100) remains.
  assert(s.depth === 1, 'stack restored to post-pop depth after START error (Program consumed)');
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(100),
         'pre-existing Real(100) preserved after rollback');
}

/* ================================================================
   IFERR / THEN / [ELSE] / END — error-trap control flow
   + ERRM / ERRN / ERR0 companion ops

   HP50 IFERR semantics:
     - On error in trap → stack restored to pre-IFERR state, last-error
       slot populated, THEN branch runs.
     - On success + no ELSE → trap's stack result kept as-is.
     - On success + ELSE → ELSE branch runs on trap's stack result.
   ERRM / ERRN read the slot; ERR0 clears it.
   ================================================================ */

// IFERR: no-error path, no ELSE — stack result of trap is preserved
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 10 IFERR 1 2 + THEN 99 END >>  → trap pushes 3, no error → stack = 10 3
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(99),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 10n && s.peek(1).value === 3n,
         'IFERR success path without ELSE keeps trap result (10, 3)');
}

// IFERR: error in trap → stack rolled back, THEN runs
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 10 IFERR 1 0 / THEN 999 END >>
  //   10 left alone; 1 0 / errors; stack rolls back to pre-IFERR (10 on top);
  //   THEN runs, pushing 999.  Final: 10 999.
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Integer(999),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 10n && s.peek(1).value === 999n,
         'IFERR error path rolls back trap residue + runs THEN');
}

// IFERR: error with ELSE — ELSE is NOT run when the trap errored
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 0 / THEN 7 ELSE 8 END >>   → 7 (error path)
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Integer(7),
    Name('ELSE'), Integer(8),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
         'IFERR error path runs THEN, not ELSE');
}

// IFERR: success with ELSE — ELSE runs, THEN does not
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 2 + THEN 99 ELSE 2 * END >>
  // trap leaves 3; no error; ELSE runs (2 *) → 6
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(99),
    Name('ELSE'), Integer(2), Name('*'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 6n,
         'IFERR success path runs ELSE on trap result');
}

// ERRM inside THEN returns the caught error's message as a String
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 0 / THEN ERRM END >>
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' &&
         s.peek().value === 'Infinite result',
         'ERRM inside THEN returns "Infinite result"');
}

// ERRN inside THEN returns the error number as a BinaryInteger in hex.
{
  resetHome();
  clearLastError();
  const s = new Stack();
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) &&
         s.peek().value === 0x305n && s.peek().base === 'h',
         'ERRN returns the mapped HP50-ish code for "Infinite result" (#305h)');
}

// ERR0 clears the last-error slot
{
  resetHome();
  setLastError(new Error('something'));
  assert(getLastError() !== null, 'precondition: lastError populated');
  const s = new Stack();
  lookup('ERR0').fn(s);
  assert(getLastError() === null, 'ERR0 clears last-error slot');
  assert(s.depth === 0, 'ERR0 pushes nothing');
}

// ERRM when no error has been recorded returns empty string
{
  clearLastError();
  const s = new Stack();
  lookup('ERRM').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' && s.peek().value === '',
         'ERRM with no last error returns empty string');
}

// ERRN when no error has been recorded returns #0h
{
  clearLastError();
  const s = new Stack();
  lookup('ERRN').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) &&
         s.peek().value === 0n && s.peek().base === 'h',
         'ERRN with no last error returns #0h');
}

// Error-number mapping: "Bad argument type" → 0x202, "Too few arguments" → 0x201,
// "Undefined name: FOO" → 0x204.  Sanity-check that the classifier picks the
// right code from the message prefix.
{
  clearLastError();
  setLastError({ message: 'Bad argument type' });
  assert(getLastError().number === 0x202, 'map: Bad argument type → 0x202');
  setLastError({ message: 'Too few arguments' });
  assert(getLastError().number === 0x201, 'map: Too few arguments → 0x201');
  setLastError({ message: 'Undefined name: FOO' });
  assert(getLastError().number === 0x204,
         'map: Undefined name prefix → 0x204');
  setLastError({ message: 'some made-up error' });
  assert(getLastError().number === 0, 'unknown error message → 0');
  clearLastError();
}

// IFERR catches Undefined-name RCL error and ERRN reports 0x204
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 'NOPE' IFERR RCL THEN DROP ERRN END >>
  //   'NOPE' is on stack; IFERR RCL throws; THEN drops the Name and pushes ERRN.
  s.push(Program([
    Name('NOPE', { quoted: true }),
    Name('IFERR'), Name('RCL'),
    Name('THEN'), Name('DROP'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) && s.peek().value === 0x204n,
         'IFERR around failed RCL: ERRN = #204h');
}

// Nested IFERR: inner catches its own, outer sees a clean no-error on exit
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // Outer IFERR has a benign trap (pushes 1).  Inner IFERR sits after
  // the trap; it catches its own 1/0 error and pushes 'CAUGHT'.
  // Outer's ELSE runs because its trap didn't itself error.
  // << IFERR 1 IFERR 1 0 / THEN "inner" END THEN 99 ELSE "outer-ok" END >>
  s.push(Program([
    Name('IFERR'),
      Integer(1),
      Name('IFERR'), Integer(1), Integer(0), Name('/'),
      Name('THEN'), Str('inner'),
      Name('END'),
    Name('THEN'), Integer(99),
    Name('ELSE'), Str('outer-ok'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  // After nesting: trap left 1 then inner's "inner"; ELSE runs → pushes "outer-ok".
  // Expected: 1, "inner", "outer-ok"
  assert(s.depth === 3 &&
         s.peek(3).value === 1n &&
         s.peek(2).value === 'inner' &&
         s.peek(1).value === 'outer-ok',
         'nested IFERR: inner catches, outer runs ELSE');
}

// IFERR without THEN throws a recognizable structural error
{
  resetHome();
  const s = new Stack();
  // << IFERR 1 2 + END >>  — no THEN
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'), Name('END'),
  ]));
  assertThrows(() => lookup('EVAL').fn(s),
               /IFERR without THEN/,
               'IFERR without THEN is a structural error');
  // EVAL's snapshot is post-pop, so on a structural-error throw the
  // Program is consumed (gone from the stack) and only the body's
  // partial pushes — none here, since the error is raised before any
  // push — remain.  End state is empty stack.
  assert(s.depth === 0,
    'ship-prep r3: malformed-IFERR throw consumes the Program (post-pop snapshot)');
}

// Parse IFERR from source and execute end-to-end
{
  resetHome();
  clearLastError();
  const s = new Stack();
  const vs = parseEntry('<< IFERR 1 0 / THEN ERRM ELSE "ok" END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().type === 'string' &&
         s.peek().value === 'Infinite result',
         'parsed IFERR/THEN/ELSE/END picks ERRM on error');
}

// State nesting: an inner IFERR's caught message does NOT leak out to an
// outer IFERR's THEN clause if both catch errors.  Each ERRM reads the
// error caught by *its own* enclosing IFERR's trap.
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // Outer trap: bind name NOPE, RCL it → "Undefined name: NOPE".  Inside
  // outer's THEN clause: an inner IFERR deliberately triggers 1/0, reads
  // ERRM into the stack, and the outer's THEN then reads its own ERRM.
  // Expected top-of-stack after evaluation:
  //   level 2: "Infinite result"   (inner's caught error)
  //   level 1: "Undefined name: NOPE"  (outer's caught error, preserved
  //            across the inner IFERR)
  s.push(Program([
    Name('IFERR'),
      Name('NOPE', { quoted: true }), Name('RCL'),
    Name('THEN'),
      Name('IFERR'), Integer(1), Integer(0), Name('/'),
      Name('THEN'), Name('ERRM'),
      Name('END'),
      Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 &&
         s.peek(2).value === 'Infinite result' &&
         s.peek(1).value === 'Undefined name: NOPE',
         'nested IFERR: outer ERRM survives inner trap via last-error restore');
}


// Integer-aware FOR/NEXT/STEP counter

// FOR loop stores loop variable as Integer when both bounds are Integer.
{
  resetHome();
  const s = new Stack();
  // Push a Program that records the TYPE of I into the result stack.
  // 1 3 FOR I I NEXT   ⇒ stack becomes the three I values pushed in order.
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR 1..3 pushed 3 I-values');
  // Each pushed I should be an Integer, not a Real.
  const [a, b, c] = [s.peek(3), s.peek(2), s.peek(1)];
  assert(isInteger(a) && a.value === 1n, 'FOR iter 1: I is Integer(1n)');
  assert(isInteger(b) && b.value === 2n, 'FOR iter 2: I is Integer(2n)');
  assert(isInteger(c) && c.value === 3n, 'FOR iter 3: I is Integer(3n)');
}

// FOR loop with Real bound demotes to Real.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Real(1.0), Integer(3), Name('FOR'), Name('I'),
      Name('I'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR 1.0..3 pushed 3 I-values');
  assert(isReal(s.peek(3)) && s.peek(3).value.eq(1),
         'FOR iter 1 (mixed bounds): I is Real(1)');
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(3),
         'FOR iter 3 (mixed bounds): I is Real(3)');
}

// FOR/STEP with Integer bounds AND Integer step stays Integer.
{
  resetHome();
  const s = new Stack();
  // 1 10 FOR I I 2 STEP  — I = 1,3,5,7,9 → 5 Integers
  s.push(Program([
    Integer(1), Integer(10), Name('FOR'), Name('I'),
      Name('I'),
      Integer(2),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 5, 'FOR 1..10 step 2 pushed 5 I-values');
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'FOR/STEP Integer-mode last I = 9n');
  assert(isInteger(s.peek(5)) && s.peek(5).value === 1n,
         'FOR/STEP Integer-mode first I = 1n');
}

// FOR/STEP with Integer bounds but Real step demotes to Real mode.
{
  resetHome();
  const s = new Stack();
  // 1 5 FOR I I 0.5 STEP   — I = 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
  // That's 9 iterations since the counter after I=5 is 5.5 > 5.
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'),
      Real(0.5),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 9, 'FOR 1..5 step 0.5 pushed 9 I-values');
  // Once the Real step arrives mid-loop, the counter flips to Real for the
  // remaining iterations.  The first stored I was still Integer(1).
  assert(isInteger(s.peek(9)) && s.peek(9).value === 1n,
         'FOR iter 1 (int mode before first STEP): I is Integer(1n)');
  assert(isReal(s.peek(8)) && s.peek(8).value.eq(1.5),
         'FOR iter 2 (after Real STEP, demoted): I is Real(1.5)');
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         'FOR iter 9 (Real mode): I is Real(5)');
}

// Negative Integer step — 5 1 FOR I I -1 STEP pushes 5,4,3,2,1 as Integers.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(5), Integer(1), Name('FOR'), Name('I'),
      Name('I'),
      Integer(-1),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 5, 'FOR 5..1 step -1 pushed 5 I-values');
  assert(isInteger(s.peek(5)) && s.peek(5).value === 5n,
         'FOR neg-step iter 1: I = 5n');
  assert(isInteger(s.peek()) && s.peek().value === 1n,
         'FOR neg-step iter 5: I = 1n');
}

// STEP of 0 still errors cleanly in Integer mode (was 'STEP of 0' before).
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'),
      Integer(0),
    Name('STEP'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           /STEP of 0/,
                           'FOR/STEP with Integer step of 0 throws');
  // Pin the exact "STEP of 0" message shape.
  assert(err.message === 'STEP of 0',
    'session122: FOR/STEP zero-step error message is exactly "STEP of 0"');
}

// Arithmetic on Integer loop var stays Integer:
//   1 3 FOR I I I * NEXT — 1*1 + 2*2 + 3*3 — we want individual Integer
//   products.  Here: 1*1, 2*2, 3*3 pushed as three Integers.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'), Name('I'), Name('*'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR pushed three I*I values');
  assert(isInteger(s.peek(3)) && s.peek(3).value === 1n,
         'I*I at I=1 is Integer(1n)');
  assert(isInteger(s.peek(2)) && s.peek(2).value === 4n,
         'I*I at I=2 is Integer(4n)');
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'I*I at I=3 is Integer(9n)');
}




{
  clearLastError();
  const s = new Stack();
  s.push(Str('custom fail'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'custom fail', 'session053: DOERR "custom fail" throws');
}

{
  clearLastError();
  const s = new Stack();
  s.push(Str(''));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Interrupted', 'session053: DOERR "" → Interrupted');
}

{
  clearLastError();
  const s = new Stack();
  s.push(BinaryInteger(0x201n, 'h'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Too few arguments',
    'session053: DOERR #201h → "Too few arguments"');
}

{
  clearLastError();
  const s = new Stack();
  s.push(Integer(0x305n));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Infinite result',
    'session053: DOERR Integer(0x305) → "Infinite result"');
}

{
  clearLastError();
  const s = new Stack();
  s.push(Integer(0n));
  let threw = false;
  try { lookup('DOERR').fn(s); } catch (e) { threw = true; }
  assert(!threw, 'session053: DOERR 0 does not throw');
  assert(s.depth === 0, 'session053: DOERR 0 leaves empty stack');
}

{
  const s = new Stack();
  s.push(Integer(0xFFFn));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(/Error: #FFFh/.test(caught),
    'session053: DOERR unknown code → hex-format fallback');
}

{
  const s = new Stack();
  s.push(Name('X'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(/Bad argument type/.test(caught),
    'session053: DOERR Name throws Bad argument type');
}

{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR "oops" DOERR THEN ERRM END >>
  s.push(Program([
    Name('IFERR'), Str('oops'), Name('DOERR'),
    Name('THEN'), Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' && s.peek().value === 'oops',
    'session053: IFERR traps DOERR; ERRM returns the custom message');
}

/* ================================================================
   CASE / THEN / END
   ================================================================

   Grammar:
     CASE
       test1 THEN action1 END
       test2 THEN action2 END
       ...
       [default]
     END

   Each THEN clause is its own body-END pair; the CASE itself is
   closed by the trailing outer END.  See runCase in src/rpl/ops.js. */

{
  resetHome();
  const s = new Stack();
  // << CASE
  //      1 THEN 111 END
  //      1 THEN 222 END    ← would also match but should be skipped
  //      333               ← default, also skipped
  //    END >>
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(111n), Name('END'),
    Integer(1n), Name('THEN'), Integer(222n), Name('END'),
    Integer(333n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 111n,
    'session067: CASE first matching clause runs; later clauses skipped');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),   // false
    Integer(1n), Name('THEN'), Integer(222n), Name('END'),   // true
    Integer(333n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session067: CASE second clause runs when first test is false');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Integer(0n), Name('THEN'), Integer(222n), Name('END'),
    Integer(999n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 999n,
    'session067: CASE default clause runs when no test matches');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(42n));                // witness — must survive
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
    'session067: CASE with no match and no default pushes nothing');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Program([Name('CASE'), Name('END')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session067: empty CASE is a no-op');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
      Integer(10n), Integer(20n), Name('+'),     // compute 30 inside action
    Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 30n,
    'session067: CASE action body supports multi-token expressions (10 20 +)');
}

{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN
  //      CASE
  //        0 THEN 111 END
  //        1 THEN 222 END
  //      END
  //    ELSE 999 END >>
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
      Name('CASE'),
        Integer(0n), Name('THEN'), Integer(111n), Name('END'),
        Integer(1n), Name('THEN'), Integer(222n), Name('END'),
      Name('END'),
    Name('ELSE'), Integer(999n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session067: CASE nested inside IF — inner match wins');
}

{
  resetHome();
  const s = new Stack();
  // << CASE
  //      1 THEN IF 1 THEN 55 ELSE 66 END END
  //      7777
  //    END >>
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
      Name('IF'), Integer(1n), Name('THEN'), Integer(55n),
      Name('ELSE'), Integer(66n), Name('END'),
    Name('END'),
    Integer(7777n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 55n,
    'session067: CASE clause containing IF/ELSE/END — ELSE stays inside clause');
}

{
  resetHome();
  const s = new Stack();
  // Outer first clause contains a nested CASE whose own first clause
  // matches.  After the inner match, the outer's first clause
  // completes, and the outer short-circuits past its own second clause.
  // Expected: 77 on the stack (inner match), not 8 (outer default).
  s.push(Program([
    Name('CASE'),
      Integer(1n), Name('THEN'),
        Name('CASE'),
          Integer(1n), Name('THEN'), Integer(77n), Name('END'),
          Integer(88n),
        Name('END'),
      Name('END'),
      Integer(1n), Name('THEN'), Integer(999n), Name('END'),
    Integer(8n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 77n,
    'session067: nested CASE: inner match returns to outer short-circuit');
}

/* ---- CASE without closing outer END auto-closes (parity with
        IF/WHILE/program-body recovery).  Regression guard: the
        matching THEN clause still runs, trailing tokens after the
        last inner END act as the default clause (empty here), no
        throw. ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(10n), Name('END'),
    // deliberately missing outer END — auto-closes at program end
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session073: unterminated outer CASE auto-closes, matched clause still runs');
}

/* ================================================================
   ABORT — program-interrupt primitive.
   AUR p.1-27.  ABORT stops execution of the currently-running
   program.  Unlike RPLError, ABORT is *not* catchable by IFERR, and
   EVAL's snapshot-restore lets it pass through so the stack reflects
   the state at the abort point, not post-pop.  (RPLError throws now
   restore to post-pop instead — ship-prep r3 — but ABORT still
   bypasses the restore so the program's pre-abort pushes survive.)
   ================================================================ */

// Basic: ABORT inside a program unwinds EVAL and does NOT re-push the
// Program, so the stack is left with anything ABORT's program pushed
// before the abort.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(42n),     // program runs: pushes 42
    Name('ABORT'),    // then aborts
    Integer(99n),     // unreachable
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: ABORT inside EVAL propagates an RPLAbort signal');
  // Stack contents at point of abort are preserved: 42 was pushed
  // before ABORT ran; 99 was NOT.  The Program itself is consumed.
  assert(s.depth === 1 && s.peek().value === 42n,
    'session067: ABORT preserves stack state (42 stays, 99 never ran)');
}

// IFERR cannot trap ABORT — it bubbles straight past the handler.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IFERR'),
      Name('ABORT'),
    Name('THEN'),
      Integer(111n),     // trap branch — must NOT run
    Name('END'),
    Integer(222n),       // after IFERR — must NOT run either
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: IFERR does NOT catch ABORT (RPLAbort bubbles past)');
  assert(s.depth === 0,
    'session067: neither THEN branch nor post-IFERR ran after ABORT');
}

// ABORT unwinds multiple nested control frames (WHILE inside IF).
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'),
      Real(1),                          // truthy constant test for IF
    Name('THEN'),
      Name('WHILE'),
        Real(1),                        // infinite-loop test body
      Name('REPEAT'),
        Integer(7n),                    // body: push 7
        Name('ABORT'),                  // then abort from deep inside
        Integer(999n),                  // unreachable
      Name('END'),                      // WHILE END
    Name('END'),                        // IF END
    Integer(555n),                      // unreachable past the IF
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: ABORT unwinds WHILE-inside-IF cleanly');
  // The 7 pushed just before ABORT is retained; nothing after ran.
  assert(s.depth === 1 && s.peek().value === 7n,
    'session067: ABORT preserves values pushed before the abort');
}

/* ================================================================
   Compiled local environments — `→ a b … body`
   ================================================================ */

// Single local + program body.  3 4 « → a b « a b + » » EVAL → 7
{
  resetHome();
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(4n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([ Name('a'), Name('b'), Name('+') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session068: → single-clause, program body, a + b with a=3 b=4 → 7');
}

// Three locals; rightmost name takes stack level 1.
// 10 3 2 → a b c « a b c * - »  → 10 - (3 * 2) = 4
{
  resetHome();
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(3n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'), Name('c'),
    Program([ Name('a'), Name('b'), Name('c'), Name('*'), Name('-') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 4n,
    'session068: → three locals — rightmost name binds stack level 1');
}

// Algebraic body: 5 2 → a b 'a+b'  → 7 (via Symbolic EVAL)
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(Integer(2n));
    // Build the program: → a b 'a+b'
    s.push(parseEntry("<< → a b `a+b` >>")[0]);
    lookup('EVAL').fn(s);
    assert(s.depth === 1,
      'session068: → with algebraic body leaves a single value on the stack');
    const top = s.peek();
    // Symbolic EVAL with locals bound to integers folds to a Real 7.
    const val = top.type === 'real' ? top.value.toNumber()
              : top.type === 'integer' ? Number(top.value)
              : null;
    assert(val === 7,
      'session068: → algebraic body: a+b with a=5 b=2 folds to 7');
  } finally {
    setApproxMode(prevApprox);
  }
}

// Locals are invisible after the body ends — the outer lookup falls
// through to the global store (or pushes the Name if unbound).
{
  resetHome();
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Program([
    Name('→'), Name('x'),
    Program([ Name('x') ]),    // body: push the local
    Name('x'),                 // after body — `x` is no longer bound
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: → locals invisible after body (x pushes a Name afterwards)');
  const top = s.peek();
  assert(top.type === 'name' && top.id === 'x',
    'session068: → trailing `x` became an unbound Name');
  // Level 2 is the value of `x` inside the body — the Integer 42.
  assert(s._items[0].value === 42n,
    'session068: → body saw the local binding before it went out of scope');
}

// Nested → frames: inner shadows outer.
// 1 2 → a b « 10 20 → a b « a b » »  → inner a=10, b=20, so top = 20, L2 = 10
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n), Integer(20n),
      Name('→'), Name('a'), Name('b'),
      Program([ Name('a'), Name('b') ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: nested → left two values on the stack');
  assert(s.peek().value === 20n && s._items[0].value === 10n,
    'session068: nested → inner shadows outer (sees 10,20 not 1,2)');
}

// After inner frame pops, outer still binds.
// 1 2 → a b « 10 → a « a » b »  → inner a=10 pushed, outer b=2 pushed
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n),
      Name('→'), Name('a'),
      Program([ Name('a') ]),         // inner body: pushes 10
      Name('b'),                      // after inner body: outer b = 2
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: outer → frame still live after inner pops');
  assert(s.peek().value === 2n && s._items[0].value === 10n,
    'session068: outer b=2 visible after inner → closed');
}

// Too-few-arguments error: the body's caller (the → op) is consumed
// inside the program, but the EVAL'd Program itself stays popped
// (ship-prep r3: post-pop snapshot).  The pre-EVAL Integer(100) is
// preserved because nothing in the program had popped it yet — → only
// peeks the depth before deciding to throw.
{
  resetHome();
  const s = new Stack();
  s.push(Integer(100n));                 // only one value
  s.push(Program([
    Name('→'), Name('a'), Name('b'),     // wants two
    Program([ Name('a'), Name('b'), Name('+') ]),
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /Too few arguments/.test(caught.message),
    'session068: → with too-few args raises Too few arguments');
  // Post-pop snapshot was [Integer(100)]; restore() walks back there,
  // and the Program is consumed.
  assert(s.depth === 1 && s._items[0].value === 100n,
    'ship-prep r3: → error path consumes the Program, keeps outer Integer(100)');
}

// Error inside the body pops the frame even on the error path — after
// unwind, the local name is NOT visible.
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('boom'),
    Program([ Name('boom'), Integer(0n), Name('/') ]),   // divide-by-zero
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (_e) { caught = _e; }
  assert(caught && /Infinite|[Zz]ero|[Dd]ivide/.test(caught.message || ''),
    'session068: → body propagates divide-by-zero');
  // Now re-run a tiny probe to confirm frame was popped: just push `boom`
  // in a fresh Program with no → — should stay as an unbound Name.
  const s2 = new Stack();
  s2.push(Program([ Name('boom') ]));
  lookup('EVAL').fn(s2);
  const t = s2.peek();
  assert(s2.depth === 1 && t.type === 'name' && t.id === 'boom',
    'session068: → frame popped on error path — local name no longer bound');
}

// Syntax errors: → with no names, → with no body, → followed by a
// non-Program non-Symbolic body.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('→'),     // no locals, no body
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /local variable names/.test(caught.message),
    'session068: → with no local names is a syntax error');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('a'),   // name but no body token
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /missing body/.test(caught.message),
    'session068: → with local names but no body raises missing body');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('a'),
    Integer(99n),             // not a Program / Symbolic
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /body must be a program or algebraic/.test(caught.message),
    'session068: → with non-Program non-Symbolic body is rejected');
}

// Local shadows a global with the same name.
// 'X' 99 STO ; 5 → X « X » → 5 (local wins); then PURGE checks cleanup.
{
  resetHome();
  const s = new Stack();
  // Pre-store X=99 globally.
  varStore('X', Integer(99n));
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('X'),
    Program([ Name('X') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 5n,
    'session068: local X shadows global X during body (got the 5)');
  // After body, global X is still 99.
  const g = varRecall('X');
  assert(g && g.value === 99n,
    'session068: global X unchanged by the → body');
  varPurge('X');
}

/* ================================================================
   Auto-close of unterminated CASE
   Parser already auto-closes unterminated `«`, `}`, `]` (parser.js
   lines 299-302).  The runCase helper now extends the same
   convenience to CASE blocks whose outer END — or whose per-clause
   inner ENDs — have been dropped off the end of the source.
   ================================================================ */

{
  resetHome();
  const s = new Stack();
  // « CASE 1 THEN 10 END »    — the outer CASE END is absent
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(10n), Name('END'),
    // NOTE: no trailing outer `END`
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session073: CASE auto-closes missing outer END (matched clause)');
}

{
  resetHome();
  const s = new Stack();
  // Three false tests, no default action, no trailing END — pushes nothing.
  s.push(Integer(42n));
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(1n), Name('END'),
    Integer(0n), Name('THEN'), Integer(2n), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
    'session073: CASE auto-closes with no match and no default (leaves stack alone)');
}

{
  resetHome();
  const s = new Stack();
  // Default clause after the last inner END should still run when
  // no test matches and the outer END is absent.
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Integer(0n), Name('THEN'), Integer(222n), Name('END'),
    Integer(999n),               // default-action body
    // no trailing END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 999n,
    'session073: CASE auto-close runs trailing default clause when no test matches');
}

{
  resetHome();
  const s = new Stack();
  // « CASE 7 »   — all tokens after CASE are the default body
  s.push(Program([
    Name('CASE'),
    Integer(7n),
    // no THEN, no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: CASE with no THEN and no END runs rest as default clause');
}

{
  resetHome();
  const s = new Stack();
  // « CASE 1 THEN 5 6 + »     — no inner END, no outer END
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
    Integer(5n), Integer(6n), Name('+'),
    // truncated — the remainder is the matched clause's body
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 11n,
    'session073: CASE auto-closes missing inner END when test matches');
}

{
  resetHome();
  const s = new Stack();
  // Falsy test + truncated action: nothing runs, stack unchanged apart
  // from the CASE block disappearing from the pending work.
  s.push(Integer(88n));
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'),
    Integer(999n),                  // action that will NOT run
    // truncated — no inner END, no outer END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 88n,
    'session073: CASE falsy test with missing inner END skips without running body');
}

/* ---- CASE auto-close at top of program body composes with a
       properly-closed nested CASE ---- */
{
  resetHome();
  const s = new Stack();
  // Outer CASE is missing its END; inner CASE is fully closed.  The
  // auto-close path must still recognise the fully-closed inner CASE
  // and not count its inner-ENDs against the outer's pending ENDs.
  //   « CASE 1 THEN
  //          CASE 0 THEN 111 END 1 THEN 222 END END
  //          »                              ← outer END dropped
  s.push(Program([
    Name('CASE'),
      Integer(1n), Name('THEN'),
        Name('CASE'),
          Integer(0n), Name('THEN'), Integer(111n), Name('END'),
          Integer(1n), Name('THEN'), Integer(222n), Name('END'),
        Name('END'),                 // inner CASE closed
      Name('END'),                   // outer first-clause closed
    // outer CASE END dropped
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session073: CASE auto-close on outer block preserves nested CASE dispatch');
}

/* ================================================================
   Nested-program closure-over-locals pin
   HP50 `→` locals use dynamic scoping within the compiled-local
   region: a nested `« »` program invoked during the outer body
   sees the outer frame's bindings.  This test freezes that
   behavior so a future refactor to lexical scoping has to come
   with a deliberate flip.
   ================================================================ */

{
  resetHome();
  const s = new Stack();
  //  5 → a  «  «  a a * »  EVAL  »       → 25
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Program([ Name('a'), Name('a'), Name('*') ]),
      Name('EVAL'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 25n,
    'session073: nested program sees outer → local (dynamic-scope pin)');
}

{
  resetHome();
  const s = new Stack();
  //  3 → a
  //    « 10 → a « a »     ← inner body pushes 10 (inner a wins)
  //      a                ← outer a again visible after inner pops
  //      +                ← 10 + 3 = 13
  //    »
  s.push(Integer(3n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Integer(10n), Name('→'), Name('a'),
      Program([ Name('a') ]),              // inner body
      Name('a'),                           // outer a (3) pushed here
      Name('+'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 13n,
    'session073: inner → shadows outer local, outer visible again after pop');
}

{
  resetHome();
  const s = new Stack();
  //  7 → a
  //    « IFERR 1 0 / THEN a END »
  //  The probe 1 0 / throws; the THEN clause should find outer a=7
  //  still bound because runArrow's finally hasn't fired yet.
  s.push(Integer(7n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Name('IFERR'),
      Integer(1n), Integer(0n), Name('/'),
      Name('THEN'),
      Name('a'),
      Name('END'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: outer → local still visible after nested RPLError unwinds IFERR');
}

/* ================================================================
   HALT / CONT / KILL substrate pilot
   HP50 AUR p.2-52, p.2-135, p.2-140.  HALT suspends the running
   program at the current instruction pointer; CONT resumes where
   HALT left off; KILL discards the suspension.  Pilot restriction:
   HALT must fire at the top level of a Program body (no active
   structured-control frame, no compiled-local frame).
   ================================================================ */

{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 1 2 + HALT 3 * »    — after HALT the stack has 3, not 9.
  s.push(Program([
    Integer(1n), Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
    'session073: HALT suspends program, pre-HALT stack result preserved (3)');
  assert(getHalted() !== null,
    'session073: HALT populates state.halted slot');
  clearHalted();
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Program([
    Integer(1n), Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 3n, 'session073: HALT pre-state matches');
  lookup('CONT').fn(s);
  // After CONT: 3 * → 9
  assert(s.depth === 1 && s.peek().value === 9n,
    'session073: CONT resumes from post-HALT token (3 * → 9)');
  assert(getHalted() === null,
    'session073: CONT clears halted slot on successful resume');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Program([
    Integer(42n),
    Name('HALT'),
    Integer(999n),                     // would run if CONT'd, killed instead
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 42n, 'session073: HALT for KILL test');
  assert(getHalted() !== null, 'session073: halted before KILL');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session073: KILL clears halted slot');
  assert(s.depth === 1 && s.peek().value === 42n,
    'session073: KILL does not touch the stack');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Integer(7n));
  lookup('KILL').fn(s);             // should not throw
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: KILL with empty halted slot is a no-op (stack unchanged)');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('CONT').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session073: CONT with empty halted slot raises No halted program');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  // « IF 1 THEN HALT END »  —  HALT inside IF's true-branch suspends
  // cleanly; the generator captures the full IF context.
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
    Name('HALT'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session088: HALT inside IF suspends program (halted slot populated)');
  // CONT resumes after HALT — IF/THEN/END closes normally, nothing more
  // to push, so stack is unchanged.
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session088: CONT after HALT-inside-IF resumes and finishes cleanly');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  // 5 → a « a HALT a »  — HALT inside → body suspends with a on stack;
  // CONT resumes and pushes the second a, leaving [5, 5] on stack.
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([ Name('a'), Name('HALT'), Name('a') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null && s.depth === 1 && s.peek().value === 5n,
    'session088: HALT inside → suspends with a=5 on stack');
  lookup('CONT').fn(s);
  assert(getHalted() === null && s.depth === 2,
    'session088: CONT after HALT-inside-→ resumes and finishes, 2 items on stack');
  assert(s.peek().value === 5n,
    'session088: second item pushed by resumed → body is also 5');
}

/* ---- Bare HALT on the stack (not inside EVAL) reports the bare-op
       error, so `HALT ENTER` outside a program doesn't wedge anything ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('HALT').fn(s); } catch (e) { caught = e; }
  assert(caught && /not inside a running program/.test(caught.message),
    'session073: bare-op HALT (outside a program body) raises clear error');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 10 HALT DUP * »       — HALT with 10 on stack, CONT squares it → 100
  s.push(Program([
    Integer(10n),
    Name('HALT'),
    Name('DUP'), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 10n, 'session073: HALT preserves 10 mid-stream');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 100n,
    'session073: CONT runs DUP * on the preserved 10 → 100');
}

{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 1 HALT 2 + HALT 3 * »    first CONT yields 3 (=1+2); second → 9
  s.push(Program([
    Integer(1n), Name('HALT'),
    Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 1n, 'session073: first HALT — 1 on top');
  lookup('CONT').fn(s);
  assert(s.peek().value === 3n,
    'session073: first CONT runs 2 + → 3, re-hits HALT');
  assert(getHalted() !== null,
    'session073: second HALT re-populated the slot');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 9n,
    'session073: second CONT runs 3 * → 9, program finishes clean');
  assert(getHalted() === null,
    'session073: slot empty after the final CONT');
}

/* ================================================================
   HALT/CONT flake-hardening coverage.

   `register('EVAL')` and `register('CONT')` wrap their bodies in a
   finally that snapshot-and-restores `_localFrames.length` on entry,
   so an abnormal unwind from a prior op can't leak a phantom local
   frame into the HALT pilot check.  resetHome() clears the halted
   slot automatically so pre-test boilerplate can't "forget" to
   clearHalted and still yield a clean slate.

   The tests below pin the invariants.  If a future refactor breaks
   them, the flake will not come back silently.
   ================================================================ */

{
  resetHome();
  assert(localFramesDepth() === 0,
    'session077: _localFrames is empty after resetHome');
  assert(getHalted() === null,
    'session077: resetHome now also clears the halted slot');
}

/* ---- localFramesDepth() is zero after a normal EVAL of a program
       that uses → internally (runArrow's finally popped cleanly) ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Integer(5n));
  // 5 → a « a a + »    : compiled local, pops, runs body, pops frame
  s.push(Program([
    Name('→'), Name('a'),
    Program([ Name('a'), Name('a'), Name('+') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session077: → body evaluated and produced 10 (5 + 5)');
  assert(localFramesDepth() === 0,
    'session077: _localFrames empty after normal → exit');
}

{
  resetHome();
  const s = new Stack();
  // 5 → a « a NONSUCHOP »    — NONSUCHOP is an unknown name, which
  // evalToken treats as a bare-name push (not an error), so this
  // shape won't actually throw.  Use 1 0 / instead for a divide-
  // by-zero RPLError inside the body.
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([ Integer(1n), Integer(0n), Name('/') ]),
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /infinite|zero|divide/i.test(caught.message),
    'session077: divide-by-zero inside → body surfaces as RPLError');
  assert(localFramesDepth() === 0,
    'session077: _localFrames empty after RPLError inside → unwinds EVAL');
}

/* ---- simulated phantom leak: a prior EVAL that unwound on a
       non-RPLError throw cannot poison a subsequent HALT check ---- */
{
  resetHome();
  // Simulate a phantom-leak scenario where a `→` body throws and the
  // EVAL finally must still restore frame depth.  Since _pushLocalFrame
  // isn't reachable from outside the module, exercise the effect by
  // running a `→` body.  runArrow's finally pops cleanly on any throw;
  // if the defensive EVAL finally ever regresses, this test's
  // follow-up HALT probe will flip to FAIL.
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Program([
    Name('→'), Name('x'),
    Program([ Name('x') ]),         // clean body: push local 'x'
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 42n && localFramesDepth() === 0,
    'session077: post-arrow baseline clean (42 on top, no phantom frames)');
  // Now run the two-HALT program from the baseline flake test:
  s.pop();
  s.push(Program([
    Integer(1n), Name('HALT'),
    Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 1n,
    'session077: post-arrow first HALT captured 1 on top');
  lookup('CONT').fn(s);
  assert(s.peek().value === 3n,
    'session077: post-arrow first CONT produced 3 and re-HALT\'d');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 9n,
    'session077: post-arrow second CONT cleanly finishes to 9');
  assert(getHalted() === null && localFramesDepth() === 0,
    'session077: halted slot + local frames both empty at end');
}

{
  resetHome();
  const s = new Stack();
  // Populate the halted slot by EVALing a program that HALTs.
  s.push(Program([ Integer(7n), Name('HALT'), Integer(8n) ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session077: halted slot populated before resetHome');
  resetHome();
  assert(getHalted() === null,
    'session077: resetHome cleared the halted slot automatically');
  // And CONT now raises "No halted program" (not e.g. a stale-token
  // access) — proves the slot is fully cleared, not just nulled.
  let caught = null;
  try { lookup('CONT').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session077: CONT after resetHome raises No halted program');
}

/* ---- Two successive top-level HALT/CONT cycles in the same stack
       run cleanly (flake regression guard) ---- */
{
  resetHome();
  const s = new Stack();
  // Cycle 1
  s.push(Program([ Integer(10n), Name('HALT'), Name('DUP'), Name('*') ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 10n, 'session077: cycle-1 HALT — 10 on top');
  lookup('CONT').fn(s);
  assert(s.peek().value === 100n, 'session077: cycle-1 CONT — 100');
  // Cycle 2 — fresh program on the same stack / in the same test.
  // The flake would have surfaced here (a phantom frame from
  // cycle 1 leaking).
  s.push(Program([ Integer(11n), Name('HALT'), Integer(2n), Name('+') ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 11n, 'session077: cycle-2 HALT — 11 on top');
  lookup('CONT').fn(s);
  assert(s.peek().value === 13n,
    'session077: cycle-2 CONT produces 13 (11 + 2), not RPLHalt escape');
  assert(localFramesDepth() === 0,
    'session077: local frames still empty after two HALT/CONT cycles');
}

/* ================================================================
   IFERR auto-close on missing END

   Parallel to the CASE auto-close: a user-entered program with
   `IFERR … THEN …` or `IFERR … THEN … ELSE …` that runs off the
   end of the source without a closing `END` evaluates cleanly
   instead of raising `IFERR without END` / `IFERR/ELSE without END`.

   "IFERR without THEN" is still an error — without a THEN there is
   no way to locate the trap-body boundary, and unlike CASE there is
   no sensible default clause.
   ================================================================ */

{
  resetHome(); clearLastError();
  const s = new Stack();
  // « IFERR 1 0 / THEN "caught" »   — no END
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(0n), Name('/'),
    Name('THEN'),
    Str('caught'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' && s.peek().value === 'caught',
    'session077: IFERR auto-closes without END; THEN clause fires on throw');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // « 42 IFERR 1 2 + THEN "never-runs" »     — 42 survives, 3 on top
  s.push(Program([
    Integer(42n),
    Name('IFERR'),
    Integer(1n), Integer(2n), Name('+'),
    Name('THEN'),
    Str('never-runs'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 42n && s.peek(1).value === 3n,
    'session077: IFERR auto-close without END leaves trap result on stack when no error');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // « IFERR 1 2 + THEN "err" ELSE "ok" »   — no END, normal flow → "ok"
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(2n), Name('+'),
    Name('THEN'),
    Str('err'),
    Name('ELSE'),
    Str('ok'),
  ]));
  lookup('EVAL').fn(s);
  // Trap leaves 3 on the stack, ELSE pushes "ok"
  assert(s.depth === 2 && s.peek(2).value === 3n && s.peek(1).value === 'ok',
    'session077: IFERR/THEN/ELSE auto-close runs ELSE on clean trap');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // « IFERR 1 0 / THEN "err" ELSE "ok" »   — no END
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(0n), Name('/'),
    Name('THEN'),
    Str('err'),
    Name('ELSE'),
    Str('ok'),
  ]));
  lookup('EVAL').fn(s);
  // THEN runs with post-error snapshot restored — "err" only.
  assert(s.depth === 1 && s.peek().value === 'err',
    'session077: IFERR/THEN/ELSE auto-close picks THEN clause on error');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // « IFERR 1 2 + »     — no THEN, no END.  Can't locate trap boundary.
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(2n), Name('+'),
  ]));
  assertThrows(() => lookup('EVAL').fn(s),
               /IFERR without THEN/,
               'session077: IFERR with neither THEN nor END still raises "IFERR without THEN"');
  // Ship-prep r3: companion to the with-END site above — the
  // post-pop snapshot is empty since nothing was on the stack
  // pre-EVAL except the Program itself.  Restore() walks back to
  // empty.
  assert(s.depth === 0,
    'ship-prep r3: malformed-IFERR (no END) consumes the Program (post-pop snapshot)');
}

/* ---- Auto-closed IFERR inside a longer program body:
       the tokens AFTER the missing END would have run at the outer
       program scope had the user added `END`.  With the auto-close
       they become part of the (now absorbing) IFERR handler — same
       shape as CASE auto-close.  Pin this so a future refactor
       doesn't silently change scoping. ---- */
{
  resetHome(); clearLastError();
  const s = new Stack();
  // « IFERR 1 0 / THEN 99 100 * »      — auto-closed; handler sees 99 100 *
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(0n), Name('/'),
    Name('THEN'),
    Integer(99n), Integer(100n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 9900n,
    'session077: IFERR auto-close absorbs trailing tokens into the handler clause');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // Source omits the closing END deliberately.
  const vs = parseEntry('<< IFERR 1 0 / THEN ERRM >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().type === 'string' &&
         s.peek().value === 'Infinite result',
    'session077: parsed source `<< IFERR 1 0 / THEN ERRM >>` auto-closes and runs');
}

{
  resetHome(); clearLastError();
  const s = new Stack();
  // Pre-seed an outer error context that should survive a nested
  // auto-closed IFERR.
  const outerErr = { name: 'RPLError', message: 'outer-sentinel', number: 0 };
  setLastError(outerErr);
  s.push(Program([
    Name('IFERR'),
    Integer(1n), Integer(0n), Name('/'),
    Name('THEN'),
    Integer(0n),                // benign handler
    // NO END — auto-closed
  ]));
  lookup('EVAL').fn(s);
  // After an IFERR-caught handler returns, the outer last-error slot
  // should be back to `outerErr` — not overwritten by the inner.
  const after = getLastError();
  assert(after && after.message === 'outer-sentinel',
    'session077: auto-closed IFERR still restores outer lastError on exit');
  clearLastError();
}

/* ================================================================
   IF auto-close on missing END
   (queue item 6: CASE inside IF whose own END is also missing)

   Mirrors the CASE and IFERR auto-close — a forward scan that falls
   off the end of the program body is treated as an implicit END.
   "IF without THEN" stays a hard error because IF has no default
   clause.
   ================================================================ */

{
  resetHome();
  const s = new Stack();
  // « IF 1 THEN 42 »    (missing END — auto-closes at body bound)
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'), Integer(42n),
    // NO END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
    'session083: IF THEN … (no END) auto-closes and runs true-branch');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(0n), Name('THEN'), Integer(99n),
    // NO END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 0,
    'session083: IF THEN … (no END) with falsy test leaves stack clean');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'), Integer(7n),
    Name('ELSE'), Integer(11n),
    // NO END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session083: IF THEN … ELSE … (no END) truthy → true-branch');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(0n), Name('THEN'), Integer(7n),
    Name('ELSE'), Integer(11n),
    // NO END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 11n,
    'session083: IF THEN … ELSE … (no END) falsy → else-branch');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(1n),
    // NO THEN
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /IF without THEN/.test(caught.message),
    'session083: IF without THEN still throws (auto-close does NOT apply)');
}

/* ---- CASE nested inside IF whose END is missing.  With auto-close
       the whole « … » is well-formed and both missing ENDs are
       treated as implicit. ---- */
{
  resetHome();
  const s = new Stack();
  // « IF 1 THEN CASE 1 THEN 101 END END »   <-- note the CASE has only
  // its own inner END; the outer CASE END is missing; the outer IF
  // END is also missing.  Both auto-close.
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
    Name('CASE'),
      Integer(1n), Name('THEN'), Integer(101n), Name('END'),
      // NO outer CASE END
    // NO IF END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 101n,
    'session083: queue-item-6 — CASE in IF, both missing outer END, auto-close composes');
}

{
  resetHome();
  const s = new Stack();
  // « IF 1 THEN IF 1 THEN 13 END »   (outer END missing)
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
      Name('IF'), Integer(1n), Name('THEN'), Integer(13n), Name('END'),
    // NO outer END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 13n,
    'session083: nested IF — outer END missing auto-closes, inner END honoured');
}

{
  resetHome();
  const s = new Stack();
  const vs = parseEntry('<< IF 1 THEN 55 >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().value === 55n,
    'session083: parsed source `<< IF 1 THEN 55 >>` auto-closes and runs');
}

/* ---- IF auto-close + trailing tokens: trailing lives INSIDE the
       implicit true-branch (queue discussion: should they run?).
       With `endIdx = bound`, the true-branch range is [thenIdx+1,
       bound), so tokens AFTER THEN all execute on truthy test. ---- */
{
  resetHome();
  const s = new Stack();
  // « IF 1 THEN 3 4 + »    (missing END — auto-closes; trailing `+`
  // is part of the true-branch)
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
    Integer(3n), Integer(4n), Name('+'),
    // NO END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session083: IF auto-close treats trailing tokens as true-branch content');
}

/* ================================================================
   RUN op (AUR p.2-177): alias for CONT
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([
    Integer(10n), Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 10n, 'session083: RUN setup — HALT pre-state 10');
  assert(getHalted() !== null, 'session083: RUN setup — halted slot populated');
  lookup('RUN').fn(s);
  assert(s.depth === 1 && s.peek().value === 30n,
    'session083: RUN resumes the halted program (same semantics as CONT)');
  assert(getHalted() === null,
    'session083: RUN clears the halted slot on successful finish');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('RUN').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session083: RUN with empty halted stack raises No halted program');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([
    Integer(1n), Name('HALT'),
    Integer(2n), Name('+'),
    Name('HALT'),
    Integer(5n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 1n, 'session083: first HALT — 1 on top (RUN chain)');
  lookup('RUN').fn(s);
  assert(s.peek().value === 3n, 'session083: first RUN → 3, re-hits HALT');
  lookup('RUN').fn(s);
  assert(s.depth === 1 && s.peek().value === 15n,
    'session083: second RUN runs 5 * on the 3 → 15, program finishes');
}

/* ================================================================
   Multi-slot halted-program stack.

   state.halted is a LIFO stack so that a second HALT (from a
   freshly-EVAL'd program launched while an earlier halt is live)
   preserves the prior suspension — CONT resumes the most-recent
   halt, the older halt remains on the stack to be CONT'd next.
   Matches HP50 AUR p.2-135's stack-of-halted-programs behaviour.
   ================================================================ */

{
  resetHome();
  assert(haltedDepth() === 0,
    'session083: haltedDepth is zero after a fresh resetHome');
  assert(getHalted() === null,
    'session083: getHalted is null when the stack is empty');
}

{
  resetHome();
  const s = new Stack();
  // First program: halts carrying 10 on the stack.
  s.push(Program([ Integer(10n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session083: first program halted, 10 on stack');
  assert(haltedDepth() === 1, 'session083: haltedDepth = 1 after first HALT');
  const firstHalt = getHalted();
  assert(firstHalt !== null, 'session083: first halt record is the top');
  // Second program: halts carrying 20.  Does NOT overwrite the first.
  s.push(Program([ Integer(20n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 2,
    'session083: haltedDepth = 2 after a second HALT stacks on top');
  const secondHalt = getHalted();
  assert(secondHalt !== null && secondHalt !== firstHalt,
    'session083: getHalted returns the more-recent halt (LIFO top)');
}

/* ---- CONT resumes most-recent halt first, preserves the older one.
       Uses distinct-integer marker pushes after each HALT so the
       LIFO ordering is unambiguous without mixing per-program
       arithmetic (which would share the one user stack and couple
       the assertions). ---- */
{
  resetHome();
  const s = new Stack();
  // Program A (older): pushes 100, halts; CONT appends 1001.
  s.push(Program([ Integer(100n), Name('HALT'), Integer(1001n) ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 100n,
    'session083: LIFO — A halted with 100');
  // Program B (newer): pushes 200, halts; CONT appends 2002.
  s.push(Program([ Integer(200n), Name('HALT'), Integer(2002n) ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek().value === 200n,
    'session083: LIFO — B halted with 200 on top of A');
  assert(haltedDepth() === 2, 'session083: LIFO — both halts on the stack');
  // First CONT resumes B (most recent) — pushes B's post-HALT marker 2002.
  // Stack after: [100, 200, 2002].
  lookup('CONT').fn(s);
  assert(s.depth === 3 && s.peek().value === 2002n,
    'session083: first CONT resumes the more-recent halt (B appends 2002)');
  assert(haltedDepth() === 1,
    'session083: after first CONT, one (older) halt remains');
  // Second CONT resumes A — pushes A's post-HALT marker 1001.
  // Stack after: [100, 200, 2002, 1001].
  lookup('CONT').fn(s);
  assert(s.depth === 4 && s.peek().value === 1001n,
    'session083: second CONT resumes the older halt (A appends 1001)');
  assert(haltedDepth() === 0, 'session083: LIFO empty after both CONTs');
  assert(getHalted() === null,
    'session083: getHalted is null once the LIFO is drained');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([ Integer(1n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  s.push(Program([ Integer(2n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 2, 'session083: KILL setup — two halts on LIFO');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 1,
    'session083: KILL peels one halt off the LIFO (not the whole stack)');
  assert(getHalted() !== null,
    'session083: after KILL, the older halt is now the top');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 0,
    'session083: second KILL drains the LIFO');
  assert(getHalted() === null, 'session083: getHalted null after both KILLs');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([ Integer(1n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  s.push(Program([ Integer(2n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  s.push(Program([ Integer(3n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 3, 'session083: clearAllHalted setup — three halts');
  clearAllHalted();
  assert(haltedDepth() === 0,
    'session083: clearAllHalted drains the whole LIFO in one call');
  assert(getHalted() === null,
    'session083: state.halted goes to null after clearAllHalted');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([ Integer(1n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  s.push(Program([ Integer(2n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 2, 'session083: resetHome drain — two halts on LIFO');
  resetHome();
  assert(haltedDepth() === 0,
    'session083: resetHome clears the whole halted LIFO (not just the top)');
  assert(getHalted() === null,
    'session083: state.halted is null after resetHome drain');
}

/* ---- Single-slot back-compat: one HALT still populates a slot and
       `state.halted` === getHalted() (LIFO-top aliasing) ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([ Integer(42n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null && haltedDepth() === 1,
    'session083: back-compat — single HALT still populates a slot');
  // Check via state.halted directly (the UI subscriber surface).
  assert(calcState.halted !== null && calcState.halted === getHalted(),
    'session083: back-compat — state.halted aliases the LIFO top');
  clearHalted();
  assert(getHalted() === null && haltedDepth() === 0 && calcState.halted === null,
    'session083: back-compat — clearHalted on a 1-deep stack empties both');
}

{
  resetHome();
  const s = new Stack();
  s.push(Program([ Integer(1n), Name('HALT') ]));
  lookup('EVAL').fn(s);
  s.push(Program([ Integer(2n), Name('HALT'), Integer(100n), Name('+') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 2, 'session083: RUN LIFO setup');
  lookup('RUN').fn(s);
  assert(s.peek().value === 102n,
    'session083: RUN resumes the LIFO top (= B), running 100 + on the 2 → 102');
  assert(haltedDepth() === 1,
    'session083: after RUN, the older halt remains on the LIFO');
}

/* Verifies AUR p.2-177 "no more single steps are permitted" after RUN.
 * The explicit _singleStepMode / _stepInto zeroing in RUN's body ensures
 * the remainder of the program runs full-speed even when the last step
 * was via SST.  Program « 1 2 + 10 * »: DBUG runs token 1 (push 1),
 * SST runs token 2 (push 2), RUN drains the remaining 3 tokens (+ 10 *). */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n), Name('+'), Integer(10n), Name('*')]));
  lookup('DBUG').fn(s);
  assert(s.depth === 1 && s.peek().value === 1n && haltedDepth() === 1,
    'session178: DBUG pauses after token 1 (push 1); haltedDepth=1');
  assert(singleStepMode() === false,
    'session178: DBUG resets singleStepMode after the suspending step');
  lookup('SST').fn(s);
  assert(s.depth === 2 && s.peek().value === 2n && haltedDepth() === 1,
    'session178: SST advances one token (push 2); still halted, stack depth=2');
  assert(singleStepMode() === false,
    'session178: SST resets singleStepMode after stepping');
  lookup('RUN').fn(s);
  assert(haltedDepth() === 0 && s.depth === 1 && s.peek().value === 30n,
    'session178: RUN drains halt and completes program (1+2=3, 3*10=30)');
  assert(singleStepMode() === false,
    'session178: RUN cleared _singleStepMode at exit (AUR p.2-177)');
  assert(stepIntoMode() === false,
    'session178: RUN cleared _stepInto at exit');
}

/* Same pattern as above but using SST↓ (step-into) instead of SST.
 * Program « 5 3 - 2 * »: DBUG token 1 (push 5), SST↓ token 2 (push 3),
 * RUN drains remaining 3 tokens (- 2 *) → 5−3=2, 2*2=4. */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(5n), Integer(3n), Name('-'), Integer(2n), Name('*')]));
  lookup('DBUG').fn(s);
  assert(s.depth === 1 && s.peek().value === 5n && haltedDepth() === 1,
    'session178: DBUG+SST↓: DBUG pauses after token 1 (push 5)');
  lookup('SST↓').fn(s);
  assert(s.depth === 2 && s.peek().value === 3n && haltedDepth() === 1,
    'session178: SST↓ advances one token (push 3); still halted');
  lookup('RUN').fn(s);
  assert(haltedDepth() === 0 && s.depth === 1 && s.peek().value === 4n,
    'session178: RUN drains halt and completes program (5-3=2, 2*2=4)');
  assert(singleStepMode() === false,
    'session178: RUN cleared singleStepMode after SST↓-last-step path');
  assert(stepIntoMode() === false,
    'session178: RUN cleared _stepInto even when last step was SST↓');
}

/* Semantic regression: RUN's error path must not leave step flags set.
 * The finally block restores the prior values (both false in normal use). */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('RUN').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session178: RUN with no halted program raises No halted program (parity with CONT)');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session178: RUN error path leaves both step flags cleared (finally restores prior=false)');
}

/* ---- RUN immediately after DBUG (no SST in between) — session185 re-land of session177 ----
 * The most common user-side debugging flow: DBUG suspends at the first token, then the
 * user inspects the stack and presses RUN to drain the remainder in one shot without
 * ever pressing SST. authored these 5 pins on ship-day but the write did
 * not persist (T-003 in REVIEW.md).  Re-landed with session185: labels.
 *
 * Program: « 1 2 + 10 * »  (5 tokens; result = (1+2)*10 = 30)
 * DBUG suspends after the first token (push 1); haltedDepth() === 1.
 * RUN (without SST) drains the remaining 4 tokens to completion.
 */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n), Name('+'), Integer(10n), Name('*')]));
  lookup('DBUG').fn(s);
  assert(getHalted() !== null,
    'session185: DBUG → RUN immediately: DBUG suspends after first token (halt slot populated); re-land T-003');
  assert(haltedDepth() === 1,
    'session185: DBUG → RUN immediately: haltedDepth()===1 after DBUG pushes Integer(1); re-land T-003');
  lookup('RUN').fn(s);
  assert(getHalted() === null,
    'session185: DBUG → RUN immediately: RUN drains halt slot (no SST in between); re-land T-003');
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 30n,
    `session185: DBUG → RUN immediately: program completes to 30 ((1+2)*10); re-land T-003; got depth=${s.depth} top=${s.peek()?.value?.toString?.()}`);
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session185: DBUG → RUN immediately: both step flags cleared at RUN exit; re-land T-003');
}

/* ---- RUN drains past an embedded HALT keyword — session185 re-land of session177 ----
 * Pins RUN's ability to resume a generator suspended by an in-program HALT token
 * (as opposed to the external DBUG-suspension cases covered by session178).
 * HALT's evalRange-yield substrate has been live since .
 *
 * Program: « 1 2 + HALT 10 * »
 * EVAL runs the pre-HALT fold (1+2=3), then suspends on the HALT token.
 * RUN drains the post-HALT continuation (3*10=30) to completion.
 */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n), Name('+'), Name('HALT'), Integer(10n), Name('*')]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session185: embedded-HALT EVAL+RUN: EVAL suspends on HALT token (halt slot populated); re-land T-003');
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 3n,
    `session185: embedded-HALT EVAL+RUN: pre-HALT fold complete (stack top = 3 = 1+2); re-land T-003; got depth=${s.depth} top=${s.peek()?.value?.toString?.()}`);
  lookup('RUN').fn(s);
  assert(getHalted() === null,
    'session185: embedded-HALT EVAL+RUN: RUN drains the post-HALT continuation; re-land T-003');
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 30n,
    `session185: embedded-HALT EVAL+RUN: post-HALT continuation completes to 30 (3*10); re-land T-003; got depth=${s.depth} top=${s.peek()?.value?.toString?.()}`);
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session185: embedded-HALT EVAL+RUN: both step flags cleared at RUN exit; re-land T-003');
}

/* ================================================================
   Generator-based evalRange: HALT at any structural depth
   ================================================================

   These tests verify that HALT suspends cleanly inside every control
   structure and compiled-local frame.  The generator mechanism
   preserves all structural context automatically.
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 3 FOR i i HALT NEXT »
  // Iteration 1: stores i=1, pushes 1, HALTs.  CONT resumes:
  //   stores i=2, pushes 2, HALTs.  CONT resumes: stores i=3,
  //   pushes 3, loop ends.  Stack: [1, 2, 3].
  s.push(Program([
    Integer(1n), Integer(3n),
    Name('FOR'), Name('i'),
    Name('i'), Name('HALT'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1, 'session088: FOR-HALT iteration-1: haltedDepth=1');
  assert(s.depth === 1 && s.peek().value === 1n,
    'session088: FOR-HALT iteration-1: i=1 on stack');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 1, 'session088: FOR-HALT iteration-2: haltedDepth=1');
  assert(s.depth === 2 && s.peek().value === 2n,
    'session088: FOR-HALT iteration-2: i=2 on stack');
  lookup('CONT').fn(s);
  // i=3 also HALTs (each iteration halts once); need one more CONT to
  // exit the loop (counter advances to 4, which exceeds end=3).
  assert(haltedDepth() === 1, 'session088: FOR-HALT iteration-3: haltedDepth=1');
  assert(s.depth === 3 && s.peek().value === 3n,
    'session088: FOR-HALT iteration-3: i=3 on stack');
  lookup('CONT').fn(s);  // resumes from i=3 HALT; loop exits
  assert(haltedDepth() === 0, 'session088: FOR-HALT done: haltedDepth=0');
  assert(s.depth === 3, 'session088: FOR-HALT: stack has 3 items [1,2,3]');
  assert(localFramesDepth() === 0, 'session088: FOR-HALT: localFrames clean after completion');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « IF 1 THEN 42 HALT 99 END »
  // Runs 42, HALTs.  CONT resumes and runs 99.  Stack: [42, 99].
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
    Integer(42n), Name('HALT'), Integer(99n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session088: HALT-inside-IF: haltedDepth=1 after suspend');
  assert(s.depth === 1 && s.peek().value === 42n,
    'session088: HALT-inside-IF: 42 on stack at suspension');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session088: HALT-inside-IF: haltedDepth=0 after resume');
  assert(s.depth === 2 && s.peek().value === 99n,
    'session088: HALT-inside-IF: 99 pushed by resumed branch');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Counter in a variable.  « 0 'cnt' STO  WHILE cnt 3 < REPEAT cnt 1 + 'cnt' STO  cnt HALT  END »
  // We'll use a simpler shape: accumulate on the stack.
  // « 1 WHILE DUP 4 < REPEAT DUP 1 + HALT END »
  //   starts: push 1
  //   iter1 test: DUP(1) 4 <  → true
  //   iter1 body: DUP(1)→[1,1], 1+→[1,2], HALT
  //   CONT: iter2 test: DUP(2) 4< → true
  //   iter2 body: DUP(2)→[1,2,2], 1+→[1,2,3], HALT
  //   CONT: iter3 test: DUP(3) 4< → true
  //   iter3 body: DUP(3)→[1,2,3,3], 1+→[1,2,3,4], HALT
  //   CONT: iter4 test: DUP(4) 4< → false → exit, stack: [1,2,3,4]
  s.push(Program([
    Integer(1n),
    Name('WHILE'), Name('DUP'), Integer(4n), Name('<'), Name('REPEAT'),
      Name('DUP'), Integer(1n), Name('+'), Name('HALT'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek().value === 2n,
    'session088: HALT-inside-WHILE iter1: stack=[1,2]');
  lookup('CONT').fn(s);
  assert(s.depth === 3 && s.peek().value === 3n,
    'session088: HALT-inside-WHILE iter2: stack=[1,2,3]');
  lookup('CONT').fn(s);
  assert(s.depth === 4 && s.peek().value === 4n,
    'session088: HALT-inside-WHILE iter3: stack=[1,2,3,4]');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session088: HALT-inside-WHILE finished: haltedDepth=0');
  assert(s.depth === 4 && s.peek().value === 4n,
    'session088: HALT-inside-WHILE loop exited cleanly');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 10 → a « a HALT a a + » »
  // Body: a HALT a a +
  // At HALT: [a=10] on stack.  Resume: a a + → [10, 20] (a is still 10
  // since the → binding is live during the entire suspended body).
  s.push(Integer(10n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([ Name('a'), Name('HALT'), Name('a'), Name('a'), Name('+') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session088: HALT-inside-arrow: suspended');
  assert(s.depth === 1 && s.peek().value === 10n,
    'session088: HALT-inside-arrow: a=10 on stack at suspension');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session088: HALT-inside-arrow: resumed and finished');
  // resume pushes a=10, then a=10, then +→20: stack = [10, 20]
  assert(s.depth === 2 && s.peek().value === 20n,
    'session088: HALT-inside-arrow: top is a+a=20 after resume');
  assert(localFramesDepth() === 0,
    'session088: HALT-inside-arrow: frame popped after generator completes');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Halt inside → — then KILL instead of CONT.
  // The generator's finally must still run to pop the frame.
  s.push(Integer(7n));
  s.push(Program([
    Name('→'), Name('x'),
    Program([ Name('x'), Name('HALT') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session088: KILL-arrow: halted inside →');
  assert(localFramesDepth() === 1,
    'session088: KILL-arrow: one local frame live during suspension');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 0,
    'session088: KILL-arrow: haltedDepth=0 after KILL');
  assert(localFramesDepth() === 0,
    'session088: KILL-arrow: _localFrames cleaned up by KILL via gen.return()');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Program([
    Name('→'), Name('y'),
    Program([ Name('y'), Name('HALT') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(localFramesDepth() === 1,
    'session088: resetHome-arrow: frame live at suspension');
  resetHome();
  assert(haltedDepth() === 0,
    'session088: resetHome-arrow: haltedDepth=0 after resetHome');
  assert(localFramesDepth() === 0,
    'session088: resetHome-arrow: _localFrames clean after resetHome');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « IF 1 THEN 1 3 FOR i i HALT NEXT END »
  // HALT inside FOR which is inside IF.  All three context levels
  // must be preserved.
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
      Integer(1n), Integer(3n),
      Name('FOR'), Name('i'),
        Name('i'), Name('HALT'),
      Name('NEXT'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 1n,
    'session088: nested FOR-in-IF: iter-1 i=1');
  lookup('CONT').fn(s);
  assert(s.depth === 2 && s.peek().value === 2n,
    'session088: nested FOR-in-IF: iter-2 i=2');
  lookup('CONT').fn(s);
  assert(s.depth === 3 && s.peek().value === 3n,
    'session088: nested FOR-in-IF: iter-3 i=3');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0 && s.depth === 3,
    'session088: nested FOR-in-IF: finished cleanly');
}

/* ================================================================
   SST / SST↓ / DBUG single-step debugger
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 HALT 2 3 + »  — EVAL halts at HALT with [1] on stack;
  // each SST then advances by exactly one token.
  s.push(Program([
    Integer(1n), Name('HALT'), Integer(2n), Integer(3n), Name('+'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 1n && haltedDepth() === 1,
    'session101: HALT suspends with [1] on stack, halted slot live');
  assert(singleStepMode() === false,
    'session101: single-step flag stays false after HALT yield (HALT is not SST)');
  lookup('SST').fn(s);
  assert(s.depth === 2 && s.peek().value === 2n && haltedDepth() === 1,
    'session101: SST runs one token (push 2), suspends after');
  assert(singleStepMode() === false,
    'session101: SST clears single-step flag after stepping');
  lookup('SST').fn(s);
  assert(s.depth === 3 && s.peek().value === 3n && haltedDepth() === 1,
    'session101: second SST runs one token (push 3), still halted');
  lookup('SST').fn(s);
  assert(s.depth === 2 && s.peek().value === 5n && haltedDepth() === 1,
    'session101: third SST runs the + op (2,3 → 5), still halted (final yield)');
  lookup('SST').fn(s);
  assert(haltedDepth() === 0 && s.depth === 2 && s.peek().value === 5n,
    'session101: fourth SST drains the generator (loop exits), no halts left');
  assert(singleStepMode() === false,
    'session101: single-step flag false after generator finishes');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('SST').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session101: SST with empty halted slot raises No halted program');
  assert(singleStepMode() === false,
    'session101: failed SST does not leave single-step flag set');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(10n), Name('HALT'), Integer(20n), Integer(30n)]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && haltedDepth() === 1,
    'session101: SST↓ setup — halted with [10]');
  lookup('SST↓').fn(s);
  assert(s.depth === 2 && s.peek().value === 20n && haltedDepth() === 1,
    'session101: SST↓ steps one token (push 20)');
  lookup('SST↓').fn(s);
  assert(s.depth === 3 && s.peek().value === 30n && haltedDepth() === 1,
    'session101: SST↓ steps one more token (push 30)');
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 0 && s.depth === 3,
    'session101: SST↓ drains generator, no halts left');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 7 8 + »  — DBUG executes the first token then suspends.
  s.push(Program([Integer(7n), Integer(8n), Name('+')]));
  lookup('DBUG').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n && haltedDepth() === 1,
    'session101: DBUG runs first token (push 7) then halts');
  assert(singleStepMode() === false,
    'session101: DBUG resets single-step flag after the suspending step');
  lookup('SST').fn(s);
  assert(s.depth === 2 && s.peek().value === 8n && haltedDepth() === 1,
    'session101: SST after DBUG advances to second token (push 8)');
  lookup('SST').fn(s);
  assert(s.depth === 1 && s.peek().value === 15n && haltedDepth() === 1,
    'session101: SST runs +  (7+8=15), final yield before exit');
  lookup('SST').fn(s);
  assert(haltedDepth() === 0 && s.depth === 1 && s.peek().value === 15n,
    'session101: SST drains DBUG-started program');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([Integer(2n), Integer(3n), Integer(4n), Name('+'), Name('+')]));
  lookup('DBUG').fn(s);
  assert(s.depth === 1 && s.peek().value === 2n && haltedDepth() === 1,
    'session101: DBUG halts after first token (push 2)');
  lookup('CONT').fn(s);
  // CONT does NOT single-step — it runs the rest to completion.
  assert(haltedDepth() === 0 && s.depth === 1 && s.peek().value === 9n,
    'session101: CONT after DBUG resumes at full speed (2+3+4=9)');
  assert(singleStepMode() === false,
    'session101: single-step flag clear after CONT-after-DBUG');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Integer(42n));
  let caught = null;
  try { lookup('DBUG').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session101: DBUG on a non-Program raises Bad argument type');
  assert(s.depth === 1 && s.peek().value === 42n,
    'session101: failed DBUG does not consume the argument');
  assert(haltedDepth() === 0 && singleStepMode() === false,
    'session101: failed DBUG leaves no halted slot and clears single-step');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([]));
  lookup('DBUG').fn(s);
  assert(s.depth === 0 && haltedDepth() === 0 && singleStepMode() === false,
    'session101: DBUG on « » runs to completion immediately, no halt');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // 9 → a « a SST-via-DBUG » — DBUG halts inside the → frame; KILL
  // closes the generator and runArrow's finally pops the local frame.
  s.push(Integer(9n));
  s.push(Program([Name('→'), Name('a'),
    Program([Integer(1n), Name('a'), Name('+'), Integer(2n), Name('+')]),
  ]));
  lookup('DBUG').fn(s);
  // First token of the body is `→ a « ... »` which is the entire arrow
  // form — it executes as one atomic step (runArrow consumes a, names,
  // and body, runs the body to completion or first yield).  The body's
  // first token is `1` — push 1.  After DBUG: stack top is 1, frame is live.
  assert(haltedDepth() === 1 && s.depth === 1 && s.peek().value === 1n,
    'session101: DBUG halts inside → frame body after first inner token');
  assert(localFramesDepth() === 1,
    'session101: → frame for `a` is live during single-step suspension');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 0,
    'session101: KILL drops the single-stepped program');
  assert(localFramesDepth() === 0,
    'session101: KILL closes the generator → runArrow finally pops the frame');
  assert(singleStepMode() === false,
    'session101: KILL leaves single-step flag clear');
}

/* ---- HALT inside a Name-reached sub-program suspends cleanly.
       `evalToken`'s Name-binding branch is a generator that yields up
       through `_evalValueGen`, so a HALT reached via variable lookup
       — CONT resumes, locals round-trip.  The non-lifted paths (ops
       that take a Program argument and call `_evalValueSync` directly
       — IFT / IFTE / MAP / …) still exercise `_driveGen`'s
       throw-and-close; see the session106 block below for that
       regression guard. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Define a program in variable P containing HALT inside an `→` body
  // (so a live `runArrow` frame exists at HALT time).  Then EVAL a
  // wrapper that calls P via variable lookup; the HALT must suspend
  // cleanly through the Name lookup path.
  varStore('P', Program([
    Integer(1n),
    Name('→'), Name('x'), Program([
      Name('HALT'),  // suspends through `_evalValueGen`
    ]),
  ]));
  s.push(Program([Name('P')]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session106 R-002 supersede: HALT inside variable-called sub-program suspends');
  assert(localFramesDepth() === 1,
    'session106 R-002 supersede: → frame for `x` is live across the halt');
  assert(singleStepMode() === false,
    'session106 R-002 supersede: single-step flag is unset (plain HALT, not DBUG)');
  // Resume: HALT's post-resume advances past the HALT token, the inner
  // Program ends, runArrow pops the `x` frame, P's body ends, and the
  // wrapper's EVAL returns with [1] on the stack.
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session106 R-002 supersede: CONT drains the lifted halt');
  assert(localFramesDepth() === 0,
    'session106 R-002 supersede: `x` frame popped by runArrow finally');
  // Stack ends empty: the `1` was popped into local `x` before the HALT
  // and nothing else is pushed by the inner `« HALT »` body.
  assert(s.depth === 0,
    'session106 R-002 supersede: stack is empty after resume (1 bound to x, frame popped)');
  varPurge('P');
}

/* ================================================================
   additional SST / DBUG regression guards
   ================================================================ */

/* ---- DBUG on a single-token program runs that token then yields,
        and the follow-up SST drains cleanly. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([ Integer(42n) ]));
  lookup('DBUG').fn(s);
  // After DBUG: the single push ran, then the post-token SST yield fired.
  assert(s.depth === 1 && s.peek().value === 42n && haltedDepth() === 1,
    'session102: DBUG « 42 » runs the single token and halts on the post-token yield');
  lookup('SST').fn(s);
  // Next SST drives the generator past the last token; the for-loop exits
  // and the generator reports done, so the halted slot is released.
  assert(haltedDepth() === 0 && s.depth === 1 && s.peek().value === 42n,
    'session102: SST after DBUG « 42 » drains the generator cleanly');
  assert(singleStepMode() === false,
    'session102: single-step flag clear after DBUG/SST sequence completes');
}

/* ---- After SST completes (no halt left), a fresh EVAL runs at full
        speed — the single-step flag from the prior SST does not leak. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // First program: DBUG + SST until generator drains.
  s.push(Program([ Integer(1n), Integer(2n), Name('+') ]));
  lookup('DBUG').fn(s);        // runs `1`, halts
  lookup('SST').fn(s);          // runs `2`, halts
  lookup('SST').fn(s);          // runs `+`, final yield (5 on stack)
  lookup('SST').fn(s);          // drains
  assert(haltedDepth() === 0 && s.peek().value === 3n && singleStepMode() === false,
    'session102: DBUG/SST sequence finished cleanly with 3 on stack');

  // Second program: a plain EVAL — must run to completion without
  // halting (regression guard: single-step flag from prior session
  // must not leak into this EVAL).
  s.push(Program([ Integer(4n), Integer(5n), Name('*') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 0 && s.peek().value === 20n,
    'session102: fresh EVAL after DBUG/SST drain runs to completion (no leaked single-step)');
  assert(singleStepMode() === false,
    'session102: single-step flag still clear after the follow-up full-speed EVAL');
}

/* ---- SST with a non-Program halted-slot payload is impossible by
        construction: HALT always stores a generator, and DBUG always
        starts from a Program.  But SST's "No halted program" rejection
        is the regression-guard invariant — pin it from a CONT-completed
        state as well as from the fresh-stack state. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Run a short halted program through to completion via CONT.
  s.push(Program([ Integer(7n), Name('HALT'), Integer(8n) ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 7n,
    'session102: EVAL halts on HALT as precondition');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0 && s.peek().value === 8n,
    'session102: CONT drains halted program to completion');
  // Now SST must reject — there is no halted program anymore.
  assertThrows(() => lookup('SST').fn(s), /No halted program/,
    'session102: SST after CONT-drained program throws No halted program');
  assert(singleStepMode() === false,
    'session102: single-step flag still false after the failed SST');
}

/* ================================================================
   HALT-inside-named-sub-program lift + SST↓ step-into
   ================================================================ */

/* ---- HALT inside a Name-reached sub-program suspends cleanly.
        The wrapper EVALs `« P »`; P evaluates to a stored Program whose
        body contains HALT.  Name lookup runs through `_evalValueGen`
        (generator flavor), so the HALT yields up the whole chain. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('P', Program([
    Integer(10n),
    Name('HALT'),
    Integer(20n),
  ]));
  s.push(Program([ Name('P'), Integer(99n) ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session106: HALT inside Name-reached sub-program suspends (not throws)');
  assert(s.depth === 1 && s.peek().value === 10n,
    'session106: sub-program ran up to the HALT (pushed 10) before suspending');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session106: both step flags remain clear (plain HALT, no SST/DBUG)');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session106: CONT resumes — halt record drained');
  assert(s.depth === 3,
    'session106: after CONT, sub-program finished (pushed 20), wrapper pushed 99');
  assert(s.peek().value === 99n,
    'session106: top of stack is wrapper-pushed 99');
  varPurge('P');
}

/* ---- HALT deep inside a Name-reached sub-program: HALT lives inside
        `→` in the stored Program.  Frame must be live at halt; CONT
        must pop it cleanly. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('DEEP', Program([
    Integer(5n), Integer(6n),
    Name('→'), Name('a'), Name('b'), Program([
      Name('a'), Name('b'),          // push a, push b
      Name('HALT'),                  // halt inside → frame
      Name('+'),                     // resume: a + b
    ]),
  ]));
  s.push(Program([ Name('DEEP') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session106: HALT inside → body under a Name-reached sub-program suspends');
  assert(localFramesDepth() === 1,
    'session106: → frame is live while the sub-program is halted');
  assert(s.depth === 2 && s.peek().value === 6n,
    'session106: locals `a`/`b` pushed before the halt (6 on top)');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session106: CONT resumed, → frame popped by runArrow finally');
  assert(s.depth === 1 && s.peek().value === 11n,
    'session106: post-CONT stack = [5+6] = [11]');
  varPurge('DEEP');
}

/* ---- Two-level Name chain: outer Program A calls Name B which is a
        stored Program containing HALT.  The yield must propagate through
        both evalRange generators + both evalToken generators. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('B', Program([ Integer(2n), Name('HALT'), Integer(3n) ]));
  varStore('A', Program([ Integer(1n), Name('B'), Integer(4n) ]));
  s.push(Program([ Name('A') ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 2n,
    'session106: two-level Name chain halts with [1, 2] on stack');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session106: CONT drains the two-level chain');
  assert(s.depth === 4,
    'session106: after CONT, B finishes (push 3) and A finishes (push 4)');
  assert(s.peek().value === 4n,
    'session106: top of stack is A-pushed 4');
  varPurge('A'); varPurge('B');
}

/* ---- IFT / IFTE reject HALT in their action: they use
        `_evalValueSync` directly (sync fallback), not `_evalValueGen`,
        so `_driveGen`'s throw-and-close still fires.  This pins the
        scope of HALT-through-Name — only `evalToken`-reached Programs
        propagate HALT cleanly; structural ops with a Program argument
        do not. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(1));                                   // test
  s.push(Program([ Name('HALT') ]));                 // action with HALT
  assertThrows(() => lookup('IFT').fn(s),
    /HALT: cannot suspend/,
    'session106: IFT on a HALT-containing action still throws (pilot limit retained)');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session106: failed IFT leaves no halt and no leaked frames');
}

/* ---- SST step-over on a Name token that resolves to a Program: one
        step runs the entire sub-program, leaving the outer program on
        the next token.  This is the HP50 SST semantics. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('MYP', Program([ Integer(100n), Integer(200n), Name('+') ]));
  s.push(Program([ Integer(1n), Name('MYP'), Integer(2n) ]));
  lookup('DBUG').fn(s);
  // DBUG runs first token (1) and halts.
  assert(haltedDepth() === 1 && s.peek().value === 1n,
    'session106: DBUG halted after the first outer token (push 1)');
  // Now SST the MYPcall — it should run the whole sub-program in one step.
  lookup('SST').fn(s);
  assert(haltedDepth() === 1,
    'session106: SST over MYP— still halted (next stop is after the Name)');
  assert(s.depth === 2 && s.peek().value === 300n,
    'session106: SST over MYPran 100+200 → 300 in one step');
  // Next SST pushes 2 and halts on the post-token yield.
  lookup('SST').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 2n,
    'session106: next SST pushes 2 and halts on post-token yield');
  // Final SST drains.
  lookup('SST').fn(s);
  assert(haltedDepth() === 0,
    'session106: final SST drains the outer program');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session106: step flags clear after SST drains');
  varPurge('MYP');
}

/* ---- SST↓ step-into on a Name token that resolves to a Program: one
        step runs only the first token of the sub-program, leaving the
        rest of the body halted for subsequent SST/SST↓.  Note: DBUG
        runs its first token in step-over mode (its finally sees
        _stepInto = false), so to demonstrate step-into we set up with
        a pre-token (`1` here) and use SST↓ at the Name boundary. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('MYP', Program([ Integer(100n), Integer(200n), Name('+') ]));
  s.push(Program([ Integer(1n), Name('MYP'), Integer(2n) ]));
  lookup('DBUG').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 1n,
    'session106: DBUG halted after outer token 1');
  // SST↓ into MYP — should push 100 and halt inside MYP's body.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 100n,
    'session106: SST↓ descends into MYP — push 100 and halt inside its body');
  // Next SST↓ pushes 200.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 3 && s.peek().value === 200n,
    'session106: SST↓ continues inside MYP — push 200, still halted');
  // Next SST↓ runs +.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 300n,
    'session106: SST↓ runs + inside MYP (100+200=300)');
  // Next SST↓ — MYP body is exhausted; we yield on the outer loop's
  // post-token step-yield (still inside step-into mode).
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1,
    'session106: after MYP drains, outer loop yields on the Name token boundary');
  assert(s.depth === 2 && s.peek().value === 300n,
    'session106: stack unchanged at the outer-boundary step');
  // Remaining SST drains.
  lookup('SST').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 2n,
    'session106: next step runs outer token 2');
  lookup('SST').fn(s);
  assert(haltedDepth() === 0,
    'session106: final step drains outer program');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session106: step flags clear after SST↓ / SST mix drains');
  varPurge('MYP');
}

/* ---- stepIntoMode reset invariants: a failed SST↓ (no halted slot)
        must not leak _stepInto into a subsequent SST. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  assertThrows(() => lookup('SST↓').fn(s), /No halted program/,
    'session106: SST↓ with no halted slot throws No halted program');
  assert(stepIntoMode() === false,
    'session106: stepIntoMode clean after failed SST↓');
  assert(singleStepMode() === false,
    'session106: singleStepMode clean after failed SST↓');
}

/* ---- KILL from inside a step-into session closes the generator and
        clears both flags.  Setup uses a pre-token (`7`) so DBUG halts
        before the MYP call, letting SST↓ descend into MYP. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('MYP', Program([ Integer(50n), Integer(60n) ]));
  s.push(Program([ Integer(7n), Name('MYP') ]));
  lookup('DBUG').fn(s);
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 50n,
    'session106: SST↓ into MYP pushed 50 and halted inside');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 0,
    'session106: KILL drops the step-into session');
  assert(stepIntoMode() === false && singleStepMode() === false,
    'session106: KILL leaves both step flags clear');
  varPurge('MYP');
}

/* ================================================================
   Caller-aware HALT-rejection messages.

   The sync-path callers — IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS /
   STREAM — reject a HALT via `_driveGen`, because they call
   `_evalValueSync` which cannot yield.  `_driveGen` accepts a
   `caller` label so the rejection names which op was at the boundary:
   `HALT: cannot suspend inside <caller>` with the caller label
   threaded through from each op's `_evalValueSync` call site.

   Each block also pins that `_localFrames` is empty after the
   rejection — the `gen.return()` close runs the helper's finally —
   so a regression in the cleanup path would surface alongside a
   regression in the message.
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(1));                                   // test = true
  s.push(Program([ Name('HALT') ]));                 // action
  assertThrows(() => lookup('IFT').fn(s),
    /HALT: cannot suspend inside IFT action/,
    'session111: IFT-action HALT error names IFT');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed IFT leaves no halt and no leaked frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(1));                                   // test = true
  s.push(Program([ Name('HALT') ]));                 // t-action
  s.push(Program([ Integer(0n) ]));                  // f-action
  assertThrows(() => lookup('IFTE').fn(s),
    /HALT: cannot suspend inside IFTE action/,
    'session111: IFTE-t-branch HALT error names IFTE');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed IFTE (true branch) leaves no halt / frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(0));                                   // test = false
  s.push(Program([ Integer(0n) ]));                  // t-action
  s.push(Program([ Name('HALT') ]));                 // f-action
  assertThrows(() => lookup('IFTE').fn(s),
    /HALT: cannot suspend inside IFTE action/,
    'session111: IFTE-f-branch HALT error names IFTE');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed IFTE (false branch) leaves no halt / frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n) ]));       // list input
  s.push(Program([ Name('HALT') ]));                 // mapper
  assertThrows(() => lookup('MAP').fn(s),
    /HALT: cannot suspend inside MAP program/,
    'session111: MAP HALT error names MAP');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed MAP leaves no halt and no leaked frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([ Name('HALT') ]));                 // expression
  s.push(Name('I'));                                 // bound name
  s.push(Real(1));                                   // start
  s.push(Real(3));                                   // end
  s.push(Real(1));                                   // step
  assertThrows(() => lookup('SEQ').fn(s),
    /HALT: cannot suspend inside SEQ expression/,
    'session111: SEQ HALT error names SEQ');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed SEQ leaves no halt and no leaked frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n) ]));       // single list
  s.push(Program([ Name('HALT') ]));                 // program
  assertThrows(() => lookup('DOLIST').fn(s),
    /HALT: cannot suspend inside DOLIST program/,
    'session111: DOLIST HALT error names DOLIST');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed DOLIST leaves no halt and no leaked frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n), Integer(3n) ]));
  s.push(Integer(2n));                               // window size
  s.push(Program([ Name('HALT') ]));                 // program
  assertThrows(() => lookup('DOSUBS').fn(s),
    /HALT: cannot suspend inside DOSUBS program/,
    'session111: DOSUBS HALT error names DOSUBS');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed DOSUBS leaves no halt and no leaked frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n), Integer(3n) ]));
  s.push(Program([ Name('HALT') ]));
  assertThrows(() => lookup('STREAM').fn(s),
    /HALT: cannot suspend inside STREAM program/,
    'session111: STREAM HALT error names STREAM');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: failed STREAM leaves no halt and no leaked frames');
}

/* ---- Tagged-wrapped Program EVAL lifts HALT.
        The EVAL handler routes through `_evalValueGen` so a Tagged
        wrapper at the entry doesn't force a sync-path call: HALT
        inside the Tagged-wrapped Program suspends cleanly, just as
        it would for the bare Program.  Two assertions cover the
        lift; a follow-on block exercises CONT to confirm resume
        works. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Tagged('t', Program([ Integer(7n), Name('HALT'), Integer(8n) ])));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session116: Tagged-wrapped Program EVAL lifts HALT (was rejected pre-116)');
  assert(s.depth === 1 && s.peek().value === 7n,
    'session116: Tagged-EVAL halted after pushing 7, before HALT');
  // Resume: CONT runs the trailing 8 push.
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session116: CONT drained the haltedStack');
  assert(s.depth === 2 && s.peek().value === 8n,
    'session116: CONT resumed Tagged-wrapped Program through completion');
  assert(localFramesDepth() === 0,
    'session116: Tagged-EVAL lift leaves no leaked local frames after resume');
}

/* ---- Cross-check: the lifted path (evalToken Name-lookup) suspends
        cleanly and does NOT produce an error.  Re-verifies that the
        sync-path caller-labeling does not change the success path
        for Name-reached HALTs. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('PHALT', Program([ Integer(42n), Name('HALT'), Integer(99n) ]));
  s.push(Program([ Integer(1n), Name('PHALT'), Integer(2n) ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session111: Name-reached HALT still suspends (not errored by session-111 work)');
  assert(s.depth === 2 && s.peek().value === 42n,
    'session111: Name-reached HALT pushed 42 before yielding, outer push of 1 is below');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0 && s.depth === 4 && s.peek().value === 2n,
    'session111: CONT resumed cleanly, outer 2 landed on top');
  varPurge('PHALT');
  clearAllHalted();
}

/* ---- Labeling is preserved through a Name-wrapped action: IFT on a
        `'NAMEREF'` (not quoted) action recalls the Program via the
        sync-path Name recursion in `_evalValueSync`.  The caller label
        must survive that recursion. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('HLT', Program([ Name('HALT') ]));
  s.push(Real(1));                                   // test = true
  s.push(Name('HLT'));                               // unquoted Name — will recurse
  assertThrows(() => lookup('IFT').fn(s),
    /HALT: cannot suspend inside IFT action/,
    'session111: Name-recursion preserves the IFT caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session111: Name-recursion HALT rejection still cleans up');
  varPurge('HLT');
}

/* ================================================================
   EVAL handler drives _evalValueGen so HALT lifts
   through Tagged-wrapped Programs and through Name-on-stack EVALs.

   Pre-116 the EVAL handler had a Program-direct fast path and
   anything else (Tagged, Name, …) fell through to _evalValueSync,
   which rejected HALT via _driveGen with the
   "cannot suspend inside a sub-program call" message.  HALT was
   already lifted for sub-programs reached via evalToken's
   Name-binding branch (mid-program Name resolution).
   completes that work for the *entry* of EVAL: anything semantically
   transparent — Tagged, Name on the stack, Name pointing at a Tagged
   Program — now suspends cleanly when its body HALTs.

   These regressions also pin SST/SST↓ semantics through the new
   path: a top-level Tagged-wrapped Program is still the *outer*
   program from the debugger's perspective, so DBUG yields per token
   in its body even though we routed through _evalValueGen.
   ================================================================ */

/* ---- Multi-layer Tagged unwrap: HALT inside a Program wrapped in
        two Tagged layers still lifts (recursion preserves
        isSubProgram=false at the entry, so the body remains the
        outer program from SST's perspective if the user were
        DBUG'ing).  Pin: lift + clean resume. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Tagged('outer',
    Tagged('inner',
      Program([ Integer(11n), Name('HALT'), Integer(22n) ]))));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session116: double-Tagged Program EVAL lifts HALT through both wrappers');
  assert(s.depth === 1 && s.peek().value === 11n,
    'session116: double-Tagged-EVAL halted after pushing 11, before HALT');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session116: CONT drained the haltedStack (double-Tagged)');
  assert(s.depth === 2 && s.peek().value === 22n,
    'session116: CONT resumed double-Tagged-wrapped Program through completion');
  assert(localFramesDepth() === 0,
    'session116: double-Tagged lift leaves no leaked local frames');
}

/* ---- Name-on-stack EVAL of a Program with HALT lifts.
        Pre-116 the EVAL handler dispatched non-Programs to
        _evalValueSync, so an *unquoted* Name on the stack — even
        though Name-binding to a Program is semantically just a
        program reference — got rejected.  Now it lifts. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('PNAME', Program([ Integer(33n), Name('HALT'), Integer(44n) ]));
  s.push(Name('PNAME'));                            // Name on the stack — not quoted
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session116: Name-on-stack EVAL of a Program with HALT lifts');
  assert(s.depth === 1 && s.peek().value === 33n,
    'session116: Name-EVAL halted after pushing 33, before HALT');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session116: CONT drained the Name-EVAL halt');
  assert(s.depth === 2 && s.peek().value === 44n,
    'session116: CONT resumed Name-EVAL through completion');
  assert(localFramesDepth() === 0,
    'session116: Name-EVAL lift leaves no leaked local frames');
  varPurge('PNAME');
}

/* ---- Name-on-stack EVAL of a Tagged-wrapped Program lifts.
        Composes the previous two cases: the EVAL entry is a Name,
        the Name's binding is a Tagged-wrapped Program. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('PTAG',
    Tagged('mark', Program([ Integer(55n), Name('HALT'), Integer(66n) ])));
  s.push(Name('PTAG'));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session116: Name→Tagged→Program EVAL lifts HALT');
  assert(s.depth === 1 && s.peek().value === 55n,
    'session116: Name→Tagged-EVAL halted after pushing 55, before HALT');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0 && s.depth === 2 && s.peek().value === 66n,
    'session116: CONT resumed Name→Tagged-EVAL through completion');
  assert(localFramesDepth() === 0,
    'session116: Name→Tagged-EVAL lift leaves no leaked local frames');
  varPurge('PTAG');
}

/* ---- DBUG on a Tagged-wrapped Program: SST steps per outer token.
        This is the load-bearing single-step regression — the new
        _evalValueGen path passes isSubProgram=false at the EVAL
        entry, so the Program body stays the *outer* program for
        _shouldStepYield's purposes.  If we ever flipped this to true
        by mistake, DBUG would run the entire Tagged-wrapped body in
        one step (treating it as a sub-program) instead of yielding
        per token. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 7 8 + »  — three tokens; under DBUG we expect a yield after
  // each token, just like for a bare Program.
  s.push(Tagged('lbl', Program([ Integer(7n), Integer(8n), Name('+') ])));
  lookup('DBUG').fn(s);
  assert(haltedDepth() === 1 && s.depth === 1 && s.peek().value === 7n,
    'session116: DBUG on Tagged-wrapped Program runs first token (push 7) then halts');
  assert(singleStepMode() === false,
    'session116: DBUG resets single-step flag after the suspending step (Tagged path)');
  lookup('SST').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 8n,
    'session116: SST advances Tagged-DBUG to second token (push 8)');
  lookup('SST').fn(s);
  assert(haltedDepth() === 1 && s.depth === 1 && s.peek().value === 15n,
    'session116: next SST runs + on Tagged-wrapped body (7+8=15)');
  lookup('SST').fn(s);
  assert(haltedDepth() === 0,
    'session116: final SST drains Tagged-wrapped DBUG session');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session116: step flags clear after Tagged-DBUG/SST drains');
}

/* ---- SST↓ regression: a Name token inside a Tagged-wrapped Program
        that resolves to a sub-program still descends correctly.
        This pins that the entry-point classification (isSubProgram=
        false) does NOT propagate into Name-resolved sub-programs at
        evalToken time — those reach _evalValueGen with the default
        isSubProgram=true, so SST↓ on them descends and SST steps
        over them, just as for bare Programs. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  varStore('SUBP', Program([ Integer(101n), Integer(202n), Name('+') ]));
  s.push(Tagged('outer',
    Program([ Integer(1n), Name('SUBP'), Integer(2n) ])));
  lookup('DBUG').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 1n,
    'session116: DBUG on Tagged-wrapped Program runs outer 1 then halts');
  // SST↓ into SUBP — pushes 101 and halts inside SUBP's body.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 101n,
    'session116: SST↓ from Tagged outer descends into SUBP — push 101 and halt');
  // SST↓ keeps stepping inside SUBP.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 3 && s.peek().value === 202n,
    'session116: SST↓ continues inside SUBP — push 202');
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 303n,
    'session116: SST↓ runs + inside SUBP (101+202=303)');
  // SUBP body drains; outer post-token yield fires.
  lookup('SST↓').fn(s);
  assert(haltedDepth() === 1 && s.depth === 2 && s.peek().value === 303n,
    'session116: outer post-Name yield fires after SUBP drains');
  lookup('SST').fn(s);
  assert(haltedDepth() === 1 && s.peek().value === 2n,
    'session116: outer SST continues with token 2');
  lookup('SST').fn(s);
  assert(haltedDepth() === 0,
    'session116: final SST drains Tagged-wrapped outer program');
  assert(singleStepMode() === false && stepIntoMode() === false,
    'session116: step flags clear after Tagged-SST↓/SST mix drains');
  varPurge('SUBP');
}

/* ---- runArrow Symbolic body caller-label wiring: a → frame whose
        body is a Symbolic value can never reach a Program subnode
        (the algebraic AST doesn't carry Programs), but the 4th-arg
        caller-label addition to `_evalValueSync` had to plumb
        through runArrow's Symbolic-body call site.  This pin is a
        smoke-test: the well-formed Symbolic body path still
        produces the correct value via `_evalValueSync(s, body,
        depth+1, '→ algebraic body')`, so a regression in the label
        wiring (e.g. dropping the body argument when threading the
        label) would surface here as either an error or a wrong
        result. ---- */
{
  resetHome(); clearAllHalted();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Integer(4n));
    // Build « → a b `a^2 + b^2` » using parseEntry.  Backticks delimit
    // algebraic literals in the test parser entry-point (see
    // session068 examples above).
    s.push(parseEntry("<< → a b `a^2 + b^2` >>")[0]);
    lookup('EVAL').fn(s);
    assert(s.depth === 1,
      'session116: → with Symbolic body leaves a single result');
    const top = s.peek();
    const val = top.type === 'real' ? top.value.toNumber()
              : top.type === 'integer' ? Number(top.value)
              : null;
    assert(val === 25,
      `session116: → a b \`a^2+b^2\` with 3,4 folds to 25 (got ${val})`);
    assert(localFramesDepth() === 0,
      'session116: → frame torn down after Symbolic body completes');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ================================================================
   PROMPT op + HALT lift through IFT/IFTE body.

   Three pieces:
     1. PROMPT (HP50 AUR p.2-160): pop level 1 as the prompt banner,
        then halt the program.  CONT/SST/KILL all consume the banner.
     2. HALT/PROMPT inside an IFT action that is *evaluated through a
        Program body* (i.e. the IFT keyword is reached by evalRange's
        intercept) now lifts cleanly.  Reaching IFT via Name dispatch
        ('IFT' EVAL, Tagged-wrapped Name) still rejects with the
        "cannot suspend inside IFT action" label.
     3. Same story for IFTE — both branches.
   ================================================================ */

// Side-load the prompt accessors without rewriting the top-of-file
// state.js import block (which has every export the rest of the file
// uses).  Async import keeps node's ESM linker happy at top level.
const { getPromptMessage, clearPromptMessage }
  = await import('../www/src/rpl/state.js');

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([ Str('Enter X:'), Name('PROMPT'), Integer(99n) ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: PROMPT halts the running program');
  assert(haltedDepth() === 1,
    'session121: PROMPT populates exactly one halted slot');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'Enter X:',
    'session121: PROMPT stores the popped string as the active banner');
  assert(s.depth === 0,
    'session121: PROMPT pop happens before halt — operand consumed');
  // CONT consumes the banner and resumes past PROMPT, pushing 99.
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session121: CONT clears the prompt banner on resume');
  assert(s.depth === 1 && s.peek().value === 99n,
    'session121: CONT after PROMPT runs the post-PROMPT token (99)');
  assert(getHalted() === null,
    'session121: CONT clears the halted slot once the program completes');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([ Integer(42n), Name('PROMPT') ]));
  lookup('EVAL').fn(s);
  const msg = getPromptMessage();
  assert(msg && msg.type === 'integer' && msg.value === 42n,
    'session121: PROMPT stores any type as the banner — Integer here');
  lookup('KILL').fn(s);
  assert(getPromptMessage() === null,
    'session121: KILL clears the prompt banner alongside the halt slot');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([ Name('PROMPT') ]));
  assertThrows(() => lookup('EVAL').fn(s),
    /PROMPT: Too few arguments/,
    'session121: PROMPT on empty stack rejects with Too few arguments');
  assert(getHalted() === null && getPromptMessage() === null,
    'session121: failed PROMPT leaves no halt and no banner');
  assert(localFramesDepth() === 0,
    'session121: failed PROMPT leaves no leaked local frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Str('hi'));
  // Direct Name dispatch — reaches the registered fallback handler,
  // not the body intercept.  Same shape as the bare-HALT test above.
  assertThrows(() => lookup('PROMPT').fn(s),
    /PROMPT: not inside a running program/,
    'session121: bare PROMPT (Name dispatch) reports outside-program error');
  assert(s.depth === 1,
    'session121: bare PROMPT does not consume the operand on the throw');
}

/* ---- PROMPT inside a → frame: banner shows, frame survives across
        suspension, and CONT cleans it up on completion ---- */
{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Real(7));
  s.push(parseEntry('<< → a << "msg" PROMPT a >> >>')[0]);
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: PROMPT inside → body halts the program');
  assert(localFramesDepth() === 1,
    'session121: → frame survives the PROMPT-induced suspension');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().type === 'real' && s.peek().value.eq(7),
    'session121: CONT after PROMPT-in-→ resumes and pushes a (=7)');
  assert(localFramesDepth() === 0,
    'session121: → frame torn down after PROMPT-in-→ resumes to completion');
  assert(getPromptMessage() === null,
    'session121: prompt banner cleared after CONT completes the program');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Real(1), Name('THEN'),
      Str('p'), Name('PROMPT'), Integer(11n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null && getPromptMessage().value === 'p',
    'session121: PROMPT inside IF/THEN halts with the banner set');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 11n,
    'session121: CONT after PROMPT-in-IF resumes the THEN clause to completion');
}

/* ================================================================
   HALT lift through IFT body (evalRange intercept path).
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 « HALT » IFT 99 »
  s.push(Program([
    Real(1),
    Program([ Name('HALT') ]),
    Name('IFT'),
    Integer(99n),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: HALT inside IFT body suspends program (lift path)');
  assert(haltedDepth() === 1,
    'session121: HALT-in-IFT-body populates exactly one halted slot');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 99n,
    'session121: CONT after HALT-in-IFT resumes and pushes 99');
  assert(getHalted() === null && localFramesDepth() === 0,
    'session121: HALT-in-IFT cleanup — no leftover halt or local frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // « 1 « "ift!" PROMPT 7 » IFT »  — PROMPT inside IFT action
  s.push(Program([
    Real(1),
    Program([ Str('ift!'), Name('PROMPT'), Integer(7n) ]),
    Name('IFT'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: PROMPT inside IFT body suspends');
  assert(getPromptMessage().value === 'ift!',
    'session121: PROMPT-in-IFT-body sets the banner');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session121: CONT after PROMPT-in-IFT-body finishes the action (7)');
}

/* ---- IFT body false branch: HALT lift logic must not trigger when
        test is false (no action runs at all) ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Program([
    Real(0),                              // test = false
    Program([ Name('HALT') ]),            // action — must not run
    Name('IFT'),
    Integer(13n),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 13n,
    'session121: IFT-body with false test skips action entirely');
  assert(getHalted() === null,
    'session121: false-branch IFT body does not suspend');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(1));
  s.push(Program([ Name('HALT') ]));
  // 'IFT' reached via direct Name lookup → registered fallback handler
  assertThrows(() => lookup('IFT').fn(s),
    /HALT: cannot suspend inside IFT action/,
    'session121: sync-fallback IFT still rejects HALT with the IFT-action label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session121: sync-fallback IFT rejection cleans up halts and frames');
}

/* ================================================================
   HALT lift through IFTE body — both branches.
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 « HALT 1 » « 2 » IFTE 99 »
  s.push(Program([
    Real(1),
    Program([ Name('HALT'), Integer(1n) ]),
    Program([ Integer(2n) ]),
    Name('IFTE'),
    Integer(99n),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: HALT inside IFTE true-branch suspends');
  lookup('CONT').fn(s);
  // After CONT: integer 1 (post-HALT in true branch) then 99 (post-IFTE)
  assert(s.depth === 2 && s.peek().value === 99n,
    'session121: CONT after HALT-in-IFTE-true resumes branch + post-IFTE token');
  assert(s.peek(2).value === 1n,
    'session121: HALT-in-IFTE-true: branch body completes after CONT (1)');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 0 « 1 » « HALT 2 » IFTE 99 »
  s.push(Program([
    Real(0),
    Program([ Integer(1n) ]),
    Program([ Name('HALT'), Integer(2n) ]),
    Name('IFTE'),
    Integer(99n),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: HALT inside IFTE false-branch suspends');
  lookup('CONT').fn(s);
  assert(s.depth === 2 && s.peek().value === 99n,
    'session121: CONT after HALT-in-IFTE-false resumes and pushes 99');
  assert(s.peek(2).value === 2n,
    'session121: HALT-in-IFTE-false: branch body finishes after CONT (2)');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Real(1));
  s.push(Program([ Name('HALT') ]));   // t-action
  s.push(Program([ Integer(0n) ]));    // f-action
  assertThrows(() => lookup('IFTE').fn(s),
    /HALT: cannot suspend inside IFTE action/,
    'session121: sync-fallback IFTE still rejects HALT with the IFTE-action label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session121: sync-fallback IFTE rejection cleans up halts and frames');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // 5 → a « 1 « a HALT a » IFT »  — HALT inside IFT action inside →
  s.push(Real(5));
  s.push(parseEntry(
    '<< → a << 1 << a HALT a >> IFT >> >>')[0]);
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session121: HALT-in-IFT-in-→ body suspends through both intercepts');
  assert(localFramesDepth() === 1,
    'session121: → frame survives across HALT-in-IFT suspension');
  // KILL terminates the suspension AND closes the generator, which
  // must run any finally blocks in evalRange / runArrow — including
  // the _popLocalFrame() that owns the → frame.
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session121: KILL clears the halt slot');
  assert(localFramesDepth() === 0,
    'session121: KILL also closes the generator and tears down → frame');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([ Str('persist?'), Name('PROMPT') ]));
  lookup('EVAL').fn(s);
  assert(getPromptMessage() !== null,
    'session121: prompt banner set before resetHome');
  resetHome();
  assert(getPromptMessage() === null,
    'session121: resetHome clears the active prompt banner');
}

/* ================================================================
   HALT / PROMPT lift through SEQ + MAP bodies.

   evalRange now intercepts the SEQ and MAP tokens and delegates to
   `runSeq` / `runMap` generators, so a HALT or PROMPT inside the
   per-iteration body suspends through the same yield channel HALT
   itself uses.  CONT resumes inside the same iteration that was in
   flight at suspension; the partial accumulator survives because it
   lives in the generator's stack frame.

   Sync fallbacks (Name dispatch — `'SEQ' EVAL`, `'MAP' EVAL`) keep
   the reject-with-caller-label behavior — they throw
   `HALT: cannot suspend inside SEQ expression` /
   `HALT: cannot suspend inside MAP program`.
   ================================================================ */

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // « 'X' 1 3 1 SEQ »  with body « X 1 == « HALT » IFT X 10 * »
  // The IFT only fires HALT in iter 1; iters 2+3 run straight through.
  // iter 1: HALT (suspend); after CONT pushes 1*10=10.
  // iter 2: 2*10=20.  iter 3: 3*10=30.
  s.push(Program([
    parseEntry('<< X 1 == << HALT >> IFT X 10 * >>')[0],
    Name('X'),
    Integer(1n),
    Integer(3n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: HALT in SEQ body iter 1 suspends the program');
  assert(haltedDepth() === 1,
    'session126: HALT in SEQ body populates exactly one halted slot');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session126: CONT runs SEQ to completion and clears the halt slot');
  // Final result: { 10 20 30 }.
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3,
    'session126: SEQ produces a 3-element list across HALT/CONT');
  assert(v(top.items[0]) === 10 && v(top.items[1]) === 20 && v(top.items[2]) === 30,
    'session126: SEQ across HALT/CONT yields { 10 20 30 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // body: « I 3 == « HALT » IFT I »  — pushes I, conditionally HALTs.
  // iter 1 → 1, iter 2 → 2, iter 3 → HALT then 3, iter 4 → 4, iter 5 → 5.
  s.push(Program([
    parseEntry('<< I 3 == << HALT >> IFT I >>')[0],
    Name('I'),
    Integer(1n),
    Integer(5n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: SEQ HALT in iter 3 (via IFT body) suspends');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session126: SEQ CONT completes remaining iterations');
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 5,
    'session126: SEQ across HALT-in-middle preserves all five iterations');
  assert(v(top.items[0]) === 1 && v(top.items[1]) === 2 && v(top.items[2]) === 3
      && v(top.items[3]) === 4 && v(top.items[4]) === 5,
    'session126: SEQ partial accumulator + completion produces { 1 2 3 4 5 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  varStore('I', Integer(99n));         // pre-existing binding for I
  const s = new Stack();
  s.push(Program([
    parseEntry('<< I HALT >>')[0],
    Name('I', { quoted: true }),       // quoted: don't evaluate I=99 here
    Integer(1n),
    Integer(3n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: SEQ HALT halts');
  // At this moment the SEQ generator has set I = 1 (Real) for the
  // first iteration.  KILL must close the generator and run the
  // `finally` that restores I to Integer(99).
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session126: KILL clears the SEQ halt slot');
  const restored = varRecall('I');
  assert(restored && restored.type === 'integer' && restored.value === 99n,
    'session126: KILL of halted SEQ restores the prior I binding via finally');
  varPurge('I');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // Conditional PROMPT: only iter 1 prompts (K==1), so a single CONT
  // resumes through PROMPT and finishes iter 2 cleanly.
  s.push(Program([
    parseEntry('<< K K 1 == << "wait!" PROMPT >> IFT 7 * >>')[0],
    Name('K', { quoted: true }),
    Integer(1n),
    Integer(2n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: PROMPT in SEQ body suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'wait!',
    'session126: SEQ-body PROMPT sets the banner mid-iteration');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session126: CONT clears banner after SEQ-body PROMPT');
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2,
    'session126: SEQ completes both iterations after PROMPT/CONT');
}

/* ---- SEQ: sync fallback (direct register dispatch) still rejects HALT ----
   Calls `lookup('SEQ').fn(s)` directly — the sync entry guarded by
   the caller-label assertion.  The generator-flavor runSeq is wrapped
   by `_driveGen(runSeq(s, 0), 'SEQ expression')` in the register, so
   a HALT in the body must surface with that label. */
{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(parseEntry('<< X HALT >>')[0]);
  s.push(Name('X', { quoted: true }));
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Integer(1n));
  assertThrows(() => lookup('SEQ').fn(s),
    /HALT: cannot suspend inside SEQ expression/,
    'session126: sync-fallback SEQ still rejects HALT with the SEQ caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session126: sync-fallback SEQ rejection cleans up halts and frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // 5 1 1 SEQ with HALT body — empty range (5 > 1, step +1) so body
  // never runs, no halt, empty result.
  s.push(Program([
    parseEntry('<< HALT >>')[0],
    Name('I'),
    Integer(5n),
    Integer(1n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() === null,
    'session126: SEQ with empty range never halts');
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 0,
    'session126: SEQ empty-range produces empty list');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // body: « DUP 1 == « HALT » IFT 100 * »
  // iter 1 (input=1): conditional HALT fires; CONT then 1*100=100.
  // iter 2 (input=2): no HALT; 2*100=200.  iter 3: 3*100=300.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    parseEntry('<< DUP 1 == << HALT >> IFT 100 * >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: HALT inside MAP body suspends');
  assert(haltedDepth() === 1,
    'session126: MAP body HALT populates exactly one halted slot');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session126: CONT completes MAP and clears halt slot');
  // Result: { 100 200 300 }
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3,
    'session126: MAP across HALT/CONT yields a 3-element list');
  assert(v(top.items[0]) === 100 && v(top.items[1]) === 200 && v(top.items[2]) === 300,
    'session126: MAP HALT-in-iter-1 preserves all three results after CONT');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // body: « DUP 3 == « HALT » IFT 1 + »
  // Iter 1: 1 → 2; iter 2: 2 → 3; iter 3: HALT, CONT, 3 → 4; iter 4: 4 → 5.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n), Integer(4n)]),
    parseEntry('<< DUP 3 == << HALT >> IFT 1 + >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: MAP HALT-in-iter-3 (via IFT) suspends');
  lookup('CONT').fn(s);
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 4,
    'session126: MAP partial-accumulator preserved across HALT/CONT');
  assert(v(top.items[0]) === 2 && v(top.items[1]) === 3 && v(top.items[2]) === 4 && v(top.items[3]) === 5,
    'session126: MAP across HALT yields { 2 3 4 5 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // Body HALTs only on element 1 so a single CONT finishes the MAP.
  s.push(Program([
    Vector([Real(1), Real(2), Real(3)]),
    parseEntry('<< DUP 1 == << HALT >> IFT 2 * >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: HALT in MAP-over-Vector body suspends');
  lookup('CONT').fn(s);
  const top = s.peek();
  assert(top && top.type === 'vector' && top.items.length === 3,
    'session126: MAP over Vector returns a Vector after HALT/CONT');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // Body HALTs only on the (1,1) entry so a single CONT finishes the matrix walk.
  s.push(Program([
    Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]),
    parseEntry('<< DUP 1 == << HALT >> IFT 10 * >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: HALT in MAP-over-Matrix body suspends');
  lookup('CONT').fn(s);
  const top = s.peek();
  assert(top && top.type === 'matrix' && top.rows.length === 2 && top.rows[0].length === 2,
    'session126: MAP over Matrix preserves 2x2 shape after HALT/CONT');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // Conditional PROMPT: only fires once.
  s.push(Program([
    RList([Integer(1n), Integer(2n)]),
    parseEntry('<< DUP 1 == << "msg" PROMPT >> IFT 5 + >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: PROMPT in MAP body suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'msg',
    'session126: MAP-body PROMPT sets the banner');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session126: CONT clears banner after MAP-body PROMPT');
}

/* ---- MAP: sync fallback (direct register dispatch) still rejects HALT ----
   `lookup('MAP').fn(s)` runs the new register, which wraps runMap in
   `_driveGen(runMap(s, 0), 'MAP program')`.  The session-111 invariant —
   "outside the lift path, HALT names the op that blocked it" — must
   continue to hold. */
{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(parseEntry('<< HALT >>')[0]);
  assertThrows(() => lookup('MAP').fn(s),
    /HALT: cannot suspend inside MAP program/,
    'session126: sync-fallback MAP still rejects HALT with the MAP caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session126: sync-fallback MAP rejection cleans up halts and frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([]),
    parseEntry('<< HALT >>')[0],
    Name('MAP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() === null,
    'session126: MAP on empty list never halts');
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 0,
    'session126: MAP on empty list returns empty list');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // 7 → a « { 1 2 } « a HALT * » MAP »
  s.push(Real(7));
  s.push(parseEntry('<< → a << { 1 2 } << a HALT * >> MAP >> >>')[0]);
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: HALT in MAP-in-→ body suspends through both intercepts');
  assert(localFramesDepth() === 1,
    'session126: → frame survives across MAP-body HALT');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session126: KILL clears the halt slot');
  assert(localFramesDepth() === 0,
    'session126: KILL closes the generator and tears down → frame from MAP-in-→');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  varStore('J', Integer(7n));
  const s = new Stack();
  s.push(Program([
    parseEntry('<< HALT >>')[0],
    Name('J', { quoted: true }),         // quoted so J=7 isn't substituted
    Integer(1n),
    Integer(2n),
    Integer(1n),
    Name('SEQ'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session126: SEQ halt set up before resetHome');
  resetHome();
  assert(getHalted() === null,
    'session126: resetHome clears the SEQ halt slot');
  // resetHome wipes varStore wholesale; J is gone (the finally still ran
  // and tried to restore J=7, but resetHome already cleared the home dir
  // afterward — net effect is J undefined).  The invariant we care about
  // is that resetHome did NOT leak local frames or halt slots.
  assert(localFramesDepth() === 0,
    'session126: resetHome of halted SEQ leaves no local-frame leak');
}

/* ================================================================
   HALT/PROMPT lift through DOLIST / DOSUBS / STREAM bodies via
   `evalRange` body-intercept paths that delegate to the
   `runDoList` / `runDoSubs` / `runStream` generator helpers.

   Same shape as SEQ/MAP: each iteration EVAL's the body program
   through `_evalValueGen` (yieldable), and a HALT inside the body
   suspends through `yield*` up to the EVAL/CONT driver.  The
   accumulator (`out` array, current `i`, in-progress STREAM
   accumulator on the *RPL* stack, NSUB/ENDSUB frame) lives in the
   helper's stack frame — except STREAM, whose accumulator is on the
   user-visible RPL stack — so CONT resumes mid-iteration with all
   state intact.

   Sync fallbacks (Name dispatch — `'DOLIST' EVAL`, etc., and direct
   `lookup('DOLIST').fn(s)` calls) reject with the caller label —
   they throw `HALT: cannot suspend inside DOLIST program` /
   `... DOSUBS program` / `... STREAM program`.
   ================================================================ */

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // body: « DUP 1 == « HALT » IFT 10 * »
  // iter 1 (input=1): conditional HALT fires; CONT then 1*10=10.
  // iter 2 (input=2): 2*10=20.  iter 3: 3*10=30.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    parseEntry('<< DUP 1 == << HALT >> IFT 10 * >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: HALT in DOLIST body iter 1 suspends the program');
  assert(haltedDepth() === 1,
    'session131: DOLIST body HALT populates exactly one halted slot');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session131: CONT runs DOLIST to completion and clears the halt slot');
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3,
    'session131: DOLIST produces a 3-element list across HALT/CONT');
  assert(v(top.items[0]) === 10 && v(top.items[1]) === 20 && v(top.items[2]) === 30,
    'session131: DOLIST across HALT/CONT yields { 10 20 30 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // 5-element list, HALT only on input=3 (the middle element).
  // iter 1 → 1, iter 2 → 2, iter 3 → HALT then 3, iter 4 → 4, iter 5 → 5.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n), Integer(4n), Integer(5n)]),
    parseEntry('<< DUP 3 == << HALT >> IFT >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: DOLIST HALT in iter 3 (via IFT body) suspends');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session131: DOLIST CONT completes remaining iterations');
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 5,
    'session131: DOLIST across HALT-in-middle preserves all five iterations');
  assert(v(top.items[0]) === 1 && v(top.items[1]) === 2 && v(top.items[2]) === 3
      && v(top.items[3]) === 4 && v(top.items[4]) === 5,
    'session131: DOLIST partial accumulator + completion produces { 1 2 3 4 5 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // { 1 2 3 } { 10 20 30 } 2 « + DUP 11 == « HALT » IFT »  DOLIST
  // iter 1: 1+10=11 → HALT; CONT pushes 11.  iter 2: 2+20=22.  iter 3: 3+30=33.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    RList([Integer(10n), Integer(20n), Integer(30n)]),
    Integer(2n),
    parseEntry('<< + DUP 11 == << HALT >> IFT >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: DOLIST 2-list form HALTs on iter 1');
  lookup('CONT').fn(s);
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3,
    'session131: DOLIST 2-list form produces 3 elements across HALT/CONT');
  assert(v(top.items[0]) === 11 && v(top.items[1]) === 22 && v(top.items[2]) === 33,
    'session131: DOLIST 2-list form yields { 11 22 33 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(1n), Integer(2n)]),
    parseEntry('<< DUP 1 == << "wait!" PROMPT >> IFT 7 * >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: PROMPT in DOLIST body suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'wait!',
    'session131: DOLIST-body PROMPT sets the banner mid-iteration');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session131: CONT clears banner after DOLIST-body PROMPT');
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 2
      && v(top.items[0]) === 7 && v(top.items[1]) === 14,
    'session131: DOLIST completes both iterations after PROMPT/CONT (yields { 7 14 })');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(1n), Integer(2n)]),
    parseEntry('<< HALT >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null, 'session131: DOLIST HALT halts');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session131: KILL clears the DOLIST halt slot');
  assert(localFramesDepth() === 0,
    'session131: KILL of halted DOLIST leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n) ]));
  s.push(parseEntry('<< HALT >>')[0]);
  assertThrows(() => lookup('DOLIST').fn(s),
    /HALT: cannot suspend inside DOLIST program/,
    'session131: sync-fallback DOLIST still rejects HALT with the DOLIST caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session131: sync-fallback DOLIST rejection cleans up halts and frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([]),
    parseEntry('<< HALT >>')[0],
    Name('DOLIST'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() === null,
    'session131: DOLIST on empty list never halts');
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 0,
    'session131: DOLIST on empty list produces empty list');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // { 1 2 3 4 } 2 « + DUP 3 == « HALT » IFT »  DOSUBS
  // windows: (1,2)→3 (HALT then push), (2,3)→5, (3,4)→7
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n), Integer(4n)]),
    Integer(2n),
    parseEntry('<< + DUP 3 == << HALT >> IFT >>')[0],
    Name('DOSUBS'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: HALT in DOSUBS body iter 1 suspends');
  assert(haltedDepth() === 1,
    'session131: DOSUBS body HALT populates exactly one halted slot');
  // Frame should be alive while the program is suspended.
  assert(dosubsStackDepth() === 1,
    'session131: DOSUBS NSUB/ENDSUB frame survives across mid-window HALT');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session131: CONT runs DOSUBS to completion');
  assert(dosubsStackDepth() === 0,
    'session131: DOSUBS frame torn down after CONT completes');
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3
      && v(top.items[0]) === 3 && v(top.items[1]) === 5 && v(top.items[2]) === 7,
    'session131: DOSUBS across HALT/CONT yields { 3 5 7 }');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // { 10 20 30 } 1 « DROP NSUB ENDSUB + »  DOSUBS
  // (drops the window value, then for each window i in [1..3] pushes i + 3 = 4 5 6)
  // Add a HALT in window 2 to verify the *frame index* survives the suspension.
  s.push(Program([
    RList([Integer(10n), Integer(20n), Integer(30n)]),
    Integer(1n),
    parseEntry('<< DROP NSUB DUP 2 == << HALT >> IFT ENDSUB + >>')[0],
    Name('DOSUBS'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: DOSUBS HALT in window 2 suspends');
  // At suspension we should be inside window 2; after CONT, frame.index
  // continues from 2 → 3.  The result captures both NSUB indices.
  lookup('CONT').fn(s);
  const top = s.peek();
  const v = (item) => item.value && item.value.toNumber ? item.value.toNumber() : Number(item.value);
  assert(top && top.type === 'list' && top.items.length === 3
      && v(top.items[0]) === 4   // NSUB=1, ENDSUB=3, 1+3=4
      && v(top.items[1]) === 5   // NSUB=2 (preserved across HALT), 2+3=5
      && v(top.items[2]) === 6,  // NSUB=3, 3+3=6
    'session131: DOSUBS NSUB index survives HALT/CONT and continues correctly');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    Integer(2n),
    parseEntry('<< + HALT >>')[0],
    Name('DOSUBS'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null, 'session131: DOSUBS halted on first window');
  assert(dosubsStackDepth() === 1,
    'session131: DOSUBS frame is alive during the halted window');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session131: KILL clears the DOSUBS halt slot');
  assert(dosubsStackDepth() === 0,
    'session131: KILL closes the generator and tears down the DOSUBS frame');
  // Outside the now-killed DOSUBS, NSUB/ENDSUB should throw the
  // canonical "Undefined local name" — the frame must really be gone.
  const s2 = new Stack();
  assertThrows(() => lookup('NSUB').fn(s2),
    /Undefined local name/,
    'session131: NSUB outside DOSUBS throws after KILL teardown');
  assertThrows(() => lookup('ENDSUB').fn(s2),
    /Undefined local name/,
    'session131: ENDSUB outside DOSUBS throws after KILL teardown');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n), Integer(3n) ]));
  s.push(Integer(2n));
  s.push(parseEntry('<< HALT >>')[0]);
  assertThrows(() => lookup('DOSUBS').fn(s),
    /HALT: cannot suspend inside DOSUBS program/,
    'session131: sync-fallback DOSUBS still rejects HALT with the DOSUBS caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0
      && dosubsStackDepth() === 0,
    'session131: sync-fallback DOSUBS rejection cleans up halts, frames, and DOSUBS frame');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(1n)]),                  // length 1
    Integer(5n),                           // window size > length
    parseEntry('<< HALT >>')[0],
    Name('DOSUBS'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() === null,
    'session131: DOSUBS with no windows never halts');
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 0,
    'session131: DOSUBS no-windows short-circuit produces empty list');
  assert(dosubsStackDepth() === 0,
    'session131: DOSUBS no-windows short-circuit pushes no NSUB frame');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // { 1 2 3 4 } « + DUP 3 == « HALT » IFT » STREAM
  // fold steps: 1+2=3 (HALT then 3 stays as accumulator), 3+3=6, 6+4=10.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n), Integer(4n)]),
    parseEntry('<< + DUP 3 == << HALT >> IFT >>')[0],
    Name('STREAM'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: HALT in STREAM body suspends');
  // The accumulator at suspension is on the RPL stack (STREAM's
  // accumulator lives on the user-visible stack between fold steps).
  assert(s.depth === 1 && s.peek() && s.peek().value === 3n,
    'session131: STREAM accumulator (3) visible on RPL stack at HALT');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session131: CONT completes STREAM fold');
  assert(s.depth === 1 && Number(s.peek().value) === 10,
    'session131: STREAM CONT yields final accumulator 10');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // { 1 2 3 } « + DUP 3 == « "halfway" PROMPT » IFT » STREAM
  // fold steps: 1+2=3 (PROMPT here), then 3+3=6.
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    parseEntry('<< + DUP 3 == << "halfway" PROMPT >> IFT >>')[0],
    Name('STREAM'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: PROMPT in STREAM body suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'halfway',
    'session131: STREAM-body PROMPT sets the banner mid-fold');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session131: CONT clears banner after STREAM-body PROMPT');
  assert(s.depth === 1 && Number(s.peek().value) === 6,
    'session131: STREAM completes after PROMPT/CONT (final accumulator = 6)');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(RList([ Integer(1n), Integer(2n), Integer(3n) ]));
  s.push(parseEntry('<< HALT >>')[0]);
  assertThrows(() => lookup('STREAM').fn(s),
    /HALT: cannot suspend inside STREAM program/,
    'session131: sync-fallback STREAM still rejects HALT with the STREAM caller label');
  assert(haltedDepth() === 0 && localFramesDepth() === 0,
    'session131: sync-fallback STREAM rejection cleans up halts and frames');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(42n)]),
    parseEntry('<< HALT + >>')[0],         // would HALT if reached
    Name('STREAM'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() === null,
    'session131: STREAM single-element short-circuit never halts');
  assert(s.depth === 1 && Number(s.peek().value) === 42,
    'session131: STREAM single-element short-circuit pushes the bare element');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // 7 → a « { 1 2 } « a HALT * » DOLIST »
  s.push(Real(7));
  s.push(parseEntry('<< → a << { 1 2 } << a HALT * >> DOLIST >> >>')[0]);
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: HALT in DOLIST-in-→ body suspends through both intercepts');
  assert(localFramesDepth() === 1,
    'session131: → frame survives across DOLIST-body HALT');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session131: KILL clears the halt slot');
  assert(localFramesDepth() === 0,
    'session131: KILL closes the generator and tears down → frame from DOLIST-in-→');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // 7 → a « { 1 2 3 } 2 « a HALT * + » DOSUBS »
  s.push(Real(7));
  s.push(parseEntry('<< → a << { 1 2 3 } 2 << a HALT * + >> DOSUBS >> >>')[0]);
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session131: HALT in DOSUBS-in-→ body suspends');
  assert(localFramesDepth() === 1 && dosubsStackDepth() === 1,
    'session131: both → and DOSUBS frames are alive across the halted window');
  lookup('KILL').fn(s);
  assert(getHalted() === null && localFramesDepth() === 0 && dosubsStackDepth() === 0,
    'session131: KILL of DOSUBS-in-→ tears down both frames via finally chain');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  s.push(Program([
    RList([Integer(1n), Integer(2n), Integer(3n)]),
    Integer(2n),
    parseEntry('<< + HALT >>')[0],
    Name('DOSUBS'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null && dosubsStackDepth() === 1,
    'session131: DOSUBS halted with frame alive');
  resetHome();
  assert(getHalted() === null,
    'session131: resetHome clears the DOSUBS halt slot');
  assert(dosubsStackDepth() === 0,
    'session131: resetHome closes the DOSUBS generator and clears the NSUB/ENDSUB frame');
  assert(localFramesDepth() === 0,
    'session131: resetHome of halted DOSUBS leaves no local-frame leak');
}

/* ================================================================
   Auto-close on missing END / NEXT for the counter and condition
   loops.

   Symmetric with the IF / IFERR / CASE auto-close policy and with
   the parser's auto-close on unterminated `«`, `{`, `[`.  A forward
   scan inside `runWhile` / `runDo` / `runStart` / `runFor` that
   falls off the end of the token list is treated as an implicit
   closer:

     « WHILE test REPEAT body »   ≡  « WHILE test REPEAT body END »
     « DO body UNTIL test »       ≡  « DO body UNTIL test END »
     « 1 5 START body »           ≡  « 1 5 START body NEXT »
     « 1 5 FOR i body »           ≡  « 1 5 FOR i body NEXT »

   What does NOT auto-close:
     - WHILE without REPEAT (still a hard error — no default
       body separator).
     - DO without UNTIL (same).
     - FOR without a name token (no default counter name).
     - A spurious END at depth 0 in the START / FOR closer slot
       still raises START/FOR without NEXT/STEP.
     - A spurious NEXT / STEP at depth 0 in the WHILE / DO
       closer slot still raises WHILE/REPEAT (or DO/UNTIL)
       without END.
   ================================================================ */

{
  resetHome();
  const s = new Stack();
  // « 0 WHILE DUP 3 < REPEAT 1 + »   — auto-closed; loops 0 → 3
  s.push(Program([
    Integer(0),
    Name('WHILE'), Name('DUP'), Integer(3), Name('<'),
    Name('REPEAT'),
      Integer(1), Name('+'),
    // no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
    'session136: WHILE/REPEAT auto-closes on missing END (loops to 3)');
}

{
  resetHome();
  const s = new Stack();
  // « 7 WHILE 0 REPEAT 1 + »   — auto-closed; body never runs
  s.push(Program([
    Integer(7),
    Name('WHILE'), Integer(0), Name('REPEAT'),
      Integer(1), Name('+'),
    // no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session136: WHILE/REPEAT auto-close with false test never enters body');
}

{
  resetHome();
  const s = new Stack();
  // Stack-based version (no quoted names — Program-body parser leaves
  // tick-quoted names with the apostrophes baked into the id; we use
  // pure stack-effect logic instead, which is closed-over by the
  // auto-close path the same way):
  // Stack starts empty; the program puts 0 on the stack and increments
  // until DUP < 4 is false → final value 4.  The outer `>>` is
  // intentionally missing — the program parser auto-closes; the inner
  // WHILE is missing END — the runtime auto-closes.
  const vs = parseEntry('<< 0 WHILE DUP 4 < REPEAT 1 + >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  // Loop body increments DUP until DUP >= 4: 0 → 1 → 2 → 3 → 4
  assert(s.depth === 1 && s.peek().value === 4n,
    'session136: parsed WHILE auto-closes on missing END and runs to completion');
}

{
  resetHome();
  const s = new Stack();
  // « WHILE 1 1 + »   — no REPEAT separator
  s.push(Program([
    Name('WHILE'), Integer(1), Integer(1), Name('+'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: WHILE without REPEAT still throws');
  assert(/WHILE without REPEAT/.test(err.message),
    'session136: WHILE without REPEAT preserves error message');
  // EVAL's snapshot is post-pop, so the Program is consumed on the
  // structural-error throw.  Empty stack at end.
  assert(s.depth === 0,
    'ship-prep r3: WHILE-without-REPEAT consumes the Program (post-pop snapshot)');
}

{
  resetHome();
  const s = new Stack();
  // « WHILE 1 REPEAT 2 NEXT »   — NEXT in the END slot, no real END
  // The depth-0 NEXT closer scan returns a NEXT, not an END.
  s.push(Program([
    Name('WHILE'), Integer(1), Name('REPEAT'), Integer(2), Name('NEXT'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: WHILE with spurious NEXT throws');
  assert(/WHILE\/REPEAT without END/.test(err.message),
    'session136: WHILE with spurious NEXT preserves "without END" error');
}

{
  resetHome();
  const s = new Stack();
  // « 0 DO 1 + UNTIL DUP 3 ≥ »   — auto-closed; runs 3 times → 3
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'),
    Name('UNTIL'),
      Name('DUP'), Integer(3), Name('≥'),
    // no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
    'session136: DO/UNTIL auto-closes on missing END (3 iterations)');
}

{
  resetHome();
  const s = new Stack();
  // « 0 DO 99 UNTIL 1 »   — auto-closed; runs once, leaves [0, 99]
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(99),
    Name('UNTIL'),
      Integer(1),
    // no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek().value === 99n && s.peek(2).value === 0n,
    'session136: DO/UNTIL auto-close still runs body at least once');
}

{
  resetHome();
  const s = new Stack();
  // « DO 1 1 + »   — no UNTIL separator
  s.push(Program([
    Name('DO'), Integer(1), Integer(1), Name('+'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: DO without UNTIL still throws');
  assert(/DO without UNTIL/.test(err.message),
    'session136: DO without UNTIL preserves error message');
}

{
  resetHome();
  const s = new Stack();
  // « DO 1 UNTIL 1 NEXT »   — NEXT in the END slot
  s.push(Program([
    Name('DO'), Integer(1), Name('UNTIL'), Integer(1), Name('NEXT'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: DO with spurious NEXT throws');
  assert(/DO\/UNTIL without END/.test(err.message),
    'session136: DO with spurious NEXT preserves "without END" error');
}

{
  resetHome();
  const s = new Stack();
  // 0 on stack; then « 1 5 START 1 + »   — auto-closed as NEXT;
  // body runs (5 - 1 + 1) = 5 times, accumulates 1 each iteration → 5
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(5), Name('START'),
      Integer(1), Name('+'),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 5n,
    'session136: START auto-closes on missing NEXT (loops 5 times)');
}

{
  resetHome();
  const s = new Stack();
  // 7 on stack; « 5 1 START 1 + »   — start>end runs once on HP50
  // (counter past end after first body), so 7 + 1 = 8.
  s.push(Integer(7));
  s.push(Program([
    Integer(5), Integer(1), Name('START'),
      Integer(1), Name('+'),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 8n,
    'session136: START auto-close runs body once when start>end (HP50 semantics)');
}

{
  resetHome();
  const s = new Stack();
  // « 1 5 START 1 + END »   — END in the closer slot (not NEXT/STEP)
  s.push(Program([
    Integer(1), Integer(5), Name('START'),
      Integer(1), Name('+'),
    Name('END'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: START with spurious END throws');
  assert(/START without NEXT\/STEP/.test(err.message),
    'session136: START with spurious END preserves "without NEXT/STEP" error');
}

{
  resetHome();
  const s = new Stack();
  // « 0 1 4 FOR i i + »   — sum 1..4; auto-closed → 0+1+2+3+4 = 10
  s.push(Program([
    Integer(0),
    Integer(1), Integer(4), Name('FOR'), Name('i'),
      Name('i'), Name('+'),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session136: FOR auto-closes on missing NEXT (sums 1..4 to 10)');
  // Loop var must be purged after the loop, even on the auto-close path
  assert(varRecall('i') === undefined,
    'session136: FOR auto-close still purges the loop var on exit');
}

{
  resetHome();
  varStore('i', Real(99));    // pre-existing binding
  const s = new Stack();
  // « 1 3 FOR i i »   — body pushes the counter each iteration; no NEXT
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('i'),
      Name('i'),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3,
    'session136: FOR auto-close pushed three counter values');
  const restored = varRecall('i');
  assert(restored && isReal(restored) && restored.value.eq(99),
    'session136: FOR auto-close restores pre-existing var binding via finally');
}

{
  resetHome();
  const s = new Stack();
  // « 1 3 FOR i 1 END »   — END in the closer slot
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('i'),
      Integer(1),
    Name('END'),
  ]));
  const err = assertThrows(() => lookup('EVAL').fn(s),
                           null,
                           'session136: FOR with spurious END throws');
  assert(/FOR without NEXT\/STEP/.test(err.message),
    'session136: FOR with spurious END preserves "without NEXT/STEP" error');
  // Auto-close is still purgeable: the FOR var should not have leaked.
  // (FOR throws before runLoopBody — the saved/restore finally never fires
  // because no try block was entered yet for the body.  But pre-existing
  // bindings are unchanged.)
  assert(varRecall('i') === undefined,
    'session136: FOR-without-NEXT/STEP error leaves no leaked binding');
}

{
  resetHome();
  const s = new Stack();
  // « IF 1 THEN 0 WHILE DUP 3 < REPEAT 1 + »
  // Both the outer IF and the inner WHILE are missing their END.
  // Both auto-close at the end of the program body.  The IF runs the
  // true-branch, which runs the WHILE to completion → 3.
  s.push(Program([
    Name('IF'), Integer(1), Name('THEN'),
      Integer(0),
      Name('WHILE'), Name('DUP'), Integer(3), Name('<'),
      Name('REPEAT'),
        Integer(1), Name('+'),
    // no inner END (WHILE), no outer END (IF)
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
    'session136: nested WHILE-in-IF both auto-close correctly');
}

{
  resetHome();
  const s = new Stack();
  const vs = parseEntry('<< 0 1 5 FOR k k + >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  // 0 + 1 + 2 + 3 + 4 + 5 = 15
  assert(s.depth === 1 && s.peek().value === 15n,
    'session136: parsed-source FOR auto-closes on missing NEXT (sum 1..5)');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 3 START HALT 7 »   — auto-closed as NEXT; HALT in iter 1 lifts
  s.push(Program([
    Integer(1), Integer(3), Name('START'),
      Name('HALT'), Integer(7),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session136: HALT in auto-closed START body suspends');
  // CONT three times to complete all iterations
  lookup('CONT').fn(s);
  // After first CONT: pushes 7, then re-enters loop iter 2, halts again
  assert(getHalted() !== null,
    'session136: auto-closed START re-suspends on iter 2 HALT');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session136: auto-closed START re-suspends on iter 3 HALT');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session136: auto-closed START completes after 3 CONT calls');
  assert(s.depth === 3 && s.peek().value === 7n,
    'session136: auto-closed START leaves three 7s on stack after full HALT/CONT cycle');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 5 FOR i HALT i »   — auto-closed FOR; HALT iter 1; KILL teardown
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('i'),
      Name('HALT'), Name('i'),
    // no NEXT
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session136: HALT in auto-closed FOR body suspends');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session136: KILL clears the halt slot in auto-closed FOR');
  // The FOR's finally restored the i binding.  Since no prior i existed,
  // varPurge('i') ran in finally; varRecall must be undefined.
  assert(varRecall('i') === undefined,
    'session136: KILL of halted auto-closed FOR purges the loop var via finally');
  assert(localFramesDepth() === 0,
    'session136: KILL of halted auto-closed FOR leaves no local-frame leak');
}

/* ================================================================
   HALT/PROMPT lift through IFERR clauses
   ================================================================
   The IFERR runner is a generator and uses `yield* evalRange(...)`
   for its trap, THEN, and ELSE clauses, so a HALT/PROMPT inside any
   of those clauses lifts mechanically through the yield* chain.

   The interesting interaction is the THEN clause: runIfErr saves the
   outer last-error before calling setLastError(caught) and restores
   it in a `finally` that wraps the THEN-clause yield*.  A HALT inside
   THEN must:
     - keep the caught error visible to ERRM/ERRN during the halt
       window (the finally has not run yet — yield is not return);
     - run the finally on completion (CONT) so the outer last-error
       slot is restored once the THEN clause finishes; AND
     - run the finally on KILL (gen.return() triggers the finally
       chain), so killing a halted IFERR-THEN does not leak the
       caught error into the outer scope.
   ================================================================ */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 10 IFERR HALT 99 THEN 7 ELSE 8 END »
  // Trap halts on its first token; CONT resumes; trap pushes 99; trap
  // completes without error → ELSE runs (8 pushed).  Final stack
  // ⟦10 99 8⟧.  The HALT must NOT be caught by the IFERR — yield is
  // not an exception.
  s.push(Program([
    Integer(10),
    Name('IFERR'), Name('HALT'), Integer(99),
    Name('THEN'), Integer(7),
    Name('ELSE'), Integer(8),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in IFERR trap suspends');
  assert(haltedDepth() === 1,
    'session141: HALT in IFERR trap populates exactly one halted slot');
  assert(s.depth === 1 && s.peek().value === 10n,
    'session141: HALT in IFERR trap leaves pre-IFERR stack visible (10)');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT after HALT-in-IFERR-trap completes the program');
  assert(s.depth === 3,
    'session141: HALT-in-IFERR-trap CONT yields trap result + ELSE result');
  assert(s.peek(3).value === 10n, 'session141: bottom unchanged');
  assert(s.peek(2).value === 99n, 'session141: trap-residue 99 preserved');
  assert(s.peek(1).value === 8n,
    'session141: ELSE branch ran (no error) → 8 on top');
  assert(localFramesDepth() === 0,
    'session141: HALT-in-IFERR-trap leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 10 IFERR 1 0 / THEN HALT 99 ELSE 8 END »
  // 1/0 → Infinite result → catch → THEN runs.  HALT in THEN suspends.
  // last-error visible during halt; CONT runs the rest of THEN (push
  // 99), the finally restores last-error (null in outer scope).
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('HALT'), Integer(99),
    Name('ELSE'), Integer(8),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in IFERR THEN suspends');
  // Stack rolled back to pre-IFERR state (10) before THEN started.
  assert(s.depth === 1 && s.peek().value === 10n,
    'session141: HALT-in-IFERR-THEN sees the rolled-back trap stack');
  // last-error is the trapped error during the halt window — the
  // restoreLastError in runIfErr's finally has NOT run yet (yield is
  // not a return).  ERRM / ERRN / ERR0 inside the resumed THEN body
  // would still see this.
  const errDuringHalt = getLastError();
  assert(errDuringHalt && /Infinite result/.test(errDuringHalt.message),
    'session141: trapped last-error visible during HALT-in-THEN');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT after HALT-in-IFERR-THEN completes the program');
  // After THEN finishes, the finally has run and restored the outer
  // last-error (null on entry — there was no outer error).
  assert(getLastError() === null,
    'session141: IFERR finally restores outer last-error after CONT');
  assert(s.depth === 2 && s.peek().value === 99n,
    'session141: HALT-in-THEN CONT pushes the post-HALT 99');
  assert(s.peek(2).value === 10n,
    'session141: pre-IFERR stack preserved beneath THEN result');
  assert(localFramesDepth() === 0,
    'session141: HALT-in-IFERR-THEN leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « IFERR 1 2 + THEN 9 ELSE HALT 7 END »
  // Trap pushes 3 (no error) → ELSE runs.  HALT in ELSE suspends with
  // 3 already on the stack.  CONT runs the rest of ELSE (push 7).
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(9),
    Name('ELSE'), Name('HALT'), Integer(7),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in IFERR ELSE suspends');
  // Trap residue (3) is preserved into the ELSE clause — HP50
  // semantics keep the success path's stack residue.
  assert(s.depth === 1 && s.peek().value === 3n,
    'session141: HALT-in-IFERR-ELSE sees the trap-residue stack');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT after HALT-in-IFERR-ELSE completes the program');
  assert(s.depth === 2 && s.peek().value === 7n,
    'session141: HALT-in-ELSE CONT pushes the post-HALT 7');
  assert(s.peek(2).value === 3n,
    'session141: trap residue (3) survives the ELSE HALT/CONT cycle');
  assert(localFramesDepth() === 0,
    'session141: HALT-in-IFERR-ELSE leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // « IFERR 1 0 / THEN "wait" PROMPT 99 END »
  // 1/0 → catch → THEN runs.  "wait" pushed, PROMPT pops it to the
  // banner and halts.  CONT clears banner; THEN finishes (push 99).
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Str('wait'), Name('PROMPT'), Integer(99),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: PROMPT in IFERR THEN suspends');
  const banner = getPromptMessage();
  assert(banner && banner.type === 'string' && banner.value === 'wait',
    'session141: PROMPT-in-THEN banner is the popped message');
  assert(s.depth === 0,
    'session141: PROMPT-in-THEN consumed the message before yield');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT after PROMPT-in-THEN completes the program');
  assert(getPromptMessage() === null,
    'session141: CONT clears the PROMPT banner');
  assert(s.depth === 1 && s.peek().value === 99n,
    'session141: PROMPT-in-THEN CONT pushes the post-PROMPT 99');
  assert(getLastError() === null,
    'session141: IFERR finally restores outer last-error after PROMPT/CONT');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « IFERR 1 0 / THEN HALT 99 END »  → trap errors, THEN halts.
  // KILL must close the generator → run the IFERR `finally` →
  // restore the outer last-error slot to whatever it was before the
  // trap (null in this scope).
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('HALT'), Integer(99),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT-in-IFERR-THEN suspends (KILL precondition)');
  assert(getLastError() && /Infinite result/.test(getLastError().message),
    'session141: trapped last-error visible during halt before KILL');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session141: KILL clears the halted IFERR-THEN slot');
  // Finally chain ran via gen.return(): outer last-error is restored.
  assert(getLastError() === null,
    'session141: KILL of halted IFERR-THEN restores outer last-error via finally');
  assert(localFramesDepth() === 0,
    'session141: KILL of halted IFERR-THEN leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 5 IFERR HALT "boom" DOERR THEN 7 END »
  // Trap halts → CONT resumes → DOERR throws → catch → stack rolls
  // back to pre-IFERR (5) → THEN runs (push 7).
  s.push(Program([
    Integer(5),
    Name('IFERR'), Name('HALT'), Str('boom'), Name('DOERR'),
    Name('THEN'), Integer(7),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in trap (pre-DOERR) suspends');
  assert(s.depth === 1 && s.peek().value === 5n,
    'session141: HALT-in-trap with pending DOERR sees pre-IFERR stack');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT runs DOERR → catch → THEN to completion');
  assert(s.depth === 2 && s.peek().value === 7n,
    'session141: post-HALT DOERR triggered THEN clause');
  assert(s.peek(2).value === 5n,
    'session141: catch rolled back trap residue → 5 preserved');
  assert(getLastError() === null,
    'session141: outer last-error restored after THEN finishes');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 10 IFERR HALT 5 THEN 99 »   (no END — auto-closed)
  // Trap halts; CONT resumes; trap pushes 5; no error → THEN does NOT
  // run.  Final stack ⟦10 5⟧ — same as the explicit-END form.
  s.push(Program([
    Integer(10),
    Name('IFERR'), Name('HALT'), Integer(5),
    Name('THEN'), Integer(99),
    // no END — auto-closed at end of program
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in auto-closed IFERR trap suspends');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT completes auto-closed IFERR trap after HALT');
  assert(s.depth === 2,
    'session141: auto-closed IFERR + trap HALT/CONT yields 2-deep stack');
  assert(s.peek(2).value === 10n && s.peek(1).value === 5n,
    'session141: auto-closed IFERR + trap HALT yields ⟦10 5⟧ (no error → no THEN)');
  assert(localFramesDepth() === 0,
    'session141: auto-closed IFERR + HALT leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 10 IFERR 1 0 / THEN HALT 7 »   (no END — auto-closed)
  // Trap errors → THEN runs.  HALT in auto-closed THEN suspends.  CONT
  // resumes; THEN pushes 7; auto-close terminates the construct.
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('HALT'), Integer(7),
    // no END — auto-closed at end of program
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in auto-closed IFERR THEN suspends');
  assert(getLastError() && /Infinite result/.test(getLastError().message),
    'session141: trapped last-error visible during auto-closed THEN halt');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT completes auto-closed IFERR THEN after HALT');
  assert(s.depth === 2 && s.peek().value === 7n,
    'session141: auto-closed THEN CONT pushes the post-HALT 7');
  assert(s.peek(2).value === 10n,
    'session141: pre-IFERR stack preserved beneath auto-closed THEN result');
  assert(getLastError() === null,
    'session141: auto-closed IFERR finally restores outer last-error');
  assert(localFramesDepth() === 0,
    'session141: auto-closed IFERR THEN HALT leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « IFERR 1 2 + THEN 9 ELSE HALT 7 »   (no END — auto-closed)
  // Trap pushes 3 (no error) → ELSE runs.  HALT in auto-closed ELSE
  // suspends.  CONT pushes 7; ELSE auto-closes.
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(9),
    Name('ELSE'), Name('HALT'), Integer(7),
    // no END — auto-closed at end of program
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: HALT in auto-closed IFERR ELSE suspends');
  assert(s.depth === 1 && s.peek().value === 3n,
    'session141: HALT-in-auto-closed-ELSE sees trap residue (3)');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: CONT completes auto-closed IFERR ELSE after HALT');
  assert(s.depth === 2 && s.peek().value === 7n,
    'session141: auto-closed ELSE CONT pushes the post-HALT 7');
  assert(s.peek(2).value === 3n,
    'session141: trap residue (3) survives auto-closed ELSE HALT/CONT');
  assert(localFramesDepth() === 0,
    'session141: auto-closed IFERR ELSE HALT leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Outer IFERR catches first error, sets outer last-error.  Inner
  // IFERR inside the outer THEN catches a second error; inner THEN
  // halts.  The outer last-error save/restore is per-frame, so:
  //   - During the inner halt: getLastError() == inner caught
  //   - After CONT (inner finishes): getLastError() restored to OUTER caught
  //   - After outer finishes: getLastError() restored to null (entry value)
  // « IFERR 1 0 / THEN
  //     IFERR "inner" DOERR THEN HALT END
  //   END »
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'),
      Name('IFERR'), Str('inner'), Name('DOERR'),
      Name('THEN'), Name('HALT'),
      Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: nested IFERR — inner THEN HALT suspends');
  // During the inner halt, last-error is the INNER caught error.
  const innerErr = getLastError();
  assert(innerErr && /inner/.test(innerErr.message),
    'session141: inner caught error visible during inner-THEN halt');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session141: nested IFERR — CONT completes inner THEN');
  // Inner finally restored outer last-error to the OUTER caught error;
  // outer finally then restored to null (no error before outer IFERR).
  assert(getLastError() === null,
    'session141: nested IFERR — both finallys ran in order, last-error fully restored');
  assert(localFramesDepth() === 0,
    'session141: nested IFERR HALT leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Outer IFERR catches a "outer" error; outer THEN runs an inner
  // IFERR whose THEN halts.  KILL must close the generator → run the
  // inner finally → restore last-error to the OUTER caught error.
  // The outer's own finally does NOT run on KILL because the outer
  // THEN body's yield* never returns control to runIfErr — KILL
  // closes the whole generator chain at once via gen.return(), so
  // ALL active finallys (inner first, then outer) fire in LIFO order
  // — last-error ends up as `null` (the entry value before outer
  // IFERR ran).
  s.push(Program([
    Name('IFERR'), Str('outer'), Name('DOERR'),
    Name('THEN'),
      Name('IFERR'), Str('inner'), Name('DOERR'),
      Name('THEN'), Name('HALT'),
      Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session141: nested IFERR KILL — precondition halt');
  // Inner caught error visible during halt.
  const innerErr2 = getLastError();
  assert(innerErr2 && /inner/.test(innerErr2.message),
    'session141: nested IFERR KILL — inner error visible pre-KILL');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session141: nested IFERR — KILL clears the halt slot');
  // gen.return() ran both finallys in LIFO: inner restores to outer
  // caught, then outer restores to entry-null.  Final state: null.
  assert(getLastError() === null,
    'session141: nested IFERR KILL — last-error fully restored to entry value');
  assert(localFramesDepth() === 0,
    'session141: nested IFERR KILL leaves no local-frame leak');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Sanity guard for a subtle invariant: yield is not an exception, so
  // runIfErr's `try { yield* … } catch (e) { caught = e; }` MUST NOT
  // capture the HALT yield as a "caught" error.  If it did, we'd see
  // the THEN clause run on suspension/CONT — wrong semantics.  Test:
  // « IFERR HALT 1 THEN 999 ELSE 2 END »
  //   - Trap halts → CONT → trap pushes 1 → no caught error → ELSE
  //     runs → 2 pushed.  THEN's 999 must NEVER appear on the stack.
  s.push(Program([
    Name('IFERR'), Name('HALT'), Integer(1),
    Name('THEN'), Integer(999),
    Name('ELSE'), Integer(2),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null, 'session141: trap-HALT precondition');
  lookup('CONT').fn(s);
  assert(getHalted() === null, 'session141: trap-HALT CONT runs to end');
  assert(s.depth === 2, 'session141: trap-HALT yields trap residue + ELSE');
  assert(s.peek(1).value === 2n,
    'session141: ELSE clause ran (HALT was not mistaken for an error)');
  assert(s.peek(2).value === 1n,
    'session141: trap residue 1 preserved beneath ELSE result');
  // Belt-and-suspenders: 999 (THEN-clause sentinel) must NOT be on the stack.
  for (let lvl = 1; lvl <= s.depth; lvl++) {
    assert(s.peek(lvl).value !== 999n,
      `session141: THEN-clause sentinel 999 absent at level ${lvl}`);
  }
}

/* ================================================================
   HALT / CONT / KILL through nested `→` (compiled
   local environment) frames.

   Single-level `→` HALT is pinned by sessions 088 (HALT-inside-→
   suspends with locals on the stack and frame torn down on CONT)
   and the matching KILL pin.  But the nested-`→` case — outer `→`
   whose body opens an inner `→` whose body HALTs — was never
   pinned.  Two invariants matter:

     1.  At suspension `localFramesDepth() === 2` (both frames are
         live; the inner frame hasn't popped yet because its body's
         yield* never returned).
     2.  CONT drains the generator chain in inner-to-outer order;
         both `runArrow` finally blocks run; `localFramesDepth()
         === 0` afterwards.
     3.  KILL via `gen.return()` runs both finallys in LIFO (inner
         then outer); same end state.
     4.  resetHome closes the generator chain before clearing the
         home directory; same end state.
     5.  Inner-frame name shadows the outer at suspension time —
         the local visible during a HALT inside the inner body is
         the inner binding, not the outer.

   already pins outer/inner shadowing without HALT
   (the « 1 2 → a b « 10 20 → a b « a b » » » nesting test).  This
   block adds the HALT-aware variants.
   ================================================================ */

/* ---- Two-level nested → with HALT in the inner body suspends with
        both frames live; CONT drains both ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // 1 2 → a b « 10 20 → a b « a HALT b » »
  //   Outer pops 1,2; binds outer a=1, b=2.
  //   Inner pops 10,20; binds inner a=10, b=20 (shadowing outer).
  //   Inner body pushes a (→ 10), HALTs.  At suspension stack = [10],
  //   both frames live (depth 2), inner a=10 visible.
  //   CONT pushes b (→ 20).  Inner frame pops, outer frame pops.
  //   Final stack: [10, 20].
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n), Integer(20n),
      Name('→'), Name('a'), Name('b'),
      Program([ Name('a'), Name('HALT'), Name('b') ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested →: HALT in inner body suspends');
  assert(localFramesDepth() === 2,
    'session146: nested → HALT: both → frames live at suspension');
  assert(s.depth === 1 && s.peek().value === 10n,
    'session146: nested → HALT: inner a=10 visible at suspension (shadowing outer a=1)');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session146: nested → HALT: CONT drains the suspended generator chain');
  assert(s.depth === 2 && s.peek().value === 20n && s._items[0].value === 10n,
    'session146: nested → HALT: CONT pushes inner b=20 atop a=10');
  assert(localFramesDepth() === 0,
    'session146: nested → HALT: both frames torn down after CONT');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // Same shape as above but KILL instead of CONT.
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n), Integer(20n),
      Name('→'), Name('a'), Name('b'),
      Program([ Name('a'), Name('HALT'), Name('b') ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested → KILL: precondition halt');
  assert(localFramesDepth() === 2,
    'session146: nested → KILL: both frames live pre-KILL');
  lookup('KILL').fn(s);
  assert(haltedDepth() === 0,
    'session146: nested → KILL: halt slot cleared');
  assert(localFramesDepth() === 0,
    'session146: nested → KILL: both frames torn down via gen.return() finally chain');
}

/* ---- Nested → HALT BETWEEN inner-frame open/close — only outer
        frame live at suspension ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // 1 2 → a b « 10 20 → x y « x y + » HALT a »
  //   Outer pops 1,2; binds outer a=1, b=2.
  //   Inner-→ runs to completion, pushes 30 (10+20), pops its frame.
  //   HALT fires after the inner frame has been torn down.
  //   At suspension: stack = [30], localFramesDepth === 1 (only
  //   outer), outer a=1 still bound.
  //   CONT pushes outer a=1.  Final stack: [30, 1].
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n), Integer(20n),
      Name('→'), Name('x'), Name('y'),
      Program([ Name('x'), Name('y'), Name('+') ]),
      Name('HALT'),
      Name('a'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested → HALT-after-inner-pops: suspended');
  assert(localFramesDepth() === 1,
    'session146: nested → HALT-after-inner-pops: only outer frame live');
  assert(s.depth === 1 && s.peek().value === 30n,
    'session146: nested → HALT-after-inner-pops: 30 (10+20) on stack');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session146: nested → HALT-after-inner-pops: CONT drains');
  assert(s.depth === 2 && s.peek().value === 1n && s._items[0].value === 30n,
    'session146: nested → HALT-after-inner-pops: CONT pushes outer a=1');
  assert(localFramesDepth() === 0,
    'session146: nested → HALT-after-inner-pops: outer frame torn down on CONT');
}

/* ---- resetHome on a nested-→ HALT closes the generator chain
        and tears down both frames ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Integer(8n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(70n), Integer(80n),
      Name('→'), Name('a'), Name('b'),
      Program([ Name('a'), Name('HALT') ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested → resetHome: precondition halt');
  assert(localFramesDepth() === 2,
    'session146: nested → resetHome: both frames live pre-resetHome');
  resetHome();
  assert(haltedDepth() === 0,
    'session146: nested → resetHome: halt slot cleared');
  assert(localFramesDepth() === 0,
    'session146: nested → resetHome: both frames torn down via gen.return() finally chain');
}

/* ---- LIFO: two halts in sequence, second halt is inside an inner
        → frame, first halt is inside outer → frame.  CONT pops
        them in LIFO. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 → a « a HALT 2 → b « b HALT a b + » » »
  //   Step 1: Outer →: a=1.  Body pushes a (→1), HALTs.  At first
  //           suspension: stack = [1], one frame live (outer a=1).
  //   Step 2: CONT.  Push 2.  Inner →: b=2 (pops the 2).  Body
  //           pushes b (→2), HALTs.  At second suspension:
  //           stack = [1, 2], two frames live (outer a=1, inner b=2).
  //   Step 3: CONT.  Push a (→1), push b (→2), +→3.  Stack =
  //           [1, 2, 3].
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Name('a'), Name('HALT'),
      Integer(2n), Name('→'), Name('b'),
      Program([
        Name('b'), Name('HALT'),
        Name('a'), Name('b'), Name('+'),
      ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested → sequential HALT: first halt fires');
  assert(localFramesDepth() === 1,
    'session146: nested → sequential HALT: only outer frame live at first halt');
  assert(s.depth === 1 && s.peek().value === 1n,
    'session146: nested → sequential HALT: stack [1] at first halt');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 1,
    'session146: nested → sequential HALT: second halt fires after CONT');
  assert(localFramesDepth() === 2,
    'session146: nested → sequential HALT: both frames live at second halt');
  assert(s.depth === 2 && s.peek().value === 2n && s._items[0].value === 1n,
    'session146: nested → sequential HALT: stack [1,2] at second halt');
  lookup('CONT').fn(s);
  assert(haltedDepth() === 0,
    'session146: nested → sequential HALT: final CONT drains');
  assert(s.depth === 3 && s.peek().value === 3n,
    'session146: nested → sequential HALT: final stack [1,2,3] (a+b=3)');
  assert(localFramesDepth() === 0,
    'session146: nested → sequential HALT: both frames torn down at end');
}

/* ================================================================
   HALT/PROMPT lift through CASE clauses, fully-closed START (NEXT
   and STEP), and DO/UNTIL.

   runCase / runStart / runDo are generators, and
   `yield* evalRange(...)` for every clause / body / test means HALT
   and PROMPT lift mechanically through the chain.  Same property
   IFERR satisfies, applied to CASE, fully-closed START, and
   DO/UNTIL — HALT inside an explicit START NEXT body, an explicit
   START STEP body, an explicit DO UNTIL body, and inside an UNTIL
   test all suspend cleanly and resume on CONT.

   The interesting interactions:
     - CASE: each THEN-clause action is a separate `yield* evalRange`,
       and the no-match default clause is also a `yield* evalRange`.
       A HALT inside any of them must propagate cleanly, and after
       CONT the CASE must still short-circuit past the remaining
       clauses' END tokens (the post-clause `pending` / `nest`
       counter loop in runCase) so the program continues at the
       intended point — a HALT in the middle of a clause cannot
       reset the short-circuit bookkeeping.
     - DO/UNTIL: HALT inside the body suspends mid-iteration; CONT
       resumes the body, then the UNTIL test runs.  HALT inside the
       UNTIL test suspends after the body is complete; CONT runs
       the rest of the test, the loop continues if the test is
       false.
     - START STEP: the step is popped from the stack at the end of
       each iteration.  HALT inside the body suspends with the
       correct counter visible (mid-iteration); CONT resumes; the
       step is popped at the *end* of the resumed body, not at the
       suspension point.  HALT inside the computed step expression
       (e.g. a sub-program that pushes the step) suspends after the
       body is complete and before the step is consumed.
   ================================================================ */

/* ---- HALT in CASE clause action: clause runs, halts mid-action,
        CONT completes; later clauses are still skipped ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 5 CASE 1 THEN 10 HALT 11 END 1 THEN 999 END END »
  // First clause's test is 1 (true) → action runs (push 10), HALT,
  // CONT pushes 11, then runCase short-circuits past the second
  // clause's `999`.  Final stack ⟦5 10 11⟧.
  s.push(Program([
    Integer(5),
    Name('CASE'),
      Integer(1), Name('THEN'), Integer(10), Name('HALT'), Integer(11), Name('END'),
      Integer(1), Name('THEN'), Integer(999), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in CASE clause action suspends');
  assert(haltedDepth() === 1,
    'session151: HALT-in-CASE-action populates exactly one halted slot');
  assert(s.depth === 2 && s.peek().value === 10n && s._items[0].value === 5n,
    'session151: HALT-in-CASE-action sees pre-HALT clause residue (5,10)');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: CONT after HALT-in-CASE-action completes the program');
  assert(s.depth === 3 && s.peek().value === 11n && s._items[1].value === 10n && s._items[0].value === 5n,
    'session151: CONT-after-HALT short-circuits past later clauses (5,10,11)');
  assert(localFramesDepth() === 0,
    'session151: HALT-in-CASE-action leaves no local-frame leak');
}

/* ---- HALT in CASE clause test expression: test halts mid-expr,
        CONT resumes the test, then the matching action runs ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « CASE 1 HALT THEN 7 END 1 THEN 999 END END »
  // First clause's test pushes 1, HALTs.  CONT resumes the test
  // (already complete — the 1 is the test).  test=1 is truthy →
  // first clause's action runs (push 7).  Second clause skipped.
  // Final stack ⟦7⟧.
  s.push(Program([
    Name('CASE'),
      Integer(1), Name('HALT'), Name('THEN'), Integer(7), Name('END'),
      Integer(1), Name('THEN'), Integer(999), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in CASE test expression suspends');
  // The test pushed 1 before HALT; that 1 is still on the stack at
  // suspension — the test isn't consumed until after the test
  // expression range completes.
  assert(s.depth === 1 && s.peek().value === 1n,
    'session151: HALT-in-CASE-test sees pushed test value (1) on stack');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: CONT after HALT-in-CASE-test completes the program');
  assert(s.depth === 1 && s.peek().value === 7n,
    'session151: CONT-after-HALT-in-test runs the matched clause action (7)');
}

/* ---- HALT in CASE default clause: tests all false, default runs,
        HALTs, CONT completes the default ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « CASE 0 THEN 999 END HALT 42 END »
  // First test 0 → false; default clause is `HALT 42`.  HALT
  // suspends; CONT pushes 42.  Final stack ⟦42⟧.
  s.push(Program([
    Name('CASE'),
      Integer(0), Name('THEN'), Integer(999), Name('END'),
      Name('HALT'), Integer(42),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in CASE default clause suspends');
  assert(s.depth === 0,
    'session151: HALT-in-CASE-default with empty pre-CASE stack stays empty');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: CONT after HALT-in-CASE-default completes the program');
  assert(s.depth === 1 && s.peek().value === 42n,
    'session151: HALT-in-CASE-default CONT pushes the post-HALT 42');
}

/* ---- HALT inside auto-closed CASE (no outer END): default clause
        is the auto-closed tail ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « CASE 0 THEN 999 END HALT 7 »  — no outer END
  // First test 0 → false.  Auto-close: default clause is `HALT 7`.
  // HALT suspends; CONT pushes 7.
  s.push(Program([
    Name('CASE'),
      Integer(0), Name('THEN'), Integer(999), Name('END'),
      Name('HALT'), Integer(7),
    // no outer END — auto-closed
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in auto-closed CASE default suspends');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: CONT after HALT-in-auto-closed-CASE completes');
  assert(s.depth === 1 && s.peek().value === 7n,
    'session151: auto-closed CASE default ran post-HALT 7');
}

/* ---- PROMPT inside a CASE clause action sets the banner mid-
        clause; CONT clears it and finishes the clause ---- */
{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // « CASE 1 THEN "msg" PROMPT 8 END END »
  // First clause's test is 1 → action runs.  PROMPT pops "msg",
  // sets the banner, halts.  CONT clears the banner and pushes 8.
  s.push(Program([
    Name('CASE'),
      Integer(1), Name('THEN'), Str('msg'), Name('PROMPT'), Integer(8), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: PROMPT in CASE action suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'msg',
    'session151: PROMPT-in-CASE-action sets the banner mid-clause');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session151: CONT clears the prompt banner after PROMPT-in-CASE-action');
  assert(getHalted() === null,
    'session151: CONT after PROMPT-in-CASE-action completes the program');
  assert(s.depth === 1 && s.peek().value === 8n,
    'session151: CONT after PROMPT-in-CASE pushes the post-PROMPT 8');
}

/* ---- KILL of halted CASE: generator chain torn down via gen.return(),
        no local-frame leak ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « CASE 1 THEN HALT 9 END END »
  // First clause action: HALT then 9.  KILL drops the halt slot
  // and gen.return()'s the chain.  Stack must be in pre-EVAL state
  // (the EVAL handler rolls back to its snapshot — the 9 never
  // gets pushed).
  s.push(Program([
    Name('CASE'),
      Integer(1), Name('THEN'), Name('HALT'), Integer(9), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in CASE clause suspends before KILL');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session151: KILL clears the halt slot for halted CASE');
  assert(localFramesDepth() === 0,
    'session151: KILL of halted CASE leaves no local-frame leak');
}

/* ---- Sentinel: yield is not a thrown exception, so a HALT in a
        CASE clause action must not be caught by anything CASE-internal.
        The CASE machinery has no catch, but this test pins the
        invariant so a future refactor can't introduce one. ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « CASE 1 THEN HALT 1 END 1 THEN 99 END END »
  // First clause matches; HALT in action; CONT pushes 1.  The
  // second clause's `99` must NOT appear on the stack — short-
  // circuit must hold across HALT/CONT.
  s.push(Program([
    Name('CASE'),
      Integer(1), Name('THEN'), Name('HALT'), Integer(1), Name('END'),
      Integer(1), Name('THEN'), Integer(99), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null, 'session151: HALT in CASE first-clause action');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 1n,
    'session151: CASE short-circuit holds across HALT/CONT — 99 not on stack');
}

/* ----------------------------------------------------------------
   DO/UNTIL/END HALT lift
   ---------------------------------------------------------------- */

/* ---- HALT inside DO body: body halts mid-iteration; CONT resumes;
        UNTIL test runs and loop terminates ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 0 DO 1 + HALT UNTIL DUP 2 ≥ END »
  // Iter 1: push 1, +→1, HALT.  CONT: UNTIL test runs: DUP→1, 1≥2 false.
  //   Loop continues.  Iter 2: push 1, +→2, HALT.  CONT: DUP→2, 2≥2
  //   true → loop exits.  Final stack ⟦2⟧.
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'), Name('HALT'),
    Name('UNTIL'),
      Name('DUP'), Integer(2), Name('≥'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in DO body suspends iter 1');
  assert(s.depth === 1 && s.peek().value === 1n,
    'session151: HALT in DO body iter 1 sees mid-iteration counter (1)');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in DO body suspends iter 2');
  assert(s.depth === 1 && s.peek().value === 2n,
    'session151: HALT in DO body iter 2 sees counter (2)');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: DO/UNTIL completes after iter-2 HALT/CONT');
  assert(s.depth === 1 && s.peek().value === 2n,
    'session151: DO/UNTIL final stack 2 (UNTIL test exited at counter=2)');
}

/* ---- HALT inside UNTIL test expression: test halts mid-expression,
        CONT resumes the test ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 0 DO 1 + UNTIL DUP HALT 3 ≥ END »
  // Iter 1: body pushes 1, +→1.  UNTIL test: DUP→1, HALT.  CONT
  // resumes: push 3, 1≥3 false → loop continues.  Iter 2 body:
  // push 1, +→2.  UNTIL: DUP→2, HALT.  CONT: push 3, 2≥3 false.
  // Iter 3 body: push 1, +→3.  UNTIL: DUP→3, HALT.  CONT: push 3,
  // 3≥3 true → loop exits.  Final stack ⟦3⟧.
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'),
    Name('UNTIL'),
      Name('DUP'), Name('HALT'), Integer(3), Name('≥'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in UNTIL test suspends iter 1');
  // Stack at suspension: [counter=1, dup=1] (DUP ran before HALT).
  assert(s.depth === 2 && s.peek().value === 1n && s._items[0].value === 1n,
    'session151: HALT in UNTIL test sees DUP residue + counter');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in UNTIL test suspends iter 2 (test ran false → loop continued)');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in UNTIL test suspends iter 3');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: DO/UNTIL completes after iter-3 UNTIL-test HALT/CONT');
  assert(s.depth === 1 && s.peek().value === 3n,
    'session151: DO/UNTIL final counter 3 (UNTIL test exited at counter=3)');
}

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 0 DO HALT 1 + UNTIL 0 END »  — UNTIL test is 0 (always false),
  // so without KILL this would be an infinite loop after CONT.
  s.push(Program([
    Integer(0),
    Name('DO'), Name('HALT'), Integer(1), Name('+'),
    Name('UNTIL'), Integer(0),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null, 'session151: HALT in DO body suspends');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session151: KILL of halted DO clears the slot');
  assert(localFramesDepth() === 0,
    'session151: KILL of halted DO leaves no local-frame leak');
}

/* ---- PROMPT inside DO body sets banner; CONT clears it; loop
        terminates ---- */
{
  resetHome(); clearAllHalted(); clearPromptMessage();
  const s = new Stack();
  // « 0 DO 1 + "doing" PROMPT UNTIL DUP 1 ≥ END »
  // Iter 1: 0+1=1, PROMPT pops "doing", halts.  CONT clears banner,
  // UNTIL: DUP→1, 1≥1 true → loop exits.  Final stack ⟦1⟧.
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'), Str('doing'), Name('PROMPT'),
    Name('UNTIL'),
      Name('DUP'), Integer(1), Name('≥'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: PROMPT in DO body suspends');
  const msg = getPromptMessage();
  assert(msg && msg.type === 'string' && msg.value === 'doing',
    'session151: PROMPT-in-DO-body sets banner');
  lookup('CONT').fn(s);
  assert(getPromptMessage() === null,
    'session151: CONT clears prompt banner after PROMPT-in-DO');
  assert(getHalted() === null,
    'session151: DO/UNTIL completes after PROMPT/CONT (UNTIL true on iter 1)');
  assert(s.depth === 1 && s.peek().value === 1n,
    'session151: PROMPT-in-DO final stack 1');
}

/* ----------------------------------------------------------------
   Fully-closed START/NEXT and START/STEP HALT lift —
   pins the explicit-closer forms that runStart routes through
   closerIdx (the auto-closed forms have their own pins above).
   ---------------------------------------------------------------- */

{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 3 START HALT 7 NEXT »  — explicit NEXT
  // Three iterations; HALT in each, CONT pushes 7.
  s.push(Program([
    Integer(1), Integer(3), Name('START'),
      Name('HALT'), Integer(7),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in fully-closed START/NEXT body iter 1');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in fully-closed START/NEXT body iter 2');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in fully-closed START/NEXT body iter 3');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: fully-closed START/NEXT completes after 3 CONTs');
  assert(s.depth === 3 && s.peek().value === 7n
      && s._items[0].value === 7n && s._items[1].value === 7n,
    'session151: fully-closed START/NEXT leaves three 7s on stack');
}

/* ---- HALT inside fully-closed START/STEP body: halts mid-iter,
        STEP value popped after CONT resumes the body ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 5 START HALT 100 2 STEP »
  // counter=1, body: HALT, push 100, STEP pops 2 → counter=3.  Body
  // again: HALT, push 100, STEP pops 2 → counter=5.  Body again:
  // HALT, push 100, STEP pops 2 → counter=7.  7 > 5 → loop ends.
  // Final stack ⟦100 100 100⟧.
  s.push(Program([
    Integer(1), Integer(5), Name('START'),
      Name('HALT'), Integer(100), Integer(2),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in START/STEP body iter 1');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in START/STEP body iter 2');
  lookup('CONT').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in START/STEP body iter 3');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: fully-closed START/STEP completes after 3 CONTs');
  assert(s.depth === 3
      && s.peek().value === 100n
      && s._items[0].value === 100n
      && s._items[1].value === 100n,
    'session151: START/STEP final stack [100,100,100] (3 iters at step=2)');
}

/* ---- HALT inside fully-closed FOR/STEP body: halts mid-iter,
        loop var visible to varRecall ---- */
{
  resetHome(); clearAllHalted();
  const s = new Stack();
  // « 1 4 FOR i i HALT 1 STEP »  — counter increments by explicit STEP=1.
  // Iter 1: i=1, push 1, HALT.  CONT pops STEP (1) → i=2.  Iter 2…
  s.push(Program([
    Integer(1), Integer(4), Name('FOR'), Name('i'),
      Name('i'), Name('HALT'), Integer(1),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in fully-closed FOR/STEP body iter 1');
  // Loop var i is visible at suspension.
  assert(varRecall('i')?.value === 1n,
    'session151: FOR loop var i=1 visible at iter 1 HALT');
  assert(s.depth === 1 && s.peek().value === 1n,
    'session151: FOR/STEP iter 1 stack: i pushed (1)');
  lookup('CONT').fn(s);
  assert(varRecall('i')?.value === 2n,
    'session151: FOR loop var i=2 visible at iter 2 HALT');
  lookup('CONT').fn(s);
  assert(varRecall('i')?.value === 3n,
    'session151: FOR loop var i=3 visible at iter 3 HALT');
  lookup('CONT').fn(s);
  assert(varRecall('i')?.value === 4n,
    'session151: FOR loop var i=4 visible at iter 4 HALT');
  lookup('CONT').fn(s);
  assert(getHalted() === null,
    'session151: fully-closed FOR/STEP completes after 4 CONTs');
  assert(varRecall('i') === undefined,
    'session151: FOR/STEP finally purged i after completion (no prior binding)');
  assert(s.depth === 4 && s.peek().value === 4n,
    'session151: FOR/STEP final stack [1,2,3,4]');
}

{
  resetHome(); clearAllHalted();
  // Establish a prior binding for i so we can verify save/restore.
  varStore('i', Integer(99n));
  const s = new Stack();
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('i'),
      Name('i'), Name('HALT'), Integer(1),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(getHalted() !== null,
    'session151: HALT in FOR/STEP iter 1 before KILL');
  assert(varRecall('i')?.value === 1n,
    'session151: FOR/STEP loop var i shadows prior binding (1, not 99)');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session151: KILL of halted FOR/STEP clears the halt slot');
  assert(varRecall('i')?.value === 99n,
    'session151: KILL of halted FOR/STEP runs the finally — restores prior i=99');
  assert(localFramesDepth() === 0,
    'session151: KILL of halted FOR/STEP leaves no local-frame leak');
  varPurge('i');
}
