import { parseUnitExpr, sameDims, uexprEqual, toBaseUexpr } from '../rpl/units.js';
import { isList, isName, isString, isTagged } from '../rpl/types.js';
import { format } from '../rpl/formatter.js';

export const MENU_FAMILIES = Object.freeze([
  { id: 'STACK', short: 'STACK', title: 'Stack', category: 'Stack' },
  { id: 'ARITH', short: 'ARITH', title: 'Arithmetic', category: 'Arithmetic' },
  { id: 'TIME', short: 'TIME', title: 'Time and dates', category: 'Time / dates', flagKeys: [[-41, '24H', '24-hour clock: TSTR writes 14:55:00'], [-42, 'D.M.Y', 'Day first: dates read and written as DD.MMYYYY']] },
  { id: 'TVM', short: 'TVM', title: 'Time value of money', category: 'Finance' },
  { id: 'TRIG', short: 'TRIG', title: 'Trig, log and exp', category: 'Trig / log / exp / hyperbolic' },
  { id: 'CPLX', short: 'CMPLX', title: 'Complex numbers', category: 'Complex / coordinates', keys: ['RE', 'IM', 'C→R', 'R→C', 'ABS', 'ARG', 'SIGN', 'NEG', 'CONJ', 'C→P', 'P→C', 'CMPLX', 'RECT', 'CYLIN', 'SPHERE', 'CMPLX?'] },
  { id: 'LOGIC', short: 'LOGIC', title: 'Comparisons and logic', category: 'Comparisons / logic', keys: ['==', '≠', '<', '>', '≤', '≥', 'AND', 'OR', 'XOR', 'NOT', 'SAME', 'TYPE', 'SF', 'CF', 'FS?', 'FC?', 'FS?C', 'FC?C'] },
  { id: 'INTEGER', short: 'INTGR', title: 'Integers', category: 'Integer / number theory', keys: ['DIVIS', 'FACTORS', 'PROPFRAC'] },
  { id: 'PROB', short: 'PROB', title: 'Probability', category: 'Probability / combinatorics', keys: ['COMB', 'PERM', '!', 'RAND', 'RDZ', 'UTPC', 'UTPF', 'UTPN', 'UTPT', 'NDIST'] },
  { id: 'POLY', short: 'POLY', title: 'Polynomials', category: 'Polynomials' },
  { id: 'CAS', short: 'CAS', title: 'Algebra (CAS)', category: 'CAS / symbolic' },
  { id: 'SPECIAL', short: 'SPECL', title: 'Special functions', category: 'Special functions' },
  { id: 'MATRIX', short: 'MATRX', title: 'Vectors and matrices', category: 'Vectors / matrices', keys: ['LSQ'] },
  { id: 'LIST', short: 'LIST', title: 'Lists and strings', category: 'Lists / strings', keys: ['OBJ→', '→LIST', 'SUB', 'REPL'] },
  { id: 'STAT', short: 'STAT', title: 'Statistics', category: 'Statistics' },
  { id: 'PLOT', short: 'PLOT', title: 'Plotting', category: 'Graphics' },
  { id: 'MEMORY', short: 'MEM', title: 'Variables and directories', category: 'Variables / directories' },
  { id: 'PROGRAM', short: 'PRG', title: 'Evaluation and programs', category: 'Evaluation / program' },
  { id: 'CONTROL', short: 'CTRL', title: 'Control flow and debugging', category: 'Control flow / debug' },
  { id: 'FLAGS', short: 'FLAGS', title: 'Flags', category: 'Flags' },
  { id: 'DISPLAY', short: 'DISP', title: 'Display and bases', category: 'Display / base' },
  { id: 'TYPES', short: 'TYPES', title: 'Types and tags', category: 'Types & tags', keys: ['OBJ→', '→ARRY', '→LIST', '→STR', '→TAG', '→UNIT', 'C→R', 'R→C', 'NUM', 'CHR', 'DTAG', 'EQ→', 'TYPE', 'VTYPE'] },
  { id: 'UNITS', short: 'UNITS', title: 'Units', category: 'Units' },
  { id: 'SYSTEM', short: 'SYS', title: 'System', category: 'System' },
  { id: 'MORE', short: 'MORE', title: 'Everything else', category: 'Other' },
]);

