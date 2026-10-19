/*
 * Gaita de Boto isolated backend contract smoke tests.
 * Run: node gaita-de-boto/apps-script/contract.test.cjs
 * Pure in-memory Google-service doubles. NOT a live deployment certification.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname;
const read=part=>fs.readFileSync(path.join(root,part,'Code.gs'),'utf8');
const headers={
 'PUPILS':['Pupil ID','Display Name','Active','Preferred Language','Date Joined','Access Key','Personal Link','Short Code'],
 'PRACTICE LOG':['Pupil ID','Date','Start Time','End Time','Duration (min)','Qualifying','Drive File Link','Session ID'],
 'SESSION META':['Drive File Link','Pupil ID','Target ID','Teacher Status','Teacher Note','Reviewed At','Session ID'],
 'TARGETS':['Target ID','Title','Instructions','Resource Link','Badge ID','Completion Mode','Auto Rule Type','Auto Rule Value','Active','Display Order'],
 'PUPIL TARGETS':['Pupil ID','Target ID','Status','Assigned Date','Ready for Review Date','Achieved Date','Teacher Note'],
 'BADGES':['Badge ID','Badge Name','Description','Image Link','Active','Display Order','Image File ID','Drive Image Link'],
 'PUPIL BADGES':['Pupil ID','Badge ID','Date Awarded','Awarded By','Note','Source Target ID'],
 'PUPIL FEEDBACK':['Reference','Organisation','Role','Local user ID','Created UTC','Category','Description','Explanation','Page','Version']
};
const db=Object.fromEntries(Object.entries(headers).map(([name,head])=>[name,[head.slice()]]));
let actor='owner@example.test',uuid=0,createdAudio=0;
const properties={
 GDB_DATA_SHEET_ID:'NEW_GAITA_CANONICAL_TEST',
 GDB_PUPIL_DATA_SHEET_ID:'NEW_GAITA_CANONICAL_TEST',
 GDB_FEEDBACK_DATA_SHEET_ID:'NEW_GAITA_CANONICAL_TEST',
 GDB_OWNER_EMAIL:'owner@example.test',GDB_ASSISTANT_EMAILS:'assistant@example.test',
 GDB_PUPIL_FRONTEND_URL:'https://gauchopiper.github.io/pipers-path/gaita-de-boto/',
 GDB_PUPIL_RECORDINGS_FOLDER_ID:'NEW_GAITA_RECORDINGS_TEST',
 GDB_QUALIFY_MINUTES:'1'
};
function sheet(name){
 if(!db[name])return null;
 return {
  getLastRow:()=>db[name].length,
  getRange:(r,c,n=1,m=1)=>({
   getValues:()=>db[name].slice(r-1,r-1+n).map(row=>Array.from({length:m},(_,i)=>row[c-1+i]??'')),
   setValue:value=>{db[name][r-1][c-1]=value;},
   setValues:rows=>rows.forEach((row,i)=>row.forEach((v,j)=>{db[name][r-1+i][c-1+j]=v;}))
  }),
  getDataRange:()=>({getValues:()=>db[name].map(r=>r.slice())}),
  appendRow:row=>db[name].push(row.slice())
 };
}
const globals={
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]})},
 Session:{getActiveUser:()=>({getEmail:()=>actor})},
 SpreadsheetApp:{
  openById:id=>{assert.equal(id,'NEW_GAITA_CANONICAL_TEST','cross-organisation reference');return{
   getSheetByName:sheet,insertSheet:name=>{db[name]=[];return sheet(name)}
  }},
  flush:()=>{}
 },
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
 Utilities:{
  getUuid:()=>{uuid++;return'00000000-0000-4000-8000-'+String(uuid).padStart(12,'0')},
  formatDate:date=>new Date(date).toISOString().slice(0,10),
  base64Decode:s=>Array.from({length:Math.floor(s.length*3/4)},()=>8),
  newBlob:(bytes,mime,name)=>({bytes,mime,name})
 },
 DriveApp:{
  getFolderById:id=>{
   assert.equal(id,'NEW_GAITA_RECORDINGS_TEST');
   return{createFile:()=>{createdAudio++;return{getUrl:()=>'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/view'}}}
  }
 },
 ContentService:{MimeType:{JSON:'json',TEXT:'text'},createTextOutput:body=>({body,setMimeType(){return this}})},
 HtmlService:{createHtmlOutputFromFile:()=>({setTitle(){return this},addMetaTag(){return this}})}
};
function load(part,names){
 const c=read(part),f=new Function(...Object.keys(globals),c+'\nreturn {'+names.join(',')+'};');
 return f(...Object.values(globals));
}
const teacher=load('teacher',['gdb_dashboard','gdb_createPupil','gdb_assignTarget','gdb_review','gdb_detail','gdb_awardBadge']);
const pupil=load('pupil',['doPost']);
const feedback=load('feedback',['gdb_submitFeedback']);
const post=data=>JSON.parse(pupil.doPost({postData:{contents:JSON.stringify(data)}}).body);
let count=0;
function check(name,fun){fun();count++;process.stdout.write('PASS '+name+'\n');}
check('owner dashboard',()=>assert.equal(teacher.gdb_dashboard().role,'OWNER'));
const created=teacher.gdb_createPupil('Dummy Gaita Student','ES');
check('new pupil has personal link',()=>assert.ok(created.link.includes('/gaita-de-boto/?')));
const id=created.id,key=db.PUPILS[1][5],sessionId='4aa5aace-9000-4000-8000-123456789abc';
actor='assistant@example.test';
check('assistant sees no pupil link',()=>assert.equal(teacher.gdb_dashboard().pupils[0].link,''));
check('assistant cannot create pupils',()=>assert.throws(()=>teacher.gdb_createPupil('Unauthorized','ES')));
actor='outsider@example.test';
check('unlisted Google actor rejected',()=>assert.throws(()=>teacher.gdb_dashboard()));
actor='';
check('blank Google identity rejected',()=>assert.throws(()=>teacher.gdb_dashboard()));
actor='owner@example.test';
check('valid pupil PATH',()=>assert.equal(post({pupilId:id,accessKey:key,action:'getPath'}).summary.totalSessions,0));
check('invalid pupil key rejected',()=>assert.equal(post({pupilId:id,accessKey:'wrong',action:'getPath'}).ok,false));
const request={pupilId:id,accessKey:key,sessionId,mimeType:'audio/webm',audioBase64:'A'.repeat(100),
 startIso:'2026-10-19T10:00:00Z',endIso:'2026-10-19T10:01:00Z',durationSeconds:60};
const saved=post(request);
check('recording accepted',()=>assert.equal(saved.ok,true));
check('matching log and meta',()=>assert.equal(db['PRACTICE LOG'][1][7],db['SESSION META'][1][6]));
check('one audio file on replay',()=>{assert.equal(post(request).duplicate,true);assert.equal(createdAudio,1)});
check('exact session confirmation',()=>assert.equal(post({pupilId:id,accessKey:key,action:'getRecordingState',sessionId}).saved,true));
check('PATH duration',()=>assert.equal(post({pupilId:id,accessKey:key,action:'getPath'}).summary.totalMinutes,1));
check('GROUP response',()=>assert.equal(post({pupilId:id,accessKey:key,action:'getGroup'}).ok,true));
db.TARGETS.push(['target-1','Gaita tone','','','','','','','Yes',1]);
check('owner target assignment',()=>{teacher.gdb_assignTarget(id,'target-1');assert.equal(db['PUPIL TARGETS'].length,2)});
check('target tagging',()=>{const r=post({pupilId:id,accessKey:key,action:'setSessionTarget',driveFileLink:saved.fileUrl,targetId:'target-1'});assert.equal(r.ok,true);assert.equal(db['SESSION META'][1][2],'target-1')});
check('teacher reviews session',()=>{teacher.gdb_review(id,sessionId,'REVIEWED','Good');assert.equal(db['SESSION META'][1][3],'REVIEWED')});
const operationId='11111111-2222-4333-8444-555555555555';
const fb={pupilId:id,accessKey:key,operationId,category:'Suggestion',description:'Pupil feedback',explanation:'',page:'path'};
check('feedback inserted once',()=>assert.equal(feedback.gdb_submitFeedback(fb).reference,'F-'+operationId));
check('same operation deduplicated',()=>{assert.equal(feedback.gdb_submitFeedback(fb).duplicate,true);assert.equal(db['PUPIL FEEDBACK'].length,2)});
check('different content same ID rejected',()=>assert.throws(()=>feedback.gdb_submitFeedback({...fb,description:'changed'})));
for(const part of ['teacher/TeacherDashboard.html','feedback/FeedbackForm.html']){
 const html=fs.readFileSync(path.join(root,part),'utf8');
 const js=html.match(/<script>([\s\S]*?)<\/script>/);
 check(part+' JS syntax',()=>assert.doesNotThrow(()=>new Function(js[1])));
}
process.stdout.write('Mock contract checks passed: '+count+'\n');
