# Dual feedback — test implementation, 2026-09-19

Branch: `feature/dual-feedback`, based on the tested teacher dashboard branch. No merge or production deployment. The existing pupil inline scripts, Record/Path/Group handlers, backend URL and service worker are unchanged.

## Behaviour

A small pupil feedback link is enabled only when `feedback-config.js` supplies a valid feedback deployment URL. It opens a separate form without navigating away from recording. The teacher dashboard prepares a short-lived signed link after checking Google identity and the active teacher row. The form offers broken/confusing/suggestion, a required 160-character description and optional 4000-character explanation. No framework, screenshots, email or automatic invitations.

The organisation workbook receives `TEST FEEDBACK`: shared reference, opaque organisation ID, role, local user ID, UTC timestamp, category, description, explanation, enumerated page, feature version, coarse browser family, screenshot=false, central status and attempts. The creator's separate workbook gets only reference, organisation, role, timestamp, category, page, feature version, browser and screenshot=false. **No free text, local user ID, name, email, raw URL, access key, teacher ticket or raw user-agent reaches central.** Descriptions are not automatically anonymised; they are kept local. The organisation/reference pair supports follow-up. Organisation IDs must be opaque codes, not people's names. No central pupil database is created.

Local persistence comes first under a script lock. A central failure leaves PENDING and a delivery-attempt count. Owner-only `retryFeedbackDelivery` retries up to 50 records per execution. Both destinations deduplicate by reference; the same form retains its request UUID for an ambiguous-response retry. Closing/reloading the form creates a new request. The UI acknowledges local persistence separately from central delivery. Text stays in the form on failure. Ten new reports per actor per hour limits accidental repetition.

## Deploy only the approved CONNECTION TEST project

1. Run the existing GitHub **Apps Script test connection** workflow on `feature/dual-feedback`, confirmation `TEST`. It checks both test suites and uploads only the approved test script. It does not deploy.
2. In CONNECTION TEST, as the owner, run `setupFeedbackTest` once. Existing `setupTestEnvironment` must already have completed. Authorise the added external-request scope if asked. This creates the local feedback tab, a `FEEDBACK TEST PUPILS` credential tab for TEST001, and a separate **Piper’s Path — CENTRAL FEEDBACK TEST** workbook. Reruns preserve credentials and feedback. Never share the central workbook with pupils or teachers.
3. Update the existing **teacher** deployment to a new version, retaining **User accessing the web app / Anyone with Google Account**.
4. Create a **second web-app deployment in the same CONNECTION TEST project**, named **Feedback TEST**, executing as **Me (the owner)** and accessible to **Anyone**. This is needed for personal-link pupils and viewer-only teachers to append feedback without Sheet editor access. It must not replace the teacher deployment. The owner-mode routes require pupil credentials or a signed, unexpired teacher ticket; setup/retry operations require the active owner as well as owner execution authority.
5. Set Script Property `FEEDBACK_WEB_APP_URL` to the new feedback deployment `/exec` URL. It is not a secret. Setup already saved `FEEDBACK_ORG_ID`, `FEEDBACK_CENTRAL_SHEET_ID` and a private `FEEDBACK_SECRET` in Script Properties. Do not copy secrets to GitHub or browser configuration.
6. On the teacher dashboard click **Send feedback**, then **Open feedback form**. Both the owner and the already-authorised viewer-only teacher can submit. Revoking the teacher row also invalidates outstanding tickets.
7. To test a pupil, use the feedback deployment URL followed by `?feedback=1#p=TEST001&key=FEEDBACK_KEY&page=record`, substituting the key from `FEEDBACK TEST PUPILS`. These are dummy, feedback-only credentials. Do not use real pupil links. Keep the resulting personal link private.
8. The pupil UI integration is deliberately disabled until `feedback-config.js` is configured on a preview branch. It must **not** be enabled for live pupils against this test database. This test adapter recognises only dummy credentials. Production integration must re-use the production pupil validation against that organisation's own workbook after this test passes; it has not been deployed or enabled here.

## Independent organisations

Configuration owns all destination IDs. No organisation-specific ID is embedded in feedback logic. The approved script ID remains hard-coded solely as the existing test safety boundary.

For the initial test, one owner controls both separate workbooks and the owner-mode deployment can write both. This is not a requirement to share a central workbook with independent organisations. `tools/feedback-central/Code.js` provides the optional creator-owned receiver for that later deployment: set `CENTRAL_SHEET_ID` and `ORG_SECRET_<org-id>` in its Script Properties. Each organisation sets `FEEDBACK_CENTRAL_URL` and `FEEDBACK_CENTRAL_SECRET`; only a signed, timestamped, strict minimal schema is accepted. The organisation adapter then uses that receiver instead of direct central Sheet access. Receiver source is outside the test workflow's clasp upload directory and has not been deployed. Transport tests cover authentication, rejection and deduplication; cross-account Google HTTP delivery remains an integration test.

The current trusted-teacher model means direct Google Sheet access is separate from app access. Do not give pupils Sheet access. This feature does not alter those permissions or existing sharing.

## Verification

Run `node tests/teacher-sign-in-test.cjs` and `node tests/feedback-test.cjs`.

Automated: pupil broken/suggestion/confusing, no screenshot, detailed organisation record, minimal central record, matching reference, duplicate retry, local-success/central-failure recovery, lost acknowledgement, inactive pupil/teacher rejection, forged ticket rejection, validation, formula injection handling, central receiver schema/signature/deduplication. The baseline hash checks that all existing pupil inline JavaScript remains byte-identical, and the navigation hooks remain present. This is regression evidence, **not** a live audio upload test.

Still to perform on Google: two real test Sheet writes; owner and second teacher submissions; anonymous dummy pupil submission; disable teacher then submit; central destination unavailable then owner retry; phone layout; verify Record/Path/Group on the preview with authorised test backend data. Never submit test audio or feedback to production to complete this checklist. Screenshots are intentionally deferred and the API rejects an attachment payload.

Source references: https://developers.google.com/apps-script/guides/web and https://developers.google.com/apps-script/guides/html/communication .
