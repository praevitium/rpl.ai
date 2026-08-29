// SPDX-License-Identifier: GPL-3.0-or-later
//
// Bidirectional conversion between rpl5050's AST (algebra.js) and the
// string syntax that Giac's `caseval` takes and emits.
//
// rpl5050 AST (see algebra.js):
//   Num(value)        numeric literal
//   Var(name)         identifier
//   Neg(arg)          unary negation
//   Bin(op, l, r)     binary: +, -, *, /, ^   (comparisons too, but CAS
//                     normally doesn't round-trip comparisons)
//   Fn(name, args[])  function call — HP-style uppercase name
//
// Giac syntax:
//   Same infix surface, but function names are lowercase. A few names
//   don't map 1:1 (HP LOG is base-10 while Giac `log` is natural; HP
//   ALOG is `10^x`). We carry an explicit name map in both directions.
//
// This module doesn't depend on the Giac engine itself. It's pure
// string / AST manipulation, so it's safe to use in Node tests.

import { parseAlgebra, Var, Neg } from "../algebra.js";
import { isValidHpIdentifier } from "../types.js";
import { RPLError } from "../stack.js";

/* ------------------------------------------------------------------
   CAS-input identifier validation.

   Every name that ends up inside a Giac command string — whether from
   a `Var` inside the AST, a `Fn` name, or a user-supplied extraVars
   entry (DERIV/INTEG/SOLVE/COLLECT's second argument) — must be a
   syntactically valid HP identifier.  Otherwise the string leaks a
   character Giac interprets specially (notably `#`, which starts a
   line comment in Xcas) and caseval silently truncates or returns
   garbage that parseAlgebra then chokes on — "Unexpected character '#'
   at pos 0" is the canonical symptom.

   Validating at the CAS boundary surfaces a clean "Invalid name: <id>"
   RPLError before we call Giac, matching the same wording STO /
   CRDIR use for write-path names (see ops.js _coerceStorableName).
   ------------------------------------------------------------------ */

function assertValidCasName(name) {
  if (!isValidHpIdentifier(name)) throw new RPLError(`Invalid name: ${name}`);
}

function infGiacFromName(name) {
  if (name == null) return null;
  const s = String(name);
  if (s === "∞" || s === "+∞") return "+infinity";
  if (s === "-∞") return "-infinity";
  const u = s.toUpperCase();
  if (u === "INFINITY" || u === "+INFINITY") return "+infinity";
  if (u === "-INFINITY") return "-infinity";
  return null;
}

function infAstFromGiac(s) {
  const t = String(s).trim().toLowerCase();
  if (t === "+infinity" || t === "infinity" || t === "inf" || t === "+inf") {
    return Var("∞");
  }
  if (t === "-infinity" || t === "-inf") return Neg(Var("∞"));
  return null;
}

/** Walk an AST and throw on the first Var / Fn whose name wouldn't
 *  round-trip through Giac.  ∞ / INFINITY names are allowed. */
function assertAstNamesValid(ast) {
  if (!ast || typeof ast !== "object") return;
  switch (ast.kind) {
    case "var":
      if (!infGiacFromName(ast.name)) assertValidCasName(ast.name);
      return;
    case "fn":
      assertValidCasName(ast.name);
      for (const a of ast.args) assertAstNamesValid(a);
      return;
    case "neg":
      assertAstNamesValid(ast.arg);
      return;
    case "bin":
      assertAstNamesValid(ast.l);
      assertAstNamesValid(ast.r);
      return;
  }
}


/* ------------------------------------------------------------------
   Function-name maps.

   Keys on the left of HP_TO_GIAC are HP/rpl5050 names (normalized
   uppercase). Values are Giac names. Not every HP function has a
   direct Giac equivalent; this table will grow as ops are migrated.
   ------------------------------------------------------------------ */

