import { hpTextToSource, parseHpText, formatHpText, HP_TEXT_HEADER } from '../www/src/rpl/hp-text.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { formatSource } from '../www/src/rpl/formatter.js';
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
  assert(!['1/3_m', '1/3E2', '1/2/3', '2/3x'].some((src) => parseEntry(src).some(isRational)),
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
