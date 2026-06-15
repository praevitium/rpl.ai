# DATA_TYPES — RPL5050 argument-type coverage matrix

**Scope.** This file tracks the per-op argument-type surface the `rpl5050-data-type-support`
lane is widening.  It does not track whether an op is implemented at all — that
lives in `docs/COMMANDS.md`.
This file answers: *for this op, which types does the handler actually accept?*

**Last updated.** Session 269 (2026-06-15, S-column add — combinatorial / integer-divmod family;
lane name **`session269-data-type-support`**) — doc-only matrix update + 5 new rejection pins (5737 → 5742):
added the **S (String) column** to the combinatorial-family table (COMB/PERM/IQUOT/IREMAINDER/XROOT),
which previously had R/Z/Q/C/N/Sy/L/V/M/T only.  All five reject String: COMB/PERM via `_combPermArgs`
(`!isInteger && !isReal → throw`); IQUOT/IREMAINDER via `_intQuotientArg` (isInteger/isReal only);
XROOT degree-x via `toRealOrThrow` → "expected real, got string".  Continues session 267's S-column
work on CONJ/RE/IM.  No source changes (ops.js not modified — rejections were already correct, just untested).
Next: extend the S column onto the stat-dist + special-function family tables (probe-confirmed all reject String).

**Last updated (prior — session 268).** Session 268 (2026-06-14, C-column rejection-pin pass — GAMMA/LNGAMMA/HEAVISIDE;
lane name **`session268-data-type-support`**) — doc-only matrix update + 3 new rejection pins (5674 → 5677):
3 matrix cells documented `✗` in the special-function family table that carried no pin —
GAMMA / LNGAMMA C=✗ (`_gammaScalar`/`_lngammaScalar` use `isInteger?…:isReal?…:null`; Complex → null → throw)
and HEAVISIDE C=✗ (scalar arm isReal/isInteger/isBinaryInteger/isSym only; Complex falls through).
Completes the three stat-dist family ops session 267 skipped when it pinned the other seven.
No source changes (ops.js not modified — all rejections were already correct, just untested).

**Last updated (prior — session 267).** Session 267 (2026-04-26, C/S/V/M column rejection-pin pass;
lane name **`session267-data-type-support`**) — doc-only matrix update + 26 new rejection pins (5640 → 5666):
26 matrix cells flipped `·`→`✗` across three table groups:
(1) C column — Real-decomp family: ZETA / LAMBERT / PSI (3 cells; scalar handlers use `isInteger/isReal` only — Complex → `null` → `Bad argument type`);
(2) C column — Stat-dist family: DIRAC / ERF / ERFC / BETA / UTPC / UTPF / UTPT (7 cells; DIRAC handler has `isBinaryInteger` but no `isComplex` branch; ERF/ERFC/BETA/UTPC/UTPF/UTPT use `isInteger/isReal` guards or `asReal` helper — all reject Complex);
(3) C column — Combinatorial family: COMB / PERM / IQUOT / IREMAINDER (C=✗; `_combPermArgs`/`_intQuotientArg` guards reject Complex) and XROOT (C=✗; degree x uses `toRealOrThrow` which explicitly rejects Complex with "expected real, got complex");
(4) S column — Reference rows: CONJ / RE / IM (3 cells; `_conjScalar`/`_reScalar`/`_imScalar` dispatch has no `isString` branch);
(5) V/M columns — Combinatorial family: COMB / PERM / IQUOT / IREMAINDER V=✗ and M=✗ (8 cells; same `_combPermArgs`/`_intQuotientArg` guards reject Vector/Matrix — no `_withVMBinary` wrapper on any of these ops).
No source changes (ops.js not modified — all rejections were already correct, just untested).

**Last updated (prior — session 263).** Session 263 (2026-04-26, Unit U-column rejection-pin pass;
lane name **`session263-data-type-support`**) — doc-only matrix update + 19 new rejection pins (5621 → 5640):
18 matrix rows flipped U `·`→`✗` across the unary numeric-math surface (SQRT/SIN..ATANH(group)/FACT/LN..ALOG(group)/LNP1/EXPM/SIGN/ARG/CONJ/RE/IM)
and the binary scalar surface (MOD/MIN/MAX/GCD/LCM/%/%T/%CH).  All handlers use `toRealOrThrow` or explicit `isReal/isInteger/isRational/isComplex`
guards — none accept Unit.  Unit is accepted by INV/SQ/ABS and the arithmetic surface (add/sub/mul/div Unit fast paths), but NOT by
general numeric-math ops.  No source changes (ops.js not modified — the rejection was already correct, just untested).

**Last updated (prior — session 258).** Session 258 (2026-04-26, BinaryInteger B-column rejection-pin pass;
lane name **`session258-data-type-support`**) — doc-only matrix update + 22 new rejection pins (5599 → 5621):
21 matrix rows flipped B `·`→`✗` across the unary numeric-math surface (INV/SQ/SQRT/ABS/SIN..ATANH(group)/FACT/LN..ALOG(group)/LNP1/EXPM/SIGN/ARG/CONJ/RE/IM)
and the binary scalar surface (MOD/MIN/MAX/GCD/LCM/%/%T/%CH).  All handlers require `isReal/isInteger/isRational/isComplex` or
`toRealOrThrow` — none accept BinaryInteger.  BinaryInteger is accepted by the arithmetic surface (add/sub/mul/div BinInt fast path)
and by the rounding family (FLOOR/CEIL/IP/FP — B=✓, pinned session 087), but NOT by general numeric-math ops.
No source changes (ops.js not modified — the rejection was already correct, just untested).

**Last updated (prior — session 253).** Session 253 (2026-04-26, ordered-comparator L/V/M/T/U rejection pins;
lane name **`session253-data-type-support`**) — doc-only matrix update + 20 new rejection pins (5571 → 5591):
`<` / `>` / `≤` / `≥` L/V/M/T/U all `·`→`✗` — `comparePair()` is scalar-only; `isNumber` (Real/Integer/Rational/Complex)
is the accepted numeric type beyond BinInt-coerce and String-lex; List/Vector/Matrix/Tagged/Unit all throw `Bad argument type`.
No source changes (ops.js not modified — the rejection was already the correct behavior, just untested).
Verification gates at exit: `node tests/test-all.mjs` 5591/0, `node tests/test-persist.mjs` passed,
`node tests/sanity.mjs` 22/0. See "Resolved this session (253)" below.

**Last updated (prior — session 248).** Session 248 (2026-04-26, UTPC/UTPT List+Tagged widening;
lane name **`session248-data-type-support`**) — two source changes + 8 net new assertions (5560 → 5568):
UTPC L `✗`→`✓` / T `·`→`✓` (extracted `_utpcScalar`, wrapped with `_withTaggedBinary(_withListBinary(…))`);
UTPT L `✗`→`✓` / T `·`→`✓` (extracted `_utptScalar`, same wrapper shape);
V `·`→`✗` / M `·`→`✗` for both (no `_withVMBinary`; mirrors BETA policy);
UTPF stays bare (3-arg; no `_withListBinary` shape).
+10 new acceptance pins − 2 removed session-244 List rejection pins = +8 net.
Verification gates at exit: `node tests/test-all.mjs` 5568/0/0, `node tests/test-persist.mjs` passed,
`node tests/sanity.mjs` 22/0. See "Resolved this session (248)" below.

**Last updated (prior — session 244).** Session 244 (2026-04-26, Z-cell doc-lag audit ERF/ERFC/UTPC/UTPF/UTPT + BETA L/V/M + UTPC/UTPF/UTPT L/V/M;
lane name **`session244-data-type-support`**) — sixteen cells resolved across stat-dist family:
ERF/ERFC Z `·`→`✓` (documentation lag — `_erfScalar`/`_erfcScalar` have `isInteger` branch);
UTPC/UTPF/UTPT Z `·`→`✓` (documentation lag — shared `asReal` helper accepts Integer);
BETA L `·`→`✓` (`_withListBinary` wrapper distributes element-wise), V `·`→`✗` / M `·`→`✗` (no `_withVMBinary`);
UTPC/UTPF/UTPT L `·`→`✗` / V `·`→`✗` / M `·`→`✗` (bare handlers; List/Vector reach `asReal` → Bad argument type).
+19 hard assertions in `tests/test-types.mjs` (5541 → 5560). Verification gates at exit:
`node tests/test-all.mjs` 5560/0/0, `node tests/test-persist.mjs` passed,
`node tests/sanity.mjs` 22/0. See "Resolved this session (244)" below.

**Last updated (prior — session 240).** Session 240 (2026-04-26, Q-cell audit stat-dist + combinatorial families;
lane name **`session240-data-type-support`**) — sixteen Q `·` cells resolved across stat-dist
(GAMMA/LNGAMMA/ERF/ERFC/BETA/UTPC/UTPF/UTPT/HEAVISIDE/DIRAC: all `·`→`✗`; scalar handlers use
`isInteger/isReal → null → throw` pattern with no `isRational` branch) and combinatorial
(COMB/PERM/IQUOT/IREMAINDER: `·`→`✗` via `_combPermArgs` / `_intQuotientArg` guards; XROOT:
`·`→`✓` — degree x uses `toRealOrThrow` which accepts Rational; radicand y goes through `^`
which accepts Rational; both sides Q→R degradation to Real). +16 hard assertions in
`tests/test-types.mjs` (5525 → 5541). Verification gates at exit:
`node tests/test-all.mjs` 5541/0/0, `node tests/test-persist.mjs` passed,
`node tests/sanity.mjs` 22/0. See "Resolved this session (240)" below.

**Last updated (prior — session 236).** Session 236 (2026-04-26, Q-cell audit LNP1/EXPM/TRUNC/ZETA/LAMBERT/PSI;
lane name **`session236-data-type-support`**) — six Q `·` cells resolved: LNP1/EXPM `·`→`✓`
(inner `toRealOrThrow` handles Rational; Q→R degradation); TRUNC/ZETA/LAMBERT/PSI `·`→`✗`
(`_roundingOp` / `isInteger+isReal`-only guards reject Rational). +6 hard assertions in
`tests/test-types.mjs` (5519 → 5525). Verification gates at exit:
`node tests/test-all.mjs` 5525/0/0, `node tests/test-persist.mjs` passed,
`node tests/sanity.mjs` 22/0. See "Resolved this session (236)" below.

**Last updated (prior — session 231).** Session 231 (2026-04-26, CONJ/RE/IM Rational widening + Q-cell audit ARG/%/GCD/LCM;
lane name **`session231-data-type-support`**) — two work items:
(1) `_conjScalar` / `_reScalar` / `_imScalar` widened to accept Rational (add `isRational(v)`
branch; CONJ/RE return v unchanged, IM returns Integer(0n)); CONJ/RE/IM Q cells flipped ✗→✓.
(2) Q-cell audit: ARG (Q=✗, `_argScalar` no isRational branch), % / %T / %CH (Q=✓,
`toRealOrThrow` handles Rational, Q→R degradation), GCD / LCM (Q=✗, `_toBigIntOrThrow` no
isRational branch, integer-domain by design).  +8 net assertions in `tests/test-types.mjs`
(5511 → 5519): 4 CONJ/RE/IM acceptance pins replacing session-226 rejection pins (+1 net),
+7 Q-audit pins for ARG×2/% ×1/%T×1/%CH×1/GCD×1/LCM×1.
Verification gates at exit: `node tests/test-all.mjs` 5519/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (231)" below.

**Last updated (prior — session 226).** Session 226 (2026-04-26, Q column added to all coverage-matrix tables;
lane name **`session226-data-type-support`**) — Q column inserted between Z and B/C in
every per-op table.  Values derived from already-pinned tests: ✓ where a test assertion
verifies Rational acceptance (sessions 110/115/120/125/130/135/145/150); ✗ where a test
assertion verifies rejection (FACT, XPON, MANT from session 120; CONJ/RE/IM new session
226 rejection guards); `·` where Q behavior has not yet been tested.  +3 hard assertions
in `tests/test-types.mjs` (5508 → 5511): `CONJ Rational(1,2)` → Bad argument type;
`RE Rational(1,2)` → Bad argument type; `IM Rational(1,2)` → Bad argument type
(`_conjScalar` / `_reScalar` / `_imScalar` have no `isRational` branch — Rational falls
through to the final `throw new RPLError('Bad argument type')`).
Verification gates at exit: `node tests/test-all.mjs` 5511/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (226)" below.

**Last updated (prior — session 221).** Session 221 (2026-04-26, per-op pull-apart for `+`/`-`/`*`/`/`/`^`;
lane name **`session221-data-type-support`**) — doc-only, no source changes.
The compact "Reference rows" table was split: the five binary arithmetic ops (`+`/`-`/
`*`/`/`/`^`) were promoted to a new named per-op section with expanded Notes (BinInt
masking contract, Unit dim-algebra contract, Tagged binary tag-drop contract, Rational
exact-path per op); the four unary ops (NEG/CONJ/RE/IM) were retained in a renamed
"Reference rows" table.  No test count change (doc-only; existing pins unchanged).
Verification gates at exit: `node tests/test-all.mjs` 5508/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (221)" below.

**Last updated (prior — session 216).** Session 216 (2026-04-26, post-ship PSI L/V/M
stale-`·`-cell promotion; lane name **`session216-data-type-support`**) — no source
changes.  The 1-arg digamma handler dispatches bespoke List/Vector/Matrix branches
identically to the GAMMA/LNGAMMA shape; the Z and T cells were already ✓.
Note: T+L/T+V/T+M is NOT supported (bespoke `isTagged` branch calls `_psiScalar`
directly on `v.value`, throwing for non-scalar inner values).
+5 hard assertions in `tests/test-types.mjs` (5503 → 5508): PSI ×5 (L-empty/L-value/
L-heterogeneous/V/M), anchored on ψ(1)=−γ and ψ(2)=1−γ (tolerance 1e-12).
PSI matrix row: L/V/M `·`→`✓`.
Verification gates at exit: `node tests/test-all.mjs` 5508/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (216)" below.

**Last updated (prior — session 212).** Session 212 (2026-04-26, post-ship ZETA/LAMBERT Z/L/V/M
stale-`·`-cell promotion; lane name **`session212-data-type-support`**) — no source
changes.  Both ops are registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`
and their scalar functions accept `isInteger(v)` — the Z column was also stale.
+10 hard assertions in `tests/test-types.mjs` (5493 → 5503): ZETA ×5 (Z/L-empty/L-value/V/M)
and LAMBERT ×5 (Z/L-empty/L-value/V/M), anchored on ζ(0)=-1/2 and W(0)=0 exact values.
ZETA matrix row: Z/L/V/M `·`→`✓`.  LAMBERT matrix row: Z/L/V/M `·`→`✓`.
Verification gates at exit: `node tests/test-all.mjs` 5503/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (212)" below.

**Last updated (prior — session 208).** Session 208 (2026-04-26, post-ship erf M stale-`·`-cell
promotion; lane name **`session208-data-type-support`**) — no source changes; erf
is registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))` — the M branch
`rows.map(r => r.map(_erfScalar))` has been in place since the op was first wrapped.
Session 200's partial pass added L and V pins but left M as `·`.  +1 hard assertion in
`tests/test-types.mjs` (5492 → 5493): Matrix `[[Integer(0)]]`→`[[Real(0)]]`
(erf(0)=0 zero special-case).  ERF matrix row: M `·`→`✓`.
Verification gates at exit: `node tests/test-all.mjs` 5493/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (208)" below.

**Last updated (prior — session 204).** Session 204 (2026-04-26, post-ship erfc L/V/M/T+L stale-`·`-cell
promotion; lane name **`session204-data-type-support`**) — no source changes; erfc
was already wrapped in `_withTaggedUnary(_withListUnary(bespoke-V/M handler))` identical
to erf, but the DATA_TYPES.md matrix carried `·` for its L/V/M cells as a documentation
lag from session 200's partial pass (session 200 pinned T scalar only).  +7 hard assertions
in `tests/test-types.mjs` (5485 → 5492): bare-List n=0 passthrough; T+L n=0; bare-List n=1
value-precise (erfc(0)=1); T+L n=1; bare-List n=2 heterogeneous-output (erfc(0)=1,
erfc(1)≈0.1573); Vector (erfc(0)=1); Matrix (erfc(0)=1).  ERFC matrix row: L/V/M `·`→`✓`.
Verification gates at exit: `node tests/test-all.mjs` 5492/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (204)" below.

**Last updated (prior — session 200).** Session 200 (2026-04-26, post-ship GAMMA/LNGAMMA/erf/erfc L/V/M
stale-`·`-cell promotion; lane name **`session200-data-type-support`**) — no source
changes; these ops were already wrapped in `_withTaggedUnary(_withListUnary(bespoke-V/M
handler))` — the DATA_TYPES.md matrix carried `·` (not-applicable) for their L/V/M
cells as a documentation lag.  +13 hard assertions in `tests/test-types.mjs`
(5472 → 5485): GAMMA ×6 (n=0 bare-List; n=0 T+L; n=2 bare-List integer-exact; n=2
T+L; V integer-exact; M integer-exact); LNGAMMA ×4 (n=0 bare-List; M lngamma(2)=0;
T scalar; V); erf ×2 (bare-List erf(0)=0; V); erfc ×1 (T scalar erfc(0)=1).
GAMMA/LNGAMMA matrix rows: L/V/M `·`→`✓`.  ERF row: L/V `·`→`✓`; M stays `·`
(handler branch present but no assertion this session).  ERFC row: T re-verified;
L/V/M stay `·`.
Verification gates at exit: `node tests/test-all.mjs` 5485/0/0,
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (200)" below.

**Last updated (prior — session 196).** Session 196 (2026-04-26, post-ship TRUNC L/T wrapper-add;
lane name **`session196-data-type-support`**) — wrapping TRUNC in
`_withTaggedBinary(_withListBinary(_truncOp()))` to close the last remaining
ship-prep 2026-04-25 audit candidate (XPON/MANT closed session 187, HEAVISIDE/DIRAC
closed session 191; TRUNC was the sole survivor).  +8 hard assertions in
`tests/test-types.mjs` (5464 → 5472): n=0 bare-List passthrough; n=0 Tagged-of-List
(binary tag drop); n=1 bare-List value-precise; n=2 bare-List heterogeneous; n=2
Tagged-of-List tag-dropped; scalar Tagged tag-dropped; pairwise L×L; Vector
rejection guard.  V/M remain ✗ — no `_withVMBinary`; mirrors MOD/MIN/MAX policy.
TRUNC matrix row: L/T promoted from blank to ✓; V/M promoted from blank to ✗.
Verification gates at exit: `node tests/test-all.mjs` 5472/0/0,
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (196)" below.

**Last updated (prior — session 191).** Session 191 (2026-04-26, post-ship HEAVISIDE+DIRAC L/V/M/T wrapper-add;
lane name **`session191-data-type-support`**) — wrapping HEAVISIDE and DIRAC in
`_withTaggedUnary(_withListUnary(_withVMUnary(…)))` (same 3-deep composition as XPON/MANT,
session 187).  +16 hard assertions in `tests/test-types.mjs` (5448 → 5464): Cluster 1
(HEAVISIDE, +8) covers n=0 empty-List bare + T+L, n=1 bare value-precise, n=2
heterogeneous bare + T+L, Vector, Matrix, scalar Tagged; Cluster 2 (DIRAC, +8) mirrors the
same axes — n=1 bare uses DIRAC(Real(0)) to pin the at-zero → Symbolic path through the
wrapper.  Two stale session-061 "rejects" assertions in `tests/test-algebra.mjs` updated
to reflect the new accepted-List behavior; `isList` import added.  HEAVISIDE/DIRAC rows in
the matrix updated: L/V/M/T cells promoted from blank (candidate) to ✓.
Verification gates at exit: `node tests/test-all.mjs` 5464/0/0,
`node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.
See "Resolved this session (191)" below.

**Last updated (prior — session 187).** Session 187 (2026-04-26, post-ship XPON+MANT L/V/M/T wrapper-add;
lane name **`session187-data-type-support`**) — wrapping XPON and MANT in
`_withTaggedUnary(_withListUnary(_withVMUnary(…)))` (same 3-deep composition as
FACT/LNP1/EXPM) to close the ship-prep 2026-04-25 audit finding that both ops were
bare handlers throwing `Bad argument type` on List/Vector/Matrix/Tagged.  +15 hard
assertions in `tests/test-types.mjs` (5433 → 5448): Cluster 1 (XPON, +8) covers n=0
empty-List bare + T+L, n=1 bare List, n=2 heterogeneous bare List + T+L, Vector,
Matrix, and scalar Tagged path; Cluster 2 (MANT, +7) mirrors the same axes minus the
scalar-Tagged pin (subsumed by the T+L composition).  XPON/MANT rows in the matrix
updated: L/V/M/T cells promoted from blank (candidate) to ✓.
Verification gates at exit: `node tests/test-all.mjs` 5448/0/0,
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (187)" below.

**Last updated (prior — session 183).** Session 183 (2026-04-26, post-ship T-003 partial re-land;
lane name **`session183-data-type-support`**) — re-landing the 12
`session175` trig heterogeneous-output value-pin assertions that were
lost to a filesystem-persistence failure (T-003 in REVIEW.md).  No
source-side changes; lane held `tests/test-types.mjs`, `docs/DATA_TYPES.md`,
`logs/`.  +12 hard assertions in `tests/test-types.mjs` (959 → 971):
forward-trig SIN/COS/TAN and inverse-trig ASIN/ACOS/ATAN each ×
bare-List + Tagged-of-List heterogeneous-output value-precise pins on
`{Real(0) Real(1)}` input in RAD (ACOS FLIPPED outlier: item[0]=π/2,
item[1]=0).  Labels use `session175r:` to trace lineage without
colliding with the lost `session175:` namespace.
Verification gates at exit: `node tests/test-all.mjs` 5401/0/0,
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (183)" below.

**Last updated (prior — session 179).** Session 179 (2026-04-26, ship-day 1/3-scope run;
lane name **`session179-data-type-support`**) — one pinning cluster
closing the String lex compare coverage gap on `<` / `>` / `≤` / `≥`
(the ordered-comparator intro paragraph carried a stale "still Bad
argument type" note; the implementation was already in `comparePair`
but had zero hard assertions).  No source-side changes; lane held only
`tests/test-types.mjs`, `docs/DATA_TYPES.md`, `logs/`.
+12 hard assertions in `tests/test-types.mjs` (947 → 959): four ops ×
value-true + value-false + equality boundary pins for `<`/`>`, equality
boundary for `≤`/`≥`, plus `""<"a"` empty-string sentinel and two
cross-type rejection guards.  Stale intro text removed and replaced
with accurate description citing HP50 User Guide App. J + session 179.
Notes columns for all four ordered-compare rows updated.
Verification gates at exit: `node tests/test-all.mjs` 5389/0/0,
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (179)" below.

**Last updated (prior — session 171).** Session 171 (2026-04-25, release-mode wrap-up
on T-1 day; lane name **`session171-data-types`**) — two pinning
clusters lifting session 166's n=0/n=1 boundary structure and
session 168's heterogeneous-output mixed-input value-pin pattern
onto the forward-hyperbolic family (SINH / COSH / TANH / ASINH).
No source-side changes; lane held only `tests/test-types.mjs`,
`docs/DATA_TYPES.md`, `logs/session-171.md`.
(1) **SINH / COSH / TANH / ASINH n=0 empty-List + n=1
single-element boundary closures on bare-List + Tagged-of-List
composition** — session 120 pinned bare-List + (SINH-only)
Tagged-of-List dispatch on n=2 for the forward-hyperbolic family,
and sessions 130/140/150 lifted the wrapper-VM composition onto
the same family under Tagged-of-Vector / Tagged-of-Matrix.  But
the n=0 empty-List and n=1 single-element shoulders on the
bare-List + T+L axes — the boundary axis that session 160 closed
on LN, session 162 closed on LNP1/EXPM, session 166 closed on
LOG/EXP/ALOG and ACOSH/ATANH — were never pinned on the
forward-hyperbolic four-op family.  This cluster mirrors session
166 Cluster 1's structure on the SINH/COSH/TANH/ASINH family,
which routes through the same 3-deep wrapper composition
`_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` (via
`_unaryCx`) as the LN/LOG/EXP/ALOG quartet.  Per-op n=1 input is
Real(0) since every forward-hyperbolic op has a clean numeric
fold at zero — sinh(0)=0, cosh(0)=1, tanh(0)=0, asinh(0)=0 — so
the n=1 pin produces a value-precise output exercising both the
wrapper dispatch and the inner numeric primitive ran for the
singleton.  Pins: `{ } SINH/COSH/TANH/ASINH → { }` and
`:l:{ } SINH/COSH/TANH/ASINH → :l:{ }` (n=0 bare + T+L per op);
`{ Real(0) } SINH/TANH/ASINH → { Real(0) }`,
`{ Real(0) } COSH → { Real(1) }` (n=1 bare per op);
`:h:{ Real(0) } SINH/TANH/ASINH → :h:{ Real(0) }`,
`:h:{ Real(0) } COSH → :h:{ Real(1) }` (n=1 T+L per op).
(2) **COSH / TANH / ASINH heterogeneous-output mixed-input
value pins on bare-List + Tagged-of-List composition** —
session 120 pinned SINH bare-List + Tagged-of-List
heterogeneous-output values directly (`SINH({0 1}) → {0 sinh(1)}`
and `:lbl:{0 1} SINH → :lbl:{0 sinh(1)}` with both values
asserted); for COSH/TANH/ASINH the s120 sweep only pinned
type+length (both items Real, list-length 2) and did NOT pin the
distinct output values per List position.  The sibling
LOG/EXP/ALOG quartet got the heterogeneous-output value-pin
treatment in session 168; the dual LNP1/EXPM got it in session
162/164.  This cluster lifts the same heterogeneous-output
value-pin pattern onto COSH/TANH/ASINH on both bare-List and
T+L, completing the forward-hyperbolic four-op family on this
axis.  Per-op identity-then-non-identity input pair `{0 1}`:
`COSH({0 1}) → {1 cosh(1)≈1.5430}`, `TANH({0 1}) → {0
tanh(1)≈0.7615}`, `ASINH({0 1}) → {0 asinh(1)≈0.8813}`; T+L
counterparts use outer tag `:h:`.
+22 hard assertions in `tests/test-types.mjs` (895 → 917).
Verification gates at exit: `node tests/test-all.mjs` 5273/0/0
(includes a sibling-lane +5 in test-lists.mjs absorbed at gate-
recheck; only the +22 test-types delta is owned by this lane),
`node tests/test-persist.mjs` 66/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (171)" below.

**Last updated (prior — session 166).** Session 166 (2026-04-25, release-mode wrap-up
on T-1 day) — two pinning clusters closing the n=0 empty-List + n=1
single-element boundary axes on already-widened transcendental ops
in the same family that session 162 closed for LNP1/EXPM.  No
source-side changes; lane held only `tests/test-types.mjs`,
`docs/DATA_TYPES.md`, `logs/session-166.md`.
(1) **LOG / EXP / ALOG n=0 + n=1 boundary closures on bare-List +
Tagged-of-List composition** — session 160 added n=0 / n=1 pins on
the LN axis only (single-cluster scope); the remaining three ops in
the session-158 `_unaryCx`-routed quartet (LOG / EXP / ALOG) had
n=2 / n=3 pins from session 158 but no n=0 empty-List or n=1
single-element shoulder pins.  This cluster closes the trio on
those shoulders: `{ } LOG/EXP/ALOG` → `{ }`, `:l:{ } LOG/EXP/ALOG`
→ `:l:{ }`, `{ Integer(10) } LOG` → `{ Integer(1) }`, `{ Integer(0)
} EXP` → `{ Integer(1) }`, `{ Integer(2) } ALOG` → `{ Integer(100)
}`, plus T+L counterparts.  Closes the LOG/EXP/ALOG trio on the n=0
/ n=1 axes that session 160 deferred when it scoped to LN only.
(2) **ACOSH / ATANH n=0 + n=1 boundary closures on the direct-
registered (non-`_unaryCx`) wrapper shape** — session 160 added an
n=0 bare-List ACOSH pin (`{ } ACOSH → { }`) but did NOT pin the
symmetric ATANH n=0 case, the Tagged-of-List n=0 case for either
op, or the n=1 single-element shoulder for either op.  This cluster
closes the inverse-hyperbolic dual pair on the n=0 / n=1 boundary
axes: `{ } ATANH → { }`, `:h:{ } ACOSH/ATANH → :h:{ }`, `{ Real(1)
} ACOSH → { Real(0) }`, `{ Real(0) } ATANH → { Real(0) }`, plus T+L
counterparts.  Mirror of session 162 Cluster 2 on the LNP1/EXPM
dual-pair direct-registered wrapper, lifted onto the ACOSH/ATANH
direct-registered wrapper.
+19 hard assertions in `tests/test-types.mjs` (870 → 889).
Verification gates at exit: `node tests/test-all.mjs` 5186/0/0,
`node tests/test-persist.mjs` 40/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (166)" below.

**Last updated (prior — session 162).** Session 162 (2026-04-25, release-mode wrap-up) —
two pinning clusters lifting session 158's bare-List + Tagged-of-
List composition work onto the LNP1 / EXPM dual pair (which
session 158 deliberately deferred — it iterated the LN / LOG /
EXP / ALOG quartet that routes through `_unaryCx`'s EXACT-mode
arm).  No source-side changes; lane held only `tests/test-types.mjs`,
`docs/DATA_TYPES.md`, `logs/session-162.md`, `docs/REVIEW.md`.
(1) **LNP1 / EXPM bare-List + Tagged-of-List composition** — pins
per-element `Math.log1p` / `Math.expm1` fold under bare
`_withListUnary` and Tagged-of-List composition through the 3-deep
wrapper `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`,
including the **`_exactUnaryLift`-bypass contrast** with session
158's LN/LOG/EXP/ALOG L+T pin: LNP1/EXPM bypass `_unaryCx` entirely
(direct registration at `ops.js:7702/7709`), so the EXACT-mode
Integer-stay-exact arm DOES NOT FIRE — `LNP1 { Integer(0) Integer(0) }`
→ `{ Real(0) Real(0) }` (Integer→Real per element via
`toRealOrThrow`), DISTINCT from session 158's `LN { Integer(1)
Integer(1) }` → `{ Integer(0) Integer(0) }` integer-stay.  Plus
the LNP1 boundary throw `{ Real(-1) } LNP1` → `Infinite result`
(propagates through wrapper `apply` loop) and heterogeneous-output
mixed-input pins (`LNP1 { Real(-0.5) Real(0) }` → `{ Real(log1p(
-0.5)) Real(0) }` distinct values per List position).
(2) **LNP1 / EXPM n=0 empty-List + n=1 single-element boundary
closures** — mirror of session 160's LN n=0 / n=1 pins lifted onto
the LNP1/EXPM duals: `{ } LNP1` → `{ }`, `:l:{ } LNP1` → `:l:{ }`,
`{ Real(0) } LNP1` → `{ Real(0) }`, EXPM symmetric.  Closes the
LNP1/EXPM dual pair on the n=0 / n=1 boundary axis that session
160 left open (single-cluster scope on LN only).
+15 hard assertions in `tests/test-types.mjs` (852 → 867).
Verification gates at exit: `node tests/test-all.mjs` 5148/0/0,
`node tests/test-persist.mjs` 40/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (162)" below.

**Last updated (prior — session 158).** Session 158 (2026-04-25, release-mode wrap-up) —
two pinning clusters lifting session 150's wrapper-VM-under-Tagged
work onto the LIST axis (bare-List + Tagged-of-List) on already-
widened transcendental ops; closes the L/T composition axis on the
direct-registered ACOSH/ATANH handlers and on the standard-wrapped
LN/LOG/EXP/ALOG quartet.  No source-side changes (ops.js was
lock-held by concurrent session157-command-support; logs/ also held
— no session-log file created this run).  Lane held only `tests/
test-types.mjs`, `docs/DATA_TYPES.md`, `www/src/rpl/algebra.js`.
+19 hard assertions in `tests/test-types.mjs` (829 → 848).
Verification gates at exit: `node tests/test-all.mjs` 5105/0/0,
`node tests/test-persist.mjs` 40/0, `node tests/sanity.mjs` 22/0.
See "Resolved this session (158)" below.

**Last updated (prior — ship-prep 2026-04-25).** Ship-prep 2026-04-25 (release-mode coverage-matrix
reconciliation pass) — doc-only audit reconciling the matrix against
the live op registrations in `www/src/rpl/ops.js`.  Source of truth:
`utils/@probe-special-fns-vm.mjs` + `utils/@probe-trunc-vm.mjs` —
push concrete V/M/L/T operands at every op flagged for L/V/M/T
acceptance and observe whether the registered handler accepts or
throws `Bad argument type`.  **5 ops × 4 cells (20 cells total)
downgraded** from aspirational ✓ to blank (candidate): XPON, MANT,
TRUNC, HEAVISIDE, DIRAC on the L/V/M/T axes.  All five are
registered as bare handlers (no `_withTaggedUnary` /
`_withListUnary` / `_withVMUnary` wrapping) and reject every
collection axis with `Bad argument type`.  The matrix carried these
✓ marks since session 100/105's Sy-round-trip pass — those sessions
pinned the *parser round-trip* on L/V/M/T-shaped operands but not
the *stack handler accept-or-reject* contract; the cells were
implicitly assumed to be ✓ via the trig/log/etc. wrapper convention
that doesn't actually apply to these specific registrations.  Lane
held: `docs/DATA_TYPES.md` + `www/src/rpl/algebra.js`.  Tests/ +
ops.js were locked by sibling `session153-command-support` lane
during this run, so no test-side or op-side changes; the audit's
op-wrapper-add candidates (e.g. wrap HEAVISIDE/DIRAC with
`_withTaggedUnary(_withListUnary(_withVMUnary(...)))` for the
distribution semantics; same for XPON/MANT/TRUNC) are flagged but
**deferred post-ship** — wrapper-add work and the matching pin
tests cross multiple lane scopes.  Verification gates at exit:
`node --check docs/DATA_TYPES.md` n/a (markdown); `node tests/
sanity.mjs`, `node tests/test-all.mjs`, `node tests/test-persist.mjs`
re-run to confirm no doc-only edit affected the test gates.

**Last updated (prior — session 150).** Session 150 (2026-04-25) — three more hard-assertion
widening clusters pinning previously-undertested wrapper-VM
composition + bare-scalar EXACT-mode contracts on already-widened
ops (no source-side changes; lane held only `tests/test-types.mjs`,
`docs/DATA_TYPES.md`, `logs/session-150.md`).  (1) **Inverse-trig
ASIN / ACOS / ATAN DEG-mode `_exactUnaryLift` Integer-stay-exact
/ Rational-collapse-clean under Tagged-V/M wrapper composition** —
session 142 Cluster 1 pinned the inverse-trig bare-scalar
`_exactUnaryLift` axis under DEG; session 140 Cluster 2 pinned the
inverse-trig Tagged-of-V/M wrapper-VM composition under RAD with
Real operands (which BYPASS the EXACT-mode integer-stay arm).  This
cluster closes the inverse-trig DEG-mode integer-clean fold under
the 3-deep Tagged-V/M wrapper composition: `:a:Vector(Integer(0),
Integer(1)) ASIN` DEG → `:a:Vector(Integer(0), Integer(90))`; ACOS
operand-symmetric; ATAN closes the trio (`:t:V(Z(0),Z(1)) ATAN` DEG
→ `:t:V(Z(0), Z(45))`).  Matrix-axis closure on ASIN (`:m:Matrix([[
1,0],[0,1]]) ASIN` DEG → `:m:Matrix([[90,0],[0,90]])`).  Rational
arm composes through Tagged-V (`:a:V(Rational(1,2), Integer(1))
ASIN` DEG → `:a:V(Z(30), Z(90))` — pins that the Rational arm of
`_trigInvCx` composes through the wrapper too, distinct from the
forward-trig wrapper-composition pin in session 145 Cluster 3a
which only exercised Integer operands).  Plus a heterogeneous-kind
RAD-mode contrast on the SAME Integer operand (`:a:V(Integer(0),
Integer(1)) ASIN` RAD → `:a:V(Integer(0), Symbolic ASIN(1))` —
asin(0)=0 stays integer-clean in any angle mode but asin(1)=π/2 is
NOT integer-clean under RAD, so `_exactUnaryLift` falls through to
stay-symbolic for that element; angle-mode flip toggles Integer /
Symbolic per element on the same operands and contrasts against
session 140's Real-operand bypass path).
(2) **Forward-hyperbolic family (SINH / COSH / TANH / ASINH /
ACOSH / ATANH) `_exactUnaryLift` Integer-stay-exact / Rational-
stay-symbolic on bare scalars + ACOSH / ATANH out-of-domain
Integer→Complex bypass** — session 145 Cluster 1 covered forward-
trig bare-scalar; Cluster 2 covered LN/LOG/EXP/ALOG bare-scalar;
session 142 Cluster 1 covered inverse-trig + inverse-hyp bare-
scalar.  Forward-hyperbolic SINH / COSH / TANH on Integer/Rational
through `_unaryCx`'s EXACT arm AND the bespoke ACOSH / ATANH out-
of-domain Integer→Complex fall-through (where the EXACT-mode
integer-stay arm is gated by the in-domain check `x ≥ 1` /
`x > -1 && x < 1` and out-of-domain Integers correctly bypass to
Complex via the principal branch) were unpinned.  Pins SINH/COSH/
TANH/ASINH zero trio (Integer(0) → Integer(0/1/0/0)), SINH(Integer
(1)) → Symbolic stay-symbolic, ACOSH(Integer(1)) and ATANH(Integer
(0)) in-domain integer-clean, ATANH(Integer(2)) and ACOSH(Integer
(0)) out-of-domain Integer→Complex (pins that the in-domain check
gates `_exactUnaryLift` so out-of-domain Integers don't crash on
`Math.atanh(2)=NaN` / `Math.acosh(0)=NaN`), Rational stay-symbolic
with `Bin('/', Num(1), Num(2))` payload preservation on SINH (Q
arm of `_unaryCx`), Rational arm CAN produce Integer (`TANH(
Rational(0,1))` → `Integer(0)` — Q(0,1)=0.0 → tanh(0)=0 →
integer-clean; mirror of session 145 Cluster 2's `LN(Rational(1,
1))` → `Integer(0)` pin), and APPROX-mode bypass uniform across
both `_unaryCx`-routed (SINH) AND bespoke domain-aware (ACOSH)
handlers — the `!getApproxMode()` gate holds on both.  Closes the
transcendental bare-scalar `_exactUnaryLift` matrix:  forward-
trig (s145 c1), inverse-trig + inverse-hyp (s142 c1), forward-
hyperbolic (this cluster), LN/LOG/EXP/ALOG (s145 c2).
(3) **LN / LOG / EXP / ALOG `_exactUnaryLift` Integer-stay-exact
under Tagged-V/M wrapper composition** — session 145 Cluster 2
pinned LN/LOG/EXP/ALOG bare-scalar `_exactUnaryLift`; session 145
Cluster 3a pinned the FORWARD-trig wrapper-VM composition.  The
LN/LOG/EXP/ALOG wrapper-VM composition was unpinned: session 130
Cluster 1 pinned the wrapper composition for SQRT/FACT/LNP1/SIN
under non-integer outputs; session 140 Cluster 1 pinned the
hyperbolic family wrapper-VM composition with EXACT integer-stay
folds; but no direct pin on the LN/LOG/EXP/ALOG wrapper
composition with integer-clean Integer outputs at distinct V/M
positions.  Pins `:v:V(Z(1), Z(1)) LN` → `:v:V(Z(0), Z(0))` (zero
trio under Tagged-V), `:v:V(Z(1), Z(10), Z(100)) LOG` → `:v:V(Z(0
), Z(1), Z(2))` (three distinct integer-clean output values at
distinct V positions), `:v:V(Z(0), Z(0)) EXP` → `:v:V(Z(1), Z(1))`,
`:v:V(Z(0), Z(2), Z(3)) ALOG` → `:v:V(Z(1), Z(100), Z(1000))`
(high-magnitude non-zero integer outputs pin `_exactUnaryLift`'s
BigInt round-trip per element under the wrapper), Matrix-axis
closure (`:m:M[[1,10],[100,1000]] LOG` → `:m:M[[0,1],[2,3]]`),
mixed integer-clean / stay-symbolic within a single Tagged-V
(`:v:V(Z(2), Z(10)) LOG` → `:v:V(Symbolic LOG(2), Integer(1))` —
strong heterogeneous-kind pin on the wrapper composition's
output: the result is a mixed-kind Vector (Symbolic + Integer)
inside a Tagged wrapper, which exercises the type-heterogeneity
contract on the wrapper composition and pins that
`_exactUnaryLift`'s stay-symbolic fall-through fires per element
WITHOUT collapsing the Vector to a uniform output kind), and
APPROX-mode bypass under the wrapper composition (`:v:V(Z(1),
Z(100)) LOG` APPROX → `:v:V(Real(0), Real(2))` — APPROX flips
KIND from Integer to Real per element under the wrapper; mirror
of session 145 Cluster 2's bare-scalar APPROX-bypass pin lifted
into the wrapper composition).  Closes the transcendental
wrapper-VM-under-Tagged matrix:  forward-trig (s145 c3a),
forward-hyperbolic (s140 c1), inverse-trig (s140 c2 RAD + s150
c1 DEG), LN/LOG/EXP/ALOG (this cluster).  +26 assertions in
`tests/test-types.mjs` (803 → 829).  See "Resolved this session
(150)" below.  Session 145 was the prior data-types lane pass
(forward-trig + LN/LOG/EXP/ALOG bare-scalar `_exactUnaryLift`
+ forward-trig DEG-Tagged-V/M wrapper composition + RE/IM
M-axis inner-Tagged rejection).

**Last updated (prior).** Session 145 (2026-04-25) — three more hard-assertion
widening clusters pinning previously-undertested EXACT-mode
`_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
contracts on already-widened ops, plus closing the bespoke-V/M
inner-Tagged-rejection grid on the RE/IM axes (no source-side
changes; lane held only `tests/test-types.mjs`, `docs/DATA_TYPES.md`,
`logs/session-145.md`).  (1) **Forward trig SIN / COS / TAN
EXACT-mode `_exactUnaryLift` Integer-stay-exact / Rational-stay-
symbolic contract on bare scalars** — `_trigFwdCx` (`ops.js:8027`)
routes Integer / Rational inputs in EXACT mode through
`_exactUnaryLift(name, realFn(toRadians(x)), v)`.  Distinct from
`_unaryCx` because the angle-mode conversion `toRadians` is
applied to the Integer / Rational input BEFORE the numeric
primitive (Math.sin / Math.cos / Math.tan), and the integer-clean
check fires on the raw radian-domain result (since the forward
trig family does not invert through `fromRadians` — unlike
ASIN/ACOS/ATAN whose lift was pinned in session 142 Cluster 1).
Session 142 surfaced this gap as a candidate (forward trig
counterpart of session 142 Cluster 1's ASIN / ACOS / ATAN +
ASINH / ACOSH / ATANH `_exactUnaryLift` pin).  Pins integer-clean
folds at trivial zero (`SIN/COS/TAN(0)` RAD), at multiples of
180°/90° in DEG via IEEE-double drift through the 1e-12
tolerance (`SIN(180)` DEG → Integer(0) because Math.sin(π) ≈
1.22e-16; `COS(90)` DEG → Integer(0); `COS(180)` DEG → Integer(-1)
non-zero; `TAN(45)` DEG → Integer(1)), stay-symbolic on non-clean
operands (`SIN(1)` RAD, `COS(1)` RAD, `SIN(30)` DEG = 0.5 not
integer-clean), the angle-mode flip on the same operand
(`SIN(180)` RAD stays-symbolic, `SIN(180)` DEG folds to Integer(0)),
Rational stay-symbolic with `Bin('/', Num(n), Num(d))` payload
preservation (`SIN(Rational(1,2))` RAD), and the APPROX-mode
bypass (`setApproxMode(true)` flips `getApproxMode()` so the
Integer/Rational arm is skipped — `SIN(Integer(0))` APPROX →
`Real(0)` not Integer).
(2) **LN / LOG / EXP / ALOG EXACT-mode `_exactUnaryLift`
Integer-stay-exact / Rational-stay-symbolic contract on bare
scalars** — these four ops dispatch through `_unaryCx`
(`ops.js:7984`); the EXACT-mode Integer / Rational arm calls
`_exactUnaryLift(name, realFn(x), v)` where realFn is `Math.log` /
`Math.log10` / `Math.exp` / `(x) => Math.pow(10, x)`.  Distinct
from forward trig (Cluster 1) — there is no angle-mode
conversion: the fold operates directly on the Integer / Rational
value.  These four ops are the canonical examples called out in
the `_exactUnaryLift` doc-comment (`ops.js:1130-1137`) but had no
direct stay-exact pin (session 142 surfaced this gap).  Pins
canonical integer-clean folds (`LN(1)=0`, `LOG(10)=1`, `EXP(0)=1`,
`ALOG(2)=100`), powers-of-ten on the LOG arm (`LOG(1)/LOG(10)/
LOG(100)/LOG(1000)` = 0/1/2/3), corresponding ALOG inverse
(`ALOG(0)/ALOG(2)/ALOG(3)` = 1/100/1000), stay-symbolic on
non-clean (`LN(2)`, `LOG(2)`, `EXP(1)` preserves e symbolic,
`ALOG(-1)` since 0.1 not integer-clean), Rational arm at
collapsing value (`LN(Rational(1,1))` → `Integer(0)` — Rational
1/1 → 1.0 → ln(1)=0 → integer-clean; pins the Rational arm CAN
produce Integer results), Rational stay-symbolic preserving
`Bin('/', Num(n), Num(d))` payload (`LN(Rational(1,2))`), and the
APPROX-mode bypass on three ops (`LN(1)/LOG(100)/EXP(0)` APPROX
→ Real not Integer — pins APPROX-mode flips the result KIND not
the result VALUE).
(3) **SIN / COS / TAN EXACT-mode integer-stay-exact under
Tagged-V/M wrapper composition + RE / IM M-axis inner-Tagged-
inside-Matrix rejection** — two halves.  (a) Forward trig EXACT-
mode Integer-stay-exact under the 3-deep wrapper composition
`_withTaggedUnary(_withListUnary(_withVMUnary(_trigFwdCx-inner)))`:
session 140 Cluster 1 pinned `:v:Vector(0, 0) SIN` → `:v:Vector(
0, 0)` on Real inputs and pinned the SINH `_exactUnaryLift`
Integer-stay-exact under Tagged-V; the forward-trig (`SIN/COS/TAN`)
Tagged-V/M wrapper composition with EXACT-mode integer-clean
fold was unpinned.  Pins SIN / COS / TAN on `:v:Vector(Integer(
0), Integer(0))` RAD with non-identity output values on COS
(`:v:Vector(Integer(1), Integer(1))`), the DEG-mode angle-flip
under Tagged-V (`:v:Vector(Integer(0), Integer(180)) SIN` DEG →
`:v:Vector(Integer(0), Integer(0))` — operand-position-1 flips
between RAD/DEG: stay-symbolic in RAD, integer-clean in DEG),
mixed integer-clean output values across V positions (COS
`:v:Vector(Integer(0), Integer(90))` DEG → `:v:Vector(Integer(1),
Integer(0))`), and the Matrix-axis SIN under Tagged composition
(`:m:Matrix([[Integer(0), Integer(180)],[Integer(0), Integer(0)]])
SIN` DEG → `:m:Matrix([[0,0],[0,0]])`).  (b) RE / IM M-axis
inner-Tagged-inside-Matrix rejection — session 142 Cluster 3
pinned the V-axis on all four bespoke-V/M ops (ARG/CONJ/RE/IM)
plus the M-axis on ARG and CONJ; RE / IM M-axis was left open
because `_reScalar` / `_imScalar` are distinct per-element
handlers from `_argScalar` / `_conjScalar` so the V-axis pins
don't transitively cover the M-axis.  Pins `Matrix([[:x:Complex(
3,4)]]) RE/IM` rejection plus the multi-position rejection pins
(Tagged at row[0][1] still rejects on RE — pins
column-iteration; Tagged at row[1][0] still rejects on IM —
pins row-iteration).  Closes the 4-op × 2-axis ARG/CONJ/RE/IM
inner-Tagged-rejection grid that session 142 Cluster 3
half-opened.  +41 assertions in `tests/test-types.mjs` (762 →
803).  See "Resolved this session (145)" below.  Session 142
was the prior `tests/test-types.mjs` widening pass (carried by
the unit-tests lane: inverse-trig + inverse-hyp `_exactUnaryLift`
Integer-stay-exact bare scalars; CONJ/RE/IM/ARG on Tagged-of-
Symbolic; inner-Tagged-V/M rejection on bespoke V/M handlers).
Session 140 was the prior data-types lane pass (Hyperbolic +
inverse-trig family Tagged-of-V/M wrapper-VM composition; ARG
bare V/M + CONJ/RE/IM Tagged-of-V/M through 2-deep-bespoke
wrapper).

**Last updated (prior pass before 145).** Session 140 (2026-04-25) — three more hard-assertion
widening clusters pinning previously-undertested wrapper-VM
composition contracts on already-widened ops (no source-side
changes; lane held only `tests/test-types.mjs`, `docs/DATA_TYPES.md`,
`logs/session-140.md`).  (1) **Hyperbolic family Tagged-of-V/M
wrapper-VM composition (SINH / COSH / TANH / ASINH / ACOSH /
ATANH)** — all six dispatch through the 3-deep wrapper
`_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`
(SINH / COSH / TANH / ASINH via `_unaryCx` at `ops.js:7856`,
ACOSH / ATANH via direct registration); session 120 Cluster 1
pinned bare-scalar Tagged transparency and List distribution on
this family, and session 130 Cluster 1 pinned the wrapper-VM
composition for SQRT / FACT / LNP1 / SIN — but the hyperbolic
3-deep wrapper-VM composition was unpinned.  Pins SINH /
COSH / TANH / ASINH / ACOSH / ATANH on Tagged-Vector and
Tagged-Matrix axes, plus the EXACT-mode `_exactUnaryLift`
Integer-stay-exact path under Tagged-V (`SINH :h:Vector(Integer(0),
Integer(0))` → `:h:Vector(Integer(0), Integer(0))` — distinct
from `Real(0)` input) and the inner-Tagged-inside-Vector
rejection (mirror of session 130 Cluster 3's inner-Tagged-
inside-List rejection on the V-axis of the hyperbolic surface).
(2) **Inverse-trig family Tagged-of-V/M wrapper-VM composition
(ASIN / ACOS / ATAN) plus EXPM Tagged-of-V/M** — ASIN / ACOS
register the 3-deep wrapper directly, ATAN routes through
`_trigInvCx` (`ops.js:7929`), EXPM uses direct registration at
`ops.js:7249`; session 130 Cluster 1 pinned LNP1 Tagged-of-Vector
but EXPM (the LNP1 dual) was unpinned, and the inverse-trig
Tagged-of-V/M composition was entirely unpinned.  Pins ASIN /
ACOS / ATAN on Tagged-Vector and ASIN / ACOS on Tagged-Matrix
in RAD (with explicit `setAngle('RAD')` and a `try / finally`
restore so any prior angle-mode state survives), plus EXPM on
Tagged-Vector and Tagged-Matrix — closes the inverse-trig family
on the Tagged-V/M axis and the LNP1/EXPM dual pair on the M
axis.  (3) **ARG bare V/M axis + ARG / CONJ / RE / IM Tagged-of-
V/M composition with bespoke V/M dispatch INSIDE the 2-deep
wrapper** — distinct wrapper shape from clusters 1 / 2: ARG /
CONJ / RE / IM use `_withTaggedUnary(_withListUnary(handler))`
(only 2-deep), with the V/M dispatch happening BESPOKE inside
the inner handler (NOT through `_withVMUnary`).  See `ops.js:1379`
(ARG), `:1414` (CONJ), `:1420` (RE), `:1426` (IM).  Session 110
pinned ARG Tagged transparency on bare Complex; session 100
pinned Sy round-trip on CONJ / RE / IM; session 064 added bare
V/M dispatch to CONJ / RE / IM and session 068 added bare T —
but the bare V/M axis on ARG was unpinned, and the Tagged-of-V/M
composition through this 2-deep-bespoke wrapper shape was
unpinned for all four ops.  Pins ARG bare-V (Real-axis: ARG of
non-negative Real = 0, ARG of negative Real = π; Complex-axis:
atan2(im, re)), ARG bare-M (mixed Complex/Real entries), ARG
Tagged-of-V (Complex elements through 2-deep wrapper), CONJ
Tagged-of-V (mixed Complex/Real, Complex.im sign-flip per
element), CONJ Tagged-of-M, RE Tagged-of-M (per-entry
Complex→Real collapse, Matrix kind preserved), IM Tagged-of-V
(per-entry imaginary part — Complex→Real(im), Real→Real(0)).
Closes the bare V/M axis on ARG and the Tagged-of-V/M
composition through the 2-deep-bespoke wrapper shape on all
four ops.  +36 assertions in `tests/test-types.mjs` (703 → 739).
See "Resolved this session (140)" below.  Session 135 was the
prior widening pass (Q × V/M arithmetic broadcast + Tagged-of-V/M
binary composition + Tagged tag-identity & BinInt cross-base
equality).

**Last updated (prior pass before 140).** Session 135 (2026-04-24) — three more hard-assertion
widening clusters pinning previously-undertested broadcast and
identity contracts on already-widened ops (no source-side changes;
lane held only `tests/test-types.mjs`, `docs/DATA_TYPES.md`,
`logs/session-135.md`).  (1) **Rational × Vector / Rational ×
Matrix arithmetic broadcast on `+ - * /`** — the compact `+ - * /`
reference rows carried `V ✓ M ✓` and `Q` as a first-class peer
since sessions 092 / 115, but no direct test pinned the
*broadcast* of a Rational scalar onto a V/M, nor the per-element
type contract on V/M.  Pins Q×R-element → Real per element
(degradation, mirror of session 125 Cluster 3's MIN/MAX/MOD
Q→R contract on the V/M arithmetic surface), Q×Q-element stays-
exact via `_rationalBinary` per element (with d=1 collapse to
Integer), Q×Z-element on the Matrix axis (`Mat[Z(2),Z(4)|Z(6),
Z(8)] * Q(1/2)` → `Mat[Z(1),Z(2)|Z(3),Z(4)]`), and per-element
Q+R degradation on V+V pairwise (Q on left-V, R on right-V each
position).  (2) **Tagged-of-Vector / Tagged-of-Matrix on BINARY
arithmetic via `_withTaggedBinary(_withListBinary(handler))`** —
session 130 Cluster 1 covered the UNARY surface (SQRT, FACT, LNP1,
NEG, ABS) on Tagged-of-V/M with the 3-deep wrapper.  This cluster
covers the BINARY surface, where the wrapper is the 2-deep
`_withTaggedBinary(_withListBinary(handler))` and the inner
handler dispatches to `_arithmeticOnArrays` for V/M scalar-
broadcast, V+V/V−V/V·V (dot product), and M·M (matmul).  Pins all
four operand-shape combinations (T-V × bare-scalar, bare-scalar ×
T-V, T-V × T-V, T-scalar × bare-V), the bespoke V·V dot product
through tag-drop (kind change V → R survives the binary wrapper —
mirror of session 125 Cluster 2's bespoke ABS V → R pin on the
binary surface), matmul through tag-drop (Matrix kind preserved),
and the inner-Tagged-inside-Vector binary rejection (mirror of
session 130 Cluster 3's inner-Tagged-inside-List rejection on the
V-axis); also pins that the V+V dimension-mismatch error survives
the Tagged unwrap.  (3) **Tag-identity contract on `==` / `SAME`
plus BinInt base-agnostic equality contract** — the Tagged row
in the `==` / `SAME` block carried the Notes phrase "same tag AND
same value" since session 072, and session 074 added BinInt ×
BinInt with wordsize masking, but no direct test had pinned the
different-tag failure mode, the missing-tag-on-one-side mismatch
(Tagged ≠ bare even at the same payload value), the same-tag +
different-value mismatch, or the BinInt cross-base contract
(`#5h SAME #5d` → 1 — base is cosmetic; `SAME #5h #6d` → 0 —
value differences win regardless of base).  Pins the full Tagged
× Tagged truth table (4 combinations) plus Tagged × bare on `==`,
the SAME-mirrors-`==` contract on Tagged (always returns Real
1./0., never Symbolic), and BinInt cross-base equality / SAME /
ordered-compare (closes the cross-base contract on the comparator
family — session 074 pinned BinInt × Z, session 130 pinned BinInt
× Q, but BinInt × BinInt cross-base was unpinned).  +31 assertions
in `tests/test-types.mjs` (672 → 703).  See "Resolved this session
(135)" below.  Session 130 was the prior widening pass (Tagged-of-
V/M wrapper composition on the unary family + BinInt × Rational
cross-family compare/equality + Tagged-of-List composition on
binary ops).

