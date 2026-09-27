import {
  parseAlgebra, formatAlgebra, isKnownFunction, KNOWN_FUNCTIONS,
  Num, Var, Neg, Bin, Fn, isNum, isVar, isNeg, isBin, isFn,
} from '../rpl/algebra.js';
import { eqwToSvg } from '../rpl/pretty.js';
import { Symbolic, isSymbolic, isNumber, isName, isInteger, isReal, Integer } from '../rpl/types.js';
import { format } from '../rpl/formatter.js';
import { RPLError, Stack } from '../rpl/stack.js';
import { lookup } from '../rpl/ops.js';
import { _astToRplValue } from '../rpl/ops/internal.js';
import { giac } from '../rpl/cas/giac-engine.mjs';

export const HOLE = Object.freeze({ t: 'hole' });

const RELS = new Set(['=', '≠', '<', '>', '≤', '≥']);

export const EQW_STRUCTS = Object.freeze({
  frac:  Object.freeze({ reading: Object.freeze([0, 1]), wrap: 0, open: 0, after: 1, afterMode: 'insert' }),
  pow:   Object.freeze({ reading: Object.freeze([0, 1]), wrap: 0, open: 0, after: 1, afterMode: 'insert' }),
  sqrt:  Object.freeze({ reading: Object.freeze([0]), wrap: 0, open: 0, afterMode: 'select' }),
  xroot: Object.freeze({ reading: Object.freeze([1, 0]), wrap: 0, open: 1, after: 1, afterMode: 'insert' }),
  exp:   Object.freeze({ reading: Object.freeze([0]), wrap: 0, open: 0, afterMode: 'select' }),
  neg:   Object.freeze({ reading: Object.freeze([0]), wrap: 0, open: 0, afterMode: 'select' }),
  fact:  Object.freeze({ reading: Object.freeze([0]), wrap: 0, open: 0, afterMode: 'select' }),
  paren: Object.freeze({ reading: Object.freeze([0]), wrap: 0, open: 0, afterMode: 'select' }),
  fn:    Object.freeze({ reading: null, wrap: 0, open: 0, afterMode: 'select' }),
  deriv: Object.freeze({ reading: Object.freeze([1, 0]), wrap: 0, open: 1, after: 1, afterMode: 'insert' }),
  integ: Object.freeze({ reading: Object.freeze([2, 3, 0, 1]), wrap: 0, open: 2, after: 2, afterMode: 'insert' }),
  sigma: Object.freeze({ reading: Object.freeze([1, 2, 3, 0]), wrap: 0, open: 1, after: 1, afterMode: 'insert' }),
});

export const EQW_CMDS = Object.freeze([
  'COLLECT', 'DERVX', 'DISTRIB', 'EXPAND', 'EXPLN', 'FACTOR', 'ILAP', 'INTVX',
  'LAPLACE', 'LIN', 'LNCOLLECT', 'PARTFRAC', 'PROPFRAC', 'SIMPLIFY',
  'TCOLLECT', 'TEXPAND', 'TLIN', 'TSIMP',
]);

export const EQW_ACTION_OPS = Object.freeze({
  EVAL: Object.freeze(['EVAL', 'SIMPLIFY']),
  '→NUM': Object.freeze(['EVAL', 'SIMPLIFY', '→NUM']),
  FACTO: Object.freeze(['FACTOR']),
  SIMP: Object.freeze(['SIMPLIFY']),
  EXPA: Object.freeze(['EXPAND']),
});

export const EQW_APP_FACES = new Set([
  'ENTER', 'ON', 'EVAL', '→NUM', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'PREV', 'NEXT', 'TOOLS', 'COPY', 'CUT', 'PASTE',
]);

export const EQW_UNAVAILABLE_FACES = new Set([
  'LASTARG', 'VARS', 'HOME', 'STO', 'RCL', 'CST', 'SST', '`', '|', 'EQW',
  '∠', '#', "'", '[ ]', '" "', '{ }', '« »', '_', '::', '↵', '→', 'SPC',
  'CONT', '↖️', '↗️',
]);

const MODEL_LABELS = new Set([
  ...'0123456789', '.', 'EEX', '+', '−', '-', '×', '*', '÷', '/',
  'yˣ', 'eˣ', 'LN', '√x', 'x²', 'ⁿ√y', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS',
  'ATAN', 'ABS', 'ARG', 'LOG', '10ˣ', 'ALOG', 'Σ', '∂', '∫', '1/x', '+/-',
  '( )', ')', ',', '!', 'π', '∞', 'i', 'e',
  '▲', '▼', '◀', '▶', 'RS▲', 'RS◀', 'RS▶',
  '⌫', 'DEL', 'CLEAR', 'UNDO', 'REDO',
  '≠', '=', '≤', '<', '≥', '>',
  ...'abcdefghijklmnopqrstuvwxyz',
]);

const FN_FACE = {
  SIN: 'SIN', COS: 'COS', TAN: 'TAN', ASIN: 'ASIN', ACOS: 'ACOS', ATAN: 'ATAN',
  ABS: 'ABS', ARG: 'ARG', LOG: 'LOG', LN: 'LN', '10ˣ': 'ALOG', ALOG: 'ALOG',
};

const NAME_KIND = {
  SQRT: 'sqrt', EXP: 'exp', XROOT: 'xroot', FACT: 'fact', DERIV: 'deriv', 'Σ': 'sigma',
};

const STRUCT_FACE = {
  '√x': 'sqrt', 'ⁿ√y': 'xroot', 'eˣ': 'exp', '( )': 'paren',
  'Σ': 'sigma', '∂': 'deriv', '∫': 'integ',
};

function paletteButton(face, label, title) {
  return Object.freeze({ face, label: label ?? face, title });
}

function paletteGroup(name, items) {
  return Object.freeze({ name, items: Object.freeze(items) });
}

export const EQW_FEATURED = Object.freeze([
  paletteButton('∂', '∂', 'Derivative'),
  paletteButton('∫', '∫', 'Integral'),
  paletteButton('Σ', 'Σ', 'Sum'),
  paletteButton('√x', '√', 'Square root'),
  paletteButton('ⁿ√y', 'ⁿ√', 'nth root'),
  paletteButton('π', 'π', 'Pi'),
  paletteButton('∞', '∞', 'Infinity'),
  paletteButton('const:i', 'i', 'Imaginary unit'),
  paletteButton('≠', '≠', 'Not equal'),
  paletteButton('≤', '≤', 'Less or equal'),
  paletteButton('≥', '≥', 'Greater or equal'),
  paletteButton('α', 'α', 'alpha'),
  paletteButton('β', 'β', 'beta'),
  paletteButton('γ', 'γ', 'gamma'),
  paletteButton('θ', 'θ', 'theta'),
  paletteButton('λ', 'λ', 'lambda'),
  paletteButton('μ', 'μ', 'mu'),
  paletteButton('ω', 'ω', 'omega'),
  paletteButton('Δ', 'Δ', 'Delta'),
]);

const GREEK_MORE = 'αβγδεζηθικλμνξοπρστυφχψωΔ'.split('');

export const EQW_PALETTE = Object.freeze([
  paletteGroup('Templates', [
    paletteButton('yˣ', 'xʸ', 'Power'),
    paletteButton('x²', 'x²', 'Square'),
    paletteButton('eˣ', 'eˣ', 'Exponential'),
    paletteButton('10ˣ', '10ˣ', 'Power of ten'),
    paletteButton('1/x', '1/x', 'Reciprocal'),
    paletteButton('!', 'n!', 'Factorial'),
    paletteButton('( )', '( )', 'Parentheses'),
    paletteButton('+/-', '±', 'Negate'),
    paletteButton('÷', '÷', 'Fraction'),
  ]),
  paletteGroup('Functions', [
    paletteButton('SIN', 'SIN', 'Sine'),
    paletteButton('COS', 'COS', 'Cosine'),
    paletteButton('TAN', 'TAN', 'Tangent'),
    paletteButton('ASIN', 'ASIN', 'Arcsine'),
    paletteButton('ACOS', 'ACOS', 'Arccosine'),
    paletteButton('ATAN', 'ATAN', 'Arctangent'),
    paletteButton('SINH', 'SINH', 'Hyperbolic sine'),
    paletteButton('COSH', 'COSH', 'Hyperbolic cosine'),
    paletteButton('TANH', 'TANH', 'Hyperbolic tangent'),
    paletteButton('LN', 'LN', 'Natural log'),
    paletteButton('LOG', 'LOG', 'Log base 10'),
    paletteButton('ABS', 'ABS', 'Absolute value'),
    paletteButton('ARG', 'ARG', 'Argument'),
  ]),
  paletteGroup('Names', [
    paletteButton('x', 'x', 'Variable x'),
    paletteButton('e', 'e', 'Euler number'),
  ]),
  paletteGroup('Operators', [
    paletteButton('+', '+', 'Add'),
    paletteButton('−', '−', 'Subtract'),
    paletteButton('×', '×', 'Multiply'),
    paletteButton('=', '=', 'Equal'),
    paletteButton('<', '<', 'Less than'),
    paletteButton('>', '>', 'Greater than'),
    paletteButton(',', ',', 'Next template slot'),
  ]),
  paletteGroup('Digits', [
    ...'7894561230'.split('').map(digit => paletteButton(digit, digit, digit)),
    paletteButton('.', '.', 'Decimal point'),
    paletteButton('EEX', 'EEX', 'Scientific notation'),
  ]),
  paletteGroup('Greek', GREEK_MORE
    .filter(letter => !EQW_FEATURED.some(button => button.face === letter))
    .map(letter => paletteButton(letter, letter, letter))),
  paletteGroup('Move', [
    paletteButton('⌫', '⌫', 'Backspace'),
    paletteButton('◀', '◀', 'Previous'),
    paletteButton('▶', '▶', 'Next'),
    paletteButton('▲', '▲', 'Grow selection'),
    paletteButton('▼', '▼', 'Shrink selection'),
  ]),
]);

