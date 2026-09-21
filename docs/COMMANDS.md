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
| `✓` | Fully shipped — registered in `www/src/rpl/ops/`, reachable from the keypad, ≥1 positive + ≥1 rejection test covered. |
| `~` | Partially shipped — e.g. the op exists but rejects a whole argument class HP50 accepts, or an alias is missing, or there's no rejection-path coverage yet. |
| `✗` | Not yet implemented. |
| `will-not` | Explicitly out of scope per `docs/@!MY_NOTES.md` (USER, ENTRY, S.SLV, NUM.SLV, FINANCE, TIME, DEF, LIB, OFF) or replaced by a deliberate design deviation. |

Where relevant the **Notes** column records the last session number that
touched the row, and any known caveats worth carrying forward.

## Current status

- **Fully shipped (✓): 449** — as of 2026-08-31 (v0.3.7). For reference,
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
  `www/vendor/giac/` (running from the repo root fails with `ENOENT:
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

Shipped commands are the `register` calls under `www/src/rpl/ops/`.
`allOps()` is the membership list. The side-panel group is the
`category` field on `register`. This file only records commands that
are still missing or deliberately out of scope.

---

## Display / graphics / UI — handled by UI lane

These are tracked here only to mark them out-of-scope for the command-support
lane; `rpl5050-ui-development` owns them.

- `DRAW` `BARPLOT` `HISTPLOT` `SCATRPLOT` `FUNCTION` `POLAR` `PARAMETRIC`
  ship in `www/src/rpl/ops/graphics.js` and open the side-panel Graph view.
  `DRAX` `DRAWMENU` `ERASE` `PICT` remain GROB.
- `DISP` `CLLCD` `FREEZE` `INPUT` `WAIT` `BEEP` → ui lane (PROMPT moved
  to the control-flow section session 129 — it ships through the
  rpl-programming lane as a HALT-flavored suspension op, not through
  the UI render loop)
- `MENU` `TMENU` `RCLMENU` → ui lane
- `PVIEW` `PXC` `CPX` `GOR` `GXOR` → ui lane

## Not yet supported (in-lane candidates for future runs)

These are HP50 AUR commands, in-lane for this file, with no registration
in `www/src/rpl/ops/`.  Listed with the cluster they belong to so they
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
