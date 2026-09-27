#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="mini"
PROJECT_PATH="/Users/me/Code/play/rpl5050"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$(hostname -s)" == "${REMOTE_HOST}" ]]; then
  echo "Error: this script should not be run on ${REMOTE_HOST}."
  exit 1
fi

if [ "$LOCAL_DIR" != "$PROJECT_PATH" ]; then
  echo "Warning: script is not in expected location ($PROJECT_PATH)"
  echo "Local dir: $LOCAL_DIR"
  read -r -p "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

echo "Pulling latest on main and develop branches on ${REMOTE_HOST}..."

ssh "${REMOTE_HOST}" bash <<EOF
set -euo pipefail
cd "${PROJECT_PATH}"

CURRENT=\$(git rev-parse --abbrev-ref HEAD)

for branch in main develop; do
  if git show-ref --verify --quiet "refs/heads/\$branch"; then
    echo "  git pull origin \$branch"
    git checkout "\$branch"
    git pull origin "\$branch"
  else
    echo "  Branch '\$branch' does not exist, skipping."
  fi
done

git checkout develop
EOF

echo "Syncing from ${REMOTE_HOST}:${PROJECT_PATH}/ ..."

rsync -avz --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='target/' \
  "${REMOTE_HOST}:${PROJECT_PATH}/" \
  "${LOCAL_DIR}/"

echo "Done."
