/* Global calculator modes / flags.  Cross-cutting state the RPL core,
   UI display and keyboard read or mutate in lockstep.  Ops mutate via
   the `set*` helpers so subscribers fire exactly once per change. */

import { Directory, TYPES, BIN_BASES, Decimal } from './types.js';

// Cycle order is RAD → DEG → GRD → RAD.  RAD is the rpl5050 boot
// default (deliberate deviation from the HP50 factory DEG default —
// see `state.angle` below), so cycling starts there.  `setAngle`
// validates against this list, `cycleAngle` indexes through it, and
// the F1 ANGL annunciator follows the same order.
export const ANGLE_MODES = Object.freeze(['RAD', 'DEG', 'GRD']);
export const COORD_MODES = Object.freeze(['RECT', 'CYLIN', 'SPHERE']);

const _listeners = new Set();

/* The HOME directory is the top-level variable container.  It lives
   for the lifetime of the app.  `current` is the directory the user is
   "in" — matches the { HOME } / { HOME A } annunciator on the HP50.
   Subdirectories aren't creatable yet, but the data model is ready. */
const _home = Directory({ name: 'HOME' });

export const WORDSIZE_MIN = 1;
export const WORDSIZE_MAX = 64;
export const WORDSIZE_DEFAULT = 64;

/** Maximum exponent magnitude for Real values.  Defines the range
 *  [1e-REAL_MAX_EXP, 9.99…e+REAL_MAX_EXP] that maps to MINR/MAXR,
 *  and is forwarded to Decimal.set() so arithmetic that exceeds the
 *  boundary throws rather than silently producing ∞.
 *
 *  The HP50 BCD hardware used 499; we default to 999 since decimal.js
 *  can represent anything up to 9e15.  `STMXE` lets the user change
 *  this at runtime. */
export const REAL_MAX_EXP_DEFAULT = 999;
export const REAL_MAX_EXP_MIN     = 10;          // sanity floor
export const REAL_MAX_EXP_MAX     = 9e15;        // Decimal.js hard limit

