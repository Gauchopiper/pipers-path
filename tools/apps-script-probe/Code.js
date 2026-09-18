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
  if (!email) throw new Error('Sign in as the test project owner.');
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
  return {ok: true, email, pupils, folderReadable};
}

function doGet() {
  let result;
  try { result = teacherDiagnostic_(); }
  catch (_) { result = {ok: false, message: 'The test could not complete. Ask the owner to check setup and permissions.'}; }
  const body = result.ok
    ? '<p>Signed in: ' + escapeHtml_(result.email) + '</p><p>Teacher access: passed</p>' +
      '<p>Test recording folder: ' + (result.folderReadable ? 'readable' : 'permission required') + '</p>' +
      '<ul>' + result.pupils.map(p => '<li>' + escapeHtml_(p.id) + ' — ' + escapeHtml_(p.label) + '</li>').join('') + '</ul>'
    : '<p>' + escapeHtml_(result.message) + '</p>';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Piper’s Path — sign-in test</title><style>body{font:18px system-ui;max-width:650px;margin:40px auto;padding:20px;color:#16352c}li{padding:8px}small{color:#666}</style>' +
    '</head><body><h1>Piper’s Path</h1><p>Teacher sign-in test · DUMMY DATA ONLY</p>' + body +
    '<small>No recording, upload or review actions are available in this test.</small></body></html>');
}
