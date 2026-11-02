# Stage 2J role implementation — inactive candidate

The candidate SQL installs and its procedures/ACLs execute in pinned PGlite
0.5.13/PostgreSQL 18.6 WASM. Tests use provisioner-controlled
`SET SESSION AUTHORIZATION` to exercise ACLs and `session_user` checks. This is
**not** native login authentication, independent connections or cluster isolation.
No candidate role is used against any real database.

## Ownership and procedure matrix

| Principal | Candidate authority | Explicit exclusions |
| --- | --- | --- |
| owner | NOLOGIN database/schema/table/function owner | No runtime credentials |
| migration | NOINHERIT; explicit SET ROLE owner, reviewed migrations | Never in runtime pools; migration is trusted administrative authority |
| gateway | submit_original, recording_status | No admission change, source confirmation, direct table DML |
| worker | claim_recording, arm_recording, mark_attention, dispatch_read | No source receipt confirmation, policy mutation, client release |
| reader | create_read, release_read | No recording mutation, source attestation or admission changes |
| admission | set_admission with CAS/bounded TTL/allowlisted operations | Cannot rebind environment/Owner/pupil/profile/SID |
| verifier | verification_context, confirm_source_receipt, stage_verified_read, finish_revision | Separate pinned-source-key verifier; no source private key |
| recovery | request_reconciliation of existing sent/attention/confirmed original | No requeue, new upload, nonce reset or credit |
| coordinator | begin_revision of allowlisted operation | Cannot clear DIRTY without independent source evidence |
| backup | Explicit SELECT on eight private tables | Ciphertext/metadata/proofs only; no AES keys, mutations or restore authority |

All roles have NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS.
The owner has NOLOGIN. Runtime roles have no memberships, schema CREATE,
TEMP or direct table access. PUBLIC database CONNECT/TEMP, schema CREATE,
table privileges and function EXECUTE are revoked. Object creation and grants
are in one transaction. Every definer has `search_path=pg_catalog,pg_temp`;
private tables/types/functions are schema-qualified. Internal helpers are
ungranted. Arguments have exact JSON key sets and bounds, strictly typed safe
integers and fixed scope. No request controls an SQL identifier or service role.

The provisioner must install only into a new dedicated disposable Dummy database.
The installer creates roles at cluster scope and changes ownership/ACLs ONLY on
`current_database()`; consequently it must NEVER run on an arbitrary/shared or
operational database. There is deliberately no automated provisioner or runtime
installer. Binding/bootstrap inserts are performed by the disposable test owner,
not runtime roles. A future installer needs separate approval and target attestation.

## Transaction and receipt authority

Every public procedure is one database statement in its caller transaction.
Lock order is policy, revision, then job/read/operation. Claim uses
`FOR UPDATE SKIP LOCKED`, but the single-profile policy lock intentionally
serialises this synthetic profile. No policy UPDATE is granted to a worker.
An expired LEASED job can be reclaimed with a new fence. A SENT/ATTENTION job
cannot be reclaimed or blindly dispatched, even after expiry. Arming sets SENT
and DIRTY before leaving the transaction. Manifest/operation/SID stay immutable.

Only the separate verifier can confirm a source receipt. The DAL verifies pinned
asymmetric source signatures and exact manifest/hash/operation/revision/threshold
before calling SQL. SQL independently rechecks the row, state, qualifying value,
receipt shape, nonce and DIRTY operation. Duplicate exact receipt is a no-op:
there is at most one qualifying credit and no badge creation. Revocation can
allow internal exact reconciliation but never permits gateway status or reads.
Original ciphertext is retained even after confirmation in this bounded fixture.

SQL itself does NOT implement RSA verification. The verifier login is therefore
a separate security authority; a compromised verifier can lie about evidence.
Never put its credentials/pool in a worker/gateway process or supply a caller's
`verified=true` as a substitute. Runtime pool configuration, native authentication,
TLS/HBA, managed keys and service separation remain BLOCKED. Only provisioner/test
code switches session identity; the inactive DAL never does.

## Reads, revocation, backups and limitations

Read handles are hashed, one-use, client/admission/revision-bound and expire in
30 seconds. Fresh checks occur at dispatch, staging and release. Only verifier-
authenticated encrypted PATH data can become READY. Release consumes its ciphertext;
a decrypt/proof failure denies data even if it has consumed the handle. The
fixture has a narrow single-Dummy PATH projection, distinct-pupil GROUP count
and zero badges. **Playback decode/byte projection port is unimplemented and
fails closed**, not certified by the SQL read state machine. Existing Stage 2I
playback regressions remain separate. Full browser/client session attestation,
real Teacher/Feedback/manual-write coordination and canonical protocol bridge
are not implemented here.

The candidate receipt is a synthetic Stage 2J wire contract. It does not install
or alter the Stage 2I canonical source. Porting the actual source receipt into
these procedures needs reviewed source-equivalence and exact LOG/META/file
projection checks before any integration. New DAL unit tests mock the independent
media callback; the unchanged Stage 2I rerun separately tests Python/FFmpeg and
the canonical writer VM. These are not a live end-to-end recording test.

Backups have no encryption/source keys. Restore into a NEW database, compare
source/primary history with a retained independent witness, and keep admission
disabled until exact reconciliation. Database ownership and CONNECT revocation
cannot establish cross-database denial if another database still has PUBLIC
CONNECT; native N03 must verify every unrelated database (or use an isolated
instance). No unrelated database ACL was modified. Revocation also requires
terminating existing sessions via a separately approved administrator; CONNECT
revocation alone does not terminate them. Keys and restore authority stay outside
backup/runtime identities. No automatic evidence purge, generation reset or
nonce expiration is implemented.

PostgreSQL design references: official CREATE FUNCTION security guidance
https://www.postgresql.org/docs/18/sql-createfunction.html and role/privilege
reference https://www.postgresql.org/docs/18/ddl-priv.html . These are design
references, not evidence that this candidate passed native authentication.
