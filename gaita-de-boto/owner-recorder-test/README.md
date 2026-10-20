# Gaita de Boto Owner recorder test

Private Sites frontend derived from the staged Gaita PupilTest interface. No pupil key, workbook ID or folder ID is bundled. The personal capability arrives only in the fragment of the private link. Google Owner authentication is independent of Sites access.

The proposed `bridge/` files are NOT yet installed or deployed to Apps Script. They add a bridge-only HtmlService route on the existing pupil deployment, protected by actual active/effective Google identity equality, an exact server-configured frontend origin, per-page channel nonce and message-source validation. The original recording handler remains the sole audio writer.

Approval is needed before deploying the bridge route because Apps Script only offers ALLOWALL for external framing, replacing the default frame protection for that route. The bridge returns no pupil records until a validated request. Other test/dashboard routes retain default framing. Google app access remains Only myself. The property `GDB_TEST_FRONTEND_ORIGIN` must equal the exact private Site origin. No wildcard or browser-supplied email is trusted.

Cross-site cookie restrictions may still prevent Google authentication inside the frame. This transport is prepared, not live-verified. Do not ask Leslie to record until a live authenticated getPath response is verified from the deployed standalone origin. If framing/authentication is blocked, stop and document the specific failure rather than making endpoints public.

Keep Teacher v1, Pupil v2 and Feedback v1 as rollback baselines. No general release, external teacher access, historical badge rewrites or other-organisation changes. Audio retained for playback/local download until explicit server confirmation; no offline reliability claim.

Checks: `node verify.cjs` performs syntax and isolated message-boundary checks, not a real recording or authentication test.
