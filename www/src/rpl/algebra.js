/* Algebraic expressions as small frozen ASTs: parsing, formatting and
   numeric evaluation.  Symbolic work (EXPAND, DERIV, SOLVE, ...) goes to
   Giac through cas/giac-convert.mjs. */

import { formatUnitExpr, parseUnitExpr, uexprEqual } from './units.js';

// A number past 2^53 keeps its exact `digits` (`value` is the nearest
// double).  isNum() is false for it, so numeric folding leaves it alone.
// `real` marks an approximate number such as 2.; a value with a fractional
// part is approximate anyway.
export function Num(v, real = false) {
  const value = Number(v);
  if (typeof v === 'bigint' && !Number.isSafeInteger(value)) {
    return Object.freeze({ kind: 'num', value, digits: v.toString() });
  }
  return Object.freeze(real ? { kind: 'num', value, real: true } : { kind: 'num', value });
}

export const isRealNum = n => n.real === true || (n.digits === undefined && !Number.isInteger(n.value));

// A folded approximate result keeps the HP50's 12 significant digits.
const approxNum = (value, real) => Num(Number.isFinite(value) && (real || !Number.isInteger(value)) ? Number(value.toPrecision(12)) : value, real);

// An approximate whole number keeps its point, as the HP50 shows 2.
export function numText(n) {
  if (n.digits !== undefined) return n.digits;
  const s = String(n.value).replace('e+', 'E').replace('e-', 'E-');
  return n.real && /^-?\d+$/.test(s) ? `${s}.` : s;
}
// A unit object inside an algebraic, 5_m or 9.81_(m/s^2), its number kept to 12 digits like a Unit's.
export function UnitNode(value, uexpr) {
  return Object.freeze({ kind: 'unit', value: Number(Number(value).toPrecision(12)), uexpr });
}

// m, or (m/s^2) for a unit with operators in it, so the text after the _ parses back as one unit.
export function unitSuffix(uexpr) {
  const units = formatUnitExpr(uexpr);
  return /[*/]/.test(units) ? `(${units})` : units;
}

export function unitNodeText(n) {
  return `${numText(Num(n.value, true))}_${unitSuffix(n.uexpr)}`;
}

export function Var(name) {
  return Object.freeze({ kind: 'var', name: String(name) });
}
export function Neg(arg) {
  return Object.freeze({ kind: 'neg', arg });
}
export function Bin(op, l, r) {
  return Object.freeze({ kind: 'bin', op, l, r });
}
// A built-in function's name is upper-cased; a user function keeps its case, as F and f are different variables.
export function Fn(name, args) {
  return Object.freeze({
    kind: 'fn',
    name: isKnownFunction(name) ? String(name).toUpperCase() : String(name),
    args: Object.freeze([...args]),
  });
}

export const isNum = n => n && n.kind === 'num' && n.digits === undefined;

const EXACT_POW_MAX = 4096;

function exactInt(n) {
  if (!n || n.kind !== 'num' || n.real) return null;
  if (n.digits !== undefined) return BigInt(n.digits);
  return Number.isSafeInteger(n.value) ? BigInt(n.value) : null;
}

// Folds two integer leaves in BigInt so a result past 2^53 keeps its digits.
function exactIntFold(op, l, r) {
  const x = exactInt(l);
  const y = exactInt(r);
  if (x === null || y === null) return null;
  switch (op) {
    case '+': return Num(x + y);
    case '-': return Num(x - y);
    case '*': return Num(x * y);
    case '^': return y >= 0n && y <= BigInt(EXACT_POW_MAX) ? Num(x ** y) : null;
    default:  return null;
  }
}
// An exact fraction in the tree: an integer, int/int, or the negative of one, as [n, d].
export function exactRational(n) {
  const x = exactInt(n);
  if (x !== null) return [x, 1n];
  if (n?.kind === 'neg') {
    const r = exactRational(n.arg);
    return r && [-r[0], r[1]];
  }
  if (n?.kind !== 'bin' || n.op !== '/') return null;
  const a = exactInt(n.l);
  const b = exactInt(n.r);
  return a !== null && b !== null && b !== 0n ? [a, b] : null;
}

