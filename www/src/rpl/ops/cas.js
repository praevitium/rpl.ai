import { isSymbolic, Symbolic, isReal, isInteger, isName, isString, RList, isList, Real, Name, Integer, isComplex, Complex, isVector, Vector, isMatrix, Matrix, isValidHpIdentifier, isBinaryInteger, isRational, isUnit } from '../types.js';
import { giac } from '../cas/giac-engine.mjs';
import { RPLError, checkTimeLimit } from '../stack.js';
import { buildGiacCmd, giacToAst, splitGiacList, astToGiac } from '../cas/giac-convert.mjs';
import { Neg as AstNeg, Num as AstNum, Bin as AstBin, Var as AstVar, isNum as astIsNum, Fn as AstFn, freeVars as algebraFreeVars, isKnownFunction } from '../algebra.js';
import { getComplexMode, getCasVx, setCasVx } from '../state.js';
import { register, lookup } from './registry.js';
import { _astToRplValue, _pushCasResult, _isSymOperand, _toAst, _withListUnary, _withTaggedUnary, _withVMUnary } from './internal.js';



function _casEval(ast, wrap, vars) {
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  return giacToAst(giac.caseval(buildGiacCmd(ast, wrap, vars)));
}

function _varName(v) {
  if (isName(v)) return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}

function _astArg(v) {
  const ast = _toAst(v);
  if (!ast) throw new RPLError('Bad argument type');
  return ast;
}

// Numbers and bare names pass through, so these compose with any operand.
function _casUnary(giacFn) {
  return (s) => {
    const v = s.pop();
    if (isSymbolic(v)) _pushCasResult(s, _casEval(v.expr, (e) => `${giacFn}(${e})`));
    else if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) s.push(v);
    else throw new RPLError('Bad argument type');
  };
}

const _simplify = _casUnary('simplify');


register('EXPAND', _casUnary('expand'), { category: 'CAS / symbolic', categoryOrder: 6, label: "EXPAND" });


register('COLLECT', (s) => {
  const top = s.peek();
  if ((isName(top) || isString(top)) && isSymbolic(s.peek(2))) {
    const [expr, v] = s.popN(2);
    const varName = _varName(v);
    _pushCasResult(s, _casEval(expr.expr, (e) => `collect(${e},${varName})`, [varName]));
    return;
  }
  _simplify(s);
}, { category: 'CAS / symbolic', categoryOrder: 7, label: "COLLECT" });


register('SIMPLIFY', _simplify, { category: 'CAS / symbolic', categoryOrder: 15, label: "SIMPLIFY" });


