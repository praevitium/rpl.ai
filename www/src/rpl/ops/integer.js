import { isInteger, isReal, Symbolic, Integer, Real, RList, Complex, isList } from '../types.js';
import { RPLError, checkTimeLimit } from '../stack.js';
import { Fn as AstFn, Bin as AstBin, Num as AstNum, Neg as AstNeg } from '../algebra.js';
import { getCasModulo, setCasModulo } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, astToGiac } from '../cas/giac-convert.mjs';
import { register, lookup } from './registry.js';
import { FALSE, TRUE, _astToRplValue, _bigFactorial, _pushCasResult, _gamma, _isSymOperand, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary, _withVMUnary } from './internal.js';



function _toBigInt(v) {
  if (isInteger(v)) return v.value;
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return BigInt(v.value.toFixed(0));
  }
  throw new RPLError('Bad argument type');
}

const _isIntLike = (v) => isInteger(v) || (isReal(v) && v.value.isInteger());

const _bigAbs = (x) => (x < 0n ? -x : x);

function _bigGcd(a, b) {
  a = _bigAbs(a);
  b = _bigAbs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function _extGcd(a, b) {
  let [r0, r1] = [_bigAbs(a), _bigAbs(b)];
  let [s0, s1] = [1n, 0n];
  let [t0, t1] = [0n, 1n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return { g: r0, u: a < 0n ? -s0 : s0, v: b < 0n ? -t0 : t0 };
}

function _mod(a, m) {
  const r = a % m;
  return r < 0n ? r + m : r;
}

// BigInt division truncates and % keeps the dividend's sign, which is the
// HP50 IDIV2 contract (MOD floors instead).
function _truncDiv(a, b) {
  if (b === 0n) throw new RPLError('Infinite result');
  return { q: a / b, r: a % b };
}

function _intBinaryOp(name, fn) {
  return _withTaggedBinary(_withListBinary((s) => {
    const [a, b] = s.popN(2);
    if (_isSymOperand(a) || _isSymOperand(b)) {
      const l = _toAst(a), r = _toAst(b);
      if (!l || !r) throw new RPLError('Bad argument type');
      s.push(Symbolic(AstFn(name, [l, r])));
      return;
    }
    s.push(Integer(fn(_toBigInt(a), _toBigInt(b))));
  }));
}


register('GCD', _intBinaryOp('GCD', _bigGcd), { category: 'Integer / number theory', categoryOrder: 0, label: "GCD" });

register('LCM', _intBinaryOp('LCM', (a, b) => (a === 0n || b === 0n ? 0n : _bigAbs(a / _bigGcd(a, b) * b))), { category: 'Integer / number theory', categoryOrder: 1, label: "LCM" });

register('FACT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) {
    s.push(Symbolic(AstFn('FACT', [_toAst(v)])));
    return;
  }
  if (isInteger(v)) {
    if (v.value < 0n) throw new RPLError('Bad argument value');
    s.push(Integer(_bigFactorial(v.value)));
    return;
  }
  if (isReal(v)) {
    const x = v.value.toNumber();
    if (Number.isInteger(x) && x < 0) throw new RPLError('Infinite result');
    if (Number.isInteger(x)) {
      s.push(Integer(_bigFactorial(BigInt(x))));
      return;
    }
    s.push(Real(_gamma(x + 1)));
    return;
  }
  throw new RPLError('Bad argument type');
}))), { category: 'Integer / number theory', categoryOrder: 2, label: "FACT" });


register('IDIV2', (s) => {
  const [a, b] = s.popN(2);
  const { q, r } = _truncDiv(_toBigInt(a), _toBigInt(b));
  s.push(Integer(q));
  s.push(Integer(r));
}, { category: 'Integer / number theory', categoryOrder: 15, label: "IDIV2" });


register('IQUOT', _intBinaryOp('IQUOT', (a, b) => _truncDiv(a, b).q), { category: 'Integer / number theory', categoryOrder: 16, label: "IQUOT" });

