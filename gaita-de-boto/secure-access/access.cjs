'use strict';
// STAGED DOMAIN LAYER ONLY. No HTTP route, deployment or production database.
// actor must come from a verified server-side identity adapter, NEVER request JSON.
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const deny=()=>{throw Error('Access denied.');};
function openAccess(filename, config){
 if(config.organisation!=='GAITA-DE-BOTO'||!config.ownerSubject||!config.identityScope)throw Error('Invalid access configuration.');
 const origin=new URL(config.origin);
 if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Invalid frontend origin.');
 const db=new DatabaseSync(filename);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS access (
 organisation TEXT NOT NULL, pupil TEXT NOT NULL, subject TEXT NOT NULL,
 scope TEXT NOT NULL, link TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
 revision INTEGER NOT NULL, expires INTEGER NOT NULL,
 PRIMARY KEY (organisation,pupil), UNIQUE(organisation,scope,subject));
 CREATE TABLE IF NOT EXISTS operations (
 operation TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (
 sequence INTEGER PRIMARY KEY, organisation TEXT NOT NULL, pupil TEXT NOT NULL,
 actor TEXT NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL);`);
 const now=config.now||Date.now;
 function identity(actor){
  if(!actor||actor.verified!==true||actor.scope!==config.identityScope||typeof actor.subject!=='string'||!actor.subject)deny();
 }
 function owner(actor){identity(actor);if(actor.subject!==config.ownerSubject)deny();}
 function current(pupil){return db.prepare('SELECT * FROM access WHERE organisation=? AND pupil=?').get(config.organisation,pupil);}
 function view(r){return r?{pupil:r.pupil,status:r.status,revision:r.revision,expires:r.expires,
  link:r.status==='active'?origin.origin+'/pupil/'+encodeURIComponent(r.link):null}:null;}
 function change(actor,input){
  owner(actor);
  const {operation,pupil,action,expectedRevision,subject,expires}=input||{};
  if(!/^[a-f0-9-]{36}$/.test(operation||'')||typeof pupil!=='string'||!pupil||pupil.length>100||
    !['provision','activate','deactivate','rotate','revoke'].includes(action)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid access operation.');
  // A real host must supply a versioned, verified canonical-pupil adapter.
  // This prevents provisioning a link to a nonexistent/duplicate local pupil.
  if(config.pupilExists(pupil)!==true)throw Error('Unknown canonical pupil.');
  if(['provision','activate','rotate'].includes(action)&&config.externalApproved!==true)throw Error('External access is not approved.');
  if(action==='provision'&&(typeof subject!=='string'||!subject||subject===config.ownerSubject||subject.length>200||
    !Number.isSafeInteger(expires)||expires<=now()))throw Error('Verified pupil identity and expiry required.');
  const request=JSON.stringify({organisation:config.organisation,scope:config.identityScope,actor:actor.subject,pupil,action,expectedRevision,subject:subject??null,expires:expires??null});
  db.exec('BEGIN IMMEDIATE');
  try{
   const replay=db.prepare('SELECT * FROM operations WHERE operation=?').get(operation);
   if(replay){
    if(replay.request!==request)throw Error('Operation reference conflict.');
    // Never resurrect a revoked/rotated link from an old successful response.
    const result=JSON.parse(replay.result),row=current(pupil);
    db.exec('COMMIT');return {...result,duplicate:true,access:view(row)};
   }
   let row=current(pupil);
   if((row?.revision||0)!==expectedRevision)throw Error('Access changed; refresh before retrying.');
   if(action==='provision'){
    if(row)throw Error('Pupil access already exists; manage the existing record.');
    row={organisation:config.organisation,pupil,subject,scope:config.identityScope,link:randomUUID(),status:'inactive',revision:1,expires};
    db.prepare('INSERT INTO access VALUES (?,?,?,?,?,?,?,?)').run(row.organisation,row.pupil,row.subject,row.scope,row.link,row.status,row.revision,row.expires);
   }else{
    if(!row)throw Error('Pupil access has not been provisioned.');
    if(row.scope!==config.identityScope)deny();
    if(action==='activate'&&(row.status==='revoked'||row.expires<=now()))throw Error('Replace revoked or expired access first.');
    if(action==='rotate'){
     if(!Number.isSafeInteger(expires)||expires<=now())throw Error('New expiry required.');
     row.link=randomUUID();row.expires=expires;row.status='inactive';
    }else row.status=action==='activate'?'active':action==='deactivate'?'inactive':'revoked';
    row.revision++;
    db.prepare('UPDATE access SET link=?,status=?,revision=?,expires=? WHERE organisation=? AND pupil=?').run(row.link,row.status,row.revision,row.expires,row.organisation,row.pupil);
   }
   const result={ok:true,revision:row.revision};
   db.prepare('INSERT INTO operations VALUES (?,?,?)').run(operation,request,JSON.stringify(result));
   db.prepare('INSERT INTO audit (organisation,pupil,actor,action,revision,at) VALUES (?,?,?,?,?,?)').run(config.organisation,pupil,actor.subject,action,row.revision,now());
   db.exec('COMMIT');return {...result,duplicate:false,access:view(row)};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function authorize(actor,link,organisation){
  identity(actor);
  if(config.externalApproved!==true||organisation!==config.organisation||typeof link!=='string')deny();
  const row=db.prepare('SELECT * FROM access WHERE organisation=? AND link=?').get(config.organisation,link);
  if(!row||row.scope!==actor.scope||row.subject!==actor.subject||row.status!=='active'||row.expires<=now()||config.pupilExists(row.pupil)!==true)deny();
  // Every data operation must derive the pupil from this result, not client pupilId.
  return {organisation:row.organisation,pupil:row.pupil,revision:row.revision};
 }
 return {change,authorize,status(actor,pupil){owner(actor);return view(current(pupil));},close(){db.close();}};
}
module.exports={openAccess};
