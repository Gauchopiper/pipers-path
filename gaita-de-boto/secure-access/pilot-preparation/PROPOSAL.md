# WORK 4 → CHAT 3 — Dummy-only integration proposal

30 October 2026. Decision-ready proposal; **no live change is authorised or made**.
Starting checkpoint: `5ffa075b03f07224ead204711a3611265807a244`.
Repository: `Gauchopiper/pipers-path`; branch:
`feature/gaita-de-boto-staging-20261019`. Keep PR #6 draft/unmerged.

## Decision to review with Leslie

**Recommend Option B for a full, short, Owner-operated Dummy pilot:** a local HTTPS
gateway/worker and native local PostgreSQL, calling the EXISTING Apps Script writer
through authenticated API execution using a separate, tightly resourced automation
Google user. For this first pilot use only an expiring access token in memory;
request no offline access and store no refresh token. Leslie's personal Google
identity signs into the pupil/teacher UI with identity scopes only. No personal
Owner Drive/Sheets OAuth credential goes to the gateway.

This recommendation has explicit go/no-go conditions. Google ACLs cover the whole
canonical workbook, not individual Dummy rows; the automation user would receive
the approved Gaita file access needed to execute the existing writer. A stolen
automation token can use its granted Google scopes outside our function allowlist.
Leslie must knowingly approve that organisation-wide file exposure. Do not describe
the Google credential itself as Dummy-row-only.
The execution API can name other functions in the deployed project; the gateway's
allowlist is not a token-level function permission. Review every callable entrypoint
and the actual deployment admission setting. If a reviewed caller/resource boundary
requires broader API access, that needs a distinct Owner decision; there is no
implicit exception here.

API execution also requires a common STANDARD Cloud project. If the live projects
use default projects, switching can require re-authorisation and cannot be undone
by returning to a default project. Do not perform that switch as routine pilot
setup. Its separate approval must acknowledge effects on existing private apps.
If those conditions are declined or cannot be verified, **do not start the full
pilot**. Option A remains a separately approved background-upload component test;
it does not satisfy the protected interactive-read requirement.

First do the isolated native test job described below. Its approval is independent
of approving any Google integration. This proposal selects no production topology.

## A. Components and responsibilities

| Component | Proposed pilot responsibility |
|---|---|
| Recorder | Separate candidate derived from private v8; preserve circular control, pause exclusion and original Session IDs; working v8 remains deployed unchanged |
| Google identity | Existing staged verifier: signature/audience/expiry/nonce/CSRF; stable subject; explicit Owner identity → existing Dummy grant; no pupil Drive/Sheets scopes |
| HTTPS gateway | One approved loopback origin, e.g. `https://localhost:7443`; same-origin Secure/HttpOnly cookies, CSRF and server-derived identity; only configured Dummy ID and GAITA-DE-BOTO accepted |
| Native PostgreSQL | Separate pilot database; identity grants/sessions, immutable queue, replay/operation receipts, revision DIRTY states; separate migration/runtime roles |
| Queue worker | Local process claims/fences jobs promptly, rechecks current grant and calls the same canonical writer; no speculative upload after timeout |
| Google execution authority | Approved dedicated automation user; API-executable deployments in existing projects; short-lived token in memory; no Owner refresh credential or service-account workaround |
| Canonical writer | Existing Pupil project and original recording writer/ScriptLock/media parser; new private entrypoint and durable original-identity manifest before any new write |
| Receipt | Side-effect-free inspection of exact audio and original identity; matching canonical file/folder/log/META; queue acceptance remains pending |
| PATH/playback | Direct authorised reads for the pilot, current membership + clean revision before/after; logged pupil/session resolves private file; no Drive URLs and no read cache |
| Teacher | Separate Owner-only candidate UI calling approved private Teacher operations through the gateway/coordinator; existing Teacher v2 stays pinned and usable after regression check |

The public pupil result contains only its own projection and protected bytes.
The service's internal file/folder IDs, evidence and keys stay server-side.

### Recording sequence

1. Capture audio and protect it on the device immediately; retain its original
   Session ID. Compute the byte hash without discarding an undecodable local blob.
2. Verify the Google identity and the explicit Dummy grant. Apply the Dummy-only
   policy at HTTP, gateway, queue/worker and Google receiver boundaries.
