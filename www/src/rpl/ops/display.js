import { isInteger, isBinaryInteger, isReal, BinaryInteger, Real } from '../types.js';
import { RPLError } from '../stack.js';
import { setWordsize, getWordsize, getBinaryBase, setBinaryBase, setTextbookMode, setDisplay } from '../state.js';
import { register } from './registry.js';
import { _mask } from './internal.js';



/* ------------------------------------------------------------------
   STWS / RCWS — Binary integer wordsize control.

     STWS  ( n -- )       set wordsize to n bits (1..64, clamped).  HP50
                          accepts a Real, Integer, or BinaryInteger here;
                          we convert via the usual numeric coercion.
     RCWS  ( -- bin )     recall wordsize as a BinaryInteger in the
                          current display base (or hex when the display
                          override is null).  HP50 behavior matches.

   HEX / DEC / OCT / BIN — display-base modes.  Each sets the global
   `state.binaryBase` override so every BinInt renders in that base AND
   pads to the current wordsize.  There's no "un-set" op today — the
   user issues a different base or keeps the current one.
   ------------------------------------------------------------------ */

register('STWS', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))           n = Number(v.value);
  else if (isBinaryInteger(v)) n = Number(v.value);
  else if (isReal(v))         n = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(n)) throw new RPLError('Bad argument value');
  setWordsize(Math.trunc(n));
}, { category: 'Display / base', categoryOrder: 13, label: "STWS" });


register('RCWS', (s) => {
  // HP50 returns the wordsize as a Binary Integer; base follows the
  // display override when set, else hex.  (A user in HEX mode wants
  // `#40h` back from RCWS, not `#64d`.)
  s.push(BinaryInteger(BigInt(getWordsize()), getBinaryBase() || 'h'));
}, { category: 'Display / base', categoryOrder: 14, label: "RCWS" });


register('HEX', () => { setBinaryBase('h'); }, { category: 'Display / base', categoryOrder: 6, label: "HEX" });

register('DEC', () => { setBinaryBase('d'); }, { category: 'Display / base', categoryOrder: 7, label: "DEC" });

register('OCT', () => { setBinaryBase('o'); }, { category: 'Display / base', categoryOrder: 8, label: "OCT" });

register('BIN', () => { setBinaryBase('b'); }, { category: 'Display / base', categoryOrder: 9, label: "BIN" });

/** CLB — clear display-base override.  After CLB, each BinInt
 *  renders in its stored base (HP50 default behavior before any
 *  HEX/DEC/OCT/BIN has been issued).  Padding to STWS is also
 *  dropped — the address hasn't been mode-locked, so minimum-
 *  width rendering is used.  (HP50 firmware doesn't ship this
 *  exact name; the closest built-in is clearing flag -67.  We use
 *  CLB for brevity — `CLear Binary mode`.) */
register('CLB', () => { setBinaryBase(null); }, { category: 'Display / base', categoryOrder: 10, label: "CLB" });


/* ------------------------------------------------------------------
   TEXTBOOK / FLAT — toggle 2D pretty-print of Symbolic stack rows.

   TEXTBOOK  ( --- )   Enable pretty-print for Symbolic values.  After
                       TEXTBOOK, each stack row holding a Symbolic
                       renders via src/rpl/pretty.js's astToSvg (SVG)
                       instead of the flat-text formatter.  Other
                       value types are unaffected.
   FLAT      ( --- )   Return to flat-text rendering for everything.

   HP50 expresses the same thing via system flag -80 — we provide
   named ops for discoverability / keypad-reachability without taking
   a position on flag numbers yet.  The flag-bit wiring can land
   alongside once flags land as a feature. */
register('TEXTBOOK', () => { setTextbookMode(true); }, { category: 'Display / base', categoryOrder: 0, label: "TEXTBOOK" });

register('FLAT',     () => { setTextbookMode(false); }, { category: 'Display / base', categoryOrder: 1, label: "FLAT" });


