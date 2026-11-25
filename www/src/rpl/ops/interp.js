// The program interpreter, split out of internal.js a piece at a time. Here: the checks that turn INPUT, CHOOSE, WAIT
// and INFORM's arguments into the dialog a halted program shows, the scans that find a structure's THEN, ELSE and
// END among a program's tokens, and the frames that hold its local variables.
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


// Control-flow keywords are recognised by name while walking a Program; they are
// not registered ops.
export const CF_OPENERS = new Set(['IF', 'IFERR', 'WHILE', 'DO', 'START', 'FOR', 'CASE']);

export const CF_CLOSERS = new Set(['END', 'NEXT', 'STEP']);

export const CF_INNERS  = new Set(['THEN', 'ELSE', 'REPEAT', 'UNTIL']);


export function bareNameId(tok) {
  if (!isName(tok) || tok.quoted) return null;
  return tok.id.toUpperCase();
}


// First index at nesting depth 0 holding the keyword `wanted` or a closer, as
// { idx, kind }; null if none.  A CASE holds one END per clause plus its own, so
// it is skipped whole.
export function scanAtDepth0(toks, from, wanted) {
  let depth = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (!id) { i++; continue; }
    if (id === 'CASE') {
      i = _pastCaseEnd(toks, i + 1);
      continue;
    }
    if (CF_OPENERS.has(id)) { depth++; i++; continue; }
    if (CF_CLOSERS.has(id)) {
      if (depth === 0) return { idx: i, kind: id };
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && id === wanted) {
      return { idx: i, kind: id };
    }
    i++;
  }
  return null;
}


// Index just past the END closing a CASE whose remaining body starts at `from`.
// Each depth-0 THEN opens a clause that owes its own END.
export function _pastCaseEnd(toks, from) {
  let pending = 1;
  let nest = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (id) {
      if (id === 'CASE') {
        i = _pastCaseEnd(toks, i + 1);
        continue;
      }
      if (CF_OPENERS.has(id)) {
        nest++;
      } else if (CF_CLOSERS.has(id)) {
        if (nest > 0) nest--;
        else if (id === 'END') {
          pending--;
          if (pending === 0) return i + 1;
        }
      } else if (nest === 0 && id === 'THEN') {
        pending++;
      }
    }
    i++;
  }
  return toks.length;
}


// A block whose closer is missing auto-closes at the end of the program, like
// the parser's unterminated « { [.  Returns the index just past the block.
export function _pastBlock(toks, endIdx) {
  return Math.min(endIdx + 1, toks.length);
}


export function _scanRequired(toks, from, keyword, message) {
  const scan = scanAtDepth0(toks, from, keyword);
  if (!scan || scan.kind !== keyword) throw new RPLError(message);
  return scan.idx;
}


export function _scanEnd(toks, from, message) {
  const scan = scanAtDepth0(toks, from, null);
  if (!scan) return toks.length;
  if (scan.kind !== 'END') throw new RPLError(message);
  return scan.idx;
}


export function _scanElseEnd(toks, thenIdx, label) {
  const branch = scanAtDepth0(toks, thenIdx + 1, 'ELSE');
  if (!branch) return { elseIdx: -1, endIdx: toks.length };
  if (branch.kind === 'END') return { elseIdx: -1, endIdx: branch.idx };
  if (branch.kind !== 'ELSE') throw new RPLError(`${label}/THEN: unexpected ${branch.kind}`);
  const end = scanAtDepth0(toks, branch.idx + 1, null);
  return { elseIdx: branch.idx, endIdx: end && end.kind === 'END' ? end.idx : toks.length };
}


export function _scanCounterCloser(toks, from, label) {
  const scan = scanAtDepth0(toks, from, null);
  if (!scan) return { closer: 'NEXT', closerIdx: toks.length };
  if (scan.kind === 'END') throw new RPLError(`${label} without NEXT/STEP`);
  return { closer: scan.kind, closerIdx: scan.idx };
}


// Local variables: the frames → and LOCAL push, innermost last, which a name inside a program reaches before the
// directory's.
export const _localFrames = [];

// LOCAL's frames, oldest first; they stay in _localFrames after the run that made them, until UNBIND.
export const _boundFrames = [];

export function bindLocals(pairs) {
  const frame = new Map(pairs);
  _localFrames.push(frame);
  _boundFrames.push(frame);
}

// Every variable LOCAL made, newest first, as [name, value].
export function unbindLocals() {
  const frames = _boundFrames.splice(0).filter((f) => _localFrames.includes(f));
  frames.forEach((f) => _localFrames.splice(_localFrames.lastIndexOf(f), 1));
  return frames.reverse().flatMap((f) => [...f].reverse());
}


export function _localFrame(id) {
  for (let i = _localFrames.length - 1; i >= 0; i--) {
    if (_localFrames[i].has(id)) return _localFrames[i];
  }
  return undefined;
}

export function _localLookup(id) {
  return _localFrame(id)?.get(id);
}

// fn runs with the name bound as a local variable, set through the function it is given, as a plot binds its variable.
export function withLocalVariable(name, fn) {
  const frame = new Map([[name, null]]);
  _localFrames.push(frame);
  try {
    return fn((value) => frame.set(name, value));
  } finally {
    _localFrames.splice(_localFrames.lastIndexOf(frame), 1);
  }
}

export function localFramesDepth() { return _localFrames.length; }
