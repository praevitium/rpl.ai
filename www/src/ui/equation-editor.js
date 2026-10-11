import {
  parseAlgebra, formatAlgebra, isKnownFunction, KNOWN_FUNCTIONS, freeVars, astEqual, numText,
  Num, Var, Neg, Bin, Fn, UnitNode, unitSuffix, hasUnits, isNum, isVar, isNeg, isBin, isFn,
} from '../rpl/algebra.js';
import { eqwToSvg, astToSvg } from '../rpl/pretty.js';
import { Symbolic, Name, Real, isSymbolic, isNumber, isName, isInteger, isReal, isList, isUnit, Integer } from '../rpl/types.js';
import { format } from '../rpl/formatter.js';
import { astLatex, parseMath } from '../rpl/latex.js';
import { RPLError, Stack } from '../rpl/stack.js';
import { lookup } from '../rpl/ops.js';
import { parseEntry } from '../rpl/parser.js';
import { _astToRplValue } from '../rpl/ops/internal.js';
import { giac } from '../rpl/cas/giac-engine.mjs';
import { state as calcState, toRadians, fromRadians } from '../rpl/state.js';
import { evalNumeric } from './plot-engine.js';
import { escapeHtml } from './display.js';
import { writerKeys } from './input-area.js';

const HOLE = Object.freeze({ t: 'hole' });

const RELS = new Set(['=', '≠', '<', '>', '≤', '≥']);

