import { readFileSync } from 'node:fs';
import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isUnit,
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
import { computeMenuPage } from '../www/src/ui/paging.js';
import { headingKey, ALIASES, pushHistory } from '../www/src/ui/command-help.js';
import { escapeHtml, binaryBaseLabel, displayModeLabel, coordModeGlyph, suspendedProgramText } from '../www/src/ui/display.js';
import { uncategorizedOps, dropZoneForFraction, CATEGORIES, CHAR_GROUPS } from '../www/src/ui/drawer.js';
import { SOFT_KEYS, NAV_KEYS, ARROW_KEYS, MAIN_KEYS, keyAccessibleName } from '../www/src/ui/keyboard.js';
import { allOps } from '../www/src/rpl/ops.js';
import { unitInfo, UNIT_CATALOG, parseUnitExpr, sameDims } from '../www/src/rpl/units.js';
import { UNIT_GROUPS } from '../www/src/ui/menus.js';
import { commandWordAt, commandHelpText } from '../www/src/ui/hover-help.js';
import { parseCommandReference } from '../www/src/ui/command-reference.js';
import { assert, assertThrows } from './helpers.mjs';

/* UI helpers — paging, physical-keyboard modifier shortcuts,
   interactive-stack pure helpers, Display click/tooltip rendering. */

/* ================================================================
   UI paging helper — computeMenuPage.  Pure, no DOM required; it
   drives the soft-menu page view.
   ================================================================ */

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
   session402: computeMenuPage pageSize parameter.  Every prior pin
   uses the default pageSize of 6, so the parameter — which drives
   totalPages (ceil(len/pageSize)), the slice start (page*pageSize),
   the view width, and the tail pad — was never positively exercised.
   A refactor hardcoding 6 instead of honoring the argument would pass
   every existing pin.  Probed live (paging.js, DOM-free).
   ================================================================ */
{
  const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const q0 = computeMenuPage(seven, 0, 3);
  assert(q0.totalPages === 3,                'computeMenuPage: pageSize 3, 7 slots → 3 pages');
  assert(q0.view.length === 3,               'computeMenuPage: view width tracks pageSize');
  assert(JSON.stringify(q0.view) === JSON.stringify(['A', 'B', 'C']),
                                             'computeMenuPage: pageSize 3 page 0 shows A..C');
  assert(q0.hasMore === true,                'computeMenuPage: multi-page under pageSize 3');

  const q1 = computeMenuPage(seven, 1, 3);
  assert(JSON.stringify(q1.view) === JSON.stringify(['D', 'E', 'F']),
                                             'computeMenuPage: pageSize 3 page 1 shows D..F');

  // Last page slices the short tail and pads to pageSize width
  const q2 = computeMenuPage(seven, 2, 3);
  assert(JSON.stringify(q2.view) === JSON.stringify(['G', null, null]),
                                             'computeMenuPage: pageSize 3 last page pads tail to width');

  // Wrap and negative wrap honor the pageSize-derived totalPages
  const qw = computeMenuPage(seven, 3, 3);
  assert(qw.page === 0 && qw.view[0] === 'A',
                                             'computeMenuPage: pageSize 3 page past end wraps to 0');
  const qm = computeMenuPage(seven, -1, 3);
  assert(qm.page === 2 && qm.view[0] === 'G',
                                             'computeMenuPage: pageSize 3 page -1 wraps to last');

  // pageSize 1 → one slot per page, width-1 view, no tail to pad
  const one = computeMenuPage(['X', 'Y'], 0, 1);
  assert(one.totalPages === 2 && one.view.length === 1 && one.view[0] === 'X'
         && one.hasMore === true,
                                             'computeMenuPage: pageSize 1 → single-slot pages');
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


  const stepHalt = { tokens: [Integer(1n), Integer(2n), Name('+')], index: 1, kind: 'step' };
  assert(suspendedProgramText(stepHalt) === '« 1 ▸2 + »',
    'suspendedProgramText: marks the next token while stepping');
  assert(suspendedProgramText({ ...stepHalt, index: 0 }) === '« ▸1 2 + »',
    'suspendedProgramText: index 0 marks the first token');
  assert(suspendedProgramText({ ...stepHalt, index: 3 }) === '« 1 2 + ▸ »',
    'suspendedProgramText: index at the end marks past the last token');
  assert(suspendedProgramText({ tokens: stepHalt.tokens, index: null }) === '« 1 2 + ▸ »',
    'suspendedProgramText: a missing index marks past the last token');
  assert(suspendedProgramText(null) === '',
    'suspendedProgramText: null hides the program');
  assert(suspendedProgramText({ kind: 'step' }) === '',
    'suspendedProgramText: a halt record without tokens hides the program');
  assert(suspendedProgramText({
    tokens: [Integer(1n), Name('HALT'), Integer(2n)],
    index: 2,
    kind: 'halt',
  }) === '« 1 HALT ▸2 »',
    'suspendedProgramText: a halted program shows the token after HALT');
  const many = Array.from({ length: 30 }, (_, i) => Integer(BigInt(i)));
  assert(suspendedProgramText({ tokens: many, index: 15, kind: 'step' }) ===
         '« … 7 8 9 10 11 12 13 14 ▸15 16 17 18 19 20 21 22 23 … »',
    'suspendedProgramText: a long program keeps the next token in view');
}

