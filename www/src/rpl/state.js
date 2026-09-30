/* Global calculator modes and flags.  Ops change them through the set*
   helpers so subscribers fire once per change. */

import { Directory, TYPES, BIN_BASES } from './types.js';
import { setStateBatcher } from './stack.js';

// RAD first: it is the boot default here, although the HP50 boots in DEG.
export const ANGLE_MODES = Object.freeze(['RAD', 'DEG', 'GRD']);
export const COORD_MODES = Object.freeze(['RECT', 'CYLIN', 'SPHERE']);

const _listeners = new Set();
let _noteBatch = 0;
let _notePending = false;
let _scratchDepth = 0;

const _home = Directory({ name: 'HOME' });

export const WORDSIZE_MIN = 1;
export const WORDSIZE_MAX = 64;
export const WORDSIZE_DEFAULT = 64;

// realMaxExp sets MAXR (9.99…E+n) and MINR (1E-n) only; arithmetic is not
// clamped to it.  The HP50's BCD format stops at 499; decimal.js at 9e15.
export const REAL_MAX_EXP_DEFAULT = 999;
export const REAL_MAX_EXP_MIN     = 10;
export const REAL_MAX_EXP_MAX     = 9e15;

export const state = {
  angle:   'RAD',
  coordMode: 'RECT',         // display only; stored values stay rectangular
  displayMode: 'STD',
  displayDigits: 12,
  home:    _home,
  current: _home,
  lastError: null,           // { message, number } of the last trapped error
  wordsize: WORDSIZE_DEFAULT,
  binaryBase: 'd',           // null renders each BinInt in its own base
  textbookMode: true,
  approxMode: false,         // flag -105, clear at boot as on the HP50
  userFlags: new Set(),      // user flags 1..128, system flags -1..-128
  complexMode: false,        // flag -103
  lastFitModel: null,        // { kind, a, b } for PREDV / PREDX; not persisted
  casVx: 'x',                // the HP50 uses 'X'; lowercase matches the keyboard
  casModulo: 13n,
  realMaxExp: REAL_MAX_EXP_DEFAULT,
  // Suspended programs, oldest first, as { generator, tokens, index, kind }.
  // halted is the newest one, which CONT resumes first.
  halted: null,
  haltedStack: [],
  promptMessage: null,
};

function _dispatchState() {
  for (const fn of _listeners) {
    try { fn(state); } catch (e) { console.error('state listener', e); }
  }
}

function _emit() {
  if (_noteBatch > 0) {
    _notePending = true;
    return;
  }
  _dispatchState();
}

export function batchStateNotifications(fn) {
  _noteBatch++;
  try {
    return fn();
  } finally {
    _noteBatch--;
    if (_noteBatch === 0 && _notePending) {
      _notePending = false;
      _dispatchState();
    }
  }
}

setStateBatcher(batchStateNotifications);

export function inScratchState() {
  return _scratchDepth > 0;
}

