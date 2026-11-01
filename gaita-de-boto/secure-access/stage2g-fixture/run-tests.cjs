'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const network={attempts:0};
const deny=()=>{network.attempts++;throw Error('External network/listener forbidden in Stage 2G tests.');};
for(const [name,methods]of [['node:http',['request','get','createServer']],['node:https',['request','get','createServer']],['node:net',['connect','createConnection','createServer']],['node:tls',['connect','createServer']]]){const m=require(name);for(const method of methods)m[method]=deny;}
globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny();}};
const support=require('./test-support.cjs'),{offlinePool}=require('./pg-offline-pool.cjs');
const transcript=[],records=[];const cases=[],stage2i=process.argv.includes('--stage2i');let audit=null;
function test(name,options,run){if(typeof options==='function'){run=options;options={};}if(cases.some(t=>t.name===name))throw Error('Duplicate named case.');cases.push({name,options,run});}
for(const file of ['crypto-profile.test.cjs','source.test.cjs','postgres.test.cjs','reads.test.cjs'])require('./'+file)(test);
if(stage2i){audit=require('../stage2i-fixture/security-audit.test.cjs');audit(test);require('../stage2i-fixture/corrections.test.cjs')(test);}
const output=process.argv.find(x=>x.startsWith('--record='))?.slice(9);
if(output&&!/^[a-z0-9-]+$/.test(output))throw Error('Invalid evidence filename.');
const log=output?path.join(__dirname,'diagnostics',output+'.txt'):null;
if(log){fs.mkdirSync(path.dirname(log),{recursive:true});if(fs.existsSync(log))throw Error('Evidence already exists; never overwrite a prior run.');}
function write(s){transcript.push(s);if(log)fs.appendFileSync(log+'.stream',s+'\n');process.stdout.write(s+'\n');}
process.exitCode=1;
(async()=>{
 let passed=0,failed=0,skipped=0,blocked=0,unexecuted=0,filtered=0,pgDirectory=null,engine=null,pgVersion=null;
 const filter=process.env.GDB_STAGE2G_FILTER||'';
 const control={get pool(){return engine.pool;},async reopen(){await engine.close();engine=await offlinePool(pgDirectory);}};
 write((stage2i?'Stage 2I':'Stage 2G')+' local offline verification — '+new Date().toISOString());
 write('Node '+process.version+'; '+process.platform+'/'+process.arch+'; Google calls mocked; no native PostgreSQL.');
 try{
  for(const t of cases){
   if(filter&&!t.name.includes(filter)){unexecuted++;filtered++;records.push({name:t.name,status:'unexecuted'});continue;}
   if(t.options.blocked){blocked++;unexecuted++;records.push({name:t.name,status:'blocked',reason:t.options.blocked});write('BLOCKED '+t.name+' — '+t.options.blocked);continue;}
   if(t.options.skip){skipped++;records.push({name:t.name,status:'skipped',reason:t.options.skip});write('SKIP '+t.name+' — '+t.options.skip);continue;}
   let f=null;
   try{
    if(t.options.pg&&!engine){pgDirectory=support.directory();engine=await offlinePool(pgDirectory);pgVersion=(await engine.pool.query('SELECT version() AS version')).rows[0].version;write('PostgreSQL WASM engine: '+pgVersion+'; PGlite pinned 0.5.13; serialised one-connection facade.');}
    if(t.options.source||t.options.pg)f=await support.fixture({pool:t.options.pg?engine.pool:null,seconds:t.options.seconds||1});
    const detail=await t.run(f,{pg:control});if(detail!==undefined)write('EVIDENCE '+t.name+' '+JSON.stringify(detail));passed++;records.push({name:t.name,status:'passed',...(detail!==undefined?{detail}:{})});write('PASS '+t.name);
   }catch(e){failed++;records.push({name:t.name,status:'failed',error:e.message});write('FAIL '+t.name+' — '+e.message+'\n'+e.stack);}
   finally{if(f)f.close();}
  }
 }finally{
  if(engine)await engine.close();if(pgDirectory)support.remove(pgDirectory);support.cleanupAll();if(audit)audit.cleanup();
 }
 const own=audit?.resources()||{created:0,removed:0,remaining:0},base=support.counts(),cleanup={created:base.created+own.created,removed:base.removed+own.removed,remaining:base.remaining+own.remaining};assert.equal(cleanup.remaining,0);assert.equal(cleanup.created,cleanup.removed);
 const summary={suite:stage2i?'stage2i-security-corrections':'stage2g-offline-adapters',registered:cases.length,executed:passed+failed,passed,failed,skipped,blocked,unexecuted,filtered,
  environment:{node:process.version,pglite:'0.5.13',postgresWasm:pgVersion,nativePostgres:false,serialisedPool:true},externalNetworkAttempts:network.attempts,
  temporaryDirectoriesCreated:cleanup.created,temporaryDirectoriesRemoved:cleanup.removed,remainingTemporaryDirectories:cleanup.remaining,
  liveGoogleRecordingTests:0,ciRuns:0};
 assert.equal(records.length,cases.length);for(const [status,count]of [['passed',passed],['failed',failed],['skipped',skipped],['blocked',blocked]])assert.equal(records.filter(r=>r.status===status).length,count);
 write(JSON.stringify(summary));if(log){fs.writeFileSync(log,transcript.join('\n')+'\n',{flag:'wx'});const result=JSON.stringify({summary,results:records},null,2)+'\n';fs.writeFileSync(log+'.json.tmp',result);fs.renameSync(log+'.json.tmp',log+'.json');}
 if(!failed&&!filtered&&!network.attempts)process.exitCode=0;
})().catch(e=>{write('INCOMPLETE VERIFICATION — '+e.stack);if(log&&!fs.existsSync(log))fs.writeFileSync(log,transcript.join('\n')+'\n',{flag:'wx'});process.exitCode=1;});
