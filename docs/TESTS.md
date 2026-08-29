# TESTS — RPL5050 unit-test lane notes

**Scope.** This is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

Git preserves the session-by-session history; this file carries only the
current state.

## Current status

`node tests/test-all.mjs` currently reports **ALL TESTS PASSED (7891)** —
fully green, 0 failing. `test-persist.mjs` is standalone (D-001 closed at
ship-prep 2026-04-25). `sanity.mjs` 22 / 0 in ~6 ms.

| File                        | OK   | FAIL | Notes                              |
|-----------------------------|------|------|------------------------------------|
| test-algebra.mjs            | 1158 | 0    | Largest CAS-focused file.          |
| test-arrow-aliases.mjs      |   82 | 0    |                                    |
| test-binary-int.mjs         |  144 | 0    |                                    |
| test-chatbot-parse.mjs      |  788 | 0    |                                    |
| test-command-reference.mjs  |   55 | 0    | AI command-reference index.        |
| test-comparisons.mjs        |  190 | 0    |                                    |
| test-control-flow.mjs       |  903 | 0    | Includes ASCII `->` local arrow.   |
| test-entry.mjs              |  212 | 0    |                                    |
| test-eval.mjs               |   61 | 0    |                                    |
| test-helpers.mjs            |   43 | 0    |                                    |
| test-jordan-format.mjs      |   20 | 0    |                                    |
| test-lists.mjs              |  231 | 0    |                                    |
| test-llm-manager.mjs        |   22 | 0    |                                    |
| test-matrix.mjs             |  368 | 0    |                                    |
| test-numerics.mjs           |  873 | 0    |                                    |
| test-op-search.mjs          |   83 | 0    |                                    |
| test-reflection.mjs         |  429 | 0    |                                    |
| test-remote-llm.mjs         |   94 | 0    |                                    |
| test-scratch.mjs            |   23 | 0    | AI dry-run eval isolation.         |
| test-stack-ops.mjs          |   66 | 0    |                                    |
| test-stats.mjs              |   70 | 0    |                                    |
| test-types.mjs              | 1343 | 0    |                                    |
| test-ui.mjs                 |  318 | 0    |                                    |
| test-units.mjs              |   64 | 0    |                                    |
| test-variables.mjs          |  251 | 0    |                                    |
| **test-all (aggregate)**    | **7891** | **0** | Fully green.                 |
| test-persist.mjs (separate) |   98 | 0    | Stable; D-001 closed ship-prep.    |
| sanity.mjs (standalone)     |   22 | 0    | ~6 ms smoke suite.                 |

### Skip / flake snapshot

- **No tests are currently `.skip`'d.** No assertion is known-failing.
- **HALT/CONT control-flow under stress** — historically the one intermittent:
  an ordering dependency in the HALT/CONT multi-slot path. Closed by the
  `_localFrames` reset + multi-slot HALT LIFO refactor; not reproduced in any
  flake-scan since. If it reappears, `tests/flake-bisect.mjs` is the right
  first tool (start from the `session073:` first-CONT label).
- **Timing-sensitive entry tests** (`test-entry.mjs`) and **cross-file
  test-order dependencies** are the residual flake-prone areas — run
  `tests/flake-scan.mjs` before escalating any single intermittent to a lane
  filing, and `tests/flake-bisect.mjs` to hunt a reproducing import order.
- Duplicate assertion labels (~64 at last count) exist across files. Not a
  correctness concern; fix opportunistically.

---

## Harness conventions

No test framework — the suite is plain `.mjs` files run under `node`, each
appending hard `assert`-style checks via shared helpers. There is no Mocha /
Jest / vitest layer; `test-all.mjs` is a thin aggregator that imports every
runnable test file and prints per-file headline counts plus the aggregate.

- **Helpers live in `tests/helpers.mjs`** — `assertThrows`, `rplEqual`,
  `runOp`, `runOpStack`. Prefer `assertThrows(fn, /pattern/, label)` over
  inline `try { … } catch { threw = … }` scaffolds. The migration to
  `assertThrows` is complete across the suite; the only remaining `let threw`
  sites are negated-form acceptance scaffolds (the `assert(!threw, …)`
  "this op should NOT throw" idiom), which must stay as-is because
  `assertThrows` would invert their meaning:
  - `test-stack-ops.mjs:322` — CLEAR-on-empty-stack no-op.
  - `test-control-flow.mjs:919` — DOERR-0 no-op.
  - `test-persist.mjs:32` — local helper scaffold (`test-persist.mjs` keeps a
    local `assertThrows` mirroring `helpers.mjs` so it can stay standalone).
  - `test-variables.mjs:446` — varPurge-doesn't-throw scaffold, followed by a
    hard PURGE `assertThrows`.
- **Assertion labels** are per-cohort `sessionNNN:` prefixes used for
  grep-based attribution and flake tracking.
- **Per-file headline counts** ship in `test-all.mjs` with resilient
  module-load handling (a module-load error in one file does not abort the run).
- **Flake-scan harness `tests/flake-scan.mjs`** — non-determinism detector.
  Run `node tests/flake-scan.mjs [N] [--quiet]` (N identical runs) before
  escalating any single flake to a lane filing.
- **Flake-bisect harness `tests/flake-bisect.mjs`** — when flake-scan
  identifies a non-deterministic assertion,
  `node tests/flake-bisect.mjs --label "<label>"` hunts a reproducing
  file-import order by shuffling, then shrinks the prefix until only the
  load-bearing files remain. Also supports `--order a,b,…` to reproduce a
  known-bad ordering directly. When no reproducer is found it exits 3 with a
  one-liner. Back-end is `tests/run-order.mjs`, a configurable variant
  aggregator that takes FILES via argv or `--from-test-all`.
