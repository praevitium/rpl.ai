import { fuzzyScore, searchOps, moveSelection, matchPositions, highlightSegments } from '../www/src/ui/op-search.js';
import { paletteRowHtml } from '../www/src/ui/command-palette.js';
import { allOps } from '../www/src/rpl/ops.js';
import { assert } from './helpers.mjs';

/* Fuzzy op-name search — the matching/ranking core behind the
   command palette (ROADMAP §6).  Pure functions, no DOM. */

{
  assert(fuzzyScore('', 'SIN') === 0, 'fuzzyScore: empty query scores 0');

  assert(fuzzyScore('SIN', 'SIN') === 1000, 'fuzzyScore: exact hit is 1000');
  assert(fuzzyScore('sin', 'SIN') === 1000, 'fuzzyScore: match is case-insensitive');

  assert(fuzzyScore('XYZ', 'SIN') === -1, 'fuzzyScore: non-subsequence is -1');
  assert(fuzzyScore('SX', 'XS') === -1, 'fuzzyScore: order matters (SX not in XS)');

  const prefix = fuzzyScore('SI', 'SIN');
  const scattered = fuzzyScore('SI', 'COSINE');
  assert(prefix > 0, 'fuzzyScore: prefix match is positive');
  assert(scattered > 0, 'fuzzyScore: scattered subsequence still matches');
  assert(prefix > scattered, 'fuzzyScore: prefix outranks scattered match');

  assert(fuzzyScore('A', 'ASIN') > fuzzyScore('A', 'TAN'),
    'fuzzyScore: leading-char match outranks interior match');

  assert(fuzzyScore('SIN', 'SINH') > 0 && fuzzyScore('SIN', 'ARCSIN') > 0,
    'fuzzyScore: SIN is a subsequence of both SINH and ARCSIN');
  assert(fuzzyScore('SIN', 'SINH') > fuzzyScore('SIN', 'ARCSIN'),
    'fuzzyScore: prefix SINH outranks interior ARCSIN');
}

{
  // session340: fuzzyScore's three scoring arms the prefix/scattered pins
  // above don't isolate — the length tie-break, its clamp floor, and the
  // progressive contiguous-run bonus.  Exact-value pins lock the scoring.

  // Length tie-break: an identical leading match scores higher on the
  // shorter name (the `Math.max(0, 10 - n.length)` bonus shrinks with length).
  assert(fuzzyScore('X', 'XZ') === 19, 'fuzzyScore: 2-char name leading match = 19');
  assert(fuzzyScore('X', 'XZZ') === 18, 'fuzzyScore: 3-char name leading match = 18');
  assert(fuzzyScore('X', 'XZ') > fuzzyScore('X', 'XZZ'),
    'fuzzyScore: shorter name wins the length tie-break');

  // Clamp floor: at length >= 10 the length bonus hits 0, so two longer
  // names with the same leading match score equally (and equal the bare
  // anchor score) — guards a refactor that drops the Math.max(0, ...).
  assert(fuzzyScore('X', 'X' + 'Z'.repeat(9)) === 11,
    'fuzzyScore: length-10 name floors the length bonus to 0');
  assert(fuzzyScore('X', 'X' + 'Z'.repeat(13)) === fuzzyScore('X', 'X' + 'Z'.repeat(20)),
    'fuzzyScore: names past length 10 share the clamped (0) length bonus');
  assert(fuzzyScore('X', 'X' + 'Z'.repeat(13)) === 11,
    'fuzzyScore: clamped long-name score is the anchor score alone');

  // Progressive run bonus + reset: with the index-0 anchor neutralized
  // (neither match starts at 0), a tight 3-char run (bonuses 1,3,5) outscores
  // the same chars split by a gap, where the run counter resets at the gap.
  assert(fuzzyScore('BCD', 'ZBCDZ') === 14,
    'fuzzyScore: contiguous interior run accumulates the progressive bonus');
  assert(fuzzyScore('BCD', 'ZBZCD') === 10,
    'fuzzyScore: a gap resets the run counter, costing the packed bonus');
  assert(fuzzyScore('BCD', 'ZBCDZ') > fuzzyScore('BCD', 'ZBZCD'),
    'fuzzyScore: tightly packed match outranks the scattered one (anchor neutralized)');
}

