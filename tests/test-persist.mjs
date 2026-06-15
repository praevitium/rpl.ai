/* Round-trip test for src/rpl/persist.js — snapshot() + rehydrate()
   without touching localStorage or the DOM. */

import { Stack } from '../www/src/rpl/stack.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Program,
  RList, Vector, Matrix, Tagged, Symbolic,
  isReal, isInteger, isBinaryInteger, isComplex, isString, isName,
  isList, isVector, isMatrix, isProgram, isTagged, isSymbolic,
  isDirectory,
} from '../www/src/rpl/types.js';
import { Num, Var, Bin } from '../www/src/rpl/algebra.js';
import {
  state as calcState, setAngle,
  varStore, resetHome, currentPath,
  makeSubdir, goInto,
  seedPrng, getPrngSeed, resetPrng, nextPrngUnit,
} from '../www/src/rpl/state.js';
import { snapshot, rehydrate } from '../www/src/rpl/persist.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('ok  ', msg);
}

/* session117: local `assertThrows` mirroring `tests/helpers.mjs` so
   this standalone file can drop the `let threw = …; try { … }
   catch { threw = true; }` boilerplate.  Returns the caught error
   so callers can pin message-shape regressions independently. */
function assertThrows(fn, pattern, msg) {
  let threw = false;
  let caught = null;
  try { fn(); }
  catch (e) {
    caught = e;
    if (pattern == null) threw = true;
    else if (pattern instanceof RegExp) threw = pattern.test(e.message);
    else threw = String(e.message).includes(String(pattern));
  }
  assert(threw, msg);
  return caught;
}

/* --- Seed a rich state: stack with varied types, angle=DEG, a
       subdir, and a variable in it. --- */
resetHome();
setAngle('DEG');

const s = new Stack();
s.push(Real(3.14));
s.push(Integer(42));
s.push(Complex(1, 2));
s.push(Str('hello'));
s.push(Name('X', { quoted: true }));
s.push(RList([Real(1), Real(2), Real(3)]));
s.push(Vector([Real(1), Real(2)]));
s.push(Tagged('LABEL', Real(7)));
s.push(Program([Real(1), Real(2), Name('+')]));

varStore('A', Real(100));
varStore('BIG', Integer(2n ** 80n));        // exercises BigInt
const sub = makeSubdir('SUB');
goInto('SUB');
varStore('INNER', Str('from inside'));

/* --- Take snapshot, wipe state, rehydrate, verify. --- */
const snap = snapshot(s);
const json = JSON.parse(JSON.stringify(snap));   // force JSON round-trip

resetHome();
setAngle('RAD');
const s2 = new Stack();

rehydrate(json, s2);

assert(calcState.angle === 'DEG', 'angle restored to DEG');
assert(currentPath().join('/') === 'HOME/SUB', 'path restored to HOME/SUB');

assert(s2.depth === 9, 'stack has 9 items after restore');

const lvl1 = s2.peek(1);
assert(isProgram(lvl1), 'level 1 is Program');
assert(lvl1.tokens.length === 3 && isReal(lvl1.tokens[0]) && lvl1.tokens[0].value.eq(1),
       'program token[0] is Real(1)');
assert(isName(lvl1.tokens[2]) && lvl1.tokens[2].id === '+',
       'program token[2] is Name(+)');

const tagged = s2.peek(2);
assert(isTagged(tagged) && tagged.tag === 'LABEL' && tagged.value.value.eq(7),
       'tagged 7 restored');

const vec = s2.peek(3);
assert(isVector(vec) && vec.items[1].value.eq(2), 'vector[1] restored');

const list = s2.peek(4);
assert(isList(list) && list.items.length === 3 && list.items[2].value.eq(3),
       'list[2] restored');

const qname = s2.peek(5);
assert(isName(qname) && qname.id === 'X' && qname.quoted === true, 'quoted Name X');

const str = s2.peek(6);
assert(isString(str) && str.value === 'hello', 'string restored');

const cx = s2.peek(7);
assert(isComplex(cx) && cx.re === 1 && cx.im === 2, 'complex restored');

