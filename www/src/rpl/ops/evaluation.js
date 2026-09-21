import { setHalted, setApproxMode, getApproxMode, getLastError, clearLastError } from '../state.js';
import { RPLAbort, RPLError } from '../stack.js';
import { Str, BinaryInteger, isInteger, isBinaryInteger, isReal, Program, isString, Integer } from '../types.js';
import { register, OPS } from './registry.js';
import { _driveGen, _evalValueGen, _localFrames, _truncateLocalFrames, runIft, runIfte } from './internal.js';



register('EVAL', (s) => {
  // Snapshot AFTER the pop so that on error the EVAL'd value stays
  // popped — only the body's partial pushes get unwound.  HP50-fidelity
  // user expectation: pressing a soft key on a buggy program (or running
  // `« 1 0 / » EVAL` directly) leaves the program *gone*, not waiting
  // on level 1 to be pressed again.  The same shape applies to every
  // EVAL path: entry-line `EVAL`, soft-key VARS / CST press (the
  // surrounding `safeRun` in app.js takes a pre-push snapshot so the
  // outer rollback is consistent with this inner one), `→NUM`, DBUG,
  // and `'NAME' EVAL` on a stored Program.
  //
  // RPLAbort (thrown by ABORT) is deliberately NOT restored: HP50
  // ABORT preserves stack state at the point of the abort rather than
  // rewinding to pre-pop, so we let the signal pass through untouched.
  // The Program is consumed in the ABORT case as well.
  //
  // HALT inside a Program is handled via the generator mechanism:
  //   1. evalRange is a generator; it yields when a HALT token is hit.
  //   2. _evalValueGen wraps Program/Name/Tagged dispatch in a generator
  //      that `yield*`s evalRange so the yield reaches the driver loop
  //      below intact.
  //   3. EVAL drives _evalValueGen with gen.next().  Tagged-wrapped
  //      Programs and Name-on-stack values lift HALT through their
  //      wrappers so all semantically-transparent program references
  //      suspend cleanly.
  //   4. If the generator yields (not done), the live generator is stored
  //      in state.haltedStack via setHalted.  We do NOT truncate
  //      _localFrames — the generator is still live and any → frames
  //      it pushed are still needed.
  //   5. CONT calls gen.next() to resume from exactly where HALT left off.
  //   The generator mechanism captures all structural context (FOR
  //   counter, IF branch, → locals) automatically, so HALT works at
  //   any structural depth.
  //
  // `isSubProgram=false` is passed to _evalValueGen because the body
  // here is the *outer* program from the SST/DBUG perspective — the
  // entry point, not a nested call.  This keeps `_insideSubProgram`
  // unflipped at the entry so SST yields per-token at the outer level
  // and preserves SST↓ step-into semantics for any sub-programs the body
  // reaches via Name lookup.  See `_evalValueGen`'s docstring for the
  // full rationale.
  //
  // Symbolic / Numeric / String / List / Vector values fall through
  // _evalValueGen's tail to _evalValueSync — they cannot HALT, so the
  // generator returns done=true on the first .next() call.
  //
  // _localFrames safety net: truncate to framesAtEntry only when the
  // generator finishes (done=true) or throws.  While halted, leave the
  // frames intact so the generator can see them on resume.
  const framesAtEntry = _localFrames.length;
  let halted = false;
  let snap = null;
  try {
    const v = s.pop();
    // Snapshot is taken AFTER the pop.  If the pop itself threw (empty
    // stack), `snap` stays null and the catch below skips restore — the
    // pop's natural failure semantics already left the stack intact.
    snap = s.save();
    const gen = _evalValueGen(s, v, 0, /* isSubProgram = */ false);
    const result = gen.next();
    if (!result.done) {
      // Suspended at HALT — store live generator, leave frames.
      halted = true;
      setHalted({ generator: gen });
      return;
    }
  } catch (e) {
    if (!(e instanceof RPLAbort) && snap !== null) s.restore(snap);
    throw e;
  } finally {
    if (!halted) _truncateLocalFrames(framesAtEntry);
  }
}, { category: 'Evaluation / program', categoryOrder: 0, label: "EVAL" });