/* ================================================================
   session347: uncategorizedOps — the "Other" bucket builder extracted
   from SidePanel._renderCommands so the registered-but-uncategorized op
   list is testable DOM-free.  First coverage of www/src/ui/side-panel.js.
   Pins the seen-exclusion, the ASCII arrow-alias hide (`->`), the
   lower-cased substring filter, and the alphabetical sort — guarding a
   refactor that drops the alias hide or the sort.  Also asserts the
   exported CATEGORIES / CHAR_GROUPS catalog shapes (string keys, array
   values, no within-category dupes) so the panel's source-of-truth maps
   can't silently degrade.
   ================================================================ */
{
  const reg = new Set(['ABS', 'FOO', 'BAR', '->NUM', 'HMS->', 'ZED']);
  const seen = new Set(['ABS']);
  assert(JSON.stringify(uncategorizedOps(reg, seen, '')) ===
         JSON.stringify(['BAR', 'FOO', 'ZED']),
                                             'uncategorizedOps: excludes seen + arrow aliases, sorted');
  assert(JSON.stringify(uncategorizedOps(reg, seen)) ===
         JSON.stringify(['BAR', 'FOO', 'ZED']),
                                             'uncategorizedOps: filter defaults to no-filter');
  assert(JSON.stringify(uncategorizedOps(reg, seen, 'a')) ===
         JSON.stringify(['BAR']),
                                             'uncategorizedOps: lower-cased substring filter on upper-cased names');
  assert(JSON.stringify(uncategorizedOps(new Set(['ABS']), new Set(['ABS']), '')) ===
         JSON.stringify([]),
                                             'uncategorizedOps: all-seen → empty');
  assert(JSON.stringify(uncategorizedOps(new Set(['->NUM', 'A->B', 'HMS->']), new Set(), '')) ===
         JSON.stringify([]),
                                             'uncategorizedOps: every arrow alias hidden');
  // Sort is alphabetical regardless of insertion order.
  assert(JSON.stringify(uncategorizedOps(new Set(['ZED', 'ABS', 'MID']), new Set(), '')) ===
         JSON.stringify(['ABS', 'MID', 'ZED']),
                                             'uncategorizedOps: result sorted alphabetically');

  // Catalog shape guards — first foothold on side-panel.js's data maps.
  const catKeys = Object.keys(CATEGORIES);
  assert(catKeys.length >= 15 && catKeys.every(k => typeof k === 'string' && k.length > 0),
                                             'CATEGORIES: non-empty string display-name keys');
  assert(catKeys.every(k => Array.isArray(CATEGORIES[k]) && CATEGORIES[k].length > 0),
                                             'CATEGORIES: every value is a non-empty op-name array');
  assert(catKeys.every(k => {
    const list = CATEGORIES[k];
    return new Set(list).size === list.length;
  }),                                        'CATEGORIES: no duplicate op name within a category');
  assert(CATEGORIES['Stack'].includes('DUP') && CATEGORIES['Arithmetic'].includes('+'),
                                             'CATEGORIES: known anchors present (Stack/DUP, Arithmetic/+)');

  /* session388: tie the side-panel command catalog to the live registry.
     `_renderCommands` (side-panel.js ~767) classifies every CATEGORIES
     entry into one of three buttons: a registered op (looked up
     case-insensitively via `registered.has(name.toUpperCase())`), a
     unit-insert button (`unitInfo(name)`, which reads an SI prefix), or — neither — a
     greyed `sp-cmd-stub` "not yet implemented" button.  The shape pins
     above only spot-check two anchors, so a renamed/removed op or a typo
     in CATEGORIES would silently become a dead stub button with no test
     catching it.  Probed live (CAS-free): 467 entries → 428 ops + 39
     units + 0 stubs, and every unit-only entry sits in the 'Units'
     category.  These guard that every catalog button stays live. */
  const liveOps = new Set(allOps().map(s => s.toUpperCase()));
  const classify = (name) =>
    unitInfo(name) ? 'unit'
      : liveOps.has(name.toUpperCase()) ? 'op'
        : 'stub';
  const stubs = [];
  let unitEntries = 0;
  let opEntries = 0;
  for (const k of catKeys) {
    for (const name of CATEGORIES[k]) {
      const kind = classify(name);
      if (kind === 'stub') stubs.push(`${k}:${name}`);
      else if (kind === 'unit') unitEntries += 1;
      else opEntries += 1;
    }
  }
  assert(stubs.length === 0,
                                             `CATEGORIES: every entry resolves to a live op or unit, no dead stubs (got ${stubs.join(', ')})`);
  assert(opEntries > 400,
                                             'CATEGORIES: the op-backed entries dominate the catalog');
  assert(unitEntries > 0,
                                             'CATEGORIES: the unit-insert entries are present');
  assert(catKeys.filter(k => k !== 'Units')
           .every(k => CATEGORIES[k].every(n => classify(n) === 'op')),
                                             'CATEGORIES: unit-insert buttons are confined to the Units category');

  const unitKeys = UNIT_GROUPS.flatMap((g) => g.units);
  assert(UNIT_GROUPS.length === 14 && new Set(UNIT_GROUPS.map((g) => g.id)).size === 14 && UNIT_GROUPS.every((g) => /^[A-Z]{3,5}$/.test(g.id) && g.title && g.units.length >= 3),
    'UNIT_GROUPS: fourteen groups with HP-style soft key names, titles and at least three units each');
  assert(new Set(unitKeys).size === unitKeys.length, 'UNIT_GROUPS: no unit key appears in two groups');
  assert(unitKeys.every((key) => { try { return isUnit(parseEntry(`1_${key}`)[0]); } catch { return false; } }),
    'UNIT_GROUPS: every key makes a unit object when attached to a number');
  const ONE_QUANTITY = ['LENG', 'AREA', 'VOL', 'SPEED', 'FORCE', 'ENRG', 'POWR', 'PRESS', 'TEMP'];
  const mixed = UNIT_GROUPS.filter((g) => ONE_QUANTITY.includes(g.id) && !g.units.every((key) => sameDims(parseUnitExpr(key), parseUnitExpr(g.units[0])))).map((g) => g.id);
  assert(mixed.length === 0, `UNIT_GROUPS: the keys of a length, area, volume, speed, force, energy, power, pressure or temperature group all measure it (got ${mixed})`);
  const ALIASES_OF_KEYS = ['ohm', 'l', 'degC', 'degF', 'degR'];
  const unreachable = [...UNIT_CATALOG.keys()].filter((sym) => !unitKeys.includes(sym) && !ALIASES_OF_KEYS.includes(sym));
  assert(unreachable.length === 0, `UNIT_GROUPS: every catalog unit but an alias has a key (missing ${unreachable.join(', ')})`);
  assert(unitKeys.filter(unitInfo).every((key) => CATEGORIES.Units.includes(key)) && !unitKeys.some((key) => /[\/^]/.test(key) && CATEGORIES.Units.includes(key)),
    'UNIT_GROUPS: the Catalog lists every plain unit key and no product or quotient');

  const charKeys = Object.keys(CHAR_GROUPS);
  assert(charKeys.length >= 4 && charKeys.includes('Constants'),
                                             'CHAR_GROUPS: has the expected groups incl. Constants');
  assert(charKeys.every(k => CHAR_GROUPS[k].every(e =>
           Array.isArray(e) && e.length >= 2 &&
           typeof e[0] === 'string' && typeof e[1] === 'string')),
                                             'CHAR_GROUPS: every entry is [label, insert, title?] with string label+insert');

  /* session354: dropZoneForFraction — the three-zone drag geometry
     extracted from SidePanel._dropTargetAt so the row-hover decision is
     testable DOM-free (the session347/326 extract-and-pin pattern).  The
     folder split is before/into/after at the 0.25/0.75 boundaries; a
     non-folder row is a plain before/after at 0.5.  Boundary values are
     pinned exactly: `< 0.25` and `> 0.75` (so 0.25 and 0.75 fall to
     into), and `< 0.5` (so 0.5 falls to after). */
  assert(dropZoneForFraction(0, true) === 'before' &&
         dropZoneForFraction(0.24, true) === 'before',
                                             'dropZoneForFraction: folder top quarter → before');
  assert(dropZoneForFraction(0.25, true) === 'into' &&
         dropZoneForFraction(0.5, true) === 'into' &&
         dropZoneForFraction(0.75, true) === 'into',
                                             'dropZoneForFraction: folder middle (incl. both boundaries) → into');
  assert(dropZoneForFraction(0.76, true) === 'after' &&
         dropZoneForFraction(1, true) === 'after',
                                             'dropZoneForFraction: folder bottom quarter → after');
  assert(dropZoneForFraction(0, false) === 'before' &&
         dropZoneForFraction(0.49, false) === 'before',
                                             'dropZoneForFraction: non-folder top half → before');
  assert(dropZoneForFraction(0.5, false) === 'after' &&
         dropZoneForFraction(1, false) === 'after',
                                             'dropZoneForFraction: non-folder bottom half (incl. 0.5 boundary) → after');
  assert(dropZoneForFraction(0.5, true) === 'into' &&
         dropZoneForFraction(0.5, false) === 'after',
                                             'dropZoneForFraction: same 0.5 frac diverges by isDir (into vs after)');
}


