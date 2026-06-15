# TESTS — RPL5050 unit-test lane notes

**Scope.** This file is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

**Last updated.** Session 273 (2026-06-14).  Unit-tests lane run
(+8 String lex-compare symmetric-closure pins; first net-new
assertions in this lane since session 267's sibling delta — sessions
265 and 269 were snapshot-refresh runs).  29th
release-window run in this lane after sessions 156, 160, 164, 160-unit-tests,
168, 173, 177, 181, 185, 189, 193, 198, 202, 206, 210, 214, 218, 223, 228, 238, 242, 246, 250, 256, 260, 265, 269, 273).
Note: session-233-unit-tests lock was pruned as crashed (header-only
update; no session log written) — absorbed into a prior run's snapshot.
Note: session 238 log index claims a coverage snapshot was added but
no "## Coverage snapshot (session 238)" heading exists in the file —
the session-233 snapshot (5519) was the last actual snapshot written;
session 242 absorbs the gap.

Sibling deltas absorbed since the session-168 snapshot
(5246 → 5306, **+60** over four sibling sessions):
- Session 170 (command-support) — doc-only run; **0** assertion
  deltas (`docs/COMMANDS.md` Counts heading bump from "as of
  session 165" → "as of session 170" + paragraph extension folding
  in the s167 NEWOB-Rational widening + s168 NEWOB follow-up
  pin counts; NEWOB row Notes amendment citing the s167 source
  edit at `_newObCopy:9313`; session-log back-fill of sessions
  166 / 167 / 168 / 169-code-review).  No source / test edits.
- Session 171 (data-type-support) shipped **+22** assertions in
  `tests/test-types.mjs` (895 → 917) across two pinning clusters
  lifting session 166's n=0/n=1 boundary pattern + session 168's
  heterogeneous-output mixed-input pattern onto the forward-
  hyperbolic family that session 120 only pinned at n=2.
  Cluster 1 (+16): SINH/COSH/TANH/ASINH n=0 empty-List + n=1
  single-element boundary closures on bare-List + Tagged-of-List
  (4 ops × 4 cases).  COSH is the n=1 outlier (cosh(0)=1 vs.
  identity sinh/tanh/asinh(0)=0).  Cluster 2 (+6): COSH/TANH/
  ASINH heterogeneous-output mixed-input value pins on bare-List
  + T+L (3 ops × 2 axes; SINH already covered by s120's value-
  precise pin).  No source change — wrappers were live since
  session 120.
- Session 172 (rpl-programming) shipped **+33** assertions in
  `tests/test-reflection.mjs` (349 → 382) for the **NEWOB-on-
  Program outer-freeze parity fix** (sibling to session 167's
  NEWOB widening, but on the freeze-invariant axis rather than
  the AUR-table-row coverage axis).  Source edit at
  `www/src/rpl/ops.js:9341`: replaced the inline literal
  `{ type: 'program', tokens: Object.freeze([...v.tokens]) }`
  with `Program(v.tokens)` so the Program factory's matched
  outer + inner freeze pair fires (Program was the lone shape
  whose `_newObCopy` output silently violated the
  `Object.isFrozen(copy)` invariant every sibling shape met).
  33 pins: 2 direct Program freeze pins + 26 freeze-parity
  sweep pins (13 shapes × distinct + frozen) + 2 strict-mode
  mutation-rejection sentinels + 1 NEWOB→DECOMP equivalence
  smoke + 2 sweep precondition pins on Program.

Session 173 unit-tests deltas:
- **+12 SIN/COS/TAN bare-List + Tagged-of-List n=0/n=1 boundary
  pins** in `tests/test-types.mjs` (917 → 929) lifting session
  171 Cluster 1's forward-hyperbolic n=0/n=1 boundary pattern
  onto the forward-trig family (3 ops × 4 cases = bare-n=0 +
  T+L-n=0 + bare-n=1 + T+L-n=1).  Closes the explicit gap session
  171's "Open queue items" block flagged: "Forward-trig family
  (SIN / COS / TAN) bare-List + T+L axes — only the wrapper-V/M
  composition (s145) and Tagged-of-Vector (s130) pins exist on
  this family; the bare-List + T+L axes are unpinned even on n=2."
  n=1 input Real(0) is angle-mode-independent across all three ops
  (sin(0)=0, cos(0)=1, tan(0)=0 in RAD/DEG/GRD), so no
  setAngle/restore guard is required — the COS n=1 outlier
  (cos(0)=1) mirrors session 171's COSH outlier.  No source
  change — wrappers were live since session 145.
- **+18 ASIN/ACOS/ATAN bare-List + Tagged-of-List n=0/n=1
  boundary pins** in `tests/test-types.mjs` (929 → 947) lifting
  the same boundary pattern onto the inverse-trig family.
  Closes the second open-queue gap session 171 flagged ("Inverse-
  trig family (ASIN / ACOS / ATAN) bare-List + T+L axes — same
  gap as SIN/COS/TAN").  3 ops × 6 asserts (bare-n=0 + T+L-n=0
  one assert each + bare-n=1 + T+L-n=1 with both shape-and-value
  asserts because ACOS(0) = π/2 is angle-mode-DEPENDENT).  Uses
  the canonical RAD set / try / restore guard (mirror of the
  session 140/142 ASIN/ACOS Tagged-of-V pin pattern at
  `tests/test-types.mjs:5350-5400`).  ACOS is the inverse-trig
  n=1 outlier (acos(0) = π/2; matches Math.PI/2 to 1e-12),
  paralleling Cluster 1's COS outlier and session 171's COSH
  outlier.  No source change — wrappers were live since
  session 145.

The forward-trig and inverse-trig families are now fully pinned
across the bare-List + Tagged-of-List axes (n=0 / n=1 boundary;
n=2 was pinned by s120/s130/s145).  The two remaining post-ship
candidates from session 171's queue are the matrix-axis under
Tagged composition for COSH/TANH/ASINH non-identity outputs
(forward-hyperbolic continuation) and the heterogeneous-output
mixed-input value pins for SIN/COS/TAN and ASIN/ACOS/ATAN
(direct mirror of session 168 LOG/EXP/ALOG and session 171
COSH/TANH/ASINH heterogeneous patterns onto the trig families).

Sibling deltas absorbed in the session-168 snapshot
(5167 → 5206, **+39** over three sibling sessions):
- Session 165 (command-support) — doc-only run; **0** assertion
  deltas (`docs/COMMANDS.md` OBJ→ row Notes amendment folding in
  the s163 BinInt/Rational widening + Counts heading bump from
  "as of session 161" → "as of session 165" + session-log
  back-fill of sessions 162 / 163 / 164-code-review /
  164-unit-tests).  No source / test edits.
- Session 166 (data-type-support) shipped **+19** assertions
  in `tests/test-types.mjs` (870 → 889) across two pinning
  clusters lifting session 160's n=0 / n=1 boundary pattern
  onto the LOG / EXP / ALOG trio (Cluster 1, +12: 4 pins × 3
  ops covering bare-List n=0, Tagged-of-List n=0, bare-List
  n=1 integer-clean, Tagged-of-List n=1 integer-clean) and the
  ACOSH / ATANH dual pair (Cluster 2, +7: ATANH bare n=0,
  both ops Tagged-of-List n=0, both ops bare n=1, both ops
  Tagged-of-List n=1).  No source change — wrappers were live
  since session 145 / 158.
