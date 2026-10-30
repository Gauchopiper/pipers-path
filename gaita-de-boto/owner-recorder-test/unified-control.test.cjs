// Simulated unified-control tests. No browser, Google server, or real microphone is used.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('  let pendingBlob=null');
const end=html.indexOf('function blobToBase64',begin);
assert(begin>=0&&end>begin,'actual frontend controller must be found');
const controller=new Function('h','with(h){'+html.slice(begin,end)+
  '\nreturn {ready:recoveryReady,ui:()=>recorderUiState,sid:()=>recordingSessionId,duration:()=>activeDurationMs,confirmed:()=>recordingConfirmed,startRecording,stopRecording,pauseRecording,resumeRecording,savePendingRecording};}');
const dictionaries=new Function(html.slice(html.indexOf('  const TEXT = {'),html.indexOf('const t = TEXT[uiLanguage];'))+';return TEXT;')();
assert.deepEqual(Object.keys(dictionaries.EN).sort(),Object.keys(dictionaries.ES).sort());
const authError=require('./ui-test-helpers.cjs').isAuthorizationError;
for(const message of ['Pupil link is not authorised.','Owner-only test.','Permission denied'])assert(authError(Error(message)));
assert(!authError(Error('network unavailable')));
assert.match(dictionaries.ES.authorizationError,/Acceso denegado/);
async function scenario({steps=[],activeMs,offline=false,reopen=false,lost=false,finishPaused=false,language="EN"}){
  let clock=0,online=true,row=null,uploads=0,queries=0,saved=false,loseNext=lost;
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{
      textContent:'',hidden:false,disabled:false,style:{},
      focus(){h.document.activeElement=this;},addEventListener(type,fn){this[type]=fn;},pause(){},removeAttribute(){}
    });
    return elements.get(id);
  }
  class FakeBlob{
    constructor(parts,opts={}){this.type=opts.type||'';this.size=parts.reduce((n,p)=>n+(p.size||p.length||1),0);}
    async arrayBuffer(){return new ArrayBuffer(this.size);}
  }
  class FakeRecorder{
    static isTypeSupported(){return true;}
    constructor(stream,opts){this.mimeType=opts.mimeType||'audio/webm';this.state='inactive';this.handlers={};}
    addEventListener(type,handler){this.handlers[type]=handler;}
    start(){this.state='recording';}
    pause(){assert.equal(this.state,'recording');this.state='paused';}
    resume(){assert.equal(this.state,'paused');this.state='recording';}
    stop(){assert.notEqual(this.state,'inactive');this.state='inactive';this.handlers.dataavailable({data:new FakeBlob([new Uint8Array(64)],{type:this.mimeType})});this.handlers.stop();}
  }
  const store={
    slot:'isolated-test-slot',async read(){return row;},
    async put(item){if(row)assert.equal(row.sessionId,item.sessionId);row=item;},
    async remove(sid){assert.equal(row.sessionId,sid);row=null;}
  };
  const h={
    isAuthorizationError:require('./ui-test-helpers.cjs').isAuthorizationError,pupilId:'dummy',accessKey:'test-only-not-a-secret',t:dictionaries[language],
    document:{getElementById:element},
    window:{addEventListener(){},MediaRecorder:FakeRecorder,AudioContext:class{
      async decodeAudioData(){return {duration:activeMs/1000};}
      async close(){}
    }},
    navigator:{get onLine(){return online;},
      mediaDevices:{async getUserMedia(){return {getTracks(){return [{stop(){}}];}};}},
      storage:{persist:async()=>true}},
    performance:{now:()=>clock},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
    Blob:FakeBlob,MediaRecorder:FakeRecorder,GaitaPendingStore:{open:async()=>store},
    practiceTarget:{value:''},targetStatus:{textContent:''},newId:()=> 'test-session-id',
    setInterval:()=>123,clearInterval(){},setTimeout:()=>123,clearTimeout(){},
    confirm:()=>false,gaitaBackendUrl_:()=> 'backend',blobToBase64:async()=> 'audio-fixture',
    tagSavedRecording:async()=>{assert.equal(page.ui(),'saved','confirmation must immediately leave SAVING before target read');},console:{warn(){}},
    fetch:async(_,options)=>{
      const p=JSON.parse(options.body);
      if(p.action==='getRecordingState'){
        queries++;if(!online)throw Error('offline');
        return {json:async()=>saved?{ok:true,sessionId:'test-session-id',saved:true,fileUrl:'fixture'}:
          {ok:true,sessionId:'test-session-id',state:'absent',retrySafe:true}};
      }
      uploads++;assert.equal(p.durationSeconds,activeMs/1000);
      assert(Math.abs((Date.parse(p.endIso)-Date.parse(p.startIso))/1000-p.durationSeconds)<.002);
      saved=true;if(loseNext){loseNext=false;throw Error('simulated lost reply');}
      return {json:async()=>({ok:true,sessionId:'test-session-id',fileUrl:'fixture'})};
    }
  };
  let page=controller(h);await page.ready;
  assert.equal(page.ui(),'ready');
  element('localProtection').textContent=dictionaries[language].confirmedCleanup;
  element('durationEvidence').textContent='old duration';
  element('recordButton').focus();
  await page.startRecording();assert.equal(page.ui(),'recording');
  assert.equal(element('localProtection').textContent,dictionaries[language].newRecordingProtection);
  assert.equal(element('durationEvidence').textContent,'');
  assert.equal(element('timer').textContent,'00:00');
  assert.equal(h.document.activeElement,element('pauseButton'));
  assert.equal(element('pauseButton').textContent,dictionaries[language].pauseButton);
  const sid=page.sid();let elapsed=0;
  for(const [recordMs,pausedMs] of steps){
    clock+=recordMs;elapsed+=recordMs;
    element('pauseButton').click();assert.equal(page.ui(),'paused');
    assert.equal(element('pauseButton').textContent,dictionaries[language].resumeButton);
    const before=page.duration();element('pauseButton').click();assert.equal(page.duration(),before,'double tap must not resume');
    clock+=pausedMs;assert.equal(page.duration(),before,'pause excluded');
    if(!finishPaused){element('pauseButton').click();assert.equal(page.ui(),'recording');}
  }
  if(!finishPaused)clock+=activeMs-elapsed;
  if(offline)online=false;
  element('finishButton').focus();
  element('finishButton').click();element('finishButton').click();
  assert.equal(h.document.activeElement,element('savingIndicator'));
  for(let i=0;i<30;i++)await Promise.resolve();
  assert.equal(page.sid(),sid);
  assert.equal(page.duration(),activeMs);
  assert.equal(page.ui(),offline?'retry':'saved');
  if(offline){
    assert(row&&row.sessionId===sid);
    assert.equal(uploads,0);
    if(reopen){
      online=true;h.t=dictionaries[language==='EN'?'ES':'EN'];page=controller(h);await page.ready;
      assert.equal(page.ui(),'retry');assert.equal(page.sid(),sid);
      const protectedBefore=row;await page.startRecording();assert.equal(row,protectedBefore);assert.equal(page.sid(),sid);
      assert.equal(element('localProtection').textContent,h.t.restoredProtection);
      await page.savePendingRecording();
    }
  }
  assert.equal(page.ui(),'saved');
  assert.equal(page.confirmed(),true);
  assert.equal(uploads,1,'no duplicate uploads');
  assert.equal(row,null,'confirmed pending recording removed');
  return {activeMs,queries,uploads,offline,lost,finishPaused};
}
(async()=>{
 const cases=[
  {steps:[[180000,120000]],activeMs:300000},
  {steps:[[120000,300000],[70000,140000]],activeMs:299875},
  {steps:[[5000,600000]],activeMs:5000,finishPaused:true},
  {steps:[[10000,3000]],activeMs:24000,offline:true,reopen:true},
  {steps:[[3500,3000]],activeMs:8000,lost:true}
 ];
 for(const language of ['EN','ES'])for(const testCase of cases)console.log('PASS simulated unified recorder '+language,await scenario({...testCase,language}));
})().catch(err=>{console.error(err);process.exitCode=1;});
