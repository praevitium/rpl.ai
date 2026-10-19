import { isSymbolic, Symbolic, isReal, isInteger, isName, isString, RList, isList, Real, Name, Integer, isComplex, Complex, isVector, Vector, isMatrix, Matrix, isCasIdentifier, isBinaryInteger, isRational, isUnit, Tagged, Program, isProgram } from '../types.js';
import { giac } from '../cas/giac-engine.mjs';
import { RPLError, checkTimeLimit } from '../stack.js';
import { buildGiacCmd, giacToAst, splitGiacList, astToGiac, isGiacErrorString } from '../cas/giac-convert.mjs';
import { Neg as AstNeg, Num as AstNum, Bin as AstBin, Var as AstVar, isNum as astIsNum, Fn as AstFn, freeVars as algebraFreeVars, evalAst as algebraEvalAst, isKnownFunction, LOGIC_ARITY, formatAlgebra } from '../algebra.js';
import { getComplexMode, getCasVx, setCasVx, getApproxMode, getCasModulo } from '../state.js';
import { register, lookup } from './registry.js';
import { _astToRplValue, _pushCasResult, _isSymOperand, _toAst, _substitute, _withListUnary, _withTaggedUnary, _withVMUnary, recallVar, storeVar } from './internal.js';



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

// EXPAN, COLCT and LAP are the HP's other names for EXPAND, COLLECT and LAPLACE.
register('EXPAN', lookup('EXPAND').fn, { category: 'CAS / symbolic', categoryOrder: 6, label: "EXPAN" });


// FACTOR, and COLLECT, which factors over the integers only (no square roots), as the AUR says.
function _factorWith(giacFn) {
  return (s) => {
    const popped = s.pop();
    const v = isSymbolic(popped) && popped.expr.kind === 'num' ? _astToRplValue(popped.expr) : popped;
    if (isSymbolic(v)) {
      _pushCasResult(s, _casEval(v.expr, (e) => `${giacFn}(${e})`));
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
  };
}

const _collect = _factorWith('collect');

register('COLLECT', (s) => {
  const top = s.peek();
  if ((isName(top) || isString(top)) && isSymbolic(s.peek(2))) {
    const [expr, v] = s.popN(2);
    const varName = _varName(v);
    _pushCasResult(s, _casEval(expr.expr, (e) => `collect(${e},${varName})`, [varName]));
    return;
  }
  _collect(s);
}, { category: 'CAS / symbolic', categoryOrder: 7, label: "COLLECT" });

register('COLCT', lookup('COLLECT').fn, { category: 'CAS / symbolic', categoryOrder: 7, label: "COLCT" });


register('SIMPLIFY', _simplify, { category: 'CAS / symbolic', categoryOrder: 15, label: "SIMPLIFY" });


register('FACTOR', _factorWith('factor'), { category: 'CAS / symbolic', categoryOrder: 8, label: "FACTOR" });


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


// The AUR: a list of equations and expressions is each solved for the same variable, giving a list of lists.
const _solveEach = (exprArg, varFor) => (isList(exprArg) ? RList(exprArg.items.map((e) => _solveFor(e, varFor(e)))) : _solveFor(exprArg, varFor(exprArg)));

register('SOLVE', (s) => {
  const [exprArg, varArg] = s.popN(2);
  const varName = _varName(varArg);
  s.push(_solveEach(exprArg, () => varName));
}, { category: 'CAS / symbolic', categoryOrder: 9, label: "SOLVE" });

register('SOLVEVX', (s) => { s.push(_solveEach(s.pop(), (e) => _vxFor(_toAst(e)))); }, { category: 'CAS / symbolic', categoryOrder: 9.5, label: "SOLVEVX" });

function _solveFor(exprArg, varName) {
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
  // An inequality solves to conditions such as X<-2, which stand on their own.
  const isCondition = (root) => (root.kind === 'bin' && root.op in COMPARISON_OPS) || (root.kind === 'fn' && root.name in LOGIC_ARITY);
  return RList(roots.map(giacToAst).map((root) => Symbolic(isCondition(root) ? root : AstBin('=', AstVar(varName), root))));
}

const COMPARISON_OPS = { '<': 1, '>': 1, '≤': 1, '≥': 1, '≠': 1, '==': 1 };


// Giac has no isolate, so ISOL returns every branch SOLVE finds rather
// than the HP50's single equation with sign placeholders.
register('ISOL', lookup('SOLVE').fn, { category: 'CAS / symbolic', categoryOrder: 10, label: "ISOL" });

// A system's equations, an expression set equal to zero, and its variables, as Giac's syst2mat and linsolve take them.
function _linearSystem(eqsArg, varsArg) {
  const items = (v) => (isVector(v) || isList(v) ? v.items : [v]);
  const asZero = (e) => (e.kind === 'bin' && e.op === '=' ? AstBin('-', e.l, e.r) : e);
  const eqs = items(eqsArg).map((e) => astToGiac(asZero(_astArg(e))));
  const vars = items(varsArg).map(_varName);
  if (!eqs.length || !vars.length) throw new RPLError('Bad argument value');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  return { system: `[${eqs.join(',')}],[${vars.map((v) => astToGiac(AstVar(v))).join(',')}]`, vars };
}

// LINSOLVE ( [eqs] [vars] → { [eqs] [vars] } { pivots } [solution] ). The pivots are those of the CAS's
// Gaussian reduction, a free variable stays out of the solution, and a system with no solution gives [ ].
register('LINSOLVE', (s) => {
  const [eqsArg, varsArg] = s.popN(2);
  const { system, vars } = _linearSystem(eqsArg, varsArg);
  const reduced = splitGiacList(giac.caseval(`lu(delcols(syst2mat(${system}),${vars.length}))[2]`)) ?? [];
  const pivots = reduced.map((row) => (splitGiacList(row) ?? []).find((cell) => !/^-?0(\.0*)?$/.test(cell))).filter(Boolean);
  const values = splitGiacList(giac.caseval(`linsolve(${system})`)) ?? [];
  const solution = values.map(giacToAst).map((value, i) => AstBin('=', AstVar(vars[i]), value))
    .filter((eq) => !(eq.r.kind === 'var' && eq.r.name === eq.l.name));
  s.push(RList([eqsArg, varsArg]));
  s.push(RList(pivots.map((p) => _casValue(giacToAst(p)))));
  s.push(Vector(solution.map(Symbolic)));
}, { category: 'CAS / symbolic', categoryOrder: 9.5, label: "LINSOLVE" });


// SYST2MAT ( [eqs] [vars] → [[ coefficients constant ]] ): a row per equation, its constant moved to the left
// side as the AUR's example shows (X-Y=0, 2X+Y=5 gives [[ 1 -1 0 ][ 2 1 -5 ]]); a term that isn't linear is refused.
register('SYST2MAT', (s) => {
  const [eqsArg, varsArg] = s.popN(2);
  const { system, vars } = _linearSystem(eqsArg, varsArg);
  const rows = (splitGiacList(giac.caseval(`syst2mat(${system})`)) ?? []).map((row) => (splitGiacList(row) ?? []).map(giacToAst));
  const linear = rows.length && rows.every((row) => row.every((cell) => !vars.some((v) => algebraFreeVars(cell).has(v))));
  if (!linear) throw new RPLError('Bad argument value');
  s.push(Matrix(rows.map((row) => row.map(_casValue))));
}, { category: 'CAS / symbolic', categoryOrder: 9.5, label: "SYST2MAT" });

// SIMP2 ( a b → a/gcd b/gcd ): the AUR's example leaves X+3 and X-3 from X^3+6*X^2+11*X+6 and X^3-7*X-6.
register('SIMP2', (s) => {
  const [a, b] = s.popN(2);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const parts = splitGiacList(giac.caseval(`simp2(${astToGiac(_astArg(a))},${astToGiac(_astArg(b))})`));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  for (const part of parts) s.push(_casValue(giacToAst(part)));
}, { category: 'Polynomials', categoryOrder: 8.5, label: "SIMP2" });

// The list stays on the stack under its GCD, as the AUR stacks it.
register('LGCD', (s) => {
  const [list] = s.popN(1);
  if (!isList(list) || !list.items.length) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const gcd = giacToAst(giac.caseval(`lgcd([${list.items.map((v) => astToGiac(_astArg(v))).join(',')}])`));
  s.push(list);
  s.push(_casValue(gcd));
}, { category: 'Polynomials', categoryOrder: 8.55, label: "LGCD" });

// The polynomial forms of IDIV2, IEGCD and IABCUV: Giac's answer, taken in the order the AUR stacks it.
function _polyArith(giacFn, argc, order) {
  return (s) => {
    const args = s.popN(argc).map(_astArg);
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const parts = splitGiacList(giac.caseval(`${giacFn}(${args.map(astToGiac).join(',')},${_vxFor(...args)})`));
    if (parts?.length !== order.length) throw new RPLError('Bad argument value');
    for (const i of order) s.push(_casValue(giacToAst(parts[i])));
  };
}

register('DIV2', _polyArith('quorem', 2, [0, 1]), { category: 'Polynomials', categoryOrder: 8.6, label: "DIV2" });
register('EGCD', _polyArith('egcd', 2, [2, 0, 1]), { category: 'Polynomials', categoryOrder: 8.7, label: "EGCD" });
register('ABCUV', _polyArith('abcuv', 3, [0, 1]), { category: 'Polynomials', categoryOrder: 8.8, label: "ABCUV" });

// AUR: a 2×n matrix of x and y values gives the polynomial through them, over one denominator.
register('LAGRANGE', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  if (m.rows.length !== 2) throw new RPLError('Invalid dimension');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const [xs, ys] = m.rows.map((row) => `[${row.map((v) => astToGiac(_astArg(v))).join(',')}]`);
  const parts = splitGiacList(giac.caseval(`f2nd(normal(lagrange(${xs},${ys},${astToGiac(AstVar(getCasVx()))})))`));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  const [num, den] = parts.map(giacToAst);
  _pushCasResult(s, astIsNum(den) && den.value === 1 ? num : AstBin('/', num, den));
}, { category: 'Polynomials', categoryOrder: 8.9, label: "LAGRANGE" });

