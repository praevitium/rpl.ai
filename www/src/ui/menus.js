export const MENU_FAMILIES = Object.freeze([
  { id: 'STACK', short: 'STACK', title: 'Stack', category: 'Stack' },
  { id: 'ARITH', short: 'ARITH', title: 'Arithmetic', category: 'Arithmetic' },
  { id: 'TRIG', short: 'TRIG', title: 'Trig, log and exp', category: 'Trig / log / exp / hyperbolic' },
  { id: 'CPLX', short: 'CMPLX', title: 'Complex numbers', category: 'Complex / coordinates' },
  { id: 'LOGIC', short: 'LOGIC', title: 'Comparisons and logic', category: 'Comparisons / logic' },
  { id: 'INTEGER', short: 'INTGR', title: 'Integers', category: 'Integer / number theory' },
  { id: 'PROB', short: 'PROB', title: 'Probability', category: 'Probability / combinatorics' },
  { id: 'POLY', short: 'POLY', title: 'Polynomials', category: 'Polynomials' },
  { id: 'CAS', short: 'CAS', title: 'Algebra (CAS)', category: 'CAS / symbolic' },
  { id: 'SPECIAL', short: 'SPECL', title: 'Special functions', category: 'Special functions' },
  { id: 'MATRIX', short: 'MATRX', title: 'Vectors and matrices', category: 'Vectors / matrices' },
  { id: 'LIST', short: 'LIST', title: 'Lists and strings', category: 'Lists / strings' },
  { id: 'STAT', short: 'STAT', title: 'Statistics', category: 'Statistics' },
  { id: 'PLOT', short: 'PLOT', title: 'Plotting', category: 'Graphics' },
  { id: 'MEMORY', short: 'MEM', title: 'Variables and directories', category: 'Variables / directories' },
  { id: 'PROGRAM', short: 'PRG', title: 'Evaluation and programs', category: 'Evaluation / program' },
  { id: 'CONTROL', short: 'CTRL', title: 'Control flow and debugging', category: 'Control flow / debug' },
  { id: 'FLAGS', short: 'FLAGS', title: 'Flags', category: 'Flags' },
  { id: 'DISPLAY', short: 'DISP', title: 'Display and bases', category: 'Display / base' },
  { id: 'TYPES', short: 'TYPES', title: 'Types and tags', category: 'Types & tags' },
  { id: 'UNITS', short: 'UNITS', title: 'Units', category: 'Units' },
  { id: 'SYSTEM', short: 'SYS', title: 'System', category: 'System' },
  { id: 'MORE', short: 'MORE', title: 'Everything else', category: 'Other' },
]);

export const OWN_MENUS = Object.freeze([
  { id: 'VARS', short: 'VARS', title: 'Variables in this directory' },
  { id: 'CST', short: 'CST', title: 'Your custom menu (CST)' },
  { id: 'MODES', short: 'MODES', title: 'Calculator modes' },
]);

export const MENU_GROUPS = Object.freeze([
  { title: 'Yours', ids: ['VARS', 'CST', 'MODES'] },
  { title: 'Math', ids: ['ARITH', 'TRIG', 'CPLX', 'CAS', 'POLY', 'MATRIX', 'STAT', 'INTEGER', 'PROB', 'SPECIAL', 'LOGIC'] },
  { title: 'Data and programs', ids: ['STACK', 'LIST', 'MEMORY', 'PROGRAM', 'CONTROL', 'TYPES', 'UNITS', 'FLAGS', 'DISPLAY', 'PLOT', 'SYSTEM', 'MORE'] },
]);

export function menuById(id) {
  return OWN_MENUS.find((m) => m.id === id) ?? MENU_FAMILIES.find((m) => m.id === id) ?? null;
}

export function familyOfCategory(category) {
  return MENU_FAMILIES.find((f) => f.category === category) ?? null;
}
