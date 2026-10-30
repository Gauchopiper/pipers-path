#!/usr/bin/env bash
# PREPARED ONLY. Requires separate Owner approval on the selected machine/CI run.
set -euo pipefail
if [[ "${GDB_NATIVE_APPROVED:-}" != DISPOSABLE_FIXTURES_ONLY ]]; then
  echo 'Approval flag missing; no Docker/database action attempted.' >&2
  exit 2
fi
gdb_script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
gdb_pg_image="${GDB_POSTGRES_IMAGE:-postgres:18}"
[[ "$gdb_pg_image" =~ ^(postgres:18|postgres@sha256:[a-f0-9]{64})$ ]] || { echo 'Approved PostgreSQL 18 image or recorded official digest required' >&2; exit 2; }
export GDB_FIXTURE_CONTAINER_NAME="gdb-native-$(date +%s)-${RANDOM}"
gdb_volume="${GDB_FIXTURE_CONTAINER_NAME}-data"
gdb_container_created=0
gdb_volume_created=0
cleanup() {
  if [[ "$gdb_container_created" == 1 ]]; then docker rm -f "$GDB_FIXTURE_CONTAINER_NAME" >/dev/null || true; fi
  if [[ "$gdb_volume_created" == 1 ]]; then docker volume rm "$gdb_volume" >/dev/null || true; fi
}
trap cleanup EXIT
if docker inspect "$GDB_FIXTURE_CONTAINER_NAME" >/dev/null 2>&1 || docker volume inspect "$gdb_volume" >/dev/null 2>&1; then
  echo 'Fixture name collision; existing resources left unchanged.' >&2
  exit 2
fi
docker pull "$gdb_pg_image"
docker volume create --label gdb.fixture=1 "$gdb_volume" >/dev/null
gdb_volume_created=1
docker create --name "$GDB_FIXTURE_CONTAINER_NAME" --label gdb.fixture=1 \
  -e POSTGRES_PASSWORD=gdb-fixture-only -e POSTGRES_DB=gdb_work4_fixture \
  -p 127.0.0.1:55432:5432 -v "${gdb_volume}:/var/lib/postgresql" "$gdb_pg_image" >/dev/null
gdb_container_created=1
docker start "$GDB_FIXTURE_CONTAINER_NAME" >/dev/null
gdb_ready=0
for ((gdb_attempt=0; gdb_attempt<80; gdb_attempt++)); do
  if docker exec -u postgres "$GDB_FIXTURE_CONTAINER_NAME" pg_isready -U postgres -d gdb_work4_fixture >/dev/null; then gdb_ready=1; break; fi
  sleep 0.5
done
[[ "$gdb_ready" == 1 ]] || { echo 'Fixture PostgreSQL not ready' >&2; exit 1; }
# Deliberately public, non-secret password for this isolated synthetic loopback fixture ONLY.
export GDB_FIXTURE_NATIVE_URL='postgresql://postgres:gdb-fixture-only@127.0.0.1:55432/gdb_work4_fixture'
cd "$gdb_script_root/.."
node queue-fixture/postgres.test.cjs
node "$gdb_script_root/native-audit.cjs"
