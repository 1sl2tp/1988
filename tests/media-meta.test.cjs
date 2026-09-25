'use strict';

const assert=require('node:assert/strict');

delete global.MediaMeta;
require('../src/media-meta.js');

const M=global.MediaMeta;
assert.ok(M,'MediaMeta global should exist');

assert.equal(M.viewLabel(100),'100 lượt xem');
assert.equal(M.viewLabel(999),'999 lượt xem');
assert.equal(M.viewLabel(1000),'1K');
assert.equal(M.viewLabel(1500),'1.5K');
assert.equal(M.viewLabel(10000),'10K');
assert.equal(M.viewLabel(1_000_000),'1M');
assert.equal(M.viewLabel(1_250_000),'1.3M');
assert.equal(M.viewLabel(1_000_000_000),'1B');

const now=Date.UTC(2026,8,25,12,0,0);
const rowAt=ms=>({publishedAt:now-ms});
assert.equal(M.relativePublished(rowAt(30*1000),now),'30 giây trước');
assert.equal(M.relativePublished(rowAt(12*60*1000),now),'12 phút trước');
assert.equal(M.relativePublished(rowAt(3*60*60*1000),now),'3 giờ trước');
assert.equal(M.relativePublished(rowAt(12*24*60*60*1000),now),'12 ngày trước');
assert.equal(M.relativePublished(rowAt(45*24*60*60*1000),now),'1 tháng trước');
assert.equal(M.relativePublished(rowAt(400*24*60*60*1000),now),'1 năm trước');

assert.equal(M.parseDuration('PT1H2M3S'),3723);
assert.equal(M.durationLabel(3723),'1:02:03');

const video=M.video({
  videoId:'abcdefghijk',
  title:'Test video',
  uploader:'Test source',
  channelId:'UCabcdefghijk123',
  uploaderThumbnailUrl:'https://yt3.ggpht.com/a',
  views:12500,
  duration:95,
  publishedAt:now-2*60*60*1000
});
assert.equal(video.id,'abcdefghijk');
assert.equal(video.viewsLabel,'13K');
assert.equal(video.durationLabel,'1:35');
assert.equal(video.sourceName,'Test source');

console.log('media-meta tests passed');
