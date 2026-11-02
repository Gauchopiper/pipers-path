# Stage 2J results — 2 November 2026

## Authoritative final evidence

| Suite | Registered | Executed | Passed | Failed | Skipped | Blocked/unexecuted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| New Stage 2J candidate, verification-07 | 220 | 216 | 216 | 0 | 0 | 4 |
| Existing Stage 2I/2H/2G rerun, stage2j-regression-01 | 533 | 525 | 525 | 0 | 1 | 7 |
| This stage's final executions, both suites | 753 | 741 | 741 | 0 | 1 | 11 |

The combined row includes NEW executions of the existing regression cases, not
new unique Stage 2J coverage. Do not add historical passing results or repeated
development runs. Blocked/unexecuted describe the SAME registrations, not two
sets. N01/N02/N03 are repeated across suites: eleven blocked registrations
represent four unresolved gates (three native plus independently retained witness).
The unchanged skip is the non-UTF8 Wycheproof binary-message vector.

All eight repaired negative cases remain passing in this stage's rerun:
H06, A06, A07, A09, J03, J04, J05, R04. Existing source/tests and their original
assertions are unchanged. All accepted RSA vector/policy outcomes remain passing;
Python WAV/FFmpeg WebM comparison and 299.99/300-second qualification cases pass.

## Development runs — retained separately

| Run | Registered | Executed | Passed | Failed | Skipped | Blocked/unexecuted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| development-01 | 196 | 192 | 2 | 190 | 0 | 4 |
| development-02 | 196 | 192 | 149 | 43 | 0 | 4 |
| development-03 | 196 | 192 | 192 | 0 | 0 | 4 |
| development-04 | 218 | 214 | 213 | 1 | 0 | 4 |
| verification-05 | 212 | 208 | 207 | 1 | 0 | 4 |
| verification-06 | 212 | 208 | 208 | 0 | 0 | 4 |
| verification-07 | 220 | 216 | 216 | 0 | 0 | 4 |

Development-01 failed 190 cases because PGlite RESET SESSION AUTHORIZATION did
not restore the provisioner identity. The isolated harness now explicitly selects
the original provisioner before fixture resets. Development-02 had 43 failures
because an admin SELECT helper returned exec's result array instead of rows.
These are preserved as executed failures; they are not counted as successful tests.
Development-03 passed its then-current 192 available cases.

Development-04 and verification-05 each failed the witness history test because
its old and newly appended dispatch values were identical: deleting one left the
same prefix. The test was corrected to use a distinct second dispatch identity;
the prefix-preservation guard was not loosened. Original failing evidence is
retained. Redundant SQL-outcome boundary cases were consolidated into three
distinct SQL states rather than counted as ten different source interruptions.
New coordinator tests directly interrupt six separate durability boundaries.
Verification-06 passed 208 available cases; verification-07 adds the source/
primary/witness coordinator and is the complete final candidate authority.
Two command-launch path mistakes exited before any suite registration/execution;
they made no changes and are not represented as completed test runs.

## Implementation and security evidence

The new candidate installs in PGlite and implements 15 scoped public functions,
strict internal validators/locks, a NOLOGIN owner and separate nonadministrative
service roles. The test matrix checks function grants AND attempts denied calls;
raw table mutation, ownership assumption and schema creation are denied. Fixed
search paths, PUBLIC revocations, CONNECT/TEMP and backup/migration boundaries
are catalog-checked. These are WASM ACL checks with simulated session identities,
not native role authentication or cross-database proof.

Immutable SID submissions/conflicts, expired leases, monotonically advancing
fences, stale dispatch denial, rollback and durable clean reopen pass. SENT and
ATTENTION never automatically requeue. Separate source-signature verification
is required before SQL confirmation. Exact duplicate receipts give one credit;
forgery/conflicting fields are denied. Internally reconciling after revocation
does not release pupil data. Five-minute threshold remains 300 seconds, with
299.99 nonqualifying and zero badges. Backup/runtime data contains no AES/source
private keys.

