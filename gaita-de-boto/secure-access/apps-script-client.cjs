'use strict';
const {OAuth2Client}=require('google-auth-library'),{randomUUID}=require('node:crypto');
const actions=new Set(['getPath','getGroup','getRecordingState','uploadRecording','setSessionTarget','recordingAudio','submitFeedback']);
// Review candidate only. Requires an Owner-authorised user OAuth client, not ADC/service account.
// No /exec URL fallback, redirect following to arbitrary hosts or direct Drive/Sheets writer.
function appsScriptClient({deploymentId,ownerClient,approved=false,now=Date.now}){
 if(!/^[A-Za-z0-9_-]{20,200}$/.test(deploymentId||'')||!(ownerClient instanceof OAuth2Client))throw Error('API executable and Owner OAuth client required.');
 return async function call(action,binding,payload){
  if(approved!==true)throw Error('Private writer connection is not approved.');
  if(!actions.has(action)||binding?.organisation!=='GAITA-DE-BOTO'||typeof binding.pupil!=='string'||!binding.pupil||!Number.isSafeInteger(binding.revision)||binding.revision<1)throw Error('Invalid writer binding.');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||['pupilId','accessKey','subject','actor','organisation','fileId','fileUrl','driveFileLink'].some(k=>Object.hasOwn(payload,k)))throw Error('Invalid writer payload.');
  if(['uploadRecording','getRecordingState','setSessionTarget','recordingAudio'].includes(action)&&!/^[a-f0-9-]{36}$/.test(payload.sessionId||''))throw Error('Original Session ID required.');
  const envelope={protocol:'gdb-private-writer-v1',requestId:randomUUID(),issuedAt:now(),action,binding:{organisation:binding.organisation,pupil:binding.pupil,revision:binding.revision},payload};
  if(Buffer.byteLength(JSON.stringify(envelope))>15*1024*1024)throw Error('Writer request too large.');
  try{
   const response=await ownerClient.request({url:'https://script.googleapis.com/v1/scripts/'+deploymentId+':run',method:'POST',data:{function:'gdb_gatewayRequest',parameters:[envelope],devMode:false},retry:false,timeout:390000});
   const result=response.data?.response?.result;
   if(response.data?.done!==true||response.data?.error||!result||result.requestId!==envelope.requestId||result.organisation!==binding.organisation||result.pupil!==binding.pupil||result.ok!==true)throw Error();
   return result.data;
  }catch(_){
   // A timeout/lost response may follow a completed write. Never upload again here.
   const error=Error('Writer outcome unconfirmed. Preserve local audio and check the original Session ID receipt.');
   error.code='WRITER_OUTCOME_UNCONFIRMED';throw error;
  }
 };
}
module.exports={appsScriptClient};
