'use strict';
// Fixture-only design comparison. No HTTP route, Google authority or real-data cache.
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const deny=()=>{throw Error('Protected read denied.');};
const scalar=x=>typeof x==='string'||typeof x==='boolean'||(typeof x==='number'&&Number.isFinite(x));
function projectPath(path){
 if(!path||!Array.isArray(path.sessions)||!Array.isArray(path.comments)||!path.summary)deny();
 const pick=(x,ks)=>Object.fromEntries(ks.filter(k=>scalar(x[k])).map(k=>[k,x[k]]));
 return {summary:pick(path.summary,['totalSessions','qualifyingSessions','totalMinutes','creditedQualifyingMinutes']),
  sessions:path.sessions.map(s=>pick(s,['sessionId','date','startTime','endTime','durationMinutes','qualifying','targetId','teacherStatus','teacherNote','reviewedAt'])),
  comments:path.comments.map(c=>pick(c,['id','role','date','text','sessionId'])),
  targets:(path.targets||[]).map(t=>pick(t,['targetId','title','status','badgeId'])),
  badges:(path.badges||[]).map(b=>pick(b,['badgeId','badgeName','description']))};
}
function protectedReads({fixtureOnly=false,authorize,source,cache=false,now=Date.now,ttlMs=5000}){
 if(!fixtureOnly||typeof authorize!=='function'||!source||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('Fixture configuration required.');
 const entries=new Map();
 const key=b=>JSON.stringify([b.organisation,b.pupil]);
 async function grant(actor,b){
  if(!actor||actor.verified!==true||b.organisation!=='GAITA-DE-BOTO'||typeof b.pupil!=='string'||!b.pupil||await authorize(actor,b)!==true){entries.delete(key(b));deny();}
 }
 async function version(b){const v=await source.version(b);if(typeof v!=='string'||!v||v.length>200)deny();return v;}
 const response=(data,v)=>({data,version:v,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
 async function path(actor,b){
  if(!exact(b,['organisation','pupil']))deny();await grant(actor,b);
  const k=key(b),v=await version(b);let e=entries.get(k);
  if(!cache||!e||e.version!==v||e.expires<=now()){
   const snapshot=await source.path(b);
   if(snapshot.organisation!==b.organisation||snapshot.pupil!==b.pupil||snapshot.version!==v)deny();
   e={version:v,data:projectPath(snapshot.path),expires:now()+ttlMs};
   // This second revision read requires a real authoritative monotonic revision provider.
   if(await version(b)!==v)deny();
   if(cache)entries.set(k,e);
  }
  if(await version(b)!==v){entries.delete(k);deny();}
  await grant(actor,b);
  return response(structuredClone(e.data),v);
 }
 async function audio(actor,b){
  if(!exact(b,['organisation','pupil','sessionId'])||typeof b.sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(b.sessionId))deny();
  await grant(actor,b);const v=await version(b);
  // Server source resolves private file from logged pupil/session, checks folder, reads bytes.
  // Client cannot supply a Drive file/folder/URL selector. Audio is never cached here.
  const file=await source.audio(b);
  if(file.organisation!==b.organisation||file.pupil!==b.pupil||file.sessionId!==b.sessionId||file.version!==v||file.folderVerified!==true||
   !Buffer.isBuffer(file.bytes)||!['audio/wav','audio/webm','audio/ogg','audio/mp4'].includes(file.mimeType))deny();
  if(await version(b)!==v)deny();await grant(actor,b);
  return {...response(Buffer.from(file.bytes),v),mimeType:file.mimeType};
 }
 function invalidate(b){entries.delete(key(b));}
 function sweep(){for(const [k,e] of entries)if(e.expires<=now())entries.delete(k);}
 return {path,audio,invalidate,sweep,cacheEntries:()=>entries.size};
}
module.exports={protectedReads};