- **Pre-commit gate `utils/pre-commit.sh`** — default invocation runs the
  ~5 ms `tests/sanity.mjs` smoke as the always-on cheap gate; `--full` adds
  `tests/test-all.mjs`; `--persist` adds `tests/test-persist.mjs`. Hookable as
  a real git hook via
  `ln -sf ../../utils/pre-commit.sh .git/hooks/pre-commit`.

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

## Known gaps (open items)

### Assigned to `rpl5050-data-type-support`

1. **Dim-equivalence `==` on Units.** `1_m == 1_km` = 0 today by design
   (strict structural); a separate `UEQUAL` op or flag would give
   dimension-aware equality. Low priority.

### File hygiene (blocked by tooling — `rpl5050-unit-tests`)

- **O-009 — `tests/test-control-flow.mjs.bak{,2}` stray backups — CLOSED.**
  The two pre-session-111 backup files that used to sit beside the live
  `test-control-flow.mjs` are gone (`find tests -name '*.bak*'` returns
  nothing); the grep-noise and source-of-truth confusion they created are
  resolved.

### Evergreen coverage work (own item — `rpl5050-unit-tests`)

- **Positive-coverage pass on `✓` cells in DATA_TYPES that only have negative /
  rejection evidence today.** Plan: enumerate `✓` cells → grep for the op name
  in tests → flag any `✓` cell whose op has no adjacent positive assertion.
  This is the standing open queue item for the lane. erf/erfc Z (session280),
  MANT Z (session285), and the GAMMA/LNGAMMA Real-operand pole guard
  (session290) are closed. Note: the earlier "GAMMA/LNGAMMA Z folds backed
  mostly by Real-operand evidence" flag was inaccurate — GAMMA's exact-
  factorial Integer branch is well pinned (`GAMMA(5)`→24, `GAMMA(21)`→20!,
  `GAMMA(1)`→1) and LNGAMMA's integer arm is exercised by `LNGAMMA(5)` /
  `LNGAMMA(200)`. The `PSI`/`ZETA`/`LAMBERT` `_*Scalar` `isInteger` arms are
  now all covered: PSI by `session081: PSI(Integer(5))`, ZETA by `session086:
  ZETA(0)/ZETA(-1)/ZETA(-2)` (all `Integer`), and LAMBERT by `session296:
  LAMBERT(Integer(0/1/3))`. The rounding family's negative-`n` Z fold
  (TRNC/TRUNC/RND with an Integer operand and `n < 0`) is closed by session302
  — see the coverage note below. No remaining Real-only `✓` Z cells in the
  special-function family are known; next run should re-enumerate `✓` cells
  across the rest of the matrix for the same pattern (XPON/MANT are already
  covered by session043/285; the stat-dist family Z columns — UTPC/UTPF/UTPT
  `asReal` integer arms — are now covered by session068/308, see the coverage
  note below). The GCD/LCM R* (`~`) integer-valued-Real *acceptance* arm is
  closed by session314 — see the coverage note below. The MOD / MIN / MAX
  mixed-operand Decimal-from-Integer coercion arm is closed by session320 —
  see the coverage note below. The core binary arithmetic (`+ - * /`)
  mixed Integer/Real coercion arm is closed by session327 — see the coverage
  note below (note `%` has no distinct Z arm: `_percentOp` runs `toRealOrThrow`
  on both operands, so Integer and Real share one path and always yield Real).
  The Complex-promotion arm of the arithmetic ops (Integer/Real/Rational ∘
  Complex → Complex via `toComplex`'s per-type arms) is closed by session334 —
  see the coverage note below. The comparison family's `comparePair` ordered
  ops (`< > ≤ ≥`) mixed Integer/Real and zero-im Complex coercion arms are
  closed by session341 — see the coverage note below. The `comparePair`
  BinaryInteger masked-widening path's *mixed* BinInt × Integer ordered arm
  (ops.js ~5158, `integer` kind) is closed by session348 — see the coverage
  note below. The `comparePair` `rational` kind cross-multiply branch
  (ops.js ~5192) on a NEGATIVE-numerator pair is closed by session355 — see the
  coverage note below. The `==`/`SAME` Unit branch (`eqValues` ~5003) is now
  pinned for `SAME` as well as `==` — session362 closed the gap the
  test-comparisons block header had over-promised (it claimed "Unit via == AND
  SAME" but only `==` was exercised); see the coverage note below. Next run: the
  ordered `< > ≤ ≥` arms have L/V/M/T/U as *rejections* (`✗`, swept by
  session287), so there is no positive-pin gap there. The `==`/`SAME` Tagged
  branch (`eqValues` ~5000: `a.tag === b.tag && eqValues(a.value, b.value)`) is
  now `SAME`-pinned as well as `==`-pinned — session363 closed the gap Units had
  before session362 (structural-not-reference, recurses into the value, no
  type-coercion through the value); see the coverage note below. Next run:
  re-enumerate the remaining `✓` cells in DATA_TYPES whose result-determining
  coercion arm is reached only by a sibling type — the value-equality family
  (`==`/`SAME`) is now `SAME`-audited for Unit, Tagged, and (session375)
  List/Vector/Matrix; the Program branch (`eqValues` ~5017: `_eqArr` on token
  streams) is `==`/`SAME`-pinned via session072. The integral-function trio
  Ei / Si / Ci had the same Real-only Z-arm gap as erf/erfc/MANT/LAMBERT —
  closed by session382 (see the coverage note below). `_polygammaScalar` (the
  n-th-derivative PSI form, ops.js ~2595) had the same Real-only gap on its `x`
  operand — closed by session389 (see the coverage note below). The two-arg
  `_betaScalar` (`aNum`/`bNum` = `isInteger ? … : isReal ? … : null`, ops.js
  ~2830) had the same Real-only gap on a *finite* result — its Integer arm was
  positively exercised only by the pole-throw cases — closed by session396 (see
  the coverage note below). `_argScalar`'s `isInteger` arm (ARG, ops.js ~1492 —
  a distinct *sign* arm `v.value < 0n ? π : 0` routed through `fromRadians`, not
  the `isInteger ? Number(v.value)` shape) was backed only by Real / Complex
  scalar pins — closed by session403 (see the coverage note below). The bespoke
  complex-projection helpers `_conjScalar` / `_reScalar` / `_imScalar` (ops.js
  ~1508/1514/1520) had their Integer/Rational arms backed only by Real / Complex
  scalar pins — CONJ/RE identity (same-ref), IM returning `Integer(0n)` (an
  *Integer* zero, distinct from the Real arm's `Real(0)`) — closed by session407
  (see the coverage note below). `_fitScalar` (PREDV/PREDX, ops.js ~15358) is
  the one special-function scalar helper with a *third* arm —
  `isBinaryInteger(v) ? Number(v.value)` — that the others reject; its Integer
  arm was pinned (session058) but the BinInt arm was Integer/Real-only — closed
  by session415 (see the coverage note below). `FACT`/`!` carries a result-type
  arm in the *other* direction — a non-negative integer-valued **Real** collapses
  to an exact **Integer** (ops.js ~1672), and a negative integer-valued Real hits
  the gamma pole ('Infinite result', ~1671) — both reached only by an
  integer-valued Real; every prior pin fed an Integer or a non-integer Real
  (0.5) — closed by session421 (see the coverage note below). The rounding family
  `FLOOR`/`CEIL`/`IP`/`FP` carries a *mode*-dependent Rational arm: in EXACT mode
  the BigInt path returns Integer/Rational (well pinned, see the EXACT block in
  test-types), but in APPROX mode (`getApproxMode()`, `_rounderScalar` ops.js
  ~1365) the Decimal path collapses all four to Real — and every prior
  rounder-on-Rational pin ran in EXACT mode, so the APPROX arm was uncovered
  (FP's exact-zero returns Real(0) there, not EXACT's Integer(0n)) — closed by
  session428 (see the coverage note below). `SQRT` carries the same
  mode-dependent Rational split: in EXACT mode a non-negative Rational stays
  exact (perfect square → Rational/Integer, else Symbolic, `ops.js` ~1163), but
  in APPROX mode it skips that arm and collapses to Real via the final `else`
  (~1182) — every prior SQRT-on-Rational pin ran in EXACT mode, so the APPROX
  collapse was uncovered (a refactor folding it into the EXACT BigInt fast-path
  would return Rational(2/3) for SQRT(4/9) yet pass every EXACT pin) — closed by
  session435 (see the coverage note below). Next run: the `_*Scalar`
  `isInteger`/BinInt sweep is now complete across the special-function and
  projection families, and the APPROX/EXACT Rational split is pinned for the
  rounding family and SQRT; the `^`-on-Rational and the transcendental
  (`LN`/`EXP`/`SIN`…) `_exactUnaryLift` (`ops.js` ~1235) APPROX-vs-EXACT arms are
  the next mode-dependent candidates. Re-enumerate the remaining `✓` cells in
  DATA_TYPES whose result-determining coercion arm is reached only by a sibling
  type (or a mode-dependent arm reached only in one of EXACT/APPROX) for the next
  pin
  (the digamma 1-arg `_psiScalar` already has a bare-Integer pin via session081
  `PSI(Integer(5))`; `_gammaScalar`/`_lngammaScalar` Integer arms are pinned per
  the note above).

---

## Coverage notes

- **BinaryInteger equality cluster is CLOSED** — `eqValues` BinInt branch,
  `_binIntCrossNormalize` helper, and `comparePair` BinInt coercion are live;
  DATA_TYPES rows for `==` / `SAME` / `<` / `>` / `≤` / `≥` show B `✓`.
- **String compare** — value-based equality (`==` / `≠` / `SAME`) is contrasted
  against the lex-based ordered family (`< > ≤ ≥`) on shared input pairs, so a
  refactor routing equality through the lex comparator is caught. The
  cross-type String/numeric rejection arm is pinned on all four ordered ops.
- **erf / erfc Z column** — the DATA_TYPES Z `✓` cell (the `_erfScalar` /
  `_erfcScalar` `isInteger` branch) is now pinned with bare-`Integer` operands
  (`erf(Integer(1))` → `Real(≈0.8427)`, `erfc(Integer(2))` → `Real(≈0.00468)`),
  not just `Real(n)` — `session280:` in `test-numerics.mjs`. Guards against a
  refactor that drops the integer arm and silently degrades Z→Real-only.
- **MANT Z column** — same audit class: XPON carried a bare-`Integer` pin
  (`session043:` XPON Integer 500 → 2) but MANT's Z `✓` cell was backed only by
  `Real` operands. Added `session285:` pins in `test-numerics.mjs`
  (`MANT(Integer 500)` → `Real(5)`, `MANT(Integer 86000)` → `Real(8.6)`, plus
  `XPON(Integer 86000)` → `Real(4)` for a >1-digit exponent on the integer arm).
  Probed live first; no source change. Guards against a refactor degrading
  MANT's Z column to Real-only.
- **GAMMA / LNGAMMA Real-operand pole guard** — `_gammaScalar` /
  `_lngammaScalar` reject non-positive integers via `Number.isInteger(x) &&
  x <= 0` *after* coercing the operand to a JS number, so the throw must fire
  for Real-valued whole numbers (`Real(0)`, `Real(-2)`), not just `Integer`.
  Both prior pole pins used `Integer` only; `session290:` in
  `test-numerics.mjs` adds Real(0/-2/-3) for GAMMA and Real(0/-1/-4) for
  LNGAMMA. Probed live first; no source change. Guards a refactor narrowing
  the guard to `isInteger(v)`, which would let `GAMMA(Real(-2))` return garbage.
- **LAMBERT Z column** — `_lambertScalar` coerces via `isInteger(v) ? Number :
  isReal(v) ? toNumber : null`, but every positive LAMBERT pin pushed `Real`,
  so the `isInteger` arm was never positively exercised (only the String
  rejection touched a non-Real type). `session296:` in `test-numerics.mjs`
  adds `LAMBERT(Integer(0))` → 0, `LAMBERT(Integer(1))` → Ω, and
  `LAMBERT(Integer(3))` checked via the inverse property W·e^W = 3. Probed
  live first; no source change. Guards a refactor degrading Z to Real-only.
  (PSI and ZETA already had bare-`Integer` positive pins — PSI(Integer(5)),
  ZETA(0)/ZETA(-1)/ZETA(-2) — so only LAMBERT was Real-only.)
- **Rounding family (TRNC / TRUNC / RND) negative-`n` Z fold** —
  `_roundingOp`'s integer passthrough only fires for `n >= 0` (session081 pins
  `TRUNC(Integer(42), 3)` → `Integer(42)`); a negative `n` routes the Integer
  through the same Real-rounding path as a Real operand, so the result is a
  `Real`, not an `Integer`. Every prior pin on that arm used a Real `x`.
  `session302:` in `test-numerics.mjs` adds `TRNC`/`TRUNC`(Integer(123), -1) →
  Real(100), (Integer(1250), -2) → Real(1200), (Integer(7), -1) → Real(7),
  plus an RND contrast — half-away-from-zero diverges from toward-zero on the
  same integer arm: `RND(Integer(1250), -2)` → Real(1300) vs TRNC/TRUNC's 1200.
  Probed live first; no source change. Guards a refactor that would let the
  integer arm skip the rounding fn or wrongly return an Integer for `n < 0`.
- **Stat-dist (UTPF / UTPT) variate-operand Z fold** — the `asReal`
  integer arm (`isInteger(v) ? Number(v.value)`) for the distribution
  variate (UTPF's `F`, UTPT's `t`) was never positively pinned: every
  session069 case pushed a `Real` for those operands (n/d/ν were always
  `Integer`, so only the degrees-of-freedom integer arm was exercised).
  UTPC's `x` integer arm was already covered by `session068:` `UTPC(2, 6)`.
  `session308:` in `test-numerics.mjs` adds `UTPF(2, 4, Integer 3)` → 0.16
  (n=2 closed form S(F) = (1 + (n/d)F)^(-d/2)), an Integer-F == Real-F
  coercion-parity pin, `UTPF(5, 10, Integer 0)` → 1 (integer short-circuit),
  `UTPT(1, Integer ±1)` → 0.25 / 0.75 (Cauchy closed form + t-symmetry), and
  `UTPT(5, Integer 0)` → 0.5 (integer short-circuit). Probed live first; no
  source change. Guards a refactor narrowing the variate's Integer coercion,
  which would degrade the Z column there to Real-only.
- **GCD / LCM integer-valued-Real acceptance arm (R* `~` cell)** — the
  DATA_TYPES R* cell ("R accepted only when integer-valued") is
  `_toBigIntOrThrow`'s `isReal(v) && v.value.isInteger()` branch (`ops.js`
  ~1561), a distinct arm from the `isInteger(v)` branch every Integer-operand
  pin already exercises. session064 pinned only the NEGATIVE side (non-integer
  Real 1.5 rejected via a Tagged); every positive GCD/LCM pin pushed Integer,
  so the integer-valued-Real *acceptance* arm was never positively exercised.
  `session314:` in `test-numerics.mjs` adds `Real(12) Real(18) GCD` → 6 (both
  Real), `Real(12) Integer(18)` / `Integer(12) Real(18)` GCD → 6 (each mixed
  side independently), `Real(0) Real(7) GCD` → 7 (zero boundary through the
  Real arm), `Real(4) Real(6)` / `Real(4) Integer(6)` LCM → 12, and a bare
  (non-Tagged) `Real(4.2) Integer(6) LCM` → 'Bad argument value' contrast.
  Probed live first; no source change. Guards a refactor narrowing GCD/LCM to
  Integer-only (dropping the isReal arm of `_toBigIntOrThrow`).
