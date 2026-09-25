import { isSymbolic, Symbolic, isReal, isInteger, isName, isString, RList, isList, Real, Name, Integer, isComplex, Complex, isVector, Vector, isMatrix, Matrix, isValidHpIdentifier, isBinaryInteger, isRational } from '../types.js';
import { giac } from '../cas/giac-engine.mjs';
import { RPLError } from '../stack.js';
import { buildGiacCmd, giacToAst, splitGiacList, astToGiac } from '../cas/giac-convert.mjs';
import { Neg as AstNeg, Num as AstNum, Bin as AstBin, Var as AstVar, isNum as astIsNum, Fn as AstFn, freeVars as algebraFreeVars, isKnownFunction } from '../algebra.js';
import { getComplexMode, getCasVx, setCasVx } from '../state.js';
import { register, lookup, OPS } from './registry.js';
import { _ZERO, _astToRplValue, _isSymOperand, _toAst, _withListUnary, _withTaggedUnary, _withVMUnary } from './internal.js';



/* ------------------------------------------------------------------
   CAS — symbolic differentiation.

   DERIV  ( expr 'var' -- d-expr )

   Pops a Symbolic and a variable Name; pushes a Symbolic that is the
   derivative of `expr` with respect to `var`.  Fully simplified.

     '2*X + 3' 'X' DERIV   →   '2'
     'X^3 + 2*X' 'X' DERIV →   '3*X^2 + 2'
     'X^2 + Y^2' 'X' DERIV →   '2*X'       (Y treated as constant)

   For numeric-only inputs we accept a Real/Integer as shorthand: the
   derivative of a number w.r.t. anything is 0, so pushing Real(0) is
   harmless and lets users evaluate DERIV without first constructing
   a Symbolic.  Anything else is "Bad argument type".

   Shape of `var` argument: a Name (quoted or not).  We read .id.  If
   the user accidentally typed a plain string we ALSO accept it, to
   be forgiving — HP50 canonical form is a Name.

   This is the first slice of the longstanding CAS wishlist.  Followups
   will add INTVX, EXPAND, COLLECT, FACTOR on top of the same AST.
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   EXPAND  ( expr -- expanded )

   Distribute products and small integer powers of sums, then pass the
   result through the simplifier so the like-terms combiner sums
   coefficients.  Classic CAS expansion:

     '(X+1)^2' EXPAND      →  'X^2 + 2*X + 1'
     '(X+1)*(X-1)' EXPAND  →  'X^2 - 1'
     '(2*X+1)^3' EXPAND    →  '8*X^3 + 12*X^2 + 6*X + 1'

   Unsupported operand shapes (rational / negative / non-numeric
   exponents, fractional bases, etc.) pass through unchanged — EXPAND
   is partial by design and composes with DERIV / EVAL.  Constants
   and lone variables are idempotent.
   ------------------------------------------------------------------ */

register('EXPAND', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `expand(${e})`);
    const ast = giacToAst(giac.caseval(cmd));
    s.push(Symbolic(ast));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    // Numbers and bare Names are idempotent under EXPAND.  Pushing the
    // value back keeps EXPAND a no-op in those cases — matches the HP50
    // convention that EXPAND on a non-algebraic is a pass-through.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 6, label: "EXPAND" });


/* ------------------------------------------------------------------
   COLLECT  ( expr -- collected )                      (1-arg form)
   COLLECT  ( expr 'var' -- collected )                (2-arg form)

   The 1-arg form is a simplify alias so the CAS menu's COLLECT slot
   has a sensible target.  The 2-arg form is a polynomial collector:
   when the top of stack is a quoted Name (or a String), the op pops
   it as the collection variable and groups the expression below by
   powers of that variable:

     'X + A*X + B*X + C' 'X' COLLECT   →  '(A + B + 1)*X + C'
     'X^2 + 2*X^2 + X'  'X' COLLECT   →  '3*X^2 + X'

   Dispatch rule: look at the top of stack; if it's a Name / String
   AND the level-2 value is a Symbolic, treat it as the 2-arg form.
   Otherwise fall back to 1-arg (simplifier's like-terms combiner).

   Idempotent on numbers and bare names with stack depth 1, matching
   EXPAND's behavior so users can blindly compose either against any
   algebraic.
   ------------------------------------------------------------------ */
register('COLLECT', (s) => {
  // 2-arg form — top is a variable specifier and level-2 is a Symbolic.
  // Routes through Giac's `collect(expr,var)` which groups by powers of
  // the named variable.  We test level-2 first so a lone Name at depth
  // 1 still hits the pass-through path below.
  if (s.depth >= 2) {
    const top = s.peek(1);
    const below = s.peek(2);
    if ((isName(top) || isString(top)) && isSymbolic(below)) {
      const varName = isName(top) ? top.id : top.value;
      s.pop();                             // discard the variable spec
      const expr = s.pop();
      if (!giac.isReady()) throw new RPLError('CAS not ready');
      const cmd = buildGiacCmd(expr.expr, (e) => `collect(${e},${varName})`, [varName]);
      s.push(Symbolic(giacToAst(giac.caseval(cmd))));
      return;
    }
  }
  // 1-arg form — simplify alias.  Giac's `simplify()` combines like
  // terms and canonicalises — same intent as the old algebra.simplify.
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `simplify(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 7, label: "COLLECT" });


/* ------------------------------------------------------------------
   SIMPLIFY  ( expr -- simplified )

   HP50 CAS command.  Canonicalises an expression — combines like
   terms, cancels common factors, folds constants.  Thin shim over
   Giac's `simplify()` (the same call COLLECT's 1-arg form uses); the
   dedicated op exists so the HP50 CAS menu's SIMPLIFY slot and user
   programs that spell out `'expr' SIMPLIFY` keep working unchanged
   after the algebra.js retirement.  Numbers and bare names are
   idempotent — pushed back untouched.
   ------------------------------------------------------------------ */
register('SIMPLIFY', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `simplify(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) { s.push(v); return; }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 15, label: "SIMPLIFY" });


/* ------------------------------------------------------------------
   FACTOR  ( expr -- factored )

   Attempts to factor a polynomial.  Current coverage:

     monic quadratic with integer roots
       'X^2 + 2*X + 1'  FACTOR  →  '(X + 1)^2'
       'X^2 - 1'        FACTOR  →  '(X - 1)*(X + 1)'
       'X^2 + 5*X + 6'  FACTOR  →  '(X + 2)*(X + 3)'

   Unsupported shapes (non-monic, irrational roots, degree > 2,
   multi-variable) pass through unchanged — matches EXPAND's partial
   convention so composition stays safe.

   Accepts Symbolic directly.  Integer (and integer-valued Real)
   operands prime-factorise:
       12 FACTOR  →  '2^2*3'
        7 FACTOR  →  '7'            (already prime)
      -12 FACTOR  →  '-(2^2*3)'
   0 / ±1 / non-integer Real / Name pass through unchanged — no
   meaningful factorisation, and the user's input shape is preserved
   so FACTOR remains composition-safe.
   ------------------------------------------------------------------ */
