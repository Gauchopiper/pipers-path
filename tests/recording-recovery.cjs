'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
class Sheet {
 constructor(rows=[]){this.rows=rows;}
 getLastRow(){return this.rows.length;}
 getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())};}
 getRange(r,c,n=1,m=1){return {getValues:()=>this.rows.slice(r-1,r-1+n).map(row=>Array.from({length:m},(_,i)=>row[c-1+i]??'')),setValue:v=>{this.rows[r-1][c-1]=v;}};}
 appendRow(row){this.rows.push(row.slice());}
}
function fixture(){
 const sheets={'PUPILS':new Sheet([['id','key'],['p1','key1']]),'PRACTICE LOG':new Sheet([['Pupil ID','Date','Start','End','Minutes','Qualifying','Drive File Link','Session ID']]),'SESSION META':new Sheet([['Drive File Link','Pupil ID','Target ID','Teacher Status','Teacher Note','Reviewed At','Session ID']])};
 const ss={getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=new Sheet()};
 let held=false,files=0,writes=0,mode='ok';
 const reply=o=>({body:JSON.stringify(o),setMimeType(){return this;}});
 const ctx=vm.createContext({ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({body,setMimeType(){return this;}})},SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({waitLock(){if(held)throw Error('locked');held=true;},hasLock:()=>held,releaseLock(){held=false;}})},
 pipersRecoveryWorkbook_:()=>ss,pipersRecoveryValidate_:(s,p,k)=>({ok:p==='p1'&&k==='key1'}),
 pipersLegacyDoPost_:e=>{const d=JSON.parse(e.postData.contents);writes++;files++;if(mode==='partial')throw Error('crashed after Drive creation');sheets['PRACTICE LOG'].appendRow([d.pupilId,new Date(),new Date(),new Date(),1,'No','file-'+files,d.sessionId]);if(mode==='unreadable')return reply({ok:false});return reply({ok:true,fileUrl:'file-'+files});},
 makePostMessagePage_:data=>({html:data})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/reliability/RecordingRecovery.gs'),'utf8'),ctx);
 const id='12345678-1234-4234-8234-123456789012';
 function call(extra={}){const r=ctx.doPost({postData:{contents:JSON.stringify({pupilId:'p1',accessKey:'key1',sessionId:id,audioBase64:'YXVkaW8=',...extra})},parameter:{}});return JSON.parse(r.body);}
 return {call,sheets,id,setMode:x=>mode=x,get counts(){return {files,writes,held};}};
}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('normal upload writes audio once and repairs initial session metadata',()=>{const f=fixture();assert.equal(f.call().saved,true);assert.equal(f.sheets['SESSION META'].rows.length,2);assert.equal(f.counts.files,1);assert.equal(f.counts.held,false);});
test('same session delivered twice creates one audio and one log/meta record',()=>{const f=fixture();f.call();f.call();assert.equal(f.counts.files,1);assert.equal(f.sheets['PRACTICE LOG'].rows.length,2);assert.equal(f.sheets['SESSION META'].rows.length,2);});
test('unreadable legacy response reconciles full log',()=>{const f=fixture();f.setMode('unreadable');assert.equal(f.call().saved,true);f.call();assert.equal(f.counts.files,1);});
test('exact absence permits controlled retry only when no reservation exists',()=>{const f=fixture();const r=f.call({action:'getRecordingState',audioBase64:undefined});assert.equal(r.state,'absent');assert.equal(r.retrySafe,true);assert.equal(f.counts.files,0);});
test('partial Drive success cannot be uploaded twice',()=>{const f=fixture();f.setMode('partial');assert.equal(f.call().ok,false);const r=f.call({action:'getRecordingState'});assert.equal(r.state,'attention');assert.equal(r.retrySafe,false);f.setMode('ok');f.call();assert.equal(f.counts.files,1);});
test('wrong pupil capability cannot read receipt or invoke uploader',()=>{const f=fixture();f.call();assert.equal(f.call({accessKey:'wrong',action:'getRecordingState'}).ok,false);assert.equal(f.call({pupilId:'other'}).ok,false);assert.equal(f.counts.files,1);});
test('organisation-specific workbooks do not share receipts',()=>{const a=fixture(),b=fixture();a.call();assert.equal(b.call({action:'getRecordingState'}).state,'absent');assert.equal(b.counts.files,0);});
test('existing teacher notes and target metadata remain unchanged',()=>{const f=fixture();f.call();const row=f.sheets['SESSION META'].rows[1];row[2]='target';row[3]='REVIEWED';row[4]='Keep going';f.call();assert.equal(row[2],'target');assert.equal(row[4],'Keep going');});
console.log('RESULT '+count+' backend recovery tests passed');
