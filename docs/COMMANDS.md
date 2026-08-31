# COMMANDS.md — command-support lane inventory

Authoritative status of every HP50 RPL command the `rpl5050-command-support`
lane tracks.  This file is maintained by the command-support lane and is
the canonical place to flip a row from `✗` to `~` to `✓` as an op ships.

For data-type width of an already-shipped op (Tagged transparency, List
distribution, Symbolic lift, V/M broadcast, Unit handling, BinaryInteger
coercion), see `docs/DATA_TYPES.md`.  This file records **whether the op
exists at all**, not the shape of its type coverage.

## Legend

| Symbol | Meaning |
|--------|---------|
| `✓` | Fully shipped — registered in `www/src/rpl/ops.js`, reachable from the keypad, ≥1 positive + ≥1 rejection test covered. |
| `~` | Partially shipped — e.g. the op exists but rejects a whole argument class HP50 accepts, or an alias is missing, or there's no rejection-path coverage yet. |
| `✗` | Not yet implemented. |
| `will-not` | Explicitly out of scope per `docs/@!MY_NOTES.md` (USER, ENTRY, S.SLV, NUM.SLV, FINANCE, TIME, DEF, LIB, OFF) or replaced by a deliberate design deviation. |

Where relevant the **Notes** column records the last session number that
touched the row, and any known caveats worth carrying forward.

## Current status

- **Fully shipped (✓): 449** — as of 2026-08-31 (v0.3.6). For reference,
  `grep -cE "^register\(" www/src/rpl/ops.js` = 463 distinct registered
  names and `allOps()` = 467 reachable; the ✓ total is those minus
  internal aliases and `will-not` rows.
- **Partially shipped (~): 0**
- **Not yet implemented (✗): 1** — only `JORDAN` remains.  Its
  CAS-independent formatting core ships as `www/src/rpl/jordan-format.js`
  (tested in `tests/test-jordan-format.mjs`); what remains is the
  `ops.js` wiring that pulls eigenvalues / multiplicities /
  characteristic spaces / Jordan chains out of Giac and feeds those
  builders (its level-4 / level-3 outputs already ship as `PMINI` /
  `PCAR`).  The Giac eigenvects / Jordan-chain output shape needs
  real-CAS verification before the op can be registered.

  **Session 199 — real-CAS verification path established (no source
  change).**  Contrary to the `giac-engine.mjs` / vendor README claim
  that "real Giac is intentionally not run in Node," the vendored WASM
  *does* load and `caseval` under Node — a probe produced full
  `eigenvects([[1,1],[1,1]])` / `jordan(...)` output in one run.  Recipe:
  set `globalThis.Module = { wasmBinary: fs.readFileSync('.../giacwasm.wasm'),
  locateFile, noInitialRun: true }`, `require('giacwasm.js')`, await
  `onRuntimeInitialized`, then `Module.cwrap('caseval','string',['string'])`.
  Blocker for the auto-loop: WASM init takes ~40–45 s, right at the 45 s
  sandbox-bash cap, so capture is flaky here (most attempts time out).

  **Session 200 — recipe refinement + blocker re-confirmed (no source
  change).**  Two corrections to the session-199 recipe for the next
  run: (1) this emscripten build *ignores* both `Module.wasmBinary` and
  `Module.locateFile` and reads a bare relative `giacwasm.wasm` via its
  own `readBinary`, so the probe must run with `cwd` set to
  `www/src/vendor/giac/` (running from the repo root fails with `ENOENT:
  giacwasm.wasm`).  (2) Detached / `nohup`+`setsid` background processes
  do **not** survive across independent sandbox-bash calls (re-verified —
  no node process and no output file persisted), so the warmed/long-lived
  capture strategy is a dead end here; the probe has to finish inside one
  bash call.  With the `cwd` fix the probe gets past the wasm-load step
  but still exits 124 (timeout) before `onRuntimeInitialized` fires —
  init alone exceeds the 43 s budget.  JORDAN shape-capture remains
  blocked in this environment; needs a host where Giac init fits the cap.
  Next command-support run should capture the `eigenvals` / `eigenvects`
  / `jordan` / `pmin` / `charpoly` shapes for the AUR worked example with
  a warmed/cached run (or by persisting the probe output to disk across a
  longer-running harness) and *then* register `JORDAN` with fixtures that
  match the real shapes — not a guess.
- **Will-not-support (by design): 9 menu groups** (see below).

The registry lives at `www/src/rpl/ops.js` and is enumerated by
`allOps()`.  The entire MODULO family is ✓; `SCHUR` is ✓.

---

## Arithmetic & scalar math

**Numeric type upgrade — session 092.**  Scalar arithmetic is now
backed by three vendored libraries, all under the no-fallback rule
(if the library errors, the op errors — no legacy hand-rolled path):

- **Rational** (`TYPES.RATIONAL`, new this session) — BigInt-backed
  exact ratio `n/d`.  Integer ÷ Integer that doesn't divide evenly
  returns Rational in EXACT mode, Real in APPROX.  All unary ops
  (NEG, ABS, INV, SQ, SQRT, FLOOR/CEIL/IP/FP, SIGN) have
  EXACT/APPROX-aware dispatch: EXACT keeps exactness where
  meaningful, APPROX collapses to Real.  Backed by Fraction.js
  v5.3.4 at `www/src/vendor/fraction.js/`.
- **Real** — `.value` is a **decimal.js Decimal instance** at
  precision 15 (session 093 finished the payload migration; session
  092 had routed arithmetic through Decimal but still unwrapped to JS
  number on the stack).  Every op, formatter, and persistence codec
  reads Decimals via the decimal.js API, so arithmetic chains
  preserve 15-digit precision without IEEE-754 round-trips between
  ops.  The classic `0.1 + 0.2 → 0.3` gotcha is healed, and
  `100! / 99!` stays exact-equal to `100` at 100 digits.  Persisted
  via `{ __t: 'decimal', v: '<toString>' }`.  Backed by decimal.js
  v10.4.3 at `www/src/vendor/decimal.js/`.
- **Complex** — `{ re, im }` on the stack; `complexBinary` now
  routes through complex.js (identity preservation for `i*i = -1`,
  correct branch-cut handling in polar-form `^`).  Backed by
  complex.js v2.4.3 at `www/src/vendor/complex.js/`.

Rational values lift into the Symbolic AST as `Bin('/', Num(n),
Num(d))` so they compose cleanly with CAS ops (FACTOR, EXPAND,
DERIV, etc. via Giac).