The narrow protected PATH fixture uses an opaque hash, original client/revision/
admission, independently signed exact projection, encrypted staging and one-use
release. Revocation, DIRTY, expiry, changed client/version, replay and raw Drive
locators deny release. Playback remains fail-closed pending its decoder/projection
port. Real Google identity/CSRF/browser sessions are not implemented here.

## Journal and recording recovery

Source-signed checkpoint reservations are independently verified by a separately
keyed retained-witness model. Fresh challenges bind nonce/expiry/generation/profile/
key revision and exact retained head. Old source/primary snapshots, missing nonces,
Event-ID reuse, wrong sequence/digests and tampered source signatures are denied.
Coordinator intent, witness reserve, source append, witness commit and primary
commit are individually interrupted. Missing source evidence stays frozen; exact
existing source evidence may finish reconciliation. Witness outage blocks new
SQL claims/reads and preserves original encrypted audio.

The complete unchanged Stage 2I regression exercises actual canonical VM failures
at fresh-authority/intent, STARTED, file, LOG, META, source verification, receipt,
outbox, readback, multiple flushes and lock release. It also tests journal-before-
append, after-row and witness-commit failures. The three new SQL recovery tests
cover no receipt, a complete receipt awaiting reconciliation, and lost completion
acknowledgement. No second source writer/lock was introduced. No uncertain outcome
is silently SAVED and no missing LOG/META is automatically repaired.

**Actual independent retention remains BLOCKED.** Tests explicitly demonstrate
that a consistent rollback of witness AND every primary authority is undetectable.
Separate files and fresh signatures do not change this fact. Real independent
administration, immutable/off-host retention, key rotation/custody, authenticated
fresh-authority transport, policy revision coordination and restore review are
still required. The local witness cannot certify them.

## Cleanup, preservation and remaining gates

Final candidate: 29 temporary directories created/removed, zero remaining.
Regression rerun: 638 created/removed, zero remaining. Final executions total
667 created/removed; zero external test-network attempts, live Google recording
tests, CI runs, native server installations or expenditure. Development cleanup
counts are kept in their own machine-readable results. No dependency was installed;
only the already pinned local PGlite dependency was reused through a temporary
symlink, removed before publication.

All existing tracked application, site, workflow, fixture implementation and test
files are byte-identical to accepted baseline 2de980d; only new candidate files
and new regression evidence were added. Operational Code.gs SHA-256:
3574499d264a826459c61f7733ef276e769266342250797b423a8b548ddb73d1.
MediaDuration.gs SHA-256:
09ee8f43e2c98cbe8947f35f4558f3fa278a775d9d603466201b9f498bf80693.
The unrelated untracked file in the earlier worktree was left untouched.
No Google workbook/folder, Dummy record, permission, scope, deployment, trigger,
organisation, historical recording/totals/qualifications/badge or IndexedDB changed.

Remaining gates: N01/N02/N03; genuine witness retention; native key/TLS/HBA/pool
separation; exact canonical protocol bridge; playback port; real-source/runtime/
persistence/crypto verification; policy/key rotation; Teacher/Feedback/manual
revision coordination; browser recovery. SQL uses an independently trusted verifier
service, not in-database RSA; its deployment and credentials remain unconfigured.
The synthetic new DAL media callback is mocked; independent duration verification
is separately established by the unchanged canonical VM regression, not this DAL's
production wiring. A WASM clean reopen is NOT an abrupt native crash test.

**CONDITIONAL GO for the next offline review/native-preparation stage only.**
**NO-GO for controlled Google integration, live recording or deployment.**
Recommend CHAT 3 review of the exact new checkpoint, then separately scoped native
verification and independent witness/key/restore design. No installation, hosting,
Google integration, CI, expenditure or live test begins automatically.
