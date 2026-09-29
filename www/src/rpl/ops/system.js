import { isReal, Real, isInteger, Integer, isBinaryInteger, BinaryInteger, isRational, Rational, isComplex, Complex, isString, Str, isName, Name, isSymbolic, Symbolic, isList, RList, isVector, Vector, isMatrix, Matrix, isProgram, Program, isTagged, Tagged, isUnit, Unit } from '../types.js';
import { register } from './registry.js';



// There is no binary object encoding to measure, so BYTES estimates the size from
// the JSON form plus the HP50's 5-byte prologue.
function _sizeEstimate(v) {
  try {
    const s = JSON.stringify(v, (_k, val) =>
      typeof val === 'bigint' ? val.toString() + 'n' : val);
    return (s ? s.length : 0) + 5;
  } catch (_e) {
    return 5;
  }
}


// Directories are live containers and Grobs have their own copy ops, so both
// pass through NEWOB unchanged.
function _newObCopy(v) {
  if (isReal(v))    return Real(v.value);
  if (isInteger(v)) return Integer(v.value);
  if (isBinaryInteger(v)) return BinaryInteger(v.value, v.base);
  if (isRational(v)) return Rational(v.n, v.d);
  if (isComplex(v)) return Complex(v.re, v.im);
  if (isString(v))  return Str(v.value);
  if (isName(v))    return Name(v.id, { local: v.local, quoted: v.quoted });
  if (isSymbolic(v)) return Symbolic(v.expr);
  if (isList(v))    return RList(v.items.slice());
  if (isVector(v))  return Vector(v.items.slice());
  if (isMatrix(v))  return Matrix(v.rows.map(r => r.slice()));
  if (isProgram(v)) return Program(v.tokens);
  if (isTagged(v))  return Tagged(v.tag, v.value);
  if (isUnit(v))    return Unit(v.value, v.uexpr);
  return v;
}


// No CRC is computed, so the checksum on level 2 is always 0.
register('BYTES', (s) => {
  const [v] = s.popN(1);
  const size = _sizeEstimate(v);
  s.push(Integer(0n));
  s.push(Integer(BigInt(size)));
}, { category: 'System', categoryOrder: 1, label: "BYTES" });


register('NEWOB', (s) => {
  const [v] = s.popN(1);
  s.push(_newObCopy(v));
}, { category: 'System', categoryOrder: 2, label: "NEWOB" });


// There is no bounded memory pool to measure; a fixed 1 GiB keeps MEM
// comparisons predictable.
register('MEM', (s) => {
  s.push(Real(1073741824));
}, { category: 'System', categoryOrder: 0, label: "MEM" });
