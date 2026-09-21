// TEST-only sanitised data adapter for the visitor-executed teacher dashboard.
const ASSISTANT_BOOK_NAME = 'Piper’s Path — ASSISTANT DASHBOARD TEST';
const ASSISTANT_CONFIG_HEADERS = ['Key','Value'];
const ASSISTANT_TEACHER_HEADERS = ['Teacher ID','Email Token','Role','Active'];
const ASSISTANT_PUPIL_HEADERS = ['Pupil ID','Display Name','Active'];
const ASSISTANT_SUMMARY_HEADERS = ['Pupil ID','Session Count','Total Minutes','Last Practice Date'];
const ASSISTANT_TABS = {
  config: 'DASHBOARD CONFIG', teachers: 'DASHBOARD TEACHERS',
  pupils: 'DASHBOARD PUPILS', summary: 'DASHBOARD PRACTICE SUMMARY'
};

function normaliseTeacherEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function assistantEmailToken_(email, secret) {
  const normalised = normaliseTeacherEmail_(email);
  if (!normalised || !secret) throw Error('Assistant email token configuration is missing.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(normalised, secret)).replace(/=+$/,'');
}

function assistantOwner_(requireActive) {
  assertTestProject_();
  const props = PropertiesService.getScriptProperties();
  const owner = normaliseTeacherEmail_(props.getProperty('TEST_OWNER_EMAIL'));
  const effective = normaliseTeacherEmail_(Session.getEffectiveUser().getEmail());
  const active = normaliseTeacherEmail_(Session.getActiveUser().getEmail());
  if (!owner || effective !== owner || (requireActive && active !== owner)) throw Error('Owner sign-in required.');
  return {props, owner};
}

function setupAssistantDashboardTest() {
  const owner = assistantOwner_(true), props = owner.props;
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (!props.getProperty('ASSISTANT_EMAIL_HMAC_SECRET')) {
      props.setProperty('ASSISTANT_EMAIL_HMAC_SECRET', Utilities.getUuid()+Utilities.getUuid());
    }
    let id = props.getProperty('TEST_ASSISTANT_SHEET_ID'), ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
      if (ss.getName() !== ASSISTANT_BOOK_NAME) throw Error('Unexpected Assistant workbook.');
    } else {
      ss = SpreadsheetApp.create(ASSISTANT_BOOK_NAME);
      id = ss.getId();
      props.setProperty('TEST_ASSISTANT_SHEET_ID', id);
      const rootId = props.getProperty('TEST_ROOT_ID');
      if (rootId) DriveApp.getFileById(id).moveTo(DriveApp.getFolderById(rootId));
    }
    const privateBook = SpreadsheetApp.openById(props.getProperty('TEST_SHEET_ID'));
    ss.setSpreadsheetTimeZone(privateBook.getSpreadsheetTimeZone());
    syncAssistantDashboardDataLocked_();
  } finally {lock.releaseLock();}
  installAssistantDashboardTriggers_();
  console.log('Assistant dashboard TEST workbook: https://docs.google.com/spreadsheets/d/'+props.getProperty('TEST_ASSISTANT_SHEET_ID')+'/edit');
}

function syncAssistantDashboardData() {
  assistantOwner_(false);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {return syncAssistantDashboardDataLocked_();}
  finally {lock.releaseLock();}
}

function privateRows_(ss, name) {
  const tab = ss.getSheetByName(name);
  if (!tab) throw Error('Private '+name+' tab is missing.');
  return tab.getDataRange().getValues();
}

function headerIndexes_(rows, required) {
  const headers = rows[0] || [], result = {};
  required.forEach(name => {
    const index = headers.indexOf(name);
    if (index < 0) throw Error('Required private column is missing: '+name);
    result[name] = index;
  });
  return result;
}

