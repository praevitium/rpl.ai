import { isList, isVector, Integer, promoteNumericPair, Real, Complex, isSymbolic, Symbolic, isName, isReal, isInteger, isComplex, isNumber, toComplex, toRealOrThrow, isString, isBinaryInteger, isTagged, isMatrix, Str, RList, Vector, Matrix, isProgram, isRational, isUnit, Unit } from '../types.js';
import { RPLError } from '../stack.js';
import { Fn as AstFn, Var as AstVar } from '../algebra.js';
import { parseEntry as _parseEntryForObjTo } from '../parser.js';
import { register, lookup, OPS } from './registry.js';
import { _DOSUBS_STACK, _driveGen, _fromListOp, _fromStrOp, _symbolicDecompose, _toCountN, _toIntIdx, _toListOp, _toStrOp, runDoList, runDoSubs, runMap, runSeq, runStream } from './internal.js';



/** SUM — sum the elements of a list or vector, or wrap a symbolic
 *  operand as an unevaluated Σ(expr).
 *
 *  Stack:  level1=list|vector|number|symbolic  →  scalar | symbolic
 *
 *  Numeric rule: List / Vector elements must all be numeric (Real,
 *  Integer, or Complex — same promotion rules as the `+` op).  A
 *  single-level list of scalars is enough; nested lists are not
 *  flattened.  Empty list/vector sums to Integer(0). */
register('SUM', (s) => {
  const v = s.pop();
  if (isList(v) || isVector(v)) {
    const items = v.items;
    if (items.length === 0) { s.push(Integer(0n)); return; }
    let acc = items[0];
    for (let i = 1; i < items.length; i++) {
      const { a, b, kind } = promoteNumericPair(acc, items[i]);
      if (kind === 'integer')     acc = Integer(a + b);
      else if (kind === 'real')   acc = Real(a + b);
      else if (kind === 'complex') acc = Complex(a.re + b.re, a.im + b.im);
      else throw new RPLError('Bad argument type');
    }
    s.push(acc);
    return;
  }
  if (isSymbolic(v)) {
    s.push(Symbolic(AstFn('SUM', [v.expr])));
    return;
  }
  if (isName(v)) {
    s.push(Symbolic(AstFn('SUM', [AstVar(v.id)])));
    return;
  }
  if (isReal(v) || isInteger(v) || isComplex(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 25, label: "SUM" });


// Structural equality for RPL values.  Used by POS.  Mirrors the
// semantics of SAME: numerically equal reals/integers compare equal,
// lists compare element-wise, strings/names compare by content.
function _rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  // Numeric cross-type equality (Integer vs Real).
  if (isNumber(a) && isNumber(b)) {
    if (isComplex(a) || isComplex(b)) {
      const ca = toComplex(a), cb = toComplex(b);
      return ca.re === cb.re && ca.im === cb.im;
    }
    return toRealOrThrow(a) === toRealOrThrow(b);
  }
  if (a.type !== b.type) return false;
  if (isString(a))  return a.value === b.value;
  if (isName(a))    return a.id === b.id && a.quoted === b.quoted;
  if (isList(a)) {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      if (!_rplEqual(a.items[i], b.items[i])) return false;
    }
    return true;
  }
  if (isVector(a)) {
    if (a.items.length !== b.items.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      if (!_rplEqual(a.items[i], b.items[i])) return false;
    }
    return true;
  }
  if (isBinaryInteger(a)) return a.value === b.value;
  if (isTagged(a))        return a.tag === b.tag && _rplEqual(a.value, b.value);
  return false;
}


