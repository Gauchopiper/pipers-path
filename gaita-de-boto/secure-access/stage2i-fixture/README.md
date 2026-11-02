# Stage 2I — offline security corrections

**IMPLEMENTED OFFLINE / VERIFIED OFFLINE. No live integration.**
Baseline and rollback: `c96a4ccaef34dbc55fea2fbe44042bcc1f49ec62`;
earlier rollback: `44ff37abb9a733518c5882a4eabb6e5a27cb7dac`.
The working Pupil, MediaDuration, Teacher, Feedback, recorder, site and workflows
are unchanged. Runtime edits are confined to inactive fixture modules.

Final verification: **533 registered; 525 executed/passed; 0 failed; 1 skipped;
7 blocked/unexecuted.** All eight Stage 2H negative assertions pass. See
[RESULTS.md](RESULTS.md) and the complete atomic per-case result file
`../stage2g-fixture/diagnostics/stage2i-final-05.txt.json`.

## Corrections and limits

| Finding | Correction | Classification |
| --- | --- | --- |
| F01 | Signed primary checkpoint and separate witness model bind environment/profile, generation, sequence/head, policy/key revisions, reservations, nonce/Event-ID history and dispatches. Rollback of source plus primary is denied while the witness is retained. | IMPLEMENTED / VERIFIED OFFLINE under the retained-witness assumption. Actual independent/WORM/off-host trust boundary BLOCKED. |
| F02 | Current typed permit, signature, admission, policy/profile, manifest/SID, lease and registered fence/worker authority rechecked inside the original lock before intent or recording effects. | IMPLEMENTED / VERIFIED OFFLINE. Real fresh-admission transport remains PROPOSED. |
| F03 | Duplicate Event IDs, nonces, sequences and invalid purpose/state/operation transitions are denied; fixed generation is server-controlled. | IMPLEMENTED / VERIFIED OFFLINE. |
| F04 | Device decision binds full local manifest and identity, bytes, current admission/revision, gateway session and independently source-signed redacted confirmation. | IMPLEMENTED / VERIFIED OFFLINE; disconnected from recorder/IndexedDB. |
| F05 | Retire unsafe role proposal; provide dedicated-DB role matrix, NOLOGIN owner, separate login identities, narrow lock helpers and procedure-only permission surface. No broad policy UPDATE. | PROPOSED. SQL bodies/DAL port and native logins/ACLs remain BLOCKED/unverified. |
| F06 | Reject accessors/decorated objects before reading values; bound canonical depth/nodes/bytes. | IMPLEMENTED / VERIFIED OFFLINE for the parsed JSON/signing boundary; arbitrary executable Proxies are not an input format. |
| F07 | Proposed WAV parser checks RIFF/chunk boundaries, encoding/channels/rate/bits/alignment/byte-rate/data/fact consistency and supported layouts. Operational MediaDuration is untouched. | PROPOSED SOURCE PATCH / VERIFIED OFFLINE in the canonical VM and against Python/FFmpeg. |
| F08 | Encoded signature/key limits precede decoding; byte/JSON and journal event/verification limits fail closed. | IMPLEMENTED / VERIFIED OFFLINE. Google memory/quota behaviour unverified. |
| F09 | Exact permit keys and safe finite numeric types, positive fence, bounded lease, operation/SID/worker/manifest and fresh admission checks. Numeric strings fail. | IMPLEMENTED / VERIFIED OFFLINE. |
| F10 | Proposed canonical after/flush/readback hooks persist exact receipt/outbox/readiness within the existing lock, with final flush before unlock. Boundary faults remain pending until exact reconciliation. | VERIFIED OFFLINE MODEL / PROPOSED Google source and persistence implementation. |

## Run

Node 24, Python 3 standard `wave`, installed OpenSSL CLI and FFmpeg/libopus are
required for the new independent probes. Use the existing pinned PGlite 0.5.13
development dependency. No new package was installed during this work.

From `gaita-de-boto/secure-access`:

```sh
npm run test:stage2i -- --record=another-unique-run
```

Evidence names cannot overwrite prior runs. The runner retains a streaming
capture, then atomically writes the complete per-case JSON and final transcript
after closing all engines and verifying cleanup. It cross-checks every registered
case/result/count. In-process HTTP/HTTPS/net/TLS/fetch/WebSocket guards reject
network/listener attempts; this is not an OS sandbox. Child commands have fixed
offline inputs: OpenSSL, Python wave and FFmpeg synthetic silence/decoding.

The 143 Stage 2G cases and 300 Stage 2H cases are rerun as authorised regressions;
90 Stage 2I registrations add new cases. The two suites each register N01/N02/N03,
so seven blocked registrations represent **three native gates twice plus one
real witness-boundary gate**, not seven different native failures. The single
skip remains Wycheproof tcId 7 (non-UTF8 binary message outside this protocol).

## One canonical writer and operational preservation

`writer-proposal.cjs` transforms repository Code.gs in memory; the reviewable
`../stage2g-fixture/canonical-writer.patch.proposed` is generated from that exact
transformation. `media-proposal.cjs` transforms only the WAV branch in memory;
`media-validation.patch.proposed` is the matching unified diff. Both patches pass
`git apply --check`; neither was applied to application files or uploaded.
The complete original WebM branch remains byte-identical. A real synthetic
FFmpeg WebM/Opus sample matches both old/new parser output and decoded PCM samples.