export const HP_TO_GIAC = Object.freeze({
  SIN: "sin", COS: "cos", TAN: "tan",
  ASIN: "asin", ACOS: "acos", ATAN: "atan",
  SINH: "sinh", COSH: "cosh", TANH: "tanh",
  ASINH: "asinh", ACOSH: "acosh", ATANH: "atanh",
  LN: "ln",
  LOG: "log10",    // HP LOG is base-10; Giac `log` is natural
  EXP: "exp",
  SQRT: "sqrt",
  ABS: "abs",
  SIGN: "sign",
  MIN: "min", MAX: "max",
  GCD: "gcd", LCM: "lcm",
  FACT: "factorial",
  GAMMA: "Gamma",
  "Β": "Beta", // rare — carry through if someone uses the Greek name
  ERF: "erf", ERFC: "erfc",
  ARG: "arg", CONJ: "conj",
  // MOD, XROOT, ALOG, LNGAMMA, INTEG have non-trivial mappings —
  // handled as special cases in astToGiac, not via this table.
});

/** Inverse of HP_TO_GIAC, extended with Giac-only names that parsing
    needs to recognise. When the output from Giac uses a lowercase name
    we have no HP equivalent for, we keep it lowercase and let
    parseAlgebra reject it if it's unknown — easier to extend than to
    silently mangle. */
export const GIAC_TO_HP = Object.freeze(
  Object.fromEntries([
    ...Object.entries(HP_TO_GIAC).map(([hp, g]) => [g, hp]),
    // Aliases Giac emits that we route to the same HP canonical name:
    ["log", "LN"],          // natural log (only seen in `latex(...)` output)
    ["atan2", "ATAN2"],     // extended trig
    // Constants — left as lowercase identifiers for now; the AST layer
    // will wrap them as Var('pi') etc. and formatters downstream can
    // prettify.
  ]),
);

/* ------------------------------------------------------------------
   AST -> Giac input string.
   ------------------------------------------------------------------ */

/**
 * Convert an rpl5050 AST into a Giac-parseable expression string.
 *
 * Strategy: walk the tree mirroring formatAlgebra's precedence logic
 * so we emit minimal parens; but swap HP function names for their
 * Giac equivalents and handle the few special cases the name table
 * can't cover (HP ALOG, XROOT, MOD, LNGAMMA).
 *
 * Unknown function names pass through verbatim. The caller is
 * expected to validate that whatever Giac receives is meaningful —
 * if it isn't, `caseval` will return an error string.
 */
export function astToGiac(ast) {
  // Reject invalid identifier names before they reach Giac.  Without
  // this gate, a Var('#FFh') emits `#FFh` in the command string and
  // Xcas treats `#` as a line comment — truncating the input and
  // returning garbled output that parseAlgebra then fails to parse
  // ("Unexpected character '#' at pos 0").
  assertAstNamesValid(ast);
  return emit(ast, 0);
}

const PREC = {
  "+": 1, "-": 1,
  "*": 2, "/": 2,
  "^": 3,
};

function emit(ast, parentPrec) {
  if (!ast) return "";
  switch (ast.kind) {
    case "num":
      return formatNum(ast.value);
    case "var":
      return infGiacFromName(ast.name) || ast.name;
    case "neg": {
      const inf = ast.arg && ast.arg.kind === "var" && infGiacFromName(ast.arg.name);
      if (inf === "+infinity") {
        return parentPrec >= 2 ? "(-infinity)" : "-infinity";
      }
      if (inf === "-infinity") return "+infinity";
      const inner = emit(ast.arg, 4);
      const s = `-${inner}`;
      return parentPrec >= 2 ? `(${s})` : s;
    }
    case "fn":
      return emitFn(ast);
    case "bin": {
      const p = PREC[ast.op];
      if (p === undefined) {
        // Comparison / unknown — unlikely for CAS round-trip. Pass
        // through at low precedence.
        return `${emit(ast.l, 0)}${ast.op}${emit(ast.r, 0)}`;
      }
      const rightAssoc = ast.op === "^";
      const lPrec = rightAssoc ? p + 1 : p;
      const rPrec = rightAssoc ? p : p + 1;
      const lStr = emit(ast.l, lPrec);
      const rStr = emit(ast.r, rPrec);
      const s = `${lStr}${ast.op}${rStr}`;
      return p < parentPrec ? `(${s})` : s;
    }
    default:
      return "?";
  }
}

function formatNum(v) {
  if (Number.isInteger(v)) return v.toString();
  return String(v);
}