register('RESULTANT', (s) => {
  const [a, b] = s.popN(2).map(_astArg);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const x = astToGiac(AstVar(_mainVar(a, b)));
  _pushCasResult(s, giacToAst(giac.caseval(`resultant(${astToGiac(a)},${astToGiac(b)},${x})`)));
}, { category: 'Polynomials', categoryOrder: 8.91, label: "RESULTANT" });

// AUR: P(a), for its sign, and the number of roots in [a, b]. Giac's sturmab counts ]a, b], so a root at a
// is counted apart, with the square-free P divided by X-a; with no roots it gives -1 where P is negative.
register('STURMAB', (s) => {
  const [p, a, b] = s.popN(3).map(_astArg);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const [P, A, B] = [p, a, b].map(astToGiac);
  const x = astToGiac(AstVar(_mainVar(p)));
  const atA = giacToAst(giac.caseval(`subst(${P},${x}=${A})`));
  const count = astIsNum(atA) && atA.value === 0
    ? `1+max(0,sturmab(quo(normal((${P})/gcd(${P},diff(${P},${x}))),${x}-(${A}),${x}),${x},${A},${B}))`
    : `max(0,sturmab(${P},${x},${A},${B}))`;
  s.push(RList([_casValue(atA), _casValue(giacToAst(giac.caseval(count)))]));
}, { category: 'Polynomials', categoryOrder: 8.92, label: "STURMAB" });

function _planePoint(v) {
  if (isComplex(v)) return [AstNum(v.re, true), AstNum(v.im, true)];
  if (isReal(v) || isInteger(v)) return [_astArg(v), AstNum(0)];
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const e = astToGiac(_astArg(v));
  const parts = splitGiacList(giac.caseval(`[re(${e}),im(${e})]`));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  return parts.map(giacToAst);
}

// AUR: Y=(d-b)/(c-a)*(X-a)+b through (a,b) and (c,d); numeric points fold the slope, which drops when it is 1.
register('DROITE', (s) => {
  const [p, q] = s.popN(2);
  const [a, b, c, d] = [..._planePoint(p), ..._planePoint(q)];
  const X = AstVar('X');
  const numeric = [a, b, c, d].every(astIsNum);
  if (numeric && a.value === c.value) {
    s.push(Symbolic(AstBin('=', X, a)));
    return;
  }
  const slope = numeric
    ? AstNum((d.value - b.value) / (c.value - a.value), [a, b, c, d].some((n) => n.real))
    : AstBin('/', AstBin('-', d, b), AstBin('-', c, a));
  const run = AstBin('-', X, a);
  const rise = numeric && slope.value === 1 ? run : AstBin('*', slope, run);
  s.push(Symbolic(AstBin('=', AstVar('Y'), AstBin('+', rise, b))));
}, { category: 'Polynomials', categoryOrder: 8.95, label: "DROITE" });

// The AUR's vector calculus: DIV and CURL take a vector function, LAPL an expression, each with a vector of its variables.
function _vectorCalculus(giacFn, check) {
  return (s) => {
    const [fnArg, varsArg] = s.popN(2);
    if (!isVector(varsArg) && !isList(varsArg)) throw new RPLError('Bad argument type');
    const parts = isVector(fnArg) || isList(fnArg) ? fnArg.items : null;
    const vars = varsArg.items.map(_varName);
    check(parts, vars);
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const f = parts ? `[${parts.map((e) => astToGiac(_astArg(e))).join(',')}]` : astToGiac(_astArg(fnArg));
    const raw = giac.caseval(`${giacFn}(${f},[${vars.map((v) => astToGiac(AstVar(v))).join(',')}])`);
    if (isGiacErrorString(raw)) throw new RPLError('Bad argument value');
    const items = splitGiacList(raw);
    s.push(items ? Vector(items.map((item) => _casValue(giacToAst(item)))) : _casValue(giacToAst(raw)));
  };
}