{
  const { Entry } = await import('../www/src/ui/entry.js');

  {
    const s = new Stack();
    s.push(Real(1));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(2));
    e.performUndo();
    assert(s.depth === 1 && s.peek(1).value.eq(1), 'performUndo restores the stack');
    e.performRedo();
    assert(s.depth === 2 && s.peek(1).value.eq(2), 'performRedo re-applies the push');
  }

  {
    const e = new Entry(new Stack());
    assertThrows(() => e.performUndo(), /no undo/i, 'performUndo with empty history reports No undo');
    assertThrows(() => e.performRedo(), /no redo/i, 'performRedo with empty history reports No redo');
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
    e.performUndo();
    assert(s.depth === 2 && s.peek(1).value.eq(2),
      'UNDO restores the pre-DROP stack when only stack state changed');
    e.performRedo();
    assert(s.depth === 1 && s.peek(1).value.eq(1),
      'REDO re-applies the DROP');
  }

  {
    const { resetHome, currentPath } = await import('../www/src/rpl/state.js');
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.flashError = () => {};
    e.buffer = '4700 `TYPEDRA` STO « 2 * » `TYPEDDBL` STO `TYPEDDIR` CRDIR'; e.enter();
    e.buffer = 'TYPEDRA'; e.enter();
    assert(s.depth === 1 && format(s.peek(1)) === '4700', 'typing a variable name recalls its value');
    e.buffer = 'TYPEDDBL'; e.enter();
    assert(s.depth === 1 && format(s.peek(1)) === '9400', 'typing a program name runs it');
    e.buffer = 'TYPEDDIR'; e.enter();
    assert(currentPath().join('/') === 'HOME/TYPEDDIR', 'typing a directory name enters it');
    e.buffer = 'TYPEDNOPE'; e.enter();
    assert(s.depth === 2 && s.peek(1).type === 'name' && s.peek(1).id === 'TYPEDNOPE',
      'typing an undefined name leaves the name on the stack');
    let flashed = '';
    e.flashError = (err) => { flashed = err.message; };
    e.buffer = '« 1 "a" - » `TYPEDBAD` STO'; e.enter();
    e.buffer = 'TYPEDBAD'; e.enter();
    assert(flashed === 'TYPEDBAD: -: Bad argument type' && s.depth === 2,
      'a failing typed program name is blamed in the error and rolls the stack back');
    resetHome();
  }

  {
    const { resetHome } = await import('../www/src/rpl/state.js');
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.flashError = () => {};
    e.buffer = '1'; e.enter();
    e.buffer = '2'; e.enter();
    e.buffer = '"hi"'; e.enter();
    e.execOp('SIN');
    assert(s.depth === 3, 'failed SIN leaves the stack as it was');
    e.performUndo();
    assert(s.depth === 2 && format(s.peek(1)) === '2',
      'a failed command keeps earlier undo steps: UNDO removes "hi"');
    e.performUndo();
    assert(s.depth === 1, 'a failed command keeps earlier undo steps: second UNDO removes 2');
  }

  {
    const { resetHome, varRecall } = await import('../www/src/rpl/state.js');
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.flashError = () => {};
    e.buffer = '« 5 `PARTIALX` STO "a" SIN »'; e.enter();
    e.execOp('EVAL');
    assert(varRecall('PARTIALX') !== undefined && varRecall('PARTIALX') !== null,
      'a program that stores then fails leaves the stored variable');
    e.performUndo();
    assert(varRecall('PARTIALX') === undefined || varRecall('PARTIALX') === null,
      'a failed command that changed variables keeps its own undo step: UNDO removes PARTIALX');
    resetHome();
  }
}


