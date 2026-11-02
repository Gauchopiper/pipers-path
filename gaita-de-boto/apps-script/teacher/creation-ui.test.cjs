// Actual dashboard controller with in-memory DOM/RPC doubles; no live records.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/TeacherDashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {constructor(){this.value='';this.children=[];this.handlers={};}setAttribute(){}appendChild(x){this.children.push(x);}replaceChildren(){this.children=[];}addEventListener(n,f){this.handlers[n]=f;}focus(){this.focused=true;}}
const nodes={};const el=id=>nodes[id]??=(new Element());const storage=new Map();
let calls=[],hold,rows=[],fail=true;
const run={withSuccessHandler(fn){this.success=fn;return this},withFailureHandler(fn){this.failure=fn;return this},gdb_dashboard(){this.success({role:'OWNER',actor:'fixture',pupils:rows,targets:[],badges:[]})},gdb_detail(){this.success({sessions:[],targets:[],badges:[],comments:[]})},gdb_createPupil(...args){calls.push(args);const success=this.success,failure=this.failure;hold=()=>{if(fail){fail=false;failure(Error('response lost'));return;}rows=[{id:args[2],name:args[0],active:'No',accessPending:true,summary:{sessions:0,minutes:0,qualifying:0}}];success({ok:true,id:args[2]});};}};
const ctx={document:{getElementById:el,createElement:()=>new Element()},google:{script:{run}},crypto:require('node:crypto').webcrypto,URL,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 await new Promise(setImmediate);el('name').value='Fixture';el('lang').value='ES';
 const submit=()=>el('create').handlers.submit({preventDefault(){}});
 const first=submit();await submit();assert.equal(calls.length,1);assert.equal(el('createPupil').disabled,true);
 hold();await first;assert.equal(el('createPupil').disabled,false);assert.match(el('status').textContent,/response lost/);
 const retry=submit();assert.equal(calls[0][2],calls[1][2]);hold();await retry;
 assert.match(el('status').textContent,/External access remains disabled/);assert.equal(storage.size,0);assert.equal(el('createPupil').focused,true);
 const activation=el('detail').children.find(x=>x.textContent==='Reactivate');assert.equal(activation.disabled,true);
 console.log('PASS actual dashboard controller: rapid submit guard, retained retry reference, success status, disabled activation, restored focus. Simulated DOM/RPC.');
})().catch(e=>{console.error(e);process.exitCode=1});
