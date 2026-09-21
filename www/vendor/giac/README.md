# Vendored Giac (WebAssembly build)

This directory holds a prebuilt WebAssembly build of Giac — the computer
algebra engine used by rpl.ai for symbolic math (FACTOR, EXPAND, DERIV,
INTEG, SOLVE, TEXPAND, TLIN, series, limits, etc.).

## Why Giac

Bernard Parisse wrote both Giac and "erable", the CAS that shipped on
the HP 48GX / 49 / 49g+ / 50g. The HP Prime runs Giac directly. Most HP
CAS command names (`factor`, `integrate`, `diff`, `tlin`, `texpand`,
`simplify`, etc.) have direct Giac equivalents, which is exactly what
rpl.ai wants.

## Provenance

The two bundled files were lifted from the [adriweb/emgiac](https://github.com/adriweb/emgiac)
prebuilt browser distribution (which itself is emscripten output of the
upstream Giac C++ source):

| File             | Size     | Purpose                                       |
|------------------|----------|-----------------------------------------------|
| `giacwasm.js`    | 384 KB   | Emscripten loader / `Module` glue             |
| `giacwasm.wasm`  | 11.8 MB  | Compiled Giac engine (WebAssembly)            |

### Checksums at time of vendoring

```
fecdb82d2a6617aaea5fa7daa4f3e4e63b35d4d57eb788b2735bc1bf984b6cf2  giacwasm.wasm
c56b08a7d2369cf09a835685c38ae8c9411cb30375a9ab1f8d52f7b9ac1d6408  giacwasm.js
```

Vendored on 2026-04-24 during session 092 (CAS migration Phase 1).
Upstream giac version string is embedded in the WASM; read it at runtime
via `caseval('version')`.

## API surface exposed to JavaScript

The only exported C function is `caseval(string) -> string`. It takes a
Giac expression as a string and returns the result as a string. For
LaTeX output, wrap the expression with Giac's built-in `latex()`:

```
caseval('factor(x^2-1)')         // -> "(x-1)*(x+1)"
caseval('latex(factor(x^2-1))')  // -> "\\left(x-1\\right) \\cdot \\left(x+1\\right)"
```

The glue module that wraps this for the rest of the codebase lives at
`www/src/rpl/cas/giac-engine.mjs` — **do not call `caseval` directly from
anywhere else**.

## License

Giac is licensed under **GNU General Public License v3.0 or later**.
Because rpl.ai bundles Giac, the whole project is distributed under
GPL-3.0-or-later. See the repo-root `LICENSE` and `NOTICE` files.

GMP, MPFR, and MPFI (arbitrary-precision math libraries transitively
compiled into the WASM blob) are LGPL; this is compatible with GPL-3+.

## Refreshing this bundle

To pull a newer Giac build:

```bash
git clone --depth 1 https://github.com/adriweb/emgiac.git /tmp/emgiac
cp /tmp/emgiac/giac/giacwasm.js    www/vendor/giac/
cp /tmp/emgiac/giac/giacwasm.wasm  www/vendor/giac/
```

Then regenerate the checksums above and bump the vendoring date in this
file. Run the full test suite afterwards — Giac minor versions
occasionally change normal forms, which will show up as diffs in
FACTOR/EXPAND output.
