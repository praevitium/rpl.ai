import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* BinaryInteger type, STWS wordsize, HEX/DEC/OCT/BIN display, bitwise ops,
   B→R / R→B converters, parse-time literal truncation. */

// These tests exercise the formatter in "per-value stored base" mode —
// a BinInt entered as `#FFh` should render back as `#FFh`.  The live
// app boots with binaryBase='d' (so the status-line HEX/DEC/OCT/BIN
// annunciator always carries a label) which would force every BinInt
// through decimal here; clear the override up front so the tests
// observe per-value base.
setBinaryBase(null);


{
  const a = BinaryInteger(255, 'h');
  assert(a.type === 'binaryInteger' && a.value === 255n && a.base === 'h',
         'BinaryInteger(255,h) has type/value/base set');
  const b = BinaryInteger(-3, 'h');
  assert(b.value === 0n, 'BinaryInteger clamps negative to 0');
  assertThrows(() => BinaryInteger(1, 'z'), null,
               'BinaryInteger rejects invalid base letter');
  const c = BinaryInteger(10n, 'D');  // uppercase input, lowercased
  assert(c.base === 'd', 'BinaryInteger lowercases the base letter');
}

{
  assert(format(BinaryInteger(255, 'h')) === '#FFh', 'format #FFh (hex uppercase)');
  assert(format(BinaryInteger(255, 'd')) === '#255d', 'format #255d');
  assert(format(BinaryInteger(255, 'o')) === '#377o', 'format #377o');
  assert(format(BinaryInteger(255, 'b')) === '#11111111b', 'format #11111111b');
  assert(format(BinaryInteger(0, 'h')) === '#0h', 'format zero as #0h');
  assert(format(BinaryInteger(0x502, 'h')) === '#502h',
         'format Directory-not-allowed code → #502h');
}

{
  const hex = parseEntry('#FFh');
  assert(hex.length === 1 && hex[0].type === 'binaryInteger' &&
         hex[0].value === 255n && hex[0].base === 'h',
         'parseEntry("#FFh") → BinaryInteger(255,h)');
  const dec = parseEntry('#255d');
  assert(dec[0].value === 255n && dec[0].base === 'd',
         'parseEntry("#255d") → BinaryInteger(255,d)');
  const oct = parseEntry('#377o');
  assert(oct[0].value === 255n && oct[0].base === 'o',
         'parseEntry("#377o") → BinaryInteger(255,o)');
  const bin = parseEntry('#11111111b');
  assert(bin[0].value === 255n && bin[0].base === 'b',
         'parseEntry("#11111111b") → BinaryInteger(255,b)');
  // Lowercase hex digits also accepted, formatter normalizes to uppercase
  const lc = parseEntry('#abch');
  assert(lc[0].value === 0xabcn && format(lc[0]) === '#ABCh',
         'parseEntry("#abch") normalizes to #ABCh on display');
  // Big value that would overflow a regular JS number — BigInt payload
  // keeps full precision.
  const big = parseEntry('#FFFFFFFFFFFFFFFFh');
  assert(big[0].value === 0xFFFFFFFFFFFFFFFFn,
         'parseEntry("#FFFFFFFFFFFFFFFFh") preserves 64-bit value');
}

{
  assertThrows(() => parseEntry('#'), null,
               'parseEntry("#") throws (no digits, no base)');
  // parseEntry('#123') accepts a missing base letter — it falls back to
  // the currently-selected display base (state.binaryBase, default 'h').
  // Explicit-suffix literals still drive the base.  See parser.js around
  // the '#' tokenizer case.
  const noSuffix = parseEntry('#123');
  assert(noSuffix.length === 1 && noSuffix[0].type === 'binaryInteger' &&
         noSuffix[0].value === 0x123n && noSuffix[0].base === 'h',
         'parseEntry("#123") defaults to active base (hex)');
  assertThrows(() => parseEntry('#8o'), null,
               'parseEntry("#8o") throws (8 not a valid octal digit)');
  assertThrows(() => parseEntry('#2b'), null,
               'parseEntry("#2b") throws (2 not a valid binary digit)');
  assertThrows(() => parseEntry('#Gh'), null,
               'parseEntry("#Gh") throws (G not a valid hex digit)');
}

