# Vendored decimal.js

Arbitrary-precision decimal arithmetic library for JavaScript.

## Why decimal.js

JS numbers are IEEE-754 doubles, which is wrong for a calculator that
calls itself HP50-adjacent: `0.1 + 0.2 === 0.3` evaluates to `false`
in native JS arithmetic.  The HP50g uses 12-digit BCD (Binary-Coded
Decimal) internally, so that same sum lands on an exact `0.3`.
decimal.js gives us the BCD-style behaviour at the cost of a thin
object wrapper around each intermediate value.

`www/src/rpl/ops.js` imports `Decimal` and configures it once at module
load (`Decimal.set({ precision: 15, rounding: ROUND_HALF_UP })` — 15
gives us 3 guard digits over the HP50 STD display's 12).  The
`realBinary()` kernel then routes every Real × Real arithmetic op
(`+`, `-`, `*`, `/`, `^`) through Decimal and `.toNumber()`s the
result on the way out.  The Real payload shape on the stack is
unchanged — still `{ type: 'real', value: <JS number> }`.

## Provenance

- Upstream: https://github.com/MikeMcl/decimal.js
- Version: **10.4.3**
- License: MIT (see `LICENSE` alongside this README)
- Author: Michael Mclaughlin

Files in this directory:

| File          | Size   | Purpose                                   |
|---------------|--------|-------------------------------------------|
| `decimal.mjs` | 127 kB | ES-module build, imported by `ops.js`     |
| `LICENSE`     | 1 kB   | MIT licence text                          |

## No-fallback rule

Per the session-092 memory `feedback_rpl5050_no_cas_fallbacks.md`:
decimal.js is called bare.  A library error propagates.  There is no
legacy IEEE-754 fallback path — if the library misbehaves we want the
op to surface the error, not paper over it.

## Updating

Download a new release from the upstream repo, drop `decimal.mjs` and
`LICENCE.md` in here (rename the licence file to `LICENSE`), run the
test suite (`node tests/test-all.mjs`), and confirm the numeric-tests
block in `tests/test-types.mjs` still passes the IEEE-artifact
regressions (0.1 + 0.2, 3·0.4 − 1.2, 1.1², etc.).
