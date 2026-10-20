import { isName, isString, isUnit, Real, Unit, Symbolic } from '../types.js';
import { Fn as AstFn } from '../algebra.js';
import { RPLError } from '../stack.js';
import { testUserFlag, inScratchState, varRecall } from '../state.js';
import { toBaseUexpr, sameDims, convertValue, divideUexpr, multiplyUexpr, parseUnitExpr } from '../units.js';
import { register } from './registry.js';
import { molarMass } from '../elements.js';
import { _inUnit, _isSymOperand, _makeUnit, _numVal, _scalarBinary, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary } from './internal.js';



// The AUR's function form: 'symb' UVAL is 'UVAL(symb)', worked out when EVAL reaches a unit.
function _symbolicCall(name, s) {
  const [v] = s.popN(1);
  s.push(Symbolic(AstFn(name, [_toAst(v)])));
}

register('UVAL', _withTaggedUnary(_withListUnary((s) => {
  if (_isSymOperand(s.peek(1))) return _symbolicCall('UVAL', s);
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Real(u.value));
})), { category: 'Units', categoryOrder: 0, label: "UVAL" });


register('UBASE', _withTaggedUnary(_withListUnary((s) => {
  if (_isSymOperand(s.peek(1))) return _symbolicCall('UBASE', s);
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const { uexpr } = toBaseUexpr(u.uexpr);
  s.push(_makeUnit(convertValue(u.value, u.uexpr, uexpr), uexpr));
})), { category: 'Units', categoryOrder: 1, label: "UBASE" });


register('→UNIT', (s) => {
  const [x, u] = s.popN(2);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Unit(_numVal(x), u.uexpr));
}, { category: 'Units', categoryOrder: 2, label: "→UNIT" });


// Only the second unit's expression matters, not its value.
register('CONVERT', (s) => {
  const [u1, u2] = s.popN(2);
  if (!isUnit(u1) || !isUnit(u2)) throw new RPLError('Bad argument type');
  if (!sameDims(u1.uexpr, u2.uexpr)) throw new RPLError('Inconsistent units');
  s.push(Unit(_inUnit(u1, u2.uexpr), u2.uexpr));
}, { category: 'Units', categoryOrder: 3, label: "CONVERT" });


// 1_W 1_N UFACT is 1_N*m/s: the units of level 2 as the unit of level 1 times what is left.
register('UFACT', (s) => {
  const [u, factor] = s.popN(2);
  if (!isUnit(u) || !isUnit(factor)) throw new RPLError('Bad argument type');
  const uexpr = multiplyUexpr(factor.uexpr, divideUexpr(toBaseUexpr(u.uexpr).uexpr, toBaseUexpr(factor.uexpr).uexpr));
  s.push(Unit(_inUnit(u, uexpr), uexpr));
}, { category: 'Units', categoryOrder: 4, label: "UFACT" });


// A change of temperature, not a temperature: the second reading is converted to the
// first one's scale, and an increment is converted as a difference.
function _temperatureStep(sign) {
  return _withTaggedBinary(_withListBinary((s) => {
    const [x, y] = s.popN(2);
    if (isUnit(x) && isUnit(y)) {
      if (!sameDims(x.uexpr, y.uexpr)) throw new RPLError('Inconsistent units');
      const other = sign < 0 ? _inUnit(y, x.uexpr) : _inUnit(y, x.uexpr, { difference: true });
      s.push(_makeUnit(x.value + sign * other, x.uexpr));
      return;
    }
    if (isUnit(x) || isUnit(y)) throw new RPLError('Bad argument type');
    s.push(_scalarBinary(sign < 0 ? '-' : '+', x, y));
  }));
}

register('TDELTA', _temperatureStep(-1), { category: 'Units', categoryOrder: 5, label: "TDELTA" });

register('TINC', _temperatureStep(1), { category: 'Units', categoryOrder: 6, label: "TINC" });


// The HP's Constants Library under its names and in its units, with CODATA 2018 values; flag -61 set gives the
// number alone. Flag -60, the HP's English units, is not followed.
const CONSTANTS = Object.freeze({
  NA: [6.02214076e23, '1/mol'], k: [1.380649e-23, 'J/K'], Vm: [22.41396954, 'L/mol'], R: [8.314462618, 'J/(mol*K)'],
  StdT: [273.15, 'K'], StdP: [101.325, 'kPa'], 'σ': [5.670374419e-8, 'W/(m^2*K^4)'], c: [299792458, 'm/s'],
  'ε0': [8.8541878128e-12, 'F/m'], 'μ0': [1.25663706212e-6, 'H/m'], g: [9.80665, 'm/s^2'], G: [6.6743e-11, 'm^3/(s^2*kg)'],
  h: [6.62607015e-34, 'J*s'], 'ħ': [1.054571817e-34, 'J*s'], q: [1.602176634e-19, 'C'], me: [9.1093837015e-31, 'kg'],
  qme: [1.75882001076e11, 'C/kg'], mp: [1.67262192369e-27, 'kg'], mpme: [1836.15267343, ''], 'α': [7.2973525693e-3, ''],
  'ø': [2.06783384846e-15, 'Wb'], F: [96485.33212, 'C/mol'], 'R∞': [10973731.5682, '1/m'], a0: [0.0529177210903, 'nm'],
  'μB': [9.2740100783e-24, 'J/T'], 'μN': [5.0507837461e-27, 'J/T'], 'λ0': [1239.84198433, 'nm'], f0: [2.41798924208e14, 'Hz'],
  'λc': [0.00242631023867, 'nm'], rad: [1, 'r'], 'twoπ': [6.28318530718, 'r'], '∠': [1, '°'], c3: [2.897771955e-3, 'm*K'],
  kq: [8.61733326215e-5, 'J/(K*C)'], 'ε0q': [55263493.5806, 'F/(m*C)'], 'qε0': [1.41859728267e-30, 'F*C/m'],
  'εsi': [11.9, ''], 'εox': [3.9, ''], I0: [1e-12, 'W/m^2'],
});

