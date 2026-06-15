import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
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
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* Variables — STO / RCL / PURGE / VARS + directory nav (CRDIR / UPDIR / HOME /
   PATH) + subdir protection + variable/directory state UNDO. */

/* ================================================================
   Directory + variables — STO / RCL / PURGE / VARS
   Each test resets HOME so they're order-independent.
   ================================================================ */

// Directory constructor + predicate
{
  const d = Directory({ name: 'HOME' });
  assert(isDirectory(d), 'Directory() produces a directory value');
  assert(d.name === 'HOME' && d.entries.size === 0, 'empty HOME directory');
}

// state.home exists and is current dir at startup
{
  resetHome();
  assert(isDirectory(calcState.home), 'calcState.home is a Directory');
  assert(calcState.current === calcState.home, 'current defaults to HOME');
  assert(currentPath().join(' ') === 'HOME', 'path is {HOME} at start');
}

// varStore / varRecall
{
  resetHome();
  varStore('X', Real(3.14));
  const v = varRecall('X');
  assert(isReal(v) && v.value.eq(3.14), 'varStore then varRecall round-trip');
  assert(varRecall('Y') === undefined, 'varRecall absent returns undefined');
}

// STO with Name on level 1 writes into HOME
{
  resetHome();
  const s = new Stack();
  s.push(Real(42));              // level 2
  s.push(Name('A'));              // level 1
  lookup('STO').fn(s);
  assert(s.depth === 0, 'STO consumes both operands');
  const v = varRecall('A');
  assert(isReal(v) && v.value.eq(42), 'STO wrote 42 into A');
}

// STO also accepts a String on level 1 (HP50 allows it)
{
  resetHome();
  const s = new Stack();
  s.push(Integer(7));
  s.push(Str('B'));
  lookup('STO').fn(s);
  const v = varRecall('B');
  assert(v && v.value === 7n, 'STO with String name wrote Integer(7) into B');
}

// STO of unsupported level-1 type throws
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(2));                    // level 1 is a number, not a name
  assertThrows(() => lookup('STO').fn(s), null, 'STO rejects non-name on level 1');
}

// RCL pushes the stored value
{
  resetHome();
  varStore('PI', Real(Math.PI));
  const s = new Stack();
  s.push(Name('PI'));
  lookup('RCL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && Math.abs(s.peek().value - Math.PI) < 1e-15,
         'RCL pushes PI value');
}

// RCL on undefined throws
{
  resetHome();
  const s = new Stack();
  s.push(Name('NOPE'));
  assertThrows(() => lookup('RCL').fn(s), null, 'RCL on undefined name throws');
}

// STO with a list of names stores the same value in each (HP50 AUR).
{
  resetHome();
  const s = new Stack();
  s.push(Real(9));                              // level 2 = value
  s.push(RList([Name('A'), Name('B'), Name('C')]));  // level 1 = list
  lookup('STO').fn(s);
  assert(s.depth === 0, 'STO-list consumes both operands');
  assert(varRecall('A').value.eq(9) && varRecall('B').value.eq(9)
      && varRecall('C').value.eq(9),
    'STO-list stored 9 into A, B, and C');
}

// RCL with a list of names pushes each value in order.
{
  resetHome();
  varStore('A', Real(1));
  varStore('B', Real(2));
  varStore('C', Real(3));
  const s = new Stack();
  s.push(RList([Name('A'), Name('B'), Name('C')]));
  lookup('RCL').fn(s);
  assert(s.depth === 3,
    `RCL-list pushes one value per name, got depth=${s.depth}`);
  assert(s.peek(3).value.eq(1) && s.peek(2).value.eq(2) && s.peek(1).value.eq(3),
    'RCL-list preserves list order (A, B, C → 1, 2, 3 bottom-to-top)');
}

// RCL on a list with a missing name throws; earlier pushes stay on
// the stack (non-transactional, matching PURGE-list).
{
  resetHome();
  varStore('P', Real(10));
  const s = new Stack();
  s.push(RList([Name('P'), Name('MISSING')]));
  assertThrows(() => lookup('RCL').fn(s), null, 'RCL with missing name in list throws');
  assert(s.depth === 1 && s.peek().value.eq(10),
    'earlier RCL push survived the throw');
}

// PURGE removes the binding
{
  resetHome();
  varStore('TMP', Real(1));
  assert(varRecall('TMP') !== undefined, 'TMP exists before purge');
  const s = new Stack();
  s.push(Name('TMP'));
  lookup('PURGE').fn(s);
  assert(varRecall('TMP') === undefined, 'PURGE removed TMP');
  // PURGE of a missing name errors
  s.push(Name('ALSO_MISSING'));
  assertThrows(() => lookup('PURGE').fn(s), null, 'PURGE of missing name throws');
}

// PURGE of a list purges each name in order (HP50 AUR §2.8), matching
// the shape CRDIR already accepts.
{
  resetHome();
  varStore('A', Real(1));
  varStore('B', Real(2));
  varStore('C', Real(3));
  const s = new Stack();
  s.push(RList([Name('A'), Name('B'), Name('C')]));
  lookup('PURGE').fn(s);
  assert(varRecall('A') === undefined
      && varRecall('B') === undefined
      && varRecall('C') === undefined,
    'PURGE { A B C } purges all three');
  assert(s.depth === 0, 'PURGE on list leaves stack empty');
}

// PURGE of a list partially commits: if one element fails, earlier
// purges stand (non-transactional, matching CRDIR).
{
  resetHome();
  varStore('P', Real(1));
  varStore('Q', Real(2));
  // list is { P MISSING Q } — P purges, MISSING throws, Q stays bound
  const s = new Stack();
  s.push(RList([Name('P'), Name('MISSING'), Name('Q')]));
  assertThrows(() => lookup('PURGE').fn(s), null, 'PURGE with missing name in list throws');
  assert(varRecall('P') === undefined, 'earlier P was purged before the throw');
  assert(varRecall('Q') !== undefined, 'later Q remains bound after the throw');
}

// PURGE also accepts strings inside the list (matches Name/String
// coercion used by STO/RCL/CRDIR).
{
  resetHome();
  varStore('SA', Real(1));
  varStore('SB', Real(2));
  const s = new Stack();
  s.push(RList([Str('SA'), Str('SB')]));
  lookup('PURGE').fn(s);
  assert(varRecall('SA') === undefined && varRecall('SB') === undefined,
    'PURGE { "SA" "SB" } purges both');
}

// VARS pushes a list of Names from the current directory, with the
// most-recently-stored / -ORDERed name FIRST.  Matches the left-to-
// right order of the soft-menu bank on a physical HP50 (AUR §2.8).
{
  resetHome();
  varStore('Z', Real(1));
  varStore('A', Real(2));
  varStore('M', Real(3));
  const s = new Stack();
  lookup('VARS').fn(s);
  const list = s.peek();
  assert(list && list.type === 'list', 'VARS pushes a list');
  const ids = list.items.map(n => n.id);
  assert(ids.join(',') === 'M,A,Z',
    'VARS returns names newest-first (reverse insertion order)');
}

