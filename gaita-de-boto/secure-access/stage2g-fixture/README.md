# Stage 2G — inactive offline integration adapters

> Historical Stage 2G checkpoint: c96a4cc. Stage 2I subsequently corrects the inactive prototypes. See ../stage2i-fixture/README.md for the current status; the historical execution evidence below is preserved.

This directory is an authorised offline development checkpoint, based on
`44ff37abb9a733518c5882a4eabb6e5a27cb7dac`. Nothing here is imported by an
application, workflow, deployment or server. No real Google identifiers,
credentials, recordings or pupil records are configured. The only package change
adds an explicitly invoked local test command. See [RESULTS.md](RESULTS.md).

## Reproduce

Use Node 24 and the existing lockfile's PGlite 0.5.13 development dependency.
From `gaita-de-boto/secure-access`, run:

```sh
npm run test:stage2g
```

For a new, non-overwriting evidence file:

```sh
npm run test:stage2g -- --record=another-local-check
```

The runner uses only disposable local directories. It overrides the HTTP,
HTTPS, net, TLS, fetch and WebSocket entry points used by this code to reject and
count attempted connections/listeners. This is an in-process test guard, not an
OS network sandbox. The tests contain no child-process or external-service path.
There is no database URL and no native-server fallback. Temporary local SQLite,
JSON, WASM PostgreSQL databases and synthetic keys are removed after the run;
only non-sensitive logs remain. A filter is diagnostic only: omitted cases are
reported as unexecuted, and an incomplete filtered run cannot succeed.

## Components and responsibilities

| Files | Implemented offline responsibility |
| --- | --- |
| `profile.cjs` | Fixed, branded, immutable synthetic environment and Owner/worker/session identities. A replacement policy invalidates old profiles. |
| `writer-proposal.cjs`, `canonical-writer.patch.proposed`, `canonical-adapter.cjs` | Proposed shared internal writer core, evaluated in a VM with isolated workbook/Drive doubles. Legacy entry retains its bindings. |
| `Protocol.gs.proposed`, `protocol.cjs` | Canonical JSON, UTF-8, Base64, SHA-256, Google-shaped RSA signing hook and independent RSA verification. Signed purpose, namespace, key, nonce and time window. |
| `journal.cjs` | Signed 16-field append-only event model persisted in SQLite, including nonce, manifest, receipt, outbox, acknowledgement and attention records. |
| `postgres.sql`, `postgres-adapter.cjs` | Separate `gdb_g_*` tables; admission CAS, encrypted originals, leases/fences, dispatch barrier, exact reconciliation, revisions and one-use encrypted reads. |
| `source.cjs` | Disabled-by-default synthetic Google execution adapter; source inspection, exact signed receipts, recovery and callback models. |
| `projection.cjs` | Source-compatible PATH fields/totals and distinct-pupil GROUP; protected audio projection without raw Drive links. |
| `device-confirmation.cjs` | Disconnected exact-response decision helper; no recorder, IndexedDB or browser changes. |
| `roles.sql.proposed` | Local permission-assumption probe; deliberately incomplete production role design. |
| `pg-offline-pool.cjs`, `test-support.cjs`, `run-tests.cjs`, `*.test.cjs` | Synthetic test harness and single-connection serialised PGlite facade. |

## Recording contract

The PostgreSQL transaction finishes before any source call. An immutable manifest
binds the original actor, environment/profile, Session ID, bytes, MIME type,
sample-validated duration, admission and base revision. Staging uses AES-256-GCM
with the manifest digest as associated data. An expired lease cannot overwrite a
fence, and a sent operation cannot be blindly reclaimed. The source journals its
intent inside the original ScriptLock before calling the existing mutation body.

The source inspects the original file, LOG, META and recording-receipt rows. Only
exact independently signed evidence can move a dispatched original to confirmed.
Duplicate completion cannot grant another practice credit or revision. Pending,
partial and revoked operations keep their encrypted originals. A source-complete
operation can be reconciled internally after revocation, while public status and
reads are denied. Changed resource profiles fail closed and retain evidence.

Until confirmation, the local decision is **SAFE ON DEVICE — awaiting
confirmation**. The disconnected device helper checks authenticated current
admission, actor/client session and exact original bytes before permitting a
future caller to show **SAVED**. It never erases anything itself. The database
also retains confirmed recording ciphertext: no retention deletion was inferred.

## Proposed canonical patch: review, do not apply

The patch contains four anchored changes in Pupil `Code.gs`: keep `gdbPUpload_`
as the legacy wrapper; introduce one shared `gdbPWriteCore_`; select the trusted
qualification value and folder; invoke an internal hook inside the existing
lock. The original mutation body and `MediaDuration.gs` are otherwise unchanged.
There is still one `.createFile(blob)` mutation path.

`gdbGTrusted_` and `gdbGBefore_` are currently VM capabilities. Their eventual real
Apps Script implementation, access boundary, source-equivalence review and
deployment/version interaction require separate approval and testing. Applying
the patch by itself would leave those functions undefined. Do not upload this
directory, apply the patch, expose new RPC methods or copy the writer into
another project. A ScriptLock is scoped to its Apps Script project; the offline
VM cannot certify coordination among real deployments, Teacher, Feedback and
manual workbook edits.

## Cryptography scope and provenance

