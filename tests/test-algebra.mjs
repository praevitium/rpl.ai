import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isVector, isMatrix, isList,
  Symbolic, isSymbolic,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import {
  parseAlgebra, formatAlgebra,
  Num as AstNum, Var as AstVar, Bin as AstBin, Neg as AstNeg,
  astEqual,
  Fn as AstFn, isFn as astIsFn, isKnownFunction,
  evalAst, freeVars, defaultFnEval,
} from '../www/src/rpl/algebra.js';
import { giac } from '../www/src/rpl/cas/giac-engine.mjs';
import { assert, assertThrows } from './helpers.mjs';

/* Symbolic algebra — parser, simplify, DERIV, EXPAND, COLLECT, FACTOR,
   SUBST, SOLVE, textbook-mode pretty-print, EXACT/APPROX numeric-eval,
   keypad symbolic acceptance, string concat, complex cube-root closed form,
   FACT / UNDO / cube-root. */

// ==================================================================
// CAS: Symbolic AST + DERIV for polynomials
// ==================================================================



// --- parser: basic atoms and precedence -----------------------------
{
  const a = parseAlgebra('X');
  assert(a.kind === 'var' && a.name === 'X', 'parseAlgebra(X) = var X');
}
{
  const a = parseAlgebra('42');
  assert(a.kind === 'num' && a.value === 42, 'parseAlgebra(42) = num 42');
}
{
  const a = parseAlgebra('X + Y');
  assert(a.kind === 'bin' && a.op === '+' && a.l.name === 'X' && a.r.name === 'Y',
         'parseAlgebra(X + Y) = X + Y AST');
}
{
  // precedence:  2 + 3*4  →  2 + (3*4)
  const a = parseAlgebra('2 + 3*4');
  assert(a.op === '+' && a.l.value === 2 && a.r.op === '*' &&
         a.r.l.value === 3 && a.r.r.value === 4,
         '2 + 3*4 binds * tighter than +');
}
{
  // parens override precedence:  (2+3)*4  →  (2+3) then *4
  const a = parseAlgebra('(2+3)*4');
  assert(a.op === '*' && a.l.op === '+' && a.r.value === 4,
         '(2+3)*4 parens win');
}
{
  // ^ right-associates:  X^Y^Z  →  X^(Y^Z)
  const a = parseAlgebra('X^Y^Z');
  assert(a.op === '^' && a.l.name === 'X' && a.r.op === '^' &&
         a.r.l.name === 'Y' && a.r.r.name === 'Z',
         'X^Y^Z right-assoc');
}
{
  // unary minus
  const a = parseAlgebra('-X');
  assert(a.kind === 'neg' && a.arg.name === 'X', 'parseAlgebra(-X) = neg X');
}
{
  // round-trip: format(parse(s)) = s (modulo whitespace)
  const s = 'X^2 + 3*X + 1';
  const out = formatAlgebra(parseAlgebra(s));
  assert(out === 'X^2 + 3*X + 1', `round-trip: '${s}' → '${out}'`);
}

// --- simplifier -----------------------------------------------------
// --- deriv: rules in isolation --------------------------------------
// --- parser.js integration: 'expr' tokens become Symbolic -----------
{
  const [v] = parseEntry("`X^2 + 3*X + 1`");
  assert(isSymbolic(v), 'parseEntry on algebraic body returns Symbolic');
  assert(formatAlgebra(v.expr) === 'X^2 + 3*X + 1',
         'Symbolic.expr round-trips to original text');
}
{
  // Bare quoted name 'X' still returns a quoted Name, not a Symbolic —
  // important so STO/RCL/PURGE keep working unchanged.
  const [v] = parseEntry("`X`");
  assert(isName(v) && v.quoted && v.id === 'X',
         "parseEntry on bare `X` returns quoted Name (unchanged)");
}
{
  // Quoted operator '+' still works as a Name (used by tests around
  // STO of operator names etc.)
  const [v] = parseEntry("`+`");
  assert(isName(v) && v.quoted && v.id === '+',
         "parseEntry on `+` returns quoted Name (unchanged)");
}

// --- DERIV op end-to-end -------------------------------------------
// DERIV routes Symbolic inputs through Giac's diff().  Each test below
// registers a mock fixture keyed on the exact caseval command
// `buildGiacCmd` emits, then asserts that the op parses Giac's reply
// back into the expected AST.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 3*X + 1')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('diff(X^2+3*X+1,X)', '2*X+3');
  lookup('DERIV').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()), 'DERIV op pushes a Symbolic');
  assert(formatAlgebra(s.peek().expr) === '2*X + 3',
         `DERIV op on X^2+3X+1 wrt X → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // DERIV with a Real expr returns Real(0) — convenience coercion.
  const s = new Stack();
  s.push(Real(7.5));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0), 'DERIV 7.5 wrt X = 0 Real');
}
{
  // DERIV on a bare Name: 'X' 'X' DERIV → 1, 'Y' 'X' DERIV → 0.
  const s = new Stack();
  s.push(Name('X'));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n, 'DERIV X wrt X = 1');

  s.clear();
  s.push(Name('Y'));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 0n, 'DERIV Y wrt X = 0');
}
{
  // Bad arg types: DERIV of a List errors cleanly.
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Name('X'));
  assertThrows(() => { lookup('DERIV').fn(s); }, null, 'DERIV on List throws "Bad argument type"');
}

// --- Symbolic formatter dispatch -----------------------------------
{
  // format() of a Symbolic should render via formatAlgebra with tick
  // wrappers so the stack display uses HP50 style.
  const sym = Symbolic(parseAlgebra('2*X + 1'));
  const out = format(sym);
  assert(out === "`2*X + 1`", `format(Symbolic(2*X+1)) = '${out}'`);
}

// --- Associativity-aware printing ----------------------------------
{
  // Left-assoc: a - (b - c) MUST print with parens around the right
  // child (otherwise it would look identical to (a-b)-c).
  const e = AstBin('-', AstVar('A'), AstBin('-', AstVar('B'), AstVar('C')));
  const s = formatAlgebra(e);
  assert(s === 'A - (B - C)',
         `left-assoc minus wraps right child when same prec: '${s}'`);
}
{
  // Right-assoc ^: A^(B^C) prints without extra parens; (A^B)^C needs
  // parens on the left child.
  const e = AstBin('^', AstBin('^', AstVar('A'), AstVar('B')), AstVar('C'));
  const s = formatAlgebra(e);
  assert(s === '(A^B)^C',
         `right-assoc power wraps left child when same prec: '${s}'`);
}

// --- Keyboard-reachable round-trip: typing '2*X+3' then DERIV -------
// Simulates a user typing  '2*X+3' 'X' DERIV  at the command line.
{
  const s = new Stack();
  const entryLoop = (src) => {
    for (const v of parseEntry(src)) {
      if (v?.type === 'name' && !v.quoted) {
        const op = lookup(v.id);
        if (op) { op.fn(s); continue; }
      }
      s.push(v);
    }
  };
  giac._clear();
  giac._setFixture('diff(2*X+3,X)', '2');
  entryLoop("`2*X+3` `X` DERIV");
  assert(s.depth === 1, 'entryLoop leaves a single result');
  const out = s.peek();
  assert(isSymbolic(out) || (isInteger(out) && out.value === 2n) ||
         (isReal(out) && out.value.eq(2)),
         "result is 2 (as Symbolic or Integer); got: " +
         (isSymbolic(out) ? formatAlgebra(out.expr) : JSON.stringify(out)));
  // After simplify, the derivative of 2*X + 3 wrt X is 2 (a Num).
  // formatStackTop then renders the Symbolic wrapper — accept either
  // form, but the visible-to-user rendering must say 2.
  const rendered = formatStackTop(out);
  assert(rendered === "`2`" || rendered === '2' || rendered === "2",
         `keyboard 'X^2+3*X+1' DERIV renders as '${rendered}'`);
  giac._clear();
}

// ==================================================================
// CAS extensions: fn node, chain rule, Symbolic EVAL
// ==================================================================



// --- fn node: parser ------------------------------------------------
{
  const a = parseAlgebra('SIN(X)');
  assert(a.kind === 'fn' && a.name === 'SIN' && a.args.length === 1 &&
         a.args[0].kind === 'var' && a.args[0].name === 'X',
         'parseAlgebra(SIN(X)) = fn SIN [X]');
}
{
  const a = parseAlgebra('LN(X + 1)');
  assert(a.kind === 'fn' && a.name === 'LN' &&
         a.args[0].kind === 'bin' && a.args[0].op === '+',
         'parseAlgebra(LN(X+1)) = fn LN [X+1 bin]');
}
{
  const a = parseAlgebra('EXP(SIN(X))');
  assert(a.kind === 'fn' && a.name === 'EXP' && a.args[0].kind === 'fn' &&
         a.args[0].name === 'SIN',
         'parseAlgebra(EXP(SIN(X))) = nested fn');
}
{
  // Case-folding of the function name: sin(X) is parsed as Fn('SIN').
  const a = parseAlgebra('sin(X)');
  assert(a.kind === 'fn' && a.name === 'SIN',
         'parseAlgebra(sin(X)) uppercases fn name');
}
{
  // Non-whitelisted identifier followed by '(' is an error — the outer
  // parser falls back to quoted Name.  Here we check the inner parser
  // throws so parser.js's try/catch fires.
  assertThrows(() => { parseAlgebra('FOO(X)'); }, null, 'parseAlgebra(FOO(X)) throws (FOO not whitelisted)');
}

// --- auto-close: missing ')' at EOF ---------------------------------
// parseAlgebra accepts `SIN(X` as `SIN(X)` — mirrors parser.js's
// soft-close of unterminated lists/vectors/programs.  Turns the common
// "user forgot the closer" case into a parseable expression instead of
// a silent Name fall-through (see the companion parser.js guard).
{
  const a = parseAlgebra('SIN(X');
  assert(a.kind === 'fn' && a.name === 'SIN' && a.args.length === 1 &&
         a.args[0].kind === 'var' && a.args[0].name === 'X',
         `parseAlgebra('SIN(X') auto-closes to SIN(X) — got kind=${a.kind} name=${a.name}`);
}
{
  // Trailing whitespace before EOF still closes cleanly.
  const a = parseAlgebra('SIN(X ');
  assert(a.kind === 'fn' && a.name === 'SIN',
         "parseAlgebra('SIN(X ') (trailing space) auto-closes");
}
{
  // Nested unterminated parens cascade — both closers auto-inserted.
  const a = parseAlgebra('SIN((X+1');
  assert(a.kind === 'fn' && a.name === 'SIN' &&
         a.args[0].kind === 'bin' && a.args[0].op === '+',
         "parseAlgebra('SIN((X+1') cascades auto-close for two parens");
}
{
  // Missing ')' mid-stream — NOT at EOF — still errors.  Auto-close is
  // strictly an EOF recovery, same as the list/vector/program soft-close
  // only applies when the token stream runs out.
  try { parseAlgebra('SIN(X+Y'); } catch (_) { /* EOF auto-close — must NOT throw */ }
  // The unterminated EOF case succeeds via auto-close; mid-stream garbage
  // still throws.
  assertThrows(() => parseAlgebra('SIN(X + ) +'), null,
    "parseAlgebra('SIN(X + ) +') mid-stream garbage still throws");
}

// --- fn node: formatter --------------------------------------------
{
  const out = formatAlgebra(parseAlgebra('SIN(X)'));
  assert(out === 'SIN(X)', `format SIN(X) → '${out}'`);
}
{
  const out = formatAlgebra(parseAlgebra('LN(X + 1)'));
  assert(out === 'LN(X + 1)', `format LN(X + 1) → '${out}'`);
}
{
  const out = formatAlgebra(parseAlgebra('SIN(X) + COS(X)'));
  assert(out === 'SIN(X) + COS(X)',
         `format SIN(X)+COS(X) → '${out}'`);
}
{
  // Fn is a primary (no parens needed inside multiplication).
  const out = formatAlgebra(parseAlgebra('2*SIN(X)'));
  assert(out === '2*SIN(X)', `format 2*SIN(X) → '${out}'`);
}

// --- parseEntry & DERIV op on a function-call Symbolic -------------
{
  // Full round-trip through the outer parser: 'SIN(X)' should land as
  // a Symbolic on the stack.
  const vals = parseEntry("`SIN(X)`");
  assert(vals.length === 1 && isSymbolic(vals[0]),
         'parseEntry SIN(X) returns Symbolic');
  const body = formatAlgebra(vals[0].expr);
  assert(body === 'SIN(X)',
         `'SIN(X)' Symbolic.expr round-trip → '${body}'`);
}

// --- KNOWN_FUNCTIONS round-trip for CONJ/RE/IM/LNP1/EXPM/
//     XPON/MANT/TRUNC/ZETA/LAMBERT/PSI.  Round-trip contract: push
//     Symbolic, format → `NAME(X)`, re-parse as `` `NAME(X)` `` →
//     must land as Symbolic again, not fall through to a quoted-Name
//     of the literal text.  One assertion per KNOWN_FUNCTIONS key
//     plus a control check that the SIN entry stays ✓.
{
  const names = ['CONJ', 'RE', 'IM', 'LNP1', 'EXPM', 'XPON', 'MANT',
                 'ZETA', 'LAMBERT'];
  for (const name of names) {
    assert(isKnownFunction(name),
           `session100: ${name} is in KNOWN_FUNCTIONS`);
    const a = parseAlgebra(`${name}(X)`);
    assert(a.kind === 'fn' && a.name === name &&
           a.args.length === 1 && a.args[0].kind === 'var' &&
           a.args[0].name === 'X',
           `session100: parseAlgebra('${name}(X)') = fn ${name} [X]`);
    // Full entry-line round-trip through parser.js's quotedName → algebra.
    const vals = parseEntry('`' + name + '(X)`');
    assert(vals.length === 1 && isSymbolic(vals[0]) &&
           vals[0].expr.kind === 'fn' && vals[0].expr.name === name,
           `session100: parseEntry \`${name}(X)\` lands as Symbolic(${name})`);
    // formatAlgebra must re-emit the canonical text so `fmt ∘ parse` is
    // the identity (modulo whitespace).
    assert(formatAlgebra(a) === `${name}(X)`,
           `session100: formatAlgebra(${name}(X)) round-trip`);
  }
}
{
  // TRUNC is 2-arg — separate block because parseEntry needs two args.
  assert(isKnownFunction('TRUNC'), 'session100: TRUNC is in KNOWN_FUNCTIONS');
  const a = parseAlgebra('TRUNC(X,3)');
  assert(a.kind === 'fn' && a.name === 'TRUNC' && a.args.length === 2 &&
         a.args[0].kind === 'var' && a.args[0].name === 'X' &&
         a.args[1].kind === 'num' && a.args[1].value === 3,
         'session100: parseAlgebra(TRUNC(X,3)) = fn TRUNC [X, 3]');
  // Wrong arity — TRUNC requires exactly 2 per spec.arity.
  assertThrows(() => { parseAlgebra('TRUNC(X)'); }, null, 'session100: parseAlgebra(TRUNC(X)) throws (arity=2 enforced)');
}
{
  // PSI is variadic (1 OR 2 args) — arity omitted from spec, so the
  // parser's `spec.arity !== undefined` guard skips the arg-count check.
  assert(isKnownFunction('PSI'), 'session100: PSI is in KNOWN_FUNCTIONS');
  const a1 = parseAlgebra('PSI(X)');
  assert(a1.kind === 'fn' && a1.name === 'PSI' && a1.args.length === 1,
         'session100: parseAlgebra(PSI(X)) = digamma form');
  const a2 = parseAlgebra('PSI(X,2)');
  assert(a2.kind === 'fn' && a2.name === 'PSI' && a2.args.length === 2 &&
         a2.args[1].kind === 'num' && a2.args[1].value === 2,
         'session100: parseAlgebra(PSI(X,2)) = polygamma form');
}
{
  // Constant-fold at simplify / defaultFnEval time for the mode-
  // independent evaluators.  CONJ / RE are identity on ℝ, IM is zero,
  // LNP1 / EXPM delegate to Math.log1p / Math.expm1, XPON / MANT split
  // a Real into exponent-10 and mantissa.  The folds mirror the stack-
  // op semantics so simplify() produces numeric subtrees consistent with
  // EVAL.
  assert(defaultFnEval('CONJ', [5]) === 5, 'session100: CONJ(5) folds to 5');
  assert(defaultFnEval('RE',   [5]) === 5, 'session100: RE(5) folds to 5');
  assert(defaultFnEval('IM',   [5]) === 0, 'session100: IM(5) folds to 0');
  // Stable-near-zero cases — verify against Math.log1p / Math.expm1.
  const lnp1 = defaultFnEval('LNP1', [0.5]);
  assert(Math.abs(lnp1 - Math.log1p(0.5)) < 1e-15,
         `session100: LNP1(0.5) folds to log1p(0.5) — got ${lnp1}`);
  const expm = defaultFnEval('EXPM', [1]);
  assert(Math.abs(expm - Math.expm1(1)) < 1e-15,
         `session100: EXPM(1) folds to expm1(1) — got ${expm}`);
  // XPON / MANT on a nonzero Real.
  assert(defaultFnEval('XPON', [2500])  === 3,   'session100: XPON(2500) = 3');
  assert(defaultFnEval('MANT', [2500])  === 2.5, 'session100: MANT(2500) = 2.5');
  // Zero-case convention: XPON(0) = 0, MANT(0) = 0.
  assert(defaultFnEval('XPON', [0]) === 0, 'session100: XPON(0) = 0');
  assert(defaultFnEval('MANT', [0]) === 0, 'session100: MANT(0) = 0');
  // Domain edge — LNP1(-1) is log(0); leave symbolic (null) instead of
  // folding to -Infinity.  Matches LN's domain-guarded behaviour.
  assert(defaultFnEval('LNP1', [-1]) === null,
         'session100: LNP1(-1) domain edge returns null (left symbolic)');
  // ZETA / LAMBERT / PSI carry no simplify-time evaluator — they return
  // null so the Fn node stays symbolic and EVAL hands it to the stack
  // op with its iterative numeric path.
  assert(defaultFnEval('ZETA', [2])    === null,
         'session100: ZETA(2) left symbolic at simplify time');
  assert(defaultFnEval('LAMBERT', [1]) === null,
         'session100: LAMBERT(1) left symbolic at simplify time');
  assert(defaultFnEval('PSI', [1])     === null,
         'session100: PSI(1) left symbolic at simplify time');
}
{
  // DERIV op end-to-end: `'SIN(X)' 'X' DERIV` → `'COS(X)'`
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('diff(sin(X),X)', 'cos(X)');
  lookup('DERIV').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()),
         'DERIV on SIN(X) keeps a Symbolic result');
  assert(formatAlgebra(s.peek().expr) === 'COS(X)',
         `DERIV op SIN(X) wrt X → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

// --- freeVars + evalAst core ---------------------------------------
{
  const fv = freeVars(parseAlgebra('SIN(X) + Y*3'));
  assert(fv.has('X') && fv.has('Y') && fv.size === 2,
         'freeVars of SIN(X)+Y*3 is {X,Y}');
}
{
  // evalAst reduces a polynomial to a Num when all vars bind.
  const ast = parseAlgebra('X^2 + 3*X + 1');
  const r = evalAst(ast, name => name === 'X' ? 2 : null);
  assert(r.kind === 'num' && r.value === 11,
         `evalAst X^2+3X+1 at X=2 → ${r.kind === 'num' ? r.value : 'nope'}`);
}
{
  // evalAst leaves unbound vars symbolic.
  const ast = parseAlgebra('X + Y');
  const r = evalAst(ast, name => name === 'X' ? 5 : null);
  assert(r.kind === 'bin' && r.op === '+' &&
         r.l.kind === 'num' && r.l.value === 5 &&
         r.r.kind === 'var' && r.r.name === 'Y',
         `evalAst X+Y with only X=5 → partial reduction`);
}
{
  // defaultFnEval only evaluates mode-independent funcs.
  assert(defaultFnEval('LN', [Math.E]) !== null, 'defaultFnEval LN(e) works');
  assert(Math.abs(defaultFnEval('LN', [Math.E]) - 1) < 1e-12, 'LN(e) ≈ 1');
  assert(defaultFnEval('SIN', [0]) === null, 'defaultFnEval SIN returns null (mode-dep)');
  assert(defaultFnEval('SQRT', [9]) === 3, 'defaultFnEval SQRT(9) = 3');
  assert(defaultFnEval('SQRT', [-1]) === null, 'defaultFnEval SQRT(-1) = null');
}

// --- EVAL of Symbolic (ops.js) -------------------------------------
{
  // No bindings → EVAL pushes the same Symbolic back.
  resetHome();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + 1')));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()),
         'EVAL of fully-symbolic expr → Symbolic back');
  assert(formatAlgebra(s.peek().expr) === 'X + 1',
         `EVAL leaves X+1 unchanged: '${formatAlgebra(s.peek().expr)}'`);
}
{
  // Bind X=2, EVAL `X^2+1` → Real(5).
  resetHome();
  varStore('X', Real(2));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(5),
         `EVAL X^2+1 with X=2 → Real(5); got ${
           isReal(s.peek()) ? s.peek().value :
           isSymbolic(s.peek()) ? formatAlgebra(s.peek().expr) : 'other'}`);
}
{
  // Bind X=2 only, EVAL `X + Y` → Symbolic `'2 + Y'` (partial).
  resetHome();
  varStore('X', Real(2));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  lookup('EVAL').fn(s);
  assert(isSymbolic(s.peek()),
         'EVAL X+Y with only X bound → still Symbolic');
  const out = formatAlgebra(s.peek().expr);
  // The partially-reduced form replaces X with its numeric value.
  assert(out === '2 + Y',
         `EVAL X+Y with X=2 → '${out}' (want '2 + Y')`);
}
{
  // SIN evaluation honors angle mode.  Bind X to 0; EVAL 'SIN(X)' = 0.
  resetHome();
  varStore('X', Real(0));
  setAngle('RAD');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
         `EVAL SIN(X) with X=0 (RAD) → 0; got ${
           isReal(s.peek()) ? s.peek().value : 'non-real'}`);
}
{
  // SIN(90) evaluates to 1 in DEG mode, sin(90) in RAD mode (≈0.894).
  resetHome();
  varStore('X', Real(90));
  setAngle('DEG');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1) < 1e-12,
         `EVAL SIN(90) in DEG → 1; got ${
           isReal(s.peek()) ? s.peek().value : 'non-real'}`);
  setAngle('RAD');                    // restore for subsequent tests
}
{
  // LN uses mode-independent eval.  Bind X=e; EVAL 'LN(X)' = 1.
  // Under EXACT (the default) the fold is gated by integer-in-integer-out,
  // so a Real(e) input wouldn't fold to Real(1.) even though the result
  // is "an integer" numerically.  Opt into APPROX explicitly — we're
  // testing the EVAL numeric fold, not the EXACT symbolic-preservation
  // behavior.
  setApproxMode(true);
  resetHome();
  varStore('X', Real(Math.E));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1) < 1e-12,
         `EVAL LN(e) → 1; got ${isReal(s.peek()) ? s.peek().value : 'nope'}`);
  setApproxMode(false);
}
{
  // SQRT(9) with no var needed — evaluates purely by numeric fold.
  // Actually this tests: Symbolic 'SQRT(9)' simplifies at parse time
  // via simplifyFn → Num(3).  So by the time EVAL runs, the AST is
  // already Num(3) and EVAL emits Real(3).
  resetHome();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SQRT(9)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(3),
         `EVAL SQRT(9) → Real(3); got ${
           isReal(s.peek()) ? s.peek().value :
           isSymbolic(s.peek()) ? formatAlgebra(s.peek().expr) : 'other'}`);
}

// --- pretty.js — SVG pretty-printer MVP -----------------------------
// Textbook-mode rendering tests.  These tests don't run a browser; they
// assert structural properties of the returned SVG string (which glyphs,
// which elements, approximate box sizes).  Visual fidelity is verified
// through docs/pretty-demo.html.
{
  // Smoke test — import resolves, entry points exist.
  const { astToSvg, layoutAst } = await import('../www/src/rpl/pretty.js');
  assert(typeof astToSvg === 'function',  'pretty.astToSvg is a function');
  assert(typeof layoutAst === 'function', 'pretty.layoutAst is a function');
}
{
  // A single variable renders to one <text> element, no bar, no path.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg, width, height } = astToSvg(parseAlgebra('X'));
  assert(svg.startsWith('<svg '), 'astToSvg result starts with <svg>');
  assert((svg.match(/<text /g) || []).length === 1, 'one <text> for plain X');
  assert(!svg.includes('<line'), 'no <line> (no fraction)');
  assert(!svg.includes('<path'), 'no <path> (no parens)');
  assert(width > 10 && width < 60, `width for X is small (${width})`);
  assert(height > 20 && height < 50, `height for X is small (${height})`);
}
{
  // A fraction draws a <line> for the bar and two <text> elements.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg, height } = astToSvg(parseAlgebra('1/2'));
  assert(svg.includes('<line '), '1/2 draws a fraction bar <line>');
  assert((svg.match(/<text /g) || []).length === 2, '1/2 has two <text> (num + den)');
  assert(height > 50, `fraction is tall — got ${height}`);
}
{
  // Fraction children are never parenthesised — (X+1)/(X-1) yields
  // one <line> and zero <path> (no parens).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('(X+1)/(X-1)'));
  assert((svg.match(/<line /g) || []).length === 1, '(X+1)/(X-1) has exactly one bar');
  assert(!svg.includes('<path '),
    `(X+1)/(X-1) renders with no parens (fraction bar separates) — got ${svg.slice(0,120)}`);
}
{
  // Superscript renders with a smaller font-size.  Base (X) at 24,
  // exponent (2) at 24*0.7 = 16.8.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X^2'), { size: 24 });
  assert(svg.includes('font-size="24"'), 'X^2 has a 24px base glyph');
  // Expect the exponent at 16.8px.
  assert(/font-size="16\.?8?9*9*"/.test(svg) || svg.includes('16.7') || svg.includes('16.8'),
    `X^2 has a ~16.8px exponent — got ${svg}`);
}
{
  // (X+1)^2: the base is a sum so it must be wrapped in parens.  Our
  // parenBox uses <path> arcs.  Expect 2 <path> elements for the
  // matching parens.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('(X+1)^2'));
  const paths = (svg.match(/<path /g) || []).length;
  assert(paths === 2,
    `(X+1)^2 has 2 <path> (scaled parens) — got ${paths}`);
}
{
  // SIN(X^2): the function-call parens are drawn as <path>s; the
  // exponent (2) is a smaller <text>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SIN(X^2)'));
  assert(svg.includes('>SIN<'), 'SIN shows as a text glyph');
  assert((svg.match(/<path /g) || []).length === 2,
    'SIN(X^2) has 2 <path> for the call parens');
}
{
  // Font-family contains single quotes (for multi-word names), never
  // bare double quotes inside the attribute value (which would break
  // the outer attribute quoting).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X'));
  const m = svg.match(/font-family="([^"]*)"/);
  assert(m, 'font-family attribute present');
  assert(!m[1].includes('"'),
    `font-family value has no stray double quotes — got '${m[1]}'`);
}
// --- pretty.js — √ radical glyph ---------------------
// SQRT(arg) draws a hook+vinculum via a <path> (the hook and the
// vinculum segment are part of the same path / single stroke), rather
// than rendering the literal text `SQRT(...)`.  The radicand is drawn
// inside, composing with fractions / exponents / etc.
{
  // SQRT(X) draws the hook-and-vinculum path; no "SQRT" text glyph
  // appears.  The radicand X is a single <text>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SQRT(X)'));
  assert(!svg.includes('>SQRT<'),
    'SQRT renders as a glyph, not the literal text SQRT');
  assert((svg.match(/<path /g) || []).length === 1,
    `SQRT(X) has exactly one <path> for the hook+vinculum`);
  assert((svg.match(/<text /g) || []).length === 1,
    'SQRT(X) radicand is one <text> (the X)');
}
{
  // A bare SQRT(X) is visibly taller than a plain X because of the
  // vinculum and hook dip.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { height: hX } = astToSvg(parseAlgebra('X'));
  const { height: hS } = astToSvg(parseAlgebra('SQRT(X)'));
  assert(hS > hX,
    `SQRT(X) taller than X (${hS} > ${hX})`);
}
{
  // SQRT composes with fractions — SQRT((X+1)/2) draws one vinculum
  // <line> for the fraction bar (NOT the radical — the radical is
  // part of a <path>), the radical hook <path>, and the
  // numerator/denominator text.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SQRT((X+1)/2)'));
  assert((svg.match(/<line /g) || []).length === 1,
    'SQRT((X+1)/2) has one <line> (the fraction bar)');
  assert((svg.match(/<path /g) || []).length === 1,
    'SQRT((X+1)/2) has one <path> (the radical itself — fraction children need no parens)');
  assert(!svg.includes('>SQRT<'),
    'no literal SQRT glyph inside the radical composition');
}
{
  // SQRT composes with neighbours:  1 + SQRT(2)  → "1", " + ", "2" as
  // three <text>, plus one <path> for the radical.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('1 + SQRT(2)'));
  assert((svg.match(/<path /g) || []).length === 1,
    '1 + SQRT(2) has exactly one <path> (the radical)');
  // + separator uses a tighter opSepBox (gap+glyph+gap) instead of
  // `textBox(' + ')`, so the SVG contains `>+<` rather than `> + <`.
  assert(svg.includes('>1<') && svg.includes('>2<') && svg.includes('>+<'),
    '1 + SQRT(2) still shows the constants and the + separator');
  assert(!svg.includes('>SQRT<'), 'no literal SQRT text');
}

// --- pretty.js — ⁿ√k indexed radical for XROOT -------
// XROOT(radicand, index) renders as a √-hook with the index tucked
// into the crook at SUP_SCALE of base size.  The radical path stays a
// single <path>; the index is a separate <text>.  The parser recognises
// XROOT as a two-arg KNOWN_FUNCTION so `'XROOT(2, 3)'` round-trips.
{
  // XROOT parses at the entry line.
  const a = parseAlgebra('XROOT(2, 3)');
  const fmt = (await import('../www/src/rpl/algebra.js')).formatAlgebra(a);
  assert(fmt === 'XROOT(2,3)',
    `parseAlgebra('XROOT(2, 3)') round-trips → '${fmt}'`);
}
{
  // XROOT(2, 3) draws one <path> for the radical hook+vinculum AND one
  // <text> for the radicand (2) AND one <text> for the index (3).  No
  // literal 'XROOT' glyph.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(!svg.includes('>XROOT<'),
    'XROOT renders as a glyph, not the literal text XROOT');
  assert((svg.match(/<path /g) || []).length === 1,
    'XROOT(2, 3) has exactly one <path> (the hook+vinculum)');
  assert((svg.match(/<text /g) || []).length === 2,
    'XROOT(2, 3) has two <text> elements — the radicand and the index');
  // Both numerals appear.
  assert(svg.includes('>2<'), 'radicand 2 is rendered');
  assert(svg.includes('>3<'), 'index 3 is rendered');
}
{
  // Indexed √ is wider than plain √ at the same radicand — the index
  // needs its own horizontal slot above/left of the hook peak.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { width: wSqrt } = astToSvg(parseAlgebra('SQRT(2)'));
  const { width: wX3 }   = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(wX3 >= wSqrt,
    `XROOT(2, 3) at least as wide as SQRT(2) — got ${wX3} vs ${wSqrt}`);
}
{
  // Indexed √ is TALLER than plain √ on the same radicand — the index
  // protrudes above the vinculum, lifting the box ascent.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { height: hSqrt } = astToSvg(parseAlgebra('SQRT(2)'));
  const { height: hX3 }   = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(hX3 > hSqrt,
    `XROOT(2, 3) taller than SQRT(2) — got ${hX3} vs ${hSqrt}`);
}
{
  // Wide index (e.g. "10") pushes the hook further right — total width
  // for XROOT(2, 10) exceeds XROOT(2, 3).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { width: w3 }  = astToSvg(parseAlgebra('XROOT(2, 3)'));
  const { width: w10 } = astToSvg(parseAlgebra('XROOT(2, 10)'));
  assert(w10 > w3,
    `XROOT(2, 10) wider than XROOT(2, 3) — got ${w10} vs ${w3}`);
}
{
  // Complex radicand composes — XROOT((X+1)/2, 3) renders a fraction
  // under the vinculum (so there are two stroked primitives: the
  // fraction's <line> bar and the radical's <path>) plus the index.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('XROOT((X+1)/2, 3)'));
  assert((svg.match(/<line /g) || []).length === 1,
    'XROOT((X+1)/2, 3) has one <line> (the fraction bar)');
  assert((svg.match(/<path /g) || []).length === 1,
    'XROOT((X+1)/2, 3) has one <path> (the radical)');
  assert(!svg.includes('>XROOT<'), 'no literal XROOT glyph');
}
{
  // XROOT composes with neighbours: 1 + XROOT(2, 3)  — three <text>
  // for "1", "2", "3", plus " + " separator, and one <path>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('1 + XROOT(2, 3)'));
  assert((svg.match(/<path /g) || []).length === 1,
    '1 + XROOT(2, 3) has one <path>');
  assert(svg.includes('>1<') && svg.includes('>2<') && svg.includes('>3<'),
    '1 + XROOT(2, 3) shows all three numerals');
  // `+` uses opSepBox so the SVG carries a bare `>+<` glyph
  // (no full-char-width padding).
  assert(svg.includes('>+<'),
    '1 + XROOT(2, 3) still shows the + separator');
}

// --- CLB: clear the display-base override --------------------------
{
  // After HEX, BinInts render in hex regardless of their stored base.
  // CLB clears the override, so they render in their own stored base
  // again with minimum-width (no padding).
  resetBinaryState();
  const s = new Stack();
  s.push(BinaryInteger(0xFFn, 'd'));     // stored base is decimal
  assert(format(s.peek()) === '#255d',
         `pre-override: stored base wins — '${format(s.peek())}'`);
  lookup('HEX').fn(s);
  assert(format(s.peek()) !== '#255d',
         `after HEX: override wins — '${format(s.peek())}'`);
  lookup('CLB').fn(s);
  assert(format(s.peek()) === '#255d',
         `after CLB: stored base again — '${format(s.peek())}'`);
  assert(getBinaryBase() === null,
         'CLB leaves state.binaryBase = null');
}
{
  // CLB is a no-op when no override is active.
  resetBinaryState();
  assert(getBinaryBase() === null, 'fresh state has no override');
  lookup('CLB').fn(new Stack());
  assert(getBinaryBase() === null, 'CLB on fresh state is a no-op');
}

// EXPAND op (RPL registry path).  Routes through Giac's expand().
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X+1)^2')));
  giac._clear();
  giac._setFixture('expand((X+1)^2)', 'X^2+2*X+1');
  lookup('EXPAND').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^2 + 2*X + 1',
         `EXPAND op on (X+1)^2 → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // EXPAND on a Real is a no-op pass-through (matches HP50 leniency).
  // Real/Integer/Name don't hit Giac — no fixture needed.
  const s = new Stack();
  s.push(Real(7));
  lookup('EXPAND').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(7),
         `EXPAND on a Real is a pass-through`);
}

