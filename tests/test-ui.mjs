import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode, setCoordMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { headingKey, ALIASES } from '../www/src/ui/command-help.js';
import { escapeHtml, normalizeMenuSlots, binaryBaseLabel, displayModeLabel, coordModeGlyph } from '../www/src/ui/display.js';
import { assert, assertThrows } from './helpers.mjs';

/* UI helpers — paging, physical-keyboard modifier shortcuts,
   interactive-stack pure helpers, Display click/tooltip rendering. */

/* ================================================================
   UI paging helpers — clampStackScroll and computeMenuPage.
   Pure functions, no DOM required.  These drive the arrow-key +
   menu-paging wiring.
   ================================================================ */

// clampStackScroll: basic clamping
{
  assert(clampStackScroll(0, 5) === 0,   'clampStackScroll: 0 stays 0');
  assert(clampStackScroll(2, 5) === 2,   'clampStackScroll: in range unchanged');
  assert(clampStackScroll(4, 5) === 4,   'clampStackScroll: depth-1 is the cap');
  assert(clampStackScroll(99, 5) === 4,  'clampStackScroll: over cap clamps to depth-1');
  assert(clampStackScroll(-3, 5) === 0,  'clampStackScroll: negatives clamp to 0');
  assert(clampStackScroll(3, 1) === 0,   'clampStackScroll: depth 1 pins to 0');
  assert(clampStackScroll(3, 0) === 0,   'clampStackScroll: depth 0 pins to 0');
  assert(clampStackScroll(NaN, 10) === 0,'clampStackScroll: NaN → 0');
  // Floor behavior — fractional offsets are accepted by callers that
  // do arithmetic (e.g. a touch-scroll gesture in the future).
  assert(clampStackScroll(2.9, 10) === 2,'clampStackScroll: fractional floors down');
}

// computeMenuPage: pagination view
{
  const short = [{label:'A'},{label:'B'},{label:'C'}];
  const r1 = computeMenuPage(short, 0);
  assert(r1.totalPages === 1,                'computeMenuPage: short list = 1 page');
  assert(r1.view.length === 6,               'computeMenuPage: view always 6 long');
  assert(r1.view[0].label === 'A',           'computeMenuPage: first slot present');
  assert(r1.view[3] === null && r1.view[5] === null,
                                             'computeMenuPage: empty slots padded with null');
  assert(r1.hasMore === false,               'computeMenuPage: short list has no more pages');

  const full = Array.from({length: 14}, (_, i) => ({label: `S${i+1}`}));
  const p0 = computeMenuPage(full, 0);
  assert(p0.totalPages === 3,                'computeMenuPage: 14 slots → 3 pages');
  assert(p0.page === 0 && p0.hasMore === true,
                                             'computeMenuPage: page 0 on 14 items');
  assert(p0.view[0].label === 'S1' && p0.view[5].label === 'S6',
                                             'computeMenuPage: page 0 shows S1..S6');

  const p1 = computeMenuPage(full, 1);
  assert(p1.view[0].label === 'S7' && p1.view[5].label === 'S12',
                                             'computeMenuPage: page 1 shows S7..S12');

  const p2 = computeMenuPage(full, 2);
  assert(p2.view[0].label === 'S13' && p2.view[1].label === 'S14'
         && p2.view[2] === null,
                                             'computeMenuPage: last page pads tail with null');

  // Wrap: page 3 wraps back to page 0
  const p3 = computeMenuPage(full, 3);
  assert(p3.page === 0 && p3.view[0].label === 'S1',
                                             'computeMenuPage: page past end wraps to 0');

  // Negative page wraps to the last page
  const pm1 = computeMenuPage(full, -1);
  assert(pm1.page === 2 && pm1.view[0].label === 'S13',
                                             'computeMenuPage: page -1 wraps to last page');

  // Empty list still returns a 6-wide null view with totalPages=1
  const empty = computeMenuPage([], 0);
  assert(empty.totalPages === 1 && empty.view.every(v => v === null)
         && empty.hasMore === false,
                                             'computeMenuPage: empty list = one null page');
}