function _set(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  _emit();
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function notify() { _emit(); }

export function setAngle(mode) {
  const m = String(mode).toUpperCase();
  if (!ANGLE_MODES.includes(m)) {
    throw new Error(`Unknown angle mode: ${mode}`);
  }
  _set('angle', m);
}

export function cycleAngle() {
  const i = ANGLE_MODES.indexOf(state.angle);
  setAngle(ANGLE_MODES[(i + 1) % ANGLE_MODES.length]);
}

export function setCoordMode(mode) {
  const m = String(mode).toUpperCase();
  if (!COORD_MODES.includes(m)) {
    throw new Error(`Unknown coordinate mode: ${mode}`);
  }
  _set('coordMode', m);
}

export function cycleCoordMode() {
  const i = COORD_MODES.indexOf(state.coordMode);
  setCoordMode(COORD_MODES[(i + 1) % COORD_MODES.length]);
}

export const DISPLAY_MODES = Object.freeze(['STD', 'FIX', 'SCI', 'ENG']);

export function setDisplay(mode, digits) {
  const m = String(mode).toUpperCase();
  if (!DISPLAY_MODES.includes(m)) {
    throw new Error(`Unknown display mode: ${mode}`);
  }
  let changed = false;
  if (state.displayMode !== m) { state.displayMode = m; changed = true; }
  if (m !== 'STD' && Number.isFinite(digits) && state.displayDigits !== digits) {
    state.displayDigits = digits;
    changed = true;
  }
  if (changed) _emit();
}

export function toRadians(x) {
  switch (state.angle) {
    case 'DEG': return x * Math.PI / 180;
    case 'GRD': return x * Math.PI / 200;
    case 'RAD':
    default:    return x;
  }
}

// sin, cos or tan of an angle in the current mode.  A DEG or GRD angle is cut
// into whole quadrants first, so 90 COS is exactly 0 rather than 6E-17.
export function angleTrig(kind, x) {
  const quadrant = { DEG: 90, GRD: 100 }[state.angle];
  if (quadrant === undefined || !Number.isFinite(x)) return Math[kind](toRadians(x));
  const turn = 4 * quadrant;
  const r = ((x % turn) + turn) % turn;
  const quarters = Math.floor(r / quadrant);
  const t = r - quarters * quadrant;
  if (t === 0) {
    if (kind === 'tan') return quarters % 2 === 0 ? 0 : Infinity;
    return (kind === 'sin' ? [0, 1, 0, -1] : [1, 0, -1, 0])[quarters];
  }
  const theta = t * Math.PI / (2 * quadrant);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const [sine, cosine] = [[s, c], [c, -s], [-s, -c], [-c, s]][quarters];
  return kind === 'sin' ? sine : kind === 'cos' ? cosine : sine / cosine;
}

export function fromRadians(x) {
  switch (state.angle) {
    case 'DEG': return x * 180 / Math.PI;
    case 'GRD': return x * 200 / Math.PI;
    case 'RAD':
    default:    return x;
  }
}

// Clamps silently to 1..64, like the HP50.
export function setWordsize(n) {
  let v = Number(n);
  if (!Number.isFinite(v)) throw new Error(`STWS needs a number, got ${n}`);
  v = Math.trunc(v);
  if (v < WORDSIZE_MIN) v = WORDSIZE_MIN;
  if (v > WORDSIZE_MAX) v = WORDSIZE_MAX;
  _set('wordsize', v);
}

export function getWordsize() { return state.wordsize; }

export function getWordsizeMask() {
  return (1n << BigInt(state.wordsize)) - 1n;
}

export function setBinaryBase(b) {
  const s = b == null ? null : String(b).toLowerCase();
  if (s !== null && !BIN_BASES.includes(s)) {
    throw new Error(`setBinaryBase: expected h/d/o/b or null, got ${b}`);
  }
  _set('binaryBase', s);
}

export function getBinaryBase() { return state.binaryBase; }

export function setTextbookMode(on) { _set('textbookMode', !!on); }

export function getTextbookMode() { return state.textbookMode; }

export function setApproxMode(on) { _set('approxMode', !!on); }

export function getApproxMode() { return state.approxMode; }

export function toggleApproxMode() { _set('approxMode', !state.approxMode); }

export function setComplexMode(on) { _set('complexMode', !!on); }

export function getComplexMode() { return state.complexMode; }

export function toggleComplexMode() { _set('complexMode', !state.complexMode); }

export const FIT_KINDS = Object.freeze(['LIN', 'LOG', 'EXP', 'PWR']);

export function evalFitModel(model, x) {
  if (!model || !Number.isFinite(x)) return NaN;
  switch (model.kind) {
    case 'LIN': return model.a + model.b * x;
    case 'LOG': return x > 0 ? model.a + model.b * Math.log(x) : NaN;
    case 'EXP': return model.a * Math.exp(model.b * x);
    case 'PWR': return x > 0 ? model.a * Math.pow(x, model.b) : NaN;
    default: return NaN;
  }
}

export function setLastFitModel(kind, a, b) {
  if (!FIT_KINDS.includes(kind)) {
    throw new Error(`setLastFitModel: bad kind ${kind}`);
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error(`setLastFitModel: non-finite coefficient`);
  }
  state.lastFitModel = { kind, a, b };
  _emit();
}

export function getLastFitModel() { return state.lastFitModel; }

export function clearLastFitModel() { _set('lastFitModel', null); }

export function setHalted(h) {
  state.haltedStack.push(h);
  state.halted = h;
  _emit();
}

export function getHalted() { return state.halted; }

// generator.return() runs the program's finally blocks, which release the
// compiled-local frames it held.
function _closeRecord(record) {
  if (record && record.generator) {
    try { record.generator.return(); } catch (_) { /* ignore */ }
  }
}

function _popHalted(close) {
  const record = state.haltedStack.pop();
  if (close) _closeRecord(record);
  state.halted = state.haltedStack[state.haltedStack.length - 1] ?? null;
  _emit();
  return record;
}

// CONT takes the record with its generator still live.
export function takeHalted() {
  return state.haltedStack.length === 0 ? null : _popHalted(false);
}

export function clearHalted() {
  if (state.haltedStack.length > 0) _popHalted(true);
}

export function clearAllHalted() {
  if (state.haltedStack.length === 0 && state.halted === null) return;
  for (const record of state.haltedStack) _closeRecord(record);
  state.haltedStack.length = 0;
  state.halted = null;
  _emit();
}

export function haltedDepth() { return state.haltedStack.length; }

export function setPromptMessage(v) { _set('promptMessage', v); }

export function getPromptMessage() { return state.promptMessage; }

export function clearPromptMessage() { _set('promptMessage', null); }

export function setCasVx(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`setCasVx: expected a non-empty string, got ${name}`);
  }
  _set('casVx', name);
}

