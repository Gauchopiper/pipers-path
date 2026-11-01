'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const network={attempts:0};
const deny=()=>{network.attempts++;throw Error('External network/listener forbidden in Stage 2G tests.');};
for(const [name,methods]of [['node:http',['request','get','createServer']],['node:https',['request','get','createServer']],['node:net',['connect','createConnection','createServer']],['node:tls',['connect','createServer']]]){const m=require(name);for(const method of methods)m[method]=deny;}
globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny();}};
const support=require('./test-support.cjs'),{offlinePool}=require('./pg-offline-pool.cjs');
const cases=[];
function test(name,options,run){if(typeof options==='function'){run=options;options={};}if(cases.some(t=>t.name===name))throw Error('Duplicate named case.');cases.push({name,options,run});}
for(const file of ['crypto-profile.test.cjs','source.test.cjs','postgres.test.cjs','reads.test.cjs'])require('./'+file)(test);
const output=process.argv.find(x=>x.startsWith('--record='))?.slice(9);
if(output&&!/^[a-z0-9-]+$/.test(output))throw Error('Invalid evidence filename.');
const log=output?path.join(__dirname,'diagnostics',output+'.txt'):null;
if(log){fs.mkdirSync(path.dirname(log),{recursive:true});if(fs.existsSync(log))throw Error('Evidence already exists; never overwrite a prior run.');}
function write(s){if(log)fs.appendFileSync(log,s+'\n');process.stdout.write(s+'\n');}
process.exitCode=1;
(async()=>{
 let passed=0,failed=0,skipped=0,unexecuted=0,pgDirectory=null,engine=null,pgVersion=null;
 const filter=process.env.GDB_STAGE2G_FILTER||'';
 const control={get pool(){return engine.pool;},async reopen(){await engine.close();engine=await offlinePool(pgDirectory);}};
 write('Stage 2G local offline verification — '+new Date().toISOString());
 write('Node '+process.version+'; '+process.platform+'/'+process.arch+'; Google calls mocked; no native PostgreSQL.');
 try{
  for(const t of cases){
   if(filter&&!t.name.includes(filter)){unexecuted++;continue;}
   if(t.options.skip){skipped++;write('SKIP '+t.name+' — '+t.options.skip);continue;}
   let f=null;
   try{
    if(t.options.pg&&!engine){pgDirectory=support.directory();engine=await offlinePool(pgDirectory);pgVersion=(await engine.pool.query('SELECT version() AS version')).rows[0].version;write('PostgreSQL WASM engine: '+pgVersion+'; PGlite pinned 0.5.13; serialised one-connection facade.');}
    if(t.options.source||t.options.pg)f=await support.fixture({pool:t.options.pg?engine.pool:null,seconds:t.options.seconds||1});
    await t.run(f,{pg:control});passed++;write('PASS '+t.name);
   }catch(e){failed++;write('FAIL '+t.name+' — '+e.message+'\n'+e.stack);}
   finally{if(f)f.close();}
  }
 }finally{
  if(engine)await engine.close();if(pgDirectory)support.remove(pgDirectory);support.cleanupAll();
 }
 const cleanup=support.counts();assert.equal(cleanup.remaining,0);assert.equal(cleanup.created,cleanup.removed);
 const summary={suite:'stage2g-offline-adapters',registered:cases.length,passed,failed,skipped,unexecuted,
  environment:{node:process.version,pglite:'0.5.13',postgresWasm:pgVersion,nativePostgres:false,serialisedPool:true},externalNetworkAttempts:network.attempts,
  temporaryDirectoriesCreated:cleanup.created,temporaryDirectoriesRemoved:cleanup.removed,remainingTemporaryDirectories:cleanup.remaining,
  liveGoogleRecordingTests:0,ciRuns:0};
 write(JSON.stringify(summary));if(!failed&&!unexecuted&&!network.attempts)process.exitCode=0;
})().catch(e=>{write('INCOMPLETE VERIFICATION — '+e.stack);process.exitCode=1;});
