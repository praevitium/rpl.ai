const EXACT = 1000;

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

// The same greedy walk as fuzzyScore, so a highlight lines up with what was scored.
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

// A negative index means nothing is selected yet: down lands on the first row, up on the last.
export function moveSelection(index, delta, length) {
  const n = Math.trunc(Number(length));
  if (!Number.isFinite(n) || n <= 0) return -1;
  const d = Math.trunc(Number(delta)) || 0;
  let i = Math.trunc(Number(index));
  if (!Number.isFinite(i)) i = -1;
  if (i < 0) i = d >= 0 ? -1 : 0;
  return ((i + d) % n + n) % n;
}