- **MOD / MIN / MAX mixed-operand Decimal-from-Integer coercion arm** — both
  ops keep a dedicated Integer×Integer branch (Integer-preserving) and an
  `else` branch that promotes each operand to `Decimal` via
  `isReal(v) ? v.value : new Decimal(isInteger(v) ? v.value.toString() : …)`.
  A both-Integer pair never reaches the `else`, and a both-Real pair takes the
  `isReal` arm on both sides — so the `new Decimal(v.value.toString())` arm is
  only exercised by a *mixed* Integer/Real pair. MOD had no mixed pin (every
  MOD test was both-Real or both-Integer), and MIN/MAX pinned only the
  left-operand (`da`) Integer arm via `MAX(Integer 5, Real 9.5)` — the
  right-operand (`db`) Integer arm was untested. `session320:` in
  `test-numerics.mjs` adds `Integer 7 Real 3 MOD` / `Real 7 Integer 3 MOD` → 1,
  the sign-of-divisor pair `Integer -7 Real 3` / `Real -7 Integer 3 MOD` → 2,
  and `Real 9.5 Integer 5` MIN → 5 / MAX → 9.5 plus `Integer 5 Real 9.5 MIN`
  → 5 (covering both `da` and `db` Integer arms). Probed live first; no source
  change. Guards a refactor that drops or narrows that coercion arm. (`%` has
  no analogous Z arm: `_percentOp` runs `toRealOrThrow` on both operands and
  always returns Real.)
