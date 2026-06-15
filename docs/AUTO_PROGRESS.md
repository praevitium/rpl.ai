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
Last run: 2026-06-15 12:28

---

## Run log

Newest entry per lane (older history is in git). Each run appends one entry:
date, lane, what shipped, test result, what's next.

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