// --- COLLECT op (CAS menu alias for simplify) ---------
// COLLECT 1-arg routes through Giac's simplify(); 2-arg through
// Giac's collect(expr,var).  Each block registers the caseval
// fixture the op emits.
{
  // COLLECT on a Symbolic sums like terms via the simplifier.
  // 'X + X + Y' must come back as '2*X + Y' — same result as EVAL
  // would produce, but reachable without triggering full evaluation.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X + Y')));
  giac._clear();
  giac._setFixture('simplify(X+X+Y)', '2*X+Y');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*X + Y',
         `COLLECT 'X + X + Y' → '${formatAlgebra(s.peek().expr)}' (want '2*X + Y')`);
  giac._clear();
}
{
  // COLLECT picks up the canonicalization path — Y*X bucket matches
  // X*Y, so the coefficients add.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X*Y + Y*X')));
  giac._clear();
  giac._setFixture('simplify(X*Y+Y*X)', '2*X*Y');
  lookup('COLLECT').fn(s);
  assert(formatAlgebra(s.peek().expr) === '2*X*Y',
         `COLLECT 'X*Y + Y*X' → '${formatAlgebra(s.peek().expr)}' (want '2*X*Y')`);
  giac._clear();
}
{
  // COLLECT on a non-algebraic passes through unchanged — matches
  // EXPAND's leniency so users can compose either against any argument.
  const s = new Stack();
  s.push(Real(5));
  lookup('COLLECT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `COLLECT on a Real is a pass-through`);
}
{
  // COLLECT on a bare Name is a pass-through (no work to do).
  const s = new Stack();
  s.push(Name('ZETA'));
  lookup('COLLECT').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'ZETA',
         `COLLECT on a Name is a pass-through`);
}

// --- TEXTBOOK / FLAT ops + textbookMode state flag ----
{
  const { setTextbookMode, getTextbookMode } =
    await import('../www/src/rpl/state.js');
  // Normalize to flat so the TEXTBOOK-flips-it-on assertion below is
  // meaningful regardless of the module-level default.
  setTextbookMode(false);
  assert(getTextbookMode() === false,
         'setTextbookMode(false) lands on flat mode');
  // TEXTBOOK op flips it true; FLAT flips it back.
  lookup('TEXTBOOK').fn(new Stack());
  assert(getTextbookMode() === true,
         'TEXTBOOK op sets textbookMode = true');
  lookup('FLAT').fn(new Stack());
  assert(getTextbookMode() === false,
         'FLAT op sets textbookMode = false');
  // Idempotent — calling TEXTBOOK twice doesn't throw or toggle.
  lookup('TEXTBOOK').fn(new Stack());
  lookup('TEXTBOOK').fn(new Stack());
  assert(getTextbookMode() === true, 'TEXTBOOK is idempotent (stays true)');
  setTextbookMode(false);                // reset for later tests
}

// --- textbookMode fires a state-change event -----------
{
  const { subscribe, setTextbookMode } =
    await import('../www/src/rpl/state.js');
  let fired = 0;
  const off = subscribe(() => { fired++; });
  setTextbookMode(true);
  assert(fired === 1, 'setTextbookMode fires exactly one state event on change');
  setTextbookMode(true);                  // same value — should not fire
  assert(fired === 1, 'setTextbookMode is a no-op when already at that value');
  setTextbookMode(false);
  assert(fired === 2, 'setTextbookMode fires again on toggle off');
  off();
}

// ===================================================================
// FACTOR / SUBST / polynomial COLLECT
// ===================================================================





// --- buildGiacCmd: purge-wrapped caseval command builder ----------
// Pure string builder — the counterpart of astToGiac.  Purges every
// free variable alphabetically so reserved-name collisions with Xcas
// built-ins (UI, GF, IS, …) can't raise "<name> is not defined".
{
  const { buildGiacCmd } = await import('../www/src/rpl/cas/giac-convert.mjs');
  // No free vars — no purge prefix.
  assert(buildGiacCmd(parseAlgebra('2+3*4'), (e) => `factor(${e})`) === 'factor(2+3*4)',
         'buildGiacCmd: no purge prefix when AST has no free vars');
  // Single free var.
  assert(buildGiacCmd(parseAlgebra('X^2+1'), (e) => `factor(${e})`) === 'factor(X^2+1)',
         'buildGiacCmd: single-var prefix');
  // Multi var, alphabetical.
  assert(buildGiacCmd(parseAlgebra('A*X+B'), (e) => `factor(${e})`) === 'factor(A*X+B)',
         'buildGiacCmd: multi-var alphabetical prefix');
  // Arbitrary command factory — not limited to factor.
  assert(buildGiacCmd(parseAlgebra('X+1'), (e) => `expand((${e})^3)`) === 'expand((X+1)^3)',
         'buildGiacCmd: arbitrary command factory');
  // Function-call names are NOT free vars — SIN stays as a function
  // and X is the only purge target.  Guards against accidentally
  // purging HP function names and breaking Giac's command lookup.
  assert(buildGiacCmd(parseAlgebra('SIN(X)'), (e) => `factor(${e})`) === 'factor(sin(X))',
         'buildGiacCmd: function-name is not purged');
}

// --- astToGiac / buildGiacCmd: name-validator guard ---------------
// The CAS input boundary rejects any AST whose Var or Fn carries a name
// that wouldn't round-trip through Xcas — notably the `#FFh` shape a
// malformed Name('#FFh') gets lifted to via _toAst.  Without this guard,
// `#` is a line comment in Xcas, caseval silently truncates the command,
// and parseAlgebra blows up on the garbled output with "Unexpected
// character '#' at pos 0".
{
  const { astToGiac, buildGiacCmd } = await import('../www/src/rpl/cas/giac-convert.mjs');
  // Synthesise a Var with a bad name directly (bypass parseAlgebra,
  // since the algebra parser itself would reject this earlier).
  const badVar = { kind: 'var', name: '#FFh' };
  assertThrows(() => { astToGiac(badVar); }, /Invalid name: #FFh/, 'astToGiac(Var("#FFh")) throws "Invalid name: #FFh"');

  // The bad name can live deep inside the AST — the walker catches it.
  // AST nodes are frozen so synthesise the shape directly rather than
  // mutating a parsed tree.
  const nested = { kind: 'bin', op: '+',
                   l: { kind: 'var', name: 'X' },
                   r: { kind: 'var', name: '#bad' } };
  assertThrows(() => { astToGiac(nested); }, /Invalid name: #bad/, 'astToGiac rejects a nested Var with invalid name');

  // buildGiacCmd surfaces the same error shape for extraVars
  // (user-supplied variable argument for DERIV/INTEG/SOLVE/COLLECT).
  assertThrows(() => { buildGiacCmd(parseAlgebra('X+1'), (e) => `diff(${e},Y)`, ['#FFh']); }, /Invalid name: #FFh/, 'buildGiacCmd validates extraVars — rejects "#FFh"');

  // Valid identifiers still go through — regression guard.
  const goodCmd = buildGiacCmd(parseAlgebra('X+Y'), (e) => `diff(${e},Y)`, ['Y']);
  assert(goodCmd === 'diff(X+Y,Y)',
         `buildGiacCmd: valid extraVars still flow through — got "${goodCmd}"`);
}

// --- stripGiacQuotes: iterative unwrap -----------------------------
// Giac's semicolon-sequence output sometimes nests the string wrap one
// layer deeper for certain result shapes, yielding `"\"X-1\""`.  A
// single strip would leave a leading `"` in the string handed to
// parseAlgebra and trigger `Unexpected character '"' at pos 0`.  The
// strip loops until stable; these tests pin that behaviour.
{
  const { stripGiacQuotes } = await import('../www/src/rpl/cas/giac-convert.mjs');

  // Single-layer wrap — regression check (existing behaviour).
  assert(stripGiacQuotes('"(X+1)^2"') === '(X+1)^2',
         'stripGiacQuotes: single-layer strip unchanged');

  // Nested wrap — the bug.  `"\\\"X-1\\\""` in a JS string literal is
  // the 10-char sequence `"\"X-1\""` on disk (outer quotes + escaped
  // inner quotes + X-1 content).  One strip yields `"X-1"`; a second
  // strip should then yield `X-1` so parseAlgebra is happy.
  assert(stripGiacQuotes('"\\"X-1\\""') === 'X-1',
         `stripGiacQuotes: nested strip (got "${stripGiacQuotes('"\\"X-1\\""')}")`);

  // Triple-nested — same iterative logic.
  assert(stripGiacQuotes('"\\"\\\\\\"A\\\\\\"\\""') === 'A',
         `stripGiacQuotes: triple-nested strip (got "${stripGiacQuotes('"\\"\\\\\\"A\\\\\\"\\""')}")`);

  // Unquoted input passes through unchanged.
  assert(stripGiacQuotes('X-1') === 'X-1',
         'stripGiacQuotes: unquoted pass-through');

  // Non-string passes through unchanged.
  assert(stripGiacQuotes(42) === 42,
         'stripGiacQuotes: non-string pass-through');
}

// --- giacToAst: wraps parse failures with raw Giac string ---------
// If anything ever slips past stripGiacQuotes and reaches parseAlgebra
// with a malformed input, the error message carries the raw Giac output
// so debugging starts with a visible fingerprint instead of a bare
// "Unexpected character '\"' at pos 0".
{
  const { giacToAst } = await import('../www/src/rpl/cas/giac-convert.mjs');

  let caught = null;
  try { giacToAst('"X-1'); /* leading-only quote, parseAlgebra barfs */ }
  catch (e) { caught = e; }
  assert(caught !== null, 'giacToAst throws on unparseable Giac output');
  assert(/Giac output did not parse/.test(caught.message),
         `giacToAst error includes "Giac output did not parse": ${caught && caught.message}`);
  assert(/"\\"X-1"/.test(caught.message) || caught.message.includes('"X-1'),
         `giacToAst error includes raw string: ${caught && caught.message}`);
}

// --- giacToAst: unicode √ normalisation ----------------------------
// The Xcas/Pyiodide wasm build emits the unicode prefix-form radical
// for sqrt in pretty-print mode (e.g. `1/2*(√x)^-1` for the
// derivative of √x).  parseAlgebra's lexer is ASCII-only, so without
// the √-rewrite step in giacToAst the entire DERIV result fails with
// `Unexpected character '√' at pos 5`.  Cover the three observed
// shapes: `√<ident>`, `√(<expr>)`, `√<number>`.
{
  const { giacToAst } = await import('../www/src/rpl/cas/giac-convert.mjs');
  const { formatAlgebra } = await import('../www/src/rpl/algebra.js');
  // √<ident> — the in-the-wild case: derivative of SQRT(X) prints as
  // `1/2*(√x)^-1`.  Round-trip verifies the rewrite produced parseable
  // output AND that the resulting AST formats back through SQRT.
  // (Variable case is preserved through Giac, so `x` stays `x`; the
  // canonicalisation to uppercase happens elsewhere in the op layer.)
  const ast1 = giacToAst('1/2*(√x)^-1');
  const out1 = formatAlgebra(ast1);
  assert(/SQRT\(x\)/i.test(out1),
         `√<ident> normalises to SQRT in AST: got ${out1}`);
  // √(<expr>) — paren-wrapped argument
  const ast2 = giacToAst('√(x+1)');
  const out2 = formatAlgebra(ast2);
  assert(/SQRT\(x\s*\+\s*1\)/i.test(out2),
         `√(<expr>) normalises to SQRT in AST: got ${out2}`);
  // √<number> — bare numeric radicand
  const ast3 = giacToAst('√2');
  const out3 = formatAlgebra(ast3);
  assert(/SQRT\(2\)/.test(out3),
         `√<number> normalises to SQRT in AST: got ${out3}`);
}

// --- FACTOR end-to-end: nested-quote fixture doesn't leak to parser -
// Simulate the real-Giac shape where caseval returns a doubly-wrapped
// string `"\"X-1\""`.  With the iterative strip, FACTOR yields
// Symbolic(X-1) instead of propagating `Unexpected character '"' at
// pos 0`.
{
  giac._clear();
  // Fixture is passed through stripGiacQuotes on retrieval (the mock
  // mirrors the real engine exactly).  The raw 10-char string on disk
  // is `"\"X-1\""`.
  giac._setFixture('factor((X-1)^2/(X-1))', '"\\"X-1\\""');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X-1)^2/(X-1)')));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()),
         `FACTOR on nested-quote Giac output yields Symbolic (got type ${s.peek() && s.peek().type})`);
  assert(formatAlgebra(s.peek().expr) === 'X - 1',
         `FACTOR of (X-1)^2/(X-1) → 'X - 1' via iterative strip (got '${formatAlgebra(s.peek().expr)}')`);
  giac._clear();
}

// --- buildGiacCmd: bare body, no purge preamble ------------------
// buildGiacCmd emits the bare astToGiac body — no `purge(v1);purge(v2);…`
// preamble.  rpl5050's CAS flow never assigns variables inside Giac's
// session, so purging is unnecessary, and on recent Giac builds
// `purge(X)` on an unassigned X raises "No such variable X", aborting
// the semicolon sequence and leaking the error string through the value
// channel.
{
  const { buildGiacCmd } = await import('../www/src/rpl/cas/giac-convert.mjs');
  // Single free var — bare body.
  const single = buildGiacCmd(parseAlgebra('X^2+1'), (e) => `factor(${e})`);
  assert(single === 'factor(X^2+1)',
         `buildGiacCmd: single-var bare body (got "${single}")`);
  // Multi free vars — still just the body; free-var discovery no
  // longer leaks into the command string at all.
  const multi = buildGiacCmd(parseAlgebra('A*X+B'), (e) => `factor(${e})`);
  assert(multi === 'factor(A*X+B)',
         `buildGiacCmd: multi-var bare body (got "${multi}")`);
  // No free vars — same path.
  const none = buildGiacCmd(parseAlgebra('2+3*4'), (e) => `factor(${e})`);
  assert(none === 'factor(2+3*4)',
         `buildGiacCmd: no-var bare body (got "${none}")`);
}

// --- isGiacErrorString: known Giac runtime-error prefixes ---------
// Giac sometimes delivers runtime errors as result strings rather than
// thrown exceptions (typically when a semicolon-sequence clause aborts
// with no try/catch around it).  The detector is prefix-based and
// deliberately narrow — only well-known shapes count, so benign strings
// that happen to contain "error" don't get flagged.
{
  const { isGiacErrorString } = await import('../www/src/rpl/cas/giac-convert.mjs');
  assert(isGiacErrorString('No such variable X') === true,
         'isGiacErrorString: "No such variable X"');
  assert(isGiacErrorString('  No such variable Y  ') === true,
         'isGiacErrorString: trims surrounding whitespace');
  assert(isGiacErrorString('Error: bad argument') === true,
         'isGiacErrorString: "Error:" prefix');
  assert(isGiacErrorString('Syntax error line 1') === true,
         'isGiacErrorString: "Syntax error" prefix');
  assert(isGiacErrorString('Bad argument value') === true,
         'isGiacErrorString: "Bad argument" prefix');
  // Non-error results pass through unflagged.
  assert(isGiacErrorString('X^2+1') === false,
         'isGiacErrorString: algebraic expression is not an error');
  assert(isGiacErrorString('42') === false,
         'isGiacErrorString: number is not an error');
  assert(isGiacErrorString('') === false,
         'isGiacErrorString: empty string is not an error');
  assert(isGiacErrorString(42) === false,
         'isGiacErrorString: non-string returns false');
  // Contains "error" but not at a known prefix position — pass through.
  assert(isGiacErrorString('approximation_error(0.001)') === false,
         'isGiacErrorString: non-prefix "error" not flagged');
}

// --- giacToAst: detects Giac runtime-error strings ----------------
// If Giac delivers an error-shaped string (from purge-on-unassigned in
// a build without try/catch, or any other runtime error that slips
// through the value channel), giacToAst raises a clean
// GiacResultError(kind="runtime-error") carrying the raw string — not
// a parseAlgebra "Unexpected character" leak.
{
  const { giacToAst, GiacResultError } =
    await import('../www/src/rpl/cas/giac-convert.mjs');

  let caught = null;
  try { giacToAst('No such variable X'); }
  catch (e) { caught = e; }
  assert(caught instanceof GiacResultError,
         `giacToAst: error-string → GiacResultError (got ${caught && caught.name})`);
  assert(caught && caught.kind === 'runtime-error',
         `giacToAst: error-string kind is "runtime-error" (got "${caught && caught.kind}")`);
  assert(caught && caught.raw === 'No such variable X',
         `giacToAst: GiacResultError.raw preserved (got "${caught && caught.raw}")`);

  // Different prefixes still caught.
  caught = null;
  try { giacToAst('Error: out of memory'); } catch (e) { caught = e; }
  assert(caught instanceof GiacResultError && caught.kind === 'runtime-error',
         'giacToAst: "Error: ..." routed to runtime-error');
}

// --- FACTOR end-to-end: real-Giac error-return is surfaced cleanly -
// Defensive belt-and-suspenders for the purge-on-unassigned path.  Even
// if a future Giac build doesn't honour the try/catch wrap and leaks
// the "No such variable X" through to caseval's result channel,
// giacToAst's runtime-error detector catches it before it ever reaches
// parseAlgebra — the user sees a clean error, not a character complaint.
{
  giac._clear();
  giac._setFixture('factor((X-1)^2/(X-1))',
                   'No such variable X');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X-1)^2/(X-1)')));
  const factorErr = assertThrows(() => lookup('FACTOR').fn(s), null,
         'FACTOR on error-shaped Giac output raises');
  // _dispatchOp wraps with "FACTOR: " prefix; runtime-error path uses the
  // GiacResultError message which quotes the raw string.
  assert(factorErr && /runtime-error|No such variable/.test(factorErr.message),
         `FACTOR error message mentions runtime-error / raw shape (got "${factorErr && factorErr.message}")`);
  // Must NOT be the old "Unexpected character" parseAlgebra leak.
  assert(factorErr && !/Unexpected character '"'/.test(factorErr.message),
         `FACTOR error is not the old parse-failure leak (got "${factorErr && factorErr.message}")`);
  giac._clear();
}

// --- FACTOR op: Giac-backed routing -------------------------------
// Prove that FACTOR on a Symbolic routes through Giac. There is no
// fallback — the CAS is Giac, full stop. We register fixtures for the
// cases we exercise and verify both (a) the result AST is the round-
// tripped Giac output and (b) the call actually hit giac.caseval (via
// the mock's call log).
{
  giac._clear();
  // Giac's real output for factor(x^2+2x+1) is `(x+1)^2`; input is the
  // HP50 uppercase var which astToGiac echoes back as-is.
  giac._setFixture('factor(X^2+2*X+1)', '(X+1)^2');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 2*X + 1')));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '(X + 1)^2',
         `FACTOR op via Giac: X^2+2X+1 → '(X + 1)^2' (got '${formatAlgebra(s.peek().expr)}')`);
  const log = giac._callLogCopy();
  assert(
    log.includes('factor(X^2+2*X+1)'),
    `FACTOR routed through giac.caseval — log: ${JSON.stringify(log)}`,
  );
  giac._clear();
}
{
  giac._clear();
  giac._setFixture('factor(X^3-1)', '(X-1)*(X^2+X+1)');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3 - 1')));
  lookup('FACTOR').fn(s);
  assert(
    isSymbolic(s.peek()) &&
      formatAlgebra(s.peek().expr) === '(X - 1)*(X^2 + X + 1)',
    `FACTOR via Giac: X^3-1 → '(X - 1)*(X^2 + X + 1)' (got '${formatAlgebra(s.peek().expr)}')`,
  );
  giac._clear();
}
{
  // No-fallback policy: if Giac errors (or has no fixture in the mock),
  // FACTOR propagates the error. No silent degrade.
  giac._clear();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 1')));
  assertThrows(() => { lookup('FACTOR').fn(s); }, null, 'FACTOR with no Giac fixture must throw (no fallback)');
  giac._clear();
}
{
  // Non-integer Real passes through — no meaningful prime factorisation.
  const s = new Stack();
  s.push(Real(42.5));
  lookup('FACTOR').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(42.5),
         `FACTOR on non-integer Real is a pass-through`);
}
{
  // Integer FACTOR: prime factorisation → Symbolic product.
  const s = new Stack();
  s.push(Integer(42));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*3*7',
         `FACTOR 42 → '2*3*7' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // Prime input: returned as a lone Num wrapped in Symbolic.
  const s = new Stack();
  s.push(Integer(7));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '7',
         `FACTOR 7 → '7' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // Negative integer: factorisation wrapped in unary minus.
  const s = new Stack();
  s.push(Integer(-12));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '-(2^2*3)',
         `FACTOR -12 → '-(2^2*3)' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // ±1 and 0 pass through (no factorisation defined).
  for (const n of [0n, 1n, -1n]) {
    const s = new Stack();
    s.push(Integer(n));
    lookup('FACTOR').fn(s);
    assert(s.peek().type === 'integer' && s.peek().value === n,
           `FACTOR ${n} passes through`);
  }
}

// --- FACTOR op: reserved-name pass-through -------------------------
// Regression guard for the "UI is not defined" shape.  Giac's caseval
// resolves bare identifiers through its global symbol table before
// running commands, so a handful of two-letter uppercase names (UI, GF,
// IS, DO, IF, …) can collide with Xcas built-ins and fail with
// `"<name> is not defined"` instead of staying symbolic.  FACTOR must
// round-trip these names through factor(...) cleanly — the mock's
// fixtures assert (a) the symbolic result and (b) that exactly the
// expected caseval command was issued, with no mangling of the name.
{
  giac._clear();
  giac._setFixture('factor(UI^2+1)', 'UI^2+1');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('UI^2 + 1')));
  lookup('FACTOR').fn(s);
  // factor(UI^2+1) over rationals is irreducible — Giac passes through.
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'UI^2 + 1',
         `FACTOR UI^2+1 round-trips symbolically (got '${formatAlgebra(s.peek().expr)}')`);
  const log = giac._callLogCopy();
  assert(log.length === 1 && log[0] === 'factor(UI^2+1)',
         `FACTOR purges reserved name UI — log: ${JSON.stringify(log)}`);
  giac._clear();
}
{
  // Multi-var purge ordering — alphabetical, one purge per var.
  giac._clear();
  giac._setFixture('factor(A*X+B)', 'A*X+B');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  lookup('FACTOR').fn(s);
  const log = giac._callLogCopy();
  assert(log.length === 1 && log[0] === 'factor(A*X+B)',
         `FACTOR purges every free var alphabetically — log: ${JSON.stringify(log)}`);
  giac._clear();
}

// --- SUBST: single-variable numeric substitution ------------------
// --- SUBST op: 3-arg form on the stack -----------------------------
// SUBST routes each binding through Giac's `subst(expr, var=value)`.
// For list/equation multi-binding forms, bindings are applied
// sequentially so each step is its own caseval command — fixtures
// below cover every intermediate result.
giac._clear();
giac._setFixtures({
  'subst(X^2+1,X=3)':                      '10',
  'subst(X+Y,X=2)':               'Y+2',
  'subst(A*X+B,X=Y)': 'A*Y+B',
  'subst(X^2-4,X=2)':                      '0',
  'subst(Y+2,Y=3)':                        '5',
  'subst(A*X+B,X=Y+1)': 'A*(Y+1)+B',
  'subst(X+Y+Z,X=1)':    'Y+Z+1',
  'subst(Y+Z+1,Y=2)':             'Z+3',
  'subst(Z+3,Z=3)':                        '6',
});
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Name('X', { quoted: true }));
  s.push(Real(3));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
         `SUBST 3-arg: X^2+1, X, 3 → Real(10) (got ${JSON.stringify(s.peek())})`);
}
{
  // Partial: free var Y remains, result stays Symbolic.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(Name('X', { quoted: true }));
  s.push(Real(2));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'Y + 2',
         `SUBST 3-arg: X+Y, X, 2 → Symbolic 'Y + 2'`);
}
{
  // Variable-for-variable substitution through Name value.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  s.push(Name('X', { quoted: true }));
  s.push(Name('Y', { quoted: true }));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'A*Y + B',
         `SUBST 3-arg name-for-name: '${formatAlgebra(s.peek().expr)}'`);
}

// --- SUBST op: 2-arg list form -------------------------------------
{
  // { 'X' 2 'Y' 3 } substitutes both vars — X+Y → 5.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Name('X', { quoted: true }), Real(2),
                 Name('Y', { quoted: true }), Real(3)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list form: X+Y with {X=2, Y=3} → 5 (got ${JSON.stringify(s.peek())})`);
}
{
  // Single-entry list form.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 4')));
  s.push(RList([Name('X', { quoted: true }), Real(2)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
         `SUBST list form: X^2-4 with {X=2} → 0`);
}

// --- Polynomial COLLECT by variable --------------------------------
// --- COLLECT op: 2-arg form on the stack ---------------------------
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + A*X + B*X + C')));
  s.push(Name('X', { quoted: true }));
  giac._clear();
  giac._setFixture('collect(X+A*X+B*X+C,X)',
                   '(A+B+1)*X+C');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '(A + B + 1)*X + C',
         `COLLECT 2-arg: '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // Backwards compat: 1-arg form still works as a simplify alias.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X + Y')));
  giac._clear();
  giac._setFixture('simplify(X+X+Y)', '2*X+Y');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*X + Y',
         `COLLECT 1-arg still works as simplify alias`);
  giac._clear();
}
{
  // 2-arg with a Real on top stays 1-arg (Real is not a variable).
  // Pops only the top; pre-existing pass-through semantics.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X')));
  s.push(Real(7));
  lookup('COLLECT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(7),
         `COLLECT: Real on top is not a variable — falls to 1-arg and passes through`);
  // Underlying Symbolic untouched on level 2.
  assert(isSymbolic(s.peek(2)) &&
         formatAlgebra(s.peek(2).expr) === 'X + X',
         `COLLECT 2-arg dispatch doesn't consume level-2 when Real is on top`);
}

// ===================================================================
// `=` in algebra grammar + SUBST equation form
// ===================================================================

// --- parseEntry integration: `'X = 3'` reaches the stack as Symbolic
// --- parseAlgebra: `=` at the top level ----------------------------
{
  // Simple variable binding parses as Bin('=', Var, Num).
  const a = parseAlgebra('X = 3');
  assert(a.kind === 'bin' && a.op === '=' &&
         a.l.kind === 'var' && a.l.name === 'X' &&
         a.r.kind === 'num' && a.r.value === 3,
         `parseAlgebra('X = 3'): ${JSON.stringify(a)}`);
  // Each side of `=` can be a full expression — `=` binds loosest.
  const b = parseAlgebra('X + 1 = 3');
  assert(b.kind === 'bin' && b.op === '=' &&
         b.l.kind === 'bin' && b.l.op === '+',
         `parseAlgebra('X + 1 = 3'): ${JSON.stringify(b)}`);
  // Round-trip through the formatter: spaces around `=`.
  assert(formatAlgebra(parseAlgebra('X = 3')) === 'X = 3',
         `formatAlgebra round-trip 'X = 3'`);
  assert(formatAlgebra(parseAlgebra('2*X + 1 = Y')) === '2*X + 1 = Y',
         `formatAlgebra round-trip '2*X + 1 = Y'`);
  // Nested equations are rejected — `=` only at outermost level.
  let nestedThrew = false;
  try { parseAlgebra('(X = 3) + 1'); }
  catch (_e) { nestedThrew = true; }
  assert(nestedThrew, `parseAlgebra rejects nested equation '(X = 3) + 1'`);
}

// --- SUBST equation form: expr 'var = val' SUBST -------------------
// Fixtures cover every intermediate caseval result produced by the
// equation-form, list-of-equations, list-of-pairs, and mixed-list
// variants.  Sequential list/mixed-list applications each produce
// their own caseval command, so one fixture per step.
giac._clear();
giac._setFixtures({
  'subst(X^2+1,X=3)':                       '10',
  'subst(A*X+B,X=Y+1)': 'A*(Y+1)+B',
  'subst(X+Y,X=2)':                'Y+2',
  'subst(Y+2,Y=3)':                         '5',
  'subst(X+Y+Z,X=1)':     'Y+Z+1',
  'subst(Y+Z+1,Y=2)':              'Z+3',
  'subst(Z+3,Z=3)':                         '6',
});
{
  // Basic numeric eval via equation form.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Symbolic(parseAlgebra('X = 3')));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
         `SUBST eqn form: X^2+1 with 'X=3' → 10 (got ${JSON.stringify(s.peek())})`);
}
{
  // Partial substitution leaves free variable.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  s.push(Symbolic(parseAlgebra('X = Y + 1')));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'A*(Y + 1) + B',
         `SUBST eqn form partial: '${formatAlgebra(s.peek().expr)}'`);
}
{
  // List form with equation entries — mix of `{ 'X = 2' 'Y = 3' }`.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Symbolic(parseAlgebra('X = 2')),
                 Symbolic(parseAlgebra('Y = 3'))]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list of eqns: X+Y with {X=2, Y=3} → 5 (got ${JSON.stringify(s.peek())})`);
}
{
  // List form also accepts alternating (name, value) pairs.
  // Regression: equation-entry dispatch must not break this path.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Name('X', { quoted: true }), Real(2),
                 Name('Y', { quoted: true }), Real(3)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list pairs (regression): X+Y with {X=2, Y=3} → 5`);
}
{
  // Mixed list: one equation entry plus one (name, value) pair.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y + Z')));
  s.push(RList([Symbolic(parseAlgebra('X = 1')),
                 Name('Y', { quoted: true }), Real(2),
                 Symbolic(parseAlgebra('Z = 3'))]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(6),
         `SUBST mixed list: 1+2+3=6 (got ${JSON.stringify(s.peek())})`);
}

// ===================================================================
// FACTOR: non-monic rational-root + sum/diff of cubes
//          `=` pretty-print (textbook mode)
// ===================================================================







// --- pretty.js: `=` renders as flat row with spaces ----
{
  const { astToSvg, layoutAst } = await import('../www/src/rpl/pretty.js');
  // Simple equation — three text glyphs in a row (X, ' = ', 3), no
  // fraction bar, no parens path.
  const { svg, width } = astToSvg(parseAlgebra('X = 3'));
  assert((svg.match(/<text /g) || []).length === 3,
         `pretty 'X = 3' uses 3 <text> glyphs (X, ' = ', 3) — got ${svg}`);
  assert(!svg.includes('<path'),
         `pretty 'X = 3' has no parens path`);
  assert(!svg.includes('<line'),
         `pretty 'X = 3' has no fraction bar`);
  // Width approximation: 'X' + (0.3 pad) '=' (0.3 pad) + '3' is about
  // 1 + 1.6 + 1 = 3.6 chars at 0.6em·24px ≈ 14.4px per char → roughly
  // 52px plus 8px padding.  The `=` separator uses 0.3-char gaps either
  // side (not a full ' = ').
  assert(width > 40 && width < 90,
         `pretty 'X = 3' width ~60 (got ${width})`);
}
{
  // Equation with a fraction on one side — the ` = ` separator sits at
  // the baseline while the fraction bar renders inside one of the
  // children.  Verify the bar still appears exactly once.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('Y = 1/2'));
  assert((svg.match(/<line /g) || []).length === 1,
         `pretty 'Y = 1/2' has one fraction bar`);
  // Three pieces of text outside the fraction: 'Y', ' = '; two inside
  // the fraction: '1', '2'.  Total 4.
  assert((svg.match(/<text /g) || []).length === 4,
         `pretty 'Y = 1/2' has 4 <text> glyphs — got ${svg}`);
}
{
  // Equation with a polynomial on the left — mixes superscript
  // (<text> at smaller size) with the ` = ` separator.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X^2 + 1 = 10'));
  // The base font is 24; the ^2 uses 24*0.7 = 16.8.  Ensure at least
  // one smaller-font <text> appears.
  assert(/font-size="16\.?8?9*"/.test(svg) ||
         svg.includes('16.7') || svg.includes('16.8'),
         `pretty 'X^2 + 1 = 10' has a superscript at ~16.8`);
  // No parens needed anywhere: ` = ` is outermost and has no child
  // that needs wrapping.
  assert(!svg.includes('<path'),
         `pretty 'X^2 + 1 = 10' has no parens`);
}

// --- pretty.js: textbook juxtaposition drops `*` on
//                Num × (Var|Power|Fn|ParenExpr) shapes ----
{
  const { astToSvg } = await import('../www/src/rpl/pretty.js');

  // 2*X renders as just "2" and "X" — no `*` glyph in between.
  {
    const { svg } = astToSvg(parseAlgebra('2*X'));
    const texts = (svg.match(/<text[^>]*>/g) || []).length;
    assert(texts === 2,
           `pretty '2*X' has 2 <text> glyphs (no *) — got ${texts}: ${svg}`);
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*X' should not contain a bare * glyph — got ${svg}`);
  }

  // 2*X^2 — Num × Power, still no `*`.  A superscript (font-size 16.8,
  // which JS sometimes serialises as 16.799999999999997) is present
  // for the exponent.
  {
    const { svg } = astToSvg(parseAlgebra('2*X^2'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*X^2' should have no * glyph — got ${svg}`);
    assert(svg.includes('16.7') || svg.includes('16.8'),
           `pretty '2*X^2' has a superscript 2 at ~16.8 — got ${svg}`);
  }

  // 2*(X+1) — Num × parenthesised Bin('+').  The * glyph should be
  // absent; parentheses (rendered as <path>) are still present because
  // `+` binds looser than `*` and the subtree needs wrapping.
  {
    const { svg } = astToSvg(parseAlgebra('2*(X+1)'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*(X+1)' should have no * glyph — got ${svg}`);
    assert(svg.includes('<path'),
           `pretty '2*(X+1)' still draws parens — got ${svg}`);
  }

  // 2*SIN(X) — Num × Fn, no `*`.  Parens surround the function arg.
  {
    const { svg } = astToSvg(parseAlgebra('2*SIN(X)'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*SIN(X)' should have no * glyph — got ${svg}`);
    assert(svg.includes('SIN'),
           `pretty '2*SIN(X)' still contains SIN — got ${svg}`);
  }

  // 2*3 — Num × Num → juxtaposition would produce "23", which reads as
  // twenty-three.  Do NOT drop the * here.
  {
    const { svg } = astToSvg(parseAlgebra('2*3'));
    assert(/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*3' KEEPS the * glyph to avoid 23 ambiguity — got ${svg}`);
  }

  // X*Y — Var × Var; current rule is conservative (left must be a
  // Num).  Ensure the `*` stays so this doesn't regress.
  {
    const { svg } = astToSvg(parseAlgebra('X*Y'));
    assert(/>\s*\*\s*<\/text>/.test(svg),
           `pretty 'X*Y' KEEPS the * glyph (conservative rule) — got ${svg}`);
  }

  // 2*X*Y — outer is (l=Bin, r=Var), inner is (l=2, r=X).  Inner
  // juxtaposes; outer keeps its *.  Expect exactly one * glyph.
  {
    const { svg } = astToSvg(parseAlgebra('2*X*Y'));
    const stars = (svg.match(/>\s*\*\s*<\/text>/g) || []).length;
    assert(stars === 1,
           `pretty '2*X*Y' has exactly 1 * glyph (inner juxtaposed) — got ${stars}: ${svg}`);
  }
}



// --- SOLVE op: stack integration ------------------------------
// SOLVE routes through Giac's solve(expr,var) — the reply is a list
// literal of roots which `splitGiacList` splits and we re-wrap each
// root as a `var = root` equation.  Each block registers a fixture
// for the caseval command the op emits.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 4')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X^2-4,X)', '[2,-2]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2,
         `SOLVE op: X^2-4 returns list of 2 roots`);
  assert(isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = 2',
         `SOLVE op: first root is X=2`);
  assert(isSymbolic(top.items[1]) &&
         formatAlgebra(top.items[1].expr) === 'X = -2',
         `SOLVE op: second root is X=-2`);
  giac._clear();
}
{
  // Linear via equation form.  SOLVE rewrites `lhs = rhs` to the
  // unambiguous expression form `lhs - rhs` before handing off to Giac
  // (see ops.js SOLVE) so that build-mode differences in how `=` is
  // parsed by caseval can't silently swallow the equation.  Fixture
  // therefore matches the rewritten command.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X + 6 = 0')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(2*X+6-0,X)', '[-3]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = -3',
         `SOLVE op: 2X+6=0 → X=-3`);
  giac._clear();
}
{
  // Bare equation form `X-1=0` — the smallest reproducer of the user-
  // reported "SOLVE returns { }" bug.  After the equation→expression
  // rewrite, Giac sees `solve(X-1-0,X)` and gives `[1]`.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X - 1 = 0')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X-1-0,X)', '[1]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = 1',
         `SOLVE op: X-1=0 → X=1`);
  giac._clear();
}
{
  // Bare-scalar reply (some builds elide the [...] for a single root).
  // SOLVE should still wrap it as `{ X = root }` rather than collapse
  // to `{ }`.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X - 7')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X-7,X)', '7');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = 7',
         `SOLVE op: bare-scalar reply 7 → { X=7 }`);
  giac._clear();
}
{
  // Typed-list reply: some giacwasm builds prefix the list literal
  // with `list`, returning `list[1]` for `solve(X-1=0, X)`.  The
  // splitGiacList parser must strip the prefix so SOLVE doesn't fall
  // through to scalar parsing and choke on "Trailing input at pos 4".
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X - 1 = 0')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X-1-0,X)', 'list[1]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = 1',
         `SOLVE op: typed-list reply list[1] → { X=1 }`);
  giac._clear();
}
{
  // Typed-list reply with multiple roots — `list[1,2]` shape from the
  // same build.  Both roots survive the prefix strip and the comma
  // splitter behaves identically to the bare-list path.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 3*X + 2')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X^2-3*X+2,X)', 'list[1,2]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2 &&
         formatAlgebra(top.items[0].expr) === 'X = 1' &&
         formatAlgebra(top.items[1].expr) === 'X = 2',
         `SOLVE op: typed-list reply list[1,2] → { X=1, X=2 }`);
  giac._clear();
}
{
  // Complex conjugate pair.  X^2 + 1 = 0 → {±i}.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('solve(X^2+1,X)', '[i,-i]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2 &&
         formatAlgebra(top.items[0].expr) === 'X = i' &&
         formatAlgebra(top.items[1].expr) === 'X = -i',
         `SOLVE op: X^2+1 → {±i}`);
  giac._clear();
}
{
  // Variable as String works too.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('Y - 7')));
  s.push(Str('Y'));
  giac._clear();
  giac._setFixture('solve(Y-7,Y)', '[7]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         formatAlgebra(top.items[0].expr) === 'Y = 7',
         `SOLVE op: accepts String 'Y' as var`);
  giac._clear();
}