// The UNITS menu's keys, grouped and named as on the HP 50g. A key is any unit
// expression the parser reads, which is how area and volume get squares and cubes.
export const UNIT_GROUPS = Object.freeze([
  { id: 'LENG', title: 'Length', units: ['m', 'cm', 'mm', 'km', 'μm', 'nm', 'in', 'ft', 'yd', 'mi', 'nmi', 'mil', 'au', 'ly', 'pc', 'Mpc', 'Å', 'fermi', 'μ', 'ftUS', 'miUS', 'chain', 'rd', 'fath'] },
  { id: 'AREA', title: 'Area', units: ['m^2', 'cm^2', 'mm^2', 'km^2', 'in^2', 'ft^2', 'yd^2', 'mi^2', 'miUS^2', 'ha', 'a', 'acre', 'b'] },
  { id: 'VOL', title: 'Volume', units: ['m^3', 'cm^3', 'in^3', 'ft^3', 'yd^3', 'L', 'mL', 'gal', 'qt', 'pt', 'cup', 'ozfl', 'tbsp', 'tsp', 'galUK', 'galC', 'ozUK', 'bbl', 'bu', 'pk', 'fbm', 'st'] },
  { id: 'TIME', title: 'Time', units: ['s', 'ms', 'us', 'ns', 'min', 'h', 'd', 'yr', 'Hz', 'kHz', 'MHz', 'GHz'] },
  { id: 'SPEED', title: 'Speed', units: ['m/s', 'cm/s', 'ft/s', 'kph', 'mph', 'knot', 'c', 'ga'] },
  { id: 'MASS', title: 'Mass and amount', units: ['kg', 'g', 'mg', 'lb', 'oz', 'ton', 'tonUK', 'tonne', 't', 'ct', 'grain', 'ozt', 'lbt', 'slug', 'u', 'mol'] },
  { id: 'FORCE', title: 'Force', units: ['N', 'kN', 'lbf', 'kip', 'kgf', 'gf', 'dyn', 'pdl'] },
  { id: 'ENRG', title: 'Energy', units: ['J', 'kJ', 'MJ', 'cal', 'Kcal', 'Btu', 'eV', 'MeV', 'Wh', 'kWh', 'erg', 'ftlbf', 'therm'] },
  { id: 'POWR', title: 'Power', units: ['W', 'mW', 'kW', 'MW', 'GW', 'hp'] },
  { id: 'PRESS', title: 'Pressure', units: ['Pa', 'hPa', 'kPa', 'MPa', 'bar', 'atm', 'psi', 'torr', 'mmHg', 'inHg', 'inH2O'] },
  { id: 'TEMP', title: 'Temperature', units: ['K', '°C', '°F', '°R'] },
  { id: 'ELEC', title: 'Electricity', units: ['A', 'mA', 'V', 'mV', 'kV', 'Ω', 'kΩ', 'MΩ', 'C', 'Fdy', 'F', 'μF', 'nF', 'pF', 'H', 'mH', 'S', 'mho', 'T', 'Wb'] },
  { id: 'ANGL', title: 'Angle', units: ['°', 'r', 'grad', 'arcmin', 'arcs', 'sr'] },
  { id: 'LIGHT', title: 'Light', units: ['cd', 'lm', 'lx', 'ph', 'fc', 'sb', 'flam', 'lam'] },
  { id: 'RAD', title: 'Radiation', units: ['Bq', 'Ci', 'Gy', 'rad', 'Sv', 'rem', 'R'] },
  { id: 'VISC', title: 'Viscosity', units: ['P', 'cP', 'St', 'cSt'] },
]);

// What the HP's Constants Library (CONLIB) calls each constant.
export const CONSTANT_TITLES = Object.freeze({
  NA: "Avogadro's number", k: 'Boltzmann constant', Vm: 'Molar volume', R: 'Universal gas constant',
  StdT: 'Standard temperature', StdP: 'Standard pressure', 'σ': 'Stefan–Boltzmann constant', c: 'Speed of light',
  'ε0': 'Permittivity of a vacuum', 'μ0': 'Permeability of a vacuum', g: 'Acceleration of gravity', G: 'Gravitational constant',
  h: "Planck's constant", 'ħ': "Dirac's constant", q: 'Electronic charge', me: 'Electron mass',
  qme: 'q/me ratio', mp: 'Proton mass', mpme: 'mp/me ratio', 'α': 'Fine-structure constant',
  'ø': 'Magnetic flux quantum', F: 'Faraday constant', 'R∞': 'Rydberg constant', a0: 'Bohr radius',
  'μB': 'Bohr magneton', 'μN': 'Nuclear magneton', 'λ0': 'Photon wavelength', f0: 'Photon frequency',
  'λc': 'Compton wavelength', rad: '1 radian', 'twoπ': '2π radians', '∠': '∠ in trig mode', c3: "Wien's constant",
  kq: 'k/q', 'ε0q': 'ε0/q', 'qε0': 'q*ε0',
  'εsi': 'Dielectric constant of silicon', 'εox': 'Dielectric constant of SiO2', I0: 'Reference intensity',
});

