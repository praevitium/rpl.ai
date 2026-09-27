/* Bundled-font glyph coverage: every character the calculator draws
   from IBM Plex resolves to a bundled @font-face whose unicode-range
   claims it and whose woff2 cmap actually has it. */

import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { assert } from './helpers.mjs';

const WWW = new URL('../www/', import.meta.url);
const CSS = new URL('css/', WWW);

const WOFF2_KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos.at++];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('bad UIntBase128');
}

function woff2CodePoints(url) {
  const buf = readFileSync(url);
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const pos = { at: 48 };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos.at++];
    const tag = (flags & 0x3f) === 63
      ? buf.toString('latin1', pos.at, (pos.at += 4))
      : WOFF2_KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const origLength = readBase128(buf, pos);
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? readBase128(buf, pos) : origLength });
  }
  const data = brotliDecompressSync(buf.subarray(pos.at, pos.at + compressedSize));
  let offset = 0;
  for (const t of tables) { t.offset = offset; offset += t.length; }
  const cmap = tables.find((t) => t.tag === 'cmap');
  return cmapCodePoints(data.subarray(cmap.offset, cmap.offset + cmap.length));
}

function cmapCodePoints(d) {
  const subtables = Array.from({ length: d.readUInt16BE(2) }, (_, i) => {
    const offset = d.readUInt32BE(8 + i * 8);
    return { offset, format: d.readUInt16BE(offset) };
  });
  const sub = subtables.find((s) => s.format === 12) ?? subtables.find((s) => s.format === 4);
  const points = new Set();
  if (sub.format === 12) {
    for (let g = 0, n = d.readUInt32BE(sub.offset + 12); g < n; g++) {
      const base = sub.offset + 16 + g * 12;
      const start = d.readUInt32BE(base);
      const firstGlyph = d.readUInt32BE(base + 8);
      for (let c = start; c <= d.readUInt32BE(base + 4); c++) if (firstGlyph + c - start) points.add(c);
    }
    return points;
  }
  const segX2 = d.readUInt16BE(sub.offset + 6);
  const ends = sub.offset + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const start = d.readUInt16BE(starts + s * 2);
    const delta = d.readInt16BE(deltas + s * 2);
    const rangeOffset = d.readUInt16BE(rangeOffsets + s * 2);
    for (let c = start; c <= d.readUInt16BE(ends + s * 2) && c !== 0xffff; c++) {
      let glyph = rangeOffset
        ? d.readUInt16BE(rangeOffsets + s * 2 + rangeOffset + (c - start) * 2)
        : c;
      if (glyph) glyph = (glyph + delta) & 0xffff;
      if (glyph) points.add(c);
    }
  }
  return points;
}

function parseUnicodeRange(text) {
  return text.split(',').map((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(lo, 16), parseInt(hi, 16)];
  });
}

function parseFontFaces(css) {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const prop = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    return {
      family: prop('font-family').replace(/"/g, ''),
      weights: prop('font-weight').split(/\s+/).map(Number),
      url: new URL(prop('src').match(/url\("([^"]+)"\)/)[1], CSS),
      ranges: parseUnicodeRange(prop('unicode-range')),
    };
  });
}

const faces = parseFontFaces(readFileSync(new URL('fonts.css', CSS), 'utf8'));
const cmaps = new Map();
const pointsOf = (face) => {
  const key = face.url.href;
  if (!cmaps.has(key)) cmaps.set(key, woff2CodePoints(face.url));
  return cmaps.get(key);
};

function faceFor(stack, weight, codePoint) {
  for (const family of stack) {
    const face = faces.find((f) => f.family === family
      && weight >= f.weights[0] && weight <= f.weights.at(-1)
      && f.ranges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi));
    if (face) return face;
  }
  return null;
}

const MONO_STACK = ['IBM Plex Mono', 'RPL Symbols', 'IBM Plex Sans'];
const SANS_STACK = ['IBM Plex Sans', 'RPL Symbols'];
const RPL_GLYPHS = '0123456789 AZaz.,:;#_«»→←↑↓↰↱∂∫Σ∑√∞≤≥≠πθαβγλμσωΩΔ∠±×÷°·−…';

for (const [name, stack] of [['mono', MONO_STACK], ['sans', SANS_STACK]]) {
  for (const weight of [400, 500, 600]) {
    const missing = [...RPL_GLYPHS].filter((ch) => {
      const cp = ch.codePointAt(0);
      const face = faceFor(stack, weight, cp);
      return !face || !pointsOf(face).has(cp);
    });
    assert(missing.length === 0,
      `fonts.css ${name} stack at weight ${weight} draws every RPL glyph from a bundled font${missing.length ? ` (missing ${missing.join(' ')})` : ''}`);
  }
}

for (const face of faces) {
  const points = pointsOf(face);
  const claimed = face.ranges.filter(([lo, hi]) => hi - lo < 256)
    .flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  const hollow = claimed.filter((cp) => !points.has(cp) && cp > 0x20 && ![0xa0, 0xad, 0xfeff].includes(cp));
  assert(hollow.length <= claimed.length * 0.05,
    `fonts.css: ${face.url.pathname.split('/').pop()} has glyphs for the unicode-range it claims`);
}