{
  const names = ['SIN', 'SINH', 'ASIN', 'COS', 'COSINE', 'TAN'];

  const all = searchOps('', names);
  assert(all.length === names.length && all[0] === 'SIN',
    'searchOps: empty query returns the full list');
  all.push('MUT');
  assert(names.length === 6, 'searchOps: returned array is a copy, not the input');

  assert(searchOps('   ', names).length === names.length,
    'searchOps: whitespace query returns the full list');

  const r = searchOps('SIN', names);
  assert(r[0] === 'SIN', 'searchOps: exact match ranks first');
  assert(r.includes('SINH') && r.includes('ASIN'),
    'searchOps: subsequence matches are retained');
  assert(!r.includes('TAN'), 'searchOps: non-matches are dropped');

  assert(r.indexOf('SINH') < r.indexOf('ASIN'),
    'searchOps: prefix match outranks interior match');

  const tie = searchOps('XYZZY', ['ZZ', 'AA']);
  assert(tie.length === 0, 'searchOps: no matches yields empty list');

  assert(searchOps('X', null).length === 0, 'searchOps: null names → empty');
}

{
  /* session427: searchOps' equal-score tie-break — the
     `|| (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)` arm of the
     sort comparator (op-search.js ~118) orders names that fuzzyScore
     identically alphabetically, independent of their input order.  Every
     prior searchOps pin feeds names that score DIFFERENTLY (e.g. SINH's
     first-char anchor outranks ASIN's interior match), so the tie-break
     itself was never positively exercised: a refactor dropping it and
     leaning on JS's stable sort would preserve input order on equal
     scores yet pass every prior pin.  'AX'/'BX'/'ZX' all score 9 against
     'X' (probed), so descending input must come back ascending. */
  assert(fuzzyScore('X', 'AX') === fuzzyScore('X', 'BX') &&
         fuzzyScore('X', 'BX') === fuzzyScore('X', 'ZX'),
    'searchOps tie: AX/BX/ZX score identically against X');

  const rev2 = searchOps('X', ['BX', 'AX']);
  assert(rev2.length === 2 && rev2[0] === 'AX' && rev2[1] === 'BX',
    'searchOps tie: equal scores sort alphabetically, not by input order');

  const rev3 = searchOps('X', ['CX', 'BX', 'AX']);
  assert(rev3.join(',') === 'AX,BX,CX',
    'searchOps tie: descending input returns fully re-sorted ascending');

  const mixed = searchOps('X', ['ZX', 'AX', 'MX']);
  assert(mixed.join(',') === 'AX,MX,ZX',
    'searchOps tie: out-of-order equal scores land alphabetically');

  // Higher-scoring anchored match still wins; the tie-break only orders
  // the equal-scoring remainder.  'XA' anchors on the first char (score
  // 19), the two 'X'-tail names tie at 9.
  assert(fuzzyScore('X', 'XA') > fuzzyScore('X', 'AX'),
    'searchOps tie: anchored XA outscores the interior matches');
  assert(searchOps('X', ['BX', 'XA', 'AX']).join(',') === 'XA,AX,BX',
    'searchOps tie: score precedence dominates, alphabetical breaks the tail tie');

  // Equal name and equal score reaches the comparator's `=== 0` arm.
  assert(searchOps('X', ['AX', 'AX']).join(',') === 'AX,AX',
    'searchOps tie: identical names compare equal (comparator 0 arm)');
}

