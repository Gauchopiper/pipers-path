'use strict';
// OFFLINE durability/fault model only. Source signing belongs to the source,
// never the gateway/worker/coordinator. No network transaction spans this API.
const {DatabaseSync}=require('node:sqlite');
const {P,digest,checked}=require('../stage2g-fixture/protocol.cjs');
const {freshness}=require('./witness.cjs');
function coordinator({fixtureOnly,file,sourceFile,authority,namespace,generation,keyRevision,publicKey,eventKeys,now,initial,bootstrap=false}){
 if(!fixtureOnly||file===sourceFile)throw Error('Distinct offline storage required.');
 const primary=new DatabaseSync(file),source=new DatabaseSync(sourceFile);let fault=null;
 for(const db of [primary,source])db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
 primary.exec('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)');
 source.exec('CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY,value TEXT NOT NULL)');
 const get=()=>{const v=primary.prepare('SELECT value FROM state WHERE id=1').get();if(!v)throw Error('Primary absent; exact recovery required.');return JSON.parse(v.value);};
 const put=v=>primary.prepare('INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(P.canonical(v));
 const fresh=checkpoint=>freshness({authority,namespace,generation,keyRevision,publicKey,now,checkpoint});
 const rows=()=>source.prepare('SELECT * FROM events ORDER BY sequence').all();
 function verifyRows(state){const rs=rows();if(rs.length!==state.sequence||rs.length>512)throw Error('Source rollback or workload denied.');let prev=null;for(const [i,row]of rs.entries()){const signed=JSON.parse(row.value),v=checked(eventKeys,'journal.event',namespace,signed,now(),{historical:true}).payload;
  if(row.sequence!==i+1||v.reservation.nextSequence!==i+1||v.reservation.rowHash!==state.head&&i===rs.length-1||prev&&v.previousCheckpoint!==prev||!state.nonces.includes(v.reservation.nonce)||!state.eventIds.includes(v.reservation.eventId))throw Error('Source sequence/replay evidence denied.');prev=v.checkpointDigest;}
  if(prev&&prev!==digest(state))throw Error('Source checkpoint mismatch.');return rs;}
 if(!primary.prepare('SELECT 1 FROM state WHERE id=1').get()){if(!bootstrap||rows().length)throw Error('Explicit empty bootstrap required.');fresh(initial);put({checkpoint:initial,pending:null});}
 function ready(){const p=get();if(p.pending)throw Error('Uncertain reservation; deny writes/release.');fresh(p.checkpoint);verifyRows(p.checkpoint);return p.checkpoint;}
 function stop(label){if(fault===label){fault=null;throw Error('Injected '+label);}}
 function append(checkpoint,reservation,signed){const before=ready();const v=checked(eventKeys,'journal.event',namespace,signed,now(),{historical:true}).payload;
  if(v.previousCheckpoint!==digest(before)||v.checkpointDigest!==digest(checkpoint)||digest(v.reservation)!==digest(reservation))throw Error('Source binding rejected.');stop('before-reservation');
  // Record local intent first. Any partial outcome freezes the original identity.
  put({checkpoint:before,pending:{checkpoint,reservation,signed}});stop('after-primary-reservation');
  authority.prepare(before,checkpoint,reservation,signed);stop('after-witness-reservation');
  source.prepare('INSERT INTO events VALUES(?,?)').run(reservation.nextSequence,P.canonical(signed));stop('after-journal-append');
  authority.commit(reservation.rowHash);stop('after-witness-commit');
  put({checkpoint,pending:null});stop('after-primary-commit');return ready();
 }
 function reconcile(){const p=get();if(!p.pending)return ready();const {checkpoint,reservation,signed}=p.pending;const row=source.prepare('SELECT value FROM events WHERE sequence=?').get(reservation.nextSequence);
  if(!row||digest(JSON.parse(row.value))!==digest(signed))throw Error('No exact original row; retain evidence, no blind append.');
  // A lost witness-commit ACK may already be final. Otherwise only the exact
  // pre-existing source row can finalise the outstanding reservation.
  try{fresh(checkpoint);}catch{authority.commit(reservation.rowHash);fresh(checkpoint);}
  verifyRows(checkpoint);put({checkpoint,pending:null});return ready();
 }
 return{ready,append,reconcile,setFault:x=>{fault=x;},close(){primary.close();source.close();},testPrimary:primary,testSource:source};
}
module.exports={coordinator};
