# ROADMAP.md — Next-feature roadmap for rpl5050

**Purpose.** A forward-looking map of the features worth building next,
rolled up across the five active lanes (command-support, data-types,
rpl-programming, ui-development, unit-tests) plus the code-review lane.
This file is intentionally lane-agnostic: each lane still owns its own
ordering inside its notes file (`COMMANDS.md`, `DATA_TYPES.md`,
`RPL.md`, `TESTS.md`, `REVIEW.md`).  Think of this as the "north star"
view — what the calculator should feel like six months from now, and
which chunks of work get us there.

The HP50 manuals in `docs/` (`HP50 Advanced Guide.pdf`, `HP50 User
Guide.pdf`, `HP50 User Manual.pdf`) remain the fidelity reference.

---

## Current state — foundations in place

The substrate the roadmap builds on:

- **CAS.**  Giac (Bernard Parisse, GPL-3.0+) is vendored at
  `www/src/vendor/giac/` and wired through `www/src/rpl/cas/giac-engine.mjs`
  as a main-thread sync adapter.  Every Symbolic op routes through
  Giac with a strict no-fallback policy; `algebra.js` is the lean
  AST + parser/formatter + `freeVars` surface the op layer still
  needs.
- **Numeric types.**  Real arithmetic is backed by `decimal.js` at
  15 digits (`0.1 + 0.2 === 0.3` exactly).  Complex arithmetic is
  backed by `complex.js` (`i·i = -1`, correct branch-cut pow).
  Rational is backed by `Fraction.js` with BigInt numerators —
  `Integer ÷ Integer` in EXACT mode produces a Rational and all
  unary ops have EXACT/APPROX-aware dispatch.
- **Interpreter.**  Generator-based `evalRange` supports HALT / CONT
  / KILL / RUN at any structural depth on the direct-EVAL path; the
  halted-program LIFO multi-slots suspended programs.
- **Desktop shell.**  Tauri wrapper; CodeMirror editor is wired for
  command-line entry.

---

## Near-term themes (next ~3 release cohorts)

### 1. Close the last command-support gap cluster

The command surface is effectively complete: 449 HP50 ops are registered
and `COMMANDS.md` carries a single remaining `✗` — **JORDAN**.  Its
CAS-independent output-shaping core already ships and is tested
(`www/src/rpl/jordan-format.js`, `tests/test-jordan-format.mjs`); what
remains is registering the op in `www/src/rpl/ops.js` and wiring those
builders to Giac's eigenvalues / multiplicities / characteristic-spaces /
Jordan-chain output (levels 3/4 reuse the already-shipped `PCAR` and
`PMINI`).  This is deferred only until Giac's `eigenvects` / Jordan-chain
output shape is confirmed against the real CAS, so the fixtures match
reality rather than a guess.

Everything earlier drafts of this roadmap listed as pending has since
landed — `CHARPOL` / `EGVL` / `EGV`, `RSD`, `GREDUCE`, `MULTMOD`, the
`Ei` / `Si` / `Ci` integral cluster, `TVARS`, and `SCHUR` are all
registered.  Seven names that once appeared here — `POLYEVAL`, `LQD`,
`ACKER`, `CTRB`, `OBSV`, `GXROOT`, `SRPLY` — were checked against the
three HP50 manuals (`pdftotext`, zero hits in all of them) and retired as
phantoms: they are not real HP50 commands (the real polynomial evaluator
is `PEVAL`, which already ships).

Explicitly out of scope (`will-not`, per `@!MY_NOTES.md`): USER mode,
ENTRY, S.SLV, NUM.SLV, FINANCE, TIME, DEF, LIB, OFF, and the
`ATTACH`/`DETACH`/`LIBS` library system.  Graphics (`BARPLOT`,
`HISTPLOT`, `SCATRPLOT`) is deferred to a longer-term stretch theme —
see "Graphics output" below.

### 2. Persistence and session portability

`persist.js` round-trips most value types but the surface it exposes
to the user is thin.  Worth building out:

- **Named stack snapshots.**  A user-visible way to save the whole
  stack + home directory under a label, then restore it later.  HP50
  calls this "backup ports"; an IndexedDB or file-API equivalent plus
  a small menu would do the same job.
