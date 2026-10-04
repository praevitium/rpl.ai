import { readFileSync } from 'node:fs';
import {
  sheetNumber, parseDelimited, spreadsheetToSource, importTable, importCells, formatDelimited, spreadsheetHtml, isTable, xlsxRows,
  SHEET_MAX_CELLS, htmlTableToSource, htmlTableToText,
} from '../www/src/rpl/sheet.js';
import { buildXlsx } from '../www/src/rpl/xlsx.js';
import { readUpload, fileVariableName, downloadFormats } from '../www/src/rpl/persist.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { formatSource } from '../www/src/rpl/formatter.js';
import {
  Str, Name, Matrix, Vector, RList, Integer, Real, Rational, Complex, isDirectory, isMatrix, isVector, isList,
} from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

const src = (text) => formatSource(parseEntry(text)[0]);

{
  const matrix = spreadsheetToSource('1\t2\r\n3\t4\r\n');
  assert(matrix === '[[ 1 2 ][ 3 4 ]]' && src(matrix) === '[[ 1 2 ][ 3 4 ]]',
    'spreadsheetToSource: an Excel range becomes a matrix');
  assert(spreadsheetToSource('1\t2\t3') === '[ 1 2 3 ]', 'spreadsheetToSource: a single row becomes a vector');
  assert(src(spreadsheetToSource('1,234.5\t12.5%\n-7\t')) === '[[ 1234.5 0.125 ][ -7 0 ]]',
    'spreadsheetToSource: thousands separators and percentages are read, and an empty cell is 0');
  assert(spreadsheetToSource('x\ty\n1\t2') === null, 'spreadsheetToSource: a range with text cells stays text');
  assert(spreadsheetToSource('\t1 2 +\n\t»') === null, 'spreadsheetToSource: an indented program stays text');
  assert(spreadsheetToSource('5\r\n') === null && spreadsheetToSource('1\n2\n3') === null,
    'spreadsheetToSource: text without tabs is not a range');
  assert(src(spreadsheetToSource('(300.00)\t$1,250.50\n12,5\t-')) === '[[ -300. 1250.5 ][ 12.5 0 ]]',
    'spreadsheetToSource: accounting negatives, currency, decimal commas and a dash are read as numbers');
}

{
  const read = (cell) => sheetNumber(cell);
  assert(read('1,234.56') === '1234.56' && read('1.234,56') === '1234.56' && read('1 234,56') === '1234.56'
    && read("1'234.56") === '1234.56' && read('1,23,456') === '123456',
    'sheetNumber: thousands and decimal separators of any locale');
  assert(read('12,5') === '12.5' && read('0,5') === '0.5' && read('1,234') === '1234' && read('1.234.567') === '1234567',
    'sheetNumber: a lone comma is a decimal comma unless it groups three digits');
  assert(read('$1,234.50') === '1234.50' && read('€12,50') === '12.50' && read('£ 3.5') === '3.5' && read('3.5 €') === '3.5',
    'sheetNumber: a currency symbol is dropped');
  assert(read('(300.00)') === '-300.00' && read('($5.00)') === '-5.00' && read('-$5') === '-5' && read('300-') === '-300'
    && read('\u22123') === '-3',
    'sheetNumber: accounting, trailing and typographic minus signs are negative');
  assert(read('12.5%') === '12.5E-2' && read('50 %') === '50E-2' && read('1e-3') === '1E-3' && read('1,5E3') === '1.5E3',
    'sheetNumber: percentages and exponents');
  assert(read('-') === '0' && read('—') === '0', 'sheetNumber: a lone dash is zero, as in an accounting format');
  assert(['', 'abc', '1.2.3', '1/2', '12:30', '#N/A', '1E', 'E5', '$', '()'].every((t) => read(t) === null),
    'sheetNumber: text, dates, times and spreadsheet errors are not numbers');
}

