// Actual PATH rendering with malicious in-memory workbook values; no live data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const helpers=html.slice(html.indexOf('function escapeText('),html.indexOf('async function loadPath'));
const render=html.slice(html.indexOf('if (visibleTargets.length > 0)'),html.indexOf('    if (!data.sessions || data.sessions.length === 0)'));
const evil='<img src=x onerror="alert(1)"><script>alert(2)</script>\'"&';
for(const imageLink of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://example.test/a" onerror="alert(1)','https://user:secret@example.test/x','//example.test/x']){
 const targets={innerHTML:''},badges={innerHTML:''};
 const ctx={URL,visibleTargets:[{title:evil,status:evil}],pathTargets:targets,data:{badges:[{imageLink,badgeName:evil,description:evil}]},t:{badges:'Badges'},translatedTargetStatus:x=>x,document:{getElementById:()=>badges}};
 vm.createContext(ctx);vm.runInContext(helpers+render,ctx);
 assert.ok(targets.innerHTML.includes('&lt;img'));assert.ok(badges.innerHTML.includes('&lt;script'));
 assert.ok(!targets.innerHTML.includes('<script>'));assert.ok(!badges.innerHTML.includes('<script>'));
 assert.ok(!badges.innerHTML.includes('src="javascript:'));assert.ok(!badges.innerHTML.includes('src="data:'));
 assert.ok(!badges.innerHTML.includes('" onerror="'));
}
console.log('PASS malicious target, status, badge name/description and image URL fixtures escaped or rejected. Actual rendering; simulated data.');

const ctx={URL};vm.createContext(ctx);vm.runInContext(helpers,ctx);
for(const name of ['first-step','on-the-path','keeping-going','regular-piper']){
 const url='https://raw.githubusercontent.com/Gauchopiper/pipers-path/main/assets/badges/'+name+'.svg';
 assert.equal(ctx.safeBadgeImageUrl(url),url);
 assert.equal(ctx.safeBadgeImageUrl(url+'?track=pupil'),'');
}
for(const url of ['https://example.test/track.png','https://raw.githubusercontent.com/Other/repo/main/a.svg','https://raw.githubusercontent.com.evil.test/Gauchopiper/pipers-path/main/assets/badges/a.svg'])assert.equal(ctx.safeBadgeImageUrl(url),'');
assert.ok(render.includes('referrerpolicy="no-referrer"'));
console.log('PASS approved four badge URLs retained; arbitrary hosts, foreign repositories and tracking queries rejected.');