register('FACTOR', (s) => {
  const popped = s.pop();
  const v = isSymbolic(popped) && popped.expr.kind === 'num' ? _astToRplValue(popped.expr) : popped;
  if (isSymbolic(v)) {
    _pushCasResult(s, _casEval(v.expr, (e) => `factor(${e})`));
    return;
  }
  if (isInteger(v) || (isReal(v) && v.value.isInteger())) {
    s.push(_factorInteger(v));
    return;
  }
  if (isReal(v) || isRational(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 8, label: "FACTOR" });


// Giac prints factor(12) as (2)^2*3, so integers are factored natively;
// past 2^53 trial division is too slow and ifactor takes over.
function _factorInteger(v) {
  const n = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
  const abs = n < 0n ? -n : n;
  if (abs < 2n) return v;
  let ast;
  if (abs > BigInt(Number.MAX_SAFE_INTEGER)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    ast = giacToAst(giac.caseval(`ifactor(${abs})`));
  } else {
    ast = _factorsToAst(_primeFactor(abs));
  }
  return Symbolic(n < 0n ? AstNeg(ast) : ast);
}


function _primeFactor(n) {
  const factors = [];
  let rem = n;
  if (rem % 2n === 0n) {
    let e = 0;
    while (rem % 2n === 0n) { rem /= 2n; e++; }
    factors.push({ p: 2n, e });
  }
  for (let p = 3n; p * p <= rem; p += 2n) {
    checkTimeLimit();
    if (rem % p !== 0n) continue;
    let e = 0;
    while (rem % p === 0n) { rem /= p; e++; }
    factors.push({ p, e });
  }
  if (rem > 1n) factors.push({ p: rem, e: 1 });
  return factors;
}


function _factorsToAst(factors) {
  const terms = factors.map(({ p, e }) => {
    const pAst = AstNum(Number(p));
    return e === 1 ? pAst : AstBin('^', pAst, AstNum(e));
  });
  return terms.reduce((acc, t) => AstBin('*', acc, t));
}


register('SOLVE', (s) => {
  const [exprArg, varArg] = s.popN(2);
  const varName = _varName(varArg);
  let ast = _astArg(exprArg);
  // Giac reads `=` differently under its Maple/Mupad modes; `lhs - rhs` is unambiguous.
  if (ast.kind === 'bin' && ast.op === '=') ast = AstBin('-', ast.l, ast.r);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  // Complex mode (flag -103) also looks for complex roots, as on the HP50.
  const cmplx = getComplexMode();
  const solveFn = cmplx ? 'csolve' : 'solve';
  let raw = giac.caseval(buildGiacCmd(ast, (e) => `${solveFn}(${e},${varName})`, [varName]));
  // Roots without a radical form come back as rootof(...), which the parser
  // cannot read, so ask again for numeric roots.
  if (typeof raw === 'string' && raw.includes('rootof')) {
    const fsolveFn = cmplx ? 'cfsolve' : 'fsolve';
    raw = giac.caseval(buildGiacCmd(ast, (e) => `${fsolveFn}(${e},${varName})`, [varName]));
  }
  // Some builds return a lone root without the list brackets.
  const trimmed = String(raw).trim();
  const roots = splitGiacList(raw) ?? (trimmed ? [trimmed] : []);
  s.push(RList(roots.map((r) => Symbolic(AstBin('=', AstVar(varName), giacToAst(r))))));
}, { category: 'CAS / symbolic', categoryOrder: 9, label: "SOLVE" });


// Giac has no isolate, so ISOL returns every branch SOLVE finds rather
// than the HP50's single equation with sign placeholders.
register('ISOL', lookup('SOLVE').fn, { category: 'CAS / symbolic', categoryOrder: 10, label: "ISOL" });


register('SUBST', (s) => {
  const top = s.peek();
  if (isList(top)) {
    const [exprVal, { items }] = s.popN(2);
    let ast = _astArg(exprVal);
    for (let i = 0; i < items.length; i++) {
      if (_isEquationSymbolic(items[i])) {
        ast = _substVar(ast, items[i].expr.l.name, items[i].expr.r);
        continue;
      }
      if (i + 1 >= items.length) throw new RPLError('Bad argument value');
      ast = _substVar(ast, _varName(items[i]), _astArg(items[i + 1]));
      i++;
    }
    _pushSubstResult(s, ast);
    return;
  }
  if (_isEquationSymbolic(top)) {
    const [exprVal, eqn] = s.popN(2);
    _pushSubstResult(s, _substVar(_astArg(exprVal), eqn.expr.l.name, eqn.expr.r));
    return;
  }
  const [exprVal, varVal, valueVal] = s.popN(3);
  _pushSubstResult(s, _substVar(_astArg(exprVal), _varName(varVal), _astArg(valueVal)));
}, { category: 'CAS / symbolic', categoryOrder: 4, label: "SUBST" });


function _substVar(ast, name, valueAst) {
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const valueGiac = astToGiac(valueAst);
  return giacToAst(giac.caseval(buildGiacCmd(ast, (e) => `subst(${e},${name}=${valueGiac})`, [name])));
}


function _isEquationSymbolic(v) {
  return isSymbolic(v) && v.expr?.kind === 'bin' && v.expr.op === '=' && v.expr.l.kind === 'var';
}


function _pushSubstResult(s, ast) {
  if (ast && ast.kind === 'var') { s.push(Name(ast.name)); return; }
  _pushCasResult(s, ast);
}


register('DERIV', (s) => {
  const [expr, varArg] = s.popN(2);
  const varName = _varName(varArg);
  if (isSymbolic(expr)) {
    _pushCasResult(s, _casEval(expr.expr, (e) => `diff(${e},${varName})`, [varName]));
    return;
  }
  if (isReal(expr) || isInteger(expr) || isUnit(expr)) {
    s.push(Real(0));
    return;
  }
  if (isName(expr)) {
    s.push(Integer(expr.id === varName ? 1n : 0n));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 0, label: "DERIV" });


register('INTEG', (s) => {
  const [expr, varArg] = s.popN(2);
  const varName = _varName(varArg);
  if ((isInteger(expr) && expr.value === 0n) || (isReal(expr) && expr.value.isZero())) {
    s.push(Integer(0n));
    return;
  }
  s.push(Symbolic(_casEval(_astArg(expr), (e) => `integrate(${e},${varName})`, [varName])));
}, { category: 'CAS / symbolic', categoryOrder: 2, label: "INTEG" });


function _vxForm(opName) {
  return (s) => {
    if (s.depth < 1) throw new RPLError('Too few arguments');
    s.push(Name(getCasVx()));
    lookup(opName).fn(s);
  };
}

register('INTVX', _vxForm('INTEG'), { category: 'CAS / symbolic', categoryOrder: 3, label: "INTVX" });

register('DERVX', _vxForm('DERIV'), { category: 'CAS / symbolic', categoryOrder: 1, label: "DERVX" });


// Rebuilds the tree bottom-up and offers each rebuilt node to `rewrite`.
// A rewrite's result is not walked again, so HALFTAN's new TAN(x/2) and
// EXPLN's new EXP nodes are left alone.
function _rewriteAst(ast, rewrite) {
  let node = ast;
  if (ast.kind === 'neg') {
    const arg = _rewriteAst(ast.arg, rewrite);
    if (arg !== ast.arg) node = AstNeg(arg);
  } else if (ast.kind === 'bin') {
    const l = _rewriteAst(ast.l, rewrite);
    const r = _rewriteAst(ast.r, rewrite);
    if (l !== ast.l || r !== ast.r) node = AstBin(ast.op, l, r);
  } else if (ast.kind === 'fn') {
    const args = ast.args.map((a) => _rewriteAst(a, rewrite));
    if (args.some((a, i) => a !== ast.args[i])) node = AstFn(ast.name, args);
  }
  return rewrite(node) ?? node;
}

function _fnRewrites(map) {
  return (n) => (n.kind === 'fn' && n.args.length === 1 && map[n.name] ? map[n.name](n.args[0]) : null);
}

function _rewriteOp(rewrite) {
  return (s) => {
    const [v] = s.popN(1);
    if (!isSymbolic(v)) throw new RPLError('Bad argument type');
    s.push(Symbolic(_rewriteAst(v.expr, rewrite)));
  };
}


// HP50 reads EPS from the current directory; this is its factory value.
const _EPSX0_THRESHOLD = 1e-10;

function _epsx0Node(n) {
  if (astIsNum(n) && Math.abs(n.value) < _EPSX0_THRESHOLD) return AstNum(0);
  if (n.kind === 'neg' && astIsNum(n.arg) && n.arg.value === 0) return AstNum(0);
  return null;
}

function _epsx0Item(v) {
  if (isSymbolic(v)) return Symbolic(_rewriteAst(v.expr, _epsx0Node));
  if (isReal(v)) return v.value.abs().lt(_EPSX0_THRESHOLD) ? Real(0) : v;
  if (isComplex(v)) {
    const r = Math.abs(v.re) < _EPSX0_THRESHOLD ? 0 : v.re;
    const i = Math.abs(v.im) < _EPSX0_THRESHOLD ? 0 : v.im;
    return i === 0 ? Real(r) : Complex(r, i);
  }
  return v;
}


register('EPSX0', (s) => {
  const v = s.pop();
  if (isList(v)) s.push(RList(v.items.map(_epsx0Item)));
  else if (isVector(v)) s.push(Vector(v.items.map(_epsx0Item)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map((row) => row.map(_epsx0Item))));
  else if (isSymbolic(v) || isReal(v) || isInteger(v) || isComplex(v)) s.push(_epsx0Item(v));
  else throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 14, label: "EPSX0" });


const _isSum = (n) => n.kind === 'bin' && (n.op === '+' || n.op === '-');

// The HP50 distributes once per call, at the first eligible node in pre-order.
function _distribOnce(ast) {
  if (ast.kind === 'bin') {
    const { op, l, r } = ast;
    if (op === '*' && _isSum(r)) return AstBin(r.op, AstBin('*', l, r.l), AstBin('*', l, r.r));
    if ((op === '*' || op === '/') && _isSum(l)) return AstBin(l.op, AstBin(op, l.l, r), AstBin(op, l.r, r));
    const nl = _distribOnce(l);
    if (nl) return AstBin(op, nl, r);
    const nr = _distribOnce(r);
    return nr && AstBin(op, l, nr);
  }
  if (ast.kind === 'neg') {
    const arg = _distribOnce(ast.arg);
    return arg && AstNeg(arg);
  }
  if (ast.kind === 'fn') {
    for (let i = 0; i < ast.args.length; i++) {
      const arg = _distribOnce(ast.args[i]);
      if (arg) return AstFn(ast.name, ast.args.map((a, j) => (j === i ? arg : a)));
    }
  }
  return null;
}


register('DISTRIB', (s) => {
  const v = s.pop();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_distribOnce(v.expr) ?? v.expr));
}, { category: 'CAS / symbolic', categoryOrder: 11, label: "DISTRIB" });


register('XNUM', (s, entry) => { lookup('→NUM').fn(s, entry); }, { category: 'CAS / symbolic', categoryOrder: 42, label: "XNUM" });

register('XQ',   (s, entry) => { lookup('→Q').fn(s, entry); }, { category: 'CAS / symbolic', categoryOrder: 43, label: "XQ" });


register('VX', (s) => {
  s.push(Name(getCasVx()));
}, { category: 'CAS / symbolic', categoryOrder: 40, label: "VX" });


register('SVX', (s) => {
  const name = _varName(s.pop());
  if (!isValidHpIdentifier(name)) throw new RPLError(`Invalid name: ${name}`);
  setCasVx(name);
}, { category: 'CAS / symbolic', categoryOrder: 41, label: "SVX" });


register('PREVAL', (s) => {
  const top = s.peek();
  if (s.depth >= 2 && isList(top) && top.items.length === 2) {
    s.pop();
    s.push(top.items[0]);
    s.push(top.items[1]);
  }
  const [fVal, aVal, bVal] = s.popN(3);
  if (!isSymbolic(fVal)) throw new RPLError('Bad argument type');
  const vars = algebraFreeVars(fVal.expr);
  const vx = getCasVx();
  const varName = !vars.has(vx) && vars.size === 1 ? [...vars][0] : vx;
  const endpointAst = (v) => (isBinaryInteger(v) ? AstNum(v.value) : _astArg(v));
  const aAst = endpointAst(aVal);
  const bAst = endpointAst(bVal);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const aG = astToGiac(aAst);
  const bG = astToGiac(bAst);
  const cmd = buildGiacCmd(
    fVal.expr,
    (e) => `simplify(subst(${e},${varName}=${bG})-subst(${e},${varName}=${aG}))`,
    [varName],
  );
  _pushCasResult(s, giacToAst(giac.caseval(cmd)));
}, { category: 'CAS / symbolic', categoryOrder: 5, label: "PREVAL" });


register('TAN2SC', _rewriteOp(_fnRewrites({
  TAN: (x) => AstBin('/', AstFn('SIN', [x]), AstFn('COS', [x])),
})), { category: 'CAS / symbolic', categoryOrder: 26, label: "TAN2SC" });


register('EXLR', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  if (v.expr?.kind !== 'bin') throw new RPLError('Bad argument value');
  s.push(Symbolic(v.expr.l));
  s.push(Symbolic(v.expr.r));
}, { category: 'CAS / symbolic', categoryOrder: 38, label: "EXLR" });


