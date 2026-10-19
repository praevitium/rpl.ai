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

// RKF, RKFSTEP and RKFERR on the AUR's y' = 1/(1+T^2) - 2*Y^2, y(0) = 0, whose solution is T/(1+T^2).
{
  const value = (name) => Number(recallVar(name).value);
  runLine("0 'T' STO 0 'Y' STO '1/(1+T^2)-2*Y^2' 'F' STO");
  let s = runLine('{ T Y F } .00001 8 RKF');
  assert(s.depth === 2 && value('T') === 8 && near(value('Y'), 0.123077277659, 1e-8),
    `RKF steps T to 8 and Y to the HP's .123077277659 within 1E-8 (${value('Y')}; exact 8/65)`);
  runLine("0 'T' STO 1 'Y' STO");
  runLine("{ T Y 'Y' } 1E-9 1 RKF");
  assert(near(value('Y'), Math.E, 1e-8), `RKF solves y' = y to e (${value('Y')})`);
  runLine("0 'T' STO 0 'Y' STO");
  s = runLine('{ T Y F } .00001 .5 RKFSTEP');
  const t = value('T');
  assert(t > 0 && t <= 0.5 && near(value('Y'), t / (1 + t * t), 1e-5) && top(s) > 0,
    `RKFSTEP takes one step no longer than .5 within tolerance and gives the next step (${t}, ${top(s)})`);
  runLine("0 'T' STO 0 'Y' STO");
  s = runLine('{ T Y F } .5 RKFERR');
  const [delta, error] = s.snapshot().slice(0, 2).map((v) => Number(v.value)).reverse();
  assert(near(delta, 0.4, 1e-3) && error > 0 && error < 1e-3 && value('T') === 0 && value('Y') === 0,
    `RKFERR gives the change and error estimate of a .5 step and leaves T and Y alone (${delta}, ${error})`);
  assertThrows(() => runLine("{ T Y 'Q' } .00001 1 RKF"), /Bad argument value/, 'RKF: a right-hand side that is no number');
  assert(value('T') === 0, 'a failed RKF puts T back');
  assertThrows(() => runLine("{ T Y } .00001 1 RKF"), /Bad argument type/, 'RKF wants t, y and f in its list');
  runLine('{ T Y F } PURGE');
}