register('FACTOR', (s) => {
  const v = s.pop();

  // Symbolic input: route to Giac.  Convert the AST to a Giac expression
  // string, call factor(...), then parse Giac's output back into an AST.
  // No fallback — if Giac isn't ready or the call errors, the op errors.
  if (isSymbolic(v)) {
    if (!giac.isReady()) {
      throw new RPLError('CAS not ready');
    }
    const cmd = buildGiacCmd(v.expr, (e) => `factor(${e})`);
    const giacResult = giac.caseval(cmd);
    const ast = giacToAst(giacResult);
    s.push(Symbolic(ast));
    return;
  }

  // Integer input: keep the native trial-division path. It's fast for
  // the classroom-calculator range, handles negatives/zero/one/huge-int
  // edge cases crisply, and doesn't need Giac. (Routing it to Giac would
  // actually regress — caseval("factor(12)") returns "(2)^2*3" which is
  // not what HP50 users expect.)
  if (isInteger(v) || (isReal(v) && v.value.isInteger())) {
    const bv = isInteger(v) ? v.value : BigInt(v.value.toFixed(0));
    const abs = bv < 0n ? -bv : bv;
    // 0 and ±1 have no meaningful prime factorisation, and the
    // trial-division loop wouldn't finish past 2^53, so in both cases
    // pass the value through.
    if (abs < 2n || abs > BigInt(Number.MAX_SAFE_INTEGER)) {
      s.push(v);
      return;
    }
    const factors = _primeFactor(abs);
    let ast = _factorsToAst(factors);
    if (bv < 0n) ast = AstNeg(ast);
    s.push(Symbolic(ast));
    return;
  }
  if (isReal(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 8, label: "FACTOR" });


/** Prime factorise a positive BigInt ≥ 2.  Returns an array of
 *  `{ p: BigInt, e: number }` ascending by prime.  Trial division
 *  with a 2-then-odds wheel; fine for values up to ~2^53 (FACTOR
 *  bails out past that).  Not a cryptographic primitive — just a
 *  classroom-calculator factoriser. */
function _primeFactor(n) {
  const factors = [];
  let rem = n;
  if (rem % 2n === 0n) {
    let e = 0;
    while (rem % 2n === 0n) { rem /= 2n; e++; }
    factors.push({ p: 2n, e });
  }
  for (let p = 3n; p * p <= rem; p += 2n) {
    if (rem % p !== 0n) continue;
    let e = 0;
    while (rem % p === 0n) { rem /= p; e++; }
    factors.push({ p, e });
  }
  if (rem > 1n) factors.push({ p: rem, e: 1 });
  return factors;
}


/** Build a Symbolic AST for the product `p1^e1 * p2^e2 * …`.  Single
 *  factor with exponent 1 (i.e. the input was prime) gives a lone
 *  Num; longer lists left-fold into a `*` chain. */
function _factorsToAst(factors) {
  const terms = factors.map(({ p, e }) => {
    const pAst = AstNum(Number(p));
    return e === 1 ? pAst : AstBin('^', pAst, AstNum(e));
  });
  return terms.reduce((acc, t) => AstBin('*', acc, t));
}


/* ------------------------------------------------------------------
   SOLVE  ( eqn 'var' -- { eqn1 eqn2 ... } )
   SOLVE  ( expr 'var' -- { eqn1 eqn2 ... } )     (expr = 0 implied)

   Solve a single-variable linear or quadratic equation.  Returns a
   list of Symbolic equations — one per root,
   in the order the closed-form formula produces them (larger root
   first for quadratics; rational-root order for cubic / quartic
   via FACTOR).

       'X^2 - 4'   'X' SOLVE    →  { 'X = 2' 'X = -2' }
       'X^2 = X'   'X' SOLVE    →  { 'X = 1' 'X = 0' }
       '2*X - 4'   'X' SOLVE    →  { 'X = 2' }
       'X^2 + X - 1' 'X' SOLVE  →  { 'X = (-1 + √5)/2' 'X = (-1 - √5)/2' }
       'X^2 + 1'   'X' SOLVE    →  { }   (no real roots; complex TBD)
       'X^3 - 6X^2 + 11X - 6' 'X' SOLVE  →  { 'X = 1' 'X = 3' 'X = 2' }

   The variable can be a Name (HP50 canonical) or a String for typed
   convenience; either way we pull out the identifier and pass it
   into algebraSolve.  Expressions whose shape isn't recognised
   (non-polynomial, symbolic coefficients, degree > 4) fall through
   as an empty list.
   ------------------------------------------------------------------ */
register('SOLVE', (s) => {
  const varArg  = s.pop();
  const exprArg = s.pop();

  // Pull variable identifier.
  let varName;
  if (isName(varArg))      varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Pull expression AST.  Real/Integer/Name get treated as bare
  // expressions (constants / single variables) — a constant has
  // no root unless it's zero; a Name matches only when it equals
  // varName and gives X = 0.
  let ast;
  if (isSymbolic(exprArg))        ast = exprArg.expr;
  else if (isName(exprArg))       ast = AstVar(exprArg.id);
  else if (isReal(exprArg))       ast = AstNum(exprArg.value.toNumber());
  else if (isInteger(exprArg))    ast = AstNum(Number(exprArg.value));
  else throw new RPLError('Bad argument type');

  // Normalise equation form `lhs = rhs` to expression form `lhs - rhs`
  // before handing to Giac.  Giac's `solve` accepts both shapes, but the
  // bare-expression form is unambiguous regardless of caseval mode flags
  // (Xcas vs Maple/Mupad parsing of `=`), so we can stop worrying about
  // a future build of giacwasm.js shipping with a different default.
  // `=` is the only comparison form HP50 SOLVE recognises (≠/≥/… aren't
  // equation roots in the textbook sense); anything else passes through
  // unchanged and Giac will reject it the same way it does today.
  if (ast && ast.kind === 'bin' && ast.op === '=') {
    ast = AstBin('-', ast.l, ast.r);
  }

  // Route through Giac: `solve(expr,var)` returns a list literal like
  // `[r1,r2,…]`.  We split the list (nesting-aware via splitGiacList),
  // parse each root, and wrap each as an equation `var = root` —
  // matches the HP50 convention that SOLVE yields a list of equations.
  //
  // Complex mode (HP50 flag -103, our `complexMode`): when SET, SOLVE
  // searches for complex roots as well as real ones, so we route through
  // Giac's `csolve` instead of `solve` (and `cfsolve` for the numeric
  // fallback below).  When CLEAR — the factory-reset default — we stay
  // on real-only `solve`/`fsolve`, matching the stock HP50.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmplx = getComplexMode();
  const solveFn = cmplx ? 'csolve' : 'solve';
  const cmd = buildGiacCmd(ast, (e) => `${solveFn}(${e},${varName})`, [varName]);
  let raw = giac.caseval(cmd);
  // Numeric fallback: when Giac can't reduce a root to closed-form
  // radicals (typically a cubic with no rational roots, or higher-
  // degree polynomials), it returns its `rootof([[…]],[[…]])`
  // placeholder syntax.  Our algebra parser can't decode that nested-
  // array argument shape, so retry with `fsolve` (real mode) / `cfsolve`
  // (complex mode), which return roots numerically (e.g. `[-0.6388…]`).
  if (typeof raw === 'string' && raw.includes('rootof')) {
    const fsolveFn = cmplx ? 'cfsolve' : 'fsolve';
    const cmdN = buildGiacCmd(ast, (e) => `${fsolveFn}(${e},${varName})`, [varName]);
    raw = giac.caseval(cmdN);
  }
  let parts = splitGiacList(raw);
  // Giac returns `[]` for "no solutions", or — on some inputs / build
  // configurations — a bare scalar when it has a single root and didn't
  // wrap it in a list.  Treat the bare-scalar case as a one-element list
  // so `'X-1' 'X' SOLVE` doesn't collapse to `{ }` in builds that elide
  // the brackets.  Genuine no-solution stays `[]` → empty list.
  if (parts === null) {
    const trimmed = String(raw).trim();
    if (trimmed.length > 0) parts = [trimmed];
  }
  if (parts === null || parts.length === 0) {
    s.push(RList([]));
    return;
  }
  const items = parts.map((rootStr) => {
    const rootAst = giacToAst(rootStr);
    return Symbolic(AstBin('=', AstVar(varName), rootAst));
  });
  s.push(RList(items));
}, { category: 'CAS / symbolic', categoryOrder: 9, label: "SOLVE" });


/* ------------------------------------------------------------------
   ISOL  ( expr 'var' -- { eqn1 eqn2 ... } )

   HP50 CAS command — "isolate" a variable.  On the stock HP50 ISOL
   inverts an expression algebraically and returns a single equation
   `X = …` with sign-placeholder variables for the ambiguous branches.
   Giac doesn't expose an `isolate` primitive; the closest semantic
   match is `solve(expr,var)` which returns every branch as a concrete
   root.  We therefore register ISOL as a thin alias of SOLVE: same
   inputs, same output shape (list of `var=root` equations).  Users
   writing `'expr' 'X' ISOL` in programs imported from an HP50 will
   see a list instead of a single equation for multi-branch cases —
   slightly more informative than the HP's sign-placeholder form, and
   still composable (DUP HEAD / first-element access picks the branch
   they'd have gotten natively).

       'A*X + B'  'X' ISOL    →  { 'X = -B/A' }
       'X^2 - 4'  'X' ISOL    →  { 'X = 2' 'X = -2' }
   ------------------------------------------------------------------ */
register('ISOL', lookup('SOLVE').fn, { category: 'CAS / symbolic', categoryOrder: 10, label: "ISOL" });


/* ------------------------------------------------------------------
   SUBST  ( expr 'var' value -- result )                (3-arg form)
   SUBST  ( expr { 'var' value ... } -- result )        (2-arg list)

   Substitute a value into an expression.  The
   3-argument form takes a Name / String as the target variable and
   any AST-representable value (Real, Integer, Symbolic, Name).  The
   list form accepts a List of alternating (name, value) pairs for
   convenient multi-substitution:

     'X^2 + 1' 'X' 3 SUBST              →  10
     'A*X + B' 'X' 'Y+1' SUBST          →  'A*(Y + 1) + B'
     'X + Y' { 'X' 2 'Y' 3 } SUBST      →  5

   After every substitution the expression is simplified, so numeric
   substitutions collapse to a Real when all free variables bind to
   concrete numbers.  Anything more exotic stays symbolic.

   Unwrap rule: if the post-simplify AST is a pure Num, we push a
   Real; otherwise we push a Symbolic.  Matches DERIV's unwrap
   convention ('0' comes back as Real(0)).
   ------------------------------------------------------------------ */
register('SUBST', (s) => {
  // SUBST routes through Giac: each (var → value) binding becomes
  // `subst(expr, var=valueExpr)`.  Multi-substitution is applied
  // sequentially — Giac's own multi-subst is associative but the
  // sequential form keeps the code path identical between the list
  // and 3-arg forms.  We purge the binding var as well as the free
  // vars of both expr and value so Xcas built-ins stay neutralised.
  const substViaGiac = (ast, vname, valueAst) => {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const valueGiac = astToGiac(valueAst);
    // `freeVars(valueAst)` doesn't get walked by `buildGiacCmd` (which
    // only walks exprAst) so we pass the value's free vars in via
    // extraVars, plus the binding variable itself.
    const extra = [vname, ...algebraFreeVars(valueAst)];
    const cmd = buildGiacCmd(
      ast,
      (e) => `subst(${e},${vname}=${valueGiac})`,
      extra,
    );
    return giacToAst(giac.caseval(cmd));
  };

  const top = s.peek();

  // Form A: list form.  Walks items looking for either a
  //   Symbolic equation (one item, Bin('=', Var, rhs)), or
  //   a (name, value) pair (two consecutive items).
  // Equation entries coexist with strict-pair semantics: pairs are
  // used when no equations appear.
  if (isList(top)) {
    const items = top.items;
    s.pop();
    const exprVal = s.pop();
    if (!isSymbolic(exprVal) && !isName(exprVal)) {
      throw new RPLError('Bad argument type');
    }
    let ast = isSymbolic(exprVal) ? exprVal.expr
            : AstVar(exprVal.id);
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (_isEquationSymbolic(item)) {
        ast = substViaGiac(ast, item.expr.l.name, item.expr.r);
        i += 1;
      } else {
        if (i + 1 >= items.length) {
          throw new RPLError('SUBST: list needs pairs or equations');
        }
        const nameVal  = item;
        const valueVal = items[i + 1];
        const vname = isName(nameVal)    ? nameVal.id
                    : isString(nameVal)  ? nameVal.value
                    : null;
        if (vname === null) throw new RPLError('SUBST: bad variable name in list');
        ast = substViaGiac(ast, vname, coerceToAst(valueVal));
        i += 2;
      }
    }
    _pushSubstResult(s, ast);
    return;
  }

  // Form B: equation on top.  `expr 'X = 3' SUBST` — the HP50-canonical
  // 2-arg form.
  if (s.depth >= 2 && _isEquationSymbolic(top)) {
    const eqn = s.pop();
    const exprVal = s.pop();
    let ast;
    if (isSymbolic(exprVal))     ast = exprVal.expr;
    else if (isName(exprVal))    ast = AstVar(exprVal.id);
    else if (isReal(exprVal))    ast = AstNum(exprVal.value.toNumber());
    else if (isInteger(exprVal)) ast = AstNum(Number(exprVal.value));
    else throw new RPLError('Bad argument type');
    const result = substViaGiac(ast, eqn.expr.l.name, eqn.expr.r);
    _pushSubstResult(s, result);
    return;
  }

  // Form C: 3-arg form: expr 'var' value.
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [exprVal, varVal, valueVal] = s.popN(3);
  let ast;
  if (isSymbolic(exprVal))    ast = exprVal.expr;
  else if (isName(exprVal))   ast = AstVar(exprVal.id);
  else if (isReal(exprVal))   ast = AstNum(exprVal.value.toNumber());
  else if (isInteger(exprVal)) ast = AstNum(Number(exprVal.value));
  else throw new RPLError('Bad argument type');
  const vname = isName(varVal)   ? varVal.id
              : isString(varVal) ? varVal.value
              : null;
  if (vname === null) throw new RPLError('SUBST: bad variable');
  const result = substViaGiac(ast, vname, coerceToAst(valueVal));
  _pushSubstResult(s, result);
}, { category: 'CAS / symbolic', categoryOrder: 4, label: "SUBST" });


/** True when v is a Symbolic whose AST is `Bin('=', Var(name), rhs)` —
 *  the shape SUBST consumes as a one-shot variable binding. */
function _isEquationSymbolic(v) {
  return isSymbolic(v) && v.expr && v.expr.kind === 'bin' &&
         v.expr.op === '=' && v.expr.l && v.expr.l.kind === 'var';
}


/** Coerce a stack value to an algebra AST node for substitution. */
function coerceToAst(v) {
  if (isSymbolic(v)) return v.expr;
  if (isReal(v))     return AstNum(v.value.toNumber());
  if (isInteger(v))  return AstNum(Number(v.value));
  if (isName(v))     return AstVar(v.id);
  throw new RPLError('SUBST: unsupported value type');
}


/** Push the simplified result of a SUBST — unwrap Num to Real for
 *  users who substitute numeric values into every free variable. */
function _pushSubstResult(s, ast) {
  if (ast && ast.kind === 'num') { s.push(_astToRplValue(ast)); return; }
  if (ast && ast.kind === 'var') { s.push(Name(ast.name)); return; }
  s.push(Symbolic(ast));
}


register('DERIV', (s) => {
  const [expr, varArg] = s.popN(2);     // level2=expr, level1=var
  // Variable: accept Name (preferred) or String.
  let varName;
  if (isName(varArg))      varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Expression: Symbolic → route through Giac's diff(expr, var).
  // `buildGiacCmd` adds `purge(…)` for every free variable (the diff
  // variable included, via extraVars) so Xcas built-in names like
  // `UI`/`GF` don't collide with the user's identifiers.
  if (isSymbolic(expr)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(expr.expr, (e) => `diff(${e},${varName})`, [varName]);
    const ast = giacToAst(giac.caseval(cmd));
    s.push(Symbolic(ast));
    return;
  }
  // Constant shortcut — number → 0.
  if (isReal(expr) || isInteger(expr)) {
    s.push(Real(0));
    return;
  }
  // Bare Name: treat as the variable itself.  `'X' 'X' DERIV` should
  // yield `1`; `'Y' 'X' DERIV` yields `0`.  Pushing an Integer is fine,
  // and keeps the result usable from numeric code without unwrapping a
  // Symbolic just to read the 1 back out.
  if (isName(expr)) {
    s.push(Integer(expr.id === varName ? 1n : 0n));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 0, label: "DERIV" });


/** INTEG — indefinite integral of a symbolic expression w.r.t. a variable.
 *
 *  Stack:  level2=expr, level1=var  →  antiderivative
 *
 *  Expression types accepted:
 *    Symbolic       — routed through algebra.integ (polynomial + linearity
 *                     + a handful of direct-arg trig/exp/log cases)
 *    Real/Integer   — constants integrate to c*var
 *    Name           — bare name behaves like a Symbolic Var
 *  Anything that doesn't simplify to a closed form comes back as
 *  a Symbolic `INTEG(expr, var)` so the result round-trips. */
register('INTEG', (s) => {
  const [expr, varArg] = s.popN(2);
  let varName;
  if (isName(varArg))        varName = varArg.id;
  else if (isString(varArg)) varName = varArg.value;
  else throw new RPLError('Bad argument type');

  // Helper: call Giac's integrate(expr,var).  `extraVars` includes the
  // integration variable so it gets purged alongside the free vars —
  // without this, `integrate(UI, UI)` would see Giac's reserved `UI`.
  const integrateViaGiac = (ast) => {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(ast, (e) => `integrate(${e},${varName})`, [varName]);
    return giacToAst(giac.caseval(cmd));
  };

  if (isSymbolic(expr)) {
    s.push(Symbolic(integrateViaGiac(expr.expr)));
    return;
  }
  if (isReal(expr) || isInteger(expr)) {
    const c = isInteger(expr) ? Number(expr.value) : expr.value;
    if (c === 0) { s.push(Integer(0n)); return; }
    s.push(Symbolic(integrateViaGiac(AstNum(c))));
    return;
  }
  if (isName(expr)) {
    s.push(Symbolic(integrateViaGiac(AstVar(expr.id))));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 2, label: "INTEG" });


/* --------------- INTVX / DERVX — VX-implicit forms --------------------
 *
 * HP50 AUR §3.4.  Same engines as INTEG / DERIV but the variable comes
 * from the CAS-main slot rather than the stack — convenient when the
 * user has already SVX'd their preferred variable.  Implemented as a
 * thin shim that pushes `Name(VX)` and delegates to the explicit-var
 * sibling so any future refinement of INTEG / DERIV is automatically
 * inherited.
 *
 * `DERIVX` is the verbose spelling some HP family programs use; we
 * register it as an alias so either name works. */

register('INTVX', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  s.push(Name(getCasVx()));
  OPS.get('INTEG').fn(s);
}, { category: 'CAS / symbolic', categoryOrder: 3, label: "INTVX" });


register('DERVX', (s) => {
  if (s.depth < 1) throw new RPLError('Too few arguments');
  s.push(Name(getCasVx()));
  OPS.get('DERIV').fn(s);
}, { category: 'CAS / symbolic', categoryOrder: 1, label: "DERVX" });


/* --------------- EPSX0 — zero out small numeric values ----------------
   HP50 AUR §11.6.  Walks a Symbolic AST and replaces every numeric
   node whose absolute value is below the CAS threshold (HP50 reads the
   variable `EPS` from the current directory; we use a fixed 1e-10 as
   the default, matching the HP50 factory setting).  The replacement
   is done in a fresh AST so the input expression is not mutated.

   Pass-through on non-Symbolic (Real / Integer / BinInt / Complex) —
   the scalar is compared directly and, if below threshold, replaced
   with Integer(0).  List / Vector / Matrix inputs apply the op
   element-wise.

     EPSX0  ( Sy → Sy' )
              Walks the AST.  Numeric node with |value| < 1e-10 → 0.
              Other nodes recurse into children.

   Simplification after substitution is deferred to the caller
   (chaining with SIMPLIFY is the HP50 idiom).  Output is always
   Symbolic, preserving the input kind so `SIMPLIFY` can close the
   loop.
   ----------------------------------------------------------------- */

const _EPSX0_THRESHOLD = 1e-10;


function _epsx0Ast(ast) {
  if (astIsNum(ast)) {
    if (Math.abs(ast.value) < _EPSX0_THRESHOLD) return AstNum(0);
    return ast;
  }
  if (ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _epsx0Ast(ast.arg);
    // If inner collapsed to num 0, drop the neg.
    if (astIsNum(inner) && inner.value === 0) return AstNum(0);
    return AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    return AstBin(ast.op, _epsx0Ast(ast.l), _epsx0Ast(ast.r));
  }
  if (ast.kind === 'fn') {
    return AstFn(ast.name, ast.args.map(_epsx0Ast));
  }
  return ast;
}


function _epsx0Scalar(v) {
  if (isInteger(v)) {
    // Integers are exact — below-threshold only if the value is 0.
    return v.value === 0n ? Integer(_ZERO) : v;
  }
  if (isReal(v)) {
    return v.value.abs().lt(_EPSX0_THRESHOLD) ? Real(0) : v;
  }
  if (isComplex(v)) {
    const r = Math.abs(v.re) < _EPSX0_THRESHOLD ? 0 : v.re;
    const i = Math.abs(v.im) < _EPSX0_THRESHOLD ? 0 : v.im;
    if (i === 0) return Real(r);
    return Complex(r, i);
  }
  return v;
}


register('EPSX0', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    s.push(Symbolic(_epsx0Ast(v.expr)));
    return;
  }
  if (isReal(v) || isInteger(v) || isComplex(v)) {
    s.push(_epsx0Scalar(v));
    return;
  }
  if (isList(v)) {
    s.push(RList(v.items.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    })));
    return;
  }
  if (isVector(v)) {
    s.push(Vector(v.items.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    })));
    return;
  }
  if (isMatrix(v)) {
    s.push(Matrix(v.rows.map(row => row.map(item => {
      if (isSymbolic(item)) return Symbolic(_epsx0Ast(item.expr));
      if (isReal(item) || isInteger(item) || isComplex(item)) return _epsx0Scalar(item);
      return item;
    }))));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 14, label: "EPSX0" });


