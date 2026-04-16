#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-$PWD}"
TARGET_REF="${2:-origin/main}"
TARGET_BRANCH="${3:-${TARGET_REF#origin/}}"
PREV_SHA=""

cd "$APP_DIR"

if [[ ! -f "docker-compose.yml" ]]; then
  echo "docker-compose.yml not found in ${APP_DIR}"
  exit 1
fi

PREV_SHA="$(git rev-parse HEAD)"
echo "Current commit: ${PREV_SHA}"
echo "Deploying ref: ${TARGET_REF}"

rollback() {
  if [[ -n "$PREV_SHA" ]]; then
    echo "Rolling back to ${PREV_SHA}"
    git checkout -q "$PREV_SHA" || true
    docker compose up -d --build --remove-orphans || true
  fi
}

# Backup database before changing anything.
bash scripts/backup-db.sh "$APP_DIR"

git fetch --prune origin
if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  git checkout -q "${TARGET_BRANCH}"
else
  git checkout -q -b "${TARGET_BRANCH}" "${TARGET_REF}"
fi
git merge --ff-only "$TARGET_REF"

set +e
docker compose up -d --build --remove-orphans
DEPLOY_EXIT=$?
set -e

if [[ "$DEPLOY_EXIT" -ne 0 ]]; then
  echo "Deployment failed during compose up."
  rollback
  exit 1
fi

# Health check through reverse proxy endpoint.
HEALTHY=0
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1/api/auth/check" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 4
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo "Health check failed after deployment."
  rollback
  exit 1
fi

echo "Deployment successful at commit: $(git rev-parse HEAD)"
