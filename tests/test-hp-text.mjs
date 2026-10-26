import { hpTextToSource, parseHpText, formatHpText, HP_TEXT_HEADER } from '../www/src/rpl/hp-text.js';
import { parseEntry, endsInQuote, plainPunctuation, plainCharacter, bareDecimalComma } from '../www/src/rpl/parser.js';
import { formatSource, format } from '../www/src/rpl/formatter.js';
import {
  Str, Rational, Integer, RList, Matrix, isDirectory, isProgram, isString, isSymbolic, isTagged, isRational, isInteger, isReal,
} from '../www/src/rpl/types.js';
import { setApproxMode } from '../www/src/rpl/state.js';
import { assert, assertThrows, runLine } from './helpers.mjs';

const LIBRARY = `%%HP: T(3)A(R)F(.);
@ area of a circle
DIR
  AREA \\<< \\-> r 'r^2*\\pi' \\>>
  NOTE "it's @ 5 \\=/ 6"
  GEO DIR
    X 1.5
    Y :t:{ 1 2 }
  END
  CMP \\<< IF 'X\\<=2' THEN 1 ELSE 2 END \\>> @ trailing comment
END`;

{
  assert(hpTextToSource(`${HP_TEXT_HEADER}\n\\<< 'X' \\-> \\>>`).trim() === '« `X` → »',
    'hpTextToSource: drops the header, decodes T(3) codes, and turns apostrophes into backticks');
  assert(hpTextToSource('1 @ note @ 2 @ to end\n3').replace(/\s+/g, ' ').trim() === '1 2 3',
    'hpTextToSource: @ comments end at the next @ or the line end');
  assert(hpTextToSource('“don’t” SIZE') === '"don’t" SIZE' && hpTextToSource('« → X ‘X^2+1’ »') === '« → X `X^2+1` »',
    'hpTextToSource: curly quotes from a messaging app read as a string and an algebraic');
  assert(hpTextToSource('"He said “hi”" SIZE') === '"He said “hi”" SIZE',
    'hpTextToSource: curly quotes inside a straight-quoted string stay text');
  const typed = parseEntry('‘X^2+1’ “don’t” ‘A’');
  assert(isSymbolic(typed[0]) && isString(typed[1]) && typed[1].value === 'don’t' && typed[2].type === 'name' && typed[2].id === 'A',
    'parseEntry: quotes curled by a phone keyboard\'s smart punctuation read as straight ones, so ‘X^2+1’ is an algebraic and “don’t” a string');
  assert(endsInQuote('1 ‘X') && !endsInQuote('1 ‘X’') && !endsInQuote('"it’s"'),
    'endsInQuote: a curly quote opens and closes an algebraic, so operator keys type inside ‘X as they do inside \'X');
  const symbols = parseEntry('× ÷ − −5 ‘X−1’ "a×b÷c"');
  assert(symbols.slice(0, 3).map((v) => v.id).join(' ') === '* / -' && symbols[3].type === 'integer' && symbols[3].value === -5n
    && isSymbolic(symbols[4]) && symbols[5].value === 'a×b÷c',
    'parseEntry: ×, ÷ and − from a phone\'s symbol keys read as *, / and - (−5 a number, ‘X−1’ an algebraic), and stay text in a string');
  const same = (typed, plain) => formatSource(parseEntry(typed)[0]) === formatSource(parseEntry(plain)[0]);
  assert(same("'X²+1'", "'X^2+1'") && same('‘X²’', "'X^2'") && same("'X⁻²'", "'X^(-2)'") && same("'(X+1)³'", "'(X+1)^3'") && same("'x¹⁰'", "'x^10'")
    && same('5_m²', '5_m^2') && same('1_m/s²', '1_m/s^2') && same('5_m⁻¹', '5_m^-1') && parseEntry('"x² ½ 30°"')[0].value === 'x² ½ 30°',
    'parseEntry: a superscript from a phone is a power, ^2 in an algebraic or a unit ("X²" was a name of its own), and text in a string');
  const value = (src) => format(runLine(src).peek(), {});
  assert(value('5²') === '25' && value('5 ²') === '25' && value('2³') === '8' && value('2¹⁰') === '1024' && value('« 5² »') === '« 5 SQ »' && value('(1,2)²') === '(-3., 4.)',
    'parseEntry: on the command line a superscript applies SQ, or n ^, to what came before it, so 5² gives 25 and 2¹⁰ 1024');
  assert(value('½') === '1/2' && value('¾ 4 *') === '3' && value('-½') === '-1/2' && value('1½') === '3/2' && value("'X/½'") === '`X/(1/2)`' && value("'2*1½'") === '`2*(1 + 1/2)`',
    'parseEntry: a fraction glyph is the exact fraction, a minus sign beside it a negative one, and 1½ the mixed number 3/2, in an algebraic too');
  assert(value('30°') === '30._°' && value('20°C') === '20._°C' && value('1.5°') === '1.5_°' && value('1_°C') === '1._°C' && value('30° SIN') === '0.5' && value('"30°"') === '"30°"',
    'parseEntry: a degree sign right after a number is the angle unit, so 30° SIN is 0.5 and 20°C a temperature, and it is text in a string');
  assert(value('3 4 !=') === '1.' && value('3 4 ∕') === '3/4' && value("'2·X'") === '`2*X`' && value('3 4 ·') === '12' && value("'X–1'") === '`X - 1`',
    'parseEntry: != reads as ≠, and ·, ∕ and – from a phone\'s symbol keys as *, / and -');
  assert(['\u2014', '\u2010', '\u2011', '\u2012', '\ufe63'].every((dash) => value(`5 3 ${dash}`) === '2')
    && ['\u2217', '\u2219', '\u2715', '\u2716'].every((dot) => value(`4 3 ${dot}`) === '12') && value('12 4 \u2044') === '3'
    && same("'X\u2014\u2012Y'", "'X--Y'") && parseEntry('"a\u2014b\u200b"')[0].value === 'a\u2014b\u200b',
    'parseEntry: the dashes, dots and slashes that pasted text brings (em dash, hyphens, ∗, ∙, ✕, ⁄) read as - * and /, and stay text in a string');
  assert(value('12\u200b3 +') === '15' && value('12\u200b 3 +') === '15' && value('\u200c1\u200d 2\u2060 +') === '3',
    'parseEntry: an invisible character, a zero-width space or joiner, ends a word as a space does, not a syntax error near nothing');
  assert(value('30\u00ba SIN') === '0.5' && value('30\u02da') === '30._°' && value('1.5\u00ba') === '1.5_°' && parseEntry('"30\u00ba"')[0].value === '30\u00ba',
    'parseEntry: º, which a Spanish or Portuguese keyboard has where ° is, and ˚ are the degree sign');
  assert(value('\u201eHi\u201c SIZE') === '2' && value('\u201eHi\u201d SIZE') === '2' && value('\u201cHi\u201d SIZE') === '2'
    && same('\u2032X^2\u2032', "'X^2'") && same('\u00b4X\u00b4', "'X'") && value('{ 1 2 3 } \u2211LIST') === '6' && value('{ 1 4 9 } \u2206LIST') === '{ 3 5 }',
    'parseEntry: „Hi“ and „Hi” are strings as “Hi” is, primes and an acute accent are apostrophes, and ∑ and ∆ are Σ and Δ');
  assert(value('\uff11\uff12 \uff12 \uff0b') === '14' && same('\uff07\uff38\uff0b\uff11\uff07', "'X+1'") && value('\u0661\u0662 \u0663 +') === '15'
    && value('\u06f1\u06f2 \u06f3 +') === '15' && value('\u09e7 \u09e8 +') === '3' && value('"\u0661"') === '"\u0661"',
    'parseEntry: full-width forms of ASCII from an East Asian keyboard and Arabic-Indic, Persian and Bengali digits read as the plain ones, and stay text in a string');
  assert(plainPunctuation('\u2126 \u212b') === 'Ω Å' && plainCharacter('\u2014') === '-' && plainCharacter('x') === 'x',
    'plainCharacter: one character as the plain one, the ohm and angstrom signs as the Greek and Latin letters');
  assert(['5²', "'X²'", '½', '1½', '30°', '5_m²', '-½', '2¹⁰'].every((typed) => plainPunctuation(plainPunctuation(typed)) === plainPunctuation(typed))
    && endsInQuote("1 'X²") && !endsInQuote("1 'X²'") && !endsInQuote('1 5² 30°'),
    'parseEntry: the symbol keys read the same when the text is read twice, and a quote around ² opens and closes as any other');
  const found = {
    '3,14': '3,14', '3,14 2 *': '3,14', '5 3,14 *': '3,14', '-3,14': '3,14', '3,5_m': '3,5', '2,5E3': '2,5', '1,5 2,5 +': '1,5',
    '{ 1 2 } 3,14': '3,14', '(1,2) 3,14': '3,14', "'X' 3,14": '3,14', '3,14 @ 1,5': '3,14', '1,234,567': '1,234,567', '12,345 SQ': '12,345',
  };
  assert(Object.entries(found).every(([src, number]) => bareDecimalComma(src) === number),
    'bareDecimalComma: a comma between digits at the top of a line is found, as the number it sits in, for a phone keyboard that types the decimal comma');
  assert(['{ 1,2,3 }', '[1,2,3]', '[[1,2][3,4]]', '(1,2)', "'MAX(1,2)'", '`MAX(1,2)`', '"3,14"', '@ 3,14', '« 1,2 + »', '<< 1,2 + >>', 'A1,2', '1, 2', '1 ,2', '3.14', '1.5,2', '1,5.2', '3,', ',3', '1,,2', ''].every((src) => bareDecimalComma(src) === null),
    'bareDecimalComma: a comma inside a list, vector, complex number, algebraic, program, string or comment, beside a name, a space or a point, or a lone comma, is no decimal comma');
  assert(hpTextToSource(`"it's @ here"`) === `"it's @ here"`,
    'hpTextToSource: apostrophes and @ inside a string are kept');
}

