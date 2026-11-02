# Stage 2G — offline execution evidence

> Historical Stage 2G checkpoint: c96a4cc. Stage 2I subsequently corrects the inactive prototypes. See ../stage2i-fixture/README.md for the current status; the historical execution evidence below is preserved.

Verified 1 November 2026. Baseline/rollback:
`44ff37abb9a733518c5882a4eabb6e5a27cb7dac`.

| Run | Registered | Passed | Failed | Skipped | Unexecuted | Temporary directories created/removed | External network attempts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Development 01 | 139 | 135 | 1 | 3 | 0 | 112 / 112 | 0 |
| Verification 02 | 143 | 140 | 0 | 3 | 0 | 116 / 116 | 0 |

These are separate runs, not 275 new unique passing cases. Final coverage is
140 passed and three explicitly skipped cases. Historical PostgreSQL 38,
Option C 80 and owner-transport 87 results (205 executions) are not included or
rerun. Preliminary smoke probes were diagnostics and are not added to totals.

| Final suite component | Passed | Skipped |
| --- | ---: | ---: |
| C: crypto/canonical writer patch structure | 26 | 0 |
| P: profiles/identity | 18 | 0 |
| S: canonical source adapter | 20 | 0 |
| J: journal | 11 | 0 |
| G: GROUP | 2 | 0 |
| D: PostgreSQL adapter | 28 | 0 |
| R: protected reads | 33 | 0 |
| U: device confirmation decision | 2 | 0 |
| N: independent native environment | 0 | 3 |
| **Total** | **140** | **3** |

Development 01 failed R18 because `deepStrictEqual` compared equivalent payloads
from separate VM realms, whose prototypes differ. Verification compares exact
canonical bytes and exact recovered audio bytes; it does not weaken the binding
checks. The failed evidence is preserved unchanged. The final revision also
adds independent wrong-request-digest and generic relay-error checks, journal
state/namespace checks, and balances transaction bookkeeping if BEGIN fails.

Environment: Node v24.22.1, Linux x64, existing pinned PGlite 0.5.13; actual engine
reports PostgreSQL 18.6 (PGlite 0.5.13), wasm32-unknown-emscripten, emcc 6.0.5,
32-bit. One SERIALISED database connection facade; no native postgres, psql or
Docker available. No installation was attempted. Existing local dependency
reused without downloading packages. SQLite uses WAL and FULL synchronous mode.
Synthetic RSA keys exist in memory only. Synthetic audio is generated locally.

Final command from repository root:

```sh
node --disable-warning=ExperimentalWarning gaita-de-boto/secure-access/stage2g-fixture/run-tests.cjs --record=verification-02
```

Exit status 0. Full named-case evidence is in
`diagnostics/verification-02.txt`; machine-readable totals are in
`verification.json`. The runner rejects overwriting an evidence filename.

Skipped explicitly:

- N01: new-adapter independent native connections and SKIP LOCKED race.
- N02: new-adapter native server crash/restart recovery.
- N03: new-adapter native authenticated login/role separation.

PGlite close/reopen, persisted nonce/receipt/read recovery, transaction rollback,
serialised logical claims and local SET ROLE denial probes passed. They do not
replace independent native races, abrupt process/server crash, fsync/power-loss,
production privileges or hosted backup/restore verification. No new native
backup/restore test was run; the historical native checkpoint remains separate.

All final 116 local directories were removed; zero remained. Both runs recorded
zero external network attempts, zero live Google recording tests and zero CI
runs. No hosting, Google resource, account, token, permission, scope, trigger,
deployment or subscription was created. No paid resource was used; expenditure
incurred by these actions: zero. The sole authorised external write after
publication is an append to the existing private handover document.

Preservation is established by the changed-file list: only this inactive
directory and one added package test script. Pupil, Teacher, Feedback, recorder,
Google settings/data, website, main and CI workflows are untouched. The real
workbooks were not read or called by the suite. Live Google version equivalence,
real lock/Drive/Sheets behaviour and other accounts' actions are not certified.
PR #6 must remain open, draft and unmerged.

Evidence SHA-256:

| File | SHA-256 |
| --- | --- |
| Protocol.gs.proposed | 06df82da49457ba9da1c59544ab06da382578b6005518288fa789f07cbf3c191 |
| canonical-writer.patch.proposed | a061d032d1873065241818dfd81b36577025219a31945c84235f762cdb4e28c0 |
| diagnostics/development-01.txt | eb24f36c1228bcdfa769f0acb4976fb33923b6e31ef141f212ec34beb8066cc0 |
| diagnostics/verification-02.txt | 286dd4bccac08aad2c15e51af237db0ba15f95b59217592b9166d4c279bde253 |

See README.md for the full file register, architecture, security limitations and
approval gates. No claim of production readiness follows from fixture results.
