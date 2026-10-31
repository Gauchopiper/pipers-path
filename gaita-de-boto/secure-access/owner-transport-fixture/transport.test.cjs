'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const {fixture,P,C,gatewayKeys,googleKeys,serviceKeys} = require('./test-support.cjs');
const {gateway} = require('./gateway.cjs'), {ownerRuntime,browserRelay} = require('./owner-runtime.cjs');
let networkCalls=0;
const noNetwork=()=>{networkCalls++;throw Error('External network prohibited in transport fixtures.');};
global.fetch=noNetwork;
for(const m of ['node:http','node:https']){require(m).request=noNetwork;require(m).get=noNetwork;}
require('node:net').connect=noNetwork;require('node:net').createConnection=noNetwork;
const cases=[],test=(name,run)=>cases.push({name,run});
const reject=(fn,re=/./)=>assert.throws(fn,re),rejectAsync=(fn,re=/./)=>assert.rejects(fn,re);
const rpc=async(f,path,purpose,value,context=f.manual)=>{
  const request=f.runtime.request(context, purpose.startsWith('owner.read')?'read':'write', purpose,value,true);
  return f.transport.request({url:P.ORIGIN+path,method:'POST',headers:{'Content-Type':'application/json'},body:C.canonical(request)});
};
const responseValue=(signed,purpose)=>C.checked(gatewayKeys.publicKey,purpose+'-response',signed).payload.value;
const claim=async f=>responseValue(await rpc(f,'/fixtures/pull/claim','owner.pull.claim',{invocation:randomUUID()}),'owner.pull.claim');
const arm=async(f,offer)=>responseValue(await rpc(f,'/fixtures/pull/arm','owner.pull.arm',
  {deliveryId:offer.deliveryId,permitDigest:C.digest(offer.permit)}),'owner.pull.arm');
function reSignReply(response,mutate){const b=C.checked(gatewayKeys.publicKey,
  JSON.parse(response.wire).purpose,response);mutate(b);return C.signed(gatewayKeys.privateKey,JSON.parse(response.wire).purpose,b);}
function badView(f,mutate){const read=f.google.read;f.google.read=(...args)=>{const v=C.checked(googleKeys.publicKey,'view-receipt',read(...args));
  mutate(v);return C.signed(googleKeys.privateKey,'view-receipt',v);};}
function untouched(f){assert.equal(f.google.stats().writerCalls,0);assert.equal(f.google.stats().files,0);}