- **Core binary arithmetic (`+ - * /`) mixed Integer/Real coercion arm** —
  `promoteNumericPair` routes a both-Integer pair to the `'integer'` kind
  (Integer-preserving BigInt path) and a both-Real pair to the `'real'` kind
  via `toRealDecimal`'s `isReal` arm on both sides. `toRealDecimal`'s
  *isInteger* arm (`new Decimal(v.value.toString())`, `types.js` ~420) is
  therefore only reached when ONE operand is Integer and the other Real. Every
  prior `+ - * /` pin was both-Integer (`10 3 *` → Integer 30), both-Real, or
  Tagged-of-Real, so the Integer-side coercion arm of the `'real'` path had no
  positive pin — the analogue of the MOD/MIN/MAX session320 gap. `session327:`
  in `test-numerics.mjs` adds the bare mixed pair for all four ops on both
  operand positions: `Integer 7 ∘ Real 2.5` and `Real 7.5 ∘ Integer 2` →
  Real (9.5/9.5, 4.5/5.5, 17.5/15, 2.8/3.75), asserting `isReal` and exact
  value each time. Probed live first; no source change. Guards a refactor that
  drops or narrows `toRealDecimal`'s Integer arm (which would mis-coerce or
  reject a mixed arithmetic pair).
- **Core binary arithmetic (`+ - * /`) Complex-promotion arm** — when either
  operand is Complex, `promoteNumericPair` takes its `'complex'` branch and runs
  BOTH operands through `toComplex` (`types.js` ~432), so the non-Complex
  operand exercises one of `toComplex`'s per-type arms: `isInteger`
  (`re = Number(value)`), `isReal` (`re = value.toNumber()`), or `isRational`
  (`re = n/d`). The only prior scalar complex-arithmetic pin
  (`test-numerics.mjs` ~64, `(1,2)*(3,4)`) is Complex × Complex, which takes
  `toComplex`'s `isComplex` arm on both sides — so the mixed
  Integer/Real/Rational ∘ Complex coercion arms had no positive arithmetic pin.
  `session334:` in `test-numerics.mjs` adds, on both operand positions:
  `Integer 2 ∘ (3,4)` for `+ - * /` → Complex (5,4)/(1,4)/(6,8)/(1,-1),
  `Real 2.5 + (3,4)` → (5.5,4) and `(3,4) * Real 0.5` → (1.5,2), and
  `Rational 1/2 + (3,4)` → (3.5,4) and `(3,4) * Rational 1/2` → (1.5,2). Result
  is always Complex (the promotion lattice tops out at Complex). Probed live
  first; no source change. Guards a refactor that drops or narrows a `toComplex`
  arm (which would mis-coerce or reject a mixed Complex arithmetic pair).
