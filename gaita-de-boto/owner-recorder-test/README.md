# Gaita de Boto Owner recorder test

Owner-private Sites frontend using the existing Google Owner-only Pupil bridge. Pupil keys arrive only in private URL fragments, never in source. The approved bridge route alone uses ALLOWALL and validates exact origin/source/channel/request ID; other routes retain default framing. External users are disabled.

Saving now checks getRecordingState before every first upload or retry. An already-saved receipt confirms success without another upload. Absent/retrySafe permits upload; attention blocks it and requires Owner reconciliation. Missing confirmation triggers a same-Session-ID query. Local audio remains in memory with playback/download and unload warning, but there is NO durable audio outbox or complete offline guarantee.

Pupil getPath includes only that pupil's existing TEACHER COMMENTS plus session-specific reviews. New content is rendered as text/escaped HTML, with general comments separated from recording reviews. Teacher v1 remains unchanged.

MediaDuration.gs independently counts PCM WAV samples or WebM Opus packet samples (including preskip/discard padding). Unsupported/laced formats are rejected with local audio retained. Qualification uses verified media seconds >= 300, never rounded minutes or timer text. Fractional media duration is sent without whole-second truncation. Historical rows are not recalculated. Container/packet validation is not a full server audio decoder; external release needs further codec/security review.

OwnerChecks is a default-framed, Google Owner-only test page on the SAME project. It uses the existing handler to read history/state/group, reject a wrong key, replay an existing Session ID and upload selected controlled audio fixtures. New fixtures are labelled in SESSION META, never automatically awarded badges. Its lost-response check deliberately discards a completed response and queries state; it is NOT a real network outage test.

Owner reconciliation for attention receipts: preserve/download local audio; stop retries; inspect receipt, Drive folder by Session ID, practice log and metadata. If a log exists, getRecordingState can ensure matching metadata. If only a file/intent exists, do not create a second file: an Owner must explicitly reconcile it. No live records are deliberately corrupted to test this.

Checks: node verify.cjs and node reliability.test.cjs. Fault/security/client tests are isolated simulations; live results belong in the existing Google implementation handover. Roll back Pupil to v3 and Site to prior version if needed. Teacher v1, Feedback v1, existing original recording/review/comment/feedback and all other organisations are preserved.
