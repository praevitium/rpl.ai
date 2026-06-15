/* =================================================================
   Symbolic-algebra module — core of the HP50 CAS.

   Covers: parse / format / simplify / expand / factor / differentiate
   / integrate / solve for polynomial-ish expressions with a small set
   of known transcendental functions (SIN, COS, LN, EXP, SQRT, …).
   The AST is deliberately small; all nodes are plain frozen objects
   so they are cheap to compare and share.

     { kind: 'num', value: number }
     { kind: 'var', name: string }
     { kind: 'neg', arg: <node> }
     { kind: 'bin', op: '+'|'-'|'*'|'/'|'^', l: <node>, r: <node> }
     { kind: 'fn',  name: string, args: <node>[] }

   Why small?  The visible feature is:
     `'X^2 + 3*X + 1' 'X' DERIV  →  '2*X + 3'`
   and we want that to work end-to-end with a parser, a simplifier that
   keeps the output readable (drops 0s, collapses 1*x, merges numeric
   constants), a printer that parenthesises only where needed, and a
   differentiator that implements sum / product / quotient / power rules.

   Deliberate non-goals:
     - rational simplification across the whole tree (common-denom,
       cancellation).  The simplifier is strictly local (each op makes
       one pattern-match pass over its immediate children).
   ================================================================= */

export function Num(v) {
  return Object.freeze({ kind: 'num', value: Number(v) });
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
/** Function-call node.  Uppercasing happens inside the ctor so callers
 *  can pass either case and structural comparisons stay simple. */
export function Fn(name, args) {
  return Object.freeze({
    kind: 'fn',
    name: String(name).toUpperCase(),
    args: Object.freeze([...args]),
  });
}

export const isNum = n => n && n.kind === 'num';
export const isVar = n => n && n.kind === 'var';
export const isNeg = n => n && n.kind === 'neg';
export const isBin = n => n && n.kind === 'bin';
export const isFn  = n => n && n.kind === 'fn';

export function astEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'num') return a.value === b.value;
  if (a.kind === 'var') return a.name === b.name;
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

/* KNOWN_FUNCTIONS is the whitelist of identifiers the algebra parser
 * accepts as `NAME(args)` call syntax.  Anything NOT on this list falls
 * through to the "implicit multiplication is not supported" / quoted
 * Name path so the parser still refuses gracefully.
 *
 * Each entry carries the arity (currently always 1 — multi-arg funcs
 * like MIN/MAX/LOG-base aren't part of this slice) and an optional
 * numeric evaluator used by simplify() for constant folding and by
 * the Symbolic-EVAL code path in ops.js to reduce bound-variable
 * expressions to a single Real.
 *
 * The angle-mode-sensitive trig functions (SIN/COS/TAN/ASIN/ACOS/ATAN)
 * do NOT carry a direct numeric evaluator here — they're applied in
 * ops.js via toRadians/fromRadians so the active DEG/RAD/GRD mode is
 * honored.  For constant folding we refuse to fold those (they'd be
 * wrong under DEG mode), leaving them symbolic.
 */
export const KNOWN_FUNCTIONS = Object.freeze({
  // Non-trig: numeric eval is mode-independent, safe to fold at
  // simplify time.  Domain errors (LN of negative, SQRT of negative)
  // fall back to "leave symbolic" rather than producing NaN.
  LN:   { arity: 1, eval: x => x > 0 ? Math.log(x) : null },
  LOG:  { arity: 1, eval: x => x > 0 ? Math.log10(x) : null },
  EXP:  { arity: 1, eval: x => Math.exp(x) },
  ALOG: { arity: 1, eval: x => Math.pow(10, x) },
  SQRT: { arity: 1, eval: x => x >= 0 ? Math.sqrt(x) : null },
  ABS:  { arity: 1, eval: x => Math.abs(x) },
  // Trig / inverse trig.  simplify() only folds the zero cases
  // (SIN(0)=0, COS(0)=1, TAN(0)=0, ASIN(0)=0, ACOS(0) would depend on
  // mode, ATAN(0)=0) — see simplifyFn() for details.  Generic folding
  // is deferred to the EVAL path, which has access to the angle mode.
  SIN:  { arity: 1 },
  COS:  { arity: 1 },
  TAN:  { arity: 1 },
  ASIN: { arity: 1 },
  ACOS: { arity: 1 },
  ATAN: { arity: 1 },
  // Hyperbolic / inverse hyperbolic.  Parser recognises `SINH(-X)` etc.
  // as function calls rather than word-splitting; unlocks the odd/even
  // symbolic rewrites below.  Numeric eval is mode-independent (no
  // degrees/radians for hyp fns) so these are safe to fold on Num args
  // at simplify time.
  SINH:  { arity: 1, eval: Math.sinh },
  COSH:  { arity: 1, eval: Math.cosh },
  TANH:  { arity: 1, eval: Math.tanh },
  ASINH: { arity: 1, eval: Math.asinh },
  ACOSH: { arity: 1, eval: x => x >= 1 ? Math.acosh(x) : null },
  ATANH: { arity: 1, eval: x => (x > -1 && x < 1) ? Math.atanh(x) : null },
  // Factorial.  Only non-negative integer-valued Reals are folded here;
  // fractional/negative values are left symbolic at simplify time — the
  // stack op FACT uses a Lanczos gamma approximation, but the simplifier
  // should not inject floating-point gamma values into what the user
  // wrote symbolically.  Non-integer-valued numeric arg → leave as FACT(x).
  FACT: { arity: 1, eval: x => {
    if (!Number.isInteger(x) || x < 0) return null;
    if (x > 170) return null; // overflow — leave symbolic
    let acc = 1;
    for (let i = 2; i <= x; i++) acc *= i;
    return acc;
  } },
  // XROOT(y, x) = the x-th root of y = y^(1/x).  Parser accepts
  // `'XROOT(2, 3)'` at the entry line and the resulting Symbolic
  // round-trips.  Numeric eval is defined for (y >= 0, x > 0);
  // negative-radicand or non-integer-index cases fall back to symbolic
  // (null) so nothing spuriously folds to NaN.
  XROOT: { arity: 2, eval: (y, x) => {
    if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
    if (x === 0) return null;
    if (y < 0) return null;                 // symbolic for neg. radicand
    return Math.pow(y, 1 / x);
  } },
  // SUM/INTEG carry no numeric evaluator — they're symbolic wrappers
  // surfaced by the Σ / ∫ keys.  Listing them here lets the parser
  // recognise `SUM(...)` and `INTEG(...)` as function calls so
  // symbolic results round-trip through the entry line.
  SUM:   { arity: 1 },
  INTEG: { arity: 2 },
  // Heaviside step and Dirac delta.  Heaviside has a well-defined
  // numeric evaluator (0 for x < 0, 1 for x ≥ 0).  Dirac is zero at
  // every non-zero real and a distribution at zero; we fold only the
  // zero case (leave symbolic) and the non-zero case (evaluates to 0).
  // Used as LAPLACE / ILAP table entries for shifted step and impulse
  // functions.
  HEAVISIDE: { arity: 1, eval: x => x >= 0 ? 1 : 0 },
  DIRAC:     { arity: 1, eval: x => x === 0 ? null : 0 },
  // Type-widening ops.  These lift to AstFn(...) wrappers so
  // `'X' FLOOR` etc. produces a Symbolic rather than an error.  Listing
  // here lets the entry parser recognise the textual form (`FLOOR(X)`)
  // as a function call so the lifted Symbolic round-trips through the
  // entry line.  Numeric evaluators are included where they're safe
  // (mode-independent) so simplify() can fold constant arguments.
  FLOOR: { arity: 1, eval: x => Number.isFinite(x) ? Math.floor(x) : null },
  CEIL:  { arity: 1, eval: x => Number.isFinite(x) ? Math.ceil(x)  : null },
  IP:    { arity: 1, eval: x => Number.isFinite(x) ? Math.trunc(x) : null },
  FP:    { arity: 1, eval: x => Number.isFinite(x) ? x - Math.trunc(x) : null },
  SIGN:  { arity: 1, eval: x => Number.isFinite(x) ? Math.sign(x) : null },
  // ARG is angle-mode-sensitive on non-complex input (π or 0 depending
  // on sign), so no constant-folding evaluator — leave it symbolic at
  // simplify time.  Registered here only for parser round-trip.
  ARG:   { arity: 1 },
  // MOD / MIN / MAX — two-arg variants.  MOD has a safe numeric
  // evaluator (floor-div, sign-of-divisor); MIN / MAX fold cleanly.
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
  // GCD / LCM accept Symbolic/Name operands.  The stack op produces
  // `Symbolic(AstFn('GCD', [l, r]))` when either operand is a Name or
  // Symbolic, and we register the textual form here so it round-trips
  // through `parseEntry`.  Numeric evaluators only fold on non-negative
  // integer-valued Reals — HP50 GCD/LCM reject non-integer Reals, and
  // the simplifier must not invent a fractional folding rule that the
  // stack op itself would refuse.  Polynomial GCD / LCM on true
  // symbolic expressions stays deferred (CAS work).
  GCD: { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    let x = Math.abs(a), y = Math.abs(b);
    while (y !== 0) { [x, y] = [y, x % y]; }
    return x;
  } },
  LCM: { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a === 0 || b === 0) return 0;
    let x = Math.abs(a), y = Math.abs(b);
    while (y !== 0) { [x, y] = [y, x % y]; }
    return Math.abs(a / x * b);
  } },
  // Combinatorial — both arity-2 with integer arguments only.  When
  // either side is a Name/Symbolic the stack op lifts to
  // `Symbolic(AstFn('COMB', [l, r]))`; registering the textual form
  // here lets `'COMB(N, K)'` round-trip through `parseEntry`.  The
  // numeric evaluator only folds valid cases (non-negative integers
  // with m ≤ n) and returns `null` otherwise, so the simplifier leaves
  // bogus argument combos symbolic rather than injecting a nonsense
  // value — the stack op's "Bad argument value" error is the right
  // response at run time, not simplify time.
  COMB:  { arity: 2, eval: (n, m) => {
    if (!Number.isInteger(n) || !Number.isInteger(m)) return null;
    if (n < 0 || m < 0 || m > n) return null;
    let num = 1, den = 1;
    for (let i = 1; i <= m; i++) { num *= (n - m + i); den *= i; }
    return num / den;
  } },
  PERM:  { arity: 2, eval: (n, m) => {
    if (!Number.isInteger(n) || !Number.isInteger(m)) return null;
    if (n < 0 || m < 0 || m > n) return null;
    let out = 1;
    for (let i = 0; i < m; i++) out *= (n - i);
    return out;
  } },
  // Integer-division single-result siblings of IDIV2.  Stack ops lift
  // to Symbolic(AstFn('IQUOT', [l, r])) when either operand is a
  // Name/Symbolic; registering the textual form here lets the entry
  // parser recognise `IQUOT(A, B)` as a function call and round-trip
  // through parseEntry.  Numeric evaluator folds only on integer-valued
  // Reals with a non-zero divisor — matches the stack op's rejections
  // (non-integer → "Bad argument value", zero-divisor → "Infinite
  // result") by returning null rather than inventing a fractional fold
  // or NaN.
  IQUOT: { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (b === 0) return null;
    return Math.trunc(a / b);
  } },
  IREMAINDER: { arity: 2, eval: (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (b === 0) return null;
    return a - Math.trunc(a / b) * b;
  } },
  // Special functions.  GAMMA gets a numeric evaluator that only folds
  // on positive-integer-valued Reals (so simplify produces exact
  // factorials rather than floating-point Γ values); LNGAMMA also only
  // folds when the numeric result is guaranteed finite and
  // mode-independent.  Generic folding on non-integer x is deferred to
  // EVAL — the stack ops handle it via the Lanczos path.
  GAMMA: { arity: 1, eval: x => {
    if (!Number.isFinite(x)) return null;
    if (!Number.isInteger(x)) return null;
    if (x <= 0) return null;          // pole — leave symbolic
    if (x > 171) return null;         // overflow — leave symbolic
    let acc = 1;
    for (let i = 2; i < x; i++) acc *= i;
    return acc;                        // Γ(n) = (n-1)!
  } },
  LNGAMMA: { arity: 1 },
  // STAT-DIST upper tail (terminal numeric op, no symbolic
  // simplification rules to exploit; listed here only for parser
  // round-trip so `'UTPC(4, 9.5)'` works at the entry line).
  UTPC: { arity: 2 },
  // Beta-family special functions + STAT-DIST UTPF / UTPT + erf / erfc.
  // All parser round-trip only: there are no clean symbolic
  // simplification rules for these in the HP50 CAS, and their numeric
  // evaluators all live on the stack side (they need the Lanczos
  // log-gamma / incomplete-beta helpers that the algebra layer does
  // not have).  Entering `'Beta(3, 4)'` therefore survives as a
  // Symbolic; `EVAL` hands it to the stack op which computes the
  // numeric value via _betaScalar.
  // (KNOWN_FUNCTIONS lookups use ident.toUpperCase(), so keep the keys
  // uppercase even when the HP50 spelling is mixed-case — the parser
  // and simplifier both normalise the name before the lookup.  The
  // stack ops stay registered under the mixed-case spelling so a user
  // can type the lowercase form in alpha mode and reach them.)
  BETA: { arity: 2 },
  ERF:  { arity: 1 },
  ERFC: { arity: 1 },
  UTPF: { arity: 3 },
  UTPT: { arity: 2 },
  // Complex-decomposition trio — CONJ / RE / IM.  Stack ops in ops.js
  // lift Name / Symbolic operands to `AstFn('CONJ'|'RE'|'IM', [x])`; the
  // entry-line shape `'CONJ(X)'` / `'RE(X)'` / `'IM(X)'` must round-trip
  // through parseAlgebra for the Symbolic to survive re-entry.  On a
  // Real / Integer argument CONJ / RE are identity and IM is zero, so
  // fold at simplify time to keep constant subtrees clean.
  //   CONJ(Real(5))  →  5       (identity on ℝ)
  //   RE(Real(5))    →  5       (real part of a real is itself)
  //   IM(Real(5))    →  0       (imaginary part of a real is zero)
  // Complex numeric folding is deferred — the algebra AST has no
  // Complex leaf today, so a Num(x) in these slots is real by
  // construction.
  CONJ: { arity: 1, eval: x => Number.isFinite(x) ? x : null },
  RE:   { arity: 1, eval: x => Number.isFinite(x) ? x : null },
  IM:   { arity: 1, eval: x => Number.isFinite(x) ? 0 : null },
  // Stable-near-zero log / exp.  Same numeric contracts as LN / EXP for
  // the non-degenerate cases; safe to fold at simplify time because
  // Math.log1p / Math.expm1 are mode-independent.  LNP1(x) has a domain
  // cutoff at x ≤ -1 (log of zero or negative) — mirror LN's behaviour
  // of leaving symbolic at the domain edge rather than injecting ±∞.
  LNP1: { arity: 1, eval: x => Number.isFinite(x) && x > -1 ? Math.log1p(x) : null },
  EXPM: { arity: 1, eval: x => Number.isFinite(x) ? Math.expm1(x) : null },
  // HP50 real-decomposition — XPON / MANT.  For `x = m·10^e` with
  // 1 ≤ |m| < 10, XPON returns `e` and MANT returns `m`.  x = 0 is the
  // convention special-case: XPON(0) = 0, MANT(0) = 0.  Both folds
  // mirror the stack ops exactly (see `_xponOf` in ops.js).
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
  // TRUNC — CAS-form truncate-to-n-places.  Symbolic lift happens when
  // either operand is a Name / Symbolic, so the entry-line round-trip is
  // `'TRUNC(X, 3)'`.  No numeric evaluator at simplify time: the stack
  // op rejects n outside [-11, 11] and only produces numeric output for
  // n ≥ 0 in decimal-places mode (n < 0 is significant-figures, which
  // depends on MANT / XPON internally — leave that path to the stack
  // op rather than duplicating it here).  Arity 2, parser-round-trip only.
  TRUNC: { arity: 2 },
  // Special functions — ZETA (Riemann ζ), LAMBERT (principal-branch W₀),
  // PSI (digamma / polygamma).  All have numeric evaluators on the
  // stack side (Euler–Maclaurin, Halley iteration, Bernoulli series),
  // but none is a clean constant-fold at simplify time: the reflection
  // branches / iterative guards only make sense at EVAL time with a
  // concrete arg.  Listed here for entry-line round-trip only.
  //
  // PSI accepts 1 OR 2 args (digamma `PSI(x)`, polygamma `PSI(x, n)`)
  // so `arity` is omitted — the parser's `spec.arity !== undefined`
  // guard then skips the arg-count check.  HP50 AUR §CAS-SPECIAL lists
  // both shapes.
  ZETA:    { arity: 1 },
  LAMBERT: { arity: 1 },
  PSI:     { /* variadic 1 or 2 */ },
  // Ei / Si / Ci — exponential / sine / cosine integrals.  Native numeric
  // evaluators live on the stack side (power series + Lentz CF for Si/Ci;
  // power series + asymptotic + CF for Ei).  Listed here for parser
  // round-trip of the Symbolic lift, e.g. `'Ei(X)'`.  No simplify-time
  // fold: the numeric branches are too involved for a clean closed form,
  // and the fold would race the stack-op's domain errors (Ei(0)
  // `Infinite result`, Ci(x<0) `Bad argument value`).
  EI:      { arity: 1 },
  SI:      { arity: 1 },
  CI:      { arity: 1 },
});

export function isKnownFunction(name) {
  return Object.prototype.hasOwnProperty.call(KNOWN_FUNCTIONS, String(name).toUpperCase());
}

/** Parse an algebraic expression string into an AST.
 *
 *  Grammar (recursive descent with precedence climbing):
 *    EQ := E (CMP E)?           // at most one comparison at top level
 *    CMP:= '=' | '≠' | '<=' | '>=' | '≤' | '≥' | '<' | '>'
 *    E  := T (('+'|'-') T)*
 *    T  := F (('*'|'/') F)*
 *    F  := U ('^' F)?           // right-assoc
 *    U  := '-' U | P
 *    P  := Number | Ident | '(' E ')'
 *
 *  Whitespace is insignificant.  Unknown characters throw.
 *
 *  Comparison ops (`=`, `≠`, `<`, `>`, `≤`, `≥`) all bind LOOSER than
 *  every arithmetic op and only appear at the outermost level.
 *  `'X + 1 = 3'` parses as `Bin('=', X+1, 3)`.  Nested comparisons
 *  (`'(X = Y) + 1'`) are rejected at parse time because parseP's
 *  parenthesis body drops back to parseE, which never looks for a
 *  comparison.  The grammar covers the full HP50 inequality family
 *  so `'X < 5'`, `'Y ≠ 0'`, etc. land as Symbolics rather than
 *  falling through to bare-Name-quoted.
 *
 *  ASCII fallbacks `<=` / `>=` are normalised to the Unicode Bin ops
 *  `≤` / `≥` so downstream formatter / pretty-printer / simplifier
 *  only need to match one shape.
 *
 *  Throws on malformed input — callers (parser.js) catch and fall back
 *  to treating the tick-quoted body as a plain Name.
 */
