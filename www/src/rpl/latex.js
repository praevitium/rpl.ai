/* LaTeX for any value the calculator holds, to paste into a document, a
   notebook or a chat.  Expressions are read from the algebra AST, so a
   quotient is \frac, a power a superscript and a root \sqrt; a matrix is
   bmatrix and an exact rational is \frac too. */

import {
  isReal, isInteger, isRational, isComplex, isString, isName, isSymbolic, isList, isVector,
  isMatrix, isTagged, isUnit, isBinaryInteger,
} from './types.js';
import { numText, PREC } from './algebra.js';
import { formatBinaryInteger } from './formatter.js';

const GREEK = Object.freeze({
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta',
  ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma',
  τ: 'tau', υ: 'upsilon', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
});

const FUNCTIONS = Object.freeze({
  SIN: '\\sin', COS: '\\cos', TAN: '\\tan', ASIN: '\\arcsin', ACOS: '\\arccos', ATAN: '\\arctan',
  SINH: '\\sinh', COSH: '\\cosh', TANH: '\\tanh', LN: '\\ln', LOG: '\\log_{10}',
  ASINH: '\\operatorname{arsinh}', ACOSH: '\\operatorname{arcosh}', ATANH: '\\operatorname{artanh}',
  MIN: '\\min', MAX: '\\max', GCD: '\\gcd', LCM: '\\operatorname{lcm}', MOD: '\\operatorname{mod}',
  IP: '\\operatorname{IP}', FP: '\\operatorname{FP}', SIGN: '\\operatorname{sgn}', ARG: '\\arg',
  HEAVISIDE: '\\operatorname{H}', DIRAC: '\\delta', PERM: '\\operatorname{P}',
  GAMMA: '\\Gamma', LNGAMMA: '\\ln\\Gamma', ZETA: '\\zeta', LAMBERT: '\\operatorname{W}',
  ERF: '\\operatorname{erf}', ERFC: '\\operatorname{erfc}', EI: '\\operatorname{Ei}',
  SI: '\\operatorname{Si}', CI: '\\operatorname{Ci}', BETA: '\\operatorname{B}',
  RE: '\\operatorname{Re}', IM: '\\operatorname{Im}',
});

// Written without parentheses around a lone symbol or number, as in \sin x.
const BARE = new Set([
  'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'SINH', 'COSH', 'TANH', 'ASINH', 'ACOSH', 'ATANH', 'LN', 'LOG',
]);

// f(x)^2 reads as \sin^{2}\left(x\right); a log's base or a power of -1 would be misread.
const POWERABLE = new Set(['SIN', 'COS', 'TAN', 'SINH', 'COSH', 'TANH', 'LN', 'ASIN', 'ACOS', 'ATAN']);

// Closed on both sides, so a power needs no parentheses around them.
const DELIMITED = new Set(['ABS', 'FLOOR', 'CEIL']);

// Run on to the end of the term, so anything that follows must be fenced off.
const OPEN_ENDED = new Set(['INTEG', 'Σ']);

const RELATIONS = Object.freeze({ '=': '=', '==': '=', '≠': '\\ne', '<': '<', '>': '>', '≤': '\\le', '≥': '\\ge' });

const paren = (latex) => `\\left(${latex}\\right)`;

function textLatex(text) {
  return text.replace(/[\\{}_^&%$#~]/g, (c) => ({
    '\\': '\\textbackslash{}', '^': '\\^{}', '~': '\\~{}',
  })[c] ?? `\\${c}`);
}

function numberLatex(text) {
  if (/^-?(Infinity|∞)$/.test(text)) return `${text.startsWith('-') ? '-' : ''}\\infty`;
  const m = /^(-?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([-+]?\d+))?$/.exec(text);
  if (!m) return textLatex(text);
  const [, sign, digits, exponent] = m;
  const mantissa = digits.replace(/\.$/, '');
  if (exponent === undefined) return `${sign}${mantissa}`;
  return mantissa === '1' ? `${sign}10^{${Number(exponent)}}` : `${sign}${mantissa}\\times10^{${Number(exponent)}}`;
}