register('LNAME', (s) => {
  const v = s.peek();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const names = new Set();
  (function visit(n) {
    if (n.kind === 'var') {
      names.add(n.name);
    } else if (n.kind === 'neg') {
      visit(n.arg);
    } else if (n.kind === 'bin') {
      visit(n.l);
      visit(n.r);
    } else if (n.kind === 'fn') {
      if (!isKnownFunction(n.name)) names.add(n.name);
      n.args.forEach(visit);
    }
  })(v.expr);
  // AUR p.3-136: longest first, then alphabetical.
  const ids = [...names].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  s.push(Vector(ids.map((id) => Name(id))));
}, { category: 'CAS / symbolic', categoryOrder: 39, label: "LNAME" });


function _lapVarName(ast) {
  const vx = getCasVx();
  const vars = algebraFreeVars(ast);
  return vars.size === 0 || vars.has(vx) ? vx : [...vars][0];
}

// The HP50 transforms in place (X -> X), so the same name is passed as
// both Giac variables.
function _laplaceOp(giacFn) {
  return (s) => {
    const [v] = s.popN(1);
    if (!_isSymOperand(v)) throw new RPLError('Bad argument type');
    const expr = _toAst(v);
    const x = _lapVarName(expr);
    _pushCasResult(s, _casEval(expr, (e) => `${giacFn}(${e},${x},${x})`, [x]));
  };
}

