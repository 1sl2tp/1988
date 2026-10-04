'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.resolve(__dirname,'..','src','app.js'),'utf8');

const resumeStart=app.indexOf('const PACKAGE_RESUME_CHECK_TTL=');
const resumeEnd=app.indexOf('async function loadInitialFeed()',resumeStart);
assert.ok(resumeStart>=0&&resumeEnd>resumeStart,'resume contract missing');
const resume=app.slice(resumeStart,resumeEnd);

assert.match(resume,/PACKAGE_RESUME_CHECK_TTL=30\*1000/);
assert.match(resume,/packageResumeSyncPromise/);
assert.match(resume,/hydrateServerPackages\(\{force:true,scopes:\[scope\]\}\)/);
assert.doesNotMatch(resume,/requestServerPackageRefresh\(/);

assert.match(app,/async function hydrateServerPackages\(\{force=false,scopes=null\}=\{\}\)/);
assert.match(app,/requestedScopes\.size&&!requestedScopes\.has\(scope\)/);

// All three browser resume signals share one coalesced read owner.
assert.match(resume,/window\.addEventListener\("pageshow",syncServerPackagesOnResume/);
assert.match(resume,/window\.addEventListener\("focus",syncServerPackagesOnResume/);
assert.match(resume,/visibilitychange/);

console.log('read-model resource contract ok');
