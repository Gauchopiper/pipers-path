# Gaita de Boto — NEW Apps Script installation sources (STAGED, NOT DEPLOYED)

This directory is a **development candidate** for the Gaita de Boto organisation only. It does not contain deployed backends, personal links, workbook IDs, script IDs, credential material, or published `/exec` URLs.

## Components already staged

- `teacher/Code.gs` + `TeacherDashboard.html` + `appsscript.json`: role-checked teacher UI, owner pupil creation and activation, practice summaries, assigned targets, badges, per-session review, server-mediated protected audio playback. Assistant sees server-filtered data, not canonical workbook or access keys.
- `pupil/Code.gs` + manifest: owner-run independent recorder API matching the staged pupil page's existing JSON POST actions, exact Session-ID duplicate detection, receipt reservation, PRACTICE LOG and SESSION META, Record/Path/Group, assigned target tagging. Qualification requires a **Gaita-specific** threshold; no Highland default.
- `feedback/Code.gs` + `FeedbackForm.html` + manifest: independent pupil feedback with operation-ID deduplication and **organisation-only** destination. The browser keeps an unconfirmed submission in local storage where available. No central collection is enabled.

These components are **not clones of the deployed GAS source**: that source was inaccessible to this Chat session. They were implemented from the known workbook headers, existing pupil frontend request contract, clone runbook and current privacy requirements. All integration and permissions MUST be verified against the actual live approved implementation before deployment; prefer the live established handlers where compatible.

## Separate projects and credentials

Create three NEW Apps Script projects, each with a new **distinct Script ID and distinct local `.clasp.json`** (never commit `.clasp.json`). Do NOT push to scripts belonging to EMGT, SPBASA or CIYPB. Upload each component to its own project. **No URL is live yet.**

Set **Script Properties** privately in the corresponding NEW Apps Script projects, not in GitHub:

| Project | Required property | Meaning |
| --- | --- | --- |
| Teacher | `GDB_DATA_SHEET_ID` | Existing owner-private Gaita canonical workbook |
| Teacher | `GDB_OWNER_EMAIL` | Actual authorised Google Owner identity |
| Teacher | `GDB_ASSISTANT_EMAILS` | Comma-separated approved Assistant Google identities; no guessed emails |
| Teacher | `GDB_PUPIL_FRONTEND_URL` | Exact Gaita GitHub Pages URL after verified publication |
| Pupil | `GDB_PUPIL_DATA_SHEET_ID` | SAME Gaita workbook (never an old organisation workbook) |
| Pupil | `GDB_PUPIL_RECORDINGS_FOLDER_ID` | NEW organisation's existing RECORDINGS folder |
| Pupil | `GDB_QUALIFY_MINUTES` | Leslie-approved Gaita practice threshold (positive number) |
| Feedback | `GDB_FEEDBACK_DATA_SHEET_ID` | Gaita canonical workbook only; NO central destination |

This source intentionally uses private **property names** only; resource values are in the handover's restricted Drive context. Never copy user emails or IDs into public code.

## Deployment / hard stop

1. Obtain authenticated Google Apps Script access and current live proven source/deployment inventory. Confirm code compatibility with real teacher/assistant permissions, reporting and feedback workflows.
2. Verify Google sign-in architecture. Teacher uses `Session.getActiveUser().getEmail()` and **fails closed** when unavailable. In an owner-executed web app, Google may withhold an external Assistant's email. Do not replace this with a browser-provided email or loosen identity checks. External Assistant authentication is a **release blocker** until exercised successfully with a real separate Google account or changed to an explicitly verified identity flow.
3. Create new independent Apps Script project IDs; configure script properties privately; test with dummy pupil(s) in the existing owner-only Gaita workbook. Owner/Assistant do not receive editor access to the canonical workbook. Audio is served by a guarded app RPC, not blanket Drive file sharing.
4. Confirm actual recording duration (the current candidate checks browser-supplied timestamps and size constraints; it **does not decode audio media duration independently**), exactly matching PRACTICE LOG and SESSION META, safe crash recovery / receipt journal, duplicate replay, target tagging, PATH/GROUP, badges, pupil and teacher feedback. Verify private access isolation.
5. Browser outbox in `feature/reliable-local-outbox` **has NOT been integrated into Gaita**. Existing feedback form protects the submitted text locally only on its own origin; recording audio is NOT durably protected in this candidate pupil frontend. Do not represent the current saving flow as fully reliable or offline capable.
6. Deploy Apps Script backends only with confirmed roles, private storage, safe scripts and test evidence. Wire Gaita's frontend endpoints and publish **only once all required end-to-end tests pass**. Keep draft PR #6 unmerged until then, and record new deployment IDs/URLs and rollback versions in the existing handover.

## Dry-run verification

In the Chat implementation session 19 mocked service-contract checks passed against these GAS sources for Owner vs Assistant, pupil link, protected pupil JSON actions, session replay, receipt/log/meta, targets, reviews and feedback idempotency. These are **not live Google, real microphone or external-account tests**. The full set of privacy, recovery and identity limitations is in the existing Google Doc `Piper's Path – Gaita de Boto – Current Implementation Handover`.

## Known gaps to resolve before release

- Backend source lacks live-proven authentication, deployed project IDs, script versions, production test evidence and short-link setup.
- Badge *award* and target *assignment* are present; management of the master catalogues and teacher comment/review routes beyond session review remain to be integrated/validated.
- The staged frontend's GROUP artwork/text is inherited from Highland piping; adapt Gaita terminology and illustration only after confirmation.
- Pupil frontend still has blank `BACKEND_URL`, and `feedback-config.js` still has blank endpoint. These are deliberate protection against falsely claiming deployment.

**Return to Chat using: GPT-6 High for deployment and privacy review.**
