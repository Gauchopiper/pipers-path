# Secure pupil access — staged domain implementation

27 October 2026. **Not deployed; not an external pupil application.**

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
current access state, never resurrect a previous link. One identity maps to one
pupil per organisation/scope in this initial model. Parent/multiple-child accounts
need an explicit future model, not a bypass of that uniqueness constraint.

`node access.test.cjs` runs 24 persistent-database fixture checks, including
injected transaction interruption and reopen. Identity assertions and canonical
pupil lookup are test doubles. No production schema or user records are changed.

## Mandatory adapter boundary

This is not an HTTP service. `actor.verified` is an internal adapter assertion,
not an authentication protocol. NEVER accept actor, verified, subject or scope
from request JSON, client headers or URL parameters. A production adapter must
derive them from its verified server-side identity provider and establish an
Owner binding independent of pupil credentials. Sites identity headers may only
be trusted behind the documented Sites dispatch boundary, never an exposed
origin with spoofable headers. Emails/display names are not durable subjects.

The SQLite implementation is a Node staging store, not a Cloudflare/D1 adapter.
A production adapter must preserve transaction/idempotency semantics and undergo
integration/failure tests. No HTTP routes, identity enrolment, authenticated
backend transport, or durable production store have been implemented here.

## Remaining work before any pilot

1. Confirm pupil sign-in method. Sites offers ChatGPT identity, not the Teacher
   Dashboard's Google session. Google-only pupil sign-in requires a supported
   alternative identity/hosting integration; do not invent a Sites OAuth stack.
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
