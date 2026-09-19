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
access keys or restricted teacher notes. This prototype therefore has no keys,
notes or real data. If teachers must not have raw-file access, select a different
authentication/backend arrangement after this experiment.

The setup and runtime currently share a project, so visitors are asked for broad
Drive/Sheets scopes needed by setup even though the diagnostic only reads. This
is explicitly an experiment limitation, not a recommended final consent model.
Do not add write actions or import the production backend until that is resolved.

Google references:
- https://developers.google.com/apps-script/guides/web#permissions
- https://developers.google.com/apps-script/reference/base/session
- https://developers.google.com/apps-script/guides/html/communication#private_functions
