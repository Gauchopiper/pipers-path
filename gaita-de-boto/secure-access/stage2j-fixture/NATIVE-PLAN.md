# Native gates — BLOCKED, not executed

Environment check found no postgres, pg_ctl, psql or Docker executable and no
server installation in the usual /usr/lib/postgresql, /usr/local/pgsql/bin or
/opt/postgresql locations. No installation, hosted database, port or workflow
was started. The available PGlite engine is one serialised WASM connection.

Future execution requires an already available, explicitly disposable isolated
native environment, a reviewed target marker, Unix-socket-only access and separate
provisioner/runtime logins. Never point this fixture at an operational DSN. This
is a procedure/test plan; it is not an assertion that a native harness ran.

## N01 — independent connections

Install the exact reviewed candidate into a new dedicated database; authenticate
separate worker connections. Queue the one synthetic SID. Hold connection A's
policy/revision locks in a transaction; start B and observe actual blocking.
Commit A's claim and ensure B cannot obtain a second live lease. Also exercise
SKIP LOCKED while a job row is held by a dedicated owner test connection and
verify bounded timeout/cancellation. Expire a lease using the disposable clock
fixture and demonstrate a higher fence; attempt ARM with the stale original.
Race two exact submissions, then conflicting manifests for the same SID; require
one immutable original. Race verifier confirmations and require one credit and
one source nonce. Record all connection identities and transaction outcomes.

## N02 — abrupt disposable-server crash/restart

Only crash a server whose process, data directory and socket belong exclusively
to this test. No shared service or generic system restart. Persist synthetic
encrypted original, source/checkpoint nonce and SENT/DIRTY state. Commit, obtain
an independent query acknowledgement, stop that exact process abruptly, then
restart the same directory. Verify committed bytes/nonce survive and uncommitted
lease/confirmation effects do not. Lost dispatch ACK must stay SENT/ATTENTION;
no automatic requeue. Reconcile the exact signed original source receipt once
and repeat the callback: one credit. Restore source plus database old snapshot
while witness stays current; writes and reads must stop. Full witness rollback
remains outside the offline trust assumption.

## N03 — actual login authentication and cross-database denial

Use separately supplied, non-repository native SCRAM/TLS or certificate identities;
SET ROLE/SET SESSION AUTHORIZATION do not satisfy this gate. Execute the full
positive gateway/worker/verifier/read/recovery/revision procedure path with
separate pools. Execute every negative role/function matrix cell; table SELECT,
INSERT, UPDATE, DELETE; schema CREATE; TEMP; role membership and SET ROLE owner;
rebind attempt; malformed JSON; stale lease/fence; source forgery. Check installed
function owners/search paths/PUBLIC defaults. Verify migration authority only via
explicit owner assumption, backup SELECT only, no keys. Attempt genuine CONNECT
to every unrelated database and require denial; do not silently alter existing
ACLs. Revoke a login, terminate only its disposable sessions through authorised
admin control and prove fresh/existing connections cannot continue. Test restore
into a fresh database with admission closed and witness reconciliation required.

Retain complete per-case evidence. A failure blocks acceptance; never replace
these gates with the serialised WASM results or a fake successful login.
