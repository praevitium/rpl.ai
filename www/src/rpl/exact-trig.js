// The HP's exact mode gives SIN, COS and TAN their closed forms at multiples of 30 and 45 degrees,
// and ASIN, ACOS and ATAN the angles back: 30 SIN in DEG is 1/2, 'SIN(π/4)' EVAL is √2/2, 1 ASIN in RAD is π/2.
import { Num, Var, Neg, Bin, Fn, exactRational, astEqual } from './algebra.js';

const HALF = Bin('/', Num(1n), Num(2n));
const root = (n) => Fn('SQRT', [Num(n)]);
const over = (a, n) => Bin('/', a, Num(n));
const R2_2 = over(root(2n), 2n);
const R3_2 = over(root(3n), 2n);
const R3_3 = over(root(3n), 3n);
const ZERO = Num(0n);
const ONE = Num(1n);

// The sine of each multiple of 30 and of 45 degrees, signs kept apart: [negative, value].
const SIN_30 = [[0, ZERO], [0, HALF], [0, R3_2], [0, ONE], [0, R3_2], [0, HALF], [0, ZERO], [1, HALF], [1, R3_2], [1, ONE], [1, R3_2], [1, HALF]];
const SIN_45 = [[0, ZERO], [0, R2_2], [0, ONE], [0, R2_2], [0, ZERO], [1, R2_2], [1, ONE], [1, R2_2]];
const TAN_30 = [[0, ZERO], [0, R3_3], [0, root(3n)], null, [1, root(3n)], [1, R3_3]];
const TAN_45 = [[0, ZERO], [0, ONE], null, [1, ONE]];

const TURN = { DEG: 360n, GRD: 400n };

const signed = ([negative, ast]) => (negative && !astEqual(ast, ZERO) ? Neg(ast) : ast);
const mod = (a, n) => ((a % n) + n) % n;

// π times a fraction: π, k*π, π/n, k*π/n, or the negative of one, as [k, n].
function piMultiple(ast) {
  if (ast.kind === 'neg') {
    const r = piMultiple(ast.arg);
    return r && [-r[0], r[1]];
  }
  if (ast.kind === 'var' && ast.name === 'π') return [1n, 1n];
  if (ast.kind !== 'bin') return null;
  if (ast.op === '*') {
    const [k, p] = exactRational(ast.l) ? [ast.l, ast.r] : [ast.r, ast.l];
    const r = exactRational(k);
    const m = r && piMultiple(p);
    return m && [r[0] * m[0], r[1] * m[1]];
  }
  if (ast.op === '/') {
    const m = piMultiple(ast.l);
    const r = exactRational(ast.r);
    return m && r && r[0] !== 0n ? [m[0] * r[1], m[1] * r[0]] : null;
  }
  return null;
}

// The angle as a fraction of a whole turn, [n, d], when it is an exact one.
function turnOf(ast, angle) {
  if (TURN[angle]) {
    const r = exactRational(ast);
    return r && [r[0], r[1] * TURN[angle]];
  }
  const m = angle === 'RAD' ? piMultiple(ast) : null;
  return m && [m[0], m[1] * 2n];
}

// The angle as a count of steps of a whole turn in `parts`, when it falls on one.
function steps([n, d], parts) {
  if (d < 0n) [n, d] = [-n, -d];
  return (n * parts) % d === 0n ? mod((n * parts) / d, parts) : null;
}

export function exactTrig(name, ast, angle) {
  const turn = turnOf(ast, angle);
  if (!turn) return null;
  const k12 = steps(turn, 12n), k8 = steps(turn, 8n);
  const at = (table, k, shift = 0n) => {
    const entry = table[Number(mod(k + shift, BigInt(table.length)))];
    return entry ? signed(entry) : null;
  };
  switch (name) {
    case 'SIN': return k12 !== null ? at(SIN_30, k12) : k8 !== null ? at(SIN_45, k8) : null;
    case 'COS': return k12 !== null ? at(SIN_30, k12, 3n) : k8 !== null ? at(SIN_45, k8, 2n) : null;
    case 'TAN': return k12 !== null ? at(TAN_30, mod(k12, 6n)) : k8 !== null ? at(TAN_45, mod(k8, 4n)) : null;
    default: return null;
  }
}

