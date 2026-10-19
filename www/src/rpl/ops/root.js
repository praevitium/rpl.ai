import { RPLError, checkTimeLimit } from '../stack.js';
import { Real, Symbolic, isReal, isInteger, isList, isName, isSymbolic, isProgram } from '../types.js';
import { Bin } from '../algebra.js';
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

register('ROOT', (s) => {
  const [f, name, guess] = s.popN(3);
  if (!(isSymbolic(f) || isProgram(f)) || !isName(name) || !(isList(guess) || isReal(guess) || isInteger(guess))) throw new RPLError('ROOT: Bad argument type');
  const guesses = (isList(guess) ? guess.items : [guess]).map(number);
  if (!guesses.length) throw new RPLError('ROOT: Bad argument value');
  const root = findRoot(sampler(f, name.id, s), guesses);
  storeVar(name.id, Real(root));
  s.push(Real(root));
}, { category: 'CAS / symbolic', categoryOrder: 10.7, label: 'ROOT' });

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

function odeProblem(list, s) {
  if (!isList(list) || list.items.length !== 3) throw new RPLError('Bad argument type');
  const [t, y, given] = list.items;
  const stored = isName(given) ? recallVar(given.id) : null;
  const rhs = isSymbolic(stored) ? stored : given;
  if (!isName(t) || !isName(y) || !(isSymbolic(rhs) || isName(rhs))) throw new RPLError('Bad argument type');
  const saved = [t, y].map((name) => {
    const v = recallVar(name.id);
    if (v === undefined) throw new RPLError(`Undefined name: ${name.id}`);
    return v;
  });
  const store = (tv, yv) => {
    storeVar(t.id, Real(tv));
    storeVar(y.id, Real(yv));
  };
  const f = (tv, yv) => {
    store(tv, yv);
    const depth = s.depth;
    s.push(rhs);
    lookup('→NUM').fn(s);
    const v = s.depth === depth + 1 ? s.pop() : null;
    while (s.depth > depth) s.pop();
    if (!v || !(isReal(v) || isInteger(v)) || !Number.isFinite(Number(v.value))) throw new RPLError('Bad argument value');
    return Number(v.value);
  };
  const reset = () => {
    storeVar(t.id, saved[0]);
    storeVar(y.id, saved[1]);
  };
  return { f, t: realArg(saved[0]), y: realArg(saved[1]), store, reset };
}

// Runs a solver on the problem, with t and y put back as they were if it fails.
function solving(list, s, solve) {
  const problem = odeProblem(list, s);
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

const stepFactor = (tol, error) => (error === 0 ? 4 : Math.min(4, Math.max(0.1, 0.8 * (tol / error) ** 0.2)));

// One step no longer than h whose error is within tol, and the step to try next.
function rkfStep(f, t, y, tol, h) {
  for (;;) {
    checkTimeLimit();
    const { delta, error } = rkfTrial(f, t, y, h);
    if (error <= tol) return { h, delta, next: h * stepFactor(tol, error) };
    h *= stepFactor(tol, error);
  }
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
  solving(list, s, ({ f, t, y, store }) => {
    let h = h0 || end - t;
    while (t !== end) {
      const remaining = end - t;
      const step = rkfStep(f, t, y, tol, Math.sign(remaining) * Math.min(Math.abs(h), Math.abs(remaining)));
      y += step.delta;
      t = Math.abs(end - (t + step.h)) <= 1e-12 * Math.max(1, Math.abs(end)) ? end : t + step.h;
      h = step.next;
    }
    store(t, y);
  });
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
