# Secure recording and protected-read integration contract

30 October 2026. Fixture-tested reference contracts, **not a production selection**.
Current applications and Google authority remain unchanged. No receiver is exposed.

## Trust boundaries and current gap

The intended recording flow is authenticated pupil → authorised gateway → queue
and private worker → EXISTING canonical Apps Script writer → exact authoritative
receipt → authorised gateway → confirmation of the original local recording.
The interactive reference flow is authenticated pupil → authorised gateway →
protected direct PATH/playback. A versioned protected cache remains an alternative.

Only the staged identity verifier may create a verified actor: stable Google sub,
configured audience/scope, expiry, nonce/session/CSRF checks. Browser-supplied email,
name, pupil ID or an opaque link alone never establishes identity or a grant. The
gateway resolves adult/guardian-to-child membership and selects the organisation
and pupil from server-held grants. A guardian may hold independent child grants;
one revoked relationship cannot silently grant or revoke another.

Check current grant, canonical pupil activation and organisation at login/selection,
enqueue, claim, immediate pre-write, receipt/status and before/after protected read.
Unavailable identity/authorisation is denial or pending, never cached permission.
The trusted worker must recheck access even if an earlier signed job was valid.

**Unresolved transport:** no approved direct server-to-Google route is configured.
Owner-run pull is an asynchronous candidate; its polling delay does not establish
interactive usability. Current Owner-only Apps Script bridge is not an external
pupil gateway. Do not publish it, delegate an Owner refresh token, weaken scopes/
permissions or create another recording writer to hide this gap. Any concrete live
transport, identity, account, credential or Google deployment needs separate approval.

## Request and response authentication

Future private receiver transport must authenticate the service caller, integrity,
freshness and replay independently of pupil authorisation. Reuse the tested queue
envelope principles: version, method, allowlisted action/path, sender role, request
UUID, issued time, nonce, organisation, pupil, subject/scope, original Session ID,
immutable recording metadata and body/hash. Persist nonce consumption atomically.
Use TLS and managed durable keys with rotation, audit and no secret logging.

A response must bind request UUID/nonce, caller, organisation/pupil/session, complete
immutable fingerprint, inspection revision, receipt state/digest and validity time.
Accept only an authenticated response from the intended authority. An HTTP 200,
queue acknowledgement or unverified `{saved:true}` is never confirmation. Network
response authentication is specified here, not implemented by this in-process fixture.

## Immutable recording intent and exact receipt

Before dispatching a NEW recording, the same-writer authority needs durable,
immutable original intent. Namespace by organisation + original Session ID; do
not regenerate IDs on retries. Client cannot choose a file, folder, workbook or URL.

| Evidence | Required binding and source |
|---|---|
| Organisation/pupil | Fixed server namespace + current canonical pupil/grant |
| Verified subject/scope | Original trusted gateway actor, persisted before dispatch; not inferred from the current retry caller |
| Session ID | Original UUID, unique operation identity |
| Audio | SHA-256, exact decoded length, supported MIME, original bytes |
| Time/duration | Original start/end claims plus independently validated sample duration; retain canonical normalised end separately |
| File/folder | Server resolves file from exact canonical pupil/session; current approved private folder and file binding |
| PRACTICE LOG | Exactly one matching pupil/session/file; sample-derived duration, timestamps and qualification |
| SESSION META | Exactly one matching file/pupil/session; stable identity fields; teacher review/note fields may evolve |
| Confirmation | Complete immutable intent + canonical file/folder/log/meta evidence and authenticated receipt |

The fixture stores intent in memory only. It is NOT durable proof across process
loss. Real accepted/dispatched intent must survive before Google side effects.
Do not backfill subject/scope from whoever retries an old recording. A historical
save lacking original identity evidence remains unbound and requires a separately
designed Owner reconciliation; no existing history is changed by this work.

Original timestamps remain immutable in intent. Existing writer logs a canonical
end derived from start + validated samples; a tolerated one-millisecond original
end discrepancy must not be silently substituted into the original intent. Receipt
contains both original binding and canonical validated times. Fixture confirmation
requires its bound duration to equal independently parsed samples; an admission-
tolerated declared/sample discrepancy remains pending rather than invented success.
Before live use, specify sample-derived normalisation before immutable acceptance,
retaining any original declaration separately, and test actual recorder formats.

Preserve the existing media parser, 14 MiB base64 ceiling, 15 MiB legacy request
ceiling, maximum 7200-second timestamp span and independent duration validation.
Five-minute qualification means **validated samples >= 300 seconds**, never rounded
minutes. MIME allowlisting does not establish codec validation: current parser
supports PCM WAV and Chrome WebM/Opus; MP4/OGG evidence is rejected. New media tests
here used generated WAV only. Real WebM and device behavior remain unverified.

### Read-only inspection

