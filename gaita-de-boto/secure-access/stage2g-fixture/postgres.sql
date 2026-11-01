-- INACTIVE synthetic Stage 2G schema. Not an operational migration.
CREATE TABLE IF NOT EXISTS gdb_g_config(environment text PRIMARY KEY, fingerprint text NOT NULL);
CREATE TABLE IF NOT EXISTS gdb_g_admission(environment text PRIMARY KEY, subject text NOT NULL, pupil text NOT NULL,
 revision integer NOT NULL, status text NOT NULL CHECK(status IN ('inactive','active','revoked')), expires bigint NOT NULL, operations text NOT NULL);
CREATE TABLE IF NOT EXISTS gdb_g_revision(environment text PRIMARY KEY, generation uuid NOT NULL, number integer NOT NULL, dirty uuid, facets text NOT NULL);
CREATE TABLE IF NOT EXISTS gdb_g_job(environment text NOT NULL, session uuid NOT NULL, manifest text NOT NULL, manifest_hash text NOT NULL,
 phase text NOT NULL CHECK(phase IN ('queued','leased','sent','attention','confirmed')), worker text, fence integer NOT NULL DEFAULT 0,
 lease bigint NOT NULL DEFAULT 0, receipt text, iv bytea NOT NULL, cipher bytea NOT NULL, tag bytea NOT NULL,
 PRIMARY KEY(environment,session), UNIQUE(environment,manifest_hash));
CREATE TABLE IF NOT EXISTS gdb_g_nonce(environment text NOT NULL, key_id text NOT NULL, purpose text NOT NULL, nonce uuid NOT NULL,
 request_hash text NOT NULL, PRIMARY KEY(environment,key_id,purpose,nonce));
CREATE TABLE IF NOT EXISTS gdb_g_operation(environment text NOT NULL, operation uuid NOT NULL, event text NOT NULL, request_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('dirty','complete')), proof text, PRIMARY KEY(environment,operation));
CREATE TABLE IF NOT EXISTS gdb_g_read(environment text NOT NULL, id uuid NOT NULL, handle_hash text NOT NULL UNIQUE, actor text NOT NULL,
 client_session uuid NOT NULL, operation text NOT NULL, session uuid, admission_revision integer NOT NULL, version text NOT NULL,
 expires bigint NOT NULL, state text NOT NULL CHECK(state IN ('pending','dispatched','ready','consumed')), request text,
 result_hash text, iv bytea, cipher bytea, tag bytea, PRIMARY KEY(environment,id));
