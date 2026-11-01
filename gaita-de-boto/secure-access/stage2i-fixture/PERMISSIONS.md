# PostgreSQL permission design — PROPOSED, native verification BLOCKED

`permissions.sql.proposed` is a complete proposed **permission surface**, not an
implemented runtime database adapter. It deliberately aborts before object
creation. The procedure contracts below still need reviewed SQL bodies and a
DAL port; stubs fail closed. The existing direct-SQL fixture adapter must never
run with administrator credentials as a workaround. No SQL in this proposal was
installed, and no authenticated role claim is made.

## Isolation and ownership

Use one separately approved, dedicated Dummy database with a singleton binding
to one environment/profile/Owner/pupil. Every environment column must reference
that binding. Do not share a database/reader between real pupils and Dummy.
Revoke PUBLIC CONNECT and TEMP on this new database, and CREATE on its public
schema; pin the private `gdbi` schema and owner-defined function search paths.
Do not revoke permissions on any existing operational database. For a shared
cluster, its administrator must additionally demonstrate denial of these
logins to every other database; the safer pilot alternative is a separately
isolated instance. Neither arrangement exists here.

`gdbi_owner` is NOLOGIN and owns schema, tables and procedures. The separate
NOINHERIT migration login can explicitly SET ROLE to the owner for reviewed
migrations. No runtime principal inherits ownership. Native authentication must
be approved TLS/SCRAM or client certificates; secrets are injected outside Git
and SQL scripts. No password or real credential is created by this proposal.

| Identity | Exact allowed procedure scope | Data/key access | Explicit denial |
| --- | --- | --- | --- |
| Database owner | NOLOGIN object owner | Database objects; no Google/source keys | No application login |
| Migration | Approved schema/function migration through explicit SET ROLE | New dedicated DB only; no source key | Absent from runtime config |
| Gateway | submit_original, recording_status | Its authenticated Owner's manifest and pending audio; staging encryption authority | Cannot administer, grant admission, edit immutable jobs or confirm SAVED |
| Worker | claim_recording, arm_recording, mark_attention, dispatch_read | Leased original ciphertext/unwrap authority, gateway dispatch signer as separately approved | No policy UPDATE, arbitrary IDs, confirmation or protected client release |
| Protected-read broker | create_read, release_read | One-use staged response and its separate decrypt key | No recording mutation, admission change or source signing key |
| Admission administrator | set_admission | Current fixed Owner-to-Dummy admission CAS | Cannot rebind workbook/profile/Owner/pupil or create a recording |
| Receipt verifier | confirm_source_receipt, stage_verified_read, finish_revision | Source public keys and authenticated exact evidence; read-staging encrypt authority | No source private key, policy administration or original re-upload |
| Recovery | request_reconciliation | Bound unresolved metadata/ciphertext via approved request | Cannot reset nonces, rewrite originals, issue new uploads or confirm without verifier |
| Revision coordinator | begin_revision | Allowlisted operation intent and DIRTY barrier | Cannot clear DIRTY with a worker-supplied Boolean |
| Backup | Explicit SELECT in this dedicated DB only | Encrypted stage/read data, metadata, signed receipts | No runtime writes, restore authority or decryption/source keys |

The Google source private signing key belongs only to the separately approved
Owner-run source component. Database access or the gateway dispatch key must
not create source evidence. AES staging/read keys are separate from signatures;
backups have ciphertext and public verification material only. Actual KMS,
secrets, host identities, TLS, network ACLs and costs require separate approval.

## Narrow transaction and locking boundary

Runtime logins have no direct table DML. `lock_admission()` and
`lock_revision()` are internal SECURITY DEFINER helpers owned by the NOLOGIN
owner, fully qualified with `search_path = pg_catalog`, with PUBLIC EXECUTE
revoked. Public entry procedures can use their row locks without giving a worker
UPDATE on policy. Entry procedures must be fixed, allowlisted functions, never
dynamic SQL/action dispatch or caller-selected table/schema/role names.

Each procedure starts/ends within a caller transaction. Lock order is admission
then revision then job/read/operation. Use independent connections and native
tests to prove absence of deadlocks, correct SKIP LOCKED behavior and fencing;
the current single-profile admission/revision locks intentionally serialise
that profile. No transaction remains open across Google/network execution.

All JSON arguments require exact-key schemas, types and bounds; text that looks
numeric is invalid. Use database time for deadlines, session_user for a fixed
service identity and the immutable binding for resource scope. Browser Google
identity/session verification occurs at the gateway/broker; SQL service
authentication is not pupil authentication.

