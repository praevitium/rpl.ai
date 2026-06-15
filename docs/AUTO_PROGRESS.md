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

Last lane: rpl-programming
Last run: 2026-06-15 06:36

---

## Run log

(newest first — each run appends one entry: date, lane, what shipped, test result, what's next)

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

### 2026-06-14 22:43 — ai-chatbot
Hardened the response parsers in `www/src/ai/chat-bot.js` against the
queued unbalanced-brace bug: extracted a string-aware `matchBalancedEnd`
helper that ignores `{`/`}`/`[`/`]` falling inside JSON string literals
(respecting `\` escapes), and routed both `parseAllToolCalls` (brace) and
`parseSuggestions` (bracket) through it. Previously a lone unbalanced
brace inside a `run`/`push` string arg (e.g. `"« IF x }"`) mis-walked
depth and dropped an otherwise-valid tool call; `parseSuggestions`'
doc-claimed string-awareness was also untrue until now. +4 `session275:`
pins in `tests/test-chatbot-parse.mjs` (unbalanced `}` / `{`, escaped
quote, SUGGEST `]`-in-string). `node tests/test-all.mjs` → 5755 passed /
0 failed (baseline 5751). Next: still no coverage for `TOOL_ALIASES`
normalization or `effectiveBudget`/`activeContextTokens` — pull those out
as pure helpers and pin them.

### 2026-06-14 22:31 — rpl-programming
Fixed a real parser bug in `www/src/rpl/parser.js`: the bare-identifier
tokenizer's stop set lacked the program guillemets, so an operator name
abutting a closing `»` swallowed the delimiter (`« 1 2 <»` → `Name('<»')`,
program auto-closing on EOF instead of its real `»`; same for `≤»` and
ASCII `<>>`). Added `«»` to the ident stop set plus a `j > i` lookahead
that breaks on embedded `<<`/`>>` while keeping a lone `<`/`>` a valid
bare operator name. +6 pins in `tests/test-entry.mjs`. Updated `docs/RPL.md`
(parser bullet + session-272 chapter, stamp → 272, demoted s271 heading).
`node tests/test-all.mjs` → 5751 passed / 0 failed.
Next: verify list/vector openers `{[` are symmetric for the same no-space
abutment class; deferred halted-stack persistence remains the lone larger item.

### 2026-06-15 05:19 — data-types
Added the **S (String) column** to the combinatorial / integer-divmod
family matrix table in `docs/DATA_TYPES.md` (COMB / PERM / IQUOT /
IREMAINDER / XROOT) — the table carried R/Z/Q/C/N/Sy/L/V/M/T only, so
String was untested. All five reject String (COMB/PERM via
`_combPermArgs` `!isInteger&&!isReal`; IQUOT/IREMAINDER via
`_intQuotientArg`; XROOT degree-x via `toRealOrThrow` → "expected real,
got string"). Continues session 267's S-column work on CONJ/RE/IM.
+5 `session269:` rejection pins in `tests/test-types.mjs` (one per op).
No source changes — rejections were already correct, just untested.
`node tests/test-all.mjs` → 5742 passed / 0 failed (baseline 5737).
Next: extend the S column onto the stat-dist family (UTPC/UTPF/UTPT/
BETA/ERF/ERFC/GAMMA/LNGAMMA/HEAVISIDE/DIRAC — all reject String via
scalar-handler guards, confirmed by probe) and the special-function
family (XPON/MANT/TRUNC/ZETA/LAMBERT/PSI). Open larger item remains
candidate #4: Unit dim-equivalence `==` (AUR §20, multi-run design).

### 2026-06-15 05:12 — command-support
Shipped `PMINI` (HP50 AUR §3-172, minimal polynomial of a square matrix)
in `www/src/rpl/ops.js` — a real HP50 command that was missing from both
the registry and `docs/COMMANDS.md` (so it never showed in the ✗ tally).
Near-copy of PCAR: `_popSquareMatrix` + `_matrixToGiacStr` routed through
Giac `pmin(M,vx)`, returning a Symbolic; it's also JORDAN's level-4
output, so this is a building block toward the lone remaining ✗. +4
assertions in `tests/test-algebra.mjs` (2×2 happy, repeated-eigenvalue
3×3 where deg(min) < deg(char), non-Matrix + non-square rejections).
Updated COMMANDS.md (PMINI row, ✓ 448→449, register 481→482 / top-level
462→463, session-197 Counts note). `node tests/test-all.mjs` → 5737
passed / 0 failed (baseline 5733). Next: `JORDAN` is still the only ✗ —
its 4-output format (PMINI level 4, PCAR level 3, eigenvalue-tagged
characteristic spaces with "Eigen:"-tagged Jordan chains level 2,
eigenvalue-with-multiplicity array level 1) can now reuse PMINI + PCAR
for levels 3/4; remaining work is the level-2 tagged-space formatting.

### 2026-06-15 04:56 — code-review
Caught fresh doc↔code drift left by the 04:01 SCHUR ship: `docs/COMMANDS.md`
had updated the ✗-count and header narrative but not the ✓-count bullet
(still 447) or the register-count prose (still 480/461). SCHUR adds exactly
one top-level `register('SCHUR', …)` (confirmed via `git diff`), so live
counts are 481/462 and ✓ is 448. Fixed all three figures in `COMMANDS.md`
(:39, :224, :238) with SCHUR-attributed clauses; filed+resolved **C-016** in
`docs/REVIEW.md` and bumped its Last-updated stamp. Doc-only.
`node tests/test-all.mjs` → 5733 passed / 0 failed. Next: code-review queue
remains the deferred-post-ship hygiene items (O-009/O-011/O-012 .bak +
lock-body findings) plus the O-013 RPL_CATALOG drift audit.

### 2026-06-15 04:46 — unit-tests
First net-new assertions in this lane since session 267 (sessions 265/269
were snapshot-refresh runs). Hardened the session179 String-ordered-compare
cluster in `tests/test-types.mjs` (+8 `session273:` pins): closed the
cross-type String/numeric rejection arm on `>` / `≤` / `≥` (only `<` was
pinned, though all four route through the same `comparePair` guard at
`ops.js:5143`) and added a non-empty proper-prefix lex boundary on each op
(`"ab" < "abc"` etc.; session179 only covered the empty-prefix corner).
No source change. Updated `docs/TESTS.md` (header → s273 + new coverage
snapshot). `node tests/test-all.mjs` → 5733 passed / 0 failed (baseline
this run 5725). Next: String `==` / `≠` / `SAME` have value-equality pins
but no lex-vs-value-equality contrast pin; and the ✓-cell positive-coverage
audit (queue item 7) remains an open evergreen for this lane.

### 2026-06-15 04:41 — ui-development
Started ROADMAP §6's command palette / fuzzy op-search by shipping its DOM-free
matching core: new `www/src/ui/op-search.js` exporting `fuzzyScore` (subsequence
match with first-char anchor, contiguous-run, and length tie-break bonuses;
exact hit short-circuits to 1000; non-subsequence → -1) and `searchOps`
(filter + descending-score sort with alphabetical tie-break; empty/whitespace
query returns a detached copy of the list). Added `tests/test-op-search.mjs`
(+23 assertions, incl. a live-`allOps()` integration block) and wired it into
`tests/test-all.mjs`. Annotated the §6 palette bullet in `docs/ROADMAP.md`.
`node tests/test-all.mjs` → 5725 passed / 0 failed (baseline was 5702).
Next: build the overlay that consumes this core — `/`-triggered input box over
#calculator, live result list bound to `searchOps`, Enter invokes the selected
op via the command-line path, Esc/backdrop closes; mirror command-help.js's
mount-inside-#calculator pattern. (Note: pre-existing untracked
`www/src/ui/keyboard.js.bak` left as-is — not this run's artifact.)

### 2026-06-15 04:25 — ai-chatbot
First test coverage for the AI lane, which had none. Exported four pure
response parsers from `www/src/ai/chat-bot.js` (`parseAllToolCalls`,
`parseSuggestions`, `findMachineSectionStart`, `stripThinkBlocks`) and added
`tests/test-chatbot-parse.mjs` (+25 assertions), wired into `tests/test-all.mjs`.
Cases pin the tricky paths: balanced HP50 list braces inside a string argument,
malformed-JSON skip, the trailing-comma quoted-token fallback in SUGGEST,
earliest-marker selection, and unclosed mid-stream `<think>` dropping.
`node tests/test-all.mjs` → 5702 passed / 0 failed (baseline was 5677).
Next: harden `parseAllToolCalls` against an *unbalanced* brace inside a string
argument (a lone `{`/`}` in a list literal still mis-walks depth — needs a
string-aware scanner, not a raw brace counter); also no coverage yet for the
`TOOL_ALIASES` normalization or `effectiveBudget`/`activeContextTokens`.

### 2026-06-15 04:21 — rpl-programming
Fixed doc↔code drift in `docs/ROADMAP.md` §4: bullet 1 claimed HALT inside a
variable-called named sub-program "still rejects … but doesn't suspend" (the
pre-106 state) and bullet 2 called DBUG/SST/SST↓ "stubs". Both contradict shipped,
`session106:`-pinned behavior in `tests/test-control-flow.mjs`. Rewrote both bullets
to reflect the session-106 lift (Name-eval path is now generator `_evalValueGen`) and
that DBUG/SST/SST↓ are real ops needing only a UI surface. Doc-only — also added a
session-271 chapter to `docs/RPL.md`, demoted session 268's `(this run)` heading, and
bumped the status stamp 268→271. `node tests/test-all.mjs` → 5677 passed / 0 failed.
Next: rpl-programming queue is fully shipped; remaining open items are deferred
(halted-program persistence) or UI-lane (ABORT status-line flash, step-mode indicator).

### 2026-06-15 04:08 — data-types
Completed the C-column rejection-pin pass session 267 left half-done: GAMMA /
LNGAMMA / HEAVISIDE carried `C=✗` in the special-function family table with no
documenting note or pin. Added 3 `session268:` pins in `tests/test-types.mjs`
(Complex(1,2) → Bad argument type for each; GAMMA/LNGAMMA via `isInteger?…:isReal?…:null`,
HEAVISIDE via isReal/isInteger/isBinaryInteger/isSym scalar arm). Doc-only matrix
update in `docs/DATA_TYPES.md` (three C-cell notes + Last-updated header). No source
changes — rejections were already correct, just untested.
`node tests/test-all.mjs` → 5677 passed / 0 failed (baseline was 5674).
Next: stat-dist family C-column is now fully pinned. Remaining open data-types item is
candidate #4 — Unit dim-equivalence `==` (needs AUR §20 read; larger multi-run design task).

### 2026-06-15 04:01 — command-support
Shipped `SCHUR` (Schur decomposition, HP50 AUR §3-218) in `www/src/rpl/ops.js`
— ✗ → ✓, the first net new registration in this lane since the session-149
MODULO cluster. Giac `SCHUR(A) = hessenberg(A,-1)` returns `[P, B]` with
`B = inv(P)·A·P`, mapping onto HP50 `A = Q·T·TRN(Q)` (P↔Q level 2, B↔T level 1);
near-copy of EGV's pipeline. +8 assertions in `tests/test-algebra.mjs` (happy
path + non-Matrix / non-square / non-pair rejections). Updated `docs/COMMANDS.md`
(SCHUR ✓ row, JORDAN-only ✗ row, Counts stamp → session 196).
`node tests/test-all.mjs` → 5674 passed / 0 failed (baseline was 5666).
Next: `JORDAN` is the lone remaining ✗ — its 4-output (min poly / char poly /
eigenvalue-tagged characteristic spaces / eigenvalue array) format needs a
dedicated multi-run effort composing Giac `pmin` / `charpoly` / `eigenvects` /
`eigenvals`.
