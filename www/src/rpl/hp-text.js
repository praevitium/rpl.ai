/* HP text transfer format: the `%%HP: T(3)A(R)F(.);` source files the
   calculator and the Connectivity Kit exchange.  Algebraics are quoted
   with apostrophes there, while this app uses backticks; T(3) spells
   non-ASCII glyphs as backslash codes; `@` starts a comment. */

import { parseEntry } from './parser.js';
import { formatSource } from './formatter.js';
import { RPLError } from './stack.js';
import { Directory, isDirectory, isName, isStorableHpName } from './types.js';

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

export function hpTextToSource(text) {
  let src = String(text).replace(/^\uFEFF/, '').replace(/^\s*%%HP:[^;]*;/, '');
  for (const [code, glyph] of T3_CODES) src = src.split(code).join(glyph);
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

/** One object: a Directory when the text is `DIR … END`, otherwise the single value it holds. */
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
