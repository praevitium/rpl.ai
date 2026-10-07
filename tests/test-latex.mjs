import { astLatex, latexToAst, latexToSource, looksLikeLatex, parseMath, toLatex } from '../www/src/rpl/latex.js';
import { astEqual, evalAst, formatAlgebra, parseAlgebra } from '../www/src/rpl/algebra.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { BinaryInteger, Directory, Integer, Real, Str, Unit } from '../www/src/rpl/types.js';
import { getBinaryBase, setBinaryBase } from '../www/src/rpl/state.js';
import { assert, assertThrows } from './helpers.mjs';

const raw = String.raw;
const algebra = (text) => astLatex(parseAlgebra(text));
const value = (text) => toLatex(parseEntry(text)[0]);

{
  const cases = [
    ['(A+B)/(C-D)', raw`\frac{A + B}{C - D}`, 'a quotient is \\frac'],
    ['A/B/C', raw`\frac{\frac{A}{B}}{C}`, 'nested quotients nest their fractions'],
    ['X^2+1', raw`X^{2} + 1`, 'a power is a superscript'],
    ['X^(1/2)', raw`X^{\frac{1}{2}}`, 'a fractional exponent'],
    ['2^3^4', raw`2^{3^{4}}`, 'powers stack to the right'],
    ['(2^3)^4', raw`\left(2^{3}\right)^{4}`, 'a power of a power keeps its parentheses'],
    ['-X^2', raw`-X^{2}`, 'a minus applies after the power'],
    ['(-X)^2', raw`\left(-X\right)^{2}`, 'a negative base keeps its parentheses'],
    ['X^-1', raw`X^{-1}`, 'a negative exponent'],
    ['(A/B)^2', raw`\left(\frac{A}{B}\right)^{2}`, 'a fraction raised to a power is parenthesized'],
    ['SQRT(X)^2', raw`\left(\sqrt{X}\right)^{2}`, 'a root raised to a power is parenthesized'],
    ['ABS(X)^2', raw`\left|X\right|^{2}`, 'bars need no parentheses inside a power'],
    ['FACT(N)^2', raw`\left(N!\right)^{2}`, 'a factorial raised to a power is parenthesized'],
    ['SQRT(X^2+Y^2)', raw`\sqrt{X^{2} + Y^{2}}`, 'SQRT is \\sqrt'],
    ['XROOT(3,X)', raw`\sqrt[X]{3}`, 'XROOT puts its index in the bracket'],
    ['ABS(X-1)', raw`\left|X - 1\right|`, 'ABS is bars'],
    ['FACT(5)', '5!', 'FACT of a number'],
    ['FACT(N+1)', raw`\left(N + 1\right)!`, 'FACT of a sum is parenthesized'],
    ['COMB(N,K)', raw`\binom{N}{K}`, 'COMB is a binomial'],
    ['FLOOR(X)', raw`\left\lfloor X\right\rfloor`, 'FLOOR'],
    ['CEIL(X/2)', raw`\left\lceil \frac{X}{2}\right\rceil`, 'CEIL'],
    ['EXP(-X^2/2)', raw`e^{\frac{-X^{2}}{2}}`, 'EXP is a power of e'],
    ['EXP(X)^2', raw`\left(e^{X}\right)^{2}`, 'a power of EXP is parenthesized'],
    ['ALOG(X)', raw`10^{X}`, 'ALOG is a power of 10'],
    ['LN(X)', raw`\ln\,X`, 'LN of a symbol'],
    ['LOG(X)', raw`\log_{10}\,X`, 'LOG is base 10'],
    ['ASIN(X)', raw`\arcsin\,X`, 'ASIN is \\arcsin'],
    ['ASINH(X)', raw`\operatorname{arsinh}\,X`, 'ASINH is arsinh'],
    ['COS(X+1)', raw`\cos\left(X + 1\right)`, 'a sum argument is parenthesized'],
    ['ATAN(Y/X)', raw`\arctan\left(\frac{Y}{X}\right)`, 'a quotient argument is parenthesized'],
    ['SIN(X)^2', raw`\sin^{2}\,X`, 'a power of SIN is written on the function'],
    ['SIN(X)^2+COS(X)^2', raw`\sin^{2}\,X + \cos^{2}\,X`, 'terms of a sum read without parentheses'],
    ['TAN(X)^3', raw`\tan^{3}\,X`, 'a power of TAN'],
    ['ATAN(X)^-1', raw`\left(\arctan\,X\right)^{-1}`, 'a power of -1 is not an inverse function'],
    ['LOG(X)^2', raw`\left(\log_{10}\,X\right)^{2}`, 'a power of LOG is parenthesized'],
    ['SIN(X)*Y', raw`\sin\left(X\right)\,Y`, 'a function in a product keeps its parentheses'],
    ['SIN(X)^2*Y', raw`\sin^{2}\left(X\right)\,Y`, 'a power of a function in a product keeps its parentheses'],
    ['GAMMA(X)', raw`\Gamma\left(X\right)`, 'GAMMA'],
    ['PSI(X,2)', raw`\psi^{(2)}\left(X\right)`, 'PSI with an order'],
    ['ERF(X)', raw`\operatorname{erf}\left(X\right)`, 'ERF'],
    ['RE(Z)', raw`\operatorname{Re}\left(Z\right)`, 'RE'],
    ['CONJ(Z)', raw`\overline{Z}`, 'CONJ is an overline'],
    ['MAX(A,B)', raw`\max\left(A, B\right)`, 'MAX'],
    ['EXPM(X)', raw`e^{X} - 1`, 'EXPM'],
    ['A-EXPM(X)', raw`A - \left(e^{X} - 1\right)`, 'EXPM after a minus keeps its parentheses'],
    ['LNP1(X)', raw`\ln\left(1 + X\right)`, 'LNP1'],
    ['2*X', '2X', 'a number times a symbol is written together'],
    ['X*2', raw`X \cdot 2`, 'a number after a symbol needs a dot'],
    ['2*3', raw`2 \cdot 3`, 'two numbers need a dot'],
    ['A*B', raw`A\,B`, 'two symbols are spaced'],
    ['A*(B+C)', raw`A\,\left(B + C\right)`, 'a sum factor is parenthesized'],
    ['-2*X', '-2X', 'a leading minus needs no parentheses'],
    ['X*-2', raw`X\,\left(-2\right)`, 'a negative factor is parenthesized'],
    ['A-(B-C)', raw`A - \left(B - C\right)`, 'a difference after a minus keeps its parentheses'],
    ['A-B-C', 'A - B - C', 'a chain of differences needs none'],
    ['X+(-2)', raw`X + \left(-2\right)`, 'a negative term is parenthesized'],
    ['X>=2', raw`X \ge 2`, 'a relation'],
    ['X=Y', 'X = Y', 'an equation'],
    ['PI*R^2', raw`\pi\,R^{2}`, 'pi is \\pi'],
    ['α+β', raw`\alpha + \beta`, 'Greek letters are commands'],
    ['X1+X2', raw`X_{1} + X_{2}`, 'a trailing number is a subscript'],
    ['AB*C', raw`\mathrm{AB}\,C`, 'a long name is upright'],
    ['1.5E-3*X', '0.0015X', 'a small number is written out'],
    ['DERIV(X^2,X)', raw`\frac{d}{dX}\left(X^{2}\right)`, 'DERIV is d/dX'],
    ['INTEG(X^2,X,0,1)', raw`\int_{0}^{1} X^{2}\,dX`, 'INTEG with limits'],
    ['INTEG(X,X)', raw`\int X\,dX`, 'INTEG without limits'],
    ['INTEG(X+1,X,0,1)', raw`\int_{0}^{1} \left(X + 1\right)\,dX`, 'a sum under INTEG is parenthesized'],
    ['Σ(K^2,K,1,10)', raw`\sum_{K=1}^{10} K^{2}`, 'Σ takes the body first, then the index and its limits'],
    ['Σ(K+1,K,1,N)', raw`\sum_{K=1}^{N} \left(K + 1\right)`, 'a sum under Σ is parenthesized'],
    ['Σ(K,K,1,N)+1', raw`\left(\sum_{K=1}^{N} K\right) + 1`, 'a Σ followed by a term is fenced off'],
    ['2*Σ(K,K,1,N)+1', raw`\left(2\sum_{K=1}^{N} K\right) + 1`, 'a product ending in Σ is fenced off'],
    ['1+INTEG(X,X,0,1)', raw`1 + \int_{0}^{1} X\,dX`, 'an INTEG that ends the expression is not fenced'],
    ['INTEG(X,X,0,1)=1/2', raw`\int_{0}^{1} X\,dX = \frac{1}{2}`, 'an INTEG before = is not fenced'],
  ];
  for (const [source, want, label] of cases) assert(algebra(source) === want, `astLatex: ${label} (${source} gives ${algebra(source)})`);
}

