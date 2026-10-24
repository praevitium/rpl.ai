import { Stack, RPLError, checkTimeLimit } from '../stack.js';
import { Real, Symbolic, Name, Str, RList, isReal, isInteger, isList, isName, isString, isSymbolic, isProgram } from '../types.js';
import { Bin, freeVars } from '../algebra.js';
import { register, lookup } from './registry.js';
import { storeVar, recallVar } from './internal.js';

const ROOT_STEPS = 200;

function number(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('ROOT: Bad argument type');
  return Number(v.value);
}

// As on the HP, each trial value goes into the variable and the expression or program is evaluated numerically, so
// other variables and user functions count; an equation f=g is solved as f-g, and a trial the function cannot take
// is a bad guess.
function sampler(f, name, s) {
  const expr = isSymbolic(f) && f.expr.kind === 'bin' && f.expr.op === '=' ? Symbolic(Bin('-', f.expr.l, f.expr.r)) : f;
  return (x) => {
    storeVar(name, Real(x));
    const depth = s.depth;
    s.push(expr);
    try { lookup('→NUM').fn(s); } catch (e) { throw new RPLError('ROOT: Bad Guess(es)'); }
    const v = s.depth === depth + 1 ? s.pop() : null;
    while (s.depth > depth) s.pop();
    const y = v && (isReal(v) || isInteger(v)) ? Number(v.value) : NaN;
    if (!Number.isFinite(y)) throw new RPLError('ROOT: Bad Guess(es)');
    return y;
  };
}

// Illinois steps keep a sign change bracketed and close in fast.
function bracketed(fx, a, b, fa, fb) {
  let side = 0;
  for (let i = 0; i < ROOT_STEPS; i++) {
    const x = (fa * b - fb * a) / (fa - fb);
    const y = fx(x);
    if (y === 0 || Math.abs(b - a) <= 1e-14 * Math.max(1, Math.abs(x))) return x;
    if (y * fb > 0) { b = x; fb = y; if (side === -1) fa /= 2; side = -1; }
    else { a = x; fa = y; if (side === 1) fb /= 2; side = 1; }
  }
  return Math.abs(fa) < Math.abs(fb) ? a : b;
}

// Without a sign change the nearest extremum stands in, as on the HP: the smallest |f| by golden section.
function extremum(fx, x0, span) {
  let a = x0 - span, b = x0 + span;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = Math.abs(fx(c)), fd = Math.abs(fx(d));
  for (let i = 0; i < ROOT_STEPS && Math.abs(b - a) > 1e-13 * Math.max(1, Math.abs(a)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = Math.abs(fx(c)); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = Math.abs(fx(d)); }
  }
  return (a + b) / 2;
}

// Secant steps from the guesses, each bounded to a hundred times the last, until a sign change is bracketed.
export function findRoot(fx, guesses) {
  let a = guesses[0];
  let b = guesses.length > 1 ? guesses[guesses.length - 1] : a;
  if (b === a) b = a + (Math.abs(a) || 1) * 1e-3;
  let fa = fx(a), fb = fx(b);
  let constant = fa === fb;
  for (let i = 0; i < ROOT_STEPS; i++) {
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb < 0) return bracketed(fx, a, b, fa, fb);
    const span = Math.abs(b - a) || (Math.abs(b) || 1) * 1e-3;
    let x = fb === fa ? b + 2 * (b - a || span) : b - fb * (b - a) / (fb - fa);
    if (!Number.isFinite(x) || Math.abs(x - b) > 100 * span) x = b + Math.sign(x - b || 1) * 100 * span;
    const y = fx(x);
    constant = constant && y === fa;
    if (Math.abs(y) <= Math.abs(fb)) { a = b; fa = fb; b = x; fb = y; } else { a = x; fa = y; }
    if (Math.abs(b - a) <= 1e-13 * Math.max(1, Math.abs(b))) break;
  }
  if (constant) throw new RPLError('ROOT: Constant?');
  const best = Math.abs(fa) < Math.abs(fb) ? a : b;
  return extremum(fx, best, Math.abs(b - a) || (Math.abs(best) || 1));
}