const bigAbs = (x) => (x < 0n ? -x : x);
const bigGcd = (a, b) => (b === 0n ? a : bigGcd(b, a % b));

function rationalNode(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const g = bigGcd(bigAbs(n), d);
  n /= g; d /= g;
  if (d === 1n) return Num(n);
  const abs = Bin('/', Num(bigAbs(n)), Num(d));
  return n < 0n ? Neg(abs) : abs;
}

// Fraction arithmetic in EXACT mode, so 1/3+1/6 is 1/2 and 2/4 is 1/2, as on the HP.
function exactRationalFold(op, l, r) {
  const a = exactRational(l);
  const b = exactRational(r);
  if (!a || !b) return null;
  switch (op) {
    case '+': return rationalNode(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    case '-': return rationalNode(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
    case '*': return rationalNode(a[0] * b[0], a[1] * b[1]);
    case '/': return b[0] === 0n ? null : rationalNode(a[0] * b[1], a[1] * b[0]);
    case '^': {
      if (b[1] !== 1n || bigAbs(b[0]) > BigInt(EXACT_POW_MAX) || (b[0] < 0n && a[0] === 0n)) return null;
      const e = bigAbs(b[0]);
      return b[0] < 0n ? rationalNode(a[1] ** e, a[0] ** e) : rationalNode(a[0] ** e, a[1] ** e);
    }
    default: return null;
  }
}

export const isVar = n => n && n.kind === 'var';
export const isNeg = n => n && n.kind === 'neg';
export const isBin = n => n && n.kind === 'bin';
export const isFn  = n => n && n.kind === 'fn';

export function astEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'num') return a.value === b.value && a.digits === b.digits && !a.real === !b.real;
  if (a.kind === 'var') return a.name === b.name;
  if (a.kind === 'unit') return a.value === b.value && uexprEqual(a.uexpr, b.uexpr);
  if (a.kind === 'neg') return astEqual(a.arg, b.arg);
  if (a.kind === 'bin') {
    return a.op === b.op && astEqual(a.l, b.l) && astEqual(a.r, b.r);
  }
  if (a.kind === 'fn') {
    if (a.name !== b.name) return false;
    if (a.args.length !== b.args.length) return false;
    for (let i = 0; i < a.args.length; i++) {
      if (!astEqual(a.args[i], b.args[i])) return false;
    }
    return true;
  }
  return false;
}

const bothIntegers = (a, b) => Number.isInteger(a) && Number.isInteger(b);

function gcd(a, b) {
  let x = Math.abs(a), y = Math.abs(b);
  while (y !== 0) { [x, y] = [y, x % y]; }
  return x;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return null;
  let acc = 1;
  for (let i = 2; i <= n; i++) acc *= i;
  return acc;
}

