import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { recallVar } from '../www/src/rpl/ops/internal.js';
import { assert, assertThrows, runLine } from './helpers.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const top = (s) => Number(s.peek().value);

{
  lookup('RAD').fn(new Stack());
  let s = runLine("'X^2-2' 'X' 1 ROOT");
  assert(s.depth === 1 && near(top(s), Math.SQRT2), `ROOT finds the root of X^2-2 from the guess 1 (${top(s)})`);
  assert(near(Number(recallVar('X').value), Math.SQRT2), 'ROOT leaves the root in the variable, as the HP does');
  s = runLine("'X^2-2' 'X' { -3 -1 } ROOT");
  assert(near(top(s), -Math.SQRT2), 'two guesses bracketing the negative root find it');
  s = runLine("'COS(X)=X' 'X' 1 ROOT");
  assert(near(top(s), 0.7390851332151607), `an equation f=g is solved as f-g (${top(s)})`);
  s = runLine("« X 3 - » 'X' 0 ROOT");
  assert(near(top(s), 3), `a program stands in for the expression (${top(s)})`);
  s = runLine("'X^2+1' 'X' 1 ROOT");
  assert(near(top(s), 0, 1e-4), `with no sign change ROOT gives the extremum, as the HP does, within the flat zone of 12-digit reals (${top(s)})`);
  assertThrows(() => runLine("'5' 'X' 1 ROOT"), /ROOT: Constant\?/, 'a function that never changes is Constant?');
  assertThrows(() => runLine("'1/X' 'X' 0 ROOT"), /ROOT: Bad Guess\(es\)/, 'a guess the function cannot take is a bad guess');
  assertThrows(() => runLine("5 'X' 1 ROOT"), /ROOT: Bad argument type/, 'ROOT wants an expression or program');
  assertThrows(() => runLine("'X' 'X' \"a\" ROOT"), /ROOT: Bad argument type/, 'ROOT wants a numeric guess');
  runLine("'X' PURGE");
}