// The root, how far the function is from zero there (NaN where it cannot be taken) and whether that is a zero: a million
// times closer than it is a hair away.
function rootAndResidual(f, name, guesses, s) {
  const fx = sampler(f, name, s);
  const root = findRoot(fx, guesses);
  let residual = NaN, nearby = NaN;
  try {
    residual = Math.abs(fx(root));
    nearby = Math.abs(fx(root + 1e-6 * Math.max(1, Math.abs(root))));
  } catch { /* the root stands without it */ }
  return { root, residual, zero: residual === 0 || residual <= 1e-6 * nearby };
}

register('ROOT', (s) => {
  const [f, name, guess] = s.popN(3);
  if (!(isSymbolic(f) || isProgram(f)) || !isName(name) || !(isList(guess) || isReal(guess) || isInteger(guess))) throw new RPLError('ROOT: Bad argument type');
  const guesses = (isList(guess) ? guess.items : [guess]).map(number);
  if (!guesses.length) throw new RPLError('ROOT: Bad argument value');
  const { root } = rootAndResidual(f, name.id, guesses, s);
  storeVar(name.id, Real(root));
  s.push(Real(root));
}, { category: 'CAS / symbolic', categoryOrder: 10.7, label: 'ROOT' });

// The solver sheet's side of ROOT: the names an equation holds, in the order they are written.
export function solverNames(expr) {
  return [...freeVars(expr)].filter((name) => !MES_CONSTANTS.has(name));
}

// One name solved from the others' stored values, from a starting point, as ROOT does but off the stack.
export function solveEquation(f, name, guess) {
  const found = rootAndResidual(f, name, [guess], new Stack());
  storeVar(name, Real(found.root));
  return found;
}

// A set of equations solved for one name from the values stored under the names in known, as MROOT does: each pass finds,
// from the variable's own value or 1, an unknown that an equation is left with alone, until the name itself is found.
// The names found along the way come back in order, the one asked for last.
export function solveInSet(eqs, name, known) {
  const unknown = new Set(mesItems(eqs).filter((id) => id === name || !known.includes(id)));
  const found = [];
  while (unknown.has(name)) {
    checkTimeLimit();
    const step = eqs.map((eq) => [eq, mesNames(eq).filter((id) => unknown.has(id))]).find(([, ids]) => ids.length === 1);
    if (!step) throw new RPLError('Too Many Unknowns');
    const [eq, [id]] = step;
    const start = recallVar(id);
    try {
      found.push({ name: id, ...solveEquation(eq, id, isReal(start) || isInteger(start) ? Number(start.value) : 1) });
    } catch (e) {
      throw Object.assign(e, { solving: id });
    }
    unknown.delete(id);
  }
  return found;
}

// The multiple-equation solver keeps its state in Mpar as a list anyone can read: { equations "title" { menu order,
// "" for a blank key } { known variables } }. The HP's Mpar is opaque library data.
const MES_CONSTANTS = new Set(['π', 'e', 'i', '∞']);

function mesNames(eq) {
  return [...freeVars(eq.expr)].filter((name) => !MES_CONSTANTS.has(name));
}

function mesFromEq(cmd) {
  const eq = recallVar('EQ');
  if (eq === undefined) throw new RPLError('Undefined name: EQ');
  if (!isList(eq) || !eq.items.every(isSymbolic)) throw new RPLError(`${cmd}: EQ Invalid for MINIT`);
  if (eq.items.length < 2) throw new RPLError(`${cmd}: Single Equation`);
  const items = [...new Set(eq.items.flatMap(mesNames))].map((id) => Name(id));
  return { eqs: eq.items, title: '', items, known: [] };
}

function mesRead(cmd) {
  const mpar = recallVar('Mpar');
  if (mpar === undefined) return null;
  const [eqs, title, items, known] = isList(mpar) ? mpar.items : [];
  const valid = isList(eqs) && eqs.items.every(isSymbolic) && isString(title) && isList(items)
    && items.items.every((v) => isName(v) || (isString(v) && !v.value)) && isList(known) && known.items.every(isName);
  if (!valid || mpar.items.length !== 4) throw new RPLError(`${cmd}: Invalid Mpar`);
  return { eqs: eqs.items, title: title.value, items: items.items, known: known.items.map((n) => n.id) };
}

