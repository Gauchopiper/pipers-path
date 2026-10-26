/* Incremental raw audio journal, private to the current EMGT pupil link.
 * Never uploads unfinished audio. Recovery exports keep the original bytes.
 */
(function(root) {
  'use strict';
  class CaptureStore {
    async open(scope) {
      this.db = await new Promise((resolve,reject)=>{
        const r = indexedDB.open('emgt-capture-v1-'+scope,1);
        r.onupgradeneeded = ()=>{
          r.result.createObjectStore('sessions',{keyPath:'id'});
          r.result.createObjectStore('chunks',{keyPath:['id','index']});
        };
        r.onsuccess = ()=>resolve(r.result); r.onerror = ()=>reject(r.error);
        r.onblocked = ()=>reject(Error('Capture storage blocked'));
      });
      this.db.onversionchange = ()=>this.db.close();
      return this;
    }
    tx(names,mode,task) {
      return new Promise((resolve,reject)=>{
        let tx; try { tx=this.db.transaction(names,mode,{durability:'strict'}); }
        catch (_) { tx=this.db.transaction(names,mode); }
        let result;
        tx.oncomplete=()=>resolve(result);
        tx.onerror=tx.onabort=()=>reject(tx.error||Error('Capture storage failed'));
        try { task(tx,v=>{result=v;}); } catch(e) { tx.abort(); reject(e); }
      });
    }
    begin(context) { return this.tx(['sessions'],'readwrite',tx=>tx.objectStore('sessions').add(context)); }
    append(id,index,blob) { return this.tx(['chunks'],'readwrite',tx=>tx.objectStore('chunks').add({id,index,blob})); }
    list() { return this.tx(['sessions'],'readonly',(tx,done)=>{tx.objectStore('sessions').getAll().onsuccess=e=>done(e.target.result);}); }
    blob(id,mimeType) {
      return this.tx(['chunks'],'readonly',(tx,done)=>{
        tx.objectStore('chunks').getAll(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])).onsuccess=e=>{
          const chunks=e.target.result.sort((a,b)=>a.index-b.index);
          if (chunks.some((x,i)=>x.index!==i)) { done(null); return; }
          done(new Blob(chunks.map(x=>x.blob),{type:mimeType}));
        };
      });
    }
    remove(id) {
      return this.tx(['chunks','sessions'],'readwrite',tx=>{
        tx.objectStore('sessions').delete(id);
        tx.objectStore('chunks').delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]));
      });
    }
  }
  root.EMGTCaptureStore=CaptureStore;
})(typeof window!=='undefined'?window:globalThis);
