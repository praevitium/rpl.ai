# DATA_TYPES — RPL5050 argument-type coverage matrix

**Scope.** This file tracks the per-op argument-type surface the `rpl5050-data-type-support`
lane is widening.  It does not track whether an op is implemented at all — that
lives in `docs/COMMANDS.md`.
This file answers: *for this op, which types does the handler actually accept?*

**Current status.** The coverage matrix below is the authoritative current state.
Each cell records whether an op's handler accepts (`✓`), deliberately rejects (`✗`),
or has no meaningful operand of (`·`) a given type, verified by assertions in
`tests/*`.  All numeric type columns (R/Z/Q/B/C) and the collection/wrapper columns
(L/V/M/T) are populated across the numeric-math, percent, comparator, special-function,
stat-dist, and combinatorial families.  The S (String) column is populated on the
families where String is a plausible operand.  Per-session history of how each cell
reached its value is preserved in git, not here.

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

**Rational (`Q`).**  BigInt-backed exact ratio.  For scalar arithmetic (+ − × ÷ ^),
Rational is a first-class peer of Integer/Real/Complex on the promotion lattice
(Z ⊂ Q ⊂ R ⊂ C).  Unary ops (NEG, ABS, INV, SQ, SQRT, FLOOR/CEIL/IP/FP, SIGN) have
EXACT/APPROX-aware dispatch — EXACT keeps the Rational (or collapses to Integer when
`d=1` / result is integer-valued), APPROX collapses to Real.  Transcendentals (LN, LOG,
EXP, trig, hyperbolic) fall through `toRealOrThrow` so Q is silently coerced to Real —
there's no exact `LN(2/3)`.  Symbolic lift routes Q through the AST as
`Bin('/', Num(n), Num(d))`.

