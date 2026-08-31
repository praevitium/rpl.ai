# Release Notes — rpl.ai

**Latest release:** v0.3.5 (2026-08-31)

---

## What is rpl.ai?

rpl.ai is a modern, high-resolution desktop reimplementation of the HP 50g
graphing calculator. It preserves everything that made the HP 50g exceptional
— the RPN/RPL stack model, the User-RPL programming language, and the full
AUR command surface — while replacing the original's 128×80 monochrome LCD
with a crisp, resizable UI and swapping its 1990s-era CAS for
[Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html), the
same symbolic engine Bernard Parisse (author of the HP 48/49/50g "erable" CAS)
later used in Xcas and the HP Prime.

The application runs as a native desktop window on macOS, Windows, and Linux
via [Tauri 2](https://tauri.app/). The entire calculator frontend is plain
HTML / CSS / ES modules — no build step, no framework, no bundler required for
development.

---

## v0.3.5 — 2026-08-31

Stack copy/push on the formula, matrix, and graph editors.

### Side panel

- **From stack / To stack** on the equation writer, matrix editor, and graph
  view. Clicking a stack row while one of those tabs is open copies that
  level into the editor (instead of the command line). Graph traces also
  have a per-trace **To stack** control; expressions push as Symbolic,
  scatter/bar/hist push as a 2-column Matrix.

### Test suite

**8,023** assertions. Plot-engine tests cover stack↔trace conversion.

### Known limitations carried into v0.3.5

Same as v0.3.4: `JORDAN`, step-debugger UI, command-palette overlay,
main-thread CAS, `DIFFEQ` plots, no mobile layout.

### Upgrade notes

No migration is required from v0.3.4.

---

## v0.3.4 — 2026-08-30

Graphing and the equation / matrix writers land in the side panel, replacing
the HP 50g PICT / EQW / matrix-writer prompts with first-class tabs.

### Side panel

- **Graph (📈).** Pan/zoom cartesian canvas. Expression traces (`y=f(x)`,
  polar, parametric), plus `BARPLOT` / `HISTPLOT` / `SCATRPLOT` off a stack
  matrix or `ΣDAT`, with a last-fit overlay from `LINFIT` / `LOGFIT` /
  `EXPFIT` / `PWRFIT`. `FUNCTION`, `POLAR`, `PARAMETRIC`, and `DRAW` open
  this view.
- **Equation writer (ƒ𝑥).** Algebraic entry with a live textbook preview
  (pretty.js). Palette wraps the selection in fractions, powers, radicals,
  and named functions. Load / Push talk to stack level 1.
- **Matrix editor (⊞).** Spreadsheet grid that round-trips `Matrix` /
  `Vector` values, with identity / zeros / resize.

### Test suite

**7,999** assertions across 28 test files. New files pin plot sampling
(`tests/test-plot-engine.mjs`), equation wrap/preview
(`tests/test-equation-editor.mjs`), and matrix-grid helpers
(`tests/test-matrix-editor.mjs`).

### Known limitations carried into v0.3.4

`JORDAN` Giac wiring, the step-debugger UI, the command-palette overlay
(the fuzzy matcher ships and is tested), main-thread CAS, `DIFFEQ` plots,
and the absence of a mobile layout remain pending.

### Upgrade notes

No migration is required from v0.3.3.

---

## v0.3.3 — 2026-08-15

The AI assistant grew from a side-panel helper into a calculator-aware
workflow: it looks commands up in the HP 50g reference, dry-runs RPL on a
scratch copy of the machine, and talks to Ollama with native tool calling.
Command coverage is unchanged — 449 ✓, with `JORDAN` still the one remaining
✗. There was no v0.3.2.

### AI assistant

- **Command reference.** `www/src/ui/command-reference.js` parses
  `www/docs/hp50-commands.html` into a plain-text index (no DOM, so it also
  runs under Node). The assistant uses it through `lookup_command` and
  `search_commands` instead of guessing stack diagrams.
- **Scratch eval.** `www/src/rpl/scratch.js` runs a line the way ENTER would,
  on a throwaway stack, inside `withScratchState` so STO / mode / flag
  changes roll back. The assistant dry-runs with `evaluate` before a live
  `run`.
- **Tool surface and Ollama.** Tools execute immediately (each turn ends
  with an Undo that restores the pre-turn snapshot). Ollama models that
  advertise `tools` get native tool calling; models that advertise
  `thinking` can reason first. The context window is requested as `num_ctx`
  so the system prompt is not truncated.
- **Prompt.** Infix-vs-RPN reminder, applied-maths / exactness guidance, and
  a compact vs full profile split (in-browser WebLLM vs remote).

### RPL

ASCII `->` is accepted as the compiled-local arrow (same as `→`), so
keyboards and models without the glyph still bind `-> a b « … »`.

### Test suite

The suite grew to **7,891 assertions across 25 test files** (from 7,611
across 23 in v0.3.1). New files `tests/test-command-reference.mjs` and
`tests/test-scratch.mjs` pin the assistant lookup and dry-run surfaces.
The ASCII local-arrow path is pinned in `tests/test-control-flow.mjs`.

### Known limitations carried into v0.3.3

Unchanged from v0.3.1: `JORDAN` Giac wiring, the step-debugger UI, the
command-palette overlay (the fuzzy matcher ships and is tested), graphics /
plotting, the equation and matrix writers, main-thread CAS, and the absence of
a mobile layout all remain pending.

### Upgrade notes

No migration is required from v0.3.1. Pull the latest commit and re-run
`npm install` to regenerate `build-info.js`.

---

## v0.3.1 — 2026-06-17

A hardening and testability patch on top of v0.3.0. No new commands and no
change to calculator behavior; the focus is regression-proofing the interpreter
and AI surfaces, one AI-protocol fix, and repository hygiene.

### Test suite — 7,611 assertions

The suite grew to **7,611 assertions across 23 test files** (from 6,691 across
22 in v0.3.0), all passing. The new file `tests/test-llm-manager.mjs` gives the
worker-based `LLM` manager its first coverage. The bulk of the growth is
characterization pins that lock in existing behavior so future refactors can't
silently change it — covering op argument-type acceptance/rejection across the
numeric/stats families, RPL control-flow edge cases, the arrow-alias rejection
contracts, and the AI markdown/parsing helpers.

### Testability refactors

Several pieces of pure logic were lifted out of DOM-, network-, and
state-bound methods into named, exported helpers so they can be tested headless
— behavior is unchanged, only the seams moved:

- AI assistant: `parseFencedBlock` (code-fence language/body split) and
  `classifyMarkdownLine` (heading/list/paragraph routing) in `chat-bot.js`;
  `pickContextLength` (Ollama `/api/show` context-window extraction) in
  `remote-llm.js`.
- UI: `pushHistory` (command-help visited-name navigation) in
  `command-help.js`; `uncategorizedOps` (the side-panel "Other" bucket) and
  `dropZoneForFraction` (drag-drop row geometry) in `side-panel.js`.

### AI assistant

Tool calls are now parsed as bare JSON objects (`{"name":…,"arguments":…}`,
one per line) rather than `<tool_call>…</tool_call>` XML tags, matching what
the system prompt instructs the model to emit. The assistant's editor/variable
tool surface is documented and expanded (`appendToEditor`, `clearEditor`,
`getEditor`, `listVars`, `recallVar`), and the Ollama context-length probe is
hardened against missing/malformed `model_info` maps.

### Hygiene

Removed accumulated scratch probe files from the working tree. Documentation
notes (`docs/DATA_TYPES.md`, `docs/COMMANDS.md`, `docs/ROADMAP.md`, and the
autonomous-loop ledgers) were reconciled with the code they describe.

### Known limitations carried into v0.3.1

Unchanged from v0.3.0: `JORDAN` Giac wiring, the step-debugger UI, the
command-palette overlay (the fuzzy matcher ships and is tested), graphics /
plotting, the equation and matrix writers, main-thread CAS, and the absence of
a mobile layout all remain pending.

### Upgrade notes

No migration is required from v0.3.0. Pull the latest commit and re-run
`npm install` to regenerate `build-info.js` (now `0.3.1-build164`).

---

## v0.3.0 — 2026-06-17

A consolidation release: the HP 50g command surface reached effective
completeness, the RPL interpreter closed its last suspended-execution gap, the
AI assistant gained multi-step replies and rich math rendering, and the test
suite grew past 6,600 assertions.

### Command coverage — effectively complete

449 HP 50g commands are now fully shipped (✓), up from 447 in v0.2, with
**`JORDAN` the single remaining unimplemented op**. Registered since v0.2:

- **Matrix eigensolvers and decompositions:** `CHARPOL` / `PCAR`, `EGVL`,
  `EGV`, `PMINI`, `SCHUR`, `RSD` — the eigenvalue / eigenvector / Schur /
  residual surface that v0.2 listed as its most notable gap.
- **Modular arithmetic:** the full `MODULO` family, including `MULTMOD` and
  `EXPANDMOD`, backed by a persistent modulus state slot.
- **CAS special functions:** the `Ei` / `Si` / `Ci` exponential-, sine-, and
  cosine-integral cluster, plus `GREDUCE`.
- **Reflection:** `TVARS` (type-filtered `VARS`).

Seven names earlier notes tracked as gaps — `POLYEVAL`, `LQD`, `ACKER`,
`CTRB`, `OBSV`, `GXROOT`, `SRPLY` — were checked against the HP 50g manuals,
found to be phantoms (not real HP 50g commands), and retired. `JORDAN`'s
CAS-independent output-shaping core ships and is tested
(`www/src/rpl/jordan-format.js`); only the Giac wiring remains, pending
real-CAS verification of the eigenvects / Jordan-chain output shape.

### RPL interpreter — suspended execution completed

`HALT` inside a named sub-program invoked via a variable now suspends cleanly
through the generator protocol — the one substrate gap called out in v0.2.
`SST↓` graduated from an alias to a true step-into, and `DBUG` / `SST` /
`SST↓` are real single-step-debugger ops (a step-mode UI surface is still
pending). Parser tolerance and type coverage widened across the board.

### AI assistant

The side-panel assistant now produces multi-step replies, renders math with
KaTeX and diagrams with Mermaid, offers contextual suggestions, and ships a
revised system prompt. The Ollama remote-endpoint integration was fixed.

### Test suite and hygiene

The suite grew to **6,691 assertions across 22 test files** (from 5,666 across
18 in v0.2), all passing. Repository hygiene: removed scratch probe files and
stale `.bak` backups, and tightened `.gitignore` so neither recurs.

### Known limitations carried into v0.3.0

- **`JORDAN`** is not yet wired (its formatting core ships; Giac wiring pending).
- **Step-debugger UI:** `DBUG` / `SST` / `SST↓` work as ops but have no UI surface yet.
- **Command palette:** the fuzzy op-search matcher ships and is tested
  (`www/src/ui/op-search.js`); the overlay that consumes it is still TODO.
- **Graphics / plotting** (Desmos integration planned), the **equation writer**,
  and the **matrix writer** are not yet implemented.
- **CAS runs on the main thread** — long `FACTOR` / `SOLVE` calls block the UI.
- **No mobile layout** — the keypad assumes desktop aspect ratios.

### Upgrade notes

No migration is required from v0.2. Pull the latest commit and re-run
`npm install` to regenerate `build-info.js` (now `0.3.0-build162`).

---

## v0.2.0 — 2026-04-26 (initial release)

*The sections below are retained as the historical v0.2 release record.*

### Functionality in v0.2

### Stack engine and RPN model

The core stack is fully operational. Objects flow on and off the stack exactly
as on the physical HP 50g: Last-In-First-Out, with levels labeled L1 through
Ln. DROP, DUP, SWAP, ROT, ROLL, PICK, OVER, and the full manipulation family
are all registered. The interactive stack view supports direct drag-and-drop
level reordering.

### RPL programming language

The User-RPL interpreter supports the complete structured-programming surface:

- **Control flow:** `IF / THEN / ELSE / END`, `WHILE / REPEAT / END`,
  `DO / UNTIL / END`, `FOR / NEXT / STEP`, `START / NEXT / STEP`, `CASE /
  THEN / DEFAULT / END`, `IFERR / THEN / ELSE / END`
- **Local environments:** `→ a b c « … »` binds named locals for the
  duration of a sub-program
- **Suspended execution:** `HALT` suspends a running program into a LIFO slot;
  `CONT` resumes it; `KILL` discards it. Multiple programs can be halted
  simultaneously.
- **Compiled programs:** `« … »` literals, name evaluation, and the full
  deferred-execution model

### Numeric types

All four numeric towers operate in parallel with no precision-loss surprises:

- **Real** — backed by [decimal.js](https://mikemcl.github.io/decimal.js/) at
  15 significant digits. `0.1 + 0.2 = 0.3` exactly.
- **Integer** — arbitrary-precision integer arithmetic via BigInt coercion
- **Complex** — backed by [complex.js](https://www.npmjs.com/package/complex.js)
  with correct branch-cut handling for `pow`, `sqrt`, and the hyperbolic family
- **Rational** — backed by [Fraction.js](https://github.com/nicktindall/Fraction.js)
  with BigInt numerators; Integer ÷ Integer in EXACT mode returns a Rational
  automatically

### CAS (symbolic computation)

Giac is vendored at `www/src/vendor/giac/` as a prebuilt WebAssembly module
and runs synchronously on the main thread via a thin adapter in
`www/src/rpl/cas/`. Symbolic objects (`'expr'`) push through Giac for
`EXPAND`, `FACTOR`, `SIMPLIFY`, `SOLVE`, `DIFF`, `INTEGRATE`, `TAYLOR`,
`SERIES`, and the broader CAS function set. The no-fallback policy means a
CAS operation either succeeds via Giac or surfaces a clean error — there is no
silent degradation to a partial numeric approximation.

### HP 50g AUR command coverage

As of this release, **447 HP 50g commands are fully shipped** (✓), with an
additional handful partially implemented (~). Commands span:

- Arithmetic and scalar math (ADD, SUB, MUL, DIV, MOD, power, roots, logs,
  trig, hyperbolic, and their inverses)
- Comparisons and boolean (`==`, `≠`, `<`, `>`, `≤`, `≥`, `AND`, `OR`,
  `NOT`, `XOR`)
- Bitwise / BinaryInteger operations (full #hex / #oct / #bin / #dec surface)
- Angle and conversion ops (`R→D`, `D→R`, `→HMS`, `HMS→`, `→Q`, `→Qπ`,
  `→STR`, `STR→`, `OBJ→`, `→OBJ`, `→UNIT`, `UNIT→`, `UBASE`, `CONVERT`)
- Stack manipulation (DROP, DUP, SWAP, ROT, ROLL, PICK, OVER, NIP, TUCK, …)
- Type predicates and reflection (`TYPE`, `TYPEVAL`, `VARS`, `PURGE`, `NEWOB`,
  `SAME`, `RCL`, `STO`, …)
- List operations (`GET`, `PUT`, `HEAD`, `TAIL`, `SIZE`, `SORT`, `REVLIST`,
  `APPEND`, `MAKELIST`, `DOSUBS`, `DOLIST`, `MAP`, `STREAM`, …)
- String operations (`+`, `SIZE`, `POS`, `SUB`, `HEAD`, `TAIL`, `NUM`, `CHR`,
  `STR→`, `→STR`, …)
- Vector and matrix operations (full arithmetic, transposition, inverse, LU,
  QR, SVD, `RDM`, `TRN`, `DET`, `TRACE`, `CROSS`, `DOT`, element-wise apply)
- Polynomial operations (`HORNER`, `PCOEF`, `PROOT`, `PTAYL`, `QUOT`, `REMAINDER`,
  `EGCD`, `GCD`, `LCM`, `EUCLID`, `INVMOD`, …)
- CAS / symbolic ops (`EXPAND`, `FACTOR`, `SIMPLIFY`, `SOLVE`, `DIFF`,
  `INTEGRATE`, `TAYLOR`, `SERIES`, `SUBST`, `MATCH`, `QUOTE`, `EVAL`, …)
- Statistics (`MEAN`, `SDEV`, `VAR`, `CORR`, `COVA`, `LR`, `PREDV`, `PREDX`,
  `ΣX`, `ΣY`, `ΣXY`, `ΣX²`, `ΣY²`, `NΣ`, and the full ΣDAT / fit-model family)
- Control flow and program substrate (`EVAL`, `XEQ`, `HALT`, `CONT`, `KILL`,
  `WAIT`, `ABORT`, `ERROR`, `ERRN`, `ERRM`, `DOERR`, …)
- Variable and directory operations (`STO`, `RCL`, `PURGE`, `VARS`, `ALLVARS`,
  `CRDIR`, `PATH`, `HOME`, `UPDIR`, `ORDER`, …)
- Display and UI ops reachable from RPL (`DISP`, `MSGBOX`, `INPUT`, `PROMPT`,
  `BEEP`, `FREEZE`, `CLLCD`, …)

### Data-type width

Every shipped command has been audited for consistent behavior across the full
type matrix: Real, Integer, Complex, Rational, BinaryInteger, String, Name,
List, Vector, Matrix, Unit, Tagged, Program, Symbolic. The `docs/DATA_TYPES.md`
ledger tracks the exact widening rules — Tagged transparency, List distribution,
Symbolic lift, Vector/Matrix broadcast, Unit propagation, and BinaryInteger
coercion — for each op.

### Persistence

`persist.js` serializes and deserializes the full stack and home directory to
local storage across sessions, including all value types. State is restored
automatically on launch.

### Desktop shell

The Tauri 2 window provides native menus, a resizable 600×900 default
footprint, and platform-native installers (`.dmg` on macOS, `.msi` on
Windows, `.deb` / `.AppImage` on Linux). The frontend also runs as a static
web page (`www/index.html`) for browser-based use without the Tauri wrapper.

### AI assistant (beta)

A side-panel chat interface connects to an LLM via `www/src/ai/` to answer
questions about RPL programming, explain stack operations, and help debug
programs. This feature is experimental and requires a separate model download.

### Test suite

5,666 assertions across 18 test files, all passing. Tests are plain Node ES
modules — no test framework, no mocking layer — and cover the parser,
evaluator, stack operations, numerics, matrices, types, lists, units,
statistics, persistence, reflection, and UI entry logic.

---

## Known limitations in v0.2

### Commands not yet implemented

Approximately 90 HP 50g AUR commands remain unregistered. The most notable
gaps are:

- **Matrix decompositions:** `CHARPOL`, `EGVL`, `EGV`, `JORDAN`, `SCHUR`
  (characteristic polynomial, eigenvalues/eigenvectors, Jordan/Schur forms).
  LU, QR, and SVD are fully shipped.
- **Modular polynomial ops:** `POLYEVAL`, `MULTMOD` — these depend on a
  persistent `MODULO` state slot not yet introduced.
- **CAS special functions:** `Ei`, `Si`, `Ci` (exponential/sine/cosine integrals).
- **Reflection:** `TVARS` (type-filtered sibling of `VARS`).
- **Control-theory:** `ACKER`, `CTRB`, `OBSV`.
- **Groebner CAS ops:** `GREDUCE`, `GXROOT`, `SRPLY`.

### Explicitly out of scope (will-not-support)

The following HP 50g subsystems are deliberately excluded from this
reimplementation. They either require hardware-specific state, depend on
legacy binary library formats, or are superseded by better modern equivalents:

`USER` mode, `ENTRY` mode, `S.SLV` solver app, `NUM.SLV` numeric solver app,
`FINANCE` app, `TIME` (hardware clock), `DEF` (algebraic-mode definition),
`LIB` / `LIBS` / `ATTACH` / `DETACH` (HP binary library system), `OFF`.

### Graphics / plotting

`BARPLOT`, `HISTPLOT`, `SCATRPLOT`, `FUNCTION`, `POLAR`, `PARAMETRIC`, and
`DRAW` open the side-panel Graph view (cartesian / polar / parametric
traces, plus bar / histogram / scatter from a stack matrix or `ΣDAT`,
with a last-fit overlay). `DIFFEQ` is still open.

### Suspended execution — named sub-programs

`HALT` inside a named sub-program invoked via a variable (the
`_evalValueSync` path) rejects cleanly but does not suspend. The generator
protocol needs threading through the synchronous Name-eval call to fully
close this.

### Step debugger

`DBUG`, `SST`, `SST↓` are registered as stubs. They need a UI surface
(step-mode indicator, single-step button) to be useful.

### CAS runs on the main thread

Giac executes synchronously on the main thread. Long `FACTOR` or `SOLVE` calls
will block the UI until they complete. Moving Giac to a Web Worker would fix
this but requires reintroducing async plumbing the op layer currently avoids.

### No mobile layout

The keypad assumes desktop aspect ratios. The calculator is not optimized for
phone or tablet viewports.

---

## Possible future enhancements (as captured at v0.2)

The items below were the forward-looking list at the time of v0.2. Several
have since shipped in v0.3.0 — matrix eigensolvers, `HALT` inside named
sub-programs, and `SST↓` step-into. For the current roadmap, see
[docs/ROADMAP.md](docs/ROADMAP.md).

**Close the command gap.** Matrix eigensolvers (`EGVL`, `EGV`) and the
`CHARPOL` characteristic-polynomial op are the highest-value remaining holes
in the linear-algebra surface. The `MODULO` state slot prerequisite for
modular polynomial ops is small and self-contained.

**Graphics output.** Add a graphics display mode (SVG/canvas subview) and
wire `BARPLOT`, `HISTPLOT`, `SCATRPLOT` off the existing ΣDAT matrix. Follow
up with `FUNCTION`, `POLAR`, `PARAMETRIC`, and `DIFFEQ` plot types driven by
sampled evaluation of user-supplied Programs or Symbolics.

**Persistence and portability.** Named stack snapshots (save/restore the
whole stack + home directory under a label, HP50 "backup ports" equivalent).
Import/export of RPL programs as plain text with robust `« … »` round-trip
parsing. A session-scoped error log (ring buffer of last N RPLErrors) for
debugging scripted programs.

**RPL interpreter — finish the suspended-execution story.** Thread the
generator protocol through the Name-eval path so `HALT` works inside named
sub-programs. Build the `DBUG` / `SST` / `SST↓` step-debugger UI surface.
Add a dedicated "Program aborted" status-line flash for `ABORT`.

**Command palette.** A `/<name>` fuzzy-search overlay over the full
registered op list. The `allOps()` enumerator already exposes the registry;
this is primarily a UI feature.

**Contextual help tooltips.** Hover an op name in the stack or command line
to see its AUR signature and a one-liner description. Metadata is already in
`docs/COMMANDS.md`; a structured pass-through to tooltip copy is the
remaining work.

**Mobile layout.** Two responsive breakpoints — landscape phone and portrait
tablet — to unlock the calculator as a second-screen tool.

**Theme polish.** The existing light/dark skins are functional. A third
"LCD emulation" skin (green-on-black) is a natural nostalgia option.

**WebWorker-hosted CAS.** Move Giac off the main thread to unblock the UI
during long symbolic computations. The tradeoff is reintroducing async
plumbing the op layer currently sidesteps cleanly.

**Offline-first PWA.** Service worker + cache manifest so the calculator
runs from cache without network after the first load. Pairs naturally with
the existing Tauri desktop build.

**Collaborative sessions.** Two users sharing the same home directory over
WebSockets. All state already lives behind the `state` module — this is
primarily a synchronization and transport problem.

**"Show your work" export.** Generate a PDF or Markdown transcript of the
last N stack operations with formatted results and the entry-line keystrokes
that produced them. Useful for coursework, support threads, and reproducible
calculations.

---

## Upgrade notes

v0.2 is the first versioned release. There is no migration path from an
earlier development build. If you have a local development clone, pull the
latest commit and re-run `npm install` to regenerate `build-info.js`.

---

## License

rpl.ai is licensed under the **GNU General Public License v3.0 or later**
(`SPDX-License-Identifier: GPL-3.0-or-later`).

Bundled third-party components: Giac (GPL-3.0+, Bernard Parisse /
Université Grenoble-Alpes), decimal.js (MIT), complex.js (MIT), Fraction.js
(MIT), CodeMirror (MIT). Because Giac is GPL-3.0+, the combined work must be
distributed under GPL-3.0-or-later. See [NOTICE](NOTICE) for full attribution.

HP, HP 48, HP 49, HP 50g, and HP Prime are trademarks of HP Inc. This project
is an independent reimplementation and is not affiliated with or endorsed by HP.
