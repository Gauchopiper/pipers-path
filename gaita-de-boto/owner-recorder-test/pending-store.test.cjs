// SIMULATED storage transactions; real Node WebCrypto/Blob. Not browser IDB certification.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
const data=new Map();let failWrites=false;
const db={close(){},createObjectStore(){},transaction(name,mode){
 let pending=0,aborted=false,ended=false;const tx={error:null,abort(){aborted=true;setImmediate(()=>tx.onabort?.())}};
 function request(fn){const r={};pending++;setImmediate(()=>{if(aborted)return;try{r.result=fn();r.onsuccess?.();}catch(e){tx.error=e;aborted=true;tx.onerror?.();}pending--;if(!pending&&!aborted&&!ended){ended=true;setImmediate(()=>tx.oncomplete?.());}});return r;}
 tx.objectStore=()=>({get:k=>request(()=>data.get(k)),add:(v,k)=>request(()=>{if(failWrites)throw Error('QuotaExceededError');if(data.has(k))throw Error('ConstraintError');data.set(k,v);return k}),delete:k=>request(()=>{if(failWrites)throw Error('QuotaExceededError');data.delete(k)})});return tx;
}};
const indexedDB={open(){const r={};setImmediate(()=>{r.result=db;r.onsuccess()});return r}};
const ctx={window:{indexedDB},indexedDB,crypto,TextEncoder,TextDecoder,Uint8Array,DataView,Blob};vm.createContext(ctx);vm.runInContext(fs.readFileSync('pending-store.js','utf8'),ctx);const Store=ctx.window.GaitaPendingStore;
(async()=>{
 const a=await Store.open('dummy-a','test-capability-a');const item={sessionId:'immutable-session',mime:'audio/wav',startedAt:1000,endedAt:2000,targetId:'',blob:new Blob(['test-audio'])};await a.put(item);
 const raw=data.get(a.slot);assert(!JSON.stringify(raw).includes('test-capability'));assert.notEqual(await raw.cipher.text(),'test-audio');
 const reopened=await Store.open('dummy-a','test-capability-a');const restored=await reopened.read();assert.equal(await restored.blob.text(),'test-audio');assert.equal(restored.sessionId,item.sessionId);assert.equal(restored.endedAt,2000);
 assert.equal(await (await Store.open('dummy-b','test-capability-a')).read(),null);const wrong=await Store.open('dummy-a','wrong');assert.equal(await wrong.read(),null);
 // Even if an attacker copies ciphertext into the other pupil/key slot, authenticated decryption fails.
 data.set(wrong.slot,raw);await assert.rejects(wrong.read());data.delete(wrong.slot);
 await assert.rejects(a.put({...item,sessionId:'different'}));await assert.rejects(a.put({...item,blob:new Blob(['tampered'])}));await assert.rejects(a.put({...item,endedAt:3000}));await a.put(item);assert.equal(data.size,1);
 await assert.rejects(a.remove('different'));assert.equal(data.size,1);
 failWrites=true;await assert.rejects(a.remove(item.sessionId));assert.equal(data.size,1);failWrites=false;
 await a.remove(item.sessionId);assert.equal(await a.read(),null);
 failWrites=true;await assert.rejects(a.put(item));assert.equal(await a.read(),null);failWrites=false;
 const results=await Promise.allSettled([a.put(item),reopened.put({...item,sessionId:'concurrent'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(data.size,1);
 console.log('PASS simulated storage: encrypted round-trip/reopen, immutable bytes/metadata/SID, wrong pupil/key isolation and ciphertext tampering, explicit deletion, quota failures retain data, concurrent add cannot overwrite.');
})().catch(e=>{console.error(e);process.exitCode=1});
