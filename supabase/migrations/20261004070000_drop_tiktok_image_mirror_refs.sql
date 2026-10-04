-- TikTok images stay at their origin CDN. Supabase stores URL metadata only.
update public.yt1988_tiktok_channels
set avatar_stored_url=''
where coalesce(avatar_stored_url,'')<>'';

update public.yt1988_tiktok_videos
set cover_stored_url=''
where coalesce(cover_stored_url,'')<>'';
