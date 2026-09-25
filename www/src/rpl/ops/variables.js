import { varStore, varRecall, varPurge, varOrder, makeSubdir, goUp, goHome, currentPath, state as _calcState, reorderCurrentEntries } from '../state.js';
import { RPLError } from '../stack.js';
import { isList, RList, Name, isInteger, isReal, isName, isString, isDirectory, isTagged } from '../types.js';
import { archiveBackup, restoreBackup } from '../persist.js';
import { register, lookup } from './registry.js';
import { _coerceDirName, _coerceStorableName, _hp50TypeCode } from './internal.js';



function _storeOneOrRPL(id, value) {
  try { varStore(id, value); }
  catch (e) {
    // varStore throws a plain Error('Directory not allowed: <id>') if
    // the name already refers to a subdirectory.  Convert so IFERR
    // catches and ERRN classifies.
    throw new RPLError(e.message || 'Bad argument value');
  }
}


register('STO', (s) => {
  // level 2 = value, level 1 = name (or list of names — HP50 AUR
  // stores the same value into each listed name, left-to-right).
  const [value, nameVal] = s.popN(2);
  if (isList(nameVal)) {
    for (const item of nameVal.items) {
      _storeOneOrRPL(_coerceStorableName(item), value);
    }
    return;
  }
  _storeOneOrRPL(_coerceStorableName(nameVal), value);
}, { category: 'Variables / directories', categoryOrder: 0, label: "STO" });


function _recallOneOrRPL(id) {
  const v = varRecall(id);
  if (v === undefined) throw new RPLError(`Undefined name: ${id}`);
  return v;
}


register('RCL', (s) => {
  // A list of names recalls each in order, pushing their values onto
  // the stack — matches HP50 AUR and the PURGE / STO list-shaped
  // conventions.  Single Name / String path unchanged.
  const v = s.pop();
  if (isList(v)) {
    for (const item of v.items) {
      s.push(_recallOneOrRPL(_coerceDirName(item)));
    }
    return;
  }
  s.push(_recallOneOrRPL(_coerceDirName(v)));
}, { category: 'Variables / directories', categoryOrder: 1, label: "RCL" });


function _purgeOneOrRPL(id) {
  let gone;
  try { gone = varPurge(id); }
  catch (e) {
    // varPurge throws a plain Error('Directory not empty: <id>') for
    // non-empty subdirectories.  Wrap so IFERR can trap it.
    throw new RPLError(e.message || 'Bad argument value');
  }
  // HP50 PURGE on a missing variable errors quietly; mimic that with a
  // descriptive RPLError (the UI will flash it on the cmdline).
  if (!gone) throw new RPLError(`Undefined name: ${id}`);
}


register('PURGE', (s) => {
  const v = s.pop();
  if (isList(v)) {
    // HP50 convention (AUR §2.8): iterate left-to-right.  If any one
    // fails, earlier ones stay purged — no transactional rollback,
    // matching CRDIR's partial-commit behavior on the same shape.
    for (const item of v.items) {
      _purgeOneOrRPL(_coerceDirName(item));
    }
    return;
  }
  _purgeOneOrRPL(_coerceDirName(v));
}, { category: 'Variables / directories', categoryOrder: 2, label: "PURGE" });


register('VARS', (s) => {
  // Reverse-insertion order: the most-recently-stored / most-recently-
  // ORDERed name ends up at list[0], matching the left-to-right order
  // of names on a physical HP50 VAR menu (AUR §2.8).  ORDER has a
  // visible effect on this list, just in reversed orientation.
  s.push(RList(varOrder().slice().reverse().map(id => Name(id))));
}, { category: 'Variables / directories', categoryOrder: 3, label: "VARS" });