- **Ordered ops (`< > ≤ ≥`) — `comparePair` kind-branch coercion arms** —
  `comparePair` (`ops.js` ~5181) routes the promoted pair through one of four
  kind branches to extract the comparable scalars `av`/`bv`. Two had no
  positive *ordered* pin: the `p.kind === 'complex'` ZERO-im branch
  (`av = p.a.re; bv = p.b.re`, only reached when both operands fold to Complex
  with zero imaginary part — session068 pinned only its im≠0 *throw*), and the
  `p.kind === 'real'` branch (`p.a.toNumber()`) reached by a MIXED Integer/Real
  pair (every prior `< > ≤ ≥` Real pin was both-Real; session127/132 cover Q×R
  and Z×Q but not Z×R). `session341:` in `test-comparisons.mjs` adds, for the
  complex zero-im arm: `(2,0) < (5,0)` → 1, `(5,0) > (2,0)` → 1, `(5,0) ≤ (5,0)`
  → 1, `(5,0) ≥ (6,0)` → 0, `(5,0) ≤ Real(5)` → 1 and `Real(3) < (5,0)` → 1
  (Complex×Real both directions), plus a `(5,1) < Real(3)` non-zero-im
  rejection; and for the mixed-real arm: `Integer(7) < Real(7.5)` → 1,
  `Real(7.5) > Integer(7)` → 1, `Integer(7) ≤ Real(7)` → 1 (equal-value
  boundary), `Real(2.5) ≥ Integer(3)` → 0. Probed live first; no source change.
  Guards a refactor that drops the zero-im real-part extraction or narrows the
  mixed-pair real coercion in the ordered comparators.