The legacy `gdbPUpload_` wrapper retains its bindings, original Session IDs,
one createFile mutation path and original ScriptLock. The shared core's four
trusted hooks (`gdbGTrusted_`, `gdbGBefore_`, `gdbGAfter_`, `gdbGReadback_`) exist
ONLY as VM capabilities. A real implementation must remain private, derive
fixed resources from trusted server configuration, authenticate the execution
identity and current Owner admission, and never trust client JSON as authority.
Do not copy the writer into another project, add an outer lock, apply a patch
alone or expose a privileged doPost/google.script.run route.

Valid integer PCM 8/16/24/32-bit and declared float 32/64-bit layouts are admitted
only with consistent fields; unsupported formats/extensible layouts fail closed.
Odd chunk padding, duplicate fmt/data, truncation, trailing bytes and contradictory
fact metadata are checked. Python independently verifies tested PCM durations;
no independent float decoder certification is claimed. At 299.99 seconds the
display can round to five minutes but qualification remains false; exactly 300
seconds qualifies. No history, qualification or badge is recalculated.

## Checkpoint, witness and fail-closed recovery

Source journal, primary checkpoint and witness use separate disposable SQLite
files/directories. Source events use the source key; checkpoint state uses a
separate synthetic service key. The checkpoint independently verifies source
event signatures using Node/OpenSSL. Event payloads bind generation while the
approved **16 journal columns remain unchanged**.

For an append: verify the full bounded chain and both authority heads; reserve
the exact next signed event/nonce/digest in witness then primary; append the source
row; finalise witness then primary. These are distinct durability boundaries,
not one transaction. A lost/torn step blocks all new writes and protected release.
An exact existing row can finish its pending reservation; an absent/conflicting
row remains attention. There is no automatic rollback, nonce reset, reservation
cancellation, journal reinitialisation or blind re-upload.

Valid-tail removal, whole-source restoration and restoration of BOTH source and
primary are detected when the witness remains current. Tests also explicitly
show that restoring every local authority to the same old state is undetectable.
Separate files on this host do **not** establish independent administration or
anti-rollback storage. The real trust boundary remains BLOCKED: it needs a
separately approved retained signed checkpoint/append-only authority, access
control, key custody, outage policy and backup/restore review. Source-only
signatures or a checkpoint in the same restoration domain are insufficient.

The source journal has at most 512 events, 16 KiB payloads and bounded scan work.
Exhaustion denies work; it does not evict nonce history or create a new generation.
Approved archival/checkpoint paging and generation/key rotation must retain
all prior replay evidence. Test-only snapshot/restore handles are fault-injection
capabilities, not proposed production endpoints.

## Exact persistence order

1. Validate original identity/media/permit before entering the existing writer.
2. Acquire the existing ScriptLock; do not acquire another recording lock.
3. Freshly check typed permit/signature/lease, current admission, policy,
   profile/SID/manifest and registered dispatch/fencing authority.
4. Verify primary/witness/generation and the bounded source chain.
5. Durably reserve, append and verify the original signed journal intent.
6. Use the existing STARTED/flush and sole recording-file creation path.
7. Append canonical LOG.
8. Append canonical META.
9. Flush and inspect exact original file/media, LOG/META and qualification.
10. Persist the private exact receipt and a separately source-signed redacted
    device proof; no raw Google file URL is added to the client proof.
11. Persist the recording outbox under the same operation.
12. Flush/read back exact evidence, persist signed READBACK readiness and verify
    checkpoint consistency; final flush before leaving the lock.
13. Release the original lock in finally. Callback/reconciliation happens only
    after the database transaction boundary; no transaction spans Google calls.

The VM flush/readback fault model cannot prove real Sheets buffering, Drive
durability, RPC or quota semantics. A real journal/callback/ack port is still
PROPOSED. Generic ACK states persist, but no real transport or trigger is created.
Interrupted operations stay SAFE ON DEVICE — awaiting confirmation. Exact
read-only reconciliation may finish a complete original's journal/outbox under
the same project lock; it never repairs LOG/META or creates another recording.

## Device confirmation and protected reads

The protected original contains binding, audio, original manifest and identity:
organisation/environment/pupil/original actor/profile digest/SID/manifest digest.
The gateway's authenticated session response binds current admission/revision.
The device additionally verifies the source's asymmetric device receipt against
that exact original and media. Matching bytes alone, another pupil/organisation,
changed manifest, stale/revoked admission, gateway-forged source proof or altered
audio cannot permit confirmation. The helper is not connected to recorder v8
and never deletes IndexedDB/audio or rotates capabilities.

Queue originals remain AES-256-GCM staged and retained while uncertain; completion
is source-receipt-only and idempotent. Protected reads verify journal integrity,
current admission and revision before retrieval/staging/release. The relay sees
only one-use opaque handles/acks and generic errors. Existing PATH totals and
distinct-pupil GROUP semantics are preserved. Teacher/Feedback/manual writer
coordination and browser/identity/CSRF/session wiring remain unverified.

## Permissions, costs and next gate

See [PERMISSIONS.md](PERMISSIONS.md) and `permissions.sql.proposed` for the exact
role/procedure/key matrix. The old broad-table proposal is retired. SQL objects
and procedure bodies are NOT installed/verified; explicit fail-closed stubs and
a deployment interlock prevent treating the design as a runtime migration.
The current direct-SQL fixture adapter is not a production permissions solution.

No native PostgreSQL, installation, hosted service, CI run, Google resource,
credential, scope, trigger, deployment, pupil activation or expenditure occurred.
Actual native N01/N02/N03, SQL/DAL port/ACL validation, independent witness trust,
real Google/source/crypto verification, secure hosting/key management and browser
recovery require new specific approval.

**CONDITIONAL GO for the next offline review/native-preparation stage only.**
**NO-GO for live Google integration, recording tests or deployment.** CHAT 3 must
review the exact checkpoint and obtain Leslie's next authorisation first.
