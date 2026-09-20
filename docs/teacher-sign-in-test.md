# Teacher sign-in experiment (test project only)

This is a diagnostic, not the production Teacher UI or final authentication design.
The existing upload workflow still requires TEST confirmation and accepts only
the approved CONNECTION TEST Script ID. Upload does not deploy or run the code.

## Owner sequence

1. Run **Apps Script test connection** from the reviewed branch with `TEST`.
2. In the CONNECTION TEST editor, refresh, select `setupTestEnvironment` and
   click Run. Review Google's new Sheet/Drive permissions. This owner-checked
   function creates a test folder, a recording subfolder and a test Sheet, with
   two synthetic pupils and two synthetic practice rows. No audio or personal
   links are copied. The public entry point verifies the script file's actual
   Drive owner before any setup writes, including on a browser RPC invocation.
   The private helper retains its trailing underscore; the editor hides such
   functions from the Run dropdown. A missing owner or inaccessible script fails closed.
3. Keep the Sheet/folder links from the execution log. Setup stores resource IDs
   privately in Script Properties; normal reruns reuse resources and preserve
   rows. A failure in the tiny interval between resource creation and saving its
   ID can leave an orphan; inspect the test folder if setup was interrupted.
4. Deploy → New deployment → Web app. Choose **User accessing the web app** and
   **Anyone with Google account**. Review these settings explicitly; do not select
   execute as owner. Open its /exec URL as the owner. Expect the signed-in email,
   two dummy pupils and folder-readable result.

## Second-account test (do not send invitations automatically)

The owner selects a second Google account. First try the URL without file access;
it must not show pupils. Then, if agreed with that account's owner, grant only
Viewer access to the TEST Sheet and TEST recording folder, with notifications
disabled. Do not grant access to the production Sheet or script source.

With file access but no TEACHERS row, the web app must deny teacher access.
Add a row to the TEST Sheet's TEACHERS tab: a unique Teacher ID, that email,
TEACHER, TRUE. The second account should now see the two dummy pupils. Set Active
to FALSE; on refresh it must be denied. Duplicate matching teacher rows also fail
closed. Test a signed-out/private window, phone and desktop.

Never copy real pupils, keys, recordings or identity mappings into this experiment.
Display labels are escaped before rendering. Setup is owner-only; there are no teacher write controls.
Only identity, configuration and allowlist checks precede the pupil read.

## What this experiment can and cannot prove

Google identity availability, allowlist checks and direct file access are distinct
checks. An owner success is not evidence that unrelated Gmail accounts work.
The visitor must grant requested Google scopes; missing permissions can prevent
execution before the diagnostic renders.

Running as the visitor requires file access, so a second teacher with Sheet
Viewer access can also read that test Sheet directly, including its teacher list.
This is NOT suitable unchanged for a future production Sheet containing pupil
access keys or restricted teacher notes. The original teacher-only seed had no keys,
notes or real data. The later dual-feedback experiment adds a dummy pupil
credential tab to the same TEST workbook; existing Sheet viewers can read it.
These must remain dummy-only credentials. Do not broaden sharing during diagnosis. If teachers must not have raw-file access, select a different
authentication/backend arrangement after this experiment.

The setup and runtime currently share a project, so visitors are asked for broad
Drive/Sheets scopes needed by setup even though the diagnostic only reads. This
is explicitly an experiment limitation, not a recommended final consent model.
Do not add write actions or import the production backend until that is resolved.

Google references:
- https://developers.google.com/apps-script/guides/web#permissions
- https://developers.google.com/apps-script/reference/base/session
- https://developers.google.com/apps-script/guides/html/communication#private_functions


## Teacher sign-in evidence review — 2026-09-20

Inspected test/teacher-sign-in at f5da17b06c3d32f0932509f63a6a7ac740112932 and feature/dual-feedback at d97c6378bddd6a8b715875ec096bae1cac68a71a. The latter includes the teacher experiment and later feedback/recording adapters. Both contain the data-free diagnostic=ping route. No authentication implementation or deployment was changed in this review.

