# rpl.ai

**The HP 48/49/50 RPL calculator, rebuilt for the screen in front of you.**

rpl.ai is a complete, programmable RPL calculator that runs in any modern
browser and keeps working offline. It implements the HP 50g's User-RPL
language and command set: 453 commands, exact big-integer and rational
arithmetic, units, lists, matrices, programs and directories. It swaps the
128×80 LCD for a high-resolution stack, a real keyboard and mouse, and the
[Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html)
computer algebra system. Giac is the work of Bernard Parisse, who also wrote
the CAS inside the HP 49 and 50g.

![rpl.ai with the command reference open](screenshots/hero.png)

- **Everything an HP 50g does, where you can see it.** Stack, soft menus,
  shifted keys, VARS, CST, MODES, directories, `HALT`/`CONT` debugging and
  the full command set, each reachable from a labelled control.
- **Keyboard first, mouse friendly.** Type anywhere to enter. `/` divides,
  `⌘K` (Ctrl+K) searches everything, and every soft key, level and menu
  works with a click or a tap.
- **An equation writer that thinks with you.** Type `(x^5-1)/(x-1)` and it
  typesets as you go. Underneath, it shows the value, a plot, the
  simplification, the factorisation, the derivative, the zeros and even
  removable singularities.
- **Previews before you commit.** Hover a soft key or a search result to see
  exactly what it will do to your stack, and why it would fail if it can't
  run.
- **Errors that explain themselves.** "SIN can't use a string." The
  offending level is outlined and one-click fixes are offered, with nothing
  lost.
- **A tutor, not just an answer engine.** The optional assistant turns a
  physics or maths problem into steps you work through on your own stack.
  It checks each step and gives hints before it gives answers.
- **Installable and offline.** Pure static files, no build step and no
  server. Once loaded it runs without a network and installs as an app.

---

## Tour

### The equation writer

Type maths the way you'd say it: `/` makes a fraction, `^` an exponent,
`(` a group that closes itself, `sqrt(` or `sin(` a function, and `pi`
becomes π. Tab leaves a box. The insight strip underneath recomputes as you
type, and one click applies a result or opens the plot. Select any part with
a click, a drag or ⇧← ⇧→, and a toolbar evaluates, simplifies, expands,
factors or differentiates just that part. Enter pushes the expression, or
replaces the level you were editing. Esc cancels, with Undo.

![The equation writer and its insight strip](screenshots/equation-writer.png)

### Walk me through a problem

In Tutor mode the assistant plans a solution as a few steps, and the
calculator dry-runs every step before you see it. Each step explains the idea
and shows the keystrokes. Press **Show me** to watch it happen, or
**I'll do it** to press the keys yourself; the tutor checks your stack and
says what's off. Hints come in stages. Choose Socratic or Direct in Settings.

![A tutor walkthrough of a projectile problem](screenshots/tutor.png)

### Know what a key will do

Hover a soft key (or move through search results) and the stack shows the
arguments it will take and the results it will leave, computed on a copy of
your stack. Keys that need more arguments than the stack holds are dimmed.

![Previewing ROT before pressing it](screenshots/preview.png)

### Errors that help

Every error says what happened, why, and where. The culprit level is
outlined, the command's stack diagram is quoted, and fixes are one click
away: drop the bad value, swap levels, open the reference, or ask the
assistant to explain.

![An error banner with fixes](screenshots/errors.png)

### Plots you can work with

`FUNCTION`, `POLAR`, `PARAMETRIC`, differential equations, scatter, bar and
histogram plots. Traces have checkboxes and editable expressions. Zoom, fit
and reset are on the canvas, the window is typed in directly, and Trace mode
(`T`) walks a cursor along the curves with live readouts. Expand to fill the
window, or go full screen.

![Three traces in trace mode](screenshots/plot.png)

### Search everything

`⌘K` finds commands (by name, description or topic), settings, modes, menus,
variables and constants. The selected command shows what it would leave on
your stack; `→` opens its reference page.

![Search with a result preview](screenshots/palette.png)

### Variables and directories

Browse, run, recall, edit, rename, move and download variables. Drag them
between folders or onto the breadcrumb, archive the whole HOME tree to
backup ports, and import or export HP text files (`.rpl`).

