'use strict';
// Deterministic virtual clock: NOT a measurement of Google trigger/network latency.
const assert=require('node:assert/strict');
function simulate(arrivals,{period=60000,batch=4,service=1000}={}){
 const pending=[...arrivals].sort((a,b)=>a-b),delays=[];let tick=period,last=0,peak=0;
 while(pending.length){let available=pending.filter(t=>t<=tick).length;peak=Math.max(peak,available);const n=Math.min(batch,available);for(let i=0;i<n;i++){const arrived=pending.shift(),complete=tick+(i+1)*service;delays.push(complete-arrived);last=complete;}tick=Math.max(tick+period,Math.ceil((tick+n*service)/period)*period);}
 delays.sort((a,b)=>a-b);const q=p=>delays[Math.max(0,Math.ceil(delays.length*p)-1)]/1000;
 return {jobs:delays.length,periodSeconds:period/1000,batch,serviceSeconds:service/1000,capacityPerMinute:Math.min(batch,Math.floor(period/service))*60000/period,medianSeconds:q(.5),p95Seconds:q(.95),maxSeconds:q(1),completionSeconds:last/1000,peakBacklog:peak};
}
const results={
 spreadUploads:simulate(Array.from({length:12},(_,i)=>i*50000)),
 burst20:simulate(Array(20).fill(0)),
 overload60:simulate(Array.from({length:60},(_,i)=>i*1000)),
 idlePathRequests:simulate(Array.from({length:60},(_,i)=>i*1000),{batch:100,service:200}),
 fiveMinutePolling:simulate(Array.from({length:12},(_,i)=>i*50000),{period:300000})
};
// Analytical independent expectations for a 20-job burst: 5 batches, final 304s.
assert.equal(results.burst20.completionSeconds,304);
assert.equal(results.burst20.capacityPerMinute,4);
assert.equal(results.burst20.peakBacklog,20);
assert(results.overload60.p95Seconds>600);
assert(results.idlePathRequests.medianSeconds>20);
console.log(JSON.stringify({assumptions:'Virtual clock, first poll after one period, serial fixed-time jobs, no network/Google jitter/failures. Read scenario groups 60 arrivals, not 60 isolated experiments.',results},null,2));
module.exports={simulate};
