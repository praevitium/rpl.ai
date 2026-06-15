# TESTS — RPL5050 unit-test lane notes

**Scope.** This is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

Git preserves the session-by-session history; this file carries only the
current state.

## Current status

`node tests/test-all.mjs` currently reports **ALL TESTS PASSED (5899)** —
fully green, 0 failing. `test-persist.mjs` 66 / 0 (stable; D-001 closed at
ship-prep 2026-04-25). `sanity.mjs` 22 / 0 in ~5 ms.

The aggregate has grown past the last full per-file table below (5666, the
session-269 snapshot, reproduced here as the most recent authoritative
breakdown); subsequent growth is concentrated in `test-types.mjs`
(data-type-support type-surface pins) with no per-file regressions.

| File                        | OK   | FAIL | Notes                              |
|-----------------------------|------|------|------------------------------------|
| test-algebra.mjs            | 1064 | 0    | Largest CAS-focused file.          |
| test-arrow-aliases.mjs      |   19 | 0    |                                    |
| test-binary-int.mjs         |  122 | 0    |                                    |
| test-comparisons.mjs        |  111 | 0    |                                    |
| test-control-flow.mjs       |  799 | 0    |                                    |
| test-entry.mjs              |  117 | 0    |                                    |
| test-eval.mjs               |   61 | 0    |                                    |
| test-helpers.mjs            |   43 | 0    |                                    |
| test-lists.mjs              |  190 | 0    |                                    |
| test-matrix.mjs             |  347 | 0    |                                    |
| test-numerics.mjs           |  709 | 0    |                                    |
| test-reflection.mjs         |  382 | 0    |                                    |
| test-stack-ops.mjs          |   48 | 0    |                                    |
| test-stats.mjs              |   55 | 0    |                                    |
| test-types.mjs              | 1215+ | 0   | Largest single growth area.        |
| test-ui.mjs                 |   77 | 0    |                                    |
| test-units.mjs              |   56 | 0    |                                    |
| test-variables.mjs          |  251 | 0    |                                    |
| **test-all (aggregate)**    | **5830** | **0** | Fully green.                 |
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
- **Pre-commit gate `scripts/pre-commit.sh`** — default invocation runs the
  ~5 ms `tests/sanity.mjs` smoke as the always-on cheap gate; `--full` adds
  `tests/test-all.mjs`; `--persist` adds `tests/test-persist.mjs`. Hookable as
  a real git hook via
  `ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit`.

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

- **O-009 — `tests/test-control-flow.mjs.bak{,2}` stray backups.** Two backup
  files (92,129 + 92,141 bytes, pre-session-111 snapshots) sit beside the live
  `test-control-flow.mjs`. Not referenced by any runner but create grep noise
  and source-of-truth confusion. `rm` from the scheduled-task sandbox returns
  `Operation not permitted`, and the `cowork_allow_file_delete` permission
  prompt is gated behind user-present approval, unavailable in unsupervised
  runs. Deferred to a human-supervised unit-tests run or the code-review lane.

### Evergreen coverage work (own item — `rpl5050-unit-tests`)

- **Positive-coverage pass on `✓` cells in DATA_TYPES that only have negative /
  rejection evidence today.** Plan: enumerate `✓` cells → grep for the op name
  in tests → flag any `✓` cell whose op has no adjacent positive assertion.
  This is the standing open queue item for the lane. erf/erfc Z (session280)
  and MANT Z (session285) are closed. Next candidates flagged earlier:
  GAMMA/LNGAMMA Z folds (`_gammaScalar`/`_lngammaScalar` `isInteger` branch),
  backed mostly by Real-operand evidence today.

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