export function eqwPaletteFaces() {
  return [
    ...EQW_FEATURED.map(button => button.face),
    ...EQW_PALETTE.flatMap(group => group.items.map(button => button.face)),
  ];
}

function numLeaf(text) { return Object.freeze({ t: 'num', text: String(text) }); }
function nameLeaf(text) { return Object.freeze({ t: 'name', text: String(text) }); }
function opTok(op) { return Object.freeze({ t: 'op', op }); }
function freezeRow(items) { return Object.freeze(items.slice()); }
function marked(item, how) { return Object.freeze({ ...item, mark: how }); }
function holeMark(how) { return Object.freeze({ t: 'hole', mark: how }); }

function makeStruct(t, slotRows, extra) {
  return Object.freeze({
    t,
    ...extra,
    slots: Object.freeze(slotRows.map(row => freezeRow(row))),
  });
}

function makeParen(items, typed) {
  return makeStruct('paren', [items], { typed: !!typed });
}

function makeFn(name, slotRows) {
  return makeStruct('fn', slotRows, { name: String(name).toUpperCase() });
}

function readingOf(item) {
  if (item.t === 'fn') return item.slots.map((_, index) => index);
  return EQW_STRUCTS[item.t]?.reading || item.slots.map((_, index) => index);
}

function specOf(item) {
  return item.t === 'fn' ? EQW_STRUCTS.fn : EQW_STRUCTS[item.t];
}

export function emptyEquation() {
  return {
    root: freezeRow([HOLE]),
    target: { mode: 'insert', path: [0] },
    history: [],
    future: [],
    typingKey: null,
    lastFace: null,
  };
}

function snapshot(state) {
  return { root: state.root, target: state.target, lastFace: state.lastFace ?? null };
}

function step(state, next, typingKey = null) {
  const coalesce = typingKey && typingKey === state.typingKey;
  const history = coalesce ? state.history : state.history.concat([snapshot(state)]).slice(-100);
  return {
    root: next.root,
    target: next.target,
    history,
    future: [],
    typingKey,
    lastFace: next.lastFace === undefined ? state.lastFace : next.lastFace,
  };
}

function move(state, target) {
  return { ...state, target, typingKey: null };
}

function getItem(root, path) {
  let row = root;
  for (let i = 0; i < path.length;) {
    const item = row[path[i]];
    if (i === path.length - 1) return item;
    row = item.slots[path[i + 1]];
    i += 2;
  }
  return null;
}

function rowByKey(root, key) {
  if (!key) return root;
  const parts = key.split('.').map(Number);
  const slot = parts.pop();
  return getItem(root, parts).slots[slot];
}

function rowKeyOf(path) {
  return path.length <= 1 ? '' : path.slice(0, -1).join('.');
}

function itemPath(rowKey, index) {
  return (rowKey ? rowKey.split('.').map(Number) : []).concat(index);
}

function updateItem(root, path, fn) {
  const index = path[0];
  const row = root.slice();
  if (path.length === 1) {
    row[index] = fn(row[index]);
    return freezeRow(row);
  }
  const item = row[index];
  const slots = item.slots.slice();
  slots[path[1]] = updateItem(slots[path[1]], path.slice(2), fn);
  row[index] = Object.freeze({ ...item, slots: Object.freeze(slots) });
  return freezeRow(row);
}

function normalizeOne(item) {
  if (!item) return item;
  if (item.t === 'paren' && !item.typed && !item.mark) {
    const inner = normalizeItems(item.slots[0]);
    if (inner.length === 1 && inner[0].t !== 'op') return inner[0];
    return Object.freeze({ ...item, slots: Object.freeze([freezeRow(inner)]) });
  }
  if (item.slots) {
    const slots = item.slots.map(slot => freezeRow(normalizeItems(slot)));
    return Object.freeze({ ...item, slots: Object.freeze(slots) });
  }
  return item;
}

function normalizeItems(items) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    out.push(normalizeOne(item));
  }
  while (out[0]?.t === 'op' && out[0].op === '+') out.shift();
  if (out[0]?.t === 'op' && out[0].op === '-' && out[1] && out[1].t !== 'op') {
    const neg = makeStruct('neg', [[out[1]]]);
    out.splice(0, 2, neg);
  }
  const cleaned = [];
  for (const item of out) {
    if (item.t === 'op') {
      if (!cleaned.length || cleaned[cleaned.length - 1].t === 'op') continue;
      cleaned.push(item);
    } else cleaned.push(item);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].t === 'op') cleaned.pop();
  return cleaned.length ? cleaned : [HOLE];
}

function setRow(root, rowKey, items) {
  const row = freezeRow(normalizeItems(items));
  if (!rowKey) return row;
  const parts = rowKey.split('.').map(Number);
  const slot = parts.pop();
  return updateItem(root, parts, (item) => {
    const slots = item.slots.slice();
    slots[slot] = row;
    return Object.freeze({ ...item, slots: Object.freeze(slots) });
  });
}

function findMark(root, row = root, prefix = []) {
  for (let index = 0; index < row.length; index++) {
    const item = row[index];
    const path = prefix.concat(index);
    if (item.mark) return { path, how: item.mark };
    if (item.slots) {
      for (let slot = 0; slot < item.slots.length; slot++) {
        const found = findMark(root, item.slots[slot], path.concat(slot));
        if (found) return found;
      }
    }
  }
  return null;
}

function unmark(root) {
  function walk(row) {
    return freezeRow(row.map((item) => {
      if (!item.slots && !item.mark) return item;
      const next = item.slots
        ? { ...item, slots: Object.freeze(item.slots.map(walk)) }
        : { ...item };
      delete next.mark;
      return Object.freeze(next);
    }));
  }
  return walk(root);
}

function stops(root) {
  const out = [];
  function walk(row, prefix) {
    row.forEach((item, index) => {
      const path = prefix.concat(index);
      if (item.t === 'hole' || item.t === 'num' || item.t === 'name') out.push(path);
      else if (item.t !== 'op' && item.slots) {
        for (const slot of readingOf(item)) walk(item.slots[slot], path.concat(slot));
      }
    });
  }
  walk(root, []);
  return out;
}

function parseAtom(from) {
  return { kind: 'atom', from, to: from };
}

function parseProduct(items, from, to) {
  const factors = [];
  let start = from;
  for (let i = from; i < to; i++) {
    if (items[i].t === 'op' && items[i].op === '*') {
      factors.push([start, i]);
      start = i + 1;
    }
  }
  factors.push([start, to]);
  if (factors.length === 1) return parseAtom(from);
  return {
    kind: 'product',
    from,
    to: to - 1,
    kids: factors.map(([startAt, endAt]) => parseAtom(startAt)),
  };
}

function parseSum(items, from, to) {
  let cursor = from;
  let pendingNeg = false;
  if (items[cursor]?.t === 'op' && (items[cursor].op === '-' || items[cursor].op === '+')) {
    pendingNeg = items[cursor].op === '-';
    cursor += 1;
  }
  const pieces = [];
  let termStart = cursor;
  for (let i = cursor; i < to; i++) {
    const item = items[i];
    if (item.t === 'op' && (item.op === '+' || item.op === '-')) {
      pieces.push({ start: termStart, end: i, neg: pendingNeg });
      pendingNeg = item.op === '-';
      termStart = i + 1;
    }
  }
  if (termStart < to) pieces.push({ start: termStart, end: to, neg: pendingNeg });
  if (!pieces.length) return parseProduct(items, from, to);
  const kids = pieces.map((piece) => {
    const product = parseProduct(items, piece.start, piece.end);
    if (!piece.neg) return product;
    return { kind: 'negterm', from: piece.start - 1, to: piece.end - 1, kids: [product] };
  });
  if (kids.length === 1) return kids[0];
  return { kind: 'sum', from, to: to - 1, kids };
}

function parseRel(items, from, to) {
  let relAt = -1;
  for (let i = from; i < to; i++) {
    if (items[i].t === 'op' && RELS.has(items[i].op)) { relAt = i; break; }
  }
  if (relAt < 0) return parseSum(items, from, to);
  return {
    kind: 'rel',
    from,
    to: to - 1,
    opIndex: relAt,
    kids: [parseSum(items, from, relAt), parseSum(items, relAt + 1, to)],
  };
}

function findCover(items, from, to) {
  const root = parseRel(items, 0, items.length);
  let best = null;
  function walk(node, parent) {
    if (node.from <= from && node.to >= to) {
      const span = node.to - node.from;
      if (!best || span < best.span) best = { node, parent, span };
    }
    if (node.kids) for (const kid of node.kids) walk(kid, node);
  }
  walk(root, null);
  return best || { node: root, parent: null, span: root.to - root.from };
}

function isAddLike(ast) {
  return isBin(ast) && (ast.op === '+' || ast.op === '-' || RELS.has(ast.op));
}