/* --------------- DISTRIB — distribute multiplication over addition ----
   HP50 AUR §11.3.  Applies the distributive law to the outermost
   eligible binary node of a Symbolic expression — that is:

     a*(b+c) → a*b + a*c
     a*(b-c) → a*b - a*c
     (b+c)*a → b*a + c*a
     (b-c)*a → b*a - c*a

   and likewise for division over addition on the left:

     (b+c)/a → b/a + c/a
     (b-c)/a → b/a - c/a

   The HP50 applies exactly ONE distribute step per invocation — to
   expand fully, the user calls DISTRIB repeatedly (or uses EXPAND).
   Our implementation is top-down: recurse through the AST until the
   first distributable node is found, rewrite it, return — no further
   passes on the same tree.  Non-distributable expression is
   returned unchanged.  Non-Symbolic input throws Bad argument type.
   ----------------------------------------------------------------- */

function _distribOnce(ast) {
  // Returns [newAst, changed].  Visits in pre-order (root first),
  // rewrites the first a*(b±c), (b±c)*a, or (b±c)/a it finds, and
  // stops.  If none found, returns [ast, false].
  if (ast.kind === 'bin') {
    if (ast.op === '*') {
      if (ast.r.kind === 'bin' && (ast.r.op === '+' || ast.r.op === '-')) {
        // a * (b op c) → (a*b) op (a*c)
        return [AstBin(ast.r.op,
          AstBin('*', ast.l, ast.r.l),
          AstBin('*', ast.l, ast.r.r)), true];
      }
      if (ast.l.kind === 'bin' && (ast.l.op === '+' || ast.l.op === '-')) {
        // (b op c) * a → (b*a) op (c*a)
        return [AstBin(ast.l.op,
          AstBin('*', ast.l.l, ast.r),
          AstBin('*', ast.l.r, ast.r)), true];
      }
    }
    if (ast.op === '/') {
      if (ast.l.kind === 'bin' && (ast.l.op === '+' || ast.l.op === '-')) {
        // (b op c) / a → (b/a) op (c/a)
        return [AstBin(ast.l.op,
          AstBin('/', ast.l.l, ast.r),
          AstBin('/', ast.l.r, ast.r)), true];
      }
    }
    // Recurse into children — left first.
    const [lNew, lCh] = _distribOnce(ast.l);
    if (lCh) return [AstBin(ast.op, lNew, ast.r), true];
    const [rNew, rCh] = _distribOnce(ast.r);
    if (rCh) return [AstBin(ast.op, ast.l, rNew), true];
    return [ast, false];
  }
  if (ast.kind === 'neg') {
    const [inner, ch] = _distribOnce(ast.arg);
    return ch ? [AstNeg(inner), true] : [ast, false];
  }
  if (ast.kind === 'fn') {
    for (let i = 0; i < ast.args.length; i++) {
      const [newArg, ch] = _distribOnce(ast.args[i]);
      if (ch) {
        const newArgs = ast.args.slice();
        newArgs[i] = newArg;
        return [AstFn(ast.name, newArgs), true];
      }
    }
    return [ast, false];
  }
  return [ast, false];
}


