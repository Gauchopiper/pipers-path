# Owner-run transport and protected reads — execution evidence

Owner authorisation: 31 October 2026. Final verification: **1 November 2026**,
Europe/Madrid, Node **v24.22.1**. New local command: `npm run test:owner-transport`.
The complete final captured execution used its identical Node command directly:
`node --disable-warning=ExperimentalWarning gaita-de-boto/secure-access/owner-transport-fixture/transport.test.cjs`
from the repository root, with **exit code 0** and the complete final summary.

| Measure | Actual final result |
| --- | --- |
| Registered named cases | **87** |
| Passed | **87** |
| Failed | **0** |
| Skipped | **0** |
| Registered cases unexecuted | **0** |
| Instrumented external HTTP/socket attempts | **0** |
| Disposable directories removed and verified absent | **87** |
| New native PostgreSQL / GitHub Actions / live Google runs | **0 / 0 / 0** |
| Infrastructure expenditure | **None** |

`test-results.txt` preserves all 87 case names and the final machine-readable
summary. Counts refer only to the final complete suite. The earlier accepted
**80 Stage 1 fixtures**, **38 native PostgreSQL checks** and historical 93 fixture
executions were not rerun or added. One local smoke path and intermediate/
interrupted captures are diagnostic development activity, not extra passing
cases in these totals. Incomplete captures without a final summary were not
accepted as successful verification.
An additional post-run temporary-directory inventory found no remaining
`gdb-option-c-*` directories, including no interrupted-run residue.

The initial complete development run had 82 passing / 1 failing case. Its
revocation case incorrectly expected an idle, empty queue to reject rather than
return no work; the case now leaves a second original recording pending and
verifies revocation actually prevents its dispatch. Review also made delivery
of an identical already-confirmed receipt idempotent when labelled reconciled;
the new A46 case proves no second write or revision increment. Subsequent new
cases cover Google timeout, lost arm response and wrong read-staging key.

## Tested source fingerprints

| File | SHA-256 |
| --- | --- |
| `gateway.cjs` | `2735b2b24a6bfc865ca72216b409654280b623db6b901a1ba06a1e82057672ae` |
| `owner-runtime.cjs` | `8c5cc09bb5c9b004377f1b7e5219d2dc1d82188558085f79752a10f8fa1db6f2` |
| `protocol.cjs` | `f7bef2423ae4a9b8ea493f52bd4c86ffb5ff85991e846ec882a17b69cf709a6f` |
| `test-support.cjs` | `6a14aa9605852f2f1a2e2d290f0103e494efe797b49a75dd8929f2fb15551158` |
| `transport.test.cjs` | `aac14c0e710a7ed1194bd4d51234251d488f0fc158cf976c485b511a4904acb8` |

## Scope and limitations

Parent/rollback checkpoint: `ec7cc0b213e9183b8a60dad46fd99ba50e470aec`.
New source/tests/evidence reside only in `owner-transport-fixture/`; the only
existing-file change is one additive local npm command. The Stage 1 modules,
canonical Apps Script writer/parser, recorder, Teacher and Feedback source remain
unchanged. Source hashes above cover the actual final tested code.

All service calls use an in-process fixed-origin HTTPS double. All Google calls
use the existing VM/durable local Google double; source recording writes use only
the original writer and existing mocked ScriptLock. New protocol persistence is
SQLite, not PostgreSQL. Teacher effects are a synthetic revision model. Execution
and session identities/capabilities are fixture brands, not live Google identity.
The final tests model injected interruptions and reopenings, not a native server
crash or OS power failure. No real scope, trigger, default-project execution,
Google ACL, browser/IndexedDB recovery, hosted network, production key custody,
Google journal atomicity or all-writer production coordination is certified.
Those behaviours remain explicitly **unexecuted/unverified**, not successful or
silently skipped local cases. See README.md for the exact remaining gates.
