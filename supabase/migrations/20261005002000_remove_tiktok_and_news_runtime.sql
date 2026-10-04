-- TikTok and News were removed from the active 1sl2tpvn runtime on 2026-10-05.
-- Keep historical migrations intact; this migration defines the current schema state.

delete from public.yt1988_social_sessions
where platform in ('tiktok','news');

delete from public.yt1988_social_snapshots
where platform in ('tiktok','news');

alter table public.yt1988_social_sessions
  drop constraint if exists yt1988_social_sessions_platform_check;
alter table public.yt1988_social_sessions
  add constraint yt1988_social_sessions_platform_check
  check (platform = any (array['youtube'::text,'facebook'::text]));

alter table public.yt1988_social_snapshots
  drop constraint if exists yt1988_social_snapshots_platform_check;
alter table public.yt1988_social_snapshots
  add constraint yt1988_social_snapshots_platform_check
  check (platform = any (array['youtube'::text,'facebook'::text]));

drop table if exists public.yt1988_tiktok_live_package cascade;
drop table if exists public.yt1988_tiktok_video_package cascade;
drop table if exists public.yt1988_tiktok_library_package cascade;
drop table if exists public.yt1988_tiktok_live_channels cascade;
drop table if exists public.yt1988_tiktok_video_channels cascade;
drop table if exists public.yt1988_tiktok_videos cascade;
drop table if exists public.yt1988_tiktok_channels cascade;

drop function if exists public.yt1988_tiktok_live_package_monotonic() cascade;
drop function if exists public.yt1988_tiktok_bind_channel_id() cascade;
drop function if exists public.yt1988_tiktok_orphan_objects(integer) cascade;
