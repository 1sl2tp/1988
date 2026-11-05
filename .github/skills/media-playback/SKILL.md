# 1988 media playback audit

Read CURRENT_WORK.md, README_MAINTENANCE.md, README_RESOURCE_GUARDRAILS.md and README_HOST_ARCHITECTURE.md before edits. Inventory source owners for YouTube iframe player, floating player, channel metadata, caching and visibility transitions.

Test start/pause/resume, switching video, portrait/landscape, floating PiP, stale iframe, error states, navigation, background/foreground, and mobile gestures. Preserve single player ownership and provider constraints. Avoid extra polling, retries or redundant network requests. Validate source build/tests, production deployment and real-device acceptance separately. Never treat a passing static test as playback verification.