register('LAPLACE', _laplaceOp('laplace'), { category: 'CAS / symbolic', categoryOrder: 31, label: "LAPLACE" });

register('ILAP', _laplaceOp('ilaplace'), { category: 'CAS / symbolic', categoryOrder: 32, label: "ILAP" });


const _two = (x) => AstBin('*', AstNum(2), x);
const _half = (x) => AstBin('/', x, AstNum(2));
const _halfTan = (x) => AstFn('TAN', [_half(x)]);
const _halfTanSq = (x) => AstBin('^', _halfTan(x), AstNum(2));

register('HALFTAN', _rewriteOp(_fnRewrites({
  SIN: (x) => AstBin('/', _two(_halfTan(x)), AstBin('+', AstNum(1), _halfTanSq(x))),
  COS: (x) => AstBin('/', AstBin('-', AstNum(1), _halfTanSq(x)), AstBin('+', AstNum(1), _halfTanSq(x))),
  TAN: (x) => AstBin('/', _two(_halfTan(x)), AstBin('-', AstNum(1), _halfTanSq(x))),
})), { category: 'CAS / symbolic', categoryOrder: 20, label: "HALFTAN" });


register('TAN2SC2', _rewriteOp(_fnRewrites({
  TAN: (x) => AstBin('/', AstFn('SIN', [_two(x)]), AstBin('+', AstNum(1), AstFn('COS', [_two(x)]))),
})), { category: 'CAS / symbolic', categoryOrder: 27, label: "TAN2SC2" });