register('IREMAINDER', _intBinaryOp('IREMAINDER', (a, b) => _truncDiv(a, b).r), { category: 'Integer / number theory', categoryOrder: 17, label: "IREMAINDER" });


register('EUCLID', (s) => {
  const [a, b] = s.popN(2);
  const ba = _toBigInt(a);
  const bb = _toBigInt(b);
  if (ba === 0n && bb === 0n) throw new RPLError('Bad argument value');
  const { g, u, v } = _extGcd(ba, bb);
  s.push(RList([Integer(u), Integer(v), Integer(g)]));
}, { category: 'Integer / number theory', categoryOrder: 14, label: "EUCLID" });


function _invMod(a, m) {
  const r = _mod(a, m);
  if (r === 0n) throw new RPLError('Bad argument value');
  const { g, u } = _extGcd(r, m);
  if (g !== 1n) throw new RPLError('Bad argument value');
  return _mod(u, m);
}


// Unlike the HP50, which reads the MODULO setting, INVMOD takes the
// modulus from level 1 so programs can use any modulus.
register('INVMOD', (s) => {
  const [a, n] = s.popN(2);
  const ba = _toBigInt(a);
  const m = _bigAbs(_toBigInt(n));
  if (m < 2n) throw new RPLError('Bad argument value');
  s.push(Integer(_invMod(ba, m)));
}, { category: 'Integer / number theory', categoryOrder: 24, label: "INVMOD" });


// Integer results of the MODULO ops are centered (5 mod 7 is -2), which is
// how the HP50 examples and Giac's polynomial results print them.
function _centerMod(a, m) {
  const r = _mod(a, m);
  return 2n * r > m ? r - m : r;
}

function _giacModAsts(...vals) {
  const asts = vals.map(_toAst);
  if (asts.includes(null)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  return asts;
}

function _modBinary(intOp, giacOp) {
  return (s) => {
    const [a, b] = s.popN(2);
    const m = getCasModulo();
    if (_isIntLike(a) && _isIntLike(b)) {
      s.push(Integer(_centerMod(intOp(_toBigInt(a), _toBigInt(b)), m)));
      return;
    }
    const [l, r] = _giacModAsts(a, b);
    _pushCasResult(s, giacToAst(giac.caseval(`(${astToGiac(AstBin(giacOp, l, r))}) mod ${m}`)));
  };
}

function _modUnary(giacFn) {
  return (s) => {
    const v = s.pop();
    const m = getCasModulo();
    if (_isIntLike(v)) {
      s.push(Integer(_centerMod(_toBigInt(v), m)));
      return;
    }
    const [a] = _giacModAsts(v);
    s.push(_astToRplValue(giacToAst(giac.caseval(`${giacFn}(${astToGiac(a)}) mod ${m}`))));
  };
}


register('MODSTO', (s) => {
  const [v] = s.popN(1);
  if (!_isIntLike(v)) throw new RPLError('Bad argument type');
  setCasModulo(_toBigInt(v));
}, { category: 'Integer / number theory', categoryOrder: 19, label: "MODSTO" });


register('ADDTMOD', _modBinary((a, b) => a + b, '+'), { category: 'Integer / number theory', categoryOrder: 20, label: "ADDTMOD" });

register('SUBTMOD', _modBinary((a, b) => a - b, '-'), { category: 'Integer / number theory', categoryOrder: 21, label: "SUBTMOD" });

register('MULTMOD', _modBinary((a, b) => a * b, '*'), { category: 'Integer / number theory', categoryOrder: 22, label: "MULTMOD" });


register('POWMOD', (s) => {
  const [a, e] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(e)) {
    const ba = _toBigInt(a);
    const be = _toBigInt(e);
    if (be < 0n) throw new RPLError('Bad argument value');
    s.push(Integer(_centerMod(_powModBig(ba, be, m), m)));
    return;
  }
  const [l, r] = _giacModAsts(a, e);
  _pushCasResult(s, giacToAst(giac.caseval(`powmod(${astToGiac(l)},${astToGiac(r)},${m})`)));
}, { category: 'Integer / number theory', categoryOrder: 23, label: "POWMOD" });