function astToItems(ast) {
  if (!ast) return [HOLE];
  if (ast.kind === 'num') {
    if (ast.digits) return [numLeaf(ast.digits)];
    if (ast.value < 0) return [makeStruct('neg', [[numLeaf(String(-ast.value))]])];
    return [numLeaf(String(ast.value))];
  }
  if (isVar(ast)) return [nameLeaf(ast.name)];
  if (isNeg(ast)) return [makeStruct('neg', [astToItems(ast.arg)])];
  if (isBin(ast) && (ast.op === '+' || ast.op === '-')) return flattenAdd(ast);
  if (isBin(ast) && ast.op === '*') return flattenMul(ast);
  if (isBin(ast) && ast.op === '/') return [makeStruct('frac', [astToItems(ast.l), astToItems(ast.r)])];
  if (isBin(ast) && ast.op === '^') return [makeStruct('pow', [astToItems(ast.l), astToItems(ast.r)])];
  if (isBin(ast) && RELS.has(ast.op)) return [...relSide(ast.l), opTok(ast.op), ...relSide(ast.r)];
  if (isFn(ast)) return [fnFromAst(ast)];
  throw new RPLError('Result not editable in EQW');
}

function relSide(ast) {
  if (isBin(ast) && RELS.has(ast.op)) return [makeParen(fromAst(ast), false)];
  if (isBin(ast) && (ast.op === '+' || ast.op === '-')) return flattenAdd(ast);
  if (isBin(ast) && ast.op === '*') return flattenMul(ast);
  return astToItems(ast);
}

function termItems(node, asRight) {
  if (asRight && isAddLike(node)) return [makeParen(fromAst(node), false)];
  if (isNeg(node)) return [makeStruct('neg', [astToItems(node.arg)])];
  return astToItems(node);
}

function flattenAdd(ast) {
  const spine = [];
  let node = ast;
  while (isBin(node) && (node.op === '+' || node.op === '-')) {
    spine.push({ op: node.op, right: node.r });
    node = node.l;
  }
  spine.reverse();
  const items = termItems(node, false);
  for (const part of spine) {
    items.push(opTok(part.op));
    items.push(...termItems(part.right, true));
  }
  return items;
}

function factorItems(node, asRight) {
  if (isBin(node) && (node.op === '+' || node.op === '-' || RELS.has(node.op) || (asRight && node.op === '*'))) {
    return [makeParen(fromAst(node), false)];
  }
  if (isNeg(node)) return [makeStruct('neg', [astToItems(node.arg)])];
  return astToItems(node);
}

function flattenMul(ast) {
  const rights = [];
  let node = ast;
  while (isBin(node) && node.op === '*') {
    rights.push(node.r);
    node = node.l;
  }
  rights.reverse();
  const items = factorItems(node, false);
  for (const right of rights) {
    items.push(opTok('*'));
    items.push(...factorItems(right, true));
  }
  return items;
}

function fnFromAst(ast) {
  const args = ast.args.map(astToItems);
  if (ast.name === 'SQRT' && args.length === 1) return makeStruct('sqrt', args);
  if (ast.name === 'XROOT' && args.length === 2) return makeStruct('xroot', args);
  if (ast.name === 'EXP' && args.length === 1) return makeStruct('exp', args);
  if (ast.name === 'FACT' && args.length === 1) return makeStruct('fact', args);
  if (ast.name === 'DERIV' && args.length === 2) return makeStruct('deriv', args);
  if (ast.name === 'INTEG' && args.length === 4) return makeStruct('integ', args);
  if (ast.name === 'Σ' && args.length === 4) return makeStruct('sigma', args);
  return makeFn(ast.name, args);
}

export function fromAst(ast) {
  return freezeRow(normalizeItems(astToItems(ast)));
}

function nodeToAst(row, node) {
  if (node.kind === 'atom') return itemToAst(row[node.from]);
  if (node.kind === 'negterm') return Neg(nodeToAst(row, node.kids[0]));
  if (node.kind === 'product') {
    return node.kids.slice(1).reduce(
      (acc, kid) => Bin('*', acc, nodeToAst(row, kid)),
      nodeToAst(row, node.kids[0]),
    );
  }
  if (node.kind === 'sum') {
    let acc = null;
    for (const kid of node.kids) {
      if (kid.kind === 'negterm') {
        const term = nodeToAst(row, kid.kids[0]);
        acc = acc == null ? Neg(term) : Bin('-', acc, term);
      } else {
        const term = nodeToAst(row, kid);
        acc = acc == null ? term : Bin('+', acc, term);
      }
    }
    return acc;
  }
  if (node.kind === 'rel') {
    return Bin(row[node.opIndex].op, nodeToAst(row, node.kids[0]), nodeToAst(row, node.kids[1]));
  }
  throw new RPLError('Invalid syntax');
}

function itemToAst(item) {
  if (!item || item.t === 'hole') throw new RPLError('Incomplete Subexpression');
  if (item.t === 'num') {
    const text = item.text;
    if (/^\d+$/.test(text)) return Num(BigInt(text));
    if (!/^\d*\.?\d+(?:E-?\d+)?$/i.test(text) || /E-?$/.test(text) || text === '' || text === '.') {
      throw new RPLError('Incomplete Subexpression');
    }
    return Num(Number(text));
  }
  if (item.t === 'name') return Var(item.text);
  if (item.t === 'paren' || item.t === 'neg') {
    const inner = toAst(item.slots[0]);
    return item.t === 'neg' ? Neg(inner) : inner;
  }
  if (item.t === 'frac') return Bin('/', toAst(item.slots[0]), toAst(item.slots[1]));
  if (item.t === 'pow') return Bin('^', toAst(item.slots[0]), toAst(item.slots[1]));
  if (item.t === 'sqrt') return Fn('SQRT', [toAst(item.slots[0])]);
  if (item.t === 'xroot') return Fn('XROOT', [toAst(item.slots[0]), toAst(item.slots[1])]);
  if (item.t === 'exp') return Fn('EXP', [toAst(item.slots[0])]);
  if (item.t === 'fact') return Fn('FACT', [toAst(item.slots[0])]);
  if (item.t === 'fn') return Fn(item.name, item.slots.map(toAst));
  if (item.t === 'deriv' || item.t === 'integ' || item.t === 'sigma') {
    const variable = toAst(item.slots[1]);
    if (!isVar(variable)) throw new RPLError('Bad argument type');
    if (item.t === 'deriv') return Fn('DERIV', [toAst(item.slots[0]), variable]);
    const name = item.t === 'integ' ? 'INTEG' : 'Σ';
    return Fn(name, [toAst(item.slots[0]), variable, toAst(item.slots[2]), toAst(item.slots[3])]);
  }
  throw new RPLError('Result not editable in EQW');
}

export function toAst(row) {
  if (!row || !row.length) throw new RPLError('Incomplete Subexpression');
  return nodeToAst(row, parseRel(row, 0, row.length));
}

function spanOf(state) {
  const target = state.target;
  if (target.mode === 'select') return { rowKey: target.row, from: target.from, to: target.to };
  const rowKey = rowKeyOf(target.path);
  const index = target.path[target.path.length - 1];
  return { rowKey, from: index, to: index };
}

export function targetAst(state) {
  if (state.target.mode === 'insert') return toAst(state.root);
  const { rowKey, from, to } = spanOf(state);
  return toAst(rowByKey(state.root, rowKey).slice(from, to + 1));
}

function valueToAst(value) {
  if (isSymbolic(value)) return value.expr;
  if (isInteger(value)) return Num(value.value);
  if (isReal(value)) return Num(value.value);
  if (isName(value)) return Var(value.id);
  throw new RPLError('Result not editable in EQW');
}

export function valueFromEquation(root) {
  const ast = toAst(root);
  if (ast.kind === 'num' && Number.isInteger(ast.value) && ast.digits === undefined) {
    return Integer(BigInt(ast.value));
  }
  return _astToRplValue(ast);
}

export function equationFromValue(value) {
  let root;
  if (isSymbolic(value)) root = fromAst(value.expr);
  else if (isName(value)) root = freezeRow([nameLeaf(value.id)]);
  else throw new RPLError('not an algebraic');
  const leaves = stops(root).filter(path => getItem(root, path).t !== 'hole');
  const path = leaves.length ? leaves[leaves.length - 1] : (stops(root)[0] || [0]);
  return { root, target: { mode: 'insert', path }, history: [], future: [], typingKey: null, lastFace: null };
}

export function equationToSymbolic(src) {
  const text = String(src ?? '').trim();
  if (!text) throw new Error('Empty expression');
  return Symbolic(parseAlgebra(text));
}

export function valueToEquationDraft(value) {
  if (value == null) return '';
  if (isSymbolic(value)) return formatAlgebra(value.expr);
  if (isName(value)) return value.id;
  if (isNumber(value)) return format(value).replace(/^`|`$/g, '');
  return null;
}

function itemsAreSum(items) {
  return items.some(item => item.t === 'op' && (item.op === '+' || item.op === '-'));
}

function itemsAreRel(items) {
  return items.some(item => item.t === 'op' && RELS.has(item.op));
}

function outsideOp(row, from, to, op) {
  return row.some((item, index) => (index < from || index > to) && item.t === 'op' && item.op === op);
}

function resign(items) {
  if (items.length === 1 && items[0].t === 'neg') return [opTok('-'), ...items[0].slots[0]];
  return [opTok('+'), ...items];
}

