# REVIEW.md — RPL5050 code-review lane running ledger

**Scope.** This file is the authoritative ledger for the
`rpl5050-code-review` scheduled-task lane. It records audit findings
across the whole repo, classified into the six lane buckets
(`User Interface`, `Commands`, `Data Types`, `RPL`, `Unit Tests`,
`Other`), so the sibling implementer lanes can pick them up as a group.

This file has been collapsed to **current state**: only currently-open
findings and the lane's standing conventions are retained in full. The
long session-by-session history and the full write-ups of closed
findings have been removed — git preserves them. A one-line pointer to
recently-closed IDs is kept at the bottom.

| Bucket          | Sibling lane that owns the fix            |
|-----------------|-------------------------------------------|
| User Interface  | `rpl5050-ui-development`                  |
| Commands        | `rpl5050-command-support`                 |
| Data Types      | `rpl5050-data-type-support`               |
| RPL             | `rpl5050-rpl-programming`                 |
| Unit Tests      | `rpl5050-unit-tests`                      |
| Other           | any lane — hygiene items, no behavior     |

**Tree-relocation note.** The project tree was relocated at session
103: `src/` → `www/src/`. Historical `Where:` lines filed before
session 099 referenced the old `src/...` paths; open findings are
re-verified at the new path.

## Ledger policy

- Each finding is promoted to `[resolved - session NNN]` once the
  owning lane ships the fix and logs it. A finding that turns out to be
  a phantom on second-read is marked `[retracted - session NNN]` with a
  one-line reason.
- When unsure whether a finding is still open, keep it open.

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

## Standing drift patterns this lane watches

Recurring doc↔code drift classes that have each fired multiple times.
Check these every run:

1. **`docs/COMMANDS.md` Counts / register-count prose drift.** The
   Counts block claims `grep -c "register(" www/src/rpl/ops.js` and
   `grep -cE "^register\(" www/src/rpl/ops.js` totals, plus a ✓-count
   and "as of session NNN" stamp. These go stale whenever a sibling
   lane adds a `register()` call (especially wrapper-adds) or ships a
   new op without updating COMMANDS.md. Re-run both greps each pass and
   reconcile. (History: C-005/C-012/C-013/C-015/C-016.)
2. **`docs/COMMANDS.md` / `docs/RPL.md` / `docs/TESTS.md` /
   `docs/DATA_TYPES.md` "Last updated" stamp + session-log back-fill
   drift.** Doc stamps and per-session log blocks lag behind the actual
   shipped sessions. (History: C-014, T-001..T-004, O-006.)
3. **Substantive ship without a session log / doc update.** A lane
   acquires a lock, edits source/state, then the lock is stale-pruned
   (signature: `heartbeatAt === startedAt`, `released: true` set by
   prune not owner, no `releaseReason`) with no `logs/session-NNN.md`
   and no matching COMMANDS.md/RPL.md/test updates. (History:
   O-008 session 106, O-010 session 121.) This is the signature O-011
   is meant to make unambiguous.
4. **Stale `src/…` path references in `docs/` after the `www/src/`
   move.** (History: P-001, P-002 — all closed, but watch new docs.)
5. **AI `RPL_CATALOG` drift from the live `register()` set** — see the
   open O-013 standing item below.
6. **Stray `*.bak` / build-artifact files** appearing in the tree —
   see open O-012; deletion is blocked in the scheduled-task sandbox.

## Ship guidance (user, ship-prep Saturday 2026-04-26)

Recorded for provenance; all translated ledger items (R-007/R-008/
R-009/R-010/R-011/R-012, C-011) shipped and are closed.

> "The programming features should be given priority. Also the OBJ→
> behavior should be closer to the HP50. Also, when a soft key and it
> errors, it should remove the program from the stack." … "any time an
> app is evaluated, it should be removed from the stack even on error.
> Including … VARS menu and the CST menu and when EVAL is called on it."
> … "EVAL also has behavior that should be closer to the HP50."

---

## Open findings

All currently-open findings are in the `Other` bucket and are
`[deferred - post-ship]` — zero release-blocker findings remain.

### O-011  Lock body cannot disambiguate "graceful release" from "stale-prune-with-late-log"

- **Classification.** Other (lock-protocol audit-trail ergonomics).
- **Where.** `utils/@locks/lock.mjs` — `release()` (~:101-114) and
  `pruneStale()` (~:44-59); plus `utils/@locks/README.md` example body
  shape.
