'use strict';
const {randomUUID, randomBytes} = require('node:crypto');
const P = require('./protocol.cjs'), {C} = P;
function gateway(config) {
  P.optIn(config);
  const {store, identities, authority, ownerSubject, workerSubject, servicePublicKey, googlePublicKey,
    keys, now, enabled = () => false, serviceEnabled = () => false, windowStart, windowEnd, maxDispatches = 6} = config;
  const db = store.db, namespace = {environment: store.profile.environment, profileDigest: store.fingerprint};
  const worker = identities.worker(workerSubject);
  if (![windowStart, windowEnd, maxDispatches].every(Number.isSafeInteger) || windowEnd <= windowStart || maxDispatches < 1) C.fail('Bounded transport policy required.');
  P.configuration(db, 'gateway', {namespace, ownerSubject, servicePublicKey, googlePublicKey,
    readKey: C.hash(keys('read-staging')), windowStart, windowEnd, maxDispatches});
  P.replayTable(db);
  db.exec(`CREATE TABLE IF NOT EXISTS otr_deliveries(id TEXT PRIMARY KEY, invocation TEXT UNIQUE, session TEXT,
      permit TEXT, state TEXT, result_hash TEXT, acknowledgement TEXT);
    CREATE TABLE IF NOT EXISTS otr_policy(id INTEGER PRIMARY KEY, dispatched INTEGER);
    INSERT OR IGNORE INTO otr_policy VALUES(1,0);
    CREATE TABLE IF NOT EXISTS otr_reads(id TEXT PRIMARY KEY, handle_hash TEXT UNIQUE, actor TEXT,
      client_session TEXT, operation TEXT, session TEXT, admission_revision INTEGER, version TEXT,
      expires INTEGER, state TEXT, request TEXT, result_hash TEXT, acknowledgement TEXT, iv BLOB, cipher BLOB, tag BLOB);`);
  const delivery = id => db.prepare('SELECT * FROM otr_deliveries WHERE id=?').get(id);
  const readRow = id => db.prepare('SELECT * FROM otr_reads WHERE id=?').get(id);
  function boundPolicy() {
    if (enabled() !== true || now() < windowStart || now() >= windowEnd ||
        db.prepare('SELECT dispatched FROM otr_policy').get().dispatched >= maxDispatches) C.fail('Worker disabled, outside window or dispatch cap reached.');
  }
  function service(purpose, signed) {
    if (serviceEnabled() !== true) C.fail('Worker service credential revoked or disabled.');
    const b = P.check(servicePublicKey, purpose, signed, namespace, now, db, 'service');
    if (!C.exact(b.payload, ['execution','value']) || b.payload.execution !== ownerSubject) C.fail('Service execution binding denied.');
    return b;
  }
  function reply(purpose, request, value) {
    return P.envelope(keys('gateway-sign'), purpose + '-response', namespace, now, {replyTo: C.digest(request), value});
  }
  function original(record) {
    const m = C.validateManifest(JSON.parse(record.manifest), store.profile, store.fingerprint, ownerSubject);
    return identities.actor(m.originalActor.subject);
  }
  function claim(value) {
    if (!C.exact(value, ['invocation']) || !C.uuid(value.invocation)) C.fail('Single invocation required.');
    boundPolicy();
    const old = db.prepare('SELECT * FROM otr_deliveries WHERE invocation=?').get(value.invocation);
    if (old) return {state: old.state, deliveryId: old.id, permit: old.state === 'claimed' ? JSON.parse(old.permit) : null};
    store.version();
    if (db.prepare("SELECT 1 FROM recordings WHERE phase='accepted' AND lease_until>? LIMIT 1").get(now()))
      return {state: 'busy', deliveryId: null, permit: null};
    const r = db.prepare("SELECT * FROM recordings WHERE phase='accepted' ORDER BY rowid LIMIT 1").get();
    if (!r) return {state: 'idle', deliveryId: null, permit: null};
    store.authorize(original(r), store.profileSelection(), 'recording.submit');
    const permit = store.claim(worker, r.session), id = randomUUID();
    // A crash in this gap leaves only a leased, never-sent original intent.
    db.prepare("INSERT INTO otr_deliveries VALUES(?,?,?,?,'claimed',NULL,NULL)").run(id, value.invocation, r.session, C.canonical(permit));
    return {state: 'claimed', deliveryId: id, permit};
  }
  function arm(value) {
    if (!C.exact(value, ['deliveryId','permitDigest'])) C.fail('Dispatch binding required.');
    boundPolicy(); const d = delivery(value.deliveryId);
    if (!d || d.state !== 'claimed' || C.digest(JSON.parse(d.permit)) !== value.permitDigest) C.fail('Dispatch requires original claim or reconciliation.');
    const load = store.markSent(worker, JSON.parse(d.permit));
    P.transaction(db, () => {
      boundPolicy();
      db.prepare("UPDATE otr_deliveries SET state='sent' WHERE id=?").run(d.id);
      db.prepare('UPDATE otr_policy SET dispatched=dispatched+1 WHERE id=1').run();
    });
    return {deliveryId: d.id, permitDigest: value.permitDigest, audioBase64: load.audio.toString('base64')};
  }
  function outcome(value) {
    if (!C.exact(value, ['deliveryId','permitDigest','outcome']) ||
        !C.exact(value.outcome, ['state','receipt','reconciled']) || typeof value.outcome.reconciled !== 'boolean' ||
        !['saved','uncertain','attention','absent','unbound'].includes(value.outcome.state)) C.fail('Recording outcome contract rejected.');
    const d = delivery(value.deliveryId);
    if (!d || !['sent','uncertain','confirmed'].includes(d.state) || C.digest(JSON.parse(d.permit)) !== value.permitDigest) C.fail('Foreign recording outcome.');
    const hash = C.digest(value.outcome);
    if (d.result_hash === hash && d.acknowledgement) return {ack: d.acknowledgement, duplicate: true};
    if (d.state === 'confirmed') {
      // Reconciliation may label an identical exact receipt differently; it is still a no-op.
      if (value.outcome.state !== 'saved' || C.canonical(value.outcome.receipt) !==
          C.canonical(JSON.parse(store.row(d.session).receipt))) C.fail('Confirmed outcome conflict.');
      store.completeRecording(worker, d.session, value.outcome.receipt, value.outcome.reconciled);
      return {ack: d.acknowledgement, duplicate: true};
    }
    if (value.outcome.state === 'saved') {
      if (!value.outcome.receipt) C.fail('Exact receipt required.');
      store.completeRecording(worker, d.session, value.outcome.receipt, value.outcome.reconciled);
    } else {
      if (value.outcome.receipt !== null) C.fail('Uncertain result cannot contain a receipt.');
      store.uncertain(worker, d.session);
    }
    const ack = d.acknowledgement || randomBytes(32).toString('base64url');
    db.prepare('UPDATE otr_deliveries SET state=?,result_hash=?,acknowledgement=? WHERE id=?')
      .run(value.outcome.state === 'saved' ? 'confirmed' : 'uncertain', hash, ack, d.id);
    return {ack, duplicate: false};
  }
  function inspect(value) {
    if (!C.exact(value, ['deliveryId'])) C.fail('Original delivery required.');
    const d = delivery(value.deliveryId), r = d && store.row(d.session);
    if (!d || !r || !['sent','uncertain','confirmed','reconciled'].includes(r.phase)) C.fail('No dispatched original intent to inspect.');
    original(r);
    return {deliveryId: d.id, permitDigest: C.digest(JSON.parse(d.permit)), inspect:
      C.signed(keys('gateway-sign'), 'inspect', {nonce: randomUUID(), at: now(), expires: now() + 30000, manifest: JSON.parse(r.manifest)})};
  }
  function readAuthorise(row, actor, clientSession) {
    const originalActor = JSON.parse(row.actor);
    if (C.canonical(C.actorFields(actor)) !== C.canonical(originalActor)) C.fail('Foreign original read actor.');
    if (clientSession) authority.sessionCheck(clientSession, actor, row.client_session);
    const a = store.authorize(actor, store.profileSelection(), row.operation);
    if (a.revision !== row.admission_revision || store.version() !== row.version || row.expires <= now()) C.fail('Read admission, revision or deadline changed.');
  }
  function newRead(actor, selection, clientSession, operation, payload = {}) {
    store.select(selection); authority.sessionCheck(clientSession, actor);
    const a = store.authorize(actor, selection, operation);
    if (!['path.read','playback.read'].includes(operation) || !C.exact(payload, operation === 'path.read' ? [] : ['sessionId']) ||
        (operation === 'playback.read' && !C.uuid(payload.sessionId))) C.fail('Read selector rejected.');
    if (operation === 'playback.read') { const r = store.row(payload.sessionId); if (!r || original(r).subject !== actor.subject) C.fail('Foreign original read recording.'); }
    const handle = randomBytes(32).toString('base64url'), id = randomUUID();
    P.transaction(db, () => {
      const current = store.authorize(actor, selection, operation);
      if (current.revision !== a.revision) C.fail('Read admission changed.');
      db.prepare(`INSERT INTO otr_reads VALUES(?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL,NULL,NULL)`)
        .run(id, C.hash(handle), C.canonical(C.actorFields(actor)), clientSession.id, operation, payload.sessionId ?? null,
          current.revision, store.version(), now() + 30000);
    });
    return {readId: id, relay: {handle}};
  }
  function fetchRead(value) {
    if (!C.exact(value, ['handle']) || !/^[A-Za-z0-9_-]{43}$/.test(value.handle)) C.fail('One-use read handle required.');
    return P.transaction(db, () => {
      const r = db.prepare('SELECT * FROM otr_reads WHERE handle_hash=?').get(C.hash(value.handle));
      if (!r || r.state !== 'pending') C.fail('Read handle unknown, used or unavailable.');
      readAuthorise(r, identities.actor(JSON.parse(r.actor).subject));
      const inner = C.signed(keys('gateway-sign'), 'read', {nonce: randomUUID(), at: now(), expires: r.expires,
        ...namespace, originalActor: JSON.parse(r.actor), operation: r.operation, sessionId: r.session});
      const request = P.envelope(keys('gateway-sign'), 'owner.read.request', namespace, now,
        {readId: r.id, handleHash: r.handle_hash, admissionRevision: r.admission_revision, version: r.version, inner});
      db.prepare("UPDATE otr_reads SET state='dispatched',request=? WHERE id=?").run(C.canonical(request), r.id);
      return {request};
    });
  }
  function projection(row, data) {
    if (JSON.stringify(data).includes('drive.google.com')) C.fail('Raw Drive locator in protected projection.');
    function binding(sid) {
      const r = store.row(sid);
      if (!r || !['confirmed','reconciled'].includes(r.phase)) C.fail('Unconfirmed or foreign projection session.');
      const m = C.validateManifest(JSON.parse(r.manifest), store.profile, store.fingerprint, ownerSubject);
      return m.binding;
    }
    if (row.operation === 'playback.read') {
      const b = binding(row.session);
      if (!C.exact(data, ['sessionId','hash','mimeType','audioBase64']) || data.sessionId !== b.sessionId ||
          data.hash !== b.hash || data.mimeType !== b.mimeType || b.length > 5 * 1024 * 1024) C.fail('Playback binding rejected.');
      require('../queue-fixture/postgres.cjs').bytes(b, data.audioBase64);
    } else {
      if (!C.exact(data, ['sessions','qualifyingSessions','group','teacher']) || !Array.isArray(data.sessions) ||
          !C.exact(data.group, ['qualifyingSessions']) || !data.teacher || typeof data.teacher !== 'object' || Array.isArray(data.teacher)) C.fail('PATH projection rejected.');
      const expected = db.prepare("SELECT session FROM recordings WHERE phase IN ('confirmed','reconciled') ORDER BY session").all().map(r => r.session);
      if (C.canonical(data.sessions.map(s => s.sessionId).sort()) !== C.canonical(expected)) C.fail('Foreign, missing or duplicate PATH sessions.');
      for (const s of data.sessions) {
        const b = binding(s.sessionId);
        if (!C.exact(s, ['sessionId','minutes','qualifying']) || s.minutes !== Math.round(b.durationSeconds / 60 * 100) / 100 ||
            s.qualifying !== (b.durationSeconds >= 300)) C.fail('PATH qualification evidence rejected.');
      }
      const n = data.sessions.filter(s => s.qualifying).length;
      if (data.qualifyingSessions !== n || data.group.qualifyingSessions !== n || Object.entries(data.teacher)
        .some(([event,value]) => !C.operations.includes(event) || typeof value !== 'string' || value.length > 500)) C.fail('PATH dependency evidence rejected.');
    }
    return data;
  }
  function readCallback(value) {
    if (!C.exact(value, ['proof'])) C.fail('Read proof required.');
    const p = P.check(googlePublicKey, 'owner.read.result', value.proof, namespace, now);
    if (!C.exact(p.payload, ['readId','requestDigest','view'])) C.fail('Read response contract rejected.');
    const r = readRow(p.payload.readId);
    if (!r || !r.request || !['dispatched','ready','consumed'].includes(r.state)) C.fail('No original broker request.');
    const hash = C.digest(value.proof), request = P.check(config.gatewayPublicKey, 'owner.read.request', JSON.parse(r.request), namespace, now);
    if (p.payload.requestDigest !== C.digest(request)) C.fail('Read callback request mismatch.');
    if (r.result_hash) { if (r.result_hash !== hash) C.fail('Read callback conflict.'); return {ack: r.acknowledgement}; }
    const inner = C.checked(config.gatewayPublicKey, 'read', request.payload.inner);
    const view = C.checked(googlePublicKey, 'view-receipt', p.payload.view);
    if (!C.exact(view, ['environment','profileDigest','requestDigest','data']) || view.environment !== namespace.environment ||
        view.profileDigest !== namespace.profileDigest || view.requestDigest !== C.digest(inner)) C.fail('Foreign authenticated read result.');
    return P.transaction(db, () => {
      readAuthorise(r, identities.actor(JSON.parse(r.actor).subject)); projection(r, view.data);
      const encrypted = P.seal(keys('read-staging'), value.proof, r.id), ack = randomBytes(32).toString('base64url');
      db.prepare("UPDATE otr_reads SET state='ready',result_hash=?,acknowledgement=?,iv=?,cipher=?,tag=? WHERE id=?")
        .run(hash, ack, encrypted.iv, encrypted.cipher, encrypted.tag, r.id);
      return {ack};
    });
  }
  function release(actor, selection, clientSession, id) {
    store.select(selection); authority.sessionCheck(clientSession, actor);
    return P.transaction(db, () => {
      const r = readRow(id); if (!r || r.state !== 'ready') C.fail('Protected read unavailable; request a fresh read.');
      readAuthorise(r, actor, clientSession);
      const proof = P.unseal(keys('read-staging'), r, r.id);
      if (C.digest(proof) !== r.result_hash) C.fail('Read staging integrity failure.');
      const p = P.check(googlePublicKey, 'owner.read.result', proof, namespace, now);
      const view = C.checked(googlePublicKey, 'view-receipt', p.payload.view), data = projection(r, view.data);
      db.prepare("UPDATE otr_reads SET state='consumed',iv=NULL,cipher=NULL,tag=NULL WHERE id=?").run(id);
      return {headers: {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer'}, data};
    });
  }
  const routes = {
    '/fixtures/pull/claim': ['owner.pull.claim', claim], '/fixtures/pull/arm': ['owner.pull.arm', arm],
    '/fixtures/pull/result': ['owner.pull.result', outcome], '/fixtures/pull/inspect': ['owner.pull.inspect', inspect],
    '/fixtures/read/fetch': ['owner.read.fetch', fetchRead], '/fixtures/read/result': ['owner.read.callback', readCallback]
  };
  function route(path, signed) {
    const action = routes[path]; if (!action) C.fail('Unknown fixed transport action.');
    const request = service(action[0], signed), value = action[1](request.payload.value);
    return reply(action[0], request, value);
  }
  return {route, newRead, release, delivery, readRow, namespace, projection,
    dispatched: () => db.prepare('SELECT dispatched FROM otr_policy').get().dispatched};
}
module.exports = {gateway};