## Procedure contracts that must be implemented before activation

| Procedure | Required transaction behavior |
| --- | --- |
| submit_original | Verify configured subject/pupil/environment/profile and active operation admission; insert one immutable original with queued default, encrypted bytes/IV/tag and manifest hash; exact duplicate returns same status, conflict rejects; no caller-supplied phase. |
| recording_status | Recheck active admission and fixed identity; return SAVED only for verifier-confirmed exact receipt, with current gateway response binding and source public device proof. |
| claim_recording | Admission/revision lock, deny DIRTY, select eligible queued/expired leased job FOR UPDATE SKIP LOCKED, increment fence and database deadline, bind worker session identity; never reclaim sent/attention. |
| arm_recording | Recheck fresh admission, manifest, profile, worker/fence/lease and base revision; durably set sent plus DIRTY before network dispatch; return only the exact permit's original encrypted audio. |
| mark_attention | Worker/fence-bound sent-to-attention only; keep ciphertext and immutable fields; cannot clear DIRTY or return to queued. |
| confirm_source_receipt | Verifier login only AFTER independent source RSA/projection checks; exact payload matches manifest, operation, byte hash/length/MIME/sample duration, canonical LOG/META, qualification and public device proof; sent/attention only, duplicate exact confirmation is no-op; one credit/revision, clear matching DIRTY only. In-flight revocation may complete internally without enabling pupil reads. |
| set_admission | Administrator only; CAS current revision, fixed binding, allowlisted status/operations/expiry; bump access revision and synchronise fresh dispatch authority; no resource/identity rebind. |
| create_read | Broker-attested Owner/client session; active admission, clean revision and exact path/playback operation; bind opaque handle hash, one original SID if playback, revision/admission and at most 30 seconds. |
| dispatch_read | Worker only; consume original handle exactly once, recheck client/admission/revision/time, persist exact signed request digest and operation before leaving transaction. |
| stage_verified_read | Verifier only; source signature/purpose/request/data digests checked independently, exact authorised projection, no raw Drive URL; recheck admission/revision; encrypt staged payload, duplicate exact callback is no-op. |
| release_read | Broker only; recheck Owner/client/admission/revision/time and readiness; one-use consume; broker independently checks/decrypts evidence before client release. No stale fallback or recording deletion. |
| request_reconciliation | Recovery identity requests read-only canonical inspection for known sent/attention original; only receipt verifier can confirm; no capability/nonce reset or blind re-upload. |
| begin_revision | Coordinator records a typed allowlisted operation and DIRTY under admission/revision lock, original operation/request hash immutable. |
| finish_revision | Verifier validates exact independent source effect proof and current operation before clearing DIRTY/bumping facets. Actual Teacher/Feedback/manual paths remain unimplemented and must deny protected reads until coordinated. |

The verifier login is a separate authority, not a worker-provided `verified`
Boolean. Its code must verify the source asymmetric signature with independently
managed public keys and exact original evidence. PostgreSQL here does not
natively verify RSA; granting this login to the gateway/worker process would
collapse the intended boundary and requires security review. This is a remaining
implementation gate, not something silently solved by ACL text.

## Backups, revocation, native acceptance and rollback

Backup SELECT privileges apply only to explicitly owned tables in this new
database, never pg_read_all_data/global roles. New tables require reviewed
default privilege updates. Restore authority stays with a separate migration/
administrator identity and restores into a NEW disposable database. Compare
journal generation/head/nonce history with the retained independent witness
before enabling connections; restoring journal and primary DB together is not
proof of freshness. Keep Owner-controlled decryption-key recovery separate.

Revocation requires REVOKE CONNECT and EXECUTE plus administrator termination
of existing sessions; a CONNECT revocation alone does not end them. Disable
gateway/worker admission/signing independently. Never remove ciphertext,
nonces or source receipts as a revocation operation.

N01/N02/N03 must exercise actual separate native logins, denied role escalation,
policy/recording mutations, table access and other-database CONNECT, the complete
positive procedure path, independent races, crashes and backup/restore. A SET
ROLE negative probe or PGlite cannot satisfy these. No suitable native instance
is available; all three remain BLOCKED. SQL parse/installation and DAL procedure
bodies are PROPOSED. Future changes or environment creation require the next
Owner authorisation. Nothing here is approved for deployment.
