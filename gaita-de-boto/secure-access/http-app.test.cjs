'use strict';
const {createServer}=require('node:http'),{once}=require('node:events');
const {generateKeyPairSync,sign,randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const {OAuth2Client}=require('google-auth-library'),{googleVerifier}=require('./google-auth.cjs');
const {sessionStore}=require('./sessions.cjs'),{openAccess}=require('./access.cjs'),{httpApp}=require('./http-app.cjs');
(async()=>{
 const origin='https://fixture.example',clientId='fixture.apps.googleusercontent.com',scope='google:'+clientId;
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),client=new OAuth2Client();
 client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:keys.publicKey.export({type:'spki',format:'pem'})},format:'PEM'});
 const sessions=sessionStore(':memory:',{scope});
 const access=openAccess(':memory:',{organisation:'GAITA-DE-BOTO',ownerSubject:'owner',identityScope:scope,origin,externalApproved:true,pupilExists:p=>p==='child',pupilKind:()=> 'child'});
 let backendCalls=0;
 const server=createServer(httpApp({origin,clientId,ownerSubject:'owner',scope,sessions,access,verify:googleVerifier({origin,clientId,client}),backend:async(action,binding,payload)=>{backendCalls++;return {ok:true,action,pupil:binding.pupil,sessionId:payload.sessionId};}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 let count=0;async function check(n,f){await f();console.log('PASS '+n);count++;}
 async function post(path,data={},jar={},extra={}){
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...extra},body:JSON.stringify(data)});
  const cookies=r.headers.getSetCookie();for(const c of cookies){const [k,v]=c.split(';')[0].split('=');if(v)jar[k]=v;else delete jar[k];}
  return {status:r.status,data:await r.json(),cookies,headers:r.headers};
 }
 function token(sub,nonce){const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const t=Math.floor(Date.now()/1000);const s=encode({alg:'RS256',kid:'fixture'})+'.'+encode({iss:'https://accounts.google.com',aud:clientId,sub,nonce,iat:t,exp:t+3600});return s+'.'+sign('RSA-SHA256',Buffer.from(s),keys.privateKey).toString('base64url');}
 async function login(sub){const jar={},ch=await post('/auth/challenge',{},jar);const input={credential:token(sub,ch.data.nonce),csrf:ch.data.csrf};const before={...jar};const r=await post('/auth/google',input,jar);assert.equal(r.status,200);return {jar,r,input,before};}
 const admin=(u,d)=>post('/owner/access',d,u.jar,{'X-GDB-CSRF':u.r.data.csrf});
 const operation=(action,revision,extra={})=>({action,pupil:'child',expectedRevision:revision,operation:randomUUID(),...extra});
 let owner,guardian,link;
 try{
 await check('actual HTTP login binds signed token to new HttpOnly secure session',async()=>{owner=await login('owner');guardian=await login('guardian');assert(guardian.r.cookies.some(c=>c.startsWith('__Host-gdb-session=')&&c.includes('Secure; HttpOnly; SameSite=Strict')));assert.equal(guardian.r.headers.get('cache-control'),'no-store');});
 await check('replayed login challenge fails',async()=>assert.equal((await post('/auth/google',guardian.input,guardian.before)).status,403));
 await check('foreign-origin challenge fails',async()=>assert.equal((await post('/auth/challenge',{}, {},{Origin:'https://evil.example'})).status,403));
 await check('anonymous and pupil cannot use Owner provisioning endpoint',async()=>{assert.equal((await post('/owner/access',operation('provision',0))).status,403);assert.equal((await admin(guardian,operation('provision',0))).status,403);});
 await check('Owner cannot bind a forged subject or nonexistent enrolment',async()=>{assert.equal((await admin(owner,operation('provision',0,{subject:'guardian'}))).status,403);assert.equal((await admin(owner,operation('provision',0,{enrolment:'fabricated'}))).status,403);});
 await check('verified guardian enrolment creates only inactive child access',async()=>{const r=await admin(owner,operation('provision',0,{enrolment:guardian.r.data.enrolment,relation:'guardian',evidence:'fixture-private-consent',expires:Date.now()+3600000}));assert.equal(r.status,200);assert.equal(r.data.access.status,'inactive');assert.equal(r.data.access.link,null);});
 await check('Owner activation provides identity-bound child selector',async()=>{const r=await admin(owner,operation('activate',1));assert.equal(r.status,200);link=new URL(r.data.access.link).pathname.split('/').pop();});
 const pupil=()=>({action:'getRecordingState',link,organisation:'GAITA-DE-BOTO',payload:{sessionId:'original-pending-session'}});
 const call=(u,data=pupil(),extra={})=>post('/api/pupil',data,u.jar,{'X-GDB-CSRF':u.r.data.csrf,...extra});
 await check('authenticated guardian reaches gateway with original Session ID',async()=>{const r=await call(guardian);assert.equal(r.status,200);assert.equal(r.data.pupil,'child');assert.equal(r.data.sessionId,'original-pending-session');});
 await check('session cannot be used without CSRF token',async()=>{assert.equal((await call(guardian,pupil(),{'X-GDB-CSRF':''})).status,403);});
 await check('body actor and pupil claims cannot grant access',async()=>{const p=pupil();p.payload.pupilId='another-child';assert.equal((await call(guardian,p)).status,403);assert.equal((await call(owner)).status,403);});
 await check('relationship revocation blocks existing browser session',async()=>{assert.equal((await admin(owner,operation('revokeGrant',2,{enrolment:guardian.r.data.enrolment}))).status,200);const n=backendCalls;assert.equal((await call(guardian)).status,403);assert.equal(backendCalls,n);});
 await check('regrant requires explicit evidence and existing verified enrolment',async()=>{assert.equal((await admin(owner,operation('grant',3,{enrolment:guardian.r.data.enrolment,relation:'guardian'}))).status,403);assert.equal((await admin(owner,operation('grant',3,{enrolment:guardian.r.data.enrolment,relation:'guardian',evidence:'new-consent-fixture'}))).status,200);assert.equal((await call(guardian)).status,200);});
 await check('logout invalidates copied session cookie',async()=>{const copied={...guardian.jar};assert.equal((await post('/auth/logout',{},guardian.jar,{'X-GDB-CSRF':guardian.r.data.csrf})).status,200);assert.equal((await post('/api/pupil',pupil(),copied,{'X-GDB-CSRF':guardian.r.data.csrf})).status,403);});
 await check('session expiry and fixed-window limit enforced',()=>{
  let time=1000;const s=sessionStore(':memory:',{scope,now:()=>time,sessionMs:1000});
  try{const v=s.create({verified:true,subject:'fixture',scope});time=2000;assert.throws(()=>s.read(v.id,v.csrf),/denied/);s.limit('fixture',1,1000);assert.throws(()=>s.limit('fixture',1,1000),/Too many/);time=3000;s.limit('fixture',1,1000);}finally{s.close();}
 });
 console.log(`${count} local HTTP/session integration checks passed. Fixture Google keys; no live Google, Drive, Family Link or production hosting.`);
 }finally{await new Promise(r=>server.close(r));sessions.close();access.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