register('TAN2CS2', _rewriteOp(_fnRewrites({
  TAN: (x) => AstBin('/', AstBin('-', AstNum(1), AstFn('COS', [_two(x)])), AstFn('SIN', [_two(x)])),
})), { category: 'CAS / symbolic', categoryOrder: 28, label: "TAN2CS2" });


// PI stays a name so the result survives EXACT mode.
const _PI_OVER_2 = _half(AstVar('PI'));
const _sq = (x) => AstBin('^', x, AstNum(2));
const _sqrt = (x) => AstFn('SQRT', [x]);
const _oneMinusSq = (x) => AstBin('-', AstNum(1), _sq(x));

register('ACOS2S', _rewriteOp(_fnRewrites({
  ACOS: (x) => AstBin('-', _PI_OVER_2, AstFn('ASIN', [x])),
})), { category: 'CAS / symbolic', categoryOrder: 22, label: "ACOS2S" });


register('ASIN2C', _rewriteOp(_fnRewrites({
  ASIN: (x) => AstBin('-', _PI_OVER_2, AstFn('ACOS', [x])),
})), { category: 'CAS / symbolic', categoryOrder: 23, label: "ASIN2C" });


register('ASIN2T', _rewriteOp(_fnRewrites({
  ASIN: (x) => AstFn('ATAN', [AstBin('/', x, _sqrt(_oneMinusSq(x)))]),
})), { category: 'CAS / symbolic', categoryOrder: 24, label: "ASIN2T" });


