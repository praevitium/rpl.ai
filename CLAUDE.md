# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

These are house conventions, not project documentation. Follow them so they don't have to be repeated each session.

**This is a living document.** When the user corrects you on style or working habits — especially something they've said more than once — add it here (and to memory) so it stops needing to be repeated.

## Code style

- **Match the surrounding file** for indentation, naming, and idiom — mirror it rather than importing your own defaults. (Comments are the exception: keep them sparse even where older code is dense — see below.) There is no Prettier/ESLint/EditorConfig; formatting is by hand.
- **2-space indentation, single quotes, semicolons.** Single quotes are the default for strings (double only when the string contains a single quote).
- **ES modules throughout**, with explicit file extensions in import paths (`./foo.js`, `./bar.mjs`). Prefer named `export function` / `export const` over default exports.
- **`camelCase`** for functions and variables, **`PascalCase`** for constructors and type/value factories, **`UPPER_SNAKE`** for module-level constants.
- **Keep comments sparse.** Favor self-explanatory code — clear names, small functions — over comments. Comment only when the *why* is genuinely non-obvious (a workaround, a trade-off, a surprising constraint); never narrate what the code already says. Redundant comments waste tokens and go stale and misleading when the code changes underneath them. If a comment can be retired by making the code clearer, do that instead. Don't feel obliged to reproduce the dense commenting of older files.
- Keep functions small and single-purpose; reach for a helper before duplicating logic.

## Working conventions

- **Edit in place; don't recreate.** Prefer modifying an existing file over adding a new one. Don't leave `.bak` copies, commented-out dead code, or "old" alongside "new" — delete what you replace (git is the history).
- **Keep diffs minimal and scoped** to the task. Don't opportunistically reformat, rename, or "tidy" code you aren't otherwise changing — it buries the real change and breaks `git blame`.
- **Don't add dependencies, build steps, or frameworks** to solve something the existing code already does. Justify any new dependency explicitly before reaching for it.
- **Run the test suite before calling work done**, and report the actual result. If tests fail or you skipped a step, say so plainly rather than implying success.
- **Don't touch generated or gitignored files** by hand — fix the generator instead.
- **No emojis** in code, comments, or commit messages unless they already exist in the file you're editing.

## Commits

- Work on the working branch; open PRs against the main branch — don't commit straight to it.
- Commit only when asked.
- After every commit, **push** the working branch.
- Commit subjects are **short and lowercase**, imperative mood, no scope prefix, no trailing period (e.g. `fix cursor`, `add katex support`). Roughly four words; subject line only — never add a description body or trailers.
- Keep each commit to one logical change.
- When asked to "commit as you go", commit each coherent chunk as it lands and push at the end.