- **Ordered ops (`< > ≤ ≥`) — mixed BinInt × Integer widening** —
  `comparePair` (`ops.js` ~5158) widens each BinInt operand independently to
  `Integer(value & mask)` via two separate `if` statements, then the now-both-
  Integer pair routes through the `integer` kind branch (`av = Number(p.a)`).
  session074 pinned both-BinInt ordered pairs (both `if`s fire) and one
  BinInt × Real pair (which routes through the `real` kind, not `integer`), but
  the *mixed* BinInt × Integer pair — one slot widened, the other already an
  Integer — was unpinned, so a refactor collapsing the two `if`s into a single
  `isBinaryInteger(a) && isBinaryInteger(b)` guard would still pass every
  existing pin. `session348:` in `test-binary-int.mjs` adds `#5h < Integer(7)`
  → 1, `#5h ≥ Integer(7)` → 0, `#7h > Integer(5)` → 1 (a-slot widened),
  `Integer(7) > #5h` → 1, `Integer(5) ≤ #5h` → 1 (equal-value boundary),
  `Integer(7) ≤ #5h` → 0 (b-slot widened, non-BinInt left operand), plus the
  wordsize-mask-on-mixed pair at ws=8 (`#100h < Integer(1)` → 1 and
  `Integer(1) > #100h` → 1, masked BinInt = 0 in either slot). Probed live
  first; no source change. Guards a refactor that drops either independent
  widening `if` or skips the mask on the mixed path.
- **Ordered ops (`< > ≤ ≥`) — `rational` kind cross-multiply, negative
  numerators** — `comparePair`'s `rational` branch (`ops.js` ~5192) compares
  without forming a real: `av = p.a.n * p.b.d; bv = p.b.n * p.a.d`. This is
  correct only because `d` is always positive after Rational sign-normalization
  (the sign lives in `n`; `Rational(1,-2)` → `{n:-1, d:2}`, `Rational(-3,-4)` →
  `{n:3, d:4}`). session127/132's Z × Q ordered pins reach this branch but only
  with positive Rational numerators — the lone negative came from an
  Integer-derived `{n<0, d:1}` pair (`Integer(-1) < Rational(1/2)`), never a
  genuine negative-numerator Rational with a non-unit denominator. `session355:`
  in `test-comparisons.mjs` adds `Rational(-3/4) < Rational(-1/2)` → 1 (both
  negative, non-unit denoms), its reverse `>` → 1, `Rational(-2/3) ≤
  Rational(-2/3)` → 1 (equal-negative boundary, cross-products tie),
  `Rational(-1/4) ≥ Rational(-1/2)` → 1, the sign-crossing `Rational(-1/2) <
  Rational(1/3)` → 1 and its `>` → 0 (guards a sign flip), the
  denom-supplied-sign normalization `Rational(1/-2) < Rational(1/3)` → 1, the
  double-negative `Rational(-3/-4) > Rational(1/2)` → 1, and the Q × Z both-
  negative `Rational(-5/2) < Integer(-2)` → 1. Probed live first; no source
  change. Guards a refactor that drops the `d`-always-positive invariant or
  forms a real before comparing in the ordered comparators.
- **`==` / `SAME` on Units — the `SAME` arm** — `eqValues`' Unit branch
  (`ops.js` ~5003) is `a.value === b.value && JSON.stringify(a.uexpr) ===
  JSON.stringify(b.uexpr)` (strict structural: value AND dimension algebra, so
  `1_m == 1_km` = 0 even though both are lengths). The session072 sweep block is
  headed "Unit via == AND SAME" but only ever calls `==` on a Unit — `SAME` on a
  Unit was unpinned anywhere in the suite, even though `SAME` carries a distinct
  type-contract (no cross-coercion — `SAME #10h Integer(16)` = 0 — and Directory
  `SAME` is reference identity). `session362:` in `test-comparisons.mjs` adds,
  after the `==` Unit pins: `SAME 1_m 1_m` → 1 (and asserts the two `parseEntry`
  allocations are `!==`, pinning that Unit `SAME` is *structural*, not reference
  identity like Directory), `SAME 1_m 1_km` → 0 (same value, uexpr differs — no
  dim-equivalence coercion), `SAME 1_m 2_m` → 0 (value differs), `SAME 1_m/s
  1_m/s` → 1 (compound uexpr matches), `SAME 1_m/s 1_m` → 0 (compound vs simple
  uexpr). Probed live first; no source change. Guards a refactor that extends
  "SAME = reference identity" to Units or drops a Unit arm of `eqValues`.
- **`==` / `SAME` on Tagged — the `SAME` arm** — `eqValues`' Tagged branch
  (`ops.js` ~5000) is `a.tag === b.tag && eqValues(a.value, b.value)` (tag-string
  equal AND recursive structural equality on the wrapped value). The session072
  Tagged pins exercise this branch via `==` (plus one SAME tag+value-match), but
  never pinned SAME's distinguishing contract on a Tagged: that it is
  *structural* (two distinct allocations matching on tag + value are SAME, unlike
  a Directory whose SAME is reference identity, ~5024) and that it recurses into
  the value with NO type-coercion — the outer `==` BinInt widening
  (`_binIntCrossNormalize`, applied only at the top level) does not reach inside
  a Tagged value, so a Tagged-of-`#16h` is never SAME — nor `==` — a Tagged-of-
  `Integer(16)`. The same gap session362 closed for Units, one type over.
  `session363:` in `test-comparisons.mjs` adds, after the session362 Unit block:
  `SAME price:200 price:200` → 1 (distinct allocations, asserted `!==`, so this
  pins structural-not-reference), `SAME price:200 cost:200` → 0 (tag differs),
  `SAME x:1 x:2` → 0 (value differs), `SAME v:{1 2} v:{1 2}` → 1 and
  `SAME v:{1 2} v:{1 3}` → 0 (recursion into the nested List value), and
  `SAME h:#16h h:Integer(16)` → 0 (no type-coercion through the value — the
  BinInt widening stays at the outer level, where the operands are Tagged not
  BinInt). Probed live first; no source change. Guards a refactor that extends
  "SAME = reference identity" to Tagged, drops the recursive value compare, or
  lets the outer BinInt widening leak into the Tagged value.
