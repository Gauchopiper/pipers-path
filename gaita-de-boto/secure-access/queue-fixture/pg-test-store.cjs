'use strict';
// PGlite serialises transactions explicitly. It is NOT a network pool race test.
const {PGlite}=require('@electric-sql/pglite');
async function testStore(directory){
 if(process.env.GDB_FIXTURE_NATIVE_URL){
  const u=new URL(process.env.GDB_FIXTURE_NATIVE_URL);
  if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^\/gdb_[a-z0-9_]+_fixture$/.test(u.pathname))throw Error('Only an explicitly selected local disposable gdb_*_fixture database is allowed.');
  const {Pool}=require('pg'),pool=new Pool({connectionString:u.href});
  return {pool,native:true,close:()=>pool.end()};
 }
 const engine=new PGlite(directory);let tail=Promise.resolve();
 const query=async(sql,args=[])=>{const r=args.length?await engine.query(sql,args):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.affectedRows||0};};
 const connect=async()=>{const previous=tail;let unlock;tail=new Promise(r=>unlock=r);await previous;return {query,release:unlock};};
 const pool={connect,query:async(sql,args)=>{const c=await connect();try{return await query(sql,args);}finally{c.release();}}};
 return {pool,native:false,close:()=>engine.close()};
}
module.exports={testStore};