{
  assert(algebra('1E100') === raw`10^{100}` && algebra('1.5E-10') === raw`1.5\times10^{-10}`,
    'astLatex: a number in exponent form is mantissa times a power of ten');
  assert(algebra('10^21') === raw`10^{21}` && algebra('2^(10^21)') === raw`2^{10^{21}}`,
    'astLatex: an exact big power stays a power');
  assert(astLatex(parseAlgebra('(-3)^X')) === raw`\left(-3\right)^{X}`, 'astLatex: a negative number as a base is parenthesized');
  assert(astLatex(undefined) === '?', 'astLatex: a missing node is a question mark, not a crash');
}

{
  assert(value('42') === '42' && value('-7') === '-7', 'toLatex: integers');
  assert(value('123456789012345678901234567890') === '123456789012345678901234567890', 'toLatex: a big integer keeps every digit');
  assert(value('3.14159') === '3.14159' && value('-0.5') === '-0.5', 'toLatex: reals');
  assert(value('1.5E-10') === raw`1.5\times10^{-10}` && value('1E100') === raw`10^{100}`, 'toLatex: reals with exponents');
  assert(toLatex(Real('0.333333333333')) === '0.333333333333', 'toLatex: a Real is not rounded to the display format');
  assert(value('1/3') === raw`\frac{1}{3}` && value('-7/2') === raw`-\frac{7}{2}`, 'toLatex: rationals are fractions');
  assert(value('(1,2)') === '1 + 2i' && value('(3,-1)') === '3 - i' && value('(0,1)') === 'i' && value('(0,-1)') === '-i' && value('(1.5,0)') === '1.5',
    'toLatex: complex numbers');
  assert(value('(1,1E-8)') === raw`1 + 10^{-8}i`, 'toLatex: a complex part in exponent form');
}

