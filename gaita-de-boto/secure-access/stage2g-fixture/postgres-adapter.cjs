'use strict';
// Offline pool adapter. No connection string, listener, Google caller or production import.
const fs=require('node:fs'),path=require('node:path'),C=require('node:crypto');
const {P,digest,exact,uuid,envelope,checked}=require('./protocol.cjs');
const {validBinding,bytes}=require('../queue-fixture/postgres.cjs');
const {identity,verifyDeviceSource}=require('../stage2i-fixture/confirmation.cjs');
const {validateProjection}=require('./projection.cjs');
const hash=x=>C.createHash('sha256').update(x).digest('hex');
function seal(key,value,aad){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Encryption key unavailable.');const iv=C.randomBytes(12),c=C.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));return{iv,cipher:Buffer.concat([c.update(value),c.final()]),tag:c.getAuthTag()};}
function unseal(key,row,aad){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Encryption key unavailable.');const c=C.createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv));c.setAAD(Buffer.from(aad));c.setAuthTag(Buffer.from(row.tag));return Buffer.concat([c.update(Buffer.from(row.cipher)),c.final()]);}
const FACETS={'recording.saved':['sessions','totals','availability','group'],'teacher.comment':['comments'],'teacher.review':['reviews','targets','badges'],
 'target.assign':['targets'],'target.change':['targets','catalogue'],'badge.award':['badges'],'badge.change':['badges','catalogue'],'session.target':['sessions','targets'],
 'permission.change':['access','group']};
async function openAdapter(config){
 const {fixtureOnly,pool,profiles,profile,identities,now,stageKey,readKey,gatewayKey,sourceKeys,serviceKeys,integrity,dispatchAuthority,leaseMs=1000}=config;
 if(!fixtureOnly||typeof integrity!=='function'||!dispatchAuthority||!pool?.connect||!profiles||!identities||!Buffer.isBuffer(stageKey)||stageKey.length!==32||!Buffer.isBuffer(readKey)||readKey.length!==32)throw Error('Offline adapter opt-in required.');
 const env=profile.environment,ns={environment:env,profileDigest:profiles.digest(profile)},selection={environment:env,organisation:profile.organisation,pupil:profile.pupil};
 let activeTransactions=0,fault=null;
 async function tx(fn){const c=await pool.connect();let started=false;try{await c.query('BEGIN');started=true;activeTransactions++;const result=await fn(c);if(fault==='rollback'){fault=null;throw Error('Injected transaction rollback.');}await c.query('COMMIT');return result;}catch(e){if(started)await c.query('ROLLBACK');throw e;}finally{if(started)activeTransactions--;c.release();}}
 async function install(){await pool.query(fs.readFileSync(path.join(__dirname,'postgres.sql'),'utf8'));const fingerprint=digest({profile,stageKey:hash(stageKey),readKey:hash(readKey)});
  await tx(async c=>{const old=(await c.query('SELECT fingerprint FROM gdb_g_config WHERE environment=$1 FOR UPDATE',[env])).rows[0];if(old&&old.fingerprint!==fingerprint)throw Error('Database profile/key mismatch; evidence retained.');
   await c.query('INSERT INTO gdb_g_config VALUES($1,$2) ON CONFLICT DO NOTHING',[env,fingerprint]);
   await c.query("INSERT INTO gdb_g_admission VALUES($1,$2,$3,0,'inactive',0,'[]') ON CONFLICT DO NOTHING",[env,profile.owner,profile.pupil]);
   await c.query("INSERT INTO gdb_g_revision VALUES($1,$2,0,NULL,$3) ON CONFLICT DO NOTHING",[env,C.randomUUID(),P.canonical(Object.fromEntries(['sessions','totals','availability','group','comments','reviews','targets','badges','catalogue','access'].map(k=>[k,0])))]);});}
 const job=async(c,sid)=>(await c.query('SELECT * FROM gdb_g_job WHERE environment=$1 AND session=$2 FOR UPDATE',[env,sid])).rows[0];
 const admission=async c=>(await c.query('SELECT * FROM gdb_g_admission WHERE environment=$1 FOR UPDATE',[env])).rows[0];
 const revision=async c=>(await c.query('SELECT * FROM gdb_g_revision WHERE environment=$1 FOR UPDATE',[env])).rows[0];
 const version=r=>r.generation+':'+r.number;
 function select(s){if(!exact(s,['environment','organisation','pupil'])||Object.keys(selection).some(k=>s[k]!==selection[k]))throw Error('Foreign environment or resource selector.');}
 async function auth(c,actor,op,s=selection){integrity();select(s);profiles.assert(profile,s,now(),op);identities.check(actor,'owner',profile.owner);const a=await admission(c);
  if(a.status!=='active'||Number(a.expires)<=now()||a.subject!==actor.subject||a.pupil!==profile.pupil||!JSON.parse(a.operations).includes(op))throw Error('Admission revoked, expired or denied.');return a;}
 async function bump(c,event,clear=false){const r=await revision(c),facets=JSON.parse(r.facets);for(const k of FACETS[event]||[])facets[k]++;
  await c.query('UPDATE gdb_g_revision SET number=number+1,facets=$2,dirty=$3 WHERE environment=$1',[env,P.canonical(facets),clear?null:r.dirty]);return version({...r,number:r.number+1});}
 async function grant(actor,{status='active',expires=now()+60000,operations=profile.operations,expectedRevision}){identities.check(actor,'owner',profile.owner);
  if(!['active','revoked','inactive'].includes(status)||!Number.isSafeInteger(expires)||!Array.isArray(operations)||operations.some(x=>!profile.operations.includes(x)))throw Error('Invalid admission request.');
  const revision=await tx(async c=>{const a=await admission(c);if(a.revision!==expectedRevision)throw Error('Admission CAS conflict.');await c.query('UPDATE gdb_g_admission SET revision=revision+1,status=$2,expires=$3,operations=$4 WHERE environment=$1',[env,status,expires,P.canonical(operations)]);await bump(c,'permission.change');return a.revision+1;});dispatchAuthority.setAdmission({status,revision,expires});return revision;}
 async function submit(actor,s,recording,encoded){return tx(async c=>{const a=await auth(c,actor,'recording.submit',s),r=await revision(c);
  if(!validBinding(recording)||recording.organisation!==profile.organisation||recording.pupil!==profile.pupil||recording.subject!==actor.subject||recording.sessionId!==profile.sessionId)throw Error('Original identity rejected.');
  const audio=bytes(recording,encoded),original={binding:recording,originalActor:{issuer:'https://accounts.google.com',subject:actor.subject,scope:'google:fixture'},profileDigest:ns.profileDigest};
  const old=await job(c,recording.sessionId);if(old){const m=JSON.parse(old.manifest);if(digest({...original})!==digest({binding:m.binding,originalActor:m.originalActor,profileDigest:m.profileDigest}))throw Error('Immutable original conflict.');return publicStatus(old);}
  if(r.dirty)throw Error('DIRTY source.');const manifest={...original,operation:C.randomUUID(),baseVersion:version(r),admissionRevision:a.revision},mHash=digest(manifest),encrypted=seal(stageKey,audio,mHash);
  await c.query("INSERT INTO gdb_g_job(environment,session,manifest,manifest_hash,phase,iv,cipher,tag) VALUES($1,$2,$3,$4,'queued',$5,$6,$7)",[env,recording.sessionId,P.canonical(manifest),mHash,encrypted.iv,encrypted.cipher,encrypted.tag]);return publicStatus({phase:'queued',manifest:P.canonical(manifest),manifest_hash:mHash});});}
 function publicStatus(r){const m=JSON.parse(r.manifest),b=m.binding;let sourceConfirmation=null;if(r.phase==='confirmed'){const q=checked(sourceKeys,'recording.receipt',ns,JSON.parse(r.receipt),now(),{historical:true}).payload;sourceConfirmation=q.deviceReceipt;}
  return{saved:r.phase==='confirmed',sessionId:b.sessionId,...(r.phase==='confirmed'?{hash:b.hash,byteLength:b.length,mimeType:b.mimeType,validatedSeconds:b.durationSeconds}: {state:'SAFE ON DEVICE — awaiting confirmation'}),
   retainLocalAudio:r.phase!=='confirmed',identity:identity(m,ns),manifest:m,manifestDigest:r.manifest_hash,sourceConfirmation};}
 async function status(actor,s,sid){return tx(async c=>{await auth(c,actor,'recording.status',s);const r=await job(c,sid);if(!r)throw Error('Unknown original.');return publicStatus(r);});}
 async function claim(worker,owner){identities.check(worker,'worker');return tx(async c=>{await auth(c,owner,'recording.submit');const r=await revision(c);if(r.dirty)throw Error('DIRTY source.');
  const j=(await c.query("SELECT * FROM gdb_g_job WHERE environment=$1 AND (phase='queued' OR (phase='leased' AND lease<=$2)) ORDER BY session FOR UPDATE SKIP LOCKED LIMIT 1",[env,now()])).rows[0];if(!j)return null;
  const fence=j.fence+1,lease=now()+leaseMs;await c.query("UPDATE gdb_g_job SET phase='leased',worker=$3,fence=$4,lease=$5 WHERE environment=$1 AND session=$2",[env,j.session,worker.subject,fence,lease]);
  return{sessionId:j.session,worker:worker.subject,fence,lease,manifest:JSON.parse(j.manifest),manifestHash:j.manifest_hash};});}
 async function arm(worker,owner,permit){identities.check(worker,'worker');const result=await tx(async c=>{const a=await auth(c,owner,'recording.submit'),r=await revision(c),j=await job(c,permit.sessionId);
  if(!j||j.phase!=='leased'||j.worker!==worker.subject||permit.worker!==worker.subject||j.fence!==permit.fence||Number(j.lease)!==permit.lease||permit.lease<=now()||j.manifest_hash!==permit.manifestHash||digest(permit.manifest)!==j.manifest_hash||r.dirty)throw Error('Lease/fence/manifest rejected.');
  const m=JSON.parse(j.manifest);if(m.baseVersion!==version(r))throw Error('Original revision changed.');
  const audio=unseal(stageKey,j,j.manifest_hash);bytes(m.binding,audio.toString('base64'));
  await c.query("UPDATE gdb_g_job SET phase='sent' WHERE environment=$1 AND session=$2",[env,j.session]);await c.query('UPDATE gdb_g_revision SET dirty=$2 WHERE environment=$1',[env,m.operation]);
  return{audio,dispatch:envelope(gatewayKey,'recording.dispatch',ns,{permit,admissionRevision:a.revision},now()),admissionRevision:a.revision};});dispatchAuthority.register(permit,result.admissionRevision);return result;}
 function receiptData(j,signed){const q=checked(sourceKeys,'recording.receipt',ns,signed,now(),{historical:true}).payload,m=JSON.parse(j.manifest),b=m.binding;
  if(!exact(q,['manifestHash','binding','canonical','qualification','operation','admissionRevision','baseVersion','deviceReceipt'])||q.manifestHash!==j.manifest_hash||digest(q.binding)!==digest(b)||q.operation!==m.operation||q.baseVersion!==m.baseVersion||q.admissionRevision<m.admissionRevision||
    q.canonical?.organisation!==profile.organisation||q.canonical.pupil!==profile.pupil||q.canonical.sessionId!==b.sessionId||!q.canonical.fileId||q.canonical.folderId!==profile.folder||
    q.canonical.fileHash!==b.hash||q.canonical.byteLength!==b.length||q.canonical.mimeType!==b.mimeType||q.canonical.validatedSeconds!==b.durationSeconds||!q.canonical.log?.identityDigest||!q.canonical.meta?.identityDigest||
    !exact(q.canonical,['organisation','pupil','sessionId','fileId','folderId','fileHash','byteLength','mimeType','validatedSeconds','durationEvidence','validatedStartIso','validatedEndIso','log','meta'])||
    q.canonical.validatedStartIso!==b.startIso||q.canonical.validatedEndIso!==b.endIso||!['pcm-sample-count','opus-packet-sample-count'].includes(q.canonical.durationEvidence)||
    !exact(q.canonical.log,['sheet','identityDigest'])||q.canonical.log.sheet!=='PRACTICE LOG'||!exact(q.canonical.meta,['sheet','identityDigest'])||q.canonical.meta.sheet!=='SESSION META'||
    !/^[a-f0-9]{64}$/.test(q.canonical.log.identityDigest)||!/^[a-f0-9]{64}$/.test(q.canonical.meta.identityDigest)||
    !exact(q.qualification,['thresholdSeconds','validatedSeconds','qualifying'])||q.qualification.thresholdSeconds!==300||q.qualification.validatedSeconds!==b.durationSeconds||q.qualification.qualifying!==(b.durationSeconds>=300))throw Error('Exact source receipt rejected.');const {deviceReceipt,...base}=q;verifyDeviceSource(sourceKeys,ns,deviceReceipt,m,now(),base);return q;}
 async function complete(worker,permit,signed,{reconcile=false}={}){identities.check(worker,reconcile?'recovery':'worker');integrity();if(profiles.current()!==profile)throw Error('Resource profile changed.');return tx(async c=>{await admission(c);const r=await revision(c),j=await job(c,permit.sessionId);if(!j||!['sent','attention','confirmed'].includes(j.phase))throw Error('No original dispatch.');
  const q=receiptData(j,signed);if(j.phase==='confirmed'){if(digest(receiptData(j,JSON.parse(j.receipt)))!==digest(q))throw Error('Conflicting exact confirmation.');return publicStatus(j);}
  if(!reconcile&&(j.worker!==worker.subject||j.fence!==permit.fence||Number(j.lease)<=now()))throw Error('Stale worker cannot complete.');
  const m=JSON.parse(j.manifest);if(r.dirty!==m.operation)throw Error('DIRTY operation mismatch.');
  await c.query("UPDATE gdb_g_job SET phase='confirmed',receipt=$3 WHERE environment=$1 AND session=$2",[env,j.session,P.canonical(signed)]);await bump(c,'recording.saved',true);
  return publicStatus({...j,phase:'confirmed',receipt:P.canonical(signed)});});}
 async function uncertain(worker,sid){identities.check(worker,'worker');return tx(async c=>{const j=await job(c,sid);if(j&&j.phase==='sent')await c.query("UPDATE gdb_g_job SET phase='attention' WHERE environment=$1 AND session=$2",[env,sid]);});}
 async function consume(signed,purpose){const b=checked(serviceKeys,purpose,ns,signed,now());return tx(c=>c.query('INSERT INTO gdb_g_nonce VALUES($1,$2,$3,$4,$5)',[env,b.kid,purpose,b.nonce,digest(b)]));}
 async function beginChange(actor,event,operation,value){if(!Object.hasOwn(FACETS,event)||event==='recording.saved'||!uuid(operation))throw Error('Unknown revision event.');return tx(async c=>{await auth(c,actor,'path.read');const r=await revision(c),h=digest({event,operation,value});
  const old=(await c.query('SELECT * FROM gdb_g_operation WHERE environment=$1 AND operation=$2',[env,operation])).rows[0];if(old){if(old.request_hash!==h)throw Error('Operation conflict.');return old;}
  if(r.dirty)throw Error('DIRTY source.');await c.query("INSERT INTO gdb_g_operation VALUES($1,$2,$3,$4,'dirty',NULL)",[env,operation,event,h]);await c.query('UPDATE gdb_g_revision SET dirty=$2 WHERE environment=$1',[env,operation]);return{operation,event,request_hash:h,baseVersion:version(r)};});}
 async function finishChange(actor,operation,proof){return tx(async c=>{await auth(c,actor,'path.read');const o=(await c.query('SELECT * FROM gdb_g_operation WHERE environment=$1 AND operation=$2 FOR UPDATE',[env,operation])).rows[0];if(!o)throw Error('Unknown operation.');
  const q=checked(sourceKeys,'operation.receipt',ns,proof,now()).payload;if(q.operation!==operation||q.requestDigest!==o.request_hash||!q.sourceDigest)throw Error('Source operation proof rejected.');if(o.state==='complete')return;
  const r=await revision(c);if(r.dirty!==operation)throw Error('DIRTY mismatch.');await c.query("UPDATE gdb_g_operation SET state='complete',proof=$3 WHERE environment=$1 AND operation=$2",[env,operation,P.canonical(proof)]);await bump(c,o.event,true);});}
 async function readCheck(c,row,actor,client){const a=await auth(c,actor,row.operation);if(row.actor!==actor.subject||row.client_session!==client.id)throw Error('Foreign read session.');identities.check(client,'session',actor.subject);const r=await revision(c);
  if(r.dirty||version(r)!==row.version||a.revision!==row.admission_revision||Number(row.expires)<=now())throw Error('Read stale, DIRTY, revoked or expired.');}
 async function newRead(actor,client,s,operation,sid=null){select(s);identities.check(client,'session',actor.subject);if(!['path.read','playback.read'].includes(operation)||(operation==='path.read'?sid!==null:sid!==profile.sessionId))throw Error('Read selection rejected.');
  return tx(async c=>{const a=await auth(c,actor,operation),r=await revision(c);if(r.dirty)throw Error('DIRTY source.');const id=C.randomUUID(),handle=C.randomBytes(32).toString('base64url');
   await c.query("INSERT INTO gdb_g_read(environment,id,handle_hash,actor,client_session,operation,session,admission_revision,version,expires,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')",[env,id,hash(handle),actor.subject,client.id,operation,sid,a.revision,version(r),now()+30000]);return{readId:id,relay:{handle}};});}
 async function fetchRead(worker,owner,client,relay){identities.check(worker,'worker');if(!exact(relay,['handle']))throw Error('Opaque handle only.');return tx(async c=>{const row=(await c.query('SELECT * FROM gdb_g_read WHERE environment=$1 AND handle_hash=$2 FOR UPDATE',[env,hash(relay.handle)])).rows[0];
  if(!row||row.state!=='pending')throw Error('Read handle used or unknown.');await readCheck(c,row,owner,client);const request=envelope(gatewayKey,'read.request',ns,{readId:row.id,operation:row.operation,sessionId:row.session,actor:row.actor,clientSession:row.client_session,version:row.version,admissionRevision:row.admission_revision,handleHash:row.handle_hash},now());
  await c.query("UPDATE gdb_g_read SET state='dispatched',request=$3 WHERE environment=$1 AND id=$2",[env,row.id,P.canonical(request)]);return request;});}
 async function stageRead(worker,owner,client,result){identities.check(worker,'worker');const q=checked(sourceKeys,'read.result',ns,result.proof,now()).payload;
  return tx(async c=>{const row=(await c.query('SELECT * FROM gdb_g_read WHERE environment=$1 AND id=$2 FOR UPDATE',[env,q.readId])).rows[0];if(!row||!row.request||!['dispatched','ready','consumed'].includes(row.state))throw Error('No original read.');
   if(q.requestDigest!==digest(JSON.parse(row.request))||q.dataDigest!==digest(result.data)||q.version!==row.version||q.admissionRevision!==row.admission_revision)throw Error('Read proof binding rejected.');
   await readCheck(c,row,owner,client);const jobs=(await c.query("SELECT manifest FROM gdb_g_job WHERE environment=$1 AND phase='confirmed' ORDER BY session",[env])).rows.map(r=>JSON.parse(r.manifest));validateProjection(result.data,row.operation,row.session,jobs,now());
   const resultHash=digest(result);if(row.result_hash){if(row.result_hash!==resultHash)throw Error('Read callback conflict.');return{ack:row.id};}
   const enc=seal(readKey,Buffer.from(P.canonical(result)),row.id+row.version);await c.query("UPDATE gdb_g_read SET state='ready',result_hash=$3,iv=$4,cipher=$5,tag=$6 WHERE environment=$1 AND id=$2",[env,row.id,resultHash,enc.iv,enc.cipher,enc.tag]);return{ack:row.id};});}
 async function release(actor,client,s,id){select(s);return tx(async c=>{const row=(await c.query('SELECT * FROM gdb_g_read WHERE environment=$1 AND id=$2 FOR UPDATE',[env,id])).rows[0];if(!row||row.state!=='ready')throw Error('Read unavailable or consumed.');await readCheck(c,row,actor,client);
  const result=JSON.parse(unseal(readKey,row,row.id+row.version).toString());if(digest(result)!==row.result_hash)throw Error('Read staging changed.');const q=checked(sourceKeys,'read.result',ns,result.proof,now()).payload;if(q.dataDigest!==digest(result.data))throw Error('Read evidence changed.');
  const jobs=(await c.query("SELECT manifest FROM gdb_g_job WHERE environment=$1 AND phase='confirmed' ORDER BY session",[env])).rows.map(r=>JSON.parse(r.manifest));validateProjection(result.data,row.operation,row.session,jobs,now());
  await c.query("UPDATE gdb_g_read SET state='consumed',iv=NULL,cipher=NULL,tag=NULL WHERE environment=$1 AND id=$2",[env,id]);return{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},data:result.data};});}
 return{install,grant,submit,status,claim,arm,complete,uncertain,consume,beginChange,finishChange,newRead,fetchRead,stageRead,release,namespace:ns,selection,config,
  inTransaction:()=>activeTransactions>0,setFault:f=>{fault=f;},inspect:()=>tx(async c=>({admission:await admission(c),revision:await revision(c),jobs:(await c.query('SELECT * FROM gdb_g_job WHERE environment=$1',[env])).rows})),
  rawJob:sid=>tx(c=>job(c,sid))};
}
module.exports={openAdapter,seal,unseal,FACETS};
