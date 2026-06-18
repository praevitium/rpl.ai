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

1. **`docs/COMMANDS.md` ✓-count drift.** The "Current status" block
   states a `✓` total (currently 449) reconciled against the live
   registry. It goes stale whenever a sibling lane adds a `register()`
   call (especially wrapper-adds) or ships a new op without updating
   COMMANDS.md. Re-derive each pass: `grep -cE "^register\(" www/src/rpl/ops.js`
   gives distinct registered names (currently 463) and `allOps()` the
   reachable total (467); the ✓ count is these minus internal aliases
   and `will-not` rows. (History: C-005/C-012/C-013/C-015/C-016.)
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

### O-012  Stray `www/src/ui/keyboard.js.bak` backup file — RESOLVED

- **Classification.** Other (file-hygiene / build artifact).
- **What.** A `.bak` copy of `www/src/ui/keyboard.js` sat beside the
  live file. Deleted 2026-06-17 (interactive session), and `*.bak` added
  to `.gitignore` so it cannot recur. `find www/ -name '*.bak*'` now
  returns no tracked-source hits (only gitignored `www-dist/` output).
- **Confidence.** high.
- **Status.** closed (2026-06-17).

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

### R-013  `parseEntry` JSDoc described a return shape the code never produces

- **Classification.** RPL (doc↔code drift in source).
- **Where.** `www/src/rpl/parser.js` — `parseEntry` JSDoc (~:223).
- **What.** The doc claimed parseEntry "if it produces exactly one value,
  return that value; else return a Program-like list of values." The body
  (`const values = []; while (idx < toks.length) values.push(parseOne());
  return values;`) **always** returns a plain array — it never unwraps a
  single value, and the array is not a Program object. Every caller relies
  on the array contract (the entry loop pushes each element;
  `tests/test-binary-int.mjs` checks `.length === 1` and indexes `[0]`), so
  the code is correct and the doc was the wrong side. Flagged by the
  rpl-programming lane (2026-06-17 run-log).
- **Fix.** Rewrote the JSDoc to describe the actual contract (always an
  array, one entry per top-level object in entry order, `[]` for
  empty/whitespace input). No behavior change.
- **Confidence.** high — verified body + callers.
- **Status.** **resolved 2026-06-17 (code-review).** Added a `session303:`
  block in `tests/test-entry.mjs` (+3 pins) guarding the return-shape
  contract so a future unwrap-the-single-value refactor that re-creates the
  old doc fails the suite.

### R-014  `parser.js` file-header comment under-listed the object kinds the entry parser covers

- **Classification.** RPL (doc↔code drift in source).
- **Where.** `www/src/rpl/parser.js` — file-header comment (~:1-5).
- **What.** The header claimed the parser "Covers reals, integers, binary
  integers, complex, strings, names, lists, programs, and vectors" — but the
  code also produces `Matrix` (`[[..]]` → `:548`), `Unit` (`n_uexpr` →
  `:259`), and `Symbolic` algebraics (backtick `` `..` `` → `:387`). All three
  had been added since the comment was written but never folded into its
  list, so a reader auditing parser coverage from the header would miss them.
  Same drift class as R-013 (the comment was the wrong side).
- **Fix.** Rewrote the header to list vectors, matrices, programs, units, and
  backtick algebraics (symbolics) alongside the existing kinds. No behavior
  change.
- **Confidence.** high — verified each kind is produced (live probe + the
  `Matrix`/`Unit`/`Symbolic` constructor sites).
- **Status.** **resolved 2026-06-17 (code-review).** Added a `session309:`
  block in `tests/test-entry.mjs` (+13 pins) asserting `parseEntry` yields
  each documented kind (real/integer/binint/complex/string/name/list/vector/
  matrix/program/unit/symbolic) plus the "unrecognised → bare identifier"
  fallthrough, so the comment can't silently drift from the code again.

### R-015  `types.js` file-header "Types implemented:" list omitted `Directory`

- **Classification.** RPL (doc↔code drift in source).
- **Where.** `www/src/rpl/types.js` — file-header comment "Types
  implemented:" block (~:8-44).
- **What.** The header enumerates every implemented value type, but
  omitted `Directory` — a fully constructed type (the `Directory`
  constructor `:359`, the `isDirectory` predicate `:384`, and
  `TYPES.DIRECTORY` `:69`), the mutable named container HOME/subdirs
  use. A reader auditing the type set from the header would miss it.
  Same drift class as R-014 (the comment was the wrong side).
- **Fix.** Added a `Directory` entry to the header list (between
  `Tagged` and `BinaryInteger`). No behavior change.
- **Confidence.** high — verified the constructor, predicate, and TYPES
  key all exist; the header was the only place it was absent.
- **Status.** **resolved 2026-06-17 (code-review).** Added a
  `session335:` block in `tests/test-types.mjs` (+18 pins) that reads
  the types.js header text and asserts every `TYPES` value's
  PascalCase display name (derived, not hand-copied) is documented
  there, plus a `>= 16` extraction floor and an explicit Directory
  regression — so a future type added to `TYPES` without a header entry
  fails the suite. `node tests/test-all.mjs` → 6743 passed / 0 failed
  (baseline 6725).

### R-016  `chat-bot.js` header "Tool-call loop" described an obsolete `<tool_call>` XML wire format

