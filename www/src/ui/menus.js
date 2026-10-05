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

