// Test-only adapter. No production pupil workbook or upload endpoint is used.
const FEEDBACK_VERSION = 'dual-feedback-v1';
const FEEDBACK_HEADERS = ['Reference','Organisation','Role','Local user ID','Created UTC','Category','Description','Explanation','Page','Version','Browser','Screenshot exists','Central status','Central attempts'];
const CENTRAL_HEADERS = ['Reference','Organisation','Role','Created UTC','Category','Page','Version','Browser','Screenshot exists'];
function feedbackOwner_() {
  assertTestProject_();
  const owner = PropertiesService.getScriptProperties().getProperty('TEST_OWNER_EMAIL');
  const active = Session.getActiveUser().getEmail().toLowerCase();
  if (!owner || active !== owner || Session.getEffectiveUser().getEmail().toLowerCase() !== owner) throw Error('Owner sign-in required.');
}
function feedbackConfig_() {
  assertTestProject_();
  const p = PropertiesService.getScriptProperties();
  const c = {sheet:p.getProperty('TEST_SHEET_ID'), org:p.getProperty('FEEDBACK_ORG_ID'), central:p.getProperty('FEEDBACK_CENTRAL_SHEET_ID'), secret:p.getProperty('FEEDBACK_SECRET'), owner:p.getProperty('TEST_OWNER_EMAIL')};
  if (!c.sheet || !c.org || !c.secret || !c.owner) throw Error('Feedback setup is required.');
  return c;
}
function feedbackTab_(ss, name, headers) {
  let tab = ss.getSheetByName(name);
  if (!tab) tab = ss.insertSheet(name);
  if (!tab.getLastRow()) {tab.appendRow(headers); tab.setFrozenRows(1);}
  const actual = tab.getRange(1,1,1,headers.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(headers)) throw Error('Unexpected feedback headers.');
  return tab;
}
function setupFeedbackTest() {
  feedbackOwner_();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const p = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(p.getProperty('TEST_SHEET_ID'));
    const org = ss.getSheetByName('ORG CONFIG').getDataRange().getValues().find(r => r[0] === 'Org ID');
    if (!org || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(org[1]))) throw Error('Configure an opaque Org ID first.');
    p.setProperty('FEEDBACK_ORG_ID', String(org[1]));
    if (!p.getProperty('FEEDBACK_SECRET')) p.setProperty('FEEDBACK_SECRET', Utilities.getUuid()+Utilities.getUuid());
    feedbackTab_(ss, 'TEST FEEDBACK', FEEDBACK_HEADERS);
    const credentials = feedbackTab_(ss, 'FEEDBACK TEST PUPILS', ['Pupil ID','Feedback key']);
    if (credentials.getLastRow() === 1) credentials.appendRow(['TEST001', Utilities.getUuid()+Utilities.getUuid()]);
    let centralId = p.getProperty('FEEDBACK_CENTRAL_SHEET_ID');
    if (!centralId) {
      const central = SpreadsheetApp.create('Piper’s Path — CENTRAL FEEDBACK TEST');
      centralId = central.getId(); p.setProperty('FEEDBACK_CENTRAL_SHEET_ID', centralId);
    }
    if (centralId === ss.getId()) throw Error('Central workbook must be separate.');
    feedbackTab_(SpreadsheetApp.openById(centralId), 'TEST FEEDBACK', CENTRAL_HEADERS);
    console.log('Feedback setup ready. Central workbook: https://docs.google.com/spreadsheets/d/'+centralId+'/edit');
  } finally {lock.releaseLock();}
}
function feedbackMac_(text, secret) {return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text,secret));}
function feedbackEqual_(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff=0; for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
function getFeedbackLink() {
  const c = feedbackConfig_();
  const email = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!email || email !== Session.getEffectiveUser().getEmail().trim().toLowerCase()) throw Error('Use the teacher sign-in deployment.');
  const ss=SpreadsheetApp.openById(c.sheet), rows=ss.getSheetByName('TEACHERS').getDataRange().getValues();
  if (!isAllowedTeacher_(email,rows)) throw Error('Teacher access denied.');
  const url=PropertiesService.getScriptProperties().getProperty('FEEDBACK_WEB_APP_URL');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url||'')) throw Error('Feedback deployment URL is not configured.');
  const payload=Utilities.base64EncodeWebSafe(JSON.stringify({email,org:c.org,expires:Date.now()+15*60*1000}));
  return url+'?feedback=1#ticket='+encodeURIComponent(payload+'.'+feedbackMac_(payload,c.secret))+'&page=teacher';
}
function feedbackActor_(input,c,ss) {
  if (input.ticket) {
    const parts=String(input.ticket).split('.');
    if(parts.length!==2 || !feedbackEqual_(feedbackMac_(parts[0],c.secret),parts[1])) throw Error('Invalid teacher link.');
    const claim=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if(claim.org!==c.org || !Number.isFinite(claim.expires) || claim.expires<Date.now()) throw Error('Teacher link expired. Reopen feedback from the dashboard.');
    const rows=ss.getSheetByName('TEACHERS').getDataRange().getValues();
    if(!isAllowedTeacher_(claim.email,rows)) throw Error('Teacher access denied.');
    return {role:'teacher',id:String(rows.slice(1).find(r=>String(r[1]).trim().toLowerCase()===claim.email)[0])};
  }
  const pupil=String(input.pupilId||''), key=String(input.accessKey||'');
  const creds=ss.getSheetByName('FEEDBACK TEST PUPILS').getDataRange().getValues().slice(1).filter(r=>String(r[0])===pupil);
  const pupils=ss.getSheetByName('PUPILS').getDataRange().getValues().slice(1).filter(r=>String(r[0])===pupil);
  if(creds.length!==1 || !key || !feedbackEqual_(String(creds[0][1]),key) || pupils.length!==1 || !['true','yes'].includes(String(pupils[0][2]).toLowerCase())) throw Error('Pupil link is not authorised for this test.');
  return {role:'pupil',id:pupil};
}
function feedbackInput_(input) {
  const short=String(input.description||'').trim(), long=String(input.explanation||'').trim();
  if(!['broken','confusing','suggestion'].includes(input.category)) throw Error('Choose a category.');
  if(!short || short.length>160 || long.length>4000) throw Error('Use a description up to 160 characters and explanation up to 4000.');
  if(!/^[a-f0-9-]{36}$/i.test(String(input.requestId||''))) throw Error('Invalid request reference.');
  if(input.screenshot) throw Error('Screenshots are not supported in this version.');
  // Only enumerated context can reach central. Never transmit URLs, query strings or raw user agents.
  return {short,long,category:input.category,requestId:input.requestId.toLowerCase(),page:['record','path','group','teacher'].includes(input.page)?input.page:'other',browser:['Chrome','Edge','Firefox','Safari','Other'].includes(input.browser)?input.browser:'Other'};
}
function feedbackCell_(value) {return /^[=+\-@\t\r\n]/.test(String(value)) ? "'"+value : value;}
function feedbackCentralRow_(row) {return [row[0],row[1],row[2],row[4],row[5],row[8],row[9],row[10],false];}
function deliverFeedback_(row,c) {
  let stage='configuration';
  try {
  const props=PropertiesService.getScriptProperties(), endpoint=props.getProperty('FEEDBACK_CENTRAL_URL');
  if(endpoint) {
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) throw Error('Invalid central endpoint');
    const secret=props.getProperty('FEEDBACK_CENTRAL_SECRET');
    if(!secret) throw Error('Central secret missing');
    const body=JSON.stringify({org:c.org,sentAt:Date.now(),row:feedbackCentralRow_(row)});
    stage='central HTTP request';
    const response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',payload:JSON.stringify({body,signature:feedbackMac_(body,secret)}),muteHttpExceptions:true});
    stage='central HTTP acknowledgement';
    const ack=JSON.parse(response.getContentText());
    if(response.getResponseCode()!==200 || !ack.ok || ack.reference!==row[0]) throw Error('Central delivery failed');
    return;
  }
  if(!c.central || c.central===c.sheet) throw Error('Separate central destination required');
  stage='opening central workbook';
  const centralBook=SpreadsheetApp.openById(c.central);
  stage='checking central TEST FEEDBACK headers';
  const central=feedbackTab_(centralBook,'TEST FEEDBACK',CENTRAL_HEADERS);
  stage='reading central records';
  const matches=central.getDataRange().getValues().slice(1).filter(r=>r[0]===row[0] && r[1]===row[1]);
  if(!matches.length) {stage='writing central record'; central.appendRow(feedbackCentralRow_(row)); SpreadsheetApp.flush();}
  } catch(error) {
    // Never log raw service errors: they can contain URLs, IDs or response bodies.
    const message=String(error && error.message || '');
    const known=['Invalid central endpoint','Central secret missing','Central delivery failed','Separate central destination required','Unexpected feedback headers.'];
    const reason=known.includes(message)?message:/permission|access denied|not have access|authorization|authorisation/i.test(message)?'Access or authorisation failure':/quota|too many|limit exceeded/i.test(message)?'Service limit reached':'Service operation failed';
    const safe=Error(stage+': '+reason);
    safe.feedbackDiagnostic=true;
    throw safe;
  }
}
function submitFeedback(input) {
  const c=feedbackConfig_();
  if(Session.getEffectiveUser().getEmail().toLowerCase()!==c.owner) throw Error('Use the feedback deployment.');
  if(!input || typeof input!=='object' || JSON.stringify(input).length>12000) throw Error('Invalid feedback.');
  const fields=feedbackInput_(input), ss=SpreadsheetApp.openById(c.sheet), actor=feedbackActor_(input,c,ss);
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const tab=feedbackTab_(ss,'TEST FEEDBACK',FEEDBACK_HEADERS), rows=tab.getDataRange().getValues();
    const ref='F-'+fields.requestId;
    let rowIndex=rows.findIndex(r=>r[0]===ref), row;
    if(rowIndex>0) {
      row=rows[rowIndex];
      if(row[1]!==c.org || row[2]!==actor.role || row[3]!==feedbackCell_(actor.id)) throw Error('Reference conflict.');
    } else {
      const recent=rows.slice(1).filter(r=>r[2]===actor.role && r[3]===feedbackCell_(actor.id) && Date.parse(r[4])>Date.now()-3600000);
      if(recent.length>=10) throw Error('Please wait before sending more feedback.');
      row=[ref,c.org,actor.role,feedbackCell_(actor.id),new Date().toISOString(),fields.category,feedbackCell_(fields.short),feedbackCell_(fields.long),fields.page,FEEDBACK_VERSION,fields.browser,false,'PENDING',0];
      tab.appendRow(row); SpreadsheetApp.flush(); rowIndex=tab.getLastRow()-1;
    }
    if(row[12]!=='SENT') {
      row[13]=Number(row[13]||0)+1;
      try {deliverFeedback_(row,c); row[12]='SENT';} catch(_){row[12]='PENDING';}
      // If this update fails, a later retry deduplicates the central record.
      tab.getRange(rowIndex+1,13,1,2).setValues([[row[12],row[13]]]);
    }
    return {ok:true,reference:ref,central:row[12]};
  } finally {lock.releaseLock();}
}
function retryFeedbackDelivery() {
  feedbackOwner_(); const c=feedbackConfig_();
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const tab=feedbackTab_(SpreadsheetApp.openById(c.sheet),'TEST FEEDBACK',FEEDBACK_HEADERS);
    const mode=PropertiesService.getScriptProperties().getProperty('FEEDBACK_CENTRAL_URL')?'HTTP receiver':'direct workbook';
    console.log('Feedback retry destination mode: '+mode);
    let attempted=0, sent=0;
    tab.getDataRange().getValues().slice(1).forEach((row,i)=>{
      if(row[12]==='SENT' || attempted>=50) return;
      attempted++;
      let status='PENDING';
      try {deliverFeedback_(row,c);status='SENT';sent++;}
      catch(error) {console.log('Feedback retry failed: '+(error.feedbackDiagnostic?error.message:'Unclassified delivery failure'));}
      tab.getRange(i+2,13,1,2).setValues([[status,Number(row[13]||0)+1]]);
    });
    console.log('Feedback retry: attempted '+attempted+', sent '+sent+', still pending '+(attempted-sent)+'.');
    return {attempted};
  } finally {lock.releaseLock();}
}