function emitFn(ast) {
  const hpName = ast.name.toUpperCase();
  const args = ast.args.map((a) => emit(a, 0));

  // --- special cases that don't fit the simple name map ---
  if (hpName === "ALOG") {
    // HP ALOG(x) = 10^x
    return `(10^(${args[0]}))`;
  }
  if (hpName === "LNGAMMA") {
    // HP LNGAMMA(x) = ln(Gamma(x))
    return `ln(Gamma(${args[0]}))`;
  }
  if (hpName === "XROOT") {
    // HP XROOT(n, x) = x^(1/n)  — HP arg order is n first, then x
    return `((${args[1]})^(1/(${args[0]})))`;
  }
  if (hpName === "MOD") {
    // HP MOD(a, b) — Giac has `irem` for integer remainder and `%` infix.
    // Use Giac's `irem` for integers and rely on caller for type-specific
    // dispatch; this is adequate for the symbolic surface.
    return `irem(${args[0]},${args[1]})`;
  }
  if (hpName === "INTEG") {
    // HP INTEG(expr, var) -> Giac integrate(expr, var)
    return `integrate(${args.join(",")})`;
  }

  // --- generic name mapping ---
  const giacName = HP_TO_GIAC[hpName] ?? ast.name;
  return `${giacName}(${args.join(",")})`;
}

/* ------------------------------------------------------------------
   Caseval command builder.

   Hands a pure expression-string to a caller-supplied `buildCmd`
   wrapper.  No `purge(v1);purge(v2);…` preamble is emitted: rpl5050's
   CAS flow never assigns values to Giac-side variables, so free
   identifiers like `X`, `Y`, … arrive at Xcas in their default
   unassigned `DOM_IDENT` state and stay symbolic without prompting.
   Adding a `purge(X)` preamble would be actively harmful — Xcas
   raises `No such variable X` when `purge` runs for an unassigned
   name — so the builder stays preamble-free.

   `extraVars` are validated here (so a bad name surfaces the same
   `Invalid name: <id>` RPLError regardless of caller); names inside
   `exprAst` are validated by `astToGiac`.

   Pure (string in / string out, no engine ref) so tests can pin the
   exact command text — the mock engine's fixtures are keyed on the
   full caseval string.

   If future ops start assigning Giac-side state or using names that
   collide with Xcas built-ins (`UI`, `GF`, `IS`, …), reintroduce a
   targeted purge for the specific colliding names only, and guard
   each with a Giac-level try/catch so an unassigned-variable error
   doesn't abort the semicolon-sequence.
   ------------------------------------------------------------------ */

/**
 * Build a Giac caseval command from `exprAst` and a wrapper.
 *
 * @param {object}   exprAst    rpl5050 AST whose free variables should
 *                              be treated as undefined symbolic names.
 * @param {function} buildCmd   given the astToGiac string, return the
 *                              Giac command to evaluate, e.g.
 *                              `(e) => \`factor(${e})\``.
 * @param {string[]} [extraVars] additional names to validate.  Use for
 *                              ops that take a standalone variable
 *                              argument (DERIV, INTEG, SOLVE, …) so a
 *                              bad name surfaces the same RPLError
 *                              shape as a bad name inside `exprAst`.
 *                              Also handy for SUBST's replacement ASTs.
 * @returns {string}            full caseval command string.
 */
export function buildGiacCmd(exprAst, buildCmd, extraVars = []) {
  for (const v of extraVars) assertValidCasName(v);
  const giacExpr = astToGiac(exprAst);
  return buildCmd(giacExpr);
}

/**
 * Split a Giac list literal (`"[a, b, c]"`) into the raw element
 * strings, respecting nested brackets and parens.  Each element can
 * then be fed back into `giacToAst`.
 *
 * Returns `null` when the input isn't a list — callers can then treat
 * the string as a scalar result.
 *
 * Used by SOLVE (roots list), factor-over-Q variants, and any other op
 * that expects a homogeneous list of expressions.  The splitter doesn't
 * interpret the elements itself — a `[sqrt(2), -sqrt(2)]` passes
 * through as the two raw strings `"sqrt(2)"` and `"-sqrt(2)"`.
 *
 * Accepted shapes:
 *   `[a, b, c]`         — Xcas default list literal.
 *   `list[a, b, c]`     — typed-list form some giacwasm builds emit
 *                          (especially for `solve` results).  The
 *                          `list` prefix is stripped before splitting.
 *   `seq[a, b, c]` /
 *   `set[a, b, c]`      — same shape with a different type tag; folded
 *                          back to the bare list since downstream
 *                          callers (SOLVE et al.) don't distinguish.
 */
