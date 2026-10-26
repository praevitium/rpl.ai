# Release Notes — rpl.ai

**Latest release:** v0.8.97 (2026-10-25)

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

## v0.8.97 — 2026-10-25

- Fixed: a program that was halted, waiting at a dialog (a PROMPT, an INPUT,
  a CHOOSE) or running when the page closed was gone at the next start with
  nothing said, and the stack was left as it had been in the middle of the
  run. The page now notes the program as it is hidden, and the next start
  says which program it was and what it was doing ("AREA was halted when the
  page closed and can't be continued", or "still running ... so it did not
  finish"), once, in a note that stays until a tap and shows even with
  pop-up notes off. A second window that is still open does not get it. Undo
  is on the note when the program's work can be taken back, and Reset
  everything ends a halted program first, so its reload leaves no note.
- Added: Run again on that note. The line that began a program, with the undo
  step it began at, is now kept on the program's record through CONT, and Run
  again takes the run back with Undo and enters the line again, so a program
  lost to the phone starts over in one tap; a line half typed meanwhile stays
  on the command line. A program that was still running gets Run again alone,
  when nothing was saved since it began. A run resumed after a halt, or one
  followed by something else that Undo can take back, gets the note only.

---

## v0.8.96 — 2026-10-25

- Fixed: Stop left a program parked when another had been started over a
  running one. The older program stayed paused with no timer to resume it, so
  the page stayed busy with no shield, and its banner went on saying Running
  while nothing ran. Stop now ends every program that is running, not only
  the newest.
- Added: a halted, stepped or paused program's local variables lead the VAR
  menu as keys marked with a dot, and head the Variables drawer. Tap one to
  put its value on the stack, ↰ stores level 1 into it and ↱ recalls it
  without running it, so a program's variables can be looked at and changed
  before Continue; a store from the command line refreshes the drawer. Before,
  a local could be reached only by typing its name.
- Changed: the halted banner (HALT, a step, PROMPT or a Pause) has a Variables
  key, an icon under 480 px, when the program has locals; it opens the VAR menu
  with them first and turns the soft keys on in minimal view.

---

## v0.8.95 — 2026-10-25

- Fixed: a program run from a variable's soft key, from a CST or user key or
  from a level's EVAL could not be stopped. Unlike a typed name it ran in one
  stretch, so the page froze for up to 10 seconds (a level's EVAL stopped at
  1,000,000 loop passes) with no Running banner and no Stop. They now pause
  in short stretches as a typed name does, with the banner, Stop and an Undo
  that takes the run back, and an error after a pause still names the program.
- Added: a Pause key on the Running banner halts the program where it is, as
  if a HALT stood there. The halted banner shows the program with its next
  word marked and Continue, Step, Step into and Stop, so a long run can be
  looked into without editing a HALT into it; the stack and variables can be
  looked at or changed before Continue. The key is an icon under 480 px.
- Changed: Stop from a paused program now gives the same Program stopped note
  with Undo as Stop while it runs, so Undo takes the whole run back; before,
  Stop from a halt left no note and Undo kept the partial result.

---

## v0.8.94 — 2026-10-25

- Fixed: the rest of a command line ran at once when the program it called
  halted. With a `HALT` in `FOO`, `10 FOO 1 +` left 11 on the stack, the 1 added
  to the 10 before `FOO` had finished. As on the HP, the rest of the line now
  waits for the program: the stack shows 10 at the HALT, and `CONT` (or `RUN`,
  `SST`, `SST↓`) finishes `FOO` and then adds the 1, giving 21. An error after a
  pause still names the program and the word that failed, and `KILL` drops the
  rest of the line with the program.
- Added: a long program no longer has to fit in 10 seconds. A program you start
  from the command line runs in short pauses where the page redraws and takes
  a press, and after about half a second a Running banner appears with the
  seconds it has run and a Stop key. Stop, the ON key, Esc and a phone's back
  button end the run where it is, as the HP's ON does; the stack stays as the
  program left it and Undo takes the run back. Nothing else takes a press until
  it ends, so a stray tap cannot start a second command on top of it. On a
  phone the banner is one row, the screen stays awake while it runs, and with
  the page in the background the program goes on in slower steps. A reload
  ends the run.
- Changed: the 10-second limit now applies only to what the page cannot pause: a
  command typed on its own, a program run from a menu, a plot or the
  assistant, and a program that `MAP`, `SEQ`, `DOLIST` or an algebraic calls. A
  loop there still stops after 1,000,000 passes. This replaces the README's
  "There is no ON key to break a running program" difference from the HP 50g.

---

## v0.8.93 — 2026-10-25

- Fixed: a program that called itself by name stopped with EVAL recursion too
  deep at about 85 levels, 128 without a local variable, because each level
  nested on the browser's call stack. Programs called by name now run on a
  stack of their own, so they go thousands of levels deep, as on the HP: a
  program that adds n to the sum below it gives 500500 for 1000. A runaway
  recursion still stops, in about half a second, IFERR, HALT and CONT, KILL
  and DBUG work through any depth as before, and the stack and local
  variables are left as they were. A recursive function called inside a
  formula (after DEFINE) still goes a few hundred levels deep, as before; this
  is listed under the differences from the HP 50g in the README.
- Added: eight more example programs, sixteen in all, in the Example programs
  sheet and command search: a letter grade with CASE, a divide that traps
  its error with IFERR, a reversed string, a list doubled with MAP, the sum
  of a number's digits, a row of Pascal's triangle, a leap-year test with
  IFTE, and Newton's square root with DO UNTIL. Each is checked against its
  sample calls in the tests, and Try runs it without storing it.
- Changed: a program that recurses without end shows a banner saying it
  called itself too many times and what to check, in place of the bare
  message EVAL recursion too deep.

---

## v0.8.92 — 2026-10-25

- Fixed: with the keypad hidden and the keyboard up, an error, PROMPT, INPUT
  or MSGBOX banner over a long line left the soft keys up to 37 px under the
  edge of a window 361 to 399 px tall, such as a small phone with its keyboard
  up. The app bar, the writer tabs and the soft keys now give way under a
  banner up to 400 px tall, as they already did under 330, and the key strip
  and the command line stay whole. Minimal view was not affected.
- Added: Move left and Move right in the menu a finger held on a CST key
  opens, so a phone can order its own menu (the keys a Catalog or Variables
  page added to CST) without typing a list. The first key has no Move left
  and the last no Move right; each move is one Undo step.
- Added: the note after adding, removing or moving a key in your menu has a
  Show button before Undo. It closes a drawer in the way and puts the soft
  keys on CST, turning them on in minimal view, since a phone with the keypad
  hidden has no CST key to find the menu with.

---

## v0.8.91 — 2026-10-25

- Fixed: Explain, or any long draft, in the Assistant on a landscape phone put
  the Send button under the bottom edge of the screen: 35 px at 360 px high,
  all of it at 320. A phone types in 16 px, which made the draft box's 14em
  limit 224 px; the box now stops at 30% of the window and scrolls. Found by a
  monkey that taps through the app at phone sizes.
- Added: Add to my menu in a variable's ⋯ menu in the Variables drawer (it
  reads Remove from my menu once the name is in CST), beside the Catalog's
  button for commands. A program, value, list or folder made on a phone
  becomes a CST key without typing `{ MYPROG } 'CST' STO`. As on the HP, its
  key runs a program, puts a value on the stack, or enters a folder, and a
  held finger offers Type, Recall and Remove from my menu.
- Fixed: with the keyboard up in a window under about 380 px tall (a 568 px
  phone, or a 740 px one with the keypad hidden), an error banner over an
  edited long line left the key strip up to 50 px under the edge. The command
  line now stops at four rows under a banner, and at two under 360 px, the
  rest scrolling, as it already did in landscape.

---

## v0.8.90 — 2026-10-25

- Fixed: with APPROX set, entering a formula that reads a stored list, vector
  or matrix past its end, such as `'L(5)'` with three entries in `L`, or calls
  a user function that fails, such as `'F(0)'` for `« → x « 1 x / » »`, failed
  on Enter with the error of evaluating it. APPROX works a formula with no
  free names out as it goes on the stack, and that failure was not caught.
  The formula now goes on the stack as typed, and EVAL reports the error as
  before. Found by fuzzing the array commands.
- Added: Add to my menu, a button on a command's page in the Catalog. It puts
  the command in CST, the list the CST key shows as soft keys, so a phone
  needs no `{ SIN COS } 'CST' STO`; the button reads Remove from my menu once
  the command is there, and follows CST when Undo or a program changes it. CST
  is changed where it lives (HOME, or the variable CST names), as one Undo
  step. Commands the app cannot run (IF, FOR) have no button.
- Added: a finger held on a CST soft key offers what the shift keys do, which
  the hidden keypad and minimal view have no keys for: Type and Recall for a
  plain key, as the VARS keys' held menu offers Store and Recall, or the
  shifted objects of a `{ "label" { action ⇦action ⇨action } }` item as
  before. Every key's held menu also has Remove from my menu, whatever the key
  holds. A held plain CST key did nothing before.

---

## v0.8.89 — 2026-10-25

This run read the examples and I/O tables in the AUR's command reference
against the app, one command at a time, which turned up the gaps below.

- Fixed: MAP did not go into a list inside the list. The AUR says MAP applies
  its program to the items of an inner list, and its example
  `{ 1 2 { 3 4 } } « →STR » MAP` gives `{ "1" "2" { "3" "4" } }`; the inner
  list was handed to the program whole.
- Added: indexed names. A stored list, vector or matrix is read in a formula
  as `A(3)` or `M(2,3)`, and `obj 'A(3)' STO` replaces that entry in place,
  as the AUR's STO entry describes. A local variable works as the index, so a
  FOR loop can read and store every entry. An index out of range is "Bad
  argument value"; a name holding anything else, or given the wrong number of
  indexes, stays symbolic as before.
- Fixed: RND and TRNC took numbers, complex numbers, units and lists but threw
  on a vector or matrix. Each rounds or truncates every entry, so
  `[ 2.34907 3.96351 2.73453 ] -2 RND` gives `[ 2.3 4. 2.7 ]`. TRUNC, a series
  command in the AUR, is unchanged.
- Changed: RDM drops or zero-fills entries to fit the new size, as the AUR
  lists, where it refused a size that held a different number of entries
  (a program that relied on that error now gets the redimensioned array). TRN,
  TRAN, RDM and CON take a variable name and store the result in it, and CON
  keeps a complex array complex.
- Fixed: COL-, ROW-, COL+, ROW+, CSWP and RSWP refused a vector. A vector
  takes a position to delete, insert or swap, as the AUR's tables list, and
  COL+ and ROW+ also put the columns or rows of a whole matrix into a matrix.
- Fixed: SUB refused a matrix and REPL a number as the place in one. Both take
  `{ row column }` or a count in row order, so
  `[[ 1 2 3 ][ 4 5 6 ]] { 1 2 } { 2 3 } SUB` gives `[[ 2 3 ][ 5 6 ]]`.
- Fixed: NEG of a binary integer threw "Bad argument type". It is its
  two's complement in the word size (`#1h NEG` is `#FFFFFFFFFFFFFFFFh` at 64
  bits). V→ of a complex number gives its two parts, r and the angle in polar
  mode, as the AUR lists.
- Fixed: Minimal view hides the writer tabs, and its menu reached neither
  writer short of command search. The menu on the status line now lists the
  Equation writer and the Matrix writer after Search commands, and a second
  tap on the open one carries it to the command line, as its tab does.

---

## v0.8.88 — 2026-10-25

- Fixed: a level or variable being edited came back from a reload as nothing
  when its command line had been emptied first (the text deleted, or ⌫ held),
  so the next value typed was pushed as a new level where it should have
  replaced the edited one. The kept line now holds the edit with no text, as
  it does with text, and Enter on it still ends the edit as before the
  reload. Found by the reload monkey.
