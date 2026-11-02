# WORK 4 → CHAT 3 — development results

Started 29 October; completed 30 October 2026. Fixture investigation only.
The authoritative implementation history remains the SAME existing Google Doc:
https://docs.google.com/document/d/1Bn7I8H1G3kSIq6S5R2nA7pbn0vUWEJf0GRnIlUlnuHU/edit

## Checkpoint and scope

Repository `Gauchopiper/pipers-path`; target branch
`feature/gaita-de-boto-staging-20261019`; starting published commit
`eefa17f74d29bc4be6c9af42a49fe2cc32db1ed6`. This report belongs to the
commit containing the WORK 4 fixtures; the Google handover records its exact SHA.
PR #6 was open, draft and unmerged at inspection. Nothing was deployed.

Publication record: WORK 4 changes were committed locally in a detached worktree
at `/workspace/scratch/5fe09d45d556/pipers-path`. Automatic approval review initially
blocked the push for insufficiently explicit publication authorisation. Leslie then
explicitly authorised retrying. The authorised command-line retry failed because
Git had no available GitHub sign-in credential. The existing connected GitHub
account is the authorised publication route. The SAME Google handover records the
final remote SHA, local checkpoint/tree match and verified publication outcome.
Publication does not authorise merging PR #6 or deployment.

A separate detached worktree preserved the original workspace. Its existing
uncommitted CIYPB/root images and EMGT temporary files were not staged, reverted
or assessed as Gaita implementation. Another unrelated root image changed in the
new worktree during the investigation; that file was also excluded. No unpublished
Gaita code after the starting commit was found. The branch and handover were
rechecked after the overnight interruption; both remained at the same checkpoint.

Changes are confined to `secure-access/package.json` (new `test:work4` command)
and this fixture directory: `postgres.sql`, `postgres.cjs`, `pg-test-store.cjs`,
`postgres.test.cjs`, `canonical-fixture.cjs`, `canonical.test.cjs`,
`protected-reads.cjs`, `protected-reads.test.cjs`, this report and the README pointer.
No production handler imports these modules. Existing shared PostgreSQL migrations,
recorder, Apps Script source, endpoints, provisioning gate and permissions are unchanged.

## Commands and actual execution evidence

From `gaita-de-boto/secure-access`:

```sh
npm run test:work4
```

| Executed suite | Passed | Failed in final run | Evidence limit |
|---|---:|---:|---|
| `node queue-fixture/postgres.test.cjs` | 29 | 0 | PGlite/WASM, one serialised connection, temporary disk database/reopen |
| `node queue-fixture/canonical.test.cjs` | 18 | 0 | Unchanged Apps Script + media parser in VM; Google service doubles |
| `node queue-fixture/protected-reads.test.cjs` | 36 | 0 | 17 scenarios repeated across direct/cache, plus 2 other checks; synthetic identity/revisions |

Total: **83 named check executions**, not 83 distinct scenarios or live tests.
Three native PostgreSQL independent-connection race checks are explicitly skipped.
The original 30 SQLite queue checks, five polling assertions and earlier 104
access/provisioning checks were NOT rerun or added to this count. `git diff --check`
and the staged-diff whitespace check passed. No dependency versions changed.

An initial new queue test exposed a reconciliation worker-ID shadowing error;
it was fixed before the final passing run. A further test ensures an unavailable
authorisation provider leaves a job queued rather than falsely recording revocation.

### Actually executed versus simulated

Actually executed: Node code, PostgreSQL SQL on PGlite, transaction/savepoint
rollback, bytea encryption/decryption, persisted nonce/audio state after engine
close/reopen, actual repository writer/parser functions, private response projection.

Simulated: all Google Sheets/Drive operations, ScriptLock behavior, folder identity,
current pupil grants, teacher edits, revision provider, crashes/lost responses and
synthetic PCM WAV recordings. Fault injection is controlled code interruption,
not OS power-loss/disk-fsync/backup-restore certification.

