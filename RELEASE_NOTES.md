# Release Notes — rpl.ai

**Latest release:** v0.6.9 (2026-09-30)

---

## What is rpl.ai?

rpl.ai is a modern, high-resolution reimplementation of the HP 50g
graphing calculator. It preserves everything that made the HP 50g exceptional
— the RPN/RPL stack model, the User-RPL programming language, and the full
AUR command surface — while replacing the original's 131×80 monochrome LCD
with a crisp, resizable UI and swapping its 1990s-era CAS for
[Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html), the
same symbolic engine Bernard Parisse (author of the HP 48/49/50g "erable" CAS)
later used in Xcas and the HP Prime.

rpl.ai is a web app: the whole calculator is plain HTML / CSS / ES modules
that run in any modern browser — no build step, no framework, no bundler
required for development.

---

## v0.6.9 — 2026-09-30

Two windows of the same browser stay in step. A window adopts what another
one saved, as it happens and again when you switch back to it, so a stale
window can no longer overwrite the newer stack, variables and modes with
its next autosave.

The textbook view no longer misreads. `2*10^3` was drawn as 210³,
`2*(1/2)` as 2½, `(A/B)^2` as A/B with a raised 2, `EXP(X)^2` as e^X² and
`FACT(FACT(X))` as X!!. A number next to a term that starts like a number
keeps its dot, and those bases and nested factorials are bracketed, in the
stack and in the equation writer.

Programs behave more like they do on the HP 50g. FOR and START loops with a
decimal step count in decimal, so `0 0.3 FOR i … 0.1 STEP` reaches 0.3 and
a loop counting down ends on 0. STR→ evaluates the string as if it were
typed, so `"1 2 +" STR→` gives 3. A comment starting with @ runs to the
end of the line and is dropped, in an entry, a program or a string of
commands. IF, CASE, WHILE and DO take an algebraic test, as in `IF 'X>0'
THEN`, and a comparison of two numbers inside an algebraic evaluates to 1.
or 0. (`==` parses there now). SAME also asks for the same kind of number,
so `2 2. SAME` is 0. `0 LN` and `0 LOG` are an infinite result, and RND
and TRNC accept 12 to keep what the display format shows.

---

## v0.6.8 — 2026-09-30

Exact results are right or absent. `100 EXP` used to give a 44-digit
integer that was not e^100, `-30 EXP` gave 0, `30 TANH` gave 1, and
`FACT(25)`, `COMB(60,30)` and `ALOG(30)` inside an algebraic lost their
last digits. A function of an integer now folds only where its value is an
integer (`0 EXP` is 1, `1 LN` is 0, `1000 LOG` is 3, `90 SIN` is 1 in
degrees) and stays symbolic otherwise, ready for →NUM. ALOG, FACT, COMB and
PERM are worked out in big integers, so `-2 ALOG` is the exact 1/100.

Decimal results are exact too. `0.29 2 TRNC` gives 0.29 (it gave 0.28),
`0.285 2 RND` gives 0.29, `123456789012345678. 10 MOD` is 8,
`100000. LOG IP` is 5, and SINH keeps its digits near 0. In DEG and GRD
`90. COS` and `180. SIN` are 0 instead of 6E-15, and `90. TAN` reports
Infinite result, as the AUR describes.

The assistant's dry runs leave nothing behind. A program that halted inside
a local frame kept its variables visible to the next line, ARCHIVE wrote a
real backup, and plot commands opened the real plot view. Hovering a
command or soft key no longer saves the whole calculator state each time or
redraws the stack twice.

A directory stored from the stack, such as `` `D` RCL `B` STO ``, takes the
name of its variable and can be left with UPDIR; before, entering the copy
showed the old name and trapped you inside it. The app starts when the
browser blocks site data, and warns that nothing is being saved.

---

## v0.6.7 — 2026-09-30

The equation and matrix writers keep their button row on a short phone.
The stack gives up room first and the keypad shrinks and scrolls, where it
used to sit on top of the buttons.

UNROT (ROT the other way) and CLVAR (purge every variable and empty
directory here, keeping directories that hold something) are new. An
integer to a negative integer power is exact, as on the HP 50g: `2 -1 ^`
gives 1/2, or 0.5 in approximate mode, and `0 -1 ^` is an infinite result,
for reals as well.