export function getCasVx() { return state.casVx; }

export function resetCasVx() { _set('casVx', 'x'); }

// HP50 AUR p.3-150: the modulus is stored as |m| and never below 2.
export function setCasModulo(m) {
  if (typeof m !== 'bigint') {
    throw new Error(`setCasModulo: expected BigInt, got ${typeof m}`);
  }
  let n = m < 0n ? -m : m;
  if (n < 2n) n = 2n;
  _set('casModulo', n);
}

export function getCasModulo() { return state.casModulo; }

export function resetCasModulo() { _set('casModulo', 13n); }

function _validFlag(n) {
  const k = Math.trunc(Number(n));
  if (!Number.isFinite(k) || k === 0 || k < -128 || k > 128) {
    throw new Error(`Invalid flag number: ${n}`);
  }
  return k;
}

// The system flags that encode a mode (AUR appendix C) read and write the
// mode itself, so -17 SF selects RAD and RAD sets -17.  Each field is a
// binary number whose lowest bit is flag -low.
const BASE_CODES = ['d', 'o', 'b', 'h'];
const COORD_CODES = { RECT: 0, CYLIN: 2, SPHERE: 3 };
const ANGLE_CODES = { DEG: 0, RAD: 1, GRD: 2 };
const MODE_FIELDS = [
  { low: 5, bits: 6, get: () => state.wordsize - 1, set: (v) => setWordsize(v + 1) },
  { low: 11, bits: 2, get: () => Math.max(0, BASE_CODES.indexOf(state.binaryBase)), set: (v) => setBinaryBase(BASE_CODES[v]) },
  { low: 15, bits: 2, get: () => COORD_CODES[state.coordMode], set: (v) => setCoordMode(v & 2 ? (v & 1 ? 'SPHERE' : 'CYLIN') : 'RECT') },
  { low: 17, bits: 2, get: () => ANGLE_CODES[state.angle], set: (v) => setAngle(v & 1 ? 'RAD' : v & 2 ? 'GRD' : 'DEG') },
  { low: 45, bits: 4, get: () => Math.min(state.displayDigits, 11), set: (v) => _set('displayDigits', Math.min(v, 11)) },
  { low: 49, bits: 2, get: () => DISPLAY_MODES.indexOf(state.displayMode), set: (v) => setDisplay(DISPLAY_MODES[v]) },
  { low: 103, bits: 1, get: () => Number(state.complexMode), set: (v) => setComplexMode(v === 1) },
  { low: 105, bits: 1, get: () => Number(state.approxMode), set: (v) => setApproxMode(v === 1) },
];