const EQW_STRUCTS = Object.freeze({
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

const EQW_ACTION_OPS = Object.freeze({
  EVAL: Object.freeze(['EVAL', 'SIMPLIFY']),
  '→NUM': Object.freeze(['EVAL', 'SIMPLIFY', '→NUM']),
  FACTO: Object.freeze(['FACTOR']),
  SIMP: Object.freeze(['SIMPLIFY']),
  EXPA: Object.freeze(['EXPAND']),
});

export const EQW_APP_FACES = new Set([
  'ENTER', 'ON', 'EVAL', '→NUM', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'PREV', 'NEXT', 'CAT', 'EQW', 'COPY', 'CUT', 'PASTE',
]);

export const EQW_UNAVAILABLE_FACES = new Set([
  'LASTARG', 'VARS', 'HOME', 'STO', 'RCL', 'CST', 'SST', '`', '|',
  '∠', '#', "'", '[ ]', '" "', '{ }', '« »', '::', '↵', '→', 'SPC',
  'CONT', '↰', '↱',
]);

const MODEL_LABELS = new Set([
  ...'0123456789', '.', 'EEX', '+', '−', '-', '×', '*', '÷', '/',
  'yˣ', 'eˣ', 'LN', '√x', 'x²', 'ⁿ√y', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS',
  'ATAN', 'ABS', 'ARG', 'LOG', '10ˣ', 'ALOG', 'Σ', '∂', '∫', '1/x', '+/-',
  '( )', ')', ',', '!', 'π', '∞', 'i', 'e', '_',
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
  SQRT: 'sqrt', EXP: 'exp', XROOT: 'xroot', FACT: 'fact', DERIV: 'deriv', INTEG: 'integ', 'Σ': 'sigma',
};

const STRUCT_FACE = {
  '√x': 'sqrt', 'ⁿ√y': 'xroot', 'eˣ': 'exp', '( )': 'paren',
  'Σ': 'sigma', '∂': 'deriv', '∫': 'integ',
};

export const EQW_INSERTS = Object.freeze([
  Object.freeze({ face: '√x', label: '√', title: 'Square root' }),
  Object.freeze({ face: 'ⁿ√y', label: 'ⁿ√', title: 'nth root' }),
  Object.freeze({ face: '∂', label: '∂', title: 'Derivative' }),
  Object.freeze({ face: '∫', label: '∫', title: 'Integral' }),
  Object.freeze({ face: 'Σ', label: 'Σ', title: 'Sum' }),
  Object.freeze({ face: 'ABS', label: '|x|', title: 'Absolute value' }),
  Object.freeze({ face: '∞', label: '∞', title: 'Infinity' }),
  Object.freeze({ face: '≠', label: '≠', title: 'Not equal' }),
  Object.freeze({ face: '≤', label: '≤', title: 'Less or equal (or type <=)' }),
  Object.freeze({ face: '≥', label: '≥', title: 'Greater or equal (or type >=)' }),
  Object.freeze({ face: 'π', label: 'π', title: 'Pi (or type pi)' }),
  Object.freeze({ face: 'const:i', label: 'i', title: 'Imaginary unit' }),
]);

const GREEK_WORDS = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', pi: 'π',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
});

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

function withSlot(item, index, items) {
  const slots = item.slots.slice();
  slots[index] = freezeRow(items);
  return Object.freeze({ ...item, slots: Object.freeze(slots) });
}

function readingOf(item) {
  return EQW_STRUCTS[item.t]?.reading || item.slots.map((_, index) => index);
}

function specOf(item) {
  return EQW_STRUCTS[item.t];
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
  row[index] = withSlot(item, path[1], updateItem(item.slots[path[1]], path.slice(2), fn));
  return freezeRow(row);
}

function normalizeOne(item) {
  if (item.t === 'paren' && !item.typed && !item.mark) {
    const inner = normalizeItems(item.slots[0]);
    if (inner.length === 1 && inner[0].t !== 'op') return inner[0];
    return withSlot(item, 0, inner);
  }
  if (item.slots) {
    const slots = item.slots.map(slot => freezeRow(normalizeItems(slot)));
    return Object.freeze({ ...item, slots: Object.freeze(slots) });
  }
  return item;
}

function normalizeItems(items) {
  const out = items.filter(Boolean).map(normalizeOne);
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
  return updateItem(root, parts, (item) => withSlot(item, slot, row));
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
    kids: factors.map(([startAt]) => parseAtom(startAt)),
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
    if (ast.value < 0) return [makeStruct('neg', [[numLeaf(numText(Num(-ast.value, ast.real)))]])];
    return [numLeaf(numText(ast))];
  }
  if (ast.kind === 'unit') {
    const leaf = numLeaf(`${Math.abs(ast.value)}_${unitSuffix(ast.uexpr)}`);
    return ast.value < 0 ? [makeStruct('neg', [[leaf]])] : [leaf];
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
  if ((asRight && isAddLike(node)) || (isBin(node) && RELS.has(node.op))) return [makeParen(fromAst(node), false)];
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
    if (text.includes('_')) return unitLeafAst(text);
    if (/^\d+$/.test(text)) return Num(BigInt(text));
    if (!/^(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?$/i.test(text)) throw new RPLError('Incomplete Subexpression');
    return Num(Number(text), true);
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

function unitLeafAst(text) {
  let ast;
  try { ast = parseAlgebra(text); }
  catch (error) { throw new RPLError(error.message.replace(/ at pos \d+$/, '')); }
  if (ast.kind !== 'unit') throw new RPLError('Incomplete Subexpression');
  return ast;
}

export function toAst(row) {
  if (!row || !row.length) throw new RPLError('Incomplete Subexpression');
  if (row.filter((item) => item.t === 'op' && RELS.has(item.op)).length > 1) {
    throw new RPLError('Only one = or comparison fits in an expression');
  }
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
  if (isUnit(value)) return UnitNode(value.value, value.uexpr);
  throw new RPLError('Result not editable in EQW');
}

export function valueFromEquation(root) {
  const ast = toAst(root);
  if (ast.kind === 'num' && !ast.real && Number.isInteger(ast.value) && ast.digits === undefined) {
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
  const parentKey = rowKeyOf(parts);
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
  const { node } = findCover(row, target.from, target.to);
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
  const kid = (node.kids || []).find(child => child.from >= target.from && child.to <= target.to);
  if (kid) return landSelect(state, target.row, kid.from, kid.to);
  return state;
}

function kidBeside(kids, target, dir) {
  const covered = kids.filter(kid => kid.to >= target.from && kid.from <= target.to);
  const edge = dir > 0 ? covered[covered.length - 1] : covered[0];
  const index = kids.findIndex(kid => kid.from === edge.from && kid.to === edge.to);
  return kids[index + dir];
}

function siblingSpan(state, dir) {
  const target = state.target;
  if (target.mode !== 'select') return null;
  const row = rowByKey(state.root, target.row);
  const cover = findCover(row, target.from, target.to);
  const parent = cover.node.from === target.from && cover.node.to === target.to ? cover.parent : cover.node;
  if (parent?.kids) {
    const next = kidBeside(parent.kids, target, dir);
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
    // Past the last leaf of a box, ▶ steps out to the structure that holds it (W-L22).
    if (dir > 0 && (target.mode === 'insert' || target.path.length > 1)) {
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
  return landSelect(state, jump.rowKey, jump.from, jump.to);
}

function extendRun(state, dir) {
  const target = state.target;
  if (target.mode !== 'select') {
    const all = stops(state.root);
    const path = dir < 0 ? all[0] : all[all.length - 1];
    return path ? move(state, stopTarget(state.root, path)) : state;
  }
  const row = rowByKey(state.root, target.row);
  const cover = findCover(row, target.from, target.to);
  const parent = cover.parent && (cover.parent.kind === 'sum' || cover.parent.kind === 'product')
    ? cover.parent
    : (cover.node.kind === 'sum' || cover.node.kind === 'product' ? cover.node : null);
  if (!parent) return state;
  const next = kidBeside(parent.kids, target, dir);
  if (!next) return state;
  const from = Math.min(target.from, next.from);
  const to = Math.max(target.to, next.to);
  return landSelect(state, target.row, from, to);
}

function extendSelection(state, dir) {
  const target = state.target;
  if (target.mode === 'select') {
    const wider = extendRun(state, dir);
    return wider === state ? grow(state) : wider;
  }
  const item = getItem(state.root, target.path);
  if (!item || item.t === 'hole') return moveSide(state, dir);
  return landSelect(state, rowKeyOf(target.path), target.path.at(-1), target.path.at(-1));
}

function selectAll(state) {
  const node = parseRel(state.root, 0, state.root.length);
  return move(state, { mode: 'select', row: '', from: node.from, to: node.to });
}

function putLeaf(state, item) {
  const path = state.target.path;
  const rowKey = rowKeyOf(path);
  const index = path[path.length - 1];
  const typingKey = `${path.join('.')}:${item.t}`;
  const root = setRow(state.root, rowKey, rowByKey(state.root, rowKey).map((entry, at) => (at === index ? item : entry)));
  const kept = stops(root).find(stop => stop.join('.') === path.join('.')) || path;
  return step(state, { root, target: { mode: 'insert', path: kept }, lastFace: state.lastFace }, typingKey);
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

// 2e3, 2e-3 and 2E+3 typed with the letter key read as 2E3, 2E-3 and 2E3, as on a keyboard.
function sciNotation(state, digit) {
  if (state.target.mode !== 'insert') return null;
  const path = state.target.path;
  const rowKey = rowKeyOf(path);
  const index = path[path.length - 1];
  const row = rowByKey(state.root, rowKey);
  const signed = row[index].t === 'hole' && ['-', '+'].includes(row[index - 1]?.op);
  const at = signed ? index - 2 : index;
  const [num, star, e] = [row[at - 2], row[at - 1], row[at]];
  if (e?.t !== 'name' || !/^[eE]$/.test(e.text) || star?.op !== '*' || num?.t !== 'num' || /[E_]/.test(num.text)) return null;
  const sign = signed && row[index - 1].op === '-' ? '-' : '';
  const merged = row.slice();
  merged.splice(at - 2, index - at + 3, marked(numLeaf(`${num.text}E${sign}${digit}`), 'insert'));
  return finishMarked({ ...state, lastFace: digit }, setRow(state.root, rowKey, merged));
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
  const typed = { ...state, lastFace: text };
  const leaf = kind === 'num' ? numLeaf(text === 'EEX' ? '1E' : text) : nameLeaf(text);
  const sci = kind === 'num' && /^\d$/.test(text) ? sciNotation(state, text) : null;
  if (sci) return sci;
  const item = getItem(state.root, target.path);
  if (target.mode === 'clear' || item.t === 'hole') return putLeaf(typed, leaf);
  if (kind === 'num' && item.t === 'num') {
    const next = text === 'EEX'
      ? (item.text.includes('E') ? null : `${item.text}E`)
      : `${item.text}${text}`;
    if (next && /^\d*\.?\d*(?:E-?\d*)?$/.test(next)) return putLeaf(typed, numLeaf(next));
  }
  if (kind === 'name' && item.t === 'name') return putLeaf(typed, nameLeaf(item.text + text));
  // A digit after a typed name joins it, so X1 is a name as on the HP, not X*1.
  if (kind === 'num' && /^\d$/.test(text) && item.t === 'name' && /^[A-Za-z]/.test(item.text)) return putLeaf(typed, nameLeaf(item.text + text));
  return implicitMul(typed, leaf);
}

const UNIT_FACES = { '×': '*', '÷': '/', 'yˣ': '^', '−': '-', '-': '-', '( )': '(', ')': ')' };

// Whether the text after the _ can still grow into a unit: a name with its power, m^-2, or a group, (m/s.
function unitPrefix(units) {
  if (!units.startsWith('(')) return /^(?:[A-Za-zΩμ°Å][A-Za-z0-9Ωμ°Å]*(?:\^[-+]?(?:\d+\.?\d*|\.\d*)?)?)?$/.test(units);
  let depth = 0;
  for (let at = 0; at < units.length; at++) {
    if (at > 0 && depth === 0) return false;
    depth += units[at] === '(' ? 1 : units[at] === ')' ? -1 : 0;
  }
  return true;
}

// Keys after 5_ spell its unit while they can, so 5_m^2 stays one number and 5_(m/s) takes the / in.
function typeUnit(state, face) {
  if (state.target.mode !== 'insert') return null;
  const item = getItem(state.root, state.target.path);
  const char = /^[A-Za-z0-9.ΩμÅ°]$/.test(face) ? face : UNIT_FACES[face];
  if (item?.t !== 'num' || !item.text.includes('_') || !char) return null;
  const text = item.text + char;
  return unitPrefix(text.slice(text.indexOf('_') + 1)) ? putLeaf({ ...state, lastFace: face }, numLeaf(text)) : null;
}

// − straight after EEX makes the exponent negative, as typing 2E-3 does.
function exponentSign(state, face) {
  if ((face !== '−' && face !== '-') || state.target.mode !== 'insert') return null;
  const item = getItem(state.root, state.target.path);
  return item?.t === 'num' && item.text.endsWith('E') && !item.text.includes('_') ? putLeaf(state, numLeaf(`${item.text}-`)) : null;
}

function startUnit(state) {
  const item = state.target.mode === 'insert' ? getItem(state.root, state.target.path) : null;
  if (item?.t !== 'num' || item.text.includes('_') || !/\d\.?$/.test(item.text)) {
    throw new RPLError('A unit goes right after a number, as in 5_m');
  }
  return putLeaf({ ...state, lastFace: '_' }, numLeaf(`${item.text}_`));
}

function typeConstant(state, text) {
  const target = state.target;
  if (target.mode === 'select') {
    const widened = insertAfterSelection(state, [opTok('*'), holeMark('insert')]);
    return typeGlyph(widened, text, 'name');
  }
  const item = getItem(state.root, target.path);
  if (target.mode === 'clear' || item.t === 'hole') return putLeaf(state, nameLeaf(text));
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

function openedStruct(kind, name) {
  const blank = emptyStruct(kind, name);
  return withSlot(blank, specOf(blank).open, [holeMark('insert')]);
}

function openStruct(state, kind, name) {
  const { rowKey, from, to } = spanOf(state);
  return replaceSpan(state, rowKey, from, to, [openedStruct(kind, name)], null, kind);
}

function wrapStruct(state, kind, name, slotItems) {
  const blank = emptyStruct(kind, name);
  const spec = specOf(blank);
  const wrapped = withSlot(blank, spec.wrap, slotItems);
  const item = spec.afterMode === 'select' ? marked(wrapped, 'select') : withSlot(wrapped, spec.after, [holeMark('insert')]);
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
    return insertAfter(state, [opTok('*'), openedStruct(kind, name)], kind);
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
  if (op === '*' && itemsAreSum(row.slice(from, to + 1))) {
    return replaceSpan(state, rowKey, from, to, [makeParen(row.slice(from, to + 1), false), opTok('*'), holeMark('insert')], null, op);
  }
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
      const root = updateItem(state.root, found.path, (item) => withSlot(item, item.slots.length, [holeMark('insert')]));
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
    // A sum lifted out between × or after − keeps its brackets: 3-(x+1)/4 loses the fraction as 3-(x+1).
    const binds = ['*', '-'].includes(row[index - 1]?.op) || row[index + 1]?.op === '*';
    row.splice(index, 1, ...(binds && itemsAreSum(kept) ? [makeParen(kept, false)] : kept));
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
    if (item.t === 'num' && item.text.includes('E') && !item.text.includes('_')) {
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

const KEEPS_WORD_OPEN = new Set(['⌫', 'DEL']);

// + − = < > typed at the end of a filled exponent continue after the power, so
// x^5-1 reads as x⁵ − 1; an empty exponent keeps them (x^-2).
function leaveExponent(state) {
  if (state.target.mode !== 'insert') return state;
  let path = state.target.path;
  while (path.length > 1) {
    const parts = rowKeyOf(path).split('.').map(Number);
    const slot = parts.pop();
    const owner = getItem(state.root, parts);
    const row = owner.slots[slot];
    if (path.at(-1) !== row.length - 1 || row.at(-1).t === 'hole') return state;
    if (owner.t === 'pow' && slot === 1) return move(state, { mode: 'insert', path: parts });
    if (owner.t !== 'neg') return state;
    path = parts;
  }
  return state;
}

export function pressEquationKey(state, face) {
  if (face === 'UNDO') return undoState(state);
  if (face === 'REDO') return redoState(state);
  if (face === 'CLEAR') return clearAll(state);
  const unit = typeUnit(state, face) ?? exponentSign(state, face);
  if (unit) return unit;
  if (face === '_') return startUnit(state);
  if (!KEEPS_WORD_OPEN.has(face) && !isLetterFace(face) && !/^[0-9]$/.test(face)) state = completeWord(state);
  if (face === '⌫') return backspace(state);
  if (face === 'DEL') return deleteTarget(state);
  if (face === '▲') return grow(state);
  if (face === '▼') return shrink(state);
  if (face === '◀') return moveSide(state, -1);
  if (face === '▶') return moveSide(state, 1);
  if (face === 'RS▲') return selectAll(state);
  if (face === 'RS◀') return extendRun(state, -1);
  if (face === 'RS▶') return extendRun(state, 1);
  if (face === '⇧◀') return extendSelection(state, -1);
  if (face === '⇧▶') return extendSelection(state, 1);
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
  if (op) return operate(op === '*' ? state : leaveExponent(state), op);
  if (face === '÷') return structureKey(state, 'frac');
  if (face === 'yˣ') return structureKey(state, 'pow');
  if (face === 'x²') return postfix(state, makeStruct('pow', [targetItems(state), [numLeaf('2')]]));
  if (face === '1/x') return postfix(state, makeStruct('frac', [[numLeaf('1')], targetItems(state)]));
  if (face === '!') return postfix(state, makeStruct('fact', [targetItems(state)]));
  if (face === '+/-') return toggleNeg(state);
  if (isKnownFunction(face)) return structureKey(state, NAME_KIND[face.toUpperCase()] || 'fn', face);
  throw new RPLError(`${face}: not available in EQW`);
}

export function completeWord(state) {
  if (state.target.mode !== 'insert') return state;
  const item = getItem(state.root, state.target.path);
  const letter = item?.t === 'name' ? GREEK_WORDS[item.text] : undefined;
  return letter ? putLeaf(state, nameLeaf(letter)) : state;
}

export function isBlankEquation(state) {
  return state.root.length === 1 && state.root[0].t === 'hole';
}

export function holePath(root) {
  return stops(root).find((path) => getItem(root, path)?.t === 'hole') ?? null;
}

export function replaceWhole(state, ast, typingKey = null) {
  const root = fromAst(ast);
  return step(state, { root, target: { mode: 'insert', path: stops(root).at(-1) || [0] }, lastFace: null }, typingKey);
}

export function wrapTarget(state, kind) {
  const items = targetItems(state);
  return postfix(state, kind === 'paren' ? makeParen(items, true) : makeStruct(kind, [items]));
}

export function collapseSelection(state, dir = 1) {
  if (state.target.mode !== 'select') return state;
  const { rowKey, from, to } = spanOf(state);
  const path = dir < 0 ? firstStopIn(state.root, rowKey, from, to) : lastStopIn(state.root, rowKey, from, to);
  return path ? move(state, { mode: 'insert', path }) : state;
}

const CONSTANT_NAMES = new Set(['π', 'e', 'i', '∞']);
const TRIG_NAMES = new Set(['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN']);

export function variablesOf(ast) {
  return [...freeVars(ast)].filter((name) => !CONSTANT_NAMES.has(name));
}

export function primaryVariable(ast, preferred = 'x') {
  const names = variablesOf(ast);
  return names.find((n) => n === preferred) ?? names.find((n) => n.toLowerCase() === 'x') ?? names[0] ?? null;
}

export function renameVariable(ast, from, to) {
  if (ast.kind === 'var') return ast.name === from ? Var(to) : ast;
  if (ast.kind === 'neg') return Neg(renameVariable(ast.arg, from, to));
  if (ast.kind === 'bin') return Bin(ast.op, renameVariable(ast.l, from, to), renameVariable(ast.r, from, to));
  if (ast.kind === 'fn') return Fn(ast.name, ast.args.map((arg) => renameVariable(arg, from, to)));
  return ast;
}

function usesTrig(ast) {
  if (ast.kind === 'fn') return TRIG_NAMES.has(ast.name.toUpperCase()) || ast.args.some(usesTrig);
  if (ast.kind === 'neg') return usesTrig(ast.arg);
  if (ast.kind === 'bin') return usesTrig(ast.l) || usesTrig(ast.r);
  return false;
}

function runOps(values, ops) {
  const stack = new Stack();
  for (const value of values) stack.push(value);
  for (const op of ops) lookup(op).fn(stack);
  return stack.peek(1);
}

function plainNumber(value) {
  return format(Real(value)).replace(/\.$/, '');
}

function solutionsText(list) {
  const items = isList(list) ? list.items : [list];
  if (!items.length) return 'none found';
  return items.map((item) => (isSymbolic(item) ? formatAlgebra(item.expr) : format(item))).join(' or ');
}

function removableHoles(ast, variable, numeric) {
  if (ast.kind !== 'bin' || ast.op !== '/') return [];
  const roots = runOps([Symbolic(ast.r), Name(variable)], ['SOLVE']);
  const points = (isList(roots) ? roots.items : [roots])
    .filter((item) => isSymbolic(item) && item.expr.kind === 'bin' && item.expr.op === '=')
    .map((item) => numeric(item.expr.r, {}))
    .filter(Number.isFinite)
    .slice(0, 3);
  const holes = [];
  for (const at of points) {
    if (Math.abs(numeric(ast.l, { [variable]: at })) > 1e-9) continue;
    const limit = runOps([Symbolic(ast), Symbolic(Bin('=', Var(variable), Num(at)))], ['LIMIT']);
    const value = isSymbolic(limit) ? numeric(limit.expr, {}) : isReal(limit) ? limit.value.toNumber() : isInteger(limit) ? Number(limit.value) : NaN;
    if (Number.isFinite(value)) holes.push({ at, limit: value });
  }
  return holes;
}

export function equationInsights(ast, { variable = primaryVariable(ast), numeric = (a, env) => evalNumeric(a, env), cas = giac.isReady() } = {}) {
  const out = [];
  const names = variablesOf(ast);
  const relation = ast.kind === 'bin' && RELS.has(ast.op);
  const equation = relation && ast.op === '=';
  if (!names.length && (!relation || equation)) {
    const value = numeric(equation ? Bin('-', ast.l, ast.r) : ast, {});
    if (Number.isFinite(value)) out.push({ kind: 'value', label: equation ? 'Left − right' : 'Value', done: 'Replaced with its value', value });
  }
  // A quantity with units is worked out as EVAL does on the stack: 5_m+3_ft is 19.4041994751_ft.
  if (!names.length && !relation && hasUnits(ast)) {
    try {
      const next = valueToAst(runOps([Symbolic(ast)], ['EVAL']));
      if (!astEqual(ast, next)) out.push({ kind: 'replace', label: 'Value', done: 'Replaced with its value', ast: next });
    } catch { /* inconsistent units, no insight */ }
  }
  if (names.length === 1 && !relation && !hasUnits(ast)) out.push({ kind: 'plot', label: `Plot in ${variable}`, variable, ast });
  if (!cas || !names.length) return out;
  const seen = [ast];
  const offer = (label, done, compute) => {
    try {
      const result = compute();
      const next = isSymbolic(result) ? result.expr : valueToAst(result);
      if (seen.some((known) => astEqual(known, next))) return;
      seen.push(next);
      out.push({ kind: 'replace', label, done, ast: next });
    } catch { /* no insight when the CAS can't do it */ }
  };
  offer('Simplifies to', 'Simplified', () => runOps([Symbolic(ast)], ['SIMPLIFY']));
  offer('Factors as', 'Factored', () => runOps([Symbolic(ast)], ['FACTOR']));
  offer('Expands to', 'Expanded', () => runOps([Symbolic(ast)], ['EXPAND']));
  if (variable && !relation) offer(`d/d${variable}`, `Differentiated with respect to ${variable}`, () => runOps([Symbolic(ast), Name(variable)], ['DERIV']));
  if (variable && (equation || (!relation && names.length === 1))) {
    try {
      const solutions = runOps([Symbolic(ast), Name(variable)], ['SOLVE']);
      out.push({ kind: 'solve', label: equation ? `Solve for ${variable}` : `Zeros in ${variable}`, value: solutions, text: solutionsText(solutions) });
    } catch { /* unsolvable here */ }
  }
  if (variable && names.length === 1) {
    try {
      for (const hole of removableHoles(ast, variable, numeric)) {
        out.push({
          kind: 'note', hot: true, label: 'Removable hole',
          text: `at ${variable} = ${plainNumber(hole.at)} · limit ${plainNumber(hole.limit)}`,
          note: `At ${variable} = ${plainNumber(hole.at)} the top and bottom are both 0, so the expression is undefined there, but it approaches ${plainNumber(hole.limit)}. Cancelling the common factor removes the hole.`,
        });
      }
    } catch { /* no hole analysis without SOLVE and LIMIT */ }
  }
  return out;
}

export function writerInsights(ast, variable, cas) {
  return equationInsights(ast, { variable, numeric: (a, env) => evalNumeric(a, env, angleOpts()), cas });
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
  const ast = parseMath(String(text ?? '').trim());
  const items = [...fromAst(ast)];
  const at = state.target.mode === 'insert' ? getItem(state.root, state.target.path) : null;
  if (!at || at.t === 'hole') return replaceTarget(state, items);
  // At a caret after a leaf the pasted expression follows it as a factor, as typing would (W-L21).
  const extras = isAddLike(ast) ? [makeParen(items, false)] : items;
  extras[extras.length - 1] = marked(extras[extras.length - 1], 'select');
  return insertAfter(state, [opTok('*'), ...extras], null);
}

function placeCursor(state, path) {
  const item = getItem(state.root, path);
  if (!item || item.t === 'op') return state;
  return move(state, { mode: 'insert', path });
}

function selectBetween(state, pathA, pathB) {
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

// Option on a Mac, and AltGr elsewhere, type symbols such as √, π and ≤ rather than shortcuts (W-L23).
function typedWithOption(event) {
  const option = event.altKey || event.getModifierState?.('AltGraph');
  return option && !event.metaKey && event.key?.length === 1 && !/^[A-Za-z0-9]$/.test(event.key);
}

export function physicalFace(event) {
  if ((event.altKey || event.ctrlKey || event.metaKey) && !typedWithOption(event)) return null;
  if (event.shiftKey && event.key === 'ArrowDown') return 'NOOP';
  const moves = {
    ArrowUp: event.shiftKey ? 'RS▲' : '▲',
    ArrowDown: '▼',
    ArrowLeft: event.shiftKey ? '⇧◀' : '◀',
    ArrowRight: event.shiftKey ? '⇧▶' : '▶',
    Tab: event.shiftKey ? '◀' : '▶',
    Home: 'RS◀',
    End: 'RS▶',
    Backspace: '⌫',
    Delete: 'DEL',
  };
  if (moves[event.key]) return moves[event.key];
  if (event.key === ' ') return 'NOOP';
  const map = {
    '+': '+', '-': '−', '−': '−', '*': '×', '×': '×', '·': '×',
    '/': '÷', '÷': '÷', '^': 'yˣ', '!': '!', '(': '( )', ')': ')', ',': ',',
    '=': '=', '<': '<', '>': '>', '≠': '≠', '≤': '≤', '≥': '≥',
    '√': '√x', '²': 'x²', 'π': 'π', '∞': '∞', '∫': '∫', '∂': '∂', '∑': 'Σ', '±': '+/-',
    '_': '_', 'µ': 'μ', '°': '°', 'Å': 'Å', '∆': 'Δ', 'Ω': 'Ω',
  };
  if (map[event.key]) return map[event.key];
  if (event.key === '.' || /^[0-9]$/.test(event.key) || isLetterFace(event.key)) return event.key;
  if (event.key?.length === 1) return 'UNAVAILABLE';
  return null;
}

const INSIGHT_DELAY_MS = 200;
const SELECTING_FACES = new Set(['⇧◀', '⇧▶', 'RS▲', 'RS◀', 'RS▶', '▲', '▼']);
const INSIGHT_CAS_SOURCE_LIMIT = 160;
const INSIGHT_CAS_TIMEOUT_MS = 3000;
const TAP_KEYS = Object.freeze([
  { face: '◀', icon: 'chl', title: 'Move left (←)' },
  { face: '▶', icon: 'chr', title: 'Move right (→, Tab)' },
  { face: '÷', label: 'a/b', title: 'Fraction (/)' },
  { face: 'yˣ', label: 'xʸ', title: 'Power (^)' },
  { face: '√x', label: '√', title: 'Square root' },
  { face: '( )', label: '( )', title: 'Group (()' },
]);
const SIZE = Object.freeze({ normal: 28, big: 38 });

const SELECTION_TOOLS = Object.freeze([
  Object.freeze({ id: 'EVAL', label: 'Evaluate' }),
  Object.freeze({ id: 'SIMP', label: 'Simplify' }),
  Object.freeze({ id: 'EXPA', label: 'Expand' }),
  Object.freeze({ id: 'FACTO', label: 'Factor' }),
  Object.freeze({ id: 'd/dx', label: 'd/dx' }),
  Object.freeze({ id: 'sqrt', label: '√' }),
  Object.freeze({ id: 'DEL', label: 'Delete' }),
]);

const INSIGHT_TITLES = Object.freeze({
  value: 'Click to replace the expression with its value',
  plot: 'Click to open the plot',
  replace: 'Click to use it (⌘Z undoes)',
  solve: 'Click to push the solutions to the stack',
});

function angleOpts() {
  return { toRad: toRadians, fromRad: fromRadians };
}

function sparklineSvg(ast, variable) {
  const span = usesTrig(ast) ? Math.abs(fromRadians(2 * Math.PI)) : 5;
  const width = 120;
  const height = 30;
  const samples = 64;
  const ys = [];
  for (let k = 0; k <= samples; k++) {
    const y = evalNumeric(ast, { [variable]: -span + (2 * span * k) / samples }, angleOpts());
    ys.push(Number.isFinite(y) ? y : NaN);
  }
  const finite = ys.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length < 3) return '<span class="val">no real values here</span>';
  const lo = finite[Math.floor(finite.length * 0.04)];
  const hi = finite[Math.ceil(finite.length * 0.96) - 1];
  const range = hi - lo || 1;
  const toY = (y) => (height - 2 - ((Math.min(hi, Math.max(lo, y)) - lo) / range) * (height - 4)).toFixed(1);
  let path = '';
  let pen = false;
  ys.forEach((y, k) => {
    if (!Number.isFinite(y) || y < lo - range / 2 || y > hi + range / 2) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${((k / samples) * width).toFixed(1)} ${toY(y)}`;
    pen = true;
  });
  const axis = lo < 0 && hi > 0 ? `<line x1="0" x2="${width}" y1="${toY(0)}" y2="${toY(0)}"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${axis}<path d="${path}"/></svg>`;
}

function insightNote(title, text) {
  return `<div class="ins-note"><small>${escapeHtml(title)}</small><span>${escapeHtml(text)}</span></div>`;
}

function loadingNote() {
  return insightNote('Algebra engine', 'Loading. Simplify, factor and solve appear here when it is ready.');
}

function reviveInsight(insight) {
  if (insight.kind !== 'solve') return insight;
  try { return { ...insight, value: parseEntry(insight.value)[0] }; }
  catch { return null; }
}

class InsightWorker {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.broken = typeof Worker !== 'function';
    this.running = null;
    this.queued = null;
    this.seq = 0;
  }

  request(ast, variable) {
    this.queued?.resolve(null);
    const modes = { angle: calcState.angle, approxMode: calcState.approxMode, complexMode: calcState.complexMode, casVx: calcState.casVx };
    return new Promise((resolve, reject) => {
      this.queued = { ast, variable, modes, resolve, reject };
      this._pump();
    });
  }

  _pump() {
    if (!this.worker) this._spawn();
    if (!this.ready || this.running || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    job.id = ++this.seq;
    job.timer = setTimeout(() => this._stop(job), INSIGHT_CAS_TIMEOUT_MS);
    this.running = job;
    this.worker.postMessage({ id: job.id, ast: job.ast, variable: job.variable, modes: job.modes });
  }

  _spawn() {
    this.ready = false;
    this.worker = new Worker(new URL('./insight-worker.js', import.meta.url));
    this.worker.onmessage = ({ data }) => this._receive(data);
    this.worker.onerror = () => this._fail();
  }

  _receive(data) {
    if (data.ready) { this.ready = true; this._pump(); return; }
    if (data.failed) { this._fail(); return; }
    const job = this.running;
    if (job?.id !== data.id) return;
    clearTimeout(job.timer);
    this.running = null;
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.insights.map(reviveInsight).filter(Boolean));
    this._pump();
  }

  _stop(job) {
    if (this.running !== job) return;
    this.running = null;
    this.worker.terminate();
    this.worker = null;
    job.reject(new Error('The algebra engine took too long'));
    if (this.queued) this._pump();
  }

  _fail() {
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    for (const job of [this.running, this.queued]) {
      if (!job) continue;
      clearTimeout(job.timer);
      job.reject(new Error('The insight worker failed'));
    }
    this.running = null;
    this.queued = null;
  }
}

const insightWorker = new InsightWorker();

// A phone only raises its keyboard for a text field, so touch devices type into
// a hidden one. The rest character gives Backspace something to delete.
const SOFT_KEYS_REST = '\u200b';
const EQW_LABEL = 'Equation. Type to build it: / makes a fraction, ^ a power, ( a group. Enter pushes it, Esc cancels.';
const typesOnTouch = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

export class EquationEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'eqw';
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'textbox');
    this.el.setAttribute('aria-label', EQW_LABEL);
    this.el.innerHTML = `<input class="eqw-keys" type="text" tabindex="-1" aria-label="${EQW_LABEL}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><div class="eqw-canvas"></div><div class="eqw-text" hidden><textarea class="eqw-ta" rows="1" spellcheck="false" autocomplete="off" aria-label="The expression as text"></textarea></div><div class="eqw-ins" aria-live="polite"></div>`;
    this.keys = this.el.querySelector('.eqw-keys');
    this.canvas = this.el.querySelector('.eqw-canvas');
    this.textBox = this.el.querySelector('.eqw-text');
    this.textArea = this.el.querySelector('.eqw-ta');
    this.strip = this.el.querySelector('.eqw-ins');
    this.canvas.after(writerKeys(TAP_KEYS, (face) => this.pressFace(face)));
    this.state = emptyEquation();
    this.big = false;
    this.showText = false;
    this.insights = [];
    this._insightFor = null;
    this._insightTimer = 0;
    this._rects = null;
    this._drag = null;
    this._selecting = false;
    this.canvas.addEventListener('pointerdown', (e) => this._pointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._pointerMove(e));
    this.canvas.addEventListener('pointerup', () => { this._drag = null; });
    this.canvas.addEventListener('scroll', () => { if (this.hasSelection() && this._toolsFor) this._placeTools(this._toolsFor); });
    this.el.addEventListener('mousedown', (e) => { if (e.target.closest('.ins, .eqw-tip')) e.preventDefault(); });
    this.el.addEventListener('click', (e) => this._onClick(e));
    this._softKeys = SOFT_KEYS_REST;
    this._composing = false;
    this.keys.addEventListener('input', () => this._onSoftKeys());
    this.keys.addEventListener('compositionstart', () => { this._composing = true; });
    this.keys.addEventListener('compositionend', () => { this._composing = false; this._onSoftKeys(); });
    this.textArea.addEventListener('input', () => this._onTextInput());
    this.textArea.addEventListener('keydown', (e) => this._onTextKey(e));
    document.addEventListener('copy', (e) => this._onCopy(e, false));
    document.addEventListener('cut', (e) => this._onCopy(e, true));
    document.addEventListener('paste', (e) => this._onPaste(e));
  }

  load(value) {
    this.state = value ? equationFromValue(value) : emptyEquation();
    this._selecting = false;
    this._render();
  }

  value() { return valueFromEquation(completeWord(this.state).root); }

  clear() {
    this.state = emptyEquation();
    this._selecting = false;
    this._render();
  }

  isEmpty() { return isBlankEquation(this.state); }

  canUndo() { return this.state.history.length > 0; }

  canRedo() { return this.state.future.length > 0; }

  snapshot() { return { state: this.state }; }

  restore(saved) {
    this.state = saved.state;
    this._selecting = false;
    this._render();
  }

  focus() {
    if (!typesOnTouch()) { this.el.focus({ preventScroll: true }); return; }
    this._restSoftKeys();
    this.keys.focus({ preventScroll: true });
  }

  ownsKeyboard(target = document.activeElement) {
    if (!this.el.isConnected || target === this.textArea) return false;
    if (target === this.keys) return true;
    const tag = target?.tagName;
    return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable);
  }

  hasSelection() { return this.state.target.mode === 'select' && this._selecting; }

  collapseSelection() {
    if (!this.hasSelection()) return false;
    this.state = collapseSelection(this.state);
    this._selecting = false;
    this._render();
    return true;
  }

  handleKey(e) {
    const face = physicalFace(e);
    if (face == null) return false;
    if ((face === '◀' || face === '▶') && e.key.startsWith('Arrow') && this.hasSelection()) {
      this.state = collapseSelection(this.state, face === '◀' ? -1 : 1);
      this._selecting = false;
      this._render();
      return true;
    }
    if (face === 'UNAVAILABLE') { this.app.notifyError(`${e.key} can't go in an equation.`); return true; }
    this.pressFace(face);
    return true;
  }

  pressFace(face) {
    if (!face || face === 'NOOP') return;
    if (EQW_APP_FACES.has(face)) { this._appFace(face); return; }
    if (EQW_UNAVAILABLE_FACES.has(face)) { this.app.notifyError(`${face} isn't available in the equation writer.`); return; }
    try { this.state = pressEquationKey(this.state, face); }
    catch (error) { this.app.notifyError(error.message); return; }
    this._selecting = SELECTING_FACES.has(face);
    this._render();
  }

  pressKeypad(key, shift) {
    if ((shift === 'shiftL' || shift === 'shiftLLock') && key.primary === '`' && key.shiftL === 'i') {
      this.pressFace('const:i');
      return;
    }
    this.pressFace(keypadFace(key, shift));
  }

  typeText(text) {
    for (const char of String(text)) this.pressFace(char);
  }

  // A UNITS menu key attaches its unit to the number being typed, 5_m, as it does on the command line.
  typeUnit(unit, mode) {
    if (mode === 'convert') { this.app.notifyError('CONVERT works on the stack; in the writer a unit key attaches its unit.'); return; }
    const compound = /[*/^]/.test(unit);
    const faces = [...unit].map((c) => ({ '*': '×', '/': '÷', '^': 'yˣ' })[c] ?? c);
    for (const face of [...(mode === 'divide' ? ['÷', '1'] : []), '_', ...(compound ? ['( )', ...faces, ')'] : faces)]) this.pressFace(face);
  }

  pressCommand(name) {
    if (EQW_CMDS.includes(name)) { this.transformWith([name]); return; }
    if (isKnownFunction(name)) { this.pressFace(name); return; }
    this.app.notifyError(`${name} isn't available in the equation writer.`);
  }

  menu() {
    const slot = (label, title, onPress, extra = {}) => ({ label, title, onPress, ...extra });
    const variable = this._variable() ?? calcState.casVx;
    const inserts = EQW_INSERTS.map((item) => slot(item.label, item.title, () => this.pressFace(item.face)));
    return [
      slot('SIMP', 'Simplify the selection, or the whole expression', () => this.transform('SIMP')),
      slot('EXPA', 'Expand', () => this.transform('EXPA')),
      slot('FACTO', 'Factor', () => this.transform('FACTO')),
      slot(`d/d${variable}`, `Differentiate with respect to ${variable}`, () => this.transform('d/dx')),
      slot('SOLVE', `Solve for ${variable} and push the solutions`, () => this.solve()),
      slot('→NUM', 'Evaluate to a number', () => this.transform('→NUM')),
      ...inserts.slice(0, 6),
      slot('TEXT', 'Show the expression as text under the equation', () => this.toggleText(), { toggle: true, on: () => this.showText }),
      slot('BIG', 'Bigger type', () => this.toggleBig(), { toggle: true, on: () => this.big }),
      slot('COPY', 'Copy the selection, or the whole expression, as text · ↰ copies it as LaTeX', () => this.copy(), { onPressL: () => this.copyLatex() }),
      slot('PASTE', 'Paste a formula, as text or LaTeX, in place of the selection', () => this.paste()),
      slot('CMDS', 'More algebra commands for the selection or the expression', () => this.showCommands()),
      slot('DONE', 'Push it to the stack (Enter)', () => this.app.commitEntry()),
      ...inserts.slice(6),
    ];
  }

  showCommands() {
    const back = { label: '◀ BACK', title: 'Back to the equation menu', onPress: () => this.app.setMenu(null, 'EQW') };
    this.app.setMenu([back, ...EQW_CMDS.map((name) => ({
      label: name,
      title: this.app.commandTitle(name),
      onPress: () => { this.transformWith([name]); this.app.setMenu(null, 'EQW'); },
    }))], 'EQW');
  }

  toggleBig() {
    this.big = !this.big;
    this._render();
    this.app.menubar.render();
  }

  toggleText() {
    this.showText = !this.showText;
    this.textBox.hidden = !this.showText;
    this._render();
    this.app.menubar.render();
    if (this.showText) this.textArea.focus();
    else this.focus();
  }

  transform(id) {
    if (id !== 'd/dx') { this.transformWith(EQW_ACTION_OPS[id]); return; }
    const variable = this._variable();
    if (!variable) { this.app.notifyError('There is no variable to differentiate by.'); return; }
    this._replacePart((ast) => valueToAst(runOps([Symbolic(ast), Name(variable)], ['DERIV'])));
  }

  transformWith(ops) {
    this._replacePart((ast) => applyOpsToAst(ast, ops));
  }

  solve() {
    const ast = this._wholeAst();
    if (!ast) return;
    const variable = primaryVariable(ast, calcState.casVx);
    if (!variable) { this.app.notifyError('There is no variable to solve for.'); return; }
    let solutions;
    try { solutions = runOps([Symbolic(ast), Name(variable)], ['SOLVE']); }
    catch (error) { this.app.notifyError(this._casMessage(error)); return; }
    this.app.pushFromWriter(solutions, `Pushed the solutions for ${variable}: ${solutionsText(solutions)}`);
  }

  commit() {
    this.state = completeWord(this.state);
    if (this.isEmpty()) {
      this.app.notifyError(this.app.pendingEdit ? 'The equation is empty. Type one, or press Esc to keep the level as it was.' : 'Type an expression first, for example x^2/2.');
      return;
    }
    const hole = holePath(this.state.root);
    if (hole) {
      this.state = placeCursor(this.state, hole);
      this._render();
      this.canvas.classList.remove('flash');
      void this.canvas.offsetWidth;
      this.canvas.classList.add('flash');
      this.app.notifyError("There's an empty box. Fill it, or press ⌫ to remove it.");
      return;
    }
    let value;
    try { value = this.value(); }
    catch (error) { this.app.notifyError(`The expression isn't complete: ${error.message}`); return; }
    this.app.writerCommit(value);
    this.clear();
  }

  copy() { this._writeClipboard(this._selectionText()); }

  copyLatex() {
    const ast = this._selectionAst();
    if (ast) this.app.copyText(astLatex(ast), 'Copied as LaTeX');
  }

  cut() {
    const text = this._selectionText();
    if (text == null) return;
    this._writeClipboard(text);
    this.pressFace('DEL');
  }

  paste() {
    const read = navigator.clipboard?.readText?.();
    if (!read) { this.app.notifyError('The clipboard is not available here. Try ⌘V or Ctrl+V.'); return; }
    read.then((text) => this._pasteText(text)).catch(() => this.app.notifyError('The clipboard is not available here. Try ⌘V or Ctrl+V.'));
  }

  refreshInsights() {
    this._insightFor = null;
    this._scheduleInsights();
  }

  _variable() {
    try { return primaryVariable(toAst(completeWord(this.state).root), calcState.casVx); }
    catch { return null; }
  }

  _wholeAst() {
    try { return toAst(completeWord(this.state).root); }
    catch { this.app.notifyError('Finish the expression first: fill every box.'); return null; }
  }

  _casMessage(error) {
    const message = String(error?.message ?? error);
    return /CAS not ready/.test(message) ? 'The algebra engine is still loading. Try again in a moment.' : message;
  }

  _replacePart(compute) {
    const whole = !this.hasSelection();
    let ast;
    try { ast = whole ? toAst(completeWord(this.state).root) : targetAst(this.state); }
    catch { this.app.notifyError('Finish the expression first: fill every box.'); return; }
    try {
      const result = compute(ast);
      this.state = whole ? replaceWhole(this.state, result) : replaceTarget(this.state, [...fromAst(result)]);
      this._render();
    } catch (error) {
      this.app.notifyError(this._casMessage(error));
    }
  }

  _selectionAst() {
    try { return this.hasSelection() ? targetAst(this.state) : toAst(completeWord(this.state).root); }
    catch { this.app.notifyError('Finish the expression first: fill every box.'); return null; }
  }

  _selectionText() {
    const ast = this._selectionAst();
    return ast && formatAlgebra(ast);
  }

  _writeClipboard(text) {
    if (text != null) this.app.copyText(text, 'Copied');
  }

  _pasteText(text) {
    try { this.state = pasteText(this.state, String(text ?? '').replace(/^\s*['`]|['`]\s*$/g, '')); }
    catch (error) { this.app.notifyError(`That doesn't read as an expression: ${error.message}`); return; }
    this._render();
  }

  _clipboardApplies(e) {
    if (this.app.inputMode !== 'equation' || !this.ownsKeyboard(e.target)) return false;
    return document.getSelection()?.isCollapsed !== false;
  }

  _onCopy(e, remove) {
    if (!this._clipboardApplies(e)) return;
    const text = this._selectionText();
    if (text == null) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    if (remove) this.pressFace('DEL');
  }

  _onPaste(e) {
    if (!this._clipboardApplies(e)) return;
    e.preventDefault();
    this._pasteText(e.clipboardData.getData('text/plain'));
  }

  _onTextInput() {
    const text = this.textArea.value.trim();
    try {
      this.state = text ? replaceWhole(this.state, parseMath(text), 'text') : pressEquationKey(this.state, 'CLEAR');
      this.textArea.classList.remove('bad');
    } catch {
      this.textArea.classList.add('bad');
      return;
    }
    this._render();
  }

  _onTextKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.focus(); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); this.app.commitEntry(); }
  }

  _onClick(e) {
    const tool = e.target.closest('.eqw-tip [data-tool]');
    if (tool) { this._runTool(tool.dataset.tool); return; }
    const card = e.target.closest('.ins[data-i]');
    if (card) { this._applyInsight(Number(card.dataset.i)); return; }
    if (e.target.closest('.eqw-canvas')) this.focus();
  }

  // Keyboards that send text without key events (most on Android) are read
  // from what changed in the hidden field.
  _onSoftKeys() {
    const now = this.keys.value;
    const before = this._softKeys;
    let same = 0;
    while (same < before.length && same < now.length && before[same] === now[same]) same++;
    for (let i = same; i < before.length; i++) this.pressFace('⌫');
    for (const key of now.slice(same)) {
      if (key !== SOFT_KEYS_REST) this.handleKey({ key });
    }
    this._softKeys = now;
    if (!this._composing) this._restSoftKeys();
  }

  _restSoftKeys() {
    this.keys.value = SOFT_KEYS_REST;
    this._softKeys = SOFT_KEYS_REST;
  }

  _runTool(id) {
    if (id === 'DEL') { this.pressFace('DEL'); return; }
    if (id === 'sqrt') { this.state = wrapTarget(this.state, 'sqrt'); this._render(); return; }
    this.transform(id);
  }

  _applyInsight(index) {
    const insight = this.insights[index];
    if (!insight) return;
    if (insight.kind === 'plot') {
      const x = /^x$/i.test(insight.variable) ? insight.ast : renameVariable(insight.ast, insight.variable, 'X');
      this.app.plotExpression(x);
      return;
    }
    if (insight.kind === 'solve') { this.app.pushFromWriter(insight.value, `Pushed ${insight.text}`); return; }
    if (insight.kind === 'note') { this.app.toast(insight.note, { timeout: 8000 }); return; }
    this.state = replaceWhole(this.state, insight.kind === 'value' ? Num(insight.value) : insight.ast);
    this._selecting = false;
    this._render();
    this.app.toast(insight.done, { action: 'Undo', onAction: () => this.pressFace('UNDO') });
  }

  _appFace(face) {
    if (/^F[1-6]$/.test(face)) { this.app.pressSoftKey(Number(face[1]) - 1); return; }
    if (face === 'PREV') { this.app.prevMenuPage(); return; }
    if (face === 'NEXT') { this.app.nextMenuPage(); return; }
    if (face === 'CAT') { this.app.drawers.toggle('catalog'); return; }
    if (face === 'EQW') { this.app.runAction('writer.equation'); return; }
    if (face === 'ENTER') { this.app.commitEntry(); return; }
    if (face === 'ON') { this.app.runAction('ui.escape'); return; }
    if (face === 'EVAL' || face === '→NUM') { this.transform(face); return; }
    if (face === 'COPY') { this.copy(); return; }
    if (face === 'CUT') { this.cut(); return; }
    if (face === 'PASTE') this.paste();
  }

  _render() {
    this.el.querySelector('.eqw-tip')?.remove();
    const target = this.state.target;
    const drawn = eqwToSvg(this.state.root, {
      size: this.big ? SIZE.big : SIZE.normal,
      caret: target.mode === 'insert' ? target.path.join('.') : null,
      boxed: target.mode === 'clear' ? target.path.join('.') : null,
      selected: target.mode === 'select' ? { row: target.row, from: target.from, to: target.to } : null,
      selectionAsCaret: !this._selecting,
      clipId: 'eqw-selection',
    });
    this._rects = drawn.rects;
    let text = '';
    try { text = formatAlgebra(toAst(this.state.root)); } catch { text = ''; }
    this.canvas.innerHTML = drawn.svg.replace('<svg ', `<svg role="img" aria-label="${escapeHtml(text || 'empty')}" `);
    if (drawn.selection && this._selecting) this._placeTools(drawn.selection);
    this._scrollToCaret(drawn.rects.get(target.path?.join('.') ?? ''));
    if (this.showText && document.activeElement !== this.textArea) {
      this.textArea.value = text;
      this.textArea.classList.remove('bad');
    }
    this.app?.appbar?.updateHistory();
    this._scheduleInsights();
  }

  _svgOrigin(host = this.canvas) {
    const svg = this.canvas.querySelector('svg');
    const box = svg.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    return { x: box.left - frame.left + host.scrollLeft, y: box.top - frame.top + host.scrollTop };
  }

  _placeTools(union) {
    this.el.querySelector('.eqw-tip')?.remove();
    const origin = this._svgOrigin(this.el);
    const variable = this._variable() ?? calcState.casVx;
    const tip = document.createElement('div');
    tip.className = 'eqw-tip';
    tip.setAttribute('role', 'toolbar');
    tip.setAttribute('aria-label', 'Change the selected part');
    tip.innerHTML = SELECTION_TOOLS.map((t) => `<button type="button" data-tool="${t.id}">${escapeHtml(t.id === 'd/dx' ? `d/d${variable}` : t.label)}</button>`).join('');
    this.el.appendChild(tip);
    const half = tip.offsetWidth / 2 + 4;
    const left = Math.min(Math.max(half, origin.x + union.x + union.w / 2), this.el.clientWidth - half);
    tip.style.left = `${left}px`;
    tip.style.top = `${origin.y + union.y - 6}px`;
    this._toolsFor = union;
  }

  _scrollToCaret(rect) {
    if (!rect || !this.el.isConnected) return;
    const origin = this._svgOrigin();
    const margin = 16;
    const keepInView = (start, size, scroll, view) => {
      if (start < this.canvas[scroll] + margin) this.canvas[scroll] = Math.max(0, start - margin);
      else if (start + size > this.canvas[scroll] + view - margin) this.canvas[scroll] = start + size - view + margin;
    };
    keepInView(origin.x + rect.x, rect.w, 'scrollLeft', this.canvas.clientWidth);
    keepInView(origin.y + rect.y, rect.h, 'scrollTop', this.canvas.clientHeight);
  }

  _scheduleInsights() {
    clearTimeout(this._insightTimer);
    this._insightTimer = setTimeout(() => this._renderInsights(), INSIGHT_DELAY_MS);
  }

  _renderInsights() {
    if (this.app.inputMode !== 'equation') return;
    const state = completeWord(this.state);
    if (isBlankEquation(state)) { this._showInsightNote('Start typing', 'x^2 makes a power · 1/3 a fraction · sqrt( a root · pi becomes π'); return; }
    if (holePath(state.root)) { this._showInsightNote('Keep going', 'Fill the empty box to see what the CAS can tell you'); return; }
    let ast;
    try { ast = toAst(state.root); }
    catch (error) { this._showInsightNote('Not finished', error.message); return; }
    const source = formatAlgebra(ast);
    const variable = primaryVariable(ast, calcState.casVx);
    const offPage = !insightWorker.broken;
    const cas = source.length <= INSIGHT_CAS_SOURCE_LIMIT && (offPage || giac.isReady());
    const key = `${source}|${cas}|${offPage}|${calcState.angle}|${calcState.casVx}`;
    if (key === this._insightFor) return;
    this._insightFor = key;
    if (!cas || !offPage) {
      this._showInsights(writerInsights(ast, variable, cas), { note: giac.isReady() ? '' : loadingNote() });
      return;
    }
    this._showInsights(writerInsights(ast, variable, false), { pending: true, note: insightWorker.ready ? '' : loadingNote() });
    insightWorker.request(ast, variable).then((insights) => {
      if (insights && key === this._insightFor) this._showInsights(insights);
    }, () => {
      if (key !== this._insightFor) return;
      if (insightWorker.broken) this.refreshInsights();
      else this._showInsights(this.insights, { note: insightNote('Skipped', 'The algebra engine took too long on this one.') });
    });
  }

  _showInsights(insights, { pending = false, note = '' } = {}) {
    this.insights = insights;
    const cards = insights.map((insight, i) => this._insightHtml(insight, i)).join('');
    this.strip.innerHTML = cards + note || (pending ? '' : insightNote('Nothing to add', 'The CAS has no simpler form for this one.'));
  }

  _showInsightNote(title, text) {
    this.insights = [];
    this._insightFor = null;
    this.strip.innerHTML = insightNote(title, text);
  }

  _insightHtml(insight, index) {
    let body;
    if (insight.kind === 'value') body = `<span class="val">${Number.isInteger(insight.value) ? '=' : '≈'} ${escapeHtml(plainNumber(insight.value))}</span>`;
    else if (insight.kind === 'plot') body = sparklineSvg(insight.ast, insight.variable);
    else if (insight.kind === 'replace') body = `<span class="m">${astToSvg(insight.ast, { size: 17, padding: 1 }).svg}</span>`;
    else body = `<span class="val">${escapeHtml(insight.text)}</span>`;
    const title = insight.kind === 'note' ? insight.note : INSIGHT_TITLES[insight.kind];
    return `<button type="button" class="ins${insight.hot ? ' hot' : ''}" data-i="${index}" title="${escapeHtml(title)}"><small>${escapeHtml(insight.label)}</small>${body}</button>`;
  }

  _point(event) {
    const svg = this.canvas.querySelector('svg');
    const matrix = svg?.getScreenCTM();
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
    if (event.button !== 0 || event.target.closest('.eqw-tip')) return;
    event.preventDefault();
    if (event.pointerType === 'mouse') this.focus();
    const hit = this._hit(this._point(event));
    if (!hit) return;
    const path = hit.key.split('.').map(Number);
    const state = completeWord(this.state);
    if (hit.rect.kind === 'leaf' || hit.rect.kind === 'hole') this.state = placeCursor(state, path);
    else if (hit.rect.kind === 'op') this.state = selectBetween(state, path, path);
    else this.state = landSelect(state, rowKeyOf(path), path.at(-1), path.at(-1));
    this._selecting = this.state.target.mode === 'select';
    this._drag = path;
    this.canvas.setPointerCapture?.(event.pointerId);
    this._render();
  }

  _pointerMove(event) {
    if (!this._drag) return;
    const hit = this._hit(this._point(event));
    if (!hit || (hit.rect.kind !== 'leaf' && hit.rect.kind !== 'hole')) return;
    const next = selectBetween(this.state, this._drag, hit.key.split('.').map(Number));
    if (JSON.stringify(next.target) === JSON.stringify(this.state.target)) return;
    this.state = next;
    this._selecting = next.target.mode === 'select';
    this._render();
  }
}