export function parseAlgebra(src) {
  const s = String(src);
  let i = 0;
  const n = s.length;

  function skip() { while (i < n && /\s/.test(s[i])) i++; }

  function peek() { skip(); return i < n ? s[i] : ''; }

  function eat(ch) {
    skip();
    if (s[i] !== ch) return false;
    i++; return true;
  }

  function expect(ch) {
    if (eat(ch)) return;
    // Soft-close at EOF: if we ran out of input while looking for a ')',
    // accept it silently — matches the parser.js auto-close of `}` / `]` /
    // `>>` for unterminated lists / vectors / programs.  Turns `SIN(X `
    // into `SIN(X)` on entry, same "the user forgot the closer" recovery
    // the rest of the entry surface already does.  Only `)` gets this
    // leniency; comma / other expected chars stay strict because they
    // aren't balanced delimiters.
    if (ch === ')') { skip(); if (i >= n) return; }
    throw new Error(`Expected '${ch}' at pos ${i}`);
  }

  function parseEq() {
    const left = parseE();
    skip();
    // Two-char ASCII comparisons first (so '<=' isn't misread as '<').
    if (s[i] === '<' && s[i + 1] === '=') { i += 2; return Bin('≤', left, parseE()); }
    if (s[i] === '>' && s[i + 1] === '=') { i += 2; return Bin('≥', left, parseE()); }
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
    const left = parseU();
    skip();
    if (s[i] === '^') {
      i++;
      const right = parseF();              // right-assoc: X^Y^Z = X^(Y^Z)
      return Bin('^', left, right);
    }
    return left;
  }

  function parseU() {
    skip();
    if (s[i] === '-') { i++; return Neg(parseU()); }
    if (s[i] === '+') { i++; return parseU(); }
    return parseP();
  }

  function parseP() {
    skip();
    if (i >= n) throw new Error('Unexpected end of expression');
    const c = s[i];

    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d+\.?\d*(?:[eE][-+]?\d+)?|^\.\d+(?:[eE][-+]?\d+)?/);
      if (!m) throw new Error(`Bad number at pos ${i}`);
      i += m[0].length;
      return Num(parseFloat(m[0]));
    }

    if (c === '(') {
      i++;
      const e = parseE();
      expect(')');
      return e;
    }

    // A KNOWN_FUNCTIONS identifier followed by `(` parses as a function
    // call; non-whitelisted `FOO(...)` would be ambiguous with implicit
    // multiplication, so we reject it and let parser.js fall back to a
    // quoted Name.  Identifier chars allow Greek glyphs but no
    // underscores so `2π` still tokenises cleanly.
    if (/[A-Za-zΑ-Ωα-ω]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-zΑ-Ωα-ω][A-Za-zΑ-Ωα-ω0-9]*/);
      i += m[0].length;
      const ident = m[0];
      skip();
      if (s[i] === '(' && isKnownFunction(ident)) {
        i++;
        const args = [];
        args.push(parseE());
        skip();
        while (s[i] === ',') {
          i++;
          args.push(parseE());
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

  const ast = parseEq();
  skip();
  if (i !== n) throw new Error(`Trailing input at pos ${i}: '${s.slice(i)}'`);
  return ast;
}

/* like-terms combiner
 *
 * Extends the local simplifier so any top-level + / - chain over a tree
 * gets its coefficients summed per-variable-body.  Examples:
 *     X + X         →  2*X
 *     2*X + 3*X     →  5*X
 *     X + 2*X + Y   →  3*X + Y
 *     5 + X + 3     →  X + 8     (constants gathered at the tail)
 *     2*X - 3*X     →  -X        (via sign-aware flattening)
 *
 * Non-goals (deliberately left for later passes):
 *   - cross-chain gathering inside * or /  (only + / - chains matter
 *     for basic "like-terms" and that unlocks EXPAND cleanly).
 *   - Normalising product orderings — `X*Y` and `Y*X` stay distinct
 *     keys; HP50 itself is permissive here, and a canonicalizer is
 *     its own feature.
 *
 * The combiner runs at every + / - bin node in simplify() once the
 * children are already simplified.  It is idempotent by construction
 * so re-running it on its own output returns the same tree.
 */

function flattenAddSub(ast, sign, out) {
  // Walks a + / - chain, pulling every additive leaf into `out` as
  // {coef, body} pairs.  `sign` is the running ±1 carried down from
  // any enclosing Neg or '-' operator.  `body === null` marks a pure
  // numeric leaf; those get summed into a single constant later.
  if (isBin(ast) && (ast.op === '+' || ast.op === '-')) {
    flattenAddSub(ast.l, sign, out);
    flattenAddSub(ast.r, ast.op === '+' ? sign : -sign, out);
    return out;
  }
  if (isNeg(ast)) {
    flattenAddSub(ast.arg, -sign, out);
    return out;
  }
  let coef = sign, body = ast;
  if (isNum(ast)) {
    coef = sign * ast.value;
    body = null;
  } else if (isBin(ast) && ast.op === '*') {
    if (isNum(ast.l))      { coef = sign * ast.l.value; body = ast.r; }
    else if (isNum(ast.r)) { coef = sign * ast.r.value; body = ast.l; }
  }
  out.push({ coef, body });
  return out;
}

/* canonicalizeTermBody(body) — given the body of an additive term
 * (after flattenAddSub has already split off any leading Num coef),
 * pull any remaining Num factors out of nested `*` chains into a
 * single numeric extra-coefficient and return both the leftover body
 * (alphabetically-sorted factors, left-assoc) and that extra coef.
 *
 * This is what makes `2*X*Y + 3*Y*X → 5*X*Y` work: the parser
 * produces `(2*X)*Y`, which flattenAddSub sees as `*l = 2*X, *r = Y`
 * (neither side directly a Num) so it can't strip the 2; we strip it
 * here by flattening the whole `*` chain down into its leaves, then
 * segregating the Nums from the non-Nums.  Non-Num factors are
 * sorted alphabetically by their printed form so `X*Y` and `Y*X`
 * canonicalize to the same tree.
 *
 * We do NOT combine matching bases into powers here (`X*X` stays
 * `X*X`, not `X^2`) — that's EXPAND's job, and promoting it into the
 * general simplifier would reshape DERIV's output. */
function canonicalizeTermBody(body) {
  if (!isBin(body) || body.op !== '*') return { coef: 1, body };
  const factors = [];
  (function flatten(n) {
    if (isBin(n) && n.op === '*') { flatten(n.l); flatten(n.r); }
    else factors.push(n);
  })(body);
  let coef = 1;
  const nonNum = [];
  for (const f of factors) {
    if (isNum(f)) coef *= f.value;
    else nonNum.push(f);
  }
  if (nonNum.length === 0) {
    return { coef, body: null };
  }
  // Sort alphabetically by printed form so `X*Y` and `Y*X` canonicalize
  // alike.  Stable — ties keep original order.
  const decorated = nonNum.map((f, i) => ({ f, key: formatAlgebra(f), i }));
  decorated.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
  let out = decorated[0].f;
  for (let k = 1; k < decorated.length; k++) {
    out = Bin('*', out, decorated[k].f);
  }
  return { coef, body: out };
}

function combineLikeTerms(ast) {
  const flat = flattenAddSub(ast, 1, []);
  let constant = 0;
  const terms = [];   // [{ coef, body, key }], first-appearance order
  for (const { coef, body } of flat) {
    if (body === null) { constant += coef; continue; }
    const canon = canonicalizeTermBody(body);
    const fullCoef = coef * canon.coef;
    if (canon.body === null) { constant += fullCoef; continue; }
    const key = formatAlgebra(canon.body);
    const existing = terms.find(t => t.key === key);
    if (existing) existing.coef += fullCoef;
    else terms.push({ coef: fullCoef, body: canon.body, key });
  }
  const kept = terms.filter(t => t.coef !== 0);

  // Build rebuild plan: non-numeric terms first (in first-appearance
  // order), trailing constant last if nonzero.  Each part carries its
  // own sign (+ / -) and its positive-magnitude factor.
  //
  // When body is a `*` chain (multiple factors, post-canonicalization),
  // we prepend the coefficient into the chain left-associatively —
  // otherwise building `Bin('*', Num(mag), body)` would make the
  // formatter add parens around the body (`2*(X*Y)`) because the body
  // is itself a `*` node and `*` is left-associative at print time.
  // Left-folding the coef in front yields `2*X*Y` — cleaner, same AST
  // semantics.
  const parts = [];
  for (const t of kept) {
    const sign = t.coef < 0 ? '-' : '+';
    const mag = Math.abs(t.coef);
    let factor;
    if (mag === 1) {
      factor = t.body;
    } else if (isBin(t.body) && t.body.op === '*') {
      const bodyFactors = [];
      (function flatten(n) {
        if (isBin(n) && n.op === '*') { flatten(n.l); flatten(n.r); }
        else bodyFactors.push(n);
      })(t.body);
      factor = Num(mag);
      for (const f of bodyFactors) factor = Bin('*', factor, f);
    } else {
      factor = Bin('*', Num(mag), t.body);
    }
    parts.push({ sign, factor });
  }
  if (constant !== 0) {
    const sign = constant < 0 ? '-' : '+';
    parts.push({ sign, factor: Num(Math.abs(constant)) });
  }
  if (parts.length === 0) return Num(0);

  let result = parts[0].sign === '-' ? Neg(parts[0].factor) : parts[0].factor;
  for (let i = 1; i < parts.length; i++) {
    result = Bin(parts[i].sign, result, parts[i].factor);
  }
  return result;
}

/** Local simplifier.  Walks the tree once; at each node it applies a
 *  short list of pattern rules to the children (which have already been
 *  simplified).  Examples:
 *    0 + x → x      x + 0 → x
 *    x - 0 → x      0 - x → -x
 *    0 * x → 0      1 * x → x      x * 1 → x
 *    x / 1 → x      0 / x → 0
 *    x ^ 0 → 1      x ^ 1 → x
 *    --x → x
 *    c*X ± d*X → (c ± d)*X    (like-terms combiner)
 *  Pure numeric sub-trees collapse to a single Num.
 *  Identity: `simplify(expr)` is idempotent. */
/* NOTE: simplify, expand, deriv, integ, solve, subst, collectByVar, factor,
 * and replaceVar are internal-only.  Every CAS op (EXPAND/DERIV/INTEG/
 * SOLVE/SUBST/COLLECT/FACTOR/LAPLACE …) routes through Giac, so these
 * functions are retained only as the internal scaffolding of a few other
 * live exports (parseAlgebra uses simplify for `--x → x` collapses at
 * parse time, etc.).  They are NOT re-exported; tests cover the live
 * surface end-to-end through ops. */
function simplify(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;

  if (ast.kind === 'neg') {
    const a = simplify(ast.arg);
    if (isNum(a)) return Num(-a.value);
    if (isNeg(a)) return a.arg;                    // --x → x
    return Neg(a);
  }

  if (ast.kind === 'fn') {
    return simplifyFn(ast);
  }

  const op = ast.op;
  const l = simplify(ast.l);
  const r = simplify(ast.r);

  if (isNum(l) && isNum(r)) {
    switch (op) {
      case '+': return Num(l.value + r.value);
      case '-': return Num(l.value - r.value);
      case '*': return Num(l.value * r.value);
      case '/':
        if (r.value === 0) return Bin('/', l, r);
        return Num(l.value / r.value);
      case '^': return Num(Math.pow(l.value, r.value));
    }
  }

  switch (op) {
    case '+':
      if (isNum(l) && l.value === 0) return r;
      if (isNum(r) && r.value === 0) return l;
      if (isNeg(r)) return simplify(Bin('-', l, r.arg));
      if (isNeg(l)) return simplify(Bin('-', r, l.arg));
      break;
    case '-':
      if (isNum(r) && r.value === 0) return l;
      if (isNum(l) && l.value === 0) return simplify(Neg(r));
      if (astEqual(l, r)) return Num(0);
      if (isNeg(r)) return simplify(Bin('+', l, r.arg));
      break;
    case '*':
      if (isNum(l) && l.value === 0) return Num(0);
      if (isNum(r) && r.value === 0) return Num(0);
      if (isNum(l) && l.value === 1) return r;
      if (isNum(r) && r.value === 1) return l;
      if (isNum(l) && l.value === -1) return simplify(Neg(r));
      if (isNum(r) && r.value === -1) return simplify(Neg(l));
      break;
    case '/':
      if (isNum(r) && r.value === 1) return l;
      if (isNum(l) && l.value === 0 && !(isNum(r) && r.value === 0)) return Num(0);
      if (astEqual(l, r) && !(isNum(r) && r.value === 0)) return Num(1);
      // Cancel common integer factor in a fraction so
      // DERIV(SQRT(X^2+1)) = 2*X/(2*SQRT(X^2+1)) reduces to the
      // textbook X/SQRT(X^2+1).  See `_cancelIntegerFactor`.
      {
        const reduced = _cancelIntegerFactor(l, r);
        if (reduced) return reduced;
      }
      break;
    case '^':
      if (isNum(r) && r.value === 0) return Num(1);
      if (isNum(r) && r.value === 1) return l;
      if (isNum(l) && l.value === 0) return Num(0);   // 0^n = 0 (n>0 caught above)
      if (isNum(l) && l.value === 1) return Num(1);
      // (u^m)^n → u^(m*n) when both exponents are Num.  Cleans up
      // DERIV chain-rule output like ATAN(X^2) → 2*X/(X^4+1) instead
      // of 2*X/((X^2)^2 + 1).  Conservative — we require BOTH m and n
      // to be numeric literals so we don't chase u^(v*w) shapes where
      // v or w might be zero or negative and introduce branch issues.
      if (isBin(l) && l.op === '^' && isNum(l.r) && isNum(r)) {
        return simplify(Bin('^', l.l, Num(l.r.value * r.value)));
      }
      // (-X)^n for integer n.
      //   n even → X^n      (sign dropped)
      //   n odd  → -(X^n)   (sign kept, Neg pushed outside)
      // Only for non-negative integer n; negative powers would need
      // branch reasoning.  This unblocks chain-rule output like
      // `(-X)^2 + 1 → X^2 + 1` and the factor()-produced
      // `(Neg(X))^2 → X^2` intermediates.
      if (isNeg(l) && isNum(r) &&
          Number.isInteger(r.value) && r.value >= 0) {
        const base = Bin('^', l.arg, r);
        if (r.value % 2 === 0) return simplify(base);
        return simplify(Neg(base));
      }
      break;
  }
  // Like-terms pass for + / - chains.  Idempotent by construction —
  // rebuilding a canonical form once is enough.  Skipped for *, /, ^
  // since there's no additive grouping to do.
  if (op === '+' || op === '-') {
    return combineLikeTerms(Bin(op, l, r));
  }
  return Bin(op, l, r);
}

/** simplifyFn — applied to an Fn node by simplify().  Walks the args
 *  (recursively simplifying each), folds to Num when every arg is a
 *  Num and the function has a mode-independent numeric evaluator, and
 *  applies a small list of identity rules for specific functions:
 *
 *    SIN(0) = 0     COS(0) = 1     TAN(0) = 0
 *    ASIN(0) = 0    ATAN(0) = 0
 *    LN(1)  = 0     LOG(1) = 0     LN(EXP(X)) → X
 *    EXP(0) = 1     ALOG(0) = 1
 *    SQRT(0) = 0    SQRT(1) = 1    ABS(0) = 0
 *
 *  Mode-dependent functions (SIN/COS/TAN/ASIN/ACOS/ATAN) don't fold on
 *  a generic numeric arg because the answer depends on DEG/RAD/GRD.
 *  Numeric EVAL (ops.js) is responsible for that — it has access to
 *  the angle mode and can call Math.sin on the correct input.  Here
 *  we only handle the zero cases, which are mode-independent.
 */
function simplifyFn(ast) {
  const name = ast.name;
  const args = ast.args.map(simplify);
  if (args.length === 1) {
    const a = args[0];
    if (isNum(a)) {
      if (a.value === 0) {
        switch (name) {
          case 'SIN':  return Num(0);
          case 'TAN':  return Num(0);
          case 'ASIN': return Num(0);
          case 'ATAN': return Num(0);
          case 'COS':  return Num(1);   // cos(0)=1 regardless of mode
          case 'LN':   return null;     // undefined; leave symbolic below
          case 'EXP':  return Num(1);
          case 'ALOG': return Num(1);
          case 'SQRT': return Num(0);
          case 'ABS':  return Num(0);
          case 'LOG':  return null;     // undefined; leave symbolic
        }
      }
      if (a.value === 1) {
        if (name === 'LN')   return Num(0);
        if (name === 'LOG')  return Num(0);
        if (name === 'SQRT') return Num(1);
      }
      const spec = KNOWN_FUNCTIONS[name];
      if (spec && typeof spec.eval === 'function') {
        const out = spec.eval(a.value);
        if (out !== null && Number.isFinite(out)) return Num(out);
      }
    }
    // LN(EXP(x)) → x, EXP(LN(x)) → x.  Both are standard CAS rewrites;
    // the second is only valid for positive x, but HP50's CAS is
    // permissive here (it rewrites and leaves domain to the user).
    if (name === 'LN' && isFn(a) && a.name === 'EXP' && a.args.length === 1) {
      return a.args[0];
    }
    if (name === 'EXP' && isFn(a) && a.name === 'LN' && a.args.length === 1) {
      return a.args[0];
    }
    if (name === 'ABS' && isNeg(a)) return Fn('ABS', [a.arg]);
    if (name === 'ABS' && isFn(a) && a.name === 'ABS') return a;
    // SQRT(X^2) → ABS(X), not X — the radicand sign is lost.
    if (name === 'SQRT' && isBin(a) && a.op === '^' &&
        isNum(a.r) && a.r.value === 2) {
      return Fn('ABS', [a.l]);
    }

    // Rounding / sign idempotency identities.  Every one of these
    // reduces a nested rounding call to its inner shape because the
    // inner result is ALREADY integer-valued (FLOOR / CEIL / IP / —for
    // FP — fractional), so re-applying any integer-rounder is a no-op.
    // All are angle-mode-independent and match the HP50 CAS behaviour
    // for rounding-of-rounding expressions.  Written defensively —
    // only the exact shapes match; anything else (e.g. `FLOOR(X + 1)`)
    // stays as-is for later passes.
    //
    //   FLOOR(FLOOR(x)) = FLOOR(x)       IP(FLOOR(x))  = FLOOR(x)
    //   CEIL(CEIL(x))   = CEIL(x)        IP(CEIL(x))   = CEIL(x)
    //   IP(IP(x))       = IP(x)          IP(FP(x))     = 0
    //   FP(FP(x))       = FP(x)          FLOOR(IP(x))  = IP(x)
    //   FLOOR(CEIL(x))  = CEIL(x)        CEIL(IP(x))   = IP(x)
    //   CEIL(FLOOR(x))  = FLOOR(x)       FLOOR(FP(x))  ∈ {-1,0} → leave
    //   FP(FLOOR(x))    = 0              CEIL(FP(x))   ∈ {0,1}  → leave
    //   FP(CEIL(x))     = 0              SIGN(SIGN(x)) = SIGN(x)
    //   FP(IP(x))       = 0              SIGN(ABS(x))  → leave  (∈ {0,1})
    //
    // (FLOOR/CEIL of FP(x) are left symbolic because the result
    // depends on whether x is negative/positive — not a clean
    // idempotency.)
    const ROUND_INT_PRODUCERS = new Set(['FLOOR', 'CEIL', 'IP']);
    if (isFn(a) && a.args.length === 1) {
      const inner = a;
      const innerName = a.name;
      if (ROUND_INT_PRODUCERS.has(name) && ROUND_INT_PRODUCERS.has(innerName)) {
        return inner;
      }
      if (name === 'FP' && ROUND_INT_PRODUCERS.has(innerName)) {
        return Num(0);
      }
      if (name === 'FP' && innerName === 'FP') {
        return inner;
      }
      if (name === 'SIGN' && innerName === 'SIGN') {
        return inner;
      }
    }

    // Odd / even symbolic identities.  `Neg(x)` here is the
    // one-and-only negation shape simplify uses (it never produces
    // `-1 * x` — that's folded into a Num-prefix *).  We pull the sign
    // OUT of odd functions and DROP it inside even functions:
    //
    //   SIN(-x) → -SIN(x)   ASIN(-x) → -ASIN(x)   TAN(-x) → -TAN(x)
    //   SINH(-x) → -SINH(x) TANH(-x) → -TANH(x)   ATANH(-x) → -ATANH(x)
    //   COS(-x) → COS(x)    COSH(-x) → COSH(x)    ABS(-x) → ABS(x)  (above)
    //
    // LN / LOG / SQRT / EXP don't have a symmetry for negative args so
    // they stay as-is.  ASINH is odd; ATAN is odd.
    if (isNeg(a)) {
      const ODD  = new Set([
        'SIN', 'TAN', 'ASIN', 'ATAN', 'SINH', 'TANH', 'ASINH', 'ATANH',
      ]);
      const EVEN = new Set(['COS', 'COSH']);
      if (ODD.has(name))  return simplify(Neg(Fn(name, [a.arg])));
      if (EVEN.has(name)) return Fn(name, [a.arg]);
    }
  }
  return Fn(name, args);
}

/* EXPAND
 *
 * `expand(ast)` multiplies-out products and small non-negative integer
 * powers of sums, then runs simplify() on the result so the like-terms
 * combiner gathers coefficients:
 *
 *     (X+1)^2       →  X^2 + 2*X + 1
 *     (X+1)^3       →  X^3 + 3*X^2 + 3*X + 1
 *     (X+1)*(X-1)   →  X^2 - 1
 *     (2*X+1)^2     →  4*X^2 + 4*X + 1
 *
 * Exponent must be a numeric literal integer in [0, EXPAND_MAX_POWER]
 * — anything larger risks blowing up the tree size without the user
 * meaning it.  Outside that band EXPAND leaves the subtree alone.
 * Cases EXPAND does NOT handle yet:
 *   - rational / negative exponents  (X+1)^(-2), (X+1)^(1/2) — symbolic.
 *   - non-Num exponents               (X+1)^Y — needs full series expansion.
 *   - (a/b)^n                         rational base — would need common-denom.
 *   - trig identities, log of product, etc.
 * All of those are future CAS work.
 */

const EXPAND_MAX_POWER = 16;

/** additiveTerms(ast) — walk a + / - / unary-Neg chain and return a
 *  list of `{ sign: ±1, term: AST }` leaves in their original order.
 *  `term` is whatever the leaf is — including `Bin('*', ...)` or a
 *  whole `Bin('^', ...)` — i.e. the smallest non-additive sub-tree. */
function additiveTerms(ast) {
  const out = [];
  (function walk(n, sign) {
    if (isBin(n) && (n.op === '+' || n.op === '-')) {
      walk(n.l, sign);
      walk(n.r, n.op === '+' ? sign : -sign);
    } else if (isNeg(n)) {
      walk(n.arg, -sign);
    } else {
      out.push({ sign, term: n });
    }
  })(ast, 1);
  return out;
}

/** splitTerm(ast) — flatten a `*` / Neg / Num-coefficient chain into
 *  a pure numeric coefficient plus a list of non-numeric factors.
 *  `X`, `Bin('^', X, 3)`, `Fn('SIN', [X])` are factors; any nested
 *  `*` is flattened; Neg flips the coefficient.  Used by EXPAND's
 *  term multiplier so matching bases can be combined across factors. */
function splitTerm(ast) {
  const factors = [];
  let coef = 1;
  (function walk(n) {
    if (isBin(n) && n.op === '*') {
      walk(n.l); walk(n.r);
    } else if (isNum(n)) {
      coef *= n.value;
    } else if (isNeg(n)) {
      coef *= -1;
      walk(n.arg);
    } else {
      factors.push(n);
    }
  })(ast);
  return { coef, factors };
}

/** combinePowers(factors) — group factors sharing a base and sum their
 *  exponents.  A bare factor is treated as base^1; a Bin('^', ...) is
 *  split into base + exponent.  Resulting exponents pass through
 *  simplify so e.g. `1 + 1 → 2` cleans up immediately.  Keeps first-
 *  appearance order of base keys. */
function combinePowers(factors) {
  const grouped = [];
  for (const f of factors) {
    let base, exp;
    if (isBin(f) && f.op === '^') { base = f.l; exp = f.r; }
    else { base = f; exp = Num(1); }
    const key = formatAlgebra(base);
    const existing = grouped.find(g => g.key === key);
    if (existing) {
      existing.exp = simplify(Bin('+', existing.exp, exp));
    } else {
      grouped.push({ base, exp, key });
    }
  }
  const out = [];
  for (const g of grouped) {
    if (isNum(g.exp) && g.exp.value === 1) { out.push(g.base); continue; }
    if (isNum(g.exp) && g.exp.value === 0) continue;    // x^0 = 1, drop
    out.push(Bin('^', g.base, g.exp));
  }
  return out;
}

/** rebuildTerm(coef, factors) — assemble `coef * f0 * f1 * ...` as a
 *  left-associative `*` chain, with special-casing for coef ∈ {0, 1, -1}
 *  so the output stays tidy.  Returns `Num(0)` for coef=0. */
function rebuildTerm(coef, factors) {
  if (coef === 0) return Num(0);
  if (factors.length === 0) return Num(coef);
  let result = factors[0];
  for (let i = 1; i < factors.length; i++) {
    result = Bin('*', result, factors[i]);
  }
  if (coef === 1) return result;
  if (coef === -1) return Neg(result);
  return Bin('*', Num(coef), result);
}

function multiplyTerms(a, b) {
  const A = splitTerm(a);
  const B = splitTerm(b);
  const coef = A.coef * B.coef;
  const factors = combinePowers([...A.factors, ...B.factors]);
  return rebuildTerm(coef, factors);
}

function expandProduct(a, b) {
  // Single-term × single-term still goes through multiplyTerms so
  // X*X becomes X^2.
  const aTerms = additiveTerms(a);
  const bTerms = additiveTerms(b);
  const parts = [];
  for (const ta of aTerms) {
    for (const tb of bTerms) {
      const term = multiplyTerms(ta.term, tb.term);
      parts.push({ sign: ta.sign * tb.sign, term });
    }
  }
  return rebuildSumParts(parts);
}

function rebuildSumParts(parts) {
  if (parts.length === 0) return Num(0);
  const first = parts[0];
  let result = first.sign < 0 ? Neg(first.term) : first.term;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    result = Bin(p.sign < 0 ? '-' : '+', result, p.term);
  }
  return result;
}