/* ------------------------------------------------------------------
   APPROX / EXACT mode toggles + →NUM forced-approximation.

   HP50 flag -105 controls whether numeric ops fold transcendentals.
   `APPROX` (flag SET) folds `SQRT(2)` to 1.41421356237; `EXACT` (flag
   CLEAR) leaves it symbolic.  The web calculator boots in APPROX;
   `EXACT` is the "call me when you actually need a number" mode.

   `→NUM` (SHIFT-R ENTER on the physical unit) forces APPROX for a
   single EVAL and restores the previous setting.  Users in EXACT mode
   reach for →NUM when they want a decimal without changing the global
   flag.
   ------------------------------------------------------------------ */
register('APPROX', () => { setApproxMode(true); }, { category: 'Evaluation / program', categoryOrder: 4, label: "APPROX" });

register('EXACT',  () => { setApproxMode(false); }, { category: 'Evaluation / program', categoryOrder: 5, label: "EXACT" });


register('→NUM', (s, entry) => {
  // Force APPROX mode for the span of one EVAL, then restore whatever
  // the user had set.  Use try/finally so a domain error inside EVAL
  // still leaves the mode flag the way we found it.
  const prev = getApproxMode();
  setApproxMode(true);
  try {
    OPS.get('EVAL').fn(s, entry);
  } finally {
    setApproxMode(prev);
  }
}, { category: 'Evaluation / program', categoryOrder: 1, label: "→NUM" });


/* ------------------------------------------------------------------
   Stack-based conditionals: IFT, IFTE.

   IFT   ( test action -- )       test true  → EVAL action
                                  test false → drop both
   IFTE  ( test t-act f-act -- )  test true  → EVAL t-act
                                  test false → EVAL f-act

   "EVAL" here means the full evaluator: a Program runs, a Name
   auto-recalls, a number pushes itself.  This is what HP50 users
   expect — IFTE on a pair of Reals is effectively a value-select.
   ------------------------------------------------------------------ */