{
  const dir = parseHpText(LIBRARY, 'LIB');
  assert(isDirectory(dir) && dir.name === 'LIB' && [...dir.entries.keys()].join(' ') === 'AREA NOTE GEO CMP',
    'parseHpText: DIR … END becomes a Directory named after the file, entries in order');
  assert(formatSource(dir.entries.get('AREA')) === '« → r `r^2*π` »',
    'parseHpText: a T(3) program reads as the app program');
  assert(dir.entries.get('NOTE').value === "it's @ 5 ≠ 6",
    'parseHpText: a string keeps its apostrophe and @');
  const sub = dir.entries.get('GEO');
  assert(isDirectory(sub) && sub.parent === dir && isTagged(sub.entries.get('Y')),
    'parseHpText: a nested DIR is a child directory linked to its parent');
  assert(isSymbolic(dir.entries.get('CMP').tokens[1]),
    "parseHpText: 'X\\<=2' becomes a symbolic comparison");
}

{
  const text = formatHpText(parseHpText(LIBRARY, 'LIB'));
  assert(text.startsWith(`${HP_TEXT_HEADER}\nDIR\n  AREA \\<< \\-> r 'r^2*\\pi' \\>>\n`),
    'formatHpText: writes the header, T(3) codes, and apostrophe algebraics');
  assert(text.includes('  GEO DIR\n    X 1.5\n'), 'formatHpText: nests a subdirectory as NAME DIR … END');
  assert(formatHpText(parseHpText(text, 'LIB')) === text, 'formatHpText output reads back to the same text');
}