// The HP's STAT menu opens on these folders; the whole family follows.
export const STAT_GROUPS = Object.freeze([
  { id: 'DATA', title: 'The statistics matrix', commands: ['Σ+', 'Σ-', 'CLΣ', 'RCLΣ', 'STOΣ'] },
  { id: 'ΣPAR', title: 'Columns and fit model', commands: ['XCOL', 'YCOL', 'COLΣ', 'LINFIT', 'LOGFIT', 'EXPFIT', 'PWRFIT', 'BESTFIT'] },
  { id: '1VAR', title: 'One-variable statistics', commands: ['TOT', 'MEAN', 'SDEV', 'MAXΣ', 'MINΣ', 'BINS', 'VAR', 'PSDEV', 'PVAR', 'MEDIAN', 'MAD'] },
  { id: 'PLOT', title: 'Plots of ΣDAT', commands: ['BARPLOT', 'HISTPLOT', 'SCATRPLOT'] },
  { id: 'FIT', title: 'Fits and predictions', commands: ['ΣLINE', 'LR', 'PREDX', 'PREDY', 'CORR', 'COV', 'PCOV', 'PREDV'] },
  { id: 'SUMS', title: 'Sums', commands: ['ΣX', 'ΣY', 'ΣX2', 'ΣY2', 'ΣXY', 'NΣ'] },
]);

// The HP's CAS menus as folders: ALG as the HP has it, and of S.SLV, CALC, TRIG and EXP&LN the commands the app has.
export const CAS_GROUPS = Object.freeze([
  { id: 'ALG', title: 'Algebra', commands: ['COLLECT', 'EXPAND', 'FACTOR', 'LNCOLLECT', 'LIN', 'PARTFRAC', 'SOLVE', 'SUBST', 'TEXPAND'] },
  { id: 'CALC', title: 'Calculus', commands: ['DERVX', 'INTVX', 'LIM', 'SERIES', 'TAYLOR0', 'TAYLR', 'DIVPC', 'TABVAL', 'DERIV', '∫', 'PREVAL', 'RISCH', 'IBP', 'SIGMA', 'SIGMAVX', 'FOURIER', 'LAPLACE', 'ILAP', 'DIV', 'CURL', 'LAPL', 'HESS', 'POTENTIAL', 'VPOTENTIAL'] },
  { id: 'S.SLV', title: 'Symbolic solver', commands: ['ISOL', 'LINSOLVE', 'SOLVEVX', 'SOLVE', 'ZEROS', 'ROOT', 'SYST2MAT'] },
  { id: 'TRIG', title: 'Trig rewrites', commands: ['HALFTAN', 'TAN2SC', 'TAN2SC2', 'TCOLLECT', 'TEXPAND', 'TLIN', 'ACOS2S', 'ASIN2C', 'ASIN2T', 'ATAN2S', 'TAN2CS2', 'COSSIN', 'TRIGCOS', 'TRIGSIN', 'TRIGTAN', 'SINCOS'] },
  { id: 'EXP&LN', title: 'Exponentials and logarithms', commands: ['EXPLN', 'EXP2HYP', 'EXP2POW', 'LIN', 'LNCOLLECT', 'TEXPAND', 'TSIMP'] },
]);

// The HP's MTH HYP folder: the hyperbolic functions in its order, with EXPM and LNP1.
export const TRIG_GROUPS = Object.freeze([
  { id: 'HYP', title: 'Hyperbolic functions', commands: ['SINH', 'ASINH', 'COSH', 'ACOSH', 'TANH', 'ATANH', 'EXPM', 'LNP1'] },
]);

