# Dummy-only controlled acceptance runbook

PROPOSED, NOT EXECUTED. CHAT 3 must first obtain Leslie's exact approvals in
PROPOSAL.md. Existing private apps and historical data remain unchanged here.

## Before first Google connection

Native suite/races and supplementary restart/restore checks must actually pass;
no skip is accepted as native evidence. Approved source/tree, genuine Google
caller/deployments/scopes and rollback baseline must be recorded. The actual Dummy
canonical ID is resolved privately from the existing record, never guessed from
name and never posted with capability links. Dummy's current Active field must be
verified; inactivity is a stop, not automatic activation. Annie remains untouched.

Configure a second deny-all synthetic/nonexistent pupil selector for negative
requests; do not browse or modify a real pupil to prove isolation. A signed-out or
previously existing ungranted Google principal may be used only with explicit
Owner test approval and receives no pupil grant. No new live test account is
created under this proposal.

The candidate permits only Owner → Dummy. Teacher candidate permits the verified
Owner actor and approved Dummy-specific operations. Limit to ten new labelled
sessions and 50 MiB added audio, in a <=45-minute exclusive window; proposed caps
need approval. Old v8 origin/pending recordings are accounted for without clearing
or rotating them. New pilot-origin recovery secret survives logout/reload, stays
off the gateway and is separate from a Google identity/access credential.

Select an existing approved target/badge privately for a new Dummy assignment/
award if available. Do not rewrite old awards. Any needed catalogue creation
requires an explicit additional approval; global catalogue mutation is otherwise
fixture-only/frozen in the first pilot. Feedback v1 stays unchanged; new beta
feedback submission is excluded. Teacher comments/reviews are included.

## Executable test register

F = fixture/native-local preparation possible before Google approval.
G = actual approved Google service and canonical evidence required.
B = approved browser/device run required. Every case is NOT RUN until evidence is
attached to the approved source and named run. Scripted fixtures cannot mark G/B passed.

| ID | Level | Steps | Required pass evidence |
|---|---|---|---|
| P00 | F/G/B | Inventory pinned v8/v2/v5/v1, Dummy-only baseline, original-origin pending status and exact caller/scopes; verify no other grants | Private source/config hashes, baseline row/file/award/target counts; rollback references; no secrets in report |
| P01 | F/G/B | Sign in with approved Owner identity, select Dummy; inspect identity scopes and server grant | Validated Google subject/audience/nonce/session; only Dummy projection; no pupil Drive/Sheets consent |
| P02 | F/G/B | Sign out; try expired/replayed/wrong-audience token, wrong CSRF/origin, ungranted principal and synthetic foreign pupil/org | Denied before data/file access; no session or pupil grant created by a link alone; no canonical writes |
| P03 | F/G/B | Read PATH and request own audio by logged Session ID, then request foreign/nonexistent session/file/organisation | Own exact bytes hash; actual current folder/ACL ownership; foreign selectors denied; no Drive URL in response |
| P04 | F/G/B | Record ~20s, pause ~10s, resume ~20s, finish; inspect local item before network confirmation | One original Session ID; sample duration excludes pause; encrypted local protection exists while pending |
| P05 | F/G/B | Enqueue P04 and hold/delay worker/response | UI remains pending, never SAVED on queue acceptance; original encrypted local bytes retained |
| P06 | F/G/B | Complete canonical save and exact receipt; target tagging by Session ID | One file/log/META, matching subject/scope/hash/length/MIME/time/samples; only exact local item becomes eligible for removal |
| P07 | F/G/B | Lose response after writer commit, reload/reconcile original Session ID | Receipt-only recovery, no second file/row; exact original bytes/hash and local protection retained until proof |
| P08 | F/G/B | Simulate STARTED/partial outcome in fixture first; controlled transport interruption only if safe/approved live | Attention/manual, no blind re-upload or invented success; no deliberate damage/deletion of real Google rows |
| P09 | F/G/B | Offline capture/finish; reload same approved origin; reconnect, re-authenticate and save | Original encrypted blob/Session ID/hash restored; one exact saved result; existing v8 origin unchanged |
| P10 | F/G/B | Stop/restart approved gateway/worker and native pilot DB while new item remains pending | Durable keys/intent/nonce/receipts and coherent revision; receipt-before-retry; retained device copy; no erased unresolved evidence |
| P11 | F/G/B | Submit same Session ID/bytes twice, including two tabs; then changed bytes or metadata under that ID | One canonical save; changed intent rejected; local audio retained on conflict; no reset/new ID to bypass |
| P12 | F/G/B | Boundary evidence at 299.9/300/300.1 seconds; compare decoded samples and canonical fields | Qualification follows actual >=300 samples rule; rounded 5.00 minutes alone never qualifies; no historical recredit |
| P13 | F/G/B | Owner teacher candidate adds a labelled comment/review for Dummy during a held DIRTY operation | PATH fails closed during change; fresh comment/review after authoritative verification; other pupils absent |
| P14 | F/G/B | Approved target assignment and permitted new Dummy badge award; reload PATH | Assignment/award shown once with current revision; no old award/target rewritten; public approved artwork only |
| P15 | F/G/B | Revoke NEW gateway Dummy grant with pending local audio and warm browser; try PATH/playback/status; then restore same approved grant | Immediate logical denial on next check; no Google/capability rotation; original local recording survives and reconciles after reauthorisation |
| P16 | F/G/B | Check actual folder mismatch/availability and old/unbound receipt handling in fixtures; readonly live checks only | Fail closed; no fake provenance assigned to historical recordings; no live file move/trash/ACL damage to construct the case |
| P17 | F/G/B | Measure cold/warm PATH, time to audio and queued save confirmation with source versions | Timestamped distribution; assess proposed warm p95 3s PATH /5s first audio; record failures, no simulated performance claim |
| P18 | F/G/B | Inject revision/inspection failure; attempt manual/uncoordinated synthetic change; test shared catalogue barrier with fixtures | Dirty remains unavailable; no stale-on-error read; explicit evidence of legacy bypass gap; no claim all old writers are coordinated |
| P19 | F/G/B | End pilot/kill switch; reopen original v8 and Teacher v2 in regular Owner browser | Original apps usable, prior history unchanged; approved new labelled Dummy records reconciled; no external grant, paid resource or lingering worker |

