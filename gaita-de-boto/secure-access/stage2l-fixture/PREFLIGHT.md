# Stage 2L preflight — prepared, zero dispatches so far

Accepted source: c48674faa81abb186daf541dce3aff49fe822f4a.
Repository is PUBLIC; current feature head matches accepted source; local checkout
was clean; PR #6 remains open/draft/unmerged. Actual main is
90d85d6b8e6450be945556617daa324d953d3e6f, not the stale base SHA supplied by
normalised PR metadata. No change to main was made.

## Execution route

Live main contains TWO YAML workflows: apps-script-test.yml and
`gaita-native-postgres-fixtures.yml`. The latter is an existing registered manual
native workflow, pinned to historical source 64545e0e76bf9ea843f4d28b8ff52ce701011d31
and guarded to run only from main. It is not safe for the new candidate as-is.
The Apps Script workflow is forbidden and remains untouched.

Normal documented GitHub dispatch supports selecting the branch containing the
workflow version. A feature-branch version of the ALREADY REGISTERED native
filename can therefore be prepared without changing main, default branch,
repository settings, billing, or creating another repository. This is normal
branch selection, not a bypass of the default-branch registration requirement.
Do NOT run the main version or its old pinned fixture. Before clicking, select
feature/gaita-de-boto-staging-20261019 and verify the new STAGE_2L approval phrase,
reviewed_sha input and exact reviewed commit.

The new feature-only YAML requires manual workflow_dispatch, exact reviewed_sha
matching github.sha, exact repository and feature ref, contents:read only,
ubuntu-24.04 standard runner, 15-minute timeout, two official SHA-pinned actions,
persist-credentials:false and package-manager-cache:false. No Google environment,
secret/OAuth input, deployment/upload, artifact upload, cache, external database,
service provisioning or automatic trigger. Locked npm ci ignores lifecycle scripts.
Existing PostgreSQL distribution binaries are selected; if unavailable, fail
closed rather than start an unreviewed installation/service in the one run.
The read-only GitHub token is used by checkout; it is not passed to test commands.

One native invocation only, followed by permitted offline regressions in the same
job. No rerun/retry step. Synthetic evidence is chunked with SHA-256 in logs;
no audio/private key/password files are uploaded. Marked same-owner PGDATA and
exact /proc postmaster command must match before immediate-stop cleanup. A
foreign directory/process causes cleanup failure, never blind termination.

## Harness review and corrections

Original 135 native cases have never executed. Corrections to the inactive
native.cjs preserve their assertions: checked-out clients have error listeners
and explicit forced release during pool close after crash; revocation test now
actually observes an independent native lock wait before committing; migration
SET ROLE/RESET ROLE is scoped to one acquired connection. No candidate SQL grant,
source verifier or production code was relaxed. The after-commit/evidence/receipt
positions remain synthetic protocol component states; they do not certify live
Google, canonical receipt bridging or off-host witness durability.

Local unit-01: 14 executed, 10 passed, 4 failed (incorrect test repository path).
The path was corrected without weakening any assertion; unit-02 and unit-final-03
both pass 14/14. Stage 2K offline rerun: 51 registered, 50 passed, 0 failed, 1
blocked independent-retention gate. Existing assertions are unchanged. No local
native runtime workaround was attempted; current environment remains root-only.

## Dispatch capability/authentication

Connected GitHub repo metadata reports administrator repository rights, but the
connector exposes no initial workflow-dispatch operation. Its generic fetch
rejects the workflow/permissions administration endpoint families. This is a
connector surface limit, not evidence of a GitHub account permission denial.
No Actions or billing settings were changed. The cloud browser shows this public
native-workflow page while SIGNED OUT. Secure GitHub browser authentication is
required before its Run workflow controls can be assessed. Never extract tokens,
reuse connector credentials in CLI, or request passwords through chat.

If a further blocker requires main/admin/billing/repository changes, STOP.
Do not run Apps Script or spend the single authorisation on a guessed route.
A cancelled/declined sign-in leaves dispatch count ZERO. If the eventual one run
fails or is skipped, collect it; no additional attempt is authorised.

Primary documentation checked:
https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
https://cli.github.com/manual/gh_workflow_run
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

Standard GitHub-hosted runners are free for public repositories according to
GitHub documentation. This is not authority for larger/self-hosted/paid runners
or changing billing. Costs incurred: zero. Native safety success cannot be
claimed from this preflight, YAML parsing or root-gated historical results.