/* ------------------------------------------------------------------
   B→R and R→B — BinaryInteger ↔ Real conversion.

     B→R  ( bin -- real )   push the BinInt's value as a Real.  For
                            wide BinInts the Number coercion loses
                            precision above 2^53, matching the HP50's
                            12-digit decimal limit behavior.
     R→B  ( x   -- bin )    push x as a BinInt at the current wordsize.
                            x may be Real or Integer.  The low ws bits
                            become the payload; negatives wrap (two's-
                            complement style) which matches HP50's
                            truncation behavior.  Base follows the
                            display override (or 'h' if none).
   ------------------------------------------------------------------ */

register('B→R', (s) => {
  const v = s.pop();
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
  s.push(Real(Number(v.value & _mask())));
}, { category: 'Display / base', categoryOrder: 11, label: "B→R" });


register('R→B', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))       n = v.value;
  else if (isReal(v))     n = BigInt(v.value.trunc().toFixed(0));
  else throw new RPLError('Bad argument type');
  const m = _mask();
  // Mask: for negatives, JS BigInt AND with a positive mask gives the
  // two's-complement low bits already (because BigInt is arbitrary-
  // precision signed), so `n & m` is what we want.
  const payload = n & m;
  const base = getBinaryBase() || 'h';
  s.push(BinaryInteger(payload, base));
}, { category: 'Display / base', categoryOrder: 12, label: "R→B" });


/* --------------- BinaryInteger shift / rotate ---------------
   HP50 AUR §10.1.  All 9 ops take a BinInt and return a BinInt; the
   display base is inherited from the input, and the value is masked
   to the current wordsize (STWS, default 64).  Mixed operands /
   wrong type throws 'Bad argument type'.

     SL   ( bin → bin' )   shift left by 1 bit (bit lost off top)
     SR   ( bin → bin' )   shift right by 1 bit (zero fill at top)
     ASR  ( bin → bin' )   shift right preserving sign-bit (top bit)
     RL   ( bin → bin' )   rotate left by 1 bit
     RR   ( bin → bin' )   rotate right by 1 bit
     SLB  ( bin → bin' )   shift left by 8 bits (1 byte)
     SRB  ( bin → bin' )   shift right by 8 bits (1 byte)
     RLB  ( bin → bin' )   rotate left by 8 bits
     RRB  ( bin → bin' )   rotate right by 8 bits

   Sign-bit handling in ASR: if the MSB of the wordsize is set, the
   right-shifted result keeps that bit set (i.e. arithmetic shift of a
   two's-complement value).  Wordsize 1 is a degenerate case — ASR is
   effectively a no-op there; we treat it that way.
   ---------------------------------------------------------------- */

function _requireBinInt(v) {
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
}


// Shift left by `k` bits.  Bits shifted off the high end are discarded
// via the wordsize mask.
function _shiftLeft(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const out = (v.value << BigInt(k)) & m;
  return BinaryInteger(out, v.base);
}


// Logical shift right by `k` bits.  High bits become 0.
function _shiftRight(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const out = (v.value & m) >> BigInt(k);
  return BinaryInteger(out, v.base);
}


// Arithmetic shift right by 1 bit — preserves the sign bit (MSB).
function _asr1(v) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  if (w <= 1n) return BinaryInteger(v.value & m, v.base);
  const msb = (v.value & m) >> (w - 1n);                // 0n or 1n
  let out = (v.value & m) >> 1n;
  if (msb === 1n) out |= (1n << (w - 1n));
  return BinaryInteger(out & m, v.base);
}


// Rotate left by `k` bits.
function _rotateLeft(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  const shift = BigInt(k) % w;
  if (shift === 0n) return BinaryInteger(v.value & m, v.base);
  const val = v.value & m;
  const left = (val << shift) & m;
  const right = val >> (w - shift);
  return BinaryInteger((left | right) & m, v.base);
}


