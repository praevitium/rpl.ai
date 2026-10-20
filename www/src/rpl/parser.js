import {
  Real, Integer, Rational, BinaryInteger, Complex, Str, Name, RList, Vector, Matrix, Program,
  Symbolic, Unit, Tagged, isValidHpIdentifier, Decimal, grobFromHex,
} from './types.js';
import { RPLError } from './stack.js';
import { getApproxMode, getWordsizeMask, state as _state, angleTrig, testUserFlag } from './state.js';
import { parseAlgebra } from './algebra.js';
import { parseUnitExpr } from './units.js';

// A part of (re, im): a plain number or a fraction.  parseFloat would read 1_m as 1 and 1/2 as 1.
function complexPart(text) {
  const t = text.trim();
  const fraction = /^([-+]?\d+)\/(\d+)$/.exec(t);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(t) ? Number(t) : NaN;
}

const BASE_DIGITS = Object.freeze({ h: /^[0-9A-Fa-f]+$/, d: /^[0-9]+$/, o: /^[0-7]+$/, b: /^[01]+$/ });

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  // Commas separate like spaces; those inside (1,2), backticks and strings never reach here.
  const isSpace = c => c === ',' || /\s/.test(c);

  while (i < n) {
    const c = src[i];

    if (isSpace(c)) { i++; continue; }

    if (c === '@') {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }

    if (c === '"') {
      let j = i + 1, str = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) { str += src[j + 1]; j += 2; }
        else str += src[j++];
      }
      tokens.push({ kind: 'string', text: str });
      i = (j < n) ? j + 1 : n; continue;
    }

    if ('{}[]'.includes(c)) {
      tokens.push({ kind: 'delim', text: c });
      i++; continue;
    }

    if (c === '<' && src[i + 1] === '<') {
      tokens.push({ kind: 'delim', text: '<<' }); i += 2; continue;
    }
    if (c === '>' && src[i + 1] === '>') {
      tokens.push({ kind: 'delim', text: '>>' }); i += 2; continue;
    }
    if (c === '«') {
      tokens.push({ kind: 'delim', text: '<<' }); i++; continue;
    }
    if (c === '»') {
      tokens.push({ kind: 'delim', text: '>>' }); i++; continue;
    }

    if (c === '(') {
      let j = i + 1, body = '';
      let depth = 1;
      while (j < n && depth > 0) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') { depth--; if (depth === 0) break; }
        body += src[j++];
      }
      tokens.push({ kind: 'complex', text: body });
      i = (j < n) ? j + 1 : n; continue;
    }

    // A trailing d or b is read as the base letter although both are hex
    // digits, as the AUR says; with no base letter the current display base
    // applies.  In HEX mode a number the letter can't end, such as #1AB, is hex.
    if (c === '#') {
      let j = i + 1;
      while (j < n && /[0-9A-Fa-fHhOo]/.test(src[j])) j++;
      const atom = src.slice(i + 1, j);
      if (atom.length === 0) {
        throw new RPLError('Malformed binary integer');
      }
      const last = atom[atom.length - 1].toLowerCase();
      let digits, baseLetter;
      if ('hdob'.includes(last)) {
        digits = atom.slice(0, -1);
        baseLetter = last;
        if (digits.length === 0) {
          throw new RPLError('Malformed binary integer');
        }
        if (_state.binaryBase === 'h' && !BASE_DIGITS[baseLetter].test(digits) && BASE_DIGITS.h.test(atom)) {
          digits = atom;
          baseLetter = 'h';
        }
      } else {
        digits = atom;
        baseLetter = _state.binaryBase || 'h';
      }
      tokens.push({ kind: 'binInt', digits, base: baseLetter });
      i = j; continue;
    }

    // The HP50 quotes with apostrophes; the ` key stands in for its ' key, and either closes its own kind.
    if (c === '`' || c === "'") {
      let j = i + 1, sym = '';
      while (j < n && src[j] !== c) sym += src[j++];
      tokens.push({ kind: 'quotedName', text: sym });
      i = (j < n) ? j + 1 : n; continue;
    }

    if (c === ':') {
      const tm = src.slice(i).match(/^:([^\s:{}[\]()"`«»][^:\n{}[\]()"`«»]*):/);
      if (tm) {
        tokens.push({ kind: 'tag', text: tm[1] });
        i += tm[0].length; continue;
      }
    }

    const rest = src.slice(i);
    // C$ n and one separator take the next n characters as a string, C$ $ the rest of the line: the HP's counted string.
    const counted = rest.match(/^C\$\s+(\$|\d+)(?:\s|$)/);
    if (counted) {
      const body = rest.slice(counted[0].length);
      const text = counted[1] === '$' ? body : body.slice(0, Number(counted[1]));
      tokens.push({ kind: 'string', text });
      i += counted[0].length + text.length; continue;
    }
    // GROB width height hex, the HP's graphics object, reads its hex whole so 1E0F can't become a number.
    const grob = rest.match(/^GROB\s+(\d+)\s+(\d+)(?:\s+([0-9A-Fa-f]+))?(?=$|[\s{}[\]"`«»]|<<|>>)/);
    if (grob) {
      tokens.push({ kind: 'grob', width: Number(grob[1]), height: Number(grob[2]), hex: grob[3] ?? '' });
      i += grob[0].length; continue;
    }
    // 1/3 with no spaces is an exact fraction, the form a rational is shown and saved in.
    const fraction = rest.match(/^[-+]?\d+\/\d+(?=$|[\s{}[\]()"`«»]|<<|>>)/);
    if (fraction) {
      tokens.push({ kind: 'fraction', text: fraction[0] });
      i += fraction[0].length; continue;
    }
    const m = rest.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (m && (m[0].match(/[0-9]/))) {
      i += m[0].length;
      if (i < n && src[i] === '_') {
        i++;
        let j = i;
        // A program closer ends the unit (1_m»), but parentheses stay in it: kg/(m*s).
        while (j < n && !isSpace(src[j]) && !'{}[]"`\'«»'.includes(src[j])) {
          if ((src[j] === '<' && src[j + 1] === '<') ||
              (src[j] === '>' && src[j + 1] === '>')) break;
          j++;
        }
        tokens.push({ kind: 'unit', numText: m[0], unitText: src.slice(i, j) });
        i = j; continue;
      }
      tokens.push({ kind: 'number', text: m[0] });
      continue;
    }

    // The identifier scan below stops at ')' without consuming it and would spin.
    if (c === ')') {
      throw new RPLError("Unexpected ')'");
    }

    if (c === '∠') {
      let j = i + 1;
      while (j < n && isSpace(src[j])) j++;
      const tail = src.slice(j);
      const am = tail.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
      if (!am || !am[0].match(/[0-9]/)) {
        throw new RPLError("Bad angle literal after ∠");
      }
      tokens.push({ kind: 'angle', text: am[0] });
      i = j + am[0].length;
      continue;
    }

    // Parentheses end an identifier, so an unquoted SIN(x) splits instead of
    // minting a bogus Name; an embedded << or >> closes the program (X>>).
    let j = i;
    while (j < n && !isSpace(src[j]) && !'{}[]()"`\'«»'.includes(src[j])) {
      if (j > i && ((src[j] === '<' && src[j + 1] === '<') ||
                    (src[j] === '>' && src[j + 1] === '>'))) break;
      j++;
    }
    tokens.push({ kind: 'ident', text: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

// Whether src ends inside an open quote, where a function key types NAME( instead of running.
// [ r ∠θ ], [ r ∠θ z ] or, spherical, [ ρ ∠θ ∠φ ] (φ from +z) as the rectangular vector the HP stores, angles in the
// current mode; angleTrig makes 90° land on 0 exactly.
export function polarVector(r, theta, third, spherical = false) {
  const x = r * angleTrig('cos', theta), y = r * angleTrig('sin', theta);
  if (third === undefined) return Vector([Real(x), Real(y)]);
  if (!spherical) return Vector([Real(x), Real(y), Real(third)]);
  const sinPhi = angleTrig('sin', third);
  return Vector([Real(x * sinPhi), Real(y * sinPhi), Real(r * angleTrig('cos', third))]);
}

export function endsInQuote(src) {
  src = plainPunctuation(src);
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '`' || c === "'") {
      quote = c;
    } else if (c === '"') {
      for (i++; i < src.length && src[i] !== '"'; i++) if (src[i] === '\\') i++;
    } else if (c === '@') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
    }
  }
  return quote !== null;
}

// A phone keyboard's smart punctuation, and notes and messaging apps, curl quotes, and a phone's symbol keys offer ×, ÷ and −.
// The HP has none of them, so they read as ' " * / and -, one character for one; inside a string they are text.
const PLAIN = Object.freeze({ '‘': "'", '’': "'", '×': '*', '÷': '/', '−': '-' });

export function plainPunctuation(src) {
  let out = '';
  let closer = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (closer) {
      if (c === '\\' && i + 1 < src.length) { out += c + src[++i]; continue; }
      if (c === closer || c === '"') { out += '"'; closer = null; continue; }
      out += c;
    } else if (c === '"' || c === '“' || c === '”') {
      out += '"';
      closer = c === '"' ? '"' : '”';
    } else {
      out += PLAIN[c] ?? c;
    }
  }
  return out;
}

// With flag -51 set the HP's fraction mark is the comma and its separator the semicolon, so typed text is turned into
// the period form the parser reads: a comma beside a digit becomes a point and a semicolon a comma.
export function periodFractionMark(src) {
  return swapMarks(src, { ',': (prev, next) => (/\d/.test(prev + next) ? '.' : ','), ';': () => ',' }, true);
}

// The reverse, for showing a value with flag -51 set: 1.5 reads 1,5 and (1.5, 2.) reads (1,5; 2,).
export function commaFractionMark(text) {
  return swapMarks(text, { '.': (prev, next) => (/\d/.test(prev + next) ? ',' : '.'), ',': () => ';' }, false);
}

function swapMarks(src, swaps, comments) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || (comments && c === '@')) {
      const end = c === '"' ? stringEnd(src, i) : src.slice(i).search(/[\n\r]|$/) + i;
      out += src.slice(i, end);
      i = end - 1;
    } else {
      out += swaps[c]?.(src[i - 1] ?? '', src[i + 1] ?? '') ?? c;
    }
  }
  return out;
}

