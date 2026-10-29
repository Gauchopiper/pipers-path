# Secure pupil access — staged domain implementation

28 October 2026. **Not deployed; not an external pupil application.**

The authoritative implementation history remains the existing Google handover.
This README describes this module's contract only.

## Implemented

`access.cjs` implements identity-bound membership provisioning against an existing
canonical pupil ID. Provisioning and rotation start inactive. Activation,
deactivation, revocation and replacement are Owner-only. An opaque personal URL
selects a membership; it does not authenticate its holder. Every authorization
requires the bound verified subject and identity scope, matching organisation,
active state, unexpired membership and a still-existing canonical pupil.

SQLite transactions atomically persist membership, operation receipts and audit.
Expected revisions prevent stale management writes. Replayed operations return
current access state, never resurrect a previous link. Explicit identity-to-pupil grants support multiple children and multiple guardians.
Every grant requires a relation and private authorisation/consent evidence reference.
The server canonical adapter must supply adult/child classification. Google sign-in
does not prove guardianship: the Owner must verify the relationship and evidence.
Old staging databases with the one-identity uniqueness constraint are rejected
for explicit reviewed migration; no implicit production data migration is performed.

`npm test` runs 23 SQLite access checks, 17 Google-crypto/guardian/gateway checks,
15 SQLite HTTP/session checks, 17 PostgreSQL-engine checks, the same 15 HTTP checks
against PostgreSQL, 5 private-connector contract checks and 12 canonical/provisioning checks
(104 check executions total), including
injected transaction interruption and reopen. Identity assertions and canonical
pupil lookup are test doubles. No production schema or user records are changed.

## Mandatory adapter boundary

The core remains separate from the staged HTTP adapter. `actor.verified` is an internal adapter assertion,
not an authentication protocol. NEVER accept actor, verified, subject or scope
from request JSON, client headers or URL parameters. A production adapter must
derive them from its verified server-side identity provider and establish an
Owner binding independent of pupil credentials. Sites identity headers may only
be trusted behind the documented Sites dispatch boundary, never an exposed
origin with spoofable headers. Emails/display names are not durable subjects.

The SQLite implementation remains a reference/test store. postgres.cjs now
implements durable PostgreSQL access, grants, sessions/challenges, enrolment,
receipts/audit and rate limits with transactional migrations. HTTP handlers await
asynchronous stores and have been exercised against the PostgreSQL engine.
Cloud SQL network/pool/concurrency and infrastructure tests remain required. `http-app.cjs` now provides staged POST routes for login challenge, Google token
verification, session retrieval/logout, Owner provisioning/status and pupil actions.
`sessions.cjs` provides hashed opaque session IDs, one-use challenges, expiry,
server-side CSRF checks, rate limits and verified-identity enrolment references.
Sessions are Secure/HttpOnly/SameSite=Strict host cookies. Intended GIS popup
callback uses same-origin POST; a full-page redirect flow needs separate cookie
and CSRF review. An enrolment reference is not a pupil grant or proof of guardianship.
The Owner must independently verify who is presenting it and the child relationship.
There is no public listen() entrypoint, configured hosted database,
live authenticated Google data transport or live Teacher v2 UI integration.
The HTTP integration tests use a real loopback server, synthetic Google-signed-format
tokens and fixture keys with the real verification library. Cookie attributes are
asserted, not exercised by a genuine HTTPS browser. They are not live Google tests.
`google-auth.cjs` uses google-auth-library.verifyIdToken, exact audience/issuer/expiry,
nonce and atomic one-use challenge consumption. Callers must supply browser-bound
server challenges, never trust a client-provided challenge object.
`pupil-gateway.cjs` routes all pupil action types through one membership check;
its authenticate adapter is connected to either session store by http-app.cjs.
apps-script-client.cjs is a disabled-by-default private Execution API client;
its matching Apps Script receiver and live configuration are NOT implemented.

## Remaining work before any pilot

1. Google Sign-In is now selected. Proposed deployment: separate HTTPS Node
   frontend/gateway on Google Cloud Run with durable transactional database
   (PostgreSQL adapter implemented; hosted configuration/testing pending); never use instance-local
   SQLite as production Cloud Run storage. Existing private Site remains intact.
   Configure an Owner-controlled Google Cloud project, web OAuth client, approved
   domain/origin and consent screen; no project, billing or access grants have
   been created. Only identity scopes, no pupil Drive/Sheets authorisation.
   Pilot guardian's own Google account first. GIS button without FedCM is the
   supervised-account candidate; One Tap/FedCM is not a Family Link fallback.
   Test actual authorised family/device configurations before claiming support.
