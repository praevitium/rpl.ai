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
Last run: 2026-06-17 23:50

---

## Run log

Newest entry per lane (older history is in git). Each run appends one entry:
date, lane, what shipped, test result, what's next.

### 2026-06-17 23:50 — data-types
Closed the session431-queued bivariate-accumulator holdout: the element-level
entry-coercion reject arms of MEDIAN/COV/CORR/ΣXY. All four coerce each element
through `_statsNumericEntry` (`ops.js` ~10820, isReal/isInteger only) — MEDIAN
via `_medianItems`, the bivariate ops via `_twoColsOrThrow`/`_matStatsCol`. Prior
coverage was container-level only (MEDIAN had a lone Complex-Vector reject from
session053; COV had 1-row/3-col/Vector; ΣXY's container rejects live in
test-stats), so a well-formed Vector/Matrix carrying a BinInt *element* was never
exercised — a refactor adding a sloppy `Number(x.value)` BinInt arm to
`_statsNumericEntry` would silently flip reject→accept across the whole stats
family. Probed all arms live first (repo-rooted import, CAS-free): every BinInt
element and every Complex element below → `Bad argument type`. Added a
`session438:` block (+10 pins) in `tests/test-matrix.mjs` after the session053
COV-on-Vector reject: MEDIAN BinInt-in-Vector + BinInt-in-Matrix-column;
COV/CORR BinInt in both x- and y-column (symmetric through `_twoColsOrThrow`);
ΣXY BinInt in both columns; plus the Complex-element reject for COV/CORR/ΣXY
(these never widened to `_statsNumOrComplexEntry`, unlike TOT/MEAN). No source
change. Updated the candidates section in `docs/DATA_TYPES.md` (session438 DONE).
`node tests/test-all.mjs` → 7611 passed / 0 failed (baseline 7601). Next
(data-types): the `_statsNumericEntry` reject contract is now drift-guarded
across every caller; re-scan MAXΣ/MINΣ and the regression family
(LINFIT/LOGFIT/…) for any element-coercion arm still reached only by an
Integer/Real entry, else the lone larger open item remains Unit dim-equivalence
`==` (UEQUAL / flag flip, AUR §20, multi-run). (Probe file removed via
file-delete grant — no stray scratch file this run.)

