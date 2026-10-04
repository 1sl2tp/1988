-- Keep the orphan scanner aligned with the current canonical schema.
-- TikTok image mirrors are retired, so any unreferenced object is removable.
create or replace function public.yt1988_tiktok_orphan_objects(p_limit integer default 500)
returns table(name text)
language sql
security definer
set search_path to 'public','storage'
as $$
  with refs as (
    select regexp_replace(avatar_stored_url,'^.*/tiktok-originals/','') as name
      from public.yt1988_tiktok_channels
     where avatar_stored_url like '%/tiktok-originals/%'
    union
    select regexp_replace(cover_stored_url,'^.*/tiktok-originals/','')
      from public.yt1988_tiktok_videos
     where cover_stored_url like '%/tiktok-originals/%'
  )
  select o.name
    from storage.objects o
    left join refs r on r.name=o.name
   where o.bucket_id='tiktok-originals'
     and r.name is null
   order by o.created_at
   limit least(greatest(coalesce(p_limit,500),1),1000);
$$;
