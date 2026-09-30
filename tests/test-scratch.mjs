import { evalScratch, previewCommand } from '../www/src/rpl/scratch.js';
import {
  state, varStore, varRecall, varPurge, setAngle, setDisplay, setBinaryBase,
  captureCalcState, restoreCalcState, withScratchState, testUserFlag,
  currentPath, goHome, getHalted, clearHalted, subscribe,
} from '../www/src/rpl/state.js';
import { Real, Integer, Name, Program, RList, isReal } from '../www/src/rpl/types.js';
import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { assert } from './helpers.mjs';

/* Scratch (dry-run) evaluation — the AI assistant's sandbox.  It must
   compute exactly what ENTER would, report RPL errors as data instead
   of throwing, and leave every calculator global (variables, modes,
   flags) untouched no matter what the evaluated line did. */

{
  const r = evalScratch('10 FACT');
  assert(r.ok && r.stack[0] === '3628800' && r.depth === 1,
         'evalScratch runs a literal + op and formats the result');
}
{
  const r = evalScratch('3 4 + 5 *');
  assert(r.ok && r.stack[0] === '35', 'evalScratch runs a multi-token RPL line');
}
{
  const r = evalScratch('+', { liveItems: [Real(1), Real(2)] });
  assert(r.ok && r.stack[0] === '3.' && r.depth === 1,
         'evalScratch seeds the scratch stack with a copy of the live items');
}
{
  const live = [Real(1), Real(2)];
  evalScratch('DROP DROP 99', { liveItems: live });
  assert(live.length === 2, 'evalScratch never mutates the caller\'s live array');
}
{
  const r = evalScratch('"abc" SIN');
  assert(!r.ok && /SIN: Bad argument type/.test(r.error),
         'evalScratch reports an op error tagged with the command name');
  assert(!('stack' in r), 'evalScratch omits the stack on error');
}
{
  const r = evalScratch('[[1 2][3 4]] INV');
  assert(r.ok && /-2\./.test(r.stack[0]), 'evalScratch runs matrix ops');
}
{
  const r = evalScratch('{ 5 3 9 } SORT');
  assert(r.ok && r.stack[0] === '{ 3 5 9 }', 'evalScratch runs list ops');
}
{
  const r = evalScratch('« 1 2 + » EVAL');
  assert(r.ok && r.stack[0] === '3', 'evalScratch runs programs');
}
{
  const r = evalScratch('1 2 3 4 5 6 7 8 9 10', { maxLevels: 3 });
  assert(r.ok && r.stack.length === 3 && r.depth === 10 && r.stack[0] === '10',
         'evalScratch caps the reported levels but reports the true depth');
}
{
  const r = evalScratch('FROBNICATE');
  assert(r.ok && r.stack[0] === 'FROBNICATE',
         'evalScratch pushes an unknown bare identifier as a Name (like ENTER does)');
}

// State isolation: STO, PURGE, mode changes and flags inside the
// sandbox must not leak.
{
  goHome();
  varStore('KEEP', Integer(7));
  setAngle('RAD');
  setDisplay('STD');
  setBinaryBase('d');
  const r = evalScratch('42 `A` STO `KEEP` PURGE DEG 3 FIX HEX 5 SF');
  assert(r.ok, 'evalScratch runs a line full of state mutations without error');
  assert(varRecall('A') === undefined, 'evalScratch rolls back STO');
  assert(varRecall('KEEP')?.value === 7n || String(varRecall('KEEP')?.value) === '7',
         'evalScratch rolls back PURGE');
  assert(state.angle === 'RAD', 'evalScratch rolls back an angle-mode change');
  assert(state.displayMode === 'STD', 'evalScratch rolls back a display-mode change');
  assert(state.binaryBase === 'd', 'evalScratch rolls back a base change');
  assert(!testUserFlag(5), 'evalScratch rolls back a flag set');
  varPurge('KEEP');
}
{
  goHome();
  const r = evalScratch('`SUB1` CRDIR SUB1');
  assert(r.ok, 'evalScratch can create and enter a directory');
  assert(currentPath().length === 1 && varRecall('SUB1') === undefined,
         'evalScratch rolls back CRDIR and the directory change');
}

