# Stage 2I — execution evidence, 2 November 2026

## Authoritative final result

`../stage2g-fixture/diagnostics/stage2i-final-05.txt.json` contains a complete,
atomic result for **every one of 533 registered cases**. Its statuses, counters
and complete final text transcript were compared directly after execution:

| Registered | Executed | Passed | Failed | Skipped | Blocked | Unexecuted |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 533 | 525 | 525 | 0 | 1 | 7 | 7 |

Blocked and unexecuted refer to the SAME seven registrations, not fourteen.
Exit status: **0 for available offline cases**. This does not clear blocked gates.

| Component | Passed | Skipped | Blocked |
| --- | ---: | ---: | ---: |
| Complete Stage 2G regression registrations | 140 | 0 | 3 |
| Stage 2H regression registrations | 296 | 1 | 3 |
| Stage 2I additions | 89 | 0 | 1 |
| Total | 525 | 1 | 7 |

N01/N02/N03 are each registered in both earlier suites. Their six blocked
registrations represent three outstanding native gates, not six distinct native
conditions. The seventh registration is actual independent witness deployment,
not established by separate SQLite files. The one skip is the unchanged
Wycheproof non-UTF8 binary-message vector tcId 7.

## All eight Stage 2H failures now pass

| Original case | Asserted correction |
| --- | --- |
| H06 | Accessor objects rejected without invoking getter |
| A06 | Permit expiry during ScriptLock wait produces no recording effect |
| A07 | Inconsistent WAV block alignment rejected |
| A09 | Signed nonnumeric permit/admission fields rejected |
| J03 | Valid-tail deletion detected on reopening |
| J04 | Rolled-back journal cannot resurrect a consumed nonce |
| J05 | Duplicate signed Event IDs rejected |
| R04 | Foreign local original identity rejected despite matching audio |

Their negative assertions were not removed, skipped or weakened. Setup changes
are explicit: the new checkpoint/dispatch authority is supplied; A07 no longer
calls the corrected parser before its rejection assertion; R04 now first proves
a valid full-context/source-proof control succeeds before mutating the local
identity. The full original Stage 2H evidence remains at the accepted report and
its saved evidence bundle, outside this new implementation.

Other justified test changes: oversized journal input uses a valid NONCE state
so it reaches the size check instead of an invalid OUTBOX state; changed-profile
tests supply the newly required checkpoint; device positive controls supply full
protected metadata/source keys. The legacy SET ROLE denial probe is retained
as a test fixture, not a proposed role deployment. D01/D02 now inspect the
revised permissions design. The grant scanner excludes SQL comments and has a
positive excessive-grant control. H12's retained measurement is not a claim of
missing predecode bounds; a new dedicated test proves guard placement.

## Development and verification runs kept separate

| Run | Registered | Executed | Reported passed | Failed | Skipped | Blocked/unexecuted | Text PASS lines captured | Evidence status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| development-01 | 143 | 140 | 140 | 0 | 3 | 0 | 128 | Incomplete per-case text capture |
| development-02 | 533 | 525 | 524 | 1 | 1 | 7 | 512 | Incomplete per-case text capture; limit-message assertion failed |
| verification-03 | 533 | 525 | 524 | 1 | 1 | 7 | 523 | Incomplete per-case text capture; SQL comment matched as grant |
| final-04 | 533 | 525 | 525 | 0 | 1 | 7 | 513 | Summary passed but incomplete per-case text capture; NOT final authority |
| final-05 | 533 | 525 | 525 | 0 | 1 | 7 | 525 | Complete atomic per-case JSON and matching transcript verified |

All earlier files are preserved unchanged. Their reported program counters are
distinguished from independently traceable text results. They are not used to
prove final coverage. The runner now retains an in-memory transcript and case
record, writes a streaming capture separately, closes engines, verifies cleanup
and atomically writes/checks the complete final result. The exact cause of the
earlier capture gaps was not established; no hypothesis is presented as fact.

The two development assertion issues were corrected without loosening guards:
oversized arrays now report a workload-limit error rather than a misleading
decorated-array error; SQL comment text no longer causes a false grant match.
No security assertion was changed to obtain a pass. Do not add repeated runs or
the historical 345 passing executions to the authoritative final 525 executions.

## Independent comparisons and environment

- Node v24.22.1, Linux x64; existing pinned PGlite 0.5.13 reports PostgreSQL 18.6
  WASM, emcc 6.0.5, 32-bit. This is a single SERIALISED connection facade.
- OpenSSL CLI 3.0.13 and Python 3 standard-library wave; FFmpeg 6.1.1/libopus.
- Same pinned Apache-2.0 C2SP/Wycheproof dataset as Stage 2H:
  commit `d17cc89fa5c8f4f4d378b5385ebf75da5d0926c9`, file
  `testvectors_v1/rsa_signature_2048_sha256_test.json`, SHA-256
  `94a917b01ff50fb874cfc05bf29b4af44868d944a6558201cf18380da93fb393`.
  Source and licence are retained; no third-party verifier was introduced.
- All previously accepted 258 external vector/policy outcomes remain passing:
  249 invalid signatures denied, six supported valid accepted, one acceptable
  missing-NULL encoding strictly denied, two exponent-3 policy denials.
  One non-UTF8 valid case remains skipped. NIST SHA-256 examples, Unicode,
  encoding, strict padding, expiry, key policy/rotation and RSA-3072 checks pass.
- Python PCM comparisons cover mono/stereo and supported tested PCM bit depths,
  odd chunks/padding and 299.99/300-second boundaries. Real synthetic WebM/Opus
  decodes to 48,000 samples/one second, equal to both old/new media parser output.
- Final cleanup: **638 temporary directories created, 638 removed, zero left**.
  These contain disposable source/primary/witness SQLite files, local WASM DB
  and synthetic-key CLI files. No server/container/hosted DB was provisioned.
- External test-network attempts: **0**; Google recording tests: **0**;
  CI runs: **0**. Public reference retrieval/source publication is separate from
  offline execution. The guard is in-process, not an OS sandbox.

## Preservation and gates

Both proposed application patches pass `git apply --check` but were not applied.
Operational Code.gs SHA-256 remains
`3574499d264a826459c61f7733ef276e769266342250797b423a8b548ddb73d1`;
MediaDuration.gs remains
`09ee8f43e2c98cbe8947f35f4558f3fa278a775d9d603466201b9f498bf80693`.
No site, workflow, real resource ID, pupil data, credential or private key is added.
Dummy status/data and Google accounts/scopes/projects/deployments/triggers are
untouched. No badge/history recalculation, IndexedDB mutation or audio deletion.

F05 is a proposed complete permission surface, not native SQL/DAL implementation;
its reviewed procedure bodies and authenticated positive/negative paths remain
unimplemented/unverified. F01's actual independent witness boundary, N01/N02/N03,
real Google source/crypto/persistence, key custody/hosting, revision coordination
and browser recovery remain gates. There is no professional security or
production-readiness certification. Expenditure incurred: zero.
