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

`npm test` runs 23 persistent-database checks, 17 Google-crypto/guardian/gateway checks,
and 14 local HTTP/session integration checks, including
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

The SQLite implementation is a Node staging store, not a Cloudflare/D1 adapter.
A production adapter must preserve transaction/idempotency semantics and undergo
integration/failure tests. `http-app.cjs` now provides staged POST routes for login challenge, Google token
verification, session retrieval/logout, Owner provisioning/status and pupil actions.
`sessions.cjs` provides hashed opaque session IDs, one-use challenges, expiry,
server-side CSRF checks, rate limits and verified-identity enrolment references.
Sessions are Secure/HttpOnly/SameSite=Strict host cookies. Intended GIS popup
callback uses same-origin POST; a full-page redirect flow needs separate cookie
and CSRF review. An enrolment reference is not a pupil grant or proof of guardianship.
The Owner must independently verify who is presenting it and the child relationship.
There is no public listen() entrypoint, production session/database store,
authenticated Google data transport or live Teacher v2 UI integration.
The HTTP integration tests use a real loopback server, synthetic Google-signed-format
tokens and fixture keys with the real verification library. Cookie attributes are
asserted, not exercised by a genuine HTTPS browser. They are not live Google tests.
`google-auth.cjs` uses google-auth-library.verifyIdToken, exact audience/issuer/expiry,
nonce and atomic one-use challenge consumption. Callers must supply browser-bound
server challenges, never trust a client-provided challenge object.
`pupil-gateway.cjs` routes all pupil action types through one membership check;
its authenticate adapter is connected to the staged session store by http-app.cjs;
the private Google backend adapter is still unimplemented.

## Remaining work before any pilot

1. Google Sign-In is now selected. Proposed deployment: separate HTTPS Node
   frontend/gateway on Google Cloud Run with durable transactional database
   (Cloud SQL PostgreSQL adapter to be implemented); never use instance-local
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
   This module provisions existing IDs only; it does not create pupil rows.
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
SQLite store on ephemeral Cloud Run disks. A production database adapter and
explicitly reviewed configuration are prerequisites, not deployment defaults.

The existing Apps Script recording service must remain the single audio writer:
its ScriptLock/receipt journal cannot coordinate with an independent Cloud Run
writer. A private authenticated gateway transport to that writer must be designed
and tested. Do not publish the present bearer-key doPost endpoint, pass Owner
cookies to pupils, share the workbook publicly, or write recordings directly from
a second process. Protect replay, request integrity and pupil/session/file binding
on both ends, and do not retain any legacy bearer-only external fallback.

Owner HTTP controls are a staging integration, not a change to the existing
Teacher Dashboard v2. Connect the existing dashboard only after its verified
Owner identity can be securely transferred/bound to the new gateway. Creating a
new canonical pupil plus provisioning still needs durable cross-service recovery.

The legacy 41190f5 SQLite database layout is explicitly rejected; no production
database used it. If a retained staging fixture must be preserved, implement an
explicit reviewed migration rather than deleting it. Current private recorder
IndexedDB is unrelated and must never be cleared or migrated implicitly.
