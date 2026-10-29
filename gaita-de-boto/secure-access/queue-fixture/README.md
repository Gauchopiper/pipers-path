# Private queue architecture fixture — not a deployment

The authoritative project history/decision remains the existing Google Doc.
Run `npm run test:queue` from secure-access. No Google credentials, network
listener, Apps Script trigger or production resource is configured. This isolated
fixture uses Node SQLite for multi-connection/thread races; it MUST NOT be used
as instance-local Cloud Run production storage. Existing PostgreSQL integration
is not changed. A production queue requires reviewed PostgreSQL transactions,
locks, migration and multi-instance tests. No provisioning gate is enabled.

## What is implemented

- Immutable upload-only jobs binding organisation, verified-gateway subject/scope,
  pupil, original Session ID, action, hash, byte length, MIME and active duration
  timestamps. Requests reject unknown fields including file/folder/URL selectors.
- HMAC-SHA256 envelopes cover version/method/path/role/time/nonce/body. Separate
  random fixture gateway/worker keys, constant-time MAC checks, 30-second freshness,
  persistent atomic nonce rejection. This is an application contract, not deployed
  HTTPS/IAM. A gateway key is trusted to assert verified identity; production must
  derive it from the existing session/access checks, never pupil-supplied claims.
- BEGIN IMMEDIATE atomically selects leases/increments fences. Expired leases may
  be reclaimed; stale load/fail/complete rejected. Bounded three processing attempts,
  bounded retry backoff, explicit manual reconciliation. Inspection can query receipts
  but NEVER uploads, even when the receipt says absent. Nonces and jobs are retained.
- Acceptance and processing recheck the fixture authorization provider. Production
  needs durable current grant/revocation checking in both gateway and writer.
- AES-256-GCM fixture staging with random IV and immutable fingerprint as AAD;
  byte length/hash checked again after decrypt. Default staging TTL 24 hours,
  accelerated in tests. Expiry deletes only temporary ciphertext, never job or
  receipt metadata. This is a proposed retention value, not approved real-data policy.
- Only supplied writer.receipt/upload adapters touch the canonical writer. No
  Drive or Sheets write is implemented here. Saved receipt confirms exact binding;
  absent AND retrySafe permits the supplied writer; STARTED/unknown stops for manual
  reconciliation. Staging or queue acceptance is never SAVED. Confirmation omits
  Drive URLs and is the only point retainLocalAudio becomes false.
- Expired/missing staging: same job enters awaiting-audio. Identical original bytes
  may be restaged under same job/Session ID/hash. Attempts/fences are not reset.
  Exhausted attempts need manual review; do not create a new Session ID. If the
  canonical receipt is already saved, no staged audio is needed for confirmation.

## Important limits

The 30 checks use generated one-second PCM WAV, random test-only keys, SQLite
on disk and two actual worker threads/connections for races. The canonical writer
is a controlled mock. Existing writer media parser, ScriptLock, Google filesystem
ownership and protected playback are NOT exercised here. Rejecting foreign file
references is tested; live folder membership is not certified. No second writer
is deployed. No actual browser IndexedDB is read, changed or cleared: retainLocalAudio
is a tested contract flag, not complete frontend recovery integration.

A queue fence protects queue state, not an already-running Apps Script operation.
The existing writer MUST enforce its receipt-before-write lock and revalidate
pupil/session/organisation/file/folder bindings. An in-flight revoke cannot be
claimed to undo an already committed recording. No distributed exactly-once
transaction is promised. Lost writer response is conservative manual state;
receipt-only inspection can confirm saved without a second upload. Partial STARTED
records remain manual until authoritative backend reconciliation.

Fixture keys are kept in test memory, including staging key. Production key
persistence, rotation/revocation, TLS, signed responses, audit, rate limits,
nonce retention/cleanup, encrypted backup, crash/power-loss durability, leases
under network partition and Google identity/quotas remain unverified. Jobs/nonces
currently have no automatic cleanup; deployment must design bounded metadata
retention without enabling replay or forgetting uncertain operations. The gateway
and worker are trusted authorities; HMAC does not protect against their compromise.

## Measured deterministic polling model

`polling.cjs` advances a virtual clock; these are NOT Google measurements. First
poll is after one period. Jobs run serially, with no network latency, failures or
scheduler jitter. Upload model: four jobs/poll, one second service/job.

| Arrivals | Poll | Median delay | P95 | Maximum | Nominal capacity |
|---|---:|---:|---:|---:|---:|
| 12 uploads, 50 seconds apart | 60 s | 31 s | 61 s | 61 s | 4/min |
| Burst of 20 uploads | 60 s | 182 s | 303 s | 304 s | 4/min |
| 60 uploads, 1 second apart | 60 s | 453 s | 845 s | 845 s | 4/min |
| 12 uploads, 50 seconds apart | 300 s | 303 s | 501 s | 501 s | 0.8/min |

Read-only illustrative model: 60 PATH requests one second apart, one-minute poll,
up to 100/poll, 0.2-second service each: median 36.2 seconds, P95 57.8, max 60.2.
Actual PATH/playback jobs are not implemented by this upload-only prototype.
This is not acceptable as a claim of responsive interactive playback. Larger
batches may improve backlog but not the idle polling floor; trigger runtime,
network and quotas require separate measured tests. Throughput is model capacity,
not an observed Google capacity or a guarantee.

## Decision and next step

Queue remains a candidate for asynchronous uploads with explicit pending status
and local protection. It is NOT selected for an entire interactive app. Prototype
an independently authorised read path (or carefully invalidated protected cache)
for PATH/feedback/audio before selecting the production architecture. Do not
replicate private data or delegate Owner credentials to solve this implicitly.
Next: port the queue's transactional contract to the existing PostgreSQL adapter,
review same-project writer adapter boundaries and investigate reads using fixtures.
Then seek explicit approval for a concrete controlled deployment and any resources.

Rollback of this fixture is stopping tests/removing synthetic temporary databases.
Production rollback remains undefined pending deployment design: it must pause new
jobs, stop workers, preserve staged audio/receipts and reconcile in-flight writes.
Existing recorder v8, Teacher v2, Pupil v5, Feedback v1 and their rollbacks remain
unchanged. Do not deploy the repository's ANYONE_ANONYMOUS manifest, infer live
permissions from it, or merge PR #6. The future live manifest/scope/ACL audit remains.
