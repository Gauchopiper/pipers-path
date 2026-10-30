'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{openAccess}=require('./access.cjs');
const dir=mkdtempSync(join(tmpdir(),'gdb-access-')),file=join(dir,'fixture.sqlite');
let time=1000,count=0;
const owner={verified:true,scope:'fixture-site',subject:'fixture-owner'};
const a={verified:true,scope:'fixture-site',subject:'fixture-a'},b={...a,subject:'fixture-b'};
const pupils=new Set(['pupil-a','pupil-b']);
const config={organisation:'GAITA-DE-BOTO',ownerSubject:owner.subject,identityScope:owner.scope,origin:'https://fixture.example',externalApproved:true,pupilExists:id=>pupils.has(id),pupilKind:()=>'adult',now:()=>time};
let service=openAccess(file,config);
const op=(pupil,action,expectedRevision,more={})=>({operation:randomUUID(),pupil,action,expectedRevision,...more});
const check=(name,fn)=>{fn();console.log('PASS '+name);count++;};
const link=r=>new URL(r.access.link).pathname.split('/').pop();
try{
 check('unverified and other identities cannot provision',()=>{
  for(const who of [null,{...owner,verified:false},a,{...owner,scope:'different-site'}])assert.throws(()=>service.change(who,op('pupil-a','provision',0,{subject:a.subject,expires:9000,relation:'adult',evidence:'fixture-owner-approval'})),/denied/);
 });
 check('unknown canonical pupil rejected without creating a row',()=>{
  assert.throws(()=>service.change(owner,op('missing','provision',0,{subject:a.subject,expires:9000,relation:'adult',evidence:'fixture-owner-approval'})),/Unknown/);
  assert.equal(service.status(owner,'missing'),null);
 });
 const provision=op('pupil-a','provision',0,{subject:a.subject,expires:9000,relation:'adult',evidence:'fixture-owner-approval'});
 check('provision creates inactive membership, without issuing usable link',()=>{
  const r=service.change(owner,provision);assert.equal(r.access.status,'inactive');assert.equal(r.access.link,null);
 });
 check('lost response retry does not create duplicate membership',()=>{
  const r=service.change(owner,provision);assert.equal(r.duplicate,true);assert.equal(r.revision,1);
 });
 check('operation ID cannot be reused for a different pupil or payload',()=>assert.throws(()=>service.change(owner,{...provision,pupil:'pupil-b'}),/conflict/));
 check('second provisioning cannot duplicate existing pupil',()=>assert.throws(()=>service.change(owner,{...provision,operation:randomUUID(),expectedRevision:1}),/already exists/));
 let active,old;
 check('explicit Owner activation issues a link',()=>{active=service.change(owner,op('pupil-a','activate',1));old=link(active);assert.equal(active.access.status,'active');});
 check('assigned identity can access exactly its canonical pupil',()=>assert.deepEqual(service.authorize(a,old,'GAITA-DE-BOTO'),{organisation:'GAITA-DE-BOTO',pupil:'pupil-a',revision:2}));
 check('stolen link is denied to another identity including Owner',()=>{for(const who of [b,owner,null,{...a,verified:false},{...a,scope:'other'}])assert.throws(()=>service.authorize(who,old,'GAITA-DE-BOTO'),/denied/);});
 check('foreign organisation and forged link are denied',()=>{
  assert.throws(()=>service.authorize(a,old,'EMGT'),/denied/);assert.throws(()=>service.authorize(a,randomUUID(),'GAITA-DE-BOTO'),/denied/);
 });
 check('stale concurrent management action cannot overwrite newer state',()=>assert.throws(()=>service.change(owner,op('pupil-a','deactivate',1)),/changed/));
 check('deactivation immediately denies existing link',()=>{
  service.change(owner,op('pupil-a','deactivate',2));assert.throws(()=>service.authorize(a,old,'GAITA-DE-BOTO'),/denied/);
 });
 check('reactivation retains original membership and link',()=>assert.equal(link(service.change(owner,op('pupil-a','activate',3))),old));
 check('rotation invalidates old link and requires separate activation',()=>{
  const r=service.change(owner,op('pupil-a','rotate',4,{expires:12000}));assert.equal(r.access.status,'inactive');assert.equal(r.access.link,null);
  assert.throws(()=>service.authorize(a,old,'GAITA-DE-BOTO'),/denied/);
 });
 let replacement;
 check('replacement works only after activation',()=>{replacement=link(service.change(owner,op('pupil-a','activate',5)));assert.notEqual(replacement,old);assert.equal(service.authorize(a,replacement,'GAITA-DE-BOTO').pupil,'pupil-a');});
 check('revocation cannot be undone by ordinary activation',()=>{
  service.change(owner,op('pupil-a','revoke',6));assert.throws(()=>service.authorize(a,replacement,'GAITA-DE-BOTO'),/denied/);
  assert.throws(()=>service.change(owner,op('pupil-a','activate',7)),/Replace/);
 });
 check('retrying old successful provisioning does not return revoked link',()=>{const r=service.change(owner,provision);assert.equal(r.access.status,'revoked');assert.equal(r.access.link,null);});
 check('transaction failure cannot leave membership or successful operation behind',()=>{
  const raw=new DatabaseSync(file);raw.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'fixture interruption'); END");
  const input=op('pupil-b','provision',0,{subject:b.subject,expires:9000,relation:'adult',evidence:'fixture-owner-approval'});
  assert.throws(()=>service.change(owner,input),/fixture interruption/);assert.equal(service.status(owner,'pupil-b'),null);
  raw.exec('DROP TRIGGER fixture_failure');raw.close();assert.equal(service.change(owner,input).duplicate,false);
 });
 check('state and idempotency survive process-style reopen',()=>{
  service.close();service=openAccess(file,config);assert.equal(service.status(owner,'pupil-a').status,'revoked');assert.equal(service.change(owner,provision).duplicate,true);
 });
 let bLink;
 check('expiry enforced on each authorization',()=>{
  bLink=link(service.change(owner,op('pupil-b','activate',1)));time=9000;assert.throws(()=>service.authorize(b,bLink,'GAITA-DE-BOTO'),/denied/);time=1000;
 });
 check('canonical pupil removal fails closed',()=>{pupils.delete('pupil-b');assert.throws(()=>service.authorize(b,bLink,'GAITA-DE-BOTO'),/denied/);pupils.add('pupil-b');});
 check('release gate blocks issuance and authorization, permits revocation',()=>{
  const blocked=openAccess(file,{...config,externalApproved:false});
  assert.throws(()=>blocked.authorize(b,bLink,'GAITA-DE-BOTO'),/denied/);
  assert.throws(()=>blocked.change(owner,op('pupil-b','activate',2)),/not approved/);
  assert.equal(blocked.change(owner,op('pupil-b','revoke',2)).access.status,'revoked');blocked.close();
 });
 check('audit stores no personal link or recording data',()=>{
  const raw=new DatabaseSync(file);const columns=raw.prepare('PRAGMA table_info(audit)').all().map(x=>x.name);
  assert.deepEqual(columns,['sequence','organisation','pupil','actor','action','revision','at']);raw.close();
 });
 console.log(`${count} checks passed with persistent SQLite fixtures. No live identity, backend, or browser certification.`);
}finally{service.close();rmSync(dir,{recursive:true,force:true});}
