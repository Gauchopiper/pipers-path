/**
 * Gaita de Boto — independent Pupil Feedback service (STAGING ONLY).
 * No central feedback destination. Owner-private canonical workbook ONLY.
 * Deploy as owner to a NEW Apps Script project after external tests.
 */
const GDB_F_HEADERS=['Reference','Organisation','Role','Local user ID','Created UTC',
  'Category','Description','Explanation','Page','Version'];
function gdbFConfig_(key){
 const value=String(PropertiesService.getScriptProperties().getProperty(key)||'').trim();
 if(!value)throw Error('Gaita feedback configuration incomplete.');
 return value;
}
function gdbFTable_(ss,name,header){
 const sh=ss.getSheetByName(name);
 if(!sh)throw Error('Gaita feedback table missing.');
 if(JSON.stringify(sh.getRange(1,1,1,header.length).getValues()[0])!==JSON.stringify(header))
  throw Error('Feedback table schema mismatch.');
 return sh;
}
function gdbFValidate_(ss,pupilId,accessKey){
 if(!pupilId||!accessKey||String(accessKey).length<40)throw Error('Pupil link invalid.');
 const head=['Pupil ID','Display Name','Active','Preferred Language','Date Joined','Access Key','Personal Link','Short Code'];
 const sh=gdbFTable_(ss,'PUPILS',head),n=sh.getLastRow();
 const rows=n<2?[]:sh.getRange(2,1,n-1,8).getValues();
 if(!rows.some(r=>String(r[0])===pupilId&&String(r[5])===accessKey&&String(r[2]).toLowerCase()==='yes'))
  throw Error('Pupil link invalid.');
}
function gdbFClean_(value,max){
 let t=String(value||'').trim().slice(0,max);
 if(/^[=+\-@]/.test(t))t="'"+t;
 return t;
}
function doGet(){
 return HtmlService.createHtmlOutputFromFile('FeedbackForm')
  .setTitle("Piper's Path - Gaita de Boto feedback")
  .addMetaTag('viewport','width=device-width,initial-scale=1');
}
function gdb_submitFeedback(data){
 if(!data||typeof data!=='object')throw Error('Invalid feedback request.');
 const id=String(data.operationId||'').toLowerCase();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
  throw Error('Invalid submission ID.');
 const pupilId=String(data.pupilId||''),key=String(data.accessKey||'');
 const category=gdbFClean_(data.category,60);
 const description=gdbFClean_(data.description,3000);
 const explanation=gdbFClean_(data.explanation,3000);
 const page=gdbFClean_(data.page,40);
 if(!description)throw Error('Write a comment before sending.');
 const ref='F-'+id;
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
  const ss=SpreadsheetApp.openById(gdbFConfig_('GDB_FEEDBACK_DATA_SHEET_ID'));
  gdbFValidate_(ss,pupilId,key);
  const sh=gdbFTable_(ss,'PUPIL FEEDBACK',GDB_F_HEADERS);
  const existing=sh.getLastRow()<2?[]:sh.getRange(2,1,sh.getLastRow()-1,10).getValues();
  const found=existing.find(r=>String(r[0])===ref);
  if(found){
   const same=String(found[3])===pupilId&&String(found[5])===category&&
    String(found[6])===description&&String(found[7])===explanation&&String(found[8])===page;
   if(!same)throw Error('Submission ID conflict; no duplicate stored.');
   return {ok:true,reference:ref,duplicate:true};
  }
  sh.appendRow([ref,'GAITA-DE-BOTO','PUPIL',pupilId,new Date(),category,
    description,explanation,page,'GDB-v1']);
  SpreadsheetApp.flush();
  return {ok:true,reference:ref};
 }finally{lock.releaseLock();}
}
