# AUTO_PROGRESS.md — Autonomous 10-minute dev-loop ledger

This file is maintained by the scheduled "rpl-dev-loop" task. It is **not**
hand-authored project documentation — it is the working memory that lets each
isolated 10-minute run know what the previous run did and which lane is next.

Each run: read this file, pick the lane after `Last lane`, do one small scoped
piece of work, run the test suite, then append a dated entry below and update
the `Last lane` pointer.

## Rotation order

1. `command-support`   (docs/COMMANDS.md — register/fix HP50 ops in www/src/rpl/ops.js)
2. `data-types`        (docs/DATA_TYPES.md — close op×type asymmetries)
3. `rpl-programming`   (docs/RPL.md — parser/evaluator/suspended-execution)
4. `ai-chatbot`        (www/src/ai/* — chat-bot.js, remote-llm.js, system-prompt.js, llm-worker.js)
5. `ui-development`    (www/src/ui/* — keyboard, display, side-panel, command palette)
6. `unit-tests`        (docs/TESTS.md — drive flake/skip count down, harden tests)
7. `code-review`       (docs/REVIEW.md — doc↔code drift audit)

## Pointer

Last lane: data-types
Last run: 2026-06-17 13:00

---

## Run log

Newest entry per lane (older history is in git). Each run appends one entry:
date, lane, what shipped, test result, what's next.

### 2026-06-17 13:00 — data-types
The 11:34 run queued UTPC/UTPT symmetric b-slot V/M pins, but those are
already fully covered (variate-V session248; variate-M + ν-V + ν-M
session316), so I closed the analogous gap one family over: the
combinatorial COMB/PERM/IQUOT/IREMAINDER V/M `✗` cells. session267 pinned
those with BOTH-operand V/M inputs (`V V` / `M M`), which trip the
first-operand check — `_combPermArgs`'s `!isInteger(a)&&!isReal(a)` arm
(ops.js ~1827) and `_intQuotientArg(a)` (~1998/2012, evaluated before
`b`). The second-operand arm — a valid Integer `a` with a Vector/Matrix
`b` — was unguarded, exactly BETA's session323 cell one family over.
`_withListBinary` distributes Lists only, so a V/M in the b slot reaches
the inner handler's b-arm. Probed all eight live first (Integer×{V,M} for
each op → Bad argument type), then added a `session330:` block (+8 pins)
in `tests/test-types.mjs` after the session267 V/M block. No source change
— guards a refactor that drops the second-operand type check. Updated the
combinatorial-family intro note in `docs/DATA_TYPES.md`. `node
tests/test-all.mjs` → 6691 passed / 0 failed (baseline 6683). Probe ran
from `/tmp` (no repo-mount scratch left behind). Next: the lone larger
open data-types item remains Unit dim-equivalence `==` (UEQUAL / flag
flip, AUR §20, multi-run design); the stat-dist and combinatorial arity-2
V/M cells are now symmetric (both operand positions) across the board.

### 2026-06-17 12:44 — command-support
Closed two of the three zero-coverage aliases the 11:18 run queued: `ISOL`
(SOLVE alias) and the ASCII `LIST->` alias (Unicode `LIST→` was already
tested). `ISOL` is `register('ISOL', lookup('SOLVE').fn)` and had ZERO test
mention; `LIST->` and `LIST→` share `_fromListOp` but only the Unicode name
was exercised. Both are reachable without a loaded CAS for the pinned paths:
SOLVE's argument-type checks throw before the `giac.isReady()` gate, and
`_fromListOp`'s `isList` guard is CAS-free. Probed shapes against the existing
SOLVE/LIST→ test patterns, then added a `session329:` block in
`tests/test-algebra.mjs` (+4: alias-identity, the shared `solve(X^2-4,X)`
Giac route via fixture → `{ X=2 X=-2 }`, non-Name/String var rejection,
non-expression operand rejection) and in `tests/test-lists.mjs` (+3:
alias-identity, identical `{7 8 9} LIST->` → `7 8 9 3` expansion, non-List
`Bad argument type` rejection). No source change — guards a refactor that
re-implements either alias inline and drops the shared handler/validator.
Updated the SOLVE/ISOL and `→LIST`/`LIST→` rows in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 6683 passed / 0 failed (baseline 6676). Next:
`SIMPLIFY` is the lone remaining zero-coverage op from the 09:34 enumeration
but its Giac init exceeds the 45 s bash cap; JORDAN remains the only ✗,
blocked on the same Giac-init cap (per sessions 199/200).

### 2026-06-17 12:28 — code-review
Closed the 11:01 run's queued O-013 follow-up: the AVAILABLE-TOOLS *argument
names* were unguarded against the registry handlers' destructured keys
(O-015 pinned tool names, O-016 pinned confirm flags, arg names were the
remaining gap). The model emits `"arguments":{...}` verbatim while each
handler destructures one fixed key (`({ text }) => tools.run(...)`); a rename
on either side silently makes the action run empty. Probed live first (all 8
tools match: run→text, push_to_stack→value, append_to_editor→text,
recall_var→name, four read-only tools take no args), then added a `session328:`
block (+25 pins) in `tests/test-chatbot-parse.mjs` after the session321
confirm block: introspect each handler's real read-keys with a recording
`Proxy` args object + no-op `_tools` proxy (DOM-free), parse advertised arg
keys from the prompt, assert set-equality per tool both directions + a `>= 8`
floor. Test-only — guards a handler/prompt arg-name desync. Filed/resolved as
O-017 in `docs/REVIEW.md`. Also ran the standing pattern-1 reconciliation:
`register(` = 482, `^register(` = 463, live `allOps()` = 467, COMMANDS.md
✓:449 / ROADMAP "449 ops" — all unchanged, no drift. `node tests/test-all.mjs`
→ 6676 passed / 0 failed (baseline 6651). Probe ran from `/tmp` (no repo-mount
scratch left behind). Next: the AVAILABLE-TOOLS prompt↔registry contract is now
fully pinned (names + confirm + arg names); remaining code-review candidates
are the standing O-013 RPL_CATALOG re-audit on the next op ship and the
pattern-2 doc-stamp back-fill sweep.

### 2026-06-17 12:12 — unit-tests
Closed session320's queued next-step: the core binary arithmetic
(`+ - * /`) mixed Integer/Real coercion arm. `promoteNumericPair` sends a
both-Integer pair to the `'integer'` kind and a both-Real pair to the
`'real'` kind via `toRealDecimal`'s `isReal` arm on both sides, so
`toRealDecimal`'s *isInteger* arm (`new Decimal(v.value.toString())`,
`types.js` ~420) only fires for a MIXED Integer/Real pair — and every prior
`+ - * /` pin was both-Integer, both-Real, or Tagged-of-Real, leaving that
arm unpinned (the analogue of the MOD/MIN/MAX session320 gap). Probed all
eight live first (Integer 7 ∘ Real 2.5 and Real 7.5 ∘ Integer 2 for each op
→ Real 9.5/9.5, 4.5/5.5, 17.5/15, 2.8/3.75), then added a `session327:`
block (+8 pins) in `tests/test-numerics.mjs` after the session320 MOD/MIN/MAX
block, asserting `isReal` + exact value on both operand positions. No source
change — guards a refactor dropping/narrowing `toRealDecimal`'s Integer arm.
Updated `docs/TESTS.md` (count 6583→6651, coverage note, advanced the
evergreen queue). `node tests/test-all.mjs` → 6651 passed / 0 failed
(baseline 6643). Probe ran from `/tmp` (no repo-mount scratch left behind).
Next: re-enumerate `✓` cells for any op whose result-type-determining
coercion arm is exercised only by a sibling type — the comparison family's
promoteNumericPair-backed ordered ops and the Complex-promotion arm
(Integer/Real ∘ Complex → Complex via `toComplex`'s per-type arms) are the
next candidates.

### 2026-06-17 12:08 — ui-development
Closed the 10:32 run's queued candidate ("the annunciator label/glyph maps
— `setBinaryBaseAnnunciator`, `setCoordMode`, `setDisplayAnnunciator` — are
small pure string mappings still entangled with DOM, extract-and-pin
candidates"). Extracted the three label/glyph maps from `display.js` into
pure exports `binaryBaseLabel(base)`, `displayModeLabel(mode, digits)`, and
`coordModeGlyph(mode)`, and routed the three Display methods through them.
Behavior-identical refactor — each method still drives `textContent`/`title`
off the returned label; the divergent fallbacks are preserved (unknown base
→ undefined so the annunciator hides; falsy/unknown display mode → 'STD'
ignoring digits; unknown coord mode → 'XYZ'). Probed all three maps + their
fallbacks live first, then added a `session326:` block (+18 pins) in
`tests/test-ui.mjs` after the session319 normalizeMenuSlots block (imported
the three new exports): the known-key maps, the STD-vs-FIX/SCI/ENG digit
handling, mode upper-casing, and the deliberate case-sensitivity of the
base/coord keys. No ROADMAP edit: annunciator rendering has no dedicated
§5/§6 bullet, so adding one would be drift (per the session319 precedent).
`node tests/test-all.mjs` → 6643 passed / 0 failed (baseline 6625). Probe
ran from `/tmp` (no repo-mount scratch left behind). Next: the command-palette
overlay, contextual-help tooltip copy, and DBUG/SST step indicator remain the
only uncovered UI surfaces (all DOM, need a render harness); the Display
class's pure string-building helpers are now all extracted and pinned.

### 2026-06-17 11:52 — ai-chatbot
Closed an unguarded sub-branch of `findMachineSectionStart`
(`www/src/ai/chat-bot.js`): the `Math.min(jIdx, sIdx)` arm was only pinned
for the SUGGEST-before-JSON ordering (session-old block at test line ~182,
where min picks sIdx). But the system prompt's REPLY FORMAT emits TOOL CALLS
*before* SUGGEST, so the live document ordering is JSON-first — the arm that
must pick jIdx — and that was untested. Probed all four live first (json-first
→ JSON offset; two-JSON-then-SUGGEST → first `{` offset; sug-first → SUGGEST
offset unchanged; lowercase `suggest:` after JSON → JSON offset via the
case-insensitive marker), then added a `session325:` block (+3 pins) in
`tests/test-chatbot-parse.mjs` right after the earliest-marker block:
JSON-precedes-SUGGEST, multiple JSON anchors before SUGGEST, and a lowercase
trailing suggest marker. No source change — guards a refactor that returns the
wrong marker (or drops the min) when both markers are present in spec order.
`node tests/test-all.mjs` → 6625 passed / 0 failed (baseline 6622). Probe ran
from `/tmp` (no repo-mount scratch left behind). Next: the markdown→DOM
renderer and the streamed-bubble body assembly in chat-bot.js remain the only
uncovered AI surfaces (both DOM, need a render harness); the pure helpers of
chat-bot.js / remote-llm.js are now genuinely fully pinned across both marker
orderings.

### 2026-06-17 11:48 — rpl-programming
Closed the 10:02 run's queued candidate (RPL.md ~404 "Known issues":
confirm `_skipPastCaseEnd` + auto-close compose for mixed CASE-inside-IF).
session067 only covered the *truthy* IF case (where the inner CASE then
runs); the *falsy* path — where `scanAtDepth0`→`_skipPastCaseEnd` must skip
the entire never-executed CASE to land the IF's ELSE/END boundary — was
unpinned, exactly the "weird errors from mixed CASE-inside-IF nesting" the
note warns about. Probed all five live first, then added a `session324:`
block (+5 pins) in `tests/test-control-flow.mjs` after the session067
"CASE nested inside IF" block: falsy IF skips a whole multi-clause CASE →
ELSE (999); falsy IF skips a CASE-nesting-CASE (recursion in
`_skipPastCaseEnd`) → ELSE (888); falsy IF no-ELSE skips CASE to find own
END (clean no-op); truthy no-ELSE counterpart runs the CASE default and
finds the IF END past it (7); and the greedy corner where a CASE missing
its own inner END auto-closes past the enclosing IF's ELSE (defined no-op,
not an error). No source change — guards a refactor of the
skip-past-CASE counting. Updated the RPL.md "Known issues" CASE note.
`node tests/test-all.mjs` → 6622 passed / 0 failed (baseline 6617). Note:
sandbox bash can't delete from the repo mount, so this run's scratch lives
in `/tmp` (no repo-mount scratch left behind). Next: the lone larger open
item remains halted-stack persistence across `persist.js` (page refresh
drops the LIFO; generators aren't JSON-serialisable — needs a token/IP
capture design); the CASE-inside-IF nesting class is now pinned on both
truthy and falsy paths.