**Last updated (prior pass before 135).** Session 130 (2026-04-24) — three more hard-assertion
widening clusters pinning previously-undertested wrapper-composition
and cross-family contracts on already-widened ops (no source-side
changes; the lane held only `tests/test-types.mjs`, `docs/DATA_TYPES.md`,
`logs/session-130.md`, and stand-by claims on `ops.js` / `algebra.js`
that didn't fire).  (1) **Tagged-of-Vector / Tagged-of-Matrix
composition through `_withTaggedUnary(_withListUnary(_withVMUnary(
handler)))`** on the wrapper-VM-using unary family (SQRT, SIN, FACT,
LNP1) — every elementary unary op in this chain has a 3-deep wrapper
and the matrix carried these cells as `T ✓ / V ✓ / M ✓` since
session 063, but no direct test pinned the *composition* (Tagged
unwrap → V/M element-wise via temp stack → outer re-tag).  Includes
the Matrix-axis pin on bespoke ABS (M → R kind change preserves the
outer tag, mirror of session 125's bespoke V → R pin) and the
bespoke-Matrix NEG path (NEG has its own Vector/Matrix branch, NOT
`_withVMUnary`); (2) **BinaryInteger × Rational cross-family on
`==` / `≠` / `<` / `>` / `≤` / `≥` and SAME's strict no-coerce
contract** — `_binIntCrossNormalize` (for `==`/`≠`) and `comparePair`'s
inline mask (for ordered compare) both mask BinInt → Integer with
the current wordsize, then `promoteNumericPair` routes Integer ×
Rational through the `'rational'` kind (cross-multiply, no Real
round-trip).  Session 074 added BinInt to compare widening but only
pinned B × Z / B × R / B × C; session 110 Cluster 3 pinned Q × Z /
Q × R / Q × C but not B × Q.  Includes ws=8 mask edges (`#100h ==
Rational(0,1)` → 1, `#1FFh < Rational(300,1)` → 1) and the SAME
strict-stay pin (`SAME #10h Rational(16,1)` = 0) extending session
074's BinInt-strict contract from B × Z to B × Q; (3) **Tagged-of-List
composition on binary ops via `_withTaggedBinary(_withListBinary(
handler))`** — session 120 Cluster 2 pinned both-side / left-only /
right-only tag-drop on the percent family with bare-scalar operands,
and session 125 Cluster 1 pinned bare-list distribution on the
combinatorial / divmod / GCD / LCM / MOD / MIN / MAX surface, but
the *composition* (Tagged outside List on one or both operands)
was unpinned on this surface.  Includes the inner-Tagged-inside-List
binary rejection (mirror of session 125 Cluster 2's unary rejection)
that pins the wrapper composition order: `_withTaggedBinary` sits
OUTSIDE `_withListBinary`, and `_withListBinary`'s recursive `apply`
calls the inner handler directly (NOT back through the wrapped
function), so inner Tagged scalars in a list see the bare scalar
handler, which is not Tagged-aware.  +35 assertions in
`tests/test-types.mjs` (637 → 672).  See "Resolved this session
(130)" below.  Session 125 was the prior widening pass (List
distribution on arity-2 numeric family + Tagged-of-List composition
on rounding/sign/abs unary family + Rational Q→R degradation on
MIN/MAX/MOD).

**Last updated (prior pass before 130).** Session 125 (2026-04-24)
 — three more hard-assertion
widening clusters pinning previously-undertested contracts on
already-widened ops (no source-side changes; ops.js + most other
source files are lock-held by concurrent session 124 command-support
lane).  (1) **List distribution on the arity-2 numeric family**
(`COMB`/`PERM`/`IQUOT`/`IREMAINDER`/`GCD`/`LCM`/`XROOT`/`MOD`/`MIN`/
`MAX`) — all ten ops are wrapped in `_withListBinary` and listed
`L ✓` since session 064 / 105, but no direct test pinned scalar×List,
List×scalar, or pairwise distribution on this sub-family (session
115 Cluster 3 covered the axes on `+`/`-`/`*` and the rounding family
but stopped short of the combinatorial / divmod / GCD / LCM / XROOT /
MOD / MIN / MAX surface where the inner handler does a different
domain check); (2) **Tagged-of-List composition on the rounding /
sign / abs family** (`FLOOR`/`CEIL`/`IP`/`FP`/`SIGN`/`ABS`) — the
wrapper composition `_withTaggedUnary(_withListUnary(handler))` makes
`:lbl:{a b}` unwrap Tagged, distribute across the list, then re-tag
the resulting list.  Session 110 / 120 pinned bare-Tagged on these
ops and session 115 Cluster 3 pinned bare-List on NEG / FLOOR; this
cluster covers the *composition* on a different unary subfamily,
the deliberate inner-Tagged-inside-List rejection, and the bespoke
`:v:Vector(3,4) ABS` → `:v:Real(5)` cross-kind pin (the Frobenius
bespoke runs *inside* `_withTaggedUnary`, so the outer tag is
preserved across the V→R kind change at the inner handler);
(3) **Rational `Q→R` degradation contract on `MIN`/`MAX`/`MOD`** —
distinct from the arithmetic family (`+ - * / ^`) which preserves Q
via `promoteNumericPair`'s `'rational'` kind, the `_minMax` and MOD
inner handlers do NOT route through the rational-kind branch — they
fall through `toRealOrThrow` and emit `Real`.  This is by design
(MIN / MAX / MOD have always been Real-valued for non-Integer
inputs) and pinning it documents the current behavior so a future
widening pass that adds a Q column on these rows will know whether
to preserve or flip the contract.  +43 assertions in
`tests/test-types.mjs` (594 → 637; ops.js / test-algebra /
test-symbolic / COMMANDS.md / logs/ are lock-held by concurrent
session 124 command-support lane).  See "Resolved this session
(125)" below.  Session 120 was the prior widening pass (Hyperbolic
Tagged transparency, percent-family Tagged tag-drop, Rational unary
stay-exact).  Session 115 was the prior pass before that (Binary
Tagged tag-drop on `+ - * / ^` plus Rational arithmetic end-to-end
plus List distribution edge cases).  Session 110 covered BinInt
mixed arithmetic + Tagged round-trip on rounding / sign / arg +
Rational cross-family compare.

**Last updated (prior pass before 125).** Session 120 (2026-04-24) — three hard-assertion
widening clusters pinning previously-undertested contracts on
already-widened ops:
(1) Hyperbolic family (`SINH` / `COSH` / `TANH` / `ASINH` /
`ACOSH` / `ATANH`) Tagged transparency, List distribution, and
Symbolic-lift through Tagged — all six list `T ✓ / L ✓ / N ✓ /
Sy ✓` since session 063 but no direct test pinned the
re-tag-with-same-label contract or the wrapper composition
(`_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`),
including the principal-branch lift `ATANH(:v:Real(2))` →
`Tagged(v, Complex)` where the inner handler picks Real-vs-Complex
*after* the Tagged unwrap and the outer re-tag is type-agnostic
on the inner; (2) Tagged tag-drop on the percent family
(`%` / `%T` / `%CH`) — listed `T ✓` since session 064 but no
direct test pinned the `_withTaggedBinary` either-side-or-both
unwrap-and-drop on these specific ops (distinct inner handler
from the arithmetic family pinned in session 115 Cluster 1);
includes the V/M ✗ rejection pin that session 072 flipped from
blank to ✗ + List-broadcast on the percent base; (3) Rational
unary stay-exact contract on `NEG`/`INV`/`SQ`/`ABS`/`SQRT`/`SIGN`/
`FLOOR`/`CEIL`/`IP`/`FP` plus APPROX-mode Q→R collapse plus
out-of-domain rejection on `FACT`/`XPON`/`MANT` — the "Rational
(`Q`) — session 092" convention text describes the EXACT-mode
stay-exact dispatch and APPROX-mode collapse but no per-op row
carries a Q column, and no direct test pinned the integer-
collapse boundaries (FLOOR/CEIL/IP/SIGN drop to Integer; SQRT of
perfect-square stays Q with d=1 collapse; SQRT of non-square
lifts to Symbolic in EXACT; SQRT of negative Q lifts to Complex;
FP keeps Q except integer-valued Q where it returns Integer(0);
INV(Rational(1, n)) collapses to Integer(n) but SQ(Rational(2, 1))
deliberately stays as Rational(4, 1)).
+68 assertions in `tests/test-types.mjs` (524 → 594; ops.js /
test-algebra / test-matrix / COMMANDS.md / REVIEW.md / logs/ are
lock-held by concurrent session 119 command-support lane).  See
"Resolved this session (120)" below.  Session 115 was the prior
widening pass (Binary Tagged tag-drop contract on `+ - * / ^` and
the binary-numeric family + Rational arithmetic end-to-end on
`+ - * / ^` + List distribution edge cases).  Session 110 was the
prior pass before that (BinInt mixed arithmetic + Tagged
round-trip on rounding/sign/arg + Rational cross-family compare).
Session 105 was the prior Sy-round-trip pass; session 087 the
prior matrix-cell change.  Sessions 088–099, 101–109, 111–114,
116–119 did not touch the type-acceptance matrix itself (review
/ command-support / Giac-CAS / Decimal-Real / Rational /
parser-refactor / unit-tests / RPL-programming work).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `✓`    | Supported — verified by an assertion in one of the `tests/*` files. |
| `·`    | Not applicable — the type isn't a meaningful operand here (e.g. a Real operand on a string-op). |
| `✗`    | Deliberately rejected — HP50 itself rejects this type, and we match. Verified by a rejection test. |
| *blank* | Candidate for a future widening pass. |

## Type axes (column headers)

```
R   Real            V   Vector              Sy  Symbolic
Z   Integer         M   Matrix              T   Tagged
Q   Rational        L   List                U   Unit
B   BinaryInteger   N   Name (quoted)       S   String
C   Complex         D   Directory           G   Grob
P   Program
```

**Rational (`Q`) — session 092.**  New numeric type; BigInt-backed
exact ratio.  For scalar arithmetic (+ − × ÷ ^), Rational is a
first-class peer of Integer/Real/Complex on the promotion lattice
(Z ⊂ Q ⊂ R ⊂ C).  Unary ops (NEG, ABS, INV, SQ, SQRT,
FLOOR/CEIL/IP/FP, SIGN) have EXACT/APPROX-aware dispatch — EXACT
keeps the Rational (or collapses to Integer when `d=1` / result is
integer-valued), APPROX collapses to Real.  Transcendentals (LN, LOG,
EXP, trig, hyperbolic) fall through `toRealOrThrow` so Q is silently
coerced to Real — there's no exact `LN(2/3)`.  Symbolic lift routes
Q through the AST as `Bin('/', Num(n), Num(d))`.

**Real (`R`) — session 093.**  Real's `.value` is a **decimal.js
Decimal instance** at precision 15 (was a JS `number` through session
092).  Every op, formatter, and promotion helper reads Decimals via
the decimal.js API (`.plus`, `.minus`, `.times`, `.div`, `.pow`,
`.eq`, `.lt`, `.gte`, `.abs`, `.neg`, `.isZero`, `.isInteger`,
`.isFinite`, `.toNumber`, `.toFixed`, `.trunc`).  The `promoteNumericPair`
`'real'` branch returns Decimal instances in both slots, so arithmetic
chains preserve 15-digit precision without IEEE-754 round-trips
between ops.  Persistence (`persist.js`) encodes via
`{ __t: 'decimal', v: '<Decimal.toString()>' }` so full precision
round-trips through snapshot/rehydrate.  NaN is rejected at the Real
constructor.  The AST `Num` leaf and `Unit` payload are still JS
numbers — those are separate namespaces from the stack Real.

## Conventions (shared across all ops below)

- **List distribution** — lists distribute element-wise via
  `_withListUnary` / `_withListBinary` (defined in `www/src/rpl/ops.js`).  An op
  that treats a list as a whole object (SIZE, HEAD, aggregate reducers,
  STO, PURGE, …) does NOT list-distribute and is not wrapped.
- **Tagged transparency** — `_withTaggedUnary` unwraps, applies, re-tags with
  the same label.  `_withTaggedBinary` unwraps both sides and drops the tag
  (binary ops have no single obvious tag to keep).
- **Vector / Matrix element-wise** — `_withVMUnary` dispatches `f(x)` per
  element.  Ops with bespoke V/M semantics (ABS = Frobenius norm, INV/M =
  matrix inverse, SQ/M = M·M, SIGN/V = unit direction) bypass the wrapper.
- **Symbolic / Name lift** — either operand being a `Name` or `Symbolic`
  lifts the op to `Symbolic(AstFn('OPNAME', [...]))` (or an `AstBin` when
  that's more natural — see `+` / `-` / `*` / `/` / `^`).  The name must be
  in `KNOWN_FUNCTIONS` in `www/src/rpl/algebra.js` so the symbolic result
  round-trips through `parseEntry`.
- **Promotion lattice** — Z → R → C (scalar promotion); scalar → V/M
  (broadcast); R / C → Sy (lift).  BinaryInteger does NOT silently promote
  to R — mixing B with a non-B scalar is rejected unless the op has an
  explicit BinaryInteger path.

---

## Widened ops (current state)

Rows are **in registration order** of the op in `www/src/rpl/ops.js` — grouping
matches the code.  Blank cells in otherwise-widened rows are deliberate
follow-on candidates and listed at the bottom.

### Unary — invert / square / sqrt / elementary functions

| Op     | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|--------|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| INV    | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | · | ✓ | ✓ | ✓ | ✗ | ✗ | V = · (no standard vector-inverse); M = matrix inverse. Session 064 added T. Session 120 pinned Q stay-exact: `INV Rational(2,3)` → `Rational(3,2)`; `INV Rational(1,5)` → `Integer(5)` (Rational(5,1) collapses to Integer); APPROX-mode collapses to Real. **Session 258:** B `·`→`✗` — `_invScalar` requires `isReal/isInteger/isRational/isComplex`; BinaryInteger not in any accepted branch. |
| SQ     | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | · | · | ✓ | ✓ | ✗ | ✗ | V/M deliberately · — `SQ/V` = dot product, `SQ/M` = matmul, handled by `*`. Session 064 added T. Session 120 pinned Q stay-exact: `SQ Rational(-3,4)` → `Rational(9,16)`; deliberately does NOT d=1 collapse on `SQ Rational(2,1)` (stays Rational(4,1) — different code path from INV); APPROX-mode collapses to Real. **Session 258:** B `·`→`✗` — `_sqScalar` requires `isReal/isInteger/isRational/isComplex`. |
| SQRT   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Negative real / integer promotes to Complex (principal branch). Session 063 added V/M/T. Session 120 pinned Q routing: perfect-square stays Q (`SQRT Rational(9,16)` → `Rational(3,4)`) with `Rational(0,1)` collapsing to `Integer(0)`; non-square Q lifts to Symbolic in EXACT (`SQRT Rational(2,1)` → Symbolic, no implicit Real coercion); negative Q lifts to Complex (`SQRT Rational(-1,1)` → `Complex(0, 1)`, principal branch). Session 130 pinned the `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` composition on Tagged-of-Vector and Tagged-of-Matrix: `:v:Vector(4, 9) SQRT` → `:v:Vector(2, 3)` and `:m:Matrix([[4,9],[16,25]]) SQRT` → `:m:Matrix([[2,3],[4,5]])` (outer tag preserved across element-wise V/M dispatch). **Session 258:** B `·`→`✗` — `toRealOrThrow` rejects BinaryInteger. **Session 263:** U `·`→`✗` — `toRealOrThrow` rejects Unit (no `isUnit` branch in the SQRT handler path). |
| ABS    | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | V/M = Frobenius norm (bespoke — not the wrapper). Session 068 added T. Session 120 pinned Q stay-exact: `ABS Rational(-3,4)` → `Rational(3,4)`. Session 125 pinned Tagged-of-List composition (`:v:{Real(3) Real(-4)} ABS` → `:v:{Real(3) Real(4)}`) and the bespoke Tagged-of-Vector cross-kind path (`:v:Vector(3,4) ABS` → `:v:Real(5)` Frobenius norm — confirms the bespoke V-handler runs *inside* the `_withTaggedUnary` wrapper, so the tag is preserved across the kind-changing op). Session 130 extended the bespoke cross-kind pin to the Matrix axis: `:m:Matrix([[3,0],[0,4]]) ABS` → `:m:Real(5)` (Frobenius on Matrix; M → R kind change preserves the outer tag — same shape as the V-axis pin). **Session 258:** B `·`→`✗` — `_absScalar` isReal/isInteger/isRational/isComplex guard; BinaryInteger excluded. |
| SIN..ACOSH..ATANH (elementary) | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Session 063. Mode-sensitive (DEG/RAD/GRD) for trig. Session 120 pinned hyperbolic (SINH/COSH/TANH/ASINH/ACOSH/ATANH) Tagged transparency, List distribution, and Symbolic-lift through Tagged — including the `ATANH(:v:Real(2))` → `Tagged(v, Complex)` principal-branch lift where the inner handler picks Real-vs-Complex after the Tagged unwrap. Session 130 pinned Tagged-of-Vector composition for the trig wrapper-VM path: `SIN :v:Vector(0, 0)` → `:v:Vector(0, 0)` (3-deep wrapper composition `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` — outer tag preserved across element-wise transcendental dispatch). Session 140 pinned the hyperbolic 3-deep wrapper-VM composition on Tagged-Vector (SINH `:h:V[Z(0),Z(0)]` → `:h:V[Z(0),Z(0)]` EXACT-mode integer-stay-exact via `_exactUnaryLift`; COSH `:v:V[0,0]` → `:v:V[Real(1),Real(1)]` non-identity output value; ASINH/ACOSH/ATANH `:h:V[…]` → `:h:V[0,0]`) and on Tagged-Matrix (SINH/TANH `:m:M[[0,0],[0,0]]` → `:m:M[[0,0],[0,0]]`). Inner-Tagged-inside-Vector rejection on SINH (`V[:x:Real(0), :y:Real(0)] SINH` → 'Bad argument type', mirror of session 130 Cluster 3's inner-Tagged-inside-List rejection on the hyperbolic axis). Inverse-trig family (ASIN/ACOS/ATAN) Tagged-of-V/M composition pinned in RAD with explicit `setAngle('RAD')` + try/finally restore: ASIN `:a:V[0,1]` → `:a:V[0,π/2]` (item[0] clean asin(0)=0, item[1] within 1e-12 of π/2), ACOS `:a:V[1,0]` → `:a:V[0,π/2]` operand-symmetric, ATAN `:a:V[0,0]` → `:a:V[0,0]` (routes through `_trigInvCx`, distinct helper from ASIN/ACOS but same 3-deep wrapper), ASIN/ACOS Matrix-axis closes the inverse-trig pair on M. Session 142 (carried by unit-tests lane) pinned the inverse-trig + inverse-hyp `_exactUnaryLift` Integer-stay-exact bare-scalar contract on the ASIN/ACOS/ATAN/ASINH/ACOSH/ATANH axis (e.g. `ASIN(Integer(1))` DEG → `Integer(90)`, `ATAN(Integer(1))` RAD stays-symbolic vs DEG → `Integer(45)` angle-mode flip, `ASIN(Rational(1,2))` DEG → `Integer(30)`). Session 145 pinned the **forward-trig (`SIN`/`COS`/`TAN`) `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic contract** on bare scalars (extends session 142's pattern to `_trigFwdCx`, where `toRadians` is applied to the Integer/Rational input BEFORE the numeric primitive — distinct from inverse-trig's post-primitive `fromRadians`): trivial zeros (`SIN/COS/TAN(0)` RAD), DEG-mode multiples-of-180°/90° folding through IEEE-double drift (`SIN(180)` DEG → Integer(0); `COS(90)` DEG → Integer(0); `COS(180)` DEG → Integer(-1) non-zero output; `TAN(45)` DEG → Integer(1)), stay-symbolic on non-clean (`SIN(1)`/`COS(1)` RAD; `SIN(30)` DEG = 0.5 not int-clean), the angle-mode flip on identical operand (`SIN(180)` RAD stays-symbolic, `SIN(180)` DEG folds), Rational stay-symbolic with `Bin('/', Num(n), Num(d))` payload preservation (`SIN(Rational(1,2))` RAD), and the APPROX-mode bypass (`SIN(Integer(0))` APPROX → `Real(0)` not Integer). Session 145 also pinned the forward-trig `_exactUnaryLift` Integer-stay-exact path **under the Tagged-V/M wrapper composition** (`:v:Vector(Integer(0), Integer(0)) SIN/COS/TAN` RAD; `:v:Vector(Integer(0), Integer(180)) SIN` DEG → `:v:Vector(0, 0)` angle-flip composes element-wise; `:m:Matrix([[0,180],[0,0]]) SIN` DEG → `:m:Matrix([[0,0],[0,0]])` Matrix-axis closure). Session 150 closed the **inverse-trig (ASIN/ACOS/ATAN) DEG-mode `_exactUnaryLift` Integer-stay-exact under Tagged-V/M wrapper composition** (mirror of session 145's forward-trig DEG-Tagged-V/M pin on the inverse-trig axis; closes the bare-scalar pin from session 142 Cluster 1 lifted into the wrapper composition): `:a:Vector(Integer(0), Integer(1)) ASIN` DEG → `:a:Vector(Integer(0), Integer(90))`, `:a:Vector(Integer(1), Integer(0)) ACOS` DEG → `:a:Vector(Integer(0), Integer(90))` operand-symmetric, `:t:Vector(Integer(0), Integer(1)) ATAN` DEG → `:t:Vector(Integer(0), Integer(45))` (closes ASIN/ACOS/ATAN trio under wrapper composition); ASIN Matrix-axis (`:m:Matrix([[1,0],[0,1]]) ASIN` DEG → `:m:Matrix([[90,0],[0,90]])`); Rational arm composes through Tagged-V (`:a:V(Rational(1,2), Integer(1)) ASIN` DEG → `:a:V(Z(30), Z(90))` — Rational arm of `_trigInvCx` composes through wrapper, distinct from session 145 Cluster 3a forward-trig wrapper-comp pin which only exercised Integer operands); RAD-mode contrast on the SAME Integer operand (`:a:Vector(Integer(0), Integer(1)) ASIN` RAD → `:a:Vector(Integer(0), Symbolic ASIN(1))` — heterogeneous-kind output under wrapper composition: asin(0)=0 stays integer-clean any angle mode, asin(1)=π/2 NOT integer-clean RAD so `_exactUnaryLift` falls through to stay-symbolic; angle-mode flip toggles Integer / Symbolic per element on the SAME operands; contrasts against session 140's `:a:V(Real,Real) ASIN` RAD pin which BYPASSED the EXACT integer-stay arm). Session 150 also pinned the **forward-hyperbolic family (SINH/COSH/TANH/ASINH/ACOSH/ATANH) `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic on bare scalars** (closes the transcendental bare-scalar matrix: forward-trig s145 + LN/LOG/EXP/ALOG s145 + inverse-trig+inverse-hyp s142 + forward-hyp s150). Session 158 lifted session 140 Cluster 1's Tagged-of-Vector ACOSH/ATANH composition onto the **LIST axis** (bare-List + Tagged-of-List) on the direct-registered ACOSH/ATANH handlers (closes the L/T composition on the bespoke-shape sub-axes that session 120's SINH/COSH/TANH/ASINH for-loop deliberately excluded — ACOSH/ATANH dispatch through `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` directly, NOT through `_unaryCx`): `ACOSH {Real(1) Real(1)} → {Real(0) Real(0)}` and `ATANH {Real(0) Real(0)} → {Real(0) Real(0)}` (bare-List in-domain boundary); `ACOSH :h:{Real(1) Real(1)} → :h:{Real(0) Real(0)}` and `ATANH :h:{Real(0) Real(0)} → :h:{Real(0) Real(0)}` (Tagged-of-List composition closes the ACOSH/ATANH pair on T+L); `ACOSH {Integer(1) Integer(1)} → {Integer(0) Integer(0)}` and `ATANH {Integer(0) Integer(0)} → {Integer(0) Integer(0)}` (EXACT-mode `_exactUnaryLift` Integer-stay-exact composes per element through bare List on the bespoke handlers); `ACOSH {Real(0)} → {Complex(0, ±π/2)}` and `ATANH {Real(2)} → {Complex(atanh(2)-iπ/2)}` (out-of-domain Real→Complex bypass per element through bare List, mirror of session 150 Cluster 2 bare-scalar out-of-domain pin lifted onto L axis); plus heterogeneous-domain pin `ACOSH {Integer(1) Real(0)} → {Integer(0) Complex(0, ±π/2)}` (per-element domain-check independence: same wrapper invocation dispatches one element through EXACT integer-stay arm, another through Complex-principal-branch bypass) and Tagged-of-List heterogeneous closure `ATANH :h:{Real(0) Real(2)} → :h:{Real(0) Complex(atanh(2)-iπ/2)}`. SINH/COSH/TANH zero trio (Integer(0) → Integer(0/1/0)), ASINH/ACOSH/ATANH zero/one folds (`ACOSH(Integer(1))` → Integer(0) in-domain; `ATANH(Integer(0))` → Integer(0) in-domain), SINH(Integer(1)) → Symbolic stay-symbolic, **out-of-domain Integer→Complex bypass on bespoke handlers** (`ATANH(Integer(2))` → Complex principal branch; `ACOSH(Integer(0))` → Complex(0, ±π/2) — pins the in-domain check `x>-1&&x<1` / `x≥1` gates the EXACT-mode integer-stay arm so out-of-domain Integers don't crash `_exactUnaryLift` against `Math.atanh(2)=NaN` / `Math.acosh(0)=NaN`), Rational stay-symbolic with `Bin('/', Num(1), Num(2))` payload on SINH (`SINH(Rational(1,2))` → Symbolic preserving the rational AST), Rational arm CAN produce Integer (`TANH(Rational(0,1))` → `Integer(0)` — Q(0,1)=0.0 → tanh(0)=0 → Integer; mirror of session 145 LN(Q(1,1))=Z(0) pin), APPROX-mode bypass uniform across `_unaryCx`-routed (SINH) AND bespoke (ACOSH) handlers. Session 171 pinned the forward-hyperbolic family (COSH/TANH/ASINH) heterogeneous-output mixed-input value-precise pins on bare-List + T+L. Session 175 (re-landed session 183, labels `session175r:`) closed the same axis on the forward-trig (SIN/COS/TAN) and inverse-trig (ASIN/ACOS/ATAN) families: `{Real(0) Real(1)}` input in RAD; COS outlier item[0]=Real(1); ACOS FLIPPED outlier item[0]=π/2 + item[1]=0. All four transcendental families now closed on the heterogeneous-output mixed-input value-pin axis across bare-List + Tagged-of-List. **Session 258:** B `·`→`✗` — `_unaryCx`→`toRealOrThrow` rejects BinaryInteger (representative pin: SIN B(10) → Bad argument type; applies to entire trig/hyp group). **Session 263:** U `·`→`✗` — `_unaryCx`→`toRealOrThrow` rejects Unit (representative pin: SIN U(1_m) → Bad argument type; applies to entire trig/hyp group). |
| FACT / `!` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Session 063. Complex ✗ (HP50 Γ is real-only). Negative integer = Bad argument value (Γ pole). Session 120 pinned `Q ✗` rejection: `FACT Rational(5,1)` → 'Bad argument type' even at integer-valued Q (Q is not silently coerced to Real on FACT — deliberate Q-as-first-class-type stance). Session 130 pinned the Tagged-of-Vector wrapper-VM composition: `FACT :v:Vector(0, 5)` → `:v:Vector(Integer(1), Integer(120))` (integer-domain inner handler composes through `_withVMUnary` per element under outer Tagged). **Session 258:** B `·`→`✗` — `_factScalar` isReal/isInteger only; BinaryInteger rejected. **Session 263:** U `·`→`✗` — `_factScalar` isReal/isInteger only; Unit rejected. |
| LN, LOG, EXP, ALOG | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Logarithmic / exponential family — dispatch through `_unaryCx` (`ops.js:7984`); Complex via `_cxLn` / `_cxExp` etc.; same Tagged / List / V/M wrapping as the trig / hyperbolic family. The matrix didn't carry these as a dedicated row through session 142 — they were considered covered by the "elementary functions" umbrella and the convention text. Session 145 broke them out and pinned the **EXACT-mode `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic contract** on bare scalars (the canonical examples called out in `_exactUnaryLift`'s doc-comment at `ops.js:1130-1137`): `LN(Integer(1))` → `Integer(0)`, `LN(Integer(2))` → Symbolic; `LOG(1)/LOG(10)/LOG(100)/LOG(1000)` = Integer(0/1/2/3) — full powers-of-ten quartet; `LOG(Integer(2))` → Symbolic; `EXP(Integer(0))` → `Integer(1)`, `EXP(Integer(1))` → Symbolic (preserves e unevaluated); `ALOG(Integer(0))` → `Integer(1)`, `ALOG(Integer(2))` → `Integer(100)`, `ALOG(Integer(3))` → `Integer(1000)` — non-zero integer outputs pin BigInt round-trip without precision loss; `ALOG(Integer(-1))` → Symbolic (10⁻¹=0.1 not integer-clean). Rational arm: `LN(Rational(1,1))` → `Integer(0)` (Rational arm CAN produce Integer when 1/1=1.0 → ln(1)=0 integer-clean — distinct from session 142 Cluster 1's ASIN(Rational) where the angle-mode `fromRadians` produced the integer-clean output, here it's the Rational value itself collapsing to 1.0 before the numeric primitive); `LN(Rational(1,2))` → Symbolic with `Bin('/', Num(1), Num(2))` payload preservation. APPROX-mode bypass on `LN(Integer(1))` / `LOG(Integer(100))` / `EXP(Integer(0))` → Real not Integer (pins APPROX flips KIND not VALUE). Session 158 lifted session 150 Cluster 3's wrapper composition onto the **LIST axis** (bare-List + Tagged-of-List): `LN {Integer(1) Integer(1)} → {Integer(0) Integer(0)}` (EXACT-mode `_exactUnaryLift` composes through bare `_withListUnary` on LN axis); `LOG {Integer(1) Integer(10) Integer(100)} → {Integer(0) Integer(1) Integer(2)}` (three distinct integer-clean outputs at three List positions); `EXP {Integer(0) Integer(0)} → {Integer(1) Integer(1)}` (non-zero output pins inner EXP arm ran per element); `ALOG {Integer(0) Integer(2) Integer(3)} → {Integer(1) Integer(100) Integer(1000)}` (high-magnitude integer outputs pin BigInt round-trip per element under bare List); `LN :l:{Integer(1) Integer(1)} → :l:{Integer(0) Integer(0)}` and `LOG :l:{Integer(1) Integer(10) Integer(100)} → :l:{Integer(0) Integer(1) Integer(2)}` (Tagged-of-List composition closes LN/LOG axes on T+L); HETEROGENEOUS within bare List `LOG {Integer(2) Integer(10)} → {Symbolic LOG(2), Integer(1)}` (mixed integer-clean / stay-symbolic per element under bare `_withListUnary` WITHOUT uniform-kind collapse — mirror of session 150 Cluster 3 mixed-kind Tagged-V LOG pin on the bare-List axis); `LOG :l:{Integer(2) Integer(10)} → :l:{Symbolic LOG(2), Integer(1)}` (heterogeneous within Tagged-of-List composition); APPROX-mode bypass under bare List `LOG {Integer(1) Integer(100)} APPROX → {Real(0) Real(2)}` (KIND flips from Integer to Real per element under bare List wrapper). Closes the L/T composition axis on LN/LOG/EXP/ALOG; closes the transcendental wrapper-LIST-under-Tagged matrix on the LN/LOG/EXP/ALOG quartet.

Session 150 lifted the bare-scalar pin into the **Tagged-V/M wrapper composition** (closes the LN/LOG/EXP/ALOG axis on the wrapper composition; mirror of session 145 Cluster 3a's forward-trig wrapper composition pin on the LN/LOG/EXP/ALOG family): `:v:V(Z(1), Z(1)) LN` → `:v:V(Z(0), Z(0))` (zero trio), `:v:V(Z(1), Z(10), Z(100)) LOG` → `:v:V(Z(0), Z(1), Z(2))` (three distinct integer outputs at distinct V positions — pins per-element wrapper dispatch), `:v:V(Z(0), Z(0)) EXP` → `:v:V(Z(1), Z(1))` non-zero output, `:v:V(Z(0), Z(2), Z(3)) ALOG` → `:v:V(Z(1), Z(100), Z(1000))` (high-magnitude integers pin BigInt round-trip per element under wrapper), `:m:M[[1,10],[100,1000]] LOG` → `:m:M[[0,1],[2,3]]` Matrix-axis closure, **mixed integer-clean / stay-symbolic within a single Tagged-V** (`:v:V(Z(2), Z(10)) LOG` → `:v:V(Symbolic LOG(2), Integer(1))` — strong heterogeneous-kind pin: result is mixed-kind Vector inside Tagged wrapper, exercises type-heterogeneity contract on wrapper composition), and APPROX-mode bypass under wrapper composition (`:v:V(Z(1), Z(100)) LOG` APPROX → `:v:V(Real(0), Real(2))` — APPROX flips KIND from Integer to Real per element under wrapper). **Session 263:** U `·`→`✗` — `_unaryCx`→`toRealOrThrow` rejects Unit (representative pin: LN U(1_m) → Bad argument type; applies to LN/LOG/EXP/ALOG group). |
| LNP1, EXPM | ✓ | ✓ | ✓ | ✗ | · | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Session 063. Complex · by design (stable-near-zero real form). Session 100: Sy round-trip verified; `defaultFnEval` folds via `Math.log1p` / `Math.expm1` (LNP1 returns null outside `x > -1`). Session 130 pinned Tagged-of-Vector wrapper-VM composition on LNP1: `LNP1 :v:Vector(0, 0)` → `:v:Vector(0, 0)` (stable-near-zero log per element through outer Tagged). Session 140 pinned EXPM Tagged-of-Vector and Tagged-of-Matrix wrapper-VM composition (`EXPM :e:V[0,0]` → `:e:V[0,0]`, `EXPM :e:M[[0,0],[0,0]]` → `:e:M[[0,0],[0,0]]`) — closes the LNP1/EXPM dual pair on the Tagged-V/M axis (LNP1 was pinned on V in session 130 but EXPM and the M axis on both ops were unpinned). Session 162 closed the **bare-List + Tagged-of-List composition axis** on the LNP1/EXPM dual pair (mirror of session 158 LN/LOG/EXP/ALOG L+T pins lifted onto the LNP1/EXPM duals — but with the **`_exactUnaryLift`-bypass contrast**: LNP1/EXPM bypass `_unaryCx` so the EXACT-mode Integer-stay-exact arm DOES NOT FIRE; Integer input lands as Real per element via `toRealOrThrow`, DISTINCT from session 158 where `LN { Integer(1) Integer(1) }` → `{ Integer(0) Integer(0) }` integer-stay holds). Pins: `LNP1 { Real(0) Real(0) }` → `{ Real(0) Real(0) }` (per-element log1p fold under bare List), `LNP1 { Integer(0) Integer(0) }` → `{ Real(0) Real(0) }` (Integer→Real degrade — contrast with session 158 LN integer-stay), `LNP1 :n:{ Real(0) Real(0) }` → `:n:{ Real(0) Real(0) }` (Tagged-of-List composition outer-tag preservation), `LNP1 { Real(-0.5) Real(0) }` → `{ Real(log1p(-0.5)) Real(0) }` (heterogeneous-output mixed-input pin, distinct values per List position pin per-element wrapper dispatch), and the **LNP1 boundary-throw propagation**: `{ Real(-1) } LNP1` → `Infinite result` propagates through bare `_withListUnary`'s `apply` loop (NOT swallowed, NOT replaced with NaN/null). EXPM symmetric: `EXPM { Real(0) Real(0) }` → `{ Real(0) Real(0) }`, `EXPM { Integer(0) Integer(0) }` → `{ Real(0) Real(0) }`, `EXPM :e:{ Real(0) Real(0) }` → `:e:{ Real(0) Real(0) }`, `EXPM { Real(1) Real(0) }` → `{ Real(expm1(1)) Real(0) }`. Session 162 also closed the **n=0 empty-List + n=1 single-element boundary axis** on the LNP1/EXPM dual pair (mirror of session 160's LN n=0 / n=1 pins lifted onto the duals): `{ } LNP1/EXPM` → `{ }` (empty-shell preservation under bare wrapper), `:l:{ } LNP1/EXPM` → `:l:{ }` (n=0 under Tagged composition), `{ Real(0) } LNP1/EXPM` → `{ Real(0) }` (n=1 singleton — guards against refactor that special-cases n=1 to bare-scalar code path). **Session 236:** Q `·`→`✓` — inner handlers call `toRealOrThrow(v)` which has an explicit `isRational` branch (`Number(v.n)/Number(v.d)`); Rational accepted, result is Real (Q→R degradation). `LNP1 Rational(1,2)` → `Real(log1p(0.5))`; `EXPM Rational(1,2)` → `Real(expm1(0.5))`. **Session 258:** B `·`→`✗` — `toRealOrThrow` rejects BinaryInteger in both LNP1 and EXPM handlers. **Session 263:** U `·`→`✗` — `toRealOrThrow` rejects Unit in both LNP1 and EXPM handlers. |

### Unary — rounding / sign / arg

| Op    | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-------|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| FLOOR | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U (`1.5_m FLOOR` → `1_m`, uexpr preserved). Session 087 added B (no-op — BinInt always integer). Complex ✗ — no total order. Session 110 pinned T transparency (`:x:Real(7.2) FLOOR` → `:x:7` + `:x:Real(-1.5) FLOOR` → `:x:-2` + `:n:Integer(5) FLOOR` → `:n:5` pass-through). Session 120 pinned Q→Z collapse: `FLOOR Rational(7,2)` → `Integer(3)` and `FLOOR Rational(-7,2)` → `Integer(-4)` (round toward -∞); APPROX-mode collapses to Real(3) instead of Integer. Session 125 pinned Tagged-of-List composition (`_withTaggedUnary` ∘ `_withListUnary`): `:lbl:{Real(7.2) Real(-1.5)} FLOOR` → `:lbl:{Real(7) Real(-2)}` (tag re-applied around per-element FLOOR), and the nested form `:lbl:{{1.5 2.5}{3.5 4.5}} FLOOR` → `:lbl:{{1 2}{3 4}}` (recursion through inner Lists). |
| CEIL  | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. Session 087 added B. Session 110 pinned T transparency (`:y:Real(7.2)` → `:y:8`, `:y:Real(-1.5)` → `:y:-1`). Session 120 pinned Q→Z collapse: `CEIL Rational(7,2)` → `Integer(4)` and `CEIL Rational(-7,2)` → `Integer(-3)`. Session 125 pinned Tagged-of-List composition: `:lbl:{Real(7.2) Real(-1.5)} CEIL` → `:lbl:{Real(8) Real(-1)}`. |
| IP    | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. Session 087 added B. Compound uexpr (`m/s^2`) round-trips. Session 110 pinned T transparency (`:z:Real(-7.2) IP` → `:z:-7`, sign-preserving trunc toward zero). Session 120 pinned Q→Z collapse: `IP Rational(7,2)` → `Integer(3)` and `IP Rational(-7,2)` → `Integer(-3)` (trunc toward zero, NOT -4). Session 125 pinned Tagged-of-List composition: `:a:{Real(7.2) Real(-7.2)} IP` → `:a:{Real(7) Real(-7)}` (sign-preserving trunc, per element). |
| FP    | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. Session 087 added B (`FP #Xb` = `#0b`, same base). `FP(-1.8_m)` = `-0.8_m` (sign preserved). Session 110 pinned T transparency (`:w:Real(7.2) FP` → `:w:0.2`). Session 120 pinned Q stay-exact for non-integer Q (`FP Rational(7,2)` → `Rational(1,2)`, `FP Rational(-7,2)` → `Rational(-1,2)` sign preserved); integer-valued Q (e.g. `Rational(6,3)` canonicalises to 2/1) collapses to `Integer(0)` because there's no fractional part. Session 125 pinned Tagged-of-List composition: `:a:{Real(7.2)} FP` → `:a:{Real(0.2)}`. |
| SIGN  | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | SIGN/V = unit direction (bespoke); SIGN/M = per-entry sign. Session 110 pinned T transparency (`:u:Real(-5) SIGN` → `:u:-1`, `:u:Real(0) SIGN` → `:u:0`, `:p:Real(42) SIGN` → `:p:1`). Session 120 pinned Q→Z collapse: `SIGN Rational(-3,4)` → `Integer(-1)`, `SIGN Rational(0,1)` → `Integer(0)`, `SIGN Rational(3,4)` → `Integer(1)`. Session 125 pinned Tagged-of-List composition: `:u:{Real(-3) Real(0) Real(5)} SIGN` → `:u:{Integer(-1) Integer(0) Integer(1)}` (per-element Real→Integer collapse, tag re-applied). **Session 258:** B `·`→`✗` — `_signScalar` isReal/isInteger/isRational/isComplex only; BinaryInteger rejected. **Session 263:** U `·`→`✗` — `_signScalar` isReal/isInteger/isRational/isComplex only; no `isUnit` branch. |
| ARG   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Angle-mode sensitive. Session 110 pinned T transparency (`ARG(:v:Complex(3,4))` → `:v:<atan2(4,3)>`). Session 140 pinned the bare V/M axis on ARG plus the Tagged-of-V composition through the 2-deep-bespoke wrapper shape `_withTaggedUnary(_withListUnary(...))` with bespoke V/M dispatch INSIDE the inner handler (NOT through `_withVMUnary`): `ARG V[Real(3), Real(-2)]` → `V[Real(0), Real(π)]` (Real-axis: non-negative=0, negative=π via atan2 convention); `ARG V[Complex(3,4), Complex(0,1)]` → `V[atan2(4,3), π/2]` (Complex-axis); `ARG M[[Complex(0,1), Real(1)], [Real(-1), Complex(0,-1)]]` → `M[[π/2, 0], [π, -π/2]]` (Matrix-axis with mixed Complex/Real entries); `ARG :v:V[Complex(3,4), Complex(0,1)]` → `:v:V[atan2(4,3), π/2]` (Tagged-of-V composition through 2-deep wrapper — distinct from clusters 1/2's 3-deep wrapper-VM composition; same observable Tagged-preservation behavior). Session 231 pinned Q=✗: `_argScalar` handles isReal and isInteger only; Rational falls through to Bad argument type (`ARG Rational(1,2)` → Bad argument type; `ARG Rational(-1,2)` → Bad argument type). **Session 258:** B `·`→`✗` — `_argScalar` isReal/isInteger only; BinaryInteger rejected. **Session 263:** U `·`→`✗` — `_argScalar` isReal/isInteger only; no `isUnit` branch. |

### Binary — MOD / MIN / MAX

| Op  | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| MOD | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Session 068 confirmed V/M rejection (HP50 AUR §3 scalar-only).  Session 105 pinned Sy round-trip + MOD(10,3)=1, MOD(-7,3)=2 floor-div sign, MOD(n,0) → null. Session 125 pinned `_withListBinary` distribution (`{10 7} {3 2} MOD` → `{1 1}`) and the Rational `Q→R` degradation contract: `MOD Rational(7,2) Rational(1,3)` → `Real(≈1/6)` (NOT stay-exact — distinct from `+ - * / ^` which preserves Q via the rational kind).  Q×Z and Q×R both degrade through `toRealOrThrow`; Complex(im≠0) rejection still wins over Q. Session 130 pinned both-side Tagged-of-List composition: `:a:{10 7} :b:{3 2} MOD` → `{Integer(1), Integer(1)}` (both Tagged unwrap + pairwise List + integer fast path). **Session 258:** B `·`→`✗` — `toRealOrThrow` rejects BinaryInteger; BinInt binary-arith coercion does NOT propagate to MOD. **Session 263:** U `·`→`✗` — `toRealOrThrow` rejects Unit in `_modScalar`. |
| MIN | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same V/M rejection.  Session 105 pinned Sy round-trip + MIN(3,5)=3 fold. Session 125 pinned `_withListBinary` distribution (`{1 5 3} 2 MIN` → `{1 2 2}` Real branch; `{1 5 3} {4 2 8} MAX`-shape pairwise on Integer-typed lists keeps Integer fast path) and the `Q→R` degradation contract: `MIN Rational(1,2) Rational(1,3)` → `Real(0.333)`; `MIN Rational(1,2) Integer(1)` → `Real(0.5)` (operand-order symmetric); `MIN Rational(1,2) Name(X)` → `Symbolic` (Sy lift wins over numeric routing — Q survives in the AST). Session 130 pinned both-side bare-scalar Tagged tag-drop: `:a:Integer(5) :b:Integer(3) MIN` → `Integer(3)` (Tagged unwrap on bare scalars routes through MIN's integer fast path — distinct from the percent family pinned in session 120). **Session 258:** B `·`→`✗` — `_minMaxScalar` requires `isNumber`; BinaryInteger not in isNumber. **Session 263:** U `·`→`✗` — `_minMaxScalar` requires `isNumber`; Unit not in `isNumber`. |
| MAX | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same V/M rejection.  Session 105 pinned Sy round-trip + MAX(3,5)=5 fold. Session 125 pinned `_withListBinary` distribution on Integer-typed lists (`{1 5 3} {4 2 8} MAX` → `{Integer(4) Integer(5) Integer(8)}` — pairwise Integer fast path fires when both operands are Integer) and the `Q→R` degradation: `MAX Rational(1,2) Rational(1,3)` → `Real(0.5)`; `MAX Rational(3,2) Real(0.7)` → `Real(1.5)`; `MAX Rational(1,2) Complex(0,2)` → `'Bad argument type'` (Q does NOT bypass C rejection). **Session 258:** B `·`→`✗` — same `_minMaxScalar` guard as MIN. **Session 263:** U `·`→`✗` — same `_minMaxScalar` guard as MIN. |

### Binary — GCD / LCM

| Op  | R* | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|----|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| GCD | ~  | ✓ | ✗ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Session 064 added N/Sy/L/T. R accepted only when integer-valued (non-integer Real = Bad argument value).  Session 105 pinned Sy round-trip + GCD(12,18)=6, GCD(0,7)=7, GCD(1.5,3) → null fold. Session 125 pinned pairwise `_withListBinary` distribution: `{12 15} {18 10} GCD` → `{6 5}`. Session 130 pinned left-side Tagged-of-List composition: `:a:{12 18} {6 9} GCD` → `{Integer(6), Integer(9)}` (Tagged unwrap + pairwise List + integer fast path). Session 231 pinned Q=✗: `_toBigIntOrThrow` has no isRational branch; Rational → Bad argument type (GCD is integer-domain). **Session 258:** B `·`→`✗` — `_toBigIntOrThrow` has no `isBinaryInteger` branch; BinaryInteger rejected. **Session 263:** U `·`→`✗` — `_toBigIntOrThrow` has no `isUnit` branch; Unit rejected. |
| LCM | ~  | ✓ | ✗ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same as GCD.  Session 105 pinned Sy round-trip + LCM(4,6)=12, LCM(0,n)=0 fold. Session 125 pinned scalar×List distribution: `4 {6 9} LCM` → `{12 36}`. Session 130 pinned right-side Tagged-of-List composition: `4 :lbl:{6 9} LCM` → `{Integer(12), Integer(36)}` (scalar × Tagged-List broadcast — same answer as the bare-list pin via the Tagged-unwrap path). Session 231 pinned Q=✗: `_toBigIntOrThrow` rejects Rational; LCM is integer-domain. **Session 258:** B `·`→`✗` — same `_toBigIntOrThrow` guard as GCD. **Session 263:** U `·`→`✗` — same `_toBigIntOrThrow` guard as GCD. |

*`~` on Real = accepted only when `Number.isInteger(value)`.

### Binary — percent family

| Op  | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| %   | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Session 064 added L/T; session 072 flipped V/M from blank to ✗ (HP50 AUR §3-1 scalar-only, mirrors MOD/MIN/MAX audit in s068). Session 120 pinned `_withTaggedBinary` tag-drop (either-side-or-both unwrap-and-drop, mirror of the binary-arith pin in session 115 Cluster 1) plus the V/M ✗ rejection plus List-broadcast on the percent base (`{80 40} 25 %` → `{20 10}`). Session 130 pinned the Tagged-of-List composition through `_withTaggedBinary(_withListBinary(handler))`: `:lbl:{80 40} 25 %` → `{Real(20), Real(10)}` (left-Tagged-of-List + scalar broadcast); `:a:{80 40} :b:{25 50} %` → `{Real(20), Real(20)}` (both-side Tagged + pairwise List); `{:x:80 :y:40} 25 %` rejects with 'Bad argument type' (inner-Tagged-inside-List has no unwrapper at the binary scalar handler — `_withListBinary`'s recursive `apply` calls the inner handler directly, NOT back through the wrapped function). Session 231 pinned Q=✓: `toRealOrThrow` handles isRational (Number(n)/Number(d)); result is Real (Q→R degradation). `Rational(1,2) Real(50) %` → `Real(0.25)`. **Session 258:** B `·`→`✗` — `toRealOrThrow` rejects BinaryInteger in percent handler. **Session 263:** U `·`→`✗` — `toRealOrThrow` rejects Unit in percent handler. |
| %T  | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same. Infinite result on base = 0 preserved. Session 120 pinned both-side Tagged tag-drop. Session 130 pinned right-side Tagged-of-List composition: `50 :p:{25 75} %T` → `{Real(50), Real(150)}` (right-Tagged + scalar × List broadcast). Session 231 pinned Q=✓: `Rational(1,4) Real(1) %T` → `Real(400)` (Q→R degradation). **Session 258:** B `·`→`✗` — same `toRealOrThrow` path as %. **Session 263:** U `·`→`✗` — same `toRealOrThrow` path as `%`. |
| %CH | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same. Session 120 pinned both-side Tagged tag-drop. Session 231 pinned Q=✓: `Rational(1,2) Real(1) %CH` → `Real(100)` (Q→R degradation). **Session 258:** B `·`→`✗` — same `toRealOrThrow` path as %. **Session 263:** U `·`→`✗` — same `toRealOrThrow` path as `%`. |

### Binary arithmetic — `+` / `-` / `*` / `/` / `^`

Per-op detail rows for the five core arithmetic operators.  These were
previously collapsed into the compact "Reference rows" table (flagged for
pull-apart since session 063; promoted to per-op rows session 221).

**BinInt masking contract (all five ops):** `_binaryMathMixed` applies a
2^wordsize mask to the result whenever either operand is a BinaryInteger.
`wordsize` is read from `state.stws` at eval time.  The BinInt *base*
(hex/dec/oct/bin) is cosmetic; it does not change numeric value or masking.
Negative BinInt payloads are treated as two's-complement in `[0, 2^w)`.

**Unit dim-algebra contract (`+` / `-` / `*` / `/` only):** Unit operands
go through `evalUnitExpr`; the result unit is computed by dimensional algebra
(`+`/`-` require compatible dimensions; `*`/`/` produce the product/quotient
unit).

**Tagged binary tag-drop contract:** On the binary arithmetic surface, Tagged
wrappers are transparent — the tag is NOT preserved on the output.  This
differs from the unary surface (where `_withTaggedUnary` preserves the tag).
Pins: session 068 (T scalar), session 135 (T+V / T+M broadcast).

| Op | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|----|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| `+` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | String+String = concatenation; Unit dim-algebra (compatible dims only); V+V element-wise (same length, rejects dimension mismatch). **BinInt (session 110):** `_binaryMathMixed('+')` — BinInt base wins; Real coerced trunc-toward-zero; negative results wrap via 2^w mask. **Rational (session 110/135):** R+Z and Q×V/Q×M broadcast — Q×R-element → Real per element; Q×Q-element stays-exact with d=1 collapse. **Tagged (session 068/135):** binary tag-drop on all left/right/both-Tagged inputs; `:v:Vec[1,2] + Integer(1)` → un-Tagged `Vec[Real(2),Real(3)]`; `:a:Vec + :b:Vec` → un-Tagged Vec; V+V dimension-mismatch survives Tagged unwrap; inner-Tagged-inside-Vector rejects. |
| `-` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | String ✗ (no subtraction on String). Unit dim-algebra (compatible dims only). **BinInt (session 110):** `_binaryMathMixed('-')`. **Rational (session 135):** `Vec[Real(3),Real(4)] - Rational(1,2)` → `Vec[Real(2.5),Real(3.5)]` (V−Q broadcast, sign-correct subtraction). **Tagged (session 068/135):** binary tag-drop; `:v:Vec[5,7] - Integer(1)` → un-Tagged `Vec[Real(4),Real(6)]` (left-Tagged-V − scalar). |
| `*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | V·V = dot product (collapses V→R); M·M = matrix multiply; Real×String = string repeat (String-rep). **BinInt (session 110):** `_binaryMathMixed('*')` — `ws=8 Real(300) * #2h → #58h` (600 masked to 8 bits); `#20h * Real(2.7) → #40h` (trunc coerce). **Rational (session 135):** Q×V/Q×M scalar-broadcast — `Vec[Real(2),Real(4)] * Q(1/2)` → `Vec[Real(1),Real(2)]`; `Mat[Z(2),Z(4)|Z(6),Z(8)] * Q(1/2)` → `Mat[Z(1),Z(2)|Z(3),Z(4)]` (Z×Q d=1 collapse per element). **Tagged (session 068/135):** binary tag-drop on arithmetic surface — bespoke V·V dot product through tag-drop (`:a:Vec[1,2] * :b:Vec[3,4]` → `Real(11)`; kind change V→R survives wrapper); matmul through tag-drop (`:m:Mat * Mat` → un-Tagged Matrix). |
| `/` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | String ✗. Unit dim-algebra (quotient unit). **BinInt (session 110):** `binIntBinary` — `#5h / Integer(0)` → 'Division by zero' (guarded before mask). **Rational (session 135):** `Vec[Q(1,1),Q(2,1)] / Q(1/2)` → `Vec[Integer(2),Integer(4)]` (Q/Q stay-exact + d=1 collapse per element). **Tagged (session 068/135):** binary tag-drop — `Vec[8,10] / :s:Integer(2)` → un-Tagged `Vec[Real(4),Real(5)]` (right-Tagged-scalar divisor). |
| `^` | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | BinInt ✗ for the base (B as *exponent* is accepted only if coerced to Integer by the dispatch chain; see session 110). Vector ✗ as base (no element-wise `^` on the V axis; `^` as scalar-broadcast). M^n = repeated matmul for integer n ≥ 0 (M must be square). **BinInt exponent (session 110):** `_modPow` — `ws=8 #2h ^ 10` → `#0h` (1024 masked to 8 bits = 0). **Rational (session 115):** Q^Z stay-exact — `Rational(3,2)^Integer(3)` → `Rational(27,8)`; `Rational(7,11)^Integer(0)` → `Integer(1)` (d=1 collapse); fractional Q exponent in EXACT mode → Symbolic. **Tagged (session 068):** binary tag-drop. |

### Reference rows — unary sign/complex ops (NEG / CONJ / RE / IM)

The `+` / `-` / `*` / `/` / `^` arithmetic family was promoted to per-op
rows in session 221.  This table retains the four unary ops that were
originally grouped with them.

| Op   | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| NEG  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Session 068 added T. Session 130 pinned bespoke-Matrix Tagged composition: `NEG :m:Matrix([[1,-2],[3,-4]])` → `:m:Matrix([[-1,2],[-3,4]])` (NEG has its own bespoke V/M branch — does NOT use `_withVMUnary` — but the outer `_withTaggedUnary(_withListUnary(...))` composes the same way; tag preserved across element-wise Matrix dispatch). |
| CONJ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 068 added T. Session 100: Sy round-trip verified (KNOWN_FUNCTIONS + `defaultFnEval` fold `CONJ(x) = x` on Real). Session 140 pinned Tagged-of-V/M composition through the 2-deep-bespoke wrapper shape `_withTaggedUnary(_withListUnary((s) => bespoke V/M dispatch))`: `CONJ :z:V[Real(5), Complex(3,4), Real(-1)]` → `:z:V[Real(5), Complex(3,-4), Real(-1)]` (per-element `_conjScalar` flips Complex.im sign, Real stays Real; outer tag preserved + V kind preserved). `CONJ :m:M[[Complex(1,2), Complex(3,4)], [Real(5), Complex(6,-7)]]` → `:m:M[[Complex(1,-2), Complex(3,-4)], [Real(5), Complex(6,7)]]` (Matrix-axis composition; outer tag preserved + M kind preserved across per-entry CONJ). Session 226 filed Q=✗ (rejection). Session 231 widened `_conjScalar` with `isRational(v)` branch (return v unchanged); flipped Q ✗→✓. `CONJ Rational(1,2)` → `Rational(1,2)`; `CONJ Rational(-3,4)` → `Rational(-3,4)`. **Session 258:** B `·`→`✗` — `_conjScalar` isReal/isInteger/isRational/isComplex/isName/isSym dispatch; no `isBinaryInteger` branch. **Session 263:** U `·`→`✗` — `_conjScalar` no `isUnit` branch; Unit falls through to final throw. **Session 267:** S `·`→`✗` — `_conjScalar` dispatch: isReal/isInteger/isRational/isComplex/isName/isSym only; no `isString` branch. |
| RE   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 068 added T. Session 100: Sy round-trip verified (`defaultFnEval` fold `RE(x) = x` on Real). Session 140 pinned Tagged-of-Matrix composition through the 2-deep-bespoke wrapper shape: `RE :m:M[[Complex(1,2), Complex(3,4)], [Real(5), Complex(6,-7)]]` → `:m:M[[Real(1), Real(3)], [Real(5), Real(6)]]` (every entry collapses to Real-only; M kind preserved across the per-entry Complex→Real collapse — closes the kind-preservation contract on the Matrix axis when EVERY entry undergoes the Complex→Real collapse). Session 142 (carried by unit-tests lane) pinned Tagged-of-Symbolic composition through the same 2-deep wrapper (`RE :v:Symbolic(X)` → `:v:Symbolic(RE(X))`) and the V-axis inner-Tagged-inside-Vector rejection (`Vector(:x:Complex(3,4)) RE` → 'Bad argument type'; `_reScalar` not Tagged-aware). Session 145 closed the M-axis inner-Tagged-inside-Matrix rejection: `Matrix([[:x:Complex(3,4)]]) RE` → 'Bad argument type'; `Matrix([[Real(5), :x:Complex(3,4)]]) RE` rejects at row[0][1] — pins column-iteration reaches the per-element rejection (rejection fires at every entry-position, not only (0,0) — closes the 4-op × 2-axis ARG/CONJ/RE/IM inner-Tagged-rejection grid that session 142 left half-open). Session 226 filed Q=✗ (rejection). Session 231 widened `_reScalar` with `isRational(v)` branch (return v unchanged); flipped Q ✗→✓. `RE Rational(1,2)` → `Rational(1,2)`. **Session 258:** B `·`→`✗` — `_reScalar` same dispatch structure as `_conjScalar`; BinaryInteger rejected. **Session 263:** U `·`→`✗` — `_reScalar` no `isUnit` branch. **Session 267:** S `·`→`✗` — `_reScalar` same dispatch as `_conjScalar`; no `isString` branch. |
| IM   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 068 added T. Session 100: Sy round-trip verified (`defaultFnEval` fold `IM(x) = 0` on Real). Session 140 pinned Tagged-of-Vector composition through the 2-deep-bespoke wrapper shape: `IM :z:V[Complex(1,2), Complex(3,-4), Real(5)]` → `:z:V[Real(2), Real(-4), Real(0)]` (per-entry imaginary part — Complex(re,im)→Real(im); Real(x)→Real(0) since Real has no imaginary part; outer tag preserved + V kind preserved across per-entry collapse). Session 142 (carried by unit-tests lane) pinned Tagged-of-Symbolic composition (`IM :v:Symbolic(X)` → `:v:Symbolic(IM(X))`) and the V-axis inner-Tagged-inside-Vector rejection (`Vector(:x:Complex(3,4)) IM` → 'Bad argument type'). Session 145 closed the M-axis inner-Tagged-inside-Matrix rejection: `Matrix([[:x:Complex(3,4)]]) IM` → 'Bad argument type'; `Matrix([[Real(5)],[:x:Complex(3,4)]]) IM` rejects at row[1][0] — pins multi-row iteration also reaches the per-element rejection (closes the 4-op × 2-axis ARG/CONJ/RE/IM inner-Tagged-rejection grid). Session 226 filed Q=✗ (rejection). Session 231 widened `_imScalar` with `isRational(v)` branch (return Integer(0n)); flipped Q ✗→✓. `IM Rational(1,2)` → `Integer(0)`. **Session 258:** B `·`→`✗` — `_imScalar` same dispatch; Integer(0) branch not reached for BinaryInteger. **Session 263:** U `·`→`✗` — `_imScalar` no `isUnit` branch. **Session 267:** S `·`→`✗` — `_imScalar` same dispatch; no `isString` branch. |

### Real decomposition / HP50 special-function family (XPON / MANT / TRUNC / ZETA / LAMBERT / PSI)

Per-row table for the ops added to `KNOWN_FUNCTIONS` this session that
didn't yet have a row.  All six lift Name / Symbolic operands to
`Symbolic(AstFn(..., [...]))` from the stack (that code path has been
in place since `ops.js` implemented them); the Sy column here is
about *round-trip through the entry-line parser*, not "does the
handler lift".

| Op      | R | Z | Q | C | N | Sy | L | V | M | T | Notes |
|---------|---|---|---|---|---|----|---|---|---|---|-------|
| XPON    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Decimal exponent.  `XPON(0) = 0` (matches HP50 AUR).  Complex ✗ (HP50 AUR real-only).  Session 100 closed Sy round-trip.  Session 120 pinned Q rejection: `XPON Rational(1,2)` → 'Bad argument type' (Q not in XPON domain; consistent with FACT/MANT). **Ship-prep 2026-04-25 audit:** L/V/M/T were carried as ✓ but `register('XPON', …)` was bare — no wrapper — and threw `Bad argument type` on List/Vector/Matrix/Tagged.  Downgraded to blank (candidate); see `utils/@probe-special-fns-vm.mjs`.  **Session 187:** wrapped in `_withTaggedUnary(_withListUnary(_withVMUnary(…)))` — same 3-deep composition as FACT/LNP1/EXPM.  Pins: n=0 empty-List (bare + T+L), n=1 bare List `{ Real(100) } → { Real(2) }`, n=2 heterogeneous bare List + Tagged-of-List `{ Real(100) Real(10) } → { Real(2) Real(1) }`, Vector `[ Real(100) Real(1000) ] → [ Real(2) Real(3) ]`, Matrix `[[ Real(100) Real(10) ]] → [[ Real(2) Real(1) ]]`, scalar Tagged `:x:Real(250) → :x:Real(2)`.  +8 assertions. |
| MANT    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Mantissa in `[1,10)` (or 0 at x=0).  Pair with XPON — `x = MANT(x) · 10^XPON(x)`.  Session 100 closed Sy round-trip.  Session 120 pinned Q rejection: `MANT Rational(1,2)` → 'Bad argument type'. **Ship-prep 2026-04-25 audit:** L/V/M/T downgraded — same finding as XPON; `register('MANT', …)` was bare, throws on List/Vector/Matrix/Tagged.  **Session 187:** wrapped in `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`.  Pins: n=0 empty-List (bare + T+L), n=1 bare List `{ Real(250) } → { Real(2.5) }`, n=2 heterogeneous bare List + Tagged-of-List `{ Real(250) Real(10) } → { Real(2.5) Real(1) }`, Vector `[ Real(2500) Real(100) ] → [ Real(2.5) Real(1) ]`, Matrix `[[ Real(2500) ]] → [[ Real(2.5) ]]`.  +7 assertions. |
| TRUNC   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | 2-arg: `TRUNC(x, n)` truncates to `n` decimals.  `arity: 2` in KNOWN_FUNCTIONS — 1-arg form rejected at parse time.  `defaultFnEval` left unset (no constant fold yet — would need `toFixed`-style logic). Session 100 closed Sy round-trip for the 2-arg form.  Session 105 pinned the arity-2 rejection for both the 1-arg form `TRUNC(X)` and the 3-arg form `TRUNC(X, 3, 4)` (parseAlgebra emits "TRUNC expects 2 argument(s), got N"). **Ship-prep 2026-04-25 audit:** L/V/M/T downgraded — `_truncOp()` handler dispatches scalar branches only; `TRUNC(Vector(R,R), Integer(1))` and the L/M/T variants threw `Bad argument type` (verified `utils/@probe-trunc-vm.mjs`). **Session 196:** Wrapped with `_withTaggedBinary(_withListBinary(_truncOp()))` — closes L and T axes.  V/M remain ✗ (no `_withVMBinary`; mirrors MOD/MIN/MAX policy).  Binary tag-drop convention: Tagged inputs are unwrapped and tag is NOT re-applied to result.  +8 `session196:` pins in `tests/test-types.mjs` (5464→5472): n=0 bare-List passthrough; n=0 Tagged-of-List (tag dropped); n=1 bare-List single-element value-precise; n=2 bare-List heterogeneous `{Real(1.567) Real(2.891)} Integer(1)` → `{Real(1.5) Real(2.8)}`; n=2 Tagged-of-List tag-dropped; scalar Tagged tag-dropped `Real(3.5)`; pairwise L×L `{Real(1.99) Real(2.345)} {Integer(0) Integer(2)}` → `{Real(1) Real(2.34)}`; Vector rejection guard. **Session 236:** Q (x operand) `·`→`✗` — `_roundingOp` checks `if (!isReal(xv) && !isInteger(xv)) throw 'Bad argument type'`; Rational x rejected. `Rational(3,2) Integer(1) TRUNC` → `'Bad argument type'`. |
| ZETA    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Riemann ζ.  Arity 1.  No constant fold (would need CAS).  Session 100 closed Sy round-trip — stays symbolic at numeric args.  **Session 212:** Z/L/V/M `·`→`✓` — documentation lag; `_zetaScalar` accepts `isInteger(v)` and the op has been registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))` since the op was first wrapped.  +5 pins: Z `Integer(0)`→`Real(-0.5)` (ζ(0)=-1/2 exact); L-empty passthrough; L `{Integer(2)}`→`{Real(ζ(2))}`; V `[Integer(2) Integer(0)]`→`[Real(ζ(2)) Real(-0.5)]`; M `[[Integer(2)]]`→`[[Real(ζ(2))]]`. **Session 236:** Q `·`→`✗` — `_zetaScalar` uses `isInteger/isReal` only; Rational → null → `Bad argument type`. **Session 267:** C `·`→`✗` — same `isInteger/isReal` guard; Complex → null → `Bad argument type`. |
| LAMBERT | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Principal branch W₀.  Arity 1.  No constant fold (series/Halley in a future session).  Session 100 closed Sy round-trip.  **Session 212:** Z/L/V/M `·`→`✓` — documentation lag; `_lambertScalar` accepts `isInteger(v)` and the op has been registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))` since the op was first wrapped.  +5 pins: Z `Integer(0)`→`Real(0)` (W(0)=0 exact branch); L-empty passthrough; L `{Integer(0)}`→`{Real(0)}`; V `[Integer(0) Integer(1)]`→`[Real(0) Real(Ω)]` (Ω≈0.5671); M `[[Integer(1)]]`→`[[Real(Ω)]]`. **Session 236:** Q `·`→`✗` — `_lambertScalar` uses `isInteger/isReal` only; Rational → null → `Bad argument type`. **Session 267:** C `·`→`✗` — same `isInteger/isReal` guard; Complex → null → `Bad argument type`. |
| PSI     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Digamma / polygamma.  Variadic: `PSI(x)` = ψ(x), `PSI(x, n)` = ψ⁽ⁿ⁾(x).  No `arity` key in KNOWN_FUNCTIONS — both shapes accepted.  No constant fold.  Session 100 closed Sy round-trip for both shapes.  Session 105 pinned the variadic shape via direct `defaultFnEval('PSI', [1])` and `defaultFnEval('PSI', [1, 2])` null-fold guards.  **Session 216:** L/V/M `·`→`✓` — documentation lag; the 1-arg digamma handler has bespoke `isList` / `isVector` / `isMatrix` branches (same shape as GAMMA/LNGAMMA).  T=✓ reflects scalar-Tagged only — T+L/T+V/T+M throw (bespoke `isTagged` branch calls `_psiScalar` directly on `v.value`).  +5 pins: L-empty passthrough; L `{Integer(1)}`→`{Real(ψ(1))}` (ψ(1)=−γ, tol 1e-12); L `{Integer(1) Integer(2)}`→`{Real(ψ(1)) Real(ψ(2))}` heterogeneous; V `[Integer(1) Integer(2)]`→`[Real(ψ(1)) Real(ψ(2))]`; M `[[Integer(1)]]`→`[[Real(ψ(1))]]`. **Session 236:** Q `·`→`✗` — `_psiScalar` uses `isInteger/isReal` only; Rational → null → `Bad argument type`. **Session 267:** C `·`→`✗` — same `isInteger/isReal` guard; Complex → null → `Bad argument type`. |

### Special-function / stat-dist family (UTPC / UTPF / UTPT / BETA / ERF / ERFC / GAMMA / LNGAMMA / HEAVISIDE / DIRAC)

These ops already had stack-side handlers that lift Name / Symbolic
operands to `Symbolic(AstFn(..., [...]))` and entries in
`KNOWN_FUNCTIONS`, but the entry-line round-trip
(`parseEntry → format → parseEntry`) and the `defaultFnEval` fold
contract had no direct assertion before session 105.  The `Sy`
column here is about *round-trip through the parser*, not "does
the handler lift".  Numeric evaluation lives on the stack side for
all of these — Lanczos gamma / incomplete-beta / erf table / shifted-
step / impulse — so the simplify-time fold stays conservative.

| Op        | R | Z | Q | C | N | Sy | L | V | M | T | Notes |
|-----------|---|---|---|---|---|----|---|---|---|---|-------|
| HEAVISIDE | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Step function.  Session 105 pinned Sy round-trip + folds: HEAVISIDE(2)=1, HEAVISIDE(0)=1 (HP50 convention: right-continuous at 0), HEAVISIDE(-1)=0. **Ship-prep 2026-04-25 audit:** L/V/M/T downgraded — bare handler.  **Session 191:** wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))` — L/V/M/T promoted to ✓.  +8 pins in `tests/test-types.mjs`: n=0 bare+T+L, n=1 bare {Real(2)}→{Real(1)}, n=2 heterogeneous {2,-1}→{1,0} bare+T+L, Vector [1,-1]→[1,0], Matrix [[1,-1]]→[[1,0]], scalar Tagged :x:Real(3)→:x:Real(1). **Session 240:** Q `·`→`✗` — scalar handler checks isReal/isInteger/isBinaryInteger/isSym only; Rational falls through to throw. **Session 268:** C `·`→`✗` — same scalar arm (isReal/isInteger/isBinaryInteger/isSym only); Complex falls through to the final throw. |
| DIRAC     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Impulse δ(x).  At non-zero real, folds to 0; at x=0 leaves symbolic (distribution).  Session 105 pinned `DIRAC(X-1)` round-trip + `DIRAC(3)=0`, `DIRAC(0)` → null. **Ship-prep 2026-04-25 audit:** L/V/M/T downgraded — bare handler.  **Session 191:** wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))` — L/V/M/T promoted to ✓.  +8 pins in `tests/test-types.mjs`: n=0 bare+T+L, n=1 bare {Real(0)}→{Symbolic(DIRAC(0))} (at-zero path through wrapper), n=2 bare+T+L non-zero, Vector, Matrix, scalar Tagged :x:Real(5)→:x:Real(0). **Session 240:** Q `·`→`✗` — same isReal/isInteger/isBinaryInteger/isSym-only pattern; Rational throws. **Session 267:** C `·`→`✗` — DIRAC handler: `isReal/isInteger/isBinaryInteger/isSym` only; Complex not in any accepted branch → `Bad argument type`. |
| GAMMA     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Γ(x).  Integer fold only (GAMMA(n) = (n-1)! for n ≥ 1, n ≤ 171); non-integer / non-positive / overflow → null (leave symbolic).  Session 105 pinned Sy round-trip + GAMMA(5)=24, GAMMA(0)→null, GAMMA(0.5)→null, GAMMA(180)→null.  **Session 200:** L/V/M cells promoted `·`→`✓` — already wrapped as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`; matrix was stale.  +6 integer-exact pins: n=0 bare-List `{}`→`{}`; n=0 T+L `:g:{}`→`:g:{}`; n=2 bare-List `{Integer(1) Integer(5)}`→`{Integer(1) Integer(24)}`; n=2 T+L tag-preserved; V `[Integer(1) Integer(5)]`→`[Integer(1) Integer(24)]`; M `[[Integer(2) Integer(3)]]`→`[[Integer(1) Integer(2)]]`. **Session 240:** Q `·`→`✗` — `_gammaScalar`: `x = isInteger ? … : isReal ? … : null`; Rational → null → Bad argument type. **Session 268:** C `·`→`✗` — same `isInteger/isReal/null` guard; Complex → null → Bad argument type. |
| LNGAMMA   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ln Γ(x).  No fold (Lanczos lives on the stack).  Session 105 pinned Sy round-trip + null fold.  **Session 200:** L/V/M cells promoted `·`→`✓` — same wrapper shape as GAMMA; matrix was stale.  +4 pins using lngamma(2)=0 exact-fp identity: n=0 bare-List `{}`→`{}`; M `[[Integer(2)]]`→`[[Real(0)]]`; T scalar `:h:Integer(2)`→`:h:Real(0)`; V `[Integer(2)]`→`[Real(0)]`. **Session 240:** Q `·`→`✗` — `_lngammaScalar`: same isInteger/isReal/null pattern; Rational → Bad argument type. **Session 268:** C `·`→`✗` — same isInteger/isReal/null pattern; Complex → Bad argument type. |
| ERF       | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Error function (registered as `erf`).  No simplify-time fold.  Session 105 pinned Sy round-trip + null fold.  **Session 200:** L/V cells promoted `·`→`✓` — already wrapped as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`; matrix was stale.  +2 pins using erf(0)=Real(0) zero special-case: bare-List `{Integer(0)}`→`{Real(0)}`; V `[Integer(0)]`→`[Real(0)]`.  **Session 208:** M `·`→`✓` — same documentation lag; bespoke `rows.map(r => r.map(_erfScalar))` branch confirmed in handler.  +1 pin: `[[Integer(0)]]`→`[[Real(0)]]` (erf(0)=0 zero special-case; Matrix kind preserved). **Session 240:** Q `·`→`✗` — `_erfScalar`: `x = isInteger ? … : isReal ? … : null`; Rational → null → Bad argument type. **Session 244:** Z `·`→`✓` — documentation lag; `_erfScalar` has `const x = isInteger(v) ? Number(v.value) : …` branch; `erf(Integer(0))` → `Real(0)` (zero special-case); `erf(Integer(1))` → `Real(erf(1))` ≈ 0.8427 (non-zero integer path). |
| ERFC      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | Complementary erf (registered as `erfc`).  Same as ERF.  Session 105 pinned Sy round-trip + null fold.  **Session 200:** +1 T re-verification pin `:e:Integer(0) erfc`→`:e:Real(1)` (erfc(0)=1 zero special-case; T was already ✓).  **Session 204:** L/V/M `·`→`✓` — erfc handler has same bespoke V/M branches + `_withListUnary` wrapper as erf; pins added for bare-List n=0/n=1/n=2-heterogeneous, T+L n=0/n=1, Vector, Matrix (all via `_erfcScalar(Integer(0))=Real(1)` zero special-case). **Session 240:** Q `·`→`✗` — `_erfcScalar`: same isInteger/isReal/null pattern; Rational → Bad argument type. **Session 244:** Z `·`→`✓` — documentation lag; `_erfcScalar` has same `isInteger` branch; `erfc(Integer(0))` → `Real(1)` (zero special-case); `erfc(Integer(2))` → `Real(erfc(2))` ≈ 0.00468 (positive-x integer path via `_regGammaQ(0.5, 4)`). **Session 267:** C `·`→`✗` — `_erfcScalar`: same isInteger/isReal/null pattern; Complex → `Bad argument type`. |
| BETA      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | Arity 2 — B(a, b).  No simplify-time fold (needs log-gamma).  Session 105 pinned Sy round-trip + null fold. **Session 240:** Q `·`→`✗` — `_betaScalar`: `aNum = isInteger ? … : isReal ? … : null`; Rational a-arg → null → Bad argument type (b-arg not reached). **Session 244:** L `·`→`✓` — documentation lag; registered as `_withTaggedBinary(_withListBinary(handler))`; `{Integer(1) Integer(2)} {Integer(1) Integer(3)} Beta` → `{Real(B(1,1)) Real(B(2,3))}` = `{Real(≈1) Real(≈1/12)}`; pairwise list dispatch confirmed. V `·`→`✗` / M `·`→`✗` — no `_withVMBinary` wrapper; `_betaScalar` receives Vector/Matrix as the `a` arg → `aNum = null` → Bad argument type. **Session 267:** C `·`→`✗` — `_betaScalar`: Complex a-arg → `aNum = null` → `Bad argument type`. |
| UTPC      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | Upper-tail χ² CDF.  Arity 2 — UTPC(ν, x).  No simplify-time fold (needs incomplete gamma).  Session 105 pinned Sy round-trip + null fold. **Session 240:** Q `·`→`✗` — local `asReal` helper only accepts Integer and Real; Rational → Bad argument type. **Session 244:** Z `·`→`✓` — documentation lag; `asReal` has `if (isInteger(v)) return Number(v.value)` branch; `UTPC(Integer(3), Integer(0))` → `Real(1)` (X≤0 exact branch); `UTPC(Integer(2), Integer(2))` → `Real(≈exp(−1))` (tol 1e-10). **Session 248:** L `✗`→`✓` / T (scalar) `·`→`✓` — extracted `_utpcScalar(nu, x)` helper and wrapped with `_withTaggedBinary(_withListBinary(…))`; V `·`→`✗` / M `·`→`✗` — no `_withVMBinary`; mirrors BETA policy. Pins: n=0 empty-list passthrough; n=1 `{Z(2)} {Z(0)}` → `{R(1)}` (X≤0 branch); n=2 pairwise `{Z(2) Z(5)} {Z(0) Z(2)}` → `{R(1) R(≈0.849)}` (tol 1e-6); T+L `:nu:{Z(2)} :x:{Z(0)}` → `{R(1)}` (tag dropped); scalar Tagged `:n:Z(2) :x:Z(0)` → `R(1)` (tag dropped). **Session 267:** C `·`→`✗` — `asReal` helper rejects Complex (isInteger/isReal only); Complex nu-arg → `Bad argument type`. |
| UTPF      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✗ | ✗ | ✗ | ✓ | Upper-tail F CDF.  Arity 3 — UTPF(ν₁, ν₂, x).  No simplify-time fold (needs incomplete beta).  Session 105 pinned Sy round-trip + null fold. **Session 240:** Q `·`→`✗` — same `asReal` helper (shared with UTPC/UTPT); Rational → Bad argument type. **Session 244:** Z `·`→`✓` — same `asReal` accepts Integer; `UTPF(Integer(2), Integer(2), Integer(1))` → `Real(0.5)` (w=d/(d+nF)=0.5; I₀.₅(1,1)=0.5; tol 1e-12). L `·`→`✗` / V `·`→`✗` / M `·`→`✗` — bare handler; List/Vector rejection confirmed. **Session 267:** C `·`→`✗` — same `asReal` helper; Complex v1-arg → `Bad argument type`. |
| UTPT      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | Upper-tail Student-t CDF.  Arity 2 — UTPT(ν, x).  No simplify-time fold.  Session 105 pinned Sy round-trip + null fold. **Session 240:** Q `·`→`✗` — same `asReal` helper; Rational → Bad argument type. **Session 244:** Z `·`→`✓` — same `asReal` accepts Integer; `UTPT(Integer(5), Integer(0))` → `Real(0.5)` (t=0 exact branch). **Session 248:** L `✗`→`✓` / T (scalar) `·`→`✓` — extracted `_utptScalar(nu, t)` helper and wrapped with `_withTaggedBinary(_withListBinary(…))`; V `·`→`✗` / M `·`→`✗` — no `_withVMBinary`. Pins: n=0 empty-list passthrough; n=1 `{Z(5)} {Z(0)}` → `{R(0.5)}` (t=0 exact branch); n=2 pairwise `{Z(5) Z(10)} {Z(0) Z(0)}` → `{R(0.5) R(0.5)}`; T+L `:nu:{Z(5)} :t:{Z(0)}` → `{R(0.5)}` (tag dropped); scalar Tagged `:n:Z(5) :t:Z(0)` → `R(0.5)` (tag dropped). **Session 267:** C `·`→`✗` — same `asReal` helper; Complex nu-arg → `Bad argument type`. |

### Combinatorial / integer-divmod family (COMB / PERM / IQUOT / IREMAINDER / XROOT)

Arity-2 numeric ops.  All have `defaultFnEval` folds that accept only
integer-valued Reals (except XROOT, which accepts non-negative real
radicand with non-zero index); out-of-domain cases return `null` so
the simplifier leaves the expression symbolic rather than injecting
NaN.

| Op         | R* | Z | Q | C | N | Sy | L | V | M | T | S | Notes |
|------------|----|---|---|---|---|----|---|---|---|---|---|-------|
| COMB       | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Binomial coefficient C(n, m).  Rejects m > n, negative args.  Session 105 pinned Sy round-trip + COMB(5,2)=10, COMB(5,0)=1, COMB(5,6)→null, COMB(-1,2)→null. Session 125 pinned all three `_withListBinary` distribution axes (scalar×List `5 COMB {0 2 5}` → `{1 10 1}`; List×scalar `{5 6 7} 2 COMB` → `{10 15 21}`; pairwise `{5 6} {2 3} COMB` → `{10 20}`) plus the size-mismatch rejection (`{5} {2 3} COMB` → `'Invalid dimension'`). Session 130 pinned left-side Tagged-of-List composition: `:lbl:{5 6} 2 COMB` → `{Integer(10), Integer(15)}` (Tagged unwrap + List × scalar broadcast through the combinatorial path). **Session 240:** Q `·`→`✗` — `_combPermArgs` guard: `!isInteger(a) && !isReal(a) → throw`; Rational rejected even when integer-valued (e.g. `Rational(5,1)`). **Session 267:** C `·`→`✗`, V `·`→`✗`, M `·`→`✗` — same `_combPermArgs` guard rejects Complex, Vector, and Matrix (no `_withVMBinary` wrapper); representative V and M pins added (PERM/IQUOT/IREMAINDER share the same rejection path). **Session 269:** S `·`→`✗` — `_combPermArgs` guard `!isInteger(a) && !isReal(a) → throw` rejects String; representative S pin added (PERM/IQUOT/IREMAINDER share the guard). |
| PERM       | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Falling factorial P(n, m).  Same rejections as COMB.  Session 105 pinned Sy round-trip + PERM(5,2)=20, PERM(5,0)=1, PERM(5,6)→null. Session 125 pinned List×scalar distribution: `{5 6} 2 PERM` → `{20 30}`. **Session 240:** Q `·`→`✗` — same `_combPermArgs` guard as COMB. **Session 267:** C `·`→`✗`, V `·`→`✗`, M `·`→`✗` — same `_combPermArgs` guard; pins added (representative for COMB path). **Session 269:** S `·`→`✗` — same `_combPermArgs` guard as COMB rejects String. |
| IQUOT      | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Integer division (truncates towards 0).  Session 105 pinned Sy round-trip + IQUOT(17,5)=3, IQUOT(-17,5)=-3, IQUOT(10,0)→null. Session 125 pinned pairwise distribution: `{17 20} {5 3} IQUOT` → `{3 6}`. **Session 240:** Q `·`→`✗` — `_intQuotientArg`: only isInteger and isReal branches; Rational → throw. **Session 267:** C `·`→`✗`, V `·`→`✗`, M `·`→`✗` — same `_intQuotientArg` guard rejects Complex/Vector/Matrix (pins added; IREMAINDER shares same guard). **Session 269:** S `·`→`✗` — `_intQuotientArg` (isInteger/isReal only) rejects String; representative S pin added (IREMAINDER shares the guard). |
| IREMAINDER | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | IREMAINDER(a, b) = a - IQUOT(a,b)·b; same sign as dividend.  Session 105 pinned Sy round-trip + IREMAINDER(17,5)=2, IREMAINDER(-17,5)=-2, IREMAINDER(10,0)→null. Session 125 pinned scalar×List distribution: `17 {5 3} IREMAINDER` → `{2 2}`. **Session 240:** Q `·`→`✗` — same `_intQuotientArg` guard as IQUOT. **Session 267:** C `·`→`✗`, V `·`→`✗`, M `·`→`✗` — same `_intQuotientArg` guard as IQUOT; pins added as representative. **Session 269:** S `·`→`✗` — same `_intQuotientArg` guard as IQUOT rejects String. |
| XROOT      | ~  | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | XROOT(y, x) = y^(1/x).  Session 105 pinned Sy round-trip + XROOT(27,3)=3, XROOT(2,2)=√2, XROOT(-8,3)→null, XROOT(8,0)→null. Session 125 pinned List×scalar distribution on the Real-radicand path: `{8 27} 3 XROOT` → `{Real(2) Real(3)}` (real path emits Real even at clean integer cube roots). **Session 240:** Q `·`→`✓` — degree x: `new Decimal(isInteger(x) ? … : toRealOrThrow(x))` — `toRealOrThrow` accepts Rational (Q→R); radicand y: passed through `^` which accepts Rational. Both operands Q=✓, result always Real (Q→R degradation). Pins: `XROOT Integer(8) Rational(3,1)` → `Real(2)`; `XROOT Rational(1,4) Integer(2)` → `Real(0.5)`. **Session 267:** C `·`→`✗` — degree x uses `toRealOrThrow` which explicitly rejects Complex with "expected real, got complex". **Session 269:** S `·`→`✗` — degree x uses `toRealOrThrow` which rejects String with "expected real, got string". |

*`~` on Real (COMB/PERM/IQUOT/IREMAINDER/XROOT) = accepted only when the stack op's integer-or-finite-real domain check passes.

### Ordered comparators — `<` / `>` / `≤` / `≥`

Numeric-family ordered compare.  `comparePair()` promotes BinInt to
Integer (with wordsize mask applied to the payload) before routing
through `promoteNumericPair`, so BinInt × BinInt and cross-family
BinInt × Integer / Real are accepted.  Complex with a non-zero
imaginary part rejects (no total order on ℂ).  String lex compare
(both operands must be String; HP50 User Guide App. J char-code
lexicographic) is supported — session 179 pinned the contract.

| Op   | R | Z | Q | B | C* | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|----|---|----|---|---|---|---|---|---|-------|
| `<`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Session 074 added B (comparePair coerces via `Integer(value & mask)`). Session 130 pinned BinInt × Rational composition (B → Integer mask + Integer × Rational → rational kind cross-multiply): `#10h < Rational(33,2)` → 1 (16*2=32 < 33*1=33); ws=8 mask edge `#1FFh < Rational(300,1)` → 1 (#1FFh masks to 255 < 300, NOT 511 > 300 — mask BEFORE compare); negative Q boundary `Rational(-3,4) < #0h` → 1 (cross-multiply -3 < 0). Session 135 pinned BinInt cross-base ordered compare `#5h < #6d` → 1 (`comparePair` ignores the formatter `.base` field — both operands are still type `'binaryInteger'`, mask + value compare). Session 179 pinned String lex path: `"abc"<"abd"` → 1, `"abd"<"abc"` → 0, `"abc"<"abc"` → 0 (strict), `""<"a"` → 1 (empty lex-less). Cross-type rejection pinned: `Str<Integer` → Bad argument type. **Session 253:** L/V/M/T/U all `·`→`✗` — `comparePair` is scalar-only; `isNumber` (Real/Integer/Rational/Complex) is the only accepted numeric type beyond BinInt-coerce and String-lex; List/Vector/Matrix/Tagged/Unit all reach the `!isNumber` guard and throw. 20 rejection pins (4 ops × 5 types). |
| `>`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Session 130 pinned operand-order on B × Q: `Rational(33,2) > #10h` → 1 (symmetric to <); ws=8 mask preserved on in-range value `#FFh > Rational(254,1)` → 1 (#FFh stays 255 > 254). Session 179 pinned String lex path: `"b">"a"` → 1, `"a">"b"` → 0. **Session 253:** L/V/M/T/U `·`→`✗` — see `<` row. |
| `≤`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Session 130 pinned Q × B: `Rational(7,3) ≤ #3h` → 1 (cross-multiply 7 ≤ 9). Session 179 pinned String lex path: `"abc"≤"abc"` → 1 (equality boundary), `"abc"≤"abd"` → 1. **Session 253:** L/V/M/T/U `·`→`✗` — see `<` row. |
| `≥`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Session 130 pinned the rational-branch equality boundary `Rational(2,1) ≥ #2h` → 1 (Rational(2,1) does not auto-collapse to Integer at the constructor — collapse is op-result-level — but the rational-kind compare still fires correctly). Session 179 pinned String lex path: `"abc"≥"abc"` → 1 (equality boundary), `"abd"≥"abc"` → 1. **Session 253:** L/V/M/T/U `·`→`✗` — see `<` row. |

*`~` on Complex = accepted only when both `im === 0`; otherwise `Bad argument type`.

### Equality / structural compare — `==` / `SAME`

Structural equality over collection and expression types.  `==` and
`SAME` share the same comparator (`eqValues`) — the only semantic
difference is that `SAME` never lifts to Symbolic for the other
comparators (it always returns a Real 1./0.).  Numeric cross-promotion
is the same as in `<`/`≤`/`>`/`≥` (`Real(1) == Integer(1)` = 1).

| Op   | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| ==   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Session 072 added Sy/L/V/M/T/U structural compare (gap filed s070). Session 074 added BinInt × BinInt (masked against current wordsize) plus cross-family BinInt × Integer / Real / Complex widening at the `==` / `≠` / `<>` outer level via `_binIntCrossNormalize`. Nested lists / matrix rows recurse via `_eqArr`. Tagged: same tag AND same value. Unit: same numeric value AND same `uexpr` (so `1_m == 1_km` = 0). **Session 087**: Program ✓ (structural, pointwise eqValues over `.tokens`); Directory ✓ (reference identity — `a === b`). Session 130 pinned BinInt × Rational composition: `#10h == Rational(16,1)` → 1 (`_binIntCrossNormalize` masks #10h → Integer(16), then `promoteNumericPair` → rational kind eq cross-multiply 16*1 == 16*1); `#10h == Rational(33,2)` → 0; `#10h ≠ Rational(33,2)` → 1 (≠ routes through the same _binIntCrossNormalize); ws=8 mask edge `#100h == Rational(0,1)` → 1 (mask fires before compare). Session 135 pinned the full Tagged tag-identity truth table: `:a:Real(5) == :a:Real(5)` → 1 (same tag + same value); `:a:Real(5) == :a:Real(6)` → 0 (same tag + different value); `:a:Real(5) == :b:Real(5)` → 0 (different tags + same value — tag identity matters); `:a:Real(5) == Real(5)` → 0 (Tagged vs bare; structural compare, no implicit unwrap, contrast with binary-arithmetic surface where binary tag-drop makes Tagged transparent). Session 135 also pinned BinInt cross-base equality `#5h == #5d` → 1 (base is cosmetic — `eqValues` compares masked values, not the `.base` field). |
| SAME | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Same widening — `SAME` always returns Real 1./0., never a Symbolic. Session 074: BinInt × BinInt value compare through the same eqValues branch, BUT `SAME` deliberately does NOT cross-family widen (so `SAME #10h Integer(16)` = 0 — AUR §4-7 "SAME does not type-coerce"). **Session 087**: Program ✓ (structural); Directory ✓ (reference identity — same rule as `==`). Session 130 extended the strict-no-coerce contract to BinInt × Rational: `SAME #10h Rational(16,1)` → 0 (deliberately stays strict — types differ after the no-op normalize, even though `==` widens to 1 on the same operands; mirrors the session 074 B × Z stay-strict pin on the B × Q surface). Session 135 pinned that SAME mirrors `==` on the Tagged surface (always returns Real, never Symbolic): `SAME :a:Real(5) :a:Real(5)` → 1; `SAME :a:Real(5) :b:Real(5)` → 0 (tag mismatch); `SAME :a:Real(5) Real(5)` → 0 (Tagged vs bare). Session 135 also pinned BinInt base-agnostic SAME: `SAME #5h #5d` → 1 (base is purely cosmetic — both operands are still type `'binaryInteger'`, so this is NOT a type difference and SAME's no-coerce stance does not reject); `SAME #5h #6d` → 0 (different value rejects regardless of base). |

---

## Next-session widening candidates

(Ordered by estimated effort, smallest first.)

1. ~~**Add a Q column to the matrix tables.**~~  **Resolved session 226.**
   Q column inserted between Z and B/C in every table.  Values derived
   from already-pinned tests; `·` for untested cells.  CONJ/RE/IM Q ✗
   backed by three new rejection pins (5508 → 5511).
2. ~~**CONJ/RE/IM Rational widening.**~~  **Resolved session 231.**
   `isRational` branch added to `_conjScalar`/`_reScalar`/`_imScalar`; Q ✗→✓ for all three.
3. ~~**Q · → ✓/✗ audit (ARG / % / GCD+LCM).**~~  **Resolved session 231.**
   ARG Q=✗; % / %T / %CH Q=✓ (Q→R degradation); GCD / LCM Q=✗.  7 pins, 5519/0.
4. **Dim-equivalence `==` on Units** — distinct from today's strict
   structural `==`.  Could be a new op (`UEQUAL`?) or a flag that
   flips `==` semantics.  Read AUR §20 first.
5. ~~**Remaining Q · cells** — TRUNC, LNP1, EXPM, ZETA, LAMBERT, PSI~~
   **Resolved session 236** (TRUNC/ZETA/LAMBERT/PSI=✗; LNP1/EXPM=✓).
   ~~Still open: stat-dist family (UTPC/UTPF/UTPT/BETA/ERF/ERFC/GAMMA/LNGAMMA/HEAVISIDE/DIRAC),
   combinatorial family (COMB/PERM/IQUOT/IREMAINDER/XROOT).~~
   **Resolved session 240** — all stat-dist Q=✗ (isInteger/isReal/null pattern);
   COMB/PERM/IQUOT/IREMAINDER Q=✗; XROOT Q=✓ (toRealOrThrow + ^ delegation; Q→R).
   All Q `·` cells now resolved across the stat-dist + combinatorial families.
6. ~~**Rational × Rational on `^` with integer exponent** — currently
   Rational^Integer is real-promoted…~~  **Resolved session 115.**
   The stale claim traced back to an early-session-092 note — by
   the time Decimal-Real landed, the `^` dispatch was already routing
   `Q ^ Integer(n)` through `Fraction.pow(n)` for exact stay-exact.
   `Rational(3,2) ^ Integer(3)` → `Rational(27,8)` and
   `Rational(7,11) ^ Integer(0)` → `Integer(1)` (d=1 collapse) are
   now pinned by hard tests in `tests/test-types.mjs`.  Fractional
   rational exponent (`Rational(2,1) ^ Rational(1,3)`) correctly lifts
   to Symbolic in EXACT mode (pinned separately).

### Resolved this session (267)

- **C/S/V/M column rejection-pin pass — 26 new assertions, 26 matrix cells (5640→5666).**
  No source changes to `ops.js` — all rejections were already correct behavior, just untested.
  Cells resolved across four groups:

  **C (Complex) column — Real-decomp family (3 cells):**
  ZETA / LAMBERT / PSI — all use `isInteger/isReal` guards; Complex → `null` → `Bad argument type`.
  Pins: `Complex(1,2) ZETA` → `Bad argument type`; `Complex(1,2) LAMBERT` → `Bad argument type`;
  `Complex(1,2) PSI` → `Bad argument type`.

  **C (Complex) column — Stat-dist family (7 cells):**
  DIRAC (no `isComplex` branch in the `isReal/isInteger/isBinaryInteger/isSym` dispatch);
  ERF/ERFC/BETA (`isInteger/isReal/null` pattern — Complex → `null` → throw);
  UTPC/UTPF/UTPT (shared `asReal` helper accepts `isInteger` and `isReal` only).
  Pins: one per op, using `Complex(1,2)` as the representative argument.

  **C (Complex) column + V/M columns — Combinatorial family (13 cells):**
  COMB/PERM (`_combPermArgs`: `!isInteger(a) && !isReal(a) → throw`; Complex/Vector/Matrix all fail);
  IQUOT/IREMAINDER (`_intQuotientArg`: same `isInteger/isReal` only pattern);
  XROOT (degree x uses `toRealOrThrow` which explicitly rejects Complex: "expected real, got complex").
  No `_withVMBinary` on any of these ops — Vector/Matrix reach the scalar guard directly.
  Pins: one per `C` op; COMB V + COMB M + PERM V + PERM M + IQUOT V + IQUOT M +
  IREMAINDER V + IREMAINDER M (8 V/M pins, COMB and IQUOT are the representative pair per guard family).

  **S (String) column — Reference rows (3 cells):**
  CONJ / RE / IM — `_conjScalar`/`_reScalar`/`_imScalar` dispatch (isReal/isInteger/isRational/
  isComplex/isName/isSym); no `isString` branch.
  Pins: `Str('x') CONJ` → `Bad argument type`; `Str('x') RE` → `Bad argument type`;
  `Str('x') IM` → `Bad argument type`.

### Resolved this session (258)

- **BinaryInteger (B column) rejection-pin pass — 22 new assertions, 21 matrix rows (5599→5621).**
  No source changes to `ops.js` — all rejections were already correct behavior, just untested.
  The `B` column carried `·` (untested) for a wide range of numeric-math ops.  BinaryInteger
  is accepted on the binary arithmetic surface and by the rounding family (FLOOR/CEIL/IP/FP),
  but every general numeric handler requires `isReal`, `isInteger`, `isRational`, or `isComplex`
  — none of which match BinaryInteger.

  **Probe:** `utils/@probe-binary-int.mjs` — all 22 cells confirmed `Bad argument type` before
  pinning.  DIRAC/HEAVISIDE (which do accept BinaryInteger via an explicit `isBinaryInteger`
  branch) were noted but are in tables without a B column, so no matrix update needed there.

  **Matrix cells updated (B `·`→`✗`):**
  — Unary math: INV / SQ / SQRT / ABS / SIN..ACOSH..ATANH (group) / FACT / LN,LOG,EXP,ALOG (group) / LNP1 / EXPM / SIGN / ARG / CONJ / RE / IM.
  — Binary scalar: MOD / MIN / MAX / GCD / LCM / % / %T / %CH.

  **Rejection pins (22 total, all in `tests/test-types.mjs`, session258 block):**
  — Each unary op: `BinaryInteger(10n,'h') OP` → `Bad argument type`.
  — Each binary op: `BinaryInteger(10n,'h') BinaryInteger(5n,'h') OP` → `Bad argument type`.
  — SIN and LN are representative pins for their grouped rows; the rejection path (`_unaryCx`→`toRealOrThrow`) is identical for all members of each group.
  — LNP1 and EXPM get separate pins (same row, two distinct handlers with the same `toRealOrThrow` rejection path).

### Resolved this session (253)

- **Ordered comparators `<` / `>` / `≤` / `≥` — L/V/M/T/U rejection pins — 20 new assertions (5571→5591).**
  No source changes — the rejection was already correct behavior, just untested.
  `comparePair()` is scalar-only: after BinInt-coerce and Symbolic-lift, it accepts `isString` (lex)
  and `isNumber` (Real/Integer/Rational/Complex) only.  List, Vector, Matrix, Tagged, and Unit all
  reach the `!isNumber` guard and throw `'Bad argument type'`.

  **Matrix cells updated:** `<` / `>` / `≤` / `≥` L/V/M/T/U all `·`→`✗` (4 ops × 5 types = 20 cells).

  **Rejection pins (5 per op, 20 total, all in `tests/test-types.mjs`):**
  — L=✗: `{R(1) R(2)} {R(3) R(4)} </>/ ≤/≥` → `Bad argument type` (List is not isNumber).
  — V=✗: `V[R(1),R(2)] V[R(3),R(4)] </>/ ≤/≥` → `Bad argument type` (Vector is not isNumber).
  — M=✗: `M[[R(1)]] M[[R(2)]] </>/ ≤/≥` → `Bad argument type` (Matrix is not isNumber).
  — T=✗: `:x:R(1) R(2) </>/ ≤/≥` → `Bad argument type` (Tagged is NOT transparently unwrapped
    on the ordered-compare surface — distinct from the unary `_withTaggedUnary` transparency pattern).
  — U=✗: `1_m 2_m </>/ ≤/≥` → `Bad argument type` (Unit is not isNumber; no dimensional-compare).

  Probe file: `utils/@probe-comparator-types.mjs` (all 20 confirmed ✗ before pinning).

### Resolved this session (248)

- **UTPC / UTPT List + Tagged widening — source change + 8 net new assertions (5560→5568).**
  Extracted scalar dispatcher functions and wrapped both 2-arg stat-dist ops with
  `_withTaggedBinary(_withListBinary(…))`.  UTPF (3-arg) stays as a bare handler
  (no `_withListBinary` shape for 3-arg ops).

  **`_utpcScalar(nu, x)` / `_utptScalar(nu, t)`** — extracted from the former inline
  stack handlers in `www/src/rpl/ops.js`.  Each validates types via the shared `asReal`
  helper pattern (isInteger / isReal → number; anything else → 'Bad argument type') and
  validates values (ν must be a strictly positive integer; x/t must be finite).  Returns
  a `Real(…)` value rather than pushing to the stack, so it composes through the wrappers.

  **UTPC acceptance pins (5 new):**
  — n=0 empty-list passthrough: `{} {} UTPC` → `{}`.
  — n=1 bare-list: `{Integer(2)} {Integer(0)} UTPC` → `{Real(1)}` (X≤0 exact branch).
  — n=2 pairwise: `{Integer(2) Integer(5)} {Integer(0) Integer(2)} UTPC` → `{Real(1) Real(≈0.849)}` (tol 1e-6).
  — T+L: `:nu:{Integer(2)} :x:{Integer(0)} UTPC` → `{Real(1)}` (binary tag-drop, tag NOT re-applied).
  — Scalar Tagged: `:n:Integer(2) :x:Integer(0) UTPC` → `Real(1)` (tag dropped).

  **UTPT acceptance pins (5 new):**
  — n=0 empty-list passthrough: `{} {} UTPT` → `{}`.
  — n=1 bare-list: `{Integer(5)} {Integer(0)} UTPT` → `{Real(0.5)}` (t=0 exact branch).
  — n=2 pairwise: `{Integer(5) Integer(10)} {Integer(0) Integer(0)} UTPT` → `{Real(0.5) Real(0.5)}`.
  — T+L: `:nu:{Integer(5)} :t:{Integer(0)} UTPT` → `{Real(0.5)}` (binary tag-drop).
  — Scalar Tagged: `:n:Integer(5) :t:Integer(0) UTPT` → `Real(0.5)` (tag dropped).

  **2 session-244 List rejection pins removed** (UTPC and UTPT List=✗ pins, which are
  now superseded by the acceptance pins above).

  V=✗ / M=✗ for both ops (no `_withVMBinary`; mirrors BETA policy — binary ops with
  numeric-domain constraints don't get VM support).  V rejection pins retained.

  Matrix cells updated: UTPC L `✗`→`✓` / T `·`→`✓`; UTPT L `✗`→`✓` / T `·`→`✓`.

### Resolved this session (244)

- **Z-cell doc-lag audit: ERF / ERFC / UTPC / UTPF / UTPT + BETA L/V/M + UTPC/UTPF/UTPT L/V/M — 19 new pins (5541→5560).**
  All source handlers already accepted Integer; the coverage matrix cells were stale `·`.

  **ERF / ERFC Z=✓ (bare-scalar Integer acceptance):**
  — **ERF**: `_erfScalar` has `const x = isInteger(v) ? Number(v.value) : isReal(v) ? … : null`; `erf(Integer(0))` → `Real(0)` (zero special-case); `erf(Integer(1))` → `Real(≈0.8427)` (non-zero via `_regGammaP`).
  — **ERFC**: `_erfcScalar` same `isInteger` branch; `erfc(Integer(0))` → `Real(1)` (zero special-case); `erfc(Integer(2))` → `Real(≈0.00468)` (positive-x via `_regGammaQ(0.5, 4)`).

  **UTPC / UTPF / UTPT Z=✓ (shared `asReal` helper accepts Integer):**
  — **UTPC**: `UTPC(Integer(3), Integer(0))` → `Real(1)` (X≤0 exact branch); `UTPC(Integer(2), Integer(2))` → `Real(≈exp(−1))` (df=2 tail; tol 1e-10).
  — **UTPF**: `UTPF(Integer(2), Integer(2), Integer(1))` → `Real(0.5)` (w=d/(d+nF)=0.5; I₀.₅(1,1)=0.5; tol 1e-12).
  — **UTPT**: `UTPT(Integer(5), Integer(0))` → `Real(0.5)` (t=0 exact short-circuit branch).

  **BETA L=✓ (doc lag: `_withListBinary` wrapper present), V=✗ / M=✗ (no `_withVMBinary`):**
  — `{Integer(1) Integer(2)} {Integer(1) Integer(3)} Beta` → `{Real(B(1,1)) Real(B(2,3))}` = `{Real(≈1) Real(≈1/12)}`; pairwise `_withListBinary` dispatch confirmed.
  — `Vector([Real(2)]) Integer(1) Beta` → Bad argument type; `Matrix([[Real(2)]]) Integer(1) Beta` → Bad argument type (V/M reach `_betaScalar` directly → `aNum = null`).

  **UTPC / UTPF / UTPT L=✗ / V=✗ / M=✗ (bare handlers; no list/vector wrappers):**
  — `UTPC(Integer(2), List({Real(1)}))` → Bad argument type; `UTPC(Integer(2), Vector([Real(1)]))` → Bad argument type.
  — `UTPF(Integer(2), Integer(2), List({Real(1)}))` → Bad argument type; `UTPF(…, Vector([Real(1)]))` → Bad argument type.
  — `UTPT(Integer(3), List({Real(1)}))` → Bad argument type; `UTPT(Integer(3), Vector([Real(1)]))` → Bad argument type.

### Resolved this session (240)

- **Q-cell audit: stat-dist + combinatorial families — 16 new pins (5525→5541).**
  Inspected each scalar handler and pinned the Rational-acceptance result:

  **Stat-dist (all Q=✗):**
  — **GAMMA / LNGAMMA**: `_gammaScalar` / `_lngammaScalar`: `x = isInteger ? … : isReal ? … : null; if (x === null) throw 'Bad argument type'` — no `isRational` branch.
  — **ERF / ERFC**: `_erfScalar` / `_erfcScalar`: same `x = isInteger ? … : isReal ? … : null` pattern.
  — **BETA**: `_betaScalar`: `aNum = isInteger ? … : isReal ? … : null` — Rational a-arg → null → Bad argument type (b-arg not reached).
  — **UTPC / UTPF / UTPT**: local `asReal` helper only accepts Integer and Real; Rational → throw.
  — **HEAVISIDE / DIRAC**: explicit `isReal / isInteger / isBinaryInteger / _isSymOperand` branch chain only; Rational falls through to throw.

  **Combinatorial (COMB/PERM/IQUOT/IREMAINDER Q=✗; XROOT Q=✓):**
  — **COMB / PERM**: `_combPermArgs` guard: `!isInteger(a) && !isReal(a) → throw 'Bad argument type'` — Rational rejected even when integer-valued (e.g. `Rational(5,1)`).
  — **IQUOT / IREMAINDER**: `_intQuotientArg`: only isInteger and isReal branches; Rational → throw.
  — **XROOT Q=✓**: degree x: `new Decimal(isInteger(x) ? … : toRealOrThrow(x))` — `toRealOrThrow` accepts Rational (`Number(v.n)/Number(v.d)`); radicand y: pushed as-is and routed through `^` which accepts Rational. Both operands Q=✓; result always Real (Q→R degradation).

  14 rejection pins + 2 acceptance pins for XROOT (degree Q=✓ and radicand Q=✓).
  Matrix cells updated: all stat-dist Q `·`→`✗`; COMB/PERM/IQUOT/IREMAINDER Q `·`→`✗`; XROOT Q `·`→`✓`.

### Resolved this session (236)

- **Q-cell audit: LNP1 / EXPM / TRUNC / ZETA / LAMBERT / PSI — 6 new pins (5519→5525).**
  Inspected the scalar handlers for each op and pinned the result:
  — **LNP1 / EXPM Q=✓**: both call `toRealOrThrow(v)` which has an explicit
    `isRational(v)` branch (`Number(v.n)/Number(v.d)`); Rational accepted, result is
    Real (Q→R degradation, mirrors LNP1/EXPM Integer→Real degrade from session 162).
    Two acceptance pins: `LNP1 Rational(1,2)` → `Real(log1p(0.5))`; `EXPM Rational(1,2)` →
    `Real(expm1(0.5))`.
  — **TRUNC x=Q → ✗**: `_roundingOp` checks `if (!isReal(xv) && !isInteger(xv)) throw
    'Bad argument type'`; Rational x rejected before the numeric computation.
    One rejection pin: `Rational(3,2) Integer(1) TRUNC` → `'Bad argument type'`.
  — **ZETA / LAMBERT / PSI Q=✗**: all three scalar handlers use the pattern
    `const x = isInteger(v) ? … : isReal(v) ? … : null; if (x === null) throw 'Bad argument
    type'`; Rational falls through to null.  Three rejection pins: one each for ZETA,
    LAMBERT, PSI on `Rational(1,2)` input.
  Matrix cells updated: LNP1/EXPM Q `·`→`✓`; TRUNC/ZETA/LAMBERT/PSI Q `·`→`✗`.

### Resolved this session (231)

- **CONJ / RE / IM Rational widening — source change + 4 acceptance pins (net +1 assertion).**
  `_conjScalar` / `_reScalar` / `_imScalar` in `www/src/rpl/ops.js` each gained an
  `isRational(v)` branch.  CONJ and RE return `v` unchanged (conjugate/real-part of a real
  rational is itself); IM returns `Integer(0n)` (imaginary part of a real is zero).
  Replaces the three session-226 rejection pins with four acceptance pins
  (CONJ Rational(1,2)→Rational(1,2); CONJ Rational(-3,4)→Rational(-3,4);
  RE Rational(1,2)→Rational(1,2); IM Rational(1,2)→Integer(0)); net test count +1 (5511→5512).
  Matrix cells: CONJ/RE/IM Q ✗→✓.

- **Q-cell audit: ARG / % / %T / %CH / GCD / LCM — 7 new pins (5512→5519).**
  Inspected the scalar handlers for each op and pinned the result:
  — **ARG Q=✗**: `_argScalar` has no `isRational` branch; Rational falls through to
    `Bad argument type`.  Two rejection pins: `ARG Rational(1,2)` and `ARG Rational(-1,2)`.
  — **% / %T / %CH Q=✓**: all three dispatch through `toRealOrThrow`, which already handles
    `isRational(v)` (returns `Number(v.n)/Number(v.d)`).  Rational accepted; result is Real
    (Q→R degradation).  Three acceptance pins: `Rational(1,2) Real(50) %` → `Real(0.25)`;
    `Rational(1,4) Real(1) %T` → `Real(400)`; `Rational(1,2) Real(1) %CH` → `Real(100)`.
  — **GCD / LCM Q=✗**: `_toBigIntOrThrow` handles only Integer and integer-valued Real;
    Rational → `Bad argument type`.  Two rejection pins: `Rational(1,2) Integer(2) GCD`;
    `Rational(1,2) Integer(2) LCM`.  Correct by design — GCD/LCM are integer-domain.
  Matrix cells updated: ARG Q ·→✗; % / %T / %CH Q ·→✓; GCD / LCM Q ·→✗.

### Resolved this session (226)

- **Q column added to all per-op coverage-matrix tables (documentation + 3 new rejection pins).**
  A `Q` (Rational) column was inserted between `Z` and `B`/`C` in every table.  Values:
  — ✓ (already-pinned acceptance): NEG, INV, SQ, SQRT, ABS, FLOOR, CEIL, IP, FP, SIGN,
    trig/hyp/log family (SIN..ATANH, LN/LOG/EXP/ALOG), binary arithmetic (`+`/`-`/`*`/`/`/`^`),
    MOD/MIN/MAX (Q→R degradation, pinned session 125), ordered comparators (`<`/`>`/`≤`/`≥`),
    equality (`==`/`SAME`).
  — ✗ (pinned rejection): FACT (session 120), XPON (session 120), MANT (session 120),
    CONJ/RE/IM (new pins this session — `_conjScalar`/`_reScalar`/`_imScalar` have no
    `isRational` branch; all three throw `RPLError('Bad argument type')`).
  — `·` (untested): ARG, LNP1, EXPM, GCD, LCM, `%`/`%T`/`%CH`, TRUNC, ZETA, LAMBERT,
    PSI, stat-dist family (UTPC/UTPF/UTPT/BETA/ERF/ERFC/GAMMA/LNGAMMA/HEAVISIDE/DIRAC),
    combinatorial family (COMB/PERM/IQUOT/IREMAINDER/XROOT).
  +3 `session226:` pins in `tests/test-types.mjs` (5508 → 5511):
  `CONJ Rational(1,2)` → 'Bad argument type' (no isRational branch in _conjScalar);
  `RE Rational(1,2)` → 'Bad argument type' (no isRational branch in _reScalar);
  `IM Rational(1,2)` → 'Bad argument type' (no isRational branch in _imScalar).
  Also updated the "Next-session widening candidates" queue: item 1 (formal Q column) closed.

### Resolved this session (221)

- **Per-op pull-apart for `+`/`-`/`*`/`/`/`^` — documentation restructure (no source changes, no new assertions).**
  The compact "Reference rows — already-broad ops from earlier sessions" table previously
  held all nine ops (`+`/`-`/`*`/`/`/`^`/`NEG`/`CONJ`/`RE`/`IM`) in a single flat table
  with terse Notes.  The five binary arithmetic ops were promoted to a standalone section
  (`### Binary arithmetic — \`+\` / \`-\` / \`*\` / \`/\` / \`^\``) with:
  — A shared prose preamble codifying the BinInt masking contract (2^wordsize mask, base
    is cosmetic, two's-complement wrap), the Unit dim-algebra contract (`+`/`-` need
    compatible dims; `*`/`/` produce quotient unit), and the Tagged binary tag-drop
    contract (binary surface does NOT preserve the tag, unlike the unary surface).
  — Per-op rows with fully expanded Notes cross-referencing the specific sessions that
    pinned each axis (BinInt: session 110; Rational: sessions 110/115/135; Tagged:
    sessions 068/135; `^` Rational exact path: session 115).
  The four unary ops (NEG/CONJ/RE/IM) were kept in a renamed table
  ("Reference rows — unary sign/complex ops") with a note explaining the split.
  The "Next-session" queue items 1 and 5 (both requesting this pull-apart) are now closed.
  Queue item 2 (formal Q column) is the natural follow-on.
  Verification gates: `node tests/test-all.mjs` 5508/0/0 (baseline unchanged),
  `node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.

### Resolved this session (216)

- **PSI L/V/M stale-`·`-cell promotion — documentation-only fix (pin additions only).**
  The 1-arg digamma handler has bespoke `isList` / `isVector` / `isMatrix` branches (same
  shape as GAMMA/LNGAMMA): `isList(v)` → `RList(v.items.map(_psiScalar))`;
  `isVector(v)` → `Vector(v.items.map(_psiScalar))`; `isMatrix(v)` → `Matrix(v.rows.map(r => r.map(_psiScalar)))`.
  The DATA_TYPES.md matrix carried `·` for L/V/M as a documentation lag.  No source changes.
  Note: T+L/T+V/T+M is NOT supported — the bespoke `isTagged` branch calls `_psiScalar`
  directly on `v.value`, so T=✓ in the matrix reflects scalar-Tagged only.
  +5 `session216:` pins in `tests/test-types.mjs` (5503 → 5508):
  L-empty `{}`→`{}`; L `{Integer(1)}`→`{Real(ψ(1))}` (ψ(1)=−γ≈−0.5772, tol 1e-12);
  L `{Integer(1) Integer(2)}`→`{Real(ψ(1)) Real(ψ(2))}` (heterogeneous-output, two distinct
  values per element position); V `[Integer(1) Integer(2)]`→`[Real(ψ(1)) Real(ψ(2))]`;
  M `[[Integer(1)]]`→`[[Real(ψ(1))]]`.
  PSI matrix row: L/V/M `·`→`✓`.
  Verification gates: `node tests/test-all.mjs` 5508/0/0,
  `node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.

### Resolved this session (212)

- **ZETA / LAMBERT Z/L/V/M stale-`·`-cell promotion — documentation-only fix (pin additions only).**
  Both ops are registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`
  and their `_zetaScalar` / `_lambertScalar` functions accept `isInteger(v)` — meaning the
  Z column was stale alongside the L/V/M cells.  No source changes.
  +10 `session212:` pins in `tests/test-types.mjs` (5493 → 5503):
  ZETA ×5 — Z `Integer(0)`→`Real(-0.5)` (ζ(0)=-1/2 exact fp); L-empty `{}`→`{}`;
  L `{Integer(2)}`→`{Real(ζ(2))}` (tolerance 1e-12 vs π²/6);
  V `[Integer(2) Integer(0)]`→`[Real(ζ(2)) Real(-0.5)]`;
  M `[[Integer(2)]]`→`[[Real(ζ(2))]]`.
  LAMBERT ×5 — Z `Integer(0)`→`Real(0)` (W(0)=0 exact branch in `_lambertW0`);
  L-empty `{}`→`{}`; L `{Integer(0)}`→`{Real(0)}`;
  V `[Integer(0) Integer(1)]`→`[Real(0) Real(Ω)]` (Ω≈0.5671432904097838, tolerance 1e-12);
  M `[[Integer(1)]]`→`[[Real(Ω)]]`.
  ZETA matrix row: Z/L/V/M `·`→`✓`.  LAMBERT matrix row: Z/L/V/M `·`→`✓`.
  Verification gates: `node tests/test-all.mjs` 5503/0/0,
  `node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.

### Resolved this session (208)

- **erf M stale-`·`-cell promotion — documentation-only fix (pin addition only).**
  `erf` is registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`.
  The bespoke handler contains `else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_erfScalar))))`,
  identical in structure to the `erfc` handler.  Session 200 pinned only L and V for erf;
  the M cell remained `·` as a documentation lag.  No source changes.
  +1 `session208:` pin in `tests/test-types.mjs` (5492 → 5493):
  Matrix `[[Integer(0)]]`→`[[Real(0)]]` (erf(0)=0 zero special-case; Matrix kind preserved
  across element-wise `_erfScalar` dispatch).
  ERF matrix row: M `·`→`✓`.
  Verification gates: `node tests/test-all.mjs` 5493/0/0,
  `node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.

### Resolved this session (204)

- **erfc L/V/M/T+L stale-`·`-cell promotion — documentation-only fix (pin additions only).**
  erfc is registered as `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`,
  identical in structure to erf (which had its L/V cells promoted in session 200).
  Session 200's partial pass pinned only the T scalar path for erfc; the L/V/M cells
  remained `·` as a documentation lag.  No source changes.
  +7 `session204:` pins in `tests/test-types.mjs` (5485 → 5492):
  bare-List n=0 passthrough `{}`→`{}`; T+L n=0 `:e:{}`→`:e:{}`;
  bare-List n=1 value-precise `{Integer(0)}`→`{Real(1)}` (erfc(0)=1 zero special-case);
  T+L n=1 `:e:{Integer(0)}`→`:e:{Real(1)}`;
  bare-List n=2 heterogeneous-output `{Integer(0) Integer(1)}`→`{Real(1) Real(≈0.1573)}`;
  Vector `[Integer(0)]`→`[Real(1)]`; Matrix `[[Integer(0)]]`→`[[Real(1)]]`.
  ERFC matrix row: L/V/M `·`→`✓`.
  Verification gates: `node tests/test-all.mjs` 5492/0/0,
  `node tests/test-persist.mjs` passed, `node tests/sanity.mjs` 22/0.

### Resolved this session (200)

- **GAMMA / LNGAMMA / erf / erfc L/V/M stale-`·`-cell promotion — documentation-only fix.**
  All four ops were already registered with `_withTaggedUnary(_withListUnary(bespoke-V/M
  handler))`, meaning List, Vector, Matrix, and Tagged inputs all dispatched correctly.
  The DATA_TYPES.md matrix carried `·` (not-applicable) for their L/V/M cells as a
  documentation lag from when the wrappers were added.  No source changes.
  +13 `session200:` pins in `tests/test-types.mjs` (5472 → 5485):
  GAMMA ×6 — n=0 bare-List passthrough `{}`→`{}`; n=0 T+L `:g:{}`→`:g:{}`;
  n=2 bare-List integer-exact `{Integer(1) Integer(5)}`→`{Integer(1) Integer(24)}`;
  n=2 T+L tag-preserved; V `[Integer(1) Integer(5)]`→`[Integer(1) Integer(24)]`;
  M `[[Integer(2) Integer(3)]]`→`[[Integer(1) Integer(2)]]`.
  LNGAMMA ×4 — n=0 bare-List passthrough; M `[[Integer(2)]]`→`[[Real(0)]]`
  (lngamma(2)=0 exact-fp); T scalar `:h:Integer(2)`→`:h:Real(0)`; V `[Integer(2)]`→`[Real(0)]`.
  erf ×2 — bare-List `{Integer(0)}`→`{Real(0)}` (erf(0)=0 zero special-case); V `[Integer(0)]`→`[Real(0)]`.
  erfc ×1 — T scalar re-verify `:e:Integer(0)`→`:e:Real(1)` (erfc(0)=1; T was already ✓).
  Matrix promotions: GAMMA L/V/M `·`→`✓`; LNGAMMA L/V/M `·`→`✓`; ERF L/V `·`→`✓` (M stays `·`).

### Resolved this session (196)

- **TRUNC L/T wrapper-add — closes the last ship-prep 2026-04-25 audit candidate.**
  Wrapped `register('TRUNC', _truncOp())` →
  `register('TRUNC', _withTaggedBinary(_withListBinary(_truncOp())))`.
  TRUNC is a 2-arg binary op `(x n → y)`; the binary wrapper convention drops the
  tag on output (unlike unary, which re-applies the tag).  V/M are deliberately ✗ —
  no `_withVMBinary` exists and TRUNC element-wise on V/M has no HP50 precedent
  (mirrors MOD/MIN/MAX policy).  Pins (+8): n=0 bare-List passthrough
  `{ } Integer(1) TRUNC → { }`; n=0 Tagged-of-List tag-drop
  `:t:{ } Integer(1) TRUNC → { }`; n=1 bare-List value-precise
  `{ Real(3.567) } Integer(1) TRUNC → { Real(3.5) }`; n=2 bare-List heterogeneous
  `{ Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) }`;
  n=2 Tagged-of-List tag-dropped (result is plain List); scalar Tagged tag-dropped
  `:t:Real(3.567) Integer(1) TRUNC → Real(3.5)`; pairwise L×L
  `{ Real(1.99) Real(2.345) } { Integer(0) Integer(2) } TRUNC → { Real(1) Real(2.34) }`;
  Vector rejection guard `Vector(R,R) Integer(1) TRUNC → Bad argument type`.
  TRUNC matrix row: L/T blank → ✓; V/M blank → ✗.

### Resolved this session (191)

- **Cluster 1 — HEAVISIDE L/V/M/T wrapper-add.**
  Wrapped `register('HEAVISIDE', …)` in `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`.
  Inner scalar handler unchanged (Real/Integer/BinaryInteger step fold; Symbolic → lifted;
  other types → `Bad argument type`).  Ship-prep audit had downgraded all four collection
  cells to blank.  Pins (+8): n=0 empty-List bare + T+L; n=1 bare List
  `{ Real(2) } → { Real(1) }`; n=2 heterogeneous bare List + Tagged-of-List
  `{ Real(2) Real(-1) } → { Real(1) Real(0) }`; Vector `[ Real(1) Real(-1) ] → [ Real(1)
  Real(0) ]`; Matrix `[[ Real(1) Real(-1) ]] → [[ Real(1) Real(0) ]]`; scalar Tagged
  `:x:Real(3) → :x:Real(1)`.  HEAVISIDE matrix row L/V/M/T → ✓.  Two stale session-061
  "rejects" assertions in `tests/test-algebra.mjs` updated to assert accepted → `{ }`.

- **Cluster 2 — DIRAC L/V/M/T wrapper-add.**
  Wrapped `register('DIRAC', …)` in the same 3-deep composition.  Inner handler unchanged
  (non-zero Real → `Real(0)`; non-zero Integer/BinaryInteger → `Integer(0n)`; zero of any
  numeric type → `Symbolic(DIRAC(0))`; Symbolic → lifted).  Pins (+8): n=0 empty-List
  bare + T+L; n=1 bare List `{ Real(0) } → { Symbolic(DIRAC(0)) }` (at-zero special case
  propagates through wrapper); n=2 bare List + T+L non-zero `{ Real(1) Real(2) } → { Real(0)
  Real(0) }`; Vector `[ Real(1) Real(3) ] → [ Real(0) Real(0) ]`; Matrix
  `[[ Real(1) ]] → [[ Real(0) ]]`; scalar Tagged `:x:Real(5) → :x:Real(0)`.  DIRAC matrix
  row L/V/M/T → ✓.

### Resolved this session (187)

- **Cluster 1 — XPON L/V/M/T wrapper-add.**
  Wrapped `register('XPON', …)` in `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`.
  Inner scalar handler unchanged (Real/Integer → Real via `_xponOf`; Symbolic → lifted;
  other types → `Bad argument type`).  Ship-prep audit had downgraded all four collection
  cells (L/V/M/T) from aspirational ✓ to blank after the bare-handler throw was
  confirmed via `utils/@probe-special-fns-vm.mjs`.  Pins (+8): n=0 empty-List bare +
  T+L; n=1 bare List `{ Real(100) } → { Real(2) }`; n=2 heterogeneous bare List +
  Tagged-of-List `{ Real(100) Real(10) } → { Real(2) Real(1) }`; Vector
  `[ Real(100) Real(1000) ] → [ Real(2) Real(3) ]`; Matrix
  `[[ Real(100) Real(10) ]] → [[ Real(2) Real(1) ]]`; scalar Tagged
  `:x:Real(250) → :x:Real(2)`.  XPON matrix row L/V/M/T → ✓.

- **Cluster 2 — MANT L/V/M/T wrapper-add.**
  Wrapped `register('MANT', …)` in the same 3-deep composition.  Inner scalar handler
  unchanged (mantissa in [1,10) via `x / 10^_xponOf(x)`; `x=0` → `Real(0)` early
  return).  Pins (+7): n=0 empty-List bare + T+L; n=1 bare List
  `{ Real(250) } → { Real(2.5) }`; n=2 heterogeneous bare List + Tagged-of-List
  `{ Real(250) Real(10) } → { Real(2.5) Real(1) }`; Vector
  `[ Real(2500) Real(100) ] → [ Real(2.5) Real(1) ]`; Matrix
  `[[ Real(2500) ]] → [[ Real(2.5) ]]`.  MANT matrix row L/V/M/T → ✓.

### Resolved this session (183)

- **Cluster 1 — forward-trig SIN/COS/TAN heterogeneous-output mixed-input value pins
  on bare-List + Tagged-of-List (re-land of session 175 Cluster 1).**
  Originally authored session 175 (ship-day T-0 wrap-up); filesystem-persistence
  failure meant the write did not survive to the shared repo (T-003).  This re-land
  uses `session175r:` assertion labels.  Input `{Real(0) Real(1)}` in RAD.  COS is
  the outlier: item[0]=Real(1) (cos(0)=1, not 0).  For each of SIN/COS/TAN: one
  bare-List pin (tag `:h:`) + one Tagged-of-List pin (6 assertions total).
  Closes the forward-trig trio on the heterogeneous-output value-pin axis.

- **Cluster 2 — inverse-trig ASIN/ACOS/ATAN heterogeneous-output mixed-input value pins
  on bare-List + Tagged-of-List (re-land of session 175 Cluster 2).**
  Same persistence failure.  Input `{Real(0) Real(1)}` in RAD.  ACOS is the strongest
  outlier: item[0]=acos(0)=π/2, item[1]=acos(1)=0 — BOTH positions value-precise and
  order is FLIPPED relative to the identity-then-non-identity pattern.  ASIN/ATAN follow
  the identity pattern (item[0]=0).  For each of ASIN/ACOS/ATAN: one bare-List pin
  (tag `:i:`) + one Tagged-of-List pin (6 assertions total).  Closes the inverse-trig
  trio on the T+L heterogeneous-output value-pin axis.

Both clusters wrapped in `try { setAngle('RAD'); ... } finally { setAngle(_prevAngle); }`
per the s173-Cluster-2 angle-guard convention.  Tolerance 1e-12 for Decimal `.toNumber()`
vs. `Math.*` double comparisons on π/2 / π/4 values.  No source-side changes.
REVIEW.md T-003 data-type-support portion closed; the unit-tests lane's portion
(s177 EXACT-mode Integer trig + RUN edge matrix, ~24 pins) remains open.

### Resolved this session (179)

- **Cluster 1 — String lex compare pinning on `<` / `>` / `≤` / `≥`.**
  The `comparePair()` function in `ops.js` has had a String branch
  since before this lane was active (HP50 User Guide App. J: both
  operands must be String; char-code lexicographic order; mixing
  String with non-String → `Bad argument type`).  The matrix carried
  `✓` in the S column for all four ops, but the intro paragraph still
  said "String lex order is still `Bad argument type`" — a stale note
  that predated the implementation.  No hard assertions existed for
  the String path on any of the four ops.  This cluster:
  - **Removes the stale intro-paragraph claim** and replaces it with
    an accurate description citing HP50 User Guide App. J + session 179.
  - **Pins 12 hard assertions** covering:
    - `<` strict-less true (`"abc"<"abd"` → 1), false
      (`"abd"<"abc"` → 0), equality-boundary (`"abc"<"abc"` → 0),
      empty-string sentinel (`""<"a"` → 1);
    - `>` strict-greater true (`"b">"a"` → 1), false (`"a">"b"` → 0);
    - `≤` equality-boundary (`"abc"≤"abc"` → 1) and lex-less
      (`"abc"≤"abd"` → 1);
    - `≥` equality-boundary (`"abc"≥"abc"` → 1) and lex-greater
      (`"abd"≥"abc"` → 1);
    - cross-type rejections: `Str<Integer` → Bad argument type,
      `Integer<Str` → Bad argument type.
  - **Updates Notes columns** for all four ordered-compare rows.
  No source-side changes.  No REVIEW.md findings closed (D-001 was
  already resolved; O-009/O-011 are post-ship deferred).

### Resolved this session (171)


- **Cluster 1 — SINH / COSH / TANH / ASINH n=0 empty-List + n=1
  single-element boundary closures on the bare-List + Tagged-of-List
  wrapper composition.**  Session 120 pinned bare-List + (SINH-only)
  Tagged-of-List dispatch on n=2 for the forward-hyperbolic
  four-op family.  Sessions 130/140/150 lifted the wrapper-VM
  composition onto the same family under Tagged-of-Vector /
  Tagged-of-Matrix.  But the n=0 empty-List and n=1 single-element
  shoulders on the bare-List + T+L axes — the boundary axis that
  session 160 closed on LN, session 162 closed on LNP1/EXPM, and
  session 166 closed on LOG/EXP/ALOG and ACOSH/ATANH — were never
  pinned on SINH/COSH/TANH/ASINH.  This cluster mirrors session
  166 Cluster 1's structure (which closed the n=0 / n=1 boundary
  axes on LOG/EXP/ALOG) onto the forward-hyperbolic family.  The
  forward-hyperbolic family routes through the same 3-deep wrapper
  composition `_withTaggedUnary(_withListUnary(_withVMUnary(
  handler)))` (via `_unaryCx`) as the LN/LOG/EXP/ALOG quartet, so
  the n=0 / n=1 boundary code path is structurally identical;
  this cluster pins it explicitly.  Per-op n=1 input is Real(0)
  since every forward-hyperbolic op has a clean numeric fold at
  zero — sinh(0)=0, cosh(0)=1, tanh(0)=0, asinh(0)=0.  16 hard
  assertions:
  - **n=0 bare-List, four ops:** `{ } SINH/COSH/TANH/ASINH → { }`
    — wrapper preserves empty shell unchanged.  Mirror of session
    166 LOG/EXP/ALOG bare n=0 pins lifted onto the forward-
    hyperbolic family.
  - **n=0 Tagged-of-List, four ops:** `:l:{ } SINH/COSH/TANH/ASINH
    → :l:{ }` — outer tag preserved across empty inner List
    dispatch through 3-deep wrapper.  Mirror of session 166
    LOG/EXP/ALOG T+L n=0 pins lifted onto the forward-hyperbolic
    family.
  - **n=1 bare-List, four ops:** `{ Real(0) } SINH/TANH/ASINH →
    { Real(0) }` (clean zero fold for the trio); `{ Real(0) } COSH
    → { Real(1) }` (cosh(0)=1, the only non-identity fold in the
    family at the chosen input).  Pins per-element fold runs
    through the wrapper for n=1 — guards against a refactor that
    special-cases n=1 to bare-scalar dispatch and bypasses
    `_withListUnary`.
  - **n=1 Tagged-of-List, four ops:** `:h:{ Real(0) }
    SINH/TANH/ASINH → :h:{ Real(0) }` and `:h:{ Real(0) } COSH →
    :h:{ Real(1) }` — outer tag preserved + per-element fold for
    the singleton.  Closes the SINH/COSH/TANH/ASINH four-op
    forward-hyperbolic family on the T+L n=1 boundary.

- **Cluster 2 — COSH / TANH / ASINH heterogeneous-output
  mixed-input value pins on bare-List + Tagged-of-List
  composition.**  Session 120 pinned SINH bare-List +
  Tagged-of-List heterogeneous-output values directly (`SINH({0 1
  }) → {0 sinh(1)}` and `:lbl:{0 1} SINH → :lbl:{0 sinh(1)}` with
  both values asserted in `tests/test-types.mjs:3164-3190`).  For
  COSH/TANH/ASINH the s120 sweep only pinned type+length (both
  items Real, list-length 2) and did NOT pin the distinct output
  values per List position — it iterated the four ops with a
  type+length check loop, then dropped down to a SINH-only
  value-precise pin.  The sibling LOG/EXP/ALOG quartet got the
  heterogeneous-output value-pin treatment in session 168; the
  dual LNP1/EXPM got it in session 162/164 (bare-List axis) and
  session 164 (T+L axis).  This cluster lifts the same
  heterogeneous-output value-pin pattern onto COSH/TANH/ASINH on
  both bare-List and Tagged-of-List, completing the forward-
  hyperbolic four-op family on this axis.  Per-op identity-then-
  non-identity input pair `{0 1}` matches s120's input shape so
  the sibling-pin lineage is direct.  6 hard assertions:
  - **COSH bare/T+L pair:** `{ Real(0) Real(1) } COSH → { Real(1)
    Real(cosh(1)≈1.5430806348152437) }`; `:h:{ Real(0) Real(1) }
    COSH → :h:{ Real(1) Real(cosh(1)) }`.  Distinct values per
    List position — both items have non-zero, non-equal real
    output values, pinning per-element wrapper dispatch on COSH.
  - **TANH bare/T+L pair:** `{ Real(0) Real(1) } TANH → { Real(0)
    Real(tanh(1)≈0.7615941559557649) }`; `:h:{ Real(0) Real(1) }
    TANH → :h:{ Real(0) Real(tanh(1)) }`.
  - **ASINH bare/T+L pair:** `{ Real(0) Real(1) } ASINH → { Real(
    0) Real(asinh(1)≈0.881373587019543) }`; `:h:{ Real(0) Real(1)
    } ASINH → :h:{ Real(0) Real(asinh(1)) }`.  Closes the
    forward-hyperbolic SINH/COSH/TANH/ASINH four-op family on the
    T+L heterogeneous-output value-pin axis (s120 already covered
    SINH on both axes).

- **Verification at exit.**  `node tests/test-all.mjs` 5273 / 0
  (includes +5 in test-lists.mjs from a sibling-lane delta
  absorbed at gate-recheck between session 168's close and this
  run; only the +22 test-types delta is owned by this lane),
  `node tests/test-persist.mjs` 66 / 0, `node tests/sanity.mjs`
  22 / 0; `node tests/test-types.mjs` 917 ok lines (was 895 at
  session 171 entry — +22 hard assertions exactly matches the
  16 cluster-1 + 6 cluster-2 pins).  Probe used to verify the
  candidate paths before adding tests:
  `utils/@probe-fwdhyp-boundary.mjs`.

- **No source-side changes.**  Both clusters are pure pinning of
  already-live behavior; no `www/src/rpl/ops.js` or
  `www/src/rpl/algebra.js` edits.  Lane held: `tests/test-types
  .mjs`, `docs/DATA_TYPES.md`, `logs/session-171.md`.

### Resolved prior session (166)

- **Cluster 1 — LOG / EXP / ALOG n=0 empty-List + n=1
  single-element boundary closures on the bare-List + Tagged-of-List
  wrapper composition.**  Session 160 added n=0 / n=1 boundary pins
  on the LN axis only (explicit single-cluster scope), and session
  162 lifted those n=0 / n=1 closures onto the LNP1/EXPM dual pair
  (which bypasses `_unaryCx` entirely — distinct code path).  But
  the LOG / EXP / ALOG trio (the remaining three ops in the
  session-158 `_unaryCx`-routed quartet) had n=2 / n=3 pins from
  session 158 but no n=0 empty-List or n=1 single-element shoulder
  pins.  The matrix has carried L ✓ T ✓ on these ops since session
  100/105's wrapper-VM cleanup; the n=0 / n=1 axes were inherited
  from the convention rather than from a hard pin.  This cluster
  closes the LOG / EXP / ALOG trio on those shoulders.  12 hard
  assertions:
  - **LOG bare/Tagged n=0 pair:** `{ } LOG → { }`,
    `:l:{ } LOG → :l:{ }` — wrapper preserves empty shell unchanged
    on both bare and T+L paths; mirror of session 160 LN n=0 pin
    lifted onto LOG.
  - **LOG bare/Tagged n=1 pair:** `{ Integer(10) } LOG → { Integer(
    1) }`, `:l:{ Integer(10) } LOG → :l:{ Integer(1) }` — pins
    per-element EXACT-mode integer-clean fold runs through the
    wrapper for n=1; guards against a refactor that special-cases
    n=1 to bare-scalar dispatch and bypasses `_withListUnary`.
  - **EXP bare/Tagged n=0 pair:** `{ } EXP → { }`,
    `:l:{ } EXP → :l:{ }` — closes the EXP n=0 corner that the
    s158 n=2 pin does not enumerate.
  - **EXP bare/Tagged n=1 pair:** `{ Integer(0) } EXP → { Integer(
    1) }`, `:l:{ Integer(0) } EXP → :l:{ Integer(1) }` — exp(0)=1
    integer-clean per element under wrapper for n=1.
  - **ALOG bare/Tagged n=0 pair:** `{ } ALOG → { }`,
    `:l:{ } ALOG → :l:{ }` — closes the ALOG n=0 corner.
  - **ALOG bare/Tagged n=1 pair:** `{ Integer(2) } ALOG → {
    Integer(100) }`, `:l:{ Integer(2) } ALOG → :l:{ Integer(100) }`
    — high-magnitude integer output at n=1 pins
    `_exactUnaryLift`'s BigInt round-trip ran through the wrapper
    for the singleton.

- **Cluster 2 — ATANH n=0 closure + ACOSH/ATANH Tagged-of-List
  n=0 closures + ACOSH/ATANH n=1 single-element boundary closures
  on the direct-registered (non-`_unaryCx`) wrapper shape.**
  Session 160 added an n=0 bare-List ACOSH pin (`{ } ACOSH → { }`)
  but the symmetric ATANH n=0 case, both ops' Tagged-of-List n=0
  case, and both ops' n=1 single-element shoulder were unpinned.
  These ops dispatch through a bespoke direct-registered wrapper
  shape (not `_unaryCx`, see session 158 Cluster 1 header at
  `tests/test-types.mjs:5266-5278`), so the n=0 / n=1 boundary
  closures need explicit pinning on this shape — they aren't
  covered by the session-160 LN-axis pins (different code path) or
  session 162 LNP1/EXPM pins (different direct-registered ops).
  This cluster mirrors session 162 Cluster 2's structure (which
  closed the LNP1/EXPM dual on n=0 / n=1) onto the ACOSH/ATANH
  direct-registered dual.  7 hard assertions:
  - **ATANH bare-List n=0:** `{ } ATANH → { }` — symmetric to
    session 160's ACOSH n=0 pin lifted onto ATANH.  Closes the
    inverse-hyp dual on the n=0 bare-List axis.
  - **ACOSH/ATANH Tagged-of-List n=0 pair:** `:h:{ } ACOSH →
    :h:{ }`, `:h:{ } ATANH → :h:{ }` — outer tag preserved across
    empty inner List dispatch through 3-deep wrapper on direct-
    registered shape.  Closes the inverse-hyp dual on the n=0 T+L
    axis.
  - **ACOSH/ATANH bare-List n=1 pair:** `{ Real(1) } ACOSH → {
    Real(0) }` (acosh(1)=0 boundary), `{ Real(0) } ATANH → { Real(
    0) }` (atanh(0)=0 trivial) — n=1 shoulder pins on the direct-
    registered wrapper.
  - **ACOSH/ATANH Tagged-of-List n=1 pair:** `:h:{ Real(1) } ACOSH
    → :h:{ Real(0) }`, `:h:{ Real(0) } ATANH → :h:{ Real(0) }` —
    outer tag preserved + per-element fold for the singleton.
    Closes the inverse-hyp dual on the n=1 T+L axis.

