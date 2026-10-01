import {
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isString,
  isName, isList, isVector, isMatrix, isProgram, isTagged, isSymbolic,
  isDirectory, isUnit,
  Decimal,
} from './types.js';
import { state as _state, getApproxMode, fromRadians } from './state.js';
import { formatAlgebra } from './algebra.js';
import { formatUnitExpr } from './units.js';

export const DEFAULT_DISPLAY = {
  mode: 'STD',
  digits: 12,
};

/* `context: 'stack'` ticks every Name, as the HP50 shows one on a stack
   level; nested items keep their own quoting and are not passed it. */
export function format(v, display = DEFAULT_DISPLAY, options = {}) {
  if (v == null) return '';
  if (isReal(v))    return formatReal(v.value, display);
  if (isInteger(v)) return v.value.toString();
  if (isRational(v)) return `${v.n.toString()}/${v.d.toString()}`;
  if (isBinaryInteger(v)) return formatBinaryInteger(v);
  if (isComplex(v)) return formatComplex(v, display);
  if (isString(v))  return `"${v.value}"`;
  if (isName(v)) {
    if (v.local)  return `↓${v.id}`;
    if (options.context === 'stack' || v.quoted) return `\`${v.id}\``;
    return v.id;
  }
  if (isList(v))    return '{ ' + v.items.map(x => formatSource(x, display)).join(' ') + ' }';
  if (isVector(v))  return formatVector(v, display);
  if (isMatrix(v))  return '[[ ' + v.rows.map(r =>
                         r.map(x => format(x, display)).join(' ')).join(' ][ ') + ' ]]';
  if (isProgram(v)) return '« ' + v.tokens.map(x => formatSource(x, display)).join(' ') + ' »';
  if (isTagged(v))  return `${v.tag}: ${format(v.value, display)}`;
  if (isSymbolic(v))return `\`${formatSymbolic(v.expr)}\``;
  if (isDirectory(v)) return `Directory { ${v.name} }`;
  if (isUnit(v)) {
    const num = formatReal(v.value, display);
    const u   = formatUnitExpr(v.uexpr);
    return u ? `${num}_${u}` : num;
  }
  return `‹${v.type}›`;
}

/* Re-enterable source: a tag is written `:tag:obj` (the stack shows
   `tag: obj`) and a string escapes `"` and `\` as the parser reads them. */
export function formatSource(v, display = DEFAULT_DISPLAY) {
  if (isTagged(v)) return `:${v.tag}:${formatSource(v.value, display)}`;
  if (isString(v)) return `"${v.value.replace(/[\\"]/g, '\\$&')}"`;
  return format(v, display);
}

export function formatStackTop(v, display = DEFAULT_DISPLAY) {
  return format(v, display, { context: 'stack' });
}

function formatComplex(v, d) {
  const mode = _state.coordMode;
  if (mode === 'CYLIN' || mode === 'SPHERE') {
    const r = Math.hypot(v.re, v.im);
    const thetaRad = Math.atan2(v.im, v.re);
    const theta = fromRadians(thetaRad);
    return `(${formatCmpxComp(r, d)}, ∠${formatCmpxComp(theta, d)})`;
  }
  return `(${formatCmpxComp(v.re, d)}, ${formatCmpxComp(v.im, d)})`;
}

/* CYLIN and SPHERE are display-only (φ from +Z, as in the HP50 Advanced
   Guide §9); any non-numeric component keeps the vector rectangular. */
function formatVector(v, d) {
  const mode = _state.coordMode;
  const n = v.items.length;
  const rect = () => '[ ' + v.items.map(x => format(x, d)).join(' ') + ' ]';
  if (mode === 'RECT' || n < 2 || n > 3) return rect();
  const reals = new Array(n);
  for (let i = 0; i < n; i++) {
    const it = v.items[i];
    if (isReal(it))         reals[i] = it.value.toNumber();
    else if (isInteger(it)) reals[i] = Number(it.value);
    else                    return rect();
  }
  if (n === 2) {
    const r = Math.hypot(reals[0], reals[1]);
    const theta = fromRadians(Math.atan2(reals[1], reals[0]));
    return `[ ${formatCmpxComp(r, d)} ∠${formatCmpxComp(theta, d)} ]`;
  }
  const [x, y, z] = reals;
  if (mode === 'CYLIN') {
    const r = Math.hypot(x, y);
    const theta = fromRadians(Math.atan2(y, x));
    return `[ ${formatCmpxComp(r, d)} ∠${formatCmpxComp(theta, d)} ${formatCmpxComp(z, d)} ]`;
  }
  const rho = Math.sqrt(x * x + y * y + z * z);
  const theta = fromRadians(Math.atan2(y, x));
  const phi = rho === 0 ? 0 : fromRadians(Math.acos(z / rho));
  return `[ ${formatCmpxComp(rho, d)} ∠${formatCmpxComp(theta, d)} ∠${formatCmpxComp(phi, d)} ]`;
}