2. Implement verified identity enrolment and Owner controls in the existing
   Teacher workflow. A subject binding must come from a proven sign-in exchange,
   never a pupil-supplied email claim. No Annie activation is authorised.
3. Integrate the canonical workbook: new pupil creation and provisioning need a
   durable operation/saga with explicit inactive pending state across services.
   The disabled provisioning module now coordinates the existing Teacher creation contract and access receipts; the authenticated live transport and Teacher UI remain pending.
4. Implement a server-side pupil gateway. All PATH, audio, save, receipt, GROUP,
   target and feedback operations must derive pupil identity from authorization;
   never forward a client-selected pupil ID or accept an old bearer key as an
   alternate external path. Recheck membership on every request, including audio.
   Keep Drive/workbook private. Bind retrieved audio to that pupil's logged file
   and the configured recordings folder. Do not expose a generic Drive proxy.
5. Protect unsafe requests against CSRF; reject foreign origins, use secure
   sessions, no-store private responses, rate limits and scrubbed diagnostics.
6. Preserve recovery: current pending-store encryption derives from the original
   pupil capability. Do not rotate that capability or migrate origin as a side
   effect of link replacement. Design/review device recovery separately; preserve
   old encrypted blobs and original Session IDs. Revocation must block network
   access, but must not delete local audio. Resume only after identity is restored
   and receipt-before-upload has reconciled the original session.
7. Verify real authorized identities and pupil-only data/audio access; test
   stolen links, revocation, expiry, cross-pupil/cross-organisation, offline
   recovery and exact session integrity. Then request the Owner's approval of
   the concrete external deployment before issuing a live link.

Private recorder v8, Teacher v2, Pupil v5 and Feedback v1 remain unchanged. This
directory must not be copied into the current static Site archive or treated as
evidence that external registration is complete.

## Official sources reviewed 27 October 2026

- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/guides/personalized-button
- https://developers.google.com/identity/gsi/web/guides/offerings
- https://docs.cloud.google.com/run/docs/container-contract

Google documents Family Link parental approval in the ordinary button flow and
explicitly says the FedCM button does not currently support Family Link accounts.
This documentation check is not a genuine Family Link compatibility test.

The Teacher v2 integration and canonical Google Sheets/Drive gateway are still
pending. Do not point these modules at production or expose an HTTP endpoint
until session/CSRF/rate-limit, identity enrolment, durable transaction adapters,
file binding, offline recovery and real account tests have passed.

## Production gate and continuation

No Cloud project, OAuth client ID, external origin, billing arrangement, production
database or service identity has been configured by this work. Do not deploy the
SQLite store on ephemeral Cloud Run disks. The PostgreSQL adapter is implemented, but hosted configuration and genuine
multi-process tests are prerequisites, not deployment defaults.

The existing Apps Script recording service must remain the single audio writer:
its ScriptLock/receipt journal cannot coordinate with an independent Cloud Run
writer. A private authenticated gateway transport to that writer must be designed
and tested. Do not publish the present bearer-key doPost endpoint, pass Owner
cookies to pupils, share the workbook publicly, or write recordings directly from
a second process. Protect replay, request integrity and pupil/session/file binding
on both ends, and do not retain any legacy bearer-only external fallback.

Owner HTTP controls are a staging integration, not a change to the existing
Teacher Dashboard v2. Connect the existing dashboard only after its verified
Owner identity can be securely transferred/bound to the new gateway. The provisioning journal now supports recovery across canonical creation and access provisioning. Live Teacher UI, transport and consent metadata integration remain pending.

The legacy 41190f5 SQLite database layout is explicitly rejected; no production
database used it. If a retained staging fixture must be preserved, implement an
explicit reviewed migration rather than deleting it. Current private recorder
IndexedDB is unrelated and must never be cleared or migrated implicitly.

## Private writer feasibility — Owner decision before live configuration

The existing Owner-only web-app deployment is not a service-account API. Google
explicitly does not support service accounts for Apps Script Execution API.
Supported candidate: add an API-executable deployment to the SAME Apps Script
project, limited to MYSELF, sharing a standard Cloud project with a separate
server OAuth client. Use the Owner's explicitly authorised user OAuth grant on
the server; pupil Google login remains identity-only with no Drive/Sheets scopes.

This would allow the server to exercise the script's Google scopes under Owner
authority. Its refresh credential must be protected in a managed secret store,
access-limited to the gateway, revocable and never sent to pupils. Google's API
requires all scopes used by that script, not just a narrowly selected method.
This is a material delegation decision, NOT authorised by selecting pupil Google
Sign-In. No Owner grant, Cloud project reassociation, API deployment or scope
consent has been created. Confirm this approach before changing the writer.

