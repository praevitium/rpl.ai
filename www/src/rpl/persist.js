/* Snapshots of the calculator state as JSON: the localStorage autosave,
   the first-run seed (www/hp50-all.json), .json export / import, and the
   named ARCHIVE / RESTORE backups all use snapshot() and rehydrate().

   Encoding:
     BigInt    → { __t: 'bigint', v: '<digits>' }
     Decimal   → { __t: 'decimal', v: '<toString()>' }   (Real payloads)
     Map       → { __t: 'map', v: [[k, encV], ...] }
     Directory → { type: 'directory', name, entries }   (parent dropped,
                 relinked on decode)
   Other objects are walked as plain objects and are not refrozen.

   Bump SCHEMA_VERSION whenever this shape changes incompatibly, so old
   saves are rejected instead of loading as garbage. */

import {
  state, currentPath, goHome, goInto, notify, seedPrng, setCasVx, setCasModulo, setRealAssume,
  ANGLE_MODES, COORD_MODES, DISPLAY_MODES, WORDSIZE_MIN, WORDSIZE_MAX, REAL_MAX_EXP_DEFAULT, REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX, isModeFlag,
} from './state.js';
import { TYPES, Decimal, BIN_BASES, Grob, isStorableHpName, bigintText, isStackOverflow } from './types.js';
import { RPLError } from './stack.js';
import { formatHpText, parseHpText } from './hp-text.js';
import { formatDelimited, importTable, importCells, isTable, xlsxRows, SHEET_MAX_CELLS } from './sheet.js';
import { buildXlsx, readXlsx } from './xlsx.js';
import SEED_STATE from '../../hp50-all.json' with { type: 'json' };

export const STORAGE_KEY = 'hp50.state';
export const SCHEMA_VERSION = 1;

function encode(v, seen) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'number', v: String(v) };
  if (typeof v === 'bigint') return { __t: 'bigint', v: bigintText(v) };
  if (v instanceof Decimal) return { __t: 'decimal', v: v.toString() };
  if (v instanceof Uint8Array) return { __t: 'bytes', v: Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') };
  if (v instanceof Map) {
    const bag = seen ?? new WeakSet();
    return { __t: 'map', v: [...v].map(([k, x]) => [k, encode(x, bag)]) };
  }
  if (Array.isArray(v)) {
    const bag = seen ?? new WeakSet();
    return v.map((item) => encode(item, bag));
  }
  if (typeof v === 'object') {
    const bag = seen ?? new WeakSet();
    if (v.type === TYPES.DIRECTORY) {
      if (bag.has(v)) {
        return { type: TYPES.DIRECTORY, name: v.name, entries: { __t: 'map', v: [] } };
      }
      bag.add(v);
    }
    const out = {};
    for (const k of Object.keys(v)) {
      if (k === 'parent') continue;
      out[k] = encode(v[k], bag);
    }
    return out;
  }
  return v;
}

