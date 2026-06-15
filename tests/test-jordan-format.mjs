import { eigenTag, jordanChain, charSpaceList, eigenvalueArray } from '../www/src/rpl/jordan-format.js';
import { Integer, Vector, isList, isVector, isTagged } from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

/* JORDAN level-2 / level-1 output shaping (HP50 AUR §3-122).  Pure,
   CAS-independent builders — the eigendata comes from Giac at the op
   layer; these assemble the tagged-space List the AUR mandates. */

const vec = (...ns) => Vector(ns.map((n) => Integer(n)));

/* ================================================================
   eigenTag — the "Eigen:"-tagged eigenvector terminal.
   ================================================================ */
{
  const v = vec(1, 1);
  const t = eigenTag(v);
  assert(isTagged(t), 'eigenTag: returns a Tagged');
  assert(t.tag === 'Eigen', 'eigenTag: tag is "Eigen" (renders "Eigen:")');
  assert(t.value === v, 'eigenTag: wraps the eigenvector unchanged');
}

/* ================================================================
   jordanChain — a Jordan chain ending in an Eigen:-tagged eigenvector.
   ================================================================ */
{
  // A length-1 chain is just the Eigen-tagged eigenvector.
  const v = vec(1, 0);
  const c1 = jordanChain([v]);
  assert(isList(c1), 'jordanChain: returns a List');
  assert(c1.items.length === 1, 'jordanChain: length-1 chain has one entry');
  assert(isTagged(c1.items[0]) && c1.items[0].tag === 'Eigen',
    'jordanChain: the sole entry is the Eigen-tagged eigenvector');

  // A longer chain Eigen-tags only the terminal vector; leads stay bare.
  const g = vec(0, 1);
  const e = vec(1, 0);
  const c2 = jordanChain([g, e]);
  assert(c2.items.length === 2, 'jordanChain: keeps every generalized vector');
  assert(c2.items[0] === g && !isTagged(c2.items[0]),
    'jordanChain: leading generalized eigenvector stays bare');
  assert(isTagged(c2.items[1]) && c2.items[1].tag === 'Eigen' && c2.items[1].value === e,
    'jordanChain: terminal eigenvector is Eigen-tagged');

  assertThrows(() => jordanChain([]), /chain must hold/,
    'jordanChain: empty chain rejected');
}

/* ================================================================
   charSpaceList — the level-2 List of eigenvalue-tagged spaces.
   AUR example: JORDAN([[1,1],[1,1]]) level 2 = { 0: [1,-1]  2: [1,1] }.
   ================================================================ */
{
  const s0 = vec(1, -1);
  const s2 = vec(1, 1);
  const lvl2 = charSpaceList([
    { tag: '0', space: s0 },
    { tag: '2', space: s2 },
  ]);
  assert(isList(lvl2), 'charSpaceList: level 2 is a List');
  assert(lvl2.items.length === 2, 'charSpaceList: one entry per eigenvalue');
  assert(lvl2.items.every(isTagged), 'charSpaceList: every entry is Tagged');
  assert(lvl2.items[0].tag === '0' && lvl2.items[0].value === s0,
    'charSpaceList: first space tagged by eigenvalue 0');
  assert(lvl2.items[1].tag === '2' && lvl2.items[1].value === s2,
    'charSpaceList: second space tagged by eigenvalue 2');

  // Tags coerce to strings so a numeric eigenvalue label is accepted.
  const numTagged = charSpaceList([{ tag: 3, space: vec(1, 0) }]);
  assert(numTagged.items[0].tag === '3', 'charSpaceList: numeric tag coerced to string');

  // A defective eigenvalue carries a list of Jordan chains as its space.
  const chains = charSpaceList([{ tag: '5', space: jordanChain([vec(0, 1), vec(1, 0)]) }]);
  assert(isList(chains.items[0].value), 'charSpaceList: defective space is a (chain) List');
}

/* ================================================================
   eigenvalueArray — level-1 array of eigenvalues with multiplicities.
   AUR example: JORDAN([[1,1],[1,1]]) level 1 = [0,2].
   ================================================================ */
{
  const lvl1 = eigenvalueArray([Integer(0), Integer(2)]);
  assert(isVector(lvl1), 'eigenvalueArray: level 1 is a Vector (array)');
  assert(lvl1.items.length === 2, 'eigenvalueArray: one slot per eigenvalue');

  // Multiplicity > 1 repeats the eigenvalue (AUR "with multiplicities").
  const repeated = eigenvalueArray([Integer(2), Integer(2), Integer(2)]);
  assert(repeated.items.length === 3, 'eigenvalueArray: repeats by multiplicity');
}