function _componentPerVariable(parts, vars) {
  if (!parts) throw new RPLError('Bad argument type');
  if (parts.length !== vars.length) throw new RPLError('Invalid dimension');
}

function _threeComponents(parts, vars) {
  if (!parts) throw new RPLError('Bad argument type');
  if (parts.length !== 3 || vars.length !== 3) throw new RPLError('Invalid dimension');
}

register('DIV', _vectorCalculus('divergence', _componentPerVariable), { category: 'CAS / symbolic', categoryOrder: 34.6, label: "DIV" });

register('CURL', _vectorCalculus('curl', _threeComponents), { category: 'CAS / symbolic', categoryOrder: 34.7, label: "CURL" });

register('LAPL', _vectorCalculus('laplacian', (parts, vars) => {
  if (parts || !vars.length) throw new RPLError('Bad argument type');
}), { category: 'CAS / symbolic', categoryOrder: 34.8, label: "LAPL" });

// AUR: a field whose CURL isn't zero, or a VPOTENTIAL field whose DIV isn't, is Bad argument value.
register('POTENTIAL', _vectorCalculus('potential', _componentPerVariable), { category: 'CAS / symbolic', categoryOrder: 34.85, label: "POTENTIAL" });
register('VPOTENTIAL', _vectorCalculus('vpotential', _threeComponents), { category: 'CAS / symbolic', categoryOrder: 34.86, label: "VPOTENTIAL" });

function _giacMatrix(raw) {
  const rows = splitGiacList(raw)?.map(splitGiacList);
  if (!rows?.length || !rows.every(Boolean)) throw new RPLError('Bad argument value');
  return Matrix(rows.map((row) => row.map((c) => _casValue(giacToAst(c)))));
}

// AUR: the Hessian, the gradient and the variables. Its entries come simplified, 4*U where the HP shows 2*(2*U).
register('HESS', (s) => {
  const [expr, varsArg] = s.popN(2);
  if (!isVector(varsArg) && !isList(varsArg)) throw new RPLError('Bad argument type');
  if (!varsArg.items.length) throw new RPLError('Bad argument value');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const f = astToGiac(_astArg(expr));
  const vars = `[${varsArg.items.map((v) => astToGiac(AstVar(_varName(v)))).join(',')}]`;
  const hessian = _giacMatrix(giac.caseval(`normal(hessian(${f},${vars}))`));
  const gradient = splitGiacList(giac.caseval(`normal(grad(${f},${vars}))`));
  if (!gradient) throw new RPLError('Bad argument value');
  s.push(hessian);
  s.push(Vector(gradient.map((item) => _casValue(giacToAst(item)))));
  s.push(varsArg);
}, { category: 'CAS / symbolic', categoryOrder: 34.87, label: "HESS" });

const _giacArray = (v) => (isMatrix(v)
  ? `[${v.rows.map((row) => `[${row.map((x) => astToGiac(_astArg(x))).join(',')}]`).join(',')}]`
  : `[${v.items.map((x) => astToGiac(_astArg(x))).join(',')}]`);

function _matrixArg(v) {
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  return _giacArray(v);
}

function _vectorList(v) {
  if (!isList(v) || !v.items.every(isVector)) throw new RPLError('Bad argument type');
  return `[${v.items.map(_giacArray).join(',')}]`;
}

const _isNegative = (a) => a.kind === 'neg' || (astIsNum(a) && a.value < 0);
const _isZero = (a) => astIsNum(a) && a.value === 0;

// The AUR prints a basis vector with a positive first entry, [1,0,-1] where Giac gives [-1,0,1].
function _leadPositive(entries) {
  const lead = entries.find((a) => !_isZero(a));
  return lead && _isNegative(lead) ? entries.map((a) => (a.kind === 'neg' ? a.arg : AstNeg(a))) : entries;
}

const _giacVector = (raw) => Vector(_leadPositive((splitGiacList(raw) ?? []).map(giacToAst)).map(_casValue));

function _giacBasis(cmd) {
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vectors = splitGiacList(giac.caseval(cmd));
  if (!vectors?.every((v) => splitGiacList(v))) throw new RPLError('Bad argument value');
  return RList(vectors.map(_giacVector));
}

register('KER', (s) => {
  const [m] = s.popN(1);
  s.push(_giacBasis(`ker(${_matrixArg(m)})`));
}, { category: 'Vectors / matrices', categoryOrder: 60, label: "KER" });

register('IMAGE', (s) => {
  const [m] = s.popN(1);
  s.push(_giacBasis(`image(${_matrixArg(m)})`));
}, { category: 'Vectors / matrices', categoryOrder: 61, label: "IMAGE" });

register('BASIS', (s) => {
  const [list] = s.popN(1);
  s.push(_giacBasis(`basis(${_vectorList(list)})`));
}, { category: 'Vectors / matrices', categoryOrder: 62, label: "BASIS" });

register('IBASIS', (s) => {
  const [a, b] = s.popN(2);
  s.push(_giacBasis(`ibasis(${_vectorList(a)},${_vectorList(b)})`));
}, { category: 'Vectors / matrices', categoryOrder: 63, label: "IBASIS" });

function _variables(v) {
  if (!isVector(v) && !isList(v)) throw new RPLError('Bad argument type');
  return `[${v.items.map((x) => astToGiac(AstVar(_varName(x)))).join(',')}]`;
}

// AUR: the quadratic form of a matrix, the variables left under it.
register('AXQ', (s) => {
  const [m, vars] = s.popN(2);
  const cmd = `a2q(${_matrixArg(m)},${_variables(vars)})`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  _pushCasResult(s, giacToAst(giac.caseval(cmd)));
  s.push(vars);
}, { category: 'Vectors / matrices', categoryOrder: 64, label: "AXQ" });

register('QXA', (s) => {
  const [q, vars] = s.popN(2);
  const cmd = `q2a(${astToGiac(_astArg(q))},${_variables(vars)})`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  s.push(_giacMatrix(giac.caseval(cmd)));
  s.push(vars);
}, { category: 'Vectors / matrices', categoryOrder: 65, label: "QXA" });

function _numericResult(cmd) {
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const ast = giacToAst(giac.caseval(cmd));
  if (!astIsNum(ast)) throw new RPLError('Bad argument value');
  return Real(ast.value);
}

// AUR: a vector's Euclidean length, a matrix's largest singular value.
register('SNRM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) s.push(_numericResult(`l2norm(evalf(${_giacArray(v)}))`));
  else s.push(_numericResult(`max(svl(evalf(${_matrixArg(v)})))`));
}, { category: 'Vectors / matrices', categoryOrder: 66, label: "SNRM" });

register('SRAD', (s) => {
  const [m] = s.popN(1);
  if (isMatrix(m) && m.rows.length !== m.rows[0].length) throw new RPLError('Invalid dimension');
  s.push(_numericResult(`max(abs(evalf(eigenvals(${_matrixArg(m)}))))`));
}, { category: 'Vectors / matrices', categoryOrder: 67, label: "SRAD" });

