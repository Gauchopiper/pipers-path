# EMGT recording reliability — staged work, 27 October 2026

**Not deployed. Do not release until the live backend and actual browsers have
passed the remaining checks below.** All changed application files are inside
`emgt-tsop/`. Other organisations and shared assets are unchanged.

## Baseline and confirmed defects

The public EMGT frontend was retrieved and was byte-identical to main commit
`1d629da699657f38b39d3f83157f50238276d995` (SHA-256
`a57c3782d492fedb5badb6699b3b5bd71dca0663a6d528596e4c3a3de1864ea9`).
Retain this version for frontend rollback. Current Apps Script source and its
deployed version must be separately exported before any backend write.

The original frontend computes duration after asynchronous base64 conversion,
using wall time rather than captured audio. Its microphone-start, stop, upload
and target operations reuse mutable global recording context. It permits a new
start while earlier permission or finalization/upload work is still pending.
Unexpected MediaRecorder stops do not reset its recording flag or timer. Audio
is held only in memory until STOP, and ambiguous uploads have no persistent
recovery copy. These are confirmed source defects; their contribution to each
historical failure has not been established.

Independent private-file checks confirmed both short audio content and extreme
timestamp jumps. Remuxing those files preserved every encoded packet and
produced byte-identical decoded PCM. Timestamp repair cannot restore sound
which was never captured or saved. The exact OS/browser cause of the missing
historical sound remains unconfirmed. No pupil files or identifiers are included
in this public source tree.

## Staged changes

- One state machine per take, guarded permission/start/stop transitions, immutable
  Session ID/target, monotonic elapsed timer, and cleanup after final data events.
- Five-second MediaRecorder chunk requests and a separate IndexedDB chunk
  journal. A hidden page or muted/ended track stops and flushes the capture;
  optional screen wake lock reduces screen-sleep interruptions. This deliberately
  does not promise background or locked-screen recording.
- Audio-only WebM/Opus packet inspection and lossless timestamp normalization.
  Content duration accounts for Opus codec delay and discard padding. Seek/Cue
  indexes are rebuilt by omission; output has finite segment and cluster sizes
  and explicit duration metadata. Unsupported/laced/malformed structures fail
  closed with a retained original and download option.
- A device outbox scoped to endpoint + pupil + capability hash. Credentials are
  not persisted. Completed verified audio is protected before sending. The
  adapter sends measured content duration, not elapsed or conversion time.
- Ambiguous saves reconcile the exact Session ID. A missing entry in recent
  history never authorizes another upload. Only the existing versioned recovery
  protocol's explicit safe-absence response can permit re-upload. A legacy
  backend therefore leaves an ambiguous item queued for owner attention.
- Target confirmation remains separate and can retry without resending audio.
  An interrupted raw journal can be downloaded after reopening. This is
  export-only recovery: it cannot insert a second truncated session while a
  recording is still active in another tab.

The queue and transport originate from the earlier undeployed local-outbox
branch, copied into EMGT so this change does not affect other organisations.
The shared service worker is not registered or changed.

## Validation completed

Run from the repository root (Node and FFmpeg/FFprobe required):

```sh
node emgt-tsop/tests/audio-integrity.cjs
node emgt-tsop/tests/recorder-lifecycle.cjs
node emgt-tsop/tests/outbox-reliability.cjs
```

Audio validation generated 30, 60, 299, 300, 480 and 900-second Opus recordings.
All six measured correctly. Every encoded packet hash and independently decoded
PCM hash matched before and after remux. The client-side content comparison
rejects 299 seconds and accepts 300 seconds; this is not proof of the live
backend's qualification calculation. Two private historical files also passed
packet and PCM equality checks; their source and repaired copies remain outside
this repository and were not written back to Drive.

Recorder lifecycle simulations cover all six lengths, final-chunk inclusion,
overlapping permission/start/stop attempts, unexpected stop, muted track,
storage failure and preserving original sound on unsupported format.
Queue fault-injection tests cover offline/reconnection, unreadable response,
ambiguous outcome across queue recreation and manual retry, target-only retry,
two simulated tabs and scope separation. Queue storage in these tests is an
in-memory model: real IndexedDB durability, browser restart and concurrent-tab
behaviour still require browser validation.

## Remaining release blockers

1. Obtain authenticated access to the current EMGT pupil Apps Script source.
   Inspect its upload writer, filename identity, timing validation, size limits,
   all Session-ID writers and five-minute qualification rule. Preserve current
   version/deployment settings. Do not substitute an older test backend.
2. Integrate/verify server-side idempotency and exact-session reconciliation in
   an isolated EMGT test deployment. Backend validation must allow captured
   duration shorter than wall duration, and fractional-second values. Verify
   qualification from unrounded duration before storing rounded minutes.
3. Complete MP4/Safari verification. This staged version deliberately retains
   MP4 recordings locally for download instead of uploading an unverified
   duration. It is not ready for general pupil deployment.
4. Exercise actual microphone capture at all six lengths, start/end audible
   markers, end-to-end Drive/database/readback, response loss after server save,
   offline before and during STOP, refresh/reopen, quota failure, Android/iOS
   app switching/screen lock and browser process termination. Independently
   decode the downloaded Google files. No live pupil or qualification tests
   have been performed in this work.
5. Recheck organisation privacy with the live backend and alternate credentials.
   Client queue scope separation is not a security boundary against code on
   the shared GitHub Pages origin.

After these pass, deploy the compatible backend first and the reviewed EMGT
frontend second, with documented rollback versions. Historical reconciliation
is separate: preserve originals and obtain an explicit review of any changes
to totals, qualifications, badges or pupil associations.

## Technical references

- MediaStream Recording specification: https://www.w3.org/TR/mediastream-recording/
- Opus packet framing and duration: https://datatracker.ietf.org/doc/html/rfc6716

Browser timers, timeslices and event timestamps are diagnostic clocks, not
evidence of how much sound was captured. Browser/OS termination can lose the
last not-yet-delivered chunk, and browser storage may be cleared or evicted.
