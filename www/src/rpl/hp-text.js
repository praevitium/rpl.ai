/* HP text transfer files (`%%HP: T(3)A(R)F(.);`): algebraics are quoted
   with apostrophes there but backticks here, T(3) spells glyphs as
   backslash codes, and `@` starts a comment. */

import { parseEntry } from './parser.js';
import { formatSource } from './formatter.js';
import { RPLError } from './stack.js';
import {
  Directory, isDirectory, isName, isStorableHpName,
  isComplex, isInteger, isMatrix, isRational, isReal, isVector,
} from './types.js';

export const HP_TEXT_HEADER = '%%HP: T(3)A(R)F(.);';

const T3_CODES = Object.freeze([
  ['\\<<', '«'], ['\\>>', '»'], ['\\->', '→'], ['\\<-', '←'],
  ['\\|v', '↓'], ['\\|^', '↑'], ['\\v/', '√'], ['\\.d', '∂'], ['\\.S', '∫'],
  ['\\GS', 'Σ'], ['\\GP', 'Π'], ['\\GD', 'Δ'], ['\\pi', 'π'], ['\\<)', '∠'],
  ['\\=/', '≠'], ['\\<=', '≤'], ['\\>=', '≥'], ['\\oo', '∞'], ['\\^o', '°'],
  ['\\Ga', 'α'], ['\\Gb', 'β'], ['\\Gd', 'δ'], ['\\Ge', 'ε'], ['\\Gl', 'λ'],
  ['\\Gm', 'μ'], ['\\Gr', 'ρ'], ['\\Gs', 'σ'], ['\\Gt', 'τ'], ['\\Gw', 'ω'],
  ['\\GW', 'Ω'],
]);

function mapOutsideStrings(src, mapChar) {
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < src.length) out += src[++i];
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    const mapped = mapChar(c, src, i);
    out += mapped.text;
    i = mapped.next - 1;
  }
  return out;
}

export function hpCodesToGlyphs(src) {
  for (const [code, glyph] of T3_CODES) src = src.split(code).join(glyph);
  return src;
}

export function hpTextToSource(text) {
  const src = hpCodesToGlyphs(String(text).replace(/^\uFEFF/, '').replace(/^\s*%%HP:[^;]*;/, ''));
  return mapOutsideStrings(src, (c, s, i) => {
    if (c === "'") return { text: '`', next: i + 1 };
    if (c !== '@') return { text: c, next: i + 1 };
    let j = i + 1;
    while (j < s.length && s[j] !== '@' && s[j] !== '\n') j++;
    return { text: ' ', next: s[j] === '@' ? j + 1 : j };
  });
}

function sourceToHpText(src) {
  let out = mapOutsideStrings(src, (c, _s, i) => ({ text: c === '`' ? "'" : c, next: i + 1 }));
  for (const [code, glyph] of T3_CODES) out = out.split(glyph).join(code);
  return out;
}

const isWord = (v, word) => isName(v) && !v.quoted && v.id.toUpperCase() === word;

function readDirectory(items, at, name) {
  const dir = Directory({ name });
  let i = at;
  while (i < items.length && !isWord(items[i], 'END')) {
    const key = items[i];
    if (!isName(key) || key.quoted || !isStorableHpName(key.id)) {
      throw new RPLError('DIR: expected a variable name');
    }
    if (i + 1 >= items.length) throw new RPLError(`DIR: missing value for ${key.id}`);
    if (isWord(items[i + 1], 'DIR')) {
      const [child, next] = readDirectory(items, i + 2, key.id);
      child.parent = dir;
      dir.entries.set(key.id, child);
      i = next;
    } else {
      dir.entries.set(key.id, items[i + 1]);
      i += 2;
    }
  }
  if (i >= items.length) throw new RPLError('DIR: missing END');
  return [dir, i + 1];
}

export function parseHpText(text, name) {
  const items = parseEntry(hpTextToSource(text));
  if (items.length === 0) throw new RPLError('Empty file');
  if (isWord(items[0], 'DIR')) {
    const [dir, next] = readDirectory(items, 1, name);
    if (next !== items.length) throw new RPLError('Text after END');
    return dir;
  }
  if (items.length !== 1) throw new RPLError(`Expected one object, found ${items.length}`);
  return items[0];
}

function formatDirectoryBody(dir, indent) {
  const lines = ['DIR'];
  for (const [key, value] of dir.entries) {
    const body = isDirectory(value) ? formatDirectoryBody(value, `${indent}  `) : formatSource(value);
    lines.push(`${indent}  ${key} ${body}`);
  }
  lines.push(`${indent}END`);
  return lines.join('\n');
}

export function formatHpText(value) {
  const body = isDirectory(value) ? formatDirectoryBody(value, '') : formatSource(value);
  return `${HP_TEXT_HEADER}\n${sourceToHpText(body)}\n`;
}

const SHEET_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?$/;
const SHEET_MAX_CELLS = 100000;

// A range copied from Excel, Google Sheets or Numbers arrives as tab-separated
// rows. An all-number range becomes a matrix, or a vector when it is one row;
// anything else is left as typed text.
export function spreadsheetToSource(text) {
  const rows = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
  if (!rows.some((row) => row.length > 1)) return null;
  const cols = Math.max(...rows.map((row) => row.length));
  if (rows.length * cols > SHEET_MAX_CELLS) return null;
  const cells = rows.map((row) => Array.from({ length: cols }, (_, c) => sheetNumber(row[c] ?? '')));
  if (cells.some((row) => row.includes(null))) return null;
  const vector = (row) => `[ ${row.join(' ')} ]`;
  return cells.length === 1 ? vector(cells[0]) : `[${cells.map(vector).join('')}]`;
}

function sheetNumber(cell) {
  let t = cell.trim().replace(/^\+/, '').toUpperCase();
  if (!t) return '0';
  if (/^-?\d{1,3}(,\d{3})+(\.\d*)?%?$/.test(t)) t = t.replace(/,/g, '');
  const percent = t.endsWith('%');
  if (percent) t = t.slice(0, -1);
  if (!SHEET_NUMBER.test(t)) return null;
  if (!percent) return t;
  const [mantissa, exponent = '0'] = t.split('E');
  return `${mantissa}E${Number(exponent) - 2}`;
}

// Spreadsheets take an HTML table from the clipboard as cells.
export function spreadsheetHtml(value) {
  const rows = isMatrix(value) ? value.rows : isVector(value) ? [value.items] : null;
  if (!rows) return '';
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = rows.map((row) => `<tr>${row.map((v) => `<td>${escape(sheetCell(v))}</td>`).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}

function sheetCell(v) {
  if (isInteger(v) || isReal(v)) return v.value.toString();
  if (isRational(v)) return String(Number(v.n) / Number(v.d));
  if (isComplex(v)) return `${v.re}${v.im < 0 ? '-' : '+'}${Math.abs(v.im)}i`;
  return formatSource(v).replace(/^`(.*)`$/, '$1');
}