- **Import / export programs as text.**  `DECOMP` already stringifies
  Programs; pair it with a robust parser round-trip so users can
  paste RPL source in and out of a clipboard.  The parser accepts
  `« … »` input today, but Symbolic programs with embedded unicode
  operators (≤, ≠, →) need wider tolerance.
- **Session-scoped error log.**  A ring buffer of the last 10
  RPLErrors visible from the UI — useful for debugging scripted
  programs where the error flashes by.

### 3. RPL interpreter — finish the suspended-execution story

Most of the substrate is in place.  Open items tracked in `RPL.md`:

- HALT inside a **named sub-program called via a variable** now
  suspends cleanly (shipped session 106): `evalToken`'s Name-binding
  branch is a generator (`_evalValueGen`) that yields up through the
  `yield*` chain, pinned in `tests/test-control-flow.mjs`.  The only
  structural sync-path call site that still *rejects* HALT is
  `runArrow`'s Symbolic body, currently unreachable in practice (the
  Symbolic AST cannot carry a Program subnode).
- **DBUG / SST / SST↓** are implemented as real ops (single-step
  debugger; SST↓ is a true step-into since session 106), but still
  need a UI surface (a step-mode indicator + single-step button) to
  be useful to end users.  UI-lane collaboration.
- **ABORT-level UI.**  `ABORT` propagates cleanly to the outer loop
  but displays via the generic error banner.  A dedicated "Program
  aborted" status-line flash would feel closer to the HP50.

### 4. Data-type width — the last few intentional asymmetries

`DATA_TYPES.md` tracks ✗ cells per op-per-type.  The remaining gaps
are largely *deliberate* (Complex on ordering ops, Unit on percent
ops, String × numeric on arithmetic).  Two live threads worth
closing:

- **Symbolic simplification on rounding results.**  `FLOOR('x')` and
  friends lift to Symbolic but don't simplify `FLOOR(3.0)` (a literal
  Real wrapped in Symbolic) back to `3`.  Routine AST pass.
- **Unit + Tagged combo under element-wise ops.**  `Tagged "m"
  (1.5_m FLOOR)` works; `Tagged Vector of Units` doesn't because the
  V/M apply layer currently drops tags before entering the per-entry
  rounder.  Tagged-over-container is a recurring paper cut.
- **Dedicated num-ratio AST leaf.**  Avoid the `Number()` precision
  loss for BigInt numerators above 2^53 when a Rational lifts into
  Symbolic.
- **Polar / CYLIN / SPHERE display paths** via complex.js — currently
  handled piecemeal; a single delegation point would halve the surface.
- **Remaining complex unary ops.**  Migrate SQRT, LN, EXP and the
  trig / hyperbolic family to delegate to complex.js rather than keep
  parallel hand-rolled kernels.

### 5. UI polish and keyboard-first usability

The keypad and interactive stack are feature-complete but the
calculator is hard to drive without HP50 muscle-memory.  A few
concrete improvements:

- **Command palette / fuzzy op search.**  `/<name>` opens an overlay,
  types filter the registered op list, Enter invokes the op (as if
  entered in the command line).  The `allOps()` enumerator already
  exposes the registry.  *Matching core shipped:* `www/src/ui/op-search.js`
  (`fuzzyScore` / `searchOps`, `moveSelection` for wrap-around
  ArrowUp/ArrowDown highlight navigation, `matchPositions` returning
  the matched-character indices, plus `highlightSegments` folding those
  indices into the alternating matched/unmatched text runs the overlay
  renders) is a DOM-free matcher+ranker+navigator unit-tested in
  `tests/test-op-search.mjs`; the overlay that consumes it (input box,
  result list, matched-char highlighting, Enter-to-invoke, Esc-to-close)
  is still TODO.
- **Contextual help.**  Hover an op name in the stack or command line
  → a tooltip with its AUR one-liner plus argument signature.  The
  metadata lives in `COMMANDS.md` today as prose; a structured
  pass-through to tooltip copy would not cost much.  *Partly shipped:*
  the right-click command-help popup (`www/src/ui/command-help.js`)
  serves the AUR reference per op; its doc-heading→command-key
  normalizer is now the pure, exported `headingKey` (strips the
  trailing parenthetical gloss, e.g. `!(Factorial)`→`!`), and its
  panel-name→heading fallback table `ALIASES` (SQRT→√, CHARPOL→PCAR, …)
  is exported with a structural guard (upper-case keys, single-hop
  targets, no self-alias), both unit-tested in `tests/test-ui.mjs`.