function decode(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(decode);
  if (typeof v === 'object') {
    if (v.__t === 'bigint') return BigInt(v.v);
    if (v.__t === 'number') return Number(v.v);
    if (v.__t === 'decimal') return new Decimal(v.v);
    if (v.__t === 'bytes') return Uint8Array.from(v.v.match(/../g) ?? [], (h) => parseInt(h, 16));
    if (v.__t === 'map') {
      return new Map(v.v.map(([k, x]) => [k, decode(x)]));
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = decode(v[k]);
    return out;
  }
  return v;
}

export function encodeValue(v) { return encode(v); }
export function decodeValue(v) { return decode(v); }

function relinkParents(dir, parent = null, seen = new Set()) {
  if (!dir || seen.has(dir)) return;
  seen.add(dir);
  dir.parent = parent;
  if (!(dir.entries instanceof Map)) return;
  for (const child of dir.entries.values()) {
    if (child && child.type === TYPES.DIRECTORY) relinkParents(child, dir, seen);
  }
}

export function snapshot(stack) {
  return {
    version: SCHEMA_VERSION,
    angle:   state.angle,
    modes: {
      coordMode: state.coordMode,
      displayMode: state.displayMode,
      displayDigits: state.displayDigits,
      wordsize: state.wordsize,
      binaryBase: state.binaryBase,
      textbookMode: state.textbookMode,
      approxMode: state.approxMode,
      complexMode: state.complexMode,
      userFlags: [...state.userFlags],
    },
    home:    encode(state.home),
    path:    currentPath(),
    stack:   stack._items.map(encode),      // level 1 last
    prngSeed: encode(state.prngSeed),
    casVx: state.casVx,
    casModulo: encode(state.casModulo),
    realAssume: state.realAssume.map(encode),
    alarms: state.alarms,
    pict: encode(state.pict),
    userKeys: state.userKeys.map(([key, value]) => [key, encode(value)]),
    standardKeys: state.standardKeys,
    headerLines: state.headerLines,
    keyTime: state.keyTime,
    programLines: state.programLines,
    realMaxExp: state.realMaxExp,
    clockOffset: state.clockOffset,
  };
}

function decodePict(snap) {
  const g = decode(snap.pict ?? null);
  const fits = g?.type === TYPES.GROB && g.bytes instanceof Uint8Array && Number.isInteger(g.width) && Number.isInteger(g.height)
    && g.bytes.length === g.height * Math.ceil(g.width / 8);
  return fits ? Grob(g.width, g.height, g.bytes) : null;
}

// A pair that does not decode is dropped rather than failing the whole restore.
function decodeUserKeys(snap) {
  if (!Array.isArray(snap.userKeys)) return [];
  return snap.userKeys.flatMap((pair) => {
    if (!Array.isArray(pair) || !Number.isInteger(pair[0])) return [];
    try {
      return [[pair[0], decode(pair[1])]];
    } catch {
      return [];
    }
  });
}

// REALASSUME holds names and comparisons; anything else is dropped.
function decodeRealAssume(snap) {
  if (!Array.isArray(snap.realAssume)) return [];
  return snap.realAssume.flatMap((entry) => {
    try {
      const v = decode(entry);
      return v && (v.type === TYPES.NAME || v.type === TYPES.SYMBOLIC) ? [v] : [];
    } catch {
      return [];
    }
  });
}

const validAlarm = (a) => a && Number.isFinite(a.due) && typeof a.message === 'string' && Number.isFinite(a.repeat) && a.repeat >= 0;

function restoreModes(modes) {
  if (!modes || typeof modes !== 'object') return;
  if (COORD_MODES.includes(modes.coordMode)) state.coordMode = modes.coordMode;
  if (DISPLAY_MODES.includes(modes.displayMode)) state.displayMode = modes.displayMode;
  if (Number.isInteger(modes.displayDigits) && modes.displayDigits >= 0 && modes.displayDigits <= 11) {
    state.displayDigits = modes.displayDigits;
  }
  if (Number.isInteger(modes.wordsize) && modes.wordsize >= WORDSIZE_MIN && modes.wordsize <= WORDSIZE_MAX) {
    state.wordsize = modes.wordsize;
  }
  if (modes.binaryBase === null || BIN_BASES.includes(modes.binaryBase)) state.binaryBase = modes.binaryBase;
  for (const key of ['textbookMode', 'approxMode', 'complexMode']) {
    if (typeof modes[key] === 'boolean') state[key] = modes[key];
  }
  if (Array.isArray(modes.userFlags)) {
    state.userFlags = new Set(modes.userFlags.filter((n) => Number.isInteger(n) && n !== 0 && n >= -128 && n <= 128 && !isModeFlag(n)));
  }
}

function decodeCasModulo(snap) {
  if (snap.casModulo === undefined || snap.casModulo === null) return 13n;
  try {
    const m = decode(snap.casModulo);
    if (typeof m === 'bigint') return m;
    console.warn('hp50 persist: bad casModulo type, resetting');
  } catch (e) {
    console.warn('hp50 persist: bad casModulo, ignoring', e);
  }
  return 13n;
}

// Everything that can throw runs before any state changes, so a bad
// snapshot leaves the calculator as it was.
export function rehydrate(snap, stack) {
  if (!snap || typeof snap !== 'object') throw new Error('snapshot: not an object');
  if (snap.version !== SCHEMA_VERSION) {
    throw new Error(`snapshot: unsupported version ${snap.version}`);
  }
  const home = decode(snap.home);
  if (!home || home.type !== TYPES.DIRECTORY || !(home.entries instanceof Map)) {
    throw new Error('snapshot: home is not a directory');
  }
  const items = Array.isArray(snap.stack) ? snap.stack.map(decode) : [];
  const pict = decodePict(snap);
  const userKeys = decodeUserKeys(snap);

  // Refill the live HOME in place: other modules hold references to it.
  state.home.entries.clear();
  for (const [k, v] of home.entries) state.home.entries.set(k, v);
  relinkParents(state.home);

  // A saved path segment may no longer exist; stop at the deepest one found.
  goHome();
  const path = Array.isArray(snap.path) ? snap.path : ['HOME'];
  for (let i = 1; i < path.length; i++) {
    if (!goInto(path[i])) break;
  }

  state.angle = ANGLE_MODES.includes(snap.angle) ? snap.angle : 'RAD';

  if (snap.prngSeed !== undefined && snap.prngSeed !== null) {
    try {
      const decoded = decode(snap.prngSeed);
      if (typeof decoded === 'bigint' || typeof decoded === 'number') {
        seedPrng(decoded);
      }
    } catch (e) {
      console.warn('hp50 persist: bad prngSeed in snapshot, ignoring', e);
    }
  }

  // Saves from before lowercase became the default carry casVx 'X'.
  const vx = typeof snap.casVx === 'string' && snap.casVx.length > 0 ? snap.casVx : 'x';
  setCasVx(vx === 'X' ? 'x' : vx);

  setCasModulo(decodeCasModulo(snap));
  setRealAssume(decodeRealAssume(snap));

  restoreModes(snap.modes);
  state.alarms = (Array.isArray(snap.alarms) ? snap.alarms.filter(validAlarm) : [])
    .map((a) => ({ due: a.due, message: a.message, repeat: a.repeat, ack: !!a.ack })).sort((a, b) => a.due - b.due);
  state.pict = pict;
  state.userKeys = userKeys;
  state.standardKeys = snap.standardKeys !== false;
  state.headerLines = [0, 1, 2].includes(snap.headerLines) ? snap.headerLines : 2;
  state.keyTime = Number.isInteger(snap.keyTime) && snap.keyTime >= 0 && snap.keyTime <= 4096 ? snap.keyTime : 1138;
  state.programLines = Number.isInteger(snap.programLines) && snap.programLines >= 1 ? snap.programLines : 9;
  const maxExp = snap.realMaxExp;
  state.realMaxExp = Number.isInteger(maxExp) && maxExp >= REAL_MAX_EXP_MIN && maxExp <= REAL_MAX_EXP_MAX ? maxExp : REAL_MAX_EXP_DEFAULT;
  state.clockOffset = Number.isFinite(snap.clockOffset) ? snap.clockOffset : 0;

  stack.restore(items);
  notify();
}

// What this window last wrote to the store or read from it.
let _storedJson = null;

// Never throws. true when stored, 'trimmed' when backups were dropped, 'nested' when a value is too deep to write, false otherwise.
export function saveToLocalStorage(stack) {
  let json;
  try {
    json = JSON.stringify(snapshot(stack));
  } catch (e) {
    console.warn('hp50 autosave failed:', e);
    return isStackOverflow(e) ? 'nested' : false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, json);
    _storedJson = json;
    return true;
  } catch (e) {
    if (!(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014))) {
      console.warn('hp50 autosave failed:', e);
      return false;
    }
    try { localStorage.removeItem(BACKUPS_KEY); } catch { }
    try {
      localStorage.setItem(STORAGE_KEY, json);
      _storedJson = json;
      return 'trimmed';
    } catch (e2) {
      console.warn('hp50 autosave failed:', e2);
      return false;
    }
  }
}