/* ================================================================
   session313: escapeHtml — the pure HTML-escaper the Display's cell /
   list / path renderers all route formatted text through.  Extracted
   from three inlined copies in display.js; the setPath copy used to
   escape only & and < (missing > and "), so this pins the unified
   four-character contract against a regression to under-escaping.
   ================================================================ */
{
  assert(escapeHtml('a&b') === 'a&amp;b',   'escapeHtml: & → &amp;');
  assert(escapeHtml('a<b') === 'a&lt;b',    'escapeHtml: < → &lt;');
  assert(escapeHtml('a>b') === 'a&gt;b',    'escapeHtml: > → &gt;');
  assert(escapeHtml('a"b') === 'a&quot;b',  'escapeHtml: " → &quot;');
  // All four in one pass, ampersand-first so the entity markers it
  // introduces aren't themselves re-escaped.
  assert(escapeHtml('<a href="x&y">') === '&lt;a href=&quot;x&amp;y&quot;&gt;',
                                            'escapeHtml: all four escaped in one pass');
  assert(escapeHtml('&amp;') === '&amp;amp;',
                                            'escapeHtml: a literal entity is escaped, not preserved');
  // Non-string coercion (the renderers can hand it a name that is not a
  // string) and the empty/whitespace degenerates.
  assert(escapeHtml(42) === '42',           'escapeHtml: number coerces to string');
  assert(escapeHtml('') === '',             'escapeHtml: empty string stays empty');
  assert(escapeHtml('plain') === 'plain',   'escapeHtml: no special chars unchanged');
}

/* ================================================================
   session319: normalizeMenuSlots — the pure slice/pad extracted from
   Display.setMenu so the soft-menu row is always exactly six slots.
   Pins the truncate-past-6, pad-short-with-'', exactly-6-unchanged, and
   input-not-mutated invariants so a refactor of setMenu can't regress
   the fixed-grid contract.
   ================================================================ */
{
  assert(JSON.stringify(normalizeMenuSlots(['A', 'B'])) ===
         JSON.stringify(['A', 'B', '', '', '', '']),
                                             'normalizeMenuSlots: short array padded to six');
  assert(JSON.stringify(normalizeMenuSlots([])) ===
         JSON.stringify(['', '', '', '', '', '']),
                                             'normalizeMenuSlots: empty array → six blanks');
  const six = ['A', 'B', 'C', 'D', 'E', 'F'];
  assert(JSON.stringify(normalizeMenuSlots(six)) === JSON.stringify(six),
                                             'normalizeMenuSlots: exactly six unchanged');
  assert(normalizeMenuSlots(six).length === 6,
                                             'normalizeMenuSlots: exactly six stays length six');
  assert(JSON.stringify(normalizeMenuSlots(
           ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])) ===
         JSON.stringify(['A', 'B', 'C', 'D', 'E', 'F']),
                                             'normalizeMenuSlots: more than six truncated to six');
  // The input array is not mutated (slice returns a copy).
  const input = ['A'];
  const out = normalizeMenuSlots(input);
  assert(input.length === 1 && out.length === 6 && out !== input,
                                             'normalizeMenuSlots: input left untouched, fresh array returned');
}

/* ================================================================
   session326: the three annunciator label/glyph maps extracted from
   Display.setBinaryBaseAnnunciator / setDisplayAnnunciator / setCoordMode
   into pure functions, so the status-line label text is testable DOM-free.
   Pins the known-key maps plus the divergent fallbacks: unknown base →
   undefined (caller hides the annunciator), falsy/unknown display mode →
   STD (digits ignored), and unknown coord mode → 'XYZ'.  Case-sensitivity
   of the base/coord keys is deliberate (the callers pass canonical keys).
   ================================================================ */
{
  assert(binaryBaseLabel('h') === 'HEX',     'binaryBaseLabel: h → HEX');
  assert(binaryBaseLabel('d') === 'DEC',     'binaryBaseLabel: d → DEC');
  assert(binaryBaseLabel('o') === 'OCT',     'binaryBaseLabel: o → OCT');
  assert(binaryBaseLabel('b') === 'BIN',     'binaryBaseLabel: b → BIN');
  assert(binaryBaseLabel('x') === undefined, 'binaryBaseLabel: unknown key → undefined (hide)');
  assert(binaryBaseLabel('H') === undefined, 'binaryBaseLabel: keys are case-sensitive');

  assert(displayModeLabel('STD', 5) === 'STD',   'displayModeLabel: STD ignores digits');
  assert(displayModeLabel('std', 2) === 'STD',   'displayModeLabel: mode is upper-cased');
  assert(displayModeLabel(undefined, 3) === 'STD','displayModeLabel: falsy mode → STD');
  assert(displayModeLabel('', 7) === 'STD',      'displayModeLabel: empty mode → STD');
  assert(displayModeLabel('fix', 4) === 'FIX 4', 'displayModeLabel: FIX carries upper-cased mode + digits');
  assert(displayModeLabel('SCI', 2) === 'SCI 2', 'displayModeLabel: SCI carries digits');
  assert(displayModeLabel('eng', 0) === 'ENG 0', 'displayModeLabel: ENG 0 keeps zero digits');

  assert(coordModeGlyph('RECT') === 'XYZ',   'coordModeGlyph: RECT → XYZ');
  assert(coordModeGlyph('CYLIN') === 'R∠Z',  'coordModeGlyph: CYLIN → R∠Z');
  assert(coordModeGlyph('SPHERE') === 'R∠∠', 'coordModeGlyph: SPHERE → R∠∠');
  assert(coordModeGlyph('BOGUS') === 'XYZ',  'coordModeGlyph: unknown mode → XYZ');
  assert(coordModeGlyph('rect') === 'XYZ',   'coordModeGlyph: keys are case-sensitive, falls back to XYZ');
}