- Session 167 (rpl-programming) shipped **+20** assertions in
  `tests/test-reflection.mjs` (295 → 315) for the **NEWOB
  AUR-fidelity audit extension to the Rational shape**
  (sibling to session 163's OBJ→ widening).  Source edit at
  `www/src/rpl/ops.js:9313`: added the Rational branch
  (`if (isRational(v)) return Rational(v.n, v.d);`) to
  `_newObCopy` so all five enumerated numeric-scalar shapes
  (Real / Integer / BinaryInteger / Rational / Complex) share
  the same distinct-object identity contract.  20 pins across
  6 scenarios: distinct-object on Rational(3/4), sign on
  Rational(-7/2), n/1 type-stability on Rational(5/1), zero
  canonical on Rational(0/1), List-of-Rational + Tagged-of-
  Rational shallow-copy contract, NEWOB-then-OBJ→ on Rational
  composition with the s163 push-back branch.

Session 168 unit-tests deltas:
- **+34 NEWOB session-167 follow-up edge / composition pins**
  in `tests/test-reflection.mjs` (315 → 349) closing edges
  session 167's pin set did not enumerate.  The s167 widening
  enumerated every numeric-scalar shape (Real / Integer /
  BinaryInteger / Rational / Complex) in `_newObCopy` at
  `www/src/rpl/ops.js:9309-9314`, but only Rational got
  hard-assertion pin coverage; sessions 047 / 047b covered
  Real / List / Matrix at the distinct-object level only.
  This cluster pins the three remaining numeric-scalar arms
  (Integer / BinaryInteger / Complex) and extends Tagged-of-X
  composition coverage to all five enumerated numeric-scalar
  shapes (s167 covered Tagged-of-Rational only).  Pin set:
  Integer distinct-object + Integer(-7) negative-sign + BinInt
  #15h value+base preservation + BinInt #7o octal-base
  preservation (closes BIN_BASES quartet on NEWOB) + Complex
  re/im preservation + Tagged-of-Integer / Tagged-of-BinInt /
  Tagged-of-Complex / Tagged-of-Real shallow-copy contract
  (closes Tagged composition row across all five enumerated
  shapes) + Vector-of-Real shallow-copy contract (mirror of
  s167 List-of-Rational onto Vector container; pins
  `_newObCopy:9319` Vector branch's `slice()` rebuilds the
  items array but preserves inner Real identity) + empty-List
  rebuild (closes the n=0 List boundary that s047 only
  pinned on empty-Matrix) + List-of-Tagged nested composition
  (mirror of s146 nested-Program shallow-copy onto Tagged
  inner) + NEWOB-then-OBJ→ on BinaryInteger composition pin
  (companion to s167's NEWOB-then-OBJ→ on Rational; pins the
  s163 push-back branch composes correctly with s167's NEWOB
  Rational widening on the BinInt arm).
- **+6 LOG / EXP / ALOG heterogeneous-output mixed-input pins**
  in `tests/test-types.mjs` (889 → 895) closing the
  heterogeneous-output axis session 166 deferred (its scope was
  n=0 / n=1 boundary closures only).  Lifts session 162's
  bare-List heterogeneous mixed-input pattern + session 164's
  Tagged-of-List heterogeneous mixed-input pattern onto the
  LOG / EXP / ALOG trio (3 ops × 2 axes = 6 pins).  Per-op
  inputs use the natural identity points (LOG(1)=0, EXP(0)=1,
  ALOG(0)=1) paired with a non-identity value to surface
  per-position output divergence and pin per-element wrapper
  dispatch end-to-end:  `{ Real(10) Real(1) } LOG → { Real(1)
  Real(0) }` + Tagged-of-List variant; `{ Real(0) Real(1) }
  EXP → { Real(1) Real(e) }` + Tagged-of-List variant;
  `{ Real(0) Real(1) } ALOG → { Real(1) Real(10) }` + Tagged-
  of-List variant.

Sibling deltas absorbed since the session-160 snapshot
(5133 → 5156, **+23** over three sibling sessions):
- Session 161 (command-support) — doc-only run; **0** assertion
  deltas (`docs/COMMANDS.md` OBJ→ row Notes amendment closing
  the s156 R-012 filing pointer once s159 had landed the
  `isUnit` branch + Counts heading bump + session-log back-fill
  for sessions 158 / 159 / 160-code-review / 160-unit-tests +
  the s161 self-summary).  No source / test edits.
- Session 162 (data-type-support) shipped **+15** assertions
  in `test-types.mjs` (852 → 867) for the **LNP1 / EXPM
  bare-List + Tagged-of-List composition** clusters lifting
  session 158's LN/LOG/EXP/ALOG L+T axis onto the LNP1/EXPM
  dual pair.  Cluster 1 (9): bare-List Real-pass-through pair
  + Integer→Real-per-element pair (pins LNP1/EXPM bypass
  `_unaryCx` so no EXACT-mode Integer-stay-exact arm fires —
  DISTINCT from session 158 LN axis Integer-stay-Integer) +
  Tagged-of-List composition pair + heterogeneous-output
  mixed-input bare-List pair + LNP1 boundary-throw under
  bare-List.  Cluster 2 (6): LNP1/EXPM n=0 bare-List + n=0
  Tagged-of-List + n=1 single-element bare-List boundary pairs
  (mirror of session 160's LN n=0 / n=1 closures lifted onto
  the LNP1/EXPM dual).  No source change — wrappers were live
  since session 130 / 140.
- Session 163 (rpl-programming) shipped **+8** assertions in
  `test-reflection.mjs` (279 → 287) for the **OBJ→ AUR-fidelity
  audit extension to BinaryInteger and Rational**.  Source
  edit at `ops.js:6746-6762`: the existing Real/Integer
  push-back branch's guard expanded from
  `isReal(v) || isInteger(v)` to
  `isReal(v) || isInteger(v) || isBinaryInteger(v) ||
  isRational(v)` so all four numeric-scalar shapes share the
  same `s.push(v); return;` body (matches the s155 R-008 close
  rationale that AUR §3-149 lists no row for any numeric
  scalar).  Eight test blocks: BinInt push-back at three bases
  (#15h / #255d / #0b), Rational push-back (3/4) + Rational
  sign convention (-7/2), `OBJ->` ASCII alias parity on
  BinInt, and EVAL-as-literal-push pair (BinInt + Rational —
  guards against a refactor that re-routes BinInt through
  B→R during EVAL).

Session 164 unit-tests deltas:
- **+8 OBJ→ session-163 follow-up edge / composition pins**
  in `test-reflection.mjs` (287 → 295): Tagged-of-BinInt
  one-layer peel (3 sub-pins: depth=2, level-1 = "bn" Str,
  level-2 = #15h with base preserved); Tagged-of-Rational
  one-layer peel (1 conjunction pin closing Tagged composition
  for the second numeric-scalar shape s163 added); ASCII alias
  `OBJ->` on Rational (closes s163's alias-parity pin which
  only covered BinInt); BinInt at octal base #7o (closes the
  BIN_BASES quartet — s163 covered h/d/b only, missed 'o');
  Rational(0/1) zero-value boundary (mirror of s163's BinInt
  #0b zero pin onto the Rational arm); Rational(5/1)
  denominator-1 (pins n/1 NOT normalised to Integer through
  the OBJ→ push-back branch — distinct from s163's -7/2
  negative-numerator pin which has d>1).  All pins exercise
  the widened branch s163 added at `ops.js:6746` plus the
  existing Tagged peel at `:6690-6696`.  No source change.
- **+3 LNP1 / EXPM session-162 follow-up T+L composition
  edge pins** in `test-types.mjs` (867 → 870): LNP1 boundary-
  throw under Tagged-of-List `:l:{ Real(-1) }` → Infinite
  result (mirror of s162's bare-List boundary pin lifted onto
  T+L; pins inner handler's RPLError propagates through both
  outer Tagged peel AND the bare-List wrapper's apply loop —
  guards against a refactor that swallows inner throws under
  Tagged composition); LNP1 heterogeneous-output mixed-input
  under Tagged-of-List `:n:{ Real(-0.5) Real(0) }` →
  `:n:{ Real(log1p(-0.5)) Real(0) }` (pins per-element
  distinct-value output under Tagged peel — NOT a uniform-
  output short-circuit); EXPM heterogeneous-output mixed-input
  under Tagged-of-List `:e:{ Real(1) Real(0) }` →
  `:e:{ Real(expm1(1)) Real(0) }` (companion pin closing the
  LNP1/EXPM dual pair on the T+L heterogeneous-output axis).

Sibling deltas absorbed since the session-156 snapshot
(5086 → 5120, **+34** over three sibling sessions):
- Session 157 (command-support) — doc-only run; **0** assertion
  deltas (`docs/COMMANDS.md` OBJ→ row Notes amendment + Counts
  heading bump + session-log back-fill closing the s156 R-012
  filing pointer).  No source / test edits.
- Session 158 (data-type-support) shipped **+19** assertions in
  `test-types.mjs` (829 → 848) across two clusters lifting
  session 150's wrapper-VM-under-Tagged work onto the LIST axis:
  Cluster 1 (ACOSH/ATANH bare-List + Tagged-of-List with
  Integer-stay-exact, out-of-domain Real→Complex bypass, and
  heterogeneous per-element domain dispatch) and Cluster 2
  (LN/LOG/EXP/ALOG bare-List + Tagged-of-List with EXACT-mode
  Integer-stay-exact, distinct-position outputs, heterogeneous
  stay-symbolic + integer-clean, APPROX-mode bypass).  No
  source change — the wrapper paths were already live since
  session 145 / 150.
- Session 159 (rpl-programming) shipped **+15** assertions in
  `test-reflection.mjs` (258 → 273) for the **R-012 close** —
  added the missing `isUnit` branch to OBJ→'s dispatch per AUR
  §3-149's `x_unit → x  1_unit` row (1-line edit at
  `ops.js:6720-6738`), plus the comment-block extension at
  `:6605-6650` documenting all eleven AUR §3-149 rows now
  covered.  Eight test blocks pin the new shape: basic
  decomposition, *-fold round-trip, multi-symbol uexpr,
  negative-value sign rule, ASCII alias OBJ-> parity,
  Tagged-of-Unit one-layer-peel composition, regression guard
  against future Name-instead-of-Unit refactors, and reverse-
  uexpr (1/m) shape preservation.

Session 160 unit-tests deltas:
- **+6 OBJ→ Unit follow-up boundary pins** in
  `test-reflection.mjs` (273 → 279) closing edges session 159's
  R-012 pin set did not enumerate.  Five blocks: zero-value
  boundary `0_m → 0  1_m` (closes value=0 corner between s159
  positive 5_m and negative -3_kg pins); fractional value
  `2.5_m → 2.5  1_m` (non-integer Real passes through value
  extraction unchanged); higher-power uexpr `3_m^2 → 3  1_m^2`
  (exponent ≠ ±1 preserved on prototype — distinct from s159
  +1 / -1 exponent pins); multi-symbol round-trip
  `5_m/s OBJ→ * → 5_m/s` (uexpr ordering preserved through the
  *-fold path); higher-power round-trip `3_m^2 OBJ→ * → 3_m^2`
  (exponent=2 reconstructed exactly).
- **+4 transcendental wrapper-LIST n=0 / n=1 boundary pins**
  in `test-types.mjs` (848 → 852) lifting session 156's empty-
  V/L/P n=0 boundary closure pattern onto the session-158
  wrapper-LIST composition.  Cluster 1 (direct-registered
  ACOSH): `{ } ACOSH → { }` (n=0 boundary on direct-registered
  bare wrapper).  Cluster 2 (LN through `_unaryCx`):
  `{ } LN → { }` (n=0 bare); `:l:{ } LN → :l:{ }` (n=0 under
  Tagged composition; outer tag preserved across empty inner
  dispatch); `{ Integer(1) } LN → { Integer(0) }` (n=1 single-
  element shoulder between s160 n=0 and s158 n=2 pins — guards
  against a refactor that special-cases n=1 to the bare-scalar
  code path bypassing `_withListUnary`).
- **+3 MODULO ARITH follow-up pins** in `test-algebra.mjs`
  (1058 → 1061) closing edges session 156's MODULO ARITH
  follow-up pin-set did not enumerate.  Two DIV2MOD MODSTO
  consultation pins (m=12 baseline + m=7 alternate, with
  {64, 13} input — mirror of s156 DIVMOD MODSTO pair on the
  two-result sibling per AUR §3-62; pins q-arm tracks DIVMOD
  across MODSTO change while r-arm independently routes
  through the two-result return).  One GCDMOD(0, 0) both-zero
  edge: rejects with Bad argument value (mathematically-
  undefined gcd(0,0); closes the s156 gcd-with-one-zero
  identity pair on the both-zero corner — guards against a
  refactor that silently returns 0).

Sibling deltas absorbed since the session-147 snapshot (4903 → 5063,
**+160** over eight sibling sessions):

Sibling deltas absorbed since the session-147 snapshot (4903 → 5063,
**+160** over eight sibling sessions):
- Session 148 (code-review) — doc-only run; **0** assertion deltas
  (REVIEW.md re-aging / new R-008 ship-priority filing).
- Session 149 (command-support) shipped **+30** assertions in
  `test-algebra.mjs` (1014 → 1044) for the HP50 !Þ MODULO ARITH
  cluster completion: `EXPANDMOD` / `FACTORMOD` / `GCDMOD` /
  `DIVMOD` / `DIV2MOD` (AUR §3-80 / §3-83 / §3-96 / §3-63 /
  §3-62) with new `_modDivBigInt` exact-then-inverse helper.
- Session 150 (data-type-support) shipped **+26** assertions in
  `test-types.mjs` (803 → 829) across three transcendental
  Tagged-V/M wrapper composition clusters (inverse-trig DEG-mode,
  forward-hyperbolic bare-scalar `_exactUnaryLift`, LN/LOG/EXP/
  ALOG Tagged-V/M).  Note: session 150 also out-of-scope edited
  `www/src/rpl/state.js:139` (casVx factory default `'X'` →
  `'x'`); D-001 was filed against this and partial-fixed by an
  interactive `session-file-explorer` lane; persist 39/1 → 40/0
  by session-152 close.  Session 151 added +25 to test-persist
  separately for casVx persistence pins (40 → 66 — see test-
  persist row in the table below).
- Session 151 (rpl-programming) shipped **+71** assertions in
  `test-control-flow.mjs` (704 → 775) — symmetric pin-set to
  session 141's IFERR work, this time covering CASE clauses,
  fully-closed START/NEXT and START/STEP, DO/UNTIL, FOR/STEP.
  No source change — every pin exercises behaviour live since
  session 088's generator substrate.
- Session 152 (code-review) — doc-only run; **0** assertion
  deltas (REVIEW.md re-aging; filed C-011 + D-001).
- Session 153 (command-support) shipped **+8** assertions in
  `test-numerics.mjs` (695 → 703) for the C-011 close (COMB /
  PERM Rational-rejection cluster) plus the INVMOD `TODO`
  retire (deliberate-deviation codification, doc-only).
- Session 154 (data-type-support) — doc-only audit (`docs/
  DATA_TYPES.md` matrix reconciliation against live ops); **0**
  assertion deltas.
- Session 155 (rpl-programming) shipped **+5** net new + 2
  flipped assertions in `test-reflection.mjs` (251 — for
  the R-008 audit close (OBJ→ Real-branch fidelity fix +
  Tagged-branch phantom retraction; AUR §3-149 verbatim
  re-read).  Real-branch dropped the mantissa/exponent split
  (now 1-in / 1-out repush), Tagged-branch confirmed
  `Str(v.tag)` is AUR-correct (the `"tag"` notation is the
  AUR's String-literal convention, not quoted-Name).

Session 156 unit-tests deltas:
- **+7 OBJ→ session-155 follow-up edge / composition pins**
  in `test-reflection.mjs` (251 → 258): empty Vector → just
  `{0}` size-list (no items pushed; AUR §3-149 n=0 boundary
  closure for the Vector row); empty List → just Integer(0)
  count (n=0 boundary closure for the List row); empty
  Program → just Integer(0) count (symmetric to empty-List;
  pins the unconditional count for round-trip via →PRG);
  Real(-1500) → -1500 (no sign decomposition; closes the
  negative-Real branch session 155 left to symmetry); Tagged-
  of-Tagged composition (3 sub-pins: depth=2 one-layer peel,
  outer "outer" String on level 1, inner :inner:7 Tagged
  preserved on level 2; guards against a recursive-peel
  refactor).  R-008 scope was Real and Tagged branches only;
  these close edges the audit pin-set didn't enumerate.
- **+10 Session-149 MODULO ARITH cluster follow-up pins**
  in `test-algebra.mjs` (1048 → 1058) across six branches:
  DIV2MOD on Vector → Bad argument type (mirror of session-
  149's DIVMOD-Vector reject — the two-result sibling was
  unpinned); DIVMOD on Complex (level 2) → Bad argument type;
  DIVMOD on String (level 2) → Bad argument type (extends
  the session-149 Vector pin onto the per-arg type-check
  fall-throughs); GCDMOD(15, 0) and GCDMOD(0, 15) mod 13 →
  Integer(2) (gcd-with-zero identity edge of the extended-
  Euclidean algorithm; both directions); EXPANDMOD(-7) mod
  12 → Integer(5) centered (negative-input branch of
  `_centerMod`); FACTORMOD m=2 → Integer(1) (smallest prime
  modulus accepted; previously unpinned); FACTORMOD m=99 →
  Bad argument value (largest composite below the >=100
  cutoff; symmetric to session-149's m=101 prime-but-too-
  large reject); DIVMOD MODSTO consultation pair (m=12
  baseline 64/13 → 4 + m=7 alternate 64/13 → -1; only
  EXPANDMOD's MODSTO sensitivity was pinned by session 149).
- **+6 C-011 follow-up COMB/PERM rejection-arm composition
  pins** in `test-numerics.mjs` (701 → 707): Tagged(Rational)
  on level 2 (Tagged-transparency unwraps then C-011 narrow
  guard fires — composition arm session 153 left unpinned);
  Tagged(Rational) on level 1 (PERM symmetric); BinInt COMB
  + BinInt PERM (out of scope per AUR §3-29; guards against
  a session-115 FLOOR/CEIL/IP/FP-style widening landing on
  COMB/PERM); Vector COMB (no V/M distribution defined; only
  List × scalar broadcast per session-065 pin); negative-
  integer-valued Rational(-5,1) COMB (negative-arm of session
  153's positive-only Rat(5,1) reject).
- **R-012 filed** (REVIEW.md, `Findings — RPL` bucket): OBJ→
  on a Unit value rejects with `Bad argument type` instead of
  pushing `x  1_unit` per AUR §3-149.  Discovered while pinning
  the OBJ→ session-156 cluster; surfaces a third row of the
  AUR §3-149 table that R-008's audit (Real / Tagged only)
  did not enumerate.  Filed as ship-stretch — owner =
  `rpl5050-rpl-programming`, lane = `rpl5050-unit-tests`
  filed-only per the no-fix-source-bugs lane rule.  No
  `.skip`'d test added; the REVIEW.md finding is the load-
  bearing record.

Sibling deltas absorbed since the session-142 snapshot (4734 → 4883,
**+149** over four sibling sessions):
- Session 143 (code-review) — doc-only run; **0** assertion deltas
  (REVIEW.md re-aging / open-finding bumps; no source or test edits).
- Session 144 (command-support) shipped **+29** assertions in
  `test-algebra.mjs` (985 → 1014) for the HP50 CAS MODULO ARITH
  cluster (MODSTO + ADDTMOD/SUBTMOD/MULTMOD/POWMOD) plus **+2**
  assertions in `test-persist.mjs` (38 → 40) for the new
  `casModulo` BigInt slot persistence round-trip.
- Session 145 (data-type-support) shipped **+41** assertions in
  `test-types.mjs` (762 → 803) across three EXACT-mode lift
  clusters: forward-trig SIN/COS/TAN integer-stay-exact (13);
  LN/LOG/EXP/ALOG integer-clean / Rational-stay-symbolic (~14);
  bespoke-V/M inner-Tagged-rejection grid M-axis closure on RE/IM
  (the remaining 2-axis cells session 142 Cluster 3 left half-open).
- Session 146 (rpl-programming) shipped **+29** assertions in
  `test-control-flow.mjs` (675 → 704) plus **+50** in
  `test-reflection.mjs` (196 → 246) for Program/structural
  round-trip pins.  No source edits this run.

Session 147 unit-tests deltas:
- **+7 PICK / PICK3 / UNPICK / NDUPN rejection-path assertions**
  in `test-stack-ops.mjs` (41 → 48): PICK -1 → Bad argument
  value (negative-N branch of wrapper k<1 guard, distinct from
  the existing 0 PICK pin); PICK 5 with depth 2 → Too few
  arguments (Stack.pick `n<level` guard — closes the PICK
  depth-overrun branch session 137 left for sibling ops);
  PICK 1.5 → Bad argument value (`!Number.isInteger` branch of
  wrapper guard, distinct from negative/zero rejects); PICK
  String → Bad argument type (`toRealOrThrow` rejection at
  wrapper, distinct from value-domain rejects); PICK3 on
  depth-2 stack → Too few arguments (closes PICK3 rejection
  branch — file previously had only the (100,200,300) happy-
  path pin); UNPICK -1 → Bad argument value (negative-N branch
  of `_toPosIntIndex`, distinct from session-137 0-UNPICK pin);
  NDUPN with only count on stack → Too few arguments (s.depth<1
  guard at ops.js:7255, distinct from session-137 NDUPN-negative-
  N reject which fires earlier in `_toNonNegIntCount`).
- **+8 NSIGMA / NΣ + MEAN / VAR / SDEV rejection-path + canonical
  ΣX / ΣX2 col-0 positive assertions** in `test-stats.mjs`
  (47 → 55).  Three reject-arm closures + one positive-arm
  closure pattern: NSIGMA on Real → Bad argument type
  (canonical-name fall-through at ops.js:12177, was unpinned);
  NΣ on Real → Bad argument type (symbol-alias delegates to
  NSIGMA at ops.js:12179, alias-arm reject was unpinned);
  NΣ on empty Vector → Bad argument value (Vector arm at
  ops.js:12168 — existing s064 pin only covered the empty-
  Matrix arm at ops.js:12173); MEAN / VAR / SDEV on Real → Bad
  argument type (bottom-of-fn fallthroughs at ops.js:10260 /
  10270 / 10280, all three reject branches were unpinned);
  canonical ΣX on XY matrix col-0 → 10 + canonical ΣX² on XY
  matrix col-0 → 30 (canonical-name positive coverage; the
  file previously only had the SX / SX2 alias-arm pins from
  s064 / s132).  Mirror of session 132's alias-positive-
  coverage closure but in the OTHER direction —
  canonical-positive-coverage closure.
- **+5 Unit op surface assertions** in `test-units.mjs`
  (51 → 56): 5_m - 1_s → Inconsistent units ('-' subtractive-
  arm reject, distinct from session-064 '+' additive-arm pin);
  1_kg + 1_m → Inconsistent units (different dim pair than
  the existing m-vs-s pin; defense against a refactor that
  special-cased length-vs-time); ABS -1_N → 1_N (composite-
  uexpr ABS keeps the Newton-alias uexpr intact, only flips
  sign — mirror of session-137's NEG -1_N pin on the ABS arm);
  2_m ^ -1 → 0.5_m^-1 (negative-exponent power flips uexpr
  sign via powerUexpr; existing ^ pin uses positive 3); 2_m ^ 0
  → Real(1) (zero-exponent collapses uexpr to empty → unwraps
  to dimensionless Real(1); previously unpinned edge of the ^
  dispatch).

Sibling deltas absorbed since the session-137 snapshot (4586 → 4711,
**+125** over four sibling sessions):
- Session 138 (code-review) — doc-only run; **0** assertion deltas
  (REVIEW.md prelude / baseline-block / per-finding age bumps;
  no source or test edits).
- Session 139 (command-support) shipped **+13** assertions in
  `test-algebra.mjs` (972 → 985): LIN (5) + LIMIT/lim alias (8)
  via Giac.
- Session 140 (data-type-support) shipped **+36** assertions in
  `test-types.mjs` (703 → 739): three wrapper-VM Tagged-of-V/M
  composition clusters (hyperbolic 9 + inverse-trig/EXPM 9 +
  ARG bare V/M and ARG/CONJ/RE/IM Tagged-of-V/M with bespoke
  V/M dispatch INSIDE the 2-deep wrapper, 18).
- Session 141 (rpl-programming) shipped **+76** assertions in
  `test-control-flow.mjs` (599 → 675); session log not yet
  written but the lock body is gracefully released and the
  control-flow file is fully green.

Session 142 unit-tests deltas:
- **+23 assertions in `test-types.mjs`** (739 → 762) across three
  substantive clusters that surfaced as next-session candidates
  in session 140's log:
  - **Cluster 1 — Inverse-trig + inverse-hyp `_exactUnaryLift`
    Integer-stay-exact path (12 assertions).**  ASIN/ACOS/ATAN
    bare-scalar Integer-stay-exact: ASIN(Integer(0)) → Integer(0)
    RAD; ACOS(Integer(1)) → Integer(0) RAD; ATAN(Integer(0)) →
    Integer(0) RAD; ATAN(Integer(1)) RAD → Symbolic ATAN(1) (NOT
    integer-clean — stay-symbolic via _exactUnaryLift); plus the
    DEG-mode integer-clean folds (ASIN(Integer(1)) DEG → 90;
    ACOS(Integer(0)) DEG → 90; ATAN(Integer(1)) DEG → 45) and
    the Rational arm (ASIN(Rational(1,2)) DEG → 30 + the negative
    ASIN(Rational(1,3)) DEG → Symbolic).  Inverse-hyp trio:
    ASINH(Integer(0)) / ACOSH(Integer(1)) / ATANH(Integer(0)) all
    → Integer(0).  Session 140 Cluster 1 only pinned the SINH
    Tagged-V variant — bare-scalar Integer-stay-exact for the
    inverse-trig + inverse-hyp families was unpinned.
  - **Cluster 2 — CONJ / RE / IM / ARG on Tagged-of-Symbolic
    (5 assertions).**  4-op surface × Tagged-of-Symbolic
    composition: outer Tagged preserved, inner Symbolic gets
    wrapped in AstFn('CONJ' | 'RE' | 'IM' | 'ARG', [Name(X)])
    via the `_isSymOperand` branch in the bespoke handler.
    The matrix listed `T ✓` and `Sy ✓` independently per op
    since session 100 / 110 but the COMPOSITION was unpinned.
    Distinct from session 140 Cluster 3's Tagged-of-V/M pins —
    Tagged-of-Sy exercises the `_isSymOperand` lift branch
    inside the bespoke handler rather than the V/M kind branches.
  - **Cluster 3 — Inner-Tagged-inside-Vector / Matrix rejection
    on bespoke V/M handlers ARG / CONJ / RE / IM (6 assertions).**
    All four ops reject `Vector(:x:Complex(3,4))` with 'Bad
    argument type' (the per-element `_argScalar` /
    `_conjScalar` / `_reScalar` / `_imScalar` handlers are not
    Tagged-aware), plus the M-axis variant on ARG and CONJ.
    Mirror of session 140 Cluster 1's
    `Vec[:x:Real(0), :y:Real(0)] SINH` rejection but on the
    bespoke V/M-handler family (different wrapper shape:
    2-deep with bespoke V/M dispatch inside vs. session 140's
    3-deep `_withVMUnary` chain).

Sibling deltas absorbed since the session-132 snapshot (4491 → 4558,
**+67** over four sibling sessions):
- Session 133 (code-review) — doc-only run; **0** assertion deltas
  (re-aged X-003/O-007/O-009; promoted C-007/O-010 to fully
  resolved; promoted T-002 to resolved by session 132 unit-tests).
- Session 134 (command-support) — doc-only back-fill closing the
  C-008 COMMANDS.md row updates (HALT/CONT/KILL Notes appended
  with session-131 DOLIST/DOSUBS/STREAM addendum; Counts heading
  bumped 458 → 463) plus three more phantom-row retires
  (`GXROOT` / `LQD` / `POLYEVAL`); **0** assertion deltas.
- Session 135 (data-type-support) shipped **+31** assertions in
  `test-types.mjs` (672 → 703): 8 Q × V/M arithmetic broadcast
  pins + 11 Tagged-of-V/M binary composition pins + 12 Tagged
  tag-identity & BinInt cross-base equality pins.
- Session 136 (rpl-programming) shipped **+36** assertions in
  `test-control-flow.mjs` (563 → 599) for the
  WHILE/REPEAT-DO/UNTIL-START-FOR auto-close-on-missing-END/NEXT
  pattern (mirrors the earlier IF / IFERR / CASE auto-close work
  — now every structural opener auto-closes at end-of-program).

Session 137 unit-tests deltas:
- **+9 stack-op edge-path assertions** in `test-stack-ops.mjs`
  (32 → 41): DUPDUP positive `7 → 7 7 7` (existing block only
  pinned the DUPDUP empty-stack rejection); ROLL N>depth → Too
  few; ROLLD 0 no-op + ROLLD N>depth → Too few; UNPICK 0 → Bad
  argument value (the `_toPosIntIndex` reject-zero contract,
  distinct from the `_toNonNegIntCount` accept-zero used by
  ROLL/ROLLD/DROPN/DUPN/NDUPN); UNPICK N>depth → Too few; DROPN
  N>depth → Too few; DUPN N>depth → Too few; NDUPN -1 → Bad
  argument value.  Every new pin closes a branch the session-064
  block specifically left uncovered (the block has thorough L1-
  too-few coverage but no `s.depth<n`-after-pop coverage and no
  per-op negative-N coverage outside DROPN/PICK).
- **+12 Unit-op symmetric / composite / mixed-dim assertions**
  in `test-units.mjs` (39 → 51, multi-assert per site): `5_m -
  2_m → 3_m` + `1_km - 500_m → 0.5_km` (subtraction was never
  exercised — closes the `+ - * /` quartet); `3 * 2_m → 6_m`
  (left-Real reorder symmetric to the existing `2_m * 3` pin);
  `6_m / 2 → 3_m` (Unit/Real scalar divisor — existing pins
  cover Unit*Real and same-dim Unit/Unit but not this branch);
  `6_m / 2_s → 3_m/s` (mixed-dim composite uexpr — exercises
  `multiplyUexpr(_, inverseUexpr(_))`; existing pin only covered
  the dimensionless cancellation case); `INV 2_m/s → 0.5_s/m`
  (composite uexpr inversion; existing INV pin is single-atom
  only); `SQ 3_m/s → 9_m^2/s^2` (composite SQ — existing pin
  single-atom only); `NEG 1_N → -1_N` (composite uexpr atom);
  `6_m / 0 → Infinite result` (zero-divisor check fires on the
  Unit/Real branch too — distinct error path from "Inconsistent
  units").
- **+7 stats-op ASCII-alias rejection-path assertions** in
  `test-stats.mjs` (40 → 47): SX on Real → Bad arg type;
  SY2 on 1-col Matrix → Invalid dimension; SXY on Real → Bad
  arg type; MAXS on Real → Bad arg type + MAXS on empty Vector
  → Bad arg value; MINS on Real → Bad arg type + MINS on empty
  Matrix → Bad arg value.  Symmetric closure pass: session 132
  closed the alias POSITIVE coverage (SX2 / SY / MINS); this
  session closes the alias REJECTION coverage so a refactor
  that special-cases an alias and bypasses the canonical
  guard-set is caught.

Sibling deltas absorbed since the session-127 snapshot (4374 → 4474,
**+100** over four sibling sessions):
- Session 128 (code-review) — doc-only run; **0** assertion deltas
  (filed T-002 against this lane re: TESTS.md session-121 stale-prune
  drift, closed below).
- Session 129 (command-support) — doc-only back-fill closing the
  C-007 PROMPT / IFT / IFTE row updates in `docs/COMMANDS.md`;
  **0** assertion deltas.
- Session 130 (data-type-support) shipped **+35** assertions in
  `test-types.mjs` (637 → 672): 12 wrapper-VM Tagged-of-V/M
  composition pins + 12 BinInt × Rational compare / equality /
  SAME-strict pins + 11 Tagged-of-List binary composition pins.
- Session 131 (rpl-programming) shipped **+65** assertions in
  `test-control-flow.mjs` (498 → 563) for HALT/PROMPT lift through
  DOLIST / DOSUBS / STREAM bodies.

Session 132 unit-tests deltas:
- **T-002 closed (REVIEW.md doc finding).**  The four `docs/TESTS.md`
  sites that claimed "session 121 stale-pruned without writing
  `logs/session-121.md`" have been re-phrased to record the actual
  evidence.  `logs/session-121.md` does in fact exist (7818 bytes,
  mtime 2026-04-25 01:04:30 — two seconds before the lock body's
  `releasedAt` of 01:04:43, the natural "write log, then unlink
  lock" ordering).  The misclaim originated from a session-122
  `ls logs/` snapshot taken before the session-121 commit landed,
  or against a stale view.  Pure-doc edit, no behavior risk.
- **+9 stats-op ASCII-alias positive-coverage closure +
  multi-column MAXΣ assertions** in `test-stats.mjs` (31 → 40):
  - SX2 / SY / MINS positive end-to-end pins.  The file's top-of-
    file comment promises that SX, SX2, SY, SY2, SXY, MAXS, MINS
    are ASCII aliases that route to the same backend, but only 5
    of 7 had a `lookup(<alias>)` exercise prior to this run —
    `grep -rn "lookup\\('SX2\\|lookup\\('SY'\\|lookup\\('MINS\\)"
    tests/` returned no matches at session-132 entry.  6 new pins
    close the gap: SX2 on Vector + on XY-matrix col-0; SY on XY
    matrix + 1-col-rejection (Invalid dimension via the alias);
    MINS on XY matrix → 2-elem Vector + on bare Vector → 1-elem
    Vector.
  - MAXΣ multi-column positive coverage mirroring session 127's
    MINΣ 3-col pin: a 3-col Matrix with per-column maxes [3, 8, 4]
    (all distinct so a column-iteration drop or duplicate would
    surface) + a corner-case all-negative Vector returning the
    least-negative entry (-3).  Closes the symmetry the
    session-127 MINΣ block left open.
- **+8 Z × Q reverse-direction comparison assertions** in
  `test-comparisons.mjs` (103 → 111), extending the session-107
  Rational cluster.  The session-107 Q × Z block pinned
  Q-on-level-2 / Z-on-level-1 for == and one ordering pin per
  direction; reverse direction (Z-on-level-2) for == / <> / SAME,
  the missing ≤ at the cross-type equal boundary, and the Z × Q
  sign-crossing < direction were not pinned.  Adds: Z == Q
  (equal + unequal), Z <> Q + Q <> Z, Z SAME Q (equal + unequal),
  Integer(-1) < Rational(1/2) sign-crossing, Rational(2/1) ≤
  Integer(2) at the equal-value cross-type boundary.

Prior sibling deltas absorbed in the session-127 snapshot
(4232 → 4302, **+70**):
- Session 124 (command-support) shipped **+25** assertions in
  `test-algebra.mjs` (938 → 963) for the LNAME + GBASIS ops
  (15 LNAME + 8 GBASIS + 2 absorbed during the phantom-row retire).
- Session 125 (data-type-support) shipped **+43** assertions in
  `test-types.mjs` (594 → 637) for the arity-2 numeric-family List
  distribution + Tagged-of-List composition + Q→R degradation on
  MIN/MAX/MOD pins.
- Session 126 (rpl-programming) **closed concurrently** during this
  run — shipped **+46** to `tests/test-control-flow.mjs` (452 → 498)
  for HALT/PROMPT lift-through-SEQ+MAP.  Mid-run baseline showed 491
  passing + 4 failing on session-126's pre-pinned in-progress
  assertions (CONT-clears-banner-after-SEQ-PROMPT,
  SEQ-completes-after-CONT, sync-fallback SEQ HALT-reject,
  sync-fallback MAP HALT-reject); session 126's implementation
  closed the gap before session-127 exit and the file is now fully
  green.  This lane explicitly did not touch the file at any point —
  session 126 held the lock on `tests/test-control-flow.mjs`,
  `www/src/rpl/ops.js`, `docs/RPL.md` throughout.

Session 127 unit-tests deltas:
- **+9 LNAME edge-case assertions** in `test-algebra.mjs`,
  extending the session-124 cluster:
  - 3 cross-type rejection guards (LNAME on String, Name, Complex
    → `Bad argument type`) — confirms the `isSymbolic(v)` gate
    rejects every non-Symbolic input uniformly.
  - 1 return-shape pin: LNAME emits Names with `quoted=false`,
    so STO/RCL/EVAL round-trip through them as the AUR §3-136
    contract implies.
  - 1 constant-via-built-ins-and-binop pin: `5 + SIN(2)` → empty
    Vector — exercises the binary-op descent path under a built-in
    fn, complementing session 124's two-fn-no-binop case.
  - 3 mixed-built-in-wrapping-user-fn pins: `COS(MYFUNC(X))` →
    `[MYFUNC, X]`, length-DESC ordering (MYFUNC,X), with
    cross-check that COS itself is dropped — pins the contract
    that visit() recurses into a built-in's args even though it
    drops the built-in's name.
- **+8 Q × C / Q × R cross-type comparison assertions** in
  `test-comparisons.mjs`, extending the session-107 Rational
  cluster:
  - `Q < C` → `Bad argument type` (Complex partial-order rejection
    holds for the Q corner of the lattice too).
  - 4 Q × C ==/<>/SAME pins: non-zero im → 0/1/0; im=0 value-equal
    → 1.  Pins the Q widening into ℂ for both equal and unequal
    cases.
  - `Q(1/3) == R(0.333)` → 0 — pins the *unequal* branch of Q
    widening to its full Decimal precision (companion to session
    107's Q(1/2) == R(0.5) equal-value pin; catches a future
    exact-rational-comparator regression).
  - 2 Q × R ordering pins: `Q(1/4) < R(0.3)` and `R(0.3) > Q(1/4)`
    — direction not previously pinned.
- **+11 stats-op rejection-path assertions** in `test-stats.mjs`,
  catching up on the symmetric Y-family + MAXΣ/MINΣ rejection
  branches the session-064 block omitted:
  - `ΣY2` 1-col-Matrix → Invalid dimension (mirror of the existing
    ΣY pin).
  - `ΣXY` × 3 reject branches: Real → Bad argument type, 1-col →
    Invalid dimension, empty → Bad argument value.
  - `ΣX2` Real → Bad argument type (symmetric uncovered sibling
    of ΣX's already-pinned reject).
  - `MAXΣ` × 3 reject branches: Real, empty Vector, empty Matrix.
  - `MINΣ` 3-col Matrix positive case: returns 3-element per-column
    min Vector with all three columns distinct (catches a
    column-iteration drop/duplicate regression that 2-col coverage
    couldn't surface).
  - `SXY` ASCII-alias end-to-end pin (the only Y-family alias that
    wasn't already exercised positive end-to-end).

Prior session-122 snapshot deltas (retained for context — the
session-122 close was 4232 / 0 in `test-all.mjs`, 38 / 0 in
`test-persist.mjs`, 22 / 0 in `sanity.mjs`):
- Session 119 (command-support) shipped **+25** assertions in
  `test-algebra.mjs` (913 → 938) for the EGV / RSD / GREDUCE
  ops + `_astToRplValue` neg-num lift.
- Session 120 (data-type-support) shipped **+68** assertions in
  `test-types.mjs` (526 → 594) for hyperbolic Tagged transparency
  + percent Tagged tag-drop + Rational unary stay-exact pins.
- Session 121 (rpl-programming) shipped **+46** PROMPT / KILL
  assertions in `test-control-flow.mjs` (402 → 448).  The
  lock body has the `heartbeatAt === startedAt` signature that
  *looks* stale-prune-shaped at the lock layer, but the
  corresponding `logs/session-121.md` was in fact written within
  the lock window (7818 bytes, mtime 2026-04-25 01:04:30 — two
  seconds before the lock body's `releasedAt` of 01:04:43, the
  natural "write log, then unlink lock" ordering).  The earlier
  session-122 narrative claiming "stale-pruned without writing
  `logs/session-121.md`" was based on a `ls logs/` snapshot taken
  before the session-121 commit landed (or against a stale view);
  the missing-log signal does not apply.  Future improvement
  noted in REVIEW.md T-002: add a `releaseReason` field to the
  lock body so graceful-release vs. prune is unambiguous for
  audits.  The session-121 PROMPT cluster does not collide with
  the session-122 edits — different line ranges (s121 at
  `:3656-3929`, s122 at `:432`/`:660`/`:825`/`:2098`).

Session 122 unit-tests deltas:
- **+4 new regression guards** in `test-control-flow.mjs`,
  closing queue item #2 from session 117 (the 5 `let threw`
  sites in `test-control-flow.mjs`).  Migrated 4 of the 5
  sites to `assertThrows()` + added a value-add regression
  guard at each:
  - `:432` (START 1/0 in body) — pinned the previously-
    unguarded HP50 error-message shape to `/Infinite result/`.
  - `:660` (IFERR-without-THEN with END) — added stack-
    rollback guard `s.depth === 1 && isProgram(s.peek())`
    (previously only the throw was checked).
  - `:825` (FOR/STEP of 0) — pinned exact message
    `=== 'STEP of 0'`.
  - `:2098` (IFERR with neither THEN nor END) — same
    stack-rollback guard as the with-END variant; pins that
    the no-END path also restores Program to level 1.
  The 5th site at `:919` is the negated form
  `assert(!threw, …)` for the `DOERR 0` no-op — deliberately
  left as-is, mirroring the `tests/test-matrix.mjs` RDZ-0
  precedent (`assertThrows` would invert the meaning).

Prior session-117 snapshot deltas (retained for context — the
session-117 close was 4089 / 0 in `test-all.mjs`, 38 / 0 in
`test-persist.mjs`, 22 / 0 in `sanity.mjs`):
- Session 113 (code-review) — doc-only lane run; **0** assertion
  deltas (filed new O-009 / X-009 / X-010 findings but made no
  source/test edits).
- Session 114 (command-support) shipped assertions in
  `test-algebra.mjs` (891 → 913, **+22**).
- Session 115 (data-type-support) shipped **+50** assertions in
  `test-types.mjs` (474 → 524) for FLOOR/CEIL/IP/FP BinInt
  widening + List/scalar broadcast + Tagged-inside-List rejection
  guards.  `:2068`/`:2074` TRUNC sites were left as-is for the
  unit-tests lane.
- Session 116 (rpl-programming) shipped **+34** assertions in
  `test-control-flow.mjs` (368 → 402) for EVAL-HALT-lift-through-
  Tagged + caller-label sweep.  (Session 116 lock was still held
  at session-117 entry; first baseline `test-all.mjs` reported
  a module-load error on `test-control-flow.mjs` which cleared
  mid-run — my lane did not touch that file.)

Session 117 unit-tests deltas:
- **+2 new regression guards** in `test-types.mjs` — closing
  queue item #3 from session 112 (the `:2068`/`:2074` TRUNC sites
  deliberately skipped for `${threw?.message}` interpolation).
  Migrated both `let threw = null; try{…}catch(e){threw = e;}`
  scaffolds to `assertThrows(…, /TRUNC expects 2 argument/, …)`
  (message-shape pin, 1:1 with the pre-existing assertion) +
  follow-up `/got 1\b/` / `/got 3\b/` guards on the
  actual-arg-count tail of the error message, which was
  previously uncovered.  Precedent: session-112 LOG(-10)-CMPLX-OFF
  split.  524 → 526.
- **+4 new regression guards** in `test-persist.mjs` — closing
  queue item #4 from session 112 (the standalone file's :118
  site).  Added a **local `assertThrows` helper** mirroring the
  `tests/helpers.mjs` signature (so test-persist can stay
  standalone).  Migrated the unknown-version rejection to
  `assertThrows(…, /unsupported version/, …)` + three new
  regression guards: (a) `/\b999\b/` on the error message
  (echo-bad-version invariant), (b) missing-version
  (`rehydrate({})`) rejected with same shape — exercises the
  `snap.version === undefined` branch of `persist.js:126`, (c)/(d)
  `rehydrate(null)` and `rehydrate('not-a-snap')` each reject
  with `/not an object/` — distinct reject path at `persist.js:125`.
  34 → 38.
- **P-001 remainder cleared for `docs/TESTS.md`** — fixed the two
  stale `src/…` path references at lines 233 (`src/rpl/ops.js`)
  and 355 (`src/rpl/algebra.js`) to `www/src/…`.  Both sites sit
  inside historical narrative blocks (s084 KNOWN-GAP test plan +
  concurrent-lane awareness note); the prefix rewrite is
  mechanical and does not alter the historical intent.  Completes
  `docs/` side of P-001 for this lane's files.
- **O-009 deferred** — the two stray `tests/test-control-flow.mjs.bak{,2}`
  files cannot be deleted from within the unsupervised scheduled-task
  session: `rm` returned `Operation not permitted`, and the
  `cowork_allow_file_delete` permission prompt is blocked in
  unsupervised mode.  Filed an "open — blocked by tooling" pointer
  in the known-gaps list for a human-present run to clear.

## Coverage snapshot (session 273)

Session 273 unit-tests deltas (this run):
- **+8 String lex-compare symmetric-closure pins** in
  `tests/test-types.mjs` (`session273:` labels), hardening the
  session179 String-ordered-compare cluster.  session179 pinned the
  both-String lex path for `<` / `>` / `≤` / `≥` but only pinned the
  cross-type String/numeric **rejection** on `<`; all four route
  through the same `comparePair` cross-type guard at `ops.js:5143`.
  Closes the rejection arm on `>` (both orderings), `≤`, and `≥`
  (4 pins) plus a non-empty proper-prefix lex boundary on each op
  (`"ab" < "abc"`, `"abc" > "ab"`, `"ab" ≤ "abc"`, `"abc" ≥ "ab"` —
  4 pins; session179 only exercised the empty-prefix corner
  `"" < "a"`).  No source change — the guard and JS-string lex path
  were already live.

Baseline at session-273 entry: **5725 / 0** (fully green; +59 from
the session-269 close of 5666 absorbed across sibling lanes —
ai-chatbot +25, ui-development +23 op-search, command/data deltas).
Final: **5733 / 0** — fully green (+8 from this run).
`test-persist.mjs` passed / 0 (stable).  `sanity.mjs` 22 / 0.

| File             | OK   | FAIL | Notes                              |
|------------------|------|------|------------------------------------|
| test-types.mjs   | 1226 | 0    | +8 s273 String lex-compare pins.   |
| **test-all**     | **5733** | **0** | Session 273 close.  Fully green. |

### Prior snapshot — Session 269 (retained for context)

## Coverage snapshot (session 269)

Sibling deltas absorbed since session-265 snapshot
(5640 → 5666, **+26** over sessions 266–268):
- **Session 266** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 262 → 266; session-log
  back-fill for sessions 263–265-code-review.  `docs/REVIEW.md`
  preamble advanced.  `register()` count 480 / 461 unchanged.
- **Session 267** (data-type-support) — **+26** assertions in
  `tests/test-types.mjs` (1189 → 1215; `session267:` labels) —
  C/S/V/M column rejection-pin pass: Complex-column pins for ZETA /
  LAMBERT / PSI / DIRAC / ERF / ERFC / BETA / UTPC / UTPF / UTPT
  (10 cells); COMB / PERM / IQUOT / IREMAINDER / XROOT V+M column
  (13 cells); CONJ / RE / IM String-column (3 cells).  No source
  change — rejections were already correct; pins confirm coverage.
- **Session 268** (rpl-programming) — doc-only verification pass;
  **0** assertion deltas.  `docs/RPL.md` stamp 264 → 268;
  `docs/REVIEW.md` preamble advanced.

Session 269 unit-tests deltas (this run):
- **0 new assertions** — last-run snapshot-refresh.  All R-bucket
  findings confirmed closed at entry; T-001 / T-002 / T-003 / T-004
  all resolved prior sessions.  Gates confirmed green on entry;
  TESTS.md header, snapshot, and session-log index updated.

Baseline at session-269 entry: **5666 / 0** (fully green).
Final: **5666 / 0** — fully green (+0 from this run).
`test-persist.mjs` passed / 0 (stable).
`sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1064 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1215 | 0    | +26 s267 C/S/V/M rejection pins.         |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5666** | **0** | Session 269 close.  Fully green. |
| test-persist.mjs (separate) | passed | 0  | Stable.                                  |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 265 (retained for context)

## Coverage snapshot (session 265)

Sibling deltas absorbed since session-260 snapshot
(5621 → 5640, **+19** over sessions 261–264):
- **Session 261** (code-review) — doc-only run; **0** assertion
  deltas.  O-011 aged 28 → 29 runs; O-012 aged 16 → 17 runs.
- **Session 262** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 257 → 262; session-log
  back-fill for sessions 258–262.  `docs/REVIEW.md` preamble advanced.
- **Session 263** (data-type-support) — **+19** assertions in
  `tests/test-types.mjs` (1170 → 1189; `session263:` labels) —
  U-column rejection-pin pass: 19 ops × one Unit-arg rejection pin
  each across unary numeric-math, CONJ/RE/IM, and binary-scalar
  families.  No source change — `toRealOrThrow` already rejects
  Unit; pins confirm coverage end-to-end.
- **Session 264** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` stamp 259 → 264; `docs/REVIEW.md`
  preamble advanced.

Session 265 unit-tests deltas (this run):
- **0 new assertions** — scope-cap snapshot-refresh run.  Gates
  confirmed green on entry; TESTS.md header, snapshot, and
  session-log index updated.

Baseline at session-265 entry: **5640 / 0** (fully green).
Final: **5640 / 0** — fully green (+0 from this run).
`test-persist.mjs` passed / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1064 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1189 | 0    | +19 s263 Unit-column rejection pins.     |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5640** | **0** | Session 265 close.  Fully green. |
| test-persist.mjs (separate) | passed | 0  | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 260 (retained for context)

## Coverage snapshot (session 260)

Sibling deltas absorbed since session-256 snapshot
(5599 → 5621, **+22** over sessions 257–259):
- **Session 257** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 252 → 257; C-015 closed;
  session-log back-fill for sessions 253–257.  No source or test edits.
- **Session 258** (data-type-support) — **+22** assertions in
  `tests/test-types.mjs` (1148 → 1170; `session258:` labels) —
  BinaryInteger B-column rejection-pin pass: 21 DATA_TYPES.md matrix
  rows × one BinaryInteger-arg rejection pin each (22 pins total;
  one row had two distinct throw-path variants).  No source change —
  `comparePair()` and the ordered-comparator ops already reject
  BinaryInteger; pins confirm coverage end-to-end.
- **Session 259** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` stamp back-filled 254 → 259;
  pointer entries for sessions 254 / 259 added.  No source or test
  edits.

Session 260 unit-tests deltas (this run):
- **0 new assertions** — scope-cap snapshot-refresh run.  Gates
  confirmed green on entry; TESTS.md header, snapshot, and session-log
  index updated.

Baseline at session-260 entry: **5621 / 0** (fully green).
Final: **5621 / 0** — fully green (+0 from this run).
`test-persist.mjs` passed / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1064 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1170 | 0    | +22 s258 BinaryInteger B-column rejection pins. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5621** | **0** | Session 260 close.  Fully green. |
| test-persist.mjs (separate) | passed | 0  | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 256 (retained for context)

## Coverage snapshot (session 256)

Sibling deltas absorbed since session-250 snapshot
(5571 → 5591, **+20** over sessions 251–254 + session-255-code-review):
- **Session 251-code-review** — doc-only run; **0** assertion deltas.
  O-014 filed (session-250 crash / unlogged algebra edit).  No source
  or test edits.
- **Session 252** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 247 → 252; session-log
  back-fill for sessions 248/249/250/251-code-review; O-014 partially
  retracted (items 1+2; items 3+4 reclassified `[deferred - post-ship]`).
  No source or test edits.
- **Session 253** (data-type-support) — **+20** assertions in
  `tests/test-types.mjs` (1120 → 1140; `session253:` labels) —
  Ordered comparators `<`/`>`/`≤`/`≥` L/V/M/T/U homogeneous rejection
  pins.  20 cells in DATA_TYPES.md coverage matrix promoted from `·`
  to `✗`.  No source change — `comparePair()` already rejects all
  five non-numeric types.
- **Session 254** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 249" back-fill; session-log pointer entries for sessions 245
  and 249 back-filled.  No source or test edits.
- **Session 255-code-review** — active at session-256 entry (lock
  acquired 2026-04-26T21:57:30Z, not yet released); **0** assertion
  deltas expected (doc-only review lane run).

Session 256 unit-tests deltas (this run):
- **+8 cross-type ordered-comparator asymmetric rejection pins** in
  `tests/test-types.mjs` (1140 → 1148; `session256:` labels).
  Session 253 covered homogeneous bad-type pairs (L×L, V×V, M×M, T×T,
  U×U) for all four ordered comparators.  This cluster covers the
  asymmetric case — exactly one operand is a valid numeric scalar and
  the other is a non-number — confirming the `!isNumber(a) || !isNumber(b)`
  OR-guard in `comparePair()` fires regardless of which stack level holds
  the bad operand.  Pin set: R×L (level-2 Real, level-1 List via `<`),
  L×R (List level-2, Real level-1 — OR not AND; `<`), R×V (`>`),
  R×M (`>`), R×T (Tagged NOT unwrapped even in asymmetric position; `≤`),
  Z×U (Integer level-2, Unit level-1; `≥`), R×S (Real+String mix —
  String arm requires BOTH String; `<`), S×R (String level-2, Real
  level-1 symmetric; `<`).  No source change.

Baseline at session-256 entry: **5591 / 0** (fully green).
Final: **5599 / 0** — fully green (+8 from this run).
`test-persist.mjs` 66 / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1064 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1148 | 0    | +20 s253 ordered-comparator L/V/M/T/U homogeneous rejection. +8 s256 cross-type asymmetric rejection. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5599** | **0** | Session 256 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 250 (retained for context)

## Coverage snapshot (session 250)

Sibling deltas absorbed since session-246 snapshot
(5560 → 5571, **+11** over sessions 247–249 + one unlogged algebra edit):
- **Session 247** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 243 → 247; session-log
  back-fill for sessions 244 / 245 / 246 / 246-code-review.
  No source or test edits.
- **Session 248** (data-type-support) — **+8** assertions in
  `tests/test-types.mjs` (1112 → 1120; `session248:` labels) —
  UTPC/UTPT List+Tagged widening via `_utpcScalar` / `_utptScalar`
  extraction + `_withTaggedBinary(_withListBinary(…))` wrappers.
  Replaced 2 session-244 rejection pins with 10 acceptance pins
  (net +8).
- **Session 249** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 249".  No source or test edits.
- **Unlogged post-249 edit** — `tests/test-algebra.mjs` was modified
  ~160 s after session-249.md was written (mtime 20:48 vs session-249
  mtime 20:45) with **+3** assertions (1061 → 1064).  No session lock
  or log covers this change; no new session labels beyond session160
  appear in the file.  All 3 new assertions pass.  Absorbed into this
  snapshot; the next command-support lane run should back-fill a
  session log entry.

Session 250 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-250 entry: **5571 / 0** (fully green).
Final: **5571 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1064 | 0    | +3 unlogged post-s249 edit (see delta note above). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1120 | 0    | +8 s248 UTPC/UTPT List+Tagged widening.  |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5571** | **0** | Session 250 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 246 (retained for context)

## Coverage snapshot (session 246)

Sibling deltas absorbed since session-242 snapshot
(5541 → 5560, **+19** over sessions 243–245):
- **Session 243** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 239 → 243; session-log
  back-fill for sessions 239–242; O-013 audit closed (RPL_CATALOG
  verified against live register() calls — no drift found).
  No source or test edits.
- **Session 244** (data-type-support) — **+19** assertions in
  `tests/test-types.mjs` (1093 → 1112; `session244:` labels) —
  ERF/ERFC Z-cell doc-lag promotion (+4); UTPC/UTPF/UTPT Z-cell
  doc-lag promotion (+4); BETA L/V/M audit (+4); UTPC/UTPF/UTPT
  L/V/M rejection pins (+7).  No source change — guards already live.
- **Session 245** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 245"; session-log pointer updated.  No source or test edits.

Session 246 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-246 entry: **5560 / 0** (fully green).
Final: **5560 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1112 | 0    | +19 s244 ERF/ERFC/BETA/UTPC/UTPF/UTPT Z+L/V/M cell audit. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5560** | **0** | Session 246 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 242 (retained for context)

## Coverage snapshot (session 242)

Sibling deltas absorbed since session-233 snapshot
(5519 → 5541, **+22** over sessions 234–241):
- **Session 234** (code-review) — doc-only run; **0** assertion
  deltas.  `docs/REVIEW.md` session-234 block added.  No source
  or test edits.
- **Session 235** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` stamp drift; session-log back-fill.
  No source or test edits.
- **Session 236** (data-type-support) — **+6** assertions in
  `tests/test-types.mjs` (1071 → 1077; `session236:` labels) —
  LNP1/EXPM Q-accept pins (+2) and TRUNC/ZETA/LAMBERT/PSI Q-reject
  pins (+4).  No source change — guards already live.
- **Session 237** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 237"; session-log pointer updated.  No source or test edits.
- **Session 238** (unit-tests) — snapshot-refresh-only run; **0**
  new assertions.  Header bumped to session-238; session-238
  coverage snapshot claimed in log index but heading was not
  actually written to file — absorbed here.
- **Session 239** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 235 → 239; session-log
  back-fill for sessions 235-code-review / 236 / 237 / 238.  No
  source or test edits.
- **Session 240** (data-type-support) — **+16** assertions in
  `tests/test-types.mjs` (1077 → 1093; `session240:` labels) —
  Q-cell audit on stat-dist family (GAMMA/LNGAMMA/ERF/ERFC/BETA/
  UTPC/UTPF/UTPT/HEAVISIDE/DIRAC — all Q=✗ rejection pins, 10)
  and combinatorial family (COMB/PERM/IQUOT/IREMAINDER Q=✗ rejection
  + XROOT Q=✓ acceptance, 6 net pins).  No source change — guards
  already live.
- **Session 241** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 241"; session-log pointer updated.  No source or test edits.

Session 242 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-242 entry: **5541 / 0** (fully green).
Final: **5541 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1093 | 0    | +16 s240 Q-cell audit (stat-dist + combinatorial). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5541** | **0** | Session 242 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 233 (retained for context)

## Coverage snapshot (session 233)

Sibling deltas absorbed since session-228 snapshot
(5511 → 5519, **+8** over sessions 229–232):
- **Session 229** (code-review) — doc-only run; **0** assertion
  deltas.  `docs/REVIEW.md` session-229 block added; O-011 aged;
  O-012/O-013 carried forward.  No source or test edits.
- **Session 230** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` stamp drift reconciliation.  No source
  or test edits.
- **Session 231** (data-type-support) — **+8** assertions in
  `tests/test-types.mjs` (1063 → 1071; `session231:` labels) —
  CONJ/RE/IM Rational widening (+1) and Q-cell audit (+7).  No source
  change — rejection guards already live.
- **Session 232** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 232"; session-log pointer updated.  No source or test edits.

Session 233 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-233 entry: **5519 / 0** (fully green).
Final: **5519 / 0** — fully green (0 new this run).
`test-persist.mjs` passed / 0 (stable; D-001 closed ship-prep 2026-04-25).
`sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1071 | 0    | +8 s231 CONJ/RE/IM Rational + Q-cell pins. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5519** | **0** | Session 233 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep 2026-04-25. |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 228 (retained for context)

## Coverage snapshot (session 228)

Sibling deltas absorbed since session-223 snapshot
(5508 → 5511, **+3** over sessions 224–227):
- **Session 224-code-review** (code-review) — doc-only run; **0** assertion
  deltas.  `docs/REVIEW.md` preamble folded in sessions 220–223; O-011
  aged 18 → 19 runs (count 79 → 84); O-012 aged to 9 code-review runs;
  O-013 filed (new finding — `www/src/ai/system-prompt.js` RPL_CATALOG
  drift risk).  No source or test edits.
- **Session 225** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 220→225 + session-log
  back-fill; no source or test edits.
- **Session 226** (data-type-support) — **+3** assertions in
  `tests/test-types.mjs` (1060 → 1063; `session226:` labels) — CONJ/RE/IM
  Quaternion-rejection pins.  No source change — rejection guards already live.
- **Session 227** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 227"; session-log pointer updated.  No source or test edits.

Session 228 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-228 entry: **5511 / 0** (fully green).
Final: **5511 / 0** — fully green (0 new this run).
`test-persist.mjs` passed / 0 (stable).  `sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1063 | 0    | +3 s226 CONJ/RE/IM Q-rejection pins.    |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5511** | **0** | Session 228 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 223 (retained for context)

## Coverage snapshot (session 223)

Sibling deltas absorbed since session-218 snapshot
(5508 → 5508, **+0** over sessions 219–222):
- **Session 219-code-review** (code-review) — doc-only run; **0** assertion
  deltas.  `docs/REVIEW.md` preamble folded in sessions 215–218; O-011
  aged 16 → 17 runs (count 74 → 79); O-012 aged to 8 code-review runs.
  No source or test edits.
- **Session 220** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 215→220 + session-log
  back-fill for sessions 215–219-code-review; no source or test edits.
- **Session 221** (data-type-support) — doc-only run; **0** assertion
  deltas.  `docs/DATA_TYPES.md` arithmetic section split (`+`/`-`/`*`/`/`/`^`
  pulled into separate subsection with per-op Notes rows); Last-updated
  stamp → Session 221.  No source or test edits.
- **Session 222** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced "as of session 217"
  → "as of session 222"; session-log pointer updated.  No source or
  test edits.

Session 223 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-223 entry: **5508 / 0** (fully green).
Final: **5508 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | 1060 | 0    | Unchanged since s218 (s216 PSI pins last delta). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5508** | **0** | Session 223 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 218 (retained for context)

## Coverage snapshot (session 218)

Sibling deltas absorbed since session-214 snapshot
(5503 → 5508, **+5** over sessions 215–217):
- **Session 215** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 211→215 + session-log
  back-fill for sessions 211-code-review / 212 / 213 / 214; no
  source or test edits.
- **Session 216** (data-type-support) — **+5** assertions in
  `tests/test-types.mjs` (1055 → 1060; `session216:` labels) —
  PSI L/V/M stale-`·`-cell promotion: five assertions added (L-empty
  passthrough, L n=1 value-precise, L n=2 heterogeneous-output, V,
  M).  No source change — bespoke branches already live.
- **Session 217** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 217"; session-log pointer prose updated.  No source or
  test edits.

Session 218 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-218 entry: **5508 / 0** (fully green).
Final: **5508 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs             |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1060** | 0 | +5 s216 PSI L/V/M pins (`session216:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5508** | **0** | Session 218 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 214 (retained for context)

## Coverage snapshot (session 214)

Sibling deltas absorbed since session-210 snapshot
(5493 → 5503, **+10** over sessions 211–213):
- **Session 211** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 207→211 + session-log
  back-fill for sessions 208 / 209 / 210 / 210-code-review; no
  source or test edits.
- **Session 212** (data-type-support) — **+10** assertions in
  `tests/test-types.mjs` (1045 → 1055; `session212:` labels) —
  ZETA and LAMBERT Z/L/V/M stale-`·`-cell promotion: probe
  confirmed Integer inputs accepted by both scalars; five assertions
  added per op (Z, L-empty, L-value, V, M).  No source change —
  wrappers already live.
- **Session 213** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` status stamp advanced to "as of
  session 213"; session-log pointer prose updated.  No source or
  test edits.

Session 214 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-214 entry: **5503 / 0** (fully green).
Final: **5503 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1055** | 0 | +10 s212 ZETA/LAMBERT Z/L/V/M pins (`session212:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5503** | **0** | Session 214 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 210 (retained for context)

## Coverage snapshot (session 210)

Sibling deltas absorbed since session-206 snapshot
(5492 → 5493, **+1** over sessions 207–209):
- **Session 207** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp 203→207 + session-log
  back-fill for sessions 203-code-review / 204 / 205 / 206; no
  source or test edits.
- **Session 208** (data-type-support) — **+1** assertion in
  `tests/test-types.mjs` (1044 → 1045; `session208:` label) —
  erf M-cell pin promotion: one stale dot-cell in
  `docs/DATA_TYPES.md` promoted to `✓`; one corresponding pin
  assertion added.  No source change — wrapper already live.
- **Session 209** (rpl-programming) — doc-only run; **0** assertion
  deltas.  `docs/RPL.md` status stamp advanced to "as of session
  209"; session-log pointer prose extended.  No source or test edits.

Session 210 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-210 entry: **5493 / 0** (fully green).
Final: **5493 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1045** | 0 | +1 s208 erf M-cell pin (`session208:` label). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5493** | **0** | Session 210 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 206 (retained for context)

## Coverage snapshot (session 206)

Sibling deltas absorbed since session-202 snapshot
(5485 → 5492, **+7** over sessions 203–205):
- **Session 203** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp and session-log
  back-fill for sessions 199–202; no source or test edits.
- **Session 204** (data-type-support) — **+7** assertions in
  `tests/test-types.mjs` (1037 → 1044; `session204:` labels) —
  erfc L/V/M/T+L stale-`·`-cell promotion: five stale dot-cells
  in `docs/DATA_TYPES.md` promoted to `✓`; seven corresponding
  pin assertions added.  No source change — wrappers were already
  live.
- **Session 205** (rpl-programming) — doc-only run; **0** assertion
  deltas.  `docs/RPL.md` status stamp advanced to "as of session
  205"; session-log pointer prose extended.  No source or test
  edits.

Session 206 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-206 entry: **5492 / 0** (fully green).
Final: **5492 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1044** | 0 | +7 s204 erfc L/V/M/T+L verification pins (`session204:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5492** | **0** | Session 206 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 202 (retained for context)

## Coverage snapshot (session 202)

Sibling deltas absorbed since session-189 snapshot
(5448 → 5464, **+16** over sessions 190–192):
- **Session 190** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp advanced to "as of session
  190"; register-count corrected to 481 / 460 (was 476 / 455 prose
  in COMMANDS.md, drifted from actual; finding C-012 resolved).  No
  source or test edits.
- **Session 191** (data-type-support) — **+16** assertions in
  `tests/test-types.mjs` (1000 → 1016; `session191:` labels) —
  HEAVISIDE and DIRAC L/V/M/T wrapper additions (+8 HEAVISIDE, +8
  DIRAC); corresponding `ops.js` source edits; `docs/DATA_TYPES.md`
  stamped.
- **Session 192** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` stamp advanced to "as of session
  192".  All RPL-bucket findings confirmed closed.

Session 198 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Sibling deltas absorbed since session-193 snapshot
(5464 → 5472, **+8** over sessions 194–197):
- **Session 194** (code-review) — doc-only run; **0** assertion deltas.
  `docs/REVIEW.md` post-ship aging; filed C-013 (COMMANDS.md
  register-count drift); O-009 resolved; session-194-code-review log
  written.  No source or test edits.
- **Session 195** (command-support) — doc-only run; **0** assertion
  deltas.  C-013 close: `docs/COMMANDS.md` register-count updated
  481/460 → 482/461; `docs/REVIEW.md` C-013 promoted to resolved.
  No source or test edits.
- **Session 196** (data-type-support) — **+8** assertions in
  `tests/test-types.mjs` (1016 → 1024; `session196:` labels) —
  TRUNC wrapped with `_withTaggedBinary(_withListBinary(...))` to
  close the last ship-prep audit candidate (L/T blank → ✓; V/M
  blank → ✗ per MOD/MIN/MAX policy).  8 pins: n=0 bare-List, n=0
  Tagged-of-List, n=1 bare-List value-precise, n=2 bare-List
  heterogeneous, Tagged-of-List tag-drop, scalar Tagged tag-drop,
  pairwise L×L, Vector rejection guard.  Source edit at
  `www/src/rpl/ops.js` (`register('TRUNC', ...)` line).
- **Session 197** (rpl-programming) — doc-only run; **0** assertion
  deltas.  `docs/RPL.md` session-log pointer prose backfilled for
  sessions 172 / 180 / 184 / 188 / 192; status stamp advanced to
  session 197.  No source or test edits.

Session 202 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Sibling deltas absorbed since session-198 snapshot
(5472 → 5485, **+13** over sessions 199–201):
- **Session 199** (command-support) — doc-only run; **0** assertion
  deltas.  C-014 close: `docs/COMMANDS.md` session-log block
  back-filled for sessions 187–198; `docs/REVIEW.md` C-014 promoted
  to resolved.  No source or test edits.
- **Session 200** (data-type-support) — **+13** assertions in
  `tests/test-types.mjs` (1024 → 1037; `session200:` labels) —
  GAMMA (×6), LNGAMMA (×4), erf (×2), erfc (×1) L/V/M/T
  verification pins; corresponding `docs/DATA_TYPES.md` matrix
  promotions (stale `·` cells → `✓` for GAMMA/LNGAMMA/erf on
  L/V/M).  No source change — wrappers were already live.
- **Session 201** (rpl-programming) — doc-only run; **0** assertion
  deltas.  `docs/RPL.md` status stamp advanced to "as of session
  201"; session-log pointer prose backfilled for sessions 192–201.
  No source or test edits.

Baseline at session-202 entry: **5485 / 0** (fully green).
Final: **5485 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~9 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1037** | 0 | +13 s200 GAMMA/LNGAMMA/erf/erfc L/V/M/T verification pins (`session200:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5485** | **0** | Session 202 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~9 ms smoke suite.                       |

### Prior snapshot — Session 198 (retained for context)

Baseline at session-198 entry: **5472 / 0** (fully green).
Final: **5472 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1024** | 0 | +8 s196 TRUNC L/T wrapper-add (`session196:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5472** | **0** | Session 198 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 193 (retained for context)

Session 193 unit-tests deltas:
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-193 entry: **5464 / 0** (fully green).
Final: **5464 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~6 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1016** | 0 | +16 s191 HEAVISIDE/DIRAC L/V/M/T wrappers (`session191:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5464** | **0** | Session 193 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                       |

### Prior snapshot — Session 189 (retained for context)

## Coverage snapshot (session 189)

Sibling deltas absorbed since session-185 snapshot
(5433 → 5448, **+15** over sessions 186–188):
- **Session 186** (command-support) — doc-only run; **0** assertion
  deltas.  `docs/COMMANDS.md` Counts stamp advanced to "as of session
  186"; session-183/184/185/185-code-review sibling-delta narrative
  appended.  No source or test edits.
- **Session 187** (data-type-support) — **+15** assertions in
  `tests/test-types.mjs` (985 → 1000; `session187:` labels) —
  XPON and MANT L/V/M/T wrapper additions (+8 XPON, +7 MANT);
  corresponding `ops.js` source edits; `docs/DATA_TYPES.md` stamped.
- **Session 188** (rpl-programming) — verification-only run; **0**
  assertion deltas.  `docs/RPL.md` stamp advanced to "as of session
  188".  All RPL-bucket findings confirmed closed.

Session 189 unit-tests deltas (this run):
- **0** new assertions.  Snapshot-refresh-only run under scope cap.

Baseline at session-189 entry: **5448 / 0** (fully green).
Final: **5448 / 0** — fully green (0 new this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  799 | 0    |                                          |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  709 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              | **1000** | 0 | +15 s187 XPON/MANT L/V/M/T wrappers (`session187:` labels). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5448** | **0** | Session 189 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 185 (retained for context)

## Coverage snapshot (session 185)

Sibling deltas absorbed since session-181 snapshot
(5389 → 5409, **+20** over sessions 182–184):
- **Session 182** (command-support) — exact delta not logged here;
  confirmed by per-file diff between s181 and s184 entry baselines.
  `test-numerics.mjs` grew 701 → 709 (+8).
- **Session 183** (data-type-support) — **+12** assertions in
  `tests/test-types.mjs` (959 → 971; `session175r:` labels) —
  re-land of the session-175 T-003 portion that did not persist.
- **Session 184** (rpl-programming) — doc-only/verification run;
  **0** assertion deltas.  Verified baseline **5401 / 0** at close.

Session 185 unit-tests deltas (this run):
- **+14** assertions in `tests/test-types.mjs` (971 → 985) —
  re-land of session-177 Cluster 1: EXACT-mode Integer-stay-exact
  composition pins for SIN/COS/TAN/ASIN/ATAN/ACOS on bare-List +
  Tagged-of-List axes.  ACOS angle-mode-dependent outlier pinned
  across RAD (→ Symbolic) and DEG (→ Integer(90)) × both wrapper
  axes.  Labels: `session185:`.  Closes T-003 session-177 portion.
- **+10** assertions in `tests/test-control-flow.mjs` (789 → 799) —
  re-land of session-177 Cluster 2: RUN edge pins (DBUG → RUN
  immediately with no SST; embedded-HALT EVAL + RUN drain).
  Labels: `session185:`.  Closes T-003 session-177 portion.

Baseline at session-185 entry: **5409 / 0** (fully green).
Final: **5433 / 0** — fully green (+24 this run).
`test-persist.mjs` 66 / 0 (stable).  `sanity.mjs` 22 / 0 (~5 ms).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    |                                          |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  **799** | 0 | +10 s185 (RUN edge: DBUG→RUN immediately + embedded-HALT resume; `session185:` labels). |
| test-entry.mjs              |  117 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  **709** | 0 | +8 s182 (command-support additions).     |
| test-reflection.mjs         |  382 | 0    |                                          |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              |  **985** | 0 | +14 s185 EXACT Integer trig List/Tagged re-land (T-003). Also +12 s183 session175r re-land. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5433** | **0** | Session 185 close.  Fully green. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 181 (retained for context)

## Coverage snapshot (session 181)

Sibling deltas absorbed since session-173 snapshot
(5336 → 5389, **+53** over sessions 174–180):
- **Unlogged UI-lane session** — **+27** assertions in
  `tests/test-entry.mjs` (90 → 117).  No `sessionNNN:` labels
  added; identified by session-174 (command-support) log which
  noted the +27 delta and attributed it to an unlogged
  `rpl5050-ui-development` run that edited `test-entry.mjs`
  (mtime 2026-04-26 01:39 UTC).  **0** assertions from
  session 174 itself (doc-only run).
- **Session 175** (data-type-support) log claimed +12
  assertions in `tests/test-types.mjs` but **zero `session175:`
  labels found** in the file at session-181 entry — those test
  edits did not persist.  **0** actual delta from this run.
- **Session 176** (rpl-programming) log claimed +14 assertions
  in `tests/test-control-flow.mjs` (RUN step-clear regression
  pins) but **zero `session176:` labels found** — test edits
  did not persist.  **0** actual delta from this run.
- **Session 177** (unit-tests lane) log claimed +24 assertions
  across `test-types.mjs` (+14) and `test-control-flow.mjs`
  (+10) and stated that TESTS.md was updated to the session-177
  snapshot — **zero `session177:` labels found** in either file,
  and TESTS.md header still read "Last updated: Session 173" at
  session-181 entry.  The session-177 log appears to have been
  written aspirationally; no test-file or TESTS.md edits
  persisted.  **0** actual delta.
- **Session 178** (command-support) — **+14** assertions in
  `tests/test-control-flow.mjs` (775 → 789; `session178:` labels
  confirmed by grep).  RUN / CONT / DBUG edge-case regression
  pins.
- **Session 179** (data-type-support) — **+12** assertions in
  `tests/test-types.mjs` (947 → 959; `session179:` labels
  confirmed by grep at `test-types.mjs:8973+`).  String
  lexicographic comparison pins for `<` / `>` / `≤` / `≥`
  operators.
- **Session 180** (rpl-programming) — doc-only audit run; **0**
  assertion deltas.  Verified baseline **5389 / 0** at close.

Session 181 unit-tests deltas:
- **Snapshot-refresh-only run** (this session).  No new pinning
  clusters; scope cap = 1/3 workload; priority was confirming
  gate status (all green) and updating the snapshot that session
  177 claimed to update but did not persist.  TESTS.md "Last
  updated" header and this coverage snapshot section are the
  only edits.

Baseline at session-181 entry: `node tests/test-all.mjs` =
**5389 passing / 0 failing** (fully green; confirmed above).
`test-persist.mjs` 66 / 0 (D-001 closed at ship-prep 2026-04-25;
stable since).  `sanity.mjs` 22 / 0 in ~5 ms.

Final: **5389 passing / 0 failing** — fully green (no new
assertions this run).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    | Sessions 173–180 did not touch this file. |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  **789** | 0    | +14 s178 (command-support RUN/CONT/DBUG edge pins; `session178:` labels). |
| test-entry.mjs              |  **117** | 0    | +27 unlogged UI-lane session (no sessionNNN labels; see sibling-deltas prelude). |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  701 | 0    |                                          |
| test-reflection.mjs         |  382 | 0    | Sessions 173–180 did not touch this file. |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              |  **959** | 0    | +12 s179 (data-type-support String lex-compare pins; `session179:` labels at `:8973+`). s175/s176/s177 claimed additions did not persist — see sibling-deltas prelude. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5389** | **0** | Session 181 entry/close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   66 | 0    | Stable since ship-prep (D-001 closed 2026-04-25). |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                       |

### Prior snapshot — Session 173 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **5306
passing / 0 failing** (session-172 close, fully green; sibling
deltas absorbed in the prelude above — +0 s170 doc-only, +22
s171 test-types forward-hyperbolic n=0/n=1 boundary +
heterogeneous-output, +33 s172 test-reflection NEWOB Program
freeze-parity fix + 13-shape sweep).
`test-persist.mjs` 66 / 0 (unchanged since ship-prep — D-001
fully closed at ship-prep 2026-04-25).
`sanity.mjs` 22 / 0.

Final: **5336 passing / 0 failing** — fully green.  The +30
session-173 deltas land in one file across two substantive
clusters:
- `test-types.mjs` 917 → 947 (**+30**) — forward-trig
  SIN/COS/TAN n=0/n=1 boundary closures on bare-List + Tagged-
  of-List (Cluster 1, +12: 3 ops × 4 cases) + inverse-trig
  ASIN/ACOS/ATAN n=0/n=1 boundary closures (Cluster 2, +18:
  3 ops × 6 asserts because ACOS(0)=π/2 RAD requires both
  shape-and-value asserts).  Closes the two open-queue gaps
  session 171's log explicitly flagged.  COS / ACOS are the
  n=1 outliers with non-identity folds (cos(0)=1; acos(0)=π/2),
  paralleling session 171's COSH outlier.  No source change —
  wrappers were live since session 145.

`test-persist.mjs` 66 / 0 (unchanged this run).  `sanity.mjs`
22 / 0 (unchanged).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    | +25 s119, +25 s124, +9 s127, +13 s139, +29 s144, +30 s149, +10 s156, +3 s160 (MODULO ARITH follow-up).  Sessions 164–172 did not touch this file. |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  775 | 0    | s151 fully closed (CASE / fully-closed START/NEXT and START/STEP / DO/UNTIL / FOR/STEP).  Sessions 164–172 did not touch this file. |
| test-entry.mjs              |   90 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  190 | 0    | +14 ship-prep-r4 (List EVAL HP50 §3-77 fix; R-010); +5 absorbed between session-168 close and session-171 entry (sibling-lane delta noted in s171 log). |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  701 | 0    | +27 s109 + s112 + s153 + s156 retained.  Sessions 164–172 did not touch this file. |
| test-reflection.mjs         |  **382** | 0    | +50 s146, +5 net + 2 flipped s155, +7 s156, +15 s159, +6 s160, +8 s163, +8 s164, +20 s167, +34 s168, **+33 session-172** (NEWOB-on-Program outer-freeze parity fix: 2 direct Program freeze pins + 26 freeze-parity sweep pins (13 shapes × distinct + frozen) + 2 strict-mode mutation-rejection sentinels + 1 NEWOB→DECOMP equivalence smoke + 2 sweep precondition pins on Program — pins the s172 source-edit at `_newObCopy:9341`). |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              |  **947** | 0    | +50 s115, +2 s117, +68 s120, +43 s125, +35 s130, +31 s135, +36 s140, +23 s142, +41 s145, +26 s150, +19 s158, +4 s160, +15 s162, +3 s164, +19 s166, +6 s168 (LOG/EXP/ALOG heterogeneous-output mixed-input under bare-List + Tagged-of-List), +22 s171 (forward-hyperbolic SINH/COSH/TANH/ASINH n=0/n=1 boundary + COSH/TANH/ASINH heterogeneous-output value pins), **+30 session-173** (forward-trig SIN/COS/TAN n=0/n=1 boundary closures +12, inverse-trig ASIN/ACOS/ATAN n=0/n=1 boundary closures +18 — closes the two open-queue gaps s171 flagged: forward-trig and inverse-trig families' bare-List + T+L boundary axes). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5336** | **0** | Session 173 close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   66 | 0    | Unchanged this run; ship-prep baseline retained. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite (~5 ms).               |

### Prior snapshot — Session 168 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **5206
passing / 0 failing** (session-167 close, fully green; sibling
deltas absorbed in the prelude above — +0 s165 doc-only, +19
s166 test-types LOG/EXP/ALOG + ACOSH/ATANH n=0 / n=1 boundary,
+20 s167 test-reflection NEWOB Rational widening + composition
pin set).
`test-persist.mjs` 66 / 0 (unchanged since session 156 — D-001
fully closed at ship-prep 2026-04-25).
`sanity.mjs` 22 / 0.

Final at session-168 close: **5246 passing / 0 failing** — fully green.  The +40
session-168 deltas land in two files across two substantive
clusters:
- `test-reflection.mjs` 315 → 349 (**+34**) — NEWOB session-167
  follow-up edges: Integer distinct-object + Integer(-7)
  negative-sign + BinInt #15h value+base preservation + BinInt
  #7o octal-base preservation (closes BIN_BASES quartet on
  NEWOB) + Complex re/im preservation + Tagged-of-Integer /
  Tagged-of-BinInt / Tagged-of-Complex / Tagged-of-Real
  shallow-copy contract (closes Tagged composition row across
  all five enumerated numeric-scalar shapes Real/Integer/
  BinInt/Rational/Complex; s167 covered Tagged-of-Rational
  only) + Vector-of-Real shallow-copy contract (mirror of s167
  List-of-Rational onto Vector container; pins
  `_newObCopy:9319` Vector branch's `slice()` rebuilds the
  items array but preserves inner Real identity) + empty-List
  rebuild boundary (closes the n=0 List boundary that s047
  only pinned on empty-Matrix) + List-of-Tagged nested
  composition (mirror of s146 nested-Program shallow-copy onto
  Tagged inner) + NEWOB-then-OBJ→ on BinaryInteger composition
  (companion to s167's NEWOB-then-OBJ→ on Rational; pins the
  s163 push-back branch composes correctly with s167's NEWOB
  Rational widening on the BinInt arm).
- `test-types.mjs` 889 → 895 (**+6**) — LOG / EXP / ALOG
  heterogeneous-output mixed-input pinning under bare-List +
  Tagged-of-List composition.  Closes the heterogeneous-output
  axis session 166 deferred (its scope was n=0 / n=1 boundary
  closures only).  Lifts session 162's bare-List heterogeneous
  mixed-input pattern + session 164's Tagged-of-List
  heterogeneous mixed-input pattern onto the LOG / EXP / ALOG
  trio (3 ops × 2 axes = 6 pins): `{ Real(10) Real(1) } LOG →
  { Real(1) Real(0) }` + Tagged-of-List variant; `{ Real(0)
  Real(1) } EXP → { Real(1) Real(e) }` + Tagged-of-List
  variant; `{ Real(0) Real(1) } ALOG → { Real(1) Real(10) }` +
  Tagged-of-List variant.

`test-persist.mjs` 66 / 0 (unchanged this run).  `sanity.mjs`
22 / 0 (unchanged).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1061 | 0    | +25 s119, +25 s124, +9 s127, +13 s139, +29 s144, +30 s149, +10 s156 (MODULO follow-up), +3 s160 (MODULO ARITH follow-up: DIV2MOD MODSTO consultation pair + GCDMOD(0,0) both-zero reject).  Sessions 164 / 165 / 166 / 167 / 168 did not touch this file. |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  775 | 0    | s151 fully closed (CASE / fully-closed START/NEXT and START/STEP / DO/UNTIL / FOR/STEP).  Sessions 164 / 165 / 166 / 167 / 168 did not touch this file. |
| test-entry.mjs              |   90 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  185 | 0    | +14 ship-prep-r4 (List EVAL HP50 §3-77 fix; R-010). |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  701 | 0    | +27 s109 + s112 + s153 + s156 retained.  Sessions 164 / 165 / 166 / 167 / 168 did not touch this file. |
| test-reflection.mjs         |  **349** | 0    | +50 s146, +5 net + 2 flipped s155 (R-008 OBJ→ Real-branch fix), +7 s156 (n=0 boundary closures), +15 s159 (R-012 close — OBJ→ Unit branch), +6 s160 (OBJ→ Unit follow-up boundary edges), +8 s163 (OBJ→ AUR-fidelity audit extension to BinInt/Rational), +8 s164 (OBJ→ s163 follow-up edges), +20 s167 (NEWOB AUR-fidelity audit extension to Rational + composition pin set), **+34 session-168** (NEWOB s167 follow-up: Integer / BinInt / Complex distinct-object + Tagged-of-each-numeric-scalar composition + Vector-of-Real shallow-copy + empty-List boundary + List-of-Tagged nested composition + NEWOB-then-OBJ→ on BinInt). |
| test-stack-ops.mjs          |   48 | 0    |                                          |
| test-stats.mjs              |   55 | 0    |                                          |
| test-types.mjs              |  **895** | 0    | +50 s115, +2 s117, +68 s120, +43 s125, +35 s130, +31 s135, +36 s140, +23 s142, +41 s145, +26 s150, +19 s158, +4 s160, +15 s162 (LNP1/EXPM bare-List + Tagged-of-List composition), +3 s164 (LNP1/EXPM T+L follow-up edges), +19 s166 (LOG/EXP/ALOG + ACOSH/ATANH n=0/n=1 boundary closures), **+6 session-168** (LOG/EXP/ALOG heterogeneous-output mixed-input under bare-List + Tagged-of-List composition — closes the heterogeneous-output axis s166 deferred). |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    |                                          |
| test-variables.mjs          |  251 | 0    |                                          |
| **test-all (aggregate)**    | **5246** | **0** | Session 168 close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   66 | 0    | Unchanged this run; session 156 baseline retained. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

### Prior snapshot — Session 164 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **5156
passing / 0 failing** (session-163 close); final **5167 / 0** —
+11 deltas across `test-reflection.mjs` 287 → 295 (**+8**, OBJ→
session-163 follow-up edges) and `test-types.mjs` 867 → 870
(**+3**, LNP1/EXPM session-162 T+L composition follow-up edges).

### Prior snapshot — Session 160 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **5120
passing / 0 failing** (session-159 close, fully green; sibling
deltas absorbed in the prelude above — +0 s157 doc-only, +19
s158 test-types, +15 s159 test-reflection R-012 close).

Final: **5133 passing / 0 failing** — fully green.  The +13
session-160 deltas land in three files across three substantive
clusters: test-reflection.mjs +6 OBJ→ Unit follow-up, test-types.mjs
+4 transcendental wrapper-LIST n=0 / n=1 boundary, test-algebra.mjs
+3 MODULO ARITH follow-up.  See "Session 160 unit-tests deltas"
in the prelude for cluster details.

### Prior snapshot — Session 156 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **5063
passing / 0 failing** (session-155 close, fully green; sibling
deltas absorbed in the prelude above).  `test-persist.mjs` 66 /
0 (was 40 at session-147 close; +26 from sessions 150 / 151 /
152 / 155 — D-001 partial fix + casVx persistence cluster from
session 151).  `sanity.mjs` 22 / 0.

Final: **5086 passing / 0 failing** — fully green.  The +23
session-156 deltas land in three files across three substantive
clusters:
- `test-reflection.mjs` 251 → 258 (**+7**) — OBJ→ session-155
  follow-up edges: empty Vector / List / Program n=0 boundary
  closures, negative-Real branch, Tagged-of-Tagged composition
  (3 sub-pins).  R-008 scope was Real and Tagged only; these
  close the AUR §3-149 boundary cells the audit didn't enumerate.
- `test-algebra.mjs` 1048 → 1058 (**+10**) — Session-149 MODULO
  ARITH cluster follow-up: DIV2MOD-Vector reject + DIVMOD
  Complex / String reject (per-arg type-check fall-throughs) +
  GCDMOD-with-zero identity edge (both directions) + EXPANDMOD-
  negative-input branch + FACTORMOD m=2 / m=99 modulus boundary
  pair + DIVMOD MODSTO consultation pair (only EXPANDMOD's
  MODSTO sensitivity was pinned by session 149).
- `test-numerics.mjs` 701 → 707 (**+6**) — Session-153 C-011
  follow-up rejection-arm composition: Tagged-of-Rational (both
  COMB level-2 and PERM level-1); BinInt COMB / PERM (guards
  against a session-115-style widening); Vector COMB (no V/M
  distribution); negative-int-valued Rational(-5,1) COMB
  (negative-arm of session-153's positive-only pin).

`test-persist.mjs` 66 / 0 (unchanged this run — the +26 since
session-147 absorbed in this snapshot via sessions 150 / 151 /
152 / 155).  `sanity.mjs` 22 / 0 (unchanged).

R-012 filed against REVIEW.md `Findings — RPL` bucket (OBJ→ on
Unit divergence from AUR §3-149; ship-stretch; owner =
`rpl5050-rpl-programming`).  Lane filed-only per the no-fix-
source-bugs rule.  **Session 159 closed R-012** by adding the
missing `isUnit` branch to OBJ→'s dispatch.

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | **1058** | 0    | +25 s119 (EGV / RSD / GREDUCE), +25 s124 (LNAME / GBASIS), +9 s127 (LNAME edge), +13 s139 (LIN/LIMIT), +29 s144 (MODSTO + ADDTMOD/SUBTMOD/MULTMOD/POWMOD), +30 s149 (EXPANDMOD/FACTORMOD/GCDMOD/DIVMOD/DIV2MOD), **+10 session-156** (MODULO follow-up: DIV2MOD-V reject, DIVMOD-Complex/String reject, GCDMOD-with-zero, EXPANDMOD-negative, FACTORMOD m=2/m=99 boundary, DIVMOD MODSTO consultation). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |  111 | 0    |                                          |
| test-control-flow.mjs       |  775 | 0    | +71 session-151 (CASE clauses, fully-closed START/NEXT and START/STEP, DO/UNTIL, FOR/STEP — symmetric to s141 IFERR set).  Session 156 did not touch this file. |
| test-entry.mjs              |   90 | 0    |                                          |
| test-eval.mjs               |   61 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  185 | 0    | +14 ship-prep-r4 (List EVAL HP50 §3-77 fix; R-010). |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  **707** | 0    | +27 s109 + s112 LOG-CMPLX-OFF split, +8 s153 (C-011 close — COMB/PERM Rational reject), **+6 session-156** (C-011 follow-up: Tagged-of-Rat both directions, BinInt COMB/PERM, Vector COMB, negative-int-valued Rat). |
| test-reflection.mjs         |  **258** | 0    | +50 s146 (Program/structural round-trip pins), +5 net new + 2 flipped session-155 (R-008 OBJ→ Real-branch fix + Tagged-branch phantom retraction), **+7 session-156** (OBJ→ session-155 follow-up: empty V/L/P n=0 boundary, negative Real, Tagged-of-Tagged composition). |
| test-stack-ops.mjs          |   48 | 0    | +9 session-137 + 7 session-147 edge-path closures retained. |
| test-stats.mjs              |   55 | 0    | session-147 NSIGMA/NΣ + MEAN/VAR/SDEV reject + canonical ΣX/ΣX² col-0 positive retained. |
| test-types.mjs              |  829 | 0    | +50 s115, +2 s117, +68 s120, +43 s125, +35 s130, +31 s135, +36 s140, +23 s142, +41 s145, +26 session-150 (inverse-trig DEG-Tagged-V/M wrapper composition + forward-hyperbolic bare-scalar + LN/LOG/EXP/ALOG Tagged-V/M wrapper composition).  Session 156 did not touch this file. |
| test-ui.mjs                 |   77 | 0    |                                          |
| test-units.mjs              |   56 | 0    | +12 s137 + 5 s147 closures retained.     |
| test-variables.mjs          |  251 | 0    | +3 ship-prep-r2 (R-007 soft-key program-error rollback). |
| **test-all (aggregate)**    | **5086** | **0** | Session 156 close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   66 | 0    | +26 absorbed from sessions 150 / 151 / 152 / 155 (D-001 partial fix + casVx persistence pins from session 151).  Session 156 did not touch this file. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

### Prior snapshot — Session 147 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **4883
passing / 0 failing** (session-146 close, fully green).  Sibling
deltas since session-142 close (4734): 0 session-143 (code-review
doc-only), +29 session-144 (test-algebra MODULO ARITH cluster:
MODSTO + ADDTMOD/SUBTMOD/MULTMOD/POWMOD) + +2 in test-persist
(casModulo BigInt slot persistence), +41 session-145 (test-types
forward-trig + LN/LOG/EXP/ALOG EXACT-mode lift + bespoke-V/M
inner-Tagged-rejection M-axis closure), +29 session-146
(test-control-flow Program/structural round-trip pins) + +50
session-146 (test-reflection round-trip pins).
`test-persist.mjs` 40 / 0 (was 38 at session-142 close; +2 from
session 144 casModulo).  `sanity.mjs` 22 / 0.

Final: **4903 passing / 0 failing** — fully green.  The +20
session-147 deltas land in three files (no test-types touch this
run; sibling lanes have been carrying that file):
- `test-stack-ops.mjs` 41 → 48 (**+7**) — PICK / PICK3 / UNPICK /
  NDUPN rejection-path closure.  PICK -1 (negative-N branch),
  PICK 1.5 (`!Number.isInteger` branch), PICK String (toRealOrThrow
  type-side reject — distinct from value-domain rejects), PICK 5
  with depth 2 (Stack.pick `n<level` guard — closes PICK
  depth-overrun branch session 137 left for sibling ops),
  PICK3 on depth-2 (closes PICK3 rejection branch — file
  previously had only the (100,200,300) happy-path pin),
  UNPICK -1 (negative-N branch of `_toPosIntIndex`, distinct
  from session-137 0-UNPICK pin), NDUPN with only count
  (s.depth<1 guard at ops.js:7255, distinct from session-137
  NDUPN-negative-N reject earlier in `_toNonNegIntCount`).
- `test-stats.mjs` 47 → 55 (**+8**) — NSIGMA / NΣ + MEAN / VAR /
  SDEV rejection-path closure + canonical ΣX / ΣX² col-0
  positive coverage closure.  NSIGMA on Real (canonical fallthrough);
  NΣ on Real (symbol-alias delegation reject); NΣ on empty
  Vector (Vector arm of empty reject — existing s064 pin only
  covered Matrix arm); MEAN/VAR/SDEV on Real (all three reject
  branches were unpinned); canonical ΣX / ΣX² on XY-matrix col-0
  positive (file previously only had the SX/SX2 alias-arm pins
  from s064 / s132).  Mirror of session 132's alias-positive-
  coverage closure but in the OTHER direction —
  canonical-positive-coverage closure.
- `test-units.mjs` 51 → 56 (**+5**) — Mixed-dim subtraction
  reject + different-dim-pair add reject + composite-ABS +
  ^ negative / zero-exponent edge coverage closure.  5_m - 1_s
  → Inconsistent units ('-' arm distinct from existing '+' arm
  pin); 1_kg + 1_m → Inconsistent units (different dim pair than
  the existing m-vs-s pin); ABS -1_N → 1_N (composite-uexpr ABS;
  mirror of session-137's NEG -1_N pin on the ABS arm); 2_m ^ -1
  → 0.5_m^-1 (negative-exponent power flips uexpr sign);
  2_m ^ 0 → Real(1) (zero-exponent collapses uexpr to empty →
  unwraps to dimensionless Real(1)).

`test-persist.mjs` 40 / 0 (unchanged this run — session 144
shipped the +2 casModulo persistence pins absorbed in this
snapshot).  `sanity.mjs` 22 / 0 (unchanged).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1014 | 0    | +25 session-119 (EGV / RSD / GREDUCE), +25 session-124 (LNAME / GBASIS), +9 session-127 (LNAME edge cluster), +13 session-139 (LIN 5 + LIMIT/lim 8), **+29 session-144** (MODSTO + ADDTMOD/SUBTMOD/MULTMOD/POWMOD MODULO ARITH cluster). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    | session-112 migration snapshot retained. |
| test-comparisons.mjs        |  111 | 0    | +15 session-107 Rational, +8 session-127 Q × C / Q × R, +8 session-132 Z × Q reverse-direction cluster. |
| test-control-flow.mjs       |  704 | 0    | +34 s116, +46 s121 PROMPT/KILL, +4 s122, +37 s126 (HALT/PROMPT lift through SEQ+MAP), +65 s131 (DOLIST/DOSUBS/STREAM bodies), +36 session-136 (loop auto-close), +76 session-141 (rpl-programming), **+29 session-146** (Program structural round-trip pins).  Session 147 did not touch this file. |
| test-entry.mjs              |   90 | 0    | session-112 migration snapshot retained. |
| test-eval.mjs               |   62 | 0    | session-112 migration snapshot retained. |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    | session-112 migration snapshot retained. |
| test-matrix.mjs             |  347 | 0    | Remaining 1 site is the negated `assert(!threw, …)` RDZ-0 acceptance check, deliberately untouched. |
| test-numerics.mjs           |  687 | 0    | +27 session-109 + session-112 LOG-CMPLX-OFF split (retained). |
| test-reflection.mjs         |  246 | 0    | **+50 session-146** (Program/structural round-trip pins via the `_roundTripProgram` helper, plus 14 incidental session073 fires). |
| test-stack-ops.mjs          |  **48** | 0    | +9 session-137 edge-path closure, **+7 session-147** (PICK / PICK3 / UNPICK / NDUPN rejection-path closure). |
| test-stats.mjs              |  **55** | 0    | +11 s127 rejection-path catchup, +9 s132 ASCII-alias positive closure + MAXΣ multi-column positive, +7 session-137 ASCII-alias REJECTION closure, **+8 session-147** (NSIGMA/NΣ + MEAN/VAR/SDEV reject + canonical ΣX/ΣX² col-0 positive). |
| test-types.mjs              |  803 | 0    | +50 s115, +2 s117, +68 s120, +43 s125, +35 s130, +31 s135, +36 session-140, +23 session-142, **+41 session-145** (forward-trig SIN/COS/TAN + LN/LOG/EXP/ALOG EXACT-mode lift + bespoke-V/M inner-Tagged-rejection M-axis RE/IM closure).  Session 147 did not touch this file. |
| test-ui.mjs                 |   77 | 0    | session-112 migration snapshot retained. |
| test-units.mjs              |  **56** | 0    | +12 session-137 symmetric / composite / mixed-dim closure, **+5 session-147** ('-' mixed-dim reject + different-dim-pair '+' reject + composite ABS -1_N + ^ negative-exponent + ^ zero-exponent). |
| test-variables.mjs          |  248 | 0    | One remaining `let threw` at :446 is the varPurge-doesn't-throw scaffold (followed by a hard PURGE assertThrows); negated form, deliberately left. |
| **test-all (aggregate)**    | **4903** | **0** | Session 147 close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   40 | 0    | +2 session-144 (casModulo BigInt slot persistence round-trip) absorbed in this snapshot; session 147 did not touch this file. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

### Prior snapshot — Session 142 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **4711
passing / 0 failing** (session-141 close, fully green).  Sibling
deltas since session-137 close (4586): 0 session-138 (code-review
doc-only), +13 session-139 (test-algebra LIN + LIMIT/lim), +36
session-140 (test-types hyperbolic Tagged-of-V/M + inverse-trig/
EXPM Tagged-of-V/M + ARG bare V/M and ARG/CONJ/RE/IM Tagged-of-V/M),
+76 session-141 (test-control-flow rpl-programming run; session
log not yet written but lock gracefully released and file fully
green).  `test-persist.mjs` 38 / 0.  `sanity.mjs` 22 / 0.

Final: **4734 passing / 0 failing** — fully green.  The +23
session-142 deltas land in `test-types.mjs` (739 → 762) across
three substantive clusters that surfaced as next-session
candidates in session 140's log:
- **Cluster 1 (12)** — Inverse-trig + inverse-hyp `_exactUnaryLift`
  Integer-stay-exact: ASIN/ACOS/ATAN bare-scalar Integer-stay-exact
  in RAD (3) + ATAN(Integer(1)) RAD stay-symbolic (1) + DEG-mode
  integer-clean folds (3: ASIN(1)→90, ACOS(0)→90, ATAN(1)→45) +
  Rational arm (2: ASIN(Q(1,2)) DEG → 30, ASIN(Q(1,3)) DEG →
  Symbolic) + inverse-hyp ASINH/ACOSH/ATANH integer-clean trio (3).
- **Cluster 2 (5)** — CONJ / RE / IM / ARG on Tagged-of-Symbolic
  composition through the 2-deep `_withTaggedUnary(_withListUnary
  (handler))` wrapper: outer Tagged preserved, inner Sy lifted via
  `Symbolic(AstFn(<op>, [Name(X)]))`.  Closes the Sy axis on the
  Tagged-of-X composition surface for the bespoke V/M-handler
  family.
- **Cluster 3 (6)** — Inner-Tagged-inside-Vector / Matrix rejection
  on bespoke V/M handlers ARG/CONJ/RE/IM (4 V-axis + 2 M-axis =
  6 pins).  Mirror of session 140 Cluster 1's
  `Vec[:x:Real(0), :y:Real(0)] SINH` rejection but on the bespoke
  V/M-handler family (different wrapper shape: 2-deep with bespoke
  V/M dispatch inside vs. session 140's 3-deep `_withVMUnary` chain).

`test-persist.mjs` 38 / 0 (unchanged).  `sanity.mjs` 22 / 0
(unchanged).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            |  985 | 0    | +25 session-119 (EGV / RSD / GREDUCE), +25 session-124 (LNAME / GBASIS), +9 session-127 (LNAME edge cluster), **+13 session-139** (LIN 5 + LIMIT/lim 8). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    | session-112 migration snapshot retained. |
| test-comparisons.mjs        |  111 | 0    | +15 session-107 Rational, +8 session-127 Q × C / Q × R, +8 session-132 Z × Q reverse-direction cluster. |
| test-control-flow.mjs       |  **675** | 0    | +34 s116, +46 s121 PROMPT/KILL, +4 s122, +37 s126 (HALT/PROMPT lift through SEQ+MAP), +65 s131 (DOLIST/DOSUBS/STREAM bodies), +36 session-136 (loop auto-close), **+76 session-141** (rpl-programming; session log not yet written but file fully green).  Session 142 did not touch this file. |
| test-entry.mjs              |   90 | 0    | session-112 migration snapshot retained. |
| test-eval.mjs               |   62 | 0    | session-112 migration snapshot retained. |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    | session-112 migration snapshot retained. |
| test-matrix.mjs             |  347 | 0    | Remaining 1 site is the negated `assert(!threw, …)` RDZ-0 acceptance check, deliberately untouched. |
| test-numerics.mjs           |  687 | 0    | +27 session-109 + session-112 LOG-CMPLX-OFF split (retained). |
| test-reflection.mjs         |  196 | 0    |                                          |
| test-stack-ops.mjs          |   41 | 0    | +9 session-137 edge-path closure (retained). |
| test-stats.mjs              |   47 | 0    | +11 s127 rejection-path catchup, +9 s132 ASCII-alias positive closure + MAXΣ multi-column positive, +7 session-137 ASCII-alias REJECTION closure (retained). |
| test-types.mjs              |  **762** | 0    | +50 s115, +2 s117, +68 s120, +43 s125, +35 s130, +31 s135, +36 session-140 (hyperbolic Tagged-of-V/M 9 + inverse-trig/EXPM Tagged-of-V/M 9 + ARG bare V/M and ARG/CONJ/RE/IM Tagged-of-V/M 18), **+23 session-142** (inverse-trig/inverse-hyp Integer-stay-exact 12 + Tagged-of-Sy CONJ/RE/IM/ARG 5 + inner-Tagged-inside-V/M rejection on bespoke ARG/CONJ/RE/IM 6). |
| test-ui.mjs                 |   77 | 0    | session-112 migration snapshot retained. |
| test-units.mjs              |   51 | 0    | +12 session-137 symmetric / composite / mixed-dim closure (retained). |
| test-variables.mjs          |  248 | 0    | One remaining `let threw` at :446 is the varPurge-doesn't-throw scaffold (followed by a hard PURGE assertThrows); negated form, deliberately left. |
| **test-all (aggregate)**    | **4734** | **0** | Session 142 close.  Fully green; per-file headlines from `node tests/test-all.mjs`. |
| test-persist.mjs (separate) |   38 | 0    | session-117 baseline retained — no persist-schema touches this run. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

### Prior snapshot — Session 137 (retained for context)

Baseline at session-137 start: 4558 / 0 (session-136 close).
Final: 4586 / 0; +28 session-137 deltas (+9 test-stack-ops
edge-path closure, +12 test-units symmetric / composite / mixed-
dim closure, +7 test-stats ASCII-alias REJECTION closure).
`test-persist.mjs` 38 / 0.  `sanity.mjs` 22 / 0.

### Prior snapshot — Session 132 (retained for context)

Baseline at session-132 start: 4474 / 0 (session-131 close).
Final: 4491 / 0; +17 session-132 deltas (+9 test-stats ASCII-alias
positives SX2/SY/MINS + MAXΣ multi-col + all-negative Vector,
+8 test-comparisons Z × Q reverse-direction cluster).  T-002
(REVIEW.md doc finding) closed: four `docs/TESTS.md` sites
re-phrased to record the actual evidence that
`logs/session-121.md` was written within the lock window.
`test-persist.mjs` 38 / 0.  `sanity.mjs` 22 / 0.

### Prior snapshot — Session 127 (retained for context)

Baseline at session-127 start: 4302 / 1 (the single fail —
`session126: SEQ body iter 1 stack snapshot survives the halt`
— was session 126's in-progress test-control-flow.mjs work,
held under their lock).  Final at session-127 close: 4374 / 0,
fully green; +28 session-127 deltas (+9 test-algebra LNAME
edge, +8 test-comparisons Q × C / Q × R, +11 test-stats Y-family
+ MAXΣ/MINΣ rejection-path catchup) plus the +44 from session
126 closing concurrently inside the run.  test-persist 38 / 0.
sanity 22 / 0.

### Prior snapshot — Session 102 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **3639 / 0**
(session-101 close).  Final: **3660 / 0** (+21 session-102 adds).
Deltas: +7 String-lex edges in `test-comparisons.mjs` (73 → 80),
+4 BinInt-rounder base-preservation edges in `test-types.mjs`
(276 → 280), +10 SST/DBUG regression guards in `test-control-flow.mjs`
(294 → 304).  Behaviour-preserving migrations: 9 sites in `test-stack-ops.mjs`,
5 sites in `test-types.mjs`.

---

## Prior snapshot — Session 084 (retained for history)

---

## Lane charter (from SKILL.md)

> Ensure the test suite is complete, reliable, and has good coverage.
> Safety-net lane for the four implementer tasks.

- Own everything under `tests/` + `sanity.mjs` + `test-all.mjs` plumbing.
- **Do not** fix source-code bugs surfaced by a test; surface the gap here and
  let the relevant sibling lane fix it.
- **Do not** delete a failing test to make the suite green; convert to `.skip`
  with a pointer if it has to be disabled, and log it.
- **HP50 fidelity.** Assertions must match HP50 outputs per the PDFs, not
  whatever the current code happens to produce.

Sibling lanes:

| Lane task id             | Lane owns                                   |
|--------------------------|---------------------------------------------|
| `rpl5050-command-support`| new ops                                     |
| `rpl5050-data-type-support` | widen existing ops' type surface         |
| `rpl5050-ui-development` | keypad, entry line, display, paging         |
| `rpl5050-rpl-programming`| User-RPL interpreter: Program, CASE/IF/LOCAL, HALT/CONT |
| `rpl5050-unit-tests`     | **this lane**                               |

---

## Coverage snapshot (session 084)

Baseline at lane start: `node tests/test-all.mjs` = **3864 passing /
0 failing** (grew +119 since session 075 — session-076/081 command-
support contributions: TRUNC two-arg, PSI digamma+polygamma, CYCLOTOMIC
+41; session-082 data-types: DERIV hyp + INTEG SINH/COSH/ALOG +
simplify rounding idempotency +29; session-083 rpl-programming: multi-
slot HALT LIFO + RUN op + IF auto-close +49).
`node tests/test-persist.mjs` = 34 passing / 0 failing.
`node tests/sanity.mjs` = 22 passing / 0 failing in ~5 ms.

Final: `node tests/test-all.mjs` = **3872 passing / 0 failing** (+8
this lane — the session-084 KNOWN-GAP block in
`tests/test-types.mjs` documents `==` / `SAME` on Program / Directory
with 5 soft asserts + 3 regression guards.  The 104-site
`assertThrows` migration in `tests/test-matrix.mjs` is behaviour-
preserving — assertion count unchanged at 347.).  `test-persist.mjs`
unchanged (34); `sanity.mjs` unchanged (22).  **Flake-scan harness
confirms 10/10 identical runs end-of-session — 3808 assertion labels
stable-ok, zero flaky outcomes.**  Combined with session 075's 5
clean runs and session 083's 10 clean runs, the rpl-programming-lane
HALT/CONT flake filing is supported by **25+ consecutive clean runs**;
this session also ran `flake-bisect.mjs --shuffles 6 --trials 4` on
the original HALT/CONT label and got 24/24 ok.  Recommendation: the
data-types and rpl-programming lanes can close that filing next run.

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1355 | 0    | Largest file; CAS focus.                 |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |   68 | 0    |                                          |
| test-control-flow.mjs       |  225 | 0    | +49 from s083 (multi-slot HALT LIFO + RUN + IF auto-close). |
| test-entry.mjs              |   86 | 0    |                                          |
| test-eval.mjs               |   62 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    | **104 sites migrated to `assertThrows` this lane** (behaviour-preserving; pass count unchanged). |
| test-numerics.mjs           |  631 | 0    | +41 from s081 (TRUNC two-arg + PSI + CYCLOTOMIC). |
| test-reflection.mjs         |  173 | 0    |                                          |
| test-stack-ops.mjs          |   32 | 0    |                                          |
| test-stats.mjs              |   20 | 0    |                                          |
| test-types.mjs              |  **158** | 0    | **+8 this lane** (session084 KNOWN-GAP block: `==` / `SAME` on Program/Directory).  +29 from s082 (DERIV hyp + INTEG + simplify rounding). |
| test-ui.mjs                 |   73 | 0    |                                          |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    |                                          |
| **test-all (aggregate)**    | **3872** | **0** | 10 consecutive clean flake-scan runs end-of-session. |
| test-persist.mjs (separate) |   34 | 0    |                                          |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

Grand total assertions available across all runnable `.mjs` files
(excluding the aggregator itself): **3928** passing, 0 failing.

### Coverage heat-map notes

- **BinaryInteger equality cluster is CLOSED.**  Session 077 (data-
  types lane) landed the `eqValues` BinInt branch + `_binIntCross-
  Normalize` helper + `comparePair` BinInt coercion that this lane
  filed in session 074.  The 9 soft-asserts flipped to hard; 6 new
  positive/rejection cases added.  DATA_TYPES rows for `==` / `SAME`
  / `<` / `>` / `≤` / `≥` now show B ✓.
- **Per-file headline counts ship in `test-all.mjs`** (landed s074).
- **Flake-scan harness `tests/flake-scan.mjs`** (landed s074).  Run
  `node tests/flake-scan.mjs [N] [--quiet]` before escalating any
  single flake to a lane filing.
- **Flake-BISECT harness `tests/flake-bisect.mjs`** (landed s075).
  When flake-scan identifies a non-deterministic assertion,
  `flake-bisect.mjs --label "<label>"` hunts a reproducing
  file-import order by shuffling, then shrinks the prefix until only
  the load-bearing files remain.  Also supports `--order a,b,…`
  for reproducing a known-bad ordering directly.  Back-end is
  `tests/run-order.mjs`, a configurable variant aggregator that
  takes FILES via argv or `--from-test-all`.
- **`assertThrows` migration progress.**  This session (s084)
  migrated **104 inline sites in `tests/test-matrix.mjs`** — the
  single biggest target on the queue.  Behaviour-preserving:
  pass count unchanged at 347 before/after.  Approach: a Python-
  driven regex pass over the SPLIT pattern (try/catch on separate
  lines, 26 sites) followed by the SIMPLE pattern (try/catch
  inline, 78 sites).  Total prior s075 migration: 12 sites across
  test-entry/units/comparisons/stats.  **Remaining queue:** test-
  numerics (~115), test-algebra (~53), test-variables (~16),
  test-lists (~15), test-stack-ops (~10), test-binary-int (~9),
  test-types (~5), test-control-flow (~5), test-eval (~2), test-
  ui (~2), test-persist (~1).  One negative-form site in test-
  matrix (`assert(!threw, …)` for RDZ-0 acceptance) was left as-is
  — `assertThrows` would invert the meaning.
- **Sanity gate now wired into a script.**  `scripts/pre-commit.sh`
  (new this session) runs `tests/sanity.mjs` as the always-on cheap
  gate; `--full` adds `tests/test-all.mjs`; `--persist` adds
  `tests/test-persist.mjs`.  Hookable as a real git hook via
  `ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit`.
- **DATA_TYPES ✗ rejection-sweep** audit done in s075; gaps filled
  by the session-075 block in `tests/test-numerics.mjs`.

---

## Known gaps (open items)

### Assigned to `rpl5050-data-type-support`

1. **String lexicographic `<` / `>` / `≤` / `≥`** — (rolled forward
   from s073 queue).  HP50 User Guide App-J documents char-code lex
   order. `comparePair()` rejects Strings with `Bad argument type`.
   Test: `tests/test-comparisons.mjs` KNOWN GAP marker around the
   original session 068 block (line ~352).  Soft-asserted; flip to
   hard once widened.
2. **`==` / `SAME` on Program, Directory** — **NEW SOFT-ASSERTS
   READY THIS SESSION (s084).**  See block at end of
   `tests/test-types.mjs` labelled `session084: KNOWN GAP — …` (5
   soft asserts + 3 hard regression guards).  Test plan for the
   data-types lane:
   - **Program × Program:** add `if (isProgram(a) && isProgram(b))
     return _eqArr(a.tokens, b.tokens);` to `eqValues` in
     `www/src/rpl/ops.js` (the existing `_eqArr` already recurses via
     `eqValues`, so any nested Programs / Lists / etc. compare
     correctly).
   - **Directory × Directory:** add `if (isDirectory(a) &&
     isDirectory(b)) return a === b;` to `eqValues`.  HP50 spec
     (AUR §4-7) is reference identity, NOT structural — the s084
     "two distinct Directories with same name → 0" regression
     guard is the test that makes this explicit.
   - Then flip the 5 soft asserts (`v === 0 || v === 1`) to hard
     (`v === 1`), updating the labels from `session084: KNOWN GAP
     — …` to `session084: …`.
3. **Dim-equivalence `==` on Units** — (rolled forward from s073).
   `1_m == 1_km` = 0 today by design (strict structural); a separate
   `UEQUAL` op or flag would give dimension-aware equality.  Low
   priority.
4. **BinaryInteger `FLOOR` / `CEIL` / `IP` / `FP` widening** —
   (filed by data-types lane in its session 077 "Next-session
   candidates" queue).  `_rounderScalar` only dispatches on
   `isReal/isInteger/isUnit`; BinInt should be accepted as a no-op.
   No test-lane action until the widening lands — at that point the
   `session075: CEIL(Complex)` adjacent block is the natural home
   for positive BinInt rounder tests.

### Assigned to `rpl5050-rpl-programming`

- **Flake watch — HALT/CONT ordering dependency.**  Status UPDATED
  this session (s084).  Cumulative clean-run count now standing at
  **25+ consecutive clean flake-scan runs** (s075=5, s083=10, s084=10
  this session) plus 24 flake-bisect random shuffles × trials this
  session, all `ok`.  The session-078 `_localFrames` reset and the
  session-083 multi-slot HALT LIFO refactor appear to have closed the
  ordering dependency.  **Recommendation: close this filing in the
  next rpl-programming run.**  If it reappears, the
  `tests/flake-bisect.mjs` harness is the right first tool:
  - `node tests/flake-bisect.mjs --label "session073: first CONT runs 2 + → 3, re-hits HALT"`

### Assigned to `rpl5050-command-support` / `rpl5050-data-type-support`

No new missing-op gaps flagged this run.  (The coverage sweep revealed
no zero-coverage ops in `docs/COMMANDS.md` — the lanes have kept up.)

### File hygiene (blocked by tooling — `rpl5050-unit-tests`)

- **O-009 — `tests/test-control-flow.mjs.bak{,2}` stray backups.**
  Two backup files sitting beside the live test-control-flow.mjs
  (92,129 bytes + 92,141 bytes, pre-session-111 snapshots).  Not
  referenced by any runner but creates grep noise and
  source-of-truth confusion.  **Session 117 attempted `rm` from
  the scheduled-task sandbox and got `Operation not permitted`;
  the `cowork_allow_file_delete` permission prompt is gated
  behind user-present approval, which is unavailable in
  unsupervised scheduled-task runs.  Deferred to a human-supervised
  unit-tests run or the code-review lane.**

### Harness / test-plumbing (own items — `rpl5050-unit-tests`)

1. **~~No `sanity.mjs` smoke file~~** — ✅ session 070.
2. **~~`helpers.mjs` is minimal~~** — ✅ session 070.
3. **~~No per-file headline counts in `test-all.mjs`~~** — ✅ session
   074.
4. **~~No flake-detection harness~~** — ✅ session 074.  Use
   `node tests/flake-scan.mjs [N] [--quiet]`.
5. **~~No flake-bisect harness~~** — ✅ session 075.  Use
   `node tests/flake-bisect.mjs --label "<assertion label>"`.
6. **~~Wire `sanity.mjs` into a pre-commit-style script~~** —
   ✅ **session 084 (this run).**  `scripts/pre-commit.sh` ships;
   default invocation runs the 5-ms sanity smoke; `--full` adds the
   full 3872-assertion suite; `--persist` adds the persist suite.
   Hookable as a real git hook via:
   `ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit`.
7. **Audit inline `assertThrows`-pattern sites and migrate** —
   **IN PROGRESS** (continuing from s075).
   - s075 migrated 12 sites: test-entry 3, test-units 4,
     test-comparisons 2, test-stats 2, test-entry 1 re-counted.
   - **s084 (this run) migrated 104 sites in `tests/test-matrix.mjs`**
     — 26 SPLIT (try/catch on separate lines) + 78 SIMPLE (try/catch
     inline).  Single negated site (`assert(!threw, …)` for RDZ-0
     acceptance) deliberately untouched.  Behaviour-preserving:
     347 passes before/after.
   - **Remaining queue (priority order):** test-numerics ~115,
     test-algebra ~53, test-variables ~16, test-lists ~15,
     test-stack-ops ~10, test-binary-int ~9, test-types ~5,
     test-control-flow ~5, test-eval ~2, test-ui ~2, test-persist ~1.
   - **Suggested next:** test-numerics in 4 chunks of ~30 (Bad
     argument value / Bad argument type / Invalid dimension /
     Infinite result groupings work as natural chunk boundaries).
8. **Duplicate-label hygiene.**  Session 074 flake-scan reported 3566
   unique labels out of 3630 assertions — 64 duplicate labels.  This
   session's flake-scan reports 3808 unique labels out of 3872
   assertions — **still 64**.  Not a correctness concern.  Low
   priority; fix opportunistically.
9. **`flake-bisect` UX polish.**  When no reproducer is found, the
   harness exits 3 with a one-liner.  Future enhancement: record
   per-shuffle label-trajectory so the user can grep which orderings
   *almost* reproduced.  Low priority.

---

## Mid-session events (session 084)

- **assertThrows migration in `tests/test-matrix.mjs` landed cleanly.**
  104 inline sites converted to `assertThrows`.  Approach: a Python
  regex pass — SPLIT pattern first (matches multi-line
  `try { … }\n    catch (e) { threw = /…/.test(e.message); }\n
  assert(threw, …);`, 26 hits), then SIMPLE pattern second
  (matches inline `try { … } catch (e) { threw = /…/.test(...); }
  \n    assert(threw, …);`, 78 hits).  Order matters because the
  SIMPLE pattern would otherwise greedily eat across newlines.
  One negated site (`assert(!threw, …)` for `RDZ 0` acceptance)
  deliberately left as-is.  Behaviour preserved: 347 passes
  before, 347 after; full suite went from 3864 to 3872 (+8 from
  the new s084 KNOWN-GAP block, NOT from the migration).
- **KNOWN-GAP block for `==` / `SAME` on Program / Directory.**
  8 new assertions appended to `tests/test-types.mjs` —
  5 soft (`v === 0 || v === 1`) for the equality cases the
  data-types lane needs to widen, plus 3 hard regression guards
  that must hold both before AND after the widening (different
  tokens → 0; permuted tokens → 0; distinct Directory objects with
  same name → 0 because Directory equality is reference identity,
  not structural).  The data-types lane's flip is a one-line
  edit per type — see "Assigned to `rpl5050-data-type-support`"
  item 2.
- **Pre-commit script `scripts/pre-commit.sh` shipped.**  Closes the
  s070/s074/s075 queue item.  Default = 5-ms sanity gate; `--full`
  adds the test-all suite; `--persist` adds the persist suite.
  Designed to be hookable as a real git pre-commit hook.
- **HALT/CONT flake confirmed not-reproducing.**  10 flake-scan
  runs this session (3808 stable-ok across all 10) plus 24
  flake-bisect random-shuffle invocations — all `ok`.  Cumulative
  clean-run count is now 25+; recommendation lodged with the
  rpl-programming lane to close the filing next run.
- **No cross-lane import races this run.**  `test-all.mjs` import
  order processed cleanly on every flake-scan invocation.
- **Concurrent-lane awareness.**  Session 083 (rpl-programming —
  `tests/test-control-flow.mjs`, `tests/test-reflection.mjs`,
  `www/src/rpl/algebra.js`, `docs/RPL.md`) was active at lane entry; my
  s084 lock scope explicitly excluded all of those.  Session 085
  (code-review — `docs/REVIEW.md`, `logs/`) opened mid-run; per the
  README's `logs/` exemption I used a unique session-084 filename
  and proceeded.

---

## Known flakes

None observed this session.  The session-074 intermittent (see above
in Known gaps → rpl-programming) did not recur.  `tests/flake-scan.mjs`
harness (`node tests/flake-scan.mjs [N] [--quiet]`) and the new
`tests/flake-bisect.mjs` harness (`node tests/flake-bisect.mjs
--label "<label>"`) remain the first and second lines of diagnostic
when the next flake appears.

---

## Next-session queue (priority order)

0. **~~T-002 close — TESTS.md session-121 stale-prune misclaim
   (4 sites).~~**  **Resolved session 132.**  Re-phrased the four
   sites at `:87-103`, `:214` (no change — table line attribution
   only), `:653-666`, and the inline `:653` paragraph to record
   the actual evidence: `logs/session-121.md` exists (mtime
   2026-04-25 01:04:30, two seconds before the lock body's
   `releasedAt` of 01:04:43, the natural "write log, then unlink
   lock" ordering).  The misclaim originated from a session-122
   `ls logs/` snapshot taken before the session-121 commit landed.
   Future improvement noted: a `releaseReason` field in the lock
   body would make graceful-release vs. prune unambiguous for
   audits — that's a `utils/@locks/lock.mjs` enhancement filed
   for a future run.

1. **~~Close the HALT/CONT rpl-programming filing.~~** — assumed
   closed by session 111 / 116 rpl-programming runs; no flake-scan
   reproduction in any session since s084.  Drop this item if it
   reappears in the Known-gaps list on next read.

2. **~~`assertThrows` migration — `test-control-flow.mjs` (5
   sites).~~**  **Resolved session 122.**  4 of 5 sites migrated
   to `assertThrows()` + new regression guard at each (+4
   assertions); 5th site is the negated DOERR-0 form, deliberately
   left.  Only `let threw` line remaining in the file is line 919
   (DOERR-0 no-op); `grep -n 'let threw' tests/test-control-flow.mjs`
   confirms.

3. **~~`assertThrows` migration — `test-types.mjs` (:2068/:2074).~~**
   **Resolved session 117.**  Both TRUNC sites migrated to
   `assertThrows(/TRUNC expects 2 argument/)` + follow-up
   `/got N\b/` regression guards on the previously-uncovered
   actual-arg-count tail of the error message.  +2 assertions.

4. **~~`assertThrows` migration — `test-persist.mjs` (1 site at
   :118).~~**  **Resolved session 117.**  Migrated to `assertThrows`
   via a local helper + added 3 new regression guards on adjacent
   reject branches (missing-version, `null` snap, string snap).
   +4 assertions.

5. **O-009 — `tests/test-control-flow.mjs.bak{,2}` cleanup —
   DEFERRED, blocked by tooling.**  Session 117 attempted to
   delete the two stray backup files but `rm` returned
   `Operation not permitted`, and `cowork_allow_file_delete`
   requires a user-present approval that is unavailable in
   unsupervised scheduled-task runs.  Re-try on a human-supervised
   unit-tests run, or hand to the code-review lane.

6. **Duplicate-label cleanup — opportunistic.**  Still ~100 labels
   duplicated across files (exact count drifts as sibling lanes
   ship).  Not a correctness concern but confusing for `grep`-
   based attribution.  Best done during other test-file edits
   to avoid touching files for a single-purpose label rename.

7. **Explicit positive-coverage pass on ✓ cells in DATA_TYPES that
   only have negative / rejection evidence today.**  Plan:
   enumerate ✓ cells → grep for op name in tests → flag any ✓ cell
   whose op has no adjacent positive assertion.

8. **assertThrows migration — DONE.**  Confirmed at session-127
   exit: `grep -n 'let threw' tests/*.mjs` returns only 4 sites, all
   of which are negated-form acceptance scaffolds (the
   `assert(!threw, …)` "this op should NOT throw" idiom):
   - `test-stack-ops.mjs:322` — CLEAR-on-empty-stack no-op.
   - `test-control-flow.mjs:919` — DOERR-0 no-op (per session 122).
   - `test-persist.mjs:32` — local helper scaffold (the file's
     extra-comment block at :136 documents the migration).
   - `test-variables.mjs:446` — varPurge-doesn't-throw scaffold,
     followed immediately by a hard PURGE assertThrows.
   Migrating any of these to `assertThrows` would invert the
   meaning.  No further action; close the queue item.

9. **Sibling-coordination — session 126 in-flight at session-127
   exit.**  Session 126 (rpl-programming) acquired its lock before
   session 127 started and was still active at the close.  The 4
   `session126:` failing assertions in `tests/test-control-flow.mjs`
   are PROMPT/HALT lift-through-SEQ+MAP work — pinned ahead of the
   implementation.  Session 127 deliberately did not touch that
   file or `www/src/rpl/ops.js` (both in session 126's lock scope).
   When session 126 closes the suite back to fully-green, the
   "+37 passing assertions under `session126:` labels" delta should
   be absorbed in the next unit-tests snapshot together with any
   final fail→pass transitions.  No unit-tests-lane action required.

---

## Session-by-session log index

- Session 265 (2026-04-26) — this run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5640 / 0**,
  test-persist **passed / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  No open Unit Tests REVIEW.md findings (T-001
  through T-004 all resolved; O-011 + O-012 deferred post-ship).
  Work done: refreshed TESTS.md "Last updated" header to session-265;
  added session-265 coverage snapshot (absorbed sibling deltas
  5621 → 5640 over sessions 261–264: s261 code-review doc-only,
  s262 command-support doc-only, s263 data-type-support +19
  Unit-column rejection pins, s264 rpl-programming verification-only);
  wrote `logs/session-265.md`.
  Lock: `utils/@locks/session265-unit-tests.json`.

- Session 260 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5621 / 0**,
  test-persist **passed / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  No open Unit Tests REVIEW.md findings (T-001
  through T-004 all resolved; O-011 + O-012 deferred post-ship).
  Work done: refreshed TESTS.md "Last updated" header to session-260;
  added session-260 coverage snapshot (absorbed sibling deltas
  5599 → 5621 over sessions 257–259: s257 command-support doc-only,
  s258 data-type-support +22 BinaryInteger B-column rejection pins,
  s259 rpl-programming verification-only); back-filled session-log
  index entries for sessions 250 and 256 (both ran but neither added
  an index entry at the time); wrote `logs/session-260.md`.
  Lock: `utils/@locks/session260-unit-tests.json`.

- Session 256 (2026-04-26) — prior run.  Unit-tests lane (+8 new
  assertions; scope cap 1/3 workload).  Gates at entry: test-all
  **5591 / 0**, test-persist **66 / 0**, sanity **22 / 0** — all
  green.  D-001 remains closed.  Open REVIEW.md findings: T-004
  (resolved same session concurrently with session-255-code-review);
  O-011 + O-012 deferred post-ship.  Work done: +8 cross-type
  ordered-comparator asymmetric rejection pins in `tests/test-types.mjs`
  (1140 → 1148; `session256:` labels); refreshed TESTS.md "Last
  updated" header to session-256; added session-256 coverage snapshot;
  wrote `logs/session-256.md`.
  Lock: `utils/@locks/session256-unit-tests.json`.

- Session 250 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5571 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  Work done: refreshed TESTS.md "Last updated" header
  to session-250; added session-250 coverage snapshot (absorbed sibling
  deltas 5560 → 5571 over sessions 247–249 + unlogged +3 algebra edit:
  s247 command-support doc-only, s248 data-type-support +8
  (UTPC/UTPT L+T widening), s249 rpl-programming verification-only,
  +3 unlogged test-algebra edit post-s249); wrote `logs/session-250.md`.
  Lock: `utils/@locks/session250-unit-tests.json`.

- Session 246 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5560 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only (O-013 resolved session 243),
  both `[deferred - post-ship]`.  Work done: refreshed TESTS.md
  "Last updated" header to session-246; added session-246 coverage
  snapshot (absorbed sibling deltas 5541 → 5560 over sessions 243–245:
  s243 command-support doc-only + O-013 audit close, s244
  data-type-support +19 (ERF/ERFC/BETA/UTPC/UTPF/UTPT Z+L/V/M cell
  audit in test-types.mjs), s245 rpl-programming verification-only);
  wrote `logs/session-246.md`.
  Lock: `utils/@locks/session246-unit-tests.json`.

- Session 242 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5541 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 + O-013, all `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-242; added session-242 coverage snapshot (absorbed
  sibling deltas 5519 → 5541 over sessions 234–241: s234-code-review
  doc-only, s235 command-support doc-only, s236 data-type-support
  +6 (LNP1/EXPM Q-accept + TRUNC/ZETA/LAMBERT/PSI Q-reject pins),
  s237 rpl-programming verification-only, s238 unit-tests snapshot-
  only (coverage snapshot claimed in log but not written — absorbed
  here), s239 command-support doc-only, s240 data-type-support +16
  (Q-cell audit stat-dist + combinatorial families), s241
  rpl-programming verification-only); wrote `logs/session-242.md`.
  Lock: `utils/@locks/session242-unit-tests.json`.

- Session 238 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5525 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 + O-013, all `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-238; added session-238 coverage snapshot (absorbed
  sibling deltas 5511 → 5525 over sessions 229–237: s229-code-review
  doc-only, s230 command-support doc-only, s231 data-type-support
  +8 (CONJ/RE/IM Q-rejection +1; Q-cell STO-aware audit +7),
  s232 rpl-programming verification-only, s233 unit-tests CRASHED
  (header-only update; no log written — pruned by s234 code-review),
  s234-code-review doc-only, s235 command-support doc-only, s236
  data-type-support +6 (LNP1/EXPM Q-accept + TRUNC/ZETA/LAMBERT/PSI
  Q-reject pins), s237 rpl-programming verification-only); wrote
  `logs/session-238.md`.  Lock: `utils/@locks/session238-unit-tests.json`.

- Session 228 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5511 / 0**,
  test-persist **passed / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 + O-013, all `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-228; added session-228 coverage snapshot (absorbed
  sibling deltas 5508 → 5511: s224-code-review doc-only O-013 filed,
  s225 command-support doc-only, s226 +3 CONJ/RE/IM Q-rejection pins,
  s227 rpl-programming verification-only); wrote `logs/session-228.md`.
  Lock: `utils/@locks/session228-unit-tests.json`.

- Session 223 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5508 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-223; added session-223 coverage snapshot (absorbed
  sibling deltas 5508 → 5508: s219-code-review doc-only, s220
  command-support doc-only, s221 data-type-support doc-only,
  s222 rpl-programming verification-only); wrote `logs/session-223.md`.
  Lock: `utils/@locks/session223-unit-tests.json`.

- Session 218 (2026-04-26) — this run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5508 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-218; added session-218 coverage snapshot (absorbed
  sibling deltas 5503 → 5508: s215 command-support doc-only,
  s216 +5 PSI L/V/M pins, s217 rpl-programming verification-only);
  wrote `logs/session-218.md`.
  Lock: `utils/@locks/session218-unit-tests.json`.

- Session 214 (2026-04-26) — Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5503 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-214; added session-214 coverage snapshot (absorbed
  sibling deltas 5493 → 5503: s211 command-support doc-only,
  s212 +10 ZETA/LAMBERT Z/L/V/M pins, s213 rpl-programming
  verification-only); wrote `logs/session-214.md`.
  Lock: `utils/@locks/session214-unit-tests.json`.

- Session 210 (2026-04-26) — this run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5493 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-210; added session-210 coverage snapshot (absorbed
  sibling deltas 5492 → 5493: s207 command-support doc-only,
  s208 +1 erf M-cell pin, s209 rpl-programming doc-only); wrote
  `logs/session-210.md`.
  Lock: `utils/@locks/session210-unit-tests.json`.

- Session 206 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5492 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-206; added session-206 coverage snapshot (absorbed
  sibling deltas 5485 → 5492: s203 command-support doc-only,
  s204 +7 erfc L/V/M/T+L pins, s205 rpl-programming doc-only);
  wrote `logs/session-206.md`.
  Lock: `utils/@locks/session206-unit-tests.json`.

- Session 202 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5485 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-202; added session-202 coverage snapshot (absorbed
  sibling deltas 5472 → 5485: s199 command-support doc-only C-014
  close, s200 +13 GAMMA/LNGAMMA/erf/erfc L/V/M/T pins,
  s201 rpl-programming doc-only); wrote `logs/session-202.md`.
  Lock: `utils/@locks/session202-unit-tests.json`.

- Session 198 (2026-04-26) — prior run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5472 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-198; added session-198 coverage snapshot (absorbed
  sibling deltas 5464 → 5472: s194 code-review doc-only, s195
  command-support doc-only C-013 close, s196 +8 TRUNC L/T pins,
  s197 rpl-programming doc-only); wrote `logs/session-198.md`.
  Lock: `utils/@locks/session198-unit-tests.json`.

- Session 193 (2026-04-26) — earlier run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5464 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-011 + O-012 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-193; added session-193 coverage snapshot (absorbed
  sibling deltas 5448 → 5464: s190 doc-only, s191 +16 HEAVISIDE/DIRAC
  pins, s192 verification-only); wrote `logs/session-193.md`.
  Lock: `utils/@locks/session193-unit-tests.json`.

- Session 189 (2026-04-26) — earlier run.  Unit-tests lane (post-ship
  snapshot refresh — **0 new assertions**; scope cap 1/3 workload;
  snapshot-only run).  Gates at entry: test-all **5448 / 0**,
  test-persist **66 / 0**, sanity **22 / 0** — all green.  D-001
  remains closed.  T-003 remains `[resolved - session 185]`.  Open
  REVIEW.md findings: O-009 + O-011 only, both `[deferred -
  post-ship]`.  Work done: refreshed TESTS.md "Last updated" header
  to session-189; added session-189 coverage snapshot (absorbed
  sibling deltas 5433 → 5448: s186 doc-only, s187 +15 XPON/MANT
  pins, s188 verification-only); wrote `logs/session-189.md`.
  Lock: `utils/@locks/session189-unit-tests.json`.

- Session 185 (2026-04-26) — earlier run.  Unit-tests lane (post-ship
  T-003 re-land — **+24 assertions**, fully green).  See prior index
  entry below.

- Session 181 (2026-04-26) — earlier run.  Unit-tests lane (ship-day
  final snapshot refresh — **0 new assertions**; scope cap 1/3
  workload; snapshot-only run).  Gates at entry: test-all
  **5389 / 0**, test-persist **66 / 0**, sanity **22 / 0** —
  all green.  D-001 remains closed.  Open REVIEW.md findings
  at entry: O-009 + O-011 only, both `[deferred - post-ship]`
  (not touching REVIEW.md this run — session170-code-review lock
  was active on `docs/REVIEW.md` at entry; scope cap also argues
  against filing new findings).  Work done: refreshed TESTS.md
  "Last updated" header from session-173 to session-181; added
  session-181 sibling-deltas prelude (5336→5389 absorbed: +27
  unlogged UI entry, +14 s178 control-flow, +12 s179 test-types;
  documented that s175/s176/s177 claimed test additions but zero
  labels found in files — edits did not persist); updated
  per-file table; wrote `logs/session-181.md`.  Lock:
  `utils/@locks/session181-unit-tests.json`.

- Session 173 (2026-04-26) — earlier run.  Unit-tests lane (ship-day
  wrap-up — Sunday 2026-04-26 afternoon, **ship day**).  **+30
  assertions across 2 substantive clusters** (meets the 2-item
  release-mode floor) — pinning-only run; no source edits, no
  REVIEW.md findings filed:
  - **Cluster 1 (12)** — `test-types.mjs` 917 → 929.  Forward-
    trig SIN/COS/TAN n=0 empty-List + n=1 single-element boundary
    closures on bare-List + Tagged-of-List composition.  Lifts
    session 171 Cluster 1's forward-hyperbolic n=0/n=1 boundary
    pin shape onto the SIN/COS/TAN trio that routes through the
    same 3-deep `_withTaggedUnary(_withListUnary(_withVMUnary(
    handler)))` wrapper composition.  3 ops × 4 cases = bare-
    n=0 + T+L-n=0 + bare-n=1 + T+L-n=1.  n=1 input Real(0) is
    angle-mode-independent (sin(0)=0, cos(0)=1, tan(0)=0 in any
    mode); COS is the n=1 outlier paralleling s171's COSH.
    Closes the gap session 171's "Open queue items" block flagged:
    "Forward-trig family bare-List + T+L axes — only the wrapper-
    V/M composition (s145) and Tagged-of-Vector (s130) pins exist
    on this family; the bare-List + T+L axes are unpinned even on
    n=2."  No source change.
  - **Cluster 2 (18)** — `test-types.mjs` 929 → 947.  Inverse-
    trig ASIN/ACOS/ATAN n=0 empty-List + n=1 single-element
    boundary closures on bare-List + Tagged-of-List composition.
    Lifts the same boundary pattern onto the inverse-trig trio.
    3 ops × 6 asserts (bare-n=0 + T+L-n=0 one assert each + bare-
    n=1 + T+L-n=1 with both shape-and-value asserts because
    ACOS(0) = π/2 RAD is angle-mode-DEPENDENT).  Uses the
    canonical RAD set / try / restore guard (mirror of the
    s140/s142 ASIN/ACOS Tagged-of-V pin pattern at
    `tests/test-types.mjs:5350-5400`).  ACOS is the inverse-trig
    n=1 outlier (acos(0) = π/2; matches Math.PI/2 to 1e-12),
    paralleling Cluster 1's COS outlier and s171's COSH outlier.
    Closes the second gap s171's queue flagged: "Inverse-trig
    family bare-List + T+L axes — same gap as SIN/COS/TAN."
    No source change — wrappers were live since session 145.
  - **REVIEW.md findings.**  No new findings filed.  Open queue
    at run-entry was `O-009` + `O-011` only, both `[deferred -
    post-ship]` per the session-156 meta-log triage; both
    re-verified open at run-exit (no behavior change required;
    ship-blockers neither).  D-001 remains `[resolved - ship-
    prep 2026-04-25]` with persist gate green at 66 / 0.
  - **Off-scope user requests.**  Two user messages arrived
    mid-run, both outside the unit-tests lane charter and both
    requiring UI / documentation edits the lane rules forbid:
    (1) "organize command panel — ensure all commands are properly
    categorized" — routes to `rpl5050-ui-development` for the
    side-panel UI and `rpl5050-command-support` for
    `docs/COMMANDS.md` categorization (per the project memory
    entry `feedback_categorize_commands.md`); (2) "make the tool
    button say 'CST', the panel button 'TOOLS'" — routes to
    `rpl5050-ui-development` (keypad button labels live in
    `www/src/ui/keyboard.js`; HP50 fidelity question per
    `docs/@!MY_NOTES.md` standing-lesson §4 about real-unit
    "TOOL" / "CST" key labels).  No edits made from this lane;
    full routing notes in `logs/session-173.md` "Off-scope user
    requests" section.

- Session 164 (2026-04-25) — earlier run.  Unit-tests lane (release
  wrap-up — last full day before the 2026-04-26 ship).  **+11
  assertions across 2 substantive clusters** (meets the 2-item
  release-mode floor) — pinning-only run; no source edits, no
  REVIEW.md findings filed:
  - **Cluster 1 (8)** — `test-reflection.mjs` 287 → 295.  OBJ→
    session-163 follow-up edges that the s163 pin-set did not
    enumerate.  Tagged-of-BinInt one-layer peel (3 sub-pins:
    depth=2, level-1 = "bn" Str, level-2 = #15h with base
    preserved); Tagged-of-Rational one-layer peel (1 conjunction
    pin closing Tagged composition for the second numeric-scalar
    shape s163 added); ASCII alias `OBJ->` on Rational (closes
    s163's alias-parity coverage which only covered BinInt);
    BinInt at octal base #7o (closes the BIN_BASES quartet —
    s163 covered h/d/b only, missed 'o'); Rational(0/1) zero-
    value boundary (mirror of s163's BinInt #0b zero pin onto
    the Rational arm); Rational(5/1) denominator-1 (pins n/1
    NOT normalised to Integer through the OBJ→ push-back branch
    — distinct from s163's -7/2 negative-numerator pin which
    has d>1).  All exercise the widened branch s163 added at
    `ops.js:6746` plus the existing Tagged peel at `:6690-6696`.
  - **Cluster 2 (3)** — `test-types.mjs` 867 → 870.  LNP1/EXPM
    session-162 follow-up T+L composition edge pins.  LNP1
    boundary-throw under Tagged-of-List `:l:{ Real(-1) }` →
    Infinite result (mirror of s162's bare-List boundary pin
    lifted onto T+L; pins inner handler's RPLError propagates
    through both outer Tagged peel AND the bare-List wrapper's
    apply loop); LNP1 heterogeneous-output mixed-input under
    Tagged-of-List `:n:{ Real(-0.5) Real(0) }` →
    `:n:{ Real(log1p(-0.5)) Real(0) }` (pins per-element
    distinct-value output under Tagged peel — NOT a uniform-
    output short-circuit); EXPM heterogeneous-output mixed-input
    under Tagged-of-List `:e:{ Real(1) Real(0) }` →
    `:e:{ Real(expm1(1)) Real(0) }` (companion pin closing the
    LNP1/EXPM dual pair on the T+L heterogeneous-output axis).
  - No REVIEW.md findings filed — ship-mode coverage closure
    only.  All 11 pins exercise behaviour live since
    session 163 (Cluster 1) / session 130/140/162 (Cluster 2);
    no source change required.

- Session 160 (2026-04-25) — earlier run.  Unit-tests lane.
  **+13 assertions across 3 substantive clusters** (above the
  3-item floor) — distributed across `test-reflection.mjs`,
  `test-types.mjs`, `test-algebra.mjs`:
  - **Cluster 1 (6)** — `test-reflection.mjs` 273 → 279.  OBJ→
    Unit follow-up boundary edges session 159's R-012 pin set
    did not enumerate: zero-value `0_m → 0  1_m`, fractional
    `2.5_m → 2.5  1_m`, higher-power uexpr `3_m^2 → 3  1_m^2`,
    multi-symbol round-trip `5_m/s OBJ→ *`, higher-power
    round-trip `3_m^2 OBJ→ *`.
  - **Cluster 2 (4)** — `test-types.mjs` 848 → 852.
    Transcendental wrapper-LIST n=0 / n=1 boundary pins lifting
    session 156's empty-V/L/P n=0 closure pattern onto the
    session-158 wrapper-LIST composition: `{ } ACOSH → { }`,
    `{ } LN → { }`, `:l:{ } LN → :l:{ }`, `{ Integer(1) } LN
    → { Integer(0) }` (n=1 shoulder).
  - **Cluster 3 (3)** — `test-algebra.mjs` 1058 → 1061.  MODULO
    ARITH follow-up edges: DIV2MOD MODSTO consultation pair
    (m=12 + m=7 baseline/alternate; mirror of s156 DIVMOD pair
    on the two-result sibling), GCDMOD(0, 0) both-zero → Bad
    argument value (closes the s156 gcd-with-one-zero identity
    pair on the mathematically-undefined corner).
  - Final test-all **5133 passing / 0 failing** — fully green
    (entry was 5120 / 0; +13 from this run).  test-persist
    66 / 0 (unchanged).  sanity 22 / 0 (unchanged).
    Log file: `logs/session-160.md`.

- Session 156 (2026-04-25) — earlier run.  Unit-tests lane (release
  wrap-up — penultimate day before the 2026-04-26 ship).  **+23
  assertions across 3 substantive clusters** (above the 3-item
  floor) plus **R-012 filed** (REVIEW.md `Findings — RPL` bucket)
  for OBJ→ Unit divergence from AUR §3-149:
  - **Cluster 1 (7)** — `test-reflection.mjs` 251 → 258.  OBJ→
    session-155 follow-up edges: empty Vector → just `{0}` size-
    list (n=0 boundary closure for AUR Vector row); empty List →
    just Integer(0) count (n=0 boundary closure for AUR List
    row); empty Program → just Integer(0) count (symmetric to
    empty-List; pins unconditional count for round-trip via →PRG);
    Real(-1500) → -1500 (no sign decomposition; closes the
    negative-Real branch session 155 left to symmetry); Tagged-
    of-Tagged composition (3 sub-pins: depth=2 one-layer peel,
    outer "outer" String on level 1, inner :inner:7 Tagged
    preserved on level 2; guards against a recursive-peel
    refactor).  R-008 scope was Real and Tagged branches only.
  - **Cluster 2 (10)** — `test-algebra.mjs` 1048 → 1058.
    Session-149 MODULO ARITH cluster follow-up: DIV2MOD-Vector
    reject (mirror of session-149's DIVMOD-Vector pin — the
    two-result sibling was unpinned); DIVMOD on Complex (level 2)
    + DIVMOD on String (level 2) → Bad argument type (extends
    the s149 Vector pin onto per-arg type-check fall-throughs);
    GCDMOD(15, 0) and GCDMOD(0, 15) mod 13 → Integer(2) (gcd-
    with-zero identity edge of `_extGcdBigInt`); EXPANDMOD(-7)
    mod 12 → Integer(5) centered (negative-input branch of
    `_centerMod`); FACTORMOD m=2 → Integer(1) (smallest prime
    accepted; previously unpinned); FACTORMOD m=99 → Bad
    argument value (largest composite below the >=100 cutoff;
    symmetric to s149's m=101 prime-but-too-large reject);
    DIVMOD MODSTO consultation pair (m=12 baseline 64/13 → 4 +
    m=7 alternate 64/13 → -1; only EXPANDMOD's MODSTO
    sensitivity was pinned by s149).
  - **Cluster 3 (6)** — `test-numerics.mjs` 701 → 707.
    Session-153 C-011 follow-up rejection-arm composition:
    Tagged(Rational(5,1)) on level 2 (Tagged-transparency
    unwraps then C-011 narrow guard fires — composition arm
    s153 left unpinned); Tagged(Rational(2,1)) on level 1
    (PERM symmetric); BinInt COMB / PERM (out of scope per AUR
    §3-29; guards against a session-115-style FLOOR/CEIL/IP/FP
    widening landing on COMB/PERM); Vector COMB (no V/M
    distribution defined; only List × scalar broadcast per
    s065 pin); Rational(-5,1) COMB (negative-int-valued arm;
    type-narrowing fires before the negative-arg value-domain
    check would).
  - **R-012 filed** in REVIEW.md `Findings — RPL` bucket.
    `5_m OBJ→` rejects with `Bad argument type`; AUR §3-149 row
    `x_unit  →  x  1_unit` expects depth-2 `Real(5)` + `1_m`.
    Discovered while pinning the OBJ→ session-156 cluster;
    surfaces a third row of the AUR §3-149 table that R-008's
    audit (Real / Tagged only) did not enumerate.  Owner =
    `rpl5050-rpl-programming` (matches R-008 routing); ship-
    stretch — nice to land if a programming-features run fits
    before close, but not blocking.  No `.skip`'d test added;
    the REVIEW.md finding is the load-bearing record (per
    no-fix-source-bugs lane rule).  Ship-priorities item 5b
    added in REVIEW.md.
  - **Did not touch** `tests/test-types.mjs` (sibling lanes
    140 / 142 / 145 / 150 between them shipped 829 assertions
    there over the last few weeks); `tests/test-control-flow.mjs`
    (session 151 closed it fully green at 775 / 0); `tests/test-
    persist.mjs` (D-001 was partial-fixed by an interactive
    `session-file-explorer` lane during sessions 152's window —
    persist gate is 66 / 0 at session-156 entry).
  - Final test-all **5086 passing / 0 failing** — fully green
    (entry was 5063 / 0; +23 from this run).  test-persist
    66 / 0 (unchanged this run).  sanity 22 / 0 (unchanged).
    Log file: `logs/session-156.md`.

- Session 147 (2026-04-25) — earlier run.  Unit-tests lane.  **+20
  assertions across 3 substantive clusters** (above the 3-item
  floor) — distributed across `test-stack-ops.mjs`,
  `test-stats.mjs`, `test-units.mjs` (no test-types touch this
  run; siblings have been carrying that file):
  - **Cluster 1 (7)** — `test-stack-ops.mjs` 41 → 48.  PICK /
    PICK3 / UNPICK / NDUPN rejection-path closure.  PICK -1 →
    Bad argument value (negative-N branch of wrapper k<1 guard,
    distinct from existing 0 PICK pin); PICK 5 with depth 2 →
    Too few arguments (Stack.pick `n<level` guard — closes the
    PICK depth-overrun branch session 137 left for sibling
    ops); PICK 1.5 → Bad argument value (`!Number.isInteger`
    branch); PICK String → Bad argument type (`toRealOrThrow`
    type-side reject — distinct branch from value-domain
    rejects); PICK3 on depth-2 → Too few arguments (closes
    PICK3 rejection branch — file previously had only the
    (100,200,300) happy-path pin); UNPICK -1 → Bad argument
    value (negative-N branch of `_toPosIntIndex`, distinct
    from session-137 0-UNPICK pin); NDUPN with only count on
    stack → Too few arguments (s.depth<1 guard at ops.js:7255,
    distinct from session-137 NDUPN-negative-N reject earlier
    in `_toNonNegIntCount`).
  - **Cluster 2 (8)** — `test-stats.mjs` 47 → 55.  NSIGMA / NΣ
    + MEAN / VAR / SDEV rejection-path closure + canonical ΣX /
    ΣX² col-0 positive coverage closure.  NSIGMA on Real (1 —
    canonical-name fall-through at ops.js:12177); NΣ on Real
    (1 — symbol-alias delegation reject); NΣ on empty Vector
    (1 — Vector arm of empty reject; existing s064 pin only
    covered the empty-Matrix arm); MEAN/VAR/SDEV on Real (3 —
    bottom-of-fn fallthroughs at ops.js:10260 / 10270 / 10280,
    all three reject branches were unpinned); canonical ΣX on
    XY matrix col-0 → 10 + canonical ΣX² on XY matrix col-0
    → 30 (2 — canonical-name positive coverage; the file
    previously only had the SX / SX2 alias-arm pins from
    session 064 / 132).  Mirror of session 132's alias-positive
    -coverage closure but in the OTHER direction —
    canonical-positive-coverage closure.
  - **Cluster 3 (5)** — `test-units.mjs` 51 → 56.  Mixed-dim
    subtraction reject + different-dim-pair add reject +
    composite-ABS + ^ negative / zero-exponent edge coverage
    closure.  5_m - 1_s → Inconsistent units ('-' subtractive-
    arm reject; existing s064 pin only covers '+' additive
    arm); 1_kg + 1_m → Inconsistent units (different dim pair
    than the existing m-vs-s pin; defense against a refactor
    that special-cased length-vs-time); ABS -1_N → 1_N
    (composite-uexpr ABS keeps the Newton-alias uexpr intact,
    only flips sign — mirror of session-137's NEG -1_N pin on
    the ABS arm); 2_m ^ -1 → 0.5_m^-1 (negative-exponent power
    flips uexpr sign via powerUexpr; existing ^ pin uses
    positive 3); 2_m ^ 0 → Real(1) (zero-exponent collapses
    uexpr to empty → unwraps to dimensionless Real(1);
    previously unpinned edge of the ^ dispatch).
  - **Did not touch `tests/test-types.mjs`** — sibling lanes
    140/142/145 between them shipped 803 assertions there over
    the last few weeks.  No coordination conflict at session-
    147 entry; all sibling locks released gracefully (sessions
    143 / 144 / 145 / 146).  Session 148 (code-review)
    acquired its lock mid-run on `docs/REVIEW.md` only — no
    overlap with this lane's test scope.
  - Final test-all **4903 passing / 0 failing** — fully green
    (entry was 4883 / 0; +20 from this run).  test-persist
    40 / 0 (unchanged this run; session 144's +2 casModulo
    pins absorbed in this snapshot).  sanity 22 / 0
    (unchanged).  Log file: `logs/session-147.md`.

- Session 142 (2026-04-25) — earlier run.  Unit-tests lane.  **+23
  assertions across 3 substantive clusters** (above the 3-item
  floor) — all in `test-types.mjs` (739 → 762):
  - **Cluster 1 (12)** — Inverse-trig + inverse-hyp family
    `_exactUnaryLift` Integer-stay-exact path on bare scalars.
    ASIN/ACOS/ATAN bare-scalar Integer-stay-exact (RAD: 3 +
    DEG-mode integer-clean folds: 3 + RAD ATAN(1) stay-symbolic:
    1 + DEG ASIN(Q(1,2)) → 30 / DEG ASIN(Q(1,3)) → Symbolic Q-arm:
    2) and inverse-hyp ASINH/ACOSH/ATANH integer-clean trio (3).
    Surfaced as a session-140-end candidate; closes the
    inverse-trig + inverse-hyp axis on `_exactUnaryLift` that
    session 140 Cluster 1 only touched on the SINH Tagged-V
    variant.
  - **Cluster 2 (5)** — CONJ / RE / IM / ARG on Tagged-of-Symbolic
    composition.  Pins the 4-op surface × Tagged-of-Sy through
    the 2-deep `_withTaggedUnary(_withListUnary(handler))` wrapper
    on the bespoke V/M-handler family (CONJ outer-Tagged + Sy
    kind-preservation + inner expr shape pin = 2 asserts; RE/IM/
    ARG = 1 each).  Closes the Sy axis on the Tagged-of-X
    composition surface — distinct from session 140 Cluster 3's
    Tagged-of-V/M pins because Tagged-of-Sy exercises the
    `_isSymOperand` lift branch inside the bespoke handler rather
    than the V/M kind branches.
  - **Cluster 3 (6)** — Inner-Tagged-inside-Vector / Matrix
    rejection on bespoke V/M handlers ARG/CONJ/RE/IM.
    `Vector(:x:Complex(3,4)) <op>` rejects with 'Bad argument
    type' on all four ops (4 V-axis pins) plus the M-axis on
    ARG and CONJ (2 M-axis pins).  Mirror of session 140
    Cluster 1's `Vec[:x:Real(0), :y:Real(0)] SINH` rejection but
    on the bespoke V/M-handler family (different wrapper shape:
    2-deep with bespoke V/M dispatch inside vs. session 140's
    3-deep `_withVMUnary` chain).  The bespoke per-element
    handlers (`_argScalar` / `_conjScalar` / `_reScalar` /
    `_imScalar`) are not Tagged-aware — receiving a Tagged scalar
    inside V/M.items the rejection fires.

- Session 137 (2026-04-25) — earlier run.  Unit-tests lane.  **+28
  assertions across 3 substantive clusters** (above the 3-item
  floor):
  - `test-stack-ops.mjs` 32 → 41 (**+9**) — edge-path closure for
    rejection branches the session-064 happy-path block
    deliberately stopped short of: DUPDUP positive (a → a a a),
    plus the `s.depth<n`-after-pop reject branch on
    ROLL/ROLLD/UNPICK/DROPN/DUPN, the ROLLD-0 no-op symmetric
    to the existing 1-ROLL pin, the UNPICK-0 → Bad argument
    value pin (different reject-zero contract from
    ROLL/ROLLD/DROPN/DUPN/NDUPN — UNPICK uses
    `_toPosIntIndex`, the others use `_toNonNegIntCount`),
    and NDUPN -1 → Bad argument value.
  - `test-units.mjs` 39 → 51 (**+12**) — symmetric / composite /
    mixed-dim closure: Unit subtraction (5_m-2_m same-unit +
    1_km-500_m cross-scale, mirrors the existing `+` quartet);
    Real*Unit left-Real reorder (3 * 2_m → 6_m); Unit/Real
    scalar divisor (6_m / 2 → 3_m); Unit/Unit mixed-dim
    composite (6_m / 2_s → 3_m/s exercises
    `multiplyUexpr(_, inverseUexpr(_))`); composite INV
    (2_m/s → 0.5_s/m); composite SQ (3_m/s → 9_m^2/s^2);
    NEG on Newton-shaped Unit; Unit/0 → Infinite result
    (zero-divisor check on the Unit/Real branch).
  - `test-stats.mjs` 40 → 47 (**+7**) — ASCII-alias REJECTION
    coverage closure (symmetric to session-132's alias
    POSITIVE coverage closure): SX on Real → Bad arg type,
    SY2 on 1-col Matrix → Invalid dimension, SXY on Real
    → Bad arg type, MAXS on Real → Bad arg type, MAXS on
    empty Vector → Bad arg value, MINS on Real → Bad arg
    type, MINS on empty Matrix → Bad arg value.  Each new
    pin guards against an alias-special-case refactor that
    accidentally bypasses the canonical guard set.
  - **Did not touch `tests/test-control-flow.mjs`** — session 136
    closed it fully green at 599 / 0 (entry baseline for this
    run).  No coordination conflict at session-137 entry; all
    sibling locks released cleanly (sessions 133 / 134 / 135 / 136).
  - Final test-all **4586 passing / 0 failing** — fully green
    (entry was 4558 / 0; +28 from this run).  test-persist 38 / 0
    (unchanged).  sanity 22 / 0 (unchanged).  Log file:
    `logs/session-137.md`.

- Session 132 (2026-04-24) — Unit-tests lane.  **+17
  assertions across 3 substantive clusters + 1 doc-finding close**
  (above the 3-item floor):
  - **T-002 close** (REVIEW.md doc-finding).  Re-phrased the four
    `docs/TESTS.md` sites that misclaimed session 121 was
    stale-pruned without writing a log file — `logs/session-121.md`
    in fact exists (mtime 2026-04-25 01:04:30, written within the
    lock window).  Pure-doc edit, no behavior risk.
  - `test-stats.mjs` 31 → 40 (**+9**) — ASCII-alias positive-coverage
    closure + MAXΣ multi-column positive case.  6 alias pins for
    SX2 / SY / MINS (5 of 7 had alias-routed coverage prior to
    this run; SX2 / SY / MINS each missing a `lookup(<alias>)`
    exercise — verified by `grep -rn "lookup\\('SX2\\|lookup\\('SY'\\|lookup\\('MINS\\)"
    tests/` returning zero matches at session-132 entry).  3 MAXΣ
    multi-column pins mirroring session 127's MINΣ 3-col pin: 3-col
    positive (per-column maxes [3, 8, 4] all-distinct) plus an
    all-negative-Vector edge (least-negative entry returned, guards
    against an accidental Math.abs-then-max refactor).
  - `test-comparisons.mjs` 103 → 111 (**+8**) — Z × Q reverse-
    direction cluster extending session 107's Rational block.  The
    session-107 block pinned Q-on-level-2 / Z-on-level-1 for == and
    one ordering pin per direction; reverse direction (Z-on-level-2)
    for == / <> / SAME, the missing ≤ at the cross-type equal
    boundary, and the Z × Q sign-crossing < direction were not
    pinned.  Adds: Z == Q (equal + unequal), Z <> Q + Q <> Z, Z SAME
    Q (equal + unequal), Integer(-1) < Rational(1/2) sign-crossing,
    Rational(2/1) ≤ Integer(2) at the equal-value cross boundary.
  - **Did not touch `tests/test-control-flow.mjs`** — session 131
    closed the file fully green at 563 / 0 (entry baseline for this
    run).  No coordination conflict at session-132 entry; all sibling
    locks released cleanly (sessions 128 / 129 / 130 / 131).
  - Final test-all **4491 passing / 0 failing** — fully green
    (entry was 4474 / 0; +17 from this run).  test-persist 38 / 0
    (unchanged).  sanity 22 / 0 (unchanged).  Log file:
    `logs/session-132.md`.

- Session 127 (2026-04-24).  Unit-tests lane.  **+28
  assertions across 3 substantive clusters** (well above the 3-item
  floor):
  - `test-algebra.mjs` 963 → 972 (**+9**) — LNAME edge cluster
    extending session 124's worked-example block: String / Name /
    Complex rejection (3), unquoted-Name return-shape pin,
    `5+SIN(2)` constant-via-binop empty-Vector pin, `COS(MYFUNC(X))`
    length-DESC ordering with cross-check that COS itself is
    dropped (3).
  - `test-comparisons.mjs` 95 → 103 (**+8**) — Q × C / Q × R
    cross-type cluster extending session 107's Rational block:
    `Q < C` → Bad argument type (Complex partial-order rejection
    holds for Q), Q ==/<>/SAME against Complex (4 pins covering
    non-zero im 0/1/0 + im=0 value-equal 1), `Q(1/3) == R(0.333)`
    → 0 unequal-branch pin (companion to session-107's equal-value
    pin), `Q × R` ordering both directions (2).
  - `test-stats.mjs` 20 → 31 (**+11**) — Y-family + MAXΣ/MINΣ
    rejection-path catchup: ΣY2 1-col → Invalid dimension, ΣXY
    × 3 reject branches (Real / 1-col / empty Matrix), ΣX2 Real
    reject (symmetric to ΣX), MAXΣ × 3 reject branches (Real /
    empty Vector / empty Matrix), MINΣ 3-col Matrix positive case
    (all-distinct per-column mins), SXY ASCII-alias end-to-end pin.
  - **Did not touch `tests/test-control-flow.mjs`** — session 126
    (rpl-programming) is active at session-127 entry+exit and holds
    the lock on that file + `www/src/rpl/ops.js` + `docs/RPL.md`.
    Their in-progress HALT/PROMPT-lift-through-SEQ+MAP work has 4
    pre-pinned assertions failing at this run's exit; flake-scan ×
    3 confirms the failures are stable (consistent, not flaky) so
    they're a session-126 work-state, not a regression.  This lane
    deliberately skipped any work that would race against their
    lock.
  - Final test-all **4330 passing / 4 failing** (the 4 failing all
    in session-126's locked file); excluding that file the rest of
    the suite is **3839 passing / 0 failing**.  test-persist 38 / 0
    (unchanged).  sanity 22 / 0 (5 ms, unchanged).  Log file:
    `logs/session-127.md`.

- Session 122 (2026-04-24).  Unit-tests lane.  Closed
  queue item #2 from session 117 — the `assertThrows` migration in
  `test-control-flow.mjs`.  **+4 regression guards** added at the
  5 `let threw` sites (4 migrated; the 5th is the negated DOERR-0
  no-op form, deliberately left): `:432` (START 1/0 →
  `/Infinite result/` shape pin), `:660` (IFERR-without-THEN →
  stack-rollback `s.depth === 1 && isProgram(s.peek())`), `:825`
  (FOR/STEP-of-0 → exact-message `=== 'STEP of 0'`), `:2098`
  (no-END IFERR → stack-rollback companion).  Final test-all
  **4232 / 0** (entry 4182; +4 from session 122 + 46 from a
  concurrent session-121 PROMPT/KILL cluster that landed in
  `tests/test-control-flow.mjs` while this lock was held — see
  the top-of-file delta note).  test-persist 38 / 0 (unchanged).
  sanity 22 / 0 (unchanged).  Log file: `logs/session-122.md`.
  Note: session 121 (rpl-programming) acquired its lock with the
  `heartbeatAt === startedAt` signature that resembles a stale-
  prune at the lock layer; the original session-122 narrative
  read this as "no log was written" because the directory listing
  taken at session-122 entry did not yet show
  `logs/session-121.md`.  Subsequent inspection (per REVIEW.md
  T-002 close, session 132) confirms `logs/session-121.md` was
  in fact written within the lock window (mtime 2026-04-25
  01:04:30, two seconds before the lock body's `releasedAt` of
  01:04:43 — the natural "write log, then unlink lock" ordering),
  so the missing-log signal does not apply.  Session 121 did
  write to `tests/test-control-flow.mjs` after my acquire — that
  is a separate lock-protocol observation, retained for the
  code-review ledger; the line ranges did not collide
  (s121 `:3656-3929`, s122 `:432`/`:660`/`:825`/`:2098`).
- Session 117 (2026-04-24) — Unit-tests lane.  Closed
  queue items #3 and #4 from session 112.  **+2 regression
  guards** in `test-types.mjs` at the `:2068`/`:2074` TRUNC
  sites (migrated to `assertThrows(/TRUNC expects 2 argument/)`
  + new `/got 1\b/` / `/got 3\b/` guards pinning the actual-
  arg-count tail of the error message — previously uncovered).
  **+4 regression guards** in `test-persist.mjs` at the :118
  unknown-version site (added local `assertThrows` helper,
  migrated to pattern-matching + 3 new adjacent reject-branch
  guards: echo-bad-version, missing-version, `null`/`string`
  snap → "not an object").  **P-001 remainder cleared for
  `docs/TESTS.md`**: fixed two stale `src/…` → `www/src/…`
  references at lines 233 / 355.  **O-009 deferred** — `rm`
  of the two `tests/test-control-flow.mjs.bak{,2}` files blocked
  in unsupervised mode (`Operation not permitted`; permission
  tool requires user-present approval).  Final test-all
  **4089 / 0**; test-persist 38 / 0 (+4 from 34); sanity 22 / 0.
  Log file: `logs/session-117.md`.
- Session 112 (2026-04-24) — this run.  Unit-tests lane.  Closed
  queue item #6 from session 107 — the `assertThrows` migration in
  smaller files.  **+52 inline `try/catch/threw` sites migrated**
  across 10 files: `test-variables.mjs` (13), `test-lists.mjs` (15),
  `test-binary-int.mjs` (12), `test-eval.mjs` (2), `test-ui.mjs` (2),
  `test-stats.mjs` (2), `test-entry.mjs` (1), plus leftover sites
  in `test-algebra.mjs` (3), `test-numerics.mjs` (1).
  Behaviour-preserving except for **+1 new regression guard** in
  `test-numerics.mjs` at :2118 — split the LOG(-10)-CMPLX-OFF
  one-assertion-two-checks site into `assertThrows(…, /Bad argument
  value/)` + a follow-up `assert(err.name !== 'TypeError', …)`.
  Confirmed HALT/CONT flake non-reproduction: `flake-scan 5` →
  3919 stable-ok, 0 flakes; cumulative clean-run count for the
  filing now 30+ runs plus 24 bisect shuffles.  Final suite
  **3981 / 0**; persist 34 / 0; sanity 22 / 0.  Log file:
  `logs/session-112.md`.
- Session 107 (2026-04-24).  Unit-tests lane.  Cleared
  queue item #2 (the `test-algebra.mjs` migration) — all **53 inline
  `try/catch/threw` sites migrated to `assertThrows()`**,
  behaviour-preserving (891 pre/post); Python migration script
  saved at `outputs/migrate.py`.  Added **+15 Rational (Q)
  assertions to `test-comparisons.mjs`** (80 → 95) — the promotion-
  lattice peer had zero prior coverage in this file despite being
  first-class since s092: Q×Q canonicalisation, Q×Z / Q×R cross-
  type equality, sign-crossing ordering, ≠/<>, SAME pinned non-
  strict as regression guard opposing BinInt SAME-is-strict-type.
  Migrated **3 inline `try/catch/threw` sites** in `test-types.mjs`
  at the three `let threw = null` rejection sites
  (STO / STO / CRDIR Invalid-name), behaviour-preserving; the two
  TRUNC sites interpolating `${threw?.message}` deliberately left.
  Confirmed `test-numerics.mjs` migration (queue #1) already
  cleared pre-s107 (~146 `assertThrows` calls present, zero
  inline remaining).  Final suite **3886 / 0**; persist 34 / 0;
  sanity 22 / 0.  Log file: `logs/session-107.md`.
- Session 084 (2026-04-23) — unit-tests lane.  Migrated
  **all 104 inline `assertThrows`-pattern sites in
  `tests/test-matrix.mjs`** to the `assertThrows()` helper —
  behaviour-preserving (347 passes before/after); queue item #1 from
  s075 fully cleared for this file.  Appended the 8-assertion
  `session084: KNOWN GAP — …` block to `tests/test-types.mjs`
  filing `==`/`SAME` on Program/Directory against the data-types
  lane (5 soft-asserts ready-to-flip + 3 hard regression guards;
  queue item #4 from s075).  Shipped `scripts/pre-commit.sh` —
  default = sanity smoke (~5 ms), `--full` adds the test-all suite,
  `--persist` adds the persist suite (queue item #5 from s075,
  rolled forward since s070).  Confirmed HALT/CONT flake non-
  reproduction: 10 flake-scan runs (3808 stable-ok) + 24 flake-bisect
  shuffle×trial invocations all `ok`; cumulative count 25+ — lodged
  recommendation with rpl-programming lane to close the filing.
  Final suite **3872 passing / 0 failing**; persist 34 / 0; sanity
  22 / 0 (5 ms).  Log file: `logs/session-084.md` (sessions 081
  command-support, 082 data-types, 083 rpl-programming claimed
  earlier today; 085 is a code-review lane that opened mid-run).
- Session 075 (2026-04-23) — unit-tests lane.  Shipped
  `tests/flake-bisect.mjs` + `tests/run-order.mjs` (test-ordering
  bisection harness; queue item #2 from s074).  Appended the 13-
  assertion DATA_TYPES ✗ rejection-sweep block to
  `tests/test-numerics.mjs` (queue item #3).  Migrated 12 inline
  `assertThrows`-pattern sites in 4 files (test-entry, test-units,
  test-comparisons, test-stats).  Flake-scan 5/5 clean; session-074
  HALT/CONT flake did not recur.  Final suite 3745 / 0; persist 34
  / 0; sanity 22 / 0 (5 ms).  Log file: `logs/session-079.md`.
- Session 074 (2026-04-23) — unit-tests lane.  Added per-file headline counts
  + resilient module-load handling to `test-all.mjs`; shipped
  `tests/flake-scan.mjs` (non-determinism detector, standalone);
  appended the 14-assertion BinInt == / SAME / comparator audit block
  to `test-binary-int.mjs` as KNOWN GAPs against `rpl5050-data-type-support`.
  Caught an intermittent HALT/CONT flake on the baseline run — did not
  reproduce across 8 subsequent runs under the new flake-scan
  harness; filed against `rpl5050-rpl-programming`.  Final suite
  3630 / 0; persist 32 / 0; sanity 22 / 0.  Log file:
  `logs/session-075.md` (the calendar-day session-074 log-file slot
  was already claimed by the rpl-programming lane's HALT/CONT/KILL
  pilot + CASE auto-close — per the session-066 convention this
  lane's log lands at the next free number; in-file assertion labels
  stay `session074:` to match the cohort).
- Session 070 (2026-04-23) — unit-tests lane.  Added
  `tests/sanity.mjs` (22), `tests/test-helpers.mjs` (43).  Grew
  `test-comparisons.mjs` (+29) and `test-types.mjs` (+65).  Lifted
  `assertThrows`, `rplEqual`, `runOp`, `runOpStack` into
  `tests/helpers.mjs`.  Fixed cross-lane import race in
  `tests/test-reflection.mjs`.  Final suite 3465 / 0; persist 32 / 0;
  sanity 22 / 0 (5 ms).  See `logs/session-070.md`.
- Session 066 (2026-04-23) — bootstrap of this file; added
  `test-stack-ops.mjs` (32), `test-stats.mjs` (20),
  `test-arrow-aliases.mjs` (19). Final suite 3192 passing / 0 failing;
  persist still green at 32.  See `logs/session-066.md`.
  (Sessions 062–065 are owned by sibling lanes — type-support for
  062–064, command-support for 065. This lane reclaims 066 as its
  bootstrap number. Session 067 is rpl-programming lane.)