/** expand(ast) — top-level EXPAND.  Walks the tree, expanding products
 *  and integer-power sums, then hands the result to simplify() to let
 *  the like-terms combiner collapse matching coefficients.  Unsupported
 *  sub-trees are returned unchanged, keeping EXPAND total. */
function expand(ast) {
  return simplify(expandAst(ast));
}

function expandAst(ast) {
  if (!ast) return ast;
  if (isNum(ast) || isVar(ast)) return ast;
  if (isNeg(ast)) return Neg(expandAst(ast.arg));
  if (isFn(ast)) return Fn(ast.name, ast.args.map(expandAst));
  if (isBin(ast)) {
    const l = expandAst(ast.l);
    const r = expandAst(ast.r);
    const op = ast.op;
    if (op === '*') return expandProduct(l, r);
    if (op === '^' && isNum(r) && Number.isInteger(r.value) &&
        r.value >= 0 && r.value <= EXPAND_MAX_POWER) {
      const n = r.value;
      if (n === 0) return Num(1);
      if (n === 1) return l;
      let acc = l;
      for (let i = 2; i <= n; i++) acc = expandProduct(acc, l);
      return acc;
    }
    return Bin(op, l, r);
  }
  return ast;
}

/** Derivative of `ast` with respect to variable `varName`.
 *  Returns a fully simplified AST. */
function deriv(ast, varName) {
  return simplify(derivRaw(ast, String(varName)));
}

/** derivFn — chain rule for a function call.  Given Fn(f, [u]) and the
 *  variable of differentiation `v`, emits  f'(u) * u'  where f'(u) is
 *  spelled out per known builtin:
 *
 *     SIN(u)'   =  COS(u) * u'
 *     COS(u)'   = -SIN(u) * u'
 *     TAN(u)'   = (1 + TAN(u)^2) * u'        (equivalently SEC(u)^2)
 *     ASIN(u)'  =  u' / SQRT(1 - u^2)
 *     ACOS(u)'  = -u' / SQRT(1 - u^2)
 *     ATAN(u)'  =  u' / (1 + u^2)
 *     LN(u)'    =  u' / u
 *     LOG(u)'   =  u' / (u * LN(10))
 *     EXP(u)'   =  EXP(u) * u'
 *     ALOG(u)'  =  ALOG(u) * LN(10) * u'
 *     SQRT(u)'  =  u' / (2*SQRT(u))
 *     ABS(u)'   =  (u/ABS(u)) * u'          (sign(u) * u' symbolically)
 *     SINH(u)'  =  COSH(u) * u'
 *     COSH(u)'  =  SINH(u) * u'             (NOT `-SINH` — cosh is even
 *                                           but d/dx cosh = +sinh)
 *     TANH(u)'  = (1 - TANH(u)^2) * u'       (SECH^2 form, but we lack SECH)
 *     ASINH(u)' =  u' / SQRT(u^2 + 1)
 *     ACOSH(u)' =  u' / SQRT(u^2 - 1)        (valid for u > 1)
 *     ATANH(u)' =  u' / (1 - u^2)            (valid for |u| < 1)
 *
 *  HP50 trig DERIV results are always stated in terms of the "other"
 *  trig — i.e. SIN's derivative is COS, not "cos in rad mode" — because
 *  the CAS's angle-mode semantics apply uniformly.  We mirror that
 *  here; the resulting Fn nodes will pick up the active mode at
 *  numeric-EVAL time.  Hyperbolic families are angle-mode-independent,
 *  so those rewrites are unconditional.
 *
 *  Unsupported functions throw a clear error; DERIV is typed-up for
 *  the common trig / log / exp / root / hyp set, not user-defined calls. */
function derivFn(ast, v) {
  const name = ast.name;
  if (ast.args.length !== 1) {
    throw new Error(`DERIV: ${name} with ${ast.args.length} args not supported`);
  }
  const u  = ast.args[0];
  const du = derivRaw(u, v);
  switch (name) {
    case 'SIN':
      return Bin('*', Fn('COS', [u]), du);
    case 'COS':
      return Bin('*', Neg(Fn('SIN', [u])), du);
    case 'TAN': {
      // sec^2(u) * u' — we don't have SEC; (1 + TAN(u)^2) is equivalent.
      const sec2 = Bin('+', Num(1), Bin('^', Fn('TAN', [u]), Num(2)));
      return Bin('*', sec2, du);
    }
    case 'ASIN': {
      const inner = Bin('-', Num(1), Bin('^', u, Num(2)));
      return Bin('/', du, Fn('SQRT', [inner]));
    }
    case 'ACOS': {
      const inner = Bin('-', Num(1), Bin('^', u, Num(2)));
      return Bin('/', Neg(du), Fn('SQRT', [inner]));
    }
    case 'ATAN': {
      const denom = Bin('+', Num(1), Bin('^', u, Num(2)));
      return Bin('/', du, denom);
    }
    case 'LN':
      return Bin('/', du, u);
    case 'LOG':
      return Bin('/', du, Bin('*', u, Fn('LN', [Num(10)])));
    case 'EXP':
      return Bin('*', Fn('EXP', [u]), du);
    case 'ALOG':
      return Bin('*', Bin('*', Fn('ALOG', [u]), Fn('LN', [Num(10)])), du);
    case 'SQRT':
      return Bin('/', du, Bin('*', Num(2), Fn('SQRT', [u])));
    case 'ABS':
      return Bin('*', Bin('/', u, Fn('ABS', [u])), du);
    case 'SINH':
      return Bin('*', Fn('COSH', [u]), du);
    case 'COSH':
      // +sinh(u) * u' — no sign flip; don't confuse with d/dx cos(u).
      return Bin('*', Fn('SINH', [u]), du);
    case 'TANH': {
      // sech^2 = 1 - tanh^2 — we don't expose SECH, so use the identity
      // to stay inside the KNOWN_FUNCTIONS surface.
      const sech2 = Bin('-', Num(1), Bin('^', Fn('TANH', [u]), Num(2)));
      return Bin('*', sech2, du);
    }
    case 'ASINH': {
      const inner = Bin('+', Bin('^', u, Num(2)), Num(1));
      return Bin('/', du, Fn('SQRT', [inner]));
    }
    case 'ACOSH': {
      const inner = Bin('-', Bin('^', u, Num(2)), Num(1));
      return Bin('/', du, Fn('SQRT', [inner]));
    }
    case 'ATANH': {
      const denom = Bin('-', Num(1), Bin('^', u, Num(2)));
      return Bin('/', du, denom);
    }
  }
  throw new Error(`DERIV: unsupported function '${name}'`);
}

function derivRaw(ast, v) {
  if (!ast) return Num(0);
  if (ast.kind === 'num') return Num(0);
  if (ast.kind === 'var') return Num(ast.name === v ? 1 : 0);
  if (ast.kind === 'neg') return Neg(derivRaw(ast.arg, v));
  if (ast.kind === 'fn')  return derivFn(ast, v);
  if (ast.kind === 'bin') {
    const { op, l, r } = ast;
    const dl = derivRaw(l, v);
    const dr = derivRaw(r, v);
    switch (op) {
      case '+': return Bin('+', dl, dr);
      case '-': return Bin('-', dl, dr);
      case '*':
        return Bin('+', Bin('*', dl, r), Bin('*', l, dr));
      case '/':
        return Bin('/',
          Bin('-', Bin('*', dl, r), Bin('*', l, dr)),
          Bin('^', r, Num(2)));
      case '^':
        // Polynomial shortcut (u^n)' = n*u^(n-1)*u' for numeric n —
        // keeps the clean form tests pin down and avoids the dead
        // v'=0 term the general rule would emit.
        if (isNum(r)) {
          const n = r.value;
          return Bin('*', Num(n),
                     Bin('*', Bin('^', l, Num(n - 1)), dl));
        }
        // Constant-base shortcut (a^v)' = a^v * LN(a) * v'.
        if (isNum(l)) {
          return Bin('*', Bin('*', Bin('^', l, r), Fn('LN', [l])), dr);
        }
        // General power rule, written as v*u^(v-1)*u' + u^v*LN(u)*v'
        // (rather than the factored form) so the simplifier's x*0→0 rule
        // cleanly drops whichever of u', v' is zero.
        return Bin('+',
          Bin('*', r, Bin('*', Bin('^', l, Bin('-', r, Num(1))), dl)),
          Bin('*', Bin('^', l, r), Bin('*', Fn('LN', [l]), dr)));
    }
  }
  throw new Error(`DERIV: unknown AST kind '${ast.kind}'`);
}

/** Indefinite integral of `ast` with respect to variable `varName`.
 *  Returns a fully simplified AST.  Only covers the cases that can be
 *  handled by straightforward closed-form rules — the rest fall back to
 *  a bare `INTEG(expr, var)` function call so the expression round-trips
 *  and the user can keep working symbolically. */
function integ(ast, varName) {
  return simplify(integRaw(ast, String(varName)));
}

function integRaw(ast, v) {
  if (!ast) return Num(0);
  // ∫ c dx = c*x      (constant w.r.t. v)
  if (!subtreeHasVar(ast, v)) {
    return Bin('*', ast, Var(v));
  }
  // ∫ x dx = x^2 / 2 ; ∫ y dx = y*x (handled above as constant)
  if (ast.kind === 'var') {
    return Bin('/', Bin('^', Var(v), Num(2)), Num(2));
  }
  // ∫ -u du = -∫u du
  if (ast.kind === 'neg') {
    return Neg(integRaw(ast.arg, v));
  }
  if (ast.kind === 'bin') {
    const { op, l, r } = ast;
    // Linearity: ∫ (f ± g) dx = ∫f ± ∫g
    if (op === '+' || op === '-') {
      return Bin(op, integRaw(l, v), integRaw(r, v));
    }
    // ∫ c * f(x) dx = c * ∫ f(x) dx   (c independent of v)
    if (op === '*') {
      if (!subtreeHasVar(l, v)) return Bin('*', l, integRaw(r, v));
      if (!subtreeHasVar(r, v)) return Bin('*', r, integRaw(l, v));
    }
    // ∫ f(x) / c dx = (∫ f(x) dx) / c     (c independent of v)
    if (op === '/') {
      if (!subtreeHasVar(r, v)) return Bin('/', integRaw(l, v), r);
      // ∫ 1/x dx = LN(ABS(x))   (classic)
      if (isNum(l) && l.value === 1 && r.kind === 'var' && r.name === v) {
        return Fn('LN', [Fn('ABS', [Var(v)])]);
      }
    }
    // ∫ x^n dx = x^(n+1)/(n+1), n ≠ -1   (n a numeric constant)
    if (op === '^' && l.kind === 'var' && l.name === v && isNum(r)) {
      const n = r.value;
      if (n !== -1) {
        return Bin('/', Bin('^', Var(v), Num(n + 1)), Num(n + 1));
      }
      return Fn('LN', [Fn('ABS', [Var(v)])]);
    }
  }
  if (ast.kind === 'fn' && ast.args.length === 1) {
    const u = ast.args[0];
    // Only handle f(x) directly — chain rule would require u' = 1.
    if (u.kind === 'var' && u.name === v) {
      switch (ast.name) {
        case 'SIN':  return Neg(Fn('COS', [Var(v)]));
        case 'COS':  return Fn('SIN', [Var(v)]);
        case 'EXP':  return Fn('EXP', [Var(v)]);
        case 'LN':   return Bin('-', Bin('*', Var(v), Fn('LN', [Var(v)])), Var(v));
        // Hyperbolic + ALOG antiderivatives (f(x) with x as the
        // variable of integration only; chain rule stays deferred,
        // matching the SIN/COS/EXP/LN shape).
        //   ∫ SINH(x) dx = COSH(x)
        //   ∫ COSH(x) dx = SINH(x)
        //   ∫ ALOG(x) dx = ALOG(x) / LN(10)    [since d/dx 10^x = 10^x·ln(10)]
        case 'SINH': return Fn('COSH', [Var(v)]);
        case 'COSH': return Fn('SINH', [Var(v)]);
        case 'ALOG': return Bin('/', Fn('ALOG', [Var(v)]), Fn('LN', [Num(10)]));
      }
    }
  }
  // Fallback: leave as an unevaluated INTEG(expr, var).
  return Fn('INTEG', [ast, Var(v)]);
}

/* Evaluator
 *
 * Walks an AST, resolving variables via the caller-supplied lookup and
 * applying numeric evaluators for Fn nodes.  Used by ops.js EVAL when
 * the user pops a Symbolic off the stack: if every free variable in
 * the tree has a numeric binding AND every function call has an
 * evaluator, we collapse the whole thing to a single number.  If any
 * free variable is unbound (or a function is non-numeric), we leave
 * those parts symbolic and return a partially-reduced AST.
 *
 *   lookup(name): (string) → number | null
 *       Return a finite number for a bound variable; return null for
 *       "no binding, leave symbolic".  Complex numbers aren't handled
 *       here — the caller should return null and let the AST stay
 *       symbolic if the binding isn't real.
 *
 *   fnEval(name, argValues): (string, number[]) → number | null
 *       Apply the named function to the numeric arg list; return null
 *       to indicate "cannot evaluate" (mode-dependent trig when we're
 *       in symbolic territory, unsupported func, domain error, …).
 *       The default fnEval uses KNOWN_FUNCTIONS[name].eval when
 *       present, else returns null.
 *
 * Return value is always an AST node — either a collapsed Num(k) or a
 * partially-reduced node with the same kind as the input.
 */
export function evalAst(ast, lookup, fnEval = defaultFnEval, binGate = null) {
  if (!ast) return ast;
  if (ast.kind === 'num') return ast;
  if (ast.kind === 'var') {
    const b = lookup(ast.name);
    if (b === null || b === undefined || !Number.isFinite(b)) return ast;
    return Num(b);
  }
  if (ast.kind === 'neg') {
    const a = evalAst(ast.arg, lookup, fnEval, binGate);
    if (isNum(a)) return Num(-a.value);
    return Neg(a);
  }
  if (ast.kind === 'bin') {
    const l = evalAst(ast.l, lookup, fnEval, binGate);
    const r = evalAst(ast.r, lookup, fnEval, binGate);
    if (isNum(l) && isNum(r)) {
      let folded;
      switch (ast.op) {
        case '+': folded = l.value + r.value; break;
        case '-': folded = l.value - r.value; break;
        case '*': folded = l.value * r.value; break;
        case '/':
          if (r.value === 0) return Bin('/', l, r);
          folded = l.value / r.value; break;
        case '^': folded = Math.pow(l.value, r.value); break;
        default: return Bin(ast.op, l, r);
      }
      // Optional gate — lets callers (e.g. EXACT-mode →NUM) decide
      // whether a Num-Num fold should collapse or stay symbolic.  Gate
      // returns the number to use, or null/undefined to keep symbolic.
      if (binGate) {
        const gated = binGate(ast.op, [l.value, r.value], folded);
        if (gated === null || gated === undefined || !Number.isFinite(gated)) {
          return Bin(ast.op, l, r);
        }
        return Num(gated);
      }
      return Num(folded);
    }
    return Bin(ast.op, l, r);
  }
  if (ast.kind === 'fn') {
    const evaldArgs = ast.args.map(a => evalAst(a, lookup, fnEval, binGate));
    if (evaldArgs.every(isNum)) {
      const nums = evaldArgs.map(a => a.value);
      const result = fnEval(ast.name, nums);
      if (result !== null && result !== undefined && Number.isFinite(result)) {
        return Num(result);
      }
    }
    return Fn(ast.name, evaldArgs);
  }
  return ast;
}

/** Default Fn evaluator — uses the KNOWN_FUNCTIONS numeric eval if
 *  present, else returns null (i.e. "leave symbolic").  Trig and
 *  inverse trig return null because their answer depends on the angle
 *  mode; ops.js wraps this to supply an angle-aware evaluator. */
export function defaultFnEval(name, args) {
  const spec = KNOWN_FUNCTIONS[String(name).toUpperCase()];
  if (!spec || typeof spec.eval !== 'function') return null;
  if (args.length !== (spec.arity || 1)) return null;
  return spec.eval(...args);
}

/** Collect the set of free variable names used in `ast`.  Returns a
 *  Set<string>.  Function-call node names (SIN, COS, ...) are NOT
 *  free vars — they identify the call, not a user name. */
export function freeVars(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.kind === 'var') out.add(ast.name);
  else if (ast.kind === 'neg') freeVars(ast.arg, out);
  else if (ast.kind === 'bin') { freeVars(ast.l, out); freeVars(ast.r, out); }
  else if (ast.kind === 'fn')  for (const a of ast.args) freeVars(a, out);
  return out;
}

/** Format an AST as a string, parenthesising only where required by
 *  operator precedence.  Matches the grammar above:
 *    +,- precedence 1
 *    *,/ precedence 2
 *    ^   precedence 3 (right-assoc)
 *    neg precedence 4 (unary)
 *  For readability we render binary ops with spaces around + and -,
 *  no spaces around * / ^. */
export function formatAlgebra(ast) {
  return fmt(ast, 0);
}

// `=` and comparison operators (≠, <, >, ≤, ≥) are the loosest-binding
// operators — below + / -.  Only emitted at the top level of an equation
// (parseEq); every other grammar production lives above it.
const PREC = {
  '=': 0, '≠': 0, '<': 0, '>': 0, '≤': 0, '≥': 0,
  '+': 1, '-': 1, '*': 2, '/': 2, '^': 3,
};
const CMP_OPS = new Set(['=', '≠', '<', '>', '≤', '≥']);