The determinant of a symbolic matrix is the cofactor polynomial again;
0.6.6 turned a 3×3 into a fraction with its top-left entry underneath,
which is undefined when that entry is zero. Matrix products and
determinants that are too big to finish stop at the ten-second limit
instead of freezing the page. A plot of points sharing one huge
coordinate, or a typed range too narrow to draw, is widened or refused.

Double-clicking a stack level edits it again. A quick second swipe no
longer drops the level that slid into the first one's place. Typing over
selected text on the command line replaces it, and ⌫ on the keypad
deletes the selection.

---

## v0.6.6 — 2026-09-30

Short screens keep the command line and ENTER on screen, including phone
landscape. Plot ticks, large matrix powers and determinants, and long
stack commands finish instead of hanging. Recalled directories are copies,
a directory cannot be stored inside itself, hover previews no longer
change variables, a full browser store says so, and a dry-run CONT no
longer resumes a halted program.

---

## v0.6.5 — 2026-09-30

Programs behave the way they do on the HP 50g. STO, RCL, STO+, INCR and
the other storing commands work on local variables, so the usual running
total `→ n « 0 → s « 1 n FOR i s i + 's' STO NEXT s » »` gives 55 for 10
instead of 0 and no stray global. FOR and SEQ counters are true locals:
a global of the same name is left alone, and storing into the counter
ends the loop early. Evaluating a name follows the HP: `'X' EVAL` gives
X's value, a variable holding an algebraic or a list puts it on the stack
as it is, and a local variable holding a program is recalled, not run.
FOR, IF, CASE, WHILE, DO and → typed straight on the command line now run
instead of leaving their keywords on the stack.

System flags switch the modes they stand for, so `-105 SF` turns on
approximate mode and `-17 FS?` tells whether you are in radians; RCLF and
STOF carry the modes with them. GET, PUT, GETI and PUTI take a variable's
name, a `{ n }` position and a matrix position counted in row order, and
GETI and PUTI set flag -64 when they wrap, so `DO GETI … UNTIL -64 FS?
END` loops stop.

Evaluating an algebraic keeps integers exact (`'2+3'` gives 5, not 5.)
and always works out approximate numbers, which exact mode used to leave
alone (`'2.5*2'` gives 5.); a real such as 2. keeps its point inside an
expression. CAS errors can be caught with IFERR and read plainly, and a
long run of failed CAS commands no longer wears out the algebra engine.
MOD, XROOT of a negative number, HEAVISIDE, DIRAC and the other special
functions reach the CAS correctly, and →NUM no longer treats ordinary
names such as r, f or E as physical constants. Programs that relied on the
old behaviour may need an EVAL or →NUM where a variable used to be
evaluated for them.

---

## v0.6.4 — 2026-09-29

Connecting the assistant to Ollama on this computer from the hosted app
no longer sits on "Loading models…" forever. Chrome 142 and later, Edge
and Firefox 153 and later hold those requests until you answer a prompt
about letting the page access apps and services on this device; the
endpoint form and the status line now say so, and if the page was
blocked earlier they say how to allow it again.

---

## v0.6.3 — 2026-09-29

On a phone or tablet, opening the equation or matrix writer brings up the
device's keyboard, and tapping the equation does too. Typing works whether
the keyboard sends key events or only text, as most Android keyboards do.
While the keyboard is up, the calculator keypad steps aside so the writer
stays in view. Matrix cells no longer auto-capitalize or autocorrect, since
RPL names are case-sensitive.

---

## v0.6.2 — 2026-09-29

Copy a matrix or vector and paste it into Excel, Google Sheets or Numbers:
it arrives as cells. A range of numbers copied from a spreadsheet pastes
onto the command line as a matrix, or a vector for one row. A sideways pen
swipe drops a stack level again, which 0.6.1 had broken. The toolbar's
Undo and Redo follow the equation and matrix writers' own histories, and
Ctrl+Z in a matrix cell steps through the writer's history. The matrix
writer starts a fresh history for each level it loads, skips no-op steps
and returns focus to the changed cell on undo. Its +/- while typing
changes the sign of the number being typed, or its exponent after EEX,
instead of wrapping the whole cell. A toast's Undo still applies after
Undo then Redo.