Browser P04/P09/P11/P15 and Google P03/P06/P13/P14 must run for real before declaring
controlled end-to-end success. Pure fixtures are suitable for destructive failure,
cross-pupil fabricated rows, missing metadata, codec/size and corruption cases;
do not damage a live canonical record to obtain a negative test.

## Independent audio evidence

Download only the authorised new Dummy audio through the protected route to an
Owner-private local location. Compare its byte SHA-256 to capture/intent/receipt.
If ffmpeg is already available on the approved machine, independently decode to
PCM and count samples, rather than trusting a WebM container duration field:

```sh
ffmpeg -v error -i pilot-recording.webm -map 0:a:0 -ac 1 -ar 48000 -f s16le pilot-recording.pcm
```

Decoded seconds = PCM bytes / 2 / 48000. Record decoder version/options and expected
codec pre-skip/padding treatment. If a new decoder install is needed, approve it
first. Do not upload audio or private links to public CI/logs/chat. `ffprobe` format
duration alone is insufficient for the earlier truncation/overstatement concern.

## Evidence and stop rules

For each case: approved source/tree, level actually exercised, timestamp, actor
role (redacted identity), original synthetic/new Dummy Session ID, expected result,
actual result, authoritative receipt/log/META/file-count evidence, independent
hash/duration when relevant, latency, local protection before/after and reviewer.
Store sensitive configuration/recordings privately; the handover contains only
redacted evidence, no access keys or OAuth credentials.

Stop immediately on identity or namespace mismatch, unexpected real-pupil data,
extra file/log row, early SAVED/local deletion, uncertain writer outcome, unexpected
out-of-band mutation, failed native gate, insufficient token lifetime, unapproved
scope/sharing/configuration, cost/cap change or lost pending-audio access. Pause
worker/new jobs, retain all encrypted blobs/receipts and obtain explicit reconciliation.
Do not auto-delete canonical pilot history or reset IDs to make a case pass.

No external-pupil release follows automatically. It needs separately approved
production authority/hosting/costs, complete legacy/manual revision integration,
real guardian/multi-child and denied-identity tests, real-device accessibility/
origin-recovery checks, production durability/key/restore evidence, full-size
playback and a reviewed rollback plan. CHAT 3 reviews first.