test('A01 explicit fixture opt-in and disabled defaults protect both components',async f=>{
  reject(()=>gateway({...f.config,store:f.store,fixtureOnly:false}));
  reject(()=>ownerRuntime({...f.config,store:f.store,google:f.google,transport:f.transport,fixtureOnly:false}));
  const off=gateway({...f.config,store:f.store});f.admit();f.submit();
  const request=f.runtime.request(f.manual,'write','owner.pull.claim',{invocation:randomUUID()});
  reject(()=>off.route('/fixtures/pull/claim',request),/disabled/);untouched(f);
});
test('A02 actual one-job pull preserves exact original bytes and authenticated receipt',async f=>{
  f.admit();const input=f.input(),sid=f.submit(input),result=await f.runtime.runOnce(f.manual);
  assert(C.uuid(result.deliveryId));assert(/^[A-Za-z0-9_-]{43}$/.test(result.ack));
  assert.equal(f.status(sid).confirmation.hash,input.recording.hash);
  assert([...f.google.canonical.files.values()][0].input.equals(input.audio));
  assert.equal(f.google.stats().writerCalls,1);assert.equal(f.gateway.dispatched(),1);
});
test('A03 accepting the queue or claiming a job never means SAVED',async f=>{
  f.admit();const sid=f.submit(),offer=await claim(f);assert(offer.permit);
  assert.equal(f.status(sid).display,'SAFE ON DEVICE — awaiting confirmation');assert(f.store.row(sid).cipher);untouched(f);
});
test('A04 one invocation cannot claim or write a second recording',async f=>{
  f.admit();const a=f.submit(),b=f.submit(),invocation=randomUUID();
  await f.runtime.runOnce(f.manual,{invocation});await f.runtime.runOnce(f.manual,{invocation});
  assert.equal(f.status(a).saved,true);assert.equal(f.status(b).saved,false);assert.equal(f.google.stats().files,1);
});
test('A05 overlapping pull invocations cannot acquire another job while a lease is held',async f=>{
  f.admit();f.submit();f.submit();let resume,started;
  const ready=new Promise(r=>{started=r;}),gate=new Promise(r=>{resume=r;});
  const first=f.runtime.runOnce(f.manual,{afterClaim:async()=>{started();await gate;}});await ready;
  assert.equal((await f.runtime.runOnce(f.manual)).state,'busy');resume();await first;
  assert.equal(f.google.stats().writerCalls,1);
});
test('A06 forged actor, database worker and copied execution contexts are denied',async f=>{
  f.admit();f.submit();
  for(const context of [f.owner,f.identities.worker(f.config.workerSubject),{...f.manual}])
    await rejectAsync(()=>f.runtime.runOnce(context),/execution context/);
  untouched(f);assert.equal(f.transport.calls.length,0);
});
test('A07 a different Google effective identity cannot inherit Owner execution',async f=>{
  f.admit();f.submit();await rejectAsync(()=>f.runtime.runOnce(f.authority.execution('synthetic-other-owner')),/execution context/);untouched(f);
});
test('A08 missing execution capability denies work before claiming or disclosing audio',async f=>{
  f.admit();f.submit();const context=f.authority.execution(f.owner.subject,'manual',['sheets','email','external-request']);
  await rejectAsync(()=>f.runtime.runOnce(context),/capability/);untouched(f);assert.equal(f.delivery(),undefined);
});
test('A09 Owner execution alone cannot bypass missing or operation-limited Dummy admission',async f=>{
  f.admit();const sid=f.submit();f.revoke();f.admit(['path.read']);
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/operation denied/);untouched(f);
  assert(f.store.row(sid).cipher);
});
test('A10 worker verifies signed original actor independently of effective Owner',async f=>{
  f.admit();f.submit();f.transport.setFault(async({path,invoke})=>{
    const result=await invoke();if(path!=='/fixtures/pull/claim')return result;
    return reSignReply(result,b=>{const p=C.checked(gatewayKeys.publicKey,'dispatch',b.payload.value.permit);
      p.manifest.originalActor.subject='synthetic-other';p.manifest.binding.subject='synthetic-other';p.manifestHash=C.digest(p.manifest);
      b.payload.value.permit=C.signed(gatewayKeys.privateKey,'dispatch',p);});
  });await rejectAsync(()=>f.runtime.runOnce(f.manual),/manifest/);untouched(f);
});
test('A11 cross-environment or resource-profile offer is rejected before arming',async f=>{
  f.admit();f.submit();f.transport.setFault(async({path,invoke})=>{
    const result=await invoke();return path==='/fixtures/pull/claim'?reSignReply(result,b=>{b.profileDigest='a'.repeat(64);}):result;
  });await rejectAsync(()=>f.runtime.runOnce(f.manual),/namespace/);untouched(f);
});
test('A12 a valid worker signature cannot introduce client-selected resources',async f=>{
  f.admit();f.submit();await rejectAsync(()=>rpc(f,'/fixtures/pull/claim','owner.pull.claim',
    {invocation:randomUUID(),workbook:'synthetic-other'}),/invocation/);untouched(f);
});
test('A13 HTTPS destination, method, query and redirect alternatives are denied locally',async f=>{
  const base={url:P.ORIGIN+'/fixtures/pull/claim',method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  for(const patch of [{url:'http://synthetic-gateway.invalid/fixtures/pull/claim'},
    {url:'https://synthetic-other.invalid/fixtures/pull/claim'},{url:base.url+'?redirect=other'},
    {url:'https://user@synthetic-gateway.invalid/fixtures/pull/claim'},{method:'GET'}])
    await rejectAsync(()=>f.transport.request({...base,...patch}));
  assert.equal(f.transport.calls.length,0);
});
test('A14 wrong service signing key cannot obtain any queued recording',async f=>{
  f.admit();f.submit();const b=C.checked(serviceKeys.publicKey,'owner.pull.claim',f.runtime.request(f.manual,'write','owner.pull.claim',{invocation:randomUUID()}));
  reject(()=>f.gateway.route('/fixtures/pull/claim',C.signed(googleKeys.privateKey,'owner.pull.claim',b)),/Signature/);untouched(f);
});
test('A15 signed service replay remains rejected after both stores reopen',async f=>{
  f.admit();const request=f.runtime.request(f.manual,'write','owner.pull.claim',{invocation:randomUUID()});
  f.gateway.route('/fixtures/pull/claim',request);f.reopen();reject(()=>f.gateway.route('/fixtures/pull/claim',request),/UNIQUE/);
});
test('A16 expired service requests are rejected with no source side effects',f=>{
  f.admit();f.submit();const request=f.runtime.request(f.manual,'write','owner.pull.claim',{invocation:randomUUID()});f.advance(30000);
  reject(()=>f.gateway.route('/fixtures/pull/claim',request),/Expired/);untouched(f);
});
test('A17 gateway response substitution cannot bind an offer to another request',async f=>{
  f.admit();f.submit();f.transport.setFault(async({invoke})=>reSignReply(await invoke(),b=>{b.payload.replyTo='b'.repeat(64);}));
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/binding/);untouched(f);
});
test('A18 claim-response replay is durable at the Owner runtime boundary',async f=>{
  f.admit();const signed=f.runtime.request(f.manual,'write','owner.pull.claim',{invocation:randomUUID()});
  const result=f.gateway.route('/fixtures/pull/claim',signed);f.runtime.accept('owner.pull.claim',result,signed);f.reopen();
  reject(()=>f.runtime.accept('owner.pull.claim',result,signed),/UNIQUE/);
});
test('A19 admission revocation after claim prevents arming and canonical writing',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterClaim:()=>f.revoke()}),/revoked/);
  assert(f.store.row(sid).cipher);untouched(f);
});
test('A20 admission revision change invalidates the earlier claim',async f=>{
  f.admit();f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterClaim:()=>f.admit()}),/Admission changed/);untouched(f);
});
test('A21 expired lease is replaced with a higher fence and rejects the old arm',async f=>{
  f.admit();f.submit();const old=await claim(f);f.advance(30001);const next=await claim(f);
  assert(C.checked(gatewayKeys.publicKey,'dispatch',next.permit).fence>C.checked(gatewayKeys.publicKey,'dispatch',old.permit).fence);
  await rejectAsync(()=>arm(f,old),/Stale/);await arm(f,next);untouched(f);
});
test('A22 encrypted pending corruption fails before the canonical writer',async f=>{
  f.admit();const sid=f.submit(),bytes=Buffer.from(f.store.row(sid).cipher);bytes[0]^=1;
  f.store.db.prepare('UPDATE recordings SET cipher=? WHERE session=?').run(bytes,sid);
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/authenticate/);assert.equal(f.status(sid).saved,false);untouched(f);
});
test('A23 altered signed armed bytes cannot replace the original audio',async f=>{
  f.admit();const sid=f.submit();f.transport.setFault(async({path,invoke})=>{
    const result=await invoke();return path==='/fixtures/pull/arm'?reSignReply(result,b=>{b.payload.value.audioBase64=f.input(2).encoded;}):result;
  });await rejectAsync(()=>f.runtime.runOnce(f.manual));assert(f.store.row(sid).cipher);untouched(f);
});
test('A24 a live source call is never made while a database transaction is open',async f=>{
  f.admit();f.submit();f.store.db.exec('BEGIN IMMEDIATE');
  try{await rejectAsync(()=>f.runtime.runOnce(f.manual),/open database transaction/);}finally{f.store.db.exec('ROLLBACK');}
  assert.equal(f.transport.calls.length,0);untouched(f);
});
test('A25 canonical ScriptLock is balanced, never nested, and remains the original writer boundary',async f=>{
  f.admit();await f.saved();assert.equal(f.locks.max,1);assert.equal(f.locks.depth,0);
  assert.equal(f.locks.acquires,f.locks.releases);assert(f.locks.acquires>0);
  assert.equal(f.google.canonical.counts().attempts,1);
});
test('A26 an attempted outer canonical lock is rejected before gateway or writer work',async f=>{
  f.admit();f.submit();const lock=f.google.canonical.context.LockService.getScriptLock();lock.waitLock();
  try{await rejectAsync(()=>f.runtime.runOnce(f.manual),/ScriptLock held/);}finally{lock.releaseLock();}untouched(f);
});
test('A27 gateway unavailable before claim preserves encrypted pending audio',async f=>{
  f.admit();const sid=f.submit();f.transport.setAvailable(false);
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/unavailable/);assert(f.store.row(sid).cipher);untouched(f);
});
test('A28 interruption after arm never permits a destructive redispatch',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterArm:()=>{throw Error('worker interrupted');}}),/interrupted/);
  const id=f.delivery().id;f.reopen();await f.runtime.reconcile(f.manual,id);
  assert.equal(f.status(sid).saved,false);await rejectAsync(()=>f.runtime.runOnce(f.manual),/DIRTY/);untouched(f);
});
test('A29 lost Google success response reconciles original bytes after reopening',async f=>{
  f.admit();const sid=f.submit();f.google.canonical.setMode('lost-response');await f.runtime.runOnce(f.manual);
  assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);const id=f.delivery().id;f.reopen();
  await f.runtime.reconcile(f.manual,id);assert.equal(f.status(sid).phase,'reconciled');assert.equal(f.google.stats().writerCalls,1);
});
test('A30 interruption after canonical completion but before outbox persists requires inspection only',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterGoogle:()=>{throw Error('process crash');}}),/crash/);
  const id=f.delivery().id;f.reopen();await f.runtime.reconcile(f.manual,id);
  assert.equal(f.status(sid).saved,true);assert.equal(f.google.stats().files,1);assert.equal(f.google.stats().writerCalls,1);
});
test('A31 gateway failure after Google success retains both canonical proof and pending ciphertext',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterGoogle:()=>f.transport.setAvailable(false)}),/unavailable/);
  const id=f.delivery().id;assert(f.store.row(sid).cipher);f.reopen();await f.runtime.acknowledge(f.manual,id);
  assert.equal(f.status(sid).saved,true);assert.equal(f.google.stats().writerCalls,1);
});
test('A32 lost acknowledgement after gateway commit retries only the exact callback',async f=>{
  f.admit();const sid=f.submit();let lost=true;
  f.transport.setFault(async({path,invoke})=>{const result=await invoke();if(path==='/fixtures/pull/result'&&lost){lost=false;throw Error('lost ack');}return result;});
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/lost ack/);const id=f.delivery().id,version=f.store.version();
  f.transport.setFault(null);await f.runtime.acknowledge(f.manual,id);await f.runtime.acknowledge(f.manual,id);
  assert.equal(f.store.version(),version);assert.equal(f.status(sid).saved,true);assert.equal(f.google.stats().writerCalls,1);
});
for(const mode of ['before-file','after-file'])test('A33-'+mode+' partial source writes survive reopening without repair or another upload',async f=>{
  f.admit();const sid=f.submit();f.google.canonical.setMode(mode);await f.runtime.runOnce(f.manual);
  const id=f.delivery().id;f.reopen();const before=f.sourceDigest();await f.runtime.reconcile(f.manual,id);
  assert.equal(f.sourceDigest(),before);assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);
  assert.equal(f.google.stats().writerCalls,1);
});
test('A34 exact five-minute qualification is retained through the new pull path',async f=>{
  f.admit();const sid=await f.saved(f.input(300));const receipt=C.checked(googleKeys.publicKey,'recording-receipt',JSON.parse(f.store.row(sid).receipt));
  assert.equal(receipt.qualification.qualifying,true);assert.equal(receipt.qualification.thresholdSeconds,300);
});
test('A35 configured dispatch cap blocks additional canonical work',async f=>{
  f.admit();for(let n=0;n<6;n++)await f.saved();const last=f.submit();
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/cap reached/);assert.equal(f.status(last).saved,false);assert.equal(f.google.stats().writerCalls,6);
});
test('A36 approved window expiry pauses new work but still permits explicit internal reconciliation',async f=>{
  f.admit();const sid=f.submit();f.google.canonical.setMode('lost-response');await f.runtime.runOnce(f.manual);
  const id=f.delivery().id;f.advance(1800000);await rejectAsync(()=>f.runtime.runOnce(f.manual),/outside/);
  await f.runtime.reconcile(f.manual,id);assert.equal(f.status(sid).saved,true);assert.equal(f.google.stats().writerCalls,1);
});
test('A37 revocation during execution denies pupil access while preserving the exact internal outcome',async f=>{
  f.admit();const sid=f.submit();f.submit();await f.runtime.runOnce(f.manual,{afterArm:()=>f.revoke()});
  assert.equal(f.store.row(sid).phase,'confirmed');assert(f.store.row(sid).cipher);reject(()=>f.status(sid),/revoked/);
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/revoked/);assert.equal(f.google.stats().files,1);
});
test('A38 execution permission revoked after arming prevents the Google call',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterArm:()=>f.authority.revokeExecution(f.manual)}),/execution context/);
  assert(f.store.row(sid).cipher);untouched(f);
});
test('A39 unavailable signing key prevents new source work and never reports SAVED',async f=>{
  f.admit();const sid=f.submit();f.missing.add('google-sign');await rejectAsync(()=>f.runtime.runOnce(f.manual),/key unavailable/);
  assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);untouched(f);
});
test('A40 callback key loss after source success is recoverable without rewriting',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterGoogle:()=>f.missing.add('service-sign')}),/key unavailable/);
  const id=f.delivery().id;assert.equal(f.status(sid).saved,false);f.missing.clear();await f.runtime.acknowledge(f.manual,id);
  assert.equal(f.status(sid).saved,true);assert.equal(f.google.stats().writerCalls,1);
});
test('A41 forged canonical receipt is rejected even inside an authenticated worker result',async f=>{
  f.admit();const sid=f.submit();await rejectAsync(()=>f.runtime.runOnce(f.manual,{afterGoogle:()=>{throw Error('capture');}}),/capture/);
  const d=f.delivery();await rejectAsync(()=>rpc(f,'/fixtures/pull/result','owner.pull.result',{deliveryId:d.id,
    permitDigest:C.digest(JSON.parse(d.permit)),outcome:{state:'saved',receipt:{saved:true},reconciled:false}}),/Signature/);
  assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);
});
test('A42 callback cannot substitute another claimed delivery identity',async f=>{
  f.admit();await f.saved();const d=f.delivery(),job=f.runtime.job(d.id);
  await rejectAsync(()=>rpc(f,'/fixtures/pull/result','owner.pull.result',{deliveryId:randomUUID(),
    permitDigest:C.digest(JSON.parse(job.permit)),outcome:JSON.parse(job.outcome)}),/Foreign/);
});
test('A43 service credential revocation denies fresh claims and protected broker requests',async f=>{
  f.admit();f.submit();const q=f.createRead();f.flags.service=false;
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/credential revoked/);
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);untouched(f);
});
test('A44 Google timeout before source work retains ciphertext and forces inspection, never upload retry',async f=>{
  f.admit();const sid=f.submit();f.google.dispatch=async()=>{throw Error('mock Google timeout');};await f.runtime.runOnce(f.manual);
  assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);await f.runtime.reconcile(f.manual,f.delivery().id);
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/DIRTY/);untouched(f);
});
test('A45 lost arm response cannot cause an automatic second dispatch',async f=>{
  f.admit();const sid=f.submit();f.transport.setFault(async({path,invoke})=>{const result=await invoke();
    if(path==='/fixtures/pull/arm')throw Error('lost arm response');return result;});
  await rejectAsync(()=>f.runtime.runOnce(f.manual),/lost arm/);const id=f.delivery().id;f.reopen();
  await f.runtime.reconcile(f.manual,id);assert.equal(f.status(sid).saved,false);assert(f.store.row(sid).cipher);untouched(f);
});
test('A46 inspecting an already confirmed receipt is idempotent and preserves its revision',async f=>{
  f.admit();await f.saved();const version=f.store.version(),id=f.delivery().id;
  await f.runtime.reconcile(f.manual,id);await f.runtime.acknowledge(f.manual,id);
  assert.equal(f.store.version(),version);assert.equal(f.google.stats().writerCalls,1);
});