- **Verification at exit.**  `node tests/test-all.mjs` 5186 / 0,
  `node tests/test-persist.mjs` 40 / 0, `node tests/sanity.mjs`
  22 / 0; `node tests/test-types.mjs` 889 ok lines (was 870 at
  session 166 entry — +19 hard assertions exactly matches the 12
  cluster-1 + 7 cluster-2 pins).  Probes used to verify the
  candidate paths before adding tests:
  `utils/@probe-log-exp-alog-boundary.mjs` and
  `utils/@probe-acosh-atanh-boundary.mjs`.

- **No source-side changes.**  Both clusters are pure pinning of
  already-live behavior; no `www/src/rpl/ops.js` or
  `www/src/rpl/algebra.js` edits.  Lane held: `tests/test-types
  .mjs`, `docs/DATA_TYPES.md`, `logs/session-166.md`.

### Resolved this session (162)

- **Cluster 1 — LNP1 / EXPM bare-List + Tagged-of-List composition
  through the 3-deep wrapper `_withTaggedUnary(_withListUnary(
  _withVMUnary(handler)))`.**  Session 130 Cluster 1 pinned LNP1
  Tagged-of-Vector composition; session 140 Cluster 2 pinned EXPM
  Tagged-of-Vector and Tagged-of-Matrix — closing the V/M axis on
  the LNP1/EXPM dual pair.  Session 158 closed the L + T+L
  composition axis on the LN / LOG / EXP / ALOG quartet (which
  routes through `_unaryCx`'s EXACT-mode `_exactUnaryLift` arm).
  But the LNP1/EXPM L + T+L composition was deferred — LNP1/EXPM
  bypass `_unaryCx` entirely (direct registration at
  `ops.js:7702/7709` with the bare 3-deep wrapper; inner handler
  is `Real(Math.log1p(toRealOrThrow(v)))` /
  `Real(Math.expm1(toRealOrThrow(v)))`), so the per-element fold
  contract is structurally distinct from the LN/LOG/EXP/ALOG
  family.  The matrix carried L ✓ T ✓ on both ops since session
  063 / 130 but no direct assertion on bare-List dispatch,
  Tagged-of-List composition outer-tag preservation, or the
  `_exactUnaryLift`-bypass contract.  9 hard assertions:
  - **LNP1 / EXPM bare-List Real-element pass-through pair**
    (`LNP1 { Real(0) Real(0) } → { Real(0) Real(0) }` per-element
    `Math.log1p` fold; `EXPM { Real(0) Real(0) } → { Real(0)
    Real(0) }` per-element `Math.expm1` fold) — pins bare
    `_withListUnary` distribution on both ops.
  - **LNP1 / EXPM bare-List Integer-input → Real-output per
    element pair** (`LNP1 { Integer(0) Integer(0) } → { Real(0)
    Real(0) }`; `EXPM { Integer(0) Integer(0) } → { Real(0)
    Real(0) }`) — DISTINCT from session 158's `LN { Integer(1)
    Integer(1) } → { Integer(0) Integer(0) }` integer-stay pin.
    Pins the absence of the `_exactUnaryLift` arm on LNP1/EXPM
    (which is correct — both ops bypass `_unaryCx`).  Closes the
    `_exactUnaryLift`-bypass contract on the L axis.
  - **LNP1 / EXPM Tagged-of-List composition pair** (`LNP1
    :n:{ Real(0) Real(0) } → :n:{ Real(0) Real(0) }`; `EXPM
    :e:{ Real(0) Real(0) } → :e:{ Real(0) Real(0) }`) — outer
    tag preserved across element-wise List dispatch through
    3-deep wrapper.  Closes the LNP1/EXPM dual pair on the T+L
    composition axis.
  - **LNP1 / EXPM heterogeneous-output mixed-input bare-List
    pair** (`LNP1 { Real(-0.5) Real(0) } → { Real(log1p(-0.5))
    Real(0) }`; `EXPM { Real(1) Real(0) } → { Real(expm1(1))
    Real(0) }`) — distinct values per List position pin per-
    element wrapper dispatch (NOT a uniform-output short-
    circuit).
  - **LNP1 boundary-throw propagation under bare-List** (`LNP1
    { Real(-1) }` → `Infinite result`) — pins that the inner
    handler's `RPLError('Infinite result')` propagates through
    bare `_withListUnary`'s `apply` loop (NOT swallowed, NOT
    replaced with NaN/null).  The Real(-1) point is the vertical
    asymptote of `log1p` (ln(0) = -∞).  Sibling contract to
    LN / LOG / etc. throwing on out-of-domain input.

- **Cluster 2 — LNP1 / EXPM n=0 empty-List + n=1 single-element
  boundary closures.**  Session 160 added n=0 / n=1 boundary pins
  on the LN axis but the same boundary closures on the LNP1/EXPM
  dual pair were not added (session 160 was a single-cluster
  scope on LN only).  This cluster lifts the n=0 / n=1 boundary
  closures onto LNP1 and EXPM, closing the dual pair on those
  shoulders.  6 hard assertions:
  - **LNP1 / EXPM n=0 bare-List boundary pair** (`{ } LNP1 → { }`;
    `{ } EXPM → { }`) — pins that the inner `_withListUnary`
    `apply` loop preserves an empty-List shell unchanged on both
    ops.  Mirror of session 160 LN n=0 pin lifted onto the duals.
  - **LNP1 / EXPM n=0 empty Tagged-of-List boundary pair**
    (`:l:{ } LNP1 → :l:{ }`; `:l:{ } EXPM → :l:{ }`) — outer tag
    preserved across empty inner List dispatch through 3-deep
    wrapper.  Closes the LNP1/EXPM dual pair on the n=0 T+L
    boundary.
  - **LNP1 / EXPM n=1 single-element bare-List boundary pair**
    (`{ Real(0) } LNP1 → { Real(0) }`; `{ Real(0) } EXPM →
    { Real(0) }`) — guards against a refactor that special-cases
    n=1 to the bare-scalar code path and bypasses the
    `_withListUnary` wrapper.  Closes the n=1 shoulder between
    cluster-2's n=0 pins and cluster-1's n=2 pins on both ops.

- **Verification at exit.**  `node tests/test-all.mjs` 5148 / 0,
  `node tests/test-persist.mjs` 40 / 0, `node tests/sanity.mjs`
  22 / 0; `node tests/test-types.mjs` 867 ok lines (was 852 at
  session 162 entry — +15 hard assertions exactly matches the 9
  cluster-1 + 6 cluster-2 pins).  Probe used to verify the
  candidate paths before adding tests:
  `utils/@probe-lnp1-expm-list.mjs`.

### Resolved this session (158)

- **Cluster 1 — ACOSH / ATANH bare-List + Tagged-of-List
  composition on the direct-registered (`_withTaggedUnary(
  _withListUnary(_withVMUnary(handler)))`) wrapper shape.**
  Session 120's hyperbolic-family List pin (`tests/test-types.mjs
  :3153`) iterated only `SINH / COSH / TANH / ASINH` — the four
  ops that route through `_unaryCx`'s external wrapping.  ACOSH
  / ATANH are direct-registered with the bespoke composition
  shape (per session 140 Cluster 1's comment block at
  `tests/test-types.mjs:5266-5278`), so the bare-List + Tagged-
  of-List axis on the **direct-registered shape** was never
  pinned; only the Tagged-of-Vector axis was (session 140
  Cluster 1).  The matrix carried L ✓ on the trig/hyperbolic
  row covering "SIN..ASIN..ATAN..ACOSH..ATANH (elementary)"
  but the L ✓ on the ACOSH / ATANH sub-axes was inherited from
  the convention text rather than from a hard-assertion pin.
  This cluster closes the L/T composition on the direct-
  registered ACOSH / ATANH handlers, including the EXACT-mode
  Integer-stay-exact composition per element and the out-of-
  domain Real→Complex bypass per element (mirror of session
  150 Cluster 2's bare-scalar out-of-domain pin lifted into
  the List axis).  10 hard assertions:
  - **ACOSH/ATANH bare-List Real in-domain pair:** `ACOSH
    {Real(1) Real(1)} → {Real(0) Real(0)}` (acosh(1)=0
    boundary) and `ATANH {Real(0) Real(0)} → {Real(0) Real(0)}`
    (atanh(0)=0 trivial); pins bare-List distribution on
    the direct-registered handlers.
  - **ACOSH/ATANH Tagged-of-List composition pair:** `ACOSH
    :h:{Real(1) Real(1)} → :h:{Real(0) Real(0)}` and `ATANH
    :h:{Real(0) Real(0)} → :h:{Real(0) Real(0)}`; outer tag
    preserved across element-wise List dispatch — closes
    ACOSH/ATANH pair on T+L axis.
  - **ACOSH/ATANH EXACT-mode Integer-stay-exact per element
    under bare List:** `ACOSH {Integer(1) Integer(1)} →
    {Integer(0) Integer(0)}` and `ATANH {Integer(0)
    Integer(0)} → {Integer(0) Integer(0)}`; mirror of session
    150 Cluster 2 bare-scalar pin lifted onto L axis on the
    direct-registered shape.
  - **ACOSH/ATANH out-of-domain Real→Complex bypass per
    element under bare List:** `ACOSH {Real(0)} → {Complex(0,
    ±π/2)}` and `ATANH {Real(2)} → {Complex(atanh(2)-iπ/2)}`
    (atanh(2) principal branch is 0.549… - i·π/2); pins that
    the in-domain check gates the bare-List composition so
    each out-of-domain element independently routes around
    `_exactUnaryLift` (which would otherwise crash on
    `Math.acosh(0) = NaN` / `Math.atanh(2) = NaN`) and
    emerges as Complex.
  - **HETEROGENEOUS in-domain + out-of-domain within a
    single bare List on ACOSH:** `ACOSH {Integer(1) Real(0)}
    → {Integer(0) Complex(0, ±π/2)}` — strong pin: the SAME
    `_withListUnary` invocation dispatches one element
    through the EXACT-mode Integer-stay arm (Integer(1) →
    Integer(0) via `_exactUnaryLift`) and another element
    through the out-of-domain Complex-principal-branch
    bypass (Real(0) → Complex(0, π/2)); pins per-element
    domain-check independence under the bare-List wrapper.
    Mirror of session 150 Cluster 3's heterogeneous LOG
    mixed-kind Tagged-V pin on the ACOSH heterogeneous
    domain-axis.
  - **HETEROGENEOUS within Tagged-of-List on ATANH:**
    `ATANH :h:{Real(0) Real(2)} → :h:{Real(0) Complex(atanh(
    2)-iπ/2)}` — strongest variant on the T+L axis; pins
    outer Tagged unwrap + inner List per-element dispatch
    + per-element domain check + tag re-apply, all in one
    observable result.

- **Cluster 2 — LN / LOG / EXP / ALOG bare-List + Tagged-of-
  List composition with EXACT-mode `_exactUnaryLift` Integer-
  stay-exact folds composing per element.**  Session 145
  Cluster 2 pinned bare-scalar EXACT-mode Integer-stay-exact;
  session 150 Cluster 3 lifted that into the wrapper-VM-
  under-Tagged composition (Tagged-of-V / Tagged-of-M).  This
  cluster closes the **dual axis**: bare-List + Tagged-of-
  List, the LIST axis of the wrapper composition, on the
  same `_unaryCx`-routed LN / LOG / EXP / ALOG quartet.  9
  hard assertions:
  - **LN bare-List zero pin:** `LN {Integer(1) Integer(1)}
    → {Integer(0) Integer(0)}` — mirror of session 150
    Cluster 3's `:v:V(Z(1),Z(1)) LN` pin on the bare-List
    axis.
  - **LOG bare-List three distinct integer outputs:**
    `LOG {Integer(1) Integer(10) Integer(100)} → {Integer(
    0) Integer(1) Integer(2)}` — three distinct integer-
    clean outputs at three List positions pin per-element
    wrapper dispatch.
  - **EXP bare-List non-zero output:** `EXP {Integer(0)
    Integer(0)} → {Integer(1) Integer(1)}` (exp(0)=1
    non-zero output pins inner EXP handler ran per element
    via bare `_withListUnary`).
  - **ALOG bare-List high-magnitude trio:** `ALOG {Integer
    (0) Integer(2) Integer(3)} → {Integer(1) Integer(100)
    Integer(1000)}` — high-magnitude non-zero integer
    outputs pin `_exactUnaryLift`'s BigInt round-trip per
    element under the bare-List wrapper.
  - **LN/LOG Tagged-of-List composition pair:** `LN :l:{
    Integer(1) Integer(1)} → :l:{Integer(0) Integer(0)}`
    and `LOG :l:{Integer(1) Integer(10) Integer(100)} →
    :l:{Integer(0) Integer(1) Integer(2)}`; outer tag
    preserved across element-wise List dispatch + per-
    element EXACT integer-stay fold.
  - **HETEROGENEOUS integer-clean / stay-symbolic within a
    single bare List on LOG:** `LOG {Integer(2) Integer(
    10)} → {Symbolic LOG(2), Integer(1)}` — log10(2)≈0.301
    NOT integer-clean → stay-symbolic via `_exactUnaryLift`
    fall-through; log10(10)=1 integer-clean → Integer(1).
    Strong pin: result is a mixed-kind List (Symbolic +
    Integer) — pins that `_exactUnaryLift`'s stay-symbolic
    fall-through and integer-clean fold both operate per
    element under the BARE List wrapper WITHOUT collapsing
    the whole List to a uniform output kind.  Mirror of
    session 150 Cluster 3's mixed-kind `:v:V(Z(2),Z(10))
    LOG` pin on the bare-List axis.
  - **HETEROGENEOUS within Tagged-of-List on LOG:** `LOG
    :l:{Integer(2) Integer(10)} → :l:{Symbolic LOG(2),
    Integer(1)}` — strongest variant on T+L axis; pins
    outer Tagged unwrap + inner List per-element dispatch
    + per-element EXACT branch (integer-clean OR stay-
    symbolic) + tag re-apply, all in one observable result.
  - **APPROX-mode bypass under bare List composition:**
    `LOG {Integer(1) Integer(100)} APPROX → {Real(0)
    Real(2)}` — APPROX-mode bypass composes per element
    under bare `_withListUnary`: APPROX flips KIND from
    Integer to Real per element, integer-clean output
    values still emerge but as Real.  Mirror of session
    150 Cluster 3's APPROX-under-Tagged-V pin on the
    bare-List axis.

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session — `ops.js` was lock-held by
  concurrent `session157-command-support` lane (which also
  held `docs/REVIEW.md` + `logs/`, so no review-finding
  promotion and no `logs/session-158.md` file written this
  run).  `tests/test-types.mjs`: +19 assertions (829 → 848).
  Test gates green at exit: `node tests/test-all.mjs`
  5105/0/0, `node tests/test-persist.mjs` 40/0, `node tests/
  sanity.mjs` 22/0.  Probe used to verify the candidate paths
  before writing the cluster: `utils/@probe-acosh-atanh-list
  .mjs`.

### Resolved this session (150)

- **Cluster 1 — Inverse-trig (ASIN / ACOS / ATAN) DEG-mode
  `_exactUnaryLift` Integer-stay-exact / Rational-collapse-clean
  under Tagged-V/M wrapper composition.**  `_trigInvCx`
  (`ops.js:8246`) inverts through `fromRadians(y)` AFTER the
  numeric primitive — distinct from `_trigFwdCx`'s pre-primitive
  `toRadians`.  Session 142 Cluster 1 pinned the bare-scalar
  inverse-trig DEG `_exactUnaryLift` (`ASIN(Integer(1))` DEG →
  `Integer(90)`); session 140 Cluster 2 pinned the inverse-trig
  Tagged-of-V/M wrapper composition under RAD with Real
  operands (which BYPASS the EXACT-mode integer-stay arm).
  Session 145 Cluster 3a closed the FORWARD-trig wrapper-VM
  composition under DEG.  This cluster closes the inverse-trig
  dual: DEG-mode integer-clean folds composing element-wise
  through the 3-deep `_withTaggedUnary(_withListUnary(_with
  VMUnary(handler)))` wrapper.  6 hard assertions:
  - **DEG-mode Tagged-V trio:** `:a:Vector(Integer(0),
    Integer(1)) ASIN` DEG → `:a:Vector(Integer(0), Integer(
    90))`; `:a:Vector(Integer(1), Integer(0)) ACOS` DEG →
    `:a:Vector(Integer(0), Integer(90))` (operand-symmetric);
    `:t:Vector(Integer(0), Integer(1)) ATAN` DEG → `:t:Vector(
    Integer(0), Integer(45))` (closes ASIN/ACOS/ATAN trio
    under wrapper composition; ATAN routes through
    `_trigInvCx` with `Math.atan` + `fromRadians` post-
    primitive, distinct primitive from ASIN/ACOS but same
    wrapper composition).
  - **Matrix-axis closure (ASIN):** `:m:Matrix([[Integer(1),
    Integer(0)], [Integer(0), Integer(1)]]) ASIN` DEG →
    `:m:Matrix([[Integer(90), Integer(0)], [Integer(0),
    Integer(90)]])` (per-entry asin(1)=90° / asin(0)=0 all
    fold to Integer; outer tag preserved + Matrix kind
    preserved across per-entry dispatch).
  - **Rational arm composes through Tagged-V:**
    `:a:Vector(Rational(1,2), Integer(1)) ASIN` DEG →
    `:a:Vector(Integer(30), Integer(90))` — Rational(1,2)=0.5,
    asin(0.5)=π/6, fromRadians(π/6) DEG = 30 ± drift
    integer-clean.  Distinct contract from session 145
    Cluster 3a's forward-trig wrapper-composition pin which
    only exercised Integer operands within Vector / Matrix;
    the inverse-trig Rational-arm CAN produce Integer
    outputs when `fromRadians` turns the radian value into
    an integer multiple of degrees.
  - **RAD-mode contrast on the SAME Integer operand
    (heterogeneous-kind output under wrapper composition):**
    `:a:Vector(Integer(0), Integer(1)) ASIN` RAD →
    `:a:Vector(Integer(0), Symbolic ASIN(1))` — item[0] still
    folds to Integer(0) since asin(0)=0 is integer-clean in
    any angle mode, but item[1] does NOT fold because
    asin(1)=π/2 ≈ 1.5708 is NOT integer-clean under RAD; the
    EXACT-mode integer-stay arm of `_trigInvCx` therefore
    returns Symbolic(AstFn('ASIN', [_toAst(Integer(1))]))
    for that element.  Distinct from session 140's
    `:a:Vector(Real(0), Real(1)) ASIN` RAD →
    `:a:Vector(Real(0), Real(π/2))` pin, which used Real
    operands and BYPASSED the EXACT-mode integer-stay arm
    entirely (Real input is not `isInteger || isRational`,
    so `_trigInvCx` falls through to the standard Real-
    output path).  Pins (a) the angle-mode flip toggles
    integer-clean / stay-Symbolic per element under Tagged-V
    on the SAME Integer operands (DEG → :a:V[Z(0), Z(90)];
    RAD → :a:V[Z(0), Sym(ASIN(1))]) and (b) the Real- vs
    Integer-operand contrast: same `_trigInvCx` wrapper
    composition, different output kinds (Real input → Real
    output; Integer input → mixed Integer + Symbolic per
    element under EXACT mode).

- **Cluster 2 — Forward-hyperbolic family (SINH / COSH / TANH /
  ASINH / ACOSH / ATANH) `_exactUnaryLift` Integer-stay-exact /
  Rational-stay-symbolic on bare scalars + ACOSH / ATANH
  out-of-domain Integer→Complex bypass on the bespoke handlers.**
  Session 145 Cluster 1 covered forward-trig bare-scalar; Cluster
  2 covered LN/LOG/EXP/ALOG bare-scalar; session 142 Cluster 1
  covered inverse-trig + inverse-hyp bare-scalar.  Forward-
  hyperbolic SINH/COSH/TANH/ASINH on Integer/Rational through
  `_unaryCx`'s EXACT arm AND the bespoke ACOSH/ATANH out-of-
  domain Integer→Complex fall-through were unpinned.  13 hard
  assertions:
  - **SINH/COSH/TANH zero trio:** `SINH(Integer(0))` →
    `Integer(0)`; `COSH(Integer(0))` → `Integer(1)` (non-zero
    output pins fold ran on COSH arm); `TANH(Integer(0))` →
    `Integer(0)` (closes SINH/COSH/TANH zero trio at bare-
    Integer).
  - **SINH stay-symbolic:** `SINH(Integer(1))` → `Symbolic
    SINH(1)` (sinh(1) ≈ 1.175 NOT integer-clean — stay-
    symbolic via `_exactUnaryLift`'s fall-through; mirror
    of session 145 Cluster 1's forward-trig stay-symbolic
    on the forward-hyperbolic axis).
  - **ASINH/ACOSH/ATANH zero/one folds:** `ASINH(Integer(
    0))` → `Integer(0)` (consistency-pin); `ACOSH(Integer(
    1))` → `Integer(0)` (in-domain integer-clean fold via
    bespoke handler `ops.js:8309`; consistency-pin in
    forward-hyperbolic zero-trio); `ATANH(Integer(0))` →
    `Integer(0)` (in-domain integer-clean fold via bespoke
    handler `ops.js:8329`).
  - **Out-of-domain Integer→Complex bypass on bespoke
    handlers:** `ATANH(Integer(2))` → Complex principal
    branch (out-of-domain |x|≥1 — the bespoke EXACT-mode
    arm checks `x > -1 && x < 1`; for Integer(2) the check
    fails, so the EXACT arm FALLS THROUGH (does NOT call
    `_exactUnaryLift`) into the shared real-branch code
    which itself falls through into the Complex principal-
    branch lift; pins that the in-domain check gates the
    integer-stay path so out-of-domain Integers don't crash
    `_exactUnaryLift` against `Math.atanh(2)=NaN`).
    `ACOSH(Integer(0))` → `Complex(0, ±π/2)` (out-of-domain
    x<1 — symmetric to ATANH out-of-domain Integer→Complex
    bypass on the ACOSH-domain axis).
  - **Rational stay-symbolic with payload preservation:**
    `SINH(Rational(1,2))` → `Symbolic SINH(1/2)` — sinh(0.5)
    ≈ 0.521 NOT integer-clean; symbolic payload carries
    `Bin('/', Num(1), Num(2))` so the Rational survives in
    the AST.  Mirror of session 145 Cluster 1/2's `SIN`
    /`LN`(Rational(1,2)) stay-symbolic payload pins on the
    forward-hyperbolic axis.
  - **Rational arm CAN produce Integer (collapse via
    numeric):** `TANH(Rational(0,1))` → `Integer(0)` —
    Rational(0,1) → 0.0; tanh(0) = 0 → integer-clean →
    Integer(0).  Mirror of session 145 Cluster 2's
    `LN(Rational(1,1))` → `Integer(0)` pin on the forward-
    hyperbolic axis.  Pins that the Rational arm is NOT a
    Symbolic-only branch when the underlying numeric value
    is integer-clean.
  - **APPROX-mode bypass uniform across `_unaryCx`-routed
    AND bespoke domain-aware handlers:** `SINH(Integer(0))`
    APPROX → `Real(0)` (NOT Integer; pins `_exactUnaryLift`
    is gated by `!getApproxMode()` on the SINH branch too).
    `ACOSH(Integer(1))` APPROX → `Real(0)` (pins that the
    bespoke ACOSH/ATANH handlers also gate their EXACT-mode
    integer-stay arm on `!getApproxMode()` — the bypass is
    UNIFORM across the forward-hyperbolic family, the
    `_unaryCx`-routed ops AND the bespoke domain-aware
    ones).

- **Cluster 3 — LN / LOG / EXP / ALOG `_exactUnaryLift`
  Integer-stay-exact under Tagged-V/M wrapper composition.**
  Session 145 Cluster 2 pinned LN/LOG/EXP/ALOG bare-scalar;
  session 145 Cluster 3a pinned the FORWARD-trig wrapper-VM
  composition.  The LN/LOG/EXP/ALOG wrapper-VM composition with
  EXACT-mode Integer-stay-exact folds composing element-wise
  was unpinned.  7 hard assertions:
  - **LN Tagged-V zero pin:** `:v:Vector(Integer(1),
    Integer(1)) LN` → `:v:Vector(Integer(0), Integer(0))`
    (mirror of session 145 Cluster 3a's `:v:V(Z(0),Z(0))
    SIN` RAD pin on the LN axis).
  - **LOG Tagged-V three distinct integer outputs at three
    positions:** `:v:Vector(Integer(1), Integer(10),
    Integer(100)) LOG` → `:v:Vector(Integer(0), Integer(1),
    Integer(2))` — pins per-element wrapper dispatch with
    distinct integer outputs at each V position.
  - **EXP Tagged-V non-zero output:** `:v:Vector(Integer(0
    ), Integer(0)) EXP` → `:v:Vector(Integer(1),
    Integer(1))` (exp(0)=1; non-zero output pins inner EXP
    handler ran on each position via wrapper composition).
  - **ALOG Tagged-V high-magnitude trio:** `:v:Vector(
    Integer(0), Integer(2), Integer(3)) ALOG` →
    `:v:Vector(Integer(1), Integer(100), Integer(1000))` —
    high-magnitude non-zero integer outputs pin
    `_exactUnaryLift`'s BigInt round-trip per element under
    the wrapper.  Mirror of session 145 Cluster 2's bare-
    scalar ALOG positive-integer trio lifted into wrapper.
  - **LOG Matrix-axis closure:** `:m:Matrix([[Integer(1),
    Integer(10)], [Integer(100), Integer(1000)]]) LOG` →
    `:m:Matrix([[Integer(0), Integer(1)], [Integer(2),
    Integer(3)]])` (Matrix-axis wrapper-VM composition with
    all-integer-clean outputs; mirror of session 145 Cluster
    3a's forward-trig Matrix-axis pin on the LN/LOG/EXP/
    ALOG axis).
  - **Mixed integer-clean / stay-symbolic within a single
    Tagged-V:** `:v:Vector(Integer(2), Integer(10)) LOG` →
    `:v:Vector(Symbolic LOG(2), Integer(1))` — strong
    heterogeneous-kind pin: log10(2)≈0.301 NOT integer-
    clean → stay-symbolic per `_exactUnaryLift`; log10(10)=
    1 integer-clean → Integer(1).  Pins that
    `_exactUnaryLift`'s stay-symbolic fall-through and
    integer-clean fold both operate per element under the
    wrapper composition WITHOUT collapsing the whole Vector
    to a single uniform output kind.  Result is a mixed-
    kind Vector (Symbolic + Integer) inside a Tagged
    wrapper, exercising the type-heterogeneity contract on
    the wrapper composition's output.
  - **APPROX-mode bypass under wrapper composition:**
    `:v:Vector(Integer(1), Integer(100)) LOG` APPROX →
    `:v:Vector(Real(0), Real(2))` — APPROX-mode bypass
    composes with the wrapper-VM-under-Tagged: APPROX flips
    KIND from Integer to Real per element under wrapper;
    integer-clean output values still emerge but as Real.
    Mirror of session 145 Cluster 2's bare-scalar APPROX-
    bypass pin lifted into the wrapper composition.

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session — `ops.js` was lock-held by
  concurrent session 149 command-support lane.
  `tests/test-types.mjs`: +26 assertions (803 → 829).  Test
  gates green: `test-all`, `test-persist`, `sanity` (counts in
  `logs/session-150.md`).  Surfaced findings (deferred —
  outside this lane's scope, ops.js locked):  COMB / PERM
  throw an unwrapped TypeError on Rational input via
  `_combPermArgs`'s `v.value.isFinite()` call (Rational.value
  is `{n,d}` BigInts, not a Decimal — `.isFinite` is
  undefined; should throw `RPLError('Bad argument type')` like
  IQUOT/IREMAINDER do).  See `logs/session-150.md` for user-
  reachable demos and exact gate counts.

### Resolved this session (145)

- **Cluster 1 — Forward trig SIN / COS / TAN EXACT-mode
  `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
  contract on bare scalars.**  `_trigFwdCx` (`ops.js:8027`) routes
  Integer / Rational inputs in EXACT mode through
  `_exactUnaryLift(name, realFn(toRadians(x)), v)`.  Distinct from
  `_unaryCx` because the angle-mode conversion `toRadians` is
  applied to the Integer / Rational input BEFORE the numeric
  primitive (`Math.sin` / `Math.cos` / `Math.tan`); the integer-
  clean check fires on the raw radian-domain result (no
  `fromRadians` inversion — distinct from inverse-trig
  `_trigInvCx` whose post-primitive `fromRadians` was pinned in
  session 142 Cluster 1).  Session 142 surfaced this gap as a
  candidate (forward-trig counterpart of session 142 Cluster 1).
  13 hard assertions:
  - **RAD-mode trivial integer-clean folds:** `SIN(Integer(0))`
    RAD → `Integer(0)`; `COS(Integer(0))` RAD → `Integer(1)`
    (non-zero output pins fold actually ran); `TAN(Integer(0))`
    RAD → `Integer(0)`.
  - **RAD-mode stay-symbolic on non-clean:** `SIN(Integer(1))`
    RAD → `Symbolic SIN(1)` (sin(1) ≈ 0.841 not int-clean);
    `COS(Integer(1))` RAD → `Symbolic COS(1)`.
  - **Angle-mode flip on the SAME operand:** `SIN(Integer(180))`
    RAD → `Symbolic SIN(180)` (sin(180 rad) ≈ -0.801 not int-
    clean) BUT `SIN(Integer(180))` DEG → `Integer(0)` (sin(π) ≈
    1.22e-16 < 1e-12 → round-to-integer).  Same operand, two
    angle modes, opposite sides of the integer-clean check.
  - **DEG-mode multiples-of-90° folds:** `COS(Integer(90))` DEG
    → `Integer(0)` (cos(π/2) ≈ 6.12e-17); `COS(Integer(180))`
    DEG → `Integer(-1)` (cos(π) = -1 exact in double — non-zero
    output pins fold ran on cos arm); `TAN(Integer(45))` DEG →
    `Integer(1)` (tan(π/4) = 1 int-clean).
  - **DEG-mode stay-symbolic on fractional output:**
    `SIN(Integer(30))` DEG → `Symbolic SIN(30)` (sin(30°) = 0.5
    not int-clean — pins the fractional-output stay-symbolic
    contract on the DEG axis).
  - **Rational stay-symbolic with payload preservation:**
    `SIN(Rational(1,2))` RAD → `Symbolic SIN(1/2)` — the
    symbolic payload carries `Bin('/', Num(1), Num(2))` so the
    Rational survives in the AST.
  - **APPROX-mode bypass:** `SIN(Integer(0))` RAD APPROX →
    `Real(0)` (NOT Integer) — `setApproxMode(true)` flips
    `getApproxMode()` so the EXACT-mode Integer/Rational arm in
    `_trigFwdCx` is skipped.  Pins that `_exactUnaryLift` is
    gated by the `!getApproxMode()` check.

