# Owner-run transport and protected reads — local fixtures

Authorised by Leslie Thomson / CHAT 3 on **31 October 2026** in
`Pasted markdown(6).md`; completed verification **1 November 2026**.
Parent/rollback checkpoint: `ec7cc0b213e9183b8a60dad46fd99ba50e470aec`.
These are inactive Node fixtures. They are not an Apps Script deployment or a
live HTTPS/PostgreSQL service. No application imports this directory.

Run with Node 24 or later, using built-in modules only:

```sh
cd gaita-de-boto/secure-access
npm run test:owner-transport
```

Do not run `test:option-c` or native CI to reproduce this new suite. Their accepted
80 and 38 cases are separate historical evidence. The test runner registers new
cases, blocks external HTTP/socket entry points, and verifies removal of every
disposable local directory. `test-results.txt` and `RESULTS.md` record the complete
final run, not accumulated assertions or partial development runs.

## Files and reused boundaries

| File | Completed fixture responsibility |
| --- | --- |
| `protocol.cjs` | Synthetic execution/session authority, purpose-bound signatures, nonce persistence, configuration fingerprints, authenticated-encryption helpers and in-process HTTPS double |
| `gateway.cjs` | One-job claims/arm/results/reconciliation, bounded dispatch policy, durable read tickets and encrypted one-use read responses, final authorisation/projection checks |
| `owner-runtime.cjs` | Owner execution guard, pull orchestration, durable acknowledgement outbox, inspection-only recovery, protected read broker and opaque browser-relay simulator |
| `test-support.cjs` | Disposable synthetic environment, ephemeral keys and canonical-lock/remote-boundary instrumentation |
| `transport.test.cjs` | Named component/security/failure tests and cleanup checks |

Reuse is deliberate: Stage 1 `contracts.cjs`, `store.cjs`, `google-double.cjs` and
the existing pure receipt inspector remain unchanged. Recording side effects
delegate only to `queue-fixture/canonical-fixture.cjs`, which runs the unchanged
Pupil `Code.gs` and `MediaDuration.gs` in a VM. It retains the existing canonical
ScriptLock; the new transport adds no outer or independent recording ScriptLock.
Instrumentation checks maximum lock depth one, balanced release, one upload and
no remote operation inside an open database transaction or held writing lock.

The local adapters add `otr_*` tables to the existing two disposable SQLite
fixture stores. This is not a PostgreSQL migration or a certified native adapter.
No new dependency, server listener, timer, Google trigger or OAuth client exists.

## Identity and fixed resources

Three authorities stay separate: verified original actor, database worker, and
Google Owner execution context. Original actor and Google execution can represent
the same Owner account while remaining different roles. A separate synthetic role
alias identifies the execution adapter; it is not a second Google account.

The fixture authority brands execution/session objects in memory. Copied JSON,
an Owner flag or a database-worker object is insufficient. Execution context must
have the configured effective Owner, an approved manual/trigger/Owner-web mode,
and the modelled capabilities. Context/session revocation is rechecked. These
brands/capability strings are mocks, not real Google token, Session, scope or
browser-cookie verification. Original actor admission is independently enforced
by the unchanged Stage 1 Owner-to-Dummy model.

The fixed profile is `fixture-owner-pull / GAITA-DE-BOTO / synthetic-dummy`, workbook
`synthetic-owner-pull-workbook`, folder `synthetic-gaita-folder`. All resource IDs
are synthetic. The in-process endpoint is `https://synthetic-gateway.invalid`;
the relay origin is `https://synthetic-owner-ui.invalid`. No DNS/HTTP request is
made. Destinations, methods, query strings, userinfo, paths and selector fields
are checked before invoking the mock router. There is no redirect mechanism.
No client can choose a workbook, folder, file URL or arbitrary function.

## Component A: one-job pull and exact acknowledgement

1. Owner runtime signs a fresh claim with its execution binding and invocation ID.
   Gateway checks signature, purpose, profile/environment, deadline and a durable
   nonce. Disabled/window/cap policy is checked independently at both ends.
2. Gateway uses the Stage 1 queue lease/fence to offer one immutable original
   manifest and permit. The claim contains no recording bytes. Reusing an
   invocation cannot claim a second job; overlapping claims encounter the lease.
3. Owner runtime verifies the original actor/profile/manifest, then requests arm.
   Gateway rechecks current admission/revision, exact stored permit and fencing,
   commits the existing sent/DIRTY barrier, and only then releases the exact audio.
4. Runtime revalidates hash/size/MIME/parsed sample duration and current execution
   permission before calling the unchanged canonical writer. The original Session
   ID and bytes are never regenerated. Google source evidence creates the existing
   exact signed receipt, not a queue-success receipt.
5. Runtime persists an outcome outbox and sends an authenticated result. Gateway
   verifies exact canonical binding before confirmation and revision completion.
   Duplicate acknowledgements and identical already-confirmed reconciliation are
   no-ops. Only matching confirmed staging can be removed by the existing store.

Public status is still `SAFE ON DEVICE — awaiting confirmation` before exact
confirmation. That is the recorder contract; this suite does not capture audio
on a device or exercise IndexedDB. Encrypted pending bytes here are server fixture
staging. Actual device deletion must later compare the authenticated exact receipt
with that device's protected original item.

Claim/arm/result are separate durable boundaries. A crash between local protocol
journal updates can conservatively leave a lease or sent/DIRTY state requiring
attention. Such gaps do not authorise a re-upload. Lost arm replies, worker
interruptions, Google timeouts or missing source evidence never trigger a second
recording write. Recovery signs a fresh inspection request for the original
manifest, uses the pure inspector, and retries only the existing exact callback.
Partial STARTED/file/META evidence remains uncertain; no read repair, destructive
reset, blind retry or historical adoption is provided.