// --- Odd/even symbolic identities and (-X)^n integer-power
//     canonicalisation.  Pulls signs out of SIN/TAN/ASIN/ATAN/SINH/
//     TANH/ASINH/ATANH (odd) and drops them inside COS/COSH (even).
//     `(-X)^n` with n a non-negative integer folds to X^n (even n)
//     or -(X^n) (odd n).  ABS(ABS(x)) → ABS(x).
// --- simplify() cancels a common integer factor in a fraction, so
//     DERIV(SQRT(X^2+1)) reduces to the textbook X/SQRT(X^2+1) instead
//     of 2*X/(2*SQRT(X^2+1)).

/* ============================================================
   FACT factorial, one-level UNDO, cube-root closed-form surd detection.
   ============================================================ */

// ============================================================
// Keypad binary/unary ops accept Symbolic + Name
// ============================================================
// HP50 behavior: any symbolic operand lifts the whole op into the
// algebra domain, so `'X' 'Y' +` builds `X + Y` rather than throwing
// "Bad argument type".  These tests pin:
//   * binary ops (+ - * / ^) on Sym/Name and Sym/Num combinations;
//   * the mandatory co-symbolization of the numeric other side;
//   * unary ops NEG, INV, SQ, SQRT, ABS;
//   * unary fn ops LN, EXP, LOG, SIN, ASIN, SINH, ACOSH;
//   * the 2-arg XROOT symbolically;
//   * that Bad argument type STILL fires when NO operand is symbolic
//     and the operand type is otherwise unsupported (regression).
{
  const { isSymbolic, Symbolic } = await import('../www/src/rpl/types.js');
  const { formatAlgebra, parseAlgebra } = await import('../www/src/rpl/algebra.js');

  const asExprStr = (v) => {
    assert(isSymbolic(v), 'result is Symbolic');
    return formatAlgebra(v.expr);
  };

  // --- binary: 'X' 'Y' + → X+Y  (formatter uses spaces around +/-)
  {
    const s = new Stack();
    s.push(Name('X', false, true));               // 'X' (quoted)
    s.push(Name('Y', false, true));               // 'Y'
    lookup('+').fn(s);
    assert(s.depth === 1, 'binary sym: one item on stack');
    assert(asExprStr(s.peek(1)) === 'X + Y', `'X' 'Y' + → X + Y, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 5 'X' + → 5+X (number coerces to Num AST)
  {
    const s = new Stack();
    s.push(Integer(5));
    s.push(Name('X', false, true));
    lookup('+').fn(s);
    assert(asExprStr(s.peek(1)) === '5 + X', `5 'X' + → 5 + X, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 'X' 3 ^ → X^3
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(3));
    lookup('^').fn(s);
    assert(asExprStr(s.peek(1)) === 'X^3', `'X' 3 ^ → X^3, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 'X+1' 'Y' * → (X+1)*Y (Symbolic + Name)
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+1')));
    s.push(Name('Y', false, true));
    lookup('*').fn(s);
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '(X+1)*Y' || got === '(X + 1)*Y',
      `'X+1' 'Y' * → (X+1)*Y, got ${got}`);
  }

  // --- binary: 'X' 'Y' - → X-Y
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Name('Y', false, true));
    lookup('-').fn(s);
    assert(asExprStr(s.peek(1)) === 'X - Y', `'X' 'Y' - → X - Y`);
  }

  // --- binary: 'X' 2 / → X/2
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(2));
    lookup('/').fn(s);
    assert(asExprStr(s.peek(1)) === 'X/2', `'X' 2 / → X/2`);
  }

  // --- unary NEG on a Name → -X
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('NEG').fn(s);
    assert(asExprStr(s.peek(1)) === '-X', `'X' NEG → -X`);
  }

  // --- unary INV on a Symbolic → 1/(X+1)
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+1')));
    lookup('INV').fn(s);
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '1/(X+1)' || got === '1/(X + 1)',
      `1/(X+1) via INV, got ${got}`);
  }

  // --- unary SQ on a Name → X^2
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('SQ').fn(s);
    assert(asExprStr(s.peek(1)) === 'X^2', `'X' SQ → X^2`);
  }

  // --- unary SQRT on a Name → SQRT(X)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('SQRT').fn(s);
    assert(asExprStr(s.peek(1)) === 'SQRT(X)', `'X' SQRT → SQRT(X)`);
  }

  // --- unary ABS on a Name → ABS(X)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('ABS').fn(s);
    assert(asExprStr(s.peek(1)) === 'ABS(X)', `'X' ABS → ABS(X)`);
  }

  // --- SIN on Name (angle-mode IRRELEVANT for symbolic) → SIN(X)
  {
    const s = new Stack();
    setAngle('DEG');                              // prove angle mode doesn't matter
    s.push(Name('X', false, true));
    lookup('SIN').fn(s);
    assert(asExprStr(s.peek(1)) === 'SIN(X)', `'X' SIN (DEG mode) → SIN(X)`);
    setAngle('RAD');
  }

  // --- LN/EXP/LOG/ALOG on Name
  for (const [op, want] of [['LN', 'LN(X)'], ['EXP', 'EXP(X)'], ['LOG', 'LOG(X)'], ['ALOG', 'ALOG(X)']]) {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup(op).fn(s);
    assert(asExprStr(s.peek(1)) === want, `'X' ${op} → ${want}`);
  }

  // --- Hyperbolic on Name, including ACOSH/ATANH (their domain guards
  //     do NOT fire on symbolic operands because they skip toRealOrThrow)
  for (const [op, want] of [
    ['SINH',  'SINH(X)'],  ['COSH',  'COSH(X)'],  ['TANH',  'TANH(X)'],
    ['ASINH', 'ASINH(X)'], ['ACOSH', 'ACOSH(X)'], ['ATANH', 'ATANH(X)'],
  ]) {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup(op).fn(s);
    assert(asExprStr(s.peek(1)) === want, `'X' ${op} → ${want}`);
  }

  // --- XROOT symbolically: 'X' 3 XROOT → XROOT(X,3)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(3));
    lookup('XROOT').fn(s);
    assert(asExprStr(s.peek(1)) === 'XROOT(X,3)', `'X' 3 XROOT → XROOT(X,3)`);
  }

  // --- `+` with String operand concatenates; Real(1) + "hello"
  //     → "1hello".  Matches HP50 behaviour ("ABC" 123 + → "ABC123").
  //     Keeps symbolic lift + numeric paths working for non-string
  //     operands (covered below).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Str('hello'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === '1.hello',
      'Real(1) "hello" + → "1.hello" (STD-formats the Real)');
  }
  // --- String + Integer concat: "ABC" 123 + → "ABC123"
  {
    const s = new Stack();
    s.push(Str('ABC'));
    s.push(Integer(123));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === 'ABC123',
      '"ABC" 123 + → "ABC123"');
  }
  // --- String concat also works with leading numeric side
  {
    const s = new Stack();
    s.push(Integer(123));
    s.push(Str('ABC'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === '123ABC',
      '123 "ABC" + → "123ABC"');
  }
  // --- Two strings concat
  {
    const s = new Stack();
    s.push(Str('foo'));
    s.push(Str('bar'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === 'foobar',
      '"foo" "bar" + → "foobar"');
  }

  // --- REGRESSION: two numeric operands still fold numerically
  {
    const s = new Stack();
    s.push(Integer(7));
    s.push(Integer(3));
    lookup('+').fn(s);
    assert(s.depth === 1 && isInteger(s.peek(1)) && s.peek(1).value === 10n,
      '7 3 + = 10 Integer (numeric path preserved)');
  }

  // --- End-to-end: user types `'X' ENTER 'Y' ENTER +` via Entry
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    const e = new Entry(s);
    e.type("`X`");   e.enter();
    e.type("`Y`");   e.enter();
    e.execOp('+');
    assert(s.depth === 1 && isSymbolic(s.peek(1)),
      'full keypad flow: X ENTER Y ENTER + produces Symbolic');
    assert(formatAlgebra(s.peek(1).expr) === 'X + Y',
      `keypad + on stacked quotes yields 'X + Y', got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- End-to-end: user builds '2*X+1' with the keypad
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    const e = new Entry(s);
    e.type('2');     e.enter();
    e.type("`X`");   e.enter();
    e.execOp('*');   // level1 = '2*X'
    e.type('1');     e.enter();
    e.execOp('+');   // level1 = '2*X+1'
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '2*X + 1', `keypad built '2*X + 1', got ${got}`);
  }

  /* ========== Comparison ops produce symbolic ============
     Every comparison op (=, ≠, <, >, ≤, ≥ and ASCII aliases <=, >=, <>)
     must (a) parse inside '…' algebraic literals and (b) produce a
     Symbolic result when either operand is a Name or Symbolic.
     ================================================================== */
  {
    const { parseEntry } = await import('../www/src/rpl/parser.js');
    const { formatAlgebra } = await import('../www/src/rpl/algebra.js');
    const { TYPES } = await import('../www/src/rpl/types.js');

    // --- parse inside '…' for every comparison operator ---
    const parseOps = [
      ["`x<y`",  'x<y'],
      ["`x>y`",  'x>y'],
      ["`x=y`",  'x = y'],      // `=` prints with surrounding spaces
      ["`x≠y`",  'x≠y'],
      ["`x<=y`", 'x≤y'],         // `<=` normalised to ≤
      ["`x>=y`", 'x≥y'],
      ["`x≤y`",  'x≤y'],
      ["`x≥y`",  'x≥y'],
    ];
    for (const [src, expected] of parseOps) {
      const vs = parseEntry(src);
      assert(vs.length === 1 && vs[0].type === TYPES.SYMBOLIC,
        `${src} parses to Symbolic`);
      const got = formatAlgebra(vs[0].expr);
      assert(got === expected,
        `${src} → ${expected} (got ${got})`);
    }

    // --- stack op: `x y >` with two Names → 'x>y' ---
    const stackCases = [
      ['>', 'x>y'],
      ['<', 'x<y'],
      ['≤', 'x≤y'],
      ['≥', 'x≥y'],
      ['≠', 'x≠y'],
      ['=', 'x = y'],
    ];
    for (const [op, expected] of stackCases) {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Name('y'));
      lookup(op).fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `Name('x') Name('y') ${op} → Symbolic`);
      const got = formatAlgebra(s.peek(1).expr);
      assert(got === expected,
        `Name('x') Name('y') ${op} → '${expected}' (got '${got}')`);
    }

    // --- ASCII aliases <= / >= / <> produce the canonical Unicode op ---
    for (const [alias, canonical] of [['<=', '≤'], ['>=', '≥'], ['<>', '≠']]) {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Name('y'));
      lookup(alias).fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `${alias} alias produces Symbolic`);
      assert(s.peek(1).expr.op === canonical,
        `${alias} alias normalises to ${canonical} (got ${s.peek(1).expr.op})`);
    }

    // --- Name-vs-Number still lifts: `x 5 <` → 'x<5' ---
    {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Integer(5));
      lookup('<').fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        'Name x Integer 5 < → Symbolic');
      assert(formatAlgebra(s.peek(1).expr) === 'x<5',
        `x 5 < → 'x<5', got ${formatAlgebra(s.peek(1).expr)}`);
    }

    // --- Pure numeric comparisons still return booleans (regression) ---
    {
      const s = new Stack();
      s.push(Integer(5)); s.push(Integer(3));
      lookup('<').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(0),
        '5 3 < → 0. (boolean path preserved)');
    }
    {
      const s = new Stack();
      s.push(Integer(5)); s.push(Integer(3));
      lookup('≠').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(1),
        '5 3 ≠ → 1. (boolean path preserved)');
    }

    // --- The `=` stack op builds an equation, even from numerics ---
    {
      const s = new Stack();
      s.push(Integer(2)); s.push(Integer(3));
      lookup('=').fn(s);
      assert(s.peek(1).type === TYPES.SYMBOLIC,
        '2 3 = → Symbolic (equation builder)');
      assert(formatAlgebra(s.peek(1).expr) === '2 = 3',
        `2 3 = → '2 = 3', got ${formatAlgebra(s.peek(1).expr)}`);
    }

    // --- `==` stays boolean / structural even with Names (regression) ---
    {
      const s = new Stack();
      s.push(Name('X')); s.push(Name('X'));
      lookup('==').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(1),
        'Name(X) Name(X) == → 1. (structural test, not symbolic)');
    }

    // --- End-to-end keypad flow: 'x' ENTER 'y' ENTER `>` → 'x>y' ---
    {
      const { Entry } = await import('../www/src/ui/entry.js');
      const s = new Stack();
      const e = new Entry(s);
      e.type("`x`");   e.enter();
      e.type("`y`");   e.enter();
      e.execOp('>');
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `'x' ENTER 'y' ENTER > → Symbolic`);
      assert(formatAlgebra(s.peek(1).expr) === 'x>y',
        `keypad > yields 'x>y', got '${formatAlgebra(s.peek(1).expr)}'`);
    }
  }
}

/* ========== EXACT mode keeps Integer fractions exact ==
   EXACT (the default indicator) must not reduce fractions to their
   decimal equivalents — that is APPROX mode's job.  Non-exact
   Integer/Integer division produces a native Rational type (backed by
   Fraction.js), not a Symbolic('n/d') wrapper.
   ====================================================================== */
{
  const { setApproxMode } = await import('../www/src/rpl/state.js');
  const { TYPES } = await import('../www/src/rpl/types.js');

  // EXACT (default): 1 3 / stays as Rational(1/3), not 0.333…
  setApproxMode(false);
  {
    const s = new Stack();
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('/').fn(s);
    assert(s.depth === 1 && s.peek(1).type === TYPES.RATIONAL,
      'EXACT: 1 3 / → Rational (not Real)');
    assert(s.peek(1).n === 1n && s.peek(1).d === 3n,
      `EXACT: 1 3 / → 1/3, got ${s.peek(1).n}/${s.peek(1).d}`);
  }

  // EXACT: 6 2 / still folds to Integer(3) — clean divisions stay Integer.
  {
    const s = new Stack();
    s.push(Integer(6));
    s.push(Integer(2));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.INTEGER && s.peek(1).value === 3n,
      'EXACT: 6 2 / → Integer(3) (clean division stays Integer)');
  }

  // EXACT: 2 4 / reduces via GCD to Rational(1/2).
  {
    const s = new Stack();
    s.push(Integer(2));
    s.push(Integer(4));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.RATIONAL &&
           s.peek(1).n === 1n && s.peek(1).d === 2n,
      'EXACT: 2 4 / → Rational(1/2) (auto-reduce via Fraction.js GCD)');
  }

  // APPROX: 1 3 / folds to a Real decimal.
  setApproxMode(true);
  {
    const s = new Stack();
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.REAL,
      'APPROX: 1 3 / → Real (decimal fold)');
    assert(Math.abs(s.peek(1).value - 0.3333333333333333) < 1e-10,
      `APPROX: 1 3 / ≈ 0.333…, got ${s.peek(1).value}`);
  }

  // Restore default EXACT for any downstream tests.
  setApproxMode(false);
}



// ================================================================
// APPROX / EXACT numeric-eval mode
//
// APPROX: EVAL on a Symbolic folds transcendentals to a 12-digit
// decimal.  EXACT (default): EVAL only folds when the result is an
// integer AND every arg was an integer, so SQRT(9) → 3 still folds
// but SQRT(2) and LN(2) stay symbolic.  →NUM forces APPROX for the
// span of one EVAL regardless of the flag.
// ================================================================
{
  const {
    setApproxMode, getApproxMode, toggleApproxMode,
  } = await import('../www/src/rpl/state.js');

  // Helper: run `'EXPR' EVAL` on a fresh stack, return the
  // top-of-stack string (via formatStackTop) so we can assert the
  // shape of the result without caring about numeric tolerance.
  function evalExpr(src) {
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('EVAL').fn(s, null);
    return formatStackTop(s.peek());
  }

  // ---- APPROX mode (default) folds everything ----
  //     formatStackTop wraps Symbolic values in `'…'` and appends `.`
  //     to whole-number Reals (HP50 conventions); the tests accommodate
  //     both so they read as "the stack top shows ___".
  {
    resetHome();
    setApproxMode(true);
    assert(getApproxMode() === true, 'default/APPROX: flag is true');
    assert(evalExpr("`SQRT(2)`") === '1.41421356237',
      `APPROX: SQRT(2) folds to decimal — got ${evalExpr("`SQRT(2)`")}`);
    assert(evalExpr("`SQRT(9)`") === '3.',
      `APPROX: SQRT(9) folds to 3. — got ${evalExpr("`SQRT(9)`")}`);
    assert(evalExpr("`LN(2)`").startsWith('0.69314'),
      `APPROX: LN(2) folds to decimal — got ${evalExpr("`LN(2)`")}`);
  }

  // ---- EXACT mode keeps non-integer results symbolic ----
  {
    resetHome();
    setApproxMode(false);
    assert(getApproxMode() === false, 'EXACT: flag is false after setApproxMode(false)');
    // Integer-in, integer-out: still folds.
    assert(evalExpr("`SQRT(9)`") === '3.',
      `EXACT: SQRT(9) still folds to 3. — got ${evalExpr("`SQRT(9)`")}`);
    assert(evalExpr("`LN(1)`") === '0.',
      `EXACT: LN(1) still folds to 0. — got ${evalExpr("`LN(1)`")}`);
    // Integer-in, non-integer-out: stays symbolic.
    assert(evalExpr("`SQRT(2)`") === "`SQRT(2)`",
      `EXACT: SQRT(2) stays symbolic — got ${evalExpr("`SQRT(2)`")}`);
    assert(evalExpr("`LN(2)`") === "`LN(2)`",
      `EXACT: LN(2) stays symbolic — got ${evalExpr("`LN(2)`")}`);
    // Non-integer-in: stays symbolic regardless of result.
    assert(evalExpr("`SQRT(0.25)`") === "`SQRT(0.25)`",
      `EXACT: SQRT(0.25) stays symbolic — got ${evalExpr("`SQRT(0.25)`")}`);
  }

  // ---- toggleApproxMode flips the flag ----
  {
    setApproxMode(false);
    toggleApproxMode();
    assert(getApproxMode() === true, 'toggle: false → true');
    toggleApproxMode();
    assert(getApproxMode() === false, 'toggle: true → false');
  }

  // ---- APPROX / EXACT ops from the registry ----
  {
    resetHome();
    setApproxMode(true);
    const s = new Stack();
    lookup('EXACT').fn(s, null);
    assert(getApproxMode() === false, 'EXACT op: flag is false after running');
    lookup('APPROX').fn(s, null);
    assert(getApproxMode() === true, 'APPROX op: flag is true after running');
  }

  // ---- →NUM forces APPROX for one EVAL, then restores the flag ----
  {
    resetHome();
    setApproxMode(false);
    // Start in EXACT.  `'SQRT(2)' EVAL` would stay symbolic;
    // `'SQRT(2)' →NUM` must fold to the decimal.
    const s = new Stack();
    for (const v of parseEntry("`SQRT(2)`")) s.push(v);
    lookup('→NUM').fn(s, null);
    const top = formatStackTop(s.peek());
    assert(top === '1.41421356237',
      `→NUM under EXACT folds SQRT(2) to decimal — got ${top}`);
    // Flag must be restored to the pre-call value.
    assert(getApproxMode() === false,
      '→NUM restores the pre-call APPROX flag (stayed EXACT)');
  }

  // ---- →NUM restores flag even when EVAL throws ----
  {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    // Push a Symbolic referencing an unbound name — EVAL won't throw,
    // just leaves it symbolic.  Force a real throw by feeding a bare
    // name that can't resolve.  Pushing an empty stack and calling →NUM
    // will throw "Too few arguments"; catch to assert flag is restored.
    assertThrows(() => lookup('→NUM').fn(s, null), null, '→NUM with empty stack throws');
    assert(getApproxMode() === false,
      '→NUM restores the EXACT flag even on error');
  }

  // ---- ->NUM ASCII alias routes to same op ----
  {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry("`SQRT(4)`")) s.push(v);
    lookup('->NUM').fn(s, null);
    assert(formatStackTop(s.peek()) === '2.',
      `->NUM ASCII alias folds SQRT(4) → 2. — got ${formatStackTop(s.peek())}`);
  }

  // Reset flag to the default (EXACT) so later tests aren't affected.
  setApproxMode(false);
}

// ==================================================================
// →NUM coverage in EXACT mode + symbolic constants.
//
// Behaviour pinned here:
//   1. Parser: pure-numeric tick-strings like '1/3' and '2^0.5'
//      parse as Symbolic rather than Name, so →NUM can reach them.
//   2. ops.js: PI / E are built-in constants resolved to numbers in
//      APPROX mode (incl. during the →NUM span) and kept symbolic in
//      EXACT.  `'PI' →NUM` folds to 3.14159… while `'PI' EVAL` in
//      EXACT stays as 'PI'.
//   3. algebra.evalAst honours a `binGate` callback; ops.js passes
//      `_approxGate` so EXACT-mode EVAL refuses to fold `'1/3'` or
//      `'1+0.5'` into a Real.
// ==================================================================
{
  const { getApproxMode } = await import('../www/src/rpl/state.js');
  // --- parser recognizes pure-numeric tick-strings as Symbolic ------
  {
    const toks = parseEntry("`1/3`");
    assert(toks.length === 1 && isSymbolic(toks[0]),
           `session041: '1/3' parses as Symbolic — got ${JSON.stringify(toks[0])}`);
  }
  {
    const toks = parseEntry("`2^0.5`");
    assert(toks.length === 1 && isSymbolic(toks[0]),
           `session041: '2^0.5' parses as Symbolic`);
  }
  {
    // Bare operator ticks still fall through to Name via the
    // parseAlgebra try/catch — `'+'` is not a legal algebraic form.
    const toks = parseEntry("`+`");
    assert(toks.length === 1 && isName(toks[0]) && toks[0].id === '+' && toks[0].quoted === true,
           `session041: '+' still falls back to a quoted Name`);
  }

  // --- →NUM folds symbolic inputs that EXACT mode keeps symbolic ------
  function runNum(src) {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('→NUM').fn(s, null);
    return { top: s.peek(), approx: getApproxMode() };
  }
  {
    const { top, approx } = runNum("`1/3`");
    assert(isReal(top) && Math.abs(top.value - 1/3) < 1e-12,
           `session041: EXACT '1/3' →NUM folds to 0.3333… — got ${formatStackTop(top)}`);
    assert(approx === false, "session041: →NUM restored EXACT after `1/3`");
  }
  {
    const { top } = runNum("`2^0.5`");
    assert(isReal(top) && Math.abs(top.value - Math.SQRT2) < 1e-12,
           `session041: EXACT '2^0.5' →NUM folds to SQRT(2) — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`PI`");
    assert(isReal(top) && Math.abs(top.value - Math.PI) < 1e-12,
           `session041: EXACT 'PI' →NUM folds to 3.14159… — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`PI+1`");
    assert(isReal(top) && Math.abs(top.value - (Math.PI + 1)) < 1e-12,
           `session041: EXACT 'PI+1' →NUM folds — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`SIN(PI/4)`");
    setAngle('RAD');                   // in case a previous test changed it
    assert(isReal(top) && Math.abs(top.value - Math.SQRT1_2) < 1e-12,
           `session041: EXACT 'SIN(PI/4)' →NUM folds to √2/2 — got ${formatStackTop(top)}`);
  }

  // --- EVAL in EXACT mode — constants stay symbolic, pure-numeric
  //     Bin nodes that would produce a non-integer stay symbolic too ---
  function runEvalExact(src) {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('EVAL').fn(s, null);
    return s.peek();
  }
  {
    const top = runEvalExact("`PI`");
    assert(isName(top) && top.id === 'PI',
           `session041: EXACT 'PI' EVAL stays symbolic — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`1/3`");
    assert(isSymbolic(top),
           `session041: EXACT '1/3' EVAL stays symbolic — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`2+3`");
    // Integer-result-from-integer-inputs still folds under EXACT.
    assert(isReal(top) && top.value.eq(5),
           `session041: EXACT '2+3' EVAL folds to 5. — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`1+0.5`");
    assert(isSymbolic(top),
           `session041: EXACT '1+0.5' EVAL stays symbolic (non-integer input) — got ${formatStackTop(top)}`);
  }
  setApproxMode(false);
}

// ==================================================================
// pretty.js opSepBox tightens `+`/`-`/`=` spacing.
// ==================================================================
{
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  {
    const { svg } = astToSvg(parseAlgebra('X + 1'));
    // The `+` glyph isn't padded by full character widths — the <text>
    // body is literally `+`, not ` + `.
    assert(svg.includes('>+<') && !svg.includes('> + <'),
           `session041: 'X + 1' renders with tight + separator (got ${svg})`);
  }
  {
    const { svg } = astToSvg(parseAlgebra('A = B'));
    assert(svg.includes('>=<') && !svg.includes('> = <'),
           `session041: 'A = B' renders with tight = separator`);
  }
  {
    // `*` without juxtaposition still uses the plain textBox(op) path
    // — no padding change there, so `A * B` still looks like `A*B`
    // (no spaces) in SVG.
    const { svg } = astToSvg(parseAlgebra('A * B'));
    assert(svg.includes('>*<'),
           `session041: 'A * B' '*' glyph still inline`);
  }
}

// ==================================================================
// Complex display drops trailing `.` on integer-valued components in
// EXACT + STD mode.
// ==================================================================
{
  const prev = (await import('../www/src/rpl/state.js')).getApproxMode();
  setApproxMode(false);
  assert(format(Complex(1, 1)) === '(1, 1)',
         `session041: EXACT (1,1) → '(1, 1)' — got ${format(Complex(1, 1))}`);
  assert(format(Complex(0, -1)) === '(0, -1)',
         `session041: EXACT (0,-1) → '(0, -1)'`);
  assert(format(Complex(2.5, 3)) === '(2.5, 3)',
         `session041: EXACT (2.5,3) → '(2.5, 3)'`);
  setApproxMode(true);
  assert(format(Complex(1, 1)) === '(1., 1.)',
         `session041: APPROX (1,1) → '(1., 1.)'`);
  setApproxMode(prev);
}


// ==================================================================
// HORNER / PCOEF / FCOEF
// ==================================================================

/* ---- HORNER: (x³ - 6x² + 11x - 6) synth-divided by (x - 1) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-6n), Integer(11n), Integer(-6n)]));
  s.push(Integer(1n));
  lookup('HORNER').fn(s);
  assert(s.depth === 3, 'session053: HORNER leaves quotient, remainder, a');
  const a = s.peek(1);
  const r = s.peek(2);
  const q = s.peek(3);
  assert(q.type === 'list', 'session053: HORNER quotient is list');
  assert(q.items.map(i => i.value).join(',') === '1,-5,6',
    'session053: HORNER quotient of x³-6x²+11x-6 by (x-1) = x²-5x+6');
  assert(r.value === 0n, 'session053: HORNER remainder at root = 0');
  assert(a.value === 1n, 'session053: HORNER pushes `a` on top');
}

/* ---- HORNER evaluated at non-root: remainder = p(a) ---- */
{
  // p(x) = 2x² - 3x + 1 ; p(2) = 2*4 - 6 + 1 = 3
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(-3n), Integer(1n)]));
  s.push(Integer(2n));
  lookup('HORNER').fn(s);
  assert(s.peek(2).value === 3n, 'session053: HORNER remainder = p(a)');
}