- **What.** The persisted lock body
  (`{ owner, scope, intent, startedAt, heartbeatAt, released?,
  releasedAt? }`) has no field distinguishing an owner-driven graceful
  `release()` from a stale-prune recovery. Both set
  `released: true` + `releasedAt`. Audits currently disambiguate
  heuristically (heartbeat-vs-startedAt + log-mtime proximity to
  releasedAt), which is noisy and has misfired across the O-008 /
  O-010 / O-011 precedents. No lane currently calls `heartbeat()`, so
  effectively every release carries the ambiguous
  `heartbeatAt === startedAt` shape; the count of occurrences keeps
  climbing each sibling-lane run (108 since session 106 as of the last
  run).
- **Fix.** One-line additions: `release()` sets
  `releaseReason: "graceful"`; `pruneStale()` sets
  `releaseReason: "stale-prune"` (or `"stale-prune-after-graceful"` on
  the previously-released unlink-fallback path). Update the README
  example body in parallel. Purely additive — absence of the field is
  the historical default, so in-flight pre-fix locks are unaffected. No
  test impact (the helper has no unit coverage).
- **Confidence.** high — `grep -n "releaseReason"
  utils/@locks/lock.mjs utils/@locks/README.md` returns zero hits;
  helper writes only `released` + `releasedAt`.
- **Owner.** No canonical owner (`lock.mjs` is shared infrastructure).
  Pair with any lane already editing the lock helper, or the review
  lane can ship it as pure infrastructure hygiene.
- **Age.** 31 code-review-lane runs (filed session 143). **Status.**
  open, `[deferred - post-ship]`.

### O-012  Stray `www/src/ui/keyboard.js.bak` backup file

- **Classification.** Other (file-hygiene / build artifact).
- **Where.** `www/src/ui/keyboard.js.bak` (mtime 2026-04-25).
- **What.** A `.bak` copy of `www/src/ui/keyboard.js` sits beside the
  live file. Not referenced by any build or test script; likely an
  editor backup. `find www/ -name '*.bak*'` returns exactly this one
  hit, unchanged across all re-checks.
- **Why.** Grep noise; risk of a contributor editing the stale copy;
  `.bak` proliferation precedent.
- **Fix.** Delete the file. Requires an interactive (non-scheduled)
  session to approve via `mcp__cowork__allow_cowork_file_delete`, or a
  user-side `rm` — the scheduled-task sandbox hits
  `Operation not permitted`. Recommend adding `*.bak` to `.gitignore`.
- **Confidence.** high.
- **Owner.** `rpl5050-ui-development` or any interactive session.
- **Age.** 19 code-review-lane runs (filed session 189-code-review).
  **Status.** open, `[deferred - post-ship]` pending interactive
  delete approval — no behavior risk.

### O-013  `www/src/ai/system-prompt.js` `RPL_CATALOG` is manually maintained and can drift from the live op set

- **Classification.** Commands (standing drift-watch).
- **Where.** `www/src/ai/system-prompt.js` — `RPL_CATALOG` constant
  (top ~80 lines) plus the per-block command listings (e.g. the
  STATISTICS block ~:189).
- **What.** The AI chat assistant embeds a curated `RPL_CATALOG` string
  (~50 commands with descriptions and stack effects), a hand-maintained
  subset of `docs/COMMANDS.md` not generated from any authoritative
  source. The model emits these names **verbatim**, so any entry whose
  spelling/arity/description diverges from the live `register()` set
  produces wrong advice. This has now drifted twice: session-243
  audited it clean, but a later full-catalog token sweep
  (2026-06-14) caught the STATISTICS block advertising `ΣX²` / `ΣY²`
  (superscript) when the dispatchable names are `ΣX2` / `ΣY2` (ASCII 2);
  fixed in that run.
- **Why.** Drift risk accumulates as new ops land. The `²`-rendered
  forms in `ops.js` comments, `docs/COMMANDS.md`, and `docs/TESTS.md`
  are human-readable labels, not dispatch keys — only the AI catalog,
  which the model emits literally, must use the registered spelling.
- **Fix.** Standing obligation: every time a new op ships, spot-check
  `RPL_CATALOG` entries (names, arity, deviations such as INVMOD's
  2-arg form) against the live `register()` set and
  `docs/@!MY_NOTES.md` Intentional Deviations; bump the "last audited —
  session NNN" comment above the constant.
