# RPL.md — RPL Programming Support (task lane notes)

**Scope reminder.** This file tracks the User-RPL-as-a-language lane only:
parser `« … »`, evaluator, compiled local environments, structured control
flow, the suspended-execution substrate (HALT/CONT/KILL/ABORT/SST/DBUG/RUN),
program decomposition / composition, program persistence round-tripping.
Out of scope: arithmetic / CAS / unit / matrix / plot / string ops
(those belong to `rpl5050-command-support`), type widening
(`rpl5050-data-type-support`), UI (`rpl5050-ui-development`), the test harness
(`rpl5050-unit-tests`).

This file documents current behavior. The per-session changelog has been
collapsed into the current-tense reference below; git preserves the history.

---

## Program value — parser & round-trip

- Parser: `<<` / `>>` (ASCII) and `«` / `»` (Unicode) both tokenize to
  the same `delim:<<`/`>>` pair; body is a flat token list. See
  `www/src/rpl/parser.js` `parseProgram`.
- Persistence: Program round-trips through `persist.js` — verified green
  by `tests/test-persist.mjs`.
- Formatter: programs render `« tok tok … »` via `www/src/rpl/formatter.js`.
- `DECOMP` / `→STR` on a Program: `DECOMP` pops a Program and pushes the
  formatter's source-form string. Tests in `tests/test-reflection.mjs`.
- **Auto-close on unterminated** `«`: the parser silently auto-closes the
  program body when the source runs out before `»`. Matches the existing
  "forgot the closer" convenience on lists / vectors. `parseProgram`
  (`parser.js`) exits its `while` loop at end-of-buffer and returns
  `Program(body)` as-is — the trailing `if (idx < toks.length) idx++` only
  consumes a closer when one is actually present. This documented behavior
  had no direct `parseEntry` pin until the `session305:` block in
  `tests/test-entry.mjs`: an unterminated Unicode program with trailing
  content (`« 1 2 +`), the ASCII opener (`<< 1 2 +`), a bare opener (`«` →
  empty program), nested both-unterminated openers (`« 1 «2 +` → inner
  closes then outer), and an unterminated structural body (`« IF 1 THEN 2`,
  where the IF is one top-level token resolved later by `evalRange`). Each
  asserts the token count and the formatter round-trip to the spaced, closed
  form. Guards a future strictness change that would throw on a missing `»`.
- **Delimiter-stop in the ident tokenizer:** the bare-ident scanner in
  `tokenize` stops at an embedded program closer so a closing `»` (or ASCII
  `>>`) abutting an operator name closes the program rather than being
  swallowed. The ident stop set includes `«»`, and a `j > i` lookahead
  breaks on `<<`/`>>` while leaving a lone `<`/`>` as a valid bare operator
  name (e.g. `« 1 2 <»` closes on its real `»` rather than minting
  `Name('<»')`). Pinned in `tests/test-entry.mjs`.
- **List / vector delimiter symmetry:** `{` `}` `[` `]` are single-char
  delims (`parser.js:57`) and all four are in the bare-ident scanner's stop
  set (`'{}[]()"\`«»'`, `parser.js:204`), so a Name or number abutting a
  list/vector opener or closer with no whitespace splits cleanly (`X{1 2}`
  → `Name('X')` + list; `{1 2}DUP` → list + `Name('DUP')`). No
  `<<`/`>>`-style lookahead is needed — none of these glyphs is a valid bare
  operator name, so plain stop-set membership suffices. Guarded by
  regression pins in `tests/test-entry.mjs`.
- **Program-opener abutment (symmetric to the closer):** a Name or number
  abutting an opener with no whitespace splits cleanly into `[value, nested
  Program]` — `2«1 +»` → `Integer(2)` + `«1 +»`; `X«1»` → `Name('X')` +
  `«1»`. The number scanner stops at `«`/`<`; the ident scanner stops on the
  Unicode `«` stop-set glyph or, for ASCII, the same `<<` lookahead that
  closes on `>>`. Pinned by the `session282:` block in `tests/test-entry.mjs`
  (Unicode + ASCII openers, Name + number operands, empty nested body).
- **Program-closer abutment with a following token (last corner):** once
  `»` / ASCII `>>` closes a program the scanner resumes a fresh token, so a
  Name, number, or list opener abutting the closer with no whitespace splits
  cleanly into `[Program, next]` — `«1»DUP` → `«1»` + `Name('DUP')`; `«1»2`
  → `«1»` + `Integer(2)`; `«1»{2}` → `«1»` + list; ASCII `<<1>>DUP` rides the
  `>>` lookahead. Completes the abutment class (session278 pinned the
  list/vector closer→Name, session282 the opener→value, and `X»` the
  closer→*preceding* Name). Pinned by the `session283:` block in
  `tests/test-entry.mjs`.
