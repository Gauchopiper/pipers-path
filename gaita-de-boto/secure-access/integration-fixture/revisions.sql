-- Isolated synthetic revision coordinator; not a migration of Google/production data.
CREATE TABLE IF NOT EXISTS gdb_fixture_view_epoch (
 organisation text PRIMARY KEY, generation uuid NOT NULL,
 catalogue_revision integer NOT NULL DEFAULT 0, dirty_operation uuid
);
CREATE TABLE IF NOT EXISTS gdb_fixture_view_state (
 organisation text NOT NULL, pupil text NOT NULL,
 revision integer NOT NULL DEFAULT 0, access_revision integer NOT NULL DEFAULT 0,
 dirty_operation uuid, facets text NOT NULL,
 PRIMARY KEY(organisation,pupil)
);
CREATE TABLE IF NOT EXISTS gdb_fixture_view_operation (
 organisation text NOT NULL, operation uuid NOT NULL, pupil text NOT NULL,
 event text NOT NULL, request text NOT NULL, state text NOT NULL,
 source_digest text, after_token text,
 PRIMARY KEY(organisation,operation)
);
CREATE TABLE IF NOT EXISTS gdb_fixture_view_restore (
 organisation text NOT NULL, operation uuid NOT NULL, generation uuid NOT NULL,
 PRIMARY KEY(organisation,operation)
);
