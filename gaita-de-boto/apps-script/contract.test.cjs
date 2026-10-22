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
  base64Decode:s=>Array.from(Buffer.from(s,'base64')),
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
 const c=read(part)+(part==='pupil'?'\n'+fs.readFileSync(path.join(root,'pupil/MediaDuration.gs'),'utf8'):''),f=new Function(...Object.keys(globals),c+'\nreturn {'+names.join(',')+'};');
 return f(...Object.values(globals));
}
const teacher=load('teacher',['gdb_setActive','gdb_dashboard','gdb_createPupil','gdb_assignTarget','gdb_review','gdb_detail','gdb_awardBadge','gdb_createTarget','gdb_createBadge','gdb_comment']);
const pupil=load('pupil',['doPost']);
const feedback=load('feedback',['gdb_submitFeedback']);
const post=data=>JSON.parse(pupil.doPost({postData:{contents:JSON.stringify(data)}}).body);
let count=0;
function check(name,fun){fun();count++;process.stdout.write('PASS '+name+'\n');}
check('owner dashboard',()=>assert.equal(teacher.gdb_dashboard().role,'OWNER'));
delete properties.GDB_PUPIL_FRONTEND_URL;
const creationId='01234567-89ab-4cde-8abc-0123456789ab';
const created=teacher.gdb_createPupil('Inactive Fixture','ES',creationId);
check('creation without frontend makes one complete inactive record',()=>{
 assert.equal(created.ok,true);assert.equal(created.id,creationId);
 assert.deepEqual(db.PUPILS[1].slice(2,4),['No','ES']);
 assert.deepEqual(db.PUPILS[1].slice(5),['','','']);assert.equal(db.PUPILS[1].length,8);
 assert.equal('link' in created,false);
});
check('retry does not duplicate',()=>{assert.equal(teacher.gdb_createPupil('Inactive Fixture','ES',creationId).duplicate,true);assert.equal(db.PUPILS.length,2)});
check('changed operation content rejected',()=>assert.throws(()=>teacher.gdb_createPupil('Changed','ES',creationId),/conflict/));
check('same name on another operation rejected',()=>assert.throws(()=>teacher.gdb_createPupil('  INACTIVE   Fixture ','EN','01234567-89ab-4cde-8abc-0123456789ac'),/already exists/));
check('invalid creation rejected without rows',()=>{
 for(const args of [['','ES',creationId],['x','FR',creationId],['x','ES','bad']])assert.throws(()=>teacher.gdb_createPupil(...args));
 assert.equal(db.PUPILS.length,2);
});
check('pending record cannot activate',()=>assert.throws(()=>teacher.gdb_setActive(creationId,true),/not enabled/));
check('inactive pupil denied PATH',()=>assert.equal(post({pupilId:creationId,accessKey:'x'.repeat(64),action:'getPath'}).ok,false));
check('inactive pupil denied feedback',()=>assert.throws(()=>feedback.gdb_submitFeedback({pupilId:creationId,accessKey:'x'.repeat(64)})));
check('failure before write leaves no record',()=>{
 const original=globals.SpreadsheetApp.openById;
 globals.SpreadsheetApp.openById=()=>{throw Error('unavailable')};
 assert.throws(()=>teacher.gdb_createPupil('Before write fixture','EN','01234567-89ab-4cde-8abc-0123456789ae'),/unavailable/);
 globals.SpreadsheetApp.openById=original;assert.equal(db.PUPILS.length,2);
});
check('failure after append retries same complete row',()=>{
 const op='01234567-89ab-4cde-8abc-0123456789ad';
 globals.SpreadsheetApp.flush=()=>{throw Error('lost response')};
 assert.throws(()=>teacher.gdb_createPupil('Lost response fixture','EN',op),/lost response/);
 globals.SpreadsheetApp.flush=()=>{};
 assert.equal(teacher.gdb_createPupil('Lost response fixture','EN',op).duplicate,true);
 assert.equal(db.PUPILS.filter(r=>r[0]===op).length,1);
});
// Existing approved active pupil fixture: creation no longer issues credentials.
const id='4aa5aace-9000-4000-8000-123456789aaa',key='a'.repeat(64),sessionId='4aa5aace-9000-4000-8000-123456789abc';
db.PUPILS.push([id,'Dummy Gaita Student','Yes','ES',new Date(),key,'https://gauchopiper.github.io/pipers-path/gaita-de-boto/?p='+id+'&key='+key,'']);
check('existing active fixture preserved',()=>{teacher.gdb_setActive(id,false);teacher.gdb_setActive(id,true);assert.equal(db.PUPILS[3][5],key)});
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
function wav(seconds){const count=Math.round(seconds*8000),b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);return b;}
const request={pupilId:id,accessKey:key,sessionId,mimeType:'audio/wav',audioBase64:wav(60).toString('base64'),
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
const newBadge=teacher.gdb_createBadge('Gaita test badge','Test only');
check('owner creates badge catalogue entry',()=>assert.ok(db.BADGES.some(r=>r[0]===newBadge.id)));
const newTarget=teacher.gdb_createTarget('Gaita breathing','Testing',newBadge.id);
check('owner creates target catalogue entry',()=>assert.ok(db.TARGETS.some(r=>r[0]===newTarget.id)));
const commentId='22222222-3333-4444-8555-666666666666';
actor='assistant@example.test';
check('assistant teacher comment saved',()=>assert.equal(teacher.gdb_comment(id,'Well done',commentId).reference,'C-'+commentId));
check('assistant comment deduplicated',()=>assert.equal(teacher.gdb_comment(id,'Well done',commentId).duplicate,true));
check('assistant cannot change catalogue',()=>assert.throws(()=>teacher.gdb_createBadge('No','Denied')));
actor='owner@example.test';
check('owner can read comment in pupil detail',()=>assert.equal(teacher.gdb_detail(id).comments[0].text,'Well done'));
for(const part of ['teacher/TeacherDashboard.html','feedback/FeedbackForm.html']){
 const html=fs.readFileSync(path.join(root,part),'utf8');
 const js=html.match(/<script>([\s\S]*?)<\/script>/);
 check(part+' JS syntax',()=>assert.doesNotThrow(()=>new Function(js[1])));
}
delete properties.GDB_QUALIFY_MINUTES;
check('undecided qualification permits storage without credit',()=>{
 const result=post({...request,sessionId:'77777777-2222-4333-8444-555555555555'});
 assert.equal(result.ok,true);assert.equal(result.qualifying,'Pending rule');
 assert.equal(post({pupilId:id,accessKey:key,action:'getPath'}).summary.qualifyingSessions,1);
});
properties.GDB_QUALIFY_MINUTES='5';
for(const seconds of [299,299.9,300,301]) check('five minute boundary '+seconds,()=>{
 const sid='55555555-2222-4333-8444-'+String(Math.round(seconds*10)).padStart(12,'0');
 const result=post({...request,audioBase64:wav(seconds).toString('base64'),sessionId:sid,endIso:new Date(Date.parse(request.startIso)+seconds*1000).toISOString(),durationSeconds:seconds});
 assert.equal(result.ok,true);assert.equal(result.qualifying,seconds>=300?'Yes':'No');
});
process.stdout.write('Mock contract checks passed: '+count+'\n');
