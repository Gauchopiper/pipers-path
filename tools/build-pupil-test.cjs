// Generate an Apps Script-hosted preview from the unchanged pupil interface.
const fs=require('node:fs');
let html=fs.readFileSync('index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
if(!match)throw Error('Pupil script not found');
let script=match[1];
script=script.replace(/const BACKEND_URL = '[^']+';/,"const BACKEND_URL = 'isolated-test-rpc';");
script=script.replace('new URLSearchParams(location.search)','new URLSearchParams(testLocation.hash || "")');
script=script.replace(/fetch\(BACKEND_URL,/g,'testFetch(BACKEND_URL,');
script=script.replace("'community-bagpipe-' + bagpipeParts + '.png'","'https://gauchopiper.github.io/pipers-path/community-bagpipe-' + bagpipeParts + '.png'");
let feedback=fs.readFileSync('feedback.js','utf8').replace('new URLSearchParams(location.search)','new URLSearchParams(testLocation.hash || "")');
const bridge=`
function testFetch(url,options){
 if(url!=='isolated-test-rpc')return Promise.reject(Error('Test route required'));
 return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(data=>resolve({json:async()=>data})).withFailureHandler(reject).pupilTestApi(JSON.parse(options.body)));
}
google.script.url.getLocation(function(testLocation){
 google.script.run.withSuccessHandler(function(url){
 window.PIPERS_FEEDBACK={url};
 ${script}
 ${feedback}
 }).withFailureHandler(function(){document.getElementById('status').textContent='Test preview is not configured.';}).pupilTestFeedbackUrl();
});`;
html=html.replace(match[0],'<script>'+bridge+'</script>');
html=html.replace(/<script src="feedback(?:-config)?\.js"><\/script>/g,'');
html=html.replace(/<link[^>]+(?:manifest|icon)[^>]*>/g,'');
html=html.replace('<head>','<head><meta name="referrer" content="no-referrer"><base target="_top">');
html=html.replace('<body>','<body><p style="padding:12px;background:#fff1cb">TEST ONLY · Dummy pupils · Audio saves to TEST Recordings. Ten-minute maximum. Targets, badges and community credit are not tested here.</p>');
if(html.includes('AKfycbwZRT0') || /fetch\(BACKEND_URL/.test(html))throw Error('Production transport remains');
fs.writeFileSync('tools/apps-script-probe/PupilPreview.html',html);
console.log('Built isolated pupil preview with RPC transport; production index unchanged.');
