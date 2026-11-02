'use strict';
const fs = require('node:fs');
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {generateKeyPairSync, randomBytes, randomUUID} = require('node:crypto');
const C = require('./contracts.cjs');
const {openStore} = require('./store.cjs');
const {googleDouble} = require('./google-double.cjs');
const {pipeline} = require('./pipeline.cjs');
const {wav, binding} = require('../queue-fixture/canonical-fixture.cjs');
const key = () => generateKeyPairSync('rsa', {modulusLength: 2048,
  publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}});
const gateway = key(), google = key(); // Ephemeral synthetic keys, never published.
function fixture() {
  let time = 1000000;
  const directory = fs.mkdtempSync(join(tmpdir(), 'gdb-option-c-'));
  fs.chmodSync(directory, 0o700);
  const identities = C.fixtureIdentities({fixtureOnly: true});
  const config = {fixtureOnly: true, directory, identities, now: () => time,
    ownerSubject: 'synthetic-owner', workerSubject: 'synthetic-db-worker', callerSubject: 'synthetic-google-automation',
    profile: {environment: 'fixture-option-c', organisation: 'GAITA-DE-BOTO', pupil: 'synthetic-dummy',
      workbook: 'synthetic-option-c-workbook', folder: 'synthetic-gaita-folder'},
    stageKey: randomBytes(32), gatewayPrivateKey: gateway.privateKey, gatewayPublicKey: gateway.publicKey,
    googlePrivateKey: google.privateKey, googlePublicKey: google.publicKey};
  const owner = identities.actor(config.ownerSubject), worker = identities.worker(config.workerSubject),
    caller = identities.caller(config.callerSubject);
  const f = {config, directory, owner, worker, caller, identities,
    selection: {environment: config.profile.environment, organisation: config.profile.organisation, pupil: config.profile.pupil},
    advance(ms) { time += ms; },
    open() {
      f.store = openStore(config); f.google = googleDouble(config);
      f.pipe = pipeline({...config, store: f.store, google: f.google});
    },
    reopen() { f.store.close(); f.google.close(); f.open(); },
    admit(operations = C.operations, expires = time + 60000) {
      return f.store.changeAdmission(owner, f.selection, {action: 'admit', expectedRevision: f.store.admission().revision,
        expires, operations});
    },
    revoke() { return f.store.changeAdmission(owner, f.selection, {action: 'revoke', expectedRevision: f.store.admission().revision,
      expires: time, operations: []}); },
    input(seconds = 1, overrides = {}) {
      const audio = wav(seconds), b = binding(audio, overrides);
      const recording = Object.fromEntries(['sessionId','hash','length','mimeType','durationSeconds','startIso','endIso'].map(k => [k,b[k]]));
      return {recording, audio, encoded: audio.toString('base64')};
    },
    submit(input = f.input()) { f.pipe.submit(owner, f.selection, input.recording, input.encoded); return input.recording.sessionId; },
    operation(event, value = 'synthetic-value') { return {operation: randomUUID(), event, expectedVersion: f.store.version(), value}; },
    status(sid) { return f.store.status(owner, f.selection, sid); },
    async sent() {
      const sid = f.submit(), permit = f.store.claim(worker, sid), load = f.store.markSent(worker, permit);
      const result = await f.google.dispatch(caller, permit, load.audio.toString('base64'));
      return {sid, permit, result};
    },
    close() { try { f.store.close(); } finally { try { f.google.close(); } finally { fs.rmSync(directory, {recursive: true, force: true}); } } }
  };
  f.open(); return f;
}
module.exports = {fixture, C, gateway, google};
