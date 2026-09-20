// Isolated authentication experiment. Never install in a production project.
const TEST_PROJECT_ID = '1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ';

function pipersPathConnectionCheck() {
  assertTestProject_();
  return 'Piper’s Path test connection ready';
}

function assertTestProject_() {
  if (ScriptApp.getScriptId() !== TEST_PROJECT_ID) {
    throw new Error('This code runs only in the approved CONNECTION TEST project.');
  }
}

// Public editor entry point. Authorisation is enforced by the private helper.
function setupTestEnvironment() {
  return setupTestEnvironment_();
}

// Run from the Apps Script editor as the actual test project owner.
// The trailing underscore prevents browser google.script.run calls.
function setupTestEnvironment_() {
  assertTestProject_();
  const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || String(Session.getActiveUser().getEmail() || '').trim().toLowerCase() !== email) throw new Error('Sign in as the test project owner.');
  const owner = DriveApp.getFileById(TEST_PROJECT_ID).getOwner();
  if (!owner || String(owner.getEmail()).trim().toLowerCase() !== email) {
    throw new Error('Only the script file owner can run test setup.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const priorOwner = props.getProperty('TEST_OWNER_EMAIL');
    if (priorOwner && priorOwner !== email) throw new Error('Only the setup owner can rerun setup.');
    props.setProperty('TEST_OWNER_EMAIL', email);
    const root = getTestFolder_(props, 'TEST_ROOT_ID', null, 'Piper’s Path — TEST ONLY');
    const recordings = getTestFolder_(props, 'TEST_RECORDINGS_ID', root, 'TEST Recordings');
    let sheetId = props.getProperty('TEST_SHEET_ID');
    let ss;
    if (sheetId) {
      ss = SpreadsheetApp.openById(sheetId);
    } else {
      ss = SpreadsheetApp.create('Piper’s Path — TEST Data');
      sheetId = ss.getId();
      props.setProperty('TEST_SHEET_ID', sheetId);
    }
    DriveApp.getFileById(sheetId).moveTo(root);
    ss.setSpreadsheetTimeZone('Europe/Madrid');
    seedTestTab_(ss, 'ORG CONFIG', [
      ['Key', 'Value'], ['Org ID', 'connection-test'], ['Environment', 'TEST'],
      ['Organisation Name', 'Piper’s Path Test School'], ['Profile', 'PIPE_SCHOOL'],
      ['Default Language', 'ES'], ['Time Zone', 'Europe/Madrid'], ['Schema Version', '1']
    ]);
    seedTestTab_(ss, 'TEACHERS', [
      ['Teacher ID', 'Email', 'Role', 'Active'], ['T001', email, 'OWNER', true]
    ]);
    seedTestTab_(ss, 'PUPILS', [
      ['Pupil ID', 'Display Name', 'Active', 'Preferred Language'],
      ['TEST001', 'Demo Piper A', true, 'EN'], ['TEST002', 'Demo Piper B', true, 'ES']
    ]);
    seedTestTab_(ss, 'PRACTICE LOG', [
      ['Pupil ID', 'Date', 'Duration (min)', 'Qualifying', 'Session ID'],
      ['TEST001', '2026-09-18', 6, true, 'dummy-session-001'],
      ['TEST002', '2026-09-18', 3, false, 'dummy-session-002']
    ]);
    props.setProperty('TEST_READY', '1');
    // These are resource links, never pupil credentials or Google tokens.
    console.log('TEST Sheet: ' + ss.getUrl());
    console.log('TEST recordings folder: ' + recordings.getUrl());
    console.log('Setup complete. Repeating setup preserves existing test rows.');
  } finally {
    lock.releaseLock();
  }
}

function getTestFolder_(props, key, parent, name) {
  const id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  const folder = parent ? parent.createFolder(name) : DriveApp.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder;
}

function seedTestTab_(ss, name, rows) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() !== 0) return;
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sheet.autoResizeColumns(1, rows[0].length);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function isAllowedTeacher_(email, rows) {
  const matches = rows.slice(1).filter(row => String(row[1] || '').trim().toLowerCase() === email);
  if (matches.length !== 1) return false;
  const row = matches[0];
  return ['OWNER', 'TEACHER'].includes(String(row[2]).trim().toUpperCase()) &&
    ['true', 'yes'].includes(String(row[3]).trim().toLowerCase());
}