function finishMarked(state, root, typingKey, lastFace) {
  const found = findMark(root);
  const clean = unmark(root);
  let target;
  if (!found) target = { mode: 'insert', path: stops(clean).at(-1) || [0] };
  else if (found.how === 'select') {
    target = { mode: 'select', row: rowKeyOf(found.path), from: found.path.at(-1), to: found.path.at(-1) };
  } else if (found.how === 'clear') target = { mode: 'clear', path: found.path };
  else target = { mode: 'insert', path: found.path };
  return step(state, { root: clean, target, lastFace }, typingKey);
}

function replaceSpan(state, rowKey, from, to, items, typingKey = null, lastFace = undefined) {
  const row = rowByKey(state.root, rowKey).slice();
  let nextItems = items.slice();
  const negterm = row[from]?.t === 'op' && row[from].op === '-';
  if (negterm) nextItems = resign(nextItems);
  if (!negterm && from > 0 && row[from - 1]?.t === 'op' && row[from - 1].op === '+' && nextItems[0]?.t === 'neg') {
    row[from - 1] = opTok('-');
    nextItems = [...nextItems[0].slots[0], ...nextItems.slice(1)];
  }
  const product = outsideOp(row, from, to, '*');
  const sum = outsideOp(row, from, to, '+') || outsideOp(row, from, to, '-');
  if (product && itemsAreSum(nextItems)) nextItems = [makeParen(nextItems, false)];
  if (sum && itemsAreRel(nextItems)) nextItems = [makeParen(nextItems, false)];
  const merged = row.slice(0, from).concat(nextItems, row.slice(to + 1));
  return finishMarked(state, setRow(state.root, rowKey, merged), typingKey, lastFace);
}

function targetItems(state) {
  const { rowKey, from, to } = spanOf(state);
  return rowByKey(state.root, rowKey).slice(from, to + 1);
}

function landSelect(state, rowKey, from, to) {
  const row = rowByKey(state.root, rowKey);
  if (from === to && row[from]?.t === 'paren' && !row[from].typed) {
    return selectSlotRoot(state, itemPath(rowKey, from), 0);
  }
  return move(state, { mode: 'select', row: rowKey, from, to });
}

function selectSlotRoot(state, path, slot) {
  const item = getItem(state.root, path);
  const rowKey = `${path.join('.')}.${slot}`;
  const row = item.slots[slot];
  const node = parseRel(row, 0, row.length);
  return landSelect(state, rowKey, node.from, node.to);
}

function selectOwning(state, rowKey) {
  if (!rowKey) return state;
  const parts = rowKey.split('.').map(Number);
  parts.pop();
  const item = getItem(state.root, parts);
  const index = parts[parts.length - 1];
  const parentKey = parts.length <= 1 ? '' : parts.slice(0, -1).join('.');
  if (item?.t === 'paren' && !item.typed) {
    const row = rowByKey(state.root, parentKey);
    const cover = findCover(row, index, index);
    if (cover.parent) return landSelect(state, parentKey, cover.parent.from, cover.parent.to);
    return selectOwning(state, parentKey);
  }
  return landSelect(state, parentKey, index, index);
}

function parentOfSpan(state, rowKey, from, to) {
  const row = rowByKey(state.root, rowKey);
  const cover = findCover(row, from, to);
  if (cover.node.from === from && cover.node.to === to) {
    if (cover.parent) return landSelect(state, rowKey, cover.parent.from, cover.parent.to);
    return selectOwning(state, rowKey);
  }
  return landSelect(state, rowKey, cover.node.from, cover.node.to);
}

function grow(state) {
  const target = state.target;
  if (target.mode === 'insert' || target.mode === 'clear') {
    const rowKey = rowKeyOf(target.path);
    const index = target.path[target.path.length - 1];
    return landSelect(state, rowKey, index, index);
  }
  return parentOfSpan(state, target.row, target.from, target.to);
}

function firstStopIn(root, rowKey, from, to) {
  return stops(root).find(path => pathInSpan(path, rowKey, from, to)) || null;
}

function lastStopIn(root, rowKey, from, to) {
  const found = stops(root).filter(path => pathInSpan(path, rowKey, from, to));
  return found.length ? found[found.length - 1] : null;
}

function pathInSpan(path, rowKey, from, to) {
  const prefix = rowKey ? rowKey.split('.').map(Number) : [];
  if (path.length < prefix.length + 1) return false;
  for (let i = 0; i < prefix.length; i++) if (path[i] !== prefix[i]) return false;
  const index = path[prefix.length];
  return index >= from && index <= to;
}

function shrink(state) {
  const target = state.target;
  if (target.mode === 'insert') return move(state, { mode: 'clear', path: target.path });
  if (target.mode !== 'select') return state;
  const row = rowByKey(state.root, target.row);
  const cover = findCover(row, target.from, target.to);
  const node = cover.node.from === target.from && cover.node.to === target.to
    ? cover.node
    : cover.node;
  if (node.kind === 'atom' && node.from === target.from && node.to === target.to) {
    const item = row[node.from];
    if (item.t === 'num' || item.t === 'name' || item.t === 'hole') {
      return move(state, { mode: 'clear', path: itemPath(target.row, node.from) });
    }
    if (item.slots) return selectSlotRoot(state, itemPath(target.row, node.from), readingOf(item)[0]);
  }
  if (node.kids?.length && node.from === target.from && node.to === target.to) {
    const kid = node.kids[0];
    return landSelect(state, target.row, kid.from, kid.to);
  }
  const kid = (cover.node.kids || []).find(child => child.from >= target.from && child.to <= target.to);
  if (kid) return landSelect(state, target.row, kid.from, kid.to);
  return state;
}

function siblingSpan(state, dir) {
  const target = state.target;
  if (target.mode !== 'select') return null;
  const row = rowByKey(state.root, target.row);
  const cover = findCover(row, target.from, target.to);
  const parent = cover.node.from === target.from && cover.node.to === target.to ? cover.parent : cover.node;
  if (parent?.kids) {
    const kids = parent.kids;
    const covered = kids.filter(kid => kid.to >= target.from && kid.from <= target.to);
    const edge = dir > 0 ? covered[covered.length - 1] : covered[0];
    const index = kids.findIndex(kid => kid.from === edge.from && kid.to === edge.to);
    const next = kids[index + dir];
    if (next) return { rowKey: target.row, from: next.from, to: next.to };
    return { parent: true, rowKey: target.row, from: parent.from, to: parent.to };
  }
  if (!target.row) return { parent: true, root: true };
  const parts = target.row.split('.').map(Number);
  const slot = parts.pop();
  const owner = getItem(state.root, parts);
  const order = readingOf(owner);
  const pos = order.indexOf(slot);
  const nextSlot = order[pos + dir];
  if (nextSlot === undefined) return { owner: parts, parent: true };
  return { slot: nextSlot, owner: parts };
}

function stopTarget(root, path) {
  const item = getItem(root, path);
  return { mode: item.t === 'hole' ? 'insert' : 'clear', path };
}

function moveSide(state, dir) {
  const target = state.target;
  if (target.mode === 'insert' || target.mode === 'clear') {
    const all = stops(state.root);
    const index = all.findIndex(path => path.join('.') === target.path.join('.'));
    if (target.mode === 'insert' && dir < 0) {
      const item = getItem(state.root, target.path);
      if (item.t !== 'hole') return move(state, { mode: 'clear', path: target.path });
      return all[index - 1] ? move(state, stopTarget(state.root, all[index - 1])) : state;
    }
    const next = all[index + dir];
    if (next && (target.mode === 'clear' || dir > 0)) return move(state, stopTarget(state.root, next));
    if (target.mode === 'insert' && dir > 0) {
      const at = target.path.at(-1);
      return parentOfSpan(state, rowKeyOf(target.path), at, at);
    }
    return state;
  }
  const jump = siblingSpan(state, dir);
  if (!jump) return state;
  if (jump.slot !== undefined) return selectSlotRoot(state, jump.owner, jump.slot);
  if (jump.root) return state;
  if (jump.owner) return selectOwning(state, state.target.row);
  if (jump.parent) return landSelect(state, jump.rowKey, jump.from, jump.to);
  return landSelect(state, jump.rowKey, jump.from, jump.to);
}

function extendRun(state, dir) {
  const target = state.target;
  if (target.mode !== 'select') {
    const all = stops(state.root);
    const path = dir < 0 ? all[0] : all[all.length - 1];
    if (!path) return state;
    const item = getItem(state.root, path);
    return move(state, { mode: item.t === 'hole' ? 'insert' : 'clear', path });
  }
  const row = rowByKey(state.root, target.row);
  const cover = findCover(row, target.from, target.to);
  const parent = cover.parent && (cover.parent.kind === 'sum' || cover.parent.kind === 'product')
    ? cover.parent
    : (cover.node.kind === 'sum' || cover.node.kind === 'product' ? cover.node : null);
  if (!parent) return state;
  const kids = parent.kids;
  const covered = kids.filter(kid => kid.to >= target.from && kid.from <= target.to);
  const edge = dir > 0 ? covered[covered.length - 1] : covered[0];
  const index = kids.findIndex(kid => kid.from === edge.from && kid.to === edge.to);
  const next = kids[index + dir];
  if (!next) return state;
  const from = Math.min(target.from, next.from);
  const to = Math.max(target.to, next.to);
  return landSelect(state, target.row, from, to);
}

function selectAll(state) {
  const node = parseRel(state.root, 0, state.root.length);
  return move(state, { mode: 'select', row: '', from: node.from, to: node.to });
}