`Protocol.gs.proposed` is self-authored, with no copied third-party verifier,
package, licence obligation or remote runtime import. SHA-256 uses the standard
FIPS 180-4 constants; RSA verification implements RFC 8017 sections 8.2/9.2 with
strict PKCS#1 v1.5 padding and SHA-256 DigestInfo. Supported public keys are RSA
2048 or 3072 bits with exponent 65537; weak sizes, RSA-PSS and malformed encodings
are rejected. Only public verification uses BigInt modular arithmetic. Signing
delegates to `Utilities.computeRsaSha256Signature`; the VM injects Node's signer
as a Google double. The verifier never uses Node crypto. Independent Node crypto
checks the output and supplies separate signatures and digests for comparison.

This is a candidate protocol, not audited cryptographic software or a certificate
of real Apps Script compatibility. Canonicalisation is the repository contract,
not a claim of universal RFC 8785 compliance. Actual Google V8 BigInt behaviour,
runtime quotas, Utilities bytes, key import, execution identity and performance
remain untested. Synthetic key rotation permits verify-only historical receipts;
revoked/missing keys deny verification. New requests always require a current
key and expiry. No private key, token or credential is written to this repository.

Primary references for later review:

- https://www.rfc-editor.org/rfc/rfc8017.html
- https://developers.google.com/apps-script/reference/utilities/utilities
- https://developers.google.com/apps-script/guides/v8-runtime

## Journal, callbacks and protected reads

The 16 fields are exactly: Event ID; Sequence; Environment; Profile Digest;
Session ID; Operation ID; Purpose; Nonce; State; Occurred At UTC; Request Digest;
Payload JSON; Previous Event Digest; Event Digest; Key ID; Signature.
The journal's `DISPATCH` payload contains the original manifest. `RECEIPT` stores
the durable signed recording confirmation and acts as its recoverable delivery
record. Read `OUTBOX` events store signed metadata and a source blueprint;
playback bytes are reconstructed and re-hashed, never put into the 16 KiB journal
payload. Generic OPERATION/ACK/ATTENTION events are persisted and tested as a
model; a real authenticated Google callback/acknowledgement transport is not
implemented. There is no automatic source-write retry after uncertainty.

SQLite's local commit is not a Sheets/Drive transaction. Interrupted or torn
appends, partial files/LOG/META and conflicting evidence stop confirmation.
Sequence/hash/signature verification detects changed and removed intermediate
events; removal of the whole journal or a valid tail still needs an independent
durable high-watermark, backup and rollback-detection design. Real Sheets append,
flush/readback and quota failure semantics remain a future port and test gate.

The read broker rechecks current admission and revision before source access,
staging and release. Handles are opaque, hashed, one-use and bound to the Owner's
authenticated client session; the relay sees only the handle and an opaque ack.
Source data goes directly to encrypted gateway staging. Stale, revoked, foreign,
changed or unsigned data fails closed, with generic relay errors and no-store
response headers. Release consumes and clears only staged read data. A lost read
callback can be reconstructed from the source while the original ticket remains
valid; expiry requires a new authorised request, not a stale fallback.

## Limits and next gate

**IMPLEMENTED / TESTED OFFLINE:** the components and evidence above.
**PROPOSED:** the canonical source patch, Google journal port, authenticated pull
transport, deployment/configuration, full runtime SQL privileges and browser
confirmation adapter. **BLOCKED:** real integration pending Owner approval and
the checks below.

1. Compare the real private Pupil version with this repository source without
   retrieving pupil data; review the shared-core patch and same-project lock.
2. Independently review this original crypto candidate and authorise a bounded
   synthetic Google runtime test before relying on it.
3. Design the real journal port, separate workbook, durable high-watermark,
   authenticated receipt delivery/acknowledgement, backup and partial-write
   recovery. No journal workbook has been created.
4. Confirm Owner-run UrlFetch scope, reauthorisation, HTTPS origin/TLS, key custody,
   rotation and revocation. Owner execution retains broad Google authority;
   fixed IDs and physical Dummy data isolation do not restrict the Owner token's
   underlying access. No personal refresh credential is requested or delegated.
5. Select and authorise hosting, PostgreSQL, staging retention, backups,
   monitoring and expenditure separately. No provider or price is approved here.
6. Verify this NEW adapter with independent native PostgreSQL connections,
   server crashes and real login/roles. Existing 38 native checks remain accepted
   but did not execute this new adapter. PGlite logical concurrency is serialised.
7. Complete migration/coordinator/backup roles and per-environment database
   isolation. Local NOLOGIN/SET ROLE probes are not authenticated role or RLS
   assurance, and the illustrative reader can see all rows in its database.
8. Coordinate every real Teacher, Feedback, pupil/manual writer with revisions,
   or deny reads while their state cannot be trusted. Synthetic revision proofs
   do not prove those applications changed safely. Actual badge/target/comment
   workflows and browser display remain unexecuted.
9. Review authenticated Google Sign-In, browser session/CSRF/CSP, iframe and
   playback delivery, and exact encrypted IndexedDB recovery/cleanup without
   rotating capabilities. No browser or live recorder test occurred.

Recommend CHAT 3 review this offline checkpoint first, then obtain a narrowly
scoped approval for source/crypto/journal review and a separately specified
manual synthetic Google component test. Do not activate Dummy, create resources,
modify Google source/scopes, deploy, provision hosting or start a pilot on the
strength of these results. The inactive Dummy and all nine real workbook tabs
remain outside this code path. Rollback reference: `44ff37a`; discard this
inactive directory and optional test script locally, without changing main or
triggering deployments. No rollback or deployment was performed.