register('DISTRIB', (s) => {
  const v = s.pop();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const [newAst, _ch] = _distribOnce(v.expr);
  s.push(Symbolic(newAst));
}, { category: 'CAS / symbolic', categoryOrder: 11, label: "DISTRIB" });


/* ---- XNUM / XQ — ASCII aliases ---------------------------------------
   HP50 AUR p.2-211.  `XNUM` and `XQ` are the mode-agnostic names HP50
   firmware uses for `→NUM` and `→Q` in contexts where the arrow glyph
   is inconvenient (keyboards without `→`, textual catalog output).
   Implement as thin wrappers that delegate to the shipped handlers.
*/
register('XNUM', (s, entry) => { OPS.get('→NUM').fn(s, entry); }, { category: 'CAS / symbolic', categoryOrder: 42, label: "XNUM" });

register('XQ',   (s, entry) => { OPS.get('→Q').fn(s, entry); }, { category: 'CAS / symbolic', categoryOrder: 43, label: "XQ" });


/* ---- VX / SVX — CAS main variable -----------------------------------
   HP50 AUR §2.6.  VX is the CAS "main variable" the firmware falls
   back on whenever a CAS op has to pick a canonical variable from a
   multi-free-variable or constant argument: LAPLACE, ILAP, PREVAL,
   DERVX, INTVX, TABVAL, TAYLOR0, etc.  On real hardware VX is a
   directory variable in CASDIR the user stores into from the stack;
   we back it with a dedicated `state.casVx` slot instead so the
   setter is free of HOME/VAR bookkeeping and survives persistence.

     VX   ( → Name )    push the current CAS main variable as a Name.
     SVX  ( Name → )    set the CAS main variable from a Name (or
                        string — HP50 accepts either at the prompt).

   Rejection: SVX with anything other than Name/String throws
   `Bad argument type`.  Empty-string / empty-name throws
   `Bad argument value`.  VX never throws — it pushes the default
   Name `'X'` on a freshly-booted unit.

   The slot survives page reloads via `persist.js`.  Both ops emit a
   state-change event through the `setCasVx` helper so future status-
   line annunciators can display the active VX. */

register('VX', (s) => {
  s.push(Name(getCasVx()));
}, { category: 'CAS / symbolic', categoryOrder: 40, label: "VX" });


register('SVX', (s) => {
  const [v] = s.popN(1);
  let name;
  if (isName(v))        name = v.id;
  else if (isString(v)) name = v.value;
  else throw new RPLError('Bad argument type');
  if (!isValidHpIdentifier(name)) {
    // HP50 rejects empty strings and any non-conforming name for SVX.
    // We use the validator here (not isStorableHpName) because the CAS
    // main variable legitimately overlaps the reserved-ops space on
    // the HP50 — `'X' SVX` is the factory default, yet 'X' is also a
    // command-line name slot.  Only syntactic validity is enforced.
    throw new RPLError(`Invalid name: ${name}`);
  }
  setCasVx(name);
}, { category: 'CAS / symbolic', categoryOrder: 41, label: "SVX" });


/* ---- PREVAL — evaluate F at two endpoints --------------------------
   HP50 AUR §11.  The workhorse for "definite integral via
   antiderivative": evaluate `F(X)` at two scalars and subtract.

     F(X) a b PREVAL  ( Sy + R + R → Sy )    F(b) - F(a)

   HP50 firmware also accepts `F(X) {a b}` as a List-form convenience
   — we support that too.  The single free variable of F(X) is
   inferred via `freeVars`; when F has multiple free variables
   (F(X,Y)) we reject with Bad argument value.  F with no free
   variables is legal — PREVAL then returns `0` (F(b) - F(a) is 0
   when F is constant), matching HP50.

   Numeric endpoints (Real / Integer / BinInt) substitute in and let
   `algebraSubst` collapse the result.  When F has a closed-form
   that simplifies to a Number after substitution, PREVAL returns
   Real.  When it doesn't simplify, PREVAL returns Symbolic. */

register('PREVAL', (s) => {
  // Accept the list form: F {a b} PREVAL ⇒ rewrite to three-arg form.
  if (s.depth >= 2) {
    const top = s.peek(1);
    if (isList(top) && top.items.length === 2) {
      const lst = s.pop();
      s.push(lst.items[0]);
      s.push(lst.items[1]);
    }
  }
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [fVal, aVal, bVal] = s.popN(3);
  if (!isSymbolic(fVal)) throw new RPLError('Bad argument type');
  // Pick the variable to substitute.  HP50 firmware consults the CAS
  // main variable (VX).  Selection priority:
  //
  //   VX ∈ free(F)         → substitute VX.              (HP50 canonical)
  //   |free(F)| == 1       → substitute that single var. (classic
  //                          single-var PREVAL — the common case.)
  //   otherwise            → substitute VX anyway.  When VX isn't a
  //                          free variable the substitution is a
  //                          no-op and F(b) - F(a) folds to 0 (or
  //                          stays symbolic).  Matches HP50 AUR's
  //                          "the current variable is VX" phrasing
  //                          without rejecting the input.
  const vars = algebraFreeVars(fVal.expr);
  const vx = getCasVx();
  let varName;
  if (vars.has(vx))         varName = vx;
  else if (vars.size === 1) varName = [...vars][0];
  else                      varName = vx;
  const endpointToAst = (v) => {
    if (isReal(v))    return AstNum(v.value.toNumber());
    if (isInteger(v)) return AstNum(Number(v.value));
    if (isBinaryInteger(v)) return AstNum(Number(v.value));
    if (isSymbolic(v)) return v.expr;
    if (isName(v))    return AstVar(v.id);
    throw new RPLError('Bad argument type');
  };
  const aAst = endpointToAst(aVal);
  const bAst = endpointToAst(bVal);
  // Route through Giac.  One `subst` call per endpoint, followed by
  // Giac's own `simplify` to fold the difference.  All free-variable
  // names (of F, `a`, `b`) get purged so Xcas built-ins can't shadow
  // user variables.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const aG = astToGiac(aAst);
  const bG = astToGiac(bAst);
  const extra = [
    varName,
    ...algebraFreeVars(aAst),
    ...algebraFreeVars(bAst),
  ];
  const cmd = buildGiacCmd(
    fVal.expr,
    (e) => `simplify(subst(${e},${varName}=${bG})-subst(${e},${varName}=${aG}))`,
    extra,
  );
  const diff = giacToAst(giac.caseval(cmd));
  if (diff && diff.kind === 'num') { s.push(_astToRplValue(diff)); return; }
  s.push(Symbolic(diff));
}, { category: 'CAS / symbolic', categoryOrder: 5, label: "PREVAL" });


/* ---- TAN2SC — rewrite TAN(X) as SIN(X) / COS(X) -------------------
   HP50 AUR §5.6 / §11.9.  Single-pass AST rewrite: every occurrence
   of `TAN(arg)` becomes `SIN(arg) / COS(arg)`.  The argument is
   unchanged — TAN2SC is NOT recursive into `arg` (TAN nested inside
   the argument, e.g. `TAN(TAN(X))`, is handled by the outer walk
   because we recurse through all children before matching).

     Sy TAN2SC  ( Sy → Sy )   TAN(arg) → SIN(arg) / COS(arg), deep.

   Non-Symbolic input rejects with Bad argument type.  Pairs with
   TCOLLECT / TEXPAND once those land. */

function _tan2scWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tan2scWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tan2scWalk(ast.l);
    const r = _tan2scWalk(ast.r);
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tan2scWalk);
    if (ast.name === 'TAN' && args.length === 1) {
      // TAN(arg) → SIN(arg) / COS(arg)
      return AstBin('/', AstFn('SIN', [args[0]]), AstFn('COS', [args[0]]));
    }
    // Any other function: keep name, rebuild args if anything changed.
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}


register('TAN2SC', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tan2scWalk(v.expr)));
}, { category: 'CAS / symbolic', categoryOrder: 26, label: "TAN2SC" });


/* ---- EXLR — Extract Left and Right sides of a symbolic -----------
   HP50 AUR §4.9 / §11.4 (SYMBOLIC → OBJECT).  Splits the top-level
   binary operator of its Symbolic argument into two stack entries.
   The op itself is discarded; only the operands come back.

     Sy EXLR  ( Sy → Sy Sy )

   Operator classes matched at the top level:
     arithmetic   +  -  *  /  ^
     comparison   =  ≠  <  >  ≤  ≥

   Typical usage is on an equation `A = B`:

       'A = B' EXLR              →  'A'   'B'
       'X^2 + 2·X + 1 = 0' EXLR  →  'X^2+2·X+1'   '0'

   Non-binary-operator input (a bare Var / Num, a unary Neg, a
   function call) rejects with `Bad argument value` — there is no
   unambiguous "left" and "right" to extract.  Non-Symbolic input
   rejects with `Bad argument type`.  Both sides are returned as
   Symbolic regardless of whether the operand happens to be a lone
   variable or a number; users who want to unwrap can apply EVAL. */

register('EXLR', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const ast = v.expr;
  if (!ast || ast.kind !== 'bin') {
    // Leaf (num/var), unary (neg), or function call — no bin to split.
    throw new RPLError('Bad argument value');
  }
  s.push(Symbolic(ast.l));
  s.push(Symbolic(ast.r));
}, { category: 'CAS / symbolic', categoryOrder: 38, label: "EXLR" });


/* ------------------------------------------------------------------
   LNAME    (HP50 AUR §3-136)
   List variable names contained in a Symbolic expression.

     Input :  level 1 = 'symb'
     Output:  level 2 = 'symb'                (preserved)
              level 1 = [ Name1 Name2 ... ]   (Vector of Names)

   The HP50 walks the AST and collects:
     • every bare variable identifier (Var node), and
     • every USER-DEFINED function name (Fn node whose name is not on
       the calculator's built-in function list — `isKnownFunction`).
   Built-in calls like SIN, COS, INV, LN, … contribute their *arguments*
   but not their own names — `LNAME(COS(B)/2*A + MYFUNC(PQ) + INV(T))`
   yields `[MYFUNC PQ A B T]`, with COS / INV omitted.

   Sort order (per AUR p.3-136):
     • by length descending (longest first), then
     • alphabetically ascending within equal length.

   Non-Symbolic input rejects with `Bad argument type`.  The original
   argument is preserved on level 2 so callers can chain LNAME with
   another op without re-pushing it (matches the LASTARG pattern most
   reflection ops use).
   ------------------------------------------------------------------ */