A private inspection action must take a consistent canonical snapshot and return
evidence only. It must NOT create a RECORDING RECEIPTS tab, add/repair META, write
an identity manifest, change targets/reviews or update practice/badges. In particular
it cannot call the existing `gdbPRecordingState_` unconditionally: that function
calls `gdbPEnsureMeta_` and may create the receipts sheet on an absent lookup.

The fixture inspector reads existing table arrays and private file snapshots
directly. No journal/META rows are created, including on missing metadata. It
validates exact bytes through the unchanged media parser and checks authorisation
again before returning. Source snapshots must be consistent with the authoritative
revision; the in-process Google double is not a real locked snapshot implementation.

Return states:

| State | Action and local protection |
|---|---|
| ABSENT + retrySafe | No log, META, journal or matching file observed, and no dispatched intent; only an initial controlled dispatch is eligible |
| SAVED | Full original intent and canonical evidence match; only then confirm that exact local Session ID/hash |
| ATTENTION | STARTED, dispatched uncertainty, orphan/missing/duplicate/mismatched records; inspect/reconcile, never automatically upload again |
| UNBOUND | Existing recording lacks original identity manifest; no new caller can adopt it |
| DENIED / unavailable | No private result or false success; retain encrypted local audio |

Read-only ABSENT does not itself register intent or claim original-subject provenance.
Register new intent only while holding the canonical authority's uniqueness guard,
after proving absence and before dispatch. The queue's manual reconciliation path
is receipt-only even if an inspection later reports absence. An explicit retry
needs authoritative safe-before-write evidence and reviewed workflow, not a timer.

Metadata repair is a distinct, authenticated, authorised mutation of the EXISTING
canonical writer with its own operation receipt, revision advance and audit. After
repair, inspect again. A lost successful response may be confirmed by exact saved
evidence without another upload. A file-without-log is not a successful save.

### Preserve the existing single-writer lock

All recording mutations must continue through `gdbPUpload_`/its existing authoritative
writer. Keep same-project ScriptLock and receipt-before-create behavior. Never hold
an outer ScriptLock and then call a function that independently waits for that same
lock. A future reviewed refactor would need one lock-taking entrypoint and a shared
internal locked core that registers immutable intent, checks receipt/ownership/grant
and dispatches the existing file/log write. No such live refactor was made here.

The fixture receiver uses a process-local mutex and delegates to the unchanged
writer VM. This does NOT prove ScriptLock, distributed fencing or native concurrency.
Queue fencing protects queue state, not a Google operation already running. No
distributed exactly-once transaction is promised. Separate Apps Script projects'
ScriptLocks do not coordinate each other's Pupil/Teacher changes.

The tested queue adapter strips a fully validated internal receipt to the existing
queue's `{saved:true,binding}` attestation. It never treats a weaker/legacy receipt
as complete evidence. Keep full canonical evidence/audit durable at the authority;
that persistence is not implemented by the fixture. Public pupil confirmation
excludes file/folder IDs, subject/scope and Drive URLs. It binds Session ID/hash/
length/MIME/validated seconds so only that protected local item becomes eligible
for deletion. Actual browser deletion/migration was not implemented or tested.

## Authoritative revision contract

An opaque version token contains organisation restore generation, shared catalogue
revision, pupil data revision and access revision. All are server-issued. Pupil
and organisation remain separate authorisation keys; a token is not permission.

Every canonical mutation follows: persist DIRTY with immutable operation identity
and expected version → perform the original authorised mutation → independently
inspect canonical outcome → atomically advance relevant counters and mark operation
complete/clear DIRTY. Any incomplete state makes direct and cached reads fail closed.
Do not clear DIRTY because a lease expired or a browser retried. Reconciliation
requires exact operation/pupil/event/request-digest/source evidence.

The SQL fixture commits counter changes and operation receipt together. It does
NOT make SQL and Google Sheets one transaction. A live authoritative coordinator
must cover every real writer before mutation, including private Teacher and any
manual edits. Either a reviewed common same-project mutation authority or an
equally strong shared coordinator is needed; neither topology is selected here.
If a path can bypass coordination, that is a live-release blocker, not an excuse
to advertise cache consistency. Direct reads also need coherent source snapshots.

| Mutation | Invalidation |
|---|---|
| Recording saved/reconciled | Sessions, totals, availability, pupil revision |
| Recording availability/folder/ACL changes | Availability and pupil revision; current file checks still required |
| Target assigned/per-pupil changed | Targets and pupil revision |
| Target achieved | Targets, badges and pupil revision |
| Per-pupil badge award/change | Badges and pupil revision |
| Teacher comment create/edit/remove | Comments and pupil revision |
| Teacher review/status/note | Reviews, dependent targets/badges and pupil revision |
| Pupil activation/deactivation/revocation or grant changes | Access + pupil revision; actual membership rechecked independently |
| Shared target/badge catalogue edit | Organisation-wide DIRTY barrier; then catalogue revision invalidates every pupil view |
| Restore/replacement of authoritative state | Rotate generation before serving traffic; preserve/reconcile DIRTY and operation evidence |

