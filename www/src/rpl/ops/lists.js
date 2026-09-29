import { isList, isVector, Integer, Real, isSymbolic, Symbolic, isName, isReal, isInteger, isComplex, isNumber, toComplex, toRealOrThrow, isString, isBinaryInteger, isTagged, isMatrix, Str, RList, Vector, Matrix, isProgram, isRational, isUnit, Unit } from '../types.js';
import { RPLError } from '../stack.js';
import { Fn as AstFn, astEqual } from '../algebra.js';
import { parseEntry as _parseEntryForObjTo } from '../parser.js';
import { register, lookup, OPS } from './registry.js';
import { setUserFlag, clearUserFlag } from '../state.js';
import { recallVar, storeVar, _DOSUBS_STACK, _driveGen, _fromListOp, _fromStrOp, _isSymOperand, _scalarBinary, _symbolicDecompose, _toAst, _toCountN, _toIntIdx, _toListOp, _toStrOp, runDoList, runDoSubs, runMap, runSeq, runStream } from './internal.js';



register('SUM', (s) => {
  const v = s.pop();
  if (isList(v) || isVector(v)) {
    const items = v.items;
    if (items.length === 0) { s.push(Integer(0n)); return; }
    let acc = items[0];
    for (let i = 1; i < items.length; i++) {
      if (!isNumber(acc) || !isNumber(items[i])) throw new RPLError('Bad argument type');
      acc = _scalarBinary('+', acc, items[i]);
    }
    s.push(acc);
    return;
  }
  if (_isSymOperand(v)) {
    s.push(Symbolic(AstFn('SUM', [_toAst(v)])));
    return;
  }
  if (isReal(v) || isInteger(v) || isComplex(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 25, label: "SUM" });


function _rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (isNumber(a) && isNumber(b)) {
    if (isComplex(a) || isComplex(b)) {
      const ca = toComplex(a), cb = toComplex(b);
      return ca.re === cb.re && ca.im === cb.im;
    }
    return toRealOrThrow(a) === toRealOrThrow(b);
  }
  if (a.type !== b.type) return false;
  if (isString(a))  return a.value === b.value;
  if (isName(a))    return a.id === b.id && a.quoted === b.quoted;
  if (isList(a) || isVector(a)) return _allEqual(a.items, b.items);
  if (isMatrix(a))  return _allEqual(a.rows, b.rows, _allEqual);
  if (isSymbolic(a)) return astEqual(a.expr, b.expr);
  if (isBinaryInteger(a)) return a.value === b.value;
  if (isTagged(a))        return a.tag === b.tag && _rplEqual(a.value, b.value);
  return false;
}

function _allEqual(xs, ys, eq = _rplEqual) {
  return xs.length === ys.length && xs.every((x, i) => eq(x, ys[i]));
}


// GET, PUT, GETI and PUTI take a position as n, { n } or, in a matrix,
// { row col } or n counted in row order.  The next position they return keeps
// the form they were given.
function _position(coll, idx) {
  const cols = isMatrix(coll) ? coll.rows[0].length : 1;
  const size = isMatrix(coll) ? coll.rows.length * cols : (isString(coll) ? coll.value : coll.items).length;
  let k;
  let form = 'n';
  if (isList(idx) && idx.items.length === 2 && isMatrix(coll)) {
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r > coll.rows.length || c > cols) throw new RPLError('Bad argument value');
    k = (r - 1) * cols + c - 1;
    form = 'rc';
  } else if (isList(idx)) {
    if (idx.items.length !== 1) throw new RPLError('Bad argument value');
    k = _toIntIdx(idx.items[0]) - 1;
    form = 'list';
  } else {
    k = _toIntIdx(idx) - 1;
  }
  if (k >= size) throw new RPLError('Bad argument value');
  return { k, size, cols, form };
}

function _positionValue({ cols, form }, k) {
  if (form === 'rc') return RList([Integer(BigInt(Math.floor(k / cols) + 1)), Integer(BigInt((k % cols) + 1))]);
  const n = Integer(BigInt(k + 1));
  return form === 'list' ? RList([n]) : n;
}