function _modeField(k) {
  return k < 0 ? MODE_FIELDS.find((f) => -k >= f.low && -k < f.low + f.bits) : undefined;
}

export const isModeFlag = (n) => _modeField(n) !== undefined;

function _writeFlag(k, on) {
  const field = _modeField(k);
  if (field) {
    const bit = 1 << (-k - field.low);
    const v = field.get();
    field.set(on ? v | bit : v & ~bit);
    return;
  }
  if (state.userFlags.has(k) === on) return;
  if (on) state.userFlags.add(k);
  else state.userFlags.delete(k);
  _emit();
}

export function setUserFlag(n) { _writeFlag(_validFlag(n), true); }

export function clearUserFlag(n) { _writeFlag(_validFlag(n), false); }

export function testUserFlag(n) {
  const k = _validFlag(n);
  const field = _modeField(k);
  if (field) return ((field.get() >> (-k - field.low)) & 1) === 1;
  return state.userFlags.has(k);
}

// Every set flag, mode flags included, in ascending order.
export function setFlagNumbers() {
  const nums = [...state.userFlags];
  for (const f of MODE_FIELDS) {
    const v = f.get();
    for (let b = 0; b < f.bits; b++) if ((v >> b) & 1) nums.push(-(f.low + b));
  }
  return nums.sort((a, b) => a - b);
}

// STOF: exactly the listed flags end up set, so modes follow the list too.
export function replaceFlags(nums) {
  const want = new Set(nums.map(_validFlag));
  for (const f of MODE_FIELDS) {
    let v = 0;
    for (let b = 0; b < f.bits; b++) if (want.has(-(f.low + b))) v |= 1 << b;
    f.set(v);
  }
  state.userFlags = new Set([...want].filter((k) => !_modeField(k)));
  _emit();
}

// Clears the flags that are not modes; the modes stay as they are.
export function clearAllUserFlags() {
  if (state.userFlags.size === 0) return;
  state.userFlags.clear();
  _emit();
}

export function getRealMaxExp() { return state.realMaxExp; }

export function setRealMaxExp(n) {
  if (!Number.isInteger(n) || n < REAL_MAX_EXP_MIN || n > REAL_MAX_EXP_MAX) {
    throw new Error(
      `realMaxExp must be an integer in [${REAL_MAX_EXP_MIN}, ${REAL_MAX_EXP_MAX}], got ${n}`
    );
  }
  state.realMaxExp = n;
  _emit();
}

export function resetRealMaxExp() {
  setRealMaxExp(REAL_MAX_EXP_DEFAULT);
}

export function resetBinaryState() {
  state.wordsize = WORDSIZE_DEFAULT;
  state.binaryBase = null;
  _emit();
}

// Park-Miller minimal-standard LCG shared by RAND, RANM and RDZ, with a
// BigInt seed in [1, PRNG_MOD-1].  The fixed boot seed makes the first RAND
// sequence reproducible, as on a reset HP50.
const PRNG_MOD = 2147483647n;
const PRNG_MULT = 48271n;
const PRNG_DEFAULT = 741n;

state.prngSeed = PRNG_DEFAULT;

