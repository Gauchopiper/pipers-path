'use strict';
// Only deny/list paths. No Docker, PostgreSQL, CI or Google resource is invoked.
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),{join}=require('node:path');
const script=join(__dirname,'native-audit.cjs');let count=0;
const run=(args,env={})=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{PATH:'/nonexistent',...env}});
const check=(name,fn)=>{fn();count++;console.log('PASS PREPARATION '+name);};
check('list mode requires no native tools or credentials',()=>{const r=run(['--list']);assert.equal(r.status,0);const result=JSON.parse(r.stdout);assert.equal(result.status,'PREPARED_NOT_EXECUTED');assert.equal(result.cases.length,6);});
check('missing approval refuses before any native tool',()=>{const r=run([]);assert.notEqual(r.status,0);assert(r.stderr.includes('approval flag required'));});
check('non-loopback database is refused before connection',()=>{const r=run([],{GDB_NATIVE_APPROVED:'DISPOSABLE_FIXTURES_ONLY',GDB_FIXTURE_NATIVE_URL:'postgresql://postgres:gdb-fixture-only@database.invalid:55432/gdb_work4_fixture'});assert.notEqual(r.status,0);assert(r.stderr.includes('loopback disposable fixture'));});
check('unowned container name is refused before Docker',()=>{const r=run([],{GDB_NATIVE_APPROVED:'DISPOSABLE_FIXTURES_ONLY',GDB_FIXTURE_NATIVE_URL:'postgresql://postgres:gdb-fixture-only@127.0.0.1:55432/gdb_work4_fixture',GDB_FIXTURE_CONTAINER_NAME:'production'});assert.notEqual(r.status,0);assert(r.stderr.includes('Owned fixture container required'));});
check('shell launcher refuses before setup when approval absent',()=>{const r=spawnSync('/usr/bin/bash',[join(__dirname,'native-run.sh')],{encoding:'utf8',env:{PATH:'/nonexistent'}});assert.equal(r.status,2);assert(r.stderr.includes('no Docker/database action attempted'));});
console.log(`${count} preparation guard checks passed; 0 native database tests executed.`);
