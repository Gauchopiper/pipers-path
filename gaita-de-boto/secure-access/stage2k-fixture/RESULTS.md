# Stage 2K — native PostgreSQL and witness results, 2 November 2026

**PARTIALLY BLOCKED. NO-GO for controlled Google integration.**
Accepted development parent: 85650b7fc23a25b9a13189bf5f1ef00156c00e80.

## Native environment and installation evidence

No native PostgreSQL version is installed or executed. An existing installation
was not found. A scratch-only apt list/cache preparation failed because the
container cannot switch to the package fetch identity (_apt); exact output is
preserved in diagnostics/installation-attempt.txt. A separate official Ubuntu
snapshot InRelease download succeeded and gpgv verified the archive signature
against the installed Ubuntu archive keyring. That is distribution provenance
only, NOT a downloaded PostgreSQL binary/package or a server installation.

The actual hard runtime restriction is UID/GID mapping: /proc/self/uid_map and
gid_map each contain only `0 0 1`. Non-root switching fails and a nested namespace
attempt cannot write its uid_map. PostgreSQL requires a non-root server user.
No root-check bypass, LD_PRELOAD shim, patched server, elevated shared-system
change, external service or operational database was used. Changing Leslie's
Windows computer was never considered. environment.json retains the exact
observations/provenance hash. No package/service was installed and no database
process, data directory, TCP port or temporary password was created.

N01 concurrency, N02 crash/restart and N03 authenticated permissions remain
BLOCKED. The prepared native harness registers 135 case-level checks, all blocked
before setup. Zero native test executions and zero native passes. No PGlite or
SET ROLE output is substituted for native success. Its unexecuted paths may have
defects; syntax/static safety checks do not certify those paths.

## Final new execution accounting

| Suite | Registered | Executed | Passed | Failed | Skipped | Blocked/unexecuted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| New witness/safety offline final-03 | 51 | 50 | 50 | 0 | 0 | 1 |
| New native harness native-final-04 | 135 | 0 | 0 | 0 | 0 | 135 |
| Stage 2J rerun stage2k-regression-01 | 220 | 216 | 216 | 0 | 0 | 4 |
| Stage 2I/2H/2G rerun stage2k-regression-01 | 533 | 525 | 525 | 0 | 1 | 7 |
| Final registrations/executions THIS stage | 939 | 791 | 791 | 0 | 1 | 147 |

Blocked/unexecuted are the SAME registrations. These are four distinct outstanding
requirements (three native plus genuinely independent retention) repeated across
cases/suites, not 147 independent security gates. The one unchanged skip is the
non-UTF8 binary-message RSA vector. The 791 final passes include newly EXECUTED
regressions; they are not 791 new unique Stage 2K tests. Historical results and
repeated development executions are excluded from this final total.

All eight previously repaired assertions H06, A06, A07, A09, J03, J04, J05 and R04
passed in the actual new regression rerun with their original assertions unchanged.
WAV/WebM independent comparisons, 299.99/300-second qualification, signature bounds,
permit revalidation, nonce/Event-ID protection, foreign pupil rejection, duplicate
receipt denial, protected reads and encrypted original retention remain passing.

## Development and gate attempts retained separately

| Run | Registered | Executed | Passed | Failed | Skipped | Blocked/unexecuted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| development-01 | 46 | 45 | 45 | 0 | 0 | 1 |
| final-03 | 51 | 50 | 50 | 0 | 0 | 1 |
| native-final-03 | 135 | 0 | 0 | 0 | 0 | 135 |
| native-final-04 | 135 | 0 | 0 | 0 | 0 | 135 |
| native-gates-01 | 133 | 0 | 0 | 0 | 0 | 133 |
| native-gates-02 | 135 | 0 | 0 | 0 | 0 | 135 |
| verification-02 | 50 | 49 | 49 | 0 | 0 | 1 |

No executed Stage 2K test failed. The package-manager operation and namespace
mapping probe failed as recorded above; those are environment-preparation failures,
not passed or executed native security checks. Initial offline runs had fewer
cases; later runs add fresh-admission/pending/expiry and multistep rotation tests.
Earlier native gate attempts had 133 registrations before backup/positive-path
cases were added; they also executed zero cases.

## Implementation classification and security results

IMPLEMENTED — native.cjs: dormant native harness with independent pg connections,
real temporary SCRAM identities, private sockets/no TCP, own marked PGDATA and
exact process/owner/command checks before immediate-stop crash testing. It prepares
competing claims, SKIP LOCKED, duplicate/conflicting submissions, lease/fence,
concurrent receipts/admission, revocation, transaction isolation, eight crash
positions, native role/function denial matrix, cross-database denial, backup/restore
and positive receipt/PATH/recovery/revision paths. It refuses root before creating
any directory/process. No installer or external connection string is accepted.
VERIFIED OFFLINE — syntax and safety guards. VERIFIED NATIVE — NONE.

