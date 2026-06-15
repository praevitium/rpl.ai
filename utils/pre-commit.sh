#!/usr/bin/env bash
# scripts/pre-commit.sh — minimal pre-commit gate for RPL5050.
#
# Runs the cheap 5-ms sanity smoke first (so almost-everything-broken
# changes fail fast), then the full test suite if --full is given.
#
# Usage:
#   bash scripts/pre-commit.sh           # sanity smoke only (~5 ms)
#   bash scripts/pre-commit.sh --full    # sanity + full suite
#   bash scripts/pre-commit.sh --persist # also include persist suite
#
# Exit codes:
#   0  — every gate green.
#   1  — at least one gate red.  Stderr says which.
#
# Wire this in as a real git hook with:
#   ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
#   chmod +x scripts/pre-commit.sh

set -euo pipefail

# Resolve repo root from this script's location so the script works from
# any cwd (git hook invokes from .git/hooks).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

WANT_FULL=0
WANT_PERSIST=0
for arg in "$@"; do
  case "$arg" in
    --full)    WANT_FULL=1 ;;
    --persist) WANT_PERSIST=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "pre-commit: unknown arg '$arg'" >&2
      exit 2
      ;;
  esac
done

# Sanity smoke — always run; cheapest gate.  Fails the hook fast if
# basic Stack / parser / EVAL plumbing is broken.
echo "[pre-commit] sanity smoke …"
if ! node tests/sanity.mjs > /tmp/rpl5050-precommit-sanity.log 2>&1; then
  echo "[pre-commit] FAIL — sanity smoke failed.  Output:" >&2
  cat /tmp/rpl5050-precommit-sanity.log >&2
  exit 1
fi
echo "[pre-commit] sanity smoke OK"

if [ "$WANT_FULL" -eq 1 ]; then
  echo "[pre-commit] full suite …"
  if ! node tests/test-all.mjs > /tmp/rpl5050-precommit-all.log 2>&1; then
    echo "[pre-commit] FAIL — full suite failed.  Tail of output:" >&2
    tail -40 /tmp/rpl5050-precommit-all.log >&2
    exit 1
  fi
  echo "[pre-commit] full suite OK"
fi

if [ "$WANT_PERSIST" -eq 1 ]; then
  echo "[pre-commit] persist suite …"
  if ! node tests/test-persist.mjs > /tmp/rpl5050-precommit-persist.log 2>&1; then
    echo "[pre-commit] FAIL — persist suite failed.  Tail of output:" >&2
    tail -40 /tmp/rpl5050-precommit-persist.log >&2
    exit 1
  fi
  echo "[pre-commit] persist suite OK"
fi

echo "[pre-commit] all requested gates green"
exit 0
