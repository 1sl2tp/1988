# LIVE Verification + Keyword Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the LIVE feed only shows streams that are freshly verified as currently live, and add server-backed blocked keywords in Quản lý nguồn → Live shared by PC, mobile web, and PWA.

**Architecture:** Add a small server-owned LIVE settings surface for normalized blocked keywords, extend the refresh worker with a fresh live verifier that fails closed, and add a compact keyword editor to the existing Live source-management UI. Keyword filtering happens on the server before package commit and on the client as a defensive display filter.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno/TypeScript), vanilla JS/CSS frontend, existing GitHub Pages deployment and integration-shape tests.

**Spec:** `docs/superpowers/specs/2026-09-26-dynamic-hashtag-feeds-design.md`

## Global Constraints

- LIVE is a system feed and does not use the 7-day hashtag rules.
- A cached `isLive=true`, `duration<0`, or `uploaded=-1` flag alone is not sufficient proof of a current live stream.
- Fresh verification failure must omit the candidate rather than retain stale LIVE content.
- LIVE blocked keywords are stored on the server and shared across PC, mobile web, and PWA.
- Keyword matching is case-insensitive and accent-insensitive.
- Match against normalized video title and source/channel name.
- Keyword changes trigger an immediate LIVE rebuild.
- Manual blocked channel IDs remain independent and take precedence.
- Existing selected/blocked source state must not be lost.

## Review Focus

- A stale cached stream that has ended must disappear even if the old row still has `isLive=true`.
- A live verification timeout must omit only that candidate and must not crash the whole LIVE refresh.
- Unicode/accent variants such as `xổ số` / `xo so` must match identically.
- Removing a blocked keyword must allow matching verified-live streams to return on the next rebuild.
- Empty or whitespace-only keywords must never be persisted.

---

### Task 1: Server-backed LIVE keyword settings

**Files:**
- Create: `supabase/migrations/<generated>_live_keyword_blocks.sql`
- Modify: `supabase/functions/yt1988-state/index.ts`
- Test: `tests/integration-shape.test.cjs`

**Interfaces:**
- Produces table `public.yt1988_live_keywords(profile_key, keyword_norm, keyword_display, created_at, updated_at)`.
- Produces state API GET field `liveKeywords: string[]`.
- Produces POST ops `add_live_keyword` and `remove_live_keyword`.

- [ ] **Step 1: Write failing integration-shape assertions**
  - Assert the state function references `yt1988_live_keywords`, `add_live_keyword`, and `remove_live_keyword`.
  - Assert the migration enables RLS, revokes anon/authenticated access, and grants service_role access.
  - Assert empty keywords are rejected.

- [ ] **Step 2: Run the integration-shape test and confirm it fails because the LIVE keyword API/table do not exist.**

Run: `node tests/integration-shape.test.cjs .`

Expected: FAIL on the new LIVE keyword assertions.

- [ ] **Step 3: Implement the migration**
  - Generate the migration name with the Supabase CLI.
  - Create `yt1988_live_keywords`.
  - Normalize uniqueness by `(profile_key, keyword_norm)`.
  - Enable RLS and restrict the table to service_role.

- [ ] **Step 4: Implement state API read/write**
  - GET includes ordered `liveKeywords`.
  - `add_live_keyword` stores normalized + display text and triggers refresh for `live`.
  - `remove_live_keyword` deletes by normalized keyword and triggers refresh for `live`.
  - Empty/whitespace-only normalized values return 400.

- [ ] **Step 5: Apply migration to production and verify with SQL**
  - Insert/remove a temporary test keyword through the Edge Function.
  - Verify the row appears/disappears.
  - Verify the LIVE refresh is queued.
  - Remove all temporary test data.

- [ ] **Step 6: Run Supabase security and performance advisors and record only change-relevant findings.**

- [ ] **Step 7: Re-run `node tests/integration-shape.test.cjs .` and confirm PASS.**

- [ ] **Step 8: Commit**
  - Commit migration + state API + tests together.

---

### Task 2: Fresh LIVE verification and fail-closed package building

**Files:**
- Modify: `supabase/functions/yt1988-refresh/index.ts`
- Modify: `supabase/functions/yt1988/index.ts` only if the verifier needs one compact fresh-status endpoint
- Test: `tests/integration-shape.test.cjs`

**Interfaces:**
- Produces helper `verifyLiveCandidate(row) -> {active:boolean,row?:object,reason:string}`.
- Consumes `liveKeywords` loaded once per refresh.
- Produces LIVE package rows that all passed fresh verification and keyword filtering.

