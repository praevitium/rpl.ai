import { registerReservedName } from '../types.js';

export const OPS = new Map();

export function register(name, fn, opts = {}) {
  const key = String(name).toUpperCase();
  OPS.set(key, { fn, label: name, ...opts });
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
