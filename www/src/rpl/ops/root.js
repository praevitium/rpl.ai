import { RPLError } from '../stack.js';
import { Real, Symbolic, isReal, isInteger, isList, isName, isSymbolic, isProgram } from '../types.js';
import { Bin } from '../algebra.js';
import { register, lookup } from './registry.js';
import { storeVar } from './internal.js';

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