function buildAssistantSnapshot_(privateBook, secret) {
  const teacherRows = privateRows_(privateBook, 'TEACHERS');
  const teacherCols = headerIndexes_(teacherRows, ['Teacher ID','Email','Role','Active']);
  const teachers = [ASSISTANT_TEACHER_HEADERS];
  teacherRows.slice(1).forEach(row => {
    const role = String(row[teacherCols.Role] || '').trim().toUpperCase();
    const active = ['true','yes'].includes(String(row[teacherCols.Active]).trim().toLowerCase());
    const email = normaliseTeacherEmail_(row[teacherCols.Email]);
    if (active && email && ['OWNER','TEACHER'].includes(role)) {
      teachers.push([String(row[teacherCols['Teacher ID']]), assistantEmailToken_(email,secret), role, true]);
    }
  });

  const pupilRows = privateRows_(privateBook, 'PUPILS');
  const pupilCols = headerIndexes_(pupilRows, ['Pupil ID','Display Name','Active']);
  const pupils = [ASSISTANT_PUPIL_HEADERS];
  pupilRows.slice(1).forEach(row => {
    if (['true','yes'].includes(String(row[pupilCols.Active]).trim().toLowerCase())) {
      pupils.push([String(row[pupilCols['Pupil ID']]), String(row[pupilCols['Display Name']]), true]);
    }
  });

  const practiceRows = privateRows_(privateBook, 'PRACTICE LOG');
  const pupilModels = pupils.slice(1).map(row => ({id:row[0], label:row[1]}));
  const aggregate = summarisePractice_(pupilModels, practiceRows, privateBook.getSpreadsheetTimeZone());
  const summary = [ASSISTANT_SUMMARY_HEADERS].concat(aggregate.entries.map(row =>
    [row.id, row.sessions, row.minutes, row.latest]));

  const configRows = privateRows_(privateBook, 'ORG CONFIG');
  const config = new Map(configRows.slice(1).map(row => [String(row[0]), String(row[1])]));
  const safeConfig = [ASSISTANT_CONFIG_HEADERS,
    ['Organisation Name', config.get('Organisation Name') || 'Piper’s Path Test Organisation'],
    ['Profile', config.get('Profile') || 'PIPE_SCHOOL'],
    ['Time Zone', config.get('Time Zone') || privateBook.getSpreadsheetTimeZone()]];
  return {teacherRows, config:safeConfig, teachers, pupils, summary};
}

function privateSensitiveValues_(privateBook, teacherRows) {
  const values = [];
  const teacherHeaders = teacherRows[0] || [], emailCol = teacherHeaders.indexOf('Email');
  if (emailCol >= 0) teacherRows.slice(1).forEach(row => values.push(normaliseTeacherEmail_(row[emailCol])));
  ['PUPILS','FEEDBACK TEST PUPILS','PRACTICE LOG'].forEach(name => {
    const tab = privateBook.getSheetByName(name);
    if (!tab) return;
    const rows = tab.getDataRange().getValues(), headers = rows[0] || [];
    headers.forEach((header,index) => {
      if (/access key|feedback key|personal link|drive file link|session id|end time/i.test(String(header))) {
        rows.slice(1).forEach(row => values.push(String(row[index] || '')));
      }
    });
  });
  return values.filter(value => value && value.length >= 4);
}