/* ------------------------------------------------------------------
   TVARS — type-filtered VARS (AUR §3 p.2-261).

     n      TVARS  → { names }   names whose TYPE code == n
                                 (or != |n| when n < 0)
     {...}  TVARS  → { names }   union of positive type codes, minus
                                 any type codes listed as negatives

   Type codes match HP50 User Guide §2 (same table as the `TYPE` op);
   our `_hp50TypeCode` helper supplies them.  Non-integer Reals and
   non-integer Rationals are rejected as "Bad argument value".  Empty
   lists are accepted and select everything (HP50 parity — an empty
   include-set means "no positive filter applied").  Ordering of the
   returned list matches `VARS` (reverse-insertion), so CONT/KILL /
   repeated TVARS calls stay stable under ORDER.

   Follows HP50 semantics: only the current directory is searched
   (TVARS never walks up the dir chain — use PATH + VARS for that).
   ------------------------------------------------------------------ */
function _tvarsCoerceCode(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}


function _tvarsFilter(codes) {
  const include = new Set();
  const exclude = new Set();
  for (const n of codes) {
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new RPLError('Bad argument value');
    }
    if (n >= 0) include.add(n);
    else        exclude.add(-n);
  }
  const names = [];
  // Use the same reverse-insertion order as VARS so the returned list
  // is a drop-in filtered view.
  for (const id of varOrder().slice().reverse()) {
    const val = varRecall(id);
    if (val === undefined) continue;  // purged mid-walk — skip
    const code = _hp50TypeCode(val);
    if (include.size > 0 && !include.has(code)) continue;
    if (exclude.has(code)) continue;
    names.push(Name(id));
  }
  return names;
}


register('TVARS', (s) => {
  const v = s.pop();
  if (isList(v)) {
    const codes = v.items.map(_tvarsCoerceCode);
    s.push(RList(_tvarsFilter(codes)));
    return;
  }
  const code = _tvarsCoerceCode(v);
  s.push(RList(_tvarsFilter([code])));
}, { category: 'Variables / directories', categoryOrder: 4, label: "TVARS" });


function _mkSubdirOrRPL(id) {
  try { makeSubdir(id); }
  catch (e) {
    // makeSubdir throws a plain Error on a name collision; convert to
    // RPLError so IFERR can trap it and ERRN can classify it.
    throw new RPLError(e.message || 'Bad argument value');
  }
}


register('CRDIR', (s) => {
  const v = s.pop();
  if (isList(v)) {
    // HP50 convention: iterate left-to-right, creating each.  If any
    // one of them conflicts, the remainder are not created — but the
    // ones already created stand (we don't attempt a transactional
    // rollback, same as the real unit).
    for (const item of v.items) {
      _mkSubdirOrRPL(_coerceStorableName(item));
    }
    return;
  }
  _mkSubdirOrRPL(_coerceStorableName(v));
}, { category: 'Variables / directories', categoryOrder: 5, label: "CRDIR" });


register('UPDIR', () => { goUp(); }, { category: 'Variables / directories', categoryOrder: 6, label: "UPDIR" });


register('HOME',  () => { goHome(); }, { category: 'Variables / directories', categoryOrder: 7, label: "HOME" });


register('PATH',  (s) => {
  s.push(RList(currentPath().map(seg => Name(seg))));
}, { category: 'Variables / directories', categoryOrder: 8, label: "PATH" });


/* ----------------------------------------------------------------
   Stored-variable arithmetic — STO+, STO-, STO*, STO/.

   HP50 accepts EITHER stack order:
     value  'name'  STO+          ('name'  value  STO+  too)
   We detect which operand is the Name/String and which is the value.

   If NEITHER operand is a name, HP50 treats STO+/STO- etc. as a form
   of object arithmetic (store add-into-level-2-object) but that path
   is rare; we throw "Bad argument type" rather than guess.
   ---------------------------------------------------------------- */