- **Cluster 2 — LN / LOG / EXP / ALOG EXACT-mode
  `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
  contract on bare scalars.**  These four ops dispatch through
  `_unaryCx` (`ops.js:7984`); the EXACT-mode Integer / Rational
  arm calls `_exactUnaryLift(name, realFn(x), v)` where `realFn`
  is `Math.log` / `Math.log10` / `Math.exp` / `(x) => Math.pow(
  10, x)`.  Distinct from forward trig (Cluster 1) — there is no
  angle-mode conversion: the fold operates directly on the
  Integer / Rational value.  These four ops are the canonical
  examples called out in `_exactUnaryLift`'s doc-comment
  (`ops.js:1130-1137`) but had no direct stay-exact pin.  Session
  142 surfaced this gap.  18 hard assertions:
  - **LN canonical fold:** `LN(Integer(1))` → `Integer(0)`
    (canonical doc-comment example: ln(1)=0 trivial integer-
    clean); `LN(Integer(2))` → `Symbolic LN(2)` (ln(2) ≈ 0.693
    not int-clean — negative side of LN fold).
  - **LOG powers-of-ten quartet:** `LOG(Integer(1))` →
    `Integer(0)`; `LOG(Integer(10))` → `Integer(1)`;
    `LOG(Integer(100))` → `Integer(2)`; `LOG(Integer(1000))` →
    `Integer(3)` (Math.log10 returns exact integers for these
    inputs — pins multiple non-zero integer-clean outputs on
    the LOG arm); `LOG(Integer(2))` → `Symbolic LOG(2)` (log10(
    2) ≈ 0.301 not int-clean).
  - **EXP canonical fold + e preserved unevaluated:**
    `EXP(Integer(0))` → `Integer(1)` (canonical: exp(0)=1);
    `EXP(Integer(1))` → `Symbolic EXP(1)` (e ≈ 2.718 not int-
    clean — pins that EXP(1)=e stays symbolic; a future change
    that pre-folded e to a constant would surface here).
  - **ALOG canonical fold + powers-of-ten + negative-int
    operand:** `ALOG(Integer(0))` → `Integer(1)` (canonical:
    10⁰=1); `ALOG(Integer(2))` → `Integer(100)`;
    `ALOG(Integer(3))` → `Integer(1000)` (non-zero integer
    outputs pin BigInt round-trip without precision loss —
    `_exactUnaryLift` rounds Math.pow(10, n) back to BigInt; the
    LOG/ALOG inverse pair is now closed: LOG(100)=2 above mirrors
    ALOG(2)=100 here).  `ALOG(Integer(-1))` → `Symbolic ALOG(-1)`
    (10⁻¹ = 0.1 not int-clean; pins negative-integer-operand
    fall-through).
  - **Rational arm (CAN produce Integer):** `LN(Rational(1,1))`
    → `Integer(0)` — Rational(1,1) → 1.0 (numeric path divides
    n by d), Math.log(1) = 0, integer-clean → Integer(0).  Pins
    that the Rational arm is NOT a Symbolic-only branch when the
    underlying numeric value collapses to an integer.  Distinct
    from session 142 Cluster 1's `ASIN(Rational(1,2))` DEG →
    `Integer(30)` pin — there the angle-mode `fromRadians`
    produced the integer-clean output; here it's the Rational
    value itself collapsing to 1.0 before the numeric primitive
    runs.
  - **Rational stay-symbolic with payload preservation:**
    `LN(Rational(1,2))` → `Symbolic LN(1/2)` — symbolic payload
    carries `Bin('/', Num(1), Num(2))`.  Mirror of Cluster 1's
    `SIN(Rational(1,2))` RAD pin on the LN arm.
  - **APPROX-mode bypass on three ops:** `LN(Integer(1))` APPROX
    → `Real(0)`; `LOG(Integer(100))` APPROX → `Real(2)`
    (integer-clean output value 2 still emerges, but as Real not
    Integer — pins APPROX flips the result KIND not the result
    VALUE); `EXP(Integer(0))` APPROX → `Real(1)` (closes the
    LN/LOG/EXP APPROX trio).

- **Cluster 3 — SIN / COS / TAN EXACT-mode integer-stay-exact
  under Tagged-V/M wrapper composition + RE / IM M-axis
  inner-Tagged-inside-Matrix rejection.**  Two halves with
  parallel structure on already-widened ops.

  (a) **Forward trig EXACT-mode integer-stay-exact under
  Tagged-V/M wrapper composition.**  Session 140 Cluster 1
  pinned `:v:Vector(0, 0) SIN` → `:v:Vector(0, 0)` on Real
  inputs and pinned the SINH `_exactUnaryLift` Integer-stay-
  exact under Tagged-V; the forward-trig (`SIN/COS/TAN`)
  Tagged-V/M wrapper composition with EXACT-mode integer-clean
  fold was unpinned — Cluster 1 above closed the bare-scalar
  axis but not the wrapper composition.  6 hard assertions:
  - **SIN/COS/TAN Tagged-V RAD trio:** `:v:Vector(Integer(0),
    Integer(0)) SIN` RAD → `:v:Vector(Integer(0), Integer(0))`
    (mirror of session-140 SINH Tagged-V Integer-stay-exact pin
    on the forward-trig axis); `:v:Vector(Integer(0), Integer(0))
    COS` RAD → `:v:Vector(Integer(1), Integer(1))` (non-identity
    output value pins inner handler ran on COS arm); `:v:Vector(
    Integer(0), Integer(0)) TAN` RAD → `:v:Vector(Integer(0),
    Integer(0))` (closes SIN/COS/TAN trio).
  - **DEG-mode angle-flip under Tagged-V:** `:v:Vector(Integer(
    0), Integer(180)) SIN` DEG → `:v:Vector(Integer(0), Integer(
    0))` — operand-position-1 flips between RAD (stay-symbolic,
    sin(180 rad) ≈ -0.801) and DEG (integer-clean, sin(π) ≈
    1.22e-16 → 0).  Pins that the angle-mode-aware integer-
    clean fold composes element-wise under outer Tagged.
  - **Mixed integer-clean output values across V positions:**
    `:v:Vector(Integer(0), Integer(90)) COS` DEG → `:v:Vector(
    Integer(1), Integer(0))` (cos(0°)=1 exact, cos(90°) ≈ 6.12e-
    17 → 0; pins that distinct integer outputs at distinct V
    positions all fold under the wrapper chain).
  - **Matrix-axis SIN under Tagged composition:** `:m:Matrix([[
    Integer(0), Integer(180)], [Integer(0), Integer(0)]]) SIN`
    DEG → `:m:Matrix([[0,0],[0,0]])` (per-entry integer-clean
    fold under outer Tagged + M-axis wrapper-VM; closes the
    forward-trig Tagged-M Integer-stay-exact path).

  (b) **RE / IM M-axis inner-Tagged-inside-Matrix rejection.**
  Session 142 Cluster 3 pinned the V-axis on all four bespoke-
  V/M ops (ARG/CONJ/RE/IM) plus the M-axis on ARG and CONJ; RE
  / IM M-axis was left open because `_reScalar` / `_imScalar`
  are distinct per-element handlers from `_argScalar` /
  `_conjScalar` so the V-axis pins don't transitively cover the
  M-axis (the bespoke V/M dispatch is `v.rows.map(r =>
  r.map(_reScalar))` — distinct handler chain).  4 hard
  assertions:
  - **RE M-axis (single entry):** `Matrix([[:x:Complex(3,4)]])
    RE` → `'Bad argument type'` (M-axis RE inner-Tagged
    rejection — bespoke `_reScalar` in `r.map(_reScalar)` chain
    not Tagged-aware).
  - **IM M-axis (single entry):** `Matrix([[:x:Complex(3,4)]])
    IM` → `'Bad argument type'` (closes the 4-op × 2-axis
    ARG/CONJ/RE/IM inner-Tagged-rejection grid).
  - **RE multi-position on row[0]:** `Matrix([[Real(5),
    :x:Complex(3,4)]]) RE` → `'Bad argument type'` (Tagged at
    row[0][1] still rejects — pins column-iteration reaches the
    per-element rejection; rejection fires at every entry-
    position, not only (0,0) — contrast pin against an early-
    bail-out implementation).
  - **IM multi-position on row[1]:** `Matrix([[Real(5)],
    [:x:Complex(3,4)]]) IM` → `'Bad argument type'` (Tagged at
    row[1][0] still rejects — pins multi-row iteration also
    reaches the per-element rejection on the IM arm).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session — `ops.js` is lock-held by
  concurrent session 144 command-support lane.
  `tests/test-types.mjs`: +41 assertions (762 → 803).  Test
  gates green: `test-all` (recorded in session log);
  `test-persist` 38 / 0; `sanity` 22 / 0.  See `logs/session-145.md`
  for user-reachable demos and exact gate counts.

### Resolved this session (140)

- **Cluster 1 — Hyperbolic family Tagged-of-Vector / Tagged-of-
  Matrix wrapper-VM composition (SINH / COSH / TANH / ASINH /
  ACOSH / ATANH).**  All six hyperbolic ops dispatch through the
  3-deep wrapper `_withTaggedUnary(_withListUnary(_withVMUnary(
  handler)))` — SINH / COSH / TANH / ASINH via `_unaryCx`
  (`ops.js:7856`), ACOSH / ATANH via direct `_withTaggedUnary(
  _withListUnary(_withVMUnary(...)))` registration (`ops.js:7992`,
  `:8012`).  Session 120 Cluster 1 pinned bare-scalar Tagged
  transparency, List distribution, and Symbolic-lift through
  Tagged on this family; session 130 Cluster 1 pinned the
  wrapper-VM composition for SQRT / FACT / LNP1 / SIN — but
  the hyperbolic 3-deep wrapper-VM composition was unpinned.
  9 hard assertions:
  - **SINH Tagged-Matrix:** `:m:Matrix([[0,0],[0,0]]) SINH` →
    `:m:Matrix([[0,0],[0,0]])` (per-entry sinh(0)=0; wrapper-VM
    under Tagged on Matrix axis).
  - **COSH Tagged-Vector (non-identity output value):**
    `:v:Vector(0, 0) COSH` → `:v:Vector(Real(1), Real(1))`
    (cosh(0)=1; the non-identity output value pins that the inner
    handler actually ran — distinguishing this from a hypothetical
    no-op that just preserves the input).
  - **TANH Tagged-Matrix:** `:t:Matrix([[0,0],[0,0]]) TANH` →
    `:t:Matrix([[0,0],[0,0]])` (Matrix-axis wrapper-VM on TANH).
  - **ASINH Tagged-Vector:** `:h:Vector(0, 0) ASINH` →
    `:h:Vector(0, 0)` (inverse-hyperbolic Vector axis through
    `_unaryCx`).
  - **ACOSH Tagged-Vector:** `:h:Vector(1, 1) ACOSH` →
    `:h:Vector(0, 0)` (acosh(1)=0 boundary; direct-registered
    wrapper composition on V — pins that the alternative
    registration shape composes identically with outer Tagged).
  - **ATANH Tagged-Vector:** `:h:Vector(0, 0) ATANH` →
    `:h:Vector(0, 0)` (atanh(0)=0; direct-registered wrapper).
  - **EXACT-mode Integer-stay-exact path under Tagged-V:**
    `:h:Vector(Integer(0), Integer(0)) SINH` → `:h:Vector(
    Integer(0), Integer(0))` — SINH on Integer(0) routes through
    the `(isInteger(v) || isRational(v)) && !getApproxMode()`
    branch of `_unaryCx`, which calls `_exactUnaryLift` to produce
    Integer(0) for the clean-integer sinh(0)=0 fold.  Pins that
    the EXACT-mode integer preservation composes through the
    wrapper chain — the inner item type stays `'integer'`, NOT
    `'real'`, distinct from the Real(0) input case which produces
    Real(0).
  - **Inner-Tagged-inside-Vector rejection on hyperbolic:**
    `Vector(:x:Real(0), :y:Real(0)) SINH` → 'Bad argument type'.
    The Vector at level 1 is NOT Tagged at the top level, so
    `_withTaggedUnary` doesn't intercept; the `_withVMUnary`
    inner dispatch then sees Vector items that are themselves
    Tagged scalars, and the inner per-element handler is NOT
    Tagged-aware (the `_withTaggedUnary` wrapper sits OUTSIDE
    `_withVMUnary` in the wrapper composition chain).  Mirror of
    session 130 Cluster 3's inner-Tagged-inside-List rejection on
    the binary surface, extended to the hyperbolic unary V
    surface.

- **Cluster 2 — Inverse-trig family Tagged-of-V/M wrapper-VM
  composition (ASIN / ACOS / ATAN) plus EXPM Tagged-of-V/M.**
  ASIN / ACOS dispatch through direct `_withTaggedUnary(
  _withListUnary(_withVMUnary(handler)))` registration
  (`ops.js:8044`, `:8062`); ATAN dispatches through `_trigInvCx`
  (`ops.js:7929`); EXPM dispatches through direct registration
  (`ops.js:7249`).  All four use the same 3-deep wrapper shape.
  Session 130 Cluster 1 pinned LNP1 Tagged-of-Vector wrapper-VM
  composition; the inverse-trig family was unpinned and EXPM was
  unpinned (only LNP1 was covered in session 130; LNP1 and EXPM
  share the same wrapper shape but are distinct registrations at
  `ops.js:7242` vs `:7249`).  All assertions run with explicit
  `setAngle('RAD')` and a `try / finally` restore so any prior
  angle-mode state survives.  9 hard assertions:
  - **ASIN Tagged-Vector:** `:a:Vector(0, 1) ASIN` →
    `:a:Vector(Real(0), Real(π/2))` (RAD; clean asin(0)=0 plus
    π/2 within 1e-12).
  - **ACOS Tagged-Vector (operand-symmetric):** `:a:Vector(1, 0)
    ACOS` → `:a:Vector(Real(0), Real(π/2))` (acos(1)=0; same
    boundaries as ASIN, different result mapping).
  - **ASIN Tagged-Matrix:** `:m:Matrix([[0,1],[-1,0]]) ASIN` →
    `:m:Matrix([[0, π/2], [-π/2, 0]])` (Matrix-axis wrapper-VM
    on ASIN; ±π/2 at ±1).
  - **ACOS Tagged-Matrix:** `:m:Matrix([[1,0],[-1,1]]) ACOS` →
    `:m:Matrix([[0, π/2], [π, 0]])` (closes the inverse-trig pair
    on the Matrix axis).
  - **ATAN Tagged-Vector:** `:a:Vector(0, 0) ATAN` →
    `:a:Vector(0, 0)` (ATAN routes through `_trigInvCx` — distinct
    helper from ASIN/ACOS but same 3-deep wrapper shape; pins
    that the helper-difference doesn't break the wrapper
    composition under Tagged).
  - **EXPM Tagged-Vector:** `:e:Vector(0, 0) EXPM` →
    `:e:Vector(0, 0)` (LNP1/EXPM dual pair; closes the EXPM
    Tagged-V axis that session 130 left open).
  - **EXPM Tagged-Matrix:** `:e:Matrix([[0,0],[0,0]]) EXPM` →
    `:e:Matrix([[0,0],[0,0]])` (Matrix-axis EXPM under Tagged;
    closes the LNP1/EXPM pair on M).

- **Cluster 3 — ARG bare V/M axis + ARG / CONJ / RE / IM
  Tagged-of-V/M composition with bespoke V/M dispatch INSIDE
  the 2-deep wrapper.**  Distinct wrapper shape from clusters
  1 / 2: ARG / CONJ / RE / IM use `_withTaggedUnary(_withListUnary(
  handler))` — only 2-deep — and the V/M dispatch happens BESPOKE
  inside the inner handler (NOT through `_withVMUnary`).  See
  `ops.js:1379` (ARG), `:1414` (CONJ), `:1420` (RE), `:1426`
  (IM); each handler does:

      register('CONJ', _withTaggedUnary(_withListUnary((s) => {
        const v = s.pop();
        if (isVector(v))      s.push(Vector(v.items.map(_conjScalar)));
        else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_conjScalar))));
        else                  s.push(_conjScalar(v));
      })));

  The matrix carries `V ✓ M ✓` for these ops since session 064
  (per-element dispatch via `_<op>Scalar`) and `T ✓` since session
  068; session 110 pinned ARG Tagged transparency on bare Complex;
  session 100 pinned Sy round-trip on CONJ / RE / IM via
  `defaultFnEval` folds — but the bare V/M axis on ARG was
  unpinned, and the Tagged-of-V/M composition through this
  2-deep-bespoke wrapper shape was unpinned for all four ops.
  All assertions run with explicit `setAngle('RAD')` + try/finally
  restore.  18 hard assertions across 9 blocks (each block with
  preserve-shape + values pins where applicable):
  - **ARG bare Vector (Real axis):** `Vector(Real(3), Real(-2))
    ARG` → `Vector(Real(0), Real(π))` (atan2 convention: non-
    negative Real = 0, negative Real = π).
  - **ARG bare Vector (Complex axis):** `Vector(Complex(3,4),
    Complex(0,1)) ARG` → `Vector(Real(atan2(4,3)), Real(π/2))`
    (Complex per-element ARG; closes the bare-V axis on the
    Complex domain that the matrix listed `V ✓` since session
    063 but no direct test pinned).
  - **ARG bare Matrix:** `Matrix([[Complex(0,1), Real(1)],
    [Real(-1), Complex(0,-1)]]) ARG` → `Matrix([[π/2, 0], [π,
    -π/2]])` (Matrix-axis with mixed Complex/Real entries; pins
    that the bare-M dispatch handles cross-type elements).
  - **ARG Tagged-of-Vector:** `:v:Vector(Complex(3,4), Complex(0,1))
    ARG` → `:v:Vector(Real(atan2(4,3)), Real(π/2))` (Tagged-of-V
    composition through the 2-deep wrapper with bespoke V dispatch
    inside — distinct from clusters 1/2's 3-deep wrapper-VM
    composition; same observable Tagged-preservation behavior on
    the outside).
  - **CONJ Tagged-of-Vector (mixed Complex/Real):**
    `:z:Vector(Real(5), Complex(3,4), Real(-1)) CONJ` →
    `:z:Vector(Real(5), Complex(3,-4), Real(-1))` (per-element
    `_conjScalar` flips Complex.im sign, Real stays Real; outer
    tag preserved + V kind preserved).
  - **CONJ Tagged-of-Matrix:** `:m:Matrix([[Complex(1,2),
    Complex(3,4)], [Real(5), Complex(6,-7)]]) CONJ` →
    `:m:Matrix([[Complex(1,-2), Complex(3,-4)], [Real(5),
    Complex(6,7)]])` (Matrix-axis composition; outer tag preserved
    + M kind preserved across per-entry CONJ).
  - **RE Tagged-of-Matrix (kind preservation across full Complex→Real
    collapse):** `:m:Matrix([[Complex(1,2), Complex(3,4)], [Real(5),
    Complex(6,-7)]]) RE` → `:m:Matrix([[Real(1), Real(3)], [Real(5),
    Real(6)]])` (every entry collapses to Real-only; M kind preserved
    across the per-entry Complex→Real collapse — closes the kind-
    preservation contract on the Matrix axis when EVERY entry
    undergoes the Complex→Real collapse).
  - **IM Tagged-of-Vector:** `:z:Vector(Complex(1,2), Complex(3,-4),
    Real(5)) IM` → `:z:Vector(Real(2), Real(-4), Real(0))` (per-
    entry imaginary part — Complex(re,im)→Real(im); Real(x)→Real(0)
    since Real has no imaginary part).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session — `ops.js` is lock-held by
  concurrent session 139 command-support lane.  `tests/test-types.mjs`:
  +36 assertions (703 → 739).  Test gates green: `test-all` 4635 / 0;
  `test-persist` 38 / 0; `sanity` 22 / 0.  See `logs/session-140.md`
  for user-reachable demos and exact gate counts.

### Resolved this session (135)

- **Cluster 1 — Rational × Vector / Rational × Matrix arithmetic
  broadcast on `+ - * /`.**  The compact reference rows for
  `+ - * /` carry `V ✓ M ✓` from session 063 and the session-092
  convention text introduced Rational as a first-class numeric
  peer (Z ⊂ Q ⊂ R ⊂ C).  Session 115 Cluster 2 pinned the full
  Q × Q / Q × Z / Q × R / Q × C arithmetic surface on scalar
  arithmetic, and session 125 Cluster 3 pinned the Q→R degradation
  contract on MIN / MAX / MOD; but no direct test had pinned the
  *broadcast* of a Rational scalar onto a Vector or Matrix, nor
  the per-element type contract on V/M arithmetic.  The relevant
  code path is `_scalarBinaryMixed → _arithmeticOnArrays`, which
  runs the inner per-element arithmetic via `promoteNumericPair`;
  that helper has a `'rational'` kind branch that stays-exact via
  `Fraction.js` arithmetic, so Q × Q-element stays Rational (with
  d=1 collapse to Integer at the result layer), Q × Z-element
  stays-exact via the rational kind and may collapse to Integer
  at d=1, and Q × R-element degrades to Real per element via
  the real kind.  Eight hard assertions:
  - **Q × R-element on Vector (degradation):**
    `Vec[Real(2), Real(4)] * Rational(1,2)` → `Vec[Real(1),
    Real(2)]` (Q×R per element degrades to Real; pins the V/M
    extension of the MIN/MAX/MOD Q→R contract from session 125
    Cluster 3 to the V/M arithmetic surface).
  - **Q × R-element, operand-order symmetric:** `Rational(1,2) +
    Vec[Real(1), Real(2)]` → `Vec[Real(1.5), Real(2.5)]` (left-Q
    broadcast).
  - **Q + Q-element stays-exact on Vector:** `Rational(1,2) +
    Vec[Rational(1,3), Rational(1,4)]` → `Vec[Rational(5,6),
    Rational(3,4)]` (per-element `_rationalBinary`; V-broadcast
    extension of session 115 Cluster 2's scalar Q+Q pin).
  - **Q × Q-element with d=1 collapse on Vector:** `Rational(1,2)
    * Vec[Rational(2,1), Rational(4,1)]` → `Vec[Integer(1),
    Integer(2)]` (d=1 collapse fires per element).
  - **V ÷ Q with Q-typed elements:** `Vec[Rational(1,1),
    Rational(2,1)] / Rational(1,2)` → `Vec[Integer(2),
    Integer(4)]` (Q/Q stay-exact + d=1 collapse on the division
    operator's rational kind).
  - **V − Q with Real-typed elements:** `Vec[Real(3), Real(4)] -
    Rational(1,2)` → `Vec[Real(2.5), Real(3.5)]` (sign-correct
    subtraction — distinct from the addition pins above).
  - **Z × Q on Matrix (d=1 collapse on M-axis):**
    `Matrix[[Integer(2), Integer(4)], [Integer(6), Integer(8)]]
    * Rational(1,2)` → `Matrix[[Integer(1), Integer(2)],
    [Integer(3), Integer(4)]]` (Z×Q stays-exact + d=1 collapse
    per entry on the Matrix axis — closes the M-axis on the same
    Q-broadcast contract).
  - **V + V with mixed Q / R element types:** `Vec[Rational(1,2),
    Rational(3,4)] + Vec[Real(1), Real(1)]` → `Vec[Real(1.5),
    Real(1.75)]` (per-element Q+R degrades to Real on V+V
    pairwise — different code path from scalar broadcast: each
    pair sees Q on the left, R on the right at the same index).

- **Cluster 2 — Tagged-of-Vector / Tagged-of-Matrix on BINARY
  arithmetic via `_withTaggedBinary(_withListBinary(handler))`
  for `+ - * /`.**  Session 130 Cluster 1 pinned the UNARY surface
  (SQRT, FACT, LNP1, NEG, ABS) on Tagged-of-V/M with the 3-deep
  wrapper `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`.
  This cluster covers the BINARY surface — the wrapper is the
  2-deep `_withTaggedBinary(_withListBinary(handler))` and the
  inner handler dispatches to `_arithmeticOnArrays` for V/M
  scalar-broadcast, V+V/V−V/V·V (dot product), and M·M (matmul).
  At a `Tagged(label, V|M)` input on either side, the order is:
  (1) `_withTaggedBinary` checks both top-2 stack slots; if
  either is Tagged, both are popped and unwrapped (per HP50 AUR
  §3.4 binary tag-drop, NOT preserving any tag); (2)
  `_withListBinary` doesn't intercept V/M (only RList); (3) the
  inner handler runs the V/M dispatch directly on the unwrapped
  payloads; (4) result is the un-Tagged V/M (or scalar for V·V
  dot product, Matrix for M·M matmul).  Eleven hard assertions:
  - **Left-Tagged-V + bare-scalar:** `:v:Vec[1, 2] + Integer(1)`
    → `Vec[Real(2), Real(3)]` (un-Tagged Vector — binary tag-drop,
    V scalar-broadcast).
  - **Right-Tagged-V (operand-order symmetric):** `Integer(1) +
    :v:Vec[1, 2]` → `Vec[Real(2), Real(3)]`.
  - **Both-Tagged-V pairwise:** `:a:Vec[1, 2] + :b:Vec[3, 4]` →
    `Vec[Real(4), Real(6)]` (both tags drop, pairwise V+V).
  - **Left-Tagged-M scalar-broadcast:** `:m:Mat[[1,2],[3,4]] *
    Integer(2)` → `Mat[[Real(2), Real(4)], [Real(6), Real(8)]]`
    (scalar broadcast across all entries; tag drops).
  - **Bespoke V·V dot product through tag-drop (kind change V →
    R):** `:a:Vec[1, 2] * :b:Vec[3, 4]` → `Real(11)` (1·3+2·4=11
    — closes the binary surface analog of session 125 Cluster 2's
    bespoke ABS V → R kind-change pin).
  - **Matmul through tag-drop (Matrix kind preserved):**
    `:m:Mat[[1,2],[3,4]] * Mat[[1,0],[0,1]]` → `Mat[[1,2],[3,4]]`
    (matmul; tag drops but Matrix kind survives).
  - **Right-Tagged-scalar divisor on V/scalar:** `Vec[8, 10] /
    :s:Integer(2)` → `Vec[Real(4), Real(5)]` (operand-order
    symmetric to left-Tagged on V).
  - **Left-Tagged-V minus bare-scalar:** `:v:Vec[5, 7] -
    Integer(1)` → `Vec[Real(4), Real(6)]` (subtraction surface;
    distinct inner handler from `+`).
  - **Left-Tagged-scalar × bare-V:** `:s:Integer(2) * Vec[1, 2]`
    → `Vec[Real(2), Real(4)]` (closes all four operand-shape
    combinations: T-V × bare-scalar, bare-scalar × T-V, T-V × T-V,
    T-scalar × bare-V).
  - **Inner-Tagged-inside-Vector binary rejection:** `Vec[:x:Real(1),
    :y:Real(2)] + Vec[Real(1), Real(2)]` → 'Bad argument type'.
    The Vector at level 2 is NOT Tagged at the top level, so
    `_withTaggedBinary` doesn't intercept; the inner handler sees
    a Vector with Tagged elements and the per-element arithmetic
    helper rejects.  Mirror of session 130 Cluster 3's inner-
    Tagged-inside-List rejection on the V-axis of binary
    arithmetic.
  - **Dimension-mismatch survives Tagged unwrap:** `:a:Vec[1, 2,
    3] + :b:Vec[1, 2]` → 'Invalid dimension' (the V+V size check
    fires AFTER the Tagged unwrap; user-facing error is the
    dimension error, NOT a Tagged-related error).

- **Cluster 3 — Tag-identity contract on `==` / `SAME` plus
  BinInt base-agnostic equality contract.**  The Tagged row in
  the `==` / `SAME` block of the matrix carried the Notes phrase
  "same tag AND same value" since session 072, and session 074
  added BinInt × BinInt with wordsize masking; but no direct
  test had pinned (a) the *different-tag* failure mode at the
  same payload value, (b) the missing-tag-on-one-side mismatch
  (`Tagged ≠ bare`), (c) the same-tag + different-value mismatch,
  or (d) the BinInt cross-base contract — `eqValues` on BinInt
  × BinInt compares masked values, NOT the `.base` field.
  Twelve hard assertions:
  - **Tagged truth table on `==` (4 combinations):**
    - `:a:Real(5) == :a:Real(5)` → 1 (same tag + same value).
    - `:a:Real(5) == :a:Real(6)` → 0 (same tag + different value).
    - `:a:Real(5) == :b:Real(5)` → 0 (different tags + same
      value — tag identity matters; the canonical "tags are part
      of the type-shape" pin).
    - `:a:Real(5) == Real(5)` → 0 (Tagged vs bare; structural
      compare, NO implicit unwrap on `==` — contrast with the
      binary-arithmetic surface where binary tag-drop makes
      Tagged transparent at the operator level; equality is
      structural, not arithmetic).
    - Symmetric: `Real(5) == :a:Real(5)` → 0.
  - **SAME mirrors `==` on the Tagged surface (3 pins):**
    `SAME :a:Real(5) :a:Real(5)` → 1; `SAME :a:Real(5)
    :b:Real(5)` → 0 (tag mismatch); `SAME :a:Real(5) Real(5)` →
    0 (Tagged vs bare).  All return Real, never Symbolic.
  - **BinInt base-agnostic equality:** `#5h == #5d` → 1.  Pins
    that `eqValues` on BinInt × BinInt compares values masked by
    the current wordsize, NOT the `.base` field — base is purely
    cosmetic (formatter-only).
  - **BinInt base-agnostic SAME:** `SAME #5h #5d` → 1.  Distinct
    from session 074's "SAME does not type-coerce" stance — base
    difference is NOT a type difference for BinInt × BinInt
    (both operands are still type `'binaryInteger'`); only the
    cosmetic `.base` field differs, and SAME does not reject on
    that.
  - **BinInt different value, different base:** `SAME #5h #6d`
    → 0.  Pins that base agnosticism does NOT swallow value
    differences — value mismatch wins.
  - **BinInt cross-base ordered compare:** `#5h < #6d` → 1.
    Pins that `comparePair` also ignores the formatter base —
    closes the cross-base contract on the comparator family
    (session 074 pinned BinInt × Z, session 130 pinned BinInt ×
    Q, but BinInt × BinInt cross-base was unpinned).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session.  `tests/test-types.mjs`: +31
  assertions (672 → 703).  Test gates green: `test-all` 4522 / 0;
  `test-persist` 38 / 0; `sanity` 22 / 0.  See `logs/session-135.md`
  for user-reachable demos and exact gate counts.

