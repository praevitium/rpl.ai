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

Last lane: code-review
Last run: 2026-06-15 04:56

---

## Run log

(newest first — each run appends one entry: date, lane, what shipped, test result, what's next)

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