register('LNAME', (s) => {
  const v = s.peek();
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');

  const seen = new Map();   // canonical id -> insertion-position (for stability)
  function visit(node) {
    if (!node) return;
    if (node.kind === 'var') {
      if (!seen.has(node.name)) seen.set(node.name, seen.size);
    } else if (node.kind === 'neg') {
      visit(node.arg);
    } else if (node.kind === 'bin') {
      visit(node.l);
      visit(node.r);
    } else if (node.kind === 'fn') {
      // User-defined function names participate; built-ins do not.
      if (!isKnownFunction(node.name) && !seen.has(node.name)) {
        seen.set(node.name, seen.size);
      }
      for (const a of node.args) visit(a);
    }
  }
  visit(v.expr);

  const ids = [...seen.keys()].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  s.push(Vector(ids.map((id) => Name(id))));
}, { category: 'CAS / symbolic', categoryOrder: 39, label: "LNAME" });


/* ---- LAPLACE / ILAP — Laplace transform and inverse --------------
   HP50 AUR §11.8.  Rules-based AST rewrite over the CAS main
   variable (VX, which we surface as `X` here until the VX state
   slot lands).  Implemented shapes:

     LAPLACE :  X^n        → n! / X^(n+1)           for n ∈ ℕ
                EXP(a·X)   → 1 / (X - a)
                SIN(a·X)   → a / (X^2 + a^2)
                COS(a·X)   → X / (X^2 + a^2)
                SINH(a·X)  → a / (X^2 - a^2)
                COSH(a·X)  → X / (X^2 - a^2)
                c·f(X)     → c·LAPLACE(f(X))        for constant c
                f + g      → LAPLACE(f) + LAPLACE(g)
                f - g      → LAPLACE(f) - LAPLACE(g)
                1          → 1/X

     ILAP   : inverse of the above table (same shapes mirrored).

   Non-recognised shapes fall through and are returned wrapped in a
   sentinel `LAP(...)` / `ILAP(...)` node so the user sees which
   sub-expression tripped the rule engine.  Pure Symbolic round-trip
   shape; no numeric evaluation.  Input non-Symbolic ⇒ Bad argument
   type.  Note that the HP50 firmware uses the CAS VX variable —
   we mirror that by picking the single free variable in the
   input (fall back to the current `getCasVx()` — default `x` — when
   the input is a constant). */

function _lapVarName(ast) {
  const vx = getCasVx();
  const vars = algebraFreeVars(ast);
  if (vars.size === 0) return vx;
  if (vars.size === 1) return [...vars][0];
  // Multi-variable input: HP50 uses VX.  If the CAS main variable is
  // one of the free vars, pick it; otherwise the first free var in
  // iteration order.
  return vars.has(vx) ? vx : [...vars][0];
}


/** Is `ast` a Num node? */
function _isNumNode(ast) { return ast && ast.kind === 'num'; }


register('LAPLACE', (s) => {
  const [v] = s.popN(1);
  let expr;
  if (isSymbolic(v))   expr = v.expr;
  else if (isName(v))  expr = AstVar(v.id);
  else throw new RPLError('Bad argument type');
  // Route through Giac.  HP50 convention: same variable for input
  // and output (`X → X`).  Giac's `laplace(f, x, s)` signature wants
  // three args — we pass the same name twice to keep the output in
  // X, matching the HP50's "transform in place" idiom.
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const varName = _lapVarName(expr);
  const cmd = buildGiacCmd(
    expr,
    (e) => `laplace(${e},${varName},${varName})`,
    [varName],
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
}, { category: 'CAS / symbolic', categoryOrder: 31, label: "LAPLACE" });


register('ILAP', (s) => {
  const [v] = s.popN(1);
  let expr;
  if (isSymbolic(v))   expr = v.expr;
  else if (isName(v))  expr = AstVar(v.id);
  else throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const varName = _lapVarName(expr);
  const cmd = buildGiacCmd(
    expr,
    (e) => `ilaplace(${e},${varName},${varName})`,
    [varName],
  );
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
}, { category: 'CAS / symbolic', categoryOrder: 32, label: "ILAP" });


/* ====================================================================
   HALFTAN / TAN2SC2 / TAN2CS2 / inverse-trig rewrites.
   ====================================================================

   Closes the HP50 tangent-half-angle family that TAN2SC opens, plus
   four inverse-trig identity rewrites (ACOS2S, ASIN2C, ASIN2T, ATAN2S)
   from the AUR's "…Ñ TRIG" menu.  The exact FROOTS residual-quadratic
   extractor above handles the `a ± √b` case the rational-root
   pre-scan deliberately leaves to Durand-Kerner — so `X² - 2 FROOTS`
   returns `Sym(√2)` / `Sym(-√2)` exactly instead of floats.

   All the rewrites here share the same `_trigIdentityWalk` substrate:
   a shallow AST walker that recurses into children, then consults a
   `{ FNNAME: rewrite(arg) → newAst }` map at each `fn` node.  The
   rewrite is NOT re-walked — so HALFTAN introducing a `TAN(X/2)` does
   NOT trigger the TAN-handler recursively (matching HP50 semantics).
   ==================================================================== */

/** Generic shallow rewrite walker for function-call identities.  Map
 *  keys are function names (e.g. 'SIN', 'TAN', 'ACOS'); values are
 *  `(arg) => newAst | null`.  A `null` return means "not applicable —
 *  keep the node".  Children are walked bottom-up, then the handler
 *  consults the map.  Once a rewrite succeeds, the result is NOT
 *  re-walked (so HALFTAN's TAN(x/2) output doesn't get handed back to
 *  its own TAN handler). */
function _trigIdentityWalk(ast, rewriteMap) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _trigIdentityWalk(ast.arg, rewriteMap);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _trigIdentityWalk(ast.l, rewriteMap);
    const r = _trigIdentityWalk(ast.r, rewriteMap);
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(a => _trigIdentityWalk(a, rewriteMap));
    if (rewriteMap[ast.name] && args.length === 1) {
      const r = rewriteMap[ast.name](args[0]);
      if (r != null) return r;
    }
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}


/* ---- HALFTAN — rewrite SIN / COS / TAN via tan(x/2) identities ------
   HP50 AUR §3-102.  Tangent-half-angle substitution:

     SIN(x) → 2·TAN(x/2) / (1 + TAN(x/2)²)
     COS(x) → (1 - TAN(x/2)²) / (1 + TAN(x/2)²)
     TAN(x) → 2·TAN(x/2) / (1 - TAN(x/2)²)

   Sibling to TAN2SC2 / TAN2CS2 below.  Non-Symbolic input throws Bad
   argument type.  Shallow walk — the introduced TAN(x/2) is NOT
   re-rewritten (that would infinite-loop).  Idempotent only in the
   trivial sense: a second invocation rewrites the *new* TAN(x/2) to
   yet-smaller-argument forms. */

function _halfTanOf(arg) {
  return AstFn('TAN', [AstBin('/', arg, AstNum(2))]);
}


register('HALFTAN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('*', AstNum(2), t),
        AstBin('+', AstNum(1), tsq));
    },
    COS: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('-', AstNum(1), tsq),
        AstBin('+', AstNum(1), tsq));
    },
    TAN: (arg) => {
      const t = _halfTanOf(arg);
      const tsq = AstBin('^', t, AstNum(2));
      return AstBin('/',
        AstBin('*', AstNum(2), t),
        AstBin('-', AstNum(1), tsq));
    },
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 20, label: "HALFTAN" });


/* ---- TAN2SC2 — TAN(x) → SIN(2x) / (1 + COS(2x)) ---------------------
   HP50 AUR §3-249.  Double-angle companion of TAN2SC.  The argument
   stays as-is in both SIN and COS; we multiply by `2` outside the
   function call.  Shallow walk: nested TAN(TAN(X)) rewrites inner
   first (since children are recursed), then outer — so the final
   result still expresses only in SIN / COS of the rewritten inner
   argument. */

register('TAN2SC2', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    TAN: (arg) => {
      const twoArg = AstBin('*', AstNum(2), arg);
      return AstBin('/',
        AstFn('SIN', [twoArg]),
        AstBin('+', AstNum(1), AstFn('COS', [twoArg])));
    },
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 27, label: "TAN2SC2" });


/* ---- TAN2CS2 — TAN(x) → (1 - COS(2x)) / SIN(2x) ---------------------
   HP50 AUR §3-248.  Dual of TAN2SC2 using `(1 - cos(2x))/sin(2x)`.
   Same shallow-walk semantics. */

register('TAN2CS2', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    TAN: (arg) => {
      const twoArg = AstBin('*', AstNum(2), arg);
      return AstBin('/',
        AstBin('-', AstNum(1), AstFn('COS', [twoArg])),
        AstFn('SIN', [twoArg]));
    },
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 28, label: "TAN2CS2" });


/* ---- Inverse-trig identity rewrites ---------------------------------
   HP50 AUR §3-7 (ACOS2S), §3-17 (ASIN2C, ASIN2T), §3-21 (ATAN2S).
   Each is a single shallow-walk identity:

     ACOS2S : ACOS(x) → π/2 − ASIN(x)
     ASIN2C : ASIN(x) → π/2 − ACOS(x)
     ASIN2T : ASIN(x) → ATAN(x / √(1 − x²))
     ATAN2S : ATAN(x) → ASIN(x / √(x² + 1))

   `PI` is emitted as `AstVar('PI')` so it round-trips through EXACT
   mode (under APPROX, `→NUM` / EVAL would fold it to 3.14159…). */

function _piOver2Ast() {
  return AstBin('/', AstVar('PI'), AstNum(2));
}


register('ACOS2S', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ACOS: (arg) => AstBin('-', _piOver2Ast(), AstFn('ASIN', [arg])),
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 22, label: "ACOS2S" });


register('ASIN2C', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ASIN: (arg) => AstBin('-', _piOver2Ast(), AstFn('ACOS', [arg])),
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 23, label: "ASIN2C" });


register('ASIN2T', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ASIN: (arg) => {
      // ATAN(x / √(1 - x²))
      const xsq = AstBin('^', arg, AstNum(2));
      const radicand = AstBin('-', AstNum(1), xsq);
      const denom = AstFn('SQRT', [radicand]);
      return AstFn('ATAN', [AstBin('/', arg, denom)]);
    },
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 24, label: "ASIN2T" });


register('ATAN2S', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    ATAN: (arg) => {
      // ASIN(x / √(x² + 1))
      const xsq = AstBin('^', arg, AstNum(2));
      const radicand = AstBin('+', xsq, AstNum(1));
      const denom = AstFn('SQRT', [radicand]);
      return AstFn('ASIN', [AstBin('/', arg, denom)]);
    },
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 25, label: "ATAN2S" });