const int = s2.peek(8);
assert(isInteger(int) && int.value === 42n, 'Integer 42 restored');

const real = s2.peek(9);
assert(isReal(real) && real.value.eq(3.14), 'Real 3.14 restored');

// Current dir is SUB now.  Check INNER.
const inner = calcState.current.entries.get('INNER');
assert(inner && isString(inner) && inner.value === 'from inside',
       'INNER in current dir (SUB)');

// Walk back to HOME to inspect A and BIG.
calcState.current = calcState.home;
const a   = calcState.current.entries.get('A');
const big = calcState.current.entries.get('BIG');
assert(a && isReal(a) && a.value.eq(100), 'A restored');
assert(big && isInteger(big) && big.value === (2n ** 80n), 'BigInt-valued Integer restored');

const subDir = calcState.current.entries.get('SUB');
assert(subDir && isDirectory(subDir), 'SUB restored as Directory');
assert(subDir.parent === calcState.home, 'SUB.parent relinked to live HOME');

/* --- Unknown-version rejection ---
     `assertThrows` + follow-up regex guards pin the message shape
     and the rejection surface of adjacent bad-input shapes.  Each
     assertion is an independent regression guard over distinct
     branches in `rehydrate()`'s shape check (`persist.js:125-132`). */
const verErr = assertThrows(
  () => rehydrate({ version: 999 }, new Stack()),
  /unsupported version/,
  'unknown version is rejected');
assert(verErr && /\b999\b/.test(verErr.message),
  'session117: unknown-version error echoes the bad version "999" in the message');
// Missing-version: same code path (snap.version !== SCHEMA_VERSION)
// but exercises the `undefined` branch.  Pinning as a separate
// regression guard because a future schema migration that adds a
// default-version fallback could silently swallow missing-version
// snapshots.
assertThrows(
  () => rehydrate({}, new Stack()),
  /unsupported version/,
  'session117: missing version (snap.version === undefined) is rejected with same shape');
// Non-object snap: distinct reject path at persist.js:125 — the
// version check never fires because the object-shape check errors
// first.
assertThrows(
  () => rehydrate(null, new Stack()),
  /not an object/,
  'session117: null snap rejected with "not an object" (distinct branch from version check)');
assertThrows(
  () => rehydrate('not-a-snap', new Stack()),
  /not an object/,
  'session117: string snap rejected with "not an object" (distinct branch from version check)');

/* --- Extended type coverage: Matrix, BinaryInteger, Symbolic.
       Uses an independent snapshot so it doesn't shuffle the level
       indices the assertions above depend on. --- */
resetHome();
const s3 = new Stack();
s3.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
s3.push(BinaryInteger(0xFFn, 'h'));
// 'X^2 + 1' as an AST — exercises nested Bin + Var + Num round-trip.
s3.push(Symbolic(Bin('+', Bin('^', Var('X'), Num(2)), Num(1))));

const snap2 = snapshot(s3);
const json2 = JSON.parse(JSON.stringify(snap2));
resetHome();
const s4 = new Stack();
rehydrate(json2, s4);

assert(s4.depth === 3, 'extended stack has 3 items after restore');

const sym = s4.peek(1);
assert(isSymbolic(sym) && sym.expr?.kind === 'bin' && sym.expr.op === '+',
       'Symbolic: top-level Bin(+) restored');
assert(sym.expr.l?.kind === 'bin' && sym.expr.l.op === '^' &&
       sym.expr.l.l?.kind === 'var' && sym.expr.l.l.name === 'X' &&
       sym.expr.l.r?.kind === 'num' && sym.expr.l.r.value === 2,
       'Symbolic: X^2 sub-tree restored');
assert(sym.expr.r?.kind === 'num' && sym.expr.r.value === 1,
       'Symbolic: +1 leaf restored');

const bi = s4.peek(2);
assert(isBinaryInteger(bi) && bi.value === 0xFFn && bi.base === 'h',
       'BinaryInteger #FFh restored (value is BigInt, base preserved)');

const mat = s4.peek(3);
assert(isMatrix(mat) && mat.rows.length === 2 && mat.rows[0].length === 2,
       'Matrix 2×2 shape restored');