register('ATAN2S', _rewriteOp(_fnRewrites({
  ATAN: (x) => AstFn('ASIN', [AstBin('/', x, _sqrt(AstBin('+', _sq(x), AstNum(1))))]),
})), { category: 'CAS / symbolic', categoryOrder: 25, label: "ATAN2S" });


const _fnProduct = (f, a, g, b) => AstBin('*', AstFn(f, [a]), AstFn(g, [b]));

function _texpandSin(x) {
  if (x.kind === 'neg') return AstNeg(AstFn('SIN', [x.arg]));
  if (!_isSum(x)) return null;
  return AstBin(x.op, _fnProduct('SIN', x.l, 'COS', x.r), _fnProduct('COS', x.l, 'SIN', x.r));
}

function _texpandCos(x) {
  if (x.kind === 'neg') return AstFn('COS', [x.arg]);
  if (!_isSum(x)) return null;
  return AstBin(x.op === '+' ? '-' : '+', _fnProduct('COS', x.l, 'COS', x.r), _fnProduct('SIN', x.l, 'SIN', x.r));
}

function _texpandTan(x) {
  if (x.kind === 'neg') return AstNeg(AstFn('TAN', [x.arg]));
  if (!_isSum(x)) return null;
  const ta = AstFn('TAN', [x.l]);
  const tb = AstFn('TAN', [x.r]);
  return AstBin('/', AstBin(x.op, ta, tb), AstBin(x.op === '+' ? '-' : '+', AstNum(1), AstBin('*', ta, tb)));
}

register('TEXPAND', _rewriteOp(_fnRewrites({
  SIN: _texpandSin,
  COS: _texpandCos,
  TAN: _texpandTan,
})), { category: 'CAS / symbolic', categoryOrder: 16, label: "TEXPAND" });


const _isSinCos = (n) => n.kind === 'fn' && n.args.length === 1 && (n.name === 'SIN' || n.name === 'COS');

function _tlinProduct(l, r) {
  if (!_isSinCos(l) || !_isSinCos(r)) return null;
  const sum = AstBin('+', l.args[0], r.args[0]);
  const diff = AstBin('-', l.args[0], r.args[0]);
  let num;
  if (l.name === 'SIN' && r.name === 'SIN') num = AstBin('-', AstFn('COS', [diff]), AstFn('COS', [sum]));
  else if (l.name === 'COS' && r.name === 'COS') num = AstBin('+', AstFn('COS', [diff]), AstFn('COS', [sum]));
  else num = AstBin(l.name === 'SIN' ? '+' : '-', AstFn('SIN', [sum]), AstFn('SIN', [diff]));
  return AstBin('/', num, AstNum(2));
}

function _tlinSquare(base, exp) {
  if (!_isSinCos(base) || exp.kind !== 'num' || exp.value !== 2) return null;
  const cos2a = AstFn('COS', [_two(base.args[0])]);
  return AstBin('/', AstBin(base.name === 'SIN' ? '-' : '+', AstNum(1), cos2a), AstNum(2));
}

function _tlinRewrite(n) {
  if (n.kind !== 'bin') return null;
  if (n.op === '*') return _tlinProduct(n.l, n.r);
  if (n.op === '^') return _tlinSquare(n.l, n.r);
  return null;
}

