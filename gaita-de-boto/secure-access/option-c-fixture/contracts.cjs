'use strict';
// Synthetic Stage 1 contracts only. No OAuth, network or application imports.
const {createHash, sign, verify} = require('node:crypto');
const {validBinding, bytes} = require('../queue-fixture/postgres.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(message); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  if (value === null || ['string', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  fail('Unsupported signed value.');
}
const digest = value => hash(canonical(value));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fixtureId = value => typeof value === 'string' && /^synthetic-[a-z0-9-]{1,80}$/.test(value);
const operations = Object.freeze([
  'recording.submit', 'recording.status', 'path.read', 'playback.read',
  'teacher.comment', 'teacher.review', 'target.assign', 'target.change',
  'badge.award', 'badge.change', 'session.target', 'group.change', 'permission.change'
]);
const eventFacets = Object.freeze({
  'recording.saved': ['sessions', 'totals', 'availability', 'group'],
  'recording.reconciled': ['sessions', 'totals', 'availability', 'group'],
  'teacher.comment': ['comments'], 'teacher.review': ['reviews', 'targets', 'badges'],
  'target.assign': ['targets'], 'target.change': ['targets', 'catalogue'],
  'badge.award': ['badges'], 'badge.change': ['badges', 'catalogue'],
  'session.target': ['sessions', 'targets'], 'group.change': ['group'],
  'permission.change': ['access', 'group'], 'admission.changed': ['access', 'group']
});

function profileContract(config) {
  if (config?.fixtureOnly !== true || !exact(config.profile,
      ['environment', 'organisation', 'pupil', 'workbook', 'folder']) ||
      !/^fixture-[a-z0-9-]+$/.test(config.profile.environment) ||
      config.profile.organisation !== 'GAITA-DE-BOTO' ||
      !['pupil', 'workbook', 'folder'].every(key => fixtureId(config.profile[key]))) fail('Synthetic profile required.');
  // The existing canonical VM owns this fixed synthetic folder; no selector is forwarded.
  if (config.profile.folder !== 'synthetic-gaita-folder') fail('Unapproved fixture writer folder.');
  const profile = Object.freeze({...config.profile});
  const fingerprint = digest(profile);
  function select(selection) {
    if (!exact(selection, ['environment', 'organisation', 'pupil']) ||
        ['environment', 'organisation', 'pupil'].some(key => selection[key] !== profile[key])) fail('Resource selection denied.');
    return profile;
  }
  return {profile, fingerprint, select};
}

// This authority deliberately represents trusted adapter outputs, NOT real authentication.
// Objects copied from JSON or adorned with verified/OWNER flags are never branded.
function fixtureIdentities({fixtureOnly = false} = {}) {
  if (!fixtureOnly) fail('Fixture identity authority required.');
  const actorSet = new WeakSet(), workerSet = new WeakSet(), callerSet = new WeakSet();
  const mint = (set, subject, role) => {
    if (!fixtureId(subject)) fail('Synthetic subject required.');
    const value = Object.freeze({issuer: 'https://accounts.google.com', scope: 'google:fixture', subject, role});
    set.add(value); return value;
  };
  return {
    actor: subject => mint(actorSet, subject, 'original-actor'),
    worker: subject => mint(workerSet, subject, 'database-worker'),
    caller: subject => mint(callerSet, subject, 'google-executor'),
    isActor: actor => !!actor && actorSet.has(actor),
    isWorker: actor => !!actor && workerSet.has(actor),
    isCaller: actor => !!actor && callerSet.has(actor)
  };
}
const actorFields = actor => ({issuer: actor.issuer, subject: actor.subject, scope: actor.scope});
function signed(privateKey, purpose, body) {
  const wire = canonical({protocol: 'option-c-fixture-v1', purpose, body});
  return {wire, signature: sign('RSA-SHA256', Buffer.from(wire), privateKey).toString('base64')};
}
function checked(publicKey, purpose, envelope) {
  if (!exact(envelope, ['wire', 'signature']) || typeof envelope.wire !== 'string' ||
      envelope.wire.length > 16 * 1024 * 1024 || typeof envelope.signature !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature) ||
      !verify('RSA-SHA256', Buffer.from(envelope.wire), publicKey, Buffer.from(envelope.signature, 'base64'))) fail('Signature rejected.');
  let value; try { value = JSON.parse(envelope.wire); } catch { fail('Invalid signed JSON.'); }
  if (!exact(value, ['protocol', 'purpose', 'body']) || value.protocol !== 'option-c-fixture-v1' ||
      value.purpose !== purpose || canonical(value) !== envelope.wire) fail('Signed purpose rejected.');
  return value.body;
}
function recordingInput(actor, profile, recording, encoded, mediaSeconds) {
  const fields = ['sessionId', 'hash', 'length', 'mimeType', 'durationSeconds', 'startIso', 'endIso'];
  if (!exact(recording, fields)) fail('Unknown recording/resource field.');
  const binding = {organisation: profile.organisation, pupil: profile.pupil, subject: actor.subject,
    scope: actor.scope, action: 'uploadRecording', ...recording};
  if (!validBinding(binding)) fail('Invalid original recording binding.');
  const audio = bytes(binding, encoded), evidence = mediaSeconds(audio, binding.mimeType);
  if (evidence.seconds !== binding.durationSeconds) fail('Independent sample duration mismatch.');
  return {binding, audio};
}
function makeManifest(actor, profile, fingerprint, binding, revision) {
  return {protocol: 'option-c-original-v1', environment: profile.environment,
    organisation: profile.organisation, pupil: profile.pupil, originalActor: actorFields(actor),
    profileDigest: fingerprint, authorisationRevision: revision, binding};
}
function validateManifest(value, profile, fingerprint, ownerSubject) {
  if (!exact(value, ['protocol', 'environment', 'organisation', 'pupil', 'originalActor',
    'profileDigest', 'authorisationRevision', 'binding']) || value.protocol !== 'option-c-original-v1' ||
    value.environment !== profile.environment || value.organisation !== profile.organisation || value.pupil !== profile.pupil ||
    value.profileDigest !== fingerprint || !Number.isSafeInteger(value.authorisationRevision) || value.authorisationRevision < 1 ||
    !exact(value.originalActor, ['issuer', 'scope', 'subject']) ||
    value.originalActor.issuer !== 'https://accounts.google.com' || value.originalActor.scope !== 'google:fixture' ||
    value.originalActor.subject !== ownerSubject || !validBinding(value.binding) ||
    value.binding.subject !== value.originalActor.subject || value.binding.scope !== value.originalActor.scope ||
    value.binding.organisation !== value.organisation || value.binding.pupil !== value.pupil) fail('Original manifest rejected.');
  return value;
}
module.exports = {hash, canonical, digest, exact, uuid, fixtureId, fail, operations, eventFacets,
  profileContract, fixtureIdentities, actorFields, signed, checked, recordingInput, makeManifest, validateManifest};