assert(isReal(mat.rows[0][1]) && mat.rows[0][1].value.eq(2) &&
       isReal(mat.rows[1][0]) && mat.rows[1][0].value.eq(3),
       'Matrix cell values restored');

/* --- PRNG seed survives the snapshot round-trip.
       Seed the PRNG, advance it once, snapshot, reset, rehydrate; the
       seed field should restore to the same BigInt value, and the
       next draw should match the pre-snapshot draw produced from the
       same state.  Done as an independent block so it doesn't perturb
       the stack-order assertions above. --- */
{
  resetHome();
  const s5 = new Stack();
  seedPrng(424242);
  const seedAfterSet = getPrngSeed();
  // Pre-snapshot: advance once, record the draw, then rewind the PRNG.
  const expectedNext = nextPrngUnit();
  seedPrng(424242);   // rewind so the snapshot is frozen at seedAfterSet
  assert(getPrngSeed() === seedAfterSet, 'session051: PRNG rewind matches');

  const snap3 = snapshot(s5);
  const json3 = JSON.parse(JSON.stringify(snap3));

  // Wipe + rehydrate into a fresh seed that must be overwritten.
  resetPrng();                 // seed back to boot default
  assert(getPrngSeed() !== seedAfterSet, 'session051: pre-rehydrate seed differs');
  const s6 = new Stack();
  rehydrate(json3, s6);
  assert(getPrngSeed() === seedAfterSet,
    `session051: prngSeed restored to ${seedAfterSet} (got ${getPrngSeed()})`);
  const drawAfter = nextPrngUnit();
  assert(drawAfter === expectedNext,
    `session051: first PRNG draw after rehydrate matches pre-snapshot draw (${drawAfter} vs ${expectedNext})`);

  // Old snapshot without prngSeed rehydrates without touching the seed.
  seedPrng(777);
  const pinnedSeed = getPrngSeed();
  const legacySnap = { ...snap3 };
  delete legacySnap.prngSeed;
  rehydrate(legacySnap, new Stack());
  assert(getPrngSeed() === pinnedSeed,
    'session051: snapshot missing prngSeed leaves current seed untouched');

  resetPrng();
}

