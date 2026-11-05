---
name: media-cache
description: Verify media cache contracts and regressions in this repository.
---

# Media cache

## Discover before changing
Read repository README, AGENTS.md if present, CURRENT_WORK.md and README_MAINTENANCE.md if present, and resource/deploy guardrails. Identify actual source owner and tests. Candidate discovery: README_HOST_ARCHITECTURE.md, README_RESOURCE_GUARDRAILS.md and active source owners. Do not treat candidate files as verified owners until inspected.

## Required audit
cache invalidation, stale metadata, player state, storage bounds, offline transitions. Capture reproducible symptoms and distinguish source, generated artifacts, API, client state and production behavior. Check edge cases and cross-feature consistency; do not mutate production data or send real messages.

## Repair gate
One incident, one owner, minimal patch and regression test. Run supported build/CI and confirm production/device separately; record E0 evidence, E1 patch/test, E2 CI, E3 deploy, E4 real behavior, E5 acceptance. Unknown stages remain PENDING. No speculative dependency, polling, cache or deployment changes.