// Mpar stays as it is until MINIT starts again from EQ; without one, the commands make it from EQ first.
function mesState(cmd) {
  return mesRead(cmd) ?? mesWrite(mesFromEq(cmd));
}

function mesWrite(mes) {
  storeVar('Mpar', RList([RList(mes.eqs), Str(mes.title), RList(mes.items), RList(mes.known.map((id) => Name(id)))]));
  return mes;
}

export function mesPrepare() {
  mesState('MSOLVR');
}

// The Equation Library's sets arrive with their title and their constants known.
export function mesItems(eqs) {
  return [...new Set(eqs.flatMap(mesNames))];
}

export function mesSetup(eqs, title, known) {
  const items = mesItems(eqs).map((id) => Name(id));
  return mesWrite({ eqs, title, items, known });
}

const mesVars = (mes) => mes.items.filter(isName).map((n) => n.id);

// The solver's menu: its title, keys in order (null for a blank) and which are known; null without Mpar.
export function mesMenu() {
  try {
    const mes = mesRead('MSOLVR');
    return mes && { title: mes.title, keys: mes.items.map((v) => (isName(v) ? v.id : null)), known: new Set(mes.known) };
  } catch {
    return null;
  }
}

function mesTargets(arg, mes, cmd) {
  const vars = mesVars(mes);
  let ids;
  if (isString(arg) && arg.value.toUpperCase() === 'ALL') ids = vars;
  else if (isName(arg)) ids = [arg.id];
  else if (isList(arg) && arg.items.every(isName)) ids = arg.items.map((n) => n.id);
  else throw new RPLError(`${cmd}: Bad argument type`);
  if (!ids.every((id) => vars.includes(id))) throw new RPLError(`${cmd}: Bad argument value`);
  return ids;
}

register('MINIT', () => {
  mesWrite(mesFromEq('MINIT'));
}, { category: 'CAS / symbolic', categoryOrder: 10.71, label: 'MINIT' });

register('MITM', (s) => {
  const [title, list] = s.popN(2);
  if (!isString(title) || !isList(list)) throw new RPLError('MITM: Bad argument type');
  const mes = mesState('MITM');
  const names = list.items.filter((v) => !(isString(v) && !v.value));
  const ids = names.map((n) => (isName(n) ? n.id : null));
  const vars = mesVars(mes);
  if (ids.length !== vars.length || new Set(ids).size !== ids.length || !ids.every((id) => vars.includes(id))) throw new RPLError('MITM: Bad argument value');
  mesWrite({ ...mes, title: title.value, items: list.items.map((v) => (isName(v) ? Name(v.id) : v)) });
}, { category: 'CAS / symbolic', categoryOrder: 10.72, label: 'MITM' });

function markKnown(cmd, known) {
  return (s) => {
    const [arg] = s.popN(1);
    const mes = mesState(cmd);
    const ids = new Set(mesTargets(arg, mes, cmd));
    const marked = mesVars(mes).filter((id) => (ids.has(id) ? known : mes.known.includes(id)));
    mesWrite({ ...mes, known: marked });
  };
}

register('MUSER', markKnown('MUSER', true), { category: 'CAS / symbolic', categoryOrder: 10.73, label: 'MUSER' });
register('MCALC', markKnown('MCALC', false), { category: 'CAS / symbolic', categoryOrder: 10.74, label: 'MCALC' });

// Each pass solves, by ROOT from the variable's own value, an equation left with one unknown; the known variables are
// those marked user-defined, and the one asked for is solved even if it was marked.
function mesSolveFor(s, eq, id, cmd) {
  for (const other of mesNames(eq)) {
    if (other !== id && recallVar(other) === undefined) throw new RPLError(`${cmd}: Undefined Name ${other}`);
  }
  const guess = recallVar(id);
  s.push(eq);
  s.push(Name(id, { quoted: true }));
  s.push(isReal(guess) || isInteger(guess) ? guess : Real(1));
  try {
    lookup('ROOT').fn(s);
  } catch (e) {
    throw new RPLError(e.message.replace(/^ROOT:/, `${cmd}:`));
  }
  return s.pop();
}

