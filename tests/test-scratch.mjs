import { evalScratch } from '../www/src/rpl/scratch.js';
import {
  state, varStore, varRecall, varPurge, setAngle, setDisplay, setBinaryBase,
  captureCalcState, restoreCalcState, withScratchState, testUserFlag,
  currentPath, goHome,
} from '../www/src/rpl/state.js';
import { Real, Integer } from '../www/src/rpl/types.js';
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
