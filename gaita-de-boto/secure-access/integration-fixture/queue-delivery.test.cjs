'use strict';
const assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {testStore}=require('../queue-fixture/pg-test-store.cjs');
const {openPostgresQueue,postgresWorker,sign}=require('../queue-fixture/postgres.cjs');
const {canonicalFixture,wav,binding}=require('../queue-fixture/canonical-fixture.cjs');
const {receiverFixture,queueWriterFixture}=require('./receiver.cjs');
(async()=>{
 const store=await testStore();let n=0,time=1000,active=true;
 const actor={verified:true,subject:'guardian-a',scope:'google:fixture'},audio=wav();
 const keys={gateway:randomBytes(32),worker:randomBytes(32)};
 const authorise=b=>active&&b.subject===actor.subject&&b.pupil==='child-a';
 const queue=await openPostgresQueue({pool:store.pool,fixtureOnly:true,keys,stageKey:randomBytes(32),authorize:authorise,now:()=>time});
 let canonical,receiver,writer,worker;
 const reset=async()=>{await store.pool.query('DELETE FROM gdb_fixture_queue_stage; DELETE FROM gdb_fixture_queue_job');active=true;canonical=canonicalFixture({fixtureOnly:true,authorize:authorise});receiver=receiverFixture({fixtureOnly:true,canonical,authorize:(a,b)=>a.verified===true&&authorise(b)});writer=queueWriterFixture({fixtureOnly:true,receiver,actorForBinding:async()=>actor});worker=postgresWorker({queue,key:keys.worker,id:'integration-worker',writer,now:()=>time});};
 const submit=b=>queue.request(sign(keys.gateway,'gateway','submit',{binding:b,audioBase64:audio.toString('base64')},time));
 const check=async(name,fn)=>{await reset();await fn();n++;console.log('PASS '+name);};
 try{
 await check('actual PGlite queue → private receiver fixture → existing writer → exact receipt → confirmation',async()=>{const b=binding(audio),accepted=await submit(b);assert.equal(accepted.saved,false);assert.equal(accepted.retainLocalAudio,true);const saved=await worker();assert.equal(saved.saved,true);assert.deepEqual(saved.result.binding,b);assert.equal(saved.retainLocalAudio,false);assert.equal(canonical.counts().uploads,1);assert.equal((await store.pool.query('SELECT * FROM gdb_fixture_queue_stage')).rows.length,0);assert(!JSON.stringify(saved).includes('drive.google.com'));});
 await check('lost canonical success response is inspected without a second upload',async()=>{canonical.setMode('lost-response');await submit(binding(audio));assert.equal((await worker()).saved,true);assert.equal(canonical.counts().uploads,1);});
 await check('partial STARTED/orphan outcome stays manual across queue receipt-only reconciliation',async()=>{const j=await submit(binding(audio));canonical.setMode('after-file');assert.equal((await worker()).state,'manual');canonical.setMode('normal');assert.equal((await worker.reconcile(j.id)).state,'manual');assert.equal(canonical.counts().uploads,1);assert.equal((await store.pool.query('SELECT * FROM gdb_fixture_queue_stage')).rows.length,1);});
 await check('unknown dispatch with no canonical evidence cannot be automatically uploaded again',async()=>{const j=await submit(binding(audio));let attempts=0;canonical.writer.upload=async()=>{attempts++;throw Error('unknown');};assert.equal((await worker()).state,'manual');assert.equal((await worker.reconcile(j.id)).state,'manual');assert.equal(attempts,1);});
 await check('historical saved file without identity manifest never receives a new identity through queue retry',async()=>{const b=binding(audio);await canonical.writer.upload(b,audio.toString('base64'));const j=await submit(b);assert.equal((await worker()).state,'manual');assert.equal((await worker.reconcile(j.id)).saved,false);assert.equal(receiver.manifests.size,0);assert.equal(canonical.counts().uploads,1);});
 await check('revoked current membership prevents queued write and keeps encrypted staging',async()=>{await submit(binding(audio));active=false;assert.equal(await worker(),null);assert.equal(canonical.counts().uploads,0);assert.equal((await store.pool.query('SELECT * FROM gdb_fixture_queue_stage')).rows.length,1);});
 await check('missing metadata remains read-only attention until explicit canonical repair then receipt-only recovery',async()=>{const b=binding(audio);receiver.manifests.set(b.sessionId,{binding:b,state:'dispatched'});await canonical.writer.upload(b,audio.toString('base64'));canonical.tables['SESSION META'].splice(1);const j=await submit(b);assert.equal((await worker()).state,'manual');assert.equal(canonical.tables['SESSION META'].length,1);await canonical.writer.receipt(b);assert.equal((await worker.reconcile(j.id)).saved,true);assert.equal(canonical.counts().uploads,1);});
 console.log(`${n} new queue-delivery fixture checks passed; ${store.native?'local native DB':'PGlite single connection'}; Google identity/locks/storage and manifests simulated.`);
 }finally{await store.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
