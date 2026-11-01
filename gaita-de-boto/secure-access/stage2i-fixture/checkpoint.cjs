'use strict';
// OFFLINE model of TWO independent authorities. Separate files on this host are
// not a production trust boundary. Never claim protection if the witness rolls back too.
const {DatabaseSync}=require('node:sqlite'),C=require('node:crypto');
const {P,digest,uuid}=require('../stage2g-fixture/protocol.cjs');
const ZERO='0'.repeat(64),MAX=512;
function checkpoint({fixtureOnly,primaryFile,witnessFile,namespace,policyRevision,keyRevision=1,key,publicKey,eventKeys}){
 if(!fixtureOnly||primaryFile===witnessFile||!primaryFile||!witnessFile||!key||!publicKey||!eventKeys)throw Error('Independent offline checkpoint required.');
 const open=file=>{const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS control(id integer PRIMARY KEY CHECK(id=1),value text NOT NULL)');return db;};
 const primary=open(primaryFile),witness=open(witnessFile),fingerprint=digest({namespace,policyRevision,keyRevision});let fault=null;
 const sign=body=>({body,signature:C.sign('RSA-SHA256',Buffer.from(P.canonical(body)),key).toString('base64')});
 function read(db){const row=db.prepare('SELECT value FROM control WHERE id=1').get();if(!row)return null;let value;try{value=JSON.parse(row.value);}catch{throw Error('Corrupt checkpoint.');}
  if(!value.body||value.body.fingerprint!==fingerprint||!C.verify('RSA-SHA256',Buffer.from(P.canonical(value.body)),publicKey,Buffer.from(value.signature,'base64')))throw Error('Checkpoint signature/profile mismatch.');return value.body;}
 function put(db,body){db.prepare('INSERT INTO control VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(sign(body)));}
 let a=read(primary),b=read(witness);
 if(!a&&!b){a={fingerprint,environment:namespace.environment,profileDigest:namespace.profileDigest,generation:C.randomUUID(),policyRevision,keyRevision,sequence:0,head:ZERO,pending:null,eventIds:[],nonces:[],dispatches:[]};put(witness,a);put(primary,a);}
 else if(!a||!b){primary.close();witness.close();throw Error('Checkpoint domain missing; never initialise over surviving evidence.');}
 function current({pending=false}={}){const p=read(primary),w=read(witness);if(!p||!w||digest(p)!==digest(w))throw Error('Journal chain rollback/checkpoint-domain mismatch; attention.');if(p.pending&&!pending)throw Error('Corrupt or interrupted journal checkpoint reservation; attention.');return p;}
 const generation=a.generation;
 function assertRows(rows){const p=current();if(p.generation!==generation||p.sequence!==rows.length||p.head!==(rows.at(-1)?.[13]||ZERO))throw Error('Journal chain rollback/checkpoint head mismatch.');
  if(rows.some(r=>!p.eventIds.includes(r[0])||(r[7]&&!p.nonces.includes(r[7])))||p.eventIds.length!==rows.length)throw Error('Journal nonce/event checkpoint mismatch.');return p;}
 function reservation(row){const p=current(),k=eventKeys[row[14]],issued=Date.parse(row[9]);
  if(!Array.isArray(row)||row.length!==16||row[2]!==namespace.environment||row[3]!==namespace.profileDigest||row[13]!==digest(row.slice(0,13))||!k||k.status!=='active'||!Number.isFinite(issued)||issued<k.notBefore||issued>=k.notAfter||
    !C.verify('RSA-SHA256',Buffer.from(P.canonical(row.slice(0,15))),C.createPublicKey({key:k.jwk,format:'jwk'}),Buffer.from(row[15],'base64')))throw Error('Independent checkpoint source signature rejected.');
  if(JSON.parse(row[11]).journalGeneration!==p.generation)throw Error('Checkpoint generation rejected.');if(p.sequence>=MAX||p.eventIds.includes(row[0])||(row[7]&&p.nonces.includes(row[7])))throw Error('Journal replay/event ID/workload rejected.');
  if(row[1]!==p.sequence+1||row[12]!==p.head||!uuid(row[0]))throw Error('Journal checkpoint sequence conflict.');
  return{eventId:row[0],sequence:row[1],digest:row[13],nonce:row[7],sessionId:row[4],operationId:row[5],purpose:row[6],rowHash:digest(row),previousHead:p.head};}
 function prepare(row){const pending=reservation(row),p={...current(),pending};put(witness,p);if(fault==='after-witness-prepare'){fault=null;throw Error('Checkpoint prepare interrupted.');}put(primary,p);return pending;}
 function committed(row,{recover=false}={}){
  let p,w;if(recover){p=read(primary);w=read(witness);if(!p||!w||p.generation!==w.generation)throw Error('Checkpoint recovery domains invalid.');
   // Only an exact outstanding reservation or an already finalised witness may advance the primary.
   if(!w.pending&&w.sequence===row[1]&&w.head===row[13]&&p.pending?.rowHash===digest(row)){put(primary,w);return;}
   if(w.pending&&p.sequence===w.sequence&&p.head===w.head&&(!p.pending||digest(p.pending)===digest(w.pending))){p=w;put(primary,w);}else if(digest(p)!==digest(w))throw Error('Checkpoint recovery mismatch.');
  }else p=current({pending:true});
  if(!p.pending||p.pending.rowHash!==digest(row)||p.pending.previousHead!==p.head||row[1]!==p.sequence+1)throw Error('Exact checkpoint reservation required.');
  const next={...p,sequence:row[1],head:row[13],pending:null,eventIds:[...p.eventIds,row[0]],nonces:row[7]?[...p.nonces,row[7]]:p.nonces,
   dispatches:row[6]==='DISPATCH'?[...p.dispatches,{sessionId:row[4],operationId:row[5],eventDigest:row[13]}]:p.dispatches};
  put(witness,next);if(fault==='after-witness-commit'){fault=null;throw Error('Checkpoint finalisation interrupted.');}put(primary,next);
 }
 function recover(rows){const p=read(primary),w=read(witness);const pending=w.pending||p.pending;if(!pending)throw Error('No exact pending reservation to reconcile.');
  const row=rows.at(-1);if(rows.length!==pending.sequence||!row||digest(row)!==pending.rowHash||rows.length>MAX)throw Error('Unresolved checkpoint reservation; evidence retained.');committed(row,{recover:true});assertRows(rows);}
 return{generation,maxEvents:MAX,current,assertRows,prepare,committed,recover,setFault:x=>{fault=x;},close(){primary.close();witness.close();},
  // Deliberate offline fault injection, never exposed as a production recovery API.
  testSnapshot:()=>JSON.stringify(read(primary)),testRestorePrimary:s=>put(primary,JSON.parse(s)),testRestoreWitness:s=>put(witness,JSON.parse(s)),primary,witness};
}
module.exports={checkpoint};
