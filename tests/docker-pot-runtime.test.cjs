const assert=require('node:assert/strict');
const fs=require('node:fs');

const docker=fs.readFileSync('backend/ytdlp/Dockerfile','utf8');
const req=fs.readFileSync('backend/ytdlp/requirements.txt','utf8');
const start=fs.readFileSync('backend/ytdlp/start.sh','utf8');

assert.match(docker,/FROM node:22-/);
assert.match(docker,/python3/);
assert.match(docker,/ffmpeg/);
assert.match(docker,/bgutil-ytdlp-pot-provider/);
assert.match(docker,/2\.0\.0/);
assert.match(req,/bgutil-ytdlp-pot-provider==2\.0\.0/);
assert.match(start,/build\/main\.js/);
assert.match(start,/127\.0\.0\.1/);
assert.match(start,/4416/);
assert.match(start,/gunicorn/);
console.log('docker-pot-runtime: 10 assertions passed');
