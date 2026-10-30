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
 PRIMARY KEY (organisation,pupil));
 CREATE TABLE IF NOT EXISTS grants (organisation TEXT NOT NULL,pupil TEXT NOT NULL,scope TEXT NOT NULL,subject TEXT NOT NULL,relation TEXT NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(organisation,pupil,scope,subject));
 CREATE TABLE IF NOT EXISTS operations (
 operation TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (
 sequence INTEGER PRIMARY KEY, organisation TEXT NOT NULL, pupil TEXT NOT NULL,
 actor TEXT NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL);`);
 // Earlier staging databases used one identity per pupil. Refuse unsafe implicit migration.
 const oldSchema=db.prepare("SELECT sql FROM sqlite_master WHERE name='access'").get().sql;
 if(/UNIQUE\s*\(organisation,scope,subject\)/i.test(oldSchema)){db.close();throw Error('Legacy staging schema: explicit reviewed migration required.');}
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
  const {operation,pupil,action,expectedRevision,subject,expires,relation,evidence}=input||{};
  if(!/^[a-f0-9-]{36}$/.test(operation||'')||typeof pupil!=='string'||!pupil||pupil.length>100||
    !['provision','activate','deactivate','rotate','revoke','grant','revokeGrant'].includes(action)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid access operation.');
  // A real host must supply a versioned, verified canonical-pupil adapter.
  // This prevents provisioning a link to a nonexistent/duplicate local pupil.
  if(config.pupilExists(pupil)!==true)throw Error('Unknown canonical pupil.');
  if(['provision','activate','rotate','grant'].includes(action)&&config.externalApproved!==true)throw Error('External access is not approved.');
  if(action==='provision'&&(typeof subject!=='string'||!subject||subject===config.ownerSubject||subject.length>200||
    !Number.isSafeInteger(expires)||expires<=now()))throw Error('Verified pupil identity and expiry required.');
  if(['provision','grant'].includes(action)){
   if(typeof subject!=='string'||!subject||subject===config.ownerSubject||subject.length>200)throw Error('Verified subject required.');
   const kind=config.pupilKind?.(pupil);
   if(!['adult','child'].includes(kind))throw Error('Pupil age category requires Owner review.');
   if(!['adult','guardian','supervised-child'].includes(relation)||
      (kind==='adult'&&relation!=='adult')||(kind==='child'&&relation==='adult')||
      typeof evidence!=='string'||!evidence.trim()||evidence.length>200)throw Error('Authorisation and consent evidence reference required.');
  }
  const request=JSON.stringify({organisation:config.organisation,scope:config.identityScope,actor:actor.subject,pupil,action,expectedRevision,subject:subject??null,expires:expires??null,relation:relation??null,evidence:evidence??null});
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
    }else if(!['grant','revokeGrant'].includes(action))row.status=action==='activate'?'active':action==='deactivate'?'inactive':'revoked';
    row.revision++;
    db.prepare('UPDATE access SET link=?,status=?,revision=?,expires=? WHERE organisation=? AND pupil=?').run(row.link,row.status,row.revision,row.expires,row.organisation,row.pupil);
   }
   if(['provision','grant'].includes(action))db.prepare('INSERT INTO grants VALUES (?,?,?,?,?,?,?) ON CONFLICT(organisation,pupil,scope,subject) DO UPDATE SET relation=excluded.relation,evidence=excluded.evidence,status=excluded.status').run(config.organisation,pupil,config.identityScope,subject,relation,evidence,'active');
   if(action==='revokeGrant'){
    if(typeof subject!=='string'||!subject)throw Error('Subject required.');
    const changed=db.prepare("UPDATE grants SET status='revoked' WHERE organisation=? AND pupil=? AND scope=? AND subject=?").run(config.organisation,pupil,config.identityScope,subject);
    if(!changed.changes)throw Error('Unknown pupil relationship.');
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
  if(!row||row.scope!==actor.scope||row.status!=='active'||row.expires<=now()||config.pupilExists(row.pupil)!==true)deny();
  const grant=db.prepare("SELECT * FROM grants WHERE organisation=? AND pupil=? AND scope=? AND subject=? AND status='active'").get(config.organisation,row.pupil,actor.scope,actor.subject);
  if(!grant||!grant.evidence)deny();
  const kind=config.pupilKind?.(row.pupil);
  if((kind==='adult'&&grant.relation!=='adult')||(kind==='child'&&!['guardian','supervised-child'].includes(grant.relation))||!['adult','child'].includes(kind))deny();
  // Every data operation must derive the pupil from this result, not client pupilId.
  return {organisation:row.organisation,pupil:row.pupil,revision:row.revision};
 }
 return {change,authorize,status(actor,pupil){owner(actor);return view(current(pupil));},close(){db.close();}};
}
module.exports={openAccess};
