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
