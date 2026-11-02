# Native PostgreSQL procedure — prepared, not executed

This environment's native blocker is already known. No root/non-root installation
was retried. The commands below are for a separately approved machine or CI job.
They use only synthetic fixtures; no Google account, real pupil or Owner secret.

## Environment decision

| Option | Requirements / procedure | Expected incremental cost | Permission and cleanup |
|---|---|---|---|
| Recommended: standard GitHub-hosted Ubuntu job in this PUBLIC repo | Owner approves separate manual CI-only default-branch workflow; choose exact staging SHA; Node 24, Docker and official PostgreSQL 18 container; run launcher | Standard public-repo compute currently free; no artifacts/cache/larger runner proposed | CI-only default-branch change + one <=15-minute dispatch approval; EXIT cleanup removes only unique fixture container/volume; runner disposal is final boundary |
| Local isolated Docker | Approved Docker Engine/Desktop, Node 24 and Linux/WSL2 Bash; free loopback port 55432; same launcher | Existing hardware/power/downloads; no cloud resources; Desktop personal/noncommercial eligibility must be confirmed | Owner approves installation/daemon/WSL use if absent; same unique labelled container/volume cleanup |
| Local native non-root PostgreSQL | Approved user-owned disposable PostgreSQL 18 cluster; Node 24 and psql/pg_dump/pg_restore; loopback-only fresh gdb_*_fixture DB | Existing hardware; PostgreSQL software has no licence fee; OS/admin setup may be needed | Database/cluster owner approval; stop only own cluster and remove only its temporary data directory after collecting evidence; never operate a production service |

Visibility was verified through the connected GitHub repository metadata. Current
pricing and workflow rules were read from official GitHub documentation:
https://docs.github.com/en/billing/concepts/product-billing/github-actions
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
Docker personal-use eligibility:
https://docs.docker.com/subscription/desktop-license/

## CI-specific setup (not installed or dispatched)

`native-ci.yml.proposed` sits OUTSIDE `.github/workflows`; it is inert. After Owner
approval, add it in a separate CI-only reviewed change on the default branch.
GitHub requires this for workflow_dispatch. Do not merge PR #6. Do not reuse
`apps-script-test.yml`: that workflow has a Google environment and calls clasp push.

The proposed job has only contents:read, a standard `ubuntu-24.04` runner and a
15-minute timeout. No Google environment, OIDC cloud credential, secret, artifact
upload, dependency cache or public inbound database. Checkout/setup-node actions
are pinned to the official v6 tag digests resolved 30 October 2026. The job validates
the approved full SHA and its Gaita staging ancestry before running code.

After the separate approval and installation, dispatch manually with the exact
approved `source_sha` and the confirmation `DISPOSABLE_FIXTURES_ONLY`. A runtime
flag is an accident-prevention guard, not a substitute for Owner approval.

## Executable local/container path

On the approved checkout/machine, install only the locked existing dependencies:

```sh
cd gaita-de-boto/secure-access
npm ci --ignore-scripts
export GDB_NATIVE_APPROVED=DISPOSABLE_FIXTURES_ONLY
bash pilot-preparation/native-run.sh
```

The launcher pulls official `postgres:18`, creates a unique labelled data volume
and container, publishes PostgreSQL only on `127.0.0.1:55432`, waits for readiness,
and sets a deliberately non-secret fixture-only database password. The PostgreSQL
18 volume target is `/var/lib/postgresql` per the official container documentation:
https://github.com/docker-library/docs/blob/master/postgres/README.md
It never accepts an arbitrary production URL or arbitrary container name.

To repeat the same image build, set `GDB_POSTGRES_IMAGE` to the recorded official
`postgres@sha256:...` RepoDigest before launching. The driver records native server
version, Node version, Docker image ID and RepoDigests; do not invent a patch/digest.

The first command inside the launcher runs the existing native queue suite:

```sh
node queue-fixture/postgres.test.cjs
```