function teacherDiagnostic_() {
  assertTestProject_();
  const props = PropertiesService.getScriptProperties();
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return {ok: false, message: 'Google did not provide your identity. No pupil data was read.'};
  if (email !== effective) return {ok: false, message: 'Deployment must execute as the user accessing the app.'};
  if (props.getProperty('TEST_READY') !== '1') return {ok: false, message: 'The owner must complete test setup first.'};
  let ss;
  try {
    ss = SpreadsheetApp.openById(props.getProperty('TEST_SHEET_ID'));
  } catch (_) {
    return {ok: false, message: 'Google sign-in worked, but this account cannot read the test Sheet. This is the file-permission check.'};
  }
  const teachers = ss.getSheetByName('TEACHERS');
  if (!teachers || !isAllowedTeacher_(email, teachers.getDataRange().getValues())) {
    return {ok: false, message: 'This account is not an active authorised test teacher.'};
  }
  const pupilsSheet = ss.getSheetByName('PUPILS');
  if (!pupilsSheet) return {ok: false, message: 'Test pupil tab is missing.'};
  const pupils = pupilsSheet.getDataRange().getValues().slice(1)
    .filter(row => ['true', 'yes'].includes(String(row[2]).trim().toLowerCase()))
    .map(row => ({id: String(row[0]), label: String(row[1])}));
  let folderReadable = false;
  try {
    DriveApp.getFolderById(props.getProperty('TEST_RECORDINGS_ID')).getName();
    folderReadable = true;
  } catch (_) { /* Report separately; do not expose resource IDs. */ }
  const configSheet = ss.getSheetByName('ORG CONFIG');
  const config = {};
  if (configSheet) configSheet.getDataRange().getValues().slice(1).forEach(row => {config[String(row[0])] = String(row[1]);});
  const logSheet = ss.getSheetByName('PRACTICE LOG');
  if (!logSheet) throw new Error('Practice log missing');
  const summary = summarisePractice_(pupils, logSheet.getDataRange().getValues(), ss.getSpreadsheetTimeZone());
  return {ok: true, email, pupils, folderReadable, summary,
    organisation: config['Organisation Name'] || 'Piper’s Path Test Organisation',
    profile: config.Profile || 'PIPE_SCHOOL'};
}

function summarisePractice_(pupils, rows, timeZone) {
  const headers = rows[0] || [];
  const idCol = headers.indexOf('Pupil ID');
  const minutesCol = headers.indexOf('Duration (min)');
  const dateCol = headers.indexOf('Date');
  if ([idCol, minutesCol, dateCol].some(index => index < 0)) throw new Error('Practice headers missing');
  const byId = new Map(pupils.map(p => [p.id, {id: p.id, label: p.label, sessions: 0, minutes: 0, latest: ''}]));
  let skipped = 0;
  rows.slice(1).forEach(row => {
    if (row.every(value => value === '')) return;
    const pupil = byId.get(String(row[idCol]));
    if (!pupil) return;
    const rawMinutes = row[minutesCol];
    const minutes = typeof rawMinutes === 'number' ? rawMinutes :
      typeof rawMinutes === 'string' && rawMinutes.trim() ? Number(rawMinutes) : NaN;
    const rawDate = row[dateCol];
    const date = rawDate instanceof Date && !isNaN(rawDate.getTime())
      ? Utilities.formatDate(rawDate, timeZone, 'yyyy-MM-dd') : String(rawDate || '');
    const parsed = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(minutes) || minutes < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {skipped++; return;}
    pupil.sessions++;
    pupil.minutes += minutes;
    if (date > pupil.latest) pupil.latest = date;
  });
  const entries = Array.from(byId.values());
  return {entries, skipped, sessions: entries.reduce((n, p) => n + p.sessions, 0),
    minutes: entries.reduce((n, p) => n + p.minutes, 0)};
}