- **Unit-literal abutment with the program closer (the last unswept member
  of the class):** the unit-expression scanner in `tokenize` (the
  `<number>_<unitExpr>` branch) ran to the next whitespace or the `{}[]"\``
  delims but *not* the program closer, so `« 1_m»` (no space before `»`)
  swallowed the closer into the unit text and threw `Bad unit expression
  near '»': m»`, while the spaced `« 1_m »` parsed fine — a real fidelity
  bug, not just an unguarded behavior. The list/vector delims already
  stopped it (`1_m{2}` split cleanly); the program closer did not. Fixed by
  adding `«»` to the unit-text stop set and the `<<`/`>>` ASCII doubled
  lookahead (a unit expression never contains `<`/`>`), mirroring the bare-
  ident scanner. Now `« 1_m»` == `« 1_m »`, compound `« 1_m/s»` keeps both
  uexpr factors, ASCII `<< 1_kg>>` rides the lookahead, and `« 1_m»DUP`
  splits into `[«1_m», Name('DUP')]`. Pinned by the `session293:` block in
  `tests/test-entry.mjs`.
- **Parenthesised-unit abutment with the program closer (session293
  follow-up):** session293 pinned the simple (`m`) and compound (`m/s`)
  closer-abutment, but the parenthesised form `kg/(m*s)` is a distinct
  corner. The unit-text scanner deliberately keeps `()` *out* of its stop
  set — parentheses are valid unit-grouping syntax (`kg/(m*s)`, and the
  formatter emits them for multiple negative factors), so they must stay
  inside the unit token, unlike the bare-ident scanner whose stop set *does*
  include `()`. That asymmetry is what lets `« 1_kg/(m*s)»` close on the real
  `»` (and `<< 1_kg/(m*s)>>` on the `>>` lookahead) rather than splitting at
  the interior `(`. No source behavior change — added a clarifying comment in
  `parser.js` on the deliberate `()` exclusion and a `session299:` block (+5
  pins) in `tests/test-entry.mjs`: the baseline parenthesised parse, the
  Unicode and ASCII closer-abutments, the formatter's own `W/(K*m^2)`
  round-trip shape abutting `»`, and a `1_kg/(m*s){9}` list-opener split
  regression. Guards a future "harmonisation" that copies the bare-ident
  stop set onto the unit scanner — which would break every parenthesised
  unit.

## Evaluation

- `EVAL` (ops.js) dispatches Program / Name / Tagged / Symbolic /
  Directory / other. Program eval runs `evalRange` over the token array
  with a pointer, snapshotting the stack and rolling back on RPLError.