function fmt(ast, parentPrec) {
  if (!ast) return '';
  if (ast.kind === 'num') {
    return Number.isInteger(ast.value) ? ast.value.toString() : String(ast.value);
  }
  if (ast.kind === 'var') return ast.name;
  if (ast.kind === 'neg') {
    // Parenthesise inside a multiplicative-or-higher parent: '2*-X' is
    // ugly, '2*(-X)' reads.  Inside +/- we can print plain '-X'.
    const inner = fmt(ast.arg, 4);
    const s = `-${inner}`;
    return parentPrec >= 2 ? `(${s})` : s;
  }
  if (ast.kind === 'fn') {
    const inside = ast.args.map(a => fmt(a, 0)).join(',');
    return `${ast.name}(${inside})`;
  }
  if (ast.kind === 'bin') {
    const p = PREC[ast.op];
    // Associativity shapes the parenthesisation of children:
    //   left-assoc   '+','-','*','/'  →  a op b op c  =  (a op b) op c
    //     LEFT child at parent-prec = p  (equal-prec is fine on the left)
    //     RIGHT child at parent-prec = p+1 (equal-prec on the right
    //                                      would re-read as left-assoc)
    //   right-assoc  '^'               →  a^b^c  =  a^(b^c)
    //     LEFT child at p+1, RIGHT child at p.
    const rightAssoc = (ast.op === '^');
    const lPrec = rightAssoc ? p + 1 : p;
    const rPrec = rightAssoc ? p : p + 1;
    const lStr = fmt(ast.l, lPrec);
    const rStr = fmt(ast.r, rPrec);
    // + / - / = get surrounding spaces; comparison ops print tight so
    // `x y >` round-trips as `'x>y'`, matching HP50 behaviour.
    const sep = (ast.op === '+' || ast.op === '-' || ast.op === '=')
                ? ` ${ast.op} `
                : ast.op;
    const s = `${lStr}${sep}${rStr}`;
    return p < parentPrec ? `(${s})` : s;
  }
  return '?';
}

/* FACTOR

   `factor(ast)` recognises a set of common polynomial shapes and
   returns a factored form; anything outside the recognised set is
   returned unchanged (partial by design, same philosophy as EXPAND).
   Supported shapes include:

     - MONIC QUADRATIC with integer roots:
         X^2 + b*X + c  →  (X + r1)*(X + r2)
       with `r1`, `r2` integer roots and `b`, `c` integer
       coefficients.  If r1 === r2 the result is `(X + r)^2`.
       Both distinct-integer and repeated-root cases handled.

     - DIFFERENCE OF SQUARES with integer constant:
         X^2 - k           →  (X - n)*(X + n)    if k = n^2, n > 0
       Subset of the quadratic rule (b=0), but handy because it's
       the form most users recognise.

     - Non-monic quadratic, cubic (general + sum/difference of
       cubes), quartic (rational-root + product-of-quadratics),
       and sparse a·X^(3k) + b.  See the individual helpers below.

   All unsupported shapes pass through unchanged, matching the
   partial-CAS convention — users get EXPAND-style "best effort"
   rather than a noisy error.  The CAS menu's F4 slot delegates here. */

/** extractPolyCoeffs(ast, varName) — treat `ast` as a polynomial in
 *  the single variable `varName` and return an array `coefs` where
 *  `coefs[k]` is the AST representing the coefficient of X^k, or
 *  `null` if the shape is not a recognisable polynomial.  The output
 *  coefficient array may be sparse (undefined entries → 0 coef);
 *  callers should treat `undefined` as Num(0).
 *
 *  Recognises the flattened + / - chain shape the parser and
 *  simplifier emit:
 *    - a bare Num                 → power 0 contribution
 *    - a bare `Var varName`       → power 1, coef = 1
 *    - a `Var other`              → power 0, coef = that name
 *    - `Num * rest`               → extract coef from rest, scale
 *    - `body * Num`               → symmetric
 *    - `Var varName ^ Num(k)`     → power k, coef = 1
 *    - `Num * Var varName ^ k`    → power k, coef Num
 *    - products mixing varName and other factors:
 *          k * X^p * (other stuff)   → power p, coef = k * otherStuff
 *  Anything else fails and we return `null` so the caller can
 *  gracefully pass through.
 *
 *  Shared by FACTOR (this section) and `collectByVar` (polynomial
 *  COLLECT) below — same extraction primitive.
 */
function extractPolyCoeffs(ast, varName) {
  const terms = flattenAddSub(ast, 1, []);
  const coefs = [];       // coefs[power] = array of AST parts
  const addCoef = (power, node) => {
    if (!Array.isArray(coefs[power])) coefs[power] = [];
    coefs[power].push(node);
  };

  for (const { coef, body } of terms) {
    if (body === null) {
      // Pure numeric — power 0, coefficient is the numeric value.
      addCoef(0, Num(coef));
      continue;
    }
    // Walk body's `*` / `^` structure, pulling out X-power factors.
    const { power, rest, ok } = splitVarPower(body, varName);
    if (!ok) return null;
    // Assemble the "rest" into a single coefficient AST, folding in
    // the numeric `coef` from flattenAddSub.
    let coefAst;
    if (rest.length === 0) {
      coefAst = Num(coef);
    } else if (rest.length === 1) {
      coefAst = coef === 1 ? rest[0]
             : coef === -1 ? Neg(rest[0])
             : Bin('*', Num(coef), rest[0]);
    } else {
      let body2 = rest[0];
      for (let k = 1; k < rest.length; k++) body2 = Bin('*', body2, rest[k]);
      coefAst = coef === 1 ? body2
             : coef === -1 ? Neg(body2)
             : Bin('*', Num(coef), body2);
    }
    addCoef(power, coefAst);
  }
  return coefs;
}

/** splitVarPower(body, varName) — decompose a multiplicative body
 *  into `{ power, rest, ok }` where `power` is the total exponent
 *  of `varName` across the factor list and `rest` is the list of
 *  non-varName factors.  `ok` is false if we hit anything too
 *  unusual (negative / non-integer X-exponent, fractional division
 *  involving X, a Neg wrapper that we couldn't normalise, etc.) —
 *  in which case the caller should treat the whole expression as
 *  not-a-polynomial-in-varName.
 */
function splitVarPower(body, varName) {
  let power = 0;
  const rest = [];
  let ok = true;
  (function walk(n) {
    if (!ok) return;
    if (isBin(n) && n.op === '*') {
      walk(n.l);
      walk(n.r);
      return;
    }
    if (isVar(n) && n.name === varName) {
      power += 1; return;
    }
    if (isBin(n) && n.op === '^' &&
        isVar(n.l) && n.l.name === varName &&
        isNum(n.r) && Number.isInteger(n.r.value) && n.r.value >= 0) {
      power += n.r.value;
      return;
    }
    // Anything else is part of the coefficient — BUT we refuse if
    // varName appears anywhere inside this subtree, since that'd
    // mean we're not a clean polynomial in varName.
    if (subtreeHasVar(n, varName)) { ok = false; return; }
    rest.push(n);
  })(body);
  return { power, rest, ok };
}

/** Cheap recursive check for the presence of a Var with a given
 *  name anywhere in `ast`.  Used to refuse non-polynomial shapes
 *  that would otherwise slip through as part of a coefficient. */
function subtreeHasVar(ast, varName) {
  if (!ast) return false;
  if (isVar(ast)) return ast.name === varName;
  if (isNum(ast)) return false;
  if (isNeg(ast)) return subtreeHasVar(ast.arg, varName);
  if (isBin(ast)) return subtreeHasVar(ast.l, varName) ||
                        subtreeHasVar(ast.r, varName);
  if (isFn(ast)) return ast.args.some(a => subtreeHasVar(a, varName));
  return false;
}

/** sumCoefAsts(list) — reduce a coefficient-part list (each entry
 *  an AST) to a single simplified AST representing their sum.
 *  Empty list → Num(0); single entry → that entry unchanged. */
function sumCoefAsts(list) {
  if (!list || list.length === 0) return Num(0);
  if (list.length === 1) return simplify(list[0]);
  let acc = list[0];
  for (let i = 1; i < list.length; i++) acc = Bin('+', acc, list[i]);
  return simplify(acc);
}

/** pickMainVariable(ast) — if the tree has exactly one free
 *  variable name, return it.  Otherwise return null (signals
 *  "ambiguous — caller should bail or ask the user").  Used by
 *  FACTOR to pick X when the user didn't supply a variable. */
function pickMainVariable(ast) {
  const vars = [...freeVars(ast)];
  if (vars.length === 1) return vars[0];
  return null;
}

/** factor(ast) — top-level FACTOR entry.  Runs expand() first so
 *  `(X+1)^2 + 0` normalises into `X^2 + 2*X + 1` before we try to
 *  recognise a quadratic.  If the shape isn't a supported factoring
 *  target, we return the expanded form unchanged — cheaper than
 *  returning the input verbatim (guarantees EXPAND ∘ FACTOR is a
 *  no-op on non-factorable inputs).
 *
 *  Pipeline:
 *    1. Pull out a leading `X^minK` when coef[k]=0 for every k<minK
 *       (X-GCD factoring).  `X^3 + X` → `X*(X^2 + 1)`.
 *    2. Pull out an integer scalar GCD from the reduced coefficients
 *       so the core becomes monic (or sign-flipped monic when the
 *       leading coef is negative).  `2X^2 + 4X + 2` → `2*(X^2+2X+1)`.
 *    3. Apply the monic-quadratic integer-root rule to the core.
 *    4. Multiply the pulled-out pieces back on.
 *  A residual core whose degree is ≠ 2 (or whose discriminant refuses
 *  integer roots) is rebuilt from its coefficient array as a plain
 *  polynomial — so `X*(X^2 + 1)` still reads like a factorization
 *  even though the quadratic is irreducible.
 */
function factor(ast) {
  if (!ast) return ast;
  // Expand first so we can pattern-match on a canonical polynomial.
  const expanded = expand(ast);
  // Identify the polynomial's main variable; bail on mixed or
  // constant expressions.
  const mainVar = pickMainVariable(expanded);
  if (mainVar === null) return expanded;

  const coefs = extractPolyCoeffs(expanded, mainVar);
  if (!coefs) return expanded;

  const power = coefs.length - 1;
  if (power < 1) return expanded;          // constant — nothing to factor

  // Numeric coefficient array: null at any slot means "non-numeric"
  // (e.g. a Var like A in A*X^2 + B*X + C) — we can't do X-GCD or
  // scalar-GCD pulling without losing that subtree's identity, so
  // bail to the old monic-only path.  Fully-numeric coef vectors are
  // handled with the extended pipeline below.
  const numCoefs = [];
  for (let k = 0; k <= power; k++) numCoefs[k] = numericCoefAt(coefs, k);
  const allNumeric = numCoefs.every(c => c !== null);
  if (!allNumeric) return factorMonicOnly(coefs, power, mainVar, expanded);

  // Step 1: X-GCD pull.  Find minK — the lowest power with a non-zero
  // coefficient.  Any slot below minK is a trailing X factor.
  let minK = 0;
  while (minK <= power && numCoefs[minK] === 0) minK++;
  if (minK > power) return Num(0);          // polynomial is the zero polynomial

  // Reduced polynomial coefficients after pulling out X^minK.
  const coreDegree = power - minK;
  let coreCoefs = numCoefs.slice(minK);     // coreCoefs[0..coreDegree]

  // Step 2: Numeric GCD pull.  Only integer coefficients are
  // considered; a mixed integer/float vector skips this step so we
  // don't introduce rounding.  When the leading coefficient is
  // negative we pull -gcd to keep the core leading-positive.
  let scalar = 1;
  const allInt = coreCoefs.every(c => Number.isInteger(c));
  if (allInt) {
    const nonZeroMags = coreCoefs.filter(c => c !== 0).map(Math.abs);
    let g = nonZeroMags.reduce(_gcd, 0);
    if (coreCoefs[coreDegree] < 0) g = -g;
    if (Math.abs(g) > 1 || g === -1) {
      scalar = g;
      coreCoefs = coreCoefs.map(c => c / g);
    }
  }

  // Step 3: Try to factor the core polynomial.  Depending on shape we
  // dispatch to a specialised factorer:
  //   - coreDegree 2, leading 1        → factorMonicQuadratic
  //   - coreDegree 2, leading > 1      → factorNonMonicQuadratic
  //       (rational-root hunting via discriminant)
  //   - coreDegree 3 with only leading
  //     and constant terms              → factorSumOrDiffOfCubes
  //       (sum/difference-of-cubes identity)
  //   - coreDegree 3, general cubic     → factorCubicRationalRoot
  //       (rational-root scan + synthetic division)
  // Any other shape falls through to rebuildNumericPoly below.
  let coreFactored = null;
  if (allInt && coreCoefs.every(Number.isInteger)) {
    if (coreDegree === 2 && coreCoefs[2] === 1) {
      coreFactored = factorMonicQuadratic(coreCoefs[1], coreCoefs[0], mainVar);
    } else if (coreDegree === 2 && coreCoefs[2] > 1) {
      coreFactored = factorNonMonicQuadratic(
        coreCoefs[2], coreCoefs[1], coreCoefs[0], mainVar);
    } else if (coreDegree === 3 &&
               coreCoefs[2] === 0 && coreCoefs[1] === 0 &&
               coreCoefs[0] !== 0) {
      coreFactored = factorSumOrDiffOfCubes(
        coreCoefs[3], coreCoefs[0], mainVar);
    } else if (coreDegree === 3 && coreCoefs[0] !== 0) {
      // General cubic with at least one non-zero middle term — scan
      // for rational roots.  (The cubes branch above already consumed
      // the `b = c = 0` sub-shape.)
      coreFactored = factorCubicRationalRoot(
        coreCoefs[3], coreCoefs[2], coreCoefs[1], coreCoefs[0], mainVar);
    } else if (coreDegree === 4 && coreCoefs[0] !== 0) {
      // General quartic — rational-root scan then recurse into the
      // cubic factorer on the residue.
      coreFactored = factorQuarticRationalRoot(
        coreCoefs[4], coreCoefs[3], coreCoefs[2], coreCoefs[1],
        coreCoefs[0], mainVar);
      // No rational root?  Try a product-of-quadratics factorization
      // over the integers.  Catches X^4+X^2+1, X^4+4 (Sophie Germain),
      // X^4+2X^2+1 = (X^2+1)^2, etc.
      if (coreFactored === null) {
        coreFactored = factorQuarticAsProductOfQuadratics(
          coreCoefs[4], coreCoefs[3], coreCoefs[2], coreCoefs[1],
          coreCoefs[0], mainVar);
      }
    }

    // Sparse `a·X^(3k) + b` generalises the cubes identity to any
    // multiple-of-3 exponent.  Catches
    //   X^6 − 1, X^6 + 1, X^6 ± 8, X^9 ± 27, 8·X^6 + 1, …
    // and recurses so further-reducible sub-factors (X²−1, X⁴+X²+1)
    // land on their own specialised factorers.  Guarded to only fire
    // when coreFactored is still null (so the degree-3 cubes branch
    // wins for the k=1 case), and when the middle coefs are all zero.
    if (coreFactored === null && coreDegree >= 6 &&
        coreDegree % 3 === 0 && coreCoefs[0] !== 0) {
      const kExp = coreDegree / 3;
      let sparse = true;
      for (let i = 1; i < coreDegree; i++) {
        if (coreCoefs[i] !== 0) { sparse = false; break; }
      }
      if (sparse) {
        coreFactored = factorSumOrDiffOfCubesOfXk(
          coreCoefs[coreDegree], coreCoefs[0], kExp, mainVar);
      }
    }
  }

  // If the core didn't factor AND we haven't pulled out anything,
  // the whole operation is a no-op — return the expanded form
  // unchanged.  This preserves EXPAND ∘ FACTOR = EXPAND on inputs
  // that have no recognisable structure.
  if (coreFactored === null && minK === 0 && scalar === 1) return expanded;

  // Otherwise rebuild the core from coefs if it wasn't factored.
  if (coreFactored === null) {
    coreFactored = rebuildNumericPoly(coreCoefs, coreDegree, mainVar);
  }

  // Wrap: scalar * X^minK * coreFactored, assembled as a LEFT-
  // associative `*` chain so the formatter doesn't add spurious
  // parens.  We flatten coreFactored's top-level `*` factors into the
  // chain — so `3 * (X-1)*(X+1)` emits as `3*(X - 1)*(X + 1)` and
  // not `3*((X - 1)*(X + 1))`.
  const isUnit = isNum(coreFactored) && coreFactored.value === 1;
  const factorList = [];
  if (scalar !== 1 && scalar !== -1) factorList.push(Num(scalar));
  if (minK > 0) {
    const xPow = minK === 1 ? Var(mainVar) : Bin('^', Var(mainVar), Num(minK));
    factorList.push(xPow);
  }
  if (!isUnit) {
    _flattenMulInto(coreFactored, factorList);
  }

  // Left-fold the factor list into a `*` chain.  Empty list shouldn't
  // happen given the no-op guard above, but fall back to Num(1) just
  // in case.
  let result;
  if (factorList.length === 0) result = Num(1);
  else {
    result = factorList[0];
    for (let i = 1; i < factorList.length; i++) {
      result = Bin('*', result, factorList[i]);
    }
  }

  // Sign: scalar === -1 wraps the whole chain in a unary minus.
  if (scalar === -1) result = Neg(result);
  return result;
}

/** _flattenMulInto(ast, out) — append ast's top-level `*` factors to
 *  `out`, walking any right-heavy `Bin('*', ...)` tree but stopping
 *  at non-product nodes.  Used by factor() to emit a flat
 *  left-assoc `*` chain. */
function _flattenMulInto(ast, out) {
  if (isBin(ast) && ast.op === '*') {
    _flattenMulInto(ast.l, out);
    _flattenMulInto(ast.r, out);
  } else {
    out.push(ast);
  }
}

/** factorMonicQuadratic(b, c, varName) — return an AST for the
 *  monic quadratic `X^2 + b*X + c` as a factored form, or null when
 *  the roots aren't integers.  `b`, `c` are integer JS numbers;
 *  `varName` is the main variable's name.  Ordering convention is
 *  "d ascending" inside each `(X + d)` factor. */
function factorMonicQuadratic(b, c, varName) {
  const D = b * b - 4 * c;
  if (D < 0) return null;                   // complex roots
  const sqrtD = Math.sqrt(D);
  if (!Number.isInteger(sqrtD)) return null; // irrational roots
  const numerR1 = -b + sqrtD;
  const numerR2 = -b - sqrtD;
  if (numerR1 % 2 !== 0 || numerR2 % 2 !== 0) return null;
  const r1 = numerR1 / 2;
  const r2 = numerR2 / 2;
  // r1 is the larger root (since sqrtD ≥ 0) — printing `(X - r1)(X - r2)`
  // with d = -r inside each factor gives d ascending, matching the
  // textbook convention.
  const factorFor = (r) =>
    r === 0 ? Var(varName) :
    r > 0   ? Bin('-', Var(varName), Num(r)) :
              Bin('+', Var(varName), Num(-r));
  if (r1 === r2) return Bin('^', factorFor(r1), Num(2));
  return Bin('*', factorFor(r1), factorFor(r2));
}

/** factorNonMonicQuadratic(a, b, c, varName) — factor the integer
 *  quadratic `a*X^2 + b*X + c` (a > 1) using rational-root hunting
 *  via the discriminant.  Returns a Bin/pair AST like
 *    (q1*X - p1)(q2*X - p2)
 *  or null if the roots are complex / irrational / not representable
 *  with integer factors that multiply back to the leading `a`.
 *
 *  The approach:
 *    roots = (-b ± √D) / (2a) where D = b² - 4ac.
 *  For each root, reduce to lowest-term p/q (q > 0); the corresponding
 *  factor is (q·X - p).  Cross-check: the product
 *  (q1·X - p1)(q2·X - p2) expands to q1·q2·X² - (q1·p2 + q2·p1)·X + p1·p2,
 *  and we verify q1·q2 === a before emitting.  (When both roots are
 *  integers in lowest terms, q1 = q2 = 1, so we also need to fall back
 *  to the monic branch — but that's already handled by the dispatch
 *  above choosing factorMonicQuadratic when leading is 1.  For leading
 *  > 1 with both roots integer, the result (X - r1)(X - r2) has
 *  leading coefficient 1 ≠ a, so q1·q2 ≠ a and we return null —
 *  that polynomial can't actually be factored over integers without
 *  pulling a scalar first, which the upstream GCD step has already
 *  tried.)
 *
 *  Ordering: r1 is the "larger" root (sqrtD ≥ 0); the (larger)(smaller)
 *  order matches how factorMonicQuadratic emits its factors.
 *
 *  Companion to factorMonicQuadratic — the core factoring table is:
 *     lead == 1  → factorMonicQuadratic
 *     lead > 1   → factorNonMonicQuadratic
 */
