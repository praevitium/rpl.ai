import { recallVar } from '../www/src/rpl/ops/internal.js';
import { testUserFlag } from '../www/src/rpl/state.js';
import { assert, assertThrows, runLine } from './helpers.mjs';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const top = (s) => Number(s.peek().value);

{
  runLine("TVMEND 360 'N' STO 6.5 'I%YR' STO 200000 'PV' STO 0 'FV' STO 12 'PYR' STO");
  let s = runLine("'PMT' TVMROOT");
  assert(s.depth === 1 && near(top(s), -1264.13604699) && near(Number(recallVar('PMT').value), top(s)),
    `TVMROOT solves a 30-year mortgage's monthly payment and stores it in PMT (${top(s)})`);
  s = runLine("-1500 'PMT' STO 'N' TVMROOT");
  assert(near(top(s), 237.119984833), `TVMROOT solves the number of payments (${top(s)})`);
  s = runLine("360 'N' STO 'I%YR' TVMROOT");
  assert(near(top(s), 8.2319777813), `TVMROOT solves the yearly interest rate numerically (${top(s)})`);
  s = runLine("6.5 'I%YR' STO TVMBEG 'PMT' TVMROOT");
  assert(testUserFlag(-14) && near(top(s), -1264.13604699 / (1 + 0.065 / 12), 1e-5),
    `TVMBEG sets flag -14 and puts payments at each period's start (${top(s)})`);
  s = runLine("TVMEND 0 'I%YR' STO 'PMT' TVMROOT");
  assert(!testUserFlag(-14) && near(top(s), -200000 / 360), `TVMEND clears flag -14, and a zero rate spreads the loan evenly (${top(s)})`);
  s = runLine("10 'I%YR' STO 0 'PMT' STO 1000 'PV' STO 10 'N' STO 1 'PYR' STO 'FV' TVMROOT");
  assert(near(top(s), -1000 * 1.1 ** 10, 1e-5), `TVMROOT compounds a deposit yearly (${top(s)})`);
  s = runLine("'I%YR' TVMROOT");
  assert(near(top(s), 10), `and finds the rate back from the future value (${top(s)})`);
  assertThrows(() => runLine("1000 'FV' STO 'I%YR' TVMROOT"), /TVMROOT: No solution/, 'TVMROOT says so when no rate balances the cash flows');
  assertThrows(() => runLine("'PYR' TVMROOT"), /TVMROOT: Bad argument value/, 'TVMROOT solves only N, I%YR, PV, PMT and FV');
  assertThrows(() => runLine('5 TVMROOT'), /TVMROOT: Bad argument type/, 'TVMROOT wants a quoted name');
  runLine("{ N I%YR PV PMT FV PYR } PURGE");
  assertThrows(() => runLine("'PMT' TVMROOT"), /TVMROOT: Undefined Name N/, 'TVMROOT names the first TVM variable it lacks');
}

{
  const { formatSource } = await import('../www/src/rpl/formatter.js');
  const shown = formatSource(runLine("'I%YR' 1 +").peek());
  const back = formatSource(runLine(shown).peek());
  const s = runLine("6.5 'I%YR' STO 'I%YR*2' EVAL");
  assert(shown === '`I%YR + 1`' && back === shown && near(top(s), 13),
    `a formula holding I%YR reads back as typed or pasted, and evaluates (${shown}, ${back}, ${top(s)})`);
  runLine("'I%YR' PURGE");
}