- **Classification.** RPL-adjacent / AI (doc↔code drift in source).
- **Where.** `www/src/ai/chat-bot.js` — file-header "Tool-call loop"
  comment, step 3 (~:27).
- **What.** Step 3 read "When done, scan for `<tool_call>...</tool_call>`
  in the response." But the orchestrator parses **bare JSON** tool-call
  objects: `parseAllToolCalls` (~:422) anchors on `/\{\s*"name"\s*:/`
  and `JSON.parse`s the balanced object — it never looks for a
  `<tool_call>` wrapper. The system prompt actively **forbids** the
  wrapper (`system-prompt.js` ~:269: "DO NOT wrap the JSON in ```json
  … ``` fences or `<tool_call>` tags. Bare objects only, one per
  line."). So the header documented a wire format the code never reads
  and the prompt rejects — same drift class as R-013/R-014/R-015 (the
  comment was the wrong side; an earlier XML-based design left the
  comment behind when the parser moved to bare JSON).
- **Fix.** Rewrote step 3 to describe the bare JSON object format
  (`{"name":...,"arguments":...}`, one per line, NOT `<tool_call>` XML)
  read by `parseAllToolCalls`. No behavior change.
- **Confidence.** high — verified the parser anchors on `{"name":`, the
  prompt forbids the tags, and `get_stack`/the confirm semantics (the
  rest of the loop description) are still accurate.
- **Status.** **resolved 2026-06-17 (code-review).** Added a
  `session342:` block in `tests/test-chatbot-parse.mjs` (+5 pins)
  reading the chat-bot.js header text: asserts the stale
  `scan for <tool_call>...</tool_call>` claim is gone and the bare-JSON
  format is named, ties it to live behavior (parseAllToolCalls reads a
  bare object and keys on the inner JSON of an inert `<tool_call>`
  wrapper), and pins that the system prompt forbids the tags — so the
  XML description can't creep back. `node tests/test-all.mjs` → 6791
  passed / 0 failed (baseline 6786).

### O-015  Registry↔prompt sync guard checked the prompt against a hand-copied literal, not the live registry

- **Classification.** Other (drift-guard weakness — the guard that
  watches the O-013-adjacent tool-registry/prompt sync was itself a
  drift surface).
- **Where.** `tests/test-chatbot-parse.mjs` — the AVAILABLE-TOOLS sync
  block (~:322) and the alias target-side block (~:360).
- **What.** Both blocks asserted against a hard-coded 8-name literal
  (`expected` / `canonical`), duplicated across the two blocks — so the
  same tool list lived in THREE hand-maintained copies (the prompt's
  AVAILABLE TOOLS block, `chat-bot.js _buildRegistry`, and twice in the
  test). The guard's own comment claims it catches "a tool name that
  drifts from chat-bot.js _buildRegistry", but it never read the
  registry: a tool added to `_buildRegistry` without a matching prompt
  entry (or vice versa) would pass, while a stale `expected` literal
  could fail for a registry that was actually correct.
- **Fix.** Test-only. Added a DOM-free `registryToolNames()` helper —
  `ChatBot.prototype._buildRegistry.call({ _tools: {}, _getContext: () => ({}) })`
  exposes the live key set (the method reads only `this._tools` /
  `this._getContext`, no DOM), so the prompt's documented names are now
  asserted equal to the live registry and the alias target-side set is
  derived from it too. Both hand-copied literals removed; a `>= 8`
  extraction floor guards against a silently-empty registry. `ChatBot`
  added to the test's chat-bot.js import.
- **Confidence.** high — verified the extraction returns exactly the 8
  registered names live, and that the strengthened guard still passes.
- **Status.** **resolved 2026-06-17 (code-review).** `session315:`
  reuses the existing AVAILABLE-TOOLS assertions against the live
  registry; `node tests/test-all.mjs` → 6535 passed / 0 failed.

### O-016  Prompt's AVAILABLE-TOOLS confirm/read-only prose was unguarded against the registry's `confirm` flags

- **Classification.** Other (drift-guard gap — extends the O-015 name-sync guard).
- **Where.** `tests/test-chatbot-parse.mjs` — AVAILABLE-TOOLS confirm-semantics
  block; source of truth is `chat-bot.js _buildRegistry` (`confirm` per tool)
  vs the `system-prompt.js` AVAILABLE TOOLS descriptions.
- **What.** O-015 made the prompt↔registry *name* set evergreen, but the
  descriptions still advertise each tool as either "Requires user
  confirmation" (mutating) or "Auto-executes (read-only)" with nothing
  asserting that prose against the registry's `confirm` boolean — the flag
  the orchestrator actually gates on. A tool flipped read-only↔mutating in
  `_buildRegistry` without a matching prompt edit (or vice versa) would
  silently mislead the model about whether an action runs unattended.
- **Fix.** Test-only. Parse each documented tool's description from the
  AVAILABLE TOOLS block, derive the documented semantic (confirm vs
  auto/read-only), and assert it equals the live registry's `confirm` flag,
  with a mutual-exclusion check (exactly one phrase present) so a dropped
  semantic phrase is caught too, plus a `>= 8` extraction floor.
- **Confidence.** high — probed live: all 8 tools parse cleanly; mutating
  four are `confirm: true` + "Requires user confirmation", read-only four are
  `confirm: false` + "Auto-executes".
- **Status.** **resolved 2026-06-17 (code-review).** `session321:` block in
  `tests/test-chatbot-parse.mjs` (+25 pins). `node tests/test-all.mjs` →
  6608 passed / 0 failed (baseline 6583).

### O-017  Prompt's AVAILABLE-TOOLS argument names were unguarded against the registry handlers' destructured keys

- **Classification.** Other (drift-guard gap — closes the queued O-013
  arg-name/arity follow-up that O-015 (name sync) and O-016 (confirm sync)
  left open).
- **Where.** `tests/test-chatbot-parse.mjs` — AVAILABLE-TOOLS arg-name block;
  sources of truth are the `system-prompt.js` AVAILABLE TOOLS JSON
  (`"arguments":{...}`) and `chat-bot.js _buildRegistry` (each handler's
  destructured arg key).
- **What.** O-015/O-016 made the prompt↔registry tool *names* and confirm
  flags evergreen, but the per-tool *argument names* were still unguarded. The
  model emits the AVAILABLE TOOLS argument object verbatim
  (`{"name":"run","arguments":{"text":...}}`), while the orchestrator
  destructures a fixed key from it (`({ text }) => tools.run(...)`). A handler
  arg renamed (e.g. `text`→`code`) without a matching prompt edit (or vice
  versa) makes the model send a key the handler ignores → the action silently
  runs empty, invisible to both the name and confirm guards.
- **Fix.** Test-only. Introspect each handler's real read-keys with a recording
  `Proxy` as the args object (a Get trap fires once per destructured key) and a
  no-op `_tools` proxy so the side-effecting handlers run DOM-free; parse the
  advertised arg-key set per tool from the AVAILABLE TOOLS JSON; assert the two
  sets are equal per tool, in both directions, with a `>= 8` floor.
- **Confidence.** high — probed live: all 8 tools match (run→`text`,
  push_to_stack→`value`, append_to_editor→`text`, recall_var→`name`, the four
  read-only tools take no args); no handler threw under the no-op tools proxy.
- **Status.** **resolved 2026-06-17 (code-review).** `session328:` block in
  `tests/test-chatbot-parse.mjs` (+25 pins). `node tests/test-all.mjs` →
  6676 passed / 0 failed (baseline 6651). With names (O-015), confirm flags
  (O-016) and now argument names all pinned against the live registry, the
  AVAILABLE-TOOLS prompt↔registry contract is fully drift-guarded.

### R-017  `cycleCoordMode`'s documented cycle order was unpinned while its sibling `cycleAngle`'s was pinned

- **Classification.** RPL (test-coverage gap on a documented contract).
- **Where.** `www/src/rpl/state.js` — `cycleCoordMode` (~:254-260) and
  `setCoordMode` (~:244-252); the existing `cycleAngle` pin lives in
  `tests/test-numerics.mjs` (~:183).
- **What.** `cycleAngle`'s `RAD → DEG → GRD → RAD` cycle is pinned in
  test-numerics, but the structurally-identical sibling `cycleCoordMode`
  — whose JSDoc documents `RECT → CYLIN → SPHERE → RECT` — had no test
  exercising its cycle order anywhere (`setCoordMode` was used by the
  display tests, but `cycleCoordMode` was never called in the suite).
  So a refactor that reordered `COORD_MODES`, dropped the modulo wrap,
  or changed `setCoordMode`'s uppercase-normalization / unknown-mode
  guard would still pass the whole suite while contradicting the JSDoc
  and breaking the status-line click handler. Same coverage-asymmetry
  class as the session335 header-vs-const guards.
- **Fix.** Test-only. Added a `session349:` block in
  `tests/test-numerics.mjs` after the `cycleAngle` block (+8 pins):
  COORD_MODES order + frozen, the three-step cycle incl. the wrap,
  `setCoordMode`'s uppercase normalization, the `Unknown coordinate
  mode` rejection, and that a rejected set leaves `coordMode` unchanged.
  Probed all arms live first. No source change.
- **Confidence.** high — verified `cycleCoordMode` had zero test callers
  and the behavior live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 6848 passed / 0 failed (baseline 6840).

### R-018  `chat-bot.js` file-header "Constructor options" `tools` bag listed only one of six members

- **Classification.** RPL-adjacent / AI (doc↔code drift in source).
- **Where.** `www/src/ai/chat-bot.js` — file-header "Constructor
  options" comment, `tools: { ... }` block (~:9-12).
- **What.** The header's `tools` block documented a single member
  (`run`), but the calculator-side callback bag the ChatBot actually
  consumes has six: `run`, `appendToEditor`, `clearEditor`, `getEditor`,
  `listVars`, `recallVar`. The constructor JSDoc just below (~:850-858)
  already lists all six correctly, and `_buildRegistry` (~:930) reads
  exactly that set (`get_editor`→`getEditor`, `get_vars`→`listVars`,
  `recall_var`→`recallVar`, `append_to_editor`→`appendToEditor`,
  `clear_editor`→`clearEditor`, `run`/`push_to_stack`→`run`). So the
  header under-listed the bag — a reader auditing the calculator-side
  contract from the top of the file would miss five members. Same drift
  class as R-014/R-015/R-016 (the comment was the wrong side; it
  predates the editor/vars tools being added, leaving only the original
  `run`).
- **Fix.** Expanded the header `tools` block to the same six members the
  constructor JSDoc documents and `_buildRegistry` consumes. No behavior
  change.
- **Confidence.** high — derived the live consumed set by running every
  registry handler against a recording `_tools` proxy: exactly
  `run`/`appendToEditor`/`clearEditor`/`getEditor`/`listVars`/`recallVar`.
- **Status.** **resolved 2026-06-17 (code-review).** Added a
  `session356:` block in `tests/test-chatbot-parse.mjs` (+13 pins) that
  derives the live consumed `tools.*` set via the recording proxy and
  asserts the header's `tools` block documents exactly that set, both
  directions (plus a `>= 6` floor) — so the header can't silently
  under-list the bag again. `node tests/test-all.mjs` → 6896 passed / 0
  failed (baseline 6883).

### R-019  `chat-bot.js` header "Constructor options" `getContext()` return shape was unguarded against the registry's read keys

- **Classification.** RPL-adjacent / AI (test-coverage gap on a
  documented contract; sibling of R-018).
- **Where.** `www/src/ai/chat-bot.js` — file-header "Constructor
  options" comment, `getContext(): { ... }` block (~:17-22); consumers
  are the `_buildRegistry` handlers reading `_getContext()` (~:953-1015).
- **What.** R-018 made the header `tools` bag evergreen against the live
  registry, but the sibling `getContext()` return shape
  (`stack`/`angleMode`/`displayMode`/`dir`) had no guard tying it to the
  keys the code actually reads. The `get_stack` handler reads all four
  (`c.stack`/`c.angleMode`/`c.displayMode`/`c.dir`) and `get_vars` reads
  `ctx().dir`, so the live consumed set is exactly the documented four —
  but a key added to / dropped from the consumed shape without a matching
  header edit (or vice versa) would drift silently, the same class as
  R-014/R-015/R-016/R-018 (the header is the side that rots). Verified no
  drift currently: documented set == consumed set == {stack, angleMode,
  displayMode, dir}.
- **Fix.** Test-only. Added a `session363:` block in
  `tests/test-chatbot-parse.mjs` (+9 pins) that derives the live consumed
  context-key set by running every registry handler against a recording
  `_getContext()` proxy (a Get trap fires once per `ctx.<key>` access),
  parses the documented keys from the header's `getContext(): { ... }`
  block, and asserts the two sets are equal both directions (plus a
  `>= 4` extraction floor). No source change — the header was already
  correct; this pins it so it can't silently under/over-list the shape.
- **Confidence.** high — probed live: the handlers read exactly
  `angleMode`/`dir`/`displayMode`/`stack`, no handler threw under the
  no-op tools proxy.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 6944 passed / 0 failed (baseline 6935). With the
  `tools` bag (R-018) and `getContext()` shape (R-019) both pinned, the
  chat-bot.js header's calculator-side contract is fully drift-guarded.

### R-020  `persist.js` file-header "Encoding rules" block was unguarded against the live `encode()` wire shape

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-013..R-019 — the file-header is the side that rots).
- **Where.** `www/src/rpl/persist.js` — file-header "Encoding rules"
  comment (~:14-24); the encoder is `encode()` (~:46-66), public via
  `encodeValue()` (~:89).
- **What.** The header documents the on-disk wire shape that both the
  localStorage autosave and the `.json` export/import round-trip
  through: the `__t` tag strings (`bigint`/`decimal`/`map`) and the
  Directory encoding (`type:'directory'`, `name`, `entries`, parent
  back-pointer dropped). The existing persist tests round-trip these
  *values* through `snapshot()`/`rehydrate()` but nothing asserted the
  documented tags against what `encode()` actually emits — so a tag
  renamed on one side, or a header gone stale after a new encoded type
  lands, would drift silently and corrupt every previously-saved
  snapshot on decode. Verified no drift currently: documented tag set ==
  emitted tag set == {bigint, decimal, map}; Directory shape matches.
- **Fix.** Test-only. Added a `session369:` block in
  `tests/test-persist.mjs` (+17 pins) that derives the emitted tag set
  live (`encodeValue()` on a representative bigint / Decimal / Map), the
  documented tag set from the header text (`/__t:\s*'(\w+)'/`), and
  asserts the two are equal in both directions (plus a `>= 3`
  extraction floor and the three tags by name); pins the Directory wire
  shape on both sides too (`type:'directory'`, name + entries kept,
  parent dropped, `entries.__t === 'map'`, and the header documents
  each). No source change.
- **Confidence.** high — probed all arms live; `encodeValue` emits
  exactly `{__t:'bigint'|'decimal'|'map'}` and the Directory
  `{type:'directory', name, entries}` with `parent` absent.
- **Status.** **resolved 2026-06-17 (code-review).** `tests/test-persist.mjs`
  is a standalone file (own counter + `process.exit`, not in the
  `test-all.mjs` aggregate), so it runs separately: `node
  tests/test-persist.mjs` → all passed (66 → 83, +17); `node
  tests/test-all.mjs` → 6998 passed / 0 failed (unchanged, as expected).
  - **2026-06-17 follow-up (session416).** session369 pinned only the
    *encode()* side; the documented `decode()` direction — the inverse the
    header's "Encoding rules" block also covers, run on every localStorage
    load and `.json` import — had no direct pin. `decodeValue` had ZERO test
    callers; decode was exercised only indirectly through snapshot/rehydrate
    round-trips, so the per-tag reconstruction contract was never positively
    asserted. A refactor dropping a tag arm, ceasing to recurse into
    Map/array/plain-object bodies, or coercing a passthrough primitive would
    corrupt every saved snapshot on load yet pass green. Added a `session416:`
    block in `tests/test-persist.mjs` (+15 pins): each documented tag
    (`bigint`→BigInt, `decimal`→Decimal, `map`→Map) decodes to its runtime
    type, recursion through map values / array elements / plain-object members,
    null/undefined/primitive passthrough, the Directory encode→decode
    round-trip (type + entries Map kept, parent absent — caller relinks), and
    per-tag round-trip identity. Probed all arms live first. No source change.
    `node tests/test-persist.mjs` → all passed (83 → 98, +15); `node
    tests/test-all.mjs` → 7401 passed / 0 failed (unchanged, as expected —
    standalone file). With both directions now pinned, the persist.js
    "Encoding rules" header contract is fully drift-guarded.

### R-021  `stack.js` file-header push-coercion contract was unguarded; `setPushCoerce` had zero test callers

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-013..R-020 — a documented invariant with no pin).
- **Where.** `www/src/rpl/stack.js` — file-header "Push-time coercion
  hook" comment (~:5-17); `push` (~:52), `pushMany` (~:57),
  `setPushCoerce` (~:19), and the `dup`/`rot`/`over` internal
  `_items.push` paths.
- **What.** The header documents a precise behavioral invariant: `push`
  runs the installed `_pushCoerce` hook (APPROX mode collapses
  Integer/Rational/purely-numeric Symbolic to Real on entry), while
  `pushMany` and the internal stack ops (DUP/ROT/OVER) deliberately
  BYPASS the hook (they move values already on the stack rather than
  introducing fresh ones), and "EXACT mode makes this a true no-op." But
  `setPushCoerce` had ZERO test callers anywhere in the suite — the push
  vs pushMany asymmetry, the dup bypass, the non-function reset guard,
  and the EXACT no-op were all unpinned, so a refactor routing pushMany
  through the hook, dropping it from push, or removing the
  `typeof fn === 'function'` reset guard would pass green while
  contradicting the header. Same coverage-asymmetry class as R-017
  (cycleCoordMode unpinned while its sibling was pinned).
- **Fix.** Test-only. Added a `session376:` block in
  `tests/test-stack-ops.mjs` (+5 pins): EXACT-default push is a no-op
  (live ops.js hook), then a sentinel-returning probe makes the bypass
  observable — `push` applies it, `pushMany` and `dup` bypass it — and
  `setPushCoerce(non-function)` resets to identity. The non-function
  reset doubles as the restore so the module-global probe does not leak
  into later-running test files (verified: the four files after
  test-stack-ops still pass). Probed all arms live first. No source
  change.
- **Confidence.** high — `grep -rl setPushCoerce tests/` returned no
  hits before this run; probed all five arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7047 passed / 0 failed (baseline 7042).
  - **2026-06-17 follow-up (session408).** session376 pinned only the
    push-vs-pushMany/dup *asymmetry*, with a sentinel hook that it then
    resets to identity — so the actual APPROX-collapse *contract* (the
    cross-file invariant: the ops.js hook ~17222 consults state.js
    `getApproxMode()` per call and collapses Integer/Rational + a
    free-variable-free numeric Symbolic to Real on entry, while leaving
    `X+1` and the don't-touch types alone) was never positively exercised
    by the live hook. A refactor narrowing the collapse to Integer-only,
    dropping the per-call mode read, or folding a free-variable Symbolic
    would have passed green. Added a `session408:` block in
    `tests/test-stack-ops.mjs` (+8 pins) *before* the session376 block
    (which permanently resets the hook to identity), so the live ops.js
    hook is still installed; it flips to APPROX, pins Integer→Real,
    Rational(1/4)→Real 0.25 (exact) + non-terminating 1/3→Real,
    Symbolic(1/4)→Real 0.25, Symbolic(X+1) stays Symbolic, Complex and
    BinaryInteger untouched, then flips back to EXACT and pins the very
    next push is a no-op again (per-call mode read), restoring the suite
    default. Probed all arms live first. No source change. `node
    tests/test-all.mjs` → 7351 passed / 0 failed (baseline 7343).

### R-022  `state.js` WORDSIZE_* bounds had zero test callers; STWS clamp was pinned only with magic numbers

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-017/R-021 — a documented invariant with the constants
  unpinned).
- **Where.** `www/src/rpl/state.js` — `WORDSIZE_MIN`/`WORDSIZE_MAX`/
  `WORDSIZE_DEFAULT` (~:23-25), `setWordsize` clamp (~:314-323); the STWS
  op coercion in `www/src/rpl/ops.js` (~:5320-5329). The existing STWS
  clamp pins live in `tests/test-binary-int.mjs` (~:144-157).
- **What.** The header documents "HP50 range 1..64, default 64" and the
  clamp uses `WORDSIZE_MIN`/`WORDSIZE_MAX`, but the exported constants had
  zero test callers — the clamp was pinned only with literals (`STWS 100`
  → 64, `STWS 0` → 1), so nothing tied the clamp to the constants, nothing
  showed the MIN/MAX boundaries are *inclusive* (accepted unclamped), and
  STWS's Integer/BinaryInteger accept arms (only Real was exercised), its
  non-numeric reject, and `setWordsize`'s own non-finite throw were all
  unpinned. A refactor changing a bound, making a boundary exclusive, or
  dropping a coercion arm could pass green. Verified no drift currently:
  constants are 1/64/64, both boundaries accepted unclamped, Integer/BinInt
  accept, String → 'Bad argument type', `setWordsize(NaN)` throws.
- **Fix.** Test-only. Added a `session383:` block in
  `tests/test-binary-int.mjs` (+14 pins) after the STWS clamp block:
  imports the three constants and asserts their values + relationships
  (`DEFAULT === MAX`, `MIN < MAX`), ties the clamp to them (MAX/MIN
  accepted unclamped, MAX+1/MIN-1 clamp back to the constant — not a
  hard-coded 64/1), pins STWS's Integer and BinaryInteger accept arms and
  the String reject, and `setWordsize`'s non-finite `STWS needs a number`
  throw. No source change.
- **Confidence.** high — `grep -rl WORDSIZE_MIN tests/` returned no hits
  before this run; probed all arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7096 passed / 0 failed (baseline 7082).

### R-023  `state.js` REAL_MAX_EXP_* bounds had zero callers for MAX; STMXE/setRealMaxExp reject arms were unpinned

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-017/R-021/R-022 — a documented invariant with the
  constants/reject arms unpinned). The R-022 queued sibling, one
  constant family over (WORDSIZE → REAL_MAX_EXP).
- **Where.** `www/src/rpl/state.js` — `REAL_MAX_EXP_DEFAULT`/
  `REAL_MAX_EXP_MIN`/`REAL_MAX_EXP_MAX` (~:35-37), `setRealMaxExp`
  range/integrality throw (~:700-705); the STMXE op coercion in
  `www/src/rpl/ops.js` (~:8099-8109). Existing STMXE pins live in
  `tests/test-numerics.mjs` (session044, ~:1068-1098).
- **What.** The header documents "HP50 BCD used 499; default 999;
  floor 10; decimal.js cap 9e15," and STMXE rejects out of range
  (it does NOT clamp, unlike STWS). But `REAL_MAX_EXP_MAX` had zero
  test callers (only MIN/DEFAULT were imported), the *inclusive* MIN/MAX
  boundaries were never shown accepted-unclamped, only the below-MIN
  reject was pinned (and only that it threw, not its message), and the
  above-MAX reject, the non-integer-Real reject (integrality arm,
  distinct from range), the non-numeric `Bad argument type` reject, and
  `setRealMaxExp`'s own distinct range-message throw were all unpinned.
  A refactor changing a bound, making a boundary exclusive, collapsing
  the two STMXE reject messages, or dropping the integrality arm could
  pass green. Verified no drift: constants 10/9e15/999, both boundaries
  accepted unclamped, MAX+1/MIN-1 → 'Bad argument value', non-integer
  Real → 'Bad argument value', String → 'Bad argument type',
  setRealMaxExp(5)/(500.5) → the range message.
- **Fix.** Test-only. Added a `session390:` block in
  `tests/test-numerics.mjs` (+13 pins) after the session044 STMXE reject
  block: imports `REAL_MAX_EXP_MAX`, asserts the three constants + their
  ordering, ties the inclusive MIN/MAX accepts to the constants (not
  literals), pins the above-MAX/below-MIN/non-integer/non-numeric STMXE
  rejects with their distinct messages, and the `setRealMaxExp`
  function-level range throw. No source change.
- **Confidence.** high — `grep -rl REAL_MAX_EXP_MAX tests/` returned no
  hits before this run; probed all arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7202 passed / 0 failed (baseline 7189).

### R-024  `state.js` ANGLE_MODES frozen list + setAngle reject/normalize arms were unpinned while the sibling COORD_MODES was pinned

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-017 — a documented invariant pinned for one sibling
  but not the other). The R-023 queued sibling.
- **Where.** `www/src/rpl/state.js` — `ANGLE_MODES` (~:12),
  `setAngle` normalize/reject/no-op arms (~:228-236); the existing
  `cycleAngle` order pin lives in `tests/test-numerics.mjs` (~:184).
- **What.** The file-header documents `setAngle` validating against the
  frozen `ANGLE_MODES` list and `cycleAngle` indexing through it. The
  `cycleAngle` block pins the `RAD → DEG → GRD → RAD` cycle order, but
  nothing tied that to the `ANGLE_MODES` constant, showed the list frozen,
  or exercised `setAngle`'s uppercase normalization and unknown-mode
  reject — even though the structurally-identical sibling `COORD_MODES` /
  `setCoordMode` got exactly those pins via R-017/session349. A refactor
  reordering `ANGLE_MODES`, dropping the freeze, or changing `setAngle`'s
  normalize/reject guard could pass green. Verified no drift currently:
  order `["RAD","DEG","GRD"]`, frozen, `'deg'` normalizes to `'DEG'`,
  `'BOGUS'` → `Unknown angle mode: BOGUS` leaving `angle` unchanged.
- **Fix.** Test-only. Added a `session397:` block in
  `tests/test-numerics.mjs` (+5 pins) before the session349 COORD_MODES
  block: `ANGLE_MODES` order + frozen, `setAngle` uppercase normalization,
  the unknown-mode reject with its message, and that a rejected set leaves
  `angle` unchanged. Imported `ANGLE_MODES`. Probed all arms live first.
  No source change.
- **Confidence.** high — `grep -rl ANGLE_MODES tests/` returned no hits
  before this run; probed all arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7259 passed / 0 failed (baseline 7254).

### R-025  `state.js` forwards realMaxExp to `Decimal.set()` with the wrong config keys — the documented exponent-cap forwarding is a silent no-op

- **Classification.** RPL (latent source bug; doc↔code drift where the
  *code* — not the comment — is the wrong side, unlike R-013..R-024).
- **Where.** `www/src/rpl/state.js` — boot line `Decimal.set({ MAX_EXP:
  REAL_MAX_EXP_DEFAULT, MIN_EXP: -REAL_MAX_EXP_DEFAULT })` (~:220) and
  `setRealMaxExp` body `Decimal.set({ MAX_EXP: n, MIN_EXP: -n })` (~:707);
  the documented intent is in the file-header (~:28-29), the `realMaxExp`
  state comment (~:166-167), and the `setRealMaxExp` JSDoc (~:695).
- **What.** All three doc sites promise realMaxExp is "forwarded to
  `Decimal.set()` so arithmetic that exceeds the configured boundary"
  overflows (to ±Infinity / underflows to 0). But the vendored
  decimal.js `config()` (`www/src/vendor/decimal.js/decimal.mjs`
  ~:4198-4239) only honours the keys
  `precision/rounding/toExpNeg/toExpPos/maxE/minE/modulo/crypto` — it
  iterates that fixed list and reads `obj[key]`, so unrecognised keys are
  **silently skipped** (no throw). `MAX_EXP`/`MIN_EXP` are not those keys
  (the correct names are `maxE`/`minE`), so every `Decimal.set()` call in
  state.js is a no-op: `Decimal.maxE`/`minE` stay at the EXP_LIMIT default
  (±9e15) regardless of realMaxExp. MAXR/MINR/RCMXE still appear to work
  because they read `state.realMaxExp` directly (session044), masking the
  defect — but actual Real arithmetic never overflows at the configured
  boundary.
- **Why.** Latent correctness bug: a user who sets a small STMXE cap
  expecting HP50-style overflow gets none; arithmetic silently runs to the
  decimal.js hard limit instead. Currently invisible because no test
  exercises post-cap arithmetic and MAXR/MINR bypass the forwarding.
- **Fix.** One-line each: `{ MAX_EXP: n, MIN_EXP: -n }` →
  `{ maxE: n, minE: -n }` (and the boot line likewise). **NOT a drive-by:**
  the boot call runs at module load, so fixing it turns on ±999 overflow
  suite-wide; this is a real behavior change that must be landed
  deliberately with a full-suite run (and an HP50-fidelity check on whether
  Reals should overflow at 1e±REAL_MAX_EXP) by the RPL lane — hence filed,
  not fixed, in this code-review slot. A passing guard cannot be added
  pre-fix without entrenching the bug; once fixed, pin that
  `setRealMaxExp(k)` makes `1e_k_ × 1e_k_` overflow to Infinity (and the
  symmetric underflow to 0), with `resetRealMaxExp()` restoring it.
- **Confidence.** high — probed live (repo-rooted, CAS-free): the shared
  `Decimal` singleton has `maxE === 9e15` both before and after
  `setRealMaxExp(100)`, while a direct `Decimal.set({ maxE: 100 })` does
  make `1e60 × 1e60 === Infinity`; `config()` source confirms the
  key-allowlist skip.
- **Owner.** `rpl5050-rpl-programming` (state.js arithmetic-boundary
  behavior).
- **Age.** new (filed 2026-06-17 code-review). **Status.** open,
  `[deferred — needs deliberate behavior-change run]`.

### R-026  `units.js` file-header canonical-uexpr contract was unguarded; `normalizeUexpr` had zero direct test callers

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-013..R-024 — a documented invariant with no direct
  pin).
- **Where.** `www/src/rpl/units.js` — file-header "The unit expression
  is a canonical, frozen array …" block (~:8-12) and `normalizeUexpr`
  (~:105-116); the public composers `multiplyUexpr`/`inverseUexpr`/
  `divideUexpr`/`powerUexpr` (~:118-121) all route through it.
- **What.** The header documents the canonical-uexpr contract:
  `normalizeUexpr` merges duplicate symbols, drops zero-exponent factors,
  sorts alphabetically by symbol, and returns a deep-frozen array (each
  `[symbol, exponent]` tuple frozen + the outer array frozen). The symbol
  is imported into `tests/test-units.mjs` but **never called directly** —
  every prior pin reaches it only through `parseUnitExpr` /
  `multiplyUexpr` / `inverseUexpr` / `powerUexpr`, all of which feed it
  factor lists that are already single-symbol or already sorted. So the
  duplicate-merge, the merge-to-zero drop, the sort of an out-of-order
  multi-symbol input, and the deep freeze were never positively exercised
  on a raw input — a refactor dropping the merge, the zero-filter, the
  sort, or either `Object.freeze` would pass every prior pin. Verified no
  drift: merge `[m,1]·[m,2]→[m,3]`, `[m,1]·[m,-1]→[]`, `[s,-2][kg,1][m,1]`
  sorts to `kg,m,s`, both freezes hold (mutation throws in the ESM strict
  context), unknown symbol throws, `[]`→frozen empty.
- **Fix.** Test-only. Added a `session422:` block in
  `tests/test-units.mjs` (+8 pins) after the session147 `^`-zero-exponent
  block, calling `normalizeUexpr` directly on raw factor lists to pin each
  documented arm. Probed all arms live first. No source change.
- **Confidence.** high — `grep -n "normalizeUexpr(" tests/` returned no
  direct-call hits before this run; probed all arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7445 passed / 0 failed (baseline 7437).

### R-027  `algebra.js` AST-constructor contract (freeze + Fn in-ctor uppercasing + value/name coercion) was unguarded directly

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-013..R-026 — a documented invariant with no direct
  pin).
- **Where.** `www/src/rpl/algebra.js` — file-header "all nodes are plain
  frozen objects" block (~:5-6), the `Num`/`Var`/`Neg`/`Bin` ctors
  (~:27-39), and the `Fn` ctor + its JSDoc ("Uppercasing happens inside
  the ctor so callers can pass either case", ~:40-48).
- **What.** The header documents that every AST node is a plain frozen
  object, and the `Fn` JSDoc that name-uppercasing happens *inside the
  ctor*. But every prior test reaches the ctors only structurally
  (`astEqual` round-trips, `parseAlgebra` output) — the freeze, the
  `Num`→`Number` / `Var`→`String` value coercion, the `Fn` args-array
  freeze-of-a-copy, and the in-ctor uppercasing were never asserted
  directly. The lone uppercasing pin (`tests/test-algebra.mjs` ~:270)
  feeds `parseAlgebra('sin(X)')`, so a refactor moving the case-fold from
  the `Fn` ctor to the parser would pass that pin while breaking
  `Fn('sin', …)` and every non-parser caller; likewise a refactor
  dropping an `Object.freeze` or a coercion would pass green. Verified no
  drift: `Num('3.5').value === 3.5` (NaN on non-numeric), `Var(42).name
  === '42'`, `Fn('sin', a).name === 'SIN'`, every node frozen, `Fn.args`
  a frozen copy (input-array mutation does not leak in).
- **Fix.** Test-only. Added a `session429:` block in
  `tests/test-algebra.mjs` (+9 pins) after the session197 PMINI block,
  calling the ctors directly (imported as `AstNum`/`AstVar`/`AstNeg`/
  `AstBin`/`AstFn`) to pin each documented arm: value/name coercion, the
  freeze (mutation throws, value unchanged), `Fn` in-ctor uppercasing,
  and the `Fn` args freeze-of-a-copy. Probed all arms live first. No
  source change.
- **Confidence.** high — `grep "isFrozen" tests/` returned no hits on the
  algebra AST ctors before this run; probed all arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7516 passed / 0 failed (baseline 7507).

### R-028  `pretty.js` file-header Box-model contract was unguarded; `layoutAst` was imported but never called

- **Classification.** RPL (test-coverage gap on a documented contract;
  same class as R-013..R-027 — a documented invariant with no direct
  pin).
- **Where.** `www/src/rpl/pretty.js` — file-header "Everything is a Box:
  { width, ascent, descent, draw(x, baselineY) }" block (~:7-16) and the
  `rowBox` helper (~:96-113); the public entry is `layoutAst` (~:318).
- **What.** The header documents the Box model: every layout node is a
  Box `{ width (always positive), ascent, descent, draw(x, baselineY) →
  SVG fragment string }`, and when boxes are placed in a row their
  baselines align so the row's ascent/descent are the **max** of the
  children's (width is their sum). `layoutAst` is imported into
  `tests/test-algebra.mjs` but **never called** — it is only
  `typeof`-asserted (~:581) and destructured-but-unused (~:1517); every
  other pretty pin goes through `astToSvg`, which exposes only the outer
  `width`/`height`. So the Box four-member shape, `draw` returning a
  string, and — critically — the row max-of-children rule were never
  positively asserted: a refactor changing `rowBox`'s ascent/descent
  from `Math.max` to a sum, or dropping a Box member, would pass every
  `astToSvg` pin (the outer height for an equal-height row is unaffected
  by max-vs-sum only when all children match). Verified no drift: a Box
  has numeric width/ascent/descent + a `draw` fn returning `<text…>`;
  `layoutAst('1/2 = 3')` takes the fraction child's ascent/descent (the
  tallest), which is < the sum of the children's; `layoutAst('-X').width
  === 2 × layoutAst('X').width` (row width = sum).
- **Fix.** Test-only. Added a `session436:` block in
  `tests/test-algebra.mjs` (+7 pins) after the pretty.js smoke-test
  block, calling `layoutAst` directly to pin the Box shape, the
  positive-width and string-`draw` arms, the row max-of-children
  ascent/descent (fraction dominates the row, and the row ascent is < the
  sum), and the row width-is-sum arm. Probed all arms live first. No
  source change.
- **Confidence.** high — `grep -n "layoutAst" tests/` showed only a
  `typeof` check and an unused destructure before this run; probed all
  arms live.
- **Status.** **resolved 2026-06-17 (code-review).** `node
  tests/test-all.mjs` → 7594 passed / 0 failed (baseline 7587).

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