- **Confidence.** high — `RPL_CATALOG` confirmed a standalone constant,
  not generated.
- **Owner.** `rpl5050-command-support`.
- **Status.** Last occurrence resolved same-run (2026-06-14); kept as a
  **standing drift-watch item** because the catalog is hand-maintained
  and has recurred. Re-audit on every new-op ship.
  - **2026-06-15 audit pass (clean).** Full `lookup()`-based token sweep
    of every command-like token in `RPL_CATALOG` against the live op set
    (`allOps()` = 467) — every command name resolves; the only misses
    are prose, section headers, type names (`Real`/`Symbolic`/`Vector`),
    and placeholders. The `AVAILABLE TOOLS` block (8 tools) matches
    `_buildRegistry` exactly, and the three aliases it advertises
    (`add_to_stack`/`recall`/`show_stack`) resolve via
    `resolveToolAlias`. The prompt-side of this drift class is now
    partly **evergreen**: `tests/test-chatbot-parse.mjs` pins the
    documented tool set, asserts each canonical name is alias-stable
    (reverse-collision guard the ai-chatbot lane had queued), and that
    the advertised aliases still resolve. The prior run's queued
    "`SCHUR`/`PMINI` absent from the catalog" item is **not drift** —
    `RPL_CATALOG`'s own header declares it a curated subset (not the
    exhaustive index, which is `docs/COMMANDS.md`), so a shipped op
    missing from it is by design, not a mismatch.
  - **2026-06-15 audit pass + new evergreen guard.** Fresh full-catalog
    `hasOp()` sweep against the live op set (`allOps()` = 467, unchanged):
    every `RPL_CATALOG` command name and advertised alias resolves —
    `JORDAN` still ✗ (unregistered), `SCHUR`/`PMINI`/`PCAR` ✓, `ΣX2`/`ΣY2`
    ✓ with the superscript `ΣX²` correctly absent. Turned the part of this
    class most prone to recurrence — the glyph-bearing names (Σ/Δ/Π
    accumulators, →-arrow conversions) the model emits verbatim — into a
    test guard: exported `RPL_CATALOG` from `system-prompt.js` (one-word
    change, mirrors the `TOOL_ALIASES`/`effectiveBudget` export precedent)
    and added a `session286:` block to `tests/test-chatbot-parse.mjs` that
    pulls every glyph-led token straight from the catalog text and asserts
    it dispatches via `hasOp`. Whole-token capture is deliberate so a
    superscript like `ΣX²` surfaces as the full unresolved token rather
    than truncating to a resolving `ΣX` — i.e. the exact twice-fired bug
    now fails the suite, not just a manual sweep. `node tests/test-all.mjs`
    → 5928 passed / 0 failed. Next: extend the same catalog-extraction
    guard to the non-glyph command names (needs a robust prose-vs-command
    line classifier so the leading command column is pinned without
    false-positives from the HOW-THE-STACK-WORKS narrative blocks).
  - **2026-06-15 audit pass + non-glyph guard (closes the queued
    follow-up).** Shipped the robust prose-vs-command classifier the
    prior run flagged as the open piece, so the uppercase command names
    are now evergreen too (previously only glyph-bearing names were).
    The classifier walks `RPL_CATALOG` section by section: column-0 lines
    are headers; the two narrative blocks (`HOW THE STACK WORKS`,
    `ALGEBRAIC OBJECTS`) are skipped wholesale so their ALL-CAPS emphasis
    words (`LITERALS`/`COMMANDS`/`STACK`/`LIFO`/`PUSH`) don't read as ops;
    within command-list sections, each indented line's leading command
    column (the run before the 2-space description gap) is taken, syntax-
    template lines are dropped (those carrying `...` or a literal/structure
    marker — brackets, braces, guillemets, backticks, `:`, `/`, which is
    what filters out `IF…THEN…END`, `{ a b c }`, `:tag:value`, `n FIX`),
    and every uppercase-shaped token (len >= 2) is asserted to dispatch via
    `hasOp`. Yields 245 uppercase command tokens, zero unresolved. Added a
    `session291:` block to `tests/test-chatbot-parse.mjs` (+246 assertions:
    a >=200 floor so a broken extractor is caught, plus one per token).
    `node tests/test-all.mjs` → 6242 passed / 0 failed. Known limitation
    (documented in the test): a *new* narrative block would reintroduce
    ALL-CAPS-emphasis false positives — the fix is to extend the `PROSE`
    header set; the failure is loud, not silent. Next: lowercase ops
    (`erf`/`erfc`/`lim`/`e`/`i`) and single-letter names are still
    unswept by this guard (excluded to stay false-positive-free) — the
    glyph sweep covers `π`/Σ/etc.; the remaining lowercase command tokens
    would need an explicit small allowlist to pin without re-admitting
    prose words.
  - **2026-06-15 audit pass + non-uppercase allowlist (closes the queued
    follow-up).** Built the explicit allowlist the prior run flagged, so the
    last shape-excluded catalog command classes are now pinned too. The two
    earlier sweeps both filter on shape and so skip real ops: session286
    takes only glyph-led tokens, session291's `^[A-Z][A-Z0-9]+$` excludes
    anything not pure uppercase+digits. That left the mixed-case/lowercase
    special-function names (`Beta`/`erf`/`erfc`/`Ei`/`Si`/`Ci`/`lim`) and the
    punctuation-suffixed ops (query-flag `?`: `FC?`/`FS?`/`FC?C`/`FS?C`/
    `ISPRIME?`/`CMPLX?`; row/col `+`/`-`: `COL+`/`COL-`/`ROW+`/`ROW-`; and the
    `SST↓` glyph) unguarded — a typo or de-registration of any would ship the
    same wrong advice as the `ΣX²`/`ΣX2` bug, silently. Auto-extraction
    re-admits prose/syntax fragments (`"text"`, the `(alias XNUM)`
    parentheticals, the `n` operand placeholder), so per the queue this is a
    curated allowlist (18 names): each is asserted to both appear in the
    catalog text (so the list can't rot past a rename) and dispatch via
    `hasOp`. Verified live first — all 18 in-catalog and registered; the
    backtick constants `e`/`i`/`π` are symbolic literals (not ops) and the
    XNUM/XQ alias names are pure uppercase (already swept by session291), so
    both are deliberately excluded. Added a `session297:` block to
    `tests/test-chatbot-parse.mjs` (+36 assertions). `node tests/test-all.mjs`
    → 6383 passed / 0 failed. With glyph + uppercase + non-uppercase sweeps
    the catalog's command-token surface is now fully drift-guarded; the only
    remaining uncovered tokens are single-letter operand placeholders and the
    backtick constants, both intentionally not ops.

### O-014  Unlogged `test-algebra.mjs` +3 assertions + `chat-bot.js` unlocked-modification anomaly

- **Classification.** Other (audit-trail hygiene).
- **Where.** `tests/test-algebra.mjs` (+3 assertions added with no lock
  or log coverage); `www/src/ai/chat-bot.js` (modified outside any
  session lock/log; mtime last seen `Apr 27 03:23`, having advanced
  again between session 269 and the last review run).
- **What.** Items (1)/(2) of the original filing (an unreleased lock
  and missing log for session-250) were **retracted session 252** —
  `session250-unit-tests.json` shows `released: true` with a
  `releaseReason` and `logs/session-250.md` exists. Remaining open:
  (3) `tests/test-algebra.mjs` gained +3 assertions (1061 → 1064) in
  the ~160 s window between session-249 close and session-250
  acquisition, no lock/log/session-label covering them (all pass);
  (4) `www/src/ai/chat-bot.js` has been modified one or more times
  outside any lock/log, with no session-label comments — behavior
  uninspected.
- **Why.** Traceability gap only — no behavior impact. The algebra
  assertions pass; the chat-bot.js change is uninspected.
- **Fix.** Post-ship hygiene: confirm the +3 algebra assertions are
  benign and label them; audit the chat-bot.js change in the first
  post-ship session.
- **Confidence.** high — lock body, session-250.md, TESTS.md snapshot,
  and file mtimes all verified.
- **Age.** 7+ runs (filed session 251-code-review; partially retracted
  session 252). **Status.** open, `[deferred - post-ship]` — low-risk
  hygiene, no behavior impact.

---

## Recently closed (full write-ups live in git history)

All other findings filed by this lane are resolved or retracted:
O-001, O-002, O-003, O-004, O-005, O-006, O-007, O-008, O-009, O-010;
P-001, P-002;
C-001 through C-016;
D-001;
R-001 through R-012;
T-001 through T-004;
U-001;
X-001 through X-010.