{
  const ops = allOps();
  const hits = searchOps('SIN', ops);
  assert(hits.length > 0, 'searchOps(live): SIN matches at least one op');
  assert(hits.every((name) => fuzzyScore('SIN', name) >= 0),
    'searchOps(live): every hit is a real subsequence match');
  assert(ops.includes('SIN') ? hits[0] === 'SIN' : true,
    'searchOps(live): exact op name ranks first when present');
}

{
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  assert(eq(matchPositions('', 'SIN'), []), 'matchPositions: empty query → []');
  assert(eq(matchPositions('SIN', 'SIN'), [0, 1, 2]), 'matchPositions: exact → all indices');
  assert(eq(matchPositions('sin', 'SIN'), [0, 1, 2]), 'matchPositions: case-insensitive');

  assert(eq(matchPositions('SI', 'COSINE'), [2, 3]), 'matchPositions: interior subsequence');
  assert(eq(matchPositions('AN', 'ARCSIN'), [0, 5]), 'matchPositions: scattered subsequence');

  assert(eq(matchPositions('XYZ', 'SIN'), []), 'matchPositions: non-subsequence → []');
  assert(eq(matchPositions('SX', 'XS'), []), 'matchPositions: order respected → []');

  assert(eq(matchPositions('SS', 'ASIN'), []),
    'matchPositions: too few occurrences → [] (no reuse of one char)');
  assert(eq(matchPositions('S', 'COSINE'), [2]),
    'matchPositions: greedy takes the first occurrence');

  assert(eq(matchPositions('SIN', null), []), 'matchPositions: null name → []');
  assert(eq(matchPositions(null, 'SIN'), []), 'matchPositions: null query → []');

  const idx = matchPositions('AN', 'TANGENT');
  assert(idx.every((v, i) => i === 0 || v > idx[i - 1]),
    'matchPositions: indices are strictly ascending');
}

{
  // session284: highlightSegments — runs the overlay renders from matchPositions
  const segs = (name, q) => highlightSegments(name, matchPositions(q, name));
  const join = (s) => s.map((r) => r.text).join('');
  const eqSeg = (a, b) =>
    a.length === b.length &&
    a.every((r, i) => r.text === b[i].text && r.match === b[i].match);

  assert(highlightSegments('', [0]).length === 0, 'highlightSegments: empty name → []');

  const whole = highlightSegments('SIN', []);
  assert(eqSeg(whole, [{ text: 'SIN', match: false }]),
    'highlightSegments: empty positions → one unmatched run');
  assert(eqSeg(highlightSegments('SIN', null), [{ text: 'SIN', match: false }]),
    'highlightSegments: missing positions → one unmatched run');

  assert(eqSeg(segs('SIN', 'SIN'), [{ text: 'SIN', match: true }]),
    'highlightSegments: exact match → one matched run');

  assert(eqSeg(segs('COSINE', 'SI'), [
    { text: 'CO', match: false },
    { text: 'SI', match: true },
    { text: 'NE', match: false },
  ]), 'highlightSegments: contiguous interior match merges into one run');

  assert(eqSeg(segs('ARCSIN', 'AN'), [
    { text: 'A', match: true },
    { text: 'RCSI', match: false },
    { text: 'N', match: true },
  ]), 'highlightSegments: scattered matches split by an unmatched gap');

  const ascii = segs('TANGENT', 'AN');
  assert(join(ascii) === 'TANGENT', 'highlightSegments: text reconstructs the name');
  assert(ascii.every((r, i) => i === 0 || r.match !== ascii[i - 1].match),
    'highlightSegments: adjacent runs alternate match flag');

  assert(eqSeg(highlightSegments('SIN', [99, -1, NaN]),
    [{ text: 'SIN', match: false }]),
    'highlightSegments: out-of-range/non-finite positions ignored');

  // session409: positions are normalized through a Set + a 0..n scan and each
  // coerced via Math.trunc(Number(p)), so the render is independent of input
  // order, deduplicated, and tolerant of fractional / numeric-string positions.
  // session284 pins only ascending matchPositions output and the reject arms;
  // a refactor assuming sorted/unique/integer input would pass those yet break
  // an overlay that passes positions in any of these shapes.
  const split = [
    { text: 'S', match: true },
    { text: 'I', match: false },
    { text: 'N', match: true },
  ];
  assert(eqSeg(highlightSegments('SIN', [2, 0]), split),
    'highlightSegments: unsorted positions render the same as sorted');
  assert(eqSeg(highlightSegments('SIN', [0, 2]),
    highlightSegments('SIN', [2, 0])),
    'highlightSegments: order-independent (Set + 0..n scan)');
  assert(eqSeg(highlightSegments('SIN', [1, 1, 1]),
    [{ text: 'S', match: false }, { text: 'I', match: true }, { text: 'N', match: false }]),
    'highlightSegments: duplicate positions collapse to one mark');
  assert(eqSeg(highlightSegments('SIN', [1.9]),
    highlightSegments('SIN', [1])),
    'highlightSegments: fractional position truncates (1.9 → 1), not rounds');
  assert(eqSeg(highlightSegments('SIN', ['1']),
    highlightSegments('SIN', [1])),
    'highlightSegments: numeric-string position coerced through Number');
  assert(eqSeg(highlightSegments('TAN', [3, 0, 99]),
    [{ text: 'T', match: true }, { text: 'AN', match: false }]),
    'highlightSegments: valid positions kept when mixed with out-of-range');
}

