// The program interpreter, split out of internal.js a piece at a time. Here: the checks that turn INPUT, CHOOSE, WAIT
// and INFORM's arguments into the dialog a halted program shows.
import { isReal, isInteger, isString, isList, isName, Real } from '../types.js';
import { RPLError } from '../stack.js';

// INPUT's level 1 is the text to offer on the command line, alone or in a list that may add the HP's cursor position
// and entry modes; of those only V, which asks that the answer parse, means anything here.
// INPUT's command-line list: its string, a cursor position (n counts characters from the left of the first row,
// { row col } names the row; 0 is the end of the row, and a negative number asks for the HP's replace cursor,
// which the line has not), and the names V (verify), α (alpha lock) and ALG, which has no entry mode to set here.
export function inputSpec(v) {
  if (isString(v)) return { text: v.value, verify: false, cursor: null, alpha: false };
  if (!isList(v)) throw new RPLError('INPUT: Bad argument type');
  const text = v.items.find(isString)?.value ?? '';
  const pos = v.items.find((item) => isReal(item) || isInteger(item) || (isList(item) && item.items.length === 2));
  const named = (id) => v.items.some((item) => isName(item) && item.id === id);
  return { text, verify: named('V'), cursor: pos ? inputCursor(text, pos) : null, alpha: named('α') };
}

function inputCursor(text, pos) {
  const nums = isList(pos) ? pos.items : [Real(1), pos];
  if (!nums.every((n) => isReal(n) || isInteger(n))) throw new RPLError('INPUT: Bad argument type');
  const [row, col] = nums.map((n) => Math.abs(Math.trunc(Number(n.value))));
  const rows = text.split('\n');
  const r = Math.min(Math.max(row, 1), rows.length);
  const start = rows.slice(0, r - 1).reduce((n, line) => n + line.length + 1, 0);
  return start + (col === 0 ? rows[r - 1].length : Math.min(col - 1, rows[r - 1].length));
}


// CHOOSE's choices, each an object or { display result }, and the position of the one highlighted (0: none, and the
// box only shows the choices).
export function chooseSpec(list, pos) {
  if (!isList(list) || !(isReal(pos) || isInteger(pos))) throw new RPLError('CHOOSE: Bad argument type');
  const n = Number(pos.value);
  if (!Number.isInteger(n) || n < 0 || n > list.items.length) throw new RPLError('CHOOSE: Bad argument value');
  return { items: list.items, pos: n };
}


// WAIT's argument: seconds to pause for (as many as a timer can take), 0 to wait for a key, or -1 to do so with
// the menu shown.
const WAIT_MAX_SECONDS = 2147483;

export function waitSpec(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('WAIT: Bad argument type');
  const n = Number(v.value);
  if (n > 0) return { seconds: Math.min(n, WAIT_MAX_SECONDS) };
  if (n === 0 || n === -1) return { key: true, menu: n === -1 };
  throw new RPLError('WAIT: Bad argument value');
}


// INFORM's form: a title, fields that are a label or { "label" "help" types... } (an empty list a blank), the column
// count alone or in { columns tabs }, and the reset and initial values, which NOVAL stands in for.
export function informSpec(title, fields, format, resets, init) {
  if (!isString(title) || !isList(fields) || !isList(resets) || !isList(init)) throw new RPLError('INFORM: Bad argument type');
  const columns = isList(format) ? format.items[0] : format;
  if (columns !== undefined && !(isReal(columns) || isInteger(columns))) throw new RPLError('INFORM: Bad argument type');
  const spec = fields.items.map((f) => {
    if (isString(f)) return { label: f.value, help: '', types: [] };
    if (!isList(f)) throw new RPLError('INFORM: Bad argument type');
    if (f.items.length === 0) return null;
    const [label, ...rest] = f.items;
    const help = isString(rest[0]) ? rest.shift().value : '';
    if (!isString(label) || !rest.every((t) => isReal(t) || isInteger(t))) throw new RPLError('INFORM: Bad argument type');
    return { label: label.value, help, types: rest.map((t) => Number(t.value)) };
  });
  return { title: title.value, fields: spec, columns: columns === undefined ? 1 : Math.max(1, Math.trunc(Number(columns.value))), resets: resets.items, init: init.items };
}