// A snapshot that fails to load is dropped so the next start is clean.
function loadFromLocalStorage(stack) {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { return false; }
  if (!raw) return false;
  try {
    rehydrate(JSON.parse(raw), stack);
    _storedJson = raw;
    return true;
  } catch (e) {
    console.warn('hp50 load failed, clearing:', e);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return false;
  }
}

// Loads what another window saved since this one last wrote or read the
// store, so this window's next save does not overwrite it.
export function adoptStoredState(stack) {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { return false; }
  if (!raw || raw === _storedJson) return false;
  try {
    rehydrate(JSON.parse(raw), stack);
  } catch (e) {
    console.warn('hp50 sync failed:', e);
    return false;
  }
  _storedJson = raw;
  return true;
}

export function loadInitialState(stack) {
  if (loadFromLocalStorage(stack)) return 'stored';
  rehydrate(SEED_STATE, stack);
  return 'seed';
}

export const DRAFT_KEY = 'hp50.draft';
const DRAFT_MAX_CHARS = 100000;

// The command line typed but not entered, and the formula or matrix being written, which the HP keeps through power-off.
// Never throws: a draft is only a convenience.
export function saveDraft(draft) {
  try {
    if (draft && draft.text.length <= DRAFT_MAX_CHARS) {
      const kept = draft.writer && JSON.stringify(draft.writer).length > DRAFT_MAX_CHARS ? { text: draft.text, cursor: draft.cursor } : draft;
      if (kept.text.trim() || kept.writer) { localStorage.setItem(DRAFT_KEY, JSON.stringify(kept)); return; }
    }
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage is full or blocked */ }
}

