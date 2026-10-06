/* LaTeX for any value the calculator holds, to paste into a document, a
   notebook or a chat.  Expressions are read from the algebra AST, so a
   quotient is \frac, a power a superscript and a root \sqrt; a matrix is
   bmatrix and an exact rational is \frac too.  latexToAst reads a formula
   back the other way. */

import {
  isReal, isInteger, isRational, isComplex, isString, isName, isSymbolic, isList, isVector,
  isMatrix, isTagged, isUnit, isBinaryInteger,
} from './types.js';
import { Num, Var, Neg, Bin, Fn, numText, PREC, KNOWN_FUNCTIONS, isKnownFunction, parseAlgebra, formatAlgebra } from './algebra.js';
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
  if (/^[A-Za-zΑ-Ωα-ω][0-9]+$/.test(text)) return `${nameLatex(text[0])}_{${text.slice(1)}}`;
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
      case 'Σ': return `\\sum_{${b}=${parts[2]}}^{${parts[3]}} ${bodyLatex(args[0])}`;
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
    case 'unit': {
      const latex = `${numberLatex(String(ast.value))}\\,${unitLatex(ast.uexpr)}`;
      return parent > 2 ? paren(latex) : latex;
    }
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


/* ---- Reading LaTeX back ----
   As in TeX, adjacent factors multiply, an unbraced script is one token, and a
   function without parentheses takes the run of factors after it (\sin 2x is
   sin(2x)). */

const GREEK_COMMANDS = Object.freeze({
  ...Object.fromEntries(Object.entries(GREEK).map(([letter, name]) => [name, letter])),
  varepsilon: 'ε', vartheta: 'θ', varphi: 'φ', varrho: 'ρ', varsigma: 'σ',
});

const functionNames = (pattern, skip = []) => Object.fromEntries(Object.entries(FUNCTIONS)
  .map(([name, command]) => [pattern.exec(command)?.[1], name])
  .filter(([word, name]) => word && !skip.includes(name)));