![The Variables drawer](screenshots/variables.png)

### Debugging

`HALT` suspends a program and shows it with the next instruction
highlighted. Continue, Step or Stop from the banner (or `CONT`, `SST`,
`KILL`). `PROMPT` shows its message and waits for your input.

![A halted program](screenshots/debugging.png)

### Three looks, and a Minimal view

Graphite and Paper follow your system's dark or light setting; Classic LCD
reimagines the original display. Minimal view strips everything back to the
status line, the stack and the command line (`⇧⌘F`).

| Classic LCD | Paper |
|:---:|:---:|
| ![Classic LCD theme](screenshots/classic.png) | ![Paper theme with the catalog](screenshots/paper.png) |

| Minimal view | Phone |
|:---:|:---:|
| ![Minimal view](screenshots/minimal.png) | ![rpl.ai on a phone](screenshots/phone.png) |

---

## Getting started

```bash
npm install      # one-time setup
npm run serve    # http://localhost:5050
```

The app is the static files in `www/`, and any static web server can host
them. Browsers won't run it from `file://`, because ES modules and the Giac
WebAssembly need http(s). After the first load it works offline, and the
browser offers to install it as an app. A short tour runs on first launch;
replay it from Help › Take the tour.

### Five minutes with RPL

- **Stack arithmetic.** `24` Enter `15` Enter `*` leaves `360`. A whole
  line works too: `2 3 + 4 *` gives `20`.
- **Algebra.** Push `` `X^2-4` `` and run `FACTOR` for `(X−2)(X+2)`, or
  `` `X^2-5*X+6=0` `X` SOLVE `` for `{ X=2 X=3 }`. Or press `⌘E`, type
  `x^2-5x+6=0`, and click the Solve card.
- **Programs.** `` « DUP * » `SQ` STO `` stores a program; `5 SQ` then gives
  `25`, and SQ appears on the VARS menu. User programs and built-ins share
  one namespace.
- **Local variables.** `« 2 3 → a b « a b + a b * » » EVAL` leaves `5` and
  `6`.
- **Units.** `100_km 2_h /` gives `50_km/h`; `1_km/h CONVERT` converts.
- **The stack.** Click a level to select it; its actions appear on the row
  and in the menu bar. Double-click edits it in the right writer. Drag rows
  to reorder them.

### Keyboard

| Keys | Does |
|---|---|
| `⌘K` / Ctrl+K | Search commands, settings, variables and help |
| `⌘E` · `⇧⌘M` | Equation writer · Matrix writer |
| `⌘I` | Ask the assistant (or start a line with `?`) |
| `F1`–`F6` · PgUp/PgDn | Soft keys · menu pages |
| `↑` · `↓` on an empty line | Select level 1 · edit level 1 |
| Enter · ⌫ · `→` on an empty line | DUP · DROP · SWAP |
| `⌘Z` · `⇧⌘Z` | Undo · redo (text when the line has text, otherwise the stack) |
| `⌘\` · `⌘;` · `⇧⌘F` | Tools drawer · keypad · Minimal view |
| Tab | Complete a command name, or leave a box in the equation writer |
| Esc | Close, deselect, dismiss, or cancel with Undo |

Hold ⌥ (Alt) to see each keypad key's keyboard shortcut. `⌘/` lists every
shortcut, grouped by where it applies.

### The assistant

The assistant is optional and uses a model you choose: any Ollama or
OpenAI-compatible endpoint. Nothing is sent anywhere until you connect one.
Each turn it reads the live stack, modes and variables, and looks commands
up in the built-in HP 50g reference. It dry-runs RPL on a scratch copy of the
calculator, then acts for real. Every action is shown as a card, and each
turn can be undone in one click. Error banners and stack levels can hand
their context to it with Explain or Ask.

- Local Ollama is `http://localhost:11434`. When opening rpl.ai from another
  machine, add its address to `OLLAMA_ORIGINS` where Ollama runs.
- For Ollama's cloud models, run `ollama signin` on the machine running
  Ollama and choose a model whose name ends in `-cloud`. Browsers can't call
  ollama.com directly.
- Models that advertise tools get native tool calling, and reasoning models
  think before answering. Strong models tutor best.

---

## What's implemented