Shared catalogue invalidation is conservative: all pupil views are blocked during
an edit. Do not trust a client-provided affected-pupil list or miss pupils through
partial fan-out. Global and pupil mutations cannot overlap unresolved operations.
Concurrency rule: compare expected version, lock organisation coordination first,
then the selected pupil; duplicate operation is idempotent, changed payload conflicts.
Canonical operation encoding is independent of JSON object property order.
Actual lock/deadlock behavior still requires native independent-connection tests.

Revisions are monotonic within a generation. Restore must rotate generation so old
tokens cannot become valid again even if numeric counters move backward. Epoch
rotation does not grant membership or clean incomplete operations. The fixture
executes this rotation, but no real backup/restore was tested. External file ACL,
Drive trash/removal or direct worksheet edits need a controlled mutation or verified
source-change detection; there is no such live listener here. Actual file/ACL checks
remain necessary at playback even when a revision appears unchanged.

## Direct PATH and protected playback reference

Authenticate/currently authorise selection → read clean authoritative version →
retrieve only that pupil's canonical projection → require same clean version and
current grant before responding. A source failure or DIRTY never falls back to
stale data. Projection contains totals, own sessions/targets/badges and own teacher
comments/reviews, excludes other pupils, capabilities, private URLs and teacher email.
Future UI fields and approved artwork remain explicit projection decisions.

Audio requests contain a Session ID, not a file/folder URL. Resolve through the
exact pupil/session log, verify original canonical binding, private folder/file
and current membership, then return protected bytes with no-store/nosniff headers.
Do not share Drive audio or return a public link. The existing read fixture's
ownership provider is simulated; a real adapter must enforce actual folder/ACL
and log binding. Range/stream requests need the same checks; this fixture buffers
synthetic bytes and does not certify streaming, CORS, HTTP credentials or revocation
during a real network transfer. Bytes already delivered cannot be recalled.

In logical fixture execution a revision change invalidates the next clean-version
lookup immediately, and a committed revocation denies the next current-grant check
or final response check. No real network propagation bound, Google latency or SLA
was measured. An already committed recording cannot be undone by queue revocation.

The optional cache stores selected PATH fields only in fixture process memory,
keyed by organisation+pupil+authoritative version. Grant checks and clean-version
queries remain current on every request. No audio or grant is cached. TTL limits
serving, not physical retention; idle entries remain until sweep/process exit.
No real-data cache policy, durable encryption, memory quota, invalidation bus or
production selection is authorised. Edits bypassing revisioning demonstrably still
serve stale comments in cached mode; tests retain that limitation as a release gate.

## Native verification protocol — not executed here

Use a non-root local PostgreSQL-owned disposable cluster/database, never production.
Existing helper requires loopback and a `gdb_*_fixture` database name. Keep credentials
in local environment/approved secret mechanisms, never paste them into Chat or logs.
Run the existing queue suite with `GDB_FIXTURE_NATIVE_URL` set locally. Its three
races are prepared; they were not executed in this environment.

Then explicitly verify: distinct `pg_backend_pid()` values; two connections racing
for one lease; concurrent identical Session ID submissions creating one job/stage;
identical-envelope nonce accepted once; one transaction holding a candidate row lock
while a second `SKIP LOCKED` claim promptly gets another job, then the original after
release. Use bounded lock/statement timeouts and barriers, not a timing-only guess.

Exercise expired lease/fence and stale load/fail/success acknowledgements; disconnect
a worker during an uncommitted transaction; recover a writer-success/queue-response
loss without upload; inject SQL failure and verify all relevant state rolls back.
Where safe in this owned cluster, force opposing lock order and verify deadlock
victim/rollback handling without replaying uncertain Google side effects.

Stop/restart only that disposable owned cluster and verify consumed nonces, intent,
receipt, encrypted audio, incomplete job and DIRTY state survive. Make a real native
logical backup with pg_dump and restore into a SECOND empty local fixture database;
compare original IDs/hash/state/operation receipts and rotate the restored generation
before reads. Record tools/versions, commands, observed counts and any skipped checks.
Do not describe PGlite close/reopen, synthetic callback failures or an in-memory
manifest as this native crash/backup evidence.

## Approval boundary and rollback

Fixture publication to the existing staging branch is authorised; PR #6 stays draft
and unmerged. The next live proposal must explicitly identify Google execution
identity/transport, same writer project, minimal permissions, durable manifest and
revision storage, all affected mutation routes, dummy-only scope, safeguards and
rollback. It requires Leslie's specific approval before any credential/configuration,
real private-data cache, new account/trigger, deployment, external pupil or expenditure.
No Owner Google refresh token or second audio writer is part of this fixture.

Stopping these tests/discarding synthetic local databases is sufficient fixture
rollback. Preserve published baseline c2a17051c954e7d5f21e1e20b89974dda7e63401 and
all existing private application versions. Never erase encrypted pending audio,
reset Session IDs, change real practice totals or modify other organisations.
