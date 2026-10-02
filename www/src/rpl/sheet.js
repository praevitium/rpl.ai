/* Tables that move between rpl.ai and spreadsheets: a range pasted from Excel,
   Google Sheets or Numbers, a CSV or TSV file, an HTML table for the clipboard.
   A table of numbers is a matrix (a vector for one row); any other table is a
   list of rows. */

import { parseEntry } from './parser.js';
import { formatSource } from './formatter.js';
import {
  Decimal, isComplex, isInteger, isList, isMatrix, isRational, isReal, isString, isVector,
} from './types.js';

export const SHEET_MAX_CELLS = 100000;

const DELIMITERS = ['\t', ';', ','];
const GROUP_SPACE = /[ \u00A0\u202F']/g;

function detectDelimiter(text) {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim()).slice(0, 8);
  const count = (line, delimiter) => {
    let quoted = false;
    let n = 0;
    for (const c of line) {
      if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) n++;
    }
    return n;
  };
  return DELIMITERS.find((d) => lines.length && lines.every((line) => count(line, d) > 0)) ?? ',';
}

// RFC 4180 rows of cells; blank lines are skipped.
export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delimiter) {
      endCell();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

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

const quoteText = (text) => `"${text.replace(/[\\"]/g, '\\$&')}"`;

const vectorSource = (items) => `[ ${items.join(' ')} ]`;

function numericSource(numbers) {
  return numbers.length === 1 ? vectorSource(numbers[0]) : `[${numbers.map(vectorSource).join('')}]`;
}

function listSource(cells) {
  const row = (r) => `{ ${r.map((c) => sheetNumber(c) ?? quoteText(c)).join(' ')} }`;
  return `{ ${cells.map(row).join(' ')} }`;
}

// A range copied from Excel, Google Sheets or Numbers arrives as tab-separated
// rows. An all-number range becomes a matrix, or a vector when it is one row;
// anything else is left as typed text, since a tab may just indent a program.
export function spreadsheetToSource(text) {
  const rows = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
  if (!rows.some((row) => row.length > 1)) return null;
  const cols = rows.reduce((w, row) => Math.max(w, row.length), 0);
  if (rows.length * cols > SHEET_MAX_CELLS) return null;
  const numbers = rows.map((row) => Array.from({ length: cols }, (_, c) => blankToZero(row[c] ?? '')));
  return numbers.some((row) => row.includes(null)) ? null : numericSource(numbers);
}

// A first row of text over rows of numbers is a header, not data.
function headerRow(cells) {
  const isText = (c) => c !== '' && sheetNumber(c) === null;
  const isNumber = (c) => c === '' || sheetNumber(c) !== null;
  if (cells.length < 2 || !cells[0].every(isText)) return null;
  return cells.slice(1).every((row) => row.every(isNumber)) ? cells[0] : null;
}

// The contents of a CSV or TSV file: a matrix, or a list of rows when a cell
// holds text. A header row over numbers is skipped and returned.
export function importTable(text, delimiter) {
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) throw new Error('the file has no data');
  const width = rows.reduce((w, row) => Math.max(w, row.length), 0);
  if (rows.length * width > SHEET_MAX_CELLS) throw new Error(`more than ${SHEET_MAX_CELLS} cells`);
  const cells = rows.map((row) => Array.from({ length: width }, (_, c) => (row[c] ?? '').trim()));
  const header = headerRow(cells);
  const body = header ? cells.slice(1) : cells;
  const numbers = body.map((row) => row.map(blankToZero));
  const source = numbers.some((row) => row.includes(null)) ? listSource(body) : numericSource(numbers);
  return { value: parseEntry(source)[0], header };
}

function tableRows(value) {
  if (isMatrix(value)) return value.rows;
  if (isVector(value)) return [value.items];
  if (!isList(value)) return null;
  const rows = value.items.length && value.items.every(isList) ? value.items.map((row) => row.items) : [value.items];
  return rows.some((row) => row.length) ? rows : null;
}

export const isTable = (value) => tableRows(value) !== null;

function sheetCell(v) {
  if (isInteger(v) || isReal(v)) return v.value.toString();
  if (isRational(v)) return new Decimal(v.n.toString()).div(v.d.toString()).toSignificantDigits(12).toString();
  if (isComplex(v)) return `${v.re}${v.im < 0 ? '-' : '+'}${Math.abs(v.im)}i`;
  if (isString(v)) return v.value;
  return formatSource(v).replace(/^`(.*)`$/, '$1');
}

// CSV or TSV text of a matrix, vector or list, or null for any other value.
export function formatDelimited(value, delimiter = ',') {
  const rows = tableRows(value);
  if (!rows) return null;
  const field = (v) => {
    const cell = sheetCell(v);
    return cell.includes(delimiter) || /["\r\n]/.test(cell) || cell !== cell.trim() ? `"${cell.replace(/"/g, '""')}"` : cell;
  };
  const text = `${rows.map((row) => row.map(field).join(delimiter)).join('\n')}\n`;
  return /[^\x00-\x7F]/.test(text) ? `\uFEFF${text}` : text;
}

// Spreadsheets take an HTML table from the clipboard as cells.
export function spreadsheetHtml(value) {
  const rows = tableRows(value);
  if (!rows) return '';
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = rows.map((row) => `<tr>${row.map((v) => `<td>${escape(sheetCell(v))}</td>`).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}