{
  const base = getBinaryBase();
  setBinaryBase('h');
  assert(toLatex(BinaryInteger(255n, 'd')) === raw`\mathtt{\#FFh}`, 'toLatex: a binary integer follows the display base');
  setBinaryBase(base);
}

{
  assert(value('"hello"') === raw`\text{hello}`, 'toLatex: strings are text');
  assert(value('"a_b {c} 100%"') === raw`\text{a\_b \{c\} 100\%}`, 'toLatex: string characters LaTeX reserves are escaped');
  assert(toLatex(Str('\\^~&$#')) === raw`\text{\textbackslash{}\^{}\~{}\&\$\#}`, 'toLatex: backslash, caret and tilde in a string');
  assert(value('`X`') === 'X' && value('`Xmax`') === raw`\mathrm{Xmax}` && value('`X1`') === raw`X_{1}`, 'toLatex: names');
  assert(value('`x_1`') === raw`x_{1}` && value('`α`') === raw`\alpha` && value('`π`') === raw`\pi`, 'toLatex: subscripted and Greek names');
  assert(value('`X^2+1`') === raw`X^{2} + 1` && value('`SIN(X)/X`') === raw`\frac{\sin\,X}{X}`, 'toLatex: algebraic objects');
}

{
  assert(value('{ 1 2 3 }') === raw`\left\{1,\ 2,\ 3\right\}` && value('{ }') === raw`\left\{\right\}`, 'toLatex: lists');
  assert(value('{ 1 "a" { 2 3 } }') === raw`\left\{1,\ \text{a},\ \left\{2,\ 3\right\}\right\}`, 'toLatex: nested lists with text');
  assert(value('[ 1 2 3 ]') === raw`\begin{bmatrix} 1 & 2 & 3 \end{bmatrix}`, 'toLatex: a vector is one row, as it displays');
  assert(value('[[ 1 2 ][ 3 4 ]]') === raw`\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}`, 'toLatex: a matrix is bmatrix');
  assert(value('[[ 1/2 3 ][ 4 5.5 ]]') === raw`\begin{bmatrix} \frac{1}{2} & 3 \\ 4 & 5.5 \end{bmatrix}`, 'toLatex: rational cells in a matrix');
  assert(value('[[ (1,2) 3 ]]') === raw`\begin{bmatrix} 1 + 2i & 3 \end{bmatrix}`, 'toLatex: complex cells in a matrix');
  assert(value('[ `X` 2 ]') === raw`\begin{bmatrix} X & 2 \end{bmatrix}`, 'toLatex: symbolic cells in a vector');
  assert(value(':a:5') === raw`\mathrm{a}\colon 5`, 'toLatex: a tagged value');
}

