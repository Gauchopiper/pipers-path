/* Capture state is local to each take. The UI cannot overlap starts/stops. */
(function(root) {
  'use strict';
  class Recorder {
    constructor(config) { this.c=config; this.state='idle'; this.take=null; }
    setState(value) { this.state=value; this.c.state(value); }
    async start() {
      if (this.state!=='idle') return;
      this.setState('starting');
      const take={sessionId:crypto.randomUUID(),targetId:this.c.target(),chunks:[],writes:Promise.resolve(),index:0,interrupted:false};
      this.take=take;
      try {
        take.stream=await navigator.mediaDevices.getUserMedia({audio:true});
        let options={};
        for (const mimeType of ['audio/webm;codecs=opus','audio/webm','audio/mp4']) {
          if (MediaRecorder.isTypeSupported(mimeType)) { options={mimeType}; break; }
        }
        const mr=take.recorder=new MediaRecorder(take.stream,options);
        take.mimeType=mr.mimeType||options.mimeType;
        take.startedAt=Date.now(); take.startedMono=performance.now();
        // Starting must fail before recording if no durable journal is available.
        await this.c.journal.begin({id:take.sessionId,mimeType:take.mimeType,startedAt:take.startedAt,targetId:take.targetId});
        mr.addEventListener('dataavailable',e=>{
          if (!e.data || !e.data.size) return;
          take.chunks.push(e.data); const index=take.index++;
          take.writes=take.writes.then(()=>this.c.journal.append(take.sessionId,index,e.data));
          take.writes.catch(()=>{take.storageFailed=true; this.c.warning('storage'); this.stop(true);});
        });
        mr.addEventListener('error',()=>this.stop(true));
        mr.addEventListener('stop',()=>{ this.finish(take).catch(e=>this.c.error(e)); });
        for (const track of take.stream.getAudioTracks()) {
          track.addEventListener('ended',()=>this.stop(true));
          track.addEventListener('mute',()=>this.stop(true));
        }
        mr.start(5000); // Browser delivery can be delayed; this is not the duration clock.
        take.startedAt=Date.now(); take.startedMono=performance.now();
        this.setState('recording');
        take.timer=setInterval(()=>this.c.timer(Math.floor((performance.now()-take.startedMono)/1000)),250);
        try {
          if (navigator.wakeLock) {
            const wake=await navigator.wakeLock.request('screen');
            if (this.take===take && this.state==='recording') take.wake=wake;
            else wake.release().catch(()=>{});
          }
        } catch (_) { /* optional */ }
      } catch(e) {
        if (take.stream) take.stream.getTracks().forEach(t=>t.stop());
        this.take=null; this.setState('idle'); this.c.error(e);
      }
    }
    stop(interrupted=false) {
      const take=this.take;
      if (!take || !['recording','starting'].includes(this.state)) return;
      take.interrupted=take.interrupted||interrupted;
      if (!take.recorder || this.state==='starting') return;
      take.stoppedAt=Date.now(); take.elapsedSeconds=(performance.now()-take.startedMono)/1000;
      clearInterval(take.timer); this.c.timer(Math.floor(take.elapsedSeconds));
      this.setState('stopping');
      // Release tracks only after final dataavailable and stop.
      if (take.recorder.state!=='inactive') take.recorder.stop();
    }
    async finish(take) {
      if (take!==this.take) return;
      if (!take.stoppedAt) {
        take.interrupted=true; take.stoppedAt=Date.now();
        take.elapsedSeconds=(performance.now()-take.startedMono)/1000;
      }
      clearInterval(take.timer); this.c.timer(Math.floor(take.elapsedSeconds));
      this.setState('checking');
      take.stream.getTracks().forEach(t=>t.stop());
      if (take.wake) take.wake.release().catch(()=>{});
      const raw=new Blob(take.chunks,{type:take.mimeType});
      this.c.preview(raw,take);
      try {
        await take.writes;
        if (!raw.size) throw Error('No audio captured');
        let verified;
        if (/webm/i.test(take.mimeType)) {
          const result=EMGTWebM.normalize(await raw.arrayBuffer());
          verified={blob:new Blob([result.bytes],{type:'audio/webm;codecs=opus'}),durationSeconds:result.durationSeconds};
        } else {
          // MP4 needs its own validated remux path. Keep the source, do not
          // silently fall back to an unverified player duration or wall time.
          throw Error('This audio format needs verification before upload');
        }
        // Store the actual content duration, never the timer or upload delay.
        take.durationSeconds=verified.durationSeconds;
        this.c.preview(verified.blob,take);
        if (take.interrupted || Math.abs(take.elapsedSeconds-take.durationSeconds)>2) {
          this.c.warning('interrupted');
        }
        await this.c.protect(verified.blob,take);
        await this.c.journal.remove(take.sessionId);
      } catch(e) { this.c.retain(raw,take,e); }
      finally { this.take=null; this.setState('idle'); }
    }
  }
  root.EMGTRecorder=Recorder;
})(typeof window!=='undefined'?window:globalThis);