/* --- VX (CAS main variable) survives snapshot / rehydrate. --- */
{
  const { setCasVx, resetCasVx, getCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  setCasVx('T');                                  // pin to T so 'X' default is clearly rejected
  const s4 = new Stack();
  s4.push(Integer(1n));
  const snap4 = snapshot(s4);
  const json4 = JSON.parse(JSON.stringify(snap4));
  resetCasVx();                                   // wipe back to 'X'
  const s5 = new Stack();
  rehydrate(json4, s5);
  assert(getCasVx() === 'T',
    `session076: casVx restored to 'T' after snapshot round-trip (got '${getCasVx()}')`);

  // Old snapshot without casVx rehydrates to the rpl5050 default of
  // lowercase 'x' (deliberate deviation from the HP50 factory 'X' —
  // see state.js casVx comment).
  const legacy = { ...snap4 };
  delete legacy.casVx;
  setCasVx('Q');                                  // pin to Q so the default reset is observable
  rehydrate(legacy, new Stack());
  assert(getCasVx() === 'x',
    `session076: snapshot missing casVx resets to default 'x' (got '${getCasVx()}')`);

  resetCasVx();
}

/* --- MODULO state survives snapshot / rehydrate. --- */
{
  const { setCasModulo, resetCasModulo, getCasModulo } =
    await import('../www/src/rpl/state.js');
  resetCasModulo();
  setCasModulo(23n);                              // pin to 23 so the 13 default is clearly rejected
  const s6 = new Stack();
  s6.push(Integer(1n));
  const snap6 = snapshot(s6);
  const json6 = JSON.parse(JSON.stringify(snap6));
  resetCasModulo();                                // wipe back to 13n
  rehydrate(json6, new Stack());
  assert(getCasModulo() === 23n,
    `session144: casModulo restored to 23n after snapshot round-trip (got ${getCasModulo()})`);

  // Old snapshot missing casModulo rehydrates to the 13n default.
  const legacy6 = { ...snap6 };
  delete legacy6.casModulo;
  setCasModulo(31n);                               // pin to 31 so the default reset is observable
  rehydrate(legacy6, new Stack());
  assert(getCasModulo() === 13n,
    `session144: snapshot missing casModulo resets to default 13n (got ${getCasModulo()})`);

  resetCasModulo();
}

/* --- Single-variable export / import (Files-tab Download / Upload).
       snapshotVariable + rehydrateVariable round-trip one named entry
       at a time, distinct from the full-tree snapshot above.  Tests
       cover Real, BigInt-backed Integer, a Directory subtree (so the
       parent-relink contract is exercised), and the rejection paths
       on malformed input — the wire format must stay distinguishable
       from the full snapshot so the right rehydrate fires. --- */
{
  const { snapshotVariable, rehydrateVariable } =
    await import('../www/src/rpl/persist.js');

  resetHome();
  const realVar = Real(3.14159);
  const sn = snapshotVariable('PI3', realVar);
  assert(sn.kind === 'variable' && sn.name === 'PI3',
    'session-files: snapshotVariable carries kind/name fields');
  const round = rehydrateVariable(JSON.parse(JSON.stringify(sn)));
  assert(round.name === 'PI3' && isReal(round.value) && round.value.value.eq(3.14159),
    'session-files: Real round-trips through snapshotVariable / rehydrateVariable');

  // BigInt-valued Integer keeps its precision through the encoder.
  const big = Integer(2n ** 90n);
  const bsn = JSON.parse(JSON.stringify(snapshotVariable('BIG', big)));
  const brec = rehydrateVariable(bsn);
  assert(isInteger(brec.value) && brec.value.value === (2n ** 90n),
    'session-files: BigInt-valued Integer round-trips');

  // Directory subtree: a Directory containing Real + nested Directory.
  // After rehydrate the .parent is null at the top (the caller relinks
  // before installing); the inner directory's parent points at the
  // newly-decoded outer dir.
  resetHome();
  const outer = makeSubdir('OUTER');
  goInto('OUTER');
  varStore('LEAF', Real(7));
  const inner = makeSubdir('INNER');
  goInto('INNER');
  varStore('TIP', Real(99));
  // Snap to HOME so the snapshotVariable picks up OUTER as a value.
  calcState.current = calcState.home;
  const dsn = JSON.parse(JSON.stringify(snapshotVariable('OUTER', outer)));
  const drec = rehydrateVariable(dsn);
  assert(isDirectory(drec.value) && drec.value.parent === null,
    'session-files: Directory rehydrates with null top-level parent');
  const reInner = drec.value.entries.get('INNER');
  assert(reInner && isDirectory(reInner) && reInner.parent === drec.value,
    'session-files: nested Directory parent re-linked to its rehydrated parent');
  const reTip = reInner.entries.get('TIP');
  assert(reTip && isReal(reTip) && reTip.value.eq(99),
    'session-files: deeply-nested Real survives the variable-export round-trip');

  // Malformed inputs are rejected with shape-pinned messages so the
  // Files-tab error toast is meaningful.
  assertThrows(() => rehydrateVariable(null),
    /not an object/,
    'session-files: null variable snapshot rejected');
  assertThrows(() => rehydrateVariable({ version: 999, kind: 'variable', name: 'x', value: null }),
    /unsupported version/,
    'session-files: wrong-version variable snapshot rejected');
  assertThrows(() => rehydrateVariable({ version: 1, kind: 'snapshot', name: 'x', value: null }),
    /unsupported kind/,
    'session-files: full-snapshot mistakenly fed to rehydrateVariable rejected');
  assertThrows(() => rehydrateVariable({ version: 1, kind: 'variable', name: '', value: null }),
    /missing name/,
    'session-files: empty variable name rejected');
}

/* --- getDirectoryByPath: walks HOME-rooted segments to a Directory.
       Accepts both shapes the Files tab might hand it: ['HOME', 'A']
       (matching currentPath()) and bare ['A'] (no leading HOME).
       Returns null on misses and on names that resolve to non-Directory
       values — the Files-tab Move action relies on the null sentinel
       to flash an error rather than throwing. --- */
{
  const { getDirectoryByPath } = await import('../www/src/rpl/state.js');

  resetHome();
  makeSubdir('A');
  goInto('A');
  makeSubdir('B');
  varStore('LEAF', Real(1));
  calcState.current = calcState.home;

  assert(getDirectoryByPath([])?.name === 'HOME',
    'session-files: empty path lands on HOME');
  assert(getDirectoryByPath(['HOME'])?.name === 'HOME',
    'session-files: leading HOME segment lands on HOME');
  assert(getDirectoryByPath(['A'])?.name === 'A',
    'session-files: bare A walks from HOME');
  assert(getDirectoryByPath(['HOME', 'A', 'B'])?.name === 'B',
    'session-files: HOME/A/B resolves to nested directory');
  assert(getDirectoryByPath(['HOME', 'A', 'NOPE']) === null,
    'session-files: missing segment returns null');
  assert(getDirectoryByPath(['HOME', 'A', 'LEAF']) === null,
    'session-files: non-Directory segment returns null');
  assert(getDirectoryByPath('not-array') === null,
    'session-files: non-array argument returns null');
}

/* --- moveCurrentEntry: relocates a variable from state.current to a
       target Directory.  Append-to-end semantics preserve the "order
       added" contract the Files tab promises.  Guards: missing source,
       collision in target, moving a directory into itself. --- */
{
  const { moveCurrentEntry, getDirectoryByPath } =
    await import('../www/src/rpl/state.js');

  resetHome();
  makeSubdir('SRC');
  makeSubdir('DST');
  goInto('SRC');
  varStore('A', Real(1));
  varStore('B', Real(2));
  // SRC/B will move to DST.
  const dst = getDirectoryByPath(['HOME', 'DST']);
  moveCurrentEntry('B', dst);
  assert(!calcState.current.entries.has('B'),
    'session-files: B removed from source dir after moveCurrentEntry');
  assert(calcState.current.entries.has('A'),
    'session-files: A still in source dir');
  assert(dst.entries.has('B') && dst.entries.get('B').value.eq(2),
    'session-files: B now lives in DST with original value');

  // Move a Directory and confirm its .parent re-links to the new home.
  calcState.current = calcState.home;
  const movedDir = makeSubdir('PORTABLE');
  const oldParent = movedDir.parent;
  assert(oldParent === calcState.home, 'pre: PORTABLE parent is HOME');
  const dstAgain = getDirectoryByPath(['DST']);
  moveCurrentEntry('PORTABLE', dstAgain);
  assert(movedDir.parent === dstAgain,
    'session-files: moved Directory.parent re-linked to new parent');

  // Collision on target name throws "Name conflict".
  varStore('CLASH', Real(7));
  dstAgain.entries.set('CLASH', Real(99));
  assertThrows(() => moveCurrentEntry('CLASH', dstAgain),
    /Name conflict/,
    'session-files: moving onto an existing target name throws Name conflict');

  // Moving an entry that doesn't exist throws Undefined name.
  assertThrows(() => moveCurrentEntry('GHOST', dstAgain),
    /Undefined name/,
    'session-files: missing source entry throws Undefined name');

  // Cycle guard: moving a directory into itself (or into a descendant)
  // is rejected.  Build HOME/X/Y so we can try to move X into Y.
  resetHome();
  const X = makeSubdir('X');
  goInto('X');
  const Y = makeSubdir('Y');
  calcState.current = calcState.home;
  assertThrows(() => moveCurrentEntry('X', Y),
    /into itself/,
    'session-files: moving a directory into one of its descendants throws cycle error');

  // Bad target type — pass a non-Directory.
  assertThrows(() => moveCurrentEntry('X', Real(5)),
    /not a directory/,
    'session-files: non-Directory target rejected');
}

console.log(failed ? `\n${failed} FAIL(s)` : '\nALL PERSIST TESTS PASSED');
process.exit(failed ? 1 : 0);
