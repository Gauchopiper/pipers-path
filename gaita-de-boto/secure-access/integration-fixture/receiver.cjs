'use strict';
// In-memory receiver choreography only; all audio writes delegate to the EXISTING writer VM.
const {readOnlyReceipt,publicConfirmation}=require('./receipt.cjs');
const {validBinding,immutable,bytes}=require('../queue-fixture/postgres.cjs');
function receiverFixture({fixtureOnly=false,canonical,authorize,snapshotHook}={}){
 if(!fixtureOnly||!canonical||typeof authorize!=='function')throw Error('Fixture configuration required.');
 const manifests=new Map(),tails=new Map(),folder='synthetic-gaita-folder';
 const snapshot=async b=>{
  const logs=(canonical.tables['PRACTICE LOG']||[]).slice(1).filter(r=>String(r[7])===b.sessionId).map(r=>Array.from(r));
  const urls=new Set(logs.map(r=>String(r[6])));
  const result={organisation:'GAITA-DE-BOTO',pupil:b.pupil,
   manifest:manifests.has(b.sessionId)?structuredClone(manifests.get(b.sessionId)):null,
   logs,metas:(canonical.tables['SESSION META']||[]).slice(1).filter(r=>String(r[6])===b.sessionId||urls.has(String(r[0]))).map(r=>Array.from(r)),
   journal:(canonical.tables['RECORDING RECEIPTS']||[]).slice(1).filter(r=>String(r[0])===b.sessionId).map(r=>Array.from(r)),
   sessionFiles:[...canonical.files.entries()].filter(([url,f])=>urls.has(url)||f.name.startsWith(b.sessionId+'.')).map(([url,f])=>({id:url.match(/\/file\/d\/([^/]+)/)?.[1],folder:f.folder,private:true,mime:f.mime,bytes:Buffer.from(f.input)})),
   qualifyMinutes:Number(canonical.context.PropertiesService.getScriptProperties().getProperty('GDB_QUALIFY_MINUTES'))};
  if(snapshotHook)await snapshotHook(result);return result;
 };
 const inspect=readOnlyReceipt({fixtureOnly:true,folder,source:{snapshot},authorize,mediaSeconds:(a,m)=>canonical.context.gdbPMediaSeconds_(Array.from(a),m)});
 async function withSession(sid,fn){const previous=tails.get(sid)||Promise.resolve();let unlock;const current=new Promise(r=>unlock=r);tails.set(sid,current);await previous;try{return await fn();}finally{unlock();if(tails.get(sid)===current)tails.delete(sid);}}
 async function submit(actor,b,encoded){
  if(!validBinding(b)||actor?.verified!==true||actor.subject!==b.subject||actor.scope!==b.scope||await authorize(actor,b)!==true)throw Error('Access revoked or denied.');
  const verifiedBytes=bytes(b,encoded); // Validate before recording immutable intent.
  return withSession(b.sessionId,async()=>{
   const previous=manifests.get(b.sessionId);
   if(previous&&immutable(previous.binding)!==immutable(b))throw Error('Immutable Session ID conflict.');
   if(!previous){
    const initial=await inspect(actor,b);
    // A current caller must never retroactively assign identity to a historical save.
    if(initial.state!=='absent'||initial.retrySafe!==true)return {receipt:initial,confirmation:null};
    manifests.set(b.sessionId,{binding:structuredClone(b),state:'accepted'});
   }
   let receipt=await inspect(actor,b);
   if(receipt.saved)return {receipt,confirmation:publicConfirmation(receipt)};
   if(receipt.state!=='absent'||receipt.retrySafe!==true)return {receipt,confirmation:null};
   // This is a process-local fixture mutex, NOT proof of native/ScriptLock concurrency.
   // No outer ScriptLock is held around gdbPUpload_, which already takes that lock.
   manifests.get(b.sessionId).state='dispatched';
   try{await canonical.writer.upload(b,verifiedBytes.toString('base64'));}catch{
    // Never automatically upload again after uncertainty. Only inspect the original outcome.
   }
   receipt=await inspect(actor,b);
   return {receipt,confirmation:receipt.saved?publicConfirmation(receipt):null};
  });
 }
 return {submit,inspect,manifests,snapshot};
}
function queueWriterFixture({fixtureOnly=false,receiver,actorForBinding}){
 if(!fixtureOnly||!receiver||typeof actorForBinding!=='function')throw Error('Fixture configuration required.');
 return {
  async receipt(b){
   const full=await receiver.inspect(await actorForBinding(b),b);
   if(full.saved){publicConfirmation(full);return {state:'saved',result:{saved:true,binding:structuredClone(full.binding)}};}
   return {state:full.state,retrySafe:full.retrySafe===true};
  },
  async upload(b,encoded){const result=await receiver.submit(await actorForBinding(b),b,encoded);if(!result.receipt.saved)throw Error('Canonical dispatch uncertain; receipt reconciliation required.');return result.confirmation;}
 };
}
module.exports={receiverFixture,queueWriterFixture};
