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

*As of v0.4.1 (2026-09-23).*

The substrate the roadmap builds on:

- **CAS.**  Giac (Bernard Parisse, GPL-3.0+) is vendored at
  `www/vendor/giac/` and wired through `www/src/rpl/cas/giac-engine.mjs`
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

The command surface is complete: 452 HP50 ops are registered and
`COMMANDS.md` has no remaining `✗`. `JORDAN` pushes the minimal
polynomial, the characteristic polynomial, the eigenvalue-tagged
characteristic spaces, and the eigenvalue array. A single eigenvector
stays a vector; a longer block, or several chains for one eigenvalue,
is a Jordan chain. Levels 3 and 4 are the same polynomials as `PCAR`
and `PMINI`.

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
`HISTPLOT`, `SCATRPLOT`, `FUNCTION`, `POLAR`, `PARAMETRIC`, `DIFFEQ`)
ships in the side-panel Graph view — see "Graphics output" below.

### 2. Persistence and session portability

`:n:name ARCHIVE` and `:n:name RESTORE` save and restore the stack,
HOME tree, and modes as a named backup in `localStorage` (ports 0–3).
The Files tab's Backups section archives, restores, and deletes them.
The Files tab also reads and writes HP text files (`%%HP: T(3)…`,
`DIR … END`, apostrophe algebraics, T(3) codes such as `\<<`) through
`www/src/rpl/hp-text.js`, and pasting into the entry line runs the
same conversion. The History tab lists the session's last 10 errors
with the command line that raised each one.

### 3. RPL interpreter — finish the suspended-execution story

Most of the substrate is in place.  Open items tracked in `RPL.md`:

- HALT inside a **named sub-program called via a variable** now
  suspends cleanly (shipped session 106): `evalToken`'s Name-binding
  branch is a generator (`_evalValueGen`) that yields up through the
  `yield*` chain, pinned in `tests/test-control-flow.mjs`.  The only
  structural sync-path call site that still *rejects* HALT is
  `runArrow`'s Symbolic body, currently unreachable in practice (the
  Symbolic AST cannot carry a Program subnode).
- **DBUG / SST / SST↓** run from the LCD. The status line shows
  `SST` or `HLT`, left-shift ▼ runs `SST`, and the suspended program
  stays on screen with `▸` on the next instruction. SST↓ remains a
  true step-into (session 106).

### 4. Data-type width — the last few intentional asymmetries

`DATA_TYPES.md` tracks ✗ cells per op-per-type.  The remaining gaps
are largely *deliberate* (Complex on ordering ops, Unit on percent
ops, String × numeric on arithmetic).  Live threads worth closing:

- **Polar / CYLIN / SPHERE display paths** via complex.js — currently
  handled piecemeal; a single delegation point would halve the surface.
- **Remaining complex unary ops.**  Migrate SQRT, LN, EXP and the
  trig / hyperbolic family to delegate to complex.js rather than keep
  parallel hand-rolled kernels.

### 5. UI polish and keyboard-first usability

The keypad and interactive stack are feature-complete but the
calculator is hard to drive without HP50 muscle-memory.  A few
concrete improvements:

- **Equation and matrix writers.**  Side-panel **ƒ𝑥** (equation) and
  **⊞** (matrix) tabs: algebraic entry with a textbook pretty-print
  preview (palette wraps the selection in fractions, powers, radicals,
  and named functions) and a spreadsheet matrix grid that round-trips
  `Matrix` / `Vector` values.  Push / Load talk to stack level 1.

- **Command palette / fuzzy op search.**  `/<name>` opens an overlay,
  types filter the registered op list, Enter invokes the op (as if
  entered in the command line).  The `allOps()` enumerator already
  exposes the registry.  *Matching core shipped:* `www/src/ui/op-search.js`
  (`fuzzyScore` / `searchOps`, `moveSelection` for wrap-around
  ArrowUp/ArrowDown highlight navigation, `matchPositions` returning
  the matched-character indices, plus `highlightSegments` folding those
  indices into the alternating matched/unmatched text runs the overlay
  renders) is a DOM-free matcher+ranker+navigator unit-tested in
  `tests/test-op-search.mjs`.  Overlay ships as `www/src/ui/command-palette.js`:
  `/` on an empty command line (or Ctrl/Cmd-K) opens it, typing filters
  `allOps()`, Enter runs the highlighted op, Esc closes.
- **Contextual help.**  Hovering a command name in the command line
  shows `NAME — AUR one-liner` (`www/src/ui/hover-help.js`).  Still open:
  the same tooltip over program tokens on the stack.  *Also shipped:*
  the right-click command-help popup (`www/src/ui/command-help.js`)
  serves the AUR reference per op; its doc-heading→command-key
  normalizer is now the pure, exported `headingKey` (strips the
  trailing parenthetical gloss, e.g. `!(Factorial)`→`!`), and its
  panel-name→heading fallback table `ALIASES` (SQRT→√, CHARPOL→PCAR, …)
  is exported with a structural guard (upper-case keys, single-hop
  targets, no self-alias), both unit-tested in `tests/test-ui.mjs`.
- **Mobile layout.**  Narrow viewports (`max-width: 720px`) stack the
  side panel under the calculator and shrink keys; phones (`480px`)
  hide the F-key row so the LCD and keypad fit.  Safe-area insets are
  applied. Landscape keypad can follow.
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
  The side-panel Graph tab is the modern stand-in for the HP50's 128×80
  PICT: pan/zoom cartesian plots, expression traces, polar and
  parametric sampling, plus `BARPLOT` / `HISTPLOT` / `SCATRPLOT` off a
  stack matrix or the `ΣDAT` variable.  A LINFIT/LOGFIT/EXPFIT/PWRFIT
  overlay reads `state.lastFitModel` so a fitted line can sit on a
  scatter without respecifying data.  `DIFFEQ` plots `dy/dx = f(x, y)`
  on that same view.  GROB pixel-emulation remains open.
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
