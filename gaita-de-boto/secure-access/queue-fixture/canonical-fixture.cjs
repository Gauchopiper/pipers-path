'use strict';
// Runs UNCHANGED repository Apps Script in a VM with in-memory Google doubles.
// Not a live receiver or second writer. Not imported by any application route.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {validBinding,bytes,hash}=require('./postgres.cjs');
function canonicalFixture({fixtureOnly=false,authorize=()=>false}={}){
 if(!fixtureOnly)throw Error('Fixture opt-in required.');
 const tables={},files=new Map(),folder='synthetic-gaita-folder';let mode='normal',locked=false,uploads=0,attempts=0;
 const context=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>({GDB_PUPIL_RECORDINGS_FOLDER_ID:folder,GDB_QUALIFY_MINUTES:'5'})[k]})},
  SpreadsheetApp:{flush(){if(mode==='after-log'&&tables['PRACTICE LOG'].length>1)throw Error('fixture interrupted after log');}},
  LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('Nested fixture lock.');locked=true;},releaseLock(){locked=false;}})},
  Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),formatDate:d=>new Date(d).toISOString().slice(0,10),newBlob:(input,mime,name)=>({input:Buffer.from(input),mime,name})},
  DriveApp:{getFolderById:id=>{if(id!==folder)throw Error('Foreign folder.');return {createFile:blob=>{
   if(mode==='before-file')throw Error('fixture interrupted after STARTED');
   const id=randomUUID(),url='https://drive.google.com/file/d/'+id+'/view';uploads++;
   files.set(url,{...blob,folder});if(mode==='after-file')throw Error('fixture lost file acknowledgement');
   return {getUrl:()=>url};
  }};}}
 });
 const sourceRoot=path.join(__dirname,'../../apps-script/pupil');
 vm.runInContext(fs.readFileSync(path.join(sourceRoot,'Code.gs'),'utf8')+'\n'+fs.readFileSync(path.join(sourceRoot,'MediaDuration.gs'),'utf8'),context);
 const schemas=vm.runInContext('GDB_PUPIL_SCHEMAS',context);
 for(const [name,headers] of Object.entries(schemas))tables[name]=[Array.from(headers)];
 function sheet(name){
  if(!tables[name])return null;
  return {getLastRow:()=>tables[name].length,getDataRange:()=>({getValues:()=>tables[name].map(r=>r.slice())}),
   appendRow:r=>tables[name].push(Array.from(r)),
   getRange:(r,c,n=1,m=1)=>({getValues:()=>tables[name].slice(r-1,r-1+n).map(row=>Array.from({length:m},(_,i)=>row[c-1+i]??'')),setValue:v=>{tables[name][r-1][c-1]=v;}})};
 }
 const workbook={getSheetByName:sheet,insertSheet:name=>{tables[name]=[];return sheet(name);}};
 async function check(b){if(!validBinding(b)||await authorize(b)!==true)throw Error('Access revoked or denied.');}
 async function receipt(b){
  await check(b);let raw;
  context.LockService.getScriptLock().waitLock();
  try{raw=context.gdbPRecordingState_(workbook,b.pupil,b.sessionId);}finally{context.LockService.getScriptLock().releaseLock();}
  if(raw.state!=='saved')return {state:raw.state,retrySafe:raw.state==='absent'&&raw.retrySafe===true};
  const rows=tables['PRACTICE LOG'].slice(1).filter(r=>r[0]===b.pupil&&r[7]===b.sessionId);
  const row=rows[0],file=files.get(raw.fileUrl);
  // Existing receipt has no hash. Re-read exact original logged file; never trust URL/duration alone.
  if(rows.length!==1||!file||file.folder!==folder||file.mime!==b.mimeType||file.input.length!==b.length||hash(file.input)!==b.hash||
   row[2]!==new Date(b.startIso).toISOString()||row[3]!==new Date(b.endIso).toISOString()||context.gdbPMediaSeconds_(Array.from(file.input),file.mime).seconds!==b.durationSeconds)
   throw Error('Canonical saved recording binding mismatch.');
  await check(b);return {state:'saved',result:{saved:true,binding:{...b}}};
 }
 async function upload(b,encoded){
  await check(b);bytes(b,encoded);const previous=await receipt(b);
  if(previous.state==='saved')return previous;
  if(previous.state!=='absent'||previous.retrySafe!==true)throw Error('Uncertain canonical write; receipt reconciliation required.');
  await check(b);attempts++;
  const result=context.gdbPUpload_(workbook,b.pupil,{sessionId:b.sessionId,mimeType:b.mimeType,audioBase64:encoded,startIso:b.startIso,endIso:b.endIso,durationSeconds:b.durationSeconds});
  if(mode==='lost-response')throw Error('fixture lost success response');
  return result;
 }
 return {writer:{receipt,upload},tables,files,context,workbook,
  setMode:m=>{mode=m;},counts:()=>({uploads,attempts}),
  // Deliberately expose source behavior for negative comparison tests; no production path uses this.
  rawUpload:(b,encoded)=>context.gdbPUpload_(workbook,b.pupil,{sessionId:b.sessionId,mimeType:b.mimeType,audioBase64:encoded,startIso:b.startIso,endIso:b.endIso,durationSeconds:b.durationSeconds})};
}
function wav(seconds=1){
 const count=Math.round(seconds*8000),b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);return b;
}
function binding(audio=wav(),extra={}){
 const durationSeconds=(audio.length-44)/16000;
 return {organisation:'GAITA-DE-BOTO',pupil:'child-a',subject:'guardian-a',scope:'google:fixture',sessionId:randomUUID(),action:'uploadRecording',hash:hash(audio),length:audio.length,mimeType:'audio/wav',durationSeconds,startIso:'2026-01-01T00:00:00.000Z',endIso:new Date(Date.parse('2026-01-01T00:00:00Z')+durationSeconds*1000).toISOString(),...extra};
}
module.exports={canonicalFixture,wav,binding};