// AUR: in non-increasing order, where Giac's svl gives them increasing.
register('SVL', (s) => {
  const [m] = s.popN(1);
  const cmd = `svl(evalf(${_matrixArg(m)}))`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const values = (splitGiacList(giac.caseval(cmd)) ?? []).map(giacToAst);
  if (!values.length || !values.every(astIsNum)) throw new RPLError('Bad argument value');
  s.push(Vector(values.map((a) => a.value).sort((x, y) => y - x).map((x) => Real(x))));
}, { category: 'Vectors / matrices', categoryOrder: 68, label: "SVL" });

// AUR: { [1 1] -1 } for the reflection in y = -x, { π/3 1 } for a rotation; a reflection's line or plane
// leads positive, while an axis keeps the direction its angle turns about.
register('ISOM', (s) => {
  const [m] = s.popN(1);
  const cmd = `isom(${_matrixArg(m)})`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const parts = splitGiacList(giac.caseval(cmd));
  if (!parts?.length) throw new RPLError('Bad argument value');
  const axisAndAngle = parts.length > 2;
  s.push(RList(parts.map((p) => {
    const items = splitGiacList(p);
    if (!items) return _casValue(giacToAst(p));
    const entries = items.map(giacToAst);
    return Vector((axisAndAngle ? entries : _leadPositive(entries)).map(_casValue));
  })));
}, { category: 'Vectors / matrices', categoryOrder: 69, label: "ISOM" });

register('MKISOM', (s) => {
  const [elements, sign] = s.popN(2);
  const giacElement = (v) => (isVector(v) ? _giacArray(v) : astToGiac(_astArg(v)));
  const els = isList(elements) ? `[${elements.items.map(giacElement).join(',')}]` : giacElement(elements);
  const cmd = `mkisom(${els},${astToGiac(_astArg(sign))})`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  s.push(_giacMatrix(giac.caseval(cmd)));
}, { category: 'Vectors / matrices', categoryOrder: 70, label: "MKISOM" });

// A = PᵀDP for a symmetric A, by LDLᵀ in Giac: D's diagonal and P = Lᵀ, as SYLVESTER and GAUSS give them.
const _LDLT = '(A->{local n,L,D,i,j,k,s;n:=rowdim(A);L:=idn(n);D:=[0$n];'
  + 'for(j:=0;j<n;j++){s:=A[j,j];for(k:=0;k<j;k++){s:=s-L[j,k]^2*D[k]};D[j]:=normal(s);'
  + 'for(i:=j+1;i<n;i++){s:=A[i,j];for(k:=0;k<j;k++){s:=s-L[i,k]*L[j,k]*D[k]};L[i,j]:=normal(s/D[j])}};[D,tran(L)]})';

function _ldlt(matrixGiac) {
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const raw = giac.caseval(`${_LDLT}(${matrixGiac})`);
  const parts = splitGiacList(raw);
  if (parts?.length !== 2 || /undef|infinity/.test(raw)) throw new RPLError('Bad argument value');
  return { d: Vector((splitGiacList(parts[0]) ?? []).map((c) => _casValue(giacToAst(c)))), p: _giacMatrix(parts[1]) };
}

// AUR: [[1 2][2 4]] SYLVESTER gives D as the vector [ 1 0 ] and P as [[ 1 2 ][ 0 1 ]].
register('SYLVESTER', (s) => {
  const [m] = s.popN(1);
  if (isMatrix(m) && m.rows.length !== m.rows[0].length) throw new RPLError('Invalid dimension');
  const { d, p } = _ldlt(_matrixArg(m));
  s.push(d);
  s.push(p);
}, { category: 'Vectors / matrices', categoryOrder: 71.5, label: "SYLVESTER" });

// AUR: the diagonal's coefficients, P, the form as a sum of squares, and the variables.
register('GAUSS', (s) => {
  const [q, vars] = s.popN(2);
  const [form, v] = [astToGiac(_astArg(q)), _variables(vars)];
  const { d, p } = _ldlt(`q2a(${form},${v})`);
  s.push(d);
  s.push(p);
  _pushCasResult(s, giacToAst(giac.caseval(`gauss(${form},${v})`)));
  s.push(vars);
}, { category: 'Vectors / matrices', categoryOrder: 71.6, label: "GAUSS" });

// Row reduction modulo the CAS modulus (MODSTO). The AUR's own example leaves a pivot of -1; this gives 1.
register('RREFMOD', (s) => {
  const [m] = s.popN(1);
  const cmd = `rref(${_matrixArg(m)} % ${getCasModulo()})`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  s.push(_giacMatrix(giac.caseval(cmd).replace(/ % \d+/g, '')));
}, { category: 'Vectors / matrices', categoryOrder: 71.7, label: "RREFMOD" });

// A program or a function name takes the value from the stack; an expression has it put for its variable.
function _applyTo(s, fn, valueAst) {
  if (isSymbolic(fn)) {
    const x = _mainVar(fn.expr);
    return _rewriteAst(fn.expr, (n) => (n.kind === 'var' && n.name === x ? valueAst : null));
  }
  if (!isProgram(fn) && !isName(fn)) throw new RPLError('Bad argument type');
  s.push(_casValue(valueAst));
  s.push(fn);
  lookup('EVAL').fn(s);
  return _astArg(s.pop());
}

// AUR: [[1 1][0 2]] « → X « EXP(X) » » DIAGMAP is [[ e e²-e ][ 0 e² ]]: P·f(D)·P⁻¹ from Giac's jordan.
register('DIAGMAP', (s) => {
  const [m, fn] = s.popN(2);
  const cmd = `[jordan(${_matrixArg(m)})]`;
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const parts = splitGiacList(giac.caseval(cmd));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  const [pGiac, jGiac] = parts;
  const j = (splitGiacList(jGiac) ?? []).map((row) => (splitGiacList(row) ?? []).map(giacToAst));
  if (j.some((row, r) => row.some((c, k) => k !== r && !_isZero(c)))) throw new RPLError('Bad argument value');
  const fd = j.map((row, r) => astToGiac(_applyTo(s, fn, row[r])));
  s.push(_giacMatrix(giac.caseval(`normal(${pGiac}*diag([${fd.join(',')}])*inv(${pGiac}))`)));
}, { category: 'Vectors / matrices', categoryOrder: 71.8, label: "DIAGMAP" });

// AUR: 2 3 « → I J 'I+2*J' » LCXM is [[ 3 5 7 ][ 4 6 8 ]]; an expression in I and J also serves.
register('LCXM', (s) => {
  const [rowsArg, colsArg, fnArg] = s.popN(3);
  const [rows, cols] = [rowsArg, colsArg].map((v) => Number(_astArg(v).value));
  if (![rows, cols].every((n) => Number.isInteger(n) && n >= 1)) throw new RPLError('Bad argument value');
  const fn = isSymbolic(fnArg) ? Program([Name('→'), Name('I'), Name('J'), fnArg]) : fnArg;
  if (!isProgram(fn) && !isName(fn)) throw new RPLError('Bad argument type');
  const cells = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, k) => {
    checkTimeLimit();
    s.push(Integer(BigInt(i + 1)));
    s.push(Integer(BigInt(k + 1)));
    s.push(fn);
    lookup('EVAL').fn(s);
    return s.pop();
  }));
  s.push(Matrix(cells));
}, { category: 'Vectors / matrices', categoryOrder: 71.9, label: "LCXM" });

