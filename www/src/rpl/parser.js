/* RPL-ish parser for the command-line entry buffer.  On ENTER the text
   is parsed and its result pushed onto the stack.  Covers reals,
   integers, binary integers, complex, strings, names, lists, vectors,
   matrices, programs, units, and backtick algebraics (symbolics);
   anything unrecognised passes through as a bare identifier. */

import {
  Real, Integer, BinaryInteger, Complex, Str, Name, RList, Vector, Matrix, Program,
  Symbolic, Unit, isValidHpIdentifier,
} from './types.js';
import { RPLError } from './stack.js';
import { getWordsizeMask, state as _state, toRadians } from './state.js';
import { parseAlgebra } from './algebra.js';
import { parseUnitExpr } from './units.js';

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  // A bare comma acts as a separator, like whitespace — so `[1,2,3]`
  // and `[[1,2][3,4]]` parse the same as their space-separated forms.
  // Commas that belong to a complex literal `(1,2)`, a backtick
  // algebraic `COMB(N,K)`, or a string are consumed by those branches
  // before reaching this predicate, so they're unaffected.
  const isSpace = c => c === ',' || /\s/.test(c);

  while (i < n) {
    const c = src[i];

    if (isSpace(c)) { i++; continue; }

    // String literal.  An unterminated string at end-of-buffer is
    // auto-closed so the user's in-progress `"hello` still parses
    // as the string "hello" — convenience over strict-parser errors.
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

    // Program markers << and >> — both ASCII double-angle (what the
    // user types when there's no direct way to produce the guillemets)
    // and the Unicode U+00AB / U+00BB guillemets (what SHIFT-R + types
    // on our keypad — matching the glyph the HP50 prints on the key).
    // The two forms normalise to the same delim token so the
    // downstream parseProgram path is unchanged.
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

    // Parenthesised complex (re,im).  Unterminated → accept whatever
    // is between `(` and end-of-buffer.
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

    // Binary integer literal — '#' followed by digits, optionally
    // terminated by a base letter (h/d/o/b).  Case-insensitive.
    //   #FFh    16-bit hex 255
    //   #255d   decimal 255
    //   #377o   octal 255
    //   #11111111b binary 255
    // If no base letter is present, the currently-selected display base
    // (state.binaryBase, set by HEX/DEC/OCT/BIN) is assumed — so with
    // DEC selected `#1234` is treated as `#1234d`.
    // 'h' and 'o' are unambiguous suffixes (not hex digits).  'd' and
    // 'b' are both valid hex digits AND base letters; we peel them as
    // suffix to preserve long-standing explicit-suffix behavior.
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
      } else {
        // No suffix — assume the currently selected display base.
        digits = atom;
        baseLetter = _state.binaryBase || 'h';
      }
      tokens.push({ kind: 'binInt', digits, base: baseLetter });
      i = j; continue;
    }

    // Backtick for algebraic/name — `X`.  Unterminated backtick → accept
    // whatever is typed so far as the quoted body.  (The HP50 uses `'` for
    // this role; we remap to backtick so a literal apostrophe can be typed
    // as an ordinary character.)
    if (c === '`') {
      let j = i + 1, sym = '';
      while (j < n && src[j] !== '`') sym += src[j++];
      tokens.push({ kind: 'quotedName', text: sym });
      i = (j < n) ? j + 1 : n; continue;
    }

    // Number? start with digit, decimal, or sign followed by digit/.
    const rest = src.slice(i);
    const m = rest.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (m && (m[0].match(/[0-9]/))) {
      // Only consume the sign as part of the number if it starts the token,
      // otherwise leave + and - as their own tokens (operator names).
      // We've arrived here only when i is at the start of an atom, so it's safe.
      i += m[0].length;
      // Unit literal: `<number>_<unitExpr>` — the underscore immediately
      // after the number kicks off a unit expression that runs to the
      // next whitespace or structural delimiter.
      if (i < n && src[i] === '_') {
        i++;
        let j = i;
        // Stop the unit expression at a program delimiter so a closer
        // abutting the unit (`1_m»`, `1_m>>`) closes the program instead of
        // being swallowed into the unit text and failing parseUnitExpr.  The
        // guillemets are in the stop set; the ASCII `<<`/`>>` pair needs the
        // doubled lookahead (a unit expression never contains `<`/`>`).
        // Unlike the bare-ident stop set below, `()` are deliberately NOT
        // here — parentheses are valid unit-grouping syntax (`kg/(m*s)`,
        // and the formatter emits them for multiple negative factors), so
        // they must stay inside the unit token.
        while (j < n && !isSpace(src[j]) && !'{}[]"`«»'.includes(src[j])) {
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

    // A stray `)` outside the `(complex)` matching loop is a parse
    // error — `(` always pairs with `)` via the depth-counting loop
    // above, so a `)` reaching this point can only have come from
    // user input like `xy)`.  Without this branch the identifier
    // tokenizer below sees `)` (now in its delimiter stop set), reads
    // zero characters, and spins.
    if (c === ')') {
      throw new RPLError("Unexpected ')'");
    }

    // Angle marker `∠` (U+2220).  Used inside a vector literal to flag
    // a cylindrical / spherical coordinate component — `[ r ∠θ ]`,
    // `[ r ∠θ z ]`, `[ ρ ∠θ ∠φ ]` (HP50 AUR §9).  The marker emits a
    // dedicated `angle` token whose text is the following numeric
    // literal; whitespace between `∠` and the number is allowed
    // (`[ 1 ∠ 45 ]` works the same as `[ 1 ∠45 ]`).  Outside a vector
    // context the parser surfaces a clean error — `∠` is not a stand-
    // alone value.
    if (c === '∠') {
      let j = i + 1;
      while (j < n && isSpace(src[j])) j++;            // skip optional WS
      const tail = src.slice(j);
      const am = tail.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
      if (!am || !am[0].match(/[0-9]/)) {
        throw new RPLError("Bad angle literal after ∠");
      }
      tokens.push({ kind: 'angle', text: am[0] });
      i = j + am[0].length;
      continue;
    }

    // Identifier / operator token — run until whitespace or a structural
    // delimiter.  The delimiter set includes the parentheses so a typed
    // `SIN(x)` (without surrounding backticks) splits into the ident
    // `SIN` followed by the `(x)` complex-literal token, rather than
    // silently minting `Name('SIN(x)')` — which would then look like a
    // valid (but bogus) HP identifier and pollute the stack.  Algebraic
    // expressions still go through the backtick path, which routes to
    // `parseAlgebra` and handles function calls properly.
    let j = i;
    while (j < n && !isSpace(src[j]) && !'{}[]()"`«»'.includes(src[j])) {
      // Stop at an embedded program delimiter so a closer abutting an
      // operator (`2<»`, `X>>`) closes the program instead of being
      // swallowed into the identifier.  The guillemets are caught by the
      // stop set above; the ASCII `<<`/`>>` pair needs a lookahead since a
      // lone `<`/`>` is a valid bare operator name.  `j > i` keeps a
      // leading `<`/`>` from terminating the ident before it has a body.
      if (j > i && ((src[j] === '<' && src[j + 1] === '<') ||
                    (src[j] === '>' && src[j + 1] === '>'))) break;
      j++;
    }
    tokens.push({ kind: 'ident', text: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

/** Parse the full entry buffer into an array of values, one per
 *  top-level object in the source, in entry order — the caller pushes
 *  each onto the stack. Always returns an array (a single object is a
 *  length-1 array; empty/whitespace-only input is `[]`). */
export function parseEntry(src) {
  const toks = tokenize(src);
  let idx = 0;

  function parseOne() {
    const t = toks[idx++];
    if (!t) throw new RPLError('Empty parse');

    switch (t.kind) {
      case 'string': return Str(t.text);

      case 'number': {
        const text = t.text;
        if (/^[-+]?\d+$/.test(text)) return Integer(text);
        // Hand the raw text to Real() — its Decimal backing parses
        // arbitrary-magnitude literals like `1E400` directly, while
        // parseFloat would saturate to Infinity at IEEE-754 overflow.
        return Real(text);
      }

      case 'unit': {
        // Numeric part parses identically to a bare number; the unit
        // part is canonicalized via parseUnitExpr (which throws on an
        // unknown symbol — bubble that up as an RPL parse error so the
        // user's `9.8_m/s^2` typo doesn't silently become a Name).
        let uexpr;
        try { uexpr = parseUnitExpr(t.unitText); }
        catch (e) { throw new RPLError(e.message || 'Bad unit'); }
        const numValue = parseFloat(t.numText);
        if (!Number.isFinite(numValue)) {
          throw new RPLError('Bad numeric part in unit literal');
        }
        return Unit(numValue, uexpr);
      }

      case 'complex': {
        // Accepted forms (HP50 AUR §4.4 — with comma made optional
        // because the keypad has no `,` key in some entry layouts):
        //   Rectangular:  (re, im)  /  (re im)
        //   Polar:        (r, ∠θ)   /  (r ∠θ)   /  (r∠θ)
        // The angle glyph is U+2220 `∠`; we also accept a stray
        // leading `<` as a polar marker for keyboards without easy
        // access to `∠`.  θ is interpreted in the active RAD/DEG/GRD
        // mode and converted to radians here so the result on the
        // stack is always rectangular.
        //
        // Splitter strategy, in order of preference:
        //   1. comma-separated   — split on `,`
        //   2. `∠`/`<` separator — peel the polar marker off and use
        //                          everything before it as `re` and
        //                          the marker + tail as `im`
        //   3. whitespace        — split on the first run of spaces
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
              // Single token with no separator — treat as "(re)" with
              // a default zero imaginary, matching how `(3)` was
              // already treated under the comma form (parts[1]
              // defaulted to '0').
              reText = body.trim();
              imText = '0';
            }
          }
        }
        const m = imText.match(/^[∠<]\s*(.*)$/);
        if (m) {
          const r = parseFloat(reText);
          const theta = parseFloat(m[1]);
          if (!Number.isFinite(r) || !Number.isFinite(theta)) {
            throw new RPLError(`Bad complex literal: (${t.text})`);
          }
          // Convert through the calculator's active angle mode so a
          // user in DEG sees `(1, ∠45)` land as `(cos45°, sin45°)`.
          const rad = toRadians(theta);
          return Complex(r * Math.cos(rad), r * Math.sin(rad));
        }
        const reN = parseFloat(reText);
        const imN = parseFloat(imText);
        // Validate both components — a non-numeric body (e.g. `(x)`,
        // which is what's left after the new ident tokenizer splits
        // `SIN(x)`) lands here as `re = 'x'` and `parseFloat` returns
        // NaN.  Without this check we'd push `Complex(NaN, 0)` onto
        // the stack and the user would have no idea their algebraic
        // wasn't recognised — surface a clean parse error instead.
        if (!Number.isFinite(reN) || !Number.isFinite(imN)) {
          throw new RPLError(`Bad complex literal: (${t.text})`);
        }
        return Complex(reN, imN);
      }

      case 'binInt': {
        const radix = { h: 16, d: 10, o: 8, b: 2 }[t.base];
        // Validate digit set against the declared base.  Hex accepts
        // 0-9a-f; decimal digits 0-9; octal 0-7; binary 0-1.  A stray
        // digit outside the set is a parse error — matches HP50.
        const valid = {
          h: /^[0-9A-Fa-f]+$/,
          d: /^[0-9]+$/,
          o: /^[0-7]+$/,
          b: /^[01]+$/,
        }[t.base];
        if (!valid.test(t.digits)) {
          throw new RPLError(`Malformed ${t.base}-base integer: #${t.digits}${t.base}`);
        }
        // BigInt accepts only hex/oct/bin via "0x" / "0o" / "0b"
        // prefixes; for decimal plain-number works.
        let big;
        if (radix === 10) big = BigInt(t.digits);
        else if (radix === 16) big = BigInt('0x' + t.digits);
        else if (radix === 8)  big = BigInt('0o' + t.digits);
        else                    big = BigInt('0b' + t.digits);
        // HP50 truncates BinInt literals at PARSE time to the current
        // STWS wordsize.  Typing `#FFFFh` at ws=8 lands as `#FFh` on the
        // stack, not the 16-bit value.  Masking here mirrors that
        // behavior — arithmetic also masks, but catching it at parse
        // time means the value on the stack is already correct so
        // display + equality checks line up with the HP50's.
        big = big & getWordsizeMask();
        return BinaryInteger(big, t.base);
      }

      case 'quotedName': {
        // A backtick-quoted atom can be either:
        //   - a bare variable reference:   `X`        → Name('X', quoted)
        //   - an operator name:            `+`        → Name('+', quoted)
        //   - an algebraic expression:     `X^2 + 1`  → Symbolic(ast)
        //   - a pure-numeric algebra form: `1/3`      → Symbolic(ast)
        // Heuristic: if the body contains any algebra token (+ - * / ^
        // ( ) = ≠ < > ≤ ≥), try the algebra parser.  If that fails,
        // fall back to Name so forms like `+` (bare operator) still
        // round-trip as a Name.
        const body = t.text;
        // Include comparison operators (≠, <, >, ≤, ≥) so `x<y` and
        // friends are parsed as symbolic inequalities rather than falling
        // through to Name.  Purely numeric algebra — `1/3`, `2^0.5` —
        // also becomes Symbolic rather than a Name.  This is what makes
        // ``1/3` →NUM`` fold under APPROX and stay exact under EXACT.
        // Bare operator atoms like `+` fall through to Name via the
        // parseAlgebra try/catch.
        const looksAlgebraic =
          /[+\-*/^()=≠<>≤≥]/.test(body);
        if (looksAlgebraic) {
          try {
            return Symbolic(parseAlgebra(body));
          } catch (e) {
            // Fall through to Name only if the body is *also* a
            // syntactically valid HP identifier or a bare operator atom
            // like `+`.  Otherwise we'd be minting a garbage Name whose
            // id contains `(`, spaces, etc. — e.g. `SIN(X` on a failed
            // algebra parse would have become Name("SIN(X") and silently
            // survived into the stack.  Surfacing the algebra error
            // instead matches how the HP50 rejects malformed algebraics,
            // and the auto-close in parseAlgebra's expect(')') already
            // handles the common "user forgot the closer" case.
            if (isValidHpIdentifier(body)) {
              // Valid identifier shape — treat as plain Name (quoted).
            } else if (/^[+\-*/^=≠<>≤≥]$/.test(body)) {
              // Bare operator atom like `+`, `≤` — accept as quoted
              // Name so `'+' '≤'` round-trips.
            } else {
              throw new RPLError(`Invalid algebraic: ${e.message}`);
            }
          }
        }
        // Literal name reference — never auto-evaluated.  The quoted
        // flag tells EVAL and the entry loop to push this back instead
        // of looking it up.
        return Name(body, { quoted: true });
      }

      case 'ident': {
        const s = t.text;
        // A bare identifier in source — the executor (entry loop / EVAL)
        // decides at run time whether this is an op call, an auto-RCL,
        // or a push-back for an unbound name.
        return Name(s);
      }

      case 'delim': {
        if (t.text === '{') return parseList();
        if (t.text === '[') return parseVector();
        if (t.text === '<<') return parseProgram();
        throw new RPLError('Syntax error near ' + t.text);
      }

      case 'angle':
        // `∠θ` is meaningful only as a component of a vector literal.
        // A stray angle outside `[...]` (e.g. typed at the top of the
        // entry buffer) surfaces a clean parse error rather than
        // silently producing a Real or Name.
        throw new RPLError("`∠` is only valid inside a vector literal");
    }
    throw new RPLError('Unknown token');
  }

  /* When the input runs out before the expected closing delimiter
     (`}`, `]`, `>>`), we auto-close silently instead of throwing.
     Makes the common "user forgot to type the closer" case just
     work — e.g. `{ 1 2 3` lands as a 3-element list on ENTER. */

  function parseList() {
    const items = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '}')) {
      items.push(parseOne());
    }
    if (idx < toks.length) idx++;      // consume '}' when present
    return RList(items);
  }

  function parseVector() {
    // Collect raw tokens until the closing `]` so we can inspect the
    // shape of the vector literal — number / number / number is plain
    // rectangular, while `number ∠number` (with an optional plain
    // number after) is HP50's cylindrical / spherical input form
    // (AUR §9).  Mixing arbitrary parsed values still works (a vector
    // can hold Names, Symbolics, etc.) — we only treat the input as
    // polar when *every* slot is either a plain numeric literal or
    // an `∠`-prefixed angle.
    // Track nested `[` so a matrix literal `[[1 2][3 4]]` doesn't
    // latch the outer vector's terminator onto the inner row's `]`.
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
    if (idx < toks.length) idx++;                      // consume `]`

    // Polar / cylindrical / spherical recognition.  Patterns honour
    // the active angle mode via `toRadians`:
    //   2D cyl: [ N  ∠N ]                   →  Vector(r·cosθ, r·sinθ)
    //   3D cyl: [ N  ∠N  N ]                →  Vector(r·cosθ, r·sinθ, z)
    //   3D sph: [ N  ∠N  ∠N ]               →  ρ,θ,φ → cartesian
    // Anything else (mixed-type entries, the wrong number of items,
    // a `∠` in the wrong slot, etc.) falls through to the rectangular
    // path which calls `parseOne()` token-by-token.
    const isNum   = (t) => t && t.kind === 'number';
    const isAngle = (t) => t && t.kind === 'angle';
    const allNumOrAngle = collected.every(t => isNum(t) || isAngle(t));
    if (allNumOrAngle && collected.length >= 2) {
      const num = (t) => parseFloat(t.text);
      const len = collected.length;
      // 2D cylindrical: r ∠θ
      if (len === 2 && isNum(collected[0]) && isAngle(collected[1])) {
        const r = num(collected[0]);
        const theta = toRadians(num(collected[1]));
        return Vector([Real(r * Math.cos(theta)), Real(r * Math.sin(theta))]);
      }
      // 3D cylindrical: r ∠θ z
      if (len === 3 && isNum(collected[0]) && isAngle(collected[1]) && isNum(collected[2])) {
        const r = num(collected[0]);
        const theta = toRadians(num(collected[1]));
        const z = num(collected[2]);
        return Vector([Real(r * Math.cos(theta)), Real(r * Math.sin(theta)), Real(z)]);
      }
      // 3D spherical: ρ ∠θ ∠φ  (θ azimuth, φ polar from +z)
      if (len === 3 && isNum(collected[0]) && isAngle(collected[1]) && isAngle(collected[2])) {
        const rho = num(collected[0]);
        const theta = toRadians(num(collected[1]));
        const phi   = toRadians(num(collected[2]));
        const sinPhi = Math.sin(phi);
        return Vector([
          Real(rho * sinPhi * Math.cos(theta)),
          Real(rho * sinPhi * Math.sin(theta)),
          Real(rho * Math.cos(phi)),
        ]);
      }
      // Any other shape with `∠` tokens is malformed — surface it
      // before falling through to the rectangular path (which would
      // throw the more cryptic stand-alone-`∠` error from parseOne).
      if (collected.some(isAngle)) {
        throw new RPLError('Bad polar vector literal');
      }
    }

    // Rectangular path — re-walk the collected tokens through the
    // standard parseOne() machinery.  Mutating idx temporarily so
    // parseOne sees the same slice keeps the existing semantics for
    // things like vectors of Names / Symbolics.
    const savedIdx = idx;
    idx = start;
    const items = [];
    const endIdx = start + collected.length;
    while (idx < endIdx) items.push(parseOne());
    idx = savedIdx;

    // A literal whose every element is itself a vector row of equal,
    // non-zero length is a 2-D array — promote it to a real Matrix so
    // matrix ops (INV, DET, *, …) accept it, matching the HP50 where
    // `[[1 2][3 4]]` IS a matrix.  Ragged or mixed shapes stay a plain
    // Vector (an HP50 surfaces those as "Invalid Dimension" only when a
    // matrix op consumes them).
    if (items.length > 0 && items.every(v => v?.type === 'vector')) {
      const width = items[0].items.length;
      if (width > 0 && items.every(v => v.items.length === width)) {
        return Matrix(items.map(v => v.items));
      }
    }
    return Vector(items);
  }

  function parseProgram() {
    // A program is stored as a flat token list — the interpreter resolves
    // Names into ops when RUN is invoked.
    const body = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '>>')) {
      body.push(parseOne());
    }
    // If the input ran out before `>>` we auto-close silently (same
    // "forgot the closer" convenience as lists / vectors / strings).
    if (idx < toks.length) idx++;
    return Program(body);
  }

  const values = [];
  while (idx < toks.length) values.push(parseOne());
  return values;
}