export const state = {
  // 'DEG' | 'RAD' | 'GRD'.  rpl5050 boots in RAD — a deliberate
  // deviation from the HP50 factory default (DEG, flag -17 clear).
  // The CAS (Giac) angle is synced from this slot at every caseval
  // (see www/src/rpl/cas/giac-engine.mjs `_syncAngleMode`), so Symbolic
  // ops like SUBST honour RAD/DEG without each call having to opt in.
  angle:   'RAD',
  // Coordinate display mode for Complex / Vector values.  'RECT' is the
  // HP50 default (flag -15/-16 both clear) and renders (1,1) as
  // `(1, 1)`; 'CYLIN' renders the same as `(SQRT(2), π/4)`; 'SPHERE'
  // extends that to 3-vectors.  The formatter is the sole consumer —
  // only the on-screen display changes; stored values stay rectangular.
  coordMode: 'RECT',         // 'RECT' | 'CYLIN' | 'SPHERE'
  // Number display mode (HP50 STD / FIX / SCI / ENG).  `displayMode` is
  // the mode name; `displayDigits` is the digit count consumed by
  // FIX/SCI/ENG (ignored by STD).  The LCD renderer reads these before
  // each stack repaint so the STD / FIX n / SCI n / ENG n ops take
  // visible effect; →STR also consults them.
  displayMode: 'STD',        // 'STD' | 'FIX' | 'SCI' | 'ENG'
  displayDigits: 12,         // 0..11 for FIX/SCI/ENG
  home:    _home,
  current: _home,            // directory variables read from / write to
  // Last-error slot — written by IFERR when it catches an RPLError, read by
  // ERRM / ERRN inside the trap's THEN clause.  `null` means "no error
  // since last ERR0 (or since boot)".  { message: string, number: number }
  // when populated.  Also see state.js:setLastError / clearLastError below.
  lastError: null,
  // Binary-integer wordsize, in bits.  HP50 range 1..64, default 64.
  // All BinInt arithmetic masks results to this many low bits.  Set by
  // the STWS op; read by RCWS, the formatter, and ops.js BinInt math.
  wordsize: WORDSIZE_DEFAULT,
  // Global display-base override for BinaryInteger values.  Defaults
  // to 'd' so the status-line base annunciator always carries a live
  // label on boot — no "none" placeholder state.  'h'/'d'/'o'/'b'
  // make the formatter render every BinInt in that base AND pad to
  // the current wordsize (HP50 convention — HEX pads to ceil(ws/4)
  // hex digits, BIN to ws digits, etc.).  The `null` value — "each
  // BinInt renders in its own stored base" — is still reachable via
  // CLB for users who want per-value display.
  binaryBase: 'd',
  // Textbook (pretty-print) display mode for Symbolic values on the
  // stack.  When true, display.renderStack swaps formatStackTop for
  // astToSvg on any Symbolic row so the user sees textbook-style 2D
  // math (fractions, exponents, scaled parens).  When false, stack
  // rendering is flat text.  Other types (Real, Integer, BinInt,
  // Complex, List, …) always render as flat text — textbookMode only
  // affects Symbolic.  Mirrors HP50 system flag -80 semantically.
  // Default is ON — 2D rendering is the friendlier first-boot
  // experience; users who want flat text can press FLAT (or toggle
  // the MODES menu FLT→TXT softkey).
  textbookMode: true,
  // APPROX vs EXACT numeric-eval mode.  Mirrors HP50 flag -105
  // ("_approx_" when SET, "_exact_" when CLEAR).  When `true`
  // (APPROX), EVAL folds Fn(...) nodes aggressively to 12-digit
  // decimals — `SQRT(2) → 1.41421356237`.  When `false` (EXACT),
  // EVAL only folds Fn(...) when the result is effectively an
  // integer AND every input is an integer — so `SQRT(9) → 3` still
  // folds but `SQRT(2)` stays symbolic.  The `→NUM` op (ENTER
  // SHIFT-R) forces APPROX for the duration of one EVAL and restores
  // whatever was set before the call.
  //
  // Default is EXACT (`false`) to match the real HP50 — flag -105 is
  // CLEAR at boot on a factory-reset unit.  Tests that assume APPROX
  // fold decimals must setApproxMode(true) up front.  The MODES menu
  // exposes an EXA↔APX toggle so users can flip from the keypad
  // without alpha-typing the op name.
  approxMode: false,
  // User / system flag storage.  A single Set<number> keyed by the
  // flag number; positive numbers address user flags (1..128),
  // negatives address system flags (-1..-128) per HP50 convention.
  // The ops SF/CF/FS?/FC?/FS?C/FC?C manipulate this set.  Zero is
  // not a legal flag number — ops reject it as Bad argument.  No
  // cross-cutting behavior is yet wired to any specific system flag
  // number; the Set is the bookkeeping surface that future features
  // (MODES-menu toggles, SYMB IMPL, etc.) can consult.
  userFlags: new Set(),
  // CMPLX mode.  Mirrors HP50 system flag -103 ("_Complex_" when
  // SET, "_Real_" when CLEAR).  When ON, ops whose real path would
  // produce NaN or an out-of-domain error (LN/LOG on negative reals,
  // ACOS/ASIN on |x|>1) return the principal-branch Complex result
  // instead.  When OFF (the boot default), those same inputs throw
  // "Bad argument value" — matching a factory-reset HP50.  SQRT and
  // the inverse hyperbolics already lift to Complex unconditionally;
  // CMPLX doesn't affect them.  Toggled by the `CMPLX` op, observable
  // via `CMPLX?`.
  complexMode: false,
  // Last-fit model.  One of `{ kind, a, b }` with `kind` in
  // `'LIN' | 'LOG' | 'EXP' | 'PWR'` and `a`, `b` plain JS Numbers —
  // or `null` if no regression has been run yet.  Written by LINFIT
  // / LOGFIT / EXPFIT / PWRFIT, consumed by PREDV / PREDX to
  // evaluate the model at a scalar without the user having to
  // re-type the closed-form Symbolic.  BESTFIT does NOT publish a
  // model — it only reports the family name; matches the HP50
  // firmware rule that BESTFIT is diagnostic, not computational.
  //
  // Stored as plain Numbers, not Real/Integer wrappers — the model
  // is an internal scratch slot, not a user-addressable variable.
  // PREDV / PREDX coerce the result into a Real at push time.  The
  // slot is NOT persisted across reloads; running any *FIT op
  // after a reload re-establishes it.
  lastFitModel: null,
  // CAS "main variable" slot (VX / SVX).  HP50 firmware stores a
  // single CAS directory variable named `VX` that every CAS-aware
  // op consults when it needs to pick a canonical variable against
  // which to operate: DERVX, INTVX, LAPLACE, ILAP, PREVAL on
  // multi-free-variable input, TABVAL, TAYLOR0, etc.  We store it
  // here as a plain string (Name.id).  Default is `'x'` (lowercase)
  // — deliberate deviation from the HP50 factory default of `'X'`,
  // matching the lowercase-default keyboard convention (see
  // ui/keyboard.js header).  Written by the SVX op and by
  // `setCasVx()`; read by the VX op and by `getCasVx()`.
  //
  // Not (yet) persisted across reloads in v1 snapshots; we accept an
  // optional `casVx` field on decode so a future version bump is
  // backwards-compatible.
  casVx: 'x',
  // CAS MODULO state slot (MODSTO / ADDTMOD / SUBTMOD / MULTMOD /
  // POWMOD family — HP50 AUR §3-150 / §3-9 / §3-243 / §3-153 / §3-175).
  // BigInt holding the current modulus.  HP50 factory default is 13
  // (the "Modulo" line of the CAS Modes input form).  MODSTO is the
  // setter; the modular ops above consult it to reduce results.
  // Negative inputs are stored as their absolute value, 0 and 1 are
  // promoted to 2 — matching the HP50 firmware contract that the
  // modulus is always ≥ 2 and positive.  Persisted across reloads via
  // persist.js (encoded as { __t: 'bigint', v: '<digits>' }).
  casModulo: 13n,
  // Maximum Real exponent magnitude.  MAXR = 9.99…e+realMaxExp,
  // MINR = 1e-realMaxExp.  Also forwarded to Decimal.set({ MAX_EXP,
  // MIN_EXP }) so arithmetic overflows match the configured boundary.
  // Changed by STMXE; read by RCMXE and the MAXR/MINR ops.
  realMaxExp: REAL_MAX_EXP_DEFAULT,
  // Suspended-execution slots — a LIFO stack of halted records.
  // Each record shape is
  //   { tokens: Array, ip: number, length: number }
  //   `tokens`   — the program's token list at the HALT point
  //   `ip`       — index of the next token to execute on CONT
  //   `length`   — upper bound (cached `tokens.length` at HALT time)
  //
  // `halted` carries the *top* of the LIFO stack (the most recently
  // suspended program) or `null` when no program is currently
  // suspended.  UI subscribers and tests that check `state.halted
  // !== null` continue to work unchanged.  `haltedStack` carries the
  // full stack in push order (oldest at index 0, most-recent at
  // index haltedStack.length - 1); it is populated by `setHalted`
  // and drained by `clearHalted`.
  //
  // HALT only fires at depth 0 of a Program body with no compiled-
  // local frame active.  Multi-slot matters when a user runs a
  // second program from the keypad while an earlier one is still
  // halted — CONT then resumes the newer halt first, and the older
  // halt remains on the stack to be CONT'd next.  HP50 AUR p.2-135
  // describes this stack-of-halted-programs behaviour.
  halted: null,
  haltedStack: [],
  // PROMPT message slot.  PROMPT (HP50 AUR p.2-160) is
  // HALT-with-display-message — the program pops level 1, stashes the
  // value here so a UI subscriber can render it in the status area, and
  // suspends via the same generator-yield mechanism HALT uses.  CONT
  // and KILL clear the slot when resuming or terminating; resetHome
  // also drops it so a refresh starts on a blank prompt.
  //
  // Stored as the raw RPL value the user pushed (typically a String,
  // but PROMPT accepts any object — the formatter is the renderer's
  // problem).  `null` means "no prompt active".
  promptMessage: null,
};

function _emit() {
  for (const fn of _listeners) {
    try { fn(state); } catch (e) { console.error('state listener', e); }
  }
}

/** Subscribe to all state changes.  Returns an unsubscribe fn. */
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// Forward the boot realMaxExp to Decimal so arithmetic overflow fires
// at the right boundary from the first instruction.
Decimal.set({ MAX_EXP: REAL_MAX_EXP_DEFAULT, MIN_EXP: -REAL_MAX_EXP_DEFAULT });

/** Force a state-change notification without mutating anything.
 *  Used by persist.rehydrate() after a bulk replace of HOME +
 *  angle so subscribers redraw even when the new values happen to
 *  equal the old ones. */
export function notify() { _emit(); }

export function setAngle(mode) {
  const m = String(mode).toUpperCase();
  if (!ANGLE_MODES.includes(m)) {
    throw new Error(`Unknown angle mode: ${mode}`);
  }
  if (state.angle === m) return;
  state.angle = m;
  _emit();
}

/** Cycle RAD -> DEG -> GRD -> RAD. */
export function cycleAngle() {
  const i = ANGLE_MODES.indexOf(state.angle);
  setAngle(ANGLE_MODES[(i + 1) % ANGLE_MODES.length]);
}