// The handler lives in src/ui/shortcuts.js as a pure function so it
// can be exercised without a DOM.  It receives an event-shaped object
// plus the Entry and (optionally) a clipboard facade.
{
  const { handleModifierShortcut } = await import('../www/src/ui/shortcuts.js');
  const { Entry } = await import('../www/src/ui/entry.js');

  const evt = (patch) => Object.assign({
    key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  }, patch);

  {
    const s = new Stack();
    s.push(Real(1));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(2));
    const handled = handleModifierShortcut(evt({ key: 'z', ctrlKey: true }), e);
    assert(handled === true, 'Ctrl-Z is handled');
    assert(s.depth === 1 && s.peek(1).value.eq(1),
      'Ctrl-Z routes to performUndo — stack restored');
  }

  {
    const s = new Stack();
    s.push(Real(5));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(6));
    handleModifierShortcut(evt({ key: 'z', metaKey: true }), e);
    assert(s.depth === 1 && s.peek(1).value.eq(5),
      'Cmd-Z routes to performUndo (Mac convention)');
  }

  {
    const s = new Stack();
    s.push(Real(1));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(2));
    e.performUndo();                  // back to { 1 }
    assert(s.depth === 1, 'pre-redo sanity: back at { 1 }');
    const handled = handleModifierShortcut(evt({ key: 'y', ctrlKey: true }), e);
    assert(handled === true, 'Ctrl-Y is handled');
    assert(s.depth === 2 && s.peek(1).value.eq(2),
      'Ctrl-Y routes to performRedo — push re-applied');
  }

  {
    const s = new Stack();
    s.push(Real(10));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(20));
    e.performUndo();
    handleModifierShortcut(evt({ key: 'z', ctrlKey: true, shiftKey: true }), e);
    assert(s.depth === 2 && s.peek(1).value.eq(20),
      'Shift-Ctrl-Z routes to performRedo');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    let flashed = null;
    e.flashError = (err) => { flashed = err; };
    const handled = handleModifierShortcut(evt({ key: 'z', ctrlKey: true }), e);
    assert(handled === true, 'Ctrl-Z is still "handled" when no history');
    assert(flashed && /no undo/i.test(flashed.message),
      'Ctrl-Z with empty history shows No undo error via flashError');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    let flashed = null;
    e.flashError = (err) => { flashed = err; };
    handleModifierShortcut(evt({ key: 'y', ctrlKey: true }), e);
    assert(flashed && /no redo/i.test(flashed.message),
      'Ctrl-Y with empty redo shows No redo error');
  }

  // Pure stack mutations (physical Backspace→DROP, ▶ SWAP, interactive-
  // stack PICK/ROLL/ROLLD/DROP, ▼ editLevel1) must push both the
  // stack undo slot and the var-state undo slot, or performUndo will
  // trip "No undo available" from the var-state side even when the
  // stack has an undo slot, and a later REDO can replay a stale var
  // snapshot.  These sites route through Entry._snapForUndo which
  // pushes both slots.  This test exercises _snapForUndo directly and
  // verifies UNDO/REDO succeed when only the stack content changed.
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(2));
    const e = new Entry(s);
    e._snapForUndo();                 // what swapTop / backspace should do
    s.drop();                          // stack-only mutation, no var change
    assert(s.depth === 1, 'pre-undo sanity: { 1 } after DROP');
    const handled = handleModifierShortcut(evt({ key: 'z', ctrlKey: true }), e);
    assert(handled === true, 'Ctrl-Z handled after stack-only mutation');
    assert(s.depth === 2 && s.peek(1).value.eq(2),
      'Ctrl-Z restores the pre-DROP stack when only stack state changed');
    handleModifierShortcut(evt({ key: 'y', ctrlKey: true }), e);
    assert(s.depth === 1 && s.peek(1).value.eq(1),
      'Ctrl-Y re-applies the DROP');
  }

  // Inject a fake clipboard facade whose readText resolves synchronously
  // via a Promise; await resolution to assert buffer was populated.
  {
    const s = new Stack();
    const e = new Entry(s);
    const fakeClipboard = { readText: () => Promise.resolve('HELLO 42 +') };
    const handled = handleModifierShortcut(
      evt({ key: 'v', ctrlKey: true }), e, { clipboard: fakeClipboard },
    );
    assert(handled === true, 'Ctrl-V is handled');
    // Promise chains inside the helper are fired-and-forgotten; flush
    // microtasks so the .then() runs.
    await Promise.resolve();
    await Promise.resolve();
    assert(e.buffer === 'HELLO 42 +',
      `Ctrl-V typed the clipboard payload into the entry buffer, got ${JSON.stringify(e.buffer)}`);
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    const fakeClipboard = { readText: () => Promise.resolve('XYZ') };
    handleModifierShortcut(evt({ key: 'v', metaKey: true }), e, { clipboard: fakeClipboard });
    await Promise.resolve(); await Promise.resolve();
    assert(e.buffer === 'XYZ', 'Cmd-V also pastes');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('prior');
    const fakeClipboard = { readText: () => Promise.resolve('') };
    handleModifierShortcut(evt({ key: 'v', ctrlKey: true }), e, { clipboard: fakeClipboard });
    await Promise.resolve(); await Promise.resolve();
    assert(e.buffer === 'prior',
      'empty clipboard leaves the entry buffer alone');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    let flashed = null;
    e.flashError = (err) => { flashed = err; };
    const fakeClipboard = { readText: () => Promise.reject(new Error('denied')) };
    handleModifierShortcut(evt({ key: 'v', ctrlKey: true }), e, { clipboard: fakeClipboard });
    await Promise.resolve(); await Promise.resolve();
    assert(flashed && /denied/.test(flashed.message),
      'clipboard read rejection routes to flashError');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    let flashed = null;
    e.flashError = (err) => { flashed = err; };
    handleModifierShortcut(evt({ key: 'v', ctrlKey: true }), e, { clipboard: null });
    assert(flashed && /clipboard unavailable/i.test(flashed.message),
      'no clipboard facade → "Clipboard unavailable" via flashError');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    const handled = handleModifierShortcut(evt({ key: 'c', ctrlKey: true }), e);
    assert(handled === false,
      'Ctrl-C is declined so the browser handles copy normally');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    const handled = handleModifierShortcut(evt({ key: 'z' }), e);
    assert(handled === false,
      'bare Z (no modifier) is not handled — passes through to typing path');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    const handled = handleModifierShortcut(evt({ key: 'z', ctrlKey: true, altKey: true }), e);
    assert(handled === false,
      'Ctrl-Alt-Z is not hijacked — treated as an OS shortcut');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    const handled = handleModifierShortcut(evt({ key: 'q', ctrlKey: true }), e);
    assert(handled === false,
      'Ctrl-Q is declined — passes through to browser');
  }

  // session307: the deliberate `!e.shiftKey` guard on the V branch.
  // Ctrl/Cmd-Shift-V is declined so the browser's native plain-text
  // paste keeps working (parallel to the Ctrl-C decline) — and the
  // shifted combo must never touch the clipboard facade or the buffer.
  // Ctrl-Shift-Y, by contrast, still redoes: the Y arm ignores shift.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('keep');
    let read = false;
    const fakeClipboard = { readText: () => { read = true; return Promise.resolve('NOPE'); } };
    const handled = handleModifierShortcut(
      evt({ key: 'v', ctrlKey: true, shiftKey: true }), e, { clipboard: fakeClipboard },
    );
    await Promise.resolve(); await Promise.resolve();
    assert(handled === false,
      'Ctrl-Shift-V is declined so the browser plain-text paste works');
    assert(read === false, 'Ctrl-Shift-V never reads the clipboard facade');
    assert(e.buffer === 'keep', 'Ctrl-Shift-V leaves the entry buffer untouched');
  }

  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('keep');
    const fakeClipboard = { readText: () => Promise.resolve('NOPE') };
    const handled = handleModifierShortcut(
      evt({ key: 'v', metaKey: true, shiftKey: true }), e, { clipboard: fakeClipboard },
    );
    await Promise.resolve(); await Promise.resolve();
    assert(handled === false, 'Cmd-Shift-V is likewise declined');
    assert(e.buffer === 'keep', 'Cmd-Shift-V leaves the entry buffer untouched');
  }

  {
    const s = new Stack();
    s.push(Real(7));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(8));
    e.performUndo();                  // back to { 7 }
    const handled = handleModifierShortcut(evt({ key: 'y', ctrlKey: true, shiftKey: true }), e);
    assert(handled === true, 'Ctrl-Shift-Y is handled (the Y arm ignores shift)');
    assert(s.depth === 2 && s.peek(1).value.eq(8),
      'Ctrl-Shift-Y still routes to performRedo');
  }
}


