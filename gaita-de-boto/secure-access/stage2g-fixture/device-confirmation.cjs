'use strict';
// Inactive decision helper; no recorder imports, IndexedDB or browser wiring.
const {hash}=require('../queue-fixture/postgres.cjs');
const {checked}=require('./protocol.cjs');
function mayClearOriginal(original,confirmation){
 if(!original||!confirmation||confirmation.saved!==true||confirmation.retainLocalAudio!==false||
   confirmation.sessionId!==original.binding.sessionId||confirmation.hash!==original.binding.hash||confirmation.hash!==hash(original.audio)||
   confirmation.byteLength!==original.audio.length||confirmation.byteLength!==original.binding.length||confirmation.mimeType!==original.binding.mimeType||
   confirmation.validatedSeconds!==original.binding.durationSeconds)return false;
 return true; // Caller must independently authenticate the gateway/session first.
}
function deviceGate({fixtureOnly=false,gatewayKeys,namespace,now,identities,authorise}){
 if(!fixtureOnly||typeof authorise!=='function')throw Error('Offline device decision and current admission required.');
 return async function(original,signed,client,owner){
  identities.check(owner,'owner');identities.check(client,'session',owner.subject);
  const before=await authorise(owner,client);if(!before)throw Error('Current admission denied.');
  const q=checked(gatewayKeys,'device.confirmation',namespace,signed,now()).payload;
  const after=await authorise(owner,client);
  if(!after||q.clientSession!==client.id||q.actor!==owner.subject||q.admissionRevision!==after.revision||q.version!==after.version||before.revision!==after.revision||before.version!==after.version)throw Error('Device response session/admission rejected.');
  return mayClearOriginal(original,q.confirmation);
 };
}
module.exports={deviceGate};
