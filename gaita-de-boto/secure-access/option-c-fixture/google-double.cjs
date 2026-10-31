'use strict';
// Durable LOCAL fake Google service. The ONLY audio creation delegates to the
// unchanged canonical Apps Script VM and its existing ScriptLock. No network.
const {createPublicKey} = require('node:crypto');
const {canonicalFixture} = require('../queue-fixture/canonical-fixture.cjs');
const {inspectSnapshot} = require('../integration-fixture/receipt.cjs');
const {openFixtureDatabase, transaction} = require('./store.cjs');
const C = require('./contracts.cjs');

function googleDouble(config) {
  const {profile, fingerprint} = C.profileContract(config);
  const {identities, ownerSubject, callerSubject, googlePrivateKey, gatewayPublicKey, now = Date.now} = config;
  const db = openFixtureDatabase(config.directory, 'google.sqlite');
  db.exec(`CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS intents(session TEXT PRIMARY KEY, manifest TEXT NOT NULL, manifest_hash TEXT NOT NULL,
      state TEXT NOT NULL, fence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY, data TEXT NOT NULL, writer_calls INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS changes(operation TEXT PRIMARY KEY, request TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model(event TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const keyFingerprint = C.digest({profile, ownerSubject, callerSubject, gatewayPublicKey,
    receiptKey: createPublicKey(googlePrivateKey).export({type: 'spki', format: 'pem'})});
  const previous = db.prepare('SELECT fingerprint FROM config').get();
  if (previous && previous.fingerprint !== keyFingerprint) { db.close(); C.fail('Google fixture configuration mismatch.'); }
  db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(keyFingerprint);
  const canonical = canonicalFixture({fixtureOnly: true, authorize: () => true});
  const saved = db.prepare('SELECT * FROM snapshots').get();
  let writerCalls = saved?.writer_calls || 0;
  if (saved) {
    const state = JSON.parse(saved.data);
    for (const [name, rows] of Object.entries(state.tables)) canonical.tables[name] = rows;
    for (const file of state.files) canonical.files.set(file.url, {name: file.name, mime: file.mime,
      folder: file.folder, input: Buffer.from(file.base64, 'base64')});
  }
  function persist() {
    const state = {tables: canonical.tables, files: [...canonical.files].map(([url, file]) => ({url,
      name: file.name, mime: file.mime, folder: file.folder, base64: file.input.toString('base64')}))};
    db.prepare('INSERT INTO snapshots VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,writer_calls=excluded.writer_calls')
      .run(JSON.stringify(state), writerCalls);
  }
  function caller(identity) {
    if (!identities.isCaller(identity) || identity.subject !== callerSubject || identity.subject === ownerSubject) C.fail('Approved Google caller required; not Owner authority.');
  }
  function original(actor) {
    if (!C.exact(actor, ['issuer', 'subject', 'scope']) || actor.subject !== ownerSubject ||
        actor.scope !== 'google:fixture' || actor.issuer !== 'https://accounts.google.com') C.fail('Original Owner actor proof rejected.');
  }
  function accept(identity, purpose, envelope) {
    caller(identity); const body = C.checked(gatewayPublicKey, purpose, envelope);
    if (!C.uuid(body.nonce) || !Number.isSafeInteger(body.at) || !Number.isSafeInteger(body.expires) ||
        body.at > now() || body.expires <= now() || body.expires - body.at > 30000) C.fail('Expired or invalid service request.');
    db.prepare('INSERT INTO nonces VALUES(?)').run(body.nonce);
    return body;
  }
  function snapshot(manifest) {
    const b = manifest.binding, intent = db.prepare('SELECT * FROM intents WHERE session=?').get(b.sessionId);
    const logs = canonical.tables['PRACTICE LOG'].slice(1).filter(r => String(r[7]) === b.sessionId).map(r => Array.from(r));
    const urls = new Set(logs.map(r => String(r[6])));
    return {organisation: profile.organisation, pupil: profile.pupil,
      manifest: intent ? {binding: JSON.parse(intent.manifest).binding, state: intent.state} : null,
      logs, metas: canonical.tables['SESSION META'].slice(1).filter(r => String(r[6]) === b.sessionId || urls.has(String(r[0]))).map(r => Array.from(r)),
      journal: (canonical.tables['RECORDING RECEIPTS'] || []).slice(1).filter(r => String(r[0]) === b.sessionId).map(r => Array.from(r)),
      sessionFiles: [...canonical.files].filter(([url, f]) => urls.has(url) || f.name.startsWith(b.sessionId + '.')).map(([url, f]) => ({
        id: url.match(/\/file\/d\/([^/]+)/)?.[1], folder: f.folder, private: true, mime: f.mime, bytes: Buffer.from(f.input)})),
      qualifyMinutes: 5};
  }
  function inspect(manifest) {
    C.validateManifest(manifest, profile, fingerprint, ownerSubject);
    const old = db.prepare('SELECT * FROM intents WHERE session=?').get(manifest.binding.sessionId);
    if (old && old.manifest_hash !== C.digest(manifest)) C.fail('Original Google manifest conflict.');
    const receipt = inspectSnapshot(manifest.binding, snapshot(manifest), {folder: profile.folder,
      mediaSeconds: (audio, mime) => canonical.context.gdbPMediaSeconds_(Array.from(audio), mime)});
    if (!receipt.saved) return {state: receipt.state, retrySafe: receipt.retrySafe, receipt: null};
    return {state: 'saved', retrySafe: false, receipt: C.signed(googlePrivateKey, 'recording-receipt', {
      environment: profile.environment, profileDigest: fingerprint, manifestHash: C.digest(manifest),
      binding: receipt.binding, canonical: receipt.canonical, qualification: receipt.qualification, saved: true})};
  }
  async function dispatch(identity, envelope, encoded) {
    const body = accept(identity, 'dispatch', envelope);
    if (!C.exact(body, ['nonce', 'at', 'expires', 'fence', 'currentAdmissionRevision', 'manifest', 'manifestHash']) ||
        !Number.isSafeInteger(body.fence) || body.fence < 1 || !Number.isSafeInteger(body.currentAdmissionRevision) ||
        body.currentAdmissionRevision < 1 || C.digest(body.manifest) !== body.manifestHash) C.fail('Dispatch contract rejected.');
    const m = C.validateManifest(body.manifest, profile, fingerprint, ownerSubject);
    const old = db.prepare('SELECT * FROM intents WHERE session=?').get(m.binding.sessionId);
    if (old && (old.manifest_hash !== body.manifestHash || body.fence < old.fence)) C.fail('Immutable manifest or stale fence rejected.');
    const before = inspect(m);
    if (before.receipt) return before;
    if (before.state !== 'absent' || before.retrySafe !== true) return before;
    // Persist intent BEFORE using the original lock-taking writer. No outer writer lock.
    transaction(db, () => {
      db.prepare("INSERT INTO intents VALUES(?,?,?,'accepted',?) ON CONFLICT(session) DO UPDATE SET fence=excluded.fence")
        .run(m.binding.sessionId, C.canonical(m), body.manifestHash, body.fence);
      db.prepare("UPDATE intents SET state='dispatched' WHERE session=?").run(m.binding.sessionId);
    });
    writerCalls++;
    try { await canonical.writer.upload(m.binding, encoded); }
    finally { persist(); } // Also capture synthetic partial writes and lost acknowledgements.
    return inspect(m);
  }
  function inspectRequest(identity, envelope) {
    const b = accept(identity, 'inspect', envelope);
    if (!C.exact(b, ['nonce', 'at', 'expires', 'manifest'])) C.fail('Inspection contract rejected.');
    return inspect(b.manifest); // Does NOT call legacy read-repair helpers.
  }
  function applyOperation(identity, envelope) {
    const b = accept(identity, 'operation', envelope);
    if (!C.exact(b, ['nonce', 'at', 'expires', 'request'])) C.fail('Operation contract rejected.');
    const q = b.request;
    if (!C.exact(q, ['operation', 'event', 'expectedVersion', 'value', 'originalActor', 'profileDigest', 'environment']) ||
        !C.uuid(q.operation) || !C.operations.includes(q.event) || !Object.hasOwn(C.eventFacets, q.event) ||
        typeof q.value !== 'string' || q.value.length > 500 || q.environment !== profile.environment || q.profileDigest !== fingerprint) C.fail('Isolated teacher operation rejected.');
    original(q.originalActor);
    const old = db.prepare('SELECT request FROM changes WHERE operation=?').get(q.operation);
    if (old && old.request !== C.canonical(q)) C.fail('Original teacher operation conflict.');
    transaction(db, () => {
      if (!old) {
        db.prepare('INSERT INTO changes VALUES(?,?)').run(q.operation, C.canonical(q));
        db.prepare('INSERT INTO model VALUES(?,?) ON CONFLICT(event) DO UPDATE SET value=excluded.value').run(q.event, q.value);
      }
    });
    return operationProof(q.operation);
  }
  function operationProof(operation) {
    const old = db.prepare('SELECT request FROM changes WHERE operation=?').get(operation);
    if (!old) return null;
    return C.signed(googlePrivateKey, 'operation-receipt', {operation,
      requestDigest: C.digest(JSON.parse(old.request)), environment: profile.environment,
      profileDigest: fingerprint, sourceDigest: C.digest(db.prepare('SELECT * FROM model ORDER BY event').all())});
  }
  function inspectOperation(identity, envelope) {
    const b = accept(identity, 'inspect-operation', envelope);
    if (!C.exact(b, ['nonce', 'at', 'expires', 'operation'])) C.fail('Operation inspection rejected.');
    return operationProof(b.operation);
  }
  function read(identity, envelope) {
    const b = accept(identity, 'read', envelope);
    if (!C.exact(b, ['nonce', 'at', 'expires', 'environment', 'profileDigest', 'originalActor', 'operation', 'sessionId']) ||
        b.environment !== profile.environment || b.profileDigest !== fingerprint ||
        !['path.read', 'playback.read'].includes(b.operation)) C.fail('Read namespace rejected.');
    original(b.originalActor);
    let data;
    const logs = canonical.tables['PRACTICE LOG'].slice(1).filter(r => r[0] === profile.pupil);
    function verifiedSession(sid) {
      const intent = db.prepare('SELECT manifest FROM intents WHERE session=?').get(sid);
      if (!intent) C.fail('Unbound original recording; protected read denied.');
      const manifest = JSON.parse(intent.manifest);
      original(manifest.originalActor);
      if (!inspect(manifest).receipt) C.fail('Incomplete canonical recording; protected read denied.');
    }
    if (b.operation === 'playback.read') {
      if (!C.uuid(b.sessionId)) C.fail('Original playback Session ID required.');
      verifiedSession(b.sessionId);
      const rows = logs.filter(r => r[7] === b.sessionId), f = rows.length === 1 && canonical.files.get(rows[0][6]);
      if (!f || f.folder !== profile.folder || !/^audio\//.test(f.mime) || f.input.length > 5 * 1024 * 1024) C.fail('Protected playback denied.');
      data = {sessionId: b.sessionId, hash: C.hash(f.input), mimeType: f.mime, audioBase64: f.input.toString('base64')};
    } else {
      if (b.sessionId !== null) C.fail('Path selector rejected.');
      for (const row of logs) verifiedSession(row[7]);
      data = {sessions: logs.map(r => ({sessionId: r[7], minutes: r[4], qualifying: r[5] === 'Yes'})),
        qualifyingSessions: logs.filter(r => r[5] === 'Yes').length,
        group: {qualifyingSessions: logs.filter(r => r[5] === 'Yes').length},
        teacher: Object.fromEntries(db.prepare('SELECT * FROM model ORDER BY event').all().map(r => [r.event, r.value]))};
    }
    return C.signed(googlePrivateKey, 'view-receipt', {environment: profile.environment, profileDigest: fingerprint,
      requestDigest: C.digest(b), data});
  }
  return {dispatch, inspectRequest, applyOperation, inspectOperation, read, canonical, db,
    mediaSeconds: (audio, mime) => canonical.context.gdbPMediaSeconds_(Array.from(audio), mime),
    snapshot, persist, stats: () => ({writerCalls, files: canonical.files.size,
      logRows: canonical.tables['PRACTICE LOG'].length - 1, operations: db.prepare('SELECT count(*) AS n FROM changes').get().n}),
    close() { persist(); db.close(); }};
}
module.exports = {googleDouble};
