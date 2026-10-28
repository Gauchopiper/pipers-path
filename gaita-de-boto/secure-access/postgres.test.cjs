'use strict';
const {PGlite}=require('@electric-sql/pglite'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {postgresStore,postgresAccess,postgresSessions}=require('./postgres.cjs');
(async()=>{
 const engine=new PGlite();
 // Real PostgreSQL engine compiled to WASM, single connection. NOT a network-pool concurrency test.
 const query=async(sql,args)=>{const r=args?.length?await engine.query(sql,args):(await engine.exec(sql)).at(-1);return {rows:r?.rows||[],rowCount:r?.affectedRows||0};};
 const pool={query,connect:async()=>({query,release(){}})};
 const db=postgresStore(pool);let n=0;const check=async(name,fn)=>{await fn();console.log('PASS '+name);n++;};
 const scope='google:fixture.apps.googleusercontent.com',owner={verified:true,scope,subject:'owner'},guardian={...owner,subject:'guardian'};
 const config={organisation:'GAITA-DE-BOTO',identityScope:scope,ownerSubject:owner.subject,origin:'https://fixture.example',externalApproved:true,pupilExists:async p=>['a','b'].includes(p),pupilKind:async()=> 'child'};
 const access=postgresAccess(db,config),sessions=postgresSessions(db,{scope});
 const op=(pupil,action,expectedRevision,extra={})=>({pupil,action,expectedRevision,operation:randomUUID(),...extra});
 const provision=op('a','provision',0,{subject:guardian.subject,relation:'guardian',evidence:'fixture-consent-a',expires:Date.now()+3600000});
 try{
 await check('versioned PostgreSQL migration applies and repeats safely',async()=>{await db.migrate();await db.migrate();assert.equal((await db.query('SELECT count(*)::int n FROM gdb_migrations')).rows[0].n,1);});
 await check('unknown migration history fails closed',async()=>{await db.query("UPDATE gdb_migrations SET checksum='tampered'");await assert.rejects(db.migrate(),/mismatch/);await db.query('DELETE FROM gdb_migrations');const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'migrations/001.sql'),'utf8');const checksum=require('node:crypto').createHash('sha256').update(sql).digest('hex');await db.query('INSERT INTO gdb_migrations VALUES(1,$1,now())',[checksum]);});
 await check('guardian provisioning and operation replay are durable SQL writes',async()=>{assert.equal((await access.change(owner,provision)).access.status,'inactive');assert.equal((await access.change(owner,provision)).duplicate,true);assert.equal((await db.query('SELECT count(*)::int n FROM gdb_access')).rows[0].n,1);});
 await check('operation payload reuse is rejected',()=>assert.rejects(access.change(owner,{...provision,pupil:'b'}),/conflict/));
 let link;
 await check('active membership authorises exact child and rejects foreign identity/org',async()=>{link=new URL((await access.change(owner,op('a','activate',1))).access.link).pathname.split('/').pop();assert.equal((await access.authorize(guardian,link,'GAITA-DE-BOTO')).pupil,'a');await assert.rejects(access.authorize(owner,link,'GAITA-DE-BOTO'),/denied/);await assert.rejects(access.authorize(guardian,link,'EMGT'),/denied/);});
 await check('same guardian can have a separate sibling grant',async()=>{await access.change(owner,op('b','provision',0,{subject:'guardian',relation:'guardian',evidence:'fixture-consent-b',expires:Date.now()+3600000}));assert.equal((await db.query('SELECT count(*)::int n FROM gdb_grants')).rows[0].n,2);});
 await check('stale revision rejected',()=>assert.rejects(access.change(owner,op('a','revoke',1)),/changed/));
 await check('SQL transaction failure rolls back state, receipt and audit together',async()=>{
  await db.query("CREATE FUNCTION fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture interruption'; END $$; CREATE TRIGGER fixture_trigger BEFORE INSERT ON gdb_audit FOR EACH ROW EXECUTE FUNCTION fixture_fail();");
  const input=op('a','deactivate',2);await assert.rejects(access.change(owner,input),/fixture interruption/);assert.equal((await access.status(owner,'a')).revision,2);
  assert.equal((await db.query('SELECT * FROM gdb_operations WHERE operation=$1',[input.operation])).rows.length,0);
  await db.query('DROP TRIGGER fixture_trigger ON gdb_audit; DROP FUNCTION fixture_fail();');assert.equal((await access.change(owner,input)).duplicate,false);
 });
 await check('deactivation blocks still-valid identity',()=>assert.rejects(access.authorize(guardian,link,'GAITA-DE-BOTO'),/denied/));
 await check('rotation invalidates old link and reactivation uses new one',async()=>{await access.change(owner,op('a','rotate',3,{expires:Date.now()+3600000}));const next=new URL((await access.change(owner,op('a','activate',4))).access.link).pathname.split('/').pop();assert.notEqual(next,link);await assert.rejects(access.authorize(guardian,link,'GAITA-DE-BOTO'),/denied/);link=next;});
 await check('relationship revocation affects only selected child',async()=>{await access.change(owner,op('a','revokeGrant',5,{subject:'guardian'}));await assert.rejects(access.authorize(guardian,link,'GAITA-DE-BOTO'),/denied/);assert.equal((await db.query("SELECT status FROM gdb_grants WHERE pupil='b'")).rows[0].status,'active');});
 await check('single-use challenge consumed atomically in SQL',async()=>{const c=await sessions.challenge(),a=await sessions.getChallenge(c.id,c.csrf),b=await sessions.getChallenge(c.id,c.csrf);assert.equal(await a.consume(),true);assert.equal(await b.consume(),false);});
 let session;
 await check('identity enrolment, hashed session and CSRF persisted',async()=>{session=await sessions.create(guardian);assert.equal((await sessions.read(session.id,session.csrf)).actor.subject,'guardian');assert.equal(await sessions.resolveEnrolment(session.enrolment),'guardian');assert.notEqual((await db.query('SELECT id FROM gdb_sessions')).rows[0].id,session.id);await assert.rejects(sessions.read(session.id,'wrong'),/denied/);});
 await check('new adapter instance retains session and membership data',async()=>{const again=postgresSessions(postgresStore(pool),{scope});assert.equal((await again.read(session.id,session.csrf)).actor.subject,'guardian');assert.equal((await postgresAccess(postgresStore(pool),config).status(owner,'a')).revision,6);});
 await check('logout invalidates session durably',async()=>{await sessions.logout(session.id,session.csrf);await assert.rejects(sessions.read(session.id,session.csrf),/denied/);});
 await check('rate counters persist across adapters and reset after window',async()=>{let time=1000;const a=postgresSessions(db,{scope,now:()=>time}),b=postgresSessions(db,{scope,now:()=>time});await a.limit('fixture',1,1000);await assert.rejects(b.limit('fixture',1,1000),/Too many/);time=2000;await b.limit('fixture',1,1000);});
 await check('expired session/challenge cleanup preserves receipts and audit',async()=>{const a=postgresSessions(db,{scope,now:()=>1,sessionMs:1000});await a.challenge();await a.create(guardian);await sessions.cleanup();assert.equal((await db.query('SELECT count(*)::int n FROM gdb_challenges')).rows[0].n,0);assert((await db.query('SELECT count(*)::int n FROM gdb_operations')).rows[0].n>0);});
 console.log(`${n} PostgreSQL-engine checks passed (PGlite single connection); real multi-process/Cloud SQL tests pending.`);
 }finally{await engine.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