function validateAssistantSnapshot_(snapshot, privateBook) {
  const expected = {
    config:ASSISTANT_CONFIG_HEADERS, teachers:ASSISTANT_TEACHER_HEADERS,
    pupils:ASSISTANT_PUPIL_HEADERS, summary:ASSISTANT_SUMMARY_HEADERS
  };
  Object.keys(expected).forEach(key => {
    if (JSON.stringify(snapshot[key][0]) !== JSON.stringify(expected[key])) throw Error('Unsafe Assistant schema.');
  });
  const configKeys = snapshot.config.slice(1).map(row => row[0]);
  if (JSON.stringify(configKeys) !== JSON.stringify(['Organisation Name','Profile','Time Zone'])) throw Error('Unsafe Assistant configuration.');
  snapshot.teachers.slice(1).forEach(row => {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(String(row[1]))) throw Error('Invalid Assistant email token.');
  });
  const serialised = JSON.stringify({config:snapshot.config,teachers:snapshot.teachers,pupils:snapshot.pupils,summary:snapshot.summary});
  const forbiddenNames = ['Email','Access Key','Personal Link','Feedback key','Description','Drive File Link','Session ID','End Time'];
  forbiddenNames.forEach(name => {if (serialised.includes('"'+name+'"')) throw Error('Prohibited Assistant column: '+name);});
  if (/https?:\/\//i.test(serialised) || /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(serialised)) throw Error('Prohibited Assistant metadata.');
  privateSensitiveValues_(privateBook,snapshot.teacherRows).forEach(value => {
    if (serialised.includes(JSON.stringify(value).slice(1,-1))) throw Error('Private value reached Assistant data.');
  });
}

function replaceAssistantTab_(ss, name, rows) {
  const tab = ss.getSheetByName(name) || ss.insertSheet(name);
  tab.clearContents();
  tab.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  tab.setFrozenRows(1);
  tab.getRange(1,1,1,rows[0].length).setFontWeight('bold');
  tab.autoResizeColumns(1,rows[0].length);
}

function activePrivateTeacherEmails_(teacherRows) {
  const cols = headerIndexes_(teacherRows,['Email','Role','Active']);
  return teacherRows.slice(1).filter(row =>
    ['OWNER','TEACHER'].includes(String(row[cols.Role]).trim().toUpperCase()) &&
    ['true','yes'].includes(String(row[cols.Active]).trim().toLowerCase()))
    .map(row => normaliseTeacherEmail_(row[cols.Email])).filter(Boolean);
}

function syncAssistantSharing_(assistantId, teacherRows, ownerEmail, recordingsId) {
  const active = new Set(activePrivateTeacherEmails_(teacherRows));
  const file = DriveApp.getFileById(assistantId);
  file.getViewers().forEach(user => {
    const email = normaliseTeacherEmail_(user.getEmail());
    if (email && email !== ownerEmail && !active.has(email)) file.removeViewer(email);
  });
  active.forEach(email => {if (email !== ownerEmail) file.addViewer(email);});
  if (recordingsId) {
    const folder = DriveApp.getFolderById(recordingsId);
    folder.getViewers().forEach(user => {
      const email = normaliseTeacherEmail_(user.getEmail());
      if (email && email !== ownerEmail && !active.has(email)) folder.removeViewer(email);
    });
  }
}

function syncAssistantDashboardDataLocked_() {
  const owner = assistantOwner_(false), props = owner.props;
  props.setProperty('TEST_ASSISTANT_SYNC_STATUS','RUNNING');
  try {
    const privateId = props.getProperty('TEST_SHEET_ID');
    const assistantId = props.getProperty('TEST_ASSISTANT_SHEET_ID');
    const secret = props.getProperty('ASSISTANT_EMAIL_HMAC_SECRET');
    if (!privateId || !assistantId || !secret || privateId === assistantId) throw Error('Assistant dashboard setup is incomplete.');
    const privateBook = SpreadsheetApp.openById(privateId);
    const assistantBook = SpreadsheetApp.openById(assistantId);
    if (assistantBook.getName() !== ASSISTANT_BOOK_NAME) throw Error('Unexpected Assistant workbook.');
    const snapshot = buildAssistantSnapshot_(privateBook,secret);
    validateAssistantSnapshot_(snapshot,privateBook);
    replaceAssistantTab_(assistantBook,ASSISTANT_TABS.config,snapshot.config);
    replaceAssistantTab_(assistantBook,ASSISTANT_TABS.teachers,snapshot.teachers);
    replaceAssistantTab_(assistantBook,ASSISTANT_TABS.pupils,snapshot.pupils);
    replaceAssistantTab_(assistantBook,ASSISTANT_TABS.summary,snapshot.summary);
    const allowed = new Set(Object.values(ASSISTANT_TABS));
    assistantBook.getSheets().forEach(tab => {if (!allowed.has(tab.getName())) assistantBook.deleteSheet(tab);});
    syncAssistantSharing_(assistantId,snapshot.teacherRows,owner.owner,props.getProperty('TEST_RECORDINGS_ID'));
    const now = new Date().toISOString();
    props.setProperty('TEST_ASSISTANT_LAST_SYNC_UTC',now);
    props.setProperty('TEST_ASSISTANT_SYNC_STATUS','OK');
    SpreadsheetApp.flush();
    return {ok:true,syncedUtc:now};
  } catch (error) {
    props.setProperty('TEST_ASSISTANT_SYNC_STATUS','FAILED');
    console.log('Assistant dashboard sync failed.');
    throw error;
  }
}

