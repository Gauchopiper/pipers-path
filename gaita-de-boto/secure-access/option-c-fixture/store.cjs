'use strict';
const {DatabaseSync} = require('node:sqlite');
const {readFileSync, realpathSync, chmodSync} = require('node:fs');
const {join, basename, dirname} = require('node:path');
const {tmpdir} = require('node:os');
const {randomUUID, randomBytes, createCipheriv, createDecipheriv, createPublicKey} = require('node:crypto');
const C = require('./contracts.cjs');

function fixtureFile(directory, name) {
  const root = realpathSync(directory);
  if (dirname(root) !== realpathSync(tmpdir()) || !/^gdb-option-c-[A-Za-z0-9]+$/.test(basename(root)) ||
      !['gateway.sqlite', 'google.sqlite'].includes(name)) C.fail('Disposable fixture directory required.');
  return join(root, name);
}
function openFixtureDatabase(directory, name) {
  const filename = fixtureFile(directory, name), db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;');
  return db;
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function openStore(config) {
  const {profile, fingerprint, select} = C.profileContract(config);
  const {identities, ownerSubject, workerSubject, callerSubject, stageKey, gatewayPrivateKey, googlePublicKey,
    now = Date.now, leaseMs = 30000} = config;
  if (![ownerSubject, workerSubject, callerSubject].every(C.fixtureId) || new Set([ownerSubject, workerSubject, callerSubject]).size !== 3 ||
      !Buffer.isBuffer(stageKey) || stageKey.length !== 32 || !identities || !Number.isSafeInteger(leaseMs) || leaseMs < 1) C.fail('Fixture authority/key configuration required.');
  const db = openFixtureDatabase(config.directory, 'gateway.sqlite');
  db.exec(readFileSync(join(__dirname, 'store.sql'), 'utf8'));
  const keyFingerprint = C.digest({profile, ownerSubject, workerSubject, callerSubject,
    stage: C.hash(stageKey), gateway: createPublicKey(gatewayPrivateKey).export({type: 'spki', format: 'pem'}), google: googlePublicKey});
  const previous = db.prepare('SELECT fingerprint FROM configuration').get();
  if (previous && previous.fingerprint !== keyFingerprint) { db.close(); C.fail('Fixture configuration/key mismatch; original state retained.'); }
  db.prepare('INSERT OR IGNORE INTO configuration VALUES(1,?)').run(keyFingerprint);
  db.prepare("INSERT OR IGNORE INTO admission VALUES(1,0,'inactive',0,'[]')").run();
  db.prepare('INSERT OR IGNORE INTO revisions VALUES(1,?,0,?,NULL)').run(randomUUID(), JSON.stringify({
    sessions: 0, totals: 0, availability: 0, group: 0, catalogue: 0, targets: 0, badges: 0, comments: 0, reviews: 0, access: 0
  }));
  const admission = () => db.prepare('SELECT * FROM admission').get();
  const row = sid => db.prepare('SELECT * FROM recordings WHERE session=?').get(sid);
  function audit(actor, operation, decision) {
    db.prepare('INSERT INTO audit(at,subject,operation,decision,revision) VALUES(?,?,?,?,?)')
      .run(now(), identities.isActor(actor) || identities.isWorker(actor) ? actor.subject : 'untrusted', operation, decision, admission().revision);
  }
  function owner(actor) {
    if (!identities.isActor(actor) || actor.subject !== ownerSubject || actor.scope !== 'google:fixture') C.fail('Verified configured Owner required.');
  }
  function worker(actor) {
    if (!identities.isWorker(actor) || actor.subject !== workerSubject) C.fail('Database worker identity required.');
  }
  function currentAdmission(operation) {
    const a = admission();
    if (a.status !== 'active' || a.expires <= now() || !JSON.parse(a.operations).includes(operation)) C.fail('Admission expired, revoked or operation denied.');
    return a;
  }
  function authorize(actor, selection, operation) {
    try {
      owner(actor); select(selection);
      const a = currentAdmission(operation);
      audit(actor, operation, 'allow'); return a;
    } catch (error) { audit(actor, operation, 'deny'); throw error; }
  }
  function version() {
    const r = db.prepare('SELECT * FROM revisions').get();
    if (r.dirty) C.fail('Authoritative view is DIRTY; reconcile first.');
    return r.generation + ':' + r.number;
  }
  function bump(event, operation) {
    const r = db.prepare('SELECT * FROM revisions').get(), facets = JSON.parse(r.facets);
    for (const facet of C.eventFacets[event]) facets[facet]++;
    db.prepare('UPDATE revisions SET number=number+1,facets=?,dirty=CASE WHEN dirty=? THEN NULL ELSE dirty END WHERE id=1')
      .run(JSON.stringify(facets), operation);
    return r.generation + ':' + (r.number + 1);
  }
  function changeAdmission(actor, selection, input) {
    try {
      owner(actor); select(selection);
      if (!C.exact(input, ['action', 'expectedRevision', 'expires', 'operations']) ||
          !['admit', 'revoke'].includes(input.action) || !Number.isSafeInteger(input.expectedRevision) ||
          !Array.isArray(input.operations) || new Set(input.operations).size !== input.operations.length ||
          input.operations.some(op => !C.operations.includes(op)) ||
          !Number.isSafeInteger(input.expires) || (input.action === 'admit' && (input.expires <= now() || input.operations.length === 0))) C.fail('Invalid narrow test admission.');
      const result = transaction(db, () => {
        const a = admission(); if (a.revision !== input.expectedRevision) C.fail('Stale admission revision.');
        db.prepare('UPDATE admission SET revision=revision+1,status=?,expires=?,operations=? WHERE id=1')
          .run(input.action === 'admit' ? 'active' : 'revoked', input.expires, JSON.stringify(input.operations));
        bump('admission.changed', null); return admission();
      });
      audit(actor, 'admission.' + input.action, 'allow'); return result;
    } catch (error) { audit(actor, 'admission.change', 'deny'); throw error; }
  }
  function encrypt(audio, aad) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', stageKey, iv);
    cipher.setAAD(Buffer.from(aad));
    return {iv, cipher: Buffer.concat([cipher.update(audio), cipher.final()]), tag: cipher.getAuthTag()};
  }
  function loadAudio(record) {
    if (!record?.cipher) C.fail('Protected staging unavailable.');
    const decipher = createDecipheriv('aes-256-gcm', stageKey, Buffer.from(record.iv));
    decipher.setAAD(Buffer.from(record.manifest_hash)); decipher.setAuthTag(Buffer.from(record.tag));
    return Buffer.concat([decipher.update(Buffer.from(record.cipher)), decipher.final()]);
  }
  function begin(actor, selection, request) {
    authorize(actor, selection, request.event);
    if (!C.exact(request, ['operation', 'event', 'expectedVersion', 'value']) || !C.uuid(request.operation) ||
        !Object.hasOwn(C.eventFacets, request.event) || !C.operations.includes(request.event) ||
        typeof request.value !== 'string' || request.value.length > 500) C.fail('Invalid coordinated operation.');
    const bound = {...request, originalActor: C.actorFields(actor), profileDigest: fingerprint, environment: profile.environment};
    const encoded = C.canonical(bound);
    return transaction(db, () => {
      currentAdmission(request.event);
      const old = db.prepare('SELECT * FROM operations WHERE id=?').get(request.operation);
      if (old) { if (old.request !== encoded) C.fail('Operation identity conflict.'); return {duplicate: true, request: bound, state: old.state}; }
      if (version() !== request.expectedVersion) C.fail('Stale authoritative revision.');
      db.prepare("INSERT INTO operations VALUES(?,?,'dirty',NULL,NULL)").run(request.operation, encoded);
      db.prepare('UPDATE revisions SET dirty=? WHERE id=1').run(request.operation);
      return {duplicate: false, request: bound, state: 'dirty'};
    });
  }
  function submission(actor, selection, input, encoded, mediaSeconds) {
    authorize(actor, selection, 'recording.submit');
    const {binding, audio} = C.recordingInput(actor, profile, input, encoded, mediaSeconds);
    const submissionHash = C.digest({binding, originalActor: C.actorFields(actor), environment: profile.environment, profileDigest: fingerprint});
    return transaction(db, () => {
      const a = currentAdmission('recording.submit');
      const old = row(binding.sessionId);
      if (old) { if (old.submission_hash !== submissionHash) C.fail('Immutable original Session ID conflict.'); return {duplicate: true, sessionId: old.session, phase: old.phase}; }
      const manifest = C.makeManifest(actor, profile, fingerprint, binding, a.revision), manifestHash = C.digest(manifest);
      const encrypted = encrypt(audio, manifestHash), operation = randomUUID();
      db.prepare(`INSERT INTO recordings(session,submission_hash,manifest,manifest_hash,phase,iv,cipher,tag,revision_operation)
        VALUES(?,?,?,?,'accepted',?,?,?,?)`).run(binding.sessionId, submissionHash, C.canonical(manifest), manifestHash,
        encrypted.iv, encrypted.cipher, encrypted.tag, operation);
      return {duplicate: false, sessionId: binding.sessionId, phase: 'accepted'};
    });
  }
  function claim(service, sid) {
    worker(service); const record = row(sid); if (!record) C.fail('Unknown original session.');
    const manifest = JSON.parse(record.manifest), actor = identities.actor(manifest.originalActor.subject);
    authorize(actor, profileSelection(), 'recording.submit');
    return transaction(db, () => {
      const a = currentAdmission('recording.submit');
      const current = row(sid);
      if (current.phase !== 'accepted' || current.lease_until > now()) C.fail('Dispatch requires reconciliation or current lease.');
      const body = {nonce: randomUUID(), at: now(), expires: now() + leaseMs, fence: current.fence + 1,
        currentAdmissionRevision: a.revision, manifest, manifestHash: current.manifest_hash};
      const permit = C.signed(gatewayPrivateKey, 'dispatch', body);
      db.prepare('UPDATE recordings SET fence=?,lease_until=?,permit=? WHERE session=?').run(body.fence, body.expires, C.canonical(permit), sid);
      return permit;
    });
  }
  function markSent(service, permit) {
    worker(service);
    const body = C.checked(createPublicKey(gatewayPrivateKey), 'dispatch', permit), r = row(body.manifest.binding.sessionId);
    if (!r || r.permit !== C.canonical(permit) || r.phase !== 'accepted' || r.fence !== body.fence || r.lease_until <= now()) C.fail('Stale dispatch permit.');
    authorize(identities.actor(body.manifest.originalActor.subject), profileSelection(), 'recording.submit');
    transaction(db, () => {
      const a = currentAdmission('recording.submit');
      if (a.revision !== body.currentAdmissionRevision) C.fail('Admission changed before dispatch.');
      const current = row(r.session);
      if (current.permit !== C.canonical(permit) || current.phase !== 'accepted' || current.fence !== body.fence || current.lease_until <= now()) C.fail('Stale dispatch permit.');
      version();
      db.prepare("UPDATE recordings SET phase='sent' WHERE session=?").run(r.session);
      db.prepare('UPDATE revisions SET dirty=? WHERE id=1').run(r.revision_operation);
    });
    return {manifest: body.manifest, audio: loadAudio(row(r.session))};
  }
  function uncertain(service, sid) {
    worker(service); db.prepare("UPDATE recordings SET phase='uncertain' WHERE session=? AND phase='sent'").run(sid);
  }
  function completeRecording(service, sid, receipt, reconciled = false) {
    worker(service); const r = row(sid); if (!r || !['sent', 'uncertain', 'confirmed', 'reconciled'].includes(r.phase)) C.fail('No dispatched original intent.');
    const body = C.checked(googlePublicKey, 'recording-receipt', receipt);
    if (!C.exact(body, ['environment', 'profileDigest', 'manifestHash', 'binding', 'canonical', 'qualification', 'saved']) ||
        body.saved !== true || body.environment !== profile.environment || body.profileDigest !== fingerprint ||
        body.manifestHash !== r.manifest_hash || body.canonical?.folderId !== profile.folder ||
        C.canonical(body.binding) !== C.canonical(JSON.parse(r.manifest).binding)) C.fail('Foreign or incomplete exact receipt.');
    const {publicConfirmation} = require('../integration-fixture/receipt.cjs');
    publicConfirmation({protocol: 'gdb-exact-recording-receipt-v1', state: 'saved', retainLocalAudio: false, ...body});
    return transaction(db, () => {
      const current = row(sid);
      if (['confirmed', 'reconciled'].includes(current.phase)) return {duplicate: true};
      const rev = db.prepare('SELECT * FROM revisions').get();
      if (rev.dirty !== current.revision_operation) C.fail('Recording revision mismatch.');
      db.prepare('UPDATE recordings SET phase=?,receipt=? WHERE session=?').run(reconciled ? 'reconciled' : 'confirmed', C.canonical(receipt), sid);
      // A revoked in-flight outcome is retained for Owner reconciliation, not pupil access.
      const a = admission();
      if (a.status === 'active' && a.expires > now()) db.prepare('UPDATE recordings SET iv=NULL,cipher=NULL,tag=NULL WHERE session=?').run(sid);
      bump(reconciled ? 'recording.reconciled' : 'recording.saved', current.revision_operation);
      return {duplicate: false};
    });
  }
  function finishOperation(service, operation, proof) {
    worker(service); const old = db.prepare('SELECT * FROM operations WHERE id=?').get(operation);
    if (!old) C.fail('Unknown original operation.');
    const expected = JSON.parse(old.request), body = C.checked(googlePublicKey, 'operation-receipt', proof);
    if (!C.exact(body, ['operation', 'requestDigest', 'environment', 'profileDigest', 'sourceDigest']) ||
        body.operation !== operation || body.requestDigest !== C.digest(expected) || body.environment !== profile.environment ||
        body.profileDigest !== fingerprint || !/^[a-f0-9]{64}$/.test(body.sourceDigest)) C.fail('Operation source proof rejected.');
    return transaction(db, () => {
      if (old.state === 'complete') return {duplicate: true};
      if (db.prepare('SELECT dirty FROM revisions').get().dirty !== operation) C.fail('Operation revision mismatch.');
      const after = bump(expected.event, operation);
      db.prepare("UPDATE operations SET state='complete',proof=?,after_version=? WHERE id=?").run(C.canonical(proof), after, operation);
      return {duplicate: false, afterVersion: after};
    });
  }
  function status(actor, selection, sid) {
    authorize(actor, selection, 'recording.status'); const r = row(sid);
    if (!r || JSON.parse(r.manifest).originalActor.subject !== actor.subject) C.fail('Foreign original session.');
    const saved = ['confirmed', 'reconciled'].includes(r.phase);
    const confirmation = saved ? require('../integration-fixture/receipt.cjs').publicConfirmation({
      protocol: 'gdb-exact-recording-receipt-v1', state: 'saved', retainLocalAudio: false,
      ...C.checked(googlePublicKey, 'recording-receipt', JSON.parse(r.receipt))}) : null;
    return {sessionId: sid, phase: r.phase, saved, retainLocalAudio: !saved,
      display: saved ? 'SAVED' : 'SAFE ON DEVICE — awaiting confirmation', manifestHash: r.manifest_hash, confirmation};
  }
  function profileSelection() { return {environment: profile.environment, organisation: profile.organisation, pupil: profile.pupil}; }
  return {profile, fingerprint, db, now, select, authorize, owner, worker, admission, changeAdmission,
    submission, row, loadAudio, claim, markSent, uncertain, completeRecording, status, version, begin, finishOperation,
    profileSelection, facets: () => JSON.parse(db.prepare('SELECT facets FROM revisions').get().facets),
    audit: () => db.prepare('SELECT * FROM audit ORDER BY sequence').all(), close: () => db.close()};
}
module.exports = {openStore, openFixtureDatabase, transaction, fixtureFile};
