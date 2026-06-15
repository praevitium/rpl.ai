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

Last lane: ai-chatbot
Last run: 2026-06-15 06:50

---

## Run log

Newest entry per lane (older history is in git). Each run appends one entry:
date, lane, what shipped, test result, what's next.

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
