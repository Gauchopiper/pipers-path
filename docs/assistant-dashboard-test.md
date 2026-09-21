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