// Flag -64 reports whether the index wrapped back to the first element.
function _nextPosition(pos) {
  const wrapped = pos.k + 1 >= pos.size;
  if (wrapped) setUserFlag(-64);
  else clearUserFlag(-64);
  return _positionValue(pos, wrapped ? 0 : pos.k + 1);
}

function _elementAt(coll, k) {
  if (isMatrix(coll)) return coll.rows[Math.floor(k / coll.rows[0].length)][k % coll.rows[0].length];
  return isString(coll) ? Str(coll.value[k]) : coll.items[k];
}

function _withElement(coll, k, val) {
  if (isMatrix(coll)) {
    const cols = coll.rows[0].length;
    const r = Math.floor(k / cols);
    return Matrix(coll.rows.map((row, i) => (i === r ? row.map((x, j) => (j === k % cols ? val : x)) : row)));
  }
  const items = coll.items.map((x, i) => (i === k ? val : x));
  return isList(coll) ? RList(items) : Vector(items);
}

// The collection can also be named: PUT and PUTI then store the result back.
function _collection(v, { strings = false } = {}) {
  const named = isName(v);
  const coll = named ? recallVar(v.id) : v;
  if (named && coll === undefined) throw new RPLError(`Undefined name: ${v.id}`);
  if (!(isList(coll) || isVector(coll) || isMatrix(coll) || (strings && isString(coll)))) {
    throw new RPLError('Bad argument type');
  }
  return { coll, name: named ? v : null };
}


register('GET', (s) => {
  const [target, idx] = s.popN(2);
  const { coll } = _collection(target, { strings: true });
  s.push(_elementAt(coll, _position(coll, idx).k));
}, { category: 'Lists / strings', categoryOrder: 0, label: "GET" });


register('PUT', (s) => {
  const [target, idx, val] = s.popN(3);
  const { coll, name } = _collection(target);
  const result = _withElement(coll, _position(coll, idx).k, val);
  if (name) storeVar(name.id, result);
  else s.push(result);
}, { category: 'Lists / strings', categoryOrder: 1, label: "PUT" });


register('HEAD', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(v.items[0]);
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value[0]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 4, label: "HEAD" });


register('TAIL', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(RList(v.items.slice(1)));
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value.slice(1)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 5, label: "TAIL" });


register('SUB', (s) => {
  const [v, mVal, nVal] = s.popN(3);
  if (!isList(v) && !isString(v)) throw new RPLError('Bad argument type');
  // HP50 clamps instead of erroring: a start below 1 reads as 1, an end past the length as the length.
  const m = Math.max(1, _toCountN(mVal));
  const n = _toCountN(nVal);
  s.push(isList(v) ? RList(v.items.slice(m - 1, n)) : Str(v.value.slice(m - 1, n)));
}, { category: 'Lists / strings', categoryOrder: 6, label: "SUB" });

register('→LIST',  _toListOp, { category: 'Lists / strings', categoryOrder: 9, label: "→LIST" });

register('LIST→',  _fromListOp, { category: 'Lists / strings', categoryOrder: 10, label: "LIST→" });


register('POS', (s) => {
  const [coll, needle] = s.popN(2);
  if (isList(coll)) {
    s.push(Integer(BigInt(coll.items.findIndex(x => _rplEqual(x, needle)) + 1)));
    return;
  }
  if (isString(coll)) {
    if (!isString(needle)) throw new RPLError('Bad argument type');
    s.push(Integer(BigInt(coll.value.indexOf(needle.value) + 1)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 7, label: "POS" });


register('OBJ→', (s) => {
  const [v] = s.popN(1);
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isTagged(v)) {
    // AUR §3-149 returns the tag as a String, not a Name.
    s.push(v.value);
    s.push(Str(v.tag));
    return;
  }
  if (isList(v)) {
    for (const item of v.items) s.push(item);
    s.push(Integer(BigInt(v.items.length)));
    return;
  }
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  if (isString(v)) {
    const parsed = _parseEntryForObjTo(v.value);
    for (const item of parsed) s.push(item);
    return;
  }
  if (isProgram(v)) {
    for (const tok of v.tokens) s.push(tok);
    s.push(Integer(BigInt(v.tokens.length)));
    return;
  }
  if (isSymbolic(v)) {
    for (const item of _symbolicDecompose(v)) s.push(item);
    return;
  }
  if (isReal(v) || isInteger(v) || isBinaryInteger(v) || isRational(v)) {
    s.push(v);
    return;
  }
  if (isUnit(v)) {
    s.push(Real(v.value));
    s.push(Unit(1, v.uexpr));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 11, label: "OBJ→" });


// Decimal#valueOf is a string, so Reals must be compared as numbers, never with < directly.
function _sortKey(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v) || isBinaryInteger(v)) return Number(v.value);
  return null;
}

function _rplCompare(a, b) {
  const an = _sortKey(a), bn = _sortKey(b);
  if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
  if (isString(a) && isString(b)) {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  }
  throw new RPLError('Bad argument type');
}


register('SORT', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const sorted = [...l.items].sort(_rplCompare);
  s.push(RList(sorted));
}, { category: 'Lists / strings', categoryOrder: 16, label: "SORT" });


