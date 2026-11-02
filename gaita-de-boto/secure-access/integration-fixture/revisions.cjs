'use strict';
const {randomUUID,createHash}=require('node:crypto'),{readFileSync}=require('node:fs'),{join}=require('node:path');
const events=Object.freeze({
 'recording.saved':['sessions','totals','availability'],
 'recording.reconciled':['sessions','totals','availability'],
 'recording.availabilityChanged':['availability'],
 'target.assigned':['targets'],'target.changed':['targets'],'target.achieved':['targets','badges'],
 'badge.awarded':['badges'],'badge.changed':['badges'],
 'teacher.commentChanged':['comments'],'teacher.reviewChanged':['reviews','targets','badges'],
 'pupil.activated':['access'],'pupil.deactivated':['access'],'pupil.revoked':['access'],'grant.changed':['access']
});
const org='GAITA-DE-BOTO',facets=['sessions','totals','availability','targets','badges','comments','reviews','access'];
const exact=(x,ks)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const token=(s,generation)=>generation+':'+s.revision+':'+s.access_revision;
async function revisionFixture({fixtureOnly=false,pool,authorizeChange,authorizeAdmin,inspectChange}){
 if(!fixtureOnly||!pool?.connect||![authorizeChange,authorizeAdmin,inspectChange].every(f=>typeof f==='function'))throw Error('Fixture configuration required.');
 await pool.query(readFileSync(join(__dirname,'revisions.sql'),'utf8'));
 await pool.query('INSERT INTO gdb_fixture_view_epoch(organisation,generation) VALUES($1,$2) ON CONFLICT DO NOTHING',[org,randomUUID()]);
 async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const epoch=async c=>{const e=(await c.query('SELECT * FROM gdb_fixture_view_epoch WHERE organisation=$1 FOR SHARE',[org])).rows[0];if(e.dirty_operation)throw Error('Authoritative catalogue revision unavailable: dirty.');return e.generation+':'+e.catalogue_revision;};
 const state=async(c,pupil)=>(await c.query('SELECT * FROM gdb_fixture_view_state WHERE organisation=$1 AND pupil=$2 FOR UPDATE',[org,pupil])).rows[0];
 async function allowed(actor,pupil,event){if(actor?.verified!==true||actor.scope!=='google:fixture'||await authorizeChange(actor,pupil,event)!==true)throw Error('Revision change denied.');}
 async function initialise(actor,pupil){
  if(typeof pupil!=='string'||!pupil||pupil.length>100||actor?.verified!==true||await authorizeAdmin(actor)!==true)throw Error('Revision administration denied.');
  await pool.query('INSERT INTO gdb_fixture_view_state(organisation,pupil,facets) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[org,pupil,JSON.stringify(Object.fromEntries(facets.map(k=>[k,0])))]);
 }
 async function version(selection){
  if(!exact(selection,['organisation','pupil'])||selection.organisation!==org||typeof selection.pupil!=='string')throw Error('Revision selection denied.');
  const s=(await pool.query('SELECT s.*,e.generation,e.catalogue_revision,e.dirty_operation AS catalogue_dirty FROM gdb_fixture_view_state s JOIN gdb_fixture_view_epoch e USING(organisation) WHERE s.organisation=$1 AND s.pupil=$2',[org,selection.pupil])).rows[0];
  if(!s||s.dirty_operation||s.catalogue_dirty)throw Error('Authoritative revision unavailable: missing or dirty.');return token(s,s.generation+':'+s.catalogue_revision);
 }
 async function begin(actor,input){
  if(!exact(input,['operation','pupil','event','expectedVersion'])||!uuid(input.operation)||!Object.hasOwn(events,input.event)||typeof input.pupil!=='string'||typeof input.expectedVersion!=='string')throw Error('Invalid revision operation.');
  await allowed(actor,input.pupil,input.event);
  const request=JSON.stringify({operation:input.operation,pupil:input.pupil,event:input.event,expectedVersion:input.expectedVersion,subject:actor.subject,scope:actor.scope});
  return tx(async c=>{
   const generation=await epoch(c),s=await state(c,input.pupil);if(!s)throw Error('Unknown pupil.');
   const old=(await c.query('SELECT * FROM gdb_fixture_view_operation WHERE organisation=$1 AND operation=$2',[org,input.operation])).rows[0];
   if(old){if(old.request!==request)throw Error('Revision operation conflict.');return {state:old.state,duplicate:true,requestDigest:digest(request),afterToken:old.after_token};}
   if(s.dirty_operation)throw Error('Previous canonical operation requires reconciliation.');
   if(token(s,generation)!==input.expectedVersion)throw Error('Stale authoritative revision.');
   await c.query("INSERT INTO gdb_fixture_view_operation(organisation,operation,pupil,event,request,state) VALUES($1,$2,$3,$4,$5,'dirty')",[org,input.operation,input.pupil,input.event,request]);
   await c.query('UPDATE gdb_fixture_view_state SET dirty_operation=$1 WHERE organisation=$2 AND pupil=$3',[input.operation,org,input.pupil]);
   return {state:'dirty',duplicate:false,requestDigest:digest(request)};
  });
 }
 async function finish(actor,operation){
  if(!uuid(operation))throw Error('Invalid revision operation.');
  return tx(async c=>{
   const generation=await epoch(c),record=(await c.query('SELECT * FROM gdb_fixture_view_operation WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];
   if(!record)throw Error('Unknown canonical operation.');await allowed(actor,record.pupil,record.event);
   const s=await state(c,record.pupil);
   if(record.state==='complete')return {duplicate:true,afterToken:record.after_token,currentToken:s.dirty_operation?null:token(s,generation)};
   if(s.dirty_operation!==operation)throw Error('Stale canonical completion.');
   // Trusted server-supplied inspector only; no pupil-supplied proof or clean/reset button.
   const proof=await inspectChange({operation,pupil:record.pupil,event:record.event,requestDigest:digest(record.request)});
   if(!exact(proof,['operation','pupil','event','requestDigest','sourceDigest'])||proof.operation!==operation||proof.pupil!==record.pupil||proof.event!==record.event||proof.requestDigest!==digest(record.request)||typeof proof.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(proof.sourceDigest))throw Error('Canonical change remains unverified.');
   const f=JSON.parse(s.facets);for(const facet of events[record.event])f[facet]++;
   const next={...s,revision:s.revision+1,access_revision:s.access_revision+(events[record.event].includes('access')?1:0)};
   const afterToken=token(next,generation);
   await c.query('UPDATE gdb_fixture_view_state SET revision=$1,access_revision=$2,facets=$3,dirty_operation=NULL WHERE organisation=$4 AND pupil=$5',[next.revision,next.access_revision,JSON.stringify(f),org,record.pupil]);
   await c.query("UPDATE gdb_fixture_view_operation SET state='complete',source_digest=$1,after_token=$2 WHERE organisation=$3 AND operation=$4",[proof.sourceDigest,afterToken,org,operation]);
   return {duplicate:false,afterToken,currentToken:afterToken};
  });
 }
 async function rotateEpoch(actor,operation){
  if(!uuid(operation)||actor?.verified!==true||await authorizeAdmin(actor)!==true)throw Error('Revision administration denied.');
  return tx(async c=>{
   await c.query('SELECT generation FROM gdb_fixture_view_epoch WHERE organisation=$1 FOR UPDATE',[org]);
   const old=(await c.query('SELECT generation FROM gdb_fixture_view_restore WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];if(old)return {duplicate:true,generation:old.generation};
   const generation=randomUUID();await c.query('UPDATE gdb_fixture_view_epoch SET generation=$1 WHERE organisation=$2',[generation,org]);
   await c.query('INSERT INTO gdb_fixture_view_restore VALUES($1,$2,$3)',[org,operation,generation]);return {duplicate:false,generation};
  });
 }
 async function catalogueVersion(){const e=(await pool.query('SELECT * FROM gdb_fixture_view_epoch WHERE organisation=$1',[org])).rows[0];if(e.dirty_operation)throw Error('Authoritative catalogue revision unavailable: dirty.');return e.generation+':'+e.catalogue_revision;}
 async function catalogueChange(actor,input,finishing=false){
  if(actor?.verified!==true||await authorizeAdmin(actor)!==true)throw Error('Revision administration denied.');
  if(!finishing&&(!exact(input,['operation','event','expectedVersion'])||!uuid(input.operation)||!['catalogue.targetChanged','catalogue.badgeChanged'].includes(input.event)))throw Error('Invalid catalogue operation.');
  const operation=finishing?input:input.operation;if(!uuid(operation))throw Error('Invalid catalogue operation.');
  return tx(async c=>{
   const e=(await c.query('SELECT * FROM gdb_fixture_view_epoch WHERE organisation=$1 FOR UPDATE',[org])).rows[0];
   const old=(await c.query('SELECT * FROM gdb_fixture_view_operation WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];
   if(!finishing){
    const request=JSON.stringify({operation,event:input.event,expectedVersion:input.expectedVersion,subject:actor.subject,scope:actor.scope});
    if(old){if(old.pupil!=='@catalogue'||old.request!==request)throw Error('Revision operation conflict.');return {duplicate:true,state:old.state,requestDigest:digest(request)};}
    if(e.dirty_operation||(await c.query('SELECT pupil FROM gdb_fixture_view_state WHERE organisation=$1 AND dirty_operation IS NOT NULL LIMIT 1',[org])).rows.length)throw Error('Previous canonical operation requires reconciliation.');
    if(e.generation+':'+e.catalogue_revision!==input.expectedVersion)throw Error('Stale catalogue revision.');
    await c.query("INSERT INTO gdb_fixture_view_operation(organisation,operation,pupil,event,request,state) VALUES($1,$2,'@catalogue',$3,$4,'dirty')",[org,operation,input.event,request]);
    await c.query('UPDATE gdb_fixture_view_epoch SET dirty_operation=$1 WHERE organisation=$2',[operation,org]);return {duplicate:false,state:'dirty',requestDigest:digest(request)};
   }
   if(!old||old.pupil!=='@catalogue')throw Error('Unknown catalogue operation.');
   if(old.state==='complete')return {duplicate:true,afterToken:old.after_token};
   if(e.dirty_operation!==operation)throw Error('Stale catalogue completion.');
   const request={operation,pupil:'@catalogue',event:old.event,requestDigest:digest(old.request)},proof=await inspectChange(request);
   if(!exact(proof,['operation','pupil','event','requestDigest','sourceDigest'])||Object.entries(request).some(([k,v])=>proof[k]!==v)||typeof proof.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(proof.sourceDigest))throw Error('Canonical change remains unverified.');
   const afterToken=e.generation+':'+(e.catalogue_revision+1);
   await c.query('UPDATE gdb_fixture_view_epoch SET catalogue_revision=catalogue_revision+1,dirty_operation=NULL WHERE organisation=$1',[org]);
   await c.query("UPDATE gdb_fixture_view_operation SET state='complete',source_digest=$1,after_token=$2 WHERE organisation=$3 AND operation=$4",[proof.sourceDigest,afterToken,org,operation]);return {duplicate:false,afterToken};
  });
 }
 return {initialise,version,begin,finish,rotateEpoch,catalogueVersion,
  beginCatalogue:(actor,input)=>catalogueChange(actor,input),finishCatalogue:(actor,operation)=>catalogueChange(actor,operation,true)};
}
module.exports={revisionFixture,events,digest};
