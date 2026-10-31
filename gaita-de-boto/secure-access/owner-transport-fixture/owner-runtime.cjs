'use strict';
const {randomUUID, randomBytes} = require('node:crypto');
const P = require('./protocol.cjs'), {C} = P;
function ownerRuntime(config) {
  P.optIn(config);
  const {google, identities, authority, ownerSubject, callerSubject, keys, now, transport,
    enabled = () => false, recoveryEnabled = () => false, windowStart, windowEnd, gatewayPublicKey} = config;
  const {profile, fingerprint} = C.profileContract(config), db = google.db;
  const namespace = {environment: profile.environment, profileDigest: fingerprint};
  const caller = identities.caller(callerSubject); // Role alias, not an original actor.
  P.configuration(db, 'owner-runtime', {namespace, ownerSubject, callerSubject,
    gatewayPublicKey, service: config.servicePublicKey, windowStart, windowEnd});
  P.replayTable(db);
  db.exec(`CREATE TABLE IF NOT EXISTS otr_worker_jobs(id TEXT PRIMARY KEY, permit TEXT NOT NULL, outcome TEXT);
    CREATE TABLE IF NOT EXISTS otr_read_outbox(id TEXT PRIMARY KEY, proof TEXT NOT NULL);`);
  function execution(context, mode, recovery = false) {
    authority.executionCheck(context, ownerSubject, mode);
    if (recovery) { if (recoveryEnabled() !== true) C.fail('Manual recovery disabled.'); }
    else if (enabled() !== true || now() < windowStart || now() >= windowEnd) C.fail('Owner worker disabled or outside approved window.');
  }
  function request(context, mode, purpose, value, recovery = false) {
    execution(context, mode, recovery);
    return P.envelope(keys('service-sign'), purpose, namespace, now, {execution: context.effectiveSubject, value});
  }
  function accept(purpose, signed, request) {
    const b = P.check(keys('gateway-verify'), purpose + '-response', signed, namespace, now, db, 'gateway-response');
    const original = C.checked(config.servicePublicKey, purpose, request);
    if (!C.exact(b.payload, ['replyTo','value']) || b.payload.replyTo !== C.digest(original)) C.fail('Response request binding rejected.');
    return b.payload.value;
  }
  async function send(context, mode, path, purpose, value, recovery = false) {
    const signed = request(context, mode, purpose, value, recovery);
    P.noTransaction(config.store.db, db);
    const response = await transport.request({url: P.ORIGIN + path, method: 'POST',
      headers: {'Content-Type':'application/json'}, body: C.canonical(signed)});
    return accept(purpose, response, signed);
  }
  function permit(value) {
    const b = C.checked(keys('gateway-verify'), 'dispatch', value);
    if (!C.exact(b, ['nonce','at','expires','fence','currentAdmissionRevision','manifest','manifestHash'])) C.fail('Dispatch permit shape rejected.');
    P.fresh(b, now);
    C.validateManifest(b.manifest, profile, fingerprint, ownerSubject);
    if (C.digest(b.manifest) !== b.manifestHash || !Number.isSafeInteger(b.fence) || b.fence < 1 ||
        !Number.isSafeInteger(b.currentAdmissionRevision) || b.currentAdmissionRevision < b.manifest.authorisationRevision) C.fail('Dispatch immutable evidence rejected.');
    return b;
  }
  async function acknowledge(context, id) {
    const job = db.prepare('SELECT * FROM otr_worker_jobs WHERE id=?').get(id);
    if (!job?.outcome) C.fail('No durable outcome; inspect original intent.');
    const value = await send(context, 'write', '/fixtures/pull/result', 'owner.pull.result',
      {deliveryId: id, permitDigest: C.digest(JSON.parse(job.permit)), outcome: JSON.parse(job.outcome)}, true);
    if (!C.exact(value, ['ack','duplicate']) || !/^[A-Za-z0-9_-]{43}$/.test(value.ack)) C.fail('Opaque recording acknowledgement required.');
    return {ack: value.ack};
  }
  async function runOnce(context, {invocation = randomUUID(), afterClaim, afterArm, afterGoogle} = {}) {
    const offer = await send(context, 'write', '/fixtures/pull/claim', 'owner.pull.claim', {invocation});
    if (!C.exact(offer, ['state','deliveryId','permit'])) C.fail('Single-job offer required.');
    if (['idle','busy','sent','uncertain','confirmed'].includes(offer.state) && offer.permit === null)
      return {state: offer.state};
    if (offer.state !== 'claimed' || !C.uuid(offer.deliveryId)) C.fail('Original claim rejected.');
    const b = permit(offer.permit);
    db.prepare('INSERT OR IGNORE INTO otr_worker_jobs VALUES(?,?,NULL)').run(offer.deliveryId, C.canonical(offer.permit));
    const old = db.prepare('SELECT permit FROM otr_worker_jobs WHERE id=?').get(offer.deliveryId);
    if (old.permit !== C.canonical(offer.permit)) C.fail('Original worker intent conflict.');
    if (afterClaim) await afterClaim(offer);
    execution(context, 'write'); keys('google-sign'); // Fail before dispatch if attestation custody is unavailable.
    const armed = await send(context, 'write', '/fixtures/pull/arm', 'owner.pull.arm',
      {deliveryId: offer.deliveryId, permitDigest: C.digest(offer.permit)});
    if (!C.exact(armed, ['deliveryId','permitDigest','audioBase64']) || armed.deliveryId !== offer.deliveryId ||
        armed.permitDigest !== C.digest(offer.permit)) C.fail('Armed audio response binding rejected.');
    const audio = require('../queue-fixture/postgres.cjs').bytes(b.manifest.binding, armed.audioBase64);
    if (google.mediaSeconds(audio, b.manifest.binding.mimeType).seconds !== b.manifest.binding.durationSeconds) C.fail('Original audio sample evidence mismatch.');
    if (afterArm) await afterArm(offer);
    execution(context, 'write'); permit(offer.permit);
    P.noTransaction(config.store.db, db);
    let outcome;
    try {
      const result = await google.dispatch(caller, offer.permit, armed.audioBase64);
      outcome = {state: result.state, receipt: result.receipt, reconciled: false};
    } catch {
      outcome = {state: 'uncertain', receipt: null, reconciled: false};
    }
    // This hook models a process interruption AFTER source completion, before outbox persistence.
    if (afterGoogle) await afterGoogle(offer, outcome);
    db.prepare('UPDATE otr_worker_jobs SET outcome=? WHERE id=?').run(C.canonical(outcome), offer.deliveryId);
    return {deliveryId: offer.deliveryId, ...await acknowledge(context, offer.deliveryId)};
  }
  async function reconcile(context, id) {
    const result = await send(context, 'write', '/fixtures/pull/inspect', 'owner.pull.inspect', {deliveryId: id}, true);
    if (!C.exact(result, ['deliveryId','permitDigest','inspect']) || result.deliveryId !== id) C.fail('Inspection binding rejected.');
    const job = db.prepare('SELECT * FROM otr_worker_jobs WHERE id=?').get(id);
    if (!job || result.permitDigest !== C.digest(JSON.parse(job.permit))) C.fail('Unknown original worker intent.');
    const body = C.checked(keys('gateway-verify'), 'inspect', result.inspect); P.fresh(body, now);
    const original = C.checked(gatewayPublicKey, 'dispatch', JSON.parse(job.permit));
    if (C.canonical(body.manifest) !== C.canonical(original.manifest)) C.fail('Inspection original identity conflict.');
    execution(context, 'write', true); keys('google-sign');
    P.noTransaction(config.store.db, db);
    const inspected = google.inspectRequest(caller, result.inspect);
    db.prepare('UPDATE otr_worker_jobs SET outcome=? WHERE id=?').run(C.canonical({state: inspected.state,
      receipt: inspected.receipt, reconciled: true}), id);
    return acknowledge(context, id); // Inspection only; never invokes the audio writer.
  }
  async function retryReadCallback(context, id) {
    const outbox = db.prepare('SELECT proof FROM otr_read_outbox WHERE id=?').get(id);
    if (!outbox) C.fail('No original read callback evidence.');
    const response = await send(context, 'read', '/fixtures/read/result', 'owner.read.callback', {proof: JSON.parse(outbox.proof)}, true);
    if (!C.exact(response, ['ack']) || !/^[A-Za-z0-9_-]{43}$/.test(response.ack)) C.fail('Opaque read acknowledgement required.');
    return response;
  }
  async function broker(context, relay, {afterSource, afterCallback} = {}) {
    try {
      if (!C.exact(relay, ['handle']) || !/^[A-Za-z0-9_-]{43}$/.test(relay.handle)) C.fail('Opaque relay handle required.');
      const received = await send(context, 'read', '/fixtures/read/fetch', 'owner.read.fetch', relay);
      if (!C.exact(received, ['request'])) C.fail('Signed read request required.');
      const outer = P.check(keys('gateway-verify'), 'owner.read.request', received.request, namespace, now, db, 'read-request');
      const q = outer.payload;
      if (!C.exact(q, ['readId','handleHash','admissionRevision','version','inner']) || !C.uuid(q.readId) ||
          q.handleHash !== C.hash(relay.handle) || !Number.isSafeInteger(q.admissionRevision) || q.admissionRevision < 1 ||
          typeof q.version !== 'string') C.fail('Read handle binding rejected.');
      const inner = C.checked(keys('gateway-verify'), 'read', q.inner);
      P.fresh(inner, now);
      if (!C.exact(inner, ['nonce','at','expires','environment','profileDigest','originalActor','operation','sessionId']) ||
          inner.environment !== namespace.environment || inner.profileDigest !== namespace.profileDigest ||
          !C.exact(inner.originalActor, ['issuer','subject','scope']) || inner.originalActor.subject !== ownerSubject ||
          inner.originalActor.issuer !== 'https://accounts.google.com' || inner.originalActor.scope !== 'google:fixture' ||
          !['path.read','playback.read'].includes(inner.operation)) C.fail('Original read actor or namespace denied.');
      execution(context, 'read'); const signing = keys('google-sign');
      P.noTransaction(config.store.db, db);
      const view = google.read(caller, q.inner);
      if (afterSource) await afterSource(q.readId);
      const proof = P.envelope(signing, 'owner.read.result', namespace, now,
        {readId: q.readId, requestDigest: C.digest(outer), view});
      db.prepare('INSERT INTO otr_read_outbox VALUES(?,?)').run(q.readId, C.canonical(proof));
      const ack = await retryReadCallback(context, q.readId);
      if (afterCallback) await afterCallback(q.readId);
      return ack; // Browser receives only an opaque acknowledgement, never private evidence.
    } catch {
      throw Error('Protected read unavailable.'); // No source payload, URL or sensitive exception reaches the relay.
    }
  }
  return {runOnce, acknowledge, reconcile, broker, retryReadCallback,
    request, accept, permit, job: id => db.prepare('SELECT * FROM otr_worker_jobs WHERE id=?').get(id)};
}
function browserRelay({fixtureOnly = false, runtime, origin = P.UI}) {
  P.optIn({fixtureOnly}); if (origin !== P.UI) C.fail('Synthetic Owner UI origin required.');
  const transcript = [];
  return {transcript, async run(context, relay, hooks, actualOrigin = origin) {
    if (actualOrigin !== origin || !C.exact(relay, ['handle'])) C.fail('Browser relay origin or selector rejected.');
    transcript.push({request: structuredClone(relay)});
    try {
      const response = await runtime.broker(context, relay, hooks);
      if (!C.exact(response, ['ack'])) C.fail('Private data in relay response.');
      transcript.push({response}); return response;
    } catch { transcript.push({error: 'Protected read unavailable.'}); throw Error('Protected read unavailable.'); }
  }};
}
module.exports = {ownerRuntime, browserRelay};
