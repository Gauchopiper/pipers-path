/**
 * Gaita de Boto — Teacher backend (deployment candidate, NOT LIVE).
 * New, independent Apps Script project only. Never push to CIYPB/EMGT/SPBASA.
 * Web app must run as OWNER; identity MUST be verified server-side.
 * If Session.getActiveUser().getEmail() is blank (common for external users),
 * access fails closed; do not weaken this guard. External Assistant auth
 * requires a proven Google identity path before release.
 */
const GDB_T = {
  PUPILS: ['Pupil ID','Display Name','Active','Preferred Language','Date Joined','Access Key','Personal Link','Short Code'],
  'PRACTICE LOG': ['Pupil ID','Date','Start Time','End Time','Duration (min)','Qualifying','Drive File Link','Session ID'],
  'SESSION META': ['Drive File Link','Pupil ID','Target ID','Teacher Status','Teacher Note','Reviewed At','Session ID'],
  TARGETS: ['Target ID','Title','Instructions','Resource Link','Badge ID','Completion Mode','Auto Rule Type','Auto Rule Value','Active','Display Order'],
  'PUPIL TARGETS': ['Pupil ID','Target ID','Status','Assigned Date','Ready for Review Date','Achieved Date','Teacher Note'],
  BADGES: ['Badge ID','Badge Name','Description','Image Link','Active','Display Order','Image File ID','Drive Image Link'],
  'PUPIL BADGES': ['Pupil ID','Badge ID','Date Awarded','Awarded By','Note','Source Target ID']
};
function gdbProperty_(name) {
  const v = String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
  if (!v) throw Error('Configuration missing: ' + name);
  return v;
}
function gdbActor_() {
  const actual = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!actual) throw Error('Signed-in Google identity unavailable; access denied.');
  const owner = gdbProperty_('GDB_OWNER_EMAIL').toLowerCase();
  const assistants = String(PropertiesService.getScriptProperties().getProperty('GDB_ASSISTANT_EMAILS') || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const role = actual === owner ? 'OWNER' : assistants.includes(actual) ? 'ASSISTANT' : '';
  if (!role) throw Error('This Google account is not authorised.');
  return {email: actual, role};
}
function gdbOwner_() {
  const actor = gdbActor_();
  if (actor.role !== 'OWNER') throw Error('Owner permission required.');
  return actor;
}
function gdbSheet_(name) {
  const ss = SpreadsheetApp.openById(gdbProperty_('GDB_DATA_SHEET_ID'));
  const tab = ss.getSheetByName(name);
  if (!tab) throw Error('Missing organisation tab: ' + name);
  const expected = GDB_T[name];
  if (expected) {
    const got = tab.getRange(1,1,1,expected.length).getValues()[0];
    if (JSON.stringify(got) !== JSON.stringify(expected)) throw Error('Wrong tab schema: ' + name);
  }
  return tab;
}
function gdbRows_(name) {
  const sh = gdbSheet_(name);
  const n = sh.getLastRow();
  return n > 1 ? sh.getRange(2,1,n-1,GDB_T[name].length).getValues() : [];
}
function gdbStr_(v,max) { return String(v == null ? '' : v).trim().slice(0,max); }
function gdbText_(v,max) {
  const txt = gdbStr_(v,max);
  // Prevent spreadsheet formula injection on human-entered text.
  return /^[=+\-@]/.test(txt) ? "'" + txt : txt;
}
function gdbPupilExists_(id) {
  return gdbRows_('PUPILS').some(r => String(r[0]) === id);
}
function doGet() {
  // Page is safe to serve; every RPC validates the real Google identity.
  return HtmlService.createHtmlOutputFromFile('TeacherDashboard')
    .setTitle("Piper's Path - Gaita de Boto Teacher")
    .addMetaTag('viewport','width=device-width,initial-scale=1');
}
function gdb_dashboard() {
  const actor = gdbActor_();
  const pupils = gdbRows_('PUPILS');
  const logs = gdbRows_('PRACTICE LOG');
  const totals = {};
  for (const r of logs) {
    const id = String(r[0]), t = totals[id] || (totals[id] = {sessions:0,minutes:0,qualifying:0});
    t.sessions += 1;
    t.minutes += Number(r[4]) || 0;
    if (String(r[5]).toLowerCase() === 'yes') t.qualifying += 1;
  }
  return {
    role:actor.role, actor:actor.email,
    pupils:pupils.map(r=>({
      id:String(r[0]),name:String(r[1]),active:String(r[2]),language:String(r[3]),
      summary:totals[String(r[0])] || {sessions:0,minutes:0,qualifying:0},
      // Owner-only access link. Never expose capability links to assistants.
      link:actor.role==='OWNER'?String(r[6]||''):''
    })),
    targets:gdbRows_('TARGETS').filter(r=>String(r[8]).toLowerCase()!=='no')
      .map(r=>({id:String(r[0]),title:String(r[1])})),
    badges:gdbRows_('BADGES').filter(r=>String(r[4]).toLowerCase()!=='no')
      .map(r=>({id:String(r[0]),name:String(r[1])}))
  };
}
function gdb_detail(pupilId) {
  gdbActor_();
  const id = gdbStr_(pupilId,100);
  if (!gdbPupilExists_(id)) throw Error('Unknown pupil.');
  const meta = {};
  for(const r of gdbRows_('SESSION META')) meta[String(r[6]||'')] = r;
  const sessions = gdbRows_('PRACTICE LOG').filter(r=>String(r[0])===id)
    .map(r=>{
      const s=meta[String(r[7])];
      return {id:String(r[7]),date:String(r[1]),minutes:Number(r[4])||0,
        qualifying:String(r[5]),targetId:s?String(s[2]):'',
        review:s?String(s[3]):'',note:s?String(s[4]):''};
    }).reverse().slice(0,75);
  const targets = gdbRows_('PUPIL TARGETS').filter(r=>String(r[0])===id)
    .map(r=>({id:String(r[1]),status:String(r[2]),teacherNote:String(r[6]||'')}));
  const badges = gdbRows_('PUPIL BADGES').filter(r=>String(r[0])===id)
    .map(r=>({id:String(r[1]),date:String(r[2])}));
  return {pupilId:id,sessions,targets,badges};
}
function gdb_createPupil(name,language) {
  gdbOwner_();
  const displayName = gdbText_(name,120);
  if (!displayName) throw Error('Pupil name required.');
  const lang = String(language||'ES').toUpperCase()==='EN'?'EN':'ES';
  const frontend = gdbProperty_('GDB_PUPIL_FRONTEND_URL');
  if (!/^https:\/\/gauchopiper\.github\.io\/pipers-path\/gaita-de-boto\/$/.test(frontend))
    throw Error('Gaita frontend URL not configured.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const id=Utilities.getUuid(),key=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
    const link=frontend+'?'+
      'p='+encodeURIComponent(id)+'&key='+encodeURIComponent(key)+
      '&n='+encodeURIComponent(displayName)+'&lang='+lang;
    gdbSheet_('PUPILS').appendRow([id,displayName,'Yes',lang,new Date(),key,link,'']);
    SpreadsheetApp.flush();
    return {id,name:displayName,link};
  }finally{lock.releaseLock();}
}
function gdb_setActive(pupilId,active) {
  gdbOwner_();
  const id=gdbStr_(pupilId,100);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const sh=gdbSheet_('PUPILS'), vals=sh.getDataRange().getValues();
    const index=vals.findIndex((r,i)=>i>0&&String(r[0])===id);
    if(index<0)throw Error('Unknown pupil.');
    sh.getRange(index+1,3).setValue(active?'Yes':'No');SpreadsheetApp.flush();
    return {ok:true};
  }finally{lock.releaseLock();}
}
function gdb_assignTarget(pupilId,targetId) {
  gdbOwner_();
  const id=gdbStr_(pupilId,100),target=gdbStr_(targetId,100);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    if(!gdbPupilExists_(id)||!gdbRows_('TARGETS').some(r=>String(r[0])===target)) throw Error('Invalid pupil or target.');
    const sh=gdbSheet_('PUPIL TARGETS');
    if(gdbRows_('PUPIL TARGETS').some(r=>String(r[0])===id&&String(r[1])===target))return {ok:true,existing:true};
    sh.appendRow([id,target,'IN PROGRESS',new Date(),'','','']);SpreadsheetApp.flush();
    return {ok:true};
  }finally{lock.releaseLock();}
}
function gdb_review(pupilId,sessionId,status,note) {
  const actor=gdbActor_();
  const id=gdbStr_(pupilId,100),sid=gdbStr_(sessionId,100);
  const value=gdbStr_(status,40);
  if(!['REVIEWED','NEEDS WORK','ACHIEVED'].includes(value))throw Error('Invalid review status.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const log=gdbRows_('PRACTICE LOG');
    if(!log.some(r=>String(r[0])===id&&String(r[7])===sid))throw Error('Recording not found.');
    const sh=gdbSheet_('SESSION META'), rows=sh.getDataRange().getValues();
    const ix=rows.findIndex((r,i)=>i>0&&String(r[1])===id&&String(r[6])===sid);
    if(ix<0)throw Error('Recording metadata missing; no review was saved.');
    sh.getRange(ix+1,4,1,3).setValues([[value,gdbText_(note,1200)+' ['+actor.role+']',new Date()]]);
    SpreadsheetApp.flush();return{ok:true};
  }finally{lock.releaseLock();}
}
function gdb_awardBadge(pupilId,badgeId) {
  gdbOwner_();
  const id=gdbStr_(pupilId,100),badge=gdbStr_(badgeId,100);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try {
    if(!gdbPupilExists_(id)||!gdbRows_('BADGES').some(r=>String(r[0])===badge))throw Error('Invalid pupil or badge.');
    if(gdbRows_('PUPIL BADGES').some(r=>String(r[0])===id&&String(r[1])===badge))return{ok:true,existing:true};
    gdbSheet_('PUPIL BADGES').appendRow([id,badge,new Date(),gdbActor_().email,'','']);
    SpreadsheetApp.flush();return{ok:true};
  }finally{lock.releaseLock();}
}
function gdb_recordingAudio(pupilId,sessionId) {
  // Deliberately scoped audio proxy: no direct canonical Sheet or Drive grant to Assistant.
  gdbActor_();
  const id=gdbStr_(pupilId,100),sid=gdbStr_(sessionId,100);
  const r=gdbRows_('PRACTICE LOG').find(row=>String(row[0])===id&&String(row[7])===sid);
  if(!r)throw Error('No access to that recording.');
  const fileLink=String(r[6]||'');
  const m=fileLink.match(/(?:\/d\/|id=)([-\w]{20,})/);
  if(!m)throw Error('Recording link is not usable.');
  const file=DriveApp.getFileById(m[1]);
  if(file.getSize()>5*1024*1024)throw Error('Recording exceeds dashboard playback limit.');
  const blob=file.getBlob();
  if(!/^audio\//.test(blob.getContentType()))throw Error('Recording is not an audio file.');
  return {mime:blob.getContentType(),data:Utilities.base64Encode(blob.getBytes())};
}