Not tested: native/network PostgreSQL, independent database connections,
SKIP LOCKED contention/deadlocks, Cloud SQL, TLS, genuine Google accounts, live
Apps Script/deployed-source parity, private file ACLs, browser/real-device recovery,
Google latency/quotas or production capacity. Native PostgreSQL binaries were not
installed in this environment; no new installation or paid provisioning was attempted.

## PostgreSQL queue findings

The port uses isolated `gdb_fixture_queue_*` tables, never the production migration
runner. `fixtureOnly:true` and explicit pool/keys/authoriser are mandatory; no
listener, URL, key or deployment is supplied. It preserves the upload-only signed
envelope, role allowlist, 30-second freshness, atomic persistent nonce rejection,
immutable binding, original Session ID, encrypted AES-256-GCM staging, bounded
attempts/backoff, leases/fences and receipt-only reconciliation.

Unique Session ID insertion arbitrates duplicate acceptance; row locks guard state,
and claims use `FOR UPDATE SKIP LOCKED`. These SQL statements executed in PGlite;
their independent-connection behavior is NOT verified. A denied signed operation
rolls back its savepoint while committing its consumed nonce. Injected staging
failure leaves no partial job. Expiry removes ciphertext only, retaining unresolved
job/nonce evidence. Exact original bytes can be restaged without changing Session ID,
attempt count or fence. Exhausted/uncertain work remains manual. Key persistence,
rotation, backup, metadata retention/cleanup and trusted clock design remain open.

The older fixture receipt omitted hash, byte length, MIME, subject/scope and
timestamps. The new port rejects that weaker shape. Only a supplied authoritative
adapter confirming **all immutable binding fields** can set SAVED and remove staging.
The browser protection flag still represents a contract: no actual device blob
was deleted or migrated, and queue acceptance never authorises such deletion.

Optional future local-native command (NOT executed here): create a disposable local
database named `gdb_<name>_fixture`, set `GDB_FIXTURE_NATIVE_URL` locally to its
connection string, then run `node queue-fixture/postgres.test.cjs`. The helper
rejects non-loopback hosts and other database names. It removes only its synthetic
queue jobs/staging, but this must still be a disposable dedicated database.
Do not paste a connection credential into Chat.

## Canonical single-writer findings

`canonical-fixture.cjs` executes the unchanged `apps-script/pupil/Code.gs` and
`MediaDuration.gs` with in-memory Google doubles. Upload delegates to the existing
`gdbPUpload_`; there is no new Drive/Sheets writer. The adapter first checks the
receipt and refuses STARTED/attention/unknown or absent-without-retrySafe states.

An existing source limitation was demonstrated: duplicate detection uses
pupil/Session ID and returns the old result even for changed bytes; it does not
bind the old receipt to the proposed hash. The fixture adapter closes that evidence
gap by rereading the original logged file and checking hash, bytes, MIME, private
folder, pupil/session and exact start/end/media duration. This is a tested fixture
boundary, NOT an implemented or approved live receiver. Historic recordings were
not modified and no receipt schema was migrated.

Lost success responses reconcile without a second upload. STARTED before file
creation stays manual; a file created without a log stays manual with orphan
evidence. A logged file whose metadata write failed can be recovered using the
existing writer's metadata repair. Receipt lookup itself may repair SESSION META:
it is not a strictly read-only backend function. Queue fencing cannot cancel an
already running writer; same-project ScriptLock and canonical receipt checks still
must arbitrate real concurrent writes. Cross-service exactly-once is not promised.

Tests retain the source's 14 MiB base64 ceiling, two-hour timestamp limit,
independent sample-duration check and **5-minute qualifying threshold**.
299.9 seconds can round to 5.00 stored minutes but does not qualify; 300 seconds
does. The MIME allowlist lists MP4/OGG, but the current independent-duration parser
rejects them: verified formats here are synthetic PCM WAV only. The source also
has WebM/Opus parsing; no new real-WebM/device certification is claimed.

## Protected PATH/playback comparison

