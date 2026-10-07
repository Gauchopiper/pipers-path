# Reliable saving / local outbox — implementation and validation

Status: implementation branch, **not deployed**. The current pupil frontend is integrated. Additive backend and feedback-form installers are prepared and tested against inspected exports. Current live Apps Script exports are still required to integrate and validate every pupil/teacher lesson-comment and review handler. Do not label this complete or production-proven.

## Baseline and source limits

Base: `Gauchopiper/pipers-path`, `main` at `1d629da`. Working branch: `feature/reliable-local-outbox`. Initial implementation commit: `cb3d38c` (local). Automatic approval review blocked pushing this branch to the public repository because external publication was considered outside the authorization given. The branch is not published; user approval is required before retrying the push.

Read: Common Foundation, Shared Standards, Piper's Path Identity & Guidelines, Current Project Instructions, Sharing & Deployment Guide and Organisation Clone Runbook. Existing legacy pupil/session IDs remain local; no cross-app entity identity has been introduced.

The current frontend uses MediaRecorder -> Blob -> base64 POST -> response acknowledgement; on an unreadable response it uses `getPathWithRetry` and the existing random Session ID to recover. Target tagging is a separate write with read-back. This recorder, MIME selection, playback, upload payload, endpoint bootstrap and target flow are retained.

Accessible backend exports are older than the documented live recording-metadata and organisation-clone fixes. The pupil report handler already uses a random request ID plus a locked, durable feedback row. The separate tested teacher-report handler validates signed, expiring tickets against active teacher roles, with a separate sanitised dashboard model. These report handlers are **not evidence that every current pupil lesson comment, teacher note or review handler is covered**. Those current sources were unavailable. No older backend was pushed over a live deployment.

## Files changed

- `assets/js/local-outbox.js`: persistent queue, scoped storage, atomic tab claims, bounded delivery, panel and export.
- `assets/js/recording-outbox.js`: existing audio transport/read-back/target adapter.
- `assets/js/text-outbox.js`: authenticated, idempotent existing report adapter.
- `index.html`, `emgt-tsop/index.html`, `spbasa/index.html`, `ciypb/index.html`, `test/index.html`: store each completed Blob before normal upload, snapshot recording context, restore pending work on startup, and expose storage failures.
- `service-worker.js`: public shell caching for offline reopening; no private response, key-bearing URL or queued material is cached or transmitted by the worker.
- `backend/reliability/RecordingRecovery.gs`: additive Session-ID recovery/idempotency wrapper.
- `backend/reliability/FeedbackOutboxForm.js`: durable submission integration for the inspected feedback forms.
- `tools/install-recording-recovery.py`, `tools/install-feedback-outbox.py`: generate separate patched source directories, reject unknown layouts, never copy clasp credentials and never deploy.
- `tests/outbox-browser.cjs`, `tests/recording-recovery.cjs`, `tests/feedback-backend.cjs`: fault-injection tests.
- This document and `docs/shared-core-outbox-review.md`.

## IndexedDB schema

Version 1 database: `pipers-path-outbox-v1-<scope hash>`. Store: `items`, primary key `id`.

Audio scope binds existing endpoint + pupil + personal-link capability; credentials themselves are not stored. Text scope uses an authenticated server-generated HMAC scope for installation/organisation + actor + role. A fresh valid teacher ticket can recover the same actor's queue after an old ticket expires. Other actors or organisations do not enumerate or drain it. This application separation is not a security boundary against hostile code executing on the same origin; see Shared Core review.

Each item has `id`, `scope`, `kind`, `data`, `createdAt`, `state`, `attempts`, `attempted`, `nextAttempt` and a short transaction-protected tab lease. Audio data contains Blob, MIME type, pupil reference, start/end times, duration and target. Text data whitelists description, explanation, category, page and coarse browser family. It does not contain raw user agents, access keys, teacher tickets, emails, private workbook IDs or central destinations. A confirmed audio acknowledgement may remain until target tagging is also confirmed.

Writes wait for transaction completion, using strict durability where supported. The app never calls locally protected data server-saved. Completed items are deleted only after the appropriate positive acknowledgement. No migration of existing recordings or logs is required.

## Recovery and duplicate prevention

Audio: first upload uses the existing payload and endpoint. The attempted state is persisted before network I/O. An unreadable response is ambiguous. First consult existing Session-ID read-back; a match confirms the audio. An absent list match is insufficient to permit retry. Only the additive exact-session endpoint's versioned `absent` + `retrySafe` response permits retransmission. A legacy backend can therefore confirm and clear saved audio, but cannot authorize an ambiguous re-upload. Unreachable/unknown/partial results retain the Blob. Target-only recovery never uploads audio again.

The backend wrapper validates pupil access before either receipt lookup or upload. Under a script lock it checks the full organisation practice log, then reserves the Session ID in an additive private `RECORDING RECEIPTS` tab before invoking the original uploader. Repeated requests return the existing recording. A crash after reservation but before the log completes needs owner attention; it is not automatically retried, even if the failure preceded file creation. This conservative reservation prevents duplicate orphaned Drive files. Successful recovery also idempotently ensures initial SESSION META without replacing a target or teacher review. Form uploads retain the existing postMessage transport. All writers in a project must use this wrapper; a second unguarded deployment sharing the same workbook must not be used for these operations.