register('REVLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const reversed = [...l.items].reverse();
  s.push(RList(reversed));
}, { category: 'Lists / strings', categoryOrder: 15, label: "REVLIST" });


register('CHR', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    n = v.value.toNumber();
  } else                  throw new RPLError('Bad argument type');
  if (n < 0 || n > 0x10FFFF) throw new RPLError('Bad argument value');
  s.push(Str(String.fromCodePoint(n)));
}, { category: 'Lists / strings', categoryOrder: 14, label: "CHR" });

register('→STR',  _toStrOp, { category: 'Lists / strings', categoryOrder: 12, label: "→STR" });

register('STR→',  _fromStrOp, { category: 'Lists / strings', categoryOrder: 13, label: "STR→" });


function _foldListOp(opSymbol, identity) {
  return (s) => {
    const binop = lookup(opSymbol);
    const [l] = s.popN(1);
    if (!isList(l)) throw new RPLError('Bad argument type');
    if (l.items.length === 0) { s.push(identity); return; }
    s.push(l.items[0]);
    for (let i = 1; i < l.items.length; i++) {
      s.push(l.items[i]);
      binop.fn(s);
    }
  };
}


register('ΣLIST', _foldListOp('+', Real(0)), { category: 'Lists / strings', categoryOrder: 21, label: "ΣLIST" });

register('ΠLIST', _foldListOp('*', Real(1)), { category: 'Lists / strings', categoryOrder: 20, label: "ΠLIST" });

register('SLIST', _foldListOp('+', Real(0)), { category: 'Lists / strings', categoryOrder: 24, label: "SLIST" });

register('PLIST', _foldListOp('*', Real(1)), { category: 'Lists / strings', categoryOrder: 23, label: "PLIST" });


register('ΔLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  if (l.items.length <= 1) { s.push(RList([])); return; }
  const binop = lookup('-');
  const diffs = [];
  for (let i = 1; i < l.items.length; i++) {
    s.push(l.items[i]);
    s.push(l.items[i - 1]);
    binop.fn(s);
    const [d] = s.popN(1);
    diffs.push(d);
  }
  s.push(RList(diffs));
}, { category: 'Lists / strings', categoryOrder: 19, label: "ΔLIST" });

register('DLIST', (s) => OPS.get('ΔLIST').fn(s), { category: 'Lists / strings', categoryOrder: 22, label: "DLIST" });