// Round-trip via parser: `42 'X' STO X RCL` should yield 42
{
  resetHome();
  const s = new Stack();
  // Simulate what the entry loop does for "42 `X` STO"
  const v1 = parseEntry("42 `X` STO");
  for (const v of v1) {
    if (v?.type === 'name') {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(varRecall('X')?.value === 42n,
         "round-trip: 42 `X` STO wrote Integer(42)");
  // Now recall by pushing Name('X') then RCL
  const v2 = parseEntry("`X` RCL");
  for (const v of v2) {
    if (v?.type === 'name') {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek()?.value === 42n, "round-trip: `X` RCL put 42 on stack");
  resetHome();
}

// Directory formatter output
{
  const d = Directory({ name: 'HOME' });
  assert(format(d) === 'Directory { HOME }', 'format(Directory) readable');
}


/* ================================================================
   Directory navigation — CRDIR / UPDIR / HOME / PATH + state helpers
   ================================================================ */

// State helpers: goHome / goUp / makeSubdir / goInto
{
  resetHome();
  assert(currentPath().join('/') === 'HOME', 'navigation: start at HOME');
  const a = makeSubdir('A');
  assert(isDirectory(a) && a.name === 'A', 'makeSubdir returns Directory');
  assert(a.parent === calcState.home, 'new subdir.parent === HOME');
  assert(currentPath().join('/') === 'HOME',
         'makeSubdir does not cd into the new dir');
  assert(goInto('A') === true, 'goInto("A") succeeds');
  assert(currentPath().join('/') === 'HOME/A', 'after goInto: path is HOME/A');
  goUp();
  assert(currentPath().join('/') === 'HOME', 'goUp returns to HOME');
  goUp();
  assert(currentPath().join('/') === 'HOME',
         'goUp at HOME is a silent no-op');
  goInto('A'); goHome();
  assert(currentPath().join('/') === 'HOME', 'goHome snaps back to root');
  resetHome();
}

// goInto: invalid targets
{
  resetHome();
  assert(goInto('NOPE') === false, 'goInto missing name returns false');
  varStore('N', Real(7));
  assert(goInto('N') === false,
         'goInto a non-Directory value returns false (no cd into a Real)');
  assert(currentPath().join('/') === 'HOME',
         'current dir unchanged after failed goInto');
  resetHome();
}

// makeSubdir: name collision throws
{
  resetHome();
  varStore('DUP', Real(1));
  assertThrows(() => makeSubdir('DUP'), null, 'makeSubdir throws on name collision with existing var');
  makeSubdir('NEW');
  assertThrows(() => makeSubdir('NEW'), null, 'makeSubdir throws on name collision with existing subdir');
  resetHome();
}

// CRDIR op: accepts a Name
{
  resetHome();
  const s = new Stack();
  s.push(Name('A', { quoted: true }));
  lookup('CRDIR').fn(s);
  assert(s.depth === 0, 'CRDIR consumes its name argument');
  const names = varList();
  assert(names.length === 1 && names[0] === 'A',
         'CRDIR created "A" in current dir');
  const sub = varRecall('A');
  assert(isDirectory(sub) && sub.name === 'A',
         'CRDIR stored a Directory at that name');
  assert(currentPath().join('/') === 'HOME',
         'CRDIR does not descend into the new dir');
  resetHome();
}

// CRDIR op: accepts a String
{
  resetHome();
  const s = new Stack();
  s.push(Str('B'));
  lookup('CRDIR').fn(s);
  assert(isDirectory(varRecall('B')), 'CRDIR accepts a String name');
  resetHome();
}

// CRDIR op: accepts a List of names (batch)
{
  resetHome();
  const s = new Stack();
  s.push(RList([Name('X', { quoted: true }), Name('Y', { quoted: true }), Str('Z')]));
  lookup('CRDIR').fn(s);
  assert(s.depth === 0, 'CRDIR(list) consumes the list');
  const names = varList();
  assert(names.join(',') === 'X,Y,Z',
         'CRDIR(list) creates all three subdirs');
  resetHome();
}

// CRDIR op: collision throws a trappable RPLError
{
  resetHome();
  varStore('CONF', Real(1));
  const s = new Stack();
  s.push(Name('CONF', { quoted: true }));
  assertThrows(() => lookup('CRDIR').fn(s), /Name conflict/,
         'CRDIR collision throws with informative message');
  resetHome();
}

// HOME op: cd to root from a subdir
{
  resetHome();
  makeSubdir('AFOO');
  goInto('AFOO');
  assert(currentPath().join('/') === 'HOME/AFOO', 'setup: inside AFOO');
  const s = new Stack();
  lookup('HOME').fn(s);
  assert(currentPath().join('/') === 'HOME', 'HOME op returns to root');
  assert(s.depth === 0, 'HOME op leaves stack untouched');
  resetHome();
}

// UPDIR op: cd to parent; no-op at HOME
{
  resetHome();
  makeSubdir('P');
  goInto('P');
  makeSubdir('C');
  goInto('C');
  assert(currentPath().join('/') === 'HOME/P/C', 'setup: inside HOME/P/C');
  const s = new Stack();
  lookup('UPDIR').fn(s);
  assert(currentPath().join('/') === 'HOME/P', 'UPDIR moves up one level');
  lookup('UPDIR').fn(s);
  assert(currentPath().join('/') === 'HOME', 'UPDIR continues up to HOME');
  lookup('UPDIR').fn(s);
  assert(currentPath().join('/') === 'HOME',
         'UPDIR at HOME is a silent no-op');
  assert(s.depth === 0, 'UPDIR leaves stack untouched');
  resetHome();
}

// PATH op: pushes a list of names from HOME down
{
  resetHome();
  const s = new Stack();
  lookup('PATH').fn(s);
  let p = s.pop();
  assert(p && p.type === 'list' && p.items.length === 1 &&
         p.items[0].id === 'HOME',
         'PATH at root returns { HOME }');
  makeSubdir('A');
  goInto('A');
  makeSubdir('B');
  goInto('B');
  lookup('PATH').fn(s);
  p = s.pop();
  const ids = p.items.map(n => n.id).join(' ');
  assert(ids === 'HOME A B', 'PATH two levels deep returns { HOME A B }');
  resetHome();
}

// RCL walks up the parent chain (classic HP50 scoping)
{
  resetHome();
  varStore('GLOBAL', Real(100));
  makeSubdir('AFOO');
  goInto('AFOO');
  varStore('LOCAL', Real(1));
  const s = new Stack();
  s.push(Name('GLOBAL', { quoted: true }));
  lookup('RCL').fn(s);
  assert(s.peek()?.value.eq(100),
         'RCL inside AFOO walks up and finds GLOBAL at HOME');
  s.drop();
  s.push(Name('LOCAL', { quoted: true }));
  lookup('RCL').fn(s);
  assert(s.peek()?.value.eq(1), 'RCL finds LOCAL in the current dir');
  resetHome();
}

// STO writes to the current dir only (shadowing a parent's name)
{
  resetHome();
  varStore('X', Real(1));
  makeSubdir('AFOO');
  goInto('AFOO');
  varStore('X', Real(99));
  assert(varRecall('X')?.value.eq(99), 'AFOO.X shadows HOME.X');
  goUp();
  assert(varRecall('X')?.value.eq(1), 'HOME.X is unchanged by AFOO.X write');
  resetHome();
}

// PURGE is current-dir-only (does NOT cascade up the parent chain)
{
  resetHome();
  varStore('OUTER', Real(1));
  makeSubdir('AFOO');
  goInto('AFOO');
  let threw = false;
  try { varPurge('OUTER'); } catch { threw = true; }
  // varPurge returns false; it doesn't throw.  But the wrapper op PURGE
  // reports "Undefined name: OUTER" because the var doesn't live in the
  // current dir — PURGE should refuse to reach up.
  const s = new Stack();
  s.push(Name('OUTER', { quoted: true }));
  assertThrows(() => lookup('PURGE').fn(s), null,
               'PURGE in AFOO does not remove HOME.OUTER — errors');
  assert(varRecall('OUTER')?.value.eq(1),
         'HOME.OUTER survived the failed PURGE from AFOO');
  resetHome();
}

// End-to-end parser round-trip: << 'A' CRDIR A HOME PATH >>
{
  resetHome();
  const s = new Stack();
  const toks = parseEntry("`A` CRDIR");
  for (const v of toks) {
    if (v?.type === 'name') {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(isDirectory(varRecall('A')), 'parser: CRDIR round-trip created A');
  // Now descend into A using the RPL "bare name of a subdir" idiom — we
  // expose goInto directly via the state helper, since HP50 descends on
  // a VARS soft-key press and not via a bare op.
  goInto('A');
  assert(currentPath().join('/') === 'HOME/A',
         'parser: descended into A via goInto');
  // PATH should now yield { HOME A }
  lookup('PATH').fn(s);
  const p = s.peek();
  assert(p.items.map(n => n.id).join(' ') === 'HOME A',
         "parser: PATH after descent yields { HOME A }");
  s.drop();
  // HOME op returns to root
  lookup('HOME').fn(s);
  assert(currentPath().join('/') === 'HOME', 'parser: HOME op cd back');
  resetHome();
}

// resetHome clears subdirectory state AND snaps current back to HOME
{
  resetHome();
  makeSubdir('X');
  goInto('X');
  assert(currentPath().join('/') === 'HOME/X',
         'pre-reset: current is HOME/X');
  resetHome();
  assert(currentPath().join('/') === 'HOME',
         'resetHome: current snapped back to HOME');
  assert(varList().length === 0, 'resetHome: HOME entries cleared');
}

// IFERR traps a CRDIR collision
{
  resetHome();
  varStore('C', Real(1));
  const s = new Stack();
  // << 'C' IFERR CRDIR THEN ERRM ELSE "ok" END >>
  const prog = Program([
    Name('C', { quoted: true }),
    Name('IFERR'),
    Name('CRDIR'),
    Name('THEN'),
    Name('ERRM'),
    Name('ELSE'),
    Str('ok'),
    Name('END'),
  ]);
  s.push(prog);
  lookup('EVAL').fn(s);
  assert(s.peek()?.type === 'string' && /conflict/i.test(s.peek().value),
         'IFERR catches CRDIR collision and ERRM reports it');
  resetHome();
}

/* ----------------------------------------------------------------
   VARS soft-key descent flow.

   We can't import src/app.js in Node — it touches document / window.
   But the decision tree inside showVarsMenu's onPress handler is
   ten lines of pure logic.  Replicate it here and drive it against
   the real state helpers to confirm the end-to-end chain behaves
   exactly as the UI expects: Directory → goInto(id), Program →
   EVAL on the stack, otherwise → push literally.
   ---------------------------------------------------------------- */
{
  // Stand-in for app.js::showVarsMenu.onPress(id).
  // Returns a tag string so assertions can see which branch fired.
  function varsPress(id, stack) {
    const v = varRecall(id);
    if (v === undefined) return 'undefined';
    if (isDirectory(v)) {
      const ok = goInto(id);
      return ok ? 'descended' : 'cannot-descend';
    }
    if (isProgram(v)) {
      stack.push(v);
      lookup('EVAL').fn(stack);
      return 'evaled';
    }
    stack.push(v);
    return 'pushed';
  }

  // Directory branch: press on a subdir descends.
  resetHome();
  makeSubdir('AFOO');
  const s = new Stack();
  assert(s.depth === 0, 'VARS descent: stack starts empty');
  const tag = varsPress('AFOO', s);
  assert(tag === 'descended',
         'VARS soft-key on Directory → goInto (not push)');
  assert(currentPath().join('/') === 'HOME/AFOO',
         'VARS descent: current is now HOME/AFOO');
  assert(s.depth === 0,
         'VARS descent: Directory value NOT pushed onto stack');
  resetHome();
}

// Program branch still EVALs (regression guard for the directory change)
{
  resetHome();
  // << 2 3 + >>   — leaves 5 on the stack when EVAL'd
  varStore('PLUS5', Program([Real(2), Real(3), Name('+')]));
  const s = new Stack();
  const v = varRecall('PLUS5');
  assert(isProgram(v), 'PLUS5 is a Program');
  s.push(v);
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek()?.value.eq(5),
         'VARS press on Program still EVALs (2 3 + = 5)');
  resetHome();
}

// Non-Program, non-Directory branch still pushes literally
{
  resetHome();
  varStore('N', Real(42));
  const s = new Stack();
  const v = varRecall('N');
  assert(!isProgram(v) && !isDirectory(v),
         'N is neither Program nor Directory');
  s.push(v);
  assert(s.depth === 1 && s.peek()?.value.eq(42),
         'VARS press on Real pushes literally');
  resetHome();
}

// Program-with-error rolls the stack back so the program does NOT
// remain on the stack after a failed soft-key press.  This pins the
// ship-prep-2026-04-25-r2 fix to showVarsMenu's onPress handler:
// the push and EVAL share one safeRun snapshot, so a thrown error
// during EVAL restores the pre-push state.  The stand-in mirrors the
// real handler's body and applies the same save/restore pattern.
{
  resetHome();
  // « DUP » wants one item on the stack; with an empty stack it
  // throws "Too few arguments".  Cheap, deterministic error path.
  varStore('NEEDARG', Program([Name('DUP')]));
  const s = new Stack();
  const v = varRecall('NEEDARG');
  assert(isProgram(v), 'NEEDARG is a Program');
  // Stand-in for showVarsMenu.onPress program branch under the new
  // wrapper.  safeRun's contract is `save() → body → on-throw
  // restore()`.
  const snap = s.save();
  let threw = false;
  try {
    s.push(v);
    lookup('EVAL').fn(s);
  } catch (_e) {
    threw = true;
    s.restore(snap);
  }
  assert(threw,
         'VARS soft-key on a Program with a runtime error throws');
  assert(s.depth === 0,
         'VARS soft-key error: pushed Program is removed from stack');
  resetHome();
}

// After descent the new current dir has its own var list
{
  resetHome();
  makeSubdir('OUTER');
  goInto('OUTER');
  varStore('INNER', Real(7));
  makeSubdir('DEEP');
  goHome();                           // back to HOME for the press
  assert(currentPath().join('/') === 'HOME', 'setup: back at HOME');
  const names = varList();
  assert(names.includes('OUTER') && names.length === 1,
         'HOME lists only OUTER (the subdir)');
  // Simulate the descent.
  const s = new Stack();
  const v = varRecall('OUTER');
  assert(isDirectory(v), 'varRecall(OUTER) is a Directory');
  const ok = goInto('OUTER');
  assert(ok, 'goInto(OUTER) succeeded');
  // Now the VARS menu would rebuild from varList() on the new current.
  const innerNames = varList().sort();
  assert(innerNames.join(',') === 'DEEP,INNER',
         'after descent: varList() reflects OUTER contents, not HOME');
  // And RCL still walks up the parent chain: a name from HOME is
  // still visible from inside OUTER even if it's not in varList().
  varPurge('DEEP');
  assert(s.depth === 0, 'VARS after-descent sanity: stack still empty');
  resetHome();
}


// STO refuses to overwrite a subdirectory with a scalar.
{
  resetHome();
  clearLastError();
  makeSubdir('AFOO');
  const s = new Stack();
  s.push(Real(42));
  s.push(Name('AFOO', { quoted: true }));
  const stoErr = assertThrows(() => lookup('STO').fn(s), null, 'STO over subdir: throws');
  assert(stoErr && /Directory not allowed/.test(stoErr.message),
         'STO over subdir: message is "Directory not allowed"');
  // And the Directory is preserved.
  const still = varRecall('AFOO');
  assert(isDirectory(still),
         'STO over subdir: subdir not clobbered on failed STO');
  resetHome();
}

// STO over an ordinary (non-Directory) variable still works.
{
  resetHome();
  varStore('N', Real(1));
  const s = new Stack();
  s.push(Real(2));
  s.push(Name('N', { quoted: true }));
  lookup('STO').fn(s);
  const n2 = varRecall('N');
  assert(isReal(n2) && n2.value.eq(2),
         'STO over ordinary var still overwrites (regression guard)');
  resetHome();
}

// PURGE refuses to remove a non-empty subdirectory.
{
  resetHome();
  makeSubdir('AFOO');
  goInto('AFOO');
  varStore('X', Real(1));
  goHome();
  const s = new Stack();
  s.push(Name('AFOO', { quoted: true }));
  const purgeErr = assertThrows(() => lookup('PURGE').fn(s), null, 'PURGE non-empty subdir: throws');
  assert(purgeErr && /Directory not empty/.test(purgeErr.message),
         'PURGE non-empty subdir: message is "Directory not empty"');
  assert(isDirectory(varRecall('AFOO')),
         'PURGE non-empty subdir: subdir not removed');
  resetHome();
}

// PURGE on an EMPTY subdirectory works (HP50 allows this).
{
  resetHome();
  makeSubdir('EMPTY');
  const s = new Stack();
  s.push(Name('EMPTY', { quoted: true }));
  lookup('PURGE').fn(s);
  assert(varRecall('EMPTY') === undefined,
         'PURGE empty subdir: subdir removed');
  resetHome();
}

// IFERR catches the new "Directory not allowed" trap and ERRN reports 0x502.
// (IFERR restores the pre-trap stack, so inputs remain; we peek at the top.)
{
  resetHome();
  clearLastError();
  makeSubdir('AFOO');
  const s = new Stack();
  // << 42 'AFOO' IFERR STO THEN ERRN END >>
  s.push(Program([
    Real(42),
    Name('AFOO', { quoted: true }),
    Name('IFERR'), Name('STO'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  const top = s.peek();
  assert(isBinaryInteger(top) && top.value === 0x502n,
         'IFERR around STO-over-subdir: ERRN = #502h (Directory not allowed)');
  resetHome();
}

// IFERR catches the "Directory not empty" trap and ERRN reports 0x503.
{
  resetHome();
  clearLastError();
  makeSubdir('AFOO');
  goInto('AFOO');
  varStore('X', Real(1));
  goHome();
  const s = new Stack();
  // << 'AFOO' IFERR PURGE THEN ERRN END >>
  s.push(Program([
    Name('AFOO', { quoted: true }),
    Name('IFERR'), Name('PURGE'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  const top = s.peek();
  assert(isBinaryInteger(top) && top.value === 0x503n,
         'IFERR around PURGE-non-empty-subdir: ERRN = #503h (Directory not empty)');
  resetHome();
}

// IFERR catches CRDIR name-conflict and ERRN reports 0x501.
{
  resetHome();
  clearLastError();
  varStore('X', Real(1));
  const s = new Stack();
  // << 'X' IFERR CRDIR THEN ERRN END >>
  s.push(Program([
    Name('X', { quoted: true }),
    Name('IFERR'), Name('CRDIR'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  const top = s.peek();
  assert(isBinaryInteger(top) && top.value === 0x501n,
         'IFERR around CRDIR name-conflict: ERRN = #501h (Name conflict)');
  resetHome();
}

// Direct classifier checks for the new error numbers.
{
  clearLastError();
  setLastError({ message: 'Directory not allowed: AFOO' });
  assert(getLastError().number === 0x502,
         'map: "Directory not allowed" prefix → 0x502');
  setLastError({ message: 'Directory not empty: AFOO' });
  assert(getLastError().number === 0x503,
         'map: "Directory not empty" prefix → 0x503');
  setLastError({ message: 'Name conflict: X' });
  assert(getLastError().number === 0x501,
         'map: "Name conflict" prefix → 0x501');
  clearLastError();
}


{
  const {
    saveVarStateForUndo, undoVarState, hasVarUndo, clearVarUndo,
  } = await import('../www/src/rpl/state.js');

  {
    resetHome();
    varStore('X', Real(5));
    saveVarStateForUndo();
    // Mutate AFTER snapshotting; snapshot must be unaffected.
    varStore('Y', Real(7));
    assert(hasVarUndo(), 'saveVarStateForUndo records a shadow');
    undoVarState();
    assert(varRecall('X') && varRecall('X').value.eq(5),
      'undoVarState restores X = 5');
    assert(varRecall('Y') === undefined,
      'undoVarState drops Y that was added after snapshot');
  }

  {
    const { redoVarState, hasVarRedo } = await import('../www/src/rpl/state.js');
    resetHome();
    varStore('X', Real(5));
    saveVarStateForUndo();
    varStore('Y', Real(7));
    undoVarState();                 // back to { X=5 }
    assert(varRecall('Y') === undefined, 'first undo: Y gone');
    assert(hasVarRedo(), 'redo slot available after undo');
    redoVarState();                 // forward to { X=5, Y=7 }
    assert(varRecall('X') && varRecall('X').value.eq(5),
      'redo leaves X intact');
    assert(varRecall('Y') && varRecall('Y').value.eq(7),
      'redo restores Y = 7');
  }

  {
    resetHome();
    varStore('X', Real(5));
    saveVarStateForUndo();
    assert(hasVarUndo(), 'slot present after save');
    clearVarUndo();
    assert(!hasVarUndo(), 'slot cleared by clearVarUndo');
    assertThrows(() => undoVarState(), /no undo/i,
                 'undoVarState with no slot throws No undo available');
  }

  {
    resetHome();
    varStore('X', Real(11));
    varStore('Y', Real(22));
    saveVarStateForUndo();
    varPurge('X');
    assert(varRecall('X') === undefined, 'X purged live');
    undoVarState();
    assert(varRecall('X') && varRecall('X').value.eq(11),
      'undo restores purged X');
  }

  {
    resetHome();
    makeSubdir('AFOO');
    saveVarStateForUndo();
    goInto('AFOO');
    assert(currentPath().join('/') === 'HOME/AFOO',
      'goInto puts us in AFOO');
    undoVarState();
    assert(currentPath().join('/') === 'HOME',
      'undoVarState navigates back to HOME');
  }

  {
    resetHome();
    makeSubdir('AFOO');
    goInto('AFOO');
    saveVarStateForUndo();
    goUp();
    assert(currentPath().join('/') === 'HOME', 'goUp landed at HOME');
    undoVarState();
    assert(currentPath().join('/') === 'HOME/AFOO',
      'undoVarState navigates back into AFOO');
  }

  {
    resetHome();
    const sub = makeSubdir('AFOO');
    goInto('AFOO');
    varStore('A', Real(1));
    goUp();                          // HOME
    saveVarStateForUndo();
    // Go back and mutate AFOO's contents.
    goInto('AFOO');
    varStore('B', Real(2));
    varPurge('A');
    assert(varRecall('B').value.eq(2), 'live: B stored in AFOO');
    assert(varRecall('A') === undefined, 'live: A purged in AFOO');
    // Undo should restore AFOO's A and drop B.  We're currently inside
    // AFOO; the snapshot was taken from HOME, so undo should also
    // navigate back to HOME.
    undoVarState();
    assert(currentPath().join('/') === 'HOME',
      'undo returns us to HOME (where we were when saveForUndo ran)');
    goInto('AFOO');
    assert(varRecall('A') && varRecall('A').value.eq(1),
      'SUB/A restored to 1');
    assert(varRecall('B') === undefined,
      'SUB/B (added after snapshot) is gone');
  }

  // ---- snapshot doesn't leak references: mutating live tree
  //      doesn't alter the shadow ----
  {
    resetHome();
    varStore('X', Real(1));
    saveVarStateForUndo();
    varStore('X', Real(999));        // overwrite, same name
    undoVarState();
    assert(varRecall('X') && varRecall('X').value.eq(1),
      'shadow is independent — overwrite did not bleed into snapshot');
  }

  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    resetHome();
    const s = new Stack();
    s.push(Real(10));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(20));
    varStore('X', Real(5));
    assert(s.hasUndo(),  'stack undo shadow present');
    assert(hasVarUndo(), 'var undo shadow present');
  }

  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    resetHome();
    varStore('X', Real(5));
    const s = new Stack();
    s.push(Real(1));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(2));
    varStore('Y', Real(9));
    e.performUndo();
    assert(s.depth === 1 && s.peek(1).value.eq(1),
      'performUndo restored stack to { 1 }');
    assert(varRecall('Y') === undefined,
      'performUndo dropped Y added after snap');
    assert(varRecall('X') && varRecall('X').value.eq(5),
      'performUndo kept X that predates snap');
  }

  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    assertThrows(() => e.performUndo(), /no undo/i,
                 'performUndo with no shadow throws No undo available');
  }

  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    // First ENTER: push 42 and quoted-X onto the stack.  Snap slot
    // now holds "empty stack + empty HOME".
    e.type("42 `X`");
    e.enter();
    assert(s.depth === 2, 'two values on stack before STO');
    // Second ENTER: run STO as a named op.  This ENTER's snap slot
    // overwrites the previous one with "stack = {42, `X`}, HOME = {}".
    e.type('STO');
    e.enter();
    assert(s.depth === 0, 'STO consumed the two args');
    assert(varRecall('X'), 'STO created X');
    const storedVal = varRecall('X');
    // STO-stored value is Integer(42n) or Real(42) depending on
    // parseEntry's choice; we just check it round-trips to 42.
    const xnum = typeof storedVal.value === 'bigint' ? Number(storedVal.value) : storedVal.value;
    assert(xnum === 42, 'X = 42 after STO');
    // UNDO restores the pre-STO state: stack = { 42, 'X' } and X
    // is gone from HOME.
    e.performUndo();
    assert(varRecall('X') === undefined,
      'UNDO reverted the STO — X is gone from HOME');
    assert(s.depth === 2, 'UNDO restored the pre-STO stack { 42, X }');
  }

  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    resetHome();
    varStore('X', Real(99));
    const s = new Stack();
    const e = new Entry(s);
    e.type("`X` PURGE");
    e.enter();
    assert(varRecall('X') === undefined, 'PURGE removed X');
    e.performUndo();
    assert(varRecall('X') && varRecall('X').value.eq(99),
      'UNDO brought X back');
  }

  // ---- Cleanup shadow so the big cleanup block below runs cleanly
  clearVarUndo();
  resetHome();
}

/* stored-variable arithmetic ops (STO+ STO- STO* STO/). */
  resetHome();   // clean slate for variable tests below
  {
    varStore('X', Real(10));
    const s = new Stack();
    s.push(Real(5));
    s.push(Name('X'));
    lookup('STO+').fn(s);
    assert(varRecall('X').value.eq(15) && s.depth === 0,
      'STO+: X=10, 5 X STO+ → X=15, stack empty');
  }
  {
    // Either order accepted: name first, then value
    varStore('Y', Real(100));
    const s = new Stack();
    s.push(Name('Y'));
    s.push(Real(40));
    lookup('STO-').fn(s);
    assert(varRecall('Y').value.eq(60),
      'STO-: Y=100, Y 40 STO- → Y=60 (either stack order accepted)');
  }
  {
    varStore('Z', Real(3));
    const s = new Stack();
    s.push(Real(4));
    s.push(Name('Z'));
    lookup('STO*').fn(s);
    assert(varRecall('Z').value.eq(12),
      'STO*: Z=3, 4 Z STO* → Z=12');
  }
  {
    varStore('W', Real(20));
    const s = new Stack();
    s.push(Real(5));
    s.push(Name('W'));
    lookup('STO/').fn(s);
    assert(varRecall('W').value.eq(4),
      'STO/: W=20, 5 W STO/ → W=4 (stored/value)');
  }
  {
    // String name works too (HP50 accepts both)
    varStore('Q', Integer(7));
    const s = new Stack();
    s.push(Real(3));
    s.push(Str('Q'));
    lookup('STO+').fn(s);
    // Integer + Real = Real(10)
    const q = varRecall('Q');
    assert((isReal(q) && q.value.eq(10)) || (isInteger(q) && q.value === 10n),
      'STO+ accepts string as name argument');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Name('MISSING_VAR_XYZ'));
    try { lookup('STO+').fn(s); assert(false, 'should throw for missing var'); }
    catch (e) { assert(/Undefined name/i.test(e.message), 'STO+ missing var → Undefined name'); }
  }

/* ================================================================
   INCR / DECR (stored-variable ± 1) + user flag ops
   (SF / CF / FS? / FC? / FS?C / FC?C).
   ================================================================ */

/* Dynamic import so state.js flag helpers are in scope here. */
const {
  setUserFlag, clearUserFlag, testUserFlag, clearAllUserFlags,
} = await import('../www/src/rpl/state.js');

{
  resetHome();
  varStore('X', Real(10));
  const s = new Stack();
  s.push(Name('X'));
  lookup('INCR').fn(s);
  assert(varRecall('X').value.eq(11),
    "INCR: X=10, `X` INCR stores X=11");
  assert(s.depth === 1 && isReal(s.peek(1)) && s.peek(1).value.eq(11),
    'INCR leaves the NEW value on the stack (11)');
}
{
  resetHome();
  varStore('Y', Real(5));
  const s = new Stack();
  s.push(Name('Y'));
  lookup('DECR').fn(s);
  assert(varRecall('Y').value.eq(4),
    "DECR: Y=5, `Y` DECR stores Y=4");
  assert(s.peek(1).value.eq(4), 'DECR pushes the NEW value (4)');
}
{
  // Integer start: + Real(1) should end up Real(11) or Integer(11n)
  resetHome();
  varStore('N', Integer(10n));
  const s = new Stack();
  s.push(Name('N'));
  lookup('INCR').fn(s);
  const v = varRecall('N');
  const num = typeof v.value === 'bigint' ? Number(v.value) : v.value.toNumber();
  assert(num === 11, 'INCR on Integer-valued variable → 11');
}
{
  // String name accepted (mirrors STO+)
  resetHome();
  varStore('K', Real(0));
  const s = new Stack();
  s.push(Str('K'));
  lookup('INCR').fn(s);
  assert(varRecall('K').value.eq(1), "INCR accepts \"K\" (string) as the name arg");
}
{
  // Undefined variable
  resetHome();
  const s = new Stack();
  s.push(Name('NOPE'));
  try { lookup('INCR').fn(s); assert(false, 'INCR should throw on undefined'); }
  catch (e) { assert(/Undefined name/i.test(e.message),
    'INCR on undefined → Undefined name'); }
}
{
  // Bad argument type — Real as L1
  resetHome();
  const s = new Stack();
  s.push(Real(7));
  try { lookup('DECR').fn(s); assert(false, 'DECR bad type should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'DECR with non-name/non-string → Bad argument type'); }
}

{
  clearAllUserFlags();
  const s = new Stack();
  s.push(Real(5));
  lookup('SF').fn(s);
  assert(s.depth === 0, 'SF consumed its arg');
  assert(testUserFlag(5), 'SF set flag 5');
}
{
  // FS? on set flag → 1, on clear flag → 0
  clearAllUserFlags();
  setUserFlag(7);
  const s = new Stack();
  s.push(Real(7));
  lookup('FS?').fn(s);
  assert(s.peek(1).value.eq(1), 'FS? on a set flag pushes 1');
  s.pop();

  s.push(Real(8));
  lookup('FS?').fn(s);
  assert(s.peek(1).value.eq(0), 'FS? on a clear flag pushes 0');
  s.pop();

  // FC? is the inverse
  s.push(Real(7));
  lookup('FC?').fn(s);
  assert(s.peek(1).value.eq(0), 'FC? on a set flag pushes 0');
  s.pop();

  s.push(Real(8));
  lookup('FC?').fn(s);
  assert(s.peek(1).value.eq(1), 'FC? on a clear flag pushes 1');
  s.pop();
}
{
  // CF clears
  clearAllUserFlags();
  setUserFlag(12);
  const s = new Stack();
  s.push(Real(12));
  lookup('CF').fn(s);
  assert(!testUserFlag(12), 'CF cleared flag 12');
  assert(s.depth === 0, 'CF consumed its arg (no push)');
}
{
  // FS?C test-and-clear on set flag returns 1, clears
  clearAllUserFlags();
  setUserFlag(3);
  const s = new Stack();
  s.push(Real(3));
  lookup('FS?C').fn(s);
  assert(s.peek(1).value.eq(1),
    'FS?C on a set flag pushes 1 (was-set)');
  s.pop();
  assert(!testUserFlag(3), 'FS?C also cleared the flag');

  // Second call — flag now clear → pushes 0, still clear
  s.push(Real(3));
  lookup('FS?C').fn(s);
  assert(s.peek(1).value.eq(0),
    'FS?C on the (now) clear flag pushes 0');
  s.pop();
  assert(!testUserFlag(3), 'FS?C leaves a clear flag clear');
}
{
  // FC?C test-and-clear on set flag returns 0, clears
  clearAllUserFlags();
  setUserFlag(4);
  const s = new Stack();
  s.push(Real(4));
  lookup('FC?C').fn(s);
  assert(s.peek(1).value.eq(0),
    'FC?C on a set flag pushes 0 (was NOT clear)');
  s.pop();
  assert(!testUserFlag(4), 'FC?C cleared the flag');

  // On a clear flag → pushes 1, still clear
  s.push(Real(4));
  lookup('FC?C').fn(s);
  assert(s.peek(1).value.eq(1),
    'FC?C on a clear flag pushes 1 (was clear)');
  s.pop();
  assert(!testUserFlag(4), 'FC?C leaves a clear flag clear');
}
{
  // Negative (system) flags — same set of ops, separate numbering space
  clearAllUserFlags();
  const s = new Stack();
  s.push(Real(-17));
  lookup('SF').fn(s);
  assert(testUserFlag(-17), 'SF works with system (negative) flag number');

  s.push(Real(-17));
  lookup('FS?').fn(s);
  assert(s.peek(1).value.eq(1), 'FS? -17 → 1 after SF');
  s.pop();
  clearAllUserFlags();
}
{
  // Error cases — zero, out of range, non-integer
  clearAllUserFlags();
  const s = new Stack();
  s.push(Real(0));
  try { lookup('SF').fn(s); assert(false, 'SF 0 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'SF 0 → Bad argument value'); }

  s.push(Real(200));
  try { lookup('SF').fn(s); assert(false, 'SF 200 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'SF 200 → Bad argument value (> 128)'); }

  s.push(Real(-200));
  try { lookup('SF').fn(s); assert(false, 'SF -200 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'SF -200 → Bad argument value (< -128)'); }

  s.push(Real(3.5));
  try { lookup('SF').fn(s); assert(false, 'SF 3.5 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'SF 3.5 → Bad argument value (non-integer)'); }

  s.push(Str('5'));
  try { lookup('SF').fn(s); assert(false, 'SF with string should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'SF "5" → Bad argument type'); }
  clearAllUserFlags();
}

/* ================================================================
   STOF / RCLF (flag set save/restore).

   STOF: { n1 n2 … } → (clears all flags, sets exactly those in list)
   RCLF: ( → { n1 n2 … } )  (pushes sorted list of currently-set flag
                             numbers; empty flag set pushes {})
   ================================================================ */

{
  clearAllUserFlags();
  const s = new Stack();
  lookup('RCLF').fn(s);
  assert(s.depth === 1 && s.peek(1).type === 'list'
      && s.peek(1).items.length === 0,
    'RCLF with no flags set pushes {}');
}
{
  clearAllUserFlags();
  setUserFlag(42);
  setUserFlag(-17);
  setUserFlag(5);
  const s = new Stack();
  lookup('RCLF').fn(s);
  const list = s.peek(1);
  assert(list.items.length === 3,
    'RCLF pushes a list of the same length as the flag set');
  const nums = list.items.map(x => Number(x.value));
  assert(JSON.stringify(nums) === JSON.stringify([-17, 5, 42]),
    'RCLF sorts flag numbers ascending: -17 < 5 < 42');
  assert(list.items.every(x => x.type === 'integer'),
    'RCLF pushes Integer-typed flag numbers');
  clearAllUserFlags();
}
{
  clearAllUserFlags();
  setUserFlag(1); setUserFlag(2); setUserFlag(3);
  const s = new Stack();
  s.push(RList([Integer(10n), Integer(-20n)]));
  lookup('STOF').fn(s);
  assert(s.depth === 0, 'STOF consumed its argument');
  assert(!testUserFlag(1) && !testUserFlag(2) && !testUserFlag(3),
    'STOF cleared flags 1/2/3 that were set before the call');
  assert(testUserFlag(10) && testUserFlag(-20),
    'STOF set exactly the flags named in the list');
  clearAllUserFlags();
}
{
  clearAllUserFlags();
  setUserFlag(-40); setUserFlag(17); setUserFlag(100);
  const s = new Stack();
  lookup('RCLF').fn(s);
  // Now clear and round-trip
  clearAllUserFlags();
  lookup('STOF').fn(s);
  assert(testUserFlag(-40) && testUserFlag(17) && testUserFlag(100),
    'STOF then RCLF round-trips the flag set');
  clearAllUserFlags();
}
{
  clearAllUserFlags();
  setUserFlag(1); setUserFlag(2);
  const s = new Stack();
  s.push(RList([]));
  lookup('STOF').fn(s);
  assert(!testUserFlag(1) && !testUserFlag(2),
    'STOF {} clears all flags');
}
{
  clearAllUserFlags();
  const s = new Stack();
  s.push(RList([Real(7), Real(-8)]));
  lookup('STOF').fn(s);
  assert(testUserFlag(7) && testUserFlag(-8),
    'STOF accepts Real elements (integer-valued)');
  clearAllUserFlags();
}
{
  clearAllUserFlags();
  const s = new Stack();
  s.push(Real(5));
  try { lookup('STOF').fn(s); assert(false, 'STOF non-list should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'STOF on Real → Bad argument type'); }
}
{
  clearAllUserFlags();
  setUserFlag(5);
  const s = new Stack();
  s.push(RList([Integer(1n), Str('oops'), Integer(2n)]));
  try { lookup('STOF').fn(s); assert(false, 'STOF bad element type should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'STOF with non-numeric element → Bad argument type'); }
  // Flag set must NOT have been partially mutated
  assert(testUserFlag(5) && !testUserFlag(1) && !testUserFlag(2),
    'STOF leaves flag set unchanged when validation fails');
  clearAllUserFlags();
}
{
  clearAllUserFlags();
  setUserFlag(5);
  const s = new Stack();
  s.push(RList([Integer(0n)]));
  try { lookup('STOF').fn(s); assert(false, 'STOF 0 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'STOF with 0 flag number → Bad argument value'); }
  assert(testUserFlag(5),
    'STOF leaves flag set unchanged on out-of-range element');
  clearAllUserFlags();

  const s2 = new Stack();
  s2.push(RList([Integer(200n)]));
  try { lookup('STOF').fn(s2); assert(false, 'STOF 200 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'STOF with |n| > 128 → Bad argument value'); }
}
{
  clearAllUserFlags();
  const s = new Stack();
  s.push(RList([Real(3.5)]));
  try { lookup('STOF').fn(s); assert(false, 'STOF 3.5 should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'STOF with non-integer Real → Bad argument value'); }
}


{
  resetHome();
  varStore('X', Real(7));
  const s = new Stack();
  s.push(Name('X'));
  lookup('SNEG').fn(s);
  assert(varRecall('X').value.eq(-7) && s.depth === 0,
    'session046: SNEG X (X=7) → X=-7, stack empty');
}

{
  resetHome();
  varStore('N', Integer(42n));
  const s = new Stack();
  s.push(Name('N'));
  lookup('SNEG').fn(s);
  const n = varRecall('N');
  assert(isInteger(n) && n.value === -42n,
    'session046: SNEG on Integer 42 → Integer -42');
}

{
  resetHome();
  varStore('Y', Real(4));
  const s = new Stack();
  s.push(Name('Y'));
  lookup('SINV').fn(s);
  assert(varRecall('Y').value.eq(0.25),
    'session046: SINV Y (Y=4) → Y=0.25');
}

{
  resetHome();
  varStore('R', Real(5));
  const s = new Stack();
  s.push(Name('R'));
  lookup('SCONJ').fn(s);
  assert(varRecall('R').value.eq(5),
    'session046: SCONJ on real leaves value unchanged');
}

{
  resetHome();
  varStore('Z', Complex(3, 4));
  const s = new Stack();
  s.push(Name('Z'));
  lookup('SCONJ').fn(s);
  const z = varRecall('Z');
  assert(isComplex(z) && z.re === 3 && z.im === -4,
    'session046: SCONJ on Complex(3,4) → Complex(3,-4)');
}

{
  resetHome();
  varStore('A', Real(9));
  const s = new Stack();
  s.push(Str('A'));
  lookup('SNEG').fn(s);
  assert(varRecall('A').value.eq(-9),
    'session046: SNEG accepts String identifier');
}

{
  resetHome();
  const s = new Stack();
  s.push(Name('NOSUCH'));
  try { lookup('SNEG').fn(s); assert(false, 'SNEG missing var should throw'); }
  catch (e) { assert(/Undefined name/i.test(e.message),
    'session046: SNEG missing var → Undefined name'); }
}

{
  resetHome();
  varStore('ZERO', Real(0));
  const s = new Stack();
  s.push(Name('ZERO'));
  try { lookup('SINV').fn(s); assert(false, 'SINV 0 should throw'); }
  catch (e) { assert(/Infinite result|argument/i.test(e.message),
    'session046: SINV on stored 0 → error propagates'); }
}

{
  resetHome();
  makeSubdir('TEMP');
  goInto('TEMP');
  varStore('A', Real(1));
  varStore('B', Real(2));
  goUp();                                   // back to HOME with TEMP non-empty
  assert(varRecall('TEMP') !== undefined, 'setup: TEMP exists');
  const s = new Stack();
  s.push(Name('TEMP'));
  lookup('PGDIR').fn(s);
  assert(varRecall('TEMP') === undefined && s.depth === 0,
    'session046: PGDIR removes non-empty subdirectory');
}

{
  resetHome();
  makeSubdir('KEEP');
  goInto('KEEP');
  varStore('X', Real(1));
  goUp();
  const s = new Stack();
  s.push(Name('KEEP'));
  try { lookup('PURGE').fn(s); assert(false, 'PURGE should refuse non-empty subdir'); }
  catch (e) { assert(/not empty|argument/i.test(e.message),
    'session046: PURGE on non-empty subdir still refuses — PGDIR is needed'); }
}

{
  resetHome();
  const s = new Stack();
  s.push(Name('MISSING'));
  try { lookup('PGDIR').fn(s); assert(false, 'PGDIR missing should throw'); }
  catch (e) { assert(/Undefined name/i.test(e.message),
    'session046: PGDIR missing → Undefined name'); }
}

{
  resetHome();
  varStore('NOTADIR', Real(99));
  const s = new Stack();
  s.push(Name('NOTADIR'));
  try { lookup('PGDIR').fn(s); assert(false, 'PGDIR on Real should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'session046: PGDIR on non-directory → Bad argument type'); }
  // And the variable is still there
  assert(varRecall('NOTADIR') !== undefined, 'PGDIR error didn\'t clobber the variable');
}

{
  resetHome();
  makeSubdir('OUTER');
  goInto('OUTER');
  makeSubdir('INNER');
  goInto('INNER');
  varStore('DEEP', Real(42));
  goHome();
  const s = new Stack();
  s.push(Name('OUTER'));
  lookup('PGDIR').fn(s);
  assert(varRecall('OUTER') === undefined,
    'session046: PGDIR on OUTER removes nested {INNER/DEEP} tree');
}

/* ---- List-shaped inputs: PGDIR and the S-unary family all accept a
   list of names and iterate left-to-right, mirroring PURGE. ---- */
{
  resetHome();
  makeSubdir('D1');
  makeSubdir('D2');
  const s = new Stack();
  s.push(RList([Name('D1'), Name('D2')]));
  lookup('PGDIR').fn(s);
  assert(varRecall('D1') === undefined && varRecall('D2') === undefined,
    'PGDIR { D1 D2 } purges both subdirectories');
}
{
  resetHome();
  varStore('A', Real(2));
  varStore('B', Real(-3));
  const s = new Stack();
  s.push(RList([Name('A'), Name('B')]));
  lookup('SNEG').fn(s);
  assert(varRecall('A').value.eq(-2) && varRecall('B').value.eq(3),
    'SNEG { A B } negates both stored values');
}
{
  resetHome();
  varStore('P', Real(4));
  varStore('Q', Real(5));
  const s = new Stack();
  s.push(RList([Name('P'), Name('Q')]));
  lookup('SINV').fn(s);
  assert(Math.abs(varRecall('P').value - 0.25) < 1e-15
      && Math.abs(varRecall('Q').value - 0.2) < 1e-15,
    'SINV { P Q } inverts both stored values');
}


{
  resetHome();
  varStore('Z', Real(1));
  varStore('A', Real(2));
  varStore('M', Real(3));
  // Baseline: VARS reverses insertion order (newest-first) → M,A,Z.
  const sBefore = new Stack();
  lookup('VARS').fn(sBefore);
  const before = sBefore.peek().items.map(n => n.id).join(',');
  assert(before === 'M,A,Z',
    'session047: VARS baseline is reverse-insertion order (M,A,Z)');

  // Apply ORDER: want A first, then Z, then whatever was left (M).
  // Internal becomes [A, Z, M]; VARS reverses → M,Z,A.
  const sOrder = new Stack();
  sOrder.push(RList([Name('A'), Name('Z')]));
  lookup('ORDER').fn(sOrder);
  assert(sOrder.depth === 0, 'session047: ORDER consumed its list');

  const sAfter = new Stack();
  lookup('VARS').fn(sAfter);
  const after = sAfter.peek().items.map(n => n.id).join(',');
  assert(after === 'M,Z,A',
    'session047: ORDER({A,Z}) → VARS now M,Z,A (reverse of internal A,Z,M)');
}

{
  resetHome();
  varStore('B', Real(1));
  varStore('A', Real(2));
  const s = new Stack();
  s.push(RList([Str('A'), Str('B')]));
  lookup('ORDER').fn(s);
  const sVars = new Stack();
  lookup('VARS').fn(sVars);
  const got = sVars.peek().items.map(n => n.id).join(',');
  assert(got === 'B,A',
    'session047: ORDER accepts String names (internal A,B → VARS reversed → B,A)');
}

{
  resetHome();
  varStore('X', Real(1));
  varStore('Y', Real(2));
  const s = new Stack();
  s.push(RList([Name('NOPE'), Name('Y'), Name('X')]));
  lookup('ORDER').fn(s);
  const sVars = new Stack();
  lookup('VARS').fn(sVars);
  const got = sVars.peek().items.map(n => n.id).join(',');
  assert(got === 'X,Y',
    'session047: ORDER silently skips unknown names (internal Y,X → VARS reversed → X,Y)');
}

{
  resetHome();
  varStore('Q', Real(1));
  const s = new Stack();
  s.push(Real(42));
  assertThrows(() => lookup('ORDER').fn(s), null,
               'session047: ORDER on non-List throws Bad argument type');
}

{
  resetHome();
  varStore('A', Real(1));
  varStore('B', Real(2));
  const s = new Stack();
  s.push(RList([]));
  lookup('ORDER').fn(s);
  const sVars = new Stack();
  lookup('VARS').fn(sVars);
  const got = sVars.peek().items.map(n => n.id).join(',');
  assert(got === 'B,A',
    'session047: ORDER([]) leaves internal order unchanged (A,B → VARS reversed → B,A)');
}

{
  resetHome();
  varStore('A', Real(1));
  varStore('B', Real(2));
  varStore('C', Real(3));
  const s = new Stack();
  s.push(RList([Name('C'), Name('A'), Name('C')]));
  lookup('ORDER').fn(s);
  const sVars = new Stack();
  lookup('VARS').fn(sVars);
  const got = sVars.peek().items.map(n => n.id).join(',');
  assert(got === 'B,A,C',
    'session047: ORDER dedupe — internal C,A,B → VARS reversed → B,A,C');
}

{
  const s = new Stack();
  s.push(Integer(42));
  lookup('BYTES').fn(s);
  assert(s.depth === 2, 'session047: BYTES pushes 2 values');
  const size = s.pop();
  const checksum = s.pop();
  assert(isInteger(checksum) && checksum.value === 0n,
    'session047: BYTES checksum = 0 (we don\'t track CRC)');
  assert(isInteger(size) && size.value > 0n,
    'session047: BYTES size is a positive Integer byte estimate');
}

{
  const s1 = new Stack();
  s1.push(Integer(1));
  lookup('BYTES').fn(s1);
  const sAtom = Number(s1.pop().value);
  s1.pop();     // checksum

  const s2 = new Stack();
  s2.push(RList([Integer(1), Integer(2), Integer(3), Integer(4), Integer(5)]));
  lookup('BYTES').fn(s2);
  const sList = Number(s2.pop().value);
  s2.pop();

  assert(sList > sAtom,
    `session047: BYTES on 5-element list (${sList}) > BYTES on atom (${sAtom})`);
}

{
  const s = new Stack();
  const orig = Real(3.14);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy.type === 'real' && copy.value.eq(3.14),
    'session047: NEWOB preserves value');
  assert(copy !== orig,
    'session047: NEWOB produces a distinct object (not ===)');
}

{
  const s = new Stack();
  const orig = RList([Integer(1), Integer(2)]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy.type === 'list' && copy.items.length === 2,
    'session047: NEWOB on List preserves items');
  assert(copy !== orig, 'session047: NEWOB on List returns a new object');
}

{
  const s = new Stack();
  const orig = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy.type === 'matrix' && copy.rows.length === 2,
    'session047: NEWOB on Matrix preserves shape');
  assert(copy !== orig, 'session047: NEWOB on Matrix returns new object');
}

{
  const s = new Stack();
  lookup('MEM').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value.eq(1073741824),
    'session047: MEM pushes Real(1 GiB)');
}


{
  resetHome();
  varStore('X', Integer(42n));
  const s = new Stack();
  s.push(Name('X'));
  lookup('VTYPE').fn(s);
  assert(s.peek().type === 'real',
    'session053: VTYPE returns Real');

  // Compare against KIND of the raw value
  const k = new Stack();
  k.push(Integer(42n));
  lookup('KIND').fn(k);
  assert(s.peek().value.eq(k.peek().value),
    'session053: VTYPE X === KIND of stored X');
}

{
  resetHome();
  const s = new Stack();
  s.push(Name('MISSING'));
  assertThrows(() => lookup('VTYPE').fn(s), /Undefined name/,
               'session053: VTYPE undefined name throws');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => lookup('VTYPE').fn(s), /Bad argument/,
               'session053: VTYPE on non-Name throws');
}

/* =================================================================
   MERGE: directory / list-of-pairs merge.
   ================================================================= */

{
  resetHome();
  const s = new Stack();
  s.push(RList([
    Name('A'), Integer(1n),
    Name('B'), Integer(2n),
    Name('C'), Integer(3n),
  ]));
  lookup('MERGE').fn(s);
  assert(isInteger(varRecall('A')) && varRecall('A').value === 1n,
    'session054: MERGE stored A');
  assert(isInteger(varRecall('B')) && varRecall('B').value === 2n,
    'session054: MERGE stored B');
  assert(isInteger(varRecall('C')) && varRecall('C').value === 3n,
    'session054: MERGE stored C');
}

{
  resetHome();
  varStore('X', Integer(100n));
  const s = new Stack();
  s.push(RList([Name('X'), Integer(42n)]));
  lookup('MERGE').fn(s);
  assert(varRecall('X').value === 42n,
    'session054: MERGE overwrites existing var');
}

{
  resetHome();
  const s = new Stack();
  s.push(RList([]));
  lookup('MERGE').fn(s);
  assert(varList().length === 0, 'session054: MERGE {} no-op');
}

{
  resetHome();
  const s = new Stack();
  s.push(RList([Str('K'), Integer(7n)]));
  lookup('MERGE').fn(s);
  assert(varRecall('K').value === 7n, 'session054: MERGE accepts String key');
}

{
  resetHome();
  const s = new Stack();
  s.push(RList([Name('A'), Integer(1n), Name('B')]));
  assertThrows(() => lookup('MERGE').fn(s), /Bad argument/,
               'session054: MERGE odd-length throws');
}

{
  resetHome();
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  assertThrows(() => lookup('MERGE').fn(s), /Bad argument/,
               'session054: MERGE numeric key throws');
}

{
  resetHome();
  const d = Directory({ name: 'SRC' });
  d.entries.set('P', Integer(11n));
  d.entries.set('Q', Integer(22n));
  const s = new Stack();
  s.push(d);
  lookup('MERGE').fn(s);
  assert(varRecall('P').value === 11n && varRecall('Q').value === 22n,
    'session054: MERGE Directory copies all entries');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(5n));
  assertThrows(() => lookup('MERGE').fn(s), /Bad argument/,
               'session054: MERGE Integer arg throws');
}
