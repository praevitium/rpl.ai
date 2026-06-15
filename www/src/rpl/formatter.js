/* Value -> display-string formatter.  HP50 supports STD, FIX n, SCI n,
   ENG n display modes. */

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
  mode: 'STD',        // 'STD' | 'FIX' | 'SCI' | 'ENG'
  digits: 12,         // used by FIX/SCI/ENG
};

/**
 * Format a single value.
 *
 *   display   — DEFAULT_DISPLAY-shaped object (mode + digit count).
 *   options   — render-time flags:
 *     context: 'stack' | undefined
 *       When 'stack', the value is being rendered as a top-level entry
 *       on the calculator stack.  HP50 convention is that *any* Name
 *       value visible on a stack level shows with ticks — because a
 *       bare identifier is not a legal first-class value outside a
 *       program body.  The `quoted` flag of the Name is ignored for
 *       rendering in this context; a bare Name('X') that ended up on
 *       the stack (e.g. via a failed lookup or a deliberate push)
 *       still displays as `'X'`.
 *
 *       Context is intentionally NOT propagated into nested recursive
 *       calls (list items, program tokens, vector/matrix cells, tagged
 *       payloads).  Inside a `{ X Y }` list the names remain bare,
 *       matching how the list was authored and how the HP50 itself
 *       displays container literals.
 *
 *       When undefined (the default), only Names with quoted=true get
 *       ticks — this is the pre-stack-tick behavior and is what the
 *       formatter uses when called from ops, tests, or anywhere that
 *       isn't rendering the top of a stack level.
 */
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
  // Recursive calls deliberately drop the `stack` context — nested
  // names render with their normal (quoted ? tick : bare) rule.
  if (isList(v))    return '{ ' + v.items.map(x => format(x, display)).join(' ') + ' }';
  if (isVector(v))  return formatVector(v, display);
  if (isMatrix(v))  return '[[ ' + v.rows.map(r =>
                         r.map(x => format(x, display)).join(' ')).join(' ][ ') + ' ]]';
  if (isProgram(v)) return '« ' + v.tokens.map(x => format(x, display)).join(' ') + ' »';
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

/**
 * Convenience wrapper: format a value as a top-of-stack entry.
 *
 * This is the one call the Display layer makes when rendering each
 * row of the LCD stack view.  Semantically identical to
 * `format(v, display, { context: 'stack' })` — the wrapper exists so
 * the intent is explicit at the call site and so future stack-only
 * formatting knobs (e.g. a width budget, elision rules) have an
 * obvious home.
 */
export function formatStackTop(v, display = DEFAULT_DISPLAY) {
  return format(v, display, { context: 'stack' });
}

/** Render a Complex in the active coordinate display mode.
 *
 *    RECT    → `(a, b)`              — real/imag, HP50 default
 *    CYLIN   → `(r, ∠θ)`             — magnitude + angle (angle in
 *              the active angle mode; `∠` is the HP50 glyph)
 *    SPHERE  → `(r, ∠θ)`             — same as CYLIN for 2-D Complex;
 *              the third axis only kicks in for 3-vectors.
 *
 * Stored value is always rectangular (re, im) — this is purely a
 * display transform.  Angle sign follows atan2 so the imaginary
 * sign carries through (e.g. (1,-1) under RAD CYLIN renders as
 * `(SQRT(2), ∠-π/4)`).
 */
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

/** Render a Vector in the active coordinate display mode.
 *
 *  RECT (always for 4-D or higher, and the default for 2-/3-D):
 *    `[ x y z … ]` — element-wise rectangular, unchanged.
 *  CYLIN — 2-D `[ r ∠θ ]`; 3-D `[ r ∠θ z ]` (cylindrical).
 *  SPHERE — 2-D same as CYLIN; 3-D `[ ρ ∠θ ∠φ ]` with ρ the Euclidean
 *    norm, θ the azimuth in the XY plane (atan2(y, x)), φ the polar
 *    angle from the positive Z axis (acos(z/ρ)).  HP50 Advanced Guide
 *    §9 uses the physics convention (φ from +Z), so we match.
 *
 *  Stored value is always rectangular — this is purely a display
 *  transform, and it only applies when every component is a numeric
 *  Real/Integer.  A Symbolic or otherwise non-numeric component
 *  forces a rectangular fallback so we never fabricate angles for
 *  values we can't measure. */
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
  // `n` may be a JS number (Complex components, Vector rectangular cells
  // after the Decimal→number unwrap above) or a Decimal (formatReal's
  // caller in `format(Real)` passes `v.value` which is a Decimal).
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

