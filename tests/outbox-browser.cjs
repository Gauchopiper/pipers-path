'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname === '/harness') {
    res.setHeader('Content-Type','text/html');
    return res.end('<main></main><script src="/assets/js/local-outbox.js"></script><script src="/assets/js/recording-outbox.js"></script><script src="/assets/js/text-outbox.js"></script>');
  }
  const name = path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!name.startsWith(root+path.sep)) {res.writeHead(403); return res.end();}
  try {res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':'application/octet-stream'); res.end(fs.readFileSync(name));} catch {res.writeHead(404);res.end();}
});
let context, profile, base, passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
async function harness() {const p=await context.newPage();await p.goto(base+'/harness');return p;}
async function setup(page, {org='org-a',actor='pupil-a',kind='audio',mode='ok',scope=''}={}) {
  await page.evaluate(async args=>{
    const O=PipersOutbox;
    window.scope=await O.scopeKey([args.scope||'installation',args.org,args.actor]);
    window.store=await new O.Store(scope).open();
    window.serverRows=window.serverRows||new Map();window.sent=0;window.reads=0;window.mode=args.mode;window.statuses=[];
    window.adapter={idempotentText:true,
      async send(item){sent++;if(mode==='fail')throw Error('offline');if(mode==='reject')return {ok:false};
        if(!serverRows.has(item.id))serverRows.set(item.id,{saved:true,state:'saved',fileUrl:'https://example.test/file/'+item.id,ok:true,reference:'F-'+item.id});
        if(mode==='unreadable')throw Error('Unreadable reply');return serverRows.get(item.id);},
      async reconcile(item){reads++;if(mode==='unreachable')throw Error('unreachable');return serverRows.get(item.id)||{state:mode==='legacy'?'unknown':'absent',retrySafe:mode!=='legacy'};},
      confirm(item,ack){return !!(ack&&ack.ok&&(item.kind==='audio'?ack.fileUrl:ack.reference==='F-'+item.id));},
      async finalize(){return mode!=='target-fail';}
    };
    window.queue=new O.Queue(store,adapter,(_,s)=>statuses.push(s));
    window.kind=args.kind;
  },{org,actor,kind,mode,scope});
}
async function add(page){return page.evaluate(async()=>{const x=await queue.add(kind,kind==='audio'?{blob:new Blob(['test audio'],{type:'audio/webm'}),targetId:'target-a'}:{description:'A comment',explanation:'More detail'});return x.id;});}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'pipers-outbox-test-'));
  const options={headless:true,executablePath:process.env.PIPERS_CHROMIUM_PATH||undefined,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']};
  context=await chromium.launchPersistentContext(profile,options);
  await check('normal audio saves once; local copy removed only after acknowledgement',async()=>{
    const p=await harness();await setup(p);await add(p);await p.evaluate(()=>queue.drain());
    assert.deepEqual(await p.evaluate(async()=>[sent,serverRows.size,(await store.list()).length,statuses.includes('saved')]),[1,1,0,true]);await p.close();
  });
  await check('failed upload remains durable and read-back runs before controlled retry',async()=>{
    const p=await harness();await setup(p,{mode:'fail'});const id=await add(p);await p.evaluate(()=>queue.drain());
    assert.equal(await p.evaluate(async()=>(await store.list())[0].id),id);
    await p.evaluate(async()=>{mode='ok';await queue.drain(true);queue.stop();});
    assert.deepEqual(await p.evaluate(async()=>[sent,reads,serverRows.size,(await store.list()).length]),[2,2,1,0]);await p.close();
  });
  await check('server saves but response unreadable: read-back confirms, no re-upload',async()=>{
    const p=await harness();await setup(p,{mode:'unreadable'});await add(p);await p.evaluate(()=>queue.drain());
    assert.deepEqual(await p.evaluate(async()=>[sent,reads,serverRows.size,(await store.list()).length]),[1,1,1,0]);await p.close();
  });
  await check('legacy read-back absence never permits an audio retry',async()=>{
    const p=await harness();await setup(p,{mode:'fail'});await add(p);await p.evaluate(()=>queue.drain());
    await p.evaluate(async()=>{mode='legacy';await queue.drain(true);queue.stop();});
    assert.deepEqual(await p.evaluate(async()=>[sent,(await store.list()).length]),[1,1]);await p.close();
  });
  await check('refresh preserves audio Blob, ID and ambiguous state',async()=>{
    const p=await harness();await setup(p,{org:'refresh',mode:'fail'});const id=await add(p);await p.evaluate(async()=>{await queue.drain();queue.stop();});
    await p.reload();await setup(p,{org:'refresh',mode:'legacy'});
    assert.deepEqual(await p.evaluate(async()=>{const x=(await store.list())[0];return [x.id,await x.data.blob.text(),x.attempted];}),[id,'test audio',true]);
    await p.evaluate(async()=>{await queue.drain(true);queue.stop();});assert.equal(await p.evaluate(()=>sent),0);await p.close();
  });
  await check('closing and reopening browser preserves pending audio and recovers on connection',async()=>{
    let p=await harness();await setup(p,{org:'reopen',mode:'fail'});const id=await add(p);await p.evaluate(async()=>{await queue.drain();queue.stop();});
    await context.close();context=await chromium.launchPersistentContext(profile,options);p=await harness();await setup(p,{org:'reopen'});
    assert.equal(await p.evaluate(async()=>(await store.list())[0].id),id);await p.evaluate(()=>queue.drain(true));
    assert.deepEqual(await p.evaluate(async()=>[reads,sent,serverRows.size,(await store.list()).length]),[1,1,1,0]);await p.close();
  });
  await check('offline STOP protects audio before any attempt; reconnect uploads once',async()=>{
    const p=await harness();await setup(p,{org:'offline-stop'});await context.setOffline(true);await add(p);await p.evaluate(()=>queue.drain());
    assert.deepEqual(await p.evaluate(async()=>[sent,(await store.list()).length]),[0,1]);
    await context.setOffline(false);await p.evaluate(()=>queue.drain());assert.equal(await p.evaluate(()=>sent),1);await p.close();
  });
  await check('two tabs claim only one delivery',async()=>{
    const p=await harness(),q=await harness();await setup(p,{org:'two-tabs'});await setup(q,{org:'two-tabs'});await add(p);
    await p.evaluate(()=>{adapter.send=async item=>{sent++;await new Promise(r=>setTimeout(r,300));return {ok:true,fileUrl:'https://example.test/file'};};});
    await Promise.all([p.evaluate(()=>queue.drain()),q.evaluate(()=>queue.drain())]);
    assert.equal((await p.evaluate(()=>sent))+(await q.evaluate(()=>sent)),1);await p.close();await q.close();
  });
  await check('target failure retains item; retry tags without uploading audio again',async()=>{
    const p=await harness();await setup(p,{org:'target',mode:'target-fail'});await add(p);await p.evaluate(()=>queue.drain());
    assert.equal(await p.evaluate(async()=>(await store.list()).length),1);await p.evaluate(async()=>{mode='ok';await queue.drain(true);queue.stop();});assert.equal(await p.evaluate(()=>sent),1);await p.close();
  });
  await check('pupil text success and duplicate replay produce exactly one record',async()=>{
    const p=await harness();await setup(p,{org:'text',kind:'text',mode:'unreadable'});await add(p);await p.evaluate(()=>queue.drain());
    await p.evaluate(async()=>{mode='ok';await queue.drain(true);queue.stop();});
    assert.deepEqual(await p.evaluate(async()=>[sent,serverRows.size,(await store.list()).length]),[2,1,0]);await p.close();
  });
  await check('pending text survives refresh and retries with its original operation ID',async()=>{
    const p=await harness();await setup(p,{org:'text-refresh',kind:'text',mode:'fail'});const id=await add(p);await p.evaluate(async()=>{await queue.drain();queue.stop();});
    await p.reload();await setup(p,{org:'text-refresh',kind:'text'});assert.equal(await p.evaluate(async()=>(await store.list())[0].id),id);
    await p.evaluate(()=>queue.drain(true));assert.deepEqual(await p.evaluate(async()=>[serverRows.has([...serverRows.keys()][0]),(await store.list()).length]),[true,0]);await p.close();
  });
  await check('organisation and actor scopes isolate queued content',async()=>{
    const p=await harness();await setup(p,{org:'EMGT',actor:'pupil-1'});await add(p);
    await setup(p,{org:'SPBASA',actor:'pupil-1'});assert.equal(await p.evaluate(async()=>(await store.list()).length),0);
    await setup(p,{org:'EMGT',actor:'pupil-2'});assert.equal(await p.evaluate(async()=>(await store.list()).length),0);
    await setup(p,{org:'EMGT',actor:'pupil-1'});assert.equal(await p.evaluate(async()=>(await store.list()).length),1);await p.close();
  });
  await check('automatic retries stop at five attempts; manual retry remains possible',async()=>{
    const p=await harness();await setup(p,{org:'bounded',kind:'text',mode:'fail'});await add(p);
    for(let i=0;i<8;i++)await p.evaluate(async()=>{for(const x of await store.list()){x.nextAttempt=0;await store.put(x);}await queue.drain();queue.stop();});
    assert.equal(await p.evaluate(()=>sent),5);await p.evaluate(async()=>{mode='ok';await queue.drain(true);});assert.equal(await p.evaluate(()=>sent),6);await p.close();
  });
  await check('unverified success response cannot delete text',async()=>{
    const p=await harness();await setup(p,{org:'bad-ack',kind:'text'});await add(p);await p.evaluate(async()=>{adapter.send=async()=>({ok:true,reference:'F-wrong'});await queue.drain();queue.stop();});assert.equal(await p.evaluate(async()=>(await store.list()).length),1);await p.close();
  });
  for(const [label,cut] of [['connection lost while recording',true],['connection lost immediately before STOP',false]]){
    await check('actual RECORD path: '+label,async()=>{
      const p=await context.newPage();await p.route('https://script.google.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,sessions:[],targets:[],badges:[],group:{}})}));
      const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/emgt-tsop/index.html?p=test-'+cut+'&key=dummy-test-key');
      await p.click('#recordButton');await p.waitForFunction(()=>document.querySelector('#recordButton').classList.contains('recording'));
      if(cut)await context.setOffline(true);
      await p.waitForTimeout(500);
      if(!cut)await context.setOffline(true);
      await p.click('#recordButton');await p.waitForFunction(()=>!document.querySelector('#recordButton').disabled);
      const state=await p.evaluate(async()=>{const o=await getRecordingOutbox();o.queue.stop();const x=(await o.queue.store.list())[0];return {size:x.data.blob.size,duration:x.data.durationSeconds,attempted:x.attempted,play:!!document.querySelector('#playback').src};});
      assert.ok(state.size>0);assert.equal(state.attempted,false);assert.equal(state.play,true);assert.deepEqual(errors,[]);
      await p.close();await context.setOffline(false);
    });
  }
  for(const role of ['OWNER','ASSISTANT TEACHER']) {
    await check(role+' text adapter persists across refresh and deduplicates ambiguous delivery',async()=>{
      const p=await harness();
      const initialise=async()=>p.evaluate(async role=>{
        window.rowIds=new Set();window.fail=true;
        window.textBox=await createTextOutbox({context:{scope:'test-verified-'+role,role},idempotent:true,language:'en',parent:document.querySelector('main'),status:()=>{},send:async fields=>{
          rowIds.add(fields.requestId);if(fail)throw Error('unreadable response');return {ok:true,reference:'F-'+fields.requestId};
        }});
      },role);
      await initialise();await p.evaluate(async()=>{await textBox.submit({description:'Teacher comment',category:'suggestion'});});
      await p.waitForFunction(async()=>{const x=await textBox.queue.store.list();return x.length===1&&x[0].state==='pending'&&x[0].attempts>0;});
      const id=await p.evaluate(async()=>{textBox.queue.stop();return (await textBox.queue.store.list())[0].id;});
      await p.reload();await initialise();
      await p.evaluate(async id=>{fail=false;rowIds.add(id);await textBox.queue.drain(true);textBox.queue.stop();},id);
      assert.deepEqual(await p.evaluate(async()=>[rowIds.size,(await textBox.queue.store.list()).length]),[1,0]);await p.close();
    });
  }
  await check('blocked IndexedDB never claims device storage; audio download remains available',async()=>{
    const p=await context.newPage();await p.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw new DOMException('blocked','SecurityError');}}}));
    await p.route('https://script.google.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,sessions:[],targets:[],badges:[]})}));
    await p.goto(base+'/emgt-tsop/index.html?p=storage-test&key=test-key');await p.click('#recordButton');
    await p.waitForFunction(()=>document.querySelector('#recordButton').classList.contains('recording'));await p.waitForTimeout(150);await p.click('#recordButton');await p.waitForFunction(()=>!document.querySelector('#recordButton').disabled);
    const text=await p.locator('#status').textContent();assert.match(text,/storage is unavailable|No se puede guardar/);assert.equal(await p.locator('#recordView button').filter({hasText:/Download a copy|Descargar una copia/}).count(),1);await p.close();
  });
  await check('offline reload restores public app shell and pending audio without caching personal URLs',async()=>{
    const p=await context.newPage();await p.route('https://script.google.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,sessions:[],targets:[],badges:[]})}));
    await p.goto(base+'/spbasa/index.html?p=shell-test&key=test-key');
    await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();
    await p.evaluate(async()=>{const o=await getRecordingOutbox();o.queue.stop();await o.queue.add('audio',{blob:new Blob(['pending'],{type:'audio/webm'}),targetId:'',startedAt:Date.now()},crypto.randomUUID());});
    await context.setOffline(true);await p.reload();await p.waitForFunction(()=>typeof getRecordingOutbox==='function');
    assert.equal(await p.evaluate(async()=>{const o=await getRecordingOutbox();o.queue.stop();return (await o.queue.store.list()).length;}),1);
    const urls=await p.evaluate(async()=>{const all=[];for(const key of await caches.keys()){for(const r of await (await caches.open(key)).keys())all.push(r.url);}return all;});assert.ok(urls.every(url=>!url.includes('key=')));await p.close();await context.setOffline(false);
  });
  console.log(`RESULT ${passed} browser tests passed`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();server.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});});