- Added: Example programs, a sheet in the Help menu (the ⋯ menu on a phone,
  minimal view's menu too, and command search finds it). It lists the eight
  example programs laid out as EDIT lays a program out over lines, each with
  its sample call and two keys: Try runs the program on the stack with the
  sample's arguments and stores nothing, and Edit puts it on the command line,
  as a tap in command search does. On a short landscape window its intro line
  gives way so the first program and its keys fit.
- Changed: the note that stores an example now offers Try it, which runs the
  sample call by the program's name (`5 FAC`). A name already in use reads
  Replace FAC, then Replaced FAC, where it read Store as FAC, so it is clear
  that a variable is overwritten; Undo takes it back. Try with a line in
  progress adds the call to the line, with a note to press Enter, and does not
  run what was being typed.

---

## v0.8.87 — 2026-10-25

- Fixed: in the equation writer, `+/-` pressed twice took the negation off
  but left the cursor in the wrong place, so the next key typed into the
  wrong part of the formula, or, inside a function or an exponent, failed
  with an error. `2 × 3 +/- +/- 4` types `2*34`, and inside `EXP(...)` the
  cursor stays in the box it was in.
- Fixed: a second `=` or comparison typed in the same argument or group,
  even the same one (`x ≥ 1 + y ≥`), was accepted and then broke the cursor
  keys. It is refused as `x=3=4` already was: "Only one = or comparison fits
  in an expression".
- Fixed: a letter or digit typed after π, ∞ or i joined it into one name, so
  `2 π r` made the name `πr` where it should be 2·π·r. They multiply now;
  letters typed with the letter keys still join as before (`AB`, `x2`).
- Fixed: with a sum selected in the equation writer, typing a letter, digit,
  π or ½ gave `x + y*z`, the factor joining only the last term, where ×, ÷
  and ^ put the sum in a group. It is `(x + y)*z` now. A whole equation
  selected refuses a factor, as it already refused ÷ and ^, where × built
  `(x = y + 1)*2`, which could not be read back.
- Added: command search finds example programs, eight short RPL programs to
  learn from (factorial, Fibonacci, quadratic roots, Euclid's GCD, Collatz
  steps, an average, compound growth, the hypotenuse), by what they do or the
  loop they teach, and all of them with `example`. A tap puts the program on
  the command line (after what is there, and from either writer too), and the
  note's Store as FAC key stores it under its name, so `5 FAC` works at once
  without typing the quote. Each one is tested to give the answers its row
  shows.
- Changed: on a phone a title in command search longer than the row, such as
  "Greatest common divisor (EUC)" at 280 px, takes a second line, where an
  ellipsis cut it to "(E…" and hid the name.

---

## v0.8.86 — 2026-10-24

- Fixed: `i` in a formula was never worked out. `'3+4*i' →NUM` stayed
  `3+4*i`, `'ABS(3+4*i)' →NUM` stayed as typed and a matrix entry `i` stayed
  a name, while `π` and `e` folded to their numbers, though the AUR gives
  `i` as "the symbolic constant i or its numerical representation, (0, 1)".
  →NUM and EVAL under APPROX now work an expression holding `i` out with the
  commands themselves: `(3, 4)`, 5, `(2, 0)` for `'(1+i)*(1-i)'`. EXACT EVAL
  keeps `i` symbolic, and an expression with another unknown name in it stays
  as it is.
- Fixed: in the equation writer, a key typed in the empty box after a comma
  built a product with that empty box. In `MAX(x,` a `-`, `+/-`, π, i, ∞, ½,
  a group, EXP or a function key left "Incomplete Subexpression" where the
  same key in the first argument worked (digits and letters were the only
  keys that filled the box). They fill it now, so `MAX(x,-4)` and `MAX(x,π)`
  type as written, and so does a box reached with the arrow keys.
- Added: a comparison goes in a function's argument or a group in the
  equation writer: `IFTE(x<0,-x,x)`, `IFTE(x≤1,1,0)` and `2^(x<1)` type as
  written, with `<` then `=` making ≤ there as well. The `=` stays between
  the two sides of the whole formula, and says so when typed inside an
  argument ("An = goes between the two sides of the whole formula"); a second
  comparison in the same argument is still refused.
- Changed: the equation writer's formula and the matrix writer's grid fade at
  the edge they run on past when they are wider than the screen, as every
  other sideways scroller already did (the stack levels, the insight cards,
  the key strips). The caret and a focused cell scroll to clear of the fade.

## v0.8.85 — 2026-10-24

- Fixed: the equation writer could build an equation inside a formula, which
  could not be read back. With a factor selected, or the cursor moved back
  over it with ◀, pressing `=` or a comparison wrapped just that factor:
  typing 8B, selecting B and pressing `= 1` gave `8*(B = 1)`, and x² or 1/x
  on a selection holding the `=` gave `(3 - 0 = i)^2`. The level pushed that
  way could not be edited or typed back ("An equation cannot be an
  operand"). The `=` or comparison now ends the row as it does with the
  cursor after the factor (`8*B = 1`), and a power or fraction on a
  selection holding it is refused. Found by random key walks through the
  writer, each formula printed, parsed and compared.
- Added: the assistant's conversation survives a reload. What you asked, what
  it replied and what the model is sent (its tool calls included) are kept
  after each turn, so a phone that drops the page gives the conversation back
  at the next start with an "Earlier in this conversation" note, and the
  model goes on from it. The cards of what the assistant ran are not drawn
  again. The newest 60 turns that fit 120,000 characters are kept; ✱ New,
  connecting another endpoint and Reset everything forget it.
- Changed: when the equation writer refuses an `=` or comparison, it says
  where it goes ("An = or comparison goes between the two sides of the whole
  formula") instead of a bare "Invalid syntax", and a second kind of
  comparison says only one fits. Power and fraction keys on a whole equation
  say "That works on one side of the equation, not on the whole equation".

## v0.8.84 — 2026-10-24

- Fixed: a folder on the stack stopped the autosave. Fetching a folder with
  `RCL` (or `DIR`'s empty one) put it there, and from then on every save
  failed, with a banner that blamed full or blocked storage, so nothing done
  after it was kept: a reload brought back the state from before the folder
  arrived. A folder is saved like any other level now, with the folders in
  it, and the stack comes back whole.
- Fixed: Enter on an edit line you had emptied replaced the variable or level
  being edited with a copy of level 1. It now ends the edit and leaves the
  value as it was, with the usual note and Undo, and the Enter key says
  CANCEL while that is what it does. After a key has changed the stack (an
  operator on the edit's text, say) it still stores or replaces with level 1,
  and says STORE or REPLACE.
- Fixed: a variable being edited was stored in whichever folder you stood in
  when you pressed Enter, so leaving the folder mid-edit (a path row, a
  folder in the drawer) overwrote another folder's variable of the same
  name. It is stored in the folder the edit began in; from another folder the
  result, line or formula, stays on the stack with a note naming that folder.
- Added: UNDO and LASTARG survive a reload, as the HP keeps them through
  power-off. The last 20 steps (fewer when they are large) and LASTARG's
  arguments are kept as the page is hidden, and Undo takes them back after
  a phone has dropped the page. They come back only to the state they were
  kept with: a state saved since, or another window's changes taken up, start
  with none, and the taken-up state no longer lets Undo go back to what it
  replaced. Reset everything removes them, and a full browser store gives
  them up before it gives up any backup.
- Fixed: tapping a folder in the Variables drawer, or a path row there, with
  a line that fails opened the folder behind the drawer, where the error
  could not be seen. The line is entered first as before; when it fails the
  folder stays shut, the drawer closes and the error shows, as a folder's
  soft key leaves it.

## v0.8.83 — 2026-10-24

- Fixed: editing a level or a variable while the command line held text
  aimed the edit at the wrong place. The line is entered first, which pushes
  its values over the level you picked, but the edit kept the old level
  number: the pencil named the wrong level, and Enter pushed the edited value
  as a new level beside the original instead of replacing it. A variable
  stored by that line showed its old value in the editor. The edit now
  follows the value to where it is, shows the variable as it is now, and
  says "That level is gone, so there is nothing to edit." (or the
  variable's name) when the line took it away.
- Added: the table of values keeps its start and step. Typed values, ÷2 and
  ×2 are kept for the next opening and through a reload, with the plot (or
  alone, for a formula's table with nothing plotted); paging does not change
  them. An Auto key shows while they differ from the round pair the plot
  window gives, and brings that pair back.
- Fixed: on a phone, typing a start and then tapping the step field closed
  the keyboard and left the tap on nothing, and a first tap on ÷2, ×2 or a
  value while a typed start was still in its field was lost, because the
  sheet was rebuilt under the finger. A typed start or step now changes the
  values in place and leaves the fields and keys alone.

## v0.8.82 — 2026-10-24

- Fixed: `%(x,y)`, `%T(x,y)` and `%CH(x,y)`, the forms the AUR gives for
  symbolic arguments, said "Invalid algebraic" when typed in a formula, and
  `'X' 5 %` left the expanded `X*5/100` where the 50g leaves `'%(X,5)'`. They
  are read and printed as typed now, and evaluate to what the commands give
  once their arguments are numbers: `'%CH(40,50)'` EVAL is 25, and a call
  with a zero base, where `%T` and `%CH` divide by zero, stays as written.
  The CAS is handed the formula written out, and copying as LaTeX and
  pasting it back into the equation writer keeps them.
- Added: a level or variable being edited survives a reload. The text comes
  back in the command line or the writer with the edit still on it, and Enter
  puts it back where it began. When that level or variable has changed
  meanwhile, in another window or by a program, the text comes back as a
  plain line instead, so a stale edit never overwrites the newer value. It is
  saved with the line, after a pause in typing and as the page is hidden, and
  forgotten when the edit ends or is cancelled.
- Improved: the soft keys come back on the menu, folder and page they were
  left on. A reload used to bring the menu back on its first page and outside
  any folder, so the 19th variable in VARS, UNITS > LENG's third page or
  CAS > ALG's second had to be found again. The menu, its folder and its
  page are saved as the page is hidden or closed, a menu a program put up
  with TMENU excepted, and a saved page past the last one, in a directory
  with fewer variables now, shows the last page.

## v0.8.81 — 2026-10-24

- Fixed: the lines you had entered were forgotten at a reload, so the
  History drawer, the held Enter's last command lines and the Up key started
  empty, where the HP keeps its last command lines through power-off. The
  last 100 lines, up to 100,000 characters, come back in order, and Reset
  everything forgets them.
- Added: the formula or matrix you were writing survives a reload with the
  line. The equation or matrix writer reopens where it was, filled in, a
  formula without its undo steps; a writer that cannot be put back is closed
  and the start goes on. It is saved as the page is hidden or closed and
  forgotten when the writer closes, like the line; one over 100,000
  characters is left out, and a level or variable being edited is still not
  kept.
- Improved: the plot comes back after a reload. Its formulas, with their
  colours and which of them are shown, and its window are kept, and a plot
  drawer that was open reopens on them, where it opened empty. Plotted data
  and fits come from ΣDAT or the stack and are not kept. A change is saved
  a moment after it is drawn and as the page is hidden, and Reset
  everything forgets the plot.

## v0.8.80 — 2026-10-24

- Fixed: `D→R(X)` and `R→D(X)`, which `'X' D→R` leaves on the stack, could
  not be read back. Edit then Enter said "Invalid algebraic", and so did
  typing `'D→R(180)'`, because the arrow ended the name. A call may have an
  arrow in its name now; a bare `A→B` is still no name.
- Fixed: `STMXE`'s exponent range and `→NDISP`'s line count were forgotten
  at a reload, where `→HEADER` and `→KEYTIME` were kept. A reload brings
  them back; a save from before them loads with 499 and 9.
- Added: a command line you typed but did not enter survives a reload, as
  the HP keeps its line through power-off. A phone that drops the page while
  another app has the screen, or a browser that restarts, gives the line
  back at the next start with the cursor where it was, and without raising
  the keyboard. It is saved after a pause in typing and as the page is
  hidden or closed, forgotten at once when the line is entered or cleared,
  and a shared link or a shortcut that fills the line still wins. A level or
  variable being edited, a program's `INPUT` answer and a line over 100,000
  characters are not kept, and Reset everything forgets it.
- Improved: Escape and a phone's back button go up one level in the
  Equation Library, as its Back button does: a set's form returns to the
  set, then the subject's sets, then the subjects, and the next press
  closes the sheet. Close and a tap beside the sheet still close it at once.

## v0.8.79 — 2026-10-24

- Fixed: a complex number with an infinite part came back wrong from a
  save. `(1E300,1E300) SQ` shows `(-∞, ∞)`, and after the autosave, a
  reload, a backup or a shared link it was `(-∞, -∞)`: JSON has no infinity,
  so the part was written as nothing and read back as minus infinity or
  zero. It is written as a word now, in lists, vectors and matrices too, and
  `(∞, 1)` reads back as typed, so a level that overflowed can be edited and
  pasted. A figure past a double (`(1E400, 0)`) or a fraction over zero is
  still no complex part.
- Fixed: a whole complex part of 13 digits or more printed as JavaScript
  writes it, `(1e+21, 5)` or `(123456789012000000, 1)`; it shows as a real
  does, `(1.E21, 5)` and `(1.23456789012E17, 1)`.
- Added: the Equation Library's Solve opens a set as a form. Pick a set and
  tap Solve: a box for each name, the set's constants already in, and Solve
  beside each name. Type what you know and tap Solve beside the one to find;
  the equations are searched as `MROOT` does, so a name that needs another
  found first gets it on the way and says so (`Found P = 12, with V = 6 on
  the way`), and one short of values lists the boxes to fill. Back returns
  to the set. A set of 29 names scrolls with its note held at the bottom,
  and 3 or more equations sit behind a heading. `SOLVEQN` and `MSOLVR` still
  put up the HP's soft keys.
- Improved: command search finds the Equation Library as Equation Library,
  physics, engineering or library; the sheet's Back has the arrow the
  reference pages' Back has, where it had the backspace key's; and in Solve equation
  the names, boxes and Solve keys line up in three columns however long a
  name is.

## v0.8.78 — 2026-10-24

- Fixed: a long symbolic sum stopped the stack from drawing and, once the
  session was saved, kept the app from starting. A loop that adds `SIN(I)`
  in exact mode builds a sum nested one level to the left per term, and
  printing it recursed once per term: at about 3,000 terms the page ran out
  of stack, no level drew, and after a reload the autosaved stack left the
  page blank. A chain of sums, differences, products and quotients now prints
  and draws in a loop: 40,000 terms print in full and 20,000 draw as one
  scrolling line. An expression nested past what the page can walk at all
  shows as `(too large to show)`, each part of the first draw runs on its own
  so one that fails no longer leaves the app unstarted, and a command that
  runs out of room says Insufficient memory where it showed "Maximum call
  stack size exceeded". Past about 5,000 terms the autosave cannot write the
  value, and its note says so where it blamed full or blocked storage.
- Added: Solve equation, the HP's Solve application on a phone. A formula's
  menu has Solve numerically… (and a SOLVR soft key), and command search has
  Solve equation, which takes level 1 or the formula in EQ. The sheet shows
  the formula and a box for each name in it, holding that variable; type the
  names you know and tap Solve beside the one to find. It searches from the
  number in that box (1 when blank) with ROOT, says whether it found a zero
  or only the closest point, and a name tapped goes on the stack. Typed values
  are stored as they are entered, and Undo takes the lot back.
- Improved: Settings › Data says whether the browser will keep the
  calculator's memory, which a browser may clear when the device runs low on
  space and Safari after a week without a visit, and has a button to ask it
  to. An installed app asks as it starts.

## v0.8.77 — 2026-10-24

- Fixed: a long integer on the stack made every key slow. Printing a
  million digits takes half a second, and the stack printed each one again on
  every redraw and the autosave once more. The last four long integers now
  keep their text: with five copies of `100000 FACT` on the stack a key takes
  50 ms where it took 1.1 s, and with one 90 ms where it took 0.6 s.
- Improved: the digit count under a long number is a button; tap it to open
  VIEW with every digit, where it was a label and VIEW took selecting the
  level first.
- Improved: a fraction with a part of 120 digits or more is shortened as a
  whole number is, each long part to its first 36 and last 12 digits with
  both counts, `1/402387260077…000000000000` over `2,568 digits` for
  `1 1000 FACT /`.

## v0.8.76 — 2026-10-24

- Fixed: a command given a huge count or size could run until the page
  froze. COMB and PERM took minutes, `100000 FACT` four seconds, BINS built
  an array of a billion bins, and a matrix of integers raised to a huge power
  squared its entries past anything that could be stopped. COMB counts the
  shorter side, so `100000 100000 COMB` is 1 at once; FACT and GAMMA of an
  integer multiply in halves, which takes `100000 FACT` 60 ms; COMB and PERM
  stop at the time limit; and a result past a million digits or entries says
  Insufficient memory: `300000 FACT`, `1000000000 GAMMA`, a million bins, a
  matrix power whose entries pass half a million digits. A timing run of
  every command against counts from a thousand to four billion and integers
  of 30 to 70 digits found no other call that cannot be stopped; FACTORS,
  DIVIS and EULER of a 70-digit number still run to the 10-second limit.
- Fixed: HERMITE, LEGENDRE and TCHEBYCHEFF worked in doubles, so a
  coefficient past 2^53 came out rounded, `30 HERMITE` giving
  `164850350674673660000*X^16` for 164850350674673664000, and LEGENDRE came
  out as decimals, `660.1943359375*X^12`. The coefficients are exact whole
  numbers, and `4 LEGENDRE` is `(35*X^4-30*X^2+3)/8`, as the AUR shows. A
  degree over 1000 says Insufficient memory.
- Improved: an Insufficient memory error has a banner of its own naming the
  command and the limits, with its reference and Explain, where it showed
  the bare message.
- Added: a whole number of 120 digits or more shows its first 36 and last 12
  digits and how many it has on the stack, `402387260077…000000000000` over
  `2,568 digits` for `1000 FACT`, where a phone showed a 2,330 px wall of
  the number's own trailing zeros. VIEW, Copy, Edit and the command line
  still have every digit.

## v0.8.75 — 2026-10-24

- Fixed: GAMMA and FACT of a fraction from 142 up came back as ∞ where the
  value fits a double: `150.5 GAMMA` is 4.6610726271E261 and `170.5 FACT`
  9.48336756682E307. Past 171.625 a double cannot hold Γ, and ∞ is still
  the answer.
- Fixed: a huge value sent to ERF, ERFC, ZETA, UTPC, NDUPN or an exact
  integer power showed JavaScript's own message ("Real() does not accept
  NaN", "Invalid array length", "Maximum BigInt size exceeded"). ERF and
  ERFC now give ±1 and 0 or 2 for a huge argument, ZETA 1, and the rest say
  Bad argument value or Insufficient memory, as the HP does when an object
  will not fit: a million copies for NDUPN, a million digits for an
  integer or fraction power, which keeps `2 1000000000 ^` and
  `1/3 100000000 ^` from freezing the page.
- Fixed: a number or a list inside LOCAL's list said "startsWith is not a
  function"; it says Bad argument value, as a name without a ← does.
- Added: the table of values has Copy, and Share where the browser can, in
  its header. They hand on a heading row, then x and each function's value
  at 12 digits, blank where a function has none, as cells a spreadsheet
  pastes.
- Improved: a formula's soft keys carry TABLE after PLOT, so its table of
  values is one tap from the level as well as in its ⋯ menu.

## v0.8.74 — 2026-10-24

- Fixed: a minus that starts a product or quotient printed in brackets, so
  `'-X*Y'` came back from the stack as `(-X)*Y`, `'-2*X'` as `(-2)*X` and a
  Giac result as `(-4)*P^3 + 27*Q^2`. It now prints as typed, `-X*Y`, `-2*X`
  and `-4*P^3 + 27*Q^2`, in the same places where a minus can start the text
  (the whole expression, an argument, the inside of brackets). After an
  operator or under a power the brackets stay, as in `X*(-Y)` and `(-X)^2`.
- Added: a formula on the stack opens its table of values from its ⋯ menu,
  with no plot drawn. A list of formulas gets a column each, the x column is
  named after the formula's own variable (T for `T^2-3*T+2`, and a formula in
  A alone is tabulated in A), and a name with no value says so.
- Improved: the table of values fits a phone better. Its paging keys sit with
  the step keys, so the sheet has no footer: a 280 px screen shows 9 rows
  where it showed 7 and a landscape phone 5 where it showed 2. A short window
  drops the hint under the table.

## v0.8.73 — 2026-10-23

- Added: a table of values for the plot, the HP's TABLE. The table button
  among the plot's tools, or `V` on the plot, opens a sheet of x from a
  start by a step with a column for each function plotted, opening on a round
  start at the window's left edge. Type another start or step, halve or
  double the step, or move Earlier and Later by 30 rows; a tap on a value puts
  its point, (x,y), on the stack, and a tap on x the number alone. A function
  with no value at an x shows a dash. The header stays while the rows scroll,
  and columns that run past a narrow screen fade at the edge.
- Fixed: CAS results wrote a product with its numbers last, `A*2*X` for the
  derivative of `A*X^2` and `B*3*COS(3*X)` for that of `B*SIN(3*X)`. A
  product now reads with its numbers first, `2*A*X` and `3*B*COS(3*X)`; only
  literal numbers move, and the other factors keep their order.
- Improved: the plot's window fields and the table's start and step ask for
  the phone's usual keyboard. An iPhone's decimal pad has no minus sign, so a
  negative bound or start could not be typed there; their Enter key now says
  Done.

## v0.8.72 — 2026-10-23

- Fixed: the arrow keys through the completion list broke on a command whose
  name ends in a symbol, such as `STO*`, `STO+` or `ΣX^2`. The list closed
  under the line, reopened empty, and the next press failed with a script
  error. It now stays open on those names and steps through them, and ↑ and ↓
  do nothing when no list is showing.
- Improved: the commands that work in VX (DERVX, INTVX, SOLVEVX, SIGMAVX and
  the rest) take its capital too, since the 50g's X is the one its alpha keys
  type. `` `A*X^2` DERVX `` differentiates by X where it gave 0, `` `A*X^2` INTVX ``
  gives `A*X^3/3` where it gave `A*X^2*x`, and `` `X^2-A` SOLVEVX `` solves
  where it returned an empty list. An expression that has VX (x) still uses it.
- Improved: the equation writer's text view, and the check on text pasted
  into the writer, read `x²+½` and `30°` as the command line does. They were
  marked bad, and the formula stopped at the symbol.

## v0.8.71 — 2026-10-23

- Fixed: Plot on an equation drew nothing. It now plots by the equation's
  form, as the 50g's PLOT does: `expr = expr` draws each side as a trace of
  its own, so `'X^2=4'` shows the parabola and the line 4 crossing where the
  sides are equal; `name = expr` draws only the expression, so `'Y=2*X'`
  is the line 2X; and `indep = constant` draws a vertical line, `'X=3'`.
  A name before the `=` no longer draws a "has no value" note, and a
  vertical line leaves the plot's height alone.
- Added: the equation writer reads a phone's long-press keys as the command
  line does. `x³`, `x¹⁰` and `x⁻¹` are powers (superscripts typed in a row
  are one exponent and one undo step, and after a unit they are its power,
  `5_m²`), `½` and the other fractions are fractions, `1½` a mixed number,
  and `30°` or `20°C` the angle or temperature unit. Text pasted into the
  writer reads them the same way. Before, ³, ½ and ° were refused with "can't
  go in an equation" or "not available".
- Improved: a list's level menu offers Sort (SORT) only when SORT can
  order it, so a mixed list no longer offers a row that ends in an error,
  and Differentiate by and Integrate by pick x, then t, then θ before the
  first name, so `'A*T^2+V*T'` differentiates by T and not A.

## v0.8.70 — 2026-10-23

- Fixed: with an error or halt banner over the matrix or equation writer
  in a short landscape window, the soft keys fell off the bottom (24 px
  at 844x360, 62 px at 667x375, and with the keypad hidden at every
  width). The banner is now one row with its fixes beside the message,
  and the writer's tabs wait while it shows.
- Added: a phone's long-press and symbol keys read as the HP writes them.
  `5²` gives 25, `2¹⁰` 1024 and `'X²+1'` is `X^2+1` (`X²` was a name of
  its own); `½` is the exact fraction 1/2 and `1½` the mixed number 3/2;
  `30°` and `20°C` are the angle and temperature units; `·`, `∕` and `–`
  read as `*`, `/` and `-`, and `!=` as `≠`.
- Improved: a banner over an open writer sits 4 px tighter, which keeps
  the Classic look's soft keys on screen from 740 px wide up.

## v0.8.69 — 2026-10-23

- Fixed: an error inside `IF`, `CASE`, `WHILE`, `DO`, `START`, `FOR`, a `→`
  program or a string run by `STR→` blamed the wrong command, with banners
  such as "EVAL/STR→ needs one value; the stack has one value". The banner
  now names the structure or the command that failed and counts the stack
  it saw; a string that fails partway leaves what it made and the failed
  command's arguments, as a program does, rather than putting itself back.
- Added: Plot on a level whose formula has one open name that is not X,
  such as `Y^2-3*Y+2`, draws it along that name, as the equation writer
  does, and a note says which name took X's place; a list of formulas or
  a tagged one follows suit.
- Improved: a menu taller than the window, such as a formula's 24-row
  level menu on a phone, fades at the edge that has more rows, as the
  command line's suggestion list does.

## v0.8.68 — 2026-10-23

- Fixed: a plot left every name but its variable undefined, so after
  `2 'A' STO` plotting `A*X^2` showed an empty grid; as on the HP, a name
  now takes the number its variable holds.
- Added: an algebraic level's menu offers Integrate by its main variable
  (RISCH) beside Differentiate by, so `Y^2-3*Y+2` gives
  `Y^3/3-3*Y^2/2+2*Y` with one tap, with Undo.
- Improved: a function plot whose formula holds a name with no number
  says which one to store, where it showed a blank grid without a word.

## v0.8.67 — 2026-10-23

- Fixed: MAXR and MINR counted as a formula's unknowns, so `MAXR-X`
  offered Solve for MAXR in its level menu; they are constants now, as
  π, e and i are, in the level menu and the equation writer alike.
- Added: an algebraic level's menu offers Differentiate by its main
  variable (DERIV), X when the formula has one, so `X^3+2*X` gives
  `3*X^2+2` with one tap, with Undo.
- Improved: a selected formula's soft keys keep EVAL, with PLOT after
  it, as its menu offers both; PLOT had taken EVAL's place.

## v0.8.66 — 2026-10-23

- Fixed: OBJ→ on an algebraic put its function before a count of n+1,
  so `'X+1'` gave X 1 + 3; it now gives the arguments, their count and
  then the function on level 1, as the AUR has it: X 1 2 +.
- Added: an algebraic level's menu offers Solve for each of its first
  three unknowns (SOLVE), so `X^2-5*X+6=0` gives `{ X=2 X=3 }` with one
  tap, with Undo.
- Improved: a level's Type and size note (INFO) leads with the type
  name its menu's heading uses, then a size for a list, vector or
  matrix: List · 3 items, Matrix · 2×2.

## v0.8.65 — 2026-10-22

- Fixed: with the phone keyboard up, a name the Backups field refused
  was explained in a note under the keyboard, leaving only the field's
  red edge in sight; the note now scrolls into view above the keyboard.
- Added: an algebraic level's menu offers Expand (EXPAND) and Factor
  (FACTOR), the HP's everyday ALG rewrites, with Undo.
- Improved: a selected level's soft keys offer OBJ→ wherever its menu
  offers Take apart, as they offer B→R and CONV.

## v0.8.64 — 2026-10-22

- Fixed: in a 280 px Variables drawer a backup's save time was cut after
  the hour, as “10/23/26, 12:…”; the date and the time now each stay
  whole, the time moving to its own line when the row is narrow.
- Added: a list, array, complex number, tagged or unit object, program or
  algebraic offers Take apart (OBJ→) in its level menu, with Undo.
- Improved: the Backups name field reads names as the Store and New
  folder boxes do: an empty field does nothing, quotes are dropped, and a
  refused name is explained under the field instead of in a toast.

## v0.8.63 — 2026-10-22

- Fixed: with the phone keyboard up, the Variables drawer's New folder
  box put its refusal note over its own field, refused an empty name as
  “”, and refused a quoted name; it now reads names as the Store box
  does, quotes optional, an empty field doing nothing, and says why it
  refuses one under the field.
- Added: a quoted name's level menu offers Purge its variable (PURGE)
  when the variable is in this folder, with Undo to bring it back.
- Improved: a name the Variables drawer's Rename refuses stays in its
  field, marked and selected, for another try, where the field closed and
  lost what was typed; quotes around a name are dropped there too.

## v0.8.62 — 2026-10-22

- Fixed: a level menu's Store in a variable… box stored under any text,
  so `1A`, `X Y`, `SIN` or an empty field became a variable that no name
  typed on the command line could reach; it now takes only the names STO
  takes, and quotes around a name (`'R1'`) are dropped.
- Added: a quoted name's level menu offers Recall its value (RCL) when
  its variable exists, and on level 1 Store level 2 in it (STO), as the
  HP does with a name on the stack.
- Improved: the Store box says why it refuses a name under its field,
  where an error note covered the box's heading, or its field in
  landscape, with the phone keyboard up.

## v0.8.61 — 2026-10-22

- Fixed: on a 280 px phone a level menu cut Copy into the command line
  (ECHO) and Push the level number (LEVEL) short, losing the command name,
  and a touch screen has no hover title to read it from; menu rows now
  wrap on touch.
- Added: a level's menu offers Drop the tag (DTAG) on a tagged object,
  Drop the unit (UVAL) on a unit object and To a real number (B→R) on a
  binary integer, where To a number (→NUM) gave `#255d` back unchanged.
- Improved: a selected binary integer's soft keys show B→R in place of
  →NUM, as its menu does.

## v0.8.60 — 2026-10-21

- Fixed: in exact mode D→R of an integer or fraction of degrees gave an
  unevaluable `D→R(90)`; it now gives the exact multiple of π, as the AUR's
  (π/180)x: `90 D→R` is `π/2`, and a list of degrees converts entry by
  entry.
- Fixed: R→D of an exact multiple of π stayed `R→D(π/2)`; it now gives the
  exact degrees, so `π/2` R→D is 90 and D→R and R→D round-trip. A real
  argument still gives a real.

## v0.8.59 — 2026-10-21

- Fixed: ARG said Bad argument type on a fraction while RE, IM, CONJ and
  ABS took it; `-3/4 ARG` now gives π in radians, as `-0.75 ARG` does.
- Added: a vector level's menu offers Length (ABS), the HP's norm of an
  array, so `[ 3 4 ]` gives 5.
- Improved: a level's menu heading names the kind of object it acts on,
  such as "Level 2 · Fraction", as its INFO note does.

## v0.8.58 — 2026-10-21

- Fixed: SORT said Bad argument type on a list holding a fraction; fractions
  now sort by value among the other numbers, so `{ 1/2 1/3 0.4 } SORT`
  gives `{ 1/3 0.4 1/2 }`.
- Added: a string level's menu offers "Run its text (STR→)" in place of
  "Evaluate (EVAL)", which gives a string back unchanged on the HP, so
  `"1 2 +"` becomes 3.
- Improved: the interactive stack's soft keys show STR→ on a string, as its
  menu does.

## v0.8.57 — 2026-10-21

- Fixed: with approximate mode on, INV of a matrix holding fractions said
  Bad argument type; it now gives the decimal inverse, so
  `[[ 1 2 ][ 3 4 ]] INV -105 SF INV` returns `[[ 1. 2. ][ 3. 4. ]]`.
- Added: a list of two or more items offers Sort (SORT), Reverse (REVLIST)
  and Sum (ΣLIST) in its level menu, as the HP's LIST menu does.
- Improved: with the keyboard in a menu, a typed letter moves to the next
  item starting with it, as a CHOOSE list already does, so a long level
  menu needs no scrolling.

## v0.8.56 — 2026-10-21

- Fixed: INV and RREF refused a matrix with complex entries, which the HP
  inverts and reduces: `[[ (1,1) 2 ][ 3 4 ]] INV` now gives
  `[[ (-0.4, -0.8) (0.2, 0.4) ][ (0.3, 0.6) (0.1, -0.3) ]]`, and RREF and
  RANK work on such a matrix too.
- Added: in exact mode RANK counts on exact fractions, where the decimal
  reduction could lose a pivot to rounding:
  `[[ 100000000000000001 100000000000000000 ][ 100000000000000000 99999999999999999 ]] RANK`
  now gives 2, not 1.
- Fixed: TYPE, VTYPE, TVARS and a level's INFO note gave a fraction -1, a
  code the HP has no object for. The HP holds an exact 3/4 as an
  algebraic, so it now reports 9.

## v0.8.55 — 2026-10-21

- Fixed: in exact mode, RREF of an integer matrix gave decimals, where the
  HP keeps integers and fractions: `[[ 2 1 5 ][ 1 3 10 ]] RREF` now gives
  `[[ 1 0 1 ][ 0 1 3 ]]`. RREF and INV share one exact row reduction; a
  real entry, or approximate mode, keeps the decimal one.
- Added: a matrix level's menu offers "Row reduce (RREF)" beside
  Transpose, square or not.
- Improved: the interactive stack's soft keys show →Q on a decimal, where
  →NUM left it as it was, as the level's menu does.

## v0.8.54 — 2026-10-21

- Fixed: in exact mode, INV of an integer matrix gave decimals, where the
  HP gives fractions, and refused a matrix of fractions outright:
  `[[ 1 2 ][ 3 4 ]] INV` now gives `[[ -2 1 ][ 3/2 -1/2 ]]`, and INV twice
  gives the matrix back. An array divided by such a matrix stays exact
  too (`[ 5 10 ] [[ 2 1 ][ 1 3 ]] /` gives `[ 1 3 ]`, not `[ 1. 3. ]`). A
  real entry, or approximate mode, keeps the decimal inverse.
- Added: a stack level holding a decimal offers "To a fraction (→Q)" in
  its menu, so .75 becomes '3/4', as the HP's →Q does.
- Improved: a decimal's level menu no longer offers "To a number (→NUM)",
  which leaves a decimal as it is; →Q takes its place.

## v0.8.53 — 2026-10-21

- Fixed: an error naming a unit argument said "an unit object", as in
  "+ can't combine an integer with an unit object". It now says "a unit
  object".
- Added: a folder with something in it offers "Delete with its items
  (PGDIR)" in its menu in the Variables drawer, with Undo, as the HP's
  PGDIR purges a directory and everything inside. Delete used to refuse
  and say to empty the folder first.
- Improved: a variable row's tooltip names Delete, which purges it,
  beside Shift+Enter and Alt+Enter.

## v0.8.52 — 2026-10-21

- Fixed: an arrow key pressed with the keyboard on the tools rail (or a
  drawer's tabs on a phone) reached the stack: → swapped levels 1 and 2
  and ↓ took level 1 into the command line. The arrow keys, Home and End
  now move between the rail's buttons.
- Added: with a stack level selected, the keyboard's menu key or
  Shift+F10 opens the level's menu, as a right click or a held finger
  does, with ECHO, PICK, ROLL, ROLLD, →LIST, DUPN, DRPN, KEEP, LEVEL and
  INFO.
- Improved: a level's More actions button names its key, Shift+F10, as
  the Edit and Drop buttons beside it name theirs.

## v0.8.51 — 2026-10-21

- Fixed: keys pressed on a row of the Variables, History or Catalog
  drawer reached the stack: ↓ took level 1 into the command line, → swapped
  levels 1 and 2 and ⌫ dropped a selected level. The arrow keys, Home and
  End now move between the list's rows.
- Added: Delete (or ⌫) on a variable in the Variables drawer purges it,
  as PURGE does, with Undo; on a History entry it removes the entry.
- Improved: Home and End in a menu, such as a stack level's, go to its
  first and last item, as in any menu.

## v0.8.50 — 2026-10-21

- Fixed: choosing a theme, text size, layout or switch in Settings with
  the keyboard redrew the sheet and dropped the focus, so the next Tab
  started again from the top. The keyboard now stays on the control it
  was on.
- Added: with a stack level selected, Home moves the interactive stack's
  pointer to the top level and End to level 1, however deep the stack.
  With text on the command line, Home and End still move the cursor.
- Improved: each row of choices in Settings is one Tab stop, on the
  chosen option, and the arrow keys pick the next or previous choice, as
  in any radio group, where Tab used to stop on every option.

## v0.8.49 — 2026-10-21

- Fixed: Ctrl+A (⌘A on a Mac) in the equation writer selected the whole
  page, so Ctrl+C then copied the page's text and Ctrl+X cut nothing. It
  now selects the whole formula, as Shift+↑ does, for Ctrl+C, Ctrl+X and
  typing over.
- Added: Shift+Enter on a selected stack level copies it into the command
  line, as the interactive stack's ECHO key does, so a level can join a
  line being typed. With no level selected, Shift+Enter still starts a new
  line. The level's menu and the ECHO soft key name the key.
- Improved: the writers' hint rows name the new keys: Ctrl+A in the
  equation writer, and in the matrix writer that Enter stores the cell
  before it pushes and Esc puts the cell back before it cancels.

## v0.8.48 — 2026-10-21

- Fixed: after a tap or click on the plot, the readout showed the raw
  point, x = 2.46 and y = -5.65313, while the ↵ button and Enter put
  (2.5, -5.7) on the stack. The readout now reads the point at its pixel,
  as the HP's cursor does and as the button and Enter push it.
- Added: in Trace mode, a tap or click on another curve traces that
  function, the touch twin of ↑ and ↓; a tap away from every curve keeps
  the one traced and moves along it.
- Improved: the Picture tools that a tap on the plot brings up no longer
  squash the plot and move the tapped point (by 30 px on a desktop); they
  take their room from the bottom of the plot at the same scale.

## v0.8.47 — 2026-10-21

- Fixed: Esc in the matrix writer, while a cell was being typed, put the
  whole matrix away (Undo brought it back). As the HP's CANCEL first drops
  the entry being typed, Esc, or a phone's back button, now puts back what
  the cell held and keeps the writer open; the next Esc puts it away.
- Added: the HP MatrixWriter's GO↓ key, on the matrix writer's menu. With
  it on, Enter after typing a cell moves down the column rather than to
  the right, so 1 Enter 2 Enter 3 Enter Enter enters the column
  [[ 1 ][ 2 ][ 3 ]]. Off, Enter moves right, as GO→ does.
- Improved: in the matrix writer, Ctrl+Home (⌘Home on a Mac) goes to the
  first cell and Ctrl+End to the last one filled, as in Excel, Numbers and
  Google Sheets. Home and End alone still move within the cell.

## v0.8.46 — 2026-10-21

- Fixed: Esc in the drawer, with nothing in its search box to clear,
  cleared the command line, out of sight behind a drawer over the stack.
  Esc now leaves the drawer first: it closes a drawer over the stack, or
  takes the keyboard back to the command line from one docked beside it,
  and the line keeps what you typed.
- Fixed: closing the drawer with ⌘\ (Ctrl+\) or its close button left the
  keyboard on nothing when it had been in the drawer. The command line
  gets it back, as it does when a sheet closes; on a touch screen, where
  that would raise the keyboard, nothing changes.
- Added: Space on a selected stack level shows it full size, as the
  interactive stack's VIEW key does and as Quick Look does on a Mac. With
  text on the command line Space still types a space. The level's menu and
  the VIEW soft key name the key.
- Improved: a right click on a stack level opens its menu, as holding a
  finger on it does and as a right click on a key already did. With text
  selected in the stack, the browser's own menu still comes up to copy it.

## v0.8.45 — 2026-10-21

- Fixed: in Trace mode, Enter pushed the point rounded to the cursor's
  pixel, so tracing SIN at x = 0.75 put (0.8, 0.7) on the stack, off the
  curve and unlike the readout. It now pushes the traced point as the
  readout shows it; the free cursor still rounds to its pixel.
- Added: with several functions plotted, ↑ and ↓ in Trace mode move the
  trace to the previous or next one, as the HP 50g's arrow keys do in
  TRACE. With one function they pan the view as before.
- Improved: tracing several functions, the readout marks the one Enter
  and the FCN tools work on with ▸.

## v0.8.44 — 2026-10-21

- Fixed: closing Settings, Keyboard shortcuts, About or another sheet
  with Esc left the keyboard focused on nothing. A sheet now gives the
  focus back to whatever had it, such as the command line, and Keyboard
  shortcuts, which has no field, puts the focus on its Close button when
  it opens.
- Added: on a variable in the Variables drawer, Shift+Enter stores level
  1 in it and Alt+Enter (⌥Enter on a Mac) recalls it without running it,
  as the HP's left- and right-shifted VAR keys do and as Shift+F1 and
  Alt+F1 already did on the soft keys. Enter still runs it or puts it on
  the stack.
- Improved: a variable's tooltip in the Variables drawer reads as its VAR
  soft key's does and names those keys, where it said only "click to put
  on the stack".

## v0.8.43 — 2026-10-21

- Fixed: Enter in the Catalog's search box opens the first match's page,
  but the page replaced the search box and left the keyboard focused on
  nothing. The page's Run (or Insert) button now takes the focus, so a
  second Enter runs the command.
- Added: on an empty command line with no level selected, Ctrl+C (⌘C on a
  Mac) copies level 1, so a result goes to a spreadsheet or document in one
  keystroke; a matrix pastes as cells. Text you have selected on the page
  still copies as text.
- Improved: with the drawer docked beside the stack on a wide screen, Esc
  in the drawer takes the keyboard back to the command line and leaves the
  drawer open. Before, it did nothing. A drawer over the stack still
  closes.

## v0.8.42 — 2026-10-21

- Fixed: one cell copied from Excel or LibreOffice Calc arrived on the
  command line as the text the cell shows, so `$1,200.00` was a syntax
  error, `12.5%` pushed 12.5 and then failed, and `(300.00)` became the
  complex number (300, 0). A single cell now pastes as its number, at the
  exact value the sheet holds, as a range of cells already did.
- Added: a single cell copied from Google Sheets, which arrives as a span
  rather than a table, pastes as its exact number too.
- Improved: in the matrix writer, Ctrl+Enter (⌘Enter on a Mac) pushes the
  matrix from any cell. Before, it did nothing, and only Enter on a cell
  you hadn't typed in could push it. The shortcut list (⌘/) shows it.

## v0.8.41 — 2026-10-21

- Fixed: a tap on a keypad key typed it twice in Chrome, so `7` gave 77
  and `SIN` ran twice. Chrome sends the click that follows a tap with
  detail 0, as a keyboard's, once the key has acted on the touch; only a
  keyboard's or screen reader's click now presses a key. The soft keys did
  the same, so `DUP` ran twice and a toggle such as CLK flipped back off,
  and a stylus tap still did.
- Added: flag -22 reaches algebraics. Set, an algebraic that comes to x/0
  or 0 to a negative power, such as `'1/0' EVAL` or `→NUM`, gives ±MAXR
  as `1 0 /` does; deeper in an expression it stays an error.
- Improved: NXT on the soft-key row ticks and buzzes like the soft keys
  beside it when key click or vibration is on. With the keypad hidden or
  in minimal view it is the only NXT, and it was silent.

## v0.8.40 — 2026-10-21

- Fixed: in minimal view on a 280 px screen, with HALT and USER both lit,
  the Menu and Leave buttons ran off the right edge (23 px, 37 in the
  Classic look), and HALT and USER read as one word. The exact mode now
  gives way below 320 px and the two marks sit apart.
- Added: flag -22, as the AUR has it. Set, an infinite result is ±MAXR
  instead of an Infinite result error: `1 0 /`, `0 INV`, `0 LN`, `0 LOG`,
  `-1 LNP1`, `1 ATANH` and `TAN` at an odd multiple of 90° in degrees.
- Improved: the soft keys `CONSTANTS`, `REWRITE` and `MENUXY` show are
  named on the menu button (CONST, REWRITE, MENUXY) instead of TMENU, and
  come back by that name as the previous menu.

## v0.8.39 — 2026-10-21

- Fixed: `CONSTANTS` opened the Characters drawer with whatever filter it
  was left with, so a filter such as "arrow" hid the constants. It now
  clears the filter and shows the constants first.
- Added: with flag -117 set, as the AUR has it, `CONSTANTS` shows π, e, i,
  ∞, MAXR and MINR as soft keys instead of the drawer.
- Improved: the Characters drawer's groups and History's Errors and
  Entries headings stay at the top while their section scrolls, as a
  Catalog family's name does.

## v0.8.38 — 2026-10-21

- Fixed: `CASCMD` and `HELP` opened the Catalog on whatever page it was last
  left on, such as a command's reference. They now open its Algebra (CAS)
  list, as the HP's lists of CAS commands do.
- Added: as the AUR has it, a string in level 1 starts `CASCMD`'s list at
  that command: `"SOLVE" CASCMD` opens the list at `SOLVE`.
- Improved: a Catalog family keeps its name and back button at the top
  while its list scrolls, so the CAS family's 121 commands no longer hide
  the way back.

## v0.8.37 — 2026-10-21

- Fixed: `KILL`, and a halt banner's Stop, cancelled only the latest halted
  program. As the AUR has it, they now cancel every halted program, while a
  program waiting in a dialog stays.
- Added: flag -40, or the new CLK key on the TIME menu, shows the time in
  the status line as the HP's header does, 24-hour with flag -41. It shows
  where there is room: from 390 px in minimal view, 430 in the Classic look.
- Changed: the HALT annunciator lights for `HALT`, `PROMPT` and a single
  step, as the HP's HLT does, and no longer for `MSGBOX`, `INPUT`,
  `CHOOSE` or `INFORM`. It stays lit while a halted program waits under one.

## v0.8.36 — 2026-10-21

- Fixed: `INFORM`'s form put away by its ×, Escape, a phone's back button
  or a tap beside it left the program halted with the form gone. It now
  cancels, answering 0, as the HP's CANCEL and ON do.
- Added: `MSGBOX`, `CHOOSE`, `INPUT`, `INFORM` and `WAIT` typed straight on
  the command line open their dialog, as on the HP, which runs its command
  line as a program; they had said "not inside a running program". `HALT`
  and `PROMPT` still need a program.
- Changed: a level marked "this one", "argument" or "result" keeps its tag
  beside the value, so a wide value starts after the tag instead of
  running under it, as it did at 280 px in minimal view.

## v0.8.35 — 2026-10-21

- Fixed: the phone's back button left the app from the dark `OFF` screen
  and with an error showing. As the HP's ON does, it now wakes rpl.ai from
  `OFF` and dismisses the error first.
- Added: installed as an app, rpl.ai's icon carries a dot while an alarm
  is past due, as the HP's status line carries ((•)), until `ACK` or
  `ACKALL` acknowledges it.
- Fixed: a command whose own error already names it showed the name
  twice, as in `TVMROOT: TVMROOT: Bad argument type` or
  `AMORT: AMORT: Undefined Name I%YR`. It now says it once.

## v0.8.34 — 2026-10-21

- Fixed: with a stack level selected (the HP's interactive stack), the
  phone's back button left the app. It now leaves the selection first, as
  the HP's ON does, and leaves the app only when nothing is open.
- Added: the TOOL menu, the HP's TOOL key: `EDIT`, `VIEW`, `RCL`, `STO`,
  `PURGE` and `CLEAR`, then `CASCMD` and `HELP` on the next page, so
  minimal view, which has no keypad, reaches them from the soft keys.
  `VIEW` shows level 1 full size, as a level's View does. It's listed with
  VARS, CST and MODES in the menu picker.
- Changed: in a short window the matrix writer's five keys sit beside its
  grid from a 520 px wide work column, where the formula's eight still
  need 600 px, so with the full keypad in landscape at 844 × 390 or wider
  the stack shows another level and a 3 × 3 grid still shows whole.

## v0.8.33 — 2026-10-21

- Fixed: with Keep the screen on, `OFF`'s dark screen kept the screen
  wake lock, so the phone stayed lit on a black page. `OFF` now lets the
  phone sleep, and the tap that wakes the calculator keeps the screen on
  again.
- Added: with key vibration on, a program's `BEEP` buzzes as long as its
  tones play (a tune of several BEEPs buzzes through to its end, up to
  5 s), so a phone on silent still gives the signal. Flag -56 stops it,
  as it stops the tone.
- Changed: command search, the Catalog, Variables, History and
  Characters filters, the plot's expression fields, the rename, New
  folder, Store and backup name fields and INFORM's fields tell the
  phone's keyboard not to capitalise or autocorrect, as the command line
  already did, so an iPhone no longer turns `sto` into `Sto` or "corrects"
  a command name.

## v0.8.32 — 2026-10-21

- Fixed: an installed app on a 412 or 430 px tall phone in landscape
  missed the short-window layout, which started under 400 px, so an open
  equation or matrix writer left no whole stack level in view. It now
  starts under 440 px and leaves two or three.
- Added: Keep the screen on in Settings › Appearance, where the browser
  supports it. The phone's screen stays on while rpl.ai is open, for a
  long program or a result you keep checking; the app asks again each
  time it comes back to the front. It's off by default.
- Changed: a landscape phone with the keyboard down keeps the writers'
  keys beside the formula or matrix, as it does with the keyboard up,
  in minimal view or with the keypad hidden. The matrix writer at
  640 × 360 now leaves one stack level where it left none, and every
  other landscape size gains one. With the full keypad beside it the
  work column is too narrow, so the keys stay under the writer.

## v0.8.31 — 2026-10-21

- Fixed: the error beep follows flag -56, as on the HP and as BEEP
  already did, so Settings › Calculator's Beep switch (or `-56 SF`)
  silences errors; they sounded regardless.
- Added: Key click in Settings › Calculator, the HP MODES form's switch.
  A short, quiet tick plays as a keypad key, soft key, key strip button
  or the ⌫ and Enter beside the line is pressed, so a phone that can't
  vibrate, such as an iPhone, still answers a press. It's off by default.
- Fixed: typing in a drawer on a screen under 400 px tall (a phone with
  its keyboard up), the drawer's row showed only its buttons once its
  tabs stepped aside; it names the drawer again.

## v0.8.30 — 2026-10-21

- Added: Settings › Calculator, the HP's MODES form. It sets the angle,
  the number format with its digits, exact or approximate results, the
  real or complex domain, coordinates and the integer base, each with a
  line on what the choice does. Switches cover the decimal comma (moved
  from Appearance), Beep (flag -56), saving last arguments (-55), a
  24-hour clock (-41) and day-first dates (-42). They change the same
  settings as the MODES menu and commands such as `DEG`.
- Changed: on a phone, Settings' four page tabs share one row without
  their icons, so none scrolls out of sight.

## v0.8.29 — 2026-10-21

- Added: the digit keys carry the HP 50g's shifted menus. ↰7 S.SLV,
  ↰8 EXP&LN, ↰9 TRIG, ↰4 CALC and ↱4 ALG open those CAS folders; ↱8 TVM
  (the HP's FINANCE), ↰5 MATRX, ↱5 STAT, ↱6 UNITS, ↰1 ARITH and ↱1 CMPLX
  open their menus. ↰2 DEF runs DEFINE and ↱ON is OFF. A menu key leaves
  a half-typed command line as it is, and with a writer open it shows
  the menu over the writer's own. ↱9 keeps the where operator `|` rather
  than the HP's TIME. The compact keypad shares 4, 5, 6, 1 and 2, its
  crowded 5 and 1 keeping only their ↰ menus.
- Fixed: shift labels on a narrow keypad shrink together until every
  key's pair fits with a gap. The desktop keypad column and 280 px
  phones overlapped pairs such as DEL and CLEAR, or cut them.

## v0.8.28 — 2026-10-21

- Changed: the Variables drawer is decluttered. Each variable's row shows
  its name and value with one ⋯ button whose menu edits (or opens),
  renames, downloads or deletes it, where four buttons sat under every
  name; a phone's row went from 86 to 55 px. New folder, Upload, Export
  .rpl, Back up everything and Restore move from five buttons under the
  list into one ⋯ menu beside the filter, and the backup ports fold away
  under Backups, which shows how many there are. The drawer's title no
  longer repeats the folder path its path row and the app bar show.

## v0.8.27 — 2026-10-21

- Fixed: on a phone under about 840 px tall (360 by 740, 412 by 780 and
  the like), opening the equation or matrix writer with the full keypad
  left the stack no whole level, and the keypad had to scroll. The
  compact keypad now takes its place while a writer is open, as it does
  in a short window, and the full one comes back when the writer closes;
  the setting stays Full.

## v0.8.26 — 2026-10-21

- Changed: on a phone with the keypad hidden, or in minimal view, the
  equation writer takes two parts of the spare height to the stack's one
  and its canvas grows past 240 px (a 390 by 844 phone gave the formula
  121 px under 445 px of mostly empty stack; it now gets 258 px, with
  three levels still showing). The full keypad, the keyboard up and
  desktop windows keep the writer as it was.
- New: where the writer's canvas has grown, the formula's type grows to
  fill it, up to 1.6 times (44 px, or 60 px with BIG), and shrinks back as
  the formula gets longer or the keyboard comes up.

## v0.8.25 — 2026-10-21

- Changed: where a drawer shows its tabs (phones, tablets and minimal
  view), its buttons end the tab row instead of sitting in a title row
  that repeated the pressed tab, and they wrap under the tabs only in a
  drawer too narrow to leave the tabs room. On a phone the drawer opens
  as a sheet nearly the screen's height, with 24 px above it rather than
  a tenth of the screen. Together they give a 390 by 844 phone's plot 113
  px more height, and a tablet's drawer 57 px.

## v0.8.24 — 2026-10-21

- New: Settings › Appearance has a Pop-up notes switch. Turned off, the
  notes that follow an action, their Undo buttons and the hints stay
  quiet; errors, alarms, a file to choose, the tutor and the new-version
  notice still show, and Undo stays on its key and in the menus.
- Changed: on a phone the graph fills the plot view, with the plot types
  peeking below it, and the types, traces and window scroll up under it.
  The canvas went from about a quarter of a 390 by 844 phone to half of
  it.

## v0.8.23 — 2026-10-21

- Fixed: with flag -51 set, the equation writer's text view showed 1.5
  beside a formula drawn as 1,5, and marked 1,5 or MAX(2,5;3) typed there
  as wrong. It now shows and reads the comma form, as the writer's keys
  and clipboard do.
- New: a level dragged by its number onto a variable's soft key is stored
  in that variable and leaves the stack, as the HP's left shift and the
  key store level 1, with an Undo note that also brings back the
  variable's old value. Only variable keys light up as the finger passes.
- The tour's stack card on a phone now names every place a level dragged
  by its number can go: another level, the command line, an open writer
  or a variable's soft key.

---

## v0.8.22 — 2026-10-21

- Fixed: with flag -51 set (the comma as the fraction mark), ECHO of a
  number such as 1,5 into the equation writer, or a paste of one, failed
  to read. The writer's paste now reads the comma form, as its keys
  already did, and its Copy writes it, so copy and paste round-trip.
- New: a level dragged by its number onto one of the matrix writer's
  cells lights that cell and, on release, takes its place, whatever the
  cell held. A drop elsewhere on the writer still fills the focused cell.
- ECHO of a level the open writer can't hold, such as a list into the
  formula or a program into a matrix cell, now says so plainly ("Level 1
  holds a program, which can't go in the formula.") instead of naming a
  parser position, or filling a cell that failed only at Enter.

---

## v0.8.21 — 2026-10-21

- Fixed: a phone held sideways at 520 to 639 px wide put the keypad below
  the stack, leaving a 568 x 320 phone 29 px of stack. From 520 px wide a
  short landscape window now keeps the keypad beside the stack, with four
  whole levels in view and both writers fitting.
- Fixed: a second paste into the equation writer replaced the last item of
  the first, though the writer drew the caret after it. It now follows that
  item as a factor, as typing does; a selection that shows is still
  replaced.
- New: with the equation or matrix writer open, ECHO from a level's menu or
  soft key, and a level dragged by its number onto the writer, put the
  level in the formula at its caret or in the focused matrix cell instead
  of the hidden command line. ECHO then Enter in the matrix writer fills
  cells one after another.
- The level menu and the ECHO soft key name where ECHO puts the level (the
  command line, the formula or the matrix cell), and the menu item carries
  (ECHO) like VIEW, PICK and ROLL beside it.

---

## v0.8.20 — 2026-10-21

- Fixed: a level being edited lost its edit when another level was moved,
  swiped away or pushed past it, so Enter pushed the text as a new level
  while minimal view's pencil still named the old level. The edit now
  follows its value to its new level, and ends, pencil and all, only when
  the value leaves the stack.
- On a phone, drag a level by its number onto the command line to copy it
  there, as the HP's ECHO does (a mouse's drop already did); the line
  lights up while the level is over it.
- A level dragged toward level 1 shows its drop line under the row it will
  land below, rather than over it, for a finger and a mouse alike.

---

## v0.8.19 — 2026-10-21

- On a phone, drag a stack level up or down by its number to move it onto
  another level, as the HP's ROLL and ROLLD do; held near the top or
  bottom edge, the stack scrolls to a level out of view. A sideways swipe
  from the number still drops the level, and Undo puts a move back.
- Fixed: on a phone narrower than 320 px, Settings' Data tab was cut to
  "Dat"; the page tabs drop their icons there, as the writer tabs do.
- The tour's stack card on a phone names the swipe that drops a level and
  the drag by its number that moves it.

---

## v0.8.18 — 2026-10-21

- A backup deleted from its row in the Variables drawer comes back with
  the note's Undo, so a finger that slips from Save to Delete costs
  nothing.
- Fixed: a long backup name was clipped mid-letter on a phone; it wraps
  as a variable's name does.
- `MSOLVR`, `SOLVEQN` and the Equation Library's Solve say on a phone how
  the solver's keys work: tap a variable's key to store level 1 in it,
  hold the unknown's key to solve for it, as there is often no shift key
  showing.

---

## v0.8.17 — 2026-10-21

- A backup in the Variables drawer has Save beside Delete: it downloads the
  backup as a file that Restore from file reads back, so a backup made with
  `ARCHIVE` on a phone can move to another device.
- Fixed: a finger held on the soft keys' menu button said there was no
  menu before after a `TMENU`, or inside a folder such as CAS · ALG; it now
  goes back to the menu shown before, as `0 MENU` does.
- Opening the print log puts away the "Printed …" note whose Show opens
  it, which stayed over the log when it was opened from search.

---

## v0.8.16 — 2026-10-21

- The print log has Share on a phone, so what PR1, PRST and XMIT printed
  goes to another app the way a printout would; its footer keeps Copy,
  Share and Clear on one row, the header's × closing it as VIEW's does.
- Fixed: archiving from the Variables drawer's backup form with the phone
  keyboard's Done kept the keyboard up and the name in the field, so the
  new backup's row stayed hidden under the keyboard; the field now clears
  and the keyboard goes.
- A long string inside a list, in a selected level or VIEW, wraps reading
  from the left, where it wrapped right-aligned in a level and centred in
  VIEW.

---

## v0.8.15 — 2026-10-20

- `SBRK`, the serial break. Break from the HP: there is no serial port, so
  there is never a transfer to break and it does nothing. The commands
  still missing are recorded in the README: RCLMENU and the numbered menus
  need the HP's menu-number table, and the rest need a ROM, libraries,
  warmstarts or the StreamSmart hardware.
- Fixed: `0 MENU` after `TMENU` said there was no menu before, and after
  `MENU` it skipped the menu just left; it now goes back to the menu shown
  before, a temporary menu or a folder included, as the HP's last menu
  does.
- A list on the stack reads `{ 1 2 }` as the HP writes it, where the
  braces had lost their spaces (`{1 2}`).

---

## v0.8.14 — 2026-10-20

- Ports: `PVARS` lists the backups `ARCHIVE` made in a port as tagged
  names with the free memory, `PINIT` drops backups that can no longer be
  read, and `LIBS` returns `{ }`. Breaks from the HP: the ports are the
  browser's backup store, so ports 0 to 3 all report one estimate of the
  storage left, and there are no libraries to list.
- Fixed: a backup made by typing `ARCHIVE` didn't show in the Variables
  drawer's Backups list until the drawer was reopened.
- On a phone the backup name field takes its own row, with the port and
  Archive beneath it, and a backup's date is short and wraps whole instead
  of being cut.

---

## v0.8.13 — 2026-10-20

- The serial port: `BAUD`, `PARITY`, `CKSM`, `TRANSIO`, `STIME`, `OPENIO`,
  `CLOSEIO`, `BUFLEN`, `SRECV`, `XMIT`, `KERRM`, `FINISH`, `SERVER`, `XSERV`
  and `PKT`. Breaks from the HP: nothing is on the other end, so the
  settings are checked and kept in IOPAR (in HOME, as on the HP), `BUFLEN`
  gives 0 and 1, `SRECV` returns at once what a timed-out HP returns (an
  empty string and 0), `XMIT` prints its string to the print log, `SERVER`
  and `XSERV` return with a note, `FINISH`, `OPENIO` and `CLOSEIO` do
  nothing, and `PKT` ends in Timeout.
- Fixed: the Catalog's page for a command led with what the HP does (SEND
  "sends … to a Kermit device") while rpl.ai's own note sat far below on a
  phone; the note's first sentence now follows the summary.
- On a phone, stacked notes share one width, their buttons at the right
  edge, instead of a short note sitting inside a long one.

---

## v0.8.12 — 2026-10-20

- Transfer: `SEND`, `XSEND` and `XPUT` save variables as .rpl HP text
  files to your downloads (a list sends several, `{{ old new }}` renames),
  and `RECV`, `RECN`, `KGET`, `XRECV` and `XGET` open a file picker and
  store the chosen .rpl, .json, .csv, .tsv or .xlsx files as variables.
  Breaks from the HP: there is no Kermit or XModem link, and a receive
  finishes when the files are picked, so a program goes on before they
  arrive; when no tap or key press can open the picker, a note asks for
  one with Choose and waits. A received name in use takes a number (NAME1)
  while flag -36 is clear, as on the HP; XRECV into a name in use is an
  error then, as the AUR says.
- Fixed: `PR1` and `PRVAR` printed a directory as `Directory { NAME }`;
  they print `DIR`, its variables and `END`, as the .rpl file holds it.
- Upload in the Variables drawer takes several files at once and stores
  them as `RECV` does, a name in use taking a number instead of refusing
  the file.

---

## v0.8.11 — 2026-10-20

- Fonts: `FONT6`, `FONT7`, `FONT8`, `→FONT`, `FONT→`, `→MINIFONT` and
  `MINIFONT→`. The screen has one typeface, so the system font is the stack
  text size from Settings: `FONT8 →FONT` makes it Large, font 6 Small and
  font 7 Normal, and `FONT→` reads it back. They sit at the end of the DISP
  menu. Breaks from the HP: a font is the tagged size `:Font:8` (TYPE 12,
  not a TYPE 30 font object); font 8 leaves Larger as it is, so a program
  that saves `FONT→` and restores it changes nothing; the minifont is kept
  for `MINIFONT→` but nothing is drawn in it. `UFL1→MINIF` stays out.
- Fixed: a binary integer written as the HP shows it and the AUR prints it,
  `# 5d` with a space after `#`, said Malformed binary integer; typed,
  pasted or in a program it now reads as `#5d`.
- Settings: the four stack text sizes keep to one row on a 280 px phone
  instead of leaving Larger on a second.

---

## v0.8.10 — 2026-10-20

- Printing: `PR1`, `PRST`, `PRSTC`, `PRVAR`, `PRLCD` and `CR` print to a
  print log, there being no printer. A note says how many lines a run
  printed, with Show to open the log; command search opens it too (Print
  log). The log keeps the last 2000 lines while the app is open, newest at
  the bottom as on the HP's paper, with Copy and Clear. Breaks from the HP:
  `PRLCD` prints the stack as text rather than the screen's pixels, `PRVAR`
  takes no ports, and `DELAY` and `OLDPRT`, with no printer to pace or
  remap, do nothing.
- Fixed: in minimal view, tapping the button of a note that sat under the
  "Minimal view" note did nothing on a phone. The press put the minimal-view
  note away, the note under it jumped up, and the tap missed. A press on any
  note now leaves the minimal-view note in place until the next press
  elsewhere.
- A sheet's footer of three keys (Back, Solve and Close; Copy, Clear and
  Close; INFORM's OK, Cancel and Reset) keeps to one row on a 280 px phone
  instead of two.
- The assistant knows FILER, OFF, PERTBL, PTPROP, PERINFO, EQNLIB, SOLVEQN
  and the print commands.

## v0.8.9 — 2026-10-20

- Fixed: in minimal view the "Minimal view" note, and any note shown while
  a sheet was open, sat over the sheet's footer on a phone, so the first tap
  on the Equation Library's Solve, Back or Close, or the periodic table's
  Close, landed on the note and did nothing. Notes now sit above the footer
  of a sheet that fills the screen.
- The Equation Library, third part: 23 sets now hold the HP's full lists of
  equations, 339 in all. Bernoulli's Equation has its ten, Real Gas Law and
  Real Gas State Change find Z through `ZFACTOR`, Black Body Radiation finds
  the band fraction through `F0λ`, and Angular Mechanics, Mohr's Circle,
  Sound Waves and the rest gain the equations they were missing. DB48X's
  transcription of the HP's sets is credited in the README.
- A tap on one of a set's equations puts it on the stack with a note, as
  the HP's →STK key does; the equations are finger-sized buttons.

## v0.8.8 — 2026-10-20

- The Equation Library, second part: all 102 sets now hold their equations.
  The beams (simple and cantilever deflection, slope, moment and shear, with
  the HP's `IFTE(x≤a,…)` forms), Flow with Losses, Flow in Full Pipes (with
  `FANNING`) and the four Solid State Devices sets (PN Step Junctions, NMOS
  Transistors, Bipolar Transistors, JFETs, with `ni = SIDENS(T)*1E6` per cubic
  metre) are in, written from DB48X's forms of the HP's sets.
- Fixed: a set's constants are now the ones the HP marks known for that set,
  not every name that happens to match a constant. 0.8.7 stored the gas
  constant into Ohm's law's R, the speed of light into a beam's c, and the
  Stefan-Boltzmann constant into Normal Stress's σ, so those sets could not
  be solved for them; k, q, εsi, εox and I0 join the constants a set can know.
- A set's page in the Equation Library lists its variables in the solver's
  key order, the known constants with their values, and says the values are
  plain numbers in SI units.

## v0.8.7 — 2026-10-20

- The Equation Library, first part: `EQNLIB` opens a sheet of the HP's 15
  subjects and their 102 equation sets by number, a set's equations, and
  Solve; `SOLVEQN` takes the HP's subject and title numbers (`2 9 0 SOLVEQN`
  is Electricity, Capacitive Energy), puts the set's equations in EQ, stores
  its constants (g, G, c, ε0, μ0, σ, R, NA, c3) as plain SI numbers marked
  known, titles Mpar after the set and opens the solver as MSOLVR does. 88
  sets hold their equations, written from the physics rather than copied
  from the HP, so a variable name can differ; the beams, Solid State Devices
  and pipe flow sets say they are still to come. The PICT option is read and
  ignored.
- The periodic table's row fades at the edge that scrolls, as the key strip
  and the plot rows do.

---

## v0.8.6 — 2026-10-20

- The periodic table: `PERTBL` opens a sheet with the 118 elements in their
  18 columns, a tap on an element lists its 23 properties and a tap on a
  property puts it on the stack; `PTPROP` takes an element by symbol (a name
  or a string) or atomic number and a property by number or by name, `'Hg' 6
  PTPROP` giving `"[Xe]4f14·5d10·6s2"` and `79 8 PTPROP` the melting point
  `1337.33_K`, a plain number with flag -61 set as MOLWT does; `PERINFO`
  shows the table's version and data source. Property numbers 6 and 8
  follow the HP's examples; the other 21 are rpl.ai's order, listed in the
  reference, the AUR's Appendix B being out of reach. The data is
  Bowserinator's Periodic-Table-JSON (CC BY-SA), drawn from Wikipedia, so a
  value can differ from the HP's.

---

## v0.8.5 — 2026-10-20

- `FILER` and `OFF` are in, the first two of the commands still outside the
  app that a web page can honour. FILER opens the Variables drawer, the file
  manager here, and lets a phone's keyboard go so the drawer has the screen.
  OFF saves the session and covers the app with an off screen until a tap or
  a key wakes it; a web page has no power to cut, and nothing is lost. Both
  do nothing inside a scratch evaluation, as the other screen commands do.

---

## v0.8.4 — 2026-10-20

- The plot's FCN keys gain SHADE and NXEQ, in the HP's order ROOT, ISECT,
  SLOPE, AREA, SHADE, EXTR, F(X), NXEQ, F', TANL. SHADE marks the first bound
  on one tap and, on the next, shades between the function and the next one,
  or the x axis when it is alone, in the function's colour; the shade stays
  through pans and zooms and goes with either trace. NXEQ makes the next
  function the current one, as the HP's turns to the next equation.
- A tagged formula on the stack, as TANL and F' leave (`TanL: 'X'`), now
  offers Plot from its level and plots as the formula; before, the level
  offered nothing and PLOT said FUNCTION needs an expression.
- An AREA or SHADE first bound whose function has since been removed,
  hidden or deselected is dropped together with its "move the cursor and
  tap again" readout, so the readout and the key agree.

---

## v0.8.3 — 2026-10-20

- The plot tools gain the HP's ZSQR, which brings the y scale to the x
  scale so a circle is round, and CNTR, which moves the window to put the
  cursor at its centre.
- AREA's first bound belongs to the function it was marked on: once that
  trace is removed, hidden or deselected the key shows unpressed and the next
  tap marks afresh, where it integrated another function from the old bound.
- On a phone the trace F' or TANL adds scrolls into view in the trace list,
  as the add field does after Add.

---

## v0.8.2 — 2026-10-20

- The plot's FCN keys gain F(X), F' and TANL after EXTR, as on the HP. F(X)
  pushes the function's value at the cursor as `F(x):`; F' plots the CAS
  derivative, makes it the current function and pushes it; TANL plots the
  tangent line at the cursor and pushes it as `TanL: 'm*X+b'`. SLOPE and
  TANL read the CAS derivative when it is ready (`Slope: 0.540302305868` at
  1 on SIN(X), where differencing gave 0.540293), and difference the curve
  when it isn't.
- On a phone the plot drawer's show/hide box for each trace was the native
  16 px checkbox, the one control in the drawer under 40 px; on touch it is
  now a 40 px box drawn in the trace's colour.
- The plot's type, PICT and FCN rows, which scroll sideways on a phone, now
  fade at the edge that has more, as the key strip and drawer tabs do.

---

## v0.8.1 — 2026-10-20

- The plot's FCN keys gain ISECT and AREA, in the HP's order ROOT, ISECT,
  SLOPE, AREA, EXTR. ISECT pushes the nearest crossing of the function with
  the next one as `I-Sect: (x, y)`; AREA marks the first bound on one tap
  (the key stays lit) and, once the cursor has moved, pushes `Area:` on the
  next, as the HP's does.
- On a phone in landscape the plot box kept its 220 px minimum, which put
  the tap readout and the FCN keys under the fold of a 390 px window; the
  box gives way first in a window under 400 px tall, so they stay on screen.
- At 280 px the x axis asked for eleven labels in 250 px and "-10" ran into
  "-8"; the axis now asks for a label per 40 px, five at that width, and a
  wide plot keeps its ticks.

---

## v0.8.0 — 2026-10-20

- A function plot has the HP's FCN keys ROOT, EXTR and SLOPE under its
  readout. Each works about the cursor (the trace cursor, else the point
  tapped, else the middle of the window) on the selected or first function
  trace, pushes the answer tagged as the HP does (`Root: 3.14159265359`,
  `Extrm: (4.71238898039, -1)`, `Slope: 0.`) and moves the trace cursor to
  it. ROOT and EXTR find the nearest one in the window; a sign change at a
  pole doesn't count as a root.
- With the phone's keyboard up, adding a trace grew the trace list and
  pushed the expression field, still focused, under the keyboard; it now
  scrolls back into view for the next expression.
- The plot drawer's expression, trace and window fields are 40 px on touch
  (they were 32, 28 and 30), as the plot tools and every other field are.
- The README's command count is current again: 765 of the AUR's 825 are in
  the app; the 61 missing are the serial, printing, library, font, equation
  library and periodic table commands left out on purpose, and RCLMENU.

---

## v0.7.113 — 2026-10-20

- The Store, New folder and Backup name fields, and the Variables drawer's
  inline rename field, are 40 px on touch (they were 32 and 26), keep the
  case typed (a phone keyboard capitalised the first letter of a name whose
  case matters) and label the keyboard's Enter key Done, as the writers'
  fields already did.
- Store in a variable lists the directory's variables as chips under its
  field, in the VARS menu's order (folders left out), so a name already
  there is a tap away instead of typed; the tap stores at once, with the
  usual Undo note.

---

## v0.7.112 — 2026-10-20

- In the Classic theme, editing a level now outlines the command line in
  amber, as the other themes do. The theme's LCD border hid the outline,
  so with the keypad hidden and the phone's keyboard up, where the status
  line and its pencil give way, nothing showed that Enter would replace
  the level.
- VIEW's sheet has ▲ and ▼ beside its title. They show the level above
  or below and move the interactive stack's pointer with them, as the HP's
  arrows do, so a phone can page through the stack full size without
  closing the sheet. Each is greyed out at the top of the stack or at
  level 1.
- With key vibration on, a swipe along the soft keys buzzes once as it
  turns the page, as a swipe on a level, banner or note does. A menu of
  one page doesn't buzz.

---

## v0.7.111 — 2026-10-20

- A program variable's soft key pressed on a typed value now keeps the
  line when the program fails, as a command key does since 0.7.110: type
  `"abc"`, tap a program's key, and Fix the line brings back `"abc" PSIN`
  with the cursor at the name. Before, the typed value was gone and no
  Fix the line was offered.
- With key vibration on, a swipe across a stack level, an error banner or
  a toast buzzes once as it passes the point where letting go drops or
  dismisses it.
- Under 320 px an error banner's fixes sit tighter (8 px padding, 4 px
  gaps), so a bad type's five fixes take two rows at 280 px where
  Explain took a third alone, and the stack keeps 214 px where it had 166.

---

## v0.7.110 — 2026-10-20

- In a window under 330 px tall with no keyboard up, as in a landscape
  split screen once Settings has taken the focus, the app bar, writer
  tabs, command line and soft keys needed about 180 px: in a 160 px
  window the soft keys ran 22 px past the bottom and the stack had no
  room. The writer tabs and hints now step aside there, as they do with
  the keyboard up, and the soft keys end on screen.
- A command key pressed on a typed value that fails now counts as part
  of the line: type `"abc"`, tap SIN, and Fix the line brings back
  `"abc" SIN` with the cursor at SIN. Before, the typed value was gone
  and no Fix the line was offered.
- A toast, such as an Undo note or a hint, swipes away under a finger as
  an error banner does since 0.7.109. Its button still taps.

---

## v0.7.109 — 2026-10-20

- In landscape with the keyboard up, an error banner keeps its title and
  fixes on one row. Five fixes, as a bad type now has, left the title a
  few letters on a 640 px phone ("- can't co…"). The title now keeps at
  least 12em over two lines, and the fixes scroll beside it.
- A sideways swipe puts an error banner away, as a phone notification
  goes. A halted program's banner still waits for its answer, and the
  fixes row still scrolls sideways under a finger with the keyboard up.
- A reference table keeps a stack-diagram word such as `objn-1` whole and
  scrolls instead. On a 320 px phone UNPICK's broke into "objn-" and "1".

---

## v0.7.108 — 2026-10-20

- Editing a level in minimal view with the keyboard up on a short screen
  (a 360 by 640 phone, 310 px tall) showed nothing to say so: the status
  line and its edit pencil give way there, and minimal view's command line
  has no outline. It now takes the amber outline the other views show, so
  you know Enter replaces the level.
- Every error from a typed line offers Fix the line, after its own fixes
  and before its reference. A bad type with the value on the stack
  (`2 "x" -`), a bad value (`{ 1 2 } 5 GET`), mismatched sizes or units
  and other errors offered none, so the line had to be typed again.
- Under 360 px an error or halt banner's fixes start under its icon, not
  beside it, so five fixes take three rows at 280 px instead of four and
  the stack keeps 166 px where it had 120.

---

## v0.7.107 — 2026-10-20

- A 360 by 640 phone with its keyboard up is 310 px tall, just over the
  300 px where the short-screen rules start. An error banner left its
  stack 10 px, or 28 px in minimal view, and pushed the soft keys off the
  bottom. The rules now start at 330 px, so the app bar and status line
  give way while typing and the stack keeps 83 to 97 px.
- Fix the line brings a failed line back with the cursor at the command
  that failed: `1 DROP DROP 2 3` comes back with the cursor before the
  second DROP, where it went to the end of the line. Words inside lists,
  strings, programs and comments don't count.
- With the keyboard up over a short stack, the empty-stack card was pinned
  to its bottom, with Write an equation cut under the app bar. It now
  starts at its heading.

---

## v0.7.106 — 2026-10-20

- A too-few-arguments banner mixed digits and words: `7 PICK` on four
  values read "PICK needs 8 values; the stack has four values." Both
  counts are now words up to nine ("needs eight values"), or both digits
  past it ("needs 12 values; the stack has 4 values").
- A double tap on a stack level edits it, as a double click does. On a
  phone the first tap opens the level's toolbar under the finger, so the
  second tap opened the level's ⋯ menu instead.
- With the keyboard up, an error banner can leave the stack only a sliver
  (47 px on a turned phone, 28 at 280 px). Its top fade covered level 1
  and greyed it out; a stack that short now has no fade or more-levels
  pill, so level 1 stays clear.

---

## v0.7.105 — 2026-10-20

- UNPICK's and RRKSTEP's stack diagrams were the PDF's column headings,
  so command search and their banners showed "Ln+2 Ln+1 L3 L2 L1" and
  "L4/A1 L3/A2". They now read "objn objn-1 ... obj1 obj n → obj objn-1 …"
  and "{ list } xtol h last → { list } xtol …", and RRKSTEP's banner counts
  its four inputs.
- A selected level has the HP interactive stack's INFO, after LEVEL on its
  soft keys and in its ⋯ menu: a note of what it holds, its TYPE and its
  size by BYTES, such as "Level 3: a 2×2 matrix · TYPE 3 · 163 bytes".
  The stack and LASTARG stay as they were.
- A command search preview of a too-few-arguments error counts the
  missing values as the banner does: DROPN on an empty stack previews
  "DROPN needs one value; the stack has none." where it said it needed
  more values than the stack holds.

---

## v0.7.104 — 2026-10-20

- DROPN, DUPN, ROLL, PICK, SWAP and the other commands that check the
  stack before they take from it said only that they needed more values
  than the stack held. Their banners now count, as `+`'s does:
  `1 3 DROPN` reads "DROPN needs four values; the stack has two values."
- A line that doesn't parse keeps the cursor at the word that broke it,
  as on the HP: after `2^10` the cursor waits at `^10`, and after
  `3 4 x^2 +` at `x^2`, so the fix is typed in place.
- A stack diagram too long for a banner or search ends at a whole word
  with one ellipsis. DUPN's banner read "obj1 obj2 ...…." and now reads
  "obj1 obj2 …", and the matrix commands no longer end on an open `[[`.

---

## v0.7.103 — 2026-10-20

- The stack diagrams of `*`, `^`, `√`, SQ, ALOG and EXP lost their operator
  or power when the manual was taken from its PDF, so a banner said `*`
  takes "z1 z2 → z1 z2" and `^` "w z → wz". They now read z1 × z2, w^z,
  √z, z^2, 10^z and e^z, in banners, the Catalog and search.
- The completion list finds a unit holding μ, Å, Ω or ° from the letters a
  phone keyboard has: `10ohm` offers `_Ω`, `kohm` kΩ, `degC` °C, `um` μm,
  `uF` μF and `angstrom` Å.
- A too-few-arguments banner no longer marks level 1 "this one", as if the
  value there were at fault; only a value a command can't use is marked.

## v0.7.102 — 2026-10-20

- A command whose manual page gives no count of its inputs, such as XROOT,
  DERIV or ISPRIME?, now says how many values it needs when the stack runs
  short: `"hi" XROOT` reads "XROOT needs two values; the stack has one
  value.", where it said it needs more values than the stack holds. The
  count comes from what the stack lacked, so it covers 317 commands.
- The completion list finds a command with Σ, Δ or π in its name from the
  letters a phone keyboard has: `clsigma` offers CLΣ, `stosig` STOΣ,
  `deltalist` ΔLIST and `->qpi` →Qπ. Every command is offered as the HP
  spells it, so →Qπ, erf and lim no longer show as →QΠ, ERF and LIM.
- A `#` number with hex digits typed in DEC, OCT or BIN mode, such as
  `#ff`, now gets a Read as hex fix on its banner, which runs the line with
  `#ffh`, and a detail saying that a # number reads in the current base, as
  on the HP. The banner spoke of a `#ffd` nobody typed.

## v0.7.101 — 2026-10-20

- An open completion list now fits the window again after it changes size,
  as a menu does. Turning the phone to landscape with the keyboard up left
  the list sized for portrait, running off the top of the screen with the
  chosen row out of sight.
- →Q and →Qπ now take a fraction, a complex number or a formula, as the
  AUR lists: `5 2 / →Q` gives `5/2`, `(0.5,-0.75) →Q` gives `1/2-3/4*i`
  and `'Y+2.5' →Q` gives `Y+5/2`, converting each approximate number in
  the formula. They said Bad argument type to all three. Q→ splits a
  fraction into its numerator and denominator.
- A command typed in lower case, as a phone keyboard leaves it, is now
  named the HP's way when it fails: `"hi" sin` reads "SIN can't use a
  string." with the SIN reference, where it said sin, and `->q` reads
  →Q. Programs and the assistant's dry runs name it the same way.

## v0.7.100 — 2026-10-20

- With flag -51 set (the comma as the fraction mark), a formula typed with
  the comma, such as `2,5^2`, now gets the syntax banner's Evaluate as a
  formula fix too, and gives 6,25. The fix read the line without the
  comma rule, so it never offered itself there.
- Letters typed straight after a number, such as `9.8kg` or `5ft`, now
  bring up the units they start, shown as `_kg` and `_ft`, and a tap puts
  in the `_` that a phone keyboard keeps a page away. The exponent of
  `2e` or `1E5` brings up none.
- With the keyboard up, the error banner's one row of fixes fades at the
  edge it continues past, as the key strip and drawer tabs do, so a chip
  cut by the edge reads as more to scroll.

## v0.7.99 — 2026-10-20

- Enter on an empty line with an empty stack now fails as DUP, as the HP
  names it: the banner says DUP needs one value and offers DUP's
  reference, where it said "That command needs more values".
- A program opened with a phone keyboard's `<<` now counts as open, as
  one opened with `«` does. The BRCH keys typed a second `« »` inside it,
  and the operator and variable keys entered the line instead of typing
  their command.
- Typing `if`, `for`, `start`, `do`, `while`, `case` or `iferr` brings up
  the BRCH menu's structures in the completion list, `IF … THEN … END`,
  `FOR … NEXT` and the rest, and a tap types the whole structure as ⇦ on
  its key does. `THEN`, `END`, `REPEAT` and the other inner words
  complete too. Inside an algebraic none are offered.
- The last lines that a finger held on Enter offers (the HP's CMD) now
  wrap up to four rows in the command line's face, where a long program
  ended in an ellipsis.

## v0.7.98 — 2026-10-20

- Text typed without quotes that is no name, command or number, such as
  `2^10`, `e^2`, `√16` or `2*-3`, is now a syntax error, as on the HP.
  Before, it went on the stack as a name nothing could use (`2^10` gave
  `2` and a name `^10`). This breaks User-RPL that relied on such names;
  quote a formula instead, `'2^10'`. `STR→` and `OBJ→` on such text now
  error too.
- That syntax banner offers Evaluate as a formula when the line reads as
  one: it runs `'2^10' EVAL` and leaves 1024.
- Typing `pi`, `inf`, `sum`, `integral`, `sqrt` or `deriv` brings up π,
  ∞, Σ, ∫, √ or ∂ in the completion list, signs a phone keyboard has no
  key for. A command spelled exactly so, such as `SUM`, still comes first.

## v0.7.97 — 2026-10-20

- A program typed on a phone keyboard with `->STR`, `->`, `<=`, `>=` or
  `<>` now keeps them as `→STR`, `→`, `≤`, `≥` and `≠`, as `<<` already
  became `«`; it showed `« 2 ->STR »` where the keypad and the HP write
  `« 2 →STR »`. A name of your own, such as `X->Y`, stays as typed.
- Typing `->S`, `R->` or `STR->` on a phone keyboard brings up the arrow
  commands they stand for, `→STR`, `R→B`, `STR→`, and a tap completes to
  them. Before, the list completed only the letters after `>`, so picking
  a row gave `->SIN`.
- In a window under 300 px tall, as in landscape with the keyboard up, a
  command's reference keeps Run and Insert in one row at the foot of the
  drawer, so a completion row held there shows Insert without scrolling.

## v0.7.96 — 2026-10-20

- In landscape with the keyboard up, editing a long program no longer
  pushes the key strip off the bottom of the screen: the command line keeps
  to two lines, the rest scrolling inside it, and minimal view trims its
  padding, so level 1 stays in view above it.
- A FOR loop's counter is offered first in the completion list while you
  type the loop's body, as a local variable, as the names a `→` binds are:
  in `1 5 FOR k k`, the list leads with k.
- A completion list the keyboard cuts down to a row or two fades at the
  edge it continues past, as the key strip and stack levels do, so it shows
  there are more rows to scroll to.

## v0.7.95 — 2026-10-20

- Completion rows for variables and units no longer show blank on a phone:
  where a row has no stack diagram, its description shows instead.
- Inside a program the completion list offers the local names a `→` binds,
  first: in `« → rate time « r` it lists rate, and completing it adds the
  space a command gets.
- Insert on a reference page opened by holding a completion row replaces
  the letters typed: `2 SI`, hold SIN, Insert gives `2 SIN`, not
  `2 SI SIN`.

## v0.7.94 — 2026-10-20

- The completion list no longer covers a program's banner: while a PROMPT
  or HALT waits it opens above the banner, so the program's message and its
  Continue and Stop keys stay in view.
- After a number's `_` the completion list offers units, each with its
  group: `9.8_k` lists km, kg, kN, kJ, kW and kV. Inside an algebraic only
  plain units are offered, since a compound one there needs parentheses.
- While a program waits at INPUT, the typed answer brings up no command
  completions: it is text the program reads back.

## v0.7.93 — 2026-10-20

- Letters typed on the keypad bring up the completion list, as a keyboard's
  do; the list never showed for them, since a keypad key leaves the command
  line unfocused. A tap outside the list closes it.
- A finger held on a command in the completion list opens its reference, as
  the → key does from a keyboard.
- On a touch screen the completion list's footer, shown on a landscape
  phone, speaks of taps and holds instead of Tab, the arrows and Esc.

## v0.7.92 — 2026-10-20

- While the command line's completions are showing, ↑ and ↓ put the
  highlighted one in the line as they move, so Enter runs it, where they only
  moved the highlight and Enter ran what was typed. Esc puts back what you
  typed. The keypad's ▲ and ▼ do the same.
- Completions show from the first letter typed: one letter offers the names
  that start with it, counting →NUM and ΣLIST as starting with N and L, where
  the list waited for two letters. From two letters on they match as before.

## v0.7.91 — 2026-10-20

- EVAL gathers like terms and like factors in exact mode, as the HP's EVAL
  does: `'X+X'` gives 2*X, `'2*X+3*X'` gives 5*X, `'X*X'` gives X^2,
  `'X/X^2'` gives 1/X and `'√X*√X'` gives X. Identities drop out: `'1*X'`,
  `'X+0'` and `'X^1'` give X, `'X-X'` and `'0*X'` give 0, `'X^0'` gives 1.
  `'(X^2)^(1/2)'` stays, as it is |X|. SHOW and SEVAL still leave the top
  level alone, as the AUR's examples show, and ∞-∞ is still ?.

## v0.7.90 — 2026-10-20

- EVAL gathers the numbers of a product or quotient into one coefficient,
  as the HP does: `'ATAN(1)*4' EVAL` gives π, `'2*X*3'` gives 6*X and
  `'X/2*2'` gives X, where they stayed π/4*4 and the like.

## v0.7.89 — 2026-10-20

- Square roots work out against each other in exact mode, as on the HP:
  `2 √ SQ` is 2, `3 √ 3 √ *` is 3, `8 √ 2 √ /` is 2, `2 √ 3 √ *` is √6 and
  `2 √ 2 √ +` is 2√2, where they stayed SQRT(2)^2 and the like. EVAL does
  the same inside an algebraic, and also gives `'√12'` as 2√3 and
  `'4^(1/2)'` as 2, as `12 √` and `4 1/2 ^` already did.
- MAX and MIN keep fractions exact: `1/3 1/4 MAX` gives 1/3, where it gave
  0.333333333333.

## v0.7.88 — 2026-10-20

- In exact mode SIN, COS and TAN give their closed forms at multiples of
  30 and 45 degrees, as the HP does: `30 SIN` in DEG is 1/2, `45 COS` is
  √2/2, `π 6 / SIN` in RAD is 1/2 and `π COS` is -1. ASIN, ACOS and ATAN
  give those angles back, `1 ASIN` in RAD being π/2 and `-1/2 ACOS`
  2*π/3, and EVAL works them out inside an algebraic:
  `'SIN(30)+COS(60)'` in DEG gives 1. They stayed SIN(30) and ASIN(1).
  Grads work too; other angles stay as they are.

## v0.7.87 — 2026-10-20

- Algebraics read the HP's postfix factorial, as the AUR's ! entry says:
  `'5!' EVAL` gives 120, `'N!/(K!*(N-K)!)'` is a binomial coefficient and
  `'2^3!'` is 2^6, the factorial binding tighter than ^. They said
  Invalid algebraic, and `'X!'` became a name. The text form still
  writes FACT(X); the textbook display shows X!.

## v0.7.86 — 2026-10-20

- DRAW plots what EQ holds as PPAR's plot type, as on the HP, so
  `'SIN(X)' STEQ DRAW` draws the sine in PPAR's window, where it opened an
  empty plot. A list in EQ draws every formula in it, and DRAW after PLOT
  leaves the curve PLOT drew as it is rather than drawing it twice. With
  a ΣDAT plot type (SCATTER, BAR, HISTOGRAM) DRAW leaves EQ alone.
- PLOT takes a list of formulas, stores it in EQ and plots each one,
  where it said Bad argument type.

## v0.7.85 — 2026-10-20

- Formulas inside a list on the stack keep at least three quarters of
  their size, as a lone formula does, and a list too wide for its line
  scrolls sideways with an edge fade. At 280 px a factored list such as
  `{ (X-1)*(X+1) { (X-2)*(X+2) … } }` drew its formulas at a third of
  their size.
- A list of formulas plots every one of them, as the HP draws each
  equation in a list stored in EQ: `{ 'SIN(X)' 'COS(X)' } FUNCTION`
  draws both curves, and a list level gets Plot in its toolbar, its ⋯
  menu and its soft keys, as a formula does.
- The plot view's + Level 1 plots each formula of a list too, where it
  switched to Scatter and added an empty scatter trace.

## v0.7.84 — 2026-10-20

- The CAS commands that take one expression take a list of them too,
  nested lists included, and give a list back:
  `{ 'X^2-1' { 'X^2-4' } } FACTOR` gives
  `{ (X-1)*(X+1) { (X-2)*(X+2) } }`. EXPAND, SIMPLIFY, FACTOR, DERIV,
  INTEG, SUBST, `|` and the rest all do, where a list said Bad argument
  type.
- LIMIT, TAYLR, TAYLOR0, ZEROS, LAPLACE, ILAP, DISTRIB, FDISTRIB, XQ,
  I→R, R→I, REORDER, SIGMA, FOURIER and SHOW now take a vector or matrix
  as well as a list, element by element:
  `[[ 'SIN(X)/X' 2 ]] 'X=0' LIMIT` gives `[[ 1 2 ]]`.
- LAPLACE and ILAP take a number, as on the HP, in the variable VX:
  `1 LAPLACE` gives `1/x` and `1 ILAP` gives `DIRAC(x)`.

## v0.7.83 — 2026-10-20

- →ROW and →COL take a vector apart into its elements and a count, and
  ROW→ and COL→ put numbers and a count back into a vector, as the AUR's
  second forms do: `[ 1 2 3 ] →ROW` gives 1 2 3 3, and `1 2 3 3 COL→`
  gives `[ 1 2 3 ]`. Both said Bad argument type.

## v0.7.82 — 2026-10-20

- A UNITS key with the matrix writer open types its unit into the
  focused cell, as it does in the equation writer: 5 becomes 5_m, and ↱
  gives 5_1/m. It used to enter the matrix and push the unit on its own.
  ↰ (CONVERT) says it works on the stack.
- A matrix cell holding a unit, such as 5_m/s, enters a unit object, as
  `[[ 5_m/s ]]` typed on the command line does, where it entered a formula
  that divided 5_m by a variable s.
- The matrix writer's →STK, from the HP's MatrixWriter, copies the focused
  cell to the stack and leaves the writer open.
- A finger held on a unit key with a writer open offers Attach and Divide,
  where it offered Convert level 1, which the writer refuses.

## v0.7.81 — 2026-10-20

- A formula with units, such as `(X+1_m)^2`, no longer offers Plot from
  its stack level's toolbar, ⋯ menu or soft keys, where it opened an empty
  plot; the soft key gives EVAL in its place, and the equation writer
  already left it out.
- UBASE and UVAL take an algebraic or a name, as the AUR lists:
  `'X*5_km' UBASE` gives `UBASE(X*5_km)`, which EVAL works out once X has
  a value, where both said Bad argument type.
- The equation writer's insight cards fade at the edge they continue past,
  as the drawer tabs and the key strip do, where on a phone a card was cut
  off at the writer's edge.

## v0.7.80 — 2026-10-20

- EXPAND, COLLECT, SOLVE, DERIV, INTEG, FACTOR and the other CAS commands
  work on an algebraic holding units, where they said Units can't go to
  the algebra engine. Each unit goes to Giac as a name, so the algebra
  multiplies and cancels units, and the numbers and units of each product
  come back as one unit object: `'2_m*X+3_m*X' COLLECT` gives `5_m*X`,
  and `'X*2_s=6_m' 'X' SOLVE` gives `X=3_(m/s)`.

## v0.7.79 — 2026-10-20

- UNDO takes back drawings on PICT, from a typed command (LINE, BOX,
  ERASE, REPL into PICT and the rest) or from PICTURE's keys. A whole
  DOT+ or DOT- stroke goes back in one step, and after REPL the graphics
  object comes back to level 1. REDO puts the drawing back.
- This differs from the HP, whose UNDO restores the stack only; the
  README lists it.

## v0.7.78 — 2026-10-20

- PICTURE's drawing keys, part 2, which completes the Picture menu's
  drawing keys, in the HP's order:
  - DOT+ and DOT- turn pixels on or off as the cursor moves by the arrow
    keys or a drag from the crosshair; a tap jumps without drawing. Each
    is pressed while it is on, and pressing it again stops it.
  - DEL clears the box between the mark and the cursor, and SUB puts it
    on the stack as a graphics object.
  - REPL puts the graphics object on level 1 into PICT at the cursor and
    takes it off the stack.
  - LABEL and ERASE run their commands.
- The LINE and TLINE commands and DOT+ and DOT- share one line drawer
  (graphics.js pictLine).

## v0.7.77 — 2026-10-20

- PICTURE's drawing keys, part 1. While PICTURE's cursor shows, a row
  under the plot holds the HP's Picture menu keys:
  - MARK sets a mark at the cursor, drawn as a small ×.
  - LINE, TLINE, BOX and CIRCL draw on PICT from the mark to the cursor:
    a line, a line that flips its pixels, a box with those corners, and a
    circle round the mark through the cursor. They wait for a mark.
  - PICT→ puts PICT on the stack.
  - On a phone the row scrolls sideways.
- DOT+, DOT-, DEL, SUB, REPL and LABEL come next. As with the LINE and
  BOX commands, UNDO does not take a drawing back.

## v0.7.76 — 2026-10-20

- Bug: level 1 shows whole on a phone again in two cases.
  - A vector inside a list, such as STURM's sequences, wraps by its
    entries as a nested list does, with formulas in pretty math. Before,
    it ran past the screen's edge and faded out.
  - A graphics object's size caption ("Graphic 114 × 32") wraps instead
    of losing its first letters at 280 px.
- Feature: a swipe on MINEHUNT's field moves you one square that way, in
  any of eight directions, for a phone where the squares are too small
  to tap.
- UX: a graphics object's size stays on one line ("114 × 32") when its
  caption wraps.

## v0.7.75 — 2026-10-20

- Bug: in Settings, Data, the Calculator clock row drew its title over
  its description on a phone while the clock followed the device's (on
  a wide screen the description sat off to the right). A row that ends
  in its description now keeps it under the title.
- Feature: a finger dragging PICTURE's crosshair moves it to the point
  you want, so a phone needs no arrow keys to place it exactly. A drag
  that starts anywhere else still pans the plot.
- UX: MINEHUNT on a phone in landscape puts its pad beside the field,
  which takes the height the sheet leaves it, so the whole game fits
  without scrolling. Before, the field ran past the sheet and the pad
  sat below it.
- On a screen under 720 px wide, a sheet with one page (VIEW, INFORM,
  MINEHUNT) now fills the sheet's height, as its layout needs.

## v0.7.74 — 2026-10-20

- PICTURE brings the HP's graphics cursor to the plot view.
  - A crosshair starts in the middle of the view, and the plot takes the
    keyboard.
  - The arrow keys move the crosshair one pixel of the HP's screen at a
    time, and past an edge the view scrolls with it. A tap or click puts
    it anywhere, on any plot.
  - Enter, or the button in the corner that shows the point, puts (x,y)
    on the stack, rounded to the digits a pixel resolves, so it gives
    (1.2, -0.5) rather than a pixel's long fraction. In Trace mode,
    Enter puts the point on the curve.
  - Pictures copied, saved or shared leave the crosshair out.
- PICTURE's menu of drawing tools is still to come; the commands it
  stands for are here.

## v0.7.73 — 2026-10-20

- The README's list of what is not there yet names only real gaps: the
  HP's numbered menus, PICTURE's graphics cursor and units in symbolic
  commands. DEF, DESOLVE and LDEC had long been in.
- Its list of what is left out on purpose now names the equation library,
  the periodic table, RCLMENU, FILER, StreamSmart, the screen fonts and
  printing.
- The README's tour describes PICT under Plots and has a new Time and
  alarms section.

## v0.7.72 — 2026-10-20

- MINEHUNT, the HP's minefield game, in a sheet.
  - Cross the 8 × 16 field from the upper-left corner to the lower-right
    one. The pad's middle shows how many mines lie in the squares around
    you.
  - Move with the arrow keys, 1 to 9 for the diagonals, the pad, or a tap
    on a square next to you.
  - Nmines sets the number of mines, 1 to 64, and a negative number shows
    them. Without it there are 20.
  - K or Save stores the game in MHpar and ends it, and the next MINEHUNT
    picks it up and purges MHpar, as on the HP. Esc or Quit ends a game.
  - Play again starts a new field after a win or a mine.

---

## v0.7.71 — 2026-10-20

- →DATE, →TIME and CLKADJ set rpl.ai's clock.
  - `12.252030 →DATE` sets the date, keeping this year when it is left
    off. Flag -42 reads it as DD.MM.
  - `8.30 →TIME` sets a 24-hour time, fractions of a second included.
  - `8192 CLKADJ` moves the clock one second, 8192 ticks to the second,
    and takes a binary integer as TICKS gives one.
  - DATE, TIME, TICKS and alarms follow the new clock.
- The device's own clock stays as it is: rpl.ai keeps an offset, saved
  with the calculator. Settings, Data, says how far the calculator's
  clock is from the device's and has a Use the device clock button.
- →DATE refuses a date before 2000 or after 2090 with Bad argument value,
  where the HP ignores 1991 to 1999 without a word. This is noted in its
  reference entry.

---

## v0.7.70 — 2026-10-20

- SIDENS, silicon's intrinsic carrier density.
  - `300 SIDENS` gives about 9.89E9 per cm³. A temperature unit gives the
    answer in `1/cm^3`, such as `26.85_°C SIDENS`, and a name gives
    `'SIDENS(T)'`.
  - It uses the textbook model √(Nc·Nv)·(T/300)^1.5·e^(−Eg/2kT), with
    Sze's densities of states and Varshni's band gap. The HP's own fit is
    not published; this is noted in its reference entry and the README.

---

## v0.7.69 — 2026-10-20

- VER, DEDICACE and RULES.
  - `VER` gives Giac's version, 1.5, with the build's date run on, as
    V.YYYYMMDD runs a version and a date together.
  - `"Hi" DEDICACE` gives rpl.ai's own dedication with Hi added.
  - `RULES` shows the credits in a message box: rpl.ai, Giac's Bernard
    Parisse and Renée De Graeve, and thanks to Eric Rechlin, Joseph K.
    Horn, Jean-Yves Avenard, Cyrille de Brébisson, Claudio Lapilli and
    William C. Wickes.
- →HEADER, HEADER→, →KEYTIME, KEYTIME→ and →NDISP.
  - They check their setting and keep it: 0 to 2 header lines, 0 to 4096
    ticks, and at least one program line.
  - HEADER→ and KEYTIME→ give the setting back, 2 and 1138 at first.
  - The header and key time are saved with the calculator. →NDISP starts
    over on a reload, as at the HP's warmstart.
  - The screen and keys keep rpl.ai's own layout and timing. This is
    noted in each reference entry and the README.
- MENUXY now shows every one of the HP's 141 numbered CAS commands.

---

## v0.7.68 — 2026-10-20

- STURM, TRIG and TABVAR through Giac.
  - `'X^3+1' STURM` gives `{ [1] -1. [X^3+1 X^2 -1] 1. }`: P's content,
    then each multiplicity's Sturm sequence, followed by that
    multiplicity.
  - TRIG turns exponentials into sines and cosines, then simplifies with
    SIN²+COS²=1 towards cosines, or towards sines with flag -116 set.
  - `'X^2-1' TABVAR` gives the function, the variation table
    `{ { -∞ - 0 + ∞ } { ∞ ↓ -1 ↑ ∞ } }` and a picture of F, F′ and the
    table.
  - TRIG is in the CAS menu's TRIG folder and TABVAR in its CALC folder.
- Differences from the AUR, noted in each command's reference entry and
  the README:
  - STURM leaves out the extra `[1] 1.` pair the AUR's example shows.
  - TRIG of `LN(X+i)` keeps the term that makes it right for X<0.
  - TABVAR gives `?` where f has no limit, as at the pole of 1/X.
- A name in a list no longer draws with backticks in textbook view.
  SIGNTAB's `{ -∞ + -2 - 1 + ∞ }` showed its last ∞ as `` `∞` ``; it
  now draws bare, like the formulas beside it.
- SIGNTAB gives exact fractions as rationals, so a zero at 1/2 shows as
  1/2.

---

## v0.7.67 — 2026-10-20

- ASSUME, UNASSUME and ADDTOREAL, the HP's CAS assumptions, through
  Giac. After `'K>0' ASSUME` the integral of `EXP(-K*T)` from 0 to ∞ is
  `1/K`, and after `'Z≥0' ASSUME`, `'√(Z^2)' SIMPLIFY` gives `Z` and the
  roots of `Z^2=4` are just `Z=2`. Several conditions go in a list or
  joined by AND; UNASSUME forgets a name and ADDTOREAL keeps just that it
  is real. They live in REALASSUME, which is saved with the calculator
  and comes back with a backup's restore. Like VX and the modes, UNDO
  leaves them as they are.
- Differences from the HP, noted in the commands' reference entries and
  the README: REALASSUME starts empty rather than holding X, Y, t, S1 and
  S2, ASSUME keeps a strict `Z>0` as written where the HP makes it `Z≥0`
  (`Z≥MINR`, the AUR's way to say positive, reaches the CAS as `Z>0`), and
  ADDTOREAL does not follow flag -128.
- rpl.ai now has 736 of the HP 50g's 825 commands.

## v0.7.66 — 2026-10-20

- Symbolic matrices, part 2: the CAS commands take an array of
  expressions entry by entry, as EXPAND's AUR entry says. SUBST, `|`,
  DERIV, INTEG, ∫, INTVX, DERVX, EXPAND, SIMPLIFY, FACTOR, COLLECT,
  PARTFRAC, PROPFRAC, TSIMP and the trig and exponential rewrites all do:
  `[[ 'SIN(T)' T ][ 'T^2' 1 ]] 'T' DERIV` gives
  `[[ COS(T) 1 ][ 2*T 0 ]]`. Rewrites leave numeric entries as they are.
- DERIV by a vector of variables gives the gradient, as the AUR says:
  `'X^2*Y' [ X Y ] DERIV` gives `[ 2*X*Y X^2 ]`. A vector of functions
  with it gives the Jacobian matrix.
- DERIV of an exact number gives the integer 0 rather than 0., and FACTOR
  of a prime gives the number itself rather than a one-term formula.

## v0.7.65 — 2026-10-19

- A bare name in a matrix or vector no longer draws with backticks in
  textbook view. CAS results such as `[[ X 1 ][ 2 Y ]] LU` showed `` `Y` ``
  beside formula entries; it now shows Y, as the HP writes it.
- EVAL of a matrix or vector with symbolic entries evaluates each entry,
  so stored values fill in: with 3 in X, `[[ X 1 ][ 2 Y ]] EVAL` gives
  `[[ 3 1 ][ 2 Y ]]`, from the command line or a level's Evaluate (EVAL).
  The AUR's EVAL table leaves an array as it is; this is noted in EVAL's
  reference entry and the README's list of differences.
- A square matrix level's ⋯ menu offers Eigenvalues (EGVL) beside
  Inverse and Determinant, so a phone needs no typing for it.

## v0.7.64 — 2026-10-19

- Symbolic matrices, part 1: linear algebra. `[[ X 1 ][ 2 Y ]] INV`
  gives the exact inverse, `[ 3 4 ] [[ X 1 ][ 2 Y ]] /` solves the
  system, and RREF, RANK and LU work on symbolic entries, all through
  Giac. A singular symbolic matrix is an Infinite result, as a numeric
  one is.
- CHARPOL (PCAR) and JORDAN write a symbolic matrix's polynomials in VX:
  `[[ A B ][ C D ]] CHARPOL` gives `x^2-(A+D)*x+A*D-B*C`. JORDAN takes
  the minimal polynomial from the Jordan blocks, since Giac's own can be
  wrong for symbolic entries.
- ABS of a symbolic array is its Frobenius norm: `[ X 3 ] ABS` gives
  `√(X^2+9)`.
- Matrix products and sums, DOT, CROSS and DET leave out 1* and +0
  around symbolic entries: `[[ X 1 ][ 2 Y ]] [[ A B ][ C D ]] *` gives
  `X*A+C`, not `X*A+1*C`.
- The README now says plainly that exports, copies and shares keep the
  point under flag -51.

## v0.7.63 — 2026-10-19

- `;`, the HP's drop-safe command: drops level 1 if there is one and
  does nothing on an empty stack. With flag -51 set a typed `;` is the
  separator, so use DROP there.
- C$, the HP's counted string: `C$ 5 hello world` enters "hello" and
  the name `world`; `C$ $ ` enters the rest of the line as one string,
  quotes and all. It is in the Catalog with Insert. 733 commands.
- Fix: between 561 and 600 px the soft keys cut ◀ BACK to ◀ BA…; it now
  takes two lines like the other long labels.

## v0.7.62 — 2026-10-19

- Fix: a spreadsheet range pasted into the matrix writer or onto the
  command line read `0,125` as 125, and with flag -51 set read `12,345`
  as twelve thousand where the command line reads 12.345. A comma after
  a lone 0 is now a decimal comma, and with -51 set a lone comma is the
  fraction mark, as the command line reads it.
- The HP's FM, setting: an FM, key on the MODES menu, beside TXTBK, and
  a Decimal comma switch in Settings turn flag -51 on and off, so a phone
  in a comma locale finds it without typing `-51 SF`.
- Numbers pasted into the matrix writer with -51 set show the comma
  mark, as typed and loaded cells do.

## v0.7.61 — 2026-10-19

- Flag -51, part 7: the plot shows its axis labels, trace readout, range
  boxes and formula fields with the comma fraction mark, and reads a
  comma typed in a range box or formula field, so `-2,5` sets a range
  and `X^2+0,5` plots.

## v0.7.60 — 2026-10-19

- Fix: with flag -51 set, DISP, DISPXY, →GROB, LCD→ and LABEL still
  drew numbers with the point. They now use the comma fraction mark, as
  the HP's display does.
- Flag -51, part 6: the equation writer's insights (a value, zeros,
  holes) and the toast after pushing solutions, a non-string PROMPT
  message, and the unit-conversion and constant pickers show the comma
  mark too.

## v0.7.59 — 2026-10-19

- Flag -51, part 5: the equation writer draws numbers with the comma
  fraction mark and function arguments with `;`, and a comma typed on a
  computer or phone keyboard is the fraction mark there, a semicolon the
  separator.
- Fix: with -51 set, the keypad's , key (↱SPC) typed `, `, which the
  command line then read as a fraction mark after a digit, so
  `'MAX(1, 3)'` failed with Invalid algebraic. It now types `; `, the
  separator in comma mode, on the command line and in the matrix writer.

## v0.7.58 — 2026-10-19

- Flag -51, part 4: with `-51 SF`, →STR writes the comma fraction mark
  (`1.5 →STR` gives `"1,5"`) and STR→ and OBJ→ read a string the way the
  command line does (`"2,5" STR→` gives 2.5), so a program running in
  comma mode gets the HP's text and reads it back.

## v0.7.57 — 2026-10-19

- With flag -51 set, the Variables drawer's previews, the labels of custom
  menu keys and command search's result previews show the comma fraction
  mark too, as the stack does.

## v0.7.56 — 2026-10-19

- Flag -51, part 3: with `-51 SF` the keypad's . key types the comma, as
  the HP's does, and the matrix writer shows its cells with the comma mark
  and reads `3,2` typed into a cell as 3.2. The equation writer, →STR and
  exports keep the point for now.

## v0.7.55 — 2026-10-19

- Flag -51, part 2: with `-51 SF` the stack shows the HP's comma fraction
  mark and semicolon separators, in plain text and in textbook formulas,
  matrices and lists: `3,`, `(1,5; 2)`, `MAX(X; 0,25)+1,5`. EDIT, echo, a
  writer's entry carried to the command line, History, INFORM's fields,
  custom menu keys, shared links and the assistant's lines all reach the
  command line in that form, so they read back. The command line now reads
  any comma beside a digit as the fraction mark, as the HP does, so `1,`
  is the real 1 and a comma separating two numbers needs a semicolon. The
  writers, →STR and exports keep the point for now.

## v0.7.54 — 2026-10-19

- Flag -51, the HP's fraction mark, part 1: with `-51 SF` the command line
  reads a comma between digits as the decimal point and a semicolon as the
  separator, so `1,5` is 1.5, `(1,5;2)` a complex number and
  `'MAX(X;2,5)'` a function of two arguments, as on the HP. Answers to
  INPUT and INFORM read the same way. A comma with a space after it still
  separates, so an edited level such as `(1.5, 2.)` reads back. The stack,
  →STR and the writers keep the point for now; they follow in later parts.

## v0.7.53 — 2026-10-19

- ZFACTOR: `1.5 2 ZFACTOR` gives 0.8206, the compressibility factor of a
  hydrocarbon gas at a reduced temperature of 1.5 and a reduced pressure
  of 2. It solves Dranchuk, Purvis and Robinson's fit to the Standing-Katz
  chart, whose range (1.05 to 3, and up to 30) is the AUR's; the AUR names
  no method, so a result may differ slightly from the 50g's. Unit objects
  that reduce to numbers are taken, and a name gives `ZFACTOR(T,2.)`.

## v0.7.52 — 2026-10-19

- KEYEVAL: `53.1 KEYEVAL` presses the SIN key, numbered rc.p as for ASN.
  A positive number goes through the user keyboard, whether or not USER
  mode is on, and a negative one to the standard key. The press comes once
  the program that asked for it has finished, not partway through it, a
  difference from the HP; the alpha-shift planes 5 and 6 are refused.
- →LANGUAGE takes 0, English, the only language rpl.ai has; 1 (French) and
  2 (Spanish) are Bad argument value.

## v0.7.51 — 2026-10-19

- LOCAL and UNBIND: `{ ←A '←B=2' } LOCAL` makes the ← variables ←A (0) and
  ←B (2), which last from one command line to the next, and `UNBIND`
  removes them and gives `{ '←B=2' '←A=0' }`, as the AUR's example has it.
  Names starting with ←, the HP's compiled locals, can now be stored to,
  recalled and used in algebraics.

## v0.7.50 — 2026-10-19

- ⇨USER on the keypad, as on the 50g: ↰α turns USER mode on for the next
  key (1USR in the status line), a second press locks it and a third ends
  it; with flag -61 set the first press locks it. The α key shows USER
  while ↰ is down, and a program waiting for a key still gets ↰α as 71.2.

## v0.7.49 — 2026-10-19

- The HP's user keyboard: `« 2 * » 53.1 ASN` gives the SIN key a program,
  `{ obj key … } STOKEYS` assigns several, `RCLKEYS` lists them and
  `DELKEYS` removes one, a list of them, all (`0`) or the standard keys
  (`S`). Keys are numbered rc.p as on the 50g. With flag -62 set, USER
  shows in the status line and an assigned key, soft keys included, runs
  its object; ON always keeps its own action. Assignments are saved with
  the stack.

## v0.7.48 — 2026-10-19

- GRIDMAP draws how a complex function maps a grid: `'EXP(X+i*Y)' GRIDMAP`
  takes VPAR's input plane (XXRNG YYRNG), NUMY lines across x and NUMX
  along y, and draws their images, fitted in the plot view. X and Y are
  real and i is √-1; arithmetic, powers, roots, logs, exponentials, trig
  and hyperbolics work on complex arguments, in radians. The plot view has
  a Grid map kind for typing one in. Every HP 50g plot type is now in.
- DRAW3DMATRIX draws a matrix's values at (row, column, value), each joined
  to its neighbours, leaving out values outside vmin to vmax, and turns
  with a drag or the arrow keys as FAST3D does. With its mesh showing, the
  plot view's Level 1 and ΣDAT buttons plot a real matrix from either.

## v0.7.47 — 2026-10-19

- FAST3D draws z = f(x, y) over VPAR's view volume scaled to a cube, and
  you turn it: drag it with a finger or the mouse, or use the arrow keys
  as on the 50g. Pinch or scroll to zoom; the plot view's reset turns it
  back. The plot view has a Fast 3D kind for typing one in.
- The plot view's reset, and a double-click, fit a 3D picture again
  instead of jumping to the 2D default window, where it shrank to a dot,
  and a 3D picture no longer shows x and y readouts that mean nothing.

## v0.7.46 — 2026-10-19

- YSLICE draws z = f(x, y) as slices across x in perspective, NUMY of
  them, and PARSURFACE draws a parametric surface: x, y and z of two
  variables over VPAR's input plane, given as a list on level 1, so
  `0 1 XXRNG 0 6.2832 YYRNG { 'X*COS(Y)' 'X*SIN(Y)' 'X^2-.5' } PARSURFACE`
  draws a bowl. Both share WIREFRAME's view from VPAR's eye point, and the
  plot view has a Y-slice kind for typing one in.

## v0.7.45 — 2026-10-19

- WIREFRAME draws z = f(x, y) in perspective inside VPAR's view volume, as
  seen from its eye point: `2 -3 1.5 EYEPT 'SIN(X*3)*COS(Y*3)' WIREFRAME`.
  NUMY lines run across x and NUMX along y, each drawn smoothly rather than
  in the 50g's straight steps, with the view volume's box around them. The
  plot view hides its x-y grid while a wireframe shows, and has a Wireframe
  kind for typing one in.

## v0.7.44 — 2026-10-19

- VPAR, the 3D plots' parameters, arrives with the commands that set it:
  XVOL, YVOL and ZVOL the view volume, XXRNG and YYRNG the input plane,
  EYEPT the eye point, and NUMX and NUMY the steps. `-2 2 XVOL` stores
  `{ -2 2 -1 1 -1 1 -1 1 -1 1 0 -3 0 10 8 }`, the rest being the HP 48G
  plot form's defaults. The 3D plot types that read it come next.

## v0.7.43 — 2026-10-19

- MENUXY puts up the HP's numbered CAS commands as a temporary menu:
  `34 37 MENUXY` shows ATAN2S, ASIN2T, ASIN2C and ACOS2S. REWRITE shows
  the CAS's rewriting commands the same way, SOLVER opens the CAS menu's
  S.SLV folder, and LANGUAGE→ gives 0, English.

## v0.7.42 — 2026-10-19

- The HP's multiple-equation solver arrives. With a list of equations in
  EQ, MSOLVR puts up a menu with a key for each variable: the key stores
  level 1 in it and marks it user-defined, ⇦ solves for it and ⇨ recalls
  it, as the TVM keys do, and a user-defined variable's key is lit. ALL
  solves for every other variable. MROOT solves one equation at a time,
  each left with a single unknown, until it reaches the variable asked for:
  with `{ 'V=V0+A*T' 'X=V0*T+A*T^2/2' }` in EQ and V0, A and X
  user-defined, `'V' MROOT` finds T on the way to V. MUSER and MCALC mark
  variables user-defined or calculated, MITM sets the menu's title and
  order, and MINIT starts again from EQ.
- Compatibility: Mpar is a list you can read and edit,
  `{ equations "title" { menu order } { user-defined variables } }`, where
  the HP keeps library data, and EQ must hold algebraics, not programs.

## v0.7.41 — 2026-10-19

- PCONTOUR draws a contour map: `'X^2-Y^2' PCONTOUR` shows ten level
  curves of f(x, y) between its lowest and highest values across the plot
  view, as the 50g's contour plot does in VPAR's view space. The curves
  follow the view as it pans and zooms, and the plot view has a Contour
  kind for typing one in.

## v0.7.40 — 2026-10-19

- PLOT and PLOTADD, the CAS plot commands: `'SIN(X)' PLOT` stores the
  expression in EQ, leaves it on the stack and plots it as PPAR's plot
  type; `'X^2' PLOTADD` adds an expression to EQ's list and to the plot
  beside the traces already there.
- CONSTANTS opens the Characters drawer at the constants (π, e, i, ∞, MAXR
  and MINR), and MATHS opens the CAS menu, as MAIN does.

## v0.7.39 — 2026-10-19

- ANIMATE plays graphics objects one after another over PICT in the plot
  view, as the 50g does: `g1 g2 g3 3 ANIMATE` shows them in turn, 0.1 s
  apart, until the plot view closes, and `{ 3 { #10d #10d } .2 2 }` as
  the count sets where they go, the delay and how many runs. Variables
  holding graphics objects work too, and the stack is left as it was, so
  the AUR's `… OBJ→ ANIMATE DROPN` idiom works.

## v0.7.38 — 2026-10-19

- SCROLL, the programmable VIEW: it takes the object on level 1 and opens
  it full size in the View sheet, scrolling both ways and zooming with a
  pinch, so a program can show a long formula or matrix whole. The sheet
  has no Edit, Copy or Share, as the object has left the stack.

## v0.7.37 — 2026-10-19

- LCD→ returns the display as a 131 × 80 graphics object, as the 50g
  does: the stack's levels upward from the menu row, numbered at the left
  with their values at the right in rpl.ai's pixel font, and a program's
  DISP lines and DISPXY and →LCD pixels over them. `LCD→ PICT STO PVIEW`
  shows it as a picture. The menu row is left blank. The pixel font gains
  an ellipsis for values too wide for their row.

## v0.7.36 — 2026-10-19

- DISPXY and →LCD draw on the program display, as on the 50g: the
  display above the command line, where DISP writes, gains the HP's 131 ×
  72 pixels. `"Ready" { #10d #20d } 2 DISPXY` writes at that pixel in
  rpl.ai's pixel font, and `grob →LCD` shows a graphics object from the
  top left corner, cut to the screen. Like DISP's lines, the picture goes
  when the program ends or pauses unless FREEZE keeps it.

## v0.7.35 — 2026-10-19

- TRUTH shades the region of the plot view where a condition holds, as the
  50g's truth plot does: `'X^2+Y^2<4 AND X>0' TRUTH` fills the right half
  of a disc. Any non-zero value counts as true, so comparisons, AND, OR
  and NOT all work, and INDEP's and DEPND's ranges in PPAR bound the
  region. The shading follows the view as it pans and zooms, and the plot
  view has a Truth kind for typing one in.

## v0.7.34 — 2026-10-19

- CONIC draws a second-order curve f(x, y) = 0, as the 50g does: at each
  x it solves the equation's quadratic in y, so `'X^2/4+Y^2=1' CONIC`
  draws an ellipse, `'X^2-Y^2=1' CONIC` both arms of a hyperbola. The two
  branches are joined where they meet, so an ellipse closes instead of
  leaving gaps at its ends. The plot view has a Conic kind for typing one
  in.

## v0.7.33 — 2026-10-19

- SLOPEFIELD draws dy/dx = f(x, y) as a slope field: `'X-Y' SLOPEFIELD`
  puts a short dash of slope f at each point of a grid across the plot
  view, every dash the same length on screen. The field follows the view
  as it pans and zooms, and the plot view has a Slopes kind for typing one
  in. As with FUNCTION, the command draws level 1 at once; VPAR's step
  counts aren't used.

## v0.7.32 — 2026-10-19

- RRK, RRKSTEP and RSBERR solve y' = f(t,y) when the problem is stiff,
  given f's partial derivatives: `{ T Y F FY FT } .00001 8 RRK` steps T
  to 8 and Y to 8/65 within the tolerance, as the AUR's example does.
  RRKSTEP uses a fourth-order Rosenbrock method (Kaps and Rentrop's) where
  a step is stiff and Runge–Kutta–Fehlberg elsewhere, and returns the
  method it used (1 or 2). RSBERR gives a Rosenbrock step's change and
  its error. The partial derivatives may be plain numbers, such as -1000.

## v0.7.31 — 2026-10-19

- FANNING and DARCY give a pipe flow's friction factor from the relative
  roughness ε/D and the Reynolds number: 16/Re (64/Re for DARCY) for
  laminar flow up to Re = 2100, and Colebrook's equation for turbulent
  flow, so `.0001 1E5 DARCY` gives 0.0185, as a Moody chart reads. Both
  take unit objects that reduce to numbers, stay symbolic for names, and
  work inside algebraics.

## v0.7.30 — 2026-10-19

- A built-in command named in an algebraic now runs on its numbers, as on
  the HP: `'UTPN(0,1,0.5)' EVAL` gives 0.308537538726, and
  `'TRNC(1.27,1)' →NUM` gives 1.2. Before, NDIST, UTPN, UTPC, UTPF, UTPT,
  TRNC, RND, PSI and others stayed symbolic, and GAMMA worked only for
  whole numbers. A command that isn't one of the algebra's own functions
  runs in a scratch copy of the calculator, so `'SF(5)' EVAL` changes no
  flag, and one that doesn't leave exactly one number stays as written.

## v0.7.29 — 2026-10-19

- AUTO scales PPAR's window for its plot type. For FUNCTION, the type to
  start, it samples EQ at 40 points across the x range and sets the y
  range to hold the values and the origin: `'X^2' STEQ AUTO` gives a
  window of (-6.5,0) to (6.5,42.25). POLAR fits both ranges to the curve,
  CONIC makes the y scale match the x scale, and BAR, HISTOGRAM and
  SCATTER fit ΣDAT. The plot variable is bound only while EQ is sampled,
  so a variable of the same name keeps its value. The plot type commands
  here draw at once and leave PPAR's type as it is, so AUTO follows a type
  only when it is stored in PPAR, and it leaves PARAMETRIC alone.
- SCLΣ fits the window to ΣDAT's XCOL and YCOL columns, so a scatter plot
  fills it.
- BAR, HISTOGRAM and SCATTER draw ΣDAT at once, as BARPLOT, HISTPLOT and
  SCATRPLOT do.

## v0.7.28 — 2026-10-19

- CIRC composes two permutations, level 1's done first:
  `{ 3 4 5 2 1 } { 2 1 4 3 5 } CIRC` gives `{ 4 3 2 5 1 }`, the AUR's
  example. Permutations of different lengths compose too, the shorter one
  leaving the entries past its end in place.
- RATIO is the HP's prefix form of /: `6 3 RATIO` gives 2, and
  `RATIO(A,2)` typed in an expression reads as `A/2`.
- GROBADD sets one graphics object under another, both against the left
  edge, in a graphics object as wide as the wider one.
- PICTURE, and GRAPH, its HP 28 name, show PICT in the plot view as
  `{ } PVIEW` does. There is no graphics cursor, and a program carries on
  at once instead of waiting for CANCEL.
- TEXT closes the plot view and goes back to the stack, as the HP leaves
  the graphics display; `DRAW 5 WAIT TEXT` shows a plot for five seconds.
- `{ } PVIEW` and PICTURE frame PICT in the 50g's default window,
  (-6.5,-3.9) to (6.5,4), before anything sets PPAR, instead of the plot
  view's own -10 to 10.

## v0.7.27 — 2026-10-19

Text in graphics objects, in rpl.ai's own pixel font.

- A 5 × 7 pixel font drawn for rpl.ai covers letters with descenders,
  digits, punctuation, Greek and the HP's math symbols (π √ ∫ Σ Δ ∂ → ≤ ≥
  ≠ ∞ ∠ and more). Each character takes six columns and eight rows, and
  looks the same on every device.
- →GROB draws any object as a graphics object, as the stack shows it:
  `"A=2" 1 →GROB` gives a Graphic 18 × 8. The 50g's three sizes share the
  one font here; size 0 leaves an algebraic's or unit's quotes off, where
  the HP draws its Equation Writer picture.
- LABEL writes on PICT the axes' names, from AXES or else INDEP and DEPND,
  and the window's limits at the ends of the axes: the x values under the
  horizontal axis, the y values beside the vertical one, moved to the
  other side when they would fall off PICT.

## v0.7.26 — 2026-10-19

- DRAX draws the axes on PICT through the crossing AXES gives, (0,0) to
  start, with a tick mark every ATICK: ten pixels to start, or a spacing in
  user units, as on the 50g.
- A graphics object on the stack shows as its picture beside
  `Graphic w × h`: small ones scaled up to three times, large ones scaled
  down to fit, in the stack's ink with a thin frame for its edges. The HP
  shows only the size.

## v0.7.25 — 2026-10-19

Working with graphics objects as the HP does, on PICT or on one another.

- GOR and GXOR lay a graphics object on PICT or on another graphics object,
  its top left at a point in user units or pixels: `PICT { #0d #0d } grob
  GXOR`. GOR adds its pixels, GXOR toggles them, so a second GXOR, as
  with LASTARG in the AUR's example, puts the picture back.
- REPL overwrites a rectangle of a graphics object or PICT, and leaves it as
  it is when the corner is off it. SUB cuts a rectangle out between two
  corners, both included: `PICT { #10d #20d } { #20d #40d } SUB` gives a
  Graphic 11 × 21, as in the AUR.
- NEG turns a graphics object's pixels over; `PICT NEG` turns PICT's.
- On PICT these change PICT and leave nothing on the stack; on another
  graphics object they return the result.

## v0.7.24 — 2026-10-19

Drawing on PICT, and seeing it: the HP's pixel drawing commands.

- LINE, TLINE, BOX, ARC, PIXON and PIXOFF draw on PICT, and PIX? tests a
  pixel. A point is `(x,y)` in PPAR's user units or `{ #col #row }` in
  pixels, as the AUR gives them: `(0,0) (3,2) LINE`, `{ #20d #20d } #6d 0
  360 ARC` in degrees. TLINE toggles the pixels on its line. ARC's radius
  is in pixels, as on the 50g. A point off PICT draws only the part on it.
- C→PX and PX→C convert between the two: `(0,0) C→PX` gives
  `{ #65d #40d }`, the centre of the 131 × 80 PICT.
- PVIEW opens the plot view on PICT: `{ } PVIEW` in PPAR's window, and
  `(x,y) PVIEW` or `{ #n #m } PVIEW` with that point at the top left. PICT's
  pixels show over the plot as the 50g's square pixels, in the theme's ink,
  and follow a program's drawing as it happens. The plot itself stays as
  sharp as before; DRAW, FUNCTION and the other plots draw their curves
  under PICT rather than into it.

## v0.7.23 — 2026-10-19

Graphics objects, and PICT to hold one: the first step of the HP's
drawing, which will draw on PICT pixel by pixel as the 50g does.

- A graphics object is written as the HP writes one, `GROB 8 2 F00F`: its
  width, height and pixels in hex, a row at a time, two digits a byte, low
  nibble first. The stack shows it as `Graphic 8 × 2`, →STR and editing
  give the GROB text back, TYPE gives 11, SIZE its width and height, and
  SAME compares the pixels. It is saved with the rest of the calculator
  and in `.rpl` files.
- BLANK makes a blank one: `#8d #2d BLANK`.
- PICT puts PICT on the stack for RCL, STO, PURGE and SIZE, as the AUR
  describes. It starts as a blank 131 × 80; a smaller graphics object
  stored in it goes in the top left corner of a 131 × 80, and `{ PICT }
  PURGE` leaves a 0 × 0.
- PDIM resizes PICT, 2048 pixels wide at most and 131 × 80 at least. Given
  two corners it also sets PPAR's, sizing PICT to keep the plot's scale.
  ERASE blanks PICT. CENTR and the scale commands now use the size of PICT
  rather than always 131 × 80.
- Nothing draws on PICT or shows it yet: PVIEW and the drawing commands
  come next.

## v0.7.22 — 2026-10-19

DIFFEQ follows PPAR too, as the AUR describes it.

- With two numbers in INDEP, `{ X 0 2 } INDEP`, DIFFEQ solves from the
  first to the second, backward when the first is larger, rather than
  across the whole plot from x = 0. INDEP's name is the independent
  variable, beside X.
- With two numbers in DEPND, `{ Y 1 .0001 } DEPND`, the first is the
  initial value instead of level 2's, and DEPND's name is the solution,
  beside Y. The tolerance is kept but not used, as the plot solves in fixed
  steps.
- FUNCTION, POLAR, PARAMETRIC and DIFFEQ take a lone name as well as an
  expression: `'X' FUNCTION` plots y = x, and `'Y' DIFFEQ` solves y' = y.
  They used to say they needed an expression.

## v0.7.21 — 2026-10-19

Plots follow more of PPAR: the independent variable, the resolution and the
axes.

- INDEP names a plot's variable, beside X, T and θ: `'A' INDEP` plots
  `'A^2'`. With a range, `{ X 0 2 } INDEP` draws FUNCTION only from 0 to 2,
  and POLAR and PARAMETRIC sweep that range instead of a full turn or -10
  to 10.
- RES sets the step between plotted values: `.5 RES` plots a point every
  half unit, counted from the start of INDEP's range or the window's left
  edge. A binary `#n` counts the plot view's own pixels, and only FUNCTION
  takes one, so plots stay smooth at 0 as before.
- AXES moves the axes' crossing, and the grid lines and labels follow it;
  a tick spacing in units, from AXES or ATICK, draws a grid line at every
  multiple of it from the crossing, or every few multiples when they would
  crowd. A spacing in pixels, the default `#10`, keeps the plot's own grid.
- DIFFEQ still starts from its own initial value, level 2's, at x = 0 or
  the window's left edge. DEPND and the axis labels are only stored, for
  LABEL and the rest of PICT to come.

## v0.7.20 — 2026-10-19

The first step of the HP's PICT and plot setup: the plot window in PPAR.

- PMIN, PMAX, XRNG, YRNG, RES, AXES, ATICK, CENTR, SCALE, SCALEW, SCALEH,
  \*W, \*H, INDEP and DEPND set the reserved variable PPAR as the AUR
  describes, starting from the HP 50g's
  `{ (-6.5,-3.9) (6.5,4) X 0 (0,0) FUNCTION Y }`. CENTR and the scale
  commands work on the 50g's 131 × 80 PICT, with a tick every 10 pixels:
  `(1,2) CENTR` puts (1,2) under the centre pixel, and `2 2 SCALE` gives
  two units per tick.
- Once PPAR exists, FUNCTION, POLAR, PARAMETRIC, DIFFEQ and DRAW start the
  plot in its window, as the HP does; without it the plot still fits what
  it draws. Statistics plots still fit their data.
- INDEP, DEPND, RES and AXES are stored in PPAR but the plot view doesn't
  use them yet.

## v0.7.19 — 2026-10-19

The HP's undefined symbol arrives:

- `?` gives the algebraic `?`, the result the AUR says arithmetic leaves
  undefined, and an algebraic can hold it: `'?+1'`.
- EVAL gives `?` for anything worked out from `?` (`'?+1' EVAL`,
  `'ATAN(?)' EVAL`) and for an undefined result such as `'∞-∞' EVAL`, which
  0.7.18 left as typed.
- A difference from the HP: a line that starts with `?` still asks the
  assistant, so `?` on its own comes from the Catalog, command search or
  `'?'`, or anywhere later in a line (`1 ? +`).

## v0.7.18 — 2026-10-19

The ∞ added in 0.7.13 now evaluates as the AUR's own example does:

- EVAL hands an expression that still holds ∞ to the CAS, so
  `'ATAN(-∞)' EVAL` gives -π/2 (-90 in degrees), `'1/∞' EVAL` and
  `'EXP(-∞)' EVAL` give 0, and `'X+∞' EVAL` gives ∞. These used to stay as
  typed. One the CAS calls undefined, such as `'∞-∞'`, stays as it is,
  where the HP gives its ? symbol.
- An infinity beside an operator now reaches the CAS in parentheses: X+∞
  was sent as `X++infinity`, which Giac reads as an increment.

## v0.7.17 — 2026-10-19

The eighteenth batch of missing HP 50g commands adds four for variables:

- `STORE` stores the number an expression evaluates to, where STO keeps
  the expression: with 2 in Y, `'17*Y' 'Z' STORE` stores and returns 34,
  as the AUR shows. An expression that stays symbolic is stored as its
  numerical value (`'√2' 'Z' STORE` gives 1.41421356237), and one with no
  numerical value is Bad argument value.
- `RENAME` ( 'new' 'old' → ) renames a variable in the current directory;
  a new name already in use is Name conflict.
- `DIR` pushes an empty directory, so `DIR 'NAME' STO` makes one as CRDIR
  does.
- `▶`, the store arrow, is STO that leaves the object on the stack:
  `5 'A' ▶` stores 5 in A and leaves 5. The manual's page for it had lost
  its ▶ when it was converted, so its heading read only "(Store)"; the
  reference now shows it.

## v0.7.16 — 2026-10-19

The seventeenth batch of missing HP 50g commands adds two:

- `ANS`, typed in RPN mode, is PICK, as the AUR says: `10 20 30 3 ANS`
  copies 10 to level 1. The history of answers it reads in algebraic mode
  doesn't exist here.
- `SEVAL` puts in the values of stored variables and simplifies each
  argument of the top level, leaving the top level itself alone:
  `'(X^2-1)/(X-1)+(X^2-4)/(X-2)' SEVAL` gives `'X+1+(X+2)'`. With π stored
  in Y, the AUR's `SIN(3*X-Y+2*Z-(2*X-Z))-SIN(X-2*Y+(Y+3*Z))` gives
  `-SIN(X+3*Z)-(-SIN(X+3*Z))`, the same value as the AUR's
  -SIN(π-(X+3*Z)) on each side, written as the CAS writes it.

## v0.7.15 — 2026-10-19

The sixteenth batch of missing HP 50g commands adds two:

- `CHINREM` solves two polynomial congruences, each given as
  [ expression modulus ]: `[ 'X^2+1' 'X+2' ] [ 'X-1' 'X+3' ] CHINREM`
  gives `[ '9*X+23' 'X^2+5*X+6' ]`. The AUR shows the same solution
  unreduced, X^3+2*X^2+5 over -(X^2+5*X+6); here it comes reduced modulo
  the product of the moduli.
- `DOMAIN` lists where a function of the CAS variable is defined (+) and
  undefined (?) along the real line: after `'F(A)=√(A+1)' DEFINE`,
  `'F(X)' DOMAIN` gives `{ -∞ ? -1 + ∞ }`, as the AUR shows. A lone point
  left out, such as 0 for 1/X, isn't listed, and a function the
  calculator doesn't know is Unknown operator.

## v0.7.14 — 2026-10-19

The fifteenth batch of missing HP 50g commands adds `PROMPTSTO`:

- `'A' PROMPTSTO` asks for a value under the prompt `A?`, as INPUT asks,
  and stores what the answer reads as in A: type 42 and Enter, and A
  holds 42. It works typed on the command line and inside a program,
  which halts for the answer and runs on once it is stored.

## v0.7.13 — 2026-10-19

The fourteenth batch of missing HP 50g commands adds three:

- `TVM` opens the TVM menu, as the HP's TVM command opens its solver.
- `∞` executed gives the algebraic `∞`, as the HP's keyboard and Catalog
  do, for LIM and the CAS commands: `'ATAN(-∞)' SIMPLIFY` gives -π/2.
  Breaking change: a bare ∞ used to push the name ∞. EVAL still leaves
  ATAN(-∞) as it is where the HP gives -(π/2); that is for a later
  release.
- The HP's `dn` notation: EVAL differentiates a built-in function in its
  nth argument, so `'d1SIN(2*X)' EVAL` gives `COS(2*X)`, as the AUR
  shows, and `d1d1` differentiates twice. A function the calculator
  doesn't know, such as Y in `d1Y(X)`, stays as written for DESOLVE.

## v0.7.12 — 2026-10-19

The thirteenth batch of missing HP 50g commands opens objects for
editing:

- `EDIT` opens level 1 in the command line, laid out as the level's own
  edit does; Enter puts the edited object back on level 1.
- `EDITB` opens level 1 in the editor that suits it: an algebraic in the
  Equation Writer, a matrix or vector in the Matrix Writer, anything else
  in the command line.
- `'F' VISIT` opens the contents of the variable F in the command line,
  and Enter stores the edited object back in F; `VISITB` uses the editor
  that suits the contents, as the Variables drawer's edit button does.

## v0.7.11 — 2026-10-19

The twelfth batch of missing HP 50g commands adds two:

- `SVD` gives a matrix's singular value decomposition as the AUR
  describes it: U and V square and orthogonal and S largest first, so
  that A = U·diag(S)·V. `[[1 2][3 4][5 6]] SVD` gives a 3×3 U, a 2×2 V
  and `[ 9.52551809157 .514300580659 ]`; `S { 3 2 } DIAG→` builds
  diag(S). It sits in the MATRIX menu's FACTR folder beside SVL.
- `SIGNTAB` tabulates the sign of an expression in the CAS variable:
  `'2-X^2' SIGNTAB` gives `{ -∞ - -√2 + √2 - ∞ }`, the zeros and poles
  in increasing order with + or - between them, as the AUR shows.

## v0.7.10 — 2026-10-19

The eleventh batch of missing HP 50g commands solves differential
equations:

- `DESOLVE` solves an ordinary differential equation for a function,
  written in the HP's notation: `d1Y(X)` is Y's derivative in its first
  argument and `d1d1Y(X)` its second.
  `'d1Y(X)+2*Y(X)=EXP(3*X)' 'Y(X)' DESOLVE` gives
  `{ 'Y(X)=(5*cC0*EXP(-2*X)+EXP(3*X))/5' }`, the AUR's answer written
  another way, with the HP's arbitrary constant cC0. A list of the
  equation and initial conditions, such as `'Y(0)=1'`, fixes the
  constants. Every solution found is listed.
- `LDEC` solves a linear differential equation with constant coefficients
  from its right side and auxiliary polynomial: `'2*SIN(X)' 'X^2+1' LDEC`
  solves y''+y = 2·sin(x). The HP's system form, a matrix of
  coefficients, is not supported yet.
- Both sit in the CAS menu's CALC folder after ILAP.

## v0.7.9 — 2026-10-19

The tenth batch of missing HP 50g commands adds four numeric solvers:

- `RKF` solves y' = f(t,y) by the Runge–Kutta–Fehlberg method, as the HP
  does, with t and y kept in their variables: after
  `0 'T' STO 0 'Y' STO '1/(1+T^2)-2*Y^2' 'F' STO`,
  `{ T Y F } .00001 8 RKF` leaves 8 in T and .123077279663 in Y, within
  2E-9 of the HP's .123077277659 (the exact value is 8/65). The tolerance
  may be a list `{ tol h }` that also gives the first step.
- `RKFSTEP` takes one step within the tolerance and gives the step to try
  next; `RKFERR` gives the change in y and the error estimate for a step
  of h, leaving t and y as they were.
- These take a scalar y for now; the HP's vector problems are not
  supported yet.
- `MSLV` solves a system of equations numerically from a vector of
  guesses: `[ 'SIN(X)+Y' 'X+SIN(Y)=1' ] [ X Y ] [ 0 0 ] MSLV` gives
  `[ 1.82384112611 -.968154636175 ]`. It finds real solutions only.

## v0.7.8 — 2026-10-19

The ninth batch of missing HP 50g commands adds five for rewriting
expressions:

- `↓MATCH` and `↑MATCH` rewrite the parts of an expression that match a
  pattern and give 1 if they rewrote anything, else 0. A name starting
  with `&` matches any part, the same part wherever it repeats:
  `'SIN(U+V)' { 'SIN(&A+&B)' 'SIN(&A)*COS(&B)+COS(&A)*SIN(&B)' } ↓MATCH`
  expands the sine. A third item in the list is a condition the match
  must meet. `↓MATCH` works from the top down and `↑MATCH` from the
  innermost parts up; neither looks again at what it just rewrote, so a
  second call carries on. Algebraics now accept names such as `&A`.
- `FDISTRIB` distributes every product and quotient over sums in one
  step, without collecting terms, laid out as the AUR's example.
- `SHOW` evaluates the variables in an expression except those in a
  list, or only those that lead to a given name:
  `'X-Y+2*C+3*D' { X Y } SHOW` gives `X-Y+14+15` with 7 in C and 5 in D.
- `QUAD` is the HP 48's name for `SOLVE`.

## v0.7.7 — 2026-10-19

The eighth batch of missing HP 50g commands adds the HP's CAS menu commands
and `CASCFG`:

- `ALGB`, `DIFF`, `EXP&LN`, `TRIGO` and `MAIN` open the CAS menu, or its
  ALG, CALC, EXP&LN or TRIG folder; `ARIT`, `INTEGER` and `MODULAR` the
  INTEGER menu or its INTEG or MODUL folder; `POLYNOMIAL`, `MATR` and
  `TESTS` the POLY, MATRIX and LOGIC menus. Each opens the app's menu that
  holds the same commands as the HP's, so the soft keys differ in places.
- `CASCMD` and `HELP`, the HP's browsable lists of CAS commands, open the
  Catalog, where each command opens its reference page.
- `CASCFG` puts back the CAS defaults: exact mode, real mode, VX `x` and
  the modulus 13.

## v0.7.6 — 2026-10-19

The seventh batch of missing HP 50g commands adds five for matrices and
quadratic forms:

- `SYLVESTER` writes a symmetric matrix as PᵀDP: `[[1 2][2 4]] SYLVESTER`
  gives D as `[ 1 0 ]` and P as `[[ 1 2 ][ 0 1 ]]`, as the AUR does. A
  zero pivot before the last row is Bad argument value.
- `GAUSS` reduces a quadratic form to a sum of squares:
  `'X^2+2*A*X*Y' [ X Y ] GAUSS` gives `[ 1 -A^2 ]`, `[[ 1 A ][ 0 1 ]]`,
  `(A*Y+X)^2-Y^2*A^2` and the variables.
- `RREFMOD` row-reduces modulo the CAS modulus that MODSTO sets. Its
  pivots are 1, where the AUR's own example leaves a -1.
- `DIAGMAP` applies a function to a diagonalizable matrix through its
  eigenvalues: `[[1 1][0 2]] « → X 'EXP(X)' » DIAGMAP` gives
  `[[ e e²-e ][ 0 e² ]]`.
- `LCXM` builds a matrix from a program of the row and column:
  `2 3 « → I J 'I+2*J' » LCXM` gives `[[ 3 5 7 ][ 4 6 8 ]]`.

## v0.7.5 — 2026-10-19

The sixth batch of missing HP 50g commands adds seven:

- `DEF` defines a variable or function as DEFINE does and leaves the
  equation, so `'NEW(A,B)=(A-B)/(A+B)' DEF` gives it back and
  `'NEW(2,1)' EVAL` gives 1/3.
- `UNASSIGN` purges variables and gives their values, or a missing one's
  name: `{ U V } UNASSIGN` gives `{ 17.5 V }`.
- `PUSH` saves the flags and the directory path, and `POP` restores the
  last saved.
- `APPLY` builds a function call: `{ 'X+1' 2 } 'F' APPLY` gives
  `F(X+1,2)`. `QUOTE` gives its argument back unevaluated.
- `DROITE` gives the line through two points: `(1,2) (3,4) DROITE` gives
  `Y=X-1.+2.`, and symbolic points keep the AUR's slope,
  `Y=(π-e)/(e-π)*(X-π)+e`.

## v0.7.4 — 2026-10-19

The fifth batch of missing HP 50g commands adds nine:

- `FFT` and `IFFT`, the discrete Fourier transform and its inverse, of a
  vector or a single row or column, or of a matrix in two dimensions;
  each size must be a power of 2, as on the HP. `[ 1 2 3 4 ] FFT` gives
  `[ (10, 0) (-2, 2) (-2, 0) (-2, -2) ]`.
- `F0λ`, the fraction of a black body's emission below a wavelength, in
  meters and kelvins or any length and temperature units:
  `2.898E-6 1000 F0λ` gives 0.250106293888.
- `C2P` and `P2C` convert between a permutation and its cycles:
  `{ 3 4 5 2 1 } P2C` gives `{ { 1 3 5 } { 2 4 } }` and its signature -1.
- `LININ` tests whether an expression is structurally linear in a name:
  1 for the AUR's first example, 0 for `(X^2-1)/(X+1)`.
- `INT` gives an antiderivative at a point: `'SIN(X)' 'X' 'Y' INT` gives
  `-COS(Y)`.
- `STEQ` and `RCEQ` store and recall EQ in the current directory.

DARCY, FANNING, SIDENS and ZFACTOR wait: the AUR gives neither their
formulas nor examples to check against.

## v0.7.3 — 2026-10-19

The fourth batch of missing HP 50g commands adds eleven for matrices and
vector spaces, each giving the AUR's example:

- `KER` and `IMAGE` give a basis of a matrix's kernel and image:
  `[[1 1 2][2 1 3][3 1 4]] KER` gives `{ [ 1 1 -1 ] }` and IMAGE gives
  `{ [ 1 0 -1 ] [ 0 1 2 ] }`.
- `BASIS` gives a basis of the space a list of vectors spans, and
  `IBASIS` one of the intersection of two such spaces.
- `AXQ` turns a matrix into its quadratic form, and `QXA` turns a
  quadratic form back into its matrix.
- `SNRM` is the spectral norm (a vector's length, a matrix's largest
  singular value), `SRAD` the spectral radius, and `SVL` the singular
  values, largest first. SNRM and SRAD join the MATRIX menu's NORM folder,
  SVL its FACTR folder.
- `ISOM` names a 2-d or 3-d isometry: `[[0 -1][-1 0]] ISOM` gives
  `{ [ 1 1 ] -1 }`, the reflection in y = -x. `MKISOM` builds one:
  `'π/2' 1 MKISOM` gives `[[ 0 -1 ][ 1 0 ]]`.

## v0.7.2 — 2026-10-19

The third batch of missing HP 50g commands adds nine from the CAS's
calculus menus, each giving the AUR's example, all in the CAS menu's CALC
folder:

- `RISCH` is INTEG by another name: `'Y^2-3*Y+2' 'Y' RISCH`.
- `IBP` integrates by parts: `'X*COS(X)' 'SIN(X)' IBP` gives
  `SIN(X)*X` and `-SIN(X)`, which INTVX and + finish.
- `SIGMA` and `SIGMAVX` give a discrete antiderivative G, with
  G(x+1)-G(x) the expression: `'2*X-2*Y' 'Y' SIGMA` gives
  `2*X*Y-Y^2+Y`.
- `POTENTIAL` and `VPOTENTIAL` undo DERIV and CURL on a vector field; a
  field that has none is Bad argument value.
- `HESS` gives the Hessian, the gradient and the variables. Its entries
  come simplified, `4*U` where the HP shows `2*(2*U)`.
- `FOURIER` gives the nth complex Fourier coefficient over one period, the
  PERIOD variable or 2π: `'X^2' 0 FOURIER` gives `4/3*π^2`.
- `TABVAL` evaluates an expression at a list of values, storing it in EQ
  as the HP does: `'X^2+1' { 1 2 3 } TABVAL` gives the expression and
  `{ { 1 2 3 } { 2 5 10 } }`.

## v0.7.1 — 2026-10-19

The second batch of missing HP 50g commands adds twelve from the CAS,
each giving the AUR's example:

- `EXP2POW` turns `EXP(5*LN(X))` into `X^5`, and `EXP2HYP` writes it as
  `SINH(5*LN(X))+COSH(5*LN(X))`. Both join the CAS menu's EXP&LN folder.
- `SINCOS` turns `EXP(i*X)` into `COS(X)+i*SIN(X)`, in the TRIG folder.
- `POWEXPAND` writes `(X+1)^3` as `(X+1)*(X+1)*(X+1)`, for `DISTRIB` to
  expand a step at a time.
- `LVAR` keeps its expression and lists its variables as LNAME does,
  but with `COS(B)` or `MYFUNC(PQ)` counted as one variable.
- `FXND` splits `(X-3)^2/(Z+4)` into `(X-3)^2` and `Z+4` as written.
- `DEGREE` gives the degree in VX, or else the first variable; an
  equation counts as its left side minus its right, and zero is -1.
- `REORDER` sorts a polynomial by the powers of a variable.
- `DIVPC`, in the CALC folder, is the Taylor polynomial at 0 of a
  quotient: `'X^3+4*X+12' '11*X^11+1' 4 DIVPC` gives `12+4*X+X^3`.
- `RESULTANT`, `STURMAB` and `LAGRANGE` join the POLY menu.
  `'X^3+2' -2 0 STURMAB` gives `{ -6 1 }`, P(-2) and the one root in
  [-2, 0]. `[[1 3 4 2][6 7 8 9]] LAGRANGE` gives
  `(8*x^3-63*x^2+151*x-60)/6`.

`INV` and `SQ` inside an expression now reach Giac as its own inverse and
square, where every CAS command took them for unknown functions, so
`'INV(X)*X' EXPAND` gives 1.

## v0.7.0 — 2026-10-19

0.7 fills in the HP 50g commands still missing, a batch at a time. This
first batch adds seven:

- `RCLVX` and `STOVX`, the HP's names for reading and setting the CAS
  variable VX.
- `I→R` and `R→I` (and `I->R`, `R->I`): `5 I→R` gives `5.` and `7. R→I`
  gives `7`; a real with a fraction is Bad argument value.
- `LGCD`, the GCD of a list, which stays on the stack under it, as the
  AUR has it: `{ 12 18 24 } LGCD` gives the list and 6.
- `TEVAL`, which evaluates as EVAL does and adds the seconds it took,
  tagged `s`.
- `VERSION`, the app's version and its copyright line.

## v0.6.168 — 2026-10-19

On a phone, a Characters tile shows its constant's whole name over two
lines, where 40 of 111 tiles showed only a cut name such as "speed of
li…". A value in parentheses, such as MAXR's 9.99999999999e499, stays in
the tile's title.

`DIV2`, `EGCD` and `ABCUV` are the HP's IDIV2, IEGCD and IABCUV for
polynomials, in VX or the arguments' only variable, next to `SIMP2` in
the POLY menu: `'X^2+1' 'X-1' EGCD` gives the AUR's 2, 1 and `-X - 1`,
`'X^2+X+1' '2*X+4' DIV2` the quotient `1/2*X - 1/2` and remainder 3.

The stack's top edge fades whenever its top level runs above the view,
not only once a whole level is hidden, so a turned phone in minimal view
no longer slices a matrix's first row with no sign of more above.

## v0.6.167 — 2026-10-19

`MAXR` and `MINR` are the HP 50g's 9.99999999999E499 and 1E-499, as the
AUR and the Characters drawer give them, where they were E999 and E-999.
`STMXE` still sets another range.

`TRIGCOS`, `TRIGSIN` and `TRIGTAN`, the HP's trig rewrites, sit at the
end of the CAS menu's TRIG folder: `'SIN(X)^2' TRIGCOS` gives
`-COS(X)^2 + 1`, and `'SIN(X)^2' TRIGTAN` the AUR's
`TAN(X)^2/(TAN(X)^2 + 1)`.

A matrix or vector on the stack shrinks to fit its line, down to three
quarters of its size as a formula does, before it scrolls sideways, so a
3×3 matrix keeps its last column in minimal view at 280 px.

## v0.6.166 — 2026-10-19

`DIV`, `CURL` and `LAPL`, the HP's vector calculus, sit in the CAS
menu's CALC folder: `[ 'X^2*Y' 'X^2*Y' 'Y^2*Z' ] [ X Y Z ] DIV` gives
the divergence, `CURL` the curl as a vector (three components and three
variables), and `'EXP(X)*COS(Z*Y)' [ X Y Z ] LAPL` the Laplacian, as
the AUR's examples show.

In the assistant's replies, `__bold__` and `_em_` render as bold and
emphasis, never inside a word such as snake_case or 1_m, and an escaped
`\*` or `\_` shows as a bare mark.

On a phone, the open drawer's tab scrolls clear of its tab row's edge
fade, where History sat faded at the right edge at 360 px with the
keypad hidden.

## v0.6.165 — 2026-10-19

`SIMP2` divides two objects by their greatest common divisor, as the AUR
describes: `'X^3+6*X^2+11*X+6' 'X^3-7*X-6' SIMP2` leaves `X+3` and
`X-3`, and `12 18 SIMP2` leaves 2 and 3. It sits with the polynomial
commands.

In the assistant's replies, a `<br>` inside a table cell breaks the
cell's line, where it showed as typed.

On a phone, the MATRIX menu's MAKE folder shows VANDERMONDE under the
HP's five-letter face VANDE, where a 280 px screen broke the name over
three lines.

## v0.6.164 — 2026-10-19

`→DIAG` and `DIAG→`, the HP's diagonal commands, sit on the MATRIX
menu's MAKE folder: `[[ 1 2 ][ 3 4 ]] →DIAG` gives [ 1 4 ], the major
diagonal of any matrix, and `[ 1 2 3 ] { 3 } DIAG→` builds the 3x3
matrix with that diagonal. One dimension makes it square, { m n } a
rectangle; a longer diagonal fills with zeros and extra elements drop,
as the AUR describes.

In the assistant's replies, steps numbered 1) 2) 3) and bullets that
start with + show as lists, as Markdown reads them, where they ran
together into one paragraph.

On a phone, command search and Catalog rows no longer leave a lone last
word on their second line, such as the z of SIN's z → sin z.

## v0.6.163 — 2026-10-19

`SYST2MAT` turns a system of linear equations into a matrix, as the
AUR describes: `[ 'X-Y' '2*X+Y=5' ] [ X Y ] SYST2MAT` gives
[[ 1 -1 0 ][ 2 1 -5 ]], a row per equation with its constant moved to
the left side. An expression counts as equal to zero, the system can be
a list, and a term that isn't linear is refused. It sits on the CAS
menu's S.SLV folder after ROOT.

In the assistant's replies, a line without > after a quote's paragraph
carries that paragraph on, as Markdown reads it, where it ended the
quote and showed as a paragraph of its own.

On a phone, a drawer's tab row fades at an edge with more tabs past it,
as the key strip does.

## v0.6.162 — 2026-10-19

×, ÷ and − typed from a phone keyboard's symbol keys read as the HP's
*, / and -: 2 3 × multiplies, ‘2×X’ is an algebraic and −5 a number,
where each made a name or failed to parse. Inside a string they stay
text.

Command search's highlighted result says what STO would store and
where, what RCL would recall, what PURGE would remove, how many points
CLΣ would clear and how many variables CLVAR would purge (it keeps
folders that hold anything).

On a phone, a drawer's tab row scrolls the open drawer's tab into
view, where History and Chars sat past the right edge at 280 px.

## v0.6.161 — 2026-10-19

Quotes curled by a phone keyboard's smart punctuation, as an iPhone
types them, read as the HP's straight ones wherever text is parsed:
‘X^2+1’ typed on the command line is an algebraic, “hi” a string, and
3 ‘X’ STO stores X, where all three made names.

Command search's highlighted result says what a mode command would
set: DEG previews "Angle: Degrees (now Radians)", and FIX, SCI and ENG
the digit count on level 1.

In the Catalog, a family card beside one whose name wraps keeps its
command count under its name.

## v0.6.160 — 2026-10-19

Command search's Recent commands show a command saved under its ASCII
spelling before 0.6.158, LIST-> say, as LIST→, and only once. On a
phone the highlighted result's preview takes two lines, so a reason
such as "LIST→ needs more values than the stack holds." reads in full,
and a command that gives the stack back unchanged, SUM of a real,
previews as leaving the stack as it is rather than removing 0 levels.

A quote in an assistant reply keeps its own paragraphs, lists and
quotes within it, instead of running them together on one line.

## v0.6.159 — 2026-10-19

A level's ⋯ menu on level 1 leaves out ROLL, ROLLD, DUPN and DRPN,
which do nothing there or repeat PICK and Drop, and its Roll button
shows from level 2 up.

An assistant reply's indented list nests under the step above it, a
bulleted list inside a numbered one, say, instead of starting a new
list.

On a phone, command search's placeholder is the longest wording that
fits its field, "Search commands…" at 280 px, instead of one cut off
mid-word.

## v0.6.158 — 2026-10-18

Command search and the Catalog list each command once under its arrow
name: LIST-> no longer sits beside LIST→, nor ->ARRY beside →ARRY, and
typing the ASCII spelling, "c->r" say, finds C→R. On a phone a
command's description takes two lines there instead of four or five
words, and the Catalog's search box ends its placeholder in an
ellipsis.

An address the assistant writes without markdown, such as
https://www.hpcalc.org/, is a link that opens in a new tab, with a
sentence's closing punctuation left outside it.

## v0.6.157 — 2026-10-18

The integral in the equation writer and the stack's textbook view is a
drawn ∫ sign now, with its limits at its top and bottom right as in a
textbook, a tall limit kept clear of the other and a thin space before
d. It was the monospace font's boxy ∫, which left the lower limit on
the integrand's line.

Command search and the Catalog find π by "pi", which a phone's keyboard
can type, and words that run together in a description outrank one of
them being a command's name, so "square root" finds √ rather than ROOT.
Search lists π once, not under both Constants and Commands, and the
"not in app" badge sits beside the command's name, leaving a 280 px
phone the description's width.

A sum shows as the HP writes it, `Σ(k=1,10,k^2)`, on the stack, in EDIT
and in exports, where it showed Giac's order, `Σ(k^2,k,1,10)`. Sums in
the old order still read back.

## v0.6.156 — 2026-10-18

Command search no longer says "IF isn't available in rpl.ai": choosing
IF, FOR, π or another word the parser reads types it on the command
line, as the Catalog's Insert does (inside an open program too), and
its rows use the manual's spelling, π rather than Π. Commands rpl.ai
lacks, such as PICT, wear a "not in app" badge there, and choosing one
opens its reference page instead of putting up an error. Σ, the HP's
summation: `'k' 1 10 'k^2' Σ` gives 385, a symbolic summand between
numeric limits sums in closed form (`'N' 1 5 'A^N' Σ`), and the
algebraic `'Σ(k=1,10,k^2)'` reads as the HP writes it, where it said Σ
expects 4 arguments; the Catalog counts 520 commands.

---

## v0.6.155 — 2026-10-18

The Catalog no longer greys out IF, THEN, ELSE, END, CASE, IFERR, FOR,
NEXT, START, STEP, DO, UNTIL, WHILE, REPEAT, « », →, _, π, e and i as
"Not available in rpl.ai": the parser runs them all, so their reference
pages offer Insert, which types « » around the cursor and π, e or i in
the manual's own case, and the AUR page marks them in app. The HP's
other names for commands rpl.ai already had now run them: ΣX^2, ΣY^2
and ΣX*Y (the HP 28's names for ΣX2, ΣY2 and ΣXY), CLUSR (CLVAR), EXPAN
(EXPAND), COLCT (COLLECT) and LAP (LAPLACE), where typing one pushed a
bare name; the Catalog counts 519 commands. A Catalog search lists
manual pages in their own spelling, π, →Qπ, e and i, where it showed
Π, →QΠ, E and I.

---

## v0.6.154 — 2026-10-18

STD shows numbers as the AUR describes: a number shows whole only when
its digits fit in 12, any other in scientific form, so 1/30 →NUM reads
3.33333333333E-2 and the Stefan–Boltzmann constant 5.670374419E-8,
where they showed as 0.0333333333333 and 0.00000005670374419, and a
whole mantissa keeps its point, as in 1.E12. MOLWT gives the molar mass
of a formula, a string such as "Ca(OH)2" or a name, in g/mol (the HP
writes g/gmol), or the number alone with flag -61 set; a name that isn't
a formula stands for the formula stored in it. A selected level's soft
keys open on EDIT VIEW ECHO PICK ROLL DROP, so VIEW is one tap away, as
on the HP's interactive stack. A tapped soft key no longer passes the
tap on to what it opens: at 280 px VIEW's Edit button sat under the
finger, so the level opened for editing instead of full size.

---

## v0.6.153 — 2026-10-18

CONLIB opens the HP's Constants Library: its 39 constants, each with what
it is and its value, in their units unless flag -61 is set. A tap puts a
constant on the stack, as the library's →STK does, or types its `CONST`
inside an open program; CONLIB is a key in the UNITS menu too. The tutor
renders its problem, step titles and hints as the assistant's replies do,
where `$x^2$`, bold and code showed as typed, and draws the tables, code
and quotes in its steps as the replies do, a wide formula scrolling with an
edge fade where it ran past the card's edge. The note a phone shows after
I'll do it or Show me renders the step title's math too.

---

## v0.6.152 — 2026-10-18

The assistant's replies render the rest of their everyday Markdown: a
`####` heading shows as a heading, where its hashes showed; a
`[text](url)` link to an http(s) or mailto address opens in a new tab,
while any other address stays text; a `---` line draws a rule, and `>`
lines show as one quote with a bar beside it, where both showed as
typed.

---

## v0.6.151 — 2026-10-18

Numbered steps in the assistant's replies keep their numbers when display
math or a paragraph comes between them, so the third step shows 3, where
the list started again at 1. A markdown table in a reply renders as a
table, its cells taking inline math and code, where it showed rows of
pipes. Display math, tables and code wider than a reply fade at the edge
they continue past and scroll sideways, as stack levels do, where a wide
formula was cut off with no sign of more.

---

## v0.6.150 — 2026-10-18

Math inside bold or italic text in the assistant's and the tutor's replies
renders, so a line such as `**Example: Solve for $x$ and $y$**` shows x
and y as math, where it showed them between dollar signs. An escaped `\$`
in bold text still shows a plain dollar sign.

---

## v0.6.149 — 2026-10-18

`CONST`, the HP's Constants Library command, joins the units: `'c' CONST`
gives `299792458._m/s`, and the library's 39 constants come by its names
(`NA`, `k`, `R`, `R∞`, `ε0`, `ħ` and the rest) in their units with
CODATA 2018 values, or as plain numbers with flag -61 set. A name the
library lacks says so in the banner, which offers CONST's reference.
`'Vm' →NUM`, the molar volume, gives the HP's `0.02241396954` m³/mol at
0 °C and one atmosphere, where it gave `0.02271095464`, the value at
100 kPa. Screen readers name the command line Command line, where it had
no name. The assistant knows `KEY` and `CONST`, where it was told `KEY`
doesn't exist.

---

## v0.6.148 — 2026-10-18

`KEY`, the HP's key test, joins the program commands: it returns 0, or a
key's row and column and 1 (81 for the left shift, 105 for Enter), so
`« DO UNTIL KEY END »` waits for a key as the AUR's example does. A
program polling it pauses after each 50 ms of running so a phone can
take the key, and its stack and display keep updating meanwhile; at the
command line `KEY` finds no key and returns 0. A program's message keeps
its line breaks in the banner, so `"Line 1" 10 CHR + "Line 2" + MSGBOX`
shows two lines, where it showed one. Stopping or finishing a `PROMPT`
run while another program waits at a `MSGBOX` brings back the `MSGBOX`'s
message, where the banner went blank. A program that `WAIT`s in a loop
keeps its banner and stack steady, where both replayed their fade-in at
every pause and flickered.

---

## v0.6.147 — 2026-10-18

`→STR` writes numbers in the display format, as the AUR says, so
`2 FIX "Total: " 12.3456 →STR +` gives `"Total: 12.35"`, where `→STR`
always wrote them in STD; and a string given to `→STR` comes back as it
is, where it came back wrapped in quotes. The LIST menu opens on the HP's
folders: ELEM (GET, GETI, PUT, PUTI, SIZE, POS, HEAD, TAIL) and PROC
(DOLIST, DOSUBS, NSUB, ENDSUB, STREAM, REVLIST, ADD, SORT, SEQ) from its
PRG LIST menu, and CHARS (SUB, REPL, POS, SIZE, NUM, CHR, OBJ→, →STR,
HEAD, TAIL, SREPL), its string menu, then OBJ→, →LIST, SUB and REPL,
where its 35 keys ran over six pages. A string at level 1 shows whole,
wrapping and keeping its line breaks as a selected level does, where it
ended in an ellipsis with its newlines read as spaces.

---

## v0.6.146 — 2026-10-18

SOLVE takes a list of equations and expressions, as the AUR says, and
solves each for the variable: `{ 'X^2=4' 'X-3' } 'X' SOLVE` gives
`{ { X=-2 X=2 } { X=3 } }`, where it said Bad argument type. ISOL, which
runs SOLVE, takes one too. A list inside a list is drawn as textbook maths
and wraps with the rest of the level, where it showed typed text running
past a phone's edge. New: SOLVEVX, in the CAS menu's S.SLV folder, solves
for the current variable, or for the only variable while VX is the
default `x`: `'T^2=9' SOLVEVX` gives `{ T=-3 T=3 }`, and a list gives a
list of lists.

---

## v0.6.145 — 2026-10-18

Division by zero follows the HP's error list: `0 0 /` is an Undefined
result (#304h), for integers, reals, complex numbers, units and `'0/0'`
EVAL alike, where it was an Infinite result; any other x/0 stays an Infinite
result (#305h), fractions included, where `1/3 0 /` let out the fraction
library's own "Division by Zero" with no error number. A binary integer
divided by zero gives `#0`, as the AUR says, where it was an error. Roots
stay exact, as in the HP's exact mode: `8 √` gives `2√2`, `8/9 √` gives
`2√2/3`, `4 1/2 ^` gives `2`, `27 2/3 ^` gives `9`, `2 -1/2 ^` gives `√2/2`
and `27 3 XROOT` gives `3`, where they stayed whole or gave `3.`; a root that
doesn't come out, such as `2 1/3 ^`, stays as it was. The 0/0 banner says
"0/0 has no value", where it said "/ has no value there" and spoke of one
argument outside the function's domain, and an expression's Undefined
result is the expression's rather than EVAL's.

---

## v0.6.144 — 2026-10-18

Units keep the order they were typed or multiplied in, as the HP's do:
`1_N*m` stays `1._N*m`, `5_N 2_m *` gives `10._N*m` and
`3_ft*lbf 1_N*m CONVERT` gives `4.06745384499_N*m`, where each was sorted to
m*N. UFACT gives the AUR's `1._N*m/s` for `1_W 1_N UFACT`, UBASE still gives
`kg*m^2/s^3`, and SAME treats N*m and m*N as one unit. The where operator
`|` (↱9) puts values in for names without the CAS and simplifies nothing:
`'X^2+Y' { X 2 Y 3 } |` gives `'2^2+3'`, which EVAL makes 7, and every name
takes its value at once, so `{ X Y Y X }` swaps X and Y. A unit too wide for
a phone line wraps between its factors, before its `_` and after a `*` or
`/` outside parentheses, where `1_V UBASE` broke inside `s^3`.

---

## v0.6.143 — 2026-10-18

ERRN gives the HP's error numbers: Undefined result is #304h, Invalid
dimension #501h and Inconsistent units #B02h, where each gave #0h, the
number of no error at all, and a string DOERR gives #70000h, as the AUR
says. The directory errors take the HP's numbers too (Directory not allowed
#12Ah, Directory not empty #12Bh, Name conflict #13Ch); Name conflict used
to share #501h with Invalid dimension. DOERR reads the same table, so
`#501h DOERR` raises Invalid dimension. An error a program raises itself
with DOERR shows its own message as the banner's title, where it showed
EVAL: DOERR: in front, and `"" DOERR` no longer says the program ran for 10
seconds. The LOGIC menu follows the HP's PRG TEST pages, `== ≠ < > ≤ ≥`,
then AND OR XOR NOT SAME TYPE, then SF CF FS? FC? FS?C FC?C, where the
ASCII forms `<>`, `<=` and `>=` split `<` from `>` across its first pages.

---

## v0.6.142 — 2026-10-18

LN and LOG of a negative real give its principal complex value with CMPLX
off too, as the HP's do and as ASIN and ACOS already did: `-1. LN` gives
`(0, 3.14159265359)` and `-100. LOG` gives `(2, 1.36437635384)`, where they
said Bad argument value. This reverses the earlier rule that only CMPLX mode
lifted them. LNP1 below -1 is an Undefined result, as the AUR says, with its
own error banner, where it said Infinite result. The TRIG menu opens on the
HP's HYP folder, SINH ASINH COSH ACOSH TANH ATANH EXPM LNP1, where the
hyperbolics sat on its third page. Inside a menu folder the menu button
names it, TRIG · HYP or just HYP on a phone, as VARS names its directory,
and the wide button has room for INTGR · MODUL and VARS · CIRCUITS.

---

## v0.6.141 — 2026-10-18

PROOT, PCOEF, PEVAL, PTAYL and HORNER take the HP's coefficient and root
arrays, so the AUR's examples work: `[ 2 -3 4 -5 ] PCOEF` gives
`[ 1 2 -25 -26 120 ]` and `8 PEVAL` then gives 3432, where each said Bad
argument type. Lists still work, and a result keeps the form it was given.
IEGCD now leaves the gcd on level 3 and the coefficients below it, as the AUR
orders them, so `18 24 IEGCD` gives 6 -1 1; it used to leave the gcd on
level 1. The INTGR menu opens on the HP's ARITH folders, INTEG and MODUL,
then DIVIS, FACTORS and PROPFRAC, where its 30 keys ran over five pages.
Opening MODUL says the modulus its commands use, and its MODSTO key says
the new one, since a phone shows no CAS modes.

---

## v0.6.140 — 2026-10-18

Alarms now come due while the app is open: a note shows the message with an
ACK button, the phone buzzes and a tone sounds, as the HP beeps (set flag
-57, the HP's Alarm Beep off, for quiet). An alarm missed while the app was
closed or hidden shows as past due, without a sound, the next time it
opens. While an alarm is past due the HP's alert annunciator ((•)) lights
in the status line, and a tap on it brings the note back; at 280 px in
minimal view it fits beside the six modes and the leave button. A key press
doesn't acknowledge an alarm here; the note's ACK does. The assistant's dry
runs now roll back the alarm list with the rest of the calculator, where a
dry run of `0 DELALARM` deleted every alarm for real.

---

## v0.6.139 — 2026-10-18

The HP's appointment alarms arrive: STOALARM, RCLALARM, DELALARM,
FINDALARM, ACK and ACKALL, in the TIME menu's ALRM folder under the HP's
key faces ACKAL, STOAL, RCLAL, DELAL and FINDA. `{ 10.192026 9.3 "Dentist" }
STOALARM` stores an alarm and gives its index, and alarms are saved with
the calculator. rpl.ai keeps message alarms only: an action that isn't a
string, which the HP would run, is refused with Bad argument type. A
selected list level and VIEW now wrap a long string inside the list, which
ran 640 px wide in a 192 px level on a 280 px phone.

---

## v0.6.138 — 2026-10-18

A window with the keypad under the stack and less than about 576 px tall
now shows the compact keypad, as the user chose, and the full keypad comes
back when the window grows; the Keypad setting stays Full. A half-height
split screen at 412 by 457 had 18 px of stack under the full keypad and
now has two levels. UTPN used an approximation good to about seven digits,
so `0 1 1.96 UTPN` gave 0.024997892964; it now gives the HP's
0.0249978951482. The PROB menu opens with the HP's MTH PROB keys in its
order: COMB PERM ! RAND RDZ, then UTPC UTPF UTPN UTPT and NDIST.

---

## v0.6.137 — 2026-10-18

Above level 1, as on the HP, a long list now keeps to one line and a
matrix of more than three rows shows on one line in its typed form, both
fading at the edge; level 1, a selected level and VIEW still show them
whole. A 30-item list had filled half a phone's stack from level 6.
CROSS takes two-element vectors as the AUR says, reading [ d1 d2 ] as
[ d1 d2 0 ]. In CYLIN and SPHERE modes →V2 and →V3 read their numbers as
polar parts and V→ gives them back, so `2 90 →V2` in DEG is `[ 2 ∠90 ]`;
it had built `[ 2 90 ]`. Polar literals use degree-exact trig, so
`[ 1 ∠90 ]` is `[ 0. 1. ]`, not 6.12323399574E-17 for the zero. A
VECTOR menu after MATRIX holds the HP's MTH VECTR keys, ABS DOT CROSS V→
→V2 →V3, then RECT, CYLIN and SPHERE, marked while on.

---

## v0.6.136 — 2026-10-18

→NUM left a vector or matrix as it was, so a matrix level's →NUM did
nothing; it now gives every entry its number, as the HP does:
`[ '1/2' 'π' ] →NUM` gives `[ .5 3.14159265359 ]`. The MATRIX menu now opens as the HP's MTH MATR
does, on MAKE, NORM, FACTR, COL and ROW folders and then LSQ, with every
command still on the pages after them. A matrix level's ⋯ menu has Inverse
and Determinant when it is square, and Transpose.

---

## v0.6.135 — 2026-10-18

COLLECT ran SIMPLIFY, so on most expressions its key seemed to do nothing;
it now factors over the integers as the AUR says, never into square roots:
`X^2+5*X+6` COLLECT gives `(X+2)*(X+3)`, `X^2-2` stays whole where FACTOR
splits it with √2, and an integer comes back as its prime factors. The CAS
menu, nine pages of keys on a phone, now opens on folders after the HP's
CAS menus: ALG (COLLECT, EXPAND, FACTOR, LNCOLLECT, LIN, PARTFRAC, SOLVE,
SUBST, TEXPAND, as the HP has it), CALC, S.SLV, TRIG and EXP&LN, with every
command still on the pages after them. A long formula on a narrow phone
shrank to fit its line, `(X+Y)^6` expanded down to a third of the stack's
text size; it now shrinks only to three quarters, then fades at its edge
and scrolls sideways as a wide matrix does.

---

## v0.6.134 — 2026-10-18

TSTR rounded a time to the second before checking it, so `DATE TIME TSTR`
failed with Bad argument value in the last half second of every minute; it
now drops the fraction, as the AUR's HH.MMSSs form implies, and the date
commands drop digits past the year the same way. The TIME menu's second page
gets 24H and D.M.Y keys for the clock and date formats (flags -41 and -42),
marked while set, the choices the HP offers in its Set time, date form;
inside a program they type the flag command. A number too wide for its stack
line on a narrow phone, such as `-1.23456789012E-100` in minimal view at
320 px, ended in an ellipsis that hid its exponent or last digits; it now
wraps, breaking before the exponent first.

---

## v0.6.133 — 2026-10-18

VTYPE of a name with no variable said Undefined name; it now returns -1, as
the AUR says, so a program can test whether a variable exists. A tagged
value with a long tag showed only the tag on a phone, its value cut off;
the tag now gives way first, down to five characters, so a level reads
`Total pri…: 123.456`. EQ→, the HP's equation split, joins the app:
`X^2+1=Y` EQ→ gives `X^2+1` and `Y`, and an expression, number or unit
comes back with a 0. The TYPES menu now holds the HP's PRG TYPE keys,
OBJ→ →ARRY →LIST →STR →TAG →UNIT, then C→R R→C NUM CHR DTAG EQ→, then
TYPE VTYPE. The Catalog counts 500 commands.

---

## v0.6.132 — 2026-10-18

A complex number raised to an integer power went through the polar form,
so `(1,1) 2 ^` gave `(1.22464679915E-16, 2)` and `(1,1) 100 ^` carried a
stray imaginary part. Integer powers now multiply by squaring, as SQ and *
do, and give `(0, 2)` as the HP does. The CMPLX menu now leads with the
HP's own keys, RE IM C→R R→C ABS ARG, then SIGN NEG CONJ, so ABS and NEG
are a key away on a phone without the keypad; the coordinate modes follow.
The CMPLX key shows a mark while complex mode is on, as RECT and CYLIN do.

---

## v0.6.131 — 2026-10-18

A long list on a phone wraps over several lines in textbook mode, and some
of those lines started half a space in, wherever a separator landed at the
start of a line. Every wrapped line now starts flush. ADD, the HP's
element-wise list addition, joins the LIST menu after ΣLIST:
`{ 1 2 3 } { 10 20 30 } ADD` gives `{ 11 22 33 }` and `{ 1 2 3 } 5 ADD`
gives `{ 6 7 8 }`, where + appends. Lists of different lengths are refused
with an error that says lists need the same number of items. VIEW used to
draw a long list on one line that ran off a phone's screen; it now wraps
the list to the sheet as the stack does, while formulas and matrices still
scroll sideways.

---

## v0.6.130 — 2026-10-18

On a phone the app bar shows only a modes summary, and it named just the
angle, number format and exact mode, so HEX, BIN or OCT, polar
coordinates and complex mode were nowhere in sight. The summary now names
each of them whenever it isn't the default, in the HP header's order:
RAD · R∠Z · HEX · STD · ℂ · EXACT. A BASE menu joins the menu picker as
the HP's: HEX DEC OCT BIN R→B B→R, folders for LOGIC, BIT and BYTE with a
BACK key, then STWS and RCWS. The DEG, RAD, GRAD, RECT, CYLIN, SPHERE,
HEX, DEC, OCT and BIN keys in any menu now show a mark while their mode
is on, as the HP's DEG■ and HEX■ do.

## v0.6.129 — 2026-10-18

After a point entered as separate numbers, `3 1 7 Σ+`, LASTARG gave back
the three numbers; it now gives the vector `[ 3 1 7 ]`, as the AUR says.
A statistics command that finds no ΣDAT now says so in words, and when
level 1 holds a vector or matrix the error offers Store level 1 in ΣDAT,
which runs STOΣ and the command again as one step with one Undo. The
STAT menu's STOΣ key now says how many points ΣDAT holds, as Σ+, Σ- and
CLΣ do.

## v0.6.128 — 2026-10-18

The statistics commands now read only the stored ΣDAT, as on the HP.
MEAN, SDEV, TOT, MEDIAN, LR, the fits, the sums and the plots used to
take a vector or matrix from level 1 as their data when one was there,
so a mean left on the stack became the next command's data. An array on
level 1 is now left alone: store data with `STOΣ` or `Σ+` first. This
breaks programs that relied on the old behaviour, such as
`« DEPTH →ARRY MEAN »`; `→ARRY STOΣ MEAN` does what it did.

## v0.6.127 — 2026-10-18

SCATRPLOT always plotted ΣDAT's first two columns, and BARPLOT and
HISTPLOT the second and the first, whatever XCOL and YCOL said. As the
AUR has it, SCATRPLOT now plots the XCOL column against the YCOL column,
and BARPLOT and HISTPLOT the XCOL column; a column past ΣDAT's last is
Invalid dimension, and no ΣDAT is Nonexistent ΣDAT, before the plot
opens. The STAT menu gains the HP's PLOT folder, with BARPLOT, HISTPLOT
and SCATRPLOT, between 1VAR and FIT. A fitted plot no longer puts its
last or highest point under the plot tools in the top right corner: it
leaves them room at the right or the top, whichever costs less.

## v0.6.126 — 2026-10-18

The STAT menu now opens on the HP's folders: DATA holds Σ+, Σ-, CLΣ,
RCLΣ and STOΣ, then ΣPAR, 1VAR, FIT and SUMS, each with a BACK key, so
entering points on a phone no longer means paging to the seventh page
for Σ+. The whole list still follows the folders. A Σ+, Σ- or CLΣ key
that runs says how many points ΣDAT holds now, with Undo, since the
stack shows nothing. The MEDIAN key looked blocked on an empty stack
though MEDIAN reads ΣDAT there, as MEAN does; it no longer does.
TVMROOT, AMORT, DEFINE and LNAME on an empty stack said Bad argument
type; they now say Too few arguments, as every other command does.

## v0.6.125 — 2026-10-18

`AMORT` arrives: `12 AMORT` splits the first twelve payments of the loan
in the TVM variables into principal and interest and gives the balance
left, so the $200,000 mortgage pays 2235.45 of principal and 12934.18 of
interest in its first year. The TVM menu now has a key for each
variable, as the HP's solver menus do: a press stores level 1 in it,
the left shift solves for it and the right shift recalls it, and inside
a program it types the same words. A formula holding `I%YR`, such as
`'I%YR*2'`, couldn't be typed or edited back in, because the algebra
reader stopped a name at the `%`; it now reads the whole name.

## v0.6.124 — 2026-10-18

The HP's time value of money arrives: `TVMROOT` solves the variable it is
given, N, I%YR, PV, PMT or FV, from the others and PYR, and stores it, so
a 30-year $200,000 loan at 6.5% gives a payment of -1264.13604699.
`TVMBEG` and `TVMEND` put the payments at each period's start or end
(flag -14), and the new TVM menu holds all three. Names may now hold `%`
after their first letter, as I%YR does; names bound for the CAS still
refuse it. An error banner stayed up after the equation writer entered
a formula, or a level's menu dropped or evaluated one, though the stack
had moved on; every action now clears the old error, as the HP's next
key does. A `CHOOSE` choice longer than the list was cut short on a
narrow phone; it now wraps onto a second line.

## v0.6.123 — 2026-10-18

After the phone turned, an open popover placed itself before the app had
followed the new height, so a `CHOOSE` list sat over its banner's
Choose, Cancel and Stop keys or shrank to a sliver at the top; popovers
now place themselves a moment later, against the settled layout. The
`CHOOSE` choice the AUR calls highlighted now carries a highlight bar
as well as its check mark, and stays in view through a turn. A letter
typed on an empty line while the list is open, on the phone's keyboard
or on the keypad under α, moves the highlight to the next choice that
starts with it.

## v0.6.122 — 2026-10-18

A `CHOOSE` list longer than the screen opened scrolled to its top, so a
choice marked further down (`15 CHOOSE` of twenty) was out of view until
you scrolled; the list now opens with the marked row in the middle of
view. The arrow keys move the mark through the list, as the HP's do: the
keypad's ▲ and ▼, or a keyboard's, step it, stop at the ends and bring
the list back if it was put away, and Enter answers with it. The OK,
Cancel and Reset keys of an `INFORM` form, and the Edit, Copy and Share
keys of a level's View sheet, now sit in a footer that stays in view
while the fields or the value scroll, so a long form on a phone no
longer hides OK under its twelfth field.

## v0.6.121 — 2026-10-18

`ROOT` arrives, the HP's numeric root finder: `` `COS(X)=X` `X` 1 ROOT ``
gives 0.739085133215 and stores it in X; a program can stand in for the
expression, two or three guesses bracket the search, an equation is solved
as its difference, and the HP's Bad Guess(es) and Constant? errors and its
extremum when no sign change exists are kept. A field at the bottom of a
drawer, such as the Variables drawer's backup name, went under the phone
keyboard as it came up, or was left cut at the edge; the field being typed
into now scrolls into view as the keyboard arrives, with a margin inside
drawers. A `CHOOSE` with position 0, which the HP shows for looking at (OK
gives 0), now says View on its banner key and list title instead of
Choose, so nobody takes it for a choice.

## v0.6.120 — 2026-10-18

A History row tapped while the matrix or equation writer was open put its
line on the command line hidden under the writer, and its Run pushed the
writer's content instead of running the line; the writer now steps aside
with the Undo note a program's `INPUT` gives, so the line shows and runs.
`INPUT`'s `α` option locks alpha on the keypad while the program waits, as
on the HP, and the lock goes with the answer (a lock you had on already
stays). Enter on an empty command line is the OK of a `CHOOSE` (it answers
with the highlighted choice, or 0 when none is highlighted) and of a
`MSGBOX`, as the HP's ENTER is, so a phone keyboard's Go answers the
dialog instead of duplicating level 1 behind it; a typed line still runs.

## v0.6.119 — 2026-10-17

`INPUT` takes the HP's cursor position: `{ "[  ]" 2 }` opens the line
with the cursor inside the brackets, n counts characters from the left of
the first row, `{ row col }` names the row and 0 is the end of it (a
negative n, the HP's replace cursor, places the cursor the same way; ALG
and α pass unremarked). A program that reaches `PROMPT` with the matrix
or equation writer open now puts the writer aside with an Undo note, as
`INPUT` has since 0.6.118, so the answer lands on a command line that is
in view. The manual's PDF ran fifteen command entries into the one before
them, so the Catalog's page for `DATE` carried `→DATE`'s text and example,
`RREF` and `QR` opened the CAS `rref` and `qr` sections, and `COL→`,
`C→R`, `NEXT`, `ΔLIST`, `lim`, `dn`, `Psi`, `Σ(Summation)`, `FONT→`,
`KEYTIME→`, `→LANGUAGE` and `→MINIFONT` had no page of their own; each is
now its own entry (825 in all), and where a CAS alias shares a classic
command's letters the classic entry wins.

## v0.6.118 — 2026-10-17

The clock arrives, in a TIME menu of its own with the HMS commands: `DATE`
(MM.DDYYYY, or DD.MMYYYY with flag -42 set), `TIME` (HH.MMSS, 24-hour),
`TICKS` (a binary integer of 1/8192 s, for timing), `TSTR` (`2.061990
14.55 TSTR` gives "TUE 02/06/90 02:55:00P"; flag -41 set makes it
24-hour), and `DATE+` and `DDAYS` for days between dates, October 15 1582
to December 31 9999. The clock is the device's own, so `→DATE`, `→TIME`
and `CLKADJ` stay out. A program that reached `INPUT` while the matrix or
equation writer was open put its text on the command line hidden under
the writer, where it could neither be seen nor answered; the writer now
steps aside with a note whose Undo brings it back, content and all, as a
cancelled writer's does. In a window under 400 px tall without a
keyboard, a banner's message keeps to two lines and scrolls, so a long
`PROMPT` no longer pushes the soft keys off the bottom (Classic's
narrower banner wrapped one to three lines at 280x300).

## v0.6.117 — 2026-10-17

`BEEP` arrives: `n x BEEP` sounds a tone of n hertz for x seconds, with
the HP's limits (a frequency that doesn't round into 1 to 15000 Hz is
skipped, a duration over 1200 s is cut to 1200), and under flag -56,
which silences the error beep, it stays quiet too. Unlike the HP, the
program runs on while a tone plays; a row of BEEPs still plays as a
tune, each tone after the last. In a window under 400 px tall without a
keyboard, Android's split screen or a landscape phone, the writers'
hints and the full halt and error banners pushed the soft keys and the
line's Enter past the bottom edge (the equation writer by 14 px at
360x370, the matrix writer by 16 px and a halt banner by 5 px at
280x300). Such a window now takes the compact forms the keyboard-up
layout already had: the hints wait, a tall formula or matrix scrolls,
and a banner keeps to one row of title and keys. `INFORM`'s fields tell
a phone keyboard what Enter does, Next on a field and Done on the last,
as the matrix writer's cells and the command line's Go do.

## v0.6.116 — 2026-10-17

`INFORM` arrives, the last of the HP's program dialogs: `"Title" { fields }
format { resets } { init } INFORM` opens a form in a sheet with a field per
label, its help text as the placeholder and its initial value typed in as
source. OK parses each field, checks it against the field's types and
answers with the values and 1; an empty field answers `NOVAL`, which is
the name NOVAL here (the `NOVAL` command pushes it), a field that fails
keeps the form open with the complaint on it, Cancel answers 0, Reset puts
the reset values back, and Enter moves from field to field and answers
from the last. The form keeps the HP's column count on a wide screen and
one column on a phone; the X closes it with the program still waiting, and
Fill in on the banner opens it again. The Classic look's status line
showed nothing while a level or variable was being edited: its renderer
returned before the editing pencil of minimal view or the EDITING pill of
full view were built. The LCD header now carries the same cancel pencil,
finger-sized in minimal view and header-sized in full view, where it takes
the finger-sized tap the Classic mode annunciators have; under 320 px with
HALT lit too, the = annunciator gives way, as the other looks' does.

## v0.6.115 — 2026-10-17

`WAIT` arrives: `x WAIT` pauses a program for x seconds with the display
it wrote kept on screen, and `0 WAIT` (or `-1 WAIT`, which brings the
soft keys up in minimal view) waits for a key and returns its HP key
code, so `"Press 1 to add" 1 DISP 0 WAIT IF 92.1 SAME THEN + ELSE - END`
reads as it does on the HP. A keypad key answers with its row, column
and plane (92.1 for 1, 105.2 for left-shift ENTER), a soft key with 11.1
to 16.1, Enter with 105.1 from the banner's chip, the line's Enter or a
keyboard's, and a character typed on a phone's or computer's keyboard as
the keypad key that types it. Keys rpl.ai adds beside the HP's VAR, STO
and NXT take the codes of the HP's APPS, MODE and TOOL row (HOME 21.1,
PREV 22.1, RCL 23.1, CST 24.1, CAT 26.1), and the compact keypad's SWAP
and DROP answer as ▶ and ⌫ do. A timed wait shows how long with a Stop
key, the status line lights no HALT for a wait, and outside a program
`WAIT` errors as `PROMPT` does. With the keyboard up, a halt banner's
keys now drop under a long message instead of squeezing it beside them:
a PROMPT's four keys left its message 48 px at 280 px, so a long one grew
the banner to 380 px and pushed the command line under the keyboard. A
`DISP` line longer than the screen wraps as the command line does, rather
than scrolling off the right edge unseen.

## v0.6.114 — 2026-10-17

`DISP`, `CLLCD` and `FREEZE` arrive: a program writes messages on a
seven-line display above the command line, `CLLCD` blanks it, and the
text goes when the program ends or pauses unless `FREEZE` keeps it until
the next key, so the HP's `"Working" 1 DISP` and `CLLCD "Enter data" 1
DISP 7 FREEZE HALT` idioms read as they do on the HP. A `CHOOSE`, `INPUT`
or `MSGBOX` reached while single-stepping ran the rest of the program at
full speed once answered; the answer now steps on with SST or SST↓. With
the keyboard up at 280 px a tall `CHOOSE` list covered its own prompt and
the command line; a list asked to sit above its banner now gives up
height rather than cover it.

## v0.6.113 — 2026-10-17

A test file carried one block twice after the 0.6.112 release; the copy
is gone. Nothing in the app changed.

## v0.6.112 — 2026-10-17

`CHOOSE` arrives: a program lists its choices in a popover above its
banner, a tap answers with the choice (or the second object of a
`{ display result }` pair) and 1, Cancel answers 0, and with no
highlighted choice the list is for looking at, as on the HP. Answering
an `INPUT`, or OK on a `MSGBOX`, took an undo step of its own, so UNDO
after a program that asked twice put back the stack between its answers
with the program gone; the answers now belong to the program's run, which
UNDO takes back whole, as the HP's LAST STACK does. In the Classic look
the HALT annunciator never showed on a phone, where that look drops its
optional annunciators under 560 px; lit, it now shows in minimal view at
every width, the dim annunciators giving way to it as they do under
360 px.

## v0.6.111 — 2026-10-17

The README's command count follows the Catalog again: 479, where it had
read 475 since 0.6.64 while MENU, TMENU, MSGBOX and INPUT arrived.

## v0.6.110 — 2026-10-17

`INPUT` arrives: a program asks with a prompt and the text to offer, the
prompt is the banner, the text is on the command line, and Enter or OK
hand the line back to the program as a string. The HP's `V` option asks
that the line parse first; its cursor positions and entry modes are not
taken. In minimal view the HALT annunciator kept the desktop's padding
and pushed the leave button off a phone's screen while a program was
halted; it is small and tight beside the modes now, which give room as
they do under 320 px, and with a level being edited too the exact mode
gives way under 320 px. A `PROMPT` banner leads with its message, as the
`MSGBOX` banner does, rather than tucking it behind "The program is
waiting for you".

## v0.6.109 — 2026-10-17

`MSGBOX` arrives: a program shows its message in a banner with one OK
key and goes on when you tap it, the first of the HP's program I/O
commands. With the custom menu shown, a new list stored in CST, a purge
or an Undo left the old keys in place, still running the old items; the
keys now follow CST as the VARS keys follow the variables. A `PROMPT`
shows its message and keys without the program's source, as the HP
does, so the banner takes less of a phone's screen; HALT and Step keep
the source.

## v0.6.108 — 2026-10-17

Custom menu items take the HP's forms: `{ "label" object }` labels the
key and acts with the object, and `{ "label" { object ⇦object ⇨object } }`
gives the left- and right-shifted presses their own objects, which a
finger held on the key offers on a phone. In minimal view with the soft
keys hidden, `MENU` and `TMENU` showed nothing; they now turn the soft
keys on, as a menu picked from command search does. The autocomplete
puts the minimal view or Keypad hidden hint away as it opens: with the
keyboard up the hint sat over its rows, and a tap meant for a row only
dismissed the hint.

## v0.6.107 — 2026-10-17

A program can put up its own soft keys, as on the HP: `{ SIN COS } MENU`
stores the list in CST and shows it (a name holding a list works too),
`TMENU` shows a list without storing it, and `0 MENU` brings back the
menu before. The HP's other menu numbers, which name its built-in menus,
are not taken: `5 MENU` is a Bad argument value, and an argument that is
no list is refused rather than stored in CST. With the phone's keyboard
up, the autocomplete over the command line ran off the top of the screen
when there was less room than its rows take, hiding the best match; it
now caps itself to the room above the line and scrolls, the chosen row
kept in view. Its rows take a finger on touch, 40 px tall like the
popover rows.

## v0.6.106 — 2026-10-17

Hold the soft keys' menu button to go back to the menu you had before,
one hold where the picker's Recent group was two taps; with nothing
before it, a note says so. The whole-menu grid under a held NXT captions
each row of six as a page, so it reads as the soft-key pages do. A line
recalled with a held Enter, or a level echoed, into the middle of a typed
line fused with the word under the cursor (7 8 with the cursor after the
7 became 7 98); a token typed into a line now keeps a space on each side
it needs.

## v0.6.105 — 2026-10-17

Hold the Enter beside the command line to pick one of the last four lines
you entered, as the HP's CMD offers; it goes back on an empty line or into
the line you are typing. With key vibration on, a held finger buzzes once
as it opens a level's menu, a soft key's or the whole-menu grid, the keypad
key layers, picks up a variable, selects in the equation writer or clears
the line, as a key buzzes on its press. In minimal view at 280 px the
status line kept its side padding while a level was edited, so the amber
pencil pushed the leave button 2 px off the screen; the padding goes while
the pencil shows.

## v0.6.104 — 2026-10-17

A finger held on NXT lays every key of the menu out at once, so the 24
lengths of the UNITS menu are one tap away instead of four pages; the key
you tap runs as its soft key would, and the soft keys turn to its page.
A key that opens a folder wears its tab there as on the soft keys, where
the UNITS groups now wear it too, and a long name wraps inside its key. A
selected level whose height had a fraction of a pixel showed with its
bottom outline under the view's edge after a turn or when selected from a
scrolled stack; it now sits whole.

## v0.6.103 — 2026-10-17

The soft keys' menu list leads with the menus you used last, so a phone
reaches VARS, UNITS or STAT again without a scroll. A selected value with
units has Conv on its toolbar from 360 px wide, as a formula has Plot, which
opens the same Convert to… list as its ⋯ menu and CONV soft key.

In the Classic LCD look the dim ink of level numbers, tags and the writers'
notes read at 3.4:1 on the LCD; it is darker now (5:1).

## v0.6.102 — 2026-10-17

A finger held on a variable's soft key offers Store level 1 in it (⇦) and
Recall it (⇨), the HP's shifted variable keys, as held BRCH and UNITS keys
offer theirs; the tour's soft-key card says so on a phone.

In the dark and Classic looks the highlighted command-search and
autocomplete row's description read at 4.0:1 and 3.7:1 against the row's
lighter fill; it takes the brighter secondary ink there.

## v0.6.101 — 2026-10-17

A finger held on a UNITS soft key offers what the shifted key does: Convert
level 1 to the unit (⇦) or Divide by it (⇨), as a held BRCH key offers its
structures, for a phone with no shift key to hand. A selected value with
units has CONV among its soft keys, which opens the same Convert to… list as
its ⋯ menu.

In the dark and Classic looks, an error toast and the error banner's icon
drew white on salmon (2.7:1); they take dark ink now, while the light and
Paper looks keep white on their deeper red. In the Classic look the halt
banner showed the program's current word in amber on the LCD-green program
box (1.1:1, unreadable); it is an amber block with dark ink now.

## v0.6.100 — 2026-10-17

A value with units can be converted from its ⋯ menu. Convert to… lists the
value in every unit of the UNITS menu with the same dimensions, `254._cm`,
`100._in`, `2.54_m` and so on, with the SI base form last where it is no
menu key, and a tap runs the HP's CONVERT with a 1 of that unit, so LASTARG
and Undo see the command as if you had typed `1_in CONVERT`. On a phone this
spares typing the target unit; temperatures convert as readings, as CONVERT
does.

In the Classic LCD look, VIEW showed a value in the LCD's dark green on the
dark sheet, about 1.3:1 and unreadable; the sheet now uses its own ink. On a
screen under 320 px wide the soft keys' 29 px menu button takes a finger into
the bar's edge and the gap beside it.

---

## v0.6.99 — 2026-10-17

The Classic LCD look now works on a narrow phone. In minimal view under
390 px wide its status line ran out of room: at 280 and 300 px the menu and
leave buttons were pushed off the end, leaving no way out of minimal view,
and at 320 to 375 px the leave button and the folder path went. There it
now shows only the lit annunciators, as the HP's own header does, and a
long path ends in an ellipsis. The annunciators you tap to change a mode
were 11 px tall; on a touch screen each now takes a finger across the
LCD's row. Under 320 px Classic's soft keys were 29 px wide (27 in minimal
view) where the other looks give them 32; the menu bar now runs past the
bezel to the screen's edges, so they match.

Hold one of the keypad's arrows and it repeats, as the HP's cursor keys do:
along a long command line, through a formula or a matrix, or up and down the
stack from an empty line. On an empty line ◀, ▶ and ▼ turn the menu page,
swap or edit level 1, and a shifted arrow jumps, so those still happen once.
On Android a long press on an arrow no longer opens its key layers while it
repeats.

---

## v0.6.98 — 2026-10-16

An error no longer pushes the command line out of sight while you type. With
the phone's keyboard up, the error banner's explanation took most of what
was left: in landscape and on a 280 px phone the line you were typing on,
and the keys above the keyboard, ended up under the keyboard. With the
keyboard up the banner now keeps to its title and its fixes (Fix the line
and the rest), on one row in landscape, and the explanation comes back with
the keyboard down. Typing puts the error away as before.

The writers fit a narrow screen with the keyboard up. On a short screen the
equation and matrix writers put their keys beside the formula or matrix,
which suits landscape, but on a 280 px phone with the keyboard up it pushed
the matrix off the left edge and the equation writer's keys off the right.
Their keys now sit beside the writer only from 480 px wide.

The app bar steps aside while you type on a short screen, as minimal view's
status line already did. A landscape phone with the keypad hidden had 10 px
of stack left above the command line; level 1 now shows whole.

Share several levels at once. A level's ⋯ menu now offers Share levels 1–n
beside Share, which sends their values one to a line, deepest first, with
an rpl.ai link. Opening the link, or sharing the text to the installed app,
puts them on the command line, and Enter rebuilds the stack.

---

## v0.6.97 — 2026-10-16

Soft keys stay finger-wide on narrow phones. With a level selected, the
menu button (LVL 2 and its page count) and NXT took so much of the row that
the six soft keys were 22 px wide at 280 px, a fold's cover screen or a
phone with a larger system text size, and 29 px at 320. Under 360 px the
page count now moves from the menu button onto NXT, and under 320 px the
menu button shows only its icon, so every soft key is at least 32 px wide.

Hold a soft key on a phone to see what it will do. A mouse hovering over a
command's soft key has always previewed its result on the stack; a finger
held on one now does the same. The key still runs as you lift your finger,
and sliding away cancels it, so a slow tap works as before. The tour's
soft-key step mentions it.

The "more levels above" pill takes a finger. It was 25 px tall on touch; it
now answers a tap anywhere in a 40 px band from the top edge of the stack
without looking any bigger, and it stays on one line, where it used to wrap
to two at 280 px.

---

## v0.6.96 — 2026-10-16

A level you selected stays in view when you turn the phone or the keyboard
comes up. With the keypad hidden or in minimal view, turning the phone with
level 8 selected left it below the shorter landscape stack, out of sight;
the stack now keeps the selected level in view through any change of size,
as it already did when it was drawn, and keeps level 1 in view otherwise.

Keys answer faster on a deep or busy stack. Every command used to rebuild
every row of the stack; now the levels a command did not change keep their
rows and only get their new level numbers. On a mid-range phone a key on 50
formula levels takes 166 ms instead of 293, and 75 instead of 95 on a short
stack.

Command search leads each command with what it does. It used to show the
command's stack diagram first, so on a phone 86 commands, INTEG, CONVERT,
ROLL and PICK among them, showed only the diagram ("lower limit upper limit
int…"). The description now comes first and the diagram after it, as in the
Catalog.

---

## v0.6.95 — 2026-10-16

A level you tap on a phone shows whole, its actions included. On a 320 px
phone with the full keypad, the row of Edit, Pick and Roll under a
selected level ran 8 px past the bottom of the stack (26 px at 280 px, as
a fold's cover screen or a larger system text size gives), and level 1
went out of sight: since 0.6.94 a level too tall to sit below the stack's
faded top edge was shown from its top. A selected level that fits now
shows whole, a taller one from its top, and the fade and the "more levels
above" pill step aside for it instead of covering its value.

The actions under a selected level now include View, the HP interactive
stack's VIEW, which shows the level full size, one tap away instead of
two. It shows wherever it fits: on phones 320 px wide or more, or 360 px
for a formula, which also has Plot. On narrower screens View, and now
Plot too, stay in the level's ⋯ menu; a formula's six buttons ran past
the toolbar at 280 px.

The "Keypad hidden" and minimal view notes go away at your first tap
anywhere else, which still does what you tapped, rather than covering the
top of the stack for five seconds. Their Show and Leave buttons work as
before.

---

## v0.6.94 — 2026-10-16

Keys answer faster on a phone. Each key press laid the whole page out
five times, because inside the app's resizing layout every change to the
stack, its edge fades or the "more levels above" pill made the browser
measure everything again. The stack now takes all its measurements before
it changes anything, so a key lays the page out once: on a mid-range
phone a key with the full keypad takes about a quarter less time.

Closing the equation writer with the full keypad showing left level 1
partly below the bottom edge of the stack, and if the window then got
shorter, as when the phone's keyboard comes up, level 1 went out of view
altogether. Level 1 now comes back where it was.

For its first few seconds the "Keypad hidden" or minimal view note sat over
the search field when command search was opened. Opening search now puts
the note away, as opening a drawer or a menu already did.

## v0.6.93 — 2026-10-15

On a screen under 320 px wide, such as a folding phone's cover screen or a
phone set to a larger text size, Ask fell off the right edge, the folder
name in the app bar shrank to nothing, minimal view's leave button and the
equation writer's Enter were cut off. The modes button now shortens
(RAD · STD ·…) before the folder name does, the writer tabs drop their
icons, and the status line and writer keys tighten, so everything stays
on screen down to 260 px.

A deep stack made every command slow: each one laid out every level, so
with 2,000 levels a command took about 6 seconds on a mid-range phone. The
stack now draws the 50 levels nearest level 1, with a row above them that
shows 50 more while the levels in view stay where they are, and a level
selected deeper, with the ▲ key, is drawn too. A command takes about a
quarter of a second at any depth.

Command search, the Catalog and autocomplete now describe every command
in a sentence. FACTOR read "- The function expresses…", EXACT lost its
first half, and C→P, ERF and a dozen others started mid-sentence in
lower case.

## v0.6.92 — 2026-10-15

A line of many values entered at once, such as a column of numbers pasted
or shared from a note, drew the whole stack again after every value, so 200
numbers took about 7 seconds on a computer and far longer on a phone. The
stack is now drawn once, when the line ends: the same 200 numbers take a
few hundredths of a second.

Text shared to the installed app from another app over 4,000 characters
used to open nothing, with no note. Shared text now reaches the command
line at any length, as a paste does; only rpl.ai's own share links keep
that limit.

With Vibrate on key presses turned on, an error now buzzes the phone
twice, as the HP 50g beeps on an error, and setting flag -56 (the HP's
Error Beep flag) stops it, as it stops the HP's beep.

While levels lie above the screen, the stack now fades out at its top
under the "more levels above" pill, which counts a level hidden in the
fade. The pill used to sit on a level that showed only half a line and
was left out of the count, and a level selected there now scrolls clear
of it.

## v0.6.91 — 2026-10-15

Command search remembers the commands you run from it. With nothing
typed, its last eight come first under Recent commands, newest first, so
on a phone with the keypad hidden or in minimal view a command you use
often is two taps away; they keep across sessions.

In Android's split screen, or any window that got shorter after a key
was typed, the keypad disappeared as if the phone's keyboard had come up,
and no keyboard came to replace it. Only a field that asks for the phone's
keyboard now counts, so a shorter window keeps the keypad.

On a phone the status bar takes the colour of the app's top edge in every
look. It used to follow only the system's dark or light setting, so Paper
on a dark phone had a dark bar over a light app, and in minimal view it
now matches the stack.

## v0.6.90 — 2026-10-15

Hold the installed app's icon for shortcuts straight to the equation
writer, the matrix writer, Variables or command search, where the system
offers app shortcuts (Android, and Chrome or Edge on a computer). Each
opens rpl.ai at that place; a link can name nothing else.

The equation writer's first opening in a session showed a blank area,
with no box or caret to say where typing would go, until the first key.
It now draws the empty formula from the start, as every later opening
did.

The empty stack's Solve x² − 5x + 6 = 0 and Plot sin x examples work
with a writer open. Their Enter went to the open writer instead, which
answered Type an expression first or Type some numbers first. They now
run on the command line, and the writer keeps what you had typed in it.

---

## v0.6.89 — 2026-10-15

A stack level swipes away from wherever the finger starts on it, its value
included. Since levels too wide for the screen learnt to scroll sideways,
the browser had taken any sideways swipe that began on a value, so only a
swipe from the level number or the gap beside it dropped the level. A
value wider than its row, such as a big matrix, still scrolls under a
finger; swipe its level number to drop it.

Each Undo note replaces the one before it. Swiping away three levels on a
phone left three notes over the top of the stack, and only the newest
one's Undo still applied.

On Android the installed app now appears in other apps' Share menus. Text
shared to rpl.ai, or an rpl.ai link, opens on the command line, where
nothing runs until you press Enter, as with a share link. The installed
app reads it from its own cache, so the shared text never reaches a server.

---

## v0.6.88 — 2026-10-14

Swipe a finger along the soft keys to turn the page: to the left for the
next page, as NXT does, and to the right for the one before, as PREV does,
coming round at either end. On a touch screen a soft key now acts as the
finger lifts rather than as it lands, so a swipe that starts on a key
presses nothing; a tap runs the key as before, and a key with more to
offer still offers it to a held finger. The tour's soft-key step mentions
the swipe on a phone.

While a sheet such as Settings, VIEW or About is open, notes appear at the
bottom of the screen. On a phone they used to land across the sheet's
title and page tabs, so an error from Settings › Data hid Appearance,
Assistant and Data until it faded.

---

## v0.6.87 — 2026-10-14

Restoring a backup on a phone now shows what came back. Choose a file in
Settings › Data and the sheet closes on success, so the restored stack
and its Undo note are in view; before, the full-screen sheet stayed open
over them. Restore from file and a named backup in the Variables drawer
close the drawer the same way when it covers the command line. A file
that can't be read still leaves Settings open with the reason.

The number format menu's Digits grid now lists every count from 0 to 11,
the range the AUR gives FIX, SCI and ENG, in two rows of six. It used to
offer 0, 2, 3, 4, 6, 8 and 11, so FIX 5 had to be typed.

On a phone the app bar's modes button (RAD · STD · EXACT) shows the same
Digits grid under FIX, SCI and ENG. Before, only minimal view's status
line offered a digit count, so a phone in normal view could not choose
one from a menu at all.

---

## v0.6.86 — 2026-10-14

Variables move with a finger again. On a phone, drag a row in the
Variables drawer by its grip, or touch and hold the row first, then drop
it on a folder, between two rows or on a breadcrumb; near the drawer's
top or bottom edge the list scrolls to bring a far folder into reach. A
plain swipe still scrolls the list and a tap still recalls the variable.
Before this, a finger only scrolled, so with Move gone from the rows
there was no way to move a variable on a phone.

When the browser offers no install prompt, the Install button's note now
gives each phone the steps that work there: Share › Add to Home Screen in
any browser on an iPhone or iPad (it used to send you to Safari), and the
browser menu's Install app or Add to Home screen on Android, where it used
to name a computer's Apps menu and say that Firefox can't install.

In Settings a tap on a switch's title or description flips it, as a
phone's own settings do, rather than only a tap on the small switch.

---

## v0.6.85 — 2026-10-14

Share a stack level from a phone and the message now carries a link as
well as the value. Opening the link starts rpl.ai with the value on the
command line and a note to check it; nothing runs until you press Enter,
so a shared program arrives as a program, not as something it did. The
value travels in the link's fragment, which never reaches a server, and
values over 4,000 characters are shared as text only.

On a touch screen the hint row under the command line and the writers
(Tab next cell, ⇧Enter next row, Esc cancels) is hidden in landscape too,
as it already was on a narrow phone. Those hints are for a keyboard, and
in landscape their row was taking the space of the only stack level
showing above an open matrix writer.

In landscape the compact keypad keeps its shift labels (SIN, COS and TAN
on 7, 8 and 9, DUP on DROP, OVER on SWAP), at 7 px, with a panel at
least 300 px wide so a pair such as DEL and CLEAR keeps a gap.

---

## v0.6.84 — 2026-10-14

On a wide screen the panels and the keypad dock on either side. The rail
with its drawer (Assistant, Catalog, Variables, History, Plot, Chars) can
sit on the left or the right, and so can the keypad, in any combination.
A new dock button in the drawer's header and in the keypad's header flips
each one; Settings, Appearance has Panels side and Keypad side; and search
lists "Panels: dock on the right" and the rest. The choice is saved. A
drawer docked on the right resizes from its left edge, and in a window too
narrow to dock it slides in from the right. Phones and Minimal view are
unchanged.

Hold ⌫ to clear the command line, on the keypad or beside the line. A
quick press still deletes one character. The line clears with the same
Undo note as Esc, and Undo brings back the whole line, including the
character the press removed. Holding ⌫ does nothing extra while a level is
selected, a shift is on, or a writer is open; with the line empty, a
long press shows the key's layers as before.

---

## v0.6.83 — 2026-10-14

Each variable in the Variables drawer has fewer buttons: Edit, Rename,
Download and Delete, or Open, Rename, Download and Delete for a folder.
Recall is gone because tapping the name already puts the value on the
stack. Move is gone because a variable drags into a folder, onto the
breadcrumb or to a new place in the list. Share is gone too; a stack
level's menu still shares a value. Tapping a program's name still runs it;
to put it on the stack unrun, press ↱ and then its soft key, or use `RCL`.

With a mouse, the hidden buttons no longer narrow the row. They kept their
width while invisible, so a narrow drawer cut names, type badges and values
to a few letters (`Integ…`). They now appear over the end of the row on
hover or keyboard focus, and the name, badge and value use the full width.

---

## v0.6.82 — 2026-10-14

A new compact keypad for phones: five rows of six keys holding what an RPN
session reaches for most, in about half the height of the full keypad
(225 px instead of 397 on a 390 × 844 phone), so the stack gets the rest.

    ↰    ↱    α    `    UNDO  ⌫
    SWAP 7    8    9    yˣ    ÷
    DROP 4    5    6    √x    ×
    +/-  1    2    3    1/x   −
    EEX  0    .    SPC  ENTER +

Shifts carry the rest: EVAL and EQW on `, REDO on UNDO, OVER and ROT on
SWAP, DUP and CLEAR on DROP, SIN, COS and TAN (and their inverses) on 7, 8
and 9, and the full keypad's shifts on the other keys. Under α every key
but α, ⌫, SPC and ENTER types a letter, a to z along the rows. Choose it
from Compact keypad in the ⋯ menu or Keypad in Settings, both new; the
Full, Compact and Hide switch on the keypad itself only shows on wide
screens. The old compact layout, the full keypad with its top rows hidden,
is gone.

`10 20 « * LASTARG + / »` gives 20/3, as on the HP; a test now pins it.

---

## v0.6.81 — 2026-10-14

`LASTARG` works as on the HP 50g. Every command a program runs saves its
arguments, so `« * LASTARG »` gives back what `*` took rather than the
arguments of whatever ran before the program, and after a program
`LASTARG` gives the arguments of its last command, as the AUR says. Each
command now saves the levels the AUR lists as its inputs: `DUP`, `OVER`,
`DUP2` and `PICK` save what they read (they used to save nothing), a
command whose result is its argument unchanged (`5 ABS`) saves it, and a
command that fails saves what it took, so `3 0 /` then `LASTARG` brings
back 3 and 0. Commands that take nothing, such as `DEPTH`, keep the saved
arguments, and with flag -55 set nothing is saved.

With α on the keypad, every letter is now on a key: a to f run along the
top row (VARS to CAT) and g to l along the second (HOME to ▶), then m to z
on the keys below as before. a to f used to sit on the F1 to F6 soft keys,
which the keypad doesn't have.

---

## v0.6.80 — 2026-10-14

On a phone the keypad's bottom row (ON to ENTER) no longer scrolls out of
reach while the matrix or equation writer is open: when the writer needs
the room, every key gives up the same height, down to 26 px, and the keys
grow back when the writer closes. On a 390 × 844 phone the keys go from 39
to 36 px with a three-row matrix.

The halt banner has a fourth key, Step into (`SST↓`), beside Step: Step
runs a called program as one step, Step into walks through it. With the
phone's keyboard up the four keys are 40 px icons on one row, at 320 px
too.

In landscape with the keyboard up, a halted program's banner takes the row
the key strip would, so one stack level stays in view while you answer a
PROMPT.

---

## v0.6.79 — 2026-10-14

⌫ on an empty line no longer drops level 1: the keypad's ⌫, the ⌫ beside
the command line on a phone and a computer keyboard's Backspace all leave
the stack alone once the line is empty, so one tap too many while deleting
costs nothing. The HP's ⌫ does drop; DROP stays on the STACK menu, the key
strip above a phone's keyboard and a level's menu, and ⌫ still removes a
selected level. The keypad's ⌫ no longer reads DROP on an empty line, and
the shortcuts sheet no longer lists it.

---

## v0.6.78 — 2026-10-14

The keypad's ⌫ key, on a phone or clicked on a computer, deleted the last
character but left the cursor one short, so the next ⌫ took the character
before the last one. It now deletes at the cursor in one step, and +/-
keeps the cursor in place when it removes a minus sign the same way.

On a phone the equation writer's eight keys (‹ › a/b xʸ √ ( ) ⌫ and
Enter) share one row from 320 px up, growing to 56 px where there is room,
instead of Enter dropping to a row of its own; the matrix writer's keys
grow the same way.

The number pad and the key strip's ABC key from 0.6.76 are gone: no phone
keyboard offers letters and digits at once, so with the keypad hidden, or
in minimal view, the command line, the matrix cells and the equation writer
bring up the phone's usual keyboard again. The keypad still keeps it down
while it shows.

---

## v0.6.77 — 2026-10-14

The installed app no longer keeps a 34 px band empty under the keypad, or
under the menu bar with the keypad hidden, on a phone. The band lifted the
old ‹ and › pager keys clear of the home indicator; the one NXT key that
replaced them in 0.6.44 is big enough to sit at the bottom edge, so only
the phone's own safe-area inset remains.

---

## v0.6.76 — 2026-10-14

On a phone, typing on the calculator keypad no longer brings up the phone's
keyboard: the first key typed used to summon it, and it hid the keypad.
While the keypad shows, the command line, the matrix writer's cells and the
equation writer ask the phone for no keyboard, so the keypad does all the
typing; hide the keypad to type with the phone's keyboard.

With the keypad hidden, or in minimal view, the command line asks the phone
for its number pad
rather than the letters keyboard, as a calculator should (no phone keyboard
shows both at once), and the key strip above it gets an ABC key that
switches to letters for names and commands, with 123 to switch back, like
the HP's ALPHA. The matrix writer's cells follow the same choice; the
equation writer keeps the letters keyboard.

In the matrix writer the writer's own Enter key and the keypad's ENTER now
follow the same rule as a keyboard's Enter: store the typed cell and move
on, and push the matrix from an untyped cell. The keypad's ENTER caption
reads NEXT while a typed cell waits.

---

## v0.6.75 — 2026-10-14

In the matrix writer, Enter on a computer keyboard now works as the HP
MatrixWriter's ENTER does, as a phone's Enter has since 0.6.65: it stores
what you typed in the cell and moves to the next one, and on a cell you
haven't typed in it puts the matrix on the stack, so 1 Enter 2 Enter Enter
enters [[ 1 2 ]]. Before, Enter put the matrix on the stack at once,
spreadsheet-style. ⇧Enter still moves to the next row and Tab to the next
cell, and the DONE soft key pushes at any time.

---

## v0.6.74 — 2026-10-14

Inside a half-typed program, list or quote the MODES keys type their
command, as the HP's do: DEG, RAD, GRD, STD, FIX, SCI, ENG, EXACT, APPROX,
RECT, CYLIN, SPHERE, HEX, DEC, OCT and BIN, and -103 SF or -103 CF for
CMPLX and REAL (the CMPLX command on its own toggles). Before, they changed
the calculator's mode and typed nothing.

A program on the stack can be debugged from its level's ⋯ menu: Debug step
by step (DBUG) halts it with the banner's Continue, Step and Stop, so a
phone with the keypad hidden no longer needs command search to start
DBUG.

On a phone, while the keyboard is up at a PROMPT, the halt banner keeps to
one row: the prompt beside Continue, Step and Stop as icon keys, without
the program listing. Two stack levels now stay in view in portrait, where
the banner used to cover them all.

---

## v0.6.73 — 2026-10-13

The CST menu works inside a half-typed program, as the HP's does: opening it
no longer enters the unfinished line, and its keys type their item (a
command such as SIN, a name, a number), with ⇨ typing a RCL of a variable.
In a quote a command key types SIN( as the MTH keys do. Before, they entered
the half-typed program and ran on it.

A CST key holding a built-in command, such as { SIN }, now runs the command
like the menus' keys; it used to push the name 'SIN'. A variable of the same
name still wins.

Inside a program or list the UNITS keys, and the units on the Catalog's
Units page, type the HP's program-entry forms: 1_m * for the key, 1_m
CONVERT with ⇦ and 1_m / with ⇨. Right after a number they still attach the
unit (2_m), and they attach it to the number at the cursor rather than to
the first unit on the line. Before, they typed a stray _m that didn't read
as a unit. The Catalog's toast now names what was typed.

On a phone the soft keys no longer show the F1 to F6 hints after the first
tap; they are for a computer keyboard, and appear only where the pointer
can hover.

---

## v0.6.72 — 2026-10-13

A program pasted from Notes or a messaging app reads its curly quotes “ ” and
‘ ’ as the straight quotes the HP uses, so “hello” is a string and ‘X^2’ an
algebraic; before, they were read as names. Inside a straight-quoted string
they stay text.

On a phone, a variable's Edit button in the Variables drawer now closes the
drawer, as Recall does, so the value being edited is in sight on the
command line; before, it opened under the drawer.

A phone's back button cancels a level or variable edit, as the HP's ON
does, instead of leaving the app, and minimal view's pencil mark is a button
that cancels it too; Undo on the toast brings the edit back. A variable edit
now gets the mark and the full view's Editing pill, which names the
variable.

A variable's key (its soft key, its row in the Variables drawer or a
command search result) types its name inside an open program, list or
quote, and in a program ⇦ and ⇨ type a STO or RCL of it, as on the HP.
Before, it entered the half-typed line, and ⇦ stored the unfinished
program over the variable.

---

## v0.6.71 — 2026-10-13

On a phone the command line wraps a long line. A program opened for editing
used to show as one line about 700 px wide in a 200 px box, a few words at a
time; it now wraps over up to four lines, and the box always shows whole
lines, including minimal view's taller ones. The desktop keeps its single
scrolling line.

EDIT lays a program out over lines, from a stack level or a variable: each
structure word (IF, THEN, ELSE, END, FOR, NEXT, CASE and the rest) starts a
line, a CASE's tests take a line each, and nested programs are indented.
While a program is being edited, the command line grows to 40% of the
screen to show it. Enter reads it back as the same program.

In minimal view, the status line shows an amber pencil and the level number
while a stack level is being edited, as the full view's Editing level pill
does, so it is clear that Enter replaces the level rather than pushing a new
one.

---

## v0.6.70 — 2026-10-13

Local variables typed on a phone work. Inside a program the `→` key (the
key strip's, or the keypad's right-shifted 0) now types between spaces, as
the HP's program-entry mode does, so `→ X « X SQ »` binds X; it used to
glue onto the name after it and make the name `→X`. Outside a program `→`
still begins a name such as `→NUM`.

A finger held on a BRCH soft key (IF, CASE, IFERR, START, FOR, DO, WHILE)
offers the whole structures its shifted layers type, such as IF … THEN …
END and IF … THEN … ELSE … END, so a phone with the keypad hidden reaches
them without a shift key. A quick tap still types the word, and the
phone's keyboard stays up throughout.

The `« »`, `{ }` and `[ ]` keys, on the keypad and the key strip, start a
word of their own after a name or number, as the BRCH keys already did, so
a program typed on a phone reads `→ X « X SQ »` rather than `→ X« X SQ »`.

---

## v0.6.69 — 2026-10-13

Formulas set on their own line in the assistant's answers no longer show a
scrollbar. KaTeX draws a few pixels past each line, and the box that lets a
wide formula scroll sideways was scrolling vertically too; it now scrolls
only sideways, and only when the formula is wider than the bubble.

---

## v0.6.68 — 2026-10-13

A BRCH menu, as on the HP's PRG BRCH, types the program structures: IF,
THEN, ELSE, END, CASE, IFERR, START, FOR, NEXT, STEP, DO, UNTIL, WHILE and
REPEAT, each between spaces, opening `« »` first when the line holds no
program. With the left shift a key types its whole structure with the cursor
after its first word (IF THEN END, FOR NEXT, DO UNTIL END, WHILE REPEAT
END), and with the right shift the other form (IF THEN ELSE END, START STEP,
FOR STEP). A phone user had to spell each word on the keyboard before. Find
it in the menu picker under Data and programs, or search for "structures".

In Minimal view with the soft keys off, picking a menu from command search
changed the menu but kept the menu bar hidden, so nothing seemed to happen;
it now turns the soft keys on.

At HOME the Variables drawer no longer repeats HOME in a path row under its
title. That row only shows in a subdirectory, where it goes somewhere, which
gives the list another line on a short screen.

---

## v0.6.67 — 2026-10-13

The app bar no longer cuts the directory name to H… or HO…. It did on touch
screens from 720 to 759 px wide, in landscape on many phones, and on tablets
and computers from 980 px up, an iPad in landscape among them. The search box
now gives way first, and the rpl.ai wordmark waits for 780 px. A long path
still ends in an ellipsis, but each folder keeps more of its name.

Inside a program or a list, the keypad's and the phone key strip's
operators (+, −, ×, ÷, yˣ and the comparisons) type their command between
spaces, as the HP's program-entry mode does. Typing 2 × 1 + used to give
« 2*1+ », which read as 2 and a name *1+; it now gives « 2 * 1 + ». Inside a
quote, a string, a unit or an exponent they still type their character.

On touch screens the app bar's search box no longer shows its Ctrl+K hint,
which spilled over the box on a tablet, as the menus and command search
already hide theirs.

---

## v0.6.66 — 2026-10-13

The tour's card no longer sits on the thing it explains. It hid a phone's
soft keys and half its command line, and on a computer the tool rail's
buttons; it now goes below, above or beside its target, and inside it only
when the target is big enough to hold it, as the stack is.

On a phone the tour speaks of taps, not clicks, Tab, F keys or hovering, and
it now shows the Tools button, which it used to skip because the tool rail is
hidden there. In Minimal view it adds the status line's modes and its menu,
so it has four steps instead of two.

In landscape with the keyboard up, the equation and matrix writers' keys sit
beside the formula or matrix instead of under it. On a 360 px tall phone
they used to run off the bottom of the screen; now the whole writer fits, and
the matrix shows two full rows of cells instead of one and a half.

---

## v0.6.65 — 2026-10-12

On a phone the matrix writer's Enter works like the HP MatrixWriter's ENTER:
after you type in a cell, your keyboard's Enter stores it and moves to the
next cell, adding a row after the last one, and on a cell you haven't typed
in it puts the matrix on the stack, so 1 Enter 2 Enter Enter enters
[[ 1 2 ]]. Before, the first Enter put whatever was typed so far on the
stack. A computer keyboard's Enter still enters the matrix at once.

The matrix writer's hint no longer tells a phone to press Tab, which a phone
keyboard lacks; on touch it names the › key, which adds a row from the last
cell. Its next-row key shows a down chevron beside ‹ and › instead of the
download icon, and on touch its cells are 40 px tall instead of 32.

---

## v0.6.64 — 2026-10-12

In minimal view a writer now brings its soft keys with it, as on the HP: with
the equation writer open they read SIMP, EXPA, FACTO, d/dX, SOLVE and →NUM,
and with the matrix writer +ROW, −ROW, +COL, −COL, TRN and DONE. A phone had
no other way to add a row or a column there, since the writer's hint relies
on a Tab key. On touch the equation writer's selection tools (Evaluate,
Simplify, Expand, Factor, d/dX, the square root and Delete) are 40 px; they
were 24 px tall and the root 23 px wide. With a phone keyboard up, command
search fills the space above it, and in landscape its rows drop their
description line, so 5 results show in portrait instead of 4 and 2 in
landscape instead of 1.

---

## v0.6.63 — 2026-10-12

A menu or form that is open when a phone's keyboard comes up now moves above
it: the Variables drawer's New folder used to keep its name field and Create
button behind the keyboard, so you typed blind. On a phone a unit inserted
from the Catalog's Units page now leaves a toast whose More reopens the
Catalog with that unit in view, so 9.81, m and s make 9.81_m*s in a few taps;
the Characters drawer's More now returns to the character you picked too. The
Units page's buttons are 40 px square on touch (they were 25 by 24 px), and in
minimal view the "this one" and "argument" marks on a failing command's levels
no longer run into the level number.

---

## v0.6.62 — 2026-10-12

On a phone, where a drawer hides the command line, the drawer's actions now
show their result: inserting a character or unit, running or inserting a
command from the Catalog, recalling or rerunning a History line and recalling
a variable close the drawer, as the HP's CHARS and CAT return to the stack
(opening a folder keeps it open). They used to happen out of sight. After a
character, a toast's More brings the Characters drawer back with its filter,
like the HP's ECHO beside ECHO1. The tutor's Show me does the same on a
phone: the step plays out on the stack, and the note's Continue brings the
card back at the next step. On a tablet or desktop, where the drawer leaves
the command line in view, nothing closes.

---

## v0.6.61 — 2026-10-12

The tutor's I'll do it now works on a phone, where the drawer covers the
command line: it puts the assistant away so you can type the step, and a note
naming the step and its keys stays at the top with a Check button that brings
the card back, checks your stack and scrolls to the result. The note steps
aside while a menu is open. Typing in a drawer on a short screen now leaves
its content room: with the keyboard up under 400 px of height the drawer tabs
and the assistant's status line give way, and under 300 px (landscape) the
drawer's title too. The assistant's messages had no room at all in landscape
with the keyboard up, and 22 px on a 320 by 568 phone; they now get 91 and
125 px, and on a 375 by 667 phone 178 px instead of 76.

---

## v0.6.60 — 2026-10-12

In minimal view a drawer opens as a panel at the side, and dragging its title
bar right now moves it with the finger and closes it past a quarter of its
width, as the bottom sheet closes when dragged down; a shorter drag springs
back. The assistant's input placeholders are shorter ("Ask about RPL,
maths…" and "Paste a problem…"), since on a phone at 320 and 360 px they
wrapped to a second line that the one-line input cut off. On touch the
assistant's controls take a finger: Ask and Tutor reach into the drawer head
like the writer tabs, and Copy, New, Endpoint settings, Stop, the starter
chips, the input and Send are 40 px tall. Opening a drawer now dismisses the
minimal-view and keypad-hidden hints, which stay five seconds and covered a
freshly opened drawer's tabs and title in minimal view.

---

## v0.6.59 — 2026-10-12

With a phone's keyboard up, the assistant keeps its conversation in view: its
endpoint button and token counts wait for the keyboard to go, where before
they left the messages 14 px at 320 px wide and pushed the input below the
screen. On a phone the drawer is a sheet from the bottom, and dragging its
tabs or title down past a quarter of its height now closes it, as sheets do;
a shorter drag springs back. The History drawer shows each entry and error
in full on a phone, up to six lines, instead of cutting it short, and the
Errors header's Clear takes a finger.

---

## v0.6.58 — 2026-10-12

A command's reference page in the Catalog now fits the drawer. It used to
take the width of its widest table or stack line, so on a phone (and in the
desktop drawer) the description of INTEG, →LIST, CONVERT or DOLIST ran off
the right edge; now the text wraps and a wide input/output table scrolls on
its own, fading at the edge it continues past. A double tap on a level's VIEW
zooms it to 2x about the finger, and the next one back, beside pinch zoom.
On touch the command links in a reference page answer a finger-sized tap;
they were 17 px tall.

---

## v0.6.57 — 2026-10-12

Hold a finger on a stack level to open its menu: the level is selected and
its ⋯ menu opens, so VIEW, LEVEL, KEEP and the rest are one gesture away on a
phone. Lifting the finger over the menu doesn't pick an item, and on touch the
stack no longer starts a text selection (the menu has Copy). Opening any menu
now closes the hint shown on entering minimal view or hiding the keypad, which
sat over the menu's first rows and hid Undo. On a phone narrower than 360 px
the minimal status line's modes share the room the hidden path leaves, up to
40 px each: 36 px at 320 and 39 px at 340 instead of 32, while the display
format keeps its whole label.

---

## v0.6.56 — 2026-10-12

A selected level has the HP interactive stack's LEVEL, which pushes the
level's number and keeps the same value selected; it follows KEEP on the
level's soft keys and in its ⋯ menu. In a short plot drawer, in landscape or
with a phone's keyboard up, the plot no longer draws over the plot types,
the traces and the expression field: the drawer scrolls instead, so the
field you tap stays in view while you type. On a phone every popover menu
(a level's ⋯ menu, the minimal view's menu, the app bar's ⋯ menu, the modes
and Download as…) has 40 px rows instead of 29 px ones.

---

## v0.6.55 — 2026-10-12

Pinch a level's VIEW to zoom it: two fingers scale the value from 0.4x to 4x
about the point between them, so a big matrix fits the screen or a small
exponent grows readable, and one finger still scrolls. A trackpad pinch does
the same on a desktop. With a phone's keyboard up, the matrix writer now
behaves like the equation writer: its grid scrolls inside 35% of the visible
height and its hints wait for the keyboard to go, so the soft keys stay on
screen and the stack keeps a line. The "more levels above" pill no longer
covers the status line's EDITING LEVEL pill when an edit starts.

---

## v0.6.54 — 2026-10-12

With a phone's keyboard up, a tall formula in the equation writer no longer
crowds everything else out: the writer stops at 40% of the visible height and
scrolls, and its insights wait until the keyboard goes down. Before, the stack
shrank to nothing, the soft keys went off the bottom of the screen and the
status line drew over the writer tabs and Ask. VIEW's sheet has Edit, Copy
and Share (where the phone has a share sheet) under the value, and fades at
the edge a wide value continues past, as the stack does. On a phone the
Settings rows that end in a button (back up, install, restore, reset, open
the assistant) put the button under the description instead of squeezing the
text into a narrow column.

---

## v0.6.53 — 2026-10-12

A level's ⋯ menu and soft keys have the HP interactive stack's VIEW, which
shows the value full size in a sheet: a long number such as 100! in full,
wrapped, and a formula or matrix wider than the screen at a readable size,
scrolling both ways, where the stack would shrink or cut it. In the Variables
drawer a long name no longer cuts its type badge down to a stray letter: the
badge moves under the name, and on a touch screen the name wraps to show in
full. A variable's Recall button now has the Enter icon, as does a plot
trace's push button, and Rename has its own text-field icon, so no two of a
variable's buttons look alike on a phone, where there are no hover titles.

---

## v0.6.52 — 2026-10-12

The app bar keeps HOME (or the current directory's name) whole on phones from
340 to 383 px wide, where it used to end in an ellipsis: Install moves into
the ⋯ menu under 360 px instead of 340, the bar's buttons grow to 40 px only
from 384 px, and Search takes a 40 px tap at every width. A level's ⋯ menu
and its soft keys gain the rest of the HP interactive stack: →LIST, DUPN,
DRPN and KEEP act on levels 1 to the one you chose, each undoable. On a touch
screen a selected level's toolbar sits on a line under the value instead of
floating over it, so a tall fraction or a wide matrix stays readable while you
act on it.

---

## v0.6.51 — 2026-10-12

Stack levels keep their full height when the stack holds more than fits, so a
matrix or a textbook fraction no longer draws over the levels next to it, on a
phone with a writer open or on a desktop with a tall stack; the view scrolls
instead, and the "more levels above" pill counts what is hidden. A level wider
than the stack, such as a five-column matrix on a 320 px phone, fades at the
edge it continues past, as the key strip does, instead of ending in half a
digit; drag it sideways to read the rest. A command on a deep stack no longer
stalls while the levels animate into place: the animation measured each row
after starting the one before, laying the whole stack out once per row, so a
command on a 1,000-level stack took 6 s and now takes a quarter of a second.
In Chrome a browser tab no longer offers Install once rpl.ai is installed: it
asks getInstalledRelatedApps, and the manifest lists the app as its own
related web app.

---

## v0.6.50 — 2026-10-12

On a phone the plot's tools start folded into one ⋯ button in the corner,
which unfolds them, so on a 320 px phone they cover about 4% of the plot
instead of a third and a finger landing there pinches or pans; desktop keeps
the open toolbar. A long directory name in the app bar ends in an ellipsis
instead of being cut mid-letter, and under 340 px the bar's spacers give way
first so HOME shows whole. While editing a level on a phone under 430 px, the
input row's editing note no longer shows as a lone letter between the writer
tabs and Ask; the status line's EDITING LEVEL pill already says it.

---

## v0.6.49 — 2026-10-12

With Trace on, a tap or click on a plot moves the trace cursor to that x, and a
drag still pans. On touch, the plot's seven types sit in one row that scrolls
sideways instead of wrapping to three rows on a narrow phone, with the chosen
type scrolled into sight, and the plot's hint and readouts wrap onto a second
line instead of losing their end. Under 380 px on touch, the app bar's first
and last buttons and the button after the modes take a 40 px tap through hit
areas in the bar's padding and the gap beside them, while staying 34 px wide.

---

## v0.6.48 — 2026-10-12

Plots on a phone zoom with two fingers: pinch about any point to zoom in or
out, and the point between your fingers follows them, while one finger still
pans. A tap on a plot now keeps its readout (x, y and each curve's value
there) instead of clearing it as the finger lifts, and the plot's hint on a
phone reads "Tap to read values · drag to pan · pinch to zoom". On touch, the
RPL, Equation and Matrix tabs and Ask take a 40 px tap through hit areas in
the gaps around them, so the stack keeps its height. In minimal view the
status line's directory path ends in an ellipsis instead of a clipped glyph,
and steps aside on screens under 390 px wide.

---

## v0.6.47 — 2026-10-12

When a command fails part way through a line or a program, the stack now ends
up as it does on the HP 50g: everything that ran before the failing command
stays, the failing command gets its arguments back, and nothing after it runs.
With 1 2 3 4 on the stack, CLEAR DROP leaves the stack empty, and
5 6 + 7 "x" - 8 leaves 11, 7 and "x" on top. Before, the app put back the
stack from before the whole line, and a failing EVAL put back the stack it
found. The command line is used up, as on the HP, and lands in the command
history; Fix the line brings it back to edit, and Undo restores the stack from
before it. A line that doesn't parse still stays on the command line and runs
nothing. Actions on a stack level, such as Pick, Roll or a level's menu
commands, are still undone whole when they fail.

---

## v0.6.46 — 2026-10-12

A too-few-arguments error now counts the stack the failing command saw. With
four values on the stack, the line CLEAR DROP used to report "DROP needs one
value; the stack has four values", counting the values the failed line puts
back; it now says "the stack had none". The same holds when the command fails
inside a program or a line with IF, FOR and the like.

---

## v0.6.45 — 2026-10-12

The matrix writer's menu gains the HP's ←WID and WID→, which make the cells
narrower or wider in steps from 40 to 176 px, so a long real such as
3.14159265359 shows in full on a phone instead of ending in an ellipsis. On
touch, the minimal status line's modes are at least 32 px wide, and 40 px
from 360 px, where the one-glyph ℝ and = were 20 px; the directory path gives
way first so every mode stays on one line. Chips (the welcome suggestions,
plot types, error fixes and tutor steps) and a toast's action button are
40 px tall on touch.

---

## v0.6.44 — 2026-10-12

The soft keys' two page arrows are now one NXT key, as on the HP: it turns
to the next page and comes back round to the first after the last. With left
shift it reads PREV and goes back, and the shift clears unless it is locked.
PgDn and PgUp still turn the page. Settings › Appearance gains Stack text
size (Small, Normal, Large or Larger), which scales the stack's text and its
pretty math; it was chosen over pinch zoom, which would scale the keypad and
the rest of the fixed layout off the screen.

---

## v0.6.43 — 2026-10-12

On a phone, the soft keys are 40 px tall whenever the keypad is hidden or in
minimal view; short screens used to shrink them to make room for a keypad that
wasn't there. Settings › Appearance gains Vibrate on key presses on touch
phones that support it (Android), a 10 ms buzz when a finger presses a keypad
key, soft key, strip key or the keys beside the command line; it is off by
default. The Settings sheet's page tabs and chips are 40 px tall on touch, and
each switch takes taps a little beyond its edge.

---

## v0.6.42 — 2026-10-11

On a phone, the app bar's directory crumb, mode chip and buttons are 40 px
tall, and 40 px square once the bar is 380 px wide; the bar keeps its
height. ⌫ and Enter beside the command line are 40 px square too, reaching
into the line's padding so the line keeps its height. Each variable in the
Variables drawer gains Share where the device has a share sheet, sending the
same text a stack level's Share does, and on touch the row's buttons shrink a
little rather than overflow the narrowest drawer.

---

## v0.6.41 — 2026-10-11

On a phone, the drawers' tabs, folder path, filter field, buttons and backup
form are 40 px tall, so each takes a finger. The plot toolbar gains Share
where the device can share images, sending the plot as a PNG. On touch
screens its tools are 40 px, in two columns so all eight fit a short plot,
and anywhere a plot is too short for the toolbar, the toolbar scrolls instead
of hiding its last buttons.

---

## v0.6.40 — 2026-10-11

On a phone, the Variables drawer's buttons are finger-sized and sit on a
line of their own under each variable, so at 320 px the type badge no longer
runs into them; the other drawers' small buttons grow to match. A stack
level's ⋯ menu gains Share… where the device has a share sheet, sending the
same text Copy gives. The key strip above a phone's keyboard fades at an
edge while more keys lie past it, so it reads as something to scroll.

---

## v0.6.39 — 2026-10-11

On short phone screens the keypad's labels no longer collide with the key
faces. At 660 px tall or less the captions under the faces (DUP, DROP, NEG
and the like) give way, and at 580 px or less so do the shift labels in the
corners; pressing a shift key still shows the shifted names on the faces.

## v0.6.38 — 2026-10-11

Landscape phones:

- With the keyboard up, only about 190 px are left. While you type, the mode
  tabs, the hint line, the writers' insight strip, the soft keys and Minimal
  view's status line step aside, so level 1 shows above the command line and
  the equation and matrix writers keep their keys in view. Before, no stack
  level showed, the writers' keys fell under the keyboard, and in Minimal view
  the equation writer covered the status line.
- The keypad's captions (DUP, DROP, SWAP, EDIT, SELECT, NEG) no longer
  overlap the key faces on the short landscape keys.

## v0.6.37 — 2026-10-11

- Installing rpl.ai is easier to find. A browser tab shows a green Install
  button in the top bar (a download arrow on a phone), which installs the
  app where the browser can and otherwise says how, for example Share › Add
  to Home Screen on an iPhone. The installed app, desktop Firefox and the
  smallest phones don't show it; there Install stays in the ⋯ menu. The
  README now starts with an install tip and a browser-by-browser table.
- In landscape, a phone's notch no longer covers the status line, the
  stack, the command line or the keypad.

## v0.6.36 — 2026-10-11

The README opens with an At a glance table of what rpl.ai does, from exact
arithmetic and the CAS to units, statistics, programming, plots and data
exchange, and has an On a phone section with a new screenshot of Minimal
view on a phone. No change to the app.

## v0.6.35 — 2026-10-11

- A phone's back button closes the open menu, command search, sheet, writer
  or drawer first, as an app's does, instead of leaving rpl.ai. With
  nothing open it leaves as before.
- A selected stack level's Edit, Pick, Roll, Plot, Drop and More buttons
  are finger-sized on a touch screen (40 px instead of 27), and all six fit
  on a 320 px phone.

## v0.6.34 — 2026-10-11

The assistant's starter suggestions show more of what the calculator does:
100! exactly with its digit sum, an integral checked by differentiating, a
braking distance in g with units, a system of three linear equations, a
line fitted to data, a Fibonacci program, and a step-by-step RPN demo on
your own stack.

## v0.6.33 — 2026-10-11

- A phone's keyboard labels its Enter key Go on the command line, since
  Enter there runs the line rather than starting a new one.
- Command search no longer shows keyboard shortcuts and its arrow and Esc
  hints on a touch screen.

## v0.6.32 — 2026-10-11

Minimal view on a phone reaches more without leaving it:

- The status line's menu opens command search, and shows or hides the soft
  keys, which before only Settings could do.
- ⌫ and Enter stay beside the command line on a touch screen, so a number
  can be entered or level 1 dropped with the phone's keyboard down. On a
  computer Minimal view still hides them.

## v0.6.31 — 2026-10-11

The command menus' soft keys work like the keypad's keys and the HP 50g's:
with a number on the command line, the SIN soft key in the TRIG menu enters
it and takes its sine at once, instead of typing SIN after it. Inside a
quote a soft key types its call, and inside a program or list its name. The
catalog's run buttons and the command search still type a command while the
line has text, as the HP's catalog does.

## v0.6.30 — 2026-10-11

The rest of the on-screen keypad now works like the HP 50g's too. With a
number on the command line, function keys such as SIN, √x and LOG, and
command keys such as STO, RCL, EVAL and →NUM, enter the line and run at
once: `0` SIN gives 0, and `5 'A'` STO stores. Inside a quote a function key
types its call, `SIN(`, and inside a string, program or list a key types its
name, as before. The menu keys, the catalog and keyboard typing are
unchanged.

## v0.6.29 — 2026-10-11

The on-screen keypad's operator keys work like the HP 50g's. With a number
on the command line, `+`, `−`, `×`, `÷`, `yˣ` and the comparison keys enter
the line and run at once, so `3` ENTER `4` `+` gives 7 without a second
ENTER. Inside a quote, string, program, list or vector they type, as on the
HP, and `×` and `÷` still type into a unit after `_`. Before, they typed
whenever the command line held text. The other keypad keys, such as SIN and
STO, and keys typed on a phone's or computer's keyboard are unchanged:
`1/3` or `X*2` typed there still lands on the line as text.

## v0.6.28 — 2026-10-11

The assistant can pause. When it demonstrates something on your stack step
by step, it can wait one to ten seconds after a step worth a look, showing a
note on what to look at and a countdown, so you can follow along before the
next step runs. Continue moves on sooner, and Stop ends the turn as before.

## v0.6.27 — 2026-10-11

Fixed:

- A line starting with `?` asks the assistant, but the first question after
  opening the app stayed in the assistant's input box while the endpoint
  connected, and needed a second Enter. It now goes out as soon as the
  assistant is ready, unless you change it first. The same goes for asking
  about an error or a stack level.

## v0.6.26 — 2026-10-11

rpl.ai works better as a phone app, above all in Minimal view or with the
keypad hidden. While the phone's keyboard is up on the command line, a
strip above it holds the keys a phone keyboard lacks: `+`, `−`, `×`, `÷`,
`yˣ`, `SWAP` and `DROP` enter the line and run at once, as on the HP, so
`3` Enter `4` `+` gives 7. Inside an open program, list, vector, quote or
unit they type instead, so `«  »` with `2` `×` gives `« 2* »` and `5_m` `÷`
`s` gives `5_m/s`. The strip also has UNDO, the RPL delimiters, `_`, `→`
and `π`.

Fixed:

- In Minimal view on a phone, the status line's buttons were about 25 px
  wide, and at 320 px the leave button was pushed off the screen. They are
  now finger-sized, and a menu button opens Undo, Redo, the Variables,
  History, Plot and Characters drawers, full screen and Settings, which a
  phone could not reach in Minimal view before.
- Toasts in Minimal view covered the status line, hiding the very buttons
  the Minimal view toast points to. They now sit below it, and turning
  Minimal view or the keypad on or off replaces the last such toast instead
  of stacking another.
- On a phone 320 to 360 px wide, most four- and five-letter soft-key names
  broke with a letter left over, such as `ROL`/`L` and `UND`/`O`. Each name
  is now sized to its key: it keeps to one line while that fits, and a long
  one breaks into even lines.

## v0.6.25 — 2026-10-11

`LINSOLVE` solves a system of linear equations, as the AUR describes:
`[ 'X+Y=3' 'X-Y=1' ] [ X Y ] LINSOLVE` leaves the system as a list on level
3, the pivots of the Gaussian reduction on level 2 and `[ 'X=2' 'Y=1' ]` on
level 1. Lists work as well as arrays, an expression without `=` is set
equal to zero, coefficients can be symbolic, a variable the system leaves
free stays out of the solution, and a system with no solution gives `[ ]`.
The app now has 475 commands.

Fixed:

- `SCHUR` failed on every matrix with the real algebra engine, which tags
  its first result `matrix[…]`. That tag is now read like Giac's other list
  tags.
- The equation writer ignored the symbols macOS types with Option, and
  AltGr elsewhere, such as √, π, ≤ and ∑ (W-L23). They now act as their
  keys do.
- A tall formula left the caret below the visible part of the equation
  writer (W-L24). The writer now scrolls up and down to the caret as well as
  sideways.
- On a touch screen a drag in the equation writer never selected anything
  (W-L25). A drag still scrolls a long formula; touch and hold, then drag, to
  select.
- On a 320-pixel phone the selection toolbar ran off the left of the
  screen. It now wraps to fit, and a number too long for its matrix cell
  ends in an ellipsis instead of being cut off.

## v0.6.24 — 2026-10-10

The HP's algebraic derivative. `'∂X(X^2)'` reads and prints as the AUR
writes it, and a two-argument DERIV prints the same way. EVAL hands a
derivative, and an indefinite integral, to the CAS: `'∂X(X^2)' EVAL` gives
`2*X` and `'INTEG(COS(X),X)' EVAL` gives `SIN(X)`. The variable of a
derivative or integral is bound, so a value stored in X stays out of the
body and applies to the result: with 3 in X, `'∂X(X^2)' EVAL` gives `6`.

Fixed:

- In GRD mode the CAS worked in degrees, so `'SIN(X)' 'X' DERIV` gave
  `π/180*COS(X)`. Giac has no gradians; symbolic work now runs in radians
  there, as the HP's CAS does. DEG mode still works in degrees.
- In the matrix writer, ◀ in the first cell jumped to the end of the row
  and ▶ in the last cell to the start of it (W-L28). The corners stay put;
  the other edges still move to the previous or next row.
- Tapping the menu bar's page arrows on a phone closed the keyboard, as the
  arrow took the focus from the command line.

## v0.6.23 — 2026-10-09

EVAL of an algebraic integral asks the CAS, as the HP does: `'∫(0,1,X^2,X)'
EVAL` gives `1/3`, `'1+∫(0,1,X^2,X)' EVAL` gives `4/3`, and one the CAS
cannot work out stays as it is. Giac's infinity comes back as `∞` inside a
result too, so a transform left as an integral reads `∫(0,∞,…)`.

Fixed:

- In the equation writer, pasting at the caret replaced the item before it
  (W-L21). The pasted expression now follows that item as a factor, as
  typing does, with a pasted sum in parentheses.
- After ◀ into a fraction, root or other box, ▶ could not leave it
  (W-L22). Past the last leaf of a box it now steps out to the structure
  that holds it, so `+ 1` follows the fraction.
- On a touch screen the writers' keys and the command line's buttons were
  30 pixels tall (W-L30); they are finger-sized now.

## v0.6.22 — 2026-10-08

The HP's algebraic integral. `'∫(0,1,X^2,X)'` reads and prints as the AUR
writes it, lower limit, upper limit, integrand and variable, and a
four-argument INTEG prints the same way. `→NUM` works such an integral out
numerically to 12 digits, `'∫(0,π,SIN(X),X)' →NUM` gives `2.`, while EVAL in
EXACT mode leaves it as it is for the CAS. An integrand that cannot be
evaluated at a point, `1/X` from 0, stays symbolic.

Fixed:

- The equation writer could not push back a real of 1E21 or more
  (W-L19): `2.5E22` came out as `2.5e+22` and was refused. Such a number
  keeps the HP's spelling, in the writer and in an algebraic's text, and a
  whole real such as `5.` stays a real instead of becoming an integer.
- A matrix wider than the stack was cut off on the left (W-L31). It now
  starts at the left of its level and scrolls sideways.
- LINFIT, EXPFIT, LOGFIT and PWRFIT showed the manual's "None" as their
  stack signature in the Catalog and the palette.

## v0.6.21 — 2026-10-07

Logic inside algebraics. `AND`, `OR`, `XOR` and `NOT` are operators in an
algebraic, with the AUR's precedence: comparisons bind tighter than NOT and
AND, which bind tighter than OR and XOR. So `'X>1 AND X<5'` is a test that
EVAL works out once X has a value, `'NOT (A AND B)'` keeps its parentheses,
and `'IFTE(X>0 AND Y>0,1,0)'` chooses as expected. On the stack `AND`, `OR`,
`XOR` and `NOT` build such an algebraic from a symbolic argument, as the
AUR's stack diagrams show: `'X>1' 'X<2' AND` gives `'X>1 AND X<2'`. The CAS
reads and writes them, so `'X^2>4' 'X' SOLVE` gives `{ X<-2 X>2 }` and
`'X^2-4<0' 'X' SOLVE` gives `{ X>-2 AND X<2 }`; the equation writer shows
them, and Copy as LaTeX writes ∧, ∨, ⊻ and ¬. A comparison in parentheses
can be an operand, `'(X<Y)+1'`, where an equation still cannot.

`∫` on the stack is the AUR's definite integral: lower limit, upper limit,
integrand and variable, so `1 2 '10*X' 'X' ∫` gives `15` and
`0 'π' 'SIN(X)' 'X' ∫` gives `2`. It used to be a second name for the
two-argument INTEG; a program that used it that way needs INTEG.

More statistics: `BINS` sorts the independent column of ΣDAT into frequency
bins, `NDIST` is the normal density from a mean and a variance, and `PVAR`,
`PSDEV` and `PCOV` are the population variance, standard deviation and
covariance. The app now has 474 commands.

Fixed:

- When the equation writer or the keyboard shrank the stack view, level 1
  scrolled out of sight (W-M16). A view that was at its bottom stays there.
- `LAPLACE` and `ILAP` asked Giac to transform into the variable they
  transformed from. The transform variable is now its own, renamed back
  afterwards, so `'EXP(-2*X)' LAPLACE` gives `1/(X+2)` and `'1/(X+2)' ILAP`
  gives `EXP(-2*X)` back.
- `SOLVE` of an inequality wrapped each condition as `X = (X>2)`.
- In the Catalog and the palette, LR and three other commands showed the
  manual's column headings (`Level 1/Argument 1`) as their signature.

## v0.6.20 — 2026-10-06

The HP's statistics matrix. `Σ+` adds a data point to the reserved variable
ΣDAT, as a real, a vector, a matrix of rows, or, once ΣDAT has m columns, m
separate reals: `CLΣ [ 2 3 4 ] Σ+ 3 1 7 Σ+` builds `[[ 2 3 4 ][ 3 1 7 ]]`,
as the AUR's example says. `Σ-` gives the last point back and removes it,
`CLΣ` purges ΣDAT, `RCLΣ` and `STOΣ` recall and store it. The statistics
commands read ΣDAT whenever level 1 holds no array, so `5 Σ+ 7 Σ+ 9 Σ+ MEAN`
gives `7.`, and a one-column matrix gives a number rather than a one-element
vector, as on the HP. `XCOL`, `YCOL` and `COLΣ` pick the independent and
dependent columns, kept in ΣPAR as `{ xcol ycol intercept slope model }`;
the fits, `LR` and `BESTFIT` store their coefficients and model there, `LR`
pushes them tagged as `:Intercept:` and `:Slope:`, `ΣLINE` gives the model's
formula, and `PREDY` (the same as PREDV) predicts from it. BESTFIT now makes
its pick the current model, as the AUR describes, and pushes the fit the way
LINFIT does. `TRAN` is the plain transpose beside `TRN`. The app now has 469
commands.

Fixed:

- On a phone, a window a quarter shorter hid the keypad whether or not the
  keyboard was up, and it stayed hidden (W-M15). The keypad now makes way
  only while something editable has the focus, and comes back when the
  focus leaves.
- `→ROW` and `ROW→`, `→COL` and `COL→` were the wrong way round: as the AUR
  says, `→ROW` takes a matrix apart into its rows and `ROW→` puts rows
  together. Programs that used them need swapping.
- `TRN` did not conjugate complex entries; it is the conjugate transpose as
  the AUR defines it, and `TRAN` is the plain one.
- `HORNER` pushed its point above the remainder; the AUR's order is
  quotient, point, remainder, with P(r) on level 1.
- An array divided by a square matrix solves the system, `[5 10]
  [[2 1][1 3]] /` gives `[ 1. 3. ]`, as the AUR describes.
- A fitted model showed its coefficients with 17 digits
  (`0.16666666666666696 + 2*X`); they are rounded to 12.

## v0.6.19 — 2026-10-06

Download or copy a plot. Two buttons on the plot canvas copy it as an image
and download it as a PNG, named after the first trace, at the screen's pixel
density.

Unit keys in the equation writer. A menu picked from the menu bar while a
writer is open now takes the writer's menu's place, and the picker lists EQW
or MTRW to bring it back. With the UNITS menu up, a unit key attaches its
unit to the number being typed, so 5 then LENG m gives `5_m` and a compound
unit such as m/s is bracketed; the ↱ layer divides by the unit.

Fixed:

- A matrix cell takes `2,500`, `10%`, `$1,234.50` and `12,5` as a
  spreadsheet writes them, and `1+2i` as a complex number, whether typed or
  pasted one at a time; a pasted range already did (W-M6).
- `'1/0' EVAL` kept `1/0`; it now gives the HP's Infinite result, as does
  `0^-1` or a division that folds to zero. A division by zero with a name in
  it, `X/0`, stays symbolic.

## v0.6.18 — 2026-10-06

SERIES. `'LN(X)' 'X=1' 2 SERIES` gives `{ :Limit:0 :Equiv:h :Expans:h-1/2*h^2
:Remain:h^3 }` and `h=X-1`, as the AUR describes: the limit at the point, the
leading term, the expansion in a small h and the order of its remainder. The
variable alone means the point 0, a bare value is the point in the formula's
only variable, and `X=∞` or `X=-∞` expands at infinity with `h=1/X`. The app
now has 457 commands.

EVAL evaluates as the HP does. A variable that holds an algebraic or a name
is substituted and evaluated in turn: with `Y+1` in X, `'X^2' EVAL` gives
`(Y+1)^2`, and with 2 in Y as well it gives 9; a variable that refers to
itself is substituted once. Fractions are worked exactly in EXACT mode:
`'1/3+1/6' EVAL` gives `1/2`, `'2/4' EVAL` gives `1/2`, `'(2/3)^-2' EVAL`
gives `9/4`, and `'1/3' EVAL` lands as the fraction 1/3 rather than an
algebraic, so `3 *` gives 1.

Equation writer:

- `2e-3`, `2e3` and `2E+3` typed with the letter key read as scientific
  notation, as they would on a keyboard; `2e` times x is still 2·e·x.
- The insight strip works a formula with units out: `5_m+3_ft` offers
  `19.4041994751_ft`, and one click replaces the formula with it.

## v0.6.17 — 2026-10-06

Units inside algebraics. A unit object can sit in an algebraic, as on the HP
50g: `'X*5_m'`, `'5_m+3_ft'` or `'9.81_(m/s^2)*T^2/2'`. EVAL and →NUM work
the units out exactly as the stack commands do, converting to the right-hand
unit, so `'5_m+3_ft' EVAL` gives `19.4041994751_ft` and a length plus a time
is Inconsistent units. A variable that holds a unit object is substituted,
so with `2_s` in `T` the formula above gives `19.62_m`; units that cancel
fold into the number around them, and IFTE compares units to pick its
branch. `5_m 'X' *` now gives the algebraic `'5_m*X'` instead of an error.
Inside an algebraic a unit runs to the next operator, so a compound unit
goes in parentheses, and the app writes it that way: `'5_m/s'` is 5 m
divided by a variable `s`. In the equation writer, `_` after a number
starts its unit (the keypad's ↱ − or the `_` key), letters and `^` spell it,
and a `(` group takes `*` and `/`. Copy as LaTeX writes such a quantity as
`5\,\mathrm{m}`. Symbolic commands such as EXPAND and SOLVE refuse an
algebraic with units rather than drop them.

TAYLR, TAYLOR0 and ZEROS. `'EXP(X)' 'X' 3 TAYLR` gives the Taylor
polynomial `1+X+1/2*X^2+1/6*X^3` at 0. As the AUR defines it, the order is
relative, counted from the lowest power, so `'X*EXP(X)' 'X' 2 TAYLR` is
`X+X^2+1/2*X^3` and a pole keeps its negative powers; coefficients come
reduced (`-1/3*X^4` where the AUR's example prints `-8/4!*X^4`). TAYLOR0 is
the fourth-order polynomial in VX. ZEROS lists each root once, in
increasing order, without SOLVE's `X=`: `'X^3-X^2-8*X+12' 'X' ZEROS` gives
`{ -3 2 }`. Unlike the HP, it always returns a list, even of one root. The
app now has 456 commands.

Fixed:

- DERVX, INTVX, TAYLOR0, PREVAL and LIMIT at a bare point used VX, which
  is `x` by default, even for an expression in `X`, so `'X^2' DERVX` gave 0.
  They now use the expression's only variable when VX isn't in it.
- Results from the algebra engine printed `pi`; they now show π, as
  everything else does (`X = 1/2*π`).
- In the equation writer, × on a selected sum multiplied only its last term
  (`1+2` then ×3 gave `1+2*3`); removing a fraction or power around a sum
  next to × or after − merged it into its neighbours (`3-(x+1)/4` became
  `3-x+1`); and − straight after EEX was refused instead of making the
  exponent negative.
- The assistant was told that mph, °C and °F are not units and converted
  them by hand.

## v0.6.16 — 2026-10-05

The whole HP 50g unit catalog. The units the app still lacked are added: `Å`,
`fermi`, the micron `μ`, `ftUS`, `miUS`, `chain`, `rd`, `fath`, `Mpc` and
`lyr`; the are `a` and the barn `b`; `st`, `galC`, `ozUK`, `cu`, `bu`, `pk`
and `fbm`; `c` and `ga`; `t`, `tonUK` and `u`; `gf` and `pdl`; `Kcal` and
`therm`; `inH2O`; `Fdy` and `mho`; `ph`, `fc`, `sb`, `flam` and `lam`; `rad`,
`rem`, `Ci` and `R`; and the poise `P` and stokes `St`, which take prefixes,
so `1_cP` and `1_cSt` work. The UNITS menu gains the VISC category, and the
other categories gain their new keys. Definitions follow the current standards
where the HP's table predates them, so the therm is 100,000 Btu and the
faraday is 96485.3321233 C.

Units that cancel leave a number. A literal such as `1_m/m` made a unit object
that showed `1.` but that `+` refused; it is now the real number 1, as `2_m
2_m /` already gave.

IFTE in algebraics. `'IFTE(X>0,X,-X)'` works inside an algebraic, in plots and
in the equation writer, and only the branch the test picks is worked out. A
comparison may now be a function argument, so a DEFINE'd function can call
itself: `'R(N)=IFTE(N<=1,1,N*R(N-1))' DEFINE` then `'R(25)' EVAL` gives
15511210043330985984000000, exactly.

Three equation writer slips are fixed. `x=3=4` is refused with a message where
the writer quietly pushed `x=3`; digits typed after a name join it, so `x1` is
a name, as on the HP, rather than `x*1`; and a number ending in a point, such
as `3.`, is the real it spells instead of an incomplete box. `2 EEX 3` is now
the real `2000.`, as `2E3` is on the command line.

## v0.6.15 — 2026-10-04

User functions. DEFINE works as the AUR describes: `'A=2*X' DEFINE` stores
`2*X` in A, and `'F(X)=X^2+1' DEFINE` makes the user function `« → X 'X^2+1'
»` in F. Any NAME(args) in an algebraic is now a call, where it used to be
refused as an invalid algebraic: `'F(3)' EVAL` gives `10`, `'F(A+1)' EVAL`
gives `(A+1)^2+1`, a stored variable in the argument is used, and `'F(X)'`
plots as its body. Any other stored program can be called the same way and
must leave one result, so `« SQ » 'Q' STO 'Q(5)' EVAL` gives `25`. A user
function keeps its case, so f and F are different, and a function that calls
itself forever stops with EVAL recursion too deep.

The matrix writer pushes what you typed. `1 Tab 2 Enter` gave `[[ 1 2 0. ]]`,
padded to the writer's three columns; empty columns at the end are now left
off, as empty rows already were. ⇧Enter starts the next row in the column the
row began in, as in a spreadsheet, and adds a row at the bottom where it used
to wrap to the top. VECT takes a single typed row in a larger grid, the writer
goes back to 3 by 3 after pushing a bigger matrix, and the footer shows the
size Enter will push. EEX on an empty cell types `1E`, +/- after it signs the
exponent, the keypad's ( ), comma, ∠, DEL and CLEAR work in a cell, and a cell
that doesn't read is named in words and gets the cursor.

Sums copy and paste the right way round. The app writes a sum as Σ(body,
index, from, to), but Copy as LaTeX took the first argument for the index, so
a sum built in the writer copied as nonsense, and pasted `\sum` LaTeX built
sums the same wrong way. Both now follow the order the app evaluates and
draws.

In HEX mode a number that a trailing b or d can't end, such as `#1AB` or
`#2B`, is read as hex instead of failing as a malformed binary number.
Otherwise the trailing letter is still the base, as the AUR says, so `#1B` is
binary 1 and `#1Bh` is hex.

## v0.6.14 — 2026-10-04

Angle units. The catalog gains `°`, `r`, `grad`, `arcmin`, `arcs` and `sr`,
with angle as a base dimension of its own as on the HP 50g, so `1_° UBASE`
gives `0.0174532925199_r` and `100_grad 1_° CONVERT` gives `90._°`. The UNITS
menu has the ANGL category between ELEC and LIGHT. SIN, COS and TAN take an
angle unit, which overrides the angle mode as the AUR says: `30_° SIN` is
`0.5` in DEG, RAD and GRD alike, and whole quadrants are exact, so `90_° COS`
is `0` and `100_grad SIN` is `1`. A unit that is not an angle is Bad argument
type.

The command line reads apostrophes. `'X^2+1'` and `5 'A' STO` now mean what
they do on the HP 50g; the ` key still stands in for the ' key, and either
closes its own kind. They used to make a name with the apostrophes inside it,
which STO refused with a hint to use backticks. A function key typed inside an
open apostrophe types its name, as it does inside backticks, and an apostrophe
in a string or a comment is still just text.

Paste LaTeX. A formula copied from a paper, a chat or a notebook pastes into
the equation writer, or onto the command line, as the expression it spells:
fractions, roots with an index, powers, subscripts, Greek letters, `\sin` and
the other functions, bars and floor and ceiling brackets, factorials,
`\binom`, `\sum`, `\int` with its `dx`, `\frac{d}{dx}` and `\frac{d^2}{dx^2}`,
with `$…$` or `\(…\)` dropped. It reads as TeX does: `2x` is 2·x, `\sin 2x` is
sin(2x), `x^23` is x² times 3, and `\sin^{-1}` is the inverse function, as on
a calculator. Copy as LaTeX followed by a paste returns the same expression
for every one of 85 cases tested. Limits, matrices and unknown commands are
refused with a message naming the command. Copy as LaTeX now writes a Greek
name with digits as `\theta_{1}` rather than `\theta 1`.

No soft key label is cut. Names of nine letters or more take three lines of a
smaller face, and so do names of seven letters on the narrowest phones; of the
labels in every menu, none is cut now at 320, 360, 390 or 412 px wide (3, 10
and 34 were, at 390, 360 and 320).

## v0.6.13 — 2026-10-04

IFERR hands the failing command's arguments back. After an error in the trap
clause, the arguments of the command that failed are on the stack, and so is
whatever the clause had computed before it, as the AUR describes: `IFERR a b /
THEN LSQ END`, the AUR's own example, now finds a and b for LSQ. The stack
used to roll back to where IFERR began, so a handler had nothing to work
with; a program that counted on that roll-back now needs a DROP2 or a DROPN in
its THEN clause. An EVAL or IFT inside a trap leaves the stack where the
command failed too; outside a trap, a failing EVAL still puts the stack back
as it found it.

Spreadsheet columns paste as columns. A single column copied from Excel,
Sheets, Numbers or Calc used to paste as separate numbers, because plain text
can't tell a column from typed lines. The clipboard's HTML flavour can, so it
now becomes an n by 1 matrix, on the command line and in the matrix writer.
That flavour also carries each number at the exact value the sheet stores
(Excel's `x:num`, Calc's `sdval`, Sheets' `data-sheets-value`), so a cell
showing 3.14 no longer pastes 3.14 in place of 3.14159265358979.

More commands take units. RE gives the number of a unit, SIZE counts the parts
of a unit as the AUR counts them, the derivative of a unit is 0, SORT orders a
list of units, and UVAL and UBASE keep a tag and map over a list; all of these
were Bad argument type. SORT also orders names, and lists by their first
element. SIZE now gives the digits of an integer, the objects of an
algebraic, and 1 for a type it doesn't list (a Real used to be Bad argument
type). UFACT, TDELTA and TINC, the three unit commands the app lacked, are
added.

Malformed unit literals are errors. `1_`, `1_m*`, `1_*m`, `1_m//s` and `1_1`
were read as a plain number or as the unit they half spelled. A second unit
key while typing `5_m` appends `*s` instead of `_s`, which did not read.

The soft keys wrap. On a narrow screen a long name such as ISPRIME? or
LASTSTACK shows over two lines where it was cut to ISP…. Of the labels in every
menu, 94 were cut at 390 px wide and 178 at 360 px; now 3 and 10 are. The
UNITS menu opens on its categories with the commands after them, as the HP's
does, and the stack level menu is grouped by what each item does.

## v0.6.12 — 2026-10-03

Copy as LaTeX. A stack level's menu has Copy as LaTeX for any value, and in
the equation writer the left-shift layer of the COPY soft key copies the
selection, or the whole expression. Quotients become `\frac`, powers
superscripts, roots `\sqrt`, and Σ and ∫ become `\sum` and `\int`; Greek
names and subscripts are set properly, a matrix is `bmatrix`, a rational a
fraction and a unit upright text, so `9.8_m/s^2` copies as
`9.8\,\mathrm{m}\,\mathrm{s}^{-2}`. Parentheses appear wherever dropping
them would change the meaning (`\sin\left(X\right)\,Y`, not `\sin\,X\,Y`),
and a sum or a Σ that something follows is fenced off. Programs, directories
and graphics have no LaTeX form. KaTeX, the strictest common renderer, takes
every test case and 20,000 random expressions, and a round trip of 25,000
random ones confirms the parentheses keep their value.

The UNITS menu has the HP 50g's categories. LENG, AREA, VOL, TIME, SPEED,
MASS, FORCE, ENRG, POWR, PRESS, TEMP, ELEC, LIGHT and RAD each open a page of
keys, 131 in all with the common prefixed ones such as kΩ, μF and kPa; only
49 units had keys before, and the Catalog's unit grid groups the same way.
As on the HP, a unit key multiplies level 1 by the unit, so keys build
compound units, ↰ converts level 1 to it and ↱ divides by it: `5` ft then
↰ m gives `1.524_m`. While you type, a unit key appends `_ft` and ↱ appends
`/s`. A unit key used to push a fresh `1_m` when level 1 was already a unit;
it now multiplies. The shortcut sheet no longer says the shifted soft keys
only store and recall, and the assistant stopped telling people that mph and
degrees are not units.

Units take fractional powers. `9_m SQRT` is `3._m^.5`, `9_m^2 SQRT` is
`3._m`, XROOT takes the x-th root of a unit, and `x_unit y ^` takes any real
power, with exponents kept to 12 digits. A unit that overflows is Infinite
result instead of an infinite magnitude.

SIGN, RND and TRNC accept units: SIGN gives the sign of the number, RND and
TRNC round it. `%` takes a unit and a plain number, and `%T` and `%CH` take
two units, treat temperatures as differences and return a plain number, as
the AUR describes.

`(1_m,2_s)` and `(1abc,2)` were read as `(1,2)`, because each part went
through parseFloat and lost its tail. A part must now be a plain number or a
fraction, and anything else is a bad complex literal.

## v0.6.11 — 2026-10-02

Units take SI prefixes and temperatures. `5_kJ`, `1_MHz`, `3_kW`, `100_nF`
and `1_uA` were all Unknown unit; a prefix now goes before any SI unit
(micro is μ, µ or u, and D is the HP's deka), and the catalog gains about
fifty units, among them lbf, psi, gal, mph, hp, kWh, acre and nmi. A bare
°C or °F is a thermometer reading, as the AUR describes: `100_°C 1_°F
CONVERT` is `212_°F`, UBASE gives kelvin, and comparisons convert. Sums and
differences treat temperatures as differences, and accept only two absolute
temperatures (K, °R), two °C or two °F; `10_°C 5_K +` is Inconsistent
units. `degC`, `degF` and `degR` spell the units without the degree sign.

Excel workbooks. A matrix, vector or list downloads as `.xlsx` from its
download button in the Variables drawer, and a `.xlsx` file uploads in the
drawer or drops anywhere on the calculator, as a matrix or, when a cell
holds text, a list of rows. rpl.ai reads the first sheet's used range
and says when the workbook has more; formulas arrive as their last
calculated values and dates as Excel's serial numbers. The zip container
and the sheet cells are written and read in a small module with no
library, and the tests read workbooks written by openpyxl and XlsxWriter.

One download menu. A stack level's menu and the Variables drawer open the
same Download as… list: `.json` and `.rpl` for any value, plus CSV, TSV and
Excel for a matrix, vector or list. A program or a number on the stack can
be saved as HP text for the first time.

Fractions are exact in text. `1/3` typed without spaces is the rational,
as it is shown; it used to be the integer 1 and a name `/3`, so editing a
rational level, `->STR` then `STR→`, and saving an `.rpl` turned `1/3` into
two objects. This changes the meaning of such a token. In approximate mode
it is a real number, and `1/0` is Infinite result. The matrix writer takes
`1/2` and `sin(x)` in a cell; both were rejected.

Pasting a spreadsheet column of more than about 125,000 rows, or opening
such a file, no longer overflows the stack: a paste stays text and a file
is refused with the cell-limit message.

---

## v0.6.10 — 2026-10-01

A number is what it shows. Real numbers and the parts of complex numbers
keep 12 significant digits, as on the HP 50g, instead of 15 digits that the
display rounded away. `1. 3. / 3. *` was shown as 1. while its IP was 0 and
an edit that changed nothing changed the value; it is now 0.999999999999,
as on the calculator, and `2. SQRT SQ` is 1.99999999999. This breaks the
15-digit results of earlier releases, so a program that relied on them
rounds at 12. Working inside one command still uses 15 digits.

The display formats follow the AUR. FIX n switches to scientific form when
the value needs more than 12 digits or would show as zero, instead of
printing a long string of digits or a bare `0.00`; FIX 0 keeps its point
(`3.`), SCI 0 shows `1.E2`, and ENG n shows n+1 digits with an exponent
that is a multiple of 3 (`103.6` in ENG 0 is `100.E0`). Complex parts and
unit magnitudes are formatted the same way.

Spreadsheets and files. Matrices, vectors and lists download as `.csv` or
`.tsv`, from the download button of a variable in the Variables drawer
(which also offers `.json` and `.rpl` now) or with Download as CSV in a
stack level's menu. A `.csv`, `.tsv`, `.rpl`, `.txt` or `.json` file
uploads in the drawer, named after the file, or drops anywhere on the
calculator to land on the stack. A CSV of numbers is a matrix (a vector for
one row), a row of text above numbers is a header and is skipped, and a
table with other text is a list of rows; commas, semicolons and tabs are
told apart, and decimal commas are read. Pasted cells read currency,
percentages, accounting negatives such as `(300.00)`, a lone dash as zero
and the separators of other locales (`1.234,56`, `1 234,56`), on the
command line and in the matrix writer. Pasting more than 50 rows or columns
into the matrix writer threw or built a jagged matrix; the rest of the
range is now left out, and the writer says so. A tab-indented program is
still pasted as text.

Units follow the AUR. `5_ft 9_in +` is `69_in` and `25_ft 8_in -` is
`292_in`: the result is in level 1's unit (it was level 2's). `==` and the
ordering comparisons convert, so `1_m 100_cm ==` is 1 (it was 0) and
`1_m 50_cm >` is 1 (it was an error); units of different dimensions are
never equal, and ordering them is Inconsistent units. MIN and MAX take two units. Unit
magnitudes keep 12 digits, so `0.03_ft DUP -` is 0 (it was 3.5E-18_ft) and
`3_yd 1_ft CONVERT IP` is 9 (it was 8). `0.5_1/m` enters and prints
back, and an exact fraction multiplies a unit.

Editing a stack level while the matrix or equation writer already holds
something no longer replaces it silently: a toast says so and Undo brings
it back.

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
