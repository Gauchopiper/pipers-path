'use strict';
const {randomUUID} = require('node:crypto');
const C = require('./contracts.cjs');
function pipeline({store, google, identities, gatewayPrivateKey, googlePublicKey, now = Date.now, workerSubject, callerSubject}) {
  const worker = identities.worker(workerSubject), caller = identities.caller(callerSubject);
  const message = (purpose, payload) => C.signed(gatewayPrivateKey, purpose,
    {nonce: randomUUID(), at: now(), expires: now() + 30000, ...payload});
  function submit(actor, selection, recording, audioBase64) {
    return store.submission(actor, selection, recording, audioBase64, google.mediaSeconds);
  }
  async function dispatch(sid, {afterSent} = {}) {
    const permit = store.claim(worker, sid), load = store.markSent(worker, permit);
    // The dispatch barrier has committed. Later revocation cannot unsend this request.
    if (afterSent) await afterSent();
    try {
      const result = await google.dispatch(caller, permit, load.audio.toString('base64'));
      if (!result.receipt) { store.uncertain(worker, sid); return {saved: false, retainLocalAudio: true, state: result.state}; }
      store.completeRecording(worker, sid, result.receipt);
      return {canonicalConfirmed: true}; // INTERNAL: never a pupil UI acknowledgement.
    } catch (error) {
      store.uncertain(worker, sid);
      return {saved: false, retainLocalAudio: true, state: 'uncertain', reason: error.message};
    }
  }
  function reconcile(sid) {
    const record = store.row(sid); if (!record) C.fail('Unknown original session.');
    const result = google.inspectRequest(caller, message('inspect', {manifest: JSON.parse(record.manifest)}));
    if (!result.receipt) return {saved: false, retainLocalAudio: true, state: result.state};
    store.completeRecording(worker, sid, result.receipt, true);
    return {canonicalConfirmed: true}; // Current admission is still required by status().
  }
  async function change(actor, selection, request, {afterGoogle} = {}) {
    const begun = store.begin(actor, selection, request);
    if (begun.state === 'complete') return {duplicate: true};
    const proof = google.applyOperation(caller, message('operation', {request: begun.request}));
    if (afterGoogle) await afterGoogle();
    return store.finishOperation(worker, request.operation, proof);
  }
  function reconcileChange(operation) {
    const proof = google.inspectOperation(caller, message('inspect-operation', {operation}));
    if (!proof) C.fail('Operation source remains uncertain.');
    return store.finishOperation(worker, operation, proof);
  }
  async function read(actor, selection, operation, payload = {}, {afterRead} = {}) {
    store.authorize(actor, selection, operation);
    if (!['path.read', 'playback.read'].includes(operation) ||
        !C.exact(payload, operation === 'playback.read' ? ['sessionId'] : [])) C.fail('Read selector rejected.');
    const before = store.version();
    const body = {environment: store.profile.environment, profileDigest: store.fingerprint,
      originalActor: C.actorFields(actor), operation, sessionId: payload.sessionId ?? null};
    const request = message('read', body);
    const receipt = google.read(caller, request);
    if (afterRead) await afterRead();
    const value = C.checked(googlePublicKey, 'view-receipt', receipt);
    const original = C.checked(require('node:crypto').createPublicKey(gatewayPrivateKey), 'read', request);
    if (!C.exact(value, ['environment', 'profileDigest', 'requestDigest', 'data']) || value.environment !== store.profile.environment ||
        value.profileDigest !== store.fingerprint || value.requestDigest !== C.digest(original)) C.fail('Foreign read receipt.');
    store.authorize(actor, selection, operation);
    if (store.version() !== before) C.fail('Authoritative revision changed during read.');
    return {headers: {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}, data: value.data};
  }
  return {submit, dispatch, reconcile, change, reconcileChange, read, message};
}
module.exports = {pipeline};
