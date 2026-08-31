import { assert, assertThrows } from './helpers.mjs';
import {
  emptyGrid, identityGrid, zerosGrid, clampDim, resizeGrid,
  parseMatrixCell, gridToMatrix, gridToValue, valueToGrid, MATRIX_MAX,
} from '../www/src/ui/matrix-editor.js';
import {
  Matrix, Vector, Real, Integer, isMatrix, isInteger, isReal, isVector,
} from '../www/src/rpl/types.js';

{
  assert(clampDim(0) === 1, 'clampDim: floor 1');
  assert(clampDim(MATRIX_MAX + 9) === MATRIX_MAX, 'clampDim: cap');
  assert(clampDim(3.9) === 3, 'clampDim: floor');
}

{
  const g = emptyGrid(2, 3);
  assert(g.length === 2 && g[0].length === 3 && g[0][0] === '',
    'emptyGrid: 2x3 blanks');
  const i = identityGrid(2);
  assert(i[0][0] === '1' && i[0][1] === '0' && i[1][1] === '1',
    'identityGrid: I2');
  const z = zerosGrid(1, 2);
  assert(z[0][0] === '0' && z[0][1] === '0', 'zerosGrid');
}

{
  const grown = resizeGrid([['1']], 2, 2);
  assert(grown[0][0] === '1' && grown[1][1] === '', 'resizeGrid: grow pads');
  const shrunk = resizeGrid([['a', 'b'], ['c', 'd']], 1, 1);
  assert(shrunk.length === 1 && shrunk[0][0] === 'a', 'resizeGrid: shrink keeps origin');
}

{
  assert(isInteger(parseMatrixCell('4')), 'parseMatrixCell: integer');
  const z = parseMatrixCell('');
  assert(isReal(z) && z.value.toNumber() === 0, 'parseMatrixCell: empty → Real(0)');
  assertThrows(() => parseMatrixCell('1 2'), /expected one value/,
    'parseMatrixCell: two tokens rejected');
}

{
  const m = gridToMatrix([['1', '0'], ['0', '1']]);
  assert(isMatrix(m) && m.rows.length === 2, 'gridToMatrix: 2x2');
  assert(Number(m.rows[0][0].value) === 1 || m.rows[0][0].value.toNumber?.() === 1,
    'gridToMatrix: (1,1) is 1');
  assertThrows(() => gridToMatrix([['nope']]), /r1c1/, 'gridToMatrix: bad cell names slot');
}

{
  const src = Matrix([[Integer(1), Integer(2)], [Integer(3), Integer(4)]]);
  const g = valueToGrid(src);
  assert(g[0][0] === '1' && g[1][1] === '4', 'valueToGrid: matrix');
  const v = valueToGrid(Vector([Integer(9), Integer(8)]));
  assert(v.length === 1 && v[0][1] === '8', 'valueToGrid: vector is a row');
  assert(valueToGrid(Integer(5))[0][0] === '5', 'valueToGrid: scalar 1x1');
}

{
  const row = [['1', '2', '3']];
  const vec = gridToValue(row, { asVector: true });
  assert(isVector(vec) && vec.items.length === 3, 'gridToValue: 1-row + asVector → Vector');
  assert(Number(vec.items[1].value) === 2 || vec.items[1].value.toNumber?.() === 2,
    'gridToValue: vector mid element');
  const mat = gridToValue(row, { asVector: false });
  assert(isMatrix(mat) && mat.rows.length === 1 && mat.rows[0].length === 3,
    'gridToValue: 1-row without flag stays Matrix');
  const grown = gridToValue([['1', '2'], ['3', '4']], { asVector: true });
  assert(isMatrix(grown) && grown.rows.length === 2,
    'gridToValue: asVector ignored once there is a second row');
}
