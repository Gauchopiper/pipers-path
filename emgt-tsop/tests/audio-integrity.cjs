'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const audio=require('../reliability/webm-audio.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'emgt-audio-tests-'));
const run=(exe,args)=>cp.execFileSync(exe,args,{maxBuffer:200*1024*1024});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pcm=p=>run('ffmpeg',['-v','error','-i',p,'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','-']);
const packets=p=>JSON.parse(run('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=data_hash','-show_data_hash','sha256','-of','json',p])).packets.map(x=>x.data_hash);
for (const seconds of [30,60,299,300,480,900]) {
  const source=path.join(dir,seconds+'.webm'),output=path.join(dir,seconds+'-fixed.webm');
  run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(seconds),'-c:a','libopus','-b:a','32k',source]);
  const fixed=audio.normalize(fs.readFileSync(source)); fs.writeFileSync(output,fixed.bytes);
  assert.ok(Math.abs(fixed.durationSeconds-seconds)<0.001,`${seconds}: measured ${fixed.durationSeconds}`);
  assert.equal(fixed.durationSeconds>=300,seconds>=300,'five-minute boundary');
  assert.equal(hash(pcm(source)),hash(pcm(output)),`${seconds}: decoded sound changed`);
  assert.deepEqual(packets(source),packets(output),'encoded packets changed');
  console.log(`PASS ${seconds}s: content ${fixed.durationSeconds}s; all packets and decoded PCM identical`);
}
for (const p of process.argv.slice(2)) {
  const source=fs.readFileSync(p),fixed=audio.normalize(source),output=path.join(dir,crypto.randomUUID()+'.webm');fs.writeFileSync(output,fixed.bytes);
  assert.equal(hash(pcm(p)),hash(pcm(output)));assert.deepEqual(packets(p),packets(output));
  const again=audio.normalize(fixed.bytes);assert.equal(again.durationSeconds,fixed.durationSeconds);
  assert.throws(()=>audio.normalize(source.subarray(0,Math.floor(source.length/2))),/Truncated|Incomplete|Invalid/);
  console.log(`PASS private evidence: ${fixed.packetCount} packets; ${fixed.durationSeconds}s content; original timestamp span ${fixed.timestampSpanSeconds}s; sound identical`);
}
assert.throws(()=>audio.normalize(Uint8Array.of(0)),/header/);
assert.throws(()=>audio.packetMs(Uint8Array.of(3,0)),/count/);
assert.equal(audio.packetMs(Uint8Array.of(0)),10);
assert.equal(audio.packetMs(Uint8Array.of(24)),60);
assert.equal(audio.packetMs(Uint8Array.of(128)),2.5);
assert.equal(audio.packetMs(Uint8Array.of(251,2)),40);
console.log('PASS invalid input and Opus packet durations');
fs.rmSync(dir,{recursive:true,force:true});
