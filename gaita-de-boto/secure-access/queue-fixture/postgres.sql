-- Isolated fixture tables. Never applied by production migrations.
CREATE TABLE IF NOT EXISTS gdb_fixture_queue_nonce (
 role text NOT NULL, nonce uuid NOT NULL, PRIMARY KEY(role,nonce)
);
CREATE TABLE IF NOT EXISTS gdb_fixture_queue_job (
 id uuid PRIMARY KEY, session uuid UNIQUE NOT NULL,
 immutable text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','leased','retry','manual','blocked','awaiting-audio','confirmed')),
 attempts integer NOT NULL DEFAULT 0, fence integer NOT NULL DEFAULT 0,
 worker text, lease bigint NOT NULL DEFAULT 0, available bigint NOT NULL,
 reason text, result text
);
CREATE INDEX IF NOT EXISTS gdb_fixture_queue_due ON gdb_fixture_queue_job(available,id);
CREATE TABLE IF NOT EXISTS gdb_fixture_queue_stage (
 job uuid PRIMARY KEY REFERENCES gdb_fixture_queue_job(id),
 iv bytea NOT NULL, cipher bytea NOT NULL, tag bytea NOT NULL, expires bigint NOT NULL
);
