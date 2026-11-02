'use strict';
// Offline retained-authority model. Separate SQLite files do NOT provide an
// independent administration/restore boundary. No listener or remote service.
const {DatabaseSync}=require('node:sqlite'),C=require('node:crypto');
const {P,digest,exact,uuid,checked}=require('../stage2g-fixture/protocol.cjs');
const sign=(body,key)=>({body,signature:C.sign('RSA-SHA256',Buffer.from(P.canonical(body)),key).toString('base64')});
function witness({fixtureOnly,file,namespace,generation,keyRevision,key,publicKey,now,initial,eventKeys}){
 if(!fixtureOnly||!eventKeys||!uuid(generation)||!Number.isSafeInteger(keyRevision)||keyRevision<1)throw Error('Witness configuration rejected.');
 const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS evidence(n INTEGER PRIMARY KEY,value TEXT NOT NULL);');
 let available=true,fault=null;
 function verify(v){if(!v?.body||typeof v.signature!=='string'||v.signature.length>1024||!C.verify('RSA-SHA256',Buffer.from(P.canonical(v.body)),publicKey,Buffer.from(v.signature,'base64')))throw Error('Witness signature rejected.');return v.body;}
 function entries(){const a=db.prepare('SELECT * FROM evidence ORDER BY n').all();if(a.length>1024)throw Error('Witness capacity reached; no eviction.');let prev='0'.repeat(64);return a.map((r,i)=>{const e=JSON.parse(r.value),b=verify(e);if(b.sequence!==i||r.n!==i||b.previous!==prev||b.environment!==namespace.environment||b.profileDigest!==namespace.profileDigest||b.generation!==generation||b.keyRevision!==keyRevision)throw Error('Witness chain rejected.');prev=digest(e);return e;});}
 function last(){if(!available)throw Error('Witness unreachable; freshness unknown.');const e=entries();if(!e.length)throw Error('Witness absent; restore must not initialise.');return e.at(-1);}
 function append(body){if(body.sequence>=1024)throw Error('Witness evidence capacity reached; no eviction.');const e=sign(body,key);db.prepare('INSERT INTO evidence VALUES(?,?)').run(body.sequence,JSON.stringify(e));return e;}
 if(!db.prepare('SELECT 1 FROM evidence LIMIT 1').get()){if(!initial)throw Error('Explicit bootstrap required; never reset evidence.');append({...namespace,generation,keyRevision,sequence:0,previous:'0'.repeat(64),state:'committed',checkpoint:initial,pending:null});}
 function challenge(nonce){if(!uuid(nonce))throw Error('Challenge rejected.');const e=last();return sign({...namespace,generation,keyRevision,nonce,at:now(),expires:now()+1000,head:digest(e),entry:e},key);}
 function prepare(expected,checkpoint,reservation,signed){const proof=checked(eventKeys,'journal.event',namespace,signed,now(),{historical:true}).payload;
 if(!exact(proof,['previousCheckpoint','checkpointDigest','reservation'])||proof.previousCheckpoint!==digest(expected)||proof.checkpointDigest!==digest(checkpoint)||digest(proof.reservation)!==digest(reservation))throw Error('Independent source event rejected.');
 const e=last(),b=e.body;if(b.state!=='committed'||digest(b.checkpoint)!==digest(expected)||!exact(reservation,['eventId','nonce','rowHash','nextSequence'])||!uuid(reservation.eventId)||!uuid(reservation.nonce)||!/^[a-f0-9]{64}$/.test(reservation.rowHash)||!Number.isSafeInteger(reservation.nextSequence)||reservation.nextSequence!==expected.sequence+1||checkpoint.sequence!==reservation.nextSequence||!Array.isArray(checkpoint.nonces)||!checkpoint.nonces.includes(reservation.nonce)||!Array.isArray(checkpoint.eventIds)||!checkpoint.eventIds.includes(reservation.eventId)||expected.nonces?.includes(reservation.nonce)||expected.eventIds?.includes(reservation.eventId))throw Error('Witness reservation rejected.');
 for(const field of ['nonces','eventIds','dispatches'])if(!Array.isArray(checkpoint[field])||P.canonical(checkpoint[field].slice(0,expected[field].length))!==P.canonical(expected[field]))throw Error('Witness history deletion rejected.');
 if(checkpoint.head!==reservation.rowHash)throw Error('Witness event head rejected.');
 const n=append({...b,sequence:b.sequence+1,previous:digest(e),state:'reserved',pending:{reservation,next:checkpoint}});if(fault==='after-reserve'){fault=null;throw Error('Witness acknowledgement lost.');}return n;}
 function commit(rowHash){const e=last(),b=e.body;if(b.state!=='reserved'||b.pending.reservation.rowHash!==rowHash)throw Error('Exact witness reconciliation required.');const n=append({...b,sequence:b.sequence+1,previous:digest(e),state:'committed',checkpoint:b.pending.next,pending:null});if(fault==='after-commit'){fault=null;throw Error('Witness acknowledgement lost.');}return n;}
 return{challenge,prepare,commit,setAvailable:x=>{available=x;},setFault:x=>{fault=x;},close:()=>db.close(),
 // Fault injection for immutable evidence tests, not a runtime API.
 testDatabase:db};
}
function freshness({authority,namespace,generation,keyRevision,publicKey,now,checkpoint}){
 const nonce=C.randomUUID(),v=authority.challenge(nonce),b=v?.body;
 if(!b||typeof v.signature!=='string'||v.signature.length>1024||!C.verify('RSA-SHA256',Buffer.from(P.canonical(b)),publicKey,Buffer.from(v.signature,'base64'))||b.environment!==namespace.environment||b.profileDigest!==namespace.profileDigest||b.generation!==generation||b.keyRevision!==keyRevision||b.nonce!==nonce||!Number.isSafeInteger(b.at)||!Number.isSafeInteger(b.expires)||b.expires-b.at!==1000||b.at>now()||b.expires<=now()||b.head!==digest(b.entry)||b.entry.body.state!=='committed'||digest(b.entry.body.checkpoint)!==digest(checkpoint))throw Error('Fresh witness checkpoint required; writes and release denied.');return b.head;
}
module.exports={witness,freshness};