export function setCoordMode(mode) {
  const m = String(mode).toUpperCase();
  if (!COORD_MODES.includes(m)) {
    throw new Error(`Unknown coordinate mode: ${mode}`);
  }
  if (state.coordMode === m) return;
  state.coordMode = m;
  _emit();
}

/** Cycle RECT -> CYLIN -> SPHERE -> RECT.  Used by the status-line
 *  indicator's click handler so the user can flip modes without
 *  hunting for the RECT/CYLIN/SPHERE ops. */
export function cycleCoordMode() {
  const i = COORD_MODES.indexOf(state.coordMode);
  setCoordMode(COORD_MODES[(i + 1) % COORD_MODES.length]);
}

export const DISPLAY_MODES = Object.freeze(['STD', 'FIX', 'SCI', 'ENG']);

/** Set the number-display mode.  `digits` is required for FIX/SCI/ENG
 *  and ignored for STD.  Subscribers fire so the LCD and annunciator
 *  update in lockstep. */
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

/** Convert a number from the user's current angle mode to radians. */
export function toRadians(x) {
  switch (state.angle) {
    case 'DEG': return x * Math.PI / 180;
    case 'GRD': return x * Math.PI / 200;   // 400 grad == 2π rad
    case 'RAD':
    default:    return x;
  }
}

/** Convert a number from radians to the user's current angle mode. */
export function fromRadians(x) {
  switch (state.angle) {
    case 'DEG': return x * 180 / Math.PI;
    case 'GRD': return x * 200 / Math.PI;
    case 'RAD':
    default:    return x;
  }
}

/* wordsize / binary display base
   STWS sets the binary-integer word width in bits; RCWS reads it.  The
   formatter and BinInt arithmetic both consult `state.wordsize` — setting
   it to 16, for example, makes `#FFFFh #1h +` wrap to `#0h`.  The HP50
   range is 1..64; we clamp silently at the edges (matches the real unit).

   `binaryBase` is the display-only override: once HEX/DEC/OCT/BIN has
   been issued, every BinInt renders in that base, regardless of the
   base the literal was entered in.  Clearing the override (rare) is
   available from setBinaryBase(null) — we don't expose it as a keyboard
   op yet.  Arithmetic results always use the LEFT operand's own .base
   for storage; display is a separate concern. */

export function setWordsize(n) {
  let v = Number(n);
  if (!Number.isFinite(v)) throw new Error(`STWS needs a number, got ${n}`);
  v = Math.trunc(v);
  if (v < WORDSIZE_MIN) v = WORDSIZE_MIN;
  if (v > WORDSIZE_MAX) v = WORDSIZE_MAX;
  if (state.wordsize === v) return;
  state.wordsize = v;
  _emit();
}

export function getWordsize() { return state.wordsize; }

/** The BigInt mask `(1 << ws) - 1` — low-ws bits all set.  Used by
 *  BinInt arithmetic to fold overflow back to the wordsize. */
export function getWordsizeMask() {
  return (1n << BigInt(state.wordsize)) - 1n;
}

export function setBinaryBase(b) {
  if (b === null || b === undefined) {
    if (state.binaryBase === null) return;
    state.binaryBase = null;
    _emit();
    return;
  }
  const s = String(b).toLowerCase();
  if (!BIN_BASES.includes(s)) {
    throw new Error(`setBinaryBase: expected h/d/o/b or null, got ${b}`);
  }
  if (state.binaryBase === s) return;
  state.binaryBase = s;
  _emit();
}

export function getBinaryBase() { return state.binaryBase; }

/* ------------------ textbook (pretty-print) display mode ------------------
   TEXTBOOK switches Symbolic stack rows to 2D SVG rendering (see
   src/rpl/pretty.js).  FLAT returns to flat-text rendering.  The flag
   only affects Symbolic values — everything else still formats the
   same way.  Other cells (cmdline, program bodies, list items, etc.)
   are unaffected; only the top-of-stack Symbolic is swapped.

   We fire a state-change event on toggle so the Display layer can
   re-render immediately. */

export function setTextbookMode(on) {
  const v = !!on;
  if (state.textbookMode === v) return;
  state.textbookMode = v;
  _emit();
}

export function getTextbookMode() { return state.textbookMode; }

/* ------------------ APPROX / EXACT numeric-eval mode ------------------
   setApproxMode(b) flips the flag.  getApproxMode() reports it.  The
   EVAL / simplify path in ops.js consults getApproxMode() before
   folding a `Fn(...)` node to a decimal: in APPROX it folds anything
   that produces a finite Real; in EXACT it only folds when the inputs
   were all integers AND the result is (numerically) an integer itself,
   so `SQRT(9) → 3` still folds but `SQRT(2)` stays symbolic.

   Fires a state-change event so the EXACT/APPROX annunciator (future)
   redraws immediately.  The `→NUM` op (ENTER SHIFT-R) flips to APPROX
   for the span of one EVAL and restores the previous setting on the
   way out — so the user can force-fold without toggling the flag
   globally. */

export function setApproxMode(on) {
  const v = !!on;
  if (state.approxMode === v) return;
  state.approxMode = v;
  _emit();
}

export function getApproxMode() { return state.approxMode; }

/** Flip the current APPROX/EXACT setting.  Used by the future
 *  MODES-menu toggle and by tests. */
export function toggleApproxMode() {
  state.approxMode = !state.approxMode;
  _emit();
}

/* ------------------ CMPLX complex-result mode (flag -103) ------------
   When ON, real-domain ops like LN(-1) and ACOS(2) return the
   principal-branch Complex result instead of throwing.  When OFF, they
   throw "Bad argument value".  SQRT and the inverse hyperbolics are
   unaffected — they already lift to Complex unconditionally.  Fires a
   state-change event so a future MODES-menu toggle can redraw. */

export function setComplexMode(on) {
  const v = !!on;
  if (state.complexMode === v) return;
  state.complexMode = v;
  _emit();
}

export function getComplexMode() { return state.complexMode; }

export function toggleComplexMode() {
  state.complexMode = !state.complexMode;
  _emit();
}

/* ------------------ last-fit model (PREDV / PREDX) ------------------
   The five regression ops (LINFIT / LOGFIT / EXPFIT / PWRFIT) call
   setLastFitModel(kind, a, b) after computing their fit so the user
   can evaluate the same model at a new scalar via PREDV / PREDX
   without re-typing the closed-form expression.  Model kinds map to:

     LIN : y = a + b·x
     LOG : y = a + b·ln(x)
     EXP : y = a · e^(b·x)
     PWR : y = a · x^b

   Invariants: kind is one of the four strings above; a and b are
   plain JS Numbers.  Cleared to `null` by clearLastFitModel() (used
   by tests to keep one test's fit from leaking into the next).
   Emits a state-change event on every mutation. */

