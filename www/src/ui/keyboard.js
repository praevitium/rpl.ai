/* =================================================================
   Keyboard layout + rendering.

   The HP 50g has ~50 physical keys.  Each can have up to four distinct
   functions: unshifted, left-shift (orange), right-shift (red), and
   alpha (blue).  This module declares the canonical HP 50g layout
   (Appendix B in the User Guide), renders the DOM, and wires each key
   to an action that runs on Entry.

   Three grids, faithful to the physical hardware:
     SOFT_KEYS — 6 cols          F1..F6 soft menu row
     NAV_KEYS  — 5 cols × 2 rows HOME/PREV/NEXT + VARS/STO/RCL with a
                                 4-way arrow diamond in cols 4-5
     MAIN_KEYS — 5 cols × 7 rows row 4 .. row 10 of the calculator
                                 (LASTARG/EVAL/'/UNDO/⌫ .. ON/0/./SPC/ENTER)

   Alpha letters a..z (lowercase) map sequentially to the first 26 keys
   of the device (F1=a, F2=b, …, ÷=z).  This is a deliberate deviation
   from the HP 50g — the real hardware prints UPPERCASE alpha labels
   and defaults to uppercase typing.  We default to lowercase instead,
   matching how a modern user expects a PC-style keyboard to behave.
   Op lookup is case-insensitive (ops.js `lookup` upper-cases the name
   before consulting the registry), so `sin` typed in alpha mode and
   `SIN` typed via the SIN function key both dispatch the same op.

   A "shift state" is tracked so subsequent key presses pick up the
   shifted function.  Shift keys auto-clear after one non-shift press.
   ================================================================= */

// Convenience: mk(primary, { shiftL, shiftR, alpha, action, kind, className })
function mk(primary, opts = {}) {
  return {
    primary,
    shiftL:       opts.shiftL       ?? '',
    shiftR:       opts.shiftR       ?? '',
    alpha:        opts.alpha        ?? '',
    action:       opts.action       ?? null,
    shiftLAction: opts.shiftLAction ?? null,
    shiftRAction: opts.shiftRAction ?? null,
    kind:         opts.kind         ?? 'op',
    className:    opts.className    ?? '',
  };
}

/* Actions returned from key press handlers are functions
   (entry, shiftState, app) => void */
const type   = text =>              (e) => e.type(text);
const exec   = op   =>              (e) => e.execOp(op);
// Route ENTER and cancel through the App so the "edit level 1"
// shadow gets committed or restored correctly — on ESC / ON, a
// pending edit pushes its value back on the stack instead of losing
// it.  Other dispatchers keep using the Entry directly: they don't
// interact with the edit shadow.
const enter  =                  (_e, _s, app) => app.commitEntry();
const back   =                      (e) => e.backspace();
const chs    =                      (e) => e.toggleSign();
const eex    =                      (e) => e.eex();
const cancel =                  (_e, _s, app) => app.cancelEntry();

/* Edit-aware dispatchers.  While the command line is being composed
   (anything in the buffer OR an unclosed tick — see Entry.isEditing)
   these type the char / name into the buffer instead of running the
   op on the stack.  Outside edit mode they run the op as usual.
   This is what lets the same physical key be a calculator button on
   an empty line and a text-insert key while building a program.

     typeExec('+', '+')     — type `+` while editing, else run + op
     typeExecFn('SIN')      — type `SIN(` while editing, else run SIN
     typeExecName('UNDO')   — type `UNDO ` while editing, else run UNDO

   Covers both the algebraic-entry case (`'…'`) and any in-progress
   buffer, so starting to type never silently commits + executes a
   half-finished line. */
const typeExec     = (ch, op) =>    (e) => e.typeOrExec(ch, op);
const typeExecFn   = fn =>          (e) => e.typeOrExecFn(fn);
const typeExecName = op =>          (e) => e.typeOrExecName(op);

/* --------------------- Row 1: soft-menu keys (6) --------------------- */
export const SOFT_KEYS = [
  mk('F1', { alpha: 'a', className: 'menu', action: (e, s, app) => app.pressSoftKey(0) }),
  mk('F2', { alpha: 'b', className: 'menu', action: (e, s, app) => app.pressSoftKey(1) }),
  mk('F3', { alpha: 'c', className: 'menu', action: (e, s, app) => app.pressSoftKey(2) }),
  mk('F4', { alpha: 'd', className: 'menu', action: (e, s, app) => app.pressSoftKey(3) }),
  mk('F5', { alpha: 'e', className: 'menu', action: (e, s, app) => app.pressSoftKey(4) }),
  mk('F6', { alpha: 'f', className: 'menu', action: (e, s, app) => app.pressSoftKey(5) }),
];

