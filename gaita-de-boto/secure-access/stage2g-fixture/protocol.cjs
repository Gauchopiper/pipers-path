'use strict';
// Local loader only; candidate .gs has no Node imports. No Google API is called.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const crypto = require('node:crypto');
const candidate = fs.readFileSync(path.join(__dirname, 'Protocol.gs.proposed'), 'utf8');
function loadProtocol() {
  const context = vm.createContext({Utilities:{Charset:{UTF_8:'UTF-8'},computeRsaSha256Signature(wire,pem) {
    return Array.from(crypto.sign('RSA-SHA256',Buffer.from(wire,'utf8'),pem), x => x>127?x-256:x);
  }}});
  vm.runInContext(candidate,context,{timeout:5000}); return context.GdbGProtocol;
}
const P = loadProtocol();
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v,k));
const digest = v => P.hash(P.canonical(v));
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function envelope(key,purpose,ns,payload,now,nonce=crypto.randomUUID()) {
  return P.sign({protocol:'gdb-stage2g-v1',purpose,...ns,kid:key.kid,nonce,at:now,expires:now+30000,payload},key.pem);
}
function checked(keyring,purpose,ns,signed,now,{historical=false}={}) {
  if (!exact(signed,['wire','signature']) || typeof signed.wire!=='string' || Buffer.byteLength(signed.wire)>8*1024*1024) throw Error('Envelope rejected.');
  let b;try{b=JSON.parse(signed.wire);}catch{throw Error('Invalid JSON.');}
  if (!exact(b,['protocol','purpose','environment','profileDigest','kid','nonce','at','expires','payload']) ||
      b.protocol!=='gdb-stage2g-v1'||b.purpose!==purpose||b.environment!==ns.environment||b.profileDigest!==ns.profileDigest||
      P.canonical(b)!==signed.wire||!uuid(b.nonce)||!Number.isSafeInteger(b.at)||!Number.isSafeInteger(b.expires)||b.expires-b.at!==30000) throw Error('Envelope binding rejected.');
  if (historical && !['journal.event','recording.receipt'].includes(purpose)) throw Error('Historical verification purpose denied.');
  const k=keyring[b.kid];
  if (!k || k.status==='revoked' || (!historical&&k.status!=='active') || b.at<k.notBefore || b.at>=k.notAfter ||
      (!historical&&(b.at>now+2000||b.expires<=now))||!P.verifyRsa(signed.wire,signed.signature,k.jwk)) throw Error('Signature/key/expiry rejected.');
  return b;
}
module.exports={P,loadProtocol,exact,digest,uuid,envelope,checked};