export const FIT_KINDS = Object.freeze(['LIN', 'LOG', 'EXP', 'PWR']);

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

export function clearLastFitModel() {
  if (state.lastFitModel === null) return;
  state.lastFitModel = null;
  _emit();
}

/* ---------------------- halted-program stack ------------------------
   HALT/CONT/KILL substrate.  `state.halted` is a convenience view of
   the stack's top, or `null` when the stack is empty.  `haltedStack`
   is the full LIFO stack; each record is a plain object with fields
   `{tokens, ip, length}` (see the `state.halted` comment above).

   HP50 AUR p.2-135 describes a stack of halted programs — CONT
   resumes the most-recently suspended program, and a prior suspension
   remains on the stack to be CONT'd next.  The single-slot observable
   surface (`state.halted`) stays reachable for subscribers that only
   care about "is anything halted?".

   Getters/setters:
     setHalted(h)    — push h on the stack; state.halted = h.  Emits.
     getHalted()     — return the top (= state.halted), or null.
     clearHalted()   — pop one record.  state.halted follows the top
                       of the post-pop stack.  Emits if the top changed.
     clearAllHalted()— drain the whole stack.  Used by tests
                       (test-control-flow.mjs); resetHome() inlines the
                       equivalent drain directly so it can emit exactly once
                       (clearAllHalted() emits too — two _emit() calls would
                       be wrong).
     haltedDepth()   — number of currently-halted programs on the stack
                       (zero = no suspensions).  Used by tests only.
   ------------------------------------------------------------------ */

export function setHalted(h) {
  state.haltedStack.push(h);
  state.halted = h;
  _emit();
}

export function getHalted() { return state.halted; }

/** Close a halted record's generator (if present) so its finally
 *  blocks run — particularly `_popLocalFrame()` inside runArrow.
 *  Calling `gen.return()` sends a "return" signal that propagates
 *  through the full `yield*` delegation chain, running every active
 *  `finally` block and cleanly releasing any compiled-local frames
 *  that were live at the point of suspension.  Safe to call on
 *  records that have no generator field (e.g. test-injected stubs). */
function _closeRecord(record) {
  if (record && record.generator) {
    try { record.generator.return(); } catch (_) { /* ignore */ }
  }
}

/** Remove the top halted record WITHOUT resuming or closing it.
 *  Used by CONT, which needs the live generator to call gen.next().
 *  Returns the popped record (may be null if the stack was empty). */
export function takeHalted() {
  if (state.haltedStack.length === 0) return null;
  const record = state.haltedStack.pop();
  const top = state.haltedStack.length === 0
    ? null
    : state.haltedStack[state.haltedStack.length - 1];
  state.halted = top;
  _emit();
  return record;
}

/** Remove and CLOSE the top halted record (discards the generator).
 *  Used by KILL — the generator's finally blocks run via gen.return()
 *  so any compiled-local frames are properly cleaned up. */
export function clearHalted() {
  if (state.haltedStack.length === 0) return;
  const record = state.haltedStack.pop();
  _closeRecord(record);
  const top = state.haltedStack.length === 0
    ? null
    : state.haltedStack[state.haltedStack.length - 1];
  state.halted = top;
  _emit();
}

export function clearAllHalted() {
  if (state.haltedStack.length === 0 && state.halted === null) return;
  for (const record of state.haltedStack) _closeRecord(record);
  state.haltedStack.length = 0;
  state.halted = null;
  _emit();
}

export function haltedDepth() { return state.haltedStack.length; }

/* ----------------------- PROMPT message slot -----------------------
   HP50 AUR p.2-160: PROMPT pops level 1, displays it in
   the status area, and halts the program (resumable via CONT — same
   substrate HALT uses).  Without UI integration, the "display in the
   status area" half lands here as an observable state slot — `state
   .promptMessage` carries the popped value; UI subscribers that want
   to render a prompt banner read from this slot.

   Setter is called from `evalRange`'s PROMPT branch (see ops.js).
   Clearer is called from CONT / KILL / resetHome so a fresh prompt
   replaces the old one rather than queuing on top of it. */

export function setPromptMessage(v) {
  if (state.promptMessage === v) return;
  state.promptMessage = v;
  _emit();
}

export function getPromptMessage() { return state.promptMessage; }

export function clearPromptMessage() {
  if (state.promptMessage === null) return;
  state.promptMessage = null;
  _emit();
}

/* ----------------------- CAS main variable (VX) ---------------------
   Single string slot holding the Name.id of the current CAS main
   variable.  The VX / SVX ops are thin wrappers around these getters
   and setters — see src/rpl/ops.js.  LAPLACE, ILAP, PREVAL (and
   future DERVX / INTVX / TABVAL / TAYLOR0) fall back to this value
   when their input is multi-free-variable or constant.

   The name must be a non-empty string of characters a name can carry —
   we accept anything the Name() type accepts at construction time and
   let the downstream Name parser worry about keyword collisions.  The
   setter rejects non-string / empty-string input so callers surface a
   consistent "Bad argument value" at their own level. */

export function setCasVx(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`setCasVx: expected a non-empty string, got ${name}`);
  }
  if (state.casVx === name) return;
  state.casVx = name;
  _emit();
}

export function getCasVx() { return state.casVx; }

/** Reset VX to the rpl5050 factory default of `'x'` (lowercase —
 *  deliberate deviation from the HP50, matching our lowercase-default
 *  keyboard).  For tests so one test's SVX call doesn't leak into the
 *  next. */
export function resetCasVx() {
  if (state.casVx === 'x') return;
  state.casVx = 'x';
  _emit();
}

/* ------------------------ CAS modulo (MODSTO) ------------------------
   Single BigInt slot holding the current MODULO state value.  The
   ADDTMOD / SUBTMOD / MULTMOD / POWMOD / DIVMOD / GCDMOD / EXPANDMOD /
   FACTORMOD ops all consult this slot when reducing their result.
   MODSTO is the only writer; the modular ops are pure readers.

   HP50 contract (AUR p.3-150): the input may be any integer or
   integer-valued expression.  Negative values are folded to their
   absolute value, and 0 / 1 are promoted to 2 — the firmware never
   stores a modulus below 2.  We mirror that normalization here so the
   modular ops can assume `casModulo >= 2n`.

   Defaults to 13n on a freshly-booted unit (the HP50 factory default
   per the CAS Modes input form).  The setter rejects non-BigInt input
   so callers surface a consistent error at their level. */

export function setCasModulo(m) {
  if (typeof m !== 'bigint') {
    throw new Error(`setCasModulo: expected BigInt, got ${typeof m}`);
  }
  let n = m < 0n ? -m : m;
  if (n < 2n) n = 2n;
  if (state.casModulo === n) return;
  state.casModulo = n;
  _emit();
}