**Real (`R`).**  Real's `.value` is a **decimal.js Decimal instance** at precision 15.
Every op, formatter, and promotion helper reads Decimals via the decimal.js API
(`.plus`, `.minus`, `.times`, `.div`, `.pow`, `.eq`, `.lt`, `.gte`, `.abs`, `.neg`,
`.isZero`, `.isInteger`, `.isFinite`, `.toNumber`, `.toFixed`, `.trunc`).  The
`promoteNumericPair` `'real'` branch returns Decimal instances in both slots, so
arithmetic chains preserve 15-digit precision without IEEE-754 round-trips between ops.
Persistence (`persist.js`) encodes via `{ __t: 'decimal', v: '<Decimal.toString()>' }` so
full precision round-trips through snapshot/rehydrate.  NaN is rejected at the Real
constructor.  The AST `Num` leaf and `Unit` payload are still JS numbers — those are
separate namespaces from the stack Real.

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
| INV    | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | · | ✓ | ✓ | ✓ | ✗ | ✗ | V = · (no standard vector-inverse); M = matrix inverse. Q stays exact: `INV Rational(2,3)` → `Rational(3,2)`; `INV Rational(1,5)` → `Integer(5)` (Rational(5,1) collapses to Integer); APPROX-mode collapses to Real. B `·`→`✗`: `_invScalar` requires `isReal/isInteger/isRational/isComplex`; BinaryInteger is in no accepted branch. |
| SQ     | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | · | · | ✓ | ✓ | ✗ | ✗ | V/M deliberately · — `SQ/V` = dot product, `SQ/M` = matmul, handled by `*`. Q stays exact: `SQ Rational(-3,4)` → `Rational(9,16)`; deliberately does NOT d=1 collapse on `SQ Rational(2,1)` (stays Rational(4,1) — different code path from INV); APPROX-mode collapses to Real. B `✗`: `_sqScalar` requires `isReal/isInteger/isRational/isComplex`. |
| SQRT   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Negative real / integer promotes to Complex (principal branch). Q routing: perfect-square stays Q (`SQRT Rational(9,16)` → `Rational(3,4)`) with `Rational(0,1)` collapsing to `Integer(0)`; non-square Q lifts to Symbolic in EXACT (`SQRT Rational(2,1)` → Symbolic, no implicit Real coercion); negative Q lifts to Complex (`SQRT Rational(-1,1)` → `Complex(0, 1)`, principal branch). The `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` composition preserves the outer tag across element-wise V/M dispatch (`:v:Vector(4, 9) SQRT` → `:v:Vector(2, 3)`; `:m:Matrix([[4,9],[16,25]]) SQRT` → `:m:Matrix([[2,3],[4,5]])`). B `✗` / U `✗`: `toRealOrThrow` rejects both. |
| ABS    | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | V/M = Frobenius norm (bespoke — not the wrapper). Q stays exact: `ABS Rational(-3,4)` → `Rational(3,4)`. The bespoke V/M handler runs *inside* the `_withTaggedUnary` wrapper, so the outer tag is preserved across the kind-changing op: `:v:Vector(3,4) ABS` → `:v:Real(5)`; `:m:Matrix([[3,0],[0,4]]) ABS` → `:m:Real(5)` (Frobenius; V/M → R kind change keeps the tag). B `✗`: `_absScalar` isReal/isInteger/isRational/isComplex guard excludes BinaryInteger. |
| SIN..ACOSH..ATANH (elementary) | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Mode-sensitive (DEG/RAD/GRD) for trig. Forward-trig (SIN/COS/TAN), inverse-trig (ASIN/ACOS/ATAN), forward-hyperbolic (SINH/COSH/TANH/ASINH), and inverse-hyperbolic (ACOSH/ATANH) all route through the 3-deep wrapper composition `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` (via `_unaryCx`, except ACOSH/ATANH which are direct-registered with the same shape), giving Tagged transparency, List distribution, and V/M element-wise dispatch. **EXACT-mode `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic contract** holds across the whole transcendental surface: integer-clean folds stay Integer (e.g. `SIN(180)` DEG → Integer(0), `COS(90)` DEG → Integer(0), `TAN(45)` DEG → Integer(1), `ASIN(Integer(1))` DEG → Integer(90), `ACOSH(Integer(1))` → Integer(0)); non-clean inputs stay Symbolic (`SIN(1)` RAD, `SINH(Integer(1))`); the angle-mode flip toggles Integer vs Symbolic on the same operand (`SIN(180)` RAD stays-symbolic, `SIN(180)` DEG folds); Rational stays-symbolic preserving the `Bin('/', Num(n), Num(d))` payload but CAN produce Integer when the value collapses cleanly (`TANH(Rational(0,1))` → `Integer(0)`); APPROX-mode bypasses the stay-exact arm (KIND flips to Real, value unchanged). For forward-trig, `toRadians` is applied to the Integer/Rational input BEFORE the numeric primitive; for inverse-trig, `fromRadians` is applied AFTER. The stay-exact arm composes element-wise through Tagged-V/M (e.g. `:v:Vector(Integer(0), Integer(180)) SIN` DEG → `:v:Vector(0, 0)`) and through bare-List + Tagged-of-List, including heterogeneous-kind output where one element folds to Integer and another stays Symbolic/Complex under a single wrapper invocation. **Out-of-domain Real/Integer → Complex (principal branch)** on the inverse-hyperbolic axis (`ACOSH(Integer(0))` → Complex(0, ±π/2); `ATANH(Integer(2))` → Complex principal branch): the in-domain gate (`x>-1&&x<1` for atanh, `x≥1` for acosh) guards the stay-exact arm so out-of-domain integers route to the Complex bypass rather than crashing against `Math.atanh(2)=NaN`. Inner-Tagged-inside-Vector/List rejects ('Bad argument type'; the inner scalar handler is not Tagged-aware). B `✗` / U `✗`: `_unaryCx`→`toRealOrThrow` rejects both (applies to the entire trig/hyp group). |
| FACT / `!` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Complex ✗ (HP50 Γ is real-only). Negative integer = Bad argument value (Γ pole). Q `✗`: `FACT Rational(5,1)` → 'Bad argument type' even at integer-valued Q (Q is not silently coerced to Real — deliberate Q-as-first-class-type stance). Composes through the Tagged-V/M wrapper per element (`FACT :v:Vector(0, 5)` → `:v:Vector(Integer(1), Integer(120))`). B `✗` / U `✗`: `_factScalar` is isReal/isInteger only. |
| LN, LOG, EXP, ALOG | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Logarithmic / exponential family — dispatch through `_unaryCx` (`ops.js:7984`); Complex via `_cxLn` / `_cxExp`; same Tagged / List / V/M wrapping as the trig / hyperbolic family. **EXACT-mode `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic contract** (canonical examples in `_exactUnaryLift`'s doc-comment at `ops.js:1130-1137`): `LN(Integer(1))` → `Integer(0)`, `LN(Integer(2))` → Symbolic; `LOG(1)/LOG(10)/LOG(100)/LOG(1000)` = Integer(0/1/2/3); `EXP(Integer(0))` → `Integer(1)`, `EXP(Integer(1))` → Symbolic (preserves e unevaluated); `ALOG(Integer(0))` → `Integer(1)`, `ALOG(Integer(2))` → `Integer(100)`, `ALOG(Integer(3))` → `Integer(1000)` (BigInt round-trip without precision loss), `ALOG(Integer(-1))` → Symbolic (10⁻¹ not integer-clean). Rational arm CAN produce Integer when the value collapses (`LN(Rational(1,1))` → `Integer(0)`); otherwise stays Symbolic with `Bin('/', …)` payload (`LN(Rational(1,2))`). APPROX-mode flips KIND to Real, not VALUE. The stay-exact arm composes element-wise through bare-List, Tagged-of-List, and Tagged-V/M, including heterogeneous-kind output within one collection (`LOG {Integer(2) Integer(10)}` → `{Symbolic LOG(2), Integer(1)}`; same under Tagged and under Tagged-V). U `✗`: `_unaryCx`→`toRealOrThrow` rejects Unit. |
| LNP1, EXPM | ✓ | ✓ | ✓ | ✗ | · | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Complex · by design (stable-near-zero real form). Sy round-trips; `defaultFnEval` folds via `Math.log1p` / `Math.expm1` (LNP1 returns null outside `x > -1`). These ops bypass `_unaryCx`, so the EXACT-mode Integer-stay-exact arm DOES NOT FIRE — Integer input lands as Real per element via `toRealOrThrow` (contrast LN, where integer-stay holds). Composes through the Tagged-V/M wrapper (`EXPM :e:V[0,0]` → `:e:V[0,0]`, `EXPM :e:M[[0,0],[0,0]]` → `:e:M[[0,0],[0,0]]`) and through bare-List + Tagged-of-List, with heterogeneous-output mixed-input per element; empty-List `{ }` and n=1 singleton `{ Real(0) }` preserve shape. LNP1 boundary throw propagates through the List `apply` loop (`{ Real(-1) } LNP1` → `Infinite result`, not swallowed). Q `✓`: inner `toRealOrThrow` has an explicit `isRational` branch; Rational accepted, result Real (Q→R degradation) — `LNP1 Rational(1,2)` → `Real(log1p(0.5))`. B `✗` / U `✗`: `toRealOrThrow` rejects both. |

### Unary — rounding / sign / arg

| Op    | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-------|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| FLOOR | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Unit preserved (`1.5_m FLOOR` → `1_m`). B is a no-op (BinInt always integer). Complex ✗ — no total order. T transparent (`:x:Real(7.2) FLOOR` → `:x:7`). Q→Z collapse: `FLOOR Rational(7,2)` → `Integer(3)`, `FLOOR Rational(-7,2)` → `Integer(-4)` (round toward -∞); APPROX-mode → Real(3). Tagged-of-List composition (`_withTaggedUnary` ∘ `_withListUnary`): `:lbl:{Real(7.2) Real(-1.5)} FLOOR` → `:lbl:{Real(7) Real(-2)}`, with recursion through nested Lists. |
| CEIL  | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Unit/B/Complex as FLOOR. T transparent (`:y:Real(7.2)` → `:y:8`). Q→Z collapse: `CEIL Rational(7,2)` → `Integer(4)`, `CEIL Rational(-7,2)` → `Integer(-3)`. Tagged-of-List: `:lbl:{Real(7.2) Real(-1.5)} CEIL` → `:lbl:{Real(8) Real(-1)}`. |
| IP    | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Unit/B/Complex as FLOOR; compound uexpr (`m/s^2`) round-trips. T transparent (`:z:Real(-7.2) IP` → `:z:-7`, trunc toward zero). Q→Z collapse: `IP Rational(7,2)` → `Integer(3)`, `IP Rational(-7,2)` → `Integer(-3)` (trunc toward zero, NOT -4). Tagged-of-List: `:a:{Real(7.2) Real(-7.2)} IP` → `:a:{Real(7) Real(-7)}`. |
| FP    | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Unit/B/Complex as FLOOR; `FP #Xb` = `#0b` (same base); `FP(-1.8_m)` = `-0.8_m` (sign preserved). T transparent (`:w:Real(7.2) FP` → `:w:0.2`). Q stays exact for non-integer Q (`FP Rational(7,2)` → `Rational(1,2)`, `FP Rational(-7,2)` → `Rational(-1,2)`); integer-valued Q collapses to `Integer(0)` (no fractional part). Tagged-of-List: `:a:{Real(7.2)} FP` → `:a:{Real(0.2)}`. |
| SIGN  | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | SIGN/V = unit direction (bespoke); SIGN/M = per-entry sign. T transparent (`:u:Real(-5) SIGN` → `:u:-1`, `:u:Real(0) SIGN` → `:u:0`). Q→Z collapse: `SIGN Rational(-3,4)` → `Integer(-1)`, `SIGN Rational(0,1)` → `Integer(0)`, `SIGN Rational(3,4)` → `Integer(1)`. Tagged-of-List: `:u:{Real(-3) Real(0) Real(5)} SIGN` → `:u:{Integer(-1) Integer(0) Integer(1)}` (per-element Real→Integer collapse). B `✗` / U `✗`: `_signScalar` is isReal/isInteger/isRational/isComplex only. |
| ARG   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Angle-mode sensitive. T transparent (`ARG(:v:Complex(3,4))` → `:v:<atan2(4,3)>`). Bespoke V/M dispatch INSIDE the inner handler (NOT through `_withVMUnary`), wrapped as `_withTaggedUnary(_withListUnary(...))`: `ARG V[Real(3), Real(-2)]` → `V[Real(0), Real(π)]` (Real-axis: non-negative=0, negative=π via atan2); `ARG V[Complex(3,4), Complex(0,1)]` → `V[atan2(4,3), π/2]`; `ARG M[[Complex(0,1), Real(1)], [Real(-1), Complex(0,-1)]]` → `M[[π/2, 0], [π, -π/2]]`; `ARG :v:V[Complex(3,4), Complex(0,1)]` → `:v:V[atan2(4,3), π/2]` (Tagged-of-V preserved). Q `✗`: `_argScalar` handles isReal/isInteger only; Rational → Bad argument type. B `✗` / U `✗`: same guard rejects both. |

### Binary — MOD / MIN / MAX

| Op  | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| MOD | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | V/M rejected (HP50 AUR §3 scalar-only) — symmetric across both operand positions and both kinds: `_withListBinary` distributes Lists only, so a V/M in EITHER slot reaches the inner handler's `!isNumber(a) || !isNumber(b)` guard. session068 pinned x-slot V, y-slot V, x-slot M; session365 added the lone unpinned y-slot M arm (valid Real `a`, Matrix `b` → Bad argument type), mirroring the MIN/MAX session344 sweep. Sy round-trips; MOD(10,3)=1, MOD(-7,3)=2 (floor-div sign), MOD(n,0) → null. `_withListBinary` distribution (`{10 7} {3 2} MOD` → `{1 1}`). Rational `Q→R` degradation: `MOD Rational(7,2) Rational(1,3)` → `Real(≈1/6)` (NOT stay-exact — distinct from `+ - * / ^`); Q×Z and Q×R both degrade through `toRealOrThrow`; Complex(im≠0) rejection wins over Q. Both-side Tagged-of-List composition (`:a:{10 7} :b:{3 2} MOD` → `{Integer(1), Integer(1)}`). B `✗` / U `✗`: `toRealOrThrow` rejects both (BinInt binary-arith coercion does NOT propagate to MOD). |
| MIN | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same V/M rejection — symmetric across both operand positions: `_minMax` checks `!isNumber(a) || !isNumber(b)` and `_withListBinary` distributes Lists only, so a V/M in EITHER slot reaches the inner handler. session068 pinned both-V (trips the a-arm); session344 added the complementary arms (scalar∘V, scalar∘M, V∘scalar, M∘scalar → Bad argument type). Sy round-trips; MIN(3,5)=3. `_withListBinary` distribution (`{1 5 3} 2 MIN` → `{1 2 2}`; pairwise on Integer-typed lists keeps the Integer fast path). `Q→R` degradation: `MIN Rational(1,2) Rational(1,3)` → `Real(0.333)`; `MIN Rational(1,2) Integer(1)` → `Real(0.5)` (operand-order symmetric); `MIN Rational(1,2) Name(X)` → `Symbolic` (Sy lift wins over numeric routing — Q survives in the AST). Both-side bare-scalar Tagged tag-drop: `:a:Integer(5) :b:Integer(3) MIN` → `Integer(3)`. B `✗` / U `✗`: `_minMaxScalar` requires `isNumber`; neither is in `isNumber`. |
| MAX | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same V/M rejection — symmetric across both operand positions (session068 pinned the b-slot scalar∘M arm; session344 added V∘scalar, M∘scalar, scalar∘V → Bad argument type). Sy round-trips; MAX(3,5)=5. `_withListBinary` distribution on Integer-typed lists (`{1 5 3} {4 2 8} MAX` → `{Integer(4) Integer(5) Integer(8)}` — pairwise Integer fast path). `Q→R` degradation: `MAX Rational(1,2) Rational(1,3)` → `Real(0.5)`; `MAX Rational(3,2) Real(0.7)` → `Real(1.5)`; `MAX Rational(1,2) Complex(0,2)` → 'Bad argument type' (Q does NOT bypass C rejection). B `✗` / U `✗`: same `_minMaxScalar` guard as MIN. |

### Binary — GCD / LCM

| Op  | R* | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|----|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| GCD | ~  | ✓ | ✗ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | R accepted only when integer-valued (non-integer Real = Bad argument value). Sy round-trips; GCD(12,18)=6, GCD(0,7)=7, GCD(1.5,3) → null. Pairwise `_withListBinary` (`{12 15} {18 10} GCD` → `{6 5}`). Left-side Tagged-of-List composition (`:a:{12 18} {6 9} GCD` → `{Integer(6), Integer(9)}`). Q `✗` (symmetric across both operand positions): `_toBigIntOrThrow` has no isRational branch — GCD is integer-domain; the handler calls it on `a` then `b`, so a-slot (session231: `Rational(1,2) Integer(2)`) and b-slot (session337: `Integer(2) Rational(1,2)`, plus integer-valued `Rational(5,1)` and Real-a `Real(6) Rational(1,3)`) both reject. B `✗` / U `✗`: `_toBigIntOrThrow` has no `isBinaryInteger` / `isUnit` branch. |
| LCM | ~  | ✓ | ✗ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same as GCD. Sy round-trips; LCM(4,6)=12, LCM(0,n)=0. Scalar×List distribution (`4 {6 9} LCM` → `{12 36}`). Right-side Tagged-of-List composition (`4 :lbl:{6 9} LCM` → `{Integer(12), Integer(36)}`). Q `✗` (integer-domain, symmetric: a-slot session231, b-slot session337); B `✗` / U `✗`: same `_toBigIntOrThrow` guard as GCD. |

*`~` on Real = accepted only when `Number.isInteger(value)`.

### Binary — percent family

| Op  | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| %   | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | V/M ✗ (HP50 AUR §3-1 scalar-only, mirrors MOD/MIN/MAX) — symmetric across both operand positions and both kinds: `_percentOp` runs `toRealOrThrow(x)` then `toRealOrThrow(y)`, so a V/M in the x-slot trips the first check and a V/M in the y-slot (valid Real x) trips the second, distinct path. session072 pinned x-Vec + y-Vec; session358 added x-Mat + y-Mat. `_withTaggedBinary` tag-drop (either or both sides unwrap-and-drop). List-broadcast on the percent base (`{80 40} 25 %` → `{20 10}`). Tagged-of-List composition through `_withTaggedBinary(_withListBinary(handler))`: `:lbl:{80 40} 25 %` → `{Real(20), Real(10)}`; `:a:{80 40} :b:{25 50} %` → `{Real(20), Real(20)}` (both-side + pairwise); inner-Tagged-inside-List (`{:x:80 :y:40} 25 %`) rejects with 'Bad argument type' (the inner binary scalar handler has no unwrapper). Q `✓`: `toRealOrThrow` handles isRational; result Real (Q→R) — `Rational(1,2) Real(50) %` → `Real(0.25)`. B `✗` / U `✗`: `toRealOrThrow` rejects both. |
| %T  | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same — V/M symmetric across both operand positions: session072 pinned only x-Mat; session358 added x-Vec, y-Vec, y-Mat (the y-slot reaches the second `toRealOrThrow(y)` past a valid Real x). Infinite result on base = 0 preserved. Both-side Tagged tag-drop; right-side Tagged-of-List composition (`50 :p:{25 75} %T` → `{Real(50), Real(150)}`). Q `✓`: `Rational(1,4) Real(1) %T` → `Real(400)` (Q→R). B `✗` / U `✗`: same `toRealOrThrow` path as `%`. |
| %CH | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | Same — V/M symmetric across both operand positions: session072's both-Vec/both-Mat pins trip the x-arm; session358 added the y-slot arms (`%CH(Real, Vec)` / `%CH(Real, Mat)` → Bad argument type via the second `toRealOrThrow(y)`). Both-side Tagged tag-drop. Q `✓`: `Rational(1,2) Real(1) %CH` → `Real(100)` (Q→R). B `✗` / U `✗`: same `toRealOrThrow` path as `%`. |

### Binary arithmetic — `+` / `-` / `*` / `/` / `^`

Per-op detail rows for the five core arithmetic operators.

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
Holds for left / right / both-Tagged scalar inputs and for T+V / T+M broadcast.

| Op | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|----|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| `+` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | String+String = concatenation; Unit dim-algebra (compatible dims only); V+V element-wise (same length, rejects dimension mismatch). **BinInt:** `_binaryMathMixed('+')` — BinInt base wins; Real coerced trunc-toward-zero; negative results wrap via 2^w mask. **Rational:** R+Z and Q×V/Q×M broadcast — Q×R-element → Real per element; Q×Q-element stays-exact with d=1 collapse. **Tagged:** binary tag-drop on all left/right/both-Tagged inputs; `:v:Vec[1,2] + Integer(1)` → un-Tagged `Vec[Real(2),Real(3)]`; `:a:Vec + :b:Vec` → un-Tagged Vec; V+V dimension-mismatch survives Tagged unwrap; inner-Tagged-inside-Vector rejects. |
| `-` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | String ✗ (no subtraction on String). Unit dim-algebra (compatible dims only). **BinInt:** `_binaryMathMixed('-')`. **Rational:** `Vec[Real(3),Real(4)] - Rational(1,2)` → `Vec[Real(2.5),Real(3.5)]` (V−Q broadcast, sign-correct). **Tagged:** binary tag-drop; `:v:Vec[5,7] - Integer(1)` → un-Tagged `Vec[Real(4),Real(6)]`. |
| `*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | V·V = dot product (collapses V→R); M·M = matrix multiply; Real×String = string repeat. **BinInt:** `_binaryMathMixed('*')` — `ws=8 Real(300) * #2h → #58h` (600 masked to 8 bits); `#20h * Real(2.7) → #40h` (trunc coerce). **Rational:** Q×V/Q×M scalar-broadcast — `Vec[Real(2),Real(4)] * Q(1/2)` → `Vec[Real(1),Real(2)]`; `Mat[Z(2),Z(4)|Z(6),Z(8)] * Q(1/2)` → `Mat[Z(1),Z(2)|Z(3),Z(4)]` (Z×Q d=1 collapse per element). **Tagged:** binary tag-drop — bespoke V·V dot product survives the tag-drop (`:a:Vec[1,2] * :b:Vec[3,4]` → `Real(11)`, kind change V→R survives wrapper); matmul through tag-drop (`:m:Mat * Mat` → un-Tagged Matrix). |
| `/` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | String ✗. Unit dim-algebra (quotient unit). **BinInt:** `binIntBinary` — `#5h / Integer(0)` → 'Division by zero' (guarded before mask). **Rational:** `Vec[Q(1,1),Q(2,1)] / Q(1/2)` → `Vec[Integer(2),Integer(4)]` (Q/Q stay-exact + d=1 collapse per element). **Tagged:** binary tag-drop — `Vec[8,10] / :s:Integer(2)` → un-Tagged `Vec[Real(4),Real(5)]`. |
| `^` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | M^n = repeated matmul (M square, whole-number n; `M^0` = identity) per HP50 AUR ("`^` can also apply to a square matrix raised to a whole-number power"). `binaryMath` intercepts `^` for Matrix/Vector bases before the generic scalar broadcast: square `Matrix^whole-number` routes through `_matrixPow` (shares `_matMul` with the `*` matmul branch); non-square M, negative / non-whole-number exponent, and any Vector base reject (V `✗` — there is no vector power). `M[[1,2],[3,4]] ^ 2` → `[[7,10],[15,22]]`; `^ 3` → `[[37,54],[81,118]]`; `^ 0` → identity; `V[2,3] ^ 2` → 'Bad argument type'. Pinned session298. **BinInt:** accepted as base AND exponent — BinInt^BinInt routes through `binIntBinary`; a BinInt on one side with an Integer/Real on the other coerces the non-BinInt operand and preserves the BinInt side's base (`_scalarBinaryMixed`); the result is masked to the current wordsize. `#2h ^ #3h` → `#8h`; `Integer(2) ^ #5h` → `#32h`; `ws=8 #2h ^ #Ah` → `#0h` (1024 masked to 8 bits); `ws=8 #FFh ^ #2h` → `#1h` (65025 masked); `ws=8 #2h ^ Integer(10)` → `#0h` (mixed). Pinned session045/110 (BinInt-base ^ Integer-exponent) + session292 (BinInt^BinInt and Integer-base ^ BinInt-exponent). **Rational:** Q^Z stay-exact — `Rational(3,2)^Integer(3)` → `Rational(27,8)`; `Rational(7,11)^Integer(0)` → `Integer(1)` (d=1 collapse); fractional Q exponent in EXACT mode → Symbolic. **Tagged:** binary tag-drop. |

### Reference rows — unary sign/complex ops (NEG / CONJ / RE / IM)

| Op   | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| NEG  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Bespoke V/M branch (does NOT use `_withVMUnary`) composes inside `_withTaggedUnary(_withListUnary(...))`: `NEG :m:Matrix([[1,-2],[3,-4]])` → `:m:Matrix([[-1,2],[-3,4]])` (tag preserved across element-wise Matrix dispatch). |
| CONJ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Sy round-trips (`defaultFnEval` folds `CONJ(x) = x` on Real). Bespoke V/M dispatch INSIDE the inner handler, wrapped `_withTaggedUnary(_withListUnary((s) => bespoke V/M))`: `CONJ :z:V[Real(5), Complex(3,4), Real(-1)]` → `:z:V[Real(5), Complex(3,-4), Real(-1)]` (per-element flips Complex.im sign, Real stays Real; tag + V kind preserved); `CONJ :m:M[[Complex(1,2), Complex(3,4)], [Real(5), Complex(6,-7)]]` → `:m:M[[Complex(1,-2), Complex(3,-4)], [Real(5), Complex(6,7)]]`. Q `✓`: `_conjScalar` has an `isRational` branch (returns v unchanged) — `CONJ Rational(1,2)` → `Rational(1,2)`. B `✗` / U `✗` / S `✗`: `_conjScalar` dispatch is isReal/isInteger/isRational/isComplex/isName/isSym only — no `isBinaryInteger` / `isUnit` / `isString` branch. |
| RE   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Sy round-trips (`defaultFnEval` folds `RE(x) = x` on Real). Bespoke V/M dispatch through the same 2-deep wrapper: `RE :m:M[[Complex(1,2), Complex(3,4)], [Real(5), Complex(6,-7)]]` → `:m:M[[Real(1), Real(3)], [Real(5), Real(6)]]` (every entry collapses to Real; M kind preserved). Tagged-of-Symbolic composes (`RE :v:Symbolic(X)` → `:v:Symbolic(RE(X))`). Inner-Tagged-inside-Vector/Matrix rejects at every entry position (`Vector(:x:Complex(3,4)) RE` / `Matrix([[Real(5), :x:Complex(3,4)]]) RE` → 'Bad argument type'; `_reScalar` not Tagged-aware). Q `✓`: `_reScalar` has an `isRational` branch (returns v unchanged) — `RE Rational(1,2)` → `Rational(1,2)`. B `✗` / U `✗` / S `✗`: same dispatch structure as `_conjScalar`. |
| IM   | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Sy round-trips (`defaultFnEval` folds `IM(x) = 0` on Real). Bespoke V/M dispatch through the same 2-deep wrapper: `IM :z:V[Complex(1,2), Complex(3,-4), Real(5)]` → `:z:V[Real(2), Real(-4), Real(0)]` (Complex(re,im)→Real(im); Real(x)→Real(0); tag + V kind preserved). Tagged-of-Symbolic composes (`IM :v:Symbolic(X)` → `:v:Symbolic(IM(X))`). Inner-Tagged-inside-Vector/Matrix rejects at every entry position. Q `✓`: `_imScalar` has an `isRational` branch (returns Integer(0n)) — `IM Rational(1,2)` → `Integer(0)`. B `✗` / U `✗` / S `✗`: same dispatch; no `isBinaryInteger` / `isUnit` / `isString` branch. |

### Real decomposition / HP50 special-function family (XPON / MANT / TRUNC / ZETA / LAMBERT / PSI)

All six lift Name / Symbolic operands to `Symbolic(AstFn(..., [...]))` from the stack;
the Sy column here is about *round-trip through the entry-line parser*, not "does the
handler lift".

| Op      | R | Z | Q | C | N | Sy | L | V | M | T | S | Notes |
|---------|---|---|---|---|---|----|---|---|---|---|---|-------|
| XPON    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Decimal exponent. `XPON(0) = 0` (HP50 AUR). Complex ✗ (HP50 AUR real-only). Q ✗: `XPON Rational(1,2)` → 'Bad argument type' (Q not in domain; consistent with FACT/MANT). Wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))` (same 3-deep composition as FACT/LNP1/EXPM): n=0 empty-List (bare + T+L); n=1 `{ Real(100) } → { Real(2) }`; n=2 heterogeneous `{ Real(100) Real(10) } → { Real(2) Real(1) }`; Vector `[ Real(100) Real(1000) ] → [ Real(2) Real(3) ]`; Matrix `[[ Real(100) Real(10) ]] → [[ Real(2) Real(1) ]]`; scalar Tagged `:x:Real(250) → :x:Real(2)`. S `✗`: handler guard `!isReal(v) && !isInteger(v) → throw` (MANT shares it). |
| MANT    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Mantissa in `[1,10)` (or 0 at x=0). Pair with XPON — `x = MANT(x) · 10^XPON(x)`. Q ✗: `MANT Rational(1,2)` → 'Bad argument type'. Wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`: n=0 empty-List (bare + T+L); n=1 `{ Real(250) } → { Real(2.5) }`; n=2 heterogeneous `{ Real(250) Real(10) } → { Real(2.5) Real(1) }`; Vector `[ Real(2500) Real(100) ] → [ Real(2.5) Real(1) ]`; Matrix `[[ Real(2500) ]] → [[ Real(2.5) ]]`. S `✗`: same `!isReal && !isInteger` guard as XPON. |
| TRUNC   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | 2-arg: `TRUNC(x, n)` truncates to `n` decimals. `arity: 2` in KNOWN_FUNCTIONS — 1-arg and 3-arg forms rejected at parse time ("TRUNC expects 2 argument(s), got N"). `defaultFnEval` unset (no constant fold yet). Wrapped `_withTaggedBinary(_withListBinary(_truncOp()))` — closes L and T; V/M remain ✗ (no `_withVMBinary`; mirrors MOD/MIN/MAX) and are symmetric across both operand positions: `_withListBinary` distributes Lists only, so a V/M in either slot reaches the inner numeric handler. session196 pinned only the x-slot (level 2) Vector via `_roundingOp`'s `!isReal&&!isInteger` guard; session351 added the x-slot Matrix (same guard → 'Bad argument type') and both n-slot (level 1) V/M arms (`Real(3.14159) Vector`/`Matrix`, plus valid Integer-x `Integer(5) Vector` → 'expected real, got vector/matrix' via `toRealOrThrow`). Binary tag-drop: Tagged inputs unwrapped, tag NOT re-applied. Pins include n=2 bare-List `{Real(1.567) Real(2.891)} Integer(1)` → `{Real(1.5) Real(2.8)}` and pairwise L×L `{Real(1.99) Real(2.345)} {Integer(0) Integer(2)}` → `{Real(1) Real(2.34)}`. Q (x operand) `✗`: `_roundingOp` checks `if (!isReal(xv) && !isInteger(xv)) throw`; `Rational(3,2) Integer(1) TRUNC` → 'Bad argument type'. S `✗`: x-operand via `_roundingOp` `!isReal && !isInteger → throw`; n-operand via `toRealOrThrow` → "expected real, got string". |
| ZETA    | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Riemann ζ. Arity 1. No constant fold (would need CAS); stays symbolic at numeric args. Registered `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`; `_zetaScalar` accepts `isInteger(v)`. Z `Integer(0)`→`Real(-0.5)` (ζ(0)=-1/2 exact); L-empty passthrough; L `{Integer(2)}`→`{Real(ζ(2))}`; V `[Integer(2) Integer(0)]`→`[Real(ζ(2)) Real(-0.5)]`; M `[[Integer(2)]]`→`[[Real(ζ(2))]]`. Q `✗` / C `✗` / S `✗`: `_zetaScalar` uses `isInteger?…:isReal?…:null`; Rational / Complex / String → null → 'Bad argument type'. |
| LAMBERT | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Principal branch W₀. Arity 1. No constant fold (series/Halley future). Registered `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`; `_lambertScalar` accepts `isInteger(v)`. Z `Integer(0)`→`Real(0)` (W(0)=0 exact branch); L-empty passthrough; L `{Integer(0)}`→`{Real(0)}`; V `[Integer(0) Integer(1)]`→`[Real(0) Real(Ω)]` (Ω≈0.5671); M `[[Integer(1)]]`→`[[Real(Ω)]]`. Q `✗` / C `✗` / S `✗`: `_lambertScalar` `isInteger/isReal/null` guard rejects all three. |
| PSI     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Digamma / polygamma. Variadic: `PSI(x)` = ψ(x), `PSI(x, n)` = ψ⁽ⁿ⁾(x). No `arity` key — both shapes accepted. No constant fold. The 1-arg digamma handler has bespoke `isList` / `isVector` / `isMatrix` branches (same shape as GAMMA/LNGAMMA). T=✓ reflects scalar-Tagged only — T+L/T+V/T+M throw (bespoke `isTagged` branch calls `_psiScalar` directly on `v.value`). L-empty passthrough; L `{Integer(1)}`→`{Real(ψ(1))}` (ψ(1)=−γ); L `{Integer(1) Integer(2)}`→`{Real(ψ(1)) Real(ψ(2))}`; V `[Integer(1) Integer(2)]`→`[Real(ψ(1)) Real(ψ(2))]`; M `[[Integer(1)]]`→`[[Real(ψ(1))]]`. Q `✗` / C `✗` / S `✗`: `_psiScalar` `isInteger/isReal/null` guard rejects all three. |

