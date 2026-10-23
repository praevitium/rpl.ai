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
import { SOFT_KEYS, NAV_KEYS, ARROW_KEYS, MAIN_KEYS, keyAccessibleName, COMPACT_KEYS, holdToRepeat, hpKeyCode, typedKeyCode } from '../www/src/ui/keyboard.js';
import { allOps } from '../www/src/rpl/ops.js';
import { unitInfo, UNIT_CATALOG, parseUnitExpr, sameDims } from '../www/src/rpl/units.js';
import { MENU_FAMILIES, UNIT_GROUPS, STAT_GROUPS, CAS_GROUPS, MATRIX_GROUPS, unitConversions, customMenuEntry, customMenuLabel } from '../www/src/ui/menus.js';
import { commandWordAt, commandHelpText } from '../www/src/ui/hover-help.js';
import { holdToClear, holdForLines } from '../www/src/ui/input-area.js';
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
  assert(UNIT_GROUPS.length === 16 && new Set(UNIT_GROUPS.map((g) => g.id)).size === 16 && UNIT_GROUPS.every((g) => /^[A-Z]{3,5}$/.test(g.id) && g.title && g.units.length >= 3),
    'UNIT_GROUPS: the HP 50g\'s sixteen groups, with soft key names, titles and at least three units each');
  const menubarGrid = readFileSync(new URL('../www/src/ui/menubar.js', import.meta.url), 'utf8');
  assert(/for \(let i = 0; i < view\.items\.length; i \+= 6\) pages\.push\(view\.items\.slice\(i, i \+ 6\)\.map\(\(slot, k\) => key\(slot, i \+ k\)\)\.join\(''\)\);/.test(menubarGrid) && /\$\{pages\.length > 1 \? `<h6>Page \$\{p \+ 1\}<\/h6>` : ''\}<div class="grid">\$\{keys\}<\/div>/.test(menubarGrid),
    'menus: the whole-menu grid lays each soft-key page out as its own captioned row of six, so it reads as the pages do, with no caption on a one-page menu');
  assert(new Set(unitKeys).size === unitKeys.length, 'UNIT_GROUPS: no unit key appears in two groups');
  const { parseUnitExpr, formatUnitExpr } = await import('../www/src/rpl/units.js');
  const conversions = (u) => unitConversions(parseUnitExpr(u)).map(formatUnitExpr);
  const km = conversions('km');
  assert(km[0] === 'm' && km.includes('mi') && km.includes('ft') && !km.includes('km') && !km.includes('kg') && !km.includes('m^2') && new Set(km).size === km.length,
    'unitConversions: a length lists every length key of the UNITS menu in menu order, itself left out, and nothing of another dimension');
  assert(conversions('kph').join(' ') === 'm/s cm/s ft/s mph knot c' && conversions('N*m').at(-1) === 'kg*m^2/s^2' && conversions('ft/s^2').join(' ') === 'ga m/s^2',
    'unitConversions: a speed keeps to the speed keys, and a unit whose SI base form is no key gets that form last (kg*m^2/s^2 for N*m)');
  assert(conversions('°C').join(' ') === 'K °F °R' && conversions('m^2').includes('acre') && conversions('kg').includes('lb') && conversions('m^3').includes('L'),
    'unitConversions: temperatures, areas, masses and volumes find their menu keys through the dimensions, so m^3 reaches L and gal');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/isUnit\(value\) \? item\('convert', 'chr', 'Convert to…'\) \+ /.test(appSrc) && /case 'convert': this\._convertMenu\(level, anchor\); return;/.test(appSrc)
    && /unitConversions\(value\.uexpr\)/.test(appSrc) && /this\.stack\.push\(Unit\(1, targets\[/.test(appSrc) && /this\.stack\.runOp\(\(\) => lookup\('CONVERT'\)\.fn\(this\.stack, this\.entry\)\); \}, 'CONVERT'\)/.test(appSrc),
    'stack: a unit level\'s ⋯ menu has Convert to…, whose rows show the level in each unit of its dimensions and run CONVERT with a 1 of that unit, so LASTARG and Undo see the HP\'s own command');
  assert(/isMatrix\(value\) && value\.rows\.length === value\.rows\[0\]\?\.length \? item\('inv', 'chr', 'Inverse \(INV\)'\) \+ item\('det', 'chr', 'Determinant \(DET\)'\) \+ item\('egvl', 'chr', 'Eigenvalues \(EGVL\)'\) : ''/.test(appSrc)
    && /isMatrix\(value\) \? item\('trn', 'chr', 'Transpose \(TRN\)'\) \+ item\('rref', 'chr', 'Row reduce \(RREF\)'\) : ''/.test(appSrc)
    && /case 'inv': runOn\('INV'\); return;\s*case 'det': runOn\('DET'\); return;\s*case 'egvl': runOn\('EGVL'\); return;\s*case 'trn': runOn\('TRN'\); return;/.test(appSrc),
    'stack: a matrix level\'s ⋯ menu has Inverse, Determinant and Eigenvalues when it is square, and Transpose, run on the level as its EVAL and →NUM are, as a unit level has Convert to… and a formula Plot');
  assert((appSrc.match(/this\.stack\.runOp\(\(\) => lookup\(op\)\.fn\(this\.stack, this\.entry\)\)/g) || []).length === 2,
    'stack: a level menu\'s EVAL, →NUM, DBUG, →LIST, DUPN and DROPN run through Stack.runOp, so LASTARG gives their arguments as it does for a typed command');
  assert(/onHold: \(anchor\) => this\._heldKeyMenu\(this\._heldUnitOptions\(unit\), anchor, 'Unit'\)/.test(appSrc)
    && /return \[\{ text: `Convert level 1 to \$\{unit\}`, run: \(\) => this\.insertUnit\(unit, 'convert'\) \}, divide\];/.test(appSrc)
    && /const divide = \{ text: `Divide by \$\{unit\}`, run: \(\) => this\.insertUnit\(unit, 'divide'\) \};/.test(appSrc)
    && /onHold: left && \(\(anchor\) => this\._heldKeyMenu\(\[left, right\]\.filter\(Boolean\)\.map\(\(words\) => \(\{ text: words\.join\(' … '\), run: type\(words\) \}\)\), anchor, 'Structures'\)\)/.test(appSrc) && !/_structureMenu/.test(appSrc),
    'units: a finger held on a UNITS soft key offers the shifted key\'s Convert and Divide through the held-key menu a BRCH key\'s structures use');
  assert(/\.\.\.\(isUnit\(value\) \? \[\{ label: 'CONV', title: 'Convert it to another unit \(CONVERT\)', onPress: act\('convert'\) \}\] : \[\]\)/.test(appSrc),
    'stack: a selected unit level\'s soft keys have CONV, which opens the Convert to… list its ⋯ menu has');
  assert(/onHold: dir \? null : \(anchor\) => this\._heldKeyMenu\(\[\{ text: `Store level 1 in \$\{id\}`, run: \(\) => this\.pressVariable\(id, 'L'\) \}, \{ text: `Recall \$\{id\}`, run: \(\) => this\.pressVariable\(id, 'R'\) \}\], anchor, 'Variable'\)/.test(appSrc),
    'variables: a finger held on a variable\'s soft key offers the shifted key\'s Store level 1 and Recall, and a folder\'s key offers nothing');
  assert(/\$\{isUnit\(value\) \? '<button type="button" data-row-act="convert" title="Convert to another unit \(CONVERT\)">Conv<\/button>' : ''\}/.test(appSrc),
    'stack: a selected unit level\'s toolbar has Conv, which opens its Convert to… list as a formula\'s has Plot');
  assert(/items: this\.menuAll, slots: view, page,/.test(appSrc) && /pressMenuSlot\(index\) \{\s*const slot = this\.menuView\(\)\.items\[index\];\s*const page = Math\.floor\(index \/ 6\);/.test(appSrc)
    && /pressSoftKey\(i, forcedLayer = null\) \{\s*if \(this\._answerKey\(hpKeyCode\(`F\$\{i \+ 1\}`, forcedLayer \?\? this\.layer\(\)\)\)\) return;\s*if \(this\._userKey\(`F\$\{i \+ 1\}`, forcedLayer \?\? this\.layer\(\)\)\) return;\s*this\._pressSlot\(this\.menuView\(\)\.slots\[i\], forcedLayer\);/.test(appSrc),
    'menus: a key pressed by its place in the whole menu turns the soft keys to its page and presses through the same path as a soft key');
  const menubarAll = readFileSync(new URL('../www/src/ui/menubar.js', import.meta.url), 'utf8');
  assert(/const held = e\.pointerType === 'touch' && e\.target\.closest\('\[data-mb="next"\]:not\(:disabled\), \[data-mb="pick"\]'\);/.test(menubarAll) && /this\._mbTimer = setTimeout\(\(\) => \{\s*this\._mbHeld = true;\s*this\.app\.buzzHold\(\);\s*if \(button\.dataset\.mb === 'next'\) this\.openAll\(button\);\s*else this\.app\.showLastMenu\(\);\s*\}, LONG_PRESS_MS\);/.test(menubarAll)
    && /if \(this\._mbHeld\) \{ this\._mbHeld = false; return; \}\s*if \(b\.dataset\.mb === 'next'\) this\._nxt\(\);\s*else if \(b\.dataset\.mb === 'pick'\) this\.openPicker\(b\);/.test(menubarAll) && /this\.app\.pressMenuSlot\(Number\(target\.dataset\.v\)\);/.test(menubarAll),
    'menus: a finger held on NXT lays every key of the menu out in a grid, a plain tap still turns the page, and a key tapped in the grid presses by its place');
  assert(!appSrc.includes('showPreviousMenu') && /\/\/ The HP's last menu, for 0 MENU and a finger held on the menu button:[^\n]*\n[^\n]*\n  showLastMenu\(\) \{/.test(appSrc),
    'menus: a finger held on the menu button goes back to the menu shown before, as 0 MENU does, a TMENU menu or a folder included, where it said there was none after a TMENU or inside a folder');
  const gridCss = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/class="\$\{on \? 'on' : ''\}\$\{slot\.dir \? ' dir' : ''\}"/.test(menubarAll) && /\.pop \.grid button\.dir::before \{ content: ""; position: absolute; left: 6px; top: -1px; width: 30%; height: 3px;/.test(gridCss),
    'menus: a folder key in the whole-menu grid wears the tab its soft key does');
  const inputAreaSrc = readFileSync(new URL('../www/src/ui/input-area.js', import.meta.url), 'utf8');
  assert(/showLastLines\(anchor\) \{\s*const lines = \[\.\.\.new Set\(this\.entry\.getHistory\(\)\.reverse\(\)\)\]\.slice\(0, 4\);\s*if \(!lines\.length\) return;\s*this\._heldKeyMenu\(lines\.map\(\(line\) => \(\{ text: line, mark: '', run: \(\) => \(this\.entry\.buffer \? this\.entry\.typeToken\(line\) : this\.entry\.recall\(line\)\) \}\)\), anchor, 'Last lines', \{ className: 'lines' \}\);/.test(appSrc)
    && /holdForLines\(this\.go, app\);/.test(inputAreaSrc) && /<span class="ck">\$\{o\.mark \?\? \(i \? '⇨' : '⇦'\)\}<\/span>/.test(appSrc),
    'command line: a finger held on the Enter beside the line offers the last four lines entered, newest first (the HP\'s CMD), which go back on an empty line or into the line being typed');
  assert(['.bn-f.more-r,', '.bn-f.more-l,', '.bn-f.more-l.more-r,'].every((sel) => gridCss.includes(sel))
    && /\$\('banner'\)\.addEventListener\('scroll', \(e\) => \{ if \(e\.target\.classList\?\.contains\('bn-f'\)\) markScrollEdges\(e\.target\); \}, true\);/.test(appSrc)
    && /el\.innerHTML = lcd \+ errorBannerHtml\(this\.errorBanner\); this\._markBannerEdges\(\);/.test(appSrc),
    'error banner: with the keyboard up its one row of fixes fades at the edge it continues past, as the key strip and drawer tabs do, where a cut chip ended at the banner\'s edge');
  assert(/\.pop\.lines \.opt \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\.pop\.lines \.opt \.ck \{ display: none; \}\s*\.pop\.lines \.opt b \{ font: 500 12\.5px\/1\.35 var\(--font-mono\); white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; \}/.test(gridCss),
    'command line: the last lines wrap up to four rows in the command line\'s face, without the empty mark column, as CHOOSE choices wrap, where a long line ended in an ellipsis');
  assert(/buzzHold\(\) \{\s*if \(this\.prefs\.haptics && typeof navigator\.vibrate === 'function'\) navigator\.vibrate\(20\);/.test(appSrc) && /d\.onRowHold = \(level\) => \{\s*this\.buzzHold\(\);/.test(appSrc) && /showKeyLayers\(key, anchor\) \{\s*this\.buzzHold\(\);/.test(appSrc)
    && /this\._mbHeld = true;\s*this\.app\.buzzHold\(\);/.test(menubarAll) && /t\.done = true;\s*this\.app\.buzzHold\(\);/.test(menubarAll)
    && /setTimeout\(\(\) => \{ this\.app\.buzzHold\(\); begin\(\); \}, LONG_PRESS_MS\)/.test(readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8')) && /press\.selecting = true;\s*this\.app\?\.buzzHold\(\);/.test(readFileSync(new URL('../www/src/ui/equation-editor.js', import.meta.url), 'utf8')),
    'touch: with key vibration on, a held finger buzzes once when it opens a level or soft-key menu, the whole-menu grid or the keypad key layers, starts a Variables drag or a writer selection, or clears the line');
  assert(/UNIT_GROUPS\.map\(\(group\) => \(\{ label: group\.id, dir: true,/.test(appSrc) && /\.pop \.grid button \{[^}]*overflow-wrap: anywhere;/.test(gridCss),
    'menus: the UNITS menu\'s group keys wear the folder tab, as submenu keys do on the HP, and a long name in the whole-menu grid wraps inside its key as it does on a narrow soft key');
  assert(/const TVM_VARIABLES = \['N', 'I%YR', 'PV', 'PMT', 'FV', 'PYR'\];/.test(appSrc) && /TVM: \(\) => TVM_VARIABLES\.map\(\(id\) => this\._solverKey\(id, id === 'PYR' \? null : 'TVMROOT'\)\),/.test(appSrc)
    && /onPress: act\('store'\),\s*onPressL: solve,\s*onPressR: act\('recall'\),/.test(appSrc) && /const solve = root \? act\('solve'\) : null;/.test(appSrc)
    && /if \(inProgramEntry\(this\.entry\.buffer\.slice\(0, this\.entry\.cursor\)\)\) \{ this\.entry\.typeToken\(`\$\{words\} `\); return; \}/.test(appSrc),
    'TVM menu: each variable\'s key stores level 1 in it, ⇦ solves for it (PYR has no solve) and ⇨ recalls it, as the HP\'s solver menus do; inside a program it types the words instead');
  const statNames = allOps().filter((n) => lookup(n).category === 'Statistics');
  const inFolders = STAT_GROUPS.flatMap((g) => g.commands);
  const aliases = ['NSIGMA', 'SX', 'SX2', 'SY', 'SY2', 'SXY', 'MAXS', 'MINS', 'ΣX^2', 'ΣY^2', 'ΣX*Y'];
  assert(STAT_GROUPS.map((g) => g.id).join(' ') === 'DATA ΣPAR 1VAR PLOT FIT SUMS'
    && inFolders.every((n) => statNames.includes(n) || ['BARPLOT', 'HISTPLOT', 'SCATRPLOT'].includes(n)) && statNames.every((n) => inFolders.includes(n) || aliases.includes(n)) && new Set(inFolders).size === inFolders.length,
    `STAT_GROUPS: the folders hold every statistics command once, spelt as the HP spells it, in the HP's folder order, PLOT holding the three statistics plots (missing ${statNames.filter((n) => !inFolders.includes(n) && !aliases.includes(n))})`);
  assert(/STAT: \(\) => this\._groupKeys\(STAT_GROUPS, 'STAT'\),/.test(appSrc)
    && /_groupKeys\(groups, familyId\) \{\s*return groups\.map\(\(group\) => \(\{ label: group\.id, dir: true, .*?onPress: \(\) => this\._showGroupMenu\(group, familyId\) \}\)\);/.test(appSrc)
    && /_showGroupMenu\(group, familyId\) \{\s*const back = \{ label: '◀ BACK', title: `Back to the \$\{menuById\(familyId\)\.title\} menu`, onPress: \(\) => this\._showFamilyMenu\(familyId\) \};\s*this\.setMenu\(\[back, \.\.\.group\.commands\.map\(\(name\) => this\._commandSlot\(name\)\)\], familyId, \{ folder: group\.id \}\);/.test(appSrc),
    'STAT menu: it opens on the HP\'s folders, DATA, ΣPAR, 1VAR, PLOT, FIT and SUMS, whose keys run, type and look up their commands as the flat list\'s do, with a BACK key');
  const casNames = allOps().filter((n) => lookup(n).category === 'CAS / symbolic');
  assert(CAS_GROUPS.map((g) => g.id).join(' ') === 'ALG CALC S.SLV TRIG EXP&LN'
    && CAS_GROUPS[0].commands.join(' ') === 'COLLECT EXPAND FACTOR LNCOLLECT LIN PARTFRAC SOLVE SUBST TEXPAND'
    && CAS_GROUPS.every((g) => g.commands.every((n) => casNames.includes(n) && new Set(g.commands).size === g.commands.length))
    && /CAS: \(\) => this\._groupKeys\(CAS_GROUPS, 'CAS'\),/.test(appSrc),
    `CAS menu: it opens on folders after the HP's CAS menus, ALG as the HP has it (COLLECT EXPAND FACTOR LNCOLLECT LIN PARTFRAC SOLVE SUBST TEXPAND), then CALC, S.SLV, TRIG and EXP&LN, every key a CAS command, so a phone reaches algebra in two taps instead of paging through nine (unknown ${CAS_GROUPS.flatMap((g) => g.commands).filter((n) => !casNames.includes(n))})`);
  assert(/this\.menuFolder = folder;/.test(appSrc)
    && /const inside = this\.menuFolder \?\? \(meta\.short === 'VARS' \? currentPath\(\)\.at\(-1\) : null\);\s*return \{ title: inside \? `\$\{meta\.short\} · \$\{inside\}` : meta\.short, short: this\.menuFolder \?\? meta\.short,/.test(appSrc)
    && /this\.setMenu\(\[back, \.\.\.keys\], 'UNITS', \{ folder: group\.id \}\);/.test(appSrc)
    && /this\.setMenu\(\[back, \.\.\.group\.commands\.map\(\(name\) => this\._commandSlot\(name\)\)\], 'BASE', \{ folder: group\.id \}\);/.test(appSrc),
    'menu button: inside a folder it names the folder (TRIG · HYP, or HYP where it is short), as VARS names its directory, where it named only the family');
  {
    const { TRIG_GROUPS } = await import('../www/src/ui/menus.js');
    assert(TRIG_GROUPS.map((g) => `${g.id}: ${g.commands.join(' ')}`).join(' / ') === 'HYP: SINH ASINH COSH ACOSH TANH ATANH EXPM LNP1'
      && TRIG_GROUPS.every((g) => g.commands.every((n) => lookup(n)))
      && /TRIG: \(\) => this\._groupKeys\(TRIG_GROUPS, 'TRIG'\),/.test(appSrc),
      'TRIG menu: it opens on the HP\'s MTH HYP folder, in its order with EXPM and LNP1, where the hyperbolics sat on the third page');
  }
  {
    const { INTEGER_GROUPS } = await import('../www/src/ui/menus.js');
    const intFamily = MENU_FAMILIES.find((f) => f.id === 'INTEGER');
    assert(INTEGER_GROUPS.map((g) => `${g.id}: ${g.commands.join(' ')}`).join(' / ') === 'INTEG: EULER IABCUV ICHINREM IDIV2 IEGCD IQUOT IREMAINDER ISPRIME? NEXTPRIME PA2B2 PREVPRIME / MODUL: ADDTMOD DIVMOD DIV2MOD EXPANDMOD FACTORMOD GCDMOD INVMOD MOD MODSTO MULTMOD POWMOD SUBTMOD'
      && INTEGER_GROUPS.every((g) => g.commands.every((n) => lookup(n))) && intFamily.keys.join(' ') === 'DIVIS FACTORS PROPFRAC'
      && /INTEGER: \(\) => this\._groupKeys\(INTEGER_GROUPS, 'INTEGER'\),/.test(appSrc),
      'INTGR menu: it opens on the HP\'s ARITH folders INTEG and MODUL, in its order, then DIVIS, FACTORS and PROPFRAC, where 30 keys ran over five pages');
    assert(/const modulusNote = \(\) => `The modular commands work modulo \$\{getCasModulo\(\)\}`;/.test(appSrc)
      && /: name === 'MODSTO' \? modulusNote : null;/.test(appSrc)
      && /if \(group\.commands\.includes\('MODSTO'\)\) this\.toast\(`\$\{modulusNote\(\)\}; MODSTO sets it\.`, \{ key: 'modulus', transient: true \}\);/.test(appSrc),
      'MODUL folder: on a phone, which shows no CAS modes, opening it says the modulus the modular commands use, and the MODSTO key says the new one with Undo');
  }
  {
    const { LIST_GROUPS } = await import('../www/src/ui/menus.js');
    const listFamily = MENU_FAMILIES.find((f) => f.id === 'LIST');
    assert(LIST_GROUPS.map((g) => `${g.id}: ${g.commands.join(' ')}`).join(' / ') === 'ELEM: GET GETI PUT PUTI SIZE POS HEAD TAIL / PROC: DOLIST DOSUBS NSUB ENDSUB STREAM REVLIST ADD SORT SEQ / CHARS: SUB REPL POS SIZE NUM CHR OBJ→ →STR HEAD TAIL SREPL'
      && LIST_GROUPS.every((g) => g.commands.every((n) => lookup(n))) && listFamily.keys.join(' ') === 'OBJ→ →LIST SUB REPL'
      && /LIST: \(\) => this\._groupKeys\(LIST_GROUPS, 'LIST'\),/.test(appSrc),
      'LIST menu: it opens on the HP\'s PRG LIST folders ELEM and PROC and its PRG CHARS string commands, then OBJ→ →LIST SUB REPL, where 35 keys ran over six pages');
  }
  const matrixFamily = MENU_FAMILIES.find((f) => f.id === 'MATRIX');
  assert(MATRIX_GROUPS.map((g) => g.id).join(' ') === 'MAKE NORM FACTR COL ROW' && matrixFamily.keys.join(' ') === 'LSQ'
    && MATRIX_GROUPS.every((g) => g.commands.every((n) => lookup(n)))
    && /MATRIX: \(\) => this\._groupKeys\(MATRIX_GROUPS, 'MATRIX'\),/.test(appSrc),
    'MATRIX menu: it opens as the HP\'s MTH MATR does, MAKE NORM FACTR COL ROW folders and then LSQ, every folder key a registered command, so a phone reaches a column or a factorization in two taps');
  assert(/const SIGMA_DATA_KEYS = \['Σ\+', 'Σ-', 'CLΣ', 'STOΣ'\];/.test(appSrc) && /const note = SIGMA_DATA_KEYS\.includes\(name\) \? \(\) => sigmaDataNote\(varRecall\('ΣDAT'\)\) :/.test(appSrc)
    && /onPress: \(\) => \(note \? this\._runNotedKey\(name, note\) :/.test(appSrc)
    && /_runNotedKey\(name, note\) \{\s*const mark = this\.stack\.undoMark\(\);\s*this\.runCommandFromUI\(name, \{ asKey: true \}\);\s*if \(this\.stack\.undoMark\(\) === mark \|\| this\.entry\.error\) return;\s*this\.undoToast\(note\(\)\);/.test(appSrc)
    && /return points \? `ΣDAT: \$\{points\} point\$\{points === 1 \? '' : 's'\}` : 'ΣDAT is empty';/.test(appSrc),
    'STAT menu: a Σ+, Σ-, CLΣ or STOΣ key that ran says how many points ΣDAT holds now, with Undo, since the stack alone shows nothing; typed into a program or failing, it says nothing');
  {
    const { BASE_KEYS, BASE_GROUPS, menuById, MENU_GROUPS } = await import('../www/src/ui/menus.js');
    const names = [...BASE_KEYS.filter((k) => !BASE_GROUPS.some((g) => g.id === k)), ...BASE_GROUPS.flatMap((g) => g.commands)];
    assert(BASE_KEYS.join(' ') === 'HEX DEC OCT BIN R→B B→R LOGIC BIT BYTE STWS RCWS' && BASE_GROUPS.map((g) => `${g.id}: ${g.commands.join(' ')}`).join(' / ') === 'LOGIC: AND OR XOR NOT / BIT: RL SL ASR SR RR / BYTE: RLB SLB SRB RRB'
      && names.every((n) => lookup(n)) && menuById('BASE') && MENU_GROUPS.find((g) => g.title === 'Math').ids.includes('BASE')
      && /else if \(id === 'BASE'\) this\.showBaseMenu\(\);/.test(appSrc) && /const back = \{ label: '◀ BACK', title: 'Back to the BASE menu', onPress: \(\) => this\.showBaseMenu\(\) \};/.test(appSrc),
      'BASE menu: the HP\'s HEX DEC OCT BIN R→B B→R, then its LOGIC, BIT and BYTE folders, each with a BACK key, and STWS and RCWS, all registered commands, in the picker\'s Math group');
  }
  assert(/const SHORT_WINDOW = globalThis\.matchMedia\?\.\('\(max-height: 575px\) and \(max-width: 639px\)'\);/.test(appSrc)
    && /keypadLayout\(\) \{\s*const short = this\.inputMode === 'rpl' \? SHORT_WINDOW : SHORT_FOR_WRITER;\s*return this\.prefs\.keypad === 'full' && short\?\.matches \? 'compact' : this\.prefs\.keypad;/.test(appSrc)
    && /SHORT_WINDOW\?\.addEventListener\('change', \(\) => this\.keypad\.update\(\)\);/.test(appSrc)
    && /this\.compact = app\.keypadLayout\(\) === 'compact';/.test(readFileSync(new URL('../www/src/ui/keyboard.js', import.meta.url), 'utf8')),
    'keypad: a window with the keypad under the stack and under 576 px tall shows the compact keypad while the setting stays Full, where the full keypad left a 412x457 split screen 18 px of stack');
  {
    const { MENU_FAMILIES } = await import('../www/src/ui/menus.js');
    const prob = MENU_FAMILIES.find((f) => f.id === 'PROB');
    assert(prob.keys.join(' ') === 'COMB PERM ! RAND RDZ UTPC UTPF UTPN UTPT NDIST' && prob.keys.every((n) => lookup(n)),
      'PROB menu: the HP\'s MTH PROB keys in its order, COMB PERM ! RAND RDZ, then UTPC UTPF UTPN UTPT and NDIST, where ! RAND and RDZ were only in ARITH');
  }
  {
    const { TIME_GROUPS } = await import('../www/src/ui/menus.js');
    assert(TIME_GROUPS.map((g) => `${g.id}: ${g.commands.join(' ')}`).join(' / ') === 'ALRM: ACK ACKALL STOALARM RCLALARM DELALARM FINDALARM'
      && TIME_GROUPS[0].commands.every((n) => lookup(n)) && /TIME: \(\) => this\._groupKeys\(TIME_GROUPS, 'TIME'\),/.test(appSrc),
      'TIME menu: an ALRM folder of the HP\'s alarm commands leads the clock keys');
    const { KEY_LABELS } = await import('../www/src/ui/menus.js');
    assert(TIME_GROUPS[0].commands.map((n) => KEY_LABELS[n] ?? n).join(' ') === 'ACK ACKAL STOAL RCLAL DELAL FINDA'
      && /label: KEY_LABELS\[name\] \?\? name,\s*command: name,/.test(appSrc),
      'ALRM keys: the HP\'s five-letter faces, where STOALARM broke across a phone key as STOA and LARM; the key still runs and types the full name');
    assert(KEY_LABELS.VANDERMONDE === 'VANDE' && MATRIX_GROUPS.find((g) => g.id === 'MAKE').commands.includes('VANDERMONDE'),
      'MAKE folder: VANDERMONDE shows the HP\'s face VANDE, where a 280 px phone broke it over three lines as VAND, ERMO and NDE');
    assert(/const wait = msToNextAlarm\(\);\s*if \(wait !== null\) this\._alarmTimer = setTimeout\(\(\) => this\._watchAlarms\(\), Math\.min\(wait \+ 20, ALARM_WAIT_MAX_MS\)\);/.test(appSrc)
      && /const fresh = document\.visibilityState === 'visible' && calculatorNow\(\) - alarm\.due < ALARM_FRESH_MS;\s*if \(fresh && !quiet && !testUserFlag\(-57\)\) \{\s*alarmBeep\(\);/.test(appSrc)
      && /action: 'ACK', onAction: acknowledgeOldest, key: 'alarm', timeout: Infinity, transient: true/.test(appSrc)
      && /this\._watchAlarms\(\);[\s\S]{0,40}document\.addEventListener\('visibilitychange', \(\) => \{ this\._watchAlarms\(\);/.test(appSrc),
      'alarms come due while the app is open: a timer to the next one, a note with ACK, a buzz and tone unless flag -57 is set, and one missed while closed or hidden shown as past due');
    const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
    const cssSrc = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
    assert(/const alarmMark = alarm \? `<button type="button" class="\$\{minimal \|\| classic \? 'ann-m' : 'pill'\} alarm" data-status="alarm"/.test(displaySrc)
      && /\$\{layerMark\}\$\{haltMark\}\$\{userMark\}\$\{alarmMark\}\$\{editMark\}/.test(displaySrc) && /if \(alarm\) pills\.push\(alarmMark\);/.test(displaySrc)
      && /alarm: !!pastDueAlarm\(\),/.test(appSrc) && /else if \(kind === 'alarm'\) \{ this\._alarmShown = null; this\._showAlarm\(\{ quiet: true \}\); \}/.test(appSrc)
      && /\.ann-status:has\(\.ann-m\.e, \.ann-m\.halt, \.ann-m\.alarm, \.ann-m\.user\) \{ padding-left: 2px; padding-right: 2px; \}/.test(cssSrc),
      'alert annunciator: ((•)) in the status line while an alarm is past due, as on the HP, a tap bringing its note back without the buzz; at 280 px in minimal view it fits beside the six modes and the leave button, which it had pushed 2 px off screen');
    assert(/this\._alarmShown = id;\s*this\.renderStatus\(\);\s*\/\/[^\n]*\n\s*\(alarm \? navigator\.setAppBadge\?\.\(\) : navigator\.clearAppBadge\?\.\(\)\)\?\.catch\(\(\) => \{\}\);/.test(appSrc),
      'alarm badge: the installed app\'s icon carries a dot while an alarm is past due and loses it on ACK, where the badge API is there');
    assert(/const userMark = user \? `<span class="\$\{minimal \|\| classic \? 'ann-m' : 'pill'\} user"/.test(displaySrc) && /if \(user\) pills\.push\(userMark\);/.test(displaySrc)
      && /user: testUserFlag\(-62\) && \(this\._userOnce \? '1USR' : 'USER'\),/.test(appSrc) && /if \(!standard && this\._userKey\(key\.primary\)\) return;/.test(appSrc)
      && /if \(key\.kind !== 'alpha' \|\| this\.layer\(\) !== 'L'\) this\.setShift\(key\.kind\);\s*else if \(!this\._answerKey\(hpKeyCode\('α', 'L'\)\)\) this\.toggleUser\(\);/.test(appSrc)
      && /if \(on && !this\._userOnce\) \{ clearUserFlag\(-62\); return; \}\s*this\._userOnce = !on && !testUserFlag\(-61\);\s*setUserFlag\(-62\);/.test(appSrc)
      && /if \(this\._userOnce\) clearUserFlag\(-62\);/.test(appSrc)
      && /mk\('α',   \{ className: 'alpha-key', kind: 'alpha', shiftL: 'USER' \}\),/.test(readFileSync(new URL('../www/src/ui/keyboard.js', import.meta.url), 'utf8'))
      && /\.kp\[data-layer="L"\] \.k\.alp \.p\.lay \{ color: #04121f; \}/.test(cssSrc)
      && /if \(obj\) return isName\(obj\) && obj\.id === 'SKEY' \? null : obj;\s*return standardKeysActive\(\) \|\| primary === 'ON' \? null : false;/.test(appSrc)
      && /if \(obj === null\) return false;\s*if \(obj\) this\._runKeyObject\(obj, customMenuLabel\(obj\)\);/.test(appSrc)
      && /:root\[data-theme="classic"\] \.status-line:has\(\.ann-m\.user\) \.ann-g > span:not\(\.on\) \{ display: none; \}/.test(cssSrc),
      'USER mode: with flag -62 set a keypad or soft key ASN assigned runs its object as a CST key does, SKEY and unassigned keys keep their action unless S DELKEYS took it (ON always keeps it), and a USER annunciator shows in every look, Classic\'s dim annunciators giving it room on a phone; ↰α is ⇨USER, 1USR for one key with flag -61 clear, then locked, then off, locked at once with -61 set, and a key a program waits for when one does');
  }
  {
    const { VECTOR_KEYS, menuById, MENU_GROUPS } = await import('../www/src/ui/menus.js');
    const math = MENU_GROUPS.find((g) => g.title === 'Math').ids;
    assert(VECTOR_KEYS.join(' ') === 'ABS DOT CROSS V→ →V2 →V3 RECT CYLIN SPHERE' && VECTOR_KEYS.every((n) => lookup(n))
      && menuById('VECTOR')?.short === 'VECTR' && math.indexOf('VECTOR') === math.indexOf('MATRIX') + 1
      && /else if \(id === 'VECTOR'\) this\.setMenu\(VECTOR_KEYS\.map\(\(key\) => this\._commandSlot\(key\)\), 'VECTOR'\);/.test(appSrc),
      'VECTOR menu: the HP\'s MTH VECTR keys, ABS DOT CROSS V→ →V2 →V3 and the RECT CYLIN SPHERE modes (marked while on), after MATRIX in the picker\'s Math group');
  }
  {
    const { MENU_FAMILIES } = await import('../www/src/ui/menus.js');
    const cplx = MENU_FAMILIES.find((f) => f.id === 'CPLX');
    assert(cplx.keys.join(' ') === 'RE IM C→R R→C ABS ARG SIGN NEG CONJ C→P P→C CMPLX RECT CYLIN SPHERE CMPLX?' && cplx.keys.every((n) => lookup(n))
      && /const slots = \[\.\.\.keys, \.\.\.familyCommands\(family\)\.filter\(\(name\) => !keys\.includes\(name\)\)\]\.map/.test(appSrc),
      'CMPLX menu: the HP\'s RE IM C→R R→C ABS ARG / SIGN NEG CONJ first, ABS, SIGN and NEG from Arithmetic included, then the coordinate modes, with the rest of the family after its keys');
  }
  {
    const { MENU_FAMILIES } = await import('../www/src/ui/menus.js');
    const logic = MENU_FAMILIES.find((f) => f.id === 'LOGIC');
    assert(logic.keys.join(' ') === '== ≠ < > ≤ ≥ AND OR XOR NOT SAME TYPE SF CF FS? FC? FS?C FC?C' && logic.keys.every((n) => lookup(n)),
      'LOGIC menu: the HP\'s PRG TEST pages, == ≠ < > ≤ ≥ / AND OR XOR NOT SAME TYPE / SF CF FS? FC? FS?C FC?C, where the ASCII forms <> <= >= split < from > across pages');
  }
  {
    const { MENU_FAMILIES } = await import('../www/src/ui/menus.js');
    const types = MENU_FAMILIES.find((f) => f.id === 'TYPES');
    assert(types.keys.join(' ') === 'OBJ→ →ARRY →LIST →STR →TAG →UNIT C→R R→C NUM CHR DTAG EQ→ TYPE VTYPE' && types.keys.every((n) => lookup(n)),
      'TYPES menu: the HP\'s PRG TYPE keys, OBJ→ →ARRY →LIST →STR →TAG →UNIT / C→R R→C NUM CHR DTAG EQ→ / TYPE VTYPE, so a phone converts between types from one menu');
    const time = MENU_FAMILIES.find((f) => f.id === 'TIME');
    assert(time.flagKeys.map(([flag, label]) => `${label}${flag}`).join(' ') === 'CLK-40 24H-41 D.M.Y-42'
      && /const flagKeys = \(family\.flagKeys \?\? \[\]\)\.map\(\(key\) => this\._flagKey\(\.\.\.key\)\);/.test(appSrc)
      && /on: \(\) => testUserFlag\(flag\),\s*onPress: \(\) => \{\s*if \(this\.entry\._typingAtCursor\(\)\) this\.entry\.typeToken\(`\$\{command\(\)\} `\);\s*else \(testUserFlag\(flag\) \? clearUserFlag : setUserFlag\)\(flag\);/.test(appSrc),
      'TIME menu: CLK, 24H and D.M.Y keys after the commands show the clock in the status line and set the HP\'s clock and date formats (flags -40, -41 and -42), marked while set, and type -41 SF or CF inside a program');
  }
  assert(/const MODE_KEYS = Object\.freeze\(\{\s*DEG: \['angle', 'DEG'\], RAD: \['angle', 'RAD'\], GRAD: \['angle', 'GRD'\], GRD: \['angle', 'GRD'\],\s*RECT: \['coordMode', 'RECT'\], CYLIN: \['coordMode', 'CYLIN'\], SPHERE: \['coordMode', 'SPHERE'\], CMPLX: \['complexMode', true\],\s*HEX: \['binaryBase', 'h'\], DEC: \['binaryBase', 'd'\], OCT: \['binaryBase', 'o'\], BIN: \['binaryBase', 'b'\],/.test(appSrc)
    && /\.\.\.\(mode && \{ toggle: true, on: \(\) => calcState\[mode\[0\]\] === mode\[1\] \}\),/.test(appSrc),
    'mode keys: DEG, RAD, GRAD, RECT, CYLIN, SPHERE, CMPLX, HEX, DEC, OCT and BIN keys in any command menu mark the mode in force, as the HP\'s DEG■ and HEX■ do');
  assert(/@container app \(max-width: 319px\) \{\s*\.ann-status \{ padding-left: 6px; padding-right: 4px; \}\s*\/\*[^*]*\*\/\s*\.ann-status:has\(\.ann-m\.e, \.ann-m\.halt, \.ann-m\.alarm, \.ann-m\.user\) \{ padding-left: 2px; padding-right: 2px; \}/.test(gridCss),
    'minimal view: with a level being edited, the status line gives up its side padding under 320 px, so the amber pencil no longer pushes the leave button 2 px off a 280 px screen');
  assert(unitKeys.every((key) => { try { return isUnit(parseEntry(`1_${key}`)[0]); } catch { return false; } }),
    'UNIT_GROUPS: every key makes a unit object when attached to a number');
  const ONE_QUANTITY = ['LENG', 'AREA', 'VOL', 'FORCE', 'ENRG', 'POWR', 'PRESS', 'TEMP'];
  const mixed = UNIT_GROUPS.filter((g) => ONE_QUANTITY.includes(g.id) && !g.units.every((key) => sameDims(parseUnitExpr(key), parseUnitExpr(g.units[0])))).map((g) => g.id);
  assert(mixed.length === 0, `UNIT_GROUPS: the keys of a length, area, volume, force, energy, power, pressure or temperature group all measure it (got ${mixed})`);
  const ALIASES_OF_KEYS = ['ohm', 'l', 'degC', 'degF', 'degR', 'lyr', 'cu'];
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

  // Pure stack mutations (▶ SWAP, interactive-
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
    e._snapForUndo();                 // what swapTop should do
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
    assert(flashed === 'TYPEDBAD: -: Bad argument type' && s.depth === 4 && format(s.peek(1)) === '"a"',
      'a failing typed program name is blamed in the error, and - gets its 1 and "a" back, as on the HP');
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
    clampLevel, rollLevel, rollDownToLevel, dropLevel, keepLevels, moveLevel, replaceLevel,
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

  // keepLevels keeps levels 1..n and drops everything above them.
  {
    const s = new Stack();
    s.push(Real(10)); s.push(Real(20)); s.push(Real(30)); s.push(Real(40));
    keepLevels(s, 2);
    const top = s.snapshot();
    assert(s.depth === 2 && top[0].value.eq(40) && top[1].value.eq(30), 'keepLevels: keeps levels 1 and 2, drops 3 and 4');
    let emits = 0;
    const off = s.subscribe(() => { emits++; });
    keepLevels(s, 2);
    off();
    assert(s.depth === 2 && emits === 0, 'keepLevels: keeping every level changes nothing');
    assertThrows(() => keepLevels(s, 3), null, 'keepLevels: a level past the depth throws');
  }

  // A pinch in VIEW zooms the value between 0.4x and 4x.
  {
    const { clampViewZoom } = await import('../www/src/ui/sheets.js');
    assert(clampViewZoom(1.5) === 1.5, 'VIEW zoom: an in-range pinch passes through');
    assert(clampViewZoom(9) === 4 && clampViewZoom(0.1) === 0.4, 'VIEW zoom: a pinch stops at 4x and 0.4x');
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
  d.renderStatus({ editing: 'PF' });
  assert(statusLine.innerHTML.includes('EDITING PF'), 'renderStatus: editing a variable names it in the pill');
  d.renderStatus({ minimal: true, editing: 3 });
  assert(/<button type="button" class="ann-m e" data-status="cancel-edit"[^>]*>.*3<\/button>/.test(statusLine.innerHTML),
    'renderStatus: minimal view marks a level edit with a button that cancels it');
  d.renderStatus({ classic: true, minimal: true, editing: 3 });
  assert(/<button type="button" class="ann-m e" data-status="cancel-edit"[^>]*>.*3<\/button><div class="ann-path">/.test(statusLine.innerHTML),
    'renderStatus: the Classic LCD header marks a level edit with the same cancel button, before the path (it showed nothing: its renderer returned before the pencil or the pill were built)');
  d.renderStatus({ classic: true, editing: 'PF' });
  assert(/aria-label="Cancel editing PF"/.test(statusLine.innerHTML), 'renderStatus: Classic full view marks a variable edit the same way');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/:root\[data-theme="classic"\] \.status-line :is\(\.ann-m\.e, \.ann-m\.alarm, \.ann-m\.user\) \{ font: inherit; color: #7a4a00; padding: 0 2px; \}/.test(css)
    && /:root\[data-theme="classic"\]:not\(\[data-view="minimal"\]\) \.status-line :is\(\.ann-m\.e, \.ann-m\.alarm, \.ann-m\.user\) \{ height: 11px; min-height: 0; min-width: 0; \}/.test(css)
    && /@container app \(max-width: 319px\) \{ :root\[data-theme="classic"\] \.status-line:has\(\.ann-m\.e\):has\(\.ann-g\.opt:not\(\[data-mode\]\) > \.on\) \.ann-g\[data-mode="exact"\] \{ display: none; \} \}/.test(css)
    && /:root\[data-theme="classic"\] \.ann-g\[role="button"\]::before, :root\[data-theme="classic"\] \.status-line :is\(\.ann-m\.e, \.ann-m\.alarm\)::before \{ content: ""; position: absolute; inset: -14px -7px; \}/.test(css),
    "renderStatus: Classic's pencil is header-sized in full view and finger-sized in minimal view, and under 320 px with HALT lit too the = annunciator gives way (the Leave button ran 5 px off a 280 px screen); in full view the 11 px pencil takes the finger-sized tap the Classic mode annunciators have");
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
   "alpha a..z runs along the keypad's rows" invariant.
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

  // Soft row: F1..F6, all menu-styled op keys with a handler; the menu bar holds them, so no letters.
  assert(SOFT_KEYS.map(k => k.primary).join(',') === 'F1,F2,F3,F4,F5,F6',
                                     'keyboard: SOFT_KEYS primaries are F1..F6 in order');
  assert(SOFT_KEYS.every(k => k.alpha === ''),
                                     'keyboard: SOFT_KEYS carry no alpha letters');
  assert(SOFT_KEYS.every(k => k.kind === 'op' && k.className === 'menu' && typeof k.action === 'function'),
                                     'keyboard: SOFT_KEYS are menu-class op keys, each with an action');

  // Nav block: the renamed HOME/VARS/STO/RCL + PREV/NEXT paging.
  assert(NAV_KEYS.map(k => k.primary).join(',') === 'VARS,PREV,NEXT,HOME,STO,RCL',
                                     'keyboard: NAV_KEYS primaries in row-major order');
  assert(NAV_KEYS.map(k => k.alpha).join('') === 'abcghi',
                                     'keyboard: NAV_KEYS alpha letters are a, b, c and g, h, i');

  // Arrow cluster: CST + 4-way diamond + CAT, each distinctly kinded and
  // CSS-positioned (the className drives the inverted-T placement).
  assert(ARROW_KEYS.map(k => k.primary).join(',') === 'CST,▲,CAT,◀,▶,▼',
                                     'keyboard: ARROW_KEYS primaries are CST/▲/CAT/◀/▶/▼');
  assert(ARROW_KEYS.map(k => k.kind).join(',') === 'menu,arrow,cat,arrow,arrow,arrow',
                                     'keyboard: ARROW_KEYS kinds (CST menu, CAT catalog, four arrows)');
  assert(ARROW_KEYS.every(k => k.className.length > 0),
                                     'keyboard: every arrow-cluster key has a positioning className');

  // The header invariant: alpha a..z runs along the keypad as it is laid out,
  // a..f across the top row (VARS PREV NEXT CST ▲ CAT), g..l across the second
  // (HOME STO RCL ◀ ▼ ▶), then m..z on the main keys, with ÷=z.
  const [V, P, N, H, S, R] = NAV_KEYS;
  const [CST, UP, CAT, LEFT, RIGHT, DOWN] = ARROW_KEYS;
  const onScreen = [V, P, N, CST, UP, CAT, H, S, R, LEFT, DOWN, RIGHT, ...MAIN_KEYS];
  const alphaSeq = onScreen.map(k => k.alpha).filter(a => a !== '');
  assert(alphaSeq.join('') === 'abcdefghijklmnopqrstuvwxyz',
                                     'keyboard: alpha labels form a..z along the keypad rows');
  assert(onScreen.slice(0, 12).every(k => k.alpha),
                                     'keyboard: every key of the top two rows types a letter');
  assert(new Set(alphaSeq).size === 26,
                                     'keyboard: the 26 alpha letters are unique');
  const zKey = MAIN_KEYS.find(k => k.alpha === 'z');
  assert(zKey && zKey.primary === '÷',
                                     'keyboard: the z alpha key is ÷');

  // The compact keypad: six by five, the RPN essentials, and a..z along its rows under α.
  assert(COMPACT_KEYS.length === 30, 'keyboard: the compact keypad is 6 x 5 keys');
  assert(COMPACT_KEYS.map(k => k.primary).join(' ') === '↰ ↱ α ` UNDO ⌫ SWAP 7 8 9 yˣ ÷ DROP 4 5 6 √x × +/- 1 2 3 1/x − EEX 0 . SPC ENTER +',
                                     'keyboard: the compact keypad keeps the RPN essentials in reading order');
  assert(COMPACT_KEYS.every(k => Object.keys(k).length === mkFields.length && mkFields.every(f => f in k)),
                                     'keyboard: every compact key has exactly the 9 mk fields');
  assert(COMPACT_KEYS.map(k => k.alpha).filter(Boolean).join('') === 'abcdefghijklmnopqrstuvwxyz',
                                     'keyboard: under alpha the compact keys run a..z along the rows');
  assert(COMPACT_KEYS.filter(k => !k.alpha).map(k => k.primary).join(' ') === 'α ⌫ SPC ENTER',
                                     'keyboard: α, ⌫, SPC and ENTER keep their work under alpha');
  const seven = COMPACT_KEYS.find(k => k.primary === '7');
  assert(seven.shiftL === 'SIN' && seven.shiftR === 'ASIN' && typeof seven.shiftLAction === 'function',
                                     'keyboard: the compact 7 carries SIN and ASIN on its shifts');

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
  const shifts = (keys, d) => { const k = keys.find(k => k.primary === d); return `${k.shiftL || '-'}/${k.shiftR || '-'}`; };
  assert(['7', '8', '9', '4', '5', '6', '1', '2', 'ON'].map(d => shifts(MAIN_KEYS, d)).join(' ')
           === 'S.SLV/- EXP&LN/TVM TRIG/| CALC/ALG MATRX/STAT -/UNITS ARITH/CMPLX DEF/- CONT/OFF',
    'keyboard: the digit keys carry the HP 50g shifted menus, DEF and OFF');
  const opened = [];
  const menuApp = { openMenu: (...at) => opened.push(at.filter(Boolean).join('/')) };
  for (const d of ['7', '8', '9', '4', '5', '6', '1']) {
    const k = MAIN_KEYS.find(k => k.primary === d);
    k.shiftLAction?.(null, null, menuApp);
    if (d !== '9') k.shiftRAction?.(null, null, menuApp);
  }
  assert(opened.join(' ') === 'CAS/S.SLV CAS/EXP&LN TVM CAS/TRIG CAS/CALC CAS/ALG MATRIX STAT UNITS ARITH CPLX',
    'keyboard: the shifted digit keys open their menus and CAS folders');
  assert(['4', '5', '6', '1'].map(d => shifts(COMPACT_KEYS, d)).join(' ') === 'CALC/ALG MATRX/- -/UNITS ARITH/-',
    'keyboard: the compact keypad keeps only the ↰ menus on its crowded 5 and 1');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(MAIN_KEYS.find(k => k.primary === '4').shiftLAction.opensMenu === true
           && /const shifted = \{ L: key\.shiftLAction, R: key\.shiftRAction \}\[this\.layer\(\)\];\s*if \(shifted\?\.opensMenu\)/.test(appSrc)
           && /openMenu\(family, folder\) \{[\s\S]*?this\._menuPinned = !!this\.writerMenuId\(\);\s*this\._showGroupMenu/.test(appSrc),
    'keyboard: with a writer open a shifted menu key opens its menu over the writer\'s own, where the writer said the face was unavailable');
  assert(/setOpenHook\([\s\S]*?this\.openMenu\(family, folder\);/.test(readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8')),
    'keyboard: the HP menu commands and the shifted menu keys open menus the same way');
  assert(/\.k \.l, \.k \.r \{[^}]*zoom: var\(--corner-zoom, 1\)/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8'))
           && /_fitCorners\(\) \{[\s\S]*?setProperty\('--corner-zoom'/.test(readFileSync(new URL('../www/src/ui/keyboard.js', import.meta.url), 'utf8')),
    'keyboard: shift labels shrink together until each key\'s pair fits');

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
    editing.type('« 1');
    down.shiftLAction(editing);
    assert(editing.buffer === '« 1 SST ',
      'SST key types the name inside a program on the command line');
  } finally {
    resetHome();
  }
}

{
  const { setUserFlag, clearUserFlag } = await import('../www/src/rpl/state.js');
  const { Entry } = await import('../www/src/ui/entry.js');
  const spc = MAIN_KEYS.find((k) => k.primary === 'SPC');
  const typed = () => {
    const e = new Entry(new Stack());
    e.type('(1');
    spc.shiftRAction(e);
    return e.buffer;
  };
  setUserFlag(-51);
  const comma = typed();
  clearUserFlag(-51);
  assert(comma === '(1; ' && typed() === '(1, ', `keyboard: the , key types ; with -51 set, so 1 stays a whole number (${comma})`);
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
  const { errorBeep, keyClick, beep } = await import('../www/src/ui/beep.js');
  const { setUserFlag, clearUserFlag, testUserFlag: flagOn } = await import('../www/src/rpl/state.js');

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

    const was = flagOn(-56);
    ctx.oscs.length = 0;
    setUserFlag(-56);
    errorBeep();
    keyClick();
    if (!was) clearUserFlag(-56);
    assert(ctx.oscs.map((o) => o.frequency.value).join(',') === '2000' && ctx.gains.at(-1).gain.events[1][1] === 0.05,
      'errorBeep: flag -56 silences it as it does BEEP, where Settings\' Beep switch left errors sounding; a key click ticks quietly whatever the flag');

    const first = beep(440, 0.5), tune = beep(880, 0.3);
    assert(Math.abs(first - 0.5) < 1e-9 && Math.abs(tune - 0.8) < 1e-9,
      'beep: returns how long the queued tones play from now, so BEEP\'s buzz lasts a whole tune');
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
  const docked = normalizeUiPrefs({ panelsSide: 'right', keypadSide: 'left' });
  assert(docked.panelsSide === 'right' && docked.keypadSide === 'left', 'normalizeUiPrefs: the panels and keypad keep the sides they were docked on');
  const undocked = normalizeUiPrefs({ panelsSide: 'top', keypadSide: 3 });
  assert(undocked.panelsSide === 'left' && undocked.keypadSide === 'right', 'normalizeUiPrefs: an unknown side docks the panels left and the keypad right');
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
  const { MatrixEditor } = await import('../www/src/ui/matrix-editor.js');
  const writer = (typed, merged) => {
    const calls = [];
    const self = { _focusR: 0, _focusC: 2, _typedCell: typed, _mergeCell: merged, undo: () => calls.push('undo'), _focusCell: (r, c) => calls.push(`focus ${r},${c}`) };
    return { done: MatrixEditor.prototype.cancelCell.call(self), calls: calls.join(' ') };
  };
  const typed = writer('0,2', '0,2');
  const moved = writer(null, null);
  const other = writer('1,1', '1,1');
  assert(typed.done === true && typed.calls === 'undo focus 0,2' && moved.done === false && !moved.calls && other.done === false,
    'matrix writer: Esc on a cell being typed puts back what it held and keeps the cell, as the HP\'s CANCEL drops the entry being typed; on a cell not typed in it does nothing, so Esc goes on to close the writer');
  const step = (goDown) => {
    const moves = [];
    MatrixEditor.prototype.enter.call({ goDown, _focusR: 0, _focusC: 1, typedCellFocused: () => true, _moveBy: (kind, r, c) => moves.push(`${kind} ${r},${c}`) });
    return moves.join(' ');
  };
  const mxSrc = readFileSync(new URL('../www/src/ui/matrix-editor.js', import.meta.url), 'utf8');
  assert(step(true) === 'down 0,1' && step(false) === 'next 0,1'
    && mxSrc.includes("{ label: 'GO↓', title: \"Enter moves down the column, as the HP's GO↓ does; off, it moves right (GO→)\", toggle: true, on: () => this.goDown"),
    'matrix writer: the GO↓ key, as on the HP\'s MatrixWriter, makes Enter after typing a cell move down the column instead of right');
  assert(mxSrc.includes("if ((e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) next = e.key === 'Home' ? [0, 0] : lastCell(trimGrid(this.grid));")
    && /const lastCell = \(grid\) => \[grid\.length - 1, \(grid\[0\]\?\.length \|\| 1\) - 1\];/.test(mxSrc),
    'matrix writer: Ctrl or Cmd+Home goes to the first cell and +End to the last one filled, as in a spreadsheet; Home and End alone still move the caret');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(this\._writer\(\)\.collapseSelection\?\.\(\) \|\| this\._writer\(\)\.cancelCell\?\.\(\)\) return;\s*this\._closeWriter/.test(appSrc),
    'Esc and a phone\'s back button cancel the matrix cell being typed before they discard the matrix');
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
  const markup = ['appbar.js', 'display.js'].map((f) => readFileSync(new URL(`../www/src/ui/${f}`, import.meta.url), 'utf8')).join('');
  const missing = TOUR_STEPS.flatMap(({ target }) => target.split(', ')).filter((part) => {
    const [id, inner] = part.slice(1).split(' ');
    return !html.includes(`id="${id}"`) || (inner && !markup.includes(inner.startsWith('.') ? `class="${inner.slice(1)}"` : inner.slice(1, -1)));
  });
  assert(!missing.length, `every tour step points at markup the app renders${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  assert(normalizeUiPrefs({}).tourSeen === false && normalizeUiPrefs({ tourSeen: true }).tourSeen === true, 'ui prefs remember that the tour was seen');
  assert(TOUR_STEPS.every((s) => !/click|hover|\bTab\b|F1/i.test(s.touch ?? s.text)), 'tour: on touch no step speaks of clicks, hovering, Tab or F keys');
  const { cardPoint } = await import('../www/src/ui/tour.js');
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  assert(cardPoint(rect(8, 206, 304, 46), 294, 180, 320, 640).y === 252, 'tour: a phone card goes under the command line it explains');
  assert(cardPoint(rect(0, 590, 320, 50), 294, 200, 320, 640).y + 6 + 200 <= 590, 'tour: a phone card goes over the soft keys at the bottom');
  assert(cardPoint(rect(0, 48, 64, 852), 320, 171, 1440, 900).x === 70, 'tour: a card goes beside the tall, narrow rail');
  const inside = cardPoint(rect(64, 48, 1030, 678), 320, 191, 1440, 900);
  assert(inside.x === 419 && inside.y + 6 === 138, 'tour: a card sits inside a stack big enough to hold it');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.keys \{[^}]*flex: 0 1 auto;[^}]*overflow-y: auto/.test(css), 'the keypad shrinks and scrolls instead of covering the work area');
  assert(/\.work \{[^}]*min-height: auto;/.test(css) && !/\.work \{[^}]*overflow: hidden/.test(css), 'the work area never shrinks below its writer and buttons');
  assert(/\.well \{ flex: 1 1 96px;/.test(css) && /@media \(max-height: 780px\) \{\s*\.well \{ flex-basis: 0px;/.test(css), 'the stack gives up room first, with a definite basis so its rows do not inflate the work area');
  assert(/@media \(max-height: 560px\) and \(min-width: 520px\) and \(orientation: landscape\) \{\s*\.app-main \{ flex-direction: row; \}/.test(css), 'a short landscape screen from 520 px wide puts the keypad beside the work area, so a 568 x 320 phone keeps its stack');
  assert(/:root\[data-panels-side="right"\] \.rail \{ order: 3;/.test(css) && /:root\[data-panels-side="right"\] \.drawer \{ order: 2;/.test(css) && /:root\[data-keypad-side="left"\] \.keys \{ order: -1;/.test(css),
    'desktop: the panels dock on the right and the keypad on the left by flex order alone');
  const shortWide = css.slice(css.indexOf('@media (max-height: 560px) and (min-width: 520px) and (orientation: landscape) {'));
  assert(/\.keys \.kp\.compact \.k \.l, \.keys \.kp\.compact \.k \.r \{ display: block;/.test(shortWide.slice(0, shortWide.indexOf('\n}\n'))),
    'landscape: the compact keypad keeps its shift labels, which carry most of what it holds');
  const touchBlock = css.slice(css.indexOf('@media (pointer: coarse) {'));
  assert(/^@media \(pointer: coarse\) \{[^@]*\n  \.input-hint \{ display: none; \}/.test(touchBlock), 'touch: the keyboard-only hint row (Tab, ⇧Enter, Esc) is hidden in every orientation, so landscape gives it to the stack');
  assert(/@media \(hover: hover\) \{\s*\.vr \{ grid-template-columns: 18px minmax\(0, 1fr\); \}\s*\.vr \.acts \{ position: absolute;/.test(css), 'Variables: with a mouse the hidden row actions float over the row, so they leave the name its width');
  const drawerSource = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(!/data-dw="var-(rcl|move|share)"/.test(drawerSource), 'Variables: rows have no Recall, Move or Share button (tap the name, drag, or share the stack level)');
}

{
  const button = () => {
    const on = {};
    return { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); }, fire: (type, ev = {}) => {
      const e = { button: 0, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...ev };
      for (const fn of on[type] ?? []) { if (e.stopped) break; fn(e); }
      return e;
    } };
  };
  const fakeApp = (over = {}) => ({ inputMode: 'rpl', selection: null, shift: null, entry: { buffer: '12 34' }, cleared: [], buzzed: 0, clearLine(text) { this.cleared.push(text); this.entry.buffer = ''; }, buzzHold() { this.buzzed++; }, ...over });
  let app = fakeApp();
  let el = button();
  holdToClear(el, app);
  el.fire('pointerdown');
  app.entry.buffer = '12 3';
  const menu = el.fire('contextmenu');
  assert(app.cleared[0] === '12 34' && menu.prevented && menu.stopped && app.buzzed === 1, '⌫ held: a long press clears the line, Undo bringing back what it held before the press, no key-layers menu opens, and the hold buzzes once with key vibration on');
  assert(el.fire('click').stopped, '⌫ held: the release after clearing does not also delete a character');
  app = fakeApp({ selection: 1 });
  el = button();
  holdToClear(el, app);
  el.fire('pointerdown');
  assert(!el.fire('contextmenu').stopped && !app.cleared.length, '⌫ held: with a level selected, ⌫ drops it and a hold clears nothing');
  app = fakeApp();
  el = button();
  holdToClear(el, app);
  el.fire('pointerdown');
  el.fire('pointerup');
  assert(!el.fire('contextmenu').stopped && !el.fire('click').stopped && !app.cleared.length && !app.buzzed, '⌫ held: a quick press only deletes, buzzes as a key and not as a hold, and a right-click still shows the layers');
  const linesApp = (history) => ({ inputMode: 'rpl', entry: { buffer: '', getHistory: () => history }, shown: 0, buzzed: 0, showLastLines() { this.shown++; }, buzzHold() { this.buzzed++; } });
  app = linesApp(['1 2 +', '3 4 *']);
  el = button();
  holdForLines(el, app);
  el.fire('pointerdown');
  const linesMenu = el.fire('contextmenu');
  assert(app.shown === 1 && app.buzzed === 1 && linesMenu.prevented && el.fire('click').stopped, 'Enter held: a long press on the Enter beside the line offers the last lines, buzzes once, and the release enters nothing');
  app = linesApp([]);
  el = button();
  holdForLines(el, app);
  el.fire('pointerdown');
  assert(!el.fire('contextmenu').stopped && !app.shown, 'Enter held: with no line entered yet a hold offers nothing');
  app = linesApp(['1']);
  el = button();
  holdForLines(el, app);
  el.fire('pointerdown');
  el.fire('pointerup');
  assert(!el.fire('click').stopped && !app.shown && !app.buzzed, 'Enter held: a quick press still enters the line');

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let presses = 0;
  let allowed = true;
  el = button();
  holdToRepeat(el, () => allowed, () => { presses++; });
  el.fire('pointerdown');
  assert(el.fire('contextmenu').stopped, 'arrow held: an Android long-press menu does not open the layers while the key repeats');
  await wait(700);
  el.fire('pointerup');
  const held = presses;
  await wait(200);
  assert(held >= 3 && presses === held, `arrow held: the key repeats after a pause and stops on release (${held})`);
  presses = 0;
  el.fire('pointerdown');
  await wait(100);
  el.fire('pointerup');
  await wait(500);
  assert(presses === 0 && !el.fire('contextmenu').stopped, 'arrow held: a quick tap does not repeat, and a right-click still shows the layers');
  allowed = false;
  el.fire('pointerdown');
  await wait(600);
  el.fire('pointerup');
  assert(presses === 0, 'arrow held: no repeat where the arrow does not move a cursor (a shifted arrow, ▶ swapping on an empty line)');
  allowed = true;
  el.fire('pointerdown');
  await wait(500);
  allowed = false;
  await wait(300);
  const stopped = presses;
  el.fire('pointerup');
  assert(stopped >= 1 && presses === stopped, 'arrow held: the repeat stops once the arrow has nothing left to move (▼ walking off level 1)');
}

{
  const { Drawers } = await import('../www/src/ui/drawer.js');
  const { LONG_PRESS_MS } = await import('../www/src/ui/display.js');
  const on = {};
  const fire = (type, ev) => {
    const e = { prevented: false, preventDefault() { this.prevented = true; }, ...ev };
    for (const fn of on[type] ?? []) fn(e);
    return e;
  };
  const node = (classes, parent = null) => ({ classes, parent, dataset: {}, classList: { add: (c) => classes.push(c) }, closest(sel) {
    for (let n = this; n; n = n.parent) if (sel.split(/\s*,\s*/).some((s) => n.classes.includes(s.match(/^\.?([\w-]+)/)?.[1] ?? s))) return n;
    return null;
  } });
  const body = Object.assign(node(['dw-body']), { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 1000 }) });
  const row = node(['vr'], body);
  row.dataset.dragName = 'A';
  const grip = node(['grip'], row);
  const text = node(['nm'], row);
  const folder = node(['vr', 'dir']);
  const drops = [];
  const host = { el: { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); } }, _dragName: null, buzzed: 0, app: { buzzHold() { host.buzzed++; } }, _performDrop: (name, target) => drops.push(`${name}>${target.name}`) };
  const savedDoc = globalThis.document;
  globalThis.document = { elementFromPoint: () => folder };
  const { requestAnimationFrame: savedRaf, cancelAnimationFrame: savedCaf } = globalThis;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  const timers = [];
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  try {
    Drawers.prototype._bindVarsTouchDrag.call(host, (n) => (n === folder ? { kind: 'into', name: 'SUB1', zone: 'into', el: folder } : null), () => {}, () => {});
    const at = (target, y = 100) => ({ target, touches: [{ clientX: 50, clientY: y }] });
    fire('touchstart', at(text));
    assert(timers.at(-1)?.ms === LONG_PRESS_MS && host._dragName === null, 'Variables, touch: a finger on a row picks it up only after a hold');
    fire('touchmove', at(text, 130));
    assert(!fire('touchend', at(text)).prevented && !drops.length, 'Variables, touch: a swipe before the hold scrolls the list and moves nothing');
    fire('touchstart', at(text));
    timers.at(-1).fn();
    assert(host._dragName === 'A' && row.classes.includes('dragging') && host.buzzed === 1, 'Variables, touch: after the hold the row is picked up, with one buzz');
    assert(fire('touchmove', at(text, 300)).prevented, 'Variables, touch: a picked-up row stops the list scrolling under the finger');
    assert(fire('touchend', at(text)).prevented && drops[0] === 'A>SUB1' && host._dragName === null, 'Variables, touch: letting go over a folder moves the variable into it, with no click after');
    fire('touchstart', at(grip));
    fire('touchmove', at(grip, 300));
    fire('touchend', at(grip));
    assert(drops[1] === 'A>SUB1', 'Variables, touch: the grip drags at once, with no hold');
  } finally {
    globalThis.setTimeout = realTimeout;
    Object.assign(globalThis, { document: savedDoc, requestAnimationFrame: savedRaf, cancelAnimationFrame: savedCaf });
  }
}

{
  const { Sheets } = await import('../www/src/ui/sheets.js');
  const flips = [];
  const tgl = { dataset: { sh: 'toggle', setting: 'textbook' }, getAttribute: () => 'false' };
  const sheet = { el: { contains: () => true }, app: {}, _toggle: (setting, on) => flips.push(`${setting}=${on}`), _render: () => {} };
  const tap = (target) => Sheets.prototype._onClick.call(sheet, { target });
  tap({ closest: (sel) => (sel === '.set' ? { querySelector: (q) => (q === ':scope > .tgl' ? tgl : null) } : null) });
  assert(flips[0] === 'textbook=true', 'Settings: a tap on a switch row\'s title or description flips its switch, as a phone\'s settings do');
  tap({ closest: (sel) => (sel === '.set' ? { querySelector: () => null } : null) });
  assert(flips.length === 1, 'Settings: a tap on a row without a switch changes nothing');
}

{
  const { Sheets } = await import('../www/src/ui/sheets.js');
  const { state: calc, testUserFlag: flagSet, setDisplay } = await import('../www/src/rpl/state.js');
  const page = () => Sheets.prototype._calculatorPageHtml.call({ app: { prefs: { keyClick: false } } });
  const rows = [...page().matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]).join(', ');
  assert(rows === 'Angle, Number format, Results, Number domain, Coordinates, Integer base, Decimal comma, Beep, Key click, Save last arguments, 24-hour clock, Day first in dates',
    `Settings: a Calculator page holds the HP's MODES form, its modes and the mode flags (${rows})`);
  const sheet = { el: { contains: () => true }, app: {}, _render: () => {} };
  const tap = (dataset) => Sheets.prototype._onClick.call(sheet, { target: { closest: () => ({ dataset }) } });
  const before = [calc.displayMode, calc.displayDigits, flagSet(-56)];
  tap({ sh: 'mode', m: 'fmt', v: 'FIX', digits: '3' });
  const fixed = `${calc.displayMode} ${calc.displayDigits}`;
  const digitsRow = /aria-label="Digits"/.test(page());
  const beepOn = /aria-pressed="true" aria-label="Beep"/.test(page());
  tap({ sh: 'flag', flag: '-56' });
  const beepOff = flagSet(-56) && /aria-pressed="false" aria-label="Beep"/.test(page());
  tap({ sh: 'flag', flag: '-56' });
  setDisplay(before[0], before[0] === 'STD' ? 12 : before[1]);
  assert(fixed === 'FIX 3' && digitsRow && beepOn && beepOff && flagSet(-56) === before[2],
    'Settings: the Calculator page sets FIX 3 and shows its digits, and Beep reads on while flag -56 is clear and sets it when switched off');
}

{
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  assert(normalizeUiPrefs({}).keyClick === false && normalizeUiPrefs({ keyClick: true }).keyClick === true && normalizeUiPrefs({ keyClick: 1 }).keyClick === false,
    'Settings: Key click is off until switched on, and kept as a preference');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(this\.prefs\.keyClick\) keyClick\(\);/.test(appSrc),
    'Settings: with Key click on, a keypad key, soft key, key strip button or the Enter beside the line ticks as it is pressed');
  assert(appSrc.includes(`closest?.('.k, .sk, [data-mb="next"]:not(:disabled), .key-strip button, .cmdline-go')`),
    'key feedback: NXT on the soft-key row ticks and buzzes like the soft keys beside it, where with the keypad hidden or in minimal view, the only NXT there is, it stayed silent');
  assert(normalizeUiPrefs({}).keepAwake === false && normalizeUiPrefs({ keepAwake: true }).keepAwake === true && normalizeUiPrefs({ keepAwake: 'yes' }).keepAwake === false,
    'Settings: Keep the screen on is off until switched on, and kept as a preference');
  assert(/this\.keepAwake\(\);\n    document\.addEventListener\('visibilitychange', \(\) => \{ this\._watchAlarms\(\); this\.keepAwake\(\); \}\);/.test(appSrc)
    && /navigator\.wakeLock\.request\('screen'\)/.test(appSrc) && /if \(this\._wakeLock === pending\) this\._wakeLock = null;/.test(appSrc),
    'Settings: Keep the screen on holds a screen wake lock while the app shows and asks again as it comes back, since the phone lets go of it when hidden; an old lock\'s release leaves a newer request alone (a quick off and on lost track of the new lock)');
  assert(/if \(!this\.prefs\.keepAwake \|\| this\._offScreen \|\|/.test(appSrc)
    && /this\._offScreen = off;\n    this\.keepAwake\(\);/.test(appSrc) && /this\._offScreen = null;\n      this\.keepAwake\(\);/.test(appSrc),
    'Settings: Keep the screen on lets go while OFF\'s dark screen shows and takes the lock again as a tap wakes the calculator (the phone stayed lit on the off screen)');
  assert(/\[\(\) => !!this\.pendingEdit, \(\) => this\.cancelEdit\(\)\],\n      \[\(\) => this\.selection != null, \(\) => this\.clearSelection\(\)\],\n    \];/.test(appSrc),
    'back button: a selected stack level is the last thing back puts away, as the HP\'s ON leaves the interactive stack, before the app itself (back with a level selected left the installed app)');
  assert(/const overlays = \[\n[^\n]*\n      \[\(\) => !!this\._offScreen, \(\) => this\._offScreen\.click\(\)\],/.test(appSrc)
    && /\[\(\) => this\.sheets\.isOpen\(\), \(\) => this\.sheets\.dismiss\(\)\],\n      \[\(\) => !!this\.entry\.error, \(\) => this\.dismissError\(\)\],/.test(appSrc)
    && /this\._offScreen = off;\n    this\.keepAwake\(\);\n[^\n]*\n    this\._syncBackButton\?\.\(\);/.test(appSrc),
    'back button: as the HP\'s ON wakes it and clears an error message, back wakes the calculator from OFF (first, since the off screen covers everything) and puts an error banner away before the app is left (both left the installed app); OFF, which comes after its tap, guards the history itself');
  {
    const { TOOL_KEYS, MENU_GROUPS, menuById } = await import('../www/src/ui/menus.js');
    const { lookup: findOp } = await import('../www/src/rpl/ops.js');
    assert(TOOL_KEYS.join(' ') === 'EDIT VIEW RCL STO PURGE CLEAR CASCMD HELP' && TOOL_KEYS.filter((k) => k !== 'VIEW').every((k) => findOp(k))
      && MENU_GROUPS[0].ids.includes('TOOL') && menuById('TOOL')?.short === 'TOOL'
      && /else if \(id === 'TOOL'\) this\.setMenu\(TOOL_KEYS\.map\(\(key\) => \(key === 'VIEW' \? this\._viewKey\(\) : this\._commandSlot\(key\)\)\), 'TOOL'\);/.test(appSrc)
      && /_viewKey\(\) \{\n    return \{ label: 'VIEW',[^\n]*onPress: \(\) => this\.levelAction\('view', 1\) \};/.test(appSrc),
      'TOOL menu: the HP\'s TOOL keys EDIT, VIEW, RCL, STO, PURGE and CLEAR, then CASCMD and HELP, with VIEW showing level 1 full size, so minimal view (no keypad) has them a tap away');
  }
  assert(/setBeepHook\(\(hz, seconds\) => this\._buzzBeep\(beep\(hz, seconds\)\)\);/.test(appSrc)
    && /_buzzBeep\(seconds\) \{\n    if \(this\.prefs\.haptics && typeof navigator\.vibrate === 'function'\) navigator\.vibrate\(Math\.round\(Math\.min\(seconds, BEEP_BUZZ_MAX_S\) \* 1000\)\);/.test(appSrc),
    'BEEP: with key vibration on, the phone buzzes as long as the queued tones play, up to 5 s, so a phone on silent still gives a program\'s signal (flag -56 stops BEEP before it reaches the hook)');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/@media \(max-height: 400px\) \{\s*:root\[data-keyboard\] \.dw-tabs, :root\[data-keyboard\] \.cb-header \{ display: none; \}\s*\/\*[^*]*\*\/\s*:root\[data-keyboard\] \.app:not\(\.plot-focus\) \.dw-title \{ display: flex; \}/.test(css),
    'drawers: typing on a short screen, a drawer whose tabs step aside names itself again, where its row held only its buttons');
}

{
  const { installHint } = await import('../www/src/ui/appbar.js');
  const UA = {
    androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    desktopFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  };
  assert([UA.androidChrome, UA.androidFirefox].every((ua) => /Install app or Add to Home screen/.test(installHint(ua)) && !/Apps ›|Firefox can/.test(installHint(ua))),
    'install note: an Android browser, Firefox included, is pointed at its menu\'s Install app or Add to Home screen, not a computer\'s Apps menu');
  assert(installHint(UA.iphoneChrome) === 'Tap Share, then Add to Home Screen.' && installHint(UA.macSafari, true) === 'Tap Share, then Add to Home Screen.',
    'install note: any browser on an iPhone or iPad uses Share › Add to Home Screen');
  assert(/Add to Dock/.test(installHint(UA.macSafari)) && /Firefox can’t install/.test(installHint(UA.desktopFirefox)), 'install note: Safari on a Mac adds to the Dock, and Firefox on a computer cannot install');
}

{
  const { modesSummary } = await import('../www/src/ui/modes.js');
  const { setBinaryBase, setCoordMode, setComplexMode } = await import('../www/src/rpl/state.js');
  const plain = modesSummary();
  setBinaryBase('h'); setCoordMode('CYLIN'); setComplexMode(true);
  const changed = modesSummary();
  setBinaryBase('d'); setCoordMode('RECT'); setComplexMode(false);
  assert(plain === 'RAD · STD · EXACT' && changed === 'RAD · R∠Z · HEX · STD · ℂ · EXACT' && modesSummary() === plain,
    `modes summary: a phone's only mode display names the coordinates, base and complex mode when they aren't the defaults, in the HP header's order (${plain} / ${changed})`);
}

{
  const { DISPLAY_DIGITS_CHOICES } = await import('../www/src/ui/modes.js');
  assert(DISPLAY_DIGITS_CHOICES.join() === Array.from({ length: 12 }, (_, i) => i).join(), 'number format: the Digits grid offers every count from 0 to 11, the range the AUR gives FIX, SCI and ENG');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.pop \.grid\.digits \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); \}/.test(css), 'number format: the twelve digit counts sit in two rows of six');
  const appbar = readFileSync(new URL('../www/src/ui/appbar.js', import.meta.url), 'utf8');
  assert((appbar.match(/digitsHtml\(/g) ?? []).length === 3, 'number format: the all-modes menu shows the same digit grid as the number format menu, so a phone in normal view can pick FIX 5');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  assert(/\.lay-sheet:not\(:empty\) ~ #toasts \{ top: auto; bottom:/.test(css) && /id="laySheet"><\/div>\s*<div class="toasts" id="toasts"/.test(html),
    'toasts: while a sheet is open they sit at the bottom, clear of its title and page tabs, in every view (an id outranks minimal view\'s top rules)');
  assert(/const editing = \(\) => \{[^}]*el\.inputMode !== 'none'/.test(html),
    'keyboard test: a field that asks for no keyboard (inputmode none while the keypad shows) never reads a shorter window as the keyboard, so split screen keeps the keypad');
}

{
  const { MenuBar } = await import('../www/src/ui/menubar.js');
  const on = {};
  const el = { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); } };
  const calls = [];
  const app = { menuView: () => ({ slots: [{ label: 'DUP' }] }), nextMenuPage: () => calls.push('next'), prevMenuPage: () => calls.push('prev'), pressSoftKey: (i) => calls.push(`press ${i}`), clearPreview: () => {} };
  new MenuBar({ el, app });
  const sk = { dataset: { i: '0' }, disabled: false, classList: { add() {}, remove() {} } };
  const target = { closest: (sel) => (sel === '.mb-keys' ? {} : sel.startsWith('.sk') ? sk : null) };
  const fire = (type, x, y = 100) => { for (const fn of on[type] ?? []) fn({ type, pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: y, target, preventDefault() {} }); };
  fire('pointerdown', 200);
  assert(!calls.length, 'soft keys, touch: a finger presses a key as it lifts, not as it lands');
  fire('pointerup', 202);
  assert(calls.join() === 'press 0', 'soft keys, touch: a tap presses the key');
  calls.length = 0;
  fire('pointerdown', 200); fire('pointermove', 150); fire('pointermove', 100); fire('pointerup', 90);
  assert(calls.join() === 'next', 'soft keys, touch: a swipe left turns to the next page, once, and presses nothing');
  calls.length = 0;
  fire('pointerdown', 100); fire('pointermove', 150); fire('pointerup', 150);
  assert(calls.join() === 'prev', 'soft keys, touch: a swipe right turns back a page');
  calls.length = 0;
  fire('pointerdown', 100); fire('pointermove', 110, 160); fire('pointerup', 110, 160);
  assert(!calls.length, 'soft keys, touch: a mostly vertical drag neither turns the page nor presses');
}

{
  const { MenuBar } = await import('../www/src/ui/menubar.js');
  const on = {};
  const el = { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); } };
  const calls = [];
  let pages = 3;
  const app = { menuView: () => ({ slots: [{ label: 'DUP' }], pages }), nextMenuPage: () => calls.push('next'), prevMenuPage: () => calls.push('prev'), pressSoftKey: (i) => calls.push(`press ${i}`), buzzHold: () => calls.push('buzz'), clearPreview: () => {} };
  new MenuBar({ el, app });
  const sk = { dataset: { i: '0' }, disabled: false, classList: { add() {}, remove() {} } };
  const target = { closest: (sel) => (sel === '.mb-keys' ? {} : sel.startsWith('.sk') ? sk : null) };
  const fire = (type, x, y = 100) => { for (const fn of on[type] ?? []) fn({ type, pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: y, target, preventDefault() {} }); };
  fire('pointerdown', 200); fire('pointermove', 150); fire('pointermove', 100); fire('pointerup', 90);
  assert(calls.join() === 'buzz,next', 'soft keys, touch: a swipe that turns the page buzzes once, as a swipe on a level, banner or note does');
  calls.length = 0;
  pages = 1;
  fire('pointerdown', 200); fire('pointermove', 100); fire('pointerup', 100);
  assert(calls.join() === 'next', 'soft keys, touch: a swipe on a menu of one page, which has no page to turn to, does not buzz');
}

{
  const { TOUR_STEPS } = await import('../www/src/ui/tour.js');
  assert(/held, a BRCH, UNITS or variable key offers what its shifted forms do/.test(TOUR_STEPS.find((s) => s.title === 'Soft keys')?.touch ?? ''), 'tour: on a phone the soft-key step teaches that a held BRCH, UNITS or variable key offers its shifted forms');
  assert(/swipe along the keys/.test(TOUR_STEPS.find((s) => s.title === 'Soft keys')?.touch ?? ''), 'tour: on a phone the soft-key step teaches the swipe that turns the page, beside NXT');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.app \.st-row\[data-key\] \.st-val:not\(\.more-l, \.more-r\) \{ touch-action: pan-y; \}/.test(css),
    'stack, touch: a swipe that starts on a level\'s value drops it; only a value wider than its row keeps the sideways swipe to scroll');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/undoToast\(message\) \{[^}]*key: 'undo'/.test(appSrc),
    'undo notes: each replaces the one before (an older one\'s Undo no longer applies), so swiping away three levels leaves one note over the stack, not three');
}

{
  const eqw = readFileSync(new URL('../www/src/ui/equation-editor.js', import.meta.url), 'utf8');
  const ctor = eqw.slice(eqw.indexOf('  constructor({ app } = {}) {'), eqw.indexOf('\n  load(value) {'));
  assert(/this\._render\(\);\s*\}\s*$/.test(ctor), 'equation writer: its first opening draws the empty box and caret, as every later one does (the canvas used to stay blank until the first key)');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/const runExample = \(line\) => \{\s*if \(this\.inputMode !== 'rpl'\) this\.setInputMode\('rpl'\);/.test(appSrc)
    && /act === 'solve'\) runExample\(/.test(appSrc) && /act === 'plot'\) runExample\(/.test(appSrc),
    'empty stack: the Solve and Plot examples run on the command line even with a writer open (Enter used to commit the empty writer: "Type an expression first")');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const applyPrefs = appSrc.slice(appSrc.indexOf('  _applyPrefs() {'), appSrc.indexOf('\n  setTheme('));
  assert(/applyThemeColor\(\);\s*\}\s*$/.test(applyPrefs) && /matchMedia\('\(prefers-color-scheme: dark\)'\)\.addEventListener\('change', applyThemeColor\)/.test(appSrc)
    && /dataset\.view === 'minimal' \? '\.work' : '#appbar'/.test(appSrc),
    'status bar: theme-color takes the app\'s top edge (the app bar, or minimal view\'s stack) for every theme, and again when the system scheme flips (it used to follow only the system, so Paper on a dark phone had a dark bar)');
}

{
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  const kept = normalizeUiPrefs({ recentCommands: ['SWAP', 'SQ', 'SWAP', 7, '', 'A B', '→NUM', 'a', 'b', 'c', 'd', 'e', 'f'] }).recentCommands;
  assert(JSON.stringify(kept) === JSON.stringify(['SWAP', 'SQ', '→NUM', 'a', 'b', 'c', 'd', 'e']) && normalizeUiPrefs({ recentCommands: 'SWAP' }).recentCommands.length === 0,
    'normalizeUiPrefs: recent commands keep eight distinct names, newest first, and drop junk');
  assert(JSON.stringify(normalizeUiPrefs({ recentCommands: ['LIST->', 'SIN', 'LIST→', 'C->R', '->NUM'] }).recentCommands) === JSON.stringify(['LIST→', 'SIN', 'C→R', '→NUM']),
    'normalizeUiPrefs: a recent command saved as its ASCII alias (LIST->) reads as its arrow name, once');
  assert(JSON.stringify(normalizeUiPrefs({ recentMenus: ['MATRIX', 'VARS', 'matrix', 'VARS', 7, 'TOOLONGNAME', 'CST', 'STAT', 'BRCH'] }).recentMenus) === JSON.stringify(['MATRIX', 'VARS', 'CST', 'STAT'])
    && normalizeUiPrefs({}).recentMenus.length === 0,
    'normalizeUiPrefs: recent menus keep four distinct ids, newest first, and drop junk');
  assert(/if \(remember\) this\.setPrefs\(\{ menu: this\.menuKind, recentMenus: \[this\.menuKind, \.\.\.this\.prefs\.recentMenus\.filter\(\(m\) => m !== this\.menuKind\)\] \}\);/.test(readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8')),
    'menus: showing a menu puts it first among the recent menus');
  const menubarSrc = readFileSync(new URL('../www/src/ui/menubar.js', import.meta.url), 'utf8');
  assert(/const recent = this\.app\.prefs\.recentMenus\.filter\(\(id\) => id !== current && menuById\(id\)\);/.test(menubarSrc) && /\{ title: 'Recent', ids: recent \}/.test(menubarSrc),
    'menus: the menu picker leads with the menus used last, the current one left out');
  const { Palette } = await import('../www/src/ui/palette.js');
  let prefs = normalizeUiPrefs({ minimal: true, recentCommands: ['SQ', 'NOSUCHCMD', 'SOLVE'] });
  const ran = [];
  const app = { get prefs() { return prefs; }, setPrefs: (patch) => { prefs = normalizeUiPrefs({ ...prefs, ...patch }); }, runCommandFromUI: (n) => ran.push(n), runAction: () => {}, drawers: {} };
  const palette = new Palette({ host: null, app });
  const titles = (groups) => groups.map(([title, items]) => `${title}: ${items.map((it) => it.title).join(' ')}`);
  const [recent, commands] = titles(palette._items(''));
  assert(recent === 'Recent commands: SQ SOLVE' && commands.startsWith('Commands: FACTOR DERIV'),
    'command search: with nothing typed the commands run from it come first, without repeating in the starter list (unknown names are skipped)');
  palette._items('').find(([title]) => title === 'Commands')[1].find((it) => it.title === 'DERIV').run();
  assert(ran.join() === 'DERIV' && prefs.recentCommands.slice(0, 3).join() === 'DERIV,SQ,NOSUCHCMD', 'command search: a command run from it becomes the most recent');
  assert(!palette._items('sw').some(([title]) => title === 'Recent commands'), 'command search: a typed query shows matches, not the recent list');
}

// SUM of a real gives it back unchanged, and its preview read "→ removes 0 levels".
{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(!top\.length && !outcome\.consumed\) return '→ leaves the stack as it is';\n    if \(!top\.length\) return `→ removes /.test(appSrc),
    'command search: a command that leaves the stack as it was previews as such, not as removing 0 levels');
}

// Command search previewed nothing for a command that sets a mode, so a phone user couldn't tell what DEG or FIX would do.
{
  const { modeCommandPreview } = await import('../www/src/ui/modes.js');
  const { setDisplay } = await import('../www/src/rpl/state.js');
  const { displayDigitsArg } = await import('../www/src/rpl/ops/display.js');
  const saved = { angle: calcState.angle, mode: calcState.displayMode, digits: calcState.displayDigits };
  setAngle('RAD'); setDisplay('STD', 12);
  assert(modeCommandPreview('DEG') === '→ Angle: Degrees (now Radians)' && modeCommandPreview('RAD') === '→ Angle stays Radians'
    && modeCommandPreview('GRAD') === '→ Angle: Grads (now Radians)',
    'command search: DEG previews the angle mode it sets and the one now in force, RAD that it stays');
  assert(modeCommandPreview('FIX', 4) === '→ Number format: Fixed 4 (now Standard)' && modeCommandPreview('FIX') === ''
    && displayDigitsArg(Integer(15n)) === 11 && modeCommandPreview('STD') === '→ Number format stays Standard',
    'command search: FIX previews the digits on level 1 (none there, no preview), capped at 11 as FIX caps them');
  assert(/^→ Number domain: (Complex \(now Real\)|Real \(now Complex\))$/.test(modeCommandPreview('CMPLX')) && modeCommandPreview('SIN') === '',
    'command search: CMPLX previews the domain it flips to; a command that sets no mode gets none from here');
  setAngle(saved.angle); setDisplay(saved.mode, saved.digits);
}

// STO, RCL, PURGE, CLΣ and CLVAR get no scratch run, so command search previewed nothing for them.
{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/modeCommandPreview\(name, this\._levelOneDigits\(\)\) \|\| this\._memoryPreview\(name\)/.test(appSrc)
    && /case 'STO': return id !== null && this\.stack\.depth > 1 \? `→ stores \$\{show\(this\.stack\.peek\(2\)\)\} in \$\{id\}`/.test(appSrc)
    && /case 'RCL': return id === null \? '' : held === undefined \? `→ \$\{id\} doesn't exist`/.test(appSrc)
    && /case 'CLΣ': return varRecall\('ΣDAT'\) === undefined \? '→ ΣDAT is already empty'/.test(appSrc)
    && /case 'CLVAR': case 'CLUSR': \{[\s\S]*?!\(isDirectory\(varRecall\(v\)\) && varRecall\(v\)\.entries\.size > 0\)/.test(appSrc),
    'command search: STO, RCL, PURGE, CLΣ and CLVAR preview what they would store, recall or clear, CLVAR counting only what it purges');
}

{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  assert(/detail: \[entry \? shortDescription\(entry, 90\) : '', sig\]\.filter\(Boolean\)\.join\(' · '\),/.test(paletteSrc),
    'command search: a command row reads its description before its stack diagram, so a phone shows what INTEG, CONVERT, ROLL or PICK does rather than "lower limit upper limit int…"');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const fade = Number(displaySrc.match(/const TOP_FADE = (\d+);/)?.[1]);
  assert(fade === 36 && css.includes(`.stack-view.more-t { mask-image: linear-gradient(to bottom, transparent, #000 ${fade}px); }`)
    && new RegExp(`\\.stack-view \\{[^}]*scroll-padding-top: ${fade}px;`).test(css)
    && /const view = this\.stackView, edge = view\.scrollTop \+ TOP_FADE,/.test(displaySrc) && /row\.offsetTop \+ row\.offsetHeight <= edge/.test(displaySrc) && /view\.classList\.toggle\('more-t', above > 0 \|\| cut\)/.test(displaySrc),
    'stack: with levels above, the top edge fades under the "more levels above" pill, which counts a level ending in the fade, and a level selected there scrolls clear of it (the pill used to sit on a half-shown level it did not count)');
  assert(/cut: roomy && rows\.length > 0 && rows\[0\]\.offsetTop < view\.scrollTop \};/.test(displaySrc),
    'stack: a top level cut by a short view fades at the top edge too, where a turned phone in minimal view sliced level 4\'s matrix through its first row with no sign of more above');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const showError = appSrc.slice(appSrc.indexOf('  _showError(message) {'), appSrc.indexOf('\n  renderBanner() {'));
  assert(/if \(message\) this\._buzzError\(\);/.test(showError)
    && /_buzzError\(\) \{\s*if \(this\.prefs\.haptics && typeof navigator\.vibrate === 'function' && !testUserFlag\(-56\)\) navigator\.vibrate\(\[30, 60, 30\]\);/.test(appSrc),
    'errors: with key vibration on, a phone buzzes twice on an error, as the HP beeps, unless flag -56 (Error Beep) is set');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const appbarSrc = readFileSync(new URL('../www/src/ui/appbar.js', import.meta.url), 'utf8');
  const bar = css.slice(css.indexOf('@container app (max-width: 319px) {\n  .crumbs'));
  assert(/^@container app \(max-width: 319px\) \{\n  \.crumbs \{ flex-shrink: 0; max-width: 40%; \}\n  \.modes \{ flex-shrink: 1; min-width: 0; \}/.test(bar)
    && /\.mode-chip\.summary span \{ overflow: hidden; text-overflow: ellipsis; \}\n  \.in-tabs \.i \{ display: none; \}/.test(bar)
    && appbarSrc.includes('<span>${escapeHtml(modesSummary())}</span>')
    && /@container app \(max-width: 319px\) \{\s*\.ann-status \{ padding-left: 6px; padding-right: 4px; \}[\s\S]{0,720}?button\.ann-m \{ min-width: 28px; \}/.test(css)
    && css.includes('@container app (max-width: 319px) { .writer-keys { gap: 2px; padding: 0 4px 8px; } .writer-keys .cmdline-go { min-width: 26px; padding: 0; white-space: nowrap; } }'),
    "narrow phones: under 320 px (a fold's cover screen, or a larger system text size) the directory name stays whole while the modes summary gives way, and Ask, Settings' Data tab, minimal view's leave button and the equation writer's Enter stay on screen");
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const window = Number(displaySrc.match(/const LEVEL_WINDOW = (\d+);/)?.[1]);
  assert(window === 50
    && /const shown = Math\.min\(depth, Math\.max\(this\.shownLevels, this\.selectedLevel \?\? 0\)\);/.test(displaySrc)
    && /if \(depth <= LEVEL_WINDOW\) this\.shownLevels = LEVEL_WINDOW;/.test(displaySrc)
    && /for \(let level = shown; level >= 1; level--\)/.test(displaySrc)
    && /if \(this\._hidden\) head\.appendChild\(this\._olderButton\(\)\);/.test(displaySrc)
    && /this\._anchor = view\.scrollHeight - view\.scrollTop;\s*this\.shownLevels \+= LEVEL_WINDOW;/.test(displaySrc)
    && /const count = above && above \+ this\._hidden;/.test(displaySrc),
    'stack: a deep stack draws the 50 levels nearest level 1 (2,000 levels took 6 s a command on a phone), with a row above them that shows 50 more while the levels in view stay put; a level selected deeper is drawn, and the pill counts the levels not drawn');
}

{
  const paletteSrc = readFileSync(new URL('../www/src/ui/palette.js', import.meta.url), 'utf8');
  const open = paletteSrc.slice(paletteSrc.indexOf('  open(seed = \'\') {'), paletteSrc.indexOf('\n  close() {'));
  assert(/this\.app\.toasts\?\.dismiss\('view'\);/.test(open),
    'command search: opening it puts away the "Keypad hidden" or minimal view hint, which sat over its search field for its first seconds, as a drawer or popover does');
  assert(/if \(this\.el\.hidden\) this\.app\.toasts\?\.dismiss\('view'\);\s*this\.el\.hidden = false;/.test(readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8')),
    'autocomplete: opening the list puts the view hint away too, which sat over its rows with the keyboard up in minimal view, so a tap on a row hit the hint instead');
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const render = displaySrc.slice(displaySrc.indexOf('  renderStack(stack) {'), displaySrc.indexOf('\n  _olderButton() {'));
  const at = (re) => render.search(re);
  assert(at(/const svgSize = parseFloat\(getComputedStyle\(view\)\.fontSize\)/) < at(/const frag = this\._placeRows\(entries, svgSize\);/)
    && at(/const markEdges = this\._measureEdges\(\);/) > at(/const after = animate \? this\._positions\(\) : null;/)
    && at(/this\._measureMore\(\)/) < at(/this\._animate\(before, after\);/)
    && at(/this\._animate\(before, after\);/) < at(/markEdges\(\);/)
    && at(/markEdges\(\);/) < at(/this\._showMore\(more\);/)
    && /view\.addEventListener\('scroll', \(\) => \{\s*if \(this\._renderScroll\) return;[^}]*this\._updateMore\(\);/.test(displaySrc)
    && /else if \(selected\) this\._reveal\(selected\);/.test(render)
    && /_reveal\(row\) \{\s*const view = this\.stackView, v = view\.getBoundingClientRect\(\), r = row\.getBoundingClientRect\(\);\s*if \(r\.height > v\.height - TOP_FADE\) view\.scrollTop = tallLevelScroll\(view, v, r\);\s*else if \(r\.bottom > v\.bottom\) view\.scrollTop \+= Math\.ceil\(r\.bottom - v\.bottom\);\s*else if \(r\.top < v\.top \+ TOP_FADE\) view\.scrollTop -= Math\.ceil\(v\.top \+ TOP_FADE - r\.top\);/.test(displaySrc)
    && /function tallLevelScroll\(view, v, r\) \{\s*const at = r\.top - v\.top \+ view\.scrollTop, top = Math\.floor\(at\), toEnd = Math\.ceil\(at \+ r\.height - v\.height\);/.test(displaySrc),
    'stack: a render measures everything (font size before the rows go, then positions, edge fades and the pill) before changing anything, and its own scroll does not measure again, so a key on a phone lays the page out once rather than five times');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const touch = css.slice(css.indexOf('@media (pointer: coarse)'));
  assert(/Edit<\/button><button type="button" data-row-act="view" title="View full size \(VIEW\)" aria-label="View">\$\{icon\('expand', 'sm'\)\}<\/button>/.test(appSrc)
    && /\.st-acts \[data-row-act="view"\] \{ display: none; \}/.test(css.slice(0, css.indexOf('@media (pointer: coarse)')))
    && /\.st-acts \[data-row-act="view"\] \{ display: flex; \}/.test(touch)
    && /@container app \(max-width: 359px\) \{ \.st-acts:has\(\[data-row-act="plot"\]\) \[data-row-act="view"\] \{ display: none; \} \}/.test(touch),
    'stack: a selected level\'s touch toolbar has a View button (the HP interactive stack\'s VIEW, a level full size) wherever it fits, from 320 px, or 360 px beside a formula\'s Plot; elsewhere VIEW stays in the level\'s ⋯ menu');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const mxSrc = readFileSync(new URL('../www/src/ui/matrix-editor.js', import.meta.url), 'utf8');
  assert(/if \(this\.inputMode === 'matrix'\) return this\.matrixEditor\.typeUnit\(unit, mode\);/.test(appSrc)
    && /typeUnit\(unit, mode\) \{\s*if \(mode === 'convert'\) \{ this\.app\.notifyError\('CONVERT works on the stack; in the writer a unit key attaches its unit\.'\); return; \}\s*const text = unitCellText\(this\._textBeforeCaret\(\), unit, mode\);\s*this\._editCell\(text\);/.test(mxSrc),
    'matrix writer: a UNITS key types into the focused cell, as in the equation writer, where it entered the matrix and pushed the unit on its own');
}

{
  const mxSrc = readFileSync(new URL('../www/src/ui/matrix-editor.js', import.meta.url), 'utf8');
  assert(/\{ label: 'FROM1'[^\n]+\n\s*\{ label: '→STK', title: 'Copy the focused cell to the stack', onPress: \(\) => this\.cellToStack\(\) \},/.test(mxSrc)
    && /cellToStack\(\) \{[\s\S]*?value = parseMatrixCell\(this\.grid\[r\]\[c\]\);[\s\S]*?this\.app\.pushFromWriter\(value,/.test(mxSrc),
    'matrix writer: →STK copies the focused cell to the stack and leaves the writer open, as the HP MatrixWriter\'s →STK does');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/onHold: \(anchor\) => this\._heldKeyMenu\(this\._heldUnitOptions\(unit\), anchor, 'Unit'\)/.test(appSrc)
    && /if \(this\.inputMode === 'equation' \|\| this\.inputMode === 'matrix'\) return \[\{ text: `Attach \$\{unit\}`, mark: '', run: \(\) => this\.insertUnit\(unit\) \}, divide\];/.test(appSrc),
    'units: a finger held on a unit key in a writer offers Attach and Divide, where it offered Convert level 1, which the writer refuses');
}

{
  const eqwSrc = readFileSync(new URL('../www/src/ui/equation-editor.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/this\.strip\.addEventListener\('scroll', \(\) => markScrollEdges\(this\.strip\), \{ passive: true \}\);\s*new ResizeObserver\(\(\) => markScrollEdges\(this\.strip\)\)\.observe\(this\.strip\);/.test(eqwSrc)
    && (eqwSrc.match(/this\.strip\.innerHTML = [^\n]+\n\s*markScrollEdges\(this\.strip\);/g) ?? []).length === 2
    && /\.eqw-ins\.more-r,[^{]*\{ mask-image: linear-gradient\(to right, #000 calc\(100% - 36px\), transparent\); \}/.test(css)
    && /\.eqw-ins\.more-l\.more-r,[^{]*\{ mask-image: linear-gradient\(to right, transparent, #000 36px/.test(css),
    'equation writer: its insight cards fade at the edge they continue past, as the drawer tabs and key strip do, where on a phone a card was cut off at the edge');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/const plottableFormula = \(value\) => \{ const v = isTagged\(value\) \? value\.value : value; return isSymbolic\(v\) && !hasUnits\(v\.expr\); \};/.test(appSrc)
    && /\$\{plottable\(value\) \? `<button type="button" data-row-act="plot"/.test(appSrc)
    && /plottable\(value\) \? item\('plot', 'plot', 'Plot it'\)/.test(appSrc)
    && /\.\.\.\(plottable\(value\) \? \[\{ label: 'PLOT'/.test(appSrc)
    && !/isSymbolic\(value\) \? item\('plot'|isSymbolic\(value\) \? `<button type="button" data-row-act="plot"/.test(appSrc),
    'stack: a formula with units gets no Plot from its toolbar, ⋯ menu or soft keys, as in the equation writer, where Plot opened an empty plot');
  const graphSrc = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  assert(/const plottable = \(value\) => plottableFormula\(value\) \|\| \(isList\(value\) && value\.items\.length > 0 && value\.items\.every\(plottableFormula\)\);/.test(appSrc)
    && /case 'plot': this\.clearSelection\(\); this\.plotValue\(value\); return;/.test(appSrc)
    && /const formulaList = \(v\) => \(isList\(v\) && v\.items\.length && v\.items\.every\(isFormula\) \? v\.items : null\);/.test(graphSrc)
    && /const items = formulaList\(top\) \?\? \[top\];/.test(graphSrc)
    && /built\.forEach\(\(b, i\) => this\._addTrace\(b, \{ fit: fit && i === last, draw: i === last, view: pparView\(\) \}\)\);/.test(graphSrc),
    'stack: a list of formulas gets Plot too, and it and FUNCTION draw every formula in the list together, as the HP draws each equation in a list stored in EQ');
  assert(graphSrc.includes("if (kind === 'function') this._noteUnvalued(built);")
    && graphSrc.includes("if (!names.length) { this.app.toasts?.dismiss('plot'); return; }")
    && graphSrc.includes("{ key: 'plot', transient: true });"),
    "plot: a function plot names the names that hold no number, which leave its curve blank, in one note that the next plot replaces or clears");
  assert(/const specs = \(formulaList\(value\) \?\? \[value\]\)\.map\(\(v\) => stackValueToTrace\(v, this\._kind, below\)\);/.test(graphSrc)
    && /specs\.forEach\(\(spec, i\) => this\._addTrace\(spec, \{ fit: i === last, draw: i === last \}\)\);/.test(graphSrc),
    "plot: the drawer's + Level 1 plots each formula of a list on level 1, as Plot does, where it switched to Scatter and added an empty scatter trace");
  assert(/if \(kind === 'draw' && data\) this\._addEq\(data, stack\);/.test(graphSrc)
    && /\.filter\(\(b\) => b && !traceInputError\(kind, b, \{ adding: true \}\) && !shown\.has\(key\(b\)\)\);/.test(graphSrc),
    "plot: DRAW plots EQ's formulas the view doesn't already show, where 'SIN(X)' STEQ DRAW opened an empty plot");
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/@container app \(max-width: 319px\) \{ \.st-acts \[data-row-act="view"\], \.st-acts \[data-row-act="plot"\] \{ display: none; \} \}/.test(css),
    'stack: under 320 px a formula\'s Plot waits in the level\'s ⋯ menu with View, since six 40 px buttons ran 6 px past the toolbar at 280 px (20 px in minimal view)');
}

{
  const toastSrc = readFileSync(new URL('../www/src/ui/toast.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/transient = false \} = \{\}\) \{/.test(toastSrc)
    && /if \(transient\) \{\s*const away = \(ev\) => \{\s*if \(t\.isConnected && ev\.target\.closest\?\.\('\.toast'\)\) return;\s*remove\(\);\s*document\.removeEventListener\('pointerdown', away, true\);/.test(toastSrc)
    && /document\.addEventListener\('pointerdown', away, true\);/.test(toastSrc)
    && (appSrc.match(/key: 'view', transient: true \}/g) || []).length === 2,
    'toasts: the Keypad hidden and minimal view hints go at the first tap anywhere else, which still does what it touched, instead of covering the top of the stack for five seconds; their own Show and Leave buttons still work');
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const body = displaySrc.match(/function tallLevelScroll\(view, v, r\) \{([\s\S]*?)\n\}/)?.[1];
  const scrollFor = (scrollTop, viewHeight, top, height) => new Function('view', 'v', 'r', body)({ scrollTop }, { top: 40, height: viewHeight }, { top: 40 + top - scrollTop, height });
  assert(body && scrollFor(189, 116, 225, 94) === 203 && scrollFor(150, 116, 225, 94) === 203 && scrollFor(210, 116, 200, 94) === 200
    && scrollFor(190, 116, 200, 94) === 190 && scrollFor(260, 98, 280, 103) === 280 && scrollFor(0, 116, 300, 140) === 300
    && scrollFor(241, 128, 472.47, 93.39) === 438 && scrollFor(241, 128, 472.9, 93.1) === 438 && scrollFor(0, 116, 300.6, 140) === 300,
    'stack: a selected level too tall to sit below the top fade shows whole with its toolbar when it fits the view (at 320 px with the full keypad the toolbar under level 2 ran 8 px past the bottom, 26 px at 280), keeps its place when it is already whole, shows from its top when taller than the view, and rounds its fraction of a pixel outward (a turned 360 by 740 phone with the keypad hidden left 0.86 px of level 7, its bottom outline, under the view)');
  const measure = displaySrc.slice(displaySrc.indexOf('  _measureMore() {'), displaySrc.indexOf('\n  _showMore('));
  assert(/const sel = view\.querySelector\('\.st-row\.sel'\);\s*if \(sel && sel\.offsetTop < edge && sel\.offsetTop \+ sel\.offsetHeight > edge\) return \{ above: 0, top \};/.test(measure),
    'stack: the more-levels pill and the top fade give way to a selected level that reaches through them, rather than covering its value');
  assert(/const tapped = this\._tapped;\s*this\._tapped = null;\s*if \(ev\.detail === 2 && tapped && performance\.now\(\) - tapped\.at < DOUBLE_TAP_MS\) \{ this\.onRowDoubleClick\?\.\(tapped\.level\); return; \}/.test(displaySrc)
    && /if \(act\) \{ this\.onRowAction\?\.\(level, act\.dataset\.rowAct, act\); return; \}\s*this\._tapped = \{ level, at: performance\.now\(\) \};/.test(displaySrc),
    'stack: a double tap edits the level the first tap hit, though that tap opened its toolbar under the finger, where on a phone the second tap opened the level\'s ⋯ menu; two quick taps on a toolbar button still act twice');
  assert(/const roomy = view\.clientHeight >= 2 \* TOP_FADE;\s*return \{ above: roomy \? above : 0, top, cut: roomy && /.test(measure),
    'stack: a view shorter than twice the top fade, as under an error banner with the keyboard up (47 px in a turned phone, 28 at 280 px), has no fade or pill, where the fade greyed out level 1');
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  assert(/const rowSig = \(flat, svgSize, oneLine\) => `\$\{svgSize\}\|\$\{calcState\.textbookMode \? 1 : 0\}\|\$\{oneLine \? 1 : 0\}\|\$\{flat\}`;/.test(displaySrc)
    && /_reusable\(row, entry\) \{\s*return row\.className === 'st-row' && row\.dataset\.key === entry\.key && this\.selectedLevel !== entry\.level\s*&& this\._rowSigs\.get\(row\) === entry\.sig;/.test(displaySrc)
    && /const old = view\.dataset\.empty \|\| this\.marks \? \[\] : \[\.\.\.view\.querySelectorAll\(':scope > \.st-row\[data-key\]'\)\];/.test(displaySrc)
    && /this\._rowSigs\.set\(row, rowSig\(text, svgSize, short\)\);/.test(displaySrc)
    && /kept\.forEach\(\(row, k\) => this\._relevel\(row, entries\[to \+ k\]\)\);/.test(displaySrc),
    'stack: a render keeps the rows of levels the change did not reach (same value, text, size, textbook setting and one-line form, not selected or marked) and only renumbers them, so a key on 50 formula levels takes half the time on a phone');
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  assert(/new ResizeObserver\(\(\) => \{\s*const selected = view\.querySelector\('\.st-row\.sel'\);\s*if \(selected\) this\._reveal\(selected\);\s*else if \(this\._fromBottom <= 2 && !view\.dataset\.empty\) view\.scrollTop = view\.scrollHeight;\s*this\._fromBottom = fromBottom\(view\);/.test(displaySrc)
    && /if \(this\._renderScroll\) return;\s*this\._fromBottom = fromBottom\(view\);/.test(displaySrc)
    && /this\._fromBottom = fromBottom\(view\);\s*const markEdges = this\._measureEdges\(\);/.test(displaySrc),
    'stack: level 1 stays in sight when the equation writer closes over the full keypad (the view grew, then shrank again in the same frame as the keys refit, and level 1 was left 13 px low), going by the distance from the bottom last seen on a scroll, render or resize; a selected level stays in sight instead, so turning the phone with level 8 selected no longer leaves it below a 216 px landscape view');
  assert(/view\.innerHTML = this\.emptyHtml;\s*view\.dataset\.empty = '1';\s*view\.scrollTop = 0;/.test(displaySrc),
    'stack: the empty-stack card starts at its heading, so the keyboard coming up over a 108 px well at 320x340 no longer pins it to the bottom with Write an equation cut under the app bar');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const barSrc = readFileSync(new URL('../www/src/ui/menubar.js', import.meta.url), 'utf8');
  const touch = css.slice(css.indexOf('@media (pointer: coarse)'));
  assert(/const count = pages > 1 \? `<sup>\$\{view\.page \+ 1\}\/\$\{pages\}<\/sup>` : '';/.test(barSrc)
    && /<span class="short">\$\{escapeHtml\(view\.short\)\}<\/span>\$\{count\}<\/button>/.test(barSrc)
    && />PREV\$\{count\}<\/button>/.test(barSrc) && />NXT\$\{count\}<\/button>/.test(barSrc)
    && /\.mb-pg sup \{ display: none; \}/.test(css.slice(0, css.indexOf('@media (pointer: coarse)')))
    && /@container work \(max-width: 359px\) \{\s*\.mb-menu sup \{ display: none; \}\s*\.mb-pg button:has\(sup\) \{ align-content: center; gap: 3px; \}\s*\.mb-pg sup \{ display: block;/.test(touch)
    && /@container work \(max-width: 319px\) \{\s*\.menubar \{ gap: 3px; padding-left: 4px; padding-right: 4px; \}\s*\.mb-menu \.i \{ display: block; \}\s*\.mb-menu \.short \{ display: none; \}\s*\.mb-keys \{ gap: 2px; \}\s*\.mb-pg button \{ min-width: 36px; padding: 0 2px; \}/.test(touch),
    'soft keys, touch: under 360 px the page count moves from the menu button onto NXT, and under 320 px the menu button keeps only its icon, so the six soft keys stay 32 px wide (with a level selected they were 22 px at 280 and 29 at 320)');
  assert(/:root\[data-theme="classic"\] \.sheet-view \{ --stack-ink: var\(--ink\); \}/.test(css),
    'Classic theme: VIEW\'s sheet shows the value in the sheet\'s ink, not the LCD\'s dark green (on the dark sheet it was 1.3:1, unreadable)');
  assert(/^  --lcd-dim: rgba\(28, 38, 24, \.8\);$/m.test(css), 'classic: the dim LCD ink reads at 4.8:1 at the LCD\'s darker edge and 5.5:1 at its centre (level numbers, tags and the writers\' notes read at 3.4:1 at .6)');
  assert((css.match(/^  --danger-ink: #1b1203;$/gm) || []).length === 1 && (css.match(/^  --danger-ink: #fff;$/gm) || []).length === 2
    && /\.bn-ico \{[^}]*background: var\(--danger\); color: var\(--danger-ink\);/.test(css) && /\.toast\.err \{ background: var\(--danger\); color: var\(--danger-ink\); \}/.test(css),
    'errors: an error toast and the error banner\'s icon take the ink their look\'s danger fill needs, dark on the dark and Classic looks\' salmon (white read at 2.7:1) and white on the light and Paper looks\' red');
  assert(/:root\[data-theme="classic"\] \.bn-prog mark \{ background: var\(--amber\); color: #1b1203; \}/.test(css),
    'classic: the halt banner\'s current word is dark on an amber block (amber on the LCD-green program box read at 1.1:1)');
  assert(/const program = kind === 'prompt' \? '' : programHtml;/.test(readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8')),
    'halt banner: a PROMPT shows its message and keys without the program\'s source, as the HP does; HALT and Step keep it');
  assert(/\.pal-row\.on \.d, \.ac-row\.on em \{ color: var\(--ink2\); \}/.test(css),
    'search: the highlighted command-search and autocomplete row\'s secondary text takes the brighter ink (--ink3 read at 4.0:1 on the row\'s fill in the dark look, 3.7 in Classic)');
  assert(/@container app \(max-width: 359px\) \{ \.st-acts \[data-row-act="convert"\] \{ display: none; \} \}/.test(css), 'stack: a unit level\'s Conv button waits in ⋯ under 360 px, as Plot does under 320');
  assert(/\.mb-menu \{ position: relative; \}\s*\.mb-menu::before \{ content: ""; position: absolute; inset: 0 -3px 0 -4px; \}/.test(touch.slice(touch.indexOf('@container work (max-width: 319px)'))),
    'soft keys, touch: under 320 px the 29 px menu button takes a finger into the bar\'s padding and the gap beside it (36 px)');
  assert(/@container app \(max-width: 319px\) \{\s*:root\[data-theme="classic"\] \.menubar \{ margin-inline: -10px; \}\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.menubar \{ margin: 0 -14px -14px; \}/.test(touch),
    'soft keys, touch, Classic theme: under 320 px the menu bar runs past the bezel to the screen edges, so its keys are 32 px at 280 too (they were 29, and 27 in minimal view)');
  assert(/:root\[data-theme="classic"\] \.ann-g\[role="button"\], :root\[data-theme="classic"\] \.status-line :is\(\.ann-m\.e, \.ann-m\.alarm\) \{ position: relative; \}\s*:root\[data-theme="classic"\] \.ann-g\[role="button"\]::before, :root\[data-theme="classic"\] \.status-line :is\(\.ann-m\.e, \.ann-m\.alarm\)::before \{ content: ""; position: absolute; inset: -14px -7px; \}/.test(touch),
    'Classic theme, touch: each mode annunciator takes a finger across its LCD row (they were 11 px tall, the only way to change a mode from minimal view\'s status line), and so does the editing pencil in full view');
  const narrowClassic = css.slice(css.indexOf('@container work (max-width: 359px) {\n  :root[data-theme="classic"][data-view="minimal"]'));
  assert(/^@container work \(max-width: 359px\) \{\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.status-line \{ gap: 8px; \}\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.ann-g > span:not\(\.on\) \{ display: none; \}\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.ann-g:not\(:has\(> \.on, > button\)\) \{ display: none; \}/.test(narrowClassic)
    && /:root\[data-theme="classic"\]\[data-view="minimal"\] \.ann-path \{ display: block; min-width: 0; \}/.test(narrowClassic.slice(0, narrowClassic.indexOf('\n}\n'))),
    'Classic theme, minimal view: on a phone under 390 px only the lit annunciators show, as on the HP\'s header, and the path ends in an ellipsis, so the menu and leave buttons stay on the line (at 280 and 300 px both were clipped off, leaving no way out of minimal view)');
}

{
  const { MenuBar } = await import('../www/src/ui/menubar.js');
  const { LONG_PRESS_MS } = await import('../www/src/ui/display.js');
  const on = {};
  const el = { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); } };
  const calls = [];
  const app = { menuView: () => ({ slots: [{ label: 'DUP', command: 'DUP' }] }), nextMenuPage: () => calls.push('next'), prevMenuPage: () => calls.push('prev'), pressSoftKey: (i) => calls.push(`press ${i}`), previewSoftKey: (i) => calls.push(`preview ${i}`), clearPreview: () => calls.push('clear') };
  new MenuBar({ el, app });
  const sk = { dataset: { i: '0' }, disabled: false, classList: { add() {}, remove() {} } };
  const target = { closest: (sel) => (sel === '.mb-keys' ? {} : sel.startsWith('.sk') ? sk : null) };
  const fire = (type, x, y = 100) => { for (const fn of on[type] ?? []) fn({ type, pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: y, target, preventDefault() {} }); };
  const hold = () => new Promise((r) => setTimeout(r, LONG_PRESS_MS + 50));
  fire('pointerdown', 200); await hold();
  assert(calls.join() === 'preview 0', 'soft keys, touch: a finger held on a command\'s key previews its result on the stack, as a mouse hovering does');
  fire('pointerup', 201);
  assert(calls[0] === 'preview 0' && calls.at(-1) === 'press 0' && calls.includes('clear'), 'soft keys, touch: lifting the held finger puts the preview away and runs the key');
  calls.length = 0;
  fire('pointerdown', 200); await hold(); fire('pointermove', 200, 60); fire('pointerup', 200, 60);
  assert(calls.join() === 'preview 0,clear', 'soft keys, touch: sliding the held finger away puts the preview away and runs nothing');
  calls.length = 0;
  fire('pointerdown', 200); fire('pointerup', 201);
  assert(!calls.some((c) => c.startsWith('preview')) && calls.at(-1) === 'press 0', 'soft keys, touch: a quick tap runs the key with no preview');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const touch = css.slice(css.indexOf('@media (pointer: coarse)'));
  assert(/\n\.st-more \{[^}]*white-space: nowrap; \}/.test(css)
    && /\.st-more::before \{ content: ""; position: absolute; inset: -7px -4px -10px; \}/.test(touch),
    'stack: the more-levels pill stays on one line (it wrapped to two at 280 px, and a three-digit count would at 320) and takes a 40 px tap on touch, from the stack\'s top edge down, without looking bigger');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(css.includes('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top, :root[data-keyboard] .input-hint,')
    && !css.includes('@media (max-height: 300px)'),
    'keyboard up: a 360 by 640 phone with its keyboard up (310 px) takes the short-screen rules, where an error banner left the stack 10 px and the soft keys ran off the bottom');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/^@media \(max-height: 330px\) \{[^@]*:root\[data-keyboard\]\[data-view="minimal"\] \.cmdline\.editing \{ border-color: color-mix\(in oklab, var\(--amber\) 60%, transparent\); box-shadow: 0 0 0 3px var\(--amber-dim\);/.test(short),
    'minimal view, keyboard up on a short screen: a level being edited outlines the command line in amber, since the status line and its edit pencil are hidden there and Enter would otherwise replace level 1 unannounced');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const classic = css.indexOf(':root[data-theme="classic"] .cmdline {');
  const editing = css.indexOf(':root[data-theme="classic"]:not([data-view="minimal"]) .cmdline.editing { border-color: color-mix(in oklab, var(--amber) 60%, transparent); box-shadow: inset 0 2px 6px rgba(0, 0, 0, .22), 0 0 0 3px var(--amber-dim); }');
  assert(classic > 0 && editing > classic,
    'Classic theme: a level being edited outlines the command line in amber, as the other themes do; its LCD border hid the mark, so with the keypad hidden and the keyboard up (no status line) Enter replaced level 1 unannounced');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/:root:is\(\[data-keyboard\], \[data-short\]\) \.bn:not\(\.halt\) \{ grid-template-columns: minmax\(0, 1fr\) auto; align-items: center; padding-block: 6px; \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.bn:not\(\.halt\) :is\(\.bn-ico, \.bn-d\) \{ display: none; \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.bn:not\(\.halt\) \.bn-f \{ grid-column: 1 \/ -1; flex-wrap: nowrap; overflow-x: auto;/.test(css)
    && /:root\[data-keyboard\] \.app:has\(\.bn\.halt\) \.key-strip \{ display: none; \}/.test(short)
    && /@container app \(min-width: 480px\) \{\s*:root\[data-keyboard\] \.app:has\(\.bn\) \.key-strip \{ display: none; \}\s*\/\*[^*]*\*\/\s*:root\[data-keyboard\] \.bn:not\(\.halt\) \{ grid-template-columns: minmax\(min\(12em, 40%\), 1fr\) minmax\(0, max-content\) auto; \}\s*:root\[data-keyboard\] \.bn:not\(\.halt\) \.bn-t \{ display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; \}/.test(short),
    'errors, keyboard up: the banner keeps to its title and fixes (the explanation waits for the keyboard to go), and on a short landscape screen puts them on one row in the key strip\'s place, so the command line stays in view (it was pushed below the keyboard at 280 px and in landscape), the title keeping 12em over two lines while five fixes scroll beside it (on a 640 px phone they left it "- can\'t co…")');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/:root:is\(\[data-keyboard\], \[data-short\]\) \.bn\.halt \{ display: flex; flex-wrap: wrap; align-items: center; padding-block: 6px; \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.bn\.halt \.bn-t \{ flex: 1 1 140px; \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.bn\.halt \.bn-f \{ flex: none; flex-wrap: nowrap; margin-top: 0; \}/.test(css),
    'halts, keyboard up: the banner is a wrapping row, its message taking at least 140 px beside the keys or the whole row above them (a grid gave a PROMPT\'s message 48 px beside its four keys at 280 px, so a long message grew the banner to 380 px and pushed the command line under the keyboard)');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  assert(/root\.toggleAttribute\('data-short', viewport\.height < 440\);/.test(html)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.eqw-ins, :root:is\(\[data-keyboard\], \[data-short\]\) \.mx-foot:not\(\.error\) \{ display: none; \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.eqw-canvas \{ max-height: calc\(var\(--app-height, 100dvh\) \* \.4\); \}/.test(css)
    && /:root:is\(\[data-keyboard\], \[data-short\]\) \.mx-grid-wrap \{ max-height: calc\(var\(--app-height, 100dvh\) \* \.35\); \}/.test(css)
    && !/:root\[data-keyboard\] \.eqw-ins/.test(css),
    'short windows: under 440 px the root carries data-short and the keyboard-up forms apply without a keyboard, so the writers\' hints and the banners\' explanations and icons wait (in a split screen at 360x370 the equation writer\'s hints pushed the soft keys 14 px under the edge; at 280x300 the matrix writer 16 px and a halt banner 5 px, the line\'s Enter with them)');
  assert(/@container work \(min-width: 520px\) \{\s*:root\[data-short\] \.mx \{ grid-template-columns: 1fr auto; align-items: end; \}\s*:root\[data-short\] \.mx \.writer-keys \.cmdline-go \{ flex: none; width: 40px; \}/.test(css)
    && /@container work \(min-width: 600px\) \{\s*:root\[data-short\] \.eqw \{ grid-template-columns: 1fr auto; align-items: end; \}\s*:root\[data-short\] \.eqw \.writer-keys \.cmdline-go \{ flex: none; width: 40px; \}/.test(css),
    'short windows: a landscape phone keeps the writers\' keys beside the matrix from a 520 px work column (a 3 by 3 grid lost 24 px of its last column at 496) and beside the formula from 600 px, as the keyboard-up layout does (under them the matrix writer left no whole level at 640x360 and one at 844x390; a full keypad beside a 640 px window left the formula 32 px, so the work column decides)');
  assert(/\.bn\.halt \.bn-t \{ white-space: pre-wrap; \}/.test(css),
    'AUR: MSGBOX, PROMPT and INPUT keep a message\'s line breaks, where "Line 1" 10 CHR + "Line 2" + MSGBOX showed Line 1 Line 2 on one line');
  assert(/:root\[data-short\]:not\(\[data-keyboard\]\) \.bn \.bn-t \{ max-height: 2\.7em; overflow-y: auto; \}/.test(css),
    "short windows: a banner's message keeps to two lines and scrolls where no keyboard hides the app bar (Classic's narrower banner wrapped a long PROMPT to three lines at 280x300 and pushed the soft keys 6 px off)");
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/@container app \(min-width: 480px\) \{\s*:root\[data-keyboard\] \.mx, :root\[data-keyboard\] \.eqw \{ grid-template-columns: 1fr auto; align-items: end; \}\s*:root\[data-keyboard\] \.writer-keys \.cmdline-go \{ flex: none; width: 40px; \}/.test(short)
    && !/\n  :root\[data-keyboard\] \.mx, :root\[data-keyboard\] \.eqw \{ grid-template-columns/.test(short),
    'writers, keyboard up: their keys sit beside the formula or matrix only on a short screen at least 480 px wide; a 280 px phone with 270 px left keeps them under it (beside it, the matrix ran off the left edge and the equation writer\'s keys off the right)');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/:root\[data-keyboard\] \.status-line, :root\[data-keyboard\] \.appbar, :root\[data-keyboard\] \.menubar/.test(short)
    && /:root\[data-keyboard\] \.app \{ grid-template-rows: minmax\(0, 1fr\); \}/.test(short),
    'keyboard up on a short screen: the app bar steps aside while you type, as minimal view\'s status line does, so a landscape phone with the keypad hidden shows level 1 whole above the line (it had 10 px of stack) and a 568 by 120 view keeps the key strip on screen');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  const landscape = short.slice(short.indexOf('@container app (min-width: 480px)'), short.indexOf('/* A halted program'));
  assert(/:root\[data-keyboard\] \.cmdline \.cm-scroller \{ max-height: 2lh; \}/.test(landscape)
    && /:root\[data-keyboard\]\[data-view="minimal"\] \.input \{ padding-block: 4px; \}/.test(landscape),
    'EDIT, landscape keyboard up: the line keeps to two lines and minimal view drops its padding, so at 740 by 160 the key strip and level 1 stay on screen (an edited program took four lines and put the strip 15 px under the edge)');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/\.ref \.acts \{ flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; position: sticky; bottom: 0;[^}]*background: var\(--panel\); \}/.test(short.slice(0, short.indexOf('\n}\n')))
    && /\n\.ref \.acts \{ display: flex; flex-wrap: wrap; gap: 6px; \}/.test(css),
    'reference, short window: Run and Insert keep to one row pinned at the foot of the drawer under 300 px tall, so a completion row held in landscape with the keyboard up shows Insert (it sat at 162 px of 160)');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/case 'sharen': \{\s*const text = Array\.from\(\{ length: level \}, \(_, i\) => formatSource\(this\.stack\.peek\(level - i\)\)\)\.join\('\\n'\);\s*this\.shareText\(text, shareLink\(text, location\.href\)\);/.test(appSrc)
    && /typeof navigator\.share === 'function' && level > 1 \? item\('sharen', 'share', `Share levels 1–\$\{level\}…`\) : ''/.test(appSrc),
    'stack: a level\'s ⋯ menu shares levels 1 to it as their source, deepest first and one to a line, with a link, so the link or the share target puts them on the command line and Enter rebuilds the stack');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/deeper \? item\('roll', 'up', 'Move to level 1 \(ROLL\)'\) : ''/.test(appSrc)
    && /deeper \? item\('rolld', 'down', 'Move level 1 here \(ROLLD\)'\) : ''/.test(appSrc)
    && /deeper \? item\('dupn', 'copy', `Copy \$\{span\} \(DUPN\)`\) : ''/.test(appSrc)
    && /deeper \? item\('dropn', 'trash', `Drop \$\{span\} \(DRPN\)`\) : ''/.test(appSrc)
    && /const span = deeper \? `levels 1–\$\{level\}` : 'level 1';/.test(appSrc)
    && /\$\{level > 1 \? '<button type="button" data-row-act="roll"/.test(appSrc),
    'stack: level 1\'s ⋯ menu leaves out ROLL and ROLLD, which do nothing there, and DUPN and DRPN, which repeat PICK and Drop, says "level 1" where it said "levels 1–1", and its toolbar has no Roll');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/\{ label: 'LEVEL', [^\n]+\n\s+\{ label: 'INFO', title: 'Its type and size', onPress: act\('info'\) \}/.test(appSrc)
    && /item\('info', 'info', 'Type and size \(INFO\)'\)/.test(appSrc)
    && /case 'info': this\._levelInfo\(level\); return;/.test(appSrc)
    && /const result = \(name\) => \{ const s = new Stack\(\); s\.pushMany\(\[value\]\); lookup\(name\)\.fn\(s\); return s\.peek\(1\)\.value; \};/.test(appSrc),
    'stack: a level has the HP interactive stack\'s INFO after LEVEL, on its soft keys and in its ⋯ menu, which notes its type, TYPE and BYTES from a copy, leaving the stack and LASTARG alone');
  assert(/const size = isList\(value\) \? count\(value\.items\.length, 'item'\) : isVector\(value\) \? count\(value\.items\.length, 'element'\)\s*: isMatrix\(value\) \? `\$\{value\.rows\.length\}×\$\{value\.rows\[0\]\?\.length \?\? 0\}` : '';/.test(appSrc)
    && appSrc.includes("this.toast(`Level ${level}: ${[describeValue(value).type, size, `TYPE ${Number(result('TYPE'))}`, `${result('BYTES')} bytes`].filter(Boolean).join(' · ')}`);"),
    'stack: INFO leads with the type name its level menu\'s heading uses, then a size for a list, vector or matrix (List · 3 items, Matrix · 2×2), where some notes read "a list of 3 items" and others "Complex number"');
}

{
  const { Autocomplete } = await import('../www/src/ui/autocomplete.js');
  const fit = (top, height, onTop) => {
    const el = { style: {}, scrollTop: 0, offsetHeight: height, getBoundingClientRect: () => ({ top, bottom: top + height }), querySelector: () => ({ offsetTop: onTop, offsetHeight: 30 }) };
    Object.defineProperty(el, 'clientHeight', { get: () => Math.min(height, parseFloat(el.style.maxHeight) || Infinity) });
    Autocomplete.prototype._fit.call({ el });
    return `${el.style.maxHeight}/${el.scrollTop}`;
  };
  assert(fit(40, 178, 140) === '/0', 'autocomplete: with room above the line the list keeps its height and does not scroll');
  assert(fit(-26, 178, 0) === '146px/0', 'autocomplete: 26 px over the top of the screen, the list is capped to the room above the line (152 - 6) with the first row in view');
  assert(fit(-26, 178, 150) === '146px/34', 'autocomplete: the chosen row scrolls into the capped list (150 + 30 - 146)');
  assert(fit(-148, 178, 0) === '30px/0', 'autocomplete: one whole row (30 px here, 40 on touch) remains in landscape with the keyboard up');
  assert(/\.ac \{[^}]*overflow: hidden auto;/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8')), 'autocomplete: the list scrolls when capped');

  const { Entry } = await import('../www/src/ui/entry.js');
  const entry = new Entry(new Stack());
  entry.hasFocus = () => true;
  const ac = Object.assign(Object.create(Autocomplete.prototype), {
    app: { entry, inputMode: 'rpl', errorBanner: null }, el: { hidden: true }, rows: [], index: 0, word: null, shown: null, _dismissedWord: null,
  });
  ac._render = function () { this.el.hidden = false; };
  entry.subscribe(() => ac.update());
  const key = (k) => ac._onKey({ key: k, preventDefault() {}, stopPropagation() {} });
  entry.type('1 SI');
  const typedRows = ac.rows.map((r) => r.name).join(' ');
  key('ArrowDown');
  assert(entry.buffer === `1 ${ac.rows[1].name}` && ac.isOpen() && ac.rows.map((r) => r.name).join(' ') === typedRows,
    'autocomplete: ↓ puts the highlighted completion in the line and keeps the list made for what was typed');
  key('ArrowUp');
  key('ArrowUp');
  assert(entry.buffer === `1 ${ac.rows[ac.rows.length - 1].name}`, 'autocomplete: ↑ past the first row wraps to the last and puts it in the line');
  key('Escape');
  assert(entry.buffer === '1 SI' && !ac.isOpen(), 'autocomplete: Esc puts back what was typed and closes the list');
  entry.type('N');
  key('ArrowDown');
  const chosen = ac.rows[1].name;
  key('Tab');
  assert(entry.buffer === `1 ${chosen} ` && !ac.isOpen(), 'autocomplete: Tab after ↓ completes the chosen command with its space');
  entry.hasFocus = () => false;
  entry.resetBuffer('');
  entry.type('2 S');
  const unfocused = ac.isOpen();
  entry.type('I');
  ac.app.typingOnKeypad = true;
  entry.type('N');
  ac.app.typingOnKeypad = false;
  assert(!unfocused && ac.isOpen() && ac.rows[0].name === 'SIN',
    'autocomplete: letters typed on the keypad, which leaves the line unfocused, bring up the list as a keyboard\'s do');
  assert(/handleKey\(key, opts\) \{\s*this\.typingOnKeypad = true;\s*try \{ this\._handleKey\(key, opts\); \} finally \{ this\.typingOnKeypad = false; \}/.test(readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8'))
    && /document\.addEventListener\('pointerdown', \(e\) => \{ if \(this\.isOpen\(\) && !e\.target\.closest\?\.\('\.ac, \.keys, #cmdline'\)\) this\.close\(\); \}, true\);/.test(readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8')),
    'autocomplete: a keypad key counts as typing on the line, and a tap outside the list, the keypad and the line closes it, since no focusout comes');
  const acSrc = readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8');
  assert(/completions\(at\.word, \{ names: allOps\(\)\.map\(\(n\) => lookup\(n\)\.name\)/.test(acSrc),
    'autocomplete: commands are offered as the HP spells them, →Qπ, erf and lim, where the list showed →QΠ, ERF and LIM');
  assert(/if \(e\.pointerType === 'mouse' \|\| row\?\.kind !== 'command'\) return;/.test(acSrc)
    && /const fire = \(\) => \{ hold = null; held = true; this\.app\.buzzHold\(\); this\.close\(\); this\.app\.drawers\.showReference\(row\.name\); \};/.test(acSrc)
    && /document\.addEventListener\('click', \(e\) => \{ if \(held\) \{ held = false; e\.preventDefault\(\); e\.stopPropagation\(\); \} \}, true\);/.test(acSrc),
    'autocomplete: a finger held on a command\'s row opens its reference, as → does, and the lift\'s click completes nothing');
  const { Drawers } = await import('../www/src/ui/drawer.js');
  const insert = (ref) => Drawers.prototype._insertReferenced.call({ cat: { ref }, reference: null, app: { entry } });
  entry.resetBuffer('');
  entry.type('2 si');
  insert('SIN');
  const replaced = entry.buffer;
  entry.resetBuffer('');
  entry.type('2 X');
  insert('SIN');
  assert(replaced === '2 SIN ' && entry.buffer === '2 X SIN ',
    'reference Insert: SIN replaces the si half typed at the cursor (the word a held completion row opened the page from), and follows a word it does not complete');
  entry.resetBuffer('');
  entry.type('3 R->');
  insert('R→B');
  assert(entry.buffer === '3 R→B ', 'reference Insert: R→B replaces R-> typed on a phone keyboard, which completes to it');
}

{
  const acSrc = readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8');
  assert(/const foot = onTouch\(\) \? '<span>Tap completes · hold for the reference<\/span><span>Tap elsewhere closes<\/span>'/.test(acSrc),
    'autocomplete: on touch the list\'s footer (shown from 521 px, a landscape phone) speaks of taps and holds, not Tab, arrows and Esc');
}

{
  const acSrc = readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const ends = [];
  const el = { scrollTop: 0, clientHeight: 40, scrollHeight: 268, classList: { toggle: (c, on) => on && ends.push(c) } };
  const markEnds = new Function(`return ${acSrc.match(/const markEnds = (\(el\) => \{[\s\S]*?\n\});/)[1]}`)();
  markEnds(el);
  const atTop = ends.join(' ');
  ends.length = 0;
  Object.assign(el, { scrollTop: 228 });
  markEnds(el);
  assert(atTop === 'more-b' && ends.join(' ') === 'more-t'
    && /this\._fit\(\);\s*markEnds\(this\.el\);/.test(acSrc) && /this\.el\.addEventListener\('scroll', \(\) => markEnds\(this\.el\), \{ passive: true \}\);/.test(acSrc)
    && /\.ac::before, \.ac::after \{ content: ''; position: sticky;/.test(css) && /\.ac\.more-t::before, \.ac\.more-b::after \{ opacity: 1; \}/.test(css),
    'autocomplete: a list the keyboard caps fades at the edge it continues past, as the key strip and levels do, so the one row left in landscape shows there are more');
  assert(/window\.addEventListener\('resize', \(\) => requestAnimationFrame\(\(\) => \{\s*if \(!this\.isOpen\(\)\) return;\s*this\._fit\(\);\s*markEnds\(this\.el\);/.test(acSrc),
    'autocomplete: an open list fits the window again a frame after it resizes, as a popover does, so turning the phone with the keyboard up no longer leaves it running off the top');
}

{
  const acSrc = readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8');
  assert(/const banner = globalThis\.document\?\.getElementById\('banner'\)\?\.offsetHeight;\s*this\.el\.style\.bottom = banner \? `calc\(100% - 2px \+ \$\{banner\}px\)` : '';/.test(acSrc),
    'autocomplete: with a program\'s banner above the line the list sits above it, so INPUT\'s question and PROMPT\'s keys stay in view');
  assert(/const sig = info\?\.signature \?\? row\.group \?\? '';/.test(acSrc) && /\$\{sig \? '' : ' nosig'\}/.test(acSrc)
    && /\.ac-row\.nosig span \{ display: block; \} \.ac-row\.nosig em \{ display: none; \}/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8')),
    'autocomplete: under 720 px, where a row shows its stack diagram only, a row with none (a variable, GCD) shows its type or description instead of nothing');
}

{
  const { Autocomplete } = await import('../www/src/ui/autocomplete.js');
  const { Entry } = await import('../www/src/ui/entry.js');
  const entry = new Entry(new Stack());
  entry.hasFocus = () => true;
  const ac = Object.assign(Object.create(Autocomplete.prototype), {
    app: { entry, inputMode: 'rpl', errorBanner: null }, el: { hidden: true }, rows: [], index: 0, word: null, shown: null, _dismissedWord: null,
  });
  ac._render = function () { this.el.hidden = false; };
  entry.subscribe(() => ac.update());
  entry.type('9.8_k');
  const units = ac.isOpen() && ac.rows.every((r) => r.kind === 'unit') && ac.word.word === 'k';
  ac.accept(1);
  assert(units && entry.buffer === '9.8_kg', 'autocomplete: after a number\'s _ the list offers units, and a chosen one completes the unit with no space after it');
  entry.resetBuffer('');
  entry.type('5f');
  const bare = ac.isOpen() && ac.rows.every((r) => r.kind === 'unit') && ac.word.word === 'f' && ac.word.glue === '_';
  ac.accept(ac.rows.findIndex((r) => r.name === 'ft'));
  const picked = entry.buffer;
  const exponents = ['2e', '1E5', '2.5e'].map((typed) => { entry.resetBuffer(''); entry.type(typed); return ac.isOpen() && ac.rows.some((r) => r.kind === 'unit'); });
  const acSource = readFileSync(new URL('../www/src/ui/autocomplete.js', import.meta.url), 'utf8');
  assert(bare && picked === '5_ft' && !exponents.some(Boolean) && /const label = escapeHtml\(this\.word\.glue \?\? ''\) \+/.test(acSource),
    'autocomplete: letters typed straight after a number offer units, a pick putting in the _ a phone keyboard keeps a page away (5f gives 5_ft, the rows reading _ft); an exponent\'s E offers none');
  entry.resetBuffer('');
  entry.type('« → rate time « r');
  const local = ac.rows[0]?.kind === 'local' && ac.rows[0].name === 'rate';
  ac.accept(0);
  assert(local && entry.buffer === '« → rate time « rate ', 'autocomplete: inside a program the → locals are offered first, and a chosen one is a word with its space');
  entry.resetBuffer('');
  entry.type('<< 7 0 > if');
  const structure = ac.rows[1]?.kind === 'structure' && ac.rows[1].name === 'IF … THEN … ELSE … END';
  ac.accept(1);
  assert(structure && entry.buffer === '<< 7 0 > IF  THEN  ELSE  END ' && entry.cursor === 12 && !ac.isOpen(),
    'autocomplete: a structure row typed as if types the whole structure in its place, the cursor after IF, as BRCH\'s ⇦ does');
  entry.resetBuffer('');
  entry.type('1 3 for');
  ac.accept(0);
  assert(entry.buffer === '1 3 « FOR  NEXT  »' && entry.cursor === 10, 'autocomplete: a structure chosen outside a program opens one around it, as BRCH\'s keys do');
}

{
  const { Autocomplete } = await import('../www/src/ui/autocomplete.js');
  const { Entry } = await import('../www/src/ui/entry.js');
  const { state: calcState } = await import('../www/src/rpl/state.js');
  const entry = new Entry(new Stack());
  entry.hasFocus = () => true;
  const ac = Object.assign(Object.create(Autocomplete.prototype), {
    app: { entry, inputMode: 'rpl', errorBanner: null }, el: { hidden: true }, rows: [], index: 0, word: null, shown: null, _dismissedWord: null,
  });
  ac._render = function () { this.el.hidden = false; };
  entry.subscribe(() => ac.update());
  const halted = calcState.halted;
  calcState.halted = { kind: 'input' };
  entry.type('SI');
  const duringInput = ac.isOpen();
  calcState.halted = { kind: 'prompt' };
  entry.type('N');
  const duringPrompt = ac.isOpen();
  calcState.halted = halted;
  assert(!duringInput && duringPrompt, 'autocomplete: an INPUT\'s answer, text the program reads, brings up no command completions; a PROMPT\'s line still does');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/setMenuHook\(\(list, temporary, title = null\) => \{\s*if \(!list\) this\.showLastMenu\(\);\s*else if \(temporary\) this\.setMenu\(this\._customMenuSlots\(list\), 'TMENU', \{ folder: title \}\);\s*else this\.showMenu\('CST', \{ commit: false \}\);/.test(appSrc)
    && /showCustomMenu\(\{ commit = true, refresh = false \} = \{\}\) \{\s*if \(commit && !refresh && this\.entry\.buffer/.test(appSrc) && /showLastMenu\(\) \{[\s\S]{0,300}?else this\.showMenu\(last\.kind, \{ commit: false \}\);/.test(appSrc),
    'MENU and TMENU show their menu through a hook without committing the line they run from (which would run it again), a temporary one under the kind TMENU and the name of the command that made it');
  assert(/else this\.showMenu\('CST', \{ commit: false \}\);\s*if \(this\.prefs\.minimal\) this\.setMinimalMenu\(true\);\s*\}\);/.test(appSrc),
    'MENU and TMENU turn the soft keys on in minimal view, as a menu picked from command search does, instead of showing nothing while they are hidden');
  assert(/else if \(this\.menuKind === 'CST'\) this\.showCustomMenu\(\{ refresh: true \}\);/.test(appSrc)
    && /showCustomMenu\(\{ commit = true, refresh = false \} = \{\}\) \{\s*if \(commit && !refresh && this\.entry\.buffer/.test(appSrc)
    && /this\.setMenu\(\[\], 'CST', \{ preservePage: refresh \}\);\s*if \(!refresh\) this\.toast\(/.test(appSrc) && /this\.setMenu\(this\._customMenuSlots\(list\), 'CST', \{ preservePage: refresh \}\);/.test(appSrc),
    'the CST soft keys follow CST as it changes (STO, PURGE, UNDO) while the menu shows, as the VARS keys do, keeping their page and without the empty-CST note');
  assert(/const list = isName\(cst\) \? varRecall\(cst\.id\) : cst;/.test(appSrc), 'the custom menu follows a name stored in CST to the list it holds, as the HP does');
  assert(/\.pop \.opt, \.pop \.grid button, \.pop \.layers button, \.ac-row \{ min-height: 40px; \}/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8')), 'autocomplete rows take a finger on touch, as the popover rows do');
  assert(/@media \(pointer: coarse\) \{[\s\S]*?\.pop \.opt b \{ white-space: normal; overflow-wrap: anywhere; \}/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8')),
    'popover rows wrap on touch, so a level menu at 280 px keeps (ECHO) and (LEVEL) in sight');
}

{
  const [cst] = parseEntry('{ SIN { "Sq" « SQ » } { "Tri" { « 1 + » « 10 + » « 100 + » } } { "Two" { 1 2 } } { 1 2 3 } :Tag:7 { "One" { 5 } } }');
  const e = (i) => { const { label, main, left, right } = customMenuEntry(cst.items[i]); return `${label}|${format(main)}|${left ? format(left) : '-'}|${right ? format(right) : '-'}`; };
  assert(e(0) === 'SIN|SIN|-|-', 'custom menu: an object on its own is its own label and action');
  assert(e(1) === 'Sq|« SQ »|-|-', 'custom menu: { "label" action } labels the key and acts with the object, as on the HP');
  assert(e(2) === 'Tri|« 1 + »|« 10 + »|« 100 + »', 'custom menu: { "label" { action ⇦action ⇨action } } gives the shifted keys their own objects');
  assert(e(3) === 'Two|1|2|-', 'custom menu: a two-object action list leaves the right shift empty');
  assert(e(4) === '{ 1 2 3 }|{ 1 2 3 }|-|-', 'custom menu: a three-element list is a value, not a pair');
  assert(e(5) === 'Tag|7|-|-', 'custom menu: a tagged item keeps its tag as the label');
  assert(e(6) === 'One|{ 5 }|-|-', 'custom menu: a one-object action list is a list value, as on the HP');
  assert(customMenuLabel(cst.items[1].items[0]) === 'Sq' && customMenuLabel(cst.items[0]) === 'SIN', 'custom menu: a string label reads as its text, a name as its id');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/const \{ label, main, left, right \} = customMenuEntry\(item\);\s*const shifted = !!\(left \|\| right\);/.test(appSrc)
    && /onPressL: shifted \? press\(left\) :/.test(appSrc) && /onPressR: shifted \? press\(right\) :/.test(appSrc)
    && /onHold: shifted \? \(anchor\) => this\._heldKeyMenu\(\[\[left, '⇦'\], \[right, '⇨'\]\]\.filter\(\(\[t\]\) => t\)\.map\(\(\[t, mark\]\) => \(\{ text: customMenuLabel\(t\), mark, run: press\(t\) \}\)\), anchor, label\) : null,/.test(appSrc),
    'custom menu: a key with shifted objects presses them with ⇦ and ⇨ and offers them under a held finger, while a plain key keeps types-it and recalls-it');
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  assert(/const key = \(bn, label, title, ico, cls = ''\) => `<button type="button" class="chip\$\{cls \? ` \$\{cls\}` : ''\}" data-bn="\$\{bn\}" title="\$\{title\}" aria-label="\$\{label\}">\$\{icon\(ico, 'sm'\)\}<span>\$\{label\}<\/span><\/button>`;/.test(bannerSrc)
    && /if \(kind === 'msgbox'\) return `<div class="bn halt msgbox" role="status">[\s\S]*?\$\{message\}<div class="bn-f">\$\{key\('cont', 'OK', 'CONT', 'check', 'pri'\)\}<\/div><\/div>`;/.test(bannerSrc),
    'MSGBOX: its banner is the message with one OK key that continues the program, no program source or debugger keys');
  assert(/if \(id === 'PROMPT' \|\| id === 'MSGBOX'\) \{[\s\S]{0,200}?_markSuspend\(toks, i \+ 1, id === 'PROMPT' \? 'prompt' : 'msgbox', null, s\.pop\(\)\);/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8')),
    'MSGBOX halts a running program the way PROMPT does, under its own kind');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  assert(displaySrc.includes(`const haltMark = halted ? '<span class="ann-m l halt">HALT</span>' : '';`)
    && /\.ann-m:is\(\.halt, \.user\) \{ padding: 0; font-size: 11px; letter-spacing: 0; \}\s*\.ann-status:has\(\.ann-m\.halt, \.ann-m\.alarm, \.ann-m\.user\) button\.ann-m \{ min-width: 28px; \}\s*@container app \(max-width: 359px\) \{ \.ann-status:has\(\.ann-m\.halt, \.ann-m\.alarm, \.ann-m\.user\) \{ padding-left: 6px; padding-right: 4px; \} \}/.test(css)
    && /\.ann-status:has\(\.ann-m\.halt, \.ann-m\.user\):has\(\.ann-m\.e, \.ann-m\.alarm\) button\.ann-m\[data-mode="exact"\],\s*\.ann-status:has\(\.ann-m\.e\):has\(\.ann-m\.alarm\) button\.ann-m\[data-mode="exact"\] \{ display: none; \}/.test(css),
    'minimal view: the HALT annunciator is small and tight beside the modes, which give room as under 320 px, so the leave button stays on screen while a program is halted (it ended 21 px off a 280 px screen, 13 at 320); with a level being edited too, the exact mode gives way under 320 px');
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  assert(/const title = kind === 'prompt' && prompt \? prompt : `\$\{HALT_TITLES\[kind\] \?\? HALT_TITLES\.halt\}\$\{prompt \? ` · \$\{prompt\}` : ''\}`;/.test(bannerSrc)
    && /<div class="bn-t">\$\{escapeHtml\(title\)\}<\/div>/.test(bannerSrc),
    'PROMPT: its message is the banner\'s title, as MSGBOX\'s is, no longer an afterthought behind "The program is waiting for you"; the generic title stays for a PROMPT without a message');
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(kind === 'input'\) return `<div class="bn halt input" role="status">[\s\S]*?\$\{message\}<div class="bn-f">\$\{key\('ok', 'OK', 'Enter: answer with the command line', 'check', 'pri'\)\}\$\{STOP_KEY\}<\/div><\/div>`;/.test(bannerSrc)
    && /if \(calcState\.halted\?\.kind === 'input'\) \{ this\._acceptInput\(\); return; \}\s*if \(this\._answerKey\(hpKeyCode\('ENTER'\)\)\) return;\s*this\.entry\.enter\(\);/.test(appSrc)
    && /_beginDialog\(halted\) \{\s*this\._dialogHalt = halted;\s*if \(halted\.kind === 'wait'\) \{ this\._beginWait\(halted\); return; \}\s*queueMicrotask\(\(\) => \{\s*if \(calcState\.halted !== halted\) return;\s*if \(halted\.kind === 'input'\) \{\s*if \(this\.inputMode !== 'rpl'\) this\._closeWriter\(\(mode\) => `Put the \$\{mode\} aside for the program's INPUT`\);\s*this\.entry\.recall\(halted\.dialog\.text\);\s*if \(halted\.dialog\.cursor != null\) this\.entry\.cursor = halted\.dialog\.cursor;\s*if \(halted\.dialog\.alpha && this\.shift !== 'alphaLock'\) \{ this\._dialogAlpha = true; this\.setShift\('alphaLock'\); \}\s*\} else if \(halted\.kind === 'inform'\) this\.showInformSheet\(\);\s*else this\.showChooseList\(\);/.test(appSrc)
    && /_acceptInput\(\) \{[\s\S]{0,200}?if \(dialog\.verify\) \{ try \{ parseTyped\(text\); \} catch \(e\) \{ this\.entry\.flashError\(e\); return; \} \}\s*this\.entry\.cancel\(\);\s*this\._continueProgram\(Str\(text\)\);/.test(appSrc)
    && /_continueProgram\(\.\.\.answers\) \{\s*const op = \{ over: 'SST', into: 'SST↓' \}\[calcState\.halted\.stepping\] \?\? 'CONT';\s*if \(calcState\.halted\.kind !== 'wait'\) touchLcd\(\);\s*const resume = \(\) => \{ for \(const a of answers\) this\.stack\.push\(a\); lookup\(op\)\.fn\(this\.stack, this\.entry\); \};\s*this\.entry\.safeRun\(\(\) => this\.stack\.holdEmit\(\(\) => batchStateNotifications\(resume\)\), op, \{ keepPartial: true \}\);/.test(appSrc)
    && /const stepping = _singleStepMode \? \(_stepInto \? 'into' : 'over'\) : null;\s*_pendingSuspend = \{ tokens, index, kind, dialog, stepping, prompt \};/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8'))
    && /if \(act === 'ok' && kind === 'input'\) \{ this\._acceptInput\(\); return; \}\s*if \(act === 'cont' && kind === 'msgbox'\) \{ this\._continueProgram\(\); return; \}[\s\S]{0,400}?if \(act === 'kill' && kind === 'input'\) this\.entry\.cancel\(\);/.test(appSrc),
    "INPUT: its banner is the prompt with OK and Stop keys and no program source; the text it offers goes on the command line once the line that ran the program has cleared; Enter or OK hands the line back as a string (with V only once it parses) and goes on without an undo step of its own, as MSGBOX's OK does, so UNDO after the program takes the whole run back rather than stopping between its answers, and a dialog reached while stepping steps on with SST or SST↓ rather than running the program out; Stop clears the line before KILL");
  assert(/if \(id === 'INPUT'\) \{[\s\S]{0,260}?_markSuspend\(toks, i \+ 1, 'input', input, s\.pop\(\)\);/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8')),
    'INPUT halts a running program the way PROMPT does, carrying the text to offer');
  assert(/this\.entry\.recall\(halted\.dialog\.text\);\s*if \(halted\.dialog\.cursor != null\) this\.entry\.cursor = halted\.dialog\.cursor;/.test(appSrc),
    "INPUT: the HP's cursor position (n from the left, or { row col }, 0 the end of the row) places the cursor in the offered text");
  assert(/_endDialog\(\) \{\s*if \(this\._dialogAlpha\) \{ this\._dialogAlpha = false; if \(this\.shift === 'alphaLock'\) this\.setShift\(null\); \}/.test(appSrc)
    && /const named = \(id\) => v\.items\.some\(\(item\) => isName\(item\) && item\.id === id\);\s*return \{ text, verify: named\('V'\), cursor: pos \? inputCursor\(text, pos\) : null, alpha: named\('α'\) \};/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8')),
    "INPUT's α locks alpha on the keypad while the program waits, and the lock goes when the dialog ends unless it was on already");
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const { chooseEntry } = await import('../www/src/ui/menus.js');
  const { RList: L, Str: S, Integer: I, Name: N } = await import('../www/src/rpl/types.js');
  const pair = chooseEntry(L([S('Large'), I(2n)])), plain = chooseEntry(N('X')), triple = chooseEntry(L([I(1n), I(2n), I(3n)]));
  assert(pair.label === 'Large' && pair.value.value === 2n && plain.label === 'X' && plain.value.id === 'X' && triple.label === '{ 1 2 3 }' && triple.value.items.length === 3,
    'CHOOSE: a { display result } pair shows the first and returns the second, while any other object, a longer list included, shows as itself and is the result');
  assert(/if \(kind === 'choose'\) return `<div class="bn halt choose" role="status">[\s\S]*?<div class="bn-t">\$\{escapeHtml\(prompt \|\| \(dialog\?\.pos \? 'Choose' : 'View'\)\)\}<\/div><div class="bn-f">\$\{dialog\?\.pos \? key\('choose', 'Choose', [^)]*'menu', 'pri'\) : key\('choose', 'View', [^)]*'menu', 'pri'\)\}\$\{key\('cancel', 'Cancel', [^)]*'x'\)\}\$\{STOP_KEY\}<\/div><\/div>`;/.test(bannerSrc)
    && /showChooseList\(\) \{\s*const \{ items, pos \} = calcState\.halted\.dialog;[\s\S]{0,400}?mark: i \+ 1 === pos \? icon\('check', 'sm'\) : '', on: i \+ 1 === pos, run: \(\) => this\._answerChoice\(i \+ 1\)[\s\S]{0,200}?this\._chooseList = this\._heldKeyMenu\(rows, \$\('banner'\)\.querySelector\('\.bn'\), pos \? 'Choose' : 'View', \{ above: true, onArrow: pos \? \(d\) => this\._moveChoice\(d\) : null, className: 'choose' \}\);\s*this\._revealChoice\(true\);/.test(appSrc)
    && /_heldKeyMenu\(options, anchor, label, \{ above = false, onArrow = null, className = '' \} = \{\}\) \{[\s\S]{0,400}?keepFocus: true,\s*above,\s*onArrow,\s*className,/.test(appSrc)
    && /if \(\(this\._above \|\| top \+ h > vh - margin\) && r\.top - h - 6 >= margin\) top = r\.top - h - 6;/.test(readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8'))
    && /if \(act === 'choose' && kind === 'choose'\) \{ this\.showChooseList\(\); return; \}\s*if \(act === 'form' && kind === 'inform'\) \{ this\.showInformSheet\(\); return; \}\s*if \(act === 'cancel' && \(kind === 'choose' \|\| kind === 'inform'\)\) \{ this\._continueProgram\(Integer\(0n\)\); return; \}/.test(appSrc)
    && /if \(this\._dialogHalt && this\._dialogHalt !== halted\) this\._endDialog\(\);\s*if \(halted\?\.dialog && this\._dialogHalt !== halted\) this\._beginDialog\(halted\);/.test(appSrc)
    && /_endDialog\(\) \{\s*if \(this\._dialogAlpha\) \{[^}]*\}\s*if \(this\._dialogHalt\.kind === 'choose'\) this\.popover\.close\(\{ restoreFocus: false \}\);\s*if \(this\._dialogHalt\.kind === 'inform' && this\.sheets\.kind === 'inform'\) this\.sheets\.close\(\);\s*clearTimeout\(this\._waitTimer\);\s*this\._dialogHalt = null;/.test(appSrc)
    && /if \(id === 'CHOOSE'\) \{[\s\S]{0,300}?_markSuspend\(toks, i \+ 1, 'choose', choose, s\.pop\(\)\);/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8')),
    "CHOOSE: its banner is the prompt with Choose, Cancel and Stop keys; the choices open in the held-key popover above the banner (below the chip it covered Stop and the command line), the highlighted one marked, a tap answering with the choice and 1 (0 when none is highlighted), Cancel with 0, and the list goes when its dialog ends (a press on the banner's keys leaves a popover anchored to the banner open); it halts a running program the way INPUT does, carrying its choices");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(this\._enterAnswersDialog\(\)\) return;\s*if \(calcState\.halted\?\.kind === 'input'\) \{ this\._acceptInput\(\); return; \}/.test(appSrc)
    && /onCommit: \(\) => \{ if \(this\._answerKey\(hpKeyCode\('ENTER'\)\) \|\| this\._enterAnswersDialog\(\)\) return; if \(!this\._runChord\('Enter'\)\) this\.commitEntry\(\); \},/.test(appSrc)
    && /_enterAnswersDialog\(\) \{\s*const kind = calcState\.halted\?\.kind;\s*if \(this\.entry\.buffer\.trim\(\) \|\| !\(kind === 'choose' \|\| kind === 'msgbox'\)\) return false;\s*if \(kind === 'msgbox'\) this\._continueProgram\(\);\s*else this\._answerChoice\(calcState\.halted\.dialog\.pos\);\s*return true;/.test(appSrc)
    && /_answerChoice\(n\) \{\s*const \{ items, pos \} = calcState\.halted\.dialog;\s*if \(!pos\) \{ this\._continueProgram\(Integer\(0n\)\); return; \}\s*this\._continueProgram\(chooseEntry\(items\[n - 1\]\)\.value, Integer\(1n\)\);/.test(appSrc),
    "Enter on an empty line is the OK of a CHOOSE (its highlighted choice, 0 when none is) and of a MSGBOX, as the HP's ENTER is; a typed line still runs");
  assert(/_moveChoice\(d\) \{\s*const dialog = calcState\.halted\?\.kind === 'choose' \? calcState\.halted\.dialog : null;\s*if \(!dialog\?\.pos\) return false;\s*if \(!this\.popover\.el \|\| this\.popover\.el !== this\._chooseList\) \{ this\.showChooseList\(\); return true; \}\s*this\._markChoice\(Math\.max\(1, Math\.min\(dialog\.items\.length, dialog\.pos \+ d\)\)\);\s*return true;/.test(appSrc)
    && /_revealChoice\(center\) \{\s*this\.popover\.el\?\.querySelector\('\.opt\.on'\)\?\.scrollIntoView\(\{ block: center \? 'center' : 'nearest' \}\);/.test(appSrc)
    && /const step = \{ '▲': -1, '▼': 1 \}\[key\.primary\];\s*if \(step && !this\.shift && \(this\._moveChoice\(step\) \|\| this\.autocomplete\.move\(step\)\)\) return;/.test(appSrc)
    && /onArrowUpEmpty: \(\) => this\._moveChoice\(-1\) \|\| this\._runChord\('ArrowUp'\),[\s\S]{0,200}?onArrowDownEmpty: \(\) => this\._moveChoice\(1\) \|\| this\._runChord\('ArrowDown'\),/.test(appSrc)
    && /if \(this\._onArrow && !ends && !letter\) \{ e\.preventDefault\(\); this\._onArrow\(e\.key === 'ArrowDown' \? 1 : -1\); return; \}/.test(readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8')),
    'CHOOSE: the list opens with the marked row in view, the arrow keys (keypad and keyboard) move the mark within the list or bring back a list put away, and Enter answers with it');
  assert(/this\._onResize = \(\) => requestAnimationFrame\(\(\) => \{[^}]*this\._place\(this\._point\);/.test(readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8')),
    "Popovers: a resize places an open popover a frame later, once the app's height has followed the visual viewport (after a turn the CHOOSE list sat over its banner's keys)");
  assert(/_markChoice\(pos\) \{\s*calcState\.halted\.dialog\.pos = pos;\s*this\.popover\.el\.querySelectorAll\('\.opt'\)\.forEach\(\(row, i\) => \{\s*row\.classList\.toggle\('on', i \+ 1 === pos\);\s*row\.querySelector\('\.ck'\)\.innerHTML = i \+ 1 === pos \? icon\('check', 'sm'\) : '';\s*\}\);\s*this\._revealChoice\(false\);/.test(appSrc)
    && /class="opt\$\{o\.on \? ' on' : ''\}" data-v="\$\{i\}"/.test(appSrc)
    && /this\._place\(this\._point\);\s*this\.el\.querySelector\('\.opt\.on'\)\?\.scrollIntoView\(\{ block: 'nearest' \}\);/.test(readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8')),
    'CHOOSE: the highlighted choice, as the AUR has it, carries the highlight bar as well as the check mark, and stays in view when the popover is placed again after a turn');
  assert(/_jumpChoice\(letter\) \{\s*const dialog = calcState\.halted\?\.kind === 'choose' \? calcState\.halted\.dialog : null;\s*if \(!dialog\?\.pos \|\| this\.popover\.el !== this\._chooseList \|\| this\.entry\.buffer\.trim\(\) \|\| !\/\^\\p\{L\}\$\/u\.test\(letter\)\) return false;[\s\S]{0,300}?const next = Array\.from\(\{ length: n \}, \(_, k\) => \(dialog\.pos \+ k\) % n\)\.find\(starts\);\s*if \(next !== undefined\) this\._markChoice\(next \+ 1\);\s*return true;/.test(appSrc)
    && /if \(layer === 'A' && key\.alpha\) \{\s*if \(!this\._jumpChoice\(key\.alpha\)\) this\.entry\.type\(key\.alpha\);/.test(appSrc),
    'CHOOSE: a letter typed on an empty line with the list open, on a keyboard or on the keypad under alpha, moves the highlight to the next choice starting with it, wrapping; with the list put away or a line typed it types as usual');
  assert(/\.pop\.choose \.opt b \{ white-space: normal; overflow-wrap: anywhere; \}/.test(readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8')),
    "CHOOSE: a long choice wraps in the list instead of losing its end to an ellipsis (at 280 px a choice was cut)");
}

{
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const sheet = \(title, content, nav = '', foot = '', head = ''\) =>[^\n]*<div class="sheet-c">\$\{content\}<\/div><\/div>\$\{foot && `<div class="sheet-f">\$\{foot\}<\/div>`\}<\/div>`;/.test(sheetsSrc)
    && /<\/div>`, '', `\$\{act\('inform-ok', 'check', 'OK', ' pri'\)\}\$\{act\('inform-cancel', 'x', 'Cancel'\)\}\$\{act\('inform-reset', 'undo', 'Reset'\)\}`\);/.test(sheetsSrc)
    && /<div class="sheet-view">\$\{this\.view\.html\}<\/div>`, '', acts, steps\);/.test(sheetsSrc) && !/sheet-view-acts/.test(sheetsSrc) && !/sheet-view-acts/.test(css)
    && /\.sheet \{[^\n]*grid-template-rows: auto minmax\(0, 1fr\) auto;/.test(css)
    && /\.sheet-f \{ display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 22px 16px; border-top: 1px solid var\(--line\); \}/.test(css)
    && /@container sheet \(max-height: 219px\) \{ \.sheet-f \{ display: none; \} \}/.test(css),
    'Sheets: the OK, Cancel and Reset keys of INFORM and the Edit, Copy and Share keys of a View sheet sit in a footer outside the scroller, which a sheet too short for both (landscape with the keyboard up) drops for its fields');
}

{
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/<b>\$\{title\}<\/b>\$\{head\}<button type="button" class="icon-btn sm" data-sh="close"/.test(sheetsSrc)
    && /const steps = level == null \? '' : step\(1, 'chu', 'No level above'\) \+ step\(-1, 'chd', 'No level below'\);/.test(sheetsSrc)
    && /case 'view-step': \{\n\s*const \{ step \} = b\.dataset;\n\s*app\.stepView\(Number\(step\)\);/.test(sheetsSrc),
    'VIEW: up and down arrows sit in the sheet header beside the level, so the footer still fits Edit and Copy on one row at 280 px');
  assert(/this\._returnTo = document\.activeElement === document\.body \? null : document\.activeElement;/.test(sheetsSrc)
    && /if \(back\?\.isConnected && \(!document\.activeElement \|\| document\.activeElement === document\.body\)\) back\.focus\(\{ preventScroll: true \}\);/.test(sheetsSrc)
    && /\?\? this\.el\?\.querySelector\('\[data-sh="close"\]'\)\)\?\.focus\(/.test(sheetsSrc),
    'sheets: Settings, Shortcuts, About and the rest take the keyboard when they open (Shortcuts on its Close button) and give it back to what had it when they close, where Esc left it on nothing');
  const body = appSrc.match(/\n  stepView\(by\) \{\n([\s\S]*?)\n  \}\n/)[1];
  const calls = [];
  const fake = { sheets: { view: { level: 2 } }, stack: { depth: 3 }, selectLevel: (l) => calls.push(`sel ${l}`), _viewLevel: (l) => { calls.push(`view ${l}`); fake.sheets.view.level = l; } };
  const stepView = new Function('by', body);
  for (const by of [1, 1, -1, -1, -1]) stepView.call(fake, by);
  assert(calls.join(', ') === 'sel 3, view 3, sel 2, view 2, sel 1, view 1',
    `VIEW: stepping moves the interactive stack's pointer and shows the level it lands on, stopping at the top and at level 1 (got ${calls.join(', ')})`);
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/@container work \(max-width: 560px\) \{\s*:root\[data-theme="classic"\] \.ann-g\.opt \{ display: none; \}\s*\/\*[^*]*\*\/\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.ann-g\.opt:not\(\[data-mode\]\):has\(> \.on\) \{ display: flex; \}\s*:root\[data-theme="classic"\]\[data-view="minimal"\] \.status-line:has\(\.ann-g\.opt:not\(\[data-mode\]\) > \.on\) \.ann-g > span:not\(\.on\) \{ display: none; \}/.test(css),
    "Classic minimal view: a lit HALT shows at every width under 560 px, where the .opt groups are otherwise dropped, the dim annunciators giving way to it as they do under 360 px (the line overflowed by 13 px at 390 with them shown)");
}

{
  const popSrc = readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8');
  assert(/const MIN_ABOVE = 100;/.test(popSrc)
    && /el\.style\.maxHeight = '';\s*const w = el\.offsetWidth;\s*let h = el\.offsetHeight;[\s\S]{0,200}?const above = r\.top - 6 - margin;\s*if \(this\._above && h > above && above >= MIN_ABOVE\) \{ el\.style\.maxHeight = `\$\{above\}px`; h = el\.offsetHeight; \}/.test(popSrc)
    && /if \(\(this\._above \|\| top \+ h > vh - margin\) && r\.top - h - 6 >= margin\) top = r\.top - h - 6;/.test(popSrc),
    "popover: asked to sit above its anchor, it gives up height (down to 100 px) rather than cover the anchor, so CHOOSE's eight rows keep clear of the prompt with the keyboard up at 280 px, where the list covered the banner and the command line");
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const entrySrc = readFileSync(new URL('../www/src/ui/entry.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/export function lcdHtml\(lcd\) \{\s*const lines = lcd\?\.lines \?\? \[\];\s*const last = lines\.findLastIndex\(\(line\) => line\);\s*if \(last < 0 && !lcd\?\.grob\) return '';/.test(bannerSrc)
    && /renderBanner\(\) \{\s*const el = \$\('banner'\);\s*const lcd = lcdHtml\(getLcd\(\)\);\s*if \(this\.errorBanner\) \{ this\._haltBanner = null; el\.innerHTML = lcd \+ errorBannerHtml\(this\.errorBanner\); this\._markBannerEdges\(\); return; \}/.test(appSrc)
    && /enter\(\) \{\s*this\.error = '';\s*this\.failure = null;\s*touchLcd\(\);/.test(entrySrc) && /execOp\(\.\.\.names\) \{\s*this\.error = '';\s*this\.failure = null;\s*touchLcd\(\);/.test(entrySrc)
    && /\} finally \{\s*if \(!waiting\) settleLcd\(\);/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8'))
    && /\.lcd \{ margin: 8px 10px 0; padding: 8px 12px;[^}]*font: 13px\/1\.45 var\(--font-mono\);/.test(css) && /:root\[data-keyboard\] \.lcd \{ max-height: calc\(3 \* 1\.45em \+ 18px\); overflow-y: auto; \}/.test(css)
    && /\.lcd > div \{ min-height: 1\.45em; white-space: pre-wrap; overflow-wrap: anywhere; \}/.test(css),
    "DISP: a program's display lines show in the banner slot above the command line, down to the last line with text, in the stack's mono ink (three lines with the keyboard up, a line longer than the screen wrapping as the command line does rather than scrolling off the edge unseen); an unfrozen display goes when the program ends or pauses, a frozen one at the next Enter, command or dialog answer");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(banner === this\._haltBanner\) \{\s*el\.querySelector\(':scope > \.lcd'\)\?\.remove\(\);\s*el\.insertAdjacentHTML\('afterbegin', lcd\);\s*return;\s*\}\s*this\._haltBanner = banner;\s*el\.innerHTML = lcd \+ banner;/.test(appSrc)
    && /this\.entry\.safeRun\(\(\) => this\.stack\.holdEmit\(\(\) => batchStateNotifications\(resume\)\), op, \{ keepPartial: true \}\);/.test(appSrc),
    'WAIT in a loop: the banner stays put while the program halts again under the same one, and only its display is redrawn, where « 1 30 START .1 WAIT NEXT » rebuilt the banner every 0.1 s and its fade-in held it between 0 and 83% opacity at 280 px');
  assert(/const animate = !this\.ghosts && !this\.marks && before\.size && !prefersReducedMotion\(\) && calcState\.halted\?\.kind !== 'wait';/.test(readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8')),
    "WAIT in a loop: the stack's rows change in place while the program waits, where « 0 1 50 START 1 + .1 WAIT NEXT » replayed level 1's fade-in every 0.1 s, between 0 and 73% opacity");
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const internalSrc = readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8');
  assert(hpKeyCode('1') === 92.1 && hpKeyCode('F3') === 13.1 && hpKeyCode('ENTER', 'L') === 105.2 && hpKeyCode('SIN', 'R') === 53.3 && hpKeyCode('7', 'A') === 72.4
    && hpKeyCode('ON') === 101.1 && hpKeyCode('▲') === 25.1 && hpKeyCode('◀') === 34.1 && hpKeyCode('VARS') === 31.1 && hpKeyCode('NEXT') === 33.1 && hpKeyCode('HOME') === 21.1
    && hpKeyCode('SWAP') === 36.1 && hpKeyCode('DROP') === 45.1 && hpKeyCode('nope') === null && hpKeyCode('1', 'X') === 92.1
    && typedKeyCode('1') === 92.1 && typedKeyCode('+') === 95.1 && typedKeyCode('-') === 85.1 && typedKeyCode(' ') === 104.1 && typedKeyCode('a') === 31.4 && typedKeyCode('A') === 31.4 && typedKeyCode('z') === 65.4 && typedKeyCode('ab') === null && typedKeyCode('?') === null,
    "WAIT key codes: a key's HP 50g row and column with the plane after the point (1 unshifted, 2 left, 3 right, 4 alpha); VARS and NEXT are the HP's VAR and NXT, a key the HP lacks takes a code of its APPS row, the compact keypad's SWAP and DROP are the ▶ and ⌫ keys that do their work on an empty line, and a character typed on a keyboard is the keypad key that types it, a letter's under α");
  assert(/if \(kind === 'wait'\) return waitBannerHtml\(dialog\);/.test(bannerSrc)
    && /function waitBannerHtml\(\{ seconds \}\) \{\s*if \(seconds\) \{[\s\S]*?Waiting \$\{s\} second\$\{s === 1 \? '' : 's'\}<\/div><div class="bn-f">\$\{STOP_KEY\}<\/div>/.test(bannerSrc)
    && /<div class="bn-t">Press a key<\/div><div class="bn-f">\$\{key\('enter', 'Enter', [^}]*?'enter', 'pri'\)\}\$\{STOP_KEY\}/.test(bannerSrc)
    && /if \(act === 'enter' && kind === 'wait'\) \{ this\._answerKey\(hpKeyCode\('ENTER'\)\); return; \}/.test(appSrc)
    && /_answerKey\(code\) \{\s*const halted = calcState\.halted;\s*if \(halted\?\.kind !== 'wait' \|\| !halted\.dialog\.key \|\| code == null\) return false;[\s\S]*?this\._continueProgram\(Real\(code\)\);\s*return true;/.test(appSrc)
    && /handleKey\(key, \{ standard = false \} = \{\}\) \{[\s\S]{0,700}?if \(this\._answerKey\(hpKeyCode\(key\.primary, this\.layer\(\)\)\)\) return;/.test(appSrc)
    && /pressSoftKey\(i, forcedLayer = null\) \{\s*if \(this\._answerKey\(hpKeyCode\(`F\$\{i \+ 1\}`, forcedLayer \?\? this\.layer\(\)\)\)\) return;/.test(appSrc)
    && /if \(this\._answerKey\(hpKeyCode\('ENTER'\)\)\) return;\s*this\.entry\.enter\(\);/.test(appSrc)
    && /onCommit: \(\) => \{ if \(this\._answerKey\(hpKeyCode\('ENTER'\)\) \|\| this\._enterAnswersDialog\(\)\) return; if \(!this\._runChord\('Enter'\)\) this\.commitEntry\(\); \},\s*onType: \(text\) => this\._answerKey\(typedKeyCode\(text\)\) \|\| this\._jumpChoice\(text\),/.test(appSrc)
    && /EditorView\.inputHandler\.of\(\(_view, _from, _to, text\) => onType\?\.\(text\) === true\),/.test(readFileSync(new URL('../www/src/ui/entry.js', import.meta.url), 'utf8'))
    && /if \(e\.key\.length === 1 && !e\.ctrlKey && !e\.metaKey && !e\.altKey && !inField && this\._answerKey\(typedKeyCode\(e\.key\)\)\) \{ e\.preventDefault\(\); return; \}\s*const binding = findBinding\(chord,/.test(appSrc)
    && /_beginWait\(halted\) \{\s*const \{ seconds, menu, poll \} = halted\.dialog;\s*if \(menu && this\.prefs\.minimal\) this\.setMinimalMenu\(true\);\s*if \(seconds\) this\._waitTimer = setTimeout\(\(\) => \{ if \(calcState\.halted === halted\) this\._continueProgram\(\); \}, seconds \* 1000\);/.test(appSrc)
    && /halted: calcState\.haltedStack\.some\(\(h\) => !isSuspension\(h\)\),/.test(appSrc)
    && /if \(id === 'WAIT'\) \{[\s\S]{0,300}?_markSuspend\(toks, i \+ 1, 'wait', wait\);/.test(internalSrc),
    "WAIT: a timed wait shows how long with a Stop key and goes on by itself after its seconds (no key press for the display, whose message stays); a key wait says Press a key with Enter and Stop, and any keypad key, soft key (F1 to F6), character typed on a keyboard (a hardware keyboard's keydown ahead of its chords, a phone keyboard's text through the editor's input handler) or Enter, from the chip, the line's Enter or the keyboard (ahead of the empty line's Enter chord), answers with its HP code; -1 shows the soft keys in minimal view; the status line lights no HALT for a wait, nor, as on the HP, for MSGBOX, INPUT, CHOOSE or INFORM, but keeps it while a program halted by HALT or PROMPT waits underneath");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(halted\.dialog\.poll\) this\._continueProgram\(Real\(Math\.trunc\(code\)\), Real\(1\)\);\s*else this\._continueProgram\(Real\(code\)\);/.test(appSrc)
    && /if \(poll\) this\._waitTimer = setTimeout\(\(\) => \{ if \(calcState\.halted === halted\) this\._continueProgram\(Real\(0\)\); \}, KEY_PAUSE_MS\);/.test(appSrc)
    && /const KEY_PAUSE_MS = 20;/.test(appSrc)
    && /if \(MODIFIER_KINDS\.has\(key\.kind\) && !calcState\.halted\?\.dialog\?\.poll && /.test(appSrc),
    "KEY: a key pressed while a program polls answers with the key's row and column and 1 (ENTER 105, the left shift 81 rather than shifting), and a 20 ms pause without one answers 0");
  assert(/function _loopLimit\(message\) \{\s*let run = _resumedAt;\s*let count = 0;\s*return \(\) => \{\s*if \(run !== _resumedAt\) \{ run = _resumedAt; count = 0; \}\s*if \(\+\+count > MAX_LOOP_ITERATIONS\) throw new RPLError\(message\);/.test(readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8')),
    'KEY: a loop polling KEY counts its iterations afresh after each pause, where an empty « DO UNTIL KEY END » stopped at the million-iteration limit after half a second of waiting');
}

{
  const bannerSrc = readFileSync(new URL('../www/src/ui/banner.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const internalSrc = readFileSync(new URL('../www/src/rpl/ops/internal.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/if \(kind === 'inform'\) return `<div class="bn halt inform" role="status">[\s\S]*?<div class="bn-t">\$\{escapeHtml\(prompt \|\| 'Form'\)\}<\/div><div class="bn-f">\$\{key\('form', 'Fill in', [^}]*?'edit', 'pri'\)\}\$\{key\('cancel', 'Cancel', [^}]*?'x'\)\}\$\{STOP_KEY\}/.test(bannerSrc)
    && /showInformSheet\(\) \{\s*const \{ title, fields, columns, resets, init \} = calcState\.halted\.dialog;[\s\S]*?this\.sheets\.openInform\(\{ title, columns, fields: rows \}\);/.test(appSrc)
    && /acceptInform\(\) \{[\s\S]*?const value = text \? informValue\(text, fields\[Number\(input\.dataset\.inf\)\]\) : Name\('NOVAL'\);\s*if \(typeof value === 'string'\) \{ input\.setCustomValidity\(value\); input\.reportValidity\(\); input\.focus\(\); return; \}[\s\S]*?this\._continueProgram\(RList\(values\), Integer\(1n\)\);/.test(appSrc)
    && /cancelInform\(\) \{ this\._continueProgram\(Integer\(0n\)\); \}/.test(appSrc)
    && /function informText\(v\) \{\s*return !v \|\| \(isName\(v\) && v\.id === 'NOVAL'\) \? '' : withFractionMark\(formatSource\(v\)\);/.test(appSrc)
    && /function informValue\(text, field\) \{[\s\S]*?if \(objects\.length !== 1\) return 'One object per field';\s*if \(field\.types\.length && !field\.types\.includes\(_hp50TypeCode\(objects\[0\]\)\)\) return/.test(appSrc)
    && /openInform\(form\) \{\s*this\.form = form;\s*this\._open\('inform'\);/.test(sheetsSrc)
    && /<label class="inf-field"><span>\$\{escapeHtml\(f\.label\)\}<\/span><input type="text" data-inf="\$\{n\}" value="\$\{escapeHtml\(f\.text\)\}" placeholder="\$\{escapeHtml\(f\.help\)\}"/.test(sheetsSrc)
    && /\$\{act\('inform-ok', 'check', 'OK', ' pri'\)\}\$\{act\('inform-cancel', 'x', 'Cancel'\)\}\$\{act\('inform-reset', 'undo', 'Reset'\)\}/.test(sheetsSrc)
    && /case 'inform-ok': app\.acceptInform\(\); return;\s*case 'inform-cancel': app\.cancelInform\(\); return;\s*case 'inform-reset': this\._informReset\(\); return;/.test(sheetsSrc)
    && /_onKeyDown\(e\) \{[\s\S]*?\n    if \(this\.kind !== 'inform' \|\| e\.key !== 'Enter' \|\| !e\.target\.matches\('input\[data-inf\]'\)\) return;[\s\S]*?if \(next\) next\.focus\(\);\s*else this\.app\.acceptInform\(\);/.test(sheetsSrc)
    && /const last = fields\.filter\(Boolean\)\.length - 1;/.test(sheetsSrc)
    && /data-inf="\$\{n\}"[^>]*enterkeyhint="\$\{n\+\+ === last \? 'done' : 'next'\}"/.test(sheetsSrc)
    && /if \(id === 'INFORM'\) \{[\s\S]{0,400}?_markSuspend\(toks, i \+ 1, 'inform', inform, title\);/.test(internalSrc)
    && /\.inf-fields \{ display: grid; grid-template-columns: repeat\(var\(--inf-cols, 1\), minmax\(0, 1fr\)\);/.test(css)
    && /@container app \(max-width: 479px\) \{ \.inf-fields \{ grid-template-columns: minmax\(0, 1fr\); \} \.inf-blank \{ display: none; \} \}/.test(css),
    "INFORM: its banner is the title with Fill in, Cancel and Stop keys; the form opens in a sheet with a label and a 40 px input per field, the help as the placeholder and the initial value as source, in the form's columns on a wide screen and one on a phone; OK parses each field (an empty one NOVAL), checks the field's types and answers with the values and 1, a failing field keeping the form open with the complaint on it; Cancel answers 0, Reset puts the reset values back, Enter moves to the next field and from the last answers, and the fields tell a phone keyboard so (Next, and Done on the last, as the matrix writer's cells and the command line's Go do); the sheet goes with its dialog and the banner's Fill in reopens it");
  assert(/dismiss\(\) \{\s*if \(this\.kind === 'inform'\) this\.app\.cancelInform\(\);\s*else this\.close\(\);/.test(sheetsSrc)
    && /if \(e\.target === this\.el\) this\.dismiss\(\);/.test(sheetsSrc) && /case 'close': this\.dismiss\(\); return;/.test(sheetsSrc)
    && /if \(this\.sheets\.isOpen\(\)\) \{ this\.sheets\.dismiss\(\); return true; \}/.test(appSrc)
    && /\[\(\) => this\.sheets\.isOpen\(\), \(\) => this\.sheets\.dismiss\(\)\]/.test(appSrc),
    'INFORM: the form put away by its X, Escape, the back button or a tap beside it cancels, answering 0 as the HP\'s CANCEL and ON do, where the program stayed halted with the form gone');
  assert(/\.st-row:is\(\.culprit, \.arg, \.ghost\):not\(\.sel\) \{ grid-template-columns: 34px auto minmax\(0, 1fr\); \}\s*\.st-row:is\(\.culprit, \.arg, \.ghost\):not\(\.sel\) \.st-tag \{ position: static; transform: none; \}/.test(css),
    'a marked level (this one, argument, result) keeps its tag beside the value, so a wide list at 280 px starts after "this one" instead of running 46 px under it');
  assert(/const clock = testUserFlag\(-40\) \? headerClock\(\) : null;\s*clearTimeout\(this\._clockTimer\);\s*if \(clock\) this\._clockTimer = setTimeout\(\(\) => this\.renderStatus\(\), 60020 - \(calculatorNow\(\) % 60000\)\);/.test(appSrc)
    && /<span class="ann-sp"><\/span>\$\{clockMark\}<span class="ann-path">/.test(readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8'))
    && /@container app \(max-width: 389px\) \{ \.ann-clock \{ display: none; \} \}/.test(css)
    && /@container app \(max-width: 429px\) \{ :root\[data-theme="classic"\] \.ann-clock \{ display: none; \} \}/.test(css),
    'flag -40: the status line shows the time, as the HP\'s header does, ticking each minute, from 390 px in minimal view and 430 in the Classic look, where it fits beside the modes and buttons');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const beepSrc = readFileSync(new URL('../www/src/ui/beep.js', import.meta.url), 'utf8');
  const displaySrc = readFileSync(new URL('../www/src/rpl/ops/display.js', import.meta.url), 'utf8');
  assert(/import \{ beep, alarmBeep, keyClick \} from '\.\/ui\/beep\.js';/.test(appSrc) && /\n    setBeepHook\(\(hz, seconds\) => this\._buzzBeep\(beep\(hz, seconds\)\)\);\n/.test(appSrc)
    && /export function beep\(hz, seconds\) \{[\s\S]*?const at = Math\.max\(ctx\.currentTime, _queueEnd\);\s*_queueEnd = at \+ seconds;\s*play\(hz, seconds, at\);/.test(beepSrc)
    && /export function errorBeep\(\) \{\s*if \(!testUserFlag\(-56\)\) play\(1000, 0\.125\);/.test(beepSrc)
    && /register\('BEEP', \(s\) => \{[\s\S]*?testUserFlag\(-56\) \|\| inScratchState\(\)\) return;\s*_beepHook\?\.\(freq, dur\);[\s\S]*?categoryOrder: 29/.test(displaySrc),
    'BEEP: the app plays its tones with the error beep\'s square wave, each queued after the last so a program\'s tones sound in turn while it runs on; the command stays quiet under flag -56 and in scratch evaluation');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/cancelWriter\(\) \{\s*if \(this\._writer\(\)\.collapseSelection\?\.\(\) \|\| this\._writer\(\)\.cancelCell\?\.\(\)\) return;\s*this\._closeWriter\(\(mode\) => `Discarded the \$\{mode\}`\);\s*\}/.test(appSrc)
    && /_closeWriter\(message\) \{[\s\S]*?writer\.clear\(\);\s*if \(edit\) this\._endEdit\(\);\s*this\.setInputMode\('rpl'\);[\s\S]*?else if \(hadContent\) this\.toast\(message\(mode\), \{ action: 'Undo', onAction: reopen \}\);/.test(appSrc),
    "INPUT with a writer open: the matrix or equation writer steps aside (its content and any edit a tap of Undo away, as when it is cancelled) so the program's text lands on a command line the user can see and answer");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(halted\?\.kind === 'prompt' && this\._promptHalt !== halted\) \{\s*this\._promptHalt = halted;\s*if \(this\.inputMode !== 'rpl'\) this\._closeWriter\(\(mode\) => `Put the \$\{mode\} aside for the program's PROMPT`\);/.test(appSrc),
    "PROMPT: a program's prompt wants the command line, so an open writer steps aside with its Undo note, as it does for INPUT");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/recallLine\(text, why\) \{\s*if \(this\.inputMode !== 'rpl'\) this\._closeWriter\(\(mode\) => `Put the \$\{mode\} aside for \$\{why\}`\);\s*this\.entry\.recall\(text\);/.test(appSrc)
    && /case 'hist-recall': app\.recallLine\(t\.dataset\.text, 'the line from History'\); this\._reveal\(\); return;\s*case 'hist-run': e\.stopPropagation\(\); app\.recallLine\(t\.dataset\.text, 'the line from History'\); app\.commitEntry\(\); this\._reveal\(\); return;/.test(drawerSrc),
    "History's recall and Run put an open writer aside with its Undo note, as INPUT does, so the line lands where it can be seen and Run runs it rather than committing the writer");
  assert(/if \(first\) \{ e\.preventDefault\(\); this\.cat\.focusAction = true; this\.showReference\(first\.dataset\.cmd\); \}/.test(drawerSrc)
    && /if \(this\.cat\.focusAction\) \{ this\.cat\.focusAction = false; body\.querySelector\('\.acts \.btn'\)\?\.focus\(\); \}/.test(drawerSrc),
    'Catalog: Enter in the search box opens the first match with its Run (or Insert) button focused, where the page took the box away and the keyboard was left on nothing');
  assert(/if \(e\.key === 'Enter' && \(e\.shiftKey \|\| e\.altKey\) && e\.target\.matches\?\.\('\.vr\[data-dw="var"\]:not\(\.dir\)'\)\) \{\s*e\.preventDefault\(\);\s*this\.app\.pressVariable\(e\.target\.dataset\.name, e\.shiftKey \? 'L' : 'R'\);/.test(drawerSrc),
    'Variables: on a focused variable, Shift+Enter stores level 1 in it and Alt+Enter recalls it, as the HP\'s shifted VAR keys and Shift+F1 and Alt+F1 on the soft keys do');
  assert(drawerSrc.includes("${n}: ${value.type === TYPES.PROGRAM ? 'run it' : 'put it on the stack'} · Shift+Enter stores level 1 into it · Alt+Enter recalls without running · Delete purges it"),
    'Variables: a row\'s tooltip reads as its VAR soft key\'s does (run it or put it on the stack, store, recall), with the drawer\'s keys, where it said only "click to put on the stack"');
  assert(/closest\?\.\('\.pl-box'\)\) \{ this\.focusInput\(\); return true; \}\s*(\/\/[^\n]*\n\s*)*if \(document\.activeElement\?\.closest\?\.\('#drawer'\)\) \{\s*if \(this\._drawerCoversStack\(\)\) this\.drawers\.close\(\);\s*else this\.focusInput\(\);\s*return true;\s*\}\s*if \(this\.selection != null\)/.test(appSrc),
    'Esc in a drawer docked beside the stack takes the keyboard back to the command line and leaves the drawer open, and one over the stack closes, before Esc reaches the selection, a writer or the command line');
  assert(/const hadFocus = this\.el\.contains\(document\.activeElement\) && !globalThis\.matchMedia\?\.\('\(pointer: coarse\)'\)\.matches;[\s\S]{0,200}if \(hadFocus\) this\.app\.focusInput\(\);/.test(drawerSrc),
    'drawer: closing it with the keyboard inside, by Ctrl+\\ or its close button, hands the keyboard to the command line where it was left on nothing; not on a touch screen, whose keyboard it would raise');
  assert(appSrc.includes("onShiftEnter: () => this.selection != null && this._runChord('Shift+Enter'),")
    && readFileSync(new URL('../www/src/ui/entry.js', import.meta.url), 'utf8').includes('if (onShiftEnter?.()) return true;')
    && appSrc.includes("case 'level.echo': this.levelAction('echo'); return true;"),
    'Shift+Enter on a selected level reaches ECHO through the command line, which took it for a new line');
  assert(appSrc.includes("onHomeEmpty: () => this.selection != null && this._runChord('Home'),")
    && appSrc.includes("onEndEmpty: () => this.selection != null && this._runChord('End'),")
    && readFileSync(new URL('../www/src/ui/entry.js', import.meta.url), 'utf8').includes("{ key: 'Home',        run: delegateIfEmpty(onHomeEmpty) },")
    && appSrc.includes("case 'level.top': this.selectLevel(this.stack.depth); return true;")
    && appSrc.includes("case 'level.bottom': this.selectLevel(1); return true;"),
    'Home and End on a selected level jump to the top level and level 1 through an empty command line, which kept them for its caret');
  {
    const popSrc = readFileSync(new URL('../www/src/ui/popover.js', import.meta.url), 'utf8');
    assert(popSrc.includes("const inMenu = this.el.contains(document.activeElement) && !document.activeElement.matches('input, textarea, select');")
      && popSrc.includes("const ends = (e.key === 'Home' || e.key === 'End') && inMenu;")
      && popSrc.includes("Home: 0, End: items.length - 1 }[e.key];"),
      'menus: Home and End go to the first and last item, as in any menu; in a field or with the keyboard still on the command line they are left alone');
    assert(popSrc.includes("const letter = inMenu && !e.ctrlKey && !e.metaKey && !e.altKey && /^\\p{L}$/u.test(e.key) ? e.key.toUpperCase() : '';")
      && popSrc.includes('const match = [...items.slice(i + 1), ...items.slice(0, i + 1)].find((item) => label(item).startsWith(letter));'),
      'menus: a typed letter moves to the next item starting with it, as a CHOOSE list does, so a long level menu needs no scrolling');
  }
  {
    const drawerRowSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
    assert(/if \(\/\^Arrow\(Up\|Down\|Left\|Right\)\$\|\^\(Home\|End\)\$\/\.test\(e\.key\)\) \{\s*e\.preventDefault\(\);\s*this\._stepRow\(row, e\.key\);\s*\} else if \(e\.key === 'Delete' \|\| e\.key === 'Backspace'\) \{\s*e\.preventDefault\(\);\s*this\._deleteRow\(row\);/.test(drawerRowSrc)
      && drawerRowSrc.includes("if (dw === 'var') this._deleteVar(row.dataset.name);")
      && drawerRowSrc.includes("(rows[Math.min(i, rows.length - 1)] ?? this._body()?.querySelector('[data-q]'))?.focus();"),
      'drawer rows: the arrow keys, Home and End move between a list\'s rows and Delete purges a variable or removes a History entry, where they reached the stack: ↓ took level 1 into the command line and ⌫ dropped a selected level');
    assert(drawerRowSrc.includes("this.rail.addEventListener('keydown', (e) => this._stepAmong(e, [...this.rail.querySelectorAll('[data-drawer]')]));")
      && drawerRowSrc.includes("if (e.target.matches?.('[data-drawer-tab]') && this._stepAmong(e, [...this.el.querySelectorAll('[data-drawer-tab]')])) return;")
      && /const to = \{ ArrowUp: i - 1, ArrowLeft: i - 1, ArrowDown: i \+ 1, ArrowRight: i \+ 1, Home: 0, End: buttons\.length - 1 \}\[e\.key\];\s*if \(to === undefined\) return false;\s*e\.preventDefault\(\);/.test(drawerRowSrc),
      'tools rail and drawer tabs: the arrow keys, Home and End move along the buttons, where → on a rail button swapped levels 1 and 2 and ↓ took level 1 into the command line');
    assert(drawerRowSrc.includes("const remove = inside ? menuItem('pgdir', 'trash', `Delete with its ${inside} item${inside === 1 ? '' : 's'} (PGDIR)`) : menuItem('delete', 'trash', 'Delete');")
      && drawerRowSrc.includes("else if (act === 'pgdir') this._deleteVar(name, true);")
      && drawerRowSrc.includes('varPurge(name, withContents);'),
      'Variables: a folder with something in it offers Delete with its items (PGDIR), with Undo, where Delete could only refuse');
    assert(appSrc.includes("isMatrix(value) ? item('trn', 'chr', 'Transpose (TRN)') + item('rref', 'chr', 'Row reduce (RREF)') : '',") && appSrc.includes("case 'rref': runOn('RREF'); return;"),
      'a matrix level offers Row reduce (RREF) beside Transpose, square or not');
    assert(appSrc.includes("isList(value) && value.items.length > 1 ? item('sort', 'chr', 'Sort (SORT)') + item('revlist', 'chr', 'Reverse (REVLIST)') + item('sumlist', 'chr', 'Sum (ΣLIST)') : '',")
      && appSrc.includes("case 'sort': runOn('SORT'); return;") && appSrc.includes("case 'sumlist': runOn('ΣLIST'); return;"),
      'a list of two or more items offers Sort (SORT), Reverse (REVLIST) and Sum (ΣLIST) in its level menu');
    assert(appSrc.includes("isVector(value) ? item('abs', 'chr', 'Length (ABS)') : '',") && appSrc.includes("case 'abs': runOn('ABS'); return;"),
      'a vector level offers its length (ABS) in its menu');
    assert(appSrc.includes("isReal(value) ? item('toq', 'chr', 'To a fraction (→Q)') : isBinaryInteger(value) ? item('btor', 'chr', 'To a real number (B→R)') : item('num', 'chr', 'To a number (→NUM)'),")
      && appSrc.includes("isTagged(value) ? item('dtag', 'chr', 'Drop the tag (DTAG)') : '',")
      && appSrc.includes("isUnit(value) ? item('convert', 'chr', 'Convert to…') + item('uval', 'chr', 'Drop the unit (UVAL)') : '',")
      && ['btor', 'dtag', 'uval'].every((act) => appSrc.includes(`case '${act}': runOn('${{ btor: 'B→R', dtag: 'DTAG', uval: 'UVAL' }[act]}'); return;`)),
      'a binary integer offers B→R where →NUM gave it back unchanged, a tagged object DTAG and a unit object UVAL');
    assert(appSrc.includes("isName(value) && varRecall(value.id) !== undefined ? item('rcl', 'down', 'Recall its value (RCL)') : '',")
      && appSrc.includes("isName(value) && level === 1 && this.stack.depth > 1 ? item('sto', 'folder', 'Store level 2 in it (STO)') : '',")
      && appSrc.includes("case 'rcl': runOn('RCL'); return;") && appSrc.includes("case 'sto': runOn('STO'); return;"),
      'a quoted name offers RCL when its variable exists and, on level 1 under another value, STO, as the HP does with a name on the stack');
    assert(appSrc.includes("isName(value) && varOrder().includes(value.id) ? item('purge', 'trash', 'Purge its variable (PURGE)') : '',")
      && appSrc.includes("case 'purge': runOn('PURGE'); return;"),
      'a quoted name offers PURGE when its variable is in this folder, the only one PURGE reaches, where RCL also finds one in a parent folder');
    assert(appSrc.includes("const takesApart = (value) => [isList, isVector, isMatrix, isComplex, isTagged, isUnit, isProgram, isSymbolic].some((is) => is(value));")
      && appSrc.includes("takesApart(value) ? item('objto', 'chr', 'Take apart (OBJ→)') : '',")
      && appSrc.includes("case 'objto': runOn('OBJ→'); return;"),
      'a list, array, complex number, tagged or unit object, program or algebraic offers Take apart (OBJ→) in its level menu; a string keeps STR→ and a number, which OBJ→ gives back, offers neither');
    assert(appSrc.includes("isSymbolic(value) ? item('expand', 'chr', 'Expand (EXPAND)') + item('factor', 'chr', 'Factor (FACTOR)') : '',")
      && appSrc.includes("case 'expand': runOn('EXPAND'); return;") && appSrc.includes("case 'factor': runOn('FACTOR'); return;"),
      "an algebraic level offers Expand (EXPAND) and Factor (FACTOR), the HP's everyday ALG rewrites, in its level menu");
    assert(appSrc.includes("isSymbolic(value) ? variablesOf(value.expr).slice(0, 3).map((name) => item(`solve:${escapeHtml(name)}`, 'chr', `Solve for ${name} (SOLVE)`)).join('') : '',")
      && appSrc.includes("const NAMED_LEVEL_OPS = Object.freeze({ solve: 'SOLVE', deriv: 'DERIV', integ: 'RISCH' });")
      && appSrc.includes("if (name && NAMED_LEVEL_OPS[verb]) { runOn(NAMED_LEVEL_OPS[verb], Name(name, { quoted: true })); return; }")
      && /moveLevel\(this\.stack, level, 1\); if \(operand\) this\.stack\.push\(operand\);/.test(appSrc),
      'an algebraic level offers Solve for each of its first three unknowns (SOLVE), pushing the quoted name after rolling the level down, so X^2-5*X+6=0 solves with one tap');
    assert(appSrc.includes("const mainVariable = isSymbolic(value) ? primaryVariable(value.expr) : null;")
      && appSrc.includes("mainVariable ? item(`deriv:${escapeHtml(mainVariable)}`, 'chr', `Differentiate by ${mainVariable} (DERIV)`) : '',")
      && appSrc.includes("const integrable = mainVariable && value.expr.op !== '=';")
      && appSrc.includes("integrable ? item(`integ:${escapeHtml(mainVariable)}`, 'chr', `Integrate by ${mainVariable} (RISCH)`) : '',"),
      "an algebraic level offers Differentiate by (DERIV) its main variable, the equation writer's primaryVariable, and Integrate by (RISCH) it unless it is an equation, which Giac does not integrate, through the same named action as Solve for");
    assert(appSrc.includes("...(takesApart(value) ? [{ label: 'OBJ→', title: 'Take it apart', onPress: act('objto') }] : []),"),
      "a selected level's soft keys offer OBJ→ wherever its menu offers Take apart, as they offer B→R and CONV");
    assert(appSrc.includes("const html = `<h6>Level ${level} · ${escapeHtml(describeValue(value).type)}</h6>"),
      "a level's menu names the kind of object it acts on, as its INFO note does");
    assert(appSrc.includes("isString(value) ? item('strto', 'play', 'Run its text (STR→)') : item('eval', 'play', 'Evaluate (EVAL)'),")
      && appSrc.includes("case 'strto': runOn('STR→'); return;"),
      'a string level offers Run its text (STR→) where Evaluate (EVAL) gave the string back unchanged');
    assert(appSrc.includes("      isString(value) ? { label: 'STR→', title: 'Run its text', onPress: act('strto') } : { label: 'EVAL', title: 'Evaluate it', onPress: act('eval') },")
      && appSrc.includes("      ...(plottable(value) ? [{ label: 'PLOT', title: 'Plot it', onPress: act('plot') }] : []),"),
      'the interactive stack soft keys show STR→ on a string, as its menu does, and a formula keeps EVAL with PLOT after it, where PLOT took EVAL\'s place');
    assert(/isReal\(value\)\s*\? \{ label: '→Q', title: 'To a fraction', onPress: act\('toq'\) \}\s*: isBinaryInteger\(value\) \? \{ label: 'B→R', title: 'To a real number', onPress: act\('btor'\) \}\s*: \{ label: '→NUM', title: 'Evaluate to a number', onPress: act\('num'\) \},/.test(appSrc),
      'the interactive stack soft keys show →Q on a decimal and B→R on a binary integer where →NUM did nothing, as its menu does');
    assert(appSrc.includes("isReal(value) ? item('toq', 'chr', 'To a fraction (→Q)') : ") && appSrc.includes("case 'toq': runOn('→Q'); return;"),
      'a level holding a decimal offers To a fraction (→Q), as the HP\'s →Q turns .75 into \'3/4\', in place of →NUM, which leaves a decimal as it is');
    assert(appSrc.includes(`data-row-act="more" title="More actions (\${shortcutText('level.menu')})"`),
      'a level\'s More actions button names its key, Shift+F10, as Edit and Drop beside it name theirs');
  }
  {
    const hintSrc = readFileSync(new URL('../www/src/ui/input-area.js', import.meta.url), 'utf8');
    assert(hintSrc.includes("`⇧← ⇧→ select · ${shortcutText('eqw.selectAll')} all`")
      && hintSrc.includes("matrix: ['Tab next cell', '⇧Enter next row', 'Enter stores the cell, again pushes', 'Esc puts the cell back, again cancels'],"),
      'the writers\' hint rows name Ctrl or Cmd+A in the equation writer, and say what Enter and Esc do in the matrix writer, where they said Enter pushes and Esc cancels');
  }
  assert(appSrc.includes("case 'eqw.selectAll': this.equationEditor.pressFace('RS▲'); return true;"),
    'Ctrl or Cmd+A in the equation writer selects the whole formula as the HP\'s →▲ does, so Ctrl+C and Ctrl+X take the formula and not the page');
  assert(/case 'level\.view': if \(this\.entry\.buffer\.length\) return false; this\.levelAction\('view'\); return true;/.test(appSrc)
    && appSrc.includes("item('view', 'expand', 'View full size (VIEW)', shortcutText('level.view'))") && appSrc.includes("{ label: 'VIEW', title: 'Show it full size (Space)'"),
    'Space on a selected level opens VIEW, as Quick Look does, and types a space when the line has text; the level menu and the VIEW soft key name it');
  {
    const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
    assert(/view\.addEventListener\('pointerdown', \(ev\) => \{ if \(ev\.button === 2\) textChosen = !doc\?\.getSelection\?\.\(\)\?\.isCollapsed; \}\);/.test(displaySrc)
      && /if \(!row \|\| textChosen \|\| ev\.pointerType === 'touch'\) return;\s*ev\.preventDefault\(\);\s*this\.onRowHold\?\.\(Number\(row\.dataset\.level\)\);/.test(displaySrc),
      'a right click on a level opens its menu, as a held finger does and as a right click on a key does, unless text was selected before it (a Mac selects the word under a right click)');
  }
  assert(/case 'level\.copy':\s*\/\/[^\n]*\n\s*if \(this\.selection == null && \(!this\.stack\.depth \|\| !window\.getSelection\(\)\?\.isCollapsed\)\) return false;\s*this\.levelAction\('copy', this\.selection \?\? 1\); return true;/.test(appSrc),
    'Ctrl or Cmd+C with no level selected copies level 1, ready to paste into a spreadsheet, unless text is selected for the browser to copy or the stack is empty');
}

{
  const indexSrc = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const arrived = keyboard && !root\.hasAttribute\('data-keyboard'\);\s*root\.toggleAttribute\('data-keyboard', keyboard\);[\s\S]{0,200}?if \(arrived\) document\.activeElement\.scrollIntoView\(\{ block: 'nearest' \}\);/.test(indexSrc)
    && /\.dw-body \{[^}]*scroll-padding-block: 10px;/.test(cssSrc),
    "the field being typed into scrolls into view as the keyboard arrives, with a margin inside a drawer (the Variables drawer's backup name sat under the keyboard)");
}

{
  const cssSrc = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.st-val \.list-inline \.lcell \{ white-space: nowrap; margin-right: \.5em; \}/.test(cssSrc) && /\.st-val \.list-inline \.lsep \{ display: contents; \}/.test(cssSrc),
    'textbook list: the space between items rides on the item before it, so a long list wrapped on a phone starts every line flush rather than some half a space in');
  assert(/\.st-val \.list-inline \.lcell:first-of-type \{ margin-left: \.5em; \}/.test(cssSrc),
    'textbook list: the braces keep their spaces, { 1 2 } as the HP writes it, where the flex box dropped the spaces in the brace text and showed {1 2}');
}

{
  const cssSrc = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.sheet-view \.st-val\.textbook \{ flex: none; \}\n\.sheet-view \.st-val\.textbook:has\(> \.list-inline\) \{ flex: 0 1 auto; min-width: 0; \}/.test(cssSrc),
    'VIEW: a long list wraps to the sheet as it does on the stack, where it ran off a phone on one line, while formulas and matrices keep their width and scroll sideways');
}

{
  const cssSrc = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  assert(/const label = isTagged\(value\) \? `\$\{value\.tag\}: ` : null;\s*if \(label && flat\.startsWith\(label\)\) \{/.test(displaySrc)
    && /\.st-val \.value-text\.tagged \.tag-name \{ flex-shrink: 1000000; min-width: 5ch; \}/.test(cssSrc)
    && /\.st-row\.sel \.st-val \.value-text\.tagged, \.sheet-view \.st-val \.value-text\.tagged \{ display: block; \}/.test(cssSrc),
    'tagged levels: a long tag gives way to its value, down to five characters, so a phone shows "Total pri…: 123.456" rather than the tag alone; a selected level and VIEW show both whole');
  assert(/\} else if \(isNumber\(value\) \|\| isBinaryInteger\(value\) \|\| isUnit\(value\)\) \{[^}]*span\.classList\.add\('num'\);\s*flat\.split\(isUnit\(value\) \? \/\(\?=\[E_\]\)\|\(\?<=\[\*\/\]\)\(\?!\[\^\(\]\*\\\)\)\/ : \/\(\?=E\)\/\)\.forEach\(\(part, i\) => span\.append\(\.\.\.\(i \? \[document\.createElement\('wbr'\)\] : \[\]\), part\)\);/.test(displaySrc)
    && /\.st-val \.value-text\.num \{ white-space: normal; overflow-wrap: anywhere; \}/.test(cssSrc),
    'numbers on the stack: a real, integer, complex, binary integer or unit too wide for a phone wraps, breaking before its exponent first, where an ellipsis hid -1.23456789012E-100\'s exponent in minimal view at 280 and 320 px, and a unit before its _ and after a * or /, where 1_V UBASE broke inside s^3');
  assert(/const MIN_FORMULA_SCALE = 0\.75;/.test(displaySrc)
    && /const \{ svg, width \} = astToSvg\(value\.expr, \{ size: svgSize \}\);\s*cell\.innerHTML = svg;\s*cell\.firstElementChild\.style\.minWidth = `\$\{Math\.round\(width \* MIN_FORMULA_SCALE\)\}px`;/.test(displaySrc),
    'formulas on the stack: a long one shrinks to fit only to three quarters of its size, then fades at its edge and scrolls sideways as a wide matrix does, where (X+Y)^6 expanded shrank to a third at 280 px');
  assert(/const \{ svg, width \} = astToSvg\(expr, \{ size: svgSize \}\);\s*return `<span class="lcell lcell-sym" style="min-width:\$\{Math\.round\(width \* MIN_FORMULA_SCALE\)\}px">\$\{svg\}<\/span>`;/.test(displaySrc),
    'formulas in a list: each keeps three quarters of its size too, so a one-line list too wide for a phone scrolls, where the factors of { X^2-1 { X^2-4 X^3-8 } } shrank to 37% at 280 px');
  assert(/const fit = ncols > 0 && texts\.every\(r => !r\.includes\(null\)\);/.test(displaySrc)
    && /\$\{fit \? `;--mw:\$\{gridWidthEm\(texts\)\}` : ''\}/.test(displaySrc)
    && /\* 0\.6 \+ 0\.1\);\s*return \(cols\.reduce\(\(a, b\) => a \+ b, 0\) \+ 0\.9 \* \(cols\.length - 1\) \+ 1\)\.toFixed\(2\);/.test(displaySrc)
    && /\.stack-view \.st-val:has\(> \.matrix-grid\.fit\) \{ width: 100%; container-type: inline-size; \}/.test(cssSrc)
    && /\.stack-view \.st-val > \.matrix-grid\.fit \{ font-size: clamp\(\.75em, \(100cqi - 2px\) \/ var\(--mw\), 1em\); \}/.test(cssSrc),
    'matrices on the stack: a grid of plain entries shrinks to fit its line down to the formulas\' 75%, then scrolls, where [[1.5 2.25 3.125][4 5 6][7 8 9]] lost its last column in minimal view at 280 px; one holding a formula keeps its size');
  const charsSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/const charCaption = \(title = ''\) => title\.split\(' — '\)\[0\]\.replace\(\/ \\\(\.\*\\\)\$\/, ''\);/.test(charsSrc)
    && /<span>\$\{escapeHtml\(charCaption\(title\)\)\}<\/span>/.test(charsSrc)
    && /@media \(pointer: coarse\) \{[^@]*\.cgrid span \{ white-space: normal; text-wrap: balance; text-align: center; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; \}/.test(cssSrc),
    'Characters drawer: a tile names its constant without the parenthesised value, which stays in its title, and on touch the name takes two lines, where 40 of 111 showed as "speed of li…" or "gravitatio…" on every phone width');
  assert(/const DEEP_GRID_ROWS = 3;/.test(displaySrc)
    && /const oneLine = \(value, level\) => level > 1 && calcState\.textbookMode && \(isList\(value\) \|\| gridRows\(value\) > DEEP_GRID_ROWS\);/.test(displaySrc)
    && /sig: rowSig\(flat, svgSize, oneLine\(value, level\)\)/.test(displaySrc)
    && /const short = !selected && oneLine\(value, level\);\s*const text = this\._fillValue\(cell, value, svgSize, short\);\s*this\._rowSigs\.set\(row, rowSig\(text, svgSize, short\)\);/.test(displaySrc)
    && /\(isMatrix\(value\) \|\| isVector\(value\)\) && !short\) \{/.test(displaySrc)
    && /\.st-val\.one-line \.list-inline \{ flex-wrap: nowrap; \}/.test(cssSrc) && /\.st-val\.one-line \.value-text \{ flex: none; overflow: visible; \}/.test(cssSrc),
    'deeper levels: above level 1 a list keeps to one line and a matrix of more than 3 rows shows in its typed form, fading at the edge, while level 1, a selected level and VIEW show them whole, where a 30-item list and a 6x3 matrix took 185 px each at 280 px');
  assert(/\.st-row\.sel \.st-val \.list-inline \.lcell, \.sheet-view \.st-val \.list-inline \.lcell \{ white-space: normal; overflow-wrap: anywhere; text-align: left; \}/.test(cssSrc),
    'whole lists: a selected level and VIEW wrap a long string inside a list, reading from the left, where { "a 60-character message" 1 } ran 640 px wide in a 192 px level at 280 px and then wrapped right-aligned in a level, centred in VIEW');
  assert(/if \(isList\(item\)\) return `<span class="lcell">\$\{this\._renderTextbookList\(item, svgSize\)\}<\/span>`;/.test(displaySrc),
    'nested lists: an inner list draws as a textbook list too and wraps with the rest, where SOLVE of a list of equations showed its inner lists as typed text running 414 px wide in a 192 px level at 280 px');
  assert(/if \(isString\(value\)\) span\.classList\.add\('str'\);/.test(displaySrc)
    && /\.st-row\.sel \.st-val \.value-text, \.st-row\[data-level="1"\] \.st-val \.value-text\.str \{ white-space: pre-wrap;/.test(cssSrc),
    'level 1 strings: a string at level 1 shows whole with its line breaks, as a selected level does, where "LINE1" 10 CHR + "LINE2" + 10 CHR + "LINE3" + showed "LINE1 LINE2 L…" at 280 px');
}

{
  const entrySrc = readFileSync(new URL('../www/src/ui/entry.js', import.meta.url), 'utf8');
  assert(/EditorView\.contentAttributes\.of\(\{ enterkeyhint: 'go', 'aria-label': 'Command line' \}\)/.test(entrySrc),
    'screen readers: the command line is named Command line, where TalkBack and VoiceOver announced an unnamed edit field, the one unnamed control in a sweep of 16 phone states at 280 and 360 px');
}

{
  const { MenuBar } = await import('../www/src/ui/menubar.js');
  const on = {}, onDoc = {};
  const listen = (registry) => (type, fn) => { (registry[type] ??= []).push(fn); };
  const sk = { dataset: { i: '0' }, disabled: false, classList: { add() {}, remove() {} } };
  const key = { closest: (sel) => (sel === '.mb-keys' ? {} : sel.startsWith('.sk') ? sk : null) };
  const el = { addEventListener: listen(on), ownerDocument: { addEventListener: listen(onDoc) }, contains: (node) => node === key };
  const opened = [];
  new MenuBar({ el, app: { menuView: () => ({ slots: [{ label: 'VIEW' }] }), pressSoftKey: () => opened.push('view'), clearPreview: () => {} } });
  const fire = (registry, type, target) => {
    const ev = { type, pointerType: 'touch', pointerId: 1, button: 0, clientX: 100, clientY: 100, target, stopped: false, preventDefault() { this.stopped = true; }, stopPropagation() { this.stopped = true; } };
    for (const fn of registry[type] ?? []) fn(ev);
    return ev;
  };
  const tap = (clickTarget) => { fire(onDoc, 'pointerdown', key); fire(on, 'pointerdown', key); fire(on, 'pointerup', key); return fire(onDoc, 'click', clickTarget).stopped; };
  const sheetEdit = { closest: () => null };
  assert(tap(sheetEdit) && opened.length === 1,
    "soft keys, touch: the click a tap sends after its key opened VIEW is swallowed, where at 280 px it pressed the Edit button VIEW had just put under the finger and the level opened for editing");
  assert(tap(key) && opened.length === 2, 'soft keys, touch: the click that lands back on the key is swallowed too, where Chrome\'s (detail 0, as a keyboard\'s) pressed it again: DUP ran twice and a toggle such as CLK flipped back off');
  fire(onDoc, 'pointerdown', sheetEdit);
  assert(!fire(onDoc, 'click', sheetEdit).stopped, 'soft keys, touch: the next tap, on what the key opened, goes through');
  const click = (pointerType) => { for (const fn of on.click ?? []) fn({ type: 'click', detail: 0, pointerType, target: key }); };
  click('pen');
  click('');
  assert(opened.length === 3, "soft keys: a click with detail 0 presses the key only from a keyboard (no pointer type), where a stylus tap's click, which Chrome also sends with detail 0, pressed it a second time");
  assert(/if \(evt\.detail !== 0 \|\| evt\.pointerType\) return;/.test(readFileSync(new URL('../www/src/ui/keyboard.js', import.meta.url), 'utf8')),
    'keypad: a tap types its key once, where Chrome sends the click after a cancelled touch pointerdown with detail 0, as a keyboard does, and 7 typed 77 and SIN ran twice');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/\{ label: 'EDIT', [^\n]*\n\s*\{ label: 'VIEW', /.test(appSrc),
    "level soft keys: a selected level's soft keys put VIEW on the first page beside EDIT, as the HP's interactive stack has it, where it sat on the second page, two taps away under 320 px");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/case 'edit-line': if \(!this\.entry\.buffer\.trim\(\) && this\.entry\.errorLine\) this\.entry\.recall\(this\.entry\.errorLine, this\.entry\.errorSpot\);/.test(appSrc),
    'Fix the line: the line comes back with the cursor at the command that failed, where it went to the end of a long line typed on a phone');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\.bn-f \{ grid-column: 2 \/ -1;[^}]*\}[\s\S]*?@container app \(max-width: 359px\) \{ \.bn-f \{ grid-column: 1 \/ -1; \} \}/.test(css),
    'errors: under 360 px a banner\'s fixes start under its icon, so five fixes take three rows at 280 px rather than four, leaving the stack 166 px where it had 120');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/installSwipeAway\(\$\('banner'\), '\.bn:not\(\.halt\)', \(\) => this\.dismissError\(\), \{ ignore: '\.bn-f, button', onArmed: \(\) => this\.buzzHold\(\) \}\);/.test(appSrc)
    && /installSwipeAway\(\$\('toasts'\), '\.toast', \(toast\) => toast\.remove\(\), \{ onArmed: \(\) => this\.buzzHold\(\) \}\);/.test(appSrc)
    && /d\.onSwipeArmed = \(\) => this\.buzzHold\(\);/.test(appSrc)
    && /\.app \.st-row\[data-key\], \.app \.bn:not\(\.halt\), \.toast \{ touch-action: pan-y; \}/.test(css),
    'notices: an error banner and a toast swipe away under a finger, the browser leaving sideways moves on them to the page');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/function scrollWideTables\(doc\) \{\s*for \(const table of doc\.querySelectorAll\('table'\)\) \{\s*keepHyphenatedWords\(table\);/.test(drawerSrc)
    && /word\.className = 'nb';/.test(drawerSrc) && /\.ref-table \.nb \{ white-space: nowrap; \}/.test(css),
    'reference: a stack diagram\'s objn-1 stays whole in a narrow drawer, the table scrolling instead, where UNPICK\'s broke into objn- and 1 at 320 px');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const short = css.slice(css.indexOf('@media (max-height: 330px) {\n  :root[data-keyboard] .input-top'));
  assert(/^@media \(max-height: 330px\) \{[^@]*:root\[data-short\] \.input-top, :root\[data-short\] \.input-hint \{ display: none; \}/.test(short),
    'short window, no keyboard: the writer tabs step aside under 330 px, so in a 160 px landscape split screen the soft keys end on screen, where they ran 22 px past it once Settings had taken the focus');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/this\._pushValue\(v, isProgram\(v\) \? name : null, raw \? \{ line: `\$\{raw\} \$\{name\}`, spot: raw\.length \+ 1 \} : null\);/.test(appSrc)
    && /this\.entry\.safeRun\(\(\) => \{ this\.stack\.push\(value\); lookup\('EVAL'\)\.fn\(this\.stack, this\.entry\); \}, runAs, \{ typed \}\);/.test(appSrc),
    'variable keys: a program\'s key pressed on a typed value that fails keeps both for Fix the line, as a command key does');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/@container app \(max-width: 319px\) \{ \.bn-f \{ gap: 4px; \} \.bn-f \.chip \{ padding-inline: 8px; \} \}/.test(css),
    'errors: under 320 px the banner\'s fixes sit tighter, so a bad type\'s five take two rows at 280 px, where Explain took a third alone');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const field = /spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="done" class="pop-name"/;
  assert(field.test(appSrc) && field.test(drawerSrc) && !/height:32px/.test(appSrc) && !/height:32px/.test(drawerSrc)
    && /placeholder="Backup name" aria-label="Backup name" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="done">/.test(drawerSrc)
    && /\n\.pop-name \{ width: 100%; height: 32px; border-radius: 8px;/.test(css)
    && /\n  \.field, \.backup-new input, \.backup-new select, \.pop-name \{ height: 40px; \}/.test(css),
    'names on a phone: the Store, New folder and Backup name fields are 40 px on touch, keep the case typed (no first-letter capital, no autocorrect) and label the keyboard\'s Enter Done, as the writers\' fields do');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const drawerSrcForNames = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const body = appSrc.match(/\n  _storePrompt\(level, anchor\) \{\n([\s\S]*?)\n  \}\n/)[1];
  const nameForm = appSrc.match(/\n  nameForm\(form, onName, \{ focus = true \} = \{\}\) \{\n([\s\S]*?)\n  \}\n/)?.[1] ?? '';
  const newFolder = drawerSrcForNames.match(/\n  _newFolder\(anchor\) \{\n([\s\S]*?)\n  \}\n/)?.[1] ?? '';
  assert(/const names = varOrder\(\)\.filter\(\(id\) => !isDirectory\(varRecall\(id\)\)\);/.test(body)
    && /<div class="pop-chips">\$\{names\.map\(\(id\) => `<button type="button" class="chip" data-name="\$\{escapeHtml\(id\)\}">\$\{escapeHtml\(id\)\}<\/button>`\)\.join\(''\)\}<\/div>/.test(body)
    && /const take = this\.nameForm\(pop\.querySelector\('form'\), \(name, refuse\) => \{/.test(body)
    && /pop\.querySelector\('\.pop-chips'\)\?\.addEventListener\('click', \(e\) => \{ const chip = e\.target\.closest\('\.chip'\); if \(chip\) take\(chip\.dataset\.name\); \}\);/.test(body)
    && /\n\.pop-chips \{ display: flex; flex-wrap: wrap; gap: 6px; padding: 0 6px 4px; \}/.test(css),
    'Store in a variable: the popover lists the directory\'s variables (not its folders) as chips in the VARS menu\'s order, and a tap stores the level in that name through the same path as the field, with its Undo note');
  assert(/const name = text\.trim\(\)\.replace\(\/\^\(\['`\]\)\(\.\+\)\\1\$\/, '\$2'\);\s*if \(!name\) return;\s*if \(!isValidHpIdentifier\(name\)\) refuse\([\s\S]*?\);\s*else if \(isReservedHpName\(name\)\) refuse\([\s\S]*?\);\s*else onName\(name, refuse\);/.test(nameForm)
    && /try \{\s*varStore\(name, value\);/.test(body) && !/notifyError/.test(body),
    'Store in a variable: a name STO refuses (1A, X Y, SIN, an empty field) is refused before anything is stored, and quotes around a name are dropped, where any text became a variable no name typed on the line could reach');
  assert(/<div class="note err" role="alert" hidden><\/div>/.test(body)
    && /const refuse = \(message\) => \{\s*note\.textContent = message;\s*note\.hidden = false;\s*field\.setAttribute\('aria-invalid', 'true'\);\s*field\.focus\(\);/.test(nameForm)
    && /field\.addEventListener\('input', \(\) => \{ note\.hidden = true; field\.removeAttribute\('aria-invalid'\); \}\);/.test(nameForm)
    && /\n\.pop \.note\.err \{ padding-top: 0; color: var\(--danger\); \}/.test(css),
    'Store in a variable: a refusal shows under the field and clears as the name is retyped, where an error note covered the popover\'s heading, or its field in landscape, with the keyboard up');
  assert(/<div class="note err" role="alert" hidden><\/div><div class="note">Same as <code>\\`NAME\\` CRDIR<\/code>\.<\/div>/.test(newFolder)
    && /app\.nameForm\(pop\.querySelector\('form'\), \(dir, refuse\) => \{/.test(newFolder)
    && /catch \(err\) \{ app\.entry\._dropNoOpUndoStep\(\); refuse\(err\.message\); \}/.test(newFolder) && !/notifyError/.test(newFolder),
    'Variables, New folder: the name field reads names as the Store box does, an empty one doing nothing and quotes dropped, and says why it refuses one under the field, where an error note covered the field itself at 280 px with the keyboard up');
  assert(/const next = input\.value\.trim\(\)\.replace\(\/\^\(\['`\]\)\(\.\+\)\\1\$\/, '\$2'\);/.test(drawerSrcForNames)
    && /if \(keep\) \{ input\.setAttribute\('aria-invalid', 'true'\); input\.select\(\); return; \}/.test(drawerSrcForNames)
    && /if \(ev\.key === 'Enter'\) \{ ev\.preventDefault\(\); finish\(true, true\); \}/.test(drawerSrcForNames)
    && /\n\.vr\.editing \.nm input\[aria-invalid\],[^{]* \{ border-color: var\(--danger\); \}/.test(css),
    'Variables, Rename: a refused name stays in the field, marked and selected, for Enter to try again, where the field closed and lost what was typed; quotes around a name are dropped, and leaving the field keeps the old name');
  assert(/this\._bindArchive\(body\.querySelector\('\[data-form="archive"\]'\)\);/.test(drawerSrcForNames)
    && /this\.app\.nameForm\(form, \(name, refuse\) => \{[\s\S]*?\}, \{ focus: false \}\);/.test(drawerSrcForNames)
    && /if \(focus\) requestAnimationFrame\(\(\) => field\.focus\(\)\);/.test(nameForm)
    && /catch \(e\) \{\s*refuse\(`Archive failed: \$\{e\.message\}`\);/.test(drawerSrcForNames)
    && !/Backups need a variable-style name/.test(drawerSrcForNames)
    && /\n\.backup-new \.note\.err \{ flex-basis: 100%;/.test(css) && css.includes('.backup-new input[aria-invalid] { border-color: var(--danger); }'),
    'Variables, Backups: the name field reads names as Store and New folder do, an empty one doing nothing and quotes dropped, and says why it refuses one under the field, where an empty name drew an error toast and a quoted one was refused; opening the drawer does not focus it');
  assert(/field\.focus\(\);\s*\/\/[^\n]*\n\s*note\.scrollIntoView\(\{ block: 'nearest' \}\);\s*\};/.test(nameForm),
    'a refused name scrolls its note into view after focusing the field, where the Backups note sat under the phone keyboard at 280 and 390 px and in landscape, the drawer keeping only the field above it');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/input\.autocomplete = 'off';\n\s*input\.autocapitalize = 'off';\n\s*input\.setAttribute\('autocorrect', 'off'\);\n\s*input\.enterKeyHint = 'done';/.test(drawerSrc)
    && /\n  \.vr\.editing \.nm input \{ height: 40px; \}/.test(css),
    'Variables drawer, rename on a phone: the inline name field is 40 px on touch, keeps the case typed and labels Enter Done, as the Store and New folder fields do');
  {
    const sources = ['palette', 'drawer', 'graph-view', 'sheets'].map((f) => readFileSync(new URL(`../www/src/ui/${f}.js`, import.meta.url), 'utf8')).join('\n');
    const inputs = sources.match(/<input (?:type="(?:text|search)"|class="gr-expr")[\s\S]*?>/g) ?? [];
    const loose = inputs.filter((tag) => !/inputmode="decimal"/.test(tag) && !(/autocapitalize="off"/.test(tag) && /autocorrect="off"/.test(tag)));
    assert(inputs.length >= 10 && loose.length === 0,
      `phone keyboards: every field RPL is typed into (command search, the drawer filters, name fields, the plot's expressions, INFORM) turns off autocapitalize and autocorrect, as the command line does, so an iPhone neither capitalises nor "corrects" what is typed${loose.length ? `; still loose: ${loose.map((t) => t.slice(0, 60)).join(' | ')}` : ''}`);
  }
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const FCN_TOOLS = Object\.freeze\(\[\['ROOT', [^\]]*\], \['ISECT', [^\]]*\], \['SLOPE', [^\]]*\], \['AREA', [^\]]*\], \['SHADE', [^\]]*\], \['EXTR', [^\]]*\], \['F\(X\)', [^\]]*\], \['NXEQ', [^\]]*\], \["F'", [^\]]*\], \['TANL', [^\]]*\]\]\);/.test(gv)
    && /<div class="pl-fcn" role="toolbar" aria-label="Function tools" hidden>\$\{FCN_TOOLS\.map\(/.test(gv)
    && /if \(fcn\) \{ this\.fcnTool\(fcn\.dataset\.fcn\); return; \}/.test(gv)
    && /this\._fcnTools\.hidden = !this\._fcnTrace\(\);/.test(gv)
    && /value = Tagged\('Root', Real\(x\)\);/.test(gv) && /value = Tagged\('Extrm', Complex\(e\.x, e\.y\)\);/.test(gv) && /value = Tagged\('Slope', Real\(slope\)\);/.test(gv)
    && /this\.app\.commitEntryAndPush\(value\);\n\s*this\.traceX = x;\n\s*if \(!this\.tracing\) this\.setTraceMode\(true\);/.test(gv)
    && /\.pl-pict, \.pl-fcn \{ display: flex; flex-wrap: wrap; gap: 5px; padding: 0 2px 6px; \}/.test(css)
    && /\n  \.pl-kinds, \.pl-pict, \.pl-fcn \{ flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; \}/.test(css),
    'plot FCN: a function plot has ROOT, EXTR and SLOPE chips under the readout that work about the cursor on the selected or first function trace, push the answer tagged as the HP does (Root:, Extrm:, Slope:) and move the trace cursor there');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/this\._addTrace\(traceFromInputs\(kind, expr, exprY\), \{ fit: !!spec\.fitOnAdd \}\);\n[^\n]*\n\s*this\._addX\.scrollIntoView\?\.\(\{ block: 'nearest' \}\);/.test(gv),
    'plot, keyboard up: after a trace is added the add field is scrolled back into view, where the grown trace list pushed it under the keyboard');
  assert(gv.includes('if (Number.isFinite(y)) return Complex(Number(this.traceX.toPrecision(12)), Number(y.toPrecision(12)));'),
    'plot trace: Enter pushes the traced point as the readout shows it, on the curve, where x = 0.75 with SIN(X) = 0.681639 pushed (0.8, 0.7), a point off the curve');
  assert(/\} else if \(this\.tracing && \(dir === 'up' \|\| dir === 'down'\) && this\._stepTrace\(dir === 'up' \? -1 : 1\)\) \{/.test(gv)
    && /_stepTrace\(by\) \{\s*const fns = this\.traces\.filter\(\(t\) => t\.enabled && t\.kind === 'function'\);\s*if \(fns\.length < 2\) return false;/.test(gv)
    && gv.includes('for (const t of [this._fcnTrace(), ...this.traces].filter(Boolean)) {'),
    'plot trace: with several functions plotted, up and down move the trace to the previous or next one, as the HP\'s ▲ and ▼ do, and Enter pushes that function\'s point; with one function they still pan');
  assert(gv.includes("const picked = this.tracing && this.traces.filter((t) => t.enabled && t.kind === 'function').length > 1 ? this._fcnTrace() : null;")
    && gv.includes("bits.push(`${t === picked ? '▸ ' : ''}${withFractionMark(t.label || t.expr || t.kind)} = ${fmtAxis(yv)}`);")
    && gv.includes('T traces (up and down, or a tap on a curve, then switch function)'),
    'plot trace: with several functions the readout marks the one Enter pushes with ▸, and the plot\'s spoken help names up and down');
  {
    const { GraphView } = await import('../www/src/ui/graph-view.js');
    const { traceFromInputs } = await import('../www/src/ui/plot-engine.js');
    const sin = { ...traceFromInputs('function', 'SIN(X)'), id: 's', enabled: true };
    const cos = { ...traceFromInputs('function', 'COS(X)'), id: 'c', enabled: true };
    const self = { view: { xmin: -10, xmax: 10, ymin: -10, ymax: 10 }, traces: [sin, cos], _hoverOpts: () => ({}) };
    const near = (x, y) => GraphView.prototype._curveNear.call(self, x, y, 400)?.id ?? null;
    assert(near(Math.PI / 2, 0.9) === 's' && near(Math.PI, -0.9) === 'c' && near(5, 6) === null
      && gv.includes('const near = this._curveNear(x, y, rect.height);\n    if (near) this._selectTrace(near.id);'),
      'plot trace: a tap on a curve traces that function, the touch twin of up and down; a tap away from every curve keeps the one traced');
  }
  assert(/_markReadout\(\) \{\s*const p = cursorPoint\(this\._mark\.x, this\._mark\.y, this\.view\);\s*return this\._readoutAt\(p\.x, p\.y\);/.test(gv)
    && !gv.includes('this._readoutAt(this._mark.x, this._mark.y)')
    && gv.includes('if (tap && this._mark && !this._projected()) this._readout.textContent = this._markReadout();'),
    'plot cursor: a tap reads the point as Enter pushes it, rounded to its pixel, where the readout said x = 2.46, y = -5.65313 for a push of (2.5, -5.7)');
  {
    const { GraphView } = await import('../www/src/ui/graph-view.js');
    const self = { _box: { clientHeight: 330 }, view: { xmin: -10, xmax: 10, ymin: -10, ymax: 10 }, _projected: () => false };
    GraphView.prototype._keepScale.call(self, () => { self._box.clientHeight = 231; });
    const kept = self.view.ymax === 10 && Math.abs(self.view.ymin + 4) < 1e-9 && self.view.xmin === -10;
    GraphView.prototype._keepScale.call(self, () => {});
    assert(kept && Math.abs(self.view.ymin + 4) < 1e-9
      && gv.includes('if (tap) this._keepScale(() => { this._markAt(ev.offsetX, ev.offsetY); this._syncPush(); });'),
      'plot cursor: the Picture tools a tap brings up take their room from the bottom of the plot at the same scale, so the tapped point stays under the finger, where the plot squashed and the point moved 30 px');
  }
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/\n  \.gr-add input, \.gr-expr, \.pl-range input \{ height: 40px; \}/.test(css),
    'plot on touch: the add, trace and window fields are 40 px, as the plot tools and every other field are');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/value = Tagged\('I-Sect', Complex\(x, f\(x\)\)\);/.test(gv) && /this\._fail\('ISECT needs two functions'\)/.test(gv)
    && /if \(this\._areaFrom\?\.trace !== t\.id\) \{\n\s*this\._areaFrom = \{ x: x0, trace: t\.id \};\n\s*this\._syncPush\(\);/.test(gv)
    && /const area = integrateFunction\(f, this\._areaFrom\.x, x0\);\n\s*this\._areaFrom = null;/.test(gv)
    && /value = Tagged\('Area', Real\(area\)\);/.test(gv)
    && /\[data-fcn="AREA"\]'\)\.setAttribute\('aria-pressed', String\(this\._areaFrom != null\)\);/.test(gv),
    'plot FCN: ISECT pushes the nearest crossing of the function with the next one as I-Sect: (x, y), and AREA marks the first bound on one tap (the chip pressed) and pushes Area: on the next, in the HP\'s FCN order ROOT ISECT SLOPE AREA EXTR');
  assert(/\n@media \(max-height: 400px\) \{ \.pl-box \{ min-height: 150px; \} \}/.test(css),
    'plot in landscape: the plot box gives up its 220 px minimum in a window under 400 px tall, so the readout and FCN keys sit on screen instead of under the fold');
  assert(/axisTicks\(view\.xmin, view\.xmax, axes\.x, axes\.tick\?\.\[0\], width \/ 40\)/.test(gv),
    'plot at 280 px: the x axis asks for a label per 40 px, so its labels no longer collide');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/value = Tagged\('F\(x\)', Real\(y\)\);/.test(gv) && /lookup\('DERIV'\)\.fn\(s\);/.test(gv) && /this\._showTraceRow\(this\._addTrace\(dt\)\);\n\s*value = d;/.test(gv)
    && /const line = traceFromInputs\('function', lineExpr\(m, b, name\)\);/.test(gv) && /value = Tagged\('TanL', TRACE_KINDS\.function\.toStack\(line\)\[0\]\);/.test(gv)
    && /const slope = m === 1 \? name : m === -1 \? `-\$\{name\}` : m === 0 \? '' : `\$\{num\(m\)\}\*\$\{name\}`;/.test(gv)
    && /const exact = d \? evalTraceAtX\(d, x, opts\) : NaN;\n\s*return Number\.isFinite\(exact\) \? exact : slopeAt\(f, x, /.test(gv),
    'plot FCN: F(X) pushes the value here as F(x):, F\' plots the CAS derivative and pushes it, TANL plots the tangent as m*X+b (X for a unit slope, no +0.) and pushes it as TanL:, after EXTR as on the HP; SLOPE and TANL read the CAS derivative when it is ready and difference the curve otherwise');
  assert(/\n  \.gr-show \{ appearance: none; width: 40px; height: 40px; margin: 0; display: grid; place-content: center; \}/.test(css)
    && /\.gr-show:checked::before \{ background: currentColor;/.test(css) && /style="accent-color:\$\{t\.color\};color:\$\{t\.color\}"/.test(gv),
    'plot trace rows on touch: the show/hide box is a 40 px target drawn in the trace\'s colour, where the native 16 px box was the drawer\'s one small control');
  assert(/\.pl-kinds\.more-r, \.pl-pict\.more-r, \.pl-fcn\.more-r, \.pt-wrap\.more-r, \.cb-scroll\.more-r \{ mask-image: linear-gradient\(to right/.test(css)
    && /\.pl-kinds\.more-l\.more-r, \.pl-pict\.more-l\.more-r, \.pl-fcn\.more-l\.more-r, \.pt-wrap\.more-l\.more-r, \.cb-scroll\.more-l\.more-r \{/.test(css)
    && /for \(const row of this\._chipRows\) row\.addEventListener\('scroll', \(\) => markScrollEdges\(row\), \{ passive: true \}\);/.test(gv)
    && /_markChipRows\(\) \{\n\s*for \(const row of this\._chipRows\) markScrollEdges\(row\);/.test(gv),
    'plot chip rows on a phone: the plot types, PICT and FCN rows fade at the edge that scrolls, as the key strip and drawer tabs do');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  assert(/this\._areaFrom = \{ x: x0, trace: t\.id \};/.test(gv) && /if \(this\._areaFrom\?\.trace !== t\.id\) \{/.test(gv)
    && /this\._dropStaleBound\('_areaFrom', 'Area'\);\n\s*this\._dropStaleBound\('_shadeFrom', 'Shade'\);/.test(gv),
    'plot AREA: the first bound belongs to the function it was marked on, so once that trace is removed, hidden or deselected the key shows unpressed and the next tap marks afresh instead of integrating another function from the old bound');
  assert(/this\._showTraceRow\(this\._addTrace\(dt\)\);/.test(gv) && /this\._showTraceRow\(this\._addTrace\(line\)\);/.test(gv)
    && /_showTraceRow\(t\) \{\n\s*this\._exprs\.querySelector\(`\.gr-trace\[data-trace="\$\{t\.id\}"\]`\)\?\.scrollIntoView\?\.\(\{ block: 'nearest' \}\);/.test(gv),
    'plot F\' and TANL on a phone: the trace they add scrolls into view in the list, as the add field does after Add');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  assert(/<button type="button" data-gr="zsqr" title="Square the axes \(ZSQR\)" aria-label="Square the axes">/.test(gv)
    && /<button type="button" data-gr="cntr" title="Centre on the cursor \(CNTR\)" aria-label="Centre on the cursor">/.test(gv)
    && /else if \(act === 'zsqr'\) this\.squareView\(\);\n\s*else if \(act === 'cntr'\) this\.centerOnCursor\(\);/.test(gv)
    && /const half = \(v\.xmax - v\.xmin\) \* rect\.height \/ rect\.width \/ 2, cy = \(v\.ymin \+ v\.ymax\) \/ 2;\n\s*this\.view = \{ \.\.\.v, ymin: cy - half, ymax: cy \+ half \};/.test(gv)
    && /this\.view = panView\(v, p\.re - \(v\.xmin \+ v\.xmax\) \/ 2, p\.im - \(v\.ymin \+ v\.ymax\) \/ 2\);/.test(gv)
    && /this\._fail\('CNTR needs a cursor: tap the plot or trace first'\)/.test(gv),
    'plot tools: ZSQR brings the y scale to the x scale about the centre so a circle is round, and CNTR pans the window to put the cursor at its centre, as the HP\'s ZOOM keys do; without a cursor CNTR says so');
}

{
  const gv = readFileSync(new URL('../www/src/ui/graph-view.js', import.meta.url), 'utf8');
  const pe = readFileSync(new URL('../www/src/ui/plot-engine.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/const plottableFormula = \(value\) => \{ const v = isTagged\(value\) \? value\.value : value; return isSymbolic\(v\) && !hasUnits\(v\.expr\); \};/.test(app)
    && /const isFormula = \(v\) => isSymbolic\(v\) \|\| isName\(v\) \|\| \(isTagged\(v\) && isFormula\(v\.value\)\);/.test(gv)
    && /if \(isTagged\(v\)\) return stackValueToTrace\(v\.value, preferredKind, below\);/.test(pe),
    'plot from a level: a tagged formula, as TANL and F\' leave on the stack, offers Plot and plots as the formula, where the level offered nothing and PLOT said FUNCTION needs an expression');
  assert(/if \(this\._shadeFrom\?\.trace !== t\.id\) \{\n\s*this\._shadeFrom = \{ x: x0, trace: t\.id \};/.test(gv)
    && /this\._shade = \{ from: Math\.min\(this\._shadeFrom\.x, x0\), to: Math\.max\(this\._shadeFrom\.x, x0\), a: t\.id, b: other\?\.id \?\? null \};/.test(gv)
    && /this\._drawShade\(ctx, width, height\);\n\s*this\._drawPict\(ctx, width, height\);/.test(gv)
    && /const ya = evalTraceAtX\(a, x, opts\), yb = b \? evalTraceAtX\(b, x, opts\) : 0;/.test(gv)
    && /ctx\.fillStyle = a\.color;\n\s*ctx\.globalAlpha = 0\.25;/.test(gv)
    && /if \(this\._shade && \(this\._shade\.a === id \|\| this\._shade\.b === id\)\) this\._shade = null;/.test(gv),
    'plot FCN SHADE: one tap marks the first bound (the chip pressed), the next shades between the function and the next one, or the x axis, over the bounds, in the function\'s colour at a quarter; the shade goes with either trace');
  assert(/const fns = this\.traces\.filter\(\(o\) => o\.enabled && o\.kind === 'function'\);\n\s*const next = fns\[\(fns\.indexOf\(t\) \+ 1\) % fns\.length\];\n\s*this\._selectTrace\(next\.id\);\n\s*this\._showTraceRow\(next\);/.test(gv),
    'plot FCN NXEQ: the next enabled function becomes the current one, its row scrolled into view, as the HP\'s NXEQ turns to the next equation');
  assert(/_dropStaleBound\(key, label\) \{\n\s*if \(!this\[key\] \|\| this\[key\]\.trace === this\._fcnTrace\(\)\?\.id\) return;\n\s*this\[key\] = null;\n\s*if \(this\._readout\.textContent\.startsWith\(`\$\{label\} from `\)\) this\._readout\.textContent = this\._idleReadout\(\);/.test(gv),
    'plot AREA and SHADE: a first bound whose function is gone is dropped with its "move the cursor and tap again" readout, so the readout and the chip agree');
}

{
  const app = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/setFilerHook\(\(\) => setTimeout\(\(\) => \{ document\.activeElement\?\.blur\?\.\(\); this\.drawers\.open\('vars'\); \}\)\);/.test(app)
    && /setOffHook\(\(\) => setTimeout\(\(\) => this\.turnOff\(\)\)\);/.test(app)
    && /this\._noteAutosave\(saveToLocalStorage\(this\.stack\)\);\n\s*const off = document\.createElement\('div'\);\n\s*off\.className = 'off-screen';/.test(app)
    && /off\.addEventListener\('click', wake\);\n\s*document\.addEventListener\('keydown', wake, true\);/.test(app) && /if \(ev\.type === 'keydown'\) this\.entry\.focus\(\);/.test(app)
    && /const wake = \(ev\) => \{\n\s*ev\.preventDefault\(\);\n\s*ev\.stopPropagation\(\);/.test(app)
    && /\n\.off-screen \{ position: fixed; inset: 0; z-index: 300;/.test(css),
    'FILER opens the Variables drawer and OFF saves the session and covers the app with an off screen that a tap or a key removes, as the HP\'s file manager and power switch');
}

{
  const sh = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/setTableHook\(\(\) => setTimeout\(\(\) => this\.sheets\.openPeriodicTable\(\)\)\);/.test(app)
    && /class="pt-cell b-\$\{el\[15\]\}" data-sh="pt-elem" data-z="\$\{el\[0\]\}" style="grid-column:\$\{el\[23\]\};grid-row:\$\{el\[24\]\}"/.test(sh)
    && /class="pt-prop" data-sh="pt-push" data-prop="\$\{i \+ 1\}"/.test(sh)
    && /case 'pt-push': \{\n\s*const v = propertyValue\(ELEMENTS\[this\.ptZ - 1\], PROPERTIES\[Number\(b\.dataset\.prop\) - 1\]\);\n\s*if \(!v\) return;\n\s*app\.commitEntryAndPush\(v\);/.test(sh)
    && /\n\.pt-grid \{ display: grid; grid-template-columns: repeat\(18, 38px\); grid-auto-rows: 38px;/.test(css) && /\n\.pt-prop \{ [^\n]*min-height: 40px;/.test(css),
    'PERTBL opens a sheet with the 18-column table in finger-wide cells placed by period and group, a tap on an element lists its 23 properties and a tap on a property puts it on the stack');
}

{
  const sh = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/setLibraryHook\(\(\) => setTimeout\(\(\) => this\.sheets\.openEquationLibrary\(\)\)\);/.test(app)
    && /row\('eq-subject', i \+ 1, title, /.test(sh) && /row\('eq-set', i \+ 1, t, /.test(sh)
    && /case 'eq-solve': \{\n\s*const \{ subject, set \} = this\.eqlib;\n\s*this\.close\(\);\n\s*app\.entry\.safeRun\(\(\) => app\.stack\.runOp\(\(\) => \{ solveSet\(subject, set\); lookup\('MSOLVR'\)\.fn\(app\.stack\); \}\), 'SOLVEQN'\);/.test(sh)
    && /\n\.eq-row \{ [^\n]*min-height: 40px;/.test(css),
    'EQNLIB opens a sheet of the HP\'s subjects, then a subject\'s sets, then a set\'s equations with Solve, which sets EQ and Mpar and opens the solver as SOLVEQN does, in finger-tall rows');
  assert(/const wrap = this\.el\.querySelector\('\.pt-wrap'\);\n\s*markScrollEdges\(wrap\);\n\s*wrap\.addEventListener\('scroll', \(\) => markScrollEdges\(wrap\), \{ passive: true \}\);/.test(sh)
    && /\.pl-fcn\.more-r, \.pt-wrap\.more-r, \.cb-scroll\.more-r \{ mask-image/.test(css),
    'the periodic table\'s row fades at the edge that scrolls, as the key strip and the plot rows do');
}

{
  const sh = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const \{ names, known \} = setVariables\(subject, set\);\n\s*const vars = names\.map\(\(id\) => \(known\[id\] \? `<span class="known">\$\{escapeHtml\(id\)\} = \$\{format\(known\[id\]\)\}<\/span>` : `<span>\$\{escapeHtml\(id\)\}<\/span>`\)\)\.join\(''\);/.test(sh)
    && /<p class="eq-vars">\$\{vars\}<\/p>/.test(sh) && /\n\.eq-vars \{ display: flex; flex-wrap: wrap;/.test(css) && /\n\.eq-vars \.known \{ border-style: dashed;/.test(css),
    "a set's page lists its variables in the solver's key order, the constants it knows with their values, so a phone shows what the solver's keys will be before Solve");
}

{
  const sh = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/class="eq-eq" data-sh="eq-push" data-i="\$\{i\}"/.test(sh)
    && /case 'eq-push': \{\n\s*const v = libraryEquation\(this\.eqlib\.subject, this\.eqlib\.set, Number\(b\.dataset\.i\)\);\n\s*app\.commitEntryAndPush\(v\);\n\s*app\.toast\(`\$\{format\(v\)\} is on the stack`\);/.test(sh)
    && /\n\.eq-eq \{ display: block; width: 100%; min-height: 40px;/.test(css),
    "a set's equations are finger-tall buttons that put the equation on the stack with a toast, as the HP's →STK key and the periodic table's property rows do");
}

{
  const sh = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const lift = foot\?\.height && box && foot\.bottom >= box\.bottom - 24 \? Math\.round\(box\.bottom - foot\.top \+ 8\) : 0;\n\s*notes\.style\.setProperty\('--note-lift', `\$\{lift\}px`\);/.test(sh)
    && /_draw\(\) \{\n\s*requestAnimationFrame\(\(\) => this\._liftNotes\(\)\);/.test(sh)
    && /this\._resize = new ResizeObserver\(\(\) => this\._liftNotes\(\)\);/.test(sh)
    && /\.lay-sheet:not\(:empty\) ~ #toasts \{ top: auto; bottom: max\(calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\), var\(--note-lift, 0px\)\); \}/.test(css),
    "a note over a sheet that fills a phone's screen sits above its footer, so the minimal-view note no longer takes the first tap on Solve, Back or Close");
  assert(/_render\(\) \{\s*const keep = this\._focusedControl\(\);\s*this\._draw\(\);\s*this\._oneStopPerGroup\(\);\s*if \(keep\) this\.el\?\.querySelector\(keep\)\?\.focus\(\{ preventScroll: true \}\);/.test(sh)
    && sh.includes('const attrs = Object.entries(at.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${globalThis.CSS?.escape?.(v) ?? v}"]`);'),
    'a sheet redrawn by a choice keeps the keyboard on the control it was on, where choosing a theme, a size or a switch in Settings by keyboard left the focus on nothing');
  assert(/_oneStopPerGroup\(\) \{[\s\S]{0,300}for \(const r of radios\) r\.tabIndex = r === chosen \? 0 : -1;/.test(sh)
    && /const radio = \/\^Arrow\(Left\|Right\|Up\|Down\)\$\/\.test\(e\.key\) && e\.target\.closest\?\.\('\[role="radiogroup"\] \[role="radio"\]'\);[\s\S]{0,400}next\.focus\(\);\s*next\.click\(\);/.test(sh),
    'Settings radio groups take one Tab stop, on the chosen option, and the arrow keys choose among the options, where every theme, size and side was its own Tab stop');
}

{
  const toast = readFileSync(new URL('../www/src/ui/toast.js', import.meta.url), 'utf8');
  assert(/const away = \(ev\) => \{\n\s*if \(t\.isConnected && ev\.target\.closest\?\.\('\.toast'\)\) return;/.test(toast),
    "a press on another note's button leaves the transient minimal-view note in place, so the note under it does not jump away from the finger before the tap lands");
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/@container sheet \(max-width: 319px\) \{ \.sheet-f \{ gap: 6px; padding-inline: 12px; \} \.chip \{ padding-inline: 8px; \} \}/.test(css),
    'a sheet footer of three keys and the four stack text sizes keep to one row on a 280 px phone');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/navigator\.userActivation\?\.isActive === false\) this\.toast\(`Choose \$\{what\} to receive`, \{ key: 'receive', action: 'Choose', onAction: pick, timeout: Infinity, transient: true, essential: true \}\)/.test(appSrc),
    'a receive with no press to open a picker asks for a tap with a note that waits for it');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/_upload\(\) \{\s*pickFiles\(UPLOAD_ACCEPT, \(files\) => this\.app\.storeFiles\(files, null, 'Added'\)\);\s*\}/.test(drawerSrc)
      && /async storeFiles\(files, pairs = null, verb = 'Received'\) \{[\s\S]*?const as = receivedName\(target\);/.test(appSrc),
    'Upload in the Variables drawer takes several files and stores them as RECV does, a name in use taking a number');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/const note = appNote\(entry\);[\s\S]{0,800}?\$\{note \? `<div class="sum ref-app">\$\{escapeHtml\(note\)\}<\/div>` : ''\}/.test(drawerSrc) && /\.ref \.ref-app \{/.test(css),
    "the Catalog page shows rpl.ai's note under the HP's summary, where a phone sees it without scrolling");
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(css.includes('@container app (max-width: 479px) { .toasts { width: 92%; justify-items: stretch; } .toast > span { flex: 1; } }'),
    'on a phone stacked notes share one width with their buttons at the right edge');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(drawerSrc.includes('<span class="backup-to"><select name="port"') && drawerSrc.includes('>Archive</button></span><div class="note err" role="alert" hidden></div></form>')
    && css.includes('.backup-new { display: flex; flex-wrap: wrap;') && css.includes('.backup-new input { flex: 1 1 140px;')
    && css.includes('.backup-to { display: flex; gap: 6px; margin-left: auto; }'),
    'in a narrow drawer the backup name takes its own row and the port and Archive wrap together beneath it');
  assert(drawerSrc.includes(`<span class="when">\${escapeHtml(at.toLocaleDateString([], { dateStyle: 'short' }))}</span> <span class="when">\${escapeHtml(at.toLocaleTimeString([], { timeStyle: 'short' }))}</span>`)
    && drawerSrc.includes(' · ${savedWhen(savedAt)}</div>')
    && css.includes('.dw-backups .pv { white-space: normal; }') && css.includes('.dw-backups .when { white-space: nowrap; }'),
    'a backup row keeps its date and its time each whole, the time wrapping beneath the date in a 280 px drawer rather than being cut');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(appSrc.includes("if (kind !== this.menuKind || folder !== this.menuFolder) this._lastMenu = { kind: this.menuKind, folder: this.menuFolder, slots: this.menuAll };")
    && /showLastMenu\(\) \{\s*const last = this\._lastMenu;\s*if \(!last\?\.kind\) this\.toast\('No menu before this one', \{ key: 'last-menu' \}\);\s*else if \(last\.kind === 'TMENU' \|\| last\.folder\) this\.setMenu\(last\.slots, last\.kind, \{ folder: last\.folder \}\);\s*else this\.showMenu\(last\.kind, \{ commit: false \}\);/.test(appSrc),
    '0 MENU goes back to the menu shown before this one, a TMENU menu or folder included, as the HP\'s last menu does (it said there was none after TMENU)');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/if \(!this\._archive\(form\.elements\.port\.value, name, refuse\)\) return;[\s\S]{0,200}?form\.elements\.name\.value = '';\s*form\.elements\.name\.blur\(\);/.test(drawerSrc)
    && /app\.toast\(`\$\{exists \? 'Replaced' : 'Archived'\} :\$\{port\}:\$\{name\}`\);\s*return true;/.test(drawerSrc),
    "a backup archived from the drawer's form clears the name and puts the phone keyboard away, so the new row shows (Archive and the row were under the keyboard)");
}

{
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  assert(/const share = typeof navigator\.share === 'function' \? `<button type="button" class="btn" data-sh="pr-share">/.test(sheetsSrc)
    && sheetsSrc.includes("case 'pr-share': app.shareText(printLog.join('\\n')); return;"),
    'the print log shares what was printed where the phone can share, as VIEW does');
  assert(/const foot = printLog\.length\s*\? `<button type="button" class="btn" data-sh="pr-copy">[\s\S]{0,200}?\$\{share\}<button type="button" class="btn" data-sh="pr-clear">[^`]*`\s*: `<button type="button" class="btn" data-sh="close">/.test(sheetsSrc),
    "the print log's footer keeps to Copy, Share and Clear on one row on a phone, the header's × closing it, as VIEW's footer does");
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const persistSrc = readFileSync(new URL('../www/src/rpl/persist.js', import.meta.url), 'utf8');
  assert(drawerSrc.includes('<button type="button" class="mini" data-dw="backup-save" data-key="${key}"')
    && drawerSrc.includes("case 'backup-save': e.stopPropagation(); this._saveBackup(t.dataset.key); return;")
    && /export function exportBackup\(port, name\) \{[\s\S]{0,200}?downloadFile\(JSON\.stringify\(backup\.snap, null, 2\), `hp50-\$\{port\}-\$\{safeFileName\(name\)\}\.json`, 'application\/json'\);/.test(persistSrc),
    "a backup's row saves it as a file that Restore from file reads back, so a phone's backup can move to another device");
}

{
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  assert(/openPrintLog\(\) \{\s*this\.app\.toasts\?\.dismiss\('print'\);\s*this\._open\('print'\);/.test(sheetsSrc),
    "opening the print log puts away the note whose Show opens it, which stayed over the log when it was opened from search");
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(drawerSrc.includes('<div class="main"><div class="nm"><span class="nm-text">:${key}</span></div>'),
    "a backup's name wraps on a phone as a variable's does, where :1:A_VERY_LONG_BACKUP_NAME was clipped mid-letter at 280 px");
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(/const backup = deleteBackup\(port, name\);\s*this\.app\.toast\(`Deleted backup :\$\{key\}`, \{ key: 'backup-delete', action: 'Undo', onAction: \(\) => putBackBackup\(port, name, backup\) \}\);/.test(drawerSrc),
    "a backup deleted from its row comes back with the note's Undo, a slip of the finger beside Save costing nothing");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/const mes = family === 'MES' && mesMenu\(\);\s*if \(mes && matchMedia\('\(pointer: coarse\)'\)\.matches\) this\.toast\(`\$\{mes\.title \|\| 'Solver'\}: tap a variable's key to store level 1 in it; hold the unknown's key to solve for it\.`, \{ key: 'mes' \}\);/.test(appSrc),
    "MSOLVR and the Equation Library's Solve say on a phone how the solver's keys store and solve, there being often no shift key showing");
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(displaySrc.includes('this._installLevelDrag(view);')
    && /if \(ev\.pointerType !== 'touch' \|\| !ev\.isPrimary \|\| !ev\.target\.closest\?\.\('\.st-lvl'\)\) return;/.test(displaySrc)
    && /if \(this\._held \|\| \(dx > 10 && dx >= dy\)\) \{ drag = null; return; \}\s*if \(dy <= 10\) return;/.test(displaySrc)
    && /if \(ev\.type !== 'pointerup' \|\| !target\) return;/.test(displaySrc)
    && css.includes('.st-row[data-key] .st-lvl { touch-action: none; align-self: stretch; margin-block: -6px; display: flex; align-items: center; justify-content: flex-end; }'),
    "a finger moved up or down from a level's number drags the level onto another, as a mouse does, while sideways it still swipes the level away");
}

{
  const tourSrc = readFileSync(new URL('../www/src/ui/tour.js', import.meta.url), 'utf8');
  assert(tourSrc.includes("a finger held on it opens its menu, a swipe sideways drops it, and a drag up or down by its number moves it, or copies it to the command line or an open writer, or stores it in a variable's soft key.\""),
    "the tour's stack card on a phone names the swipe that drops a level and the drag by its number that moves it, copies it to the command line or a writer, or stores it in a variable's key");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/if \(this\.pendingEdit\?\.kind === 'level' && this\.stack\.peek\(this\.pendingEdit\.level\) !== this\.pendingEdit\.value\) this\._followEdit\(\);/.test(appSrc)
    && /_followEdit\(\) \{\s*const \{ value \} = this\.pendingEdit;\s*let level = 0;\s*for \(let n = 1; n <= this\.stack\.depth && !level; n\+\+\) if \(this\.stack\.peek\(n\) === value\) level = n;\s*this\.pendingEdit = level \? \{ \.\.\.this\.pendingEdit, level, label: `Editing level \$\{level\}` \} : null;\s*this\.input\.render\(\);\s*this\.renderStatus\(\);/.test(appSrc)
    && /writerCommit\(value\) \{\s*if \(this\.entry\.buffer\.trim\(\)\) this\.entry\.enter\(\);\s*const edit = this\.pendingEdit;/.test(appSrc),
    "a level edit follows its value when other levels are moved, swiped away or pushed, so Enter still replaces it and minimal view's pencil names its new level; it ends, pencil and all, only when the value leaves the stack");
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(displaySrc.includes("?.closest?.('.st-row[data-key], #cmdline, .mx-cell, .eqw, .mx, .sk.var');")
    && /if \(target\.matches\('\.st-row'\)\) this\.onRowMove\?\.\(from, Number\(target\.dataset\.level\)\);\s*else if \(target\.matches\('\.sk'\)\) this\.onRowStore\?\.\(from, Number\(target\.dataset\.i\)\);\s*else this\.onRowEcho\?\.\(from, target\);/.test(displaySrc)
    && appSrc.includes("this.levelAction('echo', level);")
    && css.includes('.cmdline.drag-over { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }')
    && css.includes(':root[data-view="minimal"] .input .cmdline.drag-over { background: var(--accent-dim); }'),
    "a level a finger drags by its number onto the command line is typed there, as ECHO does and a mouse's drop already did, the line lit while it is over it, minimal view's borderless line with a tint");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const mxSrc = readFileSync(new URL('../www/src/ui/matrix-editor.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(appSrc.includes("case 'echo': this.clearSelection(); this._echo(level); return;")
    && /if \(this\.inputMode === 'equation'\) this\.equationEditor\._pasteText\(source\);\s*else if \(this\.inputMode === 'matrix'\) this\.matrixEditor\.echo\(source\);\s*else this\.entry\.typeToken\(source\);/.test(appSrc)
    && /echo\(text\) \{\s*if \(this\.typedCellFocused\(\)\) \{ this\._editCell\(text\); return; \}\s*const \[r, c\] = this\._activeCell\(\);\s*this\._writeCell\(r, c, text, \[text\.length, text\.length\]\);/.test(mxSrc)
    && css.includes('.eqw.drag-over, .mx.drag-over { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-line); }'),
    'ECHO with a writer open, from the level menu or a finger drop on the writer, puts the level in the formula at the caret or in the focused matrix cell, not the hidden command line');
  assert(/if \(e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*this\.app\.commitEntry\(\);/.test(mxSrc),
    'matrix writer: Ctrl or Cmd+Enter in a typed cell pushes the matrix, where it did nothing and only an Enter on an untyped cell could');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(appSrc.includes("item('echo', 'chr', `Copy into ${this._echoPlace()} (ECHO)`, shortcutText('level.echo')),")
    && appSrc.includes("{ label: 'ECHO', title: `Copy it into ${this._echoPlace()} (⇧Enter)`, onPress: act('echo') },")
    && appSrc.includes("return { equation: 'the formula', matrix: 'the matrix cell' }[this.inputMode] ?? 'the command line';"),
    'the level menu and the ECHO soft key name where ECHO puts the level: the command line, the formula or the matrix cell');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const mxSrc = readFileSync(new URL('../www/src/ui/matrix-editor.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(/d\.onRowEcho = \(level, target\) => \{\s*if \(target\?\.matches\('\.mx-cell'\)\) this\.matrixEditor\.aimCell\(Number\(target\.dataset\.r\), Number\(target\.dataset\.c\)\);\s*this\.levelAction\('echo', level\);/.test(appSrc)
    && /aimCell\(r, c\) \{\s*this\._focusCell\(r, c\);\s*this\._typedCell = null;/.test(mxSrc)
    && css.indexOf('.mx-grid .mx-cell.drag-over { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-line); background: var(--accent-dim); }') > css.indexOf(':root[data-theme="classic"] .mx-cell {'),
    'a level a finger drops on a matrix cell goes over what that cell held, the cell lit while the finger is over it, in Classic too');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(appSrc.includes("if (!this._writerTakes(source)) { this.notifyError(`Level ${level} holds ${describeValue(value).text}, which can't go in ${this._echoPlace()}.`); return; }")
    && /_writerTakes\(source\) \{\s*if \(this\.inputMode === 'equation'\) return readsAsFormula\(source\);\s*if \(this\.inputMode !== 'matrix'\) return true;\s*try \{ parseMatrixCell\(source\); return true; \} catch \{ return false; \}/.test(appSrc),
    'ECHO of a level a writer cannot hold says so plainly (Level 1 holds a program, which can\'t go in the formula) instead of a parser position or a cell that fails at Enter');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const mbSrc = readFileSync(new URL('../www/src/ui/menubar.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(mbSrc.includes("${slot.variable ? ' var' : ''}")
    && /d\.onRowStore = \(level, i\) => \{\s*const slot = this\.menuView\(\)\.slots\[i\];\s*if \(slot\?\.variable\) this\._storeLevel\(level, slot\.label\);/.test(appSrc)
    && /_storeLevel\(level, name\) \{[\s\S]*?const value = this\.stack\.peek\(level\);\s*dropLevel\(this\.stack, level\);\s*varStore\(name, value\);[\s\S]*?this\.undoToast\(`Stored level \$\{level\} in \$\{name\}`\);/.test(appSrc)
    && css.includes('.mb-keys .sk.var.drag-over { box-shadow: inset 0 0 0 2px var(--accent); }'),
    "a level a finger drops on a variable's soft key is stored there and leaves the stack, as ↰ and the key store level 1, with Undo; only variable keys light up");
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  const sheetsSrc = readFileSync(new URL('../www/src/ui/sheets.js', import.meta.url), 'utf8');
  const { normalizeUiPrefs } = await import('../www/src/ui/ui-prefs.js');
  const essential = (key) => new RegExp(`key: '${key}'[^\\n]*essential: true`).test(appSrc);
  assert(normalizeUiPrefs({}).notes === true && normalizeUiPrefs({ notes: false }).notes === false && normalizeUiPrefs({ notes: 'no' }).notes === true
    && /toast\(message, opts = \{\}\) \{\s*if \(this\.prefs\.notes === false && !opts\.essential\) return;\s*this\.toasts\.show\(message, opts\);/.test(appSrc)
    && appSrc.includes("notifyError(message) { this.toasts.show(message, { error: true, timeout: 5200 }); }")
    && essential('alarm') && essential('receive') && /key: 'tutor', timeout: Infinity, essential: true,/.test(appSrc)
    && /'A new version of rpl\.ai is ready', \{[\s\S]{0,200}essential: true,/.test(appSrc)
    && sheetsSrc.includes("${tgl('notes', app.prefs.notes, 'Pop-up notes')}") && sheetsSrc.includes("else if (setting === 'notes') app.setPrefs({ notes: on });"),
    'Settings turns pop-up notes off: Undo notes, hints and confirmations go quiet, while errors, alarms, a file to choose, the tutor and a new version still show');
}

{
  const displaySrc = readFileSync(new URL('../www/src/ui/display.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(displaySrc.includes("row.classList.toggle('drag-below', Number(row.dataset.level) < this._dragLevel);")
    && displaySrc.includes("target?.classList.toggle('drag-below', Number(target.dataset.level) < Number(drag.row.dataset.level));")
    && css.includes('.st-row.drag-over.drag-below { box-shadow: inset 0 -2px 0 var(--accent); }'),
    "a level dragged toward level 1, by a finger or a mouse, shows its drop line under the row it lands below, not over it");
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(css.includes('@container app (max-width: 719px) {\n  .gr-view > .pl-main { flex: none; min-height: calc(100% - 53px); }\n  .gr-view > .pl-side, .app.plot-focus .gr-view > .pl-side { max-height: none; overflow: visible; }\n}')
    && css.indexOf('.gr-view > .pl-side, .app.plot-focus') > css.indexOf('.app.plot-focus .pl-side { max-height: 40%;'),
    'plot, on a phone: the graph fills the sheet with the plot types peeking below, and the types, traces and window scroll up under it (they took 46% of a 390 px phone and left the canvas a quarter of it)');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(drawerSrc.includes('<div class="drawer-grip" aria-hidden="true"></div><div class="dw-top">${tabs}<div class="dw-head">')
    && drawerSrc.includes("if (this.el.offsetTop > 0) return target.closest('.dw-top') ? 'y' : null;")
    && css.includes('.dw-top > .dw-tabs { flex: 999 1 150px; min-width: 0; border-bottom: 0; }')
    && css.includes('@container app (max-width: 979px) { .app:not(.plot-focus) .dw-title { display: none; }')
    && css.includes(':root[data-view="minimal"] .app:not(.plot-focus) .dw-title { display: none; }')
    && css.includes('.drawer { width: 100%; top: auto; height: calc(100% - 24px);'),
    'drawer on a phone or tablet: its buttons end the tab row instead of a title row that repeated the pressed tab, wrapping under the tabs only where they would get under 150 px, and the sheet leaves 24 px above it, not a tenth of the screen; a drag down the row still closes it');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const when = ':root:not([data-keyboard], [data-short]):is([data-view="minimal"], :has(.keys.kp-hidden))';
  const block = css.slice(css.indexOf('@container app (max-width: 719px) {\n  ' + when));
  assert(block.startsWith(`@container app (max-width: 719px) {\n  ${when} .work:has(.eqw) > .input { flex: 2 1 0; display: flex; flex-direction: column; }`)
    && block.includes(`${when} .input-body > .eqw { flex: 1 1 0; grid-template-rows: minmax(92px, 1fr); }`)
    && block.includes(`${when} .input-body > .eqw > .eqw-canvas { max-height: none; }`)
    && css.indexOf(':root:is([data-keyboard], [data-short]) .eqw-canvas { max-height:') > css.indexOf(block.slice(0, 80)),
    'equation writer on a phone with the keypad hidden or in minimal view: the spare height goes two parts to the formula, one to the stack (a 121 px canvas under a 445 px empty stack at 390 by 844); the full keypad, the keyboard up and desktop keep the content-sized canvas');
}

{
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(appSrc.includes("const SHORT_FOR_WRITER = globalThis.matchMedia?.('(max-height: 839px) and (max-width: 639px)');")
    && appSrc.includes("SHORT_FOR_WRITER?.addEventListener('change', () => this.keypad.update());")
    && /setInputMode\(mode[\s\S]*?this\.keypad\.update\(\);/.test(appSrc),
    'a writer opened with the full keypad on a phone under 840 px tall gets the compact keypad, as a short window does: the full one left the stack no whole level at 360 by 740 or 412 by 780 and had to scroll itself');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const row = drawerSrc.slice(drawerSrc.indexOf('  _varRow(name, value) {'), drawerSrc.indexOf('  _renderBackups() {'));
  assert((row.match(/<button /g) ?? []).length === 1 && row.includes('data-dw="var-menu"')
    && /_varMenu\(anchor, name\) \{[\s\S]*?menuItem\('open', 'chr', 'Open'\) : menuItem\('edit', 'edit', 'Edit'\)\}\$\{menuItem\('rename', 'rename', 'Rename'\)\}\$\{menuItem\('download', 'down', 'Download as…'\)\}<hr>\$\{remove\}/.test(drawerSrc)
    && /_varsMenu\(anchor\) \{[\s\S]*?'newdir'[\s\S]*?'upload'[\s\S]*?'export-rpl'[\s\S]*?'export'[\s\S]*?'import'/.test(drawerSrc)
    && drawerSrc.includes('data-dw="vars-more"') && !drawerSrc.includes('vars-foot')
    && drawerSrc.includes('<details class="vr-backups"><summary class="sec-h">') && !css.includes('.vars-foot')
    && !css.includes('  .vr .acts { grid-column: 1 / -1; }'),
    "Variables drawer: a row is its name and value with one ⋯ (Edit or Open, Rename, Download, Delete), the folder tools sit in one ⋯ by the filter, and Backups fold away; a phone showed four buttons under every name and five more under the list");
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/showFamily\(id, from = null\) \{\n    Object\.assign\(this\.cat, \{ q: '', ref: null, family: id \}\);/.test(drawerSrc)
    && /if \(drawer === 'catalog' && family\) \{\n        this\.drawers\.showFamily\(family, from\);/.test(appSrc)
    && /if \(from\) this\._ensureReference\(\)\.then\(\(\) => this\._scrollFamilyTo\(id, from\)\);/.test(drawerSrc),
    'CASCMD and HELP open the Catalog on its CAS list afresh (on a phone they showed the reference page or search the Catalog was last left on), and CASCMD scrolls it to the command a string in level 1 names once the descriptions are in');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  assert(css.includes('.cat-crumb { display: flex; align-items: center; gap: 6px; padding: 2px 8px 8px; position: sticky; top: 0; z-index: 2; background: var(--panel); }')
    && drawerSrc.includes("const crumb = this._body().querySelector('.cat-crumb')?.offsetHeight ?? 0;"),
    'a Catalog family keeps its name and back button in sight down a long list (the CAS family has 121 commands), and CASCMD\'s start lands under it, not behind it');
}

{
  const drawerSrc = readFileSync(new URL('../www/src/ui/drawer.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../www/src/app.js', import.meta.url), 'utf8');
  assert(/showConstants\(\) \{\n    this\.charsQuery = '';/.test(drawerSrc)
    && /if \(drawer === 'chars'\) \{\n        this\.drawers\.showConstants\(\);/.test(appSrc),
    'CONSTANTS opens the Characters drawer on its constants: left filtered to "arrow", it showed only arrows on a phone');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(css.includes('.dw-list > .sec-h { position: sticky; top: 0; z-index: 1; background: var(--panel); }'),
    'a drawer list\'s section names (the Characters groups, History\'s Errors and Entries with Clear) stay in sight while their section scrolls, under the Catalog\'s family name');
}

{
  const css = readFileSync(new URL('../www/css/calc.css', import.meta.url), 'utf8');
  assert(css.includes('  .ann-m.halt + .ann-m.user { margin-left: 4px; }')
    && css.includes('    .ann-status:has(.ann-m.halt):has(.ann-m.user) button.ann-m[data-mode="exact"],')
    && css.includes('@container app (max-width: 319px) { :root[data-theme="classic"] .status-line:has(.ann-m.user):has(.ann-g.opt:not([data-mode]) > .on) :is(.ann-g[data-mode="exact"], .ann-path) { display: none; } }'),
    'minimal view with HALT and USER both lit: they read apart (HALTUSER ran together) and under 320 px the exact mode gives way, with Classic\'s empty path, so Menu and Leave stay on a 280 px screen (they ran 23 px off, 37 in Classic)');
}