export function constantIds() {
  return Object.keys(CONSTANTS);
}

export function constantValue(id) {
  const [value, unit] = CONSTANTS[id];
  return unit && !testUserFlag(-61) ? Unit(value, parseUnitExpr(unit)) : Real(value);
}

register('CONST', (s) => {
  const [name] = s.popN(1);
  if (!isName(name)) throw new RPLError('Bad argument type');
  if (!Object.hasOwn(CONSTANTS, name.id)) throw new RPLError(`Undefined name: ${name.id}`);
  s.push(constantValue(name.id));
}, { category: 'Units', categoryOrder: 7, label: "CONST" });

let _conlibHook = null;

export function setConlibHook(fn) {
  _conlibHook = typeof fn === 'function' ? fn : null;
}

register('CONLIB', () => {
  if (!inScratchState()) _conlibHook?.();
}, { category: 'Units', categoryOrder: 8, label: "CONLIB" });

// A name that isn't a formula stands for the formula stored in it, as the AUR has it.
function formulaText(arg) {
  if (isString(arg)) return arg.value;
  if (!isName(arg)) throw new RPLError('Bad argument type');
  if (molarMass(arg.id) !== null) return arg.id;
  const stored = varRecall(arg.id);
  if (stored === undefined) throw new RPLError(`Undefined name: ${arg.id}`);
  if (isString(stored)) return stored.value;
  if (isName(stored)) return stored.id;
  throw new RPLError('Bad argument type');
}

register('MOLWT', (s) => {
  const [arg] = s.popN(1);
  const mass = molarMass(formulaText(arg));
  if (mass === null) throw new RPLError('Bad argument value');
  s.push(testUserFlag(-61) ? Real(mass) : Unit(mass, parseUnitExpr('g/mol')));
}, { category: 'Units', categoryOrder: 9, label: "MOLWT" });

// Planck's second radiation constant hc/k in m·K (CODATA 2018).
const C2 = 1.438776877e-2;

function _inBase(v, base) {
  if (!isUnit(v)) return _numVal(v);
  if (!sameDims(v.uexpr, base)) throw new RPLError('Inconsistent units');
  return _inUnit(v, base);
}

// The fraction of a black body's emission below λ: 1 less the Bernoulli series of ∫₀ˣ t³/(eᵗ-1) dt for
// small x = c₂/λT, where the sum (15/π⁴) Σ e^(-nx)/n (x³ + 3x²/n + 6x/n² + 6/n³) needs too many terms.
function _blackBodyFraction(x) {
  const k = 15 / Math.PI ** 4;
  if (x < 0.5) return 1 - k * (x ** 3 / 3 - x ** 4 / 8 + x ** 5 / 60 - x ** 7 / 5040 + x ** 9 / 272160 - x ** 11 / 13305600);
  let sum = 0;
  for (let n = 1; n <= Math.ceil(40 / x); n++) {
    sum += Math.exp(-n * x) / n * (x ** 3 + 3 * x ** 2 / n + 6 * x / n ** 2 + 6 / n ** 3);
  }
  return k * sum;
}

// AUR: λ in meters and T in kelvins unless they carry units.
register('F0λ', (s) => {
  const [lambdaArg, tArg] = s.popN(2);
  const lambda = _inBase(lambdaArg, [['m', 1]]);
  const t = _inBase(tArg, [['K', 1]]);
  if (!(lambda > 0) || !(t > 0)) throw new RPLError('Bad argument value');
  s.push(Real(_blackBodyFraction(C2 / (lambda * t))));
}, { category: 'Units', categoryOrder: 10, label: "F0λ" });

// Silicon's intrinsic carrier density in 1/cm³, √(Nc·Nv)·(T/300)^1.5·e^(-Eg/2kT) with Sze's Nc 2.86E19 and Nv 2.66E19
// at 300 K and Varshni's gap Eg = 1.17 - 4.73E-4·T²/(T+636) eV; the HP's own fit isn't published.
const BOLTZMANN_EV = 8.617333262e-5;

function _siliconDensity(t) {
  if (!(t >= 0 && t <= 1685)) throw new RPLError('Bad argument value');
  if (t === 0) return 0;
  const gap = 1.17 - 4.73e-4 * t ** 2 / (t + 636);
  return Math.sqrt(2.86e19 * 2.66e19) * (t / 300) ** 1.5 * Math.exp(-gap / (2 * BOLTZMANN_EV * t));
}

register('SIDENS', _withTaggedUnary(_withListUnary((s) => {
  const [t] = s.popN(1);
  if (_isSymOperand(t)) {
    s.push(Symbolic(AstFn('SIDENS', [_toAst(t)])));
    return;
  }
  const density = _siliconDensity(_inBase(t, [['K', 1]]));
  s.push(isUnit(t) ? Unit(density, parseUnitExpr('cm^-3')) : Real(density));
})), { category: 'Units', categoryOrder: 10.1, label: 'SIDENS' });