apps-script-client.cjs only calls the configured API-executable deployment at
script.googleapis.com with a fixed receiver function, devMode false, bounded
payload and preserved Session ID. It rejects mismatched response bindings and
never blindly retries an uncertain upload. Five tests use mock transport.
The receiver still needs strict Owner enforcement, organisation/pupil binding,
request freshness/replay protection, safe dispatch to existing writer functions,
and protected file/folder validation. A returned Drive URL must not become an
external playback link. Existing feedback backend integration also remains.

If Owner OAuth delegation is declined, retain the current private deployment.
An alternative is an Owner-run Apps Script worker pulling an authenticated job
queue, preserving the same writer project, but this needs separate design/tests
and introduces polling latency. Do not substitute a public bearer endpoint or
a second Cloud Run audio writer. Neither alternative has passed a live test.

Official feasibility sources reviewed 28 October 2026:
- https://developers.google.com/apps-script/api/how-tos/execute
- https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run
- https://developers.google.com/apps-script/manifest/web-app-api-executable
- https://node-postgres.com/features/transactions

## Canonical pupil / provisioning continuation — 29 October 2026

canonical-pupils.cjs projects the existing eight-column PUPILS schema without
exporting legacy keys, links or short codes. It rejects duplicate canonical IDs.
A separate reviewed profile provider must supply adult/child classification and
its evidence: the workbook currently has no such field. Never infer age from names.
The injected server transport must select the Gaita workbook; no client workbook
ID is accepted. No live workbook transport is configured.

provisioning.cjs is disabled by default. Its Owner-only workflow accepts a verified
session enrolment reference, explicit relationship/evidence and original operation
UUID. Migration 002 records intent before calling the Teacher creation contract.
A new row is created inactive through the existing Teacher function; retries use
that same UUID. Existing pupils are never recreated. Access provisioning has its
own idempotent receipt. Failure leaves a complete inactive canonical row and a
pending or record-created journal, not automatic deletion/activation. Retry the
same operation with the same payload. Changed payload requires manual review;
do not blindly generate another creation UUID. Journal state is a workflow milestone,
not a replacement for current active/revoked access status. No personal link is returned.

The optional /owner/provisioning HTTP route uses the same verified Owner session,
origin and CSRF controls. Its tests include rejection before invoking the adapter.
Actual Teacher creation code is run in a VM with mocked workbook/Owner/lock APIs;
this tests canonical row format and deduplication but NOT Google's live identity,
Spreadsheet flush guarantees or ScriptLock concurrency. Real database concurrency,
crash restart and cross-service reconciliation need deployment tests.

No Teacher v2 UI, live recording receiver or queue worker was deployed/implemented
by this continuation. The architecture comparison and decision remain in the
existing authoritative Google handover. No Owner OAuth credential is requested.

### Required controlled pilot evidence (not yet performed)

- Adult and guardian actual Google logins; wrong audience/nonce/account denied;
  supervised-child/Family Link separately. Guardian two-child grants remain separate.
- Existing pupil provisioning does not duplicate rows. Interrupted create/provision
  with database and workbook unavailable recovers the same UUID. Missing consent
  blocks activation. Revoke/replace denies existing sessions and old selectors.
- Writer checks organisation/pupil, expiry and authorisation at execution, not just
  enqueue. Replay/stale/tampered envelope denied; foreign file/folder denied.
- Upload with original Session ID, then dropped acknowledgement: receipt query
  returns the sole canonical log/meta/audio record; uncertain STARTED stops retry.
- PATH/GROUP/target/feedback and protected audio contain only authorised data;
  no raw Drive URLs or keys. Test alternate accounts, not only source fixtures.
- Network loss/reopen preserves encrypted audio and key, including access-link
  replacement; new origin cannot silently inherit old IndexedDB. No automatic clear.
- Queue candidate: lease expiry, worker overlap, stale ack, hash mismatch, quota
  exhaustion, expired staging object, revoke-after-enqueue, retry and retention.
- Restore a database backup, TLS/pool/multiple-instance contention and rollback
  preserving job/operation receipts. No approval implied by local passing checks.

## Fixture-only queue investigation — 29 October 2026

`npm run test:queue` separately runs the upload queue's 30 checks and deterministic
polling model. It does not rerun the previous 104 access/provisioning executions.
See queue-fixture/README.md for implemented boundaries, synthetic measurements
and limitations. No production module imports this fixture. No Google grant,
worker trigger, external endpoint or provisioning activation is configured.
Local SQLite is strictly a fixture store, never proposed Cloud Run production
storage. The existing PostgreSQL adapter is unchanged. Queue production port,
private writer receiver, protected read path and live tests remain pending.