### 2026-06-17 20:30 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap), so continued the
alias rejection-symmetry sweep and closed the array compose/decompose family's
ASCII-alias gap — the last un-swept shared-instance arrow pair. `→ARRY`/`->ARRY`
register the SAME `_toArrayOp` instance, `ARRY→`/`ARRY->` the same `_fromArrayOp`
(probed `lookup('->ARRY').fn === lookup('→ARRY').fn`, same for ARRY↔), but the
ASCII aliases had happy-path-only coverage while the canonicals carry the
session372/405 compose rejects and the `ARRY→`-on-Real decompose reject — a
refactor splitting one alias into its own impl and dropping a guard would pass
green. Probed all arms live first (repo-rooted import, CAS-free): both
shared-instance identities hold; `->ARRY` String dim-spec → Bad argument type,
3-element size-list / -1 size-item → Bad argument value, positive `{2}` →
Vector[10 20]; `ARRY->` Real / String → Bad argument type. Added a `session437:`
block (+7 pins) in `tests/test-reflection.mjs` after the ARRY→-on-Real reject
block. No source change. Updated the Vectors/Matrices/Arrays row in
`docs/COMMANDS.md`. `node tests/test-all.mjs` → 7601 passed / 0 failed (baseline
7594). Next (command-support): the arrow-alias families are now all
rejection-symmetric across canonicals and ASCII aliases (R→D/D→R, R→B/B→R,
→V2/→V3/V→, row/col, →HMS, ARRY); the lone remaining items are the JORDAN
multi-run Giac shape-capture (init exceeds the 45s cap here) and the →V2/→V3
element-type gate (a permissive-contract change needing an AUR check, not a pin).
(Probe lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 20:05 — code-review
Standing pattern-1 reconciliation first (no drift): `grep -cE "^register\("
www/src/rpl/ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then closed a fresh
file-header coverage gap, filed/resolved as R-028: `pretty.js`'s header
documents the Box model ("Everything is a Box: { width, ascent, descent,
draw(x, baselineY) }", and a row's ascent/descent are the **max** of its
children, width their sum), but the public entry `layoutAst` is imported into
`tests/test-algebra.mjs` and **never called** — only `typeof`-asserted (~:581)
and destructured-but-unused (~:1517); every other pretty pin goes through
`astToSvg`, which exposes only the outer width/height. So the Box four-member
shape, `draw` returning a string, and the row max-of-children rule were never
asserted — a refactor changing `rowBox`'s ascent/descent from `Math.max` to a
sum, or dropping a Box member, would pass every `astToSvg` pin. Probed all arms
live first (repo-rooted import, CAS-free): a Box has numeric
width/ascent/descent + a `draw` fn returning `<text…>`; `layoutAst('1/2 = 3')`
takes the fraction child's ascent/descent (26.9, the tallest) which is < the
sum of children's (46.1); `layoutAst('-X').width === 2 × layoutAst('X').width`
(row width = sum). Added a `session436:` block (+7 pins) in
`tests/test-algebra.mjs` after the pretty.js smoke-test block. No source change.
Updated `docs/REVIEW.md` (R-028). `node tests/test-all.mjs` → 7594 passed / 0
failed (baseline 7587). Next (code-review): standing pattern-1 reconciliation,
then the lone open source-side item R-025 (state.js forwards realMaxExp to
`Decimal.set()` with the wrong keys — owner rpl-programming, deliberate
behavior-change run); otherwise the pretty.js Box contract is now drift-guarded,
so re-scan the remaining un-pinned source-file headers (formatter.js's
stack-context tick contract is already covered via formatStackTop in
test-eval.mjs; the radical/fraction/superscript Box composers in pretty.js are
the next layout candidates) for the next coverage-asymmetry pin. (Probe lived in
/tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 19:35 — unit-tests
Closed the SQRT-on-Rational APPROX-mode coverage gap, the mode-dependent sibling
of session428's rounding family. SQRT's EXACT-mode Rational arm (`ops.js` ~1163,
`isRational(v) && !getApproxMode()`) keeps a non-negative Rational exact —
perfect square → Rational/Integer, else Symbolic — but in APPROX mode that arm
is skipped and the operand falls to the final `else` (~1182), collapsing to Real.
Every prior SQRT-on-Rational pin (test-types ~1317, session120 ~3291) ran in
EXACT mode, so the APPROX collapse had zero coverage: a refactor folding it into
the EXACT BigInt fast-path would return Rational(2/3) for SQRT(4/9) yet pass
every EXACT pin. Probed all arms live first (repo-rooted import, CAS-free):
APPROX SQRT 4/9 → Real 0.666… (EXACT → Rational 2/3), 9/16 → Real 0.75 (EXACT →
Rational 3/4), 2/9 → Real 0.471… (EXACT → Symbolic), 1/4 → Real 0.5; the
negative-Rational Complex arm fires before the mode check and stays pinned in
EXACT. Added a `session435:` block (+4 pins) inside the existing APPROX block in
`tests/test-types.mjs`, after the session428 rounder block, before its
`setApproxMode(false)` restore. No source change. Updated `docs/TESTS.md`
(status/table 7507→7587, test-types row +4, advanced the queue, added a coverage
note). `node tests/test-all.mjs` → 7587 passed / 0 failed (baseline 7583). Next
(unit-tests): the APPROX/EXACT Rational split is now pinned for the rounding
family and SQRT; the `^`-on-Rational and the transcendental `_exactUnaryLift`
(`ops.js` ~1235, LN/EXP/SIN…) APPROX-vs-EXACT arms are the next mode-dependent
candidates. (Probe lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:31 — ui-development
Closed the mid-cursor coverage gap in `Entry.eex()` (`entry.js` ~540). Every
prior eex pin (session374, `tests/test-entry.mjs`) parks the cursor at the
buffer END, so two arms had zero coverage: (1) eex inserts 'E' AT the cursor
via `type()` — not appended at the end; and (2) the exponent-already-present
guard scans only the token segment LEFT of the cursor
(`buffer.slice(0, cursor)` → `match(...) ?? ''`), so it misses an E to the
RIGHT and the empty/whitespace-tail fallback returns ''. A refactor scanning
the whole token, or appending E at the end, would pass every prior pin yet
change all of these. Probed all arms live first (repo-rooted import, DOM-free):
`'25'@1`→`'2E5'` cur 2 (mid-insert), `'5'@0`→`'E5'` (empty left segment),
`'2 5'@2`→`'2 E5'` (space-tail no match), `'1E5'@1`→`'1EE5'` (guard misses the
right-of-cursor E), `'1E5'@3`→`'1E5'` no-op (left segment carries the E). Added
a `session434:` block (+5 pins) inside the session374 eex block in
`tests/test-entry.mjs`, after the lowercase-e no-op. No source change. No
ROADMAP edit: ui-development records in the run-log, notes live in the sources.
`node tests/test-all.mjs` → 7583 passed / 0 failed (baseline 7578). Next
(ui-development): eex is now pinned on the mid-cursor insert point and the
left-of-cursor token scan; the remaining ui surfaces are DOM/render-bound (the
keypad `renderKeyboard`, the SidePanel render/drag DOM, the command-palette
overlay) and need a render harness. (Inert scratch probe `_probe_eex.mjs` at
repo root could not be unlinked — bash sandbox runs as a different uid than the
file tools, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 23:26 — ai-chatbot
Gave `www/src/ai/llm.js` (the main-thread Web Worker manager, the
worker-based sibling of RemoteLLM) its first tests — it had ZERO coverage:
every prior AI-lane pin targeted chat-bot.js / remote-llm.js /
system-prompt.js, so a refactor of LLM's load/generate preconditions, its
subscribe/unsubscribe contract, or its `_onWorkerMessage` router would pass
the whole suite. The class spins up a real Worker only inside load() AFTER
its guards, so the constructor defaults, both load() preconditions (no
modelId; same-id-while-ready no-op — worker stays null), the generate()
readiness gate, the onStatus/onProgress/onStats fan-out, and the entire
message router are all reachable Worker-free (the session339 RemoteLLM
network-free-surface precedent). Probed all arms live first (mount-rooted
import, no Worker): load()→'load() requires a modelId' (worker null),
load(same while ready)→resolves (worker null), generate()→'Model not ready',
_setStatus fan-out + unsubscribe; `_onWorkerMessage` ready arm promotes
`_loadingModelId`→`loadedModelId` BEFORE the status listeners fire (the
CRITICAL ORDERING contract — a listener reading loadedModelId during the
'ready' fan-out sees 'mY') and resolves the load promise; error arm rejects
load+gen and flips status; progress/token fan-out; stats caches lastStats +
fans out + the per-listener try/catch swallows a throwing listener; done
resolves+clears gen handlers; error rejects gen; abort() is a safe no-op
when no worker exists. Created `tests/test-llm-manager.mjs` (new file, +22
pins, session433 block) and registered it in `tests/test-all.mjs`'s FILES
list after test-remote-llm. No source change. `node tests/test-all.mjs` →
7578 passed / 0 failed (baseline 7556). Next (ai-chatbot): the LLM manager's
worker-free surface is now pinned; remaining uncovered AI surfaces stay
DOM/stream/Worker-bound (LLM.load()'s actual Worker spin-up + cache-buster
URL, the `<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the
display-math split in appendInlineMarkdown, the streamed-bubble assembly in
`_runLoop`, and RemoteLLM.generate's SSE decode loop) and need a
DOM/fetch/Worker harness. (Probe lived in /tmp, not repo root — no stray
scratch file this run.)

### 2026-06-17 23:58 — rpl-programming
Closed the session425-queued holdout: the Integer/Complex/reject arms of
`isTruthy` reached through the logical ops `AND`/`OR`/`XOR` (`binaryLogic`,
`ops.js` ~5237 — `const x = isTruthy(a), y = isTruthy(b)`, taken only when
neither operand is a BinaryInteger; two BinInts go bitwise, a mixed BinInt
rejects up front). session068's truth table fed only `Real` operands, so the
Integer arm (`v.value !== 0n`), the Complex arm (`re !== 0 || im !== 0`), and
the `Bad argument type` reject of `isTruthy` were never exercised through the
logical ops — a refactor narrowing `binaryLogic` to a Real-only coercion would
pass green while breaking `Integer 5 Integer 0 AND` and a pure-imaginary
operand. Probed all arms live first (/tmp, CAS-free, mount-rooted import):
Int `5 AND 0`→0 / `5 AND 3`→1 / `0 OR 0`→0 / `5 OR 0`→1 / `5 XOR 3`→0 /
`0 XOR 4`→1; Complex `(0,2) AND (3,4)`→1 / `(0,0) AND (3,4)`→0 /
`(0,0) OR (0,0)`→0 / `(0,2) XOR (0,0)`→1; mixed Int/Complex × Real per-slot;
String in either slot → `Bad argument type`. Added a `session432:` block
(+16 pins) in `tests/test-comparisons.mjs` after the session068 truth-table
block. No source change. Updated the `isTruthy` paragraph in `docs/RPL.md`.
`node tests/test-all.mjs` → 7556 passed / 0 failed (baseline 7540). Next
(rpl-programming): the `isTruthy` truthiness surface is now pinned across IFT/
IFTE/NOT (session425) and AND/OR/XOR (session432); re-scan the WHILE/DO/START/
FOR test-slot `isTruthy` calls for any arm still reached only by a Real operand,
else the lone larger open items remain halted-stack persistence across
`persist.js` (generators aren't JSON-serialisable) and the Grob NEWOB identity
fall-through (blocked until a Grob value is constructible CAS-free). (Probe
lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:55 — data-types
Closed the stats-reducer element-coercion B `✗` gap. TOT/MEAN/VAR/SDEV
(`ops.js` ~10912-10951) accept a Vector/Matrix operand but coerce each ELEMENT
through a per-entry helper with no BinaryInteger arm — TOT/MEAN via
`_statsNumOrComplexEntry` (~10826, isReal/isInteger/isComplex), VAR/SDEV via
`_statsNumericEntry` (~10820, isReal/isInteger only). session147 pinned only the
wrong-container reject (operand neither Vector nor Matrix); a BinInt *element*
inside a well-formed Vector/Matrix was never exercised, so a refactor adding a
sloppy `Number(x.value)` BinInt coercion would silently flip reject→accept.
Probed all arms live first (Stack + lookup, CAS-free): BinInt element → `Bad
argument type` for all four on a Vector and for TOT on a Matrix column; Complex
element → Complex for TOT (re 6, im 4) / MEAN, `Bad argument type` for VAR/SDEV.
Added a `session431:` block (+10 pins) in `tests/test-stats.mjs` after the
session147 canonical ΣX/ΣX2 block; imported `BinaryInteger`/`isComplex`. No
source change. Updated the candidates section in `docs/DATA_TYPES.md` (DONE +
next holdout). `node tests/test-all.mjs` → 7540 passed / 0 failed (baseline
7530). Next (data-types): re-scan the bivariate accumulators (ΣXY/COV/CORR) and
MEDIAN for an element-coercion arm reached only by an Integer/Real entry, else
the lone larger open item remains Unit dim-equivalence `==` (UEQUAL / flag flip,
AUR §20, multi-run). (Probe lived in /tmp, not repo root — no stray scratch file
this run.)

### 2026-06-17 23:45 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap), so continued the
alias rejection-symmetry sweep and closed the queued bitwise R↔B converter gap.
`B→R`/`B->R`/`R→B`/`R->B` are FOUR independent `register(...)` closures (probed
`lookup('B→R').fn !== lookup('B->R').fn`, same for R↔B — not the shared-fn shape
of C→R/C→P), each re-deriving its own type guard. Prior reject coverage was
lopsided: session064 (test-arrow-aliases) pinned only the String reject of
R→B/R->B (not Complex/BinInt), and test-binary-int's B→R-on-Real / R→B-on-BinInt
rejects use a loose `null` matcher and never touch the ASCII aliases — so a
refactor dropping the guard from one alias closure (e.g. `B->R` accepting a Real)
would pass green. Probed all arms live first (repo-rooted import, CAS-free):
B→R/B->R accept only BinaryInteger (reject Real/Integer/Complex/String); R→B/R->B
accept Real/Integer (reject Complex/String/BinInt); all rejects `Bad argument
type`. Added a `session430:` block (+14 pins) in `tests/test-arrow-aliases.mjs`
after the session064 R→B/R->B String-reject block: B→R/B->R × 4 reject shapes,
R→B/R->B × 3 reject shapes, each asserting the specific message. No source
change. Updated the R→B/B→R row in `docs/COMMANDS.md`. `node tests/test-all.mjs`
→ 7530 passed / 0 failed (baseline 7516). Next (command-support): the bitwise
R↔B converter family is now reject-symmetric across canonicals and all ASCII
aliases; the remaining un-swept arrow-alias families are the `→V2`/`→V3`
element-type gates (accept any object, no numeric guard — needs an AUR behavior
check before pinning since it's a contract change, not a pin), else the lane
truly has only the JORDAN multi-run shape-capture effort left. (Probe lived in
/tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:30 — code-review
Standing pattern-1 reconciliation first (no drift): `grep -cE "^register\("
www/src/rpl/ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then closed a fresh
file-header coverage gap, filed as R-027: `algebra.js`'s header documents "all
nodes are plain frozen objects" and the `Fn` ctor JSDoc that "Uppercasing
happens inside the ctor" — but every prior test reaches the AST ctors only
structurally (`astEqual`, `parseAlgebra`). The lone uppercasing pin
(test-algebra ~270) feeds `parseAlgebra('sin(X)')`, so a refactor moving the
case-fold from the `Fn` ctor to the parser (or dropping a freeze / a coercion)
would pass green while breaking `Fn('sin', …)` and non-parser callers. Probed
all arms live first (repo-rooted import, CAS-free): `Num('3.5')`→value 3.5
(NaN on non-numeric), `Var(42)`→name '42', `Fn('sin', a)`→name 'SIN', every
node frozen (mutation throws), `Fn.args` a frozen COPY (input-array mutation
doesn't leak in). Added a `session429:` block (+9 pins) in
`tests/test-algebra.mjs` after the session197 PMINI block, calling the ctors
directly (AstNum/AstVar/AstNeg/AstBin/AstFn). No source change. Updated
`docs/REVIEW.md` (R-027). `node tests/test-all.mjs` → 7516 passed / 0 failed
(baseline 7507). Next (code-review): standing pattern-1 reconciliation, then the
lone open source-side item R-025 (state.js forwards realMaxExp to `Decimal.set()`
with the wrong keys — owner rpl-programming, deliberate behavior-change run);
otherwise the algebra.js ctor contract is now drift-guarded, so re-scan the
remaining un-pinned source-file headers (formatter.js's stack-context tick
contract, pretty.js's Box model) for the next coverage-asymmetry pin. (Probe
lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:25 — unit-tests
Closed the APPROX-mode coverage gap in the rounding family's Rational arm.
`FLOOR`/`CEIL`/`IP`/`FP` route a Rational through `_rounderScalar` (`ops.js`
~1356): EXACT mode takes a BigInt path returning Integer/Rational (well pinned
in test-types' EXACT block — 7/2, -7/2, 4/2), but APPROX mode
(`getApproxMode()`, ~1365) takes a Decimal path collapsing ALL FOUR to Real.
Every prior rounder-on-Rational pin ran in EXACT mode, so the APPROX arm had
zero coverage — a refactor folding it into the BigInt path would return
Integer/Rational yet pass every EXACT pin; FP's exact-zero (4/2) returns Real(0)
here, distinct from EXACT's Integer(0n). Probed all arms live first (mount-rooted
import, CAS-free): APPROX 7/2 → FLOOR 3 / CEIL 4 / IP 3 / FP 0.5 (all Real),
-7/2 → -4 / -3 / -3 / -0.5, 4/2 → 2 / 2 / 2 / 0 (FP Real(0)). Added a
`session428:` block (+12 pins) inside the existing APPROX-mode block in
`tests/test-types.mjs`, before its `setApproxMode(false)` restore. No source
change. Updated `docs/TESTS.md` (status/table 7437→7507, test-types row +12,
advanced the queue, added a coverage note). `node tests/test-all.mjs` → 7507
passed / 0 failed (baseline 7495). Next (unit-tests): the rounding family's
APPROX/EXACT Rational split is now pinned; re-enumerate the remaining `✓` cells
in DATA_TYPES whose result-determining arm is reached only by a sibling type or
only in one of EXACT/APPROX mode (other mode-dependent collapses like the
Rational arm of SQRT/`^`/trig are the next candidates). (Probe lived in /tmp,
not repo root — no stray scratch file this run.)

### 2026-06-17 23:00 — ui-development
Closed the equal-score tie-break coverage gap in `searchOps`
(`op-search.js` ~118). The sort comparator is
`b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)` —
when two names fuzzyScore identically it falls to the alphabetical
tie-break, ordering independent of input position. Every prior searchOps
pin fed names that score DIFFERENTLY (SINH's first-char anchor outranks
ASIN's interior match), so the `||` tail had zero positive coverage: a
refactor dropping it and relying on JS's stable sort would preserve input
order on equal scores yet pass every prior pin. Probed all arms live first
(/tmp, DOM-free, mount-rooted import): `AX`/`BX`/`ZX` all score 9 against
`X`; reversed input `['BX','AX']` → `['AX','BX']`, descending
`['CX','BX','AX']` → `['AX','BX','CX']`, mixed `['ZX','AX','MX']` →
`['AX','MX','ZX']`; anchored `XA` scores 19 so `['BX','XA','AX']` →
`['XA','AX','BX']` (score precedence dominates, alphabetical breaks the
tail tie); duplicate `['AX','AX']` exercises the comparator's `=== 0` arm.
Added a `session427:` block (+7 pins) in `tests/test-op-search.mjs` after
the searchOps null-names block. No source change. No ROADMAP edit:
ui-development records in the run-log, notes live in the sources.
`node tests/test-all.mjs` → 7495 passed / 0 failed (baseline 7488). Next
(ui-development): op-search's pure surface is now pinned across
fuzzyScore/matchPositions/highlightSegments/searchOps (incl. the
equal-score tie-break and `=== 0` comparator arm)/moveSelection; the
remaining ui surfaces are DOM/render-bound (the keypad `renderKeyboard`,
the SidePanel render/drag DOM, the command-palette overlay that consumes
this search core) and need a render harness. (Probe lived in /tmp, not
repo root — no stray scratch file this run.)

### 2026-06-17 22:56 — ai-chatbot
Closed the `||`-vs-`??` coverage gap in `activeContextTokens`' remote branch
(`chat-bot.js` ~733, `llm.contextTokens || REMOTE_CONTEXT_TOKENS_DEFAULT`). The
falsy fallback was pinned only with `contextTokens: null` (session312, line ~653)
— but `null` is treated identically by `||` and `??`, so a refactor swapping the
operator would pass every prior pin while changing behavior for a server that
probes a 0 / NaN window (`??` would surface the unusable 0 instead of falling
back to the generous default). Probed all arms live first (repo-rooted import,
DOM/fetch-free): a remote with `contextTokens` 0, NaN, undefined, and null all →
16384; only a positive value passes through. Added a `session426:` block (+3
pins) in `tests/test-chatbot-parse.mjs` after the session312 effectiveBudget
zero-floor block: ctx=0 → 16384 (and its effectiveBudget), ctx=NaN → 16384. No
source change. No docs notes file for this lane (notes live in the www/src/ai/*
sources). `node tests/test-all.mjs` → 7488 passed / 0 failed (baseline 7485).
Next (ai-chatbot): activeContextTokens is now pinned across the no-id, catalog,
unknown-id, and remote (positive / 0 / NaN / null) arms; the remaining uncovered
AI surfaces stay DOM/stream-bound (the `<ul>`/`<ol>` grouping in
appendInlineMarkdownLines, the display-math split in appendInlineMarkdown, the
streamed-bubble assembly in `_runLoop`, and RemoteLLM.generate's SSE decode loop)
and need a DOM/fetch harness. (Inert scratch probe `_probe_act.mjs` at repo root
could not be unlinked — bash sandbox runs as a different uid than the file tools,
same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 23:15 — rpl-programming
Pinned `isTruthy`'s non-Real arms through the truthiness entry points. The
helper (`ops.js` ~97) dispatches Real → Integer (`v.value !== 0n`) → Complex
(`v.re !== 0 || v.im !== 0`), else throws `Bad argument type`, but every prior
IFT/IFTE pin (and the AND/OR/NOT pins in test-comparisons) fed only
`Real(1)`/`Real(0)` — so the Integer arm, the Complex arm, and the reject arm
had zero positive coverage through any truthiness path; a refactor narrowing
`isTruthy` to Real-only would pass green while breaking `Integer 5 «…» IFT` and
a pure-imaginary test. Probed all arms live first (/tmp, CAS-free, repo-rooted
import): IFT Integer(5)→run / Integer(0)→drop, Complex(0,2)/(3,4)→run /
(0,0)→drop, String test → `Bad argument type` with runIft restoring the
snapshot (depth 2, test+action kept); NOT mirrors all three arms + reject
(returns Real(1)/Real(0), `.value` is a Decimal — compared via `.isZero()`);
plus the IFTE false→plain-value mirror. Added a `session425:` block (+13 pins)
in `tests/test-control-flow.mjs` after the IFTE plain-value block. No source
change. Updated the IFT/IFTE paragraph in `docs/RPL.md`. `node tests/test-all.mjs`
→ 7485 passed / 0 failed (baseline 7472). Next (rpl-programming): the
stack-conditional truthiness surface is now pinned across all `isTruthy` arms;
re-scan the WHILE/DO/START/FOR test-slot `isTruthy` calls (and AND/OR's
`isTruthy(a) && isTruthy(b)` at `ops.js` ~5237) for any arm still reached only
by a Real operand, else the lone larger open items remain halted-stack
persistence across `persist.js` (generators aren't JSON-serialisable) and the
Grob NEWOB identity fall-through (blocked until a Grob value is constructible
CAS-free). (Probe lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:10 — data-types
Closed the session418-queued List-aggregate holdout: the BinInt-element arm of
ΣLIST/ΠLIST/ΔLIST (`ops.js` ~7499/7500/7504). `_foldListOp` folds items through
the shared `+`/`*`/`-` dispatch (lookup deferred to call time), which accepts
BinaryInteger and masks the result to the current wordsize — so a list of
BinInts aggregates to a BinInt. Every prior pin fed Real/Integer, so the BinInt
arm was never positively exercised; a refactor swapping the fold's delegation
for an Integer/Real-only coercion would pass green. Probed all arms live first
(/tmp, CAS-free, mount-rooted import): `{#5h #6h #7h}`→#18 sum, `{#2h #3h #4h}`
→#24 product, `{#3h #7h #10h}`→`{#4 #3}` diffs, descending `{#10h #7h #3h}`→
negative diffs wrap two's-complement (ws=64), ws=8 `{#200 #100}`→#44 /
`{#20 #20}`product→#144 (wordsize-masked), `{#101b #1b}`→base b (first-operand
base wins), singleton passthrough, and the independent SLIST closure. Added a
`session424:` block (+9 pins) in `tests/test-lists.mjs` after the SLIST/PLIST/
DLIST distinct-instance block; captures/restores wordsize. No source change.
Updated the candidates section in `docs/DATA_TYPES.md` (List-aggregate DONE).
`node tests/test-all.mjs` → 7472 passed / 0 failed (baseline 7463). Next
(data-types): the MIN/MAX binary surface already pins B `✗` (`_minMaxScalar`
requires `isNumber`); re-scan any remaining List-aggregate or reducer (e.g. a
stat-column reducer over a List) for a BinInt-accepting arm still reached only
by an Integer/Real operand, else the lone larger open item remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run). (Probe lived in
/tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 23:00 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap), so continued the
alias rejection-symmetry sweep and closed the angle-conversion `R→D`/`D→R`
family's reject gap. Unlike the shared-fn-instance aliases (C→R) and the
delegating wrappers (->UNIT/->PRG/->NUM), each ASCII alias here (`R->D`/`D->R`)
is its own independent `unaryReal(...)` registration (`ops.js` ~2969-2970) — a
THIRD alias shape: `fn !==` its Unicode canonical, and the two closures re-derive
the same `toRealOrThrow` guard separately, so a refactor dropping the guard from
one but not the other would pass green. session064's unaryPairs pinned only the
happy-path equivalence. Probed all arms live first (repo-rooted import, CAS-free):
`R->D`/`D->R` `fn !==` canonical; all four ops reject String/Vector/Matrix/im≠0
Complex with `Bad argument type` via `toRealOrThrow`, while a List distributes
element-wise (`_withListUnary`) and a real-valued Complex coerces — neither
rejects. Added a `session423:` block (+18 pins) in `tests/test-arrow-aliases.mjs`
after the session370 ->PRG/->NUM block: two distinct-instance identities + the
shared reject across all four ops × four shapes. No source change. Updated the
`R→D`/`D→R` row in `docs/COMMANDS.md`. `node tests/test-all.mjs` → 7463 passed /
0 failed (baseline 7445). Next (command-support): the angle/coordinate
arrow-alias families are now rejection-symmetric across canonicals and aliases;
re-scan the remaining bitwise arrow aliases (`R→B`/`B→R`/`R->B`/`B->R`, session066
— only the String reject of R→B/R->B is pinned, the B→R/B->R reject siblings and
any other shape may be unpinned) for the next reject-symmetry gap, else the lane
truly has only the JORDAN multi-run shape-capture effort left. (Probe lived in
/tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 22:55 — code-review
Standing pattern-1 reconciliation first (no drift): `grep -cE "^register\("
www/src/rpl/ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then closed a fresh
file-header coverage gap, filed/resolved as R-026: `units.js`'s header documents
the canonical-uexpr contract ("a canonical, frozen array of [symbol, exponent]
tuples, sorted alphabetically by symbol, with zero-exponent factors dropped"),
embodied by `normalizeUexpr` (~105) — but that symbol is imported into
`tests/test-units.mjs` and **never called directly**: every prior pin reaches it
only through parseUnitExpr / multiplyUexpr / inverseUexpr / powerUexpr, which
feed it factor lists already single-symbol or already sorted. So the
duplicate-merge, the merge-to-zero drop, the sort of an out-of-order multi-symbol
input, and the deep freeze (each tuple + the outer array) were never positively
exercised on a raw input — a refactor dropping the merge, the zero-filter, the
sort, or either `Object.freeze` would pass every prior pin. Probed all arms live
first (repo-rooted import, CAS-free): `[m,1]·[m,2]→[m,3]`, `[m,1]·[m,-1]→[]`,
`[s,-2][kg,1][m,1]`→`kg,m,s`, both freezes hold (mutation throws in ESM strict),
unknown symbol throws, `[]`→frozen empty. Added a `session422:` block (+8 pins)
in `tests/test-units.mjs` after the session147 `^`-zero block. No source change.
Updated `docs/REVIEW.md` (R-026). `node tests/test-all.mjs` → 7445 passed / 0
failed (baseline 7437). Next (code-review): standing pattern-1 reconciliation,
then the lone open source-side item R-025 (state.js forwards realMaxExp to
`Decimal.set()` with the wrong keys — owner rpl-programming, deliberate
behavior-change run); otherwise the units.js header is now drift-guarded, so
re-scan the remaining un-pinned source-file headers (formatter.js, pretty.js,
algebra.js) for the next coverage-asymmetry pin. (Probe lived in /tmp, not repo
root — no stray scratch file this run.)

### 2026-06-17 22:50 — unit-tests
Closed the FACT/`!` integer-valued-Real coverage gap. `FACT` (`ops.js` ~1657)
carries a result-*type* arm reached only by an integer-valued Real: a
non-negative one collapses to an exact `Integer` (~1672), a negative one hits
the gamma pole and throws `Infinite result` (~1671). Every prior session047 pin
fed an `Integer` (exact-factorial path) or a *non-integer* `Real` (0.5, the
Γ(x+1) path), so a refactor folding the integer-valued-Real check into the Γ
branch would return `Real(120)` (or NaN at the pole) yet stay green; the Real
pole error is also distinct from the Integer reject (`Bad argument value`).
Probed all arms live first (repo-rooted import, CAS-free): `Real(5)`→
`Integer(120)` (isInteger, not Real), `Real(0)`→`Integer(1)`, `Real(6)` via `!`
→`Integer(720)`, `Real(-3)`/`Real(-1)`→`Infinite result`, vs `Integer(-3)`→`Bad
argument value`. Added a `session421:` block (+4 pins) in `tests/test-numerics.mjs`
after the session047 `-3 !` block. No source change. Updated `docs/TESTS.md`
(status/table 7401→7437, test-numerics row, advanced the queue, added a coverage
note). `node tests/test-all.mjs` → 7437 passed / 0 failed (baseline 7433). Next:
re-enumerate the remaining `✓` cells in DATA_TYPES whose result-determining
coercion arm is reached only by a sibling type — the `_*Scalar` isInteger/BinInt
sweep is complete, so the next candidates are result-*type* branches like FACT's
(an op whose output type depends on a sibling-type input detail). Probe lived in
/tmp, not repo root — no stray scratch file this run.

### 2026-06-17 22:40 — ui-development
Closed the F3/F4/F5 + null-guard coverage gap in `interactiveStackMenu`
(`interactive-stack.js` ~63). The existing test block pins only the F1/F2/F6
labels (ECHO/PICK/CANCL) and the onEcho/onPick/onCancel routing, so the three
middle slots (ROLL/ROLLD/DROP) and their onRoll/onRollD/onDrop wiring were never
exercised — a refactor reordering the slots or crossing those handler keys would
pass every prior pin. The `handlers || {}` guard (~64) was also unhit: every
prior call passed a truthy `{}`, so a refactor dropping it would throw on a
no-arg / null call yet stay green. Probed all arms live first (repo-rooted
import, DOM-free): labels ECHO,PICK,ROLL,ROLLD,DROP,CANCL; onRoll/onRollD/onDrop
fire from slots 2/3/4; `interactiveStackMenu()` and `(null)` both return 6 safe
no-op slots. Added a `session421:` block (+6 pins) in `tests/test-ui.mjs` after
the existing interactiveStackMenu handler-routing block. No source change. No
ROADMAP edit: ui-development records in the run-log, notes live in the sources.
`node tests/test-all.mjs` → 7433 passed / 0 failed (baseline 7427). Next:
interactiveStackMenu is now fully pinned across all six labels, all six handler
slots, and the null guard; the remaining ui surfaces are DOM/render-bound (the
keypad `renderKeyboard`, the SidePanel render/drag DOM, the command-palette
overlay) and need a render harness. (Inert scratch probe `_probe_ism.mjs` at repo
root could not be unlinked — bash sandbox runs as a different uid than the file
tools, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 22:35 — ai-chatbot
Closed the empty-body capture asymmetry in `classifyMarkdownLine`
(`chat-bot.js` ~299). The list arms capture `(.*)` (empty body allowed) while
the heading arm requires `(.+)` — every session367 list pin fed a non-empty
body, so the bodyless-marker arms and the heading/list capture asymmetry were
never positively exercised; a refactor tightening a list's `\s+(.*)` to
`\s+(.+)` (mis-aligning it with the heading) would route a bare marker to text
yet pass every prior pin. Probed all arms live first (repo-rooted import,
DOM-free): `- `/`* `/`  - ` → bullet content '', `1. `/`12. ` → ordered content
'', `# `/`## ` → text (heading needs `.+`, falls through), bare `*` → text, and
`#\tTabbed` → heading level 1 (the `\s+` separator accepts a tab, not just a
space). Added a `session420:` block (+9 pins) in `tests/test-chatbot-parse.mjs`
after the session367 classifyMarkdownLine precedence block. No source change. No
docs notes file for this lane (notes live in the www/src/ai/* sources).
`node tests/test-all.mjs` → 7427 passed / 0 failed (baseline 7418). Next:
classifyMarkdownLine is now fully pinned across precedence, the empty-body
asymmetry, and the tab separator; the remaining uncovered AI surfaces stay
DOM/stream-bound (the `<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the
display-math split in appendInlineMarkdown, the streamed-bubble assembly in
`_runLoop`, and RemoteLLM.generate's SSE decode loop) and need a DOM/fetch
harness. (Probe lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 22:30 — rpl-programming
Closed the session412-queued complement: a spurious CF_INNER
(ELSE/REPEAT/UNTIL) in the IF *test* slot / IFERR *trap* slot is **absorbed**,
not rejected. session412 pins the THEN-branch *reject* (a stray NEXT/STEP →
`IF/THEN: unexpected …`), but the test/trap slot is scanned by the first
`scanAtDepth0(.., {THEN})` (runIf ~3918 / runIfErr ~4006) which short-circuits
only on THEN or a CF_CLOSER — so a stray inner is skipped, the real THEN is
found, and the inner lands in the evaluated test/trap range where evalRange's
orphan-keyword arm (`ops.js` ~3681) drops it silently. Net: identical to the
no-spurious-inner baseline; every prior IF/IFERR pin fed only well-formed
test/trap ranges, so this absorb arm had zero coverage. Probed all live first
(repo-rooted import, CAS-free): `« IF 1 <inner> THEN 2 END »` → 2 for each
inner; `« IF 0 ELSE THEN 2 ELSE 3 END »` → 3 (stray ELSE absorbed, real ELSE
honoured); `« IFERR 1 REPEAT THEN 99 END »` → 1 (no-throw); `« IFERR INV ELSE
THEN 99 END »` → 99 (throw → handler runs). Added a `session419:` block (+6
pins) in `tests/test-control-flow.mjs` after the session412 block. No source
change. Updated the auto-close-policy section in `docs/RPL.md`.
`node tests/test-all.mjs` → 7418 passed / 0 failed (baseline 7412). Next
(rpl-programming): the IF/IFERR test/trap and THEN/ELSE/END slots are now fully
characterised (CF_CLOSER in test slot → "IF without THEN"; CF_CLOSER in THEN
slot → reject; CF_INNER in test slot → absorb; CF_INNER in ELSE slot →
absorb); the lone larger open items remain halted-stack persistence across
`persist.js` (generators aren't JSON-serialisable) and the Grob NEWOB identity
fall-through (blocked until a Grob value is constructible CAS-free). (Probe
lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-17 22:14 — data-types
Closed the session411-queued POS holdout: `_rplEqual`'s BinaryInteger arm
(`ops.js` ~6514, `a.value === b.value`), the comparator POS (`ops.js` ~6670)
uses to find a needle. The arm is reached only when BOTH operands are BinInt —
the `isNumber` cross-type-equality gate above it (~6490) excludes BinInt, so
two BinInts fall past `a.type !== b.type` to the dedicated arm. Every prior POS
pin fed Integer/Real/String needles, so the BinInt arm was never positively
exercised; a refactor folding it into the numeric branch (or dropping it) would
pass green. Unlike `==`/`_binIntCrossNormalize`, `_rplEqual` is structural
(SAME-like) and does NOT cross-family widen BinInt↔Integer. Probed all arms
live first (repo-rooted import, CAS-free): `{#5h #6h #7h} #6h POS` → 2,
not-found → 0, base-cosmetic `{#5h #6h} #6d POS` → 2 (base cosmetic), and both
cross-family directions (`{6 7} #6h` and `{#6h #7h} 6`) → 0 (no widen). Added a
`session418:` block (+5 pins) in `tests/test-lists.mjs` after the POS
substring-not-found block. No source change. Updated the candidates section in
`docs/DATA_TYPES.md` (POS DONE; next holdout = MIN/MAX list reducers).
`node tests/test-all.mjs` → 7412 passed / 0 failed (baseline 7407). Next
(data-types): re-scan the MIN/MAX list reducers (and any List aggregate, e.g.
ΣLIST/∏LIST) for a BinInt-accepting arm still reached only by an Integer/Real
operand, else the lone larger open item remains Unit dim-equivalence `==`
(UEQUAL / flag flip, AUR §20, multi-run). (Inert scratch probe `_probe_pos.mjs`
at repo root could not be unlinked — bash sandbox runs as a different uid than
the file tools, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 22:20 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap), so continued the
alias rejection-symmetry sweep and closed the session384-queued vector
compose/decompose gap. `→V2`/`→V3`/`V→` each register their ASCII alias with the
SAME fn instance (`_toV2Op`/`_toV3Op`/`_fromVecOp`, `ops.js` ~7540-7560), so an
alias rejects identically to its canonical — but only `V→` carried non-vector
reject pins (Real, Matrix in test-reflection); the `V->` alias had
happy-path-only coverage, and the three shared-instance identities were unpinned.
Did NOT touch the `→V2`/`→V3` element-type gate (still no numeric guard — a
possibly-intentional permissive contract needing an AUR behavior check before
pinning, left as queued). Probed all arms live first (/tmp, CAS-free,
mount-rooted import): `->V2`/`->V3`/`V->` `fn ===` their Unicode canonicals;
`V->` on Real/Matrix/String all → `Bad argument type`. Added a `session417:`
block (+6 pins) in `tests/test-reflection.mjs` after the →V3/V→ round-trip block.
No source change. Updated the vector row in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 7407 passed / 0 failed (baseline 7401). Next
(command-support): the vector compose/decompose family is now rejection-symmetric
across canonicals and all three ASCII aliases; the lone remaining vector-family
item is the `→V2`/`→V3` element-type gate (accepts any object — build a
Vector-of-String today; check HP50 AUR before adding a numeric/symbolic guard,
since it's a behavior change, not a pin). Otherwise the lane has only the JORDAN
multi-run shape-capture effort left. (Probe lived in /tmp, not repo root — no
stray scratch file this run.)

### 2026-06-17 22:08 — code-review
Standing pattern-1 reconciliation first (no drift): `grep -cE "^register\("
www/src/rpl/ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then closed the
R-020-queued inverse: session369 pinned only the `encode()` side of persist.js's
"Encoding rules" header, but the documented `decode()` direction (run on every
localStorage load + `.json` import) had no direct pin — `decodeValue` had ZERO
test callers, exercised only indirectly via snapshot/rehydrate round-trips. A
refactor dropping a tag arm, ceasing to recurse into Map/array/plain-object
bodies, or coercing a passthrough primitive would corrupt every saved snapshot
on load yet pass green. Probed all arms live first (repo-rooted import,
CAS-free): `{__t:'bigint'}`→BigInt, `{__t:'decimal'}`→Decimal, `{__t:'map'}`→Map
with recursive value decode, plain-object/array recursion, null/undefined/
primitive passthrough, Directory encode→decode (type + entries Map kept, parent
absent), per-tag round-trip identity. Added a `session416:` block (+15 pins) in
`tests/test-persist.mjs` after the session369 encode block; imported
`decodeValue`. No source change. Updated `docs/REVIEW.md` (R-020 follow-up note).
test-persist is standalone (own counter + `process.exit`, not in the test-all
aggregate): `node tests/test-persist.mjs` → all passed (83 → 98, +15); `node
tests/test-all.mjs` → 7401 passed / 0 failed (baseline 7401, unchanged as
expected). Next (code-review): standing pattern-1 reconciliation, then the lone
open source-side item R-025 (state.js forwards realMaxExp to `Decimal.set()`
with the wrong keys — owner rpl-programming, needs a deliberate behavior-change
run); otherwise the persist.js header contract is now fully drift-guarded in
both directions, so re-scan remaining file-header contracts (the AVAILABLE-TOOLS
prompt↔registry triad O-015/O-016/O-017 is done; stack.js/state.js header
constants R-021..R-024 done) for the next coverage-asymmetry pin. (Inert scratch
probe `_probe_decode.mjs` at repo root could not be unlinked — bash sandbox runs
as a different uid than the file tools, same constraint as prior runs; not in
test-all's FILES list.)

### 2026-06-17 22:05 — unit-tests
Closed the TESTS.md-queued `_*Scalar` sweep target: `_fitScalar`'s
BinaryInteger arm (`ops.js` ~15361). It is the one special-function scalar
coercer with a *third* arm beyond Real/Integer — `isBinaryInteger(v) ?
Number(v.value)` — that the rest of the family (erf/Si/Beta/ARG/CONJ) reject.
PREDV/PREDX route their operand through it; session058 pinned the Integer arm
(`PREDV(Integer 7)` → Real 14) and the Real path, but the BinInt branch was
never positively exercised — a refactor folding it into the Integer arm (or
dropping it) would make `PREDV(#7h)` throw 'Bad argument type' yet pass green.
Probed all arms live first (repo-rooted import, CAS-free): LINFIT y=2x seeds
the slot, `PREDV(#7h)` → Real(14), base-cosmetic `PREDV(#111b)` → Real(14)
(value-based, base display-only), `PREDX(#16)` → Real(8) (inverse fit through
the same arm). Added a `session415:` block (+3 pins) in `tests/test-matrix.mjs`
after the session058 PREDV-Integer block. No source change. Updated
`docs/TESTS.md` (status/table 7343→7401, test-matrix row +3, advanced the
queue, added a coverage note). `node tests/test-all.mjs` → 7401 passed / 0
failed (baseline 7398). Next: the `_*Scalar` isInteger/BinInt sweep is now
complete across the special-function and projection families; re-enumerate the
remaining `✓` cells in DATA_TYPES whose result-determining coercion arm is
reached only by a sibling type for the next pin. (Inert scratch probe
`_probe_fit.mjs` at repo root could not be unlinked — bash sandbox runs as a
different uid than the file tools, same constraint as prior runs; not in
test-all's FILES list.)

### 2026-06-17 22:01 — ui-development
Closed the `.toLowerCase()` key-normalization coverage gap in
`handleModifierShortcut` (`shortcuts.js` ~42). Every prior pin (the shortcuts
block in `tests/test-ui.mjs`, incl. session307) feeds a LOWER-case `e.key`, but
real browsers deliver an UPPER-case `key` ('Z'/'Y'/'V') whenever Shift is held
or Caps Lock is on — so the Shift-Ctrl-Z redo path, the prime real-world combo,
was only ever exercised with a synthetic lower-case 'z'; a refactor dropping the
case-fold would pass every lower-case pin yet break real undo/redo/paste.
Probed all arms live first (repo-rooted import, DOM-free): upper `Z`+Ctrl →
UNDO (depth 1, restored), upper `Z`+Ctrl+Shift → REDO (depth 2), upper `Y`+Ctrl
→ REDO, upper `V`+Cmd → paste 'PASTED', and a modifier combo with empty/undef
`key` → declined (the `e.key || ''` guard). Added a `session414:` block
(+10 pins) in `tests/test-ui.mjs` after the session307 Ctrl-Shift-Y block. No
source change. No ROADMAP edit: ui-development records in the run-log, notes
live in the sources. `node tests/test-all.mjs` → 7398 passed / 0 failed
(baseline 7388). Next: the modifier-shortcut handler is now pinned on the
case-fold and empty-key arms across all four combos; the remaining ui surfaces
are DOM/render-bound (the keypad `renderKeyboard`, the SidePanel render/drag
DOM, the command-palette overlay) and need a render harness. (Probe lived in
/tmp, not repo root — no stray scratch file this run.)

### 2026-06-18 00:55 — ai-chatbot
Closed the multi-key / match-shape coverage gap in `pickContextLength`
(`remote-llm.js` ~107), the arch-keyed context-window extractor from load()'s
`/api/show` probe. The match is `Object.keys(info).find(k =>
k.endsWith('.context_length'))` — it selects the FIRST matching key by
insertion order, then validates only THAT key's value (`typeof === 'number'`
&& `> 0`). Every session346 pin fed a single `.context_length` key, so the
order-dependence and the find-by-name-not-by-validity behavior were never
exercised: a refactor folding the value guard into the `.find` predicate (so it
skips an invalid key to a later valid one) would pass every prior pin yet change
the result on a multi-key map. Probed all arms live first (repo-rooted import,
DOM/fetch-free): two valid keys → first by insertion order wins (32768 vs
8192, order-dependent); first key invalid (0 / non-number) with a later valid
key → null (not the later value); a non-matching key is skipped to the first
`.context_length` match → 2048; a bare `context_length` key (no dot) → null.
Added a `session413:` block (+6 pins) in `tests/test-remote-llm.mjs` after the
session346 no-usable-key block. No source change. No docs notes file for this
lane (notes live in the www/src/ai/* sources). `node tests/test-all.mjs` →
7388 passed / 0 failed (baseline 7382). Next: pickContextLength is now pinned
on the multi-key/order/dot arms; remaining uncovered AI surfaces stay
DOM/stream-bound (the `<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the
display-math split in appendInlineMarkdown, the streamed-bubble assembly in
`_runLoop`, and RemoteLLM.generate's SSE decode loop) and need a DOM/fetch
harness. (Probe lived in /tmp, not repo root — no stray scratch file this run.)

### 2026-06-18 00:40 — rpl-programming
Closed the queued IF/IFERR sibling of session386's CASE reject: a spurious
counter-loop closer (NEXT/STEP) in the THEN-branch slot reaches
`IF/THEN: unexpected <kind>` (`runIf`, `ops.js` ~3957) /
`IFERR/THEN: unexpected <kind>` (`runIfErr` ~4035). The THEN-branch scan
`scanAtDepth0(.., {ELSE})` short-circuits on any depth-0 CF_CLOSER, so a
stray NEXT/STEP lands as `branchScan.kind` neither ELSE nor END and falls to
the throw. Every prior IF/IFERR pin fed only THEN/ELSE/END/auto-close forms,
so these arms had zero coverage — a refactor folding the stray closer into the
ELSE slot's absorb path would pass green. Probed all arms live first
(repo-rooted import, CAS-free): `« IF 1 THEN 2 NEXT END »` → `IF/THEN:
unexpected NEXT`, STEP sibling likewise, falsy `« IF 0 THEN 2 NEXT END »`
still rejects (throw fires at scan time, before either branch), and the IFERR
NEXT/STEP mirror throws before the trap runs; each rolls the stack back to
depth 0 (EVAL post-pop snapshot). Confirmed the test slot instead yields `IF
without THEN` and the ELSE slot absorbs (wanted-null END scan auto-close) —
distinct arms, not pinned here. Added a `session412:` block (+12 assertions)
in `tests/test-control-flow.mjs` after the session083 IF-without-THEN block. No
source change. Updated the auto-close-policy section in `docs/RPL.md`.
`node tests/test-all.mjs` → 7382 passed / 0 failed (baseline 7370). Next: the
IF/IFERR/CASE clause-dispatch reject tails are now all pinned (NEXT/STEP);
re-scan whether a spurious CF_INNER (THEN/ELSE/REPEAT/UNTIL) in an IF/IFERR
test slot is an unpinned absorb sibling, else the lone larger open items remain
halted-stack persistence across `persist.js` (generators aren't
JSON-serialisable) and the Grob NEWOB identity fall-through (blocked until a
Grob value is constructible CAS-free). (Inert scratch probe
`_probe_ifclose.mjs` at repo root could not be unlinked — bash sandbox runs as
a different uid than the file tools, same constraint as prior runs; not in
test-all's FILES list.)

### 2026-06-17 21:51 — data-types
Closed the queued SORT BinInt-element holdout. `_toCompareNumber` (`ops.js`
~7186) has an explicit `isBinaryInteger` arm and `_rplCompare`'s `isAnyNum`
gate includes BinaryInteger, but every prior SORT pin (session151b et al.)
fed Real/Integer/String only — the BinInt comparison arm was never positively
exercised, so a refactor dropping it (→ null, or out of `isAnyNum`) would pass
green while silently breaking BinInt sorts. Probed all arms live first
(mount-rooted import, CAS-free): pure `{#5h #1h #9h #2h}` → ascending by value
with element type preserved; base-cosmetic `{#5h #1b #9o #2d}` → ordered by
value, each base preserved; mixed `{#5h Integer(2) Real(3.5) #1h}` →
[1 2 3.5 5] with each element's type intact. Added a `session411:` block
(+6 pins) in `tests/test-lists.mjs` after the session151b mixed-Integer/Real
block. No source change. Updated the candidates section in `docs/DATA_TYPES.md`
(SORT DONE). `node tests/test-all.mjs` → 7370 passed / 0 failed (baseline
7364). Next (data-types): re-scan any remaining numeric-comparator helper
(POS's `_rplEqual`, MIN/MAX list reducers) for a BinInt-accepting arm still
reached only by an Integer/Real operand, else the lone larger open item
remains Unit dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run).

### 2026-06-18 00:20 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap — sessions
199/200), so continued the alias/rejection-symmetry sweep and closed the
session404-queued HMS family. The binary `HMS+`/`HMS-` carried ZERO rejection
coverage (session044 = happy paths only), and all four ASCII aliases
(`->HMS`/`HMS->`/`D->HMS`/`HMS->D`) are DISTINCT `_hmsUnary` closures (probed
`lookup('->HMS').fn !== lookup('→HMS').fn`, etc. — not the shared-fn-instance
shape of C→R/C→P), so a refactor dropping a guard from one closure wouldn't be
caught by the canonical's pins. `_hmsBinary` rejects Complex in either slot
up front (`Bad argument type`), routes both operands through `toRealOrThrow`
(non-numeric → `Bad argument type`) then `_hmsToHours` (invalid HH.MMSS,
minutes ≥ 60 → `Bad argument value`). Probed all arms live first (mount-rooted
import, CAS-free): every reject confirmed in both operand slots. Added two
`session410:` blocks (+13 pins) in `tests/test-numerics.mjs` — one after the
session044 `→HMS` Complex-reject block (`HMS+`/`HMS-` Complex/String/invalid,
both slots; `->HMS` Complex/String; `HMS->` invalid), one after the session048
`D→HMS`-Complex block (`HMS→D`/`HMS->D` invalid, `D->HMS` Complex) — and
tightened the unpinned session048 `D→HMS`-on-Complex `assertThrows(…, null, …)`
to assert `Bad argument type`. No source change. Updated the two HMS rows in
`docs/COMMANDS.md`. `node tests/test-all.mjs` → 7364 passed / 0 failed
(baseline 7351). Next (command-support): the HMS family is now
rejection-symmetric across canonicals, binary ops, and all four ASCII aliases;
re-scan the remaining arrow-alias pairs for any canonical-vs-alias reject
asymmetry still unpinned (the `→V2`/`→V3` element-type gates flagged by
session384 — they accept any object with no numeric gate, an unpinned but
possibly-intentional contract worth an AUR behavior check before pinning),
else the lane truly has only the JORDAN multi-run shape-capture effort left.

### 2026-06-17 21:43 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" www/src/rpl/ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then
closed the queued R-021 follow-up: the `_pushCoerce` APPROX-collapse contract
as a *cross-file* invariant. session376 pinned only the push-vs-pushMany/dup
asymmetry with a sentinel hook it then resets to identity, so the live ops.js
hook (~17222) — which consults state.js `getApproxMode()` per call and collapses
Integer/Rational + free-variable-free numeric Symbolic to Real on entry, leaving
`X+1` and the don't-touch types alone — was never positively exercised; a
refactor narrowing the collapse, dropping the per-call mode read, or folding a
free-variable Symbolic would pass green. Probed all arms live first (repo-rooted
import, CAS-free): Integer(5)→Real 5, Rational(1/4)→Real 0.25 + 1/3→Real,
Symbolic(1/4)→Real 0.25, Symbolic(X+1) stays, Complex/BinInt untouched, and the
EXACT-flip-back no-op. Added a `session408:` block (+8 pins) in
`tests/test-stack-ops.mjs` *before* the session376 block (which permanently
resets the hook to identity), restoring EXACT at the end. No source change.
Updated `docs/REVIEW.md` (R-021 follow-up note). `node tests/test-all.mjs` →
7351 passed / 0 failed (baseline 7343). Next (code-review): standing pattern-1
reconciliation, then the lone open source-side item R-025 (state.js forwards
realMaxExp to `Decimal.set()` with the wrong keys — owner rpl-programming, needs
a deliberate behavior-change run); otherwise re-scan remaining file-header
contracts for the next coverage-asymmetry pin (the parser.js / types.js header
sweeps R-013..R-016 are done; persist.js `decode()` inverse of R-020 is a
candidate).

### 2026-06-17 21:38 — unit-tests
Closed the TESTS.md-queued next-step: the bare-Integer/Rational scalar arms of
the complex-projection helpers `_conjScalar`/`_reScalar`/`_imScalar`
(`ops.js` ~1508/1514/1520). CONJ/RE return `v` unchanged on Integer/Rational
(identity, same-ref); `_imScalar` returns `Integer(0n)` on Integer/Rational —
an *Integer* zero, distinct from its Real arm's `Real(0)` (`IM(9)`→`Real(0)`).
Every prior scalar pin fed a Real (`CONJ(7)`, `IM(9)`) or a Complex operand, so
the Integer/Rational identity arm and IM's Integer-zero arm were never
positively exercised — a refactor folding them into the Real arm (IM would then
return `Real(0)`) or coercing the operand would pass green. Probed all arms live
first (repo-rooted import, CAS-free): `CONJ`/`RE(Integer 7)`→`Integer 7`
(same-ref), `IM(Integer 7)`→`Integer 0` (`isInteger`, value `0n`), and the
Rational mirrors (`CONJ`/`RE(Rational 3/4)` same-ref, `IM(Rational 3/4)`→
`Integer 0`). Added a `session407:` block (+6 pins) in `tests/test-entry.mjs`
after the Real/Complex CONJ/RE/IM scalar block; imported `Rational`. No source
change. Updated `docs/TESTS.md` (status/table 7301→7343, test-entry row +6,
advanced the queue, added a coverage note). `node tests/test-all.mjs` → 7343
passed / 0 failed (baseline 7337). Next: continue the special-function Z-arm
sweep — re-scan the remaining `_*Scalar` helpers for any `isInteger(v) ?
Number(v.value)` arm still backed only by Real-operand pins (the stat-dist
columns are the likely remaining holdouts).

### 2026-06-17 21:34 — ui-development
Closed the position-normalization coverage gap in `highlightSegments`
(`op-search.js` ~78). The helper builds a `Set` of marked indices then scans
`0..n`, coercing each position via `Math.trunc(Number(p))` — so the render is
independent of input order, deduplicated, and tolerant of fractional /
numeric-string positions. session284 pins only the ascending output of
`matchPositions` plus the reject arms (empty/missing/out-of-range/non-finite),
so a refactor assuming sorted, unique, integer input would pass every prior
pin yet break an overlay that passed positions in any of these shapes. Probed
all arms live first (repo-rooted import, DOM-free): `[2,0]` renders identical
to `[0,2]`, `[1,1,1]` collapses to one mark, `[1.9]`/`[1.2]` truncate to 1 (not
round), `'1'` coerces through Number to 1, and `[3,0,99]` keeps the valid
indices while dropping the out-of-range one. Added a `session409:` block
(+6 pins) in `tests/test-op-search.mjs` after the session284 highlightSegments
reject block, reusing that block's `eqSeg` helper. No source change. No ROADMAP
edit: ui-development records in the run-log, notes live in the sources
(session388/395/402 precedent). `node tests/test-all.mjs` → 7337 passed / 0
failed (baseline 7331). Next: op-search's pure surface is now pinned across
fuzzyScore/matchPositions/highlightSegments/searchOps/moveSelection including
highlightSegments' order-independence and coercion arms; the remaining ui
surfaces are DOM/render-bound (the keypad `renderKeyboard`, the SidePanel
render/drag DOM, the command-palette overlay that consumes this search core)
and need a render harness.

### 2026-06-17 21:31 — ai-chatbot
Pinned the leftmost-match "swallow" contract of `parseInlineSpans`
(`chat-bot.js` ~377). The single alternation regex is scanned left-to-right, so
whichever inline delimiter OPENS FIRST consumes its body up to its own close;
the alternation order only breaks ties at the same index. session360 pinned
only code-swallows-math (`` ` $x$ ` ``), which reads like an absolute "code
before math" precedence — but `$a`c`$` math-ifies the whole body, proving code
does NOT unconditionally beat math (the `$` just opened first). The emphasis/bold
arms swallowing inner spans had zero coverage, and the math↔code tie was pinned
in only one direction. Probed all arms live first (repo-rooted import,
DOM-free): `` `**x**` ``→code "**x**", `*a $x$ b*`→em, `**a $x$ b**`→bold,
`` *a `c` b* ``→em, `$a*b*c$`→math, `` $a`c`$ ``→math. Added a `session407:`
block (+6 pins) in `tests/test-chatbot-parse.mjs` after the session401
newline-asymmetry block. No source change — guards a refactor that splits the
regex into ranked passes and turns the order comment into a hard precedence. No
docs notes file for this lane (notes live in the www/src/ai/* sources).
`node tests/test-all.mjs` → 7331 passed / 0 failed (baseline 7325). Next:
parseInlineSpans is now pinned on alternation order, the bare-dollar guard, the
math-form newline asymmetry, and the leftmost-match swallow in both tie
directions; the remaining uncovered AI surfaces stay DOM/stream-bound (the
`<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the display-math split in
appendInlineMarkdown, the streamed-bubble assembly in `_runLoop`) and need a
DOM/fetch harness.

### 2026-06-18 00:05 — rpl-programming
Closed the queued WHILE/DO mirror of session400: a spurious CF_INNER
(THEN/ELSE/REPEAT/UNTIL) in either condition-loop is absorbed, never rejected.
session136/393 pin that a spurious CF_CLOSER (NEXT/STEP) in the WHILE/DO END
slot is a hard error, but a CF_INNER is skipped by both runner scans — the
REPEAT/UNTIL separator scan (`scanAtDepth0` with `{REPEAT}`/`{UNTIL}`) drops a
foreign inner via the `wanted.has` miss, and the END scan (`wanted` null,
`ops.js` ~4134/4174) returns only CF_CLOSERS — so the inner lands in an
evalRange range and is skipped by the orphan-keyword arm (~3681). Probed all
arms live first (repo-rooted import, CAS-free): every inner in the WHILE/DO END
slot, before the REPEAT/UNTIL separator, and with an explicit END present, all
loop 0→3 (identical to the bare auto-close). Added a `session406:` block
(+14 pins, four loops) in `tests/test-control-flow.mjs` after the session393
DO-spurious-STEP block. No source change. Updated the auto-close-policy
paragraph in `docs/RPL.md`. `node tests/test-all.mjs` → 7325 passed / 0 failed
(baseline 7311). Next: the WHILE/DO/START/FOR closer slots are now fully
characterised (CF_CLOSER rejects symmetric NEXT/STEP+END, CF_INNERS
absorb-and-auto-close); re-scan the IF/IFERR THEN/ELSE/END slots for whether a
spurious counter-loop CF_CLOSER (NEXT/STEP) in an IF clause is an unpinned
reject sibling, else the lone larger open items remain halted-stack persistence
across `persist.js` (generators aren't JSON-serialisable) and the Grob NEWOB
identity fall-through (blocked until a Grob value is constructible CAS-free).

### 2026-06-17 23:50 — data-types
Closed the never-positively-exercised BinaryInteger arm of `_toIntIdx` reached
through `_toDimSpec`'s size-list map (`ops.js` ~7102, `v.items.map(_toIntIdx)`)
— →ARRY's `{n}`/`{m n}` size-list path. The bare BinInt count was pinned
(session077) and the size-list *reject* arms (2.5/"x"/-1/empty/>2) were pinned
(session372), but a BinInt *inside* a valid-length size-list was never
positively exercised, so a refactor swapping the list-map's `_toIntIdx` for an
Integer/Real-only coercion would pass green. This is a distinct `_toIntIdx`
caller from GET/PUT/GETI (session392, which feeds the index slot directly).
Probed all arms live first (repo-rooted import, CAS-free): `{#2h}` → Vector[10
20], `{#2h #3h}` → 2×3 Matrix row-major `[[1 2 3][4 5 6]]`, mixed `{#2h 3}` →
2×3 Matrix, base-cosmetic `{#10b}` (binary 2) → Vector[2]. Added a `session405:`
block (+4 pins) in `tests/test-reflection.mjs` after the session372 →ARRY
reject block. No source change. Updated the candidates section in
`docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 7311 passed / 0 failed
(baseline 7307). Next: re-scan `_toCompareNumber` (`ops.js` ~7186 — SORT's
comparator accepts BinInt) for whether a BinInt-element list sort is positively
pinned, else the lone larger open data-types item remains Unit dim-equivalence
`==` (UEQUAL / flag flip, AUR §20, multi-run design).

### 2026-06-17 23:35 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap — sessions
199/200), so continued the alias rejection-pin sweep and closed the
session398-queued C→R/R→C gap. session043 pinned only R→C's String reject;
C→R's canonical `Bad argument type` throw was unpinned and the ASCII aliases
`C->R`/`R->C` had happy-path-only coverage. Both alias pairs share the
canonical fn instance (`register('R->C', _rToCOp)` ~7845 /
`register('C->R', _cToROp)` ~7876), so they reject identically. Probed all
arms live first (repo-rooted import, CAS-free): `R->C`/`C→R` fn-identity ===
their Unicode canonicals; C→R on String, C→R on a Vector-of-String (inner-loop
element guard ~7867), C->R on String, and R->C with a String operand all →
`Bad argument type`; C→R on a Complex vector still succeeds. Added a
`session404:` block (+6 pins) in `tests/test-numerics.mjs` after the session043
C→R complex-vector block. No source change. Updated the C→R/R→C row in
`docs/COMMANDS.md`. `node tests/test-all.mjs` → 7307 passed / 0 failed
(baseline 7301). Next: the cartesian↔polar (session398) and complex-decompose
(session404) families are now rejection-symmetric across canonicals and ASCII
aliases; re-scan the remaining arrow-alias pairs (e.g. `→HMS`/`HMS→` and the
`D→HMS`/`HMS→D`/`HMS+`/`HMS-` family, `→V2`/`→V3` element-type gates) for any
canonical-vs-alias reject asymmetry still unpinned, else the lane truly has
only the JORDAN multi-run effort left.

### 2026-06-17 23:20 — code-review
Investigated the session397-queued item — the `Decimal.set()` forwarding
inside `setRealMaxExp` (`state.js` ~707, plus the boot call ~220) — and it is
a **latent source bug**, not just a coverage gap, so this run is report-only
(no source/test change). The file-header/JSDoc (~28/166/695) promise realMaxExp
is forwarded to Decimal so arithmetic overflows at the configured boundary, but
the calls pass `{ MAX_EXP, MIN_EXP }` while the vendored decimal.js `config()`
(decimal.mjs ~4198-4239) only honours `maxE`/`minE` and silently skips unknown
keys — so the forwarding is a no-op (`Decimal.maxE` stays ±9e15 after
`setRealMaxExp(100)`). MAXR/MINR/RCMXE mask it by reading `state.realMaxExp`
directly. Probed live (repo-rooted, CAS-free): `setRealMaxExp(100)` leaves
`maxE=9e15`, but a direct `Decimal.set({maxE:100})` makes `1e60×1e60=Infinity`.
The fix (`maxE`/`minE`) is one line each but the boot call flips ±999 overflow
on suite-wide at module load — a real behavior change that needs a deliberate
full-suite + HP50-fidelity run by the RPL lane, and no passing guard can be
added pre-fix without entrenching the bug. Filed as **R-025** in `docs/REVIEW.md`
(open, deferred, owner rpl-programming). No source/test change.
`node tests/test-all.mjs` → 7301 passed / 0 failed (baseline 7301, unchanged).
Next (code-review): standing pattern-1 reconciliation, then re-scan state.js's
remaining header invariants now that the WORDSIZE/REAL_MAX_EXP/ANGLE/COORD
constant families are pinned (R-017/R-021..R-024) and R-025 is filed — the
`_pushCoerce` APPROX-collapse contract referenced in stack.js (R-021) vs the
state.js approx-mode setter is a candidate cross-file invariant. (Inert scratch
probes `_probe_mxe.mjs`/`_probe_mxe2.mjs` at repo root could not be unlinked —
bash sandbox runs as a different uid than the file tools, same constraint as
prior runs; neither is in test-all's FILES list.)

### 2026-06-17 23:05 — unit-tests
Closed the queued special-function Z-arm sweep target: `_argScalar`'s
`isInteger` branch (ARG, `ops.js` ~1492). Unlike the rest of the family it is
not the `isInteger ? Number(v.value)` shape — it is a distinct *sign* arm,
`Real(fromRadians(v.value < 0n ? Math.PI : 0))`, that tests the sign with a
BigInt compare and routes through `fromRadians` for the angle mode. Every prior
ARG scalar pin used a Real (`ARG(5)`/`ARG(-3)`/`ARG(-1)` in test-entry), a
Complex, or a reject type (Rational/BinInt/Unit, session231/258/263), so the
bare-Integer arm had zero coverage — a refactor folding it into the Real branch
(coercing the BigInt first) would pass green. Probed all arms live first
(/tmp, CAS-free, repo-rooted import): `ARG(Integer 5)`→0, `ARG(Integer 0)`→0
(0n<0n false), `ARG(Integer -3)`→π in RAD (== `ARG(Real -3)` bit-for-bit),
`ARG(Integer -1)`→180 in DEG, `ARG(Integer -2)`→200 in GRD. Added a
`session403:` block (+6 pins) in `tests/test-entry.mjs` after the Real-scalar
ARG block. No source change. Updated `docs/TESTS.md` (status/table 7254→7301,
test-entry row +6, advanced the queue, added a coverage note).
`node tests/test-all.mjs` → 7301 passed / 0 failed (baseline 7295). Next: the
bespoke complex-projection helpers `_conjScalar`/`_reScalar`/`_imScalar`
(`ops.js` ~1508/1514/1520) each carry an Integer arm — CONJ/RE identity, IM
returning `Integer(0n)` (an Integer zero, distinct from the Real arm's
`Real(0)`) — check whether any is backed only by Real-operand scalar pins.
(Probe lived in /tmp, not repo root, so no stray scratch file this run.)

### 2026-06-17 22:50 — ui-development
Closed the never-exercised `pageSize` parameter of `computeMenuPage`
(`paging.js` ~40). Every prior pin (the inline computeMenuPage block in
`tests/test-ui.mjs`) used the default pageSize of 6, so the argument — which
drives `totalPages = ceil(len/pageSize)`, the slice start `page*pageSize`, the
view width, and the tail pad — was never positively exercised; a refactor
hardcoding 6 instead of honoring the argument would pass green. (`app.js` ~509
is the only caller and passes 6 explicitly, so the non-default path had zero
coverage.) Probed all arms live first (repo-rooted import, DOM-free): pageSize 3
over 7 slots → 3 pages, page 0 `A..C` / page 1 `D..F` / page 2 `G,null,null`
(short-tail pad to width), page-past-end wraps to 0, `-1` wraps to last; pageSize
1 over 2 slots → 2 pages, width-1 view. Added a `session402:` block (+9 pins) in
`tests/test-ui.mjs` after the default-pageSize computeMenuPage block. No source
change. No ROADMAP edit: ui-development records in the run-log, notes live in the
sources (session319/326/333/354/361/368/374/381/388/395 precedent).
`node tests/test-all.mjs` → 7295 passed / 0 failed (baseline 7286). Next:
paging.js is now fully pinned across both pure helpers and the pageSize arm;
the remaining ui surfaces are DOM/render-bound (the keypad `renderKeyboard`, the
SidePanel render/drag DOM, the command-palette overlay) and need a render
harness. (Inert scratch probe `_probe_page.mjs` could not be unlinked — bash
sandbox denies it, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 22:38 — ai-chatbot
Closed the unpinned newline asymmetry between `parseInlineSpans`' two inline-math
arms (`chat-bot.js` ~380). The `\(…\)` arm matches `[\s\S]+?` (spans newlines)
while the `$…$` arm matches `[^$\n]+?` (single-line only) — session360 pinned each
form standalone but never the cross-form distinction, so a refactor unifying the
two character classes (widening `$…$` to `[\s\S]` or narrowing `\(…\)`) would pass
every prior pin yet silently change which strings math-ify. Probed all arms live
first (repo-rooted import, CAS-free): `\(a\nb\)` → one math span with the newline
body; `$a\nb$` → stays text; `see \(x\) here` → text/math/text; `$a$ $b$` → two
math spans separated by text (non-greedy body). Added a `session401:` block
(+4 pins) in `tests/test-chatbot-parse.mjs` after the session360
parseInlineSpans block. No source change. No docs notes file for this lane
(notes live in the www/src/ai/* sources). `node tests/test-all.mjs` → 7286
passed / 0 failed (baseline 7282). Next: parseInlineSpans is now pinned on the
math-form newline asymmetry + adjacency; the remaining uncovered AI surfaces stay
DOM/stream-bound (the `<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the
display-math split in appendInlineMarkdown, the streamed-bubble assembly in
`_runLoop`). (Inert scratch probe `_probe_spans.mjs` at repo root could not be
unlinked — bash sandbox denies it, same constraint as prior runs; not in
test-all's FILES list.)

### 2026-06-17 22:24 — rpl-programming
Closed the queued START/FOR closer-slot item — but the queued hypothesis (a
spurious REPEAT/UNTIL/THEN in the closer slot is an unpinned *reject* sibling
of the session136 spurious-END) was wrong, and pinning the *actual* behavior
is the contribution. The closer scan is `scanAtDepth0(toks, …, null)`
(`ops.js` ~4215/4252); with `wanted` null it returns ONLY CF_CLOSERS
(END/NEXT/STEP), never a CF_INNER (THEN/ELSE/REPEAT/UNTIL). So a stray inner
in the START/FOR closer slot is skipped by the scan, the closer scan runs off
the end, the loop auto-closes (implicit NEXT), and the inner token is absorbed
into the body where evalRange's orphan-keyword arm (`ops.js` ~3681) skips it
silently — identical to a plain auto-close, NOT a reject. Only END (a
CF_CLOSER) reaches the `START/FOR without NEXT/STEP` throw (session136).
Probed all arms live first (repo-rooted import, CAS-free): `« 0 1 5 START 1 +
<inner> »` → 5 and `« 0 1 4 FOR i i + <inner> »` → 10 (`i` purged) for each of
THEN/ELSE/REPEAT/UNTIL, vs `…START…END`/`…FOR…END` → `START/FOR without
NEXT/STEP`. Added a `session400:` block (+12 pins, two 4-case loops) in
`tests/test-control-flow.mjs` after the session136 FOR spurious-END block. No
source change. Updated the auto-close-policy paragraph in `docs/RPL.md`.
`node tests/test-all.mjs` → 7282 passed / 0 failed (baseline 7270). Next: the
START/FOR closer slot is now fully characterised (CF_CLOSER END rejects,
CF_INNERS absorb-and-auto-close); re-scan the WHILE/DO closer slot for the
mirror — a spurious CF_INNER (THEN/ELSE) in the WHILE REPEAT-slot or DO
UNTIL-slot may likewise absorb rather than reject and is currently unpinned.
(Inert scratch probe `_probe_clos.mjs` at repo root could not be unlinked —
bash sandbox denies it, same constraint as prior runs; not in test-all's
FILES list.)

### 2026-06-17 22:11 — data-types
Closed the SUB BinInt-index coverage hole queued by session392. SUB
(`ops.js` ~6624) feeds both index slots (m, n) through `_toCountN`
(`ops.js` ~6463), which accepts Integer/Real/BinaryInteger — but every prior
SUB pin fed Integer indices, so the BinInt branch was never positively
exercised *from SUB* (only the sibling →LIST count, session077); a refactor
swapping SUB's coercion for an Integer-only helper would pass green. Probed all
arms live first (repo-rooted import, CAS-free): `{1..5} #2h #4h SUB` → {2 3 4},
`"HELLO" #2h #4h SUB` → "ELL", mixed `2 #4h` → {2 3 4}, base-cosmetic `#2b #4b`
→ "ELL", and `#0h #2h` → {1 2} (m clamps low to 1). POS takes no index operand
(its second arg is a needle compared by `_rplEqual`), so it has no count
coercion to widen. Added a `session399:` block (+5 pins) in
`tests/test-lists.mjs` after the SUB OOB-window block. No source change.
Updated `docs/DATA_TYPES.md` (candidates section: SUB DONE, POS noted N/A).
`node tests/test-all.mjs` → 7270 passed / 0 failed (baseline 7265). Next: the
index/count-coercion BinInt accept is now pinned across GET/PUT/GETI
(session392), →LIST (session077), and SUB (session399); re-scan any remaining
sequence/offset helper for a BinInt-accepting coercion still reached only by an
Integer/Real operand, else the lone larger open data-types item remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design). (Inert
scratch probe `probe_sub.mjs` at repo root could not be unlinked — bash sandbox
denies it, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 21:58 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap — sessions
199/200), so continued the rejection-pin sweep and found a clean
sibling/alias asymmetry in the cartesian↔polar family: `C→P` (Unicode) carries
a session055 Vector reject pin, but its sibling `P→C` had none, and the ASCII
aliases `C->P`/`P->C` had happy-path-only coverage (session055). Both
`_cToPOp`/`_pToCOp` (`ops.js` ~13468/13482) accept Complex/Real/Integer and
reject everything else with `Bad argument type`; the ASCII aliases are
registered with the SAME fn instance as their canonicals, so they reject
identically. Probed all four live first (repo-rooted import, CAS-free):
C→P/P→C/C->P/P->C all reject Vector/String/Matrix/List with `Bad argument
type`, and `lookup('C->P').fn === lookup('C→P').fn` /
`lookup('P->C').fn === lookup('P→C').fn`. Added a `session398:` block (+6 pins)
in `tests/test-numerics.mjs` after the session055 C→P Vector-reject block:
shared-fn-instance for both alias pairs, P→C Vector + String reject (the
missing canonical sibling), and C->P/P->C Vector reject. No source change.
Updated the C→P/P→C row in `docs/COMMANDS.md`. `node tests/test-all.mjs` →
7265 passed / 0 failed (baseline 7259). Next: the cartesian↔polar family is now
rejection-symmetric across canonicals and both ASCII aliases; the sibling
`C→R`/`R→C` ASCII aliases (`C->R`/`R->C`) still have happy-path-only coverage
while the Unicode `R→C` carries a session043 String reject — the next likely
alias rejection-pin gap. The lane is otherwise saturated except JORDAN
(Giac-init cap). (Inert scratch probe `probe_cp.mjs` at repo root could not be
unlinked — bash sandbox denies it, same constraint as prior runs; not in
test-all's FILES list.)

### 2026-06-17 21:45 — code-review
Closed the R-023-queued sibling, filed/resolved as R-024: state.js's
`ANGLE_MODES` frozen list + `setAngle`'s normalize/reject/no-op arms — the
R-017 (COORD_MODES/cycleCoordMode) pattern, one mode-list over. `cycleAngle`'s
`RAD→DEG→GRD→RAD` order is pinned in test-numerics, but nothing tied it to the
`ANGLE_MODES` constant, showed the list frozen, or exercised `setAngle`'s
uppercase normalization (`'deg'`→`'DEG'`) and unknown-mode reject — exactly the
arms the sibling `COORD_MODES`/`setCoordMode` got via session349. A refactor
reordering ANGLE_MODES, dropping the freeze, or changing setAngle's
normalize/reject guard would pass green. Probed all arms live first (repo-rooted
import, CAS-free): order `["RAD","DEG","GRD"]`, frozen, `'deg'`→`'DEG'`,
`'BOGUS'`→`Unknown angle mode: BOGUS` leaving `angle` unchanged. Added a
`session397:` block (+5 pins, imported `ANGLE_MODES`) in
`tests/test-numerics.mjs` before the session349 COORD_MODES block. No source
change. Updated `docs/REVIEW.md` (R-024). `node tests/test-all.mjs` → 7259
passed / 0 failed (baseline 7254). Next: state.js's header contracts are now
pinned across ANGLE_MODES + COORD_MODES (cycle order, freeze, normalize,
reject); the remaining unobserved state.js item is the `Decimal.set()`
forwarding inside `setRealMaxExp` (MAX_EXP/MIN_EXP) — no test currently checks
that STMXE propagates the exponent cap into Decimal.js.

### 2026-06-17 21:32 — unit-tests
Closed the TESTS.md-queued next-step: the two-arg `_betaScalar` Integer Z-arm
(`aNum`/`bNum` = `isInteger ? Number(.value) : isReal ? .value.toNumber() :
null`, `ops.js` ~2830) — the same Real-only audit class as Ei/Si/Ci
(session382), erf/erfc (session280), PSI polygamma (session389). Every
session069 finite closed-form pin (Β(3,4)=1/60, Β(1,7)=1/7, Β(½,½)=π) pushes
`Real` operands, so the `isInteger` arm was positively exercised only by the
pole-throw cases (Β(0,3)/Β(-2,3) → Infinite result); a refactor folding the
Integer arm into the Real guard would still pass those (pole throws before
computing) and every Real pin. Probed live first (repo-rooted import, CAS-free):
Β(Integer 3, Integer 4) and both mixed slots = 0.016666… exactly equal to
Β(Real 3, Real 4), and Β(Integer 1, Integer 7)=1/7, each staying `Real`. Added a
`session396:` block (+4 pins) in `tests/test-numerics.mjs` after the session069
Beta String-reject block: Integer×Integer, Integer×Real, Real×Integer all `.eq`
a live Real-operand reference + the 1/7 anchor. No source change. Updated
`docs/TESTS.md` (status/table 7189→7254, test-numerics row +4, advanced the
queue, added a coverage note). `node tests/test-all.mjs` → 7254 passed / 0
failed (baseline 7250). Next: continue the special-function Z-arm sweep — re-scan
the remaining stat-dist `_*Scalar`/`asReal` helpers (UTPC/UTPF/UTPT integer arms
are session068/308; the stat-dist columns are the likely remaining holdouts) for
any `isInteger(v) ? Number(v.value)` arm still backed only by Real-operand pins.
(Inert scratch probe `_probe_beta.mjs` could not be unlinked — bash sandbox
denies it, same constraint as prior runs; not in test-all's FILES list.)

### 2026-06-17 20:40 — ui-development
Closed the `level < 1` arm of the shared bounds guard
(`if (level < 1 || level > depth)`) in `interactive-stack.js`'s three stack
mutators — `rollLevel` (~89), `rollDownToLevel` (~101), `dropLevel` (~117).
Every prior out-of-range pin (session301 + the inline blocks) fed only
`level > depth`, so the LOW arm — reachable when an empty-stack `clampLevel`
returns 0 and that 0 is passed straight to a mutator — was never positively
exercised; a refactor dropping it would let `rollLevel(s, 0)` splice at
`idx = length` (a silent no-op / garbage shift) and still pass green. The throw
message was also unpinned (the existing `assertThrows(…, null, …)` calls accept
any throw). Probed live first (repo-rooted import, CAS-free): level 0 and
negatives reject identically with exactly `Too few arguments` across all three
mutators, on both a populated and an empty (depth-0) stack, and a rejected call
leaves the stack untouched (guard precedes the splice). Added a `session395:`
block (+12 pins, using `assertThrows` with the message) in `tests/test-ui.mjs`
after the emit-once block in the interactive-stack section. No source change. No
ROADMAP edit: ui-development records in the run-log, notes live in the sources
(session319/326/333/354/361/368/374/381/388 precedent). `node tests/test-all.mjs`
→ 7250 passed / 0 failed (baseline 7238). Next: interactive-stack's pure surface
is now fully reject-pinned on both bounds arms + message for all three mutators;
`clampLevel`/`levelUp`/`levelDown` are covered — the remaining ui surfaces are
DOM/render-bound (the keypad `renderKeyboard`, the SidePanel render/drag DOM, the
command-palette overlay that consumes the op-search core) and need a render
harness. (Inert scratch probes `_probe_is.mjs`/`_probe2.mjs`/`_probe_psi.mjs` /
`probe_cat*.mjs` sit at repo root from this and prior runs — bash sandbox denies
unlink; none are in test-all's FILES list.)

### 2026-06-17 20:35 — ai-chatbot
Source fix: closed the prototype-pollution lookup bug in `resolveToolAlias`
(`chat-bot.js` ~710) that session387 flagged but left unpinned. The old
`TOOL_ALIASES[name] ?? name` read through the prototype, so a model emitting
an Object.prototype member as a tool name (`toString`, `constructor`,
`valueOf`, `hasOwnProperty`, `__proto__`, `isPrototypeOf`) resolved to the
inherited function/object — `?? name` never fired (non-nullish) — so dispatch
saw `resolveToolAlias(n) !== n` and mis-routed instead of treating it as an
unknown tool. Probed live first (repo-rooted import, CAS-free): all six
returned `[Function]`/`{}`; after the fix each is a clean string pass-through
while real aliases (`push`→`push_to_stack`) still resolve. Guarded the lookup
with `Object.prototype.hasOwnProperty.call(TOOL_ALIASES, name)` (the codebase
idiom — algebra.js/ops.js use the same `.call` form). Added a `session394:`
block (+14 pins) in `tests/test-chatbot-parse.mjs` after the session387
source-side block: each of the six proto names passes through unchanged and is
a string, plus a real-alias and unknown-name control. `node tests/test-all.mjs`
→ 7238 passed / 0 failed (baseline 7224). Next: the alias map is now safe
against prototype-member tool names on both lookup and (session283/387) map
shape; remaining uncovered AI surfaces stay DOM/stream-bound (the `<ul>`/`<ol>`
grouping in appendInlineMarkdownLines, the display-math split in
appendInlineMarkdown, the streamed-bubble assembly in `_runLoop`).

### 2026-06-17 21:24 — rpl-programming
Closed the WHILE/DO END-slot spurious-STEP coverage asymmetry. Both `runWhile`
(`ops.js` ~4126) and `runDo` (~4167) source comments name a spurious NEXT *or
STEP* in the END slot as a hard error, and the closer scan's `else` arm throws
`WHILE/REPEAT without END` / `DO/UNTIL without END` for any non-END CF_CLOSER —
but session136 pinned only the NEXT arm for each. STEP reaches the same throw via
a distinct `scanAtDepth0` `kind` value (the NEXT-vs-STEP distinction session386
pinned for CASE, one family over). Probed both live first (repo-rooted import,
CAS-free): `« WHILE 1 REPEAT 2 STEP »` → `WHILE/REPEAT without END`,
`« DO 1 UNTIL 1 STEP »` → `DO/UNTIL without END`, each leaving the stack at depth
0 (EVAL's post-pop snapshot). Added a `session393:` block (+6 pins) in
`tests/test-control-flow.mjs` after the session136 DO-spurious-NEXT block. No
source change. Updated the auto-close-policy paragraph in `docs/RPL.md`.
`node tests/test-all.mjs` → 7224 passed / 0 failed (baseline 7218). Next: the
WHILE/DO END-slot reject is now symmetric across both counter-loop closer kinds
(NEXT + STEP); re-scan the START/FOR closer slots — session136 pins only a
spurious END there, so a spurious REPEAT/UNTIL/THEN (other CF_INNERS) in the
START/FOR closer slot may be an unpinned sibling arm.

### 2026-06-17 21:08 — data-types
Closed the never-positively-exercised BinaryInteger arm of `_toIntIdx`
(`ops.js` ~6453) — the 1-based index coercion shared by GET/PUT/GETI on
List/Vector/Matrix/String. The helper accepts Integer/Real/BinaryInteger,
but every prior GET/PUT pin fed an Integer or Real index, so the BinInt
branch (distinct from the Integer and Real arms) was never positively
exercised; only its `n < 1` reject had been reached, indirectly via
session372's →ARRY dim-spec. A refactor folding the BinInt branch into the
Integer guard, or dropping it, would have passed green. Probed all arms live
first (repo-rooted import, CAS-free): `{10 20 30} #2h GET` → Integer(20),
`[1 2 3] #3h GET` → 3, `[[1 2][3 4]] {#2h #1h} GET` → 3 (row 2 col 1),
`"hello" #1h GET` → "h", `{10 20 30} #2h 99 PUT` → {10 99 30},
`[[1 2][3 4]] {#1h #2h} 99 PUT` → [[1 99][3 4]], `{1} #0h GET` → Bad argument
value (the n<1 guard inside the BinInt arm), and `{10 20 30} #2h GETI` →
element 20 + incremented Integer(3) index. Added a `session392:` block
(+8 pins) in `tests/test-lists.mjs` after the PUT-matrix block. No source
change. Recorded the coverage in `docs/DATA_TYPES.md` (candidates section).
`node tests/test-all.mjs` → 7218 passed / 0 failed (baseline 7210). Next: the
index-coercion BinInt accept is now pinned across GET/PUT/GETI (and `_toCountN`
via →LIST, session077); re-scan the SUB/POS slot coercions for any remaining
BinInt-accepting helper still reached only by an Integer/Real operand.

### 2026-06-17 20:54 — command-support
Lane stays saturated (only JORDAN ✗, Giac-init >45s bash cap — sessions
199/200), so continued the alias rejection-pin sweep and found a clean
four-way gap the prior runs missed in the matrix row/col compose-decompose
family: the canonicals `→ROW`/`→COL`/`ROW→`/`COL→` carry session051 reject
pins, but the ASCII aliases `->ROW`/`->COL`/`ROW->`/`COL->` had happy-path-only
coverage. Each alias is registered with the SAME fn instance as its canonical
(`_rowCompose`/`_colCompose`/`_rowDecompose`/`_colDecompose`, `ops.js`
~10611-10669), so it rejects identically. Probed all arms live first
(repo-rooted import, CAS-free): shared-instance `fn ===` for all four pairs;
`->ROW` non-integer count → Bad argument type, count 0 → Bad argument value,
mismatched row lengths → Invalid dimension, non-vector args → Bad argument
type; `->COL` mismatched heights → Invalid dimension; `ROW->` on Vector and
`COL->` on Real → Bad argument type. Added a `session391:` block (+8 pins) in
`tests/test-matrix.mjs` after the session051 `->COL` happy-path block: the
shared-instance identity assertion + the seven mirrored rejects. No source
change — guards a refactor that splits an alias into its own implementation and
drops a guard. Updated the row/col row in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 7210 passed / 0 failed (baseline 7202). Next: the
row/col compose/decompose family is now rejection-symmetric across canonicals
and all four ASCII aliases; the lane is truly saturated except JORDAN (Giac-init
cap) — only the JORDAN multi-run shape-capture effort remains.

### 2026-06-17 20:30 — code-review
Closed the R-022-queued sibling, filed/resolved as R-023: state.js's
`REAL_MAX_EXP_*` bounds + the STMXE/setRealMaxExp reject arms — the WORDSIZE
pattern (R-022) one constant family over. `REAL_MAX_EXP_MAX` had ZERO test
callers (only MIN/DEFAULT imported), session044 pinned only the below-MIN reject
(and only that it threw, not its message), so the constants' values, the
*inclusive* MIN/MAX boundaries (accepted unclamped — STMXE rejects, it does NOT
clamp), the above-MAX reject, the non-integer-Real reject (integrality arm,
distinct from range), the non-numeric `Bad argument type` reject, and
`setRealMaxExp`'s own distinct range-message throw were all unpinned. Probed all
arms live first (repo-rooted import, CAS-free): constants 10/9e15/999, both
boundaries accepted unclamped, MAX+1/MIN-1 → 'Bad argument value', Real 500.5 →
'Bad argument value', String → 'Bad argument type', setRealMaxExp(5)/(500.5) →
'realMaxExp must be an integer in [10, 9000000000000000], got N'. Added a
`session390:` block (+13 pins, imported `REAL_MAX_EXP_MAX`) in
`tests/test-numerics.mjs` after the session044 STMXE reject block. No source
change. Updated `docs/REVIEW.md` (R-023). `node tests/test-all.mjs` → 7202
passed / 0 failed (baseline 7189). Next: state.js's remaining unpinned
header contract is ANGLE_MODES — `cycleAngle` is pinned in test-numerics but the
frozen `ANGLE_MODES` list (`['RAD','DEG','GRD']`, ~:12) and `setAngle`'s
unknown-mode reject have no direct constant/Object.isFrozen pin (the sibling
COORD_MODES got that via R-017/session349); the `Decimal.set()` forwarding inside
setRealMaxExp (MAX_EXP/MIN_EXP) is also still unobserved by any test.

### 2026-06-17 20:13 — unit-tests
Closed the TESTS.md-queued next-step: the PSI polygamma Z column's x-operand
integer arm. The two-arg `PSI` (n-th derivative) routes its `x` through
`_polygammaScalar(n, v)` (`ops.js` ~2595), whose `isInteger(v) ? Number(v.value)
: isReal(v) ? v.value.toNumber() : null` coercion is the same Real-only gap class
as Ei/Si/Ci (session382), erf/erfc (session280), MANT (session285), LAMBERT
(session296). Every session081 two-arg pin pushed a `Real` x, so the `isInteger`
arm was never positively exercised — only the 1-arg String reject touched a
non-Real type. Probed live first (repo-rooted import, CAS-free): a bare-`Integer`
x yields the Real-x result bit-for-bit at every order (ψ_1(1)/ψ_2(1)/ψ_1(2)/
ψ_1(5) and the n=0 digamma collapse ψ_0(1)) and stays `Real`. Added a
`session389:` block (+12 pins) in `tests/test-numerics.mjs` after the session081
two-arg PSI blocks: per-pair `isReal` + Integer==Real parity, plus closed-form
anchors on ψ_1(1)=π²/6 and ψ_0(1)=-γ. No source change. Updated `docs/TESTS.md`
(status/table 7082→7189, test-numerics row +12, synced drifted rows, advanced the
queue, added a coverage note). `node tests/test-all.mjs` → 7189 passed / 0 failed
(baseline 7177). Next: continue the special-function Z-arm sweep — re-scan the
remaining `_*Scalar` helpers across the special-function and stat-dist columns
for any `isInteger(v)` arm still backed only by Real-operand pins; the digamma
1-arg `_psiScalar` already has a bare-Integer pin via session081 `PSI(Integer(5))`.

### 2026-06-17 20:08 — ui-development
Tied the side-panel command catalog to the live registry. `_renderCommands`
(`side-panel.js` ~767) classifies every `CATEGORIES` entry into a registered-op
button (`registered.has(name.toUpperCase())`), a unit-insert button
(`UNIT_CATALOG.has(name)`), or — neither — a greyed `sp-cmd-stub` "not yet
implemented" button. The session347 catalog pins only spot-check the shape and
two anchors (Stack/DUP, Arithmetic/+), so a renamed/removed op or a typo in
CATEGORIES would silently degrade to a dead stub button with nothing catching
it. Probed live first (repo-rooted import, CAS-free): the 467 entries resolve to
428 ops + 39 units + 0 stubs, and every unit-only entry sits in the 'Units'
category. Added a `session388:` block (+4 pins, imported `allOps`/`UNIT_CATALOG`)
in `tests/test-ui.mjs` after the CATEGORIES anchors block: zero dead stubs (with
the offending names in the message), op-backed entries dominate (>400), unit
entries present, and unit-insert buttons confined to the Units category. No
source change — guards a refactor or rename that strands a catalog button. No
ROADMAP edit: ui-development records in the run-log, notes live in the sources
(session319/326/333/354/361/368/374/381 precedent). `node tests/test-all.mjs` →
7177 passed / 0 failed (baseline 7173). Next: the catalog is now drift-guarded
against the registry; CHAR_GROUPS' `insert` strings are checked for shape but not
that each is a real insertable char/op, and the SidePanel render/drag DOM
(`_renderCommands`, `_dropTargetAt` wiring) remains DOM-bound and needs a render
harness.

### 2026-06-17 20:04 — ai-chatbot
Closed the source-side fidelity gap in the `resolveToolAlias` / `TOOL_ALIASES`
contract. session283 guards the alias map only from the TARGET side (every
value is a canonical tool, no value is also a key → single-hop), and the
existing resolveToolAlias pins spot-check just two keys (`add_to_stack`,
`execute`) plus the three the prompt advertises (`recall`/`show_stack`/
`add_to_stack`) — so a refactor of resolveToolAlias' lookup (or a stale copy
of the map) that returned the wrong-but-still-canonical target, or stopped
rewriting some keys, would pass session283 and every prior pin. Probed live
first (repo-rooted import, CAS-free): all 30 keys satisfy
`resolveToolAlias(key) === TOOL_ALIASES[key]` AND `!== key`; an unknown name
passes through. Added a `session387:` block (+61 assertions: a `>=30` floor +
the two assertions per key) in `tests/test-chatbot-parse.mjs` after the
already-canonical pass-through block. No source change — guards a refactor that
breaks the per-key rewrite while keeping targets canonical. No docs notes file
for this lane (notes live in the www/src/ai/* sources). `node tests/test-all.mjs`
→ 7173 passed / 0 failed (baseline 7112). Next: the alias map is now pinned on
both sides (target-canonical/single-hop + per-key rewrite fidelity). Flagged
finding worth a source fix, not pinned: `resolveToolAlias('toString')` (and
other Object.prototype names) returns the inherited function, since
`TOOL_ALIASES[name]` reads through the prototype before `?? name` — a model
emitting such a name would mis-route; an `Object.hasOwn` guard or null-proto map
would close it. Remaining uncovered AI surfaces stay DOM/stream-bound (the
`<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the display-math split in
appendInlineMarkdown, the streamed-bubble assembly in `_runLoop`).

### 2026-06-17 19:59 — rpl-programming
Closed the never-exercised `CASE: unexpected <kind>` reject arm in `runCase`
(`ops.js` ~3838). The clause scan `scanAtDepth0(toks, i, {THEN})` only ever
returns a wanted `THEN` or a `CF_CLOSER` (`END`/`NEXT`/`STEP`); the THEN and
END branches are handled just above, so the `scan.kind !== 'THEN'` throw is
reached exactly by a depth-0 counter-loop closer (`NEXT`/`STEP`) sitting where
a clause test/THEN belongs. Every prior CASE pin (session067/073/317) fed only
THEN/END/auto-close forms, so this arm had zero coverage — a refactor swallowing
a stray counter closer or replacing the throw with a no-op would pass green.
Probed all three live first (repo-rooted import, CAS-free): `« CASE 1 NEXT »` →
`CASE: unexpected NEXT`, `« CASE 1 STEP »` → `CASE: unexpected STEP`, and
`« CASE 0 THEN 2 END 0 NEXT »` → `CASE: unexpected NEXT` reached on a *later*
clause iteration (false first test advances `i` past the inner END); each rolls
the stack back clean via EVAL's post-pop snapshot. Added a `session386:` block
(+7 assertions) in `tests/test-control-flow.mjs` after the session317 CASE
auto-close block. No source change. Updated the CASE note in `docs/RPL.md`.
`node tests/test-all.mjs` → 7112 passed / 0 failed (baseline 7105). Next: CASE's
clause-dispatch reject tail is now pinned alongside the auto-close/default arms;
the lone larger open items remain halted-stack persistence across `persist.js`
(generators aren't JSON-serialisable — token/IP capture design) and the Grob
NEWOB identity fall-through (blocked until a Grob value is constructible
CAS-free).

### 2026-06-17 20:48 — data-types
Closed the never-exercised positive `isBinaryInteger`-accept arm of HEAVISIDE
and DIRAC. Both scalar handlers (`ops.js` ~16365 / ~16389) carry an explicit
`isBinaryInteger` branch — the source comment states "BinaryInteger is accepted
the same as Integer" — but every prior pin (session267/268/281) only ever
reached the FINAL throw with Complex / String, documenting the arm in test
comments while never exercising the accept path; a refactor folding the BinInt
branch into the Integer guard, or dropping it, would have passed green. The
special-function family table has no B column, so this was a pure
coverage-asymmetry hole. Probed all arms live first (repo-rooted import,
CAS-free): `#5h`/`#0h HEAVISIDE` → `Integer(1)` (B is non-negative, so the step
is always 1, right-continuous at 0); `#5h DIRAC` → `Integer(0)` and `#3b DIRAC`
→ `Integer(0)` (base cosmetic), while `#0h DIRAC` → `Symbolic DIRAC(0)` (the
at-origin spike, mirroring the Integer(0) arm). Added a `session385:` block
(+5 pins) in `tests/test-types.mjs` after the session281 String-reject block.
No source change. Updated the HEAVISIDE/DIRAC rows in `docs/DATA_TYPES.md`.
`node tests/test-all.mjs` → 7105 passed / 0 failed (baseline 7100). Next: the
lone larger open data-types item remains Unit dim-equivalence `==` (UEQUAL /
flag flip, AUR §20, multi-run design); a smaller follow-on is auditing the
remaining stat-dist / special-function ops whose scalar arm lists
`isBinaryInteger` (ZETA/LAMBERT/PSI/GAMMA use `isInteger?…:isReal?…:null` and do
NOT accept B, but HEAVISIDE/DIRAC's sibling step/impulse contract is now pinned)
for any other unexercised positive B-accept arm.

### 2026-06-17 20:33 — command-support
Lane stays saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap —
sessions 199/200), so continued the rejection-pin sweep and found a clean
sibling asymmetry the prior runs missed in the vector-compose family: `→V2`'s
underflow is pinned (`test-reflection.mjs` ~1033, 1 arg → Too few arguments) but
`→V3`'s was not — only its positive compose + ASCII-alias equivalence. `→V3`
runs `popN(3)`, so 2 or 1 operands must trip the same underflow guard, and
`->V3` shares the `_toV3Op` fn instance so it rejects identically. Probed all
arms live first (repo-rooted import, CAS-free): `→V3`/`->V3` with 2 → Too few
arguments, `→V3` with 1 → Too few arguments, `→V2` with 0 → Too few arguments.
Added a `session384:` block (+4 pins) in `tests/test-reflection.mjs` after the
`->V3` alias block: `→V3` 2-arg and 1-arg underflow, `->V3` alias underflow, and
the `→V2` 0-arg boundary that completes the pair. No source change — guards a
refactor that drops `→V3`'s arity check or special-cases the alias. Updated the
vector-compose row in `docs/COMMANDS.md`. `node tests/test-all.mjs` → 7100
passed / 0 failed (baseline 7096). Next: the vector-compose underflow is now
symmetric across `→V2`/`→V3` and both aliases; the lane is truly saturated
except JORDAN (Giac-init cap) — `→V2`/`→V3` accept any object as elements with
no numeric gate (an unpinned but possibly-intentional contract worth a behavior
check against AUR before pinning), else only the JORDAN multi-run effort remains.

### 2026-06-17 19:46 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, COMMANDS.md ✓:449 — unchanged. Then closed the
session-`R-021`-queued target, filed/resolved as R-022: state.js's
`WORDSIZE_MIN`/`WORDSIZE_MAX`/`WORDSIZE_DEFAULT` (1/64/64) had ZERO test callers,
and the STWS clamp was pinned only with literals (`STWS 100`→64, `STWS 0`→1) in
`tests/test-binary-int.mjs` — so nothing tied the clamp to the constants, the
MIN/MAX boundaries were never shown inclusive (accepted unclamped), and STWS's
Integer/BinInt accept arms (only Real exercised), the non-numeric reject, and
`setWordsize`'s non-finite throw were all unpinned. Probed all arms live first
(repo-rooted, CAS-free): constants 1/64/64, both boundaries accepted unclamped,
MAX+1/MIN-1 clamp back to the constant, Integer(24)/BinInt(8h) accept,
String→'Bad argument type', `setWordsize(NaN)`→'STWS needs a number'. Added a
`session383:` block (+14 pins) in `tests/test-binary-int.mjs` after the STWS
clamp block, importing the three constants. No source change. Updated
`docs/REVIEW.md` (R-022). Note: a stray `_probe2.mjs` at repo root (scratch from
this run's live probe) could not be removed — the bash sandbox owns it under a
prior session user and denies unlink (same constraint as the pre-existing
`tests/_probe.mjs`); it is not in the `test-all.mjs` FILES list, so inert.
`node tests/test-all.mjs` → 7096 passed / 0 failed (baseline 7082). Next: the
WORDSIZE bounds + STWS coercion are now fully pinned; state.js's remaining
unpinned header contracts are the `REAL_MAX_EXP_*` constants (default 999, floor
10, Decimal.js cap 9e15) vs the STMXE clamp and the `Decimal.set()` forwarding —
the next extract-and-pin/coverage-asymmetry candidate, and ANGLE_MODES order
(cycleAngle is pinned in test-numerics but the frozen ANGLE_MODES list itself
has no direct constant pin).

### 2026-06-17 19:42 — unit-tests
Closed the Ei / Si / Ci Z-column gap — the integral-function trio's
`isInteger(v) ? Number(v.value)` coercion arm (`_eiScalar`/`_siScalar`/
`_ciScalar`, `ops.js` ~14561/14569/14577), the same Real-only audit class as
erf/erfc (session280), MANT (session285), and LAMBERT (session296). Every
session109 positive pin pushed a `Real`, so the integer arm — distinct from
the `isReal(v) ? v.value.toNumber()` arm — was never positively exercised;
only the String reject touched a non-Real type. Probed all seven live first
(repo-rooted import, CAS-free): bare `Integer` operands match the Real-operand
result bit-for-bit and return `Real` (`Ei(Integer 1/5/-1)`, `Si(Integer 1/-5)`,
`Ci(Integer 1/4)`, incl. the negative-integer E1 branch and Si odd-parity CF
branch). Added a `session382:` block (+7 pins) in `tests/test-numerics.mjs`
after the session109 Ci RList block. No source change — guards a refactor
degrading the Z column there to Real-only. Updated `docs/TESTS.md`
(status/table 7042→7082, test-numerics row +7, advanced the queue, added a
coverage note). `node tests/test-all.mjs` → 7082 passed / 0 failed (baseline
7075). Next: continue the special-function Z-arm sweep — `_polygammaScalar`
(the n-th-derivative PSI form, ops.js ~2595) takes the same `isInteger`
coercion on its `v` operand and is the next likely Real-only holdout.

### 2026-06-17 19:40 — ui-development
Closed the two never-exercised arms of `Entry.toggleSign` (`entry.js` ~472).
The session-`mk` block and session374 only ever fed SINGLE-token buffers with a
leading `-` or no sign, so two source paths had zero coverage: (1) the
current-token isolation — the walk-back loop stops at whitespace, so CHS must
flip only the token under the cursor in a multi-token buffer and leave an
earlier token untouched; (2) the leading-`+` mantissa flip (`t[startTok] ===
'+'` → replace with `-`, length unchanged), reachable via a typed `+5`. Probed
all arms live first (CAS-free, importing entry.js+stack.js): `3 1.5`→`3 -1.5`
(cur 6) and round-trip back, `3 1E7`→`3 1E-7`, `3 1E-7`→`3 1E7`, `3 1E+7`→`3
1E-7` (all flip only the current token's exponent), and `+5`→`-5` (cur 2,
length unchanged). Added a `session381:` block (+6 pins) in
`tests/test-entry.mjs` after the session-`mk` toggleSign exponent block. No
source change — guards a refactor that drops the whitespace-stopping walk-back
or the leading-`+` arm. No ROADMAP edit: entry-line editing has no dedicated
§5/§6 bullet, so adding one would be drift (session319/326/333/354/361/368/374
precedent). `node tests/test-all.mjs` → 7075 passed / 0 failed (baseline 7069).
Next: `toggleSign` is now pinned across single- and multi-token buffers and all
three mantissa-sign arms (`-`/`+`/none); Entry's remaining pure surface is the
token-scan corner cases shared by `eex`/`toggleSign` (cursor mid-token), while
`type`, `enter`, `execOp`, and `_emit`/`focus` stay stack/DOM-bound.

### 2026-06-17 19:34 — ai-chatbot
Closed the whitespace-tolerance gap in `findMachineSectionStart` (`chat-bot.js`
~542) — the streaming hide-detector that finds the first JSON tool-call anchor
(`/\{\s*"name"\s*:/`) or `SUGGEST:` marker (`/\bSUGGEST\s*:/i`). Every prior pin
(session325/306) fed only the tight `{"name":` / `SUGGEST:` forms, but real
streamed/pretty-printed JSON carries spaces and newlines, so the `\s*` arms, the
SUGGEST `\b` word boundary, and the name-must-be-first-key constraint were the
live paths with no coverage. Probed all arms live first (CAS-free, importing
chat-bot.js): pretty-printed `{\n  "name" : "x"}` and tab-laden anchors match at
the brace; `{"id":1, "name":"x"}` → -1 (the `\s*`-only gap means `"name"` must
sit immediately after `{`); `SUGGEST :` (space before colon) matches; `NOSUGGEST:`
→ -1 (the `\b` blocks a substring match) while `.SUGGEST:` matches; a
whitespace-laden JSON anchor still wins the `Math.min` over a later tight SUGGEST.
Added a `session380:` block (+7 pins) in `tests/test-chatbot-parse.mjs` after the
session325 findMachineSectionStart ordering block. No source change — guards a
refactor that tightens either regex or drops the `\b`/first-key constraint and
would then miss a real machine section mid-stream. No docs notes file for this
lane (notes live in the www/src/ai/* sources). `node tests/test-all.mjs` → 7069
passed / 0 failed (baseline 7062). Next: `findMachineSectionStart` is now pinned
on both the tight and whitespace-tolerant anchor forms plus the SUGGEST boundary;
the remaining uncovered AI surfaces stay DOM/stream-bound (the `<ul>`/`<ol>`
grouping in appendInlineMarkdownLines, the display-math split in
appendInlineMarkdown, and the streamed-bubble assembly in `_runLoop`) and need a
DOM or fetch harness.

### 2026-06-17 19:30 — rpl-programming
Closed the algebraic-body PARTIAL-reduction gap in `runArrow`'s Symbolic arm
(`ops.js` ~3530). session068/116 pinned only the fully-reducing case (every
name in the body a bound local → folds to a Real); the documented "possibly
partially reduced value" — a free name with no local AND no global binding
stays in the AST while bound locals substitute — had no pin. Probed live first
(outputs scratch, both approx modes — shape stable): `5 → a 'a+b'` → Symbolic
with `a`→5 substituted and unbound `b` the lone surviving free var; `2 → a
'b-a'` → same in the other operand slot; `« 10 'b' STO 5 → a 'a+b' »` → Real
15 (local a=5, global b=10 via varRecall). Added a `session379:` block (+7
pins, with a small `collectSymLeaves` AST walker) in
`tests/test-control-flow.mjs` after the session068 algebraic-body block —
pinning the full lookup precedence (local frame → global `varRecall` → name
stays symbolic) from the partial-reduction direction. No source change.
Updated the Compiled-local-environments section in `docs/RPL.md`.
`node tests/test-all.mjs` → 7062 passed / 0 failed (baseline 7055). Next: the
arrow form's algebraic body is now pinned on both the full-fold and
partial-reduction paths; the lone larger open item remains halted-stack
persistence across `persist.js` (generators aren't JSON-serialisable —
token/IP capture design), and the Grob NEWOB identity fall-through stays
blocked until a Grob value is constructible CAS-free.

### 2026-06-17 20:14 — data-types
Closed the UTPF middle-operand (ν₂ / d) slot V/M/L rejection gap. UTPF is
arity-3 — `UTPF(ν₁, ν₂, x)`, bare handler `register('UTPF', ...)` at `ops.js`
~2897 — and `asReal` (~2900) runs on `n` then `d` then `F` before any value
gate, so a List/Vector/Matrix in any slot throws 'Bad argument type'. session310
pinned only the first (ν₁) and third (variate F) slots; the MIDDLE d slot was
never pinned, even though a valid Integer ν₁ reaches the distinct `asReal(d)`
reject. Probed all three live first (`/tmp`, CAS-free: d=List/Vector/Matrix with
valid Integer n=5, F=3 → all 'Bad argument type'), then added a `session378:`
block (+3 pins) in `tests/test-numerics.mjs` after the session310 UTPF block.
No source change — guards a refactor that special-cases the d slot or adds
`_withListBinary` to UTPF. Updated the UTPF row in `docs/DATA_TYPES.md`.
`node tests/test-all.mjs` → 7055 passed / 0 failed (baseline 7052). Next: UTPF's
L/V/M rejection is now pinned across all three operand slots; the lone larger
open data-types item remains Unit dim-equivalence `==` (UEQUAL / flag flip,
AUR §20, multi-run design).

### 2026-06-17 19:51 — command-support
Re-confirmed the JORDAN blocker first (sessions 199/200): the Giac WASM still
loads under Node from `www/src/vendor/giac/` but `onRuntimeInitialized` does not
fire inside the 43–44 s `timeout` budget (probe exits 124 with only
`required`/`start` logged; with no keepalive node drains the loop and exits 0
before init). Background warm-up across bash calls re-tested and still does NOT
survive (a `nohup` write 8 s out never appeared in the next call) — so the
single-call constraint stands and JORDAN shape-capture remains environment-
blocked. Pivoted to the lane's standing alias rejection-pin work and found a
real ✓-criterion gap the prior sweeps missed in the fold/diff family: `ΣLIST`
and `ΔLIST` own a non-list reject pin but `ΠLIST` never had one, and the ASCII
aliases `SLIST` / `PLIST` / `DLIST` had positive coverage only. `SLIST`/`PLIST`
are independent `_foldListOp` closures (distinct fn instances) and `DLIST` is a
`(s) => OPS.get('ΔLIST').fn(s)` wrapper, so each carries its own `!isList` guard.
Probed the guard live (all reject a non-List operand with `Bad argument type`),
then added a `session377:` block (+5 pins) in `tests/test-lists.mjs` after the
DLIST positive block: ΠLIST/SLIST/PLIST/DLIST non-list rejects + a distinct-fn-
instance assertion. No source change. Updated the Lists row in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 7052 passed / 0 failed (baseline 7047). Next: the
fold/diff family is now fully rejection-pinned; the lane is saturated except
JORDAN (Giac-init cap, sessions 199/200) — re-audit the remaining shared-factory
ops for any ΠLIST-style canonical that lacks its own reject pin, else the lane
truly has only the JORDAN multi-run effort left.

### 2026-06-17 19:36 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged. Then closed the session369-queued target (stack.js's file-header
description), filed/resolved as R-021: the header documents the push-time
coercion contract — `push` runs the installed `_pushCoerce` hook (APPROX
collapses Integer/Rational/Symbolic to Real on entry), while `pushMany` and the
internal stack ops (DUP/ROT/OVER) BYPASS it, and "EXACT mode makes this a true
no-op" — but `setPushCoerce` had ZERO test callers anywhere in the suite, so a
refactor routing pushMany through the hook, dropping it from push, or removing
the non-function reset guard would pass green. Probed all five arms live first
(`/tmp`, importing ops.js so the real hook is installed): EXACT no-op,
push-applies-sentinel, pushMany-bypasses, dup-bypasses, non-fn-resets. Added a
`session376:` block (+5 pins, imported `setPushCoerce`) at the end of
`tests/test-stack-ops.mjs`: installs a sentinel-returning probe to make the
bypass observable, then resets to identity (= EXACT default, the suite's
baseline) as the restore so the module-global hook doesn't leak into the four
later-running files (verified still green). No source change. Updated
`docs/REVIEW.md` (R-021). `node tests/test-all.mjs` → 7047 passed / 0 failed
(baseline 7042). Next: state.js's file-header still documents the WORDSIZE_*
(1/64/64) and REAL_MAX_EXP_* constants and the ANGLE_MODES/COORD_MODES cycle —
the WORDSIZE constants and ANGLE_MODES have zero test callers (COORD_MODES +
cycleCoordMode were pinned by R-017/session349), so the WORDSIZE bounds vs the
STWS clamp are the next extract-and-pin/coverage-asymmetry candidate.

### 2026-06-17 19:21 — unit-tests
Closed the TESTS.md-queued next-step: the `==`/`SAME` List/Vector/Matrix
structural branches of `eqValues` (`ops.js` ~4990, recurse via `_eqArr`) — the
same gap session362 (Unit) and session363 (Tagged) closed, one collection over.
The session072 collection pins are almost all `==`: the lone List SAME never
asserts distinct allocations, Vector had no SAME pin at all, and Matrix had only
a negative cell-mismatch SAME — so a refactor extending "SAME = reference
identity" to collections, dropping the `_eqArr` recursion, or letting the outer
`_binIntCrossNormalize` widening leak inside a collection would pass green.
Probed all arms live first (`/tmp`, CAS-free): List/Vector/Matrix distinct-alloc
SAME→1 (each `!==`), nested-List recursion→1, order-sensitive Vector→0, and the
collection BinInt no-coercion contrast `{#16}` vs `{16}`→0 under both SAME and
`==`. Added a `session375:` block (+10 pins) in `tests/test-comparisons.mjs`
after the session363 Tagged block. No source change. Updated `docs/TESTS.md`
(status/table 6998→7042, comparisons row +10, synced drifted rows, advanced the
queue, added a coverage note). `node tests/test-all.mjs` → 7042 passed / 0
failed (baseline 7032). Next: the value-equality `SAME` audit is now complete
across every structural type (Unit/Tagged/List/Vector/Matrix/Program/Symbolic) —
re-enumerate a fresh batch of DATA_TYPES `✓` cells whose result-determining
coercion arm is reached only by a sibling type (the special-function and
stat-dist columns are the likely remaining holdouts).

### 2026-06-17 19:06 — ui-development
First test coverage of `Entry`'s pure cursor/buffer movement helpers in
`www/src/ui/entry.js` — the candidate the session368 keyboard run flagged.
`cursorUp`/`cursorDown` (multi-line same-column-with-clamp arithmetic, ~415/
~430), `cursorHome`/`cursorEnd` (~399/~403), and `eex` (~538) had ZERO test
callers anywhere in the suite, so a refactor of the column math or eex's
token exponent-scan would pass green. These are fully DOM-free (construct
`new Entry(new Stack())`, set `buffer`/`cursor`, call, read `cursor`/`buffer`).
Probed all arms live first (`/tmp`, no DOM): cursorUp column-preserve onto
prev line / clamp to shorter prev / line-0 no-op; cursorDown clamp to shorter
next / preserve / last-line no-op; home/end incl. already-at-boundary no-op;
eex empty→`1E`, append `E` to current token only, and the no-op when the token
already carries `E` or lowercase `e`. Added a `session374:` block (+14 pins,
imported `Entry` dynamically like the toggleSign block) before the cleanup at
the end of `tests/test-entry.mjs`. No source change — these guard the cursor
arithmetic and eex scan as-is. No ROADMAP edit: entry-line editing has no
dedicated §5/§6 bullet, so adding one would be drift (session319/326/333/354/
361/368 precedent). `node tests/test-all.mjs` → 7032 passed / 0 failed
(baseline 7018). Note: a stale `tests/_probe.mjs` (untracked scratch with a
dead mount path from an earlier session) is still in the tree — not picked up
by test-all; left in place per the no-discard rule. Next: Entry's remaining
pure surfaces are `toggleSign` (exponent vs mantissa flip — partially pinned
via the session-`mk` block) and the token-scan in `eex`/`toggleSign`; the rest
of entry.js (`type`, `enter`, `execOp`, `_emit`/`focus`) is stack/DOM-bound.

### 2026-06-17 18:30 — ai-chatbot
Closed an unpinned arm of `takeSSEFrames` (`remote-llm.js` ~53): the space
after `data:` is optional per the SSE spec and the code handles both forms
via `.slice(5).trim()`, but the session294 sweep only ever fed the spaced
`data: ` form (built by the `frame` helper), so a refactor to `.slice(6)`
assuming a leading space would drop every no-space frame and still pass green.
Probed all four arms live first (no fetch, pure): `data:{...}`→frame extracted,
`data:    {...}`→multi-space trimmed, `data:[DONE]`→sentinel skipped, and
`data:   ` (whitespace-only payload)→emits an empty-string `''` frame (passes
the `startsWith('data:')` gate, trims to `''`, not `[DONE]`). Added a
`session373:` block (+4 pins) in `tests/test-remote-llm.mjs` after the
session294 degenerate-inputs block. No source change. No docs notes file for
this lane (notes live in the www/src/ai/* sources). `node tests/test-all.mjs`
→ 7018 passed / 0 failed (baseline 7014). Next: `takeSSEFrames` is now pinned
on both the spaced and no-space `data:` forms plus the [DONE]/blank/comment/CRLF
skips; the remaining uncovered AI surfaces are genuinely DOM/stream-bound (the
`<ul>`/`<ol>` grouping in appendInlineMarkdownLines, the display-math split in
appendInlineMarkdown, the streamed-bubble assembly in `_runLoop`, and the
RemoteLLM `load()`/`generate()` fetch+SSE I/O loops) and need a DOM or `fetch`
harness.

### 2026-06-17 20:01 — rpl-programming
Closed the unpinned reject arms of `→ARRY`'s `_toDimSpec` / `_toIntIdx`
size-spec path (`ops.js` ~7102). The session077/existing pins covered only the
String dim-spec (outer `Bad argument type`) and the 3-element `length > 2`
list arm (`Bad argument value`), leaving the complementary `_toDimSpec` arms
untested: the empty-list `length < 1` boundary, and the per-item `_toIntIdx`
rejections reached *inside* the list map (non-integer Real, String, negative)
— distinct from the bare-count path and the outer whole-List type guard. The
2-D matrix branch's `popN(m*n)` underflow had no →ARRY pin either. Probed all
six live first (outputs scratch, CAS-free): `{}`→value, `{2.5}`→value,
`{"x"}`→type, `{-1}`→value, `{2 3}` with 2 elems→Too few arguments. Added a
`session372:` block (+5 pins) in `tests/test-reflection.mjs` after the existing
3-element-list reject. No source change — guards a refactor that narrows the
size-list length check or routes list items past `_toIntIdx`. Updated the
`→ARRY` note in `docs/RPL.md`. `node tests/test-all.mjs` → 7014 passed / 0
failed (baseline 7009). Next: `→ARRY`'s dim-spec is now fully reject-pinned on
both length boundaries, all three per-item `_toIntIdx` arms, and the matrix
underflow; the lone larger open items remain halted-stack persistence across
`persist.js` (generators aren't JSON-serialisable — token/IP capture design)
and the Grob NEWOB fall-through (blocked, no CAS-free Grob constructor).

### 2026-06-17 19:46 — data-types
Closed the XROOT V/M operand-position asymmetry — the same symmetric-slot gap
session365 (MOD), session358 (percent), session351 (TRUNC), session337 (GCD/LCM),
session330 (combinatorial), and session323 (BETA) closed one family over.
session304 pinned only the RADICAND slot (level 2): a Vector/Matrix `y` routes
through `^` and rejects there ('Bad argument type' / 'Bad argument value' /
'Invalid dimension'). The DEGREE slot (level 1, the `x` in `y x XROOT`) is a
distinct path — `x` is coerced via `toRealOrThrow` (`ops.js` ~1319) BEFORE the
`^` delegation, so a V/M degree never reaches `^`; it trips 'expected real, got
vector/matrix'. That's the same slot where Complex (session267) and String
(session269) already reject, but V/M there were unpinned. Probed all three live
first (CAS-free, outputs scratch): `Integer(8) V[2,3]`/`… M` and `Real(8) V[2,3]`
in the degree slot → all 'Bad argument type: expected real, got vector/matrix'.
Added a `session371:` block (+3 pins) in `tests/test-types.mjs` after the
session304 XROOT radicand block. No source change — guards a refactor that drops
the degree-slot `toRealOrThrow` coercion. Updated the XROOT row in
`docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 7009 passed / 0 failed
(baseline 7006). Next: the lone larger open data-types item remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design); the binary
V/M symmetric-slot rejection sweep is now complete across MOD/MIN/MAX, GCD/LCM,
percent, TRUNC, COMB-family, BETA-family, and XROOT (both radicand and degree).

### 2026-06-17 19:31 — command-support
Lane stays saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap),
so continued the thin-wrapper arrow-alias rejection-pin sweep (sessions 200/201/
202/203/204/329/336/343/350/357/364).  Closed the last two un-swept delegating
arrow aliases the session364 run queued: `->PRG` (`ops.js:7010` =
`(s) => OPS.get('→PRG').fn(s)`) and `->NUM` (`ops.js:4895` =
`OPS.get('→NUM').fn(s, entry)`) — both distinct fn references (confirmed live
`fn !== canonical`), not shared, so an inline reimplementation could drop a
guard.  session067 / session200 pinned only their happy paths (in test-reflection
/ test-algebra); neither had a rejection pin under its own name.  Probed all
arms live first (CAS-free, node stdin): `->PRG` neg/frac count → `Bad argument
value`, String count → `Bad argument type`, count>depth → `Too few arguments`,
valid count → 2-token Program; `->NUM` empty stack → `Too few arguments`.  Added
a `session370:` block (+8 pins) in `tests/test-arrow-aliases.mjs` after the
session350 block: `->PRG` four rejects + positive pass-through + delegation-shape
assertion, `->NUM` underflow reject + delegation-shape assertion.  Caught one
self-inflicted slip — pinned `.items.length` on the Program result, but Program
stores `tokens`; fixed to `.tokens.length` after the import-error surfaced.  No
source change.  Updated the `→PRG` and `→NUM` rows in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 7006 passed / 0 failed (baseline 6998).  Next: the
delegating arrow-alias sweep is now complete (R→D/D→R/R→B/B→R, →LIST, →STR,
→V2/→V3, V→, →Q/→Qπ/Q→, →HMS/HMS→, →TAG, →UNIT, ->NUM, ->PRG, FACT/`!` all
rejection-pinned); the lone larger command-support item remains JORDAN, blocked
on the Giac-init cap (sessions 199/200) — needs a host where Giac init fits the
45 s bash budget to capture the eigenvects / Jordan-chain output shapes.

### 2026-06-17 19:16 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged. Then closed the run-log-queued next target (persist.js's `__t`
encoding-rules header block, "clean but unguarded"), filed/resolved as R-020:
the file-header "Encoding rules" comment documents the on-disk wire shape both
the localStorage autosave and `.json` export round-trip through — the `__t`
tag strings (`bigint`/`decimal`/`map`) and the Directory shape
(`type:'directory'`, name, entries, parent dropped) — but nothing tied the
documented tags to what `encode()` actually emits, so a renamed tag (or a
header gone stale after a new encoded type) would drift silently and corrupt
every previously-saved snapshot on decode. Probed all arms live first
(`encodeValue` on a bigint/Decimal/Map + a Directory): emitted tag set ==
documented tag set == {bigint,decimal,map}, Directory shape matches. Added a
`session369:` block (+17 pins, imported `encodeValue`/`Decimal`/`readFileSync`)
at the end of `tests/test-persist.mjs`: derives the emitted set live and the
documented set from the header text, asserts equality both directions (+`>= 3`
floor + the three tags by name), and pins the Directory wire shape on both
sides. No source change. Updated `docs/REVIEW.md` (R-020). Note: caught the
header-slice anchor matching the word "import" inside the "Export/import to a
.json file" comment line — switched to `/^import /m`. `tests/test-persist.mjs`
is a standalone file (own counter + `process.exit`, deliberately not in the
`test-all.mjs` aggregate), so it runs separately: `node tests/test-persist.mjs`
→ all passed (66→83, +17); `node tests/test-all.mjs` → 6998 passed / 0 failed
(unchanged, as expected). Next: persist.js's encoding-rules block is now fully
drift-guarded on both tags and Directory shape; remaining unguarded
source-header contracts worth a drift check are `stack.js`'s and `state.js`'s
file-header descriptions, and the `O-013` `RPL_CATALOG` sweep stays evergreen.

### 2026-06-17 19:01 — unit-tests
Closed the TESTS.md-queued next-step: the `==`/`SAME` Tagged branch of `eqValues`
(`ops.js` ~5000, `a.tag === b.tag && eqValues(a.value, b.value)`) — the same gap
session362 closed for Units, one type over. The session072 Tagged pins exercise
this branch via `==` (and one SAME tag+value-match), but SAME's distinguishing
contract on a Tagged was unpinned: that it is *structural* (distinct allocations
matching on tag+value are SAME, unlike Directory's reference-identity SAME) and
recurses into the wrapped value with no type-coercion (the outer `==` BinInt
widening in `_binIntCrossNormalize` stays at the top level, so a Tagged-of-`#16h`
is never SAME nor `==` a Tagged-of-`Integer(16)`). Probed all six live first
(node stdin, CAS-free): distinct-alloc SAME→1, tag-differs→0, value-differs→0,
nested-List recursion both ways, and the BinInt-vs-Integer value→0. Added a
`session363:` block (+7 assertions) in `tests/test-comparisons.mjs` after the
session362 Unit SAME block. No source change — guards a refactor that extends
"SAME = reference identity" to Tagged or lets BinInt widening leak into the
value. Updated `docs/TESTS.md` (status/table 6935→6998, comparisons row +7,
synced drifted rows, advanced the queue, coverage note). `node tests/test-all.mjs`
→ 6998 passed / 0 failed (baseline 6991). Next: the value-equality family is now
SAME-audited for Unit and Tagged; the List/Vector/Matrix structural branches
(`eqValues` ~4990, `_eqArr`) are `==`-pinned (session072) but should be checked
for a positive `SAME` (not just `==`) pin — the same gap class one collection
over.

### 2026-06-17 18:46 — ui-development
First test coverage of `www/src/ui/keyboard.js` (was 0 test callers). The four
exported layout tables — `SOFT_KEYS`/`NAV_KEYS`/`ARROW_KEYS`/`MAIN_KEYS`, pure
data built by the `mk` factory — had no guard at all, so a refactor dropping a
key, breaking the `mk` shape, or scrambling the documented alpha sequence would
pass green. Probed all claims live first (`node -e`, no DOM): grid sizes
6/6/6/35, the 9-field `mk` contract on every entry, per-grid primaries/kinds,
the header's "alpha a..z → first 26 keys, F1=a … ÷=z" invariant (26 unique
letters across soft+nav+main, ÷ carries z), and 53 unique primary labels across
all grids. Added a `session368:` block (+20 pins, imported the four tables) at
the end of `tests/test-ui.mjs` after the session361 pushHistory block: grid
sizes, mk-field + callable-action shape, soft/nav/arrow primary+kind+alpha runs,
the a..z sequence + ÷=z anchor, primary-label uniqueness, and the ON/0/./SPC/
ENTER bottom row + digits-0..9-as-kind-digit anchors. No source change — these
are structural guards on the source-of-truth layout. No ROADMAP edit: keyboard
layout has no dedicated §5/§6 bullet, so adding one would be drift
(session319/326/333/354/361 precedent). `node tests/test-all.mjs` → 6991 passed
/ 0 failed (baseline 6971). Next: the keyboard's remaining surface is the DOM
renderer `renderKeyboard` (the only thing left in keyboard.js) plus the shift-
state cycling and per-key action dispatch — all genuine DOM/Entry-bound and need
a render harness; `www/src/ui/interactive-stack.js` (123 lines) and `entry.js`'s
pure cursor/buffer helpers are the next DOM-free extract-and-pin candidates.

### 2026-06-17 18:31 — ai-chatbot
Closed the renderer's block-dispatch surface — the heading/list/paragraph
routing the last several ai-chatbot runs flagged as the final DOM-bound pure
core (after session353 lifted the fenced-block splitter and session360 the
inline-span tokenizer). Lifted the per-line classification out of
`appendInlineMarkdownLines` (`chat-bot.js` ~292) into a pure exported
`classifyMarkdownLine(line)` returning `{kind, ...}` (`heading` with 1-3
`level`+`content`, `bullet`/`ordered`/`text` with `content`, or `blank`), and
routed the line loop through it (behavior-identical; the DOM `<ul>`/`<ol>`/`<p>`
assembly stays at the call site). Probed all arms live first (`/tmp`, no DOM):
level bound (`#### too deep`→text), the `\s+`-after-marker requirement
(`#NoSpace`→text, `*just italic*`→text not bullet), indented multi-digit ordered,
whitespace-only→blank, and the heading-before-bullet precedence with a leading-#
bullet body. Added a `session367:` block (+13 pins, imported
`classifyMarkdownLine`) in `tests/test-chatbot-parse.mjs` after the session360
parseInlineSpans block. No docs notes file for this lane (notes live in the
www/src/ai/* sources). `node tests/test-all.mjs` → 6971 passed / 0 failed
(baseline 6958). Next: the markdown renderer's pure core is now fully pinned at
all three levels — block fence (parseFencedBlock), block line-role
(classifyMarkdownLine), and inline span (parseInlineSpans); the only remaining
uncovered AI surfaces are genuinely DOM/stream-bound (the `<ul>`/`<ol>` grouping
in appendInlineMarkdownLines, the `$$…$$`/`\[…\]` display-math split in
appendInlineMarkdown, and the streamed-bubble body assembly in `_runLoop`) and
need a DOM render harness.

### 2026-06-17 18:16 — rpl-programming
Closed the unpinned arms of `→PRG`'s count coercion `_toCountIdx` (`ops.js`
~6993). session067/077 pinned the Integer/BinaryInteger accepts, the Integer-
negative and Name/String rejects, and the 0 case — but the Real branch
(`!v.value.isInteger()` → Bad argument value, ~6996) was only ever reached
implicitly, the negative-whole-Real path (passes the isInteger gate, then trips
the handler's `n < 0` — a distinct path from the Integer-negative pin) was
untested, and the popN underflow (count > stack depth) had no →PRG pin. Probed
all five live first (outputs scratch, CAS-free: Real(2)→2-token Program;
Real(2.5), Real(-1), Real(-2.5) → Bad argument value; count 5 over 2 items →
Too few arguments), then added a `session366:` block (+5 pins) in
`tests/test-reflection.mjs` after the session077 →PRG round-trip block. No
source change — guards a refactor that drops the Real integrality check or the
underflow guard. Updated the →PRG note in `docs/RPL.md`. `node tests/test-all.mjs`
→ 6958 passed / 0 failed (baseline 6953). Next: `→PRG`'s count surface is now
fully pinned across all three `_toCountIdx` accept/reject branches plus the
underflow; the lone larger open item remains halted-stack persistence across
`persist.js` (generators aren't JSON-serialisable — needs a token/IP capture
design), and the Grob NEWOB identity fall-through stays blocked until a Grob
value is constructible CAS-free.

### 2026-06-17 18:02 — data-types
Closed the lone unpinned arm of the MOD V/M operand-position rejection — the
same symmetric-slot gap session344 (MIN/MAX), session337 (GCD/LCM), and
session358 (percent) closed one family over. MOD shares MIN/MAX's
`!isNumber(a) || !isNumber(b)` guard and `_withListBinary` distributes Lists
only, so a V/M in EITHER slot reaches the inner handler — but session068 pinned
only x-slot Vector, y-slot Vector, and x-slot Matrix, leaving the y-slot Matrix
arm (valid Real `a`, Matrix `b`) untested. Probed both y-slot arms live first
(`/tmp`, CAS-free: Real∘Matrix and the already-pinned Real∘Vector → both 'Bad
argument type'), then added a `session365:` block (+1 pin) in
`tests/test-numerics.mjs` after the session344 MIN/MAX block: MOD scalar∘Matrix
→ 'Bad argument type'. No source change — guards a refactor that drops the
second-operand `isNumber` check. Updated the MOD row in `docs/DATA_TYPES.md`.
`node tests/test-all.mjs` → 6953 passed / 0 failed (baseline 6952). Next: the
lone larger open data-types item remains Unit dim-equivalence `==` (UEQUAL /
flag flip, AUR §20, multi-run design); MOD's V/M rejection is now symmetric
across both operand positions and both kinds, like the MIN/MAX, GCD/LCM, and
percent families.

### 2026-06-17 17:46 — command-support
Lane stays saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap),
so continued the thin-wrapper alias rejection-pin sweep (sessions 200/201/202/
203/204/329/336/343/350/357). Found one surviving genuine delegating-wrapper
alias with no rejection coverage: `->UNIT` (ASCII alias of `→UNIT`,
`ops.js:5472` = `(s) => OPS.get('→UNIT').fn(s)` — a distinct fn reference, NOT
shared, confirmed live `fn !== canonical`), so an inline reimplementation could
drop a guard. session064 pinned only its happy-path equivalence (`5 1_m ->UNIT`
→ `5_m`). Probed all arms live first (`/tmp`+outputs scratch, CAS-free): L1
non-Unit template (Real/String/Vector → `Bad argument type` via `!isUnit(u)`),
L2 non-numeric value (String/Vector/Unit → `Bad argument type` via `_numVal`),
and Integer(7)-value pass-through. Added a `session364:` block (+8 pins) in
`tests/test-arrow-aliases.mjs` after the session064 →UNIT block. No source
change. Updated the `→UNIT` row in `docs/COMMANDS.md`. `node tests/test-all.mjs`
→ 6952 passed / 0 failed (baseline 6944). Next: the remaining ASCII arrow
aliases that are genuine delegating wrappers (`->NUM` at ops.js:4895, `->PRG` at
:7010 — both `OPS.get(...).fn` wrappers) still have happy-path-only coverage;
`->NUM`'s rejection is just EVAL underflow but `->PRG`'s inherits →PRG's
negative-count / non-numeric-count guards (a clean next pin). JORDAN stays
blocked on the Giac-init cap (sessions 199/200).

### 2026-06-17 17:45 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged. Then closed the session356-queued sibling block, filed/resolved as
R-019: `www/src/ai/chat-bot.js`'s file-header "Constructor options"
`getContext(): { ... }` return shape (stack/angleMode/displayMode/dir) had no
guard tying it to the keys the registry handlers actually read off
`_getContext()` — R-018 made the `tools` bag evergreen but left this sibling
contract unpinned. Probed live first (`/tmp`, recording context proxy + no-op
tools proxy): the handlers read exactly {angleMode,dir,displayMode,stack}, no
handler threw — so documented set == consumed set, no drift. Added a
`session363:` block (+9 pins) in `tests/test-chatbot-parse.mjs` after the
session356 tools-bag block: derives the consumed key set via the recording
proxy and asserts the header documents exactly it, both directions, with a
`>= 4` floor. No source change. Updated `docs/REVIEW.md` (R-019).
`node tests/test-all.mjs` → 6944 passed / 0 failed (baseline 6935).
Next: persist.js's `__t` encoding-rules header block (Directory shape verified
clean across prior runs: `type:'directory'`, name, entries, parent-dropped)
remains clean but unguarded as the next extract-and-pin target; the chat-bot.js
header's calculator-side contract (tools bag + getContext shape) is now fully
drift-guarded.

### 2026-06-17 17:39 — unit-tests
Closed session355's queued audit: the `==`/`SAME` Unit branch of `eqValues`
(`ops.js` ~5003). The session072 sweep block is headed "Unit via == AND SAME"
but only ever calls `==` on a Unit — `SAME` on a Unit was unpinned anywhere in
the suite, even though `SAME` carries a distinct type-contract (no cross-
coercion — `SAME #10h Integer(16)` = 0 — and Directory `SAME` is reference
identity), so a refactor extending "SAME = identity" to Units would pass green.
Probed all arms live first (`/tmp`, via `parseEntry`): `SAME 1_m 1_m`→1,
`1_m 1_km`→0, `1_m 2_m`→0, `1_m/s 1_m/s`→1, `1_m/s 1_m`→0, and that two
`parseEntry('1_m')` allocations are `!==`. Added a `session362:` block (+6 pins)
in `tests/test-comparisons.mjs` after the session072 `==` Unit pins: the five
SAME cases plus the distinct-allocation `!==` assertion pinning that Unit `SAME`
is *structural* (value + uexpr), not reference identity like Directory. No
source change. Updated `docs/TESTS.md` (status/table 6883→6935, rows synced to
current run, coverage note, advanced the queue). `node tests/test-all.mjs` →
6935 passed / 0 failed (baseline 6929). Next: the ordered `< > ≤ ≥` L/V/M/T/U
arms are *rejections* (session287), so no positive gap there; the `==`/`SAME`
Tagged branch (`eqValues` ~5000) is `==`-pinned (session072 truth table) but
`SAME` on a Tagged has not been audited for a positive `SAME` pin — same gap
class as this run, one type over.

### 2026-06-17 17:35 — ui-development
Extract-and-pin in `www/src/ui/command-help.js` (the session319/326/347/354
precedent). The visited-name history bookkeeping inside `CommandHelp.show()` —
truncate any forward entries, append the new name, advance the cursor, but
no-op when the name is already current — was inline list logic entangled with
the popup's DOM `_render`, untestable headless (the only command-help pins were
`headingKey` (s289) and `ALIASES` (s295)). Lifted it into a pure exported
`pushHistory(history, idx, name)` returning `{history, idx}` (fresh array on
append, same references on the no-op short-circuit), and routed `show()` through
it (behavior-identical). Probed all six arms live first (`/tmp`, no DOM):
empty-seed, end-append, re-issue-current no-op (incl. mid-history, which must NOT
truncate the forward tail), and new-name-mid-cursor truncation. Added a
`session361:` block (+8 pins, imported `pushHistory`) in `tests/test-ui.mjs`
before the session333 errorBeep block. No ROADMAP edit: command-help has no
dedicated §5/§6 bullet, so adding one would be drift (session319/326/333/354
precedent). `node tests/test-all.mjs` → 6929 passed / 0 failed (baseline 6921).
Next: CommandHelp's remaining surface is genuine DOM — `_render`'s section
lookup + alias fallback + clone, `_refreshNav`'s back/fwd disable + history
`<select>` rebuild, and the cross-link/Esc/backdrop handlers — and needs a DOM
render harness; `goBack`/`goForward` are thin cursor guards around `_render`.

### 2026-06-17 22:24 — ai-chatbot
Closed the inline-span markdown pass — the surface the last several ai-chatbot
runs flagged as the next extract-and-pin candidate (after session353 lifted the
fenced-block splitter). Lifted the inline tokenizer out of `appendSpans`
(`chat-bot.js` ~363) into a pure exported `parseInlineSpans(text)` returning
ordered `{type, content}` tokens (`text`/`code`/`math`/`bold`/`em`), and routed
`appendSpans` through it (behavior-identical; the math `.trim()` stays at the
`renderMathInto` DOM call site, like session353's `.trimEnd()`). Probed all arms
live first (`/tmp`, no DOM): code-before-math precedence, both `\(…\)` and `$…$`
math forms, and the bare-dollar guard (`costs $5 and $10` and `$ spaced $` stay
text via the `(?=\S)`/`(?<=\S)` lookarounds). Added a `session360:` block (+9
pins, imported `parseInlineSpans`) in `tests/test-chatbot-parse.mjs` after the
session353 parseFencedBlock block. No docs notes file for this lane (notes live
in the www/src/ai/* sources). `node tests/test-all.mjs` → 6921 passed / 0 failed
(baseline 6912). Next: the markdown renderer is now pinned at both the block
level (parseFencedBlock) and the inline level (parseInlineSpans); the streamed-
bubble body assembly in `_runLoop` and the `renderMarkdown` block dispatch
(heading/list/paragraph routing) remain DOM-bound and need a render harness.

### 2026-06-17 22:12 — rpl-programming
OBJ→'s dispatch had every AUR §3-149-table type pinned (s155/s159/s160/s163/
s164: Complex/Tagged/List/Vector/Matrix/String/Program/Symbolic/Real/Integer/
BinInt/Rational/Unit), but the dispatch's final `throw new RPLError('Bad
argument type')` fall-through — reached by the value types with NO §3-149 row
(Name, Directory: no internal structure to decompose) — had ZERO rejection
pins, so a refactor reordering the dispatch or replacing the throw with a
silent no-op would pass green. Probed all four live first (`/tmp`, CAS-free:
bare Name, quoted Name, Directory, and ASCII-alias `OBJ->` → all 'Bad argument
type'), then added a `session359:` block (+4 pins) in
`tests/test-reflection.mjs` after the session164 OBJ→ Rational(5/1) block: OBJ→
on a bare Name / quoted Name / Directory each reject, and `OBJ->` rejects
identically (delegation preserves the reject tail). No source change. Updated
the OBJ→ decomposition note in `docs/RPL.md`. `node tests/test-all.mjs` → 6912
passed / 0 failed (baseline 6908). Next: OBJ→'s dispatch is now fully pinned on
both the accept branches and the reject tail; the lone larger open item remains
halted-stack persistence across `persist.js` (generators aren't
JSON-serialisable — needs a token/IP capture design), and the Grob NEWOB
identity fall-through stays blocked until a Grob value is constructible CAS-free.

### 2026-06-17 21:58 — data-types
Closed the percent-family (`%`/`%T`/`%CH`) V/M operand-position asymmetry — the
same symmetric-slot gap session344 (MOD/MIN/MAX), session337 (GCD/LCM), and
session351 (TRUNC) closed one family over. `_percentOp` runs `toRealOrThrow(x)`
then `toRealOrThrow(y)`, and `_withListBinary` distributes Lists only, so a V/M
in EITHER slot reaches the inner handler — but session072 pinned only `%`'s
x-Vec + y-Vec, `%T`'s x-Mat, and `%CH`'s both-V/both-M (which all trip the
*x*-slot's first `toRealOrThrow`). The y-slot reject (valid Real x, V/M y →
second `toRealOrThrow(y)`, a distinct path) was untested for `%T`/`%CH`, as were
`%`'s y-Mat, `%T`'s x-Vec/y-Vec, and `%CH`'s y-arms. Probed all ten live first
(`/tmp`, CAS-free; all 'Bad argument type: expected real, got vector/matrix'),
then added a `session358:` block (+7 pins) in `tests/test-numerics.mjs` after
the session072 percent V/M audit: `%` x-Mat/y-Mat, `%T` x-Vec/y-Vec/y-Mat,
`%CH` y-Vec/y-Mat. No source change — guards a refactor that drops the
second-operand `toRealOrThrow` check. Updated the `%`/`%T`/`%CH` rows in
`docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 6908 passed / 0 failed
(baseline 6901). Next: the lone larger open data-types item remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design); the
percent family's V/M rejection is now symmetric across both operand positions
and both kinds, like the MOD/MIN/MAX, GCD/LCM, and TRUNC families.

### 2026-06-17 21:44 — command-support
Lane stays saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap),
so continued the thin-wrapper alias rejection-pin sweep. The 19:54 run queued the
stat ASCII accessors and guessed their rejection was a "no-ΣDAT state error" —
but these aliases pop their operand directly off the stack, so the rejections
are clean operand-driven type/value errors, and sessions 132/137/147 already
swept most of them. Found the two surviving gaps: `SX2` (alias of `ΣX2`) had
only POSITIVE alias pins — no rejection pin under the `SX2` name at all — and
`SY`/`SY2` had only their 1-col `Invalid dimension` alias pins, never the
*require-Matrix* `Bad argument type` arm a Vector trips (a different guard,
reached before the column check). Probed all five live first (`/tmp`, CAS-free:
SX2 Real→type, SX2 empty V/M→value, SY/SY2 Vector→type), then added a
`session357:` block (+5 pins) in `tests/test-stats.mjs` after the session147
canonical-positive block: SX2 on Real → `Bad argument type`, SX2 on empty Vector
/ empty Matrix → `Bad argument value`, SY/SY2 on Vector → `Bad argument type`.
No source change — guards a refactor that special-cases an alias and bypasses
the canonical backend's guards. Updated the `NΣ`/`ΣX` row in `docs/COMMANDS.md`.
`node tests/test-all.mjs` → 6901 passed / 0 failed (baseline 6896). Next: the
stat-accessor ASCII-alias rejection sweep is now complete across all seven
aliases; the thin-wrapper alias surface (FACT/`!`, →Q/Q→/→Qπ, →TAG, stat
accessors, ISOL, LIST→) is fully rejection-pinned. The lone larger
command-support item remains JORDAN, blocked on the Giac-init cap (sessions
199/200).

### 2026-06-17 21:30 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged. Then closed a fresh R-014/R-015/R-016-class source drift, filed/
resolved as R-018: `www/src/ai/chat-bot.js`'s file-header "Constructor options"
`tools: { ... }` block listed only `run`, but the constructor JSDoc just below
(~:850) and `_buildRegistry` (~:930) consume six members
(run/appendToEditor/clearEditor/getEditor/listVars/recallVar) — the header
predates the editor/vars tools and under-listed the calculator-side callback
bag by five. Probed the live consumed set first by running every registry
handler against a recording `_tools` proxy (`run`/`appendToEditor`/
`clearEditor`/`getEditor`/`listVars`/`recallVar`), expanded the header block to
match the JSDoc, then added a `session356:` block (+13 pins) in
`tests/test-chatbot-parse.mjs` after the session342 header block: derives the
consumed set via the proxy and asserts the header documents exactly it, both
directions, with a `>= 6` floor. Doc-only source change. Updated `docs/REVIEW.md`
(R-018). `node tests/test-all.mjs` → 6896 passed / 0 failed (baseline 6883).
Next: the chat-bot.js header `getContext()` return shape (stack/angleMode/
displayMode/dir) is the sibling block — verify it stays in sync with the
`get_stack` handler's read keys; persist.js's `__t` encoding-rules header block
(Directory shape verified clean this run: `type:'directory'`, name, entries,
parent-dropped) remains clean but unguarded as the next extract-and-pin target.

### 2026-06-17 17:11 — unit-tests
Closed session348's queued next-step: the `comparePair` `rational` kind cross-
multiply ordered branch (`av = p.a.n * p.b.d; bv = p.b.n * p.a.d`, `ops.js`
~5192) on NEGATIVE-numerator pairs. The branch is correct only because `d` is
always positive after Rational sign-normalization (sign lives in `n`), but
session127/132's Z × Q ordered pins reached it only with positive Rational
numerators — the lone negative came from an Integer-derived `{n<0, d:1}` pair
(`Integer(-1) < Rational(1/2)`), never a genuine negative-numerator Rational
with a non-unit denominator. Probed all arms live first (outputs scratchpad;
confirmed `Rational(1,-2)`→`{-1,2}`, `Rational(-3,-4)`→`{3,4}`), then added a
`session355:` block (+9 pins) in `tests/test-comparisons.mjs` after the
session132 Q × Z block: `Rational(-3/4) < Rational(-1/2)`→1 and its reverse `>`,
the equal-negative `≤` boundary, `≥`, the sign-crossing `<`→1 and `>`→0,
denom-supplied-sign normalization (`Rational(1/-2) < ...`), double-negative
(`Rational(-3/-4) > ...`), and Q × Z both-negative (`Rational(-5/2) <
Integer(-2)`). No source change — guards a refactor dropping the
`d`-always-positive invariant or forming a real before comparing. Updated
`docs/TESTS.md` (count 6840→6883, table rows synced to current run, coverage
note, advanced the evergreen queue). `node tests/test-all.mjs` → 6883 passed /
0 failed (baseline 6874). Next: the `comparePair` kind-branch coercion arms are
now pinned across complex/integer/rational/real for both signs; re-enumerate
the remaining DATA_TYPES `✓` cells (unit-comparison and tagged-operand ordered
arms) for sibling-type-only coercion gaps.

### 2026-06-17 20:31 — ui-development
Closed the 19:18 run's lone queued pure-ish bit in `side-panel.js`: the
three-zone drag geometry inside `_dropTargetAt` (~514). The folder
before/into/after split (top 25% / middle 50% / bottom 25%) and the
non-folder before/after split (top/bottom half) were live arithmetic
entangled with `getBoundingClientRect`/`ev.target.closest` DOM, untestable
headless. Lifted the `frac`+`isDir` decision into a pure exported
`dropZoneForFraction(frac, isDir)` returning `'before'|'into'|'after'`,
and routed `_dropTargetAt` through it (behavior-identical: `into` →
`{kind:'into'}`, else `{kind:'reorder', zone}`). Probed all boundaries live
first (`/tmp`, no DOM): folder 0.25→into, 0.75→into, 0.76→after; non-folder
0.5→after — the `<0.25`/`>0.75`/`<0.5` strict comparisons pin the boundary
ownership. Added a `session354:` block (+6 pins, imported
`dropZoneForFraction`) in `tests/test-ui.mjs` after the session347 catalog-
shape guards: folder top/middle/bottom zones incl. both boundaries, non-
folder halves incl. the 0.5 boundary, and the same-frac-diverges-by-isDir
case. No ROADMAP edit: drag-reorder has no dedicated §5/§6 bullet, so adding
one would be drift (session319/326/347 precedent). `node tests/test-all.mjs`
→ 6874 passed / 0 failed (baseline 6868). Next: the remaining SidePanel
surfaces are all genuine DOM — `_dropTargetAt`'s element resolution
(`closest`/`contains`/crumb-vs-row-vs-list dispatch), `_performDrop`'s
move/reorder/into/end routing, the `_renderCommands` grid build, and the
history/chars/files tab renders — and need a DOM harness to cover.

### 2026-06-17 20:19 — ai-chatbot
First test coverage of the markdown→DOM renderer's pure core, the surface the
last several ai-chatbot runs flagged as uncovered/DOM-bound. Lifted the ```-
fence language/code split out of `renderMarkdown` (`chat-bot.js` ~232) into a
pure exported `parseFencedBlock(block)` returning `{lang, code}`, and routed the
renderer through it (behavior-identical; the `.trimEnd()` stays at the DOM call
site, so the helper returns the body verbatim) — the session326/347 extract-and-
pin pattern. The `lang` it returns is the mermaid-vs-codeblock routing key
(`lang === 'mermaid'`), and it lower-cases + trims the tag line. Probed all arms
live first (`/tmp`, no DOM): tag lower-cased/trimmed, `  MERMAID  `→`mermaid`,
newline-less fence → empty tag + whole-inner code, bare fence → empty tag, multi-
line body verbatim, tag-only fence → empty code. Added a `session353:` block (+6
pins) in `tests/test-chatbot-parse.mjs` after the session306 strip→parse block
(imported `parseFencedBlock`). No docs notes file for this lane (notes live in
the www/src/ai/* sources). `node tests/test-all.mjs` → 6868 passed / 0 failed
(baseline 6862). Next: the remaining uncovered AI surface is the inline-span
markdown pass (`appendSpans`'s bold/italic/code/$math$ regex) and the streamed-
bubble assembly — both still DOM-bound; `appendSpans`'s regex alternation is the
next extract-and-pin candidate if its span-type dispatch can be lifted from the
DOM node creation.

### 2026-06-17 20:07 — rpl-programming
Closed the lone unpinned arm of `runArrow`'s argument syntax checks: the
`!t.quoted` quote-exclusion in the local-name collector (`ops.js` ~3497). The
collector gathers consecutive BARE Name tokens and stops at the first non-Name
OR quoted Name, so a quoted Name can be neither a local nor a body. session068
pinned all four syntax-error arms (no names / missing body / non-Program-non-
Symbolic body / too-few-args) but used a non-Name (Integer) body — never the
quoted-Name corner, which trips a *different* code path (the `!t.quoted` guard
in the collection loop, not the body type-check alone). Probed both live first
(`/tmp`, CAS-free): `→ 'a' «1»` → `→: no local variable names` (quoted leading
name collects nothing) and `5 → a 'b'` → `→: body must be a program or
algebraic` (the quoted `'b'` stops collection and becomes the rejected body,
not a second local). Added a `session352:` block (+2 pins) in
`tests/test-control-flow.mjs` after the session068 syntax-errors block. No
source change — guards a refactor that drops the `!t.quoted` guard (which would
silently bind a quoted name as a local). Updated the Compiled-local section in
`docs/RPL.md`. `node tests/test-all.mjs` → 6862 passed / 0 failed (baseline
6860). Next: `runArrow`'s syntax-error surface is now fully pinned across all
four arms incl. the quote-exclusion; the lone larger open item remains halted-
stack persistence across `persist.js` (generators aren't JSON-serialisable —
needs a token/IP capture design), and the Grob NEWOB identity fall-through
stays blocked until a Grob value is constructible CAS-free.

### 2026-06-17 19:55 — data-types
Closed the TRUNC V/M operand-position asymmetry — the same symmetric-slot gap
session344 (MOD/MIN/MAX), session337 (GCD/LCM), session330 (combinatorial), and
session323 (BETA) closed one family over. TRUNC is `_withTaggedBinary(
_withListBinary(_truncOp()))` and `_withListBinary` distributes Lists only, so a
V/M in EITHER slot reaches the inner numeric handler — but session196 pinned
only the x-slot (level 2) VECTOR (trips `_roundingOp`'s `!isReal&&!isInteger`
guard), leaving the x-slot MATRIX and BOTH n-slot (level 1) V/M arms untested
(n routes through `toRealOrThrow(nv)`, a different reject path). Probed all four
live first (CAS-free: x-Matrix → 'Bad argument type'; n-Vector/Matrix and valid-
Integer-x n-Vector → 'expected real, got vector/matrix'), then added a
`session351:` block (+4 pins) in `tests/test-types.mjs` after the session196
TRUNC List/Tagged block. No source change — guards a refactor that drops the
second-operand `toRealOrThrow` check or narrows the x-slot guard to Vector-only.
Updated the TRUNC row in `docs/DATA_TYPES.md`. `node tests/test-all.mjs` → 6860
passed / 0 failed (baseline 6856). Next: the lone larger open data-types item
remains Unit dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run
design); TRUNC's V/M rejection is now symmetric across both operand positions
and both kinds, like the MOD/MIN/MAX and combinatorial families.

### 2026-06-17 19:54 — command-support
Lane stays saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap),
so continued the thin-wrapper alias rejection-pin sweep (sessions 200/201/202/
203/204/329/336/343).  Closed the two remaining un-swept aliases the 16:26 run
queued: `->TAG` (ASCII alias of `→TAG`) and `!` (postfix factorial alias of
`FACT`).  Both are pure `lookup(canonical).fn(s)` delegations; session064 pinned
only `->TAG`'s happy-path equivalence and `!` had no rejection pin at all, so an
inline reimplementation dropping the delegation would pass green.  Probed all
arms live first (outputs/tmp scratch, CAS-free), then added a `session350:`
block (+8 pins) in `tests/test-arrow-aliases.mjs` after the session343 block:
`->TAG` Real/Vector tag → `Bad argument type` via `→TAG`'s `_asTagString` guard
(alias and canonical assert-identical), and `!` on Complex/String → `Bad
argument type`, negative Integer → `Bad argument value`, negative integer-valued
Real → `Infinite result` (gamma pole), Complex reject asserted identical to
FACT.  No source change.  Updated the `→TAG`/`->TAG` and `FACT`/`!` rows in
`docs/COMMANDS.md`.  `node tests/test-all.mjs` → 6856 passed / 0 failed
(baseline 6848).  Next: the only remaining un-swept thin-wrapper aliases are the
stat ASCII accessors (`NΣ`, `SX`/`SX2`/`SY`/`SY2`/`SXY`, `MAXS`/`MINS` — but
their rejection is a no-ΣDAT state error, less clean); JORDAN stays blocked on
the Giac-init cap (sessions 199/200).

### 2026-06-17 19:42 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `grep -cE
"^register\(" ops.js` = 463, live `allOps()` = 467, COMMANDS.md ✓:449 —
all unchanged. Then closed a fresh coverage-asymmetry finding, filed/
resolved as R-017: `cycleAngle`'s `RAD→DEG→GRD→RAD` cycle is pinned in
`tests/test-numerics.mjs` (~:183) but its structurally-identical sibling
`cycleCoordMode` (`state.js` ~254, JSDoc `RECT→CYLIN→SPHERE→RECT`) had
ZERO test callers in the whole suite — `setCoordMode` is exercised by the
display tests but the cycle helper never was, so a reorder of COORD_MODES
or a dropped modulo wrap would pass green while contradicting the JSDoc
and breaking the status-line click handler. Probed all arms live first
(outputs scratchpad), then added a `session349:` block (+8 pins,
imported `setCoordMode`/`cycleCoordMode`/`COORD_MODES`) after the
`cycleAngle` block: COORD_MODES order + frozen, the three-step cycle incl.
the wrap, setCoordMode's uppercase normalization, the `Unknown coordinate
mode` rejection, and that a rejected set leaves coordMode unchanged. No
source change. Updated `docs/REVIEW.md` (R-017). `node tests/test-all.mjs`
→ 6848 passed / 0 failed (baseline 6840). Next: the analogous documented-
but-unpinned state.js cycle/guard helpers are now symmetric for angle vs
coord; remaining candidates are persist.js's `__t` encoding-rules header
block (clean but unguarded) and the chat-bot.js Constructor-options
`tools`/`getContext` shape vs `_buildRegistry`/`_getContext`.

### 2026-06-17 19:30 — unit-tests
Closed session341's queued next-step: the `comparePair` BinInt masked-widening
path's *mixed* BinInt × Integer ordered arm (`ops.js` ~5158). session074 pinned
both-BinInt ordered pairs (both widening `if`s fire) and one BinInt × Real pair
(routes through the `real` kind, not `integer`), but the mixed BinInt × Integer
pair — one slot widened, the other already Integer, routing through the
`integer` kind branch — was unpinned, so a refactor collapsing the two
independent `if (isBinaryInteger(...))` widens into one `&&` guard would still
pass every existing pin. Probed all eight live first (outputs/tmp scratch),
then added a `session348:` block (+8 pins) in `tests/test-binary-int.mjs` after
the session074 BinInt × String rejection block: a-slot widened (`#5h < Integer(7)`
→1, `#5h ≥ Integer(7)`→0, `#7h > Integer(5)`→1), b-slot widened with a non-BinInt
left operand (`Integer(7) > #5h`→1, `Integer(5) ≤ #5h`→1 equal boundary,
`Integer(7) ≤ #5h`→0), and the wordsize-mask-on-mixed pair at ws=8
(`#100h < Integer(1)`→1, `Integer(1) > #100h`→1). No source change. Updated
`docs/TESTS.md` (status/table 6786→6840, table rows synced to current run,
coverage note, advanced the evergreen queue). `node tests/test-all.mjs` → 6840
passed / 0 failed (baseline 6832). Next: pin the `rational` kind's cross-multiply
ordered branch (ops.js ~5192) for a NEGATIVE-numerator pair — session127/132's
Z×Q pins exercise it only with positive numerators.

### 2026-06-17 19:18 — ui-development
First test coverage of `www/src/ui/side-panel.js` (was 0 test files). The
"Other"-bucket builder in `SidePanel._renderCommands` (the registered ops not
already shown under a named category) was pure set/string logic entangled with
DOM — the session326 extract-and-pin pattern. Lifted it into a pure exported
`uncategorizedOps(registered, seen, filter)` (excludes the `seen` set, hides
ASCII arrow aliases via the `->` check, applies the lower-cased substring
filter, sorts) and routed `_renderCommands` through it (behavior-identical;
drops the inline `isAsciiArrowAlias` closure). Probed all arms live first
(outputs scratchpad), then added a `session347:` block (+12 assertions,
imported `uncategorizedOps`/`CATEGORIES`/`CHAR_GROUPS`) in `tests/test-ui.mjs`
after the session326 annunciator block: the seen-exclusion + alias-hide + sort,
the default-no-filter arg, the substring filter, all-seen→empty, every-arrow
hidden, plus catalog shape guards on CATEGORIES (string keys, non-empty array
values, no within-category dupes, known anchors) and CHAR_GROUPS (group set,
`[label, insert, title?]` entry shape). No ROADMAP edit: side-panel has no
dedicated §5 bullet, so adding one would be drift (session319/326 precedent).
`node tests/test-all.mjs` → 6832 passed / 0 failed (baseline 6820). Next: the
SidePanel render/DOM surfaces (_renderCommands grid build, history/chars/files
tabs, drag-reorder `_performDrop`, in-place rename) remain uncovered and need a
DOM harness; the only other pure-ish bit is `_dropTargetAt`'s geometry math.

### 2026-06-17 19:06 — ai-chatbot
Closed session339's queued candidate: the buried `.context_length`
extraction in `RemoteLLM.load()`'s `/api/show` probe (`remote-llm.js` ~199)
was the clean extract-and-pin target (the session326 display-label
precedent). Lifted it into a pure exported `pickContextLength(modelInfo)`
— matches whichever `model_info` key ends in `.context_length` (arch
prefix varies by model) and returns the positive token count or null —
and routed `load()` through it (behavior-identical; the only change is the
debug `console.log` no longer echoes the source key). Probed all ten arms
live first (outputs scratchpad), then added a `session346:` block (+8
assertions, imported `pickContextLength`) in `tests/test-remote-llm.mjs`
before the session339 RemoteLLM-class block: the happy path across two arch
prefixes, the value-validity guard (zero / negative / non-number → null),
and the no-usable-key arms (no matching key, empty map, null/undefined map).
`node tests/test-all.mjs` → 6820 passed / 0 failed (baseline 6812). No docs
notes file for this lane (notes live in the www/src/ai/* sources). Next: the
RemoteLLM I/O paths (`load()` /models + /api/show fetch, `generate()` SSE
read loop) still need a `fetch` stub to test; the markdown→DOM renderer and
streamed-bubble assembly in chat-bot.js remain the only DOM-bound uncovered
AI surfaces. The pure extractable helpers of remote-llm.js are now all
pinned (toOpenAIBase/toOllamaBase/takeSSEFrames/summarizeRun/pickContextLength).

### 2026-06-17 18:54 — rpl-programming
session338's queued next-step (pin Grob's NEWOB identity fall-through) is
blocked — there is no `Grob` constructor or `isGrob` helper, only
`TYPES.GROB`, so a Grob value isn't constructible CAS-free in the harness.
Closed the analogous OBJ→/Symbolic gap instead: the session068 sweep pinned
every real AST kind (num/var/neg/bin/fn, incl. multi-arg Fn count=N+1) but
left the two defensive arms of `_symbolicDecompose` (`ops.js` ~269)
unpinned. `Symbolic()` stores `expr` verbatim, so both are reachable:
`Symbolic(null)`/`Symbolic(undefined)` (the `!ast` guard) → OBJ→ pushes just
`Integer(0)`, symmetric with the empty Program/List (session156); and an
unknown AST `kind` → preserves the original Symbolic by reference with an
`Integer(1)` count. Probed all three live first (outputs scratchpad, no
repo-mount scratch), then added a `session345:` block (+7 pins) in
`tests/test-reflection.mjs` after the session068 multi-arg Fn block. No
source change — guards a refactor that drops either defensive arm. Updated
the OBJ→-on-Symbolic note in `docs/RPL.md`. `node tests/test-all.mjs` →
6812 passed / 0 failed (baseline 6805). Next: `_symbolicDecompose` is now
fully pinned across all five AST kinds plus both defensive arms; the lone
larger open item remains halted-stack persistence across `persist.js`
(generators aren't JSON-serialisable — needs a token/IP capture design),
and the Grob NEWOB fall-through stays blocked until a Grob value becomes
constructible.

### 2026-06-17 18:42 — data-types
Closed the MIN/MAX V/M operand-position rejection asymmetry — the same
symmetric-slot gap session330 (combinatorial) and session337 (GCD/LCM)
closed one family over. `_minMax` (`ops.js` ~1746) checks `!isNumber(a) ||
!isNumber(b)` and `_withListBinary` distributes Lists only, so a Vector/
Matrix in EITHER slot reaches the inner handler and rejects — but session068
pinned only MIN as both-Vector (which trips the *first* `isNumber(a)` arm)
and MAX as scalar∘Matrix (the b-slot M arm), leaving the complementary arms
untested. Probed all seven live first (CAS-free under the mock engine; all
'Bad argument type'), then added a `session344:` block (+7 pins) in
`tests/test-numerics.mjs` after the session068 MOD/MIN/MAX V/M block: MIN
scalar∘V, scalar∘M, V∘scalar, M∘scalar; MAX V∘scalar, M∘scalar, scalar∘V. No
source change — guards a refactor that drops the second-operand `isNumber`
check. Updated the MIN/MAX rows in `docs/DATA_TYPES.md`. Probe ran from `/tmp`
(no repo-mount scratch left behind). `node tests/test-all.mjs` → 6805 passed /
0 failed (baseline 6798). Next: the lone larger open data-types item remains
Unit dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design);
MOD/MIN/MAX V/M rejection is now symmetric across both operand positions like
the combinatorial and GCD/LCM families.

### 2026-06-17 16:26 — command-support
Lane is saturated (only JORDAN ✗, blocked on the >45 s Giac-init bash cap),
so continued the thin-wrapper alias rejection-pin sweep (sessions 200/201/202/
203/204/329/336). The 16:40 run's queued candidate — `DERVX`/`DERIVX`
rejection coverage — is already fully closed (session315 loops all three of
INTVX/DERVX/DERIVX). The remaining un-pinned aliases were the ASCII conversion
trio `->Q` / `->Qπ` / `Q->`: separate `lookup(canonical).fn(s)` registrations
whose rejections flow through the Unicode canonical's validators, but session064
pinned only their happy-path *equivalence* (canonical vs ASCII agree on a good
input) — never the rejection delegation. Confirmed the canonicals' own rejection
pins live under their Unicode names (session047 →Q Complex; session048 Q→
non-integer-Real / SIN(X) / Complex; session052 →Qπ). Probed each alias's
CAS-free rejection live, then added a `session343:` block (+7 pins) in
`tests/test-arrow-aliases.mjs` after the session064 R→B String-reject block
(imported `assertThrows` + `Fn`): `->Q`/`->Qπ` on Complex → `Bad argument type`
and Real(∞) → `Bad argument value`; `Q->` on non-integer Real → `Bad argument
value`, non-q-shape Symbolic `SIN(X)` and Complex → `Bad argument type`. No
source change — guards a future inline reimplementation of an alias that drops
the delegation. Updated the `→Q`/`→Qπ` row in `docs/COMMANDS.md` (added `Q→`,
session343 note). `node tests/test-all.mjs` → 6798 passed / 0 failed (baseline
6791). Next: the lone remaining un-swept thin-wrapper aliases are the stat ASCII
accessors (`NΣ`, `SX`/`SX2`/`SY`/`SY2`/`SXY`, `MAXS`/`MINS` — but their rejection
is a no-ΣDAT state error, less clean) and `->TAG` / `!` (FACT); JORDAN stays
blocked on the Giac-init cap (sessions 199/200).

### 2026-06-17 16:21 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `register(`
(`^register`) = 463, live `allOps()` = 467, COMMANDS.md ✓:449 — all
unchanged. Then closed a fresh R-014-class source drift, filed/resolved
as R-016: `www/src/ai/chat-bot.js`'s file-header "Tool-call loop" step 3
still said the orchestrator scans the reply for `<tool_call>...
</tool_call>` XML tags, but `parseAllToolCalls` (ops on the bare JSON
anchor `{"name":`) never reads a wrapper and the system prompt
explicitly FORBIDS `<tool_call>` tags (`system-prompt.js` ~:269, "Bare
objects only") — a leftover from an earlier XML-based tool-call design.
Rewrote step 3 to describe the bare JSON object format read by
parseAllToolCalls (no behavior change), and added a `session342:` block
in `tests/test-chatbot-parse.mjs` (+5 pins) that reads the header text:
the stale XML claim is gone, the bare-JSON format is named, the parser
reads a bare object + keys on the inner JSON of an inert wrapper, and
the prompt forbids the tags. `node tests/test-all.mjs` → 6791 passed /
0 failed (baseline 6786). Next: the analogous header-vs-code enumeration
guards now cover types.js (R-015), parser.js (R-013/R-014) and chat-bot.js
(R-016); the remaining un-pinned source-header lists worth a drift check
are persist.js's encoding-rules block (`__t` tags — verified clean this
run but unguarded) and the chat-bot.js Constructor-options `tools`/
`getContext` shape vs `_buildRegistry`/`_getContext`.

### 2026-06-17 18:24 — unit-tests
Closed session334's queued next-step: the comparison family's `comparePair`
(`ops.js` ~5181) ordered ops (`< > ≤ ≥`) had two kind-branch coercion arms
with no positive *ordered* pin. The `p.kind === 'complex'` ZERO-im branch
(`av = p.a.re; bv = p.b.re`) was only pinned for its im≠0 *throw* (session068),
never the real-part comparison that fires when both operands fold to Complex
with zero imaginary part; and the `p.kind === 'real'` branch (`p.a.toNumber()`)
reached by a MIXED Integer/Real pair had only both-Real ordered pins
(session127/132 cover Q×R and Z×Q, not Z×R). Probed all 11 live first (complex
zero-im both-Complex and Complex×Real both directions, a `(5,1) < 3` im≠0
rejection, and mixed Z/R for `< > ≤ ≥` incl. the equal-value `≤` boundary),
then added a `session341:` block (+11 pins) in `tests/test-comparisons.mjs`
after the session068 `(1,2) < (3,4)` complex-rejection block. No source change
— guards a refactor that drops the zero-im real-part extraction or narrows the
mixed-pair real coercion. Updated `docs/TESTS.md` (count 6725→6786, table row,
coverage note, advanced the evergreen queue to the remaining BinInt-widening
and rational cross-multiply ordered arms). Probe ran from the outputs
scratchpad (no repo-mount scratch left behind). `node tests/test-all.mjs` →
6786 passed / 0 failed (baseline 6775). Next: confirm whether a *mixed*
BinInt × Integer ordered pin exists (the BinInt masked-widening path feeding
the `integer` kind, ops.js ~5158) or only both-BinInt pins, and pin the
`rational` kind's cross-multiply ordered branch if it lacks a direct pin.

### 2026-06-17 18:11 — ui-development
The command-palette matcher (`www/src/ui/op-search.js`) is heavily pinned,
but three clearly-intentional `fuzzyScore` scoring arms weren't isolated by
the existing prefix/scattered ordering pins: the **length tie-break** (the
`Math.max(0, 10 - n.length)` bonus that lets a shorter name win on an equal
leading match), that bonus's **clamp floor** (names of length >= 10 all share
a 0 length-contribution, so a 14- and a 21-char name with the same anchor
score equally — and equal the bare anchor score), and the **progressive
contiguous-run bonus + reset** (a tight 3-char run earns bonuses 1/3/5, while
a gap resets the run counter). Probed all three live first (`XZ`=19 > `XZZ`=18;
length-10/14/21 all = 11; `ZBCDZ`=14 > `ZBZCD`=10, index-0 anchor neutralized
so the run logic is isolated), then added a `session340:` block (+9 pins) in
`tests/test-op-search.mjs` after the existing fuzzyScore prefix block, locking
exact scores. No source change — guards a refactor that drops the length
clamp, the length tie-break, or the run-counter reset. No ROADMAP edit: §5's
command-palette bullet already documents the op-search matching core, so adding
a line would be drift (session319/326 precedent). `node tests/test-all.mjs` →
6775 passed / 0 failed (baseline 6766). Next: the palette overlay itself
(input box, result list, matched-char highlight render via `highlightSegments`,
Enter-to-invoke, Esc-to-close) remains the only uncovered op-search surface and
needs a DOM render harness; the DOM-free matcher/ranker/navigator is now fully
pinned across scoring, ranking, position, highlight, and selection arms.

### 2026-06-17 17:20 — ai-chatbot
The pure response parsers are fully pinned (notes: session332/325/318/
306), but the `RemoteLLM` class wrapping the four pure helpers
(`remote-llm.js`) had ZERO coverage — `tests/test-remote-llm.mjs`
imported only `toOpenAIBase`/`toOllamaBase`/`takeSSEFrames`/
`summarizeRun`. Its construction + guard arms are reachable with no
network: the constructor normalizes the typed endpoint via
`toOpenAIBase` and seeds idle/unloaded getter state; `load()` rejects
on a missing modelId and on an unset endpoint BEFORE any fetch;
`generate()` throws the readiness gate before opening an
AbortController/fetch. Probed all live first (from `/tmp` — no
repo-mount scratch), then added a `session339:` block (+11 assertions,
imported `RemoteLLM`) after the session300 summarizeRun block: ctor
endpoint normalization (bare host→/v1, /api→/v1, default empty),
initial idle/null getters, both `load()` precondition rejects, the
`generate()` not-ready throw, and the `onStatus` subscribe/unsubscribe
contract (`_setStatus` fires the listener once, the returned remover
stops it, and the status/statusMsg getters update). No source change —
guards a refactor that moves the precondition checks after the fetch or
drops the constructor normalization. `node tests/test-all.mjs` → 6766
passed / 0 failed (baseline 6755). Next: the RemoteLLM I/O paths
(`load()` /models + /api/show probe, `generate()` SSE read loop) need a
`fetch` stub to test; the buried `.context_length` extraction in
`load()` is a clean extract-and-pin candidate (a pure
`pickContextLength(model_info)` helper, like session326's display-label
extraction). The markdown→DOM renderer and streamed-bubble assembly in
chat-bot.js remain the only DOM-bound uncovered AI surfaces.

### 2026-06-17 17:08 — rpl-programming
Closed the lone unpinned arm of the `NEWOB` decompose/decouple family:
the **Directory identity fall-through**. `_newObCopy` (`ops.js` ~4619)
rebuilds all 14 enumerated shapes into distinct *frozen* outer wrappers
(session172 freeze-parity sweep pins that), but Directory deliberately
falls past every branch and returns the input unchanged — a Directory is
a live mutable container (STO/PURGE write into it), so a frozen snapshot
would be wrong. That documented inverse contract had no pin. Probed live
first (`copy === orig` true, `Object.isFrozen` false, `entries` Map shared
by ref), then added a `session338:` block (+5 pins) in
`tests/test-reflection.mjs` after the NEWOB-then-DECOMP block: isDirectory,
identity (`===`), not-frozen, live-entries-Map-by-ref, name preserved. No
source change — guards an over-eager future Directory branch in
`_newObCopy` or a universal freeze of NEWOB outputs. Updated the NEWOB note
in `docs/RPL.md`. Probe ran from `/tmp` (no repo-mount scratch left
behind). `node tests/test-all.mjs` → 6755 passed / 0 failed (baseline
6750). Next: Grob is the sibling identity fall-through (also intentional,
flows through dedicated Grob value-copy ops) — pin it the same way if a
Grob value is constructible CAS-free in the test harness; the lone larger
open item remains halted-stack persistence across `persist.js`.

### 2026-06-17 16:54 — data-types
Closed the GCD/LCM b-slot (second-operand) Rational rejection — the
symmetric-operand gap session330 closed for COMB/PERM/IQUOT/IREMAINDER.
session231 pinned only the a-slot (`Rational(1,2) Integer(2)` → Bad
argument type); but the handler (`ops.js` ~1589/1600) calls
`_toBigIntOrThrow(a)` THEN `_toBigIntOrThrow(b)`, so a valid Integer/Real
`a` passes and a Rational `b` throws — and `_withListBinary` distributes
Lists only, so a scalar Rational `b` reaches the inner b-arm. Probed all
six live first (Integer/Real `a` × Rational `b` for GCD and LCM, incl.
integer-valued `Rational(5,1)` → all 'Bad argument type'; Q not silently
coerced), then added a `session337:` block (+4 pins) in
`tests/test-types.mjs` after the session231 GCD/LCM Q block: GCD/LCM
`Integer(2) Rational(1,2)`, GCD integer-valued `Integer(2) Rational(5,1)`,
LCM Real-a `Real(6) Rational(1,3)`. No source change — guards a refactor
that drops the second-operand type check. Updated the GCD/LCM rows in
`docs/DATA_TYPES.md`. Probe ran from the outputs scratchpad (no repo-mount
scratch left behind). `node tests/test-all.mjs` → 6750 passed / 0 failed
(baseline 6746). Next: the lone larger open data-types item remains Unit
dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run design); the
GCD/LCM family's Q rejection is now symmetric across both operand
positions like the combinatorial family.

### 2026-06-17 16:40 — command-support
Closed the ✓-criterion rejection gap for the `lim` alias (HP50 lowercase
canonical of `LIMIT`). `lim` is a thin `OPS.get('LIMIT').fn(s)` wrapper
(`ops.js` ~16758) but session139 pinned only its happy-path delegation;
its rejections — flowing through LIMIT's validators — were untested,
exactly the alias-rejection pattern sessions 200/201/202/203/204/329
closed for XNUM/XQ, SUBTMOD/MULTMOD, POWMOD, CHARPOL, the MODULO family,
and ISOL/LIST->. Added a `session336:` block (+3 pins) in
`tests/test-algebra.mjs` after the session139 `lim` happy-path block:
Vector expression → `Bad argument type` (throws before the
`giac.isReady()` gate), non-Var equation lhs (`1=0`) → `Bad argument
value`, Vector point → `Bad argument type` (both throw inside
`_limitPointToGiac` before any caseval — CAS-free under the mock engine).
No source change — guards a future inline reimplementation of `lim` that
drops the LIMIT delegation. Updated the `LIMIT`/`lim` row in
`docs/COMMANDS.md`. `node tests/test-all.mjs` → 6746 passed / 0 failed
(baseline 6743). Next: `SIMPLIFY` is the lone remaining zero-coverage op
but its Giac init exceeds the 45 s bash cap; JORDAN remains the only ✗,
blocked on the same Giac-init cap (sessions 199/200). Remaining thin-wrapper
aliases worth a rejection-pin sweep: `DERVX`/`DERIVX` happy paths exist
(session315) — confirm their non-symbolic rejection pins cover the alias,
not just the canonical.

### 2026-06-17 16:24 — code-review
Ran the standing pattern-1 reconciliation first (no drift): `register(`
= 463, `^register(` = 463, live `allOps()` = 467, COMMANDS.md ✓:449/463/
467 all unchanged. Then closed a fresh R-014-class source drift, filed
and resolved as R-015: `www/src/rpl/types.js`'s file-header "Types
implemented:" list omitted `Directory` despite the `Directory`
constructor (~:359), `isDirectory` (~:384) and `TYPES.DIRECTORY` (~:69)
all existing. Added the `Directory` entry to the header (between Tagged
and BinaryInteger), and a `session335:` block in `tests/test-types.mjs`
(+18 pins) that reads the header text and asserts every `TYPES` value's
PascalCase display name (derived via first-letter upper-case, not
hand-copied) is documented, plus a `>= 16` floor and an explicit
Directory regression. `node tests/test-all.mjs` → 6743 passed / 0 failed
(baseline 6725). Next: same header-vs-const drift guard could extend to
the analogous enumerating comments in `state.js` (ANGLE_MODES/COORD_MODES
cycle-order prose) and `units.js` (catalog dims vector) if those drift.

### 2026-06-17 16:08 — unit-tests
Closed session327's queued candidate: the Complex-promotion arm of the core
binary arithmetic ops (`+ - * /`). When either operand is Complex,
`promoteNumericPair` (`types.js` ~451) takes its `'complex'` branch and runs
BOTH operands through `toComplex`, so the non-Complex operand exercises
`toComplex`'s `isInteger` / `isReal` / `isRational` per-type arms (~432). The
only prior scalar complex-arithmetic pin (`(1,2)*(3,4)`) was Complex × Complex
— the `isComplex` arm both sides — leaving the mixed Integer/Real/Rational ∘
Complex coercion arms with no positive arithmetic pin. Probed all twelve live
first (Integer/Real/Rational ∘ Complex, both operand orders → Complex), then
added a `session334:` block (+8 pins) in `tests/test-numerics.mjs` after the
session327 mixed-Integer/Real block. No source change — guards a refactor that
drops or narrows a `toComplex` arm. Updated `docs/TESTS.md` (count 6717→6725,
coverage note, advanced the evergreen queue to the comparison family). Probe
ran from `/tmp` (no repo-mount scratch left behind). `node tests/test-all.mjs`
→ 6725 passed / 0 failed (baseline 6717). Next: confirm whether the comparison
family's `promoteNumericPair`-backed ordered ops (`< > ≤ ≥`) have positive
mixed Integer/Real and Complex/Real coercion pins beyond the equality cluster.

### 2026-06-17 15:52 — ui-development
`errorBeep` (`www/src/ui/beep.js`) — the error-flash piezo chirp — was
the lone uncovered `www/src/ui/*` module (0 test files). It has two
environment arms: a silent no-op when no (webkit)AudioContext exists
(the Node default, hit indirectly by every error-flash test) and the
real WebAudio-graph build under a browser context, which was never
exercised headless. Added a `session333:` block (+15 pins) in
`tests/test-ui.mjs` after the session295 ALIASES block: a fake
AudioContext (instance-tracking ctor, recording gain param) lets the
build path run in Node. Pins the no-op precondition, the lazy
single-context cache (second beep reuses, no new ctor), the
suspended→resume guard (and that a running context is NOT re-resumed),
and the osc→gain→destination wiring + square/1 kHz/0.12-peak envelope
schedule. No source change — guards a refactor that drops the cache,
the resume guard, or rewires the graph/envelope. No ROADMAP edit:
beep has no §5/§6 bullet, so adding one would be drift (session319/326
precedent). `node tests/test-all.mjs` → 6717 passed / 0 failed
(baseline 6702). Next: every pure/headless-testable `www/src/ui/*`
export is now pinned; the only remaining UI surfaces are genuinely DOM
(command-palette overlay, contextual-help tooltip render, DBUG/SST
step indicator) and need a render harness.

### 2026-06-17 15:37 — ai-chatbot
`parseAllToolCalls` (`www/src/ai/chat-bot.js`) had two unpinned arms of its
candidate-skip logic. The existing malformed-object pin only exercises a
JSON.parse *throw*; the `obj && typeof obj.name === 'string'` guard's OTHER
false arm — valid JSON whose `name` is non-string (or null) — and the
`end < 0` unclosed-brace `break` (partial-stream give-up) were never tested.
Probed all four live first (numeric `name` skipped + following `{"name":"clear"}`
still surfaces via the post-try lastIndex advance; null `name` skipped;
unclosed leading brace abandons the whole rest, dropping a trailing valid
call), then added a `session332:` block (+3 pins) in `tests/test-chatbot-parse.mjs`
after the no-anchor block. No source change — guards a refactor that narrows the
name-type guard or drops the early break. `node tests/test-all.mjs` → 6702
passed / 0 failed (baseline 6699). No docs notes file for this lane (notes live
in the www/src/ai/* sources). Next: the markdown→DOM renderer and streamed-bubble
body assembly in chat-bot.js remain the only uncovered AI surfaces (both DOM,
need a render harness); the pure response parsers are now fully pinned across
the parse-throw, type-guard, and unclosed-brace skip arms.

### 2026-06-17 13:14 — rpl-programming
The auto-close/structural-error policy was thoroughly pinned (session083/
session136/session317/session324) except for one arm: `runFor`'s
`isName(varTok)` gate (ops.js ~4250) that throws `FOR needs a name`. The
companion hard errors (FOR/START-without-NEXT/STEP, WHILE-without-REPEAT,
DO-without-UNTIL, IF/IFERR-without-THEN) all had pins, but the
FOR-counter-slot check had none. Probed all four live first (Integer slot,
trailing `FOR` with an undefined slot, and a Program slot → `FOR needs a
name` each with a clean post-rollback stack; an operator Name `+` → accepted
as the counter, body runs), then added a `session331:` block (+8) in
`tests/test-control-flow.mjs` after the session136 FOR spurious-END block.
No source change — guards a refactor that narrows/moves the structural
`isName` gate or invents a default counter name. Updated the auto-close note
in `docs/RPL.md`. `node tests/test-all.mjs` → 6699 passed / 0 failed
(baseline 6691). Probe ran from `/tmp` (no repo-mount scratch left behind).
Next: the lone larger open item remains halted-stack persistence across
`persist.js` (page refresh drops the LIFO; generators aren't
JSON-serialisable — needs a token/IP capture design); the structural
control-flow error/auto-close surface is now fully pinned across IF / IFERR /
WHILE / DO / START / FOR / CASE.

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
