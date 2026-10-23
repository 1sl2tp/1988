'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('  function dailyVietnamKey(');
const end=html.indexOf('  async function checkPackagesOnDemand(',start);
assert.ok(start>0&&end>start,'daily normal-scope wake owner exists');
const body=html.slice(start,end);
const startup=html.slice(html.indexOf('  async function loadExistingSourceNames()'),html.indexOf('  let cardTintObserver=',html.indexOf('  async function loadExistingSourceNames()')));
const live=html.slice(html.indexOf('  async function showPackageScope('),html.indexOf('  let packageSyncRunning=',html.indexOf('  async function showPackageScope(')));
assert.match(startup,/wakeDailyContentOnVisibleVisit\(dailyContentRows\)/);
assert.match(startup,/showPackageScope\(scope,\{hydrateLive:false\}\)/);
assert.match(live,/refreshUnifiedLiveInBackground\(/);
assert.doesNotMatch(body,/refreshUnifiedLiveInBackground|runYoutubeLiveCycle|youtube\/live-scan/);
assert.match(body,/status:"accepted"/);
assert.match(body,/result\?\.reason==="refresh_already_running"/);
assert.match(body,/acceptedVisitSignature===signature/);
function create({hidden=false,online=true,reply={ok:true,scopes:[{scope:'latest'}]}}={}){
  let now=Date.parse('2026-10-11T18:00:00.000Z'); // 01:00 on the 12th in Vietnam
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const items=new Map(),requests=[],checks=[];
  const box={
    Intl,Date:Clock,JSON,Map,Set,Number,Promise,RegExp,
    localStorage:{getItem:key=>items.get('local:'+key)||null,setItem:(key,value)=>items.set('local:'+key,value)},
    sessionStorage:{getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)},
    acceptedVisitSignature:"",
    DAILY_CONTENT_WAKE_KEY:'daily-test',PACKAGE_REFRESH_URL:'https://test.invalid/refresh',
    dailyContentWakePending:null,lastDailyContentWakeAttemptAt:0,
    activePackageScope:'latest',document:{hidden},navigator:{onLine:online},
    checkPackagesOnDemand:scopes=>{checks.push(scopes);return Promise.resolve(true)},
    loadPackageManifest:async()=>({}),syncPreparedPackages:async()=>true,
    fetch:async(_url,args)=>{requests.push(JSON.parse(args.body));return {ok:true,json:async()=>reply}}
  };
  vm.createContext(box);vm.runInContext(body,box);
  return {box,items,requests,checks,setNow:n=>{now=n},today:()=>box.dailyVietnamKey()};
}
const rows=[{key:'live',label:'Live'},{key:'latest',label:'Ngày'},{key:'week',label:'Tuần'},{key:'hash_001',label:'Music'},{key:'hash_002',label:'News'},{key:'hash_001',label:'duplicate'}];
test('each opening sends one batched normal-scope wake, excludes LIVE and remembers the tab session',async()=>{
  const s=create();
  assert.equal(s.today(),'2026-10-12');
  assert.deepEqual(Array.from(s.box.dailyContentScopes(rows)),['latest','week','hash_001','hash_002']);
  assert.equal(await s.box.wakeDailyContentOnVisibleVisit(rows),true);
  assert.equal(s.requests.length,1);
  assert.deepEqual(s.requests[0],{scopes:['latest','week','hash_001','hash_002'],client_check:true,daily_open:true});
  assert.equal(await s.box.wakeDailyContentOnVisibleVisit(rows),true);
  assert.equal(s.requests.length,1,'one opening cannot schedule the same batch twice');
  assert.equal(JSON.parse(s.items.get('daily-test')).status,'accepted');
  assert.equal(s.box.dailyContentScopes([{key:'live'}]).length,0);
});
test('calendar rollover does not repeat an accepted batch in the same opening',async()=>{
  const s=create();await s.box.wakeDailyContentOnVisibleVisit(rows);
  s.setNow(Date.parse('2026-10-12T18:01:00.000Z'));
  assert.equal(s.today(),'2026-10-13');
  await s.box.wakeDailyContentOnVisibleVisit(rows);
  assert.equal(s.requests.length,1);
});
test('a different tab session can request fresh scopes on the same Vietnam day',async()=>{
  const first=create();await first.box.wakeDailyContentOnVisibleVisit(rows);
  const second=create();await second.box.wakeDailyContentOnVisibleVisit(rows);
  assert.equal(first.requests.length,1);
  assert.equal(second.requests.length,1);
});
test('failure, busy lease, or invisible/offline never marks this opening complete',async()=>{
  const hidden=create({hidden:true});assert.equal(await hidden.box.wakeDailyContentOnVisibleVisit(rows),false);assert.equal(hidden.requests.length,0);
  const offline=create({online:false});assert.equal(await offline.box.wakeDailyContentOnVisibleVisit(rows),false);assert.equal(offline.requests.length,0);
  const busy=create({reply:{ok:true,skipped:true,reason:'refresh_already_running'}});
  assert.equal(await busy.box.wakeDailyContentOnVisibleVisit(rows),false);
  assert.equal(busy.items.has('daily-test'),false);
  const failed=create({reply:{ok:false}});assert.equal(await failed.box.wakeDailyContentOnVisibleVisit(rows),false);
  assert.equal(failed.items.has('daily-test'),false);
});
test('server durably queues scopes behind a busy lease and marks opening accepted',async()=>{
  const s=create({reply:{ok:true,queued:true,reason:'refresh_queued',scopes:['latest','week']}});
  assert.equal(await s.box.wakeDailyContentOnVisibleVisit(rows),true);
  assert.equal(s.requests.length,1);
  assert.equal(JSON.parse(s.items.get('daily-test')).queued,true);
  await s.box.wakeDailyContentOnVisibleVisit(rows);
  assert.equal(s.requests.length,1);
});
test('server already checked due scopes means client records accepted, not all-packages-done',async()=>{
  const s=create({reply:{ok:true,skipped:true,reason:'not_due'}});
  assert.equal(await s.box.wakeDailyContentOnVisibleVisit(rows),true);
  assert.equal(JSON.parse(s.items.get('daily-test')).status,'accepted');
});
test('a changed server tab roster can request newly enabled hashtags once',async()=>{
  const s=create();await s.box.wakeDailyContentOnVisibleVisit(rows);
  await s.box.wakeDailyContentOnVisibleVisit([...rows,{key:'hash_003',label:'New'}]);
  assert.equal(s.requests.length,1,'bounded client debounce protects fast state churn');
  s.setNow(Date.parse('2026-10-11T18:03:00.000Z'));
  await s.box.wakeDailyContentOnVisibleVisit([...rows,{key:'hash_003',label:'New'}]);
  assert.equal(s.requests.length,2);
  assert.equal(s.requests[1].scopes.includes('hash_003'),true);
});