register('MROOT', (s) => {
  const [arg] = s.popN(1);
  const mes = mesState('MROOT');
  const all = isString(arg) && arg.value.toUpperCase() === 'ALL';
  if (!all && !isName(arg)) throw new RPLError('MROOT: Bad argument type');
  const [target] = all ? [null] : mesTargets(arg, mes, 'MROOT');
  const known = mes.known.filter((id) => id !== target);
  const unknown = new Set(mesVars(mes).filter((id) => !known.includes(id)));
  if (!unknown.size) throw new RPLError('MROOT: All Variables Known');
  let found = null;
  while (target ? unknown.has(target) : unknown.size) {
    checkTimeLimit();
    const step = mes.eqs.map((eq) => [eq, mesNames(eq).filter((id) => unknown.has(id))]).find(([, ids]) => ids.length === 1);
    if (!step) throw new RPLError('MROOT: Too Many Unknowns');
    const [eq, [id]] = step;
    found = mesSolveFor(s, eq, id, 'MROOT');
    unknown.delete(id);
  }
  if (known.length !== mes.known.length) mesWrite({ ...mes, known });
  if (target) s.push(found);
}, { category: 'CAS / symbolic', categoryOrder: 10.75, label: 'MROOT' });

// RKF, RKFSTEP and RKFERR solve y' = f(t,y) by Runge–Kutta–Fehlberg 4(5). As on the HP, t and y live in their
// variables and f is evaluated numerically with them stored; a step's error is |y5 - y4|, and y moves by the
// fifth-order estimate, which brings the AUR's example within 2E-9 of the HP's answer.
const FEHLBERG = [
  [1 / 4, [1 / 4]],
  [3 / 8, [3 / 32, 9 / 32]],
  [12 / 13, [1932 / 2197, -7200 / 2197, 7296 / 2197]],
  [1, [439 / 216, -8, 3680 / 513, -845 / 4104]],
  [1 / 2, [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40]],
];
const FIFTH_ORDER = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55];
const ERROR_WEIGHTS = [1 / 360, 0, -128 / 4275, -2197 / 75240, 1 / 50, 2 / 55];

function realArg(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('Bad argument type');
  return Number(v.value);
}

// The list holds t, y and f, and for the Rosenbrock commands ∂f/∂y and ∂f/∂t too; each may be a name holding it.
function odeProblem(list, s, size = 3) {
  if (!isList(list) || list.items.length !== size) throw new RPLError('Bad argument type');
  const [t, y, ...given] = list.items;
  const exprs = given.map((g) => {
    const stored = isName(g) ? recallVar(g.id) : null;
    return isSymbolic(stored) ? stored : g;
  });
  const usable = (e, i) => isSymbolic(e) || isName(e) || (i > 0 && (isReal(e) || isInteger(e)));
  if (!isName(t) || !isName(y) || !exprs.every(usable)) throw new RPLError('Bad argument type');
  const saved = [t, y].map((name) => {
    const v = recallVar(name.id);
    if (v === undefined) throw new RPLError(`Undefined name: ${name.id}`);
    return v;
  });
  const store = (tv, yv) => {
    storeVar(t.id, Real(tv));
    storeVar(y.id, Real(yv));
  };
  const evaluator = (expr) => (tv, yv) => {
    store(tv, yv);
    const depth = s.depth;
    s.push(expr);
    lookup('→NUM').fn(s);
    const v = s.depth === depth + 1 ? s.pop() : null;
    while (s.depth > depth) s.pop();
    if (!v || !(isReal(v) || isInteger(v)) || !Number.isFinite(Number(v.value))) throw new RPLError('Bad argument value');
    return Number(v.value);
  };
  const [f, fy, ft] = exprs.map(evaluator);
  const reset = () => {
    storeVar(t.id, saved[0]);
    storeVar(y.id, saved[1]);
  };
  return { f, fy, ft, t: realArg(saved[0]), y: realArg(saved[1]), store, reset };
}

