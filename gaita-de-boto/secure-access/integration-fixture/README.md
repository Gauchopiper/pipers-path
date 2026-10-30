# WORK 4 → CHAT 3 — PostgreSQL and integration verification

Next approved preparation: [Dummy-only proposal](../pilot-preparation/PROPOSAL.md),
with native-test tooling and acceptance runbook. It does not approve live changes.

30 October 2026. Continuation authorised by CHAT 3; fixture checkpoint only.
No live application, permission, pupil or recording changed.

Starting published commit: `c2a17051c954e7d5f21e1e20b89974dda7e63401` in
`Gauchopiper/pipers-path`, branch `feature/gaita-de-boto-staging-20261019`.
PR #6 stays draft/unmerged. The exact final published commit and readback are
recorded in the SAME authoritative Google handover, with previous history intact:
https://docs.google.com/document/d/1Bn7I8H1G3kSIq6S5R2nA7pbn0vUWEJf0GRnIlUlnuHU/edit

## Native PostgreSQL attempt — blocked before startup

Executed environment checks found no `postgres` or `initdb` binaries, no native
server under `/usr/lib/postgresql`, and no cached PostgreSQL package. Runtime user
is UID 0 on Ubuntu 24.04.3. The bounded non-root preflight produced:

```text
runuser -u nobody -- id
runuser: cannot set groups: Operation not permitted

Python os.seteuid(65534)
OSError: [Errno 22] Invalid argument
```

PostgreSQL's documented initdb/server requirements forbid running as root:
https://www.postgresql.org/docs/current/app-initdb.html
Consequently no native cluster was installed or started, and no native SQL,
independent-connection, restart or backup/restore test ran. No repeated installation
attempt, privilege workaround, host service or paid cloud resource was used.
This is a precise local execution blocker, not evidence of native correctness.
The three previously prepared native races remain pending, not passed.

## What changed

New isolated files: `receipt.cjs`, `receiver.cjs`, `revisions.cjs`, `revisions.sql`,
their three test files, this README and `INTEGRATION-SPEC.md`. Added
`test:work4:integration` in `secure-access/package.json` and a continuation pointer
in the previous fixture README. No production route imports any new file. Existing
Apps Script, private recorder, identity/provisioning modules, queue implementation
and shared production migrations were not modified.

Development used `/workspace/scratch/5fe09d45d556/pipers-path-integration`, a separate
detached worktree at the published starting commit. Prior unrelated image and EMGT
workspace changes remain untouched. The dependency symlink is excluded from Git.

## New executed tests

From `gaita-de-boto/secure-access`:

```sh
npm run test:work4:integration
```

| New suite | Final passed | Final failed | Execution boundary |
|---|---:|---:|---|
| `node integration-fixture/receipt.test.cjs` | 31 | 0 | Actual unchanged Apps Script/media parser; mocked Google services/identity/intent store |
| `node integration-fixture/revisions.test.cjs` | 55 | 0 | PGlite single-connection SQL/disk reopen; synthetic canonical mutations and source proofs |
| `node integration-fixture/queue-delivery.test.cjs` | 7 | 0 | Actual PGlite queue + new receiver choreography + unchanged writer VM |

**93 new named check executions**, including 11 read scenarios repeated for direct
and cache modes. Not 93 distinct scenarios or production tests. Earlier 83 checks
were not rerun or added to this count. Intermediate development runs are not added
to final totals. Whitespace checks cover the full staged change.

Actually executed: Node functions, PostgreSQL SQL on PGlite, atomic SQL revision/
receipt rollback with an injected trigger failure, disk close/reopen preserving
DIRTY markers, queue staging/confirmation, original writer/parser code, read-only
snapshot inspection and current-authorisation response checks.

Simulated: all Google file/sheet/ScriptLock behaviour, account/grant/ACL evidence,
intent persistence, authoritative change inspection, source edits/crashes/lost
responses and PCM WAV recordings. The receiver mutex is process-local, not a
native/multi-instance lock. PGlite close/reopen is not native restart, power-loss
durability or backup/restore. No real pupil information entered a cache.

Not verified: native connection contention/SKIP LOCKED/deadlocks, genuine Google
identity, actual Apps Script and Drive permissions/quotas, live source parity,
real device recovery, production persistence, secure transport or real latency.

