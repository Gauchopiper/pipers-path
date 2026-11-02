'use strict';
const assert=require('node:assert/strict'),{OAuth2Client}=require('google-auth-library'),{appsScriptClient}=require('./apps-script-client.cjs');
(async()=>{
 let count=0,calls=0,seen;const test=async(n,f)=>{await f();count++;console.log('PASS '+n);};
 const owner=new OAuth2Client();owner.request=async req=>{calls++;seen=req;const e=req.data.parameters[0];return {data:{done:true,response:{result:{ok:true,requestId:e.requestId,organisation:e.binding.organisation,pupil:e.binding.pupil,data:{sessionId:e.payload.sessionId}}}}};};
 const options={deploymentId:'fixture_api_executable_deployment',ownerClient:owner},binding={organisation:'GAITA-DE-BOTO',pupil:'fixture-pupil',revision:1},payload={sessionId:'01234567-89ab-4cde-8abc-0123456789ab'};
 await test('connector disabled unless approved',()=>assert.rejects(appsScriptClient(options)('getPath',binding,{}),/not approved/));
 const call=appsScriptClient({...options,approved:true});
 await test('fixed API executable/function, no development mode and original Session ID retained',async()=>{assert.equal((await call('uploadRecording',binding,payload)).sessionId,payload.sessionId);assert(seen.url.startsWith('https://script.googleapis.com/v1/scripts/'));assert.equal(seen.data.function,'gdb_gatewayRequest');assert.equal(seen.data.devMode,false);assert.equal(seen.retry,false);});
 await test('foreign organisation and client-selected pupil/file rejected before network',async()=>{const before=calls;await assert.rejects(call('getPath',{...binding,organisation:'EMGT'},{}),/binding/);await assert.rejects(call('recordingAudio',binding,{...payload,fileId:'other'}),/payload/);assert.equal(calls,before);});
 await test('wrong response binding is unconfirmed, not success',async()=>{owner.request=async()=>({data:{done:true,response:{result:{ok:true,pupil:'other'}}}});await assert.rejects(call('getPath',binding,{}),e=>e.code==='WRITER_OUTCOME_UNCONFIRMED');});
 await test('lost response never triggers blind second upload',async()=>{let attempts=0;owner.request=async()=>{attempts++;throw Error('fixture timeout');};await assert.rejects(call('uploadRecording',binding,payload),e=>e.code==='WRITER_OUTCOME_UNCONFIRMED');assert.equal(attempts,1);});
 console.log(`${count} private connector contract checks passed. Mock transport; no live API executable or backend receiver verified.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
