'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const ctx=vm.createContext({crypto,TextEncoder,Blob,navigator:{onLine:true},setTimeout:()=>0,clearTimeout:()=>{},addEventListener:()=>{},removeEventListener:()=>{}});
vm.runInContext(fs.readFileSync(require.resolve('../reliability/local-outbox.js'),'utf8'),ctx);
class MemoryStore {
  constructor(scope='emgt:pupil-a'){this.scope=scope;this.items=new Map();}
  async tx(mode,task){task({add:x=>{if(this.items.has(x.id))throw Error('duplicate');this.items.set(x.id,structuredClone(x));}});}
  async list(){return [...this.items.values()].map(x=>structuredClone(x));}
  async claim(id,manual){const item=this.items.get(id);if(!item||item.leaseUntil>Date.now()||!manual&&item.attempts>=5)return null;item.lease=crypto.randomUUID();item.leaseUntil=Date.now()+120000;item.attempts++;return structuredClone(item);}
  async finish(x,remove,keep=false){const cur=this.items.get(x.id);if(!cur||cur.lease!==x.lease)return false;if(remove)this.items.delete(x.id);else this.items.set(x.id,{...structuredClone(x),...keep?{}:{leaseUntil:0,lease:''}});return true;}
}
const Queue=ctx.PipersOutbox.Queue;
const data={blob:new Blob(['sound']),durationSeconds:300,targetId:'target-a'};
const confirm=(item,r)=>r&&r.ok===true&&r.sessionId===item.id;
(async()=>{
  {
    const store=new MemoryStore();let sends=0,found=false;
    const adapter={send:async()=>{sends++;found=true;throw Error('response lost');},confirm,reconcile:async item=>found?{saved:true,fileUrl:'drive-file',sessionId:item.id}:{state:'unknown'},finalize:async()=>true};
    const q=new Queue(store,adapter);await q.add('audio',data,'a');await q.drain();
    assert.equal(sends,1);assert.equal((await store.list()).length,0);
    console.log('PASS unreadable acknowledgement reconciles exact Session ID without re-upload');
  }
  {
    const store=new MemoryStore();let sends=0;
    const adapter={send:async()=>{sends++;throw Error('network');},confirm,reconcile:async()=>({state:'unknown'}),finalize:async()=>true};
    const q=new Queue(store,adapter);await q.add('audio',data,'a');await q.drain();
    const restored=new Queue(store,adapter);await restored.drain(true);await restored.drain(true);
    assert.equal(sends,1);assert.equal((await store.list())[0].data.blob.size,5);
    console.log('PASS ambiguous network failure survives queue recreation and manual retries without duplicate send');
  }
  {
    const store=new MemoryStore();let sends=0;
    const q=new Queue(store,{send:async item=>{sends++;return {ok:true,sessionId:item.id};},confirm,finalize:async()=>true});
    ctx.navigator.onLine=false;await q.add('audio',data,'a');await q.drain();assert.equal(sends,0);assert.equal((await store.list()).length,1);
    ctx.navigator.onLine=true;await q.drain();assert.equal(sends,1);assert.equal((await store.list()).length,0);
    console.log('PASS offline capture remains queued and uploads once after reconnection');
  }
  {
    const store=new MemoryStore();let sends=0,tagged=false;
    const adapter={send:async item=>{sends++;return {ok:true,sessionId:item.id};},confirm,finalize:async()=>tagged};
    const q=new Queue(store,adapter);await q.add('audio',data,'a');await q.drain();assert.equal((await store.list())[0].data.targetId,'target-a');
    tagged=true;await q.drain(true);assert.equal(sends,1);assert.equal((await store.list()).length,0);
    console.log('PASS pending target confirmation retries target only');
  }
  {
    const store=new MemoryStore();let sends=0;
    const adapter={send:async item=>{sends++;await new Promise(r=>setImmediate(r));return {ok:true,sessionId:item.id};},confirm,finalize:async()=>true};
    const a=new Queue(store,adapter),b=new Queue(store,adapter);await a.add('audio',data,'a');await Promise.all([a.drain(),b.drain()]);assert.equal(sends,1);
    console.log('PASS two simulated tabs share one claimed send');
  }
  {
    const a=await ctx.PipersOutbox.scopeKey(['audio','emgt-endpoint','pupil-a','key-a']);
    assert.notEqual(a,await ctx.PipersOutbox.scopeKey(['audio','other-endpoint','pupil-a','key-a']));
    assert.notEqual(a,await ctx.PipersOutbox.scopeKey(['audio','emgt-endpoint','pupil-b','key-a']));
    assert.notEqual(a,await ctx.PipersOutbox.scopeKey(['audio','emgt-endpoint','pupil-a','key-b']));
    assert.ok(!a.includes('key-a'));console.log('PASS endpoint, pupil and capability scope separation');
  }
  console.log('Queue tests use an in-memory storage model, not a real browser IndexedDB certification.');
})().catch(e=>{console.error(e);process.exitCode=1;});
