'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(options={}) {
  let now=100000,mono=0,gets=0,permissionResolve;const events=[],protectedTakes=[],retained=[],warnings=[],chunks=[];
  class Track extends EventTarget {stop(){events.push('track-stop');} }
  const track=new Track(),stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  class MR extends EventTarget {
    static isTypeSupported(t){return options.mp4?t==='audio/mp4':t.startsWith('audio/webm');}
    constructor(s,o){super();this.mimeType=o.mimeType;this.state='inactive';MR.last=this;}
    start(ms){events.push('start');this.timeslice=ms;this.state='recording';}
    data(value){const e=new Event('dataavailable');e.data=new Blob([value]);this.dispatchEvent(e);}
    stop(){this.state='inactive';queueMicrotask(()=>{this.data('tail');events.push('final-data');this.dispatchEvent(new Event('stop'));});}
  }
  const journal={async begin(c){events.push('journal-begin');if(options.beginFailure)throw Error('quota');},async append(id,index,blob){if(options.writeFailure)throw Error('quota');chunks.push({id,index,blob});},async remove(id){events.push('journal-remove');}};
  const ctx=vm.createContext({Blob,Event,EventTarget,crypto,Uint8Array,DataView,TextDecoder,Date:{now:()=>now},performance:{now:()=>mono},setInterval:()=>1,clearInterval:()=>{},MediaRecorder:MR,
    navigator:{mediaDevices:{getUserMedia:()=>{gets++;return options.slow?new Promise(r=>{permissionResolve=r;}):Promise.resolve(stream);}}},
    EMGTWebM:{normalize:()=>({bytes:new Uint8Array([1,2,3]),durationSeconds:options.content||mono/1000})}});
  vm.runInContext(fs.readFileSync(require.resolve('../reliability/recorder.js'),'utf8'),ctx);
  const c=new ctx.EMGTRecorder({journal,target:()=>options.target||'target-a',state:s=>events.push(s),timer:()=>{},warning:x=>warnings.push(x),error:e=>events.push('error'),preview:()=>{},
    protect:async(blob,take)=>{if(options.protectFailure)throw Error('storage');protectedTakes.push({blob,context:{...take}});},retain:(raw,t,e)=>retained.push({raw,t,e})});
  return {c,MR,track,events,chunks,protectedTakes,retained,warnings,gets:()=>gets,resolve:()=>permissionResolve(stream),advance:s=>{now+=s*1000;mono+=s*1000;}};
}
(async()=>{
  for(const seconds of [30,60,299,300,480,900]) {
    const f=fixture();await f.c.start();f.MR.last.data('first');f.advance(seconds);f.c.stop();await tick();await tick();
    assert.equal(f.c.state,'idle');assert.equal(f.protectedTakes.length,1);assert.equal(f.retained.length,0);
    assert.equal(f.protectedTakes[0].context.durationSeconds,seconds);assert.equal(f.MR.last.timeslice,5000);
    assert.deepEqual(f.chunks.map(x=>x.index),[0,1]);assert.ok(f.events.indexOf('final-data')<f.events.indexOf('track-stop'));
    assert.ok(f.events.indexOf('journal-begin')<f.events.indexOf('start'));
    console.log(`PASS simulated recorder ${seconds}s: final chunk retained, frozen duration, orderly stop`);
  }
  {
    const f=fixture({slow:true});const a=f.c.start(),b=f.c.start();assert.equal(f.gets(),1);f.resolve();await a;await b;
    const id=f.c.take.sessionId;f.advance(30);f.c.stop();const ignored=f.c.start();await ignored;await tick();await tick();assert.equal(f.gets(),1);assert.equal(f.protectedTakes[0].context.sessionId,id);
    const next=f.c.start();assert.notEqual(f.c.take.sessionId,id);f.resolve();await next;
    f.advance(1);f.c.stop();await tick();await tick();
    console.log('PASS duplicate start and STOP/start race guards');
  }
  for(const opts of [{writeFailure:true},{protectFailure:true},{mp4:true}]) {
    const f=fixture(opts);await f.c.start();f.MR.last.data('first');f.advance(30);f.c.stop();await tick();await tick();
    assert.equal(f.retained.length,1);assert.equal(f.protectedTakes.length,0);assert.equal(f.c.state,'idle');
    assert.equal(await f.retained[0].raw.text(),'firsttail');assert.ok(!f.events.includes('journal-remove'));
  }
  console.log('PASS storage failures and unsupported format preserve raw sound without uploading');
  {
    const f=fixture({beginFailure:true});await f.c.start();assert.equal(f.c.state,'idle');assert.ok(!f.events.includes('start'));assert.ok(f.events.includes('track-stop'));
    console.log('PASS unavailable journal blocks unsafe capture');
  }
  {
    const f=fixture({content:20});await f.c.start();f.advance(60);f.track.dispatchEvent(new Event('mute'));await tick();await tick();
    assert.equal(f.protectedTakes[0].context.durationSeconds,20);assert.ok(f.warnings.includes('interrupted'));assert.equal(f.c.state,'idle');
    console.log('PASS interrupted capture saves content duration rather than elapsed time');
  }
  {
    const f=fixture();await f.c.start();f.advance(30);f.MR.last.stop();await tick();await tick();
    assert.equal(f.c.state,'idle');assert.equal(f.protectedTakes[0].context.interrupted,true);
    console.log('PASS unsolicited recorder stop ends the timer and finalizes audio');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