{
  assert(JSON.stringify(parseDelimited('a,b\n1,"x,y"\n"q""r",2\r\n\r\n3,4\n'))
    === '[["a","b"],["1","x,y"],["q\\"r","2"],["3","4"]]',
    'parseDelimited: quotes protect delimiters, a doubled quote is one, and blank lines are skipped');
  assert(JSON.stringify(parseDelimited('1;2,5\n3;4,5')) === '[["1","2,5"],["3","4,5"]]',
    'parseDelimited: a semicolon file keeps its decimal commas');
  assert(JSON.stringify(parseDelimited('1\t2,5\n3\t4')) === '[["1","2,5"],["3","4"]]',
    'parseDelimited: a tab file keeps its commas');
  assert(JSON.stringify(parseDelimited('\uFEFFa,"line\nbreak"\n')) === '[["a","line\\nbreak"]]',
    'parseDelimited: a byte order mark is dropped and a quoted cell may span lines');
  assert(parseDelimited('').length === 0, 'parseDelimited: empty text has no rows');
}

{
  const table = (text, delimiter) => {
    const { value, header } = importTable(text, delimiter);
    return `${formatSource(value)}${header ? ` header ${header.join('|')}` : ''}`;
  };
  assert(table('1,2\n3,4') === '[[ 1 2 ][ 3 4 ]]', 'importTable: a CSV of numbers is a matrix');
  assert(table('1,2,3') === '[ 1 2 3 ]', 'importTable: one row is a vector');
  assert(table('1\n2\n3') === '[[ 1 ][ 2 ][ 3 ]]', 'importTable: one column is a column matrix');
  assert(table('x,y\n1,2\n3,4') === '[[ 1 2 ][ 3 4 ]] header x|y', 'importTable: a text row over numbers is a header and is skipped');
  assert(table('1;2,5\n3;4,5') === '[[ 1 2.5 ][ 3 4.5 ]]', 'importTable: semicolons and decimal commas');
  assert(table('a\tb\n1\t2') === '[ 1 2 ] header a|b', 'importTable: tabs, and a header over one row');
  assert(table('1,2\n3\n') === '[[ 1 2 ][ 3 0 ]]', 'importTable: a short row is padded with zeros');
  assert(table('name,val\nA,1\nB,2') === '{ { "name" "val" } { "A" 1 } { "B" 2 } }',
    'importTable: a table with text cells is a list of rows');
  assert(table('"a, b",1\n,2') === '{ { "a, b" 1 } { "" 2 } }', 'importTable: a quoted cell keeps its comma, a blank text cell is an empty string');
  assert(table('"1,234",2') === '[ 1234 2 ]', 'importTable: a quoted number is a number');
  assertThrows(() => importTable(''), /no data/, 'importTable: an empty file is rejected');
  assertThrows(() => importTable(`${'1,'.repeat(SHEET_MAX_CELLS)}1`), /cells/, 'importTable: more than the cell limit is rejected');
}

{
  const m = Matrix([[Integer(1n), Real(2.5)], [Rational(1n, 3n), Complex(1, -2)]]);
  assert(formatDelimited(m) === '1,2.5\n0.333333333333,1-2i\n', 'formatDelimited: a matrix is rows of numbers, a rational as a decimal');
  assert(formatDelimited(m, '\t') === '1\t2.5\n0.333333333333\t1-2i\n', 'formatDelimited: a tab-separated table');
  assert(formatDelimited(Vector([Integer(1n), Integer(2n)])) === '1,2\n', 'formatDelimited: a vector is one row');
  assert(formatDelimited(RList([Integer(1n), Integer(2n)])) === '1,2\n', 'formatDelimited: a list of numbers is one row');
  assert(formatDelimited(RList([RList([Str('a, b'), Integer(1n)]), RList([Str('q"r'), Real(0.5)])])) === '"a, b",1\n"q""r",0.5\n',
    'formatDelimited: a list of lists is rows, and quotes and delimiters are quoted');
  assert(formatDelimited(RList([Str('µ'), Name('X')])) === '\uFEFFµ,X\n', 'formatDelimited: text outside ASCII gets a byte order mark for Excel');
  assert(formatDelimited(Integer(5n)) === null && formatDelimited(RList([])) === null && formatDelimited(Str('x')) === null,
    'formatDelimited: other values are not tables');
  const back = importTable(formatDelimited(Matrix([[Integer(1n), Real(2.5)], [Integer(-3n), Real(0.125)]]))).value;
  assert(isMatrix(back) && formatSource(back) === '[[ 1 2.5 ][ -3 0.125 ]]', 'formatDelimited: a matrix survives a CSV round trip');
  assert(isTable(m) && isTable(RList([Integer(1n)])) && !isTable(Integer(1n)) && !isTable(RList([])), 'isTable: matrices, vectors and non-empty lists');
}

