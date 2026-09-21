'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const approved='1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ';

class Tab {
  constructor(name,rows=[]){this.name=name;this.rows=rows.map(row=>[...row]);}
  getName(){return this.name;}
  getLastRow(){return this.rows.length;}
  getDataRange(){return {getValues:()=>this.rows.map(row=>[...row])};}
  clearContents(){this.rows=[];return this;}
  setFrozenRows(){}
  autoResizeColumns(){}
  getRange(r,c,n,m){return {
    getValues:()=>this.rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+m)),
    setValues:values=>values.forEach((row,i)=>row.forEach((value,j)=>{
      while(this.rows.length<r+i)this.rows.push([]);this.rows[r-1+i][c-1+j]=value;
    })),setFontWeight:()=>{}
  };}
}
class Book {
  constructor(id,name,tabs){this.id=id;this.name=name;this.tabs=tabs;this.timeZone='Europe/Madrid';}
  getId(){return this.id;} getName(){return this.name;} getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id+'/edit';}
  getSpreadsheetTimeZone(){return this.timeZone;} setSpreadsheetTimeZone(value){this.timeZone=value;}
  getSheetByName(name){return this.tabs[name]||null;}
  insertSheet(name){return this.tabs[name]=new Tab(name);}
  getSheets(){return Object.values(this.tabs);}
  deleteSheet(tab){delete this.tabs[tab.getName()];}
}
const privateTabs={
  'ORG CONFIG':new Tab('ORG CONFIG',[['Key','Value'],['Org ID','org-test'],['Organisation Name','Test School'],['Profile','PIPE_SCHOOL'],['Time Zone','Europe/Madrid'],['Private setting','do-not-copy']]),
  TEACHERS:new Tab('TEACHERS',[['Teacher ID','Email','Role','Active'],['T001','owner@example.test','OWNER',true],['T002','assistant@example.test','TEACHER',true],['T003','inactive@example.test','TEACHER',false]]),
  PUPILS:new Tab('PUPILS',[['Pupil ID','Display Name','Active','Preferred Language','Access Key','Personal Link'],['P001','Piper One',true,'EN','pupil-secret','https://private/pupil'],['P002','Inactive Piper',false,'ES','inactive-secret','https://private/inactive']]),
  'PRACTICE LOG':new Tab('PRACTICE LOG',[['Pupil ID','Date','Duration (min)','Qualifying','Session ID','Drive File Link','End Time'],['P001','2026-09-20',6,true,'session-secret','https://drive.google.com/private','2026-09-20T18:00:00.000Z']]),
  'FEEDBACK TEST PUPILS':new Tab('FEEDBACK TEST PUPILS',[['Pupil ID','Feedback key'],['P001','feedback-secret']]),
  'TEST FEEDBACK':new Tab('TEST FEEDBACK',[['Reference','Description'],['F-secret','private feedback description']])
};
const assistantTabs={Sheet1:new Tab('Sheet1',[['old','data']])};
const privateBook=new Book('private','Piper’s Path — TEST Data',privateTabs);
const assistantBook=new Book('assistant','Piper’s Path — ASSISTANT DASHBOARD TEST',assistantTabs);
const props={TEST_READY:'1',TEST_OWNER_EMAIL:'owner@example.test',TEST_SHEET_ID:'private',TEST_ASSISTANT_SHEET_ID:'assistant',TEST_RECORDINGS_ID:'recordings',ASSISTANT_EMAIL_HMAC_SECRET:'a-private-hmac-secret',TEST_ASSISTANT_SYNC_STATUS:'PENDING'};
let active='owner@example.test',effective='owner@example.test',locked=false;
const formattedDates=[];
const user=email=>({getEmail:()=>email});
const assistantFile={viewers:[user('inactive@example.test')],getViewers(){return [...this.viewers]},addViewer(email){if(!this.viewers.some(v=>v.getEmail()===email))this.viewers.push(user(email))},removeViewer(email){this.viewers=this.viewers.filter(v=>v.getEmail()!==email)}};
const recordings={viewers:[user('assistant@example.test'),user('inactive@example.test')],getViewers(){return [...this.viewers]},removeViewer(email){this.viewers=this.viewers.filter(v=>v.getEmail()!==email)}};
const context={console,Date,Map,Set,Object,JSON,Number,String,Math,Error,
  Session:{getActiveUser:()=>user(active),getEffectiveUser:()=>user(effective)},
  ScriptApp:{getScriptId:()=>approved},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key],setProperty:(key,value)=>{props[key]=value;}})},
  SpreadsheetApp:{openById:id=>id==='private'?privateBook:id==='assistant'?assistantBook:(()=>{throw Error('unknown book')})(),flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true},releaseLock(){locked=false}})},
  DriveApp:{getFileById:id=>{assert.equal(id,'assistant');return assistantFile},getFolderById:id=>{assert.equal(id,'recordings');return recordings}},
  Utilities:{formatDate:(value,timeZone,format)=>{formattedDates.push({timeZone,format});return value.toISOString().slice(0,10);},computeHmacSha256Signature:(value,key)=>crypto.createHmac('sha256',key).update(value).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url')},
  HtmlService:{createHtmlOutput:html=>html}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('tools/apps-script-probe/Code.js','utf8')+'\n'+fs.readFileSync('tools/apps-script-probe/AssistantDashboard.js','utf8'),context);