Text: a random client operation ID is committed with immutable submitted text before transmission. The existing server lock and `F-<requestId>` row deduplicate delivery after re-authentication. The installer strengthens duplicate checks to reject a reused ID with different content or actor. Acknowledgement must include `ok: true` and the exact expected reference. Transport callbacks that merely succeed are insufficient. Central delivery remains the existing governed server responsibility; local outboxes do not send to central destinations. New text operations require the corresponding idempotent adapter, not an arbitrary write API.

Both queues limit automatic attempts to five, use 3/6/12/24/48-second exponential backoff (capped at 60 seconds), process serially and have a manual Retry. They run while the app is open; reopening or connectivity events resume eligible work. Browser shutdown does not run background uploads.

## User messages

English and Spanish equivalents are provided:

- Saving…
- Saved ✓
- Saved on this device — waiting to upload
- Saved on this device — upload needs attention / Retry

Pending items have Retry and Download a copy. If storage is blocked or full, the UI explicitly says storage is unavailable, keeps playback/the entered text, and offers a download. It does not claim device persistence. The recording button is briefly disabled during the STOP-to-storage transaction so another recording cannot replace its context.

## Tests and actual results

Passed: **20 Chromium browser tests**, **8 simulated Apps Script audio tests**, **7 tests running the patched inspected feedback handlers with mocked Google services** (35 total).

Browser tests: normal acknowledgement; genuine upload failure; saved but unreadable response; legacy absence blocking retry; Blob and Session-ID survival on refresh; full browser close/reopen; offline STOP/reconnection; concurrent tabs; pending target repair without re-upload; text duplicate delivery; text refresh; actor and EMGT/SPBASA scope separation; bounded retries; rejection of mismatched acknowledgements; actual MediaRecorder recording when connection is lost during recording and immediately before STOP; Owner and Assistant text-adapter refresh/retry; blocked storage; public-shell offline reload without caching personal URLs.

Audio backend tests: one log/file/meta record under replay; lost response; exact absence; crash after file creation; rejected credentials; separate organisation stores; preservation of existing review fields.

Actual inspected feedback handler tests: replay, content-conflict rejection, unauthorized actors, Owner/Assistant scope separation, expired/renewed tickets and cross-organisation denial. Google services and signed-in accounts were simulated: these are not live Google permission or mobile-device certification tests.

Run:

```sh
node tests/recording-recovery.cjs
# Playwright must be installed and have a working Chromium executable.
node tests/outbox-browser.cjs
# Optional PIPERS_CHROMIUM_PATH selects an installed Chromium executable.
PIPERS_TEST_PUPIL_FEEDBACK=/path/to/patched-pupil-feedback \
PIPERS_TEST_TEACHER_FEEDBACK=/path/to/patched-teacher-feedback \
node tests/feedback-backend.cjs
```

The feedback tests deliberately take private exports from local paths. They are not committed to the public repository. Regenerate patched test copies with the installers when the shared client changes.

## Deployment / remaining work

1. Obtain fresh exports of each current pupil backend, pupil comment/report form, teacher backend and feedback/review forms, plus their manifests. Do not export credentials, secrets or private pupil data. Confirm how the live lesson-comment/review APIs differ from the inspected report APIs.
2. Integrate the outbox at each missing lesson-comment/review submit handler and apply idempotency at its actual durable destination. The current report adapter deliberately does not invent a competing lesson-comment table or assume the report endpoint is the review endpoint.
3. Run the guarded installers only against inspected current layouts, into new directories. Check helper calls for nested locks and every audio writer before applying the wrapper. Preserve the organisation's configured destination, role and sanitised Assistant rules. The scripts prepare files only; they do not upload or deploy.
4. Test in an isolated Google deployment, including real Owner and external Assistant sign-in, revoked access, failed Google write after file creation, organisation separation and all requested comment/review routes. Verify stable IndexedDB storage origins across refreshed/reopened Apps Script forms on actual devices.
5. Deploy compatible backend versions first, then the frontend. Re-run pupil recording, metadata, target, PATH/GROUP and local/central report checks with dummy accounts. Retain current live versions for rollback.

Limits: browser storage can be cleared/evicted and private browsing may discard it; no browser-only queue can promise persistence then. In-progress audio chunks before STOP, and text drafts before submission, are not incrementally persisted. Recovery with a changed personal-link capability needs the original link or explicit owner-assisted recovery. Expired teacher tickets require a fresh link; the queued content remains. Script-hosted feedback pages may need a connection to load and re-authorize after reopening; storage survives where the browser keeps the same origin. Real iOS/Android Apps Script storage behavior and full live permission boundaries remain unverified.

The public shell and generic outbox add no organisation-specific identifiers. Existing page bootstrap endpoints are reused. Future self-contained installations need their own configured endpoints and feedback destinations; the current hosted-beta central exception is not newly enabled or broadened.
