# Stage 1 execution evidence

Final verified local run: 31 October 2026 UTC, Node **v24.22.1**.
Command: `npm run test:option-c`, exit code **0**.

| Measure | Actual result |
| --- | --- |
| Named fixture cases passed | **80** |
| Failed | **0** |
| Skipped | **0** |
| Cases registered/executed | **80 / 80** |
| Instrumented HTTP/socket attempts | **0** |
| Disposable fixture directories removed and verified absent | **80** |
| Additional PostgreSQL, Google or CI runs | **0** |
| New infrastructure expenditure | **None** |

See `test-results.txt` for every named passing case and the runner summary.
Counts refer to the final suite only, not cumulative development executions.
The earlier accepted 38 native PostgreSQL checks and historical 93 fixture
executions are unchanged and excluded. This run used local SQLite test doubles,
not PostgreSQL. Actual Google/browser/integration cases remain **unexecuted**;
they are not silently included as successful or as skipped local cases.

During development, one initial assertion expected the `after-log` fault to
remain incomplete. Inspection of the unchanged writer showed META is already
appended before the failing flush. That assertion was corrected to require
exact reconciliation without a source mutation. A separate missing-META case
now verifies fail-closed, non-repairing inspection. Intermediate verification
runs were repeated only after fixture changes; their counts are not added here.
The harness defaults to nonzero exit until every case and cleanup completes.

The tests use existing pure receipt contracts and the unchanged canonical
Apps Script VM. Only the VM writes synthetic recording data. Teacher/review/
target/badge/permission effects are explicitly a synthetic operation model.
No claim is made about real Google locks, actual browser pause/resume, database
power loss, production key management, or real access-token verification.

## Tested source fingerprints

| File | SHA-256 |
| --- | --- |
| `contracts.cjs` | `25155bf26ab0c2bde9548915694742c642eabebc0de6d1db942aa3a688826a39` |
| `google-double.cjs` | `62db79db479923d71ba8093f8c0cca6553ef944bd3f59f51b1c5797dd3910260` |
| `option-c.test.cjs` | `4a4311aeddb4c2cfd6b08032e3f9aea2128caf4badc11f9435a144aece61e1a7` |
| `pipeline.cjs` | `2e96dc8f1772ace28df88410495f0d55681c6c6699241f9f91b3d5aa6c341995` |
| `store.cjs` | `833773c74504c7bcfd226d9f3ce469aff7b6fa74a779d4a7ce5d052b14e1d9c8` |
| `test-support.cjs` | `dee9449fb5e539bdf97743b14ea0d6bc4bda94085c38564aa5e3aa7c7b7c4a2a` |
| `store.sql` | `69e45709dd1b4b8cf304ebd23c3df1834d7ef675b28fd4f3de6cdcd5ba5b4a5f` |

## Scope and rollback evidence

Parent: `64545e0e76bf9ea843f4d28b8ff52ce701011d31`.
All new implementation/test/evidence files are under `option-c-fixture/`.
The only existing-file change is the additive local `test:option-c` npm script.
No runtime dependency or lockfile change; no application source, main or workflow
change. No Google resource/configuration, real recording, pupil, IndexedDB or
qualification history was accessed or modified by these tests.
The feature remains inactive; retain the parent and existing v8/v2/v5/v1 rollback
versions. PR #6 must remain draft, open and unmerged.
