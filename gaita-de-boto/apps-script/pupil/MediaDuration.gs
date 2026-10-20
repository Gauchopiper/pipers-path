// Independent duration evidence from supported audio bytes. No timer-based qualification.
function gdbPMediaSeconds_(input,mime){
 const b=Array.from(input,x=>x&255), n=b.length;
 const ascii=(p,l)=>String.fromCharCode.apply(null,b.slice(p,p+l));
 function uint(p,l,little){let v=0;for(let k=0;k<l;k++)v=v*256+b[p+(little?l-1-k:k)];return v;}
 if(mime==='audio/wav'){
  if(n<44||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WAVE')throw Error('Invalid WAV evidence.');
  let align=0,rate=0,total=0,format=0;
  for(let p=12;p+8<=n;){const id=ascii(p,4),len=uint(p+4,4,true),s=p+8;
   if(s+len>n)throw Error('Truncated WAV evidence.');
   if(id==='fmt '){if(len<16)throw Error('Invalid WAV format.');format=uint(s,2,true);rate=uint(s+4,4,true);align=uint(s+12,2,true);}
   if(id==='data')total+=len;
   p=s+len+(len%2);
  }
  if(![1,3].includes(format)||!rate||!align||!total||total%align)throw Error('Unsupported WAV evidence.');
  return {seconds:total/align/rate,method:'pcm-sample-count'};
 }
 if(mime!=='audio/webm')throw Error('Independent duration check supports Chrome WebM/Opus and PCM WAV. Keep a local copy.');
 function vint(p,id){
  if(p>=n||!b[p])throw Error('Invalid WebM integer.');
  let len=1,mask=128;while(!(b[p]&mask)){len++;mask>>=1;}
  if(len>8||p+len>n)throw Error('Invalid WebM integer.');
  let v=id?b[p]:b[p]&(mask-1),unknown=!id&&v===mask-1;
  for(let i=1;i<len;i++){v=v*256+b[p+i];unknown=unknown&&b[p+i]===255;}
  if(!unknown&&!Number.isSafeInteger(v))throw Error('WebM integer exceeds limit.');
  return {len,value:v,unknown};
 }
 function children(start,end,visit){for(let p=start;p<end;){const id=vint(p,true),size=vint(p+id.len,false),s=p+id.len+size.len,e=size.unknown?end:s+size.value;if(e>end||e<=p)throw Error('Invalid WebM element.');visit(id.value,s,e);p=e;}}
 const tracks={};let blocks=[],segment=false;
 function packet(s,e,padding){
  const track=vint(s,false),p=s+track.len;
  if(p+4>e)throw Error('Invalid WebM block.');
  if((b[p+2]&6)!==0)throw Error('Laced WebM audio is not supported.');
  blocks.push({track:track.value,s:p+3,e,padding:padding||0});
 }
 function cluster(s,e){children(s,e,(id,a,z)=>{
  if(id===0xa3)packet(a,z,0);
  if(id===0xa0){let block=null,padding=0;children(a,z,(k,x,y)=>{if(k===0xa1)block=[x,y];if(k===0x75a2){padding=uint(x,y-x,false);if(b[x]&128)padding-=Math.pow(256,y-x);}});if(block)packet(block[0],block[1],Math.abs(padding)/1e9);}
 });}
 children(0,n,(id,s,e)=>{if(id!==0x18538067)return;segment=true;children(s,e,(k,a,z)=>{
  if(k===0x1654ae6b)children(a,z,(tag,x,y)=>{if(tag!==0xae)return;let track={};children(x,y,(f,j,q)=>{if(f===0xd7)track.id=uint(j,q-j,false);if(f===0x83)track.type=uint(j,q-j,false);if(f===0x86)track.codec=ascii(j,q-j);if(f===0x63a2&&ascii(j,8)==='OpusHead')track.skip=uint(j+10,2,true)/48000;});tracks[track.id]=track;});
  if(k===0x1f43b675)cluster(a,z);
 });});
 const audio=Object.values(tracks).filter(t=>t.type===2);
 if(!segment||audio.length!==1||audio[0].codec!=='A_OPUS')throw Error('Expected one Opus audio track.');
 let seconds=0,count=0;
 for(const block of blocks){if(block.track!==audio[0].id)continue;const toc=b[block.s],config=toc>>3,code=toc&3;
  const ms=config>=16?2.5*Math.pow(2,config&3):config>=12?10*Math.pow(2,config&1):(config&3)===3?60:10*Math.pow(2,config&3);
  const frames=code===0?1:code===3?(b[block.s+1]&63):2;
  if(!frames||frames*ms>120||block.s>=block.e)throw Error('Invalid Opus duration.');
  seconds+=frames*ms/1000-block.padding;count++;
 }
 seconds-=audio[0].skip||0;
 if(!count||seconds<=0)throw Error('No independently measurable audio.');
 // Packet sample totals are integral 1/48000-second units; avoid accumulated float error.
 return {seconds:Math.round(seconds*48000)/48000,method:'opus-packet-sample-count'};
}
