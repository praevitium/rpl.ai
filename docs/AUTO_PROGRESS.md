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

Last lane: command-support
Last run: 2026-06-15 09:54

---

## Run log

Newest entry per lane (older history is in git). Each run appends one entry:
date, lane, what shipped, test result, what's next.

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