{
  assert(value('5_kJ') === raw`5\,\mathrm{kJ}` && value('3_μm') === raw`3\,\mu \mathrm{m}` && value('2_Ω') === raw`2\,\Omega`,
    'toLatex: units are upright, with Greek prefixes as commands');
  assert(value('9.8_m/s^2') === raw`9.8\,\mathrm{m}\,\mathrm{s}^{-2}`, 'toLatex: a compound unit uses negative exponents');
  assert(value('1_°C') === raw`1\,{}^{\circ}\mathrm{C}`, 'toLatex: degrees are a superscript circle');
  assert(value('2_m^.5') === raw`2\,\mathrm{m}^{0.5}`, 'toLatex: a fractional unit exponent');
  assert(toLatex(Unit(1e-9, [['F', 1]])) === raw`10^{-9}\,\mathrm{F}`, 'toLatex: a unit magnitude in exponent form');
}

{
  assert(value('<< 1 2 + >>') === null, 'toLatex: a program has no LaTeX form');
  assert(toLatex(Directory({ name: 'PROJ' })) === null, 'toLatex: a directory has no LaTeX form');
  assert(toLatex({ type: 'grob' }) === null, 'toLatex: a graphics object has no LaTeX form');
  assert(toLatex(Integer(0)) === '0', 'toLatex: zero is not mistaken for a missing value');
}

