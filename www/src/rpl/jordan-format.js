import { RList, Vector, Tagged, Integer, isReal, isInteger, isRational } from './types.js';
import { format } from './formatter.js';

/* JORDAN output (HP50 AUR §3-122): level 2 lists the characteristic
   spaces tagged by eigenvalue, each a vector or a list of Jordan chains
   ending in an `Eigen:`-tagged eigenvector, e.g. { 0: [1,-1]  2: [1,1] }. */

function numericValue(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v)) return v.value.toNumber();
  if (isRational(v)) return Number(v.n) / Number(v.d);
  return NaN;
}

function eigenvalueTag(v) {
  const shown = isReal(v) && v.value.isInteger()
    ? format(Integer(v.value.toFixed(0)))
    : format(v);
  if (!shown || shown.startsWith('‹')) return null;
  return shown;
}

export function eigenTag(eigenvector) {
  return Tagged('Eigen', eigenvector);
}

export function jordanChain(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw new Error('jordanChain: chain must hold at least the eigenvector');
  }
  const lead = vectors.slice(0, -1);
  return RList([...lead, eigenTag(vectors[vectors.length - 1])]);
}

export function charSpaceList(entries) {
  return RList(entries.map(({ tag, space }) => Tagged(String(tag), space)));
}

export function eigenvalueArray(values) {
  return Vector(values);
}

function columnVector(rows, index) {
  return Vector(rows.map(row => row[index]));
}

export function spacesFromJordan(pRows, jRows) {
  if (!Array.isArray(pRows) || !Array.isArray(jRows) || jRows.length === 0) return null;
  const n = jRows.length;
  if (pRows.length !== n) return null;
  if (pRows.some(row => !row || row.length !== n)) return null;
  if (jRows.some(row => !row || row.length !== n)) return null;

  const groups = [];
  let col = 0;
  while (col < n) {
    const tag = eigenvalueTag(jRows[col][col]);
    if (!tag) return null;
    let end = col;
    while (
      end + 1 < n
      && eigenvalueTag(jRows[end + 1][end + 1]) === tag
      && numericValue(jRows[end][end + 1]) === 1
    ) {
      end++;
    }
    const chain = [];
    for (let c = end; c >= col; c--) chain.push(columnVector(pRows, c));
    let group = groups.find(g => g.tag === tag);
    if (!group) {
      group = { tag, lambda: jRows[col][col], chains: [] };
      groups.push(group);
    }
    group.chains.push(chain);
    col = end + 1;
  }

  return {
    spaces: groups.map(g => ({
      tag: g.tag,
      space: g.chains.length === 1
        ? (g.chains[0].length === 1 ? g.chains[0][0] : jordanChain(g.chains[0]))
        : RList(g.chains.map(jordanChain)),
    })),
    values: groups.flatMap(g => g.chains.flatMap(chain => chain.map(() => g.lambda))),
  };
}