3. Independently parse the SAME bytes using the existing media-duration logic
   before constructing the immutable canonical intent. Retain original client
   declarations separately; never silently credit timer or rounded minutes.
4. Accept encrypted staging/queue job and display pending protection. Persist
   trusted subject/scope/hash/length/MIME/time/duration intent at the canonical
   authority before dispatch. Native transaction/nonce/fence gates must already pass.
5. The worker performs read-only receipt inspection. Exact SAVED reconciles; a new
   ABSENT+retrySafe may dispatch; STARTED, unbound history or uncertain results
   remain manual. The original writer remains the only audio/file/log writer.
6. Verify exact canonical receipt and current authorisation before confirmation.
   Remove only the matching new pilot local item after complete confirmation.
   Target tagging uses Session ID resolved server-side, not a pupil-supplied Drive URL.

### Interactive sequence

Identity/current Dummy grant → clean revision → private execution read → current
canonical activation + pupil/session/file/folder ownership → unchanged clean version
and grant → no-store response. Playback initially stays within the existing 5 MiB
Teacher proxy size limit; preserve the writer's larger admission limit and document
this pilot playback constraint. Larger audio support is an external-release gate.
No polling queue is used for PATH/playback and no real-pupil read cache is created.

The initial pilot may target p95 <= 3 seconds for warm PATH and <= 5 seconds to
first audio, as **proposed acceptance thresholds**, not observed performance or a
Google SLA. Measure cold and warm times separately; a failure requires redesign,
not quietly substituting stale cached information.

## B. Google security decision

Google's execution guide requires an API-executable deployment, common standard
Cloud project and token covering ALL scopes used by that script; service accounts
are unsupported for this route [S1]. The current REST reference uses the
API-executable **deployment ID** in `scripts/{deploymentId}:run`; do not substitute
a web-app URL or infer IDs from naming in older overview examples [S2].

| Issue | A — Owner-controlled Apps Script pull worker | B — Dedicated-user authenticated execution |
|---|---|---|
| Google authority | Runs inside Google as trigger creator; no personal refresh token at gateway | Dedicated automation user's approved access token in local memory only for initial pilot |
| Additional permission | URL Fetch/trigger permissions and signed queue service; exact live scopes need audit | Current source implies Drive, Sheets and userinfo.email; actual complete project scopes must be inspected before consent |
| Main exposure | Compromised worker/key can misuse Owner execution authority unless strict fixed action/data bounds | Token covers all approved automation-user resources/scopes; whole-file access includes non-Dummy rows in that workbook |
| Identity | Pupil Google Sign-In is separate from worker authority | Separate identity-only pupil client and automation execution client; never request Drive/Sheets from pupil sign-in |
| Confirmation | Signed immutable jobs, original writer, exact receipts; delayed confirmation | Same exact receipt rule; immediate processing possible, but no automatic retry of uncertain write |
| Interactive reads | Minute-scale polling is unsuitable as the sole interactive path; would require another direct route or separately authorised data replication | Request/response can support direct reads in principle; real latency, payload size and account behaviour unverified |
| Connectivity | Apps Script cannot pull a loopback-only gateway; needs an approved reachable HTTPS service or equivalent network route | Local gateway makes outbound Google API requests; no public inbound service needed for this Owner pilot |
| Coordination | Trigger/queue health, quotas, stage expiry and same-writer/Teacher coordination | Standard-project/deployment/consent maintenance plus all-writer revision coordination |
| Revocation | Stop new jobs and trigger, revoke service keys, preserve/reconcile in-flight writes | Stop local gateway/worker, revoke automation grant and file access/API executable as approved; preserve/reconcile uncertain writes |
| Cost | Existing Apps Script quotas plus approved reachable gateway/DB/staging hosting; not costed or promised free | Local hardware/DB expected no incremental service fee; no cloud hosting/SQL/billing proposed; account/license and storage capacity need confirmation |
| Rollback | Pause trigger/jobs; retain staged/local audio and canonical receipts | Stop candidate; preserve tokens/receipts/audio evidence; revert code/deployments only through recorded plan; project association requires separate treatment |

Time triggers run as their creator, can run as frequently as every minute, and do
not supply reliable automatic revision notifications for script/API writes [S3].
Current Apps Script consumer quotas include limited total trigger runtime and a
six-minute execution limit; these are quota constraints, not a performance promise
[S4]. No costs for an A hosting choice have been approved.

