// Numeric evaluation of a plotted formula. The plot engine and the equation writer both use it, so it sits apart from
// both of them.
import { isNum, evalAst, defaultFnEval } from '../rpl/algebra.js';
import { isTagged, toRealOrThrow } from '../rpl/types.js';
import { varRecall } from '../rpl/state.js';

const CONSTS = Object.freeze({
  pi: Math.PI, π: Math.PI,
  e: Math.E,
});

export function lookupEnv(name, env) {
  if (env && Object.prototype.hasOwnProperty.call(env, name)) return env[name];
  if (env) {
    const lower = String(name).toLowerCase();
    for (const k of Object.keys(env)) {
      if (k.toLowerCase() === lower) return env[k];
    }
  }
  if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
  const folded = String(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CONSTS, folded)) return CONSTS[folded];
  return undefined;
}

function plotFnEval(name, args, opts = {}) {
  if (args.some(a => !Number.isFinite(a))) return NaN;
  const toRad = opts.toRad || (x => x);
  const fromRad = opts.fromRad || (x => x);
  if (args.length === 1) {
    const x = args[0];
    switch (String(name).toUpperCase()) {
      case 'SIN': return Math.sin(toRad(x));
      case 'COS': return Math.cos(toRad(x));
      case 'TAN': return Math.tan(toRad(x));
      case 'ASIN': return x >= -1 && x <= 1 ? fromRad(Math.asin(x)) : NaN;
      case 'ACOS': return x >= -1 && x <= 1 ? fromRad(Math.acos(x)) : NaN;
      case 'ATAN': return fromRad(Math.atan(x));
      default: break;
    }
  }
  const folded = defaultFnEval(name, args);
  return Number.isFinite(folded) ? folded : NaN;
}

// As on the HP, a name the plot doesn't bind evaluates to the number its variable holds.
export function storedNumber(name) {
  const value = varRecall(name);
  if (!value) return null;
  try {
    const n = toRealOrThrow(isTagged(value) ? value.value : value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function evalNumeric(ast, env, opts = {}) {
  const node = evalAst(
    ast,
    (name) => {
      const v = lookupEnv(name, env);
      return Number.isFinite(v) ? v : storedNumber(name);
    },
    (name, args) => plotFnEval(name, args, opts),
  );
  return isNum(node) && Number.isFinite(node.value) ? node.value : NaN;
}
