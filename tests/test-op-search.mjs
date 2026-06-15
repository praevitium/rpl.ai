import { fuzzyScore, searchOps, moveSelection, matchPositions, highlightSegments } from '../www/src/ui/op-search.js';
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
