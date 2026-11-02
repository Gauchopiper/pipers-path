'use strict';
// Inactive decision only. Never imports recorder, changes IndexedDB or erases bytes.
const {hash,validBinding}=require('../queue-fixture/postgres.cjs');
const {checked,digest,exact}=require('./protocol.cjs');
const {identity,verifyDeviceSource}=require('../stage2i-fixture/confirmation.cjs');
function deviceGate({fixtureOnly=false,gatewayKeys,sourceKeys,profile,namespace,now,identities,authorise}){
 if(!fixtureOnly||typeof authorise!=='function')throw Error('Offline device decision and current admission required.');
 return async function(original,signed,client,owner){
  identities.check(owner,'owner');identities.check(client,'session',owner.subject);
  const before=await authorise(owner,client);if(!before)throw Error('Current admission denied.');
  const q=checked(gatewayKeys,'device.confirmation',namespace,signed,now()).payload,after=await authorise(owner,client);
  if(!after||q.clientSession!==client.id||q.actor!==owner.subject||q.admissionRevision!==after.revision||q.version!==after.version||before.revision!==after.revision||before.version!==after.version)throw Error('Device response session/admission rejected.');
  const c=q.confirmation;if(!c||c.saved!==true||c.retainLocalAudio!==false)return false;
  if(!profile||!sourceKeys||!original||!exact(original,['binding','audio','manifest','identity'])||!validBinding(original.binding)||!Buffer.isBuffer(original.audio))return false;
  const m=original.manifest,b=original.binding;
  try{
   if(profile.environment!==namespace.environment||profile.owner!==owner.subject||b.organisation!==profile.organisation||b.pupil!==profile.pupil||b.subject!==owner.subject||b.sessionId!==profile.sessionId||
     !exact(m,['binding','originalActor','profileDigest','operation','baseVersion','admissionRevision'])||digest(m.binding)!==digest(b)||m.profileDigest!==namespace.profileDigest||
     m.originalActor?.subject!==owner.subject||m.originalActor?.issuer!=='https://accounts.google.com'||m.originalActor?.scope!==b.scope||
     digest(original.identity)!==digest(identity(m,namespace))||digest(c.identity)!==digest(original.identity)||c.manifestDigest!==digest(m)||digest(c.manifest)!==digest(m)||
     c.sessionId!==b.sessionId||c.hash!==b.hash||hash(original.audio)!==b.hash||c.byteLength!==b.length||original.audio.length!==b.length||c.mimeType!==b.mimeType||c.validatedSeconds!==b.durationSeconds)return false;
   verifyDeviceSource(sourceKeys,namespace,c.sourceConfirmation,m,now());
  }catch{return false;}
  return true;
 };
}
module.exports={deviceGate};