### Resolved this session (130)

- **Cluster 1 — Tagged-of-Vector / Tagged-of-Matrix composition
  through `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`
  on the wrapper-VM-using unary family.**  Every elementary unary
  op that uses `_withVMUnary` (SQRT, FACT, LNP1, EXPM, the trig and
  hyperbolic family, ASIN/ACOS/ATAN, …) has a 3-deep wrapper
  composition: T → L → VM → handler.  At a `Tagged(label, V|M)`
  input the order is: (1) `_withTaggedUnary` unwraps and pushes
  the V/M; (2) `_withListUnary` doesn't intercept V/M; (3)
  `_withVMUnary` distributes element-wise via a temp-stack pattern;
  (4) `_withTaggedUnary` re-tags the resulting V/M.  The matrix
  carried these cells as `T ✓ / V ✓ / M ✓` since session 063 but
  no direct test pinned the *composition* — session 125 Cluster 2
  pinned the bespoke ABS-Tagged-Vector path (where ABS does NOT
  route through `_withVMUnary` — it has a bespoke isVector
  branch that emits a scalar Frobenius), but the
  wrapper-VM-with-Tagged composition itself was unpinned, and the
  Matrix axis on bespoke ABS was also unpinned.  12 hard
  assertions:
  - **SQRT wrapper-VM Tagged-Vector:** `:v:Vector(4, 9) SQRT` →
    `:v:Vector(Real(2), Real(3))` (outer tag preserved across
    element-wise SQRT through the 3-deep wrapper).
  - **SIN wrapper-VM Tagged-Vector:** `:v:Vector(0, 0) SIN` →
    `:v:Vector(0, 0)` (transcendental inner handler at RAD mode;
    cleanest pin avoids IEEE drift).
  - **FACT wrapper-VM Tagged-Vector:** `:v:Vector(0, 5) FACT` →
    `:v:Vector(Integer(1), Integer(120))` (integer-domain inner
    handler composes through `_withVMUnary` per element under
    Tagged).
  - **SQRT wrapper-VM Tagged-Matrix:** `:m:Matrix([[4,9],[16,25]])
    SQRT` → `:m:Matrix([[2,3],[4,5]])` (per-element SQRT through
    Matrix axis under outer Tagged).
  - **NEG bespoke-V/M Tagged-Matrix:** `:m:Matrix([[1,-2],[3,-4]])
    NEG` → `:m:Matrix([[-1,2],[-3,4]])` (NEG has its own bespoke
    isMatrix branch — does NOT use `_withVMUnary` — but the outer
    `_withTaggedUnary(_withListUnary(...))` chain composes the
    same way; closes the bespoke-V/M-with-Tagged surface that
    session 125 only covered for ABS-Vector).
  - **ABS bespoke-Matrix cross-kind:** `:m:Matrix([[3,0],[0,4]])
    ABS` → `:m:Real(5)` (Frobenius √(9+16) = 5; M → R kind change
    preserves outer tag, mirror of session 125's bespoke V → R
    pin on the Matrix axis).
  - **LNP1 wrapper-VM Tagged-Vector:** `LNP1 :v:Vector(0, 0)` →
    `:v:Vector(0, 0)` (stable-near-zero log per element through
    `_withVMUnary` under outer Tagged).