/* =================================================================
   Interactive-stack pure helpers.

   These exercise the DOM-free transition / manipulation functions in
   src/ui/interactive-stack.js so the controller math stays correct as
   the App wiring evolves.  The App integration itself (arrow-key
   dispatch, menu install/restore) is covered lightly via Stack-level
   assertions — a full DOM test would need jsdom which we deliberately
   avoid in this suite.
   ================================================================= */
{
  const {
    clampLevel, levelUp, levelDown,
    interactiveStackMenu,
    rollLevel, rollDownToLevel, dropLevel,
  } = await import('../www/src/ui/interactive-stack.js');

  // clampLevel bounds
  assert(clampLevel(0, 5)  === 1, 'clampLevel: below-range snaps to 1');
  assert(clampLevel(3, 5)  === 3, 'clampLevel: in-range pass-through');
  assert(clampLevel(99, 5) === 5, 'clampLevel: above-range snaps to depth');
  assert(clampLevel(2, 0)  === 0, 'clampLevel: depth 0 returns 0');
  assert(clampLevel(2.7, 5) === 2, 'clampLevel: trunc fractional input');

  // levelUp / levelDown
  assert(levelUp(1, 5)   === 2, 'levelUp: 1 → 2 (moves to older)');
  assert(levelUp(5, 5)   === 5, 'levelUp: clamps at depth');
  assert(levelDown(3, 5) === 2, 'levelDown: 3 → 2');
  assert(levelDown(1, 5) === 1, 'levelDown: clamps at 1');

  // interactiveStackMenu returns 6 slots with the HP50 labels.
  const menu = interactiveStackMenu({});
  assert(menu.length === 6, 'interactiveStackMenu: 6 slots');
  assert(menu[0].label === 'ECHO'  && menu[1].label === 'PICK',
         'interactiveStackMenu: ECHO / PICK on F1 / F2');
  assert(menu[5].label === 'CANCL',
         'interactiveStackMenu: CANCL on F6');
  // Untouched handlers default to a no-op so firing them is safe.
  menu[0].onPress(); menu[5].onPress();
  assert(true, 'interactiveStackMenu: default handlers are safe no-ops');

  // Handler wiring — onEcho etc. plumb through to the named slot.
  let echoed = 0, picked = 0, cancelled = 0;
  const hmenu = interactiveStackMenu({
    onEcho:   () => echoed++,
    onPick:   () => picked++,
    onCancel: () => cancelled++,
  });
  hmenu[0].onPress();
  hmenu[1].onPress();
  hmenu[5].onPress();
  assert(echoed === 1 && picked === 1 && cancelled === 1,
         'interactiveStackMenu: each handler routes to its slot');

  // rollLevel: move level N to the top
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
    // Stack is [1, 2, 3, 4] with 4 on top (level 1).  Level 3 → 2.
    rollLevel(s, 3);
    const top = s.snapshot();  // [level1, level2, …]
    assert(s.depth === 4 && top[0].value.eq(2),
           'rollLevel: level 3 moves to level 1 (top)');
    // and the previous levels below it shift down by one.
    assert(top[1].value.eq(4) && top[2].value.eq(3) && top[3].value.eq(1),
           'rollLevel: lower levels close the gap');
  }
  // rollLevel(1) is a no-op
  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20));
    rollLevel(s, 1);
    const top = s.snapshot();
    assert(top[0].value.eq(20) && top[1].value.eq(10),
           'rollLevel(1): no-op');
  }
  // rollLevel: out-of-range throws
  {
    const s = new Stack();
    s.push(Real(1));
    assertThrows(() => rollLevel(s, 5), null, 'rollLevel: out-of-range throws');
  }

  // rollDownToLevel is the inverse of rollLevel.
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
    rollLevel(s, 3);                  // now top = 2
    rollDownToLevel(s, 3);            // should restore original
    const top = s.snapshot();
    assert(top[0].value.eq(4) && top[1].value.eq(3) && top[2].value.eq(2) && top[3].value.eq(1),
           'rollLevel then rollDownToLevel round-trips');
  }

  // dropLevel removes the selected level, not the top.
  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20)); s.push(Real(30)); s.push(Real(40));
    // [10, 20, 30, 40] top=40 — drop level 3 (value=20)
    dropLevel(s, 3);
    const top = s.snapshot();
    assert(s.depth === 3 && top[0].value.eq(40) && top[1].value.eq(30) && top[2].value.eq(10),
           'dropLevel: removes level 3 without touching level 1');
  }

  // dropLevel out-of-range throws
  {
    const s = new Stack();
    s.push(Real(1));
    assertThrows(() => dropLevel(s, 2), null, 'dropLevel: out-of-range throws');
  }

  // session301: rollDownToLevel's own corners — only the rollLevel-inverse
  // round-trip was pinned before, leaving its level-1 no-op, out-of-range
  // throw, and forward semantics unguarded — plus the documented "emit once"
  // invariant for all three mutators (the level-1 no-ops short-circuit before
  // _emit, so they emit zero times).
  {
    // Forward semantics: the top value lands at level N, intermediates shift up.
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
    rollDownToLevel(s, 3);            // top (4) → level 3
    const top = s.snapshot();
    assert(s.depth === 4 && top[2].value.eq(4),
           'rollDownToLevel: top value lands at level N');
    assert(top[0].value.eq(3) && top[1].value.eq(2) && top[3].value.eq(1),
           'rollDownToLevel: intermediates shift toward the top');
  }
  // rollDownToLevel(1) is a no-op
  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20));
    rollDownToLevel(s, 1);
    const top = s.snapshot();
    assert(top[0].value.eq(20) && top[1].value.eq(10),
           'rollDownToLevel(1): no-op');
  }
  // rollDownToLevel: out-of-range throws
  {
    const s = new Stack();
    s.push(Real(1));
    assertThrows(() => rollDownToLevel(s, 5), null,
                 'rollDownToLevel: out-of-range throws');
  }
  // dropLevel(1) removes the top, like a plain pop.
  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
    dropLevel(s, 1);
    const top = s.snapshot();
    assert(s.depth === 2 && top[0].value.eq(20) && top[1].value.eq(10),
           'dropLevel(1): removes the top level');
  }
  // emit-once invariant: a mutating roll / rollD / drop emits exactly once;
  // a level-1 no-op short-circuits before _emit and emits zero times.
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    let emits = 0;
    const off = s.subscribe(() => { emits++; });

    emits = 0; rollLevel(s, 3);
    assert(emits === 1, 'rollLevel(N>1): emits once');
    emits = 0; rollLevel(s, 1);
    assert(emits === 0, 'rollLevel(1) no-op: emits zero');
    emits = 0; rollDownToLevel(s, 3);
    assert(emits === 1, 'rollDownToLevel(N>1): emits once');
    emits = 0; rollDownToLevel(s, 1);
    assert(emits === 0, 'rollDownToLevel(1) no-op: emits zero');
    emits = 0; dropLevel(s, 2);
    assert(emits === 1, 'dropLevel: emits once');
    off();
  }
}

