'use strict';
// PREPARED, NOT NATIVE-EXECUTED HERE. Only an explicitly approved disposable Docker fixture.
const assert=require('node:assert/strict'),{randomBytes,randomUUID,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process'),{mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path');
const cases=['distinct native connections','held-row SKIP LOCKED barrier','terminated-backend transaction rollback','opposing-lock deadlock rollback','server restart preserves nonce/receipt/staging','native dump and independent restore'];
if(process.argv.includes('--list')){console.log(JSON.stringify({status:'PREPARED_NOT_EXECUTED',cases},null,2));process.exit(0);}
if(process.env.GDB_NATIVE_APPROVED!=='DISPOSABLE_FIXTURES_ONLY')throw Error('Explicit native-fixture approval flag required; no connection attempted.');
const u=new URL(process.env.GDB_FIXTURE_NATIVE_URL||'invalid:');
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='55432'||u.pathname!=='/gdb_work4_fixture'||u.username!=='postgres'||u.password!=='gdb-fixture-only')throw Error('Only the documented non-secret loopback disposable fixture is allowed.');
const container=process.env.GDB_FIXTURE_CONTAINER_NAME||'';
if(!/^gdb-native-[a-z0-9-]{1,60}$/.test(container))throw Error('Owned fixture container required.');
const docker=(args,opts={})=>execFileSync('docker',args,{timeout:30000,maxBuffer:32*1024*1024,...opts});
if(docker(['inspect','--format','{{index .Config.Labels "gdb.fixture"}}',container]).toString().trim()!=='1')throw Error('Container lacks fixture ownership label.');
const {Pool}=require('pg');
const {openPostgresQueue,postgresWorker,sign}=require('../queue-fixture/postgres.cjs');
const {canonicalFixture,wav,binding}=require('../queue-fixture/canonical-fixture.cjs');
const {receiverFixture,queueWriterFixture}=require('../integration-fixture/receiver.cjs');
(async()=>{
 let pool,restorePool,restoreCreated=false;const evidence=[],directory=mkdtempSync(join(tmpdir(),'gdb-native-backup-'));
 const newPool=connectionString=>{const p=new Pool({connectionString,max:6,connectionTimeoutMillis:1000,statement_timeout:5000,application_name:'gdb-native-fixture-only'});p.on('error',()=>{});return p;};
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const check=async(name,fn)=>{await fn();evidence.push({name,passed:true});console.log('PASS NATIVE '+name);};
 const keys={gateway:randomBytes(32),worker:randomBytes(32)},stageKey=randomBytes(32),now=()=>100000;
 const config=()=>({pool,fixtureOnly:true,keys,stageKey,authorize:b=>b.pupil==='child-a'&&b.subject==='guardian-a',now});
 let queue;const request=(role,op,body)=>queue.request(sign(keys[role],role,op,body,now()));
 const audio=wav(),submit=b=>request('gateway','submit',{binding:b,audioBase64:audio.toString('base64')});
 async function fingerprint(p){const state={};for(const table of ['gdb_fixture_queue_nonce','gdb_fixture_queue_job','gdb_fixture_queue_stage'])state[table]=(await p.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return hash(JSON.stringify(state));}
 try{
  pool=newPool(u.href);await pool.query('SELECT 1');queue=await openPostgresQueue(config());
  const server=(await pool.query('SELECT version() AS version')).rows[0].version;
  const major=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num);assert(major>=180000&&major<190000,'Approved PostgreSQL 18 required');
  await check(cases[0],async()=>{const a=await pool.connect(),b=await pool.connect();try{assert.notEqual((await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);}finally{a.release();b.release();}});
  await pool.query('DELETE FROM gdb_fixture_queue_stage; DELETE FROM gdb_fixture_queue_job');
  await check(cases[1],async()=>{const jobs=[await submit(binding(audio)),await submit(binding(audio))].sort((a,b)=>a.id.localeCompare(b.id)),lock=await pool.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM gdb_fixture_queue_job WHERE id=$1 FOR UPDATE',[jobs[0].id]);const claimed=await request('worker','claim',{worker:'skip-locked'});assert.equal(claimed.id,jobs[1].id);await lock.query('ROLLBACK');assert.equal((await request('worker','claim',{worker:'after-release'})).id,jobs[0].id);}finally{await lock.query('ROLLBACK');lock.release();}});
  await pool.query('CREATE TABLE IF NOT EXISTS gdb_fixture_native_lock(id integer PRIMARY KEY,value integer NOT NULL); INSERT INTO gdb_fixture_native_lock VALUES(1,0),(2,0) ON CONFLICT(id) DO UPDATE SET value=0');
  await check(cases[2],async()=>{const a=await pool.connect(),b=await pool.connect();a.on('error',()=>{});const nonce=randomUUID();try{await a.query('BEGIN');await a.query('UPDATE gdb_fixture_native_lock SET value=100 WHERE id=1');await a.query("INSERT INTO gdb_fixture_queue_nonce VALUES('worker',$1)",[nonce]);const pid=(await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;assert.equal((await b.query('SELECT pg_terminate_backend($1) AS terminated',[pid])).rows[0].terminated,true);assert.equal((await b.query('UPDATE gdb_fixture_native_lock SET value=value+1 WHERE id=1 RETURNING value')).rows[0].value,1);assert.equal((await b.query('SELECT * FROM gdb_fixture_queue_nonce WHERE nonce=$1',[nonce])).rows.length,0);}finally{a.release(true);b.release();}});
  await check(cases[3],async()=>{const a=await pool.connect(),b=await pool.connect();try{for(const c of [a,b]){await c.query('BEGIN');await c.query("SET LOCAL deadlock_timeout='200ms'");}await a.query('SELECT * FROM gdb_fixture_native_lock WHERE id=1 FOR UPDATE');await b.query('SELECT * FROM gdb_fixture_native_lock WHERE id=2 FOR UPDATE');const cross=async(c,id)=>{try{return await c.query('SELECT * FROM gdb_fixture_native_lock WHERE id=$1 FOR UPDATE',[id]);}catch(e){await c.query('ROLLBACK');throw e;}};const r=await Promise.allSettled([cross(a,2),cross(b,1)]);assert.equal(r.filter(x=>x.status==='rejected'&&x.reason.code==='40P01').length,1);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);}finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}});
  await pool.query('DELETE FROM gdb_fixture_queue_stage; DELETE FROM gdb_fixture_queue_job');
  const actor={verified:true,subject:'guardian-a',scope:'google:fixture'},canonical=canonicalFixture({fixtureOnly:true,authorize:()=>true});
  const receiver=receiverFixture({fixtureOnly:true,canonical,authorize:()=>true}),writer=queueWriterFixture({fixtureOnly:true,receiver,actorForBinding:async()=>actor});
  const savedBinding=binding(audio),envelope=sign(keys.gateway,'gateway','submit',{binding:savedBinding,audioBase64:audio.toString('base64')},now());
  const saved=await queue.request(envelope);assert.equal((await postgresWorker({queue,key:keys.worker,id:'native-audit',writer,now})()).saved,true);
  const pending=await submit(binding(audio));const before=await fingerprint(pool);
  await check(cases[4],async()=>{await pool.end();pool=null;docker(['restart',container]);pool=newPool(u.href);let ready=false;for(let i=0;i<80;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert(ready,'Native server did not restart');queue=await openPostgresQueue(config());assert.equal(await fingerprint(pool),before);await assert.rejects(queue.request(envelope),e=>e.code==='23505');assert.equal((await request('gateway','status',{id:saved.id,subject:actor.subject})).saved,true);assert.equal((await request('gateway','status',{id:pending.id,subject:actor.subject})).retainLocalAudio,true);});
  await check(cases[5],async()=>{const dump=docker(['exec','-u','postgres',container,'pg_dump','--format=custom','--no-owner','--no-acl','--dbname=gdb_work4_fixture']);const archive=join(directory,'synthetic-native.dump');writeFileSync(archive,dump,{mode:0o600});await pool.query('CREATE DATABASE gdb_work4_restore_fixture');restoreCreated=true;docker(['exec','-i','-u','postgres',container,'pg_restore','--no-owner','--no-privileges','--exit-on-error','--dbname=gdb_work4_restore_fixture'],{input:readFileSync(archive)});const target=new URL(u);target.pathname='/gdb_work4_restore_fixture';restorePool=newPool(target.href);assert.equal(await fingerprint(restorePool),await fingerprint(pool));evidence.push({backupBytes:dump.length,backupSha256:hash(dump),restoredDatabase:'gdb_work4_restore_fixture',containsOnly:'synthetic fixture data'});await restorePool.end();restorePool=null;});
  const image=docker(['inspect','--format','{{.Image}}',container]).toString().trim();
  console.log(JSON.stringify({status:'NATIVE_SUPPLEMENT_PASSED',server,node:process.version,containerImage:image,imageRepoDigests:JSON.parse(docker(['image','inspect','--format','{{json .RepoDigests}}',image]).toString()),passed:cases.length,evidence,scope:'Native fixture SQL only; Google/manifest/device behavior not certified'},null,2));
 }finally{if(restorePool)await restorePool.end();if(pool){if(restoreCreated)await pool.query('DROP DATABASE gdb_work4_restore_fixture WITH (FORCE)');await pool.end();}rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error('Native fixture failed:',e.code||'',e.message);process.exitCode=1;});
