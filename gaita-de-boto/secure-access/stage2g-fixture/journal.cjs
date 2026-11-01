'use strict';
// Durable offline 16-field journal plus independent checkpoint/witness model.
// Not a transaction across Google resources; actual independent hosting remains BLOCKED.
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const {P,digest,uuid}=require('./protocol.cjs');
const HEADERS=['Event ID','Sequence','Environment','Profile Digest','Session ID','Operation ID','Purpose','Nonce','State','Occurred At UTC','Request Digest','Payload JSON','Previous Event Digest','Event Digest','Key ID','Signature'];
const states={ORIGINAL:'accepted',NONCE:'accepted',DISPATCH:'dispatched',OPERATION:'dispatched',RECEIPT:'complete',OUTBOX:'complete',ACK:'acknowledged',READBACK:'complete',ATTENTION:'attention'};
function journal({fixtureOnly=false,filename,namespace,key,keyring,now,checkpoint}){
 if(!fixtureOnly||!filename||!namespace||!key||!keyring||!checkpoint)throw Error('Offline journal checkpoint configuration required.');
 const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS events(position INTEGER PRIMARY KEY,value TEXT NOT NULL)');
 const fingerprint=digest({...namespace,journalGeneration:checkpoint.generation}),old=db.prepare('SELECT value FROM config').get();
 if(old&&old.value!==fingerprint){db.close();throw Error('Journal profile changed; evidence retained.');}
 if(!old&&checkpoint.current({pending:true}).sequence){db.close();throw Error('Journal rollback/missing domain; never initialise over checkpoint.');}
 db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(fingerprint);let fault=null;
 function transition(all,row,payload){const p=row[6],op=row[5],sid=row[4];if(states[p]!==row[8])throw Error('Journal invalid state transition.');
  const related=all.filter(e=>op&&e.row[5]===op);
  if(p==='DISPATCH'&&(!sid||!op||!row[7]||all.some(e=>e.purpose==='DISPATCH'&&e.sessionId===sid)))throw Error('Journal duplicate dispatch transition.');
  if(p==='RECEIPT'&&(!sid||!related.some(e=>e.purpose==='DISPATCH'&&e.sessionId===sid)||related.some(e=>e.purpose==='RECEIPT')))throw Error('Journal receipt transition rejected.');
  if(p==='OUTBOX'&&(!op||!related.some(e=>['RECEIPT','OPERATION','NONCE'].includes(e.purpose))))throw Error('Journal outbox transition rejected.');
  if(p==='READBACK'&&(!op||!related.some(e=>e.purpose==='OUTBOX')||related.some(e=>e.purpose==='READBACK')))throw Error('Journal readback transition rejected.');
  if(p==='ACK'&&(!op||!related.some(e=>e.purpose==='OUTBOX')||related.some(e=>e.purpose==='ACK')))throw Error('Journal acknowledgement transition rejected.');
  if(p==='ATTENTION'&&(!op||!related.length))throw Error('Journal unbound attention transition.');
  if(payload.journalGeneration!==checkpoint.generation)throw Error('Journal generation rejected.');
 }
 function verifiedRows(){const raw=db.prepare('SELECT * FROM events ORDER BY position LIMIT ?').all(checkpoint.maxEvents+1);if(raw.length>checkpoint.maxEvents)throw Error('Journal workload limit.');let previous='0'.repeat(64),bytes=0;const all=[],ids=new Set(),nonces=new Set();
  for(const item of raw){if(item.value.length>24000||(bytes+=item.value.length)>8*1024*1024)throw Error('Journal workload limit.');let row;try{row=JSON.parse(item.value);}catch{throw Error('Corrupt journal append; attention.');}
   if(!Array.isArray(row)||row.length!==16||row[1]!==all.length+1||item.position!==row[1]||!uuid(row[0])||ids.has(row[0])||row[2]!==namespace.environment||row[3]!==namespace.profileDigest||row[12]!==previous||
     !Object.hasOwn(states,row[6])||typeof row[9]!=='string'||!Number.isFinite(Date.parse(row[9]))||(row[4]&&!uuid(row[4]))||(row[5]&&!uuid(row[5]))||(row[7]&&(!uuid(row[7])||nonces.has(row[7])))||
     (row[10]&&!/^[a-f0-9]{64}$/.test(row[10])))throw Error('Journal chain, duplicate Event ID or identity rejected.');
   const k=keyring[row[14]],issued=Date.parse(row[9]);if(row[13]!==digest(row.slice(0,13))||!k||!['active','verify-only'].includes(k.status)||issued<k.notBefore||issued>=k.notAfter||!P.verifyRsa(P.canonical(row.slice(0,15)),row[15],k.jwk))throw Error('Journal signature/digest rejected.');
   let payload;try{payload=JSON.parse(row[11]);}catch{throw Error('Journal payload invalid.');}if(P.canonical(payload)!==row[11]||Buffer.byteLength(row[11])>16384)throw Error('Journal payload contract rejected.');
   transition(all,row,payload);all.push({row,purpose:row[6],state:row[8],sessionId:row[4],nonce:row[7],payload});ids.add(row[0]);if(row[7])nonces.add(row[7]);previous=row[13];
  }return all;
 }
 function events(){const all=verifiedRows();checkpoint.assertRows(all.map(e=>e.row));return all;}
 function append({purpose,state,sessionId='',operationId='',nonce='',requestDigest='',payload={}}){const all=events();
  if(!Object.hasOwn(states,purpose)||state!==states[purpose]||(sessionId&&!uuid(sessionId))||(operationId&&!uuid(operationId))||(nonce&&!uuid(nonce))||(requestDigest&&!/^[a-f0-9]{64}$/.test(requestDigest)))throw Error('Journal event/state rejected.');
  if(nonce&&all.some(e=>e.nonce===nonce))throw Error('Journal replay rejected.');if(Object.hasOwn(payload,'journalGeneration'))throw Error('Journal generation is server controlled.');
  const json=P.canonical({...payload,journalGeneration:checkpoint.generation});if(Buffer.byteLength(json)>16384)throw Error('Journal payload too large; never store audio.');
  const k=keyring[key.kid];if(!k||k.status!=='active'||now()<k.notBefore||now()>=k.notAfter)throw Error('Journal signing key unavailable/revoked.');
  const row=[randomUUID(),all.length+1,namespace.environment,namespace.profileDigest,sessionId,operationId,purpose,nonce,state,new Date(now()).toISOString(),requestDigest,json,all.at(-1)?.row[13]||'0'.repeat(64)];
  row.push(digest(row),key.kid);row.push(P.sign(row,key.pem).signature);transition(all,row,JSON.parse(json));const current=fault;fault=null;
  if(current==='before')throw Error('Journal append interrupted before commit.');checkpoint.prepare(row);
  if(current==='after-prepare')throw Error('Checkpoint reservation interrupted.');
  db.prepare('INSERT INTO events VALUES(?,?)').run(row[1],current==='torn'?JSON.stringify(row).slice(0,25):JSON.stringify(row));
  if(current==='torn'||current==='after-row')throw Error('Corrupt/uncertain journal append outcome.');checkpoint.committed(row);
  if(current==='after')throw Error('Journal append outcome uncertain.');return row;
 }
 return{headers:HEADERS,events,append,assertReady:()=>events(),reconcileCheckpoint(){const all=verifiedRows();checkpoint.recover(all.map(e=>e.row));return events();},setFault:x=>{fault=x;},db,close:()=>db.close(),head:()=>events().at(-1)?.row[13]||'0'.repeat(64)};
}
module.exports={journal,HEADERS};
