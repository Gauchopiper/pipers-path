'use strict';
const {randomBytes,randomUUID,createHash,timingSafeEqual}=require('node:crypto');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const random=()=>randomBytes(32).toString('base64url');
const hash=x=>createHash('sha256').update(String(x||'')).digest('hex');
const deny=()=>{throw Error('Access denied.');};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===43&&Buffer.byteLength(b)===43&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
// pool must be a pg Pool with verified TLS (or approved Cloud SQL socket/connector).
// No database URL, credentials, migrations or public listeners are supplied implicitly.
function postgresStore(pool){
 async function query(sql,args=[]){return pool.query(sql,args);}
 async function tx(namespace,fn){
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO gdb_locks(namespace) VALUES($1) ON CONFLICT DO NOTHING',[namespace]);
   await c.query('SELECT namespace FROM gdb_locks WHERE namespace=$1 FOR UPDATE',[namespace]);
   const result=await fn(c);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function migrate(){
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   // Serialise migrations independently of tables that do not exist yet.
   await c.query('SELECT pg_advisory_xact_lock(724113809)');
   await c.query('CREATE TABLE IF NOT EXISTS gdb_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
   const migrations=[1,2].map(version=>{const sql=readFileSync(join(__dirname,'migrations/'+String(version).padStart(3,'0')+'.sql'),'utf8');return {version,sql,checksum:hash(sql)};});
   const rows=(await c.query('SELECT version,checksum FROM gdb_migrations ORDER BY version')).rows;
   if(rows.some((r,i)=>r.version!==i+1||!migrations[i]||r.checksum!==migrations[i].checksum))throw Error('Migration history mismatch; stop and review.');
   for(const m of migrations.slice(rows.length)){await c.query(m.sql);await c.query('INSERT INTO gdb_migrations(version,checksum) VALUES($1,$2)',[m.version,m.checksum]);}
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 return {query,tx,migrate};
}
function postgresAccess(db,config){
 const {organisation:org,identityScope:scope,ownerSubject,origin}=config,now=config.now||Date.now;
 if(org!=='GAITA-DE-BOTO'||!scope||!ownerSubject||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('Invalid access configuration.');
 function identity(a){if(a?.verified!==true||a.scope!==scope||typeof a.subject!=='string'||!a.subject)deny();}
 function owner(a){identity(a);if(a.subject!==ownerSubject)deny();}
 const current=async(c,p)=>(await c.query('SELECT * FROM gdb_access WHERE organisation=$1 AND pupil=$2',[org,p])).rows[0];
 const view=r=>r?{pupil:r.pupil,status:r.status,revision:r.revision,expires:Number(r.expires),link:r.status==='active'?origin+'/pupil/'+encodeURIComponent(r.link):null}:null;
 async function change(actor,input){
  owner(actor);
  const {operation,pupil,action,expectedRevision,subject,relation,evidence,expires}=input||{};
  if(!/^[a-f0-9-]{36}$/.test(operation||'')||typeof pupil!=='string'||!pupil||pupil.length>100||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['provision','activate','deactivate','rotate','revoke','grant','revokeGrant'].includes(action))throw Error('Invalid access operation.');
  if(await config.pupilExists(pupil)!==true)throw Error('Unknown canonical pupil.');
  if(['provision','activate','rotate','grant'].includes(action)&&config.externalApproved!==true)throw Error('External access is not approved.');
  if(['provision','grant'].includes(action)){
   const kind=await config.pupilKind(pupil);
   if(typeof subject!=='string'||!subject||subject===ownerSubject||subject.length>255||!['adult','guardian','supervised-child'].includes(relation)||!['adult','child'].includes(kind)||
    (kind==='adult'&&relation!=='adult')||(kind==='child'&&relation==='adult')||typeof evidence!=='string'||!evidence.trim()||evidence.length>200)throw Error('Verified identity and authorisation/consent evidence required.');
  }
  if(['provision','rotate'].includes(action)&&(!Number.isSafeInteger(expires)||expires<=now()))throw Error('Valid expiry required.');
  const request=JSON.stringify({scope,actor:actor.subject,pupil,action,expectedRevision,subject:subject??null,relation:relation??null,evidence:evidence??null,expires:expires??null});
  return db.tx('access:'+org,async c=>{
   const replay=(await c.query('SELECT * FROM gdb_operations WHERE organisation=$1 AND operation=$2',[org,operation])).rows[0];
   let r=await current(c,pupil);
   if(replay){if(replay.request!==request)throw Error('Operation reference conflict.');return {ok:true,revision:replay.revision,duplicate:true,access:view(r)};}
   if((r?.revision||0)!==expectedRevision)throw Error('Access changed; refresh before retrying.');
   if(action==='provision'){
    if(r)throw Error('Pupil already provisioned.');
    r={organisation:org,pupil,scope,link:randomUUID(),status:'inactive',revision:1,expires};
    await c.query('INSERT INTO gdb_access VALUES($1,$2,$3,$4,$5,$6,$7)',[org,pupil,scope,r.link,r.status,r.revision,expires]);
   }else{
    if(!r||r.scope!==scope)deny();
    if(action==='activate'&&(r.status==='revoked'||Number(r.expires)<=now()))throw Error('Replace revoked or expired access first.');
    if(action==='rotate'){r.link=randomUUID();r.expires=expires;r.status='inactive';}
    else if(!['grant','revokeGrant'].includes(action))r.status=action==='activate'?'active':action==='deactivate'?'inactive':'revoked';
    r.revision++;
    await c.query('UPDATE gdb_access SET link=$1,status=$2,revision=$3,expires=$4 WHERE organisation=$5 AND pupil=$6',[r.link,r.status,r.revision,r.expires,org,pupil]);
   }
   if(['provision','grant'].includes(action))await c.query(`INSERT INTO gdb_grants VALUES($1,$2,$3,$4,$5,$6,'active') ON CONFLICT(organisation,pupil,scope,subject) DO UPDATE SET relation=excluded.relation,evidence=excluded.evidence,status=excluded.status`,[org,pupil,scope,subject,relation,evidence]);
   if(action==='revokeGrant'){
    const updated=await c.query("UPDATE gdb_grants SET status='revoked' WHERE organisation=$1 AND pupil=$2 AND scope=$3 AND subject=$4",[org,pupil,scope,subject]);
    if(!updated.rowCount)throw Error('Unknown pupil relationship.');
   }
   await c.query('INSERT INTO gdb_operations VALUES($1,$2,$3,$4)',[org,operation,request,r.revision]);
   await c.query('INSERT INTO gdb_audit(organisation,pupil,actor,action,revision,operation,at) VALUES($1,$2,$3,$4,$5,$6,$7)',[org,pupil,actor.subject,action,r.revision,operation,now()]);
   return {ok:true,revision:r.revision,duplicate:false,access:view(r)};
  });
 }
 async function authorize(actor,link,organisation){
  identity(actor);if(config.externalApproved!==true||organisation!==org||typeof link!=='string')deny();
  const r=(await db.query(`SELECT a.*,g.relation,g.evidence FROM gdb_access a JOIN gdb_grants g ON g.organisation=a.organisation AND g.pupil=a.pupil AND g.scope=a.scope WHERE a.organisation=$1 AND a.link=$2 AND a.scope=$3 AND g.subject=$4 AND a.status='active' AND g.status='active'`,[org,link,scope,actor.subject])).rows[0];
  if(!r||Number(r.expires)<=now()||!r.evidence||await config.pupilExists(r.pupil)!==true)deny();
  const kind=await config.pupilKind(r.pupil);
  if(!['adult','child'].includes(kind)||(kind==='adult'&&r.relation!=='adult')||(kind==='child'&&!['guardian','supervised-child'].includes(r.relation)))deny();
  return {organisation:org,pupil:r.pupil,revision:r.revision};
 }
 return {change,authorize,async status(actor,pupil){owner(actor);return view(await current(db,pupil));}};
}
function postgresSessions(db,{scope,now=Date.now,sessionMs=3600000}){
 if(!scope||!Number.isSafeInteger(sessionMs)||sessionMs<1000||sessionMs>3600000)throw Error('Invalid session configuration.');
 async function limit(bucket,max,windowMs){
  if(!Number.isSafeInteger(max)||max<1||!Number.isSafeInteger(windowMs)||windowMs<1)throw Error('Invalid limit.');
  const key=hash(scope+':'+bucket),t=now();
  // One SQL statement obtains the row lock and makes increment/reset indivisible.
  const r=(await db.query(`INSERT INTO gdb_limits VALUES($1,$2,1) ON CONFLICT(bucket) DO UPDATE SET start=CASE WHEN gdb_limits.start+$3<=$2 THEN $2 ELSE gdb_limits.start END,count=CASE WHEN gdb_limits.start+$3<=$2 THEN 1 ELSE gdb_limits.count+1 END RETURNING count`,[key,t,windowMs])).rows[0];
  if(r.count>max)throw Error('Too many requests; try again later.');
 }
 async function challenge(){const id=random(),nonce=random(),csrf=random(),expires=now()+300000;await db.query('INSERT INTO gdb_challenges VALUES($1,$2,$3,$4,$5)',[hash(id),scope,nonce,csrf,expires]);return{id,nonce,csrf,expires};}
 async function getChallenge(id,csrf){
  const r=(await db.query('SELECT * FROM gdb_challenges WHERE id=$1 AND scope=$2',[hash(id),scope])).rows[0];
  if(!r||Number(r.expires)<=now()||!equal(r.csrf,csrf))deny();
  return {nonce:r.nonce,expires:Number(r.expires),consume:async()=>!!(await db.query('DELETE FROM gdb_challenges WHERE id=$1 AND scope=$2 AND expires>$3 RETURNING id',[hash(id),scope,now()])).rowCount};
 }
 async function create(actor,oldId){
  if(actor?.verified!==true||actor.scope!==scope||typeof actor.subject!=='string'||!actor.subject)deny();
  const id=random(),csrf=random(),expires=now()+sessionMs;
  return db.tx('identity:'+scope+':'+actor.subject,async c=>{
   await c.query('DELETE FROM gdb_sessions WHERE id=$1 AND scope=$2',[hash(oldId),scope]);
   await c.query('INSERT INTO gdb_sessions VALUES($1,$2,$3,$4,$5)',[hash(id),scope,actor.subject,csrf,expires]);
   const r=(await c.query('INSERT INTO gdb_identities VALUES($1,$2,$3,$4) ON CONFLICT(scope,subject) DO UPDATE SET verified_at=excluded.verified_at RETURNING enrolment',[scope,actor.subject,random(),now()])).rows[0];
   return {id,csrf,expires,enrolment:r.enrolment};
  });
 }
 async function read(id,csrf,mutating=true){const r=(await db.query('SELECT * FROM gdb_sessions WHERE id=$1 AND scope=$2',[hash(id),scope])).rows[0];if(!r||Number(r.expires)<=now()||(mutating&&!equal(r.csrf,csrf)))deny();return {actor:{verified:true,scope,subject:r.subject},csrf:r.csrf,expires:Number(r.expires)};}
 return {limit,challenge,getChallenge,create,read,
  async logout(id,csrf){await read(id,csrf);await db.query('DELETE FROM gdb_sessions WHERE id=$1 AND scope=$2',[hash(id),scope]);},
  async resolveEnrolment(ref){const r=(await db.query('SELECT subject FROM gdb_identities WHERE enrolment=$1 AND scope=$2',[ref,scope])).rows[0];if(!r)deny();return r.subject;},
  async cleanup(){const t=now();await db.query('DELETE FROM gdb_sessions WHERE expires<=$1',[t]);await db.query('DELETE FROM gdb_challenges WHERE expires<=$1',[t]);await db.query('DELETE FROM gdb_limits WHERE start<$1',[t-86400000]);}};
}
module.exports={postgresStore,postgresAccess,postgresSessions};
