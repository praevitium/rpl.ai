// EVAL's exact tidying: like terms add (X+X is 2*X), like factors gather into powers (X*X is X^2, √X*√X is X),
// numbers gather into one coefficient (π/4*4 is π), and identities drop out (1*X, X+0, X^1 are X; X/X, X^0 are 1; X-X, 0*X are 0).
import { Num, Neg, Bin, exactRational, astEqual, freeVars } from './algebra.js';

const ONE = [1n, 1n];
const abs = (x) => (x < 0n ? -x : x);
const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
const isOne = (r) => r[0] === 1n && r[1] === 1n;

function ratio(n, d) {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(abs(n), d);
  return [n / g, d / g];
}
const add = (a, b) => ratio(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => ratio(a[0] * b[0], a[1] * b[1]);

const isSqrt = (node) => node.kind === 'fn' && node.name === 'SQRT' && node.args.length === 1;

// A power with an exact exponent as [base, exponent]: (X^2)^3 is [X, 6], while (X^2)^(1/2) stays [X^2, 1/2].
function powerOf(node) {
  const k = node.kind === 'bin' && node.op === '^' ? exactRational(node.r) : null;
  if (!k) return [node, ONE];
  const [base, inner] = powerOf(node.l);
  return k[1] === 1n || isOne(inner) ? [base, mul(inner, k)] : [node.l, k];
}

// A product or quotient as an exact coefficient and its other factors, each a base with an exact exponent.
function factorsOf(ast) {
  let coef = ONE, numbers = 0, changed = false, valid = true;
  const factors = [];
  const walk = (node, up) => {
    if (node.kind === 'bin' && (node.op === '*' || node.op === '/')) {
      walk(node.l, up);
      walk(node.r, node.op === '*' ? up : !up);
      return;
    }
    const r = exactRational(node);
    if (r) {
      if (r[0] === 0n && !up) valid = false;
      else coef = up ? mul(coef, r) : mul(coef, [r[1], r[0]]);
      numbers++;
      if (r[1] === 1n && abs(r[0]) <= 1n) changed = true;
      return;
    }
    if (node.kind === 'neg') {
      coef = mul(coef, [-1n, 1n]);
      walk(node.arg, up);
      return;
    }
    const [base, k] = powerOf(node);
    const exp = up ? k : [-k[0], k[1]];
    if (base !== node && (base !== node.l || k[0] === 0n || isOne(k) || (isSqrt(base) && k[1] === 1n))) changed = true;
    const like = factors.find((f) => astEqual(f.base, base));
    if (like) {
      like.exp = add(like.exp, exp);
      changed = true;
    } else factors.push({ base, exp });
  };
  walk(ast, true);
  return valid && { coef, factors, changed: changed || numbers > 1 };
}

// base^e for a positive exponent, with √X^2 as X and √X^3 as X*√X.
function powerAst(base, e) {
  if (isOne(e)) return base;
  if (isSqrt(base) && e[1] === 1n) {
    const half = powerAst(base.args[0], [e[0] / 2n, 1n]);
    return e[0] % 2n === 0n ? half : Bin('*', half, base);
  }
  return Bin('^', base, e[1] === 1n ? Num(e[0]) : Bin('/', Num(e[0]), Num(e[1])));
}

// The coefficient's numerator leads the top and its denominator the bottom, as in 2*X/(3*Y); the sign goes outside.
function productAst(coef, factors) {
  if (coef[0] === 0n) return Num(0n);
  const top = factors.filter((f) => f.exp[0] > 0n).map((f) => powerAst(f.base, f.exp));
  const bottom = factors.filter((f) => f.exp[0] < 0n).map((f) => powerAst(f.base, [-f.exp[0], f.exp[1]]));
  const n = abs(coef[0]);
  if (n !== 1n || !top.length) top.unshift(Num(n));
  if (coef[1] !== 1n) bottom.unshift(Num(coef[1]));
  const chain = (nodes) => nodes.reduce((a, b) => Bin('*', a, b));
  const value = bottom.length ? Bin('/', chain(top), chain(bottom)) : chain(top);
  return coef[0] < 0n ? Neg(value) : value;
}

function termsOf(ast, negative, out) {
  if (ast.kind === 'bin' && (ast.op === '+' || ast.op === '-')) {
    termsOf(ast.l, negative, out);
    termsOf(ast.r, ast.op === '-' ? !negative : negative, out);
  } else if (ast.kind === 'neg') termsOf(ast.arg, !negative, out);
  else out.push({ ast, negative });
  return out;
}

const sameFactors = (a, b) => {
  if (a.length !== b.length) return false;
  const used = new Set();
  return a.every((f) => {
    const i = b.findIndex((g, j) => !used.has(j) && astEqual(f.base, g.base) && f.exp[0] === g.exp[0] && f.exp[1] === g.exp[1]);
    return i >= 0 && used.add(i);
  });
};

function gatherSum(ast) {
  const groups = [];
  for (const term of termsOf(ast, false, [])) {
    const parts = factorsOf(term.ast);
    if (!parts) return null;
    const coef = term.negative ? mul(parts.coef, [-1n, 1n]) : parts.coef;
    const like = groups.find((g) => sameFactors(g.factors, parts.factors));
    if (like) {
      like.coef = add(like.coef, coef);
      like.term = null;
    } else groups.push({ coef, factors: parts.factors, term });
  }
  if (groups.every((g) => g.term && g.coef[0] !== 0n)) return null;
  const constant = groups.findIndex((g) => !g.factors.length);
  if (constant >= 0) groups.push(...groups.splice(constant, 1));
  const terms = groups
    .filter((g) => g.coef[0] !== 0n)
    .map((g) => g.term ?? { ast: productAst([abs(g.coef[0]), g.coef[1]], g.factors), negative: g.coef[0] < 0n });
  if (!terms.length) return Num(0n);
  const first = terms[0].negative ? Neg(terms[0].ast) : terms[0].ast;
  return terms.slice(1).reduce((acc, t) => Bin(t.negative ? '-' : '+', acc, t.ast), first);
}

function gatherProduct(ast) {
  const parts = factorsOf(ast);
  return parts && parts.changed ? productAst(parts.coef, parts.factors) : null;
}

// One node, its operands already tidy: the tidied node, or null when nothing gathers. ∞-∞ and ?/? stay undefined.
export function gatherLike(ast) {
  if (ast.kind !== 'bin') return null;
  const names = freeVars(ast);
  if (names.has('∞') || names.has('?')) return null;
  if (ast.op === '+' || ast.op === '-') return gatherSum(ast);
  if (ast.op === '*' || ast.op === '/' || ast.op === '^') return gatherProduct(ast);
  return null;
}
