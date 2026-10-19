import { isInteger, isBinaryInteger, isReal, isList, isName, isString, BinaryInteger, Real } from '../types.js';
import { RPLError } from '../stack.js';
import { setWordsize, getWordsize, getWordsizeMask, getBinaryBase, setBinaryBase, setTextbookMode, setDisplay, varStore, varRecall, inScratchState, setLcdLine, clearLcd, freezeLcd, LCD_LINES, testUserFlag } from '../state.js';
import { format, currentDisplay } from '../formatter.js';
import { register } from './registry.js';


let _menuHook = null;
let _beepHook = null;

export function setMenuHook(fn) {
  _menuHook = typeof fn === 'function' ? fn : null;
}

export function setBeepHook(fn) {
  _beepHook = typeof fn === 'function' ? fn : null;
}

// The HP numbers its built-in menus; here only 0, the menu before this one, is taken (null below).
function _menuList(arg) {
  if (isReal(arg) || isInteger(arg)) {
    if (!(isReal(arg) ? arg.value.isZero() : arg.value === 0n)) throw new RPLError('Bad argument value');
    return null;
  }
  const list = isName(arg) ? varRecall(arg.id) : arg;
  if (!isList(list)) throw new RPLError('Bad argument type');
  return list;
}

register('MENU', (s) => {
  const [arg] = s.popN(1);
  const list = _menuList(arg);
  if (list) varStore('CST', arg);
  if (!inScratchState()) _menuHook?.(list, false);
}, { category: 'Display / base', categoryOrder: 24, label: "MENU" });

register('TMENU', (s) => {
  const [arg] = s.popN(1);
  const list = _menuList(arg);
  if (!inScratchState()) _menuHook?.(list, true);
}, { category: 'Display / base', categoryOrder: 25, label: "TMENU" });


// DISP writes an object on line n of the seven-line display over the stack, a string without its quotes, and CLLCD
// blanks it. The text goes when the program ends or pauses, unless FREEZE keeps it until the next key press.
register('DISP', (s) => {
  const [obj, n] = s.popN(2);
  if (!(isReal(n) || isInteger(n))) throw new RPLError('Bad argument type');
  const line = Math.min(LCD_LINES, Math.max(1, Math.trunc(Number(n.value))));
  setLcdLine(line, isString(obj) ? obj.value : format(obj, currentDisplay()));
}, { category: 'Display / base', categoryOrder: 26, label: "DISP" });

register('CLLCD', () => clearLcd(), { category: 'Display / base', categoryOrder: 27, label: "CLLCD" });

register('FREEZE', (s) => {
  const n = s.pop();
  if (!(isReal(n) || isInteger(n))) throw new RPLError('Bad argument type');
  freezeLcd();
}, { category: 'Display / base', categoryOrder: 28, label: "FREEZE" });

// As the HP's: a frequency that doesn't round into 1 to 15000 Hz is skipped, a duration over 1200 s is cut to it,
// and flag -56 (Error Beep off) silences BEEP too.
const BEEP_MAX_HZ = 15000;
const BEEP_MAX_SECONDS = 1200;

register('BEEP', (s) => {
  const [hz, seconds] = s.popN(2);
  if (![hz, seconds].every((v) => isReal(v) || isInteger(v))) throw new RPLError('Bad argument type');
  const freq = Math.round(Number(hz.value));
  const dur = Math.min(BEEP_MAX_SECONDS, Number(seconds.value));
  if (freq < 1 || freq > BEEP_MAX_HZ || !(dur > 0) || testUserFlag(-56) || inScratchState()) return;
  _beepHook?.(freq, dur);
}, { category: 'Display / base', categoryOrder: 29, label: "BEEP" });


register('STWS', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v) || isBinaryInteger(v)) n = Number(v.value);
  else if (isReal(v))                     n = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(n)) throw new RPLError('Bad argument value');
  setWordsize(Math.trunc(n));
}, { category: 'Display / base', categoryOrder: 13, label: "STWS" });


// In the display base, so HEX mode gives #40h rather than #64d.
register('RCWS', (s) => {
  s.push(BinaryInteger(BigInt(getWordsize()), getBinaryBase() || 'h'));
}, { category: 'Display / base', categoryOrder: 14, label: "RCWS" });


register('HEX', () => { setBinaryBase('h'); }, { category: 'Display / base', categoryOrder: 6, label: "HEX" });

register('DEC', () => { setBinaryBase('d'); }, { category: 'Display / base', categoryOrder: 7, label: "DEC" });

register('OCT', () => { setBinaryBase('o'); }, { category: 'Display / base', categoryOrder: 8, label: "OCT" });

register('BIN', () => { setBinaryBase('b'); }, { category: 'Display / base', categoryOrder: 9, label: "BIN" });

