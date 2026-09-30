import { varStore, varRecall, varPurge, varOrder, makeSubdir, goUp, goHome, currentPath, state as _calcState, reorderCurrentEntries, cloneDirectory, inScratchState } from '../state.js';
import { RPLError } from '../stack.js';
import { isList, RList, Name, isInteger, isReal, isName, isString, isDirectory, isTagged } from '../types.js';
import { archiveBackup, restoreBackup } from '../persist.js';
import { register, lookup } from './registry.js';
import { _coerceDirName, _coerceStorableName, _hp50TypeCode, recallVar, storeVar } from './internal.js';



// state.js reports directory conflicts as plain Errors; an RPLError lets
// IFERR trap them and ERRN number them.
function _asRPLError(fn) {
  try { return fn(); }
  catch (e) { throw new RPLError(e.message || 'Bad argument value'); }
}

function _store(id, value) {
  _asRPLError(() => storeVar(id, value));
}

function _recall(id) {
  const v = recallVar(id);
  if (v === undefined) throw new RPLError(`Undefined name: ${id}`);
  if (isDirectory(v)) return cloneDirectory(v);
  return v;
}

// A List applies the command to each name in turn.  As on the HP50, names
// done before a failing one stay done.
function _forEachName(v, fn) {
  if (isList(v)) {
    for (const item of v.items) fn(item);
  } else {
    fn(v);
  }
}


register('STO', (s) => {
  const [value, nameVal] = s.popN(2);
  _forEachName(nameVal, (n) => _store(_coerceStorableName(n), value));
}, { category: 'Variables / directories', categoryOrder: 0, label: "STO" });


register('RCL', (s) => {
  _forEachName(s.pop(), (n) => s.push(_recall(_coerceDirName(n))));
}, { category: 'Variables / directories', categoryOrder: 1, label: "RCL" });


function _purge(id) {
  if (!_asRPLError(() => varPurge(id))) throw new RPLError(`Undefined name: ${id}`);
}

register('PURGE', (s) => {
  _forEachName(s.pop(), (n) => _purge(_coerceDirName(n)));
}, { category: 'Variables / directories', categoryOrder: 2, label: "PURGE" });


// Subdirectories that still hold something stay, as on the HP50.
register('CLVAR', () => {
  for (const id of varOrder()) {
    const entry = _calcState.current.entries.get(id);
    if (!(isDirectory(entry) && entry.entries.size > 0)) varPurge(id);
  }
}, { category: 'Variables / directories', categoryOrder: 21, label: "CLVAR" });


// Newest first, like the names on the HP50's VAR menu.
register('VARS', (s) => {
  s.push(RList(varOrder().reverse().map(id => Name(id))));
}, { category: 'Variables / directories', categoryOrder: 3, label: "VARS" });


function _tvarsCoerceCode(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}


// n keeps variables of TYPE n and -n drops them; the codes of a list
// combine, and an empty list keeps everything.  Only the current directory
// is searched.
function _tvarsFilter(codes) {
  const include = new Set();
  const exclude = new Set();
  for (const n of codes) {
    if (!Number.isInteger(n)) throw new RPLError('Bad argument value');
    if (n >= 0) include.add(n);
    else        exclude.add(-n);
  }
  const names = [];
  for (const id of varOrder().reverse()) {
    const code = _hp50TypeCode(varRecall(id));
    if (include.size > 0 && !include.has(code)) continue;
    if (exclude.has(code)) continue;
    names.push(Name(id));
  }
  return names;
}


register('TVARS', (s) => {
  const v = s.pop();
  const codes = isList(v) ? v.items.map(_tvarsCoerceCode) : [_tvarsCoerceCode(v)];
  s.push(RList(_tvarsFilter(codes)));
}, { category: 'Variables / directories', categoryOrder: 4, label: "TVARS" });


function _mkdir(id) {
  _asRPLError(() => makeSubdir(id));
}

register('CRDIR', (s) => {
  _forEachName(s.pop(), (n) => _mkdir(_coerceStorableName(n)));
}, { category: 'Variables / directories', categoryOrder: 5, label: "CRDIR" });


register('UPDIR', () => { goUp(); }, { category: 'Variables / directories', categoryOrder: 6, label: "UPDIR" });