function _casValue(ast) {
  const leaf = ast.kind === 'neg' ? ast.arg : ast;
  return leaf.kind === 'num' || ast.kind === 'var' ? _astToRplValue(ast) : Symbolic(ast);
}

// Real roots in increasing order, as the AUR lists them; anything else keeps Giac's order.
function _byValue(roots) {
  const values = roots.map((r) => algebraEvalAst(r, (name) => (name === 'π' ? Math.PI : undefined)));
  if (!values.every((v) => astIsNum(v) && Number.isFinite(v.value))) return roots;
  return roots.map((r, i) => [r, values[i].value]).sort((a, b) => a[1] - b[1]).map(([r]) => r);
}

// AUR: the zeros of an expression, each once and without SOLVE's X= in front.
register('ZEROS', (s) => {
  const [exprArg, varArg] = s.popN(2);
  const varName = _varName(varArg);
  let ast = _astArg(exprArg);
  if (ast.kind === 'bin' && ast.op === '=') ast = AstBin('-', ast.l, ast.r);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const zeros = getComplexMode() ? 'czeros' : 'zeros';
  const raw = giac.caseval(buildGiacCmd(ast, (e) => (getApproxMode() ? `evalf(${zeros}(${e},${varName}))` : `${zeros}(${e},${varName})`), [varName]));
  const trimmed = String(raw).trim();
  const roots = (splitGiacList(raw) ?? (trimmed ? [trimmed] : [])).map((r) => giacToAst(r));
  s.push(RList(_byValue(roots).map(_casValue)));
}, { category: 'CAS / symbolic', categoryOrder: 10.5, label: "ZEROS" });


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


// The HP's | (where): each name in the list takes the value after it, without the CAS, and nothing is simplified,
// so 'X^2+Y' { X 2 Y 3 } | gives '2^2+3' for EVAL; a number is left as it is.
register('|', (s) => {
  const [v, list] = s.popN(2);
  if (!isList(list)) throw new RPLError('Bad argument type');
  if (list.items.length % 2) throw new RPLError('Bad argument value');
  const bindings = new Map();
  for (let i = 0; i < list.items.length; i += 2) {
    const value = _toAst(list.items[i + 1]);
    if (!isName(list.items[i]) || !value) throw new RPLError('Bad argument type');
    bindings.set(list.items[i].id, value);
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isComplex(v)) { s.push(v); return; }
  if (!isSymbolic(v) && !isName(v)) throw new RPLError('Bad argument type');
  _pushSubstResult(s, _substitute(_toAst(v), bindings));
}, { category: 'CAS / symbolic', categoryOrder: 4, label: "|" });


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

register('RISCH', lookup('INTEG').fn, { category: 'CAS / symbolic', categoryOrder: 2.1, label: "RISCH" });

// AUR: the antiderivative at a point, INT(SIN(X),X,Y) being -COS(Y).
register('INT', (s) => {
  const [expr, varArg, point] = s.popN(3);
  const x = _varName(varArg);
  const at = astToGiac(_astArg(point));
  _pushCasResult(s, _casEval(_astArg(expr), (e) => `subst(integrate(${e},${x}),${x}=${at})`, [x]));
}, { category: 'CAS / symbolic', categoryOrder: 2.15, label: "INT" });

// AUR: the discrete antiderivative G, with G(x+1)-G(x) the expression.
register('SIGMA', (s) => {
  const [expr, varArg] = s.popN(2);
  const x = _varName(varArg);
  _pushCasResult(s, _casEval(_astArg(expr), (e) => `normal(sum(${e},${x}))`, [x]));
}, { category: 'CAS / symbolic', categoryOrder: 2.2, label: "SIGMA" });

// AUR: u*v' and v give u*v and -u'*v, the integral still to take; Giac's ibpdv is the HP's command.
register('IBP', (s) => {
  const [f, v] = s.popN(2).map(_astArg);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const x = astToGiac(AstVar(_mainVar(f, v)));
  const parts = splitGiacList(giac.caseval(`ibpdv(${astToGiac(f)},${astToGiac(v)},${x})`));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  for (const part of parts) s.push(_casValue(giacToAst(part)));
}, { category: 'CAS / symbolic', categoryOrder: 2.4, label: "IBP" });


const _CONSTANT_NAMES = new Set(['π', 'e', 'i', '∞']);

// VX, or the only variable of expressions that lack VX, so `X^2` DERVX
// differentiates by X while VX is still the default x.
function _vxFor(...asts) {
  const vx = getCasVx();
  const names = [...new Set(asts.filter(Boolean).flatMap((ast) => [...algebraFreeVars(ast)]))].filter((name) => !_CONSTANT_NAMES.has(name));
  return names.length === 1 && names[0] !== vx ? names[0] : vx;
}

// AUR: VX when the expressions use it, else their first variable.
function _mainVar(...asts) {
  const vx = getCasVx();
  const names = [...new Set(asts.flatMap((ast) => [...algebraFreeVars(ast)]))].filter((name) => !_CONSTANT_NAMES.has(name));
  return names.includes(vx) || !names.length ? vx : names[0];
}

function _vxForm(opName, pickVar = _vxFor) {
  return (s) => {
    if (s.depth < 1) throw new RPLError('Too few arguments');
    s.push(Name(pickVar(_toAst(s.peek()))));
    lookup(opName).fn(s);
  };
}

register('INTVX', _vxForm('INTEG'), { category: 'CAS / symbolic', categoryOrder: 3, label: "INTVX" });
register('SIGMAVX', _vxForm('SIGMA', _mainVar), { category: 'CAS / symbolic', categoryOrder: 2.3, label: "SIGMAVX" });

// AUR: ∫ takes the lower limit, the upper limit, the integrand and the name, and
// gives the definite integral; INTEG is the antiderivative.
register('∫', (s) => {
  const [lower, upper, integrand, varArg] = s.popN(4);
  const varName = _varName(varArg);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const endpoint = (v) => (isBinaryInteger(v) ? AstNum(v.value) : _astArg(v));
  const a = astToGiac(endpoint(lower));
  const b = astToGiac(endpoint(upper));
  const cmd = buildGiacCmd(_astArg(integrand), (e) => `simplify(subst(integrate(${e},${varName}),${varName}=${b})-subst(integrate(${e},${varName}),${varName}=${a}))`, [varName]);
  _pushCasResult(s, giacToAst(giac.caseval(cmd)));
}, { category: 'CAS / symbolic', categoryOrder: 2.5, label: "∫" });

