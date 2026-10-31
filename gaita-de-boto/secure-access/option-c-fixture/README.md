# Option C — Stage 1 security fixtures

Authorisation: Leslie Thomson / CHAT 3, 31 October 2026, **fixture-only**.
Parent checkpoint: `64545e0e76bf9ea843f4d28b8ff52ce701011d31`.
This directory has no application route, listener, OAuth client, Google connection,
PostgreSQL connection, deployment entry point or real resource configuration.
It is not imported by the working recorder or backends.

Run locally with Node 24 or later, without installing dependencies:

```sh
cd gaita-de-boto/secure-access
npm run test:option-c
```

The suite creates disposable `gdb-option-c-*` directories directly under the OS
temporary directory. It removes each directory in `finally` and verifies removal.
Only synthetic audio, subjects and resource IDs are accepted. HTTP/socket entry
points are blocked by the test process. No CI run is needed or authorised here.

## Files and boundaries

| File | Responsibility |
| --- | --- |
| `contracts.cjs` | Strict profile, identity, manifest, signed envelope and revision contracts |
| `store.sql`, `store.cjs` | Disposable local SQLite admission, audit, encrypted staging, immutable intent, dispatch barrier, exact receipt and DIRTY revisions |
| `google-double.cjs` | Durable local Google double; invokes the unchanged canonical Apps Script VM; pure inspection, signed proofs and a synthetic teacher-operation model |
| `pipeline.cjs` | Fixture orchestration between original actor, database worker and Google caller; protected read rechecks |
| `test-support.cjs` | Synthetic identity authority, ephemeral keys, temporary resources and reopen helpers |
| `option-c.test.cjs` | Named security scenarios and cleanup assertions |

## Admission and resource contract

The new Owner-test admission is separate from the existing pupil grant model.
It admits only a configured, branded synthetic Owner to the exact
`environment / organisation / pupil` tuple. There is no general Owner bypass.
Admission includes an explicit operation allowlist, expiry, revision CAS and
revocation. Actor objects copied from JSON or given `OWNER`/`verified` flags fail.
Allow/deny admission decisions are recorded with subject, time and revision.
State-changing transactions recheck current admission inside `BEGIN IMMEDIATE`;
the transaction-boundary revocation test uses a second SQLite connection.

The workbook and folder are server-only profile fields, included in a profile
digest. They are never client selectors. All IDs are synthetic. The canonical
VM has its existing fixed synthetic folder. A fresh local database/VM represents
the proposed physically separate Dummy environment; this does **not** prove
Google ACL isolation or create a real workbook/folder.

## Immutable original recording

An accepted manifest binds the original Session ID, issuer/subject/scope,
organisation, pupil, environment, original admission revision, profile digest,
SHA-256, exact byte length, MIME, independently parsed media duration and exact
start/end times. Identical resubmission returns the existing intent; changed
immutable data under that Session ID conflicts. Renewing admission preserves
the original manifest and authorisation revision.

Staging uses AES-256-GCM with a random IV and manifest digest as associated data.
The local SQLite stores use WAL and FULL synchronous mode. Their configuration
fingerprints bind identities, resource profile and keys. Wrong-key reopening
fails without replacing data. Tests reopen both stores and use a separate Node
process to recover exact protected bytes and original identity.

This is a disposable fixture persistence adapter, **not a PostgreSQL migration**,
production key store, filesystem security certification, power-loss test or new
native concurrency certification. Its encryption does not change recorder v8's
existing HKDF/AES-GCM IndexedDB scheme, key material or origin.

## Save and recovery contract

`accepted → sent → confirmed` or `sent/uncertain → reconciled`.

Queue acceptance returns `SAFE ON DEVICE — awaiting confirmation`, `saved:false`
and `retainLocalAudio:true`. Before sending, the worker checks current admission,
lease, fencing token and exact stored permit. The dispatch barrier durably marks
the intent sent and the view DIRTY before any external call. A previously sent
or uncertain intent cannot be blindly dispatched again.

The Google double has distinct caller authority. Gateway requests are canonical
JSON, purpose-bound RSA-SHA256 signatures with nonce, deadline and profile/actor
binding. Used nonces survive reopening. Its response signs the complete original
binding, manifest digest, exact file hash/size/MIME/duration, expected folder,
canonical LOG/META evidence and five-minute qualification evidence. The gateway
verifies the signature and all bindings. Pupil status exposes only the filtered
exact confirmation, never a Drive URL, workbook or folder locator.

Only the existing `queue-fixture/canonical-fixture.cjs` writer adapter invokes
the unchanged `apps-script/pupil/Code.gs` and `MediaDuration.gs` in their mocked
environment. That code retains its existing ScriptLock. No second audio writer,
new Apps Script project or independent audio-writing lock is introduced.
SQLite transactions coordinate fixture intent; they do not surround or replace
the canonical writer's lock.

