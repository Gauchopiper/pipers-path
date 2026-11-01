'use strict';
const {P,digest,exact,envelope,checked}=require('./protocol.cjs');
const {validBinding,bytes,hash}=require('../queue-fixture/postgres.cjs');
const {inspectSnapshot}=require('../integration-fixture/receipt.cjs');
const {devicePayload,verifyDeviceSource}=require('../stage2i-fixture/confirmation.cjs');
const {projectPath}=require('./projection.cjs');
function sourceAdapter({fixtureOnly,profile,profiles,identities,canonical,journal,sourceKey,sourceKeys,gatewayKeys,now,dispatchAuthority}){
 if(!fixtureOnly||!dispatchAuthority)throw Error('Offline source authority required.');const ns={environment:profile.environment,profileDigest:profiles.digest(profile)},selection={environment:profile.environment,organisation:profile.organisation,pupil:profile.pupil};let enabled=false;const INTERNAL=Symbol('private exact verification');
 function execution(context,op){identities.check(context,'worker',profile.owner);profiles.assert(profile,selection,now(),op);if(!enabled)throw Error('Source execution disabled/revoked.');}
 function original(m){if(!exact(m,['binding','originalActor','profileDigest','operation','baseVersion','admissionRevision'])||!validBinding(m.binding)||m.binding.pupil!==profile.pupil||m.binding.organisation!==profile.organisation||m.binding.subject!==profile.owner||m.binding.sessionId!==profile.sessionId||
  m.profileDigest!==ns.profileDigest||!exact(m.originalActor,['issuer','subject','scope'])||m.originalActor.subject!==profile.owner||m.originalActor.scope!=='google:fixture'||m.originalActor.issuer!=='https://accounts.google.com'||m.binding.scope!==m.originalActor.scope)throw Error('Original manifest identity rejected.');return m;}
 function intent(m){const all=journal.events(),events=all.filter(e=>e.purpose==='DISPATCH'&&e.sessionId===m.binding.sessionId);if(events.length>1)throw Error('Ambiguous original intent.');const old=events[0];if(old&&old.payload.manifestHash!==digest(m))throw Error('Original source manifest conflict.');return old;}
 function inspect(m,internal){original(m);const old=intent(m),snapshot=canonical.snapshot(m);if(!old)snapshot.manifest=null;
  const r=inspectSnapshot(m.binding,snapshot,{folder:profile.folder,mediaSeconds:canonical.mediaSeconds});if(!r.saved)return{state:r.state,retrySafe:r.retrySafe,receipt:null};
  const cached=journal.events().filter(e=>e.purpose==='RECEIPT'&&e.sessionId===m.binding.sessionId).at(-1);
  const payload={manifestHash:digest(m),binding:r.binding,canonical:r.canonical,qualification:r.qualification,operation:m.operation,admissionRevision:old.payload.admissionRevision,baseVersion:m.baseVersion};
  if(cached){const body=checked(sourceKeys,'recording.receipt',ns,cached.payload.receipt,now(),{historical:true});const {deviceReceipt,...base}=body.payload;if(digest(base)!==digest(payload))throw Error('Canonical evidence changed after receipt.');verifyDeviceSource(sourceKeys,ns,deviceReceipt,m,now(),base);if(internal!==INTERNAL&&!journal.events().some(e=>e.purpose==='READBACK'&&e.row[5]===m.operation&&e.payload.receiptDigest===digest(cached.payload.receipt)))return{state:'attention',retrySafe:false,receipt:null};return{state:'saved',retrySafe:false,receipt:cached.payload.receipt};}
  if(internal!==INTERNAL)return{state:'attention',retrySafe:false,receipt:null};const deviceReceipt=envelope(sourceKey,'recording.device.receipt',ns,devicePayload(m,payload,ns),now());
  return{state:'saved',retrySafe:false,receipt:envelope(sourceKey,'recording.receipt',ns,{...payload,deviceReceipt},now())};
 }
 function persistReceipt(m,result){if(!result.receipt)return result;const old=journal.events().filter(e=>e.purpose==='RECEIPT'&&e.sessionId===m.binding.sessionId).at(-1);
  if(!old)journal.append({purpose:'RECEIPT',state:'complete',sessionId:m.binding.sessionId,operationId:m.operation,payload:{receipt:result.receipt}});return inspect(m,INTERNAL);}
 function dispatch(context,signed,audio){execution(context,'recording.submit');const b=checked(gatewayKeys,'recording.dispatch',ns,signed,now()),q=b.payload;
  if(!exact(q,['permit','admissionRevision']))throw Error('Dispatch payload rejected.');const permit=q.permit,m=original(permit.manifest);
  if(digest(m)!==permit.manifestHash||!Number.isSafeInteger(permit.fence)||permit.fence<1||permit.lease<=now()||q.admissionRevision<m.admissionRevision)throw Error('Dispatch permit rejected.');
  bytes(m.binding,audio.toString('base64'));if(canonical.mediaSeconds(audio,m.binding.mimeType).seconds!==m.binding.durationSeconds)throw Error('Exact media rejected.');
  dispatchAuthority.validate(permit,q.admissionRevision);const before=inspect(m);if(before.receipt){if(journal.events().some(e=>e.nonce===b.nonce))throw Error('Source dispatch replay rejected.');journal.append({purpose:'NONCE',state:'accepted',nonce:b.nonce,requestDigest:digest(b),payload:{purpose:'duplicate-dispatch'}});return before;}
  if(before.state!=='absent'||intent(m))throw Error('Uncertain source outcome; inspect only.');
  let finalResult;canonical.upload(m.binding,audio,()=>{execution(context,'recording.submit');checked(gatewayKeys,'recording.dispatch',ns,signed,now());dispatchAuthority.validate(permit,q.admissionRevision);if(intent(m))throw Error('Concurrent or replayed original.');canonical.boundary('fresh-authority');
   journal.append({purpose:'DISPATCH',state:'dispatched',sessionId:m.binding.sessionId,operationId:m.operation,nonce:b.nonce,requestDigest:digest(b),payload:{manifest:m,manifestHash:digest(m),fence:permit.fence,admissionRevision:q.admissionRevision}});canonical.boundary('intent');},()=>{canonical.boundary('source-verified');finalResult=persistReceipt(m,inspect(m,INTERNAL));canonical.boundary('receipt');if(!finalResult.receipt)throw Error('Canonical persistence uncertain.');journal.append({purpose:'OUTBOX',state:'complete',sessionId:m.binding.sessionId,operationId:m.operation,payload:{receipt:finalResult.receipt}});canonical.boundary('outbox');},()=>{finishReadback(m);});
  return inspect(m);
 }
 function finishReadback(m){const result=inspect(m,INTERNAL);if(!result.receipt||!journal.events().some(e=>e.purpose==='OUTBOX'&&e.row[5]===m.operation&&digest(e.payload.receipt)===digest(result.receipt)))throw Error('Exact outbox readback required.');
  if(!journal.events().some(e=>e.purpose==='READBACK'&&e.row[5]===m.operation))journal.append({purpose:'READBACK',state:'complete',sessionId:m.binding.sessionId,operationId:m.operation,payload:{receiptDigest:digest(result.receipt)}});canonical.boundary('readback');journal.assertReady();}
 function reconcile(context,m){execution(context,'recording.submit');original(m);const done=inspect(m);if(done.receipt)return done;
  return canonical.recoveryLock(()=>{const raw=inspect(m,INTERNAL);if(!raw.receipt)return raw;const result=persistReceipt(m,raw);if(!journal.events().some(e=>e.purpose==='OUTBOX'&&e.row[5]===m.operation))journal.append({purpose:'OUTBOX',state:'complete',sessionId:m.binding.sessionId,operationId:m.operation,payload:{receipt:result.receipt}});canonical.flush();finishReadback(m);canonical.flush();return inspect(m);});}

 function read(context,signed){execution(context,'path.read');const b=checked(gatewayKeys,'read.request',ns,signed,now()),q=b.payload;
  if(!exact(q,['readId','operation','sessionId','actor','clientSession','version','admissionRevision','handleHash'])||q.actor!==profile.owner||!['path.read','playback.read'].includes(q.operation))throw Error('Read original actor rejected.');
  profiles.assert(profile,selection,now(),q.operation);
  journal.append({purpose:'NONCE',state:'accepted',operationId:q.readId,nonce:b.nonce,requestDigest:digest(b),payload:{purpose:'read.request'}});
  const logs=canonical.tables()['PRACTICE LOG'].slice(1);for(const r of logs){if(r[0]!==profile.pupil)throw Error('Foreign source pupil.');const d=journal.events().find(e=>e.purpose==='DISPATCH'&&e.sessionId===r[7]);if(!d||!inspect(d.payload.manifest).receipt)throw Error('Unbound or partial original read.');}
  let data;if(q.operation==='path.read'){if(q.sessionId!==null)throw Error('PATH selector rejected.');data=projectPath(canonical.tables(),profile.pupil,now());}
  else{if(q.sessionId!==profile.sessionId)throw Error('Foreign playback SID.');const row=logs.find(r=>r[7]===q.sessionId),file=row&&canonical.files.get(row[6]);if(!file||file.folder!==profile.folder||!file.private||file.bytes.length>5*1024*1024)throw Error('Playback unavailable.');data={sessionId:q.sessionId,hash:hash(file.bytes),mimeType:file.mime,audioBase64:file.bytes.toString('base64')};}
  const proof=envelope(sourceKey,'read.result',ns,{readId:q.readId,requestDigest:digest(signed),dataDigest:digest(data),version:q.version,admissionRevision:q.admissionRevision},now());
  // Large audio is deliberately not written to the 16 KiB journal. Persist only
  // signed metadata/hash and a source reference; a retry reconstructs exact bytes.
  const blueprint=q.operation==='playback.read'?{sessionId:data.sessionId,hash:data.hash,mimeType:data.mimeType}:data;
  journal.append({purpose:'OUTBOX',state:'complete',operationId:q.readId,payload:{proof,blueprint,operation:q.operation}});
  return{proof,data};
 }
 function retryRead(context,readId){execution(context,'path.read');const out=journal.events().find(e=>e.purpose==='OUTBOX'&&e.row[5]===readId);if(!out)throw Error('Read outbox missing.');const {proof,blueprint,operation}=out.payload;
  let data=blueprint;if(operation==='playback.read'){const row=canonical.tables()['PRACTICE LOG'].slice(1).find(r=>r[7]===blueprint.sessionId),f=row&&canonical.files.get(row[6]);if(!f||hash(f.bytes)!==blueprint.hash)throw Error('Original playback changed.');data={...blueprint,audioBase64:f.bytes.toString('base64')};}
  const q=checked(sourceKeys,'read.result',ns,proof,now()).payload;if(q.dataDigest!==digest(data))throw Error('Read reconstruction changed.');return{proof,data};
 }
 function operationProof(context,request){execution(context,'path.read');return envelope(sourceKey,'operation.receipt',ns,{operation:request.operation,requestDigest:request.request_hash,sourceDigest:digest(JSON.parse(JSON.stringify(canonical.tables())))},now());}
 return{dispatch,inspect,reconcile,read,retryRead,operationProof,setEnabled:x=>{enabled=x===true;},namespace:ns};
}
function runtime({store,source,owner,worker,recovery,execution}){
 return{async run({beforeGoogle,afterSource,afterCallback}={}){const permit=await store.claim(worker,owner);if(!permit)return{state:'idle',saved:false};const armed=await store.arm(worker,owner,permit);if(store.inTransaction())throw Error('Database transaction crossed source boundary.');
   try{if(beforeGoogle)await beforeGoogle(permit);const result=source.dispatch(execution,armed.dispatch,armed.audio);if(afterSource)await afterSource(permit,result);if(!result.receipt)throw Error('Source outcome uncertain.');const saved=await store.complete(worker,permit,result.receipt);if(afterCallback)await afterCallback(permit,saved);return{permit,result:saved};}
   catch(error){await store.uncertain(worker,permit.sessionId);return{permit,saved:false,retainLocalAudio:true,error:error.message};}},
  async reconcile(permit){const r=source.reconcile(execution,permit.manifest);if(!r.receipt)return{saved:false,retainLocalAudio:true,state:r.state};return store.complete(recovery,permit,r.receipt,{reconcile:true});},
  relay:{transcript:[],async run(client,request,{origin=store.config.profile.gatewayOrigin,afterSource}={}){try{if(origin!==store.config.profile.gatewayOrigin||!exact(request,['handle']))throw Error('Relay origin/handle rejected.');this.transcript.push({request:{...request}});
   const signed=await store.fetchRead(worker,owner,client,request);if(store.inTransaction())throw Error('Transaction across read source.');const result=source.read(execution,signed);if(afterSource)await afterSource(result);const ack=await store.stageRead(worker,owner,client,result);this.transcript.push({response:ack});return ack;}catch{throw Error('Protected read unavailable.');}}}
 };
}
module.exports={sourceAdapter,runtime};