// Rotate right by `k` bits.
function _rotateRight(v, k) {
  _requireBinInt(v);
  const m = _mask();
  const w = BigInt(getWordsize());
  const shift = BigInt(k) % w;
  if (shift === 0n) return BinaryInteger(v.value & m, v.base);
  const val = v.value & m;
  const right = val >> shift;
  const left = (val << (w - shift)) & m;
  return BinaryInteger((right | left) & m, v.base);
}


register('SL',  (s) => { const v = s.pop(); s.push(_shiftLeft(v, 1)); }, { category: 'Display / base', categoryOrder: 16, label: "SL" });

register('SR',  (s) => { const v = s.pop(); s.push(_shiftRight(v, 1)); }, { category: 'Display / base', categoryOrder: 17, label: "SR" });

register('ASR', (s) => { const v = s.pop(); s.push(_asr1(v)); }, { category: 'Display / base', categoryOrder: 15, label: "ASR" });

register('SLB', (s) => { const v = s.pop(); s.push(_shiftLeft(v, 8)); }, { category: 'Display / base', categoryOrder: 20, label: "SLB" });

register('SRB', (s) => { const v = s.pop(); s.push(_shiftRight(v, 8)); }, { category: 'Display / base', categoryOrder: 21, label: "SRB" });

register('RL',  (s) => { const v = s.pop(); s.push(_rotateLeft(v, 1)); }, { category: 'Display / base', categoryOrder: 18, label: "RL" });

register('RR',  (s) => { const v = s.pop(); s.push(_rotateRight(v, 1)); }, { category: 'Display / base', categoryOrder: 19, label: "RR" });

register('RLB', (s) => { const v = s.pop(); s.push(_rotateLeft(v, 8)); }, { category: 'Display / base', categoryOrder: 22, label: "RLB" });

register('RRB', (s) => { const v = s.pop(); s.push(_rotateRight(v, 8)); }, { category: 'Display / base', categoryOrder: 23, label: "RRB" });


/* --------------- STD / FIX / SCI / ENG — number-format modes ---------
   HP50 AUR §3.2.  Each op routes through `setDisplay()` so the state
   emitter fires — the LCD renderer reads `state.displayMode` /
   `state.displayDigits` before each stack repaint, and the status-line
   annunciator updates via the same subscribe path.  `→STR` and any
   other op that passes the state's display mode to `format()` sees
   the same update.

     STD                     ( — )       set mode = STD, digits ignored
     FIX    ( n → )                      set mode = FIX, digits = clamp(n, 0, 11)
     SCI    ( n → )                      set mode = SCI, digits = clamp(n, 0, 11)
     ENG    ( n → )                      set mode = ENG, digits = clamp(n, 0, 11)

   Non-integer Real and negative digits throw Bad argument value.
   ----------------------------------------------------------------- */

function _popNumDigits(s) {
  const [n] = s.popN(1);
  let d;
  if (isInteger(n)) d = Number(n.value);
  else if (isReal(n)) {
    if (!n.value.isInteger()) throw new RPLError('Bad argument value');
    d = n.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (d < 0) throw new RPLError('Bad argument value');
  if (d > 11) d = 11;                               // HP50 cap
  return d;
}


register('STD', () => { setDisplay('STD'); }, { category: 'Display / base', categoryOrder: 2, label: "STD" });

register('FIX', (s) => { const d = _popNumDigits(s); setDisplay('FIX', d); }, { category: 'Display / base', categoryOrder: 3, label: "FIX" });

register('SCI', (s) => { const d = _popNumDigits(s); setDisplay('SCI', d); }, { category: 'Display / base', categoryOrder: 4, label: "SCI" });

register('ENG', (s) => { const d = _popNumDigits(s); setDisplay('ENG', d); }, { category: 'Display / base', categoryOrder: 5, label: "ENG" });