function _stoArith(opSymbol) {
  // Deferred lookup — the arithmetic op registrations live later in this
  // file, so `lookup(opSymbol)` at module-load time would find nothing.
  // Resolving at call time also means `_stoArith` always picks up the
  // authoritative dispatch even if the registry is re-wired later.
  return (s) => {
    const binop = lookup(opSymbol);
    if (!binop) throw new RPLError(`Bad argument value`);
    const [a, b] = s.popN(2);
    let nameVal, value;
    if (isName(a) || isString(a))      { nameVal = a; value = b; }
    else if (isName(b) || isString(b)) { nameVal = b; value = a; }
    else { throw new RPLError('Bad argument type'); }
    // STO+ / -/ * / /  always writes back into `id`, so validate up-front
    // against the same rules STO enforces.  Recalling a reserved or
    // syntactically broken name would only get us to "Undefined name"
    // anyway — fail earlier with the accurate "Invalid name" error.
    const id = _coerceStorableName(nameVal);
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    // Build a tiny stack, apply binop.  HP50 semantics: STO+ computes
    // stored + value (commutative for +/*; for -  and / the STORED
    // value is the LEFT operand, per HP50 Advanced Guide §3).
    s.push(stored);
    s.push(value);
    binop.fn(s);
    const [result] = s.popN(1);
    varStore(id, result);
  };
}


register('STO+', _stoArith('+'), { category: 'Variables / directories', categoryOrder: 12, label: "STO+" });

register('STO-', _stoArith('-'), { category: 'Variables / directories', categoryOrder: 13, label: "STO-" });

register('STO*', _stoArith('*'), { category: 'Variables / directories', categoryOrder: 14, label: "STO*" });

register('STO/', _stoArith('/'), { category: 'Variables / directories', categoryOrder: 15, label: "STO/" });


/* --------------- SNEG / SINV / SCONJ ---------------
   Parallel to the STO+ / STO- / STO(mul) / STO(div) family.  Read the
   stored value, apply the single-operand op, write it back.  Accepts
   Name or String identifier on level 1.  A name that doesn't exist
   throws 'Undefined name'.  The underlying NEG / INV / CONJ ops do
   the type-dispatch and throw on operands they can't handle (e.g.
   SCONJ on a String stored-value — 'Bad argument type').
   ----------------------------------------------------------------- */
function _storedUnary(opSymbol) {
  const unaryOp = lookup(opSymbol);
  if (!unaryOp) throw new Error('_storedUnary bootstrap: unknown op ' + opSymbol);
  const apply = (s, id) => {
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    s.push(stored);
    unaryOp.fn(s);
    const [result] = s.popN(1);
    try { varStore(id, result); }
    catch (e) { throw new RPLError(e.message || 'Bad argument value'); }
  };
  return (s) => {
    const v = s.pop();
    if (isList(v)) {
      for (const item of v.items) apply(s, _coerceDirName(item));
      return;
    }
    apply(s, _coerceDirName(v));
  };
}

register('SNEG',  _storedUnary('NEG'), { category: 'Variables / directories', categoryOrder: 16, label: "SNEG" });

register('SINV',  _storedUnary('INV'), { category: 'Variables / directories', categoryOrder: 17, label: "SINV" });

register('SCONJ', _storedUnary('CONJ'), { category: 'Variables / directories', categoryOrder: 18, label: "SCONJ" });


/* --------------- PGDIR ---------------
   HP50 AUR §7.  PGDIR is like PURGE but specifically for
   subdirectories, and unlike PURGE it is allowed to purge a
   non-empty subdirectory (recursive delete).  The HP50 silently
   accepts PGDIR on a name that refers to a non-directory as well,
   but we throw 'Bad argument type' — the user almost certainly
   meant PURGE, and a quiet accept is harder to debug later.

   Non-existent name: 'Undefined name: <id>' (matches PURGE).
   Target is a Directory but non-empty: allowed (recursive-delete
   via a `.entries.clear()` before the delete call, so varPurge's
   "Directory not empty" guard doesn't trip).
   ----------------------------------------------------------------- */