function stringEnd(src, start) {
  let i = start + 1;
  while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, src.length);
}

// Text the user typed, in the period form the parser reads.
export function fromTyped(src) {
  return testUserFlag(-51) ? periodFractionMark(plainPunctuation(src)) : src;
}

// The command line and a program's INPUT and INFORM fields.
export function parseTyped(src) {
  return parseEntry(fromTyped(src));
}

/** One value per top-level object, in entry order.  Unclosed brackets,
 *  strings and quotes close at the end of the input. */
export function parseEntry(src) {
  const toks = tokenize(plainPunctuation(src));
  let idx = 0;

  function parseOne() {
    const t = toks[idx++];
    if (!t) throw new RPLError('Empty parse');

    switch (t.kind) {
      case 'string': return Str(t.text);

      case 'number': {
        const text = t.text;
        if (/^[-+]?\d+$/.test(text)) return Integer(text);
        // Real()'s Decimal reads 1E400 exactly; parseFloat would give Infinity.
        return Real(text);
      }

      case 'fraction': {
        const [num, den] = t.text.split('/').map(BigInt);
        if (den === 0n) throw new RPLError(num === 0n ? 'Undefined result' : 'Infinite result');
        if (getApproxMode()) return Real(new Decimal(num.toString()).div(den.toString()));
        const r = Rational(num, den);
        return r.d === 1n ? Integer(r.n) : r;
      }

      case 'unit': {
        let uexpr;
        try { uexpr = parseUnitExpr(t.unitText); }
        catch (e) { throw new RPLError(e.message || 'Bad unit'); }
        const numValue = parseFloat(t.numText);
        if (!Number.isFinite(numValue)) {
          throw new RPLError('Bad numeric part in unit literal');
        }
        // Units that cancel, as in 1_m/m, leave a plain number, as arithmetic on units does.
        return uexpr.length ? Unit(numValue, uexpr) : Real(numValue);
      }

      case 'complex': {
        // (re, im), (re im), (r, ∠θ), (r ∠θ); a leading < also marks the angle,
        // which follows the angle mode.  The value is always stored rectangular.
        let reText, imText;
        const body = t.text;
        if (body.includes(',')) {
          const parts = body.split(',').map(x => x.trim());
          if (parts.length > 2) {
            throw new RPLError(`Bad complex literal: (${body})`);
          }
          reText = parts[0];
          imText = parts[1] === undefined ? '0' : parts[1];
        } else {
          const polarMatch = body.match(/^\s*([^∠<]+?)\s*([∠<].*)$/);
          if (polarMatch) {
            reText = polarMatch[1].trim();
            imText = polarMatch[2].trim();
          } else {
            const wsMatch = body.match(/^\s*(\S+)\s+(\S+)\s*$/);
            if (wsMatch) {
              reText = wsMatch[1];
              imText = wsMatch[2];
            } else {
              reText = body.trim();
              imText = '0';
            }
          }
        }
        const m = imText.match(/^[∠<]\s*(.*)$/);
        if (m) {
          const r = complexPart(reText);
          const theta = complexPart(m[1]);
          if (!Number.isFinite(r) || !Number.isFinite(theta)) {
            throw new RPLError(`Bad complex literal: (${t.text})`);
          }
          return Complex(r * angleTrig('cos', theta), r * angleTrig('sin', theta));
        }
        const reN = complexPart(reText);
        const imN = complexPart(imText);
        // (x), left over when an unquoted SIN(x) splits, must not become Complex(NaN, 0).
        if (!Number.isFinite(reN) || !Number.isFinite(imN)) {
          throw new RPLError(`Bad complex literal: (${t.text})`);
        }
        return Complex(reN, imN);
      }

      case 'binInt': {
        const radix = { h: 16, d: 10, o: 8, b: 2 }[t.base];
        if (!BASE_DIGITS[t.base].test(t.digits)) {
          throw new RPLError(`Malformed ${t.base}-base integer: #${t.digits}${t.base}`);
        }
        let big;
        if (radix === 10) big = BigInt(t.digits);
        else if (radix === 16) big = BigInt('0x' + t.digits);
        else if (radix === 8)  big = BigInt('0o' + t.digits);
        else                    big = BigInt('0b' + t.digits);
        // The HP50 truncates to the STWS wordsize as it parses: #FFFFh at 8 bits is #FFh.
        big = big & getWordsizeMask();
        return BinaryInteger(big, t.base);
      }

      case 'quotedName': {
        const body = t.text;
        const looksAlgebraic =
          /[+\-*/^()=≠<>≤≥√!]/.test(body) || /^[\d.]/.test(body) || /\b(AND|OR|XOR|NOT)\b/i.test(body);
        if (looksAlgebraic) {
          try {
            return Symbolic(parseAlgebra(body));
          } catch (e) {
            // Only identifiers and bare operators (`+`) fall back to a Name,
            // so a malformed SIN(X never survives as a garbage Name.
            if (!isValidHpIdentifier(body) && !/^[+\-*/^=≠<>≤≥]$/.test(body)) {
              throw new RPLError(`Invalid algebraic: ${e.message}`);
            }
          }
        }
        return Name(body, { quoted: true });
      }

      case 'grob': return grobFromHex(t.width, t.height, t.hex);

      case 'tag': {
        if (idx >= toks.length) throw new RPLError(`Missing object after :${t.text}:`);
        return Tagged(t.text, parseOne());
      }

      case 'ident':
        return Name(t.text);

      case 'delim': {
        if (t.text === '{') return parseList();
        if (t.text === '[') return parseVector();
        if (t.text === '<<') return parseProgram();
        throw new RPLError('Syntax error near ' + t.text);
      }

      case 'angle':
        throw new RPLError("`∠` is only valid inside a vector literal");
    }
    throw new RPLError('Unknown token');
  }

  function parseList() {
    const items = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '}')) {
      items.push(parseOne());
    }
    if (idx < toks.length) idx++;
    return RList(items);
  }

  function parseVector() {
    // The raw tokens come first so [ r ∠θ ], [ r ∠θ z ] and [ ρ ∠θ ∠φ ] can be
    // read as polar forms (AUR §9); nested [ ] keep a matrix's rows intact.
    const start = idx;
    const collected = [];
    let depth = 1;
    while (idx < toks.length) {
      const tk = toks[idx];
      if (tk.kind === 'delim') {
        if (tk.text === '[') depth++;
        else if (tk.text === ']') {
          depth--;
          if (depth === 0) break;
        }
      }
      collected.push(tk);
      idx++;
    }
    if (idx < toks.length) idx++;

    const isNum   = (t) => t && t.kind === 'number';
    const isAngle = (t) => t && t.kind === 'angle';
    const allNumOrAngle = collected.every(t => isNum(t) || isAngle(t));
    if (allNumOrAngle && collected.length >= 2) {
      const num = (t) => parseFloat(t.text);
      const len = collected.length;
      if (len === 2 && isNum(collected[0]) && isAngle(collected[1])) {
        return polarVector(num(collected[0]), num(collected[1]));
      }
      if (len === 3 && isNum(collected[0]) && isAngle(collected[1]) && isNum(collected[2])) {
        return polarVector(num(collected[0]), num(collected[1]), num(collected[2]));
      }
      if (len === 3 && isNum(collected[0]) && isAngle(collected[1]) && isAngle(collected[2])) {
        return polarVector(num(collected[0]), num(collected[1]), num(collected[2]), true);
      }
      if (collected.some(isAngle)) {
        throw new RPLError('Bad polar vector literal');
      }
    }

    const savedIdx = idx;
    idx = start;
    const items = [];
    const endIdx = start + collected.length;
    while (idx < endIdx) items.push(parseOne());
    idx = savedIdx;

    // Equal, non-empty rows make a Matrix; ragged rows stay a Vector, as on the HP50.
    if (items.length > 0 && items.every(v => v?.type === 'vector')) {
      const width = items[0].items.length;
      if (width > 0 && items.every(v => v.items.length === width)) {
        return Matrix(items.map(v => v.items));
      }
    }
    return Vector(items);
  }

  function parseProgram() {
    const body = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '>>')) {
      body.push(parseOne());
    }
    if (idx < toks.length) idx++;
    return Program(body);
  }

  const values = [];
  while (idx < toks.length) values.push(parseOne());
  return values;
}