{
  const program = parseHpText("\\<< 'X' STO \\>>");
  assert(isProgram(program), 'parseHpText: a single object file returns that object');
  assert(formatHpText(Str('say "hi" \\ bye')) === `${HP_TEXT_HEADER}\n"say \\"hi\\" \\\\ bye"\n`,
    'formatHpText: escapes quotes and backslashes in a string');
  const [back] = parseEntry(formatSource(Str('say "hi" \\ bye')));
  assert(isString(back) && back.value === 'say "hi" \\ bye', 'formatSource: an escaped string reads back unchanged');
}

assertThrows(() => parseHpText('DIR A 1', 'N'), /missing END/, 'parseHpText: DIR without END is rejected');
assertThrows(() => parseHpText('DIR 5 1 END', 'N'), /expected a variable name/, 'parseHpText: DIR needs name/value pairs');
assertThrows(() => parseHpText('DIR A 1 END 3', 'N'), /Text after END/, 'parseHpText: nothing may follow the closing END');
assertThrows(() => parseHpText('1 2'), /Expected one object, found 2/, 'parseHpText: a file holds one object');
assertThrows(() => parseHpText('@ only a comment'), /Empty file/, 'parseHpText: a file with no object is rejected');
assertThrows(() => parseHpText('DIR SUB 1 END', 'N'), /expected a variable name/,
  'parseHpText: a DIR entry cannot take a command name such as SUB');

