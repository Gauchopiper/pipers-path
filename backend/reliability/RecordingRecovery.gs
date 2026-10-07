/* Additive wrapper. Installer preserves the original uploader as pipersLegacyDoPost_.
 * Every audio writer in this Apps Script project must pass through this wrapper.
 * This is an installation-local protocol, not an ecosystem identity definition.
 */
function doPost(e) {
  let data;
  try {
    const raw = String(e && e.postData && e.postData.contents || '').trim();
    data = raw.startsWith('{') ? JSON.parse(raw) : Object.assign({}, e && e.parameter || {});
  } catch (_) { return pipersRecoveryReply_({ok:false,error:'Invalid request.'}); }
  const action = String(data.action || '');
  const isAudio = Boolean(data.audioBase64) && (!action || action === 'recording');
  if (action !== 'getRecordingState' && !isAudio) return pipersLegacyDoPost_(e);
  // Old clients without Session IDs retain the proven path, but cannot use retry.
  if (isAudio && !data.sessionId) return pipersLegacyDoPost_(e);
  let lock;
  try {
    const id = String(data.sessionId || '').toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw Error('Invalid session reference.');
    const ss = pipersRecoveryWorkbook_();
    const pupil = String(data.pupilId || '').trim();
    if (!pipersRecoveryValidate_(ss.getSheetByName('PUPILS'), pupil, String(data.accessKey || '')).ok) throw Error('Pupil link is not authorised.');
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    let state = pipersRecordingState_(ss, pupil, id);
    if (action === 'getRecordingState' || state.saved || state.state !== 'absent') return pipersRecoveryReply_(state, e);
    // Reserve durably BEFORE invoking the original uploader. A crash after a
    // Drive file is created but before PRACTICE LOG is written blocks retry.
    // We prefer manual repair over creating a duplicate orphaned recording.
    const journal = pipersRecoveryJournal_(ss);
    journal.appendRow([id, pupil, new Date(), 'STARTED']);
    SpreadsheetApp.flush();
    const original = pipersLegacyDoPost_(e);
    state = pipersRecordingState_(ss, pupil, id);
    return state.saved ? pipersRecoveryReply_(state, e) : original;
  } catch (_) {
    // No raw Google error, ID, credential, or pupil detail is exposed.
    return pipersRecoveryReply_({ok:false,state:'unknown',error:'Recording confirmation needs attention.'});
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function pipersRecoveryReply_(data, event) {
  if (event && event.parameter && event.parameter.transport === 'form') {
    return makePostMessagePage_(Object.assign({source:'pipers-path-backend',type:'upload-result'}, data));
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function pipersRecoveryJournal_(ss) {
  const headers = ['Session ID','Pupil ID','Started At','State'];
  let tab = ss.getSheetByName('RECORDING RECEIPTS');
  if (!tab) tab = ss.insertSheet('RECORDING RECEIPTS');
  if (!tab.getLastRow()) tab.appendRow(headers);
  if (JSON.stringify(tab.getRange(1,1,1,4).getValues()[0]) !== JSON.stringify(headers)) throw Error('Receipt schema mismatch');
  return tab;
}
function pipersRecordingState_(ss, pupil, id) {
  const base = {ok:true,protocol:'pipers-path-recording-recovery-v1',sessionId:id,saved:false,retrySafe:false};
  const log = ss.getSheetByName('PRACTICE LOG');
  if (!log) throw Error('Missing practice log');
  const rows = log.getLastRow() < 2 ? [] : log.getRange(2,1,log.getLastRow()-1,8).getValues();
  const matches = rows.filter(r => String(r[0]).trim() === pupil && String(r[7]).trim().toLowerCase() === id && r[6]);
  if (matches.length > 1) return Object.assign(base, {state:'attention'});
  if (matches.length === 1) {
    const row = matches[0];
    pipersEnsureRecordingMeta_(ss, pupil, id, String(row[6]));
    return Object.assign(base,{saved:true,state:'saved',fileUrl:String(row[6]),qualifying:String(row[5])});
  }
  const journal = pipersRecoveryJournal_(ss).getDataRange().getValues();
  const pending = journal.slice(1).some(r => String(r[0]) === id && String(r[1]) === pupil);
  return Object.assign(base,{state:pending?'attention':'absent',retrySafe:!pending});
}
function pipersEnsureRecordingMeta_(ss, pupil, id, url) {
  // Additive repair; never overwrite a teacher's review or the selected target.
  const tab = ss.getSheetByName('SESSION META');
  if (!tab) throw Error('Missing session metadata');
  const rows = tab.getDataRange().getValues();
  const expected = ['Drive File Link','Pupil ID','Target ID','Teacher Status','Teacher Note','Reviewed At','Session ID'];
  if (JSON.stringify(rows[0].slice(0,7)) !== JSON.stringify(expected)) throw Error('Session metadata schema mismatch');
  const index = rows.findIndex((r,i) => i > 0 && String(r[0]) === url && String(r[1]) === pupil);
  if (index < 0) tab.appendRow([url,pupil,'','','','',id]);
  else if (!rows[index][6]) tab.getRange(index+1,7).setValue(id);
  SpreadsheetApp.flush();
}