/* =================================================================
   Display click/tooltip rendering.

   The Display module emits HTML; we can probe the strings produced by
   setPath without a real DOM by giving it a minimal fake statusLine.
   The goal is to verify that path segments pick up `data-index` and
   tooltip attributes, and that a setPath replacement doesn't break
   earlier segments (prefix / brace escaping).
   ================================================================= */
{
  // Smallest useful fake: a #ann-mode node whose innerHTML / textContent
  // round-trips, plus querySelector('#ann-mode') returning that node.
  function makeStatusLine() {
    const node = {
      id: 'ann-mode', innerHTML: '', textContent: '',
      title: '',
      classList: { toggle() {}, add() {}, remove() {} },
    };
    return {
      querySelector(sel) { return sel === '#ann-mode' ? node : null; },
      addEventListener() {},
      _node: node,
    };
  }
  // Shim stackView — setPath is all we're testing so the ctor is fine
  // with these minimal stubs.
  const { Display } = await import('../www/src/ui/display.js');
  const statusLine = makeStatusLine();
  const d = new Display({
    stackView: { addEventListener() {} },
    cmdline:   { addEventListener() {} },
    statusLine,
    menuBar:   null,
  });
  d.setPath(['HOME', 'WORK', 'A']);
  const html = statusLine._node.innerHTML;
  assert(html.includes('data-index="0"') &&
         html.includes('data-index="1"') &&
         html.includes('data-index="2"'),
         'setPath: every segment carries data-index');
  assert(html.includes('>HOME<') && html.includes('>WORK<') && html.includes('>A<'),
         'setPath: segment text survives the wrap');
  assert(html.includes('title="Navigate up to HOME"') &&
         html.includes('title="Current directory: A"'),
         'setPath: ancestor vs current tooltip differ');
  // The outer #ann-mode container must NOT carry a title attribute.
  // The CSS rule `.annunciator[title]:hover` would otherwise highlight
  // the braces / whitespace around the segments, turning the whole
  // path into an apparent hit target even though only the individual
  // segments are clickable.
  assert(statusLine._node.title === '',
         'setPath: the #ann-mode container has no aggregate tooltip');
}

