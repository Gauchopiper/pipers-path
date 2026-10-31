'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const {randomUUID, randomBytes} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {fixture, C, gateway, google} = require('./test-support.cjs');
const {openStore, fixtureFile} = require('./store.cjs');

// No network is needed or permitted by this suite, including accidental additions.
let networkCalls = 0;
const noNetwork = () => { networkCalls++; throw Error('Network prohibited in Stage 1 fixtures.'); };
global.fetch = noNetwork;
for (const name of ['node:http', 'node:https']) {
  require(name).request = noNetwork; require(name).get = noNetwork;
}
require('node:net').connect = noNetwork;
require('node:net').createConnection = noNetwork;

const cases = [];
const test = (name, run) => cases.push({name, run});
const reject = (fn, expression = /./) => assert.throws(fn, expression);
const rejectAsync = (fn, expression = /./) => assert.rejects(fn, expression);
const read = (f, operation = 'path.read', payload = {}, hooks) => f.pipe.read(f.owner, f.selection, operation, payload, hooks);
const proof = (f, body) => C.signed(google.privateKey, 'recording-receipt', body);
const receiptBody = receipt => C.checked(google.publicKey, 'recording-receipt', receipt);

test('01 fixture opt-in and synthetic-only resource configuration fail closed', f => {
  reject(() => C.profileContract({...f.config, fixtureOnly: false}));
  reject(() => C.profileContract({...f.config, profile: {...f.config.profile, workbook: 'real-id'}}));
  reject(() => C.profileContract({...f.config, profile: {...f.config.profile, folder: 'synthetic-other-folder'}}));
  reject(() => fixtureFile('/tmp', 'gateway.sqlite'));
});
test('02 Owner has no implicit Dummy admission', f => {
  reject(() => f.submit(), /Admission/);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM recordings').get().n, 0);
});
test('03 exact Owner admission is bounded and auditable', f => {
  const a = f.admit(['recording.submit', 'recording.status']);
  assert.equal(a.revision, 1); assert.equal(a.status, 'active');
  const sid = f.submit(); assert.equal(f.status(sid).saved, false);
  assert(f.store.audit().some(a => a.operation === 'admission.admit' && a.decision === 'allow'));
});
test('04 forged verified and OWNER flags cannot become an authenticated actor', f => {
  f.admit();
  reject(() => f.store.authorize({...f.owner, verified: true, role: 'OWNER'}, f.selection, 'path.read'), /Owner/);
  reject(() => f.store.authorize(JSON.parse(JSON.stringify(f.owner)), f.selection, 'path.read'), /Owner/);
});
test('05 other pupil cannot receive the Owner-to-Dummy admission', f => {
  reject(() => f.store.changeAdmission(f.owner, {...f.selection, pupil: 'synthetic-other-pupil'},
    {action: 'admit', expectedRevision: 0, expires: 2000000, operations: C.operations}), /selection/);
  assert.equal(f.store.admission().revision, 0);
});
test('06 another organisation and environment cannot be selected', f => {
  f.admit();
  for (const selection of [{...f.selection, organisation: 'OTHER'}, {...f.selection, environment: 'fixture-other'}])
    reject(() => f.store.authorize(f.owner, selection, 'path.read'), /selection/);
});
test('07 another verified actor is denied the Dummy admission', f => {
  f.admit(); const other = f.identities.actor('synthetic-other-owner');
  reject(() => f.store.authorize(other, f.selection, 'path.read'), /Owner/);
  assert.equal(f.store.audit().at(-1).decision, 'deny');
});
test('08 database worker and Google caller cannot act as Owner', f => {
  f.admit();
  for (const actor of [f.worker, f.caller]) reject(() => f.store.authorize(actor, f.selection, 'path.read'), /Owner/);
  reject(() => f.store.claim(f.owner, randomUUID()), /worker/);
});
test('09 operation allowlist prevents an admitted reader submitting audio', async f => {
  f.admit(['path.read']); await read(f);
  reject(() => f.submit(), /operation denied/);
});
test('10 expiry is enforced on submissions and reads', async f => {
  f.admit(); f.advance(60000);
  reject(() => f.submit(), /expired/); await rejectAsync(() => read(f), /expired/);
});
test('11 revocation survives reopening and denies queued status', f => {
  f.admit(); const sid = f.submit(); f.revoke(); f.reopen();
  reject(() => f.status(sid), /revoked/); reject(() => f.submit(), /revoked/);
  assert.equal(f.store.admission().status, 'revoked');
});
test('12 admission revisions prevent stale grants and retain denial audit', f => {
  f.admit();
  reject(() => f.store.changeAdmission(f.owner, f.selection, {action: 'admit', expectedRevision: 0,
    expires: 2000000, operations: C.operations}), /Stale/);
  f.reopen(); assert.equal(f.store.admission().revision, 1);
  assert(f.store.audit().some(a => a.decision === 'deny'));
});
test('13 admission rejects wildcard operations and resource selectors', f => {
  reject(() => f.admit(['*']), /Invalid/);
  reject(() => f.store.changeAdmission(f.owner, {...f.selection, workbook: 'synthetic-other'},
    {action: 'admit', expectedRevision: 0, expires: 2000000, operations: C.operations}), /selection/);
});
test('14 immutable manifest binds exact actor, profile, original revision and audio', f => {
  f.admit(); const input = f.input(), sid = f.submit(input), row = f.store.row(sid), m = JSON.parse(row.manifest);
  assert.equal(m.binding.sessionId, sid); assert.equal(m.originalActor.subject, f.owner.subject);
  assert.equal(m.authorisationRevision, 1); assert.equal(m.environment, f.selection.environment);
  assert.equal(m.binding.hash, C.hash(input.audio)); assert.equal(m.binding.length, input.audio.length);
  assert.equal(m.profileDigest, f.store.fingerprint); assert.equal(C.digest(m), row.manifest_hash);
});
test('15 protected staging survives reopening without plaintext storage', f => {
  f.admit(); const input = f.input(), sid = f.submit(input), before = f.store.row(sid);
  assert(!Buffer.from(before.cipher).equals(input.audio));
  f.reopen(); assert.equal(f.store.row(sid).manifest, before.manifest);
  assert(f.store.loadAudio(f.store.row(sid)).equals(input.audio));
});
test('16 separate Node process recovers exact original protected bytes and identity', f => {
  f.admit(); const input = f.input(), sid = f.submit(input);
  const path = join(f.directory, 'synthetic-config.json');
  fs.writeFileSync(path, JSON.stringify({...f.config, identities: undefined, now: f.config.now(),
    stageKey: f.config.stageKey.toString('base64')}), {mode: 0o600});
  const program = `const c=JSON.parse(require('node:fs').readFileSync(process.argv[1]));
    const C=require(process.argv[2]+'/contracts.cjs'); const {openStore}=require(process.argv[2]+'/store.cjs');
    c.stageKey=Buffer.from(c.stageKey,'base64'); const t=c.now; c.now=()=>t;
    c.identities=C.fixtureIdentities({fixtureOnly:true}); const s=openStore(c);
    const r=s.row(process.argv[3]); process.stdout.write(JSON.stringify({hash:C.hash(s.loadAudio(r)),
      status:s.status(c.identities.actor(c.ownerSubject),s.profileSelection(),r.session)})); s.close();`;
  const result = JSON.parse(execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', program, path, __dirname, sid], {encoding: 'utf8'}));
  assert.equal(result.hash, input.recording.hash); assert.equal(result.status.sessionId, sid);
  assert.equal(result.status.saved, false); fs.unlinkSync(path);
});
test('17 key or Owner configuration replacement cannot open the original store', f => {
  f.admit(); const sid = f.submit();
  reject(() => openStore({...f.config, stageKey: randomBytes(32)}), /mismatch/);
  reject(() => openStore({...f.config, ownerSubject: 'synthetic-other'}), /mismatch/);
  assert(f.store.loadAudio(f.store.row(sid)).length > 0);
});
test('18 identical Session-ID submission is idempotent', f => {
  f.admit(); const input = f.input(), sid = f.submit(input);
  assert.equal(f.pipe.submit(f.owner, f.selection, input.recording, input.encoded).duplicate, true);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM recordings').get().n, 1);
  assert.equal(f.store.row(sid).fence, 0);
});
test('19 changed audio under the original Session ID is a conflict', f => {
  f.admit(); const sid = f.submit(); const changed = f.input(2, {sessionId: sid});
  reject(() => f.submit(changed), /Session ID conflict/);
  assert.equal(JSON.parse(f.store.row(sid).manifest).binding.durationSeconds, 1);
});
test('20 changed original times under the same Session ID are a conflict', f => {
  f.admit(); const input = f.input(); f.submit(input);
  const changed = {...input, recording: {...input.recording, startIso: '2026-01-02T00:00:00.000Z', endIso: '2026-01-02T00:00:01.000Z'}};
  reject(() => f.submit(changed), /conflict/);
});
test('21 hash and size mismatch cannot enter the queue', f => {
  f.admit(); const input = f.input();
  for (const recording of [{...input.recording, hash: 'a'.repeat(64)}, {...input.recording, length: input.audio.length + 1}])
    reject(() => f.submit({...input, recording}));
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM recordings').get().n, 0);
});
test('22 declared duration cannot override independently parsed samples', f => {
  f.admit(); const input = f.input();
  reject(() => f.submit({...input, recording: {...input.recording, durationSeconds: 2, endIso: '2026-01-01T00:00:02.000Z'}}), /duration mismatch/);
});
test('23 invalid MIME, Session ID and client-selected folder are denied', f => {
  f.admit(); const input = f.input();
  for (const recording of [{...input.recording, mimeType: 'text/plain'}, {...input.recording, sessionId: 'client-session'},
    {...input.recording, folder: 'synthetic-other'}]) reject(() => f.submit({...input, recording}));
});
test('24 renewing admission preserves the original accepted manifest revision', f => {
  f.admit(); const input = f.input(), sid = f.submit(input), original = f.store.row(sid).manifest;
  f.revoke(); f.admit(); f.submit(input);
  assert.equal(f.store.row(sid).manifest, original); assert.equal(JSON.parse(original).authorisationRevision, 1);
});
test('25 queued acknowledgement never says SAVED', f => {
  f.admit(); const sid = f.submit(), s = f.status(sid);
  assert.equal(s.saved, false); assert.equal(s.retainLocalAudio, true);
  assert.equal(s.display, 'SAFE ON DEVICE — awaiting confirmation'); assert.equal(f.google.stats().writerCalls, 0);
});
test('26 canonical save uses original writer exactly once and yields exact confirmation', async f => {
  f.admit(); const input = f.input(), sid = f.submit(input);
  assert.equal((await f.pipe.dispatch(sid)).canonicalConfirmed, true);
  assert.equal(f.status(sid).display, 'SAVED'); assert.equal(f.status(sid).retainLocalAudio, false);
  assert.deepEqual(f.google.stats(), {writerCalls: 1, files: 1, logRows: 1, operations: 0});
  const body = receiptBody(JSON.parse(f.store.row(sid).receipt));
  assert.equal(body.binding.sessionId, sid); assert.equal(body.binding.hash, input.recording.hash);
  assert.equal(f.status(sid).confirmation.hash, input.recording.hash);
  assert.equal(f.status(sid).confirmation.byteLength, input.audio.length);
  assert.equal(f.store.row(sid).cipher, null); assert(!JSON.stringify(f.status(sid)).includes('drive.google'));
});
test('27 database lease expiry and fencing reject stale workers', f => {
  f.admit(); const sid = f.submit(), old = f.store.claim(f.worker, sid);
  reject(() => f.store.claim(f.worker, sid), /lease/); f.advance(30001);
  const next = f.store.claim(f.worker, sid);
  reject(() => f.store.markSent(f.worker, old), /Stale/);
  assert(f.store.markSent(f.worker, next).audio.length > 0);
});
test('28 expired dispatch permit is not sent to Google', f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid); f.advance(30000);
  reject(() => f.store.markSent(f.worker, permit), /Stale/); assert.equal(f.google.stats().writerCalls, 0);
});
test('29 Google automation identity is separate from original Owner', async f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid), body = C.checked(gateway.publicKey, 'dispatch', permit);
  assert.equal(body.manifest.originalActor.subject, f.owner.subject);
  await rejectAsync(() => f.google.dispatch(f.owner, permit, f.input().encoded), /caller/);
  await rejectAsync(() => f.google.dispatch({...f.caller}, permit, f.input().encoded), /caller/);
  assert.notEqual(f.caller.subject, f.owner.subject);
});
test('30 signed envelope replay is rejected across service reopening', async f => {
  f.admit(); const {permit} = await f.sent(); f.reopen();
  await rejectAsync(() => f.google.dispatch(f.caller, permit, f.input().encoded), /UNIQUE/);
  assert.equal(f.google.stats().writerCalls, 1);
});
test('31 wrong signature and signed purpose cannot dispatch a recording', async f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid), body = C.checked(gateway.publicKey, 'dispatch', permit);
  await rejectAsync(() => f.google.dispatch(f.caller, C.signed(google.privateKey, 'dispatch', body), f.input().encoded), /Signature/);
  await rejectAsync(() => f.google.dispatch(f.caller, C.signed(gateway.privateKey, 'read', body), f.input().encoded), /purpose/);
  assert.equal(f.google.stats().writerCalls, 0);
});
test('32 signed cross-environment manifest cannot use the isolated Google profile', async f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid), b = C.checked(gateway.publicKey, 'dispatch', permit);
  b.manifest.environment = 'fixture-other'; b.manifestHash = C.digest(b.manifest);
  await rejectAsync(() => f.google.dispatch(f.caller, C.signed(gateway.privateKey, 'dispatch', b), f.input().encoded), /manifest/);
  assert.equal(f.google.stats().files, 0);
});
test('33 Google service rejects substituted original actor despite valid gateway signature', async f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid), b = C.checked(gateway.publicKey, 'dispatch', permit);
  b.manifest.originalActor.subject = f.caller.subject; b.manifest.binding.subject = f.caller.subject; b.manifestHash = C.digest(b.manifest);
  await rejectAsync(() => f.google.dispatch(f.caller, C.signed(gateway.privateKey, 'dispatch', b), f.input().encoded), /manifest/);
});
test('34 queue-style success and unsigned receipt cannot complete an original intent', async f => {
  f.admit(); const {sid} = await f.sent();
  reject(() => f.store.completeRecording(f.worker, sid, {saved: true}), /Signature/);
  reject(() => f.store.completeRecording(f.worker, sid, proof(f, {saved: true})), /receipt/);
  assert.equal(f.status(sid).saved, false); assert(f.store.row(sid).cipher);
});
test('35 tampered receipt signature cannot release protected audio', async f => {
  f.admit(); const {sid, result} = await f.sent();
  const forged = {...result.receipt, wire: result.receipt.wire.replace('"saved":true', '"saved":false')};
  reject(() => f.store.completeRecording(f.worker, sid, forged), /Signature/); assert(f.store.row(sid).cipher);
});
test('36 signed hash, actor, environment and folder mismatches remain unsaved', async f => {
  f.admit(); const {sid, result} = await f.sent(), original = receiptBody(result.receipt);
  const altered = [b => b.binding.hash = 'a'.repeat(64), b => b.binding.subject = 'synthetic-other',
    b => b.environment = 'fixture-other', b => b.canonical.folderId = 'synthetic-other'];
  for (const alter of altered) { const b = structuredClone(original); alter(b);
    reject(() => f.store.completeRecording(f.worker, sid, proof(f, b)), /receipt/); }
  assert.equal(f.status(sid).saved, false);
});
test('37 signed incomplete canonical log or duration evidence is rejected', async f => {
  f.admit(); const {sid, result} = await f.sent();
  for (const alter of [b => b.canonical.log = null, b => b.canonical.validatedSeconds = 300,
    b => b.qualification.qualifying = true]) {
    const b = receiptBody(result.receipt); alter(b);
    reject(() => f.store.completeRecording(f.worker, sid, proof(f, b)), /evidence/);
  }
});
test('38 duplicate authenticated confirmation does not increment revisions twice', async f => {
  f.admit(); const {sid, result} = await f.sent(); f.store.completeRecording(f.worker, sid, result.receipt);
  const version = f.store.version(); assert.equal(f.store.completeRecording(f.worker, sid, result.receipt).duplicate, true);
  assert.equal(f.store.version(), version); assert.equal(f.google.stats().files, 1);
});
test('39 lost Google acknowledgement reconciles after both stores reopen without rewriting', async f => {
  f.admit(); const sid = f.submit(); f.google.canonical.setMode('lost-response');
  assert.equal((await f.pipe.dispatch(sid)).saved, false); assert.equal(f.status(sid).saved, false);
  assert(f.store.row(sid).cipher); f.reopen();
  assert.equal(f.pipe.reconcile(sid).canonicalConfirmed, true); assert.equal(f.status(sid).phase, 'reconciled');
  assert.equal(f.google.stats().writerCalls, 1); assert.equal(f.google.stats().logRows, 1);
});
test('40 process interruption after dispatch barrier blocks reads and never blindly resends', async f => {
  f.admit(); const sid = f.submit();
  await rejectAsync(() => f.pipe.dispatch(sid, {afterSent: () => { throw Error('synthetic process interruption'); }}), /interruption/);
  f.reopen(); assert.equal(f.status(sid).saved, false);
  await rejectAsync(() => read(f), /DIRTY/); assert.equal(f.pipe.reconcile(sid).saved, false);
  await rejectAsync(() => f.pipe.dispatch(sid), /reconciliation/); assert.equal(f.google.stats().writerCalls, 0);
});
for (const mode of ['before-file', 'after-file']) test('41-' + mode + ' interrupted canonical write is retained for attention, not repaired by inspection', async f => {
  f.admit(); const sid = f.submit(); f.google.canonical.setMode(mode);
  assert.equal((await f.pipe.dispatch(sid)).saved, false);
  f.reopen(); const before = C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest)));
  assert.equal(f.pipe.reconcile(sid).saved, false);
  assert.equal(C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest))), before);
  assert(f.store.row(sid).cipher); assert.equal(f.status(sid).saved, false);
  await rejectAsync(() => f.pipe.dispatch(sid), /reconciliation/); assert.equal(f.google.stats().writerCalls, 1);
});
test('41-after-log complete canonical evidence is reconciled without changing Google data', async f => {
  f.admit(); const sid = f.submit(); f.google.canonical.setMode('after-log');
  assert.equal((await f.pipe.dispatch(sid)).saved, false); assert(f.store.row(sid).cipher);
  f.reopen(); const before = C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest)));
  assert.equal(f.pipe.reconcile(sid).canonicalConfirmed, true);
  assert.equal(C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest))), before);
  assert.equal(f.status(sid).saved, true); assert.equal(f.google.stats().writerCalls, 1);
});
test('41-missing-meta canonical partial evidence is not repaired or reported saved', async f => {
  f.admit(); const {sid} = await f.sent(); f.google.canonical.tables['SESSION META'].splice(1); f.google.persist();
  f.store.uncertain(f.worker, sid); f.reopen();
  const before = C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest)));
  assert.equal(f.pipe.reconcile(sid).saved, false);
  assert.equal(C.digest(f.google.snapshot(JSON.parse(f.store.row(sid).manifest))), before);
  assert.equal(f.status(sid).saved, false); assert(f.store.row(sid).cipher);
});
test('42 pre-existing audio without an original manifest cannot be adopted or read', async f => {
  f.admit(); const input = f.input(), sid = f.submit(input), m = JSON.parse(f.store.row(sid).manifest);
  f.google.canonical.rawUpload(m.binding, input.encoded); f.google.persist();
  assert.equal((await f.pipe.dispatch(sid)).state, 'unbound'); assert.equal(f.status(sid).saved, false);
  assert.equal(f.google.stats().writerCalls, 0);
});
test('43 absent reconciliation is pure and creates no legacy receipt journal', f => {
  f.admit(); const sid = f.submit();
  assert.equal(f.google.canonical.tables['RECORDING RECEIPTS'], undefined);
  assert.equal(f.pipe.reconcile(sid).state, 'absent');
  assert.equal(f.google.canonical.tables['RECORDING RECEIPTS'], undefined);
});
test('44 revocation between claim and dispatch prevents any Google write', f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid); f.revoke();
  reject(() => f.store.markSent(f.worker, permit), /revoked/); assert.equal(f.google.stats().writerCalls, 0);
});
test('45 admission revision change invalidates an earlier dispatch permit', f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid); f.admit();
  reject(() => f.store.markSent(f.worker, permit), /Admission changed/); assert.equal(f.google.stats().files, 0);
});
test('46 in-flight revocation preserves canonical outcome but denies pupil status and playback', async f => {
  f.admit(); const sid = f.submit();
  assert.equal((await f.pipe.dispatch(sid, {afterSent: () => f.revoke()})).canonicalConfirmed, true);
  assert.equal(f.google.stats().files, 1); assert.equal(f.store.row(sid).phase, 'confirmed');
  assert(f.store.row(sid).cipher); reject(() => f.status(sid), /revoked/);
  await rejectAsync(() => read(f, 'playback.read', {sessionId: sid}), /revoked/);
  reject(() => f.submit(), /revoked/);
});
test('47 pending read response is discarded if revocation occurs during retrieval', async f => {
  f.admit(); await rejectAsync(() => read(f, 'path.read', {}, {afterRead: () => f.revoke()}), /revoked/);
});
test('48 resource-selection injection cannot reach protected PATH or playback', async f => {
  f.admit();
  await rejectAsync(() => read(f, 'path.read', {workbook: 'synthetic-other'}), /selector/);
  await rejectAsync(() => read(f, 'playback.read', {sessionId: randomUUID(), folder: 'synthetic-other'}), /selector/);
});
test('49 protected playback returns exact authenticated bytes with no Drive URL', async f => {
  f.admit(); const input = f.input(), sid = f.submit(input); await f.pipe.dispatch(sid);
  const result = await read(f, 'playback.read', {sessionId: sid});
  assert.equal(C.hash(Buffer.from(result.data.audioBase64, 'base64')), input.recording.hash);
  assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(result.headers['Referrer-Policy'], 'no-referrer');
  assert(!JSON.stringify(result).includes('drive.google'));
});
test('50 another original Session ID cannot be used to fetch Dummy playback', async f => {
  f.admit(); await rejectAsync(() => read(f, 'playback.read', {sessionId: randomUUID()}), /Unbound/);
});
test('51 changed canonical bytes or folder fail closed for both PATH and playback', async f => {
  f.admit(); const sid = f.submit(); await f.pipe.dispatch(sid);
  const file = [...f.google.canonical.files.values()][0], original = file.input;
  file.input = Buffer.from(original); file.input[50] ^= 1;
  await rejectAsync(() => read(f), /Incomplete/); await rejectAsync(() => read(f, 'playback.read', {sessionId: sid}), /Incomplete/);
  file.input = original; file.folder = 'synthetic-other';
  await rejectAsync(() => read(f, 'playback.read', {sessionId: sid}), /Incomplete/);
});
test('52 unbound historical log cannot enter the isolated PATH response', async f => {
  f.admit(); const input = f.input(), sid = f.submit(input), m = JSON.parse(f.store.row(sid).manifest);
  f.google.canonical.rawUpload(m.binding, input.encoded);
  await rejectAsync(() => read(f), /Unbound/);
});
for (const event of ['teacher.comment', 'teacher.review', 'target.assign', 'target.change', 'badge.award', 'badge.change',
  'session.target', 'group.change', 'permission.change']) test('53-' + event + ' commits only its declared revision facets after authenticated proof', async f => {
  f.admit(); const before = f.store.facets(), request = f.operation(event);
  const result = await f.pipe.change(f.owner, f.selection, request); assert.equal(result.duplicate, false);
  const after = f.store.facets();
  for (const facet of Object.keys(before)) assert.equal(after[facet] - before[facet], C.eventFacets[event].includes(facet) ? 1 : 0);
  assert.equal((await read(f)).data.teacher[event], 'synthetic-value');
});
test('54 DIRTY teacher operation blocks reads and recording dispatch until reconciliation', async f => {
  f.admit(); const request = f.operation('teacher.comment'), sid = f.submit();
  f.store.begin(f.owner, f.selection, request);
  await rejectAsync(() => read(f), /DIRTY/); await rejectAsync(() => f.pipe.dispatch(sid), /DIRTY/);
  assert.equal(f.google.stats().writerCalls, 0);
});
test('55 lost teacher response reconciles from source proof after reopening', async f => {
  f.admit(); const request = f.operation('teacher.comment');
  await rejectAsync(() => f.pipe.change(f.owner, f.selection, request, {afterGoogle: () => { throw Error('lost reply'); }}), /lost/);
  f.reopen(); reject(() => f.store.version(), /DIRTY/);
  assert.equal(f.pipe.reconcileChange(request.operation).duplicate, false);
  assert.equal((await read(f)).data.teacher['teacher.comment'], 'synthetic-value');
  assert.equal(f.google.stats().operations, 1);
});
test('56 duplicate teacher operation cannot repeat a side effect or revision bump', async f => {
  f.admit(); const request = f.operation('target.assign'); await f.pipe.change(f.owner, f.selection, request);
  const version = f.store.version(); assert.equal((await f.pipe.change(f.owner, f.selection, request)).duplicate, true);
  assert.equal(f.store.version(), version); assert.equal(f.google.stats().operations, 1);
  await rejectAsync(() => f.pipe.change(f.owner, f.selection, {...request, value: 'changed'}), /conflict/);
});
test('57 stale revision and nested resource-selector operations cannot modify source', async f => {
  f.admit(); const request = f.operation('badge.award'); f.admit();
  await rejectAsync(() => f.pipe.change(f.owner, f.selection, request), /Stale/);
  await rejectAsync(() => f.pipe.change(f.owner, f.selection, {...f.operation('badge.award'), value: {workbook: 'synthetic-other'}}), /Invalid/);
  assert.equal(f.google.stats().operations, 0);
});
test('58 wrong operation source proof cannot clear DIRTY', f => {
  f.admit(); const request = f.operation('teacher.review'); f.store.begin(f.owner, f.selection, request);
  const wrong = C.signed(google.privateKey, 'operation-receipt', {operation: request.operation,
    requestDigest: 'a'.repeat(64), environment: f.selection.environment, profileDigest: f.store.fingerprint, sourceDigest: 'b'.repeat(64)});
  reject(() => f.store.finishOperation(f.worker, request.operation, wrong), /proof/);
  reject(() => f.store.version(), /DIRTY/);
});
test('59 read response is discarded when a target revision changes mid-read', async f => {
  f.admit(); await rejectAsync(() => read(f, 'path.read', {}, {afterRead: () => f.pipe.change(f.owner, f.selection,
    f.operation('target.change'))}), /revision changed/);
});
test('60 recording confirmation invalidates sessions, totals, availability and GROUP once', async f => {
  f.admit(); const before = f.store.facets(), sid = f.submit(); await f.pipe.dispatch(sid);
  const after = f.store.facets();
  for (const facet of Object.keys(before)) assert.equal(after[facet] - before[facet], ['sessions','totals','availability','group'].includes(facet) ? 1 : 0);
});
test('61 paused/short media cannot qualify through rounded five-minute display totals', async f => {
  f.admit(); const sid = f.submit(f.input(299.9)); await f.pipe.dispatch(sid);
  const path = (await read(f)).data;
  assert.equal(path.sessions[0].minutes, 5); assert.equal(path.sessions[0].qualifying, false);
  assert.equal(path.group.qualifyingSessions, 0);
});
test('62 exact five-minute validated media still qualifies', async f => {
  f.admit(); const sid = f.submit(f.input(300)); await f.pipe.dispatch(sid);
  const path = (await read(f)).data; assert.equal(path.sessions[0].qualifying, true);
  assert.equal(path.qualifyingSessions, 1); assert.equal(path.group.qualifyingSessions, 1);
});
test('63 expired Google service request is rejected before canonical side effects', async f => {
  f.admit(); const sid = f.submit(), permit = f.store.claim(f.worker, sid); f.advance(30000);
  await rejectAsync(() => f.google.dispatch(f.caller, permit, f.input().encoded), /Expired/);
  assert.equal(f.google.stats().writerCalls, 0);
});
test('63-other-pupil-and-organisation are denied access to an actually saved Dummy recording', async f => {
  f.admit(); const sid = f.submit(); await f.pipe.dispatch(sid);
  for (const selection of [{...f.selection, pupil: 'synthetic-other-pupil'}, {...f.selection, organisation: 'OTHER'},
    {...f.selection, environment: 'fixture-other'}]) {
    await rejectAsync(() => f.pipe.read(f.owner, selection, 'playback.read', {sessionId: sid}), /selection/);
    reject(() => f.store.status(f.owner, selection, sid), /selection/);
  }
  await rejectAsync(() => f.pipe.read(f.identities.actor('synthetic-other-actor'), f.selection,
    'playback.read', {sessionId: sid}), /Owner/);
});
test('63-encrypted-staging-corruption fails authentication without creating Google audio', async f => {
  f.admit(); const sid = f.submit(), r = f.store.row(sid), cipher = Buffer.from(r.cipher); cipher[0] ^= 1;
  f.store.db.prepare('UPDATE recordings SET cipher=? WHERE session=?').run(cipher, sid);
  await rejectAsync(() => f.pipe.dispatch(sid), /authenticate/);
  assert.equal(f.google.stats().writerCalls, 0); assert.equal(f.status(sid).saved, false);
  await rejectAsync(() => read(f), /DIRTY/);
});
test('63-revocation-at-transaction-boundary cannot commit a newly admitted recording', f => {
  f.admit();
  const other = openStore(f.config), originalExec = f.store.db.exec.bind(f.store.db);
  let injected = false;
  f.store.db.exec = sql => {
    if (sql === 'BEGIN IMMEDIATE' && !injected) {
      injected = true;
      other.changeAdmission(f.owner, f.selection, {action: 'revoke', expectedRevision: other.admission().revision,
        expires: f.config.now(), operations: []});
    }
    return originalExec(sql);
  };
  try {
    reject(() => f.submit(), /revoked/);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM recordings').get().n, 0);
    assert.equal(other.admission().status, 'revoked');
  } finally { f.store.db.exec = originalExec; other.close(); }
});
test('63-teacher-in-flight-revocation commits internal proof while all public reads remain denied', async f => {
  f.admit(); const request = f.operation('teacher.comment');
  await f.pipe.change(f.owner, f.selection, request, {afterGoogle: () => f.revoke()});
  assert.equal(f.google.stats().operations, 1); assert.equal(f.store.facets().comments, 1);
  assert.equal(f.store.facets().access, 2); assert.equal(typeof f.store.version(), 'string');
  await rejectAsync(() => read(f), /revoked/);
});
test('63-rebound-signed-read-proof-is-discarded instead of returning a foreign view', async f => {
  f.admit(); const originalRead = f.google.read;
  f.google.read = (...args) => {
    const body = C.checked(google.publicKey, 'view-receipt', originalRead(...args));
    body.requestDigest = 'f'.repeat(64);
    return C.signed(google.privateKey, 'view-receipt', body);
  };
  await rejectAsync(() => read(f), /Foreign read receipt/);
});
test('64 no HTTP or socket operation occurred in this fixture suite', () => assert.equal(networkCalls, 0));

// An unfinished async case must never look like an exit-zero successful suite.
process.exitCode = 1;
(async () => {
  let passed = 0, failed = 0;
  for (const {name, run} of cases) {
    let f;
    try { f = fixture(); await run(f); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
    finally {
      if (f) { const directory = f.directory; f.close(); assert.equal(fs.existsSync(directory), false); }
    }
  }
  console.log(JSON.stringify({suite: 'option-c-stage-1-local-fixtures', passed, failed, skipped: 0,
    networkCalls, disposableDirectoriesRemoved: passed + failed}));
  process.exitCode = failed ? 1 : 0;
})();
