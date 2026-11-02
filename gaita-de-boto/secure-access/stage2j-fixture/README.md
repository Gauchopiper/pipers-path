# Stage 2J — inactive PostgreSQL and retained-witness candidate

Baseline `2de980da1c8fe32330a9f7ed89df87dd0f74fcc8`.
No operational source, application, Google resource, workflow or existing fixture
implementation is modified. No Google recording integration, credential, server,
account, expenditure or production claim.

- `candidate.sql`: executable offline schema, 15 public definer entry functions,
  internal validation/locking helpers, restricted roles and grants.
- `dal.cjs`: procedure-only service adapters; separate source receipt verifier,
  immutable encrypted submitter and one-use protected PATH reader.
- `witness.cjs`: retained signed append-only evidence model, source-signed
  reservations, monotonic head/history, bounded fresh challenge responses.
- `coordinator.cjs`: separate source/primary durability model, exact reconciliation,
  write/read freeze on uncertain reservations or rolled-back state.
- `test.cjs`: synthetic SQL/ACL/transaction, receipt, PATH and witness tests.
- `PERMISSIONS.md`: role matrix, key boundaries and unimplemented ports.
- `NATIVE-PLAN.md`: outstanding N01/N02/N03 procedures and environment gates.
- `RESULTS.md`, `register.json`, `diagnostics/`: run evidence and source register.

Run from secure-access, using the already pinned installed dependencies:

```
node --disable-warning=ExperimentalWarning stage2j-fixture/test.cjs --record=unique-run-name
node --disable-warning=ExperimentalWarning stage2g-fixture/run-tests.cjs --stage2i --record=unique-regression-name
```

Evidence files cannot overwrite prior runs. Private signing/AES keys are generated
only in disposable process memory, never written to the repository. Test SQL
bootstrap uses synthetic identifiers; new DAL media callbacks are mocked. The
full unchanged Stage 2I canonical VM/independent-media suite is separately rerun.
No local server or external connection is opened. In-process network guards are
not an OS sandbox. PGlite SET SESSION AUTHORIZATION exercises catalog ACLs and
procedure session_user checks; it is NOT genuine role authentication.

## Witness coordination and limits

Source-signed evidence binds old/new checkpoint digests, environment/profile,
journal generation, current witness key revision, event ID, nonce, sequence and
row digest. A separately keyed witness verifies it before appending an immutable
reservation; it retains complete nonce/Event-ID/dispatch history. Primary intent,
witness reservation, source append, witness commit and primary commit are distinct
FULL/WAL SQLite durability boundaries. Any pending/mismatch/outage blocks new
SQL work and protected release. Exact pre-existing source evidence may finish a
pending witness/primary update; absent/conflicting evidence cannot be blindly
appended or reset. Signed challenge responses bind fresh random nonces, a short
deadline and the exact current evidence head. No old signed head is accepted as
freshness proof. The coordinator is a local model and injectable integrity gate,
not a real independent service or an atomic PostgreSQL/Google transaction.

Deleting source tail, restoring all source rows or restoring source AND primary
old snapshots is detected with the witness retained. The tests also demonstrate
that rolling back EVERY authority, including the witness, cannot be detected.
Separate files, even separately signed files, do not establish independent
administration/restore/WORM guarantees. Genuine off-host retained authority remains
BLOCKED. This limitation cannot be fixed by claiming another local file is
independent. Actual policy/key revision rotation, key recovery, secure fresh-
authority transport, HBA/TLS/authentication, independent witness backup controls
and availability policy require further review. Current model pins generation
and key revision and denies mismatches; it does not implement rotation.

## Preservation and decision

The eight Stage 2H negative assertions remain in the unchanged Stage 2I rerun.
299.99 seconds does not qualify; 300 seconds qualifies. No badge mechanism or
history recalculation exists in this candidate. Encrypted original retention and
exact signed receipts survive uncertainty; queue acceptance is never SAVED.

See RESULTS for counts, development failures, cleanup and exact limitations.
**CONDITIONAL GO for further offline/native preparation only. NO-GO for controlled
Google integration, application source changes, live recording or deployment.**