/* ================================================================
   Vector formatting respects coord mode for 2-D and 3-D (HP50 §9).
   4-D and higher stay rectangular regardless of mode.
   ================================================================ */
{
  // Baseline: RECT mode renders [ x y ] element-wise.
  setCoordMode('RECT');
  setAngle('RAD');
  const s = format(Vector([Real(3), Real(4)]));
  assert(s === '[ 3. 4. ]',
    `RECT 2-D vector: [ 3 4 ] → element-wise, got '${s}'`);
}
{
  // 2-D CYLIN: [ r ∠θ ].  Sample [3 4] → r=5, θ=atan2(4,3) ≈ 0.9272.
  setCoordMode('CYLIN');
  setAngle('RAD');
  const s = format(Vector([Real(3), Real(4)]));
  assert(/^\[ 5 ∠0\.9272/.test(s),
    `CYLIN 2-D: [3 4] → [ 5 ∠0.927… ], got '${s}'`);
}
{
  // 3-D CYLIN: [ r ∠θ z ].  [3 4 7] → r=5, θ=atan2(4,3), z=7 kept.
  setCoordMode('CYLIN');
  setAngle('RAD');
  const s = format(Vector([Real(3), Real(4), Real(7)]));
  assert(/^\[ 5 ∠0\.9272.* 7 \]$/.test(s),
    `CYLIN 3-D: [3 4 7] keeps z untransformed, got '${s}'`);
}
{
  // 3-D SPHERE: [ ρ ∠θ ∠φ ].  [0 0 5] → ρ=5, θ=0, φ=0 (along +z).
  setCoordMode('SPHERE');
  setAngle('RAD');
  const s = format(Vector([Real(0), Real(0), Real(5)]));
  assert(s.startsWith('[ 5') && (s.match(/∠/g) || []).length === 2,
    `SPHERE 3-D: [0 0 5] uses two angle markers, got '${s}'`);
}
{
  // 4-D falls back to rect even under SPHERE.
  setCoordMode('SPHERE');
  const s = format(Vector([Real(1), Real(2), Real(3), Real(4)]));
  assert(s === '[ 1. 2. 3. 4. ]',
    `4-D vector stays rect under any mode, got '${s}'`);
}
{
  // Non-numeric (Symbolic) entry forces rect fallback — we won't
  // fabricate an angle we can't compute.
  setCoordMode('CYLIN');
  const sym = { type: 'symbolic', expr: { type: 'var', name: 'X' } };
  const s = format(Vector([sym, Real(1)]));
  assert(s.includes('[ ') && !s.includes('∠'),
    `non-numeric component forces rect fallback, got '${s}'`);
}
// Reset
setCoordMode('RECT');
setAngle('RAD');

/* ================================================================
   session289: headingKey — the doc-heading → command-key normalizer
   the command-help popup files each <h2> section under.  Pure string
   function, no DOM.  Guards the parenthetical strip against a regex
   refactor that would mis-key (or drop) help entries.
   ================================================================ */
{
  // No parenthetical: trimmed passthrough.
  assert(headingKey('ABS') === 'ABS', 'headingKey: bare name passes through');
  assert(headingKey('  SIN  ') === 'SIN', 'headingKey: surrounding whitespace trimmed');

  // The two shapes the inline comment called out.
  assert(headingKey('!(Factorial)') === '!', 'headingKey: !(Factorial) → !');
  assert(headingKey('==(Logical Equality)') === '==',
    'headingKey: ==(Logical Equality) → ==');

  // Space before the gloss is absorbed by the strip.
  assert(headingKey('FLOOR (Greatest Integer)') === 'FLOOR',
    'headingKey: space before parenthetical is stripped');

  // Greedy strip: a multi-word gloss with inner spaces goes entirely.
  assert(headingKey('ARG(Argument of a complex number)') === 'ARG',
    'headingKey: multi-word gloss fully removed');

  // Glyph command names survive the strip.
  assert(headingKey('√(Square Root)') === '√', 'headingKey: glyph name preserved');
  assert(headingKey('ΣX(Sum of X)') === 'ΣX', 'headingKey: Σ-prefixed name preserved');

  // Degenerate inputs collapse to '' (the caller skips these).
  assert(headingKey('') === '', 'headingKey: empty → empty');
  assert(headingKey('   ') === '', 'headingKey: whitespace → empty');
  assert(headingKey(null) === '', 'headingKey: null → empty');
  assert(headingKey(undefined) === '', 'headingKey: undefined → empty');
  assert(headingKey('(only a gloss)') === '', 'headingKey: gloss-only heading → empty');
}

/* ================================================================
   session295: ALIASES — the panel-name → doc-heading fallback table
   command-help's `_render` consults when a direct section lookup
   misses.  `_render` upper-cases the requested name before
   `ALIASES.get(key)` and resolves exactly one hop (it does NOT
   re-feed the alias target back through the table).  These guard the
   map's structural invariants against a future edit that would add an
   entry the lookup path can never hit or that needs a second rewrite.
   ================================================================ */
{
  // Every key must equal its own upper-case: `_render` only ever calls
  // `.get(String(name).toUpperCase())`, so a lower-case key is dead.
  for (const k of ALIASES.keys()) {
    assert(k === k.toUpperCase(),
      `ALIASES: key '${k}' must be upper-case to be reachable`);
  }

  // Single-hop: no alias *target* is itself an alias *key* (case-folded),
  // which would need a second resolution `_render` never performs.
  for (const v of ALIASES.values()) {
    assert(!ALIASES.has(v.toUpperCase()),
      `ALIASES: target '${v}' is also a key — would need a second hop`);
  }

  // No self-alias: a key that maps to itself (case-folded) is a no-op
  // entry — the direct lookup already covers it.
  for (const [k, v] of ALIASES) {
    assert(k.toUpperCase() !== v.toUpperCase(),
      `ALIASES: '${k}' aliases itself`);
  }

  // Spot-check the documented redirections still resolve as written.
  assert(ALIASES.get('CHARPOL') === 'PCAR', 'ALIASES: CHARPOL → PCAR');
  assert(ALIASES.get('LIM') === 'LIMIT', 'ALIASES: LIM → LIMIT');
  assert(ALIASES.get('SQRT') === '√', 'ALIASES: SQRT → √');
  assert(ALIASES.get('<=') === '≤', 'ALIASES: <= → ≤');
}