register('TLIN', _rewriteOp(_tlinRewrite), { category: 'CAS / symbolic', categoryOrder: 17, label: "TLIN" });


function _tcollectRewrite(n) {
  if (!_isSum(n)) return null;
  const { op, l, r } = n;
  if (!_isSinCos(l) || !_isSinCos(r) || l.name !== r.name) return null;
  const sum = _half(AstBin('+', l.args[0], r.args[0]));
  const diff = _half(AstBin('-', l.args[0], r.args[0]));
  const product = (f, g) => AstBin('*', _two(AstFn(f, [sum])), AstFn(g, [diff]));
  if (l.name === 'SIN') return op === '+' ? product('SIN', 'COS') : product('COS', 'SIN');
  return op === '+' ? product('COS', 'COS') : AstNeg(product('SIN', 'SIN'));
}

register('TCOLLECT', _rewriteOp(_tcollectRewrite), { category: 'CAS / symbolic', categoryOrder: 18, label: "TCOLLECT" });


const _I = AstVar('i');
const _exp = (x) => AstFn('EXP', [x]);
const _ln = (x) => AstFn('LN', [x]);
const _eIx = (x) => _exp(AstBin('*', _I, x));
const _eNegIx = (x) => _exp(AstBin('*', AstNeg(_I), x));
const _eNegX = (x) => _exp(AstNeg(x));
const _lnRatio = (a) => _ln(AstBin('/', AstBin('+', AstNum(1), a), AstBin('-', AstNum(1), a)));

const _EXPLN_REWRITES = {
  SIN: (x) => AstBin('/', AstBin('-', _eIx(x), _eNegIx(x)), _two(_I)),
  COS: (x) => _half(AstBin('+', _eIx(x), _eNegIx(x))),
  TAN: (x) => AstBin('/', AstBin('-', _eIx(x), _eNegIx(x)), AstBin('*', _I, AstBin('+', _eIx(x), _eNegIx(x)))),
  SINH: (x) => _half(AstBin('-', _exp(x), _eNegX(x))),
  COSH: (x) => _half(AstBin('+', _exp(x), _eNegX(x))),
  TANH: (x) => AstBin('/', AstBin('-', _exp(x), _eNegX(x)), AstBin('+', _exp(x), _eNegX(x))),
  ASIN: (x) => AstNeg(AstBin('*', _I, _ln(AstBin('+', AstBin('*', _I, x), _sqrt(_oneMinusSq(x)))))),
  ACOS: (x) => AstNeg(AstBin('*', _I, _ln(AstBin('+', x, AstBin('*', _I, _sqrt(_oneMinusSq(x))))))),
  ATAN: (x) => AstNeg(AstBin('*', _half(_I), _lnRatio(AstBin('*', _I, x)))),
  ASINH: (x) => _ln(AstBin('+', x, _sqrt(AstBin('+', _sq(x), AstNum(1))))),
  ACOSH: (x) => _ln(AstBin('+', x, _sqrt(AstBin('-', _sq(x), AstNum(1))))),
  ATANH: (x) => AstBin('*', _half(AstNum(1)), _lnRatio(x)),
};

register('EXPLN', _rewriteOp(_fnRewrites(_EXPLN_REWRITES)), { category: 'CAS / symbolic', categoryOrder: 12, label: "EXPLN" });