register('GET', (s) => {
  const [coll, idx] = s.popN(2);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    s.push(coll.items[n - 1]);
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    s.push(coll.items[n - 1]);
    return;
  }
  if (isMatrix(coll)) {
    // Index is { row col } — a 2-element list of indices.
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r > coll.rows.length) throw new RPLError('Bad argument value');
    const row = coll.rows[r - 1];
    if (c > row.length) throw new RPLError('Bad argument value');
    s.push(row[c - 1]);
    return;
  }
  if (isString(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.value.length) throw new RPLError('Bad argument value');
    s.push(Str(coll.value[n - 1]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 0, label: "GET" });


register('PUT', (s) => {
  const [coll, idx, val] = s.popN(3);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    s.push(RList(items));
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    s.push(Vector(items));
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r > coll.rows.length) throw new RPLError('Bad argument value');
    const row = coll.rows[r - 1];
    if (c > row.length) throw new RPLError('Bad argument value');
    const newRows = coll.rows.map((ri, i) => {
      if (i !== r - 1) return ri;
      const copy = [...ri];
      copy[c - 1] = val;
      return copy;
    });
    s.push(Matrix(newRows));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 1, label: "PUT" });


register('HEAD', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(v.items[0]);
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value[0]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 4, label: "HEAD" });


