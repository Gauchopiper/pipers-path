'use strict';
// Durable local analogue of the proposed 16-column Google EVENT JOURNAL.
// SQLite commits do NOT model atomic transactions across Sheets, Drive or HTTP.
const {DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const {P,digest,uuid}=require('./protocol.cjs');
const HEADERS=['Event ID','Sequence','Environment','Profile Digest','Session ID','Operation ID','Purpose','Nonce',
  'State','Occurred At UTC','Request Digest','Payload JSON','Previous Event Digest','Event Digest','Key ID','Signature'];
const purposes=['ORIGINAL','NONCE','DISPATCH','OPERATION','RECEIPT','OUTBOX','ACK','ATTENTION'];
const states=['accepted','dispatched','complete','attention','acknowledged'];
function journal({fixtureOnly=false,filename,namespace,key,keyring,now}){
  if(!fixtureOnly||!filename||!namespace||!key||!keyring)throw Error('Offline journal configuration required.');
  const db=new DatabaseSync(filename);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS events(position INTEGER PRIMARY KEY,value TEXT NOT NULL)');
  const fingerprint=digest(namespace),old=db.prepare('SELECT value FROM config').get();
  if(old&&old.value!==fingerprint){db.close();throw Error('Journal profile changed; evidence retained.');}
  db.prepare('INSERT OR IGNORE INTO config VALUES(1,?)').run(fingerprint);let fault=null;
  function events(){
    let previous='0'.repeat(64);const result=[];
    for(const row of db.prepare('SELECT * FROM events ORDER BY position').all()){
      let e;try{e=JSON.parse(row.value);}catch{throw Error('Corrupt journal append; attention required.');}
      if(!Array.isArray(e)||e.length!==16||e[1]!==result.length+1||row.position!==e[1]||!uuid(e[0])||
          e[2]!==namespace.environment||e[3]!==namespace.profileDigest||e[12]!==previous||
          !purposes.includes(e[6])||!states.includes(e[8])||!Number.isFinite(Date.parse(e[9]))||
          (e[4]&&!uuid(e[4]))||(e[5]&&!uuid(e[5]))||(e[7]&&!uuid(e[7])))throw Error('Journal chain or identity rejected.');
      const base=e.slice(0,13),k=keyring[e[14]],issued=Date.parse(e[9]);
      if(e[13]!==digest(base)||!k||k.status==='revoked'||issued<k.notBefore||issued>=k.notAfter||
          !P.verifyRsa(P.canonical(e.slice(0,15)),e[15],k.jwk))throw Error('Journal signature or digest rejected.');
      let payload;try{payload=JSON.parse(e[11]);}catch{throw Error('Journal payload invalid.');}
      if(P.canonical(payload)!==e[11]||Buffer.byteLength(e[11])>16384)throw Error('Journal payload contract rejected.');
      result.push({row:e,purpose:e[6],state:e[8],sessionId:e[4],nonce:e[7],payload});previous=e[13];
    }
    const nonces=result.filter(e=>e.nonce).map(e=>e.nonce);
    if(new Set(nonces).size!==nonces.length)throw Error('Duplicate journal nonce.');return result;
  }
  function append({purpose,state,sessionId='',operationId='',nonce='',requestDigest='',payload={}}){
    const all=events();
    if(!purposes.includes(purpose)||!states.includes(state)||(sessionId&&!uuid(sessionId))||
        (operationId&&!uuid(operationId))||(nonce&&!uuid(nonce))||(requestDigest&&!/^[a-f0-9]{64}$/.test(requestDigest)))throw Error('Journal event rejected.');
    if(nonce&&all.some(e=>e.nonce===nonce))throw Error('Journal replay rejected.');
    const json=P.canonical(payload);if(Buffer.byteLength(json)>16384)throw Error('Journal payload too large; never store audio.');
    const k=keyring[key.kid];if(!k||k.status!=='active'||now()<k.notBefore||now()>=k.notAfter)throw Error('Journal signing key unavailable/revoked.');
    const row=[randomUUID(),all.length+1,namespace.environment,namespace.profileDigest,sessionId,operationId,purpose,nonce,state,
      new Date(now()).toISOString(),requestDigest,json,all.length?all.at(-1).row[13]:'0'.repeat(64)];
    row.push(digest(row),key.kid);row.push(P.sign(row,key.pem).signature);
    const current=fault;fault=null;
    if(current==='before')throw Error('Journal append interrupted before commit.');
    db.prepare('INSERT INTO events VALUES(?,?)').run(row[1],current==='torn'?JSON.stringify(row).slice(0,25):JSON.stringify(row));
    if(current==='after'||current==='torn')throw Error('Journal append outcome uncertain.');return row;
  }
  return {headers:HEADERS,events,append,setFault:f=>{fault=f;},db,close:()=>db.close(),
    head:()=>events().at(-1)?.row[13]||'0'.repeat(64)};
}
module.exports={journal,HEADERS};