export function getCasModulo() { return state.casModulo; }

/** Reset MODULO to the HP50 factory default of 13n.  Test isolation. */
export function resetCasModulo() {
  if (state.casModulo === 13n) return;
  state.casModulo = 13n;
  _emit();
}

/* ------------------------ user / system flags ------------------------
   HP50 has 128 user flags (positive numbers 1..128) and 128 system
   flags (negative numbers -1..-128).  Flags are a single bit — set or
   clear — and are manipulated by the SF / CF / FS? / FC? / FS?C /
   FC?C ops in ops.js.  We store them in a single Set<number>, keyed
   by the signed flag number.  Zero is not a legal flag number: the
   ops reject it as Bad argument value.

   No specific system flag has cross-cutting side-effects yet; the set
   is pure bookkeeping so user programs can set, test, and branch on
   flags without erroring out.  Features that need to react to a
   specific flag can consult this Set without changing the API.

   _validFlag() coerces the number and normalises it to an integer in
   [-128, -1] ∪ [1, 128].  Invalid values throw so ops can surface a
   consistent "Bad argument value" to the user. */

function _validFlag(n) {
  const k = Math.trunc(Number(n));
  if (!Number.isFinite(k) || k === 0 || k < -128 || k > 128) {
    throw new Error(`Invalid flag number: ${n}`);
  }
  return k;
}

export function setUserFlag(n) {
  const k = _validFlag(n);
  if (state.userFlags.has(k)) return;
  state.userFlags.add(k);
  _emit();
}

export function clearUserFlag(n) {
  const k = _validFlag(n);
  if (!state.userFlags.has(k)) return;
  state.userFlags.delete(k);
  _emit();
}

export function testUserFlag(n) {
  const k = _validFlag(n);
  return state.userFlags.has(k);
}

/** Reset all flags.  Primarily for tests so one test's flag changes
 *  don't leak into the next. */
export function clearAllUserFlags() {
  if (state.userFlags.size === 0) return;
  state.userFlags.clear();
  _emit();
}

/* ------------------------- realMaxExp ---------------------------- */

export function getRealMaxExp() { return state.realMaxExp; }

/** Set the maximum Real exponent magnitude and forward it to Decimal.
 *  `n` must be a safe integer in [REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX].
 *  Throws a plain Error (caller wraps in RPLError if needed) for
 *  out-of-range values so the error message is consistent whether the
 *  call comes from STMXE or from a test helper. */
export function setRealMaxExp(n) {
  if (!Number.isInteger(n) || n < REAL_MAX_EXP_MIN || n > REAL_MAX_EXP_MAX) {
    throw new Error(
      `realMaxExp must be an integer in [${REAL_MAX_EXP_MIN}, ${REAL_MAX_EXP_MAX}], got ${n}`
    );
  }
  state.realMaxExp = n;
  Decimal.set({ MAX_EXP: n, MIN_EXP: -n });
  _emit();
}

/** For tests: reset realMaxExp to the boot default. */
export function resetRealMaxExp() {
  setRealMaxExp(REAL_MAX_EXP_DEFAULT);
}

/** For tests: reset wordsize + binary-base override to defaults so a
 *  test that twiddled either doesn't leak into the next one. */
export function resetBinaryState() {
  state.wordsize = WORDSIZE_DEFAULT;
  state.binaryBase = null;
  _emit();
}

/* ----------------------------- PRNG -----------------------------
   Seeded Park-Miller minimal-standard LCG shared by RAND, RDZ, and
   RANM.  Seed is any integer in [1, PRNG_MOD-1]; modulus is 2^31 - 1
   and multiplier is 48271.  The HP50's internal RNG is also a seeded
   LCG (different constants, but the API contract is identical: RDZ 0
   re-seeds from a clock source, RDZ n with non-zero n picks a
   deterministic seed).  One PRNG state is shared by all three ops so
   `RDZ 12345 RAND RAND` is reproducible across page reloads, and
   `RDZ 12345 { 2 3 } RANM` produces the same matrix every time.

   Default boot seed: PRNG_DEFAULT (a fixed value) — matches the
   HP50 behavior where a factory-reset unit has a deterministic
   starting RAND sequence.  Tests call `resetPrng()` up front to pin
   the seed to this same default so one test's random draw doesn't
   leak a changed seed into the next. */

const PRNG_MOD = 2147483647n;       // 2^31 - 1 (Mersenne prime)
const PRNG_MULT = 48271n;
const PRNG_DEFAULT = 741n;          // arbitrary non-zero boot seed

// state.prngSeed is a BigInt in [1, PRNG_MOD-1].  Kept in BigInt form
// because the multiplication 48271 * seed overflows 32-bit signed
// before the mod.  Conversion to Number happens only when producing a
// [0, 1) draw for RAND or an indexed draw for RANM.
state.prngSeed = PRNG_DEFAULT;

/** Seed the PRNG.  Non-zero integer seeds deterministically; seed 0
 *  re-seeds from Date.now() (HP50 convention: RDZ 0 is "randomize from
 *  clock").  Values are reduced modulo (PRNG_MOD-1) and shifted into
 *  [1, PRNG_MOD-1] so the zero fixed-point of the LCG is avoided.
 *  Accepts Number or BigInt input.  Emits a state-change event. */
export function seedPrng(n) {
  let b;
  if (typeof n === 'bigint') b = n;
  else {
    const k = Number(n);
    if (!Number.isFinite(k)) throw new Error(`seedPrng: not a number: ${n}`);
    b = BigInt(Math.trunc(k));
  }
  if (b === 0n) {
    // HP50: "RDZ 0" uses the clock as a seed source.  Date.now() is
    // a JS ms timestamp — reduce into the LCG range.
    b = BigInt(Date.now());
  }
  // Keep the seed strictly in [1, PRNG_MOD-1].  The LCG has a zero
  // fixed-point, so a literal 0 after the modulo must be bumped.
  let s = ((b % (PRNG_MOD - 1n)) + (PRNG_MOD - 1n)) % (PRNG_MOD - 1n);
  if (s === 0n) s = 1n;
  state.prngSeed = s;
  _emit();
}

/** Advance the PRNG one step and return the new seed (BigInt). */
function _prngAdvance() {
  state.prngSeed = (state.prngSeed * PRNG_MULT) % PRNG_MOD;
  return state.prngSeed;
}

/** Draw a uniform Real in [0, 1).  Used by RAND and by RANM's
 *  mapping to integers in [-9, 9]. */
export function nextPrngUnit() {
  const s = _prngAdvance();
  // s ∈ [1, PRNG_MOD-1] → divide by PRNG_MOD to land in (0, 1).
  // Convert through Number late so the BigInt/int range is preserved.
  return Number(s) / Number(PRNG_MOD);
}

