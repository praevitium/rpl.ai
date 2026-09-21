import { isNumber, promoteNumericPair, isBinaryInteger, isName, isString, isList, isVector, isMatrix, isSymbolic, isTagged, isUnit, isProgram, isDirectory, Symbolic, Integer, BinaryInteger } from '../types.js';
import { getWordsizeMask } from '../state.js';
import { RPLError } from '../stack.js';
import { Bin as AstBin } from '../algebra.js';
import { register } from './registry.js';
import { FALSE, TRUE, _isSymOperand, _mask, _toAst, isTruthy } from './internal.js';



function eqValues(a, b) {
  // Equality across numeric types.  Uses JS == on promoted scalars.
  if (isNumber(a) && isNumber(b)) {
    const p = promoteNumericPair(a, b);
    if (p.kind === 'complex')  return p.a.re === p.b.re && p.a.im === p.b.im;
    if (p.kind === 'integer')  return p.a === p.b;
    if (p.kind === 'rational') return p.a.n === p.b.n && p.a.d === p.b.d;
    // 'real' kind: p.a and p.b are Decimal instances — compare by value.
    return p.a.eq(p.b);
  }
  /* BinaryInteger structural equality.
     BinInt stays out of `isNumber` (base-preservation rules for
     arithmetic), so BinInt × BinInt handled here explicitly.  HP50
     AUR §4-1 compares BinInts by masked numeric value: display base
     is not semantic, so `#FFh == #255d` is 1.  Cross-family BinInt ×
     Integer / Real / Complex widening is done in the `==` / `≠` /
     `<>` op wrappers (NOT here) so that `SAME` — which uses
     `eqValues` directly — stays strict on types.
     Masking note: `BinaryInteger()` does NOT apply the wordsize mask
     at construction, so `#100h` at ws=8 stores `value = 256n`, not
     `0n`.  We mask both operands against the current wordsize before
     comparing so HP50-visible equal values (all bits outside the
     wordsize are meaningless) compare equal. */
  if (isBinaryInteger(a) && isBinaryInteger(b)) {
    const m = getWordsizeMask();
    return (a.value & m) === (b.value & m);
  }
  // Name / String / everything else: structural comparison by id/value.
  if (isName(a) && isName(b)) return a.id === b.id;
  if (isString(a) && isString(b)) return a.value === b.value;
  /* Structural equality on collection and expression types.
     HP50 AUR §4-2 documents == / SAME as structural equality for
     Lists / Vectors / Matrices; §4-7 ditto for Symbolics. */
  if (isList(a)   && isList(b))   return _eqArr(a.items, b.items);
  if (isVector(a) && isVector(b)) return _eqArr(a.items, b.items);
  if (isMatrix(a) && isMatrix(b)) {
    if (a.rows.length !== b.rows.length) return false;
    for (let i = 0; i < a.rows.length; i++) {
      if (!_eqArr(a.rows[i], b.rows[i])) return false;
    }
    return true;
  }
  if (isSymbolic(a) && isSymbolic(b)) return _astStructEqual(a.expr, b.expr);
  if (isTagged(a)   && isTagged(b)) {
    return a.tag === b.tag && eqValues(a.value, b.value);
  }
  if (isUnit(a) && isUnit(b)) {
    // Unit equality: same numeric value AND the same dimension algebra.
    // `sameDims` only checks dimension equivalence; we want strict
    // structural equality on the uexpr for ==/SAME so `1_m ==  1_km` is
    // false even though both are lengths.  Raw JSON compare is
    // sufficient here because uexpr is a plain frozen-object tree.
    if (a.value !== b.value) return false;
    return JSON.stringify(a.uexpr) === JSON.stringify(b.uexpr);
  }
  /* Program structural equality.
     HP50 AUR §4-7: two Programs are == / SAME iff their token streams
     are structurally identical (token count + recursive eqValues on
     each token).  Uses _eqArr which already recurses via eqValues, so
     nested Programs round-trip correctly. */
  if (isProgram(a) && isProgram(b)) return _eqArr(a.tokens, b.tokens);
  /* Directory reference-identity.
     HP50 AUR §4-7: SAME on Directories is reference identity — two
     distinct Directory allocations are never "the same", even if they
     hold the same entries.  Directories are identifiable containers,
     not values. `==` follows the same rule because there is no
     meaningful "structural" notion of directory equality on the HP50. */
  if (isDirectory(a) && isDirectory(b)) return a === b;
  return false;
}


/** Elementwise eqValues over two arrays (used by List / Vector / Matrix-row
 *  structural compare). */
function _eqArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!eqValues(a[i], b[i])) return false;
  }
  return true;
}


/** Structural compare of two Symbolic AST nodes.
 *  Mirrors `astEqual` in algebra.js but stays local to ops.js so we don't
 *  add another import for a four-line helper.  Supports the four AST
 *  node kinds produced by the parser (`num`, `var`, `neg`, `bin`, `fn`). */