Both candidates use a trusted verified identity and fresh membership checks before
and after source retrieval. They reject foreign organisation/pupil, arbitrary file
selectors, bad source bindings, revoked identities and changing snapshots. Private
audio resolves from logged pupil/Session ID and checked folder; bytes are returned
without Drive URLs, with no-store headers. Audio is never cached. No public endpoint
or Google credential exists in this fixture.

The PATH projection includes totals, sessions, targets/badges and teacher
comments/reviews. It deliberately excludes Drive/resource/image URLs, pupil
capabilities, teacher email and unneeded fields; a future UI must explicitly handle
approved public artwork and escaping. This fixture is not a replacement UI.

| Criterion | Direct authorised read | Versioned protected cache |
|---|---|---|
| Current authorisation | Checked before and after retrieval | Same; grants are never cached |
| Pupil/organisation isolation | Server-selected source projection | Same; cache key is organisation + pupil |
| Private audio | Checked source bytes; no public Drive link | Same; audio is not cached |
| Teacher notes/reviews | Retrieved on every request | Refreshed on revision change, TTL expiry or invalidation |
| Private data copied | Per-request memory/response | Selected projection held in process memory |
| Freshness dependency | Consistent source snapshot/revision | Also reliable revision advance on every relevant edit |
| Source availability | Fails closed | Fails closed; no stale-on-error fallback |
| Complexity | Authorised source transport + consistent read | Also versioning, invalidation, eviction and copied-data policy |
| Real response latency | Not measured | Not measured; improvement not established |

Cache location is fixture process memory only. Fields are the above projection;
proposed test TTL is 5 seconds, not an approved real-data policy. `invalidate`
and `sweep` delete projections; revocation at request time also deletes the entry.
The fixture has no background eviction scheduler, memory quota, durable cache,
encryption at rest, multi-instance invalidation or production revision provider.
Idle expired entries remain in memory until `sweep` or process exit: TTL controls
serving, not guaranteed physical erasure. Any real-data copy needs separate approval.

Two synthetic PATH requests made 2 full source reads + 6 revision reads in direct
mode, versus 1 full source read + 5 revision reads with a warm cache. These are
call counts, NOT latency/throughput measurements. The cache demonstrably serves
an old note within its TTL if a simulated edit fails to advance the revision.
Neither candidate supplies the presently unresolved secure Google transport.
Earlier minute-polling models were not rerun and do not justify interactive routing.

## Risk, rollback and next action

No production architecture is selected. Continue with fixture/native-local work:
run the 3 native connection races, test transaction failures/deadlocks and persisted
restore, specify authoritative receipt/hash and revision contracts, and design the
same-project receiver without creating a second writer. Do not conceal credential
delegation or private-data replication behind the word "cache".

Still required before live work: specific Owner approval for any Google identity,
credential/scope/permission/trigger/project change, private-data cache, external
pupil, deployment or financial resource. No decision to grant that authority was
made here. No Owner refresh token was requested/stored. Provisioning remains
disabled; Annie and all real pupils are untouched. No EMGT/SPBASA/CIYPB changes.

Risks remain: compromised trusted gateway/worker; real grant-revocation race;
unproven network/lock concurrency; orphan writes; missing local and server copies;
key-loss/retention/backups; UI recovery integration; privacy and stale cached reviews;
unknown Google transport latency/quotas. Revocation cannot undo an already committed
write or retrieve bytes already delivered to an authorised user.

Rollback for this fixture is to stop tests and discard their synthetic temporary
database; the baseline commit and history remain available. No live rollback is
needed because no application changed. Preserve private recorder v8 source
`5a4db1ab5ffc69be9fbfa00cdb7f277b00f624aa` and its existing v8/v7/v6/v5 saved
version references in the Google document. Never clear encrypted device audio,
reset Session IDs or revert production data to roll back experimental code.

CHAT 3: Review the WORK 4 results. If further development is required, prepare the
next CHAT 3 → WORK handover. Require the next Work session to update the SAME
existing Current Implementation Handover Google document and return its results
to CHAT 3. Preserve the reciprocal handover procedure throughout the project.