function putLeaf(state, item, { overtype = false } = {}) {
  const path = state.target.path;
  const rowKey = rowKeyOf(path);
  const index = path[path.length - 1];
  const typingKey = `${path.join('.')}:${item.t}`;
  const root = setRow(state.root, rowKey, rowByKey(state.root, rowKey).slice().map((entry, at) => {
    return at === index ? item : entry;
  }));
  const kept = stops(root).find(stop => stop.join('.') === path.join('.')) || path;
  const mode = overtype ? 'insert' : 'insert';
  return step(state, { root, target: { mode, path: kept }, lastFace: state.lastFace }, typingKey);
}

function insertAfter(state, extras, lastFace) {
  const path = state.target.path;
  const rowKey = rowKeyOf(path);
  const index = path[path.length - 1];
  const row = rowByKey(state.root, rowKey).slice();
  row.splice(index + 1, 0, ...extras);
  return finishMarked(state, setRow(state.root, rowKey, row), null, lastFace);
}

function implicitMul(state, leaf) {
  const markedLeaf = marked(leaf, 'insert');
  return insertAfter(state, [opTok('*'), markedLeaf], null);
}

function typeGlyph(state, text, kind) {
  const target = state.target;
  if (target.mode === 'select') {
    const items = targetItems(state);
    if (items.length === 1 && items[0].t === 'hole') {
      return typeGlyph(move(state, { mode: 'insert', path: itemPath(target.row, target.from) }), text, kind);
    }
    const widened = insertAfterSelection(state, [opTok('*'), holeMark('insert')]);
    return typeGlyph(widened, text, kind);
  }
  const item = getItem(state.root, target.path);
  if (target.mode === 'clear' && item.t !== 'hole') {
    const leaf = kind === 'num' ? numLeaf(text === 'EEX' ? '1E' : text) : nameLeaf(text);
    return putLeaf({ ...state, lastFace: text }, leaf, { overtype: true });
  }
  if (item.t === 'hole' || target.mode === 'clear') {
    const leaf = kind === 'num'
      ? numLeaf(text === 'EEX' ? '1E' : text)
      : nameLeaf(text);
    return putLeaf({ ...state, lastFace: text }, leaf);
  }
  if (kind === 'num' && item.t === 'num') {
    const next = text === 'EEX'
      ? (item.text.includes('E') ? null : `${item.text}E`)
      : `${item.text}${text}`;
    if (next && /^\d*\.?\d*(?:E-?\d*)?$/.test(next)) {
      return putLeaf({ ...state, lastFace: text }, numLeaf(next));
    }
  }
  if (kind === 'name' && item.t === 'name' && target.mode === 'insert') {
    return putLeaf({ ...state, lastFace: text }, nameLeaf(item.text + text));
  }
  if (kind === 'name' && item.t === 'num') return implicitMul({ ...state, lastFace: text }, nameLeaf(text));
  if ((kind === 'num' || kind === 'const') && (item.t === 'num' || item.t === 'name')) {
    return implicitMul({ ...state, lastFace: text }, kind === 'num' ? numLeaf(text === 'EEX' ? '1E' : text) : nameLeaf(text));
  }
  return implicitMul({ ...state, lastFace: text }, nameLeaf(text));
}

function typeConstant(state, text) {
  const target = state.target;
  if (target.mode === 'select') {
    const widened = insertAfterSelection(state, [opTok('*'), holeMark('insert')]);
    return typeGlyph(widened, text, 'name');
  }
  const item = getItem(state.root, target.path);
  if (item.t === 'hole') return putLeaf(state, nameLeaf(text));
  if (target.mode === 'clear') return putLeaf(state, nameLeaf(text), { overtype: true });
  return implicitMul(state, nameLeaf(text));
}

function insertAfterSelection(state, extras) {
  const { rowKey, from, to } = spanOf(state);
  const row = rowByKey(state.root, rowKey).slice();
  row.splice(to + 1, 0, ...extras);
  return finishMarked(state, setRow(state.root, rowKey, row));
}

function emptyStruct(kind, name) {
  if (kind === 'fn') {
    const spec = KNOWN_FUNCTIONS[String(name).toUpperCase()];
    const count = spec && spec.arity ? spec.arity : 1;
    return makeFn(name, Array.from({ length: count }, () => [HOLE]));
  }
  const count = {
    frac: 2, pow: 2, sqrt: 1, xroot: 2, exp: 1, neg: 1, fact: 1, paren: 1,
    deriv: 2, integ: 4, sigma: 4,
  }[kind];
  const extra = kind === 'paren' ? { typed: true } : undefined;
  return makeStruct(kind, Array.from({ length: count }, () => [HOLE]), extra);
}

function openStruct(state, kind, name) {
  const blank = emptyStruct(kind, name);
  const spec = specOf(blank);
  const slots = blank.slots.slice();
  slots[spec.open] = freezeRow([holeMark('insert')]);
  const item = Object.freeze({ ...blank, slots: Object.freeze(slots) });
  const { rowKey, from, to } = spanOf(state);
  return replaceSpan(state, rowKey, from, to, [item], null, kind);
}

function wrapStruct(state, kind, name, slotItems) {
  const blank = emptyStruct(kind, name);
  const spec = specOf(blank);
  const slots = blank.slots.slice();
  slots[spec.wrap] = freezeRow(slotItems);
  let item = Object.freeze({ ...blank, slots: Object.freeze(slots) });
  if (spec.afterMode === 'select') item = marked(item, 'select');
  else {
    const next = item.slots.slice();
    next[spec.after] = freezeRow([holeMark('insert')]);
    item = Object.freeze({ ...item, slots: Object.freeze(next) });
  }
  const { rowKey, from, to } = spanOf(state);
  return replaceSpan(state, rowKey, from, to, [item], null, kind);
}

function structureKey(state, kind, name) {
  const target = state.target;
  if (kind === 'paren' && target.mode !== 'select') {
    const item = getItem(state.root, target.path);
    if ((item.t === 'name') && isKnownFunction(item.text)) return convertCall(state, item.text);
  }
  if ((kind === 'frac' || kind === 'pow') && !(target.mode === 'insert' && getItem(state.root, target.path).t === 'hole')) {
    return wrapStruct(state, kind, name, targetItems(state));
  }
  if (target.mode === 'insert') {
    const item = getItem(state.root, target.path);
    if (item.t === 'hole') return openStruct(state, kind, name);
    const created = emptyStruct(kind, name);
    const spec = specOf(created);
    const slots = created.slots.slice();
    slots[spec.open] = freezeRow([holeMark('insert')]);
    const opened = Object.freeze({ ...created, slots: Object.freeze(slots) });
    return insertAfter(state, [opTok('*'), opened], kind);
  }
  return wrapStruct(state, kind, name, targetItems(state));
}

function convertCall(state, name) {
  const upper = name.toUpperCase();
  const kind = NAME_KIND[upper];
  if (kind) return openStruct(state, kind);
  return openStruct(state, 'fn', upper);
}

function postfix(state, item) {
  const { rowKey, from, to } = spanOf(state);
  return replaceSpan(state, rowKey, from, to, [marked(item, 'select')]);
}

function operate(state, op) {
  const target = state.target;
  if (RELS.has(op)) {
    const rowKey = target.mode === 'select' ? target.row : rowKeyOf(target.path);
    if (rowKey !== '') throw new RPLError('Invalid syntax');
    if (state.root.some(item => item.t === 'op' && RELS.has(item.op) && item.op !== op)) {
      throw new RPLError('Invalid syntax');
    }
  }
  if (target.mode === 'insert') {
    const item = getItem(state.root, target.path);
    if (op === '-' && item.t === 'hole') return openStruct(state, 'neg');
    return insertAfter(state, [opTok(op), holeMark('insert')], op);
  }
  const { rowKey, from, to } = spanOf(state);
  const row = rowByKey(state.root, rowKey);
  const cover = findCover(row, from, to);
  const parent = cover.node.from === from && cover.node.to === to ? cover.parent : null;
  const factor = parent?.kind === 'product' && parent.kids.some(kid => kid.from === from && kid.to === to);
  if (factor && op !== '*') {
    const inner = row.slice(from, to + 1).concat([opTok(op), holeMark('insert')]);
    return replaceSpan(state, rowKey, from, to, [makeParen(inner, false)], null, op);
  }
  const merged = row.slice();
  merged.splice(to + 1, 0, opTok(op), holeMark('insert'));
  return finishMarked(state, setRow(state.root, rowKey, merged), null, op);
}

function upgradeOp(state, op) {
  const target = state.target;
  if (target.mode !== 'insert') return operate(state, op);
  const rowKey = rowKeyOf(target.path);
  const index = target.path[target.path.length - 1];
  const row = rowByKey(state.root, rowKey).slice();
  if (index > 0 && row[index - 1]?.t === 'op') {
    row[index - 1] = opTok(op);
    return step(state, { root: setRow(state.root, rowKey, row), target, lastFace: op });
  }
  return operate(state, op);
}

function nearestTemplate(state) {
  const path = state.target.mode === 'select'
    ? itemPath(state.target.row, state.target.from)
    : state.target.path;
  let found = null;
  for (let length = 1; length < path.length; length += 2) {
    const itemPathNow = path.slice(0, length);
    const item = getItem(state.root, itemPathNow);
    if (item && (item.t === 'fn' || item.t === 'deriv' || item.t === 'integ' || item.t === 'sigma' || item.t === 'xroot')) {
      found = { path: itemPathNow, item, slot: path[length] };
    }
  }
  return found;
}

