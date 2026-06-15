import { fuzzyScore, searchOps, moveSelection } from '../www/src/ui/op-search.js';
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
