'use strict';
// INACTIVE procedure-only adapter. Separate pools must be genuinely separately
// authenticated in any future native port. No DSN, listener, credential or Google caller.
const C=require('node:crypto');
const {P,digest,exact,checked}=require('../stage2g-fixture/protocol.cjs');
const {seal,unseal}=require('../stage2g-fixture/postgres-adapter.cjs');
const SURFACE={gateway:['submit_original','recording_status'],worker:['claim_recording','arm_recording','mark_attention','dispatch_read'],reader:['create_read','release_read'],admission:['set_admission'],verifier:['verification_context','confirm_source_receipt','stage_verified_read','finish_revision'],recovery:['request_reconciliation'],coordinator:['begin_revision']};
const sha=b=>C.createHash('sha256').update(b).digest('hex');
const KEYS=['organisation','environment','profile','pupil','actor','session','hash','length','mime','seconds','start','end'];
function manifest(m,scope){P.canonical(m);if(!exact(m,KEYS)||m.organisation!=='GDB'||m.environment!==scope.environment||m.profile!==scope.profile||m.pupil!==scope.pupil||m.actor!==scope.actor||typeof m.session!=='string'||!Number.isSafeInteger(m.length)||m.length<=0||!Number.isFinite(m.seconds)||m.seconds<=0||!['audio/wav','audio/webm'].includes(m.mime)||!/^[a-f0-9]{64}$/.test(m.hash)||!Number.isFinite(Date.parse(m.start))||!Number.isFinite(Date.parse(m.end))||Date.parse(m.end)<=Date.parse(m.start))throw Error('Original manifest rejected.');return m;}
const toCipher=x=>({iv:x.iv.toString('hex'),tag:x.tag.toString('hex'),bytes:x.cipher.toString('hex')});
const fromCipher=x=>({iv:Buffer.from(x.iv,'hex'),tag:Buffer.from(x.tag,'hex'),cipher:Buffer.from(x.bytes,'hex')});
function openService({fixtureOnly,role,pool,scope,integrity}){
 if(!fixtureOnly||!SURFACE[role]||!pool?.query||typeof integrity!=='function'||!exact(scope,['environment','profile','actor','pupil']))throw Error('Inactive service configuration rejected.');
 // Scope is frozen, selectors are never SQL identifiers, one statement/transaction.
 const bound=Object.freeze({...scope});
 return Object.freeze({role,scope:bound,async call(name,args={}){if(!SURFACE[role].includes(name)||!exact(args,Object.keys(args))||Object.keys(args).some(k=>Object.hasOwn(bound,k)))throw Error('Procedure authority rejected.');integrity();P.canonical(args);const q={...bound,...args};const r=await pool.query('SELECT gdbj.'+name+'($1::jsonb) AS value',[JSON.stringify(q)]);return r.rows[0].value;}});
}
function submitter({service,stageKey,validateMedia}){
 if(service.role!=='gateway'||typeof validateMedia!=='function')throw Error('Gateway configuration rejected.');
 return async(m,audio,operation)=>{manifest(m,service.scope);if(!Buffer.isBuffer(audio)||audio.length!==m.length||sha(audio)!==m.hash)throw Error('Original bytes rejected.');const duration=await validateMedia(audio,m.mime);if(duration!==m.seconds)throw Error('Independent duration mismatch.');const hash=digest(m);return service.call('submit_original',{sid:m.session,manifest:m,manifestHash:hash,operation,cipher:toCipher(seal(stageKey,audio,hash))});};
}
function sourceReceipt({sourceKeys,namespace,now,m,operation,baseRevision,admissionRevision,signed}){
 const v=checked(sourceKeys,'recording.receipt',namespace,signed,now(),{historical:true}).payload;
 if(!exact(v,['manifest','manifestHash','operation','baseRevision','admissionRevision','threshold','qualifying','fileDigest','logDigest','metaDigest'])||digest(v.manifest)!==digest(m)||v.manifestHash!==digest(m)||v.operation!==operation||v.baseRevision!==baseRevision||!Number.isSafeInteger(v.admissionRevision)||v.admissionRevision<admissionRevision||v.threshold!==300||v.qualifying!==(m.seconds>=300)||v.fileDigest!==m.hash||!['logDigest','metaDigest'].every(k=>typeof v[k]==='string'&&/^[a-f0-9]{64}$/.test(v[k])))throw Error('Exact authenticated receipt rejected.');
 return {...v,sourceProof:signed};
}
function verifier({service,sourceKeys,namespace,now,readKey}){
 if(service.role!=='verifier')throw Error('Separate verifier authority required.');
 const context=()=>service.call('verification_context');
 return Object.freeze({async confirm(signed){const ctx=await context();if(!ctx.job)throw Error('No original.');const j=ctx.job,v=sourceReceipt({sourceKeys,namespace,now,m:j.manifest,operation:j.operation,baseRevision:j.base_revision,admissionRevision:j.admission_revision,signed});
 const b=JSON.parse(signed.wire);return service.call('confirm_source_receipt',{sid:j.sid,receipt:v,nonce:b.nonce,proofDigest:digest(signed)});},
 async finish(signed){const b=checked(sourceKeys,'operation.receipt',namespace,signed,now()),v=b.payload;if(!exact(v,['operation','requestDigest','sourceDigest'])||!v.sourceDigest||!/^[a-f0-9]{64}$/.test(v.sourceDigest))throw Error('Revision proof rejected.');return service.call('finish_revision',{operation:v.operation,requestDigest:v.requestDigest,proofDigest:digest(signed),nonce:b.nonce});},
 async stage({signed,data}){const v=checked(sourceKeys,'read.result',namespace,signed,now()).payload,ctx=await context();if(!exact(v,['id','requestDigest','dataDigest','version','admissionRevision','operation','session','client'])||v.dataDigest!==digest(data)||v.version!==Number(ctx.revision.n)||v.admissionRevision!==Number(ctx.policy.revision))throw Error('Read source binding rejected.');
 const row=ctx.reads.find(x=>x.id===v.id);if(!row||row.client!==v.client||row.op!==v.operation||row.sid!==v.session||row.request_digest!==v.requestDigest||Number(row.version)!==v.version||Number(row.access_revision)!==v.admissionRevision)throw Error('Original read identity rejected.');
 // Deliberately narrow fixture projection; no raw Drive locator is an allowed field.
 const expected=projection(ctx,v.operation,v.session);if(digest(expected)!==digest(data))throw Error('Source projection rejected.');
 const payload={signed,data},cipher=toCipher(seal(readKey,Buffer.from(P.canonical(payload)),v.id));return service.call('stage_verified_read',{id:v.id,requestDigest:v.requestDigest,proofDigest:digest(payload),cipher});},context});
}
function projection(ctx,op,sid){const j=ctx.job,rows=j?.phase==='confirmed'?[{sid:j.sid,pupil:j.manifest.pupil,hash:j.manifest.hash,seconds:j.manifest.seconds,qualifying:j.manifest.seconds>=300}]:[];
 if(op==='path.read'&&sid===null)return{sessions:rows,totalSeconds:rows.reduce((n,x)=>n+x.seconds,0),qualifyingSessions:rows.filter(x=>x.qualifying).length,groupDistinctPupils:new Set(rows.filter(x=>x.qualifying).map(x=>x.pupil)).size,badges:[]};
 // Playback bytes/projection need their own bounded independent decoder port.
 throw Error('Projection operation not implemented; fail closed.');}
function reader({service,sourceKeys,namespace,now,readKey}){if(service.role!=='reader')throw Error('Reader authority rejected.');return async(id,client)=>{const r=await service.call('release_read',{id,client}),bytes=unseal(readKey,fromCipher(r.cipher),id),v=JSON.parse(bytes.toString());if(digest(v)!==r.proofDigest)throw Error('Staged ciphertext changed.');const b=checked(sourceKeys,'read.result',namespace,v.signed,now()).payload;
 if(b.id!==id||b.client!==client||b.version!==r.version||b.admissionRevision!==r.admissionRevision||b.operation!==r.operation||b.session!==r.sid||b.requestDigest!==r.requestDigest||b.dataDigest!==digest(v.data))throw Error('Final source proof rejected.');return v.data;};}
module.exports={SURFACE,openService,submitter,verifier,sourceReceipt,reader,projection,manifest,toCipher,fromCipher};