---

## v0.6.1 — 2026-09-29

The matrix writer keeps its own undo history: UNDO and REDO step through
its edits before touching the stack, and typing in one cell is one step.
Its +/- negates a loaded number, name, expression or complex as a whole,
and flips the exponent only while one is being typed. A toast's Undo,
including the Variables drawer's, now acts only while its step is the
latest, so it can no longer undo something newer. A pen can reorder stack
rows again, and a variable soft key does nothing more when the text on
the command line fails.

---

## v0.6.0 — 2026-09-29

Undo on a toast now reverses the step it names. After swiping a level
away or storing a variable, the toast's Undo brings back the level or the
old value, even with text on the command line or in a writer, where it
used to undo the typing instead. In the matrix writer the keypad's UNDO
and REDO work, and +/- negates the cell instead of typing a minus; after
EEX it flips the exponent, as on the HP 50g. A pen can swipe a level away
too, the "Stored level 1" toast no longer goes missing after an earlier
error, and the assistant is told correctly that Undo this turn restores
the command line.

---

## v0.5.4 — 2026-09-29

The equation and matrix writers have a row of tap buttons with Backspace
and Enter, and a stack level swipes away on a touch screen, with Undo. A
code review removed about 17,000 lines of stale comments and dead code
and fixed about 70 bugs, among them SUM adding a list as text, FROOTS on
repeated roots, a variable named F, R, k, c or g losing to the built-in
constant, keypad keys typing into the hidden command line from the matrix
writer, and '√2' reading as a name. The assistant asks for a 32K context
by default, and its connection form says when Safari, the browser's local
network permission or ollama.com is the problem. The README now walks
through installing rpl.ai and setting up Ollama, and lists the current
limitations.

---

## v0.5.3 — 2026-09-29

rpl.ai is online at https://praevitium.github.io/rpl.ai/ and installs
straight from there, with nothing to download or run first. Every push
to main republishes it, and installed copies offer the update.

---

## v0.5.2 — 2026-09-29

A runaway command no longer freezes the page: one that runs past 10
seconds stops with an explanation and the stack put back, and IFERR
can't trap the stop. The equation writer's insights make their CAS
calls in a background worker that gives up after 3 seconds, so typing
(x+1)^3000 leaves the page responsive, and hover previews skip commands
that need the CAS or factor slowly. A single CAS command still runs to
completion. A backspace button sits beside Enter on the command line,
so it stays with the keypad hidden; on an empty line it drops level 1.
Switching from the equation or matrix writer to RPL carries the formula
or matrix into the command line, so an edit can continue as text.

---

## v0.5.1 — 2026-09-27

rpl.ai installs as an app from the help menu or Settings, and the About
sheet shows the version. The side panel resizes by its edge when it
floats over the calculator. Σ sums evaluate with EVAL; CAS results come
back as plain numbers (no more `1/2 = 0.5`), so FACTOR, ISPRIME? and
friends work on them; FACTOR handles integers past 2^53; EGV and EGVL
work; odd XROOTs of negatives are real and fractional powers of
negatives are complex. Keys no longer reach the stack behind open
dialogs, Ctrl+V pastes into the equation writer, the search panel ranks
settings and actions by name, and an interrupted assistant turn still
offers Undo.

---

## v0.5.0 — 2026-09-26

The in-browser model is gone: the
assistant talks to Ollama or any OpenAI-compatible endpoint, and a
failed connection says why (the server refused the page's origin and
`OLLAMA_ORIGINS` needs it, nothing answered, or it is ollama.com,
which no browser can call). `/` on an empty line types a division
sign; the palette stays on Ctrl/Cmd-K. An error no longer wipes the
undo history. Coordinate, number-format, wordsize, base, textbook,
approximate, and complex modes and user flags survive a reload, not
just the angle. Clicking the command line takes the keyboard back from
the equation writer. `'QZ' STO` explains that names are quoted with
backticks. Typing a variable's name recalls it, a program's name runs
it, and a directory's name enters it, as on the HP 50g. Every keypad
key can be reached with Tab and pressed with Enter or Space, carries a
spoken name, and shows a focus ring; motion stops when the system asks
for reduced motion. `√` can be typed in an algebraic. The page has a
favicon. rpl.ai installs from the browser and, once loaded, runs
offline, because a service worker caches every file, the CAS included.