### B pilot approval conditions

- Use an existing approved dedicated automation user, or obtain explicit approval
  to create one. Give it only the named Gaita workbook/folder and minimum execution
  access actually required. No unrelated Owner files, project Editor or Cloud
  administrator role by default. If extra privileges are required, stop for review.
- Record the complete live OAuth scope inventory. `drive.file` is not assumed a
  compatible replacement for existing DriveApp/history. File allowlists in code
  do not reduce the token's OAuth authority. Identity scopes alone grant no Drive
  or Sheets access [S5].
- Prefer an already compatible standard Cloud project. Approve any association
  change separately: existing users can need re-authorisation, and returning to a
  default project is unsupported [S6]. Source-version rollback does not undo this.
- New API-executable access must admit only the approved caller under verified
  Google controls plus receiver authentication. No anonymous endpoint or weakening
  of current Owner-only web-app access. Confirm the actual supported access setting;
  if a safe caller boundary cannot be proven, the pilot is no-go.
- Keep short-lived automation access tokens only in protected process memory;
  request online access, not an offline refresh grant. Refuse new dispatch when
  remaining token life cannot cover the expected execution; expiry keeps work
  pending until fresh operator sign-in and receipt reconciliation. Never substitute
  Leslie's token. A long-running service would need a new credential-lifecycle decision.

## C. Exact implementation sequence

| Phase | Concrete work and exit gate |
|---|---|
| 0 — Native gate | Approve/execute isolated native job; obtain real connection, lock, crash/restart and restore evidence; no Google secrets involved |
| 1 — Private inventory | Record actual deployed-source/version/permissions/scopes/Cloud-project associations, Dummy's existing canonical ID and baseline counts/hashes; record all rollback references; no guessed IDs |
| 2 — Owner decision | Accept or decline the B account/file exposure, project-association risks, local origin/key storage and strictly bounded Dummy writes. No live action before this decision |
| 3 — Safe implementation | Add candidate UI, configurable production-capable queue/manifest/revision modules and same-project private receivers; implement real inspection providers; exercise them entirely with fixtures first |
| 4 — Google configuration | Only after exact approval, establish scoped dedicated caller and new private API-executable versions in existing projects. Keep v8/v2/v5/v1 web-app deployments pinned; verify their normal Owner behaviour after any configuration change |
| 5 — Read-only connection gate | From approved local origin, verify identities, Dummy-only grant, canonical snapshots and protected audio; negative org/pupil/caller tests; baseline unchanged |
| 6 — Bounded new writes | Owner runs the acceptance cases in PILOT-ACCEPTANCE.md; only labelled new Dummy sessions/comments/assignments/awards; no historical rewrites or automatic cleanup |
| 7 — Decision | Record source, receipts, latency, denial and recovery evidence in SAME Google handover; CHAT 3 reviews. External pupils remain disabled |

### Exact future source changes — proposed, not implemented here

| File/interface | Required future change |
|---|---|
| NEW `gaita-de-boto/pilot-ui/index.html`, `transport.js`, `teacher.html` | Derive visuals/state machine from v8; replace Owner iframe transport; identity-only login; queue pending/exact confirmation; Session-ID target tagging and protected audio; Owner-only teacher candidate |
| `owner-recorder-test/index.html`, `pending-store.js` | Working files remain unchanged. Reuse recovery algorithm for NEW pilot-origin items; never edit/rotate old capability or database |
| NEW `secure-access/pilot-server.cjs`, `pilot-policy.cjs` | One local HTTPS origin and static candidate; hard server-side canonical Dummy ID/Owner-subject policy; no public listener; disabled default |
| `google-auth.cjs`, `sessions.cjs`, `http-app.cjs` | Reuse verified identity/session/CSRF; add gated Owner teacher pilot routes; HTTP app currently serves JSON only, so explicit static/GIS CSP adapter is needed |
| `pupil-gateway.cjs` | Forward verified original subject/scope from server actor to backend context; current access binding alone lacks original actor; reject client identity/file fields |
| NEW `recording-intent.cjs`, `recording-queue.cjs`, reviewed additive migration | Use real configured identity scope, durable original manifests/operations/revisions, reviewed keys/retention and runtime DB role; fixture-only tables/modules cannot be deployed unchanged |
| `apps-script-client.cjs`, NEW `private-backend.cjs` | Replace Owner-personal-client assumption with approved execution identity; fixed deployment/action/caller policy, signed exact request/response evidence, no retries after uncertain write |
| NEW Pupil-project `GatewayReceiver.gs`, `RecordingReceipts.gs` | Same original writer; durable intent before dispatch; truly read-only inspection and private pupil audio; verify live file/folder/log/META and activation |
| `apps-script/pupil/Code.gs`, `MediaDuration.gs` | Preserve parser/threshold and one ScriptLock; refactor a shared lock-taking/locked-core boundary in a NEW candidate version, avoiding nested locks; original v5 remains pinned |
| NEW Teacher-project `GatewayReceiver.gs`; candidate `teacher/Code.gs` | Preserve real Owner role checks; private delegated entrypoint must validate original Owner actor/caller then use the same audited mutation cores/operation receipts, not impersonate an Owner email |
| Feedback service | Preserve v1; new beta feedback submission excluded from first pilot. Teacher comments/reviews are included and remain separate from feedback |
| All manifests / Script Properties | Reviewed private configuration: resource/deployment IDs, common project, exact origins, caller/key references, Dummy ID and kill switch; repository manifest is not proof of live settings |

