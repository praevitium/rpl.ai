import {
  hpTextToSource, parseHpText, formatHpText, HP_TEXT_HEADER, spreadsheetToSource, spreadsheetHtml,
} from '../www/src/rpl/hp-text.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { formatSource } from '../www/src/rpl/formatter.js';
import {
  Str, isDirectory, isProgram, isString, isSymbolic, isTagged, Matrix, Vector, Integer, Real, Rational, Complex,
} from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

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
  const matrix = spreadsheetToSource('1\t2\r\n3\t4\r\n');
  assert(matrix === '[[ 1 2 ][ 3 4 ]]' && formatSource(parseEntry(matrix)[0]) === '[[ 1 2 ][ 3 4 ]]',
    'spreadsheetToSource: an Excel range becomes a matrix');
  assert(spreadsheetToSource('1\t2\t3') === '[ 1 2 3 ]', 'spreadsheetToSource: a single row becomes a vector');
  assert(formatSource(parseEntry(spreadsheetToSource('1,234.5\t12.5%\n-7\t'))[0]) === '[[ 1234.5 0.125 ][ -7 0 ]]',
    'spreadsheetToSource: thousands separators and percentages are read, and an empty cell is 0');
  assert(spreadsheetToSource('x\ty\n1\t2') === null, 'spreadsheetToSource: a range with text cells stays text');
  assert(spreadsheetToSource('5\r\n') === null && spreadsheetToSource('1\n2\n3') === null,
    'spreadsheetToSource: text without tabs is not a range');
}

{
  const html = spreadsheetHtml(Matrix([[Integer(1n), Real(2.5)], [Rational(1n, 4n), Complex(1, -2)]]));
  assert(html === '<table><tr><td>1</td><td>2.5</td></tr><tr><td>0.25</td><td>1-2i</td></tr></table>',
    'spreadsheetHtml: a matrix becomes a table of spreadsheet numbers');
  assert(spreadsheetHtml(Vector([Integer(1n), Integer(2n)])) === '<table><tr><td>1</td><td>2</td></tr></table>',
    'spreadsheetHtml: a vector becomes one row');
  assert(spreadsheetHtml(Integer(5n)) === '', 'spreadsheetHtml: other values have no table');
}