// Each special value with its angle in degrees, for the inverse functions.
const ASIN_DEG = [[ZERO, 0], [HALF, 30], [R2_2, 45], [R3_2, 60], [ONE, 90]];
const ATAN_DEG = [[ZERO, 0], [R3_3, 30], [ONE, 45], [root(3n), 60]];

// A special value's sign and magnitude: -1/2 comes as an exact fraction, -√2/2 as a negation.
function magnitudeOf(ast) {
  if (ast.kind === 'neg') return [true, ast.arg];
  const r = exactRational(ast);
  if (!r || r[0] >= 0n) return [false, ast];
  return [true, r[1] === 1n ? Num(-r[0]) : Bin('/', Num(-r[0]), Num(r[1]))];
}

function degreesOf(name, ast) {
  const [negative, magnitude] = magnitudeOf(ast);
  const hit = (name === 'ATAN' ? ATAN_DEG : ASIN_DEG).find(([v]) => astEqual(v, magnitude));
  if (!hit) return null;
  const deg = negative ? -hit[1] : hit[1];
  return name === 'ACOS' ? 90 - deg : deg;
}

// n/d reduced, its magnitude drawn by top: k, k*π, k/m, k*π/m, or the negative of one.
function signedFraction(n, d, top) {
  const g = gcd(n < 0n ? -n : n, d);
  [n, d] = [n / g, d / g];
  if (n === 0n) return ZERO;
  const magnitude = n < 0n ? -n : n;
  const value = d === 1n ? top(magnitude) : Bin('/', top(magnitude), Num(d));
  return n < 0n ? Neg(value) : value;
}

const piTimes = (k) => (k === 1n ? Var('π') : Bin('*', Num(k), Var('π')));

// Degrees as the angle mode writes them: an integer or fraction of degrees or grads, a multiple of π in radians.
function angleOf(deg, angle) {
  if (angle === 'DEG') return Num(BigInt(deg));
  return angle === 'GRD' ? signedFraction(BigInt(deg) * 10n, 9n, Num) : signedFraction(BigInt(deg), 180n, piTimes);
}

// n/d degrees in radians, exactly: 90 is π/2.
export const exactRadians = (n, d) => signedFraction(n, d * 180n, piTimes);

// An exact multiple of π in degrees as [numerator, denominator], or null: π/2 is [90, 1].
export function exactDegrees(ast) {
  const m = piMultiple(ast);
  return m && [m[0] * 180n, m[1]];
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function exactInverseTrig(name, ast, angle) {
  if (!['ASIN', 'ACOS', 'ATAN'].includes(name)) return null;
  const deg = degreesOf(name, ast);
  return deg === null ? null : angleOf(deg, angle);
}

// Every SIN, COS, TAN, ASIN, ACOS and ATAN in the tree that has a closed form takes it.
export function exactTrigRewrite(ast, angle) {
  if (!ast || typeof ast !== 'object') return ast;
  if (ast.kind === 'neg') {
    const arg = exactTrigRewrite(ast.arg, angle);
    return arg === ast.arg ? ast : Neg(arg);
  }
  if (ast.kind === 'bin') {
    const l = exactTrigRewrite(ast.l, angle), r = exactTrigRewrite(ast.r, angle);
    return l === ast.l && r === ast.r ? ast : Bin(ast.op, l, r);
  }
  if (ast.kind !== 'fn') return ast;
  const args = ast.args.map((a) => exactTrigRewrite(a, angle));
  if (args.length === 1) {
    const special = exactTrig(ast.name, args[0], angle) ?? exactInverseTrig(ast.name, args[0], angle);
    if (special) return special;
  }
  return args.every((a, i) => a === ast.args[i]) ? ast : Fn(ast.name, args);
}