function _astStructEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'num': return a.value === b.value;
    case 'var': return a.name === b.name;
    case 'neg': return _astStructEqual(a.arg, b.arg);
    case 'bin': return a.op === b.op
                  && _astStructEqual(a.l, b.l)
                  && _astStructEqual(a.r, b.r);
    case 'fn': {
      if (a.name !== b.name) return false;
      if (a.args.length !== b.args.length) return false;
      for (let i = 0; i < a.args.length; i++) {
        if (!_astStructEqual(a.args[i], b.args[i])) return false;
      }
      return true;
    }
    default:
      // Unknown AST kind — don't silently accept.
      return false;
  }
}


/** If either operand is a Symbolic/Name, push Symbolic(Bin(op, …)) and
 *  return true.  Otherwise return false so the caller proceeds with a
 *  numeric comparison.  Used by every comparison op (=, ==, ≠, <, >, ≤,
 *  ≥, and their ASCII aliases) — matches HP50 behaviour where comparing
 *  symbolic operands defers evaluation by building an equation. */
function _trySymCompare(s, a, b, op) {
  if (!_isSymOperand(a) && !_isSymOperand(b)) return false;
  const l = _toAst(a);
  const r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstBin(op, l, r)));
  return true;
}


// `=` is the equation-builder: always produces a symbolic result, even
// when both operands are numeric.  `2 3 =` → `'2=3'`.  Matches how
// HP50's EquationWriter treats the `=` key.
register('=', (s) => {
  const [a, b] = s.popN(2);
  const l = _toAst(a);
  const r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstBin('=', l, r)));
}, { category: 'Comparisons / logic', categoryOrder: 1, label: "=" });


/** Cross-family BinInt ↔ Integer/Real/Complex widening for the `==` /
 *  `≠` family.  HP50 AUR §4-1: `==` compares numeric operands by value
 *  across the numeric family, so `#10h == Integer(16)` is 1.  SAME is
 *  explicitly NOT in this widening — it stays strict on types
 *  (`SAME #10h Integer(16)` = 0). */
function _binIntCrossNormalize(a, b) {
  // Apply the wordsize mask before coercing to Integer — `#100h` at
  // ws=8 compares as 0, not 256.  Matches the masking rule in the
  // eqValues BinInt×BinInt branch and in comparePair.
  const m = getWordsizeMask();
  if (isBinaryInteger(a) && !isBinaryInteger(b) && isNumber(b)) {
    return [Integer(a.value & m), b];
  }
  if (isBinaryInteger(b) && !isBinaryInteger(a) && isNumber(a)) {
    return [a, Integer(b.value & m)];
  }
  return [a, b];
}


register('==', (s) => {
  // `==` is a strict structural equality test — it always returns a
  // boolean (1./0.), even on symbolic operands.  Use `=` instead to
  // build an equation: `'X' 'X' =` → `'X=X'`.
  // Cross-family BinInt widening at the outer level
  // (see _binIntCrossNormalize above).
  const [a0, b0] = s.popN(2);
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? TRUE : FALSE);
}, { category: 'Comparisons / logic', categoryOrder: 0, label: "==" });

register('SAME', (s) => {
  // HP50: SAME is structural equality including types; for primitive
  // values it coincides with ==.  We use the same comparator.  SAME
  // stays strictly boolean — it does NOT lift to symbolic, since SAME's
  // contract is "are these the same object?", not "are they equal?".
  // Deliberately does NOT cross-normalize BinInt — `SAME
  // #10h Integer(16)` = 0 per AUR §4-7 ("SAME does not type-coerce").
  const [a, b] = s.popN(2);
  s.push(eqValues(a, b) ? TRUE : FALSE);
}, { category: 'Comparisons / logic', categoryOrder: 2, label: "SAME" });


register('≠', (s) => {
  const [a0, b0] = s.popN(2);
  if (_trySymCompare(s, a0, b0, '≠')) return;
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? FALSE : TRUE);
}, { category: 'Comparisons / logic', categoryOrder: 3, label: "≠" });

register('<>', (s) => {
  // ASCII alias for ≠.
  const [a0, b0] = s.popN(2);
  if (_trySymCompare(s, a0, b0, '≠')) return;
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? FALSE : TRUE);
}, { category: 'Comparisons / logic', categoryOrder: 4, label: "<>" });