{
  const html = spreadsheetHtml(Matrix([[Integer(1n), Real(2.5)], [Rational(1n, 4n), Complex(1, -2)]]));
  assert(html === '<table><tr><td>1</td><td>2.5</td></tr><tr><td>0.25</td><td>1-2i</td></tr></table>',
    'spreadsheetHtml: a matrix becomes a table of spreadsheet numbers');
  assert(spreadsheetHtml(Vector([Integer(1n), Integer(2n)])) === '<table><tr><td>1</td><td>2</td></tr></table>',
    'spreadsheetHtml: a vector becomes one row');
  assert(spreadsheetHtml(RList([RList([Str('a<b'), Integer(1n)])])) === '<table><tr><td>a&lt;b</td><td>1</td></tr></table>',
    'spreadsheetHtml: a list of lists becomes rows, with text escaped');
  assert(spreadsheetHtml(Integer(5n)) === '', 'spreadsheetHtml: other values have no table');
}

{
  assert(fileVariableName('sales 2025.csv') === 'sales_2025' && fileVariableName('2025.csv') === 'D2025'
    && fileVariableName('my-data.v2.tsv') === 'my_data_v2' && fileVariableName('SIN.csv') === 'SIN_',
    'fileVariableName: a file name becomes a variable name');
  assert(fileVariableName('.csv') === 'D' && fileVariableName('αβ.txt') === 'αβ', 'fileVariableName: an empty stem, and Greek letters');
}

{
  globalThis.FileReader = class {
    readAsText(file) {
      file.text().then((text) => { this.result = text; this.onload(); }, (error) => { this.error = error; this.onerror(); });
    }
  };
  const upload = (name, text) => readUpload(new File([text], name));
  try {
    const csv = await upload('Sales 2025.csv', 'month,units\n1,5\n2,7\n');
    assert(csv.name === 'Sales_2025' && formatSource(csv.value) === '[[ 1 5 ][ 2 7 ]]' && /Skipped the header row \(month, units\)/.test(csv.note),
      'readUpload: a CSV is a matrix named after the file, and the skipped header is reported');
    const tsv = await upload('grid.tsv', '1\t2\n3\t4');
    assert(formatSource(tsv.value) === '[[ 1 2 ][ 3 4 ]]' && tsv.note === '', 'readUpload: a TSV is a matrix');
    const txt = await upload('range.txt', '1\t2\n3\t4');
    assert(isMatrix(txt.value), 'readUpload: tab-separated numbers in a .txt file are a table');
    const words = await upload('words.txt', 'a\tb\nc\td');
    assert(isList(words.value) && formatSource(words.value) === '{ { "a" "b" } { "c" "d" } }', 'readUpload: tab-separated text in a .txt file is a list of rows');
    const program = await upload('PRG.rpl', '%%HP: T(3)A(R)F(.);\n\\<< 1 2 + \\>>');
    assert(formatSource(program.value) === '« 1 2 + »' && program.name === 'PRG', 'readUpload: an HP text file is its object');
    const dir = await upload('LIB.rpl', 'DIR A 1 END');
    assert(isDirectory(dir.value), 'readUpload: a DIR file is a directory');
    const variable = await upload('x.json', JSON.stringify({ version: 1, kind: 'variable', name: 'Q', value: { type: 'integer', value: { __t: 'bigint', v: '7' } } }));
    assert(variable.name === 'Q' && variable.value.value === 7n, 'readUpload: an exported variable keeps its own name');
    let backup = null;
    try { await upload('hp50.json', JSON.stringify({ version: 1, home: {}, stack: [] })); } catch (e) { backup = e; }
    assert(backup && /full backup/.test(backup.message), 'readUpload: a full backup is pointed at Restore from file');
    let broken = null;
    try { await upload('words.rpl', 'a\tb\nc\td'); } catch (e) { broken = e; }
    assert(broken && /Expected one object/.test(broken.message), 'readUpload: an .rpl file is never read as a table');
    assert(isVector((await upload('row.csv', '1,2,3')).value), 'readUpload: one CSV row is a vector');
  } finally {
    delete globalThis.FileReader;
  }
}