- **`==` / `SAME` on List / Vector / Matrix — the `SAME` arm** — `eqValues`'
  collection branches (`ops.js` ~4990) recurse via `_eqArr` → `eqValues`, so
  they are structural: two distinct allocations matching elementwise are SAME,
  unlike a Directory whose SAME is reference identity (~5018). The session072
  collection pins are almost entirely `==`; the lone List SAME does not assert
  distinct allocations, Vector had no SAME pin at all, and Matrix had only a
  negative cell-mismatch SAME — the same gap session362 (Unit) and session363
  (Tagged) closed, one collection over. `session375:` in `test-comparisons.mjs`
  adds, after the session363 Tagged block: `SAME {1 2 3} {1 2 3}` → 1 (asserts
  the two `RList` allocations are `!==`, pinning structural-not-reference),
  `SAME { {1 2} 3 } { {1 2} 3 }` → 1 (recursion into the nested List), the
  collection BinInt no-coercion contrast `SAME {#16} {16}` → 0 AND `{#16} == {16}`
  → 0 (the `_binIntCrossNormalize` widening is applied only at the top level —
  the operands are List, not BinInt — so it never reaches inside, the collection
  analogue of session363's Tagged-of-#16h), `SAME [3 4] [3 4]` → 1 (distinct
  `Vector` allocations, asserted `!==`) and `SAME [3 4] [4 3]` → 0 (order-
  sensitive), and `SAME [[1 2][3 4]] [[1 2][3 4]]` → 1 (distinct `Matrix`
  allocations, asserted `!==` — Matrix had only the negative cell-mismatch SAME
  before). Probed live first; no source change. Guards a refactor that extends
  "SAME = reference identity" to collections, drops the `_eqArr` recursion, or
  lets the outer BinInt widening leak inside a collection.
- **Ei / Si / Ci Z column — the integer coercion arm** — the three integral
  functions (`_eiScalar`/`_siScalar`/`_ciScalar`, `ops.js` ~14561/14569/14577)
  coerce via `isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber()
  : null`, the same shape as erf/erfc, MANT, and LAMBERT. Every session109
  positive pin pushed a `Real`, so the `isInteger` arm was never positively
  exercised — only the String reject touched a non-Real type. `session382:` in
  `test-numerics.mjs` adds bare-`Integer` operands: `Ei(Integer 1)` →
  1.8951178163559368, `Ei(Integer 5)` → 40.18527535…, `Ei(Integer -1)` →
  -0.219383934… (negative integer through the E1 branch), `Si(Integer 1)` →
  0.946083070…, `Si(Integer -5)` → -Si(5) (odd parity, integer arm across the
  CF branch), `Ci(Integer 1)` → 0.337403922…, `Ci(Integer 4)` →
  -0.140981697886… (series boundary) — each asserted `isReal` and matching the
  Real-operand value. Probed live first (Integer == Real result bit-for-bit);
  no source change. Guards a refactor degrading the Z column there to
  Real-only.
- **PSI polygamma Z column — the x-operand integer coercion arm** — the
  two-arg `PSI` (n-th derivative) routes its `x` operand through
  `_polygammaScalar(n, v)` (`ops.js` ~2595), whose coercion is the same
  `isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null`
  shape as `_psiScalar` (digamma) and the Ei/Si/Ci/erf/MANT/LAMBERT family.
  Every session081 two-arg pin pushed a `Real` x, so this `isInteger` arm was
  never positively exercised — only the 1-arg String reject touched a non-Real
  type. `session389:` in `test-numerics.mjs` adds bare-`Integer` x operands at
  several orders: ψ_1(1)=π²/6, ψ_2(1)=-2ζ(3), ψ_1(2), ψ_1(5), and the n=0
  collapse ψ_0(1)=-γ — each asserted `isReal` and matching the Real-operand
  result bit-for-bit (via `Number(...)`), plus closed-form anchors on ψ_1(1)
  and the n=0 digamma collapse. Probed live first (Integer == Real result
  bit-for-bit at all orders); no source change. Guards a refactor degrading
  the polygamma Z column to Real-only. (The 1-arg digamma arm `_psiScalar`
  already had a bare-Integer pin via session081 `PSI(Integer(5))`.)

- **Beta Integer Z column** — the two-arg `_betaScalar` coerces each operand via
  `aNum/bNum = isInteger ? Number(.value) : isReal ? .value.toNumber() : null`
  (`ops.js` ~2830). The session069 finite closed-form pins (Β(3,4)=1/60,
  Β(1,7)=1/7, Β(½,½)=π, symmetry) all push `Real` operands, so the `isInteger`
  arm was positively exercised only by the *pole-throw* cases (Β(0,3)/Β(-2,3) →
  Infinite result) — a refactor folding the Integer arm into the Real guard (or
  dropping it) would still pass those (the pole throws before computing) and
  every Real pin (which never touches the Integer arm). `session396:` in
  `test-numerics.mjs` pins a *finite* value through the Integer arm: Β(Integer 3,
  Integer 4)=1/60 and Β(Integer 1, Integer 7)=1/7 on both operands, plus the two
  mixed slots Β(Integer 3, Real 4) and Β(Real 3, Integer 4), each asserted
  `isReal` and equal (bit-for-bit `.eq`, against a live Real-operand reference)
  to the Real path. Probed live first (repo-rooted, CAS-free: all four forms =
  0.016666… exactly equal to Β(Real 3, Real 4)); no source change.
