'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),C=require('node:crypto');
const {profiles,identities}=require('./profile.cjs'),{P,digest}=require('./protocol.cjs');
const {journal}=require('./journal.cjs'),{canonicalAdapter}=require('./canonical-adapter.cjs');
const {sourceAdapter,runtime}=require('./source.cjs'),{openAdapter}=require('./postgres-adapter.cjs');
const {wav,binding}=require('../queue-fixture/canonical-fixture.cjs');
let sequence=0,created=0,removed=0;const registry=new Set();
function directory(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'gdb-stage2g-'));registry.add(d);created++;return d;}
function remove(d){fs.rmSync(d,{recursive:true,force:true});if(fs.existsSync(d))throw Error('Cleanup failed.');registry.delete(d);removed++;}
function key(kid){const p=C.generateKeyPairSync('rsa',{modulusLength:2048});return{kid,pem:p.privateKey.export({type:'pkcs8',format:'pem'}),jwk:p.publicKey.export({format:'jwk'}),publicPem:p.publicKey.export({type:'spki',format:'pem'})};}
const keys={gateway:key('synthetic-gateway-key'),source:key('synthetic-source-key'),service:key('synthetic-service-key')};
const initial=Date.parse('2026-11-01T12:00:00Z');
function ring(k){return{[k.kid]:{jwk:k.jwk,status:'active',notBefore:initial-86400000,notAfter:initial+86400000}};}
async function fixture({pool=null,seconds=1,profileChange={},admit=true}={}){
 const dir=directory(),id=++sequence,clock={value:initial},now=()=>clock.value,authority=profiles({fixtureOnly:true});
 const base={environment:'synthetic-gdb-stage2g-'+id,organisation:'GAITA-DE-BOTO',pupil:'synthetic-dummy-'+id,workbook:'synthetic-dummy-workbook-'+id,folder:'synthetic-dummy-folder-'+id,
  journal:'synthetic-control-journal-'+id,recovery:'synthetic-recovery-'+id,thresholdSeconds:300,owner:'synthetic-owner-'+id,gatewayOrigin:'https://synthetic-stage2g.invalid',policyRevision:1,windowStart:initial-1000,windowEnd:initial+3600000,sessionId:C.randomUUID(),operations:['recording.submit','recording.status','path.read','playback.read'],...profileChange};
 const profile=authority.install(base),ids=identities({fixtureOnly:true}),owner=ids.mint(profile.owner,'owner'),worker=ids.mint('synthetic-database-worker','worker'),recovery=ids.mint('synthetic-recovery-worker','recovery'),execution=ids.mint(profile.owner,'worker'),client=ids.mint(profile.owner,'session');
 const sourceKeys=ring(keys.source),gatewayKeys=ring(keys.gateway),serviceKeys=ring(keys.service),ns={environment:profile.environment,profileDigest:authority.digest(profile)};
 const stageKey=C.randomBytes(32),readKey=C.randomBytes(32);
 let j,canonical,source,store,run;
 function reopenSource(){if(j)j.close();j=journal({fixtureOnly:true,filename:path.join(dir,'source-journal.sqlite'),namespace:ns,key:keys.source,keyring:sourceKeys,now});canonical=canonicalAdapter({fixtureOnly:true,directory:dir,profiles:authority,profile,now});
  source=sourceAdapter({fixtureOnly:true,profile,profiles:authority,identities:ids,canonical,journal:j,sourceKey:keys.source,sourceKeys,gatewayKeys,now});source.setEnabled(true);if(store)run=runtime({store,source,owner,worker,recovery,execution});}
 reopenSource();
 const audio=wav(seconds),b=binding(audio,{pupil:profile.pupil,subject:profile.owner,sessionId:profile.sessionId,startIso:new Date(initial).toISOString(),endIso:new Date(initial+seconds*1000).toISOString()});
 const config={fixtureOnly:true,pool,profiles:authority,profile,identities:ids,now,stageKey,readKey,gatewayKey:keys.gateway,sourceKeys,serviceKeys};
 async function openStore(nextPool=pool){config.pool=nextPool;store=await openAdapter(config);await store.install();run=runtime({store,source,owner,worker,recovery,execution});}
 if(pool){await openStore();if(admit)await store.grant(owner,{expectedRevision:0});}
 const manifest=()=>({binding:b,originalActor:{issuer:'https://accounts.google.com',subject:profile.owner,scope:'google:fixture'},profileDigest:ns.profileDigest,operation:C.randomUUID(),baseVersion:'synthetic-generation:1',admissionRevision:1});
 const f={dir,profile,base,authority,ids,owner,worker,recovery,execution,client,sourceKeys,gatewayKeys,serviceKeys,keys,ns,clock,now,audio,b,stageKey,readKey,config,manifest,
  reopenSource,openStore,submit:()=>store.submit(owner,store.selection,b,audio.toString('base64')),close:()=>{j.close();remove(dir);}};
 for(const k of ['j','canonical','source','store','run'])Object.defineProperty(f,k,{get:()=>({j,canonical,source,store,run})[k]});return f;
}
module.exports={fixture,directory,remove,key,keys,ring,initial,counts:()=>({created,removed,remaining:registry.size}),cleanupAll:()=>{for(const d of registry)remove(d);}};
