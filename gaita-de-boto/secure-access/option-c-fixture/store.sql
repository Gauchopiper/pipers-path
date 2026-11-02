-- Disposable local SQLite fixture schema. Never a production migration.
CREATE TABLE IF NOT EXISTS configuration (id INTEGER PRIMARY KEY CHECK(id=1), fingerprint TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admission (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL,
  status TEXT NOT NULL, expires INTEGER NOT NULL, operations TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY, at INTEGER NOT NULL, subject TEXT NOT NULL,
  operation TEXT NOT NULL, decision TEXT NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY CHECK(id=1), generation TEXT NOT NULL,
  number INTEGER NOT NULL, facets TEXT NOT NULL, dirty TEXT);
CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, request TEXT NOT NULL,
  state TEXT NOT NULL, proof TEXT, after_version TEXT);
CREATE TABLE IF NOT EXISTS recordings (session TEXT PRIMARY KEY, submission_hash TEXT NOT NULL,
  manifest TEXT NOT NULL, manifest_hash TEXT NOT NULL, phase TEXT NOT NULL,
  iv BLOB, cipher BLOB, tag BLOB, fence INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER, permit TEXT, revision_operation TEXT NOT NULL, receipt TEXT);