/* --------- Rows 2-3: nav/app keys (6) + 4-way arrow diamond --------- */

// These six render into cols 1-3 of the 2-row nav grid.
// Row-major order: VARS PREV NEXT | HOME STO RCL
// (Layout renamed from the historical APPS/MODE/TOOL/VAR/STO▶/NXT — the
// renamed keys are label-drives-action: HOME descends to HOME directory,
// VARS opens the soft-menu of the current directory's variables,
// STO/RCL invoke their namesake ops, PREV/NEXT page the soft-menu.
// The MODES soft-menu is reachable via the side-panel Commands tab.)
export const NAV_KEYS = [
  mk('VARS', { alpha: 'g', action: (e, s, app) => app.showVarsMenu() }),
  mk('PREV', { alpha: 'h', action: (e, s, app) => app.prevMenuPage() }),
  mk('NEXT', { alpha: 'i', action: (e, s, app) => app.nextMenuPage() }),
  mk('HOME', { alpha: 'j', action: typeExecName('HOME') }),
  mk('STO',  { alpha: 'k', action: typeExecName('STO') }),
  mk('RCL',  { alpha: 'l', action: typeExecName('RCL') }),
];

// Arrow-diamond cluster — 4 keys, positioned N/S/E/W by className
// in a 3×3 sub-grid within cols 4-5 rows 1-2 of .nav-row.
//
// HP50 keystroke semantics (Advanced Guide G-2 / 25.1 / 35.1 / 36.1):
//   ▲ (Up)    — with empty cmdline: enter interactive stack mode (a
//               browse cursor over stack levels with an ECHO/PICK/ROLL
//               soft menu).  With typed text: scroll the stack view.
//   ▼ (Down)  — with empty cmdline AND a non-empty stack: pull level 1
//               onto the command line for EDITB-style editing.  Otherwise
//               scroll.
//   ▶ (Right) — with empty cmdline AND ≥2 items on the stack: SWAP
//               levels 1 and 2.  With text in the buffer: cursor-right.
//               Otherwise page the soft menu forward.
//   ◀ (Left)  — cursor-left when editing; otherwise page the soft menu
//               backward.  (HP50 has no corresponding stack-edit verb on
//               ◀ — LEFT is reserved for menu paging + cursor motion.)
export const ARROW_KEYS = [
  // CST — HP50 "Custom menu" key.  Loads the CST reserved variable
  // (a list) as a soft menu.  Sits to the left of ▲ so the inverted-T
  // of arrows is flanked symmetrically: [CST][▲][TOOLS] / [◀][▼][▶].
  // Labelled with the HP50 mnemonic "CST" rather than a wrench glyph
  // so the function is recognisable at a glance to anyone coming from
  // the real device.
  mk('CST', { kind: 'menu', className: 'cst-key',
              action: (_e, _s, app) => app.showCustomMenu() }),
  mk('▲', { kind: 'arrow', className: 'arrow-up',
            action: (e, _s, app) => {
              if (e.buffer.length === 0) app.enterInteractiveStack();
              else e.cursorUp();            // editor active → cursor only
            } }),
  // TOOLS opens the side-panel on its Commands tab — the searchable
  // catalog of every registered op.  Lives to the right of ▲ so the
  // catalog is a single click from the top of the keypad.  Labelled
  // "TOOLS" rather than the older 📖 emoji or "CAT▶" abbreviation so
  // the affordance reads cleanly without symbol decoding.
  mk('TOOLS', { kind: 'cat', className: 'cat-key',
                action: (_e, _s, app) => app.toggleSidePanel('commands') }),
  mk('◀', { kind: 'arrow', className: 'arrow-left',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorLeft();
              else app.prevMenuPage();
            } }),
  mk('▶', { kind: 'arrow', className: 'arrow-right',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorRight();
              else if (app.stack.depth >= 2) app.swapTop();
              else app.nextMenuPage();
            } }),
  mk('▼', { kind: 'arrow', className: 'arrow-down', shiftL: 'SST',
            action: (e, _s, app) => {
              if (e.buffer.length > 0) e.cursorDown();     // editor → cursor
              else if (app.stack.depth >= 1) app.editLevel1();
            },
            shiftLAction: typeExecName('SST') }),
];

