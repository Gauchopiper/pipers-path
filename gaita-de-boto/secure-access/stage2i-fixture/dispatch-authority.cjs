'use strict';
// Local authoritative-admission double. A real fresh Google/gateway protocol is NOT installed.
const {digest,exact,uuid}=require('../stage2g-fixture/protocol.cjs');
function dispatchAuthority({fixtureOnly,profile,profiles,now,worker}){
 if(!fixtureOnly)throw Error('Offline dispatch authority required.');let admission={status:'active',revision:1,expires:profile.windowEnd},permit=null;
 function typed(p,a){if(!exact(p,['sessionId','worker','fence','lease','manifest','manifestHash'])||p.sessionId!==profile.sessionId||p.worker!==worker||
   !Number.isSafeInteger(p.fence)||p.fence<1||!Number.isSafeInteger(p.lease)||p.lease<=now()||p.lease>now()+30000||
   !Number.isSafeInteger(a)||a<1||!uuid(p.manifest?.operation)||typeof p.manifest.baseVersion!=='string'||!Number.isSafeInteger(p.manifest.admissionRevision)||
   p.manifestHash!==digest(p.manifest)||p.manifest.binding.sessionId!==p.sessionId)throw Error('Typed dispatch permit/lease rejected.');}
 function register(p,a){typed(p,a);if(permit&&p.fence<permit.fence)throw Error('Stale fencing authority.');permit=JSON.parse(JSON.stringify(p));}
 function validate(p,a){typed(p,a);profiles.assert(profile,{environment:profile.environment,organisation:profile.organisation,pupil:profile.pupil},now(),'recording.submit');
  if(admission.status!=='active'||admission.expires<=now()||a!==admission.revision||!permit||digest(p)!==digest(permit))throw Error('Current Owner admission/policy/fencing/dispatch authority denied.');}
 return{register,validate,setAdmission:a=>{admission={...a};},snapshot:()=>({admission:{...admission},permit:permit&&JSON.parse(JSON.stringify(permit))}),setFence:n=>{if(permit)permit.fence=n;}};
}
module.exports={dispatchAuthority};
