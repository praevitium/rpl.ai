import {
  state as calcState, setAngle, setDisplay, setApproxMode, setComplexMode,
  setCoordMode, setBinaryBase,
} from '../rpl/state.js';
import { binaryBaseLabel, coordModeGlyph, displayModeLabel } from './display.js';

export const DISPLAY_DIGITS_CHOICES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

export const MODES = Object.freeze([
  {
    id: 'angle',
    title: 'Angle',
    chip: () => calcState.angle,
    options: [
      { value: 'DEG', label: 'Degrees', detail: 'A full turn is 360. SIN 30 gives 0.5.' },
      { value: 'RAD', label: 'Radians', detail: 'A full turn is 2π. Calculus and the CAS expect radians.' },
      { value: 'GRD', label: 'Grads', detail: 'A full turn is 400. Used in surveying.' },
    ],
    current: () => calcState.angle,
    set: (v) => setAngle(v),
  },
  {
    id: 'fmt',
    title: 'Number format',
    chip: () => displayModeLabel(calcState.displayMode, calcState.displayDigits),
    options: [
      { value: 'STD', label: 'Standard', detail: 'All significant digits, up to 12.' },
      { value: 'FIX', label: 'Fixed', detail: 'A fixed number of decimals: 3.1416 in FIX 4.' },
      { value: 'SCI', label: 'Scientific', detail: 'One digit before the point: 3.1416E0.' },
      { value: 'ENG', label: 'Engineering', detail: 'Exponents in steps of three: 31.416E-3.' },
    ],
    current: () => calcState.displayMode,
    set: (v, digits = calcState.displayMode === 'STD' ? 4 : calcState.displayDigits) => setDisplay(v, v === 'STD' ? 12 : digits),
    digits: true,
  },
  {
    id: 'exact',
    title: 'Results',
    chip: () => (calcState.approxMode ? 'APPROX' : 'EXACT'),
    options: [
      { value: 'EXACT', label: 'Exact', detail: 'Keeps √2, π and fractions symbolic.' },
      { value: 'APPROX', label: 'Approximate', detail: 'Evaluates to decimal numbers.' },
    ],
    current: () => (calcState.approxMode ? 'APPROX' : 'EXACT'),
    set: (v) => setApproxMode(v === 'APPROX'),
  },
  {
    id: 'complex',
    title: 'Number domain',
    chip: () => (calcState.complexMode ? 'ℂ CMPLX' : 'ℝ REAL'),
    options: [
      { value: 'REAL', label: 'Real', detail: 'SOLVE finds real roots; √−1 is an error.' },
      { value: 'CMPLX', label: 'Complex', detail: 'Complex results where needed; SOLVE finds complex roots.' },
    ],
    current: () => (calcState.complexMode ? 'CMPLX' : 'REAL'),
    set: (v) => setComplexMode(v === 'CMPLX'),
  },
  {
    id: 'coord',
    title: 'Coordinates',
    chip: () => coordModeGlyph(calcState.coordMode),
    options: [
      { value: 'RECT', label: 'Rectangular (XYZ)', detail: 'Complex numbers and vectors as (x, y).' },
      { value: 'CYLIN', label: 'Polar / cylindrical (R∠Z)', detail: 'Shown as magnitude and angle.' },
      { value: 'SPHERE', label: 'Spherical (R∠∠)', detail: '3D vectors as magnitude and two angles.' },
    ],
    current: () => calcState.coordMode,
    set: (v) => setCoordMode(v),
  },
  {
    id: 'base',
    title: 'Integer base',
    chip: () => binaryBaseLabel(calcState.binaryBase) ?? 'DEC',
    options: [
      { value: 'h', label: 'Hexadecimal (HEX)', detail: '#FFh' },
      { value: 'd', label: 'Decimal (DEC)', detail: '#255d' },
      { value: 'o', label: 'Octal (OCT)', detail: '#377o' },
      { value: 'b', label: 'Binary (BIN)', detail: '#11111111b' },
    ],
    current: () => calcState.binaryBase ?? 'd',
    set: (v) => setBinaryBase(v),
  },
]);

export function modeById(id) {
  return MODES.find((m) => m.id === id) ?? null;
}

// The commands that set a mode, as the mode and the option each picks; CMPLX flips its mode.
const MODE_COMMANDS = Object.freeze({
  DEG: ['angle', 'DEG'], RAD: ['angle', 'RAD'], GRAD: ['angle', 'GRD'], GRD: ['angle', 'GRD'],
  STD: ['fmt', 'STD'], FIX: ['fmt', 'FIX'], SCI: ['fmt', 'SCI'], ENG: ['fmt', 'ENG'],
  EXACT: ['exact', 'EXACT'], APPROX: ['exact', 'APPROX'], CMPLX: ['complex', null],
  RECT: ['coord', 'RECT'], CYLIN: ['coord', 'CYLIN'], SPHERE: ['coord', 'SPHERE'],
  HEX: ['base', 'h'], DEC: ['base', 'd'], OCT: ['base', 'o'], BIN: ['base', 'b'],
});

const optionLabel = (mode, value, digits) => `${mode.options.find((o) => o.value === value).label}${value === 'STD' || digits == null ? '' : ` ${digits}`}`;

// What a mode command would set, for command search's preview; FIX, SCI and ENG take digits from level 1.
export function modeCommandPreview(name, digits = null) {
  const [id, picked] = MODE_COMMANDS[name] ?? [];
  const mode = modeById(id);
  if (!mode) return '';
  const value = picked ?? mode.options.find((o) => o.value !== mode.current()).value;
  if (mode.digits && value !== 'STD' && digits == null) return '';
  const next = optionLabel(mode, value, mode.digits ? digits : null);
  const now = optionLabel(mode, mode.current(), mode.digits ? calcState.displayDigits : null);
  return next === now ? `→ ${mode.title} stays ${now}` : `→ ${mode.title}: ${next} (now ${now})`;
}

// A phone shows only this summary, so it names the coordinates, base and complex mode whenever they aren't the
// defaults, in the HP header's order.
export function modesSummary() {
  const coord = calcState.coordMode === 'RECT' ? null : coordModeGlyph(calcState.coordMode);
  const base = binaryBaseLabel(calcState.binaryBase);
  const fmt = displayModeLabel(calcState.displayMode, calcState.displayDigits);
  return [calcState.angle, coord, base === 'DEC' ? null : base, fmt, calcState.complexMode ? 'ℂ' : null, calcState.approxMode ? 'APPROX' : 'EXACT']
    .filter(Boolean).join(' · ');
}
