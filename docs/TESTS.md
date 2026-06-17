# TESTS — RPL5050 unit-test lane notes

**Scope.** This is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

Git preserves the session-by-session history; this file carries only the
current state.

## Current status

`node tests/test-all.mjs` currently reports **ALL TESTS PASSED (6691)** —
fully green, 0 failing. `test-persist.mjs` 66 / 0 (stable; D-001 closed at
ship-prep 2026-04-25). `sanity.mjs` 22 / 0 in ~5 ms. (Aggregate now 6691
after session330.)

| File                        | OK   | FAIL | Notes                              |
|-----------------------------|------|------|------------------------------------|
| test-algebra.mjs            | 1139 | 0    | Largest CAS-focused file.          |
| test-arrow-aliases.mjs      |   19 | 0    |                                    |
| test-binary-int.mjs         |  122 | 0    |                                    |
| test-chatbot-parse.mjs      |  450 | 0    |                                    |
| test-comparisons.mjs        |  131 | 0    |                                    |
| test-control-flow.mjs       |  815 | 0    |                                    |
| test-entry.mjs              |  175 | 0    |                                    |
| test-eval.mjs               |   61 | 0    |                                    |
| test-helpers.mjs            |   43 | 0    |                                    |
| test-jordan-format.mjs      |   20 | 0    |                                    |
| test-lists.mjs              |  193 | 0    |                                    |
| test-matrix.mjs             |  347 | 0    |                                    |
| test-numerics.mjs           |  769 | 0    |                                    |
| test-op-search.mjs          |   61 | 0    |                                    |
| test-reflection.mjs         |  382 | 0    |                                    |
| test-remote-llm.mjs         |   40 | 0    |                                    |
| test-stack-ops.mjs          |   53 | 0    |                                    |
| test-stats.mjs              |   55 | 0    |                                    |
| test-types.mjs              | 1293 | 0    | Largest single growth area.        |
| test-ui.mjs                 |  216 | 0    |                                    |
| test-units.mjs              |   56 | 0    |                                    |
| test-variables.mjs          |  251 | 0    |                                    |
| **test-all (aggregate)**    | **6691** | **0** | Fully green.                 |
| test-persist.mjs (separate) |   66 | 0    | Stable; D-001 closed ship-prep.    |
| sanity.mjs (standalone)     |   22 | 0    | ~5 ms smoke suite.                 |

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
  Next run: re-enumerate `✓` cells across the rest of the matrix for any
  remaining op whose result-type-determining coercion arm is exercised only by
  a sibling type — candidates worth a pass are the comparison family's
  promoteNumericPair-backed ordered ops and the Complex-promotion arm of the
  arithmetic ops (Integer/Real ∘ Complex → Complex via toComplex's per-type
  arms).

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