// HEAVISIDE(0) = 1, as on the HP50.
register('HEAVISIDE', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  if (isReal(v))                          { s.push(Real(v.value.toNumber() >= 0 ? 1 : 0)); return; }
  if (isInteger(v) || isBinaryInteger(v)) { s.push(Integer(v.value >= 0n ? 1n : 0n)); return; }
  if (_isSymOperand(v))                   { s.push(Symbolic(AstFn('HEAVISIDE', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))), { category: 'CAS / symbolic', categoryOrder: 29, label: "HEAVISIDE" });


// The spike at the origin has no numeric value, so DIRAC(0) stays symbolic.
register('DIRAC', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  const diracAtZero = () => Symbolic(AstFn('DIRAC', [AstNum(0)]));
  if (isReal(v))                          { s.push(v.value.isZero() ? diracAtZero() : Real(0)); return; }
  if (isInteger(v) || isBinaryInteger(v)) { s.push(v.value === 0n ? diracAtZero() : Integer(0n)); return; }
  if (_isSymOperand(v))                   { s.push(Symbolic(AstFn('DIRAC', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))), { category: 'CAS / symbolic', categoryOrder: 30, label: "DIRAC" });


register('TSIMP', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  _pushCasResult(s, _casEval(v.expr, (e) => `tsimplify(${e})`));
}, { category: 'CAS / symbolic', categoryOrder: 19, label: "TSIMP" });


const _isLn = (n) => n.kind === 'fn' && n.name === 'LN' && n.args.length === 1;

// Only numeric coefficients fold into the logarithm, as on the HP50.
function _lncollectRewrite(n) {
  if (n.kind !== 'bin') return null;
  const { op, l, r } = n;
  if ((op === '+' || op === '-') && _isLn(l) && _isLn(r)) {
    return _ln(AstBin(op === '+' ? '*' : '/', l.args[0], r.args[0]));
  }
  if (op === '*') {
    if (l.kind === 'num' && _isLn(r)) return _ln(AstBin('^', r.args[0], l));
    if (r.kind === 'num' && _isLn(l)) return _ln(AstBin('^', l.args[0], r));
  }
  return null;
}

register('LNCOLLECT', _rewriteOp(_lncollectRewrite), { category: 'CAS / symbolic', categoryOrder: 13, label: "LNCOLLECT" });


register('PROPFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v) || isRational(v)) _pushCasResult(s, _casEval(_toAst(v), (e) => `propfrac(${e})`));
  else if (isReal(v) || isInteger(v) || isName(v)) s.push(v);
  else throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 37, label: "PROPFRAC" });


register('PARTFRAC', _casUnary('partfrac'), { category: 'CAS / symbolic', categoryOrder: 36, label: "PARTFRAC" });


register('COSSIN', _casUnary('tan2sincos'), { category: 'CAS / symbolic', categoryOrder: 21, label: "COSSIN" });


register('LIN', _casUnary('lin'), { category: 'CAS / symbolic', categoryOrder: 35, label: "LIN" });


// A bare point is approached by VX.  Names go through astToGiac so that
// ∞ and INFINITY become Giac's ±infinity.
function _limitPoint(v) {
  const vx = getCasVx();
  if (isSymbolic(v)) {
    const ast = v.expr;
    if (ast.kind !== 'bin' || ast.op !== '=') return { varName: vx, valGiac: astToGiac(ast) };
    if (ast.l.kind !== 'var') throw new RPLError('Bad argument value');
    return { varName: ast.l.name, valGiac: astToGiac(ast.r) };
  }
  if (isInteger(v) || isReal(v)) return { varName: vx, valGiac: v.value.toString() };
  if (isRational(v)) return { varName: vx, valGiac: `(${v.n}/${v.d})` };
  if (isName(v)) return { varName: vx, valGiac: astToGiac(AstVar(v.id)) };
  throw new RPLError('Bad argument type');
}


register('LIMIT', (s) => {
  const [exprArg, pointArg] = s.popN(2);
  if (!_isSymOperand(exprArg)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const { varName, valGiac } = _limitPoint(pointArg);
  const cmd = buildGiacCmd(_toAst(exprArg), (e) => `limit(${e},${varName},${valGiac})`, [varName]);
  _pushCasResult(s, giacToAst(giac.caseval(cmd)));
}, { category: 'CAS / symbolic', categoryOrder: 34, label: "LIMIT" });


register('lim', (s) => { lookup('LIMIT').fn(s); }, { category: 'CAS / symbolic', categoryOrder: 33, label: "LIM" });