### Special-function / stat-dist family (UTPC / UTPF / UTPT / BETA / ERF / ERFC / GAMMA / LNGAMMA / HEAVISIDE / DIRAC)

These ops have stack-side handlers that lift Name / Symbolic operands to
`Symbolic(AstFn(..., [...]))` and entries in `KNOWN_FUNCTIONS`.  The `Sy`
column is about *round-trip through the parser*, not "does the handler lift".
Numeric evaluation lives on the stack side for all of these — Lanczos gamma /
incomplete-beta / erf table / shifted-step / impulse — so the simplify-time
fold stays conservative.

| Op        | R | Z | Q | C | N | Sy | L | V | M | T | S | Notes |
|-----------|---|---|---|---|---|----|---|---|---|---|---|-------|
| HEAVISIDE | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Step function. Sy round-trips; HEAVISIDE(2)=1, HEAVISIDE(0)=1 (HP50 convention: right-continuous at 0), HEAVISIDE(-1)=0. Wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`: n=0 bare+T+L; n=1 `{Real(2)}`→`{Real(1)}`; n=2 heterogeneous `{2,-1}`→`{1,0}` bare+T+L; Vector `[1,-1]`→`[1,0]`; Matrix `[[1,-1]]`→`[[1,0]]`; scalar Tagged `:x:Real(3)`→`:x:Real(1)`. B accepted (no B column in this family table, but the scalar arm has an explicit `isBinaryInteger` branch — "accepted the same as Integer"): `#5h HEAVISIDE`→`Integer(1)`, `#0h HEAVISIDE`→`Integer(1)` (B is non-negative so step is always 1, right-continuous at 0); pinned session385. Q `✗` / C `✗` / S `✗`: scalar arm is isReal/isInteger/isBinaryInteger/isSym only; Rational, Complex, and String fall through to the throw. |
| DIRAC     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Impulse δ(x). At non-zero real, folds to 0; at x=0 leaves symbolic (distribution). Sy round-trips; `DIRAC(3)=0`, `DIRAC(0)` → null. Wrapped `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`: n=0 bare+T+L; n=1 `{Real(0)}`→`{Symbolic(DIRAC(0))}` (at-zero path through wrapper); n=2 bare+T+L non-zero; Vector; Matrix; scalar Tagged `:x:Real(5)`→`:x:Real(0)`. B accepted (explicit `isBinaryInteger` branch, "same as Integer"): non-zero `#5h DIRAC`→`Integer(0)` and `#3b DIRAC`→`Integer(0)` (base cosmetic), while `#0h DIRAC`→`Symbolic DIRAC(0)` (the at-origin spike, mirroring the Integer(0) arm); pinned session385. Q `✗` / C `✗` / S `✗`: same isReal/isInteger/isBinaryInteger/isSym-only arm rejects all three. |
| GAMMA     | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Γ(x). Integer fold only (GAMMA(n) = (n-1)! for 1 ≤ n ≤ 171); non-integer / non-positive / overflow → null (leave symbolic). Sy round-trips; GAMMA(5)=24, GAMMA(0)→null, GAMMA(0.5)→null, GAMMA(180)→null. Wrapped `_withTaggedUnary(_withListUnary(bespoke-V/M handler))`: n=0 bare-List `{}`→`{}` + T+L `:g:{}`→`:g:{}`; n=2 bare-List `{Integer(1) Integer(5)}`→`{Integer(1) Integer(24)}` + T+L tag-preserved; V `[Integer(1) Integer(5)]`→`[Integer(1) Integer(24)]`; M `[[Integer(2) Integer(3)]]`→`[[Integer(1) Integer(2)]]`. Q `✗` / C `✗` / S `✗`: `_gammaScalar` is `isInteger?…:isReal?…:null`; Rational / Complex / String → null → Bad argument type. |
| LNGAMMA   | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | ln Γ(x). No fold (Lanczos lives on the stack). Sy round-trips; null fold. Same wrapper shape as GAMMA: n=0 bare-List `{}`→`{}`; M `[[Integer(2)]]`→`[[Real(0)]]`; T scalar `:h:Integer(2)`→`:h:Real(0)`; V `[Integer(2)]`→`[Real(0)]` (lngamma(2)=0 identity). Q `✗` / C `✗` / S `✗`: `_lngammaScalar` same isInteger/isReal/null pattern. |
| ERF       | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Error function (registered as `erf`). No simplify-time fold. Sy round-trips; null fold. Wrapped `_withTaggedUnary(_withListUnary(bespoke-V/M handler))` (M branch is `rows.map(r => r.map(_erfScalar))`): bare-List `{Integer(0)}`→`{Real(0)}`; V `[Integer(0)]`→`[Real(0)]`; M `[[Integer(0)]]`→`[[Real(0)]]` (erf(0)=0 zero special-case). Z `✓`: `_erfScalar` has an `isInteger` branch — `erf(Integer(1))` → `Real(≈0.8427)`. Q `✗` / S `✗`: `isInteger?…:isReal?…:null`; Rational / String → null → Bad argument type. |
| ERFC      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✗ | Complementary erf (registered as `erfc`). Same as ERF. Sy round-trips; null fold. Same bespoke V/M branches + `_withListUnary` wrapper as erf; `:e:Integer(0) erfc`→`:e:Real(1)`; bare-List/T+L/Vector/Matrix all via `_erfcScalar(Integer(0))=Real(1)` zero special-case. Z `✓`: `_erfcScalar` has an `isInteger` branch — `erfc(Integer(2))` → `Real(≈0.00468)`. Q `✗` / C `✗` / S `✗`: same isInteger/isReal/null pattern; Rational / Complex / String → Bad argument type. |
| BETA      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Arity 2 — B(a, b). No simplify-time fold (needs log-gamma). Sy round-trips; null fold. Registered `_withTaggedBinary(_withListBinary(handler))`: L `{Integer(1) Integer(2)} {Integer(1) Integer(3)} Beta` → `{Real(B(1,1)) Real(B(2,3))}` = `{Real(≈1) Real(≈1/12)}` (pairwise list dispatch). V `✗` / M `✗`: no `_withVMBinary`; `_betaScalar` receives Vector/Matrix as the `a` arg → `aNum = null` → Bad argument type (a-arg pinned session244). The b-arg (right-side) V/M rejection is symmetric — `_withListBinary` distributes Lists only, so a Vector/Matrix in the b slot falls through to `_betaScalar` where `bNum = null` → Bad argument type, regardless of the a operand's kind (Integer or Real); pinned session323. Q `✗` / C `✗` / S `✗`: `_betaScalar` `aNum = isInteger?…:isReal?…:null`; Rational / Complex / String a-arg → null → Bad argument type (b-arg not reached). |
| UTPC      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Upper-tail χ² CDF. Arity 2 — UTPC(ν, x). No simplify-time fold (needs incomplete gamma). Sy round-trips; null fold. Z `✓`: shared `asReal` helper has `if (isInteger(v)) return Number(v.value)` — `UTPC(Integer(3), Integer(0))` → `Real(1)` (X≤0 exact branch); `UTPC(Integer(2), Integer(2))` → `Real(≈exp(−1))`. Extracted `_utpcScalar(nu, x)` and wrapped `_withTaggedBinary(_withListBinary(…))`: L `✓` / scalar T `✓`; V `✗` / M `✗` (no `_withVMBinary`; mirrors BETA — a Vector/Matrix in either the ν or x slot reaches `asReal` → Bad argument type; M + ν-position V/M pinned session316). Pins: empty-list passthrough; n=1 `{Z(2)} {Z(0)}` → `{R(1)}` (X≤0); n=2 pairwise `{Z(2) Z(5)} {Z(0) Z(2)}` → `{R(1) R(≈0.849)}`; T+L `:nu:{Z(2)} :x:{Z(0)}` → `{R(1)}` (tag dropped); scalar Tagged `:n:Z(2) :x:Z(0)` → `R(1)` (tag dropped). Q `✗` / C `✗` / S `✗`: `asReal` accepts isInteger/isReal only; Rational / Complex / String → Bad argument type. |
| UTPF      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✗ | ✗ | ✗ | ✓ | ✗ | Upper-tail F CDF. Arity 3 — UTPF(ν₁, ν₂, x). No simplify-time fold (needs incomplete beta). Sy round-trips; null fold. Z `✓`: same `asReal` helper (shared with UTPC/UTPT) accepts Integer — `UTPF(Integer(2), Integer(2), Integer(1))` → `Real(0.5)`. Bare handler (3-arg; no `_withListBinary` shape): L `✗` / V `✗` / M `✗` — a List/Vector/Matrix in any operand slot reaches `asReal` → Bad argument type (so the variate position rejects rather than distributing, unlike UTPC/UTPT). L/V/M rejection pinned session310 (ν₁ + variate positions) + session378 (the middle ν₂ slot — `asReal(n)` then `asReal(d)` then `asReal(F)`, so a valid Integer ν₁ reaches the `asReal(d)` reject). Q `✗` / C `✗` / S `✗`: same `asReal` helper rejects all three (first String operand throws). |
| UTPT      | ✓ | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Upper-tail Student-t CDF. Arity 2 — UTPT(ν, x). No simplify-time fold. Sy round-trips; null fold. Z `✓`: same `asReal` accepts Integer — `UTPT(Integer(5), Integer(0))` → `Real(0.5)` (t=0 exact branch). Extracted `_utptScalar(nu, t)` and wrapped `_withTaggedBinary(_withListBinary(…))`: L `✓` / scalar T `✓`; V `✗` / M `✗` (no `_withVMBinary`; a Vector/Matrix in either the ν or t slot reaches `asReal` → Bad argument type; M + ν-position V/M pinned session316). Pins: empty-list passthrough; n=1 `{Z(5)} {Z(0)}` → `{R(0.5)}` (t=0); n=2 pairwise `{Z(5) Z(10)} {Z(0) Z(0)}` → `{R(0.5) R(0.5)}`; T+L tag-dropped; scalar Tagged tag-dropped. Q `✗` / C `✗` / S `✗`: same `asReal` helper rejects all three. |

