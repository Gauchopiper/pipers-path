'use strict';
// Runs the actual inspected feedback handlers after the additive installer.
// Inputs are private source exports supplied locally; none are copied into git.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pupilDir=process.env.PIPERS_TEST_PUPIL_FEEDBACK;
const teacherDir=process.env.PIPERS_TEST_TEACHER_FEEDBACK;
if(!pupilDir||!teacherDir)throw Error('Set PIPERS_TEST_PUPIL_FEEDBACK and PIPERS_TEST_TEACHER_FEEDBACK to locally patched exports.');
class Sheet{
 constructor(rows=[]){this.rows=rows;}
 getLastRow(){return this.rows.length;} getLastColumn(){return this.rows[0]?.length||0;}
 getDataRange(){return {getValues:()=>this.rows.map(r=>r.slice())};}
 getRange(r,c,n=1,m=1){return {getValues:()=>this.rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),setValues:v=>v.forEach((row,i)=>row.forEach((x,j)=>this.rows[r-1+i][c-1+j]=x))};}
 appendRow(row){this.rows.push(row.slice());}setFrozenRows(){}
}
function fixture(type,org='org-a'){
 const sheets={'PUPILS':new Sheet([['ID'],['p1','Pupil','yes','','','key1','']]),'FEEDBACK TEST PUPILS':new Sheet([['Pupil ID','Feedback key'],['p1','key1']]),'TEACHERS':new Sheet([['Teacher ID','Email','Role','Active'],['owner-1','owner@example.test','OWNER','yes'],['assistant-1','assistant@example.test','TEACHER','yes'],['disabled-1','disabled@example.test','TEACHER','no']])};
 const book={getSheetByName:n=>sheets[n],insertSheet:n=>sheets[n]=new Sheet(),getSheets:()=>Object.values(sheets),getId:()=>org};
 const props={FEEDBACK_LOCAL_SHEET_ID:org,FEEDBACK_CENTRAL_SHEET_ID:'central',FEEDBACK_ORG_ID:org,TEST_SHEET_ID:org,FEEDBACK_SECRET:'signed-secret',TEST_OWNER_EMAIL:'owner@example.test',ASSISTANT_EMAIL_HMAC_SECRET:'email-secret'};
 const token=email=>crypto.createHmac('sha256','email-secret').update(email).digest('base64url');
 const utils={getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(text,secret)=>Array.from(crypto.createHmac('sha256',secret).update(text).digest()),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:x=>Buffer.from(x,'base64url'),newBlob:x=>({getDataAsString:()=>Buffer.from(x).toString()})};
 let locked=false,central=0;const opened=[];
 const ctx=vm.createContext({assertTestProject_(){},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},SpreadsheetApp:{openById:id=>{opened.push(id);if(id!==org)throw Error('unexpected direct access');return book;},flush(){}},Session:{getEffectiveUser:()=>({getEmail:()=>props.TEST_OWNER_EMAIL})},Utilities:utils,LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('locked');locked=true;},releaseLock(){locked=false;}})},headerIndexes_:(rows,headers)=>Object.fromEntries(headers.map(h=>[h,rows[0].indexOf(h)])),assistantEmailToken_:email=>token(email)});
 const source=fs.readFileSync(type==='pupil'?pupilDir+'/Code.js':teacherDir+'/Feedback.js','utf8');vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync((type==='pupil'?pupilDir:teacherDir)+'/FeedbackOutbox.gs','utf8'),ctx);
 ctx.deliverFeedback_=()=>{central++;};
 const makeTicket=(id,email,expires=Date.now()+100000,claimOrg=org)=>{const payload=utils.base64EncodeWebSafe(JSON.stringify({teacherId:id,emailToken:token(email),org:claimOrg,expires}));return payload+'.'+utils.base64EncodeWebSafe(utils.computeHmacSha256Signature(payload,'signed-secret'));};
 const input={pupilId:'p1',accessKey:'key1',requestId:crypto.randomUUID(),description:'Test comment',explanation:'Test details',category:'suggestion',page:'record',browser:'Chrome'};
 return {ctx,sheets,opened,input,makeTicket,call:x=>(type==='pupil'?ctx.submitPupilFeedback:ctx.submitFeedback)(x||input),rows:()=>sheets[type==='pupil'?'PUPIL FEEDBACK':'TEST FEEDBACK']?.rows||[]};
}
let count=0;function test(n,fn){fn();count++;console.log('PASS '+n);}
for(const type of ['pupil','teacher']){
 test(type+': same operation saved once and changed text under same ID rejected',()=>{const f=fixture(type);if(type==='teacher')f.input.ticket=f.makeTicket('owner-1','owner@example.test');const a=f.call();assert.equal(a.ok,true);const b=f.call();assert.equal(a.reference,b.reference);assert.equal(f.rows().length,2);assert.throws(()=>f.call({...f.input,description:'Changed'}),/content conflict/);});
 test(type+': invalid actor is rejected before queue scope or saved receipt is exposed',()=>{const f=fixture(type);const bad=type==='pupil'?{...f.input,accessKey:'wrong'}:{...f.input,ticket:f.makeTicket('disabled-1','disabled@example.test')};assert.throws(()=>f.call(bad));assert.throws(()=>f.ctx.getFeedbackOutboxContext(bad));assert.equal(f.rows().length,0);});
}
test('Owner and Assistant Teacher feedback keep independent scopes and do not open central workbook',()=>{const f=fixture('teacher');const owner={...f.input,ticket:f.makeTicket('owner-1','owner@example.test')};const assistant={...f.input,requestId:crypto.randomUUID(),ticket:f.makeTicket('assistant-1','assistant@example.test')};assert.equal(f.call(owner).ok,true);assert.equal(f.call(assistant).ok,true);const a=f.ctx.getFeedbackOutboxContext(owner),b=f.ctx.getFeedbackOutboxContext(assistant);assert.notEqual(a.scope,b.scope);assert.equal(f.rows().length,3);assert.ok(f.opened.every(id=>id==='org-a'));assert.throws(()=>f.call({...assistant,requestId:owner.requestId}),/Reference conflict/);});
test('expired teacher ticket does not authorize retry; renewed ticket uses original operation ID',()=>{const f=fixture('teacher');const ticket=f.makeTicket('assistant-1','assistant@example.test');const saved=f.call({...f.input,ticket});assert.throws(()=>f.call({...f.input,ticket:f.makeTicket('assistant-1','assistant@example.test',Date.now()-1000)}),/expired/);assert.equal(f.call({...f.input,ticket}).reference,saved.reference);assert.equal(f.rows().length,2);});
test('cross-organisation teacher claim is denied',()=>{const f=fixture('teacher','org-b');assert.throws(()=>f.call({...f.input,ticket:f.makeTicket('owner-1','owner@example.test',Date.now()+10000,'org-a')}));assert.equal(f.rows().length,0);});
console.log('RESULT '+count+' actual feedback-handler tests passed');