/** Draw a uniform integer in [-9, 9].  Used by RANM.  19-value
 *  distribution via floor(u * 19) - 9. */
export function nextPrngInt9() {
  return Math.floor(nextPrngUnit() * 19) - 9;
}

/** For tests: pin the PRNG back to its boot default so one test's
 *  draws don't leak into the next. */
export function resetPrng() {
  state.prngSeed = PRNG_DEFAULT;
  _emit();
}

/** Exposed for RCL-style introspection and tests. */
export function getPrngSeed() { return state.prngSeed; }

/* --------------------------- variables --------------------------- */

/** Write `value` into the current directory under name `id`.  Fires
 *  a state-change event so the UI can refresh any VARS menu.
 *
 *  HP50 protects subdirectories from being overwritten by STO: if the
 *  name in the current directory already refers to a Directory, the
 *  store fails.  We throw a plain Error('Directory not allowed: <id>');
 *  ops.js STO wraps it into RPLError so IFERR can catch and ERRN can
 *  classify.  (Writing a Directory value into a name is also refused
 *  — entries.set for directory creation goes through makeSubdir.) */
export function varStore(id, value) {
  const key = String(id);
  const existing = state.current.entries.get(key);
  if (existing && existing.type === TYPES.DIRECTORY) {
    throw new Error(`Directory not allowed: ${key}`);
  }
  state.current.entries.set(key, value);
  _emit();
}

/** Rename `oldId` to `newId` within the current directory.
 *  Preserves insertion order by rebuilding the Map in place.
 *  Throws if oldId is absent, newId already exists (and is a different
 *  entry), or newId is not a valid HP name.  For directories the
 *  internal .name field is updated to match. */
export function renameCurrentEntry(oldId, newId) {
  const oldKey = String(oldId);
  const newKey = String(newId);
  if (oldKey === newKey) return;
  const dir = state.current;
  if (!dir.entries.has(oldKey)) throw new Error(`Undefined name: ${oldKey}`);
  if (dir.entries.has(newKey)) throw new Error(`Name conflict: ${newKey}`);
  // Rebuild the Map so the entry keeps its original insertion position.
  const rebuilt = new Map();
  for (const [k, v] of dir.entries) {
    if (k === oldKey) {
      rebuilt.set(newKey, v);
      if (v && v.type === TYPES.DIRECTORY) v.name = newKey;
    } else {
      rebuilt.set(k, v);
    }
  }
  dir.entries = rebuilt;
  _emit();
}

/** Read `id` from the current directory.  Returns undefined if absent.
 *  (HP50 RCL walks up to the parent chain; we follow suit.) */
export function varRecall(id) {
  const key = String(id);
  for (let d = state.current; d; d = d.parent) {
    if (d.entries.has(key)) return d.entries.get(key);
  }
  return undefined;
}

/** Remove `id` from the current directory.  Returns true if it
 *  existed.  Only touches the current dir (HP50 PURGE semantics).
 *
 *  HP50 refuses to PURGE a non-empty subdirectory.  Empty subdirs are
 *  purgeable.  We throw a plain Error('Directory not empty: <id>')
 *  for non-empty ones; ops.js PURGE wraps it into RPLError. */
export function varPurge(id) {
  const key = String(id);
  const existing = state.current.entries.get(key);
  if (existing && existing.type === TYPES.DIRECTORY && existing.entries.size > 0) {
    throw new Error(`Directory not empty: ${key}`);
  }
  const gone = state.current.entries.delete(key);
  if (gone) _emit();
  return gone;
}

/** A sorted list of variable name-ids in the current directory.
 *  The sort is a stable alphabetical ordering of the ids.  The HP50
 *  hardware returns names in the directory's internal (insertion /
 *  ORDER-arranged) order; this sorted view is for UI callers that
 *  want alphabetical display.  VARS itself uses `varOrder()` below
 *  so ORDER's reshuffle is visible on the stack. */
export function varList() {
  return [...state.current.entries.keys()].sort();
}

/** The internal (insertion / ORDER-set) order of variable name-ids in
 *  the current directory — no sort.  ORDER mutates this sequence.
 *  VARS pushes in this order so ORDER's reshuffle is visible on the
 *  stack. */
export function varOrder() {
  return [...state.current.entries.keys()];
}

/** Move a single entry within the current directory: place `name`
 *  immediately before `beforeName`, or at the end if `beforeName` is
 *  null / undefined.  Used by the Files tab's drag-to-reorder.  No-op
 *  if `name` is missing, if the move would not change the order, or
 *  if `beforeName` is supplied but doesn't refer to a sibling.  Map
 *  doesn't expose an in-place reorder so we rebuild the entries Map
 *  with the new sequence — same approach `reorderCurrentEntries`
 *  takes for the bulk ORDER op. */
export function reorderCurrentEntry(name, beforeName) {
  const dir = state.current;
  const key = String(name);
  if (!dir.entries.has(key)) return;
  const keys = [...dir.entries.keys()];
  const fromIdx = keys.indexOf(key);
  let targetIdx;
  if (beforeName == null) {
    targetIdx = keys.length;                     // append after removal
  } else {
    const beforeKey = String(beforeName);
    const beforeIdx = keys.indexOf(beforeKey);
    if (beforeIdx < 0) return;
    targetIdx = beforeIdx;
  }
  // After splicing out `name`, indices > fromIdx shift down by 1; pin
  // the user's intent ("before this row") through that shift.
  if (targetIdx > fromIdx) targetIdx--;
  if (targetIdx === fromIdx) return;
  keys.splice(fromIdx, 1);
  keys.splice(targetIdx, 0, key);
  const rebuilt = new Map();
  for (const k of keys) rebuilt.set(k, dir.entries.get(k));
  dir.entries = rebuilt;
  _emit();
}

/** Reorder the current directory's entries so that `names` appears
 *  first in that exact order, followed by any remaining entries in
 *  their previous relative order.  Unknown names in `names` are
 *  silently ignored (matches HP50 ORDER semantics).  A duplicate
 *  within `names` is taken once at first position (later duplicates
 *  are discarded — the "dedupe keeping earliest" behavior that ORDER
 *  effectively has on a real unit too). */
export function reorderCurrentEntries(names) {
  const dir = state.current;
  const existing = dir.entries;
  if (existing.size === 0) return;
  const seen = new Set();
  const newOrder = [];
  for (const n of names) {
    const key = String(n);
    if (seen.has(key)) continue;
    if (!existing.has(key)) continue;
    seen.add(key);
    newOrder.push(key);
  }
  // Append the rest in their existing relative order.
  for (const key of existing.keys()) {
    if (seen.has(key)) continue;
    newOrder.push(key);
  }
  const rebuilt = new Map();
  for (const key of newOrder) rebuilt.set(key, existing.get(key));
  dir.entries = rebuilt;
  _emit();
}

