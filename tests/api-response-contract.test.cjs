'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

async function run(body,status=200){
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/api.js'),'utf8');
  const context={
    URL, location:{origin:'https://yt.taphoa.xyz'},
    fetch:async()=>({ok:status>=200&&status<300,status,json:async()=>body}),
    window:{}
  };
  vm.runInNewContext(source,context);
  return context.window.YT1988_API.home();
}

(async()=>{
  await assert.rejects(run(null),/HTTP 200/);
  await assert.rejects(run(false),/HTTP 200/);
  await assert.rejects(run([]),/HTTP 200/);
  await assert.rejects(run({ok:false,error:'upstream_error'}),/upstream_error/);
  await assert.rejects(run({ok:true},503),/HTTP 503/);
  const valid=await run({ok:true,data:[]});
  assert.equal(valid.ok,true);
  console.log('API response contract passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