/* =================================================================
   Stack-level pure helpers.

   These exercise the DOM-free level-addressed edits in
   src/ui/stack-levels.js that back the selected-level actions (the
   click-to-select row toolbar and the LEVEL soft menu) so the math
   stays correct as the App wiring evolves.  The App integration
   itself (click dispatch, menu install/restore) is covered lightly
   via Stack-level assertions — a full DOM test would need jsdom
   which we deliberately avoid in this suite.
   ================================================================= */
{
  const {
    clampLevel, rollLevel, rollDownToLevel, dropLevel, moveLevel, replaceLevel,
  } = await import('../www/src/ui/stack-levels.js');

  // clampLevel bounds
  assert(clampLevel(0, 5)  === 1, 'clampLevel: below-range snaps to 1');
  assert(clampLevel(3, 5)  === 3, 'clampLevel: in-range pass-through');
  assert(clampLevel(99, 5) === 5, 'clampLevel: above-range snaps to depth');
  assert(clampLevel(2, 0)  === 0, 'clampLevel: depth 0 returns 0');
  assert(clampLevel(2.7, 5) === 2, 'clampLevel: trunc fractional input');

  // moveLevel: general from → to, both directions, and a same-level no-op.
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
    moveLevel(s, 4, 2);               // bottom value rises to level 2
    const top = s.snapshot();
    assert(top[1].value.eq(1) && top[0].value.eq(4) && top[2].value.eq(3),
           'moveLevel: a lower level can move up past intermediates');
  }
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    let emits = 0;
    const off = s.subscribe(() => { emits++; });
    moveLevel(s, 2, 2);
    off();
    assert(emits === 0 && s.snapshot()[1].value.eq(2), 'moveLevel: from === to is a no-op that does not emit');
  }
  assertThrows(() => moveLevel(new Stack(), 1, 1), null, 'moveLevel: out-of-range throws');

  // replaceLevel: splice one or more values in at a level.
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    replaceLevel(s, 2, [Real(20), Real(21)]);
    const top = s.snapshot();
    assert(s.depth === 4 && top[0].value.eq(3) && top[1].value.eq(21) && top[2].value.eq(20) && top[3].value.eq(1),
           'replaceLevel: splices values in push order, the last landing at the target level');
  }
  assertThrows(() => replaceLevel(new Stack(), 1, [Real(1)]), null, 'replaceLevel: out-of-range throws');

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

  // session395: the `level < 1` arm of the shared bounds guard
  // (`level < 1 || level > depth`) in all three mutators.  Every prior
  // out-of-range pin (session301 + above) fed only `level > depth`, so the
  // low arm — reachable when an empty-stack clampLevel returns 0 — was never
  // positively exercised; a refactor dropping it would let rollLevel(s,0)
  // splice at idx=length (a silent no-op/garbage) and still pass green.  The
  // throw message ('Too few arguments') was also unpinned (assertThrows above
  // passes null).  Probed live: level 0 and negatives reject identically on a
  // populated and an empty (depth-0) stack, leaving the stack untouched.
  {
    const mk = () => {
      const s = new Stack();
      s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
      return s;
    };
    for (const lvl of [0, -1, -5]) {
      assertThrows(() => rollLevel(mk(), lvl), 'Too few arguments',
        `rollLevel(${lvl}): level < 1 rejects with the bounds message`);
      assertThrows(() => rollDownToLevel(mk(), lvl), 'Too few arguments',
        `rollDownToLevel(${lvl}): level < 1 rejects with the bounds message`);
      assertThrows(() => dropLevel(mk(), lvl), 'Too few arguments',
        `dropLevel(${lvl}): level < 1 rejects with the bounds message`);
    }
    // depth-0 empty stack: clampLevel returns 0, which trips the same low arm.
    assertThrows(() => rollLevel(new Stack(), 0), 'Too few arguments',
      'rollLevel: level 0 on empty stack rejects (clamp-0 path)');
    // a rejected low-arm call leaves the stack untouched (guard precedes splice).
    const s = mk();
    assertThrows(() => rollLevel(s, 0), 'Too few arguments', 'rollLevel(0): guarded');
    assert(s.depth === 3 && s.snapshot()[0].value.eq(3),
      'rollLevel(0): rejected call leaves the stack untouched');
  }
}

/* =================================================================
   Display status-line rendering.

   pathSegmentsHtml is a pure function — probe it directly.  The
   halt / suspended-program pieces go through the Display instance
   with minimal DOM stubs (renderStatus replaces statusLine.innerHTML
   wholesale, so a stub only needs to hold that string).
   ================================================================= */
{
  const { pathSegmentsHtml } = await import('../www/src/ui/display.js');
  const html = pathSegmentsHtml(['HOME', 'WORK', 'A']);
  assert(html.includes('data-index="0"') && html.includes('data-index="1"') && !html.includes('data-index="2"'),
         'pathSegmentsHtml: every ancestor segment carries data-index; the current one does not');
  assert(html.includes('>HOME<') && html.includes('>WORK<') && html.includes('>A<'),
         'pathSegmentsHtml: every segment text survives the wrap');
  assert(html.includes('title="Go to HOME"') && html.includes('title="Go to WORK"'),
         'pathSegmentsHtml: ancestor segments carry a navigable tooltip');
  assert(/<span>A<\/span>/.test(html),
         'pathSegmentsHtml: the current segment is a plain span, not a button');
}