// The HP's ARITH menu's INTEGER and MODULO folders, under its own key faces; DIVIS, FACTORS and PROPFRAC follow them.
export const INTEGER_GROUPS = Object.freeze([
  { id: 'INTEG', title: 'Integers', commands: ['EULER', 'IABCUV', 'ICHINREM', 'IDIV2', 'IEGCD', 'IQUOT', 'IREMAINDER', 'ISPRIME?', 'NEXTPRIME', 'PA2B2', 'PREVPRIME'] },
  { id: 'MODUL', title: 'Modular arithmetic', commands: ['ADDTMOD', 'DIVMOD', 'DIV2MOD', 'EXPANDMOD', 'FACTORMOD', 'GCDMOD', 'INVMOD', 'MOD', 'MODSTO', 'MULTMOD', 'POWMOD', 'SUBTMOD'] },
]);

// The HP's PRG LIST folders ELEM and PROC, and its PRG CHARS menu of string commands; OBJ→ →LIST SUB REPL follow them.
export const LIST_GROUPS = Object.freeze([
  { id: 'ELEM', title: 'List elements', commands: ['GET', 'GETI', 'PUT', 'PUTI', 'SIZE', 'POS', 'HEAD', 'TAIL'] },
  { id: 'PROC', title: 'List procedures', commands: ['DOLIST', 'DOSUBS', 'NSUB', 'ENDSUB', 'STREAM', 'REVLIST', 'ADD', 'SORT', 'SEQ'] },
  { id: 'CHARS', title: 'Strings', commands: ['SUB', 'REPL', 'POS', 'SIZE', 'NUM', 'CHR', 'OBJ→', '→STR', 'HEAD', 'TAIL', 'SREPL'] },
]);

// The HP's TIME menu's ALRM folder: the appointment alarms.
export const TIME_GROUPS = Object.freeze([
  { id: 'ALRM', title: 'Alarms', commands: ['ACK', 'ACKALL', 'STOALARM', 'RCLALARM', 'DELALARM', 'FINDALARM'] },
]);

// The HP's five-letter key faces for names that would break across a key's lines.
export const KEY_LABELS = Object.freeze({ ACKALL: 'ACKAL', STOALARM: 'STOAL', RCLALARM: 'RCLAL', DELALARM: 'DELAL', FINDALARM: 'FINDA', VANDERMONDE: 'VANDE' });

// The HP's MTH MATR folders, MAKE NORM FACTR COL ROW, with the commands of each that the app has; LSQ follows them.
export const MATRIX_GROUPS = Object.freeze([
  { id: 'MAKE', title: 'Make matrices', commands: ['CON', 'IDN', 'TRN', 'RDM', 'RANM', 'SIZE', 'VANDERMONDE', 'HILBERT', 'AUGMENT', '→DIAG', 'DIAG→'] },
  { id: 'NORM', title: 'Norms and measures', commands: ['ABS', 'RNRM', 'CNRM', 'COND', 'RANK', 'DET', 'TRACE'] },
  { id: 'FACTR', title: 'Factorizations', commands: ['LU', 'LQ', 'QR', 'SCHUR', 'CHOLESKY'] },
  { id: 'COL', title: 'Columns', commands: ['→COL', 'COL→', 'COL+', 'COL-', 'CSWP'] },
  { id: 'ROW', title: 'Rows', commands: ['→ROW', 'ROW→', 'ROW+', 'ROW-', 'RCI', 'RCIJ', 'RSWP'] },
]);

// The HP's BASE menu: the bases and conversions, then folders of bitwise logic and of bit and byte moves.
export const BASE_KEYS = Object.freeze(['HEX', 'DEC', 'OCT', 'BIN', 'R→B', 'B→R', 'LOGIC', 'BIT', 'BYTE', 'STWS', 'RCWS']);
export const BASE_GROUPS = Object.freeze([
  { id: 'LOGIC', title: 'Bitwise logic', commands: ['AND', 'OR', 'XOR', 'NOT'] },
  { id: 'BIT', title: 'Bit shifts and rotations', commands: ['RL', 'SL', 'ASR', 'SR', 'RR'] },
  { id: 'BYTE', title: 'Byte shifts and rotations', commands: ['RLB', 'SLB', 'SRB', 'RRB'] },
]);

