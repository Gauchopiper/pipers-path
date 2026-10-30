'use strict';
// Server-only boundary. Transport must select the private Gaita workbook itself.
// Never export raw PUPILS rows (columns 5-7 contain legacy capabilities/links).
function canonicalPupils({readRows,createInactive,profile,organisation}){
 if(organisation!=='GAITA-DE-BOTO')throw Error('Invalid canonical organisation.');
 async function get(id){
  const rows=await readRows();
  if(!Array.isArray(rows))throw Error('Canonical data unavailable.');
  const matches=rows.filter(r=>Array.isArray(r)&&String(r[0])===id);
  if(matches.length>1)throw Error('Duplicate canonical ID; manual review required.');
  if(!matches.length)return null;
  const r=matches[0];
  return {id:String(r[0]),name:String(r[1]),legacyActive:String(r[2])==='Yes',language:String(r[3])};
 }
 return {get,exists:async id=>!!await get(id),async kind(id){
  if(!await get(id))throw Error('Unknown canonical pupil.');
  const p=await profile(id);
  if(!p||!['adult','child'].includes(p.kind)||!p.evidence)throw Error('Verified canonical classification required.');
  return p.kind;
 },async create({operation,name,language}){
  // Existing Teacher writer must retain its ScriptLock, UUID and name-dedup checks.
  const result=await createInactive(name,language,operation);
  if(!result?.ok||result.id!==operation)throw Error('Canonical creation unconfirmed.');
  const row=await get(operation);
  if(!row||row.legacyActive||row.language!==language)throw Error('Canonical creation unconfirmed.');
  return row;
 }};
}
module.exports={canonicalPupils};