// AUR: Σ takes the index, its first and last values and the summand, and gives the sum, or the
// symbolic sum while a limit is symbolic; a symbolic summand between numeric limits sums in closed form.
register('Σ', (s) => {
  const [index, initial, final, summand] = s.popN(4);
  const sum = AstFn('Σ', [_astArg(summand), AstVar(_varName(index)), _astArg(initial), _astArg(final)]);
  s.push(Symbolic(sum));
  lookup('EVAL').fn(s);
  const left = s.peek();
  const numericLimits = [initial, final].every((v) => isReal(v) || isInteger(v));
  if (numericLimits && isSymbolic(left) && left.expr.kind === 'fn' && left.expr.name === 'Σ' && giac.isReady()) {
    s.pop();
    _pushCasResult(s, _casEval(sum, (e) => e));
  }
}, { category: 'CAS / symbolic', categoryOrder: 2.6, label: "Σ" });

register('DERVX', _vxForm('DERIV'), { category: 'CAS / symbolic', categoryOrder: 1, label: "DERVX" });


// The power of the variable in one term of a polynomial from Giac: 3*X^2 is 2, 1/X is -1, LN(X) is NaN.
function _termPower(ast, x) {
  if (!algebraFreeVars(ast).has(x)) return 0;
  if (ast.kind === 'var') return 1;
  if (ast.kind === 'neg') return _termPower(ast.arg, x);
  if (ast.kind !== 'bin') return NaN;
  if (ast.op === '*') return _termPower(ast.l, x) + _termPower(ast.r, x);
  if (ast.op === '/') return _termPower(ast.l, x) - _termPower(ast.r, x);
  const k = ast.r.kind === 'neg' ? -ast.r.arg.value : ast.r.value;
  return ast.op === '^' && !algebraFreeVars(ast.r).has(x) ? _termPower(ast.l, x) * k : NaN;
}

const _negated = (t) => (t.kind === 'neg' ? t.arg : AstNeg(t));

function _sumTerms(ast) {
  if (ast.kind !== 'bin' || (ast.op !== '+' && ast.op !== '-')) return [ast];
  const right = _sumTerms(ast.r);
  return [..._sumTerms(ast.l), ...(ast.op === '-' ? right.map(_negated) : right)];
}

const _sumOf = (terms) => terms.reduce((acc, t) => (t.kind === 'neg' ? AstBin('-', acc, t.arg) : AstBin('+', acc, t)));

const TAYLOR_MAX_ORDER = 100;

function _taylorOrder(v) {
  if (!isInteger(v) && !isReal(v)) throw new RPLError('Bad argument type');
  const n = Number(v.value.toString());
  if (!Number.isInteger(n) || n < 0 || n > TAYLOR_MAX_ORDER) throw new RPLError('Bad argument value');
  return n;
}

// AUR: the order is relative, the gap between the highest and lowest power, so
// X*EXP(X) to order 2 is X+X^2+1/2*X^3 and SIN(X)/X^3 to order 2 is 1/X^2-1/6.
// Giac's order is absolute, and an order of 0 means its default of 5.
function _taylor(ast, x, n) {
  const series = (order) => _casEval(ast, (e) => `series(${e},${x}=0,${order},polynom)`, [x]);
  let order = Math.max(n, 1);
  let result = series(order);
  if (astIsNum(result) && result.value === 0) result = series(order += 10);
  let powers = _sumTerms(result).map((t) => _termPower(t, x));
  if (powers.some(Number.isNaN) || algebraFreeVars(result).has('undef')) throw new RPLError('No Taylor polynomial at 0');
  const top = Math.min(...powers) + n;
  if (top > order) {
    result = series(top);
    powers = _sumTerms(result).map((t) => _termPower(t, x));
  }
  return _sumOf(_sumTerms(result).filter((_, i) => powers[i] <= top));
}

register('TAYLR', (s) => {
  const [expr, varArg, orderArg] = s.popN(3);
  const varName = _varName(varArg);
  _pushCasResult(s, _taylor(_astArg(expr), varName, _taylorOrder(orderArg)));
}, { category: 'CAS / symbolic', categoryOrder: 3.5, label: "TAYLR" });

register('DIVPC', (s) => {
  const [numArg, denArg, orderArg] = s.popN(3);
  const [num, den] = [numArg, denArg].map(_astArg);
  _pushCasResult(s, _taylor(AstBin('/', num, den), _mainVar(num, den), _taylorOrder(orderArg)));
}, { category: 'CAS / symbolic', categoryOrder: 3.55, label: "DIVPC" });

// AUR: stores the expression in EQ and gives it back with { { values } { results } }, each value put for VX.
register('TABVAL', (s) => {
  const [expr, list] = s.popN(2);
  if (!isList(list)) throw new RPLError('Bad argument type');
  const ast = _astArg(expr);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const [e, x] = [ast, AstVar(_mainVar(ast))].map(astToGiac);
  const results = list.items.length
    ? splitGiacList(giac.caseval(`[${list.items.map((v) => `subst(${e},${x}=${astToGiac(_astArg(v))})`).join(',')}]`))
    : [];
  if (results?.length !== list.items.length) throw new RPLError('Bad argument value');
  try {
    storeVar('EQ', expr);
  } catch (err) {
    throw new RPLError(err.message);
  }
  s.push(expr);
  s.push(RList([list, RList(results.map((r) => _casValue(giacToAst(r))))]));
}, { category: 'CAS / symbolic', categoryOrder: 3.57, label: "TABVAL" });

// AUR: the nth complex Fourier coefficient over one period from 0, the period being PERIOD, 2π unless stored.
register('FOURIER', (s) => {
  const [f, n] = s.popN(2).map(_astArg);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const period = recallVar('PERIOD');
  const L = period === undefined ? '2*pi' : astToGiac(_astArg(period));
  const x = astToGiac(AstVar(_mainVar(f)));
  _pushCasResult(s, giacToAst(giac.caseval(`fourier_cn(${astToGiac(f)},${x},${L},${astToGiac(n)},0)`)));
}, { category: 'CAS / symbolic', categoryOrder: 3.65, label: "FOURIER" });

const _infinitySign = (ast) => {
  const inf = (a) => a.kind === 'var' && /^(∞|\+∞|INFINITY|\+INFINITY)$/i.test(a.name);
  if (inf(ast)) return 1;
  if ((ast.kind === 'neg' && inf(ast.arg)) || (ast.kind === 'var' && /^(-∞|-INFINITY)$/i.test(ast.name))) return -1;
  return 0;
};

// AUR: the variable means the point 0, X=a the point a, and a bare value the point a in VX.
function _seriesPoint(v, expr) {
  if (isName(v) && !_infinitySign(AstVar(v.id))) return { varName: v.id, point: AstNum(0n) };
  const ast = _astArg(v);
  if (ast.kind === 'bin' && ast.op === '=' && ast.l.kind === 'var') return { varName: ast.l.name, point: ast.r };
  return { varName: _vxFor(expr), point: ast };
}

