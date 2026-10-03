-- Unified channel-library profile contract for YouTube.
-- TikTok already keeps the equivalent canonical fields in yt1988_tiktok_channels.
-- No new duplicate channel table is introduced.

alter table public.yt1988_channel_directory
  add column if not exists handle text not null default '',
  add column if not exists description text not null default '',
  add column if not exists verified boolean not null default false,
  add column if not exists verified_known boolean not null default false,
  add column if not exists subscriber_count bigint not null default 0,
  add column if not exists view_count bigint not null default 0,
  add column if not exists video_count bigint not null default 0,
  add column if not exists profile_url text not null default '',
  add column if not exists profile_checked_at timestamptz;

update public.yt1988_channel_directory
set subscriber_count = subscribers::bigint
where subscriber_count = 0
  and subscribers ~ '^[0-9]+$';

create or replace function public.yt1988_upsert_channel_directory(
  p_profile_key text,
  p_channels jsonb
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_profile_key is null or btrim(p_profile_key) = '' then
    return 0;
  end if;

  with incoming as (
    select distinct on (btrim(x.channel_id))
      btrim(x.channel_id) as channel_id,
      left(regexp_replace(coalesce(x.name,''), '\s+', ' ', 'g'), 180) as name,
      left(btrim(coalesce(x.thumbnail_url,'')), 1000) as thumbnail_url,
      left(regexp_replace(coalesce(x.subscribers,''), '\s+', ' ', 'g'), 120) as subscribers,
      left(regexp_replace(coalesce(x.handle,''), '\s+', ' ', 'g'), 120) as handle,
      left(regexp_replace(coalesce(x.description,''), '\s+', ' ', 'g'), 2000) as description,
      coalesce(x.verified,false) as verified,
      coalesce(x.verified_known,false) as verified_known,
      greatest(coalesce(x.subscriber_count,0),0)::bigint as subscriber_count,
      greatest(coalesce(x.view_count,0),0)::bigint as view_count,
      greatest(coalesce(x.video_count,0),0)::bigint as video_count,
      left(btrim(coalesce(x.profile_url,'')), 1000) as profile_url,
      x.profile_checked_at as profile_checked_at,
      left(regexp_replace(coalesce(x.source,''), '\s+', ' ', 'g'), 80) as source
    from jsonb_to_recordset(coalesce(p_channels, '[]'::jsonb))
      as x(
        channel_id text,
        name text,
        thumbnail_url text,
        subscribers text,
        handle text,
        description text,
        verified boolean,
        subscriber_count bigint,
        view_count bigint,
        video_count bigint,
        profile_url text,
        profile_checked_at timestamptz,
        source text
      )
    where btrim(coalesce(x.channel_id,'')) ~ '^UC[A-Za-z0-9_-]+$'
    order by btrim(x.channel_id), x.profile_checked_at desc nulls last
  ),
  saved as (
    insert into public.yt1988_channel_directory as d (
      profile_key, channel_id, name, thumbnail_url, subscribers, handle,
      description, verified, verified_known, subscriber_count, view_count, video_count,
      profile_url, profile_checked_at, source,
      first_seen_at, last_seen_at, updated_at
    )
    select
      p_profile_key, i.channel_id, i.name, i.thumbnail_url, i.subscribers,
      i.handle, i.description, i.verified, i.verified_known, i.subscriber_count, i.view_count,
      i.video_count, i.profile_url, i.profile_checked_at, i.source,
      now(), now(), now()
    from incoming i
    where
      i.name <> '' or i.thumbnail_url <> '' or i.subscribers <> '' or
      i.handle <> '' or i.description <> '' or i.profile_url <> '' or
      i.profile_checked_at is not null
    on conflict (profile_key, channel_id) do update
    set
      name = case when excluded.name <> '' then excluded.name else d.name end,
      thumbnail_url = case when excluded.thumbnail_url <> '' then excluded.thumbnail_url else d.thumbnail_url end,
      subscribers = case when excluded.subscribers <> '' then excluded.subscribers else d.subscribers end,
      handle = case when excluded.handle <> '' then excluded.handle else d.handle end,
      description = case when excluded.description <> '' then excluded.description else d.description end,
      verified = case when excluded.verified_known then excluded.verified else d.verified end,
      verified_known = case when excluded.verified_known then true else d.verified_known end,
      subscriber_count = case when excluded.subscriber_count > 0 then excluded.subscriber_count else d.subscriber_count end,
      view_count = case when excluded.view_count > 0 then excluded.view_count else d.view_count end,
      video_count = case when excluded.video_count > 0 then excluded.video_count else d.video_count end,
      profile_url = case when excluded.profile_url <> '' then excluded.profile_url else d.profile_url end,
      profile_checked_at = case
        when excluded.profile_checked_at is null then d.profile_checked_at
        when d.profile_checked_at is null then excluded.profile_checked_at
        else greatest(d.profile_checked_at, excluded.profile_checked_at)
      end,
      source = case when excluded.source <> '' then excluded.source else d.source end,
      last_seen_at = now(),
      updated_at = case
        when
          (excluded.name <> '' and excluded.name is distinct from d.name) or
          (excluded.thumbnail_url <> '' and excluded.thumbnail_url is distinct from d.thumbnail_url) or
          (excluded.subscribers <> '' and excluded.subscribers is distinct from d.subscribers) or
          (excluded.handle <> '' and excluded.handle is distinct from d.handle) or
          (excluded.description <> '' and excluded.description is distinct from d.description) or
          (excluded.profile_url <> '' and excluded.profile_url is distinct from d.profile_url) or
          (excluded.profile_checked_at is not null and excluded.profile_checked_at is distinct from d.profile_checked_at) or
          (excluded.verified_known and excluded.verified is distinct from d.verified) or
          (excluded.verified_known and d.verified_known is not true) or
          (excluded.subscriber_count > 0 and excluded.subscriber_count is distinct from d.subscriber_count) or
          (excluded.view_count > 0 and excluded.view_count is distinct from d.view_count) or
          (excluded.video_count > 0 and excluded.video_count is distinct from d.video_count)
        then now()
        else d.updated_at
      end
    returning 1
  )
  select count(*) into v_count from saved;

  return coalesce(v_count, 0);
end;
$$;
