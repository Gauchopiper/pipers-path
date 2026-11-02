'use strict';
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const random=()=>randomBytes(32).toString('base64url');
const hash=v=>createHash('sha256').update(String(v||'')).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===43&&b.length===43&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const denied=()=>{throw Error('Access denied.');};
function sessionStore(filename,{scope,now=Date.now,sessionMs=3600000}){
 if(!scope||!Number.isSafeInteger(sessionMs)||sessionMs<1000||sessionMs>3600000)throw Error('Invalid session configuration.');
 const db=new DatabaseSync(filename);
 db.exec(`PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,nonce TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,subject TEXT NOT NULL,scope TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS identities(subject TEXT NOT NULL,scope TEXT NOT NULL,enrolment TEXT NOT NULL UNIQUE,verifiedAt INTEGER NOT NULL,PRIMARY KEY(subject,scope));
 CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,start INTEGER NOT NULL,count INTEGER NOT NULL);`);
 function limit(bucket,max,windowMs){
  db.exec('BEGIN IMMEDIATE');
  try{
   const t=now(),row=db.prepare('SELECT * FROM limits WHERE bucket=?').get(hash(bucket));
   if(row&&row.start+windowMs>t&&row.count>=max)throw Error('Too many requests; try again later.');
   db.prepare('INSERT INTO limits VALUES (?,?,?) ON CONFLICT(bucket) DO UPDATE SET start=excluded.start,count=excluded.count').run(hash(bucket),row&&row.start+windowMs>t?row.start:t,row&&row.start+windowMs>t?row.count+1:1);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function challenge(){
  const t=now(),id=random(),nonce=random(),csrf=random();
  db.prepare('DELETE FROM challenges WHERE expires<=?').run(t);
  db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(hash(id),nonce,csrf,t+300000);
  return {id,nonce,csrf,expires:t+300000};
 }
 function getChallenge(id,csrf){
  const row=db.prepare('SELECT * FROM challenges WHERE id=?').get(hash(id));
  if(!row||row.expires<=now()||!equal(row.csrf,csrf))denied();
  return {nonce:row.nonce,expires:row.expires,consume:()=>db.prepare('DELETE FROM challenges WHERE id=? AND expires>?').run(hash(id),now()).changes===1};
 }
 function create(actor,oldId){
  if(actor?.verified!==true||actor.scope!==scope||typeof actor.subject!=='string'||!actor.subject)denied();
  const id=random(),csrf=random(),expires=now()+sessionMs;
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare('DELETE FROM sessions WHERE id=? OR expires<=?').run(hash(oldId),now());
   db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(hash(id),actor.subject,scope,csrf,expires);
   db.prepare('INSERT INTO identities VALUES (?,?,?,?) ON CONFLICT(subject,scope) DO UPDATE SET verifiedAt=excluded.verifiedAt').run(actor.subject,scope,random(),now());
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {id,csrf,expires,enrolment:db.prepare('SELECT enrolment FROM identities WHERE subject=? AND scope=?').get(actor.subject,scope).enrolment};
 }
 function read(id,csrf,mutating=true){
  const row=db.prepare('SELECT * FROM sessions WHERE id=? AND scope=?').get(hash(id),scope);
  if(!row||row.expires<=now()||(mutating&&!equal(row.csrf,csrf)))denied();
  return {actor:{verified:true,scope,subject:row.subject},csrf:row.csrf,expires:row.expires};
 }
 return {limit,challenge,getChallenge,create,read,
  logout(id,csrf){read(id,csrf);db.prepare('DELETE FROM sessions WHERE id=?').run(hash(id));},
  resolveEnrolment(ref){const r=db.prepare('SELECT subject FROM identities WHERE enrolment=? AND scope=?').get(ref,scope);if(!r)denied();return r.subject;},
  close(){db.close();}};
}
module.exports={sessionStore};