// The names the parser reads as NAME(args).  `eval` folds numeric
// arguments and returns null to leave the call symbolic; a spec without
// `arity` takes a variable number of arguments.
export const KNOWN_FUNCTIONS = Object.freeze({
  AND:  { arity: 2, eval: (a, b) => (Number(a) !== 0 && Number(b) !== 0 ? 1 : 0) },
  OR:   { arity: 2, eval: (a, b) => (Number(a) !== 0 || Number(b) !== 0 ? 1 : 0) },
  XOR:  { arity: 2, eval: (a, b) => ((Number(a) !== 0) !== (Number(b) !== 0) ? 1 : 0) },
  NOT:  { arity: 1, eval: a => (Number(a) === 0 ? 1 : 0) },
  LN:   { arity: 1, eval: x => x > 0 ? Math.log(x) : null },
  LOG:  { arity: 1, eval: x => x > 0 ? Math.log10(x) : null },
  EXP:  { arity: 1, eval: x => Math.exp(x) },
  ALOG: { arity: 1, eval: x => Math.pow(10, x) },
  SQRT: { arity: 1, eval: x => x >= 0 ? Math.sqrt(x) : null },
  ABS:  { arity: 1, eval: x => Math.abs(x) },
  // Angle-mode dependent, so callers evaluate these themselves.
  SIN:  { arity: 1 },
  COS:  { arity: 1 },
  TAN:  { arity: 1 },
  ASIN: { arity: 1 },
  ACOS: { arity: 1 },
  ATAN: { arity: 1 },
  SINH:  { arity: 1, eval: Math.sinh },
  COSH:  { arity: 1, eval: Math.cosh },
  TANH:  { arity: 1, eval: Math.tanh },
  ASINH: { arity: 1, eval: Math.asinh },
  ACOSH: { arity: 1, eval: x => x >= 1 ? Math.acosh(x) : null },
  ATANH: { arity: 1, eval: x => (x > -1 && x < 1) ? Math.atanh(x) : null },
  FACT: { arity: 1, eval: factorial },
  XROOT: { arity: 2, eval: (y, x) => {
    if (!Number.isFinite(y) || !Number.isFinite(x) || x === 0) return null;
    if (y >= 0) return Math.pow(y, 1 / x);
    // An odd root of a negative number is real, as XROOT on the stack gives.
    return Number.isInteger(x) && x % 2 !== 0 ? -Math.pow(-y, 1 / x) : null;
  } },
  SUM:   { arity: 1 },
  // Evaluated lazily by evalAst: only the branch the test picks is worked out.
  IFTE:  { arity: 3 },
  INTEG: { },
  DERIV: { arity: 2 },
  'Σ':   { arity: 4 },
  HEAVISIDE: { arity: 1, eval: x => x >= 0 ? 1 : 0 },
  DIRAC:     { arity: 1, eval: x => x === 0 ? null : 0 },
  FLOOR: { arity: 1, eval: x => Number.isFinite(x) ? Math.floor(x) : null },
  CEIL:  { arity: 1, eval: x => Number.isFinite(x) ? Math.ceil(x)  : null },
  IP:    { arity: 1, eval: x => Number.isFinite(x) ? Math.trunc(x) : null },
  FP:    { arity: 1, eval: x => Number.isFinite(x) ? x - Math.trunc(x) : null },
  SIGN:  { arity: 1, eval: x => Number.isFinite(x) ? Math.sign(x) : null },
  ARG:   { arity: 1 },   // angle-mode dependent
  MOD:   { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a - b * Math.floor(a / b);
  } },
  MIN:   { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a <= b ? a : b;
  } },
  MAX:   { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a >= b ? a : b;
  } },
  GCD: { arity: 2, eval: (a, b) => bothIntegers(a, b) ? gcd(a, b) : null },
  LCM: { arity: 2, eval: (a, b) => {
    if (!bothIntegers(a, b)) return null;
    if (a === 0 || b === 0) return 0;
    return Math.abs(a / gcd(a, b) * b);
  } },
  COMB:  { arity: 2, eval: (n, m) => {
    if (!bothIntegers(n, m)) return null;
    if (n < 0 || m < 0 || m > n) return null;
    let num = 1, den = 1;
    for (let i = 1; i <= m; i++) { num *= (n - m + i); den *= i; }
    return num / den;
  } },
  PERM:  { arity: 2, eval: (n, m) => {
    if (!bothIntegers(n, m)) return null;
    if (n < 0 || m < 0 || m > n) return null;
    let out = 1;
    for (let i = 0; i < m; i++) out *= (n - i);
    return out;
  } },
  IQUOT: { arity: 2, eval: (a, b) => {
    if (!bothIntegers(a, b) || b === 0) return null;
    return Math.trunc(a / b);
  } },
  IREMAINDER: { arity: 2, eval: (a, b) => {
    if (!bothIntegers(a, b) || b === 0) return null;
    return a - Math.trunc(a / b) * b;
  } },
  GAMMA: { arity: 1, eval: x => factorial(x - 1) },
  LNGAMMA: { arity: 1 },
  UTPC: { arity: 2 },
  // Keyed in uppercase because lookups uppercase the name; HP spells it Beta.
  BETA: { arity: 2 },
  ERF:  { arity: 1 },
  ERFC: { arity: 1 },
  UTPF: { arity: 3 },
  UTPT: { arity: 2 },
  CONJ: { arity: 1, eval: x => Number.isFinite(x) ? x : null },
  RE:   { arity: 1, eval: x => Number.isFinite(x) ? x : null },
  IM:   { arity: 1, eval: x => Number.isFinite(x) ? 0 : null },
  LNP1: { arity: 1, eval: x => Number.isFinite(x) && x > -1 ? Math.log1p(x) : null },
  EXPM: { arity: 1, eval: x => Number.isFinite(x) ? Math.expm1(x) : null },
  XPON: { arity: 1, eval: x => {
    if (!Number.isFinite(x)) return null;
    if (x === 0) return 0;
    return Math.floor(Math.log10(Math.abs(x)));
  } },
  MANT: { arity: 1, eval: x => {
    if (!Number.isFinite(x)) return null;
    if (x === 0) return 0;
    const e = Math.floor(Math.log10(Math.abs(x)));
    return x / Math.pow(10, e);
  } },
  TRUNC: { arity: 2 },
  RND:   { arity: 2 },
  TRNC:  { arity: 2 },
  ZETA:    { arity: 1 },
  LAMBERT: { arity: 1 },
  PSI:     { },
  EI:      { arity: 1 },
  SI:      { arity: 1 },
  CI:      { arity: 1 },
});