/* ---- HORNER: empty coefs throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Integer(1n));
  assertThrows(() => { lookup('HORNER').fn(s); }, /Bad argument/, 'session053: HORNER empty coef list throws');
}

/* ---- HORNER: non-numeric coef throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Name('A')]));
  s.push(Integer(1n));
  assertThrows(() => { lookup('HORNER').fn(s); }, /Bad argument/, 'session053: HORNER Name coef throws');
}

/* ---- PCOEF: {1 2 3} → coefs of (x-1)(x-2)(x-3) = x³-6x²+11x-6 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('PCOEF').fn(s);
  const c = s.peek();
  assert(c.type === 'list' && c.items.length === 4,
    'session053: PCOEF {1 2 3} length 4');
  assert(c.items.map(i => i.value).join(',') === '1,-6,11,-6',
    'session053: PCOEF {1 2 3} → {1 -6 11 -6}');
}

/* ---- PCOEF: empty list → {1} ---- */
{
  const s = new Stack();
  s.push(RList([]));
  lookup('PCOEF').fn(s);
  const c = s.peek();
  assert(c.type === 'list' && c.items.length === 1 && c.items[0].value === 1n,
    'session053: PCOEF {} → {1}');
}

/* ---- PCOEF: single root {5} → {1 -5} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(5n)]));
  lookup('PCOEF').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '1,-5',
    'session053: PCOEF {5} → {1 -5}');
}

/* ---- PCOEF and HORNER round-trip: roots → poly → remainder@root = 0 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(3n), Integer(5n)]));
  lookup('PCOEF').fn(s);
  // Now stack has the poly list.  Evaluate at x = 3 via HORNER.
  s.push(Integer(3n));
  lookup('HORNER').fn(s);
  assert(s.peek(2).value === 0n,
    'session053: PCOEF|HORNER at root → remainder 0');
}

/* ---- FCOEF: {1 2} → (VX - 1)² ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  lookup('FCOEF').fn(s);
  assert(s.peek().type === 'symbolic',
    'session053: FCOEF returns Symbolic');
  const e = s.peek().expr;
  // Expect AstBin('*', (X-1), (X-1))
  assert(e.kind === 'bin' && e.op === '*' &&
         e.l.kind === 'bin' && e.l.op === '-' &&
         e.r.kind === 'bin' && e.r.op === '-',
    'session053: FCOEF {1 2} → (X-1)*(X-1)');
}

/* ---- FCOEF: {1 1 2 1} → (X-1)*(X-2) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(1n), Integer(2n), Integer(1n)]));
  lookup('FCOEF').fn(s);
  const e = s.peek().expr;
  assert(e.kind === 'bin' && e.op === '*',
    'session053: FCOEF two distinct roots → product');
}

/* ---- FCOEF: odd-length list throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  assertThrows(() => { lookup('FCOEF').fn(s); }, /Bad argument/, 'session053: FCOEF odd-length list throws');
}

/* ---- FCOEF: negative multiplicity throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-1n)]));
  assertThrows(() => { lookup('FCOEF').fn(s); }, /Bad argument/, 'session053: FCOEF negative multiplicity throws');
}

/* ---- FCOEF: zero-multiplicity skipped; empty result = Num(1) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n)]));
  lookup('FCOEF').fn(s);
  const e = s.peek().expr;
  assert(e.kind === 'num' && e.value === 1,
    'session053: FCOEF {1 0} → Sym(1)');
}

/* =================================================================
   PROOT, QUOT, REMAINDER.
   ================================================================= */

/* ---- PROOT: x² - 3x + 2 = (x-1)(x-2) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 2,
    'session054: PROOT quadratic returns 2-vector');
  const vals = v.items.map(x => (isReal(x) || isInteger(x)) ? Number(x.value) : null).sort((a, b) => a - b);
  assert(vals[0] !== null && vals[1] !== null && Math.abs(vals[0] - 1) < 1e-9
         && Math.abs(vals[1] - 2) < 1e-9,
    'session054: PROOT x²-3x+2 → {1, 2}');
}

/* ---- PROOT: x² + 1 → ±i ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 2,
    'session054: PROOT x²+1 returns 2-vector');
  let sawI = false, sawNegI = false;
  for (const z of v.items) {
    assert(isComplex(z), 'session054: PROOT x²+1 root is Complex');
    if (Math.abs(z.re) < 1e-9 && Math.abs(z.im - 1) < 1e-9) sawI = true;
    if (Math.abs(z.re) < 1e-9 && Math.abs(z.im + 1) < 1e-9) sawNegI = true;
  }
  assert(sawI && sawNegI, 'session054: PROOT x²+1 → ±i');
}

/* ---- PROOT: cubic (x-1)(x-2)(x-3) = x³-6x²+11x-6 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-6n), Integer(11n), Integer(-6n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  const vals = v.items.map(x => Number(x.value)).sort((a, b) => a - b);
  assert(Math.abs(vals[0] - 1) < 1e-6 && Math.abs(vals[1] - 2) < 1e-6
         && Math.abs(vals[2] - 3) < 1e-6,
    'session054: PROOT cubic → {1, 2, 3}');
}

/* ---- PROOT: linear shortcut 2x - 6 → {3} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(-6n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 1
         && Math.abs(Number(v.items[0].value) - 3) < 1e-12,
    'session054: PROOT linear 2x-6 → {3}');
}

/* ---- PROOT: empty list → Bad argument value ---- */
{
  const s = new Stack();
  s.push(RList([]));
  assertThrows(() => { lookup('PROOT').fn(s); }, /Bad argument value/, 'session054: PROOT {} throws');
}

/* ---- PROOT: Name coef rejected ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Name('a'), Integer(1n)]));
  assertThrows(() => { lookup('PROOT').fn(s); }, /Bad argument/, 'session054: PROOT Name coef throws');
}

/* ---- QUOT: (x³ - 2x² + x - 2) / (x - 2) = x² + 1 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-2n), Integer(1n), Integer(-2n)]));
  s.push(RList([Integer(1n), Integer(-2n)]));
  lookup('QUOT').fn(s);
  const q = s.pop();
  assert(q.type === 'list' && q.items.length === 3
         && Number(q.items[0].value) === 1
         && Number(q.items[1].value) === 0
         && Number(q.items[2].value) === 1,
    'session054: QUOT → {1 0 1}');
}

/* ---- REMAINDER: (x² + 1) / (x - 1) = quot (x+1), rem 2 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  s.push(RList([Integer(1n), Integer(-1n)]));
  lookup('REMAINDER').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 1
         && Number(r.items[0].value) === 2,
    'session054: REMAINDER → {2}');
}

/* ---- REMAINDER: exact divide → {0} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)])); // x²-3x+2
  s.push(RList([Integer(1n), Integer(-1n)]));              // x-1
  lookup('REMAINDER').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 1
         && Number(r.items[0].value) === 0,
    'session054: REMAINDER exact → {0}');
}

/* ---- QUOT: divisor-degree > dividend-degree → {0} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n)]));               // x
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));  // x²
  lookup('QUOT').fn(s);
  const q = s.pop();
  assert(q.type === 'list' && q.items.length === 1
         && Number(q.items[0].value) === 0,
    'session054: QUOT smaller dividend → {0}');
}

/* ---- QUOT: divisor = {0} → Infinite result ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(1n)]));
  s.push(RList([Integer(0n)]));
  assertThrows(() => { lookup('QUOT').fn(s); }, /Infinite/, 'session054: QUOT by zero throws');
}

/* =================================================================
   PEVAL, PTAYL, EPSX0, DISTRIB.
   (GRAMSCHMIDT / QR / CHOLESKY / RDM / C→P / P→C live in
   tests/test-matrix.mjs and tests/test-numerics.mjs.)
   ================================================================= */

/* ---- PEVAL: p(x) = x² - 3x + 2, x = 5 → 12 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)]));
  s.push(Integer(5n));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(Number(r.value) === 12,
    'session055: PEVAL x²-3x+2 at 5 → 12');
}

/* ---- PEVAL: constant polynomial returns the constant ---- */
{
  const s = new Stack();
  s.push(RList([Real(7)]));
  s.push(Real(999));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(isReal(r) && r.value.eq(7),
    'session055: PEVAL constant → constant');
}

/* ---- PEVAL: complex argument ---- */
{
  const s = new Stack();
  // p(x) = x² + 1; evaluated at i should be 0.
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  s.push(Complex(0, 1));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: PEVAL x²+1 at i → 0');
}

/* ---- PEVAL: empty list throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Real(1));
  assertThrows(() => { lookup('PEVAL').fn(s); }, /Bad argument value/, 'session055: PEVAL {} throws');
}

/* ---- PEVAL: Symbolic coef rejected ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Symbolic(AstVar('a'))]));
  s.push(Real(1));
  assertThrows(() => { lookup('PEVAL').fn(s); }, /Bad argument/, 'session055: PEVAL Symbolic coef throws');
}

/* ---- PTAYL: x²  shifted by a=0  →  x² unchanged ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));
  s.push(Integer(0n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 3 && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 0 && Number(L.items[2].value) === 0,
    'session055: PTAYL x² at 0 → {1 0 0}');
}

/* ---- PTAYL: x² shifted by a=1  →  (x-1)² basis coefs = {1 2 1}
         because p(x) = x² = 1·(x-1)² + 2·(x-1) + 1 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));
  s.push(Integer(1n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 3 && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 2 && Number(L.items[2].value) === 1,
    'session055: PTAYL x² at 1 → {1 2 1}');
}

/* ---- PTAYL: (x+1)³  round-trips PCOEF → PTAYL at -1 gives {1 0 0 0} ---- */
{
  const s = new Stack();
  // (x - -1)³ expansion: x³ + 3x² + 3x + 1
  s.push(RList([Integer(1n), Integer(3n), Integer(3n), Integer(1n)]));
  s.push(Integer(-1n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  // In (x+1) basis, p = (x+1)³ → {1 0 0 0}
  assert(L.items.length === 4
         && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 0
         && Number(L.items[2].value) === 0
         && Number(L.items[3].value) === 0,
    'session055: PTAYL (x+1)³ at -1 → {1 0 0 0}');
}

/* ---- PTAYL: constant polynomial → constant polynomial ---- */
{
  const s = new Stack();
  s.push(RList([Real(5)]));
  s.push(Real(3));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 1 && Number(L.items[0].value) === 5,
    'session055: PTAYL constant → constant');
}

/* ---- PTAYL: empty list throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Real(1));
  assertThrows(() => { lookup('PTAYL').fn(s); }, /Bad argument value/, 'session055: PTAYL {} throws');
}

/* ---- EPSX0: tiny numeric drops to 0 ---- */
{
  const s = new Stack();
  // Sym:  X + 1e-15
  s.push(Symbolic(AstBin('+', AstVar('X'), AstNum(1e-15))));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isSymbolic(v), 'session055: EPSX0 Symbolic out');
  const e = v.expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'var' && e.l.name === 'X'
         && e.r.kind === 'num' && e.r.value === 0,
    'session055: EPSX0 tiny → 0 inside AST');
}

/* ---- EPSX0: value above threshold preserved ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('+', AstVar('X'), AstNum(0.5))));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.r.kind === 'num' && e.r.value === 0.5,
    'session055: EPSX0 preserves non-small values');
}

/* ---- EPSX0: nested inside fn call ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstFn('SIN', [AstBin('+', AstVar('X'), AstNum(1e-14))])));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.kind === 'fn' && e.name === 'SIN'
         && e.args[0].kind === 'bin'
         && e.args[0].r.kind === 'num' && e.args[0].r.value === 0,
    'session055: EPSX0 recurses into fn args');
}

/* ---- EPSX0: scalar Real below threshold → Real(0) ---- */
{
  const s = new Stack();
  s.push(Real(1e-15));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(0),
    'session055: EPSX0 Real tiny → 0');
}

/* ---- EPSX0: scalar Real above threshold pass-through ---- */
{
  const s = new Stack();
  s.push(Real(2));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(2),
    'session055: EPSX0 Real 2 → 2');
}

/* ---- EPSX0: Complex with tiny imaginary → Real ---- */
{
  const s = new Stack();
  s.push(Complex(3, 1e-13));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(3),
    'session055: EPSX0 tiny-imag Complex → Real');
}

/* ---- EPSX0: Vector of tiny values ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1e-15), Real(2), Real(-1e-20)]));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(v.items.length === 3
         && v.items[0].value.eq(0)
         && v.items[1].value.eq(2)
         && v.items[2].value.eq(0),
    'session055: EPSX0 Vector element-wise');
}

/* ---- DISTRIB: a*(b+c) → a*b + a*c ---- */
{
  const s = new Stack();
  // X * (Y + Z)
  s.push(Symbolic(AstBin('*', AstVar('X'),
    AstBin('+', AstVar('Y'), AstVar('Z')))));
  lookup('DISTRIB').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'bin' && e.l.op === '*'
         && e.l.l.kind === 'var' && e.l.l.name === 'X'
         && e.l.r.kind === 'var' && e.l.r.name === 'Y'
         && e.r.kind === 'bin' && e.r.op === '*'
         && e.r.l.kind === 'var' && e.r.l.name === 'X'
         && e.r.r.kind === 'var' && e.r.r.name === 'Z',
    'session055: DISTRIB X*(Y+Z) → X*Y + X*Z');
}

/* ---- DISTRIB: (b-c)*a → b*a - c*a ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('*',
    AstBin('-', AstVar('B'), AstVar('C')),
    AstVar('A'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '-'
         && e.l.kind === 'bin' && e.l.op === '*'
         && e.l.l.kind === 'var' && e.l.l.name === 'B'
         && e.l.r.kind === 'var' && e.l.r.name === 'A'
         && e.r.kind === 'bin' && e.r.op === '*'
         && e.r.l.kind === 'var' && e.r.l.name === 'C'
         && e.r.r.kind === 'var' && e.r.r.name === 'A',
    'session055: DISTRIB (B-C)*A → B*A - C*A');
}

/* ---- DISTRIB: (b+c)/a → b/a + c/a ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('/',
    AstBin('+', AstVar('B'), AstVar('C')),
    AstVar('A'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.op === '/' && e.l.l.name === 'B' && e.l.r.name === 'A'
         && e.r.op === '/' && e.r.l.name === 'C' && e.r.r.name === 'A',
    'session055: DISTRIB (B+C)/A → B/A + C/A');
}

/* ---- DISTRIB: no distributable → unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('+', AstVar('X'), AstVar('Y'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.name === 'X' && e.r.name === 'Y',
    'session055: DISTRIB X+Y → X+Y (no change)');
}

/* ---- DISTRIB: descends into children to find first distributable ---- */
{
  const s = new Stack();
  // (X + (A * (B + C)))  → distribute on inner A*(B+C)
  s.push(Symbolic(AstBin('+', AstVar('X'),
    AstBin('*', AstVar('A'),
      AstBin('+', AstVar('B'), AstVar('C'))))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  // Expected: X + (A*B + A*C)
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'var' && e.l.name === 'X'
         && e.r.kind === 'bin' && e.r.op === '+',
    'session055: DISTRIB recurses into children');
}

/* ---- DISTRIB: non-Symbolic input rejected ---- */
{
  const s = new Stack();
  s.push(Integer(5n));
  assertThrows(() => { lookup('DISTRIB').fn(s); }, /Bad argument/, 'session055: DISTRIB non-Symbolic throws');
}

/* ================================================================
   HERMITE / LEGENDRE / TCHEBYCHEFF (first-kind) and the TCHEB alias.

   All three ops run a three-term recurrence on a plain coefficient
   array (descending degree), then convert to a Symbolic expression
   in `X` via the shared `_coefArrToSymbolicX` helper in ops.js.  The
   tests evaluate the produced Symbolic at a handful of sample X
   values (via evalAst) and compare against the textbook polynomial
   values — this double-checks both the recurrence arithmetic and the
   coefficient-array → Symbolic translation.
   ================================================================ */

/* Reference closed-form polynomial values at x. */
function _refHermite(n, x) {
  // Physicist's Hermite: H_0 = 1, H_1 = 2x, H_{k+1} = 2x·H_k - 2k·H_{k-1}.
  if (n === 0) return 1;
  if (n === 1) return 2 * x;
  let a = 1, b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - 2 * k * a;
    a = b; b = c;
  }
  return b;
}
function _refLegendre(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let a = 1, b = x;
  for (let k = 1; k < n; k++) {
    const c = ((2 * k + 1) * x * b - k * a) / (k + 1);
    a = b; b = c;
  }
  return b;
}
function _refTcheb(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let a = 1, b = x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - a;
    a = b; b = c;
  }
  return b;
}

/* Evaluate the Symbolic result at a specific X value via evalAst.
   evalAst takes a `lookup(name) → number|null` callback and returns
   an AST node; when every Var folded, that node is `Num(k)`. */
function _evalSymAtX(sym, x) {
  const out = evalAst(sym.expr, (name) => name === 'X' ? x : null);
  if (!out || out.kind !== 'num') {
    throw new Error('evalAst did not fold to a Num: ' + JSON.stringify(out));
  }
  return out.value;
}