{
  const one = (src) => parseEntry(src)[0];
  const third = one('1/3');
  assert(isRational(third) && third.n === 1n && third.d === 3n, 'a fraction typed without spaces, 1/3, is the exact rational');
  assert(one('-2/6').n === -1n && one('-2/6').d === 3n && one('+1/2').n === 1n, 'a fraction takes a sign and is reduced');
  assert(isInteger(one('6/3')) && one('6/3').value === 2n, 'a fraction that reduces to a whole number is an integer');
  assertThrows(() => parseEntry('1/0'), /Infinite result/, 'a fraction with a zero denominator is Infinite result');
  assert(formatSource(Rational(1n, 3n)) === '1/3' && formatSource(one('{ 1/3 -3/4 }')) === '{ 1/3 -3/4 }'
    && formatSource(one('[[ 1/3 2 ][ 5 7/8 ]]')) === '[[ 1/3 2 ][ 5 7/8 ]]' && formatSource(one('« 1/3 2/3 + »')) === '« 1/3 2/3 + »',
    'a rational reads back inside a list, a matrix and a program');
  const readsRational = (src) => { try { return parseEntry(src).some(isRational); } catch { return false; } };
  assert(!['1/3_m', '1/3E2', '1/2/3', '2/3x'].some(readsRational),
    'a fraction followed by a unit, an exponent, a second slash or letters is not a rational');
  const stack = runLine('1 3 / DUP ->STR STR→ SAME');
  assert(stack.peek().value.eq(1), '->STR then STR→ gives back the same rational');
  const listStack = runLine('{ 1/3 2/5 } DUP ->STR STR→ SAME');
  assert(listStack.peek().value.eq(1), 'a list of rationals survives ->STR and STR→');
  const text = formatHpText(RList([Rational(1n, 3n), Matrix([[Rational(2n, 3n), Integer(1n)]])]));
  const back = parseHpText(text);
  assert(formatSource(back) === '{ 1/3 [[ 2/3 1 ]] }' && isRational(back.items[0]), 'an HP text file with rationals reads back the same');
  assert(isRational(runLine('1/3 2 *').peek()) && formatSource(runLine('1/3 2 *').peek()) === '2/3', 'a typed fraction takes part in exact arithmetic');
  setApproxMode(true);
  try {
    const approx = one('1/3');
    assert(isReal(approx) && formatSource(approx) === '0.333333333333', 'in approximate mode a typed fraction is a real number');
  } finally {
    setApproxMode(false);
  }
}