// A writer's content as its snapshot() gives it, or null when what was saved is not that. A formula comes back without its
// undo steps.
function readWriter(writer) {
  const saved = writer?.saved;
  if (!saved || typeof saved !== 'object') return null;
  if (writer.mode === 'equation') {
    const { state } = saved;
    const shaped = Array.isArray(state?.root) && state.root.length > 0 && typeof state.target?.mode === 'string' && Array.isArray(state.target.path);
    return shaped ? { mode: 'equation', saved: { state: { ...state, history: [], future: [], typingKey: null, lastFace: null } } } : null;
  }
  if (writer.mode !== 'matrix') return null;
  const { grid, asVector, focus } = saved;
  const cell = (c) => c == null || typeof c === 'string' || typeof c === 'number';
  const shaped = Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0]) && grid[0].length > 0
    && grid.every((row) => Array.isArray(row) && row.length === grid[0].length && row.every(cell));
  const at = Array.isArray(focus) && focus.length === 2 && focus.every(Number.isInteger) ? focus : undefined;
  return shaped ? { mode: 'matrix', saved: { grid: grid.map((row) => row.map((c) => String(c ?? ''))), asVector: !!asVector, focus: at } } : null;
}

// The level or variable a draft was an edit of, by where it is and a hash of the value it started from, or null when what was saved
// is not that.
function readEdit(edit) {
  const named = edit?.kind === 'var' && typeof edit.name === 'string' && edit.name.length > 0 && edit.name.length <= 200;
  const leveled = edit?.kind === 'level' && Number.isInteger(edit.level) && edit.level >= 1;
  if (!(named || leveled) || !Number.isInteger(edit.was)) return null;
  return { kind: edit.kind, ...(leveled ? { level: edit.level } : { name: edit.name }), ...(edit.line === true && { line: true }), was: edit.was };
}

export function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    const text = typeof draft?.text === 'string' && draft.text.length <= DRAFT_MAX_CHARS ? draft.text : '';
    const writer = readWriter(draft?.writer);
    if (!text.trim() && !writer) return null;
    const cursor = Number.isInteger(draft.cursor) ? Math.max(0, Math.min(draft.cursor, text.length)) : text.length;
    const edit = readEdit(draft.edit);
    return { text, cursor, ...(writer && { writer }), ...(edit && { edit }) };
  } catch { return null; }
}

export const HISTORY_KEY = 'hp50.history';
const HISTORY_MAX_LINES = 100;
const HISTORY_MAX_CHARS = 100000;

// The lines entered, newest last, which the HP keeps through power-off as its last command lines. The newest that fit are kept.
export function saveHistory(lines) {
  try {
    let room = HISTORY_MAX_CHARS;
    const kept = [];
    for (let i = lines.length - 1; i >= 0 && lines[i].length <= room; i--) {
      kept.unshift(lines[i]);
      room -= lines[i].length;
    }
    if (kept.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    else localStorage.removeItem(HISTORY_KEY);
  } catch { /* storage is full or blocked */ }
}

export function loadHistory() {
  try {
    const lines = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? 'null');
    return Array.isArray(lines) ? lines.filter((line) => typeof line === 'string' && line.trim()).slice(-HISTORY_MAX_LINES) : [];
  } catch { return []; }
}