function _pgdirOneOrRPL(id) {
  const existing = _calcState.current.entries.get(id);
  if (existing === undefined) throw new RPLError(`Undefined name: ${id}`);
  if (!isDirectory(existing)) throw new RPLError('Bad argument type');
  // Recursively clear all nested entries so the built-in "Directory not
  // empty" guard in varPurge doesn't reject the delete.  Clearing in
  // place is fine — nothing else holds references to these entries.
  const _drop = (dir) => {
    for (const [k, v] of dir.entries) {
      if (v && v.type === 'directory') _drop(v);
      dir.entries.delete(k);
    }
  };
  _drop(existing);
  // Now the dir is empty; delete it from the parent.
  const gone = varPurge(id);
  if (!gone) throw new RPLError(`Undefined name: ${id}`);
}


register('PGDIR', (s) => {
  const v = s.pop();
  if (isList(v)) {
    for (const item of v.items) {
      _pgdirOneOrRPL(_coerceDirName(item));
    }
    return;
  }
  _pgdirOneOrRPL(_coerceDirName(v));
}, { category: 'Variables / directories', categoryOrder: 9, label: "PGDIR" });


/* --------------- ORDER — reorder current-directory entries ---------------
   HP50 AUR §2.8.  Pops a List of Names (or Strings) and rearranges the
   current directory so those names appear first in the given order,
   with remaining entries preserved in their existing relative order.
   Unknown / missing names in the input list are silently ignored
   (matches HP50 forgiving behavior).  Duplicates take effect at their
   first occurrence only.  Non-List input throws Bad argument type.
   ----------------------------------------------------------------- */
register('ORDER', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const names = [];
  for (const item of l.items) {
    if (isName(item))        names.push(item.id);
    else if (isString(item)) names.push(item.value);
    else throw new RPLError('Bad argument type');
  }
  reorderCurrentEntries(names);
}, { category: 'Variables / directories', categoryOrder: 10, label: "ORDER" });


/* --------------- MERGE — directory merge --------------------------------
   HP50 AUR §3.2 (directory manipulation — this slot is `MERGE` in the
   `MEMORY` soft-menu; documented in §3.2.3 on the 49g+/50g ROM 2.15).

     MERGE  ( D → )   D is a list of (name, value) pairs — exactly the
                      output shape of VARS → ORDER-agnostic listing, i.e.
                      { NAME1 VAL1 NAME2 VAL2 ... }.  Each pair is stored
                      in the current directory, overwriting any
                      existing entry with the same name (HP50 behavior).
                      Empty list is a no-op.  Odd-length list or
                      non-Name keys → Bad argument value.  Accepts a
                      Directory value in the top position too: the
                      merged entries are taken from that directory's
                      Map (HP50 extension — useful for
                      programmatic configuration merges).

   Every merged value goes through `varStore`, which fires the
   state-change event once per store so subscribers redraw.
   ----------------------------------------------------------------- */

register('MERGE', (s) => {
  const [arg] = s.popN(1);
  if (isDirectory(arg)) {
    for (const [name, value] of arg.entries) {
      varStore(name, value);
    }
    return;
  }
  if (!isList(arg)) throw new RPLError('Bad argument type');
  const items = arg.items;
  if (items.length % 2 !== 0) {
    throw new RPLError('Bad argument value');
  }
  // Validate all keys first so a bad pair near the end doesn't leave
  // a half-merged directory.
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    if (!isName(key) && !isString(key)) {
      throw new RPLError('Bad argument value');
    }
  }
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    const val = items[i + 1];
    const name = isName(key) ? key.id : key.value;
    varStore(name, val);
  }
}, { category: 'Variables / directories', categoryOrder: 11, label: "MERGE" });


function _popBackupObject(s) {
  const [v] = s.popN(1);
  if (!isTagged(v) || !isName(v.value)) throw new RPLError('Bad argument type');
  return { port: v.tag, name: v.value.id };
}

register('ARCHIVE', (s) => {
  const { port, name } = _popBackupObject(s);
  archiveBackup(port, name, s);
}, { category: 'Variables / directories', categoryOrder: 19, label: "ARCHIVE" });

register('RESTORE', (s) => {
  const { port, name } = _popBackupObject(s);
  restoreBackup(port, name, s);
}, { category: 'Variables / directories', categoryOrder: 20, label: "RESTORE" });