{
  const { Display } = await import('../www/src/ui/display.js');
  const statusLine = { innerHTML: '', className: '' };
  const d = new Display({
    stackView: { addEventListener() {} },
    cmdline: {},
    statusLine,
  });
  d.renderStatus({ classic: true, halted: 'step' });
  assert(/<span class="on ">HALT<\/span>/.test(statusLine.innerHTML),
    'renderStatus: the Classic LCD lights HALT for a halted program');
  d.renderStatus({ classic: true, halted: null });
  assert(/<span class=" ">HALT<\/span>/.test(statusLine.innerHTML),
    'renderStatus: HALT stays ghosted when nothing is halted');
  d.renderStatus({ editing: 3 });
  assert(statusLine.innerHTML.includes('EDITING LEVEL 3'), 'renderStatus: editing a level shows a pill');
  d.renderStatus({ shift: 'shiftLLock' });
  assert(statusLine.innerHTML.includes('LOCKED') && statusLine.innerHTML.includes('↰'),
    'renderStatus: a locked shift layer shows its glyph and LOCKED');

  const { suspendedProgramHtml } = await import('../www/src/ui/display.js');
  const halted = { tokens: [Integer(1n), Integer(2n), Name('+')], index: 1, kind: 'step' };
  assert(suspendedProgramHtml(halted) === '« 1 <mark>2</mark> + »',
    'suspendedProgramHtml: the next instruction is marked');
  assert(suspendedProgramHtml({ tokens: [Integer(1n)], index: 1, kind: 'halt' }) === '« 1 <mark>end</mark> »',
    'suspendedProgramHtml: past the last token marks the end');
  assert(suspendedProgramHtml(null) === '', 'suspendedProgramHtml: nothing halted, nothing shown');
  assert(suspendedProgramHtml({ tokens: [{ type: 'string', value: '<b>' }], index: 0, kind: 'step' }).includes('&lt;b&gt;'),
    'suspendedProgramHtml: program text is escaped');
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

/* ================================================================
   session361: pushHistory — the visited-name history transition lifted
   out of CommandHelp.show() (was inline truncate-forward-and-append,
   entangled with the popup's DOM render).  The popup keeps an ordered
   `_history` of shown names with `_historyIdx` at the current one;
   show() truncates any forward entries and appends, advancing the
   cursor, EXCEPT when the requested name is already current (a no-op,
   so re-right-clicking the same command doesn't grow history).  Pure
   list logic — guards a refactor that drops the no-op short-circuit,
   forgets to truncate the forward branch, or mis-advances the cursor.
   ================================================================ */
{
  // First push onto an empty history seeds index 0.
  let r = pushHistory([], -1, 'A');
  assert(JSON.stringify(r.history) === '["A"]' && r.idx === 0,
    'pushHistory: first push seeds [A] @0');

  // Append at the end advances the cursor to the new last entry.
  r = pushHistory(['A'], 0, 'B');
  assert(JSON.stringify(r.history) === '["A","B"]' && r.idx === 1,
    'pushHistory: append at end → [A,B] @1');

  // Re-issuing the current entry is a no-op: same references, same idx.
  const cur = ['A', 'B', 'C'];
  r = pushHistory(cur, 2, 'C');
  assert(r.history === cur && r.idx === 2,
    'pushHistory: re-issue current → unchanged (same array ref)');

  // Re-issuing the current entry mid-history is also a no-op (does NOT
  // truncate the forward entries the cursor still sits before).
  r = pushHistory(['A', 'B', 'C'], 1, 'B');
  assert(JSON.stringify(r.history) === '["A","B","C"]' && r.idx === 1,
    'pushHistory: re-issue current mid-history keeps forward entries');

  // A new name with the cursor mid-history truncates the forward tail
  // before appending.
  r = pushHistory(['A', 'B', 'C'], 0, 'X');
  assert(JSON.stringify(r.history) === '["A","X"]' && r.idx === 1,
    'pushHistory: new name mid-history truncates forward then appends');

  r = pushHistory(['A', 'B', 'C'], 1, 'Z');
  assert(JSON.stringify(r.history) === '["A","B","Z"]' && r.idx === 2,
    'pushHistory: new name at mid cursor drops the tail past idx');

  // Append returns a FRESH array (the popup reassigns `_history`), never
  // a mutation of the input — so a stale reference can't observe it.
  const input = ['A'];
  r = pushHistory(input, 0, 'B');
  assert(r.history !== input && JSON.stringify(input) === '["A"]',
    'pushHistory: append leaves the input array untouched');

  // Distinct new name at the end (the common forward-browse case).
  r = pushHistory(['A', 'B'], 1, 'C');
  assert(JSON.stringify(r.history) === '["A","B","C"]' && r.idx === 2,
    'pushHistory: distinct end append → [A,B,C] @2');
}

/* ================================================================
   session368: keyboard layout tables — first coverage of
   www/src/ui/keyboard.js.  The SOFT_KEYS / NAV_KEYS / ARROW_KEYS /
   MAIN_KEYS grids are pure exported data (built by the `mk` factory)
   but had ZERO test callers, so a refactor that drops a key, breaks
   the `mk` shape, or scrambles the documented alpha sequence would
   pass green.  Structural guards in the session347 catalog-shape
   precedent: fixed grid sizes (the physical HP50 layout — 6 soft,
   6 nav, 6 arrow-cluster, 5×7 main), the nine-field `mk` contract on
   every entry, the per-grid primaries/kinds, and the header's
   "alpha a..z maps to the first 26 keys, F1=a … ÷=z" invariant.
   ================================================================ */
{
  // Fixed grid sizes — faithful to the physical hardware (header §10-14).
  assert(SOFT_KEYS.length === 6,   'keyboard: SOFT_KEYS is the 6-slot F1..F6 menu row');
  assert(NAV_KEYS.length === 6,    'keyboard: NAV_KEYS is 6 (VARS/PREV/NEXT + HOME/STO/RCL)');
  assert(ARROW_KEYS.length === 6,  'keyboard: ARROW_KEYS is 6 (CST + diamond + CAT)');
  assert(MAIN_KEYS.length === 35,  'keyboard: MAIN_KEYS is 5 cols x 7 rows = 35');
  {
    const sin = MAIN_KEYS.find((k) => k.primary === 'SIN');
    assert(keyAccessibleName(sin) === 'SIN, left shift ASIN, right shift Σ',
      'keys have spoken names that include their shifted functions');
    const shift = MAIN_KEYS.find((k) => k.kind === 'shiftL');
    assert(keyAccessibleName(shift) === 'Left shift',
      'shift keys are named for what they are, not their glyph');
  }

  // Every entry carries exactly the nine fields the `mk` factory builds —
  // guards a refactor that hand-rolls an entry and drops a field.
  const mkFields = ['primary', 'shiftL', 'shiftR', 'alpha', 'action',
                    'shiftLAction', 'shiftRAction', 'kind', 'className'];
  const allKeys = [...SOFT_KEYS, ...NAV_KEYS, ...ARROW_KEYS, ...MAIN_KEYS];
  assert(allKeys.every(k => {
    const ks = Object.keys(k);
    return ks.length === mkFields.length && mkFields.every(f => f in k);
  }),                                'keyboard: every key has exactly the 9 mk fields');
  // The three action slots are either absent (null) or callable — never a
  // stray non-function left by a botched edit.
  assert(allKeys.every(k =>
    [k.action, k.shiftLAction, k.shiftRAction].every(a => a === null || typeof a === 'function')),
                                     'keyboard: every action slot is null or a function');

  // Soft row: F1..F6, alpha a..f, all menu-styled op keys with a handler.
  assert(SOFT_KEYS.map(k => k.primary).join(',') === 'F1,F2,F3,F4,F5,F6',
                                     'keyboard: SOFT_KEYS primaries are F1..F6 in order');
  assert(SOFT_KEYS.map(k => k.alpha).join('') === 'abcdef',
                                     'keyboard: SOFT_KEYS alpha letters are a..f');
  assert(SOFT_KEYS.every(k => k.kind === 'op' && k.className === 'menu' && typeof k.action === 'function'),
                                     'keyboard: SOFT_KEYS are menu-class op keys, each with an action');

  // Nav block: the renamed HOME/VARS/STO/RCL + PREV/NEXT paging, alpha g..l.
  assert(NAV_KEYS.map(k => k.primary).join(',') === 'VARS,PREV,NEXT,HOME,STO,RCL',
                                     'keyboard: NAV_KEYS primaries in row-major order');
  assert(NAV_KEYS.map(k => k.alpha).join('') === 'ghijkl',
                                     'keyboard: NAV_KEYS alpha letters are g..l');

  // Arrow cluster: CST + 4-way diamond + CAT, each distinctly kinded and
  // CSS-positioned (the className drives the inverted-T placement).
  assert(ARROW_KEYS.map(k => k.primary).join(',') === 'CST,▲,CAT,◀,▶,▼',
                                     'keyboard: ARROW_KEYS primaries are CST/▲/CAT/◀/▶/▼');
  assert(ARROW_KEYS.map(k => k.kind).join(',') === 'menu,arrow,cat,arrow,arrow,arrow',
                                     'keyboard: ARROW_KEYS kinds (CST menu, CAT catalog, four arrows)');
  assert(ARROW_KEYS.every(k => k.className.length > 0),
                                     'keyboard: every arrow-cluster key has a positioning className');

  // The header invariant: alpha a..z maps to the first 26 alpha-bearing
  // keys in declaration order across the three typing grids (the arrow
  // cluster has no alpha), with F1=a and ÷=z.
  const alphaSeq = [...SOFT_KEYS, ...NAV_KEYS, ...MAIN_KEYS]
    .map(k => k.alpha).filter(a => a !== '');
  assert(alphaSeq.join('') === 'abcdefghijklmnopqrstuvwxyz',
                                     'keyboard: alpha labels form a..z across soft+nav+main');
  assert(new Set(alphaSeq).size === 26,
                                     'keyboard: the 26 alpha letters are unique');
  const zKey = [...SOFT_KEYS, ...NAV_KEYS, ...MAIN_KEYS].find(k => k.alpha === 'z');
  assert(zKey && zKey.primary === '÷',
                                     'keyboard: the z alpha key is ÷ (header: F1=a … ÷=z)');

  // No two physical keys share a primary label across the whole layout.
  const primaries = allKeys.map(k => k.primary);
  assert(new Set(primaries).size === primaries.length,
                                     'keyboard: every primary label is unique across all grids');

  // Main keypad anchors: the bottom row is ON 0 . SPC ENTER, and the
  // digit keys carry kind 'digit' so the renderer styles them as a pad.
  assert(MAIN_KEYS.slice(-5).map(k => k.primary).join(',') === 'ON,0,.,SPC,ENTER',
                                     'keyboard: MAIN_KEYS bottom row is ON 0 . SPC ENTER');
  assert(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].every(d =>
           MAIN_KEYS.some(k => k.primary === d && k.kind === 'digit')),
                                     'keyboard: digits 0..9 are all present as kind=digit keys');
}