export function splitGiacList(giacStr) {
  let s = String(giacStr).trim();
  // Strip Xcas typed-list prefix.  Some builds print `solve` results
  // as `list[1,2]` instead of the bare `[1,2]`; leaving the prefix in
  // place causes giacToAst to choke on `list[…]` ("Trailing input at
  // pos 4: '[1]'").  Recognised tags: list / seq / set / poly1 — all
  // of which carry the same `[…]` body shape.
  const m = s.match(/^(list|seq|set|poly1)\[/);
  if (m) s = s.slice(m[1].length);
  if (!(s.startsWith("[") && s.endsWith("]"))) return null;
  const body = s.slice(1, -1).trim();
  if (body === "") return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts;
}

/* ------------------------------------------------------------------
   Giac output string -> AST.
   ------------------------------------------------------------------ */

/**
 * Giac's `caseval` returns its result as a C string, and for a handful
 * of output shapes wraps the expression in literal double-quotes — most
 * notably when the input was a semicolon sequence.  The embedded quotes
 * trip up the HP-style expression parser and the list splitter, which
 * don't accept `"` as a token.
 *
 * Strip a single layer of surrounding double-quotes if present, plus
 * any standard backslash escapes Giac may have inserted inside.
 * Expression / list strings never legitimately begin with a quote, so
 * this is safe.  Unquoted results pass through unchanged.
 *
 * Exported so the engine adapter can normalise raw `caseval` output at
 * the one place it crosses the Giac boundary.
 */
export function stripGiacQuotes(s) {
  if (typeof s !== "string") return s;
  // Iteratively strip layers of surrounding double-quotes.  Giac
  // sometimes nests the wrap: when a semicolon-sequence returns a value
  // that is itself string-typed on the Giac side, the output arrives
  // double-wrapped as `"\"...\""` — one `""` layer from the sequence,
  // another from the inner string type.  A single strip leaves a
  // leading `"` that `parseAlgebra` then trips on
  // (`Unexpected character '"' at pos 0`).  Loop until stable.
  let prev;
  let cur = s;
  do {
    prev = cur;
    if (
      cur.length >= 2 &&
      cur.charCodeAt(0) === 0x22 &&
      cur.charCodeAt(cur.length - 1) === 0x22
    ) {
      const inner = cur.slice(1, -1);
      // Undo the handful of backslash escapes Giac uses when it wraps a
      // result in quotes: \" \\ \n \t. Anything else passes through.
      cur = inner.replace(/\\(["\\nt])/g, (_m, c) => {
        if (c === "n") return "\n";
        if (c === "t") return "\t";
        return c;
      });
    }
  } while (cur !== prev);
  return cur;
}

/**
 * Parse a string returned by Giac into an rpl5050 AST.
 *
 * Strategy: pre-process the string (lowercase Giac names -> HP
 * uppercase) then hand it to algebra.js's parseAlgebra.
 *
 * Giac can also return:
 *   - lists:     [a, b, c]                    — not yet supported
 *   - special:   undef                        — not yet supported
 *   - piecewise: piecewise(c1, v1, c2, v2, …) — not yet supported
 *   - ±infinity: mapped to Var('∞') / Neg(Var('∞'))
 * Unsupported shapes throw so the caller can handle them explicitly
 * rather than silently produce garbage.
 */
export function giacToAst(giacStr) {
  const s = String(giacStr).trim();
  if (s === "" || s === "undef") {
    throw new GiacResultError(s || "empty");
  }
  if (s.startsWith("[") && s.endsWith("]")) {
    throw new GiacResultError(s, "list");
  }
  // `list[…]` / `seq[…]` / `set[…]` / `poly1[…]` are typed-list shapes
  // some giacwasm builds emit instead of bare `[…]` — recognise them
  // here too so they route to the "list" branch (callers can split via
  // splitGiacList) rather than falling through to parseAlgebra and
  // failing with "Trailing input at pos 4: '[…]'".
  if (/^(list|seq|set|poly1)\[.*\]$/.test(s)) {
    throw new GiacResultError(s, "list");
  }
  if (s.includes("piecewise(")) {
    throw new GiacResultError(s, "piecewise");
  }
  const infAst = infAstFromGiac(s);
  if (infAst) return infAst;

  // Giac runtime errors sometimes make it across the boundary as
  // plain-text result strings rather than thrown exceptions — e.g.
  // `No such variable X` when `purge(X)` is called on an unassigned
  // variable in a build that doesn't support try/catch around purge.
  // Detect the well-known prefixes and raise a `GiacResultError` with a
  // clean user-facing message instead of leaking the raw text into
  // parseAlgebra (which trips on the leading quote / unexpected token).
  if (isGiacErrorString(s)) {
    throw new GiacResultError(s, "runtime-error");
  }

  // Normalise unicode prefix-form operators that the Xcas/Pyiodide
  // wasm build emits in pretty-print mode, before the function-name
  // remap below sees them.  parseAlgebra's lexer is ASCII-only and
  // chokes on any unicode token that didn't get rewritten here.
  //
  // Observed cases:
  //   √x      → sqrt(x)        (DERIV(SQRT(X)) = 1/(2*√x))
  //   √(...)  → sqrt(...)
  //   √123    → sqrt(123)
  //
  // We do NOT try to be exhaustive — only patterns Giac has actually
  // been seen producing.  Add cases here as they surface (likely
  // ∛ for cube root, ∞ for infinity if those start leaking through;
  // π / ⅈ are typically already returned in ASCII as `pi` / `i`).
  const unicodeNormalised = s
    .replace(/√\(/g, "sqrt(")
    .replace(/√([A-Za-z_][A-Za-z0-9_]*)/g, "sqrt($1)")
    .replace(/√(\d+(?:\.\d+)?)/g, "sqrt($1)");

  // Remap lowercase Giac names -> HP uppercase. The algebra parser's
  // isKnownFunction check is case-insensitive but we want canonical
  // uppercase in the AST, matching the rest of the codebase. We only
  // remap names that appear as `name(` (function-call context) to
  // avoid touching bare identifiers that may be variable names.
  //
  // The substitution is regex-based; it's enough for Giac's output
  // which is always well-formed syntactically.
  const mapped = unicodeNormalised.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (match, name) => {
    const hp = GIAC_TO_HP[name];
    if (hp) return `${hp}(`;
    // Unknown name — leave as-is; parseAlgebra will reject if truly
    // unrecognised.
    return match;
  });

  // Wrap parse failures with the raw Giac string so the user (and
  // future debuggers) see exactly what Giac returned instead of a bare
  // `Unexpected character '"' at pos 0` that gives no hint whether the
  // boundary normalisation (stripGiacQuotes) missed a shape.  The raw
  // string is quoted via JSON.stringify so control chars are visible.
  try {
    return parseAlgebra(mapped);
  } catch (e) {
    throw new Error(
      `Giac output did not parse (${e.message}): ${JSON.stringify(giacStr)}`,
    );
  }
}

/**
 * Thrown when Giac returned a valid result that our adapter can't
 * (yet) represent as an AST — lists, piecewise, undef, etc.
 * Carries the raw Giac string so callers can present it to the user
 * or handle specific shapes.
 */
export class GiacResultError extends Error {
  constructor(raw, kind = "unsupported") {
    super(`Giac returned ${kind} result: ${raw}`);
    this.name = "GiacResultError";
    this.raw = raw;
    this.kind = kind;
  }
}

/**
 * Known-shape Giac runtime errors delivered as result strings.
 *
 * Giac/Xcas emits a handful of error messages through `caseval`'s return
 * channel rather than throwing — especially when a semicolon sequence
 * aborts at a clause that doesn't have a try/catch around it.  A freshly-
 * built caseval command like `purge(X);factor(...)` will abort on the
 * `purge(X)` clause with `"No such variable X"` as the return value,
 * and we must treat that as an error not a result.
 *
 * The matcher is deliberately prefix-based and uppercase-insensitive;
 * Giac varies its exact phrasing across builds but always leads with the
 * same few tokens.  Callers receive a `GiacResultError` of kind
 * `"runtime-error"` carrying the original string.
 */
export function isGiacErrorString(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t === "") return false;
  // Prefixes observed in Giac 1.9 and earlier builds.
  const prefixes = [
    "No such variable",
    "Error:",
    "Bad argument",
    "Invalid dimension",
    "Unable to",
    "GIAC_ERROR",
    "Syntax error",
  ];
  for (const p of prefixes) {
    if (t.startsWith(p)) return true;
  }
  return false;
}