function renderDashboard_(result) {
  const h = escapeHtml_;
  const number = value => String(Math.round(value * 10) / 10);
  const label = result.profile === 'PIPE_BAND' ? 'Members' : 'Pupils';
  const summary = result.summary;
  return '<header><p class="eyebrow">PIPER’S PATH · TEACHER</p><h1>' + h(result.organisation) +
    '</h1><p>Practice overview</p></header><div class="notice">TEST ORGANISATION · DUMMY DATA ONLY</div>' +
    '<section class="stats" aria-label="Practice totals">' +
    '<div><strong>' + summary.entries.length + '</strong><span>Active ' + label.toLowerCase() + '</span></div>' +
    '<div><strong>' + summary.sessions + '</strong><span>Practice sessions</span></div>' +
    '<div><strong>' + number(summary.minutes) + '</strong><span>Minutes practised</span></div></section>' +
    '<section><h2>' + label + '</h2><p class="muted">All logged dates · Active ' + label.toLowerCase() +
    ' only · Last practice shown as year-month-day</p><div class="pupils">' +
    summary.entries.map(p => '<article><h3>' + h(p.label) + '</h3><p class="muted">' + h(p.id) +
      '</p><dl><div><dt>Sessions</dt><dd>' + p.sessions + '</dd></div><div><dt>Minutes</dt><dd>' +
      number(p.minutes) + '</dd></div><div><dt>Last practice</dt><dd>' + (h(p.latest) || 'No practice yet') +
      '</dd></div></dl></article>').join('') +
    (summary.entries.length ? '' : '<p>No active ' + label.toLowerCase() + ' yet.</p>') +
    '</div>' + (summary.skipped ? '<p class="notice">' + summary.skipped + ' practice rows have invalid dates or durations and were excluded.</p>' : '') +
    '</section><footer><p>Signed in: ' + h(result.email) + '</p><p>Teacher access: passed · Test recording folder: ' +
    (result.folderReadable ? 'readable' : 'permission required') +
    '</p>' + teacherFeedbackControl_() + '<p>Read-only preview. Refresh this page to update the figures. Audio playback and editing are not available yet.</p></footer>';
}

function doGet(e) {
  if (e && e.parameter && e.parameter.pupil === '1') {
    assertTestProject_();
    return HtmlService.createHtmlOutputFromFile('PupilPreview').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (e && e.parameter && e.parameter.feedback === '1') {
    assertTestProject_();
    return HtmlService.createHtmlOutputFromFile('FeedbackForm').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  // Isolate Google execution/HTML delivery from identity and file access.
  // This route returns fixed text only and never reads organisation data.
  if (e && e.parameter && e.parameter.diagnostic === 'ping') {
    return HtmlService.createHtmlOutput('<h1>Piper’s Path — connection diagnostic</h1>' +
      '<p>DIAGNOSTIC 2: Web app code reached.</p>' +
      '<p>No identity, spreadsheet or Drive data was read.</p>');
  }
  let result;
  try { result = teacherDiagnostic_(); }
  catch (_) { result = {ok: false, message: 'The test could not complete. Ask the owner to check setup and permissions.'}; }
  const body = result.ok ? renderDashboard_(result) :
    '<h1>Piper’s Path</h1><p>Teacher dashboard · DUMMY DATA ONLY</p><p role="alert">' + escapeHtml_(result.message) + '</p>';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Piper’s Path — Teacher dashboard</title><style>' +
    '*{box-sizing:border-box}body{font:16px system-ui,sans-serif;background:#f5f7f3;color:#16352c;margin:0;padding:24px}main{max-width:1050px;margin:auto}h1{font-size:clamp(26px,5vw,38px);margin:8px 0}h2{margin-bottom:8px}h3{margin:0;font-size:20px}.eyebrow{font-size:12px;letter-spacing:.12em;font-weight:700}.notice{background:#fff1cb;padding:12px 16px;border-radius:10px;margin:20px 0}.stats,.pupils{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.stats>div,article{background:white;border:1px solid #dce4dd;border-radius:14px;padding:20px}.stats strong{display:block;font-size:32px}.stats span,.muted,dt,footer{color:#52675e}.pupils{grid-template-columns:repeat(2,minmax(0,1fr))}article p{margin-top:5px}dl{margin:20px 0 0}dl>div{display:flex;justify-content:space-between;gap:12px;margin:12px 0}dd{margin:0;font-weight:600}footer{margin-top:28px;font-size:14px;overflow-wrap:anywhere}h1,h3{overflow-wrap:anywhere}@media(max-width:600px){body{padding:16px}.stats{gap:8px}.stats>div{padding:12px 8px}.stats strong{font-size:26px}.stats span{font-size:12px}.pupils{grid-template-columns:1fr}}</style>' +
    '</head><body><main>' + body + '</main></body></html>');
}

function teacherFeedbackControl_() {
  return '<button type="button" id="feedbackOpen">Send feedback</button><p id="feedbackResult" role="status"></p>' +
    '<script>document.getElementById("feedbackOpen").addEventListener("click",function(){const b=this,s=document.getElementById("feedbackResult");b.disabled=true;s.textContent="Preparing feedback…";google.script.run.withSuccessHandler(function(url){s.textContent="";const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Open feedback form";s.appendChild(a);b.disabled=false;}).withFailureHandler(function(){s.textContent="Feedback is not ready. Ask the organisation owner to check setup.";b.disabled=false;}).getFeedbackLink();});</script>';
}
