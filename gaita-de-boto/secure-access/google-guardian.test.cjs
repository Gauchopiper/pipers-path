'use strict';
const assert=require('node:assert/strict'),{randomUUID,generateKeyPairSync,sign}=require('node:crypto');
const {OAuth2Client}=require('google-auth-library'),{googleVerifier}=require('./google-auth.cjs');
const {openAccess}=require('./access.cjs'),{pupilGateway}=require('./pupil-gateway.cjs');
(async()=>{
 let count=0;const test=async(n,f)=>{await f();console.log('PASS '+n);count++;};
 const clientId='fixture.apps.googleusercontent.com',origin='https://fixture.example',nonce='fixture-nonce-at-least-32-characters',csrf='fixture-csrf-at-least-32-characters';
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 const client=new OAuth2Client();
 // Only key retrieval is replaced: real Google library verifies fixture RSA signatures.
 client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:keys.publicKey.export({type:'spki',format:'pem'})},format:'PEM'});
 const verify=googleVerifier({clientId,origin,client});
 const base={iss:'https://accounts.google.com',aud:clientId,sub:'guardian-fixture',nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
 function token(p,privateKey=keys.privateKey){const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const text=b({alg:'RS256',kid:'fixture'})+'.'+b(p);return text+'.'+sign('RSA-SHA256',Buffer.from(text),privateKey).toString('base64url');}
 function request(p=base){let used=false;return {credential:token(p),csrfCookie:csrf,csrfBody:csrf,requestOrigin:origin,challenge:{nonce,expires:Date.now()+60000,consume:async()=>{if(used)return false;used=true;return true;}}};}
 let actor;
 await test('signed token verified by Google library and bound to stable subject',async()=>{actor=await verify(request());assert.equal(actor.subject,base.sub);assert.equal(actor.scope,'google:'+clientId);assert.equal(actor.verified,true);});
 for(const [name,p] of Object.entries({audience:{aud:'other.apps.googleusercontent.com'},issuer:{iss:'https://attacker.example'},expiry:{exp:1},nonce:{nonce:'wrong-nonce-32-characters-long'},authorizedParty:{azp:'other.apps.googleusercontent.com'}}))await test('reject wrong '+name,()=>assert.rejects(verify(request({...base,...p})),/could not/));
 await test('reject forged RSA signature',()=>{const r=request();r.credential=token(base,generateKeyPairSync('rsa',{modulusLength:2048}).privateKey);return assert.rejects(verify(r),/could not/);});
 await test('reject CSRF mismatch and foreign origin',async()=>{await assert.rejects(verify({...request(),csrfBody:'bad'}),/could not/);await assert.rejects(verify({...request(),requestOrigin:'https://attacker.example'}),/could not/);});
 await test('challenge is single use',async()=>{const r=request();await verify(r);await assert.rejects(verify(r),/could not/);});
 const owner={...actor,subject:'owner-fixture'};
 const svc=openAccess(':memory:',{organisation:'GAITA-DE-BOTO',ownerSubject:owner.subject,identityScope:actor.scope,origin,externalApproved:true,pupilExists:p=>['child-a','child-b','child-c'].includes(p),pupilKind:()=> 'child'});
 const change=(pupil,action,expectedRevision,extra={})=>svc.change(owner,{operation:randomUUID(),pupil,action,expectedRevision,...extra});
 const provision=p=>change(p,'provision',0,{subject:actor.subject,relation:'guardian',evidence:'private-consent-record-'+p,expires:Date.now()+3600000});
 const activate=p=>new URL(change(p,'activate',1).access.link).pathname.split('/').pop();
 let a,b;
 try{
 await test('child cannot be provisioned as adult or without consent reference',()=>{
  assert.throws(()=>change('child-a','provision',0,{subject:actor.subject,relation:'adult',evidence:'e',expires:Date.now()+10000}),/consent/);
  assert.throws(()=>change('child-a','provision',0,{subject:actor.subject,relation:'guardian',expires:Date.now()+10000}),/consent/);
 });
 await test('one verified guardian can manage two separately approved children',()=>{provision('child-a');provision('child-b');a=activate('child-a');b=activate('child-b');assert.equal(svc.authorize(actor,a,'GAITA-DE-BOTO').pupil,'child-a');assert.equal(svc.authorize(actor,b,'GAITA-DE-BOTO').pupil,'child-b');});
 await test('second guardian requires explicit child-specific grant',()=>{
  const second={...actor,subject:'second-guardian'};assert.throws(()=>svc.authorize(second,a,'GAITA-DE-BOTO'),/denied/);
  change('child-a','grant',2,{subject:second.subject,relation:'guardian',evidence:'private-authorisation-second'});
  assert.equal(svc.authorize(second,a,'GAITA-DE-BOTO').pupil,'child-a');assert.throws(()=>svc.authorize(second,b,'GAITA-DE-BOTO'),/denied/);
 });
 await test('revoking one guardian-child relationship preserves sibling grant',()=>{change('child-a','revokeGrant',3,{subject:actor.subject});assert.throws(()=>svc.authorize(actor,a,'GAITA-DE-BOTO'),/denied/);assert.equal(svc.authorize(actor,b,'GAITA-DE-BOTO').pupil,'child-b');});
 let calls=0;
 const gateway=pupilGateway({access:svc,authenticate:async()=>actor,origin,backend:async(action,binding,payload)=>{calls++;return {action,pupil:binding.pupil,sessionId:payload.sessionId};}});
 const req=action=>({method:'POST',origin,body:{action,link:b,organisation:'GAITA-DE-BOTO',payload:{sessionId:'fixture-session'}}});
 await test('all pupil actions resolve the same authorised child server-side',async()=>{for(const action of ['getPath','getGroup','getRecordingState','uploadRecording','setSessionTarget','recordingAudio','submitFeedback']){const r=await gateway(req(action));assert.equal(r.data.pupil,'child-b');assert.equal(r.headers['Cache-Control'],'no-store');}});
 await test('client identity/file substitution rejected before backend invocation',async()=>{const before=calls;for(const key of ['pupilId','accessKey','subject','fileId','fileUrl','driveFileLink']){const r=req('recordingAudio');r.body.payload[key]='child-a';await assert.rejects(gateway(r),/forbidden/);}assert.equal(calls,before);});
 await test('foreign origin and organisation rejected',async()=>{await assert.rejects(gateway({...req('getPath'),origin:'https://evil.example'}),/denied/);const r=req('getPath');r.body.organisation='EMGT';await assert.rejects(gateway(r),/denied/);});
 await test('revocation enforced even with existing authenticated session',async()=>{change('child-b','revoke',2);await assert.rejects(gateway(req('getPath')),/denied/);});
 }finally{svc.close();}
 console.log(`${count} Google-crypto/guardian/gateway checks passed. Fixture keys/identities; no real Google login or Family Link test.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
