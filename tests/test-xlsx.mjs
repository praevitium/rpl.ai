import { readFileSync } from 'node:fs';
import { buildXlsx, readXlsx } from '../www/src/rpl/xlsx.js';
import { assert, assertThrows } from './helpers.mjs';

/* openpyxl.xlsx (openpyxl 3.1), xlsxwriter.xlsx and inline.xlsx (XlsxWriter 3.2,
   the last in constant_memory mode, which writes inline strings) are real
   workbooks in fixtures/: deflated zips with shared strings, styles and themes. */
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const cell = (text, number = false) => ({ text, number });

async function rejects(promise, pattern, msg) {
  try { await promise; assert(false, msg); } catch (e) { assert(pattern.test(e.message), msg); }
}
const text = (rows) => rows.map((row) => row.map((c) => c.text));

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// A zip of the given parts, deflated or stored; the reader does not check CRCs, so they are left 0.
async function makeZip(parts, { deflate = false } = {}) {
  const encoder = new TextEncoder();
  const entries = [];
  for (const [name, content] of Object.entries(parts)) {
    const raw = encoder.encode(content);
    entries.push({ name: encoder.encode(name), raw, data: deflate ? await deflateRaw(raw) : raw });
  }
  const out = new Uint8Array(entries.reduce((n, e) => n + 76 + 2 * e.name.length + e.data.length, 22));
  const view = new DataView(out.buffer);
  const offsets = [];
  let at = 0;
  for (const e of entries) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 8, deflate ? 8 : 0, true);
    view.setUint32(at + 18, e.data.length, true);
    view.setUint32(at + 22, e.raw.length, true);
    view.setUint16(at + 26, e.name.length, true);
    out.set(e.name, at + 30);
    out.set(e.data, at + 30 + e.name.length);
    at += 30 + e.name.length + e.data.length;
  }
  const directory = at;
  entries.forEach((e, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 10, deflate ? 8 : 0, true);
    view.setUint32(at + 20, e.data.length, true);
    view.setUint32(at + 24, e.raw.length, true);
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

const SHEET = (rows) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;
const WORKBOOK = (names = ['Sheet1']) => `<workbook xmlns:r="x"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
const RELS = (targets = ['worksheets/sheet1.xml']) => `<Relationships>${targets.map((t, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="${t}"/>`).join('')}</Relationships>`;
const book = (sheet, extra = {}) => ({ 'xl/workbook.xml': WORKBOOK(), 'xl/_rels/workbook.xml.rels': RELS(), 'xl/worksheets/sheet1.xml': sheet, ...extra });

{
  const rows = [[cell('1', true), cell('2.5', true), cell('hello & <b> "q"')], [cell('-3e-7', true), cell('  padded  '), cell('line\nbreak')]];
  const bytes = buildXlsx(rows, 'My [data]: sheet?');
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4, 'buildXlsx: a zip that starts with a local file header');
  const back = await readXlsx(bytes);
  assert(JSON.stringify(back.rows) === JSON.stringify(text(rows)) && back.sheet === 'My data sheet' && back.sheets === 1,
    'buildXlsx: cells read back, with the sheet name stripped of the characters Excel forbids');
  const zipText = new TextDecoder().decode(bytes);
  assert(zipText.includes('<c r="A1"><v>1</v></c>') && zipText.includes('<c r="B2" t="inlineStr"><is><t xml:space="preserve">  padded  </t></is></c>')
    && zipText.includes('<dimension ref="A1:C2"/>'),
    'buildXlsx: a number is a numeric cell, text is an inline string that keeps its spaces, and the dimension is written');
  assert(zipText.includes('hello &amp; &lt;b&gt; "q"'), 'buildXlsx: text is escaped for XML');
}

{
  const wide = [Array.from({ length: 30 }, (_, i) => cell(String(i), true))];
  const bytes = buildXlsx(wide);
  const zipText = new TextDecoder().decode(bytes);
  assert(zipText.includes('<c r="Z1">') && zipText.includes('<c r="AA1">') && zipText.includes('<c r="AD1">') && zipText.includes('<dimension ref="A1:AD1"/>'),
    'buildXlsx: columns past Z are AA, AB, …');
  assert(JSON.stringify((await readXlsx(bytes)).rows) === JSON.stringify([wide[0].map((c) => c.text)]), 'buildXlsx: a 30-column row reads back');
  const odd = await readXlsx(buildXlsx([[cell('Infinity', true), cell('1e+21', true), cell('x\x01y')]]));
  assert(JSON.stringify(odd.rows) === JSON.stringify([['Infinity', '1e+21', 'xy']]),
    'buildXlsx: a number that is not finite is written as text, and control characters are dropped');
  assert((await readXlsx(buildXlsx([[]]))).rows.length === 0, 'buildXlsx: an empty sheet has no cells');
  assertThrows(() => buildXlsx(Array.from({ length: 1048577 }, () => [])), /1,048,576 rows/, 'buildXlsx: more rows than Excel holds is rejected');
}

{
  const openpyxl = await readXlsx(fixture('openpyxl.xlsx'));
  assert(JSON.stringify(openpyxl.rows) === '[["name","qty","price"],["apple","3","1.25"],["pear","5","0.5"]]' && openpyxl.sheet === 'Data' && openpyxl.sheets === 2,
    'readXlsx: an openpyxl workbook (deflated, shared strings) reads its first sheet and counts two');
  const writer = await readXlsx(fixture('xlsxwriter.xlsx'));
  assert(JSON.stringify(writer.rows) === JSON.stringify([
    ['label', 'value', 'flag'],
    ['a & b <c>', '1234.5', 'TRUE'],
    ['two\nlines', '-0.000125', 'FALSE'],
    ['héllo Ω', '2469', '1E+21'],
    ['45659', '0.25', ''],
    ['bold plain', '', ''],
  ]) && writer.sheet === 'Mixed',
    'readXlsx: an XlsxWriter workbook: data from C3 is trimmed to the used range; entities, newlines, booleans, a formula result, a date serial and rich text read');
  const inline = await readXlsx(fixture('inline.xlsx'));
  assert(JSON.stringify(inline.rows) === '[["x","y"],["1","2"],["3","4"]]', 'readXlsx: inline strings read');
}

{
  const cells = '<row r="2"><c r="B2" t="s"><v>0</v></c><c r="D2"><v>1.5E-3</v></c></row><row r="5"><c r="C5" t="b"><v>1</v></c><c r="D5" t="e"><v>#DIV/0!</v></c><c r="E5" s="3"/></row>';
  const shared = '<sst><si><t>one</t></si><si><r><t>two</t></r><r><t> parts</t></r><rPh sb="0" eb="1"><t>ignored</t></rPh></si></sst>';
  for (const deflate of [false, true]) {
    const label = deflate ? 'deflated' : 'stored';
    const read = await readXlsx(await makeZip(book(SHEET(cells), { 'xl/sharedStrings.xml': shared }), { deflate }));
    assert(JSON.stringify(read.rows) === JSON.stringify([['one', '', '1.5E-3'], ['', '', ''], ['', '', ''], ['', 'TRUE', '#DIV/0!']]),
      `readXlsx: a ${label} sheet with skipped rows and columns is read from B2, with a boolean and an error`);
  }
  const rich = await readXlsx(await makeZip(book(SHEET('<row><c t="s"><v>1</v></c><c t="inlineStr"><is><t>a &amp; b</t></is></c></row><row><c><v>7</v></c></row>'), { 'xl/sharedStrings.xml': shared })));
  assert(JSON.stringify(rich.rows) === JSON.stringify([['two parts', 'a & b'], ['7', '']]),
    'readXlsx: without cell references the cells follow in order, rich text joins and phonetic runs are dropped');
  const absolute = await readXlsx(await makeZip({
    'xl/workbook.xml': WORKBOOK(['A', 'B']), 'xl/_rels/workbook.xml.rels': RELS(['/xl/worksheets/sheet2.xml', 'worksheets/sheet1.xml']),
    'xl/worksheets/sheet1.xml': SHEET('<row><c><v>1</v></c></row>'), 'xl/worksheets/sheet2.xml': SHEET('<row><c><v>2</v></c></row>'),
  }));
  assert(JSON.stringify(absolute.rows) === '[["2"]]' && absolute.sheet === 'A' && absolute.sheets === 2,
    'readXlsx: the first sheet of the workbook is the one its relationship names, even by an absolute path');
  const bare = await readXlsx(await makeZip({ 'xl/worksheets/sheet1.xml': SHEET('<row><c><v>4</v></c></row>'), 'xl/worksheets/sheet10.xml': SHEET('<row><c><v>5</v></c></row>') }));
  assert(JSON.stringify(bare.rows) === '[["4"]]', 'readXlsx: with no workbook part the lowest-numbered sheet is read');
  const empty = await readXlsx(await makeZip(book(SHEET('<row r="1"/><row r="2"><c r="A2"/></row>'))));
  assert(empty.rows.length === 0, 'readXlsx: a sheet without values has no rows');
}

{
  await rejects(readXlsx(new Uint8Array(10)), /not an \.xlsx file/, 'readXlsx: too short to be a zip');
  await rejects(readXlsx(new TextEncoder().encode('just some text, not a workbook at all, definitely')), /not an \.xlsx file/, 'readXlsx: text is not a workbook');
  await rejects(makeZip({ 'readme.txt': 'hi' }).then(readXlsx), /no worksheet/, 'readXlsx: a zip without a worksheet is rejected');
  const sparse = await makeZip(book(SHEET('<row><c r="A1"><v>1</v></c><c r="C9"><v>2</v></c></row>')));
  await rejects(readXlsx(sparse, { maxCells: 10 }), /more than 10 cells/, 'readXlsx: a sparse sheet spanning too many cells is rejected');
}