With the documented native URL this executes the previously skipped three
independent-connection races, plus its existing queue-contract cases. Require its
output to identify native local PostgreSQL and contain NO native skip. At this
checkpoint the expected suite count is 32 checks; that is a plan expectation,
not an executed result here. It covers acceptance/nonce races, fences/expired leases,
stale acknowledgements, retry/crash models, failure rollback and exact original IDs.
Google writer behaviour in that suite remains simulated even with a native DB.

The supplementary driver then performs six additional native checks:

1. Hold two pool clients and assert distinct pg_backend_pid values.
2. Hold a candidate row lock in an explicit transaction. Another connection's
   SKIP LOCKED claim must take the other job; after release it can take the first.
3. Terminate ONLY the selected fixture backend with an uncommitted update/nonce.
   Assert rollback/lock release and absence of the uncommitted nonce.
4. Create an opposing two-row lock cycle with bounded statement/deadlock timeouts.
   Require exactly one PostgreSQL 40P01 victim, rollback and successful peer outcome.
5. Seed saved and pending synthetic queue records. Restart ONLY the owned labelled
   PostgreSQL container; compare state fingerprint and reject a consumed nonce;
   preserve saved receipt, original Session IDs and encrypted pending staging.
6. Write a real custom-format native pg_dump archive to a private temporary file.
   Restore it into a SECOND newly created `gdb_work4_restore_fixture`, compare queue/
   nonce/staging fingerprints, then drop only that created restore DB and remove archive.

Expected supplementary count is six, unexecuted here. A true runtime failure must
fail the job. Do not reinterpret an unsupported privilege/tool/version as a pass.
The native test uses fixture-superuser rights only in the owned disposable cluster;
it does not establish a production least-privilege application's rights.

## Local non-root native alternative

Create/start a fresh USER-OWNED cluster under a new temporary directory and bind
only loopback. Create a fresh `gdb_*_fixture` database. Locally set
`GDB_FIXTURE_NATIVE_URL` to that database without posting credentials to Chat. Run
the existing `queue-fixture/postgres.test.cjs`; its URL guard enforces loopback and
the fixture naming pattern. The supplementary driver above deliberately requires
the labelled Docker setup and must not be pointed at an arbitrary host server.

For a non-Docker run, execute the same held-lock/pg_backend_pid/termination/deadlock
SQL protocol manually in that owned cluster; stop/restart with its own pg_ctl;
pg_dump to a private file; restore into a second empty fixture DB; compare original
ID/state/nonce/receipt/staging fingerprints. Capture actual commands/output. This
is a documented alternative, not an equivalently automated result in this package.

## Evidence to return

Record source SHA/tree, workflow run URL (if CI), actual native PostgreSQL/Node/image
versions, explicit distinct backend IDs/lock barrier, passed/failed/skipped counts,
restart and archive/restore fingerprints, archive byte count/hash, cleanup outcome
and limitations. Keep the two suite counts separate; never add historical 93
fixture checks as though rerun. SQL/native evidence does not certify Google,
real media, original-identity manifest persistence or browser recovery.

The dump is synthetic and is removed; do not upload it as a public artifact.
Use normal run logs and the JSON summary; collect through the connected GitHub
job-log interface after the separately authorised job finishes. Public logs contain
only synthetic identifiers, never real pupil IDs, private URLs or Google tokens.
Native backup evidence covers the queue fixture tables. A later real restore still
needs canonical reconciliation and generation rotation before serving traffic.

The launcher EXIT trap removes its own uniquely created container and volume on
success or failure. Verify no gdb-native-* resource from that run remains. Do not
run broad Docker prune, remove unrelated volumes or stop a host database service.

## Validation performed in this Work session

Only `node --check native-audit.cjs`, `bash -n native-run.sh`, prepared-case listing
and five no-resource preflight checks were run. List/deny tests use an environment
without native tools and stop before Docker/DB calls. No native test, container,
CI job, restart or backup/restore was performed. Earlier native blocker unchanged.
