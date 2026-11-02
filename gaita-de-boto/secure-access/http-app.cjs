'use strict';
const {pupilGateway}=require('./pupil-gateway.cjs');
// Staged integration server. All production adapters must be supplied explicitly.
// No default Google credentials, backend endpoint or public listen() operation.
function httpApp({origin,clientId,ownerSubject,scope,sessions,verify,access,backend,provisioning}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://')||!ownerSubject||scope!=='google:'+clientId)throw Error('Invalid server configuration.');
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
 function cookies(req){
  const out=Object.create(null);
  for(const part of String(req.headers.cookie||'').split(';')){
   const i=part.indexOf('=');if(i<0)continue;const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();
   if(Object.hasOwn(out,k))throw Error('Access denied.');out[k]=v;
  }return out;
 }
 async function body(req){
  if(req.headers['content-type']!=='application/json')throw Error('Invalid request.');
  let bytes=0,parts=[];
  for await(const p of req){bytes+=p.length;if(bytes>15*1024*1024)throw Error('Request too large.');parts.push(p);}
  const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request.');return data;
 }
 async function authenticate(req){return (await sessions.read(req.sessionId,req.csrf)).actor;}
 const dispatch=pupilGateway({access,authenticate,backend,origin});
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const reply=(code,value,cs)=>{if(cs)res.setHeader('Set-Cookie',cs);res.writeHead(code);res.end(JSON.stringify(value));};
  try{
   // A deployment adapter must supply trusted network rate-limit identity. Never trust X-Forwarded-For blindly.
   await sessions.limit('global',500,60000);await sessions.limit('peer:'+req.socket.remoteAddress,60,60000);
   const url=new URL(req.url,origin);if(url.origin!==origin||url.search||url.hash)throw Error('Invalid request.');
   if(req.method!=='POST'||req.headers.origin!==origin)throw Error('Access denied.');
   const c=cookies(req),data=await body(req),sid=c['__Host-gdb-session'],csrf=req.headers['x-gdb-csrf'];
   if(url.pathname==='/auth/challenge'){
    await sessions.limit('login:'+req.socket.remoteAddress,10,60000);
    const ch=await sessions.challenge();return reply(200,{nonce:ch.nonce,csrf:ch.csrf,clientId,expires:ch.expires},[
     cookie('__Host-gdb-login',ch.id,300),cookie('__Host-gdb-login-csrf',ch.csrf,300)]);
   }
   if(url.pathname==='/auth/google'){
    await sessions.limit('verify:'+req.socket.remoteAddress,10,60000);
    const challenge=await sessions.getChallenge(c['__Host-gdb-login'],data.csrf);
    const actor=await verify({credential:data.credential,csrfCookie:c['__Host-gdb-login-csrf'],csrfBody:data.csrf,requestOrigin:req.headers.origin,challenge});
    const s=await sessions.create(actor,sid);
    return reply(200,{ok:true,csrf:s.csrf,expires:s.expires,enrolment:s.enrolment},[
     cookie('__Host-gdb-session',s.id,3600),cookie('__Host-gdb-login','',0),cookie('__Host-gdb-login-csrf','',0)]);
   }
   if(url.pathname==='/auth/session'){
    // Same-origin POST required, but CSRF token retrieval cannot require the lost token.
    const s=await sessions.read(sid,null,false);return reply(200,{ok:true,csrf:s.csrf,expires:s.expires});
   }
   if(url.pathname==='/auth/logout'){
    await sessions.logout(sid,csrf);return reply(200,{ok:true},[cookie('__Host-gdb-session','',0)]);
   }
   const actor=await authenticate({sessionId:sid,csrf});
   if(url.pathname==='/owner/provisioning'&&provisioning){
    if(actor.subject!==ownerSubject||actor.scope!==scope)throw Error('Access denied.');
    return reply(200,data.action==='status'?await provisioning.status(actor,data.operation):await provisioning.run(actor,data));
   }
   if(url.pathname==='/owner/access'){
    if(actor.subject!==ownerSubject||actor.scope!==scope)throw Error('Access denied.');
    if(data.action==='status')return reply(200,{access:await access.status(actor,data.pupil)});
    // Bind only to an identity actually verified at this server. Never accept raw subject.
    if(Object.hasOwn(data,'subject')||Object.hasOwn(data,'actor'))throw Error('Invalid request.');
    const input={...data};
    if(['provision','grant','revokeGrant'].includes(input.action))input.subject=await sessions.resolveEnrolment(input.enrolment);
    delete input.enrolment;
    return reply(200,await access.change(actor,input));
   }
   if(url.pathname==='/api/pupil'){
    const r=await dispatch({method:req.method,origin:req.headers.origin,body:data,sessionId:sid,csrf});return reply(200,r.data);
   }
   return reply(404,{ok:false,error:'Not found.'});
  }catch(_){
   // No token, key, private URL, subject or provider error is returned/logged.
   if(!res.headersSent)reply(403,{ok:false,error:'Request not authorised or could not be completed.'});else res.end();
  }
 };
}
module.exports={httpApp};