/** The slash-path string from HOME to the current directory, rendered
 *  HP50-style: `{ HOME A }` etc.  Returned as an array of segment
 *  names with HOME first. */
export function currentPath() {
  const out = [];
  for (let d = state.current; d; d = d.parent) out.unshift(d.name);
  return out;
}

/** Reset home to an empty directory.  Primarily for tests.
 *  Clears both HOME's entries AND drops any lingering subdirectories by
 *  snapping `current` back to HOME.  A resetHome() in one test must not
 *  leak subdirectory state into the next.
 *
 *  Also drains the suspended-execution stack so a HALT'd program from
 *  the previous test cannot be CONT'd into from the next.  Matches the
 *  "clean slate" intent of resetHome — a stale halted slot is a subtle
 *  hazard for the HALT/CONT substrate.  Both the scalar `state.halted`
 *  view and the backing `haltedStack` are cleared so no record survives. */
export function resetHome() {
  // Close every halted generator before discarding so their finally
  // blocks (_popLocalFrame in runArrow, etc.) run and clean up any
  // compiled-local frames still live on _localFrames.
  for (const record of state.haltedStack) _closeRecord(record);
  _home.entries.clear();
  state.current = _home;
  state.halted = null;                   // no-emit direct reset
  state.haltedStack.length = 0;          // drain the LIFO too
  state.promptMessage = null;            // clear any PROMPT banner
  _emit();
}

/* ---------------------------- navigation ----------------------------

   The HP 50g calculator organises variables in a tree of directories
   rooted at HOME.  The user moves between them with UPDIR / HOME and
   creates new ones with CRDIR.  PATH reports the full path from HOME
   to the current directory.

   Our data model already has `current` + parent pointers; the helpers
   below mutate `state.current` and emit exactly one state event per
   change, so the UI's path annunciator refreshes automatically. */

/** Set the current directory to HOME.  No-op if already there. */
export function goHome() {
  if (state.current === _home) return;
  state.current = _home;
  _emit();
}

/** Move the current directory to its parent.  At HOME this is a silent
 *  no-op — matches the HP50, where UPDIR from HOME does nothing rather
 *  than erroring. */
export function goUp() {
  const p = state.current.parent;
  if (!p) return;
  state.current = p;
  _emit();
}

/** Descend into the named subdirectory of the current directory.
 *  Returns true on success, false if no such subdirectory exists
 *  (the caller — typically a VARS soft-key press — can surface that
 *  as an error).  A value at that name that isn't a Directory is also
 *  a false, so we never try to "cd" into a Real. */
export function goInto(id) {
  const key = String(id);
  const next = state.current.entries.get(key);
  if (!next || next.type !== TYPES.DIRECTORY) return false;
  state.current = next;
  _emit();
  return true;
}

/** Set the current directory to an arbitrary Directory value.  Used by
 *  EVAL so that evaluating a name bound to a directory — or a bare
 *  directory value — navigates into it regardless of where the dir
 *  sits in the HOME tree (varRecall walks ancestors, so the target
 *  isn't always a direct child of state.current). */
export function enterDirectory(dir) {
  if (!dir || dir.type !== TYPES.DIRECTORY) return false;
  if (state.current === dir) return true;
  state.current = dir;
  _emit();
  return true;
}

/** Create a new empty subdirectory named `id` in the current directory.
 *  HP50 CRDIR leaves the user in the OLD directory (it does NOT descend
 *  into the new one).  Returns the freshly-created Directory.  Throws
 *  if the name is already used by any variable — HP50 errors with
 *  "Name already used in this directory". */
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

/** Walk a HOME-rooted path of segment names and return the Directory at
 *  the end, or `null` if any segment is missing or doesn't refer to a
 *  Directory.  Accepts either `['HOME', 'A', 'B']` (the shape returned
 *  by `currentPath()`) or `['A', 'B']` (no leading HOME) — both root at
 *  state.home.  An empty array also lands on HOME.
 *
 *  Used by the Files tab's Move action to resolve the user's typed
 *  destination into a live Directory before transplanting an entry. */
export function getDirectoryByPath(segments) {
  if (!Array.isArray(segments)) return null;
  let i = 0;
  // Accept a leading 'HOME' segment to match what `currentPath()`
  // returns; everything below the root walks via .entries.
  if (segments.length > 0 && segments[0] === state.home.name) i = 1;
  let cur = state.home;
  for (; i < segments.length; i++) {
    const seg = String(segments[i]);
    if (seg.length === 0) continue;                    // tolerate '//' typos
    const next = cur.entries.get(seg);
    if (!next || next.type !== TYPES.DIRECTORY) return null;
    cur = next;
  }
  return cur;
}

/** Move an entry from the current directory to `targetDir`, preserving
 *  the value's identity (no copy / no re-encode).  The entry is
 *  appended to the target's insertion order, matching what the Files
 *  tab expects ("the order they were added").
 *
 *  Throws when:
 *    - the source entry doesn't exist in the current directory
 *    - `targetDir` isn't a Directory value
 *    - `targetDir` already has an entry with the same name
 *    - the entry IS a Directory and the target sits inside it
 *      (would orphan the parent chain)
 *
 *  When the moved entry is itself a Directory, its `.parent` pointer
 *  is re-linked so `goUp()` from inside it lands on the new parent.
 *  No state change happens until every guard has passed — failures
 *  leave the tree untouched. */
export function moveCurrentEntry(name, targetDir) {
  const key = String(name);
  const src = state.current;
  if (!src.entries.has(key)) {
    throw new Error(`Undefined name: ${key}`);
  }
  if (!targetDir || targetDir.type !== TYPES.DIRECTORY) {
    throw new Error(`Bad target: not a directory`);
  }
  if (targetDir === src) {
    // No-op move; emit nothing rather than reorder.
    return;
  }
  if (targetDir.entries.has(key)) {
    throw new Error(`Name conflict: ${key}`);
  }
  const value = src.entries.get(key);
  // Disallow dropping a directory into itself / into one of its
  // descendants — that would build a cycle and lose the parent chain.
  if (value && value.type === TYPES.DIRECTORY) {
    for (let d = targetDir; d; d = d.parent) {
      if (d === value) {
        throw new Error(`Cannot move ${key} into itself`);
      }
    }
  }
  src.entries.delete(key);
  targetDir.entries.set(key, value);
  if (value && value.type === TYPES.DIRECTORY) {
    value.parent = targetDir;
  }
  _emit();
}