{
  assert(moveSelection(0, 1, 0) === -1, 'moveSelection: empty list → -1');
  assert(moveSelection(-1, -1, 0) === -1, 'moveSelection: empty list ignores delta');

  assert(moveSelection(0, 1, 5) === 1, 'moveSelection: down advances one');
  assert(moveSelection(2, -1, 5) === 1, 'moveSelection: up retreats one');
  assert(moveSelection(2, 0, 5) === 2, 'moveSelection: zero delta stays put');

  assert(moveSelection(4, 1, 5) === 0, 'moveSelection: down past bottom wraps to first');
  assert(moveSelection(0, -1, 5) === 4, 'moveSelection: up past top wraps to last');

  assert(moveSelection(-1, 1, 5) === 0, 'moveSelection: sentinel + down → first');
  assert(moveSelection(-1, -1, 5) === 4, 'moveSelection: sentinel + up → last');

  assert(moveSelection(1, 3, 5) === 4, 'moveSelection: multi-step down in range');
  assert(moveSelection(1, 7, 5) === 3, 'moveSelection: multi-step down wraps modulo');
  assert(moveSelection(1, -3, 5) === 3, 'moveSelection: multi-step up wraps modulo');

  assert(moveSelection(0, 1, 1) === 0, 'moveSelection: single row stays at 0');
  assert(moveSelection(-1, -1, 1) === 0, 'moveSelection: single row from sentinel');

  assert(moveSelection(NaN, 1, 5) === 0, 'moveSelection: NaN index → sentinel then first');
  assert(moveSelection(0, NaN, 5) === 0, 'moveSelection: NaN delta is no-op');
  assert(moveSelection(0, 1, NaN) === -1, 'moveSelection: NaN length → -1');
}

{
  assert(paletteRowHtml('SIN', '') === 'SIN',
    'paletteRowHtml: empty query is unhighlighted');
  assert(paletteRowHtml('SIN', 'SIN') === '<mark>SIN</mark>',
    'paletteRowHtml: exact match is one mark');
  assert(paletteRowHtml('COSINE', 'SI') === 'CO<mark>SI</mark>NE',
    'paletteRowHtml: interior run');
  assert(paletteRowHtml('A<B', 'A') === '<mark>A</mark>&lt;B',
    'paletteRowHtml: escapes unmatched HTML');
}