// AUR: SERIES gives {{Limit: Equiv: Expans: Remain:} h=X-a}: the limit at the
// point, the leading term, the expansion in a small h and its remainder's order.
register('SERIES', (s) => {
  const [exprArg, pointArg, orderArg] = s.popN(3);
  const expr = _astArg(exprArg);
  const n = _taylorOrder(orderArg);
  if (n < 1) throw new RPLError('Bad argument value');
  const { varName: x, point } = _seriesPoint(pointArg, expr);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const h = AstVar('h');
  const sign = _infinitySign(point);
  const atZero = astIsNum(point) && point.value === 0;
  const inH = sign ? AstBin('/', AstNum(sign > 0 ? 1n : -1n), h) : atZero ? h : AstBin('+', point, h);
  const shifted = _substitute(expr, new Map([[x, inH]]));
  const raw = String(giac.caseval(buildGiacCmd(shifted, (e) => `series(${e},h=0,${n})`, ['h'])));
  if (!raw || /undef|rror/i.test(raw)) throw new RPLError('No series at that point');
  const tail = raw.match(/(?:h(?:\^\(?(-?\d+)\)?)?\*)?order_size\(h\)/);
  const expans = giacToAst(raw.replace(/[-+]?(?:h(?:\^\(?-?\d+\)?)?\*)?order_size\(h\)$/, '') || '0');
  const remainder = tail ? (tail[1] !== undefined ? Number(tail[1]) : tail[0].startsWith('h') ? 1 : 0) : null;
  const terms = _sumTerms(expans);
  const powers = terms.map((t) => _termPower(t, 'h'));
  const lowest = powers.reduce((best, p, i) => (p < powers[best] ? i : best), 0);
  const limitCmd = buildGiacCmd(expr, (e) => `limit(${e},${x},${sign ? `${sign > 0 ? '+' : '-'}infinity` : astToGiac(point)})`, [x]);
  const limit = giacToAst(giac.caseval(limitCmd));
  const back = sign ? AstBin('/', AstNum(sign > 0 ? 1n : -1n), AstVar(x)) : atZero ? AstVar(x) : AstBin('-', AstVar(x), point);
  s.push(RList([
    Tagged('Limit', _casValue(limit)),
    Tagged('Equiv', _casValue(terms[lowest])),
    Tagged('Expans', _casValue(expans)),
    Tagged('Remain', remainder === null ? Integer(0n) : Symbolic(AstBin('^', h, AstNum(BigInt(remainder))))),
  ]));
  s.push(Symbolic(AstBin('=', h, back)));
}, { category: 'CAS / symbolic', categoryOrder: 3.6, label: "SERIES" });

register('TAYLOR0', (s) => {
  const ast = _astArg(s.pop());
  _pushCasResult(s, _taylor(ast, _vxFor(ast), 4));
}, { category: 'CAS / symbolic', categoryOrder: 34.5, label: "TAYLOR0" });


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

register('I→R', (s) => {
  const v = s.pop();
  if (isInteger(v)) s.push(Real(v.value.toString()));
  else if (isReal(v)) s.push(v);
  else throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 43.1, label: "I→R" });

register('R→I', (s) => {
  const v = s.pop();
  if (isInteger(v)) s.push(v);
  else if (!isReal(v)) throw new RPLError('Bad argument type');
  else if (!v.value.isInteger()) throw new RPLError('Bad argument value');
  else s.push(Integer(BigInt(v.value.toFixed(0))));
}, { category: 'CAS / symbolic', categoryOrder: 43.2, label: "R→I" });


register('VX', (s) => {
  s.push(Name(getCasVx()));
}, { category: 'CAS / symbolic', categoryOrder: 40, label: "VX" });


register('SVX', (s) => {
  const name = _varName(s.pop());
  if (!isCasIdentifier(name)) throw new RPLError(`Invalid name: ${name}`);
  setCasVx(name);
}, { category: 'CAS / symbolic', categoryOrder: 41, label: "SVX" });

register('RCLVX', lookup('VX').fn, { category: 'CAS / symbolic', categoryOrder: 40.1, label: "RCLVX" });
register('STOVX', lookup('SVX').fn, { category: 'CAS / symbolic', categoryOrder: 41.1, label: "STOVX" });


register('PREVAL', (s) => {
  const top = s.peek();
  if (s.depth >= 2 && isList(top) && top.items.length === 2) {
    s.pop();
    s.push(top.items[0]);
    s.push(top.items[1]);
  }
  const [fVal, aVal, bVal] = s.popN(3);
  if (!isSymbolic(fVal)) throw new RPLError('Bad argument type');
  const varName = _vxFor(fVal.expr);
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

const _hasQuotient = (n) => (n.kind === 'bin' && (n.op === '/' || _hasQuotient(n.l) || _hasQuotient(n.r)))
  || (n.kind === 'neg' && _hasQuotient(n.arg)) || (n.kind === 'fn' && n.name === 'INV');

// AUR: (X-3)^2/(Z+4) splits as written; Giac's fxnd would expand (X-3)^2.
register('FXND', (s) => {
  const [v] = s.popN(1);
  if (isRational(v)) {
    s.push(Integer(v.n));
    s.push(Integer(v.d));
    return;
  }
  if (isInteger(v) || isReal(v) || isName(v)) {
    s.push(v);
    s.push(Integer(1n));
    return;
  }
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const ast = v.expr;
  if (ast.kind === 'bin' && ast.op === '/' && !_hasQuotient(ast.l) && !_hasQuotient(ast.r)) {
    s.push(_casValue(ast.l));
    s.push(_casValue(ast.r));
    return;
  }
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const parts = splitGiacList(giac.caseval(buildGiacCmd(ast, (e) => `fxnd(${e})`)));
  if (parts?.length !== 2) throw new RPLError('Bad argument value');
  for (const part of parts) s.push(_casValue(giacToAst(part)));
}, { category: 'CAS / symbolic', categoryOrder: 38.1, label: "FXND" });

// AUR: an equation counts as its left side minus its right, and zero has degree -1.
register('DEGREE', (s) => {
  const [v] = s.popN(1);
  let ast = _astArg(v);
  if (ast.kind === 'bin' && ast.op === '=') ast = AstBin('-', ast.l, ast.r);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const p = astToGiac(ast);
  const d = giacToAst(giac.caseval(`when(normal(${p})==0,-1,degree(normal(${p}),${astToGiac(AstVar(_mainVar(ast)))}))`));
  const degree = d.kind === 'neg' && astIsNum(d.arg) ? -d.arg.value : d.value;
  if (!Number.isInteger(degree)) throw new RPLError('Bad argument value');
  s.push(getApproxMode() ? Real(degree) : Integer(BigInt(degree)));
}, { category: 'CAS / symbolic', categoryOrder: 38.2, label: "DEGREE" });

register('REORDER', (s) => {
  const [p, v] = s.popN(2);
  const x = _varName(v);
  _pushCasResult(s, _casEval(_astArg(p), (e) => `reorder(${e},[${x}])`, [x]));
}, { category: 'CAS / symbolic', categoryOrder: 38.3, label: "REORDER" });


// AUR p.3-136: longest first, then alphabetical.
const _longestFirst = (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);

register('LNAME', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
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
  s.push(Vector([...names].sort(_longestFirst).map((id) => Name(id))));
}, { category: 'CAS / symbolic', categoryOrder: 39, label: "LNAME" });

// AUR: as LNAME, but a function of a variable, COS(B), counts as one, and the expression stays on the stack.
register('LVAR', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const v = s.peek();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const items = (splitGiacList(giac.caseval(buildGiacCmd(v.expr, (e) => `lvar(${e})`))) ?? []).map(giacToAst);
  const text = new Map(items.map((a) => [a, a.kind === 'var' ? a.name : formatAlgebra(a)]));
  items.sort((a, b) => _longestFirst(text.get(a), text.get(b)));
  s.push(Vector(items.map((a) => (a.kind === 'var' ? Name(a.name) : Symbolic(a)))));
}, { category: 'CAS / symbolic', categoryOrder: 39.1, label: "LVAR" });

