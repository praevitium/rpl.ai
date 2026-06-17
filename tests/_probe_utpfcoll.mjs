import { Stack } from './../www/src/rpl/stack.js';
import { lookup } from './../www/src/rpl/ops.js';
import { Integer, Real, RList, Vector, Matrix } from './../www/src/rpl/types.js';

const utpf = lookup('UTPF').fn;
function t(label, n, d, F) {
  const s = new Stack();
  s.push(n); s.push(d); s.push(F);
  try { utpf(s); console.log(label, '=> NO THROW, top=', JSON.stringify(s.peek())); }
  catch (e) { console.log(label, '=> throws:', e.message); }
}
const L = () => RList([Integer(2n), Integer(3n)]);
const V = () => Vector([Real(1), Real(2)]);
const M = () => Matrix([[Real(1), Real(2)]]);
const I = (k) => Integer(BigInt(k));
// collection in F (variate) position, n/d valid
t('List F', I(5), I(10), L());
t('Vector F', I(5), I(10), V());
t('Matrix F', I(5), I(10), M());
// collection in n position
t('List n', L(), I(10), I(3));
t('Vector n', V(), I(10), I(3));
t('Matrix n', M(), I(10), I(3));
// collection in d position
t('List d', I(5), L(), I(3));