/* -------------------- Rows 4-10: main keypad (35) ------------------- */
// Row order top→bottom.  Each row is exactly 5 cells.  No keys span.
export const MAIN_KEYS = [
  // Row 4: LASTARG EVAL ' UNDO ⌫
  // Shifts (orange / red):
  //   LASTARG: — / —            (HP50 printed this position "HIST", but
  //                              the command-line history lives in the
  //                              side-panel History tab; this key does
  //                              LASTARG instead so prior args are
  //                              reachable without a soft-menu dive.)
  //   EVAL:  —     / —          (PRG / CHARS replaced by side-panel tabs)
  //   ':     —     / —          (MTRW / EQW out of scope)
  //   UNDO:  ∠     / REDO       (HP50 printed this position "SYMB"; the
  //                              CAS entry point lives in the side-panel
  //                              Commands tab.  UNDO is the more useful
  //                              default and earns the primary slot
  //                              since it's the one-handed recovery key
  //                              people reach for.  shift-R is REDO so
  //                              the reverse is one shifted press away.
  //                              shift-L inserts the polar/cylindrical
  //                              `∠` glyph for complex / vector literals
  //                              like `(1, ∠45)` and `[ r ∠θ ]` — the
  //                              one symbol the keypad otherwise has no
  //                              direct route to.)
  //   ⌫:     DEL   / CLEAR      (delete / clear stack)
  mk('LASTARG', { alpha: 'm', action: typeExecName('LASTARG') }),
  // EVAL has no shift-L/R actions — PRG keywords and the char palette
  // both live in the side panel.  Unshifted EVAL runs the EVAL op.
  mk('EVAL',  { alpha: 'n', action: typeExecName('EVAL') }),
  // ` key — backtick-quote (primary), this app's remap of the HP50 `'`
  // key.  Backticks open/close algebraic entry; a literal `'` is typed
  // via the shift-R on the `3` digit key.  Shift affordances stay as
  // HP50 had them on the original tick key:
  //   shift-L  i   imaginary-unit constant (for Complex literals)
  //   shift-R  |   the "where" substitution operator (``X+1 | X=5``)
  mk('`',     { alpha: 'o', shiftL: 'i', shiftR: '|',
                action:       type('`'),
                shiftLAction: type('i'),
                shiftRAction: type('|') }),
  // UNDO / REDO bypass execOp's pre-snap (which would otherwise
  // capture the current stack onto the undo history the very instant
  // we were about to step back, making the first UNDO a no-op — see
  // note in ops.js above the UNDO op).  In edit mode they still type
  // their name as a token so the user can build a program that calls
  // UNDO / REDO; on a bare line they jump straight to performUndo /
  // performRedo which walk the multi-level history cleanly.
  mk('UNDO',  { alpha: 'p', shiftL: '∠', shiftR: 'REDO',
                action: (e) => {
                  if (e.isEditing()) { e.type('UNDO '); return; }
                  try { e.performUndo(); } catch (err) { e.flashError(err); }
                },
                // shift-L inserts the polar `∠` glyph at the cursor —
                // the same character the side-panel glyph picker
                // exposes, available without leaving the keypad so a
                // user typing `(1, ∠45)` can stay one-handed.
                shiftLAction: type('∠'),
                shiftRAction: (e) => {
                  if (e.isEditing()) { e.type('REDO '); return; }
                  try { e.performRedo(); } catch (err) { e.flashError(err); }
                } }),
  // ⌫ unshifted = backspace char (or DROP on empty buffer — see
  // Entry.backspace).  Shift-L DEL clears the entire command line
  // (HP50 "delete all entry"); Shift-R CLEAR clears the whole stack.
  mk('⌫',     { kind: 'back', shiftL: 'DEL', shiftR: 'CLEAR',
                action:       back,
                shiftLAction: cancel,
                shiftRAction: typeExecName('CLEAR') }),

  // Row 5: yˣ √x SIN COS TAN
  // Shifts per the real HP 50g unit (orange / red):
  //   yˣ:   eˣ    / LN          (exp / natural log)
  //   √x:   x²    / ⁿ√y         (square / nth root)
  //   SIN:  ASIN  / Σ           (arcsin / summation — CAS)
  //   COS:  ACOS  / ∂           (arccos / partial derivative — CAS)
  //   TAN:  ATAN  / ∫           (arctan / integral — CAS)
  // Hyperbolics live in the MTH menu, NOT on these keys.
  mk('yˣ',  { alpha: 'q', shiftL: 'eˣ',   shiftR: 'LN',
              action: typeExec('^', '^'),
              shiftLAction: typeExecFn('EXP'),
              shiftRAction: typeExecFn('LN') }),
  // √x shift-R ⁿ√y runs XROOT on the stack.  No algebraic typing
  // path yet — ⁿ√y has no textual glyph in our parser, so the key
  // only makes sense on two stack numbers.  User presses `y ENTER
  // x ⁿ√y` to get the x-th root of y.
  mk('√x',  { alpha: 'r', shiftL: 'x²',   shiftR: 'ⁿ√y',
              action:       typeExecFn('SQRT'),
              shiftLAction: typeExecFn('SQ'),
              shiftRAction: typeExecFn('XROOT') }),
  mk('SIN', { alpha: 's', shiftL: 'ASIN', shiftR: 'Σ',
              action: typeExecFn('SIN'), shiftLAction: typeExecFn('ASIN'),
              shiftRAction: typeExecFn('SUM') }),
  mk('COS', { alpha: 't', shiftL: 'ACOS', shiftR: '∂',
              action: typeExecFn('COS'), shiftLAction: typeExecFn('ACOS'),
              shiftRAction: typeExecFn('DERIV') }),
  mk('TAN', { alpha: 'u', shiftL: 'ATAN', shiftR: '∫',
              action: typeExecFn('TAN'), shiftLAction: typeExecFn('ATAN'),
              shiftRAction: typeExecFn('INTEG') }),

  // Row 6: EEX +/- X 1/x ÷
  // Shifts (orange / red):
  //   EEX:  10ˣ   / LOG         (10^x / log10)
  //   +/-:  ≠     / =           (not-equal / equal — for symbolic exprs)
  //   X:    ≤     / <
  //   1/x:  ≥     / >
  //   ÷:    ABS   / ARG         (magnitude / argument of complex)
  mk('EEX', { alpha: 'v', shiftL: '10ˣ', shiftR: 'LOG',
              action: eex, shiftLAction: typeExecFn('ALOG'),
              shiftRAction: typeExecFn('LOG') }),
  // +/- shift-L ≠ types '≠' inside '…' or runs the ≠ op on the
  // stack.  Same typeExec pattern that +,−,×,÷ already use for
  // algebraic reroute.
  mk('+/-', { alpha: 'w', shiftL: '≠',   shiftR: '=',
              action:       chs,
              shiftLAction: typeExec('≠', '≠'),
              shiftRAction: type(' = ') }),
  // x key: unshifted types the letter x; shift-L ≤ and shift-R <
  // route through typeExec so they either type the character into an
  // algebraic entry or run the comparison on the stack.  Same for
  // 1/x on the next row (≥ / >).  Primary label is lowercase to match
  // the lowercase-default keyboard convention (see header comment).
  mk('x',   { alpha: 'x', shiftL: '≤',   shiftR: '<',
              action:       type('x'),
              shiftLAction: typeExec('≤', '≤'),
              shiftRAction: typeExec('<', '<') }),
  mk('1/x', { alpha: 'y', shiftL: '≥',   shiftR: '>',
              action:       typeExecFn('INV'),
              shiftLAction: typeExec('≥', '≥'),
              shiftRAction: typeExec('>', '>') }),
  mk('÷',   { alpha: 'z', shiftL: 'ABS', shiftR: 'ARG',
              action: typeExec('/', '/'),
              shiftLAction: typeExecFn('ABS'),
              shiftRAction: typeExecFn('ARG') }),

  // Row 7: α 7 8 9 ×
  // Shifts (orange / red):
  //   α:    (none) / (none)     — USER / ENTRY not supported
  //   7:    (none) / (none)     — S.SLV / NUM.SLV not supported
  //   8:    EXP&LN / TRIG       (exp/log menu / trig menu)
  //   9:    (none) / (none)     — FINANCE / TIME not supported
  //   ×:    [ ]  / "_"          (list brackets / string quotes)
  mk('α',   { className: 'alpha-key', kind: 'alpha' }),
  mk('7',   { kind: 'digit', shiftL: '', shiftR: '',
              action: type('7') }),
  // 8 has no shift-L / shift-R — EXP&LN and TRIG menus live in the
  // side-panel Commands tab (Trig / Exp / Log categories).  Physical
  // key types '8'.
  mk('8',   { kind: 'digit', action: type('8') }),
  mk('9',   { kind: 'digit', shiftL: '', shiftR: '',
              action: type('9') }),
  mk('×',   { shiftL: '[ ]', shiftR: '" "',
              action: typeExec('*', '*'),
              shiftLAction: (e) => e.typeWithCursor('[ ]', 2),
              shiftRAction: (e) => e.typeWithCursor('""', 1) }),

  // Row 8: LSHIFT 4 5 6 −
  // Left-shift key itself has no shift labels (it IS the modifier).
  // Other keys this row (orange / red):
  //   4:  CALC      / ALG       (calculus menu / algebra menu)
  //   5:  MATRICES  / STAT      (matrix menu / statistics menu)
  //   6:  CONVERT   / UNITS     (unit conversion / units menu)
  //   −:  ( )       / _         (parens / underscore for compound units)
  // ↖️ is U+2196 + U+FE0F variation selector to force emoji presentation,
  // pointing toward the upper-left where orange labels sit on every key.
  mk('↖️', { className: 'shift-l-key', kind: 'shiftL' }),
  // 4/5/6 have no shift labels — CALC/ALG/MATRICES/STAT/CONVERT/UNITS
  // all reachable via the side-panel Commands tab under CAS /
  // Vectors&Matrices / (Units - pending) categories.
  mk('4',  { kind: 'digit', action: type('4') }),
  mk('5',  { kind: 'digit', action: type('5') }),
  mk('6',  { kind: 'digit', action: type('6') }),
  mk('−',  { shiftL: '( )', shiftR: '_',
             action: typeExec('-', '-'),
             shiftLAction: (e) => e.typeWithCursor('()', 1),
             shiftRAction: type('_') }),

  // Row 9: RSHIFT 1 2 3 +
  // Right-shift key itself has no shift labels (it IS the modifier).
  //   1:  ARITH  / CMPLX        (arithmetic menu / complex menu)
  //   2:  (none) / (none)       — DEF / LIB not supported
  //   3:  #      / BASE         (binary literal prefix / base menu)
  //   +:  { }    / « »          (list braces / program delimiters)
  // ↗️ same idea as ↖️ but mirrored to red corner.
  mk('↗️', { className: 'shift-r-key', kind: 'shiftR' }),
  // 1 has no shift labels — ARITH (MOD/GCD/LCM) and CMPLX
  // (RE/IM/CONJ/ARG/ABS) both live in the side-panel Commands tab.
  mk('1',  { kind: 'digit', action: type('1') }),
  mk('2',  { kind: 'digit', shiftL: '', shiftR: '',
             action: type('2') }),
  // 3 shift-L # types a `#` (binary-literal prefix — the entry parser
  // already accepts e.g. `#FFh`).  Shift-R `'` types a literal apostrophe
  // character — freed up because the primary algebraic delimiter is the
  // backtick on the `` ` `` key.
  mk('3',  { kind: 'digit', shiftL: '#', shiftR: "'",
             action:       type('3'),
             shiftLAction: type('#'),
             shiftRAction: type("'") }),
  mk('+',  { shiftL: '{ }', shiftR: '« »',
             action: typeExec('+', '+'),
             shiftLAction: (e) => e.typeWithCursor('{ }', 2),
             shiftRAction: (e) => e.typeWithCursor('«  »', 2) }),

  // Row 10: ON 0 . SPC ENTER
  // Shifts (orange / red):
  //   ON:    CONT    / (none)   — OFF not supported
  //   0:     ∞       / →        (infinity / store-tag arrow)
  //   .:     ::      / ↵        (path delimiter / newline)
  //   SPC:   π       / ,        (pi constant / list separator comma)
  //   ENTER: —       / →NUM     (numeric eval only — LASTARG has its
  //                              own primary key up on row 4.)
  mk('ON',    { kind: 'cancel', action: cancel,
                shiftL: 'CONT', shiftR: '' }),
  // 0 shift-L ∞ and shift-R → both type their glyph.  ∞ isn't a
  // numeric literal in our parser — typing it is useful inside a
  // symbolic expression (LIMIT when we get there, for example) or
  // just to visually note the value.  → is the local-variable store
  // marker used in programs like « → A B 'A+B' ».
  mk('0',     { kind: 'digit', shiftL: '∞',   shiftR: '→',
                action:       type('0'),
                shiftLAction: type('∞'),
                shiftRAction: type('→') }),
  // . shift-L :: types the tagged-object path delimiter; shift-R ↵
  // types a newline so program text can be multiline.
  mk('.',     { kind: 'digit', shiftL: '::',  shiftR: '↵',
                action:       type('.'),
                shiftLAction: type('::'),
                shiftRAction: type('\n') }),
  mk('SPC',   { shiftL: 'π',   shiftR: ',',
                action: type(' '),
                shiftLAction: type('π'),
                shiftRAction: type(', ') }),
  // ENTER shift-R →NUM forces APPROX mode for one EVAL.  In EXACT
  // mode `SQRT(2)` stays symbolic on EVAL; →NUM temporarily flips
  // the flag so the user gets the decimal, then the flag is restored
  // to whatever they had set.  Wired through the op registry so
  // hitting SHIFT-R ENTER is the same thing as typing `→NUM` on the
  // command line.
  mk('ENTER', { className: 'enter', shiftR: '→NUM',
                action:       enter,
                shiftRAction: typeExecName('→NUM') }),
];