// AUR: linear when the name is only added or subtracted, or multiplied or divided by factors without it,
// so (X^2-1)/(X+1) isn't though it factors to X-1.
function _structurallyLinear(n, name) {
  const has = (a) => algebraFreeVars(a).has(name);
  if (!has(n) || n.kind === 'var') return true;
  if (n.kind === 'neg') return _structurallyLinear(n.arg, name);
  if (n.kind !== 'bin') return false;
  if (n.op === '+' || n.op === '-' || n.op === '=') return _structurallyLinear(n.l, name) && _structurallyLinear(n.r, name);
  if (n.op === '*') return !(has(n.l) && has(n.r)) && _structurallyLinear(has(n.l) ? n.l : n.r, name);
  if (n.op === '/') return !has(n.r) && _structurallyLinear(n.l, name);
  return false;
}

register('LININ', (s) => {
  const [expr, nameArg] = s.popN(2);
  s.push(Integer(_structurallyLinear(_astArg(expr), _varName(nameArg)) ? 1n : 0n));
}, { category: 'CAS / symbolic', categoryOrder: 39.2, label: "LININ" });

// AUR: { symb1 … symbn } 'name' APPLY is 'name(symb1 … symbn)'.
register('APPLY', (s) => {
  const [args, name] = s.popN(2);
  if (!isList(args) || !isName(name)) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstFn(name.id, args.items.map(_astArg))));
}, { category: 'CAS / symbolic', categoryOrder: 39.3, label: "APPLY" });

register('QUOTE', (s) => {
  const [v] = s.popN(1);
  s.push(v);
}, { category: 'CAS / symbolic', categoryOrder: 39.4, label: "QUOTE" });


function _lapVarName(ast) {
  const vx = getCasVx();
  const vars = algebraFreeVars(ast);
  return vars.size === 0 || vars.has(vx) ? vx : [...vars][0];
}

// The HP50 transforms in place (X -> X).  Giac needs a target variable of its
// own, or laplace(f,X,X) reads as a substitution, so the result is renamed back.
function _laplaceOp(giacFn) {
  return (s) => {
    const [v] = s.popN(1);
    if (!_isSymOperand(v)) throw new RPLError('Bad argument type');
    const expr = _toAst(v);
    const x = _lapVarName(expr);
    const result = _casEval(expr, (e) => `${giacFn}(${e},${x},rplS)`, [x]);
    // A transform Giac leaves as an integral keeps x as its dummy variable, which moves to a fresh name.
    const names = algebraFreeVars(result);
    const dummy = ['t', 'τ', 'u'].find((n) => n !== x && !names.has(n));
    _pushCasResult(s, _substitute(result, new Map([['rplS', AstVar(x)], [x, AstVar(dummy)]])));
  };
}

register('LAPLACE', _laplaceOp('laplace'), { category: 'CAS / symbolic', categoryOrder: 31, label: "LAPLACE" });

register('LAP', lookup('LAPLACE').fn, { category: 'CAS / symbolic', categoryOrder: 31, label: "LAP" });

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

register('EXP2POW', _casUnary('exp2pow'), { category: 'CAS / symbolic', categoryOrder: 12.1, label: "EXP2POW" });

// Giac has no EXP2HYP; the AUR writes EXP(u) as SINH(u)+COSH(u).
register('EXP2HYP', _rewriteOp(_fnRewrites({ EXP: (u) => AstBin('+', AstFn('SINH', [u]), AstFn('COSH', [u])) })), { category: 'CAS / symbolic', categoryOrder: 12.2, label: "EXP2HYP" });


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

const POWEXPAND_MAX = 64;

// AUR: (X+1)^3 becomes (X+1)*(X+1)*(X+1), for DISTRIB to expand a step at a time; Giac leaves powers alone.
function _powExpandRewrite(n) {
  if (n.kind !== 'bin' || n.op !== '^' || !astIsNum(n.r)) return null;
  const k = n.r.value;
  if (!Number.isInteger(k) || k < 2 || k > POWEXPAND_MAX) return null;
  return Array.from({ length: k - 1 }).reduce((product) => AstBin('*', product, n.l), n.l);
}

register('POWEXPAND', _rewriteOp(_powExpandRewrite), { category: 'CAS / symbolic', categoryOrder: 6.5, label: "POWEXPAND" });


register('PROPFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v) || isRational(v)) _pushCasResult(s, _casEval(_toAst(v), (e) => `propfrac(${e})`));
  else if (isReal(v) || isInteger(v) || isName(v)) s.push(v);
  else throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 37, label: "PROPFRAC" });


register('PARTFRAC', _casUnary('partfrac'), { category: 'CAS / symbolic', categoryOrder: 36, label: "PARTFRAC" });


register('COSSIN', _casUnary('tan2sincos'), { category: 'CAS / symbolic', categoryOrder: 21, label: "COSSIN" });

register('TRIGCOS', _casUnary('trigcos'), { category: 'CAS / symbolic', categoryOrder: 21.1, label: "TRIGCOS" });
register('TRIGSIN', _casUnary('trigsin'), { category: 'CAS / symbolic', categoryOrder: 21.2, label: "TRIGSIN" });
register('TRIGTAN', _casUnary('trigtan'), { category: 'CAS / symbolic', categoryOrder: 21.3, label: "TRIGTAN" });
register('SINCOS', _casUnary('sincos'), { category: 'CAS / symbolic', categoryOrder: 21.4, label: "SINCOS" });


register('LIN', _casUnary('lin'), { category: 'CAS / symbolic', categoryOrder: 35, label: "LIN" });


// A bare point is approached by VX, or by the expression's only variable.  Names go through astToGiac so that
// ∞ and INFINITY become Giac's ±infinity.
function _limitPoint(v, vx) {
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
  const { varName, valGiac } = _limitPoint(pointArg, _vxFor(_toAst(exprArg)));
  const cmd = buildGiacCmd(_toAst(exprArg), (e) => `limit(${e},${varName},${valGiac})`, [varName]);
  _pushCasResult(s, giacToAst(giac.caseval(cmd)));
}, { category: 'CAS / symbolic', categoryOrder: 34, label: "LIMIT" });


register('lim', (s) => { lookup('LIMIT').fn(s); }, { category: 'CAS / symbolic', categoryOrder: 33, label: "LIM" });
