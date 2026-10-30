'use strict';
// Fixture investigation only. No production imports, listener, credentials or migration.
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash,createHmac,timingSafeEqual,randomBytes,randomUUID,createCipheriv,createDecipheriv}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
const fields=['organisation','pupil','subject','scope','sessionId','action','hash','length','mimeType','durationSeconds','startIso','endIso'];
const exact=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const fail=m=>{throw Error(m);};
const immutable=x=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,x[k]])));
const validBinding=x=>exact(x,fields)&&x.organisation==='GAITA-DE-BOTO'&&x.scope==='google:fixture'&&x.action==='uploadRecording'&&
 ['pupil','subject'].every(k=>typeof x[k]==='string'&&x[k].length>0&&x[k].length<=100)&&
 typeof x.sessionId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x.sessionId)&&
 typeof x.hash==='string'&&/^[a-f0-9]{64}$/.test(x.hash)&&Number.isSafeInteger(x.length)&&x.length>=1&&
 ['audio/wav','audio/webm','audio/ogg','audio/mp4'].includes(x.mimeType)&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0&&x.durationSeconds<=7200&&
 ['startIso','endIso'].every(k=>typeof x[k]==='string'&&Number.isFinite(Date.parse(x[k])))&&Math.abs((Date.parse(x.endIso)-Date.parse(x.startIso))/1000-x.durationSeconds)<=0.002;
