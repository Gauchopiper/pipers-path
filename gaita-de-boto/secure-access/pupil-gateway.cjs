'use strict';
// Adapter boundary: authenticate retrieves a validated server session, never body.actor.
// backend is private server-to-server; no pupil Google Drive/Sheets scopes.
function pupilGateway({access,authenticate,backend,origin}){
 const actions=new Set(['getPath','getGroup','getRecordingState','uploadRecording','setSessionTarget','recordingAudio','submitFeedback']);
 return async function dispatch(request){
  if(request.method!=='POST'||request.origin!==origin)throw Error('Access denied.');
  const actor=await authenticate(request); // Must also enforce session CSRF/expiry/logout.
  const {action,link,organisation,payload={}}=request.body||{};
  if(!actions.has(action)||!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid pupil operation.');
  if(['pupilId','accessKey','actor','subject','organisation','fileId','fileUrl','driveFileLink'].some(k=>Object.hasOwn(payload,k)))throw Error('Client-selected identity or file forbidden.');
  const binding=await access.authorize(actor,link,organisation);
  // Backend resolves sessionId to a logged pupil-owned file; it must not trust raw URLs.
  // No fallback to legacy bearer credentials or raw public Drive URLs is allowed.
  return {headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},data:await backend(action,binding,payload)};
 };
}
module.exports={pupilGateway};
