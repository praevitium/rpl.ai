import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isMatrix, isVector, isList, isSymbolic,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* Vector / Matrix ops — SIZE / TRN / DET / INV / DOT / CROSS / NORM / IDN. */

/* ================================================================
   Vector / Matrix starter ops: SIZE, TRN, Vector + - .
   ================================================================ */
{
  // SIZE on Vector returns a 1-element list of the length.
  // SIZE entries are Reals, per the HP50 Advanced Guide spec, so
  // downstream numeric ops don't have to deal with Integer→Real
  // promotion at the boundary.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('SIZE').fn(s);
    const top = s.peek();
    assert(top.type === 'list' && top.items.length === 1
           && top.items[0].type === 'real' && top.items[0].value.eq(3),
      `SIZE [1 2 3] → { 3. }, got ${formatStackTop(top)}`);
  }
  // SIZE on Matrix returns a 2-element list { rows cols } of Reals.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('SIZE').fn(s);
    const top = s.peek();
    assert(top.type === 'list' && top.items.length === 2
           && top.items[0].type === 'real' && top.items[0].value.eq(2)
           && top.items[1].type === 'real' && top.items[1].value.eq(3),
      `SIZE 2x3 matrix → { 2. 3. }, got ${formatStackTop(top)}`);
  }
  // SIZE on String: count characters.
  {
    const s = new Stack();
    s.push(Str('hello'));
    lookup('SIZE').fn(s);
    assert(s.peek().type === 'integer' && s.peek().value === 5n,
      `SIZE "hello" → 5, got ${formatStackTop(s.peek())}`);
  }
  // SIZE on List: count items.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3), Real(4)]));
    lookup('SIZE').fn(s);
    assert(s.peek().value === 4n,
      `SIZE { 1 2 3 4 } → 4, got ${formatStackTop(s.peek())}`);
  }
  // SIZE on unsupported type → Bad argument type.
  {
    const s = new Stack();
    s.push(Real(42));
    assertThrows(() => lookup('SIZE').fn(s), /Bad argument/, 'SIZE on Real throws Bad argument type');
  }

  // TRN transposes a 2x3 → 3x2 matrix, preserving element values.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('TRN').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix' && m.rows.length === 3 && m.rows[0].length === 2,
      `TRN 2x3 → 3x2, got rows=${m.rows.length} cols=${m.rows[0]?.length}`);
    assert(m.rows[0][0].value.eq(1) && m.rows[0][1].value.eq(4)
        && m.rows[1][0].value.eq(2) && m.rows[1][1].value.eq(5)
        && m.rows[2][0].value.eq(3) && m.rows[2][1].value.eq(6),
      'TRN: transposed entries match expected positions');
  }
  // TRN twice is identity on a square matrix.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('TRN').fn(s);
    lookup('TRN').fn(s);
    const m = s.peek();
    assert(m.rows[0][0].value.eq(1) && m.rows[0][1].value.eq(2)
        && m.rows[1][0].value.eq(3) && m.rows[1][1].value.eq(4),
      'TRN TRN on 2x2 is identity');
  }
  // TRN on non-Matrix (e.g. Vector) → Bad argument type.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => lookup('TRN').fn(s), /Bad argument/, 'TRN on Vector throws Bad argument type');
  }

  // Element-wise Vector + Vector of equal length.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(10), Real(20), Real(30)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items.length === 3
        && v.items[0].value.eq(11) && v.items[1].value.eq(22)
        && v.items[2].value.eq(33),
      `Vector + Vector element-wise, got ${formatStackTop(v)}`);
  }
  // Element-wise Vector - Vector.
  {
    const s = new Stack();
    s.push(Vector([Real(10), Real(20), Real(30)]));
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('-').fn(s);
    const v = s.peek();
    assert(v.items[0].value.eq(9) && v.items[1].value.eq(18) && v.items[2].value.eq(27),
      `Vector - Vector element-wise, got ${formatStackTop(v)}`);
  }
  // Mixed Integer + Real element contents promote cleanly.
  {
    const s = new Stack();
    s.push(Vector([Integer(1), Integer(2)]));
    s.push(Vector([Real(0.5), Real(1.5)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.items[0].type === 'real' && v.items[0].value.eq(1.5)
        && v.items[1].value.eq(3.5),
      `Vector(Int) + Vector(Real) promotes elements, got ${formatStackTop(v)}`);
  }
  // Mismatched lengths → Invalid dimension.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(1), Real(2), Real(3)]));
    assertThrows(() => lookup('+').fn(s), /dimension/i, 'Vector + Vector with mismatched length throws Invalid dimension');
  }
  // Vector * Vector: dot product (HP50 semantics).
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5), Real(6)]));
    lookup('*').fn(s);
    assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(32),
      `V V * → dot product 32 (got ${s.peek()?.value})`);
  }

  // Scalar * Vector and Vector * Scalar: broadcast.
  {
    const s = new Stack();
    s.push(Real(3));
    s.push(Vector([Real(1), Real(2), Real(4)]));
    lookup('*').fn(s);                                   // 3 * [1,2,4]
    const v = s.peek();
    assert(v && v.type === 'vector' &&
      v.items.length === 3 &&
      v.items[0].value.eq(3) && v.items[1].value.eq(6) && v.items[2].value.eq(12),
      `scalar * Vector broadcasts (got ${v?.items?.map(x => x.value).join(',')})`);
  }
  {
    const s = new Stack();
    s.push(Vector([Real(10), Real(20)]));
    s.push(Real(2));
    lookup('/').fn(s);                                   // [10,20] / 2
    const v = s.peek();
    assert(v && v.type === 'vector' &&
      v.items[0].value.eq(5) && v.items[1].value.eq(10),
      'Vector / scalar broadcasts');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Vector([Real(10), Real(20)]));
    lookup('+').fn(s);                                   // 1 + [10,20]
    const v = s.peek();
    assert(v && v.type === 'vector' &&
      v.items[0].value.eq(11) && v.items[1].value.eq(21),
      'scalar + Vector broadcasts');
  }

  // Matrix + Matrix: element-wise.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Matrix([[Real(10), Real(20)], [Real(30), Real(40)]]));
    lookup('+').fn(s);
    const m = s.peek();
    assert(m && m.type === 'matrix' &&
      m.rows[0][0].value.eq(11) && m.rows[0][1].value.eq(22) &&
      m.rows[1][0].value.eq(33) && m.rows[1][1].value.eq(44),
      'Matrix + Matrix element-wise');
  }

  // Matrix * Matrix: standard 2x2.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));      // A
    s.push(Matrix([[Real(5), Real(6)], [Real(7), Real(8)]]));      // B
    lookup('*').fn(s);
    // A*B = [[1*5+2*7, 1*6+2*8], [3*5+4*7, 3*6+4*8]]
    //     = [[19, 22], [43, 50]]
    const m = s.peek();
    assert(m && m.rows[0][0].value.eq(19) && m.rows[0][1].value.eq(22) &&
      m.rows[1][0].value.eq(43) && m.rows[1][1].value.eq(50),
      `Matrix * Matrix 2x2 (got [[${m?.rows?.[0]?.map(x=>x.value)}],[${m?.rows?.[1]?.map(x=>x.value)}]])`);
  }

  // Matrix * Vector: 2x3 * 3-vec → 2-vec.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    s.push(Vector([Real(7), Real(8), Real(9)]));
    lookup('*').fn(s);
    // [1*7+2*8+3*9, 4*7+5*8+6*9] = [50, 122]
    const v = s.peek();
    assert(v && v.type === 'vector' &&
      v.items[0].value.eq(50) && v.items[1].value.eq(122),
      `Matrix * Vector (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // Scalar * Matrix broadcasts.
  {
    const s = new Stack();
    s.push(Real(2));
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('*').fn(s);
    const m = s.peek();
    assert(m && m.rows[0][0].value.eq(2) && m.rows[0][1].value.eq(4) &&
      m.rows[1][0].value.eq(6) && m.rows[1][1].value.eq(8),
      'scalar * Matrix broadcasts');
  }

  // Dimension-mismatch still errors clearly.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)]]));            // 1x2
    s.push(Matrix([[Real(3)], [Real(4)], [Real(5)]])); // 3x1
    assertThrows(() => lookup('*').fn(s), /dimension/i, 'Matrix * Matrix with bad shapes throws Invalid dimension');
  }
}

/* ================================================================
   DOT / CROSS / IDN / NORM / DET / INV matrix ops.

   DET uses cofactor expansion (symbolic-safe via _scalarBinary).
   INV uses Gauss-Jordan with partial pivoting — numeric only.
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5), Real(6)]));
    lookup('DOT').fn(s);
    assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(32),
      `DOT [1 2 3] [4 5 6] → 32 (got ${s.peek()?.value})`);
  }
  {
    // DOT length mismatch.
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4), Real(5)]));
    assertThrows(() => lookup('DOT').fn(s), /dimension/i, 'DOT with mismatched length throws Invalid dimension');
  }
  {
    // DOT on non-Vector → Bad argument type.
    const s = new Stack();
    s.push(Real(1));
    s.push(Vector([Real(2), Real(3)]));
    assertThrows(() => lookup('DOT').fn(s), /Bad argument/, 'DOT on scalar,Vector throws Bad argument type');
  }

  {
    // Canonical basis: x̂ × ŷ = ẑ.
    const s = new Stack();
    s.push(Vector([Real(1), Real(0), Real(0)]));
    s.push(Vector([Real(0), Real(1), Real(0)]));
    lookup('CROSS').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items.length === 3
        && v.items[0].value.eq(0) && v.items[1].value.eq(0)
        && v.items[2].value.eq(1),
      `CROSS x̂ × ŷ → ẑ, got [${v.items.map(x=>x.value).join(' ')}]`);
  }
  {
    // a × b = -(b × a) — anticommutativity spot check.
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5), Real(6)]));
    lookup('CROSS').fn(s);
    const v = s.peek();
    // [1,2,3] × [4,5,6] = [2*6-3*5, 3*4-1*6, 1*5-2*4] = [-3, 6, -3]
    assert(v.items[0].value.eq(-3) && v.items[1].value.eq(6) && v.items[2].value.eq(-3),
      `CROSS [1 2 3] × [4 5 6] → [-3 6 -3], got [${v.items.map(x=>x.value).join(' ')}]`);
  }
  {
    // CROSS requires length 3.
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4)]));
    assertThrows(() => lookup('CROSS').fn(s), /dimension/i, 'CROSS on length-2 vectors throws Invalid dimension');
  }

  {
    const s = new Stack();
    s.push(Integer(3n));
    lookup('IDN').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix' && m.rows.length === 3 && m.rows[0].length === 3
        && m.rows[0][0].value.eq(1) && m.rows[0][1].value.eq(0) && m.rows[0][2].value.eq(0)
        && m.rows[1][0].value.eq(0) && m.rows[1][1].value.eq(1) && m.rows[1][2].value.eq(0)
        && m.rows[2][0].value.eq(0) && m.rows[2][1].value.eq(0) && m.rows[2][2].value.eq(1),
      'IDN 3 produces 3×3 identity');
  }
  {
    // IDN from a square matrix uses its row count.
    const s = new Stack();
    s.push(Matrix([[Real(9), Real(9)], [Real(9), Real(9)]]));
    lookup('IDN').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix' && m.rows.length === 2
        && m.rows[0][0].value.eq(1) && m.rows[0][1].value.eq(0)
        && m.rows[1][0].value.eq(0) && m.rows[1][1].value.eq(1),
      'IDN on 2×2 matrix → 2×2 identity');
  }
  {
    // Non-integer Real → Bad argument value.
    const s = new Stack();
    s.push(Real(2.5));
    assertThrows(() => lookup('IDN').fn(s), /Bad argument value/, 'IDN of non-integral Real throws Bad argument value');
  }
  {
    // n ≤ 0 → Bad argument value.
    const s = new Stack();
    s.push(Integer(0n));
    assertThrows(() => lookup('IDN').fn(s), /Bad argument value/, 'IDN 0 throws Bad argument value');
  }

  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));
    lookup('NORM').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(5),
      `NORM [3 4] → 5 (got ${s.peek()?.value})`);
  }
  {
    // NORM on 3-vector.
    const s = new Stack();
    s.push(Vector([Real(2), Real(3), Real(6)]));
    lookup('NORM').fn(s);
    assert(Math.abs(s.peek().value - 7) < 1e-12,
      `NORM [2 3 6] → 7 (got ${s.peek()?.value})`);
  }
  {
    // Frobenius on 2×2: √(1+4+9+16) = √30.
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('NORM').fn(s);
    assert(Math.abs(s.peek().value - Math.sqrt(30)) < 1e-12,
      `NORM frobenius [[1 2][3 4]] → √30 (got ${s.peek()?.value})`);
  }

  {
    // 2×2 closed form: 1*4 - 2*3 = -2.
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('DET').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(-2),
      `DET [[1 2][3 4]] → -2 (got ${s.peek()?.value})`);
  }
  {
    // Classic 3×3 example (Wikipedia "determinant" page): -306.
    const s = new Stack();
    s.push(Matrix([
      [Real(6),  Real(1), Real(1)],
      [Real(4),  Real(-2), Real(5)],
      [Real(2),  Real(8), Real(7)],
    ]));
    lookup('DET').fn(s);
    assert(s.peek().value.eq(-306),
      `DET 3×3 → -306 (got ${s.peek()?.value})`);
  }
  {
    // DET of an identity is 1 (4×4 path exercises Laplace recursion).
    const s = new Stack();
    s.push(Integer(4n));
    lookup('IDN').fn(s);
    lookup('DET').fn(s);
    assert(s.peek().value.eq(1),
      `DET I4 → 1 (got ${s.peek()?.value})`);
  }
  {
    // DET with a symbolic entry stays symbolic.  [[a 1][2 b]] → a*b - 2.
    const s = new Stack();
    s.push(Matrix([[Name('a'), Real(1)], [Real(2), Name('b')]]));
    lookup('DET').fn(s);
    const top = s.peek();
    assert(top.type === 'symbolic',
      `DET symbolic-entry matrix → Symbolic (got type ${top?.type})`);
  }
  {
    // Non-square → Invalid dimension.
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    assertThrows(() => lookup('DET').fn(s), /dimension/i, 'DET on non-square matrix throws Invalid dimension');
  }

  {
    // 2×2 numeric inverse.  A=[[4 7][2 6]], A⁻¹ = (1/10)[[6 -7][-2 4]]
    const s = new Stack();
    s.push(Matrix([[Real(4), Real(7)], [Real(2), Real(6)]]));
    lookup('INV').fn(s);
    const m = s.peek();
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    assert(m.type === 'matrix'
        && near(m.rows[0][0].value, 0.6)  && near(m.rows[0][1].value, -0.7)
        && near(m.rows[1][0].value, -0.2) && near(m.rows[1][1].value, 0.4),
      `INV 2×2 (got ${JSON.stringify(m?.rows?.map(r=>r.map(x=>x.value)))})`);
  }
  {
    // A · A⁻¹ = I for a 3×3 numeric matrix.
    const A = Matrix([
      [Real(1), Real(2), Real(3)],
      [Real(0), Real(1), Real(4)],
      [Real(5), Real(6), Real(0)],
    ]);
    const s = new Stack();
    s.push(A); s.push(A);
    lookup('INV').fn(s);
    lookup('*').fn(s);
    const m = s.peek();
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    assert(m.type === 'matrix' && m.rows.length === 3 && m.rows[0].length === 3,
      'INV 3×3 produces a matrix');
    let ok = true;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (!near(m.rows[i][j].value, i === j ? 1 : 0)) ok = false;
      }
    }
    assert(ok, `A · A⁻¹ ≈ I (got ${JSON.stringify(m.rows.map(r=>r.map(x=>x.value.toFixed(6))))})`);
  }
  {
    // Singular matrix → Infinite result.
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
    assertThrows(() => lookup('INV').fn(s), /Infinite result/, 'INV singular throws Infinite result');
  }
  {
    // Non-square → Invalid dimension.
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    assertThrows(() => lookup('INV').fn(s), /dimension/i, 'INV non-square throws Invalid dimension');
  }
  {
    // Symbolic entry → Bad argument type (explicit scope limit).
    const s = new Stack();
    s.push(Matrix([[Name('a'), Real(1)], [Real(2), Name('b')]]));
    assertThrows(() => lookup('INV').fn(s), /Bad argument/, 'INV on symbolic-entry matrix throws Bad argument type');
  }

  {
    // SIZE entries are Reals, per HP50 Advanced Guide spec.
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3), Real(4), Real(5)]));
    lookup('SIZE').fn(s);
    const top = s.peek();
    assert(top.type === 'list' && top.items[0].type === 'real',
      'SIZE Vector entries are Real (not Integer)');
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
    lookup('SIZE').fn(s);
    const top = s.peek();
    assert(top.items.length === 2
        && top.items[0].type === 'real' && top.items[0].value.eq(3)
        && top.items[1].type === 'real' && top.items[1].value.eq(2),
      'SIZE 3×2 matrix → { 3. 2. } (Reals)');
  }
}

/* ================================================================
   TRACE matrix diagonal sum.  Lifts to Symbolic when any diagonal
   entry is symbolic, and errors cleanly on non-square or non-Matrix
   input.
   ================================================================ */
{
  // TRACE of a 3×3 Integer matrix → 1+5+9 = 15.
  {
    const s = new Stack();
    s.push(Matrix([
      [Integer(1n), Integer(2n), Integer(3n)],
      [Integer(4n), Integer(5n), Integer(6n)],
      [Integer(7n), Integer(8n), Integer(9n)],
    ]));
    lookup('TRACE').fn(s);
    const top = s.peek();
    assert((isInteger(top) && top.value === 15n)
        || (isReal(top) && top.value.eq(15)),
      `TRACE 3×3 Int → 15 (got ${formatStackTop(top)})`);
  }
  // TRACE of a 2×2 Real matrix → 2.5 + 3.5 = 6.
  {
    const s = new Stack();
    s.push(Matrix([[Real(2.5), Real(1)], [Real(9), Real(3.5)]]));
    lookup('TRACE').fn(s);
    const top = s.peek();
    assert(isReal(top) && Math.abs(top.value - 6.0) < 1e-12,
      `TRACE 2×2 Real → 6 (got ${formatStackTop(top)})`);
  }
  // TRACE of a 1×1 matrix returns the single entry's value.
  {
    const s = new Stack();
    s.push(Matrix([[Real(42)]]));
    lookup('TRACE').fn(s);
    const top = s.peek();
    assert(isReal(top) && top.value.eq(42),
      `TRACE 1×1 [[42]] → 42 (got ${formatStackTop(top)})`);
  }
  // TRACE with Complex diagonal entries stays Complex.
  // (1+2i) + (3-i) = (4+i).
  {
    const s = new Stack();
    s.push(Matrix([
      [Complex(1, 2), Real(0)],
      [Real(0), Complex(3, -1)],
    ]));
    lookup('TRACE').fn(s);
    const top = s.peek();
    assert(isComplex(top) && Math.abs(top.re - 4) < 1e-12
        && Math.abs(top.im - 1) < 1e-12,
      `TRACE complex-diag → 4+i (got ${formatStackTop(top)})`);
  }
  // TRACE on a non-square matrix → Invalid dimension.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    assertThrows(() => lookup('TRACE').fn(s), /dimension/i, 'TRACE on non-square matrix throws Invalid dimension');
  }
  // TRACE on a Vector → Bad argument type (only Matrix is valid).
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    assertThrows(() => lookup('TRACE').fn(s), /Bad argument/, 'TRACE on Vector throws Bad argument type');
  }
  // TRACE of a matrix with a symbolic diagonal entry lifts to Symbolic.
  {
    const s = new Stack();
    s.push(Matrix([[Name('a'), Real(0)], [Real(0), Real(2)]]));
    lookup('TRACE').fn(s);
    const top = s.peek();
    assert(top.type === 'symbolic',
      `TRACE symbolic-diag → Symbolic (got type ${top?.type})`);
  }
}

/* ================================================================
   RREF, RANK, CON.
   ================================================================ */
{
  // Helper: compare a 2-D array of Real-values to an expected 2-D
  // array of plain numbers, with tolerance.
  const matMatches = (matVal, expect, tol = 1e-9) => {
    if (!isMatrix(matVal)) return false;
    if (matVal.rows.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      if (matVal.rows[i].length !== expect[i].length) return false;
      for (let j = 0; j < expect[i].length; j++) {
        const cell = matVal.rows[i][j];
        const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
        if (Math.abs(v - expect[i][j]) > tol) return false;
      }
    }
    return true;
  };

  // RREF on a simple 2×2 → identity (already row-reduced after elim).
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('RREF').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 0], [0, 1]]),
      'session048: RREF of [[1 2][3 4]] → identity');
  }

  // RREF on a rank-1 (singular) 2×2: row2 = 2*row1.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
    lookup('RREF').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2], [0, 0]]),
      'session048: RREF of rank-1 2×2 → [[1 2][0 0]]');
  }

  // RREF on a 2×3 rectangular with two independent rows.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('RREF').fn(s);
    const out = s.peek();
    // Expected RREF: [[1 0 -1][0 1 2]]
    assert(matMatches(out, [[1, 0, -1], [0, 1, 2]]),
      'session048: RREF of 2×3 full-rank → [[1 0 -1][0 1 2]]');
  }

  // RREF on an Integer matrix works (accepts Integer entries).
  {
    const s = new Stack();
    s.push(Matrix([[Integer(2), Integer(4)], [Integer(1), Integer(3)]]));
    lookup('RREF').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 0], [0, 1]]),
      'session048: RREF accepts Integer matrix entries');
  }

  // RREF on non-Matrix throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => lookup('RREF').fn(s), /Bad argument/, 'session048: RREF on Vector throws Bad argument type');
  }

  // RREF on Complex entry throws (numeric pivot path rejects Complex).
  {
    const s = new Stack();
    s.push(Matrix([[Complex(1, 1), Real(1)], [Real(0), Real(1)]]));
    assertThrows(() => lookup('RREF').fn(s), /Bad argument/, 'session048: RREF on Complex-entry matrix throws');
  }

  // RANK: full-rank 2×2 → 2.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('RANK').fn(s);
    const top = s.peek();
    assert(isInteger(top) && top.value === 2n,
      'session048: RANK of full-rank 2×2 → 2');
  }

  // RANK: rank-1 2×2.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
    lookup('RANK').fn(s);
    const top = s.peek();
    assert(isInteger(top) && top.value === 1n,
      'session048: RANK of rank-1 2×2 → 1');
  }

  // RANK: 3×3 with one redundant row → 2.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(0), Real(1)],
      [Real(0), Real(1), Real(1)],
      [Real(1), Real(1), Real(2)],    // row3 = row1 + row2
    ]));
    lookup('RANK').fn(s);
    const top = s.peek();
    assert(isInteger(top) && top.value === 2n,
      'session048: RANK of 3×3 with dependent row → 2');
  }

  // RANK: zero matrix → 0.
  {
    const s = new Stack();
    s.push(Matrix([[Real(0), Real(0)], [Real(0), Real(0)]]));
    lookup('RANK').fn(s);
    const top = s.peek();
    assert(isInteger(top) && top.value === 0n,
      'session048: RANK of zero matrix → 0');
  }

  // CON — Integer n + value → Vector of length n.
  {
    const s = new Stack();
    s.push(Integer(3));
    s.push(Real(7));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isVector(top) && top.items.length === 3
        && top.items.every(x => isReal(x) && x.value.eq(7)),
      'session048: CON 3 7 → [7 7 7]');
  }

  // CON — {n} + value → Vector of length n.
  {
    const s = new Stack();
    s.push(RList([Integer(4)]));
    s.push(Real(0));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isVector(top) && top.items.length === 4
        && top.items.every(x => x.value.eq(0)),
      'session048: CON {4} 0 → [0 0 0 0]');
  }

  // CON — {m n} + value → Matrix m×n.
  {
    const s = new Stack();
    s.push(RList([Integer(2), Integer(3)]));
    s.push(Real(5));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isMatrix(top) && top.rows.length === 2 && top.rows[0].length === 3,
      'session048: CON {2 3} 5 → 2×3 Matrix');
    assert(top.rows.every(r => r.every(x => x.value.eq(5))),
      'session048: CON {2 3} 5 every entry is 5');
  }

  // CON — Matrix + value replaces all entries with value, same shape.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
    s.push(Real(9));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isMatrix(top) && top.rows.length === 3 && top.rows[0].length === 2,
      'session048: CON matrix-shape copy → 3×2 Matrix');
    assert(top.rows.every(r => r.every(x => x.value.eq(9))),
      'session048: CON matrix-shape fills with 9');
  }

  // CON — Vector + value replaces all entries with value, same length.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Real(11));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isVector(top) && top.items.length === 3
        && top.items.every(x => x.value.eq(11)),
      'session048: CON vector-shape fill → [11 11 11]');
  }

  // CON — Complex value is accepted.
  {
    const s = new Stack();
    s.push(Integer(2));
    s.push(Complex(1, 1));
    lookup('CON').fn(s);
    const top = s.peek();
    assert(isVector(top) && top.items.length === 2 && isComplex(top.items[0]),
      'session048: CON accepts Complex fill value');
  }

  // CON — zero count throws.
  {
    const s = new Stack();
    s.push(Integer(0));
    s.push(Real(1));
    assertThrows(() => lookup('CON').fn(s), /Bad argument value/, 'session048: CON 0 n throws Bad argument value');
  }

  // CON — non-scalar fill (a Vector) throws.
  {
    const s = new Stack();
    s.push(Integer(3));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('CON').fn(s), /Bad argument type/, 'session048: CON with nested container fill throws');
  }

  // CON — 3-element shape list throws Invalid dimension.
  {
    const s = new Stack();
    s.push(RList([Integer(1), Integer(2), Integer(3)]));
    s.push(Real(0));
    assertThrows(() => lookup('CON').fn(s), /Invalid dimension/, 'session048: CON {1 2 3} throws Invalid dimension');
  }
}

/* ================================================================
   REF, HADAMARD, RANM, LSQ.
   ================================================================ */
{
  const matMatches = (matVal, expect, tol = 1e-9) => {
    if (!isMatrix(matVal)) return false;
    if (matVal.rows.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      if (matVal.rows[i].length !== expect[i].length) return false;
      for (let j = 0; j < expect[i].length; j++) {
        const cell = matVal.rows[i][j];
        const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
        if (Math.abs(v - expect[i][j]) > tol) return false;
      }
    }
    return true;
  };
  const vecMatches = (vecVal, expect, tol = 1e-9) => {
    if (!isVector(vecVal)) return false;
    if (vecVal.items.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      const cell = vecVal.items[i];
      const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
      if (Math.abs(v - expect[i]) > tol) return false;
    }
    return true;
  };


  // REF of [[1 2][3 4]] with partial pivoting: row swap puts |3| on
  // top, so after dividing by 3 and eliminating below the pivot we
  // get [[1 4/3][0 2/3]] → normalize row 2 by 2/3 → [[1 4/3][0 1]].
  // Contrast: RREF of the same matrix back-substitutes to identity.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('REF').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 4/3], [0, 1]]),
      'session049: REF of [[1 2][3 4]] → [[1 4/3][0 1]] (partial pivot)');
  }

  // REF of a rank-1 2×2 → same as RREF ([[1 2][0 0]]).
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
    lookup('REF').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2], [0, 0]]),
      'session049: REF of rank-1 2×2 → [[1 2][0 0]]');
  }

  // REF on a rectangular 2×3 matrix.  After partial pivoting the
  // first row becomes row 2 of the input / scaled: we verify only
  // that the result is upper-triangular with leading-1 pivots and
  // that first column below pivot is zero.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('REF').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows.length === 2 && out.rows[0].length === 3,
      'session049: REF of 2×3 returns 2×3');
    // After REF, a[1][0] must be zero (entry below leading pivot).
    const a10 = out.rows[1][0].value;
    assert(Math.abs(a10) < 1e-9,
      `session049: REF 2×3 row2 col1 ≈ 0, got ${a10}`);
    // Pivot of row 1 must be exactly 1 (we normalize and zero-residual).
    assert(out.rows[0][0].value.eq(1),
      `session049: REF 2×3 pivot at (1,1) = 1`);
  }

  // REF on a 3×3 matrix with row3 = row1 + row2 → last row should be zero.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(0), Real(1)],
      [Real(0), Real(1), Real(1)],
      [Real(1), Real(1), Real(2)],
    ]));
    lookup('REF').fn(s);
    const out = s.peek();
    // Partial pivoting may reorder rows; but the final row should be ~zero.
    const lastRow = out.rows[2].map(x => x.value);
    const lastRowMax = Math.max(...lastRow.map(Math.abs));
    assert(lastRowMax < 1e-9,
      `session049: REF 3×3 rank-2 has zero bottom row (max=${lastRowMax})`);
  }

  // REF accepts Integer entries.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(2), Integer(4)], [Integer(1), Integer(3)]]));
    lookup('REF').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows.length === 2,
      'session049: REF accepts Integer matrix entries');
  }

  // REF on Vector throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => lookup('REF').fn(s), /Bad argument/, 'session049: REF on Vector throws Bad argument type');
  }

  // REF on Complex-entry matrix throws.
  {
    const s = new Stack();
    s.push(Matrix([[Complex(1, 1), Real(1)], [Real(0), Real(1)]]));
    assertThrows(() => lookup('REF').fn(s), /Bad argument/, 'session049: REF on Complex-entry matrix throws');
  }


  // Matrix HADAMARD Matrix.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Matrix([[Real(5), Real(6)], [Real(7), Real(8)]]));
    lookup('HADAMARD').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[5, 12], [21, 32]]),
      'session049: HADAMARD of 2×2 matrices → element-wise product');
  }

  // Vector HADAMARD Vector.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5), Real(6)]));
    lookup('HADAMARD').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [4, 10, 18]),
      'session049: HADAMARD of vectors → element-wise product');
  }

  // HADAMARD with Integer entries preserves Integer result.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(2), Integer(3)], [Integer(4), Integer(5)]]));
    s.push(Matrix([[Integer(1), Integer(2)], [Integer(3), Integer(4)]]));
    lookup('HADAMARD').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows[0][0].type === 'integer'
        && out.rows[0][0].value === 2n,
      'session049: HADAMARD of Integer matrices stays Integer');
  }

  // HADAMARD with Symbolic entries lifts to symbolic.
  {
    const s = new Stack();
    s.push(Matrix([[Name('a'), Real(0)], [Real(0), Name('b')]]));
    s.push(Matrix([[Real(2), Real(0)], [Real(0), Real(3)]]));
    lookup('HADAMARD').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows[0][0].type === 'symbolic',
      'session049: HADAMARD with Symbolic entries lifts');
  }

  // HADAMARD with mismatched dimensions throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Matrix([[Real(5), Real(6), Real(7)], [Real(8), Real(9), Real(10)]]));
    assertThrows(() => lookup('HADAMARD').fn(s), /Invalid dimension/, 'session049: HADAMARD with mismatched dims throws');
  }

  // HADAMARD with mismatched types (Vector + Matrix) throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Matrix([[Real(3), Real(4)]]));
    assertThrows(() => lookup('HADAMARD').fn(s), /Bad argument/, 'session049: HADAMARD Vector×Matrix throws Bad argument type');
  }

  // HADAMARD with unequal-length vectors throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5)]));
    assertThrows(() => lookup('HADAMARD').fn(s), /Invalid dimension/, 'session049: HADAMARD unequal vectors throws Invalid dimension');
  }


  // RANM with Integer count → Vector of length n; all entries in [-9, 9].
  {
    const s = new Stack();
    s.push(Integer(5));
    lookup('RANM').fn(s);
    const out = s.peek();
    assert(isVector(out) && out.items.length === 5,
      'session049: RANM 5 → Vector of length 5');
    const allReal = out.items.every(x => isReal(x));
    const allInRange = out.items.every(x => x.value.isInteger() && x.value.gte(-9) && x.value.lte(9));
    assert(allReal && allInRange,
      'session049: RANM 5 → all Real entries in [-9, 9]');
  }

  // RANM with {m n} → Matrix of that shape.
  {
    const s = new Stack();
    s.push(RList([Integer(3), Integer(4)]));
    lookup('RANM').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows.length === 3 && out.rows[0].length === 4,
      'session049: RANM {3 4} → 3×4 Matrix');
    const allInRange = out.rows.every(r => r.every(x => x.value.isInteger() && x.value.gte(-9) && x.value.lte(9)));
    assert(allInRange, 'session049: RANM {3 4} all entries in [-9, 9]');
  }

  // RANM with {n} → Vector.
  {
    const s = new Stack();
    s.push(RList([Integer(6)]));
    lookup('RANM').fn(s);
    const out = s.peek();
    assert(isVector(out) && out.items.length === 6,
      'session049: RANM {6} → Vector of length 6');
  }

  // RANM with Matrix-shape copy → Matrix of same shape.
  {
    const s = new Stack();
    s.push(Matrix([[Real(0), Real(0), Real(0)], [Real(0), Real(0), Real(0)]]));
    lookup('RANM').fn(s);
    const out = s.peek();
    assert(isMatrix(out) && out.rows.length === 2 && out.rows[0].length === 3,
      'session049: RANM Matrix-shape → 2×3 Matrix');
  }

  // RANM with Vector-shape copy → Vector of same length.
  {
    const s = new Stack();
    s.push(Vector([Real(0), Real(0), Real(0), Real(0)]));
    lookup('RANM').fn(s);
    const out = s.peek();
    assert(isVector(out) && out.items.length === 4,
      'session049: RANM Vector-shape → length-4 Vector');
  }

  // RANM with zero count throws.
  {
    const s = new Stack();
    s.push(Integer(0));
    assertThrows(() => lookup('RANM').fn(s), /Bad argument value/, 'session049: RANM 0 throws Bad argument value');
  }

  // RANM with bad shape (String) throws.
  {
    const s = new Stack();
    s.push(Str("hi"));
    assertThrows(() => lookup('RANM').fn(s), /Bad argument/, 'session049: RANM on String throws');
  }


  // LSQ square: solve [[1 1][1 -1]] x = [3 1] → x = [2 1].
  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(1)]));
    s.push(Matrix([[Real(1), Real(1)], [Real(1), Real(-1)]]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [2, 1]),
      'session049: LSQ square system → x = [2 1]');
  }

  // LSQ identity: I x = b → x = b.
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-3), Real(7)]));
    s.push(Matrix([
      [Real(1), Real(0), Real(0)],
      [Real(0), Real(1), Real(0)],
      [Real(0), Real(0), Real(1)],
    ]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [5, -3, 7]),
      'session049: LSQ on identity → b unchanged');
  }

  // LSQ overdetermined: fit y = x through (0,0), (1,1), (2,2.01).
  // A = [[0][1][2]], b = [0; 1; 2.01]; normal-eq gives x = (A^T b)/(A^T A)
  //   = (0 + 1 + 4.02) / (0 + 1 + 4) = 5.02 / 5 = 1.004
  {
    const s = new Stack();
    s.push(Vector([Real(0), Real(1), Real(2.01)]));
    s.push(Matrix([[Real(0)], [Real(1)], [Real(2)]]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [1.004], 1e-9),
      `session049: LSQ overdetermined → [1.004] (got ${isVector(out) ? out.items[0].value : 'non-vec'})`);
  }

  // LSQ underdetermined: minimum-norm for [[1 1]] x = [2] → x = [1, 1].
  // A = [[1 1]] (1×2), b = [2].  A^T (A A^T)^-1 b.
  // A A^T = [[2]]; inverse = 0.5; y = 0.5 * 2 = 1; x = A^T * [1] = [1, 1].
  {
    const s = new Stack();
    s.push(Vector([Real(2)]));
    s.push(Matrix([[Real(1), Real(1)]]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [1, 1]),
      'session049: LSQ underdetermined [[1 1]] x = [2] → [1 1] min-norm');
  }

  // LSQ with Integer entries (Integer coerce to Real numeric path).
  {
    const s = new Stack();
    s.push(Vector([Integer(3), Integer(1)]));
    s.push(Matrix([[Integer(1), Integer(1)], [Integer(1), Integer(-1)]]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [2, 1]),
      'session049: LSQ accepts Integer entries');
  }

  // LSQ on singular square throws Infinite result.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
    assertThrows(() => lookup('LSQ').fn(s), /Infinite/, 'session049: LSQ on singular A throws Infinite result');
  }

  // LSQ with mismatched b-length throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Matrix([[Real(1), Real(0)], [Real(0), Real(1)]]));
    assertThrows(() => lookup('LSQ').fn(s), /Invalid dimension/, 'session049: LSQ with wrong b-length throws');
  }

  // LSQ with non-Matrix A throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1)]));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('LSQ').fn(s), /Bad argument/, 'session049: LSQ with non-Matrix A throws');
  }

  // LSQ with Complex-entry A throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Matrix([[Complex(1, 1), Real(0)], [Real(0), Real(1)]]));
    assertThrows(() => lookup('LSQ').fn(s), /Bad argument/, 'session049: LSQ on Complex-entry A throws');
  }

  // LSQ with Matrix b (multiple RHS).
  // Square identity, b = [[1 10][2 20][3 30]] → x = b.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(10)], [Real(2), Real(20)], [Real(3), Real(30)]]));
    s.push(Matrix([
      [Real(1), Real(0), Real(0)],
      [Real(0), Real(1), Real(0)],
      [Real(0), Real(0), Real(1)],
    ]));
    lookup('LSQ').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 10], [2, 20], [3, 30]]),
      'session049: LSQ Matrix-b → identity passes RHS through');
  }
}

/* ================================================================
   ROW+ / ROW- / COL+ / COL- (matrix row/col edit),
   CNRM / RNRM (column / row max-sum norms), AUGMENT (horizontal
   concat), RAND / RDZ (seeded PRNG shared with RANM).
   ================================================================ */
import { seedPrng, resetPrng, getPrngSeed } from '../www/src/rpl/state.js';
{
  const matMatches = (matVal, expect) => {
    if (!isMatrix(matVal)) return false;
    if (matVal.rows.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      if (matVal.rows[i].length !== expect[i].length) return false;
      for (let j = 0; j < expect[i].length; j++) {
        const cell = matVal.rows[i][j];
        const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
        if (v !== expect[i][j]) return false;
      }
    }
    return true;
  };
  const vecMatches = (vecVal, expect) => {
    if (!isVector(vecVal)) return false;
    if (vecVal.items.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      const cell = vecVal.items[i];
      const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
      if (v !== expect[i]) return false;
    }
    return true;
  };


  // Insert row at index 1 (top) of a 2×3 matrix.
  {
    const s = new Stack();
    s.push(Matrix([[Real(4), Real(5), Real(6)], [Real(7), Real(8), Real(9)]]));
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Integer(1));
    lookup('ROW+').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]),
      'session050: ROW+ at top inserts row at index 1');
  }

  // Insert row at index m+1 (append) of a 2×2 matrix.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6)]));
    s.push(Integer(3));
    lookup('ROW+').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2], [3, 4], [5, 6]]),
      'session050: ROW+ at m+1 appends row');
  }

  // Insert row in middle of a 3×2 matrix.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(5), Real(6)], [Real(7), Real(8)]]));
    s.push(Vector([Real(3), Real(4)]));
    s.push(Integer(2));
    lookup('ROW+').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2], [3, 4], [5, 6], [7, 8]]),
      'session050: ROW+ at middle inserts row');
  }

  // ROW+ wrong-length vector → Invalid dimension.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6), Real(7)]));    // 3-vec for 2-col matrix
    s.push(Integer(1));
    assertThrows(() => lookup('ROW+').fn(s), /Invalid dimension/, 'session050: ROW+ wrong-length vector throws');
  }

  // ROW+ out-of-range index (too large) throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6)]));
    s.push(Integer(5));
    assertThrows(() => lookup('ROW+').fn(s), /Invalid dimension/, 'session050: ROW+ OOB index (too large) throws');
  }

  // ROW+ index 0 throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6)]));
    s.push(Integer(0));
    assertThrows(() => lookup('ROW+').fn(s), /Invalid dimension/, 'session050: ROW+ index 0 throws');
  }

  // ROW+ on non-Matrix throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3)]));
    s.push(Integer(1));
    assertThrows(() => lookup('ROW+').fn(s), /Bad argument/, 'session050: ROW+ on non-Matrix throws');
  }


  // Remove row 2 of a 3×3 matrix.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(2), Real(3)],
      [Real(4), Real(5), Real(6)],
      [Real(7), Real(8), Real(9)],
    ]));
    s.push(Integer(2));
    lookup('ROW-').fn(s);
    const removed = s.pop();
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 3], [7, 8, 9]]),
      'session050: ROW- removes row 2, leaves 2×3');
    assert(vecMatches(removed, [4, 5, 6]),
      'session050: ROW- returns removed row as Vector');
  }

  // Remove first row.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(1));
    lookup('ROW-').fn(s);
    const removed = s.pop();
    const out = s.peek();
    assert(matMatches(out, [[3, 4]]),
      'session050: ROW- first row → 1×2 remaining');
    assert(vecMatches(removed, [1, 2]),
      'session050: ROW- first removed = [1 2]');
  }

  // ROW- OOB index throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(5));
    assertThrows(() => lookup('ROW-').fn(s), /Invalid dimension/, 'session050: ROW- OOB index throws');
  }


  // Insert column as new first column of 2×2.
  {
    const s = new Stack();
    s.push(Matrix([[Real(2), Real(3)], [Real(5), Real(6)]]));
    s.push(Vector([Real(1), Real(4)]));
    s.push(Integer(1));
    lookup('COL+').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 3], [4, 5, 6]]),
      'session050: COL+ prepends column');
  }

  // Append column at end.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(10), Real(20)]));
    s.push(Integer(3));
    lookup('COL+').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 10], [3, 4, 20]]),
      'session050: COL+ at cols+1 appends column');
  }

  // COL+ wrong-length vector throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6), Real(7)]));
    s.push(Integer(1));
    assertThrows(() => lookup('COL+').fn(s), /Invalid dimension/, 'session050: COL+ wrong-length vector throws');
  }


  // Remove column 2 of 3×3.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(2), Real(3)],
      [Real(4), Real(5), Real(6)],
      [Real(7), Real(8), Real(9)],
    ]));
    s.push(Integer(2));
    lookup('COL-').fn(s);
    const removed = s.pop();
    const out = s.peek();
    assert(matMatches(out, [[1, 3], [4, 6], [7, 9]]),
      'session050: COL- removes col 2');
    assert(vecMatches(removed, [2, 5, 8]),
      'session050: COL- returns removed column as Vector');
  }

  // COL- OOB throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(3));
    assertThrows(() => lookup('COL-').fn(s), /Invalid dimension/, 'session050: COL- OOB index throws');
  }


  // CNRM on 2×2: col sums |1|+|3|=4, |2|+|4|=6; max = 6.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('CNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(6),
      `session050: CNRM [[1 2][3 4]] → 6 (got ${s.peek().value})`);
  }

  // CNRM with negative entries: |−1|+|−3|=4, |2|+|4|=6; max = 6.
  {
    const s = new Stack();
    s.push(Matrix([[Real(-1), Real(2)], [Real(-3), Real(4)]]));
    lookup('CNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(6),
      'session050: CNRM uses absolute values');
  }

  // CNRM on Vector: sum of |entries|.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-2), Real(3)]));
    lookup('CNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(6),
      'session050: CNRM on Vector → sum of |entries|');
  }

  // CNRM with Complex entries: col sums |3+4i|=5, |0|=0; max = 5.
  {
    const s = new Stack();
    s.push(Matrix([[Complex(3, 4), Real(0)]]));
    lookup('CNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(5),
      'session050: CNRM handles Complex magnitude');
  }

  // CNRM with Integer entries accepted.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(1), Integer(2)], [Integer(3), Integer(4)]]));
    lookup('CNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(6),
      'session050: CNRM accepts Integer entries');
  }

  // CNRM on Symbolic-entry matrix throws.
  {
    const s = new Stack();
    s.push(Matrix([[Symbolic({kind:'var',name:'x'}), Real(0)]]));
    assertThrows(() => lookup('CNRM').fn(s), /Bad argument/, 'session050: CNRM on Symbolic-entry throws');
  }


  // RNRM on 2×2: row sums |1|+|2|=3, |3|+|4|=7; max = 7.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('RNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(7),
      `session050: RNRM [[1 2][3 4]] → 7 (got ${s.peek().value})`);
  }

  // RNRM on Vector: max of |entries|.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-5), Real(3)]));
    lookup('RNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(5),
      'session050: RNRM on Vector → max of |entries|');
  }

  // RNRM with Complex: row sum |3+4i|+|0|=5.
  {
    const s = new Stack();
    s.push(Matrix([[Complex(3, 4), Real(0)], [Real(1), Real(1)]]));
    lookup('RNRM').fn(s);
    assert(s.peek().type === 'real' && s.peek().value.eq(5),
      'session050: RNRM handles Complex magnitude (row1=5 > row2=2)');
  }

  // RNRM on non-matrix/vector throws.
  {
    const s = new Stack();
    s.push(Str('not a matrix'));
    assertThrows(() => lookup('RNRM').fn(s), /Bad argument/, 'session050: RNRM on String throws');
  }


  // Matrix + Matrix: same row count.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Matrix([[Real(5)], [Real(6)]]));
    lookup('AUGMENT').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 5], [3, 4, 6]]),
      'session050: AUGMENT Matrix+Matrix concatenates columns');
  }

  // Matrix + Vector: vector as new column.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Vector([Real(5), Real(6)]));
    lookup('AUGMENT').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1, 2, 5], [3, 4, 6]]),
      'session050: AUGMENT Matrix+Vector appends column');
  }

  // Vector + Matrix: vector as new leading column.
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(6)]));
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('AUGMENT').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[5, 1, 2], [6, 3, 4]]),
      'session050: AUGMENT Vector+Matrix prepends column');
  }

  // Vector + Vector: concatenate entries.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5)]));
    lookup('AUGMENT').fn(s);
    const out = s.peek();
    assert(vecMatches(out, [1, 2, 3, 4, 5]),
      'session050: AUGMENT Vector+Vector concatenates entries');
  }

  // Mismatched row count throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1)], [Real(2)]]));
    s.push(Matrix([[Real(3)], [Real(4)], [Real(5)]]));
    assertThrows(() => lookup('AUGMENT').fn(s), /Invalid dimension/, 'session050: AUGMENT row-count mismatch throws');
  }

  // Non-matrix/vector (e.g. Real) throws.
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(2));
    assertThrows(() => lookup('AUGMENT').fn(s), /Bad argument/, 'session050: AUGMENT Real+Real throws Bad argument');
  }


  // RAND returns a Real in [0, 1).
  {
    resetPrng();
    const s = new Stack();
    lookup('RAND').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.gte(0) && r.value.lt(1),
      `session050: RAND in [0,1) (got ${r.value})`);
  }

  // Two RAND draws with the same seed are reproducible.
  {
    resetPrng();
    seedPrng(12345);
    const s = new Stack();
    lookup('RAND').fn(s);
    const r1a = s.pop();
    lookup('RAND').fn(s);
    const r2a = s.pop();
    seedPrng(12345);
    lookup('RAND').fn(s);
    const r1b = s.pop();
    lookup('RAND').fn(s);
    const r2b = s.pop();
    assert(r1a.value.eq(r1b.value) && r2a.value.eq(r2b.value),
      'session050: RAND is deterministic under RDZ-equivalent reseed');
  }

  // Two RAND draws with the same seed are distinct from each other.
  {
    resetPrng();
    seedPrng(98765);
    const s = new Stack();
    lookup('RAND').fn(s);
    const r1 = s.pop();
    lookup('RAND').fn(s);
    const r2 = s.pop();
    assert(!r1.value.eq(r2.value),
      'session050: consecutive RAND draws differ');
  }


  // RDZ with Integer seed: subsequent RAND is reproducible.
  {
    const s = new Stack();
    s.push(Integer(42));
    lookup('RDZ').fn(s);
    lookup('RAND').fn(s);
    const firstA = s.pop().value;

    s.push(Integer(42));
    lookup('RDZ').fn(s);
    lookup('RAND').fn(s);
    const firstB = s.pop().value;

    assert(firstA.eq(firstB),
      'session050: RDZ-same-seed RAND is deterministic');
  }

  // RDZ with Real(0) → clock reseed (no exception; result nondeterministic).
  {
    const s = new Stack();
    s.push(Real(0));
    let threw = false;
    try { lookup('RDZ').fn(s); } catch (e) { threw = true; }
    assert(!threw, 'session050: RDZ 0 accepted (clock seed)');
  }

  // RDZ with non-integer Real throws Bad argument value.
  {
    const s = new Stack();
    s.push(Real(3.14));
    assertThrows(() => lookup('RDZ').fn(s), /Bad argument value/, 'session050: RDZ with non-integer Real throws');
  }

  // RDZ with Complex throws.
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    assertThrows(() => lookup('RDZ').fn(s), /Bad argument/, 'session050: RDZ on Complex throws Bad argument');
  }


  // With seeded PRNG, RANM is reproducible.
  {
    const s = new Stack();
    s.push(Integer(999));
    lookup('RDZ').fn(s);
    s.push(RList([Integer(2), Integer(3)]));
    lookup('RANM').fn(s);
    const m1 = s.pop();

    s.push(Integer(999));
    lookup('RDZ').fn(s);
    s.push(RList([Integer(2), Integer(3)]));
    lookup('RANM').fn(s);
    const m2 = s.pop();

    // Matrix values should match exactly.
    let match = isMatrix(m1) && isMatrix(m2)
             && m1.rows.length === m2.rows.length
             && m1.rows[0].length === m2.rows[0].length;
    if (match) {
      for (let i = 0; i < m1.rows.length && match; i++) {
        for (let j = 0; j < m1.rows[0].length && match; j++) {
          if (!m1.rows[i][j].value.eq(m2.rows[i][j].value)) match = false;
        }
      }
    }
    assert(match, 'session050: seeded RANM is deterministic across calls');
  }

  // RANM entries still in [-9, 9] under the new PRNG.
  {
    resetPrng();
    const s = new Stack();
    s.push(RList([Integer(4), Integer(4)]));
    lookup('RANM').fn(s);
    const m = s.peek();
    let allInRange = true;
    for (const row of m.rows) {
      for (const cell of row) {
        const v = cell.value;
        if (v.lt(-9) || v.gt(9) || !v.isInteger()) allInRange = false;
      }
    }
    assert(allInRange, 'session050: seeded RANM entries still in [-9, 9]');
  }

  // Reset PRNG for later tests.
  resetPrng();
}

/* ================================================================
   ROW→ / →ROW / COL→ / →COL (matrix row/col decompose/compose),
   RSWP / CSWP / RCI / RCIJ (elementary row ops).  Complements the
   ROW+ / ROW- / COL+ / COL- edit cluster.
   ================================================================ */
{
  const matMatches = (matVal, expect) => {
    if (!isMatrix(matVal)) return false;
    if (matVal.rows.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      if (matVal.rows[i].length !== expect[i].length) return false;
      for (let j = 0; j < expect[i].length; j++) {
        const cell = matVal.rows[i][j];
        const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
        if (v !== expect[i][j]) return false;
      }
    }
    return true;
  };
  const vecMatches = (vecVal, expect) => {
    if (!isVector(vecVal)) return false;
    if (vecVal.items.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      const cell = vecVal.items[i];
      const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
      if (v !== expect[i]) return false;
    }
    return true;
  };


  // 2×3 matrix → three stack items: row1, row2, count(2.).
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('ROW→').fn(s);
    assert(s.depth === 3, `session051: ROW→ on 2×3 pushes 3 stack items (got depth ${s.depth})`);
    const cnt = s.pop();
    assert(cnt.type === 'real' && cnt.value.eq(2),
      'session051: ROW→ count is 2. on a 2×3 matrix');
    const row2 = s.pop();
    const row1 = s.pop();
    assert(vecMatches(row1, [1, 2, 3]) && vecMatches(row2, [4, 5, 6]),
      'session051: ROW→ pushes rows in top-to-bottom order');
  }

  // 1×1 edge case.
  {
    const s = new Stack();
    s.push(Matrix([[Real(42)]]));
    lookup('ROW→').fn(s);
    const cnt = s.pop();
    const row = s.pop();
    assert(cnt.type === 'real' && cnt.value.eq(1) && vecMatches(row, [42]),
      'session051: ROW→ on 1×1 gives [42] 1.');
  }

  // ROW→ on Vector throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    assertThrows(() => lookup('ROW→').fn(s), /Bad argument/, 'session051: ROW→ on Vector throws');
  }

  // ASCII alias ROW->.
  {
    const s = new Stack();
    s.push(Matrix([[Real(7), Real(8)], [Real(9), Real(10)]]));
    lookup('ROW->').fn(s);
    assert(s.depth === 3, 'session051: ROW-> ASCII alias matches ROW→');
  }


  // Three 3-vectors + count 3 → 3×3 matrix.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5), Real(6)]));
    s.push(Vector([Real(7), Real(8), Real(9)]));
    s.push(Integer(3));
    lookup('→ROW').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1,2,3],[4,5,6],[7,8,9]]),
      'session051: →ROW assembles 3 row vectors + 3 → 3×3');
  }

  // Round-trip: ROW→ then →ROW recovers the original.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
    lookup('ROW→').fn(s);
    lookup('→ROW').fn(s);
    const out = s.peek();
    assert(matMatches(out, [[1,2],[3,4],[5,6]]),
      'session051: ROW→ then →ROW round-trips a matrix');
  }

  // Non-integer count throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Real(1.5));
    assertThrows(() => lookup('→ROW').fn(s), /Bad argument/, 'session051: →ROW with non-integer Real count throws');
  }

  // Mismatched row length throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    s.push(Vector([Real(4), Real(5)]));                 // shorter
    s.push(Integer(2));
    assertThrows(() => lookup('→ROW').fn(s), /Invalid dimension/, 'session051: →ROW mismatched row lengths throws');
  }

  // Non-Vector argument throws.
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(2));
    s.push(Integer(2));
    assertThrows(() => lookup('→ROW').fn(s), /Bad argument/, 'session051: →ROW on non-vector args throws');
  }

  // ASCII alias ->ROW.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4)]));
    s.push(Integer(2));
    lookup('->ROW').fn(s);
    assert(matMatches(s.peek(), [[1,2],[3,4]]),
      'session051: ->ROW ASCII alias matches →ROW');
  }

  // Count < 1 throws.
  {
    const s = new Stack();
    s.push(Integer(0));
    assertThrows(() => lookup('→ROW').fn(s), /Bad argument value/, 'session051: →ROW count 0 throws');
  }


  // 2×3 → col1, col2, col3, count 3.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    lookup('COL→').fn(s);
    assert(s.depth === 4, 'session051: COL→ on 2×3 pushes 4 stack items');
    const cnt = s.pop();
    const col3 = s.pop();
    const col2 = s.pop();
    const col1 = s.pop();
    assert(cnt.type === 'real' && cnt.value.eq(3),
      'session051: COL→ count is 3. on a 2×3 matrix');
    assert(vecMatches(col1, [1, 4]) && vecMatches(col2, [2, 5]) && vecMatches(col3, [3, 6]),
      'session051: COL→ pushes columns in left-to-right order');
  }

  // ASCII alias COL->.
  {
    const s = new Stack();
    s.push(Matrix([[Real(11), Real(12)], [Real(13), Real(14)]]));
    lookup('COL->').fn(s);
    assert(s.depth === 3, 'session051: COL-> ASCII alias matches COL→');
  }

  // COL→ on non-Matrix throws.
  {
    const s = new Stack();
    s.push(Real(3));
    assertThrows(() => lookup('COL→').fn(s), /Bad argument/, 'session051: COL→ on Real throws');
  }


  // Two 2-vectors + count 2 → 2×2 matrix whose columns are v1, v2.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(3)]));      // col 1
    s.push(Vector([Real(2), Real(4)]));      // col 2
    s.push(Integer(2));
    lookup('→COL').fn(s);
    assert(matMatches(s.peek(), [[1,2],[3,4]]),
      'session051: →COL assembles columns into 2×2');
  }

  // Round-trip COL→ then →COL.
  {
    const s = new Stack();
    s.push(Matrix([[Real(10), Real(20), Real(30)], [Real(40), Real(50), Real(60)]]));
    lookup('COL→').fn(s);
    lookup('→COL').fn(s);
    assert(matMatches(s.peek(), [[10,20,30],[40,50,60]]),
      'session051: COL→ then →COL round-trips a matrix');
  }

  // Mismatched column heights throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4), Real(5)]));
    s.push(Integer(2));
    assertThrows(() => lookup('→COL').fn(s), /Invalid dimension/, 'session051: →COL mismatched column heights throws');
  }

  // ASCII alias ->COL.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4)]));
    s.push(Integer(2));
    lookup('->COL').fn(s);
    assert(matMatches(s.peek(), [[1,3],[2,4]]),
      'session051: ->COL ASCII alias matches →COL');
  }

  // session391: rejection-path closure for the four row/col ASCII aliases.
  // session051 gave →ROW/→COL/ROW→/COL→ their own rejection pins but the
  // `->ROW`/`->COL`/`ROW->`/`COL->` aliases had happy-path coverage only.
  // Each alias is registered with the SAME fn instance as its canonical
  // (`_rowCompose`/`_colCompose`/`_rowDecompose`/`_colDecompose`), so it
  // rejects identically — pin both the shared-instance identity and the
  // rejects so a refactor that splits the alias into its own
  // implementation and drops a guard is caught.
  {
    assert(lookup('->ROW').fn === lookup('→ROW').fn
        && lookup('->COL').fn === lookup('→COL').fn
        && lookup('ROW->').fn === lookup('ROW→').fn
        && lookup('COL->').fn === lookup('COL→').fn,
      'session391: row/col ASCII aliases share the canonical fn instance');

    // ->ROW mirrors →ROW's four rejects (compose path).
    {
      const s = new Stack();
      s.push(Vector([Real(1)]));
      s.push(Real(1.5));
      assertThrows(() => lookup('->ROW').fn(s), /Bad argument type/,
        'session391: ->ROW non-integer count → Bad argument type');
    }
    {
      const s = new Stack();
      s.push(Integer(0));
      assertThrows(() => lookup('->ROW').fn(s), /Bad argument value/,
        'session391: ->ROW count 0 → Bad argument value');
    }
    {
      const s = new Stack();
      s.push(Vector([Real(1), Real(2)]));
      s.push(Vector([Real(1)]));
      s.push(Integer(2));
      assertThrows(() => lookup('->ROW').fn(s), /Invalid dimension/,
        'session391: ->ROW mismatched row lengths → Invalid dimension');
    }
    {
      const s = new Stack();
      s.push(Real(1));
      s.push(Real(2));
      s.push(Integer(2));
      assertThrows(() => lookup('->ROW').fn(s), /Bad argument type/,
        'session391: ->ROW non-vector args → Bad argument type');
    }
    // ->COL mirrors →COL's mismatched-height reject (compose path).
    {
      const s = new Stack();
      s.push(Vector([Real(1), Real(2)]));
      s.push(Vector([Real(1)]));
      s.push(Integer(2));
      assertThrows(() => lookup('->COL').fn(s), /Invalid dimension/,
        'session391: ->COL mismatched column heights → Invalid dimension');
    }
    // ROW-> / COL-> mirror ROW→/COL→'s non-Matrix rejects (decompose path).
    {
      const s = new Stack();
      s.push(Vector([Real(1), Real(2)]));
      assertThrows(() => lookup('ROW->').fn(s), /Bad argument type/,
        'session391: ROW-> on Vector → Bad argument type');
    }
    {
      const s = new Stack();
      s.push(Real(5));
      assertThrows(() => lookup('COL->').fn(s), /Bad argument type/,
        'session391: COL-> on Real → Bad argument type');
    }
  }


  // 3×3 RSWP 1 3 swaps top and bottom rows.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)], [Real(7), Real(8), Real(9)]]));
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('RSWP').fn(s);
    assert(matMatches(s.peek(), [[7,8,9],[4,5,6],[1,2,3]]),
      'session051: RSWP 1 3 swaps top and bottom rows');
  }

  // RSWP i i is an identity (no-op).
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(1));
    s.push(Integer(1));
    lookup('RSWP').fn(s);
    assert(matMatches(s.peek(), [[1,2],[3,4]]),
      'session051: RSWP i i is an identity');
  }

  // OOB row index throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(1));
    s.push(Integer(5));
    assertThrows(() => lookup('RSWP').fn(s), /Invalid dimension/, 'session051: RSWP OOB row index throws');
  }

  // Non-Matrix throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Integer(1));
    s.push(Integer(2));
    assertThrows(() => lookup('RSWP').fn(s), /Bad argument/, 'session051: RSWP on Vector throws');
  }


  // 2×3 CSWP 1 3 swaps first and third columns.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('CSWP').fn(s);
    assert(matMatches(s.peek(), [[3,2,1],[6,5,4]]),
      'session051: CSWP 1 3 swaps first and third columns');
  }

  // CSWP OOB col index throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Integer(1));
    s.push(Integer(3));
    assertThrows(() => lookup('CSWP').fn(s), /Invalid dimension/, 'session051: CSWP OOB col index throws');
  }


  // RCI M 3 2 scales row 2 by 3.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
    s.push(Real(3));
    s.push(Integer(2));
    lookup('RCI').fn(s);
    assert(matMatches(s.peek(), [[1,2],[9,12],[5,6]]),
      'session051: RCI 3 2 scales row 2 by 3');
  }

  // RCI with zero scalar zeroes the row.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Real(0));
    s.push(Integer(1));
    lookup('RCI').fn(s);
    assert(matMatches(s.peek(), [[0,0],[3,4]]),
      'session051: RCI with c=0 zeroes the row');
  }

  // RCI with Integer scalar preserves Integer cells on an Integer input.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(1), Integer(2)], [Integer(3), Integer(4)]]));
    s.push(Integer(5));
    s.push(Integer(1));
    lookup('RCI').fn(s);
    const m = s.peek();
    assert(isInteger(m.rows[0][0]) && m.rows[0][0].value === 5n && m.rows[0][1].value === 10n,
      'session051: RCI Integer * Integer stays Integer');
  }

  // RCI with Complex scalar produces Complex cells.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Complex(0, 1));
    s.push(Integer(1));
    lookup('RCI').fn(s);
    const m = s.peek();
    assert(isComplex(m.rows[0][0]) && m.rows[0][0].re === 0 && m.rows[0][0].im === 1,
      'session051: RCI with i scalar lifts row to Complex');
  }

  // RCI OOB row index throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1)], [Real(2)]]));
    s.push(Real(2));
    s.push(Integer(9));
    assertThrows(() => lookup('RCI').fn(s), /Invalid dimension/, 'session051: RCI OOB row index throws');
  }

  // RCI with non-scalar c (Matrix) throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Matrix([[Real(1)]]));                // bad c
    s.push(Integer(1));
    assertThrows(() => lookup('RCI').fn(s), /Bad argument/, 'session051: RCI with non-scalar c throws');
  }


  // Classic Gauss elimination step: clear the (2,1) entry of
  // [[1 2][2 5]] by RCIJ c=−2 i=1 j=2  →  row2 = row2 − 2·row1.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(5)]]));
    s.push(Real(-2));
    s.push(Integer(1));
    s.push(Integer(2));
    lookup('RCIJ').fn(s);
    assert(matMatches(s.peek(), [[1,2],[0,1]]),
      'session051: RCIJ c=-2 i=1 j=2 clears (2,1) entry');
  }

  // RCIJ with c = 0 is a no-op.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Real(0));
    s.push(Integer(1));
    s.push(Integer(2));
    lookup('RCIJ').fn(s);
    assert(matMatches(s.peek(), [[1,2],[3,4]]),
      'session051: RCIJ c=0 is an identity');
  }

  // RCIJ with i === j: row_i becomes row_i * (1 + c) per HP50.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Real(2));
    s.push(Integer(2));
    s.push(Integer(2));
    lookup('RCIJ').fn(s);
    assert(matMatches(s.peek(), [[1,2],[9,12]]),
      'session051: RCIJ i===j scales row_i by 1+c (self-add)');
  }

  // RCIJ OOB index throws.
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    s.push(Real(1));
    s.push(Integer(1));
    s.push(Integer(5));
    assertThrows(() => lookup('RCIJ').fn(s), /Invalid dimension/, 'session051: RCIJ OOB row index throws');
  }

  // RCIJ with Complex scalar lifts the result row to Complex.  Every
  // cell in the destination row goes through _scalarBinary with a
  // Complex operand at least once (via c*row_i), so all cells come
  // out Complex — even the ones where src was zero.  Real(1) + i*0
  // folds to Complex(1, 0) rather than Real(1).
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(0)], [Real(0), Real(1)]]));
    s.push(Complex(0, 1));
    s.push(Integer(1));
    s.push(Integer(2));
    lookup('RCIJ').fn(s);
    const m = s.peek();
    // row2 = [0, 1] + i*[1, 0] = [i, 1].  Both cells are Complex.
    assert(isComplex(m.rows[1][0]) && m.rows[1][0].re === 0 && m.rows[1][0].im === 1 &&
           isComplex(m.rows[1][1]) && m.rows[1][1].re === 1 && m.rows[1][1].im === 0,
      'session051: RCIJ with Complex c lifts destination row to Complex');
  }

  // RCIJ on non-Matrix throws.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Real(1));
    s.push(Integer(1));
    s.push(Integer(2));
    assertThrows(() => lookup('RCIJ').fn(s), /Bad argument/, 'session051: RCIJ on Vector throws');
  }
}

/* ================================================================
   Stats reductions (TOT / MEAN / VAR / SDEV) over Vector / Matrix +
   test-matrix constructors (VANDERMONDE / HILBERT).
   ================================================================ */
{
  const approx = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
  const matMatches = (matVal, expect, tol = 1e-9) => {
    if (!isMatrix(matVal)) return false;
    if (matVal.rows.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      if (matVal.rows[i].length !== expect[i].length) return false;
      for (let j = 0; j < expect[i].length; j++) {
        const cell = matVal.rows[i][j];
        const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
        if (!approx(v, expect[i][j], tol)) return false;
      }
    }
    return true;
  };
  const vecMatches = (vecVal, expect, tol = 1e-9) => {
    if (!isVector(vecVal)) return false;
    if (vecVal.items.length !== expect.length) return false;
    for (let i = 0; i < expect.length; i++) {
      const cell = vecVal.items[i];
      const v = isInteger(cell) ? Number(cell.value) : cell.value.toNumber();
      if (!approx(v, expect[i], tol)) return false;
    }
    return true;
  };


  // Scalar sum of a Real Vector.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
    lookup('TOT').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(10),
      'session052: TOT of [1 2 3 4] → 10');
  }
  // Integer entries stay numeric; TOT wraps the sum as Real (pure number).
  {
    const s = new Stack();
    s.push(Vector([Integer(5), Integer(7), Integer(13)]));
    lookup('TOT').fn(s);
    const t = s.peek();
    assert((isReal(t) || isInteger(t))
        && (isInteger(t) ? t.value === 25n : t.value.eq(25)),
      'session052: TOT of Integer Vector → 25');
  }
  // Complex support: TOT sums real and imag parts independently.
  {
    const s = new Stack();
    s.push(Vector([Complex(1, 2), Complex(3, 4), Real(5)]));
    lookup('TOT').fn(s);
    const t = s.peek();
    assert(isComplex(t) && approx(t.re, 9) && approx(t.im, 6),
      'session052: TOT of Complex-containing Vector → (9, 6)');
  }
  // Column sums of a Matrix → Vector.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(2), Real(3)],
      [Real(4), Real(5), Real(6)],
    ]));
    lookup('TOT').fn(s);
    assert(vecMatches(s.peek(), [5, 7, 9]),
      'session052: TOT of 2×3 Matrix → per-column sums [5 7 9]');
  }
  // Empty Vector → Bad argument value.
  {
    const s = new Stack();
    s.push(Vector([]));
    assertThrows(() => lookup('TOT').fn(s), /Bad argument/, 'session052: TOT of empty Vector throws');
  }
  // TOT on a scalar throws Bad argument type.
  {
    const s = new Stack();
    s.push(Real(42));
    assertThrows(() => lookup('TOT').fn(s), /Bad argument/, 'session052: TOT on Real throws');
  }


  // Basic scalar mean of a Real Vector.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(4), Real(6), Real(8)]));
    lookup('MEAN').fn(s);
    assert(isReal(s.peek()) && approx(s.peek().value, 5),
      'session052: MEAN of [2 4 6 8] → 5');
  }
  // Mean of a Complex Vector returns Complex with per-component mean.
  {
    const s = new Stack();
    s.push(Vector([Complex(1, 2), Complex(3, 4)]));
    lookup('MEAN').fn(s);
    const m = s.peek();
    assert(isComplex(m) && approx(m.re, 2) && approx(m.im, 3),
      'session052: MEAN of [(1,2)(3,4)] → (2,3)');
  }
  // Per-column means of a Matrix.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(10)],
      [Real(3), Real(20)],
      [Real(5), Real(30)],
    ]));
    lookup('MEAN').fn(s);
    assert(vecMatches(s.peek(), [3, 20]),
      'session052: MEAN of 3×2 Matrix → [3 20] (per-column)');
  }
  // Single-element Vector: mean is the element itself.
  {
    const s = new Stack();
    s.push(Vector([Real(42)]));
    lookup('MEAN').fn(s);
    assert(approx(s.peek().value, 42),
      'session052: MEAN of [42] → 42');
  }
  // Symbolic entry → Bad argument type.
  {
    const s = new Stack();
    s.push(Vector([Real(1), Name('x')]));
    assertThrows(() => lookup('MEAN').fn(s), /Bad argument/, 'session052: MEAN of Vector with Name throws');
  }


  // Simple check: [2 4 6] → sample variance 4 (mean=4, ss=8, /n-1=2).
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(4), Real(6)]));
    lookup('VAR').fn(s);
    assert(isReal(s.peek()) && approx(s.peek().value, 4),
      'session052: VAR [2 4 6] → 4 (sample variance, n-1 denom)');
  }
  // Single-element Vector → 0 (HP50 defines SDEV of length-1 as 0, not NaN).
  {
    const s = new Stack();
    s.push(Vector([Real(42)]));
    lookup('VAR').fn(s);
    assert(approx(s.peek().value, 0),
      'session052: VAR of length-1 Vector → 0');
  }
  // Per-column variance on a 3×2 Matrix.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(10)],
      [Real(3), Real(20)],
      [Real(5), Real(30)],
    ]));
    lookup('VAR').fn(s);
    // col1: mean 3, deviations -2/0/2 → ss=8, /2 = 4
    // col2: mean 20, devs -10/0/10 → ss=200, /2 = 100
    assert(vecMatches(s.peek(), [4, 100]),
      'session052: VAR 3×2 Matrix → [4 100]');
  }
  // Complex entries rejected (policy: no conjugate convention baked in).
  {
    const s = new Stack();
    s.push(Vector([Real(1), Complex(2, 3)]));
    assertThrows(() => lookup('VAR').fn(s), /Bad argument/, 'session052: VAR of Complex-containing Vector throws');
  }
  // Empty Vector still rejected.
  {
    const s = new Stack();
    s.push(Vector([]));
    assertThrows(() => lookup('VAR').fn(s), /Bad argument/, 'session052: VAR of empty Vector throws');
  }


  // Same small sample as the VAR test: [2 4 6] → SDEV = 2.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(4), Real(6)]));
    lookup('SDEV').fn(s);
    assert(approx(s.peek().value, 2),
      'session052: SDEV [2 4 6] → 2 (sqrt of sample variance)');
  }
  // SDEV of length-1 Vector → 0.
  {
    const s = new Stack();
    s.push(Vector([Real(100)]));
    lookup('SDEV').fn(s);
    assert(approx(s.peek().value, 0),
      'session052: SDEV of length-1 Vector → 0');
  }
  // Per-column SDEV of a 3×2 Matrix.
  {
    const s = new Stack();
    s.push(Matrix([
      [Real(1), Real(10)],
      [Real(3), Real(20)],
      [Real(5), Real(30)],
    ]));
    lookup('SDEV').fn(s);
    assert(vecMatches(s.peek(), [2, 10]),
      'session052: SDEV 3×2 Matrix → [2 10] (sqrt of VAR result)');
  }
  // SDEV on Integer entries is fine (promoted through Real).
  {
    const s = new Stack();
    s.push(Vector([Integer(0), Integer(10)]));
    lookup('SDEV').fn(s);
    assert(approx(s.peek().value, Math.sqrt(50)),
      'session052: SDEV of Integer vector matches Real reduction');
  }
  // SDEV on a scalar throws Bad argument type.
  {
    const s = new Stack();
    s.push(Real(1));
    assertThrows(() => lookup('SDEV').fn(s), /Bad argument/, 'session052: SDEV on Real throws');
  }


  // Canonical example: {1 2 3} → [[1 1 1][1 2 4][1 3 9]].
  {
    const s = new Stack();
    s.push(RList([Integer(1), Integer(2), Integer(3)]));
    lookup('VANDERMONDE').fn(s);
    assert(matMatches(s.peek(), [[1, 1, 1], [1, 2, 4], [1, 3, 9]]),
      'session052: VANDERMONDE {1 2 3} → canonical 3×3');
  }
  // Accepts a Vector just like a List.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(5)]));
    lookup('VANDERMONDE').fn(s);
    assert(matMatches(s.peek(), [[1, 2], [1, 5]]),
      'session052: VANDERMONDE accepts Vector input');
  }
  // Length-1 input → 1×1 matrix [[1]].
  {
    const s = new Stack();
    s.push(RList([Real(7)]));
    lookup('VANDERMONDE').fn(s);
    assert(matMatches(s.peek(), [[1]]),
      'session052: VANDERMONDE {7} → [[1]]');
  }
  // Symbolic entries lift the result entries to Symbolic (no explosion).
  {
    const s = new Stack();
    s.push(RList([Name('X'), Name('Y')]));
    lookup('VANDERMONDE').fn(s);
    const M = s.peek();
    assert(isMatrix(M) && M.rows.length === 2 && M.rows[0].length === 2,
      'session052: VANDERMONDE of symbolic names → 2×2 Matrix');
    // First column is always 1 (Integer).
    assert(isInteger(M.rows[0][0]) && isInteger(M.rows[1][0]),
      'session052: VANDERMONDE first column stays Integer(1)');
    // Second column should be symbolic.
    assert(isSymbolic(M.rows[0][1]) && isSymbolic(M.rows[1][1]),
      'session052: VANDERMONDE second column lifts to Symbolic');
  }
  // Empty list rejected.
  {
    const s = new Stack();
    s.push(RList([]));
    assertThrows(() => lookup('VANDERMONDE').fn(s), /Bad argument/, 'session052: VANDERMONDE on empty list throws');
  }
  // Bad-entry type (String) rejected up-front.
  {
    const s = new Stack();
    s.push(RList([Real(1), Str('boom')]));
    assertThrows(() => lookup('VANDERMONDE').fn(s), /Bad argument/, 'session052: VANDERMONDE on list with String throws');
  }


  // n=3 → canonical Hilbert.
  {
    const s = new Stack();
    s.push(Integer(3));
    lookup('HILBERT').fn(s);
    assert(matMatches(s.peek(),
      [[1,    1/2, 1/3],
       [1/2,  1/3, 1/4],
       [1/3,  1/4, 1/5]], 1e-12),
      'session052: HILBERT 3 → classic 3×3 Hilbert matrix');
  }
  // n=1 → [[1]].
  {
    const s = new Stack();
    s.push(Integer(1));
    lookup('HILBERT').fn(s);
    assert(matMatches(s.peek(), [[1]]),
      'session052: HILBERT 1 → [[1]]');
  }
  // Real integer-valued also accepted.
  {
    const s = new Stack();
    s.push(Real(2));
    lookup('HILBERT').fn(s);
    assert(matMatches(s.peek(), [[1, 1/2], [1/2, 1/3]], 1e-12),
      'session052: HILBERT accepts integer-valued Real');
  }
  // n=0 rejected.
  {
    const s = new Stack();
    s.push(Integer(0));
    assertThrows(() => lookup('HILBERT').fn(s), /Bad argument/, 'session052: HILBERT 0 throws');
  }
  // Non-integer Real rejected.
  {
    const s = new Stack();
    s.push(Real(2.5));
    assertThrows(() => lookup('HILBERT').fn(s), /Bad argument/, 'session052: HILBERT 2.5 throws');
  }
  // Wrong type rejected.
  {
    const s = new Stack();
    s.push(Str('3'));
    assertThrows(() => lookup('HILBERT').fn(s), /Bad argument/, 'session052: HILBERT on String throws');
  }
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(3), Real(2), Real(5), Real(4)]));
  lookup('MEDIAN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(3),
    'session053: MEDIAN [1 3 2 5 4] = 3');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('MEDIAN').fn(s);
  assert(s.peek().value.eq(2.5),
    'session053: MEDIAN [1 2 3 4] = 2.5');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(10)],
    [Real(2), Real(20)],
    [Real(3), Real(30)],
  ]));
  lookup('MEDIAN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector' && v.items.length === 2 &&
         v.items[0].value.eq(2) && v.items[1].value.eq(20),
    'session053: MEDIAN 3×2 matrix → [2 20]');
}

{
  const s = new Stack();
  s.push(Vector([]));
  assertThrows(() => lookup('MEDIAN').fn(s), /Bad argument/, 'session053: MEDIAN [] throws');
}

{
  const s = new Stack();
  s.push(Vector([Complex(1, 2)]));
  assertThrows(() => lookup('MEDIAN').fn(s), /Bad argument/, 'session053: MEDIAN on Complex entry throws');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
  ]));
  lookup('COV').fn(s);
  assert(Math.abs(s.peek().value - 2) < 1e-12,
    'session053: COV perfectly linear data → 2');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
  ]));
  lookup('CORR').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12,
    'session053: CORR Y=2X → +1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(3)],
    [Real(2), Real(2)],
    [Real(3), Real(1)],
  ]));
  lookup('CORR').fn(s);
  assert(Math.abs(s.peek().value - (-1)) < 1e-12,
    'session053: CORR Y=-X → -1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(5)],
    [Real(1), Real(7)],
    [Real(1), Real(9)],
  ]));
  assertThrows(() => lookup('CORR').fn(s), /Infinite result/, 'session053: CORR zero-var throws Infinite result');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  assertThrows(() => lookup('COV').fn(s), /Bad argument/, 'session053: COV 1-row matrix throws');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2), Real(3)],
    [Real(4), Real(5), Real(6)],
  ]));
  assertThrows(() => lookup('COV').fn(s), /dimension/i, 'session053: COV 3-col matrix throws Invalid dimension');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  assertThrows(() => lookup('COV').fn(s), /Bad argument/, 'session053: COV on Vector throws Bad argument type');
}

/* ----------------------------------------------------------------
   session438: MEDIAN / COV / CORR / ΣXY element-level entry-coercion
   reject arms — the bivariate-accumulator complement of session431's
   TOT/MEAN/VAR/SDEV sweep.  All four coerce each element through
   `_statsNumericEntry` (ops.js ~10820, isReal/isInteger only), so a
   BinaryInteger element rejects with 'Bad argument type'.  Prior
   coverage only exercised container-level rejects (MEDIAN had a lone
   Complex-Vector reject; COV had 1-row / 3-col / Vector; ΣXY's
   container rejects live in test-stats) — a well-formed Vector/Matrix
   carrying a BinInt *element* was never exercised, so a refactor
   adding a sloppy `Number(x.value)` BinInt arm to `_statsNumericEntry`
   would silently flip reject→accept on the whole stats family.  The
   bivariate ops coerce via `_twoColsOrThrow` / `_matStatsCol`, so a
   reject fires from EITHER column.  Complex elements reject here too
   (these ops never widened to `_statsNumOrComplexEntry`, unlike
   TOT/MEAN) — pinned for COV/CORR/ΣXY to mirror MEDIAN's session053
   Complex reject.  Probed all arms live first (CAS-free): every BinInt
   and Complex element below → 'Bad argument type'. */
{
  const s = new Stack();
  s.push(Vector([Real(1), BinaryInteger(2n, 'h'), Real(3)]));
  assertThrows(() => lookup('MEDIAN').fn(s), /Bad argument type/,
    'session438: MEDIAN on Vector with a BinInt element → Bad argument type (_statsNumericEntry has no isBinaryInteger arm)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(10)], [BinaryInteger(2n, 'h'), Real(20)], [Real(3), Real(30)]]));
  assertThrows(() => lookup('MEDIAN').fn(s), /Bad argument type/,
    'session438: MEDIAN on Matrix with a BinInt column entry → Bad argument type (per-column coercion through _statsNumericEntry)');
}
{
  const s = new Stack();
  s.push(Matrix([[BinaryInteger(2n, 'h'), Real(2)], [Real(2), Real(4)], [Real(3), Real(6)]]));
  assertThrows(() => lookup('COV').fn(s), /Bad argument type/,
    'session438: COV with a BinInt x-column entry → Bad argument type (_twoColsOrThrow coerces col 0)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), BinaryInteger(2n, 'h')], [Real(2), Real(4)], [Real(3), Real(6)]]));
  assertThrows(() => lookup('COV').fn(s), /Bad argument type/,
    'session438: COV with a BinInt y-column entry → Bad argument type (_twoColsOrThrow coerces col 1 — symmetric)');
}
{
  const s = new Stack();
  s.push(Matrix([[Complex(1, 2), Real(2)], [Real(2), Real(4)], [Real(3), Real(6)]]));
  assertThrows(() => lookup('COV').fn(s), /Bad argument type/,
    'session438: COV with a Complex x-column entry → Bad argument type (no _statsNumOrComplexEntry widening, unlike TOT/MEAN)');
}
{
  const s = new Stack();
  s.push(Matrix([[BinaryInteger(2n, 'h'), Real(2)], [Real(2), Real(4)], [Real(3), Real(6)]]));
  assertThrows(() => lookup('CORR').fn(s), /Bad argument type/,
    'session438: CORR with a BinInt x-column entry → Bad argument type (shares _twoColsOrThrow with COV)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Complex(1, 2)], [Real(2), Real(4)], [Real(3), Real(6)]]));
  assertThrows(() => lookup('CORR').fn(s), /Bad argument type/,
    'session438: CORR with a Complex y-column entry → Bad argument type');
}
{
  const s = new Stack();
  s.push(Matrix([[BinaryInteger(2n, 'h'), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
  assertThrows(() => lookup('ΣXY').fn(s), /Bad argument type/,
    'session438: ΣXY with a BinInt x-column entry → Bad argument type (_matStatsCol on col 0)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), BinaryInteger(2n, 'h')], [Real(3), Real(4)], [Real(5), Real(6)]]));
  assertThrows(() => lookup('ΣXY').fn(s), /Bad argument type/,
    'session438: ΣXY with a BinInt y-column entry → Bad argument type (_matStatsCol on col 1 — symmetric)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Complex(1, 2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
  assertThrows(() => lookup('ΣXY').fn(s), /Bad argument type/,
    'session438: ΣXY with a Complex y-column entry → Bad argument type');
}

/* =================================================================
   LU decomposition, stats aggregates, regression.
   ================================================================= */

{
  const s = new Stack();
  s.push(Matrix([[Real(2), Real(3)], [Real(4), Real(7)]]));
  lookup('LU').fn(s);
  const P = s.pop(), U = s.pop(), L = s.pop();
  assert(isMatrix(L) && isMatrix(U) && isMatrix(P),
    'session054: LU returns three matrices');
  // Verify P*A = L*U.
  function mul(a, b) {
    const m = a.length, n = b[0].length, k = b.length;
    const out = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        let v = 0;
        for (let p = 0; p < k; p++) v += a[i][p] * b[p][j];
        row.push(v);
      }
      out.push(row);
    }
    return out;
  }
  const A = [[2, 3], [4, 7]];
  const Ln = L.rows.map(r => r.map(x => x.value));
  const Un = U.rows.map(r => r.map(x => x.value));
  const Pn = P.rows.map(r => r.map(x => x.value));
  const PA = mul(Pn, A);
  const LU = mul(Ln, Un);
  let ok = true;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    if (Math.abs(PA[i][j] - LU[i][j]) > 1e-9) ok = false;
  }
  assert(ok, 'session054: LU satisfies P·A = L·U');
  // L is unit lower triangular.
  assert(Math.abs(Ln[0][0] - 1) < 1e-12 && Math.abs(Ln[1][1] - 1) < 1e-12
         && Math.abs(Ln[0][1]) < 1e-12,
    'session054: LU L is unit-lower-triangular');
  // U is upper triangular.
  assert(Math.abs(Un[1][0]) < 1e-12,
    'session054: LU U is upper-triangular');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  assertThrows(() => lookup('LU').fn(s), /Infinite/, 'session054: LU singular matrix throws');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  assertThrows(() => lookup('LU').fn(s), /dimension/i, 'session054: LU non-square throws');
}

{
  const mk = () => Matrix([
    [Real(1), Real(2)],
    [Real(3), Real(4)],
    [Real(5), Real(6)],
  ]);
  {
    const s = new Stack(); s.push(mk()); lookup('NSIGMA').fn(s);
    assert(s.pop().value.eq(3), 'session054: NΣ 3×2 matrix → 3');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('ΣX').fn(s);
    assert(s.pop().value.eq(9), 'session054: ΣX → 9');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('ΣY').fn(s);
    assert(s.pop().value.eq(12), 'session054: ΣY → 12');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('ΣXY').fn(s);
    assert(s.pop().value.eq(44), 'session054: ΣXY → 44 (1·2+3·4+5·6)');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('ΣX2').fn(s);
    assert(s.pop().value.eq(35), 'session054: ΣX² → 35 (1+9+25)');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('ΣY2').fn(s);
    assert(s.pop().value.eq(56), 'session054: ΣY² → 56 (4+16+36)');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('MAXΣ').fn(s);
    const v = s.pop();
    assert(v.type === 'vector' && v.items[0].value.eq(5) && v.items[1].value.eq(6),
      'session054: MAXΣ → [5, 6]');
  }
  {
    const s = new Stack(); s.push(mk()); lookup('MINΣ').fn(s);
    const v = s.pop();
    assert(v.type === 'vector' && v.items[0].value.eq(1) && v.items[1].value.eq(2),
      'session054: MINΣ → [1, 2]');
  }
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('ΣY').fn(s), /dimension/i, 'session054: ΣY 1-col matrix throws dimension');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
    [Real(4), Real(8)],
  ]));
  lookup('LINFIT').fn(s);
  const r = s.pop(), sym = s.pop();
  assert(isSymbolic(sym), 'session054: LINFIT returns Symbolic');
  assert(Math.abs(r.value - 1) < 1e-12, 'session054: LINFIT perfect line → r=1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2 * Math.E)],
    [Real(2), Real(2 * Math.E * Math.E)],
    [Real(3), Real(2 * Math.E * Math.E * Math.E)],
  ]));
  lookup('EXPFIT').fn(s);
  const r = s.pop(), sym = s.pop();
  assert(isSymbolic(sym), 'session054: EXPFIT returns Symbolic');
  assert(Math.abs(r.value - 1) < 1e-9, 'session054: EXPFIT perfect fit → r≈1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(1)],
    [Real(2), Real(4)],
    [Real(3), Real(9)],
    [Real(4), Real(16)],
  ]));
  lookup('PWRFIT').fn(s);
  const r = s.pop();
  s.pop(); // sym
  assert(Math.abs(r.value - 1) < 1e-9, 'session054: PWRFIT x² perfect → r≈1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(Math.E), Real(5)],
    [Real(Math.E * Math.E), Real(8)],
  ]));
  lookup('LOGFIT').fn(s);
  const r = s.pop();
  s.pop();
  assert(Math.abs(r.value - 1) < 1e-9, 'session054: LOGFIT perfect fit → r≈1');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(-1), Real(2)], [Real(1), Real(4)]]));
  assertThrows(() => lookup('LOGFIT').fn(s), /Bad argument/, 'session054: LOGFIT negative X throws');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
    [Real(4), Real(8)],
  ]));
  lookup('BESTFIT').fn(s);
  const out = s.pop();
  assert(isString(out) && out.value === 'LIN',
    'session054: BESTFIT linear data → "LIN"');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(Math.exp(1))],
    [Real(2), Real(Math.exp(2))],
    [Real(3), Real(Math.exp(3))],
    [Real(4), Real(Math.exp(4))],
  ]));
  lookup('BESTFIT').fn(s);
  const out = s.pop();
  assert(isString(out) && out.value === 'EXP',
    'session054: BESTFIT exponential data → "EXP"');
}

/* ================================================================
   GRAMSCHMIDT / QR / CHOLESKY / RDM.

   Numeric-Matrix decompositions and reshape.  Helpers below do a
   small amount of matrix multiplication / transpose / equality so
   the tests can assert structural identities like Qᵀ·Q = I and
   Q·R = A without dragging the full ops stack in.
   ================================================================ */

function _matMul(A, B) {
  // A: m×k (row-major), B: k×n (row-major).  Returns m×n.
  const m = A.length, k = A[0].length, n = B[0].length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let p = 0; p < k; p++) acc += A[i][p] * B[p][j];
      row[j] = acc;
    }
    out.push(row);
  }
  return out;
}

function _matTranspose(A) {
  const m = A.length, n = A[0].length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(m);
    for (let i = 0; i < m; i++) row[i] = A[i][j];
    out.push(row);
  }
  return out;
}

function _matFromMatrixEntry(M) {
  // Pull raw JS numbers from Matrix of Real entries (Real .value is a
  // Decimal instance — coerce via .toNumber()).
  return M.rows.map(row => row.map(e => e.value.toNumber()));
}

function _approxMatEqual(A, B, tol) {
  tol = tol == null ? 1e-9 : tol;
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    if (A[i].length !== B[i].length) return false;
    for (let j = 0; j < A[i].length; j++) {
      if (Math.abs(A[i][j] - B[i][j]) > tol) return false;
    }
  }
  return true;
}

{
  const s = new Stack();
  const I = [[Real(1), Real(0)], [Real(0), Real(1)]];
  s.push(Matrix(I));
  lookup('GRAMSCHMIDT').fn(s);
  const Q = s.pop();
  assert(isMatrix(Q), 'session055: GRAMSCHMIDT returns Matrix');
  const Qn = _matFromMatrixEntry(Q);
  assert(_approxMatEqual(Qn, [[1, 0], [0, 1]]),
    'session055: GRAMSCHMIDT(I) = I');
}

{
  const s = new Stack();
  const A = [
    [Real(1), Real(1)],
    [Real(1), Real(0)],
    [Real(0), Real(1)],
  ];
  s.push(Matrix(A));
  lookup('GRAMSCHMIDT').fn(s);
  const Q = _matFromMatrixEntry(s.pop());
  // Qᵀ·Q should equal I₂.
  const QtQ = _matMul(_matTranspose(Q), Q);
  assert(_approxMatEqual(QtQ, [[1, 0], [0, 1]], 1e-9),
    'session055: GRAMSCHMIDT Qᵀ·Q = I₂ for 3×2 full-rank input');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
  ]));
  assertThrows(() => lookup('GRAMSCHMIDT').fn(s), /Infinite result/, 'session055: GRAMSCHMIDT dependent columns throws Infinite');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  assertThrows(() => lookup('GRAMSCHMIDT').fn(s), /Bad argument type/, 'session055: GRAMSCHMIDT non-Matrix rejected');
}

{
  const s = new Stack();
  const Araw = [
    [Real(1), Real(1)],
    [Real(1), Real(0)],
    [Real(0), Real(1)],
  ];
  s.push(Matrix(Araw));
  lookup('QR').fn(s);
  const P = _matFromMatrixEntry(s.pop());
  const R = _matFromMatrixEntry(s.pop());
  const Q = _matFromMatrixEntry(s.pop());
  const A = Araw.map(row => row.map(e => e.value.toNumber()));
  // Q·R == A.
  const QR = _matMul(Q, R);
  assert(_approxMatEqual(QR, A, 1e-9),
    'session055: QR reconstructs A (Q·R = A)');
  // Qᵀ·Q = I₂.
  const QtQ = _matMul(_matTranspose(Q), Q);
  assert(_approxMatEqual(QtQ, [[1, 0], [0, 1]], 1e-9),
    'session055: QR Q has orthonormal columns');
  // R upper-triangular.
  assert(Math.abs(R[1][0]) < 1e-12,
    'session055: QR R is upper-triangular');
  // P identity for no-pivot path.
  assert(_approxMatEqual(P, [[1, 0], [0, 1]], 1e-12),
    'session055: QR P = I (no pivoting)');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2), Real(3)],
    [Real(4), Real(5), Real(6)],
  ]));
  assertThrows(() => lookup('QR').fn(s), /Invalid dimension/, 'session055: QR rejects m<n (wide) matrix');
}

{
  const s = new Stack();
  const Araw = [[Real(4), Real(2)], [Real(2), Real(3)]];
  s.push(Matrix(Araw));
  lookup('CHOLESKY').fn(s);
  const L = _matFromMatrixEntry(s.pop());
  // L is lower-triangular.
  assert(Math.abs(L[0][1]) < 1e-12,
    'session055: CHOLESKY L is lower-triangular');
  // L·Lᵀ = A.
  const LLt = _matMul(L, _matTranspose(L));
  const A = Araw.map(row => row.map(e => e.value.toNumber()));
  assert(_approxMatEqual(LLt, A, 1e-9),
    'session055: CHOLESKY L·Lᵀ = A (2×2)');
}

{
  const s = new Stack();
  const Araw = [
    [Real(25), Real(15), Real(-5)],
    [Real(15), Real(18), Real(0)],
    [Real(-5), Real(0),  Real(11)],
  ];
  s.push(Matrix(Araw));
  lookup('CHOLESKY').fn(s);
  const L = _matFromMatrixEntry(s.pop());
  const LLt = _matMul(L, _matTranspose(L));
  const A = Araw.map(row => row.map(e => e.value.toNumber()));
  assert(_approxMatEqual(LLt, A, 1e-8),
    'session055: CHOLESKY L·Lᵀ = A (3×3)');
  // Classic textbook decomposition: L = [[5,0,0], [3,3,0], [-1,1,3]].
  assert(Math.abs(L[0][0] - 5) < 1e-9
      && Math.abs(L[1][0] - 3) < 1e-9 && Math.abs(L[1][1] - 3) < 1e-9
      && Math.abs(L[2][0] + 1) < 1e-9 && Math.abs(L[2][1] - 1) < 1e-9
      && Math.abs(L[2][2] - 3) < 1e-9,
    'session055: CHOLESKY 3×3 textbook factors');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(4), Real(2)], [Real(1), Real(3)]]));
  assertThrows(() => lookup('CHOLESKY').fn(s), /Bad argument value/, 'session055: CHOLESKY non-symmetric throws');
}

{
  const s = new Stack();
  // Symmetric, but negative leading minor (eigenvalues include 0).
  s.push(Matrix([[Real(1), Real(1)], [Real(1), Real(1)]]));
  assertThrows(() => lookup('CHOLESKY').fn(s), /Infinite result/, 'session055: CHOLESKY non-PD throws Infinite result');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(2), Real(4), Real(5)]]));
  assertThrows(() => lookup('CHOLESKY').fn(s), /Invalid dimension/, 'session055: CHOLESKY non-square throws');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4), Real(5), Real(6)]));
  s.push(RList([Real(2), Real(3)]));
  lookup('RDM').fn(s);
  const M = s.pop();
  assert(isMatrix(M) && M.rows.length === 2 && M.rows[0].length === 3,
    'session055: RDM Vector→Matrix shape');
  const expect = [[1, 2, 3], [4, 5, 6]];
  const got = _matFromMatrixEntry(M);
  assert(_approxMatEqual(got, expect, 1e-12),
    'session055: RDM Vector→Matrix row-major layout');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  s.push(RList([Real(6)]));
  lookup('RDM').fn(s);
  const V = s.pop();
  assert(isVector(V) && V.items.length === 6
         && V.items[0].value.eq(1) && V.items[5].value.eq(6),
    'session055: RDM Matrix→Vector row-major');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  s.push(RList([Real(3), Real(2)]));
  lookup('RDM').fn(s);
  const M = s.pop();
  const got = _matFromMatrixEntry(M);
  assert(_approxMatEqual(got, [[1, 2], [3, 4], [5, 6]], 1e-12),
    'session055: RDM Matrix→Matrix reshape');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(2), Real(2)]));
  assertThrows(() => lookup('RDM').fn(s), /Invalid dimension/, 'session055: RDM count mismatch throws');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(RList([Real(0), Real(2)]));
  assertThrows(() => lookup('RDM').fn(s), /Bad argument value/, 'session055: RDM zero dimension throws');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Complex(2, 3), Integer(4n), Real(5)]));
  s.push(RList([Real(2), Real(2)]));
  lookup('RDM').fn(s);
  const M = s.pop();
  assert(isMatrix(M) && M.rows.length === 2
         && M.rows[0][0].type === 'real' && M.rows[0][0].value.eq(1)
         && M.rows[0][1].type === 'complex'
         && M.rows[0][1].re === 2 && M.rows[0][1].im === 3
         && M.rows[1][0].type === 'integer' && M.rows[1][0].value === 4n
         && M.rows[1][1].type === 'real' && M.rows[1][1].value.eq(5),
    'session055: RDM preserves heterogeneous entries');
}

/* ================================================================
   LQ / COND.

   LQ is the row-analog of QR (m ≤ n); same _gramSchmidtNum helper
   applied to A^T, with output transposed back.  COND is the 1-norm
   condition number = CNRM(A) · CNRM(INV A); depends on existing INV
   and CNRM, so the tests can focus on the aggregate identity and
   boundary behavior (identity, diagonal, singular, non-square).
   The helpers _matMul / _matTranspose / _matFromMatrixEntry /
   _approxMatEqual defined above are reused.
   ================================================================ */

{
  const s = new Stack();
  const I = [[Real(1), Real(0)], [Real(0), Real(1)]];
  s.push(Matrix(I));
  lookup('LQ').fn(s);
  const P = _matFromMatrixEntry(s.pop());
  const Q = _matFromMatrixEntry(s.pop());
  const L = _matFromMatrixEntry(s.pop());
  assert(_approxMatEqual(L, [[1, 0], [0, 1]]) &&
         _approxMatEqual(Q, [[1, 0], [0, 1]]) &&
         _approxMatEqual(P, [[1, 0], [0, 1]]),
    'session056: LQ identity → (I, I, I)');
}

{
  const s = new Stack();
  const A = [[Real(1), Real(2), Real(2)], [Real(3), Real(4), Real(0)]];
  s.push(Matrix(A));
  lookup('LQ').fn(s);
  const P = _matFromMatrixEntry(s.pop());
  const Q = _matFromMatrixEntry(s.pop());
  const L = _matFromMatrixEntry(s.pop());
  // L is m×m = 2×2, Q is m×n = 2×3.
  assert(L.length === 2 && L[0].length === 2, 'session056: LQ L is 2×2');
  assert(Q.length === 2 && Q[0].length === 3, 'session056: LQ Q is 2×3');
  // L lower-triangular: L[0][1] = 0.
  assert(Math.abs(L[0][1]) < 1e-12, 'session056: LQ L is lower-triangular');
  // L · Q reconstructs A.
  const LQ = _matMul(L, Q);
  const Aplain = A.map(r => r.map(x => x.value));
  assert(_approxMatEqual(LQ, Aplain, 1e-9),
    'session056: LQ L·Q = A');
  // Q · Qᵀ = I_2.
  const QQt = _matMul(Q, _matTranspose(Q));
  assert(_approxMatEqual(QQt, [[1, 0], [0, 1]], 1e-9),
    'session056: LQ rows of Q are orthonormal');
  // P is identity in the no-pivot path.
  assert(_approxMatEqual(P, [[1, 0], [0, 1]], 1e-12),
    'session056: LQ P is identity (no row pivoting)');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)], [Real(5), Real(6)]]));
  assertThrows(() => lookup('LQ').fn(s), /Invalid dimension/, 'session056: LQ m > n throws Invalid dimension');
}

{
  const s = new Stack();
  // Two identical rows (row 2 = row 1) → Aᵀ has only 1 independent
  // column out of 2 → Gram-Schmidt produces a zero residual column.
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(1), Real(2), Real(3)]]));
  assertThrows(() => lookup('LQ').fn(s), /Infinite result/, 'session056: LQ rank-deficient rows throw Infinite result');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => lookup('LQ').fn(s), /Bad argument type/, 'session056: LQ non-Matrix throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(0), Real(0)],
                 [Real(0), Real(1), Real(0)],
                 [Real(0), Real(0), Real(1)]]));
  lookup('COND').fn(s);
  const k = s.pop();
  assert(k.type === 'real' && Math.abs(k.value - 1) < 1e-12,
    `session056: COND(I_3) = 1, got ${k.value}`);
}

{
  const s = new Stack();
  s.push(Matrix([[Real(2), Real(0)], [Real(0), Real(3)]]));
  lookup('COND').fn(s);
  const k = s.pop();
  // CNRM = 3, CNRM(INV) = 1/2, product = 1.5.
  assert(k.type === 'real' && Math.abs(k.value - 1.5) < 1e-12,
    `session056: COND(diag(2,3)) = 1.5, got ${k.value}`);
}

{
  // A = [[4,2],[1,3]], |detA|=10, A^-1 = [[0.3, -0.2],[-0.1, 0.4]]
  // CNRM(A) = max(4+1, 2+3) = 5
  // CNRM(A^-1) = max(0.3+0.1, 0.2+0.4) = 0.6
  // COND = 3
  const s = new Stack();
  s.push(Matrix([[Real(4), Real(2)], [Real(1), Real(3)]]));
  lookup('COND').fn(s);
  const k = s.pop();
  assert(k.type === 'real' && Math.abs(k.value - 3) < 1e-12,
    `session056: COND([[4,2][1,3]]) = 3, got ${k.value}`);
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));    // det = 0
  assertThrows(() => lookup('COND').fn(s), /Infinite result/, 'session056: COND singular throws Infinite result');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  assertThrows(() => lookup('COND').fn(s), /Invalid dimension/, 'session056: COND non-square throws Invalid dimension');
}

{
  const s = new Stack();
  s.push(Matrix([[Integer(1n), Integer(0n)], [Integer(0n), Integer(2n)]]));
  lookup('COND').fn(s);
  const k = s.pop();
  // CNRM=2, CNRM(A^-1)=1, product=2.
  assert(k.type === 'real' && Math.abs(k.value - 2) < 1e-12,
    `session056: COND(diag(1,2)) Integer entries = 2, got ${k.value}`);
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => lookup('COND').fn(s), /Bad argument type/, 'session056: COND non-Matrix throws Bad argument type');
}

/* ================================================================
   MAD (mean absolute deviation), AXL / AXM bridges.

   MAD lives in the stats family alongside MEAN / VAR / SDEV /
   MEDIAN (test block above); AXL / AXM are List ↔ Matrix / Vector
   bridges (HP50 AUR §15.2).
   ================================================================ */

{
  // [1 2 3 4 5] → mean=3 → |dev| = 2,1,0,1,2 → MAD = 6/5 = 1.2
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4), Real(5)]));
  lookup('MAD').fn(s);
  const m = s.pop();
  assert(m.type === 'real' && Math.abs(m.value - 1.2) < 1e-12,
    `session057: MAD [1..5] = 1.2, got ${m.value}`);
}

{
  const s = new Stack();
  s.push(Vector([Integer(2n), Integer(4n), Integer(4n), Integer(6n)]));
  // mean=4; |dev|=2,0,0,2; MAD = 4/4 = 1
  lookup('MAD').fn(s);
  const m = s.pop();
  assert(m.type === 'real' && Math.abs(m.value - 1) < 1e-12,
    `session057: MAD Integer Vec = 1, got ${m.value}`);
}

{
  const s = new Stack();
  s.push(Vector([Real(42)]));
  lookup('MAD').fn(s);
  const m = s.pop();
  assert(m.type === 'real' && m.value.eq(0),
    `session057: MAD [42] = 0, got ${m.value}`);
}

{
  const s = new Stack();
  s.push(Vector([]));
  assertThrows(() => lookup('MAD').fn(s), /Bad argument value/, 'session057: MAD on empty Vector throws');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(10)], [Real(2), Real(20)], [Real(3), Real(30)]]));
  lookup('MAD').fn(s);
  const v = s.pop();
  // col1 mean=2; |dev|=1,0,1; MAD = 2/3
  // col2 mean=20; |dev|=10,0,10; MAD = 20/3
  assert(v.type === 'vector' && v.items.length === 2,
    'session057: MAD Matrix → length-2 Vector');
  assert(Math.abs(v.items[0].value - 2 / 3) < 1e-12,
    `session057: MAD col1 = 2/3, got ${v.items[0].value}`);
  assert(Math.abs(v.items[1].value - 20 / 3) < 1e-12,
    `session057: MAD col2 = 20/3, got ${v.items[1].value}`);
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('MAD').fn(s), /Bad argument type/, 'session057: MAD on Real throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Vector([Complex(1, 2), Complex(3, 4)]));
  assertThrows(() => lookup('MAD').fn(s), /Bad argument type/, 'session057: MAD rejects Complex entries');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3)]));
  lookup('AXL').fn(s);
  const l = s.pop();
  assert(l.type === 'list' && l.items.length === 3,
    'session057: AXL Vector → List of 3');
  assert(l.items[0].type === 'real' && l.items[0].value.eq(1),
    'session057: AXL entry 0 preserved');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('AXL').fn(s);
  const l = s.pop();
  assert(l.type === 'list' && l.items.length === 2,
    'session057: AXL Matrix → 2-element List (one per row)');
  assert(l.items[0].type === 'list' && l.items[0].items.length === 2,
    'session057: AXL row is itself a List');
  assert(l.items[0].items[1].value.eq(2),
    'session057: AXL preserves (0,1) entry');
}

{
  const original = RList([Real(1), Real(2)]);
  const s = new Stack();
  s.push(original);
  lookup('AXL').fn(s);
  const l = s.pop();
  assert(l === original,
    'session057: AXL on List is identity (returns same object)');
}

{
  const s = new Stack();
  s.push(RList([Real(10), Real(20), Real(30)]));
  lookup('AXM').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 3,
    'session057: AXM flat List → length-3 Vector');
  assert(v.items[2].value.eq(30),
    'session057: AXM preserves entries');
}

{
  const s = new Stack();
  s.push(RList([
    RList([Real(1), Real(2), Real(3)]),
    RList([Real(4), Real(5), Real(6)]),
  ]));
  lookup('AXM').fn(s);
  const M = s.pop();
  assert(M.type === 'matrix' && M.rows.length === 2,
    'session057: AXM nested List → 2-row Matrix');
  assert(M.rows[0].length === 3 && M.rows[1][2].value.eq(6),
    'session057: AXM preserves (1,2) entry');
}

{
  const s = new Stack();
  s.push(RList([
    RList([Real(1), Real(2)]),
    RList([Real(3), Real(4), Real(5)]),
  ]));
  assertThrows(() => lookup('AXM').fn(s), /Invalid dimension/, 'session057: AXM on ragged nested list throws');
}

{
  const s = new Stack();
  s.push(RList([]));
  assertThrows(() => lookup('AXM').fn(s), /Bad argument value/, 'session057: AXM empty List throws');
}

{
  const v = Vector([Real(1), Real(2)]);
  const s = new Stack(); s.push(v);
  lookup('AXM').fn(s);
  assert(s.pop() === v, 'session057: AXM Vector is identity');
  const M = Matrix([[Real(1)]]);
  s.push(M);
  lookup('AXM').fn(s);
  assert(s.pop() === M, 'session057: AXM Matrix is identity');
}

{
  const s = new Stack();
  s.push(RList([Real(7), Real(8), Real(9)]));
  lookup('AXM').fn(s);
  lookup('AXL').fn(s);
  const l = s.pop();
  assert(l.type === 'list' && l.items.length === 3 && l.items[2].value.eq(9),
    'session057: AXL ∘ AXM round-trip preserves flat list');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('AXL').fn(s);
  lookup('AXM').fn(s);
  const M = s.pop();
  assert(M.type === 'matrix' && M.rows.length === 2 && M.rows[1][1].value.eq(4),
    'session057: AXM ∘ AXL round-trips Matrix shape');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('AXM').fn(s), /Bad argument type/, 'session057: AXM on Real throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('AXL').fn(s), /Bad argument type/, 'session057: AXL on Real throws Bad argument type');
}

/* ================================================================
   PREDV / PREDX (last-fit prediction).

   Every *FIT op publishes its model into state.lastFitModel,
   and PREDV / PREDX read that slot.  The tests here run one FIT
   op to seed the state, then call PREDV / PREDX to verify the
   round-trip.
   ================================================================ */

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
  ]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();   // drop model sym + r
  s.push(Real(5));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 10) < 1e-9,
    'session058: PREDV(5) after LINFIT y=2x → 10');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
  ]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(10));
  lookup('PREDX').fn(s);
  const x = s.pop();
  assert(isReal(x) && Math.abs(x.value - 5) < 1e-9,
    'session058: PREDX(10) after LINFIT y=2x → 5');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(0), Real(1)],
    [Real(1), Real(Math.E)],
    [Real(2), Real(Math.E * Math.E)],
  ]));
  lookup('EXPFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(1));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - Math.E) < 1e-6,
    'session058: PREDV(1) after EXPFIT y=e^x → e');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(0), Real(1)],
    [Real(1), Real(Math.E)],
    [Real(2), Real(Math.E * Math.E)],
  ]));
  lookup('EXPFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(Math.E));
  lookup('PREDX').fn(s);
  const x = s.pop();
  assert(isReal(x) && Math.abs(x.value - 1) < 1e-6,
    'session058: PREDX(e) after EXPFIT → 1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(0)],
    [Real(Math.E), Real(1)],
    [Real(Math.E * Math.E), Real(2)],
  ]));
  lookup('LOGFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(Math.E));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 1) < 1e-6,
    'session058: PREDV(e) after LOGFIT → 1');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(1)],
    [Real(2), Real(4)],
    [Real(3), Real(9)],
    [Real(4), Real(16)],
  ]));
  lookup('PWRFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(5));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 25) < 1e-6,
    'session058: PREDV(5) after PWRFIT y=x^2 → 25');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(1)],
    [Real(2), Real(4)],
    [Real(3), Real(9)],
    [Real(4), Real(16)],
  ]));
  lookup('PWRFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(25));
  lookup('PREDX').fn(s);
  const x = s.pop();
  assert(isReal(x) && Math.abs(x.value - 5) < 1e-6,
    'session058: PREDX(25) after PWRFIT y=x^2 → 5');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
  ]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(Integer(7n));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 14) < 1e-9,
    'session058: PREDV accepts Integer, returns Real(14)');
}

// session415: _fitScalar's BinaryInteger arm (ops.js ~15361) is unique among
// the special-function _*Scalar helpers — the rest reject BinInt — but every
// PREDV/PREDX pin fed Real or Integer (session058), so the BinInt branch was
// never positively exercised. A refactor folding it into the Integer arm, or
// dropping it, would make PREDV(#7h) throw 'Bad argument type' yet pass green.
// LINFIT y=2x seeds the slot; PREDV(#7h) → Real(14), PREDX(#16) → Real(8).
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(BinaryInteger(7n));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 14) < 1e-9,
    'session415: PREDV accepts BinInt #7h, returns Real(14)');
}

{
  // Base-cosmetic: #111b (binary 7) takes the same value-based BinInt arm.
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(BinaryInteger(7n, 'b'));
  lookup('PREDV').fn(s);
  const y = s.pop();
  assert(isReal(y) && Math.abs(y.value - 14) < 1e-9,
    'session415: PREDV accepts base-cosmetic BinInt #111b, returns Real(14)');
}

{
  // PREDX (inverse fit) feeds its operand through the same _fitScalar BinInt arm.
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(BinaryInteger(16n));
  lookup('PREDX').fn(s);
  const x = s.pop();
  assert(isReal(x) && Math.abs(x.value - 8) < 1e-9,
    'session415: PREDX accepts BinInt #16, returns Real(8)');
}

{
  // Clear the fit slot by routing through clearLastFitModel indirectly:
  // set a model then call a fresh test.  Actually we need to import
  // clearLastFitModel.  For now, use a fresh Stack and test the
  // throw by manually nulling the slot via the state module.
  // Tests run sequentially and share calcState — clear the slot
  // explicitly.
  calcState.lastFitModel = null;
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => lookup('PREDV').fn(s), /Undefined name/, 'session058: PREDV with no fit throws Undefined name');
}

{
  calcState.lastFitModel = null;
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => lookup('PREDX').fn(s), /Undefined name/, 'session058: PREDX with no fit throws Undefined name');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  s.push(Complex(1, 2));
  assertThrows(() => lookup('PREDV').fn(s), /Bad argument type/, 'session058: PREDV on Complex throws');
}

{
  const s = new Stack();
  s.push(Matrix([
    [Real(1), Real(0)],
    [Real(Math.E), Real(1)],
  ]));
  lookup('LOGFIT').fn(s);
  s.pop(); s.pop();
  s.push(Real(-1));
  assertThrows(() => lookup('PREDV').fn(s), /Infinite result/, 'session058: PREDV(-1) after LOGFIT → Infinite result');
}

{
  // Establish a known prior model.
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(2), Real(4)]]));
  lookup('LINFIT').fn(s);
  s.pop(); s.pop();
  const before = calcState.lastFitModel;
  assert(before && before.kind === 'LIN',
    'session058: LINFIT seeded lastFitModel');
  // BESTFIT with different data — confirm the LIN slot stays.
  const s2 = new Stack();
  s2.push(Matrix([
    [Real(1), Real(Math.exp(1))],
    [Real(2), Real(Math.exp(2))],
    [Real(3), Real(Math.exp(3))],
  ]));
  lookup('BESTFIT').fn(s2);
  s2.pop();
  assert(calcState.lastFitModel === before,
    'session058: BESTFIT does not overwrite lastFitModel');
  calcState.lastFitModel = null;
}