function bytes(x,b64){
 if(typeof b64!=='string'||b64.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))fail('Invalid audio.');
 const b=Buffer.from(b64,'base64');if(b.toString('base64')!==b64||b.length!==x.length||hash(b)!==x.hash)fail('Audio binding mismatch.');return b;
}
function sign(key,role,op,body,at=Date.now(),nonce=randomUUID()){
 const wire=JSON.stringify({version:1,method:'POST',path:'/fixture-queue/'+op,role,at,nonce,body});
 return {wire,mac:createHmac('sha256',key).update(wire).digest('hex')};
}
async function openPostgresQueue({pool,fixtureOnly=false,keys,stageKey,authorize,now=Date.now,leaseMs=30000,retentionMs=86400000,maxAttempts=3}){
 if(!fixtureOnly||!pool?.connect||typeof authorize!=='function'||!Buffer.isBuffer(stageKey)||stageKey.length!==32||
 !['gateway','worker'].every(k=>Buffer.isBuffer(keys?.[k])&&keys[k].length===32)||
 ![leaseMs,retentionMs,maxAttempts].every(n=>Number.isSafeInteger(n)&&n>0))fail('Fixture configuration required.');
 await pool.query(readFileSync(join(__dirname,'postgres.sql'),'utf8'));
 const allowed=async j=>{if(await authorize(JSON.parse(j.immutable))!==true)fail('Access revoked or denied.');};
 const get=async(c,id)=>(await c.query('SELECT * FROM gdb_fixture_queue_job WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const view=j=>({id:j.id,sessionId:j.session,state:j.state,saved:j.state==='confirmed',retainLocalAudio:j.state!=='confirmed',reason:j.reason,result:j.result?JSON.parse(j.result):null});
 const claimView=j=>({id:j.id,worker:j.worker,fence:j.fence,lease:Number(j.lease),binding:JSON.parse(j.immutable)});
 async function stage(c,j,b){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',stageKey,iv);cipher.setAAD(Buffer.from(j.fingerprint));
  const encrypted=Buffer.concat([cipher.update(b),cipher.final()]);
  await c.query(`INSERT INTO gdb_fixture_queue_stage VALUES($1,$2,$3,$4,$5) ON CONFLICT(job) DO UPDATE SET iv=excluded.iv,cipher=excluded.cipher,tag=excluded.tag,expires=excluded.expires`,[j.id,iv,encrypted,cipher.getAuthTag(),now()+retentionMs]);
 }
 async function dispatch(c,op,b){
  if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid body.');
  if(op==='submit'){
   if(!exact(b,['binding','audioBase64'])||!validBinding(b.binding))fail('Invalid immutable binding.');
   const x=b.binding,encoded=immutable(x),audio=bytes(x,b.audioBase64);
   if(await authorize(x)!==true)fail('Access revoked or denied.');
   // Unique Session ID arbitrates simultaneous submissions on independent connections.
   const inserted=await c.query(`INSERT INTO gdb_fixture_queue_job(id,session,immutable,fingerprint,state,available) VALUES($1,$2,$3,$4,'queued',$5) ON CONFLICT(session) DO NOTHING RETURNING *`,[randomUUID(),x.sessionId,encoded,hash(encoded),now()]);
   if(inserted.rows.length){const j=inserted.rows[0];await stage(c,j,audio);return view(j);}
   const j=(await c.query('SELECT * FROM gdb_fixture_queue_job WHERE session=$1 FOR UPDATE',[x.sessionId])).rows[0];
   if(!j||j.immutable!==encoded)fail('Session binding conflict.');return view(j);
  }
  if(op==='claim'){
   if(!exact(b,['worker'])||typeof b.worker!=='string'||!b.worker||b.worker.length>100)fail('Invalid worker.');
   while(true){
    const j=(await c.query(`SELECT * FROM gdb_fixture_queue_job WHERE available<=$1 AND (state IN('queued','retry') OR (state='leased' AND lease<=$1)) ORDER BY available,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[now()])).rows[0];
    if(!j)return null;
    if(j.attempts>=maxAttempts){await c.query("UPDATE gdb_fixture_queue_job SET state='manual',reason='attempt-limit' WHERE id=$1",[j.id]);continue;}
    // A temporarily unavailable authority must not be recorded as a revocation.
    if(await authorize(JSON.parse(j.immutable))!==true){await c.query("UPDATE gdb_fixture_queue_job SET state='blocked',reason='revoked' WHERE id=$1",[j.id]);continue;}
    const r=await c.query("UPDATE gdb_fixture_queue_job SET state='leased',worker=$1,lease=$2,fence=fence+1,attempts=attempts+1 WHERE id=$3 RETURNING *",[b.worker,now()+leaseMs,j.id]);
    return claimView(r.rows[0]);
   }
  }
  if(op==='status'||op==='restage'){
   if(!exact(b,op==='status'?['id','subject']:['id','subject','audioBase64']))fail('Unknown gateway field.');
   const j=await get(c,b.id);if(!j||JSON.parse(j.immutable).subject!==b.subject)fail('Foreign pupil.');await allowed(j);
   if(op==='restage'){
    if(j.state!=='awaiting-audio')fail('Restaging not allowed.');
    await stage(c,j,bytes(JSON.parse(j.immutable),b.audioBase64));
    await c.query('UPDATE gdb_fixture_queue_job SET state=$1,available=$2,reason=NULL WHERE id=$3',[j.attempts>=maxAttempts?'manual':'retry',now(),j.id]);
   }return view(await get(c,j.id));
  }
  if(op==='reconcile'){
   if(!exact(b,['id','worker'])||typeof b.worker!=='string'||!b.worker||b.worker.length>100)fail('Invalid inspection.');
   const j=await get(c,b.id);if(!j||!['manual','awaiting-audio'].includes(j.state))fail('Manual inspection unavailable.');await allowed(j);
   const r=await c.query("UPDATE gdb_fixture_queue_job SET state='leased',worker=$1,lease=$2,fence=fence+1 WHERE id=$3 RETURNING *",[b.worker,now()+leaseMs,j.id]);return claimView(r.rows[0]);
  }
  if(!exact(b,op==='complete'?['id','worker','fence','receipt']:op==='fail'?['id','worker','fence','reason']:['id','worker','fence']))fail('Unknown worker field.');
  const j=await get(c,b.id);
  if(!j||j.state!=='leased'||j.worker!==b.worker||j.fence!==b.fence||Number(j.lease)<=now())fail('Stale lease.');
  if(op==='fail'){
   if(!['uncertain','quota','unavailable','revoked','missing-audio','invalid-audio'].includes(b.reason))fail('Unknown failure.');
   const state=b.reason==='revoked'?'blocked':b.reason==='missing-audio'?'awaiting-audio':b.reason==='uncertain'||b.reason==='invalid-audio'||j.attempts>=maxAttempts?'manual':'retry';
   await c.query('UPDATE gdb_fixture_queue_job SET state=$1,reason=$2,available=$3 WHERE id=$4',[state,b.reason,now()+1000*j.attempts,j.id]);return view(await get(c,j.id));
  }
  await allowed(j);
  if(op==='load'){
   const s=(await c.query('SELECT * FROM gdb_fixture_queue_stage WHERE job=$1',[j.id])).rows[0];if(!s||Number(s.expires)<=now())return {missing:true};
   const decipher=createDecipheriv('aes-256-gcm',stageKey,Buffer.from(s.iv));decipher.setAAD(Buffer.from(j.fingerprint));decipher.setAuthTag(Buffer.from(s.tag));
   const audio=Buffer.concat([decipher.update(Buffer.from(s.cipher)),decipher.final()]);
   bytes(JSON.parse(j.immutable),audio.toString('base64'));return {audioBase64:audio.toString('base64')};
  }
  // Older receipt shape omitted audio hash/metadata. Never release local audio on that evidence.
  if(!exact(b.receipt,['saved','binding'])||b.receipt.saved!==true||!validBinding(b.receipt.binding)||immutable(b.receipt.binding)!==j.immutable)fail('Unconfirmed exact receipt.');
  await c.query("UPDATE gdb_fixture_queue_job SET state='confirmed',result=$1,reason=NULL WHERE id=$2",[JSON.stringify(b.receipt),j.id]);
  await c.query('DELETE FROM gdb_fixture_queue_stage WHERE job=$1',[j.id]);return view(await get(c,j.id));
 }
 async function request(envelope){
  if(!exact(envelope,['wire','mac'])||typeof envelope.wire!=='string'||Buffer.byteLength(envelope.wire)>16*1024*1024||typeof envelope.mac!=='string'||!/^[a-f0-9]{64}$/.test(envelope.mac))fail('Invalid envelope.');
  let e;try{e=JSON.parse(envelope.wire);}catch{fail('Invalid envelope.');}
  if(!exact(e,['version','method','path','role','at','nonce','body'])||e.version!==1||e.method!=='POST'||!['gateway','worker'].includes(e.role)||!Number.isSafeInteger(e.at)||Math.abs(e.at-now())>30000||typeof e.nonce!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(e.nonce))fail('Unauthenticated or stale request.');
  if(!timingSafeEqual(createHmac('sha256',keys[e.role]).update(envelope.wire).digest(),Buffer.from(envelope.mac,'hex')))fail('Signature mismatch.');
  const ops=e.role==='gateway'?['submit','status','restage']:['claim','reconcile','load','complete','fail'];
  const op=ops.find(x=>e.path==='/fixture-queue/'+x);if(!op)fail('Forbidden operation.');
  const c=await pool.connect();let inTransaction=false;
  try{
   await c.query('BEGIN');inTransaction=true;
   await c.query('INSERT INTO gdb_fixture_queue_nonce VALUES($1,$2)',[e.role,e.nonce]);
   await c.query('SAVEPOINT operation');
   let result;
   try{result=await dispatch(c,op,e.body);}catch(err){await c.query('ROLLBACK TO SAVEPOINT operation');await c.query('RELEASE SAVEPOINT operation');await c.query('COMMIT');inTransaction=false;throw err;}
   await c.query('RELEASE SAVEPOINT operation');await c.query('COMMIT');inTransaction=false;return result;
  }catch(err){if(inTransaction)await c.query('ROLLBACK');throw err;}finally{c.release();}
 }
 return {request,expireStaging:()=>pool.query('DELETE FROM gdb_fixture_queue_stage WHERE expires<=$1',[now()])};
}
function postgresWorker({queue,key,id,writer,now=Date.now}){
 const call=(op,body)=>queue.request(sign(key,'worker',op,body,now()));
 async function execute(claim,receiptOnly=false){
  if(!claim)return null;const lease={id:claim.id,worker:id,fence:claim.fence},b=claim.binding;
  try{
   let receipt=await writer.receipt(b);
   if(receipt.state==='saved')return await call('complete',{...lease,receipt:receipt.result});
   if(receiptOnly||receipt.state!=='absent'||receipt.retrySafe!==true)return await call('fail',{...lease,reason:'uncertain'});
   const audio=await call('load',lease);if(audio.missing)return await call('fail',{...lease,reason:'missing-audio'});
   await writer.upload(b,audio.audioBase64);receipt=await writer.receipt(b);
   if(receipt.state!=='saved')return await call('fail',{...lease,reason:'uncertain'});
   return await call('complete',{...lease,receipt:receipt.result});
  }catch(error){
   const reason=error.code==='FIXTURE_QUOTA'?'quota':error.code==='FIXTURE_UNAVAILABLE'?'unavailable':/revoked/.test(error.message)?'revoked':'uncertain';
   try{return await call('fail',{...lease,reason});}catch{return {state:'lease-lost-or-unconfirmed',saved:false,retainLocalAudio:true};}
  }
 }
 const run=async()=>execute(await call('claim',{worker:id}));run.reconcile=async jobId=>execute(await call('reconcile',{id:jobId,worker:id}),true);return run;
}
module.exports={openPostgresQueue,postgresWorker,sign,hash,validBinding,immutable,bytes};