function nameLatex(name) {
  const text = name.normalize('NFKC');
  if (text === '∞') return '\\infty';
  if (/^pi$/i.test(text)) return '\\pi';
  const sub = text.indexOf('_');
  if (sub > 0) return `${nameLatex(text.slice(0, sub))}_{${textLatex(text.slice(sub + 1))}}`;
  const chars = [...text];
  if (chars.length === 1) return GREEK[text] ? `\\${GREEK[text]}` : text;
  if (/^[A-Za-z][0-9]+$/.test(text)) return `${text[0]}_{${text.slice(1)}}`;
  if (chars.some((c) => GREEK[c])) return chars.map((c) => (GREEK[c] ? `\\${GREEK[c]} ` : c)).join('').trim();
  return `\\mathrm{${textLatex(text)}}`;
}

const isAtom = (ast) => ast.kind === 'var' || (ast.kind === 'num' && !numText(ast).startsWith('-'));

const isNegative = (ast) => ast.kind === 'neg' || (ast.kind === 'num' && numText(ast).startsWith('-'));

const isNumeric = (ast) => ast.kind === 'num' || (ast.kind === 'neg' && isNumeric(ast.arg));

const endsOpen = (ast) => (ast.kind === 'fn' && OPEN_ENDED.has(ast.name))
  || (ast.kind === 'neg' && endsOpen(ast.arg))
  || (ast.kind === 'bin' && '+-*'.includes(ast.op) && endsOpen(ast.r));

// The body of a sum or an integral: a sum inside it needs parentheses to stay in it.
function bodyLatex(ast) {
  const latex = astLatex(ast);
  return ast.kind === 'bin' && PREC[ast.op] <= 1 ? paren(latex) : latex;
}

function baseLatex(ast) {
  const latex = astLatex(ast);
  const closed = (isAtom(ast) && !latex.includes('^')) || (ast.kind === 'fn' && DELIMITED.has(ast.name));
  return closed ? latex : paren(latex);
}

function functionLatex(ast, parent, power) {
  const { name, args } = ast;
  const parts = args.map((x) => astLatex(x));
  const [a, b] = parts;
  if (power === undefined) {
    switch (name) {
      case 'SQRT': return `\\sqrt{${a}}`;
      case 'XROOT': return `\\sqrt[${b.includes(']') ? `{${b}}` : b}]{${a}}`;
      case 'ABS': return `\\left|${a}\\right|`;
      case 'EXP': return `e^{${a}}`;
      case 'ALOG': return `10^{${a}}`;
      case 'CONJ': return `\\overline{${a}}`;
      case 'EXPM': return parent > 1 ? paren(`e^{${a}} - 1`) : `e^{${a}} - 1`;
      case 'LNP1': return `\\ln${paren(`1 + ${a}`)}`;
      case 'FACT': return `${isAtom(args[0]) ? a : paren(a)}!`;
      case 'FLOOR': return `\\left\\lfloor ${a}\\right\\rfloor`;
      case 'CEIL': return `\\left\\lceil ${a}\\right\\rceil`;
      case 'COMB': return `\\binom{${a}}{${b}}`;
      case 'PSI': return args.length === 2 ? `\\psi^{(${b})}${paren(a)}` : `\\psi${paren(a)}`;
      case 'DERIV': return `\\frac{d}{d${b}}${paren(a)}`;
      case 'INTEG': return args.length === 4
        ? `\\int_{${parts[2]}}^{${parts[3]}} ${bodyLatex(args[0])}\\,d${b}`
        : `\\int ${bodyLatex(args[0])}\\,d${b}`;
      case 'Σ': return `\\sum_{${a}=${b}}^{${parts[2]}} ${bodyLatex(args[3])}`;
      default:
    }
  }
  const command = FUNCTIONS[name] ?? (name.length === 1 ? name : `\\operatorname{${textLatex(name)}}`);
  const applied = power === undefined ? command : `${command}^{${power}}`;
  const bare = BARE.has(name) && parent < 2 && args.length === 1 && isAtom(args[0]);
  return bare ? `${applied}\\,${a}` : `${applied}${paren(parts.join(', '))}`;
}