// Not an HP50 command: each BinInt goes back to its own base, unpadded.
register('CLB', () => { setBinaryBase(null); }, { category: 'Display / base', categoryOrder: 10, label: "CLB" });


register('TEXTBOOK', () => { setTextbookMode(true); }, { category: 'Display / base', categoryOrder: 0, label: "TEXTBOOK" });

register('FLAT',     () => { setTextbookMode(false); }, { category: 'Display / base', categoryOrder: 1, label: "FLAT" });


register('B→R', (s) => {
  const v = s.pop();
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
  s.push(Real(Number(v.value & getWordsizeMask())));
}, { category: 'Display / base', categoryOrder: 11, label: "B→R" });


// Masking a negative BigInt yields its two's-complement low bits.
register('R→B', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))       n = v.value;
  else if (isReal(v))     n = BigInt(v.value.trunc().toFixed(0));
  else throw new RPLError('Bad argument type');
  s.push(BinaryInteger(n & getWordsizeMask(), getBinaryBase() || 'h'));
}, { category: 'Display / base', categoryOrder: 12, label: "R→B" });


function _requireBinInt(v) {
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
}


function _shiftLeft(v, k) {
  _requireBinInt(v);
  return BinaryInteger((v.value << BigInt(k)) & getWordsizeMask(), v.base);
}


function _shiftRight(v, k) {
  _requireBinInt(v);
  return BinaryInteger((v.value & getWordsizeMask()) >> BigInt(k), v.base);
}


// Arithmetic shift right: the wordsize's top bit is kept.
function _asr1(v) {
  _requireBinInt(v);
  const val = v.value & getWordsizeMask();
  const signBit = 1n << BigInt(getWordsize() - 1);
  return BinaryInteger((val >> 1n) | (val & signBit), v.base);
}


// Rotates left by k bits within the wordsize; a negative k rotates right.
function _rotate(v, k) {
  _requireBinInt(v);
  const m = getWordsizeMask();
  const w = BigInt(getWordsize());
  const shift = ((BigInt(k) % w) + w) % w;
  const val = v.value & m;
  return BinaryInteger(((val << shift) | (val >> (w - shift))) & m, v.base);
}


register('SL',  (s) => { const v = s.pop(); s.push(_shiftLeft(v, 1)); }, { category: 'Display / base', categoryOrder: 16, label: "SL" });

register('SR',  (s) => { const v = s.pop(); s.push(_shiftRight(v, 1)); }, { category: 'Display / base', categoryOrder: 17, label: "SR" });

register('ASR', (s) => { const v = s.pop(); s.push(_asr1(v)); }, { category: 'Display / base', categoryOrder: 15, label: "ASR" });

register('SLB', (s) => { const v = s.pop(); s.push(_shiftLeft(v, 8)); }, { category: 'Display / base', categoryOrder: 20, label: "SLB" });

register('SRB', (s) => { const v = s.pop(); s.push(_shiftRight(v, 8)); }, { category: 'Display / base', categoryOrder: 21, label: "SRB" });

register('RL',  (s) => { const v = s.pop(); s.push(_rotate(v, 1)); }, { category: 'Display / base', categoryOrder: 18, label: "RL" });

register('RR',  (s) => { const v = s.pop(); s.push(_rotate(v, -1)); }, { category: 'Display / base', categoryOrder: 19, label: "RR" });

register('RLB', (s) => { const v = s.pop(); s.push(_rotate(v, 8)); }, { category: 'Display / base', categoryOrder: 22, label: "RLB" });

register('RRB', (s) => { const v = s.pop(); s.push(_rotate(v, -8)); }, { category: 'Display / base', categoryOrder: 23, label: "RRB" });


// Digits are capped at 11, as on the HP50.
export function displayDigitsArg(n) {
  let d;
  if (isInteger(n)) d = Number(n.value);
  else if (isReal(n)) {
    if (!n.value.isInteger()) throw new RPLError('Bad argument value');
    d = n.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (d < 0) throw new RPLError('Bad argument value');
  if (d > 11) d = 11;
  return d;
}

function _popNumDigits(s) {
  const [n] = s.popN(1);
  return displayDigitsArg(n);
}


register('STD', () => { setDisplay('STD'); }, { category: 'Display / base', categoryOrder: 2, label: "STD" });

register('FIX', (s) => { const d = _popNumDigits(s); setDisplay('FIX', d); }, { category: 'Display / base', categoryOrder: 3, label: "FIX" });

register('SCI', (s) => { const d = _popNumDigits(s); setDisplay('SCI', d); }, { category: 'Display / base', categoryOrder: 4, label: "SCI" });

register('ENG', (s) => { const d = _popNumDigits(s); setDisplay('ENG', d); }, { category: 'Display / base', categoryOrder: 5, label: "ENG" });