### Combinatorial / integer-divmod family (COMB / PERM / IQUOT / IREMAINDER / XROOT)

Arity-2 numeric ops.  All have `defaultFnEval` folds that accept only
integer-valued Reals (except XROOT, which accepts non-negative real
radicand with non-zero index); out-of-domain cases return `null` so
the simplifier leaves the expression symbolic rather than injecting
NaN.

The V/M `✗` cells are symmetric across both operand positions: session267
pinned them with both-operand V/M inputs (tripping the first-operand
check), and session330 added the b-slot (right-operand) V/M rejection for
COMB/PERM/IQUOT/IREMAINDER — a valid Integer `a` with a Vector/Matrix `b`
falls through `_withListBinary` (Lists only) to the inner handler's
second-operand arm (`_combPermArgs` / `_intQuotientArg(b)`) → Bad argument
type. (XROOT's V/M cells are a different shape — it delegates to `^`; see
its row, corrected session304.)

| Op         | R* | Z | Q | C | N | Sy | L | V | M | T | S | Notes |
|------------|----|---|---|---|---|----|---|---|---|---|---|-------|
| COMB       | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Binomial coefficient C(n, m). Rejects m > n, negative args. Sy round-trips; COMB(5,2)=10, COMB(5,0)=1, COMB(5,6)→null, COMB(-1,2)→null. All three `_withListBinary` distribution axes (scalar×List `5 COMB {0 2 5}` → `{1 10 1}`; List×scalar `{5 6 7} 2 COMB` → `{10 15 21}`; pairwise `{5 6} {2 3} COMB` → `{10 20}`) plus size-mismatch rejection (`{5} {2 3} COMB` → 'Invalid dimension'). Left-side Tagged-of-List composition (`:lbl:{5 6} 2 COMB` → `{Integer(10), Integer(15)}`). Q `✗` / C `✗` / V `✗` / M `✗` / S `✗`: `_combPermArgs` guard `!isInteger(a) && !isReal(a) → throw` rejects Rational (even integer-valued like `Rational(5,1)`), Complex, Vector, Matrix (no `_withVMBinary`), and String. |
| PERM       | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Falling factorial P(n, m). Same rejections as COMB. Sy round-trips; PERM(5,2)=20, PERM(5,0)=1, PERM(5,6)→null. List×scalar distribution (`{5 6} 2 PERM` → `{20 30}`). Q `✗` / C `✗` / V `✗` / M `✗` / S `✗`: same `_combPermArgs` guard as COMB. |
| IQUOT      | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | Integer division (truncates towards 0). Sy round-trips; IQUOT(17,5)=3, IQUOT(-17,5)=-3, IQUOT(10,0)→null. Pairwise distribution (`{17 20} {5 3} IQUOT` → `{3 6}`). Q `✗` / C `✗` / V `✗` / M `✗` / S `✗`: `_intQuotientArg` has only isInteger/isReal branches; Rational / Complex / Vector / Matrix / String → throw. |
| IREMAINDER | ~  | ✓ | ✗ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | IREMAINDER(a, b) = a - IQUOT(a,b)·b; same sign as dividend. Sy round-trips; IREMAINDER(17,5)=2, IREMAINDER(-17,5)=-2, IREMAINDER(10,0)→null. Scalar×List distribution (`17 {5 3} IREMAINDER` → `{2 2}`). Q `✗` / C `✗` / V `✗` / M `✗` / S `✗`: same `_intQuotientArg` guard as IQUOT. |
| XROOT      | ~  | ✓ | ✓ | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | ✗ | XROOT(y, x) = y^(1/x). Sy round-trips; XROOT(27,3)=3, XROOT(2,2)=√2, XROOT(-8,3)→null, XROOT(8,0)→null. List×scalar distribution on the Real-radicand path (`{8 27} 3 XROOT` → `{Real(2) Real(3)}` — real path emits Real even at clean integer cube roots). Q `✓`: degree x is `new Decimal(isInteger(x) ? … : toRealOrThrow(x))` (`toRealOrThrow` accepts Rational); radicand y goes through `^` (accepts Rational); result always Real (Q→R) — `XROOT Integer(8) Rational(3,1)` → `Real(2)`, `XROOT Rational(1,4) Integer(2)` → `Real(0.5)`. **V `✗` / M `✗`** (corrected session304 — went stale when session298 changed `^`s V/M base semantics): XROOT is pure plumbing that pushes `1/x` and delegates to `^`, and `_withListBinary` distributes Lists only — so a Vector/Matrix radicand reaches `^` as the base. Vector base → `^` rejects ('Bad argument type'; no vector power). Matrix base → `^`s matrix-power needs a whole-number exponent, but `1/x` is whole only at x=±1 (and `^` rejects negative matrix exponents), so any genuine root rejects (`M[[8,27],[1,1]] 3 XROOT` → 'Bad argument value'; non-square → 'Invalid dimension'); the lone non-error path is the degenerate `M^1` no-op at x=1, not a matrix root. The V/M rejection is symmetric across both operand positions: the radicand-slot (level 2) rejects through `^` (above, session304), while a V/M in the **degree slot** (level 1, the `x`) hits `toRealOrThrow(x)` BEFORE the `^` delegation → 'Bad argument type: expected real, got vector/matrix' — a distinct path, pinned session371 (`Integer(8) V[2,3] XROOT` / `… M XROOT`; Real radicand variant too). C `✗` / S `✗`: degree x uses `toRealOrThrow`, which rejects Complex ("expected real, got complex", session267) and String ("expected real, got string", session269) in that same degree slot. |