// A right operand binds half a step tighter, so an equal operator keeps its parentheses.
function binaryLatex(ast, parent) {
  const { op, l, r } = ast;
  if (op === '/') return `\\frac{${astLatex(l)}}{${astLatex(r)}}`;
  if (op === '^') {
    const exponent = astLatex(r);
    if (l.kind === 'fn' && POWERABLE.has(l.name) && r.kind === 'num' && Number.isInteger(r.value) && r.value > 0) {
      return functionLatex(l, parent, exponent);
    }
    return `${baseLatex(l)}^{${exponent}}`;
  }
  const p = PREC[op];
  const left = p > 0 && endsOpen(l) ? paren(astLatex(l)) : astLatex(l, op === '*' && isNegative(l) ? 1 : p);
  const right = astLatex(r, p + 0.5);
  let latex;
  if (RELATIONS[op]) latex = `${left} ${RELATIONS[op]} ${right}`;
  else if (op === '*') latex = `${left}${/^(\d|\.|-|\\frac)/.test(right) ? ' \\cdot ' : isNumeric(l) ? '' : '\\,'}${right}`;
  else latex = `${left} ${op} ${right}`;
  return p < parent ? paren(latex) : latex;
}

export function astLatex(ast, parent = 0) {
  switch (ast?.kind) {
    case 'num': {
      const latex = numberLatex(numText(ast));
      return parent > 1 && latex.startsWith('-') ? paren(latex) : latex;
    }
    case 'var': return nameLatex(ast.name);
    case 'neg': {
      const latex = `-${astLatex(ast.arg, 3)}`;
      return parent > 1 ? paren(latex) : latex;
    }
    case 'fn': return functionLatex(ast, parent);
    case 'bin': return binaryLatex(ast, parent);
    default: return '?';
  }
}

function symbolLatex(symbol) {
  let latex = '';
  let letters = '';
  const flush = () => { if (letters) latex += `\\mathrm{${textLatex(letters)}}`; letters = ''; };
  for (const c of symbol.normalize('NFKC')) {
    if (GREEK[c]) { flush(); latex += `\\${GREEK[c]} `; }
    else if (c === '°') { flush(); latex += '{}^{\\circ}'; }
    else letters += c;
  }
  flush();
  return latex.trim();
}

const unitLatex = (uexpr) => uexpr.map(([symbol, exponent]) => `${symbolLatex(symbol)}${exponent === 1 ? '' : `^{${exponent}}`}`).join('\\,');

function complexLatex(re, im) {
  const part = (x) => numberLatex(String(x));
  if (im === 0) return part(re);
  const imaginary = Math.abs(im) === 1 ? 'i' : `${part(Math.abs(im))}i`;
  if (re === 0) return im < 0 ? `-${imaginary}` : imaginary;
  return `${part(re)} ${im < 0 ? '-' : '+'} ${imaginary}`;
}

const matrixLatex = (rows) => `\\begin{bmatrix} ${rows.map((row) => row.map((v) => toLatex(v) ?? '?').join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;

// LaTeX source for a value, or null for one that has none (a program, a directory, a graphics object).
export function toLatex(v) {
  if (isInteger(v)) return v.value.toString();
  if (isReal(v)) return numberLatex(v.value.toString());
  if (isRational(v)) return `${v.n < 0n ? '-' : ''}\\frac{${(v.n < 0n ? -v.n : v.n).toString()}}{${v.d.toString()}}`;
  if (isComplex(v)) return complexLatex(v.re, v.im);
  if (isBinaryInteger(v)) return `\\mathtt{${formatBinaryInteger(v).replace('#', '\\#')}}`;
  if (isString(v)) return `\\text{${textLatex(v.value)}}`;
  if (isName(v)) return nameLatex(v.id);
  if (isSymbolic(v)) return typeof v.expr === 'object' ? astLatex(v.expr) : `\\text{${textLatex(String(v.expr))}}`;
  if (isList(v)) return `\\left\\{${v.items.map((x) => toLatex(x) ?? '?').join(',\\ ')}\\right\\}`;
  if (isVector(v)) return matrixLatex([v.items]);
  if (isMatrix(v)) return matrixLatex(v.rows);
  if (isTagged(v)) return `\\mathrm{${textLatex(v.tag)}}\\colon ${toLatex(v.value) ?? '?'}`;
  if (isUnit(v)) return `${numberLatex(String(v.value))}\\,${unitLatex(v.uexpr)}`;
  return null;
}