| Command | Status | Notes |
|---------|--------|-------|
| `+` `-` `*` `/` `^` | ✓ | Full R/Z/Rat/C/BIN/Vec/Mat/Unit/Sym dispatch (many sessions).  Session 092 — Rational arithmetic (EXACT/APPROX-aware), Real via decimal.js, Complex via complex.js. |
| `NEG` `ABS` `INV` `SQ` `SQRT` | ✓ | Session 064 Tagged transparency; INV/M is matrix inverse, SQ/M is matmul. |
| `SIGN` | ✓ | Session 062 widening (Sy/L/T). |
| `ARG` `CONJ` `RE` `IM` | ✓ | |
| `MAXR` `MINR` | ✓ | Machine Max/Min Real. |
| `RND` `TRNC` `TRUNC` | ✓ | **Session 081** — `TRUNC` two-arg form `(x n → round-toward-zero to n places)` shipped; shares `_truncTowardZero` with `TRNC`, Symbolic lift on `x` or `n`, Integer passthrough. |
| `MANT` `XPON` | ✓ | |
| `FLOOR` `CEIL` `IP` `FP` | ✓ | Session 062 — Tagged + List + V/M + Sym lift.  Session 072 — Unit (`1.5_m FLOOR` → `1_m`, uexpr preserved).  Session 087 — BinaryInteger accepted (no-op; FP of BinInt = `#0` in same base). |
| `MOD` | ✓ | Floor-div (sign-of-divisor).  Session 062 Sym lift.  Session 068 pinned V/M rejection. |
| `MIN` `MAX` | ✓ | Session 062 Sym lift + Tagged.  Session 068 pinned V/M rejection (HP50 AUR §3 scalar-only). |
| `GCD` `LCM` | ✓ | Session 064 — Sy/N/L/T. |
| `%` `%T` `%CH` | ✓ | Session 064 Tagged + List.  Session 072 pinned V/M rejection (HP50 AUR §3-1 scalar-only). |
| `COMB` `PERM` | ✓ | Session 065.  Integer-only (non-integer Real rejected).  Session 153 — `_combPermArgs` argument-type guard tightened to mirror `_intQuotientArg`: Rational is rejected with `Bad argument type` even when integer-valued (`5/1`).  Closes `C-011` from `docs/REVIEW.md` — was leaking `TypeError: Cannot read properties of undefined (reading 'isFinite')` because the prior `isNumber`-based guard let Rational through to a downstream `.value.isFinite()` access on `{n, d}`. |
| `FACT` (`!`) | ✓ | Session 031; session 063 L/V/M/Sy widening.  **Session 350** — closed the ✓-criterion rejection gap for the postfix `!` alias (thin `lookup('FACT').fn(s)` wrapper; previously only the canonical FACT had rejection coverage).  +5 `session350:` pins in `tests/test-arrow-aliases.mjs` lock the delegation's guard propagation: `!` on Complex / String → `Bad argument type`, negative Integer → `Bad argument value`, negative integer-valued Real → `Infinite result` (gamma pole), with the Complex reject asserted identical to FACT.  Guards a future inline reimplementation that drops the delegation. |
| `IDIV2` | ✓ | Session 065.  Two-result; no wrappers. |
| `IQUOT` `IREMAINDER` | ✓ | Session 068 — single-result siblings of IDIV2, Tagged + List + Sy. |
| `GAMMA` `LNGAMMA` | ✓ | Session 068 — Lanczos-backed special functions. |
| `Beta` | ✓ | **Session 069** — B(a, b) = Γ(a)Γ(b)/Γ(a+b) via Lanczos log-gamma, Tagged + List + Sy. |
| `erf` `erfc` | ✓ | **Session 069** — erf via P(1/2, x²); erfc via Q(1/2, x²) for no-cancellation large-x tail. |
| `PSI` | ✓ | **Session 081** — digamma ψ(x) (1-arg) + polygamma ψ⁽ⁿ⁾(x) (2-arg with integer n ≥ 0).  Reflection for x < 0.5, integer-shift recurrence, Bernoulli asymptotic (2k=12).  Poles at non-positive integers throw `Infinite result`.  Tagged + List + V/M + Sym lift. |
| `ZETA` | ✓ | **Session 086** — Riemann zeta ζ(s).  Euler-Maclaurin (N=15, M=6 Bernoulli terms) for s ≥ 0.5, functional-equation reflection below.  s=0 → -1/2; s=1 → `Infinite result` (simple pole); negative even integers → exact 0 (trivial zeros).  Tagged + List + V/M + Sym lift. |
| `LAMBERT` | ✓ | **Session 086** — Lambert W₀ (principal branch).  Halley iteration seeded with a Puiseux expansion near x=-1/e so the branch point returns -1 exactly in double precision.  x < -1/e → `Bad argument value`.  Tagged + List + V/M + Sym lift. |
| `Ei` | ✓ | **Session 109** — exponential integral Ei(x).  x > 0: power series γ + ln x + Σ x^k/(k·k!) for x < 40; asymptotic (e^x/x) · Σ k!/x^k truncated at the smallest term for x ≥ 40.  x < 0: Ei(x) = -E1(-x) via series for \|x\| < 1 and modified-Lentz CF for \|x\| ≥ 1.  x = 0 → `Infinite result`.  Tagged + List + V/M + Sym lift. |
| `Si` | ✓ | **Session 109** — sine integral Si(x), entire and odd.  \|x\| ≤ 4: odd power series Σ (-1)^k x^{2k+1}/((2k+1)(2k+1)!).  \|x\| > 4: complex-Lentz CF for E1(i·\|x\|) gives Si(\|x\|) = π/2 + Im(E1(i·\|x\|)).  Si(0) = 0 exact.  Tagged + List + V/M + Sym lift. |
| `Ci` | ✓ | **Session 109** — cosine integral Ci(x), real-mode x > 0.  x ≤ 4: γ + ln x + Σ (-1)^k x^{2k}/((2k)(2k)!).  x > 4: Ci(x) = -Re(E1(i·x)) via the same complex-Lentz CF as Si.  x = 0 → `Infinite result`; x < 0 → `Bad argument value` (complex result deferred).  Tagged + List + V/M + Sym lift. |
| `XROOT` | ✓ | Sy lift. |
| `EXP` `EXPM` `LN` `LNP1` `LOG` `ALOG` | ✓ | |
| `SIN` `COS` `TAN` `ASIN` `ACOS` `ATAN` | ✓ | Angle-mode aware. |
| `SINH` `COSH` `TANH` `ASINH` `ACOSH` `ATANH` | ✓ | |

## Comparisons / boolean

| Command | Status | Notes |
|---------|--------|-------|
| `==` `=` `<>` `≠` `<` `>` `<=` `>=` `≤` `≥` | ✓ | Session 072 — `==` widened to structural compare on List / Vector / Matrix / Symbolic / Tagged / Unit (was: returned 0 for all such pairs). Session 074 — BinaryInteger widening: `==` / `≠` / `<>` cross-base and cross-family (BinInt × Integer/Real/Complex) through `_binIntCrossNormalize`; `<` / `>` / `≤` / `≥` widened in `comparePair` by promoting BinInt to Integer(value & wordsize-mask). Session 087 — `<` / `>` / `≤` / `≥` accept String × String (char-code lex; HP50 User Guide App. J); `==` / `SAME` widen to Program (structural) and Directory (reference identity). |
| `AND` `OR` `XOR` `NOT` | ✓ | Real/Int/Binary. |
| `SAME` | ✓ | Strict structural equality.  Session 072 same widening as `==`; never lifts to Symbolic. Session 074 — accepts BinInt × BinInt value compare (cross-base) via the eqValues BinInt branch, but deliberately does NOT cross-family widen (so `SAME #10h Integer(16)` = 0). Session 087 — Program (structural) and Directory (reference identity). |
| `TRUE` `FALSE` | ✓ | |

## Bitwise / BinaryInteger

| Command | Status | Notes |
|---------|--------|-------|
| `AND` `OR` `XOR` `NOT` | ✓ | Binary branch. |
| `SL` `SR` `SLB` `SRB` `ASR` | ✓ | |
| `RL` `RR` `RLB` `RRB` | ✓ | |
| `STWS` `RCWS` | ✓ | Wordsize get/set. |
| `BIN` `DEC` `HEX` `OCT` | ✓ | Base mode cycle. |
| `R→B` `B→R` `R->B` `B->R` | ✓ | Session 066/430 arrow-alias coverage; reject-symmetric across all four independent closures (B→R/B->R reject Real/Integer/Complex/String; R→B/R->B reject Complex/String/BinInt — all `Bad argument type`). |

## Angle / conversion

