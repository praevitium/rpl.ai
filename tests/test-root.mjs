import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { recallVar } from '../www/src/rpl/ops/internal.js';
import { format } from '../www/src/rpl/formatter.js';
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

// RRK, RRKSTEP and RSBERR: the AUR's example with its partial derivatives, and a stiff problem Rosenbrock's method takes.
{
  const value = (name) => Number(recallVar(name).value);
  runLine("0 'T' STO 0 'Y' STO '1/(1+T^2)-2*Y^2' 'F' STO '-4*Y' 'FY' STO '-2*T/(1+T^2)^2' 'FT' STO");
  let s = runLine('{ T Y F FY FT } .00001 8 RRK');
  assert(s.depth === 2 && value('T') === 8 && near(value('Y'), 8 / 65, 1e-5),
    `RRK steps T to 8 and Y to 8/65 within the tolerance (${value('Y')})`);
  runLine("0 'T' STO 0 'Y' STO");
  runLine("{ T Y '-1000*(Y-COS(T))' -1000 '-1000*SIN(T)' } 1E-6 1 RRK");
  const stiff = (Math.cos(1) * 1e6 + 1000 * Math.sin(1)) / (1e6 + 1);
  assert(near(value('Y'), stiff, 1e-5), `RRK solves the stiff y' = -1000(y - cos t) (${value('Y')}, ${stiff})`);
  runLine("0 'T' STO 0 'Y' STO");
  s = runLine('{ T Y F FY FT } .00001 .5 0 RRKSTEP');
  assert(s.depth === 4 && top(s) === 1 && value('T') > 0 && value('T') <= 0.5, 'RRKSTEP takes a Runge–Kutta–Fehlberg step where the problem is not stiff');
  runLine("0 'T' STO 0 'Y' STO");
  s = runLine("{ T Y '-1000*(Y-COS(T))' -1000 '-1000*SIN(T)' } 1E-6 .1 0 RRKSTEP");
  assert(top(s) === 2, 'RRKSTEP names Rosenbrock\'s method, 2, where the step is stiff');
  runLine("0 'T' STO 0 'Y' STO");
  s = runLine('{ T Y F FY FT } .1 RSBERR');
  assert(s.depth === 4 && value('T') === 0 && value('Y') === 0 && near(Number(s.peek(2).value), 0.1 / 1.01 * 1.0, 1e-3) && top(s) > 0,
    'RSBERR gives the change over one step and its error, leaving T and Y');
  assertThrows(() => runLine('{ T Y F FY } .1 RSBERR'), /Bad argument type/, 'RSBERR wants five items in its list');
  ['T', 'Y', 'F', 'FY', 'FT'].forEach((n) => runLine(`'${n}' PURGE`));
}

// The multiple-equation solver: MINIT reads EQ into Mpar, MUSER marks the known variables, and MROOT solves an
// equation at a time, each left with one unknown, until it reaches the one asked for.
{
  const value = (name) => Number(recallVar(name).value);
  const mpar = () => format(recallVar('Mpar'));
  runLine("{ 'V=V0+A*T' 'X=V0*T+A*T^2/2' } STEQ MINIT");
  assert(mpar() === '{ { `V = V0 + A*T` `X = V0*T + A*T^2/2` } "" { V V0 A T X } {  } }',
    `MINIT puts EQ's equations and their variables, in order of first use, in Mpar (${mpar()})`);
  runLine("0 'V0' STO 2 'A' STO 10 'X' STO { V0 A X } MUSER");
  let s = runLine("'V' MROOT");
  assert(s.depth === 1 && near(top(s), Math.sqrt(40)) && near(value('T'), Math.sqrt(10)),
    `MROOT solves X's equation for T, then V's for V (${top(s)}, T ${value('T')})`);
  s = runLine("3 'X' STO 'X' MUSER \"ALL\" MROOT");
  assert(s.depth === 0 && near(value('T'), Math.sqrt(3)) && near(value('V'), 2 * Math.sqrt(3)), 'MROOT "ALL" stores every unknown and returns nothing');
  runLine("'A' MCALC 4 'T' STO 'T' MUSER");
  s = runLine("'A' MROOT");
  assert(near(top(s), 0.375) && mpar().endsWith('{ V0 T X } }'), `MCALC makes A an unknown again for MROOT (${top(s)}, ${mpar()})`);
  s = runLine("'A' MUSER 'X' MROOT");
  assert(near(top(s), 3) && mpar().endsWith('{ V0 A T } }'), 'MROOT solves a known variable when asked for it, and it is no longer known');
  runLine("\"Motion\" { T \"\" V X V0 A } MITM");
  assert(mpar().includes('"Motion" { T "" V X V0 A }'), 'MITM sets the menu title and order, "" for a blank key');
  assertThrows(() => runLine('"M" { T V } MITM'), /MITM: Bad argument value/, 'MITM wants every variable of the menu and no other');
  assertThrows(() => runLine('"ALL" MUSER "ALL" MROOT'), /MROOT: All Variables Known/, 'MROOT "ALL" with every variable known');
  assertThrows(() => runLine('"ALL" MCALC "ALL" MROOT'), /MROOT: Too Many Unknowns/, 'no equation left with a single unknown');
  assertThrows(() => runLine("'Q' MUSER"), /MUSER: Bad argument value/, 'MUSER wants a variable of Mpar');
  assertThrows(() => runLine('5 MCALC'), /MCALC: Bad argument type/, 'MCALC wants a name, a list or "ALL"');
  assertThrows(() => runLine('{ V } MROOT'), /MROOT: Bad argument type/, 'MROOT wants a name or "ALL"');
  runLine("{ 'A=B' } STEQ");
  assert(mpar().includes('"Motion"'), 'Mpar stays as it is when EQ changes, until MINIT');
  assertThrows(() => runLine('MINIT'), /MINIT: Single Equation/, 'MINIT wants more than one equation');
  assertThrows(() => runLine("'A' STEQ MINIT"), /MINIT: EQ Invalid for MINIT/, 'MINIT wants a list of equations in EQ');
  runLine("{ 'P*V=N*R*T' 'N=M/W' } STEQ 'Mpar' PURGE 8.314 'R' STO 300 'T' STO 1 'V' STO 32 'W' STO 64 'M' STO { R T V W M } MUSER");
  s = runLine("'P' MROOT");
  assert(near(top(s), 2 * 8.314 * 300, 1e-6), `without Mpar, MUSER makes it from EQ first (${top(s)})`);
  runLine("{ V V0 A T X P N R W M EQ Mpar } PURGE");
}