- **Mobile layout.**  The keypad assumes desktop aspect ratios.  Two
  breakpoints — landscape phone and portrait tablet — would unlock
  the tool on a second screen while the user writes on their main
  monitor.
- **Theme polish.**  Two official skins (light + dark, already in
  `calc.css`); a third "LCD emulation" skin that leans into the
  green-on-black look for nostalgia users.

### 6. Unit-test lane — drive the flake count to zero

The skip+flake set is concentrated in three areas:

- **Halt / control-flow interactions under stress** — hardening
  continues as the interpreter lane widens HALT coverage.
- **Timing-sensitive entry-line tests** — a handful assume a
  monotonic clock step that CI occasionally violates.  Worth porting
  to a fake clock.
- **Cross-file test-order dependencies** — `flake-bisect.mjs`
  already surfaces these; a one-off pass to make each test file
  hermetic (self-seeding random state, resetting global modes in
  `beforeAll` helpers) would retire most of them.

### 7. Code-review lane — continuing doc ↔ code drift audit

`REVIEW.md` tracks the open findings.  Standing obligations (the drift
patterns this lane sees most):

- `COMMANDS.md` op-count numbers need to be stamped when they move.
- The `Notes` column on per-op rows sometimes lags widening.
- `TESTS.md` skip/flake snapshot should match reality.

No large refactors pending — the code-review lane is mostly in
maintenance mode and catches drift as it happens.

---

## Longer-term — stretch themes

These are aspirational and not on any current queue:

- **Graphics output — charts as a first-class calculator view.**
  The HP50 draws histograms, scatter plots and bar charts onto its
  128×80 LCD; a modern adaptation should treat the graphics surface as
  an actual subview rather than a pixel emulation.  Rather than
  hand-roll a plotting layer, this will lean on an embedded charting /
  graphing component — Desmos or similar — driven off the ΣDAT matrix
  and the `state.lastFitModel` slot that `PREDV` / `PREDX` already
  populate, so a fitted line can overlay a scatter without respecifying
  data.  Scope covers `BARPLOT`, `HISTPLOT`, `SCATRPLOT` first, then
  `FUNCTION`, `POLAR`, `PARAMETRIC`, `DIFFEQ` plot types (HP50 User
  Guide §22), each sampled from an EVAL of a user-supplied Program or
  Symbolic.  It *will* be implemented eventually — just not in the
  near-term cohorts.
- **Programmable soft-menus.**  HP50 lets a user bind custom soft-
  key menus; a web-native equivalent opens the door to per-user
  keyboard-shortcut layouts.
- **Collaborative sessions.**  Two users editing the same home
  directory over WebSockets — mostly a synchronization problem
  since all state already lives behind the `state` module.
- **A "show your work" export.**  Generate a PDF or markdown
  transcript of the last N stack operations with formatted results
  and the entry-line keystrokes that produced them.  Useful for
  coursework and support threads.
- **Offline-first PWA.**  Service worker + cache manifest so the
  calculator runs without network once loaded; pairs naturally with
  the Tauri desktop build.
- **WebWorker-hosted CAS.**  Giac runs on the main thread today.
  Moving it to a worker would unblock the UI during long `FACTOR`
  or `SOLVE` calls; the tradeoff is reintroducing async plumbing
  the op layer currently sidesteps.

---

## How to read this roadmap

Each theme rolls up into one or more runs in the relevant lane's notes
file.  Before picking a theme off this list, check the lane notes for
the current queue — lanes sometimes reprioritize based on user-visible
breakage before getting to the next theme.  Conversely, if a theme
lands here that doesn't map cleanly to any lane, that's a signal the
lane taxonomy needs a new entry (or the theme needs splitting).

Fidelity to the HP50 manuals is the tiebreaker.  When a feature exists
in both HP50 AUR and some third-party source with a slicker spec, the
AUR wins.