/* ====================================================================
   TEXPAND / TLIN / TCOLLECT / EXPLN.
   ====================================================================

   Rounds out the HP50 trig-CAS family alongside TAN2SC and the
   HALFTAN / TAN2SC2 / TAN2CS2 / inverse-trig rewrites.

     TEXPAND   — HP50 AUR §3-252.  Expand SIN/COS/TAN of sums via the
                 addition formulae.
     TLIN      — HP50 AUR §3-253.  Linearize products of SIN/COS via
                 product-to-sum identities.
     TCOLLECT  — HP50 AUR §3-250.  Collect SIN±SIN / COS±COS into
                 products (sum-to-product).
     EXPLN     — HP50 AUR §3-75.  Rewrite trig and hyperbolic in terms
                 of real / complex exponentials (e^x, e^(ix)).

   TEXPAND and EXPLN reuse `_trigIdentityWalk` (both dispatch on the
   function name at a `fn` node).  TLIN and TCOLLECT match on `bin`
   nodes instead — a multiplication for TLIN, an addition/subtraction
   for TCOLLECT — so they each carry a small custom walker.  All four
   are shallow-walk: rewrite results are not re-processed (recursion-
   safety invariant).
   ==================================================================== */

/* ---- TEXPAND — addition-formula expansion of SIN / COS / TAN --------
   HP50 AUR §3-252.  Identities applied at each SIN/COS/TAN fn node:

     SIN(a+b) = SIN(a)·COS(b) + COS(a)·SIN(b)
     SIN(a-b) = SIN(a)·COS(b) - COS(a)·SIN(b)
     COS(a+b) = COS(a)·COS(b) - SIN(a)·SIN(b)
     COS(a-b) = COS(a)·COS(b) + SIN(a)·SIN(b)
     TAN(a+b) = (TAN(a) + TAN(b)) / (1 - TAN(a)·TAN(b))
     TAN(a-b) = (TAN(a) - TAN(b)) / (1 + TAN(a)·TAN(b))

   Plus the parity identities for a unary-negated argument:

     SIN(-x) = -SIN(x),  COS(-x) = COS(x),  TAN(-x) = -TAN(x)

   Anything else (a bare variable, a number, a product, a power, etc.)
   is left unchanged so composed AST shapes survive round-trips.  The
   walker is single-pass: nested sums produce one level of expansion
   per invocation (SIN((a+b)+c) first becomes SIN(a+b)·COS(c)+
   COS(a+b)·SIN(c); a second TEXPAND expands the two SIN(a+b) /
   COS(a+b) calls).  Non-Symbolic input throws Bad argument type. */

function _texpandSinArg(arg) {
  if (arg.kind === 'bin' && arg.op === '+') {
    return AstBin('+',
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('COS', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'bin' && arg.op === '-') {
    return AstBin('-',
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('COS', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'neg') {
    // SIN(-x) = -SIN(x)
    return AstNeg(AstFn('SIN', [arg.arg]));
  }
  return null;
}


function _texpandCosArg(arg) {
  if (arg.kind === 'bin' && arg.op === '+') {
    return AstBin('-',
      AstBin('*', AstFn('COS', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'bin' && arg.op === '-') {
    return AstBin('+',
      AstBin('*', AstFn('COS', [arg.l]), AstFn('COS', [arg.r])),
      AstBin('*', AstFn('SIN', [arg.l]), AstFn('SIN', [arg.r])));
  }
  if (arg.kind === 'neg') {
    // COS(-x) = COS(x)
    return AstFn('COS', [arg.arg]);
  }
  return null;
}


function _texpandTanArg(arg) {
  if (arg.kind === 'bin' && (arg.op === '+' || arg.op === '-')) {
    const op  = arg.op;                    // '+' or '-'
    const dop = op === '+' ? '-' : '+';    // denominator uses the dual sign
    const ta = AstFn('TAN', [arg.l]);
    const tb = AstFn('TAN', [arg.r]);
    return AstBin('/',
      AstBin(op,  ta, tb),
      AstBin(dop, AstNum(1), AstBin('*', ta, tb)));
  }
  if (arg.kind === 'neg') {
    // TAN(-x) = -TAN(x)
    return AstNeg(AstFn('TAN', [arg.arg]));
  }
  return null;
}


register('TEXPAND', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN: _texpandSinArg,
    COS: _texpandCosArg,
    TAN: _texpandTanArg,
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 16, label: "TEXPAND" });


/* ---- TLIN — product-to-sum linearization ----------------------------
   HP50 AUR §3-253.  Rewrites products of SIN/COS (and squares of SIN
   or COS) into linear combinations via product-to-sum:

     SIN(a)·SIN(b) = (COS(a-b) - COS(a+b))/2
     COS(a)·COS(b) = (COS(a-b) + COS(a+b))/2
     SIN(a)·COS(b) = (SIN(a+b) + SIN(a-b))/2
     COS(a)·SIN(b) = (SIN(a+b) - SIN(a-b))/2
     SIN(a)²       = (1 - COS(2a))/2
     COS(a)²       = (1 + COS(2a))/2

   Walker matches at `bin('*')` nodes (two fn children), at `bin('^')`
   nodes whose exponent is the literal integer 2 and whose base is a
   SIN/COS fn node, and recurses into all other shapes.  Children are
   linearized first (bottom-up).  Non-SIN/non-COS products are left
   unchanged.  Non-Symbolic input throws Bad argument type. */

function _tlinProductRewrite(l, r) {
  if (l.kind !== 'fn' || r.kind !== 'fn') return null;
  if (l.args.length !== 1 || r.args.length !== 1) return null;
  if ((l.name !== 'SIN' && l.name !== 'COS') ||
      (r.name !== 'SIN' && r.name !== 'COS')) return null;
  const a       = l.args[0];
  const b       = r.args[0];
  const aPlusB  = AstBin('+', a, b);
  const aMinusB = AstBin('-', a, b);
  const two     = AstNum(2);
  if (l.name === 'SIN' && r.name === 'SIN') {
    return AstBin('/',
      AstBin('-', AstFn('COS', [aMinusB]), AstFn('COS', [aPlusB])),
      two);
  }
  if (l.name === 'COS' && r.name === 'COS') {
    return AstBin('/',
      AstBin('+', AstFn('COS', [aMinusB]), AstFn('COS', [aPlusB])),
      two);
  }
  if (l.name === 'SIN' && r.name === 'COS') {
    return AstBin('/',
      AstBin('+', AstFn('SIN', [aPlusB]), AstFn('SIN', [aMinusB])),
      two);
  }
  // COS·SIN
  return AstBin('/',
    AstBin('-', AstFn('SIN', [aPlusB]), AstFn('SIN', [aMinusB])),
    two);
}


function _tlinSquareRewrite(base, exp) {
  if (base.kind !== 'fn' || base.args.length !== 1) return null;
  if (exp.kind !== 'num' || exp.value !== 2) return null;
  if (base.name !== 'SIN' && base.name !== 'COS') return null;
  const a    = base.args[0];
  const twoA = AstBin('*', AstNum(2), a);
  if (base.name === 'SIN') {
    // SIN²(a) = (1 - COS(2a))/2
    return AstBin('/',
      AstBin('-', AstNum(1), AstFn('COS', [twoA])),
      AstNum(2));
  }
  // COS²(a) = (1 + COS(2a))/2
  return AstBin('/',
    AstBin('+', AstNum(1), AstFn('COS', [twoA])),
    AstNum(2));
}


function _tlinWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tlinWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tlinWalk(ast.l);
    const r = _tlinWalk(ast.r);
    if (ast.op === '*') {
      const prod = _tlinProductRewrite(l, r);
      if (prod !== null) return prod;
    }
    if (ast.op === '^') {
      const sq = _tlinSquareRewrite(l, r);
      if (sq !== null) return sq;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tlinWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}


register('TLIN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tlinWalk(v.expr)));
}, { category: 'CAS / symbolic', categoryOrder: 17, label: "TLIN" });


/* ---- TCOLLECT — sum-to-product ---------------------------------------
   HP50 AUR §3-250.  The inverse of TLIN's "product → sum" direction:
   collects matching `SIN(A) ± SIN(B)` / `COS(A) ± COS(B)` pairs into
   product form via the sum-to-product identities:

     SIN(A) + SIN(B) =  2·SIN((A+B)/2)·COS((A-B)/2)
     SIN(A) - SIN(B) =  2·COS((A+B)/2)·SIN((A-B)/2)
     COS(A) + COS(B) =  2·COS((A+B)/2)·COS((A-B)/2)
     COS(A) - COS(B) = -2·SIN((A+B)/2)·SIN((A-B)/2)

   Walker matches at `bin('+' | '-')` nodes whose l and r are fn
   nodes with the same name (both SIN or both COS) and a single arg
   each.  Otherwise children are walked recursively.  The rewrite is
   NOT re-walked (so a fresh TCOLLECT result doesn't get re-collected
   into nested products).  Non-matching bin shapes fall through
   unchanged. */

function _tcollectSumRewrite(op, l, r) {
  if (l.kind !== 'fn' || r.kind !== 'fn') return null;
  if (l.args.length !== 1 || r.args.length !== 1) return null;
  if (l.name !== r.name) return null;
  if (l.name !== 'SIN' && l.name !== 'COS') return null;
  const A    = l.args[0];
  const B    = r.args[0];
  const sum  = AstBin('/', AstBin('+', A, B), AstNum(2));
  const diff = AstBin('/', AstBin('-', A, B), AstNum(2));
  if (l.name === 'SIN' && op === '+') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('SIN', [sum])),
      AstFn('COS', [diff]));
  }
  if (l.name === 'SIN' && op === '-') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('COS', [sum])),
      AstFn('SIN', [diff]));
  }
  if (l.name === 'COS' && op === '+') {
    return AstBin('*',
      AstBin('*', AstNum(2), AstFn('COS', [sum])),
      AstFn('COS', [diff]));
  }
  // COS - COS  → -2·SIN((A+B)/2)·SIN((A-B)/2)
  return AstNeg(AstBin('*',
    AstBin('*', AstNum(2), AstFn('SIN', [sum])),
    AstFn('SIN', [diff])));
}


function _tcollectWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _tcollectWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _tcollectWalk(ast.l);
    const r = _tcollectWalk(ast.r);
    if (ast.op === '+' || ast.op === '-') {
      const rw = _tcollectSumRewrite(ast.op, l, r);
      if (rw !== null) return rw;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_tcollectWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}


register('TCOLLECT', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_tcollectWalk(v.expr)));
}, { category: 'CAS / symbolic', categoryOrder: 18, label: "TCOLLECT" });