register('EXPANDMOD', _modUnary('expand'), { category: 'Integer / number theory', categoryOrder: 28, label: "EXPANDMOD" });


const _factorMod = _modUnary('factor');

register('FACTORMOD', (s) => {
  const m = getCasModulo();
  // AUR p.3-83: the modulus must be a prime below 100.
  if (m >= 100n || !_isPrimeBig(m)) throw new RPLError('Bad argument value');
  _factorMod(s);
}, { category: 'Integer / number theory', categoryOrder: 29, label: "FACTORMOD" });


register('GCDMOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    const ba = _toBigInt(a);
    const bb = _toBigInt(b);
    if (ba === 0n && bb === 0n) throw new RPLError('Bad argument value');
    s.push(Integer(_centerMod(_bigGcd(ba, bb), m)));
    return;
  }
  const [l, r] = _giacModAsts(a, b);
  s.push(_astToRplValue(giacToAst(giac.caseval(`gcd(${astToGiac(l)},${astToGiac(r)}) mod ${m}`))));
}, { category: 'Integer / number theory', categoryOrder: 27, label: "GCDMOD" });


// An exact integer quotient wins even when b has no inverse mod m
// (User Guide p.5-14: 12/3 is 4 mod 12, but 12/8 does not exist).
function _modDiv(a, b, m) {
  if (b === 0n) throw new RPLError('Bad argument value');
  if (a % b === 0n) return a / b;
  return a * _invMod(b, m);
}


register('DIVMOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    s.push(Integer(_centerMod(_modDiv(_toBigInt(a), _toBigInt(b), m), m)));
    return;
  }
  const [l, r] = _giacModAsts(a, b);
  s.push(_astToRplValue(giacToAst(giac.caseval(`(${astToGiac(l)})/(${astToGiac(r)}) mod ${m}`))));
}, { category: 'Integer / number theory', categoryOrder: 25, label: "DIVMOD" });


register('DIV2MOD', (s) => {
  const [a, b] = s.popN(2);
  const m = getCasModulo();
  if (_isIntLike(a) && _isIntLike(b)) {
    const ba = _toBigInt(a);
    const bb = _toBigInt(b);
    const q = _centerMod(_modDiv(ba, bb, m), m);
    s.push(Integer(q));
    s.push(Integer(_centerMod(ba - q * bb, m)));
    return;
  }
  const [l, r] = _giacModAsts(a, b);
  const lStr = astToGiac(l), rStr = astToGiac(r);
  s.push(_astToRplValue(giacToAst(giac.caseval(`quo(${lStr},${rStr}) mod ${m}`))));
  s.push(_astToRplValue(giacToAst(giac.caseval(`rem(${lStr},${rStr}) mod ${m}`))));
}, { category: 'Integer / number theory', categoryOrder: 26, label: "DIV2MOD" });


register('!', (s) => { lookup('FACT').fn(s); }, { category: 'Integer / number theory', categoryOrder: 3, label: "!" });


function _powModBig(a, e, m) {
  if (m === 1n) return 0n;
  let r = 1n;
  a = _mod(a, m);
  while (e > 0n) {
    if (e & 1n) r = (r * a) % m;
    e >>= 1n;
    a = (a * a) % m;
  }
  return r;
}


const _SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

