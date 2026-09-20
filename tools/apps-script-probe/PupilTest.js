// Isolated recording adapter. Never install in production.
const TEST_AUDIO_HEADERS=['Pupil ID','Date','Duration (min)','Qualifying','Session ID','Drive File Link','End Time'];
function setupPupilRecordingTest() {
  feedbackOwner_();
  const p=PropertiesService.getScriptProperties(), c=feedbackConfig_();
  const ss=SpreadsheetApp.openById(c.sheet);
  if(ss.getName()!=='Piper’s Path — TEST Data') throw Error('Test workbook required.');
  const folder=DriveApp.getFolderById(p.getProperty('TEST_RECORDINGS_ID'));
  if(folder.getName()!=='TEST Recordings') throw Error('Test recording folder required.');
  const parents=folder.getParents();let valid=false;
  while(parents.hasNext()) if(parents.next().getId()===p.getProperty('TEST_ROOT_ID')) valid=true;
  if(!valid) throw Error('Test folder must belong to the test root.');
  const tab=ss.getSheetByName('PRACTICE LOG');
  const old=tab.getRange(1,1,1,5).getValues()[0];
  if(JSON.stringify(old)!==JSON.stringify(TEST_AUDIO_HEADERS.slice(0,5))) throw Error('Unexpected practice headers.');
  const extra=tab.getRange(1,6,1,2).getValues()[0];
  if(extra.some((v,i)=>v && v!==TEST_AUDIO_HEADERS[i+5])) throw Error('Unexpected extra columns.');
  tab.getRange(1,6,1,2).setValues([TEST_AUDIO_HEADERS.slice(5)]);
  p.setProperty('TEST_AUDIO_SHEET_ID',c.sheet);p.setProperty('TEST_AUDIO_FOLDER_ID',folder.getId());
  p.setProperty('TEST_AUDIO_READY','1');
  console.log('Test recording ready. Use the Feedback TEST deployment with ?pupil=1 and your dummy pupil fragment.');
}
function pupilTestApi(input) {
  assertTestProject_();
  const c=feedbackConfig_(),p=PropertiesService.getScriptProperties();
  if(Session.getEffectiveUser().getEmail().toLowerCase()!==c.owner || p.getProperty('TEST_AUDIO_READY')!=='1') throw Error('Owner-mode test recording setup required.');
  if(!input || typeof input!=='object' || input.ticket || !/^TEST\d{3}$/.test(String(input.pupilId||''))) throw Error('Dummy pupil required.');
  if(c.sheet!==p.getProperty('TEST_AUDIO_SHEET_ID') || p.getProperty('TEST_RECORDINGS_ID')!==p.getProperty('TEST_AUDIO_FOLDER_ID')) throw Error('Test destination changed. Run owner setup.');
  const ss=SpreadsheetApp.openById(c.sheet);
  const actor=feedbackActor_(input,c,ss);
  const tab=feedbackTab_(ss,'PRACTICE LOG',TEST_AUDIO_HEADERS);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const rows=tab.getDataRange().getValues().slice(1);
    const sessions=rows.filter(r=>r[0]===actor.id).map(r=>({date:r[1] instanceof Date?r[1].toISOString().slice(0,10):String(r[1]),durationMinutes:Number(r[2]),qualifying:['true','yes'].includes(String(r[3]).toLowerCase()),sessionId:String(r[4]),driveFileLink:String(r[5]||''),endTime:r[6] instanceof Date?r[6].toISOString():String(r[6]||'')})).reverse();
    if(input.action==='getPath') return {ok:true,sessions,targets:[],badges:[],creditedPracticeByDate:[],summary:{totalSessions:sessions.length,qualifyingSessions:sessions.filter(s=>s.qualifying).length,totalMinutes:sessions.reduce((n,s)=>n+s.durationMinutes,0),creditedQualifyingMinutes:sessions.filter(s=>s.qualifying).reduce((n,s)=>n+s.durationMinutes,0)}};
    if(input.action==='getGroup') {
      const today=Utilities.formatDate(new Date(),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
      const active=new Set(ss.getSheetByName('PUPILS').getDataRange().getValues().slice(1).filter(r=>['true','yes'].includes(String(r[2]).toLowerCase())).map(r=>r[0]));
      const ids=new Set(rows.filter(r=>active.has(r[0]) && (r[1] instanceof Date?Utilities.formatDate(r[1],ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'):String(r[1]))===today && ['true','yes'].includes(String(r[3]).toLowerCase())).map(r=>r[0]));
      return {ok:true,pipersToday:ids.size,bagpipeParts:Math.min(10,ids.size),communityBonusPercent:0};
    }
    if(input.action) throw Error('Unsupported test action.');
    if(!/^[a-f0-9-]{36}$/i.test(String(input.sessionId||''))) throw Error('Invalid session.');
    const prior=sessions.find(s=>s.sessionId===input.sessionId);
    if(prior) return {ok:true,fileUrl:prior.driveFileLink,qualifying:prior.qualifying?'Yes':'No'};
    const duration=Number(input.durationSeconds), start=Date.parse(input.startIso),end=Date.parse(input.endIso);
    if(!Number.isFinite(duration)||duration<0||duration>600||!Number.isFinite(start)||!Number.isFinite(end)||end<start||Math.abs((end-start)/1000-duration)>2||Math.abs(Date.now()-end)>86400000) throw Error('Use a test recording up to ten minutes.');
    const mime=String(input.mimeType||'').split(';')[0];
    if(!['audio/webm','audio/mp4','audio/ogg'].includes(mime)) throw Error('Unsupported audio type.');
    const audio=String(input.audioBase64||'');
    if(!audio || audio.length>7000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw Error('Invalid or oversized test audio.');
    if(rows.filter(r=>r[0]===actor.id).length>=100) throw Error('Test recording limit reached.');
    const folder=DriveApp.getFolderById(p.getProperty('TEST_AUDIO_FOLDER_ID'));
    const filename=actor.id+'-'+input.sessionId+'.'+({ 'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg'}[mime]);
    const files=folder.getFilesByName(filename);
    const file=files.hasNext()?files.next():folder.createFile(Utilities.newBlob(Utilities.base64Decode(audio),mime,filename));
    const qualifying=duration>=300;
    tab.appendRow([actor.id,Utilities.formatDate(new Date(end),ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'),duration/60,qualifying,input.sessionId,file.getUrl(),new Date(end).toISOString()]);
    SpreadsheetApp.flush();
    return {ok:true,fileUrl:file.getUrl(),qualifying:qualifying?'Yes':'No'};
  } finally {lock.releaseLock();}
}
function pupilTestFeedbackUrl() {
  assertTestProject_();
  const url=PropertiesService.getScriptProperties().getProperty('FEEDBACK_WEB_APP_URL');
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url||'')) throw Error('Test feedback URL required.');
  return url;
}

// Same authenticated test adapter, exposed for the standalone pupil preview.
function doPost(e) {
  assertTestProject_();
  let result;
  try {
    if(!e || !e.postData || typeof e.postData.contents!=='string' || e.postData.contents.length>7100000) throw Error('Invalid request');
    result=pupilTestApi(JSON.parse(e.postData.contents));
  } catch (_) {result={ok:false,error:'Test request could not be completed. Check your dummy link and test setup.'};}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function pupilTestDownload_() {
  assertTestProject_();
  const url=pupilTestFeedbackUrl();
  const html=HtmlService.createHtmlOutputFromFile('PupilStandalone').getContent().replace('__TEST_ENDPOINT__',url);
  const encoded=Utilities.base64Encode(html,Utilities.Charset.UTF_8);
  return HtmlService.createHtmlOutput('<h1>Piper’s Path — desktop recording test</h1><p>Download the test page, open the downloaded file in Chrome, then paste your existing dummy pupil test link when asked. No pupil key is stored in the downloaded file.</p><button id="download">Download test page</button><script>document.getElementById("download").onclick=function(){const bytes=Uint8Array.from(atob("'+encoded+'"),c=>c.charCodeAt(0));const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([bytes],{type:"text/html"}));a.download="Pipers-Path-Recording-Test.html";a.click();};</script>');
}