// SOLVEQN and EQNLIB: the Equation Library.
{
  const { varRecall } = await import('../www/src/rpl/state.js');
  const { formatSource } = await import('../www/src/rpl/formatter.js');
  const { isList, isSymbolic } = await import('../www/src/rpl/types.js');
  const err = (src) => { try { runLine(src); return ''; } catch (e) { return e.message; } };
  const known = () => varRecall('Mpar').items[3].items.map((n) => n.id).join();
  runLine('8 1 0 SOLVEQN');
  const eq = varRecall('EQ'), mpar = varRecall('Mpar');
  assert(isList(eq) && eq.items.length === 4 && /v = v0 \+ a\*t/.test(formatSource(eq.items[3])), 'SOLVEQN 8 1: Motion, Linear Motion puts its four equations in EQ');
  assert(isList(mpar) && mpar.items[1].value === 'Linear Motion' && mpar.items[3].items.length === 0, "SOLVEQN titles Mpar after the set; Linear Motion has no constants to mark known");
  runLine('8 2 0 SOLVEQN');
  assert(known() === 'g' && formatSource(varRecall('g')) === '9.80665', 'SOLVEQN 8 2: Object in Free Fall stores g as a plain SI number and marks it known');
  runLine('2 9 0 SOLVEQN');
  assert(isSymbolic(varRecall('EQ')) && /E = 1\/2\*C\*V\^2/.test(formatSource(varRecall('EQ'))), "SOLVEQN 2 9: Electricity, Capacitive Energy, the AUR's example, puts its one equation in EQ as itself");
  runLine('2 2 0 SOLVEQN');
  assert(known() === '' && varRecall('R') === undefined, "SOLVEQN 2 2: Ohm's Law leaves R a variable to solve for, not the gas constant");
  runLine('1 2 0 SOLVEQN');
  assert(known() === '' && varRecall('c') === undefined, "SOLVEQN 1 2: Eccentric Columns' c is a distance, not the speed of light");
  runLine('14 1 0 SOLVEQN');
  assert(known() === '' && varRecall('σ') === undefined, "SOLVEQN 14 1: Normal Stress solves for σ, not the Stefan-Boltzmann constant");
  runLine('15 3 0 SOLVEQN');
  assert(known() === 'I0' && Number(varRecall('I0').value) === 1e-12, 'SOLVEQN 15 3: Sound Waves knows I0, the reference intensity');
  assert(/Bad argument value/.test(err('99 1 0 SOLVEQN')) && /Bad argument value/.test(err('2 40 0 SOLVEQN')) && /Bad argument type/.test(err("'x' 1 0 SOLVEQN")), 'SOLVEQN refuses an unknown subject or title and a non-number');
  assert(/not in the library yet/.test(err('13 1 0 SOLVEQN')), 'SOLVEQN names a set the library does not hold yet');
  assert(runLine('5 EQNLIB').depth === 1, 'EQNLIB leaves the stack alone; the app opens the sheet through its hook');
  for (const id of ['EQ', 'Mpar', 'g', 'I0']) err(`'${id}' PURGE`);
}