register('TAIL', (s) => {
  const [v] = s.popN(1);
  if (isList(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    s.push(RList(v.items.slice(1)));
    return;
  }
  if (isString(v)) {
    if (v.value.length === 0) throw new RPLError('Bad argument value');
    s.push(Str(v.value.slice(1)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 5, label: "TAIL" });


register('SUB', (s) => {
  const [v, mVal, nVal] = s.popN(3);
  // Clamp indices HP50-style: 0/negative → 1; > len → len; m > n → empty.
  function _clampLo(x) { return x < 1 ? 1 : x; }
  if (isList(v)) {
    const m = _clampLo(_toCountN(mVal));
    const n = _toCountN(nVal);
    const len = v.items.length;
    if (m > len || n < m) { s.push(RList([])); return; }
    const hi = Math.min(n, len);
    s.push(RList(v.items.slice(m - 1, hi)));
    return;
  }
  if (isString(v)) {
    const m = _clampLo(_toCountN(mVal));
    const n = _toCountN(nVal);
    const len = v.value.length;
    if (m > len || n < m) { s.push(Str('')); return; }
    const hi = Math.min(n, len);
    s.push(Str(v.value.slice(m - 1, hi)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 6, label: "SUB" });

register('→LIST',  _toListOp, { category: 'Lists / strings', categoryOrder: 9, label: "→LIST" });

register('LIST→',  _fromListOp, { category: 'Lists / strings', categoryOrder: 10, label: "LIST→" });


register('POS', (s) => {
  const [coll, needle] = s.popN(2);
  if (isList(coll)) {
    for (let i = 0; i < coll.items.length; i++) {
      if (_rplEqual(coll.items[i], needle)) {
        s.push(Integer(BigInt(i + 1)));
        return;
      }
    }
    s.push(Integer(0n));
    return;
  }
  if (isString(coll)) {
    if (!isString(needle)) throw new RPLError('Bad argument type');
    const idx = coll.value.indexOf(needle.value);
    s.push(Integer(BigInt(idx + 1)));   // 0 if not found (indexOf=-1+1)
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 7, label: "POS" });


/* ----------------------------------------------------------------
   OBJ→ — decompose level-1 object into its parts.

   Dispatch (matches HP50 AUR §3-149 Input/Output table):
     Complex(re,im)      → re im
     Tagged(tag, value)  → value "tag"             ← tag is a String per AUR
     List { x1 … xn }    → x1 … xn n
     Vector [ x1 … xn ]  → x1 … xn { n }
     Matrix [[...][...]] → x11 x12 … xmn { m n }
     String  "src"       → evaluate src (parse + push each result)
     Symbolic 'expr'     → arg1 … argn  n  'function'
     Program « t1 … tn » → t1 … tn n
     Real / Integer  x   → x                       ← AUR §3-149 lists no
                                                     numeric-scalar case;
                                                     AUR-fidelity choice
                                                     is to push back
                                                     unchanged.  The
                                                     mantissa / exponent
                                                     split is the job of
                                                     MANT / XPON (AUR
                                                     p.3-6 / p.3-9).
     BinaryInteger #n    → #n                      ← Same AUR-fidelity
                                                     choice as Real /
                                                     Integer: §3-149
                                                     lists no row, so
                                                     push back unchanged
                                                     rather than
                                                     auto-converting to
                                                     Real (that's what
                                                     B→R is for, AUR
                                                     p.3-46) or rejecting
                                                     with `Bad argument
                                                     type`.
     Rational  n/d       → n/d                     ← Same as above; the
                                                     N/D split lives at
                                                     →NUM (numerator) /
                                                     →DEN (denominator)
                                                     where applicable.
                                                     Push back unchanged
                                                     here.
     Unit  x_unit        → x  1_unit                ← AUR §3-149 row.
                                                     The bare numeric
                                                     value rides level 2
                                                     as a Real; the unit
                                                     prototype `1_unit`
                                                     (same uexpr, value
                                                     1) rides level 1.
                                                     `x  1_unit  *` is
                                                     the natural
                                                     round-trip: the
                                                     dimensionless Real
                                                     scales the unit
                                                     prototype back to
                                                     the original value.

   Tagged note: AUR §3-149 shows the tag output as `"tag"` — String,
   not Name.  See →TAG (AUR p.3-247) which accepts either a String OR
   a Name as the tag-side input but OBJ→'s canonical decomposition
   uses the String form.  Don't "fix" Str(v.tag) into Name(v.tag) —
   that would diverge from the AUR.

   Unit note: the Unit branch uses the bare `Unit(1, v.uexpr)`
   constructor rather than `_makeUnit` so a (theoretically possible)
   empty-uexpr Unit would still emit `Unit(1, [])` rather than
   collapsing to `Real(1)` — preserving the AUR table's
   shape-preserving "1_unit" output.  In practice the codebase's
   arithmetic invariant ensures Units on the stack always have
   non-empty uexpr (anything dimensionless flows through `_makeUnit`'s
   collapse), but the bare constructor keeps the OBJ→ branch robust
   against any future Unit constructor that doesn't go through that
   path.

   The Program case is the "program-as-data" hook RPL metaprogrammers
   reach for: `« ... » OBJ→` returns each token (as a stack-pushable
   value) followed by the integer token count.  The inverse is `→PRG`
   (see below).  Round-trip is guaranteed for any program token stream
   since each token is itself a value-type — Names, numbers, strings,
   nested Programs, etc.
   ---------------------------------------------------------------- */
register('OBJ→', (s) => {
  const [v] = s.popN(1);
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isTagged(v)) {
    // AUR §3-149: `:tag:obj  →  obj  "tag"` — the tag is a String.
    // (Don't switch to Name(v.tag) — see header block.)
    s.push(v.value);
    s.push(Str(v.tag));
    return;
  }
  if (isList(v)) {
    for (const item of v.items) s.push(item);
    s.push(Integer(BigInt(v.items.length)));
    return;
  }
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  if (isString(v)) {
    // Parse as RPL source and push each top-level object.  Ops are not
    // run — `"1 2 +"` leaves Integer(1), Integer(2), Name('+').
    const parsed = _parseEntryForObjTo(v.value);
    for (const item of parsed) s.push(item);
    return;
  }
  if (isProgram(v)) {
    // Push each token followed by an Integer count.  Matches the List
    // decomposition shape so generic metaprogramming loops can treat
    // the two symmetrically.  The tokens are already value-typed (from
    // the parser) so no re-wrapping is needed.
    for (const tok of v.tokens) s.push(tok);
    s.push(Integer(BigInt(v.tokens.length)));
    return;
  }
  if (isSymbolic(v)) {
    // Peel one layer off the algebraic.  For a leaf Num or Var we
    // push the corresponding RPL scalar (Real / quoted Name) and a
    // count of 1.  For a Bin / Fn / Neg node, we push each argument
    // as its own pushable value (leaves unwrap to Real / Name; non-leaf
    // subtrees stay Symbolic) followed by a quoted-Name for the head
    // (operator or function id) and a total count = args + 1.
    //
    // Rationale: the layout mirrors `OBJ→` on Program — args then a
    // leading count — and dovetails with `→PRG` so a user can
    // macro-rewrite an algebraic via the same "gather / edit / rebuild"
    // idiom we already support for programs.
    for (const item of _symbolicDecompose(v)) s.push(item);
    return;
  }
  if (isReal(v) || isInteger(v) || isBinaryInteger(v) || isRational(v)) {
    // HP50 AUR §3-149 lists no numeric-scalar entry in the OBJ→ table —
    // a Real, Integer, BinaryInteger, or Rational has no internal
    // structure to decompose into separate stack items.  AUR-fidelity
    // choice is to push the value back unchanged (1-in / 1-out).
    // Users who want format-specific splits should reach for MANT /
    // XPON (Real, AUR p.3-6 / p.3-9) or B→R (BinaryInteger → Real,
    // AUR p.3-46).  All those ops are wired separately and unaffected
    // by this branch.
    s.push(v);
    return;
  }
  if (isUnit(v)) {
    // AUR §3-149: `x_unit  →  x  1_unit`.
    // Push the bare numeric value (Real on level 2) and the
    // unit prototype `1_unit` (Unit with value=1, same uexpr) on
    // level 1.  Round-trip via `*` reconstructs the original Unit
    // because `_unitBinary` on Real*Unit folds the scalar into
    // `b.value` (1 * x = x), preserving the uexpr.  Use the bare
    // Unit() constructor here, NOT _makeUnit, to avoid an
    // empty-uexpr collapse — see the header comment block above.
    s.push(Real(v.value));
    s.push(Unit(1, v.uexpr));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 11, label: "OBJ→" });


/* ----------------------------------------------------------------
   SORT / REVLIST — list combinators.

   SORT ( { x1 … xn } → { y1 … yn } ):  ascending sort.  Item types
   must be mutually comparable:
     - Reals, Integers, and BinInts compare numerically.
     - Strings compare lexicographically.
     - Mixing numeric and string in the same list throws
       "Bad argument type" (HP50 also refuses heterogeneous sorts).
   The returned list is a NEW List; the input is not mutated (RPL
   values are immutable-by-convention so our implementation naturally
   preserves that).

   REVLIST ( { x1 … xn } → { xn … x1 } ):  reverse, no comparator
   needed, element types unchanged.
   ---------------------------------------------------------------- */

// Compare two RPL values for SORT.  Returns negative / 0 / positive.
// Throws "Bad argument type" on unsupported or mismatched types.
//
// Real values carry a decimal.js `Decimal` payload, NOT a JS number.
// Decimal#valueOf() returns a string, so JS `<` / `>` between two
// Decimals does *string* comparison, which mis-orders negatives
// (e.g. "-3.5" > "-1.5" lexicographically).  The fix: route every
// numeric comparison through `Number()` of the operand's payload —
// BigInt for Integer / BinaryInteger, `.toNumber()` for Decimal —
// so the comparator always works on JS numbers.  Precision loss
// from Number coercion is acceptable for SORT (HP50's own SORT runs
// at hardware float precision, which is less than IEEE 754 double).
function _toCompareNumber(v) {
  if (isReal(v))           return v.value.toNumber();
  if (isInteger(v))        return Number(v.value);
  if (isBinaryInteger(v))  return Number(v.value);
  return null;             // unreachable for callers that gate on isAnyNum
}


function _rplCompare(a, b) {
  const isAnyNum = v => isReal(v) || isInteger(v) || isBinaryInteger(v);
  if (isAnyNum(a) && isAnyNum(b)) {
    const an = _toCompareNumber(a);
    const bn = _toCompareNumber(b);
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  if (isString(a) && isString(b)) {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  }
  throw new RPLError('Bad argument type');
}


register('SORT', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const sorted = [...l.items].sort(_rplCompare);
  s.push(RList(sorted));
}, { category: 'Lists / strings', categoryOrder: 16, label: "SORT" });


register('REVLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const reversed = [...l.items].reverse();
  s.push(RList(reversed));
}, { category: 'Lists / strings', categoryOrder: 15, label: "REVLIST" });


/* ----------------------------------------------------------------
   CHR / NUM — single-codepoint String ⇄ Integer.

   HP50 Advanced Guide §14:
     CHR ( n  → "c" )    n is an ASCII / Unicode codepoint; push the
                         1-character string containing that codepoint.
     NUM ( "s" → n  )    return the codepoint of the FIRST character
                         of s as an Integer.  Empty string throws
                         "Bad argument value".

   We use JS's `String.fromCodePoint` / `String.prototype.codePointAt`
   so the full Unicode range works; the real HP50 was ASCII-only but
   our web version has no reason to limit itself.  NUM on a multi-
   char string silently returns the first code point — matches HP50
   behavior of "first character only".
   ---------------------------------------------------------------- */

register('CHR', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    n = v.value.toNumber();
  } else                  throw new RPLError('Bad argument type');
  if (n < 0 || n > 0x10FFFF) throw new RPLError('Bad argument value');
  s.push(Str(String.fromCodePoint(n)));
}, { category: 'Lists / strings', categoryOrder: 14, label: "CHR" });

register('→STR',  _toStrOp, { category: 'Lists / strings', categoryOrder: 12, label: "→STR" });

register('STR→',  _fromStrOp, { category: 'Lists / strings', categoryOrder: 13, label: "STR→" });


/* ----------------------------------------------------------------
   ΣLIST / ΠLIST / ΔLIST — list aggregations.

   HP50 Advanced Guide §5:
     ΣLIST  ( { x1 … xn }  →  Σxi )
     ΠLIST  ( { x1 … xn }  →  Πxi )
     ΔLIST  ( { x1 … xn }  →  { x2-x1, x3-x2, …, xn-xn-1 } )

   All three delegate to the existing arithmetic dispatch via
   `lookup('+').fn` / `lookup('*').fn` / `lookup('-').fn`, so the full
   numeric-plus-symbolic matrix just works — a list of Symbolics sums
   to a Symbolic, a list of Reals sums to a Real, and mixing Integer
   and Real promotes to Real.

   Empty-list conventions (HP50):
     ΣLIST{}  → 0  (identity element for +)
     ΠLIST{}  → 1  (identity element for *)
     ΔLIST{}  → {} (empty difference series)
   Single-element:
     ΣLIST{x} → x
     ΠLIST{x} → x
     ΔLIST{x} → {} (no differences to take)

   ASCII aliases SLIST / PLIST / DLIST register for ASCII-only input.
   ---------------------------------------------------------------- */

// Fold a list's items through a binary op registered in OPS.  Empty
// list yields the supplied identity value.  The fold leaves the
// accumulated value on the stack (via the underlying op's dispatch).
//
// Lookup is deferred to call time — the arithmetic `+ *` registrations
// live past this factory site, so resolving at module load would find
// undefined.
function _foldListOp(opSymbol, identity) {
  return (s) => {
    const binop = lookup(opSymbol);
    const [l] = s.popN(1);
    if (!isList(l)) throw new RPLError('Bad argument type');
    if (l.items.length === 0) { s.push(identity); return; }
    if (l.items.length === 1) { s.push(l.items[0]); return; }
    s.push(l.items[0]);
    for (let i = 1; i < l.items.length; i++) {
      s.push(l.items[i]);
      binop.fn(s);
    }
  };
}


register('ΣLIST', _foldListOp('+', Real(0)), { category: 'Lists / strings', categoryOrder: 21, label: "ΣLIST" });

register('ΠLIST', _foldListOp('*', Real(1)), { category: 'Lists / strings', categoryOrder: 20, label: "ΠLIST" });

register('SLIST', _foldListOp('+', Real(0)), { category: 'Lists / strings', categoryOrder: 24, label: "SLIST" });

register('PLIST', _foldListOp('*', Real(1)), { category: 'Lists / strings', categoryOrder: 23, label: "PLIST" });


register('ΔLIST', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  if (l.items.length <= 1) { s.push(RList([])); return; }
  const binop = lookup('-');
  const diffs = [];
  for (let i = 1; i < l.items.length; i++) {
    // Compute xi - x(i-1) via the shared - op so Symbolic/Integer/Real
    // mixes work the same way as ΣLIST / ΠLIST.
    s.push(l.items[i]);
    s.push(l.items[i - 1]);
    binop.fn(s);
    const [d] = s.popN(1);
    diffs.push(d);
  }
  s.push(RList(diffs));
}, { category: 'Lists / strings', categoryOrder: 19, label: "ΔLIST" });

register('DLIST', (s) => OPS.get('ΔLIST').fn(s), { category: 'Lists / strings', categoryOrder: 22, label: "DLIST" });


/* ----------------------------------------------------------------
   REPL / SREPL — string and list replacement.

   REPL — Advanced Guide §13.  Splices a second object into the first
   starting at position n (1-indexed), replacing the overlapping range.

     REPL ( L1 n L2 → L )     replace items n..n+|L2|-1 of L1 with L2
     REPL ( S1 n S2 → S )     replace chars n..n+|S2|-1 of S1 with S2
     REPL ( V1 n V2 → V )     vector form
     REPL ( M1 {r c} M2 → M ) matrix form — M2 is a sub-matrix whose
                              top-left corner lands at (r, c) of M1

   HP50 throws "Bad argument value" when the splice would extend past
   the end of the host; we mirror that.

   SREPL — Advanced Guide §14.  String search/replace, replacing ALL
   occurrences of the second string with the third inside the first.

     SREPL ( "hay" "needle" "repl" → "result" n )
       returns the post-replacement string AND the count of substitutions
       (HP50 convention — the count is an Integer).  Zero matches leaves
       the haystack unchanged and pushes 0.
   ---------------------------------------------------------------- */

register('REPL', (s) => {
  const [host, pos, patch] = s.popN(3);

  // Matrix: index is a {row col} list; patch must be a Matrix too.
  if (isMatrix(host)) {
    if (!isList(pos) || pos.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    if (!isMatrix(patch)) throw new RPLError('Bad argument type');
    const r0 = _toIntIdx(pos.items[0]);
    const c0 = _toIntIdx(pos.items[1]);
    const hostRows = host.rows.length;
    const hostCols = hostRows > 0 ? host.rows[0].length : 0;
    const pRows = patch.rows.length;
    const pCols = pRows > 0 ? patch.rows[0].length : 0;
    if (r0 + pRows - 1 > hostRows || c0 + pCols - 1 > hostCols) {
      throw new RPLError('Bad argument value');
    }
    const newRows = host.rows.map(r => [...r]);
    for (let i = 0; i < pRows; i++) {
      for (let j = 0; j < pCols; j++) {
        newRows[r0 - 1 + i][c0 - 1 + j] = patch.rows[i][j];
      }
    }
    s.push(Matrix(newRows));
    return;
  }

  // Sequence types (String / List / Vector): pos is a single integer.
  const n = _toIntIdx(pos);

  if (isString(host)) {
    if (!isString(patch)) throw new RPLError('Bad argument type');
    const hostText = host.value;
    const patchText = patch.value;
    if (n + patchText.length - 1 > hostText.length) {
      throw new RPLError('Bad argument value');
    }
    const out = hostText.slice(0, n - 1) + patchText
              + hostText.slice(n - 1 + patchText.length);
    s.push(Str(out));
    return;
  }

  if (isList(host)) {
    if (!isList(patch)) throw new RPLError('Bad argument type');
    const items = host.items;
    const rep   = patch.items;
    if (n + rep.length - 1 > items.length) {
      throw new RPLError('Bad argument value');
    }
    const out = [...items];
    for (let i = 0; i < rep.length; i++) out[n - 1 + i] = rep[i];
    s.push(RList(out));
    return;
  }

  if (isVector(host)) {
    if (!isVector(patch)) throw new RPLError('Bad argument type');
    const items = host.items;
    const rep   = patch.items;
    if (n + rep.length - 1 > items.length) {
      throw new RPLError('Bad argument value');
    }
    const out = [...items];
    for (let i = 0; i < rep.length; i++) out[n - 1 + i] = rep[i];
    s.push(Vector(out));
    return;
  }

  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 17, label: "REPL" });


register('SREPL', (s) => {
  const [hay, needle, repl] = s.popN(3);
  if (!isString(hay) || !isString(needle) || !isString(repl)) {
    throw new RPLError('Bad argument type');
  }
  if (needle.value.length === 0) {
    throw new RPLError('Bad argument value');
  }
  // Count occurrences manually so the push result matches the string
  // produced by String.prototype.replaceAll (no overlap surprises).
  let count = 0;
  let out = '';
  let i = 0;
  const src = hay.value;
  while (i < src.length) {
    if (src.startsWith(needle.value, i)) {
      out += repl.value;
      i += needle.value.length;
      count++;
    } else {
      out += src[i];
      i++;
    }
  }
  s.push(Str(out));
  s.push(Integer(BigInt(count)));
}, { category: 'Lists / strings', categoryOrder: 18, label: "SREPL" });


register('MAP', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // MAP caller label.  An RPLError thrown from inside the body
  // (validation or partial-eval failure) propagates with whatever
  // stack state the generator left behind; this sync path does not
  // snap/restore.
  _driveGen(runMap(s, 0), 'MAP program');
}, { category: 'Lists / strings', categoryOrder: 26, label: "MAP" });


register('SEQ', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // SEQ caller label.  The generator pops operands first, so an
  // RPLError mid-iteration leaves the operands consumed (no
  // snap/restore on this path).
  _driveGen(runSeq(s, 0), 'SEQ expression');
}, { category: 'Lists / strings', categoryOrder: 27, label: "SEQ" });


register('DOLIST', (s) => {
  // Sync fallback — drive the generator and reject a yield with the
  // DOLIST caller label.  The generator pops operands first, so an
  // RPLError mid-iteration leaves the operands consumed (no
  // snap/restore on this path).
  _driveGen(runDoList(s, 0), 'DOLIST program');
}, { category: 'Lists / strings', categoryOrder: 28, label: "DOLIST" });

function _currentDosubsFrame() {
  return _DOSUBS_STACK.length === 0
    ? null
    : _DOSUBS_STACK[_DOSUBS_STACK.length - 1];
}


register('DOSUBS', (s) => {
  // Sync fallback — drive the generator; reject yields with the
  // DOSUBS caller label.
  _driveGen(runDoSubs(s, 0), 'DOSUBS program');
}, { category: 'Lists / strings', categoryOrder: 29, label: "DOSUBS" });


/* NSUB / ENDSUB — only meaningful inside a DOSUBS window-program.
   HP50 AUR §13.5: NSUB pushes the 1-based index of the current
   window; ENDSUB pushes the total number of windows DOSUBS will
   process.  Called outside DOSUBS, both throw 'Undefined local
   name' — the HP50 error for these ops when there's no active
   DOSUBS frame.  We use the same RPLError text so program-level
   IFERR traps see a consistent message. */
register('NSUB', (s) => {
  const fr = _currentDosubsFrame();
  if (!fr) throw new RPLError('Undefined local name: NSUB');
  s.push(Integer(BigInt(fr.index)));
}, { category: 'Lists / strings', categoryOrder: 31, label: "NSUB" });


register('ENDSUB', (s) => {
  const fr = _currentDosubsFrame();
  if (!fr) throw new RPLError('Undefined local name: ENDSUB');
  s.push(Integer(BigInt(fr.total)));
}, { category: 'Lists / strings', categoryOrder: 32, label: "ENDSUB" });


register('STREAM', (s) => {
  // Sync fallback — drive the generator; reject yields with the
  // STREAM caller label.
  _driveGen(runStream(s, 0), 'STREAM program');
}, { category: 'Lists / strings', categoryOrder: 30, label: "STREAM" });


/* --------------- GETI / PUTI — auto-incrementing GET / PUT -----------
   HP50 AUR §13.2.  Like GET / PUT but leave the container on the
   stack and produce the (wrapping) next index — the classic "walk
   through a list element-by-element inside a loop" primitive.

     GETI  ( L i → L i+1 elt )
             Pops a container and a 1-based index; pushes back the
             container, the NEXT index (wrapping to 1 after the end),
             and the element at the ORIGINAL index.

     PUTI  ( L i val → L' i+1 )
             Like PUT but returns the incremented index on top instead
             of the replaced container alone.  Wrapping matches GETI.

   Wrapping rule: when the original index is the last valid slot, the
   next index wraps to 1 (HP50 behavior — lets `« GETI » DUPx` loops
   cycle forever; a user wanting a bounded walk pairs GETI with a
   size check).  The container pushed back is unchanged for GETI; for
   PUTI it's the patched container.

   Supported container types:
     - GETI: List, Vector, Matrix ({r c}), String.  Matrix indexing
       advances column-major: (r, c) → (r, c+1); wrapping c → 1 also
       advances r (and wrapping r → 1 when past the last row).
     - PUTI: List, Vector, Matrix.  String PUTI isn't defined by HP50
       (strings are immutable one-char-at-a-time here); throws.
   ----------------------------------------------------------------- */

function _advance1DIndex(idx, length) {
  // 1-based wrap.  Caller has already validated idx ∈ [1, length].
  return idx >= length ? 1 : idx + 1;
}


function _advanceMatrixIndex(r, c, rows, cols) {
  // Column-major advance so GETI walks a row before dropping down.
  if (c < cols) return { r, c: c + 1 };
  if (r < rows) return { r: r + 1, c: 1 };
  return { r: 1, c: 1 };                  // full wrap
}


register('GETI', (s) => {
  const [coll, idx] = s.popN(2);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(coll.items[n - 1]);
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(coll.items[n - 1]);
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const rows = coll.rows.length;
    const cols = rows > 0 ? coll.rows[0].length : 0;
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r < 1 || r > rows || c < 1 || c > cols) {
      throw new RPLError('Bad argument value');
    }
    const nxt = _advanceMatrixIndex(r, c, rows, cols);
    s.push(coll);
    s.push(RList([Integer(BigInt(nxt.r)), Integer(BigInt(nxt.c))]));
    s.push(coll.rows[r - 1][c - 1]);
    return;
  }
  if (isString(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.value.length) throw new RPLError('Bad argument value');
    const nxt = _advance1DIndex(n, coll.value.length);
    s.push(coll);
    s.push(Integer(BigInt(nxt)));
    s.push(Str(coll.value[n - 1]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 2, label: "GETI" });


register('PUTI', (s) => {
  const [coll, idx, val] = s.popN(3);
  if (isList(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(RList(items));
    s.push(Integer(BigInt(nxt)));
    return;
  }
  if (isVector(coll)) {
    const n = _toIntIdx(idx);
    if (n < 1 || n > coll.items.length) throw new RPLError('Bad argument value');
    const items = [...coll.items];
    items[n - 1] = val;
    const nxt = _advance1DIndex(n, coll.items.length);
    s.push(Vector(items));
    s.push(Integer(BigInt(nxt)));
    return;
  }
  if (isMatrix(coll)) {
    if (!isList(idx) || idx.items.length !== 2) {
      throw new RPLError('Bad argument type');
    }
    const rows = coll.rows.length;
    const cols = rows > 0 ? coll.rows[0].length : 0;
    const r = _toIntIdx(idx.items[0]);
    const c = _toIntIdx(idx.items[1]);
    if (r < 1 || r > rows || c < 1 || c > cols) {
      throw new RPLError('Bad argument value');
    }
    const newRows = coll.rows.map((ri, i) => {
      if (i !== r - 1) return ri;
      const copy = [...ri];
      copy[c - 1] = val;
      return copy;
    });
    const nxt = _advanceMatrixIndex(r, c, rows, cols);
    s.push(Matrix(newRows));
    s.push(RList([Integer(BigInt(nxt.r)), Integer(BigInt(nxt.c))]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Lists / strings', categoryOrder: 3, label: "PUTI" });


/* --------------- APPEND — add element to end of a list ---------------
   HP50 AUR §15.1.

     APPEND  ( L v → L' )  Append `v` as a new last element of list L.

   Accepts an RList host; any value type on the right.  Empty list OK.
   Polymorphic on Vector (append scalar to vector) and String (append
   character-string to string) was rejected by the HP50 spec — APPEND
   is the list op.  For a Vector, use `ARRY→ SWAP 1 + →ARRY`-style
   sequences.
   ----------------------------------------------------------------- */

register('APPEND', (s) => {
  const [host, val] = s.popN(2);
  if (!isList(host)) throw new RPLError('Bad argument type');
  s.push(RList([...host.items, val]));
}, { category: 'Lists / strings', categoryOrder: 8, label: "APPEND" });