export function isKnownFunction(name) {
  return Object.prototype.hasOwnProperty.call(KNOWN_FUNCTIONS, String(name).toUpperCase());
}

// Throws on malformed input, and parser.js then keeps the text as a quoted
// Name.  A comparison or logic test is read anywhere, as in IFTE(X>0,X,-X)
// and (X>0 OR Y>0) AND Z; an equation only at the top level and as a
// function argument, so (X=Y)+1 is still refused.
export function parseAlgebra(src) {
  const s = String(src);
  let i = 0;
  const n = s.length;

  function skip() { while (i < n && /\s/.test(s[i])) i++; }

  function expect(ch) {
    skip();
    if (s[i] === ch) { i++; return; }
    // A `)` missing at the very end is forgiven, as parser.js closes
    // unterminated lists and programs.
    if (ch === ')' && i >= n) return;
    throw new Error(`Expected '${ch}' at pos ${i}`);
  }

  // The units after 5_: one unit with its power, 5_m^2, or any unit expression in parentheses, 5_(m/s).
  function readUnit() {
    if (s[i] === '(') {
      const close = s.indexOf(')', i);
      if (close < 0) throw new Error(`Unclosed unit at pos ${i}`);
      const text = s.slice(i + 1, close);
      i = close + 1;
      return text;
    }
    const m = s.slice(i).match(/^[A-Za-zΩμ°Å][A-Za-z0-9Ωμ°Å]*(?:\^[-+]?(?:\d+\.?\d*|\.\d+))?/);
    if (!m) throw new Error(`Missing unit after the underscore at pos ${i}`);
    i += m[0].length;
    return m[0];
  }

  // AUR precedence: comparisons bind tighter than AND and NOT, which bind tighter than OR and XOR.
  function parseOr() {
    let left = parseAnd();
    for (;;) {
      skip();
      const word = s.slice(i).match(/^(OR|XOR)\b/i);
      if (!word) return left;
      i += word[0].length;
      left = Fn(word[1].toUpperCase(), [left, parseAnd()]);
    }
  }

  function parseAnd() {
    let left = parseNot();
    for (;;) {
      skip();
      if (!/^AND\b/i.test(s.slice(i))) return left;
      i += 3;
      left = Fn('AND', [left, parseNot()]);
    }
  }

  function parseNot() {
    skip();
    if (!/^NOT\b/i.test(s.slice(i))) return parseEq();
    i += 3;
    return Fn('NOT', [parseNot()]);
  }

  function parseEq() {
    const left = parseE();
    skip();
    if (s[i] === '<' && s[i + 1] === '=') { i += 2; return Bin('≤', left, parseE()); }
    if (s[i] === '>' && s[i + 1] === '=') { i += 2; return Bin('≥', left, parseE()); }
    if (s[i] === '=' && s[i + 1] === '=') { i += 2; return Bin('==', left, parseE()); }
    if ('=≠<>≤≥'.includes(s[i])) {
      const op = s[i]; i++;
      return Bin(op, left, parseE());
    }
    return left;
  }

  function parseE() {
    let left = parseT();
    while (true) {
      skip();
      const op = s[i];
      if (op !== '+' && op !== '-') break;
      i++;
      const right = parseT();
      left = Bin(op, left, right);
    }
    return left;
  }

  function parseT() {
    let left = parseF();
    while (true) {
      skip();
      const op = s[i];
      if (op !== '*' && op !== '/') break;
      i++;
      const right = parseF();
      left = Bin(op, left, right);
    }
    return left;
  }

  function parseF() {
    skip();
    if (s[i] === '-') { i++; return Neg(parseF()); }
    if (s[i] === '+') { i++; return parseF(); }
    return parsePow();
  }

  function parsePow() {
    const left = parseP();
    skip();
    if (s[i] === '^') {
      i++;
      const right = parseF();              // right-assoc: X^Y^Z = X^(Y^Z)
      return Bin('^', left, right);
    }
    return left;
  }

  function parseP() {
    skip();
    if (i >= n) throw new Error('Unexpected end of expression');
    const c = s[i];

    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d+\.?\d*(?:[eE][-+]?\d+)?|^\.\d+(?:[eE][-+]?\d+)?/);
      if (!m) throw new Error(`Bad number at pos ${i}`);
      i += m[0].length;
      if (s[i] === '_') {
        i++;
        return UnitNode(parseFloat(m[0]), parseUnitExpr(readUnit()));
      }
      const whole = /^\d+$/.test(m[0]);
      return Num(whole ? BigInt(m[0]) : parseFloat(m[0]), !whole);
    }

    if (c === '(') {
      i++;
      const e = parseOr();
      expect(')');
      if (e.kind === 'bin' && e.op === '=') throw new Error(`An equation cannot be an operand at pos ${i}`);
      return e;
    }

    if (c === '∞') {
      i++;
      return Var('∞');
    }

    if (c === '√') {
      i++;
      return Fn('SQRT', [parseP()]);
    }

    // NAME(args) is a call, as on the HP 50g: a built-in function, or a user
    // function such as one DEFINE makes.
    if (/[A-Za-zΑ-Ωα-ω]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-zΑ-Ωα-ω][A-Za-zΑ-Ωα-ω0-9]*/);
      i += m[0].length;
      const ident = m[0];
      skip();
      if (s[i] === '(') {
        i++;
        const args = [];
        args.push(parseOr());
        skip();
        while (s[i] === ',') {
          i++;
          args.push(parseOr());
          skip();
        }
        expect(')');
        const spec = KNOWN_FUNCTIONS[ident.toUpperCase()];
        if (spec && spec.arity !== undefined && args.length !== spec.arity) {
          throw new Error(
            `${ident.toUpperCase()} expects ${spec.arity} argument(s), got ${args.length}`);
        }
        return Fn(ident, args);
      }
      return Var(ident);
    }

    throw new Error(`Unexpected character '${c}' at pos ${i}`);
  }

  const ast = parseOr();
  skip();
  if (i !== n) throw new Error(`Trailing input at pos ${i}: '${s.slice(i)}'`);
  return ast;
}

