CREATE TABLE gdb_provisioning(
 organisation text NOT NULL CHECK(organisation='GAITA-DE-BOTO'),
 operation text NOT NULL,
 request text NOT NULL,
 state text NOT NULL CHECK(state IN('pending','record-created','inactive')),
 pupil text NOT NULL,
 PRIMARY KEY(organisation,operation)
);
