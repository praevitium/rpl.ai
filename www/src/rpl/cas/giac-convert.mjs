// SPDX-License-Identifier: GPL-3.0-or-later
//
// Conversion between the algebra AST and the syntax Giac's caseval reads
// and writes: the same infix surface, but with Giac's function names.

import { parseAlgebra, Var, Neg, numText } from "../algebra.js";
import { isValidHpIdentifier } from "../types.js";
import { RPLError } from "../stack.js";

// A name that is not a valid HP identifier could carry a character Giac
// reads specially (`#` starts a comment) into the command.
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

const HP_TO_GIAC = Object.freeze({
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
  BETA: "Beta",
  ERF: "erf", ERFC: "erfc",
  ARG: "arg", CONJ: "conj",
  DERIV: "diff",
  "Σ": "sum",
  IFTE: "ifte",
  CEIL: "ceil",
  EXPM: "expm1",
  HEAVISIDE: "Heaviside", DIRAC: "Dirac",
  SI: "Si", CI: "Ci", EI: "Ei",
  PSI: "Psi", ZETA: "Zeta", LAMBERT: "LambertW",
});

const GIAC_TO_HP = Object.freeze(
  Object.fromEntries([
    ...Object.entries(HP_TO_GIAC).map(([hp, g]) => [g, hp]),
    ["log", "LN"],
    ["integrate", "INTEG"],
    ["surd", "XROOT"],
  ]),
);

