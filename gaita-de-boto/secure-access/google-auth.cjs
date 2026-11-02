'use strict';
const {OAuth2Client}=require('google-auth-library');
const {timingSafeEqual}=require('node:crypto');
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length>=16&&a.length<=512&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
// Production uses Google's library/key retrieval. Optional client is for signed fixture tests only.
function googleVerifier({clientId,origin,client=new OAuth2Client(),now=Date.now}){
 if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId||''))throw Error('Google web client ID required.');
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('HTTPS origin required.');
 return async function verify({credential,csrfCookie,csrfBody,requestOrigin,challenge}){
  try{
   if(requestOrigin!==origin||!equal(csrfCookie,csrfBody)||!challenge||challenge.expires<=now()||typeof challenge.consume!=='function')throw Error();
   if(typeof credential!=='string'||credential.length>16384)throw Error();
   const ticket=await client.verifyIdToken({idToken:credential,audience:clientId});
   const p=ticket.getPayload();
   // Library checks signature, issuer, audience and time; add exact expiry and nonce/replay binding.
   if(!p||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.aud!==clientId||
      (p.azp&&p.azp!==clientId)||!Number.isFinite(p.exp)||p.exp*1000<=now()||
      !Number.isFinite(p.iat)||p.iat*1000>now()+60000||typeof p.sub!=='string'||!p.sub||p.sub.length>255||
      !equal(p.nonce,challenge.nonce))throw Error();
   if(await challenge.consume()!==true)throw Error();
   return Object.freeze({verified:true,scope:'google:'+clientId,subject:p.sub});
  }catch(_){throw Error('Google sign-in could not be verified.');}
 };
}
module.exports={googleVerifier};
