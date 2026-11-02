'use strict';
const fs = require('node:fs'), {join} = require('node:path'), {tmpdir} = require('node:os');
const {generateKeyPairSync, randomBytes, randomUUID} = require('node:crypto');
const P = require('./protocol.cjs'), {C} = P;
const {openStore} = require('../option-c-fixture/store.cjs');
const {googleDouble} = require('../option-c-fixture/google-double.cjs');
const {pipeline} = require('../option-c-fixture/pipeline.cjs');
const {wav, binding} = require('../queue-fixture/canonical-fixture.cjs');
const {gateway} = require('./gateway.cjs'), {ownerRuntime, browserRelay} = require('./owner-runtime.cjs');
const key = () => generateKeyPairSync('rsa', {modulusLength:2048,
  publicKeyEncoding:{type:'spki',format:'pem'}, privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const gatewayKeys = key(), googleKeys = key(), serviceKeys = key();
function fixture() {
  let time = 1000000;
  const directory = fs.mkdtempSync(join(tmpdir(), 'gdb-option-c-')); fs.chmodSync(directory,0o700);
  const identities = C.fixtureIdentities({fixtureOnly:true}), authority = P.authority({fixtureOnly:true});
  const keyValues = {'gateway-sign':gatewayKeys.privateKey, 'gateway-verify':gatewayKeys.publicKey,
    'google-sign':googleKeys.privateKey, 'service-sign':serviceKeys.privateKey, 'read-staging':randomBytes(32)};
  const missing = new Set(), flags = {gateway:true, owner:true, recovery:true, service:true};
  const config = {fixtureOnly:true, directory, identities, authority, ownerSubject:'synthetic-owner',
    workerSubject:'synthetic-db-worker', callerSubject:'synthetic-owner-execution-role',
    profile:{environment:'fixture-owner-pull',organisation:'GAITA-DE-BOTO',pupil:'synthetic-dummy',
      workbook:'synthetic-owner-pull-workbook',folder:'synthetic-gaita-folder'},
    stageKey:randomBytes(32), gatewayPrivateKey:gatewayKeys.privateKey,gatewayPublicKey:gatewayKeys.publicKey,
    googlePrivateKey:googleKeys.privateKey,googlePublicKey:googleKeys.publicKey,servicePublicKey:serviceKeys.publicKey,
    now:()=>time, windowStart:time, windowEnd:time+1800000, maxDispatches:6,
    keys:name=>{if(missing.has(name)||!keyValues[name])C.fail('Fixture key unavailable: '+name);return keyValues[name];}};
  const owner = identities.actor(config.ownerSubject), client = authority.session(owner);
  const f = {config, directory, identities, authority, owner, client, flags, missing,
    manual:authority.execution(config.ownerSubject), web:authority.execution(config.ownerSubject,'owner-web'),
    trigger:authority.execution(config.ownerSubject,'trigger'),
    selection:{environment:config.profile.environment,organisation:config.profile.organisation,pupil:config.profile.pupil},
    advance:ms=>{time+=ms;},
    open() {
      f.store=openStore(config); f.google=googleDouble(config);
      f.locks={depth:0,max:0,acquires:0,releases:0}; f.remote=[];
      const originalLock=f.google.canonical.context.LockService.getScriptLock;
      f.google.canonical.context.LockService.getScriptLock=()=>{
        const lock=originalLock(); return {waitLock(ms){lock.waitLock(ms);f.locks.depth++;f.locks.acquires++;f.locks.max=Math.max(f.locks.max,f.locks.depth);},
          releaseLock(){lock.releaseLock();f.locks.depth--;f.locks.releases++;}};
      };
      const remote=label=>{
        P.noTransaction(f.store.db,f.google.db);
        if(f.locks.depth!==0)C.fail('Remote operation while canonical ScriptLock held.');
        f.remote.push(label);
      };
      for(const method of ['dispatch','inspectRequest','read']){
        const original=f.google[method]; f.google[method]=(...args)=>{remote('canonical.'+method);return original(...args);};
      }
      const upload=f.google.canonical.writer.upload;
      f.google.canonical.writer.upload=(...args)=>{P.noTransaction(f.store.db,f.google.db);return upload(...args);};
      f.gateway=gateway({...config,store:f.store,enabled:()=>flags.gateway,serviceEnabled:()=>flags.service});
      f.transport=P.mockHttps({fixtureOnly:true,route:(...args)=>f.gateway.route(...args),before:()=>remote('mock-HTTPS')});
      f.runtime=ownerRuntime({...config,store:f.store,google:f.google,transport:f.transport,
        enabled:()=>flags.owner,recoveryEnabled:()=>flags.recovery});
      f.relay=browserRelay({fixtureOnly:true,runtime:f.runtime});
      f.oldPipe=pipeline({...config,store:f.store,google:f.google});
    },
    reopen(){f.store.close();f.google.close();f.open();},
    admit(operations=C.operations){return f.store.changeAdmission(owner,f.selection,{action:'admit',
      expectedRevision:f.store.admission().revision,expires:time+3600000,operations});},
    revoke(){return f.store.changeAdmission(owner,f.selection,{action:'revoke',expectedRevision:f.store.admission().revision,expires:time,operations:[]});},
    input(seconds=1,overrides={}){const audio=wav(seconds),b=binding(audio,overrides);return {audio,encoded:audio.toString('base64'),
      recording:Object.fromEntries(['sessionId','hash','length','mimeType','durationSeconds','startIso','endIso'].map(k=>[k,b[k]]))};},
    submit(input=f.input()){f.store.submission(owner,f.selection,input.recording,input.encoded,f.google.mediaSeconds);return input.recording.sessionId;},
    status:sid=>f.store.status(owner,f.selection,sid),
    delivery(){return f.store.db.prepare('SELECT * FROM otr_deliveries ORDER BY rowid DESC LIMIT 1').get();},
    createRead(operation='path.read',payload={},clientSession=client){return f.gateway.newRead(owner,f.selection,clientSession,operation,payload);},
    release:q=>f.gateway.release(owner,f.selection,client,q.readId),
    async saved(input=f.input()){const sid=f.submit(input);await f.runtime.runOnce(f.manual);if(!f.status(sid).saved)C.fail('Setup recording unconfirmed.');return sid;},
    operation:event=>({operation:randomUUID(),event,expectedVersion:f.store.version(),value:'synthetic-change'}),
    sourceDigest(){return C.digest({tables:f.google.canonical.tables,files:[...f.google.canonical.files].map(([url,v])=>({url,name:v.name,
      folder:v.folder,mime:v.mime,hash:C.hash(v.input)}))});},
    close(){try{f.store.close();}finally{try{f.google.close();}finally{fs.rmSync(directory,{recursive:true,force:true});}}}
  };
  f.open();return f;
}
module.exports={fixture,P,C,gatewayKeys,googleKeys,serviceKeys};
