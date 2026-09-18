'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('tools/apps-script-probe/Code.js', 'utf8');
const approved = '1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ';
function scenario(options = {}) {
  let pupilReads = 0;
  const values = {
    TEACHERS: [['ID', 'Email', 'Role', 'Active'], ['T1', 'teacher@example.test', 'TEACHER', true]],
    PUPILS: [['ID', 'Name', 'Active', 'Lang'], ['TEST001', '<img src=x>', true, 'EN']]
  };
  if (options.inactive) values.TEACHERS[1][3] = false;
  if (options.duplicate) values.TEACHERS.push(values.TEACHERS[1]);
  const c = {
    ScriptApp: {getScriptId: () => options.wrongProject ? 'wrong' : approved},
    Session: {
      getActiveUser: () => ({getEmail: () => options.email ?? 'teacher@example.test'}),
      getEffectiveUser: () => ({getEmail: () => options.effective ?? options.email ?? 'teacher@example.test'})
    },
    PropertiesService: {getScriptProperties: () => ({getProperty: key =>
      ({TEST_READY: options.notReady ? '' : '1', TEST_SHEET_ID: 'dummy-sheet', TEST_RECORDINGS_ID: 'dummy-folder'})[key]})},
    SpreadsheetApp: {openById: () => {
      if (options.noSheetAccess) throw Error('forbidden');
      return {getSheetByName: name => {
        if (name === 'PUPILS') pupilReads++;
        return {getDataRange: () => ({getValues: () => values[name]})};
      }};
    }},
    DriveApp: {getFolderById: () => {
      if (options.noFolderAccess) throw Error('forbidden');
      return {getName: () => 'TEST Recordings'};
    }},
    HtmlService: {createHtmlOutput: html => html}
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
assert(html.includes('&lt;img src=x&gt;'));
assert(!html.includes('<img src=x>'));
const wrong = scenario({wrongProject: true});
assert.throws(() => wrong.c.setupTestEnvironment(), /approved/);
const nonOwner = scenario();
nonOwner.c.DriveApp.getFileById = () => ({getOwner: () => ({getEmail: () => 'owner@example.test'})});
assert.throws(() => nonOwner.c.setupTestEnvironment(), /Only the script file owner/);
const owner = scenario();
owner.c.DriveApp.getFileById = () => ({getOwner: () => ({getEmail: () => 'teacher@example.test'})});
owner.c.LockService = {getScriptLock: () => {throw Error('Reached authorised setup');}};
assert.throws(() => owner.c.setupTestEnvironment(), /Reached authorised setup/);
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
