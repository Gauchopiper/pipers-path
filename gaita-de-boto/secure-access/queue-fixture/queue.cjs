'use strict';
// LOCAL FIXTURE ONLY: not a Cloud Run store, HTTP endpoint or Apps Script deployment.
const {DatabaseSync}=require('node:sqlite');
const {createHash,createHmac,timingSafeEqual,randomBytes,randomUUID,createCipheriv,createDecipheriv}=require('node:crypto');
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw Error(m);};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
function sign(key,role,op,body,at=Date.now(),nonce=randomUUID()){
 const wire=JSON.stringify({version:1,method:'POST',path:'/fixture-queue/'+op,role,at,nonce,body});
 return {wire,mac:createHmac('sha256',key).update(wire).digest('hex')};
}
function openQueue({filename,fixtureOnly=false,keys,stageKey,authorize,now=Date.now,leaseMs=30000,retentionMs=86400000,maxAttempts=3}){
 if(!fixtureOnly||!Buffer.isBuffer(stageKey)||stageKey.length!==32||!['gateway','worker'].every(k=>Buffer.isBuffer(keys[k])&&keys[k].length===32)||!Number.isSafeInteger(leaseMs)||leaseMs<1||!Number.isSafeInteger(retentionMs)||retentionMs<1||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)fail('Fixture configuration required.');
 const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
 db.exec(`CREATE TABLE IF NOT EXISTS nonce(role TEXT,nonce TEXT,PRIMARY KEY(role,nonce));
 CREATE TABLE IF NOT EXISTS job(id TEXT PRIMARY KEY,session TEXT UNIQUE,immutable TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,fence INTEGER NOT NULL DEFAULT 0,worker TEXT,lease INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL,reason TEXT,result TEXT);
 CREATE TABLE IF NOT EXISTS stage(job TEXT PRIMARY KEY,iv BLOB,cipher BLOB,tag BLOB,expires INTEGER);`);
 const get=id=>db.prepare('SELECT * FROM job WHERE id=?').get(id);
 function allowed(j){if(authorize(JSON.parse(j.immutable))!==true)fail('Access revoked or denied.');}
 function view(j){return {id:j.id,sessionId:j.session,state:j.state,saved:j.state==='confirmed',retainLocalAudio:j.state!=='confirmed',reason:j.reason,result:j.result?JSON.parse(j.result):null};}
 function bytes(input,encoded){
  if(typeof encoded!=='string'||encoded.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('Invalid audio.');
  const b=Buffer.from(encoded,'base64');
  if(b.toString('base64')!==encoded||b.length!==input.length||hash(b)!==input.hash)fail('Audio binding mismatch.');return b;
 }
 function stage(j,b){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',stageKey,iv);c.setAAD(Buffer.from(j.fingerprint));const encrypted=Buffer.concat([c.update(b),c.final()]);db.prepare('INSERT OR REPLACE INTO stage VALUES(?,?,?,?,?)').run(j.id,iv,encrypted,c.getAuthTag(),now()+retentionMs);}
 function lease(body){const j=get(body.id);if(!j||j.state!=='leased'||j.worker!==body.worker||j.fence!==body.fence||j.lease<=now())fail('Stale lease.');return j;}
 function request(envelope){
  if(!exact(envelope,['wire','mac'])||typeof envelope.wire!=='string'||Buffer.byteLength(envelope.wire)>16*1024*1024||typeof envelope.mac!=='string'||!/^[a-f0-9]{64}$/.test(envelope.mac))fail('Invalid envelope.');
  let e;try{e=JSON.parse(envelope.wire);}catch{fail('Invalid envelope.');}
  if(!exact(e,['version','method','path','role','at','nonce','body'])||e.version!==1||e.method!=='POST'||!['gateway','worker'].includes(e.role)||!Number.isSafeInteger(e.at)||Math.abs(e.at-now())>30000||typeof e.nonce!=='string'||!/^[a-f0-9-]{36}$/.test(e.nonce))fail('Unauthenticated or stale request.');
  const expected=createHmac('sha256',keys[e.role]).update(envelope.wire).digest();if(!timingSafeEqual(expected,Buffer.from(envelope.mac,'hex')))fail('Signature mismatch.');
  const ops=e.role==='gateway'?['submit','status','restage']:['claim','reconcile','load','complete','fail'];
  const op=ops.find(x=>e.path==='/fixture-queue/'+x);if(!op)fail('Forbidden operation.');
  db.exec('BEGIN IMMEDIATE');
  try{
   // Commit nonce even for a validly signed operation that is denied.
   db.prepare('INSERT INTO nonce VALUES(?,?)').run(e.role,e.nonce);
   db.exec('SAVEPOINT operation');
   let result;
   try{result=dispatch(op,e.body);}catch(err){db.exec('ROLLBACK TO operation; RELEASE operation; COMMIT');throw err;}
   db.exec('RELEASE operation; COMMIT');return result;
  }catch(err){if(db.isTransaction)db.exec('ROLLBACK');throw err;}
 }
 function dispatch(op,b){
  if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid body.');
  if(op==='submit'){
   if(!exact(b,['binding','audioBase64']))fail('Unknown submit field.');
   const x=b.binding;
   if(!exact(x,['organisation','pupil','subject','scope','sessionId','action','hash','length','mimeType','durationSeconds','startIso','endIso'])||x.organisation!=='GAITA-DE-BOTO'||x.action!=='uploadRecording'||x.scope!=='google:fixture'||!['pupil','subject'].every(k=>typeof x[k]==='string'&&x[k].length>0&&x[k].length<=100)||typeof x.sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x.sessionId)||!/^[a-f0-9]{64}$/.test(x.hash)||!Number.isSafeInteger(x.length)||x.length<1||!['audio/wav','audio/webm','audio/ogg','audio/mp4'].includes(x.mimeType)||!Number.isFinite(x.durationSeconds)||x.durationSeconds<=0||x.durationSeconds>7200||Math.abs((Date.parse(x.endIso)-Date.parse(x.startIso))/1000-x.durationSeconds)>0.002||!Number.isFinite(Date.parse(x.startIso))||!Number.isFinite(Date.parse(x.endIso)))fail('Invalid immutable binding.');
   if(authorize(x)!==true)fail('Access revoked or denied.');
   // Fixed field order is a single canonical encoding for immutable comparisons.
   const immutable=JSON.stringify(Object.fromEntries(['organisation','pupil','subject','scope','sessionId','action','hash','length','mimeType','durationSeconds','startIso','endIso'].map(k=>[k,x[k]]))),fp=hash(immutable),audio=bytes(x,b.audioBase64);
   const previous=db.prepare('SELECT * FROM job WHERE session=?').get(x.sessionId);
   if(previous){if(previous.fingerprint!==fp)fail('Session binding conflict.');return view(previous);}
   const id=randomUUID();db.prepare("INSERT INTO job(id,session,immutable,fingerprint,state,available) VALUES(?,?,?,?,'queued',?)").run(id,x.sessionId,immutable,fp,now());const j=get(id);stage(j,audio);return view(j);
  }
  if(op==='status'||op==='restage'){
   if(!exact(b,op==='status'?['id','subject']:['id','subject','audioBase64']))fail('Unknown field.');
   const j=get(b.id);if(!j||JSON.parse(j.immutable).subject!==b.subject)fail('Foreign pupil.');allowed(j);
   if(op==='restage'){
    if(j.state!=='awaiting-audio')fail('Restaging not allowed.');
    stage(j,bytes(JSON.parse(j.immutable),b.audioBase64));
    // Preserve job/session, fence, attempts and receipt history; never reset retries.
    db.prepare("UPDATE job SET state=?,available=?,reason=NULL WHERE id=?").run(j.attempts>=maxAttempts?'manual':'retry',now(),j.id);
   }
   return view(get(j.id));
  }
  if(op==='reconcile'){
   if(!exact(b,['id','worker'])||typeof b.worker!=='string'||!b.worker||b.worker.length>100)fail('Invalid inspection.');
   const j=get(b.id);if(!j||!['manual','awaiting-audio'].includes(j.state))fail('Manual inspection unavailable.');allowed(j);
   db.prepare("UPDATE job SET state='leased',worker=?,lease=?,fence=fence+1 WHERE id=?").run(b.worker,now()+leaseMs,j.id);
   const v=get(j.id);return {id:v.id,worker:v.worker,fence:v.fence,lease:v.lease,binding:JSON.parse(v.immutable)};
  }
  if(op==='claim'){
   if(!exact(b,['worker'])||typeof b.worker!=='string'||!b.worker||b.worker.length>100)fail('Invalid worker.');
   db.prepare("UPDATE job SET state='manual',reason='attempt-limit' WHERE attempts>=? AND (state IN('queued','retry') OR (state='leased' AND lease<=?))").run(maxAttempts,now());
   const candidates=db.prepare("SELECT * FROM job WHERE attempts<? AND available<=? AND (state IN('queued','retry') OR (state='leased' AND lease<=?)) ORDER BY available,id").all(maxAttempts,now(),now());
   for(const j of candidates){
    try{allowed(j);}catch{db.prepare("UPDATE job SET state='blocked',reason='revoked' WHERE id=?").run(j.id);continue;}
    db.prepare("UPDATE job SET state='leased',worker=?,lease=?,fence=fence+1,attempts=attempts+1 WHERE id=?").run(b.worker,now()+leaseMs,j.id);
    const v=get(j.id);return {id:v.id,worker:v.worker,fence:v.fence,lease:v.lease,binding:JSON.parse(v.immutable)};
   }return null;
  }
  if(!exact(b,op==='complete'?['id','worker','fence','receipt']:op==='fail'?['id','worker','fence','reason']:['id','worker','fence']))fail('Unknown worker field.');
  const j=lease(b);const x=JSON.parse(j.immutable);
  if(op==='fail'){
   if(!['uncertain','quota','unavailable','revoked','missing-audio','invalid-audio'].includes(b.reason))fail('Unknown failure.');
   const state=b.reason==='revoked'?'blocked':b.reason==='missing-audio'?'awaiting-audio':b.reason==='uncertain'||b.reason==='invalid-audio'||j.attempts>=maxAttempts?'manual':'retry';
   db.prepare('UPDATE job SET state=?,reason=?,available=? WHERE id=?').run(state,b.reason,now()+1000*j.attempts,j.id);return view(get(j.id));
  }
  allowed(j);
  if(op==='load'){
   const s=db.prepare('SELECT * FROM stage WHERE job=?').get(j.id);
   if(!s||s.expires<=now())return {missing:true};
   const c=createDecipheriv('aes-256-gcm',stageKey,s.iv);c.setAAD(Buffer.from(j.fingerprint));c.setAuthTag(s.tag);const audio=Buffer.concat([c.update(s.cipher),c.final()]);
   if(audio.length!==x.length||hash(audio)!==x.hash)fail('Audio binding mismatch.');return {audioBase64:audio.toString('base64')};
  }
  const r=b.receipt;
  if(!exact(r,['saved','organisation','pupil','sessionId','durationSeconds'])||r.saved!==true||r.organisation!==x.organisation||r.pupil!==x.pupil||r.sessionId!==x.sessionId||r.durationSeconds!==x.durationSeconds)fail('Unconfirmed receipt.');
  db.prepare("UPDATE job SET state='confirmed',result=?,reason=NULL WHERE id=?").run(JSON.stringify(r),j.id);db.prepare('DELETE FROM stage WHERE job=?').run(j.id);return view(get(j.id));
 }
 return {request,expireStaging(){return db.prepare('DELETE FROM stage WHERE expires<=?').run(now());},close(){db.close();}};
}
// Fixture adapter invokes ONE supplied authoritative writer, never Drive/Sheets itself.
function worker({queue,key,id,writer,now=Date.now}){
 const call=(op,body)=>queue.request(sign(key,'worker',op,body,now()));
 async function execute(claim,receiptOnly=false){
  if(!claim)return null;
  const lease={id:claim.id,worker:id,fence:claim.fence},b=claim.binding;
  try{
   let receipt=await writer.receipt(b);
   if(receipt.state==='saved')return call('complete',{...lease,receipt:receipt.result});
   if(receiptOnly||receipt.state!=='absent'||receipt.retrySafe!==true)return call('fail',{...lease,reason:'uncertain'});
   const audio=call('load',lease); // Rechecks lease + current grant immediately before dispatch.
   if(audio.missing)return call('fail',{...lease,reason:'missing-audio'});
   // Writer must recheck identity, media duration, file/folder and atomic receipt lock.
   // A queue fence cannot cancel an already-running Google operation.
   await writer.upload(b,audio.audioBase64);
   receipt=await writer.receipt(b);
   if(receipt.state!=='saved')return call('fail',{...lease,reason:'uncertain'});
   return call('complete',{...lease,receipt:receipt.result});
  }catch(error){
   let reason=error.code==='FIXTURE_QUOTA'?'quota':error.code==='FIXTURE_UNAVAILABLE'?'unavailable':/revoked/.test(error.message)?'revoked':'uncertain';
   try{return call('fail',{...lease,reason});}catch{return {state:'lease-lost-or-unconfirmed',saved:false,retainLocalAudio:true};}
  }
 }
 const runOnce=()=>execute(call('claim',{worker:id}));
 runOnce.reconcile=jobId=>execute(call('reconcile',{id:jobId,worker:id}),true);
 return runOnce;
}
module.exports={openQueue,sign,worker,hash};