{
  const parsed = parseEntry('{ #FFh #10d }');
  assert(parsed.length === 1 && parsed[0].type === 'list' &&
         parsed[0].items.length === 2 &&
         parsed[0].items[0].base === 'h' && parsed[0].items[0].value === 255n &&
         parsed[0].items[1].base === 'd' && parsed[0].items[1].value === 10n,
         'list of BinInts parses correctly (#FFh=255, #10d=10)');
  assert(format(parsed[0]) === '{ #FFh #10d }',
         'list of BinInts formats as "{ #FFh #10d }"');
}

{
  const s = new Stack();
  s.push(BinaryInteger(0x502n, 'h'));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'binaryInteger' &&
         s.peek().value === 0x502n,
         'EVAL(#502h) pushes it back unchanged');
}



{
  resetBinaryState();
  assert(getWordsize() === 64, 'default wordsize = 64');
  assert(getBinaryBase() === null, 'default binary display base = null (no override)');
  assert(getWordsizeMask() === (1n << 64n) - 1n, 'default mask = 2^64 - 1');
}

{
  resetBinaryState();
  const s = new Stack();
  s.push(Real(16));
  lookup('STWS').fn(s);
  assert(getWordsize() === 16, 'STWS 16 sets wordsize to 16');
  assert(getWordsizeMask() === 0xFFFFn, 'mask at ws=16 is 0xFFFF');
  lookup('RCWS').fn(s);
  const top = s.peek();
  assert(isBinaryInteger(top) && top.value === 16n && top.base === 'h',
         'RCWS returns BinaryInteger(16, h) at ws=16');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.push(Real(100));    // above max
  lookup('STWS').fn(s);
  assert(getWordsize() === 64, 'STWS 100 clamps to 64 (max)');
  s.push(Real(0));      // below min
  lookup('STWS').fn(s);
  assert(getWordsize() === 1, 'STWS 0 clamps to 1 (min)');
  s.push(Real(8.9));    // truncate
  lookup('STWS').fn(s);
  assert(getWordsize() === 8, 'STWS 8.9 truncates to 8');
  resetBinaryState();
}

{
  resetBinaryState();
  lookup('HEX').fn(new Stack());
  assert(getBinaryBase() === 'h', 'HEX sets display base to h');
  lookup('DEC').fn(new Stack());
  assert(getBinaryBase() === 'd', 'DEC sets display base to d');
  lookup('OCT').fn(new Stack());
  assert(getBinaryBase() === 'o', 'OCT sets display base to o');
  lookup('BIN').fn(new Stack());
  assert(getBinaryBase() === 'b', 'BIN sets display base to b');
  resetBinaryState();
}