// \sin or \zeta, and \operatorname{sgn}, by the name the algebra knows them as.
const FUNCTION_COMMANDS = Object.freeze({ exp: 'EXP', log: 'LOG', psi: 'PSI', ...functionNames(/^\\([A-Za-z]+)$/, ['DIRAC']) });
const FUNCTION_WORDS = Object.freeze(functionNames(/^\\operatorname\{(\w+)\}$/));
const RECIPROCALS = Object.freeze({ cot: 'TAN', sec: 'COS', csc: 'SIN' });
const RELATION_COMMANDS = Object.freeze({ le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠', neq: '≠' });
const WORD_COMMANDS = new Set(['mathrm', 'operatorname', 'text', 'textrm', 'mathit', 'mathbf', 'mathsf', 'mathtt', 'boldsymbol', 'bm']);
const UNICODE_SYMBOLS = Object.freeze({ '×': '*', '·': '*', '⋅': '*', '÷': '/', '−': '-' });
const FACTOR_COMMANDS = new Set([
  'infty', 'frac', 'dfrac', 'tfrac', 'sqrt', 'binom', 'dbinom', 'tbinom', 'overline', 'bar', 'lfloor', 'lceil', 'sum', 'int',
  ...Object.keys(GREEK_COMMANDS), ...Object.keys(FUNCTION_COMMANDS), ...Object.keys(RECIPROCALS),
]);
const SKIPPED = /^(?:\s+|~|\\(?:[,;:! ]|(?:quad|qquad|displaystyle|textstyle|limits|nolimits|left|right|[bB]ig+[lr]?)\b))/;
const NUMBER = /^(?:\d+(?:(?:\\,|\{,\})\d{3})*\.?\d*|\.\d+)/;
const MATH_WRAPPERS = [/^\$\$([\s\S]*)\$\$$/, /^\$([\s\S]*)\$$/, /^\\\(([\s\S]*)\\\)$/, /^\\\[([\s\S]*)\\\]$/];

const has = (table, key) => Object.hasOwn(table, key);
const isFunctionWord = (word) => has(FUNCTION_WORDS, word) || (word.length > 1 && isKnownFunction(word));
const functionOfWord = (word) => FUNCTION_WORDS[word] ?? word.toUpperCase();
const isVariable = (ast, name) => ast.kind === 'var' && ast.name === name;
const hasValue = (ast, value) => ast.kind === 'num' && ast.value === value;

function lexLatex(src) {
  const tokens = [];
  let i = 0;
  const take = (pattern) => {
    const m = pattern.exec(src.slice(i));
    if (m) i += m[0].length;
    return m;
  };
  while (i < src.length) {
    let m;
    if (take(SKIPPED)) continue;
    if ((m = take(NUMBER))) tokens.push({ t: 'num', v: m[0].replace(/\\,|\{,\}/g, '') });
    else if ((m = take(/^\\([A-Za-z]+)\*?/))) {
      const name = m[1];
      if (WORD_COMMANDS.has(name)) {
        const word = take(/^\s*\{([A-Za-z](?:[A-Za-z0-9]|\\_)*)\}/)?.[1];
        if (word === undefined) throw new Error(`\\${name} needs a name in braces, like \\mathrm{rate}`);
        tokens.push({ t: 'word', v: word.replace(/\\_/g, '_') });
      } else if (has(RELATION_COMMANDS, name)) tokens.push({ t: 'rel', v: RELATION_COMMANDS[name] });
      else if (['lvert', 'rvert', 'vert'].includes(name)) tokens.push({ t: 'sym', v: '|' });
      else tokens.push({ t: 'cmd', v: name });
    } else {
      const c = src[i++];
      if (/[A-Za-zΑ-Ωα-ω]/.test(c)) tokens.push({ t: 'id', v: c });
      else if (has(UNICODE_SYMBOLS, c) || '+-*/^_()[]{}|!,'.includes(c)) tokens.push({ t: 'sym', v: UNICODE_SYMBOLS[c] ?? c });
      else if ('=<>≤≥≠'.includes(c)) tokens.push({ t: 'rel', v: c });
      else if (c === '√' || c === '∞') tokens.push({ t: 'cmd', v: c === '√' ? 'sqrt' : 'infty' });
      else throw new Error(`Can't read ${c === '\\' ? c + (src[i] ?? '') : `'${c}'`} in LaTeX`);
    }
  }
  return tokens;
}

function unwrapMath(text) {
  const body = text.trim();
  for (const wrapper of MATH_WRAPPERS) {
    const m = wrapper.exec(body);
    if (m) return m[1];
  }
  return body;
}

// How many times d differentiates: d is once and d^2 twice.
function orderOf(ast, name) {
  if (isVariable(ast, name)) return 1;
  const power = ast.kind === 'bin' && ast.op === '^' && isVariable(ast.l, name) && ast.r.kind === 'num' ? ast.r.value : 0;
  return Number.isInteger(power) && power >= 1 && power <= 9 ? power : 0;
}

function numberAst(text) {
  const whole = /^\d+$/.test(text);
  return Num(whole ? BigInt(text) : parseFloat(text), !whole);
}

// The algebra AST for LaTeX math, with the $ or \( \) around it optional.
export function latexToAst(source) {
  let tokens = lexLatex(unwrapMath(source));
  let i = 0;
  let inBars = false;

  const peek = () => tokens[i];
  const at = (t, v) => tokens[i]?.t === t && (v === undefined || tokens[i].v === v);
  const show = (tok) => (!tok ? 'the end of the formula' : tok.t === 'cmd' ? `\\${tok.v}` : tok.v);
  const fail = (message) => { throw new Error(message); };
  const accept = (t, v) => {
    if (!at(t, v)) return false;
    i++;
    return true;
  };
  const expect = (t, v) => { if (!accept(t, v)) fail(`Expected ${v} but found ${show(peek())}`); };
  const opensParen = () => at('sym', '(');

  function within(parse, bars = false) {
    const saved = inBars;
    inBars = bars;
    const value = parse();
    inBars = saved;
    return value;
  }

  function inside(slice, parse) {
    const outer = [tokens, i];
    [tokens, i] = [slice, 0];
    const value = parse();
    if (i < tokens.length) fail(`Can't read ${show(peek())}`);
    [tokens, i] = outer;
    return value;
  }

  function parseRelation() {
    const left = parseSum();
    if (!at('rel')) return left;
    const op = tokens[i++].v;
    const right = parseSum();
    if (at('rel')) fail('Only one comparison fits in an expression');
    return Bin(op, left, right);
  }

  function parseSum() {
    let left = parseProduct();
    while (at('sym', '+') || at('sym', '-')) {
      const op = tokens[i++].v;
      left = Bin(op, left, parseProduct());
    }
    return left;
  }

  function parseProduct() {
    let left = parseUnary();
    for (;;) {
      if (accept('sym', '*') || accept('cmd', 'cdot') || accept('cmd', 'times') || accept('cmd', 'ast')) left = Bin('*', left, parseUnary());
      else if (accept('sym', '/') || accept('cmd', 'div')) left = Bin('/', left, parseUnary());
      else if (startsFactor()) left = Bin('*', left, parsePower());
      else return left;
    }
  }

  function parseUnary() {
    if (accept('sym', '-')) return Neg(parseUnary());
    accept('sym', '+');
    return parsePower();
  }

  function parsePower() {
    let base = parsePrimary();
    while (accept('sym', '!')) base = Fn('FACT', [base]);
    if (!accept('sym', '^')) return base;
    const exponent = operand();
    return isVariable(base, 'e') ? Fn('EXP', [exponent]) : Bin('^', base, exponent);
  }

  function parsePrimary() {
    const tok = peek();
    if (!tok) fail('The formula ends too soon');
    i++;
    switch (tok.t) {
      case 'num': return numberAst(tok.v);
      case 'id': return variable(tok.v);
      case 'word': return isFunctionWord(tok.v) && (tok.v.length > 1 || opensParen()) ? call(functionOfWord(tok.v)) : variable(tok.v);
      case 'cmd': return command(tok.v);
      case 'sym': return bracketed(tok.v);
      default: return fail(`Can't read ${show(tok)}`);
    }
  }

  function startsFactor() {
    const tok = peek();
    if (!tok) return false;
    if (tok.t === 'sym') return '([{'.includes(tok.v) || (tok.v === '|' && !inBars);
    if (tok.t === 'cmd') return FACTOR_COMMANDS.has(tok.v);
    return tok.t === 'num' || tok.t === 'id' || tok.t === 'word';
  }

  const startsFunction = (tok) => (tok?.t === 'cmd'
    ? (has(FUNCTION_COMMANDS, tok.v) && !has(GREEK_COMMANDS, tok.v)) || has(RECIPROCALS, tok.v)
    : tok?.t === 'word' && isFunctionWord(tok.v) && tok.v.length > 1);

  // A function's argument without parentheses: the factors that follow, up to the next function.
  function parseRun() {
    let run = parsePower();
    while (startsFactor() && !startsFunction(peek())) run = Bin('*', run, parsePower());
    return run;
  }

  // The operand of ^, _, \frac and \sqrt: a braced group or the one token TeX takes, so x^23 is x^2 times 3.
  function operand() {
    if (accept('sym', '{')) {
      const group = within(parseSum);
      expect('sym', '}');
      return group;
    }
    const tok = peek();
    if (tok?.t === 'num' && tok.v.length > 1) tokens = [...tokens.slice(0, i), { t: 'num', v: tok.v[0] }, { t: 'num', v: tok.v.slice(1) }, ...tokens.slice(i + 1)];
    return parsePrimary();
  }

  function subscript() {
    const text = (ast) => (ast.kind === 'var' ? ast.name : ast.kind === 'num' ? numText(ast)
      : ast.kind === 'bin' && ast.op === '*' ? text(ast.l) + text(ast.r) : fail('A subscript can only hold letters and digits'));
    return text(operand());
  }

  const variable = (name) => Var(accept('sym', '_') ? name + subscript() : name);

  function bracketed(sym) {
    const closer = { '(': ')', '[': ']', '{': '}' }[sym];
    if (closer) {
      const group = within(parseSum);
      expect('sym', closer);
      return group;
    }
    if (sym !== '|') fail(`Can't read ${sym}`);
    const bars = within(parseSum, true);
    expect('sym', '|');
    return Fn('ABS', [bars]);
  }

  function parenArgs() {
    expect('sym', '(');
    const args = within(() => {
      const list = [parseSum()];
      while (accept('sym', ',')) list.push(parseSum());
      return list;
    });
    expect('sym', ')');
    return args;
  }

  // sin^{-1} is the inverse function, as on a calculator; log_b x is ln x over ln b.
  function call(name, { reciprocal = false } = {}) {
    const base = name === 'LOG' && accept('sym', '_') ? operand() : null;
    const power = accept('sym', '^') ? operand() : null;
    const args = opensParen() ? parenArgs() : [parseRun()];
    const arity = KNOWN_FUNCTIONS[name]?.arity;
    if (arity !== undefined && args.length !== arity) fail(`${name} takes ${arity} argument${arity === 1 ? '' : 's'}`);
    const inverse = !reciprocal && ['SIN', 'COS', 'TAN'].includes(name) && power?.kind === 'neg' && hasValue(power.arg, 1);
    const result = base && !hasValue(base, 10) ? Bin('/', Fn('LN', args), Fn('LN', [base])) : Fn(inverse ? `A${name}` : name, args);
    return power && !inverse ? Bin('^', result, power) : result;
  }

  function command(name) {
    if (has(GREEK_COMMANDS, name) && !(has(FUNCTION_COMMANDS, name) && opensParen())) return variable(GREEK_COMMANDS[name]);
    if (has(FUNCTION_COMMANDS, name)) return call(FUNCTION_COMMANDS[name]);
    if (has(RECIPROCALS, name)) return Bin('/', Num(1n), call(RECIPROCALS[name], { reciprocal: true }));
    switch (name) {
      case 'infty': return Var('∞');
      case 'frac': case 'dfrac': case 'tfrac': return fraction();
      case 'sqrt': return root();
      case 'binom': case 'dbinom': case 'tbinom': return Fn('COMB', [operand(), operand()]);
      case 'overline': case 'bar': return Fn('CONJ', [operand()]);
      case 'lfloor': case 'lceil': {
        const inner = within(parseSum);
        expect('cmd', name === 'lfloor' ? 'rfloor' : 'rceil');
        return Fn(name === 'lfloor' ? 'FLOOR' : 'CEIL', [inner]);
      }
      case 'sum': return sum();
      case 'int': return integral();
      default: return fail(`Can't read \\${name}`);
    }
  }

  function root() {
    if (!accept('sym', '[')) return Fn('SQRT', [operand()]);
    const index = within(parseSum);
    expect('sym', ']');
    return Fn('XROOT', [operand(), index]);
  }

  function fraction() {
    const top = operand();
    const bottom = operand();
    return derivative(top, bottom) ?? Bin('/', top, bottom);
  }

  // \frac{d}{dx} applies to the factor after it, and \frac{d^2}{dx^2} twice.
  function derivative(top, bottom) {
    const order = orderOf(top, 'd');
    if (!order || bottom.kind !== 'bin' || bottom.op !== '*' || !isVariable(bottom.l, 'd')) return null;
    const x = bottom.r.kind === 'bin' && bottom.r.op === '^' ? bottom.r.l : bottom.r;
    if (x.kind !== 'var' || orderOf(bottom.r, x.name) !== order || !startsFactor()) return null;
    let target = parsePower();
    for (let n = 0; n < order; n++) target = Fn('DERIV', [target, x]);
    return target;
  }

  function limits(read) {
    const found = {};
    for (let n = 0; n < 2; n++) {
      if (accept('sym', '_')) found.lower = read();
      else if (accept('sym', '^')) found.upper = operand();
    }
    return found;
  }

  function sum() {
    const { lower, upper } = limits(() => {
      expect('sym', '{');
      const index = parsePrimary();
      if (index.kind !== 'var' || !accept('rel', '=')) fail('The lower limit of a sum reads like i=1');
      const from = parseSum();
      expect('sym', '}');
      return { index, from };
    });
    if (!lower || !upper) fail('A sum needs both limits, like \\sum_{i=1}^{n}');
    const body = parseProduct();
    return Fn('Σ', [body, lower.index, lower.from, upper]);
  }

  function isDifferential(k) {
    const [d, x] = [tokens[k], tokens[k + 1]];
    return (d?.t === 'id' || d?.t === 'word') && d.v === 'd' && (x?.t === 'id' || (x?.t === 'cmd' && has(GREEK_COMMANDS, x.v)));
  }

  // The first d standing alone outside any brackets, followed by the variable it differentiates.
  function differentialIndex() {
    let depth = 0;
    for (let k = i; k < tokens.length; k++) {
      const tok = tokens[k];
      if (tok.t === 'sym' && '([{'.includes(tok.v)) depth++;
      else if (tok.t === 'sym' && ')]}'.includes(tok.v)) depth--;
      else if (depth === 0 && isDifferential(k)) return k;
    }
    return -1;
  }

  function integral() {
    const { lower, upper } = limits(operand);
    const end = differentialIndex();
    if (end < 0) fail('An integral needs its differential, like \\int f(x)\\,dx');
    if ((lower === undefined) !== (upper === undefined)) fail('An integral needs both limits or none');
    const body = inside(tokens.slice(i, end), parseSum);
    i = end + 1;
    const x = parsePrimary();
    return Fn('INTEG', lower === undefined ? [body, x] : [body, x, lower, upper]);
  }

  if (!tokens.length) fail('There is no formula to read');
  const ast = parseRelation();
  if (i < tokens.length) fail(`Can't read ${show(peek())}`);
  return ast;
}

// Whether text is LaTeX rather than the algebra the calculator writes: it has a command or a braced script.
export const looksLikeLatex = (text) => /\\[A-Za-z]|[\^_]\s*\{|^\s*\$|\\[(\[]/.test(text);

// The AST of text written as LaTeX or as algebra.
export const parseMath = (text) => (looksLikeLatex(text) ? latexToAst(text) : parseAlgebra(text));

// Pasted LaTeX that reads as a formula, as the quoted algebraic the command line takes, or null.
export function latexToSource(text) {
  if (!looksLikeLatex(text)) return null;
  try {
    const ast = latexToAst(text);
    return ast.kind === 'var' || ast.kind === 'num' ? null : `\`${formatAlgebra(ast)}\``;
  } catch {
    return null;
  }
}