{
  const { Entry } = await import('../www/src/ui/entry.js');
  const down = ARROW_KEYS.find(k => k.primary === '▼');
  assert(down.shiftL === 'SST' && typeof down.shiftLAction === 'function',
    'keyboard: left-shift ▼ is the SST key');
  const tick = MAIN_KEYS.find(k => k.primary === '`');
  assert(tick.shiftR === 'EQW' && typeof tick.shiftRAction === 'function',
    'keyboard: right shift on the ` key is EQW');
  const nine = MAIN_KEYS.find(k => k.primary === '9');
  assert(nine.shiftR === '|' && typeof nine.shiftRAction === 'function',
    'keyboard: | is typed from 9 right shift');

  resetHome();
  try {
    const s = new Stack();
    const e = new Entry(s);
    s.push(Program([Integer(1n), Integer(2n), Name('+')]));
    lookup('DBUG').fn(s);
    assert(s.depth === 1 && s.peek().value === 1n && calcState.halted && calcState.halted.kind === 'step',
      'SST key setup: DBUG runs the first token and suspends');
    assert(suspendedProgramText(calcState.halted) === '« 1 ▸2 + »',
      'SST key setup: the suspended program shows the next token');
    down.shiftLAction(e);
    assert(s.depth === 2 && s.peek().value === 2n && calcState.halted && calcState.halted.kind === 'step',
      'SST key steps one token and stays suspended');
    assert(suspendedProgramText(calcState.halted) === '« 1 2 ▸+ »',
      'SST key steps: the suspended program advances to the next token');

    const editing = new Entry(new Stack());
    editing.type('1');
    down.shiftLAction(editing);
    assert(editing.buffer === '1 SST ',
      'SST key types the name while the command line is open');
  } finally {
    resetHome();
  }
}

