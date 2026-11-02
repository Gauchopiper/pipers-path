# Stage 2K — native harness and witness-rotation results

Accepted parent: `85650b7fc23a25b9a13189bf5f1ef00156c00e80`.
This stage is **partially blocked**. No PostgreSQL server was installed or run;
N01/N02/N03 remain BLOCKED. The root-only namespace prevents safe non-root native
execution. No root-check bypass, system service, external account or Google call.

- `native.cjs`: dormant native harness, syntax/safety reviewed, NOT native-tested.
  It registers 135 native cases and refuses root before any process creation.
  On an approved suitable non-root Linux runtime, set `GDB_STAGE2K_PG_BIN` to an
  explicitly verified directory containing postgres, initdb, pg_ctl, pg_dump and
  pg_restore. Run only in a disposable isolated environment. It creates its own
  marked data directory, private Unix socket, random ephemeral SCRAM credentials,
  real separate login pools and no TCP listener. Crash control verifies exact
  process command, owner, marker and PGDATA before immediate stop. It must not
  be pointed at an existing database or used on Leslie's Windows computer.
- `key-ledger.cjs`: inactive authority-rotation prototype with dual signatures,
  retained high-water pins, fresh admission, revocation and fail-closed recovery.
- `test.cjs`: offline crypto/rollback/recovery and harness-safety assertions.
- `environment.json`, `diagnostics/installation-attempt.txt`: precise native blocker.
- `WITNESS-ARCHITECTURE.md`: proposed independent administration/retention boundary,
  key custody, backup/recovery and illustrative cost components.
- `RESULTS.md`, `register.json`, `diagnostics/`: complete evidence and source index.

From secure-access with the already installed pinned dependencies:

```
node --disable-warning=ExperimentalWarning stage2k-fixture/test.cjs --record=unique-offline-name
node --disable-warning=ExperimentalWarning stage2k-fixture/native.cjs --record=unique-native-name
```

Native root-gate output is BLOCKED, never simulated success. Code below the native
runtime gate has not executed here. A future actual environment must exercise all
of it and may expose defects; syntax and static safety tests do not certify it.
The new native media-validation callback is mocked; independent canonical media
validation is separately covered by the unchanged Stage 2I regression. Full
canonical-to-SQL receipt bridging and playback remain outstanding.

The offline pin lives in process memory outside the ledger test DB to simulate
separate custody. This is NOT a genuine off-host retained authority. Rotation is
a separate module, not wired to Google or Stage 2J's source/witness/SQL components.
Witness outage/rollback/current-key failures deny data. Restoring every authority
and pin together remains demonstrably undetectable.

All operational applications, old fixture implementations and tests are unchanged.
No recording, total, badge, history, inactive Dummy, Google permission, deployment,
trigger, workflow, local audio or other organisation was modified. No dependency
was installed or expenditure initiated. See RESULTS for counts and limitations.

**NO-GO for controlled Google integration.** Next requirement is a suitable
non-root disposable native runtime and review of the independent witness boundary.
No external account/service, installation outside scratch, CI or live test starts
automatically.