{
  resetBinaryState();
  assert(format(BinaryInteger(0xFF, 'h')) === '#FFh',
         'default: no override, minimum-width render');
  setBinaryBase('h');
  assert(format(BinaryInteger(0xFF, 'd')) === '#FFh',
         'HEX override: #FFh (no leading-zero padding to wordsize)');
  setWordsize(16);
  assert(format(BinaryInteger(0xFF, 'd')) === '#FFh',
         'HEX override + ws=16: still #FFh (no padding)');
  setBinaryBase('b');
  assert(format(BinaryInteger(5, 'h')) === '#101b',
         'BIN override: #101b (no padding)');
  setBinaryBase('d');
  assert(format(BinaryInteger(5, 'h')) === '#5d',
         'DEC override: #5d');
  setBinaryBase('o');
  setWordsize(9);
  assert(format(BinaryInteger(7, 'h')) === '#7o',
         'OCT override: #7o (no padding)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  // #FFFFh + #1h wraps at ws=16 to #0h
  s.push(BinaryInteger(0xFFFFn, 'h'));
  s.push(BinaryInteger(1n, 'h'));
  lookup('+').fn(s);
  const sum = s.peek();
  assert(isBinaryInteger(sum) && sum.value === 0n && sum.base === 'h',
         '#FFFFh + #1h (ws=16) wraps to #0h');
  resetBinaryState();
}


{
  resetBinaryState();
  const s = new Stack();
  // #FFh + #1h = #100h at ws=64 (no wrap)
  s.pushMany([BinaryInteger(0xFFn, 'h'), BinaryInteger(1n, 'h')]);
  lookup('+').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 0x100n && s.peek().base === 'h',
         '#FFh + #1h = #100h');
  s.clear();

  // #FFh #FFh * = #FE01h at ws=64
  s.pushMany([BinaryInteger(0xFFn, 'h'), BinaryInteger(0xFFn, 'h')]);
  lookup('*').fn(s);
  assert(s.peek().value === 0xFE01n, '#FFh * #FFh = #FE01h');
  s.clear();

  // #7h #2h / = #3h (truncated)
  s.pushMany([BinaryInteger(7n, 'h'), BinaryInteger(2n, 'h')]);
  lookup('/').fn(s);
  assert(s.peek().value === 3n, '#7h / #2h = #3h (truncated)');
  s.clear();

  // Left-operand base wins: #FFh + #1d → base 'h'
  s.pushMany([BinaryInteger(0xFFn, 'h'), BinaryInteger(1n, 'd')]);
  lookup('+').fn(s);
  assert(s.peek().value === 0x100n && s.peek().base === 'h',
         'left-operand base wins: #FFh + #1d → result base h');
  s.clear();

  // And the other way: #1d + #FFh → base 'd'
  s.pushMany([BinaryInteger(1n, 'd'), BinaryInteger(0xFFn, 'h')]);
  lookup('+').fn(s);
  assert(s.peek().value === 0x100n && s.peek().base === 'd',
         'left-operand base wins: #1d + #FFh → result base d');
  s.clear();

  // Division by zero throws 'Division by zero' (0x303), NOT the
  // 'Infinite result' (0x305) that fires for Real /0 — the split
  // along the integer/float family line matches HP50.
  s.pushMany([BinaryInteger(1n, 'h'), BinaryInteger(0n, 'h')]);
  let msg = null;
  try { lookup('/').fn(s); } catch (e) { msg = e.message; }
  assert(msg === 'Division by zero',
         `BinInt / #0h error message: '${msg}' (want 'Division by zero')`);
  resetBinaryState();
}
// ERRN after BinInt / 0 returns 0x303 (not 0x305).
{
  resetBinaryState();
  resetHome();
  clearLastError();
  const s = new Stack();
  s.push(Program([
    Name('IFERR'), BinaryInteger(1n, 'h'), BinaryInteger(0n, 'h'), Name('/'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) &&
         s.peek().value === 0x303n && s.peek().base === 'h',
         `BinInt / 0 → ERRN = #303h (got ${s.peek().value.toString(16)}h)`);
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.pushMany([BinaryInteger(0n, 'h'), BinaryInteger(1n, 'h')]);
  lookup('-').fn(s);
  assert(s.peek().value === 0xFFn,
         '#0h - #1h at ws=8 wraps to #FFh (low 8 bits of -1)');
  resetBinaryState();
}

// Mixed BinInt + Real/Integer coerces (HP50 AUR §10.1): the Real
// is truncated toward zero, masked to STWS, and promoted to
// BinaryInteger with the BinInt's base.
{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(1n, 'h'), Real(1)]);
  lookup('+').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 2n && s.peek().base === 'h',
         'session045: #1h 1 + → #2h (Real coerced, base preserved)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(0xF0n, 'h'), BinaryInteger(0x0Fn, 'h')]);
  lookup('AND').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 0n,
         '#F0h AND #0Fh = #0h (bitwise)');
  s.clear();

  s.pushMany([BinaryInteger(0xF0n, 'h'), BinaryInteger(0x0Fn, 'h')]);
  lookup('OR').fn(s);
  assert(s.peek().value === 0xFFn, '#F0h OR #0Fh = #FFh');
  s.clear();

  s.pushMany([BinaryInteger(0xFFn, 'h'), BinaryInteger(0x0Fn, 'h')]);
  lookup('XOR').fn(s);
  assert(s.peek().value === 0xF0n, '#FFh XOR #0Fh = #F0h');
  s.clear();

  // NOT on BinInt at ws=8 complements within low 8 bits.
  setWordsize(8);
  s.push(BinaryInteger(0x0Fn, 'h'));
  lookup('NOT').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 0xF0n,
         '#0Fh NOT at ws=8 = #F0h (bitwise complement within wordsize)');
  resetBinaryState();

  // Real boolean logic still works.
  s.clear();
  s.pushMany([Real(1), Real(0)]);
  lookup('AND').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
         'Real 1 AND Real 0 still boolean = 0');
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(1n, 'h'), Real(0)]);
  assertThrows(() => lookup('AND').fn(s), null,
               'BinInt AND Real errors "Bad argument type"');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();

  // B→R: BinInt → Real.
  s.push(BinaryInteger(0xFFn, 'h'));
  lookup('B→R').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(255),
         '#FFh B→R = 255.');

  // R→B: Real → BinInt at current wordsize; base from display override.
  s.clear();
  s.push(Real(256));
  lookup('R→B').fn(s);
  const r = s.peek();
  assert(isBinaryInteger(r) && r.value === 256n && r.base === 'h',
         '256 R→B = #100h (default base h, ws=64)');

  // R→B respects wordsize truncation.
  s.clear();
  setWordsize(8);
  s.push(Real(256));
  lookup('R→B').fn(s);
  assert(s.peek().value === 0n && s.peek().base === 'h',
         '256 R→B at ws=8 = #0h (256 mod 256)');

  // R→B on negative Real wraps two's-complement style.
  s.clear();
  s.push(Real(-1));
  lookup('R→B').fn(s);
  assert(s.peek().value === 0xFFn,
         '-1 R→B at ws=8 = #FFh (low 8 bits of -1)');

  // R→B picks up the current display base override.
  setBinaryBase('b');
  s.clear();
  s.push(Real(5));
  lookup('R→B').fn(s);
  assert(s.peek().base === 'b',
         'R→B with BIN display override yields base b');

  // ASCII aliases work the same.
  s.clear();
  s.push(BinaryInteger(0xAn, 'h'));
  lookup('B->R').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10), 'B->R ASCII alias = B→R');

  s.clear();
  s.push(Real(42));
  lookup('R->B').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 42n,
         'R->B ASCII alias = R→B');

  // Wrong-type inputs rejected.
  s.clear();
  s.push(Real(1));
  assertThrows(() => lookup('B→R').fn(s), null,
               'B→R on Real errors "Bad argument type"');

  s.clear();
  s.push(BinaryInteger(1n, 'h'));
  assertThrows(() => lookup('R→B').fn(s), null,
               'R→B on BinInt errors "Bad argument type"');

  resetBinaryState();
}

