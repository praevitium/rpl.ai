# Vendored complex.js

Complex-number arithmetic library for JavaScript.

## Why complex.js

The pre-migration Complex kernel in `ops.js` was a few dozen lines of
hand-rolled `{ re, im }` arithmetic — correct, but light on edge-case
coverage (branch cuts at negative reals, last-bit identity
preservation, polar-form pow).  complex.js gives us a library-vetted
implementation with trig, logarithm, square-root, and transcendental
extensions we'll tap into as the migration expands.

`www/src/rpl/ops.js` imports the default export as `Complex$` (aliased
so it doesn't collide with our local `Complex(re, im)` type
constructor).  `complexBinary()` marshals our internal `{ re, im }`
pair into a `new Complex$(…)`, dispatches `add` / `sub` / `mul` /
`div` / `pow`, then extracts `.re` / `.im` back.  The stack payload
shape is unchanged — still `{ type: 'complex', re, im }`.

Division-by-zero stays explicit (throws `RPLError('Infinite
result')`) rather than falling through to `Complex.INFINITY`, to
preserve the pre-migration error message.

## Provenance

- Upstream: https://github.com/rawify/Complex.js
- Version: **2.4.3**
- License: MIT (see `LICENSE` alongside this README)
- Author: Robert Eisele

Files in this directory:

| File          | Size   | Purpose                                  |
|---------------|--------|------------------------------------------|
| `complex.mjs` | ~47 kB | ES-module build, imported by `ops.js`    |
| `LICENSE`     | 1 kB   | MIT licence text                         |

## No-fallback rule

Per the session-092 memory `feedback_rpl5050_no_cas_fallbacks.md`:
complex.js is called bare.  A library error propagates.  No legacy
hand-rolled fallback kernel — if a call produces unexpected output
we want to see it.

## Updating

Download a new release from the upstream repo, drop `dist/complex.mjs`
in here and pick up the `LICENSE` alongside it, run the test suite,
and confirm the complex-tests block in `tests/test-types.mjs` still
passes (i·i = -1, (1+2i)·(3−i) = 5+5i, (1+i)² ≈ 2i within 1e-12).
