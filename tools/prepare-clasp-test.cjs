'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const liveScriptId = '1ojO550_ky8cW5rdqqzObTlqRKq1ZkhAa_O3mv6rVyy36z9ZHo2CgJdqH';
const testScriptId = (process.env.TEST_SCRIPT_ID || '').trim();
if (!/^[A-Za-z0-9_-]{20,}$/.test(testScriptId)) {
  throw new Error('Configure APPS_SCRIPT_TEST_ID on the apps-script-test environment.');
}
if (testScriptId === liveScriptId) {
  throw new Error('Refusing to upload to the live Piper’s Path script.');
}
if (testScriptId !== '1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ') {
  throw new Error('Target must be the explicitly approved CONNECTION TEST project.');
}
let auth;
try {
  auth = JSON.parse(process.env.CLASP_AUTH_JSON || '');
} catch {
  throw new Error('CLASP_AUTH_JSON is missing or is not valid JSON.');
}
if (!auth || typeof auth !== 'object' || Array.isArray(auth) || !Object.keys(auth).length) {
  throw new Error('CLASP_AUTH_JSON must contain a clasp login configuration.');
}
fs.writeFileSync(path.join(os.homedir(), '.clasprc.json'), JSON.stringify(auth), {mode: 0o600});
fs.writeFileSync(path.join(__dirname, 'apps-script-probe', '.clasp.json'), JSON.stringify({
  scriptId: testScriptId,
  rootDir: '.',
  scriptExtensions: ['.js', '.gs'],
  htmlExtensions: ['.html'],
  jsonExtensions: ['.json'],
  skipSubdirectories: true
}), {mode: 0o600});
console.log('Test target checked; temporary clasp configuration prepared.');