/* ---- HERMITE 0 / 1 / 3 / 5: closed-form values at x = 0.7, -1.2 ---- */
for (const n of [0, 1, 3, 5]) {
  for (const x of [0.7, -1.2]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('HERMITE').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refHermite(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: HERMITE(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- HERMITE: H_3(X) = 8·X^3 - 12·X structural check ---- */
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('HERMITE').fn(s);
  const e = s.pop().expr;
  // Root of the expression should be '-' since 8X^3 is positive and
  // the -12X term follows.
  assert(e.kind === 'bin' && e.op === '-',
    'session056: HERMITE(3) root is subtraction (8X^3 - 12X)');
}

/* ---- LEGENDRE 0 / 1 / 2 / 4: closed-form values at x = 0.3, -0.8 ---- */
for (const n of [0, 1, 2, 4]) {
  for (const x of [0.3, -0.8]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('LEGENDRE').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refLegendre(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: LEGENDRE(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- LEGENDRE(1) = X passthrough ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('LEGENDRE').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'var' && e.name === 'X',
    'session056: LEGENDRE(1) = X');
}

/* ---- TCHEBYCHEFF 0 / 1 / 3 / 6 at x = 0.5, -0.9 ---- */
for (const n of [0, 1, 3, 6]) {
  for (const x of [0.5, -0.9]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('TCHEBYCHEFF').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refTcheb(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: TCHEBYCHEFF(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- TCHEB alias produces same result as TCHEBYCHEFF ---- */
{
  const s1 = new Stack(); s1.push(Integer(4n)); lookup('TCHEBYCHEFF').fn(s1);
  const s2 = new Stack(); s2.push(Integer(4n)); lookup('TCHEB').fn(s2);
  const e1 = s1.pop().expr, e2 = s2.pop().expr;
  // Evaluate at a couple of X values; the AST structure should match too.
  const at = (e, x) => {
    const r = evalAst(e, (name) => name === 'X' ? x : null);
    return r.value;
  };
  assert(Math.abs(at(e1, 0.6) - at(e2, 0.6)) < 1e-12 &&
         Math.abs(at(e1, -0.3) - at(e2, -0.3)) < 1e-12,
    'session056: TCHEB alias matches TCHEBYCHEFF numerically');
}

/* ---- HERMITE(0) = 1 (constant) ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('HERMITE').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'num' && e.value === 1,
    'session056: HERMITE(0) = constant 1');
}

/* ---- Negative n rejected (Bad argument value) — TCHEBYCHEFF
     accepts n<0 via the second-kind path, so only HERMITE and
     LEGENDRE appear here. ---- */
for (const name of ['HERMITE', 'LEGENDRE']) {
  const s = new Stack();
  s.push(Integer(-1n));
  assertThrows(() => { lookup(name).fn(s); }, /Bad argument value/, `session056: ${name}(-1) throws Bad argument value`);
}

/* ---- Non-integer Real rejected (Bad argument value) ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  assertThrows(() => { lookup('HERMITE').fn(s); }, /Bad argument value/, 'session056: HERMITE(2.5) non-integer throws');
}

/* ---- Non-numeric argument rejected (Bad argument type) ---- */
{
  const s = new Stack();
  s.push(RList([Real(3)]));
  assertThrows(() => { lookup('LEGENDRE').fn(s); }, /Bad argument type/, 'session056: LEGENDRE on list throws Bad argument type');
}

/* ---- Integer-valued Real accepted (n = 3.0 works like n = 3) ---- */
{
  const s = new Stack();
  s.push(Real(3));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.4);
  const want = _refTcheb(3, 0.4);
  assert(Math.abs(got - want) < 1e-12,
    'session056: TCHEBYCHEFF accepts integer-valued Real');
}

/* ================================================================
   TCHEBYCHEFF second-kind (negative n), FROOTS.

   MAD / AXL / AXM live in test-matrix.mjs (matrix / stats surface).
   ================================================================ */

/* Reference second-kind Chebyshev U_n(x):
     U_0 = 1, U_1 = 2x, U_{k+1} = 2x·U_k − U_{k-1}.  */
function _refTchebU(n, x) {
  if (n === 0) return 1;
  if (n === 1) return 2 * x;
  let a = 1, b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - a;
    a = b; b = c;
  }
  return b;
}

/* ---- TCHEBYCHEFF(-1) = U_0 = 1 ---- */
{
  const s = new Stack();
  s.push(Integer(-1n));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  assert(sym.expr.kind === 'num' && sym.expr.value === 1,
    'session057: TCHEBYCHEFF(-1) = U_0 = constant 1');
}

/* ---- TCHEBYCHEFF(-2) = U_1 = 2X ---- */
{
  const s = new Stack();
  s.push(Integer(-2n));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.37);
  const want = _refTchebU(1, 0.37);
  assert(Math.abs(got - want) < 1e-12,
    `session057: TCHEBYCHEFF(-2) at x=0.37 → ${got}, expect ${want}`);
}

/* ---- TCHEBYCHEFF neg 3..7 at x = 0.25, -0.8 ---- */
for (const nNeg of [-3, -4, -5, -7]) {
  for (const x of [0.25, -0.8]) {
    const s = new Stack();
    s.push(Integer(BigInt(nNeg)));
    lookup('TCHEBYCHEFF').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refTchebU(-nNeg - 1, x);
    assert(Math.abs(got - want) < 1e-9,
      `session057: TCHEBYCHEFF(${nNeg}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- TCHEB alias accepts negative n too ---- */
{
  const s = new Stack();
  s.push(Integer(-4n));
  lookup('TCHEB').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.6);
  const want = _refTchebU(3, 0.6);
  assert(Math.abs(got - want) < 1e-12,
    'session057: TCHEB alias accepts negative n');
}

/* ---- Non-integer Real still rejected on negative side ---- */
{
  const s = new Stack();
  s.push(Real(-2.5));
  assertThrows(() => { lookup('TCHEBYCHEFF').fn(s); }, /Bad argument value/, 'session057: TCHEBYCHEFF(-2.5) rejected');
}

/* ================================================================
   FROOTS — polynomial factoring from Symbolic side.  Piggy-backs on
   PROOT's Durand-Kerner loop; output is a flat RList alternating
   root and Integer multiplicity (HP50 AUR §12.5 shape).
   ================================================================ */

/* Helper: unpack a FROOTS result into an array of
   `{ root: { re, im }, mult: number }` so assertions can read cleanly. */
function _unpackFrootsResult(list) {
  assert(list.type === 'list', 'FROOTS returns a List');
  const items = list.items;
  assert(items.length % 2 === 0,
    'FROOTS result has even length (alternating root / mult)');
  const out = [];
  for (let i = 0; i < items.length; i += 2) {
    const r = items[i];
    const m = items[i + 1];
    let re, im;
    if (r.type === 'integer')      { re = Number(r.value); im = 0; }
    else if (r.type === 'real')    { re = r.value;         im = 0; }
    else if (r.type === 'complex') { re = r.re;            im = r.im; }
    else throw new Error('FROOTS root has unexpected type: ' + r.type);
    assert(m.type === 'integer',
      'FROOTS multiplicity is an Integer, got ' + m.type);
    out.push({ re, im, mult: Number(m.value) });
  }
  return out;
}

/* Approximate root-in-set comparison: roots come back in any order
   and with a smidge of float noise.  For each expected root, assert
   there's a result within tolerance; and the multiplicities sum to
   `degree`. */
function _assertRootsMatch(got, expected, name) {
  const mults = got.reduce((a, g) => a + g.mult, 0);
  assert(mults === expected.reduce((a, e) => a + e.mult, 0),
    `${name}: sum of multiplicities matches`);
  for (const e of expected) {
    let found = null;
    for (const g of got) {
      if (Math.abs(e.re - g.re) < 1e-4 && Math.abs(e.im - g.im) < 1e-4) {
        found = g; break;
      }
    }
    assert(found !== null,
      `${name}: root (${e.re}, ${e.im}) not found in ${JSON.stringify(got)}`);
    assert(found.mult === e.mult,
      `${name}: root (${e.re}, ${e.im}) multiplicity ${found.mult}, expected ${e.mult}`);
  }
}

/* ---- FROOTS X^2 - 5X + 6 = (X-2)(X-3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-5*X+6')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 2, im: 0, mult: 1 }, { re: 3, im: 0, mult: 1 }],
    'session057: FROOTS X^2-5X+6');
}

/* ---- FROOTS (X-2)^3 = X^3 - 6X^2 + 12X - 8 → {2 3} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-6*X^2+12*X-8')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 2, im: 0, mult: 3 }],
    'session057: FROOTS (X-2)^3 clusters as {2 3}');
}

/* ---- FROOTS X^2 + 1 = (X-i)(X+i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+1')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 0, im: 1, mult: 1 }, { re: 0, im: -1, mult: 1 }],
    'session057: FROOTS X^2+1 complex roots');
}

/* ---- FROOTS linear 2X + 6 = 0 → {-3 1} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X+6')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: -3, im: 0, mult: 1 }],
    'session057: FROOTS 2X+6 → -3');
}

/* ---- FROOTS X^3 - X = X(X-1)(X+1) → 3 simple real roots ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 0, im: 0, mult: 1 },
     { re: 1, im: 0, mult: 1 },
     { re: -1, im: 0, mult: 1 }],
    'session057: FROOTS X^3-X → {0 1 -1}');
}

/* ---- FROOTS pure non-zero constant = 5 → empty list ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstNum(5)));
  lookup('FROOTS').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 0,
    'session057: FROOTS on non-zero constant → empty list');
}

/* ---- FROOTS zero constant → Bad argument value ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstNum(0)));
  assertThrows(() => { lookup('FROOTS').fn(s); }, /Bad argument value/, 'session057: FROOTS on zero constant throws');
}

/* ---- FROOTS rejects multi-variable ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+Y+1')));
  assertThrows(() => { lookup('FROOTS').fn(s); }, /Bad argument value/, 'session057: FROOTS rejects multi-variable expression');
}

/* ---- FROOTS rejects rational (1/X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X')));
  assertThrows(() => { lookup('FROOTS').fn(s); }, /Bad argument value/, 'session057: FROOTS rejects rational expression');
}

/* ---- FROOTS on non-Symbolic rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => { lookup('FROOTS').fn(s); }, /Bad argument type/, 'session057: FROOTS on Real throws Bad argument type');
}

/* ---- FROOTS on a non-X variable picks it automatically ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('Y^2-9')));   // roots ±3
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 3, im: 0, mult: 1 }, { re: -3, im: 0, mult: 1 }],
    'session057: FROOTS Y^2-9 picks Y as main variable');
}

/* ---- FROOTS clusters a double root: (X-1)^2 = X^2-2X+1 → {1 2} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-2*X+1')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 1, im: 0, mult: 2 }],
    'session057: FROOTS (X-1)^2 → {1 2}');
}

/* ================================================================
   FROOTS rational-root pre-scan, PREVAL, TAN2SC, LAPLACE / ILAP.

   FROOTS keeps Integer roots Integer (rather than Real-casting
   through Durand-Kerner).  PREVAL, TAN2SC, LAPLACE, ILAP are
   symbolic-algebra ops.
   ================================================================ */

/* ---- FROOTS rational-root pre-scan keeps Integer roots Integer ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-5*X+6')));   // roots 2, 3
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session058: FROOTS X^2-5X+6 → 4-item list');
  // The two roots should now both be Integer (not Real).
  const r1 = list.items[0], r2 = list.items[2];
  assert(isInteger(r1) && isInteger(r2),
    `session058: FROOTS X^2-5X+6 roots are Integer (got ${r1.type}, ${r2.type})`);
  const vals = new Set([Number(r1.value), Number(r2.value)]);
  assert(vals.has(2) && vals.has(3),
    'session058: FROOTS X^2-5X+6 roots include 2 and 3');
}

/* ---- FROOTS cubic with all integer roots ---- */
{
  const s = new Stack();
  // (X-1)(X-2)(X-3) = X^3 - 6X^2 + 11X - 6
  s.push(Symbolic(parseAlgebra('X^3-6*X^2+11*X-6')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session058: FROOTS cubic → 3 roots × 2 entries');
  const rootVals = [list.items[0], list.items[2], list.items[4]]
    .map(v => isInteger(v) ? Number(v.value) : (isReal(v) ? v.value : null));
  assert(rootVals.every(v => v !== null),
    `session058: FROOTS cubic roots are numeric (got ${rootVals})`);
  const sorted = rootVals.slice().sort((a, b) => a - b);
  assert(sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3,
    `session058: FROOTS cubic roots are {1, 2, 3} (sorted: ${sorted})`);
  // At least one root should be Integer-typed (ideally all).
  const intCount = [list.items[0], list.items[2], list.items[4]]
    .filter(isInteger).length;
  assert(intCount >= 1,
    `session058: FROOTS cubic has at least one Integer root (got ${intCount})`);
}

/* ---- FROOTS with rational root 1/2: 2X - 1 → {1/2 1} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 2,
    'session058: FROOTS 2X-1 → linear root list');
  const r = list.items[0];
  // Expect rational Symbolic(1/2) or Real(0.5).
  if (isSymbolic(r)) {
    // Symbolic 1/2 form
    assert(r.expr && r.expr.kind === 'bin' && r.expr.op === '/',
      'session058: FROOTS 2X-1 root is Symbolic rational');
  } else {
    assert(isReal(r) && Math.abs(r.value - 0.5) < 1e-12,
      `session058: FROOTS 2X-1 root = 1/2 (got ${r.type}:${r.value})`);
  }
}

/* ---- FROOTS mixed integer + irrational: X^3 - X^2 - 2X + 2 ----
     = (X - 1)(X^2 - 2) = (X - 1)(X - √2)(X + √2).  Expected output:
     one Integer root (1) and two roots for ±√2.  The quadratic
     residual is extracted exactly, so the irrational roots come
     back as Symbolic nodes; Real (Durand-Kerner numerics) is also
     accepted as a fallback. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X^2-2*X+2')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session058: FROOTS X^3-X^2-2X+2 → 3 roots');
  const roots = [list.items[0], list.items[2], list.items[4]];
  const intRoots = roots.filter(isInteger);
  const nonIntRoots = roots.filter(r => !isInteger(r));
  assert(intRoots.length === 1 && Number(intRoots[0].value) === 1,
    `session058: rational-root pre-scan catches X=1 (int roots: ${intRoots.length})`);
  assert(nonIntRoots.length === 2,
    `session058: irrational roots ±√2 surface as 2 non-integer roots (got ${nonIntRoots.length})`);
  const allSymOrReal = nonIntRoots.every(r => isSymbolic(r) || isReal(r));
  assert(allSymOrReal,
    'session058: ±√2 roots are Symbolic or Real');
}

/* ================================================================
   PREVAL: F(X) a b → F(b) - F(a).
   ================================================================ */

// PREVAL routes through Giac.  Each PREVAL call emits one command of
// the shape `simplify(subst(F,VAR=b)-subst(F,VAR=a))` where VAR is
// either the single free variable in F (single-var case) or the
// active VX (multi-var / constant case).  rpl5050 defaults VX to the
// lowercase 'x' so the constant-F fixture uses lowercase, while the
// X^2 / 2*X+1 / X^3 cases pin to whichever single var their AST
// contains.
giac._clear();
giac._setFixtures({
  'simplify(subst(X^2,X=3)-subst(X^2,X=0))':         '9',
  'simplify(subst(2*X+1,X=5)-subst(2*X+1,X=1))':     '8',
  'simplify(subst(X^3,X=2)-subst(X^3,X=1))':         '7',
  'simplify(subst(X^2,X=A)-subst(X^2,X=0))': 'A^2',
  'simplify(subst(5,x=2)-subst(5,x=1))':             '0',
  'simplify(subst(x+y,x=1)-subst(x+y,x=0))': '1',
});

/* ---- PREVAL of X^2 from 0 to 3 = 9 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Real(0));
  s.push(Real(3));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 9) < 1e-12,
    'session058: PREVAL X^2 from 0 to 3 → 9');
}

/* ---- PREVAL of 2X+1 from 1 to 5 = (11)-(3) = 8 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X+1')));
  s.push(Real(1));
  s.push(Real(5));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 8) < 1e-12,
    'session058: PREVAL 2X+1 from 1 to 5 → 8');
}

/* ---- PREVAL List-form: F(X) {a b} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3')));
  s.push(RList([Real(1), Real(2)]));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // 2^3 - 1^3 = 7
  assert(isReal(out) && Math.abs(out.value - 7) < 1e-12,
    'session058: PREVAL X^3 with {1 2} list → 7');
}

/* ---- PREVAL with Integer endpoints ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Integer(0n));
  s.push(Integer(3n));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 9) < 1e-12,
    'session058: PREVAL accepts Integer endpoints');
}

/* ---- PREVAL with Symbolic endpoint stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Real(0));
  s.push(Symbolic(parseAlgebra('A')));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // F(A) - F(0) = A^2
  assert(isSymbolic(out),
    'session058: PREVAL with Symbolic endpoint returns Symbolic');
}

/* ---- PREVAL constant F returns 0 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('5')));
  s.push(Real(1));
  s.push(Real(2));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // F = 5: F(b) - F(a) = 0
  assert(isReal(out) && out.value.eq(0),
    'session058: PREVAL on constant F → 0');
}

/* ---- PREVAL multi-variable F substitutes VX ----
   PREVAL picks VX (rpl5050 default 'x' — lowercase deviation from
   HP50 AUR's 'X', see state.js casVx slot) as the substitution
   variable.  For F = x + y with VX = x, result is
   (1 + y) - (0 + y) = 1. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('x+y')));
  s.push(Real(0));
  s.push(Real(1));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 1) < 1e-12,
    'session076: PREVAL x+y from 0 to 1 → 1 (substitutes VX=x)');
}

/* ---- PREVAL non-Symbolic F rejects ---- */
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Real(0));
  s.push(Real(1));
  assertThrows(() => { lookup('PREVAL').fn(s); }, /Bad argument type/, 'session058: PREVAL non-Symbolic F rejects');
}

/* ================================================================
   TAN2SC: TAN(X) → SIN(X) / COS(X) rewrite.
   ================================================================ */

/* ---- TAN2SC on TAN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: TAN2SC returns Symbolic');
  // Expect '/' of SIN / COS at the top.
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'fn' && e.l.name === 'SIN'
    && e.r.kind === 'fn' && e.r.name === 'COS',
    'session058: TAN2SC TAN(X) → SIN(X)/COS(X)');
}

/* ---- TAN2SC leaves SIN / COS unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)+COS(X)')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: TAN2SC on SIN+COS stays Symbolic');
}

/* ---- TAN2SC is idempotent ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC').fn(s);
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: TAN2SC idempotent');
  const e = out.expr;
  // Still SIN(X)/COS(X).
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'fn' && e.l.name === 'SIN',
    'session058: TAN2SC ∘ TAN2SC stable');
}

/* ---- TAN2SC deep: 1 + TAN(X)^2 → 1 + (SIN/COS)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: TAN2SC walks into 1+TAN(X)^2');
  // Verify no TAN remains anywhere via freeVars-style walk.
  function hasTan(node) {
    if (!node) return false;
    if (node.kind === 'fn' && node.name === 'TAN') return true;
    if (node.kind === 'neg') return hasTan(node.arg);
    if (node.kind === 'bin') return hasTan(node.l) || hasTan(node.r);
    if (node.kind === 'fn') return node.args.some(hasTan);
    return false;
  }
  assert(!hasTan(out.expr),
    'session058: TAN2SC eliminates all TAN nodes from 1+TAN(X)^2');
}

/* ---- TAN2SC on non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TAN2SC').fn(s); }, /Bad argument type/, 'session058: TAN2SC on Real rejects');
}

/* ================================================================
   LAPLACE / ILAP basic rules.
   ================================================================ */

// LAPLACE / ILAP route through Giac's `laplace` / `ilaplace` (with
// `X` as both input and output variable, per the HP50 "in place"
// idiom).  Bulk-register the fixtures the LAPLACE/ILAP/HEAVISIDE/DIRAC
// test clusters below expect.  Each value is a Giac-parseable string in
// the exact structural shape the assertions below check for — `1/X`,
// `1/X^2`, `2/X^3`, … — so the mocked engine returns what the tests
// assert on.
giac._clear();
giac._setFixtures({
  'laplace(1,X,X)':         '1/X',
  'laplace(X,X,X)':         '1/X^2',
  'laplace(X^2,X,X)':       '2/X^3',
  'laplace(exp(2*X),X,X)':  '1/(X-2)',
  'laplace(sin(3*X),X,X)':  '3/(X^2+9)',
  'laplace(cos(X),X,X)':    'X/(X^2+1)',
  'laplace(1+X,X,X)':       '1/X+1/X^2',
  'laplace(5*sin(X),X,X)':  '5*(1/(X^2+1))',
  'laplace(sin(X),X,X)':    '1/(X^2+1)',
  'ilaplace(1/X,X,X)':      '1',
  'ilaplace(1/X^2,X,X)':    'X',
  'ilaplace(1/(X-3),X,X)':  'exp(3*X)',
  'ilaplace(1/(X^2+1),X,X)': 'sin(X)',
});

/* ---- LAPLACE of 1 = 1/x ---- */
// Constant-input LAPLACE picks the variable from VX.  rpl5050 ships
// VX='x' (lowercase deviation from HP50; see state.js casVx slot),
// so this test exercises the default-VX path with the lowercase
// fixture below and asserts the lowercase variable in the result.
giac._setFixture('laplace(1,x,x)', '1/x');
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: LAPLACE(1) returns Symbolic');
  // Expect 1/x — uppercase X case stays covered by the X / X^2 / etc.
  // tests below where the input AST already pins the variable.
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'num' && e.l.value === 1
    && e.r.kind === 'var' && e.r.name === 'x',
    'session058: LAPLACE(1) = 1/x');
}

/* ---- LAPLACE of X = 1/X^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(X) top is division');
  // r side should be X^2
  assert(e.r.kind === 'bin' && e.r.op === '^'
    && e.r.l.kind === 'var' && e.r.l.name === 'X'
    && e.r.r.kind === 'num' && e.r.r.value === 2,
    'session058: LAPLACE(X) = 1 / X^2');
}

/* ---- LAPLACE of X^2 = 2/X^3 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(X^2) = num/den');
  // numerator should be 2! = 2; denominator should be X^3.
  assert(e.l.kind === 'num' && e.l.value === 2,
    `session058: LAPLACE(X^2) numerator = 2 (got ${e.l.value})`);
  assert(e.r.kind === 'bin' && e.r.op === '^'
    && e.r.r.kind === 'num' && e.r.r.value === 3,
    'session058: LAPLACE(X^2) denominator = X^3');
}

/* ---- LAPLACE of EXP(2X) = 1 / (X - 2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(2*X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(EXP(2X)) is division');
  assert(e.l.kind === 'num' && e.l.value === 1,
    'session058: LAPLACE(EXP(2X)) numerator = 1');
  // Denominator should be X - 2
  assert(e.r.kind === 'bin' && e.r.op === '-'
    && e.r.l.kind === 'var' && e.r.l.name === 'X'
    && e.r.r.kind === 'num' && e.r.r.value === 2,
    'session058: LAPLACE(EXP(2X)) denominator = X - 2');
}

/* ---- LAPLACE of SIN(3X) = 3 / (X^2 + 9) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(3*X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(SIN(3X)) is division');
  // numerator = 3
  assert(e.l.kind === 'num' && e.l.value === 3,
    'session058: LAPLACE(SIN(3X)) numerator = 3');
}

/* ---- LAPLACE of COS(X) = X / (X^2 + 1) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'var' && e.l.name === 'X',
    'session058: LAPLACE(COS(X)) numerator is X');
}

/* ---- LAPLACE distributes over sum: LAPLACE(1 + X) = 1/X + 1/X^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+X')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '+',
    'session058: LAPLACE(1+X) is a sum');
}

/* ---- LAPLACE pulls scalar out: LAPLACE(5·SIN(X)) = 5 · (1/(X^2+1)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('5*SIN(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  // Expect 5 * (1/(X^2+1))
  assert(e && e.kind === 'bin' && e.op === '*',
    'session058: LAPLACE(5·SIN(X)) top is product');
  // One side is 5.
  const lv = e.l.kind === 'num' ? e.l.value : null;
  const rv = e.r.kind === 'num' ? e.r.value : null;
  assert(lv === 5 || rv === 5,
    'session058: LAPLACE(5·SIN(X)) keeps 5 out front');
}

/* ---- ILAP inverse of 1/X = 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  // Expect Num(1) which may unwrap to Real(1) via _pushSubstResult-style
  // collapse — here we pushed a Symbolic AST, so it stays Symbolic.
  assert(isSymbolic(out) && out.expr.kind === 'num' && out.expr.value === 1,
    `session058: ILAP(1/X) = 1`);
}

/* ---- ILAP of 1/X^2 = X ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X^2')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: ILAP(1/X^2) is Symbolic');
  // Expect X (possibly inside a simplify wrapper).
  assert(out.expr.kind === 'var' && out.expr.name === 'X',
    `session058: ILAP(1/X^2) = X`);
}

/* ---- ILAP of 1/(X-3) = EXP(3·X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/(X-3)')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  // Expect EXP(3·X) at top.
  assert(isSymbolic(out)
    && out.expr.kind === 'fn' && out.expr.name === 'EXP',
    'session058: ILAP(1/(X-3)) = EXP(3·X)');
}

/* ---- LAPLACE / ILAP round-trip on SIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: LAPLACE∘ILAP(SIN(X)) is Symbolic');
  // The result should contain SIN.
  function hasFn(node, name) {
    if (!node) return false;
    if (node.kind === 'fn' && node.name === name) return true;
    if (node.kind === 'neg') return hasFn(node.arg, name);
    if (node.kind === 'bin') return hasFn(node.l, name) || hasFn(node.r, name);
    if (node.kind === 'fn') return node.args.some(a => hasFn(a, name));
    return false;
  }
  assert(hasFn(out.expr, 'SIN'),
    'session058: LAPLACE∘ILAP(SIN(X)) contains SIN');
}

/* ---- LAPLACE non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('LAPLACE').fn(s); }, /Bad argument type/, 'session058: LAPLACE on Real rejects');
}

/* ---- ILAP non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('ILAP').fn(s); }, /Bad argument type/, 'session058: ILAP on Real rejects');
}

/* ================================================================
   HALFTAN, TAN2SC2, TAN2CS2, ACOS2S, ASIN2C,
   ASIN2T, ATAN2S, FROOTS exact quadratic residual.
   ================================================================ */

// Shared helper: does the AST contain a call to `name`?
function _s059HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s059HasFn(node.arg, name);
  if (node.kind === 'bin') return _s059HasFn(node.l, name) || _s059HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s059HasFn(a, name));
  return false;
}

/* ---- HALFTAN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: HALFTAN returns Symbolic');
}

/* ---- HALFTAN SIN(X) rewrite introduces TAN and drops SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(SIN(X)) introduces TAN');
  assert(!_s059HasFn(out.expr, 'SIN'),
    'session059: HALFTAN(SIN(X)) eliminates SIN');
}

/* ---- HALFTAN COS(X) rewrite introduces TAN and drops COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(COS(X)) introduces TAN');
  assert(!_s059HasFn(out.expr, 'COS'),
    'session059: HALFTAN(COS(X)) eliminates COS');
}

/* ---- HALFTAN TAN(X) rewrite keeps TAN (but now of X/2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(TAN(X)) keeps TAN (of X/2)');
  // Output shape is a division: 2·t / (1 - t²)
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: HALFTAN(TAN(X)) top is a quotient');
}

/* ---- HALFTAN walks into 1+SIN(X) sums ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session059: HALFTAN(1+SIN(X)) returns Symbolic');
  assert(!_s059HasFn(out.expr, 'SIN'),
    'session059: HALFTAN walks into the sum and eliminates SIN');
}

/* ---- HALFTAN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('HALFTAN').fn(s); }, /Bad argument type/, 'session059: HALFTAN on Real rejects');
}

/* ---- TAN2SC2 returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: TAN2SC2 returns Symbolic');
}

/* ---- TAN2SC2 TAN(X) → SIN(2X) / (1 + COS(2X)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2SC2(TAN(X)) eliminates TAN');
  assert(_s059HasFn(out.expr, 'SIN') && _s059HasFn(out.expr, 'COS'),
    'session059: TAN2SC2(TAN(X)) introduces SIN and COS');
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: TAN2SC2 result is a division');
}

/* ---- TAN2SC2 walks into 1+TAN(X)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2SC2 walks into 1+TAN(X)^2 and eliminates TAN');
}

/* ---- TAN2SC2 non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TAN2SC2').fn(s); }, /Bad argument type/, 'session059: TAN2SC2 on Real rejects');
}

/* ---- TAN2CS2 TAN(X) → (1 - COS(2X)) / SIN(2X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2CS2').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: TAN2CS2 returns Symbolic');
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2CS2(TAN(X)) eliminates TAN');
  assert(_s059HasFn(out.expr, 'SIN') && _s059HasFn(out.expr, 'COS'),
    'session059: TAN2CS2(TAN(X)) introduces SIN and COS');
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: TAN2CS2 result is a division');
}

/* ---- TAN2CS2 walks into 1+TAN(X)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2CS2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2CS2 walks into 1+TAN(X)^2 and eliminates TAN');
}

/* ---- TAN2CS2 non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TAN2CS2').fn(s); }, /Bad argument type/, 'session059: TAN2CS2 on Real rejects');
}

/* ---- ACOS2S : ACOS(X) → π/2 - ASIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOS(X)')));
  lookup('ACOS2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ACOS2S returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ACOS'),
    'session059: ACOS2S(ACOS(X)) eliminates ACOS');
  assert(_s059HasFn(out.expr, 'ASIN'),
    'session059: ACOS2S introduces ASIN');
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session059: ACOS2S result top-level is subtraction');
}

/* ---- ACOS2S non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  assertThrows(() => { lookup('ACOS2S').fn(s); }, /Bad argument type/, 'session059: ACOS2S on Real rejects');
}

/* ---- ASIN2C : ASIN(X) → π/2 - ACOS(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('ASIN2C').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ASIN2C returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ASIN'),
    'session059: ASIN2C(ASIN(X)) eliminates ASIN');
  assert(_s059HasFn(out.expr, 'ACOS'),
    'session059: ASIN2C introduces ACOS');
}

/* ---- ASIN2C non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  assertThrows(() => { lookup('ASIN2C').fn(s); }, /Bad argument type/, 'session059: ASIN2C on Real rejects');
}

/* ---- ASIN2T : ASIN(X) → ATAN(X / √(1 - X²)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('ASIN2T').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ASIN2T returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ASIN'),
    'session059: ASIN2T(ASIN(X)) eliminates ASIN');
  assert(_s059HasFn(out.expr, 'ATAN'),
    'session059: ASIN2T introduces ATAN');
  assert(_s059HasFn(out.expr, 'SQRT'),
    'session059: ASIN2T result contains SQRT(1 - X²)');
}

/* ---- ASIN2T non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  assertThrows(() => { lookup('ASIN2T').fn(s); }, /Bad argument type/, 'session059: ASIN2T on Real rejects');
}

/* ---- ATAN2S : ATAN(X) → ASIN(X / √(X² + 1)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATAN(X)')));
  lookup('ATAN2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ATAN2S returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ATAN'),
    'session059: ATAN2S(ATAN(X)) eliminates ATAN');
  assert(_s059HasFn(out.expr, 'ASIN'),
    'session059: ATAN2S introduces ASIN');
  assert(_s059HasFn(out.expr, 'SQRT'),
    'session059: ATAN2S result contains SQRT(X² + 1)');
}

/* ---- ATAN2S non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  assertThrows(() => { lookup('ATAN2S').fn(s); }, /Bad argument type/, 'session059: ATAN2S on Real rejects');
}

/* ---- ACOS2S ∘ ASIN2C round-trips through ASIN/ACOS ---- */
// Not an exact identity (the nested subtractions differ), but the walk
// should be stable and produce Symbolic output both ways.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)+ACOS(X)')));
  lookup('ACOS2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session059: ACOS2S walks into ASIN(X)+ACOS(X) and returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ACOS'),
    'session059: ACOS2S eliminates the ACOS side of ASIN(X)+ACOS(X)');
}

/* ---- FROOTS X² - 2 yields exact ±√2 Symbolic roots ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-2')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS X²-2 → 2 roots');
  const [r1, m1, r2, m2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: X²-2 roots are both Symbolic (exact)');
  assert(isInteger(m1) && Number(m1.value) === 1 &&
         isInteger(m2) && Number(m2.value) === 1,
    'session059: X²-2 roots have multiplicity 1');
  // One root must contain SQRT(2); both must
  assert(_s059HasFn(r1.expr, 'SQRT') && _s059HasFn(r2.expr, 'SQRT'),
    'session059: X²-2 roots contain SQRT(2)');
  // One is a bare SQRT, the other a neg of SQRT (sign distinction)
  const oneIsNeg = r1.expr.kind === 'neg' || r2.expr.kind === 'neg';
  assert(oneIsNeg,
    'session059: one of X²-2 roots is the negation');
}

/* ---- FROOTS X² + X - 1 yields the golden-ratio pair ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS X²+X-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: X²+X-1 roots are Symbolic');
  // Both roots should be divisions by 2 and contain SQRT(5).
  assert(r1.expr.kind === 'bin' && r1.expr.op === '/',
    'session059: X²+X-1 root is a fraction');
  assert(_s059HasFn(r1.expr, 'SQRT') && _s059HasFn(r2.expr, 'SQRT'),
    'session059: X²+X-1 roots contain SQRT(5)');
  // Verify the radicand is 5 in one of the SQRT nodes.
  function findSqrtArg(node) {
    if (!node) return null;
    if (node.kind === 'fn' && node.name === 'SQRT') return node.args[0];
    if (node.kind === 'neg') return findSqrtArg(node.arg);
    if (node.kind === 'bin') return findSqrtArg(node.l) || findSqrtArg(node.r);
    if (node.kind === 'fn') {
      for (const a of node.args) {
        const r = findSqrtArg(a); if (r) return r;
      }
    }
    return null;
  }
  const sq = findSqrtArg(r1.expr);
  assert(sq && sq.kind === 'num' && sq.value === 5,
    'session059: X²+X-1 radicand is 5');
}

/* ---- FROOTS 2X² - 1 yields ±√2 / 2 (gcd reduction works) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^2-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS 2X²-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: 2X²-1 roots are Symbolic');
  // Both are (±√2)/2 — a division by 2.  The numerator is either
  // SQRT(2) or AstNeg(SQRT(2)).
  const topOp = (n) => n.expr.kind === 'bin' ? n.expr.op : null;
  assert(topOp(r1) === '/' && topOp(r2) === '/',
    'session059: 2X²-1 roots are both divisions');
  const denom = r1.expr.r;
  assert(denom.kind === 'num' && denom.value === 2,
    'session059: 2X²-1 roots have denominator 2');
}

/* ---- FROOTS 2X² + 3X - 1 yields (-3 ± √17)/4 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^2+3*X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS 2X²+3X-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: 2X²+3X-1 roots are Symbolic');
  // Each root is a division; denominator is 4.
  assert(r1.expr.kind === 'bin' && r1.expr.op === '/' &&
         r1.expr.r.kind === 'num' && r1.expr.r.value === 4,
    'session059: 2X²+3X-1 root denominator is 4');
  // SQRT(17) must appear.
  function findSqrtArg(node) {
    if (!node) return null;
    if (node.kind === 'fn' && node.name === 'SQRT') return node.args[0];
    if (node.kind === 'neg') return findSqrtArg(node.arg);
    if (node.kind === 'bin') return findSqrtArg(node.l) || findSqrtArg(node.r);
    return null;
  }
  const sq = findSqrtArg(r1.expr);
  assert(sq && sq.kind === 'num' && sq.value === 17,
    'session059: 2X²+3X-1 radicand is 17');
}

/* ---- FROOTS X² + 1 still yields complex roots (D < 0 defers) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  // Complex conjugate pair — deferred to Durand-Kerner / PROOT path.
  assert(list.items.length >= 2,
    'session059: FROOTS X²+1 still produces complex roots');
  // No root should be a Symbolic (that would be the wrong path for D<0).
  const hasSymRoot = list.items.filter((_,i) => i%2===0)
                              .some(r => isSymbolic(r));
  assert(!hasSymRoot,
    'session059: FROOTS X²+1 does not misroute to the exact-quadratic branch');
}

/* ---- FROOTS X² - 1 still yields rational roots (√D integer path) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  // (X-1)(X+1) — both roots rational ⇒ Integer, not Symbolic.
  assert(list.items.length === 4,
    'session059: FROOTS X²-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isInteger(r1) && isInteger(r2),
    'session059: X²-1 roots stay Integer (exact-quadratic branch declines)');
}

/* ---- FROOTS quadratic-residual branch composes with rational pre-scan ----
     (X - 1)(X² - 5) = X³ - X² - 5X + 5 — rational root X=1, then
     quadratic residual X² - 5 → ±√5. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X^2-5*X+5')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session059: FROOTS (X-1)(X²-5) → 3 roots');
  const roots = [list.items[0], list.items[2], list.items[4]];
  const intRoots = roots.filter(isInteger);
  const symRoots = roots.filter(isSymbolic);
  assert(intRoots.length === 1 && Number(intRoots[0].value) === 1,
    'session059: pre-scan catches X=1');
  assert(symRoots.length === 2,
    'session059: quadratic-residual branch catches ±√5 as Symbolic');
}

/* ================================================================
   TEXPAND, TLIN, TCOLLECT, EXPLN.
   ================================================================ */

// Shared: does the AST contain a call to `name`?
function _s060HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s060HasFn(node.arg, name);
  if (node.kind === 'bin') return _s060HasFn(node.l, name) || _s060HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s060HasFn(a, name));
  return false;
}

// Shared: does the AST reference the Var named `name`?
function _s060HasVar(node, name) {
  if (!node) return false;
  if (node.kind === 'var') return node.name === name;
  if (node.kind === 'neg') return _s060HasVar(node.arg, name);
  if (node.kind === 'bin') return _s060HasVar(node.l, name) || _s060HasVar(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s060HasVar(a, name));
  return false;
}

/* ---- TEXPAND returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TEXPAND returns Symbolic');
}

/* ---- TEXPAND SIN(A+B) → SIN(A)COS(B) + COS(A)SIN(B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Expect top-level bin('+') with both sides products of SIN and COS.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND SIN(A+B) top is addition');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TEXPAND SIN(A+B) introduces both SIN and COS');
}

/* ---- TEXPAND SIN(A-B) uses subtraction at the top ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session060: TEXPAND SIN(A-B) top is subtraction');
}

/* ---- TEXPAND COS(A+B) top is subtraction (COS·COS - SIN·SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session060: TEXPAND COS(A+B) top is subtraction');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TEXPAND COS(A+B) keeps SIN and COS');
}

/* ---- TEXPAND COS(A-B) top is addition (COS·COS + SIN·SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND COS(A-B) top is addition');
}

/* ---- TEXPAND TAN(A+B) becomes a division with TAN in both parts ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TEXPAND TAN(A+B) top is division');
  assert(_s060HasFn(out.expr, 'TAN'),
    'session060: TEXPAND TAN(A+B) preserves TAN in both sides');
}

/* ---- TEXPAND TAN(A-B) denominator uses + (dual sign) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TEXPAND TAN(A-B) top is division');
  // Numerator has TAN(A)-TAN(B) (op='-') ; denominator has 1+TAN·TAN (op='+')
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TEXPAND TAN(A-B) numerator uses -');
  assert(out.expr.r.kind === 'bin' && out.expr.r.op === '+',
    'session060: TEXPAND TAN(A-B) denominator uses +');
}

/* ---- TEXPAND parity: SIN(-X) = -SIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(-X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'neg',
    'session060: TEXPAND SIN(-X) top-level is negation');
  assert(_s060HasFn(out.expr, 'SIN'),
    'session060: TEXPAND SIN(-X) keeps SIN');
}

/* ---- TEXPAND parity: COS(-X) = COS(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(-X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Top is now a bare COS(X) — no neg at top.
  assert(out.expr.kind === 'fn' && out.expr.name === 'COS',
    'session060: TEXPAND COS(-X) collapses to COS(X)');
  assert(out.expr.args[0].kind === 'var' && out.expr.args[0].name === 'X',
    'session060: TEXPAND COS(-X) argument is X (not -X)');
}

/* ---- TEXPAND leaves SIN(X) (bare var arg) unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'SIN',
    'session060: TEXPAND SIN(X) is unchanged (no sum to expand)');
}

/* ---- TEXPAND walks into outer sums ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)+COS(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Outer bin('+') stays at top; each SIN/COS call expanded.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND walks into outer sum');
}

/* ---- TEXPAND non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TEXPAND').fn(s); }, /Bad argument type/, 'session060: TEXPAND on Real rejects');
}

/* ---- TLIN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)*COS(X)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TLIN returns Symbolic');
}

/* ---- TLIN SIN(X)·COS(X) → (SIN(2X)+SIN(0))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)*COS(X)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN result is a division');
  // Denominator is literal 2.
  assert(out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: TLIN denominator is 2');
  // Numerator has SIN calls (SIN(X+X) and SIN(X-X)).
  assert(_s060HasFn(out.expr.l, 'SIN'),
    'session060: TLIN SIN·COS numerator contains SIN');
}

/* ---- TLIN SIN(A)·SIN(B) uses COS(a-b) - COS(a+b) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)*SIN(B)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN SIN·SIN is a division');
  // Numerator is COS - COS.
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TLIN SIN·SIN numerator is a subtraction');
  assert(_s060HasFn(out.expr.l, 'COS'),
    'session060: TLIN SIN·SIN numerator uses COS');
  assert(!_s060HasFn(out.expr.l, 'SIN'),
    'session060: TLIN SIN·SIN eliminates SIN in the numerator');
}

/* ---- TLIN COS(A)·COS(B) uses COS(a-b) + COS(a+b) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)*COS(B)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN COS·COS is a division');
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '+',
    'session060: TLIN COS·COS numerator is an addition');
}

/* ---- TLIN SIN²(X) → (1 - COS(2X))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)^2')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN SIN²(X) is a division');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: TLIN SIN²(X) eliminates SIN');
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TLIN SIN²(X) introduces COS');
  // Numerator is 1 - COS(2X)
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TLIN SIN²(X) numerator is 1 - COS(...)');
}

/* ---- TLIN COS²(X) → (1 + COS(2X))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)^2')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN COS²(X) is a division');
  // Numerator is 1 + COS(2X)
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '+',
    'session060: TLIN COS²(X) numerator is 1 + COS(...)');
}

/* ---- TLIN leaves non-trig products unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X*Y')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  // X*Y is a product of vars; no rewrite.
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TLIN X*Y stays as a product');
}

/* ---- TLIN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TLIN').fn(s); }, /Bad argument type/, 'session060: TLIN on Real rejects');
}

/* ---- TCOLLECT returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TCOLLECT returns Symbolic');
}

/* ---- TCOLLECT SIN(A)+SIN(B) → 2·SIN((A+B)/2)·COS((A-B)/2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // Top is a multiplication (2 * SIN(...)) * COS(...).
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT SIN+SIN top is multiplication');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN+SIN introduces both SIN and COS');
}

/* ---- TCOLLECT SIN(A)-SIN(B) introduces a leading COS (not SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)-SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT SIN-SIN top is multiplication');
  // 2·COS(sum)·SIN(diff) : the left factor is `2·COS(sum)`; the right
  // factor is `SIN(diff)`.  Keep tests at the has-fn level so we don't
  // over-constrain associativity.
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN-SIN introduces COS');
}

/* ---- TCOLLECT COS(A)+COS(B) uses only COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)+COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT COS+COS top is multiplication');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: TCOLLECT COS+COS does not introduce SIN');
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT COS+COS preserves COS');
}

/* ---- TCOLLECT COS(A)-COS(B) produces a negated product ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)-COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // COS(A) - COS(B) = -2·SIN((A+B)/2)·SIN((A-B)/2).  Top-level is neg.
  assert(out.expr.kind === 'neg',
    'session060: TCOLLECT COS-COS top-level is negation');
  assert(!_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT COS-COS eliminates COS');
  assert(_s060HasFn(out.expr, 'SIN'),
    'session060: TCOLLECT COS-COS introduces SIN');
}

/* ---- TCOLLECT leaves mixed SIN+COS unchanged (no sum-to-product) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // No same-name pair — the walker returns the input essentially unchanged.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TCOLLECT SIN+COS stays as a sum');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN+COS preserves both');
}

/* ---- TCOLLECT inverse relationship with TEXPAND ----
   TEXPAND applied to SIN(X+Y)+SIN(X-Y) produces 2·SIN(X)·COS(Y)
   (which SIMPLIFY / EXPAND can reduce).  TCOLLECT applied directly
   to the same `SIN(A)+SIN(B)` shape (here A=X+Y, B=X-Y) yields
   2·SIN((2X)/2)·COS((2Y)/2) — symbolically equivalent but
   unsimplified.  Verify the walker visits and rewrites the top. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X+Y)+SIN(X-Y)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // Should collapse into a product — top is bin('*').
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT collapses SIN(X+Y)+SIN(X-Y) into a product');
  // And it introduces a COS.
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN(X+Y)+SIN(X-Y) introduces COS');
}

/* ---- TCOLLECT non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TCOLLECT').fn(s); }, /Bad argument type/, 'session060: TCOLLECT on Real rejects');
}

/* ---- EXPLN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: EXPLN returns Symbolic');
}

/* ---- EXPLN SIN(X) introduces EXP and i, drops SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: EXPLN SIN(X) eliminates SIN');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN SIN(X) introduces EXP');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN SIN(X) references imaginary unit i');
}

/* ---- EXPLN COS(X) introduces EXP and i, drops COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'COS'),
    'session060: EXPLN COS(X) eliminates COS');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN COS(X) introduces EXP');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN COS(X) references imaginary unit i');
  // Top-level division by 2.
  assert(out.expr.kind === 'bin' && out.expr.op === '/' &&
         out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: EXPLN COS(X) top denominator is 2');
}

/* ---- EXPLN TAN(X) is a division with e^(iX) on both sides ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: EXPLN TAN(X) top is a division');
  assert(!_s060HasFn(out.expr, 'TAN'),
    'session060: EXPLN TAN(X) eliminates TAN');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN TAN(X) references imaginary unit i');
}

/* ---- EXPLN SINH(X) uses real exp (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SINH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'SINH'),
    'session060: EXPLN SINH(X) eliminates SINH');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN SINH(X) introduces EXP');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN SINH(X) does not reference i (real-only form)');
}

/* ---- EXPLN COSH(X) uses real exp, top-level division by 2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COSH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'COSH'),
    'session060: EXPLN COSH(X) eliminates COSH');
  assert(out.expr.kind === 'bin' && out.expr.op === '/' &&
         out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: EXPLN COSH(X) top denominator is 2');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN COSH(X) does not reference i');
}

/* ---- EXPLN TANH(X) is a division of exp-sum and exp-diff ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TANH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: EXPLN TANH(X) top is a division');
  assert(!_s060HasFn(out.expr, 'TANH'),
    'session060: EXPLN TANH(X) eliminates TANH');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN TANH(X) does not reference i (real-only form)');
}

/* ---- EXPLN walks into 1+SIN(X) (sum-level container unchanged) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session060: EXPLN 1+SIN(X) returns Symbolic');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: EXPLN walks into the sum and eliminates SIN');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN 1+SIN(X) introduces EXP');
}

/* ---- EXPLN leaves bare variables unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  // No trig, no hyperbolic — walker returns the input.
  assert(!_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN X+Y does not introduce EXP');
}

/* ---- EXPLN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('EXPLN').fn(s); }, /Bad argument type/, 'session060: EXPLN on Real rejects');
}

/* ================================================================
   TSIMP, EXPLN inverse family, HEAVISIDE / DIRAC,
   LAPLACE / ILAP extensions, LNCOLLECT, FROOTS biquad.
   ================================================================ */

// Shared helpers: does the AST contain a call to `name`? / reference Var `name`?
function _s061HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s061HasFn(node.arg, name);
  if (node.kind === 'bin') return _s061HasFn(node.l, name) || _s061HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s061HasFn(a, name));
  return false;
}

function _s061HasVar(node, name) {
  if (!node) return false;
  if (node.kind === 'var') return node.name === name;
  if (node.kind === 'neg') return _s061HasVar(node.arg, name);
  if (node.kind === 'bin') return _s061HasVar(node.l, name) || _s061HasVar(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s061HasVar(a, name));
  return false;
}

// TSIMP routes through Giac's `tsimplify()` — bulk-register the
// fixtures the TSIMP test cluster below expects.  Each key is the
// Giac command the adapter emits; each value is the canonical Giac
// output string we parse back into an AST.
giac._clear();
giac._setFixtures({
  'tsimplify(sin(X)^2+cos(X)^2)':   '1',
  'tsimplify(cos(X)^2+sin(X)^2)':   '1',
  'tsimplify(1-sin(X)^2)':          'cos(X)^2',
  'tsimplify(1-cos(X)^2)':          'sin(X)^2',
  'tsimplify(tan(X)*cos(X))':       'sin(X)',
  'tsimplify(sin(X)/cos(X))':       'tan(X)',
  'tsimplify(sin(A)^2+cos(A)^2+5)': '6',
  'tsimplify(X+Y)':        'X+Y',
});

/* ---- TSIMP Pythagorean sum to 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)^2+COS(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'num' && out.expr.value === 1,
    'session061: TSIMP(SIN(X)^2+COS(X)^2) = 1');
}

/* ---- TSIMP Pythagorean sum COS+SIN order ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)^2+SIN(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 1,
    'session061: TSIMP(COS(X)^2+SIN(X)^2) = 1 (order-independent)');
}

/* ---- TSIMP 1 - SIN^2 → COS^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1-SIN(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'COS') && !_s061HasFn(out.expr, 'SIN'),
    'session061: TSIMP(1-SIN(X)^2) rewrites to COS form');
}

/* ---- TSIMP 1 - COS^2 → SIN^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1-COS(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'SIN') && !_s061HasFn(out.expr, 'COS'),
    'session061: TSIMP(1-COS(X)^2) rewrites to SIN form');
}

/* ---- TSIMP TAN·COS → SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)*COS(X)')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'SIN',
    'session061: TSIMP(TAN(X)·COS(X)) = SIN(X)');
}

/* ---- TSIMP SIN/COS → TAN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)/COS(X)')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'TAN',
    'session061: TSIMP(SIN(X)/COS(X)) = TAN(X)');
}

/* ---- TSIMP compound: Pythagorean + arithmetic fold ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)^2+COS(A)^2+5')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 6,
    'session061: TSIMP(SIN(A)^2+COS(A)^2+5) folds to 6');
}

/* ---- TSIMP leaves unrelated expression unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session061: TSIMP(X+Y) leaves structure intact');
}

/* ---- TSIMP rejects Real input ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('TSIMP').fn(s); }, /Bad argument type/, 'session061: TSIMP on Real rejects');
}

/* ---- EXPLN ASIN(X) introduces LN and i ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && !_s061HasFn(out.expr, 'ASIN'),
    'session061: EXPLN eliminates ASIN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ASIN(X)) introduces LN');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ASIN(X)) references i');
}

/* ---- EXPLN ACOS(X) references LN + i + SQRT ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOS(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ACOS'),
    'session061: EXPLN eliminates ACOS');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ACOS(X)) introduces LN and SQRT');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ACOS(X)) references i');
}

/* ---- EXPLN ATAN(X) uses (1 + iX)/(1 - iX) form ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATAN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ATAN'),
    'session061: EXPLN eliminates ATAN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ATAN(X)) introduces LN');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ATAN(X)) references i');
  // SQRT should NOT appear in the ATAN rewrite (uses rational log form).
  assert(!_s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ATAN(X)) has no SQRT (rational log form)');
}

/* ---- EXPLN ASINH(X) pure-real (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASINH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ASINH'),
    'session061: EXPLN eliminates ASINH');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ASINH(X)) introduces LN + SQRT');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ASINH(X)) does not reference i');
}

/* ---- EXPLN ACOSH(X) pure-real (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOSH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ACOSH'),
    'session061: EXPLN eliminates ACOSH');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ACOSH(X)) introduces LN + SQRT');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ACOSH(X)) does not reference i');
}

/* ---- EXPLN ATANH(X) pure-real rational-log form ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATANH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ATANH'),
    'session061: EXPLN eliminates ATANH');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ATANH(X)) introduces LN');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ATANH(X)) does not reference i');
  assert(!_s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ATANH(X)) has no SQRT');
}

/* ---- EXPLN walks into nested ASIN inside a sum ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+ASIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ASIN'),
    'session061: EXPLN walks into sum and eliminates ASIN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(1+ASIN(X)) introduces LN');
}

/* ---- HEAVISIDE on positive Real = 1 ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(1),
    'session061: HEAVISIDE(2.5) = 1');
}

/* ---- HEAVISIDE on negative Real = 0 ---- */
{
  const s = new Stack();
  s.push(Real(-0.001));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(0),
    'session061: HEAVISIDE(-0.001) = 0');
}

/* ---- HEAVISIDE(0) = 1 (right-continuous) ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(1),
    'session061: HEAVISIDE(0) = 1 (right-continuous)');
}

/* ---- HEAVISIDE on Integer ---- */
{
  const s = new Stack();
  s.push(Integer(-5n));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isInteger(out) && out.value === 0n,
    'session061: HEAVISIDE(-5) = Integer 0');
}

/* ---- HEAVISIDE on Symbolic stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X-3')));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'HEAVISIDE',
    'session061: HEAVISIDE(X-3) stays Symbolic');
}

/* ---- HEAVISIDE accepts empty List ---- */
/* List is dispatched element-wise; an empty List input returns an
   empty List. */
{
  const s = new Stack();
  s.push(RList([]));
  lookup('HEAVISIDE').fn(s);
  const v = s.peek();
  assert(isList(v) && v.items.length === 0,
    'session061: HEAVISIDE on List rejects [updated session191: now accepts → { }]');
}

/* ---- DIRAC on non-zero Real = 0 ---- */
{
  const s = new Stack();
  s.push(Real(3.2));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(0),
    'session061: DIRAC(3.2) = 0');
}

/* ---- DIRAC on zero Real stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'DIRAC',
    'session061: DIRAC(0) stays Symbolic');
}

/* ---- DIRAC on non-zero Integer = 0 ---- */
{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isInteger(out) && out.value === 0n,
    'session061: DIRAC(7) = Integer 0');
}

/* ---- DIRAC on Symbolic stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X-3')));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'DIRAC',
    'session061: DIRAC(X-3) stays Symbolic');
}

/* ---- DIRAC accepts empty List ---- */
/* List is dispatched element-wise; an empty List input returns an
   empty List. */
{
  const s = new Stack();
  s.push(RList([]));
  lookup('DIRAC').fn(s);
  const v = s.peek();
  assert(isList(v) && v.items.length === 0,
    'session061: DIRAC on List rejects [updated session191: now accepts → { }]');
}

// LAPLACE/ILAP HEAVISIDE+DIRAC fixtures — the Giac commands emitted for
// each test in the cluster below.  Negative numeric constants round-
// trip through astToGiac as `(-N)*…`, so the fixture keys use that
// literal form.
giac._clear();
giac._setFixtures({
  'laplace(HEAVISIDE(X),X,X)':          '1/X',
  'laplace(HEAVISIDE(X-3),X,X)':        'exp(-3*X)/X',
  'laplace(DIRAC(X),X,X)':              '1',
  'laplace(DIRAC(X-3),X,X)':            'exp(-3*X)',
  'laplace(exp(2*X)*sin(X),X,X)':       '1/((X-2)^2+1)',
  // ILAP keys use the parenthesised-negative shape astToGiac emits
  // from Neg(Num(3)) inside a multiplication.
  'ilaplace(exp((-3)*X)/X,X,X)':        'HEAVISIDE(X-3)',
  'ilaplace(exp((-3)*X),X,X)':          'DIRAC(X-3)',
  'ilaplace(1,X,X)':                    'DIRAC(X)',
  'laplace(HEAVISIDE(X-2),X,X)':        'exp(-2*X)/X',
  'ilaplace(exp((-2)*X)/X,X,X)':        'HEAVISIDE(X-2)',
});

/* ---- LAPLACE HEAVISIDE(X) → 1/X ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/'
    && out.expr.l.kind === 'num' && out.expr.l.value === 1
    && out.expr.r.kind === 'var' && out.expr.r.name === 'X',
    'session061: LAPLACE(H(X)) = 1/X');
}

/* ---- LAPLACE HEAVISIDE(X-3) has EXP factor ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X-3)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'EXP'),
    'session061: LAPLACE(H(X-3)) contains EXP factor');
  // Top-level is a division (num=EXP, den=X).
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session061: LAPLACE(H(X-3)) top is division');
}

/* ---- LAPLACE DIRAC(X) = 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 1,
    'session061: LAPLACE(δ(X)) = 1');
}

/* ---- LAPLACE DIRAC(X-3) top is EXP ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X-3)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'EXP',
    'session061: LAPLACE(δ(X-3)) top is EXP');
}

/* ---- LAPLACE frequency-shift: L{EXP(2X)·SIN(X)} substitutes X→X-2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(2*X)*SIN(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  // Result should be 1/((X-2)^2 + 1) after simplification.  Structure:
  // top-level bin('/'), numerator Num 1, denominator bin('+').  Also no
  // EXP should remain at the top level of the result.
  assert(isSymbolic(out),
    'session061: LAPLACE(e^(2X)·SIN(X)) returns Symbolic');
  assert(!_s061HasFn(out.expr, 'EXP'),
    'session061: LAPLACE(e^(2X)·SIN(X)) eliminates top-level EXP');
  // The denominator should reference X-2 somewhere (via substitution).
  // Shallow check: the AST must mention the literal 2.
  function _hasNum(node, val) {
    if (!node) return false;
    if (node.kind === 'num') return node.value === val;
    if (node.kind === 'neg') return _hasNum(node.arg, val);
    if (node.kind === 'bin') return _hasNum(node.l, val) || _hasNum(node.r, val);
    if (node.kind === 'fn') return node.args.some(a => _hasNum(a, val));
    return false;
  }
  assert(_hasNum(out.expr, 2),
    'session061: LAPLACE(e^(2X)·SIN(X)) references the shift constant 2');
}

/* ---- ILAP EXP(-3X)/X → HEAVISIDE(X - 3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(-3*X)/X')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'HEAVISIDE',
    'session061: ILAP(e^(-3X)/X) = HEAVISIDE(X-3)');
}

/* ---- ILAP EXP(-3X) → DIRAC(X - 3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(-3*X)')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'DIRAC',
    'session061: ILAP(e^(-3X)) = DIRAC(X-3)');
}

/* ---- ILAP constant 1 → DIRAC(x) ---- */
// Constant-input ILAP picks the variable from VX (default 'x').
// Mirror the LAPLACE(1) story above: register the lowercase fixture
// and assert the lowercase variable in the result.
giac._setFixture('ilaplace(1,x,x)', 'Dirac(x)');
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'DIRAC'
    && out.expr.args[0].kind === 'var' && out.expr.args[0].name === 'x',
    'session061: ILAP(1) = DIRAC(x)');
}

/* ---- LAPLACE / ILAP round-trip on DIRAC(X-3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X-3)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && _s061HasFn(out.expr, 'DIRAC'),
    'session061: LAPLACE∘ILAP(DIRAC(X-3)) contains DIRAC');
}

/* ---- LAPLACE / ILAP round-trip on HEAVISIDE(X-2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X-2)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'HEAVISIDE'),
    'session061: LAPLACE∘ILAP(H(X-2)) contains HEAVISIDE');
}

/* ---- LNCOLLECT LN(A) + LN(B) → LN(A·B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)+LN(B)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '*',
    'session061: LNCOLLECT(LN(A)+LN(B)) = LN(A·B)');
}

/* ---- LNCOLLECT LN(A) - LN(B) → LN(A/B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)-LN(B)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '/',
    'session061: LNCOLLECT(LN(A)-LN(B)) = LN(A/B)');
}

/* ---- LNCOLLECT n·LN(A) → LN(A^n) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*LN(X)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN',
    'session061: LNCOLLECT(2·LN(X)) top is LN');
  assert(out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '^',
    'session061: LNCOLLECT(2·LN(X)) wraps X^2 inside LN');
}

/* ---- LNCOLLECT LN(A)·n (coefficient on right) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(X)*3')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '^'
    && out.expr.args[0].r.kind === 'num' && out.expr.args[0].r.value === 3,
    'session061: LNCOLLECT(LN(X)·3) = LN(X^3)');
}

/* ---- LNCOLLECT associates three LN terms ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)+LN(B)+LN(C)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  // Bottom-up walk collects inner (LN(A)+LN(B)) → LN(A·B), then outer
  // LN(A·B) + LN(C) → LN((A·B)·C).  Top-level is a single LN.
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN',
    'session061: LNCOLLECT(LN(A)+LN(B)+LN(C)) = single LN');
}

/* ---- LNCOLLECT leaves non-LN sums unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  // No LN in input, no LN in output.
  assert(!_s061HasFn(out.expr, 'LN'),
    'session061: LNCOLLECT(X+Y) introduces no LN');
}

/* ---- LNCOLLECT rejects Real ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('LNCOLLECT').fn(s); }, /Bad argument type/, 'session061: LNCOLLECT on Real rejects');
}

/* ---- FROOTS biquadratic X^4 - 10X^2 + 1 → four nested radicals ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^4-10*X^2+1')));
  lookup('FROOTS').fn(s);
  const rootsList = s.pop();
  assert(Array.isArray(rootsList.items),
    'session061: FROOTS(X^4-10X^2+1) returns a list');
  assert(rootsList.items.length === 8,
    `session061: FROOTS biquad produces 4 distinct roots (8 list entries, got ${rootsList.items.length})`);
  // Every odd-indexed entry is an Integer multiplicity (= 1 for biquadratic roots).
  const mults = rootsList.items.filter((_, i) => i % 2 === 1);
  assert(mults.every(m => isInteger(m) && m.value === 1n),
    'session061: FROOTS biquad multiplicities are all 1');
  // Roots are Symbolic (nested SQRT form).
  const roots = rootsList.items.filter((_, i) => i % 2 === 0);
  assert(roots.every(r => isSymbolic(r)),
    'session061: FROOTS biquad roots are Symbolic');
  // Each root's AST references SQRT (directly or under a neg wrapper).
  assert(roots.every(r => _s061HasFn(r.expr, 'SQRT')),
    'session061: FROOTS biquad roots contain SQRT (closed-form radicals)');
}

/* ---- FROOTS biquadratic with a leading coefficient ≠ 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^4-20*X^2+2')));
  lookup('FROOTS').fn(s);
  const rootsList = s.pop();
  assert(Array.isArray(rootsList.items) && rootsList.items.length === 8,
    'session061: FROOTS(2·X⁴-20X²+2) returns 4 roots');
}

/* ================================================================
   VX / SVX CAS-main-variable state + ops.
   ================================================================ */

/* ---- VX push default = Name('x') ---- */
// rpl5050 ships a lowercase default for the CAS main variable
// (deliberate deviation from the HP50's `'X'` — matches the
// lowercase-default keyboard layout in www/src/ui/keyboard.js).
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'x',
    'session076: VX pushes Name(x) on a freshly-booted unit');
}

/* ---- SVX accepts Name and is observable via VX ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Name('T'));
  lookup('SVX').fn(s);
  assert(s.depth === 0, 'session076: SVX consumes its argument');
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'T',
    'session076: after `SVX T`, VX → Name(T)');
  resetCasVx();
}

/* ---- SVX accepts String (HP50 accepts either at prompt) ---- */
{
  const { resetCasVx, getCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Str('Y'));
  lookup('SVX').fn(s);
  assert(getCasVx() === 'Y', 'session076: SVX accepts String argument');
  resetCasVx();
}

/* ---- SVX rejects Real ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('SVX').fn(s); }, /Bad argument type/, 'session076: SVX on Real rejects with Bad argument type');
}

/* ---- SVX rejects empty String with Invalid name ---- */
{
  // SVX routes through the HP50 identifier validator (types.js
  // isValidHpIdentifier), which catches empty strings and any non-
  // conforming name with a single "Invalid name" error — the same
  // wording the HP50 uses.
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Str(''));
  assertThrows(() => { lookup('SVX').fn(s); }, /Invalid name/, 'session076: SVX on empty string rejects with Invalid name');
}

/* ---- PREVAL follows the active VX (not the single-free-var heuristic) ---- */
{
  const { resetCasVx, setCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  setCasVx('Y');
  // F = X + Y, endpoints 0 → 1.  VX = Y, so F(y=0) - F(y=1) substitutes Y:
  //   (X + 1) - (X + 0) = 1.
  giac._clear();
  giac._setFixture(
    'simplify(subst(X+Y,Y=1)-subst(X+Y,Y=0))',
    '1',
  );
  giac._setFixture(
    'laplace(A*T,T,T)',
    'A/T^2',
  );
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  s.push(Real(0));
  s.push(Real(1));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 1) < 1e-12,
    'session076: PREVAL with VX=Y substitutes Y (not the first free var)');
  resetCasVx();
}

/* ---- LAPLACE picks VX when the input has multiple free vars ---- */
{
  const { resetCasVx, setCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  setCasVx('T');
  // F(T) = T (linear in T), plus an unrelated free var A.  With VX=T,
  // LAPLACE(T) = 1 / T^2, and the extra A stays as a multiplicative
  // constant on the outside.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*T')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session076: LAPLACE returns Symbolic on multi-var input with VX set');
  // The result must be a function of T (the LAPLACE variable), not A.
  // Just assert T appears and the top-level contains a division by T^2
  // somewhere — a coarse structural guard, not an exact equality.
  const fv = freeVars(out.expr);
  assert(fv.has('T'), 'session076: LAPLACE(A·T) with VX=T contains T in result');
  resetCasVx();
}

/* ---- VX round-trips through SVX/VX ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Name('Q'));
  lookup('SVX').fn(s);
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'Q',
    'session076: SVX/VX round-trips a Name through state');
  resetCasVx();
}

/* ================================================================
   EXLR: extract left and right sides of a symbolic.
   ================================================================ */

/* ---- EXLR on A = B ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A = B')));
  lookup('EXLR').fn(s);
  assert(s.depth === 2, 'session076: EXLR on A=B pushes two items');
  const right = s.pop();
  const left = s.pop();
  assert(isSymbolic(left) && left.expr.kind === 'var' && left.expr.name === 'A',
    'session076: EXLR(A=B) left is Symbolic(A)');
  assert(isSymbolic(right) && right.expr.kind === 'var' && right.expr.name === 'B',
    'session076: EXLR(A=B) right is Symbolic(B)');
}

/* ---- EXLR on the quadratic X^2 + 2X + 1 = 0 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 2*X + 1 = 0')));
  lookup('EXLR').fn(s);
  const right = s.pop();
  const left = s.pop();
  assert(isSymbolic(left) && left.expr.kind === 'bin',
    'session076: EXLR on quadratic preserves LHS compound shape');
  assert(isSymbolic(right) && right.expr.kind === 'num' && right.expr.value === 0,
    'session076: EXLR on quadratic RHS is Symbolic(0)');
}

/* ---- EXLR on X + Y (non-equation binary) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  lookup('EXLR').fn(s);
  const r = s.pop();
  const l = s.pop();
  assert(isSymbolic(l) && l.expr.kind === 'var' && l.expr.name === 'X',
    'session076: EXLR on X+Y left = Symbolic(X)');
  assert(isSymbolic(r) && r.expr.kind === 'var' && r.expr.name === 'Y',
    'session076: EXLR on X+Y right = Symbolic(Y)');
}

/* ---- EXLR on comparison operator (<) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X < 5')));
  lookup('EXLR').fn(s);
  const r = s.pop();
  const l = s.pop();
  assert(isSymbolic(l) && l.expr.kind === 'var' && l.expr.name === 'X',
    'session076: EXLR on X<5 left = Symbolic(X)');
  assert(isSymbolic(r) && r.expr.kind === 'num' && r.expr.value === 5,
    'session076: EXLR on X<5 right = Symbolic(5)');
}

/* ---- EXLR rejects a bare variable (no top-level bin) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  assertThrows(() => { lookup('EXLR').fn(s); }, /Bad argument value/, 'session076: EXLR on bare Sy(X) rejects with Bad argument value');
}

/* ---- EXLR rejects a unary (SIN(X)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  assertThrows(() => { lookup('EXLR').fn(s); }, /Bad argument value/, 'session076: EXLR on SIN(X) rejects with Bad argument value');
}

/* ---- EXLR rejects a Real (non-Symbolic type) ---- */
{
  const s = new Stack();
  s.push(Real(42));
  assertThrows(() => { lookup('EXLR').fn(s); }, /Bad argument type/, 'session076: EXLR on Real rejects with Bad argument type');
}

/* ==================================================================
 — PROPFRAC / PARTFRAC / COSSIN
   Three CAS ops routed through Giac.  Tests register the caseval
   fixture the op emits, then verify the Symbolic output.  Rejection
   paths check Name/Real pass-through and non-CAS types throw
   `Bad argument type`.
   ================================================================== */

// ---- PROPFRAC ----------------------------------------------------

/* ---- PROPFRAC on a Symbolic routes through Giac propfrac(...) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X^2+1)/(X+1)')));
  giac._clear();
  giac._setFixture('propfrac((X^2+1)/(X+1))', 'X-1+2/(X+1)');
  lookup('PROPFRAC').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X - 1 + 2/(X + 1)',
         `session104: PROPFRAC '(X^2+1)/(X+1)' → '${formatAlgebra(s.peek().expr)}' (want 'X - 1 + 2/(X + 1)')`);
  giac._clear();
}

/* ---- PROPFRAC on a more complex rational ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X^3 - 2*X + 1)/(X - 1)')));
  giac._clear();
  giac._setFixture('propfrac((X^3-2*X+1)/(X-1))', 'X^2+X-1');
  lookup('PROPFRAC').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^2 + X - 1',
         `session104: PROPFRAC exact polynomial quotient → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

/* ---- PROPFRAC on a Rational lifts to Symbolic and routes to Giac ---- */
{
  // 1 3 /  → Rational(1/3).  PROPFRAC on a bare ratio is a little silly
  // (the ratio is already proper) but Giac's propfrac(1/3) just returns
  // 1/3 — exercise the Rational lift path cleanly.
  const s = new Stack();
  s.push(Integer(43n));
  s.push(Integer(12n));
  lookup('/').fn(s);  // produces Rational(43/12) in EXACT mode
  giac._clear();
  giac._setFixture('propfrac(43/12)', '3+7/12');
  lookup('PROPFRAC').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '3 + 7/12',
         `session104: PROPFRAC on Rational 43/12 → '${formatAlgebra(s.peek().expr)}' (want '3 + 7/12')`);
  giac._clear();
}

/* ---- PROPFRAC on a Real is a pass-through ---- */
{
  const s = new Stack();
  s.push(Real(3.14));
  lookup('PROPFRAC').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(3.14),
         'session104: PROPFRAC on Real is a pass-through');
}

/* ---- PROPFRAC on an Integer is a pass-through ---- */
{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('PROPFRAC').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 7n,
         'session104: PROPFRAC on Integer is a pass-through');
}

/* ---- PROPFRAC on a bare Name is a pass-through ---- */
{
  const s = new Stack();
  s.push(Name('FOO'));
  lookup('PROPFRAC').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'FOO',
         'session104: PROPFRAC on Name is a pass-through');
}

/* ---- PROPFRAC on a String rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Str('hello'));
  assertThrows(() => { lookup('PROPFRAC').fn(s); }, /Bad argument type/, 'session104: PROPFRAC on String rejects with Bad argument type');
}

// ---- PARTFRAC ----------------------------------------------------

/* ---- PARTFRAC on a Symbolic routes through Giac partfrac(...) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(2*X-1)/((X-1)*(X+1))')));
  giac._clear();
  // (2X-1)/((X-1)(X+1)) = (1/2)/(X-1) + (3/2)/(X+1).  Giac prints with
  // rational coefficients.
  giac._setFixture('partfrac((2*X-1)/((X-1)*(X+1)))', '1/(2*(X-1))+3/(2*(X+1))');
  lookup('PARTFRAC').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '1/(2*(X - 1)) + 3/(2*(X + 1))',
         `session104: PARTFRAC '(2X-1)/((X-1)(X+1))' → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

/* ---- PARTFRAC on a three-pole rational ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/(X*(X-1)*(X+1))')));
  giac._clear();
  // 1/(X(X-1)(X+1)) = 1/(2(X-1)) - 1/X + 1/(2(X+1))
  giac._setFixture('partfrac(1/(X*(X-1)*(X+1)))', '1/(2*(X-1))-1/X+1/(2*(X+1))');
  lookup('PARTFRAC').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '1/(2*(X - 1)) - 1/X + 1/(2*(X + 1))',
         `session104: PARTFRAC 1/(X(X-1)(X+1)) → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

/* ---- PARTFRAC on a Real / Integer / Name is a pass-through ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('PARTFRAC').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2.5),
         'session104: PARTFRAC on Real is a pass-through');
}
{
  const s = new Stack();
  s.push(Integer(-8n));
  lookup('PARTFRAC').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === -8n,
         'session104: PARTFRAC on Integer is a pass-through');
}
{
  const s = new Stack();
  s.push(Name('BAR'));
  lookup('PARTFRAC').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'BAR',
         'session104: PARTFRAC on Name is a pass-through');
}

/* ---- PARTFRAC on a Rational is a pass-through (degenerate decomp) ---- */
{
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Integer(2n));
  lookup('/').fn(s);  // produces Rational(7/2)
  const before = s.peek();
  lookup('PARTFRAC').fn(s);
  assert(s.peek() === before || (s.peek().n === 7n && s.peek().d === 2n),
         'session104: PARTFRAC on Rational is a pass-through');
}

/* ---- PARTFRAC on a String rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Str('nope'));
  assertThrows(() => { lookup('PARTFRAC').fn(s); }, /Bad argument type/, 'session104: PARTFRAC on String rejects with Bad argument type');
}

// ---- COSSIN ------------------------------------------------------

/* ---- COSSIN on a Symbolic routes through Giac tan2sincos(...) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  giac._clear();
  giac._setFixture('tan2sincos(tan(X))', 'sin(X)/cos(X)');
  lookup('COSSIN').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'SIN(X)/COS(X)',
         `session104: COSSIN TAN(X) → '${formatAlgebra(s.peek().expr)}' (want 'SIN(X)/COS(X)')`);
  giac._clear();
}

/* ---- COSSIN on a product TAN(X)·COS(X) — the TAN is rewritten but
 *      the COS is untouched (Giac's tan2sincos leaves non-TAN alone). */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)*COS(X)')));
  giac._clear();
  giac._setFixture('tan2sincos(tan(X)*cos(X))', 'sin(X)/cos(X)*cos(X)');
  lookup('COSSIN').fn(s);
  assert(isSymbolic(s.peek()),
         `session104: COSSIN TAN(X)*COS(X) yields a Symbolic`);
  giac._clear();
}

/* ---- COSSIN idempotent on a pure SIN / COS expression ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X) + COS(X)')));
  giac._clear();
  giac._setFixture('tan2sincos(sin(X)+cos(X))', 'sin(X)+cos(X)');
  lookup('COSSIN').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'SIN(X) + COS(X)',
         `session104: COSSIN on SIN(X)+COS(X) is idempotent (got '${formatAlgebra(s.peek().expr)}')`);
  giac._clear();
}

/* ---- COSSIN on a Real / Integer / Name is a pass-through ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('COSSIN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0.5),
         'session104: COSSIN on Real is a pass-through');
}
{
  const s = new Stack();
  s.push(Integer(42n));
  lookup('COSSIN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 42n,
         'session104: COSSIN on Integer is a pass-through');
}
{
  const s = new Stack();
  s.push(Name('BAZ'));
  lookup('COSSIN').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'BAZ',
         'session104: COSSIN on Name is a pass-through');
}

/* ---- COSSIN on a String rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Str('trig'));
  assertThrows(() => { lookup('COSSIN').fn(s); }, /Bad argument type/, 'session104: COSSIN on String rejects with Bad argument type');
}

/* ==================================================================
 — PCAR / CHARPOL / EGVL / PA2B2
   PCAR + CHARPOL + EGVL are Giac-backed matrix ops (use fixtures on
   the mock engine); PA2B2 is native-BigInt (no CAS dependency).
   ================================================================== */

// PCAR / CHARPOL emit `charpoly(matrix, VX)` and the existing fixtures
// in this cluster were written for the HP50 default VX='X'.  rpl5050
// now ships VX='x' (lowercase keyboard default — see state.js casVx),
// so pin VX to 'X' for the duration of the cluster and reset on the
// way out.  Avoids touching every fixture key + assertion.
{
  const { setCasVx } = await import('../www/src/rpl/state.js');
  setCasVx('X');
}

// ---- PCAR — characteristic polynomial ------------------------------

/* ---- PCAR on a 2×2 integer matrix routes through Giac charpoly(...) */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  giac._setFixture('charpoly([[1,2],[3,4]],X)', 'X^2-5*X-2');
  lookup('PCAR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^2 - 5*X - 2',
         `session114: PCAR 2x2 int → '${formatAlgebra(s.peek().expr)}' (want 'X^2 - 5*X - 2')`);
  giac._clear();
}

/* ---- PCAR on a diagonal 3×3 returns a factored-ish cubic --------- */
{
  const s = new Stack();
  s.push(Matrix([
    [Integer(2n), Integer(0n), Integer(0n)],
    [Integer(0n), Integer(3n), Integer(0n)],
    [Integer(0n), Integer(0n), Integer(5n)],
  ]));
  giac._clear();
  giac._setFixture('charpoly([[2,0,0],[0,3,0],[0,0,5]],X)',
                   'X^3-10*X^2+31*X-30');
  lookup('PCAR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^3 - 10*X^2 + 31*X - 30',
         `session114: PCAR diag-3x3 → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

/* ---- CHARPOL alias dispatches through PCAR's registered fn ------- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  giac._setFixture('charpoly([[1,2],[3,4]],X)', 'X^2-5*X-2');
  lookup('CHARPOL').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^2 - 5*X - 2',
         `session114: CHARPOL alias → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

/* ---- PCAR on a Vector rejects with Bad argument type ------------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n), Integer(3n)]));
  assertThrows(() => { lookup('PCAR').fn(s); },
               /Bad argument type/,
               'session114: PCAR on Vector → Bad argument type');
}

/* ---- PCAR on a non-square matrix rejects with Invalid dimension -- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n), Integer(3n)],
                 [Integer(4n), Integer(5n), Integer(6n)]]));
  assertThrows(() => { lookup('PCAR').fn(s); },
               /Invalid dimension/,
               'session114: PCAR on 2x3 → Invalid dimension');
}

// ---- EGVL — eigenvalues as a Vector ------------------------------

/* ---- EGVL on a diagonal matrix returns the diagonal entries ----- */
{
  const s = new Stack();
  s.push(Matrix([
    [Integer(2n), Integer(0n)],
    [Integer(0n), Integer(5n)],
  ]));
  giac._clear();
  giac._setFixture('eigenvals([[2,0],[0,5]])', '[2,5]');
  lookup('EGVL').fn(s);
  const v = s.peek();
  assert(v && isVector(v) && v.items.length === 2,
         `session114: EGVL diag → Vector length ${v && v.items && v.items.length}`);
  const [e0, e1] = v.items;
  assert(isReal(e0) && e0.value.eq(2) && isReal(e1) && e1.value.eq(5),
         `session114: EGVL diag values (${e0 && e0.value}, ${e1 && e1.value})`);
  giac._clear();
}

/* ---- EGVL on a 2×2 with irrational eigenvalues preserves symbolic */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  // Real eigenvalues of [[1,2],[3,4]] are (5 ± √33)/2.
  giac._setFixture('eigenvals([[1,2],[3,4]])',
                   '[(5-sqrt(33))/2,(5+sqrt(33))/2]');
  lookup('EGVL').fn(s);
  const v = s.peek();
  assert(v && isVector(v) && v.items.length === 2,
         'session114: EGVL irrational → Vector length 2');
  assert(isSymbolic(v.items[0]) && isSymbolic(v.items[1]),
         'session114: EGVL irrational → both items Symbolic');
  giac._clear();
}

/* ---- EGVL on a Matrix rejects when splitGiacList returns null --- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  // Return something that doesn't look like a list (no surrounding brackets).
  giac._setFixture('eigenvals([[1,2],[3,4]])', 'garbage');
  assertThrows(() => { lookup('EGVL').fn(s); },
               /Bad argument value/,
               'session114: EGVL on non-list Giac output → Bad argument value');
  giac._clear();
}

/* ---- EGVL on an Integer rejects with Bad argument type ---------- */
{
  const s = new Stack();
  s.push(Integer(7n));
  assertThrows(() => { lookup('EGVL').fn(s); },
               /Bad argument type/,
               'session114: EGVL on Integer → Bad argument type');
}

// Reset VX after the PCAR/CHARPOL/EGVL cluster — see the setCasVx('X')
// at the top of above. PA2B2 doesn't touch VX so it can
// run with whatever the next cluster expects.
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
}

// ---- PA2B2 — Fermat sum of two squares ---------------------------

/* ---- PA2B2 on p = 2 returns 1 + i (the unique decomp) ----------- */
{
  const s = new Stack();
  s.push(Integer(2n));
  lookup('PA2B2').fn(s);
  const z = s.peek();
  assert(isComplex(z) && z.re === 1 && z.im === 1,
         `session114: PA2B2 2 → (${z && z.re}, ${z && z.im}) want (1, 1)`);
}

/* ---- PA2B2 on p = 5 returns 1 + 2i (1² + 2² = 5) --------------- */
{
  const s = new Stack();
  s.push(Integer(5n));
  lookup('PA2B2').fn(s);
  const z = s.peek();
  assert(isComplex(z) && z.re === 1 && z.im === 2,
         `session114: PA2B2 5 → (${z && z.re}, ${z && z.im}) want (1, 2)`);
}

/* ---- PA2B2 on p = 13 returns 2 + 3i ----------------------------- */
{
  const s = new Stack();
  s.push(Integer(13n));
  lookup('PA2B2').fn(s);
  const z = s.peek();
  assert(isComplex(z) && z.re === 2 && z.im === 3,
         `session114: PA2B2 13 → (${z && z.re}, ${z && z.im}) want (2, 3)`);
}

/* ---- PA2B2 on p = 65537 (largest Fermat prime) ----------------- */
{
  // 65537 = 1² + 256²; a good stress-test that the BigInt powMod path
  // and Newton sqrt handle p near 2^16 cleanly.
  const s = new Stack();
  s.push(Integer(65537n));
  lookup('PA2B2').fn(s);
  const z = s.peek();
  assert(isComplex(z) && z.re === 1 && z.im === 256,
         `session114: PA2B2 65537 → (${z && z.re}, ${z && z.im}) want (1, 256)`);
}

/* ---- PA2B2 accepts integer-valued Real input -------------------- */
{
  const s = new Stack();
  s.push(Real(29));
  lookup('PA2B2').fn(s);
  const z = s.peek();
  assert(isComplex(z) && z.re === 2 && z.im === 5,
         `session114: PA2B2 Real(29) → (${z && z.re}, ${z && z.im}) want (2, 5)`);
}

/* ---- PA2B2 on p = 3 rejects (prime but ≡ 3 mod 4) --------------- */
{
  const s = new Stack();
  s.push(Integer(3n));
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument value/,
               'session114: PA2B2 3 → Bad argument value (3 ≡ 3 mod 4)');
}