/* ================================================================
   session333: errorBeep — the error-flash piezo chirp (beep.js).  The
   only previously uncovered www/src/ui module.  errorBeep has two
   environment arms: a silent no-op when no (webkit)AudioContext exists
   (the Node default, exercised by every other test that flashes an
   error), and the real WebAudio-graph build under a browser context.
   A fake AudioContext lets the build path run headless so we can pin
   the lazy single-context cache, the suspended→resume guard, and the
   oscillator/gain wiring + envelope schedule that approximate the
   HP50 buzzer.  Guards a refactor that drops the cache, the resume
   guard, or rewires the graph/envelope.
   ================================================================ */
{
  const { errorBeep } = await import('../www/src/ui/beep.js');

  // No AudioContext in scope yet → silent no-op, never throws, returns
  // undefined.  Leaves the module's lazy `_ctx` cache null so the build
  // path below constructs the first (and only) context.
  assert(typeof globalThis.AudioContext === 'undefined',
    'errorBeep: no AudioContext in the bare Node env (precondition)');
  assert(errorBeep() === undefined, 'errorBeep: no AudioContext → silent no-op');

  class FakeParam {
    constructor() { this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); }
    linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); }
  }
  class FakeOsc {
    constructor() {
      this.type = null;
      this.frequency = { value: null };
      this.started = null;
      this.stopped = null;
      this.dest = null;
    }
    connect(dest) { this.dest = dest; return dest; }
    start(t) { this.started = t; }
    stop(t) { this.stopped = t; }
  }
  class FakeGain {
    constructor() { this.gain = new FakeParam(); this.dest = null; }
    connect(dest) { this.dest = dest; return dest; }
  }
  class FakeAudioContext {
    constructor() {
      FakeAudioContext.instances.push(this);
      this.state = 'suspended';
      this.currentTime = 10;
      this.resumed = 0;
      this.destination = { tag: 'dest' };
      this.oscs = [];
      this.gains = [];
    }
    resume() { this.resumed += 1; return Promise.resolve(); }
    createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o; }
    createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  }
  FakeAudioContext.instances = [];

  globalThis.AudioContext = FakeAudioContext;
  try {
    errorBeep();
    assert(FakeAudioContext.instances.length === 1,
      'errorBeep: first beep constructs exactly one AudioContext');
    const ctx = FakeAudioContext.instances[0];

    assert(ctx.resumed === 1,
      'errorBeep: a suspended context is resumed before playing');
    assert(ctx.oscs.length === 1 && ctx.gains.length === 1,
      'errorBeep: one oscillator and one gain node per beep');

    const osc = ctx.oscs[0];
    const gain = ctx.gains[0];
    assert(osc.type === 'square', 'errorBeep: oscillator is a square wave');
    assert(osc.frequency.value === 1000, 'errorBeep: ~1 kHz piezo pitch');
    assert(osc.dest === gain && gain.dest === ctx.destination,
      'errorBeep: graph is osc → gain → destination');
    assert(osc.started === 10 && osc.stopped === 10 + 0.125 + 0.01,
      'errorBeep: osc plays from currentTime, stops after dur + tail');

    const labels = gain.gain.events.map((e) => e[0]).join(',');
    assert(labels === 'set,ramp,set,ramp',
      'errorBeep: envelope is attack ramp up then release ramp down');
    assert(gain.gain.events[0][1] === 0 && gain.gain.events[1][1] === 0.12,
      'errorBeep: envelope ramps from silence to the 0.12 peak');
    assert(gain.gain.events[3][1] === 0 && gain.gain.events[3][2] === 10 + 0.125,
      'errorBeep: envelope returns to silence at dur end');

    // Lazy cache: a second beep reuses the one context (no new ctor),
    // adding a fresh oscillator/gain pair to it.
    errorBeep();
    assert(FakeAudioContext.instances.length === 1,
      'errorBeep: second beep reuses the cached context');
    assert(ctx.oscs.length === 2 && ctx.gains.length === 2,
      'errorBeep: each beep builds a fresh oscillator/gain pair');

    // The resume guard only fires while suspended.  Flip the cached
    // context to running: the next beep must NOT call resume again.
    const before = ctx.resumed;
    ctx.state = 'running';
    errorBeep();
    assert(ctx.resumed === before,
      'errorBeep: a running context is not resumed again');
  } finally {
    delete globalThis.AudioContext;
  }
}

{
  const line = '1 2 + `SIN(X)` "a SIN b"  →STR';
  assert(commandWordAt(line, 4) === '+', 'commandWordAt: an operator symbol is a word');
  assert(commandWordAt(line, 8) === 'SIN', 'commandWordAt: stops at ( inside a backtick algebraic');
  assert(commandWordAt(line, line.indexOf('a SIN') + 3) === null, 'commandWordAt: nothing inside a string');
  assert(commandWordAt(line, line.indexOf('  →') + 1) === null, 'commandWordAt: nothing between two spaces');
  assert(commandWordAt(line, line.length) === '→STR', 'commandWordAt: a word at the end of the line');

  const ref = parseCommandReference(readFileSync(new URL('../www/docs/hp50-commands.html', import.meta.url), 'utf8'));
  assert(commandHelpText('sin', ref) === 'SIN — Returns the sine of the argument.',
    'commandHelpText: upper-cased name plus the AUR one-liner');
  assert(commandHelpText('SIN', null) === 'SIN', 'commandHelpText: the bare name before the reference loads');
  assert(commandHelpText('X', ref) === null && commandHelpText('42', ref) === null,
    'commandHelpText: no tooltip for a variable name or a number');
}

/* ================================================================
   Menus: every registered command is reachable from a menu family,
   and every family's category exists in the registry.
   ================================================================ */
{
  const { MENU_FAMILIES, MENU_GROUPS, menuById } = await import('../www/src/ui/menus.js');
  const { familyCommands } = await import('../www/src/ui/drawer.js');
  const { opCategories } = await import('../www/src/rpl/ops.js');
  const reachable = new Set(MENU_FAMILIES.flatMap((f) => familyCommands(f)).map((n) => n.toUpperCase()));
  const missing = allOps().filter((n) => !n.includes('->') && !reachable.has(n.toUpperCase()));
  assert(missing.length === 0, `every registered command is reachable from a menu family${missing.length ? ` (missing ${missing.slice(0, 8).join(' ')})` : ''}`);
  const categories = new Set(Object.keys(opCategories()));
  const unknown = MENU_FAMILIES.filter((f) => f.category !== 'Other' && !categories.has(f.category)).map((f) => f.id);
  assert(unknown.length === 0, `every menu family names a registered category${unknown.length ? ` (${unknown.join(' ')})` : ''}`);
  const grouped = MENU_GROUPS.flatMap((g) => g.ids);
  assert(grouped.every((id) => menuById(id)) && new Set(grouped).size === grouped.length,
    'the menu picker lists each menu once, and every entry resolves');
  assert(MENU_FAMILIES.every((f) => grouped.includes(f.id)), 'the menu picker reaches every command family');
}

