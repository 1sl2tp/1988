-- Bound TikTok canonical metadata so Supabase remains a small durable library.
-- Media URLs are transient playback state and must not live in canonical rows.
-- Keep only the 10 newest metadata rows per canonical channel.

update public.yt1988_tiktok_videos
set mp4_url='',
    mp4_expires_at=null,
    mp4_source='',
    mp4_updated_at=null
where coalesce(mp4_url,'') <> ''
   or mp4_expires_at is not null
   or coalesce(mp4_source,'') <> ''
   or mp4_updated_at is not null;

with ranked as (
  select
    video_id,
    row_number() over (
      partition by channel_id
      order by create_time desc, video_id desc
    ) as rn
  from public.yt1988_tiktok_videos
)
delete from public.yt1988_tiktok_videos v
using ranked r
where v.video_id=r.video_id
  and r.rn>10;
