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

### 2026-06-17 11:34 — data-types
Closed the 09:48 run's queued follow-up: BETA's b-arg (right-side) V/M
rejection, the analogous unpinned cell to session244's a-arg V/M pins.
`_withListBinary` distributes Lists only, so a Vector/Matrix in the b slot
falls through to `_betaScalar` where `bNum = null` → `Bad argument type`,
independent of the a operand's kind. Probed all four live first
(`Beta(Integer|Real, Vector|Matrix)` → Bad argument type), then added a
`session323:` block (+4 pins) in `tests/test-types.mjs` right after the
session244 a-arg V/M block: Integer-a × {Vector, Matrix} and Real-a ×
{Vector, Matrix}. No source change — guards a refactor that adds
`_withVMBinary` to BETA or widens `_betaScalar`'s b coercion. Updated the
BETA note row in `docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 6617
passed / 0 failed (baseline 6613). Probe ran from `/tmp` (no repo-mount
scratch left behind). Next: the lone larger open data-types item remains
Unit dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design);
also worth a sweep of the other arity-2 stat-dist ops (UTPC/UTPT) for a
symmetric b-slot V/M pin if only one operand position is currently guarded.

### 2026-06-17 11:18 — command-support
Closed two of the zero-coverage ops the 09:34 run queued: the registered
`UNDO`/`REDO` stack-history ops, which had NO test mention via the op
registry — session064 pinned only the `LASTSTACK` alias, and every other
undo/redo test drives `Stack.undo()`/`redo()` directly, never `lookup('UNDO')`.
Probed all paths live first (op round-trip restores then re-applies; both
empty-history paths throw `No undo available`/`No redo available`; a fresh
`saveForUndo` after an undo invalidates the redo op), then added a
`session322:` block (+5 pins) in `tests/test-stack-ops.mjs` after the
session064 LASTSTACK block, all through `lookup('UNDO'|'REDO').fn`. No source
change — guards a refactor that rewires the registered ops off
`s.undo()`/`s.redo()`. Updated the `UNDO`/`LASTSTACK`/`REDO` row in
`docs/COMMANDS.md`. `node tests/test-all.mjs` → 6613 passed / 0 failed
(baseline 6608). Note: sandbox bash can't delete from the repo mount, so
scratch `tests/_probe_undoredo.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: three
zero-coverage ops remain from the 09:34 enumeration — `ISOL` (SOLVE alias),
`LIST->` (`_fromListOp` ASCII alias), and `SIMPLIFY` (Giac, init exceeds the
45 s bash cap); ISOL and LIST-> are reachable without a loaded CAS and are the
next coverage pins.

### 2026-06-17 11:01 — code-review
Closed the 09:21 run's queued follow-up: the prompt's AVAILABLE-TOOLS
*descriptions* (confirm/read-only semantics) were unguarded against the
registry's `confirm` flags — O-015 made only the tool *name* set evergreen.
The prose advertises each tool as "Requires user confirmation" (mutating) or
"Auto-executes (read-only)", while `chat-bot.js _buildRegistry`'s `confirm`
boolean is what the orchestrator actually gates on, so a tool flipped
read-only<->mutating in one place but not the other would silently mislead
the model. Probed live first (all 8 parse cleanly: the four mutating ops are
`confirm:true`+"Requires user confirmation", the four read-only ops are
`confirm:false`+"Auto-executes"), then added a `session321:` block (+25 pins)
in `tests/test-chatbot-parse.mjs` after the AVAILABLE-TOOLS name-sync block:
per tool, derive the documented semantic from its description, assert it
equals the registry flag, plus a mutual-exclusion check (exactly one phrase)
and a `>=8` extraction floor. Test-only — guards a `_buildRegistry` confirm
flip or a prompt prose edit that desync. Filed/resolved as O-016 in
`docs/REVIEW.md`. `node tests/test-all.mjs` → 6608 passed / 0 failed
(baseline 6583). Note: sandbox bash can't delete from the repo mount, so
scratch `tests/_probe_confirm.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: the
standing pattern-1 Counts reconciliation (COMMANDS.md "✓: 449" / ROADMAP "449
ops" vs live register/allOps totals) and O-013's per-tool arity/argument-name
hints in the AVAILABLE-TOOLS JSON are the remaining drift-guard candidates.

### 2026-06-17 10:46 — unit-tests
Continued the evergreen per-arm coercion sweep (session314's queued
next-step), targeting the MOD / MIN / MAX mixed-operand arm. Both ops keep an
Integer×Integer branch and an `else` branch that promotes via
`isReal(v) ? v.value : new Decimal(isInteger(v) ? v.value.toString() : …)`;
the `new Decimal(v.value.toString())` arm fires ONLY for a mixed Integer/Real
pair (both-Integer skips the `else`, both-Real takes the `isReal` arm). MOD
had no mixed pin (every test was both-Real or both-Integer), and MIN/MAX
pinned only the left-operand (`da`) Integer arm via `MAX(Integer 5, Real 9.5)`
— the right-operand (`db`) arm was untested. Probed all seven live first
(MOD mixed ±, MIN/MAX `db`-Integer, MIN `da`-Integer), then added a
`session320:` block (+7 pins) in `tests/test-numerics.mjs` after the MIN/MAX
block. No source change — guards a refactor that drops or narrows that
coercion arm. Updated `docs/TESTS.md` (count 6576→6583, coverage note,
advanced the evergreen queue). `node tests/test-all.mjs` → 6583 passed / 0
failed (baseline 6576). Note: sandbox bash can't delete from the repo mount,
so scratch `tests/_probe_modmix.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: the
binary arithmetic (`+ - * /`) R/Z cells are the remaining per-arm sweep
candidates; `%` has no distinct Z arm (`_percentOp` runs `toRealOrThrow` on
both operands → always Real).

