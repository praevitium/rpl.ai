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

- **Fully shipped (✓): 449** — as of 2026-09-21 (v0.4.0). Count
  `register(` under `www/src/rpl/ops/`. `allOps()` is the reachable set.
  The ✓ total is that set minus internal aliases and `will-not` rows.
- **Partially shipped (~): 0**
- **Not yet implemented (✗): 0** — `JORDAN` ships. It pushes the
  minimal polynomial, the characteristic polynomial, the eigenvalue-tagged
  characteristic spaces, and the eigenvalue array. The spaces come from
  Giac `eigenvects`.
- **Will-not-support (by design): 9 menu groups** (see below).

Shipped commands are the `register` calls under `www/src/rpl/ops/`.
`allOps()` is the membership list. The side-panel group is the
`category` field on `register`. This file only records commands that
are still missing or deliberately out of scope.

---

## Display / graphics / UI — handled by UI lane

These are tracked here only to mark them out-of-scope for the command-support
lane; `rpl5050-ui-development` owns them.

- `DRAW` `BARPLOT` `HISTPLOT` `SCATRPLOT` `FUNCTION` `POLAR` `PARAMETRIC` `DIFFEQ`
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