The whole interface is rebuilt as one system. An app bar holds the
directory as a clickable path, the modes as chips whose menus explain
each option, search (Ctrl/Cmd-K finds commands by what they do, plus
settings, menus, variables and constants), undo and redo, and buttons
for the keypad, Minimal view, Settings and Help. A rail opens the
Assistant, Catalog (every command family, each command's stack
diagram and its manual page inline), Variables, History, Plot and
Characters drawers; on narrow windows they slide over, on phones they
rise as a sheet. Click a stack level to select it: a toolbar and the
LEVEL menu edit, pick, roll, drop, plot, store or explain it, drag
reorders, double-click edits in place, and Enter writes the edit back
to the same level. The equation and matrix writers live in the input
with RPL, Enter pushes and Esc steps back one layer at a time. The
menu bar is always visible, including on phones, and its picker
reaches VARS, CST, MODES and every command family. The keypad keeps
the HP 50g positions, relabels itself when ↰, ↱ or α is active,
prints what ENTER, ⌫ and the arrows will do (DUP, DROP, SELECT,
EDIT, SWAP), shows every layer on right-click, and comes Full,
Compact or hidden. TOOLS is now CAT. Themes are Graphite and Paper
(following the system) and a Classic LCD with glass, pixel grid and
ghosted annunciators; the plot follows the theme. Minimal view keeps
only the status line, stack and command line. Every shortcut lives in
one keymap that a test keeps free of clashes, bare printable keys and
browser-reserved chords; ⌫ and Enter on an empty line no longer fire
from key-repeat, and ↰ON runs CONT. Settings covers appearance, the
assistant and data, including a reset that also clears backups.

Errors no longer flash and vanish. A banner says what went wrong in
plain words ("SIN can't use a string."), quotes the command's stack
diagram and what the stack held, outlines the level at fault, and
offers fixes: drop it, swap levels, fix the line, open the reference,
or ask the assistant to explain. It stays until dismissed. A halted
program shows its PROMPT text and the program with the next
instruction highlighted, with Continue, Step and Stop.

The equation writer is rebuilt. Typing builds structure (`/` a fraction,
`^` a power, `(` a group, `sin(` a function, `pi` π, `2x` a product),
Tab leaves a box, and there is no focus mode to click into. An insight
strip shows the value, a plot, and what the CAS can do with the
expression: simplify, factor, expand, differentiate, solve, and spot a
removable hole. A toolbar transforms just the selected part, a Text view
edits the same expression as RPL, Enter pushes or replaces the edited
level, and Esc discards with Undo. The matrix writer drops its toolbar
for the MATRIX menu, Enter pushes, and blank trailing rows are ignored.
Hovering a soft key or search result previews its effect on the stack,
and keys dim when the stack is too shallow. The command line completes
command and variable names with their stack diagrams. The plot gets
zoom, fit, reset and trace tools, editable window ranges, a keyboard
trace cursor, trace checkboxes, and full screen. The assistant gains
Tutor mode: a problem becomes steps the calculator checks first, each
with Show me, I'll do it and staged hints, in a Socratic or Direct
style. A first-run tour, Move to… for variables, reference links on
hover cards, and higher-contrast muted text round it out. Textbook math
uses true minus signs and writes `(x−3)(x−2)` without a product sign.
`-X^2` now means −(X²), as on the HP 50g, so `'-2^2' EVAL` is −4 and
CAS results such as `-x^2` keep their sign.

---

## v0.4.1 — 2026-09-23