export function astToGiac(ast) {
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
    case "num": {
      // Wrapped like a Neg, so a negative base is not read as -(3^X).
      const s = numText(ast);
      return parentPrec >= 2 && s.startsWith("-") ? `(${s})` : s;
    }
    case "var":
      return infGiacFromName(ast.name) || ast.name;
    case "unit":
      throw new RPLError("Units can't go to the algebra engine");
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
        // Giac reads ≠ as a structural test that answers true or false.
        if (ast.op === "≠") throw new RPLError("Bad argument value");
        const op = { "≤": "<=", "≥": ">=" }[ast.op] ?? ast.op;
        return `${emit(ast.l, 0)}${op}${emit(ast.r, 0)}`;
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

function emitFn(ast) {
  const hpName = ast.name.toUpperCase();
  const args = ast.args.map((a) => emit(a, 0));

  if (hpName === "ALOG") {
    return `(10^(${args[0]}))`;
  }
  if (hpName === "LNGAMMA") {
    return `ln(Gamma(${args[0]}))`;
  }
  if (hpName === "XROOT") {
    // surd is the real root, so an odd root of a negative number stays real.
    return `surd(${args[0]},${args[1]})`;
  }
  if (hpName === "MOD") {
    // HP MOD is floored; irem truncates and folds a symbolic MOD(X,3) to X.
    return `((${args[0]})-(${args[1]})*floor((${args[0]})/(${args[1]})))`;
  }
  if (hpName === "INTEG") {
    return `integrate(${args.join(",")})`;
  }

  const giacName = HP_TO_GIAC[hpName] ?? ast.name;
  return `${giacName}(${args.join(",")})`;
}

// `extraVars` are standalone variable arguments (DERIV's, SOLVE's, ...),
// checked like the names inside the expression.
export function buildGiacCmd(exprAst, buildCmd, extraVars = []) {
  for (const v of extraVars) assertValidCasName(v);
  const giacExpr = astToGiac(exprAst);
  return buildCmd(giacExpr);
}

// Some builds print lists with a type tag, as list[1,2] instead of [1,2].
function stripListTag(s) {
  const m = s.match(/^(list|seq|set|poly1)\[/);
  return m ? s.slice(m[1].length) : s;
}

const isGiacList = (s) => s.startsWith("[") && s.endsWith("]");

export function splitGiacList(giacStr) {
  const s = stripListTag(String(giacStr).trim());
  if (!isGiacList(s)) return null;
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

// Giac quotes some results, twice when a semicolon sequence returns a
// string-typed value, escaping \" \\ \n \t inside.
export function stripGiacQuotes(s) {
  if (typeof s !== "string") return s;
  let prev;
  let cur = s;
  do {
    prev = cur;
    if (
      cur.length >= 2 &&
      cur.charCodeAt(0) === 0x22 &&
      cur.charCodeAt(cur.length - 1) === 0x22
    ) {
      cur = cur.slice(1, -1).replace(/\\(["\\nt])/g, (_m, c) => {
        if (c === "n") return "\n";
        if (c === "t") return "\t";
        return c;
      });
    }
  } while (cur !== prev);
  return cur;
}

// Giac follows an exact constant result with its approximation, as in
// sqrt(2)=1.41421356237 or i*pi=3.14159265359*i.  A genuine equation such as
// 3=3 or pi=3 has no decimal point on the right, so it is left alone.
const GIAC_APPROX_NUM = String.raw`\d+(?:\.\d*)?(?:e[+-]?\d+)?`;
const GIAC_APPROX_SUFFIX = new RegExp(
  `^([^=]+)=(-?(?:${GIAC_APPROX_NUM}(?:[-+](?:${GIAC_APPROX_NUM}\\*)?i)?|(?:${GIAC_APPROX_NUM}\\*)?i|infinity))$`,
);
const GIAC_CONSTANT_WORDS = /\b(?:pi|e|i|euler_gamma|infinity)\b|\b[A-Za-z_][A-Za-z0-9_]*(?=\()/g;

export function stripGiacApproxSuffix(s) {
  if (typeof s !== "string") return s;
  const m = GIAC_APPROX_SUFFIX.exec(s);
  if (!m || !/\.|infinity/.test(m[2]) || /^-?[\d.]+$/.test(m[1].trim())) return s;
  if (/[a-zA-Z]/.test(m[1].replace(GIAC_CONSTANT_WORDS, ""))) return s;
  return m[1];
}

export function giacToAst(giacStr) {
  const s = String(giacStr).trim();
  if (s === "" || s === "undef") {
    throw new GiacResultError(s || "empty");
  }
  if (isGiacList(stripListTag(s))) {
    throw new GiacResultError(s, "list");
  }
  if (s.includes("piecewise(")) {
    throw new GiacResultError(s, "piecewise");
  }
  const infAst = infAstFromGiac(s);
  if (infAst) return infAst;
  if (isGiacErrorString(s)) {
    throw new GiacResultError(s, "runtime-error");
  }

  // Only names in call position are renamed; bare identifiers may be variables.
  const mapped = s
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (match, name) => {
      const hp = GIAC_TO_HP[name];
      return hp ? `${hp}(` : match;
    })
    .replace(/([A-Za-z0-9_.]+|\([^()]*\))!(?!=)/g, "FACT($1)");

  try {
    return parseAlgebra(mapped);
  } catch {
    throw new RPLError(`Unsupported result: ${giacStr}`);
  }
}

const GIAC_RESULT_MESSAGES = {
  unsupported: () => "Undefined result",
  "runtime-error": (raw) => raw.replace(/^(GIAC_ERROR|Error):\s*/, "").replace(/\.$/, ""),
};

export class GiacResultError extends RPLError {
  constructor(raw, kind = "unsupported") {
    super(GIAC_RESULT_MESSAGES[kind]?.(raw) ?? `Unsupported result: ${raw}`);
    this.name = "GiacResultError";
    this.raw = raw;
    this.kind = kind;
  }
}

const GIAC_ERROR_PREFIXES = [
  "No such variable",
  "Error:",
  "Bad argument",
  "Invalid dimension",
  "Unable to",
  "GIAC_ERROR",
  "Syntax error",
];

// Some Giac errors arrive as the result text rather than as an exception.
export function isGiacErrorString(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return GIAC_ERROR_PREFIXES.some((p) => t.startsWith(p));
}
