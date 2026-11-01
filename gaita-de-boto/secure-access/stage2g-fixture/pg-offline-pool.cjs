'use strict';
// PGlite is a real PostgreSQL WASM engine with one SERIALISED connection.
// This pool facade does not prove native independent-connection races or TLS.
const {PGlite}=require('@electric-sql/pglite');
async function offlinePool(directory){
 const engine=new PGlite(directory);let tail=Promise.resolve();await engine.waitReady;
 const query=async(sql,args=[])=>{const r=args.length?await engine.query(sql,args):(await engine.exec(sql)).at(-1);return{rows:r?.rows||[],rowCount:r?.affectedRows||0};};
 const connect=async()=>{const previous=tail;let release;tail=new Promise(r=>release=r);await previous;return{query,release};};
 const pool={connect,query:async(sql,args)=>{const c=await connect();try{return await query(sql,args);}finally{c.release();}}};
 return{pool,engine,native:false,close:async()=>{await tail;await engine.close();}};
}
module.exports={offlinePool};