register('HOME',  () => { goHome(); }, { category: 'Variables / directories', categoryOrder: 7, label: "HOME" });


register('PATH',  (s) => {
  s.push(RList(currentPath().map(seg => Name(seg))));
}, { category: 'Variables / directories', categoryOrder: 8, label: "PATH" });


// value 'name' STO+ and 'name' value STO+ both work.  The stored value is
// the left operand, which matters for STO- and STO/.
function _stoArith(opSymbol) {
  return (s) => {
    const [a, b] = s.popN(2);
    let nameVal, value;
    if (isName(a) || isString(a))      { nameVal = a; value = b; }
    else if (isName(b) || isString(b)) { nameVal = b; value = a; }
    else { throw new RPLError('Bad argument type'); }
    const id = _coerceStorableName(nameVal);
    s.push(_recall(id));
    s.push(value);
    lookup(opSymbol).fn(s);
    _store(id, s.pop());
  };
}


register('STO+', _stoArith('+'), { category: 'Variables / directories', categoryOrder: 12, label: "STO+" });

register('STO-', _stoArith('-'), { category: 'Variables / directories', categoryOrder: 13, label: "STO-" });

register('STO*', _stoArith('*'), { category: 'Variables / directories', categoryOrder: 14, label: "STO*" });

register('STO/', _stoArith('/'), { category: 'Variables / directories', categoryOrder: 15, label: "STO/" });


function _storedUnary(opSymbol) {
  return (s) => {
    _forEachName(s.pop(), (n) => {
      const id = _coerceDirName(n);
      s.push(_recall(id));
      lookup(opSymbol).fn(s);
      _store(id, s.pop());
    });
  };
}

register('SNEG',  _storedUnary('NEG'), { category: 'Variables / directories', categoryOrder: 16, label: "SNEG" });

register('SINV',  _storedUnary('INV'), { category: 'Variables / directories', categoryOrder: 17, label: "SINV" });

register('SCONJ', _storedUnary('CONJ'), { category: 'Variables / directories', categoryOrder: 18, label: "SCONJ" });


// Unlike PURGE, PGDIR removes a directory together with its contents.  It
// refuses a name that is not a directory, where the HP50 would purge it.
function _pgdir(id) {
  const existing = _calcState.current.entries.get(id);
  if (existing === undefined) throw new RPLError(`Undefined name: ${id}`);
  if (!isDirectory(existing)) throw new RPLError('Bad argument type');
  varPurge(id, true);
}


register('PGDIR', (s) => {
  _forEachName(s.pop(), (n) => _pgdir(_coerceDirName(n)));
}, { category: 'Variables / directories', categoryOrder: 9, label: "PGDIR" });


register('ORDER', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  reorderCurrentEntries(l.items.map(_coerceDirName));
}, { category: 'Variables / directories', categoryOrder: 10, label: "ORDER" });


// Every key is checked first so a bad pair cannot leave a half-merged
// directory.
register('MERGE', (s) => {
  const [arg] = s.popN(1);
  if (isDirectory(arg)) {
    for (const [name, value] of arg.entries) _asRPLError(() => varStore(name, value));
    return;
  }
  if (!isList(arg)) throw new RPLError('Bad argument type');
  const items = arg.items;
  if (items.length % 2 !== 0) {
    throw new RPLError('Bad argument value');
  }
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    if (!isName(key) && !isString(key)) {
      throw new RPLError('Bad argument value');
    }
  }
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    _asRPLError(() => varStore(isName(key) ? key.id : key.value, items[i + 1]));
  }
}, { category: 'Variables / directories', categoryOrder: 11, label: "MERGE" });


function _popBackupObject(s) {
  const [v] = s.popN(1);
  if (!isTagged(v) || !isName(v.value)) throw new RPLError('Bad argument type');
  return { port: v.tag, name: v.value.id };
}

register('ARCHIVE', (s) => {
  const { port, name } = _popBackupObject(s);
  if (!inScratchState()) archiveBackup(port, name, s);
}, { category: 'Variables / directories', categoryOrder: 19, label: "ARCHIVE" });

register('RESTORE', (s) => {
  const { port, name } = _popBackupObject(s);
  restoreBackup(port, name, s);
}, { category: 'Variables / directories', categoryOrder: 20, label: "RESTORE" });
