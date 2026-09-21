import { RPLAbort, RPLError } from '../stack.js';
import { getHalted, clearPromptMessage, takeHalted, clearHalted } from '../state.js';
import { register } from './registry.js';
import { _localFrames, _stepOnce, _truncateLocalFrames, pushSuspendedGenerator, clearPendingSuspend } from './internal.js';



/* --------------- ABORT — program-interrupt primitive ---------------
 * AUR p.1-27.  ABORT unwinds the currently-executing program (all
 * nested IF/WHILE/CASE/etc frames) without taking any stack argument
 * and without producing a trappable RPLError — IFERR cannot catch it.
 *
 * Implementation: throws an RPLAbort (subclass of Error but NOT
 * RPLError).  `evalRange`/`runControl` have no try/catch of their own,
 * so the signal bubbles straight to the outer EVAL, whose snapshot-
 * restore catch has been taught to let RPLAbort pass through without
 * restoring — ABORT preserves stack state at the point of the abort,
 * matching HP50 behavior.  The top-level entry.js safeRun loop treats
 * RPLAbort as a clean program termination (no `flashError`, no
 * rollback) — see the EVAL catch below and the entry.js integration
 * we'll add alongside the UI-side display work.
 */
register('ABORT', () => {
  throw new RPLAbort('Abort');
}, { category: 'Control flow / debug', categoryOrder: 0, label: "ABORT" });


/* --------------- HALT / CONT / KILL / RUN ---------------------------
 * HP50 AUR p.2-135 / p.2-52 / p.2-140 / p.2-177.  The suspended-
 * execution substrate: HALT pauses the running program, CONT resumes
 * it where it left off, KILL clears the suspension without resuming.
 * RUN is a debug-aware resume — without DBUG active, it behaves
 * identically to CONT (AUR p.2-177).
 *
 * HALT is intercepted by `evalRange` before it can dispatch to an op
 * — it needs the token list and instruction pointer, which `evalRange`
 * has and a plain op body would not.  See the `id === 'HALT'` branch
 * in evalRange for the capture code.  The body here exists only so
 * that `HALT EVAL` (evaluating the bare name from the stack, not from
 * inside a program body) produces the same "HALT used outside a
 * program" semantics HP50 implements.
 *
 * CONT reads the top of `state.haltedStack` (exposed as `state.halted`
 * for single-slot back-compat), pops it, and resumes the saved
 * generator.  No token-list copy or rehydration — resumption is O(1)
 * in program size.
 *
 * KILL clears the TOP halted slot without resuming.  AUR p.2-140
 * describes KILL as terminating "any currently-halted program(s)";
 * we match the singular reading — one KILL peels one suspension off
 * the stack.  Users who want to drain every suspension can KILL
 * repeatedly or use the CLI/reset path.
 *
 * haltedStack is a LIFO of halted records.  Multi-slot matters when
 * the user runs a second program from the keypad while an earlier one
 * is still halted; CONT resumes the most recent halt first, and older
 * ones remain reachable via subsequent CONT calls.
 * --------------------------------------------------------------- */

register('HALT', () => {
  // HALT called outside a Program body (i.e. not captured by evalRange):
  // HP50 treats this as a no-op at best, error at worst.  We throw a
  // clear RPLError so the user understands HALT only suspends programs.
  throw new RPLError('HALT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 1, label: "HALT" });


// PROMPT — HP50 AUR p.2-160 form: pop level 1 (the prompt message) and
// halt the program with that message displayed as a banner.
// evalRange's intercept handles the inside-a-program case (pop +
// setPromptMessage + yield).  Reaching this registered handler means
// PROMPT was reached via Name dispatch outside a running program (e.g.
// `'PROMPT' EVAL` from the keypad) — the HP50 has no useful behavior
// there, and we surface the same "not inside a running program" error
// HALT raises so the user gets a consistent message.
register('PROMPT', () => {
  throw new RPLError('PROMPT: not inside a running program');
}, { category: 'Control flow / debug', categoryOrder: 4, label: "PROMPT" });


register('CONT', (s) => {
  if (!getHalted()) throw new RPLError('No halted program');
  // CONT consumes the active prompt banner.  PROMPT is a one-shot:
  // the user has provided whatever input the program asked for and
  // is resuming.  If the resumed program HALTs again with a fresh
  // PROMPT, that call sets the message anew; if it HALTs without
  // one, the banner stays cleared.  We clear up-front (before
  // takeHalted / next()) so the cleared state is visible during
  // resumption — including to any UI subscribers that re-render on
  // every emit.
  clearPromptMessage();
  // takeHalted pops the top record WITHOUT closing its generator —
  // clearHalted (used by KILL) closes it; takeHalted leaves it live
  // so gen.next() below can resume it.  The slot is removed before
  // resuming so that a fresh HALT inside the resumed program can
  // push a new record cleanly on top of any remaining older ones.
  //
  // LIFO semantics: older halted records remain on haltedStack and
  // are reachable via subsequent CONT calls.  Generator-based
  // resumption preserves ALL structural state (FOR counter, IF
  // branch, → local frames) automatically.
  //
  // _localFrames safety: do NOT truncate while halted — the
  // generator's own finally blocks handle cleanup.  Truncation only
  // runs when the generator finishes (done=true) or throws.
  const h = takeHalted();
  const framesAtEntry = _localFrames.length;
  let halted = false;
  try {
    const result = h.generator.next();
    if (!result.done) {
      // Generator yielded again (another HALT) — push it back.
      halted = true;
      pushSuspendedGenerator(h.generator);
    }
  } finally {
    if (!halted) {
      clearPendingSuspend();
      _truncateLocalFrames(framesAtEntry);
    }
  }
}, { category: 'Control flow / debug', categoryOrder: 2, label: "CONT" });


register('KILL', () => {
  // KILL is valid even when there is no halted program — the HP50 op
  // is a no-op in that case (AUR p.2-140 "KILL terminates any
  // currently-halted program, or does nothing").  KILL pops one
  // record off the halted stack; older halts are preserved.
  clearHalted();
  // Any active PROMPT banner belongs to the killed program; clearing
  // it here keeps the banner from outliving the program that posted
  // it.  In the multi-slot case where older halts remain, we still
  // clear the global banner — there's no per-slot prompt tracking,
  // and the next CONT/SST will either re-set or start fresh.
  clearPromptMessage();
}, { category: 'Control flow / debug', categoryOrder: 3, label: "KILL" });


// SST (step-over) runs a named sub-program call at full speed, yielding
// once after the call returns.  SST↓ (step-into) keeps single-stepping
// active while descending into the sub-program, stopping on each of
// its tokens.  The distinction is modulated by the `_stepInto` flag
// consulted in `_evalValueGen`'s Program branch.
register('SST',  (s) => { _stepOnce(s, /* into = */ false); }, { category: 'Control flow / debug', categoryOrder: 7, label: "SST" });

register('SST↓', (s) => { _stepOnce(s, /* into = */ true);  }, { category: 'Control flow / debug', categoryOrder: 8, label: "SST↓" });