{
  resetBinaryState();
  // No override — the ERRN BinInt (base h) renders minimum-width.
  assert(format(BinaryInteger(0x502n, 'h')) === '#502h',
         'ERRN #502h default render');
  setBinaryBase('b');
  // With BIN override, same value renders in binary (no leading zeros).
  const expected = '#' + (0x502n).toString(2) + 'b';
  assert(format(BinaryInteger(0x502n, 'h')) === expected,
         'ERRN #502h under BIN mode renders as minimum-width binary');
  resetBinaryState();
}


{
  resetBinaryState();
  setWordsize(8);
  const [v] = parseEntry('#FFFFh');
  assert(isBinaryInteger(v) && v.value === 0xFFn,
         '#FFFFh at ws=8 parses as #FFh (low 8 bits)');
  assert(v.base === 'h', 'parse-time truncation preserves the literal base');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(4);
  const [v] = parseEntry('#11110000b');
  assert(isBinaryInteger(v) && v.value === 0x0n,
         '#11110000b at ws=4 parses as #0b (low 4 bits, low nibble is 0000)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const [v] = parseEntry('#300d');
  // 300 = 0x12C → low 8 bits = 0x2C = 44
  assert(isBinaryInteger(v) && v.value === 44n,
         '#300d at ws=8 parses as 44 (300 mod 256)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const [v] = parseEntry('#FFFFh');
  assert(isBinaryInteger(v) && v.value === 0xFFFFn,
         '#FFFFh at ws=16 preserves the full value');
  resetBinaryState();
}

{
  resetBinaryState();
  const [v] = parseEntry('#FFFFFFFFFFFFFFFFh');
  assert(isBinaryInteger(v) && v.value === 0xFFFFFFFFFFFFFFFFn,
         '#FFFFFFFFFFFFFFFFh at default ws=64 preserves full 64-bit');
  resetBinaryState();
}


{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x55n, 'h'));   // 0101 0101
  lookup('SL').fn(s);
  const r = s.peek();
  assert(isBinaryInteger(r) && r.value === 0xAAn && r.base === 'h',
         'session044: SL #55h (ws=8) → #AAh');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x80n, 'h'));
  lookup('SL').fn(s);
  assert(s.peek().value === 0n, 'session044: SL #80h (ws=8) → #0h (bit lost)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x80n, 'h'));
  lookup('SR').fn(s);
  assert(s.peek().value === 0x40n, 'session044: SR #80h (ws=8) → #40h');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x80n, 'h'));
  lookup('ASR').fn(s);
  // 1000 0000 → 1100 0000  (sign bit preserved and shifted in)
  assert(s.peek().value === 0xC0n,
         'session044: ASR #80h (ws=8) → #C0h (sign bit replicated)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x40n, 'h'));
  lookup('ASR').fn(s);
  assert(s.peek().value === 0x20n,
         'session044: ASR #40h (ws=8) → #20h (sign bit 0, zero fill)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  s.push(BinaryInteger(0x00FFn, 'h'));
  lookup('SLB').fn(s);
  assert(s.peek().value === 0xFF00n,
         'session044: SLB #00FFh (ws=16) → #FF00h');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  s.push(BinaryInteger(0xFF00n, 'h'));
  lookup('SRB').fn(s);
  assert(s.peek().value === 0x00FFn,
         'session044: SRB #FF00h (ws=16) → #00FFh');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x80n, 'h'));   // top bit set
  lookup('RL').fn(s);
  assert(s.peek().value === 0x01n,
         'session044: RL #80h (ws=8) → #1h (top bit rotates to bottom)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x01n, 'h'));
  lookup('RR').fn(s);
  assert(s.peek().value === 0x80n,
         'session044: RR #1h (ws=8) → #80h (bottom bit rotates to top)');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  s.push(BinaryInteger(0x00FFn, 'h'));
  lookup('RLB').fn(s);
  assert(s.peek().value === 0xFF00n,
         'session044: RLB #00FFh (ws=16) → #FF00h');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  s.push(BinaryInteger(0xFF00n, 'h'));
  lookup('RRB').fn(s);
  assert(s.peek().value === 0x00FFn,
         'session044: RRB #FF00h (ws=16) → #00FFh');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(16);
  const s = new Stack();
  s.push(BinaryInteger(0xDEADn, 'h'));
  lookup('RL').fn(s);
  lookup('RR').fn(s);
  assert(s.peek().value === 0xDEADn,
         'session044: RL RR round-trips at ws=16');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x01n, 'b'));
  lookup('SL').fn(s);
  assert(s.peek().base === 'b',
         'session044: SL inherits input display base');
  resetBinaryState();
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('SL').fn(s), /Bad argument type/,
               'session044: SL on Real throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('RR').fn(s), /Bad argument type/,
               'session044: RR on Real throws Bad argument type');
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.push(BinaryInteger(0x53n, 'h'));
  for (let i = 0; i < 8; i++) lookup('RL').fn(s);
  assert(s.peek().value === 0x53n,
         'session044: RL 8 times (ws=8) returns to original');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(1);
  const s = new Stack();
  s.push(BinaryInteger(1n, 'h'));
  lookup('ASR').fn(s);
  assert(s.peek().value === 1n,
         'session044: ASR at ws=1 preserves the only bit');
  resetBinaryState();
}