### 2026-06-17 10:32 — ui-development
Closed the 09:01 run's queued candidate ("Display's other string-building
methods — menu-slot labels — are the next extract-and-pin candidate"):
extracted setMenu's slice/pad into a pure `export function
normalizeMenuSlots(slots)` (`www/src/ui/display.js`) and routed setMenu
through it. HP50 soft-menu rows always have six slots, so the helper
truncates anything past the sixth and pads short arrays with '' (returns a
fresh array; input untouched). Behavior-identical refactor — `Display.menuSlots`
is internal (only setMenu writes it, only its render reads it; App keeps its
own separate menuSlots), and callers already pass string labels. Added a
`session319:` block (+6 pins) in `tests/test-ui.mjs` (imported the new
export): short→padded, empty→six blanks, exactly-six unchanged + length,
more-than-six truncated, and the input-not-mutated/fresh-array invariant.
No ROADMAP edit: menu-slot rendering has no dedicated §5/§6 bullet, so adding
one would be drift (per the session313 escapeHtml precedent). `node
tests/test-all.mjs` → 6576 passed / 0 failed (baseline 6570). Next: the
annunciator label/glyph maps (`setBinaryBaseAnnunciator`, `setCoordMode`,
`setDisplayAnnunciator`) are small pure string mappings still entangled with
DOM — extract-and-pin candidates; the command-palette overlay and
contextual-help tooltip copy remain the only DOM-only uncovered surfaces
(need a render harness).

### 2026-06-17 10:18 — ai-chatbot
Closed the remaining unguarded early-return and coercion arms of
`parseSuggestions` (`www/src/ai/chat-bot.js`). The pure-surface "all
pinned" claim was overstated: prior blocks only exercised well-formed
brackets and empty-STRING filtering. Four marker-present-but-malformed /
non-string paths had no pin — the `lo < 0` no-opening-bracket return, the
`hi < 0` unbalanced-bracket return, tryParse's `typeof v === 'string'`
coercion arm (non-string elements → `''` → filtered), and the
neither-parse-nor-quoted-fallback `null`. Probed all six live first
(`SUGGEST: nothing` → null, `SUGGEST: ["a","b"` → null, mixed
`["keep",42,true,null,"also"]` → `["keep","also"]`, `[1,2,3]` → null,
`[unquoted, junk,]` → null), then added a `session318:` block (+5 pins)
in `tests/test-chatbot-parse.mjs` after the parseSuggestions null-marker
block. No source change — guards a refactor that drops the bracket-locator
guards or narrows the string-coercion arm. `node tests/test-all.mjs` →
6570 passed / 0 failed (baseline 6565). Note: sandbox bash can't delete
from the repo mount, so scratch `tests/_probe_suggest.mjs` (plus older
`_probe_*`) stays untracked — harmless, test-all.mjs imports an explicit
file list, not a glob. Next: the markdown→DOM renderer and the
streamed-bubble body assembly in chat-bot.js remain the only uncovered AI
surfaces (both DOM, need a render harness); the pure surface of
chat-bot.js / remote-llm.js is now genuinely fully pinned.

### 2026-06-17 10:02 — rpl-programming
Fixed a doc↔code drift in the lane notes and pinned the actual behavior.
The auto-close policy in `docs/RPL.md` listed `CASE-without-THEN` in the
hard-error set, but the same paragraph's parenthetical (and `runCase`,
ops.js ~3826) say a CASE with no THEN is NOT an error — the whole clause
range becomes the default and runs. The doc contradicted itself; the
hard-error list was the wrong side. Probed live first (`« CASE 1 2 + END »`
→ 3, `« CASE 1 2 + »` auto-closes → 3, `« CASE END »` / bare `« CASE »` →
no-op), then removed `CASE-without-THEN` from the hard-error list, rewrote
the clarifying sentence, and added a `session317:` block (+4 pins) in
`tests/test-control-flow.mjs` after the session073 outer-CASE auto-close
block: explicit-END default-clause, auto-closed default-clause, empty-body
no-op, bare-opener no-op. No source change — guards a future strictness
change that would raise "CASE without THEN". `node tests/test-all.mjs` →
6565 passed / 0 failed (baseline 6561). Note: sandbox bash can't delete
from the repo mount, so scratch `tests/_probe_casenothen.mjs` (plus older
`_probe_*`) stays untracked — harmless, test-all.mjs imports an explicit
file list, not a glob. Next: the "Known issues" CASE-inside-IF nesting note
(RPL.md ~404) is the next coverage candidate — pin a mixed CASE-inside-IF
with a missing inner END to confirm `_skipPastCaseEnd` + auto-close compose;
the lone larger open item remains halted-stack persistence across
`persist.js`.

### 2026-06-17 09:48 — data-types
Closed the queued (session 08:24) follow-up: the documented-but-unguarded
M `✗` and ν-position V/M `✗` cells on UTPC/UTPT. session248 pinned ONLY a
Vector in the variate (x/t) slot for each; the Matrix cells and the
first-operand (ν) collection rejections both ops document had no guard.
`_withListBinary` distributes Lists only, so a Vector/Matrix in EITHER slot
falls through to the `_utpcScalar`/`_utptScalar` `asReal` (isInteger/isReal
only) → `Bad argument type`. Probed all six live first (UTPC/UTPT × {Matrix
in x/t, Vector in ν, Matrix in ν} all → Bad argument type), then added a
`session316:` block (+6 pins) in `tests/test-types.mjs` after the session248
block. No source change — guards a refactor that adds `_withVMBinary` or
widens `asReal`. Updated the UTPC/UTPT note rows in `docs/DATA_TYPES.md`.
`node tests/test-all.mjs` → 6561 passed / 0 failed (baseline 6555). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_utpcm.mjs` (plus older `_probe_*`) stays untracked — harmless,
test-all.mjs imports an explicit file list, not a glob. Next: BETA's V/M
rejections only pin the a-arg position (session244); the b-arg (right-side)
V/M rejection is the analogous unpinned cell. The lone larger open
data-types item remains Unit dim-equivalence `==` (UEQUAL / flag flip, AUR
§20, multi-run design).

### 2026-06-17 09:34 — command-support
JORDAN remains the lone ✗ and stays blocked here (Giac WASM init ~40-45 s
exceeds the 45 s bash cap, per session 199/200), so I closed a fresh
✓-criterion gap instead: an enumeration of all 463 registered ops against
the test corpus surfaced nine ops with ZERO test mention, four of which form
the VX-implicit calculus cluster — `INTVX`, `DERVX`, `DERIVX`, and the `∫`
glyph. `INTVX`/`DERVX` push `Name(getCasVx())` then delegate to `INTEG`/`DERIV`;
`DERIVX` aliases `DERVX`; `∫` is the raw 2-arg `INTEG` alias. Probed live
(Giac unloaded): a non-symbolic operand (Vector/List/Complex/Matrix) falls
through every accepted-type branch to the delegate's final `Bad argument type`
throw BEFORE any `giac.isReady()` check, and the empty stack hits the wrapper's
`Too few arguments` guard (`∫` rejects a single operand on INTEG's 2-arg pop).
Added a `session315:` block (+20 pins) in `tests/test-algebra.mjs` after the
DERIV bad-arg block — 3 ops × (4 bad types + empty) plus `∫` × (4 bad exprs +
single-operand). No source change — guards a refactor that drops the delegates'
type guards or reorders them after the Giac call. Updated `docs/COMMANDS.md`
(new INTVX/DERVX/DERIVX/∫ row). `node tests/test-all.mjs` → 6555 passed / 0
failed (baseline 6535). Note: sandbox bash can't delete from the repo mount, so
scratch `tests/_probe_calc.mjs`/`_probe_calc2.mjs` (plus older `_probe_*`) stay
untracked — harmless, test-all.mjs imports an explicit file list, not a glob.
Next: five more zero-coverage ops remain from the enumeration — `ISOL` (SOLVE
alias), `LIST->` (`_fromListOp` ASCII alias), `SIMPLIFY` (Giac), and the
`UNDO`/`REDO` stack-history ops — each warrants a coverage pin (UNDO/REDO need
a non-type happy/empty-history path, not a type rejection).

### 2026-06-17 09:21 — code-review
Hardened the registry↔prompt sync guard, which was itself a drift surface
(filed/resolved as O-015 in `docs/REVIEW.md`). The AVAILABLE-TOOLS sync block
and the alias target-side block in `tests/test-chatbot-parse.mjs` each asserted
against a hard-coded 8-name literal (`expected` / `canonical`) — three
hand-maintained copies of the same list (prompt, `_buildRegistry`, twice in the
test), and the guard never actually read the registry despite its comment
claiming to catch drift "from chat-bot.js _buildRegistry". Verified the live
registry is extractable DOM-free first (`ChatBot.prototype._buildRegistry.call({
_tools: {}, _getContext: () => ({}) })` → exactly the 8 keys; the method reads
only `this._tools`/`this._getContext`), then added a `registryToolNames()` helper
and routed both blocks through it, removing both literals and adding a `>= 8`
extraction floor. Now a tool added to `_buildRegistry` but not the prompt (or
vice versa) fails the suite. Test-only change; `ChatBot` added to the test's
chat-bot.js import. Also ran the standing pattern-1 reconciliation: `register(`
= 482, `^register(` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged, no drift. `node tests/test-all.mjs` → 6535 passed / 0 failed
(baseline 6534). Next: the prompt's AVAILABLE-TOOLS *descriptions* (confirm/
read-only semantics) are still unguarded against the registry's `confirm` flags
— a tool flipped read-only↔mutating in `_buildRegistry` without a prompt edit
would drift silently; pinning each documented tool's confirm semantics against
the live registry entry is the next code-review increment.

### 2026-06-17 09:07 — unit-tests
Closed the GCD/LCM R* (`~`) integer-valued-Real *acceptance* gap from the
lane's evergreen ✓/`~`-cell audit. The DATA_TYPES R* cell ("R accepted only
when integer-valued") is `_toBigIntOrThrow`'s `isReal(v) &&
v.value.isInteger()` branch (`ops.js` ~1561), a distinct arm from the
`isInteger(v)` branch every Integer-operand pin already hits. session064
pinned only the NEGATIVE side (non-integer Real 1.5 rejected via a Tagged);
every positive GCD/LCM pin pushed Integer, so the integer-valued-Real
acceptance arm was never positively exercised. Probed all cases live first
(R×R, R×Z, Z×R all → Integer; non-integer Real → Bad argument value), then
added a `session314:` block (+7 pins) in `tests/test-numerics.mjs`:
`Real(12) Real(18) GCD` → 6, both mixed sides (`Real×Integer` / `Integer×Real`)
→ 6, `Real(0) Real(7)` → 7 (zero boundary), `Real(4) Real(6)` / `Real(4)
Integer(6)` LCM → 12, and a bare non-Tagged `Real(4.2) Integer(6) LCM` → 'Bad
argument value' contrast. No source change — guards a refactor narrowing
GCD/LCM to Integer-only (dropping the isReal arm). Updated `docs/TESTS.md`
(count 6467→6534, coverage note, advanced the evergreen queue). `node
tests/test-all.mjs` → 6534 passed / 0 failed (baseline 6527). Note: sandbox
bash can't delete from the repo mount, so scratch `tests/_probe_gcdreal.mjs`
(plus older `_probe_*`) stays untracked — harmless, test-all.mjs imports an
explicit file list, not a glob. Next: extend the sweep beyond the Z column —
confirm the binary arithmetic / MIN / MAX / % R and Z cells each carry a
positive pin on their own coercion arm, not only a sibling type's.

### 2026-06-17 09:01 — ui-development
Extracted the HTML-escaper that display.js inlined three times into a pure
`export function escapeHtml(text)` (`www/src/ui/display.js`) and routed all
three call sites through it — the matrix-cell and list-item renderers
(`_renderTextbookMatrix`/`_renderTextbookList`, both already escaping all
four chars) and `setPath`'s segment renderer, which previously escaped ONLY
`&` and `<` and silently dropped `>`/`"`. So this both de-duplicates (per
CLAUDE.md "reach for a helper before duplicating logic") and fixes a real
under-escaping inconsistency on the directory-path annunciator. Behavior of
the two cell renderers is identical; setPath now escapes the full four-char
set. Added a `session313:` block (+9 pins) in `tests/test-ui.mjs` (imported
the new export): each of the four chars individually, all-four-in-one-pass
(ampersand-first so entity markers aren't re-escaped), a literal-entity
round-trip, number coercion, and empty/plain degenerates. No ROADMAP edit:
display.js's HTML-escaping has no dedicated §5/§6 bullet, so adding one would
be drift (per the session301/307 precedent). `node tests/test-all.mjs` →
6527 passed / 0 failed (baseline 6518). Next: the command-palette overlay,
contextual-help tooltip copy, and DBUG/SST step indicator remain the only
uncovered UI surfaces (all DOM, need a render harness); the Display class's
other string-building methods (`renderStack` rows, menu-slot labels) are the
next extract-and-pin candidates if a small piece can be factored DOM-free.

### 2026-06-17 08:43 — ai-chatbot
Closed two unguarded branches in chat-bot.js's history-budget math. Only the
no-model fallback (4096), the remote probed/unprobed paths, and the
unknown-catalog-id `?? 4096` fallback of `activeContextTokens` were pinned —
leaving the POSITIVE in-catalog worker-model branch (`MODELS.find(...).
contextTokens`) and `effectiveBudget`'s `Math.max(0, …)` zero-floor untested.
Probed all live first, then added a `session312:` block (+5 pins) in
`tests/test-chatbot-parse.mjs`: a worker LLM (no `endpoint`) whose id is in
MODELS resolves its real 32768 (and `effectiveBudget` → 32768*4-4000); a
worker LLM carrying a stray `contextTokens` field is IGNORED because the
remote branch is gated on a string `endpoint`, so the catalog still wins
(duck-typing pin); and a tiny remote window (500 tokens) floors the budget at
0 instead of going negative. No source change — guards a refactor that drops
the catalog lookup or the zero-floor. `node tests/test-all.mjs` → 6518 passed
/ 0 failed (baseline 6513). Note: sandbox bash can't delete from the repo
mount, so scratch `tests/_probe_budget.mjs` (plus older `_probe_*`) stays
untracked — harmless, test-all.mjs imports an explicit file list, not a glob.
Next: every pure surface in chat-bot.js / remote-llm.js is now pinned; the
markdown→DOM renderer and the streamed-bubble body assembly in chat-bot.js
remain the only uncovered AI surfaces (both DOM, need a render harness).

### 2026-06-17 08:41 — rpl-programming
Extended the zero-step `STEP` guard coverage. `runLoopBody` (shared by
START and FOR, ops.js ~4331) throws `STEP of 0` because a zero step is an
infinite loop on the real machine; the guard has two arms — `step === ZERO`
(int-mode) and `step === 0` (real-mode, hit when a bound is Real or when an
Integer-bounded loop pops a Real step and demotes mid-loop). session122
pinned ONLY the FOR int-mode arm, leaving START (the `varName === null` path
through the same helper), the real-mode arm, and the demote-then-zero corner
unguarded. Probed all five live first (START int / START real / START
int-demoted-by-Real0 / FOR real / FOR int-demoted-by-Real0 — each throws
exactly `STEP of 0`; note START needs a stack seed so its `1 +` body has an
operand), then added a `session311:` block (+7 pins) in
`tests/test-control-flow.mjs` right after the session122 block. No source
change — guards a refactor that splits the shared helper or narrows the zero
check to one mode. Updated the structured-control-flow section in
`docs/RPL.md`. `node tests/test-all.mjs` → 6513 passed / 0 failed (baseline
6506). Note: sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_step0.mjs` (plus older `_probe_*`) may stay untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: the
`MAX_LOOP_ITERATIONS` ceilings (WHILE/DO/runLoopBody, ops.js ~4150/4190/4309
+ 8949) have zero pins but triggering them needs ~1M iterations (too slow for
the fast suite) — consider exporting the constant or a small injectable cap;
otherwise the counter-loop guard surface is now fully pinned.

### 2026-06-17 08:24 — data-types
Closed the documented-but-unguarded L/V/M `✗` cells on UTPF — the
asymmetric stat-dist op whose bare 3-arg handler has NO `_withListBinary`
wrapper (unlike UTPC/UTPT, which list-distribute their variate). Only the
Complex rejection was pinned (session069); the collection-type rejections
the doc asserts had no guard. `asReal` runs on every popped operand before
any value check and accepts only Integer/Real, so a List/Vector/Matrix in
ANY of the three slots throws `Bad argument type`. Probed all cases live
first (List/Vector/Matrix in the F-variate, ν, and denominator positions
all → Bad argument type), then added a `session310:` block (+6 pins) in
`tests/test-numerics.mjs`: each of List/Vector/Matrix in the F-variate
position (the slot UTPC/UTPT distribute over) and in the ν position →
`Bad argument type`. No source change — guards a refactor that adds
`_withListBinary` to UTPF or widens `asReal` past Integer/Real. Updated the
UTPF row note in `docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 6506
passed / 0 failed (baseline 6500). Note: sandbox bash can't delete from the
repo mount, so scratch `tests/_probe_utpfcoll.mjs` (plus older `_probe_*`)
stays untracked — harmless, test-all.mjs imports an explicit file list, not
a glob. Next: BETA's V/M `✗` (same no-`_withVMBinary` shape) and UTPC/UTPT's
V/M `✗` rejections are the analogous unpinned collection cells; the lone
larger open data-types item remains Unit dim-equivalence `==` (UEQUAL / flag
flip, AUR §20, multi-run design).

### 2026-06-17 08:21 — command-support
Closed session 203's queued follow-up: the type-rejection sweep for the
remaining MODULO-ARITH family ops EXPANDMOD / FACTORMOD (unary) and
GCDMOD / DIVMOD / DIV2MOD (binary) — only ADDTMOD/SUBTMOD/MULTMOD/POWMOD
had rejection pins, but the lane ✓-criterion wants ≥1 per op. Each guards
its symbolic path with the shared `_toAst` null-check, which throws
`Bad argument type` before the `giac.isReady()` check, so the rejections
hold without a loaded CAS (a non-int-like binary operand also skips the
BigInt fast path first). Probed all 20 cases live, then added a
`session204:` block (+20 pins) in `tests/test-algebra.mjs`: each op on
Vector / List / Complex / String → `Bad argument type` (modulo set to 7 so
FACTORMOD's prime-<100 modulus precondition passes and its operand-type
rejection is reachable). No source change — guards a refactor that drops
the `_toAst` guard or splits the family's shared helpers. Updated
`docs/COMMANDS.md` (all five rows). `node tests/test-all.mjs` → 6500 passed
/ 0 failed (baseline 6480). JORDAN remains the lone ✗, still blocked (Giac
WASM init ~40-45 s exceeds the 45 s bash cap). Note: sandbox bash can't
delete from the repo mount, so scratch `tests/_probe_mod5.mjs` (plus older
`_probe_*`) stays untracked — harmless, test-all.mjs imports an explicit
file list, not a glob. Next: the whole MODULO-ARITH family now has type-
rejection coverage; the lane's remaining work is the JORDAN Giac-shape
capture on a host where init fits the cap.

### 2026-06-17 08:04 — code-review
Closed the prior code-review run's queued "sweep parser.js exported-fn
JSDoc" follow-up, but the real drift was in `parser.js`'s file-header
comment, not a JSDoc: it listed the parser as covering
"reals…lists, programs, and vectors" while the code also produces
`Matrix` (`[[..]]`, parser.js:548), `Unit` (`n_uexpr`, :259), and
`Symbolic` backtick algebraics (:387) — all added since the comment was
written but never folded in (same doc↔code class as R-013). Verified each
kind is produced (live probe + constructor sites), rewrote the header to
list vectors/matrices/programs/units/algebraics, and added a `session309:`
block (+13 pins) in `tests/test-entry.mjs` asserting `parseEntry` yields
each documented kind plus the unrecognised→bare-Name fallthrough, so the
comment can't silently drift again. Filed/resolved as R-014 in
`docs/REVIEW.md`. Also ran the standing pattern-1 reconciliation: `register(`
= 482, `^register(` = 463, COMMANDS.md ✓:449 — all unchanged, no drift.
`node tests/test-all.mjs` → 6480 passed / 0 failed (baseline 6467). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_hdrkinds.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next:
`tokenize` (the other public export) has no JSDoc/return-shape claim, so
no drift to fix there; the next code-review increment is the standing
O-013 RPL_CATALOG re-audit on the next op ship, or the pattern-2 doc-stamp
back-fill sweep.

### 2026-06-17 07:58 — unit-tests
Closed the queued stat-dist Z-cell positive-coverage gap (the lane's
evergreen `✓`-cell audit). The `asReal` integer arm
(`isInteger(v) ? Number(v.value)`) for the distribution *variate* operand
was never positively pinned: every session069 UTPF case pushed a Real `F`
and every UTPT case a Real `t` (n/d/ν were always Integer, so only the
degrees-of-freedom integer arm was exercised). UTPC's `x` integer arm was
already covered by session068's `UTPC(2, 6)`. Probed live first, then added a
`session308:` block (+6 pins) in `tests/test-numerics.mjs`: `UTPF(2, 4,
Integer 3)` → 0.16 (n=2 closed form S(F) = (1+(n/d)F)^(-d/2)), an Integer-F ==
Real-F coercion-parity pin, `UTPF(5, 10, Integer 0)` → 1 (integer
short-circuit), `UTPT(1, Integer ±1)` → 0.25 / 0.75 (Cauchy closed form +
t-symmetry), and `UTPT(5, Integer 0)` → 0.5 (integer short-circuit). No source
change — guards a refactor narrowing the variate's Integer coercion, which
would degrade the Z column there to Real-only. Updated `docs/TESTS.md` (count
6430→6467, coverage note, advanced the evergreen queue). `node
tests/test-all.mjs` → 6467 passed / 0 failed (baseline 6461). Note: sandbox
bash can't delete from the repo mount, so scratch `tests/_probe_statz.mjs`
(plus older `_probe_*`) stays untracked — harmless, test-all.mjs imports an
explicit file list, not a glob. Next: re-enumerate `✓` cells across the rest
of the type matrix for the same Real-only pattern; the special-function and
stat-dist Z columns are now all covered.

### 2026-06-17 07:43 — ui-development
Pinned the lone unguarded branch of `handleModifierShortcut`
(`www/src/ui/shortcuts.js`): the deliberate `!e.shiftKey` guard on the
V arm, which declines Ctrl/Cmd-Shift-V so the browser's native
plain-text paste keeps working (parallel to the already-pinned Ctrl-C
decline). Only one `shiftKey:true` case existed before (Shift-Ctrl-Z
redo); the shifted-V passthrough and the Y-arm's shift-insensitivity
were untested. Added a `session307:` block (+7 pins) in
`tests/test-ui.mjs`: Ctrl-Shift-V returns false, never reads the
clipboard facade, leaves the buffer untouched; Cmd-Shift-V likewise;
and Ctrl-Shift-Y still routes to performRedo (the `k==='y'` arm ignores
shift). No source change — guards a refactor that drops the `!e.shiftKey`
guard and would hijack plain-text paste. No ROADMAP edit: shortcuts.js's
modifier handling has no dedicated §5/§6 bullet, so adding one would be
drift (per the session301 precedent). `node tests/test-all.mjs` → 6461
passed / 0 failed (baseline 6454). Next: every pure helper in
shortcuts.js/paging.js/op-search.js/command-help.js/interactive-stack.js
is now pinned; the remaining UI surfaces (command-palette overlay,
contextual-help tooltip copy, DBUG/SST step indicator) are all DOM and
need a render harness.

### 2026-06-17 07:41 — ai-chatbot
Pinned `stripThinkBlocks`' actual reason to exist (doc point 2) — the
strip→parse hand-off — which had zero coverage despite the pure parser
helpers being "well pinned". Probed live first, then added a `session306:`
block (+8 pins) in `tests/test-chatbot-parse.mjs`: the two-replace passes
in concert (multiple complete `<think>…</think>` pairs all collapse via
the global flag; blocks interleaved with prose; a complete pair followed
by a trailing open block where the pair-collapse pass and the open-tail
pass each fire once), plus the integration the function exists for — a
`{"name":...}` shape emitted INSIDE a reasoning block parses as a real
call on the RAW text (2 calls, phantom `DROP` first) but is gone once
stripped (only the real `push_to_stack` survives); an unclosed mid-stream
think block carrying a tool-call shape is suppressed entirely so the
parser dispatches nothing; and `findMachineSectionStart` reports pure
prose (-1) once a think-wrapped call is stripped. No source change —
guards a refactor that reorders strip-vs-parse or narrows the stripper.
`node tests/test-all.mjs` → 6454 passed / 0 failed (baseline 6446). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_think.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next:
the markdown→DOM renderer and the streamed-bubble body assembly in
chat-bot.js remain the only uncovered AI surfaces (both DOM, need a render
harness); every pure surface in chat-bot.js / remote-llm.js is now pinned.

### 2026-06-17 07:40 — rpl-programming
Pinned a real, documented-but-unguarded parser behavior: auto-close of an
unterminated `«` / `<<` program. `parseProgram` (`parser.js`) exits its
`while` loop at end-of-buffer and returns `Program(body)` as-is (the
`if (idx < toks.length) idx++` only consumes a closer when present) — the
same "forgot the closer" convenience the parser already grants lists /
vectors / strings, claimed in `docs/RPL.md` but with no direct `parseEntry`
pin. Probed live first, then added a `session305:` block (+5 pins) in
`tests/test-entry.mjs`: unterminated Unicode program with trailing content
(`« 1 2 +`), the ASCII opener (`<< 1 2 +`), a bare opener (`«` → empty
program), nested both-unterminated openers (`« 1 «2 +` → inner closes then
outer), and an unterminated structural body (`« IF 1 THEN 2`, IF as one
top-level token). Each asserts token count + formatter round-trip to the
spaced, closed form. Added a one-line clarifying comment in `parseProgram`
(no behavior change) and a RPL.md bullet expansion.
`node tests/test-all.mjs` → 6446 passed / 0 failed (baseline 6441). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_acprog.mjs` (plus older `_probe_*`) stays untracked — harmless,
test-all.mjs imports an explicit file list, not a glob. Next: the lone larger
open item remains halted-stack persistence across `persist.js` (page refresh
drops the LIFO; generators aren't JSON-serialisable — needs a token/IP
capture design); the parser abutment + auto-close classes are now fully
pinned at the parseEntry level.

### 2026-06-17 07:22 — data-types
Fixed a doc↔code drift introduced by session298: the XROOT row in
`docs/DATA_TYPES.md` still carried V `✓` / M `✓`, but those cells went stale
when session298 changed `^`s Vector/Matrix base semantics. XROOT is pure
plumbing (`register('XROOT', _withListBinary(...))` pushes `1/x` then delegates
to `^`), and `_withListBinary` distributes Lists ONLY — so a Vector/Matrix
radicand reaches `^` as the base. Probed live: Vector base → `^` rejects ('Bad
argument type'; no vector power) → V `✗`; Matrix base → `^`s matrix-power needs
a whole-number exponent, but `1/x` is whole only at x=±1 (and `^` rejects
negative matrix exponents), so any genuine root rejects (`M[[8,27],[1,1]] 3
XROOT` → 'Bad argument value'; non-square → 'Invalid dimension') → M `✗`; the
lone non-error path is the degenerate `M^1` no-op at x=1 (not a matrix root).
No source change (behavior already correct post-298) — flipped the V/M cells
`✓`→`✗`, rewrote the note, and added a `session304:` block (+4 pins) in
`tests/test-types.mjs` (Vector reject, square-M non-whole-exponent reject,
non-square-M reject, plus the x=1 degenerate-identity documentation pin).
`node tests/test-all.mjs` → 6441 passed / 0 failed (baseline 6437). Note:
sandbox bash can't delete from the repo mount, so scratch `tests/_probe_*`
(incl. this run's `_probe_xrootvm.mjs`) stay untracked — harmless, test-all.mjs
imports an explicit file list, not a glob. Next: the lone larger open
data-types item remains Unit dim-equivalence `==` (UEQUAL / flag flip, AUR §20,
multi-run design); also worth a quick sweep for any OTHER op that delegates to
`^` (not its own `_withVMUnary`) and may carry stale V/M cells from session298 —
XROOT was the obvious one; SQRT/SQ use bespoke V/M paths so they're unaffected.

### 2026-06-17 07:04 — command-support
Closed the ✓-criterion rejection gap for the `CHARPOL` alias (session 202's
queued next-step: "CHARPOL has positive coverage but zero rejection pins").
`CHARPOL` is a thin wrapper — `register('CHARPOL', (s) => { OPS.get('PCAR').fn(s); })`
— so its argument rejections flow through `PCAR`'s `_popSquareMatrix` validator,
which throws `Bad argument type` (non-Matrix) / `Invalid dimension` (non-square)
*before* the `giac.isReady()` check, so they hold without a loaded CAS. `PCAR`
itself had session114 rejection pins but the alias had only happy-path coverage.
Added a `session203:` block (+4 pins) in `tests/test-algebra.mjs`: CHARPOL on
Vector / Integer / String → `Bad argument type`, and 2×3 → `Invalid dimension`.
No source change — guards a future inline reimplementation that drops the shared
validator delegation. Updated `docs/COMMANDS.md` (PCAR/CHARPOL row).
`node tests/test-all.mjs` → 6437 passed / 0 failed (baseline 6433). Only
`JORDAN` remains ✗ and stays blocked (Giac WASM init ~40-45 s exceeds the 45 s
bash cap, per session 199/200). Next: the EXPANDMOD/FACTORMOD/GCDMOD/DIVMOD/
DIV2MOD modular family each warrant a non-int-like type-rejection sweep
mirroring session 202's POWMOD work (verify which guards fire before Giac).

### 2026-06-17 06:42 — code-review
Closed the doc↔code drift the rpl-programming lane flagged (parser.js:219
run-log note): `parseEntry`'s JSDoc claimed it unwraps a single value for
one-token input and otherwise returns "a Program-like list" — both false.
The body (`const values = []; … return values;`) ALWAYS returns a plain
array (one entry per top-level object, in entry order, `[]` for
empty/whitespace), and every caller relies on it (entry loop pushes each;
`test-binary-int.mjs` checks `.length`/`[0]`), so the doc was the wrong
side. Rewrote the JSDoc to the real contract (no behavior change) and added
a `session303:` block (+3 pins) in `tests/test-entry.mjs` guarding it
(single→length-1 array, multi→one entry each, empty/blank→`[]`) so a future
unwrap-the-single-value refactor that re-creates the old doc fails the
suite. Filed it as resolved R-013 in `docs/REVIEW.md`. Also ran pattern-1
reconciliation: live `allOps()` = 467, `grep -c register(` = 482,
`^register(` = 463, JORDAN still unregistered — unchanged from recent runs,
COMMANDS.md "✓: 449" / ROADMAP "449 ops" still hold, no drift.
`node tests/test-all.mjs` → 6433 passed / 0 failed (baseline 6430). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_opcount.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next:
sweep the rest of parser.js's exported-fn JSDoc for the same
contract-vs-implementation drift class (e.g. tokenize's return shape), and
the standing O-013 RPL_CATALOG re-audit on the next op ship.

### 2026-06-16 09:58 — unit-tests
Closed the next Real-only `✓` Z cell from the lane's evergreen audit: the
rounding family's negative-`n` integer arm. `_roundingOp`'s integer
passthrough only fires for `n >= 0` (session081 pins `TRUNC(Integer(42), 3)`
→ Integer(42)); a *negative* `n` routes the Integer through the same
Real-rounding path as a Real operand, returning a `Real`, not an Integer —
and every prior pin on that arm pushed a Real `x`, so the `isInteger(xv)`
branch flowing into `Real(_applyRoundReal(...))` was never positively
exercised. Probed live first (TRNC/TRUNC(Integer(123), -1) → Real(100),
(Integer(1250), -2) → Real(1200), (Integer(7), -1) → Real(7); RND diverges
half-away → Real(1300) on 1250 at -2), then added a `session302:` block
(+8 pins) in `tests/test-numerics.mjs` right after the TRUNC suite. No source
change — guards a refactor that would let the integer arm skip the rounding fn
or wrongly return an Integer for `n < 0`. Updated `docs/TESTS.md` (count
6347→6430, new coverage note, advanced the evergreen queue).
`node tests/test-all.mjs` → 6430 passed / 0 failed (baseline 6422). Next: the
stat-dist family Z columns (UTPC/UTPF/UTPT `asReal` integer arms) are the
remaining Real-backed `✓` Z-cell candidates to enumerate.

### 2026-06-16 09:44 — ui-development
Hardened the interactive-stack controller's three mutators in
`www/src/ui/interactive-stack.js`. `rollDownToLevel` was only pinned
indirectly as the inverse of `rollLevel` (the session295 round-trip),
leaving its own corners unguarded; and the source's documented "Both
mutate in place and emit once" invariant was untested across all three.
Probed the semantics by reading the source, then added a `session301:`
block (+10 pins) in `tests/test-ui.mjs`: rollDownToLevel forward
semantics (top value lands at level N, intermediates shift up), its
level-1 no-op and out-of-range throw, dropLevel(1)-removes-the-top, and
an emit-count sweep via `Stack.subscribe` — rollLevel/rollDownToLevel/
dropLevel each emit exactly once on a real mutation while the two level-1
no-ops short-circuit before `_emit` and emit zero times. No source
change. `node tests/test-all.mjs` → 6422 passed / 0 failed (baseline
6412). Note: no matching ROADMAP bullet exists for the interactive-stack
controller (§5/§6 cover the palette + contextual help), so no ROADMAP
edit — adding one would be drift. Next: every pure helper in
interactive-stack.js, op-search.js, command-help.js, paging.js and
shortcuts.js is now pinned; the remaining UI surfaces (command-palette
overlay, contextual-help tooltip copy, DBUG/SST step-mode indicator per
§3) are all DOM and need a render harness.

### 2026-06-16 09:32 — ai-chatbot
Closed session294's queued follow-up: extracted RemoteLLM's post-stream
stats/timing math out of `generate()` into a pure `export function
summarizeRun(...)` in `www/src/ai/remote-llm.js`. It owns the subtle
derivations — totalMs/ttftMs from the three captured timestamps, and the
decode-throughput tps over the decode window — including the two guards
that matter: `firstTokenAt === null` (no token ever arrived) collapses
ttftMs/decodeTps to null while still reporting totalMs, and a zero-length
decode window (`firstTokenAt === t1`) nulls decodeTps instead of dividing
by zero. generate() now just captures t1 and passes its timings/counters
in — behavior-identical (the object shape, fixed `id:0`/`runtimeStats:null`,
and passthrough fields are unchanged). Added a `session300:` block (+10
pins) to `tests/test-remote-llm.mjs` (imported the new export): nominal
50-tps run, counter/shape passthrough, the no-token null path, and the
zero-window divide-by-zero guard. `node tests/test-all.mjs` → 6412 passed
/ 0 failed (baseline 6402). Next: the markdown→DOM renderer and the
streamed-bubble body assembly in chat-bot.js remain the only uncovered AI
surfaces (both DOM, need a render harness); remote-llm.js's pure surface
(URL normalizers, SSE framer, stats assembler) is now fully pinned.

### 2026-06-17 06:19 — rpl-programming
Extended the guillemet-abutment class (session293's follow-up) to the
PARENTHESISED unit literal. session293 pinned only the simple (`m`) and
compound (`m/s`) closer-abutment; the parenthesised form `kg/(m*s)` is a
distinct corner because the unit-text scanner in `tokenize`
(`<number>_<unitExpr>` branch) deliberately keeps `()` OUT of its stop set —
parens are valid unit-grouping syntax (`kg/(m*s)`, and the formatter emits
them for multiple negative factors) so they must stay inside the unit token,
unlike the bare-ident scanner whose stop set DOES include `()`. That
asymmetry is what lets `« 1_kg/(m*s)»` close on the real `»` (and ASCII
`<< 1_kg/(m*s)>>` on the `>>` lookahead) instead of splitting at the interior
`(`. Probed live first (all parse to one Unit, uexpr length 3; the closer
fires past the parens). No source behavior change — added a clarifying
comment in `www/src/rpl/parser.js` on the deliberate `()` exclusion, and a
`session299:` block (+5 pins) in `tests/test-entry.mjs`: baseline
parenthesised parse, Unicode + ASCII closer-abutments, the formatter's own
`W/(K*m^2)` round-trip shape abutting `»`, and a `1_kg/(m*s){9}` list-opener
split regression. Updated `docs/RPL.md` (new parser bullet).
`node tests/test-all.mjs` → 6402 passed / 0 failed (baseline 6397). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_unitabut.mjs` (plus older `_probe_matpow.mjs`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: the
guillemet-abutment class now spans idents/numbers/simple+compound+paren
units; the lone larger open item remains halted-stack persistence across
`persist.js` (page refresh drops the LIFO; generators aren't
JSON-serialisable). Also flagged for code-review: parseEntry's JSDoc
(parser.js:219) claims it returns a single value for one-token input, but it
always returns the `values` array.

### 2026-06-15 17:55 — data-types
Fixed a real HP50-fidelity bug (not just a pin) — the lane's top
next-session candidate flagged by session292: `^` on a Matrix base ran
the generic element-wise broadcast (`M[[1,2],[3,4]] ^ 2` →
`[[1,4],[9,16]]`, `M^0` → all-ones) instead of the matrix power. HP50 AUR
confirms (`^` "can also apply to a square matrix raised to a whole-number
power"); the I/O table lists no Vector or element-wise-Matrix case. Source
fix in `www/src/rpl/ops.js`: extracted `_matMul` from the M·M `*` branch,
added `_matrixPow` (M^0 = identity, repeated matmul) + `_wholeNumberExp`,
and made `binaryMath` intercept `op==='^'` for Matrix/Vector bases before
the scalar broadcast — square `Matrix^whole-number` → matrix power; Vector
base, non-square M, and negative/non-whole exponents reject. Now
`M[[1,2],[3,4]] ^ 2` → `[[7,10],[15,22]]`, `^ 3` → `[[37,54],[81,118]]`,
`V[2,3] ^ 2` → 'Bad argument type'. Added a `session298:` block (+10 pins)
in `tests/test-types.mjs` (incl. a M·M regression for the extracted
`_matMul`) and rewrote the DATA_TYPES `^` row + removed the resolved
candidate. `node tests/test-all.mjs` → 6397 passed / 0 failed (baseline
6387). Note: sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_matpow.mjs` (plus older `_probe_*`) stays untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next:
the lone larger open data-types item is Unit dim-equivalence `==`
(UEQUAL / flag flip, AUR §20, multi-run design).

### 2026-06-15 12:28 — command-support
Closed session201's queued follow-up: the POWMOD type-rejection gap. The
lane ✓-criterion wants ≥1 rejection pin per op; session144 pinned only
POWMOD's negative-exponent `Bad argument value` path. POWMOD is a separate
handler (not the `_modBinary` siblings), but its Symbolic/Name path shares
the same `_toAst` null-check — a non-int-like operand throws `Bad argument
type` before the negative-exponent and `giac.isReady()` checks, so it holds
without a loaded CAS. Probed live first (Vector(left)/Complex(right)/
List(left)/String(left) all → `Bad argument type`), then added a
`session202:` block (+4 pins) in `tests/test-algebra.mjs`. No source change —
guards a future inline reimplementation that drops the `_toAst` guard.
Updated `docs/COMMANDS.md` (POWMOD row). `node tests/test-all.mjs` → 6387
passed / 0 failed (baseline 6383). Note: sandbox bash can't delete from the
repo mount, so scratch `tests/_probe_powmod.mjs` (plus older `_probe_*`)
stays untracked — harmless, test-all.mjs imports an explicit file list, not a
glob. Next: `CHARPOL` (PCAR alias) has positive coverage but zero rejection
pins; and `EXPANDMOD`/`FACTORMOD`/`GCDMOD`/`DIVMOD`/`DIV2MOD` each warrant a
non-int-like type-rejection sweep mirroring this one.

### 2026-06-15 12:18 — code-review
Closed O-013's queued follow-up: the explicit non-uppercase allowlist that
guards the last RPL_CATALOG command-token classes the two shape-based sweeps
skip. session286 takes only glyph-led tokens; session291's `^[A-Z][A-Z0-9]+$`
excludes anything not pure uppercase+digits — leaving the mixed-case/lowercase
special-fn names (`Beta`/`erf`/`erfc`/`Ei`/`Si`/`Ci`/`lim`) and the
punctuation-suffixed ops (`FC?`/`FS?`/`FC?C`/`FS?C`/`ISPRIME?`/`CMPLX?`,
`COL+`/`COL-`/`ROW+`/`ROW-`, `SST↓`) unguarded — a typo/de-registration of any
ships wrong AI advice silently, same drift class as the twice-fired `ΣX²`/`ΣX2`
bug. Auto-extraction re-admits prose/syntax (`"text"`, `(alias XNUM)`, the `n`
placeholder), so per the queue it's a curated 18-name allowlist; each asserted
to appear in the catalog text AND dispatch via `hasOp`. Probed live first (all
18 in-catalog + registered; `e`/`i` are backtick constants, not ops — excluded;
XNUM/XQ are uppercase, already swept). Added `session297:` block in
`tests/test-chatbot-parse.mjs` (+36 assertions); updated `docs/REVIEW.md`
(O-013 audit-pass note). `node tests/test-all.mjs` → 6383 passed / 0 failed
(baseline 6347). Note: sandbox bash can't delete from the repo mount, so
scratch `tests/_probe_*` (incl. this run's `_probe_lcase*`/`_probe_opcount`)
stay untracked — harmless, test-all.mjs imports an explicit file list, not a
glob. Next: the catalog's command-token surface is now fully drift-guarded
(glyph + uppercase + non-uppercase); the next code-review increment is the
standing pattern-1 Counts reconciliation (COMMANDS.md "✓: 449" / ROADMAP "449
ops" vs the live register/allOps totals) or O-013's arity/stack-effect hints.

### 2026-06-15 12:08 — unit-tests
Closed the last Real-only `✓` Z cell in the special-function family from the
lane's evergreen positive-coverage audit: LAMBERT. `_lambertScalar` coerces
its operand via `isInteger(v) ? Number : isReal(v) ? toNumber : null`, but
every positive LAMBERT pin pushed `Real`, so the `isInteger` arm was never
positively exercised (PSI already had `PSI(Integer(5))`, ZETA already had
`ZETA(0)/ZETA(-1)/ZETA(-2)` — all `Integer` — so only LAMBERT was Real-only).
Probed live first (`LAMBERT(Integer(0))`→0, `LAMBERT(Integer(1))`→Ω,
`LAMBERT(Integer(3))` satisfies W·e^W=3), then added a `session296:` block
(+3 pins) in `tests/test-numerics.mjs` right after the closed-form LAMBERT
values. No source change — guards a refactor degrading LAMBERT's Z column to
Real-only. Updated `docs/TESTS.md` (count 6344→6347, advanced the evergreen
queue, LAMBERT Z coverage note). `node tests/test-all.mjs` → 6347 passed / 0
failed (baseline 6344). Note: sandbox bash can't delete from the repo mount,
so scratch `tests/_probe_lambertz.mjs` (plus older `_probe_*`) stays
untracked — harmless, test-all.mjs imports an explicit file list, not a glob.
Next: re-enumerate `✓` cells across the rest of the type matrix for the same
Real-only pattern (TRUNC/XPON Z folds, the stat-dist family Z columns).

### 2026-06-15 11:58 — ui-development
Closed session289's queued follow-up: exported and guarded the
`ALIASES` panel-name→doc-heading fallback table in
`www/src/ui/command-help.js` (one-word `export const`, mirroring the
ai-chatbot `TOOL_ALIASES` precedent). `_render` upper-cases the
requested name then does `ALIASES.get(key)` and resolves exactly one
hop — so the table has three reachability invariants nothing pinned:
every key must be upper-case (a lower-case key is unreachable), no
target may itself be a key (would need a second hop `_render` never
does), and no entry may self-alias (a no-op the direct lookup already
covers). Probed live first — all 24 entries satisfy all three. Added a
`session295:` block (+76 pins) in `tests/test-ui.mjs`: the three
invariant sweeps over the live map plus four spot-checks
(CHARPOL→PCAR, LIM→LIMIT, SQRT→√, <=→≤). No behavior change — guards a
future alias edit that adds an entry the lookup path can't hit or that
needs re-feeding. Updated ROADMAP §5 (contextual-help bullet).
`node tests/test-all.mjs` → 6344 passed / 0 failed (baseline 6268).
Note: sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_*` from earlier runs stay untracked — harmless,
test-all.mjs imports an explicit file list, not a glob. Next: the
command-palette overlay and contextual-help tooltip copy remain the
only uncovered UI surfaces (both DOM, need a render harness); every
pure helper in op-search.js and command-help.js is now pinned.

### 2026-06-15 11:48 — ai-chatbot
Closed session288's queued follow-up: extracted RemoteLLM's SSE
frame-splitter out of `generate()`'s read loop into a pure
`export function takeSSEFrames(buffer)` in `www/src/ai/remote-llm.js`.
It owns the trickiest streaming bit — carving the accumulating byte
buffer into complete `data:` payloads (skipping blank lines, non-`data:`
comment lines, and the `[DONE]` sentinel) while returning the
unterminated final line as `rest` to carry into the next read. JSON.parse
stays at the call site so the malformed-frame `console.warn` still logs in
context — behavior-identical refactor (probed live first via a scratch
harness: split frames reassemble across reads, CRLF tolerated, partial
tails preserved). Added a `session294:` block (+9 pins) to the existing
`tests/test-remote-llm.mjs` (imported the new export): in-order extraction
+ tail carry, a frame split across two reads reassembling via rest,
blank/comment/[DONE] skips, CRLF, and empty/unterminated degenerates.
`node tests/test-all.mjs` → 6268 passed / 0 failed (baseline 6259). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_sse.mjs` (plus older `_probe_*`) stays untracked — harmless,
test-all.mjs imports an explicit file list, not a glob. Next: the
markdown→DOM renderer and streamed-bubble body assembly in chat-bot.js
remain the only uncovered AI surfaces (both DOM, need a render harness);
RemoteLLM's stats/timing math in `generate()` (ttft/decodeTps) is the next
pure-ish extraction candidate if its post-stream block can be factored out.

### 2026-06-15 11:38 — rpl-programming
Fixed a real parser bug (not just an unguarded path): a **unit literal
abutting the program closer** swallowed the closer. The `tokenize`
`<number>_<unitExpr>` branch ran the unit-text scan to whitespace or the
`{}[]"\`` delims but not `»`/`>>`, so `« 1_m»` (no space before `»`) threw
`Bad unit expression near '»': m»` while the spaced `« 1_m »` parsed fine.
This was the last unswept member of the guillemet abutment class (idents
session278/282/283; list/vector delims already stopped the unit scan, e.g.
`1_m{2}`). Probed live first, then fixed `www/src/rpl/parser.js` by adding
`«»` to the unit-text stop set and the `<<`/`>>` ASCII doubled lookahead (a
unit expression never contains `<`/`>`), mirroring the bare-ident scanner.
Added a `session293:` block (+5 pins) in `tests/test-entry.mjs`: `« 1_m»`
== spaced form, compound `« 1_m/s»` keeps both uexpr factors, ASCII
`<< 1_kg>>`, `« 1_m»DUP`→`[«1_m», DUP]`, and a `1_m{2}` regression for the
unchanged list-delim path. Updated `docs/RPL.md` (new parser bullet).
`node tests/test-all.mjs` → 6259 passed / 0 failed (baseline 6254). Note:
sandbox bash can't delete from the repo mount, so scratch `tests/_probe_*`
(incl. this run's `_probe_unitclose*`/`_probe_uc*`) remain untracked —
harmless, test-all.mjs imports an explicit file list, not a glob. Next: the
abutment class is now complete across idents/numbers/units; the lone larger
open item remains halted-stack persistence across `persist.js` (page
refresh drops the LIFO; generators aren't JSON-serialisable).

### 2026-06-15 11:28 — data-types
Corrected a doc↔code drift on the `^` (power) row of the type matrix: the
B (BinInt) column read `✗` ("BinInt ✗ for the base"), contradicting both
the BinInt masking contract (which lists all five arithmetic ops incl.
`^`) and existing pins session045 (`#2h 8 ^ → #100h`) / session110
(`#2h ^ Integer(10)` masked). Probed live first — BinInt is accepted as
base AND exponent: BinInt^BinInt via `binIntBinary`; mixed Integer/Real ↔
BinInt via `_scalarBinaryMixed` (non-BinInt coerced, BinInt base
preserved), result masked to wordsize. Flipped B `✗`→`✓`, rewrote the
note, and added a `session292:` block (+4 pins) in `tests/test-types.mjs`
locking the previously-unpinned cases: `#2h ^ #3h`→`#8h`, `Integer(2) ^
#5h`→`#32h`, and the ws=8 mask edges `#2h ^ #Ah`→`#0h` and `#FFh ^ #2h`→
`#1h`. No source change. **Also flagged (not fixed) a second drift on the
same row:** live `^` broadcasts element-wise over a Vector base
(`V[2,3] ^ 2`→`V[4,9]`, doc says V=✗) and over a Matrix base
(`M[[1,2],[3,4]] ^ 2`→ element-wise `M[[1,4],[9,16]]`, NOT the documented
matmul) — the Matrix case is a likely HP50-fidelity bug; recorded both in
the next-session candidates. `node tests/test-all.mjs` → 6254 passed / 0
failed (baseline 6250). Note: sandbox bash can't delete from the repo
mount, so scratch `tests/_probe_*` from earlier runs remain untracked —
harmless (test-all.mjs imports an explicit file list, not a glob). Next:
decide `^` on V/M base per AUR §3 — fix the Matrix matmul path (code +
pins) and resolve whether V^scalar should broadcast (✓) or reject.

### 2026-06-15 11:18 — command-support
Closed the ✓-criterion rejection gap for the modular-arithmetic siblings
`SUBTMOD` / `MULTMOD`: both had positive coverage only (0 rejection pins),
while `ADDTMOD` — the third op sharing the same `_modBinary` helper — was
the only one with rejection pins. The lane's ✓ definition wants ≥1
rejection test per op. JORDAN stays the lone ✗ and remains blocked here
(Giac WASM init ~40-45 s exceeds the 45 s bash cap, per the session-199/200
notes), so this was the highest-value in-lane increment. Probed live first
(`SUBTMOD`/`MULTMOD` reject Vector(left)/Complex(right)/List(left)/
String(left) all → `Bad argument type` via `_modBinary`'s `_toAst`
null-check), then added a `session201:` block (+8 pins, 4 types × 2 ops) in
`tests/test-algebra.mjs`. No source change — behavior was already correct,
just unguarded against a refactor that splits the shared helper or drops the
`_toAst` guard. Updated `docs/COMMANDS.md` (ADDTMOD/SUBTMOD/MULTMOD row).
`node tests/test-all.mjs` → 6250 passed / 0 failed (baseline 6242). Note:
sandbox bash can't delete from the repo mount, so scratch
`tests/_probe_tmod.mjs` (plus older `_probe_*`) remains untracked — harmless,
test-all.mjs imports an explicit file list, not a glob. Next: `POWMOD`'s
Vector/List/Complex rejection path is the analogous unpinned guard (it has a
negative-exponent `Bad argument value` pin but no type-rejection pin); and
`CHARPOL` (PCAR alias) has positive coverage but zero rejection pins.

### 2026-06-15 11:06 — code-review
Closed O-013's standing queued follow-up: extended the RPL_CATALOG
drift guard from glyph-only (session286) to the non-glyph **uppercase**
command names. The prior run flagged the blocker as "needs a robust
prose-vs-command line classifier" — built it. Confirmed clean first
(register( = 482, ^register( = 463, allOps() = 467 unchanged; no stale
`src/` doc paths). The classifier walks RPL_CATALOG section by section,
skips the two narrative blocks (HOW THE STACK WORKS / ALGEBRAIC OBJECTS)
so their ALL-CAPS emphasis words aren't mistaken for ops, drops syntax-
template lines (markers `...`/brackets/braces/guillemets/backtick/`:`/`/`),
and asserts every uppercase token (len>=2) in each command column
dispatches via hasOp — 245 tokens, zero unresolved. Added a `session291:`
block to `tests/test-chatbot-parse.mjs` (+246 assertions) and updated
`docs/REVIEW.md` (O-013 audit-pass + guard note). `node tests/test-all.mjs`
→ 6242 passed / 0 failed (baseline 5996). Next: lowercase ops
(erf/erfc/lim/e/i) and single-letter names remain unswept (excluded to
stay false-positive-free) — would need a small explicit allowlist.

### 2026-06-15 10:54 — unit-tests
Closed the GAMMA/LNGAMMA Real-operand pole-guard gap (and corrected a stale
queue note: GAMMA's exact-factorial Integer branch and LNGAMMA's integer arm
are already well pinned, so the "backed mostly by Real-operand evidence" flag
was wrong). The real gap: `_gammaScalar`/`_lngammaScalar` coerce the operand
to a JS number, then throw at non-positive integers via `Number.isInteger(x)
&& x <= 0` — so the pole guard must also fire for Real-valued whole numbers,
but both existing pole pins used `Integer` only. Probed live first
(`GAMMA(Real(0/-2/-3))` and `LNGAMMA(Real(0/-1/-4))` all → 'Infinite result'),
then added a `session290:` block (+6 pins) in `tests/test-numerics.mjs`. No
source change — guards a refactor narrowing the guard to `isInteger(v)`, which
would let `GAMMA(Real(-2))` return garbage. Updated `docs/TESTS.md` (count,
coverage note, corrected/advanced the queue). `node tests/test-all.mjs` →
5996 passed / 0 failed (baseline 5990). Note: sandbox bash can't delete from
the repo mount, so scratch `tests/_probe_gamma.mjs` (plus older `_probe_*`)
remains untracked — harmless, test-all.mjs imports an explicit file list, not
a glob. Next: verify the `PSI`/`ZETA`/`LAMBERT` `_*Scalar` `isInteger` arms
each have a bare-`Integer` positive pin, not only `Real`-operand evidence.

### 2026-06-15 10:42 — ui-development
The op-search palette helpers are now fully pinned, so I extracted the
next DOM-free piece from the *contextual-help* surface (ROADMAP §5):
`command-help.js`'s `_loadSections` derived each section's command key
inline with `raw.replace(/\s*\(.*\)\s*$/, '').trim()` — the strip that
turns an HP50 reference heading like `!(Factorial)` / `==(Logical
Equality)` into the bare dispatchable symbol the popup files it under,
with zero coverage. Pulled it into a pure `export function
headingKey(raw)` and routed the one call site through it (no behavior
change — same regex), then added a `session289:` block (+13 pins) in
`tests/test-ui.mjs`: bare/whitespace passthrough, the two glossed
shapes, space-before-gloss, greedy multi-word strip, glyph names
(`√`, `ΣX`) preserved, and the empty/whitespace/null/undefined/
gloss-only degenerates that collapse to `''` (which the caller skips).
Importing command-help.js under Node is safe — no top-level DOM access;
`document`/`DOMParser`/`fetch` are all inside methods. `node
tests/test-all.mjs` → 5990 passed / 0 failed (baseline 5977). Next: the
command-palette overlay and the contextual-help tooltip copy remain the
DOM pieces (need a render harness); the `ALIASES` panel-name→heading
map in command-help.js is the next pure-ish extraction if a
reverse-collision / real-target guard is wanted (mirrors the
ai-chatbot TOOL_ALIASES guard precedent).

### 2026-06-15 10:30 — ai-chatbot
Closed the last untested pure surface in `www/src/ai/`: `remote-llm.js`'s
URL normalizers `toOpenAIBase` / `toOllamaBase` had zero coverage (no
test file imported them at all), yet they feed every RemoteLLM request
URL. Added a new `tests/test-remote-llm.mjs` (+21 `session288:` pins) and
registered it in `tests/test-all.mjs`: bare host→/v1, trailing-slash
stripping (single + multiple), explicit /v1 passthrough, the Ollama-
native /api→/v1 fold, empty/null/undefined coercion for both fns, the
/v1 and /api suffix strips on `toOllamaBase`, plus a round-trip sweep
proving `toOllamaBase(toOpenAIBase(typed))` folds back to one shared
server root across five typed shapes. No source change — behavior was
already correct, just unguarded against a refactor of the suffix
juggling. `node tests/test-all.mjs` → 5977 passed / 0 failed (baseline
5956). Next: the markdown→DOM renderer and streamed-bubble body assembly
in chat-bot.js remain uncovered (both DOM, need a harness); RemoteLLM's
SSE chunk parser in `generate()` is the next pure-ish extraction
candidate if its line-splitting can be factored out of the fetch loop.

### 2026-06-15 10:18 — rpl-programming
Closed the last open corner of the guillemet abutment class: the program
*closer* abutting a *following* token. session278 pinned the list/vector
closer→Name (`}DUP`), session282 the opener→value (`2«1»`), and `X»` the
closer→preceding-Name — but nothing guarded `«1»DUP` / `«1»2` / `«1»{2}` /
ASCII `<<1>>DUP`. Probed live first (all split cleanly into `[Program,
next]`), then added a `session283:` block (+4 pins) in
`tests/test-entry.mjs`. No source change — behavior was already correct,
just unguarded against a closer-scan refactor letting a trailing token leak
into the body or get swallowed. Updated `docs/RPL.md` (new parser bullet).
`node tests/test-all.mjs` → 5956 passed / 0 failed (baseline 5952). Note:
sandbox bash cannot delete from the repo mount, so a scratch
`tests/_probe_close.mjs` remains untracked (harmless — test-all.mjs imports
an explicit file list, not a glob). Next: the lone larger open item remains
halted-stack persistence across `persist.js` (page refresh drops the LIFO;
generators aren't JSON-serialisable — needs a token/IP capture design);
DBUG/SST UI surfaces belong to the ui-development lane.

### 2026-06-15 10:06 — data-types
Closed an unpinned-rejection gap on the ordered comparators. DATA_TYPES
documents L/V/M/T/U as `✗` on `<`/`>`/`≤`/`≥` ("scalar-only
`comparePair`"), but only String×Real (s087) and String-lex (s102)
rejections were pinned — nothing guarded the collection/wrapper/Unit
throws against a refactor that widens `comparePair` past `isNumber`.
Probed live first (all 20 `op × {List,Vector,Matrix,Tagged,Unit}` pairs
→ 'Bad argument type'), then added a `session287:` block (+20 pins, a
4-op × 5-type sweep) in `tests/test-comparisons.mjs` and imported `Unit`
there. No source change — behavior was already correct, just untested.
Updated `docs/DATA_TYPES.md` (comparator scalar-only note). `node
tests/test-all.mjs` → 5952 passed / 0 failed (baseline 5932). Note: the
sandbox bash cannot delete files from the repo mount, so a scratch
`tests/_probe_cmp.mjs` (plus older `_p2/_p3/_probe_mant/_probe_tmp`)
remains untracked; harmless — `test-all.mjs` imports an explicit file
list, not a glob. Next: the lone larger open candidate remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design).

### 2026-06-15 09:54 — command-support
Closed the XNUM/XQ ✓-criterion rejection gap (the lane's ✓ definition
wants ≥1 rejection pin per op; the session-086 coverage was happy-path
only). +4 `session200:` pins in `tests/test-numerics.mjs` lock the alias
delegation's guard propagation: `XQ` inherits →Q's Integer-passthrough
(`Integer(5)` → `Symbolic Num(5)`), type guard (`String` → `Bad argument
type`) and finiteness guard (`Real(∞)` → `Bad argument value`); `XNUM`
delegates to →NUM→EVAL so its rejection path is the empty-stack
underflow. No source change — guards a future inline reimplementation
that drops a guard. Also re-confirmed the JORDAN/Giac capture blocker and
refined the session-199 recipe in `docs/COMMANDS.md`: this emscripten
build ignores `wasmBinary`/`locateFile` and reads a bare relative
`giacwasm.wasm` (probe must `cwd` into `www/src/vendor/giac/`); detached
background processes don't survive across bash calls; even with the cwd
fix init exceeds the 43 s cap (exit 124). `node tests/test-all.mjs` →
5932 passed / 0 failed (baseline 5928). Next: capture JORDAN's
`eigenvals`/`eigenvects`/`jordan`/`pmin`/`charpoly` shapes for the AUR
`[[1,1],[1,1]]` example on a host where Giac init fits the bash cap, then
register the op against real shapes.

### 2026-06-15 09:42 — code-review
Turned the recurring O-013 `RPL_CATALOG` drift-watch (it has fired twice,
most recently the `ΣX²` vs `ΣX2` superscript bug) into an evergreen test
for the highest-risk subset. Fresh full-catalog `hasOp()` sweep came back
clean (`allOps()` = 467; every catalog command name + advertised alias
resolves), then exported `RPL_CATALOG` from `www/src/ai/system-prompt.js`
(one-word change) and added a `session286:` block to
`tests/test-chatbot-parse.mjs` that pulls every glyph-led token (Σ/Δ/Π
accumulators, →-arrow conversions) straight from the catalog text and
asserts each dispatches — whole-token capture so a superscript like `ΣX²`
surfaces as the full unresolved token instead of truncating to a resolving
`ΣX`. Updated `docs/REVIEW.md` (O-013 audit-pass + guard note).
`node tests/test-all.mjs` → 5928 passed / 0 failed (baseline 5899). Next:
extend the catalog-extraction guard to the non-glyph command names — needs
a prose-vs-command line classifier so the leading command column is pinned
without false positives from the narrative blocks.

### 2026-06-15 09:31 — unit-tests
Closed the next `✓`-cell positive-coverage gap from the lane's evergreen
audit (the same class as session280's erf/erfc Z): the DATA_TYPES Z `✓`
cell for MANT was backed only by `Real` operands, while its sibling XPON
already had a bare-`Integer` pin (`session043:` XPON Integer 500 → 2).
Probed live first (`MANT(Integer 500)` → `Real(5)`, `MANT(Integer 86000)`
→ `Real(8.6)`, `XPON(Integer 86000)` → `Real(4)`), then added a
`session285:` block (+3 pins) in `tests/test-numerics.mjs` right after the
XPON Integer pin — including a >1-digit exponent on the integer arm. No
source change; behavior was already correct, just unguarded against a
refactor degrading MANT's Z column to Real-only. Updated `docs/TESTS.md`
(count 5844→5899, MANT Z coverage note, queue item updated).
`node tests/test-all.mjs` → 5899 passed / 0 failed (baseline 5896). Next:
GAMMA/LNGAMMA Z folds (`_gammaScalar`/`_lngammaScalar` `isInteger` branch)
remain the analogous Real-backed `✓` cells in the queue.

### 2026-06-15 09:22 — ui-development
Advanced ROADMAP §6's command palette with the next DOM-free piece:
`highlightSegments(name, positions)` in `www/src/ui/op-search.js` — folds
the matched-character indices from `matchPositions` into the alternating
`{ text, match }` runs the (still-TODO) overlay will render (adjacent
matched indices merge into one `match:true` run; gaps emit `match:false`
runs; `text` concatenates back to `name`). Empty name → `[]`; empty/missing
positions → one whole-name unmatched run; out-of-range / non-finite
positions ignored. +9 `session284:` pins in `tests/test-op-search.mjs`
(exact, contiguous-interior merge, scattered split, reconstruction,
alternation, guards). Updated ROADMAP §6 bullet. `node tests/test-all.mjs`
→ 5896 passed / 0 failed (baseline 5887). Next: build the actual overlay
DOM consuming `searchOps` + `moveSelection` + `matchPositions` +
`highlightSegments` — `/`-triggered input over #calculator, live result
list with matched glyphs bolded via these segments, Enter invokes the
highlighted op, Esc/backdrop closes; mirror command-help.js's
mount-inside-#calculator pattern. (Overlay is DOM, not Node-unit-testable
without a new dep — keep extracting pure helpers where it pays.)

### 2026-06-15 09:14 — ai-chatbot
Closed session279's queued reverse-collision guard from the *target*
side. The existing test (session276) only checked that documented
canonical names aren't alias keys; nothing pinned that each alias
*value* is a real tool or that the map stays single-hop. Exported the
already-frozen `TOOL_ALIASES` from `chat-bot.js` (one-word source change,
mirrors the session279 effectiveBudget/activeContextTokens export
precedent) and added a `session283:` block (+16 pins) in
`tests/test-chatbot-parse.mjs`: every unique alias target is a canonical
tool AND is not also an alias key (no synonym-of-a-synonym chain that
would leave `resolveToolAlias` one rewrite short). Behavior was already
correct — this guards a typo'd target or accidental chain in future map
edits. `node tests/test-all.mjs` → 5887 passed / 0 failed (baseline
5871). Next: the markdown→DOM renderer and streamed-bubble body assembly
remain uncovered (both DOM, need a test harness); the pure parser helpers
(parseSuggestions/findMachineSectionStart/stripThinkBlocks) are well
pinned.

### 2026-06-15 09:05 — rpl-programming
Closed the symmetric gap to session278: that run pinned the program
*closer* and the list/vector *openers* abutting a Name/number, but the
program *opener* side (`«` / ASCII `<<` abutting a preceding token) was
untested. Probed first — `2«1 +»` → `[Integer(2), «1 +»]`, `X«1»` →
`[Name('X'), «1»]` — confirming the number scanner stops at `«`/`<` and
the ident scanner stops on the Unicode glyph (stop set) or the `<<`
lookahead (ASCII). Added a `session282:` block (+5 pins) in
`tests/test-entry.mjs`: Unicode + ASCII openers, Name + number operands,
and an empty nested body. No source change — behavior was already
correct, just unguarded against a stop-set/lookahead refactor. Updated
`docs/RPL.md` (new parser bullet). `node tests/test-all.mjs` → 5871
passed / 0 failed (baseline 5866). Next: the lone larger open item
remains halted-stack persistence across `persist.js` (page refresh drops
the LIFO; generators aren't JSON-serialisable — needs a token/IP capture
design); DBUG/SST UI surfaces belong to the ui-development lane.

### 2026-06-15 08:47 — data-types
Closed the lane's standing "Next-session widening candidate": extended the
**S (String) column** onto the stat-dist family table in `docs/DATA_TYPES.md`
(HEAVISIDE/DIRAC/GAMMA/LNGAMMA/ERF/ERFC/BETA/UTPC/UTPF/UTPT — the table
carried R/Z/Q/C/N/Sy/L/V/M/T only). All ten reject String with 'Bad argument
type': HEAVISIDE/DIRAC via the scalar arm (isReal/isInteger/isBinaryInteger/
isSym only, String falls to the throw); GAMMA/LNGAMMA/ERF/ERFC/BETA via
`_*Scalar` `isInteger?…:isReal?…:null` → null → throw; UTPC/UTPF/UTPT via the
shared `asReal` helper (isInteger/isReal only). Probed handlers by reading
ops.js first, then added +10 `session281:` rejection pins in
`tests/test-types.mjs` (one per op). No source changes — rejections were
already correct, just untested. Removed the now-completed candidate from the
DATA_TYPES next-session list. `node tests/test-all.mjs` → 5866 passed / 0
failed (baseline 5856). Next: only larger open item remains — Unit
dim-equivalence `==` (AUR §20, multi-run design; could be a new `UEQUAL` op or
a flag flipping `==` semantics).

### 2026-06-15 08:55 — command-support
Investigation run (no source change): unblocked the lane's lone remaining
✗ (`JORDAN`), which has been gated for several sessions on "verify Giac's
eigenvects/Jordan-chain output shape against real CAS." Found a prior
`probe-tmp.mjs` artifact proving the pattern, then confirmed the vendored
Giac WASM *does* load and `caseval` under Node — contradicting the
`giac-engine.mjs`/README claim that it's "intentionally not run in Node."
A probe produced full `eigenvects([[1,1],[1,1]])`/`jordan(...)` output in
one run via `Module.wasmBinary` preload + `cwrap('caseval',...)`. Blocker
for the auto-loop: WASM init is ~40–45 s, right at the 45 s bash cap, so
capture is flaky (most retries time out); background processes don't
survive across independent bash calls either. Recorded the recipe and
next step in `docs/COMMANDS.md` (session-199 count note + JORDAN row).
`node tests/test-all.mjs` → 5856 passed / 0 failed (baseline 5856,
unchanged — no source edit). Next: capture the `eigenvals`/`eigenvects`/
`jordan`/`pmin`/`charpoly` shapes for the AUR `[[1,1],[1,1]]` example with
a warmed/longer-lived probe harness, then register `JORDAN` in `ops.js`
wiring `jordan-format.js`'s builders to those real shapes with matching
fixtures in `tests/test-jordan-format.mjs`.

### 2026-06-15 08:38 — code-review
Re-audited the O-013 AI-prompt drift class (the prior run's queued
"next") and turned the prompt-side check evergreen. Full `lookup()`
token sweep of `RPL_CATALOG` against the live op set (`allOps()`=467)
came back clean — every command name resolves; misses are all prose /
headers / type names / placeholders. `AVAILABLE TOOLS` (8 tools) matches
`_buildRegistry` and its advertised aliases resolve. Added a sync-guard
block to `tests/test-chatbot-parse.mjs` (+12 assertions): pins the
documented tool set, asserts each canonical name is alias-stable
(reverse-collision guard), and that `add_to_stack`/`recall`/`show_stack`
still resolve. Resolved the "SCHUR/PMINI absent from catalog" item as
not-drift (catalog is a curated subset by its own header). No source
change. Updated `docs/REVIEW.md` (O-013 audit-pass note).
`node tests/test-all.mjs` → 5856 passed / 0 failed (baseline 5844).
Next: extend the same evergreen approach to assert the documented tool
set matches `_buildRegistry` keys directly (needs a testable export of
the registry key list), and sweep the catalog's arity/stack-effect
hints (e.g. INVMOD's 2-arg deviation still carries no arity note).

### 2026-06-15 08:20 — unit-tests
Closed a positive-coverage gap from the evergreen `✓`-cell audit: the
DATA_TYPES Z `✓` cell for ERF/ERFC (the `_erfScalar`/`_erfcScalar`
`isInteger` branch) was only backed by `Real(n)` assertions — every erf/erfc
positive test pushed `Real`, none a bare `Integer`. Probed the live behavior
first (`erf(Integer(1))` → `Real(0.84270…)`, `erfc(Integer(2))` →
`Real(0.0046777…)`), then added 2 `session280:` pins in `test-numerics.mjs`
exercising the Integer operand directly, so a refactor dropping the integer
arm (degrading Z to Real-only) is caught. No source change. Updated
`docs/TESTS.md` (count 5830→5844 + erf/erfc Z coverage note).
`node tests/test-all.mjs` → 5844 passed / 0 failed (baseline 5842). Next: the
`✓`-cell positive-coverage audit (queue item 7) remains the lane's open
evergreen — XPON/MANT Z and the GAMMA/LNGAMMA Z folds are similar candidates
backed mostly by Real-operand evidence.

### 2026-06-15 08:05 — ui-development
Advanced ROADMAP §6's command palette with its next DOM-free piece:
`matchPositions(query, name)` in `www/src/ui/op-search.js` — returns the
ascending indices into `name` of the characters the query matched, using
the same greedy left-to-right subsequence walk as `fuzzyScore` so a
highlight built from them lines up with what the score rewarded (exact →
all indices, interior/scattered subsequences, case-insensitive; empty
query, non-subsequence, too-few-occurrences, and null inputs all → `[]`).
+13 assertions in `tests/test-op-search.mjs`. Updated ROADMAP §6 bullet
(matched-char highlighting now has its core; overlay still TODO).
`node tests/test-all.mjs` → 5842 passed / 0 failed (baseline 5824). Next:
build the actual overlay DOM consuming `searchOps` + `moveSelection` +
`matchPositions` — `/`-triggered input over #calculator, live result list
with matched glyphs bolded, Enter invokes the highlighted op, Esc/backdrop
closes; mirror command-help.js's mount-inside-#calculator pattern. (Overlay
is DOM, not Node-unit-testable without a new dep — keep extracting pure
helpers where it pays.)

### 2026-06-15 06:50 — ai-chatbot
Closed session 275's queued follow-up: pulled the two remaining inline
bits of `www/src/ai/chat-bot.js` into pure, testable helpers. Added
`export function resolveToolAlias(name)` (`TOOL_ALIASES[name] ?? name`)
and routed both alias call sites through it (runLoop pre-resolve +
dispatchTool rewrite), switching the rewrite guard from truthiness to
`aliased !== name` — behavior-identical since no alias target equals its
key. Also exported the already-pure `effectiveBudget` / `activeContextTokens`
so the per-model history-budget math is pinnable. +14 `session279:` pins in
`tests/test-chatbot-parse.mjs` (alias hit/passthrough/canonical; the 4096
no-model and unknown-catalog fallbacks, remote probed vs remote-default
contextTokens, and the `ctx*4 - reserve` budget formula). `node tests/test-all.mjs`
→ 5824 passed / 0 failed (baseline 5814). Next: still no coverage for the
markdown→DOM renderer or the streamed-bubble body assembly (both DOM, need a
harness); `TOOL_ALIASES` could grow a reverse-collision guard test if the map
ever gains a key equal to a canonical name.

### 2026-06-15 06:36 — rpl-programming
Closed session 272's queued follow-up: verified list/vector openers `{[`
are symmetric with the program-guillemet abutment class. `{}[]` are
single-char delims already in the ident-scanner stop set, so a Name or
number abutting a list/vector opener/closer with no whitespace splits
cleanly (`X{1 2}`, `{1 2}DUP`, `« 2{}»`) — no `<<`/`>>` lookahead needed
since none is a valid operator name. No source change; +6 `session278:`
pins in `tests/test-entry.mjs`. Updated `docs/RPL.md` (parser bullet +
session-278 chapter, stamp 272→278). `node tests/test-all.mjs` → 5814
passed / 0 failed (baseline 5808). Next: deferred halted-stack
persistence across `persist.js` is the lone larger open item.

### 2026-06-15 06:31 — data-types
Extended the **S (String) column** onto the special-function family table
in `docs/DATA_TYPES.md` (XPON/MANT/TRUNC/ZETA/LAMBERT/PSI) — the table
carried R/Z/Q/C/N/Sy/L/V/M/T only, so String was untested. All six reject
String: XPON/MANT via handler guard `!isReal(v) && !isInteger(v) → throw`;
ZETA/LAMBERT/PSI via `_*Scalar` (`isInteger?…:isReal?…:null` → null →
`Bad argument type`); TRUNC's x-operand via `_roundingOp` and n-operand via
`toRealOrThrow` ("expected real, got string"). +7 `session271:` rejection
pins in `tests/test-types.mjs` (one per op, two for TRUNC's two arms). No
source changes — rejections were already correct, just untested. Continues
session 269's combinatorial-family S-column work.
`node tests/test-all.mjs` → 5808 passed / 0 failed (baseline 5801).
Next: extend the S column onto the stat-dist family table (HEAVISIDE/DIRAC/
GAMMA/LNGAMMA/ERF/ERFC/BETA/UTPC/UTPF/UTPT — probe-confirmed all reject
String via the same scalar-handler / `asReal` guards). Open larger item
remains candidate #4: Unit dim-equivalence `==` (AUR §20, multi-run design).

### 2026-06-15 06:23 — command-support
Shipped the CAS-independent core of `JORDAN`'s level-2/level-1 output
(HP50 AUR §3-122) as a new standalone module
`www/src/rpl/jordan-format.js` — mirrors the op-search precedent of
landing the pure shaping core before its consumer.  Exports
`charSpaceList` (level-2 RList of eigenvalue-`Tagged` characteristic
spaces), `jordanChain` (chain RList terminating in an `Eigen:`-tagged
eigenvector, leads bare), `eigenTag`, and `eigenvalueArray` (level-1
Vector w/ multiplicities).  +20 assertions in
`tests/test-jordan-format.mjs` pinned against the AUR worked example
`JORDAN([[1,1],[1,1]])` → level 2 `{0:[1,-1] 2:[1,1]}` / level 1
`[0,2]`; wired into `tests/test-all.mjs`.  No `ops.js` change — JORDAN
stays `✗` (unregistered).  Updated `docs/COMMANDS.md` (session-198
Counts note, stamp 197→198).  `node tests/test-all.mjs` → 5801 passed /
0 failed (baseline 5781).  Next: register `JORDAN` in `ops.js` wiring
these builders to Giac eigenvalues/multiplicities/characteristic-spaces
plus PMINI (level 4) and PCAR (level 3) — but first confirm Giac's
`eigenvects`/Jordan-chain output shape against real CAS so the test
fixtures match reality rather than a guess.

### 2026-06-14 23:27 — code-review
Fresh RPL_CATALOG drift audit (O-013): swept every command-like token in
the AI system-prompt catalog against the live `register()` set in
`www/src/rpl/ops.js`. Caught real drift the session-243 spot-check
missed — the STATISTICS block (`www/src/ai/system-prompt.js:189`)
advertised the sum-of-squares accumulators as `ΣX²` / `ΣY²`
(superscript ²), but the dispatchable registered names are `ΣX2` /
`ΣY2` (ASCII 2): no `register('ΣX²')` exists, the tokenizer has no
`²`→`2` normalization, and `tests/test-stats.mjs` invokes them via
`lookup('ΣX2')`. A model following the catalog would emit an unrunnable
`ΣX²`. Fixed the line to `ΣX2 ΣY2` with an "ASCII 2, not a superscript
²" caveat (source-only, one line). The `²`-rendered forms in ops.js
comments / COMMANDS.md / TESTS.md are human labels, not dispatch keys —
not drift. Re-opened+resolved the O-013 occurrence and bumped the
header in `docs/REVIEW.md`. `node tests/test-all.mjs` → 5781 passed /
0 failed (no test covers the prompt string). Next: extend the
token-sweep methodology to the rest of the catalog's arity/stack-effect
hints (e.g. INVMOD's 2-arg deviation still carries no arity note) and to
the PROGRAMS/CONTAINERS matrix-decomp lines (SCHUR/PMINI now shipped but
absent from the catalog).

### 2026-06-14 23:14 — unit-tests
Added the lex-vs-value-equality contrast for Strings that session 273's
queue flagged as next: +9 `session277:` pins in `tests/test-types.mjs`
proving `==` / `≠` / `SAME` are value-based while `< > ≤ ≥` are
lex-based, on a shared input pair (lex-distinct "abc"/"abd": ==→0,
≠→1, SAME→0 but ≤→1; equal "abc"/"abc": ==→1, ≠→0, SAME→1, with the
lex family agreeing at the boundary). Behavior probed first; no source
change — guards against a refactor routing equality through the lex
comparator. Updated `docs/TESTS.md` (header → s277 + session-277 delta
block). `node tests/test-all.mjs` → 5781 passed / 0 failed (baseline
5772). Next: the ✓-cell positive-coverage audit (queue item 7) remains
the lane's open evergreen.

### 2026-06-14 23:01 — ui-development
Advanced ROADMAP §6's command palette by shipping its next DOM-free piece:
`moveSelection(index, delta, length)` in `www/src/ui/op-search.js` — the
wrap-around highlight navigator the overlay needs for ArrowUp/ArrowDown
(down past the bottom wraps to first, up past the top to last; empty list
→ -1; negative index is a "nothing selected yet" sentinel that snaps to
first on down / last on up; multi-step deltas wrap modulo for PageUp/
PageDown; non-finite inputs tolerated). +17 assertions in
`tests/test-op-search.mjs`. Updated ROADMAP §6 bullet. `node tests/test-all.mjs`
→ 5772 passed / 0 failed (baseline 5755). Next: build the actual overlay DOM
that consumes `searchOps` + `moveSelection` — `/`-triggered input over
#calculator, live result list, Enter invokes the highlighted op via the
command-line path, Esc/backdrop closes; mirror command-help.js's
mount-inside-#calculator pattern. (Overlay is DOM, so not Node-unit-testable
without a new dep — keep extracting pure helpers where it pays.)
