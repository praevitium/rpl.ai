/* =================================================================
   Fuzzy op-name search — the matching/ranking core behind the
   command palette (ROADMAP §6).  Pure functions over the op-name
   list `allOps()` returns; no DOM.  `/<name>` opens the palette and
   each keystroke calls `searchOps` to filter + rank the registry.

   Split out of the (still-to-build) overlay so the scoring can be
   unit tested without a render surface — same pattern as paging.js.
   ================================================================= */

const EXACT = 1000;

/** Score a single op `name` against `query`.

 *  Returns a non-negative score when every query character appears in
 *  `name` in order (a subsequence match), or -1 when it doesn't.  A
 *  higher score is a better match.  Matching is case-insensitive.
 *
 *  Bonuses, strongest first: an exact hit short-circuits to EXACT; a
 *  match on the first character anchors the name; each character that
 *  continues a contiguous run scores progressively more, so tightly
 *  packed matches outrank scattered ones; shorter names break ties by
 *  a small length bonus. */
export function fuzzyScore(query, name) {
  const q = String(query).toUpperCase();
  const n = String(name).toUpperCase();
  if (q === '') return 0;
  if (q === n) return EXACT;

  let score = 0;
  let qi = 0;
  let prevIdx = -1;
  let run = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] !== q[qi]) continue;
    let bonus = 1;
    if (i === 0) bonus += 8;
    if (prevIdx === i - 1) { run += 1; bonus += run * 2; }
    else run = 0;
    score += bonus;
    prevIdx = i;
    qi += 1;
  }
  if (qi < q.length) return -1;
  score += Math.max(0, 10 - n.length);
  return score;
}

/** The indices in `name` of the characters that `query` matches, using
 *  the same greedy left-to-right subsequence walk as `fuzzyScore`, so a
 *  highlight built from these positions lines up with what the score
 *  rewarded.  Returns ascending indices into the original `name` (one
 *  per query character), or `[]` when `query` is empty or not a
 *  subsequence.  Matching is case-insensitive. */
export function matchPositions(query, name) {
  const q = String(query == null ? '' : query).toUpperCase();
  const n = String(name == null ? '' : name);
  if (q === '') return [];

  const hits = [];
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i].toUpperCase() !== q[qi]) continue;
    hits.push(i);
    qi += 1;
  }
  return qi < q.length ? [] : hits;
}

/** Split `name` into consecutive matched/unmatched runs for the
 *  overlay to render, given the matched-character `positions` from
 *  `matchPositions`.  Returns an array of `{ text, match }` segments
 *  whose `text` concatenates back to `name`, with adjacent matched
 *  indices merged into one `match: true` run and the gaps emitted as
 *  `match: false` runs.  An empty `name` yields `[]`; an empty or
 *  missing `positions` yields a single unmatched run of the whole name.
 *  Out-of-range or non-finite positions are ignored. */
export function highlightSegments(name, positions) {
  const n = String(name == null ? '' : name);
  if (n === '') return [];

  const marked = new Set();
  if (Array.isArray(positions)) {
    for (const p of positions) {
      const i = Math.trunc(Number(p));
      if (Number.isFinite(i) && i >= 0 && i < n.length) marked.add(i);
    }
  }

  const segments = [];
  let start = 0;
  let cur = marked.has(0);
  for (let i = 1; i <= n.length; i++) {
    const m = i < n.length && marked.has(i);
    if (i === n.length || m !== cur) {
      segments.push({ text: n.slice(start, i), match: cur });
      start = i;
      cur = m;
    }
  }
  return segments;
}

/** Filter + rank `names` against `query`.  An empty/whitespace query
 *  returns a copy of `names` unchanged (the palette's resting view).
 *  Otherwise only subsequence matches survive, sorted by descending
 *  score with an alphabetical tie-break so the order is stable. */
export function searchOps(query, names) {
  const list = Array.isArray(names) ? names : [];
  const q = String(query == null ? '' : query).trim();
  if (q === '') return [...list];

  const scored = [];
  for (const name of list) {
    const s = fuzzyScore(q, name);
    if (s >= 0) scored.push({ name, score: s });
  }
  scored.sort((a, b) =>
    b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return scored.map((e) => e.name);
}

/** Move the palette's highlighted index by `delta` over a result list
 *  of `length` rows, wrapping at both ends (ArrowDown past the bottom
 *  lands on the first row; ArrowUp past the top lands on the last).
 *  An empty list has no selection, so the result is -1.  A negative
 *  `index` is the "nothing selected yet" sentinel: the first ArrowDown
 *  snaps to the first row and the first ArrowUp to the last. */
export function moveSelection(index, delta, length) {
  const n = Math.trunc(Number(length));
  if (!Number.isFinite(n) || n <= 0) return -1;
  const d = Math.trunc(Number(delta)) || 0;
  let i = Math.trunc(Number(index));
  if (!Number.isFinite(i)) i = -1;
  if (i < 0) i = d >= 0 ? -1 : 0;
  return ((i + d) % n + n) % n;
}
