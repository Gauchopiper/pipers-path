# Apps Script test connection

This first stage proves that a reviewed GitHub change can reach a dedicated test
Apps Script project. It does not deploy a web app, alter the live project, or copy
any pupil records. The pupil interface and production backend remain unchanged.

## Owner setup

1. At https://script.google.com/home create a NEW standalone project named
   `Piper's Path — CONNECTION TEST`. Leave it empty apart from Google's starter
   function. Do not reuse the existing script or either downloaded backup.
2. Copy the new project's Script ID from Project Settings.
3. In this repository's Settings → Environments, create `apps-script-test`.
   Add environment variable `APPS_SCRIPT_TEST_ID` with that NEW script ID.
4. Add environment secret `CLASP_AUTH_JSON`. Its value is the contents of the
   `.clasprc.json` login file on the authorised computer, NOT `.clasp.json`.
   Transfer it directly into GitHub's secret field; never attach it to a chat,
   commit it, print it in workflow logs or put it in a repository variable.
   In PowerShell, this copies it without displaying it:

   ```powershell
   Get-Content -Raw "$env:USERPROFILE\.clasprc.json" | Set-Clipboard
   ```

   After saving the secret, clear the clipboard with `Set-Clipboard -Value ''`.
   This credential can authorise access to other Apps Script projects available
   to that Google account: it is not restricted to the test script. The target
   guard in this workflow prevents an accidental live upload, but is not a
   Google permission boundary. Use a dedicated test Google account if narrower
   account access is required; it must own or have edit access to the test script.
   Only trusted maintainers should be able to modify or run workflows with this
   environment. Add required reviewers where supported and restrict permitted
   deployment branches before enabling credentials.

## Review and first run

The workflow is manual-only: no push, pull-request or scheduled triggers.
GitHub requires a workflow_dispatch workflow to exist on the default branch
before it can be selected in Actions. Keep this proposal on its preparation
branch until reviewed; merging and running are separate deliberate steps.

After review and setup, open Actions → Apps Script test connection → Run workflow,
select the reviewed branch and type `TEST`. This overwrites ONLY the dedicated
test script's source with the harmless probe. It does not create a version or
deployment, and the probe has no Google service calls.

Confirm the run is successful, then inspect the test editor for
`pipersPathConnectionCheck`. A successful clasp upload proves transfer, not that
the real backend or teacher authentication has been tested. Those come later,
using a separate test Sheet and recording folder.

The workflow pins clasp to 3.4.1, rejects the known live Script ID before writing
credentials, serialises runs and deletes the temporary login file at completion.
Do not replace the probe with the uploaded production Code.js: that file contains
a pupil access link and organisation-specific configuration requiring review.

## Baseline

The owner downloaded Apps Script version 30 and current saved source on
18 September 2026. Both Code.js and appsscript.json were byte-identical.
The unmodified originals remain outside this public repository.