// The HP's MTH VECTR menu, its coordinate modes marked while on.
export const VECTOR_KEYS = Object.freeze(['ABS', 'DOT', 'CROSS', 'V→', '→V2', '→V3', 'RECT', 'CYLIN', 'SPHERE']);

// Every UNITS key with uexpr's dimensions, in menu order, then the SI base form, the unit itself left out.
export function unitConversions(uexpr) {
  const targets = UNIT_GROUPS.flatMap((g) => g.units).map((u) => parseUnitExpr(u));
  targets.push(toBaseUexpr(uexpr).uexpr);
  const out = [];
  for (const t of targets) {
    if (sameDims(t, uexpr) && !uexprEqual(t, uexpr) && !out.some((o) => uexprEqual(o, t))) out.push(t);
  }
  return out;
}

export const OWN_MENUS = Object.freeze([
  { id: 'VARS', short: 'VARS', title: 'Variables in this directory' },
  { id: 'CST', short: 'CST', title: 'Your custom menu (CST)' },
  { id: 'MODES', short: 'MODES', title: 'Calculator modes' },
  { id: 'BRCH', short: 'BRCH', title: 'Program structures (IF, FOR, WHILE…)' },
  { id: 'BASE', short: 'BASE', title: 'Integer bases and bits' },
  { id: 'VECTOR', short: 'VECTR', title: 'Vectors and coordinate modes' },
]);

// The HP's PRG BRCH keys: each types its word, ⇦ its whole structure and ⇨ the structure's other form.
export const BRANCH_KEYS = Object.freeze([
  ['IF', ['IF', 'THEN', 'END'], ['IF', 'THEN', 'ELSE', 'END']],
  ['THEN'], ['ELSE'], ['END'],
  ['CASE', ['CASE', 'THEN', 'END', 'END'], ['THEN', 'END']],
  ['IFERR', ['IFERR', 'THEN', 'END'], ['IFERR', 'THEN', 'ELSE', 'END']],
  ['START', ['START', 'NEXT'], ['START', 'STEP']],
  ['FOR', ['FOR', 'NEXT'], ['FOR', 'STEP']],
  ['NEXT'], ['STEP'],
  ['DO', ['DO', 'UNTIL', 'END']],
  ['UNTIL'],
  ['WHILE', ['WHILE', 'REPEAT', 'END']],
  ['REPEAT'],
]);

export const MENU_GROUPS = Object.freeze([
  { title: 'Yours', ids: ['VARS', 'CST', 'MODES'] },
  { title: 'Math', ids: ['ARITH', 'TIME', 'TVM', 'TRIG', 'CPLX', 'CAS', 'POLY', 'MATRIX', 'VECTOR', 'STAT', 'INTEGER', 'BASE', 'PROB', 'SPECIAL', 'LOGIC'] },
  { title: 'Data and programs', ids: ['STACK', 'LIST', 'MEMORY', 'PROGRAM', 'BRCH', 'CONTROL', 'TYPES', 'UNITS', 'FLAGS', 'DISPLAY', 'PLOT', 'SYSTEM', 'MORE'] },
]);

export function menuById(id) {
  return OWN_MENUS.find((m) => m.id === id) ?? MENU_FAMILIES.find((m) => m.id === id) ?? null;
}

export function customMenuLabel(item) {
  if (isTagged(item)) return item.tag || format(item.value);
  if (isName(item)) return item.id;
  if (isString(item)) return item.value;
  return format(item);
}

// CHOOSE's choices: an object shows as itself and is the result; { display result } shows the first and returns the second.
export function chooseEntry(item) {
  const pair = isList(item) && item.items.length === 2;
  return { label: customMenuLabel(pair ? item.items[0] : item), value: pair ? item.items[1] : item };
}

// The HP's custom menu takes an object on its own, { "label" action } or { "label" { action ⇦action ⇨action } }.
export function customMenuEntry(item) {
  const pair = !isTagged(item) && isList(item) && item.items.length === 2 ? item.items : null;
  if (!pair) return { label: customMenuLabel(item), main: isTagged(item) ? item.value : item, left: null, right: null };
  const [label, action] = pair;
  const acts = isList(action) && (action.items.length === 2 || action.items.length === 3) ? action.items : [action];
  return { label: customMenuLabel(label), main: acts[0], left: acts[1] ?? null, right: acts[2] ?? null };
}
