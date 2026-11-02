# Gaita writing-path inventory and revision integration

Inspected repository source at `5ffa075b03f07224ead204711a3611265807a244`.
This is not a live Apps Script source/export or permission certification. The
working deployments remain unchanged. Proposed hooks below are not implemented.

## Observed handlers

| Existing path | Actual current writes/effect | Required future coordination |
|---|---|---|
| Pupil `gdbPUpload_` | STARTED receipt, Drive file, PRACTICE LOG, META; testFixture can label META note | Original identity intent + DIRTY before side effect; same single-writer lock; exact receipt; sessions/totals/availability and organisation GROUP invalidation |
| Pupil `gdbPReceipts_` | Creates RECORDING RECEIPTS tab/header when missing | Setup/authority mutation, never hidden in a new read-only inspection; preserve journal evidence |
| Pupil `gdbPEnsureMeta_` | Adds META or fills missing Session ID | Explicit reconciled mutation; pupil/session metadata revision; source verification before clear |
| Pupil `gdbPRecordingState_` | Calls the above read-repair/setup paths | Replace gateway inspection with side-effect-free reader; separately authorised repair only |
| Pupil `gdbPSetTarget_` | May repair META, then sets its Target ID | Resolve original Session ID server-side; `session.targetChanged` must invalidate sessions + targets/pupil view; current raw Drive URL API is not exposed to pupils |
| Owner `gdb_testReplayStored` / `gdb_testRequest` | Routes to current Pupil handlers; replay can reach read-repair | Exclude from new external allowlist; candidate proof cannot rely on old duplicate response; retain Owner-only working tools |
| Teacher `gdb_createPupil` | One complete inactive PUPILS row, no link/key | Owner roster/profile revision; no pupil creation in first Dummy pilot; provisioning remains disabled globally |
| Teacher `gdb_setActive` | Changes PUPILS Active | Access + pupil and Owner roster revision; current canonical activation checked independently on every protected operation |
| Teacher `gdb_assignTarget` | Adds PUPIL TARGETS row unless existing | Pupil target revision and idempotent operation evidence |
| Teacher `gdb_review` | Changes META teacher status/note/reviewed time | Reviews/pupil revision; current code does NOT automatically award a target or badge; conservative dependency invalidation is permissible |
| Teacher `gdb_awardBadge` | Adds PUPIL BADGES unless already awarded | Badges/pupil revision and operation receipt; never alter older awards |
| Teacher `gdb_createTarget` | Adds shared TARGETS catalogue entry | Organisation-wide catalogue DIRTY/version, all pupil views; frozen for first pilot unless separately approved |
| Teacher `gdb_createBadge` | Adds shared BADGES entry | Same organisation catalogue barrier; frozen for first pilot unless separately approved |
| Teacher `gdb_commentTab_` | Creates teacher-comment sheet/header when absent | Explicit setup inside authorised mutation; not a read hook |
| Teacher `gdb_comment` | Adds idempotent TEACHER COMMENTS row | Comments/pupil revision; original verified Owner actor retained, not automation email masquerading as a teacher |
| Feedback `gdb_submitFeedback` | Adds PUPIL FEEDBACK; validates current pupil/key/Active | Own operation receipt and current identity checks in any future wrapper; currently no PATH dependency, not a teacher comment. First pilot excludes new feedback submissions; v1 stays untouched |
| Gateway access/grant operations | Durable grant activation/deactivation/revoke/rotate/expiry | Access revision and current authorisation checks; pilot allows only Dummy grant, never changes legacy encryption capability |

Current Teacher `gdb_recordingAudio` is read-only and checks a matching logged
pupil/session, MIME and a 5 MiB size cap. It does not explicitly verify the configured
recordings folder or apply a pupil's Google/grant authorisation. It is an Owner/
Assistant route, not a secure pupil playback provider. Add actual file/folder/ACL,
current pupil/grant and exact session checks in a new private read adapter; do not
expose the existing teacher function directly through pupil credentials.

