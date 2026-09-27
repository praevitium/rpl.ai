import { giac } from '../www/src/rpl/cas/giac-engine.mjs';
import { lookup } from '../www/src/rpl/ops.js';
import { Stack } from '../www/src/rpl/stack.js';
import { setCasVx, resetCasVx } from '../www/src/rpl/state.js';
import { Integer, Matrix, isList, isVector, isSymbolic, isTagged, isReal } from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

function square(rows) {
  return Matrix(rows.map(row => row.map(n => Integer(n))));
}

function num(v) {
  return isReal(v) ? v.value.toNumber() : Number(v.value);
}

function runJordan(rows, fixtures) {
  setCasVx('x');
  giac._clear();
  giac._setFixtures(fixtures);
  const s = new Stack();
  s.push(square(rows));
  lookup('JORDAN').fn(s);
  return s;
}

function done() {
  giac._clear();
  resetCasVx();
}

{
  const s = runJordan([[1n, 1n], [1n, 1n]], {
    'pmin([[1,1],[1,1]],x)': 'x^2-2*x',
    'charpoly([[1,1],[1,1]],x)': 'x^2-2*x',
    'jordan([[1,1],[1,1]])': '[[-1,1],[1,1]],[[0,0],[0,2]]',
  });
  assert(s.depth === 4, 'JORDAN: four results');
  const evals = s.peek(1);
  const spaces = s.peek(2);
  assert(isVector(evals) && evals.items.map(num).join(',') === '0,2',
    'JORDAN: eigenvalues follow the Jordan blocks');
  assert(isList(spaces) && spaces.items.length === 2, 'JORDAN: one tagged space per eigenvalue');
  assert(spaces.items[0].tag === '0' && spaces.items[1].tag === '2',
    'JORDAN: spaces tagged by 0 then 2');
  assert(isVector(spaces.items[0].value) && spaces.items[0].value.items.map(num).join(',') === '-1,1',
    'JORDAN: eigenvalue 0 keeps its eigenvector');
  assert(isVector(spaces.items[1].value) && spaces.items[1].value.items.map(num).join(',') === '1,1',
    'JORDAN: eigenvalue 2 keeps its eigenvector');
  assert(isSymbolic(s.peek(3)) && isSymbolic(s.peek(4)), 'JORDAN: charpoly and minpoly are symbolic');
  done();
}

{
  const s = runJordan([[0n, 1n], [0n, 0n]], {
    'pmin([[0,1],[0,0]],x)': 'x^2',
    'charpoly([[0,1],[0,0]],x)': 'x^2',
    'jordan([[0,1],[0,0]])': '[[1,0],[0,1]],[[0,1],[0,0]]',
  });
  const evals = s.peek(1);
  const spaces = s.peek(2);
  assert(evals.items.map(num).join(',') === '0,0',
    'JORDAN: defective block repeats the eigenvalue');
  assert(spaces.items.length === 1 && spaces.items[0].tag === '0',
    'JORDAN: defective block is one tagged space');
  const chain = spaces.items[0].value;
  assert(isList(chain) && chain.items.length === 2, 'JORDAN: defective space is a chain');
  assert(isVector(chain.items[0]) && !isTagged(chain.items[0])
    && chain.items[0].items.map(num).join(',') === '0,1',
    'JORDAN: generalized eigenvector stays bare');
  assert(isTagged(chain.items[1]) && chain.items[1].tag === 'Eigen'
    && chain.items[1].value.items.map(num).join(',') === '1,0',
    'JORDAN: chain ends on the Eigen-tagged eigenvector');
  done();
}

{
  const s = runJordan([[2n, 0n], [0n, 2n]], {
    'pmin([[2,0],[0,2]],x)': 'x-2',
    'charpoly([[2,0],[0,2]],x)': 'x^2-4*x+4',
    'jordan([[2,0],[0,2]])': '[[1,0],[0,1]],[[2,0],[0,2]]',
  });
  const spaces = s.peek(2);
  const evals = s.peek(1);
  assert(evals.items.map(num).join(',') === '2,2',
    'JORDAN: a repeated eigenvalue keeps both copies');
  assert(spaces.items.length === 1 && isList(spaces.items[0].value)
    && spaces.items[0].value.items.length === 2,
    'JORDAN: two uncoupled eigenvectors are two chains');
  assert(spaces.items[0].value.items.every(item => isList(item) && isTagged(item.items[0]) && item.items[0].tag === 'Eigen'),
    'JORDAN: each length-1 chain is an Eigen-tagged vector');
  done();
}

{
  const s = runJordan([[0n, 1n, 0n], [0n, 0n, 1n], [0n, 0n, 0n]], {
    'pmin([[0,1,0],[0,0,1],[0,0,0]],x)': 'x^3',
    'charpoly([[0,1,0],[0,0,1],[0,0,0]],x)': 'x^3',
    'jordan([[0,1,0],[0,0,1],[0,0,0]])': '[[1,0,0],[0,1,0],[0,0,1]],[[0,1,0],[0,0,1],[0,0,0]]',
  });
  const chain = s.peek(2).items[0].value;
  assert(s.peek(1).items.length === 3, 'JORDAN: a length-3 block repeats the eigenvalue three times');
  assert(isList(chain) && chain.items.length === 3, 'JORDAN: a length-3 block is one chain');
  assert(chain.items[0].items.map(num).join(',') === '0,0,1',
    'JORDAN: the top generalized vector leads the chain');
  assert(isTagged(chain.items[2]) && chain.items[2].value.items.map(num).join(',') === '1,0,0',
    'JORDAN: the length-3 chain ends on the eigenvector');
  done();
}

{
  setCasVx('x');
  giac._clear();
  giac._setFixtures({
    'pmin([[1,0],[0,1]],x)': 'x-1',
    'charpoly([[1,0],[0,1]],x)': '(x-1)^2',
    'jordan([[1,0],[0,1]])': 'not a jordan pair',
  });
  const s = new Stack();
  s.push(square([[1n, 0n], [0n, 1n]]));
  assertThrows(() => lookup('JORDAN').fn(s), /Bad argument value/,
    'JORDAN: a non-pair from jordan is rejected');
  done();
}
