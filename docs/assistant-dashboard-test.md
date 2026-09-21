# Sanitised Assistant dashboard workbook (TEST only)

This TEST architecture keeps the existing web app running as the visiting
teacher. The private `Piper’s Path — TEST Data` workbook remains canonical.
Assistants receive Reader access only to `Piper’s Path — ASSISTANT DASHBOARD
TEST` and, separately when required, the TEST recordings folder.

## Assistant workbook schema

- `DASHBOARD CONFIG`: `Key | Value`
- `DASHBOARD TEACHERS`: `Teacher ID | Email Token | Role | Active`
- `DASHBOARD PUPILS`: `Pupil ID | Display Name | Active`
- `DASHBOARD PRACTICE SUMMARY`: `Pupil ID | Session Count | Total Minutes |
  Last Practice Date`

Teacher email tokens are deterministic HMAC-SHA-256 values produced with a
secret stored only in Script Properties. Raw teacher emails and all pupil
credentials, links, feedback details, recording URLs, session IDs and detailed
timestamps remain in the private workbook.

## Owner setup

After the TEST source has been uploaded, run `setupAssistantDashboardTest` once
from the Apps Script editor as the TEST project owner. This creates the separate
workbook, performs the first sanitised sync, applies direct Reader sharing for
active teachers, and installs an Owner edit trigger plus a daily reconciliation
trigger.

The setup logs the new TEST workbook URL. It does not deploy a new web-app
version. Preserve the current deployment before selecting a new TEST version.

## Synchronisation and revocation

`syncAssistantDashboardData` is the Owner entry point. Recording writes call the
locked synchronisation core explicitly. Owner edits to `TEACHERS`, `PUPILS`,
`PRACTICE LOG` or `ORG CONFIG` also trigger a sync, and the daily trigger is a
recovery path.

Inactive teachers are excluded from the token roster and have direct Reader
access removed from both the Assistant workbook and TEST recordings folder.
The TEST root folder must not be broadly shared.

## Rollback

Re-select the previous TEST web-app version and revoke Reader access to the
Assistant workbook. The private canonical workbook is not migrated or altered
by the sanitised workbook setup, so it remains the rollback source of truth.

## Passed TEST milestone

The sanitised Assistant dashboard design has passed the following live TEST
checks:

- An Assistant dashboard loads from the sanitised workbook after the Assistant's
  direct Reader access to the private canonical workbook has been removed.
- An Assistant cannot directly open the private workbook and receives neither
  the Owner-only organisation-data control nor its private-workbook link in the
  dashboard HTML.
- The Owner retains access to private organisation data through the visible
  Owner-only control.
- The visible role labels are `OWNER` and `ASSISTANT TEACHER`.
- Assistant teacher feedback was verified to save in both the local TEST record
  and the central feedback record.
- Pupil Record, Path and Group mobile checks had already passed in TEST.

An earlier isolated experiment found that an external Gmail account received a
blank value from `Session.getActiveUser().getEmail()` when the web app executed
as the deploying Owner. The tested design therefore remains visitor-executed,
with authorisation and dashboard data read from the sanitised workbook.

This milestone is TEST-only. Production has not been altered.