- Recursion depth capped at `MAX_EVAL_DEPTH = 256`.
- Loop-iteration ceiling: `MAX_LOOP_ITERATIONS = 1_000_000`.
- `IFT` / `IFTE` — stack-based conditionals, implemented, tested.
  HALT/PROMPT inside the action(s) lifts cleanly when the IFT/IFTE keyword
  is reached through `evalRange`'s body intercept (`runIft` / `runIfte` are
  generator helpers; the action is EVAL'd via `_evalValueGen`). Reaching
  IFT/IFTE through Name dispatch (`'IFT' EVAL`, Tagged-wrapped Name) still
  rejects through `_driveGen` with the `cannot suspend inside <IFT|IFTE>
  action` label. The test value is interpreted by `isTruthy` (`ops.js` ~97),
  which dispatches Real → Integer (`v.value !== 0n`) → Complex
  (`v.re !== 0 || v.im !== 0`), else throws `Bad argument type`. The
  `session425:` block in `tests/test-control-flow.mjs` (after the IFTE
  plain-value block) pins the Integer and Complex arms and the reject arm
  through IFT (the simplest sync entry) and NOT (`ops.js` ~5259, same helper):
  prior IFT/IFTE/NOT pins fed only `Real`, so a refactor narrowing `isTruthy`
  to Real-only would have passed green while breaking an Integer or
  pure-imaginary test. The same block also pins the IFTE false→plain-value
  mirror and the failed-IFT snapshot rollback (`runIft` restores test+action).
  The logical ops `AND`/`OR`/`XOR` reach the same `isTruthy` dispatch via
  `binaryLogic`'s flag-style arm (`ops.js` ~5237: `const x = isTruthy(a),
  y = isTruthy(b)`, taken only when neither operand is a BinaryInteger — two
  BinInts go bitwise, a mixed BinInt rejects). session068's truth table fed
  only `Real` operands, so the Integer arm, the Complex arm, and the reject
  arm of `isTruthy` were never exercised through the logical ops; the
  `session432:` block in `tests/test-comparisons.mjs` (after the session068
  truth-table block) pins all three: Integer operands (`5 AND 0`→0,
  `5 AND 3`→1, `0 XOR 4`→1), Complex operands (`(0,2) AND (3,4)`→1,
  `(0,0) AND (3,4)`→0, `(0,2) XOR (0,0)`→1), mixed non-Real/Real slots, and a
  String operand in either slot → `Bad argument type`. Guards a refactor
  narrowing `binaryLogic` to a Real-only coercion.
- `MAP` / `SEQ` / `DOLIST` / `DOSUBS` / `STREAM` — list combinators with
  body programs. HALT/PROMPT inside the body lifts cleanly when any of these
  keywords is reached through `evalRange`'s body intercept (`runMap` /
  `runSeq` / `runDoList` / `runDoSubs` / `runStream` are generator helpers;
  per-iteration body EVAL is driven by `_evalValueGen` with `yield*`).
  Per-iteration suspension is the natural shape: the partial accumulator
  (`out` array, current `i`, in-progress matrix row, restored variable
  binding, DOSUBS NSUB/ENDSUB frame, in-flight STREAM accumulator on the RPL
  stack) lives in the generator's stack frame, so CONT resumes mid-iteration
  with all state intact. The Name-dispatch fallback (`'MAP' EVAL`,
  Tagged-wrapped `Name('SEQ')`, direct `lookup('DOLIST').fn(s)`, etc.) goes
  through `_driveGen` with the caller labels (`MAP program` /
  `SEQ expression` / `DOLIST program` / `DOSUBS program` /
  `STREAM program`); KILL of a halted MAP-in-→ (or DOLIST-in-→ /
  DOSUBS-in-→) tears down the `→` frame via `gen.return()`'s finally chain,
  and DOSUBS additionally pops its NSUB/ENDSUB frame in the same `finally`.
  `resetHome` closes the generator before clearing the home directory, so a
  halted DOSUBS's frame stack is cleared correctly on refresh.
- Symbolic lift on most arithmetic ops via the `_isSymOperand` / `_toAst`
  pair — programs carrying bare `Name` tokens auto-lift when the operand
  reaches a numeric op.

## Structured control flow

| Construct | Status | Implementation |
|-----------|--------|----------------|
| `IF…THEN…ELSE…END`           | ✓ green (auto-close on missing END) | `runIf` in ops.js |
| `IFERR…THEN…ELSE…END`         | ✓ green (auto-close on missing END) | `runIfErr` (last-error slot, save/restore of outer) |
| `WHILE…REPEAT…END`            | ✓ green (auto-close on missing END) | `runWhile` |
| `DO…UNTIL…END`                | ✓ green (auto-close on missing END) | `runDo` |
| `START…NEXT`/`…STEP`          | ✓ green (auto-close on missing NEXT/STEP, implicit step=1) | `runStart` (Integer-mode preserving) |
| `FOR…NEXT`/`…STEP`            | ✓ green (auto-close on missing NEXT/STEP, implicit step=1) | `runFor` (bound name save/restore) |
| `CASE…THEN…END … END`         | ✓ green (auto-close on missing END) | `runCase` |
| `« … »` nested programs       | ✓ (transparent; Programs push themselves) | |

**Auto-close policy (uniform).** Any `scanAtDepth0` inside a structural
runner (`runIf` / `runIfErr` / `runCase` / `runWhile` / `runDo` /
`runStart` / `runFor`) that runs off the end of the token list treats
end-of-program as the implicit closer — `END` for the condition-loops and
dispatchers, `NEXT` (step = 1) for the counter-loops. Mirrors the parser's
auto-close on unterminated `«` / `{` / `[`. Missing-separator errors
(WHILE-without-REPEAT, DO-without-UNTIL, FOR-without-name, IF-without-THEN,
IFERR-without-THEN) and spurious-closer errors (END in a
START/FOR closer slot, NEXT/STEP in a WHILE/DO END slot) stay as hard
errors. The WHILE/DO END-slot spurious closer is pinned for both closer
kinds: session136 pins the NEXT arm and the `session393:` block in
`tests/test-control-flow.mjs` pins the STEP arm (`« WHILE 1 REPEAT 2 STEP »`
→ `WHILE/REPEAT without END`, `« DO 1 UNTIL 1 STEP »` → `DO/UNTIL without
END`) — STEP reaches the same `else` throw via a distinct `scanAtDepth0`
`kind`, and EVAL's post-pop snapshot rolls the stack back clean. The
START/FOR closer-slot reject is **CF_CLOSER-only**: the closer scan is
`scanAtDepth0(toks, …, null)`, and with `wanted` null it returns only
CF_CLOSERS (END/NEXT/STEP), never a CF_INNER (THEN/ELSE/REPEAT/UNTIL), so a
spurious *inner* keyword in the START/FOR closer slot is NOT a sibling reject
arm (only END is) — scanAtDepth0 skips past it, the closer scan runs off the
end, the loop auto-closes (implicit NEXT), and the inner token is absorbed
into the body where evalRange's orphan-keyword arm skips it silently. Pinned
by the `session400:` block in `tests/test-control-flow.mjs` (after the
session136 FOR spurious-END block): a spurious THEN/ELSE/REPEAT/UNTIL in the
START closer slot (`« 0 1 5 START 1 + <inner> »` → 5) and the FOR closer slot
(`« 0 1 4 FOR i i + <inner> »` → 10, `i` purged) each behave identically to
the bare auto-close. The **WHILE / DO mirror** is pinned by the `session406:`
block in `tests/test-control-flow.mjs`: a spurious CF_INNER
(THEN/ELSE/REPEAT/UNTIL) in either condition-loop is likewise absorbed, never
rejected. Both runner scans skip it — the REPEAT/UNTIL separator scan
(`scanAtDepth0` with `{REPEAT}`/`{UNTIL}`) drops a foreign inner via the
`wanted.has` miss (absorbed into the test/body before the separator), and the
END scan (`wanted` null) returns only CF_CLOSERS so an inner after the
separator is absorbed into the body; evalRange's orphan-keyword arm then skips
it. So `« 0 WHILE DUP 3 < REPEAT 1 + <inner> »` and
`« 0 DO 1 + UNTIL DUP 3 ≥ <inner> »` (inner in the END slot), plus a foreign
inner before the separator, all loop 0→3 — identical to the auto-close. The
WHILE/REPEAT-without-END (and DO/UNTIL-without-END) throw is thus reachable
only by a CF_CLOSER (NEXT/STEP, session136/393), never a CF_INNER. IF and
IFERR have no default-clause semantics, so a missing THEN is
always an error — unlike CASE, where a missing THEN is *not* an error: the
whole clause range becomes the default and runs (`« CASE 1 2 + END »` → 3,
`« CASE 1 2 + »` auto-closes to the same, and an empty `« CASE END »` is a
no-op). Pinned by the `session317:` block in `tests/test-control-flow.mjs`.
A **spurious counter-loop closer inside CASE** is still a hard error:
`runCase`'s clause scan (`scanAtDepth0` with `{THEN}`) only ever returns a
wanted `THEN` or a `CF_CLOSER` (`END`/`NEXT`/`STEP`), so a depth-0 `NEXT`/`STEP`
where a clause test/THEN belongs falls through the THEN and END branches to
`throw 'CASE: unexpected <kind>'` (`ops.js` ~3838). Pinned by the `session386:`
block in `tests/test-control-flow.mjs`: `« CASE 1 NEXT »`/`« CASE 1 STEP »`
reject on the first clause and `« CASE 0 THEN 2 END 0 NEXT »` rejects on a
later clause (after a false test advances `i` past the inner END); EVAL's
post-pop snapshot rolls the stack back clean. Guards a refactor that swallows a
stray counter closer or replaces the throw with a no-op.
**IF and IFERR have the sibling arm.** Their THEN-branch scan
(`scanAtDepth0` with `{ELSE}`) short-circuits on any depth-0 CF_CLOSER, so a
spurious `NEXT`/`STEP` in the THEN slot lands as `branchScan.kind` neither
`ELSE` nor `END` and falls to `throw 'IF/THEN: unexpected <kind>'`
(`runIf`, `ops.js` ~3957) / `IFERR/THEN: unexpected <kind>` (`runIfErr`
~4035). The throw fires at scan time, before either branch (or, for IFERR,
the trap) is evaluated, so a falsy `« IF 0 THEN 2 NEXT END »` rejects too.
A counter closer in the *test* slot instead hits the THEN scan first and
yields `IF without THEN`; one in the *ELSE* slot is absorbed via the
`wanted`-null END scan's auto-close (the WHILE/DO-style absorb, not a reject).
Pinned by the `session412:` block in `tests/test-control-flow.mjs` (NEXT/STEP
for both IF and IFERR, plus the falsy-test arm; stack rolls back to depth 0).
A spurious CF_*INNER* (`ELSE`/`REPEAT`/`UNTIL`) in the IF *test* / IFERR *trap*
slot is the complementary case and is **absorbed, not rejected**: the first
`scanAtDepth0(.., {THEN})` short-circuits only on `THEN` or a closer, so the
stray inner is skipped and the real THEN is still found at its index; the inner
then lands inside the evaluated test/trap range where evalRange's orphan-keyword
arm (`ops.js` ~3681) drops it silently. The block evaluates identically to the
no-spurious-inner baseline (`« IF 0 ELSE THEN 2 ELSE 3 END »` → 3 — the stray
`ELSE` absorbed while the real `ELSE` separator past THEN is honoured; the IFERR
mirror absorbs the inner on both the no-throw and throw-handler paths). Pinned by
the `session419:` block in `tests/test-control-flow.mjs`.
The **FOR-without-a-counter-name** hard error is pinned by the `session331:`
block in `tests/test-control-flow.mjs`: `runFor` pops the two bounds before
the `isName(varTok)` gate (ops.js ~4250), so a non-Name in the counter slot
(Integer, a trailing `FOR` with an undefined slot, or a Program) throws
`FOR needs a name` and EVAL's post-pop snapshot rolls the program back to a
clean stack; the gate is purely structural, so any Name — even an operator
name like `+` — is accepted as the counter.
HALT/CONT/KILL composition is automatic — the runner is a generator, so HALT
inside an auto-closed body suspends through the same `yield*` chain as a
fully-closed body, and FOR's bound-name save/restore carries through the
auto-close path.

**Zero-step `STEP` guard (counter loops).** `runLoopBody` (shared by START
and FOR) throws `STEP of 0` on a zero step, because a zero step is an
infinite loop on the real machine (ops.js ~4331). The guard has two arms:
`step === ZERO` (int-mode, both bounds Integer) and `step === 0` (real-mode,
reached when a bound is Real or when an Integer-bounded loop pops a Real step
and demotes mid-loop). session122 pinned only the FOR int-mode arm; the
`session311:` block in `tests/test-control-flow.mjs` extends coverage to
START (the `varName === null` path through the same helper), the real-mode
arm, and the int-mode → real-mode demote-then-zero corner for both START and
FOR — each throws exactly `STEP of 0`. Guards a refactor that splits the
shared helper or narrows the zero check to one mode.

## Compiled local environments

Status: ✓ green (boxed-program and algebraic bodies).

- HP50 syntax: `→ a b c « ... body ... »` pops 3 from the stack into
  locals `a`, `b`, `c` visible only to `body` (rightmost name gets level 1
  per HP50 convention). ASCII `->` is the same form. Algebraic body form
  (`→ a b 'a+b'`) also supported — the body is an `Algebraic` object whose
  EVAL consults the local frame before `varRecall`.
- **Algebraic-body partial reduction.** When the Symbolic body carries a
  name that is neither a bound local nor a global, EVAL substitutes the
  bound locals but leaves the free name in the AST — the "possibly partially
  reduced value" the `runArrow` Symbolic arm documents. session068/116 pin
  only the fully-reducing case (every name bound); the `session379:` block in
  `tests/test-control-flow.mjs` (after the session068 algebraic-body block)
  closes the partial-reduction direction: `5 → a 'a+b'` leaves a Symbolic
  with `a` substituted to `5` and the unbound `b` surviving as the lone free
  name, `2 → a 'b-a'` shows the substitution holds in either operand slot,
  and `« 10 'b' STO 5 → a 'a+b' »` folds to a Real `15` — pinning the full
  lookup precedence (local frame → global `varRecall` → name stays symbolic).
  No source change.
- Evaluator hook: `evalRange` intercepts the bare-`Name` token with id `→`
  or ASCII `->` and dispatches to `runArrow`. Frame is a `Map<string, value>` pushed onto
  the module-level `_localFrames` stack; popped in `finally` so a throw
  inside the body still cleans up.
- Lookup precedence: local frame (innermost first) → global `varStore`
  → op table. Implemented in `evalToken`, `_evalValue` Name branch, and the
  Symbolic-EVAL internal `lookup` closure (all consult `_localLookup`
  before `varRecall`).
- Scoping is dynamic, matching HP50: compiled `→` locals remain visible
  inside nested `« … »` programs; an inner `→` shadows an outer local; an
  outer local survives across a nested `RPLError` that IFERR unwinds.
- Prefer `→` for anything that looks lexical; `'X' STO` / `'X' PURGE` is no
  longer the only tool.
- **Name-collector quote-exclusion.** `runArrow` gathers consecutive *bare*
  Name tokens as local names and stops at the first non-Name OR quoted Name
  (`if (isName(t) && !t.quoted)`, `ops.js` ~3497), so a quoted Name can serve
  as neither a local nor a body. session068 pinned the four syntax-error arms
  (no names / missing body / non-Program-non-Symbolic body / too-few-args)
  with a non-Name (Integer) body, but never the quoted-Name corner. The
  `session352:` block in `tests/test-control-flow.mjs` (after the session068
  syntax-errors block) closes it from both directions: `→ 'a' «1»` collects no
  locals → `→: no local variable names` (a quoted leading name is not a local),
  and `5 → a 'b'` stops collection at the quoted `'b'`, which becomes the
  rejected body → `→: body must be a program or algebraic` (a quoted name is
  not a second local). No source change — guards a refactor that drops the
  `!t.quoted` guard (which would silently bind a quoted name as a local).

## Suspended-execution substrate

HALT / CONT / KILL / RUN / SST / SST↓ / DBUG compose freely at any
structural depth AND across named-sub-program boundaries reached via
`evalToken` Name lookup.

- **Architecture.** `evalRange` and all `run*` helpers are JS generator
  functions (`function*`). `yield` at each HALT propagates through the
  `yield*` delegation chain to the EVAL/CONT handler, which stores the live
  generator in `state.haltedStack` via `setHalted`. `CONT` uses
  `takeHalted()` (pop without closing) + `gen.next()`. `KILL` uses
  `clearHalted()` (pop + `gen.return()`). `resetHome` calls `gen.return()`
  for each live generator before clearing the stack so `runArrow`'s
  `finally` blocks run and `_localFrames` stays clean. `state.js` provides
  `takeHalted()` and the `_closeRecord()` private helper. The `RPLHalt`
  class is retained for back-compat but is no longer thrown during
  structural HALT — the generator yield mechanism replaces it.
- **Multi-slot halted-program LIFO.** `state.haltedStack` is a LIFO; if
  program A halts, then program B runs and also halts, CONT resumes B and A
  remains on the LIFO to be CONT'd next. Matches HP50 AUR p.2-135.
- **`evalToken` Name-lookup lift.** `_evalValue` is split into two flavours:
  `_evalValueSync` (used by sync callers that cannot yield — IFT, IFTE, MAP
  bodies, the Symbolic constant-rpl path, etc., which reject HALT with the
  caller-label message via `_driveGen`) and `_evalValueGen` (generator, used
  from `evalToken`'s Name branch). The generator flavour does
  `yield* evalRange(...)` for Program values so a nested HALT propagates
  cleanly through every variable-lookup frame. So HALT inside a named
  sub-program — one level deep or deeply chained A→B→C — suspends cleanly,
  CONT resumes, and KILL closes with `finally` blocks running for every
  nested `runArrow` local frame.
- **EVAL routes every operand through `_evalValueGen`** (no Program-direct
  fast path), recursively peeling Tagged/Name layers while preserving an
  `isSubProgram` parameter (default `true`; the EVAL entry passes `false` so
  the body remains the *outer* program from SST/DBUG's point of view). So
  HALT lifts through Tagged-wrapped Programs and Name-on-stack EVALs. DBUG's
  argument-type guard peels Tagged before the Program check, so the same set
  of EVAL-able values is DBUG-able.

### HP50 ops in this family

- `HALT` — `yield` in `evalRange` propagates through the full `yield*`
  chain. Called bare outside a running program: raises `HALT: not inside a
  running program`.
- `PROMPT` (HP50 AUR p.2-160) — pops level 1, sets `state.promptMessage`,
  then `yield`s on the same suspension channel as HALT, so CONT/SST/KILL all
  work without further plumbing. The banner type is flexible (any RPL value,
  not just String). CONT and `_stepOnce` clear the banner up-front
  (resumption consumes the prompt); KILL clears it alongside `clearHalted`;
  `resetHome` clears it. Pop-before-yield consumes the operand atomically
  with the suspension; an empty stack throws `PROMPT: Too few arguments`
  before any state mutation. Bare PROMPT outside a running program raises
  `PROMPT: not inside a running program`.
- `CONT` — uses `takeHalted()` (pops the top record without closing it) then
  drives `h.generator.next()`. If it yields again (another HALT), calls
  `setHalted` to push it back. Older halts remain. Raises `No halted
  program` when the LIFO is empty.
- `KILL` — uses `clearHalted()`, which calls `gen.return()` to close the
  generator and trigger `finally` cleanup. Valid on an empty stack.
- `RUN` (AUR p.2-177) — resume op. Without DBUG active, behaves identically
  to `CONT`.
- `ABORT` — ✓ green. Unwinds via `RPLAbort`.
- `SST` / `SST↓` — single-step debugger. Module-private `_singleStepMode`
  flag is flipped by the SST handler; when set, `evalRange`'s
  `_shouldStepYield()` check yields after every token (in addition to the
  HALT-yield) so the generator suspends between instructions. `_stepInto`
  and `_insideSubProgram` flags differentiate step-over from step-into:
  `_shouldStepYield()` returns `_singleStepMode && (!_insideSubProgram ||
  _stepInto)`, so SST runs a Name-reached sub-program body in one step while
  SST↓ descends token-by-token into it. Ops: `SST` = `_stepOnce(s, false)`;
  `SST↓` = `_stepOnce(s, true)`. `_stepOnce` saves/restores both
  `_singleStepMode` and `_stepInto` in `finally`, and the `_evalValueGen`
  Program branch saves/restores `_insideSubProgram` in `finally`, so KILL
  mid-step cannot leak either flag. Generator semantics preserve every
  structural-context frame (FOR counter, IF branch, `→` local frame) for
  free across single-step suspensions. Errors: SST with no halted program →
  `No halted program`.
- `DBUG` — pops a Program from level 1, sets `_singleStepMode = true`,
  delegates to EVAL. EVAL's generator runs the first token then yields,
  suspending the program on `haltedStack`; the user drives subsequent steps
  with SST. The flag is reset in `finally` so any downstream CONT/RUN runs at
  full speed. Errors: DBUG on a non-Program → `Bad argument type` (the
  argument-type guard peels Tagged first). Empty program (`« »`) completes
  immediately with no halt.

### Limitations / caveats

- The only structural sync-path call site that still rejects HALT is
  `runArrow`'s Symbolic body (`'→ algebraic body'` caller label). This site
  is currently unreachable in practice — the Symbolic AST cannot carry a
  Program subnode — but the label is wired defensively for any future
  Symbolic refactor.
- No serialisation across `persist.js`; a page refresh drops the halted
  stack (`clearAllHalted` fires on `resetHome`). Generators are not
  JSON-serialisable; surviving a refresh would require capturing enough
  token/IP state to reconstruct the generator chain. This is the lone larger
  open item for this lane.
- `DBUG` / `SST` / `SST↓` are implemented as real ops but still need a UI
  surface; that work belongs to `rpl5050-ui-development`.
- When `resetHome` drops a halted program on refresh, no UI affordance tells
  the user it happened. Belongs to `rpl5050-ui-development`.

## Program decomposition / composition

- `OBJ→` on Program: pushes each token then an Integer count. Inverse is
  `→PRG`.
- `→PRG`: pops a count N, gathers N items into a fresh Program. The count
  coerces through `_toCountIdx` (`ops.js` ~6993): Integer / BinaryInteger pass
  through, a Real passes only if whole (`!v.value.isInteger()` → `Bad argument
  value`), and any other type → `Bad argument type`. A negative whole count
  (Integer or Real) passes the integrality gate then trips the handler's
  `n < 0` → `Bad argument value`, and a count exceeding the stack depth throws
  `Too few arguments` at `popN`. session067/077 pinned the Integer/BinInt
  accepts, the Integer-negative and Name/String rejects, and the 0 case; the
  `session366:` block in `tests/test-reflection.mjs` (after the session077
  round-trip block) closes the Real arms (whole accepted, fractional rejected,
  negative-whole and negative-fractional rejected) and the popN underflow.
- `OBJ→` on Symbolic: walks the AST root — Bin(op) → pushes
  `[L, R, Name('op', quoted), Integer(3)]`; Fn(name, args) → pushes
  `[arg1..argN, Name(name, quoted), Integer(N+1)]`; Neg(x) → same shape as
  Fn('NEG', [x]); leaves (num/var) unwrap to the underlying Real/Integer/Name
  with an Integer(1) count. Two defensive arms of `_symbolicDecompose`
  (`ops.js` ~269) round out the dispatch: a Symbolic with no `expr` (null/
  undefined) decomposes to just `Integer(0)` — the empty-count shape,
  symmetric with the empty Program / List (session156); and an unknown AST
  `kind` (none of num/var/neg/bin/fn) preserves the original Symbolic by
  reference with an `Integer(1)` count so a generic `→PRG`-style rebuild loop
  never drops the value. Both arms are pinned by the `session345:` block in
  `tests/test-reflection.mjs` (after the session068 multi-arg Fn block).
- `OBJ→` on numeric scalars (Real / Integer / BinaryInteger / Rational):
  pushes the value back unchanged (1-in / 1-out), matching the AUR §3-149
  Input/Output table, which lists no numeric-scalar entry. The mantissa /
  exponent split is the job of `MANT` (AUR p.3-6) and `XPON` (AUR p.3-9);
  format-specific splits remain at `B→R` (BinInt → Real, AUR p.3-46) and the
  rational `→NUM` / `→DEN` ops — not `OBJ→`.
- `OBJ→` on Tagged: pushes `value, "tag"` where `"tag"` is a String, not a
  Name (per AUR §3-149's double-quote String-literal convention). →TAG (AUR
  p.3-247) accepts either a String or a Name as the tag-side input, but
  `OBJ→`'s canonical decomposition uses the String form. Pinned with a
  regression assertion that the tag is `isString` and not `isName` — do not
  "fix" it into a Name form.
- `OBJ→` on Unit: pushes `Real(v.value)` on level 2 and `Unit(1, v.uexpr)`
  on level 1, so `x_unit → x 1_unit` per the AUR. Round-trip via `*`
  reconstructs the original Unit because `_unitBinary` on Real*Unit folds the
  scalar into `b.value` (1 * x = x), preserving the uexpr. The level-1 push
  uses the bare `Unit()` constructor (not `_makeUnit`) so a
  theoretically-empty uexpr still emits the prototype rather than collapsing
  to `Real(1)` — preserving the AUR table's shape-preserving "1_unit" output.
  Every row of the AUR §3-149 Input/Output table now has a corresponding
  branch in the dispatch (Complex / Tagged / List / Vector / Matrix / String
  / Program / Symbolic / Real / Integer / BinaryInteger / Rational / Unit).
  Value types with *no* AUR §3-149 row (Name, Directory — no internal
  structure to decompose) fall through the whole dispatch to its reject tail
  (`throw new RPLError('Bad argument type')`). That reject tail had no pin
  until the `session359:` block in `tests/test-reflection.mjs` (after the
  session164 OBJ→ Rational block): OBJ→ on a bare Name, a quoted Name, and a
  Directory each reject with `Bad argument type`, and the ASCII alias `OBJ->`
  rejects identically. Guards a refactor that reorders the dispatch or
  replaces the throw with a silent no-op.
- `DECOMP` on Program: pushes the formatter source-string (`« … »` form).
  Pair with `STR→` for round-trip — pinned by assertions in
  `tests/test-reflection.mjs`, including a DECOMP→STR→→DECOMP canonical-form
  idempotence check, covering every structural-keyword construct (IF / IFERR
  / WHILE / DO / START / FOR / CASE / → compiled-local).
- `→LIST` / `LIST→` / `→PRG` / `→ARRY` / `ARRY→` accept `BinaryInteger`
  counts uniformly (coercion helpers `_toIntIdx` / `_toCountN` / `_toDimSpec`
  all accept BinInt). **`→ARRY 0` rejection asymmetry (documented, low
  priority):** `→LIST 0` produces `{}` and `→PRG 0` produces `« »`, but
  `→ARRY 0` throws "Bad argument value" because `_toIntIdx` rejects 0. There
  is annotated dead code in `_toArrayOp` (`if (n === 0) push Vector([])`)
  that anticipated the empty case but is unreachable. HP50's own `→ARRY 0`
  behaviour is not clearly specified in AUR; empty-vector support would need
  a downstream audit of every op that consumes Vector to find which assume
  `dim ≥ 1`. The rejection stays in place until someone needs empty vectors.
  **`_toDimSpec` reject arms (session372, `tests/test-reflection.mjs`):** the
  size-list length check is pinned on both boundaries — empty `{}` (`length
  < 1`) and 3-element (`length > 2`) both throw "Bad argument value" — and the
  per-item `_toIntIdx` rejections reached *inside* the list map are pinned for
  a non-integer Real (`{2.5}` → value), a String (`{"x"}` → type), and a
  negative item (`{-1}` → value), distinct from the outer dim-spec type guard
  that only sees the List as a whole. The 2-D matrix branch's `popN(m*n)`
  underflow (`{2 3}` with < 6 stack elements → "Too few arguments") is pinned
  too.
- `SIZE` on Program: returns the token count as an Integer (shallow count —
  nested sub-programs count as 1 token each), per HP50 AUR §5.3.
- `NEWOB` — supports every numeric-scalar shape (Real / Integer /
  BinaryInteger / Rational / Complex), every composite container (List /
  Vector / Matrix / Program), and Tagged / Unit / String / Name / Symbolic
  via the `_newObCopy` switch. Every enumerated shape produces a fresh
  `Object.freeze`d outer wrapper (the invariant `Object.isFrozen(copy) ===
  true` holds for every shape — the Program branch uses the `Program()`
  factory so its outer + inner freeze pair matches every sibling shape); the
  shallow-copy contract preserves inner-element identity for the composites
  (one-level decouple, same as HP50). Rational reconstructs via
  `Rational(v.n, v.d)` (the constructor's sign-on-numerator + GCD-reduce pass
  is observably idempotent on already-canonicalised inputs). Directory and
  Grob fall through to identity on purpose — Directories are live mutable
  containers and Grobs flow through their own value-copy path. The Directory
  identity fall-through is the documented exception to the decoupling/freeze
  contract every enumerated shape obeys: NEWOB on a Directory returns the
  SAME object (`copy === orig`), unfrozen, with its live `entries` Map shared
  by reference. Pinned by the `session338:` block in
  `tests/test-reflection.mjs` (after the NEWOB-then-DECOMP block) alongside
  the session172 freeze-parity sweep, so an over-eager future Directory
  branch in `_newObCopy` (or a universal freeze of NEWOB outputs) surfaces
  as a hard failure rather than silently breaking directory mutation.

## Error-machinery

- `ERRM` / `ERRN` / `ERR0` / `DOERR` — registered and tested.
- Nested IFERR: `savedOuterError` capture + finally-restore is in place.
  Each `runIfErr` frame snapshots its outer last-error before calling
  `setLastError(caught)` and restores it in a `finally` wrapping the
  THEN-clause `yield*` — so it does NOT run on suspension (yield is not
  return); CONT runs the rest of THEN and then the finally restores the
  outer last-error. KILL of a halted inner-IFERR-THEN runs both `finally`s in
  LIFO via `gen.return()`. `yield` is not a thrown exception, so IFERR's
  `catch` does not capture a HALT yield.

## Quoted names & directory resolution inside programs

- Bare `Name` inside a program body: `evalToken` checks the op table first,
  then `varRecall`, otherwise pushes the name.
- Quoted names (`'X'`) always push without EVAL — correct.
- Directory references inside programs: `enterDirectory` on EVAL of a
  Directory value; verified.

---

## Current status

The substrate is in fully-documented, zero-drift condition: all R-bucket
findings in `docs/REVIEW.md` (R-001 — R-012) are resolved. The remaining
open items are the halted-stack persistence across `persist.js` (page
refresh drops the halted stack), and the UI surfaces for DBUG/SST and for
signalling a dropped halted program — both belong to
`rpl5050-ui-development`. `→ARRY 0` is a documented, low-priority
rejection asymmetry (see above).

---

## Known issues / open questions

- `evalRange` swallows the CASE-internal END tokens because both `CASE`
  and each inner `THEN` look like CF openers if we're not careful. The
  implementation solves this by having `runCase` take over parsing from the
  opener onward, scanning forward for its own internal structure (not going
  through `CF_OPENERS` for its children). Worth revisiting if we see weird
  errors from mixed CASE-inside-IF nesting. Pinned (session324,
  `tests/test-control-flow.mjs`): a CASE in a *falsy* IF's true-branch is
  skipped whole by `scanAtDepth0`→`_skipPastCaseEnd` (incl. a nested
  CASE-in-CASE) so the ELSE/END boundary lands correctly; the truthy
  no-ELSE counterpart locates the IF's END past the CASE; and a CASE
  missing its own inner END greedily auto-closes past the enclosing IF's
  ELSE (a defined no-op, not an error).
- `ABORT` message is not catchable by IFERR, but the outer user-facing
  `entry.js` loop may need to learn about `RPLAbort` to display a cleaner
  status-line message. The fallback `error.message` path is good enough for
  now; revisit when we wire up the UI-side ABORT display.

---

## Reference hooks

- Parser: `www/src/rpl/parser.js` (`parseProgram`, `tokenize`).
- Evaluator: `www/src/rpl/ops.js` — search for `evalRange`, `runControl`,
  the `run…` family, and `_evalValue`.
- Types: `www/src/rpl/types.js` — `Program`, `Name`, `Symbolic`, `Tagged`.
- Stack: `www/src/rpl/stack.js` — `save` / `restore` for EVAL atomicity.
- Tests: `tests/test-control-flow.mjs` (primary), `tests/test-eval.mjs`
  (EVAL dispatch), `tests/test-variables.mjs` (STO/RCL/PURGE + locals),
  `tests/test-reflection.mjs` (OBJ→ / →PRG), `tests/test-entry.mjs`
  (tokenizer / delimiter cases).
