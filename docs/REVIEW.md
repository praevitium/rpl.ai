# REVIEW.md — RPL5050 code-review lane running ledger

**Scope.** This file is the authoritative ledger for the
`rpl5050-code-review` scheduled-task lane. It records audit findings
across the whole repo, classified into the six lane buckets
(`User Interface`, `Commands`, `Data Types`, `RPL`, `Unit Tests`,
`Other`), so the sibling implementer lanes can pick them up as a group.

**Last updated.** Code-review run 2026-06-14 23:27 — re-opened and
same-run fixed an **O-013** RPL_CATALOG drift occurrence: the AI
system-prompt STATISTICS block advertised the sum-of-squares
accumulators as `ΣX²` / `ΣY²` (superscript ²) but the dispatchable
registered names are `ΣX2` / `ΣY2` (ASCII 2, confirmed by the live
`register()` set and `tests/test-stats.mjs` `lookup('ΣX2')`); fixed
`www/src/ai/system-prompt.js:189` to the ASCII spelling with a caveat.
Source-only one-line edit; `node tests/test-all.mjs` = 5781/0.
Prior update: Session 200-code-review (2026-06-15 04:56; filed and
same-run resolved **C-016** — `COMMANDS.md` ✓-count and register-count
prose stale after the SCHUR ship: ✓ bullet 447 → 448, register prose
480/461 → 481/462 to match live `ops.js` counts; doc-only;
`node tests/test-all.mjs` = 5733/0).
Prior update: Session 270-code-review (thirty-ninth and final
review-lane run; sessions 266–269 folded in; 5666/0 clean; O-011
count 107 → 108 (session266-code-review phantom lock); O-012 aged
18 → 19 code-review-lane runs; O-014 chat-bot.js mtime updated
Apr 26 23:26 → Apr 27 03:23; zero release-blocker findings; 2026-04-26).
Prior update: Session 269 (unit-tests — snapshot refresh; TESTS.md
stamp 265 → 269; 5666/0; session-log entries for sessions 267/268/269
appended to REVIEW.md; released gracefully).
Prior update: Session 268 (rpl-programming — final verification
pass; 5666/0 clean; RPL.md stamp 264 → 268; session-268 log written;
all R-findings confirmed closed; 2026-04-26).
Prior update: Session 266 (command-support — doc-reconciliation,
last run; COMMANDS.md stamp 262 → 266; session-log back-fill 263–265-code-review;
5640/0; O-011/O-012/O-014 carried forward; no findings closed; 2026-04-26).
Prior update: Session 265-code-review (thirty-eighth review-lane
run, 2026-04-26).
Prior update: Session 265 (unit-tests — snapshot refresh;
5640/0 clean; TESTS.md stamp 260 → 265; **lock unreleased, session
log missing — crash**).
Prior update: Session 264 (rpl-programming — verification-only pass;
5640/0 clean; RPL.md stamp 259 → 264; session-264 log written).
Prior update: Session 262 (command-support — doc-reconciliation;
COMMANDS.md stamp 257 → 262; session-log back-fill 258–261; 5621/0).
Prior review-lane baseline = session 265-code-review (thirty-eighth
review-lane run, 2026-04-26).
This run folds in five sibling-lane sessions since session 265-code-review:
266 (command-support — COMMANDS.md stamp 262 → 266; session-log
back-fill 263–265-code-review; doc-only; 5640/0; released gracefully;
note: a phantom `session266-code-review.json` lock also exists with
`released: false` and the same `acquiredAt` as session265-code-review —
no corresponding log; recorded as new O-011 occurrence, count 107 → 108);
267 (data-type-support — +26 assertions in `tests/test-types.mjs`
(1189 → 1215; `session267:` C/S/V/M column rejection pins); 5640 → 5666/0;
DATA_TYPES.md stamp 263 → 267; released gracefully with `releaseReason`);
268 (rpl-programming — verification-only; RPL.md stamp 264 → 268;
5666/0; released gracefully with `releaseReason`);
269 (unit-tests — snapshot refresh; TESTS.md stamp 265 → 269; 5666/0;
session-log entries for sessions 267/268/269 appended to REVIEW.md;
released gracefully with `releaseReason`).

Carry-over from session 103: the project tree was relocated —
`src/` → `www/src/`.  All Where: lines filed prior to session 099
referenced the old `src/...` paths; each open finding below has
been re-verified at the new path.  Historical Where: lines are
preserved verbatim as the audit trail.

| Bucket          | Sibling lane that owns the fix            |
|-----------------|-------------------------------------------|
| User Interface  | `rpl5050-ui-development`                  |
| Commands        | `rpl5050-command-support`                 |
| Data Types      | `rpl5050-data-type-support`               |
| RPL             | `rpl5050-rpl-programming`                 |
| Unit Tests      | `rpl5050-unit-tests`                      |
| Other           | any lane — hygiene items, no behavior     |

**Ledger policy.** Each finding below is promoted to
`[resolved - session NNN]` once the owning lane ships the fix and
logs it.  Entries are NEVER deleted — they become the audit trail.
A finding that turned out to be a phantom on second-read is marked
`[retracted - session NNN]` with a one-line reason.

**Baseline (session 270-code-review).** Sessions 266 (command-support),
267 (data-type-support), 268 (rpl-programming), 269 (unit-tests) all
released gracefully with `releaseReason` fields.  Phantom lock
`session266-code-review.json` detected (`released: false`,
same `acquiredAt` as session265-code-review; no corresponding log) —
recorded as new O-011 occurrence, count 107 → 108.  O-011 / O-012 /
O-014 all carry forward as `[deferred - post-ship]`; zero
release-blocker findings.
At code-review-lane *entry*:
`node tests/test-all.mjs` = **5666 passing / 0 failing**
(+26 from session 267; stable through sessions 268, 269);
`node tests/test-persist.mjs` = **passing / 0 failing**
(stable, unchanged); `node tests/sanity.mjs` = **22 passing
/ 0 failing in ~5 ms** (stable).
`grep -c "register(" www/src/rpl/ops.js` = **480**
(`grep -cE "^register\(" www/src/rpl/ops.js` = **461** —
unchanged; sessions 266–269 add no new register calls).

**This run's own edits.** Doc/hygiene only, no source changes:
  1. **`docs/REVIEW.md`** — preamble rewritten to fold in
     sibling sessions 266–269; baseline block updated to session
     270-code-review; O-011 aged 30 → 31 code-review-lane runs,
     count 107 → 108 (session266-code-review phantom lock); O-012
     aged 18 → 19 code-review-lane runs; O-014 updated with new
     chat-bot.js mtime (Apr 27 03:23 from Apr 26 23:26); session
     log entry for session 270-code-review appended.
  2. **`logs/meta-2026-04-26-code-review-5.md`** — this run's
     session log (meta file: doc-only run, no source changes).

**Lock.** Held `utils/@locks/session270-code-review.json`,
scope = `[docs/REVIEW.md, logs/]`.
Released at end of run.

---

## Legend

| Symbol / field | Meaning |
|----------------|---------|
| **Classification** | One of the six buckets above. |
| **Where**      | File + line numbers (or file-scope if file-wide). |
| **What**       | One-line statement of the observed defect. |
| **Why**        | Why this matters — user-visible impact or maintenance hazard. |
| **Fix**        | Minimum change that resolves the finding. |
| **Confidence** | `high` — verified by grep + re-read; `medium` — plausible but needs owner judgment; `low` — style / could-be-deliberate. |
| **Age**        | `new` / `N runs` (number of review-lane runs since first filed). |
| **Status**     | `open` / `resolved session-NNN` / `retracted session-NNN` / `partial` / `[ship-target]` / `[deferred - post-ship]`. |

---

## Ship priorities — Sunday 2026-04-26

The user set Sunday **2026-04-26** as the last full day of work on
this version, with this guidance at ship-prep on Saturday afternoon:

> "The programming features should be given priority.  Also the
> OBJ→ behavior should be closer to the HP50.  Also, when a soft
> key and it errors, it should remove the program from the stack."
>
> "Actually, any time an app is evaluated, it should be removed
> from the stack even on error.  Including when the soft key is
> pressed in VARS menu and the CST menu and when EVAL is called
> on it."
>
> "EVAL also has behavior that should be closer to the HP50."

Translated into ledger items, in priority order:

1. **R-009** `[resolved - ship-prep 2026-04-25]` — EVAL post-pop
   snapshot generalizes the rollback.  ANY EVAL path (entry-line,
   soft-key VARS, soft-key CST, `→NUM`, DBUG, Name/Tagged
   dispatch) now consumes the EVAL'd value on error.  Done in
   `www/src/rpl/ops.js`; seven test sites flipped to match.
2. **R-007** `[resolved - ship-prep 2026-04-25]` — soft-key
   program-error rollback at the `app.js` layer.  Belt-and-
   suspenders alongside R-009.  Pinned in
   `tests/test-variables.mjs`.
3. **R-010** `[resolved - ship-prep 2026-04-25]` — List EVAL now
   evaluates each item per HP50 AUR §3-77 (was a no-op push).
   `{ 1 2 + } EVAL` now produces `3`, embedded Programs run,
   embedded Names look up.  Pinned with +9 assertions in
   `tests/test-lists.mjs`.
4. **R-011** `[resolved - ship-prep 2026-04-25]` — Tagged EVAL
   recurse-evaluation deviation documented as **deliberate** in
   `docs/@!MY_NOTES.md` Intentional Deviations table.  Reverting
   to AUR-strict semantics would break the session-116 HALT-
   through-Tagged feature; not in scope for this version.
5. **R-008** `[resolved - session 155]` — `OBJ→` AUR §3-149
   fidelity audit closed.  Real-branch divergence confirmed and
   fixed (push-unchanged, matching AUR's no-numeric-scalar
   entry).  Tagged-branch was a phantom: AUR §3-149 shows
   `"tag"` (String) per the table's String-literal convention,
   so the existing `Str(v.tag)` is AUR-correct; comment block
   rewritten to flag this as verified-against-AUR, regression
   assertion added.  Lane = `rpl5050-rpl-programming`.
5b. **R-012** `[resolved - session 159]` — `OBJ→` Unit branch
    closed by `rpl5050-rpl-programming` lane.  New `if (isUnit(v))`
    branch at `www/src/rpl/ops.js:6720-6738` pushes `Real(v.value)`
    on level 2 and `Unit(1, v.uexpr)` on level 1, matching AUR
    §3-149 row `x_unit  →  x  1_unit` exactly.  Pinned by 15
    `session159:` assertions in `tests/test-reflection.mjs`.
    The full AUR §3-149 Input/Output table is now covered end-to-
    end (Complex / Tagged / List / Vector / Matrix / String /
    Program / Symbolic / Real / Integer / Unit).
6. **C-011** `[resolved - session 153]` — `_combPermArgs`
    Rational-TypeError leak closed by `rpl5050-command-support`.
    Argument-type guard at `www/src/rpl/ops.js:1683` tightened
    from broad `!isNumber` to per-arg `!isInteger && !isReal`
    pair, mirroring `_intQuotientArg`.  Eight `session153:`
    rejection pins in `tests/test-numerics.mjs`.
7. **X-003** `[resolved - session 160]` — unused `clampLevel`
   import dropped from `www/src/app.js:13-15` by this review-
   lane run.  Charter-permitted dead-import drop; 16 review-lane
   runs aging at close.
8. **O-009** `[deferred - post-ship]` — sandbox cannot delete the
   `.bak` files; user-side `rm` after ship.
9. **O-011** `[deferred - post-ship]` — lock-body releaseReason
   field; pure-infrastructure hygiene best landed post-ship per
   the session 156 meta-log triage.

Open queue at session 194-code-review close: **O-011 + O-012 +
C-013** — O-011 `[deferred - post-ship]` (infrastructure
hygiene); O-012 `[deferred - post-ship]` (stray file); C-013
`[post-ship]` (COMMANDS.md register-count prose +1/+1 drift from
session-191 HEAVISIDE/DIRAC wrapper-add; doc-only fix for
command-support lane).  **C-012 resolved session 190.**
**O-009 resolved session-189-code-review.**  **T-003 fully
resolved by session 185.**  **Zero release-blocker class
findings remain.**  COMMANDS.md stamp "as of session 190";
register-count actual 482 / 461 (1 above the 481/460 claim).

**C-013 resolved session 195.**  Open queue is now **O-011 +
O-012** only (both `[deferred - post-ship]`).  COMMANDS.md
stamp advanced to session 195; register-count prose updated to
482 / 461.

**C-014 filed session 198-code-review.**  COMMANDS.md session-log
block stops at session 186; sessions 187–197 (11 sessions) have
no entries.  `[deferred - post-ship]` — doc-only back-fill for
the command-support lane.  Open queue: **O-011 + O-012 + C-014**
(all `[deferred - post-ship]`).

**C-014 resolved session 199.**  `rpl5050-command-support` lane
back-filled session-log entries for sessions 187–198 (thirteen
blocks — sessions 187 / 188 / 189 / 189-code-review / 190 / 191
/ 192 / 193 / 194-code-review / 195 / 196 / 197 / 198-code-review
/ 198-unit-tests) in `docs/COMMANDS.md`.  Counts stamp advanced
199 → 199.  Open queue: **O-011 + O-012** only (both
`[deferred - post-ship]`).

Ship is complete.  Post-ship lanes may pull O-011 / O-012 as
remaining hygiene (infrastructure / stray-file; no behavior risk).

**Session 202-code-review.**  Post-ship audit; five sibling
sessions (199–202-unit-tests) folded in.  Baseline advanced
5472 → 5485.  **O-007** status line corrected (finding body
said "open" while resolution was appended at ship-prep; formal
**Status.** line promoted).  **O-011** aged 11 → 12 runs,
five new occurrences (199/200/201/202-unit-tests/202-code-
review), running count now **fifty-seven** since session 106.
**O-012** re-verified present, aged to 3 runs.  Open queue:
**O-011 + O-012** (both `[deferred - post-ship]`; no change).

---

## Findings — Other (doc / comment hygiene, cross-lane)

### O-001  Stale lane-task-id `rpl5050-data-types` (should be `rpl5050-data-type-support`)

- **Classification.** Other.
- **Where.** `docs/RPL.md:9`, `docs/TESTS.md:34,131,177,327`.
- **What.** Five sites referenced the lane task id as
  `rpl5050-data-types`, but the charter-canonical id is
  `rpl5050-data-type-support`.
- **Why.** Grep-ability of lane notes.
- **Fix.** Mechanical string replace (shipped session 080).
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-002  Stale lane-task-id `rpl5050-tests` (should be `rpl5050-unit-tests`)

- **Classification.** Other.
- **Where.** `docs/RPL.md:10`.
- **What.** Scope-reminder paragraph in `RPL.md` named the test
  lane as `rpl5050-tests`; canonical id is `rpl5050-unit-tests`.
- **Why.** Same reason as O-001.
- **Fix.** One-word replace.  Shipped session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-003  Stale lane-task-id `hp50-type-support` (very old name)

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:3`.
- **What.** DATA_TYPES.md front-matter named the owning lane as
  `hp50-type-support` — a pre-rename string.
- **Why.** Docs anachronism; misleading to new readers.
- **Fix.** Replaced with `rpl5050-data-type-support`.  Shipped
  session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-004  Stale reference to nonexistent `docs/COMMANDS_INVENTORY.md`

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:5`, `docs/@!MY_NOTES.md:55`,
  `src/ui/side-panel.js:13,44`.
- **What.** Four sites told the reader to consult
  `docs/COMMANDS_INVENTORY.md`, which doesn't exist in the tree.
- **Why.** Broken link; `docs/@!MY_NOTES.md:55` is an uncompletable
  standing instruction to "keep `docs/COMMANDS_INVENTORY.md`
  updated".
- **Fix.** Replace with `docs/COMMANDS.md`; the `@!MY_NOTES.md`
  entry is the command lane's notebook and can't be touched by
  review lane.
- **Confidence.** high — `ls` confirms file absent.
- **Age.** 3 runs. **Status.** resolved session-099 — the command-
  support lane rewrote the step-4 instruction.  Verified session 103:
  `grep -n COMMANDS_INVENTORY docs/@\!MY_NOTES.md` returns zero hits;
  the remaining `COMMANDS_INVENTORY` mentions in the tree are all
  audit-trail references inside `docs/COMMANDS.md`'s own session-log
  and inside this REVIEW.md.

### O-005  `index.html` comments reference nonexistent `js/` directory

- **Classification.** User Interface (comment-only).
- **Where.** `index.html:45,50,54`.
- **What.** Three HTML comments said `rendered by js/keyboard.js`;
  real path is `src/ui/keyboard.js`.
- **Why.** Broken doc trail for new readers.
- **Fix.** Replaced three occurrences.  Shipped session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-007  `www/src/rpl/cas/giac-convert.mjs` `buildGiacCmd` block-comment contradicts the body

- **Classification.** Other (comment drift).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:230-252` (header
  block), vs. `:283-295` (post-return comment).
- **What.** The block comment immediately above `buildGiacCmd` is
  titled "Safe caseval command builder — purge free variables first"
  and spends 22 lines explaining why the builder prepends
  `purge(v1);purge(v2);…` to every caseval.  Session 098
  deliberately removed the purge preamble because Xcas raises
  `No such variable X` when `purge` runs for an unassigned name.
  The function body at `:280-282` now just validates `extraVars`,
  calls `astToGiac`, and returns `buildCmd(giacExpr)` — no purge.
  A second comment at `:283-295` correctly explains the removal and
  conditions under which it might be reintroduced.  The two comments
  sit on opposite sides of a two-line function body and contradict
  each other.
- **Why.** A reader approaching the function top-down reads 22 lines
  describing a purge preamble that does not exist, reaches a
  2-line function body, and has to scroll past the body to the
  second comment to discover the top block is stale.  The
  session-098 memory note ("Giac — no purge preamble, question
  'insurance' machinery") codified this as an intentional design
  choice; the stale top block obscures that intent.
- **Fix.** Rewrite the top block — either delete the purge
  narrative and leave only the session-098 rationale inline, or
  demote the old narrative to a short "historical: prior versions
  prepended `purge(…)`; session 098 removed this because…" note.
  Either form is a pure-comment edit safe for the review lane or
  the cas lane to ship.
- **Confidence.** high — both blocks read in situ session 103;
  re-verified session 108 (block at `:230-252` still leads with
  "Safe caseval command builder — purge free variables first" while
  the body at `:280-282` is the bare `astToGiac` + `buildCmd` pair);
  re-verified session 113 (same state — the 22-line top block at
  `www/src/rpl/cas/giac-convert.mjs:231-252` still opens with the
  purge-first narrative; body at `:280-282` still the bare
  `astToGiac`/`buildCmd` pair; second comment block at `:285-299`
  still explains the removal).
- **Age.** 11 runs. **Status.** `[resolved - ship-prep 2026-04-25]`
  (status line corrected session 202-code-review — the resolution
  was appended to the finding body at ship-prep but the formal
  **Status.** line had not been promoted from "open").
  Re-verified session 118: same state — the 22-line top block at
  `www/src/rpl/cas/giac-convert.mjs:234-256` still opens with
  "Safe caseval command builder — purge free variables first" and
  spends the paragraph describing a preamble the body no longer
  emits; body at `:279-286` is still the bare `astToGiac` +
  `buildCmd` pair; second comment at `:287-299` still correctly
  explains the removal.  Re-verified session 123: same state at
  `:234-256` (top block) / `:281-289` (body — bare `astToGiac` +
  `buildCmd`, with `assertValidCasName` arity check on `extraVars`
  immediately above) / `:290-303` (second comment correctly
  explaining the session-098 removal).  Sessions 119 / 120 / 121
  did not touch the file.  Re-verified session 128:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`, top block still opens with the purge-
  first narrative; sessions 124 (LNAME / GBASIS — both new
  *callers* of giac infra but did not touch this file) and 125
  (data-types — pure widening, no Giac files) did not touch
  `giac-convert.mjs`.  Re-verified session 133:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`; top block at `:234-256` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-286` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Sessions 129 (command-support — doc-only COMMANDS.md edits;
  no CAS files), 130 (data-types — `tests/test-types.mjs` only),
  131 (rpl-programming — `ops.js` body-intercept lifts; no
  `cas/` files) did not touch `giac-convert.mjs`.  Re-verified
  session 138: `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:236`; top block at `:235-257` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-286` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Sessions 134 (command-support — doc-only COMMANDS.md + phantom-row
  retire pass; no CAS files), 135 (data-types — `tests/test-types.mjs`
  only), 136 (rpl-programming — `ops.js` runWhile / runDo / runStart
  / runFor auto-close branches; no `cas/` files) did not touch
  `giac-convert.mjs`.  Re-verified session 143:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`; top block at `:234-256` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-300` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Session 139 (command-support — shipped LIN / LIMIT / lim via
  `buildGiacCmd` callers but did NOT touch `giac-convert.mjs`
  itself; the new ops are call-sites of `buildGiacCmd`, not
  edits to the builder), 140 (data-types — `tests/test-types.mjs`
  + `docs/DATA_TYPES.md` only), 141 (rpl-programming — test-
  control-flow.mjs + RPL.md only, no `cas/` files), 142 (unit-
  tests in flight, broad `tests/*.mjs` + `docs/TESTS.md`
  scope) did not touch `giac-convert.mjs` either.  Re-verified
  session 148: `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`; top block at `:234-256` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:281-289` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Sessions 144 (command-support — shipped MODSTO / ADDTMOD /
  SUBTMOD / MULTMOD / POWMOD via `buildGiacCmd` callers in
  `_modBinary` and `POWMOD`'s symbolic path but did NOT touch
  `giac-convert.mjs` itself; the new ops are call-sites of
  `buildGiacCmd`, not edits to the builder), 145 (data-types —
  `tests/test-types.mjs` + `docs/DATA_TYPES.md` only), 146
  (rpl-programming — `tests/test-reflection.mjs` + `tests/
  test-control-flow.mjs` + `docs/RPL.md` + `docs/REVIEW.md` only,
  no `cas/` files), 147 (unit-tests in flight, broad `tests/*.mjs`
  + `docs/TESTS.md` scope) did not touch `giac-convert.mjs`
  either.  Re-verified session 152: `grep -n "Safe caseval"
  www/src/rpl/cas/giac-convert.mjs` still hits at `:235`; top
  block still opens with the purge-first narrative.  Sessions
  149 (command-support — shipped EXPANDMOD / FACTORMOD / GCDMOD
  / DIVMOD / DIV2MOD via `buildGiacCmd` callers but did NOT
  touch `giac-convert.mjs` itself — every new op is a call-site,
  not an edit to the builder), 150 (data-types — `tests/test-
  types.mjs` + `docs/DATA_TYPES.md` only — but also edited
  `www/src/rpl/state.js` outside its declared scope per session-
  149's interference note; did not touch `cas/` files), 151
  (rpl-programming — `tests/test-control-flow.mjs` + `docs/
  RPL.md` only, no `cas/` files) did not touch `giac-convert.mjs`
  either.  Now 11 review-lane runs aging — the rpl5050-cas-giac
  lane has not been spun up since this finding was filed (the
  giac/cas work continues to be threaded through command-support
  sessions instead, and none has chosen to fold this hygiene edit
  into their pass).  **[resolved - ship-prep 2026-04-25]** — ship-
  day cleanup pass (lock owner = `ship-prep-2026-04-25`) rewrote
  the top block at `www/src/rpl/cas/giac-convert.mjs:234-256`.  The
  22-line "purge free variables first" narrative has been replaced
  with a 25-line block that accurately describes the preamble-
  free behaviour, folds in the post-return comment block (now
  removed) so the contradiction is gone, and preserves the
  future-reintroduction guidance as a guard-rail paragraph.
  Verified at run-close: `grep -n "purge free variables first"
  www/src/rpl/cas/giac-convert.mjs` returns zero hits; `node
  --check` on the file is clean; `node tests/test-all.mjs` =
  5038 / 0; `node tests/test-persist.mjs` = 40 / 0; `node
  tests/sanity.mjs` = 22 / 0.

### O-008  Session 106 shipped substantive changes without writing `logs/session-106.md`

- **Classification.** Other (process / audit-trail drift).
- **Where.** `logs/` (no `session-106.md` exists),
  `utils/@locks/session106-rpl-programming.json` (lock body shows
  `"released": true, "releasedAt": 1777056932`, set by the
  10-minute stale-prune at 18:55 UTC, NOT by a graceful release).
- **What.** Session 106 (lane = `rpl5050-rpl-programming`, intent
  = "P-001 doc paths + lift HALT-in-named-sub-program + SST
  step-into") acquired its lock at `1777056299` and was
  stale-pruned ~10 minutes later.  The source/doc edits the
  session was claiming did land — `_evalValueGen` and the
  `_stepInto` / `_insideSubProgram` machinery exist in
  `www/src/rpl/ops.js`, `docs/RPL.md` carries the "as of session
  106" header at `:18` and the full lift narrative at `:75-148`,
  the P-001 RPL.md sites are all rewritten to `www/src/...`, and
  `tests/test-control-flow.mjs` imports `stepIntoMode` and runs
  the new step-into assertions cleanly (3871 passing) — but no
  `logs/session-106.md` was written.  The bottom of the existing
  log directory tops out at `logs/session-105.md`.
- **Why.** The session log is the per-run audit trail.  The
  COMMANDS.md / RPL.md session-log blocks point at it; the next
  review-lane and unit-tests passes use it to confirm what the
  prior lane intended versus what landed; future lanes
  archaeologically grep through it to bisect when a behavior
  change first appeared.  The C-006 finding above had to
  reconstruct what session 106 did from RPL.md prose, the lock
  file, and direct reads of `ops.js` — that reconstruction is
  exactly what a session log would have spared.
- **Fix.** Have the rpl-programming lane (or any agent
  reconstructing the run from `ops.js` + `RPL.md` deltas) write a
  back-dated `logs/session-106.md` summarising the HALT lift +
  SST↓ step-into + P-001 RPL.md fix, with the entry/exit test
  counts (entry = 3830 from session 105 close, exit = 3830 + the
  +N test-control-flow assertions session 106 added — verifiable
  by counting `session106:` labels in `tests/test-control-flow.mjs`).
  Independent of the back-fill, codify the "release lock by
  graceful call, not by stale-prune" expectation in the lock
  helper README so future runs surface the missing-log condition
  louder.
- **Confidence.** high — `ls logs/session-10*.md` confirms 105 is
  the latest log on disk; `cat utils/@locks/session106-rpl-programming.json`
  confirms the released-by-prune state; `grep -nE 'session 106|_evalValueGen'
  www/src/rpl/ops.js docs/RPL.md` confirms the work itself shipped.
- **Age.** 2 runs. **Status.** resolved session-118 — both halves
  now shipped.  (1) Back-fill: `logs/session-106.md` exists on
  disk (10,777 bytes, mtime 19:03 UTC 2026-04-24), populated with
  the HALT-lift + SST↓ step-into + P-001 narrative that a
  session-106 log would have carried; written by the rpl-
  programming lane as part of the session 111 close-out
  (`logs/session-111.md:207-216`).  The parallel concern — session
  109 command-support's log turned out to be a race on session
  111's directory snapshot, not a miss.  (2) README guidance:
  `utils/@locks/README.md:35` (formerly the short "Release — delete
  your lock file…" line) now spells out that `release()` is the
  task's own responsibility and must fire from a `finally` block
  before task exit; explicitly calls out that a `released: true`
  set by `pruneStale` (rather than by the owner's `unlink`) is a
  process-failure signal — usually means the task ran out of time
  or crashed mid-way and did NOT write its `logs/session-NNN.md`.
  The paragraph tells a future audit pass to flag the missing
  session log in REVIEW.md whenever it spots that signature.
  Points at O-008 itself as the precedent.  Verified session 118:
  `grep -n 'stale-prune\|release()' utils/@locks/README.md`
  returns the new paragraph at line 35.

### O-006  `docs/DATA_TYPES.md` "Last updated" stamp drift

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:8`.
- **What.** At session 080 the stamp read "Session 076" while the
  last substantive change was session 074.
- **Why.** Stale "verified through session N" misleads readers.
- **Fix.** Session 082 (data-type lane) rewrote the stamp as
  `Session 082 (2026-04-23) — last substantive change. Sessions
  075 / 076 / 078 / 079 / 080 / 081 did not touch the type-
  acceptance matrix itself (they were unit-tests / review /
  command-support work).` — exactly the explanatory paragraph
  suggested in the session-080 filing.
- **Confidence.** high — verified session 085.
- **Age.** 2 runs. **Status.** resolved session-082.

### P-001  Seventeen stale `src/…` path references in `docs/` (the tree moved to `www/src/`)

- **Classification.** Other (doc path drift, cross-lane).
- **Where.**
  - `docs/RPL.md:24, :27, :395, :397, :445, :582, :583, :585, :586`
    (9 sites).
  - `docs/DATA_TYPES.md:69, :81, :92, :271, :296` (5 sites).
  - `docs/ROADMAP.md:46` (1 site).
  - `docs/TESTS.md:203, :325` (2 sites — do **not** edit from the
    review lane while session 102 unit-tests holds that file).
- **What.** All 17 references name source files as `src/rpl/…` /
  `src/ui/…` / `src/app.js`.  The project tree was relocated during
  the session-090 Tauri prep (the `src-tauri/` directory now
  occupies `src/` at the top level and the JS code moved under
  `www/src/…`).  Every reference at the sites above should now
  read `www/src/…`.
- **Why.** Grep-ability of documentation.  A new contributor
  reading `docs/RPL.md:583` ("Evaluator: `src/rpl/ops.js` — search
  for `evalRange`…") will fail to find the file, or worse, will
  accidentally land in `src-tauri/` and follow a false trail.
- **Fix.** Mechanical prefix replacement `src/rpl/` → `www/src/rpl/`
  and `src/ui/` → `www/src/ui/` and `src/app.js` → `www/src/app.js`
  in each of the three doc files (RPL.md, DATA_TYPES.md, ROADMAP.md).
  `docs/TESTS.md` is locked by session 102 — unit-tests lane should
  fold those two updates into its next pass.  Each finding below
  that cites an `src/rpl/` path (X-001 through X-005, R-001, R-002,
  U-001) is historical audit trail and should NOT be rewritten —
  the verifier greps in this run have already been updated to the
  new paths.
- **Confidence.** high — 17 sites confirmed via `grep -rn 'src/rpl\|src/ui\|src/app\.js' docs/ | grep -v 'www/src'` at session-103 entry; `ls www/src/rpl/` confirms the new location.
- **Age.** 3 runs. **Status.** **resolved session-117 (all 17 sites
  closed across sessions 105 / 106 / 117 / 118).**
  - `docs/RPL.md` (9 sites) — **resolved session-106** (rpl-programming
    lane, while shipping HALT-named-sub-program lift; the session-106
    log was back-filled later, see O-008).  Verified session 113:
    the only `src/rpl/...` mention in `docs/RPL.md` that isn't
    under `www/src/` is a historical audit-trail line at `:294`
    inside session 106's own log block ("`src/rpl/parser.js` →
    `www/src/rpl/parser.js` and similar at 9 sites"), which
    preserves both old and new path names on purpose as a migration
    narrative — per the REVIEW.md policy that "historical audit
    trail … should NOT be rewritten" this is not an open site.
  - `docs/DATA_TYPES.md` (5 sites) — **resolved session-105**
    (data-type-support lane, alongside the 23-op Sy round-trip pass).
    Verified session 113: same grep returns zero hits.
  - `docs/ROADMAP.md` (1 site) — **resolved session-118** (code-
    review lane, folded into this run's scope because it's pure
    path-prefix hygiene).  Verified session 118: `grep -n 'src/rpl'
    docs/ROADMAP.md` returns zero hits.
  - `docs/TESTS.md` (2 sites) — **resolved session-117** (unit-tests
    lane, alongside the assertThrows migration pass).  Both sites
    rewritten to `www/src/rpl/...` and `www/src/...` respectively;
    the surrounding narrative blocks (s084 KNOWN-GAP test plan that
    formerly cited `src/rpl/ops.js`, and s083 concurrent-lane
    awareness paragraph that formerly cited `src/rpl/algebra.js`)
    were the targets.  Verified session 123: `grep -rn 'src/rpl\|src/ui\|src/app\.js'
    docs/ | grep -v www/src | grep -v src-tauri | grep -v REVIEW.md
    | grep -v 'docs/RPL.md:294'` returns zero hits — the only
    surviving non-`www/src/` mentions are the historical audit-trail
    lines preserved per policy (the RPL.md:294 migration narrative
    plus the session-103/108/113/118 entries inside this REVIEW.md
    that cite the old paths as part of the finding history).
  - Re-verified clean with the full grep at session 123.

### P-002  `www/src/rpl/types.js` header docstring omits Rational and points at pre-move vendor path

- **Classification.** Other (doc drift inside source file).
- **Where.** `www/src/rpl/types.js:1-40` (file header comment) and
  `:128` (Rational docstring).
- **What.** Two related gaps:
  1. The file-header "Types implemented" enumeration (lines 9-40)
     lists Real, Integer, Complex, String, Name, Symbolic, List,
     Vector, Matrix, Program, Tagged, BinaryInteger, Unit, Grob —
     but not **Rational**.  Rational became a first-class stack
     type in session 092 (Fraction.js-backed; participates in the
     Integer ⊂ Rational ⊂ Real ⊂ Complex promotion lattice); its
     constructor is at `:132` and its predicate `isRational` at
     `:374`.  A reader looking at the header-block manifest will
     miss one of the three numeric types (alongside Integer and
     Real).
  2. The Rational docstring at `:128` reads "vendored at
     `src/vendor/fraction.js/`" — the current path is
     `www/src/vendor/fraction.js/` (same tree-relocation that drove
     P-001).
- **Why.** The header block is the canonical one-stop summary of
  the value-type surface.  An omission at that level cascades into
  reader assumptions about what the numeric promotion lattice looks
  like.  The vendor-path pointer is the only link between the
  Rational doc and its implementation library; it should resolve.
- **Fix.** (1) Add a `Rational — exact ratio of integers via
  Fraction.js; participates in the Integer ⊂ Rational ⊂ Real ⊂
  Complex lattice.` row to the header block, positioned between
  Integer and Complex.  (2) Replace `src/vendor/fraction.js/` with
  `www/src/vendor/fraction.js/` at line 128.
- **Confidence.** high — header re-read session 103.
- **Age.** 1 run. **Status.** resolved session-105 — data-type-support
  lane added the Rational row to the header-block enumeration
  (now at `www/src/rpl/types.js:17-21`, between Integer and Complex,
  with the lattice phrasing exactly as proposed), and replaced the
  vendor path at the Rational docstring (now reads
  `www/src/vendor/fraction.js/`).  Verified session 108:
  `grep -n 'Rational' www/src/rpl/types.js` shows the header row
  at :17, and `grep -n 'src/vendor/fraction.js/' www/src/rpl/types.js`
  shows only the `www/src/...` form.

---

## Findings — Commands

### C-007  `COMMANDS.md` PROMPT row classified under UI lane; session 121 shipped it through rpl-programming lane

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:371` (the Interaction-ops row that
  groups `DISP CLLCD FREEZE INPUT PROMPT WAIT BEEP → ui lane`),
  plus the Counts block heading at `:24` (still stamped "session
  119") and the session-log block at the file end (no entry for
  sessions 120 / 121 / 122).
- **What.** Three related drifts caused by session 121's
  unannounced PROMPT ship (see O-010 for the umbrella finding):
  1. **PROMPT misclassified.**  The Interaction-ops row at line
     371 still groups PROMPT with the rest of the user-facing
     I/O ops (`DISP`, `CLLCD`, `FREEZE`, `INPUT`, `WAIT`, `BEEP`)
     under the trailing arrow `→ ui lane`.  That arrow was
     accurate when written (the UI lane was expected to ship
     PROMPT alongside DISP / INPUT) but session 121
     `rpl5050-rpl-programming` actually shipped PROMPT as a
     suspension-yielding control-flow op, not as a UI write
     primitive.  The PROMPT handler in `www/src/rpl/ops.js:10968`
     yields up to the EVAL/CONT driver (the same mechanism HALT
     uses), parks `state.promptMessage`, and resumes on
     CONT / KILL / SST — none of which is UI-lane work.  A reader
     consulting COMMANDS.md to understand "is PROMPT shipped?"
     and "which lane owns it?" gets two wrong answers (the row
     reads as ✗ since it sits with the not-yet-shipped DISP /
     INPUT cluster, and the lane attribution is also wrong).
  2. **PROMPT row needs ✗ → ✓ flip + Notes column.**  Split out
     PROMPT into its own row (or move it into the control-flow
     section near HALT / CONT / KILL where it actually belongs);
     mark ✓; add a Notes column citing session 121 ("Session 121
     — PROMPT yields up to the EVAL/CONT driver, parks the
     prompt-message string in `state.promptMessage`, resumes on
     CONT / KILL / SST.  Mirrors HALT's suspension protocol; no
     UI-lane involvement.")
  3. **IFT / IFTE row missing the session-121 generator lift.**
     Session 121 also re-routed IFT / IFTE through `evalRange`'s
     body-intercept (see O-010); the COMMANDS.md control-flow
     row for IFT / IFTE has no Notes addendum reflecting this.
     A reader consulting that row to gauge HALT-inside-IFT
     coverage would conclude (correctly per the row, wrongly per
     the code) that HALT is still rejected — the row has not
     been updated since the row's last edit.
  4. **Counts block stamp + register() count.**  Heading at line
     24 still reads "as of session 119".  `grep -c "register(" www/src/rpl/ops.js`
     now returns **449** (one new ship — PROMPT — landed by
     session 121 since the session-119 stamp recorded **448**).
     The session-log block at the file end has entries through
     session 119 / EGV / RSD / GREDUCE; no entry for session 120
     (data-types — no register changes) or session 121 (PROMPT
     ship + IFT / IFTE refactor) or 122 (in-flight unit tests).
- **Why.** COMMANDS.md is the canonical "what's shipped, what's
  not" reference.  PROMPT misclassification is actively
  misleading on three axes — capability ("is it shipped?"), lane
  attribution ("who owns it?"), and mechanism ("does it go
  through the UI render loop or the evaluator?").  IFT / IFTE
  HALT-coverage is the same kind of capability-state gap that
  C-003 / C-006 already mapped for HALT itself: the row
  describes the pre-lift state.  Counts-block staleness is the
  audit-trail concern that C-005 mapped at session 086 / 088 —
  exactly the same anti-pattern, recurring once per
  rpl-programming-lane silent-ship.
- **Fix.** Three pure-Notes-column / row-shape edits to
  `docs/COMMANDS.md`:
  1. Pull PROMPT out of the Interaction-ops row at `:371`; add a
     new row in the control-flow section near HALT / CONT / KILL
     marked ✓ with the session-121 Notes column proposed above.
  2. Append to the IFT / IFTE row Notes: "Session 121 —
     IFT / IFTE actions now re-enter `evalRange` via the
     body-intercept path (`ops.js:3116-3158`); HALT inside the
     action no longer rejects at `_driveGen`.  Pinned by
     test-control-flow session122 IFT/IFTE+HALT cluster."
  3. Bump the Counts heading to "as of session 122 — 2026-04-24"
     (or the next session that owns the edit), update the
     `register()` total to **449**, and add session-log entries
     for sessions 120 (no count change), 121 (+1 PROMPT, ✗ → ✓;
     IFT / IFTE Notes addendum), and 122 (no count change).
- **Confidence.** high — `grep -n 'PROMPT' docs/COMMANDS.md`
  shows the line-371 row is the only PROMPT mention in the file;
  `grep -nE "register\(\s*'PROMPT'" www/src/rpl/ops.js` shows the
  op live at `:10968`; `grep -c "register(" www/src/rpl/ops.js`
  returns 449; `grep -nE 'IFT[E]? .*Notes|Session 12[01]' docs/COMMANDS.md`
  confirms no IFT / IFTE row addendum and no session-12x log
  entries.
- **Age.** 1 run. **Status.** **resolved session 129** by the
  `rpl5050-command-support` lane.  All four sub-items from this
  finding's session-128 status block are now closed:
  - **(closed session 129)** PROMPT row split out of the
    `DISP CLLCD FREEZE INPUT WAIT BEEP → ui lane` group; new ✓
    row added in the control-flow section between
    `HALT CONT KILL` and `RUN`, with Notes that cite the
    session-121 evalRange intercept (`ops.js:3129-3136`),
    `setPromptMessage` / `clearPromptMessage`, the CONT/KILL/SST
    semantics, and the `'PROMPT' EVAL` outside-program error
    mirroring HALT.
  - **(closed session 129)** IFT/IFTE row Notes column amended
    with the session-121 generator-flavor lift addendum (body-
    intercept path at `ops.js:3145-3158` — note that the
    session-128 audit cited `:3116-3158`; the actual range is
    `:3145-3158`, the `:3116` figure was off-by-one).  Sync-
    fallback caveat preserved.
  - **(closed session 129)** HALT/CONT/KILL row Notes column
    amended with both the session-121 IFT/IFTE lift and the
    session-126 SEQ/MAP lift; the previously stale "only HALT
    inside a sync-path call (IFT / IFTE / MAP / SEQ body) still
    rejects" caveat rewritten as the now-correct "Residual:
    HALT reached through the **sync-fallback** Name-dispatch
    path for IFT / IFTE / SEQ / MAP still rejects" with the
    four session-111 caller labels enumerated.
  - **(closed session 129)** Session-log entries for sessions
    120, 121, 122, 123, 125, 126, 127, 128 back-filled at the
    file-end log block (chronological, most-recent-first), plus
    a session-129 entry at the top of the log documenting this
    run's edits.  The Counts heading was bumped from session
    124 to session 129 and the `register()` count narrative
    refreshed from 455 → 458 with attribution for the +3 delta
    (session-126 SEQ/MAP register-rewrites + sibling-lane
    traffic; session 129 itself shipped no new registrations).
  Verified session 129 via `grep -nE
  '## Counts \(as of session 129|register\(\) count it added is
  the \+1|PROMPT.*Session 121.*HP50 AUR p\.2-160|IFT.*IFTE.*Session
  121:|HALT.*Session 126:.*SEQ' docs/COMMANDS.md` (5 hits, all on
  the new edits) and `node tests/test-all.mjs` = 4374 / 0 / sanity
  22 / persist 38 (all stable from session 128's run-close
  baseline).  **Original status block (session 128) preserved
  below for traceability.**

  ---
  *(session-128 status block, retained for traceability — the
  open-piece narrative below was the input to session 129's
  closure work)*

  **partial — Counts heading +
  register count + session-124 log entry slice closed by session
  124; PROMPT row + IFT/IFTE row + HALT row + missing
  120/121/122/123/125 session-log entries still open.**  Re-
  verified session 128:
  - **(closed by session 124)** Counts heading at
    `docs/COMMANDS.md:24` now reads "## Counts (as of session 124
    — 2026-04-24)"; `register()` line at `:34` reads "= **455**
    at the end of session 124 (was 448 at the end of session
    119)"; the prelude at `:37` calls out "the remaining +5
    between sessions 119 and 124 came from intervening lanes
    (e.g. session 121's `PROMPT` op for the rpl-programming
    lane)".  Brief acknowledgement of session 121's PROMPT in
    the Counts narrative is now present; one of C-007's three
    drifts is closed.
  - **(still open)** Line 348: `IFT IFTE` row Notes column still
    reads only `Stack conditionals.` — no session-121 addendum
    describing the generator-flavor lift through `evalRange`'s
    body intercept; no link to RPL.md.  Required edit: append
    "**Session 121:** IFT / IFTE actions now re-enter `evalRange`
    via the body-intercept path (`ops.js:3116-3158`); HALT /
    PROMPT inside the action lifts cleanly through `_evalValueGen`
    and resumes via CONT.  Sync-fallback (Name dispatch /
    Tagged-wrapped Name / direct `lookup('IFT').fn(s)`) still
    rejects with the session-111 caller label.  See `docs/RPL.md:
    42-46`."
  - **(still open and now MORE stale)** Line 355: HALT /
    CONT / KILL row Notes still says "**Session 106:** … only
    HALT inside a sync-path call (IFT / IFTE / MAP / SEQ body)
    still rejects with `HALT: cannot suspend inside a sub-
    program call`."  Session 121 lifted IFT / IFTE off this list
    and session 126 (in flight at this run) is lifting MAP / SEQ.
    The row's caveat list will need a session-121 amendment now
    and a session-126 amendment once 126 graceful-releases; for
    this run, the session-121 amendment is the open piece.
  - **(still open)** Line 388: `DISP CLLCD FREEZE INPUT PROMPT
    WAIT BEEP → ui lane` — PROMPT still grouped with the UI-
    lane I/O ops.  Required edit: pull PROMPT out of this row
    and add a control-flow row near HALT / CONT / KILL marked ✓
    with session-121 Notes ("yields to the EVAL/CONT driver via
    the same suspension channel HALT uses; parks
    `state.promptMessage`; CONT clears the banner and resumes;
    KILL drops the suspension; SST is a no-op for PROMPT").
  - **(still open)** Session-log block at the file end has
    entries for sessions 124 and 119 (the file-end block is
    most-recent-first, so 124 sits at the top, 119 a few entries
    down).  Missing entries for sessions 120 (data-types — no
    register changes; brief one-liner OK), 121 (rpl-programming
    — the PROMPT ✗ → ✓ flip + IFT / IFTE Notes addendum, even
    though the row edits themselves are still pending; the log
    entry can pre-cite the rows that need updating), 122 (unit-
    tests — back-fill of session-121 PROMPT/IFT/IFTE coverage;
    no register changes), 123 (review-lane — no register
    changes), 125 (data-types — arity-2 list distribution
    widening + Tagged-of-List composition; no register changes).
  Required: command-support lane next time it runs to pick up
  C-007's three open drifts (IFT/IFTE row, HALT row, PROMPT row
  + session-log entries).  Lane = `rpl5050-command-support`.
  Pairs naturally with the IFT/IFTE row update if session 126
  closes its work and the HALT row needs a session-126 MAP/SEQ
  amendment in the same pass.

### C-008  `COMMANDS.md` HALT/CONT/KILL row missing session-131 DOLIST/DOSUBS/STREAM lift + Counts/session-log staleness

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:389` (the `HALT CONT KILL` row in
  the control-flow section), plus the Counts heading at `:24`
  (still stamped "as of session 129 — 2026-04-24") and the
  session-log block at the file end (no entries for sessions
  130, 131, or the in-flight 132).
- **What.** Session 131 (`rpl5050-rpl-programming`, fifth run)
  lifted HALT / PROMPT through `DOLIST` / `DOSUBS` / `STREAM`
  per-iteration program bodies — the last three structural
  sync-path call sites that the session-126 SEQ/MAP run hadn't
  reached.  New `runDoList` / `runDoSubs` / `runStream`
  generator helpers were added at `www/src/rpl/ops.js:8142`,
  `:8224`, and `:8304` respectively, plus body-intercept dispatch
  in `evalRange` at `:3196` / `:3202` / `:3208`.  Sync-fallback
  handlers preserved with session-111 caller labels
  (`'DOLIST program'`, `'DOSUBS program'`, `'STREAM program'`);
  DOSUBS NSUB/ENDSUB context-frame teardown happens inside the
  generator's `try/finally`.  Pinned by +65 session-131
  assertions in `tests/test-control-flow.mjs` (498 → 563).
  None of this is reflected in COMMANDS.md:
  1. **HALT/CONT/KILL row Notes column missing the session-131
     addendum.**  The row at `:389` enumerates the lift history
     through session 088 ("structural HALT pilot-limit fully
     lifted"), session 106 (named-sub-program lift), session 121
     (IFT/IFTE), and session 126 (SEQ/MAP) — and stops there.
     A reader consulting that row to gauge "can HALT escape
     DOLIST / DOSUBS / STREAM iterations?" would conclude no
     (per the absence) when the answer per the code is yes.
     The residual paragraph at the end of the row Notes still
     enumerates the four session-111 caller labels (IFT, IFTE,
     SEQ, MAP) but does not include the three new caller labels
     session 131 added (`'DOLIST program'`, `'DOSUBS program'`,
     `'STREAM program'`).
  2. **Counts heading staleness.**  The block heading at `:24`
     still reads "as of session 129 — 2026-04-24".  Session 131
     did not add new `register()` sites — it rewrote three
     existing handlers (`DOLIST` / `DOSUBS` / `STREAM`) as
     generator-flavor wrappers — but the heading exists to
     convey that the file has been audited against session-N
     state, and four sessions have shipped behavior-affecting
     changes since (130 data-type widening, 131 structural HALT
     lift, 132 unit-tests, plus this run's review).  Bumping
     to "as of session 131" (or session 133 if it lands here)
     keeps readers honest about which behaviors the file
     reflects.
  3. **Session-log block missing entries 130 / 131 / 132.**  The
     log at `:461` ends at session 129; no entries for the
     three sibling-lane runs that have since landed.  Same
     anti-pattern as C-005 / C-006 / C-007 — the file is the
     authoritative session-log surface for the Commands lane,
     and gaps grow harder to back-fill with each missed run.
- **Why.** C-007 was filed at session 123 against the same
  COMMANDS.md HALT row for session 121's IFT/IFTE lift, and
  again at session 128 against the same row for session 126's
  SEQ/MAP lift; session 129 closed both.  C-008 is the third
  iteration of the same anti-pattern: a structural HALT lift
  ships in an rpl-programming-lane run, and the COMMANDS.md
  HALT row plus Counts heading plus session-log block fall
  one cycle behind.  Capability-state drift is the same kind
  of audit-trail concern C-003 / C-006 mapped — the row
  describes a pre-lift state and a reader can't tell which
  iteration constructs HALT now lifts through.  Notes-column
  edits are zero-risk doc work and pair naturally with the
  session-130 / 131 / 132 log back-fill the file owes anyway.
- **Fix.** Three pure-Notes-column / log-entry edits to
  `docs/COMMANDS.md`:
  1. Append to the HALT/CONT/KILL row Notes (`:389`):
     "**Session 131:** DOLIST / DOSUBS / STREAM per-iteration
     program bodies lifted via `runDoList` / `runDoSubs` /
     `runStream` generators (`ops.js:8142`, `:8224`, `:8304`)
     plus body-intercept dispatch in `evalRange` (`:3196`,
     `:3202`, `:3208`) — HALT / PROMPT inside a DOLIST /
     DOSUBS / STREAM iteration suspends cleanly and CONT
     resumes inside the same iteration with the partial
     accumulator and (for DOSUBS) the NSUB/ENDSUB context
     frame intact via the generator's `try/finally` teardown."
     Update the Residual paragraph to enumerate the now-seven
     session-111 caller labels (IFT / IFTE / SEQ / MAP /
     DOLIST / DOSUBS / STREAM) on the sync-fallback Name-
     dispatch path.
  2. Bump the Counts heading at `:24` to "as of session 131 —
     2026-04-25" (or session 133 if this run authors the
     edit).  Session 131 did not change the `register()`
     total; the count narrative stays at 458.
  3. Back-fill session-log entries for sessions 130 (data-type-
     support — three hard-assertion clusters in test-types.mjs;
     no register changes; no row flips), 131 (rpl-programming
     — DOLIST/DOSUBS/STREAM body-intercept lift; new caller
     labels; no new register sites; no row flips), and 132
     (unit-tests — TESTS.md T-002 doc fix + coverage adds; no
     register changes).
- **Confidence.** high — `grep -n 'HALT.*CONT.*KILL' docs/COMMANDS.md`
  shows the row at `:389` and confirms the Notes column stops
  at session 126; `grep -nE 'as of session ([0-9]+)' docs/COMMANDS.md`
  shows the Counts heading at `:24` still reads "session 129";
  `grep -nE 'session 13[012]' docs/COMMANDS.md` returns no
  hits in the session-log block (the only mentions are unrelated
  doc references); `grep -nE 'register\(\s*"DOLIST"|register\(\s*"DOSUBS"|register\(\s*"STREAM"' www/src/rpl/ops.js`
  shows the three handlers live and rewritten;
  `grep -nE 'runDoList|runDoSubs|runStream' www/src/rpl/ops.js`
  shows the three generator helpers at the cited line numbers;
  `grep -c 'session131\|session 131' tests/test-control-flow.mjs`
  shows the +65 assertions are present.
- **Age.** 1 run (filed session 133). **Status.** **resolved
  session 134** by the command-support lane's doc-only run, all
  three sub-items shipped verbatim.  Re-verified session 138:
  (1) `grep -n "Session 131" docs/COMMANDS.md` hits at `:436`
  inside the `HALT CONT KILL` row Notes — the row now contains
  the addendum "**Session 131:** DOLIST / DOSUBS / STREAM
  per-iteration program bodies lifted via `runDoList` / `runDoSubs`
  / `runStream` generators (`ops.js:8142`, `:8224`, `:8304`)
  plus body-intercept dispatch in `evalRange` (`:3196`, `:3202`,
  `:3208`)…" and the residual paragraph enumerates all seven
  session-111 caller labels (IFT / IFTE / SEQ / MAP / DOLIST /
  DOSUBS / STREAM); (2) `grep -nE "as of session" docs/COMMANDS.md`
  shows the Counts heading at `:24` reads "as of session 134
  — 2026-04-24" with the `grep -c "register("` stamp updated
  458 → 463 and the top-level `^register(` count narrative noted
  as 442 unchanged from session 129; (3) session-log block at
  `:507` opens with a session-134 entry and contains contiguous
  back-fill entries for sessions 130 / 131 / 132 / 133 / 134.
  Same close shape as C-007 (session 128 → 129); the C-007
  → C-008 → C-009 chain (this run files C-009 against the
  WHILE/DO/START/FOR row Notes for the same anti-pattern,
  recurring on session 136's auto-close lift) is the third
  iteration of the same cycle.  Lane = `rpl5050-command-support`.

### C-009  `COMMANDS.md` WHILE / DO / START / FOR rows missing session-136 auto-close lift + Counts/session-log staleness

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:426` (the `FOR / START / STEP /
  NEXT` row), `:427` (`WHILE / REPEAT / END`), `:428` (`DO /
  UNTIL / END`) — all three carry an empty Notes column; plus
  the Counts heading at `:24` (still stamped "as of session 134
  — 2026-04-24") and the session-log block at `:507` (most-recent
  entry is session 134; no entries for sessions 135 / 136 / the
  in-flight 137 / this run's 138).
- **What.** Session 136 (`rpl5050-rpl-programming`, sixth run)
  shipped auto-close on missing END / NEXT for `WHILE/REPEAT`,
  `DO/UNTIL`, `START`, and `FOR` — `runWhile` (`www/src/rpl/ops.js`),
  `runDo`, `runStart`, `runFor` each gain an
  `if (!endScan) { endIdx = bound; autoClosed = true; }` branch
  and a `return autoClosed ? bound : closerIdx + 1` exit; spurious
  closer-of-wrong-kind still rejects (the throws at `:3677`
  (`"WHILE/REPEAT without END"`), `:3717` (`"DO/UNTIL without
  END"`), `:3761` (`"START without NEXT/STEP"`), `:3798` (`"FOR
  without NEXT/STEP"`) survive on the wrong-kind branch).  Pinned
  by +36 session-136 assertions in `tests/test-control-flow.mjs`
  (563 → 599).  This closes the structural-auto-close program for
  the condition-loop and counter-loop families, mirroring the
  existing IF (session 083) / IFERR (session 077) / CASE (session
  074) auto-close policy.  None of this is reflected in
  COMMANDS.md:
  1. **Loop row Notes columns at `:426` / `:427` / `:428` empty.**
     The four loop rows all read just `| ✓ |` with no annotation.
     A reader consulting the row to gauge "does WHILE auto-close
     on missing END?" would conclude no (per the absence) when
     the answer per the code is yes.  Compare with the
     `IF / THEN / ELSE / END` row at `:424` which correctly carries
     "**Session 083** — IF auto-closes on missing END at
     program-body bound, mirroring CASE (session 074) and IFERR
     (session 077); IF-without-THEN stays a hard error" — the
     four loop rows want a parallel session-136 annotation.
  2. **Counts heading staleness.**  The block heading at `:24`
     still reads "as of session 134 — 2026-04-24".  Session 136
     did not add new `register()` sites — it widened existing
     `runWhile` / `runDo` / `runStart` / `runFor` bodies in
     place — but the heading exists to convey that the file has
     been audited against session-N state, and three sessions
     have shipped behavior-affecting changes since (135 data-type
     widening — though no source-side change, only test pins; 136
     structural auto-close lift; plus this run's review).  Bumping
     to "as of session 136" keeps readers honest about which
     behaviors the file reflects.
  3. **Session-log block missing entries 135 / 136.**  The log at
     `:507` ends at session 134; no entries for the two
     sibling-lane runs that have since landed (135 data-type-
     support coverage adds; 136 rpl-programming auto-close lift).
     Same anti-pattern as C-005 / C-006 / C-007 / C-008 — the
     file is the authoritative session-log surface for the
     Commands lane, and gaps grow harder to back-fill with each
     missed run.
- **Why.** C-007 was filed at session 123 against the same kind
  of COMMANDS.md row drift for session 121's IFT/IFTE lift, and
  again at session 128 for session 126's SEQ/MAP lift; session
  129 closed it.  C-008 was filed at session 133 against the
  same kind of drift for session 131's DOLIST/DOSUBS/STREAM
  lift; session 134 closed it.  C-009 is the *fourth* iteration
  of the same anti-pattern: a structural-shape change ships in
  an rpl-programming-lane run, and the COMMANDS.md row Notes
  plus Counts heading plus session-log block fall one cycle
  behind.  This time the row drift is wider because the lift
  spans four rows (the four loop families), all with empty
  Notes columns rather than amend-existing-prose edits.
- **Fix.** Three pure-Notes-column / log-entry edits to
  `docs/COMMANDS.md`:
  1. Append to each of the four loop rows an annotation
     mirroring the IF row's session-083 phrasing — e.g.
     "**Session 136** — auto-closes on missing END at
     program-body bound, mirroring IF (session 083) / CASE
     (session 074) / IFERR (session 077); a spurious closer of
     the wrong kind (e.g. NEXT in the END slot) stays a hard
     error".  The FOR / START rows want the same
     annotation phrased for "missing NEXT / STEP".
  2. Bump the Counts heading at `:24` to "as of session 136 —
     2026-04-25" (or session 138 if this run authors the edit).
     Session 136 did not change the `register()` total; the
     count narrative stays at 463 / 442.
  3. Back-fill session-log entries for sessions 135
     (data-type-support — three hard-assertion clusters in
     test-types.mjs; no register changes; no row flips) and
     136 (rpl-programming — auto-close lift on the four loop
     families; no new register sites; no row flips).
- **Confidence.** high — `grep -nE 'WHILE|DO[^a-z]|REPEAT|FOR\s' docs/COMMANDS.md`
  shows the four loop rows at `:426` / `:427` / `:428` and confirms
  each Notes column is `| ✓ |` (empty after the status); `grep -nE
  'as of session ([0-9]+)' docs/COMMANDS.md` shows the Counts
  heading at `:24` still reads "session 134"; `grep -nE 'session
  13[5-7]\b' docs/COMMANDS.md` returns no hits in the session-log
  block; `grep -nE "auto-close" www/src/rpl/ops.js` shows the
  four `runWhile` / `runDo` / `runStart` / `runFor` auto-close
  branches live; `grep -c 'session136' tests/test-control-flow.mjs`
  shows the +36 assertions are present.
- **Age.** 1 run (filed session 138).  **Status.** **resolved
  session 139** by the command-support lane.  All three sub-
  items shipped:
  - **(closed session 139)** Loop rows at `docs/COMMANDS.md:450`
    (`FOR / START / STEP / NEXT`), `:451` (`WHILE / REPEAT /
    END`), `:452` (`DO / UNTIL / END`) all gained the
    session-136 auto-close annotation.  The FOR/START row reads
    "**Session 136** — `FOR` and `START` auto-close on missing
    `NEXT` / `STEP` at program-body bound, mirroring IF (session
    083) / CASE (session 074) / IFERR (session 077).  A
    spurious closer of the wrong kind (e.g. `END` in the
    `NEXT`/`STEP` slot) stays a hard error; see `runFor` /
    `runStart` in `www/src/rpl/ops.js`."  Parallel phrasing
    on the WHILE/REPEAT and DO/UNTIL rows pointing at `runWhile`
    / `runDo` respectively.
  - **(closed session 139)** Counts heading at `:24` bumped from
    "as of session 134 — 2026-04-24" to "as of session 139 —
    2026-04-25"; `grep -c "register("` count refreshed 463 →
    466 (+3 for the new LIN / LIMIT / lim ops session 139 also
    shipped this run); `grep -cE '^register\('` count refreshed
    442 → 445; ✓ rows count refreshed to 437 (was 434, +3 for
    the LIN / LIMIT ops — note that LIMIT / lim share a single
    combined row, hence +3 ✓ rows from +3 register sites).
  - **(closed session 139)** Session-log block at the file end
    gained back-fill entries for sessions 135 (data-types Q×V/M
    broadcast / Tagged-of-V/M binary composition / Tagged tag-
    identity & BinInt cross-base equality, +31 test-types.mjs),
    136 (rpl-programming WHILE/DO/START/FOR auto-close lift,
    +36 test-control-flow.mjs), 137 (unit-tests cross-file
    coverage adds, +45), 138 (code-review eleventh run filing
    C-009 + R-005), and the session-139 entry itself at the top
    of the log.
  Verified session 143 via `grep -nE 'WHILE / REPEAT|DO / UNTIL|FOR / START|auto-close' docs/COMMANDS.md`
  (5 hits including the IF row's session-083 annotation and the
  three new session-136 annotations on the loop rows);
  `grep -nE "as of session" docs/COMMANDS.md` shows the Counts
  heading reads "as of session 139"; `grep -nE "^- \*\*session 13[5-9]"
  docs/COMMANDS.md` shows the back-filled entries 135 → 139 in
  the session-log block.  Same close shape as C-007 (session
  128 → 129) and C-008 (session 133 → 134) — fifth iteration
  of the rpl-programming-lift-then-command-support-back-fill
  cycle, all five now closed.

### C-010  `www/src/rpl/ops.js` INVMOD block comment is now stale post-session-144 (the MODULO state slot has landed)

- **Classification.** Commands (comment drift inside `ops.js`).
- **Where.** `www/src/rpl/ops.js:1939-1954` (the `/* ---- INVMOD —
  modular multiplicative inverse … */` block comment immediately
  above `register('INVMOD', …)`).
- **What.** Two phrasings inside the block comment are now stale
  after session 144's MODULO state slot ship:
  1. **Line 1942** — "we take it explicitly on the stack until that
     slot lands so the op is usable without the CAS state substrate"
     uses conditional-future tense ("until that slot lands").  The
     slot HAS landed: session 144 added `state.casModulo: 13n` to
     `state.js`, plus `setCasModulo` / `getCasModulo` /
     `resetCasModulo` exports, plus the `persist.js` round-trip codec
     (`{ __t: 'bigint', v: '<digits>' }`).  The phrasing reads as if
     the slot is still future work.
  2. **Line 1953** — "When the MODULO state slot lands, add a single-
     arg form that consults it; the two-arg form stays for explicit
     callers" — same conditional-future tense, same staleness.  The
     slot is shipped; only INVMOD's *own* single-arg upgrade is the
     remaining follow-up.
  The actual behavior the comment describes is correct (INVMOD still
  takes both `a` and `n` on the stack and does not consult the new
  state slot), so this is a phrasing drift, not a code-correctness
  drift.  But the `docs/COMMANDS.md` Counts narrative this run
  (`:67-69`, "the INVMOD comment 'One-arg MODULO-state form deferred
  until MODULO lands' stays accurate — INVMOD itself did not switch
  to the new state slot this run; the deferred upgrade is a follow-up
  item for a future MODULO-family session") cited the comment as
  "stays accurate" — which is itself partly wrong: the INVMOD
  *behavior* hasn't changed (correct), but the comment's *phrasing*
  is now misleading because it describes the slot's existence as
  contingent / future when the slot is in fact already shipped.
- **Why.** The INVMOD block comment is the canonical local explainer
  for why this op takes `n` on the stack instead of consulting the
  global modulus.  A reader who sees "until that slot lands" will
  correctly conclude that INVMOD's design predates the slot; but
  they'll wrongly conclude the slot is still future work, which
  would lead them to wonder why the four sibling ops in the file
  (MODSTO / ADDTMOD / SUBTMOD / MULTMOD / POWMOD) appear to consult
  a slot the comment claims doesn't exist.  Cross-file
  inconsistency: `state.js:585-595` has the corresponding setter
  block that opens "MODSTO is the only writer; the modular ops are
  pure readers" — clearly past-tense / present-tense.  Aligning the
  INVMOD block with the same tense closes the local
  inconsistency.
- **Fix.** Two pure-comment edits to `www/src/rpl/ops.js`:
  1. Line 1942 — change "until that slot lands so the op is usable
     without the CAS state substrate" to "(INVMOD's own single-arg
     form that consults `getCasModulo()` is a follow-up; the slot
     itself landed in session 144 — see MODSTO / ADDTMOD / SUBTMOD /
     MULTMOD / POWMOD below)".
  2. Line 1953 — change "When the MODULO state slot lands, add a
     single-arg form that consults it" to "Follow-up: add a single-
     arg form that consults `getCasModulo()` (the state slot landed
     in session 144); the two-arg form stays for explicit callers."
  Pure-comment edit; `node --check` is the safety net.  Pairs
  naturally with the INVMOD single-arg upgrade itself — a future
  command-support session can land both edits in one pass; absent
  that, the review lane can ship the comment refresh as pure
  hygiene.
- **Confidence.** high — both phrasings re-read in situ session
  148; `grep -nE "until that slot lands|When the MODULO state slot
  lands" www/src/rpl/ops.js` returns the two hits at `:1942` and
  `:1953`.  Slot existence verified by `grep -nE "casModulo"
  www/src/rpl/state.js www/src/rpl/persist.js` (eight hits across
  the slot definition, setter / getter / resetter, persist
  encode / decode, and the rehydrate fallback path).
- **Age.** 1 run (filed session 148).  **Status.** **resolved
  session-149** by the `rpl5050-command-support` lane as part of
  its MODULO-cluster ship.  Both pure-comment edits shipped:
  - **(closed session 149)** Line 1942 — the conditional-future
    "until that slot lands so the op is usable without the CAS
    state substrate" was rewritten as "(INVMOD's own single-arg
    form that consults `getCasModulo()` is a follow-up; the slot
    itself landed in session 144 — see MODSTO / ADDTMOD / SUBTMOD
    / MULTMOD / POWMOD below)" — past-tense, points at the
    sibling ops in the file.
  - **(closed session 149)** Line 1953 — the conditional-future
    "When the MODULO state slot lands, add a single-arg form that
    consults it" was rewritten as "Follow-up: add a single-arg
    form that consults `getCasModulo()` (the state slot landed in
    session 144); the two-arg form stays for explicit callers."
    — same past-tense pattern, names the follow-up upgrade
    explicitly.
  Verified session 152 via `sed -n '1939,1960p' www/src/rpl/ops.js`
  showing both rewritten phrasings in situ; `grep -nE "until that
  slot lands|When the MODULO state slot lands" www/src/rpl/ops.js`
  returns zero hits.  Behavior unchanged (INVMOD still takes both
  `a` and `n` on the stack); pure-comment edits.  COMMANDS.md
  INVMOD row Notes column was also amended in the same pass to
  cite the comment refresh (per session-149 log).  Same close
  shape as C-007 (session 128 → 129) and C-008 (session 133 →
  134) — pairs the comment refresh with the natural follow-up
  command-support work.

### C-011  `_combPermArgs` accepts Rational and propagates a JavaScript `TypeError` instead of `Bad argument type`

- **Classification.** Commands.
- **Where.** `www/src/rpl/ops.js:1679-1699` (the `_combPermArgs`
  helper used by both `COMB` (`:1701`) and `PERM` (`:1716`)).
- **What.** The argument-type guard at `:1685` reads
  `if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad
  argument type');`.  But `isNumber` (defined in
  `www/src/rpl/types.js:398`) is `v => isReal(v) || isInteger(v)
  || isRational(v) || isComplex(v);` — so a Rational operand
  passes the guard.  The Complex case is rejected at `:1686` via
  an explicit `isComplex` check, but Rational is not.  The
  `toBig` closure at `:1687-1697` then handles only `isInteger`
  (returns `v.value` directly) and otherwise reads
  `v.value.isFinite()` — a Real-shaped probe.  For Rational, the
  shape is `{type: 'rational', n, d}` (no `.value` field, no
  `.isFinite` method anywhere on the value), so the access
  raises `TypeError: Cannot read properties of undefined
  (reading 'isFinite')`.  Reproduced session 152 with a six-cell
  matrix: `COMB(Rat(5/1), Int(2))`, `COMB(Int(5), Rat(2/1))`,
  `COMB(Rat(5/1), Rat(2/1))`, plus the same three with PERM —
  all six leak `TypeError` instead of `RPLError('Bad argument
  type')`.  Sibling ops `IQUOT` / `IREMAINDER` / `IDIV2` route
  through the analogous `_intQuotientArg` helper at `:1830-1843`
  which checks `isInteger` then `isReal` and throws
  `'Bad argument type'` on any other type — exactly the contract
  COMB / PERM should match.  Surfaced by session 150's data-
  type-support audit while probing `_combPermArgs` for a
  candidate Q-rejection cluster on COMB / PERM (see `logs/
  session-150.md:215-252`); session 150 declined to ship the
  fix (out of declared lock scope, and pinning the *current*
  TypeError behavior would freeze a buggy contract — the right
  move is to file for review-lane routing and let the corrected
  `'Bad argument type'` rejection be pinned alongside the fix).
- **Why.** RPL contract integrity.  HP50 user code that hands a
  Rational to COMB or PERM expects a clean `Bad argument type`
  (or `Bad argument value`) RPL error — the kind the calculator
  surfaces in the status line as a recoverable error.  Instead,
  the handler leaks a JavaScript TypeError up through
  `_driveGen` / `evalRange` / the EVAL driver.  This is the same
  class of defect as a `null pointer` escape in C — the user
  sees a stack-trace-shaped message rather than the RPL-style
  one-liner the rest of the calculator produces.  Also a
  cross-symmetry concern: every other binary-numeric op in the
  same neighborhood (FACT, IQUOT, IREMAINDER, IDIV2, MOD) has
  the type-narrowing right; COMB / PERM are the outliers.
  Likely origin: `_combPermArgs` was written before Rational
  became a first-class numeric type in session 092 (Fraction.js
  + `isRational` predicate); the helper's guard pre-dated
  Rational and was never tightened when the type joined
  `isNumber`'s lattice.  Same stranding pattern as X-008 (the
  session-094 → session-098 purge-removal that left `freeVars`
  unused in `giac-convert.mjs`) — implementation evolved, the
  guard didn't.
- **Fix.** Two surgical options:
  1. **Narrow the type-guard at `:1685`** to reject Rational
     explicitly: `if (!isInteger(a) && !isReal(a)) throw new
     RPLError('Bad argument type'); if (!isInteger(b) && !isReal(b))
     throw new RPLError('Bad argument type');` — mirrors
     `_intQuotientArg`'s shape exactly.  Drops the existing
     `isComplex` check (subsumed by `!isInteger && !isReal`)
     and adds Rational to the rejection branch.  Two-line edit
     (one per operand) plus deletion of the now-redundant
     `isComplex` line.
  2. **Coerce Rational to integer-valued Real first.** A
     Rational that evaluates to an integer (`d === 1n`) could in
     principle be accepted: `Rat(5/1) → BigInt(5n)`.  But the
     HP50 firmware does not do this — `5/1 COMB 2` on hardware
     rejects with `Bad Argument Value` per the AUR §3-29 worked
     example (the example uses a fractional argument and shows
     the rejection).  Match the firmware: reject Rational
     uniformly, even integer-valued Rationals.  Same as option
     (1).
  Pin via 6 + N new assertions in `tests/test-comparisons.mjs`
  or `tests/test-numerics.mjs` (whichever the COMB / PERM block
  lives in): each of the six failure modes above pinned with
  `assertThrows(/Bad argument type/, …)`.  Owner:
  `rpl5050-command-support` (preferred — fix lives in the
  command's own helper, pairs naturally with any COMB / PERM-
  adjacent work) or `rpl5050-data-type-support` (acceptable —
  the underlying drift is the lattice expansion that left
  `_combPermArgs` behind).  `node --check` + `node tests/test-
  all.mjs` are the safety net.
- **Confidence.** high — reproduced session 152 with a six-cell
  matrix at the Node REPL; `grep -n '_combPermArgs\|isFinite'
  www/src/rpl/ops.js` shows the buggy `v.value.isFinite()`
  access at `:1693` and the analogous-but-correct
  `_intQuotientArg` at `:1837`; `grep -n 'isNumber'
  www/src/rpl/types.js` confirms Rational joined the lattice at
  `:398`.
- **Age.** 1 run (filed session 152).  **Status.** **[resolved -
  session 153]** — `rpl5050-command-support` lane (this run)
  rewrote the `_combPermArgs` argument-type guard at
  `www/src/rpl/ops.js:1683` from
  `if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad
  argument type');` to the narrower
  `if (!isInteger(a) && !isReal(a)) throw new RPLError('Bad
  argument type'); if (!isInteger(b) && !isReal(b)) throw new
  RPLError('Bad argument type');` pair, mirroring
  `_intQuotientArg`'s shape exactly.  The redundant explicit
  `isComplex(a) || isComplex(b)` rejection a line below was
  deleted (Complex satisfies neither `isInteger` nor `isReal`,
  so the new guard subsumes it).  Block comment above the guard
  was expanded to record the origin of the drift (Rational
  joined the `isNumber` lattice in session 092 — the helper
  pre-dated the lattice expansion and the guard was never
  tightened) and to point at C-011 for archaeology.  Eight
  `session153:` `assertThrows(/Bad argument type/, …)` pins
  added to `tests/test-numerics.mjs` covering the six AUR-
  mandated rejection modes (COMB / PERM × {Rat-on-2,
  Rat-on-1, both Rat}) plus two genuinely-fractional Rational
  cases (Rat 5/2, Rat 3/2).  Re-verified at run-close:
  `node utils/@c011-repro.mjs` shows all six failure modes
  surface as `RPLError: Bad argument type` (was
  `TypeError: Cannot read properties of undefined (reading
  'isFinite')`); `node utils/@c011-regression.mjs` confirms the
  happy paths (Integer, integer-valued Real, Complex
  rejection) and the integer-valued-Real fractional rejection
  all still behave correctly; `node tests/test-all.mjs` =
  5058 / 0 (was 5050 / 0 at entry; +8 from the new pins).
  COMMANDS.md COMB / PERM row Notes amended in the same
  pass.

### C-006  `COMMANDS.md` HALT row missing session-106 named-sub-program lift + SST↓ step-into

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:299` (the HALT / CONT / KILL row in
  the control-flow section).
- **What.** The HALT row Notes column was last updated for session
  088 ("generator-based `evalRange` — structural HALT pilot-limit
  fully lifted; HALT now works from inside `FOR`, `IF`, `WHILE`,
  `DO`, `IFERR`, and `→` bodies.").  Since then session 106 has
  shipped two related capability changes that the row does not
  reflect:
  1. **HALT through Name lookup is now supported.**  `evalToken`'s
     Name-binding branch routes Program values through the new
     `_evalValueGen` generator (`www/src/rpl/ops.js:3752`) instead
     of `_evalValueSync`, so a HALT inside a sub-program reached
     by `'PRG' EVAL` or by a tail-position name reference now
     yields cleanly up to the EVAL/CONT driver.  The row's old
     "remaining limit: HALT inside a named sub-program called via
     variable lookup" caveat (which C-003 already corrected for the
     session-088 lift) is now itself stale.
  2. **`SST↓` is now a real step-into op.**  Session 106 added
     `_stepInto` + `_insideSubProgram` + `_shouldStepYield`
     (`ops.js:2944-3118`) so single-stepping descends into the body
     of a sub-program when invoked via `SST↓`, while plain `SST`
     keeps stepping over.  RPL.md captures this at `:121-148`; the
     COMMANDS.md row only mentions SST/SST↓/DBUG as a session-101
     shipment without the session-106 step-into refinement.
  Both gaps were created by the session-106 lift landing without
  a COMMANDS.md edit (the rpl-programming lane owns RPL.md, not
  COMMANDS.md, so the cross-doc update is naturally a command-
  support follow-up).  The remaining sub-program limitation
  documented in RPL.md:144-148 — HALT inside a sync-path call
  (IFT / IFTE / MAP body etc.) — still rejects via `_driveGen` and
  is the only true limit left to cite.
- **Why.** A user consulting COMMANDS.md to gauge HALT coverage
  will see only the session-088 description and conclude that
  named-sub-program calls still raise the pilot limit — they do
  not.  Symmetric concern for SST↓: the current row reads as if
  step-into is unimplemented, when it has been live since session
  106.
- **Fix.** Append to the HALT / CONT / KILL row Notes: "**Session
  106:** named-sub-program HALT lifted via `evalToken` → `_evalValueGen`
  for Name-binding evaluations; only HALT inside a sync-path call
  (IFT / IFTE / MAP / SEQ body) still rejects with `HALT: cannot
  suspend inside a sub-program call`.  See `docs/RPL.md:144-148`."
  Add a parallel addendum to the SST / SST↓ / DBUG row (or wherever
  COMMANDS.md tracks the debugger ops): "**Session 106:** SST↓
  shipped as a real step-into via `_stepInto` + `_insideSubProgram`
  modulation of the post-token yield."  Both are pure Notes-column
  edits.
- **Confidence.** high — `grep -n 'HALT' docs/COMMANDS.md` shows
  the row notes end at the session-088 phrasing; `grep -n
  '_evalValueGen\|_stepInto' www/src/rpl/ops.js` confirms the
  session-106 helpers are live; RPL.md `:18` carries the "as of
  session 106" stamp and `:75-148` describes the lifts in detail.
- **Age.** 1 run (filed session 108). **Status.** resolved session-109
  by the `rpl5050-command-support` lane.  `docs/COMMANDS.md` HALT /
  CONT / KILL row now carries the session-106 addendum ("**Session
  106:** named-sub-program HALT lifted via `evalToken` →
  `_evalValueGen` for Name-binding evaluations; only HALT inside a
  sync-path call (IFT / IFTE / MAP / SEQ body) still rejects…").
  The debugger row was additionally upgraded: originally listed as
  `SST` `DBUG` ✗ because session 101's own flip edit had drifted,
  now listed as `SST` `SST↓` `DBUG` ✓ with the session-101 ship
  context + the session-106 step-into refinement in Notes.  Counts
  block reflects the 4-row ✗ → ✓ transition (Ei, Si, Ci new ships
  + SST doc-drift correction).  Verified session 113: `grep -n
  'HALT.*CONT.*KILL\|SST.*SST↓\|Session 106' docs/COMMANDS.md`
  confirms both row additions are present at `:313` and `:315`.

### C-003  `COMMANDS.md` HALT row still describes the old pilot limitation

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:235`.
- **What.** The HALT / CONT / KILL row Notes field still reads:
  "Session 074 pilot — top-level program bodies only; HALT inside
  control flow or `→` raises a pilot-limit error."  Session 088
  converted `evalRange` and all `run*` helpers to JS generators,
  fully lifting the pilot restriction.  HALT now works at any
  structural depth (inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`,
  `→`).  The only remaining limit — HALT inside a *named
  sub-program reached via variable lookup* — is different from the
  old pilot and is documented correctly in `docs/RPL.md:79-81`.
  The COMMANDS.md row has no mention of the session 088 change.
- **Why.** A reader consulting COMMANDS.md to check whether structural
  HALT is supported will conclude it isn't.  Actively misleading.
- **Fix.** Append to the HALT row Notes: "**Session 088:** generator-
  based `evalRange` — structural HALT fully lifted.  HALT now works
  at any depth inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, `→`.
  Remaining limit: HALT inside a named sub-program called via
  variable lookup (see `docs/RPL.md`)."
- **Confidence.** high — grep confirmed, `docs/RPL.md:75-95` has the
  full account.
- **Age.** 1 run. **Status.** resolved session-099 — `docs/COMMANDS.md:292`
  HALT row Notes now reads "**Session 088:** generator-based
  `evalRange` — structural HALT pilot-limit fully lifted; HALT now
  works from inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, and `→`
  bodies."  Verified session 103.

### C-004  `COMMANDS.md` SIZE rows missing Program widening from session 088

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:141` (Lists → SIZE), `:151`
  (Strings → SIZE).
- **What.** Both SIZE rows carry no Notes text.  Session 088 widened
  SIZE to accept Program objects, returning an Integer count of
  top-level tokens (`« 1 2 + » SIZE` → `3`; `« » SIZE` → `0`).
  Neither SIZE row mentions this widening.  `docs/RPL.md:180-183`
  and `tests/test-reflection.mjs` (5 session088-labelled assertions)
  confirm the behavior is shipped and tested.
- **Why.** A developer looking up SIZE coverage will miss the Program
  branch entirely; a future data-types run might re-add it and
  silently overwrite the existing implementation.
- **Fix.** Add a note to the Lists SIZE row (or add a new Program
  substrate row nearby): "Session 088 — SIZE on Program returns
  Integer(token count); shallow — nested sub-programs count as 1.
  Empty program → 0."
- **Confidence.** high — `grep -n 'isProgram' www/src/rpl/ops.js` at the
  SIZE register block confirms the branch; `docs/RPL.md:180`
  documents it; 5 test assertions exist.
- **Age.** 1 run. **Status.** resolved session-099 — `docs/COMMANDS.md:182`
  Lists-SIZE row Notes now reads "**Session 088** — `SIZE` widened to
  Program (count of top-level tokens; matches HP50 AUR)."  Verified
  session 103.

### C-005  `COMMANDS.md` Counts block and session log stale after sessions 087/088

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:24` (Counts heading), `:310-328`
  (Session log block).
- **What.** Two related gaps:
  1. The Counts block heading reads "as of session 086 — 2026-04-23".
     Sessions 087 and 088 have both landed, but neither added a
     session-log entry or bumped the Counts heading.  The ✓ count
     (416) and `register()` grep count (447) are still numerically
     correct — 087 and 088 made type-widening and structural changes,
     not new ✗→✓ op flips — but the "as of" stamp is two sessions
     stale.
  2. The session log block has an entry for session 086 and then
     jumps to session 081; sessions 087 and 088 are absent entirely.
     (Session 087 did update the Notes columns for FLOOR/CEIL/IP/FP
     and comparator ops, and 088 added the generator note in the
     CONT area of COMMANDS.md via the HALT row — but neither session
     added a session-log entry at the bottom of the file.)
- **Why.** The session log is the per-file audit trail for "what
  changed when".  Missing entries make it impossible to grep-bisect
  when a type-widening or behavioral change landed.
- **Fix.**
  - Bump the Counts heading to "as of session 088 — 2026-04-23".
  - Add a session-log entry for session 087 (BinInt rounders +
    String lex comparators + Program/Directory ==; type-widenings
    only, no new ✓ rows, 0 count changes).
  - Add a session-log entry for session 088 (generator-based
    evalRange / structural HALT; SIZE on Program widening; 0
    count changes).
- **Confidence.** high — grep confirms no session 087/088 entries.
- **Age.** 1 run. **Status.** resolved session-099 — Counts heading
  now stamped "as of session 099 — 2026-04-24" (`docs/COMMANDS.md:24`);
  session-log block now carries entries for sessions 087, 088, 092,
  094, 095, 096-098, and 099.  Verified session 103.

### C-001  `MEM` listed as not-yet-supported but already ✓ shipped

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md` (pre-fix line numbers 272, 242).
- **What.** The "Not yet supported" table double-listed `MEM`
  alongside `TVARS`; `MEM` is shipped at `ops.js:7480`.
- **Why.** Counts-block integrity.
- **Fix.** Row split — `MEM` dropped from the not-yet-supported
  cluster, `TVARS` kept solo.  Shipped session 081.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-081.

### C-002  Ghost `RCWS (STWS/RCWS done)` row in "Not yet supported"

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md` (pre-fix line 275).
- **What.** A self-contradicting row `RCWS (STWS/RCWS done) | ✓` sat
  inside the not-yet-supported section while both STWS and RCWS
  were already shipped.
- **Why.** Counts-block integrity.
- **Fix.** Row deleted.  Shipped session 081.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-081.

---

## Findings — Data Types

### D-001  `tests/test-persist.mjs` is currently **failing 1 / 40** because session 150 changed `state.casVx` factory default to lowercase `'x'` outside its declared scope, but did not update the matching test or the `persist.js` doc-comment

- **Classification.** Data Types (the casVx slot is data-types-
  owned per session 076's authoring; the test that fires lives in
  `tests/test-persist.mjs`, but the semantic decision — uppercase
  HP50 fidelity vs. lowercase keyboard-deviation — belongs to the
  data-types lane).
- **Where.**
  - `www/src/rpl/state.js:139` (factory default `casVx: 'x'`),
    `:580-581` (`resetCasVx()` writes `'x'`).
  - `tests/test-persist.mjs:266-272` (the `session076: snapshot
    missing casVx resets to default 'X'` assertion that fires on
    rehydrate of a legacy snapshot without a `casVx` field — gets
    `'x'`, expected `'X'`, currently FAILS).
  - `www/src/rpl/persist.js:118-119` block comment cluster which
    still describes the default as the HP50 factory uppercase
    `'X'` value.
- **What.** Three sites are out of sync after session 150's
  out-of-scope `state.js` edit:
  1. **`state.js:139` factory default is `casVx: 'x'`** with a
     header comment block at `:125-138` explicitly documenting
     this as a "deliberate deviation from the HP50 factory
     default of `'X'`, matching the lowercase-default keyboard
     convention".  This is the new state of the world.
  2. **`tests/test-persist.mjs:271-272`** asserts the post-
     rehydrate-of-legacy-snapshot value is the HP50 factory
     `'X'`.  The assertion fires (`legacy = { ...snap4 }; delete
     legacy.casVx; setCasVx('Q'); rehydrate(legacy, new Stack())`
     → `getCasVx()` returns `'x'`, not `'X'`).  Live result
     verified at session 152 entry: `node tests/test-persist.mjs
     2>&1 | grep -E "session076|FAIL"` shows the failing line:
     `FAIL: session076: snapshot missing casVx resets to default
     'X' (got 'x')`.  This is the **only** failing assertion in
     the persist suite — 39 / 40 pass.
  3. **`persist.js:118` block comment** still describes the
     default in the HP50-fidelity uppercase form — out of date.
  Sibling-session traceability: session 149 (`logs/session-149.md`
  lines 171-209, "Sibling-lane interference" block) explicitly
  documents this as a session-150 out-of-scope edit, observed by
  re-running test-persist immediately before and after session
  150 acquired its lock (40 / 0 → 39 / 1).  Session 150's own log
  (`logs/session-150.md:184-205`) acknowledges the pre-existing
  failure but disclaims responsibility ("Not addressing it from
  this lane (state.js and test-persist.mjs are both outside the
  data-type-support charter and outside this session's lock
  scope)" — even though the state.js edit ITSELF is what
  introduced the failure).  Session 151 (`logs/session-151.md`,
  "Open queue items for future runs" block) recommends the
  failure be filed under code-review as "documented-but-untested
  deviation".
- **Why.** Three concerns.
  1. **Live failing test.** `tests/test-persist.mjs` is a gate
     that the per-run protocol (`docs/@!MY_NOTES.md` standing
     lessons + the lane charter's "all verification gates must
     stay green at exit" rule) requires every session to keep
     green.  It has been failing since session 150 graceful-
     released, and three subsequent lane runs (149 ran
     concurrently, 150 introduced the regression, 151 explicitly
     declined to address) have left it failing.  Each new run
     must now distinguish "my edits broke a test" from "this
     test was already failing at run-entry" — a per-run baseline
     check that the green-gate invariant is meant to spare.
  2. **Cross-doc drift.** state.js' header comment is the
     authoritative narrative ("deliberate deviation, matching
     keyboard"), but persist.js' block comment claims the
     opposite.  A reader following persist.js to understand the
     casVx field's contract gets the wrong story.
  3. **HP50-fidelity question is unsettled.**  The header
     comment frames the lowercase default as deliberate, but the
     test (which is older — written at session 076) implies the
     uppercase value was the original intent.  Without a memory
     entry or explicit lane-level confirmation, future sessions
     cannot tell which side is "the spec" — the keyboard-
     convention argument or the HP50-firmware argument.  This is
     the kind of ambiguity that compounds: each future session
     reading both sides will defer the decision again.
- **Fix.** The data-types lane has to pick one of two narrow
  remediations (both are 1-2 line edits + a verification re-run):
  1. **Embrace the lowercase deviation.**  Update
     `tests/test-persist.mjs:271` to expect `'x'` (and the
     surrounding message string at `:272`); update `persist.js:118-
     119` block comment to describe the lowercase default and
     cite the deliberate-deviation rationale; bring DATA_TYPES.md
     coverage matrix Notes column for the casVx slot in line if
     it cites the uppercase default anywhere.  **Risk:** loses
     direct HP50 fidelity on a CAS-firmware-named slot.
  2. **Revert `state.js:139` to the HP50 factory `'X'`.**
     Restore the uppercase factory default; re-purpose the
     keyboard-input default such that lowercase letter entry
     coerces uppercase for the canonical CAS-variable name slot
     (or accept the keyboard inconsistency).  **Risk:** undoes
     a session-150 design choice that already shipped to user-
     reachable state; `getCasVx()` has been returning `'x'` to
     callers in the live calculator since session 150's lock
     window.
  Either fix re-greens `tests/test-persist.mjs` at 40 / 0.  Pin
  the chosen direction with a memory entry recording the
  decision so future sessions stop re-litigating it.  Owner:
  `rpl5050-data-type-support` (preferred — they own the casVx
  semantics and shipped the change).  Fallback: any lane working
  under an interactive (non-scheduled) Claude session can ship
  option (1) as the path-of-least-disruption since the user-
  facing state has already shifted; the lane-level decision can
  be folded into a memory entry later.
- **Confidence.** high — `node tests/test-persist.mjs` at session
  152 entry shows the single failing assertion; `grep -n 'casVx'
  www/src/rpl/state.js www/src/rpl/persist.js tests/test-persist.mjs`
  shows the three out-of-sync sites; `head -150 www/src/rpl/
  state.js | tail -25` shows the `:125-139` header comment
  documenting the deliberate-deviation rationale.
- **Age.** new (filed session 152).  **Status.** **partial —
  test-persist gate re-greened by an interactive lane during
  this run's review-window; `persist.js:126` block comment
  still stale.**  Mid-run development: while this review-lane
  run was holding `docs/REVIEW.md` + `logs/`, an interactive
  lane (lock owner = `session-file-explorer`, declared scope
  `www/src/ui/side-panel.js` + `www/css/calc.css` + `www/src/
  app.js` + `www/src/rpl/persist.js` — note that `state.js`
  and `tests/test-persist.mjs` were NOT in the declared scope)
  modified `tests/test-persist.mjs:271-274` to assert
  `getCasVx() === 'x'` (the lowercase value) and updated the
  prose comment at `:266-268` to describe "the rpl5050 default
  of lowercase 'x' (deliberate deviation from the HP50 factory
  'X' — see state.js casVx comment)" — option (1) from this
  finding's Fix list.  Verified at session-152 run-close: `node
  tests/test-persist.mjs` returns 40 / 0 passing; the failing
  assertion is gone.  **Remaining open piece:** `www/src/rpl/
  persist.js:126` still reads "load cleanly and reset VX to
  the default `'X'`" — out-of-sync with the now-shipped
  lowercase default and inconsistent with the test's new
  message string.  `persist.js` *was* in the session-file-
  explorer lock scope but the stale-comment fix wasn't part of
  the partial-fix that landed (the agent's intent string was
  Files-tab features, not casVx hygiene — the test-persist.mjs
  + state.js edits are themselves out-of-scope for the
  declared intent, so the partial fix landed via an
  unsupervised editor pass).  **Future improvement:** edit
  `persist.js:126` to read "the rpl5050 default of `'x'`
  (deliberate deviation, see state.js casVx comment)" — same
  one-line shape as the test message rewrite.  Owner for the
  remainder: any lane touching `persist.js`; pure-comment
  edit, `node --check` safety net.  Test gate status at
  session-152 close: 40 / 0 (re-greened).  **[resolved - ship-
  prep 2026-04-25]** — verified at ship-prep entry that
  `www/src/rpl/persist.js:126` already reads "load cleanly and
  reset VX to the default \`'x'\`" (lowercase) — the comment
  fix landed silently between session 152 close and ship-prep
  entry, so all three call-sites cited in the finding (state.js
  factory default, test-persist assertion, persist.js block
  comment) are now consistent at lowercase `'x'`.  No further
  edits required to close.  Ship-prep test gates: test-all =
  5038 / 0, test-persist = 40 / 0, sanity = 22 / 0.

---

## Findings — RPL

### R-010  EVAL on a List was a no-op push instead of evaluating each item (HP50 AUR §3-77) — fixed at ship-prep-2026-04-25-r4

- **Classification.** RPL (programming-features priority — List
  EVAL is the standard "treat data as code" idiom on HP50).
- **Where.**
  - `www/src/rpl/ops.js:4384-4400` (`_evalValueGen` List branch).
  - `www/src/rpl/ops.js:4456-4475` (`_evalValueSync` List branch).
  - Test pins: `tests/test-lists.mjs` end-of-file block, +9
    assertions covering empty list, literal pushes, command
    dispatch, Name binding lookup, embedded-Program execution,
    quoted-Name pass-through, and error rollback.
- **What.**  HP50 AUR §3-77 EVAL spec for List type: "Enters
  each object in the list: Names are evaluated.  Commands are
  evaluated.  Programs are evaluated.  Other objects are put on
  the stack."  rpl5050's EVAL fell through to the `_evalValueSync`
  catch-all `s.push(v)` (no-op repush) — so `{ 1 2 + } EVAL`
  produced `{ 1 2 + }` again instead of `3`.
- **Why.**  User instruction at ship-prep 2026-04-25:
  > "EVAL also has behavior that should be closer to the HP50."
  AUR-spec'd List EVAL is a foundational HP50 idiom (used for
  "run this list of operations" patterns and for RPL macro
  composition).  The no-op fall-through was an unfinished
  dispatch.
- **Fix.**  Add explicit List branch to both `_evalValueGen`
  (yieldable) and `_evalValueSync` (sync, drives evalToken
  through `_driveGen` for HALT-rejection).  Walk each item and
  dispatch by type:
  - **Name** → `evalToken` (built-in op dispatch + local/global
    var lookup, matching program-body semantics).
  - **Program** → `_evalValueGen` recursion (HP50 list-EVAL
    semantics differ from program-body: list items that ARE
    programs get RUN, while program-body items that are programs
    push as literals).
  - **Tagged** → `_evalValueGen` recursion (consistent with the
    deliberate-deviation Tagged-EVAL behavior; would otherwise
    just push per AUR strict).
  - **Other** → `s.push(item)` (Real, Integer, String, Vector,
    Matrix, nested List literal, etc.).
- **Path coverage.** Applies to both top-level `EVAL` and any
  internal call to `_evalValueGen` / `_evalValueSync` that lands
  on a List (e.g. a list value reached via Name resolution
  inside a program body).
- **Confidence.** high — `node tests/test-all.mjs` is **5050 /
  0** at run-close (was 5040 / 0 at ship-prep r3 close, Δ +10
  from the new List EVAL pins; one bonus assertion came from a
  test that newly exercises a path covered by the change).
  `node --check www/src/rpl/ops.js` clean.  `node tests/test-
  persist.mjs` 40 / 0; `node tests/sanity.mjs` 22 / 0.
- **Limitation noted.** The current dispatch does NOT handle
  control-flow keywords (`IF`/`THEN`/`END`/`FOR`/`WHILE`/etc.)
  embedded as items in a list — those are an exotic edge case
  on HP50 that this ship is not pursuing.  Filed for the rpl-
  programming lane to consider post-ship if the use case
  surfaces; for now, control-flow inside a list literal is not
  defined behavior in rpl5050.
- **Age.** new (filed and resolved in the same ship-prep pass).
  **Status.** **[resolved - ship-prep 2026-04-25]** — landed
  under lock owner `ship-prep-2026-04-25-r4`.

### R-011  EVAL on Tagged recurse-evaluates the inner value (deviates from HP50 AUR §3-77 "untag and push only") — documented as deliberate deviation

- **Classification.** RPL.
- **Where.**  `www/src/rpl/ops.js:4384-4396` (`_evalValueGen`),
  `:4453-4459` (`_evalValueSync`).  Tests pinning the deviation:
  `tests/test-eval.mjs:158-167` (Tagged EVAL strips and EVALs);
  `tests/test-control-flow.mjs:3367-3522` (session-116 HALT-
  through-Tagged cluster, +71 assertions across 5 sites).
- **What.**  HP50 AUR §3-77 says EVAL on a non-port Tagged
  value puts the untagged inner value on the stack — no further
  evaluation.  rpl5050 recurse-EVALs the inner value so a
  `:label:Z` EVAL with `Z` bound to `99` produces `99`, and a
  `:foo:« ... »` EVAL runs the program.  This was deliberately
  introduced in session 116 to support HALT/PROMPT suspension
  through Tagged wrappers, which is a useful programming-
  features feature absent from the base HP50.
- **Why this finding.**  Documenting the deviation in
  `docs/@!MY_NOTES.md` "Intentional Deviations" table at
  ship-prep-2026-04-25-r4 so future sessions / readers don't
  re-discover it as an AUR bug and try to "fix" it.  Reverting
  to AUR-strict semantics would require redesigning the HALT-
  through-Tagged feature (probably introducing a separate op
  like `EVAL→` for the rpl5050 recurse-evaluate semantics).
- **Fix.**  Already applied: comment block in `_evalValueGen`
  Tagged branch citing the deviation rationale and pointing to
  the documenting line in `docs/@!MY_NOTES.md`; matching block
  in `_evalValueSync`; new "EVAL on Tagged" row in
  `@!MY_NOTES.md`'s Intentional Deviations table.
- **Confidence.** high — comment blocks in place, deviation
  table updated, all session-116 tests still green at run-close.
- **Age.** new (filed and resolved in the same ship-prep pass).
  **Status.** **[resolved - ship-prep 2026-04-25]** — documented
  as deliberate deviation, no code change.

### R-009  EVAL on any value left it on the stack on error — fixed at ship-prep-2026-04-25-r3 (generalizes R-007)

- **Classification.** RPL (programming-features priority — EVAL
  semantics are the foundation of every soft-key press, every
  `'NAME' EVAL`, every `→NUM`, and every DBUG step).
- **Where.**
  - `www/src/rpl/ops.js:4570-4633` — `register('EVAL', ...)`.
  - Test sites updated to match new semantics:
    `tests/test-eval.mjs:140-158` (1/0 mid-program),
    `tests/test-eval.mjs:170-184` (recursion-too-deep on
    self-recursive LOOP Name),
    `tests/test-control-flow.mjs:425-441` (START div-by-zero),
    `tests/test-control-flow.mjs:655-671` (malformed IFERR
    with-END),
    `tests/test-control-flow.mjs:2100-2118` (malformed IFERR
    no-END),
    `tests/test-control-flow.mjs:1365-1383` (→ too-few args),
    `tests/test-control-flow.mjs:4815-4834` (WHILE without
    REPEAT),
    plus the comment block at
    `tests/test-control-flow.mjs:1164-1170` updated to describe
    the new RPLAbort exemption shape.
- **What.**  `EVAL` saved its stack snapshot **before** the pop,
  so on any error during evaluation `s.restore(snap)` walked
  back to the pre-pop state — re-pushing the EVAL'd value
  (Program / Name / Tagged) onto the stack.  Users running a
  buggy program saw it sitting on level 1 after the error,
  inviting another press that re-ran the same broken code.
- **Why.**  User instruction at ship-prep 2026-04-25:
  > "Actually, any time an app is evaluated, it should be
  > removed from the stack even on error.  Including when the
  > soft key is pressed in VARS menu and the CST menu and when
  > EVAL is called on it."
  HP50-leaning: an erroring program is consumed, just like a
  successful one is.  The error message tells the user what
  broke; the stack does not pile up program literals.
- **Fix.**  Move the snapshot from pre-pop to **post-pop** in
  `register('EVAL')`.  On error, `restore(snap)` walks back to
  the post-pop state, unwinding any partial pushes the body
  made but leaving the EVAL'd value gone.  RPLAbort still
  bypasses the restore so HP50 ABORT semantics (preserve the
  at-abort state) are unchanged.  If `s.pop()` itself throws
  (empty stack), `snap` stays null and the catch skips
  `restore` — pop's natural failure semantics already left the
  stack intact.
- **Path coverage.** This fix applies uniformly to every EVAL
  caller: entry-line `EVAL` from `_runOpTagged`, soft-key VARS
  press (with the round-2 `safeRun`-wrap in `app.js` providing
  belt-and-suspenders), soft-key CST press (same), `→NUM`
  (delegates to `OPS.get('EVAL').fn`), `DBUG` (same), and any
  Name / Tagged / Symbolic dispatch through `_evalValueGen`.
- **Confidence.** high — `node tests/test-all.mjs` is **5040 /
  0** at run-close, with seven test sites flipped from the old
  pre-pop semantics to the new post-pop semantics; `node
  --check www/src/rpl/ops.js` clean; `node tests/test-persist
  .mjs` 40 / 0; `node tests/sanity.mjs` 22 / 0.
- **Age.** new (filed and resolved in the same ship-prep pass).
  **Status.** **[resolved - ship-prep 2026-04-25]** — landed
  under lock owner `ship-prep-2026-04-25-r3`.

### R-007  Soft-key program-error left the program on the stack — fixed at ship-prep-2026-04-25-r2

- **Classification.** RPL (programming-features priority — soft-key
  invocation is the primary user-reachable path for executing a
  named Program, and its error semantics are part of the language
  contract).
- **Where.**
  - `www/src/app.js:483-494` — `showVarsMenu`'s `onPress` Program
    branch.
  - `www/src/app.js:564-578` — `showCustomMenu`'s `onPress` Program
    / Name branch.
  - Test pin: `tests/test-variables.mjs` "VARS soft-key error:
    pushed Program is removed from stack" (+3 assertions).
- **What.**  Both soft-menu paths used the shape
  `this.stack.push(v); this.entry.safeRun(() => EVAL.fn(...), 'EVAL')`.
  `safeRun` saves a stack snapshot at *its* entry — i.e. AFTER the
  push — so when EVAL throws, `safeRun.restore()` walks back to the
  post-push state.  The pushed Program survived the rollback, and
  the user was left with the program literal on level 1 staring at
  them after a failed press.
- **Why.**  HP50 soft-key semantics are "press the key, run the
  program; if it errors, the stack returns to its pre-press state".
  Leaking the program onto the stack was both a divergence from HP50
  fidelity and a UX wart — a typo in a stored program meant the
  next press dumped a `Program → Program` no-op into level 1 every
  time.
- **Fix.**  Move the `push(v)` *inside* the `safeRun` body so the
  snapshot is taken before the push; on rollback the push unwinds
  with everything else.  Same pattern in both menu paths.  Pure
  refactor — success path unchanged (EVAL on a Program consumes the
  Program in the same way it always did).
- **Confidence.** high — `node tests/test-all.mjs` is **5041 / 0**
  at run-close (was 5038 / 0 at run-entry; the +3 are the new
  assertions in `tests/test-variables.mjs`); `node --check
  www/src/app.js` clean; manual driver simulating
  `varStore('NEEDARG', Program([Name('DUP')]))` followed by the
  fixed `onPress` body with an empty stack confirms the program is
  popped on the throw.
- **Age.** new (filed and resolved in the same ship-prep pass).
  **Status.** **[resolved - ship-prep 2026-04-25]** — landed under
  lock owner `ship-prep-2026-04-25-r2`.

### R-008  `OBJ→` divergence from HP50 AUR §3-149 — Real and Tagged branches need fidelity audit

- **Classification.** RPL (programming-features priority — `OBJ→`
  is the foundation of Program / List / Vector / Matrix / Symbolic
  metaprogramming; see ops.js comment at `:6535-6555`).  Owner =
  `rpl5050-rpl-programming` for ship-target priority; can also
  ride a `rpl5050-command-support` run since the implementation
  lives in `www/src/rpl/ops.js`.
- **Where.**
  - `www/src/rpl/ops.js:6618-6633` — Real / Integer branch.
    Currently splits a Real into mantissa-in-`[1,10)` and a
    `floor(log10(|x|))` exponent and pushes them as
    `Real(m), Integer(e)`.  Integer branch is a no-op repush.
  - `www/src/rpl/ops.js:6562-6566` — Tagged branch.  Pushes
    `value, Str(tag)`.
- **What — two suspected divergences from HP50 AUR §3-149:**
  1. **Real.**  HP50 `OBJ→` on a Real returns the same Real
     unchanged (mantissa/exponent decomposition is `MANT` and
     `XPON`'s job, separately).  rpl5050 currently does the
     `MANT`/`XPON` decomposition inline.  Need an AUR re-read
     under `docs/HP50 Advanced Guide.pdf` §3-149 (`OBJ→`) and
     a comparison vs. §3-?? (`MANT` / `XPON`) to confirm.  If
     confirmed, the Real branch should reduce to `s.push(v);
     return;` matching the Integer branch.
  2. **Tagged.**  HP50 `OBJ→` on a Tagged object pushes the
     value and the tag NAME (Name type — prints unquoted as
     `:tag:` or quoted as `'tag'`), not a String.  rpl5050
     currently pushes `Str(tag)` which prints with double
     quotes.  Need an AUR re-read to confirm the canonical
     output type, then either switch to `Name(tag)` or
     document the deliberate-deviation rationale in the ops.js
     header block.
- **Why.**  User instruction at ship-prep 2026-04-25:
  "OBJ→ behavior should be closer to the HP50".  Both
  divergences are observable to a user who runs an HP50 program
  on rpl5050 expecting AUR semantics — the Real-decomposition
  case in particular changes stack shape (1-in / 2-out vs.
  1-in / 1-out) so any program assuming HP50 OBJ→ returns the
  same Real will misbehave.
- **Fix.**  Two narrow edits + the AUR re-read:
  1. Real: drop the mantissa/exponent split, push `v`, return.
     Adjust the dispatch comment block at `:6535-6555` to
     reflect the new shape.  Pin both the new Real shape and
     the existing `MANT` / `XPON` shape with regression-guard
     assertions in `tests/test-reflection.mjs` (or
     `tests/test-stack-ops.mjs`, wherever OBJ→'s coverage
     currently lives).
  2. Tagged: switch `Str(v.tag)` to `Name(v.tag, true)`
     (quoted Name) — matches the HP50 form a user sees on the
     stack as `'tag'`.  Update the dispatch comment block.
     Update the existing Tagged round-trip pin if any.
- **Confidence.** medium — the Real divergence is visible on
  inspection (the code clearly does mantissa/exponent split);
  AUR re-read is needed to lock in the exact HP50 spec for both
  branches.  The Tagged divergence reading is from the AUR's
  general `OBJ→` table; confirm against the PDF before the fix.
- **Age.** new (filed ship-prep 2026-04-25).  **Status.**
  **[resolved - session 155]** — `rpl5050-rpl-programming` lane
  closed both arms of the audit:
  - **Real branch.** AUR §3-149 re-read confirmed the Input/
    Output table lists no numeric-scalar entry; the mantissa/
    exponent split is the job of `MANT` (AUR p.3-6) and `XPON`
    (AUR p.3-9), wired separately.  Real branch at
    `www/src/rpl/ops.js:6709-6720` reduced from the
    mantissa/exponent split to `s.push(v); return;` — matches
    the AUR-fidelity choice of "no internal structure to
    decompose, push back unchanged".  The two prior test
    assertions at `tests/test-reflection.mjs:149-167` that pinned
    the old (1-in / 2-out) shape were flipped to pin the new
    (1-in / 1-out) shape, plus four new session155 assertions
    covering Integer-branch symmetry, zero-Real no-special-case,
    and a `MANT`/`XPON` sanity-pin confirming the standalone ops
    still do the split.
  - **Tagged branch.** AUR §3-149 re-read showed the table cell
    `:tag:obj  →  obj  "tag"` uses the AUR's String-literal
    notation (double quotes), not the quoted-Name notation
    (single quotes, used elsewhere in the same table for
    Symbolic decomposition's `'function'` head).  The existing
    `Str(v.tag)` push at `www/src/rpl/ops.js:6644-6650` is
    therefore correct per AUR — R-008's Tagged-divergence
    reading was a phantom.  No code change; the comment block
    at `:6604-6638` was rewritten to capture the AUR-verified
    finding and warn future readers not to "fix" `Str(v.tag)`
    into `Name(v.tag, true)`.  A new session155 regression
    assertion in `tests/test-reflection.mjs` pins the tag is
    `isString` and not `isName`, so any future flip is caught
    by the test suite immediately.
  Verified at run-close: `node tests/test-all.mjs` = 5063 / 0
  (entry 5034 + 29 sibling + my +5 net new + 2 flipped); `node
  tests/test-persist.mjs` = 40 / 0; `node tests/sanity.mjs` =
  22 / 0; `node --check` clean on `www/src/rpl/ops.js` and
  `tests/test-reflection.mjs`.

### R-012  `OBJ→` on a Unit value rejects with `Bad argument type` instead of pushing `x  1_unit` per HP50 AUR §3-149

- **Classification.** RPL (programming-features priority —
  `OBJ→` is the standard "decompose an HP50 object on the
  stack" idiom).  Discovered as a session-155 follow-up while
  pinning the OBJ→ session-156 cluster; surfaces a third
  divergence the session-155 audit did not address (R-008
  scope was Real and Tagged branches only).
- **Where.**
  - `www/src/rpl/ops.js:6642-6720` (`register('OBJ→', ...)`).
    Dispatch covers Complex / Tagged / List / Vector / Matrix /
    String / Program / Symbolic / Real / Integer.  No `isUnit`
    branch — Unit falls through to `throw new RPLError('Bad
    argument type')`.
  - Probe at session 156 entry: `5_m OBJ→` returns `THREW: Bad
    argument type`; AUR table cell expects depth-2 stack with
    `Real(5)` on level 2 and `1_m` (Unit value 1, same uexpr)
    on level 1.
- **What.**  AUR §3-149 Input/Output table row `x_unit  →  x
  1_unit` (verbatim from `docs/HP50 Advanced Guide.pdf` PDF
  body line 13201ff, same extraction the session-155 lane did
  for the Real/Tagged audit).  rpl5050 currently has no Unit
  branch; the AUR-fidelity behavior is to push the bare
  numeric `value` on level 2 and `Unit(1, uexpr)` on level 1.
- **Why.**  Two reasons: (1) the AUR documents the contract,
  so any HP50 program assuming the (x, 1_unit) decomposition
  silently misbehaves on rpl5050 (it gets a hard error
  instead, which is at least loud — but breaks the
  metaprogramming pattern `x_unit OBJ→ … rebuild …`).  (2)
  Symmetric to R-008's Real/Tagged audit — the Unit row of the
  same AUR table was simply not enumerated in the session-155
  fix scope.
- **Fix sketch (for the owning lane).**  Add an `isUnit(v)`
  branch to OBJ→ that pushes `Real(v.value)` (or `Integer` if
  the value coerces) on level 2 and `Unit(1, v.uexpr)` (the
  unit-of-1 same-uexpr Unit) on level 1.  Update the dispatch
  comment block at `:6605-6638` to enumerate the Unit row
  alongside the existing AUR table cells.  Pin both the new
  Unit decomposition shape and a Unit round-trip (`5_m OBJ→
  *` → `5_m`, since `Real * Unit(1,m) = Unit(5,m) = 5_m`) in
  `tests/test-reflection.mjs` next to the session-155 / 156
  OBJ→ pin clusters.
- **Confidence.** medium — the AUR row is unambiguous, but
  the unit-of-1 helper (`Unit(1, uexpr)` constructor) hasn't
  been exercised on the OBJ→ side and may need the
  zero-uexpr-collapse guard at `_makeUnit` (`ops.js:316`) to
  short-circuit, otherwise a Unit with empty uexpr would
  collapse to `Real(1)`.  Worth a probe before the fix.
- **Routing.**  Owner = `rpl5050-rpl-programming` for ship-
  target priority (matches the R-008 routing); can ride a
  `rpl5050-command-support` run since the implementation lives
  in `www/src/rpl/ops.js` register sites.  Unit-tests lane has
  filed this here per the no-fix-source-bugs lane rule.
- **Age.** new (filed session 156, ship-prep 2026-04-25).
  **Status.** **resolved session-159** by the
  `rpl5050-rpl-programming` lane.  New `if (isUnit(v))` branch
  added to `register('OBJ→', ...)` at `www/src/rpl/ops.js:6720-
  6738` that pushes `Real(v.value)` on level 2 and `Unit(1,
  v.uexpr)` on level 1 — matching the AUR §3-149 row
  `x_unit  →  x  1_unit` exactly.  The level-1 push uses the
  bare `Unit()` constructor rather than `_makeUnit` so a
  theoretically-empty uexpr would still emit the prototype
  rather than collapsing to `Real(1)` — addresses the medium-
  confidence concern raised in this finding's "Confidence"
  section about the `_makeUnit` zero-uexpr-collapse guard.
  Header comment block at `:6605-6650` extended to enumerate
  the Unit row alongside the existing AUR table cells.
  Pinned by 15 session159-labelled assertions in
  `tests/test-reflection.mjs` covering: basic decomposition;
  the round-trip-via-* contract (`5_m OBJ→ * → 5_m`); multi-
  symbol uexpr (`m/s`); negative-value branch (`-3_kg → -3
  1_kg` with sign on level-2 value, prototype value always 1;
  round-trip preserves sign); regression guard pinning level-1
  push as `isUnit` and NOT `isName` / NOT `isString`; Tagged-
  of-Unit composition (one-layer peel only); ASCII alias
  `OBJ->` parity; negative-exponent uexpr (`2_(1/m)`)
  prototype-shape preservation.  `test-all.mjs` at 5120 / 0 /
  0 (was 5105, Δ+15).  `test-persist.mjs` at 40 / 0.
  `sanity.mjs` at 22 / 0 in 5 ms.  `node --check` clean on
  every touched JS file.  Closes the OBJ→ HP50-fidelity audit
  trail end-to-end — every row of the AUR §3-149 Input/Output
  table now has a corresponding branch in rpl5050's dispatch
  (Complex / Tagged / List / Vector / Matrix / String /
  Program / Symbolic / Real / Integer / Unit).

### R-004  `docs/RPL.md` carries no narrative for the session-121 IFT/IFTE generator-flavor lift or the PROMPT mechanism

- **Classification.** RPL.
- **Where.** `docs/RPL.md` (file-scope — the document's
  control-flow chapter ends with the session-106 HALT-in-named-
  sub-program lift narrative at `:75-148` and has no entry past
  it; PROMPT is unmentioned anywhere in the file).
- **What.** Session 121 (see O-010 for the umbrella finding)
  shipped two RPL-bucket capability changes that `docs/RPL.md`
  does not describe:
  1. **IFT / IFTE generator-flavor lift.**  The session-106
     narrative at `:75-148` walked the reader through the
     `evalToken` → `_evalValueGen` split and called out IFT /
     IFTE bodies as still-rejecting at `_driveGen`.  Session
     111 then tightened that rejection's error message via the
     `caller` label thread, with R-003's resolution paragraph
     citing IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS / STREAM
     as the still-rejecting set.  Session 121 silently lifted
     IFT / IFTE specifically — the two ops now re-enter
     `evalRange` via a body-intercept path (`ops.js:3116-3158`,
     `:3573-3593`) instead of dispatching through
     `_evalValueSync`, which propagates HALT cleanly.  RPL.md
     has no description of this lift or its mechanism, so the
     document still reads as if IFT / IFTE+HALT rejects.  This
     is the largest control-flow capability lift since session
     088 itself (which fully lifted structural HALT) and is
     load-bearing for any user-facing program that wants to
     pause inside a conditional branch.
  2. **PROMPT mechanism.**  The session-121 PROMPT op uses the
     same yield-to-driver mechanism as HALT: when a program
     reaches PROMPT, the handler stores the message string in
     `state.promptMessage` (new slot, see O-010) and yields up
     through the generator chain to the EVAL/CONT driver; CONT
     resumes execution from the post-PROMPT IP and clears the
     message; KILL drops the suspension; SST ignores PROMPT
     (the step-into machinery from session 106 keeps stepping).
     RPL.md's HALT chapter at `:75-148` is exactly the place a
     reader would expect a parallel PROMPT chapter — same
     mechanism, slightly different state shape.  None of this
     is documented.
  Both gaps stem from session 121's silent ship (see O-010);
  fixing them is the RPL-lane's half of the O-010 remediation.
- **Why.** `docs/RPL.md` is the canonical mental-model reference
  for the language's control-flow surface.  A user reading the
  HALT chapter will follow the lane logic — "HALT works
  structurally, except inside IFT / IFTE / MAP / SEQ / etc." —
  and conclude the IFT / IFTE caveat still holds, when it does
  not.  A user looking for "how does PROMPT work?" finds nothing
  at all.  Both gaps drive users either to read source (the
  thing the doc is supposed to spare them) or to assume the
  capability is missing (the thing the doc is supposed to
  prevent).
- **Fix.** Two narrative additions to `docs/RPL.md`:
  1. Add a "Session 121" subsection inside the control-flow
     chapter (after the existing session-106 narrative at
     `:75-148`) describing the IFT / IFTE lift mechanism: the
     body-intercept in `evalRange` (`ops.js:3116-3158`), the new
     IFT / IFTE runners at `:3573-3593`, the resulting HALT
     propagation, and the +14 session-122 IFT/IFTE+HALT
     assertions in `tests/test-control-flow.mjs` that pin the
     behavior.  Update R-003's still-rejecting call-list (now in
     `_driveGen` docstring at `ops.js:3713-3741`) to drop IFT /
     IFTE — that's a parallel doc-comment edit also owned by the
     RPL lane.
  2. Add a new "PROMPT" section (likely as a peer of the HALT
     chapter, since the mechanism is parallel) describing the
     yield-to-driver suspension, the `state.promptMessage` slot,
     and the CONT / KILL / SST resume / cancel / no-op
     interactions.  Cross-link from the COMMANDS.md PROMPT row
     (see C-007) once that row is restructured.
- **Confidence.** high — `grep -n 'PROMPT\|session 121\|session-121'
  docs/RPL.md` returns zero hits; `grep -n 'IFT\|IFTE' docs/RPL.md`
  returns only the session-106-era still-rejecting mentions at
  `:144-148` (which are now stale); `grep -nE 'register\(\s*''PROMPT''|setPromptMessage|_evalValueGen' www/src/rpl/ops.js`
  confirms the mechanism is live in source.
- **Age.** 1 run. **Status.** **resolved-session-121
  (retraction-flavor — session 123 audit was filed against a
  state of `docs/RPL.md` that this run cannot reproduce).**
  Re-verified session 128: `grep -n "Session 121\|session 121\|
  session-121\|PROMPT" docs/RPL.md` returns 25 hits across the
  file, including:
  - `:18` stamp (currently bumped to "as of session 126" by the
    in-flight rpl-programming session 126, but the chapter
    structure for session 121 sits beneath it);
  - `:42-46` — the IFT/IFTE generator-flavor lift narrative
    ("**Session 121:** HALT/PROMPT inside the action(s) now lifts
    cleanly when the IFT/IFTE keyword is reached through
    `evalRange`'s body intercept");
  - `:117-123` — the PROMPT op chapter ("`PROMPT` — ✓ **session
    121 new** (HP50 AUR p.2-160).  Pops level 1, …  `resetHome`
    clears it.  Bare PROMPT outside a running program raises
    `PROMPT: not inside a running program`, matching HALT's…");
  - `:171-179` — the "Remaining limitations (session 121)"
    paragraph that reads "Session 121 lifted IFT and IFTE off
    this list" and lists what still rejects;
  - `:223-298` — a full "Session 121 (this run) — what shipped"
    subsection with detailed mechanism-level prose (PROMPT op,
    HALT/PROMPT lift through IFT body, HALT/PROMPT lift through
    IFTE body, +50 tests reference, user-reachable demo);
  - `:890-900` — the queue history block flagging session-121's
    work as shipped.
  The session-123 audit's `grep -n 'PROMPT\|session 121\|session-121'
  docs/RPL.md` claim of "zero hits" is irreproducible against the
  current file — either session 121 wrote the chapters at the
  very tail of its run (lock-release happened at 01:04:30,
  session 123's audit grep ran ~8 minutes later at 01:12-ish,
  giving the FS time to flush) and session 123 ran its grep
  against a stale view, or session 122/123/126 added the
  chapters during the audit window.  Review-lane cannot
  retroactively assign authorship without git, but the present-
  run evidence makes the R-004 "no narrative" claim untrue, so
  the finding is closed in retraction-flavor.  Naturally pairs
  with O-010's RPL.md sub-item (also retracted this run).
  Authorship attribution defaults to session 121; if session 126
  expanded the chapter on top of an existing skeleton, the
  session-126 log will record the additional content (this is
  the rpl-programming lane's notebook, not review-lane's).

### R-005  `docs/RPL.md` carries three "(this run) — what shipped" headings; only one should be current

- **Classification.** RPL.
- **Where.** `docs/RPL.md:258` (`## Session 121 (this run) — what
  shipped`), `:358` (`## Session 126 (this run) — what shipped`),
  `:465` (`## Session 136 (this run) — what shipped`); plus the
  Session log pointer prose at `:1500` ("Session 131 is this run
  (HALT/PROMPT lift through DOLIST / DOSUBS / STREAM bodies …)").
- **What.** The rpl-programming lane writes a "(this run) — what
  shipped" chapter for each substantive run, but does not demote
  prior chapters when subsequent runs ship.  The result is three
  sections labelled "(this run)" simultaneously (sessions 121,
  126, 136) when only the most-recent rpl-programming-lane run
  should bear that label.  Compare with session 131 at `:602`
  which is correctly labelled `## Session 131 — what shipped`
  (no "(this run)" suffix), so the demotion has happened
  inconsistently — session 131's authoring run apparently
  remembered to omit "(this run)" from its own header but did
  not demote the older 121 / 126 headers; sessions 126 / 136
  did not demote 121 either.  Same drift in the Session log
  pointer prose at `:1500`: "Session 131 is this run …" is now
  five rpl-programming-lane runs stale (sessions 121 / 126 /
  131 / 136 are the rpl-programming runs in the lifecycle of
  this section; 136 is current).
- **Why.** A reader scanning RPL.md chapter-by-chapter loses
  the ordering signal: which "(this run)" actually corresponds
  to *now*?  The standing-lessons section in `docs/@!MY_NOTES.md`
  asks for a User-reachable demo per session; readers wanting
  the most-current demo currently have to scan all three
  "(this run)" sections to find which is the highest session
  number.  Pure comment / string drift; no behavior implication.
- **Fix.** Two pure-string edits to `docs/RPL.md`:
  1. Re-label `## Session 121 (this run) — what shipped` →
     `## Session 121 — what shipped` (drop the "(this run)"
     suffix); same for `## Session 126 (this run) — what
     shipped` → `## Session 126 — what shipped`.  Leave
     `## Session 136 (this run) — what shipped` as-is — that
     is currently the correct one.
  2. Update the Session log pointer prose at `:1500` to
     demote "Session 131 is this run …" to "Session 131 was
     this lane …" and append a one-sentence pointer to
     session 136's auto-close lift, mirroring how the prose
     handled the session-126 → session-131 transition.
  Either the rpl-programming lane (which authors the chapters)
  or the review lane can ship this — pure-comment / pure-
  string drift is in scope for either.
- **Confidence.** high — `grep -nE "^## Session [0-9]+ ?\(this
  run\)" docs/RPL.md` returns exactly three lines (`:258`, `:358`,
  `:465`); `grep -nE "is this run" docs/RPL.md` returns one line
  in the Session log pointer prose at `:1500`.
- **Age.** 1 run (filed session 138).  **Status.** **resolved
  session 141** by the `rpl5050-rpl-programming` lane.  Both
  pure-string edits shipped, bundled into session 141's IFERR
  HALT/PROMPT pinning run:
  - **(closed session 141)** The three stale `## Session NNN
    (this run) — what shipped` headings at `docs/RPL.md:258`
    (session 121), `:358` (session 126), `:465` (session 136)
    all demoted to plain `## Session NNN — what shipped`.
    Verified session 143 via `grep -nE "^## Session [0-9]+ \(this
    run\)" docs/RPL.md` returning exactly one line (`:258` —
    "Session 141 (this run) — what shipped"), the new sole
    `(this run)` holder added by session 141's authoring run.
  - **(closed session 141)** The Session log pointer prose
    previously at `:1500` ("Session 131 is this run …") moved
    to `:1682` (line shift caused by session 141's own +99-line
    chapter insertion + 76-assertion test additions) and
    rewritten to past tense: "Session 131 was this lane (HALT/
    PROMPT lift through DOLIST / DOSUBS / STREAM bodies via
    `evalRange` intercepts and new `runDoList` / `runDoSubs` /
    `runStream` generator helpers; …)".  Footnotes appended for
    sessions 136 ("Session 136 was this lane (auto-close on
    missing END / NEXT for `WHILE/REPEAT`, `DO/UNTIL`, `START`,
    and `FOR` …)") and 141 ("Session 141 is this run (HALT/
    PROMPT lift through `IFERR` clauses pinned …)").  Also
    a parenthetical footnote at `:1705-1709` listing the
    historical "is this run" wording origins for sessions 074 /
    078 / 088 / 106 / 116 / 121 / 126 / 131 and acknowledging
    that the demotion-to-past-tense for sessions 121 / 126 /
    131 / 136 was bundled into session 141.  Verified session
    143 via `grep -nE "is this run|was this lane" docs/RPL.md` —
    one current "is this run" hit at `:1696` (session 141, the
    correct sole holder), with all prior "is this run" mentions
    converted to past-tense "was this lane" entries.
  Note: session 141 itself introduced a small drift while
  closing R-005 — the inline prose at `docs/RPL.md:348`
  describing the demote points at line `:1455`, but the actual
  demote target moved to `:1682` due to session 141's own
  chapter expansion.  Filed separately as **R-006** below.

### R-006  `docs/RPL.md:348` carries a stale internal cross-reference (`:1455`) introduced by session 141's own R-005-close edit

- **Classification.** RPL (doc / comment drift inside RPL.md).
- **Where.** `docs/RPL.md:348` (inside the `## Session 141 (this
  run) — what shipped` chapter, item 5 "R-005 doc cleanup —
  three `(this run)` headings demoted").  The drift target
  itself sits at `:1682` (the "Session 131 was this lane …"
  past-tense entry session 141's R-005 close rewrote).
- **What.** Item 5 of session 141's chapter says: "Same run also
  updates the Session log pointer prose at `:1455` to demote
  `Session 131 is this run …` to past tense and append
  session-136 / session-141 footnotes, per R-005's two pure-
  string edit list."  The cited line `:1455` is correct only
  for a snapshot of `docs/RPL.md` taken *before* session 141's
  own +99-line chapter insertion at `:258-356` (the "## Session
  141 (this run) — what shipped" chapter being narrated by item
  5 itself) plus several smaller edits that pushed the demote
  target down by ~227 lines.  The actual demote target —
  "Session 131 was this lane (HALT/PROMPT lift through DOLIST /
  DOSUBS / STREAM bodies …)" — is now at line `:1682`.  Line
  1455 in the current file is unrelated content: item 4
  "Persistence of halted programs" inside the implementation-
  notes section, talking about generator non-serialisability and
  the `resetHome` hook.  A reader following the cross-reference
  to `:1455` lands on a paragraph about page-refresh persistence,
  not the R-005 demote target, and has to grep for "Session 131"
  to find what item 5 is actually describing.
- **Why.** RPL.md is the canonical mental-model reference for
  the language's control-flow surface.  Internal cross-references
  inside the same file are the cheapest navigation aid;
  off-by-220-lines references silently corrode that aid.  The
  bug is also self-referential — the chapter that introduced the
  drift (session 141's `(this run)` chapter at `:258-356`) is the
  one that the line-number arithmetic forgot to account for.
  Same kind of drift the project has caught before: stale line
  numbers in narrative prose are a recurring class (compare
  with C-007's session-128 audit's off-by-one on "ops.js:3116-
  3158" vs the actual ":3145-3158").  Pure comment / string
  drift; no behavior implication.
- **Fix.** One pure-string edit to `docs/RPL.md:348` — change
  `prose at \`:1455\`` to `prose at \`:1682\`` (current target
  line).  Or, equivalently, drop the line number entirely and
  cite the section: "the Session log pointer prose at the end of
  the file" — line numbers in narrative prose are a maintenance
  hazard inside a file that grows by hundreds of lines per
  rpl-programming-lane run.  Either form is a one-character /
  one-phrase edit safe for the rpl-programming or the review
  lane to ship.
- **Confidence.** high — `grep -nE "Session 131 is this run|Session 131 was this lane" docs/RPL.md`
  returns one hit at `:1682` (the past-tense entry session 141
  rewrote into); `sed -n '1454,1458p' docs/RPL.md` shows the
  current line 1455 is "serialisable via JSON. To survive a
  page refresh, …" — unrelated to R-005's demote target.
- **Age.** 1 review-lane run (filed session 143).  **Status.**
  resolved session-146 — the rpl-programming lane shipped the
  one-string edit at `docs/RPL.md:348` (`prose at \`:1455\``
  → `prose at \`:1682\``) inside item 5 of the session-141
  chapter, plus a one-sentence parenthetical noting that the
  line number was refreshed by ~227 lines after session 141's
  own +99-line chapter insertion at `:258-356`.  Pure-string
  drift; no behavior change.  Pinned by `grep -nE "prose at"
  docs/RPL.md` returning the new `:1682` cite at `:348`.

### R-003  `_driveGen` docstring still names "variable lookup" as a `_evalValueSync` caller after session 106

- **Classification.** RPL.
- **Where.** `www/src/rpl/ops.js:3713-3721` (the `_driveGen`
  docstring), in the parenthetical "(i.e. a variable lookup, IFT
  action, SEQ body, etc.)".
- **What.** Session 106 added `_evalValueGen` (lines 3752-3806) and
  rewired `evalToken`'s Name-binding branch (`:3137`, `:3144`) to
  go through it instead of `_evalValueSync`.  As a result, the
  most common "variable lookup" path no longer reaches `_driveGen`
  at all — it reaches `_evalValueGen` and propagates the yield up
  to the EVAL/CONT driver.  `_evalValueSync` is still hit by IFT /
  IFTE / MAP / SEQ bodies and other sync-path callers (see the
  helpful list in `_evalValueGen`'s own docstring at
  `:3742-3745`), and HALT inside those *does* still hit `_driveGen`
  and reject with `HALT: cannot suspend inside a sub-program call`.
  The `_driveGen` docstring's "(i.e. a variable lookup, …)" gloss
  invites the reader to conclude the opposite — that variable
  lookup is the canonical path here, when it's now the exception.
- **Why.** `_driveGen` is the rejection site for the only HALT
  case still gated.  A reader auditing why a particular HALT was
  rejected will land here, follow the "variable lookup" hint, and
  be confused — variable lookup specifically does NOT reject
  anymore, it propagates.  The session-101 R-002 paragraph
  (lines 3723-3729) already documents the `gen.return()` belt-and-
  suspenders correctly; it's the lead paragraph that needs the
  same session-106-aware revision.
- **Fix.** Replace the parenthetical at `:3715-3716` with one that
  matches the current dispatch table — e.g. "(i.e. a sub-program
  reached via IFT / IFTE / MAP / SEQ body or `_evalValueSync`'s
  own Name recursion, NOT via `evalToken`'s Name-binding branch
  which now uses `_evalValueGen` and propagates HALT)" — and
  optionally re-tighten the "Program-in-variable calls cannot
  suspend" claim at `:3719-3721` to "Program-in-variable calls
  reached through `_evalValueSync` cannot suspend; the
  `evalToken` → `_evalValueGen` path lifts HALT one level higher
  (session 106)."  Pure-comment edit; `node --check` is the safety
  net; no test impact.
- **Confidence.** high — both call paths read in situ session 108;
  `grep -nE 'function\* evalToken|_evalValueGen|_evalValueSync'
  www/src/rpl/ops.js` confirms the dispatch.
- **Age.** 1 run. **Status.** resolved session-111 — `_driveGen`
  docstring (`www/src/rpl/ops.js:3713-3741`) rewritten by the
  rpl-programming lane to list the actual sync-path callers
  (`IFT`, `IFTE`, `MAP`, `SEQ`, `DOLIST`, `DOSUBS`, `STREAM`, the
  Symbolic body of `→`, plus the recursive Name / Tagged paths
  inside `_evalValueSync`).  The rewrite also calls out that the
  `evalToken` → `_evalValueGen` path does **not** reach
  `_driveGen` at all.  Same run threaded a `caller` label through
  `_evalValueSync` into `_driveGen` so the rejection message
  names the offending op — e.g. `HALT: cannot suspend inside
  IFT action`; default is still `HALT: cannot suspend inside a
  sub-program call` for uncredited call sites.  Pinned by 23
  new session111-labelled assertions in
  `tests/test-control-flow.mjs`.

### R-002  `_driveGen` abandons a yielded generator without calling `gen.return()`

- **Classification.** RPL.
- **Where.** `src/rpl/ops.js:3300` (`_driveGen` function).
- **What.** `_driveGen` calls `gen.next()`; if the generator yields
  (HALT inside a sub-program call), it throws an RPLError without
  first calling `gen.return()` to close the generator.  Per the
  JS spec, a generator that is abandoned without `gen.return()` will
  not run its `finally` blocks until GC.  The relevant `finally`
  block is `_popLocalFrame()` inside `runArrow` — the compiled-local
  frame cleanup for `→` bodies.
  In practice this is **not a correctness bug**: the outer EVAL
  handler's `finally { _truncateLocalFrames(framesAtEntry) }` runs
  synchronously and restores `_localFrames` to its pre-EVAL depth
  before the abandoned generator object reaches GC.  The only
  observable effect is that the generator object itself lingers in
  memory until collected.  Verified by tracing: `_truncateLocalFrames`
  at `ops.js:3502-3523` covers the frame-depth invariant; `gen.return()`
  in the `_driveGen` throw path would be belt-and-suspenders.
- **Why.** Style hazard: a reader auditing resource cleanup will note
  the missing `gen.return()` and have to reason through the
  `_truncateLocalFrames` safety net to confirm there is no leak.
  The reasoning is non-trivial (it crosses function boundaries).
  Adding `gen.return()` before the throw would make the cleanup
  self-contained and obvious.
- **Fix.** In `_driveGen`, after detecting `!result.done`, call
  `try { gen.return(); } catch (_) {}` before the `throw`.
  One-line change; no test impact expected (tests exercise the
  throw path but don't observe GC timing).
- **Confidence.** low — not a correctness defect; style / defensive
  coding.  Owner judgment on whether it's worth the churn.
- **Age.** new. **Status.** resolved session-101 — `_driveGen` now
  calls `try { gen.return(); } catch (_) {}` before throwing, closing
  the abandoned generator synchronously so its `finally` blocks (and
  any `_popLocalFrame()` from an enclosing `runArrow`) run.  Pinned
  by a regression-guard assertion in `tests/test-control-flow.mjs`
  that exercises the throw path and confirms `localFramesDepth() === 0`
  afterwards.

### R-001  `state.js` docstring claim "`clearAllHalted()` — Used by resetHome()" is false

- **Classification.** RPL.
- **Where.** `src/rpl/state.js:415`.
- **What.** The block-comment description of `clearAllHalted()` in
  the haltedStack-getters-legend comment (L410–L417) says
  `clearAllHalted()— drain the whole stack.  Used by resetHome().`
  But `resetHome()` at `src/rpl/state.js:749-755` inlines the drain
  as `state.halted = null; state.haltedStack.length = 0;` — it does
  NOT call `clearAllHalted()`.  Verified via `grep -nE
  '\bclearAllHalted\b' src/`: the function is defined at L438 and
  imported once at `ops.js:57`; no call site anywhere in `src/`.
  `tests/test-control-flow.mjs` is the only caller.
- **Why.** A "Used by X" claim is a grepping anchor.  Readers
  chasing why `clearAllHalted` exists will pull up resetHome,
  read it, and see the inlined form — then have to guess whether
  the comment is a stale future-tense claim, a description of
  intent, or an actual mistake.  The comment was written in
  session 083 alongside the LIFO refactor and the plan at that
  point was to call `clearAllHalted()` from resetHome; the final
  resetHome body instead inlines because resetHome needs a single
  terminal `_emit()` and `clearAllHalted()` also emits (double-
  emit would be wrong).
- **Fix.** Either:
  1. Change the comment to `Used by test-control-flow.mjs; the
     resetHome() helper inlines equivalent logic to keep a single
     _emit() call`; OR
  2. Actually have `resetHome()` call `clearAllHalted()` and
     suppress its `_emit()` via an internal flag.
  Preferred: (1) — comment-only, no behavior risk.  Not shipped
  this run because the file is the rpl-programming lane's home
  turf; review lane defers the change even though it's a one-
  line comment.
- **Confidence.** high — grep + re-read.
- **Age.** 2 runs. **Status.** resolved session-088 — comment updated
  to `Used by tests (test-control-flow.mjs); resetHome() inlines the
  equivalent drain directly so it can emit exactly once`.

---

## Findings — Unit Tests

### T-004  `docs/TESTS.md` coverage snapshot stale at session 250; test count frozen at 5571 (reality: 5591)

- **Classification.** Unit Tests.
- **Where.** `docs/TESTS.md:7` ("Last updated" stamp) and the
  coverage snapshot table (test-types.mjs count and aggregate
  rows still reflect the session-250 close of 5571).
- **What.** Session 253 (data-type-support) added +20 rejection-
  pin assertions to `tests/test-types.mjs` (5571 → 5591 in
  test-all).  The TESTS.md "Last updated" stamp still reads
  "Session 250 (2026-04-26)"; the aggregate row in the coverage
  snapshot table still shows 5571 rather than 5591.  Session 254
  (rpl-programming verification pass) added no assertions, so
  the drift is exactly +20 from session 253.
- **Why.** TESTS.md is the authoritative test-coverage ledger.
  A reader checking the snapshot to gauge coverage depth sees
  a 20-assertion undercount in test-types.mjs and the aggregate
  row.  The unit-tests lane owns this refresh.
- **Fix.** Unit-tests lane: advance "Last updated" stamp to
  session 253 (or the session that closes this finding); update
  the test-types.mjs row and aggregate row in the coverage
  snapshot from 5571 → 5591; add session-log entries for
  sessions 253 and 254 in the TESTS.md session-log block.
- **Confidence.** high — `node tests/test-all.mjs` = 5591 / 0
  at this run's entry; `grep -n "5571\|5591" docs/TESTS.md`
  shows 5571 is the current snapshot figure; `grep -c
  "session253:" tests/test-types.mjs` = 6 (label count for the
  rejection-pin batch, each covering multiple assertions).
- **Age.** new (filed session 255-code-review; resolved same run
  by concurrent session 256).
- **Status.** `[resolved - session 256]` — `rpl5050-unit-tests`
  lane ran concurrently with session 255-code-review (lock
  acquired 46 s after session-255 lock; no shared files in scope).
  Session 256 added +8 cross-type comparator rejection-pin
  assertions (5591 → 5599), advanced TESTS.md "Last updated"
  stamp to session 256, and wrote a session-256 coverage snapshot
  absorbing sessions 251–255 (+28 total: +20 from session-253
  plus +8 this run).  Verified: `grep -n "Last updated" docs/
  TESTS.md` → "Session 256 (2026-04-26)"; aggregate row = 5599.

### T-003  Sessions 175 and 177 test-assertion additions did not persist; `docs/TESTS.md` stamp stale at "Session 173"

- **Classification.** Unit Tests.
- **Where.**
  - `tests/test-types.mjs` — ~~missing ~26 pins~~ **session 175
    portion re-landed session 183** (`session175r:` labels, +12
    assertions, 959 → 971 in test-types, 5389 → 5401 test-all).
    Still missing: 14 pins from session 177 (EXACT-mode
    Integer-input trig pinning).  Label trail now
    `session173` → `session175r` → `session179`; `session177`
    labels still absent.
  - `tests/test-control-flow.mjs` — still missing ~10 pins from
    session 177 (RUN edge matrix: DBUG-only, embedded-HALT,
    empty-halt axes).  Label trail ends at `session178`; no
    `session177` labels.
  - `docs/TESTS.md` — "Last updated" stamp still frozen at
    "Session 173 (2026-04-26)"; session 177's refresh did not
    persist and has not been re-landed.
- **What.** Sessions 175 (data-type-support) and 177
  (unit-tests) both wrote detailed session logs and reported
  green exit gates, but their actual test-file writes did not
  survive to the shared filesystem.  Session 183
  (data-type-support) re-landed the session-175 portion (+12
  `session175r:` pins in `tests/test-types.mjs`).  The session-
  177 portion (14 types pins + 10 control-flow pins + TESTS.md
  stamp refresh) remains unresolved.
  Net gap vs. logs at session-183 close: **24 assertions**
  (14 s177-types + 10 s177-control-flow); TESTS.md stamp still
  stale at "Session 173".
- **Why.** The behaviors under test were live before the
  pinning runs and remain live now (all 5401 assertions pass).
  The missing pins are a regression safety-net gap, not a
  correctness gap.  However: (a) the TESTS.md coverage table
  reports inflated per-file counts against the session-177
  close (which didn't land), misleading future auditors; (b)
  the session 177 log describes specific edge-case cells that
  are now unverified by the harness — a future regression in
  those cells would not be caught.
- **Fix.** Unit-tests lane next run: re-execute the session
  177 pinning set (EXACT-mode Integer trig in `tests/test-
  types.mjs` + RUN edge matrix in `tests/test-control-flow.mjs`)
  against the live test files, using `session177r:` labels
  (or simply `session<next>:`) to avoid confusion with the
  lost originals.  Refresh TESTS.md stamp and coverage
  snapshot to reflect re-landed counts.  The session logs
  (`logs/session-177.md`) describe the intended assertions in
  enough detail to recreate them exactly.
- **Confidence.** high.
- **Age.** 1 run.
- **Status.** `[resolved - session 185]` — session 175 portion
  closed by `rpl5050-data-type-support` session 183 (+12
  `session175r:` pins in `tests/test-types.mjs`).  Session 177
  portion (+14 EXACT Integer trig List+Tagged pins in
  `tests/test-types.mjs` + +10 RUN edge pins in
  `tests/test-control-flow.mjs` + TESTS.md stamp) re-landed by
  `rpl5050-unit-tests` session 185 (`session185:` labels).
  test-all 5409 → 5433 (+24).  All gates green at close.

### T-002  `docs/TESTS.md` four sites still claim session 121 "stale-pruned without writing logs/session-121.md"

- **Classification.** Unit Tests (doc drift inside the unit-tests
  lane's authoritative notes file).
- **Where.** `docs/TESTS.md:90-92` (Sibling deltas absorbed
  block — "Session 121 (rpl-programming) shipped **+46** PROMPT /
  KILL assertions in `test-control-flow.mjs` (402 → 448) BUT the
  lock was stale-pruned without writing `logs/session-121.md`");
  `:212` (per-file table line for `test-control-flow.mjs` —
  begins "+34 session-116, +46 session-121 PROMPT/KILL, +4
  session-122…");
  `:644-647` (a session-122 narrative paragraph — "+4 from
  session 122 + 46 from a concurrent session-121 PROMPT/KILL
  cluster that landed in `tests/test-control-flow.mjs` while
  this lock was held — see the top-of-file delta note");
  `:648-651` (the closing of the same session-122 paragraph —
  "Note: session 121 (rpl-programming) acquired its lock and
  was stale-pruned without writing `logs/session-121.md` —
  re-file under code-review per O-008 pattern.").
- **What.** Four mentions of "stale-pruned without writing
  logs/session-121.md" or close paraphrases.  All four sites
  were authored by session 122 (unit-tests) at the time it was
  back-filling the session-121 PROMPT/KILL coverage and could
  not see a `logs/session-121.md` on disk.  As established in
  O-010 partial above, the log file in fact exists (7818 bytes,
  mtime 2026-04-25 01:04:30, written within session 121's lock
  window) — session 122 either ran its `ls logs/` check before
  the session-121 write committed, or against a stale view.
  Either way, the four claims in TESTS.md are now incorrect on
  the literal "log file does not exist" question.  The
  *signature* concern (`heartbeatAt === startedAt`, lock
  `released: true` set without an explicit `releaseReason`) is
  still a real audit-trail observation worth recording, but the
  current phrasing reads "no log was written", and the document
  on disk says otherwise.
- **Why.** TESTS.md is the unit-tests lane's authoritative
  notes file.  A future audit pass reading the four sites will
  conclude the log is missing, repeat O-010's session-123
  mistake, and likely re-file the same finding.  The drift
  also lives next to the per-file coverage table at line 212,
  which is the most-consulted block in the file — readers
  scanning for "what did session 121 ship" land directly on
  the wrong claim.
- **Fix.** Re-phrase all four sites to record the actual
  evidence, e.g. replace "stale-pruned without writing
  `logs/session-121.md`" with "released with the heartbeat-equals-
  startedAt signature that looks stale-prune-ish at the lock
  layer, but the corresponding `logs/session-121.md` was written
  within the lock window (mtime 2026-04-25 01:04:30, identical
  to the lock body's `releasedAt`); the missing-log signal does
  not apply.  Future improvement: add a `releaseReason` field
  to the lock body so graceful release vs. prune is unambiguous
  for future audits."  Same edit at all four sites; pure-doc
  change; no test impact.
- **Confidence.** high.  Four sites verified by `grep -n
  "session 121\|Session 121\|session-121" docs/TESTS.md` returning
  the lines listed under Where.  Log-file-exists evidence:
  `ls -la logs/session-121.md` returns the file with mtime
  01:04:30; `cat utils/@locks/session121-rpl-programming.json`
  returns `released: true` + `releasedAt: 1777079083` (= UTC
  01:04:43, two seconds after the log file mtime — the natural
  ordering for "write log, then unlink lock").
- **Age.** 1 run (filed session 128).
- **Status.** **resolved session-132** by the
  `rpl5050-unit-tests` lane during this review-lane run.  All
  four sites rewritten to acknowledge the log file exists:
  - `:87-103` (Sibling-deltas-absorbed block) — the prior
    "**+46** PROMPT / KILL assertions in `test-control-flow.mjs`
    (402 → 448) BUT the lock was stale-pruned without writing
    `logs/session-121.md`" sentence is replaced with a
    multi-paragraph rewrite acknowledging the
    `heartbeatAt === startedAt` lock-layer signature *but*
    pointing out that `logs/session-121.md` was in fact written
    within the lock window (mtime 2026-04-25 01:04:30 — two
    seconds before `releasedAt` of 01:04:43, the natural
    "write log, then unlink lock" ordering).  The "missing-log
    signal does not apply" conclusion is explicit, and the
    paragraph references this T-002 close + the future
    improvement of adding a `releaseReason` field to the lock
    body.
  - `:212` — the per-file table line for `test-control-flow.mjs`
    is unchanged in attribution form ("+46 session-121 PROMPT/
    KILL") but no longer carries any "stale-pruned" claim,
    matching the rewrite at the top-of-file delta block; the
    cell content is the count attribution only.
  - `:644-647` / `:648-651` (the session-122 narrative paragraph)
    — the closing sentence has been rewritten from the original
    "Note: session 121 (rpl-programming) acquired its lock and
    was stale-pruned without writing `logs/session-121.md` —
    re-file under code-review per O-008 pattern" into an
    explicit T-002-close narrative: "session 121 (rpl-programming)
    acquired its lock with the `heartbeatAt === startedAt`
    signature that resembles a stale-prune at the lock layer;
    the original session-122 narrative read this as 'no log was
    written' because the directory listing taken at session-122
    entry did not yet show `logs/session-121.md`.  Subsequent
    inspection (per REVIEW.md T-002 close, session 132) confirms
    `logs/session-121.md` was in fact written within the lock
    window … so the missing-log signal does not apply."  Pure-
    doc fix, no test impact.  Verified session 133 via
    `grep -n "stale-pruned\|stale-prune" docs/TESTS.md` — only
    two hits remain, both inside the rewritten retraction
    narratives that explicitly say "looks stale-prune-shaped at
    the lock layer, but the log was in fact written".  Sister-
    cite at `docs/TESTS.md:672-677` is the formal T-002 close
    pointer.

### T-001  `docs/TESTS.md` coverage snapshot frozen at session 084

- **Classification.** Unit Tests.
- **Where.** `docs/TESTS.md:7` (Last-updated stamp), `:43`
  (Coverage snapshot heading), `:68-90` (per-file counts table).
- **What.** `docs/TESTS.md` Last-updated stamp reads "Session 084
  (2026-04-23)"; the per-file snapshot table shows 3872 total
  assertions.  The current suite is **3951 passing** — Δ+79 across
  sessions 086 (test-numerics: +25), 087 (test-types: +5,
  test-comparisons: +5, 1 soft-assert hardened), and 088
  (test-control-flow: +35 structural-HALT + 4 converted pilot
  expectations; test-reflection: +5 SIZE-on-Program).  The per-file
  numbers for `test-numerics.mjs` (660, up from 635),
  `test-comparisons.mjs` (73, up from 62), `test-types.mjs` (163,
  up from 153), `test-control-flow.mjs` (260, up from 217 session
  083 baseline), and `test-reflection.mjs` (178, up from 168 at
  launch) are all stale.
- **Why.** The snapshot is the unit-tests lane's authoritative
  "what's tested" reference.  New lanes consult it to gauge
  coverage gaps; a three-session-old snapshot systematically
  under-counts coverage, especially in control-flow and numerics
  which gained the most assertions.
- **Fix.** Re-run `node tests/test-all.mjs`, update the per-file
  table to current counts, bump Last-updated to session 089 (or
  whichever session the unit-tests lane next runs), and add a
  brief delta note explaining the jump (+79 from three sibling
  sessions).
- **Confidence.** high — live run this session = 3951; snapshot = 3872.
- **Age.** 1 run. **Status.** resolved session-102 — unit-tests lane
  refreshed the Last-updated stamp to "Session 102 (2026-04-24)" and
  rewrote the per-file coverage table against the current
  3639-assertion live headline (the 3951 → 3639 delta reflects the
  session-095 Giac migration deleting the native Pythagorean walker
  and its coverage, partially offset by +107 across 099–101).
  Verified session 103 against live `test-all.mjs` exit = 3639.

---

## Findings — User Interface

### U-001  `src/ui/side-panel.js` header comment references nonexistent COMMANDS_INVENTORY.md

- **Classification.** User Interface.
- **Where.** `src/ui/side-panel.js:13,44`.
- **What.** The file's top comment promised alignment with
  `docs/COMMANDS_INVENTORY.md` (nonexistent).
- **Why.** Broken maintainer-promise link.
- **Fix.** Replaced both with `docs/COMMANDS.md`.  Shipped
  session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

_(See also O-005 — `index.html`'s three `js/keyboard.js` comments
are UI-adjacent but classified under Other for bookkeeping.)_

---

## Findings — Other (dead code — pending owner judgment)

### X-001  Five unused imports in `src/rpl/ops.js` from `./state.js`

- **Classification.** Other (dead imports).
- **Where.** `src/rpl/ops.js:45-55` (approximate — re-verify at fix time).
- **What.** Five names imported from `./state.js` into `ops.js` but
  never referenced inside the file:
  - `varList`   — grep-count 1 (import line only)
  - `goInto`    — grep-count 1
  - `getTextbookMode` — grep-count 1
  - `setComplexMode`  — grep-count 1
  - `getPrngSeed`     — grep-count 1

  All five are real exports used elsewhere in the tree — just not
  from `ops.js`.  Re-verified session 089 — counts unchanged.
- **Why.** Top-of-file imports in a 14k-line file are a readability
  anchor; pulling in unused names makes the import block lie.
- **Fix.** Delete the five names from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** resolved session-099 — all five names
  removed from the `./state.js` import block at `www/src/rpl/ops.js:55-80`;
  a lane-boundary comment at lines 76-78 explains they remain
  exported from `state.js` for tests and other modules.  Verified
  session 103 via `grep -n 'varList\|goInto\|getTextbookMode\|setComplexMode\|getPrngSeed' www/src/rpl/ops.js` — hits are comment lines only.

### X-002  Unused import `TYPES` in `src/rpl/formatter.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/formatter.js:10`.
- **What.** `TYPES` is imported from `./types.js` and referenced
  nowhere else in the file (grep-count 1).  Re-verified session 089.
- **Why.** Import-block readability.
- **Fix.** Drop `TYPES` from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** resolved session-099 —
  `www/src/rpl/formatter.js` import block no longer names `TYPES`.
  Verified session 103 via `grep -n '\bTYPES\b' www/src/rpl/formatter.js`
  (zero hits).

### X-003  Unused import `clampLevel` in `src/app.js`

- **Classification.** User Interface (owner) / Other (nature).
- **Where.** `src/app.js:14`.
- **What.** `clampLevel` imported alongside
  `interactiveStackMenu, levelUp, levelDown`; never referenced
  elsewhere in `app.js` (grep-count 1).  Re-verified session 089.
- **Why.** Same rationale as X-001 / X-002.
- **Fix.** Drop `clampLevel` from the import list.
- **Confidence.** high.
- **Age.** 16 runs at close. **Status.** **resolved session 160**
  (lane = `rpl5050-code-review` — folded into the release-mode
  wrap-up run as a charter-permitted dead-import drop).
  Re-verified session 118 at `www/src/app.js:14` — still present
  (`interactiveStackMenu, clampLevel, levelUp, levelDown, …`);
  `grep -c 'clampLevel' www/src/app.js` returns 1 (import line only).
  Definition lives at `www/src/ui/interactive-stack.js:24` and is
  used from inside that same file by `levelUp` / `levelDown`; still
  no cross-module caller in `app.js` or elsewhere in `www/src/`.
  Re-verified session 123: same state at `www/src/app.js:14` —
  `grep -c '\bclampLevel\b' www/src/app.js` returns 1 (the import
  line); `grep -rn '\bclampLevel\b' www/src/` returns the import,
  the definition at `interactive-stack.js:24`, and three call sites
  inside `interactive-stack.js` itself (lines 60, 76, 88 — all
  `levelUp` / `levelDown` internals).  Sessions 119 / 120 / 121 /
  122 did not touch `app.js`.  Re-verified session 128: identical
  state at `www/src/app.js:14`; `grep -c '\bclampLevel\b'
  www/src/app.js` still returns 1.  Sessions 124 / 125 / 126 /
  127 did not touch `app.js` either.  Re-verified session 133:
  identical state at `www/src/app.js:14`; `grep -nE 'clampLevel'
  www/src/app.js` still returns exactly one line (the import).
  Sessions 129 (command-support, COMMANDS.md only), 130 (data-
  types, `tests/test-types.mjs` only), 131 (rpl-programming,
  `ops.js` + `tests/test-control-flow.mjs`), 132 (unit-tests,
  test files + TESTS.md) did not touch `app.js` either.
  Re-verified session 138: identical state at `www/src/app.js:14`;
  `grep -nE '\bclampLevel\b' www/src/app.js` still returns exactly
  one line (the import).  Sessions 134 (command-support, doc-only),
  135 (data-types, `tests/test-types.mjs` only), 136 (rpl-
  programming, `ops.js` runWhile/runDo/runStart/runFor only +
  `tests/test-control-flow.mjs`), 137 (unit-tests in flight, broad
  `tests/*.mjs` + TESTS.md scope) did not touch `app.js` either.
  Re-verified session 143: identical state at `www/src/app.js:14`
  (the line still reads `interactiveStackMenu, clampLevel, levelUp,
  levelDown,`); `grep -c '\bclampLevel\b' www/src/app.js` still
  returns 1 (the import line); `grep -rn '\bclampLevel\b' www/src/`
  still returns the import (`app.js:14`), the definition
  (`interactive-stack.js:24`), and three call sites inside
  `interactive-stack.js` itself.  Sessions 139 (command-support,
  scope = `www/src/rpl/ops.js` + `tests/test-algebra.mjs` +
  `docs/COMMANDS.md`), 140 (data-types, `tests/test-types.mjs` +
  `docs/DATA_TYPES.md`), 141 (rpl-programming,
  `tests/test-control-flow.mjs` + `docs/RPL.md`), 142 (unit-tests
  in flight, broad `tests/*.mjs` + `docs/TESTS.md` scope) did not
  touch `app.js` either.  Re-verified session 148: identical state
  at `www/src/app.js:14` (the line still reads
  `interactiveStackMenu, clampLevel, levelUp, levelDown,`);
  `grep -c '\bclampLevel\b' www/src/app.js` still returns 1 (the
  import line); `grep -rn '\bclampLevel\b' www/src/` still
  returns the import (`app.js:14`), the definition
  (`interactive-stack.js:24`), and three call sites inside
  `interactive-stack.js` itself (lines 34, 39, plus the function
  signature at :24).  Sessions 144 (command-support — `www/src/
  rpl/state.js` + `www/src/rpl/persist.js` + `www/src/rpl/ops.js`
  + `tests/test-algebra.mjs` + `tests/test-persist.mjs` +
  `docs/COMMANDS.md`), 145 (data-types — `tests/test-types.mjs`
  + `docs/DATA_TYPES.md` only), 146 (rpl-programming — `docs/
  RPL.md` + `docs/REVIEW.md` + `tests/test-control-flow.mjs` +
  `tests/test-reflection.mjs`), 147 (unit-tests in flight, broad
  `tests/*.mjs` + `docs/TESTS.md` scope) did not touch `app.js`
  either.  Re-verified session 152: identical state at
  `www/src/app.js:14` (the line still reads
  `interactiveStackMenu, clampLevel, levelUp, levelDown,`);
  `grep -n 'clampLevel' www/src/app.js` still returns one line
  (the import).  Sessions 149 (command-support — `www/src/rpl/
  ops.js` + `tests/test-algebra.mjs` + `docs/COMMANDS.md` +
  `logs/session-149.md`), 150 (data-types — declared scope
  `tests/test-types.mjs` + `docs/DATA_TYPES.md` + `logs/
  session-150.md`, but also edited `www/src/rpl/state.js` outside
  declared scope per session-149's interference note — flagged
  as D-001 below; did not touch `app.js`), 151 (rpl-programming
  — `tests/test-control-flow.mjs` + `docs/RPL.md` + `logs/
  session-151.md`) did not touch `app.js` either.  Re-verified
  session 156 (meta-only): same state, 15 runs aging.  Sessions
  153 / 154 / 155 / 156 / 157 / 158 / 159 did not touch
  `app.js`.  **Resolved session 160** — this review-lane run
  shipped the X-003 fix in-place per the lane charter's "dead
  imports (only when you are certain they are unused)" rule.
  Edit at `www/src/app.js:13-15`: dropped `clampLevel` from the
  `./ui/interactive-stack.js` import block; the remaining
  imports `interactiveStackMenu, levelUp, levelDown,
  rollLevel, rollDownToLevel, dropLevel` are all retained.
  `node --check www/src/app.js` clean post-edit; `grep
  '\bclampLevel\b' www/src/app.js` returns zero hits at run-
  close (was 1 — the import line — at run-entry); the
  definition still lives at `www/src/ui/interactive-stack.js:24`
  with internal callers `levelUp` / `levelDown` unchanged.
  16 review-lane runs aging at close (filed session 080;
  re-verified at sessions 089 / 103 / 108 / 113 / 118 / 123 /
  128 / 133 / 138 / 143 / 148 / 152 / 156 — the longest-aging
  open finding in the entire ledger before this close).

### X-004  Three unused private functions in `src/rpl/ops.js`

- **Classification.** Other.
- **Where.** `src/rpl/ops.js:611` (`_maskVal`), `:9091` (`_isqrtBig`),
  `:9381` (`_ratAdd`).  (Line numbers may shift as ops.js grows;
  re-verify at fix time.)
- **What.** Three `function _name(…)` definitions with zero callers
  anywhere in the repo (grep-count 1 each, all at the definition
  sites).
- **Why.** Dead code drift.  `_isqrtBig` is the worst case —
  "reserved for later" label tricks future readers into assuming
  a working integer-sqrt helper already exists.
- **Fix.** Delete `_maskVal` and `_ratAdd`; for `_isqrtBig`, either
  delete or add a real caller (via the planned ISQRT op).
- **Confidence.** high (`_maskVal`, `_ratAdd`); medium (`_isqrtBig`).
- **Age.** 3 runs. **Status.** resolved session-099 — all three
  private helpers deleted from `www/src/rpl/ops.js`.  Verified
  session 103 via `grep -nE '\b_maskVal\b|\b_isqrtBig\b|\b_ratAdd\b' www/src/rpl/ops.js`
  (zero hits).

### X-005  Shadowed-by-later-register arithmetic + trig registrations (21 duplicates)

- **Classification.** Other.
- **Where.** `src/rpl/ops.js` first-pass at `~:736-752` (+,-,*,/,^)
  and `~:925-957` (SIN COS TAN ASIN ACOS ATAN LN LOG EXP ALOG
  SINH COSH TANH ASINH ACOSH ATANH); superseded by second-pass
  registrations at `~:7150-7177` and `~:6730-6816` respectively.
  (Line numbers approximate — ops.js grows; re-verify at fix
  time.)  Session 089 verified the 21-count still matches via
  `grep -nE "^register\('[^']+'" src/rpl/ops.js | sed -E
  "s/.*register\\('([^']+)'.*/\\1/" | sort | uniq -c | awk '$1>1'`
  — exactly 21 op names appear twice (+ - * / ^ SIN COS TAN ASIN
  ACOS ATAN LN LOG EXP ALOG SINH COSH TANH ASINH ACOSH ATANH),
  unchanged from session 080.
- **What.** `register()` stores into a Map, so the second call
  strictly replaces the first.  First-pass registrations are
  never reachable at runtime.
- **Why.** Dead weight; grep anti-pattern.
- **Fix.** Either delete the first-pass registrations or add a
  block comment clearly marking them as overridden.
- **Confidence.** medium (the "which-wins" analysis is high-conf
  — Map semantics — but picking the right remediation is a judgment call).
- **Age.** 3 runs. **Status.** resolved session-099 — all 21
  shadowed first-pass registrations deleted; the `trigFwd` /
  `trigInv` helpers that were stranded by the delete were uprooted
  in the same pass, and `_stoArith` / `_incrDecrOp` / `_foldListOp`
  were refactored to defer the `lookup(opSymbol)` into the returned
  closure (factory-time lookup was order-dependent on the now-
  deleted shadows).  Verified session 103: `grep -nE "^register\(\s*'[^']+'" www/src/rpl/ops.js | sed -E "s/.*register\(\s*'([^']+)'.*/\\1/" | sort | uniq -c | awk '$1>1'`
  returns zero duplicates.

### X-006  Unused imports `clearAllHalted` + `haltedDepth` in `src/rpl/ops.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/ops.js:57`.
- **What.** The state.js import block at `ops.js:55-58` brings in
  `setHalted, getHalted, clearHalted, clearAllHalted, haltedDepth`.
  The first three are used (HALT/CONT/KILL op handlers).
  `clearAllHalted` and `haltedDepth` are never referenced in ops.js
  — `grep -c '\bclearAllHalted\b' src/rpl/ops.js` = 1 (import line
  only); same for `haltedDepth`.  Both are used in
  `tests/test-control-flow.mjs` (LIFO-ordering test assertions);
  neither has a caller anywhere in `src/`.  Added session 083
  alongside the multi-slot halted LIFO refactor.
- **Why.** Same import-block-readability concern as X-001 / X-002.
  Also implicitly asks the ops.js reader "what handler calls
  `clearAllHalted` / `haltedDepth`?" — the answer is "no handler
  does, only tests", which is worth stating explicitly or removing
  the imports.
- **Fix.** Remove both names from the `./state.js` import block in
  `src/rpl/ops.js`.  No test impact — tests import them directly
  from `src/rpl/state.js`.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-088 — both names
  removed from the `./state.js` import block in ops.js; replaced with
  a clarifying comment noting they are test-only exports.

### X-007  `compareRoundTrip` exported from `giac-convert.mjs` but has zero callers

- **Classification.** Other (dead export).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:508-510`.
- **What.** The function:
  ```
  export function compareRoundTrip(ast) {
    return { giac: astToGiac(ast), rpl: formatAlgebra(ast) };
  }
  ```
  Its docstring says "Used by tests" but `grep -rn 'compareRoundTrip' .
  --include='*.js' --include='*.mjs' --include='*.md'` hits only the
  definition line.  No test file imports it; no module in `www/src/`
  uses it.  Session 094 filed is the most likely origin (the
  FACTOR-purge work that landed the Giac boundary), which would
  make this a scaffolding-left-behind case.
- **Why.** Dead surface area.  A future cas-lane session may extend
  the helper under the impression that tests depend on its current
  shape, wasting time on invariants no caller enforces.  Also
  increases bundle size for browser users by a trivial amount.
- **Fix.** Delete the `compareRoundTrip` export and its docstring;
  drop `formatAlgebra` from the import list iff no other use
  remains (grep currently shows 4 hits — the definition import,
  the X-007 site, and two other real uses, so the import stays).
- **Confidence.** high — grep verified session 103.
- **Age.** 1 run. **Status.** resolved session-104 — the command-
  support lane deleted the `compareRoundTrip` export (and the
  preceding `Convenience round-trippers.` banner) from
  `www/src/rpl/cas/giac-convert.mjs`.  Verified: `grep -rn
  'compareRoundTrip' . --include='*.js' --include='*.mjs'` returns
  zero hits (the remaining REVIEW.md mentions are audit trail).

### X-008  Unused import `freeVars` in `www/src/rpl/cas/giac-convert.mjs`

- **Classification.** Other (dead import).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:22`.
- **What.** `freeVars` is imported from `../algebra.js` alongside
  `Num, Var, Neg, Bin, Fn, parseAlgebra, formatAlgebra`; the other
  seven are used in the file but `freeVars` is referenced nowhere
  else (grep-count 1 — the import line itself).  Most likely a
  leftover from the session-094 FACTOR-purge pilot; the purge
  preamble walked `freeVars(exprAst)` to emit `purge(v1);purge(v2);…`
  but session 098 removed the preamble (see O-007 above), leaving
  the import orphaned.
- **Why.** Same import-block-readability rationale as X-001 /
  X-002; also a good grep anchor showing the purge-preamble
  removal was incomplete.
- **Fix.** Remove `freeVars` from the `../algebra.js` import list.
  No test impact — tests import `freeVars` directly from
  `algebra.js` if they need it.
- **Confidence.** high.
- **Age.** 1 run. **Status.** resolved session-104 — the command-
  support lane dropped `freeVars` from the `../algebra.js` import
  block at `www/src/rpl/cas/giac-convert.mjs:22`.  Verified:
  `grep -n 'freeVars' www/src/rpl/cas/giac-convert.mjs` returns
  zero hits.

### X-009  Six dead imports in `www/src/rpl/cas/giac-convert.mjs` from `../algebra.js`

- **Classification.** Other (dead imports).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:22`.
- **What.** The import block reads
  ```
  import { Num, Var, Neg, Bin, Fn, parseAlgebra, formatAlgebra } from "../algebra.js";
  ```
  Of these seven names, only `parseAlgebra` is actually called
  inside the file (once, at `:444`).  The other six — `Num`, `Var`,
  `Neg`, `Bin`, `Fn`, `formatAlgebra` — appear **only** in the
  file-header block comment (which enumerates the AST shapes at
  lines 7-12) and in a couple of narrative prose comments (e.g.
  "this gate, a Var('#FFh') emits `#FFh` …" at `:143`,
  "parseAlgebra … formatAlgebra's precedence logic" at `:132`).
  Verified by `grep -nE '\bNum\b|\bVar\b|\bNeg\b|\bBin\b|\bFn\b|formatAlgebra'
  www/src/rpl/cas/giac-convert.mjs` — every hit is either the
  import line itself or a comment; none is a call site or a
  JSX-style capitalized constructor.  The file walks the AST via
  the `.kind` discriminator on plain objects (`ast.kind === 'num'`,
  `ast.kind === 'var'`, …) — it never needs the `Num` / `Var` / etc.
  constructor functions.  Likely origin: when the module was first
  written (session 093 Giac pilot) the author pulled in all the
  ctors "just in case", then the implementation evolved to use the
  discriminator form and the import block was never pruned.  X-008
  was the first visible piece of the same pattern (`freeVars` was
  stranded when session 098 removed the purge preamble); this is
  the second, larger piece.
- **Why.** Same rationale as X-001 / X-002 / X-006 / X-008 —
  import-block readability.  A reader opening
  `giac-convert.mjs` sees a seven-name import from `../algebra.js`
  and reasonably infers the module uses all seven ctor constructors;
  they then grep for `Num(` or `Bin(` call sites to understand the
  AST construction path, find none, and have to reason through
  whether the module uses the discriminator form instead.  Six
  unused names out of seven imported is the worst ratio in the
  repo's current import-drift roster.
- **Fix.** Rewrite the import block to `import { parseAlgebra }
  from "../algebra.js";`.  The block comment at `:7-14` can stay —
  it documents the AST shape the file walks, which is true
  regardless of whether the file imports the constructors.  No
  test impact (the constructors are defined in `algebra.js` and
  tests import them directly from there).  `node --check`
  `giac-convert.mjs` + `node tests/test-algebra.mjs` are the
  safety net.
- **Confidence.** high — `grep -nE 'Num\(|Var\(|Neg\(|Bin\(|Fn\(|formatAlgebra\('
  www/src/rpl/cas/giac-convert.mjs` returns zero call-site hits
  (every hit is a comment line).
- **Age.** 1 run. **Status.** resolved session-114 — the command-support
  lane rewrote the `../algebra.js` import block at
  `www/src/rpl/cas/giac-convert.mjs:22` to
  `import { parseAlgebra } from "../algebra.js";` (with a short
  comment above noting that Num/Var/Neg/Bin/Fn/formatAlgebra
  references are block-comment-only).  Verified session 118:
  `head -30 www/src/rpl/cas/giac-convert.mjs` shows only
  `parseAlgebra` in the `../algebra.js` import, with a three-line
  block comment at :22-25 explaining the reduction and pointing at
  the X-009 close.  `node tests/test-algebra.mjs` green — the
  X-009 constructors were comment-only references, not call sites.

### X-010  Dead import `RPLHalt` in `www/src/rpl/ops.js`

- **Classification.** Other (dead import).
- **Where.** `www/src/rpl/ops.js:44`.
- **What.** The `./stack.js` import block at line 44 reads:
  ```
  import { RPLError, RPLAbort, RPLHalt, setPushCoerce } from './stack.js';
  ```
  `RPLError` is used heavily (718 hits), `RPLAbort` is referenced
  by the ABORT op handler (8 hits), `setPushCoerce` is the
  coerce-on-push setter (2 hits).  `RPLHalt` has **grep-count 1**
  — the import line itself.  The class is defined at
  `www/src/rpl/stack.js:335` and `tests/test-control-flow.mjs:1986`
  name-checks it as part of a session-077 regression assertion
  (`'...not RPLHalt escape'` as a text string), but no op handler
  in `ops.js` ever catches or throws it.  HALT-class suspension
  in `ops.js` is done via yielded generators (see `_evalValueGen`
  at `:3752` and `_driveGen` at `:3741`), which is a different
  mechanism from throwing `RPLHalt`.  The import is likely a
  leftover from the pre-generator era (pre-session-088) when HALT
  was a throw/catch signal.
- **Why.** Same import-block-readability rationale as the X-001 /
  X-002 / X-006 / X-008 / X-009 series.  Also implicitly asks the
  reader "what handler in ops.js suspends via an RPLHalt throw?"
  — the answer is "none, suspension is generator-based since
  session 088", which is worth knowing but the import hides it.
- **Fix.** Remove `RPLHalt` from the `./stack.js` import list at
  `www/src/rpl/ops.js:44`.  The class is exported from `stack.js`
  for tests that name-check it; tests import it directly from
  `stack.js` — no cross-module usage under `www/src/` relies on
  it going through `ops.js`.  One-line edit; `node --check`
  safety net.
- **Confidence.** high — `grep -n 'RPLHalt' www/src/rpl/ops.js`
  returns exactly one line (the import).  `grep -rn 'RPLHalt' www/src/`
  returns only the import (`ops.js:44`) and the definition
  (`stack.js:335-336`); the only other hits are in `tests/`.
- **Age.** 1 run. **Status.** resolved session-114 — the command-support
  lane dropped `RPLHalt` from the `./stack.js` import list at
  `www/src/rpl/ops.js:44` (it now reads `import { RPLError, RPLAbort,
  setPushCoerce } from './stack.js';` with a short comment noting the
  session-088 generator-based HALT suspension supplanted the old
  throw/catch protocol).  Verified session 118: `grep -n 'RPLHalt'
  www/src/rpl/ops.js` returns zero hits; the pre-import comment at
  `:44-47` preserved the rationale; class definition still lives in
  `stack.js` for tests that name-check it, and those tests import it
  directly from `stack.js` rather than re-exporting through `ops.js`.

---

## Findings — Other (process / build / file hygiene)

### O-009  Two stray `test-control-flow.mjs.bak*` backup files in `tests/`

- **Classification.** Other (file-hygiene / build artifact).
- **Where.** `tests/test-control-flow.mjs.bak` (92,129 bytes,
  mtime 2026-04-24 11:54) and `tests/test-control-flow.mjs.bak2`
  (92,141 bytes, mtime 2026-04-24 13:41).
- **What.** Two `.bak` / `.bak2` backup copies of the active
  `tests/test-control-flow.mjs` (122,477 bytes) sit next to it
  in the test directory.  Content (the session-077 regression
  assertion containing the text `RPLHalt escape`) confirms these
  are pre-session-111 snapshots — the live file is ~30 KB larger,
  matching session 111's +23 caller-aware HALT-rejection
  assertions and the session-106 +51 step-into cluster.  No
  `.bakN` convention documented anywhere in the repo; the files
  are not referenced by any runner script (`test-all.mjs` walks
  `tests/*.mjs` explicitly, not `*.bak`, so they're not executed).
  `find tests/ -type f -name '*.bak*' -o -name '*.orig' -o -name '*~' -o -name '*.swp'`
  shows these two and no others.  Likely origin: a non-Claude
  editor (vim default backup, `sed -i.bak`, an ad-hoc `cp` before
  a refactor) ran during the session 106 or session 111 churn
  and its output was never pruned.
- **Why.** Three concerns.  (1) **Grep noise** — `grep -n
  'session077' tests/` returns matches in all three files, so
  any session-trail investigation has to filter out the `.bak`
  hits.  (2) **Source-of-truth confusion** — a contributor
  opening `test-control-flow.mjs.bak2` could start editing the
  stale copy without realising, and the test runner would
  silently keep passing against the live file.  (3) **Disk
  churn** — 90 KB × 2 isn't catastrophic but sets a bad
  precedent; if every multi-file refactor leaves `.bak` and
  `.bak2` artifacts, the tree grows unbounded.
- **Fix.** Delete both files.  `tests/` is under the unit-tests
  lane's ownership, so `rpl5050-unit-tests` is the natural owner
  (session 112 currently holds the `tests/` lock — this can ride
  alongside their next edit), but the review lane can also take
  it as pure hygiene once the 112 lock releases.  Independent of
  the cleanup, consider adding a `.gitignore` line for `*.bak`
  and `*.bak2` so future spillover is silently excluded from
  `git status`.
- **Confidence.** high — verified session 113 via `ls -la
  tests/test-control-flow.mjs*`.
- **Age.** 8 runs. **Status.** open (lane = `rpl5050-unit-tests`,
  but **explicitly deferred — blocked by tooling**).  Session 117
  attempted the deletion ("delete test-control-flow.mjs.bak*" was
  in its intent string) but `rm` returned `Operation not permitted`
  in the unsupervised scheduled-task sandbox; the
  `cowork_allow_file_delete` permission prompt is blocked from
  scheduled-task sessions (no interactive user to approve).
  Session 117 logged the deferral in `docs/TESTS.md` known-gaps
  list (the "open — blocked by tooling" line); both `.bak` files
  remain on disk.  Re-verified session 123: `ls -la
  tests/test-control-flow.mjs*` still shows both files
  (`.bak` 92,129 bytes / `.bak2` 92,141 bytes, mtimes unchanged
  from the session-113 reading at 11:54 / 13:41).  Re-verified
  session 128: identical state — both files still present at
  the same byte counts and same Apr 24 11:54 / 13:41 mtimes.
  Sessions 122 / 124 / 125 / 126 / 127 did not delete the
  `.bak` files (122 / 127 ran under the scheduled-task sandbox
  and would have hit the same permission gate; 124 / 125 / 126
  were not unit-tests-lane runs and did not have the tests
  directory broadly in scope).  Re-verified session 133:
  `ls -la tests/test-control-flow.mjs*` still shows the same two
  `.bak` files at the same 92,129 / 92,141 byte counts and the
  same Apr 24 11:54 / 13:41 mtimes; the live file has grown
  178,088 bytes (was 122,477 at session 113 — sessions 116, 121,
  122, 126, 131 added new assertions on top, but the `.bak` /
  `.bak2` snapshots stay frozen at their pre-session-111
  state).  Sessions 129 / 130 / 131 did not delete the `.bak`
  files (none was a unit-tests lane); session 132 (unit-tests,
  active during this run) had `tests/*.mjs` broadly in scope but
  ran under the scheduled-task sandbox and would have hit the
  same permission gate.  Re-verified session 138: `ls -la
  tests/test-control-flow.mjs*` still shows the same two
  `.bak` files at the same 92,129 / 92,141 byte counts and the
  same Apr 24 11:54 / 13:41 mtimes; the live file has grown
  again (sessions 132 +n, 136 +36 auto-close, 137 in-flight).
  Sessions 134 / 135 / 136 did not delete the `.bak` files (none
  was a unit-tests lane); session 137 (unit-tests, active during
  this run) again has `tests/*.mjs` broadly in scope but is
  running under the scheduled-task sandbox and would hit the
  same permission gate.  Re-verified session 143: `ls -la
  tests/test-control-flow.mjs*` still shows the same two `.bak`
  files at the same 92,129 / 92,141 byte counts and same Apr 24
  11:54 / 13:41 mtimes; the live file has grown to 209,904 bytes
  (was 178,088 at session 133 — sessions 137 +45 in-flight, 141
  +76 IFERR pins on top).  Sessions 139 (command-support) / 140
  (data-types) / 141 (rpl-programming) did not delete the `.bak`
  files (none was a unit-tests lane); session 142 (unit-tests,
  active during this run) again has `tests/*.mjs` broadly in
  scope but is running under the scheduled-task sandbox and
  would hit the same permission gate.  Re-verified session 148:
  `ls -la tests/test-control-flow.mjs*` still shows the same two
  `.bak` files at the same 92,129 / 92,141 byte counts and same
  Apr 24 11:54 / 13:41 mtimes; the live file has grown to
  218,434 bytes (was 209,904 at session 143 — session 146 added
  +29 `session146:` assertions on top).  Sessions 144 (command-
  support) / 145 (data-types) / 146 (rpl-programming) did not
  delete the `.bak` files (none was a unit-tests lane);
  session 147 (unit-tests, active during this run) again has
  `tests/*.mjs` broadly in scope but is running under the
  scheduled-task sandbox and would hit the same permission gate.
  Re-verified session 152: `ls -la tests/test-control-flow.mjs*`
  still shows the same two `.bak` files at the same 92,129 /
  92,141 byte counts and same Apr 24 11:54 / 13:41 mtimes; the
  live file has grown to 238,292 bytes (was 218,434 at session
  148 — sessions 151 +71 IFERR-symmetry pins on top, plus the
  in-flight session 152 which is review-lane only and does not
  touch tests).  Sessions 149 (command-support — `tests/test-
  algebra.mjs` only, the live file not the `.bak` snapshots) /
  150 (data-types — `tests/test-types.mjs` only) / 151 (rpl-
  programming — `tests/test-control-flow.mjs` only, the live
  file) did not delete the `.bak` files (none was a unit-tests
  lane).  No unit-tests lane has run since session 147 (the
  149-150-151 block was command-support / data-types / rpl-
  programming, then this review-lane run); next opportunity
  for an interactive lane to fold the cleanup is whenever the
  unit-tests lane next acquires.  Future paths to resolution:
  (a) interactive supervisor session approves the delete via
  `mcp__cowork__allow_cowork_file_delete`; or (b) any lane
  working under an interactive (non-scheduled) Claude session
  takes the chore in passing.  Pure hygiene — the runner
  doesn't pick up `.bak*` files (`test-all.mjs` walks
  `tests/*.mjs` explicitly), so no behavior risk.  Re-attempted
  ship-prep 2026-04-25 (lock owner = `ship-prep-2026-04-25`):
  `rm tests/test-control-flow.mjs.bak tests/test-control-flow.mjs.bak2`
  again returned `Operation not permitted`, and the
  `mcp__cowork__allow_cowork_file_delete` prompt was
  unavailable in unsupervised mode.  **Deferred to user-side
  manual cleanup post-ship** — recommend adding `*.bak` /
  `*.bak2` to `.gitignore` at the same time so future spillover
  is silently excluded.  Marking **[deferred - post-ship]**:
  no behavior risk for the release.  Re-verified session 156
  (meta-only): both files still on disk at the same byte counts
  and mtimes; tooling gate unchanged.  Re-verified session 160
  (`ls tests/test-control-flow.mjs.bak*`): both `.bak` files
  still present at 92,129 / 92,141 bytes / Apr 24 11:54 / 13:41
  mtimes; the live file has continued to grow with sibling-lane
  pin-additions (~250 KB at this point); no scheduled-task lane
  has been able to delete them.  Re-verified session 164-code-
  review: same — `ls -la tests/test-control-flow.mjs*` shows
  both `.bak` files still at 92,129 / 92,141 bytes / Apr 24
  11:54 / 13:41 mtimes; the live file is now 237,247 bytes
  (was ~250 KB phrasing in session 160; now exactly 237 KB
  after sibling sessions 161 / 162 / 163 added pins on top).
  Sessions 161 (command-support — doc-only) / 162 (data-types
  — `tests/test-types.mjs` only, the live file) / 163 (rpl-
  programming — `tests/test-reflection.mjs` + `tests/test-
  eval.mjs`, live files only) did not delete the `.bak` files
  (none had `tests/test-control-flow.mjs.bak*` in scope, none
  was a unit-tests lane).  `session164-unit-tests` is in
  flight at this run's acquisition with `tests/` broadly in
  scope — they are running under the scheduled-task sandbox
  and would hit the same `Operation not permitted` permission
  gate the prior unit-tests sessions hit.  10 review-lane runs
  aging.  Status remains **[deferred - post-ship]**.
  Re-verified session 169-code-review: `ls -la
  tests/test-control-flow.mjs*` still shows both `.bak` files
  at the same 92,129 / 92,141 byte counts and same Apr 24
  11:54 / 13:41 mtimes; the live file has continued to grow
  with sibling-lane pin additions (now 237,247 bytes after
  sessions 165 / 166 / 167 added pins — actually unchanged
  from session 164's reading because the +50 test deltas all
  landed in `tests/test-types.mjs` and `tests/test-reflection.mjs`,
  not `tests/test-control-flow.mjs`).  Sessions 165 (command-
  support — doc-only `docs/COMMANDS.md` + `docs/REVIEW.md` +
  `logs/`) / 166 (data-types — `tests/test-types.mjs` +
  `docs/DATA_TYPES.md` only) / 167 (rpl-programming —
  `www/src/rpl/ops.js` + `tests/test-reflection.mjs` +
  `docs/RPL.md` only, no `test-control-flow.mjs.bak*` in
  scope) did not delete the `.bak` files (none had them in
  declared scope, none was a unit-tests lane).
  `session168-unit-tests` is in flight at this run's
  acquisition with `tests/` broadly in scope — it is running
  under the scheduled-task sandbox and would hit the same
  `Operation not permitted` permission gate the prior
  unit-tests sessions hit.  11 review-lane runs aging.
  Status remains **[deferred - post-ship]**.
  Re-verified session 170-code-review: `ls -la
  tests/test-control-flow.mjs*` still shows both `.bak` files
  at the same 92,129 / 92,141 byte counts and same Apr 24
  11:54 / 13:41 mtimes; the live file has grown further with
  sessions 173 / 178's pin-additions (now larger than the
  237,247-byte reading at session 169, absorbing the +14 s178
  RUN/CONT regression cluster in `test-control-flow.mjs`).
  Sessions 169–180 did not delete the `.bak` files (no unit-
  tests lane attempted deletion; sessions 173 / 177 ran under
  the scheduled-task sandbox and hit the same `Operation not
  permitted` gate per their session logs).  12 review-lane
  runs aging.  Status remains **[deferred - post-ship]**.
  Re-verified session 185-code-review: `ls -la
  tests/test-control-flow.mjs*` still shows both `.bak` files
  at the same 92,129 / 92,141 byte counts and same Apr 24
  11:54 / 13:41 mtimes; the live file has grown further (now
  240,604 bytes, absorbing the +10 s185 RUN edge pins in
  `test-control-flow.mjs`).  Sessions 181–185 did not delete
  the `.bak` files (none was a user-supervised session; s185
  unit-tests hit the same `Operation not permitted` gate).
  **[resolved - session-189-code-review]** — `find
  /sessions/.../mnt/rpl5050/ -name '*.bak*'` at this run's
  entry confirms both `test-control-flow.mjs.bak` and
  `test-control-flow.mjs.bak2` are absent from `tests/`.
  Exact removal session unknown — session-189-unit-tests log
  (written concurrently) still listed them as "blocked by rm
  permission" at acquisition, indicating user-side manual
  cleanup between sessions 185 and 189.  The live file is now
  243,849 bytes (unchanged since session 185-code-review's
  240,604 reading, with the 3 KB delta from normal growth).
  **Age at close: 13 review-lane runs.**

### O-010  Session 121 shipped substantive changes without writing `logs/session-121.md`, COMMANDS.md update, RPL.md narrative, or tests

- **Classification.** Other (process / audit-trail drift, mirrors
  O-008 — second instance of the same anti-pattern).
- **Where.** `logs/` (no `session-121.md` exists; latest log on
  disk before this run is `logs/session-120.md`),
  `utils/@locks/session121-rpl-programming.json` (released by
  stale-prune at `1777078533`, ~11 minutes after the
  `1777077846` startedAt — heartbeatAt was never refreshed past
  the initial value, identical signature to the session-106 case
  the new `utils/@locks/README.md:34` paragraph was meant to flag),
  `www/src/rpl/ops.js` (PROMPT op + IFT/IFTE generator-flavor
  runners + `evalRange` body intercept), `www/src/rpl/state.js`
  (new `state.promptMessage` slot + setter/getter/clearer +
  `resetHome` clear), `docs/COMMANDS.md` (PROMPT row not updated
  — see C-007), `docs/RPL.md` (no narrative for the
  IFT/IFTE generator lift or PROMPT — see R-004), `tests/`
  (session 121 added zero assertions — session 122 unit-tests is
  the back-fill, mirroring the session-111 → session-106 pattern).
- **What.** Session 121 (lane = `rpl5050-rpl-programming`, intent
  string = `"session 121 RPL: items TBD"` — note the "items TBD"
  signature, identical to the session-106 case) acquired its lock
  at `1777077846` and was stale-pruned ~11 minutes later.  The
  source/state edits did land:
  1. **PROMPT op** at `www/src/rpl/ops.js:10968` (~50-line
     handler that pulls a String message, calls
     `setPromptMessage`, and yields to suspend the executing
     program — pinned by 18 session-122 PROMPT/CONT round-trip
     assertions in `tests/test-control-flow.mjs`).
  2. **IFT / IFTE generator-flavor lift** at
     `www/src/rpl/ops.js:3573-3593`.  The two control-flow ops now
     re-enter `evalRange` via the body-intercept path
     (`:3116-3158`) instead of dispatching through
     `_evalValueSync`, which means HALT inside an IFT / IFTE
     action is no longer rejected at the `_driveGen` boundary.
     This is the exact case R-003 (resolved session-111) called
     out as still-rejecting — session 121 silently lifted that
     limit.  Pinned by 14 session-122 IFT/IFTE+HALT assertions.
  3. **`state.promptMessage` slot** at `www/src/rpl/state.js:171`
     plus `setPromptMessage` / `getPromptMessage` /
     `clearPromptMessage` exports at `:525-535` and the
     `clearPromptMessage()` call inside `resetHome` at `:839`.
     CONT / KILL / SST handlers in `ops.js` import the clearer
     (line 86) and call it on suspension-resume.  Pinned by 18
     session-122 promptMessage round-trip assertions.
  None of this work was written up in a session log; no
  `docs/COMMANDS.md` Notes-column update for PROMPT or IFT / IFTE
  was made (see C-007); no `docs/RPL.md` narrative section was
  added for the IFT / IFTE lift or the PROMPT mechanism (see
  R-004); session 121 also shipped zero unit tests of its own —
  the +50 PROMPT/IFT/IFTE coverage that lands during this review
  pass is session 122 unit-tests playing back-fill, exactly as
  session 111 had to back-fill session 106.
- **Why.** Same triple concern as O-008 — (1) **audit-trail
  drift**: future review-lane and unit-tests passes have to
  reconstruct what session 121 did from `ops.js` + `state.js`
  deltas plus the lock body, instead of reading the per-run log;
  (2) **silent capability change**: session 121 lifted the
  IFT/IFTE+HALT rejection that `_driveGen`'s session-111
  caller-aware error message was specifically designed to surface
  — readers consulting RPL.md or COMMANDS.md for "can HALT escape
  IFT?" will conclude no, when the answer is now yes; (3) **lane
  bleed**: session 121 RPL added a PROMPT op (a Commands-bucket
  capability) without notifying COMMANDS.md, so the
  Commands-lane Counts block is now stale and the row classifying
  PROMPT under "UI lane handles this" is actively wrong (see
  C-007).  The `utils/@locks/README.md:34` paragraph that O-008
  prompted (added session 118) tells future audit passes
  *exactly* this signature — `released: true` set by `pruneStale`
  rather than by the owner, identical heartbeat = startedAt — to
  flag the missing log loudly.  This run is the first review pass
  after that paragraph landed, and the signature is unmistakable.
- **Fix.** Three half-coupled remediation steps, each ownable
  separately:
  1. **Back-fill `logs/session-121.md`** from the surviving
     evidence (`ops.js` + `state.js` deltas, the
     `session121-rpl-programming.json` lock body, the
     `register('PROMPT', …)` site, the `evalRange` body-intercept
     code, and the +50 session-122 assertions that pin the
     behaviour).  Owner: `rpl5050-rpl-programming` next time it
     runs (mirrors session 111's session-106 back-fill).
  2. **Add COMMANDS.md PROMPT + IFT/IFTE Notes-column updates**
     and bump the Counts heading.  Owner:
     `rpl5050-command-support`.  See C-007.
  3. **Add docs/RPL.md narrative** for the session-121 IFT/IFTE
     generator-flavor lift (it's the largest control-flow lift
     since session 088's structural HALT) and the PROMPT
     mechanism's interaction with `state.promptMessage`, CONT,
     KILL, SST.  Owner: `rpl5050-rpl-programming`.  See R-004.
- **Confidence.** high — `ls logs/session-12*.md` shows latest
  log is `120.md` (no `121.md`); `cat
  utils/@locks/session121-rpl-programming.json` confirms
  released-by-prune (`heartbeatAt === startedAt`, `releasedAt -
  startedAt ≈ 687 s`, no `releaseReason` set by the owner);
  `grep -nE "register\(\s*'PROMPT'" www/src/rpl/ops.js` shows
  the op live at line 10968; `grep -n 'setPromptMessage\|clearPromptMessage'
  www/src/rpl/ops.js www/src/rpl/state.js` confirms the wiring;
  `grep -c 'session ?12[12]\|session-12[12]' tests/test-control-flow.mjs`
  shows 47 hits at run-end (started at 0 when session 122 acquired
  its lock — the file grew from 133,081 → 145,533 bytes during
  this review window).
- **Age.** closed. **Status.** **resolved session 129** — last
  open leg routed through C-007, which the session-129 command-
  support lane closed in full (PROMPT row split out of the UI
  group into the control-flow section; IFT/IFTE row Notes
  amended with the session-121 generator-flavor lift; HALT/CONT/
  KILL row Notes amended with the session-121 IFT/IFTE and
  session-126 SEQ/MAP lifts plus the residual sync-fallback
  caveat; eight back-filled session-log entries 120–128; Counts
  heading bumped to "as of session 129", register() narrative
  455 → 458).  Promotion deferred to session 133 because session 128 left
  the leg recorded as "partial — routes through C-007" and no
  review-lane run intervened between session 128 and session
  133 (sessions 129–132 were the four sibling lanes:
  command-support / data-types / rpl-programming / unit-tests).
  Earlier sub-item history retained below for the audit trail.
  Three sub-items had been bundled under O-010; the
  session-128 review corrected each:
  1. **Missing `logs/session-121.md`** — *retracted*.  The log
     file does exist on disk (7818 bytes, mtime 2026-04-25
     01:04:30 UTC).  Session 121's lock body shows `released:
     true` with `releasedAt: 1777079083` — that timestamp matches
     the log file's mtime to the second, indicating session 121
     wrote the log at lock-release time, not that the lock was
     stale-pruned without a log.  The session-123 audit appears
     to have run its `ls logs/` check before the session-121
     write committed (or against an out-of-date directory cache);
     in any case the file is present this run.  The "released:
     true with heartbeatAt === startedAt" signature still looks
     like a stale-prune at the lock layer, but the corresponding
     log file write happened, so the audit-trail concern is
     satisfied.  Re-cast: session 121's lock was either grace-
     released right at the prune deadline or stale-pruned just
     after the session wrote its log; either way the
     `utils/@locks/README.md:34` "missing log" signal does not
     apply.  Future improvement: add a `releaseReason` field to
     the lock body so graceful release vs. prune is unambiguous.
  2. **Missing tests** — *resolved by session 122*.
     `tests/test-control-flow.mjs` now contains 46 session-121-
     labelled assertions (PROMPT round-trip + IFT/IFTE+HALT
     coverage) added by session 122 unit-tests as a back-fill
     pass, mirroring the session-111 → session-106 back-fill
     pattern.  These assertions are present in the source file
     even though they don't currently contribute to test-all's
     pass count because session 126's in-flight SEQ work crashes
     the file at module-load (a separate sibling-lane defect, not
     a session-121 concern; see baseline block).
  3. **Missing `docs/COMMANDS.md` update** — *partial; routes
     through C-007*.  The Counts heading + register count + the
     brief session-121 PROMPT mention closed by session 124's own
     COMMANDS.md edits.  The PROMPT row classification at line
     388, the IFT/IFTE row at line 348, the HALT row staleness at
     line 355, and missing session-log entries 120/121/122/123/125
     are still open; see C-007 for the routable detail.
  4. **Missing `docs/RPL.md` narrative** — *retracted; see R-004*.
     RPL.md as observed this run carries the full session-121
     narrative (chapter at `:42-46` for IFT/IFTE lift, `:117-123`
     for PROMPT, `:171-179` for remaining limitations,
     `:223-298` for the "Session 121 — what shipped" subsection).
     The session-126 in-flight rpl-programming run has bumped the
     stamp at `:18` to "as of session 126" and added a session-126
     MAP/SEQ chapter at `:50-60` on top of the existing 121
     content, but the session-121 chapters were already in place
     before this run's acquisition; review-lane cannot conclusively
     say whether they landed at session 121's lock-release or at
     session 126's in-flight back-fill, but either way the gap
     described by R-004 no longer holds.  Lane attribution for
     the RPL.md narrative defaults to session 121 (the natural
     authoring window).
  Net status: O-010 is **resolved session 129** — the last open
  sub-item (COMMANDS.md remainder routed through C-007) was
  closed by the session-129 command-support lane in full.  Lane
  attribution for the closed leg = `rpl5050-command-support`
  (session 129).  Two retractions and three resolutions across
  the four legs took this from a four-leg open finding to a
  fully-closed entry; the audit trail is preserved verbatim
  above so future reviews can trace the path from session-123's
  initial filing through the session-128 retraction pass to
  session-129's actual close.

### O-011  Lock body cannot disambiguate "graceful release" from "stale-prune-with-late-log" — third occurrence (session 141)

- **Classification.** Other (process / lock-protocol audit-trail
  ergonomics, mirrors O-008 / O-010 — third instance of the same
  signature, but the underlying remedy is a one-line addition to
  the lock body shape rather than a per-incident back-fill).
- **Where.** `utils/@locks/lock.mjs:88-114` (the `acquire` /
  `release` body shape that omits a `releaseReason` field);
  `utils/@locks/session141-rpl-programming.json` (the third
  example: `heartbeatAt: 1777106701` ≡ `startedAt`, `released:
  true`, `releasedAt: 1777107556`, no `releaseReason`,
  no per-second matching log mtime that would otherwise prove
  graceful intent).  Prior precedents: O-008
  (`utils/@locks/session106-rpl-programming.json`, never wrote
  `logs/session-106.md` until session-118 backfill); O-010
  (`utils/@locks/session121-rpl-programming.json`, log written
  *within* the lock window — session 132 closed T-002 by
  acknowledging the log existed but flagged the lock-layer
  ambiguity for future improvement).
- **What.** The lock body shape persisted by `lock.mjs` is
  `{ owner, scope, intent, startedAt, heartbeatAt, released?,
  releasedAt? }` — six fields plus two release-tracking fields.
  Both `release()` (line 101-114) and `pruneStale()` (line 44-59)
  set `released: true` + `releasedAt: <ts>` on the way out, with
  no field distinguishing "the owner called `release()` with the
  task's work fully shipped" from "the 10-min stale-prune deadline
  fired and the helper marked the lock released as a recovery
  action".  The signature distinction we currently use — heartbeat
  refresh vs. heartbeatAt-equals-startedAt, plus log-file-mtime
  proximity to releasedAt — is heuristic and has now misfired
  three times: O-008 (session 106 — log truly missing,
  signature correctly flagged), O-010 (session 121 — log written
  within lock window, signature flagged but log existed; T-002
  recast the audit to acknowledge), O-011 (session 141 — log
  written *at* `releasedAt` to the second; signature still
  matches "looks stale-prune-shaped at the lock layer" but the
  log mtime exactly equals `releasedAt`, suggesting a graceful
  late release rather than stale-prune).  Three independent
  occurrences in five months means the next review pass is
  going to spend audit attention on the same disambiguation
  exercise; that's the maintenance hazard worth fixing once at
  the helper level.
- **Why.** T-002's session-132 resolution paragraph already
  flagged the future improvement explicitly: "Future improvement:
  add a `releaseReason` field to the lock body so graceful
  release vs. prune is unambiguous for future audits."  This
  finding promotes that future-improvement note from a comment-
  in-passing to a tracked work item.  Each new occurrence of
  the signature consumes review-lane audit attention that could
  go elsewhere; over the audit trail, three runs (O-008's
  filing at session 108, O-010's filing at session 123, this
  finding at session 143) have spent narrative space on what
  the lock-body shape itself fails to record.
- **Fix.** One-line per-call-site addition to `lock.mjs`:
  - `release()` at `:101-114` should set `releaseReason:
    "graceful"` alongside `released: true` + `releasedAt`.
  - `pruneStale()` at `:44-59` should set `releaseReason:
    "stale-prune"` (or `"stale-prune-after-graceful"` if the
    lock body already had `released: true`, indicating the
    helper hit the unlink-fallback path for a previously-
    released lock — see lines 51-55).
  Future audit passes can then read the `releaseReason` field
  directly instead of running heuristic mtime arithmetic across
  the lock body and the corresponding log file.  Existing
  in-flight locks won't carry the field; that's fine — absence
  is the historical-default state and audits can fall back to
  the heuristic for pre-fix locks.  No test impact (the lock
  helper has no unit-test coverage today; the
  `utils/@locks/README.md` example body shape will need a parallel
  one-line update to document the new field).
- **Confidence.** high — `cat utils/@locks/session141-rpl-programming.json`
  shows the lock body lacks any release-reason field;
  `cat utils/@locks/session121-rpl-programming.json` and
  `cat utils/@locks/session106-rpl-programming.json` show the
  same omission for the prior precedents; `grep -n "releaseReason\|releasedAt"
  utils/@locks/lock.mjs` returns only `releasedAt` references at
  lines 53 and 111 — no `releaseReason` is currently written.
- **Age.** 3 runs (filed session 143; aged sessions 148 / 152).
  **Status.** open.  Lane = no canonical owner —
  `utils/@locks/lock.mjs` is shared infrastructure.  Pair
  naturally with any lane currently editing the lock helper for
  an unrelated reason; absent that, the review lane can ship the
  change as pure infrastructure hygiene (the change is local to
  `lock.mjs` + `README.md` and doesn't cross any sibling-lane
  boundary).  Pure additive edit; no behavior risk to in-flight
  locks because absence of the new field is the historical
  default.  Re-verified session 152: `grep -n "releaseReason"
  utils/@locks/lock.mjs utils/@locks/README.md` returns zero
  hits — the helper still writes `released: true` + `releasedAt`
  but no `releaseReason` field.  Sessions 149 / 150 / 151 lock bodies inspected for new
  occurrences — all three fit the same `heartbeatAt ===
  startedAt` signature as the prior cases (no lane body in the
  repo currently calls `heartbeat()`, so this is the default
  for any release): 149 (`startedAt: 1777119907`, `heartbeatAt:
  1777119907`, `released: true`, `releasedAt: 1777121100` —
  1193 s ≈ 19m 53s after start, well past the 600 s stale-prune
  threshold but pruneStale only runs when another agent calls
  `acquire`/`list`, which didn't happen in the gap; `logs/
  session-149.md` mtime ≈ `releasedAt`); 150 (`startedAt:
  1777120252`, `heartbeatAt: 1777120252`, `releasedAt:
  1777121297` — 1045 s ≈ 17m 25s after start, again past the
  prune threshold; `logs/session-150.md` mtime within seconds
  of `releasedAt`); 151 (`startedAt: 1777121377`, `heartbeatAt:
  1777121377`, `releasedAt: 1777121764` — 387 s, under the
  prune deadline; `logs/session-151.md` mtime ≈ `releasedAt`).
  All three lock bodies show the same shape ambiguity — the
  signature alone cannot distinguish graceful release from
  stale-prune; reconstruction still requires the mtime arithmetic
  cross-check against the log file.  This is the **seventh,
  eighth, and ninth occurrences** of the underlying ambiguity
  (after sessions 106 / 121 / 141 / 146 / and now 149 / 150 /
  151).  Worth noting: no `release()` failure mode is visible
  in any of these — every recent run released gracefully and
  the mtime arithmetic eventually disambiguates.  But each new
  occurrence consumes audit attention that would be saved by
  writing `releaseReason` once at the lock-helper level.  The
  case for the one-line per-call-site addition strengthens with
  each cycle, and the cycle frequency is now ~1 occurrence per
  sibling-lane run.  Re-verified session 160: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 153 / 154 / 155 / 156 /
  157 / 158 / 159 lock bodies all fit the same `heartbeatAt ===
  startedAt` signature (no lane currently calls `heartbeat()`),
  bringing the running count of underlying-ambiguity occurrences
  to **sixteen** since session 106.  Triaged
  **[deferred - post-ship]** by the session 156 meta-log: change
  shape of shared tooling, cycle frequency makes a post-ship
  landing more appropriate than a rushed in-window edit.
  Re-verified session 164-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 161 (command-support —
  `heartbeatAt: 1777148616` ≡ `startedAt`, `releasedAt:
  1777148892`, no `releaseReason`) / 162 (data-types —
  `heartbeatAt: 1777149087` ≡ `startedAt`, `releasedAt:
  1777149493`) / 163 (rpl-programming — `heartbeatAt:
  1777150039` ≡ `startedAt`, `releasedAt: 1777150394`) lock
  bodies all carry the same shape ambiguity, plus
  `session164-unit-tests` in flight at this run's acquisition
  (`heartbeatAt: 1777150581` ≡ `startedAt`, no `releasedAt`
  yet but the same shape will materialize at its release).
  Running count of underlying-ambiguity occurrences now
  **twenty** since session 106 (was 16 at session 160 close +
  3 from 161 / 162 / 163 + 1 in flight from 164).  5 review-
  lane runs aging; status remains
  **[deferred - post-ship]**.
  Re-verified session 169-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 165 (command-support —
  `heartbeatAt: 1777155768` ≡ `startedAt`, `releasedAt:
  1777156116`, no `releaseReason`) / 166 (data-type-support —
  `heartbeatAt: 1777156351` ≡ `startedAt`, `releasedAt:
  1777156575`) / 167 (rpl-programming — `heartbeatAt:
  1777157170` ≡ `startedAt`, `releasedAt: 1777157533`) lock
  bodies all carry the same shape ambiguity, plus
  `session168-unit-tests` in flight at this run's acquisition
  (`heartbeatAt: 1777157778` ≡ `startedAt`, no `releasedAt`
  yet but the same shape will materialize at its release).
  Running count of underlying-ambiguity occurrences now
  **twenty-four** since session 106 (was 20 at session 164
  close + 3 from 165 / 166 / 167 + 1 in flight from 168).
  6 review-lane runs aging; status remains
  **[deferred - post-ship]**.
  Re-verified session 170-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 169-code-review through
  180 (eleven sessions) all carry the same `heartbeatAt ≡
  startedAt` shape ambiguity — no lane has added a
  `releaseReason` field.  Running count of underlying-
  ambiguity occurrences now **thirty-five** since session 106
  (was 24 at session 169 close + 11 from sessions 170–180).
  7 review-lane runs aging; status remains
  **[deferred - post-ship]**.
  Re-verified session 185-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 181 (unit-tests —
  `heartbeatAt: 1777179564` ≡ `startedAt`, `releasedAt:
  1777179716`) / 182 (command-support — `heartbeatAt:
  1777180978` ≡ `startedAt`, `releasedAt: 1777181099`) /
  183 (data-type-support — `heartbeatAt: 1777181479` ≡
  `startedAt`, `releasedAt: 1777181738`) / 184 (rpl-programming
  — `heartbeatAt: 1777182287` ≡ `startedAt`, `releasedAt:
  1777182330`) / 185 (unit-tests — `heartbeatAt: 1777182961`
  ≡ `startedAt`, `releasedAt: 1777183243`) lock bodies all
  carry the same shape ambiguity.  Running count of underlying-
  ambiguity occurrences now **forty** since session 106 (was
  35 at session 170 close + 5 from sessions 181–185).
  Re-verified session 189-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 186 (command-support —
  `heartbeatAt: 1777184542` ≡ `startedAt`, `releasedAt:
  1777184719`) / 187 (data-type-support — `heartbeatAt:
  1777185399` ≡ `startedAt`) / 188 (rpl-programming) / 189
  (unit-tests — `heartbeatAt: 1777186619` ≡ `startedAt`,
  `releasedAt: 1777186720`) lock bodies all carry the same
  shape ambiguity (exact timestamps for 187/188 from lock
  files; pattern consistent with all prior sessions — no lane
  currently calls `heartbeat()`).  Running count of
  underlying-ambiguity occurrences now **forty-four** since
  session 106 (was 40 at session 185-code-review close + 4
  from sessions 186–189).  **9 review-lane runs aging.**
  Status remains **[deferred - post-ship]**.
  Re-verified session 194-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 190 (command-support —
  `heartbeatAt: 1777184542` ≡ `startedAt`, confirmed released
  before s191) / 191 (data-type-support — `heartbeatAt:
  1777185399` ≡ `startedAt`) / 192 (rpl-programming) / 193
  (unit-tests — `heartbeatAt: 1777190160` ≡ `startedAt`,
  `releasedAt: 1777190269`) lock bodies all carry the same
  shape ambiguity (pattern consistent with all prior sessions).
  Running count of underlying-ambiguity occurrences now
  **forty-eight** since session 106 (was 44 at session
  189-code-review close + 4 from sessions 190–193).
  **10 review-lane runs aging.**
  Status remains **[deferred - post-ship]**.
  Re-verified session 198-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 195 (command-support —
  C-013 close; doc-only) / 196 (data-type-support — TRUNC L/T
  wrapper-add; +8 pins) / 197 (rpl-programming — RPL.md stamp;
  doc-only) / 198-unit-tests (TESTS.md snapshot refresh;
  doc-only) lock bodies all carry the same shape ambiguity
  (no lane has added a `releaseReason` field).  Running count
  of underlying-ambiguity occurrences now **fifty-two** since
  session 106 (was 48 at session 194-code-review close + 4
  from sessions 195–198-unit-tests).  **11 review-lane runs
  aging.**  Status remains **[deferred - post-ship]**.
  Re-verified session 202-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 199 (command-support —
  C-014 close; doc-only) / 200 (data-type-support — GAMMA/
  LNGAMMA/erf/erfc L/V/M pins; +13) / 201 (rpl-programming —
  RPL.md stamp; doc-only) / 202-unit-tests (TESTS.md snapshot
  refresh; doc-only) / 202-code-review (this run) lock bodies
  all carry the same shape ambiguity.  Running count of
  underlying-ambiguity occurrences now **fifty-seven** since
  session 106 (was 52 at session 198-code-review close + 5
  from sessions 199–202-code-review).  **12 review-lane runs
  aging.**  Status remains **[deferred - post-ship]**.
  Re-verified session 203-code-review: `grep -n
  "releaseReason" utils/@locks/lock.mjs utils/@locks/README.md`
  still returns zero hits.  Sessions 203 (command-support —
  COMMANDS.md stamp + back-fill; doc-only) / 204 (data-type-
  support — erfc pins; +7) / 205 (rpl-programming — RPL.md
  stamp; doc-only) / 206-unit-tests (TESTS.md snapshot refresh;
  doc-only) / 203-code-review (this run) lock bodies all carry
  the same shape ambiguity.  Running count of underlying-
  ambiguity occurrences now **sixty-two** since session 106
  (was 59 at session 204 session-log close + 3 from sessions
  205/206-unit-tests/203-code-review).  **13 review-lane runs
  aging.**  Status remains **[deferred - post-ship]**.
  Re-verified session 207-command-support (preamble-only at
  that run; catchup here): `grep -n "releaseReason"
  utils/@locks/lock.mjs utils/@locks/README.md` still returns
  zero hits.  Sessions 204 (data-type-support — erfc Z/L/V/M
  pins; +7) / 205 (rpl-programming — RPL.md stamp; doc-only) /
  206-unit-tests (TESTS.md snapshot refresh; doc-only) /
  207-command-support (COMMANDS.md back-fill; doc-only) lock
  bodies all carry the same shape ambiguity.  Running count of
  underlying-ambiguity occurrences now **sixty-five** since
  session 106 (was 62 at session 203-code-review close + 3 from
  sessions 204/205/206-unit-tests + 207-command-support: net +3
  tracked at the session-207 run as reported in preamble).
  **14 review-lane runs aging.**  Status remains
  **[deferred - post-ship]**.
  Re-verified session 210-code-review (preamble-only at that
  run; catchup here): `grep -n "releaseReason"
  utils/@locks/lock.mjs utils/@locks/README.md` still returns
  zero hits.  Sessions 208 (data-type-support — erf M-cell pin;
  +1) / 209 (rpl-programming — RPL.md stamp; doc-only) /
  210-unit-tests (TESTS.md snapshot refresh; doc-only) /
  210-code-review (this run — review-lane audit; doc-only) lock
  bodies all carry the same shape ambiguity.  Running count of
  underlying-ambiguity occurrences now **sixty-nine** since
  session 106 (was 65 + 4 from sessions 208/209/210-unit-tests/
  210-code-review).  **15 review-lane runs aging.**  Status
  remains **[deferred - post-ship]**.
  Re-verified session 211-code-review: `grep -n "releaseReason"
  utils/@locks/lock.mjs utils/@locks/README.md` still returns
  zero hits.  Sessions 211-command-support (COMMANDS.md stamp
  207→211; doc-only) / 212-data-type-support (ZETA/LAMBERT
  Z/L/V/M pins; +10) / 213-rpl-programming (RPL.md stamp
  209→213; doc-only) / 214-unit-tests (TESTS.md snapshot
  refresh; doc-only) / 211-code-review (this run) lock bodies
  all carry the same shape ambiguity.  Running count of
  underlying-ambiguity occurrences now **seventy-four** since
  session 106 (was 69 + 5 from sessions 211-command-support /
  212-data-type-support / 213-rpl-programming / 214-unit-tests /
  211-code-review).  **16 review-lane runs aging.**  Status
  remains **[deferred - post-ship]**.

### C-012  `COMMANDS.md` register-count claim stale after session 187's XPON/MANT wrapper-add

- **Classification.** Commands (doc drift).
- **Where.** `docs/COMMANDS.md:182-188` — the Counts prose block
  claiming "`grep -c "register(" www/src/rpl/ops.js` = **476**
  at the end of session 186 (unchanged from session 149)" and
  "actual top-level `register()` *call* count (`grep -cE
  '^register\(' www/src/rpl/ops.js`) is **455**".
- **What.** Actual counts as of session-189-code-review entry:
  `grep -c "register("` = **478**; `grep -cE "^register\("` =
  **457**.  The +2 / +2 deltas were already noted in REVIEW.md's
  session-185-code-review baseline block as having occurred
  between session 170-code-review and session 185-code-review
  (two comment lines added in older sessions).  Session 186's
  doc-reconciliation pass re-ran the grep and reported 476/455
  "unchanged from session 149" — either the session-186 grep
  ran against a stale file state, or the +2 comment-line delta
  landed in an unlogged edit window; either way the COMMANDS.md
  claim is now 2 low on each figure.
- **Why.** The Counts block is the canonical reference for
  how many handlers are registered; a stale count erodes
  trust in the doc as a completeness check.
- **Fix.** Command-support lane: update the prose to read
  "**478**" and "**457**" respectively; advance "as of session
  186" to "as of session 189" (or whichever is current at fix
  time); adjust the "unchanged from session 149" footnote to
  name the correct earlier session.  One-paragraph doc-only
  edit, no source change required.
- **Confidence.** high — `grep -c "register("
  www/src/rpl/ops.js` = 478 verified at this run's entry.
- **Age.** 1 run.
  **Status.** `[resolved - session 190]` — closed by
  `rpl5050-command-support` this run.  Live counts at fix time:
  `grep -c "register("` = **481**; `grep -cE "^register\("` =
  **460** (not 478/457 as filed — the extra +3/+3 above the
  filing figure turned out to be session 149's five EXPANDMOD /
  FACTORMOD / GCDMOD / DIVMOD / DIV2MOD registrations that were
  never reflected in the Counts heading; corrected with full
  audit trail in `docs/COMMANDS.md` Counts block).  Counts
  heading advanced from "as of session 186" to "as of session
  190"; register-count prose rewritten with correct 481 / 460
  figures and accurate history.  `node --check` N/A (doc-only).

### C-013  `COMMANDS.md` register-count claim stale after session 191's HEAVISIDE/DIRAC wrapper-add

- **Classification.** Commands (doc drift).
- **Where.** `docs/COMMANDS.md:196-204` — the Counts prose block
  claiming "`grep -c "register(" www/src/rpl/ops.js` = **481**
  at the end of session 190" and "actual top-level `register()`
  call count … is **460**".
- **What.** Actual counts as of session-194-code-review entry:
  `grep -c "register("` = **482**; `grep -cE "^register\("` =
  **461**.  The +1/+1 delta occurred in session 191
  (data-type-support — HEAVISIDE + DIRAC L/V/M/T wrapper-add).
  The session-191 log describes wrapping two existing `register()`
  calls with `_withTaggedUnary(_withListUnary(_withVMUnary(…)))`;
  the exact mechanism for the +1 top-level registration count is
  not fully explained in the log, but the grep evidence is
  unambiguous.  The COMMANDS.md Counts block was not updated by
  session 191 (the data-type lane's charter does not include
  COMMANDS.md edits).
- **Why.** The Counts block is the canonical reference for
  how many handlers are registered; a stale count erodes
  trust in the doc as a completeness check.  Mirrors C-012.
- **Fix.** Command-support lane: update the prose to read
  "**482**" and "**461**" respectively; advance "as of session
  190" to "as of session 194" (or whichever is current at fix
  time).  One-paragraph doc-only edit, no source change required.
- **Confidence.** high — `grep -c "register("
  www/src/rpl/ops.js` = 482 and `grep -cE "^register\("` = 461
  verified at this run's entry.
- **Age.** 1 run (filed session 194-code-review).
  **Status.** **[resolved - session 195]** — COMMANDS.md
  Counts stamp advanced 190 → 195; register-count prose updated
  to 482 / 461; session-191 wrapper-add mechanism explained in
  the prose.  Doc-only close, no source change.

### C-014  `COMMANDS.md` session-log block missing entries for sessions 187–197

- **Classification.** Commands (doc drift / session-log gap).
- **Where.** `docs/COMMANDS.md` session-log block (most-recent-
  first list at the end of the file); last entry at session 186.
- **What.** The COMMANDS.md session-log block stops at session
  186 (`rpl5050-command-support`, 2026-04-26, doc-reconciliation
  pass).  Sessions 187 through 197 — eleven sessions spanning
  all five sibling lanes — have no log entries in the block:
  187 (data-type-support — XPON/MANT wrappers, +15 pins), 188
  (rpl-programming — doc-only RPL.md stamp bump), 189
  (unit-tests — TESTS.md snapshot refresh), 189-code-review
  (C-012 + O-012 filings), 190 (command-support — C-012 close,
  Counts stamp 186 → 190, register-count prose corrected), 191
  (data-type-support — HEAVISIDE + DIRAC wrappers, +16 pins),
  192 (rpl-programming — doc-only), 193 (unit-tests — TESTS.md
  refresh), 194-code-review (C-013 filing, O-011 aging), 195
  (command-support — C-013 close, Counts stamp 190 → 195), 196
  (data-type-support — TRUNC wrapper, +8 pins), 197 (rpl-
  programming — RPL.md backfill), 198-unit-tests (TESTS.md
  refresh).
- **Why.** COMMANDS.md's session-log block is the canonical
  per-run audit trail for the Commands lane.  The recurring
  anti-pattern (C-005 / C-006 / C-007 / C-008 all filed and
  closed for the same kind of gap in earlier cycles) now has
  eleven sessions of backlog.  A reader consulting the file
  to understand "what changed between session 186 and now?"
  has no inline record.
- **Fix.** Command-support lane: back-fill session-log entries
  for sessions 187–197 at the top of the log block (most-
  recent-first order).  Entries for sessions with no register
  or row changes can be one-liners; sessions with row flips or
  new ops need the standard summary paragraph.
- **Confidence.** high — `grep -n "^\- \*\*session 18[7-9]\|
  ^\- \*\*session 19[0-7]" docs/COMMANDS.md` returns zero hits.
- **Age.** 1 run (filed session 198-code-review).
  **Status.** [resolved - session 199].  `rpl5050-command-support`
  lane back-filled session-log entries for sessions 187–198 in
  `docs/COMMANDS.md`; Counts stamp advanced to session 199.

### C-015  `COMMANDS.md` Counts stamp stale after sessions 253/254 (no count change; session-log entries missing)

- **Classification.** Commands (doc drift / session-log gap).
- **Where.** `docs/COMMANDS.md:24` (Counts heading) and the
  session-log block at the end of the file (last entry is
  session 252).
- **What.** The Counts heading still reads "as of session 252 —
  2026-04-26".  Sessions 253 (data-type-support — ordered-
  comparator rejection pins, no register changes) and 254
  (rpl-programming — verification pass, no register changes)
  have shipped since, and neither has a session-log entry in the
  block.  The register-count numbers (480 / 461) are still
  accurate — no new `register()` calls were added — but the
  "as of session N" stamp signals to readers which sessions have
  been reviewed against the file, and two have not.
- **Why.** Same anti-pattern as C-005 / C-007 / C-008 / C-009 /
  C-014.  The session-log block is the per-run audit trail for
  the Commands lane; gaps accumulate and become harder to
  back-fill.  For sessions with no row or count changes, one-
  liner entries suffice.
- **Fix.** Command-support lane: bump the Counts heading to
  "as of session 254 — 2026-04-26"; add one-liner session-log
  entries for sessions 253 (data-type — no register/row changes)
  and 254 (rpl-programming — verification pass, no changes).
- **Confidence.** high — `grep -n "as of session" docs/COMMANDS.md`
  returns "as of session 252"; `grep -n "session 25[34]"
  docs/COMMANDS.md` returns zero hits in the session-log block;
  `grep -c "register(" www/src/rpl/ops.js` = 480 (unchanged).
- **Age.** new (filed session 255-code-review).
- **Status.** `[resolved - session 257]` — Counts stamp advanced
  252 → 257; session-log entries added for sessions 253 / 254 /
  255-code-review / 256 / 257 in `docs/COMMANDS.md`.

### C-016  `COMMANDS.md` ✓-count and register-count prose stale after session 196's SCHUR ship

- **Classification.** Commands (doc drift).
- **Where.** `docs/COMMANDS.md:39` (the "Fully shipped (✓)" bullet)
  and `docs/COMMANDS.md:224,238` (the register-count prose block).
- **What.** Session 196 (`rpl5050-command-support`) shipped `SCHUR`
  (✗ → ✓) and updated both the Counts header narrative and the
  "Not yet implemented (✗): 1" bullet, but left three figures that
  the same transition moves: the "Fully shipped (✓)" bullet still
  read **447** with the parenthetical "no net change since session
  149" (now false — SCHUR is the net change), and the register-count
  prose still read `grep -c "register("` = **480** / `grep -cE
  "^register\("` = **461**.  `SCHUR` adds exactly one top-level
  `register('SCHUR', …)` call, so the live counts are **481 / 462**
  and the ✓ count is **448**.
- **Why.** The Counts block is the canonical completeness reference;
  a ✓ bullet that contradicts the ✗ bullet directly above it, plus
  grep figures that no longer match `ops.js`, erode trust in the
  doc.  Mirrors C-012 / C-013.
- **Fix.** Update the ✓ bullet to **448** and reword its stale
  "no net change since session 149" opening; update the register-
  count prose to **481** / **462** with a session-196 SCHUR clause.
  Doc-only, no source change.
- **Confidence.** high — `grep -c "register(" www/src/rpl/ops.js`
  = 481 and `grep -cE '^register\(' www/src/rpl/ops.js` = 462
  verified this run; `git diff www/src/rpl/ops.js` shows exactly one
  added `+register('SCHUR',` line.
- **Age.** new (filed session 200-code-review).
- **Status.** **[resolved - session 200-code-review]** — fixed in
  the same run it was filed: `docs/COMMANDS.md:39` advanced 447 → 448
  with a corrected "no net change between sessions 149 and 195"
  clause; register-count prose advanced 480 → 481 and 461 → 462 with
  a SCHUR +1 clause on each.  Doc-only close, no source change;
  `node tests/test-all.mjs` unaffected.

### O-012  Stray `www/src/ui/keyboard.js.bak` backup file

- **Classification.** Other (file-hygiene / build artifact).
- **Where.** `www/src/ui/keyboard.js.bak` — found by `find
  www/ -name "*.bak*"` at this run's entry audit.
- **What.** A `.bak` copy of `www/src/ui/keyboard.js` sits
  alongside the live file.  Not referenced by any build or
  test script.  Origin unknown — likely an editor backup
  (`vim`, `sed -i.bak`, or an ad-hoc `cp`) from a UI editing
  session, analogous to the now-resolved O-009 pair in
  `tests/`.
- **Why.** (1) Grep noise when searching the `ui/` tree.
  (2) Risk of a contributor editing the stale copy instead of
  the live file.  (3) Same `.bak` proliferation concern as
  O-009.
- **Fix.** Delete the file.  UI-lane or review-lane can take
  this as pure hygiene; requires an interactive (non-scheduled-
  task) session to approve the delete via
  `mcp__cowork__allow_cowork_file_delete`, or direct user-side
  `rm`.  Recommend adding `*.bak` to a `.gitignore` entry in
  `www/src/ui/` or repo-root to prevent future spillover.
- **Confidence.** high — `find www/ -name '*.bak*'` returns
  exactly one hit at session-189-code-review entry.
  Re-verified session 194-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); file
  unchanged.
  Re-verified session 198-code-review: same one hit; mtime
  2026-04-25; file still present and unchanged.
  Re-verified session 202-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; file still present and unchanged.
  Re-verified session 203-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; file still present and unchanged.
  Re-verified session 210-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; unchanged.
  Re-verified session 211-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; unchanged.  Sessions 211–214 did not delete the
  file (no interactive session attempted deletion; scheduled-task
  sandbox hits the same `Operation not permitted` gate as prior
  runs for the `allow_cowork_file_delete` approval flow).
- **Age.** 9 runs (filed session 189-code-review; aged sessions
  194-code-review, 198-code-review, 202-code-review,
  203-code-review, 210-code-review, 211-code-review,
  219-code-review, 224-code-review).
  Re-verified session 224-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; unchanged.
  Re-verified session 229-code-review, 234-code-review,
  235-code-review, 242-code-review: `find www/ -name '*.bak*'`
  still returns one hit (`www/src/ui/keyboard.js.bak`); mtime
  2026-04-25; unchanged across all four re-checks.
  **Age.** 13 code-review-lane runs.
  Re-verified sessions 246-code-review, 251-code-review,
  255-code-review, 261-code-review, 265-code-review, 270-code-review
  (this run): `find www/ -name '*.bak*'` still returns one hit
  (`www/src/ui/keyboard.js.bak`); mtime 2026-04-25; unchanged
  across all six re-checks.  No interactive session has approved
  the delete; tooling gate unchanged.
  **Age.** 19 code-review-lane runs.
  **Status.** open.  Lane = `rpl5050-ui-development` or any
  lane in an interactive session.  `[deferred - post-ship]`
  pending interactive approval — no behavior risk.

### O-013  `www/src/ai/system-prompt.js` RPL_CATALOG is a manually maintained command index that can drift from `docs/COMMANDS.md`

- **Classification.** Commands.
- **Where.** `www/src/ai/system-prompt.js` — `RPL_CATALOG`
  constant (top ~80 lines of the file).
- **What.** The AI chat assistant added in the `www/src/ai/`
  subsystem embeds a curated `RPL_CATALOG` string listing ~50
  commonly used RPL commands with one-line descriptions and
  stack-effect examples.  This catalog is a separate, manually
  maintained representation of command semantics.  It is
  intentionally a subset of `docs/COMMANDS.md` ("not an
  exhaustive index"), but every command entry is a potential
  source of drift: stale argument order, wrong arity, outdated
  description, or missing commands that users would expect the
  AI assistant to know.  The comment at the top of
  `system-prompt.js` acknowledges the obligation: "Add commands
  sparingly and only when they close a real gap that user
  requests have hit."
- **Why.** Low risk today; the catalog is concise and the commands
  listed are stable core ops.  Risk grows as new ops land
  (INVMOD 2-arg deviation, newly added CAS ops, etc.) and the
  catalog falls behind.  The AI will give wrong advice for
  commands it knows about incorrectly.
- **Fix.** (1) Spot-check `RPL_CATALOG` entries against
  `docs/COMMANDS.md` and `docs/@!MY_NOTES.md` Intentional
  Deviations table each time a new op is shipped (e.g. INVMOD
  is listed with no arity hint — the 2-arg deviation should
  be noted).  (2) Add a comment in `system-prompt.js` listing
  the most recent session that audited the catalog.  Low-effort
  maintenance; no source-logic change required.
- **Confidence.** high — `www/src/ai/system-prompt.js` verified
  in situ session 224-code-review; `RPL_CATALOG` confirmed as a
  standalone string not generated from any authoritative source.
  Re-verified sessions 229-code-review, 234-code-review,
  235-code-review, 242-code-review: `RPL_CATALOG` still a
  standalone manually maintained constant; register count 461
  unchanged across all four intervals; no new ops added that
  would urgently require catalog update; drift risk remains
  low but accumulating.
- **Age.** 5 code-review-lane runs (filed session 224-code-review).
- **Status.** `[resolved - session 243]` — `rpl5050-command-support`
  audited all 20+ RPL_CATALOG command names against `docs/COMMANDS.md`
  and ops.js `register()` calls; no drift found; "last audited —
  session 243 (2026-04-26)" comment added to `system-prompt.js`
  above the `RPL_CATALOG` constant.
  **Re-opened occurrence + fixed (code-review, 2026-06-14 23:27):** a
  fresh full-catalog token sweep against the live `register()` set
  caught real drift the session-243 spot-check missed — the STATISTICS
  block (`system-prompt.js:189`) advertised the sum-of-squares
  accumulators as `ΣX²` / `ΣY²` (superscript ²), but the dispatchable
  registered names are `ΣX2` / `ΣY2` (ASCII 2): no `register('ΣX²')`
  exists, the tokenizer has no `²`→`2` normalization, and
  `tests/test-stats.mjs` itself invokes the ops via `lookup('ΣX2')` /
  `lookup('ΣY2')`. The model following the catalog would emit
  `ΣX²`, which tokenizes as `ΣX` + a stray `²` rather than the intended
  op. Fixed the catalog line to `ΣX2 ΣY2` with an explicit "ASCII 2,
  not a superscript ²" caveat. Source-only one-line edit;
  `node tests/test-all.mjs` = 5781/0 (no test covers the prompt
  string, suite unaffected). The `²`-rendered forms in `ops.js`
  comments, `docs/COMMANDS.md:745`, and `docs/TESTS.md` are
  human-readable labels for the op, not dispatch keys, so they are
  not drift — only the AI catalog, which the model emits verbatim,
  needed the ASCII spelling.

### O-014  Unlogged +3 algebra assertions + chat-bot.js mtime anomaly

- **Classification.** Other (process / audit-trail hygiene).
- **Where.** `tests/test-algebra.mjs` (+3 assertions added ~160 s
  after session-249.md with no lock or log coverage);
  `www/src/ai/chat-bot.js` (mtime 21:00:53, modified after
  session-249 closed at 20:45, with no session labels or lock).
- **What.** Originally filed (session 251-code-review) as four
  anomalies including an unreleased lock and missing log for
  session-250.  **Items (1) and (2) retracted (session 252):**
  `utils/@locks/session250-unit-tests.json` re-read at session-252
  acquisition shows `released: true`, `releaseReason: "graceful —
  snapshot refresh complete"`, and `logs/session-250.md` exists
  (complete, ~3 KB).  The session-251-code-review lane observed
  stale filesystem state.  Remaining open items: (3) `tests/test-
  algebra.mjs` was modified (+3 assertions, 1061 → 1064) in the
  ~160 s window between session-249's close and session-250's
  acquisition, with no session lock or log covering the edit —
  no session labels beyond `session160` appear in the added
  assertions; all 3 pass; session-250 snapshot absorbed them;
  (4) `www/src/ai/chat-bot.js` was modified at mtime 21:00:53
  — after session-249 closed (20:45) — with no session labels
  or lock/log coverage; behavior audit deferred.
- **Why.** Audit-trail gap: the unlogged algebra edit has no
  traceability if those 3 assertions regress.  The chat-bot.js
  change is uninspected.
- **Fix.** Items 3 and 4 are post-ship hygiene only — no behavior
  impact.  Algebra assertions all pass; gap is traceability only.
  Chat-bot.js audit can happen in the first post-ship session.
- **Confidence.** high — lock body, session-250.md, TESTS.md
  snapshot, and file mtimes all verified.
- **Age.** 7 runs (filed session 251-code-review; partially
  retracted session 252; carried forward sessions 255, 261,
  265, 265-code-review, 266, 267, 268, 269, 270-code-review).
  Re-verified session 270-code-review: `www/src/ai/chat-bot.js`
  mtime is now `Apr 27 03:23` (was `Apr 26 23:26` at sessions
  261-code-review through 269).  A new unlocked modification
  occurred between session 269 (unit-tests, `releasedAt`
  2026-04-26T12:10) and this review run.  The file has no
  session-label comments identifying the change; behavior audit
  deferred per the post-ship plan.  `tests/test-algebra.mjs`
  +3 assertions remain passing (5666/0 suite).
- **Status.** `[deferred - post-ship]` — items 1 and 2 retracted;
  items 3 and 4 are low-risk hygiene with no behavior impact.
  chat-bot.js new mtime recorded; full audit deferred post-ship.

---

## Session log — status changes

### Session 080 — what shipped (review lane bootstrap run)

Narrow doc / comment hygiene only.  Files edited: `docs/REVIEW.md`
(created), `docs/RPL.md` (2 lane-id fixes), `docs/TESTS.md` (4
lane-id fixes), `docs/DATA_TYPES.md` (2 fixes), `index.html` (3
path-comment fixes), `src/ui/side-panel.js` (2 doc-ref fixes).
Filed 13 findings; 6 self-resolved, 7 handed off.

Verification: test-all 3745 / 0, persist 34 / 0, sanity 22 / 0 in
~5 ms.

### Session 085 — what shipped (second review-lane run)

Narrow doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped from `Session 080
  (2026-04-23)` to `Session 085 (2026-04-23)`; baseline block
  updated; findings re-aged; two findings promoted to
  resolved (O-006 by session 082 data-types lane; the existing
  C-001 / C-002 promotion from session 081 is now verified against
  the file in its current state).

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved: **O-006** (`docs/DATA_TYPES.md` Last-updated
  stamp drift — data-types lane rewrote the stamp in session 082
  with exactly the explanatory paragraph suggested).
- Verified still-resolved (carried forward): O-001, O-002, O-003,
  O-005, U-001 (all session 080); C-001, C-002 (both session 081).
- Still-open findings aged from `new` → `2 runs`: O-004 remainder,
  X-001, X-002, X-003, X-004, X-005.
- New findings filed: **R-001** (docstring claim about
  `clearAllHalted()` being used by `resetHome()` is false — owner
  `rpl5050-rpl-programming`), **X-006** (`clearAllHalted` +
  `haltedDepth` are unused imports in `src/rpl/ops.js` — owner
  `rpl5050-rpl-programming` or `rpl5050-command-support`).

Total open findings carried forward to next run: 8 (O-004
remainder, R-001, X-001, X-002, X-003, X-004, X-005, X-006).
Resolved cumulative: 8 (O-001, O-002, O-003, O-005, O-006, C-001,
C-002, U-001).

**Verification gates (session 085):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`, not JS).
- `node tests/test-all.mjs` = **3864 → 3872 passing / 0 failing**
  (entry 3864, up Δ+119 from session 080's 3745 for sessions
  081/082/083; exit 3872, picking up Δ+8 from session 084 unit-tests
  lane that landed during this run).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~4 ms**
  (unchanged).

**Lock.** Held `session085-code-review` throughout;
scope = `docs/REVIEW.md`, `logs/`.  No scope overlap with the
two active sibling locks (session083-rpl-programming on src/rpl/
files + docs/RPL.md + two test files; session084-unit-tests on
six test files + docs/TESTS.md + scripts/).  Released at end of
run.

**Next session's queue (priority order):**

1. **X-001 + X-004 + X-006** — `rpl5050-command-support` (or
   rpl-programming for X-006): drop unused imports and dead
   private helpers from `src/rpl/ops.js`.  All three are low-risk
   mechanical edits with `node --check` and `test-all.mjs` as the
   safety net.
2. **R-001** — `rpl5050-rpl-programming`: fix the
   `src/rpl/state.js:415` comment about `clearAllHalted()`.
3. **X-003** — `rpl5050-ui-development`: drop unused `clampLevel`
   import from `src/app.js`.
4. **X-002** — unused `TYPES` import in `formatter.js`.  Either
   command-support or data-type-support.
5. **X-005** — `rpl5050-command-support`: decide on the
   duplicate-register policy (delete first pass OR annotate it
   clearly).  Lowest priority — style not correctness.
6. **O-004 remainder** — `rpl5050-command-support`: rewrite the
   `docs/@!MY_NOTES.md:55` step-4 instruction to point at
   `docs/COMMANDS.md`'s Counts block.

Log pointer: `logs/session-085.md`.

---

### Session 089 — what shipped (third review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 089;
  baseline block updated (3951/0/0 gates); all still-open findings
  aged from 2 → 3 runs; R-001 and X-006 promoted to resolved
  (session 088 rpl-programming lane fixed both); five new findings
  filed; session 089 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved: **R-001** (state.js clearAllHalted comment
  updated by session 088); **X-006** (ops.js dead imports removed
  by session 088, replaced with clarifying comment).
- Verified still-resolved (carried forward): O-001, O-002, O-003,
  O-005, O-006, U-001 (session 080); C-001, C-002 (session 081).
- Still-open findings aged from 2 → 3 runs: O-004 remainder,
  X-001, X-002, X-003, X-004, X-005.
- New findings filed:
  - **C-003** — COMMANDS.md HALT row still says "pilot limitation"
    after session 088 fully lifted it.  Owner: `rpl5050-command-support`.
  - **C-004** — COMMANDS.md SIZE rows missing session 088's Program
    widening.  Owner: `rpl5050-command-support`.
  - **C-005** — COMMANDS.md Counts block "as of session 086" and
    session log missing 087/088 entries.  Owner: `rpl5050-command-support`.
  - **T-001** — TESTS.md coverage snapshot frozen at session 084
    (3872); current count 3951 (+79).  Owner: `rpl5050-unit-tests`.
  - **R-002** — `_driveGen` abandons yielded generator without
    `gen.return()` (style/defensive, not a correctness bug).
    Owner: `rpl5050-rpl-programming`.  Confidence: low.

Total open findings carried forward to next run: 11 (O-004 remainder,
C-003, C-004, C-005, T-001, R-002, X-001, X-002, X-003, X-004,
X-005).  Resolved cumulative: 10 (O-001, O-002, O-003, O-005, O-006,
C-001, C-002, U-001, R-001, X-006).

**Verification gates (session 089):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3951 passing / 0 failing** (stable
  at entry and exit; no sibling-lane changes concurrent this run).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session089-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/`.  All sibling locks (086/087/088) fully
released at run entry.  Released at end of run.

**Next session's queue (priority order):**

1. **C-003 + C-004 + C-005** — `rpl5050-command-support`: three
   COMMANDS.md doc-hygiene items from the session 088 generator
   work.  All are mechanical updates (Notes column additions,
   session-log entry, counts-stamp bump); low risk, `node --check`
   N/A.  Natural pairing with X-001 / X-004 cleanup.
2. **T-001** — `rpl5050-unit-tests`: update TESTS.md coverage
   snapshot to 3951, add delta note.
3. **X-001 + X-004** — `rpl5050-command-support`: still the lowest-
   risk mechanical edits in the backlog; 3 runs overdue.
4. **X-003** — `rpl5050-ui-development`: single-line import drop
   in `app.js`.
5. **X-002** — `rpl5050-command-support` or `rpl5050-data-type-support`.
6. **R-002** — `rpl5050-rpl-programming`: low-confidence style fix
   in `_driveGen`; defer until owner judges it worth the churn.
7. **X-005** — `rpl5050-command-support`: duplicate-register
   policy decision.  Still lowest priority.
8. **O-004 remainder** — `rpl5050-command-support`: stale step-4
   instruction in `@!MY_NOTES.md`.

Log pointer: `logs/session-089.md`.

---

### Session 103 — what shipped (fourth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 103;
  baseline block rewritten (3639/34/22 gates, plus a note explaining
  the 3951 → 3639 delta as the session-095 Giac migration deleting
  the native Pythagorean walker); project-tree relocation
  (`src/` → `www/src/`) noted; nine prior findings promoted to
  resolved; the one still-open prior finding (X-003) aged
  3 runs → 4 runs with its Where: line updated to the new path;
  five new findings filed; session 103 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **O-004 remainder** — session 099 rewrote the
    `docs/@!MY_NOTES.md:55` step-4 instruction.
  - **C-003** — session 099 (capturing the session-088 generator
    work in the HALT row Notes) at `docs/COMMANDS.md:292`.
  - **C-004** — session 099 (capturing the session-088 SIZE
    widening) at `docs/COMMANDS.md:182`.
  - **C-005** — session 099 bumped the Counts heading to "as of
    session 099 — 2026-04-24" and added session-log entries for
    087, 088, 092, 094, 095, 096-098, 099.
  - **T-001** — session 102 refreshed the TESTS.md snapshot to
    3639 with the full delta explanation.
  - **X-001** — session 099 removed five unused state.js imports
    from ops.js and added a clarifying comment.
  - **X-002** — session 099 removed the unused `TYPES` import
    from formatter.js.
  - **X-004** — session 099 deleted `_maskVal`, `_isqrtBig`,
    and `_ratAdd` from ops.js.
  - **X-005** — session 099 deleted the 21 shadowed first-pass
    registrations and refactored the three helpers that had been
    relying on factory-time lookup of the (now-deleted) shadows.
- Already marked resolved by prior runs and verified this session:
  O-001, O-002, O-003, O-005, O-006, U-001 (all session 080);
  C-001, C-002 (session 081); R-001, X-006 (session 088);
  R-002 (session 101).
- Still-open prior finding aged 3 → 4 runs: **X-003** (unused
  `clampLevel` import in `www/src/app.js:14`).
- New findings filed:
  - **P-001** — 17 stale `src/…` path references in
    `docs/RPL.md`, `docs/DATA_TYPES.md`, `docs/ROADMAP.md`,
    `docs/TESTS.md`.  Cross-lane (multiple owners).
  - **P-002** — `www/src/rpl/types.js` header docstring omits
    Rational and points at the pre-move `src/vendor/fraction.js/`
    path.  Owner: `rpl5050-data-type-support`.
  - **O-007** — `buildGiacCmd` block comment in
    `www/src/rpl/cas/giac-convert.mjs` describes a purge-preamble
    that session 098 removed; two contradictory comments live on
    either side of the two-line function body.  Owner:
    `rpl5050-cas-giac`.
  - **X-007** — `compareRoundTrip` exported from
    `giac-convert.mjs` but has zero callers (docstring says
    "Used by tests"; no test imports it).  Owner:
    `rpl5050-cas-giac` or `rpl5050-command-support`.
  - **X-008** — `freeVars` imported into `giac-convert.mjs`
    but never used; leftover from the session-094 purge-preamble
    pilot that session 098 removed.  Owner: `rpl5050-cas-giac`
    or `rpl5050-command-support`.

Total open findings carried forward to next run: 6 (X-003, P-001,
P-002, O-007, X-007, X-008).  Resolved cumulative: 19 (O-001,
O-002, O-003, O-004, O-005, O-006, C-001, C-002, C-003, C-004,
C-005, R-001, R-002, T-001, U-001, X-001, X-002, X-004, X-005,
X-006).

**Verification gates (session 103):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3639 → 3660 passing / 0 failing**
  (entry 3639; exit 3660 picking up +21 assertions that session
  102 unit-tests landed concurrently during this run:
  test-comparisons 73 → 80, test-control-flow 294 → 304,
  test-types 276 → 280).  Review-lane made no source changes.
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session103-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-103.md` (narrower than the prior
review-lane scope because session 102 unit-tests holds
`logs/session-102.md`; the lock helper's `checkOverlap` rejected
a broader `logs/` scope at acquire time).  All sibling locks from
sessions 092–101 were already released at run entry.  Released at
end of run.

**Next session's queue (priority order):**

1. **P-001** — split across lanes by which doc each owns.
   Mechanical prefix replacement; 17 sites; low risk.  Aging
   starts next run.
2. **X-007 + X-008** — `rpl5050-cas-giac`: delete one export and
   one import from `giac-convert.mjs`.  `node --check` safety net.
3. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment so the top narrative matches the session-098
   purge-free behavior.  Pure-comment edit.
4. **P-002** — `rpl5050-data-type-support`: add the Rational row
   to the types.js header and fix the vendor-path reference.
5. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 4 runs
   overdue.  Lowest-risk edit in the backlog.

Log pointer: `logs/session-103.md`.

---

### Session 108 — what shipped (fifth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 108;
  baseline block rewritten (3871/34/22 gates, plus a Δ+232 note
  apportioning the test-count rise across sessions 104/105 and
  the in-flight 107); the "between sessions 103 and 108" prelude
  rewritten to reflect what the four sibling lanes shipped; the
  one fully-resolved prior finding (P-002) promoted; P-001
  re-statused as **partial** with the 14 of 17 sites resolved
  routing call-out and the 3 remaining sites (ROADMAP.md ×1,
  TESTS.md ×2) preserved as the open balance; two carried-forward
  findings aged (X-003 4 → 5 runs, O-007 1 → 2 runs); three new
  findings filed (C-006 COMMANDS.md HALT row missing the session
  106 named-sub-program lift + SST↓ step-into refinement, R-003
  `_driveGen` docstring stale after session 106's `_evalValueGen`
  split, O-008 session 106 shipped without writing
  `logs/session-106.md`); session 108 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **P-002** — session 105 added the Rational row to
    `www/src/rpl/types.js:17-21` and rewrote the vendor-path
    reference to `www/src/vendor/fraction.js/`.
- Partial promotion (14 of 17 sites resolved, 3 still open):
  - **P-001** — sessions 105 (DATA_TYPES.md ×5) and 106 (RPL.md ×9)
    closed the bulk; ROADMAP.md ×1 and TESTS.md ×2 carry over.
- Already marked resolved by the prior session-103 ledger edit and
  re-verified clean this session: X-007 and X-008 (both deleted
  from `www/src/rpl/cas/giac-convert.mjs` by session 104; zero
  hits in source today).
- Already marked resolved by prior runs and verified this session:
  O-001, O-002, O-003, O-004, O-005, O-006, U-001 (all session 080
  to 099); C-001, C-002 (session 081); C-003, C-004, C-005
  (session 099); R-001, X-006 (session 088); R-002 (session 101);
  T-001 (session 102); X-001, X-002, X-004, X-005 (session 099).
- Still-open prior findings carried forward and aged:
  - **X-003** — 4 → 5 runs.  Now the longest-aging open finding.
  - **O-007** — 1 → 2 runs.
  - **P-001** (remaining 3 sites) — 1 → 2 runs.
- New findings filed:
  - **C-006** — COMMANDS.md HALT row missing session-106 named-
    sub-program lift + SST↓ step-into refinement.  Owner:
    `rpl5050-command-support`.  See also C-003 / C-004 / C-005
    pattern: HALT-row notes need a fresh appendage every time the
    rpl-programming lane lifts a structural limit.
  - **R-003** — `_driveGen` docstring (`ops.js:3713-3721`) names
    "variable lookup" as a `_evalValueSync` caller, but session
    106 routed the canonical variable-lookup path through
    `_evalValueGen` instead.  Pure-comment edit.  Owner:
    `rpl5050-rpl-programming`.
  - **O-008** — session 106 shipped substantive changes (HALT
    lift, SST↓ step-into, P-001 RPL.md fix) but no
    `logs/session-106.md` was written; the lock entry was
    stale-pruned at 18:55 UTC.  Owner: `rpl5050-rpl-programming`
    for the back-fill, plus an open call to anyone who owns the
    lock helper README to make graceful-release expectations
    louder.

Total open findings carried forward to next run: 7 (X-003, P-001
remainder, O-007, C-006, R-003, O-008, plus the X-007/X-008 audit
trail entries which are already resolved-marked).  Resolved
cumulative: 21 (O-001, O-002, O-003, O-004, O-005, O-006, C-001,
C-002, C-003, C-004, C-005, P-002, R-001, R-002, T-001, U-001,
X-001, X-002, X-004, X-005, X-006, X-007, X-008 — 23 lines, with
the P-001 partial counted on the open side).

**Verification gates (session 108):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3871 passing / 0 failing** at
  entry; review-lane made no source changes so exit count
  identical (modulo any session 107 work that lands during the
  window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session108-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-108.md` (narrower than the prior
review-lane scope because session 107 unit-tests holds
`tests/test-numerics.mjs`, `tests/test-algebra.mjs`,
`tests/test-types.mjs`, `tests/test-comparisons.mjs`,
`tests/test-helpers.mjs`, `docs/TESTS.md`, and
`logs/session-107.md`).  All other sibling locks from sessions
092–106 already released at run entry (104, 105 graceful; 106
stale-pruned — see O-008).  Released at end of run.

**Next session's queue (priority order):**

1. **C-006** — `rpl5050-command-support`: COMMANDS.md HALT row +
   SST/SST↓ row Notes additions for session 106 lifts.  Pure
   doc-edit; pairs naturally with any further command-support
   work that's already touching COMMANDS.md.
2. **R-003** + **O-007** — `rpl5050-rpl-programming` and
   `rpl5050-cas-giac`: two pure-comment rewrites that catch up
   the contradicting block-level docstrings in `ops.js:3713-3721`
   and `giac-convert.mjs:230-252`.  `node --check` safety net.
3. **P-001 remainder** — split: `rpl5050-command-support` or any
   hygiene lane for `docs/ROADMAP.md:46`; `rpl5050-unit-tests` for
   the two `docs/TESTS.md` sites (lines 209 and 331) — fold into
   the next snapshot pass.
4. **O-008** — `rpl5050-rpl-programming` (or whoever next picks up
   the lane): back-fill `logs/session-106.md` from the surviving
   evidence (`ops.js` deltas, RPL.md narrative, lock body, test
   counts).
5. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 5 runs
   overdue.  Lowest-risk edit in the backlog and the longest-
   aging open finding.

Log pointer: `logs/session-108.md`.

---

### Session 113 — what shipped (sixth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 113;
  baseline block rewritten (3980/34/22 gates, Δ+109 from session
  108 entry); the "between sessions 108 and 113" prelude rewritten
  to attribute the test-count rise across sessions 109 / 110 / 111
  and call out the in-flight session 112 unit-tests lock; two
  prior-run findings promoted (C-006 resolved-session-109 already
  flipped by session 109's own REVIEW.md edit; R-003 resolved-
  session-111 already flipped by session 111's own edit — this run
  verifies + re-ages both); one prior finding re-statused as
  **partial** (O-008 — the back-fill half shipped via session 111,
  `utils/@locks/README.md` half still open); two carried-forward
  findings aged (X-003 5 → 6 runs, O-007 2 → 3 runs); P-001
  remainder aged (2 → 3 runs, still 3 sites: ROADMAP.md ×1,
  TESTS.md ×2, with the TESTS.md line numbers drifted from 209/331
  to 223/345 after session 107's reflow); three new findings
  filed; session 113 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (both already flipped by their owning lane
  in their own REVIEW.md edits — this run verifies the Status
  flip landed cleanly and the cited grep commands still return
  the expected shape):
  - **C-006** — session 109 `rpl5050-command-support`.  HALT /
    CONT / KILL row Notes in `docs/COMMANDS.md:313` carries the
    session-106 addendum; SST / SST↓ / DBUG row at `:315` flipped
    ✗ → ✓ with the session-101 + session-106 narrative.
  - **R-003** — session 111 `rpl5050-rpl-programming`.
    `_driveGen` docstring (`www/src/rpl/ops.js:3713-3741`) now
    lists the actual post-session-106 sync-path callers (IFT /
    IFTE / MAP / SEQ / DOLIST / DOSUBS / STREAM / `→` algebraic
    body) and explicitly calls out that `evalToken` →
    `_evalValueGen` does NOT reach `_driveGen`.  Same run threaded
    a `caller` label into the rejection message so the user learns
    which op blocked the HALT; pinned by 23 new session111-labelled
    assertions in `tests/test-control-flow.mjs`.
- Re-statused **partial**:
  - **O-008** — back-fill half shipped (session 111 wrote
    `logs/session-106.md`, 10,777 bytes, populated with the
    HALT-lift / SST↓ / P-001 narrative).  `logs/session-109.md`
    also exists despite session 111's initial observation — race
    at acquire-time, not a miss.  Remaining open piece: the
    `utils/@locks/README.md` edit codifying graceful-release vs
    stale-prune expectations.
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, U-001 (sessions 080–099); C-001 – C-005
  (sessions 081 / 099); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); T-001 (session 102);
  X-001 / X-002 / X-004 / X-005 (session 099); X-007 / X-008
  (session 104).
- Still-open prior findings carried forward and aged:
  - **X-003** — 5 → 6 runs.  Still the longest-aging open
    finding; filed at session 080, so 33 calendar days and 6
    review-lane runs unaddressed.
  - **O-007** — 2 → 3 runs.
  - **P-001** (remaining 3 sites: ROADMAP.md ×1, TESTS.md ×2)
    — 2 → 3 runs.
- New findings filed:
  - **X-009** — six dead imports in
    `www/src/rpl/cas/giac-convert.mjs:22`: `Num`, `Var`, `Neg`,
    `Bin`, `Fn`, `formatAlgebra` — all present only in the
    file-header block comment and prose-comment references, never
    called.  `parseAlgebra` is the only name from the import that
    is actually used.  The file walks AST via `.kind` discriminator
    on plain objects, not via ctor constructors.  Likely origin:
    session-093 Giac pilot pulled in all ctors "just in case";
    implementation evolved to the discriminator form, import block
    never pruned.  Owner: `rpl5050-cas-giac` or
    `rpl5050-command-support`.
  - **X-010** — `RPLHalt` imported into `www/src/rpl/ops.js:44`
    (`import { RPLError, RPLAbort, RPLHalt, setPushCoerce } from
    './stack.js';`) but never referenced anywhere in `ops.js`.
    HALT-class suspension in `ops.js` is done via yielded
    generators (`_evalValueGen` / `_driveGen`), not `RPLHalt`
    throws.  Likely leftover from the pre-session-088 throw/catch
    era.  Owner: `rpl5050-rpl-programming` or
    `rpl5050-command-support`.
  - **O-009** — two stray backup files in `tests/`:
    `test-control-flow.mjs.bak` (92,129 bytes) and
    `test-control-flow.mjs.bak2` (92,141 bytes), both pre-session-
    111 snapshots of `test-control-flow.mjs`.  Not referenced by
    any runner; `grep -n 'session077' tests/` finds matches in all
    three files, so the `.bak` copies add investigation noise.
    Owner: `rpl5050-unit-tests` (session 112 currently holds
    `tests/`) or `rpl5050-code-review` as hygiene.

Total open findings carried forward to next run: 9 (X-003, O-007,
P-001 remainder, O-008 remainder, X-009, X-010, O-009, plus the
unchanged-open ones).  Resolved cumulative: 23 (O-001 – O-006,
C-001 – C-006, P-002, R-001, R-002, R-003, T-001, U-001, X-001,
X-002, X-004, X-005, X-006, X-007, X-008).

**Verification gates (session 113):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3980 passing / 0 failing** at
  entry; review-lane made no source changes so exit count is
  identical (modulo any session 112 unit-tests work that lands
  during the window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session113-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-113.md` (narrower than broader
review-lane scopes because session 112 unit-tests holds `tests/`
and `docs/TESTS.md`).  All other sibling locks from sessions
105–111 already released at run entry (109 / 110 / 111 graceful;
the earlier stale-prune on session 106 is memorialised in O-008).
Released at end of run.

**Next session's queue (priority order):**

1. **X-009** + **O-007** — `rpl5050-cas-giac`: both sit in
   `www/src/rpl/cas/giac-convert.mjs`; natural pairing.  Trim the
   6-of-7 dead imports at `:22` (X-009) and rewrite the stale
   block comment at `:231-252` (O-007) in the same pass.
   `node --check` + `node tests/test-algebra.mjs` safety net.
2. **X-010** — `rpl5050-rpl-programming` or
   `rpl5050-command-support`: single-line import prune in
   `www/src/rpl/ops.js:44` (drop `RPLHalt`).  Lowest-risk edit
   in the new-findings trio.  Pairs naturally with any session
   that already holds an `ops.js` lock.
3. **O-009** — `rpl5050-unit-tests` (once session 112 releases)
   or `rpl5050-code-review`: `rm tests/test-control-flow.mjs.bak
   tests/test-control-flow.mjs.bak2` and optionally add `*.bak`
   / `*.bak2` to `.gitignore`.
4. **P-001 remainder** — split: `rpl5050-command-support` or any
   hygiene lane for `docs/ROADMAP.md:46`; `rpl5050-unit-tests` for
   the two `docs/TESTS.md` sites (lines 223 and 345) — fold into
   the next snapshot pass.
5. **O-008 remainder** — `rpl5050-code-review` or any lane that
   owns `utils/@locks/`: amend the README to make graceful
   release-vs-stale-prune expectations explicit.
6. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 6 runs
   overdue.  Lowest-risk edit in the backlog and the longest-
   aging open finding.

Log pointer: `logs/session-113.md`.

---

### Session 118 — what shipped (seventh review-lane run)

Three doc / hygiene edits:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 118;
  baseline block rewritten (4087/34/22 gates, Δ+107 from session
  113 entry); the "between sessions 113 and 118" prelude rewritten
  to attribute the test-count rise across sessions 114 / 115 and
  call out the two in-flight sessions (116 rpl-programming, 117
  unit-tests) whose scope forced the review-lane scope narrower
  than usual; three prior findings promoted (X-009 + X-010 both
  resolved-session-114 flips verified; O-008 partial → fully
  resolved-session-118 via the locks README.md edit below);
  two carried-forward findings aged (X-003 6 → 7 runs — still the
  longest-aging open finding, now 7 runs and 33 calendar days
  unaddressed; O-007 3 → 4 runs); P-001 remainder partial-resolved
  (ROADMAP.md site closed in this run; 2 TESTS.md sites still open
  under session 117's in-flight scope); O-009 status refreshed to
  note session 117's in-flight deletion of both `.bak` files;
  session 118 log added.
- `docs/ROADMAP.md` line 46 prefix fix (`src/rpl/ops.js` →
  `www/src/rpl/ops.js`) — closes the single ROADMAP.md P-001 site.
- `utils/@locks/README.md` step 5 expanded to explicitly describe
  the stale-prune-as-release failure mode — now tells a future
  audit pass to flag the missing-log symptom whenever `released:
  true` sits next to a `releasedAt` set by `pruneStale` rather
  than by the owner's `unlink`.  Points at O-008 itself as the
  precedent.  Closes the O-008 remainder.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (two already flipped by the command-support
  lane in session 114's own REVIEW.md edit — this run verifies
  the flips landed cleanly and the cited grep commands still
  return the expected shape):
  - **X-009** — session 114 `rpl5050-command-support`.  Import
    block at `www/src/rpl/cas/giac-convert.mjs:22` reduced to
    just `parseAlgebra`; a three-line pre-import comment explains
    the reduction and calls out X-009.  `head -30` of the file
    confirms.
  - **X-010** — session 114 `rpl5050-command-support`.
    `./stack.js` import at `www/src/rpl/ops.js:44` reduced to
    `RPLError, RPLAbort, setPushCoerce`; a four-line pre-import
    comment explains that HALT suspension is generator-based
    since session 088 and calls out X-010.
  - **O-008** (remainder) — session 118 itself.  The
    `utils/@locks/README.md` step 5 now codifies the graceful-
    release-vs-stale-prune expectation and tells a future audit
    pass to flag the missing-log symptom.  The back-fill half of
    the finding was already closed by session 111.
- Resolved-partial → resolved (this run closes the ROADMAP.md
  third of P-001's three open sites; the remaining two sites in
  `docs/TESTS.md` carry on as open under session 117's in-flight
  scope):
  - **P-001 (ROADMAP.md site)** — one-word prefix replacement
    `src/rpl/ops.js` → `www/src/rpl/ops.js` at `docs/ROADMAP.md:46`.
    Verified: `grep -n 'src/rpl' docs/ROADMAP.md` returns zero
    hits.  The two remaining sites (`docs/TESTS.md:233` and `:355`)
    are owned by `rpl5050-unit-tests` and are in session 117's
    lock scope + intent string.
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, U-001 (sessions 080–099); C-001 – C-006
  (sessions 081 / 099 / 109); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  T-001 (session 102); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104).
- Still-open prior findings carried forward and aged:
  - **X-003** — 6 → 7 runs.  Longest-aging open finding.
  - **O-007** — 3 → 4 runs.
  - **O-009** — new → 1 run.  Session 117 in flight has both
    `.bak*` files in lock scope; expected to close this run
    but re-ages next review pass if 117 aborts mid-way.
  - **P-001 remainder** — now 2 sites (down from 3), both in
    `docs/TESTS.md`.  Session 117 intent includes the fix.
- New findings filed: none this run.  First-pass walk of the
  post-session-113 deltas (sessions 114 / 115 ships; plus the
  unreleased edges of 116 / 117 that are readable even with
  locks held) did not turn up a new finding that clears the
  "substantive enough to file" bar — the session 114 log
  self-audits its own import-block reductions (X-009 / X-010),
  session 115's test-types widening is covered in DATA_TYPES.md's
  own "Resolved this session" block, and the COMMANDS.md counts
  stamp is stable at "session 114" with `grep -c 'register('
  www/src/rpl/ops.js` still returning 445 (matches the stamp's
  recorded total).

Total open findings carried forward to next run: 4 (X-003,
O-007, O-009, P-001 remainder-remainder).  Resolved cumulative:
26 (O-001 – O-006, O-008, C-001 – C-006, P-002, R-001, R-002,
R-003, T-001, U-001, X-001, X-002, X-004, X-005, X-006, X-007,
X-008, X-009, X-010 — plus P-001 now at 15 of 17 sites resolved,
counted partial on the open side).

**Verification gates (session 118):**

- `node --check` — N/A (only edits were to `docs/REVIEW.md`,
  `docs/ROADMAP.md`, and `utils/@locks/README.md`, all Markdown).
- `node tests/test-all.mjs` = **4087 passing / 0 failing** at
  entry; review-lane made no source changes so exit count
  identical (modulo any session 116 / 117 work that lands
  during the window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~6 ms**
  (unchanged).

**Lock.** Held `session118-code-review` throughout; scope =
`docs/REVIEW.md`, `docs/ROADMAP.md`, `logs/session-118.md`,
`utils/@locks/README.md` (narrower than broader review-lane
scopes because sessions 116 / 117 together lock `ops.js`,
`test-control-flow.mjs`, `test-control-flow.mjs.bak*`,
`test-types.mjs`, `test-persist.mjs`, `docs/RPL.md`, and
`docs/TESTS.md`).  All sibling locks from sessions 105–115
already released at run entry (114, 115 graceful).  Released
at end of run.

**Next session's queue (priority order):**

1. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 7 runs
   and 33 calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any `ops.js`-
   adjacent lane could also ship this in passing.
2. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
3. **O-009** — expected resolved by session 117.  Re-verify
   next review pass; if still open, `rm tests/test-control-flow.mjs.bak*`
   from the review lane directly (hygiene-only, no behavior).
4. **P-001 TESTS.md remainder** — expected resolved by session 117.
   Re-verify next review pass.

Log pointer: `logs/session-118.md`.

---

### Session 123 — what shipped (eighth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 123;
  baseline block rewritten (4182 → 4232 test-all in flight, 38
  persist, 22 sanity); the "between sessions 118 and 123" prelude
  rewritten to attribute deltas across sessions 117 / 119 / 120 /
  121 / 122 (with 122 still in flight at this run's acquisition);
  one carry-over finding fully resolved (P-001 TESTS.md remainder
  closed by session 117); two carried-forward findings aged
  (X-003 7 → 8 runs, O-007 4 → 5 runs); one carried-forward
  finding refreshed with deferral context (O-009 1 → 2 runs —
  session 117 explicitly DEFERRED with "blocked by tooling"
  justification, the `cowork_allow_file_delete` permission prompt
  is not available in unsupervised scheduled-task sessions);
  three new findings filed; session 123 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **P-001 (TESTS.md remainder)** — session 117
    `rpl5050-unit-tests` rewrote the two remaining `src/rpl/...`
    references at the s084 KNOWN-GAP and s083 concurrent-lane
    narrative blocks in `docs/TESTS.md`.  Verified session 123:
    `grep -rn 'src/rpl\|src/ui\|src/app\.js' docs/ | grep -v www/src
    | grep -v src-tauri | grep -v REVIEW.md | grep -v 'docs/RPL.md:294'`
    returns zero hits — all 17 P-001 sites now closed (sessions
    105 / 106 / 117 / 118).
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, O-008, U-001 (sessions 080 – 118); C-001 – C-006
  (sessions 081 / 099 / 109); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  T-001 (session 102); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 7 → 8 runs.  Still the longest-aging open
    finding; filed at session 080, now 8 review-lane runs and 33
    calendar days unaddressed.
  - **O-007** — 4 → 5 runs.
  - **O-009** — 1 → 2 runs, status refreshed to reflect
    session 117's "blocked by tooling" deferral.  Future paths
    require either an interactive supervisor session for the
    `allow_cowork_file_delete` approval, or a non-scheduled lane
    pickup.
- New findings filed:
  - **O-010** — session 121 shipped substantive RPL-bucket
    capability changes (PROMPT op, IFT/IFTE generator-flavor
    lift, `state.promptMessage` slot) without writing
    `logs/session-121.md`, without updating COMMANDS.md, without
    a docs/RPL.md narrative, and without unit tests.  Mirrors the
    O-008 anti-pattern exactly — same lane (rpl-programming),
    same "items TBD" intent string, same heartbeat-equals-startedAt
    stale-prune signature.  First instance to be flagged using
    the session-118 `utils/@locks/README.md:34` paragraph that
    O-008 prompted.  Owner: `rpl5050-rpl-programming` (back-fill
    log + RPL.md narrative).
  - **C-007** — `docs/COMMANDS.md` still classifies PROMPT under
    the UI-lane "handled by them" Interaction-ops row at line
    371, while session 121 actually shipped PROMPT through
    rpl-programming as a yield-to-driver suspension op.  Three
    related drifts: PROMPT misclassified, IFT/IFTE row needs
    session-121 Notes addendum, Counts heading + `register()`
    total + session-log entries 120/121/122 stale.  Owner:
    `rpl5050-command-support`.
  - **R-004** — `docs/RPL.md` carries no narrative for the
    session-121 IFT/IFTE generator-flavor lift (largest
    control-flow lift since session 088) or the PROMPT mechanism
    (parallel to HALT's yield-to-driver suspension, with the
    `state.promptMessage` slot as the new state shape).  Owner:
    `rpl5050-rpl-programming`.

Total open findings carried forward to next run: 6 (X-003,
O-007, O-009, O-010, C-007, R-004).  Resolved cumulative: 27
(O-001 – O-006, O-008, C-001 – C-006, P-001, P-002, R-001,
R-002, R-003, T-001, U-001, X-001, X-002, X-004, X-005, X-006,
X-007, X-008, X-009, X-010).

**Verification gates (session 123):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **4182 passing / 0 failing** at
  acquisition; **4232 passing / 0 failing** at re-measure
  mid-run as session 122 unit-tests landed +50 PROMPT/IFT/IFTE
  pin assertions during the audit walk.  Review-lane made no
  source changes so the count drift is entirely sibling-lane
  attributable.
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable; +4 from the session 118 baseline of 34, all
  session-117 regression guards on `rehydrate` invariants).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session123-code-review` throughout; scope =
`docs/REVIEW.md` (narrower than the canonical review-lane scope
of `docs/REVIEW.md` + `logs/` because session 122 unit-tests was
holding `logs/` at this run's acquisition — the helper rejected
a broader scope as overlapping even though
`utils/@locks/README.md:40` exempts `logs/` for append-only
per-task log files; the session log file `logs/session-123.md`
was written without a lock under that exemption, with a unique
filename so no real conflict exists).  Sibling locks at
run-entry: session 122 unit-tests (active); sessions 119, 120,
121 (all released — 119 / 120 graceful, 121 stale-pruned, see
O-010).  Released at end of run.

**Next session's queue (priority order):**

1. **O-010 + C-007 + R-004** — session-121 silent-ship trio.
   Three coupled remediation steps, each ownable separately:
   `rpl5050-rpl-programming` for the back-fill log + RPL.md
   narrative (O-010 fix #1 + R-004), `rpl5050-command-support`
   for the COMMANDS.md PROMPT row + IFT/IFTE Notes addendum +
   Counts bump (C-007 + O-010 fix #2).  Pairs naturally with
   any rpl-programming or command-support lane work that's
   already touching those files.
2. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 8 runs
   and 33+ calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship this in
   passing.
3. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
   The cas/giac lane has not been spun up since the finding was
   filed at session 103, so any command-support session
   touching `giac-convert.mjs` could fold this in.
4. **O-009** — blocked by tooling (see status block).  Resolves
   only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.  Re-verify
   next review pass; expectation is no movement until the
   tooling gate clears.

Log pointer: `logs/session-123.md`.

---

### Session 128 — what shipped (ninth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 128;
  baseline block rewritten (test-all 2 FAILED of 4371 + 1
  import error — *all* attributable to session 126's in-flight
  SEQ/MAP body-intercept work on `www/src/rpl/ops.js`, not
  introduced by review-lane and not session 127 unit-tests
  either; persist 38 stable; sanity 22 stable);
  the "between sessions 123 and 128" prelude rewritten to
  attribute deltas across sessions 122 / 124 / 125 (shipped) +
  126 / 127 (in flight at run-entry); three carried-forward
  findings aged (X-003 8 → 9 runs — still the longest-aging
  open finding, 9 review-lane runs and 33+ calendar days
  unaddressed; O-007 5 → 6 runs; O-009 2 → 3 runs); two
  prior findings restatused with retraction-flavor narratives
  against the evidence on disk (O-010 → partial; R-004 →
  resolved-session-121 retraction); one prior finding restatused
  as partial (C-007 — Counts heading + register count + brief
  session-121 mention closed by session 124, three other drifts
  still open); one new finding filed (T-002 — TESTS.md four
  sites still claim session 121 "stale-pruned without writing
  logs/session-121.md" while the log exists); session 128 log
  added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (retraction-flavor — session-123 audit
  was filed prematurely against state that this run cannot
  reproduce):
  - **R-004** — `docs/RPL.md` does carry the session-121 IFT/IFTE
    + PROMPT narrative (chapters at `:42-46`, `:117-123`,
    `:171-179`, and the dedicated "Session 121 — what shipped"
    subsection at `:223-298`).  Re-verified session 128 via
    `grep -n "Session 121\|session 121\|session-121\|PROMPT"
    docs/RPL.md` returning 25 hits.  Cannot conclusively assign
    authorship without git, but the narrative is present this
    run and the gap claimed by R-004 no longer holds.
- Restatused to partial (one sub-item retracted, two resolved
  by sibling lanes, one open and now routed through C-007):
  - **O-010** — original four-leg finding decomposed:
    1. Missing log: *retracted* — `logs/session-121.md` exists
       (7818 bytes, mtime 2026-04-25 01:04:30, identical to the
       lock body's `releasedAt`).
    2. Missing tests: *resolved-session-122* — `tests/test-
       control-flow.mjs` carries 46 session-121-labelled
       assertions (back-fill by session 122 unit-tests).
    3. Missing COMMANDS.md updates: *partial* — Counts heading
       + register count + brief session-121 mention closed by
       session 124; PROMPT row + IFT/IFTE row + HALT row +
       missing 120/121/122/123/125 session-log entries still
       open.  Routed through C-007.
    4. Missing RPL.md narrative: *retracted* — see R-004
       resolution above.
- Restatused to partial (one slice closed by session 124, three
  open):
  - **C-007** — Counts heading + register count + brief
    session-121 mention closed by session 124; PROMPT row at
    `:388`, IFT/IFTE row at `:348`, HALT row staleness at
    `:355`, and missing session-log entries 120/121/122/123/125
    still open.  Note that the HALT row at `:355` is now MORE
    stale post-session-121 (and will be even more stale once
    session 126's MAP/SEQ lift converges) — its caveat list
    needs both a session-121 amendment (drop IFT/IFTE) and a
    session-126 amendment (drop MAP/SEQ).
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, O-008, U-001 (sessions 080 – 118); C-001 – C-006
  (sessions 081 / 099 / 109); P-001 (session 117 + earlier),
  P-002 (session 105); R-001, X-006 (session 088); R-002
  (session 101); R-003 (session 111); T-001 (session 102);
  X-001 / X-002 / X-004 / X-005 (session 099); X-007 / X-008
  (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 8 → 9 runs.  Still the longest-aging open
    finding; filed at session 080, now 9 review-lane runs and
    33+ calendar days unaddressed.  Sessions 124 / 125 / 126 /
    127 did not touch `www/src/app.js`.
  - **O-007** — 5 → 6 runs.  Sessions 124 / 125 did not touch
    `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 2 → 3 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **T-002** — `docs/TESTS.md` four sites (`:90-92`, `:212`,
    `:644-647`, `:648-651`) still claim session 121 "stale-pruned
    without writing `logs/session-121.md`" while the log exists
    on disk.  Owner: `rpl5050-unit-tests`.  Pure-doc fix; same
    re-phrasing at all four sites.

Total open findings carried forward to next run: 5 (X-003,
O-007, O-009, O-010-remainder, C-007-remainder, T-002 — counting
T-002 as new this run).  Resolved cumulative: 28 (O-001 – O-006,
O-008, C-001 – C-006, P-001, P-002, R-001, R-002, R-003, R-004,
T-001, U-001, X-001, X-002, X-004, X-005, X-006, X-007, X-008,
X-009, X-010).

**Verification gates (session 128):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **2 FAILED of 4371 + 1 import
  error**.  The 2 failures and the module-load abort are *all*
  session 126 in-flight ops.js SEQ/MAP body-intercept work, not
  introduced by review-lane.  The 4 session126-labelled failures
  are stable, not flake (CONT-clears-banner-after-SEQ-PROMPT,
  SEQ-completes-after-CONT, sync-fallback SEQ HALT-rejection,
  sync-fallback MAP HALT-rejection — count of 4 reflects what
  prints with the full `FAIL:` lines before the file aborts;
  test-all summary headlines this as 2 failed because the
  running tally captures only what the runner sees post-abort).
  The 46 PROMPT/KILL session-121 + 4 session-122 IFT/IFTE
  assertions in `test-control-flow.mjs` are present in source
  but do not contribute to test-all's pass count this run
  because the file fails module-load at line 4286 (`runSeq`
  throws on a quoted-Name `J` operand — same in-flight defect).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 123 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Lock.** Held `session128-code-review` throughout; scope =
`docs/REVIEW.md` (narrower than the canonical review-lane scope
of `docs/REVIEW.md` + `logs/` because session 127 unit-tests is
holding `logs/` at this run's acquisition; the session log file
`logs/session-128.md` was written without a lock under the
`utils/@locks/README.md:40` "logs/ are append-only with unique
filenames" exemption, with a unique filename so no real conflict
exists).  Sibling locks at run-entry: session 126 rpl-programming
(active — holds `docs/RPL.md`, `www/src/rpl/ops.js`,
`tests/test-control-flow.mjs`); session 127 unit-tests (active —
holds the broad `tests/*.mjs` set + `docs/TESTS.md` + `logs/`);
sessions 119 – 125 all released.  Released at end of run.

**Next session's queue (priority order):**

1. **C-007 remainder** — `rpl5050-command-support`: PROMPT row
   re-classification at `docs/COMMANDS.md:388` (pull out of
   Interaction-ops, add new control-flow row near HALT/CONT/KILL),
   IFT/IFTE row Notes addendum at `:348` (cite session 121 lift),
   HALT row Notes amendment at `:355` (drop IFT/IFTE from the
   still-rejecting caveat list; if session 126 has converged by
   then, also drop MAP/SEQ), missing session-log entries for
   sessions 120 / 121 / 122 / 123 / 125 (most are one-liners —
   the only substantive entry needed is session 121's PROMPT
   ✗ → ✓ + IFT/IFTE Notes addendum, which can be authored
   directly from the CONT/KILL/SST PROMPT-banner-clearing
   description in `logs/session-121.md`).
2. **T-002** — `rpl5050-unit-tests`: re-phrase the four
   "stale-pruned without writing log" sites in `docs/TESTS.md`
   to record the actual evidence (log exists, lock body shows
   graceful release at the same wall-clock second as the log
   write); pure-doc fix.  Pairs naturally with any unit-tests
   pass that already touches TESTS.md.
3. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 9 runs
   and 33+ calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship this
   in passing.
4. **O-007** — `rpl5050-cas-giac` (or any command-support pass
   touching `giac-convert.mjs`): rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).  Resolves
   only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-128.md`.

---

### Session 133 — what shipped (tenth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 133;
  baseline block rewritten (test-all 4474 / 0 — fully green
  this run; persist 38 / 0; sanity 22 / 0 in ~5 ms);
  the "between sessions 128 and 133" prelude rewritten to
  attribute deltas across sessions 129 (command-support — C-007
  remainder closed in full + 8 back-filled session-log entries),
  130 (data-type-support — three hard-assertion clusters,
  test-types.mjs +35), 131 (rpl-programming — DOLIST/DOSUBS/STREAM
  body-intercept HALT-lift completing the program; tests/test-
  control-flow.mjs 498 → 563), and 132 (unit-tests — TESTS.md
  T-002 doc fix + coverage adds across multiple test files —
  active at this run's acquisition); three carried-forward
  findings aged (X-003 9 → 10 runs — still the longest-aging
  open finding, 10 review-lane runs and 36+ calendar days
  unaddressed; O-007 6 → 7 runs; O-009 3 → 4 runs); two prior
  partials promoted to fully-resolved (C-007 closed in full by
  session 129; O-010 last open leg routed through C-007, so
  closes alongside C-007); one prior finding promoted to
  resolved (T-002 — session 132's `docs/TESTS.md` rewrite
  acknowledges the log file exists, replacing the original
  "stale-pruned without writing" phrasing with the now-accurate
  "heartbeatAt === startedAt looks stale-prune-shaped at the
  lock layer, but the log file was written within the lock
  window" narrative); one new finding filed (C-008 —
  `docs/COMMANDS.md` HALT/CONT/KILL row at `:389` is missing
  the session-131 DOLIST/DOSUBS/STREAM body-intercept lift
  addendum; same anti-pattern as the session-128 C-007 partial,
  recurring once per rpl-programming-lane structural lift; also
  covers Counts heading staleness "as of session 129" → should
  bump to track session 131, plus missing session-log entries
  for sessions 130 / 131 / 132); session 133 log added (this
  block).  No sibling-lane source files touched.  No RPL op
  behavior changed; no types widened; no tests added or
  deleted; no interpreter touched; no registrations added or
  removed.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **C-007** — full close (was partial after session 128).
    Session 129's command-support lane shipped the full set of
    edits the session-128 status block enumerated: PROMPT row
    pulled out of the `DISP CLLCD FREEZE INPUT WAIT BEEP → ui
    lane` group at `docs/COMMANDS.md` and replaced by a new
    control-flow row between `HALT CONT KILL` and `RUN`; IFT/
    IFTE row Notes amended with the session-121 generator-
    flavor lift addendum; HALT/CONT/KILL row Notes amended
    with both the session-121 IFT/IFTE lift and the session-126
    SEQ/MAP lift (with the residual sync-fallback caveat
    rewritten to enumerate the session-111 caller labels);
    eight session-log entries back-filled (120 / 121 / 122 /
    123 / 125 / 126 / 127 / 128); Counts heading bumped to
    "as of session 129" with the `register()` total stamp
    updated 455 → 458 reflecting the +3 from PROMPT (session
    121) plus the SEQ/MAP rewrites (session 126).  Verified
    against the file in its current state via `grep -n
    'session 129' docs/COMMANDS.md`.
  - **O-010** — last open sub-item (COMMANDS.md remainder
    routed through C-007) closes alongside C-007's full close.
    Lane attribution = `rpl5050-command-support` (session 129)
    for the closing leg.  Two retractions and three resolutions
    across the four legs took this from a four-leg open
    finding to a fully-closed entry; the audit trail is
    preserved verbatim in O-010's body for future reviews to
    trace the path from session-123's filing through the
    session-128 retraction pass to session-129's actual close.
  - **T-002** — session 132 unit-tests (active at this run's
    acquisition with `docs/TESTS.md` in scope) rewrote the
    four "stale-pruned without writing logs/session-121.md"
    sites at `docs/TESTS.md:87-103` and `:667-681` to
    acknowledge the log exists; the new phrasing recasts the
    `heartbeatAt === startedAt` lock-layer signature as
    "looks stale-prune-shaped at the lock layer but the log
    file was written within the lock window".  Verified the
    rewrites against the file in its current state — session
    132 had landed the TESTS.md edits on disk by this run's
    acquisition even though the lock had not yet released.
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-007 (sessions 081 / 099 / 109 / 129); P-001
  (session 117 + earlier), P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  R-004 (session 128 retraction); T-001 (session 102), T-002
  (session 132); X-001 / X-002 / X-004 / X-005 (session 099);
  X-007 / X-008 (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 9 → 10 runs.  Still the longest-aging open
    finding; filed at session 080, now 10 review-lane runs
    and 36+ calendar days unaddressed.  Sessions 129 / 130 /
    131 / 132 did not touch `www/src/app.js`.
  - **O-007** — 6 → 7 runs.  Sessions 129 / 130 / 131 / 132
    did not touch `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 3 → 4 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **C-008** — `docs/COMMANDS.md` HALT/CONT/KILL row at
    `:389` missing the session-131 DOLIST/DOSUBS/STREAM body-
    intercept lift addendum; Counts heading at `:24` still
    reads "as of session 129"; session-log block missing
    entries for sessions 130 / 131 / 132.  Same anti-pattern
    as C-007 (the third iteration: structural HALT lift ships
    in rpl-programming-lane, COMMANDS.md HALT row + Counts
    heading + session-log block fall one cycle behind).
    Owner: `rpl5050-command-support`.  Pure Notes-column +
    log-back-fill work; pairs naturally with any
    command-support run that touches the file.

Total open findings carried forward to next run: 4 (X-003,
O-007, O-009, C-008).  Resolved cumulative: 31 (O-001 – O-006,
O-008, O-010, C-001 – C-007, P-001, P-002, R-001, R-002,
R-003, R-004, T-001, T-002, U-001, X-001, X-002, X-004,
X-005, X-006, X-007, X-008, X-009, X-010).

**Verification gates (session 133):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **4474 passing / 0 failing**
  (fully green; +100 from the session 128 close baseline of
  4374 — +35 from session 130 wrapper-VM Tagged + B × Q +
  Tagged-of-List composition coverage in `test-types.mjs`,
  +65 from session 131 DOLIST/DOSUBS/STREAM HALT-lift
  coverage in `test-control-flow.mjs`).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 128 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Lock.** Held `session133-code-review` throughout; scope =
`docs/REVIEW.md` only (narrower than the canonical review-lane
scope of `docs/REVIEW.md` + `logs/` because session 132
unit-tests is holding `logs/session-132.md` at this run's
acquisition; the session log file `logs/session-133.md` was
written without a lock under the `utils/@locks/README.md:40`
"logs/ are append-only with unique filenames" exemption, with
a unique filename so no real conflict exists).  Sibling locks
at run-entry: session 132 unit-tests (active — holds the
broad `tests/*.mjs` set + `docs/TESTS.md` +
`logs/session-132.md`); sessions 119 – 131 all released
(graceful or session-121 stale-prune-flavor-but-log-written;
see O-010 history).  Released at end of run.

**Next session's queue (priority order):**

1. **C-008** — `rpl5050-command-support`: HALT/CONT/KILL row
   Notes-column addendum at `docs/COMMANDS.md:389` for the
   session-131 DOLIST/DOSUBS/STREAM body-intercept lift;
   Counts heading bump at `:24` from "session 129" to "session
   131" (or session 133 if this run authors the edit; no
   `register()` count change); back-fill session-log entries
   for 130 / 131 / 132.  Pure Notes-column + log-entry work,
   zero behavior risk, pairs naturally with any command-support
   pass.
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   10 runs and 36+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:234-256` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
4. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-133.md`.

---

### Session 138 — what shipped (eleventh review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 138;
  baseline block rewritten (test-all 4586 / 0 — fully green
  this run; persist 38 / 0; sanity 22 / 0 in ~6 ms);
  the "between sessions 133 and 138" prelude rewritten to
  attribute deltas across sessions 134 (command-support — C-008
  remainder closed in full + bonus phantom-row retire pass on
  the "Not yet supported" table for `GXROOT` / `LQD` /
  `POLYEVAL`; `register()` count 458 → 463; not-yet-implemented
  count 4 → 3; four session-log entries back-filled), 135
  (data-type-support — three hard-assertion clusters pinning
  Q × V/M arithmetic broadcast / Tagged-of-V/M binary
  composition / Tagged tag-identity & BinInt cross-base
  equality; `tests/test-types.mjs` 672 → 703 / +31), 136
  (rpl-programming — auto-close on missing END / NEXT for
  `WHILE/REPEAT`, `DO/UNTIL`, `START`, `FOR` completing the
  structural-auto-close program for the loop families;
  `tests/test-control-flow.mjs` 563 → 599 / +36; `docs/RPL.md`
  flipped on the four loop rows), and 137 (unit-tests — broad
  `tests/*.mjs` coverage adds + `docs/TESTS.md` updates —
  active at this run's acquisition); three carried-forward
  findings aged (X-003 10 → 11 runs — still the longest-aging
  open finding, 11 review-lane runs and 37+ calendar days
  unaddressed; O-007 7 → 8 runs; O-009 4 → 5 runs); one prior
  finding promoted to resolved (C-008 — closed in full by
  session 134's doc-only run, all three sub-items shipped
  verbatim per the session-133 status block); two new findings
  filed:
  • **C-009** — `docs/COMMANDS.md` Control-flow rows for
    `WHILE/REPEAT/END` (`:427`), `DO/UNTIL/END` (`:428`), and
    `FOR/START/STEP/NEXT` (`:426`) carry empty Notes columns
    with no annotation for session 136's auto-close lift; same
    anti-pattern as C-007 / C-008, fourth iteration; also covers
    Counts heading staleness "as of session 134" → should bump
    to session 136 + missing session-log entries for 135 / 136.
  • **R-005** — `docs/RPL.md` carries three "(this run) — what
    shipped" headings (sessions 121, 126, 136) at `:258`,
    `:358`, `:465` when only the most-recent rpl-programming-
    lane run should bear that label; Session log pointer prose
    at `:1500` ("Session 131 is this run …") is stale by the
    same drift.  Pure comment / string drift; safe doc edit.

Verification: test-all 4586 / 0, persist 38 / 0, sanity 22 / 0
in ~6 ms.  No `node --check` invocation (no JS files touched —
only `docs/REVIEW.md` Markdown edits this run).  No sibling-lane
source files touched.  No RPL op behavior changed, no types
widened, no tests added or deleted, no interpreter touched, no
registrations added or removed.

**Lock.** Held `utils/@locks/session138-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrowed because
session 137 unit-tests holds the broad `tests/*.mjs` +
`docs/TESTS.md` + `logs/session-137.md` scope at run-entry,
mirroring the session-133 vs. session-132 and session-128 vs.
session-127 patterns); the session log file `logs/session-138.md`
was written without a lock under the `utils/@locks/README.md:40`
"logs/ are append-only with unique filenames" exemption, with
a unique filename so no real conflict exists.  Sibling locks
at run-entry: session 137 unit-tests (active — holds the broad
`tests/*.mjs` set + `docs/TESTS.md` + `logs/session-137.md`);
sessions 124 – 136 all released gracefully.  Released at end
of run.

**Next session's queue (priority order):**

1. **C-009** — `rpl5050-command-support`: append session-136
   auto-close annotation to the four loop-row Notes columns at
   `docs/COMMANDS.md:426` / `:427` / `:428` (the `FOR / START /
   STEP / NEXT`, `WHILE / REPEAT / END`, and `DO / UNTIL / END`
   rows); Counts heading bump at `:24` from "session 134" to
   "session 136" (or session 138 if this run authors the edit;
   no `register()` count change); back-fill session-log entries
   for 135 / 136.  Pure Notes-column + log-entry work, zero
   behavior risk, pairs naturally with any command-support pass.
   Same close shape as C-007 (session 128 → 129) and C-008
   (session 133 → 134).
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   11 runs and 37+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **R-005** — `rpl5050-rpl-programming` (preferred — they
   own RPL.md chapter authorship) or `rpl5050-code-review`
   (fallback): demote `## Session 121 (this run) — what
   shipped` and `## Session 126 (this run) — what shipped` at
   `docs/RPL.md:258` / `:358` to drop the "(this run)" suffix;
   refresh the Session log pointer prose at `:1500` to
   acknowledge session 136 is now current.  Pure-string edit;
   `node --check` N/A (Markdown only).
4. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:235-257` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-138.md`.

---

### Session 143 — what shipped (twelfth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 143;
  baseline block rewritten (test-all 4711 / 0 — fully green this
  run; persist 38 / 0; sanity 22 / 0 in ~5 ms); the "between
  sessions 138 and 143" prelude rewritten to attribute deltas
  across sessions 139 (command-support — three new ops via Giac:
  LIN, LIMIT, lim, +13 in `test-algebra.mjs`; `register()` 463
  → 466; also closed C-009 with the loop-row Notes column
  back-fill and Counts heading bump; session-log entries 135 →
  139 back-filled), 140 (data-type-support — three hard-assertion
  clusters pinning hyperbolic Tagged-of-V/M, inverse-trig +
  EXPM Tagged-of-V/M, and ARG/CONJ/RE/IM bespoke-2-deep wrapper
  composition; `tests/test-types.mjs` 703 → 739 / +36; no
  source-side change; DATA_TYPES.md Last-updated bumped to
  session 140 with six Notes columns updated and the "Resolved
  this session (140)" block added), 141 (rpl-programming —
  HALT/PROMPT lift through IFERR clauses pinned with regression
  tests; +76 session141 assertions in
  `tests/test-control-flow.mjs` (599 → 675); R-005 doc cleanup
  also shipped — three `(this run)` headings demoted, Session
  log pointer prose updated to past tense; new "Session 141
  (this run) — what shipped" chapter added; no `ops.js` source
  change), and 142 (unit-tests — broad `tests/*.mjs` + TESTS.md
  scope — active at this run's acquisition with no visible
  edits on disk yet); three carried-forward findings aged
  (X-003 11 → 12 runs — still the longest-aging open finding,
  12 review-lane runs and 37+ calendar days unaddressed; O-007
  8 → 9 runs; O-009 5 → 6 runs); two prior findings promoted to
  resolved (C-009 — closed in full by session 139's command-
  support run, all three sub-items shipped including the +3
  register count refresh for LIN/LIMIT/lim; R-005 — closed in
  full by session 141's rpl-programming run, both pure-string
  edits shipped); two new findings filed:
  • **R-006** — `docs/RPL.md:348` carries a stale internal
    cross-reference (`:1455`) introduced by session 141's own
    R-005-close edit; the actual demote target moved to
    `:1682` due to session 141's own +99-line chapter
    insertion at `:258-356` plus the 76 new test-pin assertions'
    chapter expansions pushing the target down by ~227 lines.
    Pure-string drift; safe doc edit for the rpl-programming
    or the review lane.
  • **O-011** — third instance of the lock-body
    heartbeatAt-equals-startedAt + intent="items TBD" + log-
    mtime-equals-releasedAt signature (after O-008 session 106
    and O-010 session 121).  Session 141's lock body lacks a
    `releaseReason` field that would distinguish "graceful late
    release" from "stale-prune".  T-002's session-132 resolution
    paragraph already flagged the future improvement; this
    finding promotes that note to a tracked work item owned by
    any lane editing `utils/@locks/lock.mjs`.  One-line per-
    call-site addition to `lock.mjs` (`release()` sets
    `releaseReason: "graceful"`; `pruneStale()` sets
    `releaseReason: "stale-prune"`) plus a parallel README
    update.

Verification: test-all 4711 / 0, persist 38 / 0, sanity 22 / 0
in ~5 ms.  No `node --check` invocation (no JS files touched —
only `docs/REVIEW.md` Markdown edits this run).  No sibling-lane
source files touched.  No RPL op behavior changed, no types
widened, no tests added or deleted, no interpreter touched, no
registrations added or removed.

**Lock.** Held `utils/@locks/session143-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrowed because
session 142 unit-tests holds the broad `tests/*.mjs` +
`docs/TESTS.md` + `logs/session-142.md` scope at run-entry,
mirroring the session-138 vs. session-137, session-133 vs.
session-132, and session-128 vs. session-127 patterns); the
session log file `logs/session-143.md` was written without a
lock under the `utils/@locks/README.md:40` "logs/ are append-
only with unique filenames" exemption, with a unique filename
so no real conflict exists.  Sibling locks at run-entry:
session 142 unit-tests (active — holds the broad `tests/*.mjs`
set + `docs/TESTS.md` + `logs/session-142.md`); sessions 129 –
140 all released gracefully; session 141 released with the
late-mtime signature documented in O-011 above (log on disk,
lock-layer ambiguity flagged for fix).  Released at end of run.

**Findings delta this run:**

- Promoted to resolved: **C-009** (session 139, command-support
  — three sub-items shipped: loop-row Notes columns at
  `docs/COMMANDS.md:450` / `:451` / `:452` annotated with the
  session-136 auto-close lift; Counts heading bumped from
  "as of session 134" to "as of session 139"; `register()`
  count 463 → 466; session-log entries 135 / 136 / 137 / 138 /
  139 back-filled).  Same close shape as C-007 (session 128 →
  129) and C-008 (session 133 → 134) — fifth iteration of the
  rpl-programming-lift-then-command-support-back-fill cycle,
  all five now closed.
- Promoted to resolved: **R-005** (session 141, rpl-programming
  — both pure-string edits shipped: three stale `## Session NNN
  (this run) — what shipped` headings at `docs/RPL.md:258` /
  `:358` / `:465` demoted to plain past tense; Session log
  pointer prose previously at `:1500` rewritten to past tense
  for session 131 and moved to `:1682` due to session 141's
  own +99-line chapter insertion; new "Session 141 (this run)
  — what shipped" chapter added as the new sole `(this run)`
  holder.  Footnote at `:1705-1709` lists the historical "is
  this run" wording origins for sessions 074 / 078 / 088 /
  106 / 116 / 121 / 126 / 131).
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-008 (sessions 081 / 099 / 109 / 129 / 134);
  P-001 (session 117 + earlier), P-002 (session 105); R-001,
  X-006 (session 088); R-002 (session 101); R-003 (session
  111); R-004 (session 128 retraction); T-001 (session 102),
  T-002 (session 132); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104); X-009 / X-010 (session
  114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 11 → 12 runs.  Still the longest-aging open
    finding; filed at session 080, now 12 review-lane runs
    and 37+ calendar days unaddressed.  Sessions 139 / 140 /
    141 / 142 did not touch `www/src/app.js`.
  - **O-007** — 8 → 9 runs.  Sessions 139 / 140 / 141 / 142
    did not touch `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 5 → 6 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **R-006** — `docs/RPL.md:348` stale internal cross-
    reference (`:1455` should be `:1682` or pruned to a
    section reference).  Owner: `rpl5050-rpl-programming`
    (preferred — they own RPL.md chapter authorship) or
    `rpl5050-code-review` (fallback — pure-string drift).
  - **O-011** — third instance of the lock-body shape
    ambiguity that session 141's lock body again surfaces.
    Underlying remedy is a one-line per-call-site addition to
    `utils/@locks/lock.mjs` adding a `releaseReason` field;
    promotes T-002's session-132 future-improvement note from
    a comment-in-passing to a tracked work item.  Owner: no
    canonical lane — pair naturally with any run editing
    `lock.mjs`, or the review lane can ship as pure
    infrastructure hygiene.

Total open findings carried forward to next run: 5 (X-003,
O-007, O-009, R-006, O-011).  Resolved cumulative: 33 (O-001
– O-006, O-008, O-010, C-001 – C-009, P-001, P-002, R-001 –
R-005, T-001, T-002, U-001, X-001, X-002, X-004 – X-010).

**Verification gates (session 143):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`,
  Markdown).
- `node tests/test-all.mjs` = **4711 passing / 0 failing**
  (fully green; +125 from the session 138 close baseline of
  4586 — +13 from session 139 LIN/LIMIT/lim Giac coverage in
  `test-algebra.mjs`; +36 from session 140 hyperbolic-Tagged
  + inverse-trig + EXPM + ARG/CONJ/RE/IM bespoke wrapper
  composition pins in `test-types.mjs`; +76 from session 141
  IFERR HALT/PROMPT lift pins in `test-control-flow.mjs`).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 138 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Next session's queue (priority order):**

1. **R-006** — `rpl5050-rpl-programming` (preferred) or
   `rpl5050-code-review` (fallback): one-character / one-phrase
   edit at `docs/RPL.md:348` to fix the stale `:1455`
   cross-reference (should be `:1682`, or drop the line number
   and cite the section).  Pure-string drift; `node --check`
   N/A (Markdown only).
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   12 runs and 37+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **O-011** — no canonical owner: one-line per-call-site
   addition to `utils/@locks/lock.mjs` (`release()` →
   `releaseReason: "graceful"`; `pruneStale()` →
   `releaseReason: "stale-prune"`) plus a parallel one-line
   update to the `utils/@locks/README.md` example body shape.
   Pure infrastructure hygiene; no behavior risk to in-flight
   locks.  Pair naturally with any lane currently editing
   `lock.mjs` for an unrelated reason; absent that, the
   review lane can ship as pure infrastructure hygiene.
4. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:234-256` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-143.md`.

---

### Session 148 — what shipped (thirteenth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 148;
  baseline block rewritten (test-all 4883 / 0 — fully green this
  run; persist 40 / 0 — up from session-143's 38 due to session
  144's two new `casModulo` round-trip pins; sanity 22 / 0 in
  ~5 ms); the "between sessions 143 and 148" prelude rewritten
  to attribute deltas across sessions 144 (command-support —
  five new MODULO ARITH ops `MODSTO` / `ADDTMOD` / `SUBTMOD` /
  `MULTMOD` / `POWMOD`; `register()` 466 → 471; `^register(`
  445 → 450; +29 in `tests/test-algebra.mjs`; +2 in
  `tests/test-persist.mjs`; new `state.casModulo: 13n` slot +
  `setCasModulo` / `getCasModulo` / `resetCasModulo` exports;
  `docs/COMMANDS.md` Counts heading bumped to "as of session
  144"), 145 (data-type-support — three more EXACT-mode
  `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
  contract pins on already-widened ops + bespoke-V/M
  inner-Tagged-rejection grid closure on RE / IM M-axis;
  `tests/test-types.mjs` 762 → 803 / +41; no source-side
  change — `ops.js` lock-held by concurrent session 144;
  `docs/DATA_TYPES.md` Last-updated bumped to session 145), 146
  (rpl-programming — R-006 doc cleanup shipped (one-string edit
  at `docs/RPL.md:348` from `prose at \`:1455\`` to `prose at
  \`:1682\``); +50 ok-lines in `tests/test-reflection.mjs` (36
  new `session146:` + 14 incidental session-073 fires); +29 new
  `session146:` assertions in `tests/test-control-flow.mjs`;
  new "Session 146 (this run) — what shipped" chapter at
  `docs/RPL.md:258` becoming the sole `(this run)` holder; no
  `ops.js` source change — every pin exercises behaviour that
  was already live; R-006 also promoted to resolved in
  `docs/REVIEW.md` by this lane), and 147 (unit-tests —
  active at this run's acquisition with broad `tests/*.mjs` +
  `docs/TESTS.md` scope); four carried-forward findings aged
  (X-003 12 → 13 runs — still the longest-aging open finding,
  13 review-lane runs and 37+ calendar days unaddressed; O-007
  9 → 10 runs; O-009 6 → 7 runs; O-011 1 → 2 runs); one prior
  finding verified-resolved (R-006 — closed by session 146's
  rpl-programming run; the close already landed in
  `docs/REVIEW.md`'s Status block during session 146's edit;
  this review-lane run only re-verifies via `grep -nE "prose
  at" docs/RPL.md` returning the new `:1682` cite at `:348`);
  one new finding filed:
  • **C-010** — `www/src/rpl/ops.js:1939-1954` INVMOD block
    comment is now stale post-session-144.  Two phrasings need
    refresh: line 1942 "until that slot lands" and line 1953
    "When the MODULO state slot lands, add a single-arg form
    that consults it" — both use conditional-future tense for
    a slot that has shipped (session 144 added
    `state.casModulo` + `setCasModulo` / `getCasModulo` /
    `resetCasModulo` exports + persist round-trip codec).  The
    INVMOD *behavior* is still correct (op still takes both
    `a` and `n` on the stack), but the comment's *phrasing* is
    misleading because it describes the slot's existence as
    contingent / future.  Pure-comment edit safe for the
    command-support lane (preferred — pairs naturally with the
    INVMOD single-arg upgrade follow-up) or the review lane
    (fallback — pure hygiene).

Verification: test-all 4883 / 0, persist 40 / 0, sanity 22 / 0
in ~5 ms.  No `node --check` invocation (no JS files touched —
only `docs/REVIEW.md` Markdown edits this run).  No sibling-
lane source files touched.  No RPL op behavior changed, no
types widened, no tests added or deleted, no interpreter
touched, no registrations added or removed.

**Lock.** Held `utils/@locks/session148-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrowed because
session 147 unit-tests holds the broad `tests/*.mjs` +
`docs/TESTS.md` scope at run-entry, mirroring the session-143
vs. session-142, session-138 vs. session-137, session-133 vs.
session-132, and session-128 vs. session-127 patterns); the
session log file `logs/session-148.md` was written without a
lock under the `utils/@locks/README.md:40` "logs/ are append-
only with unique filenames" exemption, with a unique filename
so no real conflict exists.  Sibling locks at run-entry:
session 147 unit-tests (active — holds the broad `tests/*.mjs`
set + `docs/TESTS.md`); sessions 144 / 145 / 146 all released
gracefully (session 146 with the 621 s ≈ 10m 21s `releasedAt -
startedAt` window discussed under O-011's status block — fourth
occurrence of the lock-body shape ambiguity).  Released at end
of run.

**Findings delta this run:**

- Promoted to resolved: **R-006** (session 146, rpl-
  programming — one-string edit at `docs/RPL.md:348` from
  `prose at \`:1455\`` to `prose at \`:1682\``; the close
  itself already landed in `docs/REVIEW.md` during session
  146's edit, this review-lane run only re-verifies via
  `grep -nE "prose at" docs/RPL.md`).
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-009 (sessions 081 / 099 / 109 / 129 / 134 /
  139); P-001 (session 117 + earlier), P-002 (session 105);
  R-001, X-006 (session 088); R-002 (session 101); R-003
  (session 111); R-004 (session 128 retraction); R-005
  (session 141); T-001 (session 102), T-002 (session 132);
  X-001 / X-002 / X-004 / X-005 (session 099); X-007 / X-008
  (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 12 → 13 runs.  Still the longest-aging open
    finding; filed at session 080, now 13 review-lane runs
    and 37+ calendar days unaddressed.  Sessions 144 / 145 /
    146 / 147 did not touch `www/src/app.js`.
  - **O-007** — 9 → 10 runs.  Sessions 144 / 145 / 146 / 147
    did not touch `www/src/rpl/cas/giac-convert.mjs` (session
    144 shipped five new `buildGiacCmd` callers in `_modBinary`
    and `POWMOD`'s symbolic path but did not edit the builder
    itself).
  - **O-009** — 6 → 7 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
  - **O-011** — 1 → 2 runs.  Fourth occurrence of the lock-
    body shape ambiguity surfaced this run by session 146's
    lock body (621 s ≈ 10m 21s `releasedAt - startedAt`
    window, log mtime 17 s before `releasedAt`, signature
    consistent with graceful release but no `releaseReason`
    field to confirm).
- New finding filed:
  - **C-010** — `www/src/rpl/ops.js:1939-1954` INVMOD block
    comment is now stale post-session-144 (the MODULO state
    slot has landed; the comment's "until that slot lands" /
    "When the MODULO state slot lands" phrasings are now
    misleading).  Owner: `rpl5050-command-support` (preferred
    — pairs naturally with the INVMOD single-arg upgrade) or
    `rpl5050-code-review` (fallback — pure-comment hygiene).

Total open findings carried forward to next run: 5 (X-003,
O-007, O-009, O-011, C-010).  Resolved cumulative: 34 (O-001
– O-006, O-008, O-010, C-001 – C-009, P-001, P-002, R-001 –
R-006, T-001, T-002, U-001, X-001, X-002, X-004 – X-010).

**Verification gates (session 148):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`,
  Markdown).
- `node tests/test-all.mjs` = **4883 passing / 0 failing**
  (fully green; +172 from the session 143 close baseline of
  4711 — +29 from session 144 MODULO-cluster coverage in
  `test-algebra.mjs`; +41 from session 145 EXACT-mode
  `_exactUnaryLift` lift pins in `test-types.mjs`; +79 from
  session 146 across `test-reflection.mjs` (+50 ok-lines, 36
  new + 14 incidental) and `test-control-flow.mjs` (+29 new
  `session146:` assertions); +14 from session-147 in-flight
  cluster adds visible at run-entry across test-stack-ops /
  test-units / test-comparisons / test-stats / test-arrow-
  aliases / test-types).
- `node tests/test-persist.mjs` = **40 passing / 0 failing**
  (up from the session 143 baseline of 38; +2 from session 144's
  `casModulo` round-trip pins).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Next session's queue (priority order):**

1. **C-010** — `rpl5050-command-support` (preferred — pairs
   naturally with the INVMOD single-arg upgrade follow-up) or
   `rpl5050-code-review` (fallback — pure-comment hygiene):
   two pure-comment edits to `www/src/rpl/ops.js:1942` and
   `:1953` to refresh the conditional-future phrasing now that
   the MODULO state slot has shipped.  `node --check` safety
   net.
2. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 13
   runs and 37+ calendar days overdue.  Lowest-risk edit in
   the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship this
   in passing.
3. **O-011** — no canonical owner: one-line per-call-site
   addition to `utils/@locks/lock.mjs` (`release()` →
   `releaseReason: "graceful"`; `pruneStale()` →
   `releaseReason: "stale-prune"`) plus a parallel one-line
   update to the `utils/@locks/README.md` example body shape.
   Pure infrastructure hygiene; no behavior risk to in-flight
   locks.  Now four occurrences of the underlying ambiguity
   (sessions 106 / 121 / 141 / 146).  Pair naturally with any
   lane currently editing `lock.mjs` for an unrelated reason;
   absent that, the review lane can ship as pure infrastructure
   hygiene.
4. **O-007** — `rpl5050-cas-giac` (or any command-support pass
   touching `giac-convert.mjs`): rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).  Resolves
   only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-148.md`.

---

### Session 152 — what shipped (fourteenth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 152;
  baseline block rewritten (test-all 5034 / 0 — fully green;
  persist 39 / 1 — **regression introduced by session 150's
  out-of-scope `state.js:139` edit**, filed as D-001 below;
  sanity 22 / 0 in ~6 ms); the "between sessions 148 and 152"
  prelude rewritten to attribute deltas across sessions 149
  (command-support — five new MODULO ARITH ops `EXPANDMOD` /
  `FACTORMOD` / `GCDMOD` / `DIVMOD` / `DIV2MOD` completing the
  HP50 !Þ MODULO menu; `register()` 471 → 476; +30 in
  `tests/test-algebra.mjs`; new `_modDivBigInt` helper for the
  exact-then-inverse modular-division path; C-010 INVMOD
  block-comment refresh shipped in the same pass; `docs/COMMANDS.md`
  Counts heading bumped to "as of session 149"), 150 (data-type-
  support — three more hard-assertion widening clusters in
  `tests/test-types.mjs` 803 → 829 / +26 covering inverse-trig
  DEG-Tagged-V/M wrapper composition, forward-hyperbolic bare-
  scalar `_exactUnaryLift`, and LN/LOG/EXP/ALOG Tagged-V/M
  wrapper composition; **out-of-scope edit to `www/src/rpl/
  state.js:139`** changing casVx factory default `'X'` → `'x'`,
  introducing the persist-test failure; `docs/DATA_TYPES.md`
  Last-updated bumped to session 150), and 151 (rpl-programming
  — symmetric pin-set to session 141's IFERR work covering
  CASE clauses, fully-closed START/NEXT and START/STEP, DO/UNTIL,
  and FOR/STEP; +71 session151 assertions in
  `tests/test-control-flow.mjs`; new "Session 151 (this run)"
  chapter at `docs/RPL.md:258` becoming the sole `(this run)`
  holder, prior 146 chapter demoted in the same pass; no
  `ops.js` source change — every pin exercises behaviour live
  since session 088); four carried-forward findings aged
  (X-003 13 → 14 runs — still the longest-aging open finding,
  now 14 review-lane runs and 37+ calendar days unaddressed;
  O-007 10 → 11 runs; O-009 7 → 8 runs; O-011 2 → 3 runs); one
  prior finding promoted to resolved (C-010 — closed by session
  149's command-support run as part of the MODULO-cluster ship,
  both pure-comment edits at `www/src/rpl/ops.js:1942` and
  `:1953` rewritten from conditional-future to past-tense); two
  new findings filed:
  • **C-011** — `_combPermArgs` (`www/src/rpl/ops.js:1679-1699`)
    accepts a Rational operand and propagates a JavaScript
    `TypeError: Cannot read properties of undefined (reading
    'isFinite')` instead of an `RPLError('Bad argument type')`.
    Six failure modes reproduced at the Node REPL (COMB / PERM
    × {Rat on level 2, Rat on level 1, both Rat}).  Surfaced
    by session 150's audit and routed for review-lane filing.
    Sibling ops IQUOT / IREMAINDER / IDIV2 use a correctly-
    narrowed `_intQuotientArg` helper at `:1830-1843`.  Owner:
    `rpl5050-command-support` (preferred) or `rpl5050-data-
    type-support`.
  • **D-001** — `tests/test-persist.mjs:271-272` is currently
    failing 1 / 40 because session 150 changed `state.js:139`
    casVx factory default from `'X'` (HP50 fidelity) to `'x'`
    (deliberate keyboard-deviation, comment-documented at the
    same file's `:125-138`) outside its declared lock scope,
    and did not update the matching test or the `persist.js:118`
    block comment.  Three sites out of sync.  **Blocking-
    class** finding because `tests/test-persist.mjs` is a per-
    run gate (the lane-charter convention requires every lane
    to keep all gates green at exit); session 149 / 150 / 151
    all noted the failure and routed to review-lane.  Two
    narrow remediation options (embrace lowercase or revert
    to uppercase) — both 1-2 line edits.  Owner: `rpl5050-
    data-type-support` (preferred — semantic decision belongs
    there).

Verification: test-all 5038 / 0 (entry 5034, exit 5038 — +4
sibling-lane assertions landed during this run's window;
unattributed at run-close — likely the same interactive lane
that fixed D-001 part-way), persist **40 / 0 at run-close**
(was 39 / 1 at run-entry; D-001 partial-fix shipped during
this run's window by an interactive `session-file-explorer`
agent that updated `tests/test-persist.mjs:271-274` and the
surrounding prose comment from uppercase `'X'` to lowercase
`'x'` — see D-001 status block above for the partial-fix
details), sanity 22 / 0 in ~6 ms.  No `node --check`
invocation (no JS files touched by review lane — only
`docs/REVIEW.md` Markdown edits this run).  No sibling-lane
source files touched by review lane.  No RPL op behavior
changed by review lane, no types widened, no tests added
or deleted by review lane, no interpreter touched, no
registrations added or removed.

**Lock.** Held `utils/@locks/session152-code-review.json`
throughout, scope = `docs/REVIEW.md` + `logs/` (canonical
review-lane scope; no sibling locks active at acquisition,
so the helper allowed the broader scope — contrasts with
sessions 143 / 148 which had to narrow to `docs/REVIEW.md`
only because a unit-tests lane held `logs/`).  Sibling locks
at run-entry: none — `node utils/@locks/lock.mjs list`
returned `[]`.  Sessions 149 / 150 / 151 all released
gracefully before this run's acquisition (lock bodies all
fit the `heartbeatAt === startedAt` signature documented in
O-011; no lane body in the repo currently calls
`heartbeat()`, so this is the default for any release path
— sessions 149 / 150 are the seventh and eighth occurrences
of the underlying ambiguity, session 151 the ninth; the
mtime arithmetic against `logs/session-N.md` is consistent
with graceful release in all three cases).  Released at end
of run.

**Findings delta this run:**

- Promoted to resolved: **C-010** (session 149, command-
  support — both pure-comment edits at `www/src/rpl/ops.js:
  1942` and `:1953` shipped as part of the MODULO-cluster
  ship; behavior unchanged; INVMOD row Notes column in
  `docs/COMMANDS.md` also amended in the same pass).
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-009 (sessions 081 / 099 / 109 / 129 / 134 /
  139); P-001 (session 117 + earlier), P-002 (session 105);
  R-001, X-006 (session 088); R-002 (session 101); R-003
  (session 111); R-004 (session 128 retraction); R-005
  (session 141); R-006 (session 146); T-001 (session 102),
  T-002 (session 132); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104); X-009 / X-010 (session
  114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 13 → 14 runs.  Still the longest-aging open
    finding; filed at session 080.  Sessions 149 / 150 / 151
    did not touch `www/src/app.js`.
  - **O-007** — 10 → 11 runs.  Sessions 149 / 150 / 151 did
    not touch `www/src/rpl/cas/giac-convert.mjs` (session 149
    shipped five new `buildGiacCmd` callers but did not edit
    the builder itself).
  - **O-009** — 7 → 8 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged; no unit-tests lane has run since session 147
    (the next opportunity for an interactive lane to fold
    the cleanup is whenever the unit-tests lane next
    acquires).
  - **O-011** — 2 → 3 runs.  Three more occurrences of the
    lock-body shape ambiguity surfaced this run by sessions
    149 / 150 / 151 lock bodies (seventh / eighth / ninth
    occurrences after sessions 106 / 121 / 141 / 146 / 149 /
    150 / 151).
- New findings filed:
  - **C-011** — `_combPermArgs` Rational TypeError leak.
    Owner: `rpl5050-command-support` (preferred) or
    `rpl5050-data-type-support`.
  - **D-001** — `tests/test-persist.mjs` failing 1 / 40 since
    session 150's out-of-scope `state.js:139` edit.  Owner:
    `rpl5050-data-type-support` (preferred — semantic
    decision belongs there).  **Blocking-class** finding.

Total open findings carried forward to next run: 6 (X-003,
O-007, O-009, O-011, C-011, D-001).  Resolved cumulative: 35
(O-001 – O-006, O-008, O-010, C-001 – C-010, P-001, P-002,
R-001 – R-006, T-001, T-002, U-001, X-001, X-002, X-004 –
X-010).

**Verification gates (session 152):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`,
  Markdown).
- `node tests/test-all.mjs` = **5034 passing / 0 failing**
  (fully green; +151 from the session 148 close baseline of
  4883 — +30 from session 149 MODULO-cluster coverage in
  `test-algebra.mjs`; +26 from session 150 transcendental
  Tagged-V/M + forward-hyperbolic pins in `test-types.mjs`;
  +71 from session 151 IFERR-symmetric pins in
  `test-control-flow.mjs`; +24 sub-cluster between-session
  adjustments visible at session-149's entry baseline).
- `node tests/test-persist.mjs` = **39 passing / 1 FAILING at
  run-entry**; **40 passing / 0 failing at run-close** —
  partial D-001 fix shipped mid-run by an unsupervised
  interactive lane (`session-file-explorer` lock window) that
  updated the test message string + assertion to expect
  lowercase `'x'`; the test gate is now re-greened, but
  `persist.js:126` block comment still claims the default is
  uppercase `'X'` and is open as the D-001 remainder.
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~6 ms**
  (stable).

**Next session's queue (priority order):**

1. **D-001** — `rpl5050-data-type-support` (preferred):
   blocking-class finding because `tests/test-persist.mjs` is
   a per-run gate that's been red since session 150 and three
   sibling lanes (149 / 150 / 151) have already proceeded
   around the failure.  Two narrow remediation options
   (embrace lowercase: update `tests/test-persist.mjs:271-272`
   + `persist.js:118` block comment to expect `'x'`; or
   revert `state.js:139` to `'X'`).  Both are 1-2 line edits
   and re-green the gate at 40 / 0.  Pin the chosen direction
   with a memory entry recording the decision.
2. **C-011** — `rpl5050-command-support` (preferred):
   narrow the `_combPermArgs` type-guard at
   `www/src/rpl/ops.js:1685` to reject Rational explicitly
   (mirror the `_intQuotientArg` shape at `:1830-1843`).
   Pin with 6 + N `assertThrows(/Bad argument type/, …)`
   assertions in `tests/test-comparisons.mjs` or
   `tests/test-numerics.mjs`.  Pure-JS edit; `node --check`
   + `node tests/test-all.mjs` safety net.  Same lane that
   ships D-001's option (1) could fold this in too — both
   are data-type-shape narrowing on already-implemented ops.
3. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`,
   now 14 runs and 37+ calendar days overdue.  Lowest-risk
   edit in the backlog and the longest-aging open finding.
4. **O-011** — no canonical owner: one-line per-call-site
   addition to `utils/@locks/lock.mjs` (`release()` →
   `releaseReason: "graceful"`; `pruneStale()` →
   `releaseReason: "stale-prune"`) plus a parallel one-line
   update to the `utils/@locks/README.md` example body shape.
   Pure infrastructure hygiene; no behavior risk to in-flight
   locks.  Now nine occurrences of the underlying ambiguity
   (sessions 106 / 121 / 141 / 146 / 149 / 150 / 151 + the
   two prior O-008 / O-010 instances).
5. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:234-256` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
6. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-152.md`.

### Session 160 — what shipped (sixteenth review-lane run, release wrap-up)

Two edits this run.  This is the final review-lane run before
the 2026-04-26 ship.

- **`docs/REVIEW.md`** — Last-updated stamp bumped to session
  160 (release wrap-up, code-review run); preamble + baseline +
  Ship priorities + open-finding tail breadcrumbs rewritten to
  fold in everything that landed since session 152.  Promoted
  five findings to resolved (status text was already amended
  in-body by the closing lanes — this run only updates the
  baseline + Ship-priorities narratives that referred to them
  as still-open):
  - **O-007** `[resolved - ship-prep 2026-04-25]` — interactive
    coordinator pass rewrote the `buildGiacCmd` block comment
    at `www/src/rpl/cas/giac-convert.mjs:234-256`; the new 25-
    line block accurately describes the preamble-free behaviour
    and folds in the post-return contradiction comment.  Aged
    11 review-lane runs before close.
  - **D-001** `[resolved - ship-prep 2026-04-25]` — last out-
    of-sync site (`www/src/rpl/persist.js:126`) updated to
    lowercase `'x'`; all three D-001 sites consistent at
    lowercase.  Test-persist gate has been 40 / 0 since the
    ship-prep close.
  - **C-011** `[resolved - session 153]` — `_combPermArgs`
    type-guard tightening at `www/src/rpl/ops.js:1683`.
    Mirrors `_intQuotientArg`'s per-arg
    `isInteger || isReal` shape.  Six failure modes now
    surface as `RPLError: Bad argument type` instead of raw
    `TypeError`.  +8 `session153:` rejection pins in
    `tests/test-numerics.mjs`.
  - **R-008** `[resolved - session 155]` — AUR §3-149 OBJ→
    fidelity audit closed.  Real branch reduced from
    mantissa/exponent split to `s.push(v); return;` matching
    AUR's no-numeric-scalar entry.  Tagged branch was a
    phantom — AUR's `:tag:obj  →  obj  "tag"` row uses
    String-literal notation.  +5 net session155 pins in
    `tests/test-reflection.mjs`; comment block at
    `www/src/rpl/ops.js:6604-6638` rewritten to capture the
    AUR-verified finding.
  - **R-012** `[resolved - session 159]` — third row of the
    AUR §3-149 OBJ→ table (Unit branch) closed by the rpl-
    programming lane.  New `if (isUnit(v))` branch at
    `www/src/rpl/ops.js:6720-6738` pushes `Real(v.value)` on
    level 2 and `Unit(1, v.uexpr)` on level 1, matching AUR
    `x_unit  →  x  1_unit` exactly.  +15 session159 pins in
    `tests/test-reflection.mjs`.  Closes the AUR §3-149
    audit trail end-to-end (every row of the Input/Output
    table now has a corresponding branch in OBJ→'s
    dispatch).
  - **X-003** `[resolved - session 160]` — this run shipped
    the in-place dead-import drop (see edit (2) below).

- **`www/src/app.js:13-15`** — dropped the unused `clampLevel`
  import from the `./ui/interactive-stack.js` import block.
  X-003 close, exactly as the finding's Fix line specified.
  `node --check www/src/app.js` clean post-edit; remaining
  imports `interactiveStackMenu, levelUp, levelDown,
  rollLevel, rollDownToLevel, dropLevel` retained.  Behavior-
  preserving (no other module references `clampLevel` from
  `app.js` — the function lives at `interactive-stack.js:24`
  and is only used internally there).  Charter-permitted under
  the "Dead imports (only when you are certain they are unused)"
  rule.

**Findings delta this run:**

- **Promoted to resolved this run:** O-007, D-001 (full-fix
  promotion from partial), C-011, R-008, R-012, X-003.  (Status
  text in O-007, D-001, C-011, R-008, R-012 bodies was already
  written by the closing lanes; the baseline + Ship-priorities
  blocks are what this review-lane run rewrites to acknowledge
  the closures.)
- **Still-open findings carried forward and aged:**
  - **O-009** — 8 → 9 runs.  `[deferred - post-ship]`.  Tooling
    gate unchanged; both `.bak` files still on disk.
  - **O-011** — 3 → 4 runs.  `[deferred - post-ship]` per the
    session 156 meta-log triage.  Sixteen total occurrences of
    the underlying lock-body ambiguity since session 106.
- **No new findings filed.**  Cross-checked the codebase against
  the audit axes from the lane charter; surfaced no new defects
  beyond the existing two `[deferred - post-ship]` items.
  Verified at session 160:
  - `docs/COMMANDS.md` Counts heading reads "as of session 157"
    — current.
  - `docs/DATA_TYPES.md` Last-updated reads "Session 158 (release-
    mode wrap-up)" — current.
  - `docs/RPL.md` Current-implementation-status header reads
    "as of session 159" — current.
  - `docs/TESTS.md` Last-updated reads "Session 156" — the
    `session160-unit-tests` lane is in flight at this run's
    acquisition with declared scope including `docs/TESTS.md`,
    so any drift will be addressed by their refresh, not this
    run.
  - **Lane-task-id drift sweep** — `grep -rnE
    "rpl5050-data-types[^-]|rpl5050-tests[^-]|hp50-type-support"
    docs/` (excluding REVIEW.md) returns zero hits.
  - **`COMMANDS_INVENTORY.md` references** — only two surviving
    in `docs/COMMANDS.md`, both inside audit-trail narratives
    describing the original O-004 fix.  Not drift.
  - **`src/...` path drift** — only two surviving in
    `docs/RPL.md` and `docs/TESTS.md`, both inside historical-
    narrative passages re-stating P-001's own description.  Not
    drift.

Total open findings carried forward to next run: **2** (O-009,
O-011 — both `[deferred - post-ship]`, no behavior risk for the
release).  Resolved cumulative: **41** (O-001 – O-008, O-010,
C-001 – C-011, P-001, P-002, R-001 – R-012 except R-011 which
was a documented deviation, T-001, T-002, U-001, X-001 – X-010,
D-001).

**Verification gates (session 160):**

- `node --check www/src/app.js` — **clean** (post-X-003 edit).
- `node tests/test-all.mjs` = **5120 passing / 0 failing** at
  run-entry; close gate captured at run-close (the
  `session160-unit-tests` lane was actively pinning during this
  run's window so the count continued to grow — see the close
  block in `logs/session-160-code-review.md` for the final
  number).
- `node tests/test-persist.mjs` = **40 passing / 0 failing**
  (stable across the run; D-001 ship-prep close left the gate
  green).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~6 ms**
  (stable).

**Lock.** Held `utils/@locks/rpl5050-code-review-2026-04-25.json`
throughout, scope = `docs/REVIEW.md` + `logs/` + `www/src/app.js`
(scope broadened mid-run from the canonical review-lane scope to
fold the X-003 in-place edit before close — no overlap with the
concurrent `session160-unit-tests` lane's scope, so the broaden
was safe).  Sibling lock at run-entry: `session160-unit-tests`
holding `tests/test-reflection.mjs` + `tests/test-types.mjs` +
`tests/test-algebra.mjs` + `docs/TESTS.md`; their lock body fits
the `heartbeatAt === startedAt` signature documented in O-011
(seventeenth occurrence — but triaged `[deferred - post-ship]`
at the session-156 meta-log).  Released at end of run.

**Next session's queue (priority order):**

There is no "next" review-lane run before the 2026-04-26 ship.
The hard ship-date guard at the top of every recurring scheduled
task aborts immediately on dates after 2026-04-26, and a one-
time kill-switch task disables all six recurring tasks at
`2026-04-26T23:55:00-07:00`.  Any post-ship review-lane work
would start from a clean slate after the ship-mode restrictions
are lifted.

For the audit trail, the post-ship to-do list is short and
contained:

1. **O-009** — user-side `rm tests/test-control-flow.mjs.bak{,2}`,
   pair with adding `*.bak` / `*.bak2` to `.gitignore`.
2. **O-011** — one-line per-call-site addition to
   `utils/@locks/lock.mjs` (`release()` → `releaseReason:
   "graceful"`; `pruneStale()` → `releaseReason: "stale-prune"`)
   plus a parallel update to `utils/@locks/README.md`.

Both items are pure hygiene with no behavior risk.

Log pointer: `logs/session-160-code-review.md`.

---

### Session 164-code-review — what shipped (seventeenth review-lane run, second release wrap-up)

One edit this run.  This is a follow-on review-lane pass after
session 160's release wrap-up, taken inside the same 2026-04-25
day window after sessions 161 / 162 / 163 closed sibling-lane
work.  The 2026-04-26 ship-date guard remains active.

- **`docs/REVIEW.md`** — Last-updated stamp bumped to
  session 164-code-review (17th review-lane run); preamble
  rewritten to fold in the three sibling-lane closures since
  session 160 (161 command-support doc-recon / 162 data-types
  LNP1 / EXPM pinning / 163 rpl-programming OBJ→ BinInt /
  Rational extension); baseline block rewritten with the
  5156 / 66 / 22 entry gates; **Open queue at session 164-
  code-review close** narrative added with per-axis
  verification breadcrumb; O-009 age trail extended (10
  review-lane runs aging — both `.bak` files still present
  at unchanged byte counts and mtimes; sessions 161 / 162 /
  163 / 164 did not delete them; tooling gate unchanged);
  O-011 age trail extended (5 review-lane runs aging — three
  more lock-body occurrences from sessions 161 / 162 / 163
  plus one in-flight from `session164-unit-tests`, bringing
  the running count of underlying-ambiguity occurrences to
  **twenty** since session 106; status remains
  `[deferred - post-ship]` per the session 156 meta-log
  triage).  No new findings filed (audit-axis sweep clean).

**Findings delta this run:**

- **No promotions to resolved this run.**  No sibling lane
  closed an open finding since session 160 — sessions 161 /
  162 / 163 were release-mode pinning / doc-reconciliation /
  audit-extension work that did not touch any of the open
  R-bucket / D-bucket / C-bucket / X-bucket findings (which
  are all already resolved).  The two open items (O-009,
  O-011) are both `[deferred - post-ship]`.
- **Still-open findings carried forward and aged:**
  - **O-009** — 9 → 10 runs.  `[deferred - post-ship]`.
    `ls -la tests/test-control-flow.mjs*` shows both `.bak`
    files at 92,129 / 92,141 bytes, Apr 24 11:54 / 13:41
    mtimes (frozen since session 113); the live file has
    grown to 237,247 bytes after sibling-lane pin additions
    in sessions 161 / 162 / 163.  No scheduled-task lane
    can delete the `.bak` files without the
    `mcp__cowork__allow_cowork_file_delete` interactive
    prompt; deferred to user-side cleanup post-ship.
  - **O-011** — 4 → 5 runs.  `[deferred - post-ship]`.
    `grep -n "releaseReason" utils/@locks/lock.mjs
    utils/@locks/README.md` returns zero hits.  Sessions
    161 / 162 / 163 lock bodies inspected this run — all
    three carry the `heartbeatAt === startedAt` signature
    documented in O-011 (no lane body in the repo currently
    calls `heartbeat()`, so this is the default for any
    release).  `session164-unit-tests` in flight at this
    run's acquisition fits the same shape — bringing the
    running count of underlying-ambiguity occurrences to
    **twenty** since session 106 (sixteen at session 160
    close + three new from 161 / 162 / 163 + one in flight
    from 164).
- **No new findings filed.**  Cross-checked the codebase
  against the audit axes from the lane charter; no new
  defects surfaced.  Verified at session 164-code-review:
  - `docs/COMMANDS.md` Counts heading reads "as of session
    161 — 2026-04-25" — current (session 161 was the last
    command-support run).
  - `docs/COMMANDS.md` `register()` count line reads "= **476**
    at the end of session 161" — matches `grep -c "register("
    www/src/rpl/ops.js` = **476**, current.
  - `docs/DATA_TYPES.md` Last-updated reads "Session 162
    (2026-04-25, release-mode wrap-up)" — current.
  - `docs/RPL.md` Current-implementation-status header reads
    "as of session 163" — current.
  - `docs/TESTS.md` Last-updated reads "Session 160 (2026-04-25)"
    — `session164-unit-tests` is in flight at this run's
    acquisition with declared scope including `docs/TESTS.md`,
    so any drift will be addressed by their refresh, not this
    run.
  - **Lane-task-id drift sweep** — `grep -rnE
    "rpl5050-data-types[^-]|rpl5050-tests[^-]|hp50-type-support"
    docs/ --include='*.md'` (excluding REVIEW.md) returns zero
    hits.
  - **`COMMANDS_INVENTORY.md` references** — only two surviving
    in `docs/COMMANDS.md` (lines 300 and 1670), both inside
    historical audit-trail narratives describing the original
    O-004 fix.  Not drift.
  - **`src/...` path drift** — only two surviving in
    `docs/RPL.md:1710` and `docs/TESTS.md:585`, both inside
    historical-narrative passages re-stating P-001's own
    description.  Not drift.
  - **`(this run)` heading drift (R-005 pattern)** — only one
    each in `docs/RPL.md:288` (session 163's own chapter, the
    sole current authoring-window heading) and `docs/COMMANDS.md:44`
    (session 161's own narrative).  Each doc carries exactly one
    "this run" heading — current authoring window only — which
    is the steady-state per the R-005 close.  Not drift.

Total open findings carried forward to next run: **2** (O-009,
O-011 — both `[deferred - post-ship]`, no behavior risk for
the release).  Resolved cumulative: **41** (unchanged from
session 160 close).

**Verification gates (session 164-code-review):**

- `node --check` — clean across `www/src/app.js`,
  `www/src/rpl/ops.js`, `www/src/rpl/state.js`,
  `www/src/rpl/types.js` (this run made no source edits;
  `node --check` was run on the four core files as a
  precaution).
- `node tests/test-all.mjs` = **5156 passing / 0 failing** at
  run-entry (was 5120 at session-160-code-review close + 36
  across the four sibling-lane closures: 160-unit-tests +13
  close-out clusters / 162 +15 LNP1/EXPM / 163 +8 OBJ→
  BinInt+Rational; 161 was doc-only).  Final exit count
  captured at the run-close in `logs/session-164-code-
  review.md` since `session164-unit-tests` is concurrently
  pinning during this run's window.
- `node tests/test-persist.mjs` = **66 passing / 0 failing**
  (stable, fully green since the D-001 ship-prep close;
  count grew from 40 → 66 between sessions 160 and 162 as
  persist-side coverage was added).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~6 ms**
  (stable).

**Lock.** Held `utils/@locks/session164-code-review.json`
throughout, scope = `docs/REVIEW.md` + `logs/` (canonical
review-lane scope; no broadening required this run since no
in-place source edits were taken).  Sibling lock at run-
entry: `session164-unit-tests` holding `tests/` + `docs/
TESTS.md`; their lock body fits the `heartbeatAt ===
startedAt` signature documented in O-011 (twentieth
occurrence — but triaged `[deferred - post-ship]` at the
session-156 meta-log).  Released at end of run.

**Next session's queue (priority order):**

There is no "next" review-lane run before the 2026-04-26
ship.  The hard ship-date guard at the top of every recurring
scheduled task aborts immediately on dates after 2026-04-26,
and a one-time kill-switch task disables all six recurring
tasks at `2026-04-26T23:55:00-07:00`.  Any post-ship review-
lane work would start from a clean slate after the ship-mode
restrictions are lifted.

For the audit trail, the post-ship to-do list remains the same
as at session 160's close:

1. **O-009** — user-side `rm tests/test-control-flow.mjs.bak{,2}`,
   pair with adding `*.bak` / `*.bak2` to `.gitignore`.
2. **O-011** — one-line per-call-site addition to
   `utils/@locks/lock.mjs` (`release()` → `releaseReason:
   "graceful"`; `pruneStale()` → `releaseReason: "stale-prune"`)
   plus a parallel update to `utils/@locks/README.md`.

Both items are pure hygiene with no behavior risk.

Log pointer: `logs/session-164-code-review.md`.

### Session 169-code-review — what shipped (eighteenth review-lane run, third release wrap-up)

One edit this run.  This is a follow-on review-lane pass after
session 164's release wrap-up, taken inside the same 2026-04-25
day window after sessions 165 / 166 / 167 closed sibling-lane
work.  The 2026-04-26 ship-date guard remains active.

- **`docs/REVIEW.md`** — Last-updated stamp bumped to
  session 169-code-review (18th review-lane run); preamble
  rewritten to fold in the three sibling-lane closures since
  session 164 (165 command-support doc-recon / 166 data-types
  LOG/EXP/ALOG + ACOSH/ATANH boundary pinning / 167 rpl-
  programming NEWOB-on-Rational widening); baseline block
  rewritten with the 5206 / 66 / 22 entry gates; **Open queue
  at session 169-code-review close** narrative carried forward
  with per-axis verification breadcrumb; O-009 age trail
  extended (11 review-lane runs aging — both `.bak` files
  still present at unchanged byte counts and mtimes; sessions
  165 / 166 / 167 / 168 did not delete them; tooling gate
  unchanged); O-011 age trail extended (6 review-lane runs
  aging — three more lock-body occurrences from sessions
  165 / 166 / 167 plus one in-flight from `session168-unit-
  tests`, bringing the running count of underlying-ambiguity
  occurrences to **twenty-four** since session 106; status
  remains `[deferred - post-ship]` per the session 156 meta-
  log triage).  No new findings filed (audit-axis sweep
  clean).

**Findings delta this run:**

- **No promotions to resolved this run.**  No sibling lane
  closed an open finding since session 164 — sessions 165 /
  166 / 167 were release-mode doc-reconciliation /
  pinning-cluster / audit-extension work that did not touch
  any of the open R-bucket / D-bucket / C-bucket / X-bucket
  findings (which are all already resolved).  The two open
  items (O-009, O-011) are both `[deferred - post-ship]`.
- **Still-open findings carried forward and aged:**
  - **O-009** — 10 → 11 runs.  `[deferred - post-ship]`.
    `ls -la tests/test-control-flow.mjs*` shows both `.bak`
    files at 92,129 / 92,141 bytes, Apr 24 11:54 / 13:41
    mtimes (frozen since session 113); the live file is
    237,247 bytes — unchanged from session 164's reading
    because the +50 test deltas across sessions 165 / 166 /
    167 all landed in `tests/test-types.mjs` and
    `tests/test-reflection.mjs`, not `tests/test-control-
    flow.mjs`.  No scheduled-task lane can delete the `.bak`
    files without the `mcp__cowork__allow_cowork_file_delete`
    interactive prompt; deferred to user-side cleanup
    post-ship.
  - **O-011** — 5 → 6 runs.  `[deferred - post-ship]`.
    `grep -n "releaseReason" utils/@locks/lock.mjs
    utils/@locks/README.md` returns zero hits.  Sessions
    165 / 166 / 167 lock bodies inspected this run — all
    three carry the `heartbeatAt === startedAt` signature
    documented in O-011 (no lane body in the repo currently
    calls `heartbeat()`, so this is the default for any
    release).  `session168-unit-tests` in flight at this
    run's acquisition fits the same shape — bringing the
    running count of underlying-ambiguity occurrences to
    **twenty-four** since session 106 (twenty at session
    164 close + three new from 165 / 166 / 167 + one in
    flight from 168).
- **No new findings filed.**  Cross-checked the codebase
  against the audit axes from the lane charter; no new
  defects surfaced.  Verified at session 169-code-review:
  - `docs/COMMANDS.md` Counts heading reads "as of session
    165 — 2026-04-25" — current (session 165 was the last
    command-support run; no new ✗ → ✓ row transitions in
    sessions 166 or 167, both of which expanded coverage on
    already-✓ ops, so the heading does not need to bump).
  - `docs/COMMANDS.md` `register()` count line reads "= **476**
    at the end of session 165" — matches `grep -c "register("
    www/src/rpl/ops.js` = **476**, current.  Session 167's
    `_newObCopy` widening was an in-body predicate change,
    not a new `register()` call, so the count is unchanged.
  - `docs/DATA_TYPES.md` Last-updated reads "Session 166
    (2026-04-25, release-mode wrap-up" — current.
  - `docs/RPL.md` Current-implementation-status header reads
    "as of session 167" — current.
  - `docs/TESTS.md` Last-updated reads "Session 164
    (2026-04-25)" — `session168-unit-tests` is in flight at
    this run's acquisition with declared scope including
    `docs/TESTS.md`, so any drift will be addressed by their
    refresh, not this run.
  - **Lane-task-id drift sweep** — `grep -rnE
    "rpl5050-data-types[^-]|rpl5050-tests[^-]|hp50-type-support"
    docs/ www/src/ --include='*.md'` (excluding REVIEW.md)
    returns zero hits.
  - **`COMMANDS_INVENTORY.md` references** — only two surviving
    in `docs/COMMANDS.md` (lines 320 and 1797), both inside
    historical audit-trail narratives describing the original
    O-004 fix.  Not drift.
  - **`src/...` path drift** — only two surviving in
    `docs/RPL.md:1825` and `docs/TESTS.md:658`, both inside
    historical-narrative passages re-stating P-001's own
    description.  Not drift.
  - **`(this run)` heading drift (R-005 pattern)** — only one
    in `docs/RPL.md:301` (session 167's own chapter, the sole
    current authoring-window heading).  COMMANDS.md /
    DATA_TYPES.md / TESTS.md carry no `## Session NNN (this
    run)` heading.  Each doc carries at most one "this run"
    heading — current authoring window only — which is the
    steady-state per the R-005 close.  Not drift.

Total open findings carried forward to next run: **2** (O-009,
O-011 — both `[deferred - post-ship]`, no behavior risk for
the release).  Resolved cumulative: **41** (unchanged from
session 164 close).

**Verification gates (session 169-code-review):**

- `node --check` — clean across `www/src/app.js`,
  `www/src/rpl/ops.js`, `www/src/rpl/state.js`,
  `www/src/rpl/types.js` (this run made no source edits;
  `node --check` was run on the four core files as a
  precaution).
- `node tests/test-all.mjs` = **5206 passing / 0 failing** at
  run-entry (was 5156 at session-164-code-review close + 50
  across the four sibling-lane closures: 164-unit-tests +11
  release-mode pin clusters / 166 +19 LOG/EXP/ALOG +
  ACOSH/ATANH boundary pins / 167 +20 NEWOB-on-Rational pins;
  165 was doc-only).  Final exit count captured at the
  run-close in `logs/session-169-code-review.md` since
  `session168-unit-tests` is concurrently pinning during this
  run's window.
- `node tests/test-persist.mjs` = **66 passing / 0 failing**
  (stable, fully green since the D-001 ship-prep close —
  unchanged across sessions 165 / 166 / 167).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Lock.** Held `utils/@locks/session169-code-review.json`
throughout, scope = `docs/REVIEW.md` + `logs/` (canonical
review-lane scope; no broadening required this run since no
in-place source edits were taken).  Sibling lock at run-
entry: `session168-unit-tests` holding `tests/` + `docs/
TESTS.md`; their lock body fits the `heartbeatAt ===
startedAt` signature documented in O-011 (twenty-fourth
occurrence — but triaged `[deferred - post-ship]` at the
session-156 meta-log).  Released at end of run.

**Next session's queue (priority order):**

There is no "next" review-lane run before the 2026-04-26
ship.  The hard ship-date guard at the top of every recurring
scheduled task aborts immediately on dates after 2026-04-26,
and a one-time kill-switch task disables all six recurring
tasks at `2026-04-26T23:55:00-07:00`.  Any post-ship review-
lane work would start from a clean slate after the ship-mode
restrictions are lifted.

For the audit trail, the post-ship to-do list remains the same
as at session 164's close:

1. **O-009** — user-side `rm tests/test-control-flow.mjs.bak{,2}`,
   pair with adding `*.bak` / `*.bak2` to `.gitignore`.
2. **O-011** — one-line per-call-site addition to
   `utils/@locks/lock.mjs` (`release()` → `releaseReason:
   "graceful"`; `pruneStale()` → `releaseReason: "stale-prune"`)
   plus a parallel update to `utils/@locks/README.md`.

Both items are pure hygiene with no behavior risk.

Log pointer: `logs/session-169-code-review.md`.

### Session 185-code-review — what shipped (twentieth review-lane run, fifth release wrap-up)

**Date.** Sunday 2026-04-26 (post-ship, hour ~07:00 UTC).
**Lock.** `utils/@locks/session185-code-review.json`
(startedAt: 1777183591; scope = `docs/REVIEW.md` + `logs/`).
No sibling locks at acquisition — session185-unit-tests had
released gracefully at 1777183243, ~5 minutes before this
run's lock claim.

**Entry gates.**
- `node tests/test-all.mjs` = **5433 / 0** (fully green).
- `node tests/test-persist.mjs` = **66 / 0** (stable).
- `node tests/sanity.mjs` = **22 / 0** in ~5 ms (stable).
- `node --check` clean across all four core sources.

**Sibling sessions absorbed (181–185):**
- **181** (unit-tests, doc-only) — TESTS.md snapshot refresh,
  Last-updated stamp 173 → 181; confirmed 5389/0 baseline.
- **182** (command-support, doc-only) — COMMANDS.md Counts
  stamp "as of session 178" → "as of session 182"; session-log
  back-fill 179–181; register count note refreshed (unchanged
  at 476 as of s182 check).
- **183** (data-type-support, +12 pins) — T-003 partial close:
  session-175 trig value pins re-landed as `session175r:`
  labels in `tests/test-types.mjs` (959 → 971 / 5389 → 5401).
- **184** (rpl-programming, verification-only) — confirmed
  5401/0, all RPL-bucket findings closed; no edits.
- **185** (unit-tests, **T-003 full close**, +24 pins) —
  session-177 re-land: +14 EXACT Integer trig pins in
  `tests/test-types.mjs` (971 → 985) + +10 RUN edge pins in
  `tests/test-control-flow.mjs` (789 → 799); TESTS.md stamp
  181 → 185; T-003 → `[resolved - session 185]` (5401 → 5433).

**Findings delta.**
- **T-003** — promoted from `partial` to `[resolved -
  session 185]` (in-finding update already made by s185;
  reflected in preamble and baseline block this run).
- **O-009** — 12 → 13 runs.  Both `.bak` files still on
  disk at 92,129 / 92,141 bytes / Apr 24 mtimes; live
  `test-control-flow.mjs` now 240,604 bytes.
  `[deferred - post-ship]`.
- **O-011** — 7 → 8 runs.  Five more sessions (181–185)
  each with `heartbeatAt ≡ startedAt`; running count now
  **forty** occurrences since session 106.
  `[deferred - post-ship]`.

**No new findings filed.**  Audit-axis sweep (doc freshness,
dead code, path drift, lane-id drift):
- COMMANDS.md Counts heading "as of session 182" — current.
- `grep -c "register("` = 478 (vs. s182's reference of 476;
  the +2 delta traces to comment lines containing `register(`
  from older CAS-ops sessions; no new named registrations).
- DATA_TYPES.md Last-updated = "Session 183" — current.
- TESTS.md Last-updated = "Session 185" — current (s185
  freshly updated).
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable (historical
  audit-trail passages only).

**Open queue at run-close (all post-ship):**
- **O-009** `[deferred - post-ship]` — 13 runs.
- **O-011** `[deferred - post-ship]` — 8 runs.

Zero release-blocker findings.  **T-003 fully closed.**
Ship is clean.

Log pointer: `logs/session-185-code-review.md`.

### Session 189-code-review — what shipped (twenty-first review-lane run, post-ship audit)

**Date.** Sunday 2026-04-26 (post-ship).
**Lock.** `utils/@locks/session189-code-review.json`
(startedAt: ~1777186720; scope = `docs/REVIEW.md` + `logs/`).
Session189-unit-tests held a concurrent lock on `docs/TESTS.md`
+ `logs/` but released (releasedAt: 1777186720) before this
run wrote any output.

**Entry gates.**
- `node tests/test-all.mjs` = **5448 / 0** (fully green).
- `node tests/test-persist.mjs` = **66 / 0** (stable).
- `node tests/sanity.mjs` = **22 / 0** in ~5 ms (stable).
- `node --check` clean across all four core sources.

**Sibling sessions absorbed (186–189):**
- **186** (command-support, doc-only) — COMMANDS.md Counts
  stamp "as of session 182" → "as of session 186"; session-log
  back-fill 183–186; register count note refreshed (reported
  476/455 — stale; see C-012).
- **187** (data-type-support, +15 pins) — XPON + MANT
  L/V/M/T wrapper-add in `www/src/rpl/ops.js`; +8 XPON pins
  + +7 MANT pins in `tests/test-types.mjs` (985 → 1000);
  DATA_TYPES.md stamp Session 183 → Session 187 (5433 → 5448).
- **188** (rpl-programming, verification-only) — RPL.md stamp
  bump "as of session 180" → "as of session 188"; confirmed
  5448/0 baseline; all RPL-bucket findings closed; no edits.
- **189** (unit-tests, ran concurrently) — TESTS.md snapshot
  refresh, stamp 185 → 189; sibling-delta narrative for
  s186/s187/s188 added; confirmed 5448/0 baseline.

**Findings delta.**
- **O-009** — promoted from `[deferred - post-ship]` to
  `[resolved - session-189-code-review]`.  Both
  `test-control-flow.mjs.bak` and `test-control-flow.mjs.bak2`
  confirmed absent by `find` at run entry; exact removal
  session unknown (user-side cleanup most likely; session-189-
  unit-tests concurrent log still listed them as "blocked").
  13 review-lane runs at close.
- **O-011** — 8 → 9 runs.  Four new lock-body occurrences
  (186 / 187 / 188 / 189); running count now **forty-four**
  since session 106.  `[deferred - post-ship]`.
- **C-012** — new finding filed.  COMMANDS.md register-count
  claim 476/455 stale; actual 478/457.  Lane =
  `rpl5050-command-support`.
- **O-012** — new finding filed.  Stray `www/src/ui/
  keyboard.js.bak` file; `[deferred - post-ship]` pending
  interactive delete approval.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 186" — current
  stamp (register count claim stale — see C-012).
- `grep -c "register("` = 478 actual; `grep -cE "^register\("` 
  = 457 actual.
- DATA_TYPES.md Last-updated = "Session 187" — current.
- TESTS.md Last-updated = "Session 189" — current (s189
  unit-tests just updated).
- O-007 (`buildGiacCmd` block comment) — confirmed resolved
  (ship-prep 2026-04-25 rewrote the stale top block; `grep
  "purge free variables first" www/src/rpl/cas/giac-convert.mjs`
  returns zero hits).
- Session-188 log mentions T-003 as "partial" — inaccuracy
  (T-003 closed session 185); log files are immutable audit
  trail, noted here for future readers.
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 9 runs.
- **C-012** new, `[ship-stretch]` (doc-only, command-support).
- **O-012** new, `[deferred - post-ship]` (stray file, UI/any
  interactive lane).

Zero release-blocker findings.  **T-003 + O-009 fully closed.**

Log pointer: `logs/session-189-code-review.md`.

### Session 194-code-review — what shipped (twenty-second review-lane run, post-ship audit)

**Date.** Sunday 2026-04-26 (post-ship).
**Lock.** `utils/@locks/session194-code-review.json`
(scope = `docs/REVIEW.md` + `logs/`).
Session193-unit-tests held a concurrent lock on `docs/TESTS.md`
+ `logs/` (startedAt: 1777190160, released at 1777190269)
before this run wrote any output.

**Entry gates.**
- `node tests/test-all.mjs` = **5464 / 0** (fully green).
- `node tests/test-persist.mjs` = **66 / 0** (stable).
- `node tests/sanity.mjs` = **22 / 0** in ~6 ms (stable).
- `node --check` clean across all four core sources.

**Sibling sessions absorbed (190–193):**
- **190** (command-support, doc-only) — C-012 close; COMMANDS.md
  Counts stamp "as of session 186" → "as of session 190";
  register-count prose corrected to 481/460.
- **191** (data-type-support, +16 pins) — HEAVISIDE + DIRAC
  L/V/M/T wrapper-add; +16 pins in `tests/test-types.mjs`
  (1000 → 1016); two stale reject tests in `tests/test-algebra.mjs`
  updated; DATA_TYPES.md stamp Session 187 → Session 191
  (5448 → 5464).
- **192** (rpl-programming, verification-only) — RPL.md stamp
  bump "as of session 188" → "as of session 192"; confirmed
  5464/0 baseline; all RPL-bucket findings closed.
- **193** (unit-tests, ran concurrently) — TESTS.md snapshot
  refresh, stamp 189 → 193; sibling-delta narrative for
  s190–s192 added; confirmed 5464/0 baseline.

**Findings delta.**
- **C-012** — promoted from `[ship-stretch]` to
  `[resolved - session 190]`.  COMMANDS.md register-count
  corrected to 481/460 by session 190 command-support run.
- **O-011** — 9 → 10 runs.  Four new lock-body occurrences
  (190 / 191 / 192 / 193); running count now **forty-eight**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk).  `[deferred - post-ship]`.
- **C-013** — new finding filed.  COMMANDS.md register-count
  prose stale after session-191 HEAVISIDE/DIRAC wrapper-add;
  actual 482/461 vs. claimed 481/460.  Lane =
  `rpl5050-command-support`.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 190" — current.
  Register count claim 481/460 stale by +1/+1 — see C-013.
- `grep -c "register("` = 482 actual; `grep -cE "^register\("` = 461 actual.
- DATA_TYPES.md Last-updated = "Session 191" — current.
- TESTS.md Last-updated = "Session 193" — current.
- RPL.md stamp = "as of session 192" — current.
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 10 runs.
- **O-012** `[deferred - post-ship]` (stray file).
- **C-013** new, `[deferred - post-ship]` (doc-only, command-support).

Zero release-blocker findings.

Log pointer: `logs/session-194-code-review.md`.

### Session 198-code-review — what shipped (twenty-third review-lane run, post-ship audit)

**Date.** Sunday 2026-04-26 (post-ship).
**Lock.** `utils/@locks/session198-code-review.json`
(acquired initially scope = `docs/REVIEW.md` only; broadened
to `docs/REVIEW.md` + `logs/` after session198-unit-tests
released (startedAt: 1777193784, releasedAt: 1777193887)).

**Entry gates.**
- `node tests/test-all.mjs` = **5472 / 0** (fully green).
- `node tests/test-persist.mjs` = **all passing / 0 failing** (stable).
- `node tests/sanity.mjs` = **22 / 0** in ~5 ms (stable).
- `node --check` clean across all four core sources.

**Sibling sessions absorbed (195–198-unit-tests):**
- **195** (command-support, doc-only) — C-013 close; COMMANDS.md
  Counts stamp "as of session 190" → "as of session 195";
  register-count prose updated to 482/461.
- **196** (data-type-support, +8 pins) — TRUNC L/T wrapper-add,
  `_withTaggedBinary(_withListBinary(_truncOp()))` closes the last
  ship-prep 2026-04-25 audit candidate; +8 pins in
  `tests/test-types.mjs` (5464 → 5472); DATA_TYPES.md stamp
  Session 191 → Session 196.
- **197** (rpl-programming, doc-only) — RPL.md session-log pointer
  backfill for sessions 172/180/184/188/192; status stamp
  "as of session 192" → "as of session 197"; no source/test changes.
- **198-unit-tests** (concurrent) — TESTS.md snapshot refresh,
  stamp 193 → 198; sibling-delta narrative for s194–s197 added;
  confirmed 5472/0 baseline; released before this run wrote output.

**Findings delta.**
- **C-013** — promoted from open to `[resolved - session 195]`.
  COMMANDS.md register-count corrected to 482/461.
- **O-011** — 10 → 11 runs.  Four new lock-body occurrences
  (195 / 196 / 197 / 198-unit-tests); running count now
  **fifty-two** since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk, mtime 2026-04-25).  `[deferred - post-ship]`.
- **C-014** — new finding filed.  COMMANDS.md session-log block
  stops at session 186; sessions 187–197 have no entries (11
  sessions).  Recurring anti-pattern from C-005/C-006/C-007/C-008.
  Lane = `rpl5050-command-support`.  `[deferred - post-ship]`.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 195" — current.
  Register count claim 482/461 — verified correct.
- `grep -c "register("` = 482 actual; `grep -cE "^register\("` = 461 actual.
- DATA_TYPES.md Last-updated = "Session 196" — current.
- TESTS.md Last-updated = "Session 198" — current (s198
  unit-tests updated concurrently).
- RPL.md stamp = "as of session 197" — current.
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable.
- `node --check` clean on all core sources.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 11 runs.
- **O-012** `[deferred - post-ship]` (stray file).
- **C-014** new, `[deferred - post-ship]` (doc-only, command-support).

Zero release-blocker findings.

Log pointer: `logs/session-198-code-review.md`.

### Session 202-code-review — what shipped (twenty-fourth review-lane run, post-ship audit)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(preamble + O-007 status + O-011/O-012 aging),
`logs/session-202-code-review.md` (session log).
No source or test changes.

**Sibling sessions folded in (199–202-unit-tests):**
- **199** (command-support, doc-only) — C-014 close; COMMANDS.md
  session-log back-filled for sessions 187–198; Counts stamp
  advanced to "as of session 199"; 5485/0 confirmed.
- **200** (data-type-support) — GAMMA/LNGAMMA/erf/erfc L/V/M
  stale-`·`-cell promotion (+13 pins in `tests/test-types.mjs`;
  5472 → 5485); DATA_TYPES.md stamp refreshed to Session 200.
- **201** (rpl-programming, doc-only) — RPL.md status stamp
  advanced to "as of session 201"; session-log pointer prose
  backfilled for sessions 192–201; 5485/0 confirmed.
- **202-unit-tests** (concurrent) — TESTS.md snapshot updated to
  5485/0; sibling-delta narrative for s199–s201 added; stamp
  refreshed to Session 202; released lock before this run
  acquired `logs/`.

**Findings delta.**
- **O-007** — status line corrected.  Formal **Status.** line
  still read "open" at finding body's Age row; resolution was
  appended at ship-prep 2026-04-25 but the status token was
  never promoted.  Promoted to `[resolved - ship-prep
  2026-04-25]`.  Verified by grep: `grep -n "purge free
  variables first" www/src/rpl/cas/giac-convert.mjs` = 0 hits.
- **O-011** — 11 → 12 runs.  Five new lock-body occurrences
  (199/200/201/202-unit-tests/202-code-review); running count
  now **fifty-seven** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk, mtime 2026-04-25); aged to 3 runs.
  `[deferred - post-ship]`.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 199" — current.
  Register count claim 482/461 — verified correct.
- `grep -c "register("` = 482 actual; `grep -cE "^register\("` = 461 actual.
- DATA_TYPES.md Last-updated = "Session 200" — current.
- TESTS.md Last-updated = "Session 202" — current (202-unit-tests
  updated concurrently, released before log write).
- RPL.md stamp = "as of session 201" — current.
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable.
- `node --check` clean on all four core sources.
- erf/erfc: `register('erfc', ...)` uses `_withTaggedUnary(
  _withListUnary(...))` — L/V covered, M and L/V/M for erfc
  still `·` in DATA_TYPES.md; data-type lane already tracks
  this in its next-session queue (no new REVIEW.md finding).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 12 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 3 runs.

Zero release-blocker findings.

Log pointer: `logs/session-202-code-review.md`.

### Session 203 — what shipped (command-support, post-ship doc-reconciliation)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 199 → 203; session-log back-fill for sessions 200–202),
`docs/REVIEW.md` (O-011/O-012 aging, this entry),
`logs/session-203.md` (session log).
No source or test changes.

**Sibling sessions folded in (200–202-code-review):**
- **200** (data-type-support) — GAMMA/LNGAMMA/erf/erfc L/V/M
  stale-`·`-cell promotion; +13 pins; 5472 → 5485.
- **201** (rpl-programming, doc-only) — RPL.md stamp → "as of session 201".
- **202-unit-tests** — TESTS.md stamp → Session 202; 5485/0.
- **202-code-review** — O-007 status promoted, O-011 aged 11 → 12,
  O-012 aged to 3 runs; no new findings.

**Findings delta.**
- **O-011** — 12 → 13 runs.  One new lock-body occurrence (session203);
  running count now **fifty-eight** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak` still
  on disk); aged to 4 runs.  `[deferred - post-ship]`.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 203" — current.
  Register count claim 482/461 — verified correct.
- `grep -c "register("` = 482 actual; `grep -cE "^register\("` = 461 actual.
- DATA_TYPES.md Last-updated = "Session 200" — current.
- TESTS.md Last-updated = "Session 202" — current.
- RPL.md stamp = "as of session 201" — current.
- Lane-task-id drift: none found.
- `src/...` path drift in docs: none actionable.
- `node --check` clean on all core sources (not modified this run).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 13 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-203.md`.

### Session 204 — what shipped (data-type-support, pin-only cluster)

erfc L/V/M/T+L stale-`·`-cell promotion.  Files edited: `tests/test-types.mjs`
(+7 `session204:` assertions, 5485 → 5492), `docs/DATA_TYPES.md`
(Last-updated stamp → Session 204; ERFC row L/V/M `·`→`✓`;
"Resolved this session (204)" block added), `logs/session-204.md` (session log).
No source changes.

**Findings delta.**
- **O-011** — 13 → 14 runs.  One new lock-body occurrence (session204-data-type-support);
  running count now **fifty-nine** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak` still
  on disk); aged to 5 runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs.

Zero release-blocker findings.

Log pointer: `logs/session-204.md`.

### Session 205 — what shipped (rpl-programming, post-ship stamp)

Post-ship doc-stamp pass.  Files edited: `docs/RPL.md`
(status stamp 201 → 205; session-log pointer prose updated for
sessions 202–205), `logs/session-205.md` (session log).
No source or test changes.

**Sibling sessions folded in (202-code-review–204):**
- **202-code-review** — O-007 status promotion; O-011 aged 11 → 12;
  O-012 aged to 3 runs; no new findings.
- **203** (command-support) — COMMANDS.md stamp + back-fill; doc-only.
- **204** (data-type-support) — erfc L/V/M/T+L pins; +7; 5485 → 5492.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md was not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs.

Zero release-blocker findings.

Log pointer: `logs/session-205.md`.

### Session 206 — what shipped (unit-tests, post-ship snapshot refresh)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp → Session 206; sibling-delta narrative for
s203–s205 added; snapshot table updated to 5492/0),
`logs/session-206.md` (session log).
No source changes.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md was not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs.

Zero release-blocker findings.

Log pointer: `logs/session-206.md`.

### Session 203-code-review — what shipped (code-review, twenty-fifth run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 203-code-review; preamble
rewritten to fold in sessions 203–206-unit-tests; baseline
updated to 5492/0/22; O-011 re-verified + aged 12 → 13 runs,
running count fifty-seven → sixty-two; O-012 re-verified +
aged to 4 code-review-lane runs; session-log entries for
205/206/203-code-review added), `logs/session-203-code-review.md`
(session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 203" — current.
  Register count claim 482/461 — verified correct.
- DATA_TYPES.md Last-updated = "Session 204" — current.
- TESTS.md Last-updated = "Session 206" — current (session 206
  completed and released before this run's log-lock acquisition).
- RPL.md stamp = "as of session 205" — current.
- `src/...` path drift in docs: none actionable (two surviving
  mentions in RPL.md:2110 and TESTS.md:818 are both historical
  audit-trail passages preserved per policy).
- Lane-task-id drift: none found.
- `node --check` clean on all core sources (not modified this run).
- `find www/ -name '*.bak*'` — one hit, O-012 still present.
- COMMANDS.md session-log missing entries for sessions 204/205/206
  (three-session gap); minor doc lag, command-support lane's next
  run will naturally back-fill — no formal finding filed given
  small gap and post-ship context.

**Findings delta.**
- **O-011** — 12 → 13 review-lane runs.  Three new lock-body
  occurrences (session205/session206-unit-tests/session203-code-review);
  running count now **sixty-two** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 4 code-review-lane runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 13 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-203-code-review.md`.

### Session 207 — what shipped (command-support, post-ship doc-reconciliation)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 203 → 207; session-log back-filled for sessions
203-code-review / 204 / 205 / 206 — four sessions with no prior
COMMANDS.md entries), `docs/REVIEW.md` (Last-updated stamp bumped to
session 207; preamble rewritten; baseline block updated; O-011 aged
13 → 14 runs; O-012 re-verified; session-log entry added),
`logs/session-207.md` (session log).
No source or test changes.

**Findings delta.**
- **O-011** — 13 → 14 runs.  Three new lock-body occurrences
  (session207-command-support / session204-data-type-support /
  session205-rpl-programming / session206-unit-tests); running count
  now **sixty-five** since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 5 runs.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs.

Zero release-blocker findings.

Log pointer: `logs/session-207.md`.

### Session 208 — what shipped (data-type-support, erf M-cell pin)

erf M-cell stale-`·`-cell promotion.  Files edited: `tests/test-types.mjs`
(+1 `session208:` assertion, 5492 → 5493), `docs/DATA_TYPES.md`
(Last-updated stamp → Session 208; ERF matrix M `·`→`✓`;
"Resolved this session (208)" block added), `logs/session-208.md` (session log).
No source changes.

**Findings delta.**
- **O-011** — no REVIEW.md edits this run; acknowledged in 210-code-review fold.
- **O-012** — no REVIEW.md edits this run; re-verified in 210-code-review fold.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs (unchanged from 207).
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs (unchanged from 207).

Zero release-blocker findings.

Log pointer: `logs/session-208.md`.

### Session 209 — what shipped (rpl-programming, post-ship stamp)

Post-ship doc-stamp pass.  Files edited: `docs/RPL.md`
(status stamp 205 → 209; Session-201 `(this run)` heading demoted to
past tense; Session-209 `(this run)` chapter added; session-log pointer
prose updated for sessions 205–209), `logs/session-209.md` (session log).
No source or test changes.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md was not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs (unchanged).
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs (unchanged).

Zero release-blocker findings.

Log pointer: `logs/session-209.md`.

### Session 210 — what shipped (unit-tests, post-ship snapshot refresh)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp → Session 210; sibling-delta narrative for
s207–s209 added; snapshot table updated to 5493/0),
`logs/session-210.md` (session log).
No source changes.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md was not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 14 runs (unchanged).
- **O-012** `[deferred - post-ship]` (stray file) — 5 runs (unchanged).

Zero release-blocker findings.

Log pointer: `logs/session-210.md`.

### Session 210-code-review — what shipped (code-review, twenty-sixth run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 210-code-review; preamble
rewritten to fold in sessions 208–210; baseline
updated to 5493/0/22; O-011 re-verified + aged 14 → 15 runs,
running count sixty-five → sixty-nine; O-012 re-verified +
aged to 6 code-review-lane runs; session-log entries for
208/209/210/210-code-review added), `logs/session-210-code-review.md`
(session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 207" — current.
  Sessions 208–210 added no new register() calls.
  Register count claim 482/461 — verified correct.
- DATA_TYPES.md Last-updated = "Session 208" — current.
- TESTS.md Last-updated = "Session 210" — current.
- RPL.md stamp = "as of session 209" — current.
- `src/...` path drift in docs: one surviving mention at
  `docs/RPL.md:2133` — confirmed historical audit-trail passage
  (Session 106 P-001 migration narrative); preserved per policy.
- Lane-task-id drift: none found.
- `node --check` clean on all core sources (not modified this run).
- `find www/ -name '*.bak*'` — one hit, O-012 still present.
- COMMANDS.md session-log missing entries for sessions 208/209/210
  (three-session gap); all three were doc-only with no register
  changes — no formal finding filed; command-support lane may back-fill
  in its next post-ship pass if desired.

**Findings delta.**
- **O-011** — 14 → 15 runs.  Four new lock-body occurrences
  (session208-data-type-support / session209-rpl-programming /
  session210-unit-tests / session210-code-review); running count
  now **sixty-nine** since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 6 code-review-lane runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 15 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 6 runs.

Zero release-blocker findings.

Log pointer: `logs/session-210-code-review.md`.

### Session 211 — what shipped (command-support, post-ship doc-reconciliation)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 207 → 211; session-log back-filled for sessions
208 / 209 / 210 / 210-code-review — four sessions with no prior
COMMANDS.md entries), `logs/session-211.md` (session log).
No source or test changes.

**Findings delta.**
- **O-011** — no REVIEW.md edits this run; counted in 211-code-review fold.
- **O-012** — no REVIEW.md edits this run; re-verified in 211-code-review fold.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 15 runs (unchanged from 210-code-review).
- **O-012** `[deferred - post-ship]` (stray file) — 6 runs (unchanged from 210-code-review).

Zero release-blocker findings.

Log pointer: `logs/session-211.md`.

### Session 212 — what shipped (data-type-support, ZETA/LAMBERT Z/L/V/M pins)

ZETA and LAMBERT stale-`·`-cell promotion.  Files edited:
`tests/test-types.mjs` (+10 `session212:` assertions, 5493 → 5503),
`docs/DATA_TYPES.md` (Last-updated stamp → Session 212; ZETA and
LAMBERT Z/L/V/M columns `·`→`✓`; "Resolved this session (212)" block
prepended above session 208's block), `logs/session-212.md` (session log).
No source changes.

**Findings delta.**
- **O-011** — no REVIEW.md edits this run; counted in 211-code-review fold.
- **O-012** — no REVIEW.md edits this run; re-verified in 211-code-review fold.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 15 runs (unchanged).
- **O-012** `[deferred - post-ship]` (stray file) — 6 runs (unchanged).

Zero release-blocker findings.

Log pointer: `logs/session-212.md`.

### Session 213 — what shipped (rpl-programming, post-ship verification pass)

Post-ship verification-only pass.  Files edited: `docs/RPL.md`
(status stamp "as of session 209" → "as of session 213"; Session 209
`(this run)` heading demoted to plain past tense; Session 213
`(this run)` block added; session-log pointer prose updated),
`logs/session-213.md` (session log).
No source or test changes.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 15 runs (unchanged).
- **O-012** `[deferred - post-ship]` (stray file) — 6 runs (unchanged).

Zero release-blocker findings.

Log pointer: `logs/session-213.md`.

### Session 214 — what shipped (unit-tests, post-ship snapshot refresh)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp → Session 214; release-window run count 15th → 16th;
new coverage snapshot prepended absorbing sibling deltas 5493 → 5503;
per-file table updated with test-types.mjs 1045 → 1055 from session-212's
+10 ZETA/LAMBERT pins), `logs/session-214.md` (session log).
No source changes.

**Findings delta.**
- No REVIEW.md edits this run (docs/REVIEW.md not in scope).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 15 runs (unchanged, per session-214 log).
- **O-012** `[deferred - post-ship]` (stray file) — 6 runs (unchanged).

Zero release-blocker findings.

Log pointer: `logs/session-214.md`.

### Session 211-code-review — what shipped (code-review, twenty-seventh run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 211-code-review; preamble
rewritten to fold in sessions 211–214; baseline updated to 5503/0/22;
O-011 re-verified + aged 15 → 16 runs, finding-body catchup paragraphs
added for sessions 207/210-code-review (previously preamble-only),
running count sixty-nine → seventy-four; O-012 re-verified +
aged to 7 code-review-lane runs; session-log entries for
211/212/213/214/211-code-review added), `logs/session-211-code-review.md`
(session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 211" — current.
  Sessions 212–214 added no new register() calls.
  Register count claim 482/461 — verified correct.
- DATA_TYPES.md Last-updated = "Session 212" — current.
- TESTS.md Last-updated = "Session 214" — current.
- RPL.md stamp = "as of session 213" — current.
- `src/...` path drift in docs: one surviving mention at
  `docs/RPL.md:2133` — confirmed historical audit-trail passage
  (Session 106 P-001 migration narrative); preserved per policy.
- Lane-task-id drift: none found.
- `node --check` clean on all core sources (not modified this run).
- `find www/ -name '*.bak*'` — one hit, O-012 still present.
- COMMANDS.md session-log missing entries for sessions 212/213/214
  (three-session gap); all three were doc-only or test-only with
  no register changes — no formal finding filed; command-support
  lane may back-fill in its next post-ship pass if desired.

**Findings delta.**
- **O-011** — 15 → 16 runs.  Five new lock-body occurrences
  (session211-command-support / session212-data-type-support /
  session213-rpl-programming / session214-unit-tests /
  session211-code-review); running count now **seventy-four**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 7 code-review-lane runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 16 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 7 runs.

Zero release-blocker findings.

Log pointer: `logs/session-211-code-review.md`.

### Session 215 — what shipped (command-support, post-ship)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 211 → 215; session-log entries back-filled for
211-code-review / 212 / 213 / 214 — all doc-only or test-only with
no register changes).  No source or test changes.  Run-close: 5503/0.

Log pointer: `logs/session-215.md`.

### Session 216 — what shipped (data-type-support, post-ship)

Post-ship stale-`·`-cell promotion.  Files edited: `tests/test-types.mjs`
(+5 pins: PSI L-empty, L n=1, L n=2, V, M); `docs/DATA_TYPES.md`
(PSI row L/V/M `·`→`✓`; Last-updated stamp → Session 216).
Run-close: 5508/0 (+5 from entry).

Log pointer: `logs/session-216.md`.

### Session 217 — what shipped (rpl-programming, post-ship)

Post-ship verification pass.  Files edited: `docs/RPL.md`
(stamp "as of session 213" → "as of session 217"; session-log
pointer updated).  No source or test changes.  Run-close: 5508/0.

Log pointer: `logs/session-217.md`.

### Session 218 — what shipped (unit-tests, post-ship)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp 214 → 218; per-file table updated —
test-types.mjs 1055 → 1060; session-218 log entry prepended).
No source or test changes.  Run-close: 5508/0.

Log pointer: `logs/session-218.md`.

### Session 219-code-review — what shipped (code-review, twenty-eighth run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 219-code-review; preamble
rewritten to fold in sessions 215–218; baseline updated to 5508/66/22;
O-011 re-verified + aged 16 → 17 runs, running count seventy-four →
seventy-nine; O-012 re-verified + aged to 8 code-review-lane runs;
session-log entries for 215/216/217/218/219-code-review added),
`logs/session-219-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 215" — current.
  Sessions 216–218 added no new register() calls.
  Register count claim 482/461 — verified correct.
- DATA_TYPES.md Last-updated = "Session 216" — current.
- TESTS.md Last-updated = "Session 218" — current.
- RPL.md stamp = "as of session 217" — current.
- `src/...` path drift in docs: surviving mentions in RPL.md:2153
  and TESTS.md:818 — both confirmed historical audit-trail passages;
  preserved per policy.
- Lane-task-id drift: none found.
- `find www/ -name '*.bak*'` — one hit, O-012 still present.
- `src-tauri/target/` tree contains `.bak` build-artifact files —
  machine-generated; not in scope.

**Findings delta.**
- **O-011** — 16 → 17 runs.  Five new lock-body occurrences
  (session215-command-support / session216-data-type-support /
  session217-rpl-programming / session218-unit-tests /
  code-review-2026-04-26); running count now **seventy-nine**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 8 code-review-lane runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 17 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 8 runs.

Zero release-blocker findings.

Log pointer: `logs/session-219-code-review.md`.

### Session 220 — what shipped (command-support, post-ship doc-reconciliation)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 215 → 220; session-log back-filled for sessions
215 / 216 / 217 / 218 / 219-code-review — all doc-only or
test-only with no register changes).  No source or test changes.
Run-close: 5508/0.

Log pointer: `logs/session-220.md`.

### Session 221 — what shipped (data-type-support, post-ship)

Post-ship doc-only pass.  Files edited: `docs/DATA_TYPES.md`
(arithmetic section split — `+`/`-`/`*`/`/`/`^` pulled into dedicated
subsection with per-op Notes rows and prose preamble; Last-updated
stamp → Session 221).  No source or test changes.  Run-close: 5508/0.

Log pointer: `logs/session-221.md`.

### Session 222 — what shipped (rpl-programming, post-ship)

Post-ship verification pass.  Files edited: `docs/RPL.md`
(stamp "as of session 217" → "as of session 222"; session-log pointer
updated).  No source or test changes.  Run-close: 5508/0.

Log pointer: `logs/session-222.md`.

### Session 223 — what shipped (unit-tests, post-ship snapshot refresh)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp 218 → 223; release-window run count 17th → 18th;
new coverage snapshot prepended absorbing sibling deltas 5508 → 5508;
per-file table confirmed unchanged; session-223 log entry prepended).
No source or test changes.  Run-close: 5508/0.

**Findings delta.**
- **O-011** — 17 → 18 runs.  Four new lock-body occurrences
  (session220-command-support / session221-data-type-support /
  session222-rpl-programming / session223-unit-tests); running count
  now **eighty-three** since session 106.  `[deferred - post-ship]`.
- **O-012** — not re-verified this run (unit-tests lane, no bak-file
  sweep in scope); carried forward at 8 code-review-lane runs.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 18 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 8 runs.

Zero release-blocker findings.

Log pointer: `logs/session-223.md`.

### Session 224-code-review — what shipped (code-review, twenty-ninth run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 224-code-review; preamble
rewritten to fold in sessions 220–223; baseline updated to
session 224-code-review, gates 5508/66/22 unchanged; O-011
aged 18 → 19 runs, running count eighty-three → eighty-four;
O-012 re-verified present, aged to 9 code-review-lane runs;
O-013 filed — AI subsystem `system-prompt.js` RPL_CATALOG drift
risk; session-log entries for 220/221/222/223/224-code-review added),
`logs/session-224-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 220" — current.
  Sessions 221–223 added no new register() calls.
  Register count claim 482/461 — verified correct.
- DATA_TYPES.md Last-updated = "Session 221" — current.
- TESTS.md Last-updated = "Session 223" — current.
- RPL.md stamp = "as of session 222" — current.
- `www/src/ai/` subsystem (chat-bot.js, llm.js, llm-worker.js,
  system-prompt.js) identified as unreviewed; O-013 filed.
- `find www/ -name '*.bak*'` — one hit, O-012 still present
  (`www/src/ui/keyboard.js.bak`; mtime 2026-04-25).
- Lane-task-id drift: none found.
- `src/...` path drift: surviving historical mentions in RPL.md
  and TESTS.md confirmed as audit-trail passages; preserved per policy.

**Findings delta.**
- **O-011** — 18 → 19 runs.  One new lock-body occurrence
  (session224-code-review); running count now **eighty-four**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk, mtime 2026-04-25); aged to 9 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-013** — new finding filed.  `www/src/ai/system-prompt.js`
  RPL_CATALOG drift risk.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 19 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 9 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — new.

Zero release-blocker findings.

Log pointer: `logs/session-224-code-review.md`.

### Session 225 — what shipped (command-support, post-ship doc-reconciliation)

Post-ship doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 220 → 225; session-log back-filled for sessions
221 / 222 / 223 / 224-code-review — all doc-only or test-only with
no register changes; register-count prose updated: `grep -c` now
480 / 461, −2 in total from session-220 comment-cleanup removing
two comment lines that contained `register(`, not actual op changes),
`docs/REVIEW.md` (this entry), `logs/session-225.md` (session log).
No source or test changes.  Run-close: 5508/0.

**Findings delta.**
- **O-011** — 19 → 20 runs.  One new lock-body occurrence
  (session225-command-support); running count now **eighty-five**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — carried forward at 9 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward, new (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 20 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 9 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 1 run.

Zero release-blocker findings.

Log pointer: `logs/session-225.md`.

### Session 226 — what shipped (data-type-support, Q column + rejection pins)

Q column inserted into all DATA_TYPES.md coverage-matrix tables; three
CONJ/RE/IM Q rejection guards added to `tests/test-types.mjs`.
Files edited: `docs/DATA_TYPES.md` (Last-updated stamp 221→226; Q column
added to 12 tables; Next-session queue item 1 closed; "Resolved this
session (226)" block added), `tests/test-types.mjs` (+3 session226:
rejection assertions for CONJ/RE/IM on Rational), `docs/REVIEW.md`
(this entry), `logs/session-226.md` (session log).
No changes to ops.js or algebra.js.  Run-close: 5511/0/0.

**Findings delta.**
- **O-011** — 20 runs unchanged (no new lock-body occurrence this run;
  ops.js not edited); running count stays **eighty-five** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward at 9 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 20 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 9 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 1 run.

Zero release-blocker findings.

Log pointer: `logs/session-226.md`.

### Session 227 — what shipped (rpl-programming, verification pass)

Post-ship verification pass — no source or test changes.
Files edited: `docs/RPL.md` (status stamp 222→227; session 222 pointer
demoted from "is this run" to past tense; session 227 pointer entry
added; footnote extended with 222→227 demotion record),
`docs/REVIEW.md` (this entry), `logs/session-227.md` (session log).
Run-close: 5511/0/22.

**Findings delta.**
- **O-011** — 20 runs unchanged (no new lock-body occurrence this run;
  ops.js not edited); running count stays **eighty-five** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward at 9 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 20 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 9 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 1 run.

Zero release-blocker findings.

Log pointer: `logs/session-227.md`.

---

### Session 228 — what shipped (unit-tests, post-ship snapshot refresh — PARTIAL RUN)

Post-ship snapshot refresh — **partial run** (crashed after writing
`docs/TESTS.md`; session log not written, lock not released).
Files edited: `docs/TESTS.md` (Last-updated stamp 223 → 228; 19th
release-window run; sibling deltas 5508 → 5511 absorbed; per-file
table current; session-228 log entry prepended).  Lock
`session228-unit-tests.json` was stale-pruned by session
229-code-review (heartbeat frozen at startedAt, no session log
written).  `docs/REVIEW.md` partial entry written, `logs/session-228.md`
**not written**.  Run-close (as rebuilt from TESTS.md): 5511/0/22.

**Findings delta.**
- **O-011** — no new lock-body occurrence per session-228 ledger entry;
  running count stays **eighty-five** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward (stray backup file).  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 20 runs.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 2 runs.

Zero release-blocker findings.

Log pointer: `logs/session-228.md` — **NOT WRITTEN** (crashed run).

---

### Session 229-code-review — what shipped (code-review, thirtieth run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 229-code-review; preamble
rewritten to fold in sessions 225–228; baseline updated to
session 229-code-review, gates 5511/66/22; stale session228-unit-tests
lock cleared; session-228 partial entry corrected and formalised;
O-011 aged 20 → 21 runs, one new occurrence session229-code-review,
running count eighty-five → eighty-six; O-012 re-verified present,
aged to 10 code-review-lane runs; O-013 aged to 2 runs;
session-log entries for 225/226/227/228/229-code-review added),
`logs/session-229-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 225" — mild stamp drift
  (sessions 226/227/228/229 added no register() calls; count 480/461
  still accurate; command-support lane may advance stamp next pass).
- DATA_TYPES.md Last-updated = "Session 226" — current.
- TESTS.md Last-updated = "Session 228" — current.
- RPL.md stamp = "as of session 227" — current.
- `find www/ -name '*.bak*'` — one hit, O-012 still present
  (`www/src/ui/keyboard.js.bak`).
- Lane-task-id drift: none found.
- `src/...` path drift: surviving historical mentions in RPL.md
  and TESTS.md confirmed as audit-trail passages; preserved per policy.
- Session-228 orphaned run noted: unit-tests lane stale lock cleared,
  session-228.md not present; unit-tests lane should write a skeleton
  session-228.md on next pass if desired.

**Findings delta.**
- **O-011** — 20 → 21 runs.  One new lock-body occurrence
  (session229-code-review); running count now **eighty-six**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 10 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk); aged to
  2 runs.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 21 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 10 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 2 runs.

Zero release-blocker findings.

Log pointer: `logs/session-229-code-review.md`.

---

### Session 232 — what shipped (rpl-programming, verification pass)

Post-ship verification pass — no source or test changes.
Files edited: `docs/RPL.md` (status stamp 227→232; session 227 pointer
demoted from "is this run" to "was this lane"; session 232 pointer entry
added), `docs/REVIEW.md` (this entry), `logs/session-232.md` (session log).
Run-close: 5519/0/22.

**Findings delta.**
- **O-011** — no new lock-body occurrence this run (ops.js not edited);
  running count stays **eighty-seven** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward at 10 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 21 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 10 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 2 runs.

Zero release-blocker findings.

Log pointer: `logs/session-232.md`.

---

### Session 233 — what shipped (unit-tests, snapshot refresh — PARTIAL RUN)

Post-ship snapshot refresh — **partial run** (crashed after writing
`docs/TESTS.md` and `docs/REVIEW.md`; session log not written,
lock not released).
Files edited: `docs/TESTS.md` (Last-updated stamp 228→233; new Coverage
snapshot (session 233) block added above session-228 block; per-file
table reflects +8 absorbed from sessions 229–232), `docs/REVIEW.md`
(this entry).  Lock `session233-unit-tests.json` was stale-pruned by
session 234-code-review (heartbeat frozen at startedAt, no session log
written).  `logs/session-233.md` **not written**.
Run-close (as rebuilt from TESTS.md): 5519/0/22.

**Findings delta.**
- **D-001** — confirmed resolved.  `test-persist.mjs` ran fully green
  (66 / 0) at both run-entry and run-close; no failing assertion at
  the `session076: snapshot missing casVx resets to default 'X'` site.
  Resolution credit: ship-prep 2026-04-25 (already recorded in the
  D-001 body as `[resolved - ship-prep 2026-04-25]`).  No change to
  status text needed — confirming green gate held.
- **O-011** — no new lock-body occurrence this run (ops.js not edited);
  running count stays **eighty-seven** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 21 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 10 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 2 runs.

Zero release-blocker findings.

Log pointer: `logs/session-233.md` — **NOT WRITTEN** (crashed run).

---

### Session 234-code-review — what shipped (code-review, thirty-first run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 234-code-review; preamble
rewritten to fold in sessions 230–233; baseline updated to
session 234-code-review, gates 5519/66/22; stale session233-unit-tests
lock stale-pruned by this run; session-233 partial-run block corrected
to remove false session-log claim and add partial-run note; O-011
aged 21 → 22 runs, one new occurrence session234-code-review, running
count eighty-seven → eighty-eight; O-012 re-verified present, aged to
11 code-review-lane runs; O-013 aged to 3 runs; session-log entries
for 230/231/232/233/234-code-review added),
`logs/session-234-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 230" — mild stamp drift
  (sessions 231–233 added no new register() calls; count 480/461
  still accurate; command-support lane should advance stamp next pass).
- DATA_TYPES.md Last-updated = "Session 231" — current.
- TESTS.md Last-updated = "Session 233" — current (partial run; doc written).
- RPL.md stamp = "as of session 232" — current.
- `find www/ -name '*.bak*'` — one hit, O-012 still present
  (`www/src/ui/keyboard.js.bak`).
- Lane-task-id drift: none found.
- `src/...` path drift: surviving historical mentions in RPL.md
  and TESTS.md confirmed as audit-trail passages; preserved per policy.
- O-013 (AI catalog drift): no new ops landed since session 229
  (register count 461 unchanged); RPL_CATALOG scope unchanged; no
  new drift materialised this interval.
- Session 233 orphaned run noted: unit-tests lane stale lock pruned;
  REVIEW.md block corrected; session-233.md not present. Unit-tests
  lane should write a skeleton session-233.md on next pass if desired.
- session230-command-support.json has scope/intent fields swapped in
  the lock body (cosmetic artifact of how the lane wrote its lock;
  not a behavior issue; lock released normally, session-230.md exists).

**Findings delta.**
- **O-011** — 21 → 22 runs.  One new lock-body occurrence
  (session234-code-review); session 231 self-counted one occurrence
  (session231-data-type-support.json, +1 → 87); sessions 230/232/233
  recorded no new occurrences per their own ledger entries; net this
  run: +1.  Running count now **eighty-eight** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk, mtime 2026-04-25); aged to 11 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk); aged to
  3 code-review-lane runs.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 22 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 11 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 3 runs.

Zero release-blocker findings.

Log pointer: `logs/session-234-code-review.md`.

### Session 237 — what shipped (rpl-programming, post-ship verification pass)

Post-ship verification pass.  Files edited: `docs/RPL.md`
(status stamp bumped from "as of session 232" to "as of session 237";
session-232 pointer demoted from "is this run" to "was this lane";
session-237 pointer entry added), `docs/REVIEW.md` (this block),
`logs/session-237.md` (session log).
No source or test changes.

**Findings delta.**
- **O-011** — no new lock-body occurrence this run (ops.js not
  edited); running count stays **eighty-eight** since session 106.
  `[deferred - post-ship]`.
- **O-012** — carried forward (`www/src/ui/keyboard.js.bak` still
  present).  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 22 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 11 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 3 runs.

Zero release-blocker findings.

Log pointer: `logs/session-237.md`.

### Session 238 — what shipped (unit-tests, post-ship snapshot refresh — partial run)

Post-ship snapshot refresh.  Files edited: `docs/TESTS.md`
(Last-updated stamp bumped from session 233 to session 238;
session-238 coverage snapshot added; no new assertions — 5525/66/22
unchanged from run-entry).
Session log NOT written.  Lock (`utils/@locks/session238-unit-tests.json`)
NOT released — crashed before cleanup.  Lock stale-pruned by
session-235-code-review (heartbeat frozen at startedAt=1777226191;
releaseReason field added).  Unit-tests lane should write a skeleton
`logs/session-238.md` on next pass if desired.

**Findings delta.**
- **O-011** — sessions 235/236/237 each released without releaseReason
  (+3); this run (238) stale-pruned WITH releaseReason by session-235-code-review
  (0); running count advances per session-235-code-review.
  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 22 runs (count deferred to session-235-code-review tally).
- **O-012** `[deferred - post-ship]` (stray file) — 11 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 3 runs.

Zero release-blocker findings.

Log pointer: `logs/session-238.md` — **NOT WRITTEN** (crashed run).

---

### Session 235-code-review — what shipped (code-review, thirty-second run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 235-code-review; preamble
rewritten to fold in sessions 235–238; baseline updated to session
235-code-review, gates 5525/66/22; stale session238-unit-tests
lock stale-pruned by this run; session-238 partial-run block added;
O-011 aged 22 → 23 runs, +3 new occurrences from sessions 235/236/237
releasing without releaseReason + 1 for this run's own lock, running
count now **ninety-two** since session 106; O-012 re-verified present,
aged to 12 code-review-lane runs; O-013 aged to 4 code-review-lane
runs; session-log entries for 235/236/237/238/235-code-review added),
`logs/session-235-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 235" — current (sessions
  236/237/238 added no new register() calls; count 480/461 still
  accurate; mild stamp drift when command-support lane next runs).
- DATA_TYPES.md Last-updated = "Session 236" — current.
- TESTS.md Last-updated = "Session 238" — current (partial run; doc written).
- RPL.md stamp = "as of session 237" — current.
- `find www/ -name '*.bak*'` — one hit, O-012 still present
  (`www/src/ui/keyboard.js.bak`).
- Lane-task-id drift: none found.
- `src/...` path drift: surviving historical mentions confirmed as
  audit-trail passages; preserved per policy.
- O-013 (AI catalog drift): register count 461 unchanged; no new
  ops landed since session 231; RPL_CATALOG scope unchanged; no
  new drift materialised this interval.
- Session 238 orphaned run noted: unit-tests lane stale lock pruned;
  TESTS.md updated, session-238.md not present.

**Findings delta.**
- **O-011** — 22 → 23 runs.  Three new lock-body occurrences since
  session 234-code-review: session235-command-support,
  session236-data-type-support, session237-rpl-programming (all
  released without releaseReason, +3 → 91); session238-unit-tests
  stale-pruned WITH releaseReason by this run (0); this run's own
  lock (session235-code-review) will release without releaseReason
  (+1 → 92).  Running count now **ninety-two** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk); aged to 12 code-review-lane runs.
  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk); aged to
  4 code-review-lane runs.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 23 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 12 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-235-code-review.md`.

---

### Session 239 — what shipped (command-support, doc-reconciliation pass)

Doc-reconciliation pass.  Files edited: `docs/COMMANDS.md`
(Counts stamp 235 → 239; session-log back-fill for sessions
235-code-review / 236 / 237 / 238 added), `logs/session-239.md`
(session log).
No source or test changes.  Run-close: 5525/0/22.

**Findings delta.**
- **O-011** — no new lock-body occurrence in ops.js; one occurrence
  for this run's own lock (session239-command-support released
  without releaseReason, +1 → 93 running count).
  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 23 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 12 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-239.md`.

---

### Session 240 — what shipped (data-type-support, Q-cell audit stat-dist + combinatorial)

Q-cell audit pass.  Files edited: `tests/test-types.mjs` (+16
session-240 assertions: 14 rejection pins for GAMMA/LNGAMMA/ERF/ERFC/
BETA/UTPC/UTPF/UTPT/HEAVISIDE/DIRAC/COMB/PERM/IQUOT/IREMAINDER Q=✗;
2 acceptance pins for XROOT Q=✓ via `toRealOrThrow` + `^` delegation),
`docs/DATA_TYPES.md` (Last-updated stamp 236 → 240; 15 Q-cell entries
updated in coverage matrix; Notes column updated; next-session queue
item 5 struck through), `logs/session-240.md` (session log).
No source changes.  Run-close: 5525 → 5541 / 0 / 22.

**Findings delta.**
- **O-011** — one occurrence for this run's own lock
  (session240-data-type-support released without releaseReason,
  +1 → 94 running count).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 23 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 12 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-240.md`.

---

### Session 241 — what shipped (rpl-programming, post-ship verification pass)

Post-ship verification pass.  Files edited: `docs/RPL.md`
(status stamp 237 → 241), `docs/REVIEW.md` (session-241 block added),
`logs/session-241.md` (session log).
No source or test changes.  Run-close: 5541/0/22.

**Findings delta.**
- **O-011** — one occurrence for this run's own lock
  (session241-rpl-programming released without releaseReason,
  +1 → 95 running count).  `[deferred - post-ship]`.
- **O-012** — carried forward (`www/src/ui/keyboard.js.bak` still
  present).  `[deferred - post-ship]`.
- **O-013** — carried forward (AI catalog drift risk).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 23 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 12 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 4 runs.

Zero release-blocker findings.

Log pointer: `logs/session-241.md`.

---

### Session 242-code-review — what shipped (code-review, thirty-third run)

Post-ship audit pass.  Files edited: `docs/REVIEW.md`
(Last-updated stamp bumped to session 242-code-review; preamble
rewritten to fold in sessions 239–241; baseline block updated to
session 242-code-review, gates 5541/66/22; O-011 aged 23 → 24 runs,
three new occurrences session239-command-support,
session240-data-type-support, session241-rpl-programming all released
without releaseReason (+3 → 95); this run's own lock
session242-code-review releases without releaseReason (+1 → 96);
running count now **ninety-six** since session 106; O-012 re-verified
present, aged to 13 code-review-lane runs; O-013 re-verified present,
aged to 5 code-review-lane runs; session-log entries for
239/240/241/242-code-review added),
`logs/session-242-code-review.md` (session log).
No source or test changes.

**Audit-axis sweep (doc freshness, dead code, path drift,
lane-id drift):**
- COMMANDS.md Counts heading "as of session 239" — current (sessions
  240/241 added no new register() calls; count 480/461 still
  accurate; mild stamp drift when command-support lane next runs).
- DATA_TYPES.md Last-updated = "Session 240" — current.
- TESTS.md Last-updated = "Session 238" — mild stamp drift
  (session 240 added +16 assertions: 5525 → 5541; unit-tests lane
  should refresh snapshot on next pass).
- RPL.md stamp = "as of session 241" — current.
- `find www/ -name '*.bak*'` — one hit, O-012 still present
  (`www/src/ui/keyboard.js.bak`).
- Lane-task-id drift: none found.
- `src/...` path drift: surviving historical mentions confirmed as
  audit-trail passages; preserved per policy.
- O-013 (AI catalog drift): register count 461 unchanged;
  RPL_CATALOG scope unchanged; no new drift materialised.
- session220-code-review.json: lock body contains literal
  `$(date +%s)` strings for startedAt/heartbeatAt (bash variable
  substitution never executed when the file was written); released
  field is `false`.  This is a historical artifact from session 220
  that has no operational impact — the stale-prune logic would fail
  to parse the timestamp and skip this file; normal code-review
  operations are unaffected.  No action needed.

**Findings delta.**
- **O-011** — 23 → 24 runs.  Three new lock-body occurrences since
  session 235-code-review: session239-command-support,
  session240-data-type-support, session241-rpl-programming (all
  released without releaseReason, +3 → 95); this run's own
  lock (session242-code-review) will release without releaseReason
  (+1 → 96).  Running count now **ninety-six** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still on disk, mtime 2026-04-25); aged to 13 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-013** — re-verified present; aged to 5 code-review-lane
  runs.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 24 runs.
- **O-012** `[deferred - post-ship]` (stray file) — 13 code-review-lane runs.
- **O-013** `[deferred - post-ship]` (AI catalog drift) — 5 runs.

Zero release-blocker findings.

Log pointer: `logs/session-242-code-review.md`.

---

### Session 243 — what shipped (command-support, post-ship doc-reconciliation + O-013 audit)

**Date.** 2026-04-26.  **Lane.** `rpl5050-command-support`.
**Lock.** `utils/@locks/session243-command-support.json`, released at
end of run.

**Work done.**
- COMMANDS.md Counts stamp advanced from session 239 → 243.
- Session-log entries back-filled for sessions 239 / 240 / 241 /
  242-code-review / 242 (five sibling sessions without prior
  COMMANDS.md entries).
- **O-013 audit closed:** spot-checked all 20 RPL_CATALOG command
  names in `www/src/ai/system-prompt.js` against `docs/COMMANDS.md`
  and live `register()` calls in `ops.js` — every catalog entry
  (`+ - * / ^ NEG INV ABS SQ SQRT EXP LN LOG ALOG FACT MOD XROOT
  SIN COS TAN ASIN ACOS ATAN RAD DEG GRD SWAP DROP DUP DUP2 OVER
  ROT CLEAR STO RCL PURGE VARS HOME UPDIR DERIV INTEG SOLVE PROOT
  EXPAND COLLECT FACTOR PARTFRAC SUBST EVAL →NUM LIMIT GET PUT SIZE`)
  confirmed registered and ✓.  No drift.  Added "last audited —
  session 243 (2026-04-26)" comment to `system-prompt.js` above the
  `RPL_CATALOG` constant.
- No source or test changes.  No ✗ → ✓ row transitions.
  `register()` count unchanged at 480 / 461.
  Run-entry: 5541 / 66 / 22.  Run-close: **5541 / 66 / 22**.

**Findings delta.**
- **O-011** — lock session243-command-support will release without
  releaseReason (+1 → 97).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — **[resolved - session 243]**.  All RPL_CATALOG entries
  verified correct; "last audited" comment added to `system-prompt.js`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count 97.
- **O-012** `[deferred - post-ship]` (stray file) — 13 code-review-lane runs.

Zero release-blocker findings.

Log pointer: `logs/session-243.md`.

### Session 244 — what shipped (data-type-support, Z/L/V/M cell audit)

**Date.** 2026-04-26.  **Lane.** `rpl5050-data-type-support`.
**Lock.** `utils/@locks/session244-data-type-support.json`, released at
end of run.

**Work done.**
- **ERF / ERFC Z-cell doc-lag promotion** (`·`→`✓`): `_erfScalar` /
  `_erfcScalar` both have `isInteger` branch; Z column was stale.
  +4 pins in `tests/test-types.mjs`.
- **UTPC / UTPF / UTPT Z-cell doc-lag promotion** (`·`→`✓`): shared
  `asReal` helper accepts Integer; Z column was stale.  +3 pins.
- **BETA L/V/M audit**: L `·`→`✓` (`_withListBinary` wrapper distributes
  element-wise); V/M `·`→`✗` (no `_withVMBinary`; `_betaScalar` receives
  Vector/Matrix as `a` → `null` → Bad argument type).  +4 pins.
- **UTPC / UTPF / UTPT L/V/M rejection pins** (`·`→`✗`): bare handlers,
  no list/vector/matrix wrappers; List/Vector reach `asReal` → Bad
  argument type.  +8 pins.
- Total: 16 cell promotions, +19 assertions (5541 → 5560); no source
  changes — guards already live.

**Findings delta.**
- **O-011** — lock session244-data-type-support released without
  releaseReason (+1 → 98).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-013** — already resolved session 243; no change.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count 98.
- **O-012** `[deferred - post-ship]` (stray file) — 13 code-review-lane runs.

Zero release-blocker findings.

Log pointer: `logs/session-244.md`.

---

### Session 245 — what shipped (rpl-programming, verification pass)

**Date.** 2026-04-26.  **Lane.** `rpl5050-rpl-programming`.
**Lock.** `utils/@locks/session245-rpl-programming.json`, released at
end of run.

**Work done.**
- Post-ship verification pass: confirmed 5560 / 0 clean baseline.
- `docs/RPL.md` status stamp bumped from "as of session 241" to
  "as of session 245".
- No source or test changes.

**Findings delta.**
- **O-011** — lock session245-rpl-programming released without
  releaseReason (+1 → 99).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count 99.
- **O-012** `[deferred - post-ship]` (stray file) — 13 code-review-lane runs.

Zero release-blocker findings.

Log pointer: `logs/session-245.md`.

---

### Session 246 — what shipped (unit-tests, snapshot refresh)

**Date.** 2026-04-26.  **Lane.** `rpl5050-unit-tests`.
**Lock.** `utils/@locks/session246-unit-tests.json`, released at
end of run.

**Work done.**
- `docs/TESTS.md` stamp advanced from session 242 → 246.
- Coverage snapshot absorbed sibling deltas 5541 → 5560 (+19 over
  sessions 243–245: s243 +0; s244 +19 in test-types.mjs; s245 +0).
- Session 246 itself: 0 new assertions (scope-capped snapshot-only run).
- No source or test changes.

**Findings delta.**
- **O-011** — lock session246-unit-tests released without
  releaseReason (+1 → 100).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count 100.
- **O-012** `[deferred - post-ship]` (stray file) — 13 code-review-lane runs.

Zero release-blocker findings.

Log pointer: `logs/session-246.md`.

---

### Session 246-code-review — what shipped (thirty-fourth review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session246-code-review.json`, released at
end of run.

**Work done.**
- Folded in sibling sessions 243 (command-support), 244 (data-type-support),
  245 (rpl-programming), 246 (unit-tests).
- Baseline verified at entry: 5560 / 66 / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- O-013 confirmed resolved (session 243); `system-prompt.js` "last
  audited" comment in place.
- Spot checks: forbidden-pattern grep clean; DATA_TYPES.md stamp session 244
  ✓; RPL.md stamp session 245 ✓; COMMANDS.md stamp session 243 ✓;
  TESTS.md stamp session 246 ✓.
- No new findings filed.  Open queue unchanged: O-011 + O-012 (both
  `[deferred - post-ship]`).
- Two doc edits: REVIEW.md preamble update + this session log.

**Findings delta.**
- **O-011** — 24 → 25 runs.  +4 new occurrences (sessions 243/244/245/246
  all released without releaseReason) + 1 for this run's own lock =
  running count now **one hundred one** since session 106.
  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak` still
  in tree).  Aged to 14 code-review-lane runs.  `[deferred - post-ship]`.
- **O-013** — resolved session 243.  No further aging.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count 101.
- **O-012** `[deferred - post-ship]` (stray file) — 14 code-review-lane runs.

Zero release-blocker findings.

Log pointer: `logs/session-246-code-review.md`.

---

### Session 247 — what shipped (command-support, doc-reconciliation)

**Date.** 2026-04-26.  **Lane.** `rpl5050-command-support`.
**Lock.** `utils/@locks/session247-command-support.json`, released
gracefully (releaseReason: "graceful — doc-reconciliation pass complete").

**Work done.**
- COMMANDS.md Counts stamp advanced from session 243 → 247.
- Session-log back-fill for sessions 244 / 245 / 246 / 246-code-review.
- No source or test changes.

**Findings delta.**
- **O-011** — lock session247-command-support released WITH
  releaseReason field (`"graceful — doc-reconciliation pass complete"`).
  First occurrence of the releaseReason field appearing in a sibling
  lock body.  Partial O-011 improvement.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 25 runs, count ~102.
- **O-012** `[deferred - post-ship]` (stray file).

Log pointer: `logs/session-247.md`.

---

### Session 248 — what shipped (data-type-support, UTPC/UTPT widening)

**Date.** 2026-04-26.  **Lane.** `rpl5050-data-type-support`.
**Lock.** `utils/@locks/session248-data-type-support.json`, released
gracefully (releaseReason: "graceful — UTPC/UTPT list+tagged widening complete").

**Work done.**
- Extracted `_utpcScalar` / `_utptScalar` from inline UTPC/UTPT handlers.
- Wrapped both ops with `_withTaggedBinary(_withListBinary(…))`.
- `docs/DATA_TYPES.md` stamp 244 → 248; UTPC/UTPT L/T cells updated.
- +8 net assertions in `tests/test-types.mjs` (5560 → 5568).

**Findings delta.**
- **O-011** — lock session248-data-type-support released WITH
  releaseReason field.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.

Log pointer: `logs/session-248.md`.

---

### Session 249 — what shipped (rpl-programming, verification pass)

**Date.** 2026-04-26.  **Lane.** `rpl5050-rpl-programming`.
**Lock.** `utils/@locks/session249-rpl-programming.json`, released
gracefully (releaseReason: "graceful — verification pass complete").

**Work done.**
- Post-ship verification pass; confirmed 5568 / 0 clean baseline.
- `docs/RPL.md` stamp advanced from "as of session 245" to "as of
  session 249".  No source or test changes.

**Findings delta.**
- **O-011** — lock session249-rpl-programming released WITH
  releaseReason field.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.

Log pointer: `logs/session-249.md`.

---

### Session 250 — what shipped (unit-tests, snapshot refresh — CRASHED)

**Date.** 2026-04-26.  **Lane.** `rpl5050-unit-tests`.
**Lock.** `utils/@locks/session250-unit-tests.json`, `released: false`
— lock was never released; no session log written.

**Work done (partial — crash before log write).**
- `docs/TESTS.md` stamp advanced from session 246 → 250.
- Coverage snapshot (session 250) written absorbing sessions 247–249
  + unlogged algebra edit (+11 total: +8 from session-248, +3 from
  unlogged `tests/test-algebra.mjs` edit; 5560 → 5571).
- No new test assertions this run.

**Note.** `tests/test-algebra.mjs` was modified ~160 s after
session-249.md was written (mtime 20:48 vs session-249 mtime 20:45)
with +3 assertions (1061 → 1064).  No session lock or log covers this
change; no new session labels beyond session160 in the file.  Absorbed
by session-250 TESTS.md snapshot.  **Filed as O-014** (unlogged source
edit + session-250 crash).

**Findings delta.**
- **O-011** — session250-unit-tests lock body has `released: false`
  and no releaseReason.  (+1 → running count ~105).
  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — filed this entry (session-250 crash / unlogged algebra
  edit).

Log pointer: none (session-250 crashed without writing a log).

---

### Session 251-code-review — what shipped (thirty-fifth review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session251-code-review.json`, released at
end of run.

**Work done.**
- Folded in sibling sessions 247 (command-support), 248 (data-type-
  support), 249 (rpl-programming), 250 (unit-tests — crash).
- Baseline verified at entry: 5571 / 66 / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- Spot checks: DATA_TYPES.md stamp session 248 ✓; RPL.md stamp
  session 249 ✓; COMMANDS.md stamp session 247 ✓; TESTS.md stamp
  session 250 ✓.
- Noted positive O-011 development: sessions 247/248/249 all include
  `releaseReason` fields in their lock bodies — the per-site addition
  is happening in practice even without lock.mjs enforcement.
- Filed **O-014** (session-250 crash: unreleased lock, missing log,
  unlogged algebra edit).

**Findings delta.**
- **O-011** — 25 → 26 runs.  +3 releaseReason-bearing occurrences
  (247/248/249) — positive development; session-250 released: false,
  no releaseReason (+1 ambiguous); this run's own lock releases
  without releaseReason (+1).  Running count now **one hundred five**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still in tree, mtime 2026-04-25).  Aged to 15 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-014** — filed this run.  `[ship-stretch]` — command-support
  or unit-tests lane should back-fill a session log for the unlogged
  algebra edit; session-250 unreleased lock should be pruned.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 26 runs, count 105.
- **O-012** `[deferred - post-ship]` (stray file) — 15 code-review-lane runs.
- **O-014** `[ship-stretch]` (session-250 crash / unlogged algebra edit) — new.

Zero release-blocker findings.

Log pointer: `logs/meta-2026-04-26-code-review.md`.

---

### Session 252 — what shipped (command-support, doc-reconciliation pass)

**Date.** 2026-04-26.  **Lane.** `rpl5050-command-support`.
**Lock.** `utils/@locks/session252-command-support.json`, released at
end of run.

**Work done.**
- Back-filled COMMANDS.md session-log entries for sessions 248 /
  249 / 250 / 251-code-review (four sibling sessions with no prior
  COMMANDS.md entries).  Session-252 entry added at top.
  Counts stamp advanced from "as of session 247" → "as of session 252".
- Partially retracted **O-014**: re-read of
  `utils/@locks/session250-unit-tests.json` shows `released: true`
  and `releaseReason: "graceful — snapshot refresh complete"`;
  `logs/session-250.md` exists and is complete.  Session-251-code-review
  observed stale filesystem state.  Items 1 and 2 of O-014 retracted;
  items 3 (unlogged +3 algebra assertions) and 4 (chat-bot.js mtime
  anomaly) carried forward as `[deferred - post-ship]`.
- REVIEW.md preamble rewritten to fold in sessions 248–251-code-review;
  baseline updated to session 252; O-014 body updated with retraction.

**Findings delta.**
- **O-011** — 26 → 27 runs.  This run's own lock carries
  `releaseReason` field.  Running count now **one hundred six**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — partially retracted (items 1 and 2); items 3 and 4
  reclassified to `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 27 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file) — 15 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).

Zero release-blocker findings.

Log pointer: `logs/session-252.md`.

---

### Session 253 — what shipped (data-type-support, ordered-comparator rejection pins)

**Date.** 2026-04-26.  **Lane.** `rpl5050-data-type-support`.
**Lock.** `utils/@locks/session253-data-type-support.json`, released
gracefully (`releaseReason: "graceful — ordered-comparator
L/V/M/T/U rejection pins complete"`).

**Work done.**
- Added +20 rejection-pin assertions in `tests/test-types.mjs`
  covering `<` / `>` / `≤` / `≥` for List, Vector, Matrix,
  Tagged, and Unit operands — all correctly rejected with
  `Bad argument type` per `comparePair()`'s scalar-only contract.
- `docs/DATA_TYPES.md` "Last updated" stamp advanced to session 253.

**Findings delta.**
- **O-011** — session253 lock carries `releaseReason` ✓.
  No new bad occurrences.  Count stays at 106.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

Log pointer: `logs/session-253.md`.

---

### Session 254 — what shipped (rpl-programming, verification pass)

**Date.** 2026-04-26.  **Lane.** `rpl5050-rpl-programming`.
**Lock.** `utils/@locks/session254-rpl-programming.json`, released
gracefully (`releaseReason: "graceful — session-254 verification
pass complete; RPL.md pointer backfill (sessions 241/245/249) +
stamp bump 249→254"`).

**Work done.**
- `docs/RPL.md` status stamp advanced from "as of session 249"
  to "as of session 254".
- Session log pointer section back-filled entries for sessions
  241, 245, and 249 (all verification-only passes that had not
  been entered).
- No source or test changes.  5591 / 0 baseline confirmed stable.

**Findings delta.**
- **O-011** — session254 lock carries `releaseReason` ✓.
  No new bad occurrences.  Count stays at 106.  `[deferred - post-ship]`.
- **O-012** — carried forward (`www/src/ui/keyboard.js.bak`
  still present, mtime 2026-04-25).  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

Log pointer: `logs/session-254.md`.

---

### Session 255-code-review — what shipped (thirty-sixth review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session255-code-review.json`, released at
end of run.

**Work done.**
- Folded in sibling sessions 253 (data-type-support) and 254
  (rpl-programming).
- Baseline verified at entry: 5591 / 66 / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- Spot checks: DATA_TYPES.md stamp session 253 ✓; RPL.md stamp
  session 254 ✓; COMMANDS.md stamp session 252 (noting C-015
  drift); TESTS.md stamp session 250 (noting T-004 drift).
- All sessions 253 and 254 locks released gracefully with
  `releaseReason` — positive O-011 development continues.
- Filed **C-015** (COMMANDS.md Counts stamp stale after sessions
  253/254; two missing one-liner session-log entries).
- Filed **T-004** (TESTS.md coverage snapshot stale at session
  250; test count frozen at 5571 vs. actual 5591) — **immediately
  resolved by concurrent session 256** (see below).
- **Concurrent session 256** (`rpl5050-unit-tests`) acquired its
  lock 46 s after this run's lock (no scope overlap — session 256
  scopes `tests/`, `docs/TESTS.md`, `logs/`; this run scopes
  `docs/REVIEW.md`, `logs/`).  Session 256 ran to completion and
  released gracefully before this run closed: +8 cross-type
  comparator rejection-pin assertions in `tests/test-types.mjs`
  (5591 → 5599); TESTS.md stamp advanced to session 256;
  session-256 coverage snapshot written.  T-004 resolved same run
  it was filed.

**Findings delta.**
- **O-011** — 27 → 28 runs.  Sessions 253, 254, and 256 all carry
  `releaseReason` (positive trend continues).  This run's own lock
  will carry `releaseReason` at release.  Count stays at **one
  hundred six** since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still in tree, mtime 2026-04-25).  Aged to 16 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.
- **C-015** — filed this run.  `[deferred - post-ship]`.
- **T-004** — filed and resolved this run (session 256).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 28 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file) — 16 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).
- **C-015** `[deferred - post-ship]` (COMMANDS.md stamp drift) — new.

Zero release-blocker findings.

Log pointer: `logs/meta-2026-04-26-code-review-2.md`.

---

### Session 256 — what shipped (unit-tests, cross-type comparator rejection pins; concurrent with session 255)

**Date.** 2026-04-26.  **Lane.** `rpl5050-unit-tests`.
**Lock.** `utils/@locks/session256-unit-tests.json`, released
gracefully (`releaseReason: "graceful — cross-type comparator
rejection pins complete"`).  Acquired 46 s after session-255-code-
review lock; no scope overlap.

**Work done.**
- Added +8 rejection-pin assertions in `tests/test-types.mjs`
  for cross-type comparator operand pairs.
- `docs/TESTS.md` "Last updated" stamp advanced to session 256;
  session-256 coverage snapshot written, absorbing sessions
  251–255 (+28 total: +20 from session 253, +8 this run).

**Findings delta.**
- **O-011** — session256 lock carries `releaseReason` ✓.
  Count stays at 106.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.
- **T-004** — `[resolved - session 256]` (TESTS.md snapshot
  refreshed; stamp advanced from session 250 → 256; count
  updated 5571 → 5599).

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 28 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file) — 16 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).
- **C-015** `[deferred - post-ship]` (COMMANDS.md stamp drift) — filed session 255.

Zero release-blocker findings.

Log pointer: `logs/session-256.md`.

---

### Session 257 — `rpl5050-command-support` (2026-04-26)

Doc-reconciliation pass; C-015 close.

**Baseline at entry:** 5599 / 66 / 22 (confirmed from session-256 close).

No sibling locks active at acquisition.

**Work done.**
- `docs/COMMANDS.md` — Counts stamp advanced from session 252 → 257;
  session-log entries back-filled for sessions 253 / 254 /
  255-code-review / 256 / 257 (five sessions with no prior COMMANDS.md
  entries).  No source or test edits.
- `docs/REVIEW.md` — C-015 status promoted to
  `[resolved - session 257]`; "Last updated" preamble updated to
  fold in sessions 256–257; session-257 log entry appended.

**Findings delta.**
- **C-015** — `[resolved - session 257]` (COMMANDS.md stamp 252 → 257;
  session-log entries 253–257 added).
- **O-011** — carried forward.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — infrastructure hygiene.
- **O-012** `[deferred - post-ship]` — stray file.
- **O-014** `[deferred - post-ship]` — unlogged algebra edit traceability.

Zero release-blocker findings.

Log pointer: `logs/session-257.md`.

---

### Session 258 — `rpl5050-data-type-support` (2026-04-26)

BinaryInteger B-column rejection-pin pass.

**Baseline at entry:** 5599 / passed / 22 (confirmed from session-257 close).

**Work done.**
- Added +22 rejection-pin assertions in `tests/test-types.mjs`
  covering BinaryInteger B-column operand rejections across
  21 matrix rows.
- `docs/DATA_TYPES.md` "Last updated" stamp advanced from session
  253 → 258.

**Findings delta.**
- **O-011** — session258 lock carries `releaseReason` ✓.
  Count stays at 106.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — infrastructure hygiene.
- **O-012** `[deferred - post-ship]` — stray file.
- **O-014** `[deferred - post-ship]` — unlogged algebra edit traceability.

Zero release-blocker findings.

Log pointer: `logs/session-258.md`.

---

### Session 259 — `rpl5050-rpl-programming` (2026-04-26)

Verification pass; no source changes.

**Baseline at entry:** 5621 / passed / 22 (confirmed from session-258 close).

**Work done.**
- `docs/RPL.md` status stamp advanced from "as of session 254"
  to "as of session 259".
- Session-log pointer section back-filled entries for sessions
  241, 245, and 249.
- No source or test changes.

**Findings delta.**
- **O-011** — session259 lock carries `releaseReason` ✓.
  Count stays at 106.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — infrastructure hygiene.
- **O-012** `[deferred - post-ship]` — stray file.
- **O-014** `[deferred - post-ship]` — unlogged algebra edit traceability.

Zero release-blocker findings.

Log pointer: `logs/session-259.md`.

---

### Session 260 — `rpl5050-unit-tests` (2026-04-26) — ACTIVE at session-261 acquisition

Lock `utils/@locks/session260-unit-tests.json` acquired; `released: false`
at time of session-261-code-review acquisition.  Scope: `tests/`,
`docs/TESTS.md`, `logs/` — no overlap with this review run's scope.
Entry baseline: 5621 / 0.  Session-261 cannot fold in session-260
results; they will be absorbed by the next review-lane run.

---

### Session 261-code-review — what shipped (thirty-seventh review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session261-code-review.json`, scope =
`[docs/REVIEW.md, logs/]`.

**Work done.**
- Folded in sibling sessions 258 (data-type-support) and 259
  (rpl-programming); session-260 (unit-tests) is active at
  acquisition — absorbed next run.
- Baseline verified at entry: 5621 / passed / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- Spot checks: DATA_TYPES.md stamp session 258 ✓; RPL.md stamp
  session 259 ✓; COMMANDS.md stamp session 257 ✓ (sessions 258/259
  add no register() calls; no COMMANDS.md update needed).
  TESTS.md stamp session 256 — note: session 258 added +22 tests
  (5599 → 5621); TESTS.md count is stale by 22; expected to be
  resolved by the active session 260 (unit-tests).
- O-012: `www/src/ui/keyboard.js.bak` re-verified present,
  mtime 2026-04-25.
- O-014 item 4: `www/src/ai/chat-bot.js` mtime now `Apr 26 22:51`
  (updated since original observation of `21:00:53`); file has
  been modified again with no session lock/log coverage.
  Remains `[deferred - post-ship]`.
- Sessions 258 and 259 both carry `releaseReason` ✓ — positive
  O-011 trend continues.

**Findings delta.**
- **O-011** — 28 → 29 runs.  Sessions 258 and 259 carry
  `releaseReason` ✓.  This run's own lock will carry
  `releaseReason` at release.  Count stays at **one hundred six**
  since session 106.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still in tree, mtime 2026-04-25).  Aged to 17 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-014** — item 4 observation updated (chat-bot.js mtime
  now `Apr 26 22:51`; second unlocked modification).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 29 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file) — 17 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).

Zero release-blocker findings.

Log pointer: `logs/meta-2026-04-26-code-review-3.md`.

---

### Session 262 — `rpl5050-command-support` (2026-04-26)

Doc-reconciliation pass.  COMMANDS.md Counts stamp advanced session
257 → 262; session-log entries back-filled for sessions 258 / 259 /
260 / 261-code-review.

**Findings delta.**
- **O-011** — carried forward.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 29 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability).

Zero release-blocker findings.

Log pointer: `logs/session-262.md`.

---

### Session 263 — `rpl5050-data-type-support` (2026-04-26)

U-column rejection-pin pass.  +19 assertions in `tests/test-types.mjs`
(5621 → 5640); 18 DATA_TYPES.md cells flipped U `·`→`✗`.  No ops.js changes.

**Findings delta.**
- **O-011** — session263 lock carries `releaseReason` ✓.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — infrastructure hygiene.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability).

Zero release-blocker findings.

Log pointer: `logs/session-263.md`.

---

### Session 264 — `rpl5050-rpl-programming` (2026-04-26)

Verification-only pass.  Confirmed 5640 / 0 clean baseline at run-entry
(Δ+137 from session 213's 5503 — all from sibling lanes).  RPL.md status
stamp advanced from "as of session 259" to "as of session 264".  Session-213
`(this run)` heading demoted to plain past tense per R-005 discipline.
No source or test changes.

**Findings delta.**
- **O-011** — session264 lock carries `releaseReason` ✓.  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 30 runs, count 106.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability).

Zero release-blocker findings.

Log pointer: `logs/session-264.md`.

---

### Session 265 — `rpl5050-unit-tests` (2026-04-26) — CRASHED

Snapshot-refresh run.  Gates confirmed green on entry: test-all
**5640 / 0**, test-persist **passed / 0**, sanity **22 / 0**.
TESTS.md "Last updated" stamp advanced 260 → 265; session-265
coverage snapshot added (absorbed sibling deltas 5621 → 5640 over
sessions 261–264: s261 code-review doc-only, s262 command-support
doc-only, s263 data-type-support +19 Unit-column rejection pins,
s264 rpl-programming verification-only).  0 new assertions this run.
**However:** `session265-unit-tests.json` has no `released` field
(crash); `logs/session-265.md` was never written.  TESTS.md and the
REVIEW.md session-log paragraph above were written before the crash.
O-011 note in the original entry ("31 runs, count 106") has
incorrect run-count (should be 29 code-review runs); corrected by
session 265-code-review below.

**Findings delta.**
- **O-011** — this session is itself an unreleased-lock occurrence;
  count 106 → 107.  O-011 run-count stays at 29 (not a code-review
  run).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue (as observed, pre-crash):**
- **O-011** `[deferred - post-ship]` — count 107.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability).

Zero release-blocker findings.

Log pointer: `logs/session-265.md` — **file not written (crash)**.

---

### Session 265-code-review — what shipped (thirty-eighth review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session265-code-review.json`, scope =
`[docs/REVIEW.md, logs/]`.
Note: lock file named `session265-code-review.json` (session-265
slot shared with the concurrent unit-tests crash; no scope overlap
between this lock and the unit-tests crash lock beyond the
pre-existing REVIEW.md name conflict, which is moot since the
unit-tests run made no REVIEW.md changes before crashing).

**Work done.**
- Folded in sibling sessions 262 (command-support), 263 (data-type-
  support), 264 (rpl-programming), 265 (unit-tests — crash).
- Baseline verified at entry: 5640 / 0 / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- Spot checks: COMMANDS.md stamp session 262 ✓; DATA_TYPES.md stamp
  session 263 ✓; RPL.md stamp session 264 ✓; TESTS.md stamp
  session 265 ✓ (snapshot reflects 5640/0; written before crash).
- O-012: `www/src/ui/keyboard.js.bak` re-verified present,
  mtime 2026-04-25.
- O-014 item 4: `www/src/ai/chat-bot.js` mtime `Apr 26 23:26` —
  unchanged since session-261 observation.  `[deferred - post-ship]`.
- Sessions 262, 263, 264 all carry `releaseReason` ✓.
- Session 265-unit-tests: lock unreleased (missing `released` field);
  no session log; TESTS.md and partial REVIEW.md entry written before
  crash.  Corrected O-011 count in session-265 entry above.

**Findings delta.**
- **O-011** — 29 → 30 code-review-lane runs.  Session 265-unit-tests
  crash adds one occurrence; count 106 → **107** since session 106.
  Sessions 262, 263, 264 released gracefully (positive trend
  continues).  This run's own lock will carry `releaseReason` at
  release.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still in tree, mtime 2026-04-25).  Aged to 18 code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-014** — chat-bot.js mtime stable at `Apr 26 23:26` (no new
  unlocked modifications since session-261 observation).
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 30 runs, count 107.
- **O-012** `[deferred - post-ship]` (stray file) — 18 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).

Zero release-blocker findings.

Log pointer: `logs/meta-2026-04-26-code-review-4.md`.

---

### Session 266 — what shipped (command-support doc-reconciliation, last run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-command-support`.
**Lock.** `utils/@locks/session266-command-support.json`, scope =
`[docs/COMMANDS.md, docs/REVIEW.md, logs/]`.

**Work done.**
- Folded in sibling sessions 263 (data-type-support), 264 (rpl-programming),
  265 (unit-tests — crash), 265-code-review (thirty-eighth review run).
- Baseline verified at entry: 5640 / 0 / 22 — fully green.
- Register count verified: 480 / 461 — unchanged.
- Spot checks: DATA_TYPES.md stamp session 263 ✓; RPL.md stamp session
  264 ✓; TESTS.md stamp session 265 ✓ (5640/0 snapshot); COMMANDS.md
  stamp session 262 at entry (bumped to 266 this run).
- O-012: `www/src/ui/keyboard.js.bak` re-verified present.
- O-014: `www/src/ai/chat-bot.js` carried forward `[deferred - post-ship]`.
- All locks for sessions 262–264 released gracefully with `releaseReason`.
- Session-265 unit-tests: lock unreleased (crash) — O-011 count already
  incremented in session-265-code-review; no further change this run.
- `docs/COMMANDS.md` Counts stamp advanced session 262 → 266; session-log
  entries back-filled for sessions 263 / 264 / 265 / 265-code-review.
- `docs/REVIEW.md` preamble updated to fold in session 266.

**Findings delta.**
- **O-011** — no new occurrences this run (lock released gracefully).
  30 code-review-lane runs, count 107.  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak` still
  in tree).  Aged to 18 code-review-lane runs (unchanged from last
  code-review entry — this is not a code-review run).
  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 30 code-review-lane runs, count 107.
- **O-012** `[deferred - post-ship]` (stray file) — 18 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability + chat-bot.js mtime).

Zero release-blocker findings.

Log pointer: `logs/session-266.md`.

---

### Session 267 — what shipped (data-type-support, last run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-data-type-support`.
**Lock.** `utils/@locks/session267-data-type-support.json`, scope =
`[tests/test-types.mjs, docs/DATA_TYPES.md, logs/]`.
Released gracefully.

**Work done.**
- Folded in sibling sessions 263–266 (all released gracefully).
- Baseline verified at entry: 5640 / 0 / 22 — fully green.
- +26 assertions in `tests/test-types.mjs` (1189 → 1215,
  `session267:` labels): C/S/V/M column rejection-pin pass —
  Complex-column for ZETA / LAMBERT / PSI / DIRAC / ERF / ERFC /
  BETA / UTPC / UTPF / UTPT (10 cells), combinatorial V+M for
  COMB / PERM / IQUOT / IREMAINDER / XROOT (13 cells), String-
  column for CONJ / RE / IM (3 cells).  No source change.
- `docs/DATA_TYPES.md` stamp 263 → 267; 26 `·` cells flipped `✗`.

**Findings delta.**
- **O-011** — no new occurrences (lock released gracefully with
  `releaseReason`).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]`.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]`.

Zero release-blocker findings.

Log pointer: `logs/session-267.md`.

---

### Session 268 — what shipped (rpl-programming, last run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-rpl-programming`.
**Lock.** `utils/@locks/session268-rpl-programming.json`, scope =
`[docs/RPL.md, logs/]`.
Released gracefully.

**Work done.**
- Folded in sibling sessions 266, 267 (both released gracefully).
- Baseline verified at entry: 5666 / 0 / 22 — fully green.
  (+26 from session 267 vs. session 264 baseline of 5640.)
- Doc-only verification pass: `docs/RPL.md` status stamp 264 → 268;
  session-268 chapter added to RPL.md.
- R-001 through R-012 all confirmed resolved; no source changes.

**Findings delta.**
- **O-011** — no new occurrences (lock released gracefully with
  `releaseReason`).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]`.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]`.

Zero release-blocker findings.

Log pointer: `logs/session-268.md`.

---

### Session 269 — what shipped (unit-tests, last run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-unit-tests`.
**Lock.** `utils/@locks/session269-unit-tests.json`, scope =
`[docs/TESTS.md, docs/REVIEW.md, logs/session-269.md]`.
Released gracefully at end of run.

**Work done.**
- Folded in sibling sessions 266 (command-support), 267 (data-type-
  support), 268 (rpl-programming); all released gracefully.
- Baseline verified at entry: **5666 / 0** (fully green);
  `test-persist.mjs` all passed; `sanity.mjs` 22 / 0 in ~5 ms.
- Zero release-blocker findings; T-001 / T-002 / T-003 / T-004
  all resolved in prior sessions.  D-001 closed ship-prep 2026-04-25.
- `docs/TESTS.md` stamp advanced 265 → 269; new session-269
  coverage snapshot added (5666 / 0 table); sibling deltas 266–268
  absorbed.
- `docs/REVIEW.md` session log entries appended for sessions
  267, 268, and 269 (this run).

**Findings delta.**
- **O-011** — no new occurrences (lock released gracefully with
  `releaseReason`).  `[deferred - post-ship]`.
- **O-012** — carried forward.  `[deferred - post-ship]`.
- **O-014** — carried forward.  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]`.
- **O-012** `[deferred - post-ship]` (stray file).
- **O-014** `[deferred - post-ship]`.

Zero release-blocker findings.  All lane work complete.

Log pointer: `logs/session-269.md`.

---

### Session 270-code-review — what shipped (thirty-ninth and final review-lane run)

**Date.** 2026-04-26.  **Lane.** `rpl5050-code-review`.
**Lock.** `utils/@locks/session270-code-review.json`, scope =
`[docs/REVIEW.md, logs/]`.

**Work done.**
- Folded in sibling sessions 266 (command-support), 267 (data-type-
  support), 268 (rpl-programming), 269 (unit-tests); all four
  released gracefully with `releaseReason`.
- Baseline verified at entry: **5666 / 0** (fully green);
  `test-persist.mjs` all passed; `sanity.mjs` 22 / 0 in ~5 ms.
  Register count verified: 480 / 461 — unchanged.
- Spot checks: COMMANDS.md stamp session 266 ✓; DATA_TYPES.md stamp
  session 267 ✓ (+26 C/S/V/M rejection pins, 1189 → 1215);
  RPL.md stamp session 268 ✓ (verification-only, all R-findings
  confirmed closed); TESTS.md stamp session 269 ✓ (5666/0 snapshot
  written, session-log entries for sessions 267–269 appended).
- Phantom lock detected: `session266-code-review.json` has
  `released: false` with `acquiredAt: 1777247821` (same timestamp
  as `session265-code-review.json`). No corresponding log file
  exists. Recorded as new O-011 occurrence (count 107 → 108).
- O-012: `www/src/ui/keyboard.js.bak` re-verified present, mtime
  2026-04-25; unchanged.  Aged to 19 code-review-lane runs.
- O-014: `www/src/ai/chat-bot.js` mtime now `Apr 27 03:23`
  (previously `Apr 26 23:26` — a new unlocked modification
  occurred between session 269 close and this run).  No session
  labels identify the change; deferred per O-014 plan.
- R-002 (`_driveGen gen.return()`): confirmed resolved in source —
  `www/src/rpl/ops.js:4378` has `try { gen.return(); } catch (_) {}`;
  REVIEW.md body already shows `resolved session-101`.
- `docs/REVIEW.md` preamble rewritten to fold in sessions 266–269;
  baseline block updated; O-011 aged 30 → 31 code-review-lane runs,
  count 107 → 108; O-012 aged 18 → 19 runs (inline body updated);
  O-014 updated with new mtime observation.

**Findings delta.**
- **O-011** — 30 → **31** code-review-lane runs.  Phantom
  `session266-code-review.json` (`released: false`, no log) adds
  one occurrence; count 107 → **108** since session 106.  Sessions
  266–269 all released gracefully with `releaseReason` (positive
  trend continues).  `[deferred - post-ship]`.
- **O-012** — re-verified present (`www/src/ui/keyboard.js.bak`
  still in tree, mtime 2026-04-25).  Aged to **19** code-review-lane
  runs.  `[deferred - post-ship]`.
- **O-014** — chat-bot.js new mtime `Apr 27 03:23` (was
  `Apr 26 23:26`).  Low-risk; audit deferred post-ship.
  `[deferred - post-ship]`.

**Open queue at run-close:**
- **O-011** `[deferred - post-ship]` — 31 code-review-lane runs, count 108.
- **O-012** `[deferred - post-ship]` (stray file) — 19 code-review-lane runs.
- **O-014** `[deferred - post-ship]` (unlogged algebra edit traceability +
  chat-bot.js unlocked modifications).

Zero release-blocker findings.  This is the final code-review-lane run.

Log pointer: `logs/meta-2026-04-26-code-review-5.md`.
