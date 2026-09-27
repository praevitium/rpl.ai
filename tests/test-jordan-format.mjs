import { eigenTag, jordanChain, charSpaceList, eigenvalueArray, spacesFromJordan } from '../www/src/rpl/jordan-format.js';
import { format } from '../www/src/rpl/formatter.js';
import { Integer, Vector, Real, Rational, Complex, isList, isVector, isTagged } from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

/* JORDAN level-2 / level-1 output shaping (HP50 AUR §3-122).  Pure,
   CAS-independent builders.  spacesFromJordan turns a transition
   matrix and a Jordan form into chains; the other builders wrap those
   chains into the tagged-space list and the eigenvalue array. */

const vec = (...ns) => Vector(ns.map((n) => Integer(n)));

{
  const v = vec(1, 1);
  const t = eigenTag(v);
  assert(isTagged(t), 'eigenTag: returns a Tagged');
  assert(t.tag === 'Eigen', 'eigenTag: tag is "Eigen" (renders "Eigen:")');
  assert(t.value === v, 'eigenTag: wraps the eigenvector unchanged');
}

{
  const v = vec(1, 0);
  const c1 = jordanChain([v]);
  assert(isList(c1), 'jordanChain: returns a List');
  assert(c1.items.length === 1, 'jordanChain: length-1 chain has one entry');
  assert(isTagged(c1.items[0]) && c1.items[0].tag === 'Eigen',
    'jordanChain: the sole entry is the Eigen-tagged eigenvector');

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

  const numTagged = charSpaceList([{ tag: 3, space: vec(1, 0) }]);
  assert(numTagged.items[0].tag === '3', 'charSpaceList: numeric tag coerced to string');

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

{
  const built = spacesFromJordan(
    [[Integer(1), Integer(-1)], [Integer(1), Integer(1)]],
    [[Integer(2), Integer(0)], [Integer(0), Integer(0)]],
  );
  assert(built.spaces.length === 2, 'spacesFromJordan: one space per 1×1 block');
  assert(built.spaces.every(entry => isVector(entry.space)),
    'spacesFromJordan: a single eigenvector stays a vector');
  assert(built.spaces[0].tag === '2' && built.spaces[1].tag === '0',
    'spacesFromJordan: tags are the eigenvalues');
  assert(built.values.length === 2, 'spacesFromJordan: one eigenvalue per 1×1 block');

  const block = spacesFromJordan(
    [[Integer(1), Integer(0)], [Integer(0), Integer(1)]],
    [[Integer(0), Integer(1)], [Integer(0), Integer(0)]],
  );
  assert(block.spaces.length === 1 && block.spaces[0].tag === '0',
    'spacesFromJordan: one space for a Jordan block');
  assert(isList(block.spaces[0].space), 'spacesFromJordan: a longer block is a chain');
  const chain = block.spaces[0].space;
  assert(isVector(chain.items[0]) && !isTagged(chain.items[0]),
    'spacesFromJordan: generalized eigenvector stays bare');
  assert(isTagged(chain.items[1]) && chain.items[1].tag === 'Eigen',
    'spacesFromJordan: chain ends on the eigenvector');
  assert(block.values.length === 2 && block.values.every(v => v === block.values[0]),
    'spacesFromJordan: algebraic multiplicity repeats the eigenvalue');

  const split = spacesFromJordan(
    [[Integer(1), Integer(0)], [Integer(0), Integer(1)]],
    [[Integer(2), Integer(0)], [Integer(0), Integer(2)]],
  );
  assert(split.spaces.length === 1 && isList(split.spaces[0].space)
    && split.spaces[0].space.items.length === 2,
    'spacesFromJordan: equal eigenvalues with no coupling are two chains');
  assert(split.values.length === 2, 'spacesFromJordan: repeated eigenvalue keeps both copies');

  const tagged = spacesFromJordan(
    [[Real(2), Real(0)], [Real(0), Real(1)]],
    [[Real(3), Real(0)], [Real(0), Real(0)]],
  );
  assert(tagged.spaces[0].tag === '3' && tagged.spaces[1].tag === '0',
    'spacesFromJordan: integral reals tag as integers');

  assert(spacesFromJordan([[Integer(1)]], [[Integer(1), Integer(0)]]) === null,
    'spacesFromJordan: ragged Jordan form is rejected');

  const ratio = spacesFromJordan(
    [[Rational(1n, 1n)]],
    [[Rational(1n, 2n)]],
  );
  assert(ratio.spaces[0].tag === format(Rational(1n, 2n)),
    'spacesFromJordan: rational eigenvalue uses its display form');
  const imag = spacesFromJordan(
    [[Complex(1, 0)]],
    [[Complex(0, 1)]],
  );
  assert(imag.spaces[0].tag === format(Complex(0, 1)),
    'spacesFromJordan: complex eigenvalue uses its display form');
  assert(spacesFromJordan([[{ type: 'nope' }]], [[{ type: 'nope' }]]) === null,
    'spacesFromJordan: an unprintable eigenvalue is rejected');
}