// A comparison of two numbers is a truth value, 1. or 0., as the comparison commands give; = stays an equation.
const COMPARISONS = Object.freeze({
  '<': (a, b) => a < b, '>': (a, b) => a > b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b,
  '≠': (a, b) => a !== b, '==': (a, b) => a === b,
});

function foldNums(op, l, r) {
  if (!isNum(l) || !isNum(r)) return null;
  if (COMPARISONS[op]) return Num(COMPARISONS[op](l.value, r.value) ? 1 : 0, true);
  const real = isRealNum(l) || isRealNum(r);
  let value;
  switch (op) {
    case '+': value = l.value + r.value; break;
    case '-': value = l.value - r.value; break;
    case '*': value = l.value * r.value; break;
    case '/': value = r.value === 0 ? NaN : l.value / r.value; break;
    case '^': value = Math.pow(l.value, r.value); break;
    default:  return null;
  }
  return Number.isNaN(value) ? null : approxNum(value, real);
}

// lookup(name) returns a number or a Num node, and fnEval(name, args, real) a
// number or Num node, or null to leave that part symbolic.  binGate(op, args, folded), when
// given, returns the number a fold of exact numbers should produce, or null to
// keep the operation (EXACT mode keeps 1/3).  A fold with an approximate
// operand always happens and is approximate, as on the HP50.
export function evalAst(ast, lookup, fnEval = defaultFnEval, binGate = null) {
  if (!ast) return ast;
  if (ast.kind === 'num') return ast;
  if (ast.kind === 'var') {
    const b = lookup(ast.name);
    if (b?.kind) return b;
    if (!Number.isFinite(b)) return ast;
    return Num(b);
  }
  if (ast.kind === 'neg') {
    const a = evalAst(ast.arg, lookup, fnEval, binGate);
    if (isNum(a)) return Num(-a.value, a.real);
    return Neg(a);
  }
  if (ast.kind === 'bin') {
    const l = evalAst(ast.l, lookup, fnEval, binGate);
    const r = evalAst(ast.r, lookup, fnEval, binGate);
    const exact = exactIntFold(ast.op, l, r) ?? (binGate ? exactRationalFold(ast.op, l, r) : null);
    if (exact) return exact;
    const folded = foldNums(ast.op, l, r);
    if (!folded) return Bin(ast.op, l, r);
    if (!binGate || COMPARISONS[ast.op] || isRealNum(l) || isRealNum(r)) return folded;
    const gated = binGate(ast.op, [l.value, r.value], folded.value);
    return Number.isFinite(gated) ? approxNum(gated, false) : Bin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    if (ast.name === 'IFTE' && ast.args.length === 3) return evalIfte(ast.args, lookup, fnEval, binGate);
    const sum = ast.name === 'Σ' ? evalSum(ast.args, lookup, fnEval, binGate) : null;
    if (sum) return sum;
    const evaldArgs = ast.args.map(a => evalAst(a, lookup, fnEval, binGate));
    if (evaldArgs.every(isNum)) {
      const real = evaldArgs.some(isRealNum) || ast.name in LOGIC_ARITY;
      const result = fnEval(ast.name, evaldArgs.map(a => a.value), real);
      if (result?.kind) return result;
      if (Number.isFinite(result)) return approxNum(result, real);
    }
    return Fn(ast.name, evaldArgs);
  }
  return ast;
}