// ------------------------------------------------------------------
// Mixed BinInt ↔ Real/Integer arithmetic (HP50 AUR §10.1)
// ------------------------------------------------------------------
//
// When +, -, *, /, ^ receives a BinaryInteger on one side and a
// Real/Integer on the other, the Real/Integer is coerced to a BinInt
// (truncate toward zero, mask to STWS) and the op runs as a BinInt
// op.  The BinInt operand's base is preserved in the result.
//
// AND / OR / XOR are NOT modified — they treat mixed input as
// 'Bad argument type' (the boolean vs. bitwise distinction lives on
// a per-op basis).

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(0xFFn, 'h'), Real(3)]);
  lookup('+').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 0x102n && s.peek().base === 'h',
         'session045: #FFh 3 + → #102h');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([Real(3), BinaryInteger(0xFFn, 'h')]);
  lookup('+').fn(s);
  assert(isBinaryInteger(s.peek()) && s.peek().value === 0x102n && s.peek().base === 'h',
         'session045: 3 #FFh + → #102h (base from BinInt)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(0x10n, 'h'), Real(2.7)]);
  lookup('*').fn(s);
  // 2.7 → 2; #10h * #2h = #20h
  assert(s.peek().value === 0x20n && s.peek().base === 'h',
         'session045: #10h 2.7 * → #20h (Real truncates)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(10n, 'd'), Integer(5n)]);
  lookup('*').fn(s);
  assert(s.peek().value === 50n && s.peek().base === 'd',
         'session045: #10d 5 * → #50d (decimal base preserved)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(0x10n, 'h'), Real(1)]);
  lookup('-').fn(s);
  assert(s.peek().value === 0xFn && s.peek().base === 'h',
         'session045: #10h 1 - → #Fh');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(0xFFn, 'h'), Real(0.5)]);  // 0.5 → 0
  assertThrows(() => lookup('/').fn(s), /Division by zero/,
               'session045: #FFh 0.5 / → Division by zero (0.5 truncates to 0)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(1n, 'h'), Complex(1, 2)]);
  assertThrows(() => lookup('+').fn(s), /Bad argument type/,
               'session045: #1h (1,2) + → Bad argument type (no BinInt/Complex promotion)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(1n, 'h'), Real(0)]);
  assertThrows(() => lookup('AND').fn(s), /Bad argument type/,
               'session045: AND of mixed BinInt + Real still errors');
  resetBinaryState();
}

{
  resetBinaryState();
  setWordsize(8);
  const s = new Stack();
  s.pushMany([BinaryInteger(0x01n, 'h'), Integer(-1n)]);
  lookup('+').fn(s);
  // -1 at ws=8 → 0xFF; #1 + #FF at ws=8 → 0 (mask)
  assert(s.peek().value === 0n && s.peek().base === 'h',
         'session045: #1h + Integer(-1) at ws=8 → #0h (wrap to 0)');
  resetBinaryState();
}

{
  resetBinaryState();
  const s = new Stack();
  s.pushMany([BinaryInteger(2n, 'h'), Real(8)]);
  lookup('^').fn(s);
  assert(s.peek().value === 0x100n && s.peek().base === 'h',
         'session045: #2h 8 ^ → #100h');
  resetBinaryState();
}

// ------------------------------------------------------------------
// BinaryInteger == / SAME / comparator audit.
// HP50 AUR §4-1 and the User Guide's BinInt appendix treat BinInt base
// as a *display attribute* — arithmetic and equality operate on the
// masked numeric value, so `==` / `SAME` return 1 for any two BinInts
// with the same masked value regardless of stored display base.  They
// likewise return 1 for a BinInt vs an Integer / Real with the same
// numeric value (== is a numeric-identity op, not a type-identity op —
// that's what SAME is almost-but-not-quite for: SAME on BinInt vs
// Integer is 0 because the types differ, but SAME on two BinInts at
// the same value regardless of base is 1).
//
// `eqValues()` in `src/rpl/ops.js` has a BinInt × BinInt branch
// (masked against the current wordsize); `==` / `≠` / `<>` apply a
// top-level cross-family coercion so `#10h == Integer(16)` = 1 while
// `SAME #10h Integer(16)` stays 0; and `comparePair()` promotes
// BinInts to Integers for `<` / `>` / `≤` / `≥`.
// ------------------------------------------------------------------
{
  resetBinaryState();
  setBinaryBase(null);

  // Reference-identical: #FFh == #FFh must return 1.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(255n, 'h')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #FFh == #FFh = 1 (BinInt == BinInt same masked value).');
  }

  // Cross-base same value: #FFh == #255d must return 1.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(255n, 'd')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #FFh == #255d = 1 (display base is not semantic).');
  }

  // Cross-base all four: hex/dec/oct/bin all at value 255 must equal each other.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(255n, 'b')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #FFh == #11111111b = 1 (hex vs bin display, same value).');
  }
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'o'), BinaryInteger(255n, 'd')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #377o == #255d = 1 (oct vs dec display, same value).');
  }

  // Different values must return 0 — this already works because the
  // fall-through produces 0.  Hard-assert; becomes a regression guard
  // for future rewriters that don't preserve the zero-on-mismatch
  // branch.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(256n, 'h')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session074: #FFh == #100h (different values) = 0 (regression guard).');
  }
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(0n, 'h'), BinaryInteger(1n, 'd')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session074: #0h == #1d (different values, cross-base) = 0.');
  }

  // != / <> on BinInts must be the complement of == once the gap is
  // fixed.  Soft today: both 0 and 1 allowed.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(255n, 'd')]);
    lookup('<>').fn(s);
    assert(s.peek().value.eq(0),
      'session074: #FFh <> #255d = 0 (complement of ==; widening applies).');
  }

  // SAME on two reference-identical BinInts must return 1.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), BinaryInteger(255n, 'h')]);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(1),
      'session074: SAME #FFh #FFh = 1 (SAME uses eqValues BinInt×BinInt branch).');
  }

  // Cross-type: BinInt vs Integer with same numeric value.
  // AUR §4-1 is explicit that == compares the numeric value across
  // numeric families.  SAME is stricter (types must match) and should
  // still return 0 cross-type.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(16n, 'h'), Integer(16n)]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #10h == Integer(16) = 1 (== widens across numeric families).');
  }
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(16n, 'h'), Integer(16n)]);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(0),
      'session074: SAME #10h Integer(16) = 0 (strict type + value; types differ). Regression guard.');
  }

  // Wordsize masking: #100h at ws=8 masks to #0h.  The BinaryInteger
  // constructor in ../src/rpl/types.js does NOT apply the mask at
  // construction time, so the raw payloads differ (256n vs 0n); the
  // mask is applied inside eqValues's BinInt × BinInt branch via
  // getWordsizeMask().
  {
    resetBinaryState();
    setWordsize(8);
    const s = new Stack();
    s.pushMany([BinaryInteger(0x100n, 'h'), BinaryInteger(0n, 'd')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #100h (wrap → #0h) == #0d at ws=8 = 1 (masking inside eqValues).');
    resetBinaryState();
  }

  // Rejection: BinInt vs non-numeric must NOT crash — == is total.
  // Currently returns 0 via fall-through, which is the HP50 behaviour
  // for any cross-type == (per AUR §4-1 "if operands are not comparable,
  // returns 0; does not error").  Hard-assert.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(255n, 'h'), Str('FF')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session074: #FFh == "FF" = 0 (cross-type: BinInt vs String is not comparable, not an error).');
  }
  {
    const s = new Stack();
    s.pushMany([Str('FF'), BinaryInteger(255n, 'h')]);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session074: "FF" == #FFh = 0 (symmetric cross-type non-match).');
  }

  // Comparators on BinInt — HP50 AUR §4-1 supports `<` / `>` / `≤` /
  // `≥` on BinInts by masked numeric value.  `comparePair()` promotes
  // BinInts to Integer(value & mask) before routing to the numeric
  // path.
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(1n, 'h'), BinaryInteger(2n, 'h')]);
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #1h < #2h = 1 (comparePair accepts BinInt post-widening).');
  }
  // Additional comparator coverage (positive + cross-base + ws-mask).
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(5n, 'h'), BinaryInteger(2n, 'h')]);
    lookup('>').fn(s);
    assert(s.peek().value.eq(1), 'session074: #5h > #2h = 1.');
  }
  {
    // Cross-base ≤ — display base irrelevant under the comparator.
    const s = new Stack();
    s.pushMany([BinaryInteger(5n, 'h'), BinaryInteger(5n, 'd')]);
    lookup('≤').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #5h ≤ #5d = 1 (cross-base, equal values).');
  }
  {
    // Cross-family: #3h < Real(5) = 1 (BinInt lifted to Integer, then
    // promoteNumericPair handles the Real/Integer mix).
    const s = new Stack();
    s.pushMany([BinaryInteger(3n, 'h'), Real(5)]);
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #3h < Real(5) = 1 (BinInt ↔ Real cross-family comparator).');
  }
  {
    // Wordsize mask affects comparator: at ws=8, #100h → #0h, so
    // #100h < #1h compares 0 < 1 = 1.
    resetBinaryState();
    setWordsize(8);
    const s = new Stack();
    s.pushMany([BinaryInteger(0x100n, 'h'), BinaryInteger(1n, 'h')]);
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session074: #100h < #1h at ws=8 = 1 (wordsize mask applies to comparator).');
    resetBinaryState();
  }

  // Rejection path — BinInt vs String must still error under `<`
  // (unlike ==, comparators don't have a cross-type "return 0" mode).
  {
    const s = new Stack();
    s.pushMany([BinaryInteger(1n, 'h'), Str('a')]);
    assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
      'session074: #1h < "a" throws Bad argument type (BinInt × String is not comparable).');
  }

  resetBinaryState();
}