- **ARG Integer Z column — the sign arm** — `_argScalar` (`ops.js` ~1490) has a
  dedicated `isInteger(v)` branch, `Real(fromRadians(v.value < 0n ? Math.PI : 0))`,
  distinct from the Real arm (which tests `v.value.isNegative()`): it tests the
  sign with a BigInt compare and routes the result through `fromRadians` for the
  angle mode. Every prior ARG scalar pin used a Real (`ARG(5)`/`ARG(-3)`/`ARG(-1)`
  in test-entry), a Complex, or a reject type (Rational/BinInt/Unit), so a refactor
  folding the Integer branch into the Real branch (coercing the BigInt to a number
  first) would pass green. `session403:` in `test-entry.mjs` (after the Real-scalar
  ARG block) adds `ARG(Integer 5)` → Real(0), `ARG(Integer 0)` → 0 (zero is
  non-negative — `0n < 0n` false), `ARG(Integer -3)` → π in RAD with an
  Integer==Real bit-for-bit parity pin, `ARG(Integer -1)` → 180 in DEG, and
  `ARG(Integer -2)` → 200 in GRD (the integer arm exercised across all three
  angle modes via `fromRadians`). Probed live first; no source change. Guards a
  refactor degrading ARG's Z column to Real-only or dropping the angle-mode route
  on the integer arm.
- **CONJ / RE / IM Integer + Rational scalar arms** — the bespoke projection
  helpers (`_conjScalar` / `_reScalar` / `_imScalar`, `ops.js` ~1508/1514/1520)
  return `v` unchanged on an Integer/Rational (CONJ/RE identity), while `_imScalar`
  returns `Integer(0n)` on Integer/Rational — an *Integer* zero, distinct from its
  Real arm's `Real(0)` (`IM(9)` = `Real(0)`). Every prior scalar pin fed a Real
  (`CONJ(7)`, `IM(9)`) or a Complex operand, so the Integer/Rational identity arm
  and IM's Integer-zero arm were never positively exercised — a refactor folding
  them into the Real arm (IM would then return `Real(0)`) or coercing the operand
  first would pass green. `session407:` in `test-entry.mjs` (after the Real /
  Complex CONJ/RE/IM scalar block) adds `CONJ(Integer 7)` / `RE(Integer 7)` →
  `Integer 7` asserting same-reference identity, `IM(Integer 7)` → `Integer 0`
  (asserts `isInteger`, value `0n` — not `Real(0)`), and the Rational mirrors:
  `CONJ(Rational 3/4)` same-ref, `RE(Rational 3/4)`, and `IM(Rational 3/4)` →
  `Integer 0`. Probed live first (repo-rooted, CAS-free); no source change. Guards
  a refactor degrading the projection Z/Q arms to Real-only.
- **PREDV / PREDX BinaryInteger arm** — `_fitScalar` (`ops.js` ~15358) is the
  one special-function scalar coercer with a *third* arm beyond Real/Integer:
  `isBinaryInteger(v) ? Number(v.value)` (the erf/Si/Beta/ARG/CONJ family all
  reject BinInt). PREDV/PREDX feed their operand through it. session058 pinned
  the Integer arm (`PREDV(Integer 7)` → Real 14) and the Real path, but the
  BinInt arm was never positively exercised — a refactor folding it into the
  Integer arm (or dropping it) would make `PREDV(#7h)` throw 'Bad argument type'
  yet pass every prior pin. `session415:` in `test-matrix.mjs` (after the
  session058 Integer block) seeds LINFIT y=2x, then adds `PREDV(#7h)` → Real(14),
  the base-cosmetic `PREDV(#111b)` → Real(14) (value-based, base is display-only),
  and `PREDX(#16)` → Real(8) (inverse fit through the same arm), each asserting
  `isReal`. Probed live first (repo-rooted, CAS-free); no source change. Guards
  a refactor dropping or narrowing `_fitScalar`'s BinInt arm.
- **FACT / `!` integer-valued-Real arm** — `FACT` carries a result-*type*
  branch reached only by an integer-valued Real: a non-negative one collapses to
  an exact `Integer` (ops.js ~1672, `Number.isInteger(x) && x >= 0`), a negative
  one hits the gamma pole and throws `Infinite result` (~1671). Every prior
  session047 pin fed an `Integer` (the exact-factorial path) or a *non-integer*
  `Real` (0.5, the Γ(x+1) path), so a refactor folding the integer-valued-Real
  check into the Γ branch would return `Real(120)` (or NaN at the pole) yet pass
  green. Note the Real pole error (`Infinite result`) is distinct from the
  Integer reject (`Bad argument value`, session047 `-3 !`). `session421:` in
  `test-numerics.mjs` (after the session047 `-3 !` block) pins `FACT Real(5)` →
  `Integer(120)` (asserting `isInteger && !isReal`), `FACT Real(0)` →
  `Integer(1)`, `6.0 !` → `Integer(720)` (alias, same arm), and `FACT Real(-3)`
  → `Infinite result`. Probed live first (repo-rooted, CAS-free); no source
  change.