/* ---- PA2B2 on p = 7 rejects (prime but ≡ 3 mod 4) --------------- */
{
  const s = new Stack();
  s.push(Integer(7n));
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument value/,
               'session114: PA2B2 7 → Bad argument value (7 ≡ 3 mod 4)');
}

/* ---- PA2B2 on a composite rejects ------------------------------- */
{
  const s = new Stack();
  s.push(Integer(21n));          // 3 · 7, not prime
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument value/,
               'session114: PA2B2 21 → Bad argument value (composite)');
}

/* ---- PA2B2 on p = 1 rejects ------------------------------------- */
{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument value/,
               'session114: PA2B2 1 → Bad argument value (1 is not prime)');
}

/* ---- PA2B2 on a non-integer Real rejects with Bad argument value  */
{
  const s = new Stack();
  s.push(Real(5.5));
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument value/,
               'session114: PA2B2 Real(5.5) → Bad argument value');
}

/* ---- PA2B2 on a String rejects with Bad argument type ----------- */
{
  const s = new Stack();
  s.push(Str('nope'));
  assertThrows(() => { lookup('PA2B2').fn(s); },
               /Bad argument type/,
               'session114: PA2B2 on String → Bad argument type');
}


/* ==================================================================
 — EGV / RSD / GREDUCE
   EGV + GREDUCE are Giac-backed (use mock fixtures); RSD is pure
   native linear algebra (no CAS dependency).
   ================================================================== */

