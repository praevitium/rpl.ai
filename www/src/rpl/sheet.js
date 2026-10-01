/* Tables that move between rpl.ai and spreadsheets: a range pasted from Excel,
   Google Sheets or Numbers, and an HTML table for the clipboard. */

import { formatSource } from './formatter.js';
import {
  Decimal, isComplex, isInteger, isMatrix, isRational, isReal, isVector,
} from './types.js';

export const SHEET_MAX_CELLS = 100000;

const GROUP_SPACE = /[ \u00A0\u202F']/g;

// Digits with the thousands and decimal separators of any locale, as `123.45`.
function plainDecimal(m) {
  if (/^\d{1,3}(?:[ \u00A0\u202F']\d{3})+(?:[.,]\d+)?$/.test(m)) m = m.replace(GROUP_SPACE, '');
  const dots = m.split('.').length - 1;
  const commas = m.split(',').length - 1;
  let out = m;
  if (dots && commas) {
    const decimal = m.lastIndexOf('.') > m.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    const [whole, fraction, ...rest] = m.split(decimal);
    if (rest.length || !new RegExp(`^\\d{1,3}(?:\\${group}\\d{3})+$`).test(whole)) return null;
    out = `${whole.split(group).join('')}.${fraction}`;
  } else if (commas) {
    if (/^\d{1,3}(?:,\d{3})+$|^\d{1,2}(?:,\d{2})+,\d{3}$/.test(m)) out = m.replace(/,/g, '');
    else if (/^\d*,\d+$/.test(m)) out = m.replace(',', '.');
    else return null;
  } else if (dots > 1) {
    if (!/^\d{1,3}(?:\.\d{3})+$/.test(m)) return null;
    out = m.replace(/\./g, '');
  }
  return /^(?:\d+\.?\d*|\.\d+)$/.test(out) ? out : null;
}

// A spreadsheet cell as RPL number text, or null when it isn't a number.
// Reads currency, accounting negatives (300.00), percentages and the
// separators of any locale; a lone dash is the zero of an accounting format.
export function sheetNumber(cell) {
  let t = String(cell).trim().replace(/\u2212/g, '-').toUpperCase();
  if (/^[-–—]$/.test(t)) return '0';
  let negative = false;
  for (let prev = null; prev !== t;) {
    prev = t;
    const wrapped = /^\((.*)\)$/.exec(t);
    if (wrapped) { negative = true; t = wrapped[1].trim(); }
    t = t.replace(/^([-+]?)\s*(?:[$€£¥]\s*)?/, (_, sign) => { if (sign === '-') negative = true; return ''; })
      .replace(/(?:\s*[$€£¥])?(\s*-)?$/, (_, minus) => { if (minus) negative = true; return ''; });
  }
  const percent = t.endsWith('%');
  if (percent) t = t.slice(0, -1).trim();
  const parts = /^([^E]+)(?:E([-+]?\d+))?$/.exec(t);
  const plain = parts && plainDecimal(parts[1]);
  if (!plain) return null;
  const exponent = Number(parts[2] ?? 0) - (percent ? 2 : 0);
  return `${negative ? '-' : ''}${plain}${exponent ? `E${exponent}` : ''}`;
}

const blankToZero = (cell) => (cell.trim() === '' ? '0' : sheetNumber(cell));

const vectorSource = (items) => `[ ${items.join(' ')} ]`;

function numericSource(numbers) {
  return numbers.length === 1 ? vectorSource(numbers[0]) : `[${numbers.map(vectorSource).join('')}]`;
}

// A range copied from Excel, Google Sheets or Numbers arrives as tab-separated
// rows. An all-number range becomes a matrix, or a vector when it is one row;
// anything else is left as typed text, since a tab may just indent a program.
export function spreadsheetToSource(text) {
  const rows = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
  if (!rows.some((row) => row.length > 1)) return null;
  const cols = Math.max(...rows.map((row) => row.length));
  if (rows.length * cols > SHEET_MAX_CELLS) return null;
  const numbers = rows.map((row) => Array.from({ length: cols }, (_, c) => blankToZero(row[c] ?? '')));
  return numbers.some((row) => row.includes(null)) ? null : numericSource(numbers);
}

function tableRows(value) {
  if (isMatrix(value)) return value.rows;
  if (isVector(value)) return [value.items];
  return null;
}

function sheetCell(v) {
  if (isInteger(v) || isReal(v)) return v.value.toString();
  if (isRational(v)) return new Decimal(v.n.toString()).div(v.d.toString()).toSignificantDigits(12).toString();
  if (isComplex(v)) return `${v.re}${v.im < 0 ? '-' : '+'}${Math.abs(v.im)}i`;
  return formatSource(v).replace(/^`(.*)`$/, '$1');
}

// Spreadsheets take an HTML table from the clipboard as cells.
export function spreadsheetHtml(value) {
  const rows = tableRows(value);
  if (!rows) return '';
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = rows.map((row) => `<tr>${row.map((v) => `<td>${escape(sheetCell(v))}</td>`).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}