- **Cluster 2 — BinaryInteger × Rational cross-family on `==` /
  `≠` / `<` / `>` / `≤` / `≥` and SAME's strict no-coerce
  contract.**  `_binIntCrossNormalize` (`ops.js:4453`) wraps `==`
  and `≠` / `<>` and masks BinInt → Integer with the current
  wordsize before routing through `eqValues` →
  `promoteNumericPair`.  `comparePair` (`ops.js:4502`) does the
  same masking inline before routing.  Both then send Integer ×
  Rational through the `'rational'` kind branch — for `==` it's
  value equality (`n1 * d2 == n2 * d1`), for ordered compare it's
  a cross-multiply (no Real round-trip — preserves exactness).
  Session 110 Cluster 3 pinned Q × Z, Q × R, Q × C and the
  ordered-compare rational branch but stopped short of B × Q —
  which is the *composition* of two cross-family widenings (B → Z
  in `_binIntCrossNormalize` / `comparePair`, then Z × Q in
  `promoteNumericPair`'s rational kind).  Session 074 added
  BinInt to compare widening directly but only pinned B × Z /
  B × R / B × C, not B × Q.  SAME deliberately stays strict
  (`ops.js:4477`) — `_binIntCrossNormalize` is NOT applied — so
  `SAME #10h Rational(16,1)` = 0 even though `#10h ==
  Rational(16,1)` = 1.  12 hard assertions:
  - **`==` cross-widen:** `#10h == Rational(16,1)` → 1 (BinInt
    masks to Integer(16), then rational kind: 16*1 == 16*1);
    `#10h == Rational(33,2)` → 0 (16 vs 16.5; cross-multiply
    32 vs 33).
  - **`≠` parity:** `#10h ≠ Rational(33,2)` → 1 (routes through
    the same `_binIntCrossNormalize`).
  - **SAME strict-stay:** `SAME #10h Rational(16,1)` → 0 (extends
    session 074's BinInt-strict contract from B × Z to B × Q;
    pins both halves of the contract — `==` widens, SAME
    doesn't).
  - **Ordered compare cross-multiply:**
    - `#10h < Rational(33,2)` → 1 (cross-multiply 16*2=32 < 33*1=33).
    - `Rational(33,2) > #10h` → 1 (operand-order symmetric to <).
    - `Rational(7,3) ≤ #3h` → 1 (Q × B; cross-multiply 7 ≤ 9).
    - `Rational(2,1) ≥ #2h` → 1 (rational-branch equality
      boundary; Rational(2,1) does not auto-collapse to Integer
      at the constructor — collapse happens at op-level result
      — but the rational-kind compare fires correctly).
  - **Negative Q vs zero BinInt:** `Rational(-3,4) < #0h` → 1
    (cross-multiply -3 < 0; pins that BinInt at value 0 still
    routes through the rational branch with no division-by-zero
    on the d=1 side).
  - **Wordsize-mask edges (ws=8, restored to 64 in finally):**
    - `#100h == Rational(0,1)` → 1 (#100h & 0xFF = 0 = 0/1; mask
      fires before the rational compare).
    - `#FFh > Rational(254,1)` → 1 (mask preserves in-range value;
      255 > 254).
    - `#1FFh < Rational(300,1)` → 1 (mask BEFORE compare;
      #1FFh & 0xFF = 255 < 300, NOT 511 > 300 — same masking
      discipline pinned on B × Z ordered compare in session 074).

- **Cluster 3 — Tagged-of-List composition on binary ops via
  `_withTaggedBinary(_withListBinary(handler))`.**  The percent
  family (`%` / `%T` / `%CH`) and the binary-numeric family with
  list distribution (GCD / LCM / MOD / MIN / MAX / COMB / PERM /
  IQUOT / IREMAINDER) all wrap with `_withTaggedBinary` OUTSIDE
  `_withListBinary`.  At a Tagged input on either side the order
  is: (1) `_withTaggedBinary` checks both top-2 slots; if either
  is Tagged, both are popped and unwrapped (tag values dropped
  per HP50 AUR §3.4 binary tag-drop); (2) `_withListBinary` then
  sees the unwrapped values and distributes if either is a list;
  (3) the inner scalar handler runs per element; (4) result is
  the un-Tagged List (binary tag-drop — no re-tag on binary
  ops).  Session 120 Cluster 2 pinned both-side / left-only /
  right-only tag-drop on the percent family with bare-scalar
  operands; session 125 Cluster 1 pinned bare-list distribution
  on the combinatorial / divmod / GCD / LCM / MOD / MIN / MAX
  surface; this cluster covers the *composition* — Tagged
  outside List on one or both operands — on a representative
  sample, plus the deliberate inner-Tagged-inside-List rejection
  on the binary surface (mirror of session 125 Cluster 2's unary
  rejection on NEG).  11 hard assertions:
  - **Left-Tagged-of-List × scalar on `%`:** `:lbl:{80 40} 25 %`
    → `{Real(20), Real(10)}` (Tagged unwrap + scalar broadcast;
    result is un-Tagged List per binary tag-drop).
  - **Right-Tagged-of-List on `%T`:** `50 :p:{25 75} %T` →
    `{Real(50), Real(150)}` (right-Tagged-of-List, scalar × List
    broadcast on the percent base; operand-order symmetric to
    the left case).
  - **Both-Tagged-of-List on `%`:** `:a:{80 40} :b:{25 50} %` →
    `{Real(20), Real(20)}` (both tags drop, both lists pair-
    distribute through the wrapper chain).
  - **Left-Tagged-of-List × bare-List on `GCD`:** `:a:{12 18} {6
    9} GCD` → `{Integer(6), Integer(9)}` (left-Tagged unwrap +
    pairwise distribution; GCD's integer fast path emits Integer).
  - **Both-Tagged-of-List on `MOD`:** `:a:{10 7} :b:{3 2} MOD` →
    `{Integer(1), Integer(1)}` (both-Tagged + pairwise + integer
    fast path; contrast with MOD's Q→R degradation pinned in
    session 125 Cluster 3).
  - **Left-Tagged-of-List × scalar on `COMB`:** `:lbl:{5 6} 2
    COMB` → `{Integer(10), Integer(15)}` (Tagged unwrap + List ×
    scalar broadcast through the combinatorial path).
  - **Both-Tagged-bare-scalar on `MIN`:** `:a:Integer(5)
    :b:Integer(3) MIN` → `Integer(3)` (both-Tagged scalar without
    List on a binary-numeric op; integer fast path on MIN —
    distinct from the percent family pinned in session 120
    Cluster 2).
  - **Inner-Tagged-inside-List binary rejection:** `{:x:80 :y:40}
    25 %` → `'Bad argument type'`.  `_withTaggedBinary` only
    inspects the top-2 stack slots; the List (level 2) is NOT
    Tagged at the top level.  Then `_withListBinary`'s recursive
    `apply` (`ops.js:519`) calls the inner handler DIRECTLY (NOT
    back through the wrapped function), so inner Tagged scalars
    in a list see the bare scalar handler, which calls
    `toRealOrThrow` on a Tagged and rejects.  Mirrors session
    125 Cluster 2's unary inner-Tagged-inside-List rejection on
    NEG, with the additional dimension that the binary surface
    has TWO operand positions both subject to the same wrapper
    composition order.
  - **Bare-scalar Tagged tag-drop contrast:** `:a:80 25 %` →
    `Real(20)` (bare-scalar Tagged tag-drop already pinned in
    session 120 — repeated here as a contrast pin documenting
    that the same wrapper chain handles bare-scalar correctly,
    so the failure mode in the rejection pin above is
    *specifically* the inner-Tagged-inside-List recursion order,
    not Tagged-handling per se).
  - **Right-Tagged-of-List × scalar on `LCM`:** `4 :lbl:{6 9}
    LCM` → `{Integer(12), Integer(36)}` (right-Tagged-of-List,
    scalar × Tagged-List path on a combinatorial-adjacent op;
    same answer as session 125's bare-scalar × bare-List LCM pin
    via the Tagged-unwrap path).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session.  `tests/test-types.mjs`: +35
  assertions (637 → 672).  Test gates green: `test-all` 4409 / 0;
  `test-persist` 38 / 0; `sanity` 22 / 0.  See `logs/session-130.md`
  for user-reachable demos and exact gate counts.

### Resolved this session (125)

- **Cluster 1 — List distribution on the arity-2 numeric family
  (`COMB` / `PERM` / `IQUOT` / `IREMAINDER` / `GCD` / `LCM` / `XROOT` /
  `MOD` / `MIN` / `MAX`).**  All ten ops are wrapped in
  `_withListBinary` and listed `L ✓` in their respective rows since
  session 064 (Combinatorial / integer-divmod family) and session 105
  (Sy round-trip pass), but no direct test pinned the
  `_withListBinary` distribution axes (scalar × List, List × scalar,
  pairwise same-size, size mismatch).  Session 115 Cluster 3 covered
  these axes on `NEG` / `FLOOR` and `+` / `-` / `*` but stopped short
  of the combinatorial / divmod / GCD / LCM / XROOT / MOD / MIN / MAX
  surface, where the inner handler does its own domain check
  (`integer-or-finite-real-with-rejection` for COMB / PERM / GCD /
  LCM, `integer-or-Real` for IQUOT / IREMAINDER / MOD, real-positive
  radicand for XROOT).  14 hard assertions:
  - **COMB axes:** scalar×List `5 COMB {0 2 5}` → `{1 10 1}`;
    List×scalar `{5 6 7} 2 COMB` → `{10 15 21}`; pairwise same-size
    `{5 6} {2 3} COMB` → `{10 20}`; size-mismatch
    `{5} {2 3} COMB` → `'Invalid dimension'`.
  - **PERM:** List×scalar `{5 6} 2 PERM` → `{20 30}`.
  - **IQUOT:** pairwise `{17 20} {5 3} IQUOT` → `{3 6}`.
  - **IREMAINDER:** scalar×List `17 {5 3} IREMAINDER` → `{2 2}`.
  - **GCD:** pairwise `{12 15} {18 10} GCD` → `{6 5}`.
  - **LCM:** scalar×List `4 {6 9} LCM` → `{12 36}`.
  - **XROOT:** List×scalar (Real-radicand path) `{8 27} 3 XROOT` →
    `{Real(2) Real(3)}` (real path emits Real even at clean integer
    cube roots).
  - **MOD:** pairwise `{10 7} {3 2} MOD` → `{1 1}` (integer fast
    path emits Integer).
  - **MIN:** List×scalar `{1 5 3} 2 MIN` → `{Real(1) Real(2) Real(2)}`
    (Real branch — Real(2) broadcast forces Real result).
  - **MAX:** pairwise on Integer-typed lists `{1 5 3} {4 2 8} MAX`
    → `{Integer(4) Integer(5) Integer(8)}` (Integer fast path
    fires when *both* operands are Integer).

- **Cluster 2 — Tagged-of-List composition on the rounding / sign /
  abs family (`FLOOR` / `CEIL` / `IP` / `FP` / `SIGN` / `ABS`).**
  The wrapper composition `_withTaggedUnary(_withListUnary(handler))`
  makes `:lbl:{a b} OP` → `:lbl:{OP(a) OP(b)}` — Tagged unwraps first,
  list distributes inside, outer tag re-applies on the resulting
  list.  Session 110 / 120 pinned bare-Tagged on these ops and
  session 115 Cluster 3 pinned bare-List on `NEG` / `FLOOR`; this
  cluster covers the *composition* on a different unary subfamily,
  plus the deliberate inner-Tagged-inside-List rejection, plus the
  bespoke ABS-Tagged-Vector cross-kind pin.  10 hard assertions:
  - **Tagged-outer-of-List, scalar-elementwise:**
    `:lbl:{Real(7.2) Real(-1.5)} FLOOR` → `:lbl:{Real(7) Real(-2)}`
    (round toward -∞);
    `:lbl:{Real(7.2) Real(-1.5)} CEIL` → `:lbl:{Real(8) Real(-1)}`;
    `:a:{Real(7.2) Real(-7.2)} IP` → `:a:{Real(7) Real(-7)}` (trunc
    toward zero, NOT -8 — contrast with FLOOR);
    `:a:{Real(7.2)} FP` → `:a:{Real(0.2 ± 1e-16 IEEE drift)}`;
    `:u:{Real(-3) Real(0) Real(5)} SIGN` →
    `:u:{Real(-1) Real(0) Real(1)}` (Real branch emits Real, NOT
    Integer — distinct from the Q→Z collapse path pinned in session
    120 Cluster 3);
    `:v:{Real(3) Real(-4)} ABS` → `:v:{Real(3) Real(4)}` (scalar
    elementwise — NOT Frobenius, contrast with the Vector pin
    below).
  - **Bespoke ABS-Tagged-Vector cross-kind pin:**
    `:v:Vector(Real(3), Real(4)) ABS` → `:v:Real(5)` — Frobenius
    runs *inside* `_withTaggedUnary`, so the outer tag survives the
    V→R kind change at the inner handler.  Pins that the bespoke V
    branch (which bypasses `_withVMUnary`) still composes with the
    Tagged wrapper correctly.
  - **Nested list inside Tagged:**
    `:lbl:{{Real(1.5) Real(2.5)} {Real(3.5) Real(4.5)}} FLOOR` →
    `:lbl:{{Real(1) Real(2)} {Real(3) Real(4)}}` (the list wrapper
    recurses; outer Tagged preserved on the doubly-nested result).
  - **Deliberate inner-Tagged-inside-List rejection:**
    `:v:{:x:Real(1) :y:Real(-2)} NEG` → `'Bad argument type'`.  The
    list wrapper recurses into the inner scalar handler, which is
    NOT Tagged-aware (the `_withTaggedUnary` wrapper sits OUTSIDE
    `_withListUnary` in the composition chain — same-shape pin as
    session 115 Cluster 3's `{:x:1 :y:-2} NEG` rejection but with an
    additional outer Tagged confirming both directions of wrapper
    composition order: outer-Tagged-then-List works, inner-Tagged-
    inside-List doesn't).

- **Cluster 3 — Rational `Q→R` degradation contract on
  `MIN` / `MAX` / `MOD`.**  Distinct from the arithmetic family
  (`+ - * / ^`) which preserves Q via `promoteNumericPair`'s
  `'rational'` kind (session 115 Cluster 2 pinned the full surface),
  the `_minMax` and MOD inner handlers do NOT route through the
  rational-kind branch — they check `isInteger(a) && isInteger(b)`
  for the integer fast path and fall through `toRealOrThrow` for
  everything else, including Q.  Result: `MIN Rational(1,2)
  Rational(1,3)` returns `Real(0.333…)`, NOT `Rational(1,3)`.  This
  is by design (MIN / MAX / MOD have always been Real-valued for
  non-Integer inputs) and pinning it documents the current behavior
  so a future widening pass that adds a Q column on these rows
  knows whether to preserve or flip the contract.  10 hard
  assertions:
  - **Q × Q degrades to Real:** `MIN Rational(1,2) Rational(1,3)`
    → `Real(≈0.333)`; `MAX Rational(1,2) Rational(1,3)` →
    `Real(0.5)`; `MOD Rational(7,2) Rational(1,3)` →
    `Real(≈1/6 ± 1e-16)` (the Real path drifts off 1/6 because
    1/3 isn't exactly representable as a 64-bit float).
  - **Q × Z degrades to Real (operand-order symmetric):**
    `MIN Rational(1,2) Integer(1)` → `Real(0.5)`;
    `MIN Integer(1) Rational(1,2)` → `Real(0.5)` (integer-fast-path
    guard `isInteger(a) && isInteger(b)` fails on the Q operand).
  - **Q × R degrades to Real:** `MAX Rational(3,2) Real(0.7)` →
    `Real(1.5)`.
  - **Q × Z on MOD:** `MOD Rational(7,2) Integer(2)` → `Real(1.5)`
    (3.5 mod 2 = 1.5 via `_hp50ModReal`).
  - **Symbolic lift wins over numeric routing:**
    `MIN Rational(1,2) Name(X)` → `Symbolic` — the `_isSymOperand`
    check runs *before* the numeric Q→R degradation, so Q survives
    in the AST as `Bin('/', Num(1), Num(2))` per the Sy convention
    from session 092 (no Q→R degradation in the symbolic path).
  - **Complex(im≠0) rejection wins over Q:**
    `MAX Rational(1,2) Complex(0,2)` → `'Bad argument type'`;
    `MOD Rational(1,2) Complex(0,2)` → `'Bad argument type'`.  Q is
    a peer of Real / Integer in the rejection path — it does NOT
    bypass the `isComplex(a) || isComplex(b)` rejection guard.
  - **Contrast pin:** `+ Rational(1,2) Rational(1,3)` →
    `Rational(5,6)` (arithmetic stays Q — single contrast assertion
    documenting that the Q-degrading behaviour above is specific to
    MIN / MAX / MOD, not a property of the Q type itself).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`, or
  `formatter.js` this session (all held by concurrent session 124
  command-support lane).  `tests/test-types.mjs`: +43 assertions
  (594 → 637).  Test gates green: `test-all` 4300/0; `test-persist`
  38/0; `sanity` 22/0.  See `logs/session-125.md` for user-reachable
  demos and exact gate counts.

### Resolved this session (120)

- **Cluster 1 — Hyperbolic family Tagged transparency, List
  distribution, and Symbolic-lift through Tagged.**  All six ops
  (`SINH`/`COSH`/`TANH`/`ASINH`/`ACOSH`/`ATANH`) sit under the
  "Unary — invert / square / sqrt / elementary functions" row and
  show `T ✓ / L ✓ / N ✓ / Sy ✓` since session 063, but no direct
  test pinned the `_withTaggedUnary` re-tag-with-same-label
  contract on this specific subfamily, the `_withListUnary`
  per-element distribution, or the Tagged-outer-of-List unwrap
  order on a transcendental inner handler.  13 hard assertions:
  - `:t:Real(0) SINH` → `:t:Real(0)` (identity at zero, tag
    preserved).
  - `:lbl:Real(0) COSH` → `:lbl:Real(1)`.
  - `:k:Real(1) TANH` → `:k:Real(tanh(1))` ≈ 0.7616.
  - `:v:Real(2) ASINH/ACOSH` → `:v:Real(<asinh(2)/acosh(2)>)` and
    `:v:Real(0.5) ATANH` → `:v:Real(atanh(0.5))`.
  - **Wrapper-order pin:** `:v:Real(2) ATANH` →
    `Tagged(v, Complex)` — the inner handler picks Real-vs-Complex
    *after* the Tagged unwrap (|x|>1 lifts to Complex via the
    principal branch), and the outer re-tag is type-agnostic on
    the inner.
  - `:z:Complex(0,1) SINH` → `Tagged(z, Complex)` with the
    inner ≈ `i·sin(1)` (passes the Complex through the Real-domain
    inner without coercing).
  - `:v:Name(X) SINH` → `Tagged(v, Symbolic)` — pins the
    composition order: Tagged unwraps first, the inner handler
    sees a Name and lifts to Symbolic, the outer re-tag fires
    on the Symbolic result.
  - List distribution shape pin for SINH/COSH/TANH/ASINH on
    `{Real(0), Real(1)}` (each returns a 2-element list of Reals).
  - SINH numeric pin: `SINH({0 1})` → `{0 sinh(1)}`.
  - **Tagged-outer-of-List:** `:lbl:{0 1} SINH` → `:lbl:{0 sinh(1)}`
    (Tagged wrapper unwraps first, List wrapper distributes
    inside, outer Tagged re-applies — same recursion order as
    the session 115 Cluster 3 NEG variant but on a transcendental
    op that reaches a different inner handler).

- **Cluster 2 — Tagged tag-drop on the percent family
  (`%` / `%T` / `%CH`).**  All three list `T ✓` since session 064
  with the comment "Session 064 added L/T", but no direct test
  pinned the `_withTaggedBinary` either-side-or-both unwrap-
  and-drop on these specific ops (distinct inner handler from the
  arithmetic family pinned in session 115 Cluster 1).  9 hard
  assertions:
  - **Both-sides tag-drop:** `:a:Real(80) :b:Real(25) %` →
    `Real(20)` (no Tagged envelope on result — HP50 AUR §3.4
    binary tag-drop, mirror of session 115 Cluster 1).
  - `:a:Real(50) :b:Real(20) %T` → `Real(40)`.
  - `:a:Real(50) :b:Real(20) %CH` → `Real(-60)`.
  - **Left-only tag:** `:a:Real(80) Real(25) %` → `Real(20)`
    (left tag drops; result is plain Real).
  - **Right-only tag:** `Real(80) :p:Real(25) %` → `Real(20)`
    (right tag drops).
  - **List broadcast on the percent base:** `{80 40} 25 %` →
    `{Real(20) Real(10)}` (% distributes over base — first
    argument).
  - **V/M ✗ rejection** (session 072 flipped these from blank to ✗
    but no direct test pinned it): `Vector × Real %` and
    `Real × Matrix %` both throw 'Bad argument type'.

- **Cluster 3 — Rational unary stay-exact contract.**  The
  "Rational (`Q`) — session 092" convention text describes the
  EXACT-mode stay-exact dispatch and APPROX-mode Real collapse,
  but no per-op row carries a Q column and no direct test pinned
  the integer-collapse boundaries.  29 hard assertions:
  - **Stay-exact unary:** `NEG Rational(1,2)` → `Rational(-1,2)`
    (sign on numerator); `INV Rational(2,3)` → `Rational(3,2)`;
    `SQ Rational(-3,4)` → `Rational(9,16)`; `ABS Rational(-3,4)`
    → `Rational(3,4)`.
  - **`d=1` collapse on INV:** `INV Rational(1,5)` → `Integer(5)`
    (Rational(5,1) collapses to Integer at the result layer).
    Note that SQ deliberately does NOT collapse — `SQ Rational(2,1)`
    stays as `Rational(4,1)`, a different code path.  This is a
    pin of current behavior; the inconsistency is intentional or a
    review-lane finding for a future pass.
  - **SQRT routing:** perfect-square Q stays-exact:
    `SQRT Rational(9,16)` → `Rational(3,4)`; `SQRT Rational(0,1)`
    → `Integer(0)` (zero radicand collapses).  Non-square Q lifts
    to Symbolic in EXACT: `SQRT Rational(2,1)` → `Symbolic` (no
    implicit Real coercion).  Negative Q lifts to Complex:
    `SQRT Rational(-1,1)` → `Complex(0, 1)` (principal branch).
  - **SIGN Q→Z collapse:** `SIGN Rational(-3,4)` → `Integer(-1)`,
    `SIGN Rational(0,1)` → `Integer(0)`,
    `SIGN Rational(3,4)` → `Integer(1)`.
  - **Rounding Q→Z collapse:** FLOOR / CEIL / IP all collapse Q
    to Integer (the integer part is exact, no Rational needed):
    - `FLOOR Rational(7,2)` → `Integer(3)` (round toward -∞);
      `FLOOR Rational(-7,2)` → `Integer(-4)`.
    - `CEIL Rational(7,2)` → `Integer(4)` (round toward +∞);
      `CEIL Rational(-7,2)` → `Integer(-3)`.
    - `IP Rational(7,2)` → `Integer(3)` (trunc toward zero);
      `IP Rational(-7,2)` → `Integer(-3)` (NOT -4 — sign-
      preserving truncation, contrast with FLOOR).
  - **FP stays Q for non-integer Q, collapses for integer-valued:**
    `FP Rational(7,2)` → `Rational(1,2)` (exact fractional);
    `FP Rational(-7,2)` → `Rational(-1,2)` (sign preserved on
    numerator); `FP Rational(6,3)` → `Integer(0)` (Rational(6,3)
    canonicalises to 2/1 at the constructor — integer-valued Q
    has zero fractional part).
  - **APPROX-mode collapse:** wrapping
    `setApproxMode(true) … finally setApproxMode(false)`:
    `INV Rational(2,3)` → `Real(1.5)`,
    `SQ Rational(2,3)` → `Real(0.4444…)`,
    `FLOOR Rational(7,2)` → `Real(3)` (NOT Integer — APPROX flips
    Q to the real-kind branch even for the rounding family).
  - **Out-of-domain rejection:** `FACT Rational(5,1)` →
    'Bad argument type' (Q rejected even at integer-valued —
    deliberate Q-as-first-class-type stance, NOT silently
    coerced to Real); `XPON Rational(1,2)` → 'Bad argument type';
    `MANT Rational(1,2)` → 'Bad argument type'.

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`,
  or `formatter.js` this session (all held by concurrent session
  119 command-support lane).  `tests/test-types.mjs`: +68
  assertions (524 → 594).  `test-all` 4182 / 0; `test-persist`
  38 / 0; `sanity` 22 / 0.  See `logs/session-120.md` for the
  user-reachable demo and exact gate counts.

### Resolved this session (115)

- **Cluster 1 — Binary Tagged tag-drop on `+ - * / ^` and the
  binary-numeric family.**  `_withTaggedBinary` (defined in
  `www/src/rpl/ops.js`) wraps every binary numeric op and
  unwraps Tagged on either or both operands before dispatching
  to the inner handler; the result is returned **without** a
  Tagged envelope (HP50 AUR §3.4 — unlike unary ops, there is
  no single obvious label to keep on a binary result).  The
  matrix carried these cells as ✓ on the T axis but no direct
  test pinned the drop-on-output contract or the either-side
  unwrap.  17 hard assertions:
  - `:a:Real(5) + :b:Real(3)` → `Real(8)` (both-sides tag drop).
  - `:a:Integer(10) - Integer(3)` → `Integer(7)` (left-only tag).
  - `Integer(10) * :b:Integer(3)` → `Integer(30)` (right-only tag).
  - `:a:Real(6) / :b:Real(2)` → `Real(3)`.
  - `:a:Integer(2) ^ :b:Integer(8)` → `Integer(256)`.
  - MOD / MIN / MAX / COMB / PERM / IQUOT / IREMAINDER / GCD /
    LCM with both operands tagged — each pinned with the correct
    non-Tagged Integer/Real result.
  - Symbolic-lift through tag unwrap:
    `:a:Name('X') + :b:Real(5)` → `Symbolic(Bin('+', X, 5))`
    (tag unwrap runs *before* the Name→Symbolic lift detects the
    symbolic operand).

- **Cluster 2 — Rational arithmetic on `+ - * / ^` end-to-end.**
  The `promoteNumericPair` routing (`types.js`) sends mixed
  numeric pairs through four named kinds: `'integer' / 'rational' /
  'real' / 'complex'`.  The Rational arithmetic path
  (`_rationalBinary` in ops.js, line 418) goes through Fraction.js
  for exact arithmetic with canonical Integer collapse when
  `d === 1n`.  `Q × Real → Real` widens via the real kind;
  `Q × Complex → Complex` widens via the complex kind; `Q ^ Integer`
  stays exact through `Fraction.pow(n)`.  APPROX-mode collapse
  routes Rational through `toRealOrThrow` at the scalar level.
  The matrix carried these behaviours under "Rational (`Q`) —
  session 092" in the convention text but had no direct test of
  the full arithmetic surface (session 110 pinned compare &
  equality, not arithmetic).  15 hard assertions:
  - Q×Q exact: `Rational(1,2) + Rational(1,3)` → `Rational(5,6)`;
    `Rational(3,4) - Rational(1,4)` → `Rational(1,2)` (canonical
    form — GCD'd at the constructor); `Rational(2,3) * Rational(3,5)`
    → `Rational(2,5)`; `Rational(3,4) / Rational(1,2)` → `Rational(3,2)`.
  - Canonical Integer collapse at d=1: `Rational(4,6) + Rational(1,3)`
    → `Integer(1)` (result is 1/1 and collapses to Integer).
  - Q→Real widening: `Rational(1,2) + Real(0.25)` → `Real(0.75)`.
  - Q→Complex widening: `Rational(1,2) * Complex(2, 4)` →
    `Complex(1, 2)`.
  - Integer-exponent exact path: `Rational(3,2) ^ Integer(3)` →
    `Rational(27,8)`; `Rational(7,11) ^ Integer(0)` → `Integer(1)`
    (d=1 collapse).
  - Fractional-exponent EXACT-mode symbolic lift:
    `Rational(2,1) ^ Rational(1,3)` → `Symbolic` (no implicit
    Real coercion in EXACT mode).
  - Division by zero: `Rational(3,2) / Integer(0)` → throws
    `'Division by Zero'` (Fraction.js error — different capitalisation
    than the Real path's 'Infinite result').
  - APPROX-mode collapse (wrapped in `try { setApproxMode(true)… }
    finally { setApproxMode(false) }`): `Rational(1,2) + Rational(1,3)`
    → `Real` with value ≈ 0.8333….  This pins that APPROX flips Q
    to the real-kind branch at `promoteNumericPair`.

- **Cluster 3 — List distribution edge cases on `_withListUnary` /
  `_withListBinary`.**  The matrix carries an `L ✓` in almost every
  row but pinning was shallow — session 115 adds depth for the
  Tagged-outer-of-List unwrap order, nested recursion,
  pairwise broadcast, size-mismatch rejection, and the *deliberate*
  rejection when a List contains inner Tagged scalars (the
  `_withTaggedUnary` wrapper sits OUTSIDE `_withListUnary` in the
  composition chain, so `{:lbl:scalar}` has no unwrapper at the
  inner scalar handler — this is by design).  8 hard assertions:
  - Tagged-outer-of-List: `:lbl:{1 -2 3} NEG` → `:lbl:{-1 2 -3}`
    (Tagged unwraps first, list distributes inside, outer tag
    re-applies).
  - Nested list: `{{1 -2} {3 -4}} NEG` → `{{-1 2} {-3 4}}`.
  - Mixed-type list: `{Integer(5) Real(3.2) Real(-7.5)} FLOOR` →
    `{Integer(5) Real(3) Real(-8)}` (per-element FLOOR, each
    element's own type path).
  - List×scalar broadcast: `{1 2 3} + Integer(10)` →
    `{Integer(11) Integer(12) Integer(13)}`.
  - Scalar×List: `Integer(2) * {1 2 3}` → `{2 4 6}`.
  - Pairwise same-size: `{1 2 3} + {4 5 6}` → `{5 7 9}`.
  - Size mismatch: `{1 2} + {1 2 3}` → `'Invalid dimension'`.
  - Deliberate inner-Tagged rejection: `{:x:1 :y:-2} NEG` →
    `'Bad argument type'` (list wrapper recurses into the inner
    scalar handler; inner handler is NOT Tagged-aware).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`, or
  `formatter.js` this session (all held by concurrent session 114
  command-support lane).  `tests/test-types.mjs`: +40 assertions;
  `test-all`, `test-persist`, `sanity` all green (see
  `logs/session-115.md` for exact counts).

### Resolved this session (110)

- **Cluster 1 — BinInt × Real/Integer mixed-scalar arithmetic audit.**
  `_scalarBinaryMixed` + `_binaryMathMixed` routes mixed-BinInt pairs
  through `binIntBinary` with the BinInt side's base preserved (HP50
  AUR §10.1).  The matrix had treated these cells as ✓ via the
  compact `+ - * / ^` reference row, but no direct test pinned the
  wordsize-aware coercion contract.  Eleven hard assertions in
  `tests/test-types.mjs`:
  - `#FFh + Integer(3)` and `Integer(3) + #FFh` → `#102h` (BinInt
    base wins regardless of operand order).
  - `#20h * Real(2.7)` → `#40h` (Real trunc-coerced to Integer 2 via
    `_coerceToBinInt`).
  - `#10h + Real(-3)` → `#Dh` at ws=64 (negative Real wraps via
    `2^w - 3` then masks back).
  - `#12d + Real(5)` → `#17d` (decimal base preserved).
  - `#2h ^ Integer(3)` → `#8h` (via `binIntBinary('^')` → `_modPow`).
  - ws=8 block (setWordsize(8), restore at exit): `#FFh + 2` → `#01h`
    (257 masked), `#2h ^ 10` → `#0h` (1024 masked), `Real(300) * #2h`
    → `#58h` (600 masked).
  - Rejection guards: `#5h / Integer(0)` → 'Division by zero' (BinInt
    branch, distinct from the Real path's 'Infinite result');
    `#5h + Complex(1,2)` → 'Bad argument type' (no BinInt×Complex
    path — coercion is integer-only).

- **Cluster 2 — Tagged transparency on SIGN / ARG / FLOOR / CEIL /
  IP / FP.**  All six ops are wrapped in `_withTaggedUnary` so
  `:lbl:v OP` → `:lbl:OP(v)`.  The matrix listed all six T-cells
  as ✓ but no direct test pinned the re-tag-with-same-label
  contract.  15 hard assertions in `tests/test-types.mjs`:
  - FLOOR on `:x:Real(7.2)`, `:x:Real(-1.5)`, `:n:Integer(5)`
    (Integer pass-through, rounding is a no-op).
  - CEIL on `:y:Real(7.2)` and `:y:Real(-1.5)`.
  - IP on `:z:Real(7.2)` and `:z:Real(-7.2)` (trunc toward zero).
  - FP on `:w:Real(7.2)` (`≈ 0.2` modulo IEEE drift — FP uses the
    `x - Math.trunc(x)` real path, not an exact reduction).
  - SIGN on `:u:Real(-5)`, `:u:Real(0)`, `:p:Real(42)`.
  - ARG on `:v:Complex(3,4)` (inner value is `Real`, approximately
    `atan2(4,3) = 0.9273…` at default RAD mode).

- **Cluster 3 — Rational cross-family compare & equality.**
  `eqValues` routes numeric pairs through `promoteNumericPair`;
  Rational is in `isNumber` (unlike BinInt), so Rational widens
  through the Integer / Real / Complex lattice on both `==` and
  `SAME`.  `comparePair` has a dedicated `rational` branch for
  `<` / `>` / `≤` / `≥` that cross-multiplies (no round-trip
  through Real — preserves exactness).  11 hard assertions:
  - Pure Q×Q equality with canonicalisation guard:
    `Rational(1,2) == Rational(2,4)` → 1 (the stored form is 1/2;
    the incoming 2/4 canonicalises at the constructor).
  - Q×Q inequality: `Rational(1,2) == Rational(2,3)` → 0.
  - Q×Z: `Rational(6,3) == Integer(2)` → 1 (Integer widens to
    `{n:2n, d:1n}` in `promoteNumericPair`).
  - Q×R: `Rational(1,2) == Real(0.5)` → 1 via real-kind promotion.
  - Q×R on SAME: `SAME Rational(1,2) Real(0.5)` → 1 — pinning
    that SAME DOES cross-widen Rational (contrast with
    BinInt×Integer SAME which stays strict; BinInt is out of
    `isNumber`, Rational is in).
  - Q×C: `Rational(1,2) == Complex(0.5, 0)` → 1 via complex-kind
    widen (im=0 on both sides).
  - Ordered Q compares: `Rational(1,2) < Integer(1)` → 1,
    `Rational(3,2) > Real(1.4)` → 1, `Rational(1,2) < Rational(3,4)`
    → 1, `Rational(1,2) ≤ Rational(1,2)` → 1, plus a negative
    cross-multiply case `Rational(-3,4) < Rational(-2,3)` → 1
    (−9 vs −8 after cross-multiply).

  No changes to `www/src/rpl/ops.js`, `algebra.js`, `types.js`, or
  `formatter.js` this session (ops.js + tests/test-algebra.mjs +
  tests/test-numerics.mjs + COMMANDS.md + REVIEW.md + logs/session-109.md
  are lock-held by concurrent session 109 command-support lane).
  `tests/test-types.mjs`: +45 assertions (429 → 474); `test-all`:
  3871 → 3957 (+86 including concurrent session 109 output; locally
  the +45 came from this lane).  `test-persist` 34/0, `sanity` 22/0.

### Resolved this session (105)

- **`Sy` axis round-trip hardening for twenty-three multi-arg ops.**
  Session 100 closed the Sy axis for eleven arity-1 ops (CONJ / RE /
  IM / LNP1 / EXPM / XPON / MANT / TRUNC / ZETA / LAMBERT / PSI) via
  hard tests in `tests/test-algebra.mjs`.  Session 105 extends the
  same pattern to the arity-2 and variadic surface that was never
  pinned — all of these ops already had working stack handlers and
  `KNOWN_FUNCTIONS` entries, but the
  `parseEntry → format → parseEntry` idempotency and the
  `defaultFnEval` fold / no-fold contract had no direct test.
  `tests/test-algebra.mjs` was lock-held by the concurrent session 104
  command-support lane, so the new assertions live in
  `tests/test-types.mjs` (end-of-file `session 105` block).
  +149 assertions; test-all: 3681 → 3830.
  - **Cluster A — two-arg HP50 ops (10):** MIN, MAX, MOD, COMB, PERM,
    IQUOT, IREMAINDER, GCD, LCM, XROOT.  For each:
    `isKnownFunction` (case-insensitive), `parseEntry` → Symbolic,
    `format` + reparse idempotent, and the `defaultFnEval` numeric
    fold pinned on representative Integer arguments (including
    out-of-domain and edge cases that must return `null`
    — MOD(10,0), COMB(5,6), GCD(1.5,3), XROOT(-8,3), etc.).
  - **Cluster B — special-function / stat-dist (10):** UTPC, UTPF,
    UTPT, BETA, ERF, ERFC, GAMMA, LNGAMMA, HEAVISIDE, DIRAC.  Parser
    round-trip + fold guards.  HEAVISIDE / DIRAC / GAMMA fold on
    safe inputs (`HEAVISIDE(0) = 1` per HP50 convention, `DIRAC(0)`
    leaves symbolic, `GAMMA(5) = 24` integer fold, `GAMMA(180)` ->
    null on overflow, `GAMMA(0.5)` -> null on non-integer); the
    other seven have `null` evaluators — the Lanczos / incomplete-
    beta path lives on the stack side, not at simplify time.
  - **Cluster C — variadic arity (3):** `TRUNC(X, 3)` round-trips;
    `TRUNC(X)` and `TRUNC(X, 3, 4)` are both rejected at
    `parseAlgebra` with a "TRUNC expects 2 argument(s), got N"
    message (pinning the `spec.arity === 2` check).  `PSI(X)` and
    `PSI(X, 2)` both round-trip (the `spec.arity` key is omitted,
    so the parser's `spec.arity !== undefined` guard is skipped).
    Both shapes yield `null` at `defaultFnEval` — PSI has no
    simplify-time fold at any arity.

  No changes to `ops.js`, `algebra.js`, `types.js`, or `formatter.js`
  (ops.js + tests/test-algebra.mjs were lock-held this session).
  P-002 (types.js header docstring Rational omission + pre-move
  vendor path) was also fixed this session — that's a pure-doc
  edit inside types.js, not a matrix widening, and tracked in the
  session log rather than here.

### Resolved this session (100)

- **`Sy` axis round-trip closure for eleven Symbolic-lifting ops.**
  The stack-level handlers for CONJ, RE, IM, LNP1, EXPM, XPON, MANT,
  TRUNC, ZETA, LAMBERT, and PSI were already lifting Name / Symbolic
  operands correctly (they build `Symbolic(AstFn('NAME', [...]))`),
  but the algebra parser's whitelist (`KNOWN_FUNCTIONS` in
  `www/src/rpl/algebra.js`) didn't include those names.  Consequence:
  the formatted result `` `NAME(X)` `` would *print* fine but
  re-entering the same text at the entry line (or round-tripping
  through `parseEntry`) fell through to the fallback path — the
  parser returned a plain `Name` rather than a `Symbolic`, breaking
  reversibility.  Verified live with `utils/@probe-roundtrip.mjs`
  before the edit (all 11 ops showed `reparsed-type=name same=false`)
  and again after (all showed `reparsed-type=symbolic same=true`).
  Also added each op's `eval` callback where a simplify-time constant
  fold makes sense — `CONJ/RE = x`, `IM = 0`, `LNP1 = log1p`,
  `EXPM = expm1`, `XPON/MANT = HP50 real-decomposition`, leaving
  TRUNC / ZETA / LAMBERT / PSI as `arity`-only (library-grade
  approximations would need CAS or a hand-rolled series; not in
  scope for this session).  TRUNC declared `arity: 2` so the
  two-arg `TRUNC(X, 3)` form parses; PSI has no `arity` key — both
  unary `PSI(X)` and binary `PSI(X, k)` are accepted (variadic).
  ~40 hard tests added to `tests/test-algebra.mjs` covering:
  `isKnownFunction`, parseAlgebra shape, parseEntry → Symbolic,
  formatAlgebra round-trip (each op), TRUNC's 2-arg form plus an
  arity-enforcement rejection guard for the 1-arg form, PSI's
  variadic shape, and each `defaultFnEval` numeric fold
  (`CONJ(5) = 5`, `RE(5) = 5`, `IM(5) = 0`, `LNP1(0.5) ≈ log1p(0.5)`,
  `EXPM(1) ≈ expm1(1)`, `XPON(2500) = 3`, `MANT(2500) = 2.5`,
  `XPON(0) = 0`, `MANT(0) = 0`, `LNP1(-1) = null`, plus null-returns
  for ZETA / LAMBERT / PSI which stay symbolic).  Test count climbed
  from 3550 → 3605 (+55).  No changes to `ops.js` or `formatter.js`
  (out of lock scope; owned this session by `session099-command-support`).

### Resolved this session (087)

- **`==` / `SAME` on Program and Directory.**  Two branches added to
  `eqValues()` in `www/src/rpl/ops.js`.  Program: structural equality via
  `_eqArr(a.tokens, b.tokens)` (recurses through eqValues so nested
  Programs and mixed-type tokens all compare correctly).  Directory:
  reference identity (`a === b`) — two distinct Directory allocations
  are never equal even if they share the same name or entries.
  Five soft-asserts from the session 084 KNOWN-GAP block promoted to
  hard; three regression guards were already hard and remain passing.

- **BinaryInteger on `FLOOR` / `CEIL` / `IP` / `FP`.**  `_rounderScalar`
  now accepts `isBinaryInteger(v)` before the Real branch.  FLOOR/CEIL/IP
  return the same BinInt unchanged (rounding is a no-op on an integer).
  FP returns `BinaryInteger(0n, v.base)` (fractional part of any integer
  is zero, base preserved).  Four positive tests + one rejection guard
  (Complex still rejected).

- **String lexicographic `<` / `>` / `≤` / `≥`.**  `comparePair()` now
  handles `isString(a) && isString(b)` before the `!isNumber` guard,
  delegating to JS string compare (which is char-code lexicographic —
  matching HP50 User Guide App. J).  Mixed String + non-String still
  throws `Bad argument type`.  Six tests (5 positive + 1 rejection);
  the session 068 soft-assert block replaced entirely.

### Resolved this session (082)

- **DERIV — hyperbolic function coverage.**  `derivFn()` in
  `www/src/rpl/algebra.js` now handles the full hyperbolic family
  (`SINH`, `COSH`, `TANH`, `ASINH`, `ACOSH`, `ATANH`) in addition
  to the existing trig / log / exp / sqrt / abs rules.  Previously
  `DERIV('SINH(X)', 'X')` threw *"DERIV: unsupported function
  'SINH'"*.  All six identities are textbook
  (`d/dx cosh = +sinh`, NOT `-sinh` — common sign-flip mistake guarded
  by an explicit test).  This is a widening of DERIV's Symbolic-
  payload surface — the `Sy` cell on a hypothetical DERIV row was
  already ✓, but the set of function-bodies it actually accepts is
  what got wider.

- **INTEG — direct-arg antiderivatives for `SINH` / `COSH` / `ALOG`.**
  `integRaw()` now folds `∫SINH(x) dx = COSH(x)`,
  `∫COSH(x) dx = SINH(x)`, `∫ALOG(x) dx = ALOG(x)/LN(10)` when the
  argument is exactly the variable of integration (same shape as the
  existing SIN/COS/EXP/LN cases — chain-rule cases still fall back to
  a symbolic `INTEG(...)` wrapper, matching HP50 AUR §5-30).

- **simplify — rounding / sign idempotency.**  Added eight
  angle-mode-independent rewrites to `simplifyFn()`:
    - `FLOOR∘FLOOR = FLOOR`, `CEIL∘CEIL = CEIL`, `IP∘IP = IP`,
      `FP∘FP = FP`, `SIGN∘SIGN = SIGN`
    - `FP(FLOOR(x)) = FP(CEIL(x)) = FP(IP(x)) = 0`
    - cross-rounder collapse: outer and inner both in {FLOOR, CEIL, IP}
      reduces to the inner shape
  `FLOOR(FP(x))` and `CEIL(FP(x))` are deliberately left symbolic —
  FP's image `(−1, 1)` is not integer-valued so the outer rounder
  still has work to do.  User-reachable through `COLLECT` (1-arg
  simplify alias).

### Resolved this session (074)

- **BinaryInteger `==` across bases** — `#FFh == #255d` = 1.  Fixed
  by a dedicated BinInt × BinInt branch in `eqValues` (masked against
  current wordsize) plus a `_binIntCrossNormalize` helper invoked by
  the `==` / `≠` / `<>` op wrappers for cross-family BinInt ↔
  Integer/Real/Complex widening.  `SAME` deliberately does NOT
  cross-normalize (strict type per AUR §4-7).
- **BinaryInteger `<` / `>` / `≤` / `≥`** — `comparePair` promotes
  BinInt to Integer(value & mask) before routing through the numeric
  path.

---

## Bootstrap note

Sessions 062 and 063 logs reference a file named `docs/TYPE_SUPPORT.md`;
that filename is not present in the current tree.  The scheduled-task
charter for this lane names the notes file `docs/DATA_TYPES.md`, so
session 064 re-bootstraps under the charter-correct filename.  Future
runs should treat *this* file as authoritative.  If `TYPE_SUPPORT.md`
resurfaces, consolidate it back into this file rather than maintaining
two.