test('B01 relay carries only opaque handle and acknowledgement; gateway releases playback later',async f=>{
  f.admit();const input=f.input(),sid=await f.saved(input),q=f.createRead('playback.read',{sessionId:sid});
  const ack=await f.relay.run(f.web,q.relay);assert.deepEqual(Object.keys(ack),['ack']);
  const transcript=JSON.stringify(f.relay.transcript);
  for(const privateValue of [sid,input.recording.hash,input.encoded,'audioBase64','drive.google.com','workbook'])assert(!transcript.includes(privateValue));
  const result=f.release(q);assert.equal(result.data.hash,input.recording.hash);
  assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.headers['Referrer-Policy'],'no-referrer');
});
test('B02 PATH is available through the separate on-demand broker with no writer call',async f=>{
  f.admit();const sid=await f.saved(),before=f.google.stats().writerCalls,q=f.createRead();
  await f.relay.run(f.web,q.relay);assert.equal(f.release(q).data.sessions[0].sessionId,sid);assert.equal(f.google.stats().writerCalls,before);
});
test('B03 a broker acknowledgement is not a data-release authorisation',async f=>{
  f.admit();const q=f.createRead(),ack=await f.relay.run(f.web,q.relay);
  reject(()=>f.gateway.release({...f.owner},f.selection,f.client,q.readId),/Owner/);
  reject(()=>f.gateway.release(f.owner,f.selection,undefined,q.readId),/session/);
  reject(()=>f.gateway.release(f.owner,f.selection,f.client,ack.ack),/unavailable/);
});
test('B04 another authenticated Owner session cannot consume the original session response',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);
  reject(()=>f.gateway.release(f.owner,f.selection,f.authority.session(f.owner),q.readId),/session/);
  assert(f.release(q).data);
});
test('B05 one-use broker handle cannot be fetched twice, including after reopening',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.reopen();
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);assert(f.release(q).data);
});
test('B06 final release consumes its response exactly once',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.release(q);
  reject(()=>f.release(q),/fresh read/);assert.equal(f.gateway.readRow(q.readId).cipher,null);
});
test('B07 foreign actor, pupil, organisation and environment cannot request or release saved audio',async f=>{
  f.admit();const sid=await f.saved(),q=f.createRead('playback.read',{sessionId:sid});await f.relay.run(f.web,q.relay);
  for(const selection of [{...f.selection,pupil:'synthetic-other'},{...f.selection,organisation:'OTHER'},
    {...f.selection,environment:'fixture-other'}]){
    reject(()=>f.gateway.newRead(f.owner,selection,f.client,'playback.read',{sessionId:sid}),/selection/);
    reject(()=>f.gateway.release(f.owner,selection,f.client,q.readId),/selection/);
  }
  const other=f.identities.actor('synthetic-other');
  reject(()=>f.gateway.newRead(other,f.selection,f.authority.session(other),'playback.read',{sessionId:sid}),/Owner/);
});
test('B08 raw file IDs, URLs, workbook and folder selectors never enter the broker',async f=>{
  f.admit();for(const payload of [{fileId:'synthetic-file'},{sessionId:randomUUID(),folder:'synthetic-other'},
    {sessionId:'https://drive.google.com/file/d/synthetic/view'}])reject(()=>f.createRead('playback.read',payload));
  await rejectAsync(()=>f.relay.run(f.web,{handle:'a'.repeat(43),url:'https://synthetic-other.invalid'}),/selector/);
});
test('B09 wrong relay origin and non-Owner Google web context are denied',async f=>{
  f.admit();const q=f.createRead();await rejectAsync(()=>f.relay.run(f.web,q.relay,{},'https://synthetic-other.invalid'),/origin/);
  await rejectAsync(()=>f.relay.run(f.manual,q.relay),/unavailable/);
  await rejectAsync(()=>f.relay.run(f.authority.execution('synthetic-other','owner-web'),q.relay),/unavailable/);
  assert.equal(f.transport.calls.length,0);
});
test('B10 revocation after request creation prevents source inspection',async f=>{
  f.admit();const q=f.createRead();f.revoke();await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);
  assert(!f.remote.includes('canonical.read'));
});
test('B11 revocation between source read and callback prevents all private release',async f=>{
  f.admit();const sid=await f.saved(),q=f.createRead('playback.read',{sessionId:sid});
  await rejectAsync(()=>f.relay.run(f.web,q.relay,{afterSource:()=>f.revoke()}),/unavailable/);
  reject(()=>f.release(q));assert.equal(f.gateway.readRow(q.readId).cipher,null);
  assert(!JSON.stringify(f.relay.transcript).includes('audioBase64'));
});
test('B12 revocation after callback still denies final release of staged evidence',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);assert(f.gateway.readRow(q.readId).cipher);
  f.revoke();reject(()=>f.release(q),/revoked/);
});
test('B13 expired admission and renewed admission revisions invalidate old read requests',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.admit();reject(()=>f.release(q),/admission/);
  f.advance(3600000);reject(()=>f.createRead(),/expired/);
});
test('B14 read deadline expiry prevents stale-on-error fallback',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.advance(30000);
  reject(()=>f.release(q),/deadline/);assert(f.gateway.readRow(q.readId).cipher);
});
test('B15 a DIRTY source operation blocks request creation and staged response release',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);
  f.store.begin(f.owner,f.selection,f.operation('teacher.comment'));
  reject(()=>f.createRead(),/DIRTY/);reject(()=>f.release(q),/DIRTY/);
});
test('B16 changed target revision during retrieval discards the source response',async f=>{
  f.admit();const q=f.createRead();await rejectAsync(()=>f.relay.run(f.web,q.relay,
    {afterSource:()=>f.oldPipe.change(f.owner,f.selection,f.operation('target.change'))}),/unavailable/);
  reject(()=>f.release(q));assert.equal(f.gateway.readRow(q.readId).cipher,null);
});
test('B17 independent session revocation denies an otherwise admitted final read',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.authority.revokeSession(f.client);
  reject(()=>f.release(q),/session denied/);
});
test('B18 successful PATH and playback inspection leaves canonical data byte-for-byte unchanged',async f=>{
  f.admit();const sid=await f.saved(),before=f.sourceDigest();
  for(const q of [f.createRead(),f.createRead('playback.read',{sessionId:sid})]){await f.relay.run(f.web,q.relay);f.release(q);}
  assert.equal(f.sourceDigest(),before);assert.equal(f.google.stats().writerCalls,1);
});
test('B19 missing canonical META is not repaired by protected inspection',async f=>{
  f.admit();const sid=await f.saved();f.google.canonical.tables['SESSION META'].splice(1);const before=f.sourceDigest();
  const q=f.createRead('playback.read',{sessionId:sid});await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);
  assert.equal(f.sourceDigest(),before);reject(()=>f.release(q));
});
test('B20 changed canonical audio or folder never yields playback',async f=>{
  f.admit();const sid=await f.saved(),file=[...f.google.canonical.files.values()][0];file.folder='synthetic-foreign';
  const q=f.createRead('playback.read',{sessionId:sid});await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);reject(()=>f.release(q));
});
test('B21 signed foreign PATH session is rejected by independent gateway projection checks',async f=>{
  f.admit();await f.saved();badView(f,v=>{v.data.sessions[0].sessionId=randomUUID();});const q=f.createRead();
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);reject(()=>f.release(q));
});
test('B22 signed wrong playback bytes are rejected even if the broker returned a valid signature',async f=>{
  f.admit();const sid=await f.saved();badView(f,v=>{v.data.audioBase64=f.input(2).encoded;});const q=f.createRead('playback.read',{sessionId:sid});
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);reject(()=>f.release(q));
});
test('B23 mismatched authenticated read request digest cannot release a rebound response',async f=>{
  f.admit();badView(f,v=>{v.requestDigest='c'.repeat(64);});const q=f.createRead();
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);reject(()=>f.release(q));
});
test('B24 raw Drive URLs inside signed projections are rejected',async f=>{
  f.admit();badView(f,v=>{v.data.teacher['teacher.comment']='https://drive.google.com/file/d/synthetic/view';});const q=f.createRead();
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);assert(!JSON.stringify(f.relay.transcript).includes('drive.google.com'));
});
test('B25 duplicate read callback after lost gateway acknowledgement is idempotent and opaque',async f=>{
  f.admit();const q=f.createRead();let lost=true;
  f.transport.setFault(async({path,invoke})=>{const result=await invoke();if(path==='/fixtures/read/result'&&lost){lost=false;throw Error('lost read ack');}return result;});
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);const version=f.store.version();f.transport.setFault(null);
  const a=await f.runtime.retryReadCallback(f.web,q.readId),b=await f.runtime.retryReadCallback(f.web,q.readId);
  assert.deepEqual(a,b);assert.deepEqual(Object.keys(a),['ack']);assert.equal(f.store.version(),version);assert(f.release(q).data);
});
test('B26 broker interruption loses only an opaque acknowledgement; private data stays at gateway',async f=>{
  f.admit();const q=f.createRead();await rejectAsync(()=>f.relay.run(f.web,q.relay,{afterCallback:()=>{throw Error('browser interrupted');}}),/unavailable/);
  assert(f.release(q).data);assert(!JSON.stringify(f.relay.transcript).includes('sessions'));
});
test('B27 gateway outage after source inspection preserves canonical data and cannot leak via relay',async f=>{
  f.admit();const sid=await f.saved(),before=f.sourceDigest(),q=f.createRead('playback.read',{sessionId:sid});
  await rejectAsync(()=>f.relay.run(f.web,q.relay,{afterSource:()=>f.transport.setAvailable(false)}),/unavailable/);
  assert.equal(f.sourceDigest(),before);reject(()=>f.release(q));
  f.transport.setAvailable(true);await f.runtime.retryReadCallback(f.web,q.readId);assert(f.release(q).data.audioBase64);
});
test('B28 read staging key unavailable denies release without consuming original evidence',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);f.missing.add('read-staging');
  reject(()=>f.release(q),/key unavailable/);assert.equal(f.gateway.readRow(q.readId).state,'ready');
  f.missing.clear();assert(f.release(q).data);
});
test('B29 tampered encrypted read staging cannot release plaintext or consume the response',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);const row=f.gateway.readRow(q.readId),cipher=Buffer.from(row.cipher);cipher[0]^=1;
  f.store.db.prepare('UPDATE otr_reads SET cipher=? WHERE id=?').run(cipher,q.readId);
  reject(()=>f.release(q),/authenticate/);assert.equal(f.gateway.readRow(q.readId).state,'ready');
});
test('B30 exact read request and encrypted response survive both service reopenings',async f=>{
  f.admit();const sid=await f.saved(),q=f.createRead('playback.read',{sessionId:sid});await f.relay.run(f.web,q.relay);
  const before=f.gateway.readRow(q.readId);assert(!Buffer.from(before.cipher).includes(Buffer.from('audioBase64')));
  f.reopen();assert.equal(f.release(q).data.sessionId,sid);
});
test('B31 recording confirmation invalidates read snapshots and all recording/GROUP facets once',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);const before=f.store.facets();await f.saved();
  reject(()=>f.release(q),/revision/);const after=f.store.facets();
  for(const name of Object.keys(before))assert.equal(after[name]-before[name],['sessions','totals','availability','group'].includes(name)?1:0);
});
for(const event of ['teacher.comment','teacher.review','target.assign','badge.award','permission.change'])
test('B32-'+event+' source revision invalidates an already staged read',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);await f.oldPipe.change(f.owner,f.selection,f.operation(event));
  reject(()=>f.release(q),/revision/);const fresh=f.createRead();await f.relay.run(f.web,fresh.relay);
  assert.equal(f.release(fresh).data.teacher[event],'synthetic-change');
});
test('B33 browser relay refuses even a signed response that contains private data beside the ack',async f=>{
  f.admit();const q=f.createRead();f.transport.setFault(async({path,invoke})=>{const result=await invoke();
    return path==='/fixtures/read/result'?reSignReply(result,b=>{b.payload.value.data={sessions:[]};}):result;});
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);assert(!JSON.stringify(f.relay.transcript).includes('sessions'));
});
test('B34 an unbound historical source session fails closed without being adopted',async f=>{
  f.admit();const input=f.input(),sid=f.submit(input),m=JSON.parse(f.store.row(sid).manifest);
  f.google.canonical.rawUpload(m.binding,input.encoded);const before=f.sourceDigest(),q=f.createRead();
  await rejectAsync(()=>f.relay.run(f.web,q.relay),/unavailable/);assert.equal(f.sourceDigest(),before);
});
test('B35 no external HTTP, DNS socket or live Google request was attempted',()=>assert.equal(networkCalls,0));
test('B36 wrong read-response key cannot reopen transport state or replace pending evidence',async f=>{
  f.admit();const q=f.createRead();await f.relay.run(f.web,q.relay);const before=f.gateway.readRow(q.readId).result_hash;
  reject(()=>gateway({...f.config,store:f.store,keys:name=>name==='read-staging'?Buffer.alloc(32,7):f.config.keys(name)}),/configuration\/key mismatch/);
  assert.equal(f.gateway.readRow(q.readId).result_hash,before);assert(f.release(q).data);
});

// Success is possible only after all named cases and disposal checks complete.
process.exitCode=1;
(async()=>{
  let passed=0,failed=0,cleaned=0;
  for(const {name,run} of cases){let f;
    try{f=fixture();await run(f);passed++;console.log('PASS '+name);}
    catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
    finally{if(f){const directory=f.directory;f.close();assert.equal(fs.existsSync(directory),false);cleaned++;}}
  }
  console.log(JSON.stringify({suite:'owner-run-transport-and-protected-reads',registered:cases.length,passed,failed,skipped:0,
    unexecuted:0,externalNetworkCalls:networkCalls,disposableDirectoriesRemoved:cleaned}));
  process.exitCode=failed?1:0;
})();