IMPLEMENTED / VERIFIED OFFLINE — separate key-ledger.cjs rotation model. It binds
namespace/profile/generation, retained client epoch/head, dual old/new-key consent,
new-key possession, fresh Owner admission/policy, no pending journal reservation,
short expiry, revocation and fresh nonce challenges. Retired keys cannot sign or
validate new responses. Wrong signatures, changed identity/sequence, stale policy,
expired permits/responses, key-ledger rollback and lost retained-pin ACK are denied.
Exact retained transition recovery works; a different transition cannot overwrite
it. Two successive rotations preserve the complete signed chain. Private keys
are never stored in the ledger backup.

PROPOSED / BLOCKED — this rotation prototype is not wired into Stage 2J's witness,
SQL adapter, canonical writer or a real transport. Its retained-pin capability is
an offline in-memory model of a separate trust domain. A test explicitly restores
the ledger AND pin to old state and demonstrates that detection then fails.
No off-host durability or independent administrator is established. Key rotation
or signed challenges alone do not fix total-domain rollback.

VERIFIED OFFLINE — existing Stage 2J witness/coordinator rerun tests source/primary
rollback with witness retained, source-signature rejection, nonce preservation,
sequence conflicts, replayed freshness, outages, pending reservations and exact
reconciliation. Existing full canonical VM rerun covers file/LOG/META/receipt/
outbox/flush/lock interruptions. These remain synthetic component evidence.

## Backup, receipt and recording recovery

Original Session ID, pupil binding, hash, byte length, MIME, independently validated
duration, canonical LOG/META identity and signed proof remain protected by the
unchanged fixtures. Uncertain originals remain encrypted, cannot blindly requeue,
and cannot become SAVED without exact independent evidence. Duplicate callbacks
produce one credit. Qualification stays 300 seconds; no badge/history recalculation.
Recorder v8 and IndexedDB are untouched; SAFE ON DEVICE awaiting confirmation
remains the required unresolved state. No real recording or Google test occurred.

Real native crash/WAL/backup restoration, authenticated database logins, denied
other-database CONNECT and independent transaction behaviour remain unverified.
The native harness media callback is mocked; its deferred source receipt contract
still needs a reviewed canonical bridge, and actual playback port remains blocked.
No true native end-to-end recorder certification is claimed.

## Proposed witness architecture, costs and remaining controls

WITNESS-ARCHITECTURE.md proposes independently administered witness signing/service,
immutable retained event history, client high-water pins outside restore scope,
separate key/recovery custody, fail-closed startup/current-head discovery and
retention that covers every supported backup horizon. A versioned compliance-mode
object archive is one possible control, not a selected/provisioned service.
Old-version storage alone is not a latest-head witness. Account/key compromise,
retention expiry and restoration of every authority/pin remain explicit boundaries.

AWS publishes US$1/key/month for customer-managed keys including asymmetric keys;
two such witness keys illustrate US$2/month of KEY charges only. Requests, storage,
compute, monitoring, taxes and region/currency charges are extra, so no all-in quote
or spending approval is implied. Primary URLs and recovery procedure are in the
architecture document. No external account, immutable store or cost was created.

## Cleanup and preservation

Final new offline run created/removed 48 temporary directories; Stage 2J rerun
29/29; Stage 2I rerun 638/638. Total final 715/715, zero remaining. Native harness
created zero directories/processes/credentials. Preparation scratch directories
were removed after retaining environment/log evidence. Test-network attempts are
zero; official reference/download and source retrieval are separate from offline
execution. No dependency, server, service, listener, real external credential, hosting or
paid account was installed/created; synthetic test keys existed only transiently; expenditure and CI runs are zero.

All existing tracked application/site/workflow/fixture implementation/test files
are unchanged from accepted parent. Only new Stage 2K files and new regression
evidence are added. Previously unrelated untracked files were left untouched in
their earlier worktrees. Recorder v8/Pupil v5/Teacher v2/Feedback v1, inactive Dummy,
all Google data/configuration/permissions/scopes/projects/deployments/triggers,
other organisations, histories, recordings, practice totals, qualifications and
badges remain unchanged. main is not modified; PR #6 remains draft and unmerged.

## Decision and next authorisation

**NO-GO for controlled Google integration.** Stage 2K's offline work is completed,
but its principal native verification and genuine independent witness retention
remain BLOCKED. The next practical requirement is a suitable disposable non-root
Linux execution environment; a paid service is not intrinsically required. Do not
repeat environment probes here unless that UID/runtime capability changes.

Recommend CHAT 3 review this exact checkpoint, arrange an approved non-root native
runtime, and review independent witness retention/key custody/restore policy.
Then execute N01/N02/N03 on the exact candidate without weakening permissions.
Real Google source/runtime/crypto/persistence, canonical bridge, playback,
Teacher/Feedback/manual revision coordination and browser recovery remain later
gates. No external witness account, Google change, OAuth grant, journal workbook,
CI run, paid hosting, deployment, Dummy activation or live recording starts
without new specific approval. Continue WORK 4; do not open WORK 5.
