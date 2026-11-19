import { registerReservedName } from '../types.js';

export const OPS = new Map();

// What a command may be used for follows from its family unless its
// registration says otherwise with `previewable` or `callable`.
//   previewable  it only reads the stack, so its result can be shown before it is run.
//   callable     it only turns arguments into a result, so 'FACTOR(X^2-1)' runs it inside an algebraic.
const PREVIEWABLE_CATEGORIES = new Set([
  'Stack', 'Arithmetic', 'Trig / log / exp / hyperbolic', 'Complex / coordinates',
  'Comparisons / logic', 'Integer / number theory', 'Special functions',
  'Vectors / matrices', 'Lists / strings', 'Units', 'Types & tags',
]);
const WRITES_STATE_OR_RANDOM = new Set([
  'UNDO', 'REDO', 'LASTSTACK', 'LASTARG', 'LAST', 'RAND', 'RDZ', 'RANM',
  'DEG', 'RAD', 'GRAD', 'GRD', 'RECT', 'CYLIN', 'SPHERE', 'CMPLX', 'MODSTO',
]);
const CALLABLE_CATEGORIES = new Set(['CAS / symbolic', 'Polynomials', 'Vectors / matrices', 'Integer / number theory']);

export function register(name, fn, opts = {}) {
  const key = String(name).toUpperCase();
  if (OPS.has(key)) throw new Error(`register: ${key} is already registered`);
  OPS.set(key, {
    fn,
    label: name,
    previewable: PREVIEWABLE_CATEGORIES.has(opts.category) && !WRITES_STATE_OR_RANDOM.has(key),
    callable: CALLABLE_CATEGORIES.has(opts.category),
    ...opts,
    name,
  });
  registerReservedName(name);
}

export function lookup(name) {
  return OPS.get(String(name).toUpperCase());
}

export function hasOp(name) {
  return OPS.has(String(name).toUpperCase());
}

export function allOps() {
  return [...OPS.keys()].sort();
}

const CATEGORY_ORDER = [
  "Stack",
  "Arithmetic",
  "Trig / log / exp / hyperbolic",
  "Complex / coordinates",
  "Comparisons / logic",
  "Integer / number theory",
  "Probability / combinatorics",
  "Polynomials",
  "CAS / symbolic",
  "Special functions",
  "Vectors / matrices",
  "Lists / strings",
  "Statistics",
  "Graphics",
  "Variables / directories",
  "Evaluation / program",
  "Control flow / debug",
  "Flags",
  "Display / base",
  "Types & tags",
  "Units",
  "System"
];

export function opCategories() {
  const groups = new Map(CATEGORY_ORDER.map((cat) => [cat, []]));
  for (const op of OPS.values()) {
    if (!op.category) continue;
    if (!groups.has(op.category)) groups.set(op.category, []);
    groups.get(op.category).push(op);
  }
  const out = {};
  for (const [cat, ops] of groups) {
    if (!ops.length) continue;
    ops.sort((a, b) => (a.categoryOrder ?? 1e9) - (b.categoryOrder ?? 1e9)
      || String(a.label).localeCompare(String(b.label)));
    out[cat] = ops.map((op) => op.label);
  }
  return out;
}