// A test that folds to a number picks one branch, which is all that is worked
// out, so a recursive user function stops at its base case.
function evalIfte([test, then, otherwise], lookup, fnEval, binGate) {
  const t = evalAst(test, lookup, fnEval, binGate);
  if (isNum(t)) return evalAst(t.value !== 0 ? then : otherwise, lookup, fnEval, binGate);
  return Fn('IFTE', [t, then, otherwise]);
}

const SUM_TERMS_MAX = 100000;

function evalSum([body, index, from, to], lookup, fnEval, binGate) {
  if (!isVar(index)) return null;
  const lo = exactInt(evalAst(from, lookup, fnEval, binGate));
  const hi = exactInt(evalAst(to, lookup, fnEval, binGate));
  if (lo === null || hi === null || hi - lo >= BigInt(SUM_TERMS_MAX)) return null;
  let total = Num(0n);
  for (let k = lo; k <= hi; k++) {
    const term = evalAst(body, (name) => (name === index.name ? Number(k) : lookup(name)), fnEval, binGate);
    if (term?.kind !== 'num') return null;
    total = exactIntFold('+', total, term) ?? approxNum(total.value + term.value, isRealNum(total) || isRealNum(term));
  }
  return total;
}

export function defaultFnEval(name, args) {
  const spec = KNOWN_FUNCTIONS[String(name).toUpperCase()];
  if (!spec || typeof spec.eval !== 'function') return null;
  if (args.length !== (spec.arity || 1)) return null;
  return spec.eval(...args);
}

