/* Owner-test recovery storage. No pupil keys or plaintext audio persisted. */
'use strict';
class GaitaPendingStore {
  static async open(pupil, capability) {
    if (!pupil || !capability || !crypto.subtle || !window.indexedDB) throw Error('Local protection unavailable');
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', enc.encode(capability), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('gaita-pending-v1:'+pupil),info:enc.encode('audio-recovery')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const slot = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('gaita-slot-v1:'+pupil+':'+capability))),b=>b.toString(16).padStart(2,'0')).join('');
    const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('gaita-pending-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('recordings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Storage upgrade blocked'));});
    db.onversionchange=()=>db.close();
    return new GaitaPendingStore(db,key,slot);
  }
  constructor(db,key,slot){this.db=db;this.key=key;this.slot=slot;}
  transaction(mode,operation){return new Promise((resolve,reject)=>{const tx=this.db.transaction('recordings',mode);let value;const r=operation(tx.objectStore('recordings'));r.onsuccess=()=>{value=r.result};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('Storage failed'));tx.onabort=()=>reject(tx.error||Error('Storage aborted'));});}
  async read(){const row=await this.transaction('readonly',s=>s.get(this.slot));if(!row)return null;const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(this.slot)},this.key,await row.cipher.arrayBuffer());const bytes=new Uint8Array(plain),n=new DataView(plain).getUint32(0);if(n>bytes.length-4)throw Error('Invalid local recording');const meta=JSON.parse(new TextDecoder().decode(bytes.slice(4,4+n)));return {...meta,blob:new Blob([bytes.slice(4+n)],{type:meta.mime})};}
  async put(item){
    const existing=await this.read();if(existing){if(existing.sessionId!==item.sessionId)throw Error('An earlier recording is still pending');if(['mime','startedAt','endedAt','targetId'].some(k=>existing[k]!==item[k]))throw Error('Immutable metadata changed');const a=new Uint8Array(await existing.blob.arrayBuffer()),b=new Uint8Array(await item.blob.arrayBuffer());if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Immutable recording changed');return;}
    const {blob,...meta}=item;const head=new TextEncoder().encode(JSON.stringify(meta));const audio=new Uint8Array(await blob.arrayBuffer());const bytes=new Uint8Array(4+head.length+audio.length);new DataView(bytes.buffer).setUint32(0,head.length);bytes.set(head,4);bytes.set(audio,4+head.length);const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(this.slot)},this.key,bytes);
    await this.transaction('readwrite',s=>s.add({token:crypto.randomUUID(),iv,cipher:new Blob([encrypted])},this.slot));
    const check=await this.read();if(!check||check.sessionId!==item.sessionId||check.blob.size!==blob.size)throw Error('Local preservation not confirmed');
  }
  async remove(sessionId){
    const raw=await this.transaction('readonly',s=>s.get(this.slot));if(!raw)return;
    const row=await this.read();if(!row||row.sessionId!==sessionId)throw Error('Different pending recording');
    await new Promise((resolve,reject)=>{const tx=this.db.transaction('recordings','readwrite'),store=tx.objectStore('recordings'),r=store.get(this.slot);r.onsuccess=()=>{if(r.result&&r.result.token===raw.token)store.delete(this.slot);else if(r.result)tx.abort();};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Cleanup failed'));tx.onabort=()=>reject(Error('Pending recording changed; retained'));});
  }

}
window.GaitaPendingStore=GaitaPendingStore;
