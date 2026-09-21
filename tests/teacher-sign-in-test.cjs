'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync('tools/apps-script-probe/AssistantDashboard.js', 'utf8')+'\n'+
  fs.readFileSync('tools/apps-script-probe/Code.js', 'utf8');
const approved = '1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ';
function scenario(options = {}) {
  let pupilReads = 0;
  const secret = 'assistant-secret';
  const token = email => crypto.createHmac('sha256',secret).update(email).digest('base64url');
  const values = {
    'DASHBOARD TEACHERS': [['Teacher ID','Email Token','Role','Active'], ['T1',token('teacher@example.test'),'TEACHER',true], ['T2',token('owner@example.test'),'OWNER',true]],
    'DASHBOARD CONFIG': [['Key','Value'], ['Organisation Name','<School>'], ['Profile','PIPE_SCHOOL'], ['Time Zone','Europe/Madrid']],
    'DASHBOARD PRACTICE SUMMARY': [['Pupil ID','Session Count','Total Minutes','Last Practice Date'], ['TEST001',1,6,'2026-09-18']],
    'DASHBOARD PUPILS': [['Pupil ID','Display Name','Active'], ['TEST001','<img src=x>',true]]
  };
  if (options.inactive) values['DASHBOARD TEACHERS'][1][3] = false;
  if (options.duplicate) values['DASHBOARD TEACHERS'].push(values['DASHBOARD TEACHERS'][1]);
  const props = {TEST_READY:options.notReady?'':'1',TEST_ASSISTANT_SYNC_STATUS:options.notReady?'':'OK',
    TEST_ASSISTANT_SHEET_ID:'assistant-sheet',TEST_SHEET_ID:'private-sheet',TEST_RECORDINGS_ID:'dummy-folder',ASSISTANT_EMAIL_HMAC_SECRET:secret};
  const c = {
    ScriptApp: {getScriptId: () => options.wrongProject ? 'wrong' : approved},
    Session: {
      getActiveUser: () => ({getEmail: () => options.email ?? 'teacher@example.test'}),
      getEffectiveUser: () => ({getEmail: () => options.effective ?? options.email ?? 'teacher@example.test'})
    },
    PropertiesService: {getScriptProperties: () => ({getProperty:key=>props[key],setProperty:(key,value)=>{props[key]=value;}})},
    SpreadsheetApp: {openById: id => {
      if (id === 'private-sheet') return {getUrl: () => 'https://docs.google.com/spreadsheets/d/private-sheet/edit'};
      if (options.noSheetAccess) throw Error('forbidden');
      return {getName:()=> 'Piper’s Path — ASSISTANT DASHBOARD TEST',getSpreadsheetTimeZone: () => 'Europe/Madrid', getSheetByName: name => {
        if (name === 'DASHBOARD PUPILS') pupilReads++;
        return {getDataRange: () => ({getValues: () => values[name]})};
      }};
    }},
    DriveApp: {getFolderById: () => {
      if (options.noFolderAccess) throw Error('forbidden');
      return {getName: () => 'TEST Recordings'};
    }},
    HtmlService: {createHtmlOutput: html => html},
    Utilities:{computeHmacSha256Signature:(value,key)=>crypto.createHmac('sha256',key).update(value).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url')}
  };
  vm.createContext(c); vm.runInContext(source, c);
  return {c, reads: () => pupilReads};
}
for (const options of [{email: ''}, {effective: 'owner@example.test'}, {notReady: true},
  {noSheetAccess: true}, {email: 'outsider@example.test'}, {inactive: true}, {duplicate: true}]) {
  const s = scenario(options);
  assert.equal(s.c.teacherDiagnostic_().ok, false);
  assert.equal(s.reads(), 0, 'Denied requests must not read pupil rows');
}
const good = scenario();
assert.equal(good.c.teacherDiagnostic_().ok, true);
assert.equal(good.c.teacherDiagnostic_().pupils.length, 1);
assert.equal(good.c.teacherDiagnostic_().folderReadable, true);
assert.equal(scenario({noFolderAccess: true}).c.teacherDiagnostic_().folderReadable, false);
const html = good.c.doGet();
assert(html.includes('ASSISTANT TEACHER'));
assert(!html.includes('Open organisation data'));
assert(!html.includes('private-sheet'));
const ownerDashboard = scenario({email:'owner@example.test'});
assert.equal(ownerDashboard.c.teacherDiagnostic_().role,'OWNER');
const ownerHtml = ownerDashboard.c.doGet();
assert(ownerHtml.includes('OWNER'));
assert(ownerHtml.includes('Open organisation data'));
assert(ownerHtml.includes('https://docs.google.com/spreadsheets/d/private-sheet/edit'));
assert(html.includes('&lt;img src=x&gt;'));
assert(!html.includes('<img src=x>'));
const wrong = scenario({wrongProject: true});
assert.throws(() => wrong.c.setupTestEnvironment(), /approved/);
const nonOwner = scenario();
nonOwner.c.DriveApp.getFileById = () => ({getOwner: () => ({getEmail: () => 'owner@example.test'})});
assert.throws(() => nonOwner.c.setupTestEnvironment(), /Only the script file owner/);
const setupOwner = scenario();
setupOwner.c.DriveApp.getFileById = () => ({getOwner: () => ({getEmail: () => 'teacher@example.test'})});
setupOwner.c.LockService = {getScriptLock: () => {throw Error('Reached authorised setup');}};
assert.throws(() => setupOwner.c.setupTestEnvironment(), /Reached authorised setup/);
assert.throws(() => wrong.c.setupTestEnvironment_(), /approved/);
assert.throws(() => wrong.c.teacherDiagnostic_(), /approved/);
let created = 0, written = 0;
const existing = {getLastRow: () => 3};
good.c.seedTestTab_({getSheetByName: () => existing, insertSheet: () => {created++;}}, 'PUPILS', [['ID']]);
assert.equal(created, 0);
const blank = {getLastRow: () => 0, getRange: () => ({setValues: () => {written++;}, setFontWeight: () => {}}),setFrozenRows: () => {},autoResizeColumns: () => {}};
good.c.seedTestTab_({getSheetByName: () => blank}, 'PUPILS', [['ID'], ['TEST001']]);
assert.equal(written, 1);
console.log('PASS: identity, allowlist, file access, project guard, HTML escaping and non-overwriting seed checks.');

const summary = good.c.summarisePractice_([{id:'A', label:'A'}, {id:'B', label:'B'}],
  [['Pupil ID','Date','Duration (min)'], ['A','2026-09-18',6], ['A','2026-09-19','3.5'],
   ['A','2026-02-30',4], ['A','2026-09-19',-1], ['A','2026-09-19',''],
   ['OTHER','2026-09-19',100]], 'Europe/Madrid');
assert.equal(summary.sessions, 2);
assert.equal(summary.minutes, 9.5);
assert.equal(summary.skipped, 3);
assert.equal(summary.entries[0].latest, '2026-09-19');
assert.equal(summary.entries[1].sessions, 0);
assert.throws(() => good.c.summarisePractice_([], [['Unexpected']], 'Europe/Madrid'), /headers/);
assert(html.includes('&lt;School&gt;'));
assert(html.includes('Practice overview'));
assert(!scenario({inactive:true}).c.doGet().includes('Practice overview'));
assert(good.c.doGet({parameter:{diagnostic:'ping'}}).includes('DIAGNOSTIC 2'));
console.log('PASS: dashboard totals, invalid rows, inactive pupils, empty history and escaped organisation name.');
