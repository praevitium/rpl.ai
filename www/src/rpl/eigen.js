// Eigenvalues and eigenvectors of a real or complex square matrix, as LAPACK finds them: reduce to Hessenberg form, run the QR
// algorithm with Givens rotations and Wilkinson shifts down to the Schur form, and read the vectors off that. Entries are
// [re, im] pairs; eigenSystem hands back the values and the unit-length vectors in decreasing size of eigenvalue.

const EPS = Number.EPSILON;

const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cscale = (a, k) => [a[0] * k, a[1] * k];
const cconj = (a) => [a[0], -a[1]];
const cabs = (a) => Math.hypot(a[0], a[1]);

// Smith's division, which does not square a tiny divisor to zero.
function cdiv(a, b) {
  if (Math.abs(b[0]) >= Math.abs(b[1])) {
    const r = b[1] / b[0], d = b[0] + b[1] * r;
    return [(a[0] + a[1] * r) / d, (a[1] - a[0] * r) / d];
  }
  const r = b[0] / b[1], d = b[0] * r + b[1];
  return [(a[0] * r + a[1]) / d, (a[1] * r - a[0]) / d];
}

function csqrt(a) {
  const r = cabs(a);
  if (r === 0) return [0, 0];
  const t = Math.sqrt((r + Math.abs(a[0])) / 2);
  return a[0] >= 0 ? [t, a[1] / (2 * t)] : [Math.abs(a[1]) / (2 * t), a[1] >= 0 ? t : -t];
}

const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? [1, 0] : [0, 0])));

// H becomes upper Hessenberg by Householder reflections, each also folded into Q, so that A = Q H Q^H.
function hessenberg(H, Q, tick) {
  const n = H.length;
  for (let k = 0; k < n - 2; k++) {
    tick();
    let norm = 0;
    for (let i = k + 1; i < n; i++) norm += cabs(H[i][k]) ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const lead = cabs(H[k + 1][k]);
    const phase = lead === 0 ? [1, 0] : cscale(H[k + 1][k], 1 / lead);
    const v = Array.from({ length: n }, () => [0, 0]);
    for (let i = k + 1; i < n; i++) v[i] = H[i][k];
    v[k + 1] = cadd(v[k + 1], cscale(phase, norm));
    let vv = 0;
    for (let i = k + 1; i < n; i++) vv += cabs(v[i]) ** 2;
    if (vv === 0) continue;
    for (let j = 0; j < n; j++) {
      let s = [0, 0];
      for (let i = k + 1; i < n; i++) s = cadd(s, cmul(cconj(v[i]), H[i][j]));
      s = cscale(s, 2 / vv);
      for (let i = k + 1; i < n; i++) H[i][j] = csub(H[i][j], cmul(v[i], s));
    }
    for (const M of [H, Q]) {
      for (let i = 0; i < n; i++) {
        let s = [0, 0];
        for (let j = k + 1; j < n; j++) s = cadd(s, cmul(M[i][j], v[j]));
        s = cscale(s, 2 / vv);
        for (let j = k + 1; j < n; j++) M[i][j] = csub(M[i][j], cmul(s, cconj(v[j])));
      }
    }
    for (let i = k + 2; i < n; i++) H[i][k] = [0, 0];
  }
}

// The rotation [c s; -conj(s) c] that takes (a, b) to (r, 0), c real.
function givens(a, b) {
  const la = cabs(a), lb = cabs(b);
  if (lb === 0) return [1, [0, 0]];
  if (la === 0) return [0, cscale(cconj(b), 1 / lb)];
  const r = Math.hypot(la, lb);
  return [la / r, cscale(cmul(cscale(a, 1 / la), cconj(b)), 1 / r)];
}

// The shift: the eigenvalue of the window's trailing 2 x 2 nearer its last entry, or a jolt when the iteration lingers.
function shiftFor(H, hi, iteration) {
  const [a, b, c, d] = [H[hi - 1][hi - 1], H[hi - 1][hi], H[hi][hi - 1], H[hi][hi]];
  if (iteration % 10 === 0) return cadd(d, [cabs(c) + cabs(H[hi - 1][Math.max(hi - 2, 0)]), 0]);
  const half = cscale(csub(a, d), 0.5);
  const root = csqrt(cadd(cmul(half, half), cmul(b, c)));
  const first = csub(cadd(d, half), root), second = cadd(cadd(d, half), root);
  return cabs(csub(first, d)) <= cabs(csub(second, d)) ? first : second;
}