export function freeVars(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.kind === 'var') out.add(ast.name);
  else if (ast.kind === 'neg') freeVars(ast.arg, out);
  else if (ast.kind === 'bin') { freeVars(ast.l, out); freeVars(ast.r, out); }
  else if (ast.kind === 'fn')  for (const a of ast.args) freeVars(a, out);
  return out;
}

export function hasUnits(ast) {
  if (ast.kind === 'unit') return true;
  if (ast.kind === 'neg') return hasUnits(ast.arg);
  if (ast.kind === 'bin') return hasUnits(ast.l) || hasUnits(ast.r);
  return ast.kind === 'fn' && ast.args.some(hasUnits);
}

// The objects an algebraic holds, as SIZE counts them: X+1 is X 1 +, so 3.
export function astSize(ast) {
  if (ast.kind === 'neg') return 1 + astSize(ast.arg);
  if (ast.kind === 'bin') return 1 + astSize(ast.l) + astSize(ast.r);
  if (ast.kind === 'fn') return 1 + ast.args.reduce((n, a) => n + astSize(a), 0);
  return 1;
}

export function formatAlgebra(ast) {
  return fmt(ast, LOGIC_PREC.OR);
}

// Below every arithmetic and comparison level: X>1 AND X<2 needs no brackets.
export const LOGIC_PREC = Object.freeze({ OR: -2, XOR: -2, AND: -1, NOT: -1 });
export const LOGIC_ARITY = Object.freeze({ AND: 2, OR: 2, XOR: 2, NOT: 1 });

export const PREC = Object.freeze({
  '=': 0, '==': 0, '≠': 0, '<': 0, '>': 0, '≤': 0, '≥': 0,
  '+': 1, '-': 1, '*': 2, '/': 2, '^': 3,
});

function fmt(ast, parentPrec) {
  if (!ast) return '';
  if (ast.kind === 'num') {
    const s = numText(ast);
    // Only a power's base needs it: -3^X would read back as -(3^X).
    return parentPrec > 3 && s.startsWith('-') ? `(${s})` : s;
  }
  if (ast.kind === 'var') return ast.name;
  if (ast.kind === 'unit') {
    // A power's base needs it, so (5._m)^2 doesn't read back as 5 square metres.
    const s = unitNodeText(ast);
    return parentPrec > 3 ? `(${s})` : s;
  }
  if (ast.kind === 'neg') {
    const inner = fmt(ast.arg, 3);
    const s = `-${inner}`;
    return parentPrec >= 2 ? `(${s})` : s;
  }
  if (ast.kind === 'fn') {
    const logic = LOGIC_PREC[ast.name];
    if (logic !== undefined && ast.args.length === LOGIC_ARITY[ast.name]) {
      const text = ast.name === 'NOT' ? `NOT ${fmt(ast.args[0], 0)}` : `${fmt(ast.args[0], logic)} ${ast.name} ${fmt(ast.args[1], logic + 1)}`;
      return logic < parentPrec ? `(${text})` : text;
    }
    const inside = ast.args.map(a => fmt(a, LOGIC_PREC.OR)).join(',');
    return `${ast.name}(${inside})`;
  }
  if (ast.kind === 'bin') {
    const p = PREC[ast.op];
    const rightAssoc = (ast.op === '^');
    const lPrec = rightAssoc ? p + 1 : p;
    const rPrec = rightAssoc ? p : p + 1;
    const lStr = fmt(ast.l, lPrec);
    const rStr = fmt(ast.r, rPrec);
    // Comparisons other than = print tight, as the HP 50g shows 'X>Y'.
    const sep = (ast.op === '+' || ast.op === '-' || ast.op === '=')
                ? ` ${ast.op} `
                : ast.op;
    const s = `${lStr}${sep}${rStr}`;
    return p < parentPrec ? `(${s})` : s;
  }
  return '?';
}