function installAssistantDashboardTriggers_() {
  assistantOwner_(true);
  const props = PropertiesService.getScriptProperties();
  const existing = new Set(ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction()));
  if (!existing.has('assistantDashboardPrivateEdit')) {
    ScriptApp.newTrigger('assistantDashboardPrivateEdit').forSpreadsheet(props.getProperty('TEST_SHEET_ID')).onEdit().create();
  }
  if (!existing.has('dailyAssistantDashboardSync')) {
    ScriptApp.newTrigger('dailyAssistantDashboardSync').timeBased().everyDays(1).atHour(3).create();
  }
}

function assistantDashboardPrivateEdit(e) {
  const props = PropertiesService.getScriptProperties();
  if (!e || !e.source || e.source.getId() !== props.getProperty('TEST_SHEET_ID') || !e.range) return;
  if (['TEACHERS','PUPILS','PRACTICE LOG','ORG CONFIG'].includes(e.range.getSheet().getName())) syncAssistantDashboardData();
}

function dailyAssistantDashboardSync() {return syncAssistantDashboardData();}

function findAllowedAssistantTeacher_(email, rows, secret) {
  if (JSON.stringify(rows[0] || []) !== JSON.stringify(ASSISTANT_TEACHER_HEADERS)) return null;
  const token = assistantEmailToken_(email,secret);
  const matches = rows.slice(1).filter(row => String(row[1]) === token);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (!['OWNER','TEACHER'].includes(String(row[2]).trim().toUpperCase()) ||
      !['true','yes'].includes(String(row[3]).trim().toLowerCase())) return null;
  return {id:String(row[0]), token, role:String(row[2]).trim().toUpperCase()};
}

function normaliseAssistantSummaryDate_(value, timeZone) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  }
  if (typeof value === 'string') return value.trim();
  return value === '' || value == null ? '' : null;
}

function readAssistantSummary_(pupils, rows, timeZone) {
  if (JSON.stringify(rows[0] || []) !== JSON.stringify(ASSISTANT_SUMMARY_HEADERS)) throw Error('Assistant summary headers missing.');
  const byId = new Map(rows.slice(1).map(row => [String(row[0]),row]));
  const entries = pupils.map(pupil => {
    const row = byId.get(pupil.id) || [pupil.id,0,0,''];
    const sessions = Number(row[1]), minutes = Number(row[2]), latest = normaliseAssistantSummaryDate_(row[3], timeZone);
    if (!Number.isFinite(sessions) || sessions < 0 || !Number.isInteger(sessions) || !Number.isFinite(minutes) || minutes < 0 ||
        latest === null || (latest && !/^\d{4}-\d{2}-\d{2}$/.test(latest))) throw Error('Invalid Assistant summary.');
    return {id:pupil.id,label:pupil.label,sessions,minutes,latest};
  });
  return {entries,skipped:0,sessions:entries.reduce((n,p)=>n+p.sessions,0),minutes:entries.reduce((n,p)=>n+p.minutes,0)};
}