The recorded dispatch counter survives reopening. Fixed fixture window/policy/key
configuration is fingerprinted; it is not a production window-renewal or key-
rotation implementation. Recovery has a separate explicit enable gate and can
complete an already-dispatched internal outcome after the intake window closes.
Service credential revocation disables fresh service requests. It does not give a
revoked pupil access. In-flight recording completion can be recorded internally
after pupil revocation, while status/reads/new work remain denied and pending
recording ciphertext is retained.

## Component B: no private evidence through the browser relay

1. Gateway verifies the actor, exact Dummy admission/selection and a separately
   branded authenticated client session. It records a clean generation/revision,
   admission revision, operation, selected original Session ID and deadline.
2. The client receives its request ID and a separate relay object containing only
   a random 256-bit handle. Only the handle is given to the browser simulator.
   Gateway stores its hash. The handle is not sufficient to authorise final data.
3. Owner-only Google broker obtains a signed, one-use request through the fixed
   mocked gateway route. The outer request binds the handle/read ID/revision; its
   inner Stage 1 signed request binds original actor, operation and exact namespace.
4. The existing pure Google double inspects canonical provenance/bytes without
   modifying recording data. Broker posts authenticated evidence directly to the
   gateway, retaining an outbox for an uncertain acknowledgement. It returns only
   an opaque acknowledgement to the browser relay, including on retries.
5. Gateway validates the source signature, both request digests and independent
   projection invariants. Playback must match the stored original manifest's
   Session ID/hash/size/MIME and 5 MiB cap. PATH must contain exactly the authorised
   confirmed sessions, correct qualifications/GROUP and allowed teacher-model
   fields; unknown/duplicate sessions and raw Drive URLs are rejected.
6. The response waits encrypted at the gateway, bound to the original client
   session/read ID. Final release rechecks actor/admission/revision/deadline/session,
   authenticated staging and projection, consumes it once, and returns `no-store`
   / `no-referrer` data directly to the authorised client. The relay cannot use its
   acknowledgement as a release credential.

Revocation between source read and callback prevents staging/release; revocation
after a successful callback still prevents final release. Admission renewal,
target/teacher/badge/access changes, DIRTY source operations, expired requests and
revoked client sessions invalidate older responses. There is no stale-on-error
fallback. A consumed or expired read requires a fresh authorised request. Loss of
the final client response is not permission to replay a consumed ticket.

Response staging is synthetic, bounded to the request lifetime and used only for
one current release. It is not a deployed private-data cache. Google-double
canonical snapshots and outboxes model private Google service storage; they are
local disposable files, not client-visible or real Google evidence.

## Revision preservation

Recording confirmation reuses Stage 1 session/totals/availability/GROUP effects.
The new suite invalidates already staged reads with comment/review/target/badge/
permission changes using the existing synthetic source model. No actual Teacher
or Feedback backend is invoked or modified. Catalogue/GROUP/general revision
contracts remain those of Stage 1; all-writer/manual/Drive coordination is still
an outstanding production requirement. The new transport does not certify it.
The five-minute General Practice threshold remains 300 validated seconds. The
new positive threshold case exercises the full pull path; earlier boundary and
browser results are not recounted as new evidence.

## What these fixtures do not verify

- Real Google Owner authentication, OAuth reauthorisation, scopes, trigger identity,
  default-project behaviour, whole-project RPC exposure or private web-app access.
- TLS/certificates, real network reachability, outages/latency, DNS, quotas or a
  hosted gateway/PostgreSQL runtime. Timeout/failure hooks are local simulations.
- Production PostgreSQL transactions/roles/migrations or multi-process atomicity
  of the new protocol journal plus the Stage 1 queue. Local reopenings/injected
  interruptions are not OS power-loss or native crash/backup certification.
- A durable real Google original-manifest/replay journal made atomic with the
  canonical ScriptLock. Here the old Google double stores metadata in SQLite and
  calls the existing lock-taking VM writer; no future Apps Script refactor was
  installed or certified. There is no second writer or replacement recording lock.
- Real workbook/folder ACL isolation, historical pupil ownership or live recording
  privacy. All namespaces, sessions, keys and media are synthetic.
- Browser capture/pause/resume, encrypted device/offline recovery, origin changes,
  actual Google-frame/cookie/CSRF behaviour or screen-reader accessibility.
- Production key custody, key rotation/recovery, read-staging retention/sweeping,
  quota/window renewal, real teacher mutations or external-pupil release.

## Rollback and next approval

Parent `ec7cc0b...`, prior checkpoints and live v8/v5/v2/v1 remain preserved.
Only this inactive directory and an additive local npm command change. No main,
workflow, application source, Google setting or pupil data changes are needed to
discard the fixtures. Never clear existing pending recordings or reset a shared
branch as a rollback shortcut.

Return this checkpoint to CHAT 3. Further approval must name isolated resources
and ACLs; an actually reachable HTTPS/gateway/PG host and spending cap; identity-
only Google client/session controls; key/backup/restore arrangements; reviewed
same-canonical-project profile/manifest/inspector/worker code; the Pupil
`script.external_request` scope and Owner consent; and ONE manual synthetic Google
component attempt. Those actions remain unauthorised. A trigger, new private read
deployment, full Dummy pilot and external pupils each require later decisions.
Preserve all three existing Default Cloud associations and Owner-only deployments.