### Recovery/origin boundary

The working v8 origin and its encrypted blobs stay untouched. A separate local
candidate cannot read that origin's IndexedDB. Before pilot, verify v8 has no
active capture and account for any pending item using the original private app;
do not migrate, clear or rotate it. New candidate recordings use the same recovery
algorithm in a separate pilot-origin namespace with a separate local-only recovery
secret that survives identity logout/reload. Its delivery/storage design requires
approval and fixture tests; it is not a new pupil access credential. Test recovery
at the exact approved origin/port. No origin migration is certified by this pilot.

### Revision coverage and exclusive pilot window

Use native durable DIRTY → original canonical mutation → read-only verified result
→ atomic revision/operation completion. Direct reads remain blocked on DIRTY or
uncertainty. Existing Teacher and Pupil project locks are separate. See
[WRITE-PATHS.md](WRITE-PATHS.md) for every inspected writing path and missing hooks.

Pinned legacy deployments can still perform Owner-authorised out-of-band writes.
During this bounded pilot, do not use legacy UIs/manual maintenance for Dummy or
shared catalogues; record a baseline and abort on unexpected canonical changes.
This is an explicit trusted-Owner pilot limitation, not enforced coordination of
all production writers. Full external release requires every legacy/manual path
to participate or be effectively disabled/detected under a reviewed design.
GROUP is a cross-pupil aggregate and needs organisation-level invalidation for any
recording/qualification change; the current revision fixture does not cover it.
Pilot GROUP, if shown, must be freshly read and return aggregates only; do not cache it.

## D. Native PostgreSQL recommendation

Use a **separate manual-only standard GitHub-hosted Ubuntu job** in this public
repository. Repository visibility was verified public; GitHub currently states
standard public-repository hosted compute is free [S7]. The proposed job has a
15-minute timeout, read-only repository permission, no Google environment/secrets,
no artifact upload and no dependency cache. No job was run here.

GitHub requires a workflow-dispatch file on the default branch [S8]. Installation
there needs a separate CI-only approved change, not merging PR #6. The draft lives
as `native-ci.yml.proposed`, outside `.github/workflows`, and cannot trigger itself.
It checks out the explicitly approved full staging SHA. Actions are pinned to the
v6 tag digests resolved read-only on 30 October. See [NATIVE-TESTS.md](NATIVE-TESTS.md)
for the executable procedure, alternatives, evidence and cleanup.

## E. Costs and precise approvals

| Action | Expected incremental cost / permission |
|---|---|
| Current source audit/proposal/fixtures | No new service expenditure; already authorised; no live resources used |
| Recommended native job | Expected €0 standard hosted compute under verified public-repository policy; no artifact/cache storage use; Owner approves CI-only default-branch file and one 15-minute run |
| Local Docker alternative | No cloud charges on existing hardware; Docker Desktop personal/noncommercial eligibility must hold [S9]; installation/daemon authority needs local Owner approval |
| Local pilot gateway/PG | Expected €0 service fees using existing approved hardware; OS installation, stable HTTPS origin/certificate trust, private key storage and local disk capacity need approval |
| Dedicated Google user / OAuth | No license purchase proposed; confirm an existing suitable account or approve creation; any Workspace seat or other paid account requires a separate price/approval |
| Gaita workbook/folder access | Explicit sharing/permission approval; file access includes the whole named workbook; no unrelated Owner resources |
| Common Cloud project/API deployment | Explicit account/project/scope/consent/deployment approval; no billing link or billable Cloud Run/Cloud SQL/Secret Manager resource proposed |
| New Dummy writes/storage | Approve <=10 labelled new recordings and <=50 MiB incremental audio, selected comments/target assignment/badge award only for Dummy; confirm existing Drive capacity; staging TTL proposed 24h, never erase unresolved evidence/local audio |

