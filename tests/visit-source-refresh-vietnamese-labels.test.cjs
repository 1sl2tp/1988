'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('  function parseSourceOrder(');
const end=html.indexOf('  function syncPlatformButtons()',start);
assert(start>0&&end>start);
const c={Map,Set,String,Array,Number};
vm.createContext(c);vm.runInContext(html.slice(start,end),c);
test('YouTube system and exact English category labels render naturally in Vietnamese',()=>{
  const rows=c.existingSourceTabNames({
    sourceLabels:{live:'Live',latest:'Day',week:'Week'},
    hashtags:[
      {id:'hash_t',label:'Teen'}, {id:'hash_k',label:'Kid'},
      {id:'hash_r',label:'Review'}, {id:'hash_s',label:'SHOWS'},
      {id:'hash_b',label:'Showbiz'}, {id:'hash_m',label:'Nhạc'},
      {id:'hash_c',label:'Công nghệ'}
    ]
  });
  const labels=Object.fromEntries(rows.map(row=>[row.key,row.label]));
  assert.equal(labels.live,'Trực tiếp');
  assert.equal(labels.latest,'Ngày');
  assert.equal(labels.week,'Tuần');
  assert.equal(labels.hash_t,'Tuổi trẻ');
  assert.equal(labels.hash_k,'Thiếu nhi');
  assert.equal(labels.hash_r,'Đánh giá');
  assert.equal(labels.hash_s,'Chương trình');
  assert.equal(labels.hash_b,'Giải trí');
  assert.equal(labels.hash_m,'Nhạc');
  assert.equal(labels.hash_c,'Công nghệ');
  assert.deepEqual(Array.from(rows.slice(0,3),x=>x.key),['live','latest','week']);
});
test('every configured category gets an accessible pictogram or safe fallback',()=>{
  const tags=['Live','Ngày','Tuần','Teen','Kid','Review','SHOWS','Showbiz','Nhạc','Phim','Hài','Sinh tồn','Khám phá','Công nghệ','Thể thao','Tự tạo'];
  for(const label of tags){
    const normalized=c.friendlySourceTabLabel(label,label==='Live'?'live':'');
    assert(c.sourceTabIcon(normalized),'icon absent for '+label);
  }
  assert.equal(c.sourceTabIcon('Đánh giá'),'⭐');
  assert.equal(c.sourceTabIcon('Tự tạo'),'▦');
  assert.match(html,/class="source-chip-icon" aria-hidden="true"/);
  assert.match(html,/class="source-chip-text"/);
  assert(html.includes('aria-label="'+ "'" + '+escapeHtml(label)'),"category labels are accessible");
  assert(!html.includes('translateVideoTitlesOnClient'),'original YouTube video titles remain authoritative');
});
test('backend visit refresh requests queue behind busy lease and retain the two-scope budget',()=>{
  const worker=fs.readFileSync('supabase/functions/yt1988-refresh/index.ts','utf8');
  assert.match(worker,/const MAX_SCOPES_PER_RUN=2/);
  assert.match(worker,/if\(clientCheck&&body\?\.daily_open===true\)/);
  assert.match(worker,/rpc\/yt1988_queue_refresh/);
  assert.match(worker,/reason:"refresh_queued"/);
  assert.match(worker,/if\(scopes.length>MAX_SCOPES_PER_RUN\)/);
  assert.match(worker,/triggerFollowupRefresh\(rest,authHeaders,pending\)/);
});