function factorNonMonicQuadratic(a, b, c, varName) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) {
    return null;
  }
  if (a <= 1) return null;
  const D = b * b - 4 * a * c;
  if (D < 0) return null;                 // complex roots
  const sqrtD = Math.sqrt(D);
  if (!Number.isInteger(sqrtD)) return null;  // irrational roots
  const denom = 2 * a;
  const [p1, q1] = _lowestTerms(-b + sqrtD, denom);
  const [p2, q2] = _lowestTerms(-b - sqrtD, denom);
  // Leading coefficient of (q1 X - p1)(q2 X - p2) is q1*q2 — must
  // match `a` for the factoring to be exact over integers.
  if (q1 * q2 !== a) return null;
  // Build a single (qX - p) factor.  Prefer cleaner shapes:
  //   q === 1, p > 0  →  (X - p)
  //   q === 1, p < 0  →  (X + |p|)
  //   q === 1, p === 0 →  X
  //   q  > 1, p > 0  →  (q*X - p)
  //   q  > 1, p < 0  →  (q*X + |p|)
  //   q  > 1, p === 0 →  q*X
  const factorFor = (p, q) => {
    if (q === 1) {
      if (p === 0) return Var(varName);
      return p > 0
        ? Bin('-', Var(varName), Num(p))
        : Bin('+', Var(varName), Num(-p));
    }
    const qX = Bin('*', Num(q), Var(varName));
    if (p === 0) return qX;
    return p > 0 ? Bin('-', qX, Num(p)) : Bin('+', qX, Num(-p));
  };
  const f1 = factorFor(p1, q1);
  const f2 = factorFor(p2, q2);
  if (astEqual(f1, f2)) return Bin('^', f1, Num(2));
  return Bin('*', f1, f2);
}

/** _lowestTerms(num, denom) → [p, q]: reduce the rational num/denom
 *  to lowest terms with q > 0 and gcd(|p|, q) === 1.  When `num` is 0
 *  returns [0, 1] (canonical zero).  Used by factorNonMonicQuadratic
 *  to normalise each root before emitting its (q·X - p) factor. */
function _lowestTerms(num, denom) {
  if (denom === 0) throw new Error('_lowestTerms: zero denominator');
  if (num === 0) return [0, Math.abs(denom) / _gcd(0, Math.abs(denom))];
  let g = _gcd(Math.abs(num), Math.abs(denom));
  if (g === 0) g = 1;
  let p = num / g;
  let q = denom / g;
  if (q < 0) { p = -p; q = -q; }
  return [p, q];
}

/** factorSumOrDiffOfCubes(a, b, varName) — factor the integer cubic
 *  `a*X^3 + b` when both `a` (positive) and `|b|` are perfect cubes.
 *  Uses the algebraic identity:
 *
 *     p³Y³ + q³ = (pY + q)(p²Y² - pq·Y + q²)      (sum, b > 0)
 *     p³Y³ - q³ = (pY - q)(p²Y² + pq·Y + q²)      (difference, b < 0)
 *
 *  where Y = X for this coreDegree=3 entry point.
 *
 *  Returns null when either side isn't a perfect cube, leaving the
 *  polynomial to rebuild via rebuildNumericPoly in the caller.
 *
 *  Delegates to `factorSumOrDiffOfCubesOfXk` below for k=1.  That
 *  helper holds the generic `(Y, Y², Y³)` identity-building code and
 *  is also reused by the generalised X^(3k) path (`X^6 + 8`,
 *  `X^9 - 27`, etc.).
 */
function factorSumOrDiffOfCubes(a, b, varName) {
  return factorSumOrDiffOfCubesOfXk(a, b, 1, varName);
}

/** factorSumOrDiffOfCubesOfXk(a, b, k, varName) — factor the integer
 *  sparse polynomial `a*X^(3k) + b` as a sum/difference of cubes in
 *  `Y = X^k`.  When k=1 this is the classic cubic identity; when k>1
 *  the "linear-in-Y" factor becomes `p·X^k + q` and the "quadratic-in-Y"
 *  factor becomes `p²·X^(2k) ∓ pq·X^k + q²`.  We then recurse into
 *  factor() on each piece — `X^6 − 1` → `(X²−1)(X⁴+X²+1)` → the linear
 *  is further factored to `(X−1)(X+1)` and the quadratic factors to
 *  `(X²+X+1)(X²−X+1)`, giving the full product.
 *
 *  Dispatched from `factor()` when the core coefficient vector is
 *  `[e, 0, 0, …, 0, a]` with `e ≠ 0` and the gap has length 3k−1
 *  (i.e. the only non-zero coefficients are at positions 0 and 3k).
 *  Returns null when either side isn't a perfect cube; the caller
 *  falls back to rebuildNumericPoly.
 */
function factorSumOrDiffOfCubesOfXk(a, b, k, varName) {
  if (!Number.isInteger(a) || !Number.isInteger(b) ||
      !Number.isInteger(k)) return null;
  if (a <= 0 || b === 0 || k < 1) return null;
  const p = _cubeRoot(a);
  const q = _cubeRoot(Math.abs(b));
  if (p === null || q === null) return null;
  const isSum = b > 0;

  const X = Var(varName);
  // Y = X when k=1, else X^k.
  const Yast = k === 1 ? X : Bin('^', X, Num(k));
  // Y² = X^(2k) when k>1 (a fresh power node, not (X^k)^2 which the
  // simplifier would leave unchanged in factor()'s re-parse).
  const Y2ast = k === 1 ? Bin('^', X, Num(2))
                        : Bin('^', X, Num(2 * k));

  // Linear-in-Y factor: p·Y ± q, with p=1 collapse.
  const pY = p === 1 ? Yast : Bin('*', Num(p), Yast);
  const linear = isSum
    ? Bin('+', pY, Num(q))
    : Bin('-', pY, Num(q));

  // Quadratic-in-Y factor: p²·Y² ∓ pq·Y + q².
  const p2 = p * p;
  const q2 = q * q;
  const pq = p * q;
  const p2Y2 = p2 === 1 ? Y2ast : Bin('*', Num(p2), Y2ast);
  const pqY  = pq === 1 ? Yast  : Bin('*', Num(pq), Yast);
  const quadMid = isSum
    ? Bin('-', p2Y2, pqY)
    : Bin('+', p2Y2, pqY);
  const quad = Bin('+', quadMid, Num(q2));

  // For k>1 the linear (p·X^k + q) and quadratic (p²·X^(2k) + … + q²)
  // factors are themselves polynomials of degree >1 and may factor
  // further over ℤ — e.g. `X²−1 = (X−1)(X+1)`, `X⁴+X²+1 =
  // (X²+X+1)(X²−X+1)`.  Recurse via the public `factor` entry point
  // to pull those apart.  The classic cubic branch (k=1) gets linear
  // factors (no recursion value) and an irreducible-over-ℚ quadratic,
  // so we skip the recursion there.
  if (k === 1) return Bin('*', linear, quad);

  const linFac  = factor(linear);
  const quadFac = factor(quad);
  // If either recursion simplified to a product, splice its factors
  // into a left-associated chain; otherwise use as-is.
  const pieces = [];
  _flattenMulInto(linFac, pieces);
  _flattenMulInto(quadFac, pieces);
  if (pieces.length === 0) return Bin('*', linear, quad);  // defensive
  let out = pieces[0];
  for (let i = 1; i < pieces.length; i++) {
    out = Bin('*', out, pieces[i]);
  }
  return out;
}

/** _cubeRoot(n) → integer cube root, or null if n isn't a perfect
 *  cube.  Handles only non-negative n (callers strip the sign first
 *  and track it separately).  The tolerance loop around Math.cbrt
 *  shields against floating-point drift for large inputs. */
function _cubeRoot(n) {
  if (!Number.isInteger(n) || n < 0) return null;
  if (n === 0) return 0;
  const approx = Math.round(Math.cbrt(n));
  // Check `approx` and its neighbors in case Math.cbrt is slightly off.
  for (const cand of [approx - 1, approx, approx + 1]) {
    if (cand > 0 && cand * cand * cand === n) return cand;
  }
  return null;
}

/** factorCubicRationalRoot(a, b, c, d, varName) — factor an integer
 *  cubic `a*X^3 + b*X^2 + c*X + d` (a > 0, d ≠ 0) by rational-root
 *  hunting.  Returns a Bin('*', linear, quadratic-AST) on success, or
 *  null when no rational root exists.
 *
 *  Rational Root Theorem: any root p/q (in lowest terms) has p | d and
 *  q | a.  We enumerate positive divisors of |a| for q and signed
 *  divisors of |d| for p, then check each candidate by evaluating the
 *  polynomial in integer arithmetic:
 *
 *        a·p³ + b·p²·q + c·p·q² + d·q³  ?==?  0
 *
 *  (multiplying the usual a·(p/q)³ + … = 0 through by q³ to stay in
 *  integers).  On a hit we synthetic-divide `a·X³ + b·X² + c·X + d`
 *  by `(q·X − p)` to get the quadratic quotient `A·X² + B·X + C`
 *  where A = a/q, and we then hand the quotient to the appropriate
 *  quadratic factorer (monic or non-monic) to pull out any remaining
 *  rational roots.  If the quotient has complex / irrational roots it
 *  emits as-is via rebuildNumericPoly.
 *
 *  Search order: q ascending (so integer roots q=1 win over rational
 *  roots), then |p| ascending, then positive-p before negative-p.
 *  This gives a stable "smallest-magnitude integer root first" order,
 *  consistent enough that (X − 1)(X − 2)(X − 3) kinds of factorizations
 *  come out with the same-order-each-time linear factor first.
 *
 *  Sits AFTER the cubes branch in the factor() dispatch: cubes handles
 *  `a·X³ + d` (coef[1] = coef[2] = 0), and this handles the general
 *  cubic with non-zero middle coefficients.
 */
function factorCubicRationalRoot(a, b, c, d, varName) {
  if (!Number.isInteger(a) || !Number.isInteger(b) ||
      !Number.isInteger(c) || !Number.isInteger(d)) return null;
  if (a <= 0) return null;
  if (d === 0) return null;       // X-GCD step upstream already pulled X

  const pMagCands = _positiveDivisors(Math.abs(d));
  const qCands    = _positiveDivisors(Math.abs(a));

  // Sort ascending so small q / small |p| come first.  Build the full
  // candidate list of (p, q) pairs in a canonical order:
  //   q ascending → |p| ascending → positive-p before negative-p
  // and require gcd(|p|, q) === 1.
  const pairs = [];
  qCands.sort((x, y) => x - y);
  pMagCands.sort((x, y) => x - y);
  for (const q of qCands) {
    for (const pMag of pMagCands) {
      if (_gcd(pMag, q) !== 1) continue;
      pairs.push([pMag, q]);
      pairs.push([-pMag, q]);
    }
  }

  for (const [p, q] of pairs) {
    const val = a * p * p * p
              + b * p * p * q
              + c * p * q * q
              + d * q * q * q;
    if (val !== 0) continue;

    // Synthetic division:  a·X³ + b·X² + c·X + d
    //                    = (q·X − p) · (A·X² + B·X + C)
    //
    //   leading:    A·q                 = a  →  A = a/q
    //   X² coeff:  −A·p + B·q           = b  →  B = (b + A·p)/q
    //   X coeff:   −B·p + C·q           = c  →  C = (c + B·p)/q
    //   constant:  −C·p                 = d  (consistency check)
    //
    // Every division must yield an integer — if any doesn't, it means
    // the quotient isn't integer-coefficiented (shouldn't happen when
    // (p, q) are in lowest terms AND val === 0, but we guard defensively).
    if (a % q !== 0) continue;
    const A = a / q;
    const Bnum = b + A * p;
    if (Bnum % q !== 0) continue;
    const B = Bnum / q;
    const Cnum = c + B * p;
    if (Cnum % q !== 0) continue;
    const C = Cnum / q;
    if (-C * p !== d) continue;

    // Build the linear factor (q·X − p) → clean shapes:
    //   q === 1, p > 0   →   (X − p)
    //   q === 1, p < 0   →   (X + |p|)
    //   q  > 1, p > 0    →   (q·X − p)
    //   q  > 1, p < 0    →   (q·X + |p|)
    const linear = (() => {
      if (q === 1) {
        return p > 0
          ? Bin('-', Var(varName), Num(p))
          : Bin('+', Var(varName), Num(-p));
      }
      const qX = Bin('*', Num(q), Var(varName));
      return p > 0
        ? Bin('-', qX, Num(p))
        : Bin('+', qX, Num(-p));
    })();

    // Factor the quadratic residue A·X² + B·X + C.  Try the monic
    // branch when A === 1, the non-monic branch otherwise.  If either
    // returns null we rebuild the residue as a numeric polynomial AST.
    let quadFactored = null;
    if (A === 1) {
      quadFactored = factorMonicQuadratic(B, C, varName);
    } else if (A > 1) {
      quadFactored = factorNonMonicQuadratic(A, B, C, varName);
    }
    const quadAst = quadFactored !== null
      ? quadFactored
      : rebuildNumericPoly([C, B, A], 2, varName);

    // Collapse repeated linear factors — when the linear factor equals
    // one of the residue's factors, emit the combined shape with a
    // power node instead of duplicating the linear factor.  Handles
    // double roots `(X−r)²(X−s)` and triple roots `(X−r)³`.
    if (quadFactored !== null && isBin(quadFactored)) {
      if (quadFactored.op === '*') {
        if (astEqual(quadFactored.l, linear)) {
          // linear · (linear)·other → (linear)² · other
          return Bin('*', Bin('^', linear, Num(2)), quadFactored.r);
        }
        if (astEqual(quadFactored.r, linear)) {
          return Bin('*', Bin('^', linear, Num(2)), quadFactored.l);
        }
      } else if (quadFactored.op === '^' &&
                 isNum(quadFactored.r) &&
                 astEqual(quadFactored.l, linear)) {
        // linear · (linear)^2 → (linear)^(n+1)
        const n = quadFactored.r.value;
        return Bin('^', linear, Num(n + 1));
      }
    }

    return Bin('*', linear, quadAst);
  }
  return null;
}

/** factorQuarticRationalRoot(a, b, c, d, e, varName) — attempt to
 *  factor the general quartic `a·X⁴ + b·X³ + c·X² + d·X + e` by
 *  hunting for one rational root, synthetic-dividing into a cubic
 *  residue, and recursing into factorCubicRationalRoot.  Returns an
 *  AST or null when no rational root exists.
 *
 *  Preconditions: a, b, c, d, e are integers; a > 0; e !== 0 (the
 *  X-GCD step upstream already pulled any trailing X factor).
 *
 *  The returned AST is a left-assoc `*` chain.  Repeated linear
 *  factors collapse into `(linear)^k`.  If the cubic residue factors
 *  but we can't detect a repeated root, the factors are concatenated
 *  as-is (mirrors the cubic factorer's convention).
 */
function factorQuarticRationalRoot(a, b, c, d, e, varName) {
  if (!Number.isInteger(a) || !Number.isInteger(b) ||
      !Number.isInteger(c) || !Number.isInteger(d) ||
      !Number.isInteger(e)) return null;
  if (a <= 0) return null;
  if (e === 0) return null;

  const pMagCands = _positiveDivisors(Math.abs(e));
  const qCands    = _positiveDivisors(Math.abs(a));
  qCands.sort((x, y) => x - y);
  pMagCands.sort((x, y) => x - y);

  const pairs = [];
  for (const q of qCands) {
    for (const pMag of pMagCands) {
      if (_gcd(pMag, q) !== 1) continue;
      pairs.push([pMag, q]);
      pairs.push([-pMag, q]);
    }
  }

  for (const [p, q] of pairs) {
    // Evaluate a·p⁴ + b·p³·q + c·p²·q² + d·p·q³ + e·q⁴ in integers.
    const p2 = p * p;
    const p3 = p2 * p;
    const p4 = p2 * p2;
    const q2 = q * q;
    const q3 = q2 * q;
    const q4 = q2 * q2;
    const val = a * p4
              + b * p3 * q
              + c * p2 * q2
              + d * p  * q3
              + e      * q4;
    if (val !== 0) continue;

    // Synthetic division:
    //   a·X⁴ + b·X³ + c·X² + d·X + e
    //     = (q·X − p) · (A·X³ + B·X² + C·X + D)
    //
    //   leading:      q·A               = a   →  A = a/q
    //   X³:          q·B − p·A          = b   →  B = (b + A·p)/q
    //   X²:          q·C − p·B          = c   →  C = (c + B·p)/q
    //   X:           q·D − p·C          = d   →  D = (d + C·p)/q
    //   constant:   −p·D                = e   (consistency check)
    if (a % q !== 0) continue;
    const A = a / q;
    const Bnum = b + A * p;
    if (Bnum % q !== 0) continue;
    const B = Bnum / q;
    const Cnum = c + B * p;
    if (Cnum % q !== 0) continue;
    const C = Cnum / q;
    const Dnum = d + C * p;
    if (Dnum % q !== 0) continue;
    const D = Dnum / q;
    if (-D * p !== e) continue;

    // Build the linear factor (q·X − p) with the usual clean shapes.
    const linear = (() => {
      if (q === 1) {
        return p > 0
          ? Bin('-', Var(varName), Num(p))
          : Bin('+', Var(varName), Num(-p));
      }
      const qX = Bin('*', Num(q), Var(varName));
      return p > 0
        ? Bin('-', qX, Num(p))
        : Bin('+', qX, Num(-p));
    })();

    // Recurse into the cubic residue.  If no rational root there
    // (complex/irrational cubic), rebuild as a numeric polynomial AST.
    let cubicAst = null;
    // First try the sum/diff-of-cubes identity when middle coefs vanish.
    if (B === 0 && C === 0 && D !== 0) {
      cubicAst = factorSumOrDiffOfCubes(A, D, varName);
    }
    if (cubicAst === null) {
      cubicAst = factorCubicRationalRoot(A, B, C, D, varName);
    }
    const cubicOrPoly = cubicAst !== null
      ? cubicAst
      : rebuildNumericPoly([D, C, B, A], 3, varName);

    // Combine: flatten cubicOrPoly's factors into a list, prepend our
    // linear, then collapse consecutive equal factors into powers.
    const rawList = [linear];
    _flattenMulInto(cubicOrPoly, rawList);
    const collapsed = _collapseRepeatedFactors(rawList);

    // Emit as a left-assoc `*` chain.
    let result = collapsed[0];
    for (let i = 1; i < collapsed.length; i++) {
      result = Bin('*', result, collapsed[i]);
    }
    return result;
  }
  return null;
}

/** factorQuarticAsProductOfQuadratics(a, b, c, d, e, varName) —
 *  attempt to factor a rational-root-free quartic over the integers
 *  as a product of two (possibly non-monic) quadratics:
 *
 *      a·X⁴ + b·X³ + c·X² + d·X + e
 *          = (a₁·X² + p·X + q)(a₂·X² + r·X + s)
 *
 *  Expanding and matching coefficients gives:
 *      a₁·a₂       = a
 *      a₁·r + a₂·p = b
 *      a₁·s + a₂·q + p·r = c
 *      p·s + q·r   = d
 *      q·s         = e
 *
 *  Strategy:
 *    1. Enumerate ordered integer pairs (a₁, a₂) with a₁·a₂ = a and
 *       a₁ ≤ a₂.  Non-monic case iterates pairs beyond (1, a); monic
 *       just hits (1, 1).
 *    2. For each (a₁, a₂), enumerate signed integer pairs (q, s) with
 *       q·s = e.
 *    3. Solve the residual 2×2 linear system in (p, r):
 *            [a₂  a₁] [p]   [b]
 *            [s   q ] [r] = [d]
 *       via Cramer's rule with det = a₂·q − a₁·s.  Require integer
 *       solutions.  When det = 0 fall back to a bounded p-scan.
 *    4. Verify the remaining coefficient check (X², since X³, X and
 *       constant are satisfied by construction).
 *
 *  Preconditions: a, b, c, d, e are integers, a > 0.  Upstream
 *  `factor()` pulls out sign and content GCD before calling here.
 *
 *  Typical monic hits:
 *      X⁴ + X² + 1    = (X² + X + 1)(X² − X + 1)
 *      X⁴ + 4         = (X² − 2X + 2)(X² + 2X + 2)   (Sophie Germain)
 *      X⁴ + 2X² + 1   = (X² + 1)²                    (repeated quad)
 *
 *  Non-monic hits:
 *      2·X⁴ + X² + 1  = (2·X² + 2·X + 1)(X² − X + 1)   [none known; illustrative]
 *      4·X⁴ + 1       = (2·X² + 2·X + 1)(2·X² − 2·X + 1)
 *      4·X⁴ − 4X² + 1 = (2·X² − 1)²
 *      9·X⁴ − 1       = (3·X² + 1)(3·X² − 1)
 *
 *  Returns a `*`-chain (or `^`-power) AST on a hit, or null to let
 *  the caller fall back to `rebuildNumericPoly`.
 */