| Command | Status | Notes |
|---------|--------|-------|
| `DEG` `RAD` `GRD` `GRAD` | ✓ | |
| `R→D` `D→R` `R->D` `D->R` | ✓ | **Session 423** — closed the family's rejection-coverage gap.  Each ASCII alias (`R->D`/`D->R`) is its own independent `unaryReal(...)` registration (`ops.js` ~2969-2970) — a THIRD alias shape, neither the shared-fn-instance form (C→R) nor the delegating-wrapper form (->UNIT) — so `fn !== ` its Unicode canonical and the two closures re-derive the same `toRealOrThrow` guard separately.  session064 pinned only happy-path equivalence; +18 `session423:` pins in `tests/test-arrow-aliases.mjs` lock the distinct-instance identity for both aliases and the shared reject across all four ops: String / Vector / Matrix / im≠0 Complex → `Bad argument type` (List distributes via `_withListUnary`, a real-valued Complex coerces — neither rejects).  Test-only; no source change. |
| `→HMS` `HMS→` `HMS+` `HMS-` | ✓ | **Session 410** — closed the family's rejection-coverage gaps.  session044 pinned only happy paths for the binary `HMS+`/`HMS-` and happy-path equivalence for the ASCII aliases `->HMS`/`HMS->` (which are DISTINCT `_hmsUnary` closures, not the canonical fn instance).  +10 `session410:` pins in `tests/test-numerics.mjs`: `HMS+`/`HMS-` Complex (either slot) + String → `Bad argument type`, invalid HH.MMSS (minutes ≥ 60, either slot) → `Bad argument value`; `->HMS` Complex/String → `Bad argument type`, `HMS->` invalid → `Bad argument value`.  Test-only; no source change. |
| `D→HMS` `HMS→D` | ✓ | **Session 410** — degree siblings (distinct `_hmsUnary` closures).  Tightened the unpinned `D→HMS`-on-Complex `assertThrows(…, null, …)` to assert `Bad argument type`, and +3 `session410:` pins: `HMS→D` invalid HH.MMSS → `Bad argument value` (the canonical `HMS→` pin's degree mirror), `D->HMS` Complex → `Bad argument type`, `HMS->D` invalid → `Bad argument value`.  Test-only; no source change. |
| `C→R` `R→C` `C->R` `R->C` | ✓ | **Session 404** — closed the C→R/R→C rejection-symmetry gap.  session043 pinned only R→C's String reject; C→R's canonical `Bad argument type` throw was unpinned and the ASCII aliases `C->R`/`R->C` had happy-path-only coverage.  Both alias pairs share the canonical fn instance (`register('R->C', _rToCOp)` / `register('C->R', _cToROp)`), so they reject identically.  +6 `session404:` pins in `tests/test-numerics.mjs`: shared-fn-instance for both pairs, C→R on String + C→R on a non-Complex/Real/Integer vector element (the inner-loop guard), C->R String reject, R->C String-operand reject.  Test-only; no source change. |
| `C→P` `P→C` `C->P` `P->C` | ✓ | **Session 398** — closed the C→P/P→C rejection-symmetry gap.  session055 pinned only C→P's Vector reject and the C->P/P->C aliases' happy paths; both `_cToPOp`/`_pToCOp` accept Complex/Real/Integer and reject everything else with `Bad argument type`, and the ASCII aliases share the canonical fn instance.  +6 `session398:` pins in `tests/test-numerics.mjs`: P→C Vector + String reject (the missing canonical sibling), C->P / P->C Vector reject, and a shared-fn-instance assertion for both alias pairs.  Test-only; no source change. |
| `CYLIN` `SPHERE` `RECT` | ✓ | Coord-mode switches. |

## Stack manipulation

| Command | Status | Notes |
|---------|--------|-------|
| `DUP` `DROP` `SWAP` `OVER` `ROT` | ✓ | |
| `DUP2` `DROP2` `DROPN` `DUPN` `PICK` `PICK3` `UNPICK` | ✓ | |
| `ROLL` `ROLLD` `NIP` `NDUPN` `DUPDUP` | ✓ | |
| `DEPTH` `CLEAR` | ✓ | |
| `UNDO` `LASTSTACK` `REDO` | ✓ | Multi-level (deviation from HP50). session322 pins the registered UNDO/REDO op path: round-trip, both empty-history rejections, redo-history invalidation. |
| `LAST` `LASTARG` | ✓ | |

## Types / reflection

| Command | Status | Notes |
|---------|--------|-------|
| `TYPE` `VTYPE` `KIND` | ✓ | |
| `CMPLX?` `CMPLX` | ✓ | |
| `→TAG` `DTAG` `->TAG` | ✓ | **Session 350** — closed the ✓-criterion rejection gap for the ASCII `->TAG` alias (thin `lookup('→TAG').fn(s)` wrapper; session064 pinned only its happy-path equivalence).  +3 `session350:` pins in `tests/test-arrow-aliases.mjs` lock `->TAG`'s level-1 tag-type rejection through `→TAG`'s `_asTagString` guard (Real / Vector tag → `Bad argument type`), asserting the alias and canonical reject identically.  Guards a future inline reimplementation that drops the delegation. |
| `→UNIT` `->UNIT` `UVAL` `UBASE` `CONVERT` | ✓ | **Session 364** — closed the ✓-criterion rejection gap for the ASCII `->UNIT` alias (a delegating `OPS.get('→UNIT').fn(s)` wrapper — distinct fn reference, not shared — so a future inline reimplementation could drop a guard; session064 pinned only its happy-path equivalence).  +8 `session364:` pins in `tests/test-arrow-aliases.mjs` lock both operand-position rejects through the canonical: non-Unit template at L1 (Real / String / Vector → `Bad argument type` via `!isUnit(u)`) and non-numeric value at L2 (String / Vector / Unit → `Bad argument type` via `_numVal`), plus a positive Integer-value pass-through and a `fn !== canonical` delegation-shape assertion.  Test-only; no source change. |
| `OBJ→` `→STR` `STR→` | ✓ | **Session 067** — OBJ→ on Program + →PRG composer.  **Session 155** — R-008 close: HP50 AUR §3-149 fidelity audit of the Real / Integer and Tagged branches.  Real / Integer now push back unchanged (1-in / 1-out) — AUR §3-149 lists no numeric-scalar Input/Output row, and the prior depth-2 mantissa/exponent split was an HP50-divergence; users wanting the split now reach for `MANT` / `XPON` (AUR p.3-6 / p.3-9), unchanged.  Tagged push order verified against AUR §3-149 (`:tag:obj → obj "tag"`): the tag is a String, not a Name — see the dispatch comment at `ops.js:6640-6644` warning future readers off the `Str(v.tag) → Name(v.tag)` "fix".  **Session 156** — follow-up pin coverage in `tests/test-reflection.mjs` for the boundary cells the audit didn't enumerate: empty Vector → `{0}`, empty List / empty Program → Integer(0), negative Real unchanged, Tagged-of-Tagged peels only the outer layer (preserves the inner Tagged on level 2, outer tag as String on level 1).  **Session 159** — R-012 close: missing `isUnit` branch added at `ops.js:6740-6752` per AUR §3-149's `x_unit → x  1_unit` row.  The bare numeric value lands on level 2 as a Real; the unit prototype `Unit(1, v.uexpr)` lands on level 1 — `*`-fold on the pair reconstructs the original Unit because `_unitBinary` on Real×Unit folds the scalar into `b.value` (1·x = x) while preserving the uexpr.  Header block at `:6605-6655` extended with a Unit-row entry (and a sibling note explaining why the bare `Unit(1, v.uexpr)` constructor is used instead of `_makeUnit` — preserves the AUR's shape-preserving "1_unit" output even for a theoretically-empty uexpr).  Closes the AUR §3-149 audit trail end-to-end: every Input/Output table row (Complex / Tagged / List / Vector / Matrix / String / Program / Symbolic / Real / Integer / Unit) now has a matching branch in `register('OBJ→', ...)`.  Pinned by 15 `session159:` assertions in `tests/test-reflection.mjs` plus 6 `session160:` boundary-edge follow-ups (zero-value `0_m`, fractional `2.5_m`, exponent-≠-±1 `3_m^2`, multi-symbol round-trip `5_m/s`, higher-power round-trip `3_m^2`).  **Session 163** — AUR-fidelity audit extension to the remaining numeric-scalar shapes: BinaryInteger and Rational.  One-predicate widening at `ops.js:6746` (the existing Real/Integer guard now reads `isReal(v) || isInteger(v) || isBinaryInteger(v) || isRational(v)`), so all four numeric-scalar shapes share the same `s.push(v); return;` body.  Pre-fix `#15h OBJ→` and `3/4 OBJ→` both rejected `Bad argument type`; post-fix both push the value back unchanged — symmetric with the session-155 Real/Integer choice (AUR §3-149 lists no numeric-scalar entry, so push-back is the consistent fidelity choice).  Header / inline body comments at `ops.js:6625-6643` and `:6747-6760` extended to enumerate the BinInt and Rational rows alongside Real / Integer.  Pinned by 8 `session163:` assertions in `tests/test-reflection.mjs`. |
| `NEWOB` | ✓ | Deep copy.  **Session 167** — AUR §3-130 fidelity audit extension to Rational (sibling to session 163's OBJ→ widening on the same shape).  `_newObCopy` at `www/src/rpl/ops.js:9309-9339` now enumerates every numeric-scalar shape (Real / Integer / BinaryInteger / Rational / Complex) explicitly; pre-fix `3/4 NEWOB` returned the same frozen instance (`===` identity preserved through the unenumerated tail), post-fix returns a fresh frozen Rational with the same `n` / `d` payload — observably distinct only through identity, which is the contract AUR §3-130 ("force a new copy") requires.  Directory and Grob remain at the deliberate identity fall-through (Directory is a live mutable container, Grob flows through its own value-copy path).  Pinned by 20 `session167:` assertions in `tests/test-reflection.mjs` covering distinct-object identity, sign convention on `Rational(-7n, 2n)`, n/1 type stability (no collapse to Integer), zero canonicalisation, and shallow-copy composition through List / Tagged / OBJ→. |
| `BYTES` | ✓ | |
| `APPROX` `EXACT` `→NUM` `→Q` `→Qπ` `Q→` | ✓ | **Session 370** — closed the ✓-criterion rejection gap for the ASCII `->NUM` alias (a delegating `OPS.get('→NUM').fn(s)` wrapper — distinct fn reference; session200 in `tests/test-algebra.mjs` pinned only its happy-path SQRT(4)→2 fold).  +2 `session370:` pins in `tests/test-arrow-aliases.mjs`: `->NUM` delegates to →NUM→EVAL (no scalar type guard) so its rejection surface is EVAL's empty-stack `Too few arguments` underflow, plus a `fn !== canonical` delegation-shape assertion.  Test-only; no source change.  **Session 343** — closed the ✓-criterion rejection gap for the ASCII conversion aliases `->Q` / `->Qπ` / `Q->` (thin `lookup(canonical).fn(s)` wrappers; session064 pinned only their happy-path equivalence to the Unicode canonicals).  +7 `session343:` pins in `tests/test-arrow-aliases.mjs` lock each alias's CAS-free rejection delegation: `->Q`/`->Qπ` on Complex → `Bad argument type` and Real(∞) → `Bad argument value`; `Q->` on non-integer Real → `Bad argument value`, non-q-shape Symbolic (`SIN(X)`) and Complex → `Bad argument type`.  Guards a future inline reimplementation of an alias that drops the delegation. |
| `XNUM` `XQ` | ✓ | **Session 086** — ASCII aliases for `→NUM` / `→Q`.  Thin wrappers that delegate via `OPS.get('→NUM').fn` / `OPS.get('→Q').fn` so they pick up any future refinement automatically.  **Session 200** — closed the ✓-criterion rejection gap: the prior coverage was happy-path only.  +4 `session200:` pins in `tests/test-numerics.mjs` lock the delegation's guard propagation — `XQ` inherits →Q's Integer-passthrough branch (`Integer(5)` → `Symbolic Num(5)`, no `/1`), its type guard (`String` → `Bad argument type`) and finiteness guard (`Real(∞)` → `Bad argument value`); `XNUM` delegates to →NUM→EVAL (no scalar type guard) so its rejection path is the empty-stack underflow (`Too few arguments`).  A future inline reimplementation that drops a guard is now caught. |
| `TVARS` | ✓ | **Session 099** — filter names in the current directory by HP50 type code.  Single-arg form `(code → {names})` accepts Integer or integer-valued Real; List-arg form `({codes} → {names})` unions matches across codes.  Negative codes complement ("not of this type"); a list mixing positives and negatives = `{union of positives} ∖ {union of |negatives|}` (HP50 AUR p.2-218).  Rejects non-integer Real, Name, String, and non-integer list elements with `Bad argument type`. |

## Lists

| Command | Status | Notes |
|---------|--------|-------|
| `→LIST` `LIST→` `→LIST` (arrow) | ✓ | **Session 329** — ASCII `LIST->` alias coverage pinned (shares `_fromListOp` with Unicode `LIST→`): alias-identity, identical list expansion, and non-List `Bad argument type` rejection. |
| `SIZE` `HEAD` `TAIL` `APPEND` | ✓ | **Session 088** — `SIZE` widened to Program (count of top-level tokens; matches HP50 AUR). |
| `GET` `GETI` `PUT` `PUTI` | ✓ | |
| `SUB` `POS` `REVLIST` `SORT` | ✓ | |
| `SEQ` `DOLIST` `DOSUBS` `NSUB` `ENDSUB` `STREAM` | ✓ | |
| `ΣLIST` `ΔLIST` `ΠLIST` `SLIST` `DLIST` `PLIST` (ASCII) | ✓ | **Session 377** — closed the last ✓-criterion rejection gaps in the fold/diff family.  `ΣLIST` / `ΔLIST` already owned a non-list reject pin, but `ΠLIST` never had one and the ASCII aliases `SLIST` / `PLIST` / `DLIST` had positive coverage only.  `SLIST` / `PLIST` are independent `_foldListOp` closures (distinct fn instances, not delegating wrappers — `fn !== ΣLIST.fn` / `fn !== ΠLIST.fn`); `DLIST` is a `(s) => OPS.get('ΔLIST').fn(s)` wrapper (`fn !== ΔLIST.fn`).  +5 `session377:` pins in `tests/test-lists.mjs` lock the shared `!isList(l)` guard on a non-List operand → `Bad argument type` for all four plus a distinct-instance assertion.  Test-only; no source change. |
| `+` (on Lists) | ✓ | HP50 AUR §3-7 list addition is **concatenation**, not element-wise: `{1 2 3} {4 5 6} +` → `{1 2 3 4 5 6}`; `{1 2 3} 4 +` → `{1 2 3 4}` (append); `4 {1 2 3} +` → `{4 1 2 3}` (prepend); empty lists obey the same rule (`{} 5 +` → `{5}`).  Mismatched-length pairs concatenate (no "Invalid dimension").  List operands take precedence over the String-coerce branch — `{1 2} "hi" +` → `{1 2 "hi"}`, not `"{1, 2}hi"`.  `*`, `-`, `/`, `^` continue to distribute element-wise into Lists; element-wise list addition is reserved for ADD / DOLIST. |

## Strings

| Command | Status | Notes |
|---------|--------|-------|
| `SIZE` `→STR` `STR→` | ✓ | Shared with lists. |
| `SUB` `POS` `REPL` `SREPL` | ✓ | |
| `CHR` `NUM` | ✓ | |
| `+` | ✓ | Concatenation via `+`. |

## Vectors / Matrices / Arrays

| Command | Status | Notes |
|---------|--------|-------|
| `→ARRY` `ARRY→` `→COL` `COL→` `→ROW` `ROW→` `→V2` `→V3` `V→` | ✓ | Session 384 pinned `→V3`/`->V3` underflow (sibling `→V2` was already pinned) + `→V2` 0-arg boundary. Session 391 closed the row/col ASCII-alias reject gap: `->ROW`/`->COL`/`ROW->`/`COL->` had happy-path-only coverage while their canonicals carried session051 reject pins; all four share the canonical fn instance, so they reject identically — pinned the shared-instance identity + the mirrored rejects. Session 417 closed the vector-compose/decompose alias gap: `->V2`/`->V3`/`V->` all share their Unicode canonical's fn instance, but only `V→` carried non-vector reject pins (Real/Matrix) while `V->` had happy-path-only coverage — pinned the three shared-instance identities + `V->` Real/Matrix/String → `Bad argument type`. Session 437 closed the remaining array-compose/decompose alias gap: `->ARRY`/`ARRY->` share their Unicode canonical's fn instance (`_toArrayOp`/`_fromArrayOp`) but had happy-path-only coverage while the canonicals carried session372/405 (compose) + the `ARRY→`-on-Real (decompose) reject pins — pinned the two shared-instance identities + `->ARRY` String dim-spec/3-element size-list/-1 size-item rejects + a positive `{2}` pass-through + `ARRY->` Real/String → `Bad argument type`. |
| `ROW+` `ROW-` `COL+` `COL-` `CSWP` `RSWP` | ✓ | |
| `RCI` `RCIJ` `RDM` `AXL` `AXM` | ✓ | |
| `REPL` `SUB` `GET` `GETI` `PUT` `PUTI` | ✓ | |
| `TRN` `DET` `TRACE` `RANK` `COND` `NORM` | ✓ | |
| `RREF` `REF` `CHOLESKY` `LU` `QR` `LQ` | ✓ | |
| `SCONJ` `SNEG` `SINV` `LSQ` `HADAMARD` | ✓ | |
| `CNRM` `RNRM` `CROSS` `DOT` | ✓ | |
| `GRAMSCHMIDT` `MERGE` `EULER` | ✓ | |
| `IDN` `CON` `RANM` `RDM` | ✓ | |
| `HILBERT` `VANDERMONDE` `AUGMENT` `FLAT` | ✓ | |
| `MAD` | ✓ | |
| `PCAR` `CHARPOL` `EGVL` | ✓ | **Session 114 [Giac]** — characteristic polynomial (`PCAR` = HP50 canonical, `CHARPOL` = Giac-style alias both via `charpoly(M,vx)`) and eigenvalue vector via `eigenvals(M)` (Xcas's list form; `egvl(M)` is the Jordan-matrix form and isn't what HP50 wants).  HP50 AUR §3-196, §3-90.  Square-matrix input only; entries serialised to Giac brackets via `_matrixToGiacStr` + `_scalarToGiacStr` (Integer/Real/Rational/Complex/Symbolic/Name).  Eigenvalues come back as a flat bracket list → Vector of AST-lifted items via `_astToRplValue`.  No-fallback policy.  **Session 203** — closed the ✓-criterion rejection gap for the `CHARPOL` alias: it delegates via `OPS.get('PCAR').fn`, so its rejections flow through `_popSquareMatrix`, which throws before the `giac.isReady()` check (no CAS needed), but only `PCAR` had rejection pins.  +4 `session203:` pins in `tests/test-algebra.mjs` lock `CHARPOL` on Vector / Integer / String → `Bad argument type` and 2×3 → `Invalid dimension` — guards a future inline reimplementation that drops the shared validator. |
| `PMINI` | ✓ | **Session 197 [Giac]** — `( [[ M ]] → 'pmin' )` minimal polynomial of a square matrix.  HP50 AUR §3-172.  Sibling of PCAR: same `_popSquareMatrix` validator + `_matrixToGiacStr` serialization, routed through Giac `pmin(M,vx)` instead of `charpoly`; result is a Symbolic in the CAS variable (also JORDAN's level-4 output).  Non-Matrix → `Bad argument type`; non-square → `Invalid dimension`.  No-fallback policy (`!giac.isReady()` ⇒ `CAS not ready`).  Was missing from both the registry and this inventory before session 197. |
| `EGV` | ✓ | **Session 119 [Giac]** — `( [[ M ]] → [[ EVec ]] [ EVal ] )`. HP50 AUR §3-73.  Square-matrix-only.  Eigenvector matrix via Xcas `egv(M)` (columns = right eigenvectors so `M·P = P·diag(EVal)`); eigenvalue vector via the same `eigenvals(M)` call EGVL uses, so the i-th eigenvalue corresponds to the i-th column of EVec by construction.  Reuses `_matrixToGiacStr` / `_popSquareMatrix` from PCAR; non-list Giac output → `Bad argument value`.  No-fallback policy. |
| `RSD` | ✓ | **Session 119** — `( B A Z → B−A·Z )` residual.  HP50 AUR §3-213.  Native numeric (Real / Integer entries); reuses `_asNumArray*` and `_matMulNum` / `_matVecNum`.  Both vector-vector and matrix-matrix shapes supported; mixed shapes (vec/mat) reject with `Bad argument type`; cols(A) ≠ len(Z)/rows(Z) or rows(A) ≠ len(B)/rows(B) reject with `Invalid dimension`.  Symbolic entries reject (numeric-only path, mirrors LSQ). |
| `SCHUR` | ✓ | **Session 196 [Giac]** — `( [[ M ]] → [[ Q ]] [[ T ]] )` Schur decomposition.  HP50 AUR §3-218.  Square-matrix-only.  Giac `SCHUR(A) = hessenberg(A,-1)` returns the pair `[P, B]` with `B = inv(P)·A·P`; P is orthogonal so `inv(P) = TRN(P)`, matching HP50's `A = Q·T·TRN(Q)` (P↔Q at level 2, B↔T at level 1).  Reuses `_popSquareMatrix` / `_matrixToGiacStr` / `_astToRplValue` from EGV; non-pair / non-matrix Giac output → `Bad argument value`.  No-fallback policy (`!giac.isReady()` ⇒ `CAS not ready`). |

## Polynomials / algebra

| Command | Status | Notes |
|---------|--------|-------|
| `HORNER` `PEVAL` `PROOT` `PCOEF` `PTAYL` | ✓ | |
| `FCOEF` `FROOTS` `TCHEB` `TCHEBYCHEFF` | ✓ | |
| `HERMITE` `LEGENDRE` | ✓ | |
| `QUOT` `REMAINDER` `IABCUV` `ICHINREM` `IEGCD` | ✓ | |
| `IBERNOULLI` `DIVIS` `FACTORS` | ✓ | |
| `ISPRIME?` `NEXTPRIME` `PREVPRIME` | ✓ | |
| `EUCLID` | ✓ | **Session 076** — `( a b → {u v g} )` extended-Euclid / Bezout; `u*a + v*b = g`.  Rejects `(0,0)` ("Bad argument value"), non-Integer ("Bad argument type").  Re-signs u,v for negative inputs. |
| `INVMOD` | ✓ | **Session 076** — `( a n → a⁻¹ mod n )` two-arg modular inverse.  Reduces `a` into `[0, n)`.  Rejects `n < 2`, `a ≡ 0 (mod n)`, `gcd(a,n) ≠ 1` ("Bad argument value").  Block-comment phrasings refreshed session 149 (closes `C-010`).  Session 153 — the explicit-modulus 2-arg form is **deliberate**; HP50 firmware exposes INVMOD as a 1-arg op consuming `state.casModulo` like ADDTMOD / SUBTMOD / MULTMOD / POWMOD, but rpl5050 keeps the 2-arg form so programs can compute inverses against ad-hoc moduli without an intervening MODSTO.  Codified in the Intentional Deviations table at `docs/@!MY_NOTES.md`; the prior `TODO` for adding a 1-arg form has been retired. |
| `MODSTO` | ✓ | **Session 144** — `( m → )` set the global CAS MODULO state value (HP50 AUR §3-150).  `state.casModulo` is a BigInt, default 13n; setter normalizes negatives to abs and 0 / 1 to 2 (HP50 firmware contract: modulus is always ≥ 2 positive).  Persisted across reload via `persist.js` (`{ __t: 'bigint', v: '<digits>' }` codec).  Accepts Integer or integer-valued Real; non-integer Real → `Bad argument value`; Vector / Symbolic / etc. → `Bad argument type`. |
| `ADDTMOD` `SUBTMOD` `MULTMOD` | ✓ | **Session 144** — `( a b → (a±·) mod m )` modular arithmetic against the MODSTO-set modulus (HP50 AUR §3-9 / §3-243 / §3-153).  Pure-Integer / integer-Real inputs reduce natively with BigInt and return the centered representative `[-(m-1)/2, m/2]` — `12 0 ADDTMOD` (m=7) → `Integer(-2)` matching the AUR worked example `(X^2+3X+6)+(9X+3) ≡ X^2-2X+2 (mod 7)`.  Symbolic / Name inputs route through Giac as `((expr1 op expr2)) mod m` and lift the result back via `giacToAst`.  Rejects Vector / Matrix / Complex / List / Tagged / etc. with `Bad argument type` (only number-shaped operands are valid).  No-fallback policy.  **Session 201** — closed the ✓-criterion rejection gap: all three share `_modBinary` (whose `_toAst` null-check throws `Bad argument type`), but only `ADDTMOD` had rejection pins.  +8 `session201:` pins in `tests/test-algebra.mjs` lock `SUBTMOD` / `MULTMOD` against Vector(left) / Complex(right) / List(left) / String(left) — guards a future refactor that splits the shared helper or drops the `_toAst` guard. |
| `POWMOD` | ✓ | **Session 144** — `( a n → a^n mod m )` modular exponentiation against the MODSTO modulus (HP50 AUR §3-175).  Pure-Integer fast path uses `_powModBig` with BigInt; the result is centered (matches ADDTMOD/SUBTMOD/MULTMOD).  Symbolic / Name path emits `powmod(base,exp,m)` to Giac and round-trips the result.  Negative exponent → `Bad argument value`.  No-fallback policy.  **Session 202** — closed the ✓-criterion type-rejection gap (session 144 pinned only the negative-exponent `Bad argument value` path): a non-int-like operand `_toAst` can't coerce throws `Bad argument type` before the negative-exponent and `giac.isReady()` checks.  +4 `session202:` pins in `tests/test-algebra.mjs` lock Vector(left) / Complex(right) / List(left) / String(left) — guards a future inline reimplementation that drops the `_toAst` guard. |
| `EXPANDMOD` | ✓ | **Session 149 [Giac]** — `( a → a' )` coefficient-reduce + expand mod the MODSTO modulus (HP50 AUR §3-80).  Pure-Integer / integer-Real path returns `_centerMod(v, m)` directly (mirrors User Guide p.5-15: `EXPANDMOD(125) ≡ 5 (mod 12)`).  Symbolic / Name path routes through Giac as `expand(${e}) mod ${m}` and lifts back via `_astToRplValue` (numeric-leaf → Real, polynomial → Symbolic).  Rejects Vector / Matrix / Complex / etc. with `Bad argument type`.  No-fallback policy.  **Session 204** — closed the ✓-criterion rejection gap (this run shipped no rejection pins for the family's remaining five ops): +4 `session204:` pins in `tests/test-algebra.mjs` lock `EXPANDMOD` on Vector / List / Complex / String → `Bad argument type` (the `_toAst` null-check fires before `giac.isReady()`). |
| `FACTORMOD` | ✓ | **Session 149 [Giac]** — `( p → factored )` factorization in Z_m[X] (HP50 AUR §3-83).  Modulus precondition enforced before the operand is consumed: `m < 100 && _isPrimeBig(m)` else `Bad argument value` (matches the AUR rule "the modulus must be less than 100, and a prime number").  Pure-Integer / integer-Real path collapses to `_centerMod(v, m)` (every nonzero element of Z/pZ is a unit, so a bare integer round-trips as itself centered).  Symbolic / Name path routes through Giac as `factor(${e}) mod ${m}`.  Worked example `FACTORMOD(X^2+2)` (m=3) → `(X+1)*(X-1)`.  No-fallback policy.  **Session 204** — +4 `session204:` pins lock `FACTORMOD` on Vector / List / Complex / String → `Bad argument type` (modulo set to 7 so the modulus precondition passes and the operand-type rejection is reachable). |
| `GCDMOD` | ✓ | **Session 149 [Giac]** — `( a b → gcd )` polynomial GCD over Z_m[X] (HP50 AUR §3-96).  Pure-Integer-pair path: native `_extGcdBigInt` then `_centerMod`; rejects gcd(0,0) with `Bad argument value` (matches `EUCLID`).  Symbolic / Name path routes through Giac as `gcd(${e1},${e2}) mod ${m}`.  Worked example `GCDMOD(2X^2+5, 4X^2-5X)` (m=13) → `-(4X-5)`.  No-fallback policy.  **Session 204** — +4 `session204:` pins lock `GCDMOD` on Vector(left) / Complex(right) / List(left) / String(left) → `Bad argument type` (a non-int-like operand skips the BigInt fast path, then `_toAst` returns null). |
| `DIVMOD` | ✓ | **Session 149 [Giac]** — `( a b → quotient )` modular division in Z_m (or rational form in Z_m[X] for symbolic) (HP50 AUR §3-63).  Pure-Integer path uses `_modDivBigInt`: prefers exact integer division (`12 3 DIVMOD` = `4` mod 12 even though gcd(3,12)=3, matching User Guide p.5-14 "12/3 ≡ 4 (mod 12)" / "66/6 ≡ -1 (mod 12)") and falls back to modular inverse otherwise (`64 13` = `4` since 13 ≡ 1 mod 12 invertible); rejects when neither path applies (`12 8` → `Bad argument value` since 12 isn't divisible by 8 and gcd(8,12)≠1, matching User Guide "12/8 (mod 12) does not exist").  Symbolic path emits `(${e1})/(${e2}) mod ${m}` to Giac.  AUR worked example `DIVMOD(5*X^2+4*X+2, X^2+1)` (m=3) → `-((X^2-X+1)/(X^2+1))`.  No-fallback policy.  **Session 204** — +4 `session204:` pins lock `DIVMOD` on Vector(left) / Complex(right) / List(left) / String(left) → `Bad argument type`. |
| `DIV2MOD` | ✓ | **Session 149 [Giac]** — `( a b → q r )` Euclidean division mod m, two-result (HP50 AUR §3-62).  Quotient on level 2, remainder on level 1.  Pure-Integer path uses `_modDivBigInt` for q (same exact-then-inverse policy as `DIVMOD`) and `_centerMod(a - q·b, m)` for r — User Guide p.5-14 examples reproduce: `125 17 DIV2MOD` (m=12) → `(1, 0)`; `68 7 DIV2MOD` (m=12) → `(-4, 0)`; `7 5 DIV2MOD` (m=12) → `(-1, 0)`.  Symbolic path issues two Giac calls — `quo(${e1},${e2}) mod ${m}` and `rem(${e1},${e2}) mod ${m}` — simpler than parsing a list response from `divmod(a,b,m)`.  AUR worked example `DIV2MOD(X^3+4, X^2-1)` (m=3) → `(X, X+1)`.  No-fallback policy.  **Session 204** — +4 `session204:` pins lock `DIV2MOD` on Vector(left) / Complex(right) / List(left) / String(left) → `Bad argument type`.  The whole MODULO-ARITH family now has type-rejection coverage. |
| `PA2B2` | ✓ | **Session 114** — `( p → (a,b) )` Fermat sum of two squares for primes with `p=2` or `p ≡ 1 (mod 4)`; native Cornacchia via the existing BigInt helpers (`_isPrimeBig`, `_powModBig`, new `_bigIntSqrtFloor`).  Returns a native Complex Gaussian integer with the smaller component real, larger imag.  Rejects non-prime / `p ≡ 3 (mod 4)` with "Bad argument value".  HP50 AUR §3-162. |
| `CYCLOTOMIC` | ✓ | **Session 081** — `( n → Φ_n(X) )` n-th cyclotomic polynomial as a Symbolic in X.  BigInt long-division build via `Φ_n = (Xⁿ − 1) / ∏_{d\|n, d<n} Φ_d`.  Capped at n ≤ 200 (MAX_SAFE_INTEGER guard on the descending-degree coefficient array).  Rejects non-Integer and n < 1. |
| `LNAME` | ✓ | **Session 124** — `( 'expr' → 'expr' [names] )` extract the symbolic Names referenced by an expression.  Native AST walker (no Giac dependency): visits `Var` nodes and `Fn` nodes whose head is not in `KNOWN_FUNCTIONS` (i.e. user-defined function names land in the result), dedups in first-seen order, sorts by length DESC then alpha ASC to match HP50 AUR §3-136.  Preserves the input on level 2 and pushes the Vector of Names on level 1.  Rejects non-Symbolic input ("Bad argument type"). |

## CAS (symbolic)

**CAS engine — session 092:** Symbolic CAS calls are delegated to
**Giac** (Bernard Parisse, Institut Fourier; GPL-3.0+), vendored at
`www/src/vendor/giac/`.  The adapter lives at
`www/src/rpl/cas/giac-engine.mjs` (main-thread synchronous); AST ↔
Giac-string conversion is `www/src/rpl/cas/giac-convert.mjs`.  There
is **no legacy-algebra.js fallback**: if Giac isn't ready or the
caseval errors, the op errors.  Integer-input fast paths (e.g.
`FACTOR 42` via native trial division) are intentional native paths,
not fallbacks.  Migration is incremental — rows below are flagged
**[Giac]** once they've moved; others still run through the original
`www/src/rpl/algebra.js` until migrated.

| Command | Status | Notes |
|---------|--------|-------|
| `FACTOR` | ✓ | **Session 092 [Giac]** — Symbolic routed through `factor(...)`; Integer path is native trial-division (Giac's `factor(12)` prints `(2)^2*3` which doesn't match HP50 semantics). No-fallback policy: Symbolic input errors if Giac isn't ready. |
| `EVAL` `APPROX` | ✓ | |
| `EXPAND` `COLLECT` `SUBST` | ✓ | **Session 095 [Giac]** — pilot four + COLLECT/SUBST; all routed through `caseval` with the purge-wrapping helper. No-fallback policy. |
| `DERIV` `INTEG` `SOLVE` | ✓ | **Session 095 [Giac]** — pilot four; SUM is native. |
| `ISOL` | ✓ | **Session 329** — thin alias of `SOLVE`'s handler (`register('ISOL', lookup('SOLVE').fn)`; Giac has no `isolate` primitive, so multi-branch roots surface as a list of `var=root` equations rather than the HP50 sign-placeholder form).  Coverage pinned: alias-identity, the shared `solve(expr,var)` Giac route (`'X^2-4' 'X' ISOL` → `{ X=2 X=-2 }`), and both argument-type rejections (non-Name/String var, non-expression operand), which throw before the `giac.isReady()` check. |
| `INTVX` `DERVX` `DERIVX` `∫` | ✓ | **Session 315** — VX-implicit calculus + `∫` glyph alias.  `INTVX`/`DERVX` push `Name(getCasVx())` then delegate to `INTEG`/`DERIV`; `DERIVX` is the verbose `DERVX` alias; `∫` is the raw 2-arg `INTEG` alias.  Rejection coverage added: a non-symbolic operand (Vector / List / Complex / Matrix) falls through every accepted-type branch to the delegate's final `Bad argument type` throw *before* any Giac call, and the empty stack hits the wrapper's `Too few arguments` guard (`∫` rejects a single operand on `INTEG`'s 2-arg pop).  Positive (Symbolic) paths route through Giac via the pilot ops. |
| `DISTRIB` `TEXPAND` `TLIN` | ✓ | **Session 095 [Giac]** — trig/exp/log family. |
| `LNCOLLECT` `EXPLN` `TSIMP` `TCOLLECT` | ✓ | **Session 095 [Giac]** — trig/exp/log family; the native Pythagorean walker was deleted as part of this migration. |
| `LAPLACE` `ILAP` `PREVAL` | ✓ | **Session 095 [Giac]** — `laplace/ilaplace/preval` via `caseval`. `PREVAL` multi-var path still honors `VX`. |
| `HEAVISIDE` `DIRAC` | ✓ | |
| `SUM` | ✓ | Native sum-of-list path. |
| `HALFTAN` `ASIN2C` `ASIN2T` `ACOS2S` | ✓ | |
| `ATAN2S` `TAN2SC` `TAN2SC2` `TAN2CS2` | ✓ | |
| `COLLECT` `EPSX0` | ✓ | |
| `VX` `SVX` | ✓ | **Session 076** — CAS main variable slot.  `VX` pushes the current name (default `x` — deliberate lowercase deviation from the HP50 factory `X`, matching the lowercase-default keyboard); `SVX` sets it from a Name or String, rejects Real ("Bad argument type") and empty string ("Bad argument value").  Persists across reload (snapshot field `casVx`).  LAPLACE/ILAP/PREVAL now honor VX for variable selection. |
| `EXLR` | ✓ | **Session 076** — extract left/right of an equation-style Symbolic.  `( 'L==R' → 'L' 'R' )`; works on any top-level binary (`==`, `+`, `-`, `<`, `≤`, …).  Rejects bare variable / function application ("Bad argument value"), non-Symbolic ("Bad argument type"). |
| `PROPFRAC` | ✓ | **Session 104 [Giac]** — proper-fraction form via `propfrac(...)`.  Symbolic routed through Giac; Rational lifts to Symbolic via `_toAst` so `43 12 / PROPFRAC → '3 + 7/12'` (HP50 AUR §3-197).  Real/Integer/Name pass-through.  No-fallback policy. |
| `PARTFRAC` | ✓ | **Session 104 [Giac]** — partial-fraction decomposition via `partfrac(...)`.  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through (no non-trivial decomp on a bare number). HP50 AUR §3-180.  No-fallback policy. |
| `COSSIN` | ✓ | **Session 104 [Giac]** — rewrite in SIN/COS basis via Giac `tan2sincos(...)` (TAN(x) → SIN(x)/COS(x)).  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through.  HP50 AUR §3-64.  No-fallback policy. |
| `LIN` | ✓ | **Session 139 [Giac]** — exponential linearization via Giac `lin(...)`.  HP50 AUR §3-131.  Single-arg; Symbolic routes through `buildGiacCmd` + `lin(${e})` (e.g. `e^X·e^Y` → `e^(X+Y)`); Real/Integer/Rational/Name pass-through (no non-trivial linearization on a bare scalar).  Vector / Matrix / List / Tagged / etc. reject `Bad argument type`.  No-fallback policy. |
| `LIMIT` `lim` | ✓ | **Session 139 [Giac]** — limit at a point via Giac `limit(expr,var,val)`.  HP50 AUR §lim entry / §3-131.  `( expr 'var=val' → limit )` (explicit equation form, top-level `=` or `==` Symbolic) or `( expr val → limit )` (bare Real/Integer/Rational point — variable defaults to `getCasVx()`, default `x`, per AUR p.3-131 "if the variable approaching a value is the current CAS variable, it is sufficient to give its value alone").  Numeric-leaf Giac result lifts to Real; non-numeric stays Symbolic.  Non-Symbolic / non-Name expression → `Bad argument type`; equation lhs not a `Var` → `Bad argument value`; non-Symbolic / non-numeric / non-Name point → `Bad argument type`.  `LIMIT` is the HP49G backward-compat name; `lim` is the HP50 lowercase canonical alias (thin `OPS.get('LIMIT').fn(s)` wrapper, mirrors CHARPOL / XNUM / XQ alias pattern).  No-fallback policy.  **Session 336** — closed the ✓-criterion rejection gap for the `lim` alias (session 139 pinned only its happy-path delegation): +3 `session336:` pins in `tests/test-algebra.mjs` mirror LIMIT's three rejections through `lim` — Vector expression → `Bad argument type` (throws before the `giac.isReady()` gate), non-Var equation lhs (`1=0`) → `Bad argument value`, Vector point → `Bad argument type` (both throw inside `_limitPointToGiac` before any caseval).  Guards a future inline reimplementation of `lim` that drops the LIMIT delegation.  Keypad `∞` / `INFINITY` / `±INFINITY` (Name or Symbolic Var, including unary minus) map through `astToGiac` to Giac `±infinity`; a Giac infinity result lands as Symbolic `∞`. |
| `GREDUCE` | ✓ | **Session 119 [Giac]** — `( poly basis vars → reduced )` Grœbner reduction via `greduce(p,[basis],[vars])`.  HP50 AUR §3-99.  Level 1 must be a Vector of bare Names; level 2 a Vector of polynomials (Symbolic / Name / Integer / Real / Rational); level 3 the polynomial to reduce.  Empty basis or empty vars list → `Invalid dimension`.  Result lifts back through `giacToAst` + `_astToRplValue` so a numeric remainder lands as Real and a polynomial remainder stays Symbolic (`_astToRplValue`'s session-119 `Neg(Num)` unwrap fixes the AUR `-1` worked example).  No-fallback policy. |
| `GBASIS` | ✓ | **Session 124 [Giac]** — `( polys vars → basis )` Grœbner basis via `gbasis([polys],[vars])`.  HP50 AUR §3-92.  Level 1 must be a Vector of bare Names; level 2 a Vector of polynomials (Symbolic / Name / Integer / Real / Rational).  Empty polys or empty vars list → `Invalid dimension`; non-Vector args → `Bad argument type`; non-Name in vars → `Bad argument type`; non-list Giac output (e.g. unit ideal `[1]` is still a list — but `gbasis(...)` errors come back as bare strings) → `Bad argument value`.  Result Vector items lift through `giacToAst` + `_astToRplValue` (Names stay Names, numeric polynomials become Symbolic, scalar `1` lifts to `Real(1)`).  No-fallback policy. |

## Statistics

| Command | Status | Notes |
|---------|--------|-------|
| `MEAN` `MEDIAN` `SDEV` `VAR` `STD` | ✓ | |
| `CORR` `COV` `TOT` | ✓ | |
| `NΣ` `NSIGMA` `ΣX` `ΣX²` `ΣY` `ΣY²` `ΣXY` | ✓ | Session 066 — test-stats.mjs.  **Session 357** — closed the last ASCII-alias rejection gaps in the stat-accessor family (sessions 132/137/147 swept the rest): `SX2` had only positive alias pins, so +3 pins lock it on Real → `Bad argument type` and empty Vector / Matrix → `Bad argument value` (inherits ΣX2's `_statsVectorOrMatrixCol0` guards); and `SY` / `SY2` had only their 1-col `Invalid dimension` alias pins, so +2 pins lock the *require-Matrix* `Bad argument type` arm a Vector trips (a different guard, reached before the column check).  Test-only; no source change. |
| `SX` `SX2` `SY` `SY2` `SXY` | ✓ | ASCII aliases. |
| `MAXΣ` `MINΣ` `MAXS` `MINS` | ✓ | |
| `BESTFIT` `LINFIT` `EXPFIT` `LOGFIT` `PWRFIT` | ✓ | |
| `PREDV` `PREDX` `PREVAL` | ✓ | |
| `RAND` `RDZ` | ✓ | Session 051 PRNG. |
| `UTPN` | ✓ | Session 065 (μ, σ², x). |
| `UTPC` | ✓ | Session 068 (ν, x) — chi-square upper tail via regularised Γ. |
| `UTPF` | ✓ | **Session 069** (n, d, F) — F upper tail via regularised incomplete beta I_w(d/2, n/2). |
| `UTPT` | ✓ | **Session 069** (ν, t) — Student-t upper tail via the same I-of-ν/(ν+t²) closed form. |

## Control flow & program substrate

| Command | Status | Notes |
|---------|--------|-------|
| `IF` `THEN` `ELSE` `END` | ✓ | **Session 083** — IF auto-closes on missing END at program-body bound, mirroring CASE (session 074) and IFERR (session 077); IF-without-THEN stays a hard error. |
| `CASE` `THEN` `END` | ✓ | Session 067. |
| `FOR` `START` `STEP` `NEXT` | ✓ | **Session 136** — `FOR` and `START` auto-close on missing `NEXT` / `STEP` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `END` in the `NEXT`/`STEP` slot) stays a hard error; see `runFor` / `runStart` in `www/src/rpl/ops.js`. |
| `WHILE` `REPEAT` `END` | ✓ | **Session 136** — `WHILE/REPEAT` auto-closes on missing `END` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `NEXT` in the `END` slot) stays a hard error; see `runWhile` in `www/src/rpl/ops.js`. |
| `DO` `UNTIL` `END` | ✓ | **Session 136** — `DO/UNTIL` auto-closes on missing `END` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `NEXT` in the `END` slot) stays a hard error; see `runDo` in `www/src/rpl/ops.js`. |
| `IFT` `IFTE` | ✓ | Stack conditionals.  **Session 121:** IFT / IFTE actions now re-enter `evalRange` via the body-intercept path (`ops.js:3145-3158`); HALT / PROMPT inside the action lifts cleanly through `_evalValueGen` and resumes via CONT.  The `register('IFT', …)` / `register('IFTE', …)` handlers stay as sync fallbacks for the rare Name-dispatch path (`'IFT' EVAL`, Tagged-wrapped `Name(IFT)`); those still reject HALT through `_driveGen` with the session-111 caller labels (`'IFT action'` / `'IFTE action'`).  See `docs/RPL.md:42-46`. |
| `IFERR` `THEN` `ELSE` `END` | ✓ | |
| `ERRM` `ERRN` `ERR0` `DOERR` | ✓ | |
| `EVAL` | ✓ | |
| `→PRG` `OBJ→` (on Program) | ✓ | Session 067.  **Session 370** — closed the ✓-criterion rejection gap for the ASCII `->PRG` alias (a delegating `OPS.get('→PRG').fn(s)` wrapper — distinct fn reference, not shared; session067 pinned only its happy-path shape equivalence in `tests/test-reflection.mjs`).  +6 `session370:` pins in `tests/test-arrow-aliases.mjs` lock the delegation's guard propagation through `→PRG`'s `_toCountIdx` + n<0 + popN-underflow checks: String count → `Bad argument type`, negative / fractional Real count → `Bad argument value`, count > stack depth → `Too few arguments`, plus a positive 2-token pass-through and a `fn !== canonical` delegation-shape assertion.  Test-only; no source change. |
| `ABORT` | ✓ | Session 067. |
| `DECOMP` | ✓ | |
| `HALT` `CONT` `KILL` | ✓ | Session 074 pilot — top-level program bodies only; HALT inside control flow or `→` raises a pilot-limit error. **Session 083:** multi-slot halted LIFO (`state.haltedStack`) matches HP50 AUR p.2-135; CONT/KILL pop one slot off the top, new `clearAllHalted()` drains, `haltedDepth()` exposes depth. **Session 088:** generator-based `evalRange` — structural HALT pilot-limit fully lifted; HALT now works from inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, and `→` bodies. **Session 106:** named-sub-program HALT lifted via `evalToken` → `_evalValueGen` for Name-binding evaluations. **Session 121:** IFT / IFTE bodies lifted via the body-intercept path in `evalRange` (`ops.js:3145-3158`) — HALT / PROMPT inside an IFT or IFTE action now suspends cleanly. **Session 126:** SEQ / MAP per-iteration bodies lifted via `runSeq` / `runMap` generators (`ops.js:7568-7607`, `8053-8096`) — HALT / PROMPT inside a SEQ expression or MAP program suspends cleanly and CONT resumes inside the same iteration with the partial accumulator intact. **Session 131:** DOLIST / DOSUBS / STREAM per-iteration program bodies lifted via `runDoList` / `runDoSubs` / `runStream` generators (`ops.js:8142`, `:8224`, `:8304`) plus body-intercept dispatch in `evalRange` (`:3196`, `:3202`, `:3208`) — HALT / PROMPT inside a DOLIST / DOSUBS / STREAM iteration suspends cleanly and CONT resumes inside the same iteration with the partial accumulator and (for DOSUBS) the NSUB/ENDSUB context frame intact via the generator's `try/finally` teardown.  Residual: HALT reached through the **sync-fallback** Name-dispatch path for IFT / IFTE / SEQ / MAP / DOLIST / DOSUBS / STREAM (e.g. `'IFT' EVAL`, Tagged-wrapped `Name('SEQ')`) still rejects through `_driveGen` with the session-111 caller labels (`'IFT action'` / `'IFTE action'` / `'SEQ expression'` / `'MAP program'` / `'DOLIST program'` / `'DOSUBS program'` / `'STREAM program'`); body-intercept is the supported path.  See `docs/RPL.md:42-46`, `:117-123`, `:171-179`. |
| `PROMPT` | ✓ | **Session 121** — HP50 AUR p.2-160 form: pop level 1, stash it as the active prompt banner via `setPromptMessage(msg)`, then yield up to the EVAL/CONT driver via the same generator-suspension channel HALT uses (`evalRange` intercept at `ops.js:3129-3136`).  CONT clears the banner via `clearPromptMessage()` and resumes the suspended generator; KILL drops the suspension and clears the banner; SST is a no-op for PROMPT (the suspension already happened).  Outside a running program — i.e. reaching the registered handler via Name dispatch (`'PROMPT' EVAL` from the keypad) — throws `PROMPT: not inside a running program`, mirroring HALT.  Owned by the rpl-programming lane (suspension protocol), not the UI lane (the prompt banner is rendered by the UI but the op itself is a control-flow primitive). |
| `RUN` | ✓ | **Session 083** — registered as a CONT synonym for the no-DBUG case (AUR p.2-177).  **Session 178** — upgraded from a bare CONT delegate to AUR-p.2-177-correct behaviour: `_singleStepMode` and `_stepInto` are explicitly zeroed before handing off to CONT (save/zero/restore pattern), ensuring "no more single steps are permitted" (AUR p.2-177) holds even if either flag was set when RUN was called.  CONT's adjacent dead `catch (e) { throw e; }` rethrow (a no-op in JS — every exception propagates unchanged through the finally) also removed.  +14 `session178:` regression pins in `tests/test-control-flow.mjs` cover DBUG→SST→RUN drain, DBUG→SST↓→RUN drain, and RUN error-path step-flag-clear. |
| `SST` `SST↓` `DBUG` | ✓ | **Session 101** — single-step debugger.  `SST` steps token-by-token through the most-recently-halted program (AUR p.2-184); `DBUG` installs a freshly-pushed Program as halted so the user can step from the first token (AUR p.2-77); `SST↓` originally registered as an alias for `SST`.  **Session 106:** `SST↓` shipped as a real step-into op via `_stepInto` + `_insideSubProgram` + `_shouldStepYield` (`ops.js:2944-3118`) — single-stepping now descends into the body of a sub-program reached by name lookup, while plain `SST` keeps stepping over.  See `docs/RPL.md:75-148`. |

## Variables & directories

| Command | Status | Notes |
|---------|--------|-------|
| `STO` `RCL` `PURGE` `VARS` `ORDER` | ✓ | |
| `STO+` `STO-` `STO*` `STO/` | ✓ | Arithmetic variants. |
| `INCR` `DECR` | ✓ | |
| `CRDIR` `PGDIR` `UPDIR` `HOME` `PATH` | ✓ | Session 012. |
| `STOF` `RCLF` | ✓ | Flag word persistence. |
| `SF` `CF` `FS?` `FC?` `FS?C` `FC?C` | ✓ | |
| `CLB` (clear all user flags) | ✓ | |

## Display / UI ops reachable from RPL

| Command | Status | Notes |
|---------|--------|-------|
| `FIX` `SCI` `ENG` | ✓ | Display-mode ops. |
| `TEXTBOOK` | ✓ | |
| `MEM` | ✓ | |

## Display / graphics / UI — handled by UI lane

These are tracked here only to mark them out-of-scope for the command-support
lane; `rpl5050-ui-development` owns them.

- `DRAW` `BARPLOT` `HISTPLOT` `SCATRPLOT` `FUNCTION` `POLAR` `PARAMETRIC`
  → side-panel Graph view.  `DRAX` `DRAWMENU` `ERASE` `PICT` remain GROB.
- `DISP` `CLLCD` `FREEZE` `INPUT` `WAIT` `BEEP` → ui lane (PROMPT moved
  to the control-flow section session 129 — it ships through the
  rpl-programming lane as a HALT-flavored suspension op, not through
  the UI render loop)
- `MENU` `TMENU` `RCLMENU` → ui lane
- `PVIEW` `PXC` `CPX` `GOR` `GXOR` → ui lane

## Not yet supported (in-lane candidates for future runs)

These are HP50 AUR commands, in-lane for this file, with no registration
in `www/src/rpl/ops.js`.  Listed with the cluster they belong to so they
can be picked up as a group.

| Command | Cluster | Priority | Notes |
|---------|---------|----------|-------|
| `JORDAN` | Matrix | low | Jordan cycle decomposition — 4-output (min poly / char poly / tagged characteristic spaces / eigenvalue array per AUR §3-122).  Composable from Giac `pmin` / `charpoly` / `eigenvects` / `eigenvals`, but the tagged-space + Jordan-chain output formatting is the heavy part; needs a dedicated multi-run effort.  Session 199 proved real Giac runs under Node for shape-capture (see the count note above); the remaining work is capturing those shapes reliably and wiring the op.  (`SCHUR` shipped session 196; `RSD` shipped session 119; `LQD` retired session 134 as a phantom.) |
| `ATTACH` `DETACH` `LIBS` | libraries | will-not | `LIB` not supported per `@!MY_NOTES.md`. |

## Will-not-support (by design deviation)

Menu-level blocks in `docs/@!MY_NOTES.md` — none of these ops are
accepted as work for this lane:

- `USER` mode and keyboard assignments
- `ENTRY` mode
- `S.SLV` (algebraic solver UI)
- `NUM.SLV` (numeric solver UI)
- `FINANCE` menu (TVMROOT, AMORT, etc.)
- `TIME` menu (DATE, TIME, TICKS, etc.)
- `DEF` user-defined function shorthand
- `LIB` / `LIBS` / `ATTACH` / `DETACH` custom library system
- `OFF`

If a user asks for one of these, the correct response is to point at
`@!MY_NOTES.md` and close the request.
