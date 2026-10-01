import { sheetNumber, spreadsheetToSource, spreadsheetHtml } from '../www/src/rpl/sheet.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { formatSource } from '../www/src/rpl/formatter.js';
import { Matrix, Vector, Integer, Real, Rational, Complex } from '../www/src/rpl/types.js';
import { assert } from './helpers.mjs';

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
  const html = spreadsheetHtml(Matrix([[Integer(1n), Real(2.5)], [Rational(1n, 4n), Complex(1, -2)]]));
  assert(html === '<table><tr><td>1</td><td>2.5</td></tr><tr><td>0.25</td><td>1-2i</td></tr></table>',
    'spreadsheetHtml: a matrix becomes a table of spreadsheet numbers');
  assert(spreadsheetHtml(Vector([Integer(1n), Integer(2n)])) === '<table><tr><td>1</td><td>2</td></tr></table>',
    'spreadsheetHtml: a vector becomes one row');
  assert(spreadsheetHtml(Integer(5n)) === '', 'spreadsheetHtml: other values have no table');
}