/* ---- EXPLN — rewrite trig / hyperbolic as exponentials ---------------
   HP50 AUR §3-75.  Euler-formula substitutions for the six core
   trig/hyperbolic functions, using `Var('i')` for the imaginary unit
   (the project-wide convention — see the FROOTS complex-conjugate
   branch in `algebra.js` §2778 for precedent).

     SIN(x)  → (e^(i·x) - e^(-i·x)) / (2·i)
     COS(x)  → (e^(i·x) + e^(-i·x)) / 2
     TAN(x)  → (e^(i·x) - e^(-i·x)) / (i·(e^(i·x) + e^(-i·x)))
     SINH(x) → (e^x - e^(-x)) / 2
     COSH(x) → (e^x + e^(-x)) / 2
     TANH(x) → (e^x - e^(-x)) / (e^x + e^(-x))

   Shallow-walk on `_trigIdentityWalk`: the `EXP(i·x)` nodes introduced
   for SIN/COS/TAN are NOT re-processed (EXP has no entry in the
   rewrite map).  Non-Symbolic input throws Bad argument type.

   Inverse-trig (ASIN/ACOS/ATAN) and inverse-hyperbolic (ASINH/...)
   rewrites are intentionally deferred — the ACOS2S / ASIN2C / ASIN2T
   / ATAN2S ops already cover the inverse-trig identity surface in a
   non-exponential form; adding log-of-complex forms alongside makes
   the output even less tractable without `_polyNormalize`. */

function _iAst()  { return AstVar('i'); }

function _negIAst() { return AstNeg(AstVar('i')); }


function _explnSinArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  return AstBin('/',
    AstBin('-', AstFn('EXP', [ix]), AstFn('EXP', [mx])),
    AstBin('*', AstNum(2), _iAst()));
}


function _explnCosArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  return AstBin('/',
    AstBin('+', AstFn('EXP', [ix]), AstFn('EXP', [mx])),
    AstNum(2));
}


function _explnTanArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const mx = AstBin('*', _negIAst(), arg);
  const ep = AstFn('EXP', [ix]);
  const em = AstFn('EXP', [mx]);
  return AstBin('/',
    AstBin('-', ep, em),
    AstBin('*', _iAst(), AstBin('+', ep, em)));
}


function _explnSinhArg(arg) {
  return AstBin('/',
    AstBin('-', AstFn('EXP', [arg]), AstFn('EXP', [AstNeg(arg)])),
    AstNum(2));
}


function _explnCoshArg(arg) {
  return AstBin('/',
    AstBin('+', AstFn('EXP', [arg]), AstFn('EXP', [AstNeg(arg)])),
    AstNum(2));
}


function _explnTanhArg(arg) {
  const ep = AstFn('EXP', [arg]);
  const em = AstFn('EXP', [AstNeg(arg)]);
  return AstBin('/',
    AstBin('-', ep, em),
    AstBin('+', ep, em));
}


register('EXPLN', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const out = _trigIdentityWalk(v.expr, {
    SIN:   _explnSinArg,
    COS:   _explnCosArg,
    TAN:   _explnTanArg,
    SINH:  _explnSinhArg,
    COSH:  _explnCoshArg,
    TANH:  _explnTanhArg,
    // Inverse-trig / inverse-hyperbolic extensions.  Hoisted forward
    // refs; definitions appear in the TSIMP / HEAVISIDE / DIRAC block.
    ASIN:  _explnAsinArg,
    ACOS:  _explnAcosArg,
    ATAN:  _explnAtanArg,
    ASINH: _explnAsinhArg,
    ACOSH: _explnAcoshArg,
    ATANH: _explnAtanhArg,
  });
  s.push(Symbolic(out));
}, { category: 'CAS / symbolic', categoryOrder: 12, label: "EXPLN" });


/* ====================================================================
   TSIMP, HEAVISIDE / DIRAC, LAPLACE / ILAP extensions, EXPLN inverse
   family, LNCOLLECT, FROOTS biquadratic.
   ====================================================================

   Three surfaces covered:

     • §11 trig-CAS:  TSIMP — bounded fixed-point Pythagorean-identity
       simplifier, closes the surface modulo `_polyNormalize`.
     • EXPLN:  ASIN / ACOS / ATAN / ASINH / ACOSH / ATANH rewrites to
       LN-of-complex forms, using the same `_trigIdentityWalk`
       substrate (six entries in the rewrite map).
     • LAPLACE / ILAP:  HEAVISIDE and DIRAC as first-class ops, their
       transforms and inverses in the table, plus the frequency-shift
       theorem L{e^(αX)·f(X)} = F(X − α) and its ILAP inverse (pure
       Dirac round-trips).

   Two standalone additions round out the cluster:

     • LNCOLLECT — the logarithm-collection sibling of EXPLN.  Collects
       LN(a) ± LN(b) into LN(a·b) / LN(a/b) and n·LN(a) into LN(a^n).
       Shallow bottom-up walk.
     • FROOTS biquadratic pass — before Durand-Kerner, detect a residual
       `X⁴ + bX² + c` (degree-4 with `coef[1] = coef[3] = 0`), treat it
       as `u² + bu + c` where u = X², find the two u-roots via the
       quadratic-residual machinery, then emit ±√u₁, ±√u₂ as exact
       Symbolic radicals.
   ==================================================================== */

/* ---- HEAVISIDE — unit step, Symbolic carrier ------------------------
   Real/Integer input collapses to 1 (x ≥ 0) or 0 (x < 0), matching the
   HP50 convention where HEAVISIDE(0) = 1 (right-continuous at the
   origin).  Symbolic input is kept symbolic — the LAPLACE / ILAP
   dispatcher recognises `HEAVISIDE(X - a)` as a first-class shape.
   BinaryInteger is accepted the same as Integer. */

function _realStepValue(x) { return x >= 0 ? 1 : 0; }


register('HEAVISIDE', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  if (isReal(v))          { s.push(Real(_realStepValue(v.value.toNumber()))); return; }
  if (isInteger(v))       { s.push(Integer(BigInt(_realStepValue(Number(v.value))))); return; }
  if (isBinaryInteger(v)) { s.push(Integer(BigInt(_realStepValue(Number(v.value))))); return; }
  if (_isSymOperand(v))   { s.push(Symbolic(AstFn('HEAVISIDE', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))), { category: 'CAS / symbolic', categoryOrder: 29, label: "HEAVISIDE" });


/* ---- DIRAC — Dirac impulse, Symbolic carrier ------------------------
   Real/Integer non-zero input collapses to 0.  A literal 0 stays
   Symbolic (the spike at the origin is singular; returning 0 would be
   wrong, returning ∞ would lose the integral — HP50 leaves it
   symbolic).  Symbolic input is kept symbolic so LAPLACE /  ILAP can
   round-trip `DIRAC(X - a)` through the table. */

register('DIRAC', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const [v] = s.popN(1);
  if (isReal(v)) {
    if (v.value.isZero()) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Real(0));
    return;
  }
  if (isInteger(v)) {
    if (v.value === 0n) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Integer(0n));
    return;
  }
  if (isBinaryInteger(v)) {
    if (v.value === 0n) { s.push(Symbolic(AstFn('DIRAC', [AstNum(0)]))); return; }
    s.push(Integer(0n));
    return;
  }
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('DIRAC', [_toAst(v)]))); return; }
  throw new RPLError('Bad argument type');
}))), { category: 'CAS / symbolic', categoryOrder: 30, label: "DIRAC" });


/* ---- TSIMP — trig simplifier (Giac-backed) --------------------------
   HP50 AUR §3-254.  `tsimplify(expr)` runs Giac's Pythagorean-identity
   surface (SIN²+COS²→1, 1−SIN²→COS², TAN·COS→SIN, SIN/COS→TAN, and
   their duals) followed by its own simplify pass.  Non-Symbolic input
   throws Bad argument type. */

register('TSIMP', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const cmd = buildGiacCmd(v.expr, (e) => `tsimplify(${e})`);
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
}, { category: 'CAS / symbolic', categoryOrder: 19, label: "TSIMP" });


/* ---- EXPLN inverse-trig / inverse-hyperbolic rewrite closures ------
   Hoisted — referenced from the `register('EXPLN', …)` map above.  Six
   new branches:

     ASIN(x)  → -i · LN(i·x + √(1 - x²))
     ACOS(x)  → -i · LN(x + i·√(1 - x²))
     ATAN(x)  → -(i/2) · LN((1 + i·x) / (1 - i·x))
     ASINH(x) →  LN(x + √(x² + 1))                 (real)
     ACOSH(x) →  LN(x + √(x² - 1))                 (real)
     ATANH(x) →  (1/2) · LN((1 + x) / (1 - x))     (real)

   The trig identities use the project-wide `Var('i')` convention for
   the imaginary unit (see `_iAst` above).  The hyperbolic identities
   are real-valued and don't reference `i`.

   The walker is still `_trigIdentityWalk`; the new rewrites produce
   `LN` and `SQRT` nodes that are NOT re-processed (no LN / SQRT
   entry in the map).  Branch cuts are a known follow-up — under
   APPROX mode the user may get a different principal value than
   the built-in ASIN / ACOS / ATAN; under EXACT / Symbolic the
   expressions are formally correct. */

function _explnAsinArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', AstNum(1), x2);
  const sqrtTerm = AstFn('SQRT', [radic]);
  const ix = AstBin('*', _iAst(), arg);
  const inner = AstBin('+', ix, sqrtTerm);
  return AstNeg(AstBin('*', _iAst(), AstFn('LN', [inner])));
}


function _explnAcosArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', AstNum(1), x2);
  const sqrtTerm = AstFn('SQRT', [radic]);
  const iSqrt = AstBin('*', _iAst(), sqrtTerm);
  const inner = AstBin('+', arg, iSqrt);
  return AstNeg(AstBin('*', _iAst(), AstFn('LN', [inner])));
}


function _explnAtanArg(arg) {
  const ix = AstBin('*', _iAst(), arg);
  const num = AstBin('+', AstNum(1), ix);
  const den = AstBin('-', AstNum(1), ix);
  const logFrac = AstFn('LN', [AstBin('/', num, den)]);
  const halfI = AstBin('/', _iAst(), AstNum(2));
  return AstNeg(AstBin('*', halfI, logFrac));
}


function _explnAsinhArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('+', x2, AstNum(1));
  const inner = AstBin('+', arg, AstFn('SQRT', [radic]));
  return AstFn('LN', [inner]);
}


function _explnAcoshArg(arg) {
  const x2 = AstBin('^', arg, AstNum(2));
  const radic = AstBin('-', x2, AstNum(1));
  const inner = AstBin('+', arg, AstFn('SQRT', [radic]));
  return AstFn('LN', [inner]);
}


function _explnAtanhArg(arg) {
  const num = AstBin('+', AstNum(1), arg);
  const den = AstBin('-', AstNum(1), arg);
  return AstBin('*',
    AstBin('/', AstNum(1), AstNum(2)),
    AstFn('LN', [AstBin('/', num, den)]));
}