{
  const m = Matrix([[Integer(1n), Real(2.5)], [Rational(1n, 3n), Complex(1, -2)]]);
  const rows = xlsxRows(m);
  assert(JSON.stringify(rows) === JSON.stringify([[{ text: '1', number: true }, { text: '2.5', number: true }],
    [{ text: '0.333333333333', number: true }, { text: '1-2i', number: false }]]),
    'xlsxRows: integers, reals and rationals are numbers, a complex number is text');
  assert(xlsxRows(Integer(5n)) === null && xlsxRows(RList([])) === null, 'xlsxRows: other values are not tables');
  assert(JSON.stringify(xlsxRows(RList([Str('a'), Name('X'), Integer(2n)]))) === JSON.stringify([[
    { text: 'a', number: false }, { text: 'X', number: false }, { text: '2', number: true }]]),
    'xlsxRows: a list is one row of numbers and text');
  const formats = (v) => downloadFormats(v).map(([format]) => format).join(' ');
  assert(formats(m) === 'json rpl csv tsv xlsx' && formats(Vector([Integer(1n)])) === 'json rpl csv tsv xlsx' && formats(RList([Integer(1n)])) === 'json rpl csv tsv xlsx'
    && formats(Integer(5n)) === 'json rpl' && formats(Str('x')) === 'json rpl',
    'downloadFormats: a table adds CSV, TSV and Excel to the .json and .rpl every value has');
  const upload = (name, bytes) => readUpload(new File([bytes], name));
  const sheet = await upload('grid.xlsx', buildXlsx(xlsxRows(Matrix([[Integer(1n), Real(2.5)], [Integer(-3n), Real(0.125)]]))));
  assert(sheet.name === 'grid' && formatSource(sheet.value) === '[[ 1 2.5 ][ -3 0.125 ]]' && sheet.note === '',
    'readUpload: a workbook this app wrote reads back as the same matrix, named after the file');
  const openpyxl = await upload('Sales Q1.xlsx', readFileSync(new URL('./fixtures/openpyxl.xlsx', import.meta.url)));
  assert(openpyxl.name === 'Sales_Q1' && formatSource(openpyxl.value) === '{ { "name" "qty" "price" } { "apple" 3 1.25 } { "pear" 5 0.5 } }'
    && openpyxl.note === 'Read the first of 2 sheets, Data.',
    'readUpload: a workbook with text is a list of rows, and the note says only its first sheet was read');
  const inline = await upload('xy.xlsx', readFileSync(new URL('./fixtures/inline.xlsx', import.meta.url)));
  assert(formatSource(inline.value) === '[[ 1 2 ][ 3 4 ]]' && inline.note === 'Skipped the header row (x, y).', 'readUpload: a text row above numbers in a workbook is a header');
  let bad = null;
  try { await upload('notes.xlsx', new TextEncoder().encode('this is not a workbook, only some text in a file')); } catch (e) { bad = e; }
  assert(bad && /not an \.xlsx file/.test(bad.message), 'readUpload: a file that is not a workbook is refused');
  assert(formatSource(importCells([['1', '2'], ['3']]).value) === '[[ 1 2 ][ 3 0 ]]', 'importCells: rows of different lengths are padded');
  assert(spreadsheetToSource('1\t2\n'.repeat(300000)) === null, 'spreadsheetToSource: a column far taller than the cell limit stays text, without overflowing the stack');
  assertThrows(() => importTable('1,2\n'.repeat(300000)), /more than 100000 cells/, 'importTable: a file far taller than the cell limit is refused with a message');
}