The stack engine, the RPL parser and evaluator, structured control flow
(`IF`, `WHILE`, `DO`, `FOR`, `START`, `CASE`, `IFERR`), compiled local
environments (`→ a b « … »`) and suspended execution (`HALT`, `CONT`, `SST`,
`KILL`) are complete. The HP 50g command set is covered: 453 commands.
Shipped commands are the `register` calls under `www/src/rpl/ops/`.

Left out on purpose:

- USER mode and keyboard assignments
- ENTRY mode
- S.SLV (algebraic solver screens)
- NUM.SLV (numeric solver screens)
- FINANCE (TVMROOT, AMORT, and the rest of that menu)
- TIME (DATE, TIME, TICKS, and the rest of that menu)
- DEF
- LIB, LIBS, ATTACH, DETACH, and port management
- OFF
- Saturn assembly and System RPL
- hardware and IR/serial communication

The guiding principle is **functionality over compatibility**: where a
modern interaction is clearer than an original calculator prompt, the modern
one wins, and the keys keep their muscle memory.

---

## Project layout

```
www/                  The app: static files served as-is
  index.html          Shell and icon sprite
  sw.js               Offline cache (the precache list is generated)
  src/app.js          Wires the UI together
  src/rpl/            Stack engine, parser, evaluator, formatter, persistence
  src/rpl/ops/        Command families; src/rpl/ops.js re-exports the registry
  src/rpl/cas/        Giac adapter and AST↔Giac conversion
  src/ui/             Stack display, input and writers, menus, keypad, drawers, search
  src/ai/             Assistant: chat, tools, tutor, endpoint client
  css/                Design tokens, themes and components
  vendor/             Giac, decimal.js, fraction.js, complex.js, CodeMirror, KaTeX
tests/                Node test suites, one area per file
scripts/              Build info, offline precache, README screenshots
screenshots/          Images used above
```

## Testing

The tests are plain Node ES modules with no framework:

```bash
npm test                          # everything
node tests/test-equation-editor.mjs   # one area
node tests/flake-scan.mjs         # repeat runs to catch order sensitivity
```

`npm run screenshots` regenerates the images in this README
(`RPLAI_SCREENSHOT_LLM` and `RPLAI_SCREENSHOT_MODEL` add the assistant
scene).

What changed is in [RELEASE_NOTES.md](RELEASE_NOTES.md).

---

## Why this exists

I've always loved the HP 48/49/50 interface. RPL's stack makes a calculation
read the way you'd work it by hand: operands first, then the operation. User
programs are first-class: store one under a name and it behaves exactly like
a built-in. The hardware aged. Emulators kept the 128×80 screen, and the HP
Prime left too much of the language behind. I wanted RPL with a big screen,
a real keyboard, deep undo and a proper file manager. When AI-assisted
development made a project of this scope practical, rpl.ai is what came out
of it.

## Acknowledgements

rpl.ai bundles or depends on:

- **[Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html)**
  (GPL-3.0+): Bernard Parisse's computer algebra system, as WebAssembly via
  [emgiac](https://github.com/adriweb/emgiac), with GMP, MPFR and MPFI (LGPL)
- **[decimal.js](https://github.com/MikeMcl/decimal.js)**,
  **[fraction.js](https://github.com/rawify/Fraction.js)** and
  **[complex.js](https://github.com/rawify/Complex.js)** (MIT): decimal,
  rational and complex arithmetic
- **[CodeMirror 6](https://codemirror.net/)** (MIT): the command line
- **[KaTeX](https://katex.org/)** (MIT): math in the assistant's replies
- **[IBM Plex](https://www.ibm.com/plex/)** (OFL): the typefaces

See [NOTICE](NOTICE) for full attribution.

## License

rpl.ai is licensed under the **GNU General Public License v3.0 or later**
(`SPDX-License-Identifier: GPL-3.0-or-later`); see [LICENSE](LICENSE).
Because Giac is GPL-3.0+, the combined work must be distributed under
GPL-3.0-or-later, and can't be relicensed more permissively while Giac is
bundled.

*HP, HP 48, HP 49, HP 50g and HP Prime are trademarks of HP Inc. rpl.ai is
an independent reimplementation, not affiliated with or endorsed by HP.*