## Findings

The complete integration contract is in [INTEGRATION-SPEC.md](INTEGRATION-SPEC.md).

- Read-only receipt inspection never calls the existing `gdbPRecordingState_` /
  `gdbPEnsureMeta_`, creates a receipt tab, repairs META or writes an identity row.
  Missing/duplicate/foreign META stays attention; explicit canonical repair is a
  separate controlled mutation. Tests demonstrate the old lookup's repair side effect.
- A trusted immutable original-identity manifest is required for a SAVED assertion.
  It must bind the verified subject/scope before a new dispatch. Historical saves
  without it stay unbound; even an identical-byte resubmission cannot retroactively
  create provenance. The fixture manifest is memory-only, so durable provenance
  remains an explicit live-integration requirement.
- Confirmation verifies private file/folder, exact original binding, actual sample
  duration and matching PRACTICE LOG/META. Original timestamps remain in the
  manifest while the canonical log's end time uses the existing sample-derived
  normalisation. The 5-minute rule uses samples: 299.9 seconds does not qualify
  even when stored rounded minutes equal 5.00; 300 seconds qualifies. Media limits
  remain unchanged. MP4/OGG remain rejected by existing duration evidence.
- The new fixture receiver delegates every Drive/Sheets audio write to the existing
  `gdbPUpload_` through the prior canonical VM. It does not implement a second writer.
  Unknown dispatched outcomes, STARTED and orphans do not automatically upload again.
  Queue acceptance never releases local audio; exact final receipt does.
- Revision tokens include an organisation generation, shared catalogue revision,
  pupil revision and access revision. DIRTY is committed before a synthetic source
  mutation; readers fail closed until trusted source inspection permits completion.
  Counters and operation receipt commit together in SQL; failure leaves DIRTY.
- Shared target/badge catalogue changes establish an organisation-wide barrier,
  blocking views for all pupils until completion; no client-provided affected-pupil
  list is trusted. Verified completion changes every pupil's composite token.
  This deliberately invalidates more views rather than miss a catalogue dependency.
- Direct authorised reads remain the provisional reference. A cache is still only
  a comparison fixture. Current membership is checked before/after retrieval;
  revisions invalidate the next read without waiting for the serving TTL. No
  millisecond or cross-service propagation bound was measured. Already delivered
  bytes cannot be recalled. TTL is not physical erasure; idle entries persist until
  sweep or process exit.

The prototype proves its own SQL/fixture choreography, not atomicity between a
PostgreSQL marker and Google Sheets. Every real Pupil/Teacher/Feedback/manual-edit
route affecting the view would need the same authoritative coordination contract.
Existing separate-project ScriptLocks do not provide that coordination. Tests
still demonstrate stale cached comments if a source edit bypasses revisioning.
The old read fixture was deliberately retained to expose that unresolved gap.

An initial test assumption was corrected: the existing `after-log` fault double
throws after META append/at flush, not exactly before META append. The read-only
missing-META test now explicitly constructs missing persisted metadata; it does not
claim an exact crash point the source does not implement. Canonical operation
encoding was also made independent of input-object key order for safe replay.

## Next step and approval boundary

Run native tests in a suitable non-root local PostgreSQL environment; use the
controlled lock/restart/restore protocol in the specification. Review the durable
identity-manifest, read-only receipt and all-writer revision contracts before
proposing a controlled Google integration. Neither direct reads nor caching has
been selected for production, and no live receiver or transport was implemented.

The current handover authorises publication of passing fixtures to the existing
branch through the established GitHub connection with expected-head protection.
It does not approve Google credentials/scopes/permissions, a real private-data
cache, new account/trigger/configuration, external pupils, expenditure or deployment.
No Owner refresh credential was requested or stored. Provisioning stays disabled;
Annie and the other organisations remain untouched.

Fixture rollback: stop the tests and discard only synthetic fixture databases.
Preserve starting commit `c2a17051c954e7d5f21e1e20b89974dda7e63401`; do not revert
production data or erase device audio. Private recorder v8 / Teacher v2 / Pupil v5 /
Feedback v1 and their recorded v8/v7/v6/v5 rollback references remain unchanged.

CHAT 3 must review these results before issuing further work. Any next handover
must update the SAME existing Google document and return to CHAT 3. Do not
independently open WORK 5.