// RDZ 0 seeds from the clock.  0 is the LCG's fixed point, so it is mapped
// to 1 after the reduction.
export function seedPrng(n) {
  let b;
  if (typeof n === 'bigint') b = n;
  else {
    const k = Number(n);
    if (!Number.isFinite(k)) throw new Error(`seedPrng: not a number: ${n}`);
    b = BigInt(Math.trunc(k));
  }
  if (b === 0n) b = BigInt(Date.now());
  let s = ((b % (PRNG_MOD - 1n)) + (PRNG_MOD - 1n)) % (PRNG_MOD - 1n);
  if (s === 0n) s = 1n;
  state.prngSeed = s;
  _emit();
}

function _prngAdvance() {
  state.prngSeed = (state.prngSeed * PRNG_MULT) % PRNG_MOD;
  return state.prngSeed;
}

export function nextPrngUnit() {
  return Number(_prngAdvance()) / Number(PRNG_MOD);
}

export function nextPrngInt9() {
  return Math.floor(nextPrngUnit() * 19) - 9;
}

export function resetPrng() {
  state.prngSeed = PRNG_DEFAULT;
  _emit();
}

export function getPrngSeed() { return state.prngSeed; }

function _directoryReaches(dir, target, seen) {
  if (!dir || dir.type !== TYPES.DIRECTORY) return false;
  if (dir === target) return true;
  if (seen.has(dir)) return false;
  seen.add(dir);
  for (const value of dir.entries.values()) {
    if (_directoryReaches(value, target, seen)) return true;
  }
  return false;
}

// The HP50 refuses to overwrite a subdirectory with STO.  Errors here are
// plain; the ops wrap them in RPLError.
export function varStore(id, value) {
  const key = String(id);
  const existing = state.current.entries.get(key);
  if (existing && existing.type === TYPES.DIRECTORY) {
    throw new Error(`Directory not allowed: ${key}`);
  }
  let stored = value;
  if (value && value.type === TYPES.DIRECTORY) {
    if (_directoryReaches(value, state.current, new Set())) throw new Error('Cannot store a directory inside itself');
    stored = _cloneDir(value, state.current, null, key);
  }
  state.current.entries.set(key, stored);
  _emit();
}

// Map has no in-place reorder, so the directory gets a rebuilt Map.
function _setEntries(dir, pairs) {
  dir.entries = new Map(pairs);
  _emit();
}

// Keeps the entry's position in the directory.
export function renameCurrentEntry(oldId, newId) {
  const oldKey = String(oldId);
  const newKey = String(newId);
  if (oldKey === newKey) return;
  const dir = state.current;
  if (!dir.entries.has(oldKey)) throw new Error(`Undefined name: ${oldKey}`);
  if (dir.entries.has(newKey)) throw new Error(`Name conflict: ${newKey}`);
  const value = dir.entries.get(oldKey);
  if (value && value.type === TYPES.DIRECTORY) value.name = newKey;
  _setEntries(dir, [...dir.entries].map(([k, v]) => [k === oldKey ? newKey : k, v]));
}

// Like RCL on the HP50, a lookup walks up through the parent directories.
export function varRecall(id) {
  const key = String(id);
  for (let d = state.current; d; d = d.parent) {
    if (d.entries.has(key)) return d.entries.get(key);
  }
  return undefined;
}

// Only the current directory.  A non-empty subdirectory needs force (PGDIR);
// PURGE refuses it, as on the HP50.
export function varPurge(id, force = false) {
  const key = String(id);
  const existing = state.current.entries.get(key);
  if (!force && existing && existing.type === TYPES.DIRECTORY && existing.entries.size > 0) {
    throw new Error(`Directory not empty: ${key}`);
  }
  const gone = state.current.entries.delete(key);
  if (gone) _emit();
  return gone;
}

// Alphabetical, for display.  VARS uses varOrder so ORDER shows on the stack.
export function varList() {
  return [...state.current.entries.keys()].sort();
}

export function varOrder() {
  return [...state.current.entries.keys()];
}