/* ================================================================
   UI preferences: validated on load, and the old hp50.ui.* keys
   migrate once into rplai.ui.
   ================================================================ */
{
  const { loadUiPrefs, normalizeUiPrefs, DEFAULT_UI_PREFS, UI_PREFS_KEY } = await import('../www/src/ui/ui-prefs.js');
  const memory = (init = {}) => {
    const data = new Map(Object.entries(init));
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
  };
  assert(JSON.stringify(normalizeUiPrefs({ theme: 'neon', keypad: 'huge', drawer: 'nope', hints: 'yes' })) === JSON.stringify(DEFAULT_UI_PREFS),
    'normalizeUiPrefs: unknown values fall back to the defaults');
  const legacy = memory({ 'hp50.ui.sidePanel': JSON.stringify({ open: true, tab: 'files', historySort: 'oldest', width: 420 }), 'hp50.ui.chrome': 'minimal' });
  const prefs = loadUiPrefs(legacy);
  assert(prefs.minimal === true && prefs.drawer === 'vars' && prefs.lastDrawer === 'vars' && prefs.historySort === 'oldest' && prefs.drawerWidth === 420,
    'loadUiPrefs: the old side-panel and chrome keys migrate (Files tab → Variables drawer, minimal chrome → Minimal view)');
  assert(!legacy.data.has('hp50.ui.sidePanel') && !legacy.data.has('hp50.ui.chrome') && legacy.data.has(UI_PREFS_KEY),
    'loadUiPrefs: migration writes rplai.ui and removes the old keys');
  assert(normalizeUiPrefs({ menu: 'TRIG' }).menu === 'TRIG' && normalizeUiPrefs({ menu: '<b>' }).menu === null,
    'normalizeUiPrefs: the last menu is remembered, junk is dropped');
  assert(loadUiPrefs(memory({ 'hp50.ui.chrome': 'simple' })).keypad === 'compact',
    'loadUiPrefs: the old "simple" chrome becomes the Compact keypad');
  const saved = memory({ [UI_PREFS_KEY]: JSON.stringify({ theme: 'classic' }), 'hp50.ui.chrome': 'minimal' });
  assert(loadUiPrefs(saved).theme === 'classic' && loadUiPrefs(saved).minimal === false,
    'loadUiPrefs: saved rplai.ui wins over leftover legacy keys');
  const { saveUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert(JSON.stringify(loadUiPrefs()) === JSON.stringify(DEFAULT_UI_PREFS), 'loadUiPrefs: blocked site data gives the defaults instead of crashing the app');
    saveUiPrefs(DEFAULT_UI_PREFS);
    assert(true, 'saveUiPrefs: blocked site data is ignored');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
}

{
  const { EquationEditor } = await import('../www/src/ui/equation-editor.js');
  const { MatrixEditor } = await import('../www/src/ui/matrix-editor.js');
  const WRITER_CONTRACT = ['load', 'value', 'clear', 'isEmpty', 'snapshot', 'restore', 'menu', 'focus', 'commit'];
  for (const [id, Writer] of [['equation', EquationEditor], ['matrix', MatrixEditor]]) {
    const missing = WRITER_CONTRACT.filter((name) => typeof Writer.prototype[name] !== 'function');
    assert(!missing.length, `the ${id} writer implements load, value, clear, isEmpty, snapshot, restore, menu, focus and commit${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  }
}

{
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  const defaults = normalizeUiPrefs({});
  assert(defaults.assistantMode === 'ask' && defaults.tutorStyle === 'socratic', 'ui prefs default to Ask mode with a Socratic tutor');
  const saved = normalizeUiPrefs({ assistantMode: 'tutor', tutorStyle: 'direct' });
  assert(saved.assistantMode === 'tutor' && saved.tutorStyle === 'direct', 'ui prefs keep the assistant mode and tutor style');
  const junk = normalizeUiPrefs({ assistantMode: 'shout', tutorStyle: 42 });
  assert(junk.assistantMode === 'ask' && junk.tutorStyle === 'socratic', 'ui prefs drop unknown assistant modes and tutor styles');
}

{
  const { TOUR_STEPS } = await import('../www/src/ui/tour.js');
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const appbar = readFileSync(new URL('../www/src/ui/appbar.js', import.meta.url), 'utf8');
  const missing = TOUR_STEPS.filter(({ target }) => {
    const [id, inner] = target.slice(1).split(' ');
    return !html.includes(`id="${id}"`) || (inner && !appbar.includes(`class="${inner.slice(1)}"`));
  }).map((s) => s.target);
  assert(!missing.length, `every tour step points at markup the app renders${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  assert(normalizeUiPrefs({}).tourSeen === false && normalizeUiPrefs({ tourSeen: true }).tourSeen === true, 'ui prefs remember that the tour was seen');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.keys \{[^}]*flex: 0 1 auto;[^}]*overflow-y: auto/.test(css), 'the keypad shrinks and scrolls instead of covering the work area');
  assert(/\.work \{[^}]*min-height: auto;/.test(css) && !/\.work \{[^}]*overflow: hidden/.test(css), 'the work area never shrinks below its writer and buttons');
  assert(/\.well \{ flex: 1 1 96px;/.test(css) && /@media \(max-height: 780px\) \{\s*\.well \{ flex-basis: 0px;/.test(css), 'the stack gives up room first, with a definite basis so its rows do not inflate the work area');
  assert(/@media \(max-height: 560px\) and \(min-width: 640px\) \{\s*\.app-main \{ flex-direction: row; \}/.test(css), 'a short wide screen puts the keypad beside the work area');
}
