# Shared Core review request: Piper's Path local outbox

Status: **raised for review; not a new shared standard**.

Piper's Path's implementation branch adds IndexedDB protection for practice audio and submitted feedback, using the existing local Session ID and random operation IDs. These are delivery/session references within an installation, not shared Person, Organisation, Tune or Tune-Version IDs. No migration or real cross-app identity reference is introduced.

Matters needing Shared Core / Sharing & Deployment review before general reuse:

1. Browser-origin privacy: application scopes isolate organisations and actors in the UI, but path-separated hosted-beta deployments on one origin do not isolate data from malicious same-origin JavaScript. Decide whether future installations require separate origins, additional encryption, or other controls; do not treat a hashed database name as encryption or an authorization boundary.
2. Local retention: establish any shared-device, logout, key-rotation, storage-eviction, export and removal policy without silently deleting unconfirmed material. No automatic expiry or destructive logout clearing is added in this branch.
3. Apps Script portability: verify storage-origin continuity across redeployments and actual mobile browsers, especially feedback HTML iframes. A new origin cannot transparently read the old origin's outbox. The branch adds no universal identity/storage rule to bridge that boundary.
4. Configuration: future self-contained feedback must use an organisation-owned destination or an explicitly governed shared service. The local queue reuses existing configuration and does not copy or enable a central destination.
5. Backend concurrency: script locks coordinate one Apps Script project, not independent projects sharing a workbook. Installation must ensure one guarded audio writer per organisation store, or define stronger coordination deliberately.

Piper's Path-specific accepted requirement remains: retain created/submitted material locally until confirmed persisted, preserve the proven recorder, and reconcile ambiguous audio before retry. The current branch protects completed recordings and submitted reports; incremental recording/draft persistence and unidentified live lesson-comment handlers remain incomplete. See `docs/reliable-saving.md` for exact implementation and tests.