export function reorderCurrentEntry(name, beforeName) {
  const dir = state.current;
  const key = String(name);
  if (!dir.entries.has(key)) return;
  const keys = [...dir.entries.keys()];
  const fromIdx = keys.indexOf(key);
  let targetIdx;
  if (beforeName == null) {
    targetIdx = keys.length;
  } else {
    targetIdx = keys.indexOf(String(beforeName));
    if (targetIdx < 0) return;
  }
  if (targetIdx > fromIdx) targetIdx--;
  if (targetIdx === fromIdx) return;
  keys.splice(fromIdx, 1);
  keys.splice(targetIdx, 0, key);
  _setEntries(dir, keys.map((k) => [k, dir.entries.get(k)]));
}

// ORDER: `names` first, in that order, then the rest as they were.  Unknown
// names are ignored and a repeated name counts at its first position.
export function reorderCurrentEntries(names) {
  const dir = state.current;
  const existing = dir.entries;
  if (existing.size === 0) return;
  const first = new Set([...names].map(String).filter((key) => existing.has(key)));
  const rest = [...existing.keys()].filter((key) => !first.has(key));
  _setEntries(dir, [...first, ...rest].map((key) => [key, existing.get(key)]));
}

export function currentPath() {
  const out = [];
  for (let d = state.current; d; d = d.parent) out.unshift(d.name);
  return out;
}

// Test isolation: also closes and drops suspended programs so a HALT in one
// test cannot be CONT'd from the next.
export function resetHome() {
  for (const record of state.haltedStack) _closeRecord(record);
  _home.entries.clear();
  state.current = _home;
  state.halted = null;
  state.haltedStack.length = 0;
  state.promptMessage = null;
  _emit();
}

export function goHome() { _set('current', _home); }

// UPDIR from HOME is a silent no-op, as on the HP50.
export function goUp() {
  const p = state.current.parent;
  if (!p) return;
  state.current = p;
  _emit();
}

export function goInto(id) {
  const key = String(id);
  const next = state.current.entries.get(key);
  if (!next || next.type !== TYPES.DIRECTORY) return false;
  state.current = next;
  _emit();
  return true;
}

// EVAL of a directory value: the target need not be a child of current,
// since varRecall also finds names in ancestor directories.
export function enterDirectory(dir) {
  if (!dir || dir.type !== TYPES.DIRECTORY) return false;
  _set('current', dir);
  return true;
}

// CRDIR stays in the current directory, as on the HP50.
export function makeSubdir(id) {
  const key = String(id);
  if (state.current.entries.has(key)) {
    throw new Error(`Name conflict: ${key}`);
  }
  const sub = Directory({ name: key, parent: state.current });
  state.current.entries.set(key, sub);
  _emit();
  return sub;
}

// Accepts currentPath()'s ['HOME', 'A'] as well as ['A']; empty segments
// are skipped.
export function getDirectoryByPath(segments) {
  if (!Array.isArray(segments)) return null;
  const start = segments[0] === state.home.name ? 1 : 0;
  return _walkPath(state.home, segments.slice(start).map(String).filter(Boolean));
}

// Every check runs before anything moves, so a failure leaves the tree intact.
export function moveCurrentEntry(name, targetDir) {
  const key = String(name);
  const src = state.current;
  if (!src.entries.has(key)) {
    throw new Error(`Undefined name: ${key}`);
  }
  if (!targetDir || targetDir.type !== TYPES.DIRECTORY) {
    throw new Error(`Bad target: not a directory`);
  }
  if (targetDir === src) return;
  if (targetDir.entries.has(key)) {
    throw new Error(`Name conflict: ${key}`);
  }
  const value = src.entries.get(key);
  const isDir = value && value.type === TYPES.DIRECTORY;
  if (isDir) {
    for (let d = targetDir; d; d = d.parent) {
      if (d === value) {
        throw new Error(`Cannot move ${key} into itself`);
      }
    }
  }
  src.entries.delete(key);
  targetDir.entries.set(key, value);
  if (isDir) value.parent = targetDir;
  _emit();
}