function formatCmpxComp(n, d) {
  const num = (n instanceof Decimal) ? n.toNumber() : n;
  if (
    !getApproxMode() &&
    d.mode === 'STD' &&
    Number.isFinite(num) &&
    Number.isInteger(num)
  ) {
    return String(num);
  }
  return formatReal(num, d);
}

// Reals hold a Decimal, which renders beyond IEEE range; Complex, Unit
// and Vector components are JS numbers, shown through the same Decimal rules.
export function formatReal(n, d) {
  if (n instanceof Decimal) return _formatRealDecimal(n, d);
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  return _formatRealDecimal(new Decimal(String(n)), d);
}

function _formatRealDecimal(d, display) {
  if (!d.isFinite()) return d.isPositive() ? '∞' : '-∞';
  switch (display.mode) {
    case 'FIX': return _fixDecimal(d, display.digits);
    case 'SCI': return _sciDecimal(d, display.digits);
    case 'ENG': return _engDecimal(d, display.digits);
    case 'STD':
    default:
      return _stdDecimal(d);
  }
}

function _normExp(s) {
  return s.replace(/e\+0*(\d)/, 'E$1').replace(/e-0*(\d)/, 'E-$1');
}

function _stdDecimal(d) {
  if (d.isZero()) return '0.';
  const exp = d.e;
  if (exp >= -11 && exp < 12) {
    const places = Math.max(0, 11 - exp);
    let s;
    if (places === 0) {
      // toFixed(0) drops the point; the HP50 shows 42.
      s = d.toSignificantDigits(12).toFixed(0) + '.';
    } else {
      s = d.toSignificantDigits(12).toFixed(places);
      if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.');
    }
    return s;
  }
  let s = d.toSignificantDigits(12).toExponential();
  s = s.replace(/\.?0+(e)/, '$1');
  return _normExp(s);
}

// A whole mantissa keeps its point, as the HP50 shows 1.E2.
function _sciDecimal(d, digits) {
  const s = _normExp(d.toExponential(digits, Decimal.ROUND_HALF_UP));
  return digits === 0 ? s.replace('E', '.E') : s;
}

// FIX n shows n decimals, but a number that needs more than 12 digits, or a
// nonzero one that would round to zero, is shown in scientific form instead.
function _fixDecimal(d, digits) {
  const rounded = d.toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
  const intDigits = rounded.e >= 0 ? rounded.e + 1 : 1;
  if (!d.isZero() && (rounded.isZero() || intDigits + digits > 12)) return _sciDecimal(d, digits);
  return rounded.toFixed(digits) + (digits === 0 ? '.' : '');
}

// ENG n shows n+1 significant digits with an exponent that is a multiple of 3.
function _engDecimal(d, digits) {
  const sig = digits + 1;
  if (d.isZero()) return `0${digits ? `.${'0'.repeat(digits)}` : '.'}E0`;
  const rounded = d.toSignificantDigits(sig, Decimal.ROUND_HALF_UP);
  const exp3 = Math.floor(rounded.e / 3) * 3;
  const decimals = Math.max(0, sig - (rounded.e - exp3 + 1));
  const mant = rounded.times(Decimal.pow(10, -exp3));
  return `${mant.toFixed(decimals)}${decimals === 0 ? '.' : ''}E${exp3}`;
}

// Unlike the HP50, never zero-padded to the wordsize: #502h stays #502h.
export function formatBinaryInteger(v) {
  const override = _state.binaryBase;
  const base = override || v.base;
  const radix = { h: 16, d: 10, o: 8, b: 2 }[base] || 16;
  let body = v.value.toString(radix);
  if (radix === 16) body = body.toUpperCase();
  return `#${body}${base}`;
}

function formatSymbolic(expr) {
  if (expr && typeof expr === 'object' && typeof expr.kind === 'string') {
    return formatAlgebra(expr);
  }
  // Saved files older than the algebra AST hold strings, numbers or { op, args }.
  if (expr == null) return '';
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'number') return String(expr);
  if (expr.op && expr.args) {
    return expr.args.map(formatSymbolic).join(' ' + expr.op + ' ');
  }
  return JSON.stringify(expr);
}
