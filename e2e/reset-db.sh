#!/usr/bin/env bash
# Recreate the LOCAL E2E database from migrations + development fixtures so every run starts
# isolated (community reports stay active for their TTL and would otherwise corroborate across runs).
# Refuses anything that is not a local database named *_e2e.
set -euo pipefail
ADMIN_URL="${E2E_ADMIN_DATABASE_URL:-postgres://postgres@127.0.0.1:5432/postgres}"
DB="${E2E_DB_NAME:-reality_e2e}"
case "$DB" in *_e2e) ;; *) echo "refusing: database name must end with _e2e" >&2; exit 2;; esac
case "$ADMIN_URL" in *@127.0.0.1*|*@localhost*) ;; *) echo "refusing: E2E reset is local-only" >&2; exit 2;; esac
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
URL="${ADMIN_URL%/*}/$DB"
cd "$(dirname "$0")/../apps/api"
DATABASE_URL="$URL" APP_ENV=development npx tsx scripts/migrate.ts
DATABASE_URL="$URL" APP_ENV=development ALLOW_DEV_FIXTURES=true npx tsx scripts/seed-dev-fixtures.ts
echo "reset $DB"
