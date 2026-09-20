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

Live test evidence, 2026-09-20 (user confirmations and screenshots): owner teacher, external teacher, dummy pupil broken report and dummy pupil suggestion each saved to both workbooks. Screenshots show local details/user IDs retained locally, five corresponding minimal central rows, all local statuses SENT; only reference prefixes were visible. A missing FEEDBACK_CENTRAL_SHEET_ID caused the initial pending report; restoring the separate central workbook ID and running owner retry delivered it successfully. Subsequent submissions succeeded on their first attempt. Pupil page context was confirmed as record after restoring the omitted &page=record suffix to the manually assembled test link; no code change was needed.

Additional isolated regression tests execute the original navigation and recording handlers with feedback enabled: Record/Stop, nonempty simulated audio handed to the upload callback, playback visibility, track cleanup, Path/Group loader calls, correct feedback page context, and feedback click while recording. Media and backend are simulated; no production requests occur. The existing pupil inline code hash remains unchanged.

Still outstanding: full reference equality inspection on the live sheets and feedback submission after teacher revocation on Google. Real-phone recording, playback, upload/logging and Path/Group loading passed on the isolated HTTPS preview on 2026-09-20 (see the live result below). The test adapter does not implement all production scoring features. No production release or pupil feedback activation is authorised by these test results. Screenshots remain deferred; the API rejects attachments.

Source references: https://developers.google.com/apps-script/guides/web and https://developers.google.com/apps-script/guides/html/communication .


## Isolated recording preview (2026-09-20)

The test workflow now generates PupilPreview.html from the unchanged index.html using tools/build-pupil-test.cjs. It replaces the production fetch transport with authenticated google.script.run calls to pupilTestApi. Dummy credentials remain in the URL fragment. The production index, recording endpoint and disabled feedback configuration are unchanged. The preview reuses Record/Path/Group controls and feedback link, with a prominent test notice. Static bagpipe images load from the existing public site without a referrer.

Owner steps:
1. Run Apps Script test connection on feature/dual-feedback, confirmation TEST.
2. Refresh the CONNECTION TEST editor and run setupPupilRecordingTest. It validates the test workbook name and recording folder parent, preserves practice rows, adds Drive File Link and End Time columns, and pins test destinations.
3. Update only the Feedback TEST deployment to a new version, retaining owner execution and its existing access setting.
4. Reuse the private dummy pupil feedback URL, replacing ?feedback=1 with ?pupil=1, retaining #p=TEST001&key=...&page=record.
5. On laptop and phone, record a short dummy clip, stop, play it back, then open Path. Verify the new row and file in the test workbook/TEST Recordings. Open Group and submit feedback from each pupil screen. A clip below five minutes does not increase qualifying Group count.

Limits: ten minutes and approximately 5 MB per clip, 100 test sessions per dummy pupil. Only TESTnnn pupils with valid active feedback-test credentials can use this adapter. Destination changes require owner setup again. Session IDs deduplicate log writes; deterministic filenames let a retry reuse a file if a preceding Sheet write failed. Files inherit the existing test folder permissions; the adapter never makes them public.

Path returns stored sessions and basic totals; Group counts today's active qualifying dummy pupils. Targets, badges, daily community credit and production scoring parity are deliberately not implemented in this adapter. These results cannot certify those production features. The server trusts client timing within validated bounds, suitable for this dummy test only.

Automated checks cover invalid credentials, production-shaped pupil IDs, ticket misuse, unsupported actions, audio limits/types, changed destinations, wrong project, duplicate sessions, basic Path/Group responses, and generated inline JavaScript syntax. The Apps Script iframe microphone test failed with a permissions-policy denial. Real-phone recording/playback/upload and Path/Group loading subsequently passed on the separate HTTPS preview; see the dated result below.


## Desktop microphone fallback

The user reported microphone denial without a permission prompt in the Apps Script-hosted preview, including a normal browser window. A later console screenshot explicitly reported a microphone permissions-policy violation in the Apps Script document. The separate HTTPS phone test subsequently passed; see below. The workflow also generates PupilStandalone.html, downloadable from the Feedback TEST deployment using ?download=1 after uploading and deploying the new version. The downloaded HTML contains the configured test endpoint but no pupil credentials. Open it directly in desktop Chrome and paste the existing dummy pupil URL when prompted. Credentials stay in the page's memory and are submitted only to the configured test adapter or its feedback form.

The standalone preview uses text/plain POST to doPost, which delegates to the same authenticated pupilTestApi. It omits Google cookies and preserves all test destination guards. Malformed requests return a generic JSON error. Automated tests cover generated script syntax, valid read requests, bad credentials and malformed JSON; real microphone access and cross-origin response handling still require the desktop test. Mobile testing now uses the separate HTTPS preview documented below. Do not change production hosting or endpoint settings for this fallback.


## Real-device mobile diagnostic — PASSED, 2026-09-20

Evidence: Leslie's explicit physical-phone test report; not an automated or agent-performed microphone test. Leslie confirmed microphone permission appeared/worked, recording and playback worked, the audio uploaded and was logged in TEST data, and both Path and Group loaded.

Preview: https://gauchopiper.github.io/pipers-path-mobile-test/ . Repository: Gauchopiper/pipers-path-mobile-test, main at 260887b924f3884b10f7fa6fd4c0345a40fe308c for the tested files. Source: feature/dual-feedback at d97c6378bddd6a8b715875ec096bae1cac68a71a. Existing build-pupil-test.cjs/PupilStandalone generation was reused. Only the TEST endpoint was configured, redundant feedback script loading removed, and production service-worker cleanup removed from the static copy. No pupil credentials were committed; the existing complete dummy link supplies credentials through its fragment at runtime.

All three suites passed: teacher-sign-in-test.cjs, feedback-test.cjs and pupil-recording-test.cjs. HTTPS returned HTTP 200 and the served page matched the prepared file byte-for-byte before handoff.

Conclusion: close this hosted mobile recording diagnostic as passed. The observed Apps Script iframe microphone restriction is isolated to that hosting/document-policy context; the same pupil recording implementation works on the separate HTTPS page. This does not certify every device, production scoring, or teacher authentication.

Keep the temporary repository/site in place. No production source, production Pages, Apps Script deployment, backend, permissions or feedback privacy model was changed by this close-out.