function comma(state) {
  const found = nearestTemplate(state);
  if (!found) throw new RPLError('Too many arguments');
  const order = readingOf(found.item);
  const pos = order.indexOf(found.slot);
  if (pos >= 0 && pos < order.length - 1) {
    return selectSlotRoot(state, found.path, order[pos + 1]);
  }
  if (found.item.t === 'fn') {
    const spec = KNOWN_FUNCTIONS[found.item.name];
    const variadic = !spec || spec.arity === undefined;
    if (variadic) {
      const slots = found.item.slots.concat([freezeRow([holeMark('insert')])]);
      const root = updateItem(state.root, found.path, () => Object.freeze({ ...found.item, slots: Object.freeze(slots) }));
      return finishMarked(state, root, null, ',');
    }
  }
  throw new RPLError('Too many arguments');
}

function closeGroup(state) {
  const path = state.target.mode === 'select'
    ? itemPath(state.target.row, state.target.to)
    : state.target.path;
  for (let length = path.length - 2; length >= 1; length -= 2) {
    const owner = path.slice(0, length);
    const item = getItem(state.root, owner);
    if (item && (item.t === 'paren' || item.t === 'fn')) {
      return landSelect(state, rowKeyOf(owner), owner.at(-1), owner.at(-1));
    }
  }
  return state;
}

function backspace(state) {
  const target = state.target;
  if (target.mode === 'select' || target.mode === 'clear') {
    const { rowKey, from, to } = spanOf(state);
    const last = lastStopIn(state.root, rowKey, from, to);
    if (!last) return state;
    return move(state, { mode: 'insert', path: last });
  }
  const item = getItem(state.root, target.path);
  if ((item.t === 'num' || item.t === 'name') && item.text.length > 1) {
    return putLeaf(state, item.t === 'num' ? numLeaf(item.text.slice(0, -1)) : nameLeaf(item.text.slice(0, -1)));
  }
  const rowKey = rowKeyOf(target.path);
  const index = target.path[target.path.length - 1];
  const row = rowByKey(state.root, rowKey);
  if (item.t !== 'hole') {
    const next = row.slice();
    next[index] = holeMark('insert');
    return finishMarked(state, setRow(state.root, rowKey, next));
  }
  if (index > 0 && row[index - 1]?.t === 'op') {
    const prev = row[index - 2];
    const how = prev && (prev.t === 'num' || prev.t === 'name' || prev.t === 'hole') ? 'insert' : 'select';
    const merged = row.slice(0, index - 1).concat(row.slice(index + 1));
    if (prev) merged[index - 2] = marked(prev, how);
    return finishMarked(state, setRow(state.root, rowKey, merged));
  }
  if (!rowKey) return state;
  if (row.length === 1) return backspaceStructure(state, rowKey);
  return moveSide(state, -1);
}

function slotEmpty(row) {
  return row.length === 1 && row[0].t === 'hole';
}

function backspaceStructure(state, rowKey) {
  const parts = rowKey.split('.').map(Number);
  const slot = parts.pop();
  const owner = getItem(state.root, parts);
  const allEmpty = owner.slots.every(slotRow => slotEmpty(slotRow));
  const parentKey = rowKeyOf(parts);
  const index = parts[parts.length - 1];
  if (allEmpty) {
    const row = rowByKey(state.root, parentKey).slice();
    row[index] = holeMark('insert');
    return finishMarked(state, setRow(state.root, parentKey, row));
  }
  const keep = specOf(owner).wrap;
  if (!slotEmpty(owner.slots[keep])) {
    const kept = owner.slots[keep].slice();
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = marked(last, last.t === 'hole' || last.t === 'num' || last.t === 'name' ? 'insert' : 'select');
    const row = rowByKey(state.root, parentKey).slice();
    row.splice(index, 1, ...kept);
    return finishMarked(state, setRow(state.root, parentKey, row));
  }
  return moveSide(state, -1);
}

function deleteTarget(state) {
  const { rowKey, from, to } = spanOf(state);
  const row = rowByKey(state.root, rowKey);
  if (row[from]?.t === 'op' && row[from].op === '-') {
    return replaceSpan(state, rowKey, from, to, [opTok('+'), holeMark('clear')]);
  }
  return replaceSpan(state, rowKey, from, to, [holeMark('clear')]);
}

function clearAll(state) {
  return step(state, { root: freezeRow([HOLE]), target: { mode: 'insert', path: [0] }, lastFace: null });
}

function undoState(state) {
  if (!state.history.length) return state;
  const prev = state.history[state.history.length - 1];
  return {
    root: prev.root,
    target: prev.target,
    lastFace: prev.lastFace ?? null,
    history: state.history.slice(0, -1),
    future: state.future.concat([snapshot(state)]),
    typingKey: null,
  };
}

function redoState(state) {
  if (!state.future.length) return state;
  const next = state.future[state.future.length - 1];
  return {
    root: next.root,
    target: next.target,
    lastFace: next.lastFace ?? null,
    history: state.history.concat([snapshot(state)]).slice(-100),
    future: state.future.slice(0, -1),
    typingKey: null,
  };
}

function toggleNeg(state) {
  const target = state.target;
  if (target.mode === 'insert') {
    const item = getItem(state.root, target.path);
    if (item.t === 'num' && item.text.includes('E')) {
      const text = item.text.includes('E-') ? item.text.replace('E-', 'E') : item.text.replace('E', 'E-');
      return putLeaf(state, numLeaf(text));
    }
    const owner = enclosing(state, 'neg');
    if (owner && item.t !== 'hole') {
      const rowKey = rowKeyOf(owner);
      const index = owner[owner.length - 1];
      const neg = getItem(state.root, owner);
      const inner = neg.slots[0].slice();
      const row = rowByKey(state.root, rowKey).slice();
      row.splice(index, 1, ...inner);
      const root = setRow(state.root, rowKey, row);
      const kept = target.path.slice();
      kept.splice(owner.length - 1, 2);
      return step(state, { root, target: { mode: 'insert', path: kept.length ? kept : target.path.slice(-1) }, lastFace: '+/-' });
    }
    const wrapped = makeStruct('neg', [[item]]);
    const { rowKey, from } = spanOf(state);
    const row = rowByKey(state.root, rowKey).slice();
    row[from] = wrapped;
    const root = setRow(state.root, rowKey, row);
    const path = itemPath(rowKey, from).concat(0, 0);
    return step(state, { root, target: { mode: 'insert', path }, lastFace: '+/-' });
  }
  const { rowKey, from, to } = spanOf(state);
  const row = rowByKey(state.root, rowKey);
  if (from === to && row[from]?.t === 'neg') {
    const inner = row[from].slots[0].slice();
    const last = inner[inner.length - 1];
    inner[inner.length - 1] = marked(last, 'select');
    return replaceSpan(state, rowKey, from, to, inner);
  }
  return postfix(state, makeStruct('neg', [targetItems(state)]));
}

function enclosing(state, kind) {
  const path = state.target.path;
  if (!path) return null;
  for (let length = path.length - 2; length >= 1; length -= 2) {
    const owner = path.slice(0, length);
    if (getItem(state.root, owner)?.t === kind) return owner;
  }
  return null;
}

function isLetterFace(face) {
  return /^[A-Za-zΑ-Ωα-ω]$/.test(face);
}

export function pressEquationKey(state, face) {
  if (face === 'UNDO') return undoState(state);
  if (face === 'REDO') return redoState(state);
  if (face === 'CLEAR') return clearAll(state);
  if (face === '⌫') return backspace(state);
  if (face === 'DEL') return deleteTarget(state);
  if (face === '▲') return grow(state);
  if (face === '▼') return shrink(state);
  if (face === '◀') return moveSide(state, -1);
  if (face === '▶') return moveSide(state, 1);
  if (face === 'RS▲') return selectAll(state);
  if (face === 'RS◀') return extendRun(state, -1);
  if (face === 'RS▶') return extendRun(state, 1);
  if (face === ',') return comma(state);
  if (face === ')') return closeGroup(state);
  if (face === '=' && state.lastFace === '<') return upgradeOp(state, '≤');
  if (face === '=' && state.lastFace === '>') return upgradeOp(state, '≥');
  if (face === 'π' || face === '∞' || face === 'const:i') return typeConstant(state, face === 'const:i' ? 'i' : face);
  if (STRUCT_FACE[face]) return structureKey(state, STRUCT_FACE[face]);
  if (FN_FACE[face]) return structureKey(state, 'fn', FN_FACE[face]);
  if (face === 'EEX' || /^[0-9.]$/.test(face)) return typeGlyph(state, face, 'num');
  if (isLetterFace(face)) return typeGlyph(state, face, 'name');
  const op = { '+': '+', '−': '-', '-': '-', '×': '*', '*': '*', '≠': '≠', '=': '=', '≤': '≤', '<': '<', '≥': '≥', '>': '>' }[face];
  if (op) return operate(state, op);
  if (face === '÷') return structureKey(state, 'frac');
  if (face === 'yˣ') return structureKey(state, 'pow');
  if (face === 'x²') return postfix(state, makeStruct('pow', [targetItems(state), [numLeaf('2')]]));
  if (face === '1/x') return postfix(state, makeStruct('frac', [[numLeaf('1')], targetItems(state)]));
  if (face === '!') return postfix(state, makeStruct('fact', [targetItems(state)]));
  if (face === '+/-') return toggleNeg(state);
  if (isKnownFunction(face)) return structureKey(state, NAME_KIND[face.toUpperCase()] || 'fn', face);
  throw new RPLError(`${face}: not available in EQW`);
}

