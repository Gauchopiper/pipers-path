'use strict';
const {digest,checked,exact}=require('../stage2g-fixture/protocol.cjs');
const identity=(manifest,ns)=>({organisation:manifest.binding.organisation,environment:ns.environment,pupil:manifest.binding.pupil,
 actor:manifest.originalActor,profileDigest:ns.profileDigest,sessionId:manifest.binding.sessionId,manifestDigest:digest(manifest)});
function devicePayload(manifest,base,ns){return{identity:identity(manifest,ns),binding:manifest.binding,operation:manifest.operation,
 baseVersion:manifest.baseVersion,admissionRevision:manifest.admissionRevision,evidenceDigest:digest(base)};}
function verifyDeviceSource(keys,ns,signed,manifest,now,base){const q=checked(keys,'recording.device.receipt',ns,signed,now,{historical:true}).payload;
 if(!exact(q,['identity','binding','operation','baseVersion','admissionRevision','evidenceDigest'])||digest(q.identity)!==digest(identity(manifest,ns))||digest(q.binding)!==digest(manifest.binding)||
 q.operation!==manifest.operation||q.baseVersion!==manifest.baseVersion||q.admissionRevision!==manifest.admissionRevision||typeof q.evidenceDigest!=='string'||!/^[a-f0-9]{64}$/.test(q.evidenceDigest)||(base&&q.evidenceDigest!==digest(base)))throw Error('Exact device source receipt/identity rejected.');return q;}
module.exports={identity,devicePayload,verifyDeviceSource};
