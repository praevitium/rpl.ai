import { isReal, isInteger, isString, isName, isTagged, Real, Integer, Str, Unit, RList, Program, Name } from '../types.js';
import { register, lookup } from './registry.js';
import { RPLError } from '../stack.js';
import { testUserFlag, inScratchState } from '../state.js';
import { parseUnitExpr } from '../units.js';
import { ELEMENTS } from '../elements.js';

// PTPROP's property numbers: 6 and 8 follow the AUR's examples; the rest is rpl.ai's own order, the AUR's Appendix B
// being out of reach. Each is [label, ELEMENTS column, unit].
export const PROPERTIES = Object.freeze([
  ['Atomic weight', 3, 'g/mol'], ['Density', 4, 'g/cm^3'], ['Group', 13], ['Period', 14], ['Block', 15],
  ['Electron configuration', 12], ['Electronegativity', 7], ['Melting point', 5, 'K'], ['Boiling point', 6, 'K'],
  ['Molar heat capacity', 11, 'J/(mol*K)'], ['Electron affinity', 8, 'kJ/mol'], ['First ionization energy', 9, 'kJ/mol'],
  ['Second ionization energy', 10, 'kJ/mol'], ['Atomic radius', 19, 'pm'], ['Covalent radius', 20, 'pm'],
  ['Name', 2], ['Symbol', 1], ['Atomic number', 0], ['Phase', 16], ['Category', 17], ['Electrons per shell', 18],
  ['Appearance', 21], ['Discovered by', 22],
]);
const COUNTS = new Set([0, 13, 14]);
const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e[1].toUpperCase(), e]));
const INFO = 'rpl.ai Periodic Table 1.0\n118 elements, 23 properties.\nData from Bowserinator\'s Periodic-Table-JSON (CC BY-SA), drawn from Wikipedia.';

export function findElement(v) {
  if (isTagged(v)) return findElement(v.value);
  if (isReal(v) || isInteger(v)) {
    const z = Number(v.value);
    return Number.isInteger(z) ? ELEMENTS[z - 1] ?? null : null;
  }
  const text = isName(v) ? v.id : isString(v) ? v.value : null;
  return text ? BY_SYMBOL.get(text.trim().toUpperCase()) ?? null : null;
}

function findProperty(v) {
  if (isTagged(v)) return findProperty(v.value);
  if (isReal(v) || isInteger(v)) return PROPERTIES[Number(v.value) - 1] ?? null;
  const text = isString(v) ? v.value : isName(v) ? v.id : null;
  if (!text) return null;
  const key = text.trim().toLowerCase();
  return PROPERTIES.find(([label]) => label.toLowerCase() === key) ?? PROPERTIES.find(([label]) => label.toLowerCase().startsWith(key)) ?? null;
}

// A property as the stack takes it: a unit object unless flag -61 says no units, text as a string, the shells as a list.
export function propertyValue(element, prop) {
  const [, col, unit] = prop;
  const raw = element[col];
  if (raw == null) return null;
  if (Array.isArray(raw)) return RList(raw.map((n) => Integer(BigInt(n))));
  if (typeof raw === 'string') return Str(raw);
  if (unit && !testUserFlag(-61)) return Unit(raw, parseUnitExpr(unit));
  return COUNTS.has(col) ? Integer(BigInt(raw)) : Real(raw);
}

register('PTPROP', (s) => {
  const [el, pr] = s.popN(2);
  const element = findElement(el), prop = findProperty(pr);
  if (!element || !prop) throw new RPLError('Bad argument value');
  const value = propertyValue(element, prop);
  if (value === null) throw new RPLError(`${element[2]}: ${prop[0].toLowerCase()} not known`);
  s.push(value);
}, { category: 'Units', categoryOrder: 9.1, label: 'PTPROP' });

let _tableHook = null;

export function setTableHook(fn) {
  _tableHook = typeof fn === 'function' ? fn : null;
}

register('PERTBL', () => {
  if (!inScratchState()) _tableHook?.();
}, { category: 'Units', categoryOrder: 9.2, label: 'PERTBL' });

register('PERINFO', (s) => {
  s.push(Program([Str(INFO), Name('MSGBOX')]));
  lookup('EVAL').fn(s);
}, { category: 'Units', categoryOrder: 9.3, label: 'PERINFO' });
