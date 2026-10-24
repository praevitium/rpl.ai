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
  const { EQ_LIBRARY } = await import('../www/src/rpl/eqlib.js');
  const { parseTyped } = await import('../www/src/rpl/parser.js');
  const err = (src) => { try { runLine(src); return ''; } catch (e) { return e.message; } };
  const known = () => varRecall('Mpar').items[3].items.map((n) => n.id).join();
  const sets = EQ_LIBRARY.flatMap(([, list]) => list);
  assert(EQ_LIBRARY.length === 15 && sets.length === 102 && sets.every(([, eqs]) => eqs.length && eqs.every((e) => isSymbolic(parseTyped(`'${e}'`)[0]))),
    "the library holds the HP's 15 subjects and 102 sets, every set with equations that parse");
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
  runLine('13 1 0 SOLVEQN');
  assert(known() === 'k,q,εsi,ε0' && varRecall('NA') === undefined && formatSource(varRecall('q')) === '1.602176634E-19',
    'SOLVEQN 13 1: PN Step Junctions knows k, q, εsi and ε0 and leaves NA, the acceptor density, a variable');
  runLine('15 3 0 SOLVEQN');
  assert(known() === 'I0' && Number(varRecall('I0').value) === 1e-12, 'SOLVEQN 15 3: Sound Waves knows I0, the reference intensity');
  runLine("1 6 0 SOLVEQN 1000 'P' STO 4 'L' STO 1 'a' STO 0 'M' STO 0 'w' STO 0 'x' STO { P L a M w x } MUSER");
  assert(top(runLine("'V' MROOT")) === 750, 'SOLVEQN 1 6: Simple Shear, V = P*(L-a)/L for a point load');
  runLine("1 10 0 SOLVEQN { P L a w x } MUSER");
  assert(top(runLine("'V' MROOT")) === 1000 && top(runLine("2 'x' STO 'V' MROOT")) === 0, 'SOLVEQN 1 10: Cantilever Shear reads IFTE(x≤a,1,0), the load counts left of it only');
  runLine('3 2 0 SOLVEQN');
  assert(varRecall('EQ').items.length === 10 && known() === 'g', "SOLVEQN 3 2: Bernoulli's Equation holds the HP's ten equations, g known");
  runLine("6 6 0 SOLVEQN 3000 'T' STO 1E-6 'λ1' STO 2E-6 'λ2' STO { T λ1 λ2 } MUSER");
  assert(Math.abs(top(runLine("'f' MROOT")) - top(runLine("'F0λ(2E-6,3000)-F0λ(1E-6,3000)' →NUM"))) < 1e-12, 'SOLVEQN 6 6: Black Body Radiation finds the band fraction f through F0λ');
  runLine("5 6 0 SOLVEQN 1.5 'T' STO 1 'Tc' STO 2 'P' STO 1 'Pc' STO { T Tc P Pc } MUSER");
  assert(Math.abs(top(runLine("'Z' MROOT")) - 0.820633025234) < 1e-9, 'SOLVEQN 5 6: Real Gas Law finds Z through ZFACTOR');
  const { libraryEquation } = await import('../www/src/rpl/ops/eqlib.js');
  assert(isSymbolic(libraryEquation(8, 1, 3)) && /v = v0 \+ a\*t/.test(formatSource(libraryEquation(8, 1, 3))), "libraryEquation gives one equation of a set parsed, for the sheet's tap");
  assert(/Bad argument value/.test(err('99 1 0 SOLVEQN')) && /Bad argument value/.test(err('2 40 0 SOLVEQN')) && /Bad argument type/.test(err("'x' 1 0 SOLVEQN")), 'SOLVEQN refuses an unknown subject or title and a non-number');
  assert(runLine('5 EQNLIB').depth === 1, 'EQNLIB leaves the stack alone; the app opens the sheet through its hook');
  for (const id of ['EQ', 'Mpar', 'g', 'k', 'q', 'εsi', 'ε0', 'I0', 'P', 'L', 'a', 'M', 'w', 'x', 'V', 'T', 'λ1', 'λ2', 'f', 'σ', 'c3', 'Tc', 'Pc', 'Z', 'R']) err(`'${id}' PURGE`);
}

// The solver sheet's side of ROOT: the names of a formula and one solved from the others off the stack.
{
  const { solverNames, solveEquation } = await import('../www/src/rpl/ops/root.js');
  const formula = (src) => runLine(src).peek();
  const names = (src) => solverNames(formula(src).expr).join(' ');
  assert(names("'V=I*R'") === 'V I R' && names("'A*X^2+B*X+C=0'") === 'A X B C' && names("'π*R^2+e*X+i'") === 'R X',
    'solverNames lists a formula\'s names as they are written, the constants π, e and i left out');
  runLine("2 'I' STO 3 'R' STO");
  const volts = solveEquation(formula("'V=I*R'"), 'V', 1);
  assert(near(volts.root, 6) && volts.zero && near(Number(recallVar('V').value), 6), `solveEquation finds V = I*R from the stored I and R, stores it and says it is a zero (${volts.root})`);
  runLine("12 'V' STO");
  const amps = solveEquation(formula("'V=I*R'"), 'I', 7);
  assert(near(amps.root, 4) && amps.zero, `and I from V and R, starting from 7 (${amps.root})`);
  const none = solveEquation(formula("'X^2+1'"), 'X', 1);
  assert(!none.zero && near(none.residual, 1, 1e-4), `a formula with no sign change gives its closest point and says it is no zero (${none.residual})`);
  assertThrows(() => solveEquation(formula("'5'"), 'X', 1), /ROOT: Constant\?/, 'a formula that never changes is Constant?');
  assertThrows(() => solveEquation(formula("'1/X'"), 'X', 0), /ROOT: Bad Guess\(es\)/, 'a starting point the formula cannot take is a bad guess');
  for (const id of ['I', 'R', 'V', 'X']) runLine(`'${id}' PURGE`);
}