export function applyOpsToAst(ast, ops) {
  const stack = new Stack();
  stack.push(Symbolic(ast));
  for (let index = 0; index < ops.length; index++) {
    const top = stack.peek(1);
    if (index > 0 && !isSymbolic(top)) break;
    if (index > 0 && ops[index] === 'SIMPLIFY' && !giac.isReady()) continue;
    lookup(ops[index]).fn(stack);
  }
  return valueToAst(stack.peek(1));
}

export function replaceTarget(state, items) {
  const { rowKey, from, to } = spanOf(state);
  const markedItems = items.slice();
  const last = markedItems[markedItems.length - 1];
  markedItems[markedItems.length - 1] = marked(last, 'select');
  return replaceSpan(state, rowKey, from, to, markedItems);
}

export function cutTarget(state) {
  const text = formatAlgebra(targetAst(state));
  const { rowKey, from, to } = spanOf(state);
  const next = replaceSpan(state, rowKey, from, to, [holeMark('clear')]);
  next.cutText = text;
  return next;
}

export function pasteText(state, text) {
  const ast = parseAlgebra(String(text ?? '').trim());
  return replaceTarget(state, [...fromAst(ast)]);
}

export function placeCursor(state, path) {
  const item = getItem(state.root, path);
  if (!item || item.t === 'op') return state;
  return move(state, { mode: 'insert', path });
}

export function selectBetween(state, pathA, pathB) {
  if (pathA.join('.') === pathB.join('.')) return placeCursor(state, pathA);
  const rowA = rowKeyOf(pathA);
  const rowB = rowKeyOf(pathB);
  if (rowA === rowB) {
    const from = Math.min(pathA.at(-1), pathB.at(-1));
    const to = Math.max(pathA.at(-1), pathB.at(-1));
    const row = rowByKey(state.root, rowA);
    const cover = findCover(row, from, to);
    if (cover.node.kind === 'sum' || cover.node.kind === 'product') {
      const kids = cover.node.kids.filter(kid => kid.to >= from && kid.from <= to);
      if (kids.length >= 1) {
        return landSelect(state, rowA, kids[0].from, kids[kids.length - 1].to);
      }
    }
    return landSelect(state, rowA, cover.node.from, cover.node.to);
  }
  return selectAll(state);
}

export function keypadFace(key, shift) {
  const alpha = shift === 'alpha' || shift === 'alphaLock';
  if (alpha && key.alpha) return key.alpha;
  const left = shift === 'shiftL' || shift === 'shiftLLock';
  const right = shift === 'shiftR' || shift === 'shiftRLock';
  if (left) return key.shiftL || key.primary;
  if (right) {
    if (key.primary === '▲' || key.primary === '▼' || key.primary === '◀' || key.primary === '▶') {
      return `RS${key.primary}`;
    }
    return key.shiftR || key.primary;
  }
  return key.primary;
}

export function isEquationFace(face) {
  return face === 'const:i' || MODEL_LABELS.has(face) || isLetterFace(face) || isKnownFunction(face);
}

export function physicalFace(event) {
  if (event.altKey) return null;
  if (event.ctrlKey || event.metaKey) {
    const key = String(event.key || '').toLowerCase();
    if (key === 'z' && event.shiftKey) return 'REDO';
    if (key === 'z') return 'UNDO';
    if (key === 'y') return 'REDO';
    if (key === 'c') return 'COPY';
    if (key === 'x') return 'CUT';
    if (key === 'v') return 'PASTE';
    if (key === 'a') return 'RS▲';
    return null;
  }
  if (event.shiftKey && event.key === 'ArrowDown') return 'NOOP';
  const arrows = {
    ArrowUp: event.shiftKey ? 'RS▲' : '▲',
    ArrowDown: '▼',
    ArrowLeft: event.shiftKey ? 'RS◀' : '◀',
    ArrowRight: event.shiftKey ? 'RS▶' : '▶',
    Home: 'RS◀',
    End: 'RS▶',
    Backspace: '⌫',
    Delete: 'DEL',
    Enter: 'ENTER',
    Escape: 'ON',
  };
  if (arrows[event.key]) return arrows[event.key];
  if (event.key === ' ') return 'NOOP';
  const map = {
    '+': '+', '-': '−', '−': '−', '*': '×', '×': '×', '·': '×',
    '/': '÷', '÷': '÷', '^': 'yˣ', '!': '!', '(': '( )', ')': ')', ',': ',',
    '=': '=', '<': '<', '>': '>', '≠': '≠', '≤': '≤', '≥': '≥',
    '√': '√x', '²': 'x²', 'π': 'π', '∞': '∞', '∫': '∫', '∂': '∂',
  };
  if (map[event.key]) return map[event.key];
  if (event.key === '.' || /^[0-9]$/.test(event.key) || isLetterFace(event.key)) return event.key;
  if (event.key?.length === 1) return 'UNAVAILABLE';
  return null;
}

