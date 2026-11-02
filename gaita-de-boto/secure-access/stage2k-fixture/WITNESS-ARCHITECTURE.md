# Independent witness architecture — PROPOSED, not deployed

## Required trust boundary

The canonical Google source, queue database/backups and witness must not share
one restore authority. A separate administrator/account must control retained
witness evidence, its signing key and restore approvals. The client’s accepted
key epoch/head must also survive a database restore. Local SQLite files, separate
local processes or different schemas on one host do not establish this boundary.
A correctly signed fresh response from a witness that was itself restored can
still attest an obsolete state; a nonce challenge alone cannot prevent that.

Candidate arrangement: independently administered witness service with monotonic
CAS reservations; an immutable retained event archive in a separate account;
independent client high-water epoch/head pins; separate source, witness, admission
and offline emergency-recovery key custody. Only synthetic digests, namespace,
generation, operation/nonce commitments and public keys belong in the archive,
not audio, capability links, pupil names or private signing/encryption keys.
Witness private keys must not be available to gateway, worker or backup roles.

A possible storage control is versioned object storage with compliance-mode
retention. AWS S3 Object Lock is one example, not a selected provider or created
account. Compliance retention protects versions against overwrite/deletion while
retained, including by account root. Versioning, listing/rebuilding the complete
append-only event index, retained client pins and fail-closed startup are still
necessary. Retention alone is not an authenticated latest-head service. A service
must not sign a cached/older pointer just because it can read that version.
Account closure, expiry of all retention, compromised signing/administrative
principals and loss of every independently retained pin remain threat boundaries.

## Protocol and recovery

1. Verify source signature, fixed namespace/profile/generation, current admission,
   key policy and previous authoritative head before reserving the next event.
2. CAS and durably retain the exact next sequence/Event-ID/nonce/row digest. No
   reservation cancellation, history pruning or consumed-nonce reset on uncertainty.
3. Append exact source evidence; finalise witness then primary checkpoint. Local
   pending state or mismatched freshness blocks writes and protected release.
4. Fresh responses bind a random challenge, short deadline, latest retained head,
   policy revision and current signing epoch. Client checks every field.
5. Lost acknowledgement: inspect existing source evidence read-only. Reconcile
   only the exact pre-existing signed row/reservation; never upload again blindly.
6. Restore into a NEW disabled environment. Rebuild/verify retained witness chain,
   compare client high-water pins and all source/primary histories, reconcile exact
   pending reservations and require Owner review before re-enabling admission.
7. Witness outage, invalid signature, stale sequence, missing archive versions or
   unknown epoch: stop. Preserve encrypted originals/evidence. No cached fallback.

The new `key-ledger.cjs` tests a dual old/new-key signed transition, monotonic
retained client pins, fresh Owner policy, pending-reservation denial, expiry,
revocation, lost-pin ACK recovery and successive rotations. Its retained-pin
capability is an OFFLINE mock, not an independent service. The module is a
separate authority-rotation prototype; it is not wired into the Stage 2J source
writer, witness service, SQL adapter or real transport. These ports are still
PROPOSED. Retired public keys must remain available for historical verification;
a revoked authority cannot revive itself or reset generation. Emergency recovery
following compromise requires separately approved offline authority and a
retained-head-verified generation transition, not an automatic restart.

## Backup, retention and custody

Keep every consumed nonce/Event-ID/dispatch commitment and key transition for at
least every supported backup restoration horizon plus a reviewed margin. Do not
silently expire replay protection while an old backup can still be restored.
Keep signed exports/client pins under separate custody and test restoration.
Retention/deletion/key recovery policy and administrator separation need review
before procurement. No real key, account, immutable bucket or service was created.

## Costs — illustration only, 2 November 2026

Expenditure this stage: zero. No provider selected or quote accepted.
AWS's published customer-managed KMS key charge is US$1 per key/month, including
asymmetric keys; retaining two separately managed witness keys would illustrate
US$2/month of key charges alone. Signature/API requests, immutable storage,
witness compute, monitoring, backups, taxes and region/currency charges are extra.
This is NOT an all-in hosting estimate; do not reuse it as a spending approval.
An existing independently administered service might avoid new compute charges,
but the administrative/retention boundary must still be demonstrated. Any external
account, paid hosting or service requires separate Owner approval.

Primary references checked:
https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
https://aws.amazon.com/s3/features/object-lock/
https://aws.amazon.com/kms/pricing/
https://www.postgresql.org/docs/18/app-initdb.html

## Result

VERIFIED OFFLINE: protocol rejection/recovery under an independently retained-pin
assumption. BLOCKED: genuine off-host durability, independent administration/key
custody, immutable retention, trusted current-head discovery and deployment.
The tests explicitly demonstrate that a consistent rollback of ALL authorities
including every retained pin is undetectable. No general anti-rollback guarantee
is claimed. NO-GO for Google integration remains.
