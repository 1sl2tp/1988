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

// Source-state resume is also manifest-first. Boot may read the state body once,
// but pageshow/visible-resume must not re-download it when stateHash is unchanged.
const stateResumeStart=app.indexOf('const STATE_RESUME_CHECK_TTL=');
const stateResumeEnd=app.indexOf('function temporarySetForScope',stateResumeStart);
assert.ok(stateResumeStart>=0&&stateResumeEnd>stateResumeStart,'state resume contract missing');
const stateResume=app.slice(stateResumeStart,stateResumeEnd);

assert.match(app,/async function stateSyncFetch\(method="GET",body=null,timeout=2200,\{keepalive=false,view=""\}=\{\}\)/);
assert.match(app,/url\.searchParams\.set\("view",String\(view\)\)/);
assert.match(stateResume,/STATE_RESUME_CHECK_TTL=30\*1000/);
assert.match(stateResume,/stateResumeRefreshPromise/);
assert.match(stateResume,/stateInitialHydrationPromise/);
assert.match(stateResume,/manifestHash&&lastServerStateHash&&manifestHash===lastServerStateHash/);

const firstStateManifest=stateResume.indexOf('stateSyncFetch("GET",null,2200,{view:"manifest"})');
const secondStateManifest=stateResume.indexOf('stateSyncFetch("GET",null,2200,{view:"manifest"})',firstStateManifest+1);
const stateBodyRead=stateResume.indexOf('stateSyncFetch("GET",null,3200)',secondStateManifest+1);
assert.ok(firstStateManifest>=0&&secondStateManifest>firstStateManifest,'state manifest reads missing');
assert.ok(stateBodyRead>secondStateManifest,'state body must be gated behind manifest/hash');

assert.match(app,/stateInitialHydrationPromise=hydrateServerState\(\)\.catch\(\(\)=>false\)\.finally/);

console.log('read-model resource contract ok');
