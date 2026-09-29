import { assert, assertThrows } from './helpers.mjs';
import {
  emptyGrid, identityGrid, zerosGrid, clampDim, resizeGrid,
  parseMatrixCell, gridToMatrix, gridToValue, valueToGrid, pasteIntoGrid,
  insertRow, deleteRow, insertCol, deleteCol, transposeGrid, MATRIX_MAX, toggleCellSign, mapCaret,
} from '../www/src/ui/matrix-editor.js';
import {
  Matrix, Vector, Real, Integer, RList, isMatrix, isInteger, isReal, isVector, isSymbolic,
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
  const rect = identityGrid(2, 3);
  assert(rect.length === 2 && rect[0].length === 3,
    'identityGrid: keeps rectangular size');
  assert(rect[0][0] === '1' && rect[0][1] === '0' && rect[1][1] === '1'
    && rect[1][2] === '0',
    'identityGrid: 1s on the diagonal of a 2x3');
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
  assertThrows(() => gridToMatrix([['@']]), /r1c1/, 'gridToMatrix: bad cell names slot');
  const named = parseMatrixCell('π');
  assert(isSymbolic(named) && named.expr.name === 'π', 'parseMatrixCell: π is a symbolic name');
  const imag = parseMatrixCell('i');
  assert(isSymbolic(imag) && imag.expr.name === 'i', 'parseMatrixCell: i is a symbolic name');
  const inf = parseMatrixCell('∞');
  assert(isSymbolic(inf) && inf.expr.name === '∞', 'parseMatrixCell: ∞ is a symbolic name');
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
  const col = gridToValue([['1'], ['2'], ['3']], { asVector: true });
  assert(isVector(col) && col.items.length === 3 && (Number(col.items[2].value) === 3 || col.items[2].value.toNumber?.() === 3),
    'gridToValue: one column with asVector is a vector');
  const colMat = gridToValue([['1'], ['2']], { asVector: false });
  assert(isMatrix(colMat) && colMat.rows.length === 2 && colMat.rows[0].length === 1,
    'gridToValue: one column without asVector stays a matrix');
}

{
  const nested = RList([
    RList([Integer(1), Integer(2)]),
    RList([Integer(3), Integer(4)]),
  ]);
  const g = valueToGrid(nested);
  assert(g && g.length === 2 && g[0][1] === '2' && g[1][0] === '3',
    'valueToGrid: list of lists');
  const jagged = valueToGrid(RList([
    Vector([Integer(1)]),
    Vector([Integer(2), Integer(3)]),
  ]));
  assert(jagged.length === 2 && jagged[0].length === 2 && jagged[0][1] === '',
    'valueToGrid: jagged list-of-vectors pads');
  const flat = valueToGrid(RList([Integer(9), Integer(8)]));
  assert(flat.length === 1 && flat[0][0] === '9',
    'valueToGrid: flat numeric list is a row');
}

{
  const src = [['a', 'b'], ['c', 'd']];
  const same = pasteIntoGrid(src, 0, 0, 'z');
  assert(same === src, 'pasteIntoGrid: single cell is a no-op');
  const tsv = pasteIntoGrid([['1', ''], ['', '']], 0, 0, '7\t8\n9\t10');
  assert(tsv[0][0] === '7' && tsv[0][1] === '8' && tsv[1][0] === '9' && tsv[1][1] === '10',
    'pasteIntoGrid: 2x2 TSV overlay');
  const grown = pasteIntoGrid([['1']], 0, 0, 'a\tb\nc');
  assert(grown.length === 2 && grown[0].length === 2,
    'pasteIntoGrid: grows to fit');
  assert(grown[0][0] === 'a' && grown[0][1] === 'b' && grown[1][0] === 'c',
    'pasteIntoGrid: grown cells');
}

{
  const src = [['a', 'b'], ['c', 'd']];
  const ins = insertRow(src, 1);
  assert(ins.length === 3 && ins[1][0] === '' && ins[2][0] === 'c',
    'insertRow: blank at 1, rest shift down');
  assert(src.length === 2, 'insertRow: does not mutate source');
  const end = insertRow(src, 99);
  assert(end.length === 3 && end[2][0] === '', 'insertRow: past-end clamps to last');
  const del = deleteRow(ins, 1);
  assert(del.length === 2 && del[1][0] === 'c', 'deleteRow: removes the blank');
  const one = [['x']];
  assert(deleteRow(one, 0) === one, 'deleteRow: refuses last row');

  const col = insertCol(src, 1);
  assert(col[0].length === 3 && col[0][1] === '' && col[0][2] === 'b',
    'insertCol: blank at 1');
  const gone = deleteCol(col, 1);
  assert(gone[0].length === 2 && gone[0][1] === 'b', 'deleteCol: removes the blank');
  const slim = [['x'], ['y']];
  assert(deleteCol(slim, 0) === slim, 'deleteCol: refuses last column');

  const srcT = [['1', '2', '3'], ['4', '5', '6']];
  const tr = transposeGrid(srcT);
  assert(tr.length === 3 && tr[0].length === 2 && tr[0][1] === '4' && tr[2][0] === '3',
    'transposeGrid: 2×3 becomes 3×2');
  assert(srcT.length === 2 && srcT[0].length === 3, 'transposeGrid: does not mutate source');
  const back = transposeGrid(tr);
  assert(back[1][2] === '6', 'transposeGrid: twice returns the original arrangement');
}

{
  const same = (text, expected, opts) => {
    const got = toggleCellSign(text, opts);
    assert(got === expected, `toggleCellSign: ${JSON.stringify(text)}${opts?.typing ? ' while typing' : ''} gives ${JSON.stringify(expected)} (got ${JSON.stringify(got)})`);
  };
  for (const [text, expected] of [
    ['5', '-5'], ['-5', '5'], ['+5', '-5'], ['', '-'], ['-', ''], ['1E20', '-1E20'],
    ['x2e', '-x2e'], ['`-x2e`', 'x2e'], ['`X`', '-X'],
    ['X+1', '`-(X+1)`'], ['`-(X+1)`', '`X+1`'], ['(1,2)', '(-1,-2)'], ['(2, ∠30)', '(-2,∠30)'],
  ]) same(text, expected);
  const typing = { typing: true };
  for (const [text, expected] of [
    ['1E5', '1E-5'], ['1E-5', '1E5'], ['1E+3', '1E-3'], ['1E', '1E-'], ['(1,2E3', '(1,2E-3'],
    ['5', '-5'], ['-5', '5'], ['', '-'], ['X+1', 'X-1'], ['X-1', 'X+1'], ['X*', 'X*-'], ['X*-', 'X*'],
    ['(1,2', '(1,-2'], ['x2e', '-x2e'], ['SIN(X)', '`-(SIN(X))`'],
  ]) same(text, expected, typing);
  for (const cell of ['5', '1E20', '(1,2)', '(2, ∠30)', 'X+1', '`SIN(X)`', 'π', '`-x2e`']) {
    const negated = toggleCellSign(cell);
    assert(parseMatrixCell(negated) !== null, `toggleCellSign: ${cell} negated (${negated}) still parses`);
  }
}

{
  assert(mapCaret('123', '-123', 1) === 2 && mapCaret('123', '-123', 3) === 4,
    'mapCaret: a caret keeps its place after a leading minus');
  assert(mapCaret('X+1', '`-(X+1)`', 1) === 4, 'mapCaret: a caret after X stays after X when the expression is wrapped');
  assert(mapCaret('(1,2)', '(-1,-2)', 2) === 3, 'mapCaret: a caret after the real part stays after it in a negated complex');
}