// ERRN numbers; DOERR in ops/evaluation.js keeps the inverse table.  The
// 0x5xx directory codes are local stand-ins.
const _ERROR_NUMBERS = Object.freeze({
  'Too few arguments':    0x201,
  'Bad argument type':    0x202,
  'Bad argument value':   0x203,
  'Undefined name':       0x204,
  'Division by zero':     0x303,
  'Infinite result':      0x305,
  'Name conflict':        0x501,
  'Directory not allowed':0x502,
  'Directory not empty':  0x503,
});

// ERRM reports the message without the dispatcher's `CMD: ` prefix.  A
// message such as "Undefined name: X" is numbered by its leading key.
export function setLastError(err) {
  const raw = (err && err.message) ? String(err.message) : String(err);
  const m = raw.match(/^[^\s:]+:\s(.+)$/);
  const message = m ? m[1] : raw;
  const entry = Object.entries(_ERROR_NUMBERS)
    .find(([key]) => message === key || message.startsWith(key + ':'));
  state.lastError = { message, number: entry ? entry[1] : 0 };
}

export function clearLastError() {
  state.lastError = null;
}

export function getLastError() {
  return state.lastError;
}

// Nested IFERR puts the outer trap's record back verbatim.
export function restoreLastError(rec) {
  state.lastError = rec;
}

// Undo history for variables and directories, kept in step with the
// stack's.  Snapshots clone the directory tree but share the (immutable)
// values; restoring refills HOME in place so references to state.home stay
// valid.

function _cloneDir(dir, newParent = null, seen = null, name = dir.name) {
  const bag = seen ?? new Map();
  const already = bag.get(dir);
  if (already) return already;
  const clone = Directory({ name, parent: newParent });
  bag.set(dir, clone);
  for (const [key, value] of dir.entries) {
    if (value && value.type === TYPES.DIRECTORY) {
      clone.entries.set(key, _cloneDir(value, clone, bag));
    } else {
      clone.entries.set(key, value);
    }
  }
  return clone;
}

export function cloneDirectory(dir) {
  return _cloneDir(dir);
}

function _walkPath(root, names) {
  let cur = root;
  for (const n of names) {
    const next = cur.entries.get(n);
    if (!next || next.type !== TYPES.DIRECTORY) return null;
    cur = next;
  }
  return cur;
}

function _pathNamesToCurrent() {
  const names = [];
  for (let d = state.current; d && d !== _home; d = d.parent) {
    names.unshift(d.name);
  }
  return names;
}

// Clones again so the snapshot stays reusable: undo and redo swap them.
function _repopulateHome(snapHome) {
  const fresh = _cloneDir(snapHome);
  state.home.entries.clear();
  for (const [k, v] of fresh.entries) {
    if (v && v.type === TYPES.DIRECTORY) v.parent = state.home;
    state.home.entries.set(k, v);
  }
}

let _varUndoStack = [];
let _varRedoStack = [];

const VAR_UNDO_MAX = 100;          // matches Stack.UNDO_MAX

function _snapshotVarState() {
  return { home: _cloneDir(state.home), path: _pathNamesToCurrent() };
}

function _restoreVarSnapshot(snap) {
  _repopulateHome(snap.home);
  const landed = _walkPath(state.home, snap.path);
  state.current = landed ?? state.home;
}

export function saveVarStateForUndo() {
  _varUndoStack.push(_snapshotVarState());
  if (_varUndoStack.length > VAR_UNDO_MAX) {
    _varUndoStack.splice(0, _varUndoStack.length - VAR_UNDO_MAX);
  }
  _varRedoStack = [];
}

export function hasVarUndo() {
  return _varUndoStack.length > 0;
}