// Drive the generator flavor (`runIft` / `runIfte`) so the program-body
// intercept in `evalRange` and this Name-dispatch fallback share the
// same evaluation path.  `_driveGen` rejects any yield with the
// IFT/IFTE caller label — HALT/PROMPT inside an action reached via
// `'IFT' EVAL` (sync, not body-intercept) throws
// `HALT: cannot suspend inside IFT action`.  The outer snap/restore
// preserves operand rollback on the HALT-rejection path:
// `gen.return()` runs only finally blocks, not catch, so the helper's
// own snap/catch can't restore here.
register('IFT', (s) => {
  const snap = s.save();
  try {
    _driveGen(runIft(s, 0), 'IFT action');
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}, { category: 'Evaluation / program', categoryOrder: 6, label: "IFT" });


register('IFTE', (s) => {
  const snap = s.save();
  try {
    _driveGen(runIfte(s, 0), 'IFTE action');
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}, { category: 'Evaluation / program', categoryOrder: 7, label: "IFTE" });


/* ------------------------------------------------------------------
   Error-introspection ops: ERRM / ERRN / ERR0.

   IFERR's THEN clause is the natural home for these — they read the
   last-error slot written when the trap caught.  On an HP50 the slot
   persists until the next ERR0 (or the next caught error), which is
   what we do here; calling ERRM / ERRN outside an IFERR trap is legal
   and yields the most recent caught error (empty string / 0 if none).

     ERRM   ( -- string )   the last error's message text
     ERRN   ( -- integer )  the last error's number (see state.js
                            _ERROR_NUMBERS for the current map — 0
                            for unknown / none)
     ERR0   ( -- )          clear the last-error slot
   ------------------------------------------------------------------ */

register('ERRM', (s) => {
  const le = getLastError();
  s.push(Str(le ? le.message : ''));
}, { category: 'Evaluation / program', categoryOrder: 8, label: "ERRM" });


register('ERRN', (s) => {
  // HP50: ERRN returns a Binary Integer in hex (e.g. #502h for
  // "Directory not allowed").  The stack shows `#502h` directly,
  // matching what the Advanced User's Reference uses as the
  // canonical error form.
  //
  // `le.number === 0` when no classification matched (unknown error,
  // or no error since the last ERR0) — still emit it as `#0h` so the
  // stack shape is stable; a caller who wants the numeric value can
  // `B→R` (future) or compare against `#0h` directly.
  const le = getLastError();
  s.push(BinaryInteger(le ? le.number : 0, 'h'));
}, { category: 'Evaluation / program', categoryOrder: 9, label: "ERRN" });


register('ERR0', () => {
  clearLastError();
}, { category: 'Evaluation / program', categoryOrder: 10, label: "ERR0" });


/* ----------------------------------------------------------------
   →PRG — compose a Program from N level-1 tokens.

   Stack signature:  t1 … tn  n  →  « t1 … tn »

   Inverse of OBJ→ on a Program.  N is an Integer, Real, or
   BinaryInteger-shaped non-negative count; zero is legal (produces
   an empty program `« »`).  Any stack value may be a token: the
   parser emits a flat list of Name / Integer / Real / Complex /
   Str / RList / Vector / Matrix / Program / Tagged / Symbolic /
   Unit / BinaryInteger values and any of those can appear in a
   program body, so we don't validate the token kind here.

   Aliases:
     →PRG   (canonical, Unicode arrow)
     ->PRG  (ASCII fallback for keyboards that can't produce →)

   HP50 AUR §21.  Pairs with `→STR` / `STR→` for code-as-data work,
   and with OBJ→ for metaprogramming loops of the shape
   `« obj OBJ→ ... transform ... →PRG »`.
   ---------------------------------------------------------------- */
function _toCountIdx(v) {
  if (isInteger(v))              return Number(v.value);
  if (isBinaryInteger(v))        return Number(v.value);
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}

register('→PRG', (s) => {
  const cv = s.pop();
  const n = _toCountIdx(cv);
  if (n < 0) throw new RPLError('Bad argument value');
  if (n === 0) { s.push(Program([])); return; }
  const items = s.popN(n);
  s.push(Program(items));
}, { category: 'Evaluation / program', categoryOrder: 3, label: "→PRG" });


register('NUM', (s) => {
  const v = s.pop();
  if (!isString(v)) throw new RPLError('Bad argument type');
  if (v.value.length === 0) throw new RPLError('Bad argument value');
  const code = v.value.codePointAt(0);
  s.push(Integer(BigInt(code)));
}, { category: 'Evaluation / program', categoryOrder: 2, label: "NUM" });


/* --------------- DOERR — raise a user-supplied error -----------------
   HP50 AUR §14.2.

     DOERR ( S → ) raise an RPL error whose message is the string S.
     DOERR ( n → ) raise an error whose number is `n` — looks up the
                   canonical error-message text if the number is
                   known; otherwise emits `Error: #Nh` as a fallback.
     DOERR ( 0 → ) no-op.  HP50 uses "DOERR 0" to mean "clear state
                   and do nothing"; we treat it the same.

   Ideal partners: IFERR (the trap) and ERRM/ERRN/ERR0 (introspection).
   A DOERR raised inside an IFERR trap is routed to the THEN clause
   with the last-error slot populated exactly as if a built-in op had
   failed.
   ----------------------------------------------------------------- */

register('DOERR', (s) => {
  const [v] = s.popN(1);
  if (isString(v)) {
    if (v.value === '') throw new RPLError('Interrupted');
    throw new RPLError(v.value);
  }
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    let code;
    if (isInteger(v))            code = Number(v.value);
    else if (isReal(v))          code = v.value.toNumber();
    else                         code = Number(v.value);
    if (code === 0) return;                   // DOERR 0 = clear / no-op
    // Reverse-lookup the canonical message for known codes; fall back
    // to a generic hex form otherwise.  The reverse table is built on
    // demand each call — cheap, ops.js already owns the forward table
    // indirectly via setLastError.
    const known = {
      0x201: 'Too few arguments',
      0x202: 'Bad argument type',
      0x204: 'Bad argument value',
      0x303: 'Division by zero',
      0x305: 'Infinite result',
      0x501: 'Name conflict',
      0x502: 'Directory not allowed',
      0x503: 'Directory not empty',
    };
    const msg = known[code] || `Error: #${code.toString(16).toUpperCase()}h`;
    throw new RPLError(msg);
  }
  throw new RPLError('Bad argument type');
}, { category: 'Evaluation / program', categoryOrder: 11, label: "DOERR" });
