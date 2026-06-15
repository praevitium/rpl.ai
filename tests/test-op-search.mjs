import { fuzzyScore, searchOps } from '../www/src/ui/op-search.js';
import { allOps } from '../www/src/rpl/ops.js';
import { assert } from './helpers.mjs';

/* Fuzzy op-name search — the matching/ranking core behind the
   command palette (ROADMAP §6).  Pure functions, no DOM. */

/* ================================================================
   fuzzyScore — subsequence match + ranking signal.
   ================================================================ */
{
  // Empty query is a neutral match (the palette's resting view).
  assert(fuzzyScore('', 'SIN') === 0, 'fuzzyScore: empty query scores 0');

  // Exact match short-circuits to the top score.
  assert(fuzzyScore('SIN', 'SIN') === 1000, 'fuzzyScore: exact hit is 1000');
  assert(fuzzyScore('sin', 'SIN') === 1000, 'fuzzyScore: match is case-insensitive');

  // Non-subsequence is rejected.
  assert(fuzzyScore('XYZ', 'SIN') === -1, 'fuzzyScore: non-subsequence is -1');
  assert(fuzzyScore('SX', 'XS') === -1, 'fuzzyScore: order matters (SX not in XS)');

  // A scattered subsequence still matches but scores below a prefix.
  const prefix = fuzzyScore('SI', 'SIN');     // S,I contiguous at start
  const scattered = fuzzyScore('SI', 'COSINE'); // S@2, I@3 — mid-name
  assert(prefix > 0, 'fuzzyScore: prefix match is positive');
  assert(scattered > 0, 'fuzzyScore: scattered subsequence still matches');
  assert(prefix > scattered, 'fuzzyScore: prefix outranks scattered match');

  // A first-character anchor beats a later same-length run.
  assert(fuzzyScore('A', 'ASIN') > fuzzyScore('A', 'TAN'),
    'fuzzyScore: leading-char match outranks interior match');

  // Tighter (shorter) names get the length tie-break.
  assert(fuzzyScore('SIN', 'SINH') > 0 && fuzzyScore('SIN', 'ARCSIN') > 0,
    'fuzzyScore: SIN is a subsequence of both SINH and ARCSIN');
  assert(fuzzyScore('SIN', 'SINH') > fuzzyScore('SIN', 'ARCSIN'),
    'fuzzyScore: prefix SINH outranks interior ARCSIN');
}

/* ================================================================
   searchOps — filter + rank a name list.
   ================================================================ */
{
  const names = ['SIN', 'SINH', 'ASIN', 'COS', 'COSINE', 'TAN'];

  // Empty query returns a copy of the list, unchanged and detached.
  const all = searchOps('', names);
  assert(all.length === names.length && all[0] === 'SIN',
    'searchOps: empty query returns the full list');
  all.push('MUT');
  assert(names.length === 6, 'searchOps: returned array is a copy, not the input');

  // Whitespace-only query is treated as empty.
  assert(searchOps('   ', names).length === names.length,
    'searchOps: whitespace query returns the full list');

  // Exact match ranks first.
  const r = searchOps('SIN', names);
  assert(r[0] === 'SIN', 'searchOps: exact match ranks first');
  assert(r.includes('SINH') && r.includes('ASIN'),
    'searchOps: subsequence matches are retained');
  assert(!r.includes('TAN'), 'searchOps: non-matches are dropped');

  // SINH (prefix) outranks ASIN (interior) for the same query.
  assert(r.indexOf('SINH') < r.indexOf('ASIN'),
    'searchOps: prefix match outranks interior match');

  // Equal-score ties break alphabetically (deterministic order).
  const tie = searchOps('XYZZY', ['ZZ', 'AA']);
  assert(tie.length === 0, 'searchOps: no matches yields empty list');

  // Non-array input is tolerated.
  assert(searchOps('X', null).length === 0, 'searchOps: null names → empty');
}

/* ================================================================
   Integration against the live registry — every result is a real,
   subsequence-matching op name, and the query itself round-trips.
   ================================================================ */
{
  const ops = allOps();
  const hits = searchOps('SIN', ops);
  assert(hits.length > 0, 'searchOps(live): SIN matches at least one op');
  assert(hits.every((name) => fuzzyScore('SIN', name) >= 0),
    'searchOps(live): every hit is a real subsequence match');
  assert(ops.includes('SIN') ? hits[0] === 'SIN' : true,
    'searchOps(live): exact op name ranks first when present');
}
