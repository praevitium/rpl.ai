/* Excel workbooks without a library.  buildXlsx writes one worksheet as a
   stored zip; readXlsx reads the first worksheet of any workbook: stored or
   deflated zip entries, shared or inline strings.  Only the parts of the
   SpreadsheetML that hold cell values are looked at. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const MAX_UNZIPPED = 64 * 1024 * 1024;
const MAX_ROWS = 1048576;
const MAX_COLS = 16384;
const DOS_DATE_1980 = 0x0021;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  const entries = files.map(([name, text]) => {
    const data = encoder.encode(text);
    return { name: encoder.encode(name), data, crc: crc32(data) };
  });
  const size = entries.reduce((n, e) => n + 76 + 2 * e.name.length + e.data.length, 22);
  if (size >= 0xFFFFFFFF) throw new Error('the workbook is too large');
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const offsets = [];
  let at = 0;
  for (const e of entries) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 0x0800, true);
    view.setUint16(at + 12, DOS_DATE_1980, true);
    view.setUint32(at + 14, e.crc, true);
    view.setUint32(at + 18, e.data.length, true);
    view.setUint32(at + 22, e.data.length, true);
    view.setUint16(at + 26, e.name.length, true);
    out.set(e.name, at + 30);
    out.set(e.data, at + 30 + e.name.length);
    at += 30 + e.name.length + e.data.length;
  }
  const directory = at;
  entries.forEach((e, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 14, DOS_DATE_1980, true);
    view.setUint32(at + 16, e.crc, true);
    view.setUint32(at + 20, e.data.length, true);
    view.setUint32(at + 24, e.data.length, true);
    view.setUint16(at + 28, e.name.length, true);
    view.setUint32(at + 42, offsets[i], true);
    out.set(e.name, at + 46);
    at += 46 + e.name.length;
  });
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - directory, true);
  view.setUint32(at + 16, directory, true);
  return out;
}

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function columnIndex(ref) {
  let n = 0;
  for (const c of /^[A-Za-z]+/.exec(ref)?.[0] ?? '') n = n * 26 + c.toUpperCase().charCodeAt(0) - 64;
  return n - 1;
}

const escapeXml = (text) => text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cellXml({ text, number }, ref) {
  if (number && NUMBER.test(text)) return `<c r="${ref}"><v>${text}</v></c>`;
  const keep = text !== text.trim() || /[\r\n]/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"><is><t${keep}>${escapeXml(text)}</t></is></c>`;
}

// rows are arrays of { text, number }; a number is written as one, any other cell as text.
export function buildXlsx(rows, sheetName = 'Sheet1') {
  const cols = rows.reduce((w, row) => Math.max(w, row.length), 0);
  if (rows.length > MAX_ROWS || cols > MAX_COLS) throw new Error('Excel sheets hold at most 1,048,576 rows and 16,384 columns');
  const name = sheetName.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
  const sheetData = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`)).join('')}</row>`).join('');
  const last = `${columnName(Math.max(cols, 1) - 1)}${Math.max(rows.length, 1)}`;
  return zip([
    ['[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${SHEET_MIME}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${SHEET_MIME}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${SHEET_MIME}.styles+xml"/></Types>`],
    ['_rels/.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="${escapeXml(name).replace(/"/g, '&quot;')}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><dimension ref="A1:${last}"/><sheetData>${sheetData}</sheetData></worksheet>`],
  ]);
}

function readZip(bytes) {
  if (bytes.length < 22) throw new Error('not an .xlsx file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const floor = Math.max(0, bytes.length - 22 - 0xFFFF);
  let end = bytes.length - 22;
  while (end >= floor && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < floor) throw new Error('not an .xlsx file');
  const count = view.getUint16(end + 10, true);
  if (count === 0xFFFF) throw new Error('zip64 workbooks are not supported');
  const files = new Map();
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('the zip directory is damaged');
    const nameLength = view.getUint16(at + 28, true);
    files.set(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: view.getUint16(at + 10, true),
      compressed: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      local: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return files;
}

async function inflate(data) {
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UNZIPPED) { reader.cancel(); throw new Error('the workbook is too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

async function extract(bytes, { method, compressed, size, local }) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + compressed);
  if (method === 0) return data;
  if (method !== 8) throw new Error('the workbook uses an unsupported zip compression');
  if (size > MAX_UNZIPPED) throw new Error('the workbook is too large');
  return inflate(data);
}

const decodeXml = (text) => text
  .replace(/&(lt|gt|amp|quot|apos);/g, (_, name) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[name])
  .replace(/&#(x[0-9a-fA-F]+|\d+);/g, (_, code) => String.fromCodePoint(code[0] === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function attributes(tag) {
  const found = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) found[m[1]] = decodeXml(m[2] ?? m[3]);
  return found;
}

// The text of <si> and <is> elements: every <t>, except the phonetic runs.
function textOf(xml) {
  let text = '';
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeXml(m[1]);
  return text;
}

function sharedStrings(xml) {
  return xml ? [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? '')) : [];
}

function cellText(type, inner, shared) {
  if (type === 'inlineStr') return textOf(inner);
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (raw === undefined) return '';
  const value = decodeXml(raw);
  if (type === 's') return shared[Number(value)] ?? '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  return value;
}

function sheetCells(xml, shared) {
  const cells = [];
  let nextRow = 0;
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowRef = attributes(row[1]).r;
    const rowIndex = rowRef ? Number(rowRef) - 1 : nextRow;
    nextRow = rowIndex + 1;
    let c = -1;
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const { r: ref, t } = attributes(cell[1]);
      const at = ref ? /^([A-Za-z]+)(\d+)$/.exec(ref) : null;
      c = at ? columnIndex(at[1]) : c + 1;
      const text = cellText(t, cell[2] ?? '', shared);
      if (text !== '') cells.push([at ? Number(at[2]) - 1 : rowIndex, c, text]);
    }
  }
  return cells;
}

async function firstSheet(files, read) {
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const sheets = [...(workbook ?? '').matchAll(/<sheet\b[^>]*>/g)].map((m) => attributes(m[0]));
  const target = [...(rels ?? '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => attributes(m[0])).find((rel) => rel.Id === sheets[0]?.['r:id'])?.Target;
  const path = target && (target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  if (path && files.has(path)) return { path, name: sheets[0].name, count: sheets.length };
  const guess = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!guess) throw new Error('the workbook has no worksheet');
  return { path: guess, name: sheets[0]?.name ?? 'Sheet1', count: Math.max(sheets.length, 1) };
}

// The used range of the first worksheet as rows of cell text, with its name and
// the number of sheets in the workbook.  Booleans read as TRUE and FALSE.
export async function readXlsx(input, { maxCells = Infinity } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const files = readZip(bytes);
  const read = async (name) => (files.has(name) ? decoder.decode(await extract(bytes, files.get(name))) : null);
  const sheet = await firstSheet(files, read);
  const cells = sheetCells(await read(sheet.path), sharedStrings(await read('xl/sharedStrings.xml')));
  if (!cells.length) return { rows: [], sheet: sheet.name, sheets: sheet.count };
  const box = cells.reduce((b, [r, c]) => ({ top: Math.min(b.top, r), left: Math.min(b.left, c), bottom: Math.max(b.bottom, r), right: Math.max(b.right, c) }),
    { top: Infinity, left: Infinity, bottom: -1, right: -1 });
  const { top, left } = box;
  const height = box.bottom - top + 1;
  const width = box.right - left + 1;
  if (height * width > maxCells) throw new Error(`more than ${maxCells} cells`);
  const rows = Array.from({ length: height }, () => new Array(width).fill(''));
  for (const [r, c, text] of cells) rows[r - top][c - left] = text;
  return { rows, sheet: sheet.name, sheets: sheet.count };
}
