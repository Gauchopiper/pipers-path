# PostgreSQL migration procedure (candidate, not applied to production)

The sole authoritative project handover is the existing Google document.

1. Select a dedicated Gaita database/schema and reviewed migration role. Do not
   share an application superuser or other organisation's database credentials.
2. Back up the database and test restoration before changing a populated database.
3. Run `postgresStore(pool).migrate()` with the approved pg connection. Migrations
   001 and additive 002 are transactional, serialised by a PostgreSQL advisory lock, and recorded
   with a SHA-256 checksum. A changed checksum or unknown version fails closed.
4. Normal requests must run with a separate least-privilege role allowed only
   the required table/sequence operations; they must not create/drop schemas.
5. Schema 001 is for a new external-access store. It neither reads nor modifies
   the legacy SQLite fixtures, pupil workbook, recording folder or IndexedDB.
   No production external-access database exists as a result of this code.
6. Keep operation receipts and audit history during application rollback. Do not
   run destructive down migrations or restore an old snapshot while writers are
   active: that could forget completed operations. Freeze access, preserve new
   receipts and reconcile uncertain operations before a reviewed restore.

`postgres.test.cjs` checks SQL against PGlite's PostgreSQL WASM engine. It does not
certify network Pool behaviour, multi-process contention, backup/restore, Cloud
SQL IAM/TLS, scaling, latency, connection loss or infrastructure permissions.
Those remain required gates on a nonproduction PostgreSQL instance.

The access store serialises mutations per organisation using a locked row;
sessions and rate-limit statements have independent atomic operations. Every SQL
transaction uses one acquired pool client. Rate/session expiry cleanup is exposed
as `postgresSessions(...).cleanup()` and requires a scheduled production task.

Migration 002 adds only a recoverable provisioning journal. Migration 001 remains
byte-for-byte unchanged. Journal states describe provisioning milestones, not
current access activation. Inspect the access record for current active/revoked state.
Keep journal rows on rollback; no automatic pupil deletion is performed.