`:n:name ARCHIVE` saves the stack, HOME tree, and modes as a named
backup in port 0–3, and `:n:name RESTORE` brings it back. The Files
tab's Backups section archives, restores, and deletes them. Tagged
objects can be typed as `:tag:obj`, and lists, programs, ▼ edit, and
`→STR` write them back in that form. ABORT shows "Program aborted"
and keeps the stack as it stood. `RND` and `TRNC` lift to
`RND(x,n)` / `TRNC(x,n)` on symbolic input, and the rounding family
folds a quoted number such as `` `3.7` FLOOR `` to a Real. Copying an
expression from the stack in a data plot mode adds a function trace
again. The Files tab reads HP text files (`.rpl` / `.txt`, with the
`%%HP:` header, T(3) codes, `@` comments, and `DIR … END`) as a
variable named after the file, and Export .rpl writes the current
directory back out in that format. Strings with `"` or `\` inside
now round-trip through lists, programs, and `→STR`. The History tab
keeps the session's last 10 errors, each with the command line that
raised it; clicking one recalls that command. Pasting calculator
source into the entry line converts `'X'`, T(3) codes, and `@`
comments the same way. Hovering a command name in the entry line shows
its one-line AUR description. Integers past 2^53 keep every digit in
symbolic form: typed literals, big Integer and Rational operands, exact
folds such as `` `2^70` EVAL ``, and `IBERNOULLI` results.

---

## v0.4.0 — 2026-09-21

Local models load in the desktop window: when Cache Storage is missing,
weights go through IndexedDB. The picker stays open after a failed load.
Qwen3.5 ids that WebLLM does not ship are replaced by Qwen2.5 Math 1.5B
and Qwen3 4B. `DIFFEQ` plots `dy/dx = f(x, y)`. `JORDAN` returns the
minimal polynomial, the characteristic polynomial, the tagged
characteristic spaces (a vector, or Jordan chains when the block
is longer), and the eigenvalues.

### Known limitations carried into v0.4.0

Giac still runs on the main thread.

---

## v0.3.10 — 2026-09-21

Single-step debugging is on the LCD. The status line shows SST or HLT,
left-shift ▼ runs SST, and the suspended program stays visible with the
next instruction marked.

### Test suite

**8,093** assertions.

### Known limitations carried into v0.3.10

`JORDAN`, main-thread CAS, and `DIFFEQ` plots remain pending.

---

## v0.3.9 — 2026-09-21

Commands are registered by family under `www/src/rpl/ops/`. The side
panel groups them from each command's category. Equation, matrix, and
graph share one editor tab.

### Test suite

**8,058** assertions.

### Known limitations carried into v0.3.9

`JORDAN`, step-debugger UI, main-thread CAS, and `DIFFEQ` plots remain
pending.

---

## v0.3.8 — 2026-09-01

Phone layout: keys stay tappable, shift labels no longer collide, the
side panel stacks under the calculator, and the home indicator is
respected.

### Test suite

**8,058** assertions.

### Known limitations carried into v0.3.8

`JORDAN`, step-debugger UI, main-thread CAS, and `DIFFEQ` plots remain
pending.

### Upgrade notes

No migration is required from v0.3.7.

---

## v0.3.7 — 2026-08-31

Command palette and a first mobile layout — the two biggest "can't ship
without this" UI holes.

### Command palette

`/` on an empty command line, or Ctrl/Cmd-K, opens a fuzzy command overlay
(`www/src/ui/command-palette.js`) over the calculator. Typing filters
`allOps()`, matched characters highlight, ↑↓ move the selection, Enter
runs the op (same path as a keypad press), Esc closes.

### Mobile

At `max-width: 720px` the side panel stacks under the calculator and keys
shrink. At `480px` the F-key row hides so the LCD and keypad fit a phone.

### Test suite

**8,058** assertions.

### Known limitations carried into v0.3.7

`JORDAN`, step-debugger UI, main-thread CAS, and `DIFFEQ` plots remain
pending.

### Upgrade notes

No migration is required from v0.3.6.

---

## v0.3.6 — 2026-08-31

Graph traces are editable; the matrix writer accepts paste and nested lists.

### Side panel

- **Graph.** Expression traces (y=f(x), polar, parametric) edit in place.
  Polar and parametric add auto-fits the view. Clicking a non-expression
  stack value no longer dumps unparseable text into the equation writer.
- **Matrix editor.** TSV paste grows the grid from the focused cell. Arrow
  keys move between cells. A list of lists (or list of vectors) loads as a
  matrix.

### Test suite

**8,032** assertions.

### Known limitations carried into v0.3.6

Same as v0.3.5: `JORDAN`, step-debugger UI, command-palette overlay,
main-thread CAS, `DIFFEQ` plots, no mobile layout.

### Upgrade notes

No migration is required from v0.3.5.

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

Giac is vendored at `www/vendor/giac/` as a prebuilt WebAssembly module
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
runs from cache without network after the first load.

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