/* --------------------------- rendering --------------------------- */

/** Populate the three keyboard regions.  `root` is an object with
 *  three DOM nodes: { softRow, navRow, keypad }. */
export function renderKeyboard(app, root) {
  root.softRow.innerHTML = '';
  root.navRow.innerHTML  = '';
  root.keypad.innerHTML  = '';

  SOFT_KEYS.forEach(k => root.softRow.appendChild(makeKeyEl(app, k)));

  // Nav row order must match the 5-col × 2-row grid auto-flow:
  //   row 1: HOME PREV NEXT [arrow cluster spans cols 4-5, rows 1-2]
  //   row 2: VARS STO  RCL  [cluster continues]
  // The browser's grid algorithm fills empty cells row-first skipping
  // cells already claimed by the cluster, so the three NAV_KEYS of
  // each row will flow into the left three cells automatically as
  // long as the cluster is placed explicitly.
  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[0])); // VARS
  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[1])); // PREV
  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[2])); // NEXT

  const cluster = document.createElement('div');
  cluster.className = 'arrow-cluster';
  ARROW_KEYS.forEach(k => cluster.appendChild(makeKeyEl(app, k)));
  root.navRow.appendChild(cluster);

  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[3])); // HOME
  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[4])); // STO
  root.navRow.appendChild(makeKeyEl(app, NAV_KEYS[5])); // RCL

  MAIN_KEYS.forEach(k => root.keypad.appendChild(makeKeyEl(app, k)));
}