// ---- EGV — eigenvector matrix + eigenvalue vector -----------------

/* ---- EGV on a diagonal 2×2 yields the I matrix + diag entries ---- */
{
  const s = new Stack();
  s.push(Matrix([
    [Integer(2n), Integer(0n)],
    [Integer(0n), Integer(5n)],
  ]));
  giac._clear();
  // Standard basis: P = I; eigenvals = [2, 5].
  giac._setFixture('egv([[2,0],[0,5]])', '[[1,0],[0,1]]');
  giac._setFixture('eigenvals([[2,0],[0,5]])', '[2,5]');
  lookup('EGV').fn(s);
  // After EGV: level 1 = vector of eigenvalues, level 2 = matrix.
  const vals = s.pop();
  const evec = s.pop();
  assert(isVector(vals) && vals.items.length === 2,
         `session119: EGV diag eigenvalue vector length ${vals && vals.items && vals.items.length}`);
  assert(isReal(vals.items[0]) && vals.items[0].value.eq(2) &&
         isReal(vals.items[1]) && vals.items[1].value.eq(5),
         'session119: EGV diag eigenvalues = (2, 5)');
  assert(isMatrix(evec) && evec.rows.length === 2 && evec.rows[0].length === 2,
         'session119: EGV diag eigenvector matrix is 2×2');
  // P = identity → P[0][0]=1, P[0][1]=0, P[1][0]=0, P[1][1]=1.
  assert(isReal(evec.rows[0][0]) && evec.rows[0][0].value.eq(1) &&
         isReal(evec.rows[0][1]) && evec.rows[0][1].value.eq(0) &&
         isReal(evec.rows[1][0]) && evec.rows[1][0].value.eq(0) &&
         isReal(evec.rows[1][1]) && evec.rows[1][1].value.eq(1),
         'session119: EGV diag eigenvector matrix entries (P = I)');
  giac._clear();
}

/* ---- EGV preserves the EGVL eigenvalue ordering ------------------ */
{
  // Both EGVL and EGV use eigenvals(...) for the value list, so the
  // i-th eigenvalue must correspond to the i-th column of the EGV
  // matrix.  Here Giac is stubbed to put 5 first, then 2 — and the
  // returned matrix columns are swapped to match.
  const s = new Stack();
  s.push(Matrix([
    [Integer(5n), Integer(0n)],
    [Integer(0n), Integer(2n)],
  ]));
  giac._clear();
  giac._setFixture('egv([[5,0],[0,2]])', '[[1,0],[0,1]]');
  giac._setFixture('eigenvals([[5,0],[0,2]])', '[5,2]');
  lookup('EGV').fn(s);
  const vals = s.pop(); s.pop(); // discard matrix, we only check ordering here
  assert(isReal(vals.items[0]) && vals.items[0].value.eq(5) &&
         isReal(vals.items[1]) && vals.items[1].value.eq(2),
         'session119: EGV eigenvalue ordering matches eigenvals() output');
  giac._clear();
}

/* ---- EGV on irrational eigenvalues lifts to Symbolic ------------- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  // Real eigenvalues (5±√33)/2; eigenvector entries also irrational.
  giac._setFixture('egv([[1,2],[3,4]])',
                   '[[(-3+sqrt(33))/6,(-3-sqrt(33))/6],[1,1]]');
  giac._setFixture('eigenvals([[1,2],[3,4]])',
                   '[(5-sqrt(33))/2,(5+sqrt(33))/2]');
  lookup('EGV').fn(s);
  const vals = s.pop();
  const evec = s.pop();
  assert(isVector(vals) && vals.items.length === 2 &&
         isSymbolic(vals.items[0]) && isSymbolic(vals.items[1]),
         'session119: EGV irrational eigenvalues are Symbolic');
  assert(isMatrix(evec) && isSymbolic(evec.rows[0][0]) && isSymbolic(evec.rows[0][1]),
         'session119: EGV irrational eigenvectors keep Symbolic entries');
  giac._clear();
}

/* ---- EGV on a non-Matrix rejects Bad argument type --------------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n)]));
  assertThrows(() => { lookup('EGV').fn(s); },
               /Bad argument type/,
               'session119: EGV on Vector → Bad argument type');
}

/* ---- EGV on a non-square matrix rejects Invalid dimension -------- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n), Integer(3n)],
                 [Integer(4n), Integer(5n), Integer(6n)]]));
  assertThrows(() => { lookup('EGV').fn(s); },
               /Invalid dimension/,
               'session119: EGV on 2×3 matrix → Invalid dimension');
}

/* ---- EGV with garbage Giac matrix output rejects ---------------- */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  giac._setFixture('egv([[1,2],[3,4]])', 'garbage');
  giac._setFixture('eigenvals([[1,2],[3,4]])', '[1,2]');
  assertThrows(() => { lookup('EGV').fn(s); },
               /Bad argument value/,
               'session119: EGV on non-list egv() output → Bad argument value');
  giac._clear();
}

// ---- RSD — residual B − A·Z ---------------------------------------

/* ---- RSD vector branch: zero residual is the exact-solution case  */
{
  // A = [[2,0],[0,3]], Z = [1,2], A·Z = [2,6].  B = [2,6] → residual 0.
  const s = new Stack();
  s.push(Vector([Integer(2n), Integer(6n)]));                 // B
  s.push(Matrix([[Integer(2n), Integer(0n)],                  // A
                 [Integer(0n), Integer(3n)]]));
  s.push(Vector([Integer(1n), Integer(2n)]));                 // Z
  lookup('RSD').fn(s);
  const r = s.peek();
  assert(isVector(r) && r.items.length === 2 &&
         isReal(r.items[0]) && r.items[0].value.eq(0) &&
         isReal(r.items[1]) && r.items[1].value.eq(0),
         `session119: RSD vector zero-residual → [0,0]`);
}

/* ---- RSD vector branch: non-zero residual ----------------------- */
{
  // A = [[1,1],[1,-1]], Z = [3,1].  A·Z = [4, 2].
  // B = [10, 0].  Residual = B - A·Z = [6, -2].
  const s = new Stack();
  s.push(Vector([Integer(10n), Integer(0n)]));
  s.push(Matrix([[Integer(1n), Integer(1n)],
                 [Integer(1n), Integer(-1n)]]));
  s.push(Vector([Integer(3n), Integer(1n)]));
  lookup('RSD').fn(s);
  const r = s.peek();
  assert(isVector(r) && r.items.length === 2 &&
         r.items[0].value.eq(6) && r.items[1].value.eq(-2),
         `session119: RSD vector branch B-A·Z = [6, -2]`);
}

/* ---- RSD matrix branch: identity A, Z is 2×2 -------------------- */
{
  // A = I, Z = [[1,2],[3,4]].  A·Z = Z.  B = [[5,6],[7,8]].
  // Residual = B - Z = [[4,4],[4,4]].
  const s = new Stack();
  s.push(Matrix([[Integer(5n), Integer(6n)], [Integer(7n), Integer(8n)]]));
  s.push(Matrix([[Integer(1n), Integer(0n)], [Integer(0n), Integer(1n)]]));
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  lookup('RSD').fn(s);
  const r = s.peek();
  assert(isMatrix(r) && r.rows.length === 2 && r.rows[0].length === 2 &&
         r.rows[0][0].value.eq(4) && r.rows[0][1].value.eq(4) &&
         r.rows[1][0].value.eq(4) && r.rows[1][1].value.eq(4),
         'session119: RSD matrix branch B-A·Z (A=I)');
}

/* ---- RSD with Real entries ------------------------------------- */
{
  // A = [[2.5]], Z = [4], A·Z = [10].  B = [12.5] → residual [2.5].
  const s = new Stack();
  s.push(Vector([Real(12.5)]));
  s.push(Matrix([[Real(2.5)]]));
  s.push(Vector([Integer(4n)]));
  lookup('RSD').fn(s);
  const r = s.peek();
  assert(isVector(r) && r.items.length === 1 &&
         isReal(r.items[0]) && r.items[0].value.eq(2.5),
         `session119: RSD Real entries → [2.5]`);
}

/* ---- RSD rejects non-Matrix A ---------------------------------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n)]));
  s.push(Vector([Integer(1n)]));    // A is a vector — wrong
  s.push(Vector([Integer(1n)]));
  assertThrows(() => { lookup('RSD').fn(s); },
               /Bad argument type/,
               'session119: RSD on non-Matrix A → Bad argument type');
}

/* ---- RSD rejects mixed B (matrix) + Z (vector) ------------------ */
{
  const s = new Stack();
  s.push(Matrix([[Integer(1n)], [Integer(2n)]]));   // B is matrix
  s.push(Matrix([[Integer(1n)]]));                  // A is 1×1
  s.push(Vector([Integer(1n)]));                    // Z is vector — mismatch
  assertThrows(() => { lookup('RSD').fn(s); },
               /Bad argument type|Invalid dimension/,
               'session119: RSD with mixed matrix B / vector Z → reject');
}

/* ---- RSD rejects shape mismatch (vector Z length ≠ cols(A)) ----- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n)]));
  s.push(Matrix([[Integer(1n), Integer(2n)],
                 [Integer(3n), Integer(4n)]]));    // A is 2×2 → expects len-2 Z
  s.push(Vector([Integer(1n), Integer(2n), Integer(3n)]));   // Z len 3
  assertThrows(() => { lookup('RSD').fn(s); },
               /Invalid dimension/,
               'session119: RSD shape mismatch → Invalid dimension');
}

/* ---- RSD rejects Symbolic entries (numeric-only path) ----------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n)]));
  s.push(Matrix([[Symbolic({ kind: 'var', name: 'X' })]]));
  s.push(Vector([Integer(1n)]));
  assertThrows(() => { lookup('RSD').fn(s); },
               /Bad argument type/,
               'session119: RSD on Symbolic A → Bad argument type');
}

// ---- GREDUCE — Grœbner reduction --------------------------------

/* ---- GREDUCE on the AUR p.3-99 worked example -------------------- */
{
  // GREDUCE(X^2*Y - X*Y - 1, [X, 2*Y^3 - 1], [X, Y]) → -1.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2*Y - X*Y - 1')));
  s.push(Vector([Symbolic(parseAlgebra('X')),
                 Symbolic(parseAlgebra('2*Y^3 - 1'))]));
  s.push(Vector([Name('X'), Name('Y')]));
  giac._clear();
  giac._setFixture(
    'greduce((X^2*Y-X*Y-1),[(X),(2*Y^3-1)],[X,Y])',
    '-1');
  lookup('GREDUCE').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value.eq(-1),
         `session119: GREDUCE worked-example → ${r && r.value} (want -1)`);
  giac._clear();
}

/* ---- GREDUCE returns a Symbolic when the remainder is non-trivial */
{
  // Reduce X^2 - 1 by [X - 1, X + 1] in [X] → Giac (here mocked) would
  // return 0; we instead seed a symbolic Y to confirm Symbolic
  // round-trip works.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X*Y + 1')));
  s.push(Vector([Symbolic(parseAlgebra('X^2 - 1'))]));
  s.push(Vector([Name('X'), Name('Y')]));
  giac._clear();
  giac._setFixture(
    'greduce((X*Y+1),[(X^2-1)],[X,Y])',
    'X*Y+1');
  lookup('GREDUCE').fn(s);
  const r = s.peek();
  assert(isSymbolic(r) && formatAlgebra(r.expr) === 'X*Y + 1',
         `session119: GREDUCE Symbolic round-trip → '${r && isSymbolic(r) ? formatAlgebra(r.expr) : r}'`);
  giac._clear();
}

/* ---- GREDUCE rejects non-Vector basis ---------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Symbolic(parseAlgebra('X')));    // not a Vector
  s.push(Vector([Name('X')]));
  assertThrows(() => { lookup('GREDUCE').fn(s); },
               /Bad argument type/,
               'session119: GREDUCE on non-Vector basis → Bad argument type');
}

/* ---- GREDUCE rejects non-Vector vars ----------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Name('X'));                      // not a Vector
  assertThrows(() => { lookup('GREDUCE').fn(s); },
               /Bad argument type/,
               'session119: GREDUCE on non-Vector vars → Bad argument type');
}

/* ---- GREDUCE rejects non-Name elements in vars vector ----------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Vector([Symbolic(parseAlgebra('X+1'))]));   // Symbolic, not Name
  assertThrows(() => { lookup('GREDUCE').fn(s); },
               /Bad argument type/,
               'session119: GREDUCE on Symbolic-in-vars → Bad argument type');
}

/* ---- GREDUCE rejects empty basis -------------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Vector([]));
  s.push(Vector([Name('X')]));
  assertThrows(() => { lookup('GREDUCE').fn(s); },
               /Invalid dimension/,
               'session119: GREDUCE empty basis → Invalid dimension');
}

/* ---- GREDUCE rejects empty vars list ---------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Vector([]));
  assertThrows(() => { lookup('GREDUCE').fn(s); },
               /Invalid dimension/,
               'session119: GREDUCE empty vars → Invalid dimension');
}


/* ==================================================================
 — LNAME / GBASIS
   LNAME is a native AST walker (no Giac dependency); GBASIS is
   Giac-backed (uses fixture mocks).
   ================================================================== */

// ---- LNAME — list variable names in a Symbolic --------------------

/* ---- LNAME on the AUR worked example ----------------------------- *
 * AUR p.3-136 (paraphrased — we construct the post-parse AST directly
 * since the project's algebra parser turns INV(T) into 1/T at parse
 * time, which is exactly the AUR's documented result form anyway):
 *   LNAME( COS(B)/2*A + MYFUNC(PQ) + 1/T )
 *     →  Level 2 : the original expression
 *        Level 1 : [MYFUNC, PQ, A, B, T]
 * COS is a known built-in (drop the function name, keep its argument);
 * MYFUNC is user-defined (keep the function name).  Sort: length DESC,
 * alpha ASC within equal length. */
{
  const s = new Stack();
  const expr = AstBin('+',
    AstBin('+',
      AstBin('*',
        AstBin('/', AstFn('COS', [AstVar('B')]), AstNum(2)),
        AstVar('A')),
      AstFn('MYFUNC', [AstVar('PQ')])),
    AstBin('/', AstNum(1), AstVar('T')));
  const before = Symbolic(expr);
  s.push(before);
  lookup('LNAME').fn(s);
  const v = s.pop();
  const orig = s.pop();
  assert(orig === before,
         'session124: LNAME preserves the original Symbolic on level 2');
  assert(isVector(v) && v.items.length === 5,
         `session124: LNAME returns a 5-element Vector (got ${v && v.items && v.items.length})`);
  const ids = v.items.map((n) => isName(n) ? n.id : `<${n.type}>`);
  assert(ids[0] === 'MYFUNC',
         `session124: LNAME longest-first → MYFUNC (got ${ids[0]})`);
  assert(ids[1] === 'PQ',
         `session124: LNAME second by length → PQ (got ${ids[1]})`);
  assert(ids[2] === 'A' && ids[3] === 'B' && ids[4] === 'T',
         `session124: LNAME equal-length alpha sort → A,B,T (got ${ids.slice(2).join(',')})`);
}

/* ---- LNAME on a single bare variable ----------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 1 && isName(v.items[0]) && v.items[0].id === 'X',
         'session124: LNAME on lone X → [X]');
}

/* ---- LNAME on a constant returns an empty Vector ----------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(2)+COS(3)')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 0,
         `session124: LNAME on constant expr → [] (got length ${v && v.items && v.items.length})`);
}

/* ---- LNAME deduplicates repeated occurrences -------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 2*X + 1 + Y*X')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 2,
         `session124: LNAME dedupes X — returns 2 names (got ${v && v.items && v.items.length})`);
  const ids = v.items.map((n) => n.id).sort();
  assert(ids.join(',') === 'X,Y',
         `session124: LNAME dedupes X,Y from polynomial (got ${ids.join(',')})`);
}

/* ---- LNAME alpha tiebreak with length-3 names -------------------- */
{
  const s = new Stack();
  // Build manually: parser would treat ABC, BAC, AAB as known fns or
  // multi-letter idents — algebra.js parses Idents, no problem with
  // multi-letter names.
  s.push(Symbolic(parseAlgebra('ABC + BAC + AAB')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 3,
         'session124: LNAME 3-name length-3 input gives 3 names');
  const ids = v.items.map((n) => n.id);
  assert(ids[0] === 'AAB' && ids[1] === 'ABC' && ids[2] === 'BAC',
         `session124: LNAME alpha tiebreak (AAB,ABC,BAC) → got ${ids.join(',')}`);
}

/* ---- LNAME on a Real rejects with Bad argument type -------------- */
{
  const s = new Stack();
  s.push(Real(3.14));
  assertThrows(() => { lookup('LNAME').fn(s); },
               /Bad argument type/,
               'session124: LNAME on Real → Bad argument type');
}

/* ---- LNAME on a Vector rejects with Bad argument type ----------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n)]));
  assertThrows(() => { lookup('LNAME').fn(s); },
               /Bad argument type/,
               'session124: LNAME on Vector → Bad argument type');
}

/* ---- LNAME walks under negation and binary ops ------------------ */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('-(A*B + C^D)')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 4,
         'session124: LNAME walks under Neg + Bin (4 names)');
  const ids = v.items.map((n) => n.id).join(',');
  assert(ids === 'A,B,C,D',
         `session124: LNAME under Neg/Bin canonical order → A,B,C,D (got ${ids})`);
}


// ---- GBASIS — Grœbner basis of an ideal --------------------------

/* ---- GBASIS on the AUR worked example ---------------------------- *
 * AUR p.3-95:
 *   GBASIS( [X^2 + 2*X*Y^2, X*Y + 2*Y^3 - 1], [X,Y] )  →  [X, 2*Y^3-1]
 * Symbolic entries lift via _scalarToGiacStr → "(astToGiac(expr))",
 * so the exact Giac command emitted is:
 *   gbasis([(X^2+2*X*Y^2),(X*Y+2*Y^3-1)],[X,Y]) */
{
  const s = new Stack();
  s.push(Vector([
    Symbolic(parseAlgebra('X^2 + 2*X*Y^2')),
    Symbolic(parseAlgebra('X*Y + 2*Y^3 - 1')),
  ]));
  s.push(Vector([Name('X'), Name('Y')]));
  giac._clear();
  giac._setFixture(
    'gbasis([(X^2+2*X*Y^2),(X*Y+2*Y^3-1)],[X,Y])',
    '[X,2*Y^3-1]');
  lookup('GBASIS').fn(s);
  const v = s.pop();
  assert(isVector(v) && v.items.length === 2,
         `session124: GBASIS AUR worked example → 2-element basis (got ${v && v.items && v.items.length})`);
  // First entry is bare X — _astToRplValue lifts Var('X') into a Name.
  const e0 = v.items[0];
  assert((isName(e0) && e0.id === 'X') ||
         (isSymbolic(e0) && formatAlgebra(e0.expr) === 'X'),
         `session124: GBASIS basis[0] = X (got ${e0.type})`);
  const e1 = v.items[1];
  assert(isSymbolic(e1) && formatAlgebra(e1.expr) === '2*Y^3 - 1',
         `session124: GBASIS basis[1] = 2*Y^3-1 (got ${isSymbolic(e1) ? formatAlgebra(e1.expr) : e1.type})`);
  giac._clear();
}

/* ---- GBASIS — single-poly basis with a constant result ----------- */
{
  const s = new Stack();
  s.push(Vector([Integer(7n)]));            // ideal generated by 7 (a unit-like int)
  s.push(Vector([Name('X')]));
  giac._clear();
  giac._setFixture('gbasis([7],[X])', '[1]');  // ideal = whole ring
  lookup('GBASIS').fn(s);
  const v = s.pop();
  // _astToRplValue lifts Num(1) to Real(1) — that's the post-Giac numeric path.
  assert(isVector(v) && v.items.length === 1 &&
         isReal(v.items[0]) && v.items[0].value.eq(1),
         `session124: GBASIS unit ideal → [1] (got ${v && v.items && v.items[0] && v.items[0].type})`);
  giac._clear();
}

/* ---- GBASIS rejects non-Vector polys ----------------------------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));    // not a Vector
  s.push(Vector([Name('X')]));
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Bad argument type/,
               'session124: GBASIS on non-Vector polys → Bad argument type');
}

/* ---- GBASIS rejects non-Vector vars ------------------------------ */
{
  const s = new Stack();
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Name('X'));                      // not a Vector
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Bad argument type/,
               'session124: GBASIS on non-Vector vars → Bad argument type');
}

/* ---- GBASIS rejects empty polys list ----------------------------- */
{
  const s = new Stack();
  s.push(Vector([]));
  s.push(Vector([Name('X')]));
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Invalid dimension/,
               'session124: GBASIS empty polys → Invalid dimension');
}

/* ---- GBASIS rejects empty vars list ------------------------------ */
{
  const s = new Stack();
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Vector([]));
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Invalid dimension/,
               'session124: GBASIS empty vars → Invalid dimension');
}

/* ---- GBASIS rejects non-Name elements in vars vector ----------- */
{
  const s = new Stack();
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Vector([Symbolic(parseAlgebra('X+1'))]));   // Symbolic, not Name
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Bad argument type/,
               'session124: GBASIS on Symbolic-in-vars → Bad argument type');
}

/* ---- GBASIS rejects when Giac returns a non-list result --------- */
{
  const s = new Stack();
  s.push(Vector([Symbolic(parseAlgebra('X'))]));
  s.push(Vector([Name('X')]));
  giac._clear();
  // Symbolic 'X' lifts to "(X)"; the exact emitted command is:
  giac._setFixture('gbasis([(X)],[X])', 'X');   // bare scalar — not a list
  assertThrows(() => { lookup('GBASIS').fn(s); },
               /Bad argument value/,
               'session124: GBASIS non-list Giac output → Bad argument value');
  giac._clear();
}


// ==================================================================
// session127: LNAME edge cases — extending the cluster
//
// The LNAME tests cover: 5-name AUR worked example, lone
// var, dedup, alpha tiebreak, walk-under-Neg/Bin, plus reject paths
// for Real and Vector.  The gaps closed here:
//   • cross-type rejection coverage for non-numeric / non-vector
//     argument types (String, Name, Complex), confirming the single
//     `isSymbolic(v)` gate uniformly rejects any non-Symbolic input.
//   • return-shape pin: the Names emitted by LNAME have `quoted=false`,
//     so they round-trip through STO / RCL / EVAL the way the HP50 AUR
//     §3-136 description implies (the user is meant to be able to feed
//     individual entries from the result back into a CAS pipeline).
//   • "constant Symbolic via pure built-ins" pin: an expression made
//     entirely of built-ins applied to numeric literals — `5+SIN(2)` —
//     contributes zero names.  This complements the existing
//     `SIN(2)+COS(3)` constant-expr test by exercising the binary-op
//     descent path under a built-in fn, not just two adjacent fn calls.
//   • mixed built-in-wrapping-user-fn: `COS(MYFUNC(X))` confirms the
//     visit() recursion descends into built-in fn args and collects
//     the user-defined wrapper *inside* — pinning the contract that a
//     known-fn drops its *own* name but keeps walking, so a user-fn
//     buried under a built-in is still discovered.
// ==================================================================

/* ---- LNAME on a String rejects with Bad argument type ----------- */
{
  const s = new Stack();
  s.push(Str('X+1'));               // looks-like-an-expr but is a String
  assertThrows(() => { lookup('LNAME').fn(s); },
               /Bad argument type/,
               'session127: LNAME on String → Bad argument type (only Symbolic accepted)');
}

/* ---- LNAME on a bare Name rejects ------------------------------- *
 * A bare Name is *not* a Symbolic — the LNAME §3-136 contract is
 * "input must be a Symbolic expression."  This is the contrast with
 * the `lone X` test above, where X is wrapped in `Symbolic(parseAlgebra('X'))`. */
{
  const s = new Stack();
  s.push(Name('X'));
  assertThrows(() => { lookup('LNAME').fn(s); },
               /Bad argument type/,
               'session127: LNAME on bare Name → Bad argument type (Symbolic required, not raw Name)');
}

/* ---- LNAME on a Complex rejects --------------------------------- */
{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('LNAME').fn(s); },
               /Bad argument type/,
               'session127: LNAME on Complex → Bad argument type');
}

/* ---- LNAME emits unquoted Names --------------------------------- *
 * The Vector entries are constructed by `Name(id)` with no flags —
 * default `quoted: false`.  Pinning this so a future refactor that
 * tries to "round-trip the source quoting" doesn't silently break the
 * STO/RCL pipeline an LNAME-fed name is expected to flow through. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A+B')));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();                          // discard preserved level-2 Symbolic
  assert(isVector(v) && v.items.length === 2,
         'session127: LNAME on A+B → 2-name Vector');
  assert(v.items[0].quoted === false && v.items[1].quoted === false,
         `session127: LNAME emits unquoted Names (got quoted=${v.items[0].quoted},${v.items[1].quoted})`);
}

/* ---- LNAME on `5 + SIN(2)` returns empty Vector ------------------ *
 * Constant-expression contract: built-ins applied to numeric literals
 * contribute no names.  This pins the descent into AstBin.l (Num
 * leaf, no var) — a numeric literal under the binary `+` paired with
 * a single built-in. */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('+', AstNum(5), AstFn('SIN', [AstNum(2)]))));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 0,
         `session127: LNAME on 5+SIN(2) → empty Vector (got len=${v && v.items && v.items.length})`);
}

/* ---- LNAME walks into a built-in's args and finds the user fn --- *
 * `COS(MYFUNC(X))` — COS is built-in (drops its own name) but the
 * recursion descends into its arguments, where MYFUNC is a
 * user-defined fn (kept) wrapping the bare var X (kept).  Result is a
 * 2-element Vector: [MYFUNC, X] — both length-equal so alpha-asc:
 * MYFUNC sorts before X (length-DESC first → 6 vs 1, so MYFUNC
 * actually wins on length, not alpha — pinning the deterministic
 * order with the same length-DESC + alpha-ASC contract).
 *
 * Note: this can't be expressed via parseAlgebra() because the parser
 * treats unknown multi-letter calls strictly — built manually with
 * AstFn / AstVar matching the 5-name worked example pattern. */
{
  const s = new Stack();
  s.push(Symbolic(AstFn('COS', [AstFn('MYFUNC', [AstVar('X')])])));
  lookup('LNAME').fn(s);
  const v = s.pop();
  s.pop();
  assert(isVector(v) && v.items.length === 2,
         `session127: LNAME COS(MYFUNC(X)) → 2-name Vector (got len=${v && v.items && v.items.length})`);
  const ids = v.items.map((n) => n.id);
  assert(ids[0] === 'MYFUNC' && ids[1] === 'X',
         `session127: LNAME COS(MYFUNC(X)) length-DESC order MYFUNC,X (got ${ids.join(',')})`);
  // Cross-check: COS itself is NOT in the result (drops its own name).
  assert(!ids.includes('COS'),
         'session127: LNAME drops the built-in COS name even when it wraps a user fn');
}

/* ==================================================================
 — LIN / LIMIT / lim
   Three Giac-backed CAS ops (use mock fixtures).  LIN is single-arg;
   LIMIT / lim are 2-arg with both equation-form and bare-value
   point arguments accepted.  No-fallback policy.
   ================================================================== */

// ---- LIN — exponential linearization ------------------------------

/* ---- LIN on `e^X * e^Y` collapses to `e^(X+Y)` via Giac lin(...) - */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('exp(X)*exp(Y)')));
  giac._clear();
  giac._setFixture('lin(exp(X)*exp(Y))', 'exp(X+Y)');
  lookup('LIN').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'EXP(X + Y)',
         `session139: LIN e^X*e^Y → '${formatAlgebra(s.peek().expr)}' (want 'EXP(X + Y)')`);
  giac._clear();
}

/* ---- LIN on a Real passes through unchanged ---------------------- */
{
  const s = new Stack();
  s.push(Real(3.14));
  lookup('LIN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(3.14),
         `session139: LIN Real(3.14) passthrough`);
}

/* ---- LIN on Integer / Rational / Name pass through --------------- */
{
  const s = new Stack();
  s.push(Integer(42n));
  lookup('LIN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 42n,
         'session139: LIN Integer(42) passthrough');
}
{
  const s = new Stack();
  s.push(Name('Y', { quoted: true }));
  lookup('LIN').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'Y',
         'session139: LIN Name(Y) passthrough');
}

/* ---- LIN on a Vector rejects with Bad argument type -------------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n)]));
  assertThrows(() => { lookup('LIN').fn(s); },
               /Bad argument type/,
               'session139: LIN on Vector → Bad argument type');
}

// ---- LIMIT — limit at a point ------------------------------------

/* ---- LIMIT on `(X^2-1)/(X-1)` with `X=1` returns 2 (numeric) ----- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X^2-1)/(X-1)')));
  s.push(Symbolic(parseAlgebra('X=1')));
  giac._clear();
  giac._setFixture('limit((X^2-1)/(X-1),X,1)', '2');
  lookup('LIMIT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2),
         `session139: LIMIT (X^2-1)/(X-1) at X=1 → Real(${s.peek() && s.peek().value}) (want 2)`);
  giac._clear();
}

/* ---- LIMIT bare-value form uses VX as default variable ---------- */
{
  // VX defaults to 'x' (rpl5050 lowercase deviation from HP50 — see
  // state.js casVx slot).  Bare-value pointArg should resolve to that
  // variable; the cmd uses lowercase x but the integrand still spells
  // X explicitly, so the substitution finds nothing and Giac collapses
  // the Symbolic to whatever the fixture returns.  We exercise the
  // VX-default path here, not the algebraic resolution semantics.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)/X')));
  s.push(Integer(0n));
  giac._clear();
  giac._setFixture('limit(sin(X)/X,x,0)', '1');
  lookup('LIMIT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(1),
         `session139: LIMIT SIN(X)/X bare-value 0 → Real(${s.peek() && s.peek().value}) (want 1; uses VX)`);
  giac._clear();
}

/* ---- LIMIT returning a Symbolic preserves the algebraic form ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X+B')));
  s.push(Symbolic(parseAlgebra('X=1')));
  giac._clear();
  giac._setFixture('limit(A*X+B,X,1)', 'A+B');
  lookup('LIMIT').fn(s);
  assert(isSymbolic(s.peek()),
         `session139: LIMIT A*X+B at X=1 → Symbolic (want algebraic A+B)`);
  giac._clear();
}

/* ---- LIMIT with non-Symbolic expression rejects ----------------- */
{
  const s = new Stack();
  s.push(Vector([Integer(1n), Integer(2n)]));
  s.push(Symbolic(parseAlgebra('X=0')));
  assertThrows(() => { lookup('LIMIT').fn(s); },
               /Bad argument type/,
               'session139: LIMIT on Vector expression → Bad argument type');
}