*`~` on Real (COMB/PERM/IQUOT/IREMAINDER/XROOT) = accepted only when the stack op's integer-or-finite-real domain check passes.

### Ordered comparators — `<` / `>` / `≤` / `≥`

Numeric-family ordered compare.  `comparePair()` promotes BinInt to
Integer (with wordsize mask applied to the payload) before routing
through `promoteNumericPair`, so BinInt × BinInt and cross-family
BinInt × Integer / Real are accepted.  Complex with a non-zero
imaginary part rejects (no total order on ℂ).  String lex compare
(both operands must be String; HP50 User Guide App. J char-code
lexicographic) is supported.  `comparePair` is scalar-only: `isNumber`
(Real/Integer/Rational/Complex) is the only accepted numeric type beyond
BinInt-coerce and String-lex; List/Vector/Matrix/Tagged/Unit all reach the
`!isNumber` guard and throw (pinned session287 — a 4-op × 5-type rejection
sweep in `tests/test-comparisons.mjs`, guarding against a refactor that
widens `comparePair` past scalars; previously only String×Real and
String-lex were pinned).

| Op   | R | Z | Q | B | C* | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|----|---|----|---|---|---|---|---|---|-------|
| `<`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | B coerced via `Integer(value & mask)`. BinInt × Rational composition (B → Integer mask + Integer × Rational rational-kind cross-multiply): `#10h < Rational(33,2)` → 1 (16*2=32 < 33*1=33); ws=8 mask edge `#1FFh < Rational(300,1)` → 1 (#1FFh masks to 255 < 300, mask BEFORE compare); negative Q boundary `Rational(-3,4) < #0h` → 1. BinInt cross-base compare `#5h < #6d` → 1 (`comparePair` ignores the `.base` field). String lex: `"abc"<"abd"` → 1, `"abd"<"abc"` → 0, `"abc"<"abc"` → 0 (strict), `""<"a"` → 1 (empty lex-less). Cross-type `Str<Integer` → Bad argument type. L/V/M/T/U `✗`: scalar-only `comparePair`. |
| `>`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Operand-order on B × Q: `Rational(33,2) > #10h` → 1; ws=8 mask preserved on in-range value `#FFh > Rational(254,1)` → 1. String lex: `"b">"a"` → 1, `"a">"b"` → 0. L/V/M/T/U `✗`. |
| `≤`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Q × B: `Rational(7,3) ≤ #3h` → 1 (cross-multiply 7 ≤ 9). String lex: `"abc"≤"abc"` → 1 (equality boundary), `"abc"≤"abd"` → 1. L/V/M/T/U `✗`. |
| `≥`  | ✓ | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | Same. Rational-branch equality boundary `Rational(2,1) ≥ #2h` → 1 (Rational(2,1) does not auto-collapse to Integer at the constructor — collapse is op-result-level — but the rational-kind compare still fires correctly). String lex: `"abc"≥"abc"` → 1 (equality boundary), `"abd"≥"abc"` → 1. L/V/M/T/U `✗`. |

*`~` on Complex = accepted only when both `im === 0`; otherwise `Bad argument type`.

### Equality / structural compare — `==` / `SAME`

Structural equality over collection and expression types.  `==` and
`SAME` share the same comparator (`eqValues`) — the only semantic
difference is that `SAME` never lifts to Symbolic (it always returns a
Real 1./0.).  Numeric cross-promotion is the same as in `<`/`≤`/`>`/`≥`
(`Real(1) == Integer(1)` = 1).

| Op   | R | Z | Q | B | C | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| ==   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | BinInt × BinInt masked against current wordsize, plus cross-family BinInt × Integer / Real / Complex widening at the `==` / `≠` / `<>` outer level via `_binIntCrossNormalize`. Nested lists / matrix rows recurse via `_eqArr`. Tagged: same tag AND same value. Unit: same numeric value AND same `uexpr` (so `1_m == 1_km` = 0). Program ✓ (structural, pointwise eqValues over `.tokens`); Directory ✓ (reference identity — `a === b`). BinInt × Rational: `#10h == Rational(16,1)` → 1 (`_binIntCrossNormalize` masks #10h → Integer(16), then rational-kind eq cross-multiply); `#10h == Rational(33,2)` → 0; `#10h ≠ Rational(33,2)` → 1; ws=8 mask edge `#100h == Rational(0,1)` → 1 (mask fires before compare). Tagged tag-identity truth table: `:a:Real(5) == :a:Real(5)` → 1; `:a:Real(5) == :a:Real(6)` → 0; `:a:Real(5) == :b:Real(5)` → 0 (tag identity matters); `:a:Real(5) == Real(5)` → 0 (no implicit unwrap; contrast the binary-arithmetic surface where tag-drop makes Tagged transparent). BinInt cross-base `#5h == #5d` → 1 (base is cosmetic). |
| SAME | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Same widening — `SAME` always returns Real 1./0., never a Symbolic. BinInt × BinInt value compare through the same eqValues branch, BUT `SAME` deliberately does NOT cross-family widen (`SAME #10h Integer(16)` = 0 — AUR §4-7 "SAME does not type-coerce"); extends to BinInt × Rational (`SAME #10h Rational(16,1)` → 0, even though `==` widens to 1 on the same operands). Program ✓ (structural); Directory ✓ (reference identity). Mirrors `==` on the Tagged surface but always returns Real: `SAME :a:Real(5) :a:Real(5)` → 1; `SAME :a:Real(5) :b:Real(5)` → 0; `SAME :a:Real(5) Real(5)` → 0. BinInt base-agnostic: `SAME #5h #5d` → 1 (base cosmetic, not a type difference, so SAME's no-coerce stance does not reject); `SAME #5h #6d` → 0. |

---

## Next-session widening candidates

- **Dim-equivalence `==` on Units** — distinct from today's strict
  structural `==`.  Could be a new op (`UEQUAL`?) or a flag that
  flips `==` semantics.  Read AUR §20 first.
- **Index-coercion BinInt arm (DONE, session392).**  `_toIntIdx`
  (`ops.js` ~6453) — the 1-based index coercion shared by GET/PUT/GETI
  on List/Vector/Matrix/String — accepts BinaryInteger alongside
  Integer/Real, but every prior GET/PUT pin fed an Integer or Real index,
  so the BinInt branch was never positively exercised (only its `n < 1`
  reject was reached, via session372's →ARRY dim-spec).  session392 pins
  the positive BinInt-index accept across GET (List/Vector/Matrix/String),
  PUT (List/Matrix), GETI (element + incremented Integer index), and the
  `#0h` n<1 reject (`tests/test-lists.mjs`).  The sibling `_toCountN` BinInt
  arm is already pinned via →LIST (session077).
- **SUB BinInt-index arm (DONE, session399).**  SUB (`ops.js` ~6624) feeds
  both index slots (m, n) through `_toCountN` (`ops.js` ~6463), which accepts
  Integer/Real/BinaryInteger — but every prior SUB pin fed Integer indices, so
  the BinInt branch was never positively exercised *from SUB* (only →LIST,
  session077).  session399 pins SUB with BinInt indices across List and String
  (both slots), the mixed Integer/BinInt slot combination, base-cosmetic
  `#2b/#4b`, and the `#0h` low-clamp (`tests/test-lists.mjs`).  POS takes no
  index operand (its second arg is a needle compared by `_rplEqual`), so it has
  no count/index coercion to widen.  Next index-family holdout: re-scan
  `_toIndex0`/offset helpers (if any) used by REPL/sequence ops for a remaining
  BinInt-accepting coercion still reached only by an Integer/Real operand.
- **→ARRY size-list BinInt arm (DONE, session405).**  `_toDimSpec`
  (`ops.js` ~7102) maps each size-list item through `_toIntIdx`
  (`v.items.map(_toIntIdx)`), so a BinaryInteger *inside* a `{n}` / `{m n}`
  size-list resolves the same as Integer/Real — but the bare BinInt count was
  pinned (session077) and only the size-list *reject* arms (2.5/"x"/-1/empty/>2)
  were pinned (session372); a BinInt inside a valid-length size-list was never
  positively exercised.  session405 pins `{#2h}`→Vector[2], `{#2h #3h}`→2×3
  Matrix (row-major), mixed `{#2h 3}`→2×3 Matrix, and base-cosmetic
  `{#10b}`→Vector[2] (`tests/test-reflection.mjs`).  This is a distinct
  `_toIntIdx` caller from GET/PUT/GETI (session392).
- **SORT BinInt-element arm (DONE, session411).**  `_toCompareNumber`
  (`ops.js` ~7186) has an explicit `isBinaryInteger` branch and
  `_rplCompare`'s `isAnyNum` gate includes BinaryInteger, but every prior
  SORT pin fed Real/Integer/String only — the BinInt comparison arm was
  never positively exercised, so a refactor dropping it (→ null, or out of
  `isAnyNum`) would pass green.  session411 pins pure-BinInt sort (type
  preserved, ascending by value), base-cosmetic ordering (`#5h #1b #9o #2d`
  sorts by value, each base preserved), and BinInt cross-sorted with
  Integer/Real (mixed element types preserved) (`tests/test-lists.mjs`).
- **POS `_rplEqual` BinInt arm (DONE, session418).**  POS (`ops.js` ~6670)
  finds a needle by `_rplEqual` (`ops.js` ~6486), whose BinaryInteger arm
  (~6514, `a.value === b.value`) is reached only when BOTH operands are BinInt —
  the `isNumber` cross-type-equality gate above it excludes BinInt, so two
  BinInts fall past the `a.type !== b.type` guard to the dedicated arm.  Every
  prior POS pin fed Integer/Real/String needles, so the arm was never
  positively exercised.  Unlike `==`, `_rplEqual` is structural (SAME-like) and
  does NOT cross-family widen.  session418 pins pure-BinInt match by value,
  not-found → 0, base-cosmetic match (`#6d` vs `#6h`), and both cross-family
  no-widen directions (BinInt needle vs Integer elements → 0, and the mirror)
  (`tests/test-lists.mjs`).  Next holdout: re-scan the MIN/MAX list reducers
  (and any aggregate over a List, e.g. ΣLIST/∏LIST) for a BinInt-accepting arm
  still reached only by an Integer/Real operand.
- **List-aggregate BinInt arm (DONE, session424).**  ΣLIST/ΠLIST/ΔLIST
  (`ops.js` ~7499/7500/7504) fold their items through the shared `+`/`*`/`-`
  dispatch (`_foldListOp` defers `lookup(opSymbol)` to call time), which accepts
  BinaryInteger and masks the result to the current wordsize — so a list of
  BinInts aggregates to a BinInt.  Every prior pin fed Real/Integer, so the
  BinInt arm was never positively exercised; a refactor swapping the fold's
  delegation for an Integer/Real-only coercion would pass green.  session424 pins
  type-preserved sum (`{#5h #6h #7h}`→#18) / product (`{#2h #3h #4h}`→#24) /
  difference (`{#3h #7h #10h}`→`{#4 #3}`), ΔLIST two's-complement wrap on a
  negative diff (`{#10h #7h #3h}` at ws=64), wordsize masking on overflow
  (ws=8 `{#200 #100}`→#44, `{#20 #20}` product→#144), first-operand base wins
  (`{#101b #1b}`→base b), singleton passthrough, and the independent SLIST
  closure (`tests/test-lists.mjs`).  Next holdout: the MIN/MAX *binary* surface
  already pins B `✗` (`_minMaxScalar` requires `isNumber`); re-scan any remaining
  List-aggregate or reducer (e.g. a stat-column reducer over a List) for a
  BinInt-accepting arm still reached only by an Integer/Real operand.
- **Stats-reducer element coercion B `✗` (DONE, session431).**  TOT/MEAN/VAR/SDEV
  (`ops.js` ~10912-10951) accept a Vector/Matrix operand but coerce each ELEMENT
  through a per-entry helper with no BinaryInteger arm — TOT/MEAN via
  `_statsNumOrComplexEntry` (~10826; isReal/isInteger/isComplex), VAR/SDEV via
  `_statsNumericEntry` (~10820; isReal/isInteger only).  session147 pinned only
  the wrong-container reject (operand neither Vector nor Matrix); a BinInt
  *element* inside a well-formed Vector/Matrix was never exercised, so a refactor
  adding a sloppy `Number(x.value)` BinInt coercion would silently flip reject→
  accept.  session431 pins the BinInt-element `Bad argument type` for all four on
  a Vector (and TOT on a Matrix column), plus the coercer split: TOT/MEAN ACCEPT
  a Complex element (`TOT`→Complex(6,4)) while VAR/SDEV REJECT it
  (`tests/test-stats.mjs`).  These ops are not in the matrix above (stat-accumulator
  family); the reject is the symmetry complement of the BinInt-accepting
  list-aggregate sweep (session424).
- **Bivariate-accumulator element coercion B/C `✗` (DONE, session438).**
  MEDIAN/COV/CORR/ΣXY all coerce each element through `_statsNumericEntry`
  (`ops.js` ~10820; isReal/isInteger only) — MEDIAN over a Vector / per Matrix
  column (`_medianItems`), the bivariate ops over two columns
  (`_twoColsOrThrow` / `_matStatsCol`).  Prior coverage was container-level only
  (MEDIAN had a lone Complex-Vector reject from session053; COV had 1-row /
  3-col / Vector; ΣXY's container rejects live in test-stats), so a well-formed
  Vector/Matrix carrying a BinInt *element* was never exercised — a refactor
  adding a sloppy `Number(x.value)` BinInt arm to `_statsNumericEntry` would
  silently flip reject→accept across the whole stats family.  session438 pins
  the BinInt-element `Bad argument type` for MEDIAN (Vector + Matrix column),
  COV / CORR (both x- and y-column, symmetric through `_twoColsOrThrow`), and
  ΣXY (both columns via `_matStatsCol`), plus the Complex-element reject for
  COV/CORR/ΣXY (these never widened to `_statsNumOrComplexEntry`, unlike
  TOT/MEAN) (`tests/test-matrix.mjs`).  This closes the session431 holdout; the
  `_statsNumericEntry` reject contract is now drift-guarded across every caller.
  Next holdout: re-scan MAXΣ/MINΣ and the regression family
  (LINFIT/LOGFIT/…) for any element-coercion arm still reached only by an
  Integer/Real entry, else the lone larger open item remains Unit
  dim-equivalence `==` (UEQUAL / flag flip, AUR §20, multi-run).

## Bootstrap note

Sessions 062 and 063 logs reference a file named `docs/TYPE_SUPPORT.md`;
that filename is not present in the current tree.  The scheduled-task
charter for this lane names the notes file `docs/DATA_TYPES.md`, so
session 064 re-bootstraps under the charter-correct filename.  Future
runs should treat *this* file as authoritative.  If `TYPE_SUPPORT.md`
resurfaces, consolidate it back into this file rather than maintaining
two.
