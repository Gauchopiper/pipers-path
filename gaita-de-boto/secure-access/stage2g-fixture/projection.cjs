'use strict';
const {exact}=require('./protocol.cjs'),{hash,bytes}=require('../queue-fixture/postgres.cjs');
const madridDate=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
function projectPath(tables,pupil,now){
 const logs=(tables['PRACTICE LOG']||[]).slice(1),metas=(tables['SESSION META']||[]).slice(1);
 if(logs.some(r=>r[0]!==pupil))throw Error('Foreign pupil in isolated source.');
 const sessions=logs.map(r=>{const found=metas.filter(m=>m[0]===r[6]&&m[1]===pupil&&m[6]===r[7]);if(found.length!==1)throw Error('Missing or ambiguous META.');const m=found[0];return{
  sessionId:r[7],date:String(r[1]),startTime:String(r[2]),endTime:String(r[3]),durationMinutes:Number(r[4]),qualifying:r[5]==='Yes',
  targetId:String(m[2]||''),teacherStatus:String(m[3]||''),teacherNote:String(m[4]||''),reviewedAt:String(m[5]||'')};}).reverse();
 const targets=(tables.TARGETS||[]).slice(1),badges=(tables.BADGES||[]).slice(1);
 const qualified=sessions.filter(s=>s.qualifying),people=new Set(logs.filter(r=>String(r[1])===madridDate(now)&&r[5]==='Yes').map(r=>r[0]));
 return{summary:{totalSessions:sessions.length,qualifyingSessions:qualified.length,totalMinutes:sessions.reduce((n,s)=>n+s.durationMinutes,0),creditedQualifyingMinutes:qualified.reduce((n,s)=>n+s.durationMinutes,0)},
  sessions,targets:(tables['PUPIL TARGETS']||[]).slice(1).filter(r=>r[0]===pupil).map(r=>{const t=targets.find(t=>t[0]===r[1]);if(!t)throw Error('Unbound target.');return{targetId:r[1],title:t[1],status:r[2],badgeId:t[4]||''};}),
  badges:(tables['PUPIL BADGES']||[]).slice(1).filter(r=>r[0]===pupil).map(r=>{const b=badges.find(b=>b[0]===r[1]);if(!b)throw Error('Unbound award.');return{badgeId:b[0],badgeName:b[1],description:b[2],imageLink:b[3]||''};}),
  comments:(tables['TEACHER COMMENTS']||[]).slice(1).filter(r=>r[1]===pupil).map(r=>({id:r[0],teacher:r[2],role:r[3],date:String(r[4]),text:r[5],sessionId:r[6]||''})).reverse().slice(0,30),
  creditedPracticeByDate:[],group:{pipersToday:people.size,bagpipeParts:Math.min(10,people.size),communityBonusPercent:Math.min(20,people.size*2)}};
}
function validateProjection(data,operation,sid,manifests,now){
 if(/(?:drive\.google\.com|docs\.google\.com|googleusercontent\.com)/i.test(JSON.stringify(data)))throw Error('Private Google locator in client projection.');
 const bindings=manifests.map(m=>m.binding),byId=new Map(bindings.map(b=>[b.sessionId,b]));
 if(operation==='playback.read'){
  const b=byId.get(sid);if(!b||!exact(data,['sessionId','hash','mimeType','audioBase64'])||data.sessionId!==sid||data.hash!==b.hash||data.mimeType!==b.mimeType||b.length>5*1024*1024)throw Error('Foreign or altered playback.');bytes(b,data.audioBase64);return;
 }
 if(!exact(data,['summary','sessions','targets','badges','comments','creditedPracticeByDate','group'])||!Array.isArray(data.sessions)||!Array.isArray(data.targets)||!Array.isArray(data.badges)||!Array.isArray(data.comments)||
   !Array.isArray(data.creditedPracticeByDate)||data.creditedPracticeByDate.length||data.sessions.length!==bindings.length||new Set(data.sessions.map(s=>s.sessionId)).size!==bindings.length)throw Error('PATH projection shape rejected.');
 for(const s of data.sessions){const b=byId.get(s.sessionId);if(!b||!exact(s,['sessionId','date','startTime','endTime','durationMinutes','qualifying','targetId','teacherStatus','teacherNote','reviewedAt'])||s.date!==madridDate(b.endIso)||s.startTime!==b.startIso||s.endTime!==b.endIso||s.durationMinutes!==Math.round(b.durationSeconds/60*100)/100||s.qualifying!==(b.durationSeconds>=300)||
  typeof s.targetId!=='string'||!['','REVIEWED','NEEDS WORK','ACHIEVED'].includes(s.teacherStatus)||typeof s.teacherNote!=='string'||s.teacherNote.length>1250||typeof s.reviewedAt!=='string')throw Error('PATH original evidence rejected.');}
 const qualified=data.sessions.filter(s=>s.qualifying),summary={totalSessions:bindings.length,qualifyingSessions:qualified.length,totalMinutes:data.sessions.reduce((n,s)=>n+s.durationMinutes,0),creditedQualifyingMinutes:qualified.reduce((n,s)=>n+s.durationMinutes,0)};
 if(!exact(data.summary,Object.keys(summary))||Object.keys(summary).some(k=>data.summary[k]!==summary[k]))throw Error('Practice credit mismatch.');
 const people=new Set(bindings.filter(b=>b.durationSeconds>=300&&madridDate(b.endIso)===madridDate(now)).map(b=>b.pupil));
 const group={pipersToday:people.size,bagpipeParts:Math.min(10,people.size),communityBonusPercent:Math.min(20,people.size*2)};
 if(!exact(data.group,Object.keys(group))||Object.keys(group).some(k=>data.group[k]!==group[k]))throw Error('GROUP counts pupils, not sessions.');
 for(const t of data.targets)if(!exact(t,['targetId','title','status','badgeId'])||Object.values(t).some(x=>typeof x!=='string'))throw Error('Target projection rejected.');
 for(const b of data.badges)if(!exact(b,['badgeId','badgeName','description','imageLink'])||Object.values(b).some(x=>typeof x!=='string')||
  (b.imageLink&&!/^https:\/\/raw\.githubusercontent\.com\/Gauchopiper\/pipers-path\/main\/assets\/badges\/[A-Za-z0-9_-]+\.(svg|png|webp)$/.test(b.imageLink)))throw Error('Badge projection rejected.');
 for(const c of data.comments)if(!exact(c,['id','teacher','role','date','text','sessionId'])||Object.values(c).some(x=>typeof x!=='string')||!['OWNER','ASSISTANT'].includes(c.role)||(c.sessionId&&!byId.has(c.sessionId)))throw Error('Foreign comment reference.');
}
module.exports={projectPath,validateProjection,madridDate};