- [ ] **Step 1: Write failing tests/assertions**
  - Cached `isLive=true` is insufficient without fresh verification.
  - Fresh ended/replay status rejects the row.
  - Verification timeout/error rejects the row without failing the whole refresh.
  - Title/source keyword matches reject the row.
  - Accent-insensitive normalized keyword matching is present.

- [ ] **Step 2: Run tests and confirm RED.**

Run: `node tests/integration-shape.test.cjs .`

Expected: FAIL on fresh-live verifier assertions.

- [ ] **Step 3: Implement a fresh LIVE verifier**
  - Reuse the existing stream metadata path.
  - Require a positive current-live signal and usable live/HLS evidence when available.
  - Use short no-store timeouts.
  - Cap concurrency to avoid Piped bursts.
  - Do not reuse stale LIVE truth when verification fails.

- [ ] **Step 4: Implement central LIVE keyword filtering**
  - Normalize Vietnamese text by lowercasing and stripping diacritics.
  - Match normalized saved phrases against title + source name.
  - Run before package commit and before Live source suggestions are persisted.

- [ ] **Step 5: Make zero verified streams a valid package**
  - A successful refresh may commit an empty LIVE package.
  - Do not restore the previous stale LIVE package merely because the new verified set is empty.

- [ ] **Step 6: Deploy the Edge Functions and force a LIVE refresh.**
  - Verify every committed LIVE row passes fresh verification.
  - Verify a known ended candidate does not survive.
  - Verify the worker still reports success if one verifier request times out.

- [ ] **Step 7: Run integration-shape and worker verification queries; confirm PASS.**

- [ ] **Step 8: Commit**
  - Commit refresh/gateway/test changes.

---

### Task 3: Quản lý nguồn → Live keyword editor

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/style.css`
- Modify: `sw.js`
- Test: `tests/integration-shape.test.cjs`

**Interfaces:**
- Adds DOM section `#liveKeywordTools` visible only when `sourceManageGroup === "live"` in manage mode.
- Adds input `#liveKeywordInput`.
- Adds chip container `#liveKeywordChips`.
- Uses state API ops from Task 1.

- [ ] **Step 1: Write failing UI shape assertions**
  - HTML contains the Live keyword input/chip container.
  - App toggles the section only for Live.
  - Enter/add calls `add_live_keyword`.
  - Chip remove calls `remove_live_keyword`.
  - UI copy says `Từ khóa chặn`.

- [ ] **Step 2: Run tests and confirm RED.**

Run: `node tests/integration-shape.test.cjs .`

Expected: FAIL on new UI assertions.

- [ ] **Step 3: Implement the compact UI**
  - Place under the Live source-management controls.
  - Input accepts one phrase at a time.
  - Enter and add button save.
  - Render removable chips.
  - Show examples such as `xổ số`, `cây cảnh`.
  - Ignore empty input.

- [ ] **Step 4: Wire state hydration**
  - Hydrate `liveKeywords` from server with the rest of state.
  - After add/remove, update local UI immediately and then reconcile with server response.

- [ ] **Step 5: Add defensive client filtering**
  - If an old local LIVE package is briefly visible during hydration, filter title/source against hydrated blocked keywords before render.

- [ ] **Step 6: Bump frontend/local cache generation**
  - Rotate app asset query versions and service-worker cache version once.

- [ ] **Step 7: Run the full test command and verify the final UI state on desktop/mobile widths.**

Run: `node tests/integration-shape.test.cjs .`

Expected: PASS with no failures.

- [ ] **Step 8: Commit**
  - Commit frontend, SW cache rotation, and tests.

---

### Task 4: Production verification

**Files:**
- No product code unless verification exposes a bug.

**Interfaces:**
- Confirms Tasks 1–3 work end-to-end.

- [ ] **Step 1: Add a temporary blocked keyword that matches a currently discovered LIVE title/source.**
- [ ] **Step 2: Trigger LIVE refresh and verify matching rows are absent from the package.**
- [ ] **Step 3: Remove the keyword, trigger refresh, and verify eligible current-live rows may return.**
- [ ] **Step 4: Verify ended/replay rows are absent even when an older cache row still carries live-looking flags.**
- [ ] **Step 5: Verify GET state returns the same keyword list for a clean session, representing PC/mobile/PWA shared state.**
- [ ] **Step 6: Verify GitHub Pages deployment is green and the current service-worker generation is live.**
- [ ] **Step 7: Run the full project test command one final time and record the exact result.**