{
  const read = (latex) => formatAlgebra(latexToAst(latex));
  const cases = [
    [raw`\frac{x^{2}+1}{2}`, '(x^2 + 1)/2', 'a fraction is a quotient'],
    [raw`\sqrt{x+1}`, 'SQRT(x + 1)', '\\sqrt is SQRT'],
    [raw`\sqrt[3]{x}`, 'XROOT(x,3)', 'a root with an index is XROOT'],
    [raw`\sqrt x`, 'SQRT(x)', 'a root of a single token needs no braces'],
    [raw`x^2y`, 'x^2*y', 'an unbraced superscript is one token and the next factor multiplies'],
    [raw`x^23`, 'x^2*3', 'TeX takes one digit for an unbraced superscript'],
    [raw`\frac12`, '1/2', 'a fraction of two single digits'],
    [raw`2\pi r`, '2*π*r', 'juxtaposition multiplies, \\pi is π'],
    [raw`2\times3\div4 \cdot 5`, '2*3/4*5', 'times, div and cdot are operators'],
    [raw`\sin x`, 'SIN(x)', 'a function takes the factor after it'],
    [raw`\sin 2x`, 'SIN(2*x)', 'a function takes the whole run of factors'],
    [raw`\sin x\cos x`, 'SIN(x)*COS(x)', 'the next function ends the run'],
    [raw`\sin x + \cos y`, 'SIN(x) + COS(y)', 'a sum ends the run'],
    [raw`\sin^{2}x`, 'SIN(x)^2', 'a power on the function name applies to the call'],
    [raw`\sin\left(x+1\right)^{2}`, 'SIN(x + 1)^2', 'a power after the parentheses applies to the call'],
    [raw`\sin^{-1}x`, 'ASIN(x)', 'sin to the -1 is the inverse function, as on a calculator'],
    [raw`\cot x`, '1/TAN(x)', 'cotangent is the reciprocal of the tangent'],
    [raw`\ln x`, 'LN(x)', '\\ln'],
    [raw`\log x`, 'LOG(x)', '\\log is the common logarithm'],
    [raw`\log_{2}x`, 'LN(x)/LN(2)', 'a logarithm to another base is a quotient of natural logarithms'],
    [raw`\log_{10}x`, 'LOG(x)', 'a logarithm to base 10 is LOG'],
    [raw`e^{-x^{2}}`, 'EXP(-x^2)', 'e to a power is EXP'],
    [raw`\exp\left(x\right)`, 'EXP(x)', '\\exp'],
    [raw`\left|x-1\right|`, 'ABS(x - 1)', 'sized bars are ABS'],
    [raw`|x|+|y|`, 'ABS(x) + ABS(y)', 'plain bars are ABS'],
    [raw`||x|-1|`, 'ABS(ABS(x) - 1)', 'bars nest'],
    [raw`\lfloor x\rfloor + \lceil x\rceil`, 'FLOOR(x) + CEIL(x)', 'floor and ceiling brackets'],
    [raw`(n+1)!`, 'FACT(n + 1)', 'a factorial'],
    [raw`\binom{n}{k}`, 'COMB(n,k)', 'a binomial coefficient'],
    [raw`\overline{z}`, 'CONJ(z)', 'a bar is the conjugate'],
    [raw`\sum_{i=1}^{n} i^{2}`, 'Σ(i^2,i,1,n)', 'a sum with its limits, body first as the app writes Σ'],
    [raw`\sum_{k=0}^{9}k+1`, 'Σ(k,k,0,9) + 1', 'a sum takes the next term only'],
    [raw`\int_{0}^{1} x^{2}\,dx`, 'INTEG(x^2,x,0,1)', 'a definite integral'],
    [raw`\int \sin x\,dx`, 'INTEG(SIN(x),x)', 'an indefinite integral'],
    [raw`\int_0^1 \frac{1}{x}\,dx`, 'INTEG(1/x,x,0,1)', 'unbraced limits and a fraction inside an integral'],
    [raw`\frac{d}{dx}\left(x^{2}\right)`, 'DERIV(x^2,x)', 'a derivative of the factor after it'],
    [raw`\frac{d^{2}}{dx^{2}} x^{3}`, 'DERIV(DERIV(x^3,x),x)', 'a second derivative'],
    [raw`\frac{dy}{dx}`, 'd*y/(d*x)', 'dy over dx with no operand stays a quotient'],
    [raw`x^{2}-5x+6=0`, 'x^2 - 5*x + 6 = 0', 'an equation'],
    [raw`a \le b`, 'a≤b', 'a comparison'],
    [raw`\alpha+\beta`, 'α + β', 'Greek letters'],
    [raw`\theta_{1}`, 'θ1', 'a numeric subscript joins the name'],
    [raw`A_{12}`, 'A12', 'a longer subscript'],
    [raw`\mathrm{rate}\cdot 2`, 'rate*2', 'an upright word is one name'],
    [raw`\operatorname{lcm}(4,6)`, 'LCM(4,6)', '\\operatorname names a function'],
    [raw`\min(a,b)`, 'MIN(a,b)', 'a function of two arguments'],
    [raw`\Gamma(x)`, 'GAMMA(x)', 'Γ with an argument is the gamma function'],
    [raw`\Gamma`, 'Γ', 'Γ alone is a letter'],
    [raw`1\,000x`, '1000*x', 'a thin space between digit groups is a thousands separator'],
    [raw`$\frac{1}{2}$`, '1/2', 'dollar signs are dropped'],
    [raw`\(x^{2}\)`, 'x^2', 'math parentheses are dropped'],
    [raw`\[ \displaystyle x^{2} \]`, 'x^2', 'display brackets and \\displaystyle are dropped'],
    [raw`\bigl(a+b\bigr)^2`, '(a + b)^2', 'sizing commands are ignored'],
    [raw`\infty`, '∞', '\\infty'],
  ];
  for (const [latex, expected, label] of cases) assert(read(latex) === expected, `latexToAst: ${label} (${latex} gave ${(() => { try { return read(latex); } catch (e) { return e.message; } })()})`);

  const refusals = [
    [raw`\lim_{x\to 0} x`, /Can't read \\lim/, 'a limit'],
    [raw`\foo`, /Can't read \\foo/, 'an unknown command'],
    [raw`\constructor`, /Can't read \\constructor/, 'a command named like an object property'],
    [raw`\frac{1}{`, /ends too soon/, 'an unclosed group'],
    [raw`\int x^2`, /differential/, 'an integral without its differential'],
    [raw`\int_0 x\,dx`, /both limits/, 'an integral with one limit'],
    [raw`\sum i`, /both limits/, 'a sum without limits'],
    [raw`x_{i+1}`, /subscript/, 'a subscript that is not a name'],
    [raw`a = b = c`, /Only one comparison/, 'a chain of comparisons'],
    [raw`\min x`, /MIN takes 2 arguments/, 'a function with the wrong number of arguments'],
    [raw`\begin{bmatrix} 1 \end{bmatrix}`, /Can't read \\begin/, 'a matrix'],
    [raw`a \\ b`, /Can't read \\\\/, 'a line break'],
    ['', /no formula/, 'nothing at all'],
  ];
  for (const [latex, pattern, label] of refusals) assertThrows(() => latexToAst(latex), pattern, `latexToAst refuses ${label}`);
}

{
  const corpus = [
    'X^2+1', '(X+1)*(X-1)', 'SQRT(X^2+1)/2', 'SIN(X)^2+COS(X)^2', 'EXP(-X^2)', 'LN(X+1)', 'ABS(X-1)', 'X^(Y+1)', '(A+B)/(C-D)',
    'Σ(K^2,K,1,N)', 'Σ(A*I,I,0,N)', 'INTEG(SIN(X),X,0,1)', 'INTEG(X^2+1,X)', 'INTEG(1/X,X,1,E)', 'XROOT(X,3)', 'COMB(N,2)', 'FACT(N)', 'FACT(N+1)',
    'A*B*C', 'A/B/C', 'A-(B-C)', 'A-B-C', 'A-B+C', '-X^2', '(-X)^2', '-X*Y', 'X*(-Y)', 'X^2=4', 'X<=Y', 'X≠Y', '2*π*R', 'A*(B+C)', '(A+B)*C',
    'A^B^C', '(A^B)^C', 'SIN(2*X)', 'SIN(X+1)', 'COS(X)*SIN(X)', 'TAN(X)/X', 'ATAN(X)', 'ASIN(X/2)', 'SINH(X)', 'LOG(X)', 'FLOOR(X)', 'CEIL(X+1)',
    'CONJ(Z)', 'MIN(A,B)', 'MAX(A,B)', 'GCD(A,B)', 'LCM(A,B)', 'MOD(A,B)', 'ABC+1', 'R1*R2/(R1+R2)', 'DERIV(X^2,X)', 'DERIV(SIN(X)*X,X)',
    '1/2', 'X/2', '2/X', '3*X^2', '3*X', 'X*3', '2^X', 'EXP(X)', 'EXP(1)', 'SQRT(2)', 'SQRT(X)^2', 'SQRT(X+SQRT(Y))', 'α+β', 'θ1*2', 'A*B/C', 'A/(B*C)',
    'X^-1', '10^3', 'LN(X)^2', 'SIN(X)^-1', 'ERF(X)', 'GAMMA(X)', 'ZETA(2)', 'RE(Z)', 'IM(Z)', 'ARG(Z)', 'SIGN(X)', 'HEAVISIDE(X)',
    '(X+1)^2/(X-1)^2', 'ABS(ABS(X)-1)',
  ];
  const differs = corpus.filter((text) => {
    const ast = parseAlgebra(text);
    try { return !astEqual(latexToAst(astLatex(ast)), ast); } catch { return true; }
  });
  assert(differs.length === 0, `Copy as LaTeX then reading it back gives the same expression (differs: ${differs.join(', ')})`);
  assert(formatAlgebra(latexToAst(algebra('ALOG(X)'))) === '10^X', 'ALOG(X) copied as LaTeX reads back as the equal 10^X');
  assert(algebra('θ1*2') === raw`\theta_{1} \cdot 2`, 'a Greek name with digits is written with a subscript');
}

{
  assert(!looksLikeLatex('X^2+1') && !looksLikeLatex('SIN(X)/2') && !looksLikeLatex('3 4 +'), 'plain algebra and RPL do not look like LaTeX');
  assert(looksLikeLatex(raw`\frac{1}{2}`) && looksLikeLatex('x^{2}') && looksLikeLatex('$x^2$') && looksLikeLatex(raw`\(x\)`), 'a command, a braced script or math delimiters look like LaTeX');
  assert(formatAlgebra(parseMath(raw`\frac{x}{2}`)) === 'x/2' && formatAlgebra(parseMath('x/2')) === 'x/2', 'parseMath reads LaTeX or algebra');
  assert(latexToSource(raw`\frac{x^{2}}{2}`) === '`x^2/2`' && latexToSource(raw`\pi`) === null && latexToSource('3 4 +') === null && latexToSource('« \\pi 2 * »') === null && latexToSource(raw`\lim x`) === null,
    'pasted LaTeX becomes a quoted algebraic on the command line, and anything else is left alone');
}

{
  const sum = evalAst(latexToAst(raw`\sum_{k=1}^{4} k^{2}`), () => undefined);
  assert(sum.kind === 'num' && sum.value === 30, 'a pasted \\sum evaluates as the sum it spells (1+4+9+16 = 30)');
  assert(algebra('Σ(K^2,K,1,4)') === raw`\sum_{K=1}^{4} K^{2}` && evalAst(parseAlgebra('Σ(K^2,K,1,4)'), () => undefined).value === 30,
    'Copy as LaTeX writes the sum the app evaluates, not one with the body as its index');
}

{
  assert(algebra('5_m+3_ft') === raw`5\,\mathrm{m} + 3\,\mathrm{ft}` && algebra('(5_m)^2') === raw`\left(5\,\mathrm{m}\right)^{2}` && algebra('9.81_(m/s^2)') === raw`9.81\,\mathrm{m}\,\mathrm{s}^{-2}`,
    'Copy as LaTeX writes a unit inside an algebraic as a quantity, bracketed as a power base');
}


{
  assert(algebra('X>1 AND X<5') === raw`X > 1 \land X < 5` && algebra('A OR B') === raw`A \lor B` && algebra('A XOR B') === raw`A \veebar B`,
    'Copy as LaTeX writes AND, OR and XOR as the logic symbols');
  assert(algebra('NOT (A AND B)') === raw`\lnot \left(A \land B\right)` && algebra('NOT X>1') === raw`\lnot \left(X > 1\right)` && algebra('(A OR B) AND C') === raw`\left(A \lor B\right) \land C`,
    'Copy as LaTeX brackets what NOT and a mixed logic expression group');
}