// captureCalcState / restoreCalcState round-trip, and withScratchState
// restores even when the body throws.
{
  goHome();
  setAngle('RAD');
  const snap = captureCalcState();
  setAngle('DEG');
  varStore('TMPX', Integer(1));
  restoreCalcState(snap);
  assert(state.angle === 'RAD' && varRecall('TMPX') === undefined,
         'restoreCalcState puts modes and variables back');
  let threw = false;
  try {
    withScratchState(() => { setAngle('GRD'); throw new Error('boom'); });
  } catch (e) { threw = /boom/.test(e.message); }
  assert(threw && state.angle === 'RAD', 'withScratchState rethrows but still restores');
  const value = withScratchState(() => 42);
  assert(value === 42, 'withScratchState returns the body\'s value');
}

{
  const { previewCommand, isPreviewable } = await import('../www/src/rpl/scratch.js');
  const { Real, Str } = await import('../www/src/rpl/types.js');
  const a = Real(1);
  const b = Real(2);
  const live = [a, b];
  const swap = previewCommand('SWAP', live);
  assert(swap.ok && swap.consumed === 2 && swap.results[0] === b && swap.results[1] === a,
    'previewCommand: SWAP consumes two levels and returns them swapped');
  assert(live[0] === a && live[1] === b && live.length === 2, 'previewCommand: the live stack copy is left untouched');
  const dup = previewCommand('DUP', live);
  assert(dup.ok && dup.consumed === 0 && dup.results.length === 1 && dup.results[0] === b,
    'previewCommand: DUP consumes nothing and adds a copy of level 1');
  const bad = previewCommand('SIN', [Str('hi')]);
  assert(bad && bad.ok === false && /Bad argument type/.test(bad.error), 'previewCommand: an error comes back as a message');
  assert(previewCommand('STO', live) === null && !isPreviewable('PURGE') && !isPreviewable('HEX') && !isPreviewable('RAND'),
    'previewCommand: commands that write variables or modes, or are random, are not previewed');
  assert(isPreviewable('SIN') && isPreviewable('+') && isPreviewable('ROLL'), 'isPreviewable: stack and math commands are');
}

{
  const { previewCommand, isPreviewable } = await import('../www/src/rpl/scratch.js');
  const { allOps } = await import('../www/src/rpl/ops.js');
  const { parseEntry } = await import('../www/src/rpl/parser.js');
  const { captureCalcState } = await import('../www/src/rpl/state.js');
  const stateText = () => JSON.stringify(captureCalcState(), (k, v) => (typeof v === 'bigint' ? String(v) : v));
  const writers = new Set();
  for (const source of ['1 2 3', '{ 1 2 3 } 2', '"abc" 2', '[[1 2][3 4]] 2', '`X^2` `X`', '(1,2) 3', '#FFh 4', '1_m 2_ft']) {
    const live = parseEntry(source);
    for (const name of allOps().filter(isPreviewable)) {
      const before = stateText();
      previewCommand(name, live);
      if (stateText() !== before) writers.add(name);
    }
  }
  assert(writers.size === 0, `previewCommand: no previewable command changes calculator state (${[...writers].join(', ') || 'none'})`);
}

{
  const { previewCommand } = await import('../www/src/rpl/scratch.js');
  const { parseEntry } = await import('../www/src/rpl/parser.js');
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  const calls = giac._callLogCopy().length;
  assert(previewCommand('EGVL', parseEntry('[[1 2][3 4]]')) === null && giac._callLogCopy().length === calls,
    'previewCommand: a command that needs the CAS is not previewed, and the CAS is not called');
  const started = Date.now();
  assert(previewCommand('FACTORS', [Integer((2n ** 31n - 1n) * (2n ** 61n - 1n))]) === null && Date.now() - started < 2000,
    'previewCommand: FACTORS too slow to preview gives up instead of freezing the page');
}

