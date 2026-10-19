/**
 * Gaita de Boto — isolated PUPIL backend candidate; NOT DEPLOYED.
 * Deploy to a brand-new Apps Script project as owner, with the NEW Gaita
 * workbook/folder configured in Script Properties. Never copy .clasp.json.
 * Separate backend must be the ONLY audio writer for this organisation.
 */
const GDB_PUPIL_SCHEMAS={
  PUPILS:['Pupil ID','Display Name','Active','Preferred Language','Date Joined','Access Key','Personal Link','Short Code'],
  'PRACTICE LOG':['Pupil ID','Date','Start Time','End Time','Duration (min)','Qualifying','Drive File Link','Session ID'],
  'SESSION META':['Drive File Link','Pupil ID','Target ID','Teacher Status','Teacher Note','Reviewed At','Session ID'],
  TARGETS:['Target ID','Title','Instructions','Resource Link','Badge ID','Completion Mode','Auto Rule Type','Auto Rule Value','Active','Display Order'],
  'PUPIL TARGETS':['Pupil ID','Target ID','Status','Assigned Date','Ready for Review Date','Achieved Date','Teacher Note'],
  BADGES:['Badge ID','Badge Name','Description','Image Link','Active','Display Order','Image File ID','Drive Image Link'],
  'PUPIL BADGES':['Pupil ID','Badge ID','Date Awarded','Awarded By','Note','Source Target ID']
};
function gdbPProp_(name){
 const v=String(PropertiesService.getScriptProperties().getProperty(name)||'').trim();
 if(!v)throw Error('Required Gaita configuration missing.');
 return v;
}
function gdbPBook_(){return SpreadsheetApp.openById(gdbPProp_('GDB_PUPIL_DATA_SHEET_ID'));}
function gdbPTab_(ss,name){
 const sh=ss.getSheetByName(name),headers=GDB_PUPIL_SCHEMAS[name];
 if(!sh||!headers)throw Error('Required Gaita organisation tab missing.');
 if(JSON.stringify(sh.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))
  throw Error('Gaita data schema mismatch.');
 return sh;
}
function gdbPRows_(ss,name){
 const sh=gdbPTab_(ss,name),n=sh.getLastRow();
 return n<2?[]:sh.getRange(2,1,n-1,GDB_PUPIL_SCHEMAS[name].length).getValues();
}
function gdbPRequirePupil_(ss,pupilId,accessKey){
 if(!pupilId||!accessKey||String(accessKey).length<40)throw Error('Pupil link is not authorised.');
 const row=gdbPRows_(ss,'PUPILS').find(r=>String(r[0])===String(pupilId));
 if(!row||String(row[2]).toLowerCase()!=='yes'||String(row[5])!==String(accessKey))
  throw Error('Pupil link is not authorised.');
 return row;
}
function gdbPReceipts_(ss){
 const name='RECORDING RECEIPTS',h=['Session ID','Pupil ID','Started At','State'];
 let sh=ss.getSheetByName(name);
 if(!sh){sh=ss.insertSheet(name);sh.appendRow(h);SpreadsheetApp.flush();}
 if(JSON.stringify(sh.getRange(1,1,1,4).getValues()[0])!==JSON.stringify(h))
  throw Error('Receipt schema mismatch.');
 return sh;
}
function gdbPSession_(id){
 const s=String(id||'').toLowerCase().trim();
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s))
  throw Error('Session reference invalid.');
 return s;
}
function gdbPEnsureMeta_(ss,row){
 const sh=gdbPTab_(ss,'SESSION META'),u=String(row[6]),id=String(row[0]),sid=String(row[7]);
 const rows=sh.getDataRange().getValues();
 const ix=rows.findIndex((r,i)=>i>0&&String(r[0])===u&&String(r[1])===id);
 if(ix<0)sh.appendRow([u,id,'','','','',sid]);
 else if(!rows[ix][6])sh.getRange(ix+1,7).setValue(sid);
 SpreadsheetApp.flush();
}
function gdbPRecordingState_(ss,id,sid){
 const logs=gdbPRows_(ss,'PRACTICE LOG').filter(r=>String(r[0])===id&&String(r[7]).toLowerCase()===sid);
 const base={ok:true,protocol:'pipers-path-recording-recovery-v1',sessionId:sid,saved:false,retrySafe:false};
 if(logs.length>1)return Object.assign(base,{state:'attention'});
 if(logs.length===1){
  gdbPEnsureMeta_(ss,logs[0]);
  return Object.assign(base,{state:'saved',saved:true,fileUrl:String(logs[0][6]),qualifying:String(logs[0][5])});
 }
 const rec=gdbPReceipts_(ss);
 const journal=rec.getLastRow()<2?[]:rec.getRange(2,1,rec.getLastRow()-1,4).getValues();
 const started=journal.some(r=>String(r[0])===sid&&String(r[1])===id);
 return Object.assign(base,{state:started?'attention':'absent',retrySafe:!started});
}
function doGet(){
 return ContentService.createTextOutput("Piper's Path — Gaita de Boto pupil backend (no public data).")
  .setMimeType(ContentService.MimeType.TEXT);
}
function doPost(e){
 try{
  if(!e||!e.postData||!e.postData.contents)throw Error('Request body missing.');
  if(e.postData.contents.length>15*1024*1024)throw Error('Recording too large.');
  const d=JSON.parse(e.postData.contents);
  const id=String(d.pupilId||''),key=String(d.accessKey||'');
  const ss=gdbPBook_();gdbPRequirePupil_(ss,id,key);
  let out;
  switch(String(d.action||'')){
   case 'getPath': out=gdbPPath_(ss,id);break;
   case 'getGroup': out=gdbPGroup_(ss);break;
   case 'getRecordingState': {
    const lock=LockService.getScriptLock();lock.waitLock(15000);
    try{out=gdbPRecordingState_(ss,id,gdbPSession_(d.sessionId));}
    finally{lock.releaseLock();}
    break;
   }
   case 'setSessionTarget':out=gdbPSetTarget_(ss,id,d);break;
   default:
    if(!d.audioBase64)throw Error('Unknown action.');
    out=gdbPUpload_(ss,id,d);
  }
  return gdbPReply_(out);
 }catch(err){return gdbPReply_({ok:false,error:String(err.message||'Request failed.').replace(/(?:[A-Za-z0-9_-]{30,})/g,'[redacted]')});}
}
function gdbPReply_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function gdbPPath_(ss,id){
 const l=gdbPRows_(ss,'PRACTICE LOG').filter(r=>String(r[0])===id);
 const m=gdbPRows_(ss,'SESSION META');
 const mm={};for(const r of m)mm[String(r[0])+'::'+String(r[1])]=r;
 const sessions=l.map(r=>{
  const meta=mm[String(r[6])+'::'+id]||[];
  return {sessionId:String(r[7]),date:String(r[1]),startTime:String(r[2]),
   endTime:String(r[3]),durationMinutes:Number(r[4])||0,
   qualifying:String(r[5]).toLowerCase()==='yes',
   driveFileLink:String(r[6]),targetId:String(meta[2]||'')};
 }).reverse();
 const targets=gdbPRows_(ss,'TARGETS'),pt=gdbPRows_(ss,'PUPIL TARGETS').filter(r=>String(r[0])===id);
 const targetMap={};for(const r of targets)targetMap[String(r[0])]=r;
 const badgeMap={};for(const r of gdbPRows_(ss,'BADGES'))badgeMap[String(r[0])]=r;
 const awards=gdbPRows_(ss,'PUPIL BADGES').filter(r=>String(r[0])===id).map(r=>{
  const b=badgeMap[String(r[1])]||[];
  return {badgeId:String(r[1]),badgeName:String(b[1]||''),description:String(b[2]||''),imageLink:String(b[3]||'')};
 });
 const mins=l.reduce((a,r)=>a+(Number(r[4])||0),0);
 const qualified=l.filter(r=>String(r[5]).toLowerCase()==='yes');
 const credited=qualified.reduce((a,r)=>a+(Number(r[4])||0),0);
 return {ok:true,summary:{totalSessions:l.length,qualifyingSessions:qualified.length,
  totalMinutes:mins,creditedQualifyingMinutes:credited},
  sessions,targets:pt.map(r=>{const t=targetMap[String(r[1])]||[];
   return {targetId:String(r[1]),title:String(t[1]||''),status:String(r[2]),badgeId:String(t[4]||'')};
  }),badges:awards,creditedPracticeByDate:[]};
}
function gdbPGroup_(ss){
 const today=Utilities.formatDate(new Date(),'Europe/Madrid','yyyy-MM-dd');
 const ids=new Set();
 for(const r of gdbPRows_(ss,'PRACTICE LOG')){
  const date=r[1] instanceof Date?Utilities.formatDate(r[1],'Europe/Madrid','yyyy-MM-dd'):String(r[1]).slice(0,10);
  if(date===today&&String(r[5]).toLowerCase()==='yes')ids.add(String(r[0]));
 }
 const count=ids.size;
 // Generic group metric, no Scottish instrument assumptions.
 return {ok:true,pipersToday:count,bagpipeParts:Math.min(10,count),
  communityBonusPercent:Math.min(20,count*2)};
}
function gdbPSetTarget_(ss,id,d){
 const url=String(d.driveFileLink||''),tid=String(d.targetId||'').trim();
 const lock=LockService.getScriptLock();lock.waitLock(15000);
 try{
  const log=gdbPRows_(ss,'PRACTICE LOG').find(r=>String(r[0])===id&&String(r[6])===url);
  if(!log)throw Error('Recording not found.');
  if(tid){
   const allowed=gdbPRows_(ss,'PUPIL TARGETS').some(r=>String(r[0])===id&&String(r[1])===tid&&
    ['IN PROGRESS','READY FOR REVIEW'].includes(String(r[2]).toUpperCase()));
   if(!allowed)throw Error('Target not assigned.');
  }
  gdbPEnsureMeta_(ss,log);
  const sh=gdbPTab_(ss,'SESSION META'),rows=sh.getDataRange().getValues();
  const ix=rows.findIndex((r,i)=>i>0&&String(r[0])===url&&String(r[1])===id);
  sh.getRange(ix+1,3).setValue(tid);SpreadsheetApp.flush();
  return {ok:true};
 }finally{lock.releaseLock();}
}
function gdbPUpload_(ss,id,d){
 const sid=gdbPSession_(d.sessionId);
 const start=new Date(String(d.startIso||'')),end=new Date(String(d.endIso||''));
 const seconds=Number(d.durationSeconds);
 const diff=(end.getTime()-start.getTime())/1000;
 if(!Number.isFinite(diff)||!Number.isFinite(seconds)||diff<=0||diff>7200||
    Math.abs(diff-seconds)>3)throw Error('Recording duration does not match timestamps.');
 const threshold=Number(gdbPProp_('GDB_QUALIFY_MINUTES'));
 if(!Number.isFinite(threshold)||threshold<=0||threshold>120)throw Error('Practice rule not configured.');
 const mime=String(d.mimeType||'').split(';')[0];
 const extensions={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav'};
 if(!Object.prototype.hasOwnProperty.call(extensions,mime))throw Error('Unsupported recording format.');
 const b64=String(d.audioBase64||'');
 if(b64.length>14*1024*1024||b64.length<64||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))
  throw Error('Audio upload invalid.');
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{
  const state=gdbPRecordingState_(ss,id,sid);
  if(state.saved)return {ok:true,fileUrl:state.fileUrl,qualifying:state.qualifying,duplicate:true};
  if(state.state!=='absent')throw Error('Save uncertain: contact teacher; do not re-upload.');
  gdbPReceipts_(ss).appendRow([sid,id,new Date(),'STARTED']);SpreadsheetApp.flush();
  // Do not retry upload after this point without owner reconciliation.
  const bytes=Utilities.base64Decode(b64);
  const blob=Utilities.newBlob(bytes,mime,sid+'.'+extensions[mime]);
  const file=DriveApp.getFolderById(gdbPProp_('GDB_PUPIL_RECORDINGS_FOLDER_ID')).createFile(blob);
  const url=file.getUrl();
  const mins=Math.round(diff/60*100)/100,qualifying=mins>=threshold?'Yes':'No';
  const row=[id,Utilities.formatDate(end,'Europe/Madrid','yyyy-MM-dd'),
    start.toISOString(),end.toISOString(),mins,qualifying,url,sid];
  gdbPTab_(ss,'PRACTICE LOG').appendRow(row);
  gdbPEnsureMeta_(ss,row);
  return {ok:true,fileUrl:url,qualifying,sessionId:sid};
 }finally{lock.releaseLock();}
}