These are proposed caps, not approval. Do not promise all Google storage/account
costs are zero without verifying the chosen account's quota/license. No real-pupil
read cache, public app, new paid infrastructure or external release is requested.

Short Owner checklist, in order:

1. Approve a separate native CI-only default-branch change and ONE <=15-minute
   standard public-repository run with no Google secrets, artifacts or cache.
2. Accept or decline the dedicated automation identity's named whole-workbook/
   folder access and short-lived execution token; no personal Owner credential.
3. Review actual Google project/access/scopes first. Approve exact new private API
   deployments and any Cloud-project association separately; a default-project
   migration has no simple code rollback and is not included automatically.
4. Approve the selected local HTTPS machine/origin, certificate trust and durable
   pilot key/intent/revision storage. No cloud billable host is proposed.
5. Approve the bounded exclusive Dummy run and its named new records/teacher
   changes. No historical rewrite, external pupil or later general release follows.

## F. Dummy-only acceptance and release boundary

Before any live test: native gates pass; actual versions/configuration/rollback and
Dummy baseline recorded; exact approvals above obtained; current canonical Dummy
active status verified without auto-activation; original origin's pending audio
accounted for; durable keys/intent/revisions tested; no personal refresh credentials;
dummy-only receiver policies and denied foreign selections proven with fixtures.

First live connection is read-only Dummy. Only after that passes may explicitly
approved new Dummy recordings/teacher changes begin. The acceptance runbook covers
record/pause/resume, offline/reload, exact hashes/duration/receipts, lost responses,
PATH/playback, comments/reviews, badges/targets, duplicate prevention and revocation.
Foreign-pupil tests use synthetic/nonexistent IDs and ungranted existing test
principals; no Annie access or real pupil mutation is required.

After a successful pilot, keep external access disabled. External release separately
requires all-writer/native durability/backup evidence, real guardian/multi-child
and assistive-device tests, origin recovery migration, production HTTPS/keys/rate
limits, full-size playback and a reviewed cost/credential/rollback plan. Pilot
success cannot authorise general release.

## Evidence, validation and status

Inspected repository source at the starting checkpoint, not the live Apps Script
editor. File headers/manifests can be historical and do not certify live settings.
Previous 31+55+7=93 fixtures were not rerun; no counts are added to them. This work
prepares native tooling and a runbook only. Two syntax checks and five no-resource
preflight checks passed; `--list` labels all six supplementary native cases as
PREPARED_NOT_EXECUTED. No native execution took place. No CI job, container,
Google account/configuration or live test was created. Unrelated worktrees preserved.

Authoritative history remains the SAME Google handover. The published proposal
commit/tree and readback status are recorded there. Source rollback is the starting
commit; no live rollback is needed. Existing private v8/v2/v5/v1 and previous saved
versions remain unchanged. CHAT 3 must review this proposal and obtain Leslie's
specific approvals before further live implementation. Continue WORK 4; no WORK 5.

## Primary sources checked 30 October 2026

- S1: https://developers.google.com/apps-script/api/how-tos/execute
- S2: https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run
- S3: https://developers.google.com/apps-script/guides/triggers/installable
- S4: https://developers.google.com/apps-script/guides/services/quotas
- S5: https://developers.google.com/identity/openid-connect/openid-connect
- S6: https://developers.google.com/apps-script/guides/cloud-platform-projects
- S7: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- S8: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- S9: https://docs.docker.com/subscription/desktop-license/
- Official container storage layout: https://github.com/docker-library/docs/blob/master/postgres/README.md

Search-service calls returned empty errors; the primary pages above were retrieved
directly over HTTPS and reviewed. No search result or invented current price is
being substituted for these sources. Account quotas/settings and actual Google
deployment access remain unverified until a specifically approved inventory.