{
  const r = evalScratch('« → n « IF n 2 < THEN n ELSE n 1 - FIB n 2 - FIB + END » » `FIB` STO 10 FIB');
  assert(r.ok && r.stack[0] === '55', 'evalScratch runs a program stored on the same line by its bare name, like the entry line');
  assert(varRecall('FIB') === undefined, 'evalScratch rolls back the program it stored');
}

{
  const previous = varRecall('X');
  if (previous !== undefined) varPurge('X');
  varStore('X', Real(10));
  const shown = previewCommand('INCR', [Name('X', { quoted: true })]);
  const next = shown?.ok ? shown.results[shown.results.length - 1] : null;
  assert(shown?.ok && isReal(next) && next.value.eq(11), 'INCR preview shows the next value');
  assert(varRecall('X').value.eq(10), 'INCR preview does not change X');
  varPurge('X');
  const listed = previewCommand('DOLIST', [
    RList([Integer(1n), Integer(2n)]),
    Program([Name('X', { quoted: true }), Name('STO')]),
  ]);
  assert(listed, 'DOLIST is previewable');
  assert(varRecall('X') === undefined, 'DOLIST preview does not store X');
  if (previous !== undefined) varStore('X', previous);
}

{
  const before = getHalted();
  const s = new Stack();
  s.push(Program([
    Integer(1n), Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  const halted = getHalted();
  try {
    const outcome = evalScratch('CONT');
    assert(!outcome.ok && /Cannot dry-run a halted program/.test(outcome.error),
      'evalScratch CONT does not resume a halted program');
    assert(getHalted() === halted, 'a dry-run CONT leaves the halted program in place');
    assert(s.depth === 1 && s.peek().value === 3n, 'a dry-run CONT leaves the stack at the halt');
    lookup('CONT').fn(s);
    assert(s.depth === 1 && s.peek().value === 9n && getHalted() === before,
      'CONT after a dry run still finishes the halted program');
  } finally {
    if (getHalted() === halted) clearHalted();
  }
}

/* A dry run that halts inside a local frame must not leave the frame behind for the next line. */
{
  const before = getHalted();
  const outcome = evalScratch('« 5 → a « HALT a » » EVAL');
  assert(outcome.ok && getHalted() === before, 'a dry run may halt a program, and the halt is discarded with it');
  assert(evalScratch('a').stack[0] === 'a', 'the local variables of a halted dry run are released');
}

/* Dry runs have no effect outside the calculator: no backups are written and no plot view opens. */
{
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  });
  const { setGraphicsHook } = await import('../www/src/rpl/ops.js');
  let plots = 0;
  setGraphicsHook(() => { plots++; });
  try {
    assert(evalScratch(":0: 'BK' ARCHIVE").ok && store.size === 0, 'a dry-run ARCHIVE writes no backup');
    assert(evalScratch("'X^2' FUNCTION").ok && plots === 0, 'a dry-run plot command does not drive the plot view');
    lookup('FUNCTION').fn(new Stack());
    assert(plots === 1, 'the same plot command outside a dry run reaches the plot view');
  } finally {
    setGraphicsHook(null);
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
}

/* A dry run or hover preview that leaves the calculator as it found it wakes no subscriber, so it costs no autosave and no redraw. */
{
  let notes = 0;
  const off = subscribe(() => { notes++; });
  previewCommand('SIN', [Real(1)]);
  evalScratch('1 2 +');
  const kept = state.home;
  evalScratch('5 `SCRATCHV` STO');
  off();
  assert(notes === 1 && varRecall('SCRATCHV') === undefined && state.home === kept,
    'only a dry run that changed something restores state, and it does so once');
}
