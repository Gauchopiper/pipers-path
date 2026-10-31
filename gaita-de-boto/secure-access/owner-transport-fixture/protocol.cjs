'use strict';
// No HTTP implementation, Google credential, listener or deployment entry point.
const {randomUUID, randomBytes, createCipheriv, createDecipheriv} = require('node:crypto');
const C = require('../option-c-fixture/contracts.cjs');
const {transaction} = require('../option-c-fixture/store.cjs');
const ORIGIN = 'https://synthetic-gateway.invalid';
const UI = 'https://synthetic-owner-ui.invalid';
const scope = Object.freeze({write: ['drive', 'sheets', 'email', 'external-request'], read: ['drive', 'sheets', 'email', 'external-request']});
function optIn(config) { if (config?.fixtureOnly !== true) C.fail('Fixture-only transport opt-in required.'); }
function authority({fixtureOnly = false} = {}) {
  optIn({fixtureOnly});
  const executions = new WeakSet(), deniedExecutions = new WeakSet(), sessions = new WeakSet(), revoked = new Set();
  return {
    execution(effectiveSubject, mode = 'manual', scopes = scope.write) {
      if (!C.fixtureId(effectiveSubject) || !['manual', 'trigger', 'owner-web'].includes(mode)) C.fail('Synthetic execution context required.');
      const value = Object.freeze({effectiveSubject, mode, scopes: Object.freeze([...scopes])}); executions.add(value); return value;
    },
    executionCheck(context, expectedOwner, mode) {
      if (!executions.has(context) || deniedExecutions.has(context) || context.effectiveSubject !== expectedOwner ||
          (mode === 'read' ? context.mode !== 'owner-web' : !['manual','trigger'].includes(context.mode)) ||
          scope[mode].some(s => !context.scopes.includes(s))) C.fail('Owner execution context or required capability denied.');
    },
    revokeExecution(context) { if (!executions.has(context)) C.fail('Unknown execution context.'); deniedExecutions.add(context); },
    session(actor) {
      const value = Object.freeze({id: randomUUID(), subject: actor.subject}); sessions.add(value); return value;
    },
    sessionCheck(session, actor, expected) {
      if (!sessions.has(session) || revoked.has(session.id) || session.subject !== actor.subject ||
          (expected && session.id !== expected)) C.fail('Authenticated requesting session denied.');
    },
    revokeSession(session) { if (!sessions.has(session)) C.fail('Unknown fixture session.'); revoked.add(session.id); }
  };
}
function envelope(key, purpose, namespace, now, payload) {
  return C.signed(key, purpose, {...namespace, nonce: randomUUID(), at: now(), expires: now() + 30000, payload});
}
function fresh(body, now) {
  if (!C.uuid(body.nonce) || !Number.isSafeInteger(body.at) || !Number.isSafeInteger(body.expires) ||
      body.at > now() || body.expires <= now() || body.expires - body.at > 30000) C.fail('Expired or invalid protocol envelope.');
}
function replayTable(db) {
  db.exec('CREATE TABLE IF NOT EXISTS otr_nonces(space TEXT, nonce TEXT, PRIMARY KEY(space,nonce))');
}
function consume(db, space, nonce) { db.prepare('INSERT INTO otr_nonces VALUES(?,?)').run(space, nonce); }
function check(key, purpose, value, namespace, now, db, space) {
  const body = C.checked(key, purpose, value);
  if (!C.exact(body, ['environment','profileDigest','nonce','at','expires','payload']) ||
      body.environment !== namespace.environment || body.profileDigest !== namespace.profileDigest) C.fail('Foreign protocol namespace.');
  fresh(body, now);
  if (db) consume(db, space, body.nonce);
  return body;
}
function configuration(db, name, value) {
  db.exec('CREATE TABLE IF NOT EXISTS otr_configuration(name TEXT PRIMARY KEY, fingerprint TEXT)');
  const fingerprint = C.digest(value), old = db.prepare('SELECT fingerprint FROM otr_configuration WHERE name=?').get(name);
  if (old && old.fingerprint !== fingerprint) C.fail('Transport configuration/key mismatch; state retained.');
  db.prepare('INSERT OR IGNORE INTO otr_configuration VALUES(?,?)').run(name, fingerprint);
}
function seal(key, value, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) C.fail('Read staging key unavailable.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(aad));
  return {iv, cipher: Buffer.concat([cipher.update(Buffer.from(C.canonical(value))), cipher.final()]), tag: cipher.getAuthTag()};
}
function unseal(key, row, aad) {
  if (!Buffer.isBuffer(key) || key.length !== 32) C.fail('Read staging key unavailable.');
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv));
  cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(Buffer.from(row.tag));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(row.cipher)), cipher.final()]).toString());
}
function noTransaction(...databases) {
  if (databases.some(db => db.isTransaction)) C.fail('Remote operation inside an open database transaction.');
}
function mockHttps({fixtureOnly = false, route, before = () => {}}) {
  optIn({fixtureOnly}); let available = true, fault = null;
  const calls = [];
  return {
    calls,
    setAvailable(value) { available = value === true; },
    setFault(value) { fault = value; },
    async request(request) {
      if (!C.exact(request, ['url','method','headers','body']) || request.method !== 'POST' ||
          !C.exact(request.headers, ['Content-Type']) || request.headers['Content-Type'] !== 'application/json' ||
          typeof request.body !== 'string' || Buffer.byteLength(request.body) > 16 * 1024 * 1024) C.fail('Mock HTTPS request contract rejected.');
      const url = new URL(request.url);
      if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash ||
          !/^\/fixtures\/[a-z-]+\/[a-z-]+$/.test(url.pathname)) C.fail('Unapproved HTTPS destination.');
      before(); if (!available) C.fail('Mock gateway unavailable.');
      calls.push({path: url.pathname, method: 'POST', bytes: Buffer.byteLength(request.body)});
      const invoke = () => route(url.pathname, JSON.parse(request.body));
      const result = fault ? await fault({path: url.pathname, request: JSON.parse(request.body), invoke}) : await invoke();
      before(); return result;
    }
  };
}
module.exports = {C, ORIGIN, UI, authority, envelope, check, fresh, replayTable, consume,
  configuration, seal, unseal, noTransaction, mockHttps, transaction, optIn};