context.syncAssistantDashboardData();
assert.equal(props.TEST_ASSISTANT_SYNC_STATUS,'OK');
assert.match(props.TEST_ASSISTANT_LAST_SYNC_UTC,/^\d{4}-\d{2}-\d{2}T/);
assert.deepEqual(Object.keys(assistantTabs).sort(),['DASHBOARD CONFIG','DASHBOARD PRACTICE SUMMARY','DASHBOARD PUPILS','DASHBOARD TEACHERS'].sort());
assert.deepEqual(assistantTabs['DASHBOARD CONFIG'].rows,[['Key','Value'],['Organisation Name','Test School'],['Profile','PIPE_SCHOOL'],['Time Zone','Europe/Madrid']]);
assert.deepEqual(assistantTabs['DASHBOARD PUPILS'].rows,[['Pupil ID','Display Name','Active'],['P001','Piper One',true]]);
assert.deepEqual(assistantTabs['DASHBOARD PRACTICE SUMMARY'].rows,[['Pupil ID','Session Count','Total Minutes','Last Practice Date'],['P001',1,6,'2026-09-20']]);
const teacherData=assistantTabs['DASHBOARD TEACHERS'].rows;
assert.equal(teacherData.length,3);assert.notEqual(teacherData[2][1],'assistant@example.test');assert.match(teacherData[2][1],/^[A-Za-z0-9_-]{40,}$/);
const snapshot=JSON.stringify(assistantTabs);
for(const forbidden of ['owner@example.test','assistant@example.test','inactive@example.test','pupil-secret','feedback-secret','private feedback description','session-secret','drive.google.com','2026-09-20T18:00:00.000Z'])assert(!snapshot.includes(forbidden),forbidden);
assert(assistantFile.viewers.some(v=>v.getEmail()==='assistant@example.test'));
assert(!assistantFile.viewers.some(v=>v.getEmail()==='inactive@example.test'));
assert(!recordings.viewers.some(v=>v.getEmail()==='inactive@example.test'));

active=effective='assistant@example.test';
const dashboard=context.teacherDiagnostic_();assert.equal(dashboard.ok,true);assert.equal(dashboard.summary.sessions,1);assert.equal(dashboard.pupils.length,1);
assert.equal(dashboard.role,'TEACHER');assert.equal(dashboard.organisationDataUrl,undefined);
const assistantHtml=context.doGet();assert(assistantHtml.includes('ASSISTANT TEACHER'));assert(!assistantHtml.includes('Open organisation data'));assert(!assistantHtml.includes(privateBook.getUrl()));
assistantTabs['DASHBOARD PRACTICE SUMMARY'].rows[1][3]=new Date('2026-09-20T12:00:00.000Z');
const dateDashboard=context.teacherDiagnostic_();assert.equal(dateDashboard.summary.entries[0].latest,'2026-09-20');
assert.deepEqual(formattedDates.at(-1),{timeZone:'Europe/Madrid',format:'yyyy-MM-dd'});

active=effective='owner@example.test';
const ownerDashboard=context.teacherDiagnostic_();assert.equal(ownerDashboard.role,'OWNER');assert.equal(ownerDashboard.organisationDataUrl,privateBook.getUrl());
const ownerHtml=context.doGet();assert(ownerHtml.includes('OWNER'));assert(ownerHtml.includes('Open organisation data'));assert(ownerHtml.includes(privateBook.getUrl()));
privateTabs.PUPILS.rows.push(['P003','Piper Three',true,'EN','second-secret','https://private/second']);
privateTabs['PRACTICE LOG'].rows.push(['P003','2026-09-21',5,true,'second-session','https://drive.google.com/second','2026-09-21T10:00:00.000Z']);
context.syncAssistantDashboardData();
assert(assistantTabs['DASHBOARD PUPILS'].rows.some(row=>row[0]==='P003'));
assert(assistantTabs['DASHBOARD PRACTICE SUMMARY'].rows.some(row=>row[0]==='P003'&&row[1]===1&&row[2]===5));

privateTabs.TEACHERS.rows[2][3]=false;
context.syncAssistantDashboardData();
assert(!assistantFile.viewers.some(v=>v.getEmail()==='assistant@example.test'));
assert(!recordings.viewers.some(v=>v.getEmail()==='assistant@example.test'));
active=effective='assistant@example.test';assert.equal(context.teacherDiagnostic_().ok,false);
console.log('PASS HMAC authorisation, exact sanitised schema, prohibited-data exclusion, pupil/practice propagation, sharing revocation and inactive-teacher rejection.');