export const PLOT_KEY = 'hp50.plot';
const PLOT_MAX_TRACES = 20;
const PLOT_MAX_TEXT = 2000;
const PLOT_TEXTS = ['expr', 'exprY', 'exprZ', 'label'];
const PLOT_WINDOW = ['xmin', 'xmax', 'ymin', 'ymax'];

// The formulas on the plot and the window they are drawn in, which the HP keeps through power-off as EQ and PPAR, and the table's
// start and step.
// Never throws: a plot is only a convenience.
export function savePlot(plot) {
  try {
    if (plot) localStorage.setItem(PLOT_KEY, JSON.stringify(plot));
    else localStorage.removeItem(PLOT_KEY);
  } catch { /* storage is full or blocked */ }
}

export function loadPlot() {
  try {
    const { traces, view, table } = JSON.parse(localStorage.getItem(PLOT_KEY) ?? 'null') ?? {};
    const text = (v) => v === undefined || (typeof v === 'string' && v.length <= PLOT_MAX_TEXT);
    const sound = (t) => typeof t?.kind === 'string' && PLOT_TEXTS.every((k) => text(t[k]));
    const windowed = PLOT_WINDOW.every((k) => Number.isFinite(view?.[k])) && view.xmax > view.xmin && view.ymax > view.ymin;
    const kept = Number.isFinite(table?.start) && Number.isFinite(table?.step) && table.step !== 0 ? { start: table.start, step: table.step } : null;
    if (!Array.isArray(traces) || traces.length > PLOT_MAX_TRACES || !traces.every(sound) || !windowed || !(traces.length || kept)) return null;
    return {
      traces: traces.map((t) => ({
        kind: t.kind, expr: t.expr ?? '', exprY: t.exprY ?? '', exprZ: t.exprZ ?? '', label: t.label ?? '',
        enabled: t.enabled !== false, ...(/^#[0-9a-f]{6}$/i.test(t.color) && { color: t.color }),
      })),
      view: Object.fromEntries(PLOT_WINDOW.map((k) => [k, view[k]])),
      ...(kept && { table: kept }),
    };
  } catch { return null; }
}

export function exportToFile(stack, filename = `hp50-${fileStamp()}.json`) {
  return downloadFile(JSON.stringify(snapshot(stack), null, 2), filename, 'application/json');
}

export function downloadFile(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.onload  = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

export async function importFromFile(file, stack) {
  rehydrate(JSON.parse(await readFileText(file)), stack);
}

function fileStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
       + `-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function safeFileName(name) {
  return String(name).replace(/[^A-Za-z0-9_+\-]/g, '_') || 'var';
}

export const BACKUPS_KEY = 'hp50.backups';
const BACKUP_PORTS = Object.freeze(['0', '1', '2', '3']);

function backupStorage() {
  let storage = null;
  try { storage = globalThis.localStorage; } catch { /* blocked site data */ }
  if (!storage) throw new RPLError('Backup storage unavailable');
  return storage;
}

function readBackups() {
  const raw = backupStorage().getItem(BACKUPS_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

// ARCHIVE run from the command line changes no variable, so an open backup list listens here.
const backupListeners = new Set();

export function subscribeBackups(fn) {
  backupListeners.add(fn);
  return () => backupListeners.delete(fn);
}

function writeBackups(backups) {
  backupStorage().setItem(BACKUPS_KEY, JSON.stringify(backups));
  for (const fn of backupListeners) fn();
}

function backupKey(port, name) {
  if (!BACKUP_PORTS.includes(String(port))) throw new RPLError('Bad argument value');
  if (!name) throw new RPLError('Bad argument value');
  return `${port}:${name}`;
}

/** Newest first: `{ port, name, savedAt, depth }` per backup. */
export function listBackups() {
  return Object.entries(readBackups())
    .map(([key, b]) => {
      const sep = key.indexOf(':');
      return { port: key.slice(0, sep), name: key.slice(sep + 1), savedAt: b.savedAt, depth: b.snap?.stack?.length ?? 0 };
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

// localStorage holds about five million characters; what the backups and the session leave of that is the port's free memory.
const STORAGE_CHARS = 5 * 1024 * 1024;

/** The names backed up in `port`, oldest first, and an estimate of the free memory there. */
export function portContents(port) {
  backupKey(port, '_');
  const names = listBackups().filter((b) => b.port === String(port)).reverse().map((b) => b.name);
  const storage = backupStorage();
  let used = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    used += key.length + (storage.getItem(key)?.length ?? 0);
  }
  return { names, free: Math.max(0, STORAGE_CHARS - used) };
}

/** PINIT's clean-up: backups that can no longer be read are dropped. */
export function pruneBackups() {
  const backups = readBackups();
  const kept = Object.fromEntries(Object.entries(backups).filter(([, b]) => b?.snap?.stack && b?.snap?.home));
  if (Object.keys(kept).length !== Object.keys(backups).length) writeBackups(kept);
}

export function archiveBackup(port, name, stack, savedAt = Date.now()) {
  const backups = readBackups();
  backups[backupKey(port, name)] = { savedAt, snap: snapshot(stack) };
  writeBackups(backups);
}

export function restoreBackup(port, name, stack) {
  const backup = readBackups()[backupKey(port, name)];
  if (!backup) throw new RPLError(`Nonexistent backup :${port}:${name}`);
  rehydrate(backup.snap, stack);
}

/** A backup as a file, which Restore from file reads back as it reads Back up everything's. */
export function exportBackup(port, name) {
  const backup = readBackups()[backupKey(port, name)];
  if (!backup) throw new RPLError(`Nonexistent backup :${port}:${name}`);
  return downloadFile(JSON.stringify(backup.snap, null, 2), `hp50-${port}-${safeFileName(name)}.json`, 'application/json');
}

/** Deletes a backup and returns it, so it can be put back. */
export function deleteBackup(port, name) {
  const backups = readBackups();
  const key = backupKey(port, name);
  if (!(key in backups)) throw new RPLError(`Nonexistent backup :${port}:${name}`);
  const backup = backups[key];
  delete backups[key];
  writeBackups(backups);
  return backup;
}

export function putBackBackup(port, name, backup) {
  const backups = readBackups();
  backups[backupKey(port, name)] = backup;
  writeBackups(backups);
}

// A single exported variable gets its own `kind` so a stray file can never
// be rehydrated as a full state replacement.
export function snapshotVariable(name, value) {
  return {
    version: SCHEMA_VERSION,
    kind:    'variable',
    name:    String(name),
    value:   encode(value),
  };
}

// A Directory value comes back with a null parent; the caller links it in.
export function rehydrateVariable(snap) {
  if (!snap || typeof snap !== 'object') {
    throw new Error('variable: not an object');
  }
  if (snap.version !== SCHEMA_VERSION) {
    throw new Error(`variable: unsupported version ${snap.version}`);
  }
  if (snap.kind !== 'variable') {
    throw new Error(`variable: unsupported kind ${snap.kind}`);
  }
  if (typeof snap.name !== 'string' || snap.name.length === 0) {
    throw new Error('variable: missing name');
  }
  const value = decode(snap.value);
  if (value && value.type === TYPES.DIRECTORY) {
    relinkParents(value, null);
  }
  return { name: snap.name, value };
}

export function exportVariableToFile(name, value, filename = `hp50-var-${safeFileName(name)}-${fileStamp()}.json`) {
  return downloadFile(JSON.stringify(snapshotVariable(name, value), null, 2), filename, 'application/json');
}

/** Download `value` (a Directory exports as `DIR … END`) as `<name>.rpl` in HP text format. */
export function exportHpTextFile(name, value) {
  return downloadFile(formatHpText(value), `${safeFileName(name)}.rpl`, 'text/plain');
}

const TABLE_FORMATS = Object.freeze({
  csv: { delimiter: ',', type: 'text/csv' },
  tsv: { delimiter: '\t', type: 'text/tab-separated-values' },
});
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NOT_A_TABLE = 'only a matrix, vector or list can be saved as a table';

/** Download a matrix, vector or list as `<name>.csv`, `.tsv` or `.xlsx`. */
export function exportTableFile(name, value, format = 'csv') {
  const file = `${safeFileName(name)}.${format}`;
  if (format === 'xlsx') {
    const rows = xlsxRows(value);
    if (!rows) throw new Error(NOT_A_TABLE);
    return downloadFile(buildXlsx(rows, name), file, XLSX_TYPE);
  }
  const { delimiter, type } = TABLE_FORMATS[format];
  const text = formatDelimited(value, delimiter);
  if (text === null) throw new Error(NOT_A_TABLE);
  return downloadFile(text, file, type);
}

const DOWNLOADS = Object.freeze([
  ['json', 'rpl.ai file (.json)'],
  ['rpl', 'HP text (.rpl)'],
  ['csv', 'Spreadsheet (.csv)', true],
  ['tsv', 'Tab-separated (.tsv)', true],
  ['xlsx', 'Excel workbook (.xlsx)', true],
]);

/** The file formats a value can be downloaded in, as [extension, label]; tables add the spreadsheet ones. */
export function downloadFormats(value) {
  return DOWNLOADS.filter(([, , table]) => !table || isTable(value)).map(([format, label]) => [format, label]);
}

/** Download `value` as `<name>.<format>` and return the file name. */
export function downloadValue(name, value, format) {
  if (format === 'json') return exportVariableToFile(name, value);
  if (format === 'rpl') return exportHpTextFile(name, value);
  return exportTableFile(name, value, format);
}

const SHARE_PARAM = 'rpl';
export const SHARE_LINK_MAX = 4000;

/** A link to `page` carrying `source` in its fragment, which never reaches a server; null when too long for a link. */
export function shareLink(source, page) {
  if (source.length > SHARE_LINK_MAX) return null;
  const url = new URL(page);
  url.hash = new URLSearchParams({ [SHARE_PARAM]: source }).toString();
  return url.href;
}

/** The source a shared link carries in `hash`, or null. */
export function sharedSource(hash) {
  const source = new URLSearchParams(String(hash ?? '').replace(/^#/, '')).get(SHARE_PARAM);
  return source && source.length <= SHARE_LINK_MAX ? source : null;
}

/** What another app shared to rpl.ai through the manifest's share_target, from the page's `search`, or null: the value of a shared rpl.ai link, else the text, at any length, as a paste. */
export function sharedText(search) {
  const params = new URLSearchParams(String(search ?? ''));
  const [url, text, title] = ['url', 'text', 'title'].map((key) => (params.get(key) ?? '').trim());
  for (const fragment of `${url} ${text}`.match(/#\S+/g) ?? []) {
    const source = sharedSource(fragment);
    if (source !== null) return source;
  }
  return text || title || url || null;
}

// `sales 2025.csv` becomes sales_2025, `2025.csv` D2025, and a file named
// after a command gets a trailing `_`.
export function fileVariableName(filename) {
  const base = filename.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9Α-Ωα-ω_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  const name = /^[A-Za-zΑ-Ωα-ω]/.test(base) ? base : `D${base}`;
  return isStorableHpName(name) ? name : `${name}_`;
}

const headerNote = (header) => (header ? `Skipped the header row (${header.join(', ')}).` : '');

function readTable(text, kind) {
  const { value, header } = importTable(text, kind === 'tsv' || kind === 'txt' ? '\t' : undefined);
  return { value, note: headerNote(header) };
}

async function readWorkbook(file) {
  const { rows, sheet, sheets } = await readXlsx(await file.arrayBuffer(), { maxCells: SHEET_MAX_CELLS });
  const { value, header } = importCells(rows);
  return { value, note: [headerNote(header), sheets > 1 ? `Read the first of ${sheets} sheets, ${sheet}.` : ''].filter(Boolean).join(' ') };
}

/** Read an uploaded or dropped file: a table (.csv, .tsv, .xlsx), an HP text file (.rpl, .txt) or an exported variable (.json). */
export async function readUpload(file) {
  const kind = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
  const name = fileVariableName(file.name);
  if (kind === 'xlsx') return { name, ...(await readWorkbook(file)) };
  const text = await readFileText(file);
  if (kind === 'json') {
    const snap = JSON.parse(text);
    if (snap?.home && snap?.stack) throw new Error('this is a full backup; restore it with Restore from file in the Variables drawer');
    return { ...rehydrateVariable(snap), note: '' };
  }
  if (kind === 'csv' || kind === 'tsv') return { name, ...readTable(text, kind) };
  try {
    return { name, value: parseHpText(text, name), note: '' };
  } catch (e) {
    if (kind === 'txt' && text.includes('\t') && /^Expected one object/.test(e.message)) return { name, ...readTable(text, kind) };
    throw e;
  }
}