function factorQuarticAsProductOfQuadratics(a, b, c, d, e, varName) {
  if (!Number.isInteger(a) || a <= 0) return null;
  if (![b, c, d, e].every(Number.isInteger)) return null;
  if (e === 0) return null;                        // trailing X pulled upstream

  // (1) Enumerate (a₁, a₂) with a₁·a₂ = a and a₁ ≤ a₂.
  const aDivs = _positiveDivisors(a);
  const aPairs = [];
  for (const a1 of aDivs) {
    const a2 = a / a1;
    if (!Number.isInteger(a2) || a2 <= 0) continue;
    if (a1 > a2) continue;                         // avoid duplicates
    aPairs.push([a1, a2]);
  }

  // (2) Enumerate signed integer pairs (q, s) with q·s = e.
  const absE = Math.abs(e);
  const eDivs = _positiveDivisors(absE);
  const qsPairs = [];
  for (const dv of eDivs) {
    const other = e / dv;
    if (!Number.isInteger(other)) continue;
    qsPairs.push([dv, other]);
    qsPairs.push([-dv, -other]);
  }

  for (const [a1, a2] of aPairs) {
    for (const [q, s] of qsPairs) {
      // (3) Solve the 2×2 for (p, r).
      const det = a2 * q - a1 * s;
      let p, r;
      if (det !== 0) {
        const num_p = b * q - a1 * d;
        const num_r = a2 * d - b * s;
        if (num_p % det !== 0) continue;
        if (num_r % det !== 0) continue;
        p = num_p / det;
        r = num_r / det;
      } else {
        // Degenerate (det = 0, i.e. a₂·q = a₁·s).  The two linear
        // equations aren't independent; scan p over a bounded range
        // and accept a (p, r) pair that satisfies all three checks —
        // Eq1 (a₁·r + a₂·p = b), Eq2 (p·s + q·r = d), and the X²
        // consistency (a₁·s + a₂·q + p·r = c).  Range set generously
        // so textbook-sized quartics always land.
        const pMax = Math.max(
          100,
          Math.abs(b) + Math.abs(d) + Math.abs(c) + 10
        );
        // Scan outward from zero (0, +1, -1, +2, -2, ...) so the
        // positive-first convention matches the monic output order:
        // X⁴+X²+1 → (X²+X+1)(X²−X+1) not the reverse.
        const tryPt = (pt) => {
          if ((b - a2 * pt) % a1 !== 0) return false;
          const rt = (b - a2 * pt) / a1;
          if (pt * s + q * rt !== d) return false;
          if (a1 * s + a2 * q + pt * rt !== c) return false;
          p = pt; r = rt;
          return true;
        };
        let found = false;
        if (tryPt(0)) { found = true; }
        for (let mag = 1; mag <= pMax && !found; mag++) {
          if (tryPt(mag))  { found = true; break; }
          if (tryPt(-mag)) { found = true; break; }
        }
        if (!found) continue;
        // Fall through — already verified all three coefficient checks.
      }

      // (4) Consistency check on the X² coefficient (Cramer branch only).
      // X³, X, and constant are satisfied by the linear-system
      // construction.  Degenerate branch checks this inline above.
      if (det !== 0 && a1 * s + a2 * q + p * r !== c) continue;

      // Build each quadratic AST: a_k · X² + coef·X + const (clean shapes).
      const quad = (aa, pp, qq) => {
        // Leading term.
        let expr;
        if (aa === 1) {
          expr = Bin('^', Var(varName), Num(2));
        } else {
          expr = Bin('*', Num(aa), Bin('^', Var(varName), Num(2)));
        }
        // Linear term.
        if (pp === 1)       expr = Bin('+', expr, Var(varName));
        else if (pp === -1) expr = Bin('-', expr, Var(varName));
        else if (pp > 0)    expr = Bin('+', expr, Bin('*', Num(pp), Var(varName)));
        else if (pp < 0)    expr = Bin('-', expr, Bin('*', Num(-pp), Var(varName)));
        // Constant term.
        if (qq > 0)         expr = Bin('+', expr, Num(qq));
        else if (qq < 0)    expr = Bin('-', expr, Num(-qq));
        return expr;
      };

      const q1 = quad(a1, p, q);
      const q2 = quad(a2, r, s);

      // Collapse q1 == q2 into (quad)^2.  Uses structural equality
      // on the built ASTs.
      if (astEqual(q1, q2)) {
        return Bin('^', q1, Num(2));
      }
      return Bin('*', q1, q2);
    }
  }
  return null;
}

/** _collapseRepeatedFactors(factors) — walk a flat factor list and
 *  collapse structurally-equal adjacent (or scattered) factors into
 *  `base^(k1+k2+...)` nodes.  Handles both raw repeats (`X · X`) and
 *  already-powered repeats (`X · X^2` → `X^3`).  Preserves the first
 *  occurrence's position — good enough for the quartic case where
 *  the outer linear sits at index 0 and any matching inner factor
 *  gets folded into it.
 */
function _collapseRepeatedFactors(factors) {
  // Each bucket: { base, exp, index } so we can keep stable order.
  const buckets = [];
  const baseFrom = f => (isBin(f) && f.op === '^' && isNum(f.r))
    ? f.l
    : f;
  const expFrom  = f => (isBin(f) && f.op === '^' && isNum(f.r))
    ? f.r.value
    : 1;
  for (const f of factors) {
    const base = baseFrom(f);
    const exp  = expFrom(f);
    const hit = buckets.find(b => astEqual(b.base, base));
    if (hit) hit.exp += exp;
    else buckets.push({ base, exp });
  }
  return buckets.map(b =>
    b.exp === 1 ? b.base : Bin('^', b.base, Num(b.exp))
  );
}

/** _positiveDivisors(n) → sorted-ascending array of positive divisors
 *  of |n|.  Returns [] for n === 0 (caller should skip).  Used by
 *  factorCubicRationalRoot to enumerate p / q candidates. */
function _positiveDivisors(n) {
  n = Math.abs(n);
  if (n === 0) return [];
  const out = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out;
}

/** factorMonicOnly(coefs, power, mainVar, expanded) — fallback path
 *  for polynomials with non-numeric coefficients (e.g. symbolic
 *  scalars like `A*X^2 + B*X + C`).  Only the strict monic-quadratic
 *  case with integer b, c factors; everything else passes through. */
function factorMonicOnly(coefs, power, mainVar, expanded) {
  if (power !== 2) return expanded;
  const a = numericCoefAt(coefs, 2);
  const b = numericCoefAt(coefs, 1);
  const c = numericCoefAt(coefs, 0);
  if (a === null || b === null || c === null) return expanded;
  if (a !== 1) return expanded;
  if (!Number.isInteger(b) || !Number.isInteger(c)) return expanded;
  const factored = factorMonicQuadratic(b, c, mainVar);
  return factored === null ? expanded : factored;
}

/** rebuildNumericPoly(coefs, degree, varName) — emit a polynomial AST
 *  from a numeric coefficient array with the highest power first.
 *  Skips zero entries; chooses clean shapes (omits `1*`, wraps
 *  negative coefficients as `Neg` so the enclosing chain prints with
 *  a `-` instead of `+ -n`).  Used by FACTOR when the reduced core
 *  can't be factored further but we still need it inside the
 *  wrapped-out result (e.g. `X * (X^2 + 1)`). */
function rebuildNumericPoly(coefs, degree, varName) {
  const parts = [];
  for (let k = degree; k >= 0; k--) {
    const c = coefs[k];
    if (c === 0) continue;
    const varPow = k === 0 ? null
                 : k === 1 ? Var(varName)
                 : Bin('^', Var(varName), Num(k));
    let term;
    if (k === 0) {
      term = c < 0 ? Neg(Num(-c)) : Num(c);
    } else if (c === 1) {
      term = varPow;
    } else if (c === -1) {
      term = Neg(varPow);
    } else if (c < 0) {
      term = Neg(Bin('*', Num(-c), varPow));
    } else {
      term = Bin('*', Num(c), varPow);
    }
    parts.push(term);
  }
  if (parts.length === 0) return Num(0);
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (isNeg(p)) result = Bin('-', result, p.arg);
    else          result = Bin('+', result, p);
  }
  return result;
}

/** Integer GCD.  Both inputs are Math.abs()'d internally so callers
 *  can pass signed values without an extra wrap. */
function _gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

/** _extractIntContent(ast) → { k, rest }.
 *
 *  Pull a signed integer content out of a product-tree.  `ast === k * rest`
 *  semantically, with `rest === null` meaning "1".  Used by `simplify()`'s
 *  fraction-reducer to cancel common integer factors.
 *
 *  Recognised shapes:
 *    Num(n)              →  { k: n, rest: null }     (n must be an integer)
 *    Neg(x)              →  { k: -k(x), rest: rest(x) }
 *    Bin('*', l, r)      →  { k: k(l)·k(r), rest: rebuild(rest(l), rest(r)) }
 *  anything else         →  { k: 1, rest: ast }
 *
 *  Non-integer Num (e.g. 0.5) produces {k: 1, rest: ast} so the
 *  reducer bails out — we don't want to chase floats through gcd. */
function _extractIntContent(ast) {
  if (!ast) return { k: 1, rest: ast };
  if (isNum(ast)) {
    const n = ast.value;
    if (Number.isInteger(n)) return { k: n, rest: null };
    return { k: 1, rest: ast };
  }
  if (isNeg(ast)) {
    const inner = _extractIntContent(ast.arg);
    return { k: -inner.k, rest: inner.rest };
  }
  if (isBin(ast) && ast.op === '*') {
    const L = _extractIntContent(ast.l);
    const R = _extractIntContent(ast.r);
    return { k: L.k * R.k, rest: _mulRest(L.rest, R.rest) };
  }
  return { k: 1, rest: ast };
}

/** Combine two "rest" trees (from _extractIntContent) into a single
 *  multiplicative residue, treating `null` as the identity 1.  Used
 *  only by `_extractIntContent`; not exported. */
function _mulRest(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Bin('*', a, b);
}

/** Rebuild `k * rest` into a canonical AST.  rest === null means 1. */
function _rebuildIntContent(k, rest) {
  if (rest === null) return Num(k);
  if (k === 1)  return rest;
  if (k === -1) return Neg(rest);
  if (k < 0)    return Neg(Bin('*', Num(-k), rest));
  return Bin('*', Num(k), rest);
}

/** _cancelIntegerFactor(l, r) → reduced Bin('/', ...) AST, or null
 *  when no reduction is possible.
 *
 *  Pulls an integer content out of numerator and denominator, divides
 *  by their gcd, and rebuilds the fraction.  Returns null when the gcd
 *  is 1 (no reduction) so the caller can fall through.  Also flips
 *  sign when BOTH numerator and denominator have a negative content,
 *  turning `-x / -y` into `x / y`.
 *
 *  Examples:
 *    2*X / (2*SQRT(X^2+1))   →  X / SQRT(X^2+1)
 *    6*X / 9                 →  2*X / 3
 *    -4*X / 2                →  -2*X
 *    -X / -Y                 →  X / Y  (sign flip, no int content)
 *
 *  Deliberately conservative: it only looks at a product of integers
 *  at each top level.  A full rational-function reducer (pulling a
 *  common polynomial factor) is out of scope for this pass. */
function _cancelIntegerFactor(l, r) {
  let L = _extractIntContent(l);
  let R = _extractIntContent(r);

  // Double-negative flip — even when gcd is 1, `-x / -y` should
  // become `x / y` for readability.
  let flipped = false;
  if (L.k < 0 && R.k < 0) {
    L = { k: -L.k, rest: L.rest };
    R = { k: -R.k, rest: R.rest };
    flipped = true;
  }

  const g = _gcd(L.k, R.k);
  if (g <= 1 && !flipped) return null;
  if (g <= 1 && flipped) {
    // Just the sign flip, no integer cancellation.
    const newL = _rebuildIntContent(L.k, L.rest);
    const newR = _rebuildIntContent(R.k, R.rest);
    return Bin('/', newL, newR);
  }

  const kL2 = L.k / g;
  const kR2 = R.k / g;

  // Denominator collapsed to 1 → just the numerator (possibly an integer).
  if (R.rest === null && kR2 === 1) {
    return _rebuildIntContent(kL2, L.rest);
  }
  if (R.rest === null && kR2 === -1) {
    return _rebuildIntContent(-kL2, L.rest);
  }

  return Bin('/', _rebuildIntContent(kL2, L.rest),
                  _rebuildIntContent(kR2, R.rest));
}

/** numericCoefAt(coefs, power) — read the coefficient at `power`,
 *  summing any multiple contributions, and return the JS number if
 *  the result is a plain Num, else null.  `coefs` is the extract
 *  table produced by extractPolyCoeffs. */
function numericCoefAt(coefs, power) {
  const parts = coefs[power];
  if (!Array.isArray(parts) || parts.length === 0) return 0;
  const s = sumCoefAsts(parts);
  return isNum(s) ? s.value : null;
}

/* ==================================================================
   SUBST — substitute a value for a variable in an expression.

   Two stack shapes supported:

     3-arg:  expr 'var' value SUBST
       →  simplify( expr with Var varName replaced by `value` )

     2-arg list form: expr { 'var' value [ 'var2' val2 ... ] } SUBST
       →  substitutions applied left-to-right, then simplify once.
       List may carry multiple (name, value) pairs.

   `value` can be any AST-representable thing: a Num, another
   Symbolic, a bare Var.  Numeric Reals / Integers get wrapped as
   Num; Names become Var; Symbolic's stored AST is inlined.

   After substitution we run `simplify` so numeric substitutions
   collapse (e.g. `SUBST('X^2 + 1', 'X', 3)` → `Num(10)`).  The
   caller decides whether to re-wrap as Symbolic or unwrap to Real.
================================================================== */

/** replaceVar(ast, varName, replacement) — recursively replace
 *  every `Var varName` in `ast` with the given AST `replacement`.
 *  Other nodes are cloned only on the branch that actually contains
 *  the match, so untouched subtrees share identity.  This is a
 *  structural replace — no renaming, no capture checks needed since
 *  our AST has no binders. */
function replaceVar(ast, varName, replacement) {
  if (!ast) return ast;
  if (isVar(ast)) return ast.name === varName ? replacement : ast;
  if (isNum(ast)) return ast;
  if (isNeg(ast)) {
    const inner = replaceVar(ast.arg, varName, replacement);
    return inner === ast.arg ? ast : Neg(inner);
  }
  if (isBin(ast)) {
    const l = replaceVar(ast.l, varName, replacement);
    const r = replaceVar(ast.r, varName, replacement);
    return (l === ast.l && r === ast.r) ? ast : Bin(ast.op, l, r);
  }
  if (isFn(ast)) {
    let dirty = false;
    const args = ast.args.map(a => {
      const r = replaceVar(a, varName, replacement);
      if (r !== a) dirty = true;
      return r;
    });
    return dirty ? Fn(ast.name, args) : ast;
  }
  return ast;
}

/** subst(expr, varName, valueAst) — single substitution convenience.
 *  Wraps replaceVar + simplify.  Always simplifies afterward so the
 *  result is a cleaned-up AST. */
function subst(expr, varName, valueAst) {
  return simplify(replaceVar(expr, varName, valueAst));
}

/* ==================================================================
   Polynomial COLLECT — group a polynomial by powers of a named
   variable.

     'X + A*X + B*X + C' 'X' COLLECT  →  '(1 + A + B)*X + C'
     'X^2 + 2*X^2 + X + 5' 'X' COLLECT → '3*X^2 + X + 5'

   Uses the `extractPolyCoeffs` primitive above: walk the additive
   chain, bucket each term by its power of the named variable,
   concatenate per-power coefficient lists, and rebuild the output
   polynomial with `sumCoefAsts` reducing each bucket.

   Terms that aren't polynomial in the named variable (e.g. a
   factor inside a SIN/LN/SQRT that contains X) fall through as a
   trailing "unrecognised" term — the combiner preserves them in
   original order by appending them unchanged.  We also preserve
   stable ordering: highest power first (classic textbook form).

   Scoped to handle any integer power of the var; linear and quadratic
   are the common cases.
================================================================== */

/** collectByVar(ast, varName) — polynomial COLLECT entry.  Returns
 *  the regrouped AST or `ast` unchanged if the shape isn't
 *  recognisable. */
function collectByVar(ast, varName) {
  if (!ast) return ast;
  // If the variable doesn't appear at all, nothing to collect.
  if (!freeVars(ast).has(varName)) return simplify(ast);

  const coefs = extractPolyCoeffs(ast, varName);
  if (!coefs) return ast;

  // Rebuild: highest power first, simplified coefficient in front.
  // A bucket with coef 0 (after summing) drops out entirely.
  const parts = [];
  for (let k = coefs.length - 1; k >= 0; k--) {
    const coefAst = sumCoefAsts(coefs[k] || []);
    if (isNum(coefAst) && coefAst.value === 0) continue;

    // Build coef * X^k, with special cases for cleaner output:
    //   k=0             → coefAst
    //   k=1, coef=1     → Var
    //   k=1, coef=-1    → Neg(Var)
    //   k=1, coef=Num   → Bin('*', Num, Var)
    //   k>=2, coef=1    → Var^k
    //   k>=2, coef=-1   → Neg(Var^k)
    //   k>=2            → Bin('*', coef, Var^k)
    let term;
    const varPow = k === 0 ? null
                 : k === 1 ? Var(varName)
                 : Bin('^', Var(varName), Num(k));
    if (k === 0) {
      term = coefAst;
    } else if (isNum(coefAst) && coefAst.value === 1) {
      term = varPow;
    } else if (isNum(coefAst) && coefAst.value === -1) {
      term = Neg(varPow);
    } else if (isNeg(coefAst)) {
      // Lift Neg up one level for cleaner printing: (-E)*X becomes -(E*X).
      term = Neg(Bin('*', coefAst.arg, varPow));
    } else {
      term = Bin('*', coefAst, varPow);
    }
    parts.push(term);
  }
  if (parts.length === 0) return Num(0);

  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    // If the next part is a Neg, emit as '-'.
    const p = parts[i];
    if (isNeg(p)) result = Bin('-', result, p.arg);
    else          result = Bin('+', result, p);
  }
  return result;
}

/* ==================================================================
   SOLVE — one-variable equation / polynomial root finder.

   Coverage:

     linear:     a·X + b = 0        →  X = -b/a
     quadratic:  a·X² + b·X + c = 0 →  up to two roots via the
                                        discriminant formula.
     cubic / quartic / higher: rational-root scan via factor(),
                  then numeric real-root bisection and Durand-Kerner
                  for complex roots.

   Input can be a bare expression (treated as `expr = 0`) or an
   equation `Bin('=', L, R)` (we solve `L - R = 0`).  The `varName`
   argument is mandatory at this slice; the multi-variable / system
   case is a future extension.

   Return shape is an array of SOLUTION ASTs.  Each solution is an
   equation `Bin('=', Var(varName), rootAst)`.  The caller (the SOLVE
   op in ops.js) wraps those in Symbolics and puts them into an RList.
   When the discriminant is negative we emit complex solutions as
   `re ± im·i` AST nodes using `Var('i')` as the imaginary unit.
================================================================== */

/** solve(ast, varName) — return an array of solution ASTs for the
 *  polynomial equation `ast = 0` (or the equivalent L − R when `ast`
 *  is Bin('=', L, R)).  Supports linear and quadratic polynomials in
 *  `varName` with constant (numeric) coefficients.  Higher-degree,
 *  symbolic-coefficient, or non-polynomial inputs return null so the
 *  caller can fall through gracefully.
 */