export class EquationEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'eqw-editor';
    const palette = document.createElement('div');
    palette.className = 'eqw-palette';
    const featured = document.createElement('div');
    featured.className = 'eqw-featured';
    for (const item of EQW_FEATURED) featured.appendChild(this._paletteButton(item));
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'eqw-more-toggle';
    moreBtn.textContent = 'More…';
    moreBtn.title = 'Digits, operators, functions, and the rest of the Greek alphabet';
    moreBtn.addEventListener('mousedown', (event) => event.preventDefault());
    moreBtn.addEventListener('click', () => {
      this._moreOpen = !this._moreOpen;
      this.el.classList.toggle('eqw-more-open', this._moreOpen);
      moreBtn.textContent = this._moreOpen ? 'Less' : 'More…';
    });
    featured.appendChild(moreBtn);
    palette.appendChild(featured);
    const more = document.createElement('div');
    more.className = 'eqw-more';
    for (const group of EQW_PALETTE) {
      const row = document.createElement('div');
      row.className = 'eqw-palette-group';
      const heading = document.createElement('span');
      heading.className = 'eqw-palette-label';
      heading.textContent = group.name;
      row.appendChild(heading);
      for (const item of group.items) row.appendChild(this._paletteButton(item));
      more.appendChild(row);
    }
    palette.appendChild(more);
    this.el.appendChild(palette);
    this._focusNote = document.createElement('div');
    this._focusNote.className = 'eqw-focus-note';
    this.el.appendChild(this._focusNote);
    this.view = document.createElement('div');
    this.view.className = 'eqw-view';
    this.view.tabIndex = -1;
    this.el.appendChild(this.view);
    this._syncFocusChrome();
    this._open = false;
    this._focused = false;
    this._moreOpen = false;
    this._line = false;
    this.big = true;
    this.state = emptyEquation();
    this.replacesLevel1 = false;
    this.original = null;
    this._drag = null;
    this.view.addEventListener('pointerdown', (event) => this._pointerDown(event));
    this.view.addEventListener('pointermove', (event) => this._pointerMove(event));
    this.view.addEventListener('pointerup', () => { this._drag = null; });
  }

  isOpen() { return this._open; }
  ownsKeyboard() {
    const panel = this.app?.sidePanel;
    return this._open && this._focused && !this._line
      && !!panel?.isOpen?.() && panel.tab === 'equation';
  }

  _paletteButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.title = item.title;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.insertPaletteFace(item.face));
    return button;
  }

  _syncFocusChrome() {
    const live = !!this._focused;
    this.el.classList.toggle('eqw-live', live);
    this.view?.classList.toggle('eqw-focused', live);
    if (!this._focusNote) return;
    this._focusNote.textContent = live
      ? 'Typing · Escape returns to the calculator'
      : 'Click the expression to type';
  }

  focusEquation() {
    if (!this._open || this._line) return;
    this._focused = true;
    this._syncFocusChrome();
    this.app?.activateEquationKeys?.();
  }

  blurEquation() {
    if (!this._focused) return;
    this._focused = false;
    this._syncFocusChrome();
    this.app?.deactivateEquationKeys?.();
  }
  isLineEditing() { return this._line; }

  open({ value = null, replacesLevel1 = false } = {}) {
    this.original = replacesLevel1 ? value : null;
    this.replacesLevel1 = !!replacesLevel1;
    this.state = value ? equationFromValue(value) : emptyEquation();
    this._open = true;
    this._focused = false;
    this._syncFocusChrome();
    this._line = false;
    this.big = this.big !== false;
    this._render();
  }

  close() {
    this._open = false;
    this._focused = false;
    this._syncFocusChrome();
    this._line = false;
    this._drag = null;
    if (this.view) this.view.innerHTML = '';
  }

  loadFromStack(level = 1) {
    const value = this.app.stack.peek(level);
    if (!isSymbolic(value) && !isName(value)) {
      this.app.entry.flashError({ message: 'not an algebraic' });
      return false;
    }
    this.open({ value, replacesLevel1: level === 1 });
    return true;
  }

  menuSlots() {
    const big = this.big ? 'BIG■' : 'BIG';
    return [
      { label: 'EDIT', onPress: () => this.editTargetAsText() },
      { label: 'EXPA', onPress: () => this.applyNamed('EXPA') },
      { label: big, onPress: () => this.toggleBig() },
      { label: 'EVAL', onPress: () => this.applyNamed('EVAL') },
      { label: 'FACTO', onPress: () => this.applyNamed('FACTO') },
      { label: 'SIMP', onPress: () => this.applyNamed('SIMP') },
      { label: 'CMDS', onPress: () => this.showCmds() },
      { label: '→NUM', onPress: () => this.applyNamed('→NUM') },
      { label: 'COPY', onPress: () => this.copy() },
      { label: 'CUT', onPress: () => this.cut() },
      { label: 'PASTE', onPress: () => this.paste() },
      { label: '', onPress: () => {} },
    ];
  }

  showCmds() {
    const slots = [{ label: 'EXIT', onPress: () => this.app.setMenu(this.menuSlots(), 'EQW') }];
    for (const name of EQW_CMDS) {
      slots.push({ label: name, onPress: () => { this.applyOps([name]); this.app.setMenu(this.menuSlots(), 'EQW'); } });
    }
    this.app.setMenu(slots, 'EQW');
  }

  toggleBig() {
    this.big = !this.big;
    this.app.setMenu(this.menuSlots(), 'EQW');
    this._render();
  }

  insertPaletteFace(face) {
    if (!this._open) this.open();
    this.pressFace(face);
  }

  pressKeypad(key, shift) {
    if ((shift === 'shiftL' || shift === 'shiftLLock') && key.primary === '`' && key.shiftL === 'i') {
      this.pressFace('const:i');
      return;
    }
    const face = keypadFace(key, shift);
    if (face) this.pressFace(face);
  }

  pressFace(face) {
    if (!face || face === 'NOOP') return;
    if (face === 'UNAVAILABLE') {
      this.app.entry.flashError({ message: 'not available in EQW' });
      return;
    }
    if (EQW_APP_FACES.has(face)) { this._appFace(face); return; }
    if (EQW_UNAVAILABLE_FACES.has(face)) {
      this.app.entry.flashError({ message: `${face}: not available in EQW` });
      return;
    }
    try { this.state = pressEquationKey(this.state, face); }
    catch (error) { this.app.entry.flashError(error); return; }
    this._render();
  }

  handleKeyDown(event) {
    const face = physicalFace(event);
    if (face == null) return false;
    if (face === 'NOOP') return true;
    this.pressFace(face);
    return true;
  }

  typeText(text) {
    for (const char of String(text)) this.pressFace(char === 'i' ? 'i' : char);
  }

  pressCommand(name) {
    if (EQW_CMDS.includes(name)) { this.applyOps([name]); return; }
    if (isKnownFunction(name)) { this.pressFace(name); return; }
    this.app.entry.flashError({ message: `${name}: not available in EQW` });
  }

  editTargetAsText() {
    let ast;
    try { ast = targetAst(this.state); }
    catch (error) { this.app.entry.flashError(error); return; }
    const text = formatAlgebra(ast);
    this._line = true;
    this.app.entry.buffer = text;
    this.app.entry.cursor = text.length;
    this.app.entry.error = '';
    this.app.entry._emit();
    this.app.entry.focus();
  }

  commitLineEdit() {
    try {
      const ast = parseAlgebra(this.app.entry.buffer.trim());
      this.state = replaceTarget(this.state, [...fromAst(ast)]);
    } catch (error) {
      this.app.entry.flashError(error);
      return;
    }
    this._line = false;
    this.app.entry.buffer = '';
    this.app.entry.cursor = 0;
    this.app.entry.error = '';
    this.app.entry._emit();
    this.app.entry.blur();
    this._render();
  }

  cancelLineEdit() {
    this._line = false;
    this.app.entry.buffer = '';
    this.app.entry.cursor = 0;
    this.app.entry.error = '';
    this.app.entry._emit();
    this.app.entry.blur();
  }

  commit() {
    let value;
    try { value = valueFromEquation(this.state.root); }
    catch (error) { this.app.entry.flashError(error); return; }
    this.app.entry._snapForUndo();
    if (this.replacesLevel1 && this.app.stack.depth >= 1 && this.app.stack.peek(1) === this.original) {
      this.app.stack.pop();
    }
    this.app.stack.push(value);
    this.replacesLevel1 = false;
    this.original = null;
    this.app.display.renderStack(this.app.stack);
  }

  cancel() { this.blurEquation(); }

  applyNamed(name) { this.applyOps(EQW_ACTION_OPS[name]); }

  applyOps(ops) {
    let ast;
    try { ast = targetAst(this.state); }
    catch (error) { this.app.entry.flashError(error); return; }
    try {
      const result = applyOpsToAst(ast, ops);
      this.state = replaceTarget(this.state, [...fromAst(result)]);
      this._render();
    } catch (error) {
      this.app.entry.flashError(error);
    }
  }

  copy() { this._clip(false); }
  cut() { this._clip(true); }

  _clip(remove) {
    try {
      const next = remove ? cutTarget(this.state) : null;
      const text = remove ? next.cutText : formatAlgebra(targetAst(this.state));
      const write = navigator.clipboard?.writeText(text);
      if (write && typeof write.then === 'function') write.catch(() => {});
      if (remove) { this.state = next; this._render(); }
    } catch (error) {
      this.app.entry.flashError(error);
    }
  }

  paste() {
    const read = navigator.clipboard?.readText();
    if (!read || typeof read.then !== 'function') {
      this.app.entry.flashError({ message: 'Clipboard unavailable' });
      return;
    }
    read.then((text) => {
      try { this.state = pasteText(this.state, text); this._render(); }
      catch (error) { this.app.entry.flashError(error); }
    }).catch((error) => this.app.entry.flashError(error));
  }

  _appFace(face) {
    if (/^F[1-6]$/.test(face)) { this.app.pressSoftKey(Number(face[1]) - 1); return; }
    if (face === 'PREV') { this.app.prevMenuPage(); return; }
    if (face === 'NEXT') { this.app.nextMenuPage(); return; }
    if (face === 'TOOLS') { this.app.toggleSidePanel('commands'); return; }
    if (face === 'ENTER') { this.commit(); return; }
    if (face === 'ON') { this.cancel(); return; }
    if (face === 'EVAL' || face === '→NUM') { this.applyNamed(face); return; }
    if (face === 'COPY') { this.copy(); return; }
    if (face === 'CUT') { this.cut(); return; }
    if (face === 'PASTE') { this.paste(); return; }
  }

  _render() {
    if (!this.view || !this._open) return;
    const size = (parseFloat(getComputedStyle(this.view).fontSize) || 22) * (this.big ? 1.25 : 0.85);
    const target = this.state.target;
    const drawn = eqwToSvg(this.state.root, {
      size,
      caret: target.mode === 'insert' ? target.path.join('.') : null,
      boxed: target.mode === 'clear' ? target.path.join('.') : null,
      selected: target.mode === 'select' ? { row: target.row, from: target.from, to: target.to } : null,
      clipId: 'eqw-selection',
    });
    this._rects = drawn.rects;
    let label = '■';
    try { label = formatAlgebra(toAst(this.state.root)); } catch { label = '■'; }
    const aria = label.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    this.view.innerHTML = drawn.svg.replace('<svg ', `<svg role="img" aria-label="${aria}" `);
    const rect = target.mode === 'insert'
      ? drawn.rects.get(target.path.join('.'))
      : target.mode === 'clear'
        ? drawn.rects.get(target.path.join('.'))
        : null;
    if (rect && this.view.scrollTo) {
      const margin = 8;
      if (rect.x < this.view.scrollLeft + margin) this.view.scrollLeft = Math.max(0, rect.x - margin);
      if (rect.x + rect.w > this.view.scrollLeft + this.view.clientWidth - margin) {
        this.view.scrollLeft = rect.x + rect.w - this.view.clientWidth + margin;
      }
    }
  }

  _point(event) {
    const svg = this.view.querySelector('svg');
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }

  _hit(point) {
    if (!point || !this._rects) return null;
    let best = null;
    for (const [key, rect] of this._rects) {
      if (point.x < rect.x || point.x > rect.x + rect.w || point.y < rect.y || point.y > rect.y + rect.h) continue;
      const rank = rect.kind === 'leaf' || rect.kind === 'hole' ? 0 : rect.kind === 'op' ? 1 : 2;
      const area = rect.w * rect.h;
      if (!best || rank < best.rank || (rank === best.rank && area < best.area)) best = { key, rect, rank, area };
    }
    return best;
  }

  _pointerDown(event) {
    this.focusEquation();
    if (!this.ownsKeyboard()) return;
    const hit = this._hit(this._point(event));
    if (!hit) return;
    const path = hit.key.split('.').map(Number);
    if (hit.rect.kind === 'leaf' || hit.rect.kind === 'hole') {
      this.state = placeCursor(this.state, path);
    } else if (hit.rect.kind === 'op') {
      this.state = selectBetween(this.state, path, path);
    } else {
      this.state = landSelect(this.state, rowKeyOf(path), path.at(-1), path.at(-1));
    }
    this._drag = path;
    this._render();
  }

  _pointerMove(event) {
    if (!this._drag || !this.ownsKeyboard()) return;
    const hit = this._hit(this._point(event));
    if (!hit || (hit.rect.kind !== 'leaf' && hit.rect.kind !== 'hole')) return;
    const path = hit.key.split('.').map(Number);
    this.state = selectBetween(this.state, this._drag, path);
    this._render();
  }
}