// Shifted QR steps on the Hessenberg H until it is upper triangular, the Schur form, with the rotations folded into Q.
function schur(H, Q, tick) {
  const n = H.length;
  let hi = n - 1, iteration = 0, steps = 0;
  while (hi > 0) {
    tick();
    let lo = hi;
    while (lo > 0) {
      const size = cabs(H[lo - 1][lo - 1]) + cabs(H[lo][lo]);
      if (cabs(H[lo][lo - 1]) <= EPS * (size || 1)) { H[lo][lo - 1] = [0, 0]; break; }
      lo--;
    }
    if (lo === hi) { hi--; iteration = 0; continue; }
    if (++steps > 100 * n) throw new Error('no convergence');
    iteration++;
    const mu = shiftFor(H, hi, iteration);
    for (let k = lo; k <= hi; k++) H[k][k] = csub(H[k][k], mu);
    const rotations = [];
    for (let k = lo; k < hi; k++) {
      const [c, s] = givens(H[k][k], H[k + 1][k]);
      rotations.push([c, s]);
      for (let j = k; j < n; j++) {
        const [x, y] = [H[k][j], H[k + 1][j]];
        H[k][j] = cadd(cscale(x, c), cmul(s, y));
        H[k + 1][j] = csub(cscale(y, c), cmul(cconj(s), x));
      }
    }
    for (let k = lo; k < hi; k++) {
      const [c, s] = rotations[k - lo];
      for (const [M, last] of [[H, Math.min(k + 2, hi)], [Q, n - 1]]) {
        for (let i = 0; i <= last; i++) {
          const [p, q] = [M[i][k], M[i][k + 1]];
          M[i][k] = cadd(cscale(p, c), cmul(cconj(s), q));
          M[i][k + 1] = csub(cscale(q, c), cmul(s, p));
        }
      }
    }
    for (let k = lo; k <= hi; k++) H[k][k] = cadd(H[k][k], mu);
  }
}

// A unit vector with its largest entry real and positive.
function unitVector(v) {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + cabs(x) ** 2, 0));
  if (norm === 0) return v;
  const w = v.map((x) => cscale(x, 1 / norm));
  let at = 0;
  w.forEach((x, i) => { if (cabs(x) > cabs(w[at]) * (1 + 1e-10)) at = i; });
  const phase = cscale(cconj(w[at]), 1 / cabs(w[at]));
  return w.map((x) => cmul(x, phase));
}

// An eigenvector of the triangular T for each of its diagonal entries by back substitution, carried back through Q.
function schurVectors(T, Q) {
  const n = T.length;
  const small = Math.max(EPS * Math.max(...T.flat().map(cabs)), Number.MIN_VALUE);
  return T.map((_, k) => {
    const y = Array.from({ length: n }, () => [0, 0]);
    y[k] = [1, 0];
    for (let i = k - 1; i >= 0; i--) {
      let sum = [0, 0];
      for (let j = i + 1; j <= k; j++) sum = cadd(sum, cmul(T[i][j], y[j]));
      let d = csub(T[i][i], T[k][k]);
      if (cabs(d) < small) d = [small, 0];
      y[i] = cdiv(cscale(sum, -1), d);
      const size = cabs(y[i]);
      if (size > 1e100) for (let j = i; j <= k; j++) y[j] = cscale(y[j], 1 / size);
    }
    return unitVector(Q.map((row) => row.slice(0, k + 1).reduce((s, x, j) => cadd(s, cmul(x, y[j])), [0, 0])));
  });
}

// Rounding dust, 3E-15 beside 0.75, is not part of the answer: a part far below the largest is zero.
const tidy = (list, scale) => list.map((x) => x.map((part) => (Math.abs(part) < 1e-13 * scale ? 0 : part)));

// rows: n x n [re, im] entries. Returns { values, vectors }: vectors[j] is the unit eigenvector of values[j], the values
// by decreasing size and, for equal size, increasing imaginary part. Throws Error('no convergence') if the iteration fails.
export function eigenSystem(rows, tick = () => {}) {
  const n = rows.length;
  const H = rows.map((row) => row.map((x) => [x[0], x[1]]));
  const Q = identity(n);
  hessenberg(H, Q, tick);
  schur(H, Q, tick);
  const values = H.map((row, i) => row[i]);
  const vectors = schurVectors(H, Q);
  const scale = Math.max(...values.map(cabs), Number.MIN_VALUE);
  const tie = (a, b) => Math.abs(a - b) <= 1e-12 * scale;
  const order = values.map((_, i) => i).sort((a, b) => {
    const [sa, sb] = [cabs(values[a]), cabs(values[b])];
    if (!tie(sa, sb)) return sb - sa;
    if (!tie(values[a][1], values[b][1])) return values[a][1] - values[b][1];
    return values[b][0] - values[a][0];
  });
  return {
    values: tidy(order.map((i) => values[i]), scale),
    vectors: order.map((i) => tidy(vectors[i], 1)),
  };
}