// Miller-Rabin with these witnesses is deterministic below 3.3e24.
function _isPrimeBig(n) {
  if (n < 2n) return false;
  for (const p of _SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, s = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; s += 1n; }
  outer:
  for (const a of _SMALL_PRIMES) {
    let x = _powModBig(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let r = 1n; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}


function _nextPrimeBig(n) {
  if (n < 2n) return 2n;
  let c = n + 1n;
  if ((c & 1n) === 0n) c += 1n;
  while (!_isPrimeBig(c)) {
    checkTimeLimit();
    c += 2n;
  }
  return c;
}


function _prevPrimeBig(n) {
  if (n <= 3n) return n === 3n ? 2n : null;
  let c = (n & 1n) === 0n ? n - 1n : n - 2n;
  while (!_isPrimeBig(c)) {
    checkTimeLimit();
    c -= 2n;
  }
  return c;
}


function _factorIntBig(n) {
  const out = [];
  const divideOut = (p) => {
    let k = 0n;
    while (n % p === 0n) { n /= p; k++; }
    if (k > 0n) out.push([p, k]);
  };
  for (const p of [2n, 3n, 5n]) {
    if (n < p * p) break;
    divideOut(p);
  }
  // Step through the residues coprime to 30.
  const wheelAdds = [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n];
  for (let p = 7n, w = 0; p * p <= n; p += wheelAdds[w++ % 8]) {
    checkTimeLimit();
    divideOut(p);
  }
  if (n > 1n) out.push([n, 1n]);
  return out;
}


function _divisorsBig(n) {
  let divs = [1n];
  for (const [p, e] of _factorIntBig(n)) {
    const next = [];
    let pk = 1n;
    for (let k = 0n; k <= e; k++) {
      for (const d of divs) next.push(d * pk);
      pk *= p;
    }
    divs = next;
  }
  return divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}


register('ISPRIME?', (s) => {
  const [v] = s.popN(1);
  s.push(_isPrimeBig(_toBigInt(v)) ? TRUE : FALSE);
}, { category: 'Integer / number theory', categoryOrder: 7, label: "ISPRIME?" });


register('NEXTPRIME', (s) => {
  const [v] = s.popN(1);
  s.push(Integer(_nextPrimeBig(_toBigInt(v))));
}, { category: 'Integer / number theory', categoryOrder: 8, label: "NEXTPRIME" });


register('PREVPRIME', (s) => {
  const [v] = s.popN(1);
  const p = _prevPrimeBig(_toBigInt(v));
  if (p === null) throw new RPLError('Bad argument value');
  s.push(Integer(p));
}, { category: 'Integer / number theory', categoryOrder: 9, label: "PREVPRIME" });


function _bigIntSqrtFloor(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  let prev;
  do {
    prev = x;
    x = (x + n / x) >> 1n;
  } while (x < prev);
  return prev;
}


// Cornacchia: with r² ≡ -1 (mod p), the Euclidean remainders of (p, r)
// first drop to √p or below at some b, and p - b² is then a square.
register('PA2B2', (s) => {
  const [v] = s.popN(1);
  const p = _toBigInt(v);
  if (!_isPrimeBig(p)) throw new RPLError('Bad argument value');
  if (p === 2n) {
    s.push(Complex(1, 1));
    return;
  }
  if (p % 4n !== 1n) throw new RPLError('Bad argument value');
  const pm1 = p - 1n;
  let z = 2n;
  while (_powModBig(z, pm1 >> 1n, p) !== pm1) z += 1n;
  const sp = _bigIntSqrtFloor(p);
  let a = p, b = _powModBig(z, pm1 >> 2n, p);
  while (b > sp) [a, b] = [b, a % b];
  const rem = p - b * b;
  const c = _bigIntSqrtFloor(rem);
  if (c * c !== rem) throw new RPLError('Bad argument value');
  s.push(Complex(Number(c < b ? c : b), Number(c < b ? b : c)));
}, { category: 'Integer / number theory', categoryOrder: 18, label: "PA2B2" });


register('EULER', (s) => {
  const [v] = s.popN(1);
  const n = _toBigInt(v);
  if (n <= 0n) throw new RPLError('Bad argument value');
  let phi = n;
  for (const [p] of _factorIntBig(n)) phi = phi / p * (p - 1n);
  s.push(Integer(phi));
}, { category: 'Integer / number theory', categoryOrder: 6, label: "EULER" });


register('DIVIS', (s) => {
  const [v] = s.popN(1);
  const n = _toBigInt(v);
  if (n === 0n) throw new RPLError('Bad argument value');
  s.push(RList(_divisorsBig(_bigAbs(n)).map((d) => Integer(d))));
}, { category: 'Integer / number theory', categoryOrder: 4, label: "DIVIS" });


register('FACTORS', (s) => {
  const [v] = s.popN(1);
  const n = _toBigInt(v);
  if (n <= 0n) throw new RPLError('Bad argument value');
  s.push(RList(_factorIntBig(n).flatMap(([p, e]) => [Integer(p), Integer(e)])));
}, { category: 'Integer / number theory', categoryOrder: 5, label: "FACTORS" });


function _ratNormalize(n, d) {
  const g = _bigGcd(n, d);
  return [n / g, d / g];
}

function _ratSub([an, ad], [bn, bd]) {
  return _ratNormalize(an * bd - bn * ad, ad * bd);
}

function _ratToSymbolic(n, d) {
  if (d === 1n) return Symbolic(AstNum(n));
  const frac = AstBin('/', AstNum(n < 0n ? -n : n), AstNum(d));
  return Symbolic(n < 0n ? AstNeg(frac) : frac);
}


register('IBERNOULLI', (s) => {
  const [v] = s.popN(1);
  const nBig = _toBigInt(v);
  // The exact rational work grows as n², so n is capped.
  if (nBig < 0n || nBig > 100n) throw new RPLError('Bad argument value');
  const n = Number(nBig);
  if (n >= 3 && n % 2 === 1) {
    s.push(Symbolic(AstNum(0)));
    return;
  }
  // Akiyama-Tanigawa: A[j-1] = j·(A[j-1] - A[j]), leaving B(n) in A[0].
  const a = [];
  for (let m = 0; m <= n; m++) {
    a[m] = [1n, BigInt(m + 1)];
    for (let j = m; j >= 1; j--) {
      const [dn, dd] = _ratSub(a[j - 1], a[j]);
      a[j - 1] = _ratNormalize(BigInt(j) * dn, dd);
    }
  }
  // The recurrence gives B(1) = +1/2; the HP50 uses -1/2.
  const [num, den] = a[0];
  s.push(_ratToSymbolic(n === 1 ? -num : num, den));
}, { category: 'Integer / number theory', categoryOrder: 11, label: "IBERNOULLI" });


register('IEGCD', (s) => {
  const [av, bv] = s.popN(2);
  const { g, u, v } = _extGcd(_toBigInt(av), _toBigInt(bv));
  s.push(Integer(u));
  s.push(Integer(v));
  s.push(Integer(g));
}, { category: 'Integer / number theory', categoryOrder: 13, label: "IEGCD" });


function _intPair(list) {
  if (!isList(list) || list.items.length !== 2) throw new RPLError('Bad argument type');
  return [_toBigInt(list.items[0]), _toBigInt(list.items[1])];
}


register('ICHINREM', (s) => {
  const [l1, l2] = s.popN(2);
  const [a, m] = _intPair(l1);
  const [b, n] = _intPair(l2);
  if (m === 0n || n === 0n) throw new RPLError('Bad argument value');
  const mAbs = _bigAbs(m);
  const nAbs = _bigAbs(n);
  const { g, u } = _extGcd(mAbs, nAbs);
  const diff = b - a;
  if (diff % g !== 0n) throw new RPLError('Bad argument value');
  const lcm = (mAbs / g) * nAbs;
  s.push(RList([Integer(_mod(a + mAbs * u * (diff / g), lcm)), Integer(lcm)]));
}, { category: 'Integer / number theory', categoryOrder: 12, label: "ICHINREM" });


register('IABCUV', (s) => {
  const [av, bv, cv] = s.popN(3);
  const a = _toBigInt(av);
  const b = _toBigInt(bv);
  const c = _toBigInt(cv);
  const { g, u, v } = _extGcd(a, b);
  if (g === 0n) {
    if (c !== 0n) throw new RPLError('Bad argument value');
    s.push(Integer(0n));
    s.push(Integer(0n));
    return;
  }
  if (c % g !== 0n) throw new RPLError('Bad argument value');
  s.push(Integer(u * (c / g)));
  s.push(Integer(v * (c / g)));
}, { category: 'Integer / number theory', categoryOrder: 10, label: "IABCUV" });