function comparePair(s, cmp, op) {
  let [a, b] = s.popN(2);                 // a = level 2, b = level 1
  /* BinaryInteger comparator widening.
     HP50 AUR §4-1 accepts BinInts on `<` / `>` / `≤` / `≥` by
     masked numeric value.  `isNumber` deliberately excludes BinInt,
     so we promote each BinInt operand to an Integer with the masked
     BigInt payload — that lets the symbolic-lift path lift via
     `_toAst` (which accepts Integer), and the numeric path route
     through `promoteNumericPair` with the `integer` kind.  Display
     base is dropped here because it isn't semantic for comparison
     (cf. == widening above).  Apply the wordsize mask to the
     payload — `#100h < #200h` at ws=8 must compare masked values
     (both 0), not unmasked payloads. */
  {
    const m = getWordsizeMask();
    if (isBinaryInteger(a)) a = Integer(a.value & m);
    if (isBinaryInteger(b)) b = Integer(b.value & m);
  }
  // Symbolic lift first — `x y >` with Name/Symbolic operands yields
  // `'x>y'` instead of an error.
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a);
    const r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstBin(op, l, r)));
    return;
  }
  /* String lexicographic compare.
     HP50 User Guide App. J: string comparisons are char-code
     lexicographic.  Both operands must be Strings; mixing String
     with a non-String is "Bad argument type" (no cross-type lift). */
  if (isString(a) && isString(b)) {
    s.push(cmp(a.value, b.value) ? TRUE : FALSE);
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  const p = promoteNumericPair(a, b);
  // Complex < / > / ≤ / ≥ isn't well-defined on HP50 either — only compare real parts
  // when imaginary parts are zero; otherwise error.
  let av, bv;
  if (p.kind === 'complex') {
    if (p.a.im !== 0 || p.b.im !== 0) throw new RPLError('Bad argument type');
    av = p.a.re; bv = p.b.re;
  } else if (p.kind === 'integer') {
    av = Number(p.a); bv = Number(p.b);
  } else if (p.kind === 'rational') {
    // Cross-multiply to compare without forming a real; d is always positive.
    av = p.a.n * p.b.d; bv = p.b.n * p.a.d;
  } else {
    // 'real' kind — p.a and p.b are Decimal instances.  Coerce to JS
    // number for the `<` / `>` / `≤` / `≥` comparator lambdas.  Ordering
    // is preserved within the 15-digit Decimal precision we use.
    av = p.a.toNumber(); bv = p.b.toNumber();
  }
  s.push(cmp(av, bv) ? TRUE : FALSE);
}


register('<',  (s) => comparePair(s, (a, b) => a <  b, '<'), { category: 'Comparisons / logic', categoryOrder: 5, label: "<" });

register('>',  (s) => comparePair(s, (a, b) => a >  b, '>'), { category: 'Comparisons / logic', categoryOrder: 6, label: ">" });

register('≤',  (s) => comparePair(s, (a, b) => a <= b, '≤'), { category: 'Comparisons / logic', categoryOrder: 7, label: "≤" });

register('<=', (s) => comparePair(s, (a, b) => a <= b, '≤'), { category: 'Comparisons / logic', categoryOrder: 8, label: "<=" });

register('≥',  (s) => comparePair(s, (a, b) => a >= b, '≥'), { category: 'Comparisons / logic', categoryOrder: 9, label: "≥" });

register('>=', (s) => comparePair(s, (a, b) => a >= b, '≥'), { category: 'Comparisons / logic', categoryOrder: 10, label: ">=" });


/* ---- logical ops: treat any non-zero as true; return 1./0. ----
   On two BinaryIntegers, AND/OR/XOR are BITWISE (HP50 overloads these
   exact names — same on a real unit).  The result is wordsize-masked
   and inherits the LEFT operand's display base.  Mixed BinInt+other
   is rejected with "Bad argument type", same as the arithmetic path.
   Everything else goes through the boolean-logic path: treat any non-
   zero as true, return Real(1) / Real(0).
   NOT on a BinaryInteger is bitwise complement within the wordsize;
   on anything else it's boolean (HP50 also overloads NOT). */
function binaryLogic(op) {
  return (s) => {
    const [a, b] = s.popN(2);
    if (isBinaryInteger(a) && isBinaryInteger(b)) {
      const m = _mask();
      const av = a.value & m;
      const bv = b.value & m;
      let r;
      switch (op) {
        case 'AND': r = av & bv; break;
        case 'OR':  r = av | bv; break;
        case 'XOR': r = av ^ bv; break;
      }
      s.push(BinaryInteger(r & m, a.base));
      return;
    }
    if (isBinaryInteger(a) || isBinaryInteger(b)) {
      throw new RPLError('Bad argument type');
    }
    const x = isTruthy(a), y = isTruthy(b);
    let r;
    switch (op) {
      case 'AND': r = x && y; break;
      case 'OR':  r = x || y; break;
      case 'XOR': r = x !== y; break;
    }
    s.push(r ? TRUE : FALSE);
  };
}

register('AND', binaryLogic('AND'), { category: 'Comparisons / logic', categoryOrder: 11, label: "AND" });

register('OR',  binaryLogic('OR'), { category: 'Comparisons / logic', categoryOrder: 12, label: "OR" });

register('XOR', binaryLogic('XOR'), { category: 'Comparisons / logic', categoryOrder: 13, label: "XOR" });


register('NOT', (s) => {
  const v = s.pop();
  if (isBinaryInteger(v)) {
    // Bitwise complement within the current wordsize (XOR with the mask).
    const m = _mask();
    s.push(BinaryInteger((v.value & m) ^ m, v.base));
    return;
  }
  s.push(isTruthy(v) ? FALSE : TRUE);
}, { category: 'Comparisons / logic', categoryOrder: 14, label: "NOT" });


register('TRUE',  (s) => { s.push(TRUE); }, { category: 'Comparisons / logic', categoryOrder: 15, label: "TRUE" });

register('FALSE', (s) => { s.push(FALSE); }, { category: 'Comparisons / logic', categoryOrder: 16, label: "FALSE" });
