// Optional central receiver for independently owned organisations. Not uploaded by the test workflow.
// Deploy as creator; set CENTRAL_SHEET_ID and ORG_SECRET_<opaque-org-id> in Script Properties.
function doPost(e) {
  let result={ok:false};
  try {
    if(!e || !e.postData || e.postData.contents.length>6000) throw Error('Invalid request');
    const envelope=JSON.parse(e.postData.contents), body=String(envelope.body||''), p=JSON.parse(body);
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(p.org||'')) throw Error('Invalid org');
    const props=PropertiesService.getScriptProperties(), secret=props.getProperty('ORG_SECRET_'+p.org);
    if(!secret) throw Error('Unknown org');
    const expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body,secret));
    if(expected!==envelope.signature || !Number.isFinite(p.sentAt) || Math.abs(Date.now()-p.sentAt)>300000) throw Error('Invalid signature');
    const r=p.row;
    if(!Array.isArray(r) || r.length!==9 || !/^F-[a-f0-9-]{36}$/i.test(r[0]) || r[1]!==p.org ||
      !['pupil','teacher'].includes(r[2]) || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(r[3]) ||
      !['broken','confusing','suggestion'].includes(r[4]) || !['record','path','group','teacher','other'].includes(r[5]) ||
      r[6]!=='dual-feedback-v1' || !['Chrome','Edge','Firefox','Safari','Other'].includes(r[7]) || r[8]!==false) throw Error('Invalid schema');
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try {
      const ss=SpreadsheetApp.openById(props.getProperty('CENTRAL_SHEET_ID'));
      const tab=ss.getSheetByName('TEST FEEDBACK') || ss.insertSheet('TEST FEEDBACK');
      const headers=['Reference','Organisation','Role','Created UTC','Category','Page','Version','Browser','Screenshot exists'];
      if(!tab.getLastRow()) tab.appendRow(headers);
      if(JSON.stringify(tab.getRange(1,1,1,9).getValues()[0])!==JSON.stringify(headers)) throw Error('Wrong headers');
      if(!tab.getDataRange().getValues().slice(1).some(v=>v[0]===r[0]&&v[1]===p.org)) {tab.appendRow(r);SpreadsheetApp.flush();}
      result={ok:true,reference:r[0]};
    } finally {lock.releaseLock();}
  }catch(_){}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