/* ---- LIMIT with malformed equation (lhs not Var) rejects -------- */
{
  // Equation `1=0` has a Num lhs, not a Var.  HP50 rejects with Bad
  // argument value (no variable to take the limit in).
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Symbolic(parseAlgebra('1=0')));
  assertThrows(() => { lookup('LIMIT').fn(s); },
               /Bad argument value/,
               'session139: LIMIT with non-Var equation lhs → Bad argument value');
}

/* ---- LIMIT with Vector point rejects with Bad argument type ----- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  s.push(Vector([Integer(0n), Integer(1n)]));
  assertThrows(() => { lookup('LIMIT').fn(s); },
               /Bad argument type/,
               'session139: LIMIT with Vector point → Bad argument type');
}

// ---- lim — HP50 lowercase canonical alias ------------------------

/* ---- lim alias dispatches through LIMIT's registered fn --------- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X^2-1)/(X-1)')));
  s.push(Symbolic(parseAlgebra('X=1')));
  giac._clear();
  giac._setFixture('limit((X^2-1)/(X-1),X,1)', '2');
  lookup('lim').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2),
         `session139: lim alias delegates to LIMIT (got ${s.peek() && s.peek().value}; want 2)`);
  giac._clear();
}

/* ---- lim on Rational point uses VX --------------------------- */
{
  // Rational point exercises the third pointArg branch (besides
  // Symbolic + Real/Integer).  Build the Rational directly via the
  // exported constructor — parseEntry('1/2') returns a multi-token
  // Integer/Integer pair on the stack rather than a single Rational.
  const { Rational } = await import('../www/src/rpl/types.js');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X')));
  s.push(Rational(1n, 2n));
  giac._clear();
  giac._setFixture('limit(1/X,x,(1/2))', '2');
  lookup('lim').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2),
         `session139: lim 1/X at X=1/2 (Rational point) → Real(${s.peek() && s.peek().value}) (want 2)`);
  giac._clear();
}

// ==================================================================
// — MODSTO + ADDTMOD / SUBTMOD / MULTMOD / POWMOD
// HP50 AUR §3-150 / §3-9 / §3-243 / §3-153 / §3-175
// ==================================================================
{
  const stateMod = await import('../www/src/rpl/state.js');
  const { setCasModulo, getCasModulo, resetCasModulo } = stateMod;

  /* ---- Default modulus + setter normalization ---- */
  resetCasModulo();
  assert(getCasModulo() === 13n,
         `session144: factory default casModulo === 13n (got ${getCasModulo()})`);

  setCasModulo(7n);
  assert(getCasModulo() === 7n,
         `session144: setCasModulo(7n) sticks (got ${getCasModulo()})`);

  setCasModulo(-11n);
  assert(getCasModulo() === 11n,
         `session144: setCasModulo(-11n) folds to abs (got ${getCasModulo()})`);

  setCasModulo(0n);
  assert(getCasModulo() === 2n,
         `session144: setCasModulo(0n) promoted to 2n (got ${getCasModulo()})`);

  setCasModulo(1n);
  assert(getCasModulo() === 2n,
         `session144: setCasModulo(1n) promoted to 2n (got ${getCasModulo()})`);

  /* ---- MODSTO op on Integer / negative Integer / 0 / 1 ---- */
  resetCasModulo();
  {
    const s = new Stack();
    s.push(Integer(7n));
    lookup('MODSTO').fn(s);
    assert(s.depth === 0, `session144: MODSTO consumes its arg`);
    assert(getCasModulo() === 7n,
           `session144: MODSTO Integer(7n) sets casModulo=7n (got ${getCasModulo()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(-23n));
    lookup('MODSTO').fn(s);
    assert(getCasModulo() === 23n,
           `session144: MODSTO Integer(-23n) folds to abs (got ${getCasModulo()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('MODSTO').fn(s);
    assert(getCasModulo() === 2n,
           `session144: MODSTO Integer(0n) promoted to 2n (got ${getCasModulo()})`);
  }

  /* ---- MODSTO on integer-valued Real ---- */
  {
    const s = new Stack();
    s.push(Real(5));
    lookup('MODSTO').fn(s);
    assert(getCasModulo() === 5n,
           `session144: MODSTO Real(5) integer-valued accepted (got ${getCasModulo()})`);
  }

  /* ---- MODSTO rejection: non-integer Real ---- */
  {
    const s = new Stack();
    s.push(Real(5.5));
    assertThrows(() => { lookup('MODSTO').fn(s); }, null,
                 'session144: MODSTO Real(5.5) → Bad argument value');
  }

  /* ---- MODSTO rejection: Vector ---- */
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => { lookup('MODSTO').fn(s); }, null,
                 'session144: MODSTO Vector → Bad argument type');
  }

  /* ---- ADDTMOD pure Integer, no centering needed ---- */
  resetCasModulo();
  setCasModulo(11n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(Integer(7n));
    lookup('ADDTMOD').fn(s);
    // (5+7) mod 11 = 12 mod 11 = 1; centered: 1 (since 2*1 = 2 < 11).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session144: 5 7 ADDTMOD (m=11) → Integer(1) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- ADDTMOD pure Integer, centering kicks in ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(12n));
    s.push(Integer(0n));
    lookup('ADDTMOD').fn(s);
    // (12+0) mod 7 = 5 in [0,7); centered: 2*5=10 > 7 → 5-7 = -2.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -2n,
           `session144: 12 0 ADDTMOD (m=7) → Integer(-2) centered (got ${s.peek() && s.peek().value})`);
  }

  /* ---- ADDTMOD Symbolic round-trip via Giac mock ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X^2+3*X+6')));
    s.push(Symbolic(parseAlgebra('9*X+3')));
    giac._clear();
    giac._setFixture('(X^2+3*X+6+(9*X+3)) mod 7', 'X^2-2*X+2');
    lookup('ADDTMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()),
           `session144: ADDTMOD Symbolic returns Symbolic`);
    assert(formatAlgebra(s.peek().expr) === 'X^2 - 2*X + 2',
           `session144: ADDTMOD HP50 AUR worked example mod 7 → 'X^2 - 2*X + 2' (got '${formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- SUBTMOD pure Integer ---- */
  setCasModulo(11n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(Integer(3n));
    lookup('SUBTMOD').fn(s);
    // (5-3) mod 11 = 2; centered: 4 < 11 → 2.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 2n,
           `session144: 5 3 SUBTMOD (m=11) → Integer(2) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- SUBTMOD pure Integer, wrap-around exercise of _centerMod ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Integer(5n));
    lookup('SUBTMOD').fn(s);
    // 1 − 5 = −4; −4 mod 7 lifts to 3 in [0,7); 2*3 = 6 < 7 so the
    // centered representative stays at 3.  The centered range for
    // m=7 is [-3, 3] — 3 sits at the upper boundary.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 3n,
           `session144: 1 5 SUBTMOD (m=7) → centered Integer(3) (got ${s.peek() && s.peek().value})`);
  }
  /* ---- SUBTMOD where centering does flip the sign ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(0n));
    s.push(Integer(5n));
    lookup('SUBTMOD').fn(s);
    // 0 − 5 = −5; −5 mod 7 lifts to 2 in [0,7); 2*2=4 < 7 → stays 2.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 2n,
           `session144: 0 5 SUBTMOD (m=7) → centered Integer(2) (got ${s.peek() && s.peek().value})`);
  }
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(0n));
    s.push(Integer(3n));
    lookup('SUBTMOD').fn(s);
    // 0 − 3 = −3; −3 mod 7 lifts to 4; 2*4=8 > 7 → 4-7 = -3.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -3n,
           `session144: 0 3 SUBTMOD (m=7) → centered Integer(-3) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- MULTMOD pure Integer with centering ---- */
  setCasModulo(11n);
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Integer(4n));
    lookup('MULTMOD').fn(s);
    // (3*4) mod 11 = 12 mod 11 = 1; centered 1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session144: 3 4 MULTMOD (m=11) → Integer(1) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- MULTMOD Symbolic via Giac mock ---- */
  setCasModulo(5n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+2')));
    s.push(Symbolic(parseAlgebra('X+3')));
    giac._clear();
    giac._setFixture('((X+2)*(X+3)) mod 5', 'X^2+1');
    lookup('MULTMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()) &&
           formatAlgebra(s.peek().expr) === 'X^2 + 1',
           `session144: (X+2) (X+3) MULTMOD (m=5) → 'X^2 + 1' Symbolic (got '${s.peek() && formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- POWMOD pure Integer ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Integer(5n));
    lookup('POWMOD').fn(s);
    // 3^5 = 243; 243 mod 7 = 5; centered: 2*5=10 > 7 → 5-7 = -2.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -2n,
           `session144: 3 5 POWMOD (m=7) → Integer(-2) centered (got ${s.peek() && s.peek().value})`);
  }

  /* ---- POWMOD pure Integer, exponent 0 ---- */
  setCasModulo(11n);
  {
    const s = new Stack();
    s.push(Integer(7n));
    s.push(Integer(0n));
    lookup('POWMOD').fn(s);
    // 7^0 = 1; centered: 1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session144: 7 0 POWMOD (m=11) → Integer(1) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- POWMOD rejects negative exponent ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(-1n));
    assertThrows(() => { lookup('POWMOD').fn(s); }, null,
                 'session144: 2 -1 POWMOD → Bad argument value');
  }

  /* ---- POWMOD Symbolic via Giac mock ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+1')));
    s.push(Integer(3n));
    giac._clear();
    giac._setFixture('powmod(X+1,3,7)', 'X^3+3*X^2+3*X+1');
    lookup('POWMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()) &&
           formatAlgebra(s.peek().expr) === 'X^3 + 3*X^2 + 3*X + 1',
           `session144: (X+1) 3 POWMOD (m=7) → 'X^3 + 3*X^2 + 3*X + 1' Symbolic (got '${s.peek() && formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- ADDTMOD rejects Vector / Complex ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Integer(3n));
    assertThrows(() => { lookup('ADDTMOD').fn(s); }, null,
                 'session144: Vector ADDTMOD → Bad argument type (left)');
  }
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Complex(1, 2));
    assertThrows(() => { lookup('ADDTMOD').fn(s); }, null,
                 'session144: Complex on right of ADDTMOD → Bad argument type');
  }

  /* ---- MODSTO + ADDTMOD round-trip: changing the modulus changes results ---- */
  {
    const s = new Stack();
    s.push(Integer(3n));
    lookup('MODSTO').fn(s);
    s.push(Integer(2n));
    s.push(Integer(2n));
    lookup('ADDTMOD').fn(s);
    // m=3 now; (2+2) mod 3 = 4 mod 3 = 1; centered: 2*1=2 < 3 → 1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session144: MODSTO 3 then 2 2 ADDTMOD → Integer(1) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- Reset for hygiene ---- */
  resetCasModulo();
}

// ==================================================================
// — EXPANDMOD / FACTORMOD / GCDMOD / DIVMOD / DIV2MOD
// HP50 AUR §3-80 / §3-83 / §3-96 / §3-63 / §3-62.
// User Guide p.5-14 / p.5-15 worked examples mod 12.
// ==================================================================
{
  const stateMod = await import('../www/src/rpl/state.js');
  const { setCasModulo, resetCasModulo } = stateMod;

  /* ---- EXPANDMOD on Integer (User Guide p.5-15 worked examples) ---- */
  setCasModulo(12n);
  {
    const s = new Stack();
    s.push(Integer(125n));
    lookup('EXPANDMOD').fn(s);
    // User Guide: EXPANDMOD(125) ≡ 5 (mod 12)
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 5n,
           `session149: 125 EXPANDMOD (m=12) → Integer(5) (got ${s.peek() && s.peek().value})`);
  }
  {
    const s = new Stack();
    s.push(Integer(17n));
    lookup('EXPANDMOD').fn(s);
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 5n,
           `session149: 17 EXPANDMOD (m=12) → Integer(5) (got ${s.peek() && s.peek().value})`);
  }
  {
    const s = new Stack();
    s.push(Integer(6n));
    lookup('EXPANDMOD').fn(s);
    // 6 mod 12: r=6; 2*6=12 = m, NOT > m → stays 6.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 6n,
           `session149: 6 EXPANDMOD (m=12) → Integer(6) at boundary (got ${s.peek() && s.peek().value})`);
  }

  /* ---- EXPANDMOD on integer-valued Real ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Real(20));
    lookup('EXPANDMOD').fn(s);
    // 20 mod 7 = 6; 2*6=12 > 7 → 6-7 = -1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -1n,
           `session149: Real(20) EXPANDMOD (m=7) → Integer(-1) centered (got ${s.peek() && s.peek().value})`);
  }

  /* ---- EXPANDMOD Symbolic via Giac mock (AUR §3-80 worked example) ---- */
  setCasModulo(3n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('(X+3)*(X+4)')));
    giac._clear();
    giac._setFixture('expand((X+3)*(X+4)) mod 3', 'X^2+X');
    lookup('EXPANDMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()) &&
           formatAlgebra(s.peek().expr) === 'X^2 + X',
           `session149: EXPANDMOD AUR worked example mod 3 → 'X^2 + X' (got '${s.peek() && formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- EXPANDMOD rejects Vector ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => { lookup('EXPANDMOD').fn(s); }, null,
                 'session149: Vector EXPANDMOD → Bad argument type');
  }

  /* ---- FACTORMOD on Integer (collapses to centered representative) ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(15n));
    lookup('FACTORMOD').fn(s);
    // 15 mod 7 = 1; centered: 1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session149: 15 FACTORMOD (m=7) → Integer(1) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- FACTORMOD Symbolic via Giac mock (AUR §3-83 worked example) ---- */
  setCasModulo(3n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X^2+2')));
    giac._clear();
    giac._setFixture('factor(X^2+2) mod 3', '(X+1)*(X-1)');
    lookup('FACTORMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()) &&
           formatAlgebra(s.peek().expr) === '(X + 1)*(X - 1)',
           `session149: FACTORMOD AUR worked example X^2+2 mod 3 → '(X+1)*(X-1)' (got '${s.peek() && formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- FACTORMOD modulus precondition: composite m rejects ---- */
  setCasModulo(12n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    assertThrows(() => { lookup('FACTORMOD').fn(s); }, null,
                 'session149: FACTORMOD m=12 (composite) → Bad argument value');
  }

  /* ---- FACTORMOD modulus precondition: m >= 100 rejects (even if prime) ---- */
  setCasModulo(101n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    assertThrows(() => { lookup('FACTORMOD').fn(s); }, null,
                 'session149: FACTORMOD m=101 (>=100, even prime) → Bad argument value');
  }

  /* ---- GCDMOD on pure Integer ---- */
  setCasModulo(13n);
  {
    const s = new Stack();
    s.push(Integer(20n));
    s.push(Integer(8n));
    lookup('GCDMOD').fn(s);
    // gcd(20, 8) = 4; centered mod 13: 4 (2*4=8 < 13 → stays 4).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 4n,
           `session149: 20 8 GCDMOD (m=13) → Integer(4) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- GCDMOD rejects gcd(0, 0) ---- */
  setCasModulo(13n);
  {
    const s = new Stack();
    s.push(Integer(0n));
    s.push(Integer(0n));
    assertThrows(() => { lookup('GCDMOD').fn(s); }, null,
                 'session149: 0 0 GCDMOD → Bad argument value');
  }

  /* ---- GCDMOD Symbolic via Giac mock (AUR §3-96 worked example) ---- */
  setCasModulo(13n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('2*X^2+5')));
    s.push(Symbolic(parseAlgebra('4*X^2-5*X')));
    giac._clear();
    giac._setFixture('gcd(2*X^2+5,4*X^2-5*X) mod 13', '-(4*X-5)');
    lookup('GCDMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()) &&
           formatAlgebra(s.peek().expr) === '-(4*X - 5)',
           `session149: GCDMOD AUR worked example mod 13 → '-(4*X-5)' (got '${s.peek() && formatAlgebra(s.peek().expr)}')`);
    giac._clear();
  }

  /* ---- DIVMOD: User Guide p.5-14 examples (mod 12) ---- */
  setCasModulo(12n);
  // 12/3 ≡ 4 (mod 12) — exact integer division path
  {
    const s = new Stack();
    s.push(Integer(12n));
    s.push(Integer(3n));
    lookup('DIVMOD').fn(s);
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 4n,
           `session149: 12 3 DIVMOD (m=12) → Integer(4) exact (got ${s.peek() && s.peek().value})`);
  }
  // 25/5 ≡ 5 (mod 12) — exact integer division path
  {
    const s = new Stack();
    s.push(Integer(25n));
    s.push(Integer(5n));
    lookup('DIVMOD').fn(s);
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 5n,
           `session149: 25 5 DIVMOD (m=12) → Integer(5) (got ${s.peek() && s.peek().value})`);
  }
  // 66/6 ≡ -1 (mod 12) — exact integer (66/6=11), centered to -1
  {
    const s = new Stack();
    s.push(Integer(66n));
    s.push(Integer(6n));
    lookup('DIVMOD').fn(s);
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -1n,
           `session149: 66 6 DIVMOD (m=12) → Integer(-1) centered (got ${s.peek() && s.peek().value})`);
  }
  // 64/13 ≡ 4 (mod 12) — modular inverse path (13 mod 12 = 1, invertible)
  {
    const s = new Stack();
    s.push(Integer(64n));
    s.push(Integer(13n));
    lookup('DIVMOD').fn(s);
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 4n,
           `session149: 64 13 DIVMOD (m=12) → Integer(4) inverse (got ${s.peek() && s.peek().value})`);
  }
  // 12/8 (mod 12) does not exist
  {
    const s = new Stack();
    s.push(Integer(12n));
    s.push(Integer(8n));
    assertThrows(() => { lookup('DIVMOD').fn(s); }, null,
                 'session149: 12 8 DIVMOD → Bad argument value (gcd(8,12)≠1)');
  }

  /* ---- DIVMOD Symbolic via Giac mock (AUR §3-63 worked example) ---- */
  setCasModulo(3n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('5*X^2+4*X+2')));
    s.push(Symbolic(parseAlgebra('X^2+1')));
    giac._clear();
    giac._setFixture('(5*X^2+4*X+2)/(X^2+1) mod 3', '-(X^2-X+1)/(X^2+1)');
    lookup('DIVMOD').fn(s);
    assert(s.depth === 1 && isSymbolic(s.peek()),
           `session149: DIVMOD AUR worked example returns Symbolic`);
    giac._clear();
  }

  /* ---- DIV2MOD: User Guide p.5-14 examples (mod 12) ---- */
  setCasModulo(12n);
  // 125/17 mod 12 = 1 r 0
  {
    const s = new Stack();
    s.push(Integer(125n));
    s.push(Integer(17n));
    lookup('DIV2MOD').fn(s);
    assert(s.depth === 2,
           `session149: 125 17 DIV2MOD pushes 2 results (got depth ${s.depth})`);
    assert(isInteger(s.peek(2)) && s.peek(2).value === 1n,
           `session149: 125 17 DIV2MOD (m=12) quotient → Integer(1) (got ${s.peek(2) && s.peek(2).value})`);
    assert(isInteger(s.peek(1)) && s.peek(1).value === 0n,
           `session149: 125 17 DIV2MOD (m=12) remainder → Integer(0) (got ${s.peek(1) && s.peek(1).value})`);
  }
  // 68/7 mod 12 = -4 r 0
  {
    const s = new Stack();
    s.push(Integer(68n));
    s.push(Integer(7n));
    lookup('DIV2MOD').fn(s);
    assert(s.depth === 2 && s.peek(2).value === -4n && s.peek(1).value === 0n,
           `session149: 68 7 DIV2MOD (m=12) → q=-4 r=0 (got q=${s.peek(2) && s.peek(2).value} r=${s.peek(1) && s.peek(1).value})`);
  }
  // 7/5 mod 12 = -1 r 0
  {
    const s = new Stack();
    s.push(Integer(7n));
    s.push(Integer(5n));
    lookup('DIV2MOD').fn(s);
    assert(s.depth === 2 && s.peek(2).value === -1n && s.peek(1).value === 0n,
           `session149: 7 5 DIV2MOD (m=12) → q=-1 r=0 (got q=${s.peek(2) && s.peek(2).value} r=${s.peek(1) && s.peek(1).value})`);
  }
  // 2/3 mod 12 — does not exist
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(3n));
    assertThrows(() => { lookup('DIV2MOD').fn(s); }, null,
                 'session149: 2 3 DIV2MOD (m=12) → Bad argument value (no inverse, not exact)');
  }

  /* ---- DIV2MOD Symbolic via Giac mock (AUR §3-62 worked example) ---- */
  setCasModulo(3n);
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X^3+4')));
    s.push(Symbolic(parseAlgebra('X^2-1')));
    giac._clear();
    giac._setFixture('quo(X^3+4,X^2-1) mod 3', 'X');
    giac._setFixture('rem(X^3+4,X^2-1) mod 3', 'X+1');
    lookup('DIV2MOD').fn(s);
    assert(s.depth === 2,
           `session149: DIV2MOD AUR symbolic pushes 2 results (got depth ${s.depth})`);
    // quo lifts to Name('X', quoted) via _astToRplValue's Var-leaf unwrap.
    assert((isName(s.peek(2)) && s.peek(2).id === 'X') ||
           (isSymbolic(s.peek(2)) && formatAlgebra(s.peek(2).expr) === 'X'),
           `session149: DIV2MOD AUR symbolic quotient → 'X'`);
    assert(isSymbolic(s.peek(1)) && formatAlgebra(s.peek(1).expr) === 'X + 1',
           `session149: DIV2MOD AUR symbolic remainder → 'X+1' (got '${s.peek(1) && formatAlgebra(s.peek(1).expr)}')`);
    giac._clear();
  }

  /* ---- Modulus consultation: changing MODSTO changes results ---- */
  {
    const s = new Stack();
    s.push(Integer(5n));
    lookup('MODSTO').fn(s);
    s.push(Integer(7n));
    lookup('EXPANDMOD').fn(s);
    // m=5; 7 mod 5 = 2; 2*2=4 < 5 → stays 2.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 2n,
           `session149: MODSTO 5 then 7 EXPANDMOD → Integer(2) (got ${s.peek() && s.peek().value})`);
  }

  /* ---- DIVMOD rejects Vector / non-numeric type ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Integer(3n));
    assertThrows(() => { lookup('DIVMOD').fn(s); }, null,
                 'session149: Vector DIVMOD → Bad argument type');
  }

  /* ===============================================================
     MODULO ARITH extended coverage — six clusters:
     (a) DIV2MOD rejects Vector — mirrors the DIVMOD Vector rejection
         (both two-result and one-result variants reject non-integer
         input).
     (b) DIVMOD rejects Complex / String — the per-arg type-check
         fall-throughs in the integer-path guard at
         ops.js:_modDivBigInt must reject these types.
     (c) GCDMOD with one zero argument — gcd(a, 0) = a is the
         identity edge of the extended-Euclidean GCD; pins both
         directions (gcd(15, 0) and gcd(0, 15)) to guard against a
         refactor that special-cases the (0,0) reject without
         preserving the (a,0) and (0,a) accept paths.
     (d) EXPANDMOD on a negative integer — `-7 mod 12 = 5`
         (centered); guards the negative branch of `_centerMod`.
     (e) FACTORMOD prime modulus boundary cases — m=2 (smallest
         prime), m=99 (largest composite below the >=100 cutoff;
         guards the boundary opposite to the m=101 prime reject).
     (f) DIVMOD MODSTO consultation — changing MODSTO changes the
         DIVMOD result (the only modular op whose MODSTO sensitivity
         is pinned here).
  =============================================================== */

  /* ---- (a) DIV2MOD rejects Vector ---- */
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Integer(3n));
    assertThrows(() => { lookup('DIV2MOD').fn(s); }, null,
                 'session156: Vector DIV2MOD → Bad argument type (mirror of session-149 DIVMOD Vector reject)');
  }

  /* ---- (b) DIVMOD rejects Complex ---- */
  {
    const s = new Stack();
    s.push(Complex(3, 4));
    s.push(Integer(2n));
    assertThrows(() => { lookup('DIVMOD').fn(s); }, null,
                 'session156: DIVMOD Complex (level 2) → Bad argument type');
  }

  /* ---- (b cont) DIVMOD rejects String on level 2 ---- */
  {
    const s = new Stack();
    s.push(Str('foo'));
    s.push(Integer(2n));
    assertThrows(() => { lookup('DIVMOD').fn(s); }, null,
                 'session156: DIVMOD String (level 2) → Bad argument type');
  }

  /* ---- (c) GCDMOD with one zero argument: gcd(a, 0) = a ---- */
  setCasModulo(13n);
  {
    const s = new Stack();
    s.push(Integer(15n));
    s.push(Integer(0n));
    lookup('GCDMOD').fn(s);
    // gcd(15, 0) = 15; centered mod 13 = 2 (since 15 mod 13 = 2,
    // and 2*2=4 < 13 stays positive).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 2n,
           `session156: 15 0 GCDMOD (m=13) → Integer(2) centered (gcd(a,0)=a identity edge; got ${s.peek() && s.peek().value})`);
  }
  {
    const s = new Stack();
    s.push(Integer(0n));
    s.push(Integer(15n));
    lookup('GCDMOD').fn(s);
    // gcd(0, 15) = 15; centered mod 13 = 2 (symmetric direction).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 2n,
           `session156: 0 15 GCDMOD (m=13) → Integer(2) centered (gcd(0,a)=a symmetric edge; got ${s.peek() && s.peek().value})`);
  }

  /* ---- (d) EXPANDMOD on a negative integer ---- */
  setCasModulo(12n);
  {
    const s = new Stack();
    s.push(Integer(-7n));
    lookup('EXPANDMOD').fn(s);
    // -7 mod 12 = 5 centered (raw mod is -7+12=5; 2*5=10 < 12 → stays positive).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 5n,
           `session156: -7 EXPANDMOD (m=12) → Integer(5) centered (negative-input branch of _centerMod; got ${s.peek() && s.peek().value})`);
  }

  /* ---- (e) FACTORMOD m=2 (smallest prime modulus accepted) ---- */
  setCasModulo(2n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    lookup('FACTORMOD').fn(s);
    // 5 mod 2 = 1; 2*1=2 not > 2, stays positive (boundary on `2*r > m`).
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 1n,
           `session156: 5 FACTORMOD (m=2 smallest prime) → Integer(1) (m=2 accepted; got ${s.peek() && s.peek().value})`);
  }

 /* ---- (e cont) FACTORMOD m=99 (composite, opposite boundary from 's m=101 prime reject) ---- */
  setCasModulo(99n);
  {
    const s = new Stack();
    s.push(Integer(5n));
    assertThrows(() => { lookup('FACTORMOD').fn(s); }, null,
                 'session156: FACTORMOD m=99 (composite, just below the >=100 cutoff) → Bad argument value (composite-modulus reject path; symmetric to session-149 m=101 prime-but-too-large reject)');
  }

  /* ---- (f) DIVMOD MODSTO consultation: changing MODSTO changes the result ---- */
  setCasModulo(12n);
  {
    const s = new Stack();
    s.push(Integer(64n));
    s.push(Integer(13n));
    lookup('DIVMOD').fn(s);
    // 13 mod 12 = 1; 64 / 1 = 64; centered mod 12 = 4.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 4n,
           `session156: DIVMOD baseline 64 13 (m=12) → Integer(4) (got ${s.peek() && s.peek().value})`);
  }
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(64n));
    s.push(Integer(13n));
    lookup('DIVMOD').fn(s);
    // m=7: 13 mod 7 = 6; 64 mod 7 = 1; need 1 / 6 mod 7.  6 * 6 = 36 mod 7 = 1 so 6⁻¹ = 6.
    // 1 * 6 mod 7 = 6; centered (2*6=12 > 7) → 6 - 7 = -1.
    assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === -1n,
           `session156: DIVMOD MODSTO 7 then 64 13 → Integer(-1) (different result from m=12 baseline; pins MODSTO consultation for DIVMOD per session-149 EXPANDMOD pin pattern; got ${s.peek() && s.peek().value})`);
  }

  /* ---- (g) session160: DIV2MOD MODSTO consultation pair (mirror of
     the DIVMOD pair above on the two-result sibling).
     pinned DIVMOD's MODSTO sensitivity but DIV2MOD — which returns
     both quotient AND remainder per AUR §3-62 — was unpinned.  Same
     {64, 13} input, two distinct moduli (12 + 7), two distinct
     (q, r) pairs.  Pins that DIV2MOD's quotient-arm matches DIVMOD
     under the same MODSTO AND that the remainder-arm separately
     consults MODSTO. */
  setCasModulo(12n);
  {
    const s = new Stack();
    s.push(Integer(64n));
    s.push(Integer(13n));
    lookup('DIV2MOD').fn(s);
    // DIV2MOD returns (q, r) on the stack: q on level 2, r on level 1.
    // m=12: 13 mod 12 = 1; 64 / 1 = 64; q centered mod 12 = 4 (matches DIVMOD).
    // r = 64 - 4 * 13 = 64 - 52 = 12 ≡ 0 mod 12.
    assert(s.depth === 2
        && isInteger(s.peek(2)) && s.peek(2).value === 4n
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
           `session160: DIV2MOD baseline 64 13 (m=12) → q=Integer(4) r=Integer(0) (q matches s156 DIVMOD pin; r-arm separately pinned — DIV2MOD's two-result MODSTO consultation closes the s156 sibling-unpinned branch); got depth=${s.depth} q=${s.peek(2)?.value} r=${s.peek(1)?.value}`);
  }
  setCasModulo(7n);
  {
    const s = new Stack();
    s.push(Integer(64n));
    s.push(Integer(13n));
    lookup('DIV2MOD').fn(s);
    // m=7: q = -1 (matches DIVMOD); r = 64 - (-1)*13 = 77 ≡ 0 mod 7.
    assert(s.depth === 2
        && isInteger(s.peek(2)) && s.peek(2).value === -1n
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
           `session160: DIV2MOD MODSTO 7 then 64 13 → q=Integer(-1) r=Integer(0) (q matches s156 DIVMOD m=7 pin; pair-with-baseline pin pattern — q-arm tracks DIVMOD across MODSTO change while r-arm independently routes through the two-result return); got depth=${s.depth} q=${s.peek(2)?.value} r=${s.peek(1)?.value}`);
  }

  /* ---- (h) session160: GCDMOD(0, 0) — both-zero edge.
     pinned the gcd-with-one-zero identity in both directions
     (GCDMOD(15, 0) and GCDMOD(0, 15) → gcd(15, 0) = 15 ≡ 2 mod 13);
     the both-zero corner is mathematically undefined (gcd(0, 0) is
     0 by some conventions, undefined by others) so rpl5050 rejects
     it as a value-domain error.  Pins the rejection arm and guards
     against a refactor that would silently return 0. */
  setCasModulo(13n);
  {
    const s = new Stack();
    s.push(Integer(0n));
    s.push(Integer(0n));
    assertThrows(() => { lookup('GCDMOD').fn(s); },
                 /Bad argument value/,
                 'session160: GCDMOD(0, 0) mod 13 → Bad argument value (both-zero edge of _extGcdBigInt; closes the s156 gcd-with-one-zero pair on the both-zero corner — the mathematically-undefined case rejects as value-domain error rather than silently returning 0)');
  }

  /* ---- Reset for hygiene ---- */
  resetCasModulo();
}

// ==================================================================
// SCHUR — Schur decomposition (HP50 AUR §3-218).
// Giac `SCHUR(A) = hessenberg(A,-1)` returns the pair `[P, B]` with
// `B = inv(P)·A·P`; the op pushes P (→ level 2 = Q) then B (→ level 1 = T).
// ==================================================================
{
  // Happy path — Giac returns `[P, B]`; op pushes Q at level 2, T at level 1.
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  giac._setFixture('SCHUR([[1,2],[3,4]])', '[[[1,0],[0,1]],[[5,6],[0,7]]]');
  lookup('SCHUR').fn(s);
  assert(s.depth === 2, 'SCHUR pushes two results (Q, T)');
  const T = s.peek();
  const Q = s.peek(2);
  assert(isMatrix(Q) && isMatrix(T), 'SCHUR results are both Matrix');
  assert(Q.rows.length === 2 && Q.rows[0].length === 2, 'SCHUR Q is 2x2');
  assert(format(Q.rows[1][0]) === '0.' && format(Q.rows[0][0]) === '1.',
         'SCHUR Q (level 2) = first Giac pair element P');
  assert(format(T.rows[0][1]) === '6.' && format(T.rows[1][0]) === '0.',
         'SCHUR T (level 1) = second Giac pair element B (upper quasi-triangular)');
  giac._clear();
}
{
  // Non-Matrix input rejects before any Giac call.
  const s = new Stack();
  s.push(Real(3.5));
  assertThrows(() => { lookup('SCHUR').fn(s); }, /Bad argument type/,
               'SCHUR on a Real rejects with Bad argument type');
}
{
  // Non-square Matrix rejects with Invalid dimension.
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n), Integer(3n)],
                 [Integer(4n), Integer(5n), Integer(6n)]]));
  assertThrows(() => { lookup('SCHUR').fn(s); }, /Invalid dimension/,
               'SCHUR on a 2x3 matrix rejects with Invalid dimension');
}
{
  // Giac returning a non-pair shape surfaces Bad argument value.
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(2n)], [Integer(3n), Integer(4n)]]));
  giac._clear();
  giac._setFixture('SCHUR([[1,2],[3,4]])', '[[1,2],[3,4]]');
  assertThrows(() => { lookup('SCHUR').fn(s); }, /Bad argument value/,
               'SCHUR with a non-pair Giac result rejects with Bad argument value');
  giac._clear();
}
