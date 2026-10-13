# Release Notes — rpl.ai

**Latest release:** v0.6.73 (2026-10-13)

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
