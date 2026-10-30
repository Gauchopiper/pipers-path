'use strict';
// Durable continuation of two independent writers, not a distributed transaction.
// Canonical Teacher creates inactive rows; access database creates inactive grants.
function provisioning({db,canonical,access,sessions,ownerSubject,scope,enabled=false}){
 const org='GAITA-DE-BOTO';
 function owner(actor){if(actor?.verified!==true||actor.subject!==ownerSubject||actor.scope!==scope)throw Error('Access denied.');}
 const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
 async function run(actor,input){
  owner(actor);if(!enabled)throw Error('Provisioning is disabled.');
  const {operation,mode,pupil,name,language,enrolment,relation,evidence,expires}=input||{};
  if(Object.keys(input||{}).some(k=>!['operation','mode','pupil','name','language','enrolment','relation','evidence','expires'].includes(k))||!uuid(operation)||!['existing','new'].includes(mode)||!['adult','guardian','supervised-child'].includes(relation)||typeof evidence!=='string'||!evidence.trim()||evidence.length>200||!Number.isSafeInteger(expires)||expires<=Date.now())throw Error('Invalid provisioning request.');
  const id=mode==='new'?operation:pupil;
  if(typeof id!=='string'||!id||id.length>100)throw Error('Invalid pupil.');
  const display=typeof name==='string'?name.trim().replace(/\s+/g,' '):'';
  if(mode==='new'&&(!display||display.length>120||!['EN','ES'].includes(language)||pupil!==undefined))throw Error('Invalid new pupil.');
  const subject=await sessions.resolveEnrolment(enrolment);
  if(subject===ownerSubject)throw Error('Invalid pupil identity.');
  const request=JSON.stringify({mode,id,name:mode==='new'?display:null,language:mode==='new'?language:null,subject,relation,evidence,expires,scope,actor:actor.subject});
  // Persist intent BEFORE crossing the workbook boundary. Retries keep original UUID.
  await db.tx('provision:'+org+':'+operation,async c=>{
   const old=(await c.query('SELECT request FROM gdb_provisioning WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];
   if(old&&old.request!==request)throw Error('Operation reference conflict.');
   if(!old)await c.query("INSERT INTO gdb_provisioning VALUES($1,$2,$3,'pending',$4)",[org,operation,request,id]);
  });
  // External calls are repeatable by operation ID; no cross-service atomicity claimed.
  // A DB connection is NOT held while waiting for remote I/O.
  let row=await canonical.get(id);
  if(mode==='new')row=await canonical.create({operation,name:display,language});
  if(!row)throw Error('Unknown canonical pupil.');
  await db.query("UPDATE gdb_provisioning SET state='record-created' WHERE organisation=$1 AND operation=$2 AND state='pending'",[org,operation]);
  const kind=await canonical.kind(id);
  if((kind==='adult'&&relation!=='adult')||(kind==='child'&&relation==='adult'))throw Error('Relationship does not match canonical classification.');
  // access.change's receipt precedes its response. A lost response replays safely.
  const result=await access.change(actor,{operation,pupil:id,action:'provision',expectedRevision:0,subject,relation,evidence,expires});
  await db.query("UPDATE gdb_provisioning SET state='inactive' WHERE organisation=$1 AND operation=$2",[org,operation]);
  return {ok:true,pupil:id,state:result.access.status,link:null};
 }
 return {run,async status(actor,operation){owner(actor);const r=(await db.query('SELECT pupil,state FROM gdb_provisioning WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];return r?{pupil:r.pupil,state:r.state,retryable:r.state!=='inactive'}:null;}};
}
module.exports={provisioning};
