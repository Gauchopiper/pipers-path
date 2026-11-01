'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const {proposedSource}=require('./writer-proposal.cjs');
const {hash}=require('../queue-fixture/postgres.cjs');
function canonicalAdapter({fixtureOnly=false,directory,profiles,profile,now}){
  if(!fixtureOnly)throw Error('Offline canonical VM required.');
  const filename=path.join(directory,'canonical.json'),trusted=new WeakSet();let hook=null,mode=null,depth=0,maxDepth=0,locks=0,calls=0;
  let state=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{books:{},files:[]};
  const opBook='synthetic-operational-workbook',opFolder='synthetic-operational-recordings';
  const files=new Map(state.files.map(f=>[f.url,{...f,bytes:Buffer.from(f.base64,'base64')}]));
  function persist(){state.files=[...files.values()].map(f=>({...f,bytes:undefined,base64:f.bytes.toString('base64')}));fs.writeFileSync(filename+'.tmp',JSON.stringify(state));fs.renameSync(filename+'.tmp',filename);}
  function sheet(book,name){const tables=state.books[book];if(!tables[name])return null;return{
    getLastRow:()=>tables[name].length,getDataRange:()=>({getValues:()=>tables[name].map(r=>r.slice())}),
    appendRow(r){tables[name].push(Array.from(r));persist();if(mode==='after-log'&&name==='PRACTICE LOG'){mode=null;throw Error('Interrupted after LOG.');}},
    getRange(r,c,n=1,m=1){return{getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>tables[name][r-1+i]?.[c-1+j]??'')),
      setValue(v){tables[name][r-1][c-1]=v;persist();},setValues(v){for(let i=0;i<v.length;i++)for(let j=0;j<v[i].length;j++)tables[name][r-1+i][c-1+j]=v[i][j];persist();}};}
  };}
  const books={};function book(id){if(!books[id])books[id]={id,getSheetByName:n=>sheet(id,n),insertSheet(n){state.books[id][n]=[];persist();return sheet(id,n);}};return books[id];}
  const context=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>({GDB_PUPIL_DATA_SHEET_ID:opBook,GDB_PUPIL_RECORDINGS_FOLDER_ID:opFolder,GDB_QUALIFY_MINUTES:'5'})[k]})},
    SpreadsheetApp:{openById:id=>{if(!state.books[id])throw Error('Unknown workbook.');return book(id);},flush(){persist();}},
    LockService:{getScriptLock:()=>({waitLock(){if(depth)throw Error('Nested ScriptLock rejected.');depth++;locks++;maxDepth=Math.max(maxDepth,depth);},releaseLock(){if(depth!==1)throw Error('Lock imbalance.');depth--;}})},
    Session:{getActiveUser:()=>({getEmail:()=> 'synthetic-owner@example.invalid'}),getEffectiveUser:()=>({getEmail:()=> 'synthetic-owner@example.invalid'})},
    Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),formatDate:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d)),
      newBlob:(bytes,mime,name)=>({bytes:Buffer.from(bytes),mime,name})},
    DriveApp:{getFolderById:folder=>({createFile(blob){if(depth!==1)throw Error('Writer outside original lock.');
      if(![opFolder,profile.folder].includes(folder))throw Error('Cross-environment folder.');
      if(mode==='before-file'){mode=null;throw Error('Interrupted after STARTED.');}
      const id=randomUUID(),url='https://drive.google.com/file/d/'+id+'/view';files.set(url,{id,url,folder,private:true,...blob});persist();
      if(mode==='after-file'){mode=null;throw Error('Interrupted after file.');}return{getUrl:()=>url};}})},
    gdbGTrusted_(t,ss,id){profiles.assert(profile,{environment:profile.environment,organisation:profile.organisation,pupil:profile.pupil},now(),'recording.submit');
      if(!trusted.has(t)||t!==profile||ss!==book(profile.workbook)||id!==profile.pupil)throw Error('Untrusted canonical profile.');},
    gdbGBefore_(t){if(depth!==1||!trusted.has(t))throw Error('Trusted original lock required.');if(hook)hook();}
  });
  vm.runInContext(proposedSource().result+'\n'+fs.readFileSync(path.join(__dirname,'../../apps-script/pupil/MediaDuration.gs'),'utf8'),context);
  const schemas=vm.runInContext('GDB_PUPIL_SCHEMAS',context);
  for(const id of [opBook,profile.workbook])if(!state.books[id]){state.books[id]={};for(const [name,h]of Object.entries(schemas))state.books[id][name]=[Array.from(h)];}
  trusted.add(profile);persist();
  function upload(binding,audio,before){hook=before;calls++;try{return context.gdbPWriteCore_(book(profile.workbook),profile.pupil,{sessionId:binding.sessionId,
    mimeType:binding.mimeType,audioBase64:audio.toString('base64'),startIso:binding.startIso,endIso:binding.endIso,durationSeconds:binding.durationSeconds},profile);}finally{hook=null;persist();}}
  function snapshot(manifest){const b=manifest.binding,tables=state.books[profile.workbook];const logs=tables['PRACTICE LOG'].slice(1).filter(r=>r[7]===b.sessionId),urls=new Set(logs.map(r=>r[6]));return{
    organisation:profile.organisation,pupil:profile.pupil,manifest:{binding:b,state:'dispatched'},logs,
    metas:tables['SESSION META'].slice(1).filter(r=>r[6]===b.sessionId||urls.has(r[0])),
    journal:(tables['RECORDING RECEIPTS']||[]).slice(1).filter(r=>r[0]===b.sessionId),
    sessionFiles:[...files.values()].filter(f=>f.name.startsWith(b.sessionId+'.')||urls.has(f.url)).map(f=>({id:f.id,folder:f.folder,private:f.private,mime:f.mime,bytes:Buffer.from(f.bytes)})),qualifyMinutes:5};}
  return{upload,snapshot,mediaSeconds:(audio,mime)=>context.gdbPMediaSeconds_(Array.from(audio),mime),persist,files,state,context,book,opBook,opFolder,
    tables:()=>state.books[profile.workbook],setMode:x=>{mode=x;},stats:()=>({depth,maxDepth,locks,calls,files:files.size}),
    legacy(binding,audio){return context.gdbPUpload_(book(opBook),binding.pupil,{sessionId:binding.sessionId,mimeType:binding.mimeType,audioBase64:audio.toString('base64'),startIso:binding.startIso,endIso:binding.endIso,durationSeconds:binding.durationSeconds});},
    digestFile:id=>hash([...files.values()].find(f=>f.id===id).bytes)};
}
module.exports={canonicalAdapter};