register('REPL', (s) => {
  const [host, pos, patch] = s.popN(3);

  if (isMatrix(host)) {
    if (!isList(pos) || pos.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    if (!isMatrix(patch)) throw new RPLError('Bad argument type');
    const r0 = _toIntIdx(pos.items[0]);
    const c0 = _toIntIdx(pos.items[1]);
    const hostRows = host.rows.length;
    const hostCols = hostRows > 0 ? host.rows[0].length : 0;
    const pRows = patch.rows.length;
    const pCols = pRows > 0 ? patch.rows[0].length : 0;
    if (r0 + pRows - 1 > hostRows || c0 + pCols - 1 > hostCols) {
      throw new RPLError('Bad argument value');
    }
    const newRows = host.rows.map(r => [...r]);
    for (let i = 0; i < pRows; i++) {
      for (let j = 0; j < pCols; j++) {
        newRows[r0 - 1 + i][c0 - 1 + j] = patch.rows[i][j];
      }
    }
    s.push(Matrix(newRows));
    return;
  }

  const n = _toIntIdx(pos);

  if (isString(host)) {
    if (!isString(patch)) throw new RPLError('Bad argument type');
    const hostText = host.value;
    const patchText = patch.value;
    if (n + patchText.length - 1 > hostText.length) {
      throw new RPLError('Bad argument value');
    }
    const out = hostText.slice(0, n - 1) + patchText
              + hostText.slice(n - 1 + patchText.length);
    s.push(Str(out));
    return;
  }

  if (isList(host) || isVector(host)) {
    if (patch.type !== host.type) throw new RPLError('Bad argument type');
    const out = [...host.items];
    if (n + patch.items.length - 1 > out.length) {
      throw new RPLError('Bad argument value');
    }
    patch.items.forEach((x, i) => { out[n - 1 + i] = x; });
    s.push(isList(host) ? RList(out) : Vector(out));
    return;
  }

  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 17, label: "REPL" });


register('SREPL', (s) => {
  const [hay, needle, repl] = s.popN(3);
  if (!isString(hay) || !isString(needle) || !isString(repl)) {
    throw new RPLError('Bad argument type');
  }
  if (needle.value.length === 0) {
    throw new RPLError('Bad argument value');
  }
  const parts = hay.value.split(needle.value);
  s.push(Str(parts.join(repl.value)));
  s.push(Integer(BigInt(parts.length - 1)));
}, { category: 'Lists / strings', categoryOrder: 18, label: "SREPL" });


// Programs run these combinators as generators so HALT can suspend them;
// these entry points serve name dispatch and reject HALT.
register('MAP', (s) => {
  _driveGen(runMap(s, 0), 'MAP program');
}, { category: 'Lists / strings', categoryOrder: 26, label: "MAP" });


register('SEQ', (s) => {
  _driveGen(runSeq(s, 0), 'SEQ expression');
}, { category: 'Lists / strings', categoryOrder: 27, label: "SEQ" });


register('DOLIST', (s) => {
  _driveGen(runDoList(s, 0), 'DOLIST program');
}, { category: 'Lists / strings', categoryOrder: 28, label: "DOLIST" });


register('DOSUBS', (s) => {
  _driveGen(runDoSubs(s, 0), 'DOSUBS program');
}, { category: 'Lists / strings', categoryOrder: 29, label: "DOSUBS" });


register('NSUB', (s) => {
  const fr = _DOSUBS_STACK.at(-1);
  if (!fr) throw new RPLError('Undefined local name: NSUB');
  s.push(Integer(BigInt(fr.index)));
}, { category: 'Lists / strings', categoryOrder: 31, label: "NSUB" });


register('ENDSUB', (s) => {
  const fr = _DOSUBS_STACK.at(-1);
  if (!fr) throw new RPLError('Undefined local name: ENDSUB');
  s.push(Integer(BigInt(fr.total)));
}, { category: 'Lists / strings', categoryOrder: 32, label: "ENDSUB" });


register('STREAM', (s) => {
  _driveGen(runStream(s, 0), 'STREAM program');
}, { category: 'Lists / strings', categoryOrder: 30, label: "STREAM" });


register('GETI', (s) => {
  const [target, idx] = s.popN(2);
  const { coll, name } = _collection(target, { strings: true });
  const pos = _position(coll, idx);
  s.push(name ?? coll);
  s.push(_nextPosition(pos));
  s.push(_elementAt(coll, pos.k));
}, { category: 'Lists / strings', categoryOrder: 2, label: "GETI" });


register('PUTI', (s) => {
  const [target, idx, val] = s.popN(3);
  const { coll, name } = _collection(target);
  const pos = _position(coll, idx);
  const result = _withElement(coll, pos.k, val);
  if (name) storeVar(name.id, result);
  s.push(name ?? result);
  s.push(_nextPosition(pos));
}, { category: 'Lists / strings', categoryOrder: 3, label: "PUTI" });


register('APPEND', (s) => {
  const [host, val] = s.popN(2);
  if (!isList(host)) throw new RPLError('Bad argument type');
  s.push(RList([...host.items, val]));
}, { category: 'Lists / strings', categoryOrder: 8, label: "APPEND" });
