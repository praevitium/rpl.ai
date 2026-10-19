import { isReal, Real, isInteger, Integer, isBinaryInteger, BinaryInteger, isRational, Rational, isComplex, Complex, isString, Str, isName, Name, isSymbolic, Symbolic, isList, RList, isVector, Vector, isMatrix, Matrix, isProgram, Program, isTagged, Tagged, isUnit, Unit } from '../types.js';
import { register } from './registry.js';
import { RPLError } from '../stack.js';
import { getUserKeys, setUserKeys, standardKeysActive } from '../state.js';



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
// The app passes in its build's version; the rpl core can't read the generated build-info.js.
let _version = 'rpl.ai';
export function setVersion(version) { _version = `rpl.ai ${version}`; }

register('VERSION', (s) => {
  s.push(Str(_version));
  s.push(Str('GPL-3.0-or-later. Giac © Bernard Parisse, Renée de Graeve and contributors'));
}, { category: 'System', categoryOrder: 0.5, label: "VERSION" });

// rpl.ai speaks English, the HP's language 0.
register('LANGUAGE→', (s) => {
  s.push(Real(0));
}, { category: 'System', categoryOrder: 0.6, label: 'LANGUAGE→' });

register('MEM', (s) => {
  s.push(Real(1073741824));
}, { category: 'System', categoryOrder: 0, label: "MEM" });


// The user keyboard: a key is rc.pf, row r 1 to 10 and column c as the 50g numbers them, shift plane p 1 to 6 (0 is 1)
// and f 1 for shift-and-hold; it is kept as rc.pf × 100. SKEY stands for a key's standard action and S for every one.
function _userKey(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('Bad argument type');
  const x = Number(v.value) * 100;
  const n = Math.round(x);
  const [r, c, p, f] = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10 || 1, n % 10];
  const valid = Math.abs(x - n) < 1e-6 && r >= 1 && r <= 10 && c >= 1 && c <= (r <= 3 ? 6 : 5) && p <= 6 && f <= 1;
  if (!valid) throw new RPLError('Bad argument value');
  return (r * 10 + c) * 100 + p * 10 + f;
}

const _isNamed = (v, id) => isName(v) && v.id === id;

function _assignKeys(pairs, standard) {
  const keys = new Map(getUserKeys());
  for (const [obj, key] of pairs) keys.set(key, obj);
  setUserKeys([...keys].filter(([, obj]) => !(standard && _isNamed(obj, 'SKEY'))), standard);
}

register('ASN', (s) => {
  const [obj, xkey] = s.popN(2);
  _assignKeys([[obj, _userKey(xkey)]], standardKeysActive());
}, { category: 'System', categoryOrder: 3, label: 'ASN' });

register('STOKEYS', (s) => {
  const [arg] = s.popN(1);
  if (_isNamed(arg, 'S')) { _assignKeys([], true); return; }
  if (!isList(arg)) throw new RPLError('Bad argument type');
  const restore = _isNamed(arg.items[0], 'S');
  const items = restore ? arg.items.slice(1) : arg.items;
  if (items.length % 2) throw new RPLError('Bad argument value');
  const pairs = items.filter((_, i) => i % 2 === 0).map((obj, i) => [obj, _userKey(items[2 * i + 1])]);
  _assignKeys(pairs, restore || standardKeysActive());
}, { category: 'System', categoryOrder: 3.1, label: 'STOKEYS' });

register('RCLKEYS', (s) => {
  const items = getUserKeys().flatMap(([key, obj]) => [obj, Real(key / 100)]);
  s.push(RList(standardKeysActive() ? [Name('S'), ...items] : items));
}, { category: 'System', categoryOrder: 3.2, label: 'RCLKEYS' });

// 0 clears every assignment and brings the standard keys back; S leaves only the assigned keys working in USER mode.
register('DELKEYS', (s) => {
  const [arg] = s.popN(1);
  if (_isNamed(arg, 'S')) { setUserKeys(getUserKeys(), false); return; }
  if ((isReal(arg) || isInteger(arg)) && Number(arg.value) === 0) { setUserKeys([], true); return; }
  const doomed = new Set((isList(arg) ? arg.items : [arg]).map(_userKey));
  setUserKeys(getUserKeys().filter(([key]) => !doomed.has(key)));
}, { category: 'System', categoryOrder: 3.3, label: 'DELKEYS' });