/* ---- LNCOLLECT — collect logarithms ---------------------------------
   HP50 AUR §3-144.  The inverse direction of EXPLN's LN-expansion
   surface: collect LN(a) ± LN(b) into LN(a·b) / LN(a/b), and rewrite
   n · LN(a) as LN(a^n) (where n is a numeric literal).  Shallow
   bottom-up walk at `bin('+' | '-' | '*')` nodes.  Non-matching
   shapes fall through unchanged.

   The rewrite is NOT re-walked (so a fresh LNCOLLECT result isn't
   re-processed into nested LNs).  Non-Symbolic input rejects with
   Bad argument type.

   The coefficient branch matches both `n · LN(a)` and `LN(a) · n`
   — the latter is unusual but valid AST shape.  Non-numeric
   coefficients (like `Y · LN(X)`) don't match — HP50 LNCOLLECT
   collects only numeric powers. */

function _lncollectSumRewrite(op, l, r) {
  // LN(a) ± LN(b) → LN(a·b) or LN(a/b)
  if (!l || l.kind !== 'fn' || l.name !== 'LN' || !l.args || l.args.length !== 1) return null;
  if (!r || r.kind !== 'fn' || r.name !== 'LN' || !r.args || r.args.length !== 1) return null;
  const a = l.args[0];
  const b = r.args[0];
  const combined = op === '+'
    ? AstBin('*', a, b)
    : AstBin('/', a, b);
  return AstFn('LN', [combined]);
}


function _lncollectCoefRewrite(l, r) {
  // n · LN(a) → LN(a^n)  (n must be a Num)
  if (_isNumNode(l) && r && r.kind === 'fn' && r.name === 'LN'
      && r.args && r.args.length === 1) {
    return AstFn('LN', [AstBin('^', r.args[0], l)]);
  }
  if (_isNumNode(r) && l && l.kind === 'fn' && l.name === 'LN'
      && l.args && l.args.length === 1) {
    return AstFn('LN', [AstBin('^', l.args[0], r)]);
  }
  return null;
}


function _lncollectWalk(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') {
    const inner = _lncollectWalk(ast.arg);
    return inner === ast.arg ? ast : AstNeg(inner);
  }
  if (ast.kind === 'bin') {
    const l = _lncollectWalk(ast.l);
    const r = _lncollectWalk(ast.r);
    if (ast.op === '+' || ast.op === '-') {
      const rw = _lncollectSumRewrite(ast.op, l, r);
      if (rw !== null) return rw;
    }
    if (ast.op === '*') {
      const rw = _lncollectCoefRewrite(l, r);
      if (rw !== null) return rw;
    }
    return (l === ast.l && r === ast.r) ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map(_lncollectWalk);
    let dirty = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== ast.args[i]) { dirty = true; break; }
    }
    return dirty ? AstFn(ast.name, args) : ast;
  }
  return ast;
}


register('LNCOLLECT', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  s.push(Symbolic(_lncollectWalk(v.expr)));
}, { category: 'CAS / symbolic', categoryOrder: 13, label: "LNCOLLECT" });


/* ---- PROPFRAC / PARTFRAC / COSSIN -----------------------------------
   Three HP50 ALG / REWRITE menu ops, all thin wrappers over Giac.

     PROPFRAC  (HP50 AUR §3-197)
       Proper-fraction form: rewrite a rational expression as
       `quotient + remainder/divisor` with degree(remainder) < degree(divisor).
       Works on purely numeric rationals too:  43/12  →  3 + 7/12.
       Routed through Giac `propfrac(expr)`.

     PARTFRAC  (HP50 AUR §3-180)
       Partial-fraction decomposition.  Splits a rational expression
       whose denominator factors into distinct linear / quadratic
       pieces into a sum of simpler fractions.
       Routed through Giac `partfrac(expr)`.

     COSSIN    (HP50 AUR §3-64)
       Rewrite trigonometric surface in terms of SIN and COS by
       expanding every TAN(x) as SIN(x)/COS(x).  Giac's
       `tan2sincos(expr)` is the direct analogue.

   Common shape — mirrors EXPAND / SIMPLIFY:
     • Symbolic input routes through Giac.  No-fallback policy: if
       Giac isn't ready or caseval throws, the op throws.
     • Rational input (PROPFRAC only — the other two are pure trig /
       algebra ops that are a no-op on a bare ratio) lifts to
       Symbolic via `_toAst` first, then Giac.
     • Real / Integer / Name are pass-through, matching EXPAND /
       COLLECT / FACTOR leniency so these ops compose against any
       numeric operand without blowing up.
     • Any other type throws `Bad argument type`.
   ------------------------------------------------------------------ */

register('PROPFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `propfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isRational(v)) {
    // Lift the BigInt ratio into a Symbolic Bin('/', Num(n), Num(d))
    // (via `_toAst`) so Giac receives, e.g., `propfrac(43/12)`.  The
    // Giac result `3+7/12` parses back through `giacToAst` into a
    // plain Symbolic sum.
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(_toAst(v), (e) => `propfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 37, label: "PROPFRAC" });


register('PARTFRAC', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `partfrac(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    // A pure number / ratio / bare name has no non-trivial partial-
    // fraction decomposition — pass through untouched.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 36, label: "PARTFRAC" });


register('COSSIN', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `tan2sincos(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 21, label: "COSSIN" });


/* ------------------------------------------------------------------
   LIN     (HP50 AUR §3-131)
   Linearize an expression in exponentials.  Giac's `lin(expr)` collapses
   products / powers of exponentials so that, e.g., `e^X * e^Y → e^(X+Y)`
   and `(e^X)^3 → e^(3*X)`.  Single-arg, mirrors PROPFRAC / PARTFRAC /
   COSSIN: Symbolic routes through Giac; Real / Integer / Rational / Name
   pass through (a bare number / ratio / name has no non-trivial
   linearization).  No-fallback policy.
   ------------------------------------------------------------------ */
register('LIN', (s) => {
  const v = s.pop();
  if (isSymbolic(v)) {
    if (!giac.isReady()) throw new RPLError('CAS not ready');
    const cmd = buildGiacCmd(v.expr, (e) => `lin(${e})`);
    s.push(Symbolic(giacToAst(giac.caseval(cmd))));
    return;
  }
  if (isReal(v) || isInteger(v) || isRational(v) || isName(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'CAS / symbolic', categoryOrder: 35, label: "LIN" });


/* ------------------------------------------------------------------
   LIMIT / lim    (HP50 AUR §3-131, §lim entry)
   Limit of an expression as its variable approaches a value.

     ( expr 'var=val' → limit )      explicit equation form
     ( expr val       → limit )      use current CAS variable VX

   HP50 fidelity:
     • Level 2 must be Symbolic (the expression).
     • Level 1 is either a Symbolic equation `var = val` or a bare
       numeric value (Real / Integer / Rational).  When level 1 is bare,
       the variable defaults to VX (`getCasVx()`).  Per the AUR `lim`
       entry: "If the variable approaching a value is the current CAS
       variable, it is sufficient to give its value alone."
     • The HP50 also accepts `∞` for plus/minus infinity.  The keypad
       glyph and `INFINITY` / `±INFINITY` names map through astToGiac
       to Giac `+infinity` / `-infinity`; a Giac infinity result lands
       as Symbolic `∞`.
   `LIMIT` is the canonical name (HP49 backward-compat); `lim` is
   registered as a thin alias that delegates to LIMIT's fn so any
   future refinement picks up automatically (mirrors XNUM / XQ and
   CHARPOL).
   No-fallback policy: Giac not ready → `CAS not ready`.
   ------------------------------------------------------------------ */
function _limitPointToGiac(pointArg) {
  // Returns { varName, valGiac } or throws RPLError.
  // ∞ / INFINITY names go through astToGiac, which emits Giac ±infinity.
  if (isSymbolic(pointArg)) {
    const ast = pointArg.expr;
    // Equation form: var = val (HP equality is `=`; AST lays it as
    // bin('=' or '==', l, r)).  Either operator is acceptable on
    // input — both render the same on the keypad.
    if (ast && ast.kind === 'bin' && (ast.op === '=' || ast.op === '==')) {
      if (!ast.l || ast.l.kind !== 'var') {
        throw new RPLError('Bad argument value');
      }
      return { varName: ast.l.name, valGiac: astToGiac(ast.r) };
    }
    // Bare Symbolic value (no equation) — use current VX.
    return { varName: getCasVx(), valGiac: astToGiac(ast) };
  }
  if (isInteger(pointArg))  return { varName: getCasVx(), valGiac: pointArg.value.toString() };
  if (isReal(pointArg))     return { varName: getCasVx(), valGiac: pointArg.value.toString() };
  if (isRational(pointArg)) return {
    varName: getCasVx(),
    valGiac: `(${pointArg.n.toString()}/${pointArg.d.toString()})`,
  };
  if (isName(pointArg)) {
    return { varName: getCasVx(), valGiac: astToGiac(AstVar(pointArg.id)) };
  }
  throw new RPLError('Bad argument type');
}


register('LIMIT', (s) => {
  const [exprArg, pointArg] = s.popN(2);
  if (!isSymbolic(exprArg) && !isName(exprArg)) {
    // Numeric expressions still have a well-defined limit (themselves),
    // but the HP50 AUR limits the input to "an expression" — non-Symbolic
    // / non-Name rejects with Bad argument type.  Accepting Name lets
    // `'X' 'X=2' LIMIT → 2` work (the bare variable is the single-leaf
    // Symbolic in disguise).
    throw new RPLError('Bad argument type');
  }
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const exprAst = isName(exprArg) ? AstVar(exprArg.id) : exprArg.expr;
  const { varName, valGiac } = _limitPointToGiac(pointArg);
  const cmd = buildGiacCmd(
    exprAst,
    (e) => `limit(${e},${varName},${valGiac})`,
    [varName],
  );
  const ast = giacToAst(giac.caseval(cmd));
  // Numeric-leaf result (Giac returned e.g. `2`) → push as Real so the
  // caller can do further numeric math without unwrapping a Symbolic.
  if (ast && ast.kind === 'num') { s.push(_astToRplValue(ast)); return; }
  s.push(Symbolic(ast));
}, { category: 'CAS / symbolic', categoryOrder: 34, label: "LIMIT" });


// `lim` — HP50 lowercase alias.  Per AUR p.3-131, LIMIT is the HP49G
// backward-compat name and `lim` is the canonical HP50 form; both behave
// identically.  Thin wrapper so any future refinement of LIMIT lifts
// automatically (mirrors CHARPOL, XNUM/XQ alias pattern).
register('lim', (s) => { OPS.get('LIMIT').fn(s); }, { category: 'CAS / symbolic', categoryOrder: 33, label: "LIM" });
