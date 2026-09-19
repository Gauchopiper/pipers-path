const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const base='tools/apps-script-probe/';
class Tab {
 constructor(rows=[]){this.rows=rows;}
 getLastRow(){return this.rows.length;}
 appendRow(row){this.rows.push([...row]);}
 setFrozenRows(){}
 getDataRange(){return {getValues:()=>this.rows.map(r=>[...r])};}
 getRange(r,c,n,m){return {getValues:()=>this.rows.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+m)),setValues:values=>values.forEach((row,i)=>row.forEach((v,j)=>this.rows[r-1+i][c-1+j]=v))};}
}
const tabs={PUPILS:new Tab([['ID','Name','Active'],['TEST001','Secret full name',true]]),TEACHERS:new Tab([['ID','Email','Role','Active'],['T1','teacher@example.test','TEACHER',true]]),'FEEDBACK TEST PUPILS':new Tab([['ID','Key'],['TEST001','private-key']])};
const centralTabs={};
const book=t=>({getSheetByName:n=>t[n],insertSheet:n=>(t[n]=new Tab())});
const props={TEST_SHEET_ID:'local',FEEDBACK_ORG_ID:'org-a',FEEDBACK_CENTRAL_SHEET_ID:'central',FEEDBACK_SECRET:'secret',TEST_OWNER_EMAIL:'owner@example.test',FEEDBACK_WEB_APP_URL:'https://script.google.com/macros/s/test/exec'};
let active='owner@example.test', effective=active, outage=false, locked=false;
const c={console,Date,Map,JSON,Number,String,Error,Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},ScriptApp:{getScriptId:()=> '1LJNfJzCwrVsIiaXB2Amxrkd8els6Nd_t3gK7AwyRfus8dzOgmsHTvuDJ'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},SpreadsheetApp:{openById:id=>{if(id==='central'&&outage)throw Error('offline');return book(id==='central'?centralTabs:tabs)},flush(){}},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true;},releaseLock(){locked=false;}})},Utilities:{base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),base64DecodeWebSafe:v=>Buffer.from(v,'base64url'),newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString()}),computeHmacSha256Signature:(v,key)=>crypto.createHmac('sha256',key).update(v).digest()}};
vm.createContext(c);vm.runInContext(fs.readFileSync(base+'Code.js','utf8')+'\n'+fs.readFileSync(base+'Feedback.js','utf8'),c);
const input=(category='broken')=>({requestId:crypto.randomUUID(),pupilId:'TEST001',accessKey:'private-key',category,description:'Secret full name = spreadsheet issue',explanation:'personal detail',page:'record',browser:'Chrome'});
const a=input(), saved=c.submitFeedback(a);
assert.equal(saved.central,'SENT');assert.equal(tabs['TEST FEEDBACK'].rows.length,2);assert.equal(centralTabs['TEST FEEDBACK'].rows.length,2);
assert.equal(tabs['TEST FEEDBACK'].rows[1][0],centralTabs['TEST FEEDBACK'].rows[1][0]);
const centralJSON=JSON.stringify(centralTabs);for(const forbidden of ['Secret full name','personal detail','private-key','TEST001','teacher@example.test'])assert(!centralJSON.includes(forbidden));
c.submitFeedback(a);assert.equal(tabs['TEST FEEDBACK'].rows.length,2);assert.equal(centralTabs['TEST FEEDBACK'].rows.length,2);
const suggestion=input('suggestion');suggestion.description='=IMPORTXML("example")';c.submitFeedback(suggestion);assert(tabs['TEST FEEDBACK'].rows[2][6].startsWith("'="));
outage=true;const pending=c.submitFeedback(input('confusing'));assert.equal(pending.central,'PENDING');assert.equal(tabs['TEST FEEDBACK'].rows.length,4);
const retryLogs=[];c.console={log:message=>retryLogs.push(message)};
c.retryFeedbackDelivery();
assert(retryLogs.some(s=>s.includes('opening central workbook: Service operation failed')));
assert(retryLogs.some(s=>s.includes('still pending 1')));
for(const secret of ['Secret full name','personal detail','private-key','teacher@example.test'])assert(!retryLogs.join(' ').includes(secret));
assert.equal(tabs['TEST FEEDBACK'].rows[3][12],'PENDING');
c.console=console;
outage=false;c.retryFeedbackDelivery();assert.equal(tabs['TEST FEEDBACK'].rows[3][12],'SENT');assert.equal(centralTabs['TEST FEEDBACK'].rows.length,4);
// Simulate central success but local acknowledgement lost.
tabs['TEST FEEDBACK'].rows[3][12]='PENDING';c.retryFeedbackDelivery();assert.equal(centralTabs['TEST FEEDBACK'].rows.length,4);
assert.throws(()=>c.submitFeedback({...input(),accessKey:'wrong'}),/authorised/);
assert.throws(()=>c.submitFeedback({...input(),description:''}),/description/);
assert.throws(()=>c.submitFeedback({...input(),category:'unknown'}),/category/);
assert.throws(()=>c.submitFeedback({...input(),screenshot:'base64'}),/Screenshots/);
tabs.PUPILS.rows[1][2]=false;assert.throws(()=>c.submitFeedback(input()),/authorised/);tabs.PUPILS.rows[1][2]=true;
active=effective='teacher@example.test';const link=c.getFeedbackLink();const ticket=new URLSearchParams(link.split('#')[1]).get('ticket');
effective='owner@example.test';const teacher=c.submitFeedback({...input(),ticket});assert.equal(tabs['TEST FEEDBACK'].rows.at(-1)[2],'teacher');
tabs.TEACHERS.rows[1][3]=false;assert.throws(()=>c.submitFeedback({...input(),ticket}),/denied/);tabs.TEACHERS.rows[1][3]=true;
assert.throws(()=>c.submitFeedback({...input(),ticket:ticket+'x'}),/Invalid teacher/);
assert.throws(()=>c.setupTestEnvironment(),/owner/);assert.throws(()=>c.setupFeedbackTest(),/Owner/);assert.throws(()=>c.retryFeedbackDelivery(),/Owner/);
// Every original pupil inline script is unchanged; only the optional external feedback hooks are added.
const html=fs.readFileSync('index.html','utf8');const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const hash=crypto.createHash('sha256').update(inline).digest('hex');
assert.equal(hash,fs.readFileSync('tests/pupil-inline.sha256','utf8').trim());
for(const view of ['recordView','pathView','groupView'])assert(html.includes('data-view="'+view+'"'));
console.log('PASS dual copies, privacy allowlist, references, duplicate retries, failure recovery, pupil/teacher auth, revocation, formula escaping, input validation and unchanged pupil handlers.');
// Central receiver accepts authenticated minimal records, rejects tampering and extra fields.
let response;
const receiver={...c,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>({CENTRAL_SHEET_ID:'central','ORG_SECRET_org-a':'transport-secret'})[k]})},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}};
vm.createContext(receiver);vm.runInContext(fs.readFileSync('tools/feedback-central/Code.js','utf8'),receiver);
const envelope=row=>{const body=JSON.stringify({org:'org-a',sentAt:Date.now(),row});return {postData:{contents:JSON.stringify({body,signature:c.Utilities.base64EncodeWebSafe(c.Utilities.computeHmacSha256Signature(body,'transport-secret'))})}}};
const row=centralTabs['TEST FEEDBACK'].rows[1];const count=centralTabs['TEST FEEDBACK'].rows.length;
assert.equal(receiver.doPost(envelope(row)).ok,true);assert.equal(centralTabs['TEST FEEDBACK'].rows.length,count);
assert.equal(receiver.doPost(envelope([...row,'Personal info'])).ok,false);
const tamper=envelope(row);tamper.postData.contents=tamper.postData.contents.replace('org-a','org-b');assert.equal(receiver.doPost(tamper).ok,false);
console.log('PASS central receiver signature, strict schema and deduplication.');
const ticketFor=claim=>{const payload=c.Utilities.base64EncodeWebSafe(JSON.stringify(claim));return payload+'.'+c.feedbackMac_(payload,'secret')};
assert.throws(()=>c.submitFeedback({...input(),ticket:ticketFor({email:'teacher@example.test',org:'org-a',expires:Date.now()-1})}),/expired/);
assert.throws(()=>c.submitFeedback({...input(),ticket:ticketFor({email:'teacher@example.test',org:'other-org',expires:Date.now()+10000})}),/expired/);
active='';assert.throws(()=>c.setupTestEnvironment(),/owner/);assert.throws(()=>c.setupFeedbackTest(),/Owner/);
props.FEEDBACK_CENTRAL_URL='https://script.google.com/macros/s/central/exec';props.FEEDBACK_CENTRAL_SECRET='transport-secret';
c.UrlFetchApp={fetch:(url,options)=>{const ack=receiver.doPost({postData:{contents:options.payload}});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(ack)}}};
const remote=c.submitFeedback(input());assert.equal(remote.central,'SENT');
console.log('PASS expired/cross-organisation tickets, anonymous setup denial and signed remote delivery.');

// Apps Script requires unique base names across script and HTML files.
const sourceNames=fs.readdirSync(base).filter(n=>/\.(js|gs|html)$/.test(n)).map(n=>n.replace(/\.[^.]+$/, '').toLowerCase());
assert.equal(new Set(sourceNames).size, sourceNames.length, 'Apps Script file base names must be unique');
assert(fs.existsSync(base+'FeedbackForm.html'));
console.log('PASS Apps Script file-name compatibility.');