function makeKeyEl(app, key) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'key '
    + (key.kind === 'digit' ? 'digit ' : '')
    + key.className;
  el.dataset.kind = key.kind;

  if (key.shiftL) {
    const s = document.createElement('span');
    s.className = 'shift-l'; s.textContent = key.shiftL;
    el.appendChild(s);
  }
  if (key.shiftR) {
    const s = document.createElement('span');
    s.className = 'shift-r'; s.textContent = key.shiftR;
    el.appendChild(s);
  }
  if (key.alpha) {
    const s = document.createElement('span');
    s.className = 'alpha'; s.textContent = key.alpha;
    el.appendChild(s);
  }

  const p = document.createElement('span');
  p.className = 'primary'; p.textContent = key.primary;
  el.appendChild(p);

  el.addEventListener('mousedown', (evt) => {
    evt.preventDefault();
    el.classList.add('pressed');
    app.handleKey(key);
    setTimeout(() => el.classList.remove('pressed'), 80);
  });

  // Track sticky shift visual state for the three modifier kinds.
  // Each key lights up ('sticky') for both its one-shot AND its lock
  // state so the user can see the shift is engaged; a separate
  // 'locked' class distinguishes lock from single-shot so CSS can
  // style it differently (e.g. bolder, steady vs. blinking).
  if (['alpha', 'shiftL', 'shiftR'].includes(key.kind)) {
    const lockName = key.kind + 'Lock';
    app.onShiftChange(() => {
      const sticky = app.shift === key.kind || app.shift === lockName;
      el.classList.toggle('sticky', sticky);
      el.classList.toggle('locked', app.shift === lockName);
    });
  }
  return el;
}