Current `gdb_dashboard`/`gdb_detail` are Owner/Assistant reads over broad organisation
data. The candidate Owner pilot UI must receive a Dummy-only projection. Pupil
read routes must not reuse a broad Teacher response. `gdbPPath_` joins META by
file+pupil and includes teacher notes/reviews/comments; its dependencies therefore
include all those tables and catalogue artwork/title/description fields.

## Manual/configuration/file paths

| Source of change | Required treatment before production |
|---|---|
| PUPILS ID/display name/language/Active edits | Pupil/profile/access and Owner roster revisions as applicable; unexpected ID change is an integrity failure, not a silent remap |
| PRACTICE LOG, qualification, duration or row maintenance | Sessions/totals and organisation GROUP revision; independent media evidence; approved reconciliation, no retroactive rule/badge rewrite |
| SESSION META / teacher-comment edits or removals | Pupil view revision; preserve immutable file/pupil/Session ID identities and audit |
| PUPIL TARGETS / PUPIL BADGES edits | Relevant pupil target/badge revision and audited operation |
| TARGETS / BADGES catalogue or image/resource edits | Global catalogue barrier; validate allowed public artwork/resource policy before rendering |
| RECORDING RECEIPTS or new original-identity manifests | Protected authority maintenance; preserve STARTED/uncertainty and original identity; never clear to force retry |
| PUPIL FEEDBACK maintenance | Separate feedback scope; only becomes PATH-relevant if a future feature adds that dependency |
| Drive move/trash/delete/MIME/ACL/folder change | Recording availability + source ownership/ACL checks; a revision token alone is insufficient |
| Owner/Assistant role configuration | Current teacher authorisation; revoke affected sessions/roles and audit separately from pupil grants |
| Workbook/folder/deployment/origin configuration | Namespace/config generation; stop candidate on mismatch; no client-selected identifiers or cross-organisation fallback |
| GDB_QUALIFY_MINUTES | Keep exactly 5 for pilot; validate startup/current writer rule; a change affects future admissions, never silently rewrite history |

The earlier revision prototype covers selected pupil events and a shared catalogue
barrier. It still needs explicit profile/Owner-roster, session-target and GROUP
dependencies in production adapters. GROUP is derived from all Gaita qualifying
logs, including activity outside Dummy; cache invalidation cannot be pupil-only.

An onEdit trigger does not close these gaps: Google documents that ordinary script
executions and API writes do not trigger these events. A manual edit can also race
with an asynchronous notification. Direct Drive ACL/trash changes are not worksheet
edits. Source: https://developers.google.com/apps-script/guides/triggers/installable

## Integration sequence without stale/unauthorised pilot views

1. Keep current web-app versions pinned. Obtain actual deployed-source/configuration
   inventory and a baseline of Dummy-only rows, approved shared catalogue values,
   existing file hashes/counts and access rules. Do not infer this from repository headers.
2. Route ALL candidate Dummy writes through the gateway's native durable coordinator:
   current Owner/grant → persisted DIRTY/operation → approved private original-writer
   action → canonical read-only inspection → atomic revision/receipt completion.
   Never hold a database transaction/lock while waiting minutes for Google.
3. Use direct reads with current canonical activation + gateway grant and clean
   versions before/after. Actual Google snapshot providers must inspect the canonical
   data; the earlier synthetic source-digest callback is not such a provider.
4. Keep legacy Dummy UI writes, manual Dummy maintenance and shared catalogue edits
   frozen during the approved pilot window. Detect unexpected baseline/source changes
   and abort/mark dirty; never continue on cached data. This operational freeze does
   not technically disable an Owner's pinned legacy endpoint; record that limitation.
5. Revocation test changes the NEW gateway Dummy grant only. It does not rotate the
   legacy key, deactivate Annie, change Dummy's existing canonical Active field or
   affect v8. Canonical Active enforcement is tested with fixtures/read-only checks.
6. Before external release, make every live legacy/manual path participate or become
   effectively blocked under a reviewed maintenance process. Separate project locks
   and an Owner promise alone are insufficient for production consistency.

For any verified duplicate/no-op, record the operation outcome without duplicating
data. A conservative version increment is safe; no-op handling must not create
practice credit or hide an earlier side-effecting read repair.