function solve(ast, varName) {
  if (!ast || !varName) return null;

  // Normalise equation → expr: L − R.
  let expr = ast;
  if (isBin(ast) && ast.op === '=') {
    expr = Bin('-', ast.l, ast.r);
  }
  // Simplify + expand so a polynomial shape can be recognised.
  expr = expand(simplify(expr));

  const coefs = extractPolyCoeffs(expr, varName);
  if (!coefs) return null;

  // Normalise: gather numeric coefficients by power.  A fully numeric
  // vector lets us apply closed-form solutions; if any coefficient is
  // symbolic we bail (future work).
  const power = coefs.length - 1;
  if (power < 1) {
    // degree 0: either a = 0 (identity — infinitely many solutions)
    // or a non-zero constant (no solutions).  In both cases return an
    // empty array; the caller can distinguish by checking if the
    // simplified expr is zero.
    return [];
  }
  const numCoefs = [];
  for (let k = 0; k <= power; k++) numCoefs[k] = numericCoefAt(coefs, k);
  if (!numCoefs.every(c => c !== null)) return null;

  // Drop leading zeros (shouldn't happen if extractPolyCoeffs is
  // clean, but guard anyway).
  let realPower = power;
  while (realPower > 0 && numCoefs[realPower] === 0) realPower--;

  if (realPower === 1) {
    // a·X + b = 0 → X = -b/a.  Prefer an integer when possible.
    const a = numCoefs[1];
    const b = numCoefs[0];
    return [ Bin('=', Var(varName), _rationalAst(-b, a)) ];
  }

  if (realPower === 2) {
    const a = numCoefs[2];
    const b = numCoefs[1];
    const c = numCoefs[0];
    const D = b * b - 4 * a * c;
    if (D < 0) {
      // Complex conjugate pair.  Roots are (-b ± i·√|D|) / (2a).  We
      // factor |D| = k²·f with f square-free so the output is k·√f
      // instead of √|D|; then reduce the fraction by gcd(|b|, |k|, |2a|)
      // to keep things tidy.  The imaginary unit is `Var('i')` — the
      // HP50's symbolic-mode convention.
      const absD = -D;
      const [k, f] = _extractSquareFactor(absD);
      const twoA   = 2 * a;
      return [+1, -1].map(sign => {
        const g = _gcd(_gcd(Math.abs(b), Math.abs(k)), Math.abs(twoA));
        const nbScaled    = -b / g;
        const kScaled     =  k / g;
        const denomScaled = twoA / g;
        // Imaginary atom: `i` when k=1,f=1 ; `k·i` when f=1 ; `√f·i`
        // when k=1 ; otherwise `k·√f·i`.  `i` sits at the tail so the
        // quadratic branch matches the D-K branch's `(reNum ± imNum·i)/d`
        // shape for a unified grammar.
        const I = Var('i');
        const imagAtom = (() => {
          if (f === 1 && kScaled === 1) return I;
          if (f === 1)                 return Bin('*', Num(kScaled), I);
          if (kScaled === 1)           return Bin('*', Fn('SQRT', [Num(f)]), I);
          return Bin('*', Bin('*', Num(kScaled), Fn('SQRT', [Num(f)])), I);
        })();
        // Numerator: nbScaled ± imagAtom, collapsed when nbScaled = 0
        // so we don't emit `0 + i`.  Negation of the imag atom:
        //   -i          → Neg(Var('i'))
        //   -k·i        → (-k)·i
        //   -√f·i       → Neg(√f·i)
        //   -k·√f·i     → (-k)·√f·i
        let numerator;
        const negImag = () => {
          if (f === 1 && kScaled === 1) return Neg(I);
          if (f === 1)                 return Bin('*', Num(-kScaled), I);
          if (kScaled === 1)           return Neg(Bin('*', Fn('SQRT', [Num(f)]), I));
          return Bin('*', Bin('*', Num(-kScaled), Fn('SQRT', [Num(f)])), I);
        };
        if (sign > 0) {
          numerator = nbScaled === 0
            ? imagAtom
            : Bin('+', Num(nbScaled), imagAtom);
        } else {
          numerator = nbScaled === 0
            ? negImag()
            : Bin('-', Num(nbScaled), imagAtom);
        }
        const root = denomScaled === 1
          ? numerator
          : denomScaled === -1
            ? Neg(numerator)
            : Bin('/', numerator, Num(denomScaled));
        return Bin('=', Var(varName), root);
      });
    }
    if (D === 0) {
      // Single double-root X = -b/(2a).
      return [ Bin('=', Var(varName), _rationalAst(-b, 2 * a)) ];
    }
    // D > 0.  Two roots (-b + √D)/(2a) and (-b - √D)/(2a).  If D is a
    // perfect square we can emit closed-form rationals; otherwise we
    // emit a surd expression with a reduced fraction.
    const sqrtD = Math.sqrt(D);
    if (Number.isInteger(sqrtD)) {
      const r1 = _rationalAst(-b + sqrtD, 2 * a);
      const r2 = _rationalAst(-b - sqrtD, 2 * a);
      return [
        Bin('=', Var(varName), r1),
        Bin('=', Var(varName), r2),
      ];
    }
    // Surd form.  Factor D = k²·f with f square-free so we can emit
    // k·√f instead of √D for readability.  Then further reduce the
    // fraction (-b ± k√f) / (2a) by a common numeric GCD when we can.
    const [k, f] = _extractSquareFactor(D);
    const twoA = 2 * a;
    const surdAsts = [+1, -1].map(sign => {
      // Root = (-b + sign·k·√f) / (2a).  Numeric part -b and surd
      // coefficient sign·k share a common factor with twoA in some
      // cases; pull the gcd across all three to keep the output tidy.
      const g = _gcd(_gcd(Math.abs(b), Math.abs(k)), Math.abs(twoA));
      const nbScaled   = -b / g;
      const kScaled    =  k / g;
      const denomScaled = twoA / g;
      // Surd atom: k·√f.  k===1 collapses to √f; f===1 (shouldn't
      // happen since D isn't a perfect square) collapses to k.
      const surdAtom = f === 1
        ? Num(kScaled)
        : (kScaled === 1
            ? Fn('SQRT', [Num(f)])
            : Bin('*', Num(kScaled), Fn('SQRT', [Num(f)])));
      // Numerator: nbScaled ± surdAtom.  When nbScaled === 0 and the
      // surd atom is k·√f with k ≥ 1, collapse -surdAtom to (-k)·√f so
      // the printer doesn't wrap the whole thing in parens.
      let numerator;
      if (sign > 0) {
        numerator = nbScaled === 0
          ? surdAtom
          : Bin('+', Num(nbScaled), surdAtom);
      } else if (nbScaled === 0) {
        // -surdAtom : prefer -k·√f over Neg(k·√f) for readability.
        if (f === 1) {
          numerator = Num(-kScaled);
        } else if (kScaled === 1) {
          numerator = Neg(Fn('SQRT', [Num(f)]));
        } else {
          numerator = Bin('*', Num(-kScaled), Fn('SQRT', [Num(f)]));
        }
      } else {
        numerator = Bin('-', Num(nbScaled), surdAtom);
      }
      const root = denomScaled === 1
        ? numerator
        : denomScaled === -1
          ? Neg(numerator)
          : Bin('/', numerator, Num(denomScaled));
      return Bin('=', Var(varName), root);
    });
    return surdAsts;
  }

  // Specialised branch for the *pure* cubic `a·X³ + c = 0` (no X² or
  // X term).  The three cube roots of −c/a are r·{1, ω, ω²} with
  // ω = (−1 + i√3)/2 — closed-form symbolic output without falling
  // back to Durand-Kerner's 12-digit decimals for the conjugate pair.
  // We only fire this when the real cube root of −c/a reconstructs as
  // sign·k·∛f/m (f > 1) — pure rationals like X³ − 8 still go through
  // the factor() path below (which emits the integer root 2 without
  // getting the complex pair wrong).
  if (realPower === 3 && numCoefs[2] === 0 && numCoefs[1] === 0) {
    const a = numCoefs[3];
    const c = numCoefs[0];
    const q = -c / a;                       // X³ = q
    const absCbrt = Math.cbrt(Math.abs(q));
    const r = q >= 0 ? absCbrt : -absCbrt;  // real root (as a JS number)
    const cube = _cubeRootReconstruct(r, 30, 1e-9);
    if (cube) {
      const { sign, k, f, m } = cube;
      const realAst = _cubeRootAst(sign, k, f, m);
      const complexPair = _cubicComplexRootsFromSurd(sign, k, f, m);
      return [realAst, ...complexPair].map(
        rr => Bin('=', Var(varName), rr));
    }
    // Fall through to the generic factor / numeric path below when
    // the real root is a pure rational (q is a perfect cube) or
    // something we can't reconstruct.
  }

  // Degree ≥ 3: defer to factor() — if factor() produces a product of
  // linear factors we can read roots off it.  Cubic and quartic with
  // rational roots are handled by factor(); try that first and see if
  // the result is a product of linear / power factors.
  if (realPower >= 3) {
    const coreCoefs = numCoefs.slice(0, realPower + 1);
    const rebuilt = rebuildNumericPoly(coreCoefs, realPower, varName);
    const factored = factor(rebuilt);
    const exactRoots = _rootsFromFactored(factored, varName);

    // Happy path: FACTOR broke it into enough linear factors to read
    // off every root as a rational/integer.  Return those and skip the
    // numeric pass.
    if (exactRoots !== null && exactRoots.length === realPower) {
      return exactRoots.map(r => Bin('=', Var(varName), r));
    }

    // Fallback: numeric real-root scan.  Either _rootsFromFactored
    // couldn't parse the shape (returned null) or FACTOR left an
    // irreducible residue (some roots are irrational or complex —
    // cases like X^4 - 2, X^3 + X - 1, 5*X^3 - 3*X + 1, ...).  We
    // find every real root numerically via sign-change bisection +
    // Newton polish, then merge with the exact roots we already have,
    // deduping on proximity.
    const merged   = exactRoots ? [...exactRoots] : [];
    const known    = merged.map(_astToRealOrNull).filter(v => v !== null);
    const numeric  = _numericRealRoots(coreCoefs);
    for (const r of numeric) {
      if (known.some(k => Math.abs(k - r) < 1e-5)) continue;
      merged.push(_numericRootAst(r));
      known.push(r);
    }

    // Durand-Kerner pass for complex roots.  If we still haven't
    // found `realPower` roots (typical for an odd cubic with a
    // single real root + a conjugate pair, or a quartic with no
    // real roots at all), run the complex solver and pick up any roots
    // with non-negligible imaginary part.  Real roots from Durand-
    // Kerner are ignored here — the bisection pass above is more
    // reliable on the real axis.
    //
    // Deflate the polynomial against each real root we already have
    // before running D-K.  This has two wins:
    //   1. D-K works on a smaller (degree − #real-roots) polynomial,
    //      so convergence is faster and better conditioned.
    //   2. We don't have to filter out spurious near-real outputs from
    //      D-K that are just the already-found real roots returning
    //      as low-quality approximations.
    if (merged.length < realPower) {
      let residueCoefs = coreCoefs.slice();
      for (const r of known) {
        if (residueCoefs.length < 3) break;        // stop before degree<2
        const deflated = _deflatePoly(residueCoefs, r);
        if (deflated) residueCoefs = deflated;
      }
      const complex = _numericComplexRoots(residueCoefs);
      if (complex) {
        const seen = [];   // { re, im } for already-emitted complex roots
        for (const { re, im } of complex) {
          if (Math.abs(im) < 1e-7) continue;              // real — skip
          if (seen.some(s => Math.abs(s.re - re) < 1e-5 &&
                             Math.abs(s.im - im) < 1e-5)) continue;
          merged.push(_complexRootAst(re, im));
          seen.push({ re, im });
        }
      }
    }
    return merged.map(r => Bin('=', Var(varName), r));
  }
  return null;
}

/** _deflatePoly(coefs, root) — synthetic-divide `P(x)` by `(x - root)`,
 *  returning the degree-(n−1) quotient coefficients (little-endian, so
 *  the same layout `solve` uses).  The division remainder is the
 *  residual P(root), which should be ≈ 0 for an exact root — we accept
 *  small numeric error (up to 1e-6 × max|coef|) and drop the remainder.
 *  If the residual is too large the root isn't ours and we return null
 *  so the caller can skip deflation for that root.
 *
 *  The Durand-Kerner pass is only interested in non-real roots, so
 *  deflating out real roots found by the earlier passes tightens
 *  convergence.
 */
function _deflatePoly(coefs, root) {
  const n = coefs.length - 1;
  if (n < 1) return null;
  // Synthetic division from the top: b_{n-1} = a_n; b_{k-1} = a_k + r·b_k.
  const out = new Array(n);
  out[n - 1] = coefs[n];
  for (let k = n - 1; k >= 1; k--) {
    out[k - 1] = coefs[k] + root * out[k];
  }
  const remainder = coefs[0] + root * out[0];
  // Safety valve: require |remainder| to be small relative to coefs.
  let scale = 0;
  for (const c of coefs) scale = Math.max(scale, Math.abs(c));
  if (Math.abs(remainder) > 1e-6 * Math.max(1, scale)) return null;
  return out;
}

/** Numeric real-root finder for a polynomial with real coefficients.
 *  Returns an array of refined real-root approximations (plain JS
 *  numbers).  Strategy:
 *
 *    1. Cauchy upper bound on |roots|: `L = 1 + max|a_i|/|a_n|`.
 *    2. Dense sign-change scan on [-L, L] (≥200 slices, 50 per degree).
 *    3. Bisect each sign change to near-convergence, then a handful of
 *       Newton iterations to polish to ~1e-12.
 *    4. Dedup on |Δ| < 1e-7 so a repeated root surfaces once.
 *
 *  Limitations:
 *    - Tangent (even-multiplicity) real roots that touch but don't
 *      cross the axis are missed by sign-change scans; that's a known
 *      trade-off.  Rational tangent roots are picked up by the exact
 *      FACTOR pass anyway, which runs first.
 *    - Complex roots are intentionally not sought here — the exact
 *      quadratic branch handles D<0, and the Durand-Kerner pass above
 *      handles higher-degree complex roots.
 */
function _numericRealRoots(coefs) {
  const n = coefs.length - 1;
  if (n < 1 || coefs[n] === 0) return [];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(coefs[i]));
  const L = 1 + maxAbs / Math.abs(coefs[n]);
  const evalP = x => {
    let v = coefs[n];
    for (let i = n - 1; i >= 0; i--) v = v * x + coefs[i];
    return v;
  };
  const evalDP = x => {
    let v = n * coefs[n];
    for (let i = n - 1; i >= 1; i--) v = v * x + i * coefs[i];
    return v;
  };
  const STEPS = Math.max(200, 50 * n);
  const step  = (2 * L) / STEPS;
  const out   = [];
  const TOL_X = 1e-13;
  const dedup = r => out.some(x => Math.abs(x - r) < 1e-7);
  let prevX = -L, prevY = evalP(prevX);
  const push = r => { if (!dedup(r)) out.push(r); };
  if (prevY === 0) push(prevX);
  for (let i = 1; i <= STEPS; i++) {
    const x = -L + i * step;
    const y = evalP(x);
    if (y === 0) { push(x); prevX = x; prevY = y; continue; }
    if (Math.sign(y) !== Math.sign(prevY)) {
      // Bisection refinement.
      let lo = prevX, hi = x, flo = prevY;
      let mid = 0.5 * (lo + hi);
      for (let k = 0; k < 80; k++) {
        mid = 0.5 * (lo + hi);
        const fm = evalP(mid);
        if (fm === 0 || (hi - lo) < TOL_X) break;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; }
        else                                   { hi = mid; }
      }
      // Newton polish.
      for (let k = 0; k < 24; k++) {
        const fx = evalP(mid);
        const dfx = evalDP(mid);
        if (!dfx || !isFinite(dfx)) break;
        const next = mid - fx / dfx;
        if (!isFinite(next)) break;
        if (Math.abs(next - mid) < 1e-15) { mid = next; break; }
        mid = next;
      }
      push(mid);
    }
    prevX = x; prevY = y;
  }
  return out;
}

/** Convert a numeric root value into a Num AST, snapping to a nearby
 *  integer if the error is below 1e-10.  Otherwise keep ~12 digits of
 *  precision — enough for the HP50's 12-digit working precision. */
function _numericRootAst(r) {
  const rounded = Math.round(r);
  if (Math.abs(r - rounded) < 1e-10) return Num(rounded);
  // Try a closed-form reconstruction (rational / square-root surd /
  // cube root) before falling back to the 12-digit decimal.  This is
  // what turns `solve(X^3 − 2)`'s real root from `1.25992104989` into
  // `XROOT(2, 3)`.  _scalarClosedForm rejects false positives via a
  // tight `Math.abs(reconstructed - r) < tol` check, so pure
  // transcendentals (e.g. roots of `X^3 + X − 1`) are left alone and
  // still emit the numeric decimal.
  const closed = _scalarClosedForm(r);
  if (closed) return closed;
  // toPrecision may return scientific notation — keep whichever the
  // JS runtime chooses; formatAlgebra will stringify Num.value via
  // String(), which matches parser-accepted forms.
  return Num(Number(r.toPrecision(12)));
}

/** _numericComplexRoots(coefs) — Durand-Kerner method for all roots
 *  of a real-coefficient polynomial.  Returns an array of `{re, im}`
 *  objects (length === degree when converged), or null on failure.
 *
 *  Algorithm.  Let P(z) = a_n z^n + … + a_0, monic-normalised.
 *  Seed n distinct points z_k on a circle of radius r around the
 *  origin (Cauchy bound), offset by a small angle so none of the
 *  seeds sit exactly on the real axis.  Iterate:
 *
 *      z_k ← z_k − P(z_k) / Π_{j≠k}(z_k − z_j)
 *
 *  Simultaneously for all k.  Converges quadratically for simple
 *  roots.  Halts when the maximum correction falls below TOL or the
 *  iteration budget is exhausted.
 *
 *  Real polynomials produce conjugate pairs automatically when the
 *  seeds are complex.  The caller is responsible for:
 *    - snapping near-real roots back to real (|im| < tol),
 *    - deduping against real roots found by the bisection pass,
 *    - formatting each complex root into an AST.
 *
 *  Limitations: repeated complex roots slow convergence down to linear
 *  rate, so the iteration budget needs to be generous (we use 400).
 *  The method is numerically stable for well-conditioned polynomials
 *  up to degree ~50; higher-degree cases are out of scope here. */
function _numericComplexRoots(coefs) {
  const n = coefs.length - 1;
  if (n < 1 || coefs[n] === 0) return null;
  // Monic-normalise.
  const lead = coefs[n];
  const a = coefs.map(c => c / lead);

  // Horner evaluation over ℂ.
  const pEval = (zr, zi) => {
    let vr = 1, vi = 0;                      // a[n] / a[n] = 1
    for (let i = n - 1; i >= 0; i--) {
      const nr = vr * zr - vi * zi + a[i];
      const ni = vr * zi + vi * zr;
      vr = nr; vi = ni;
    }
    return [vr, vi];
  };

  // Seed guesses on a circle of radius r, offset by 0.4 rad to avoid
  // the real axis (which would lock symmetric real polynomials into
  // a pure-real trajectory and prevent conjugate pairs from separating).
  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(a[i]));
  const r = Math.max(1, maxAbs);
  const theta0 = 0.4;
  const zr = new Array(n);
  const zi = new Array(n);
  for (let k = 0; k < n; k++) {
    const ang = theta0 + (2 * Math.PI * k) / n;
    zr[k] = r * Math.cos(ang);
    zi[k] = r * Math.sin(ang);
  }

  const ITER_MAX = 400;
  const TOL      = 1e-12;
  let converged  = false;
  for (let iter = 0; iter < ITER_MAX; iter++) {
    let maxDelta = 0;
    for (let k = 0; k < n; k++) {
      const [pr, pi] = pEval(zr[k], zi[k]);

      // Product Π_{j≠k} (z_k − z_j)  over complex numbers.
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const ar = zr[k] - zr[j];
        const ai = zi[k] - zi[j];
        const nr = dr * ar - di * ai;
        const ni = dr * ai + di * ar;
        dr = nr; di = ni;
      }
      const mag2 = dr * dr + di * di;
      if (mag2 === 0) continue;               // coincident seeds; skip

      // Correction = P(z_k) / product.
      const cr = (pr * dr + pi * di) / mag2;
      const ci = (pi * dr - pr * di) / mag2;

      zr[k] -= cr;
      zi[k] -= ci;
      const d = Math.sqrt(cr * cr + ci * ci);
      if (d > maxDelta) maxDelta = d;
    }
    if (maxDelta < TOL) { converged = true; break; }
  }
  if (!converged) return null;

  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = { re: zr[k], im: zi[k] };
  return out;
}

/** _rationalReconstruct(x, maxDen, tol) → {p, q} with x ≈ p/q and
 *  q ≤ maxDen, or null if no simple rational fits within tolerance.
 *  Uses the continued-fraction convergent algorithm; preserves sign by
 *  splitting |x| and the sign separately so Math.floor never drifts
 *  across the zero.  Returns null for NaN/Infinity.
 *
 *  Fuels closed-form surd detection on complex roots emitted by
 *  Durand-Kerner — `re² = p/q` gives us the ingredients to recover
 *  `re = k·√f/m`.
 */
function _rationalReconstruct(x, maxDen = 100, tol = 1e-9) {
  if (!isFinite(x)) return null;
  const sign  = x < 0 ? -1 : 1;
  const absX  = Math.abs(x);
  // Near-integer short-circuit.
  const rounded = Math.round(absX);
  if (Math.abs(absX - rounded) < tol) return { p: sign * rounded, q: 1 };
  // Continued-fraction convergents.  h_{-1}=1, h_{-2}=0; k_{-1}=0, k_{-2}=1.
  let h0 = 1, h1 = 0;
  let k0 = 0, k1 = 1;
  let a  = absX;
  for (let i = 0; i < 30; i++) {
    if (!isFinite(a)) break;
    const ai = Math.floor(a);
    const h2 = ai * h0 + h1;
    const k2 = ai * k0 + k1;
    if (k2 > maxDen) break;
    const err = Math.abs(absX - h2 / k2);
    if (err < tol) return { p: sign * h2, q: k2 };
    h1 = h0; h0 = h2;
    k1 = k0; k0 = k2;
    const frac = a - ai;
    if (frac < 1e-15) return { p: sign * h2, q: k2 };
    a = 1 / frac;
  }
  return null;
}