### What is proven

Earlier supplied screenshots show both owner and a second/external Google account reaching the dummy teacher dashboard, with Teacher access passed and the TEST recordings folder readable. Later supplied feedback results show external-teacher feedback saved locally and centrally. Therefore the visitor-execution teacher path has succeeded for the selected external test account; a currently unresolved universal external-account failure is not established.

The existing diagnostic checks, in order: active identity, active/effective identity equality, setup readiness, test Sheet readability, a unique active authorised TEACHERS row, then pupil/log data. Folder readability is reported separately and does not itself block the dashboard. Automated teacher checks passed; they do not establish live Google consent or deployment configuration.

### Exact historical failure and limits of evidence

Recovered earlier conversation summaries describe a failed normal external-account doGet and a successful data-free ping displaying DIAGNOSTIC 2: Web app code reached. Those summaries also describe an owner-execution identity limitation followed by successful visitor/file-authorised testing. These are prior assistant summaries, not a retained exact Google error or execution stack. The original error text, contemporaneous deployment version/settings and a current reproduction are unavailable. Do not label OAuth, sharing or allowlist as the confirmed remaining cause.

### What is suspected / remains unknown

A wrong deployment URL, owner-execution deployment, selected Google account, Google consent gate, file access, or TEACHERS row could explain a new failure; none is presently confirmed. Broad consent and raw workbook access remain known prototype limitations, not evidence of a current login outage. Current live teacher deployment settings/version and live revocation behaviour have not been reverified. An owner opening an owner-execution URL can pass identity equality; that alone does not establish visitor execution for external users.

### Smallest next experiment — prepared, read-only, not yet performed

Use the existing external test account in its own browser profile. Do not add accounts, share files, alter rows, run setup, upload code or change deployments.

1. Open the existing teacher TEST deployment (not the owner-execution feedback/recording URL):
   https://script.google.com/macros/s/AKfycbxRNg722dzCxNnNMjM9y2OS8bg8J7MHDrPzW_rcDlKxP4te5WUNgO15Yi--F61TjP8_IQ/exec
   Record the test time, selected account privately, visible result, and any exact error. A dashboard showing the expected external account, teacher access passed and folder readable closes the present sign-in reproduction as passed.
2. Only if it fails, open the same URL with ?diagnostic=ping in the same profile/session. Record whether DIAGNOSTIC 2 appears. A positive ping shows execution/HTML delivery reached the app, not that identity, consent scopes or file permissions are correct. A missing marker may also mean an older deployed version; it is not by itself proof of an OAuth failure.
3. Correlate the two requests with the existing CONNECTION TEST execution entries and read-only deployment settings. Record version, function, status and sanitised error. Do not record tokens, pupil keys or raw sensitive URLs in GitHub.

Interpret existing app messages:
- Google did not provide your identity: identity availability.
- Deployment must execute as the user accessing the app: execution identity mismatch; inspect the selected deployment without changing it.
- Google sign-in worked, but this account cannot read the test Sheet: Sheet access/open failure.
- This account is not an active authorised test teacher: TEACHERS authorisation (including duplicate rows).
- Dashboard with folder permission required: folder access, while teacher/Sheet checks succeeded.
- Google login/consent/error before an app result: record exact screen and execution evidence before assigning a layer.
- Generic test-could-not-complete message: insufficient to classify; correlate execution evidence, do not broaden permissions.

### Who should review next

ChatGPT Chat only for the result of this narrow diagnostic. No Claude consultation is warranted by the current evidence. Stop for a Chat decision if a fix would require a different authentication architecture, broader access, privacy or multi-organisation changes; Chat + Claude becomes appropriate for that scope or after one careful diagnostic cycle remains inconclusive. Keep production untouched.
