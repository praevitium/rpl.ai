import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isList, isVector,
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

/* Entry mode — algebraic entry + shifted keypad ops + command-line history. */

/* ============================================================
   Algebraic entry mode

   These tests exercise the Entry layer (no DOM required).  They
   prove that:
     • isAlgebraic() tracks odd/even tick-count correctly,
     • typeOrExec() types inside `'…'` but runs the op outside,
     • typeOrExecFn() types `FN(` inside `'…'` but runs the fn outside,
     • the full "type characters → ENTER → ops on the stack" path
       produces a valid Symbolic AST that FACTOR/SOLVE/DERIV can
       then operate on.
   ============================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');
  const { formatAlgebra } = await import('../www/src/rpl/algebra.js');
  const { isSymbolic, isList } = await import('../www/src/rpl/types.js');

  // isAlgebraic() — parity of `'` characters
  {
    const e = new Entry(new Stack());
    assert(e.isAlgebraic() === false, 'isAlgebraic empty → false');
    e.type("`"); assert(e.isAlgebraic() === true, "isAlgebraic after ``` → true");
    e.type('X'); assert(e.isAlgebraic() === true, "isAlgebraic inside ``X` → true");
    e.type("`"); assert(e.isAlgebraic() === false, "isAlgebraic after closing ``` → false");
  }

  // typeOrExec — inside `'` it types, outside it execs
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("`"); e.type('3');
    e.typeOrExec('+', '+');
    assert(e.buffer === "`3+", `typeOrExec in algebraic → buffer='${e.buffer}'`);
    assert(s.depth === 0, 'typeOrExec in algebraic → stack untouched');
  }
  {
    const s = new Stack();
    s.push(Real(3)); s.push(Real(4));
    const e = new Entry(s);
    e.typeOrExec('+', '+');
    assert(s.depth === 1 && s.peek().value.eq(7), 'typeOrExec outside → exec +');
  }

  // typeOrExecFn — inside `'` types `FN(`; outside runs the op
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("`"); e.type('X'); e.type('+');
    e.typeOrExecFn('SIN');
    assert(e.buffer === "`X+SIN(", `typeOrExecFn in algebraic → '${e.buffer}'`);
  }
  {
    const s = new Stack();
    s.push(Real(0));
    const e = new Entry(s);
    e.typeOrExecFn('SIN');
    assert(Math.abs(s.peek().value) < 1e-12, 'typeOrExecFn outside → exec SIN');
  }

  // Command-key keys self-insert a leading space when the char before
  // the cursor isn't whitespace — otherwise `3 4+[SIN]` would glom to
  // `3 4+SIN ` and the parser would see `+SIN` as one token.
  {
    const e = new Entry(new Stack());
    e.type('3 4+');
    e.typeOrExecFn('SIN');
    assert(e.buffer === '3 4+ SIN ',
      `typeOrExecFn inserts leading space when prev char isn't whitespace → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('3 4 ');
    e.typeOrExecFn('SIN');
    assert(e.buffer === '3 4 SIN ',
      `typeOrExecFn leaves existing trailing space alone → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('5');
    e.typeOrExecName('STO');
    assert(e.buffer === '5 STO ',
      `typeOrExecName inserts leading space when prev char isn't whitespace → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('5 ');
    e.typeOrExecName('STO');
    assert(e.buffer === '5 STO ',
      `typeOrExecName leaves existing trailing space alone → '${e.buffer}'`);
  }

  // typeWithCursor — inserts and moves cursor back
  {
    const e = new Entry(new Stack());
    e.typeWithCursor('()', 1);
    assert(e.buffer === '()' && e.cursor === 1,
      `typeWithCursor('()',1) → buffer='${e.buffer}', cursor=${e.cursor}`);
    e.type('X');
    assert(e.buffer === '(X)', `cursor-placement lets next char land inside: '${e.buffer}'`);
  }

  // Full flow: type `'X^2 + 2*X + 1'` and commit — this is exactly
  // what the on-screen keyboard now produces for the sequence:
  //   '  X  yˣ  2  SPC  +  SPC  2  ×  X  SPC  +  SPC  1  '  ENTER
  // Each operator key is routed through typeOrExec and types the
  // character because isAlgebraic() is true between the two ticks.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("`");
    e.type('X');
    e.typeOrExec('^', '^');   // yˣ while algebraic → types `^`
    e.type('2');
    e.type(' ');
    e.typeOrExec('+', '+');   // + key while algebraic → types `+`
    e.type(' ');
    e.type('2');
    e.typeOrExec('*', '*');   // × key while algebraic → types `*`
    e.type('X');
    e.type(' ');
    e.typeOrExec('+', '+');
    e.type(' ');
    e.type('1');
    e.type("`");
    assert(e.isAlgebraic() === false, 'ticks balanced after closing quote');
    e.enter();
    assert(s.depth === 1, `after ENTER: depth=${s.depth}`);
    assert(isSymbolic(s.peek()), 'after ENTER: stack top is Symbolic');
    const f = formatAlgebra(s.peek().expr);
    // Parser output may or may not inline juxtaposition — accept both shapes.
    assert(f === 'X^2 + 2*X + 1' || f === 'X^2 + 2X + 1',
      `parsed symbolic = '${f}'`);
  }

  // And then FACTOR runs cleanly on that Symbolic. FACTOR routes to
  // Giac in Node via the MockGiacEngine; register a fixture so caseval
  // returns what real Giac returns for this input. No fallback path.
  {
    const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
    giac._clear();
    giac._setFixture('factor(X^2+2*X+1)', '(X+1)^2');
    const s = new Stack();
    const e = new Entry(s);
    for (const ch of "`X^2 + 2*X + 1`") {
      if ('+-*/^'.includes(ch)) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    lookup('FACTOR').fn(s);
    const f = formatAlgebra(s.peek().expr);
    assert(f === '(X + 1)^2', `FACTOR('X^2 + 2*X + 1') = '${f}'`);
    giac._clear();
  }

  // SOLVE flow: `'X^2 - 4' 'X' SOLVE` typed as chars ending with SOLVE
  // reached via bare-name lookup on ENTER commit.
  {
    const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
    const s = new Stack();
    const e = new Entry(s);
    giac._clear();
    giac._setFixture('solve(X^2-4,X)', '[2,-2]');
    for (const ch of "`X^2 - 4` `X` SOLVE") {
      if ('+-*/^'.includes(ch) && e.isAlgebraic()) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    assert(s.depth === 1 && isList(s.peek()), `SOLVE result type: depth=${s.depth}`);
    const roots = s.peek().items.map(r => formatAlgebra(r.expr));
    roots.sort();
    assert(JSON.stringify(roots) === JSON.stringify(['X = -2', 'X = 2']),
      `SOLVE roots = ${JSON.stringify(roots)}`);
    giac._clear();
  }

  // DERIV flow: `'SIN(X^2)' 'X' DERIV`
  {
    const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
    const s = new Stack();
    const e = new Entry(s);
    giac._clear();
    giac._setFixture('diff(sin(X^2),X)', '2*X*cos(X^2)');
    for (const ch of "`SIN(X^2)` `X` DERIV") {
      if ('+-*/^'.includes(ch) && e.isAlgebraic()) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    assert(s.depth === 1 && isSymbolic(s.peek()),
      `DERIV result type: depth=${s.depth}, symbolic=${isSymbolic(s.peek())}`);
    const d = formatAlgebra(s.peek().expr);
    // chain rule: d/dX[SIN(X^2)] = COS(X^2)*2*X  (simplify may reorder)
    assert(d.includes('COS(X^2)') && (d.includes('2*X') || d.includes('2X')),
      `DERIV(SIN(X^2),X) = '${d}'`);
    giac._clear();
  }

  // Virtual button simulation: call the shifted action for − key (parens)
  // and verify cursor lands inside the parens.
  {
    const e = new Entry(new Stack());
    e.type("`");
    // Simulate − shiftL action: typeWithCursor('()', 1)
    e.typeWithCursor('()', 1);
    e.type('X');
    e.type('+');
    e.type('1');
    assert(e.buffer === "`(X+1)", `nested-paren entry sequence: '${e.buffer}'`);
  }

  // Regression: NON-algebraic use of + / × / yˣ still runs the op
  // on the RPL stack.  This matters because virtually every RPN test
  // in the suite above relies on `exec('+')` behavior — the new
  // typeExec must not regress that path.
  {
    const s = new Stack();
    s.push(Real(2)); s.push(Real(5));
    const e = new Entry(s);
    e.typeOrExec('+', '+');
    assert(s.depth === 1 && s.peek().value.eq(7), 'non-algebraic + still exec');
  }
}

/* ============================================================
   Shifted-key ops (hyperbolics, XROOT, complex helpers, GCD/LCM,
   and CLEAR/DEL smoke tests).

   Covers SINH/COSH/TANH, XROOT, ARG/CONJ/RE/IM, GCD/LCM, plus
   Entry.cancel() clearing a buffer the way the SHIFT-L + ⌫ (DEL)
   key binding expects.
   ============================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');

  // ----- hyperbolic ops -----
  {
    const s = new Stack(); s.push(Real(0));
    lookup('SINH').fn(s, null);
    assert(Math.abs(s.peek().value - 0) < 1e-12, 'SINH(0) = 0');
  }
  {
    const s = new Stack(); s.push(Real(0));
    lookup('COSH').fn(s, null);
    assert(Math.abs(s.peek().value - 1) < 1e-12, 'COSH(0) = 1');
  }
  {
    const s = new Stack(); s.push(Real(1));
    lookup('TANH').fn(s, null);
    assert(Math.abs(s.peek().value - Math.tanh(1)) < 1e-12,
      `TANH(1) = ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(Math.sinh(2)));
    lookup('ASINH').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `ASINH(SINH(2)) = 2, got ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(Math.cosh(3)));
    lookup('ACOSH').fn(s, null);
    assert(Math.abs(s.peek().value - 3) < 1e-12,
      `ACOSH(COSH(3)) = 3`);
  }
  {
    // ACOSH of x < 1 lifts to Complex (principal branch) rather than
    // throwing — matches HP50 complex-mode behavior.
    // acosh(0.5) = i * π/3 ≈ 0 + 1.04719755i.
    const s = new Stack(); s.push(Real(0.5));
    lookup('ACOSH').fn(s, null);
    const v = s.peek();
    assert(isComplex(v) && Math.abs(v.re) < 1e-10 && Math.abs(v.im - Math.PI/3) < 1e-10,
      'session045: ACOSH(0.5) → (0, π/3)');
  }
  {
    const s = new Stack(); s.push(Real(0.5));
    lookup('ATANH').fn(s, null);
    assert(Math.abs(s.peek().value - Math.atanh(0.5)) < 1e-12,
      `ATANH(0.5) = atanh(0.5)`);
  }
  {
    // ATANH of out-of-domain
    const s = new Stack(); s.push(Real(1));
    assertThrows(() => lookup('ATANH').fn(s, null), null,
      'ATANH(1) throws (domain |x| < 1)');
  }

  // ----- XROOT (two-arg, y x → y^(1/x)) -----
  {
    const s = new Stack(); s.push(Real(8)); s.push(Real(3));
    lookup('XROOT').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `8 XROOT 3 → 2, got ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(16)); s.push(Real(4));
    lookup('XROOT').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `16 XROOT 4 → 2`);
  }
  {
    // XROOT by 0 should throw
    const s = new Stack(); s.push(Real(5)); s.push(Real(0));
    assertThrows(() => lookup('XROOT').fn(s, null), null,
      'XROOT by 0 throws');
  }

  // ----- ARG / CONJ / RE / IM -----
  {
    // ARG on Real: nonneg → 0, neg → π (in current angle mode)
    setAngle('RAD');
    const s = new Stack(); s.push(Real(5));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - 0) < 1e-12, 'ARG(5) = 0');
  }
  {
    setAngle('RAD');
    const s = new Stack(); s.push(Real(-3));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - Math.PI) < 1e-12,
      'ARG(-3) = π in RAD mode');
  }
  {
    setAngle('DEG');
    const s = new Stack(); s.push(Real(-1));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - 180) < 1e-12,
      'ARG(-1) = 180 in DEG mode');
    setAngle('RAD');
  }
  {
    // ARG on Complex
    setAngle('RAD');
    const s = new Stack();
    s.push({ type: 'complex', re: 1, im: 1 });
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - Math.PI / 4) < 1e-12,
      'ARG(1+i) = π/4');
  }
  {
    // CONJ on Complex
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('CONJ').fn(s, null);
    const v = s.peek();
    assert(v.type === 'complex' && v.re === 3 && v.im === 4,
      `CONJ(3-4i) = 3+4i, got ${v.re}+${v.im}i`);
  }
  {
    // CONJ on Real → identity
    const s = new Stack(); s.push(Real(7));
    lookup('CONJ').fn(s, null);
    assert(s.peek().value.eq(7), 'CONJ(7) = 7');
  }
  {
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('RE').fn(s, null);
    assert(s.peek().value.eq(3), 'RE(3-4i) = 3');
  }
  {
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('IM').fn(s, null);
    assert(s.peek().value.eq(-4), 'IM(3-4i) = -4');
  }
  {
    // IM on Real → 0
    const s = new Stack(); s.push(Real(9));
    lookup('IM').fn(s, null);
    assert(s.peek().value.eq(0), 'IM(9) = 0');
  }

  // ----- GCD / LCM on integers -----
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 12n });
    s.push({ type: 'integer', value: 18n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 6n, `GCD(12,18) = 6, got ${s.peek().value}`);
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 0n });
    s.push({ type: 'integer', value: 7n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 7n, 'GCD(0,7) = 7');
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: -15n });
    s.push({ type: 'integer', value: 10n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 5n, 'GCD(-15,10) = 5 (absolute)');
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 4n });
    s.push({ type: 'integer', value: 6n });
    lookup('LCM').fn(s, null);
    assert(s.peek().value === 12n, `LCM(4,6) = 12, got ${s.peek().value}`);
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 0n });
    s.push({ type: 'integer', value: 5n });
    lookup('LCM').fn(s, null);
    assert(s.peek().value === 0n, 'LCM(0,5) = 0');
  }
  {
    // GCD on non-integer Real should throw
    const s = new Stack(); s.push(Real(1.5)); s.push(Real(3));
    assertThrows(() => lookup('GCD').fn(s, null), null,
      'GCD(1.5, 3) throws');
  }

  // ----- DEL: Entry.cancel() clears an in-progress buffer -----
  // The SHIFT-L + ⌫ (DEL) key is wired to Entry.cancel in keyboard.js.
  {
    const e = new Entry(new Stack());
    e.type('1'); e.type('2'); e.type('3');
    e.cancel();
    assert(e.buffer === '' && e.cursor === 0,
      `DEL clears buffer → '${e.buffer}' cursor=${e.cursor}`);
  }

  // ----- CLEAR: register('CLEAR') wipes the stack -----
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    lookup('CLEAR').fn(s, null);
    assert(s.depth === 0, `CLEAR empties stack, depth=${s.depth}`);
  }
}


// --- Entry command-line history ------------------------------------
// Ring buffer of committed entry buffers.  Feeds the HIST SHIFT-L CMD
// soft-menu so the user can recall prior command lines.  Recording
// only happens on a *successful* parse+commit; failed commits don't
// pollute history; consecutive duplicates collapse to one.
{
  const { Entry } = await import('../www/src/ui/entry.js');
  const { Stack } = await import('../www/src/rpl/stack.js');

  // ---- ENTER records the committed text ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('1 2 +');
    e.enter();
    const h = e.getHistory();
    assert(h.length === 1 && h[0] === '1 2 +',
      `ENTER records '1 2 +' to history — got ${JSON.stringify(h)}`);
  }

  // ---- Empty-line ENTER (= DUP) does NOT record ----
  {
    resetHome();
    const s = new Stack();
    s.push(Real(5));
    const e = new Entry(s);
    e.enter();                 // DUP, no text to record
    assert(e.getHistory().length === 0,
      'empty ENTER (DUP) does not record history');
  }

  // ---- Consecutive duplicates collapse ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('7'); e.enter();
    e.type('7'); e.enter();
    e.type('7'); e.enter();
    const h = e.getHistory();
    assert(h.length === 1 && h[0] === '7',
      `consecutive dup entries collapse — got ${JSON.stringify(h)}`);
  }

  // ---- Non-duplicates keep order (oldest first in storage) ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('1'); e.enter();
    e.type('2'); e.enter();
    e.type('3'); e.enter();
    const h = e.getHistory();
    assert(h.length === 3 && h[0] === '1' && h[2] === '3',
      `history preserves order oldest→newest — got ${JSON.stringify(h)}`);
  }

  // ---- Ring buffer caps at HISTORY_MAX ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    for (let i = 0; i < Entry.HISTORY_MAX + 5; i++) {
      e.type(String(i)); e.enter();
    }
    const h = e.getHistory();
    assert(h.length === Entry.HISTORY_MAX,
      `ring buffer caps at HISTORY_MAX=${Entry.HISTORY_MAX} — got ${h.length}`);
    // Oldest entries are dropped — first surviving entry should be i=5.
    assert(h[0] === '5',
      `oldest entries drop off — first surviving is '${h[0]}', expected '5'`);
  }

  // ---- execOp commit-path also records ----
  {
    resetHome();
    const s = new Stack();
    s.push(Real(3));
    const e = new Entry(s);
    e.type('4');              // non-empty buffer
    e.execOp('+');            // commits '4', then runs +
    const h = e.getHistory();
    assert(h.includes('4'),
      `execOp commit path records pre-op buffer — got ${JSON.stringify(h)}`);
  }

  // ---- Failed parse does NOT record ----
  {
    // Malformed binary integer still throws at parse time (unlike
    // unterminated-string, which auto-closes now).  What we care about
    // here is that the safeRun error path doesn't record.
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('#Xh');            // bad hex digit → Malformed binary integer
    e.enter();                // safeRun catches parse error
    const h = e.getHistory();
    assert(h.length === 0,
      `failed commit does not record — got ${JSON.stringify(h)}`);
  }

  // ---- recall() replaces buffer and repositions cursor ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('abc');
    e.recall('HELLO WORLD');
    assert(e.buffer === 'HELLO WORLD',
      `recall replaces buffer — got '${e.buffer}'`);
    assert(e.cursor === 'HELLO WORLD'.length,
      `recall positions cursor at end — got ${e.cursor}`);
  }

  // ---- getHistory() returns a defensive copy ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('x'); e.enter();
    const h = e.getHistory();
    h.push('EVIL');
    assert(e.getHistory().length === 1,
      'external mutation of getHistory result does not affect internal history');
  }
}

/* ================================================================
   +/- (CHS / toggleSign) respects exponent

   When the current number has an E (scientific notation), +/- flips
   the exponent's sign, not the mantissa's.  HP50 behavior.
   ================================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');

  // Helper: new Entry with a given typed buffer and cursor at the end.
  const mk = (src) => {
    const e = new Entry(new Stack());
    e.type(src);
    return e;
  };

  // ---- 1E7 → 1E-7 (not -1E7) ----
  {
    const e = mk('1E7');
    e.toggleSign();
    assert(e.buffer === '1E-7',
      `1E7 +/- → 1E-7 (flips exponent sign, not mantissa), got "${e.buffer}"`);
    assert(e.cursor === e.buffer.length,
      '1E7 +/- leaves cursor at end of buffer');
  }

  // ---- 1E-7 → 1E7 (second press removes the minus) ----
  {
    const e = mk('1E-7');
    e.toggleSign();
    assert(e.buffer === '1E7', `1E-7 +/- → 1E7, got "${e.buffer}"`);
  }

  // ---- 1E+7 → 1E-7 (flip explicit +) ----
  {
    const e = mk('1E+7');
    e.toggleSign();
    assert(e.buffer === '1E-7', `1E+7 +/- → 1E-7, got "${e.buffer}"`);
    assert(e.buffer.length === 4,
      'flipping + to - keeps buffer length unchanged');
  }

  // ---- Round-trip: two +/- presses return to original ----
  {
    const e = mk('1E7');
    e.toggleSign();
    e.toggleSign();
    assert(e.buffer === '1E7',
      `1E7 +/- +/- → 1E7 (round-trip), got "${e.buffer}"`);
  }

  // ---- Multi-digit mantissa + exponent ----
  {
    const e = mk('1.5E2');
    e.toggleSign();
    assert(e.buffer === '1.5E-2', `1.5E2 +/- → 1.5E-2, got "${e.buffer}"`);
  }

  // ---- Negative mantissa with positive exponent: flip only exponent ----
  {
    const e = mk('-1.5E2');
    e.toggleSign();
    assert(e.buffer === '-1.5E-2',
      `-1.5E2 +/- → -1.5E-2 (mantissa sign preserved), got "${e.buffer}"`);
  }

  // ---- Lowercase e also counts as exponent marker ----
  {
    const e = mk('2e3');
    e.toggleSign();
    assert(e.buffer === '2e-3', `2e3 +/- → 2e-3, got "${e.buffer}"`);
  }

  // ---- No exponent: still flips mantissa (regression protection) ----
  {
    const e = mk('1.5');
    e.toggleSign();
    assert(e.buffer === '-1.5', `1.5 +/- → -1.5, got "${e.buffer}"`);
    e.toggleSign();
    assert(e.buffer === '1.5', `-1.5 +/- → 1.5, got "${e.buffer}"`);
  }

  // ---- Empty buffer: NEGs the stack top (existing dispatch) ----
  {
    const s = new Stack();
    s.push(Real(7));
    const e = new Entry(s);
    e.toggleSign();
    assert(s.depth === 1 && isReal(s.peek(1)) && s.peek(1).value.eq(-7),
      'empty buffer: +/- NEGs the stack top');
  }

  // ---- Trailing E with no exponent digits yet (just after EEX) ----
  {
    const e = mk('123E');
    e.toggleSign();
    assert(e.buffer === '123E-',
      `123E +/- inserts a - after E for the yet-to-be-typed exponent, got "${e.buffer}"`);
    assert(e.cursor === e.buffer.length,
      'cursor advances past the inserted - so next digit typed appends to exponent');
  }
}

// ------------------------------------------------------------------
// LAST / LASTARG via the Entry layer end-to-end — verifies the runOp
// wiring in entry.js captures consumed args when ops are driven
// through the user-facing execOp / enter paths.
// ------------------------------------------------------------------
{
  const { Entry } = await import('../www/src/ui/entry.js');
  // Helper: Integer holds BigInt, Real holds JS Number.  Parser emits
  // Integer for bare digit literals in EXACT mode.  Compare as Number.
  const val = (v) => Number(v.value);
  // `3 4 +` via the command line, then LASTARG as a subsequent entry.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('3 4 +');
    e.enter();
    assert(s.depth === 1 && val(s.peek()) === 7,
      'session046(entry): 3 4 + via entry → 7');
    e.type('LASTARG');
    e.enter();
    assert(s.depth === 3 && val(s.peek(2)) === 3 && val(s.peek(1)) === 4,
      'session046(entry): LASTARG via entry pushes 3 4');
  }
  // execOp path: type `5` then press an operator key bound via execOp.
  {
    const s = new Stack();
    const e = new Entry(s);
    s.push(Real(12));
    e.type('3');
    e.execOp('*');                       // commits `3`, then multiplies
    assert(s.depth === 1 && val(s.peek()) === 36,
      'session046(entry): 12 on stack, type 3, press *, → 36');
    // Now push LASTARG via execOp.  execOp calls runOp for LASTARG
    // itself — since LASTARG consumes nothing, that runOp records an
    // empty _lastArgs after the push.  But the args pushed are what
    // `*` consumed 12 and 3 above.
    e.execOp('LASTARG');
    assert(s.depth === 3,
      'session046(entry): LASTARG via execOp pushes 2 args');
    assert(val(s.peek(2)) === 12 && val(s.peek(1)) === 3,
      'session046(entry): args restored (12, 3) after execOp(*) LASTARG');
  }
  // Chained LASTARG through the entry path: LASTARG is idempotent
  // per HP50 semantics — pressing it N times pushes the same arg set
  // N times, because ops that only grow the stack (LASTARG itself,
  // DUP, OVER, DEPTH, …) leave the _lastArgs slot untouched.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('10 20 +');
    e.enter();
    e.type('LASTARG');
    e.enter();
    // First LASTARG pushed [10, 20]; the _lastArgs slot still holds
    // the `+` op's args, so a second press pushes the same pair again.
    e.type('LASTARG');
    e.enter();
    assert(s.depth === 5,
      'session046(entry): two LASTARG presses push the args twice');
    assert(val(s.peek(5)) === 30 && val(s.peek(4)) === 10 && val(s.peek(3)) === 20
        && val(s.peek(2)) === 10 && val(s.peek(1)) === 20,
      'session046(entry): args repeated across chained LASTARG');
  }
}

/* ============================================================
   Backtick quotedName — validator guard + algebra auto-close
   ============================================================

   `parseEntry` must not silently fall through to
   `Name(body, {quoted:true})` when `parseAlgebra` throws on an
   algebraic-looking body — a silent fallback would mint ghost Names
   like `Name("SIN(X ")` that would pollute the stack and blow up
   inside CAS ops.

   Two paired behaviours cover that surface:

     • algebra.js `expect(')')` auto-closes at EOF, so the common
       "user forgot the closer" case parses cleanly.
     • parser.js re-throws the algebra error when the body also fails
       `isValidHpIdentifier`, so anything that can't be a legal HP
       identifier surfaces as "Invalid algebraic: …" instead of a
       stack-borne ghost.

   Round-trip cases (bare operator atoms like `+`, plain identifiers
   like `Y`) still resolve to a quoted Name.
*/
{
  // Auto-close: unterminated paren inside backticks parses as a
  // closed algebraic.
  const out = parseEntry('`SIN(X `');
  const v = Array.isArray(out) ? out[0] : out;
  assert(v && v.type === 'symbolic',
    `parseEntry('\`SIN(X \`') becomes a Symbolic — got type=${v && v.type}`);
}
{
  // Validator guard: a body that's neither a valid algebraic nor a
  // valid identifier throws instead of minting Name("#FFh + 1").
  assertThrows(() => parseEntry('`#FFh + 1`'), /Invalid algebraic/,
    'parseEntry(`#FFh + 1`) throws "Invalid algebraic:" instead of becoming a ghost Name');
}
{
  // Bare operator atom round-trips as a Name — programmatic composition
  // of op-only bodies stays supported.
  const out = parseEntry('`+`');
  const v = Array.isArray(out) ? out[0] : out;
  assert(isName(v) && v.id === '+',
    "parseEntry('`+`') round-trips as Name('+')");
}
{
  // Plain identifier body passes validator and lands as a quoted Name.
  const out = parseEntry('`Y`');
  const v = Array.isArray(out) ? out[0] : out;
  assert(isName(v) && v.id === 'Y',
    "parseEntry('`Y`') round-trips as Name('Y')");
}

/* ====================================================================
   Identifier tokens stop at `(` and `)` — `SIN(x)` typed without
   surrounding backticks must NOT mint `Name('SIN(x)')`.  The bare
   ident-tokenizer splits at the open paren so `SIN` becomes its own
   `Name` and the trailing `(x)` lands in the complex-literal branch,
   which now rejects non-numeric bodies with a clean parse error
   ("Bad complex literal: (x)") instead of silently pushing
   `Complex(NaN, 0)`.

   Algebraic form via backticks (``SIN(x)``) still parses cleanly to
   a `Symbolic`; legitimate complex literals like `(3,4)` are
   unaffected.  A stray `)` (e.g. user typed `xy)`) surfaces
   "Unexpected ')'" rather than spinning the tokenizer.
   ==================================================================== */
{
  // Bare `SIN(x)` no longer becomes Name('SIN(x)') — the `(x)` half
  // is a malformed complex, so the parse rejects.
  assertThrows(() => parseEntry('SIN(x)'), /Bad complex literal/,
    "parseEntry('SIN(x)') without backticks rejects (no ghost Name('SIN(x)'))");
}
{
  // Legitimate complex literal still parses.
  const out = parseEntry('(3,4)');
  const v = Array.isArray(out) ? out[0] : out;
  assert(v && v.type === 'complex' && v.re === 3 && v.im === 4,
    "parseEntry('(3,4)') still parses to Complex(3, 4)");
}
{
  // Backticked SIN(x) still routes through parseAlgebra and becomes
  // a Symbolic — pin the no-regression contract.
  const out = parseEntry('`SIN(x)`');
  const v = Array.isArray(out) ? out[0] : out;
  assert(v && v.type === 'symbolic'
      && v.expr.kind === 'fn' && v.expr.name === 'SIN'
      && v.expr.args.length === 1 && v.expr.args[0].name === 'x',
    "parseEntry('`SIN(x)`') stays Symbolic(SIN(x))");
}
{
  // Stray `)` is a parse error, not a tokenizer infinite loop.
  assertThrows(() => parseEntry('xy)'), /Unexpected '\)'/,
    "parseEntry('xy)') rejects with \"Unexpected ')'\"");
}

/* ====================================================================
   Identifier tokens stop at an embedded program delimiter.  A closing
   guillemet `»` (or the ASCII `>>`) abutting an operator name must
   close the program rather than be swallowed into the identifier —
   pre-fix `« 1 2 <»` minted `Name('<»')` and the program auto-closed
   on end-of-buffer instead of on its real `»`.  A lone `<`/`>` stays a
   valid bare operator name, and nested `« … »` is unaffected.
   ==================================================================== */
{
  // `<»` adjacency: `<` is the operator, `»` closes the program.
  const v = parseEntry('« 1 2 <»')[0];
  assert(isProgram(v) && v.tokens.length === 3
      && isName(v.tokens[2]) && v.tokens[2].id === '<',
    "parseEntry('« 1 2 <»') → Program ending in Name('<'), `»` closes it");
}
{
  // `≤»` adjacency (Unicode operator glyph) closes the same way.
  const v = parseEntry('« 1 2 ≤»')[0];
  assert(isProgram(v) && v.tokens.length === 3
      && isName(v.tokens[2]) && v.tokens[2].id === '≤',
    "parseEntry('« 1 2 ≤»') → Program ending in Name('≤')");
}
{
  // ASCII `>>` abutting `<` closes the program too (`<>>` → `<` then `>>`).
  const v = parseEntry('<< 1 2 <>>')[0];
  assert(isProgram(v) && v.tokens.length === 3
      && isName(v.tokens[2]) && v.tokens[2].id === '<',
    "parseEntry('<< 1 2 <>>') → Program ending in Name('<')");
}
{
  // A lone `<` outside a program is still a valid bare operator Name.
  const out = parseEntry('< 3');
  assert(isName(out[0]) && out[0].id === '<' && isInteger(out[1]),
    "parseEntry('< 3') → bare Name('<') then Integer(3)");
}
{
  // A Name abutting the closer is split correctly (`X»` → Name('X') + close).
  const v = parseEntry('« X»')[0];
  assert(isProgram(v) && v.tokens.length === 1
      && isName(v.tokens[0]) && v.tokens[0].id === 'X',
    "parseEntry('« X»') → Program holding Name('X')");
}
{
  // Nested programs are unaffected by the delimiter-stop change.
  const v = parseEntry('« 1 << 3 4 >> »')[0];
  assert(isProgram(v) && v.tokens.length === 2 && isProgram(v.tokens[1])
      && v.tokens[1].tokens.length === 2,
    "parseEntry('« 1 << 3 4 >> »') → outer Program with nested Program");
}

/* ====================================================================
   session278: list / vector delimiters are symmetric with the program-
   guillemet abutment class (session 272's queued follow-up).  `{` `}`
   `[` `]` are single-char delims already in the ident-tokenizer stop
   set, so an opener/closer abutting a Name or number with no space
   splits cleanly — unlike the `«»` case, no `<<`/`>>`-style lookahead
   is needed because none of these glyphs is a valid bare operator name.
   These pins guard against a future stop-set refactor silently
   swallowing a list/vector delimiter into an adjacent identifier.
   ==================================================================== */
{
  // Name abutting a list opener: `X{` → Name('X') then the list.
  const v = parseEntry('« X{1 2}»')[0];
  assert(isProgram(v) && v.tokens.length === 2
      && isName(v.tokens[0]) && v.tokens[0].id === 'X'
      && isList(v.tokens[1]) && v.tokens[1].items.length === 2,
    "parseEntry('« X{1 2}»') → Program [Name('X'), {1 2}]");
}
{
  // Name abutting a vector opener: `X[` → Name('X') then the vector.
  const v = parseEntry('« X[1 2]»')[0];
  assert(isProgram(v) && v.tokens.length === 2
      && isName(v.tokens[0]) && v.tokens[0].id === 'X'
      && isVector(v.tokens[1]),
    "parseEntry('« X[1 2]»') → Program [Name('X'), [1 2]]");
}
{
  // Number abutting a list opener: `1{` → Integer(1) then the list.
  const v = parseEntry('« 1{2 3}»')[0];
  assert(isProgram(v) && v.tokens.length === 2
      && isInteger(v.tokens[0]) && v.tokens[0].value === 1n
      && isList(v.tokens[1]) && v.tokens[1].items.length === 2,
    "parseEntry('« 1{2 3}»') → Program [Integer(1), {2 3}]");
}
{
  // List closer abutting a Name: `}DUP` → close the list, then Name('DUP').
  const out = parseEntry('{1 2}DUP');
  assert(out.length === 2 && isList(out[0]) && out[0].items.length === 2
      && isName(out[1]) && out[1].id === 'DUP',
    "parseEntry('{1 2}DUP') → [{1 2}, Name('DUP')]");
}
{
  // Vector closer abutting a Name: `]DUP` → close the vector, then Name.
  const out = parseEntry('[1 2]DUP');
  assert(out.length === 2 && isVector(out[0])
      && isName(out[1]) && out[1].id === 'DUP',
    "parseEntry('[1 2]DUP') → [[1 2], Name('DUP')]");
}
{
  // Empty list abutting a Name inside a program: `2{}»` splits the
  // Integer, an empty list, and the program closer with no swallowing.
  const v = parseEntry('« 2{}»')[0];
  assert(isProgram(v) && v.tokens.length === 2
      && isInteger(v.tokens[0])
      && isList(v.tokens[1]) && v.tokens[1].items.length === 0,
    "parseEntry('« 2{}»') → Program [Integer(2), {}]");
}

/* ====================================================================
   Polar / cylindrical / spherical input — HP50 AUR §4.4 (complex) and
   §9 (vector).  The angle component (prefixed with U+2220 `∠`) is
   interpreted in the active RAD / DEG / GRD mode and converted to
   rectangular at parse time, so a vector / complex on the stack is
   always cartesian regardless of how it was entered.

   Forms covered:
     Complex:    (r, ∠θ)
     Vec 2D cyl: [ r ∠θ ]
     Vec 3D cyl: [ r ∠θ z ]
     Vec 3D sph: [ ρ ∠θ ∠φ ]   (θ azimuth, φ polar from +z)

   The pins exercise each form in DEG / RAD / GRD so the active-mode
   honouring stays wired.  We keep the asserts loose enough to absorb
   IEEE-754 rounding (`< 1e-10`) but tight enough to catch a mode
   switch (90° vs 90 rad) regression.
   ==================================================================== */
const _close = (a, b, eps = 1e-10) => Math.abs(Number(a) - Number(b)) < eps;

// --- Complex: (1, ∠90) in DEG → 0 + 1i  ---
{
  setAngle('DEG');
  const v = parseEntry('(1, ∠90)')[0];
  assert(v.type === 'complex' && _close(v.re, 0) && _close(v.im, 1),
    'polar Complex (1,∠90) in DEG → (0, 1)');
}
// --- Complex: (2, ∠0) in any mode → (2, 0)  ---
{
  setAngle('RAD');
  const v = parseEntry('(2, ∠0)')[0];
  assert(v.type === 'complex' && _close(v.re, 2) && _close(v.im, 0),
    'polar Complex (2,∠0) → (2, 0)');
}
// --- Complex: (1, ∠π/2) in RAD literal → (0, 1)  ---
{
  setAngle('RAD');
  const v = parseEntry('(1, ∠1.5707963267948966)')[0];
  assert(v.type === 'complex' && _close(v.re, 0) && _close(v.im, 1),
    'polar Complex (1,∠π/2) in RAD → (0, 1)');
}
// --- Complex: (1, ∠100) in GRD → (0, 1)  (100 grads = 90°)  ---
{
  setAngle('GRD');
  const v = parseEntry('(1, ∠100)')[0];
  assert(v.type === 'complex' && _close(v.re, 0) && _close(v.im, 1),
    'polar Complex (1,∠100) in GRD → (0, 1)');
}
// --- Complex: forgiving `<` alias also routes through polar  ---
{
  setAngle('DEG');
  const v = parseEntry('(1, <90)')[0];
  assert(v.type === 'complex' && _close(v.re, 0) && _close(v.im, 1),
    'polar Complex (1,<90) — `<` accepted as polar marker too');
}

// --- Comma is optional — space-separated rect and bare `∠`/`<` polar  ---
//     (a b)         → rect
//     (a ∠θ)        → polar with whitespace
//     (a∠θ)         → polar without any separator
//     (a)           → re-only, im defaults to 0
{
  setAngle('DEG');
  const cases = [
    { src: '(3 4)',       re: 3,                          im: 4,                           label: 'rect (3 4) — space separator' },
    { src: '(-1.5 2.5)',  re: -1.5,                       im: 2.5,                         label: 'rect (-1.5 2.5) — signed reals, space-separated' },
    { src: '(1 ∠90)',     re: 0,                          im: 1,                           label: 'polar (1 ∠90) — space then ∠' },
    { src: '(1∠90)',      re: 0,                          im: 1,                           label: 'polar (1∠90) — no separator' },
    { src: '(2<90)',      re: 0,                          im: 2,                           label: 'polar (2<90) — no separator with `<` alias' },
    { src: '(7)',         re: 7,                          im: 0,                           label: 'single number (7) → Complex(7, 0)' },
  ];
  for (const tc of cases) {
    const v = parseEntry(tc.src)[0];
    assert(v && v.type === 'complex' && _close(v.re, tc.re) && _close(v.im, tc.im),
      tc.label);
  }
}
{
  // Three-comma form is still rejected — comma-optional doesn't mean
  // "anything goes".
  assertThrows(() => parseEntry('(1,2,3)'), /Bad complex literal/,
    'three-component complex literal still rejects');
}

// --- 2D cylindrical Vector: [ r ∠θ ]  ---
{
  setAngle('DEG');
  const v = parseEntry('[ 1 ∠90 ]')[0];
  assert(v.type === 'vector' && v.items.length === 2
      && _close(v.items[0].value, 0) && _close(v.items[1].value, 1),
    '[ 1 ∠90 ] in DEG → [ 0 1 ]');
}
{
  setAngle('RAD');
  const v = parseEntry('[ 2 ∠1.5707963267948966 ]')[0];
  assert(v.type === 'vector' && v.items.length === 2
      && _close(v.items[0].value, 0) && _close(v.items[1].value, 2),
    '[ 2 ∠π/2 ] in RAD → [ 0 2 ]');
}
{
  setAngle('GRD');
  const v = parseEntry('[ 1 ∠200 ]')[0];
  assert(v.type === 'vector' && v.items.length === 2
      && _close(v.items[0].value, -1) && _close(v.items[1].value, 0),
    '[ 1 ∠200 ] in GRD → [ -1 0 ]   (200 grads = 180°)');
}

// --- 3D cylindrical Vector: [ r ∠θ z ]  ---
{
  setAngle('DEG');
  const v = parseEntry('[ 2 ∠90 5 ]')[0];
  assert(v.type === 'vector' && v.items.length === 3
      && _close(v.items[0].value, 0)
      && _close(v.items[1].value, 2)
      && _close(v.items[2].value, 5),
    '[ 2 ∠90 5 ] in DEG → [ 0 2 5 ]');
}

// --- 3D spherical Vector: [ ρ ∠θ ∠φ ]  (θ azimuth, φ polar)  ---
{
  setAngle('DEG');
  // ρ=1, θ=0, φ=0  → north pole, z = 1
  const v0 = parseEntry('[ 1 ∠0 ∠0 ]')[0];
  assert(v0.type === 'vector' && v0.items.length === 3
      && _close(v0.items[0].value, 0)
      && _close(v0.items[1].value, 0)
      && _close(v0.items[2].value, 1),
    '[ 1 ∠0 ∠0 ] in DEG → [ 0 0 1 ]   (north pole)');
  // ρ=1, θ=0, φ=90  → equator at +x axis: x=1, y=0, z=0
  const v1 = parseEntry('[ 1 ∠0 ∠90 ]')[0];
  assert(v1.type === 'vector' && v1.items.length === 3
      && _close(v1.items[0].value, 1)
      && _close(v1.items[1].value, 0)
      && _close(v1.items[2].value, 0),
    '[ 1 ∠0 ∠90 ] in DEG → [ 1 0 0 ]   (equator on +x)');
}

// --- Whitespace between `∠` and the angle literal is allowed  ---
{
  setAngle('DEG');
  const v = parseEntry('[ 2 ∠ 45 ]')[0];
  assert(v.type === 'vector' && v.items.length === 2
      && _close(v.items[0].value, Math.SQRT2)
      && _close(v.items[1].value, Math.SQRT2),
    '[ 2 ∠ 45 ] (whitespace after ∠) parses as polar 2D');
}

// --- Malformed polar input surfaces a clean parse error  ---
{
  // `∠` outside a vector is not a stand-alone value.
  assertThrows(() => parseEntry('∠45'), /∠/,
    'stray ∠45 outside a vector rejects');
}
{
  // 2-component vector with the angle in the wrong slot.
  assertThrows(() => parseEntry('[ ∠45 ∠90 ]'), /Bad polar vector literal/,
    '[ ∠45 ∠90 ] (no leading magnitude) rejects');
}
{
  // 3-component vector with `∠` only on the third slot — not a known
  // form; we don't silently treat it as rect.
  assertThrows(() => parseEntry('[ 1 2 ∠90 ]'), /Bad polar vector literal/,
    '[ 1 2 ∠90 ] (∠ only on 3rd slot) rejects');
}
{
  // ∠ with a non-numeric tail.
  assertThrows(() => parseEntry('[ 1 ∠foo ]'), /angle/,
    '[ 1 ∠foo ] rejects — non-numeric angle');
}

// --- Cleanup shared state so later tests don't see stray bindings
resetHome();
setAngle('RAD');
resetBinaryState();

