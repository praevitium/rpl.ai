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
  state, currentPath, goHome, goInto, notify, seedPrng, setCasVx, setCasModulo,
  ANGLE_MODES, COORD_MODES, DISPLAY_MODES, WORDSIZE_MIN, WORDSIZE_MAX, isModeFlag,
} from './state.js';
import { TYPES, Decimal, BIN_BASES, isStorableHpName } from './types.js';
import { RPLError } from './stack.js';
import { formatHpText, parseHpText } from './hp-text.js';
import { formatDelimited, importTable, importCells, isTable, xlsxRows, SHEET_MAX_CELLS } from './sheet.js';
import { buildXlsx, readXlsx } from './xlsx.js';
import SEED_STATE from '../../hp50-all.json' with { type: 'json' };

export const STORAGE_KEY = 'hp50.state';
export const SCHEMA_VERSION = 1;

function encode(v, seen) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (v instanceof Decimal) return { __t: 'decimal', v: v.toString() };
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
    if (v.__t === 'decimal') return new Decimal(v.v);
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
  };
}

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

  restoreModes(snap.modes);

  stack.restore(items);
  notify();
}

// What this window last wrote to the store or read from it.
let _storedJson = null;

// Never throws. true when stored, 'trimmed' when backups were dropped, false otherwise.
export function saveToLocalStorage(stack) {
  let json;
  try {
    json = JSON.stringify(snapshot(stack));
  } catch (e) {
    console.warn('hp50 autosave failed:', e);
    return false;
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

function writeBackups(backups) {
  backupStorage().setItem(BACKUPS_KEY, JSON.stringify(backups));
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

export function deleteBackup(port, name) {
  const backups = readBackups();
  const key = backupKey(port, name);
  if (!(key in backups)) throw new RPLError(`Nonexistent backup :${port}:${name}`);
  delete backups[key];
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