// Runs a solver on the problem, with t and y put back as they were if it fails.
function solving(list, s, solve, size = 3) {
  const problem = odeProblem(list, s, size);
  try {
    solve(problem);
  } catch (e) {
    problem.reset();
    throw e;
  }
}

// Below the HP's smallest step for t, Euler's method stands in and the step counts as within tolerance.
const tooSmall = (h, t) => Math.abs(h) <= Math.max(1.3e-10 * Math.abs(t), 1e-300);

function rkfTrial(f, t, y, h) {
  if (tooSmall(h, t)) return { delta: h * f(t, y), error: 0 };
  const k = [h * f(t, y)];
  for (const [c, a] of FEHLBERG) k.push(h * f(t + c * h, y + a.reduce((sum, ai, i) => sum + ai * k[i], 0)));
  const weigh = (w) => w.reduce((sum, wi, i) => sum + wi * k[i], 0);
  return { delta: weigh(FIFTH_ORDER), error: Math.abs(weigh(ERROR_WEIGHTS)) };
}

const stepFactor = (tol, error, power) => (error === 0 ? 4 : Math.min(4, Math.max(0.1, 0.8 * (tol / error) ** power)));

// One step no longer than h whose error is within tol, and the step to try next.
function adaptiveStep(trial, power, tol, h) {
  for (;;) {
    checkTimeLimit();
    const { delta, error } = trial(h);
    if (error <= tol) return { h, delta, next: h * stepFactor(tol, error, power) };
    h *= stepFactor(tol, error, power);
  }
}

const rkfStep = (f, t, y, tol, h) => adaptiveStep((step) => rkfTrial(f, t, y, step), 0.2, tol, h);

// Steps from t to end, each step's length capped by what remains, and stores where it ends.
function march({ t, y, store }, end, h, stepAt) {
  while (t !== end) {
    const remaining = end - t;
    const step = stepAt(t, y, Math.sign(remaining) * Math.min(Math.abs(h), Math.abs(remaining)));
    y += step.delta;
    t = Math.abs(end - (t + step.h)) <= 1e-12 * Math.max(1, Math.abs(end)) ? end : t + step.h;
    h = step.next;
  }
  store(t, y);
}

function tolerance(v) {
  if (!isList(v)) return { tol: realArg(v), h: null };
  if (v.items.length !== 2) throw new RPLError('Bad argument value');
  return { tol: realArg(v.items[0]), h: realArg(v.items[1]) };
}

register('RKF', (s) => {
  const [list, tolArg, endArg] = s.popN(3);
  const { tol, h: h0 } = tolerance(tolArg);
  const end = realArg(endArg);
  solving(list, s, (p) => march(p, end, h0 || end - p.t, (t, y, h) => rkfStep(p.f, t, y, tol, h)));
  s.push(list);
  s.push(tolArg);
}, { category: 'CAS / symbolic', categoryOrder: 10.8, label: 'RKF' });

register('RKFSTEP', (s) => {
  const [list, tolArg, hArg] = s.popN(3);
  const tol = realArg(tolArg);
  const h = realArg(hArg);
  let next;
  solving(list, s, ({ f, t, y, store }) => {
    const step = rkfStep(f, t, y, tol, h);
    store(t + step.h, y + step.delta);
    next = step.next;
  });
  s.push(list);
  s.push(tolArg);
  s.push(Real(next));
}, { category: 'CAS / symbolic', categoryOrder: 10.81, label: 'RKFSTEP' });

// RKFERR tries one step of h and leaves t and y as they were.
register('RKFERR', (s) => {
  const [list, hArg] = s.popN(2);
  const h = realArg(hArg);
  let trial;
  solving(list, s, ({ f, t, y, reset }) => {
    trial = rkfTrial(f, t, y, h);
    reset();
  });
  s.push(list);
  s.push(hArg);
  s.push(Real(trial.delta));
  s.push(Real(trial.error));
}, { category: 'CAS / symbolic', categoryOrder: 10.82, label: 'RKFERR' });