export function formatReal(n, d) {
  // Two paths:
  //   Decimal  — Real stack payload.  Use Decimal's own string methods
  //              so values beyond IEEE-754 range (|exp| > 308) render
  //              correctly instead of collapsing to Infinity.
  //   JS number — Complex, Unit and Vector component renderers; these
  //              types haven't been widened to Decimal yet.  JS path
  //              stays unchanged.
  if (n instanceof Decimal) return _formatRealDecimal(n, d);
  const num = n;
  if (!Number.isFinite(num)) return num > 0 ? '∞' : '-∞';
  switch (d.mode) {
    case 'FIX': return num.toFixed(d.digits);
    case 'SCI': return num.toExponential(d.digits);
    case 'ENG': return formatEng(num, d.digits);
    case 'STD':
    default:
      return formatStd(num);
  }
}

/* ---- Decimal-native formatting (Real stack payload) ---- */

function _formatRealDecimal(d, display) {
  if (!d.isFinite()) return d.isPositive() ? '∞' : '-∞';
  switch (display.mode) {
    case 'FIX': return d.toFixed(display.digits);
    case 'SCI': return _sciDecimal(d, display.digits);
    case 'ENG': return _engDecimal(d, display.digits);
    case 'STD':
    default:
      return _stdDecimal(d);
  }
}

/** Converts Decimal's `e+N` / `e-N` notation to HP50-style `EN` / `E-N`. */
function _normExp(s) {
  return s.replace(/e\+0*(\d)/, 'E$1').replace(/e-0*(\d)/, 'E-$1');
}

function _stdDecimal(d) {
  if (d.isZero()) return '0.';
  const exp = d.e; // integer: 5 for 1.23e5, -3 for 1.23e-3
  if (exp >= -11 && exp < 12) {
    // Fixed range — render with enough decimal places for 12 sig figs.
    const places = Math.max(0, 11 - exp);
    let s;
    if (places === 0) {
      // toFixed(0) omits the dot; add it explicitly (HP50 style: 42.)
      s = d.toSignificantDigits(12).toFixed(0) + '.';
    } else {
      s = d.toSignificantDigits(12).toFixed(places);
      if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.');
    }
    return s;
  }
  // Scientific — 11 decimal places = 12 sig figs.
  let s = d.toSignificantDigits(12).toExponential();
  // Strip trailing zeros in mantissa (decimal.js keeps them in toExponential).
  s = s.replace(/\.?0+(e)/, '$1');
  return _normExp(s);
}

function _sciDecimal(d, digits) {
  return _normExp(d.toExponential(digits));
}

function _engDecimal(d, digits) {
  if (d.isZero()) return new Decimal(0).toFixed(digits) + 'E0';
  const exp3 = Math.floor(d.e / 3) * 3;
  const mant = d.dividedBy(Decimal.pow(10, exp3));
  return `${mant.toFixed(digits)}E${exp3}`;
}

/* ---- JS-number formatting (Complex / Vector components) ---- */

function formatStd(n) {
  if (n === 0) return '0.';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-11) {
    return n.toExponential().replace('e+', 'E').replace('e', 'E');
  }
  let s = n.toPrecision(12);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.');
  return s;
}

function formatEng(n, digits) {
  if (n === 0) return (0).toFixed(digits) + 'E0';
  const exp = Math.floor(Math.log10(Math.abs(n)) / 3) * 3;
  const mant = n / Math.pow(10, exp);
  return `${mant.toFixed(digits)}E${exp}`;
}

/**
 * Format a BinaryInteger as `#NNNNh` etc.
 *
 * Digits are rendered either in the value's stored base OR in the
 * global display-base override set by HEX/DEC/OCT/BIN (see state.js
 * `binaryBase`).  Hex digits are rendered uppercase to match HP50
 * on-screen style (`#FFh`, not `#ffh`).
 *
 * Deviation from HP50: output is always minimum-width — we do not
 * zero-pad to the STWS wordsize.  `#502h` stays `#502h`, never
 * `#0000000000000502h`, regardless of whether a display-base override
 * is active.
 */
export function formatBinaryInteger(v) {
  const override = _state.binaryBase;
  const base = override || v.base;
  const radix = { h: 16, d: 10, o: 8, b: 2 }[base] || 16;
  let body = v.value.toString(radix);
  if (radix === 16) body = body.toUpperCase();
  return `#${body}${base}`;
}

function formatSymbolic(expr) {
  // Primary shape: AST nodes from src/rpl/algebra.js with a `kind`
  // field (num / var / neg / bin).  Delegate to the algebra printer
  // so expressions render with minimal parens and HP50-ish spacing:
  // 'X^2 + 3*X + 1'.
  if (expr && typeof expr === 'object' && typeof expr.kind === 'string') {
    return formatAlgebra(expr);
  }
  // Fallback for non-AST expression shapes ({ op, args: [...] } objects,
  // raw strings, raw numbers).  Keep rendering them so stored snapshots
  // that predate the algebra AST stay readable.
  if (expr == null) return '';
  if (typeof expr === 'string') return expr;
  if (typeof expr === 'number') return String(expr);
  if (expr.op && expr.args) {
    return expr.args.map(formatSymbolic).join(' ' + expr.op + ' ');
  }
  return JSON.stringify(expr);
}