/* ---------------------------- last error ----------------------------

   HP50 keeps a single "last error" slot the user can inspect after an
   IFERR trap fires.  ERRM returns the message string, ERRN returns the
   error number.  On a real unit the number is a 5-digit hex Binary
   Integer; we return a plain Integer for now — the shape can narrow
   later without touching user-facing call sites.

   Not emitted through _emit(): these are queried synchronously by
   programs, and no UI annunciator today reflects them.  If one ever
   does (e.g. an on-screen "E" flag), switch this to _emit() then. */

/** A best-effort mapping of canonical RPLError messages to HP50-ish
 *  error numbers.  Unknown messages map to 0 — treat ERRN's return as
 *  stable for ops we've catalogued and a sentinel otherwise.  The
 *  precise HP50 codes are in the Advanced User's Reference Manual
 *  (§D) and can be refined once we spot-check them against the PDF. */
const _ERROR_NUMBERS = Object.freeze({
  'Too few arguments':    0x201,
  'Bad argument type':    0x202,
  'Bad argument value':   0x204,
  // 0x303 (Division by zero) vs 0x305 (Infinite result) — the HP50
  // splits these along integer-vs-float lines.  BinInt / 0 raises
  // 0x303 since the result can't be represented in the integer type;
  // Real / 0 raises 0x305 since IEEE-754 would otherwise yield
  // ±Infinity which RPL doesn't carry as a number.
  'Division by zero':     0x303,
  'Infinite result':      0x305,
  // Directory-protection errors — codes chosen to fit the HP50
  // "variable / directory" error family without claiming specific
  // manual entries; swap in canonical codes once the Advanced User's
  // Reference §D is spot-checked.
  'Name conflict':        0x501,
  'Directory not allowed':0x502,
  'Directory not empty':  0x503,
});

export function setLastError(err) {
  const raw = (err && err.message) ? String(err.message) : String(err);
  // The dispatcher prefixes op errors with `COMMAND: ` (e.g.
  // `+: Too few arguments`) so the user can see which command failed.
  // Strip that prefix before classifying so both `Too few arguments`
  // and `+: Too few arguments` map to the same error number.
  //
  // We also store the stripped body as the canonical `message` field
  // so ERRM returns the bare HP50 error text ("Infinite result", not
  // "/: Infinite result"); the HP50 AUR shows ERRM as yielding the
  // "error message" only, without the dispatcher's command-name
  // wrapper.  The raw form is still available on `rawMessage` for
  // anyone who wants it (debugger UI, trace logs).
  const m = raw.match(/^[^\s:]+:\s(.+)$/);
  const body = m ? m[1] : raw;
  // Pick a code from the prefix of the message — "Undefined name: X" should
  // share a code with plain "Undefined name".
  let number = 0;
  for (const [key, code] of Object.entries(_ERROR_NUMBERS)) {
    if (body === key || body.startsWith(key + ':') ||
        raw === key || raw.startsWith(key + ':')) {
      number = code; break;
    }
  }
  // Special-cased prefixes that are generated dynamically.
  if (number === 0 &&
      (body.startsWith('Undefined name') || raw.startsWith('Undefined name'))) {
    number = 0x204;
  }
  state.lastError = { message: body, rawMessage: raw, number };
}

export function clearLastError() {
  state.lastError = null;
}

export function getLastError() {
  return state.lastError;
}

/** Write a verbatim {message, number} record (or null) back into the
 *  last-error slot without going through setLastError's message
 *  classifier.  Used by nested IFERR to restore the outer trap's view
 *  after an inner IFERR has temporarily owned the slot. */
export function restoreLastError(rec) {
  state.lastError = rec;
}

/* Multi-level UNDO for VARIABLE + DIRECTORY state.

   Companion to Stack's saveForUndo/undo/redo/hasUndo/hasRedo/
   clearUndo.  Snapshots the HOME tree (deep clone: directories cloned,
   leaf RPL values shared by reference since RPL values are
   immutable-by-convention) and the path from HOME to the current
   directory.  Restoring rebuilds HOME's entries in place (so consumers
   holding `state.home` stay valid) and re-navigates to the same path.

   saveVarStateForUndo() pushes a fresh snapshot onto the undo history
   and clears the redo history (per standard "new action invalidates
   redo" semantics).  undoVarState() pops the most recent snapshot,
   stashes the CURRENT live state onto the redo history, and restores
   the popped snapshot.  redoVarState() is the inverse.  hasVarUndo()
   / hasVarRedo() report availability; clearVarUndo() drops both
   history lists (called on error paths alongside Stack.clearUndo so
   the two halves stay in lock-step). */

/** Deep-clone a Directory sub-tree.  Directories are recreated;
 *  leaf values are shared by reference (RPL values are immutable). */
function _cloneDir(dir, newParent = null) {
  const clone = Directory({ name: dir.name, parent: newParent });
  for (const [key, value] of dir.entries) {
    if (value && value.type === TYPES.DIRECTORY) {
      clone.entries.set(key, _cloneDir(value, clone));
    } else {
      clone.entries.set(key, value);
    }
  }
  return clone;
}

/** Walk the path `names` from `root` through `.entries.get(name)`,
 *  expecting each step to resolve to a sub-Directory.  Returns the
 *  landed directory, or null if any step misses. */
function _walkPath(root, names) {
  let cur = root;
  for (const n of names) {
    const next = cur.entries.get(n);
    if (!next || next.type !== TYPES.DIRECTORY) return null;
    cur = next;
  }
  return cur;
}

/** Path of names from `state.home` to `state.current`, excluding
 *  HOME itself.  Empty array when current IS home. */
function _pathNamesToCurrent() {
  const names = [];
  for (let d = state.current; d && d !== _home; d = d.parent) {
    names.unshift(d.name);
  }
  return names;
}

/** Rebuild state.home's entries from a snapshot Directory.  Keeps
 *  state.home's identity stable (many callers close over it).
 *  Re-parents freshly-cloned sub-directories to state.home. */
function _repopulateHome(snapHome) {
  // Make a FRESH clone of the snapshot so the slot stays a
  // time-capsule that's safe to restore again (undoVarState is a swap
  // so we mustn't alias live and saved trees).
  const fresh = _cloneDir(snapHome);
  state.home.entries.clear();
  for (const [k, v] of fresh.entries) {
    if (v && v.type === TYPES.DIRECTORY) v.parent = state.home;
    state.home.entries.set(k, v);
  }
}

/** History stacks.  Each entry is { home: clonedDir, path: [names] }.
 *  _undo is oldest-first, newest last; saveVarStateForUndo pushes to
 *  it and clears _redo.  undoVarState pops _undo and pushes onto _redo;
 *  redoVarState is the inverse. */
let _varUndoStack = [];
let _varRedoStack = [];

/** Cap on the history depth.  Matches Stack.UNDO_MAX. */
const VAR_UNDO_MAX = 100;

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