/** _surdReconstruct(x, maxDen, tol) → {sign, k, f, m} with
 *  x ≈ sign·k·√f/m, f square-free and > 1, gcd(k, m) = 1, or null.
 *
 *  Algorithm: x² = k²·f/m².  Reconstruct x² as rational N/D via
 *  continued fractions, then √(N/D) = √(N·D)/D; extract the largest
 *  square factor from N·D to split into k² and square-free f.  Reduce
 *  k/m by their gcd.  Reject pure rationals (f = 1) — the caller
 *  should have handled those via `_rationalReconstruct`.
 */
function _surdReconstruct(x, maxDen = 50, tol = 1e-9) {
  if (!isFinite(x) || x === 0) return null;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const xSq  = absX * absX;
  // x² must round to a rational with modest denominator for a clean surd.
  const rat = _rationalReconstruct(xSq, maxDen * maxDen, tol * 4);
  if (!rat || rat.p <= 0 || rat.q <= 0) return null;
  const N = rat.p;
  const D = rat.q;
  // √(N/D) = √(N·D) / D.  Strip square factor from N·D.
  let prod = N * D;
  if (prod <= 0) return null;
  let k = 1;
  let f = prod;
  for (let p = 2; p * p <= f; p++) {
    while (f % (p * p) === 0) { k *= p; f /= (p * p); }
  }
  let m = D;
  const g = _gcd(k, m);
  k = k / g;
  m = m / g;
  if (f === 1) return null;                 // pure rational — not a surd
  if (k > maxDen || m > maxDen) return null;
  // Verify.  Use a looser verification tol than reconstruction — the
  // rational reconstruction of x² can accrue a factor-of-|x| error
  // when propagated back through the square root.
  const reconstructed = sign * k * Math.sqrt(f) / m;
  if (Math.abs(reconstructed - x) > tol * 100 * Math.max(1, Math.abs(x))) return null;
  return { sign, k, f, m };
}

/** _surdAst(sign, k, f, m) → AST for sign·k·√f/m.
 *  Assumes f > 1 and square-free, k ≥ 1, m ≥ 1, gcd(k, m) = 1.
 */
function _surdAst(sign, k, f, m) {
  const radical  = Fn('SQRT', [Num(f)]);
  const numer    = k === 1 ? radical : Bin('*', Num(k), radical);
  const core     = m === 1 ? numer   : Bin('/', numer, Num(m));
  return sign < 0 ? Neg(core) : core;
}

/** _cubeRootReconstruct(x, maxDen, tol) → {sign, k, f, m} with
 *  x ≈ sign · k · ∛f / m, f cube-free and > 1, gcd(k, m) = 1, or null.
 *
 *  Cube-root counterpart of `_surdReconstruct`.  Covers the real root
 *  of `X^3 − k` (= ∛k) and the broader k·∛f/m family that shows up
 *  when a rational polynomial has a lone rational cube as its constant
 *  term after scaling.  We only return a match when the cube actually
 *  lands on a rational with modest numerator/denominator — so
 *  transcendentals / higher-order surds don't accidentally pass.
 *
 *  Algorithm: x³ must reconstruct to a rational N/D.  Then
 *    x = ∛(N/D) = ∛(N · D²) / D
 *  so pull the largest cube factor out of N · D² into k, leaving f
 *  cube-free.  m = D; reduce gcd(k, m).  Reject f = 1 (that's a pure
 *  rational and should have been caught upstream).
 */
function _cubeRootReconstruct(x, maxDen = 30, tol = 1e-9) {
  if (!isFinite(x) || x === 0) return null;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const xCu = absX * absX * absX;
  // x³ must be a rational with a modest denominator for a clean cube root.
  const rat = _rationalReconstruct(xCu, maxDen * maxDen * maxDen, tol * 4);
  if (!rat || rat.p <= 0 || rat.q <= 0) return null;
  const N = rat.p;
  const D = rat.q;
  // ∛(N/D) = ∛(N·D²) / D.  Strip cube factor from N·D².
  let prod = N * D * D;
  if (prod <= 0 || !Number.isFinite(prod)) return null;
  let k = 1;
  let f = prod;
  for (let p = 2; p * p * p <= f; p++) {
    while (f % (p * p * p) === 0) { k *= p; f /= (p * p * p); }
  }
  let m = D;
  const g = _gcd(k, m);
  k = k / g;
  m = m / g;
  if (f === 1) return null;                 // pure rational — not a cube root
  if (k > maxDen || m > maxDen) return null;
  // Verify to a looser tolerance — cube-then-cbrt can lose a few ulps.
  const reconstructed = sign * k * Math.cbrt(f) / m;
  if (Math.abs(reconstructed - x) > tol * 100 * Math.max(1, Math.abs(x))) return null;
  return { sign, k, f, m };
}

/** _cubeRootAst(sign, k, f, m) → AST for sign · k · ∛f / m.
 *  Assumes f > 1 and cube-free, k ≥ 1, m ≥ 1, gcd(k, m) = 1.
 *
 *  Uses HP50's `XROOT(arg, 3)` spelling for ∛ (consistent with the
 *  XROOT stack op).  The cube-root radical itself is always positive;
 *  the `sign` parameter wraps the final result in a Neg when negative.
 */
function _cubeRootAst(sign, k, f, m) {
  const radical = Fn('XROOT', [Num(f), Num(3)]);
  const numer   = k === 1 ? radical : Bin('*', Num(k), radical);
  const core    = m === 1 ? numer   : Bin('/', numer, Num(m));
  return sign < 0 ? Neg(core) : core;
}

/** _cubicComplexRootsFromSurd(sign, k, f, m) — emit ASTs for the
 *  non-real conjugate pair of `X³ = q`, where the real root is
 *  `sign · k · ∛f / m` (the output of `_cubeRootReconstruct`).
 *
 *  The three cube roots of q are r·{1, ω, ω²} where ω = e^(2πi/3) =
 *  (-1 + i√3)/2.  So with r = α·∛f (α = sign·k/m):
 *     root1 = α·∛f · (-1 + i√3)/2 = (-α·∛f + α·∛f·√3·i) / 2
 *     root2 = α·∛f · (-1 − i√3)/2 = (-α·∛f − α·∛f·√3·i) / 2
 *
 *  We fold the /m of α into the outer /2 so the denominator is a
 *  single Num, then reduce by gcd with |α·k| to keep the coefficient
 *  small.  Output shape:   `(-aN·∛f ± aN·∛f·√3·i) / denomRed`,
 *  with collapses for aN ∈ {1, −1}.  Mirrors the quadratic branch's
 *  `(nb ± imagAtom)/denom` grammar so downstream formatters don't
 *  need a new case.
 */
function _cubicComplexRootsFromSurd(sign, k, f, m) {
  const alphaNum = sign * k;
  const denom    = 2 * m;
  const g        = _gcd(Math.abs(alphaNum), denom);
  const aN       = alphaNum / g;          // signed, reduced
  const denomRed = denom / g;             // positive
  const cbrtF    = Fn('XROOT', [Num(f), Num(3)]);
  const sqrt3    = Fn('SQRT',  [Num(3)]);
  const I        = Var('i');
  // -aN·∛f, collapsed for |aN|===1.
  const negAtom = aN === 1
    ? Neg(cbrtF)
    : aN === -1
      ? cbrtF
      : Bin('*', Num(-aN), cbrtF);
  // aN·∛f·√3, collapsed for |aN|===1.  We keep it positive when aN>0
  // and emit Neg(...) when aN<0 so the ± in the parent op is the
  // *only* sign on the imaginary atom.
  const imAtom = aN === 1
    ? Bin('*', cbrtF, sqrt3)
    : aN === -1
      ? Neg(Bin('*', cbrtF, sqrt3))
      : Bin('*', Bin('*', Num(aN), cbrtF), sqrt3);
  return [+1, -1].map(s => {
    const numerator = s > 0
      ? Bin('+', negAtom, Bin('*', imAtom, I))
      : Bin('-', negAtom, Bin('*', imAtom, I));
    return denomRed === 1 ? numerator : Bin('/', numerator, Num(denomRed));
  });
}

/** _scalarClosedForm(x, tol) → AST for a closed-form approximation of
 *  x (rational, k·√f/m, or k·∛f/m), or null when no simple form fits.
 *  Preference order: Integer / pure rational > square-root surd > cube-root.
 *
 *  The cube-root fallback lets `solve(X^3 − k)`'s real root print
 *  exactly as `XROOT(k, 3)` rather than a 12-digit approximation.
 */
function _scalarClosedForm(x, tol = 1e-9) {
  const rat = _rationalReconstruct(x, 100, tol);
  if (rat) return _rationalAst(rat.p, rat.q);
  const surd = _surdReconstruct(x, 50, tol);
  if (surd) return _surdAst(surd.sign, surd.k, surd.f, surd.m);
  const cube = _cubeRootReconstruct(x, 30, tol);
  if (cube) return _cubeRootAst(cube.sign, cube.k, cube.f, cube.m);
  return null;
}

/** _complexRootAst(re, im) — build `re + im·i` as an AST.
 *
 *  First try closed-form reconstruction of both components (rational
 *  or `k·√f/m` surd).  When both fit, emit the exact closed form so
 *  e.g. `X^3 + 1` prints `1/2 + (√3/2)·i` instead of
 *  `0.5 + 0.866025403784·i`.  When either component is irreducibly
 *  irrational (e.g. `2^(1/4)` from `X^4 - 2`'s pure-imaginary roots),
 *  fall back to the numeric shape.
 */
function _complexRootAst(re, im) {
  const Ivar = Var('i');

  // --- Closed-form attempt ---
  const reAst = _scalarClosedForm(re);
  const imAst = _scalarClosedForm(im);
  if (reAst && imAst) {
    return _assembleReImAst(reAst, imAst, re, im, Ivar);
  }

  // --- Numeric fallback ---
  const snap = x => {
    const rd = Math.round(x);
    if (Math.abs(x - rd) < 1e-10) return rd;
    return Number(x.toPrecision(12));
  };
  const R = snap(re);
  const I = snap(im);

  // Pure imaginary (re ≈ 0).
  if (R === 0) {
    if (I === 1)  return Ivar;
    if (I === -1) return Neg(Ivar);
    return Bin('*', Num(I), Ivar);             // Num(I) carries its sign
  }

  // General re ± |im|·i.
  const absI = Math.abs(I);
  const imAtom = absI === 1 ? Ivar : Bin('*', Num(absI), Ivar);
  return I > 0
    ? Bin('+', Num(R), imAtom)
    : Bin('-', Num(R), imAtom);
}

/** _extractClosedFormParts — decompose a closed-form scalar AST (as
 *  produced by `_scalarClosedForm`) into `{sign, num, denom}` so
 *  `_assembleReImAst` can detect components that share a denominator
 *  and repackage them as a single fraction.
 *
 *  `num` is an AST node carrying the nonnegative-signed numerator
 *  (e.g. `Num(1)`, `Fn('SQRT',[Num(3)])`, `Bin('*', Num(k), SQRT(f))`).
 *  `denom` is a positive integer.  `sign` is +1 or -1 so the caller can
 *  reconstruct the signed value as `sign * num / denom`.
 *
 *  Lets `_complexRootAst` unify `1/2 ± √3/2·i` into `(1 ± √3·i)/2`
 *  when both components land on the same denom.
 */
function _extractClosedFormParts(ast) {
  if (!ast) return null;
  if (isNeg(ast)) {
    const inner = _extractClosedFormParts(ast.arg);
    if (!inner) return null;
    return { sign: -inner.sign, num: inner.num, denom: inner.denom };
  }
  if (isNum(ast)) {
    const v = ast.value;
    if (!Number.isFinite(v)) return null;
    return { sign: v < 0 ? -1 : 1, num: Num(Math.abs(v)), denom: 1 };
  }
  // rational / surd denominator shape: numer / Num(d) with d a positive int.
  if (isBin(ast) && ast.op === '/' &&
      isNum(ast.r) && Number.isInteger(ast.r.value) && ast.r.value > 0) {
    const inner = _extractClosedFormParts(ast.l);
    if (inner) {
      return { sign: inner.sign, num: inner.num,
               denom: inner.denom * ast.r.value };
    }
    // `ast.l` is a composite we can't split — treat as positive numerator.
    return { sign: 1, num: ast.l, denom: ast.r.value };
  }
  // A bare surd (Fn('SQRT', ...)) or surd·coef product — treated as
  // positive with denom 1 since `_surdAst` only wraps with Neg() when
  // sign<0, and only emits Num·SQRT shapes with Num positive.
  return { sign: 1, num: ast, denom: 1 };
}

/** _assembleReImAst — combine reAst + imAst·i where both components
 *  are already-built closed-form ASTs.  Handles:
 *    - Pure-imaginary (re ≈ 0)  →  drop re.
 *    - Pure-real (im ≈ 0)       →  drop im.  (Real D-K roots are
 *      skipped by the caller, but guard defensively.)
 *    - im ≈ ±1                  →  collapse  1·i → i, -1·i → -i.
 *    - im < 0                   →  emit `re - |im|·i` rather than
 *      `re + (-|im|)·i` for a readable diff shape.
 *    - Common-denominator packaging: when both reAst and imAst
 *      decompose to closed-form shapes with the same integer
 *      denominator > 1, repackage as `(reNum ± imNum·i) / d`.  Matches
 *      the quadratic branch's output shape for `X^2 + X + 1` and
 *      unifies the visual grammar across the quadratic / cubic /
 *      higher-degree branches.
 */
function _assembleReImAst(reAst, imAst, reNumeric, imNumeric, Ivar) {
  const reIsZero = Math.abs(reNumeric) < 1e-12;
  const imIsZero = Math.abs(imNumeric) < 1e-12;
  if (reIsZero && imIsZero) return Num(0);
  if (imIsZero) return reAst;

  // --- Common-denominator packaging ---
  if (!reIsZero) {
    const rP = _extractClosedFormParts(reAst);
    const iP = _extractClosedFormParts(imAst);
    if (rP && iP && rP.denom === iP.denom && rP.denom > 1) {
      // Build (reSigned ± imAtom) / d.  imAtom uses surd-first order
      // (`SQRT(f)·i`), matching the D-K fallback path's convention
      // when imNum isn't bare Num(1).
      let imAtom;
      if (isNum(iP.num) && iP.num.value === 1) {
        imAtom = Ivar;
      } else {
        imAtom = Bin('*', iP.num, Ivar);
      }
      // reSigned — rational component wrapped with Neg when sign<0.
      // Special-case Num: emit Num(-v) rather than Neg(Num(v)) so the
      // formatter sees an integer literal.
      let reSigned;
      if (rP.sign < 0) {
        reSigned = isNum(rP.num) ? Num(-rP.num.value) : Neg(rP.num);
      } else {
        reSigned = rP.num;
      }
      const numerator = iP.sign < 0
        ? Bin('-', reSigned, imAtom)
        : Bin('+', reSigned, imAtom);
      return Bin('/', numerator, Num(rP.denom));
    }
  }

  // Split sign out of imAst so the joining op can be `-` when im<0.
  let imSign = +1;
  let imMag  = imAst;
  if (isNeg(imAst)) {
    imSign = -1; imMag = imAst.arg;
  } else if (isNum(imAst) && imAst.value < 0) {
    imSign = -1; imMag = Num(-imAst.value);
  }

  // imAtom: unit |im|=1 drops the magnitude.
  let imAtom;
  if (isNum(imMag) && imMag.value === 1) {
    imAtom = Ivar;
  } else {
    imAtom = Bin('*', imMag, Ivar);
  }

  if (reIsZero) {
    return imSign < 0 ? Neg(imAtom) : imAtom;
  }
  return imSign < 0 ? Bin('-', reAst, imAtom) : Bin('+', reAst, imAtom);
}

/** Reduce a rational-root AST (the shapes _rationalAst / _rootsFromFactored
 *  emit) to a plain JS number so the numeric fallback can dedupe
 *  against exact roots.  Returns null for any non-numeric shape
 *  (e.g. a surd or complex — those won't appear here, but the guard
 *  keeps the helper safe to call on arbitrary root ASTs).
 */
function _astToRealOrNull(ast) {
  if (!ast) return null;
  if (isNum(ast)) return typeof ast.value === 'number' ? ast.value : null;
  if (isNeg(ast)) {
    const v = _astToRealOrNull(ast.arg);
    return v === null ? null : -v;
  }
  if (isBin(ast) && ast.op === '/') {
    const a = _astToRealOrNull(ast.l);
    const b = _astToRealOrNull(ast.r);
    return (a === null || b === null || b === 0) ? null : a / b;
  }
  if (isBin(ast) && (ast.op === '+' || ast.op === '-')) {
    const a = _astToRealOrNull(ast.l);
    const b = _astToRealOrNull(ast.r);
    if (a === null || b === null) return null;
    return ast.op === '+' ? a + b : a - b;
  }
  return null;
}

/** _rationalAst(num, denom) → AST node for the rational `num/denom`
 *  reduced to lowest terms.  Integer result when the division is
 *  exact; otherwise a `num/denom` Bin with reduced integers.  Handles
 *  sign by canonicalising to a positive denominator.
 */
function _rationalAst(num, denom) {
  if (denom === 0) return Num(NaN);
  let [p, q] = _lowestTerms(num, denom);
  if (q === 1) return Num(p);
  // Emit negative over positive: -1/2 rather than 1/-2.
  return p < 0
    ? Neg(Bin('/', Num(-p), Num(q)))
    : Bin('/', Num(p), Num(q));
}

/** _extractSquareFactor(n) → [k, f] with n = k²·f and f square-free.
 *  Used by `solve` to turn √D into k·√f when D has a square factor.
 */
function _extractSquareFactor(n) {
  if (n <= 1) return [1, n];
  let k = 1;
  let f = n;
  for (let p = 2; p * p <= f; p++) {
    while (f % (p * p) === 0) { k *= p; f /= (p * p); }
  }
  return [k, f];
}

/** _rootsFromFactored(ast, varName) → array of root ASTs when `ast`
 *  is a product (possibly with `^k` repeats) of linear factors in
 *  varName; returns null if we don't recognise the shape or if a
 *  non-linear factor is present (e.g. an irreducible quadratic).
 *
 *  The caller (solve) uses this to extract roots from factor()'s
 *  output for cubic / quartic inputs.  Repeated roots are emitted
 *  once each multiplicity — SOLVE's user likely wants distinct roots
 *  rather than list-with-multiplicity, but on the HP50 the SOLVE
 *  builtin does return repeated roots; we follow that convention.
 */
function _rootsFromFactored(ast, varName) {
  const factors = [];
  _flattenMulInto(ast, factors);
  const roots = [];
  for (const f of factors) {
    // (base)^k — unpack power.
    let base = f;
    let mult = 1;
    if (isBin(f) && f.op === '^' && isNum(f.r) && Number.isInteger(f.r.value)) {
      base = f.l;
      mult = f.r.value;
    }
    // A bare integer / Num multiplier contributes no roots.
    if (isNum(base)) continue;
    // Bare variable X (possibly wrapped with ^k above) → root 0.
    if (isVar(base) && base.name === varName) {
      for (let i = 0; i < mult; i++) roots.push(Num(0));
      continue;
    }
    // Linear factor (X - p) / (X + p) / (q·X - p) / (q·X + p).
    const r = _linearFactorRoot(base, varName);
    if (r === null) return null;
    for (let i = 0; i < mult; i++) roots.push(r);
  }
  return roots;
}

/** _linearFactorRoot(ast, varName) → root AST for a linear factor
 *  `±(qX ± p)` in varName, or null if the shape isn't linear in
 *  varName.  Handles the canonical shapes emitted by
 *  factorMonicQuadratic / factorNonMonicQuadratic /
 *  factorCubicRationalRoot / factorQuarticRationalRoot:
 *
 *     Var                 → 0
 *     Bin('-', Var, Num)  → +Num           (X - p → X = p)
 *     Bin('+', Var, Num)  → -Num           (X + p → X = -p)
 *     Bin('-', qX, Num)   → Num/q
 *     Bin('+', qX, Num)   → -Num/q
 */
function _linearFactorRoot(ast, varName) {
  if (isVar(ast) && ast.name === varName) return Num(0);
  if (!isBin(ast)) return null;
  if (ast.op !== '+' && ast.op !== '-') return null;
  // Detect a "q·X" factor on the left: either plain Var or Bin('*', Num, Var).
  const left = ast.l;
  let q = null;
  if (isVar(left) && left.name === varName) q = 1;
  else if (isBin(left) && left.op === '*' &&
           isNum(left.l) && isVar(left.r) && left.r.name === varName) {
    q = left.l.value;
  } else return null;
  if (!isNum(ast.r)) return null;
  const p = ast.r.value;
  const rootNum = ast.op === '-' ? p : -p;
  return _rationalAst(rootNum, q);
}