// RRK, RRKSTEP and RSBERR add Kaps and Rentrop's fourth-order Rosenbrock method, with its third-order error estimate,
// for stiff problems; the list gives ∂f/∂y and ∂f/∂t.
const KAPS_RENTROP = {
  gamma: 1 / 2, a21: 2, a31: 48 / 25, a32: 6 / 25, c21: -8, c31: 372 / 25, c32: 12 / 5,
  c41: -112 / 125, c42: -54 / 125, c43: -2 / 5, c2: 1, c3: 3 / 5,
  b: [19 / 9, 1 / 2, 25 / 108, 125 / 108], e: [17 / 54, 7 / 36, 0, 125 / 108], d: [1 / 2, -3 / 2, 121 / 50, 29 / 250],
};

function rosenbrockTrial({ f, fy, ft }, t, y, h) {
  if (Math.abs(h) <= Math.max(2.5e-11 * Math.abs(t), 1e-300)) return { delta: h * f(t, y), error: 0 };
  const k = KAPS_RENTROP, dfdt = ft(t, y), a = 1 / (k.gamma * h) - fy(t, y);
  const g1 = (f(t, y) + h * k.d[0] * dfdt) / a;
  const g2 = (f(t + k.c2 * h, y + k.a21 * g1) + h * k.d[1] * dfdt + k.c21 * g1 / h) / a;
  const f3 = f(t + k.c3 * h, y + k.a31 * g1 + k.a32 * g2);
  const g3 = (f3 + h * k.d[2] * dfdt + (k.c31 * g1 + k.c32 * g2) / h) / a;
  const g4 = (f3 + h * k.d[3] * dfdt + (k.c41 * g1 + k.c42 * g2 + k.c43 * g3) / h) / a;
  const weigh = (w) => w[0] * g1 + w[1] * g2 + w[2] * g3 + w[3] * g4;
  return { delta: weigh(k.b), error: Math.abs(weigh(k.e)) };
}

// Rosenbrock's method (2) where the step is stiff, |h·∂f/∂y| past Runge–Kutta–Fehlberg's stability range of about 3,
// else RKF (1); the AUR names no rule of its own.
const STIFF = 3;
const RKF_METHOD = 1, ROSENBROCK_METHOD = 2;

function mixedStep(p, t, y, tol, h) {
  const method = Math.abs(h * p.fy(t, y)) > STIFF ? ROSENBROCK_METHOD : RKF_METHOD;
  const step = method === ROSENBROCK_METHOD
    ? adaptiveStep((trial) => rosenbrockTrial(p, t, y, trial), 0.25, tol, h)
    : rkfStep(p.f, t, y, tol, h);
  return { ...step, method };
}

register('RRK', (s) => {
  const [list, tolArg, endArg] = s.popN(3);
  const { tol, h: h0 } = tolerance(tolArg);
  const end = realArg(endArg);
  solving(list, s, (p) => march(p, end, h0 || end - p.t, (t, y, h) => mixedStep(p, t, y, tol, h)), 5);
  s.push(list);
  s.push(tolArg);
}, { category: 'CAS / symbolic', categoryOrder: 10.83, label: 'RRK' });

// The last method used is taken but plays no part here.
register('RRKSTEP', (s) => {
  const [list, tolArg, hArg, lastArg] = s.popN(4);
  const tol = realArg(tolArg);
  const h = realArg(hArg);
  realArg(lastArg);
  let step;
  solving(list, s, (p) => {
    step = mixedStep(p, p.t, p.y, tol, h);
    p.store(p.t + step.h, p.y + step.delta);
  }, 5);
  s.push(list);
  s.push(tolArg);
  s.push(Real(step.next));
  s.push(Real(step.method));
}, { category: 'CAS / symbolic', categoryOrder: 10.84, label: 'RRKSTEP' });

// RSBERR tries one Rosenbrock step of h and leaves t and y as they were; an error of 0 means Euler's method stood in.
register('RSBERR', (s) => {
  const [list, hArg] = s.popN(2);
  const h = realArg(hArg);
  let trial;
  solving(list, s, (p) => {
    trial = rosenbrockTrial(p, p.t, p.y, h);
    p.reset();
  }, 5);
  s.push(list);
  s.push(hArg);
  s.push(Real(trial.delta));
  s.push(Real(trial.error));
}, { category: 'CAS / symbolic', categoryOrder: 10.85, label: 'RSBERR' });