The new inspector reads snapshots without invoking legacy mutating receipt
helpers. Lost acknowledgement with complete exact evidence can reconcile without
rewriting. An interruption after LOG can already include META; if all evidence
exists it is confirmed. STARTED-only, orphan-file, missing-META, unbound historical
audio or an uncertain dispatch without evidence remains pending/attention. The
fixture provides no automatic repair, deletion, rebind, force-unlock or resend.
An Owner-reviewed recovery policy for those cases remains future work.

If revoked before the dispatch barrier, no Google operation is sent. Revocation
after the barrier cannot unsend an in-flight operation: internal exact recording
or teacher-operation proof may complete for reconciliation, while intake,
status, PATH and playback remain denied. In-flight revoked recording staging is
retained. No revoked client receives a `SAVED` response that could clear its local
copy. Previously delivered bytes cannot be recalled.

## Revision and protected-read contract

Operations carry a stable UUID, original actor, profile, event and expected
`generation:revision`. Persist DIRTY before the source operation; clear it only
after authenticated proof bound to the original operation/request. Retry of a
completed operation is idempotent; uncertain responses use source inspection.

| Event | Invalidated facets |
| --- | --- |
| Recording save/reconciliation | Sessions, totals, availability, GROUP |
| Teacher comment | Comments |
| Teacher review | Reviews, targets, badges (conservative invalidation; no automatic award) |
| Target assignment / catalogue change | Targets / targets and catalogue |
| Badge award / catalogue change | Badges / badges and catalogue |
| Session target | Sessions, targets |
| GROUP change | GROUP |
| Permission change / admission or revocation | Access, GROUP |

DIRTY blocks PATH, playback and qualification responses and other recording
dispatch. Reads verify current admission before and after source retrieval, check
the exact signed request proof and reject a changed authoritative revision.
Canonical recording provenance/hash/folder evidence is rechecked for protected
reads; unbound or altered records fail closed. Responses specify `no-store` and
`no-referrer`; there is no stale fallback or real-pupil cache.

Teacher/comment/target/badge/review/permission source operations here are a
**synthetic operation model**, not execution of the working Teacher/Feedback
backends or actual badge calculation. Permission events test invalidation;
actual admission revocation is enforced by the admission mechanism. Real manual
workbook edits and existing uninstrumented writers remain uncoordinated and must
not be connected until every relevant writing path participates or reads are
blocked. Actual General Practice qualification still uses validated samples
`>=300 seconds`: a 299.9-second recording can display 5.00 minutes and still does
not qualify. No historical total or badge is changed.

## Test coverage and limits

The named suite covers all 12 categories requested by CHAT 3: narrow admission;
other pupils; foreign organisations/actors/environments; original Session IDs
and conflicts; deduplication/replay; expiry/revocation; hash/receipt mismatches;
lost responses; resource injection; interrupted recovery; revision coordination;
and revocation of in-flight recording/teacher operations. It also checks signed
read-proof substitution, encrypted staging corruption, separate-process recovery,
pure inspection and disposal of each temporary directory. Count named cases,
not individual assertions or historical checks.

The test runner prints actual passed/failed/skipped counts. The latest verified
result is recorded in `RESULTS.md`. Historical 93 fixture checks and the accepted
38 native PostgreSQL checks are separate and were not rerun or added here.

Not executed: real Google Sign-In/token verification, automation OAuth/ACLs,
Apps Script remote execution, multiple real Google workers, browser recording or
pause/resume, browser/offline/IndexedDB recovery, actual Teacher/Feedback effects,
quota/latency/reauthorisation, live PostgreSQL integration and any live Dummy
pilot. Synthetic media tests do not certify browser pause/resume behaviour.

## Stage 2 approval and rollback

Return to CHAT 3 before further development/configuration. Stage 2 needs Leslie's
separate approval for exact isolated Google workbook/folder ownership and ACLs;
automation identity/client/scopes/Cloud association; narrow same-project caller
admission; hosting/DB/storage/key/backup retention and any cost; candidate source
and private deployment; and any bounded Dummy test window. No approval is implied.
Never use Leslie's personal refresh credential or grant the automation identity
the current Gaita workbook to overcome a blocker.

Before a live connection, port these contracts to reviewed production adapters:
real Google identity verification, durable PostgreSQL admission/manifest/nonces/
operations/revisions with crash and revocation concurrency evidence, credential
and signing-key lifecycle, actual pure inspector/resource profile in the **same
canonical writer project and lock**, all-writer coordination, and a candidate UI
that matches the exact receipt to protected local bytes. Do not copy this local
fake Google service into deployment. Atomic source-manifest/nonce checks across
multiple real workers remain unverified.

Rollback is the unchanged parent `64545e0...` and all prior v8/v2/v5/v1 versions.
This feature-only directory and npm script are inactive until explicitly invoked;
no application rollback, deployment or Google cleanup is required. Keep original
encrypted pending data and canonical history during any later rollback. Do not
reset a shared branch or merge PR #6 as a shortcut.