{
  const excel = (rows) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=Generator content="Microsoft Excel 15"><style><!--table {mso-displayed-decimal-separator:"\.";} .xl65 {mso-number-format:Fixed;}--></style></head><body><table border=0 cellpadding=0 cellspacing=0 width=64 style='border-collapse:collapse;width:48pt'><!--StartFragment--><col width=64 style='width:48pt'>${rows}<!--EndFragment--></table></body></html>`;
  const cell = (value, attributes = 'x:num') => `<tr height=20 style='height:15.0pt'><td height=20 class=xl65 align=right style='height:15.0pt' ${attributes}>${value}</td></tr>`;
  assert(htmlTableToSource(excel(cell('1') + cell('2.5') + cell('3.14', 'x:num="3.1415926535897931"'))) === '[[ 1 ][ 2.5 ][ 3.1415926535897931 ]]',
    'htmlTableToSource: one column from Excel is a column matrix, with each number at the exact value Excel keeps beside its text');
  assert(htmlTableToSource(excel(cell('7'))) === null && htmlTableToSource(excel(cell('a', 'x:str') + cell('b', 'x:str'))) === null,
    'htmlTableToSource: one cell, or a column with text, is left to the plain text paste');
  assert(htmlTableToSource(excel(cell('1', '') + cell('') + cell('&nbsp;') + cell('$1,234.50') + cell('12%'))) === '[[ 1 ][ 0 ][ 0 ][ 1234.50 ][ 12E-2 ]]',
    'htmlTableToSource: blank cells are 0 and currency and percentages are read as in a pasted range');
  assert(htmlTableToSource('<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>') === '[[ 1 2 ][ 3 4 ]]'
    && htmlTableToSource('<TABLE><TR><TD>1</TD><TD>2</TD><TD>3</TD></TR></TABLE>') === '[ 1 2 3 ]',
    'htmlTableToSource: a range is a matrix and a single row a vector, whatever the tag case');
  assert(htmlTableToSource('<table><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></table>') === null
    && htmlTableToSource('<p>1</p><p>2</p>') === null && htmlTableToSource('') === null && htmlTableToSource(undefined) === null,
    'htmlTableToSource: ragged rows, text without a table and nothing at all are left alone');
  assert(htmlTableToSource('<table><tr><td><span style="color:red">4</span></td></tr><tr><td>1&nbsp;000</td></tr><tr><td>&#53;</td></tr></table>') === '[[ 4 ][ 1000 ][ 5 ]]',
    'htmlTableToSource: markup inside a cell, a non-breaking thousands space and numeric entities are read');
  assert(htmlTableToSource('<!--[if gte mso 9]><table><tr><td>9</td><td>9</td></tr></table><![endif]--><style>table td { color: red }</style><table><tr><td>1</td></tr><tr><td>2</td></tr></table>') === '[[ 1 ][ 2 ]]',
    'htmlTableToSource: comments and style blocks are not tables');
  const sheets = `<meta charset='utf-8'><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #ccc;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1"><colgroup><col width="100"/></colgroup><tbody><tr style="height:21px;"><td style="text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:3.14159265358979}" data-sheets-formula="=IF(A1>2,PI(),0)">3.14</td></tr><tr style="height:21px;"><td style="text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:42}">42</td></tr></tbody></table>`;
  assert(htmlTableToSource(sheets) === '[[ 3.14159265358979 ][ 42 ]]', 'htmlTableToSource: Google Sheets keeps exact numbers in data-sheets-value, and a > inside an attribute does not end the tag');
  const calc = '<table cellspacing="0" border="0"><colgroup width="85"></colgroup><tr><td align="right" sdval="0.333333333333333" sdnum="1033;0;0.00">0.33</td></tr><tr><td align="right" sdval="7" sdnum="1033;">7</td></tr></table>';
  assert(htmlTableToSource(calc) === '[[ 0.333333333333333 ][ 7 ]]', 'htmlTableToSource: LibreOffice Calc keeps exact numbers in sdval');
  assert(htmlTableToSource(`<table>${'<tr><td>1</td></tr>'.repeat(SHEET_MAX_CELLS + 1)}</table>`) === null,
    'htmlTableToSource: a table past the cell limit stays text');
  assert(htmlTableToText(excel(cell('1') + cell('2.5') + cell('3.14', 'x:num="3.1415926535897931"'))) === '1\n2.5\n3.1415926535897931'
    && htmlTableToText('<table><tr><td>a</td><td x:num="2.50">2.5</td></tr><tr><td>b</td><td>3</td></tr></table>') === 'a\t2.50\nb\t3'
    && htmlTableToText('<p>no table</p>') === null && htmlTableToText('') === null,
    'htmlTableToText: a table as tab-separated text with the exact numbers, or null without one');
}