export function hasVarRedo() {
  return _varRedoStack.length > 0;
}

export function clearVarUndo() {
  _varUndoStack = [];
  _varRedoStack = [];
}

function _sameDir(a, b, seen = new Map()) {
  if (a === b) return true;
  const prior = seen.get(a);
  if (prior) return prior === b;
  seen.set(a, b);
  if (a.entries.size !== b.entries.size) return false;
  const other = [...b.entries];
  let i = 0;
  for (const [key, value] of a.entries) {
    const [otherKey, otherValue] = other[i++];
    if (key !== otherKey) return false;
    const isDir = value?.type === TYPES.DIRECTORY;
    if (isDir !== (otherValue?.type === TYPES.DIRECTORY)) return false;
    if (isDir ? !_sameDir(value, otherValue, seen) : value !== otherValue) return false;
  }
  return true;
}

function _varStateMatches(snap) {
  const path = _pathNamesToCurrent();
  return path.length === snap.path.length
    && path.every((name, i) => name === snap.path[i])
    && _sameDir(state.home, snap.home);
}

export function varStateMatchesUndoTop() {
  const top = _varUndoStack[_varUndoStack.length - 1];
  return !!top && _varStateMatches(top);
}

export function dropVarUndoTop() {
  _varUndoStack.pop();
}

export function undoVarState() {
  if (_varUndoStack.length === 0) throw new Error('No undo available');
  const prior = _varUndoStack.pop();
  _varRedoStack.push(_snapshotVarState());
  _restoreVarSnapshot(prior);
  _emit();
}

export function redoVarState() {
  if (_varRedoStack.length === 0) throw new Error('No redo available');
  const future = _varRedoStack.pop();
  _varUndoStack.push(_snapshotVarState());
  _restoreVarSnapshot(future);
  _emit();
}

// Everything the ops read or write here, so the assistant can run RPL in a
// sandbox and roll it back, or undo a whole assistant turn.  The stack is
// captured separately with Stack.save / restore.
const CAPTURED_SCALARS = [
  'angle', 'coordMode', 'displayMode', 'displayDigits', 'lastError',
  'wordsize', 'binaryBase', 'textbookMode', 'approxMode', 'complexMode',
  'lastFitModel', 'casVx', 'casModulo', 'halted', 'promptMessage', 'prngSeed',
  'realMaxExp',
];

export function captureCalcState() {
  const scalars = {};
  for (const k of CAPTURED_SCALARS) scalars[k] = state[k];
  return {
    vars: _snapshotVarState(),
    scalars,
    userFlags: new Set(state.userFlags),
    haltedStack: [...state.haltedStack],
  };
}

export function restoreCalcState(snap) {
  for (const record of state.haltedStack) {
    if (!snap.haltedStack.includes(record)) _closeRecord(record);
  }
  _restoreVarSnapshot(snap.vars);
  Object.assign(state, snap.scalars);
  state.userFlags = new Set(snap.userFlags);
  state.haltedStack = [...snap.haltedStack];
  _emit();
}

function _calcStateMatches(snap) {
  return CAPTURED_SCALARS.every((k) => state[k] === snap.scalars[k])
    && state.userFlags.size === snap.userFlags.size
    && [...state.userFlags].every((flag) => snap.userFlags.has(flag))
    && state.haltedStack.length === snap.haltedStack.length
    && state.haltedStack.every((record, i) => record === snap.haltedStack[i])
    && _varStateMatches(snap.vars);
}

// A run that changed nothing restores nothing, so it wakes no subscriber and
// leaves the directory objects alone.
export function withScratchState(fn) {
  const snap = captureCalcState();
  const pendingBefore = _notePending;
  _scratchDepth++;
  _noteBatch++;
  try {
    return fn();
  } finally {
    _notePending = pendingBefore;
    _noteBatch--;
    _scratchDepth--;
    if (!_calcStateMatches(snap)) restoreCalcState(snap);
  }
}
