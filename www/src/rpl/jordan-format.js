import { RList, Vector, Tagged } from './types.js';

/* JORDAN output shaping (HP50 AUR §3-122).  Pure, CAS-independent
   builders for the command's level-2 result — the eigendata itself
   (eigenvalues, multiplicities, characteristic spaces, Jordan chains)
   comes from Giac at the op layer; this module only assembles the
   tagged-space List the AUR mandates.

   Level 2 is "a list of characteristic spaces tagged by the
   corresponding eigenvalue (either a vector or a list of Jordan chains,
   each of them ending with an 'Eigen:'-tagged eigenvector)".  The AUR
   worked example `JORDAN([[1,1],[1,1]])` returns the level-2 List
   `{ 0: [1,-1]  2: [1,1] }` — an RList of Tagged vectors. */

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
