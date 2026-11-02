'use strict';
// Contract fixture only: no deployed receiver, credentials or Google writes.
const {validBinding,immutable,bytes,hash}=require('../queue-fixture/postgres.cjs');
const PROTOCOL='gdb-exact-recording-receipt-v1';
const clone=x=>structuredClone(x);
const pending=(state,reason,retrySafe=false)=>({protocol:PROTOCOL,state,saved:false,retrySafe,retainLocalAudio:true,reason});
function inspectSnapshot(b,s,{folder,mediaSeconds}){
 if(s.organisation!==b.organisation||s.pupil!==b.pupil)throw Error('Foreign canonical snapshot.');
 const {logs,metas,journal,sessionFiles}=s;
 if(![logs,metas,journal,sessionFiles].every(Array.isArray))throw Error('Invalid canonical snapshot.');
 if(!s.manifest){
  // Absence asserts no observed write, never original-subject provenance for a saved file.
  if(!logs.length&&!metas.length&&!journal.length&&!sessionFiles.length)return pending('absent','no-write-evidence',true);
  return pending('unbound','no-original-identity-manifest');
 }
 if(!validBinding(s.manifest.binding)||immutable(s.manifest.binding)!==immutable(b))return pending('attention','immutable-manifest-conflict');
 if(!['accepted','dispatched'].includes(s.manifest.state))return pending('attention','uncertain-manifest-state');
 if(logs.length===0){
  if(journal.length||metas.length||sessionFiles.length)return pending('attention','started-or-partial-recording');
  if(s.manifest.state==='dispatched')return pending('attention','dispatch-outcome-uncertain');
  return pending('absent','no-write-evidence',true);
 }
 if(logs.length!==1||journal.length!==1)return pending('attention','ambiguous-log-or-journal');
 const row=logs[0],j=journal[0];
 if(String(row[0])!==b.pupil||String(row[7])!==b.sessionId||String(j[0])!==b.sessionId||String(j[1])!==b.pupil||String(j[3])!=='STARTED')return pending('attention','record-identity-mismatch');
 const match=String(row[6]).match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view$/);
 if(!match||metas.length!==1)return pending('attention','missing-or-ambiguous-session-meta');
 const meta=metas[0];
 if(String(meta[0])!==String(row[6])||String(meta[1])!==b.pupil||String(meta[6])!==b.sessionId)return pending('attention','session-meta-binding-mismatch');
 if(sessionFiles.length!==1)return pending('attention','missing-or-ambiguous-file');
 const file=sessionFiles[0];
 if(file.id!==match[1]||file.folder!==folder||file.private!==true||file.mime!==b.mimeType||!Buffer.isBuffer(file.bytes)||file.bytes.length!==b.length||hash(file.bytes)!==b.hash)return pending('attention','canonical-file-binding-mismatch');
 // Exact immutable times plus independently parsed samples; never rounded display minutes.
 let evidence;try{evidence=mediaSeconds(file.bytes,file.mime);}catch{return pending('attention','invalid-media-evidence');}
 const seconds=evidence.seconds;
 if(seconds!==b.durationSeconds||seconds<=0||seconds>7200||file.bytes.toString('base64').length>14*1024*1024||
    String(row[2])!==new Date(b.startIso).toISOString()||String(row[3])!==new Date(Date.parse(b.startIso)+seconds*1000).toISOString()||
    Number(row[4])!==Math.round(seconds/60*100)/100)return pending('attention','canonical-duration-or-time-mismatch');
 if(s.qualifyMinutes!==5||String(row[5])!==(seconds>=300?'Yes':'No'))return pending('attention','qualification-rule-or-evidence-mismatch');
 return {protocol:PROTOCOL,state:'saved',saved:true,retrySafe:false,retainLocalAudio:false,binding:clone(b),
  canonical:{organisation:b.organisation,pupil:b.pupil,sessionId:b.sessionId,fileId:file.id,folderId:folder,
   fileHash:b.hash,byteLength:b.length,mimeType:b.mimeType,validatedSeconds:seconds,durationEvidence:evidence.method,
   validatedStartIso:String(row[2]),validatedEndIso:String(row[3]),
   log:{sheet:'PRACTICE LOG',identityDigest:hash(JSON.stringify(row))},
   meta:{sheet:'SESSION META',identityDigest:hash(JSON.stringify([String(meta[0]),String(meta[1]),String(meta[6])]))}},
  qualification:{thresholdSeconds:300,validatedSeconds:seconds,qualifying:seconds>=300}};
}
function readOnlyReceipt({fixtureOnly=false,folder,source,authorize,mediaSeconds}){
 if(!fixtureOnly||!folder||typeof source?.snapshot!=='function'||typeof authorize!=='function'||typeof mediaSeconds!=='function')throw Error('Fixture configuration required.');
 return async(actor,b)=>{
  const allowed=async()=>{if(!validBinding(b)||actor?.verified!==true||actor.subject!==b.subject||actor.scope!==b.scope||await authorize(actor,b)!==true)throw Error('Access revoked or denied.');};
  await allowed();const s=await source.snapshot(b);const result=inspectSnapshot(b,s,{folder,mediaSeconds});await allowed();return result;
 };
}
function publicConfirmation(receipt){
 if(receipt?.protocol!==PROTOCOL||receipt.saved!==true||receipt.state!=='saved'||!validBinding(receipt.binding)||receipt.retainLocalAudio!==false)throw Error('Exact authoritative receipt required.');
 const b=receipt.binding;
 const c=receipt.canonical,q=receipt.qualification;
 if(!c||c.organisation!==b.organisation||c.pupil!==b.pupil||c.sessionId!==b.sessionId||!c.fileId||!c.folderId||c.fileHash!==b.hash||c.byteLength!==b.length||c.mimeType!==b.mimeType||c.validatedSeconds!==b.durationSeconds||!c.log?.identityDigest||!c.meta?.identityDigest||q?.thresholdSeconds!==300||q.validatedSeconds!==b.durationSeconds||q.qualifying!==(b.durationSeconds>=300))throw Error('Complete canonical evidence required.');
 // Internal file/folder locators and other identity fields never go to the pupil.
 return {saved:true,sessionId:b.sessionId,hash:b.hash,byteLength:b.length,mimeType:b.mimeType,validatedSeconds:b.durationSeconds,retainLocalAudio:false};
}
module.exports={readOnlyReceipt,inspectSnapshot,publicConfirmation,PROTOCOL};
