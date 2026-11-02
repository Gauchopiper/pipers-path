'use strict';
const {P,digest,exact,uuid}=require('./protocol.cjs');
const fields=['environment','organisation','pupil','workbook','folder','journal','recovery','thresholdSeconds','owner',
  'gatewayOrigin','policyRevision','windowStart','windowEnd','sessionId','operations'];
const synthetic=x=>typeof x==='string'&&/^synthetic-[a-z0-9-]{1,90}$/.test(x);
function profiles({fixtureOnly=false}={}) {
  if(!fixtureOnly)throw Error('Offline synthetic opt-in required.');
  const brands=new WeakSet();let current=null;
  function install(value) {
    if(!exact(value,fields)||!synthetic(value.environment)||value.organisation!=='GAITA-DE-BOTO'||
      !['pupil','workbook','folder','journal','recovery','owner'].every(k=>synthetic(value[k])&&!value[k].includes('operational'))||
      value.thresholdSeconds!==300||value.gatewayOrigin!=='https://synthetic-stage2g.invalid'||
      !Number.isSafeInteger(value.policyRevision)||value.policyRevision<1||!Number.isSafeInteger(value.windowStart)||
      !Number.isSafeInteger(value.windowEnd)||value.windowEnd<=value.windowStart||!uuid(value.sessionId)||
      !Array.isArray(value.operations)||new Set(value.operations).size!==value.operations.length||
      !value.operations.length||value.operations.some(x=>!['recording.submit','recording.status','path.read','playback.read'].includes(x)))throw Error('Trusted synthetic profile rejected.');
    const copy=JSON.parse(P.canonical(value));Object.freeze(copy.operations);Object.freeze(copy);brands.add(copy);current=copy;return copy;
  }
  function assert(profile,selection,now,operation) {
    if(!brands.has(profile)||profile!==current||!exact(selection,['environment','organisation','pupil'])||
      ['environment','organisation','pupil'].some(k=>selection[k]!==profile[k])||now<profile.windowStart||now>=profile.windowEnd||
      !profile.operations.includes(operation))throw Error('Profile, selection or policy changed.');
    return profile;
  }
  return {install,assert,current:()=>current,digest:p=>{if(!brands.has(p))throw Error('Untrusted profile.');return digest(p);}};
}
function identities({fixtureOnly=false}={}) {
  if(!fixtureOnly)throw Error('Fixture identities only.');
  const known=new WeakSet(),dead=new WeakSet();
  return {mint(subject,role){if(!synthetic(subject)||!['owner','worker','recovery','session'].includes(role))throw Error('Synthetic identity required.');
    const x=Object.freeze({subject,role,id:require('node:crypto').randomUUID()});known.add(x);return x;},
    check(x,role,subject){if(!known.has(x)||dead.has(x)||x.role!==role||(subject&&x.subject!==subject))throw Error('Identity or role denied.');},
    revoke(x){if(!known.has(x))throw Error('Unknown identity.');dead.add(x);}};
}
module.exports={profiles,identities,fields};
