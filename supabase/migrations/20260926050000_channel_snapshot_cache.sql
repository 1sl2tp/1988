-- v306: persistent per-channel snapshots + queued refresh handoff.
-- Browsers stay download-only. Server refreshes reuse the last good channel
-- snapshot so a temporary upstream failure can never collapse a shared feed.

create table if not exists public.yt1988_channel_cache (
  profile_key text not null,
  channel_id text not null,
  items jsonb not null default '[]'::jsonb,
  hash text not null default '',
  newest_video_id text not null default '',
  newest_uploaded_at timestamptz,
  source_name text not null default '',
  thumbnail_url text not null default '',
  checked_at timestamptz,
  last_success_at timestamptz,
  last_error text not null default '',
  retry_after timestamptz,
  version bigint not null default 0,
  primary key (profile_key,channel_id)
);

create index if not exists yt1988_channel_cache_checked_idx
  on public.yt1988_channel_cache(profile_key,checked_at);

create index if not exists yt1988_channel_cache_success_idx
  on public.yt1988_channel_cache(profile_key,last_success_at desc);

alter table public.yt1988_channel_cache enable row level security;
revoke all on table public.yt1988_channel_cache from public,anon,authenticated;
grant all on table public.yt1988_channel_cache to service_role;

alter table public.yt1988_refresh_state
  add column if not exists pending_scopes text[] not null default '{}'::text[];

create or replace function public.yt1988_queue_refresh(
  p_profile_key text,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  valid_scopes constant text[] := array[
    'live','latest','week','news','economy','law',
    'film','music','tech','sports','entertainment'
  ];
begin
  insert into public.yt1988_refresh_state(profile_key,pending_scopes)
  values(
    p_profile_key,
    coalesce((
      select array_agg(distinct s order by s)
      from unnest(coalesce(p_scopes,'{}'::text[])) s
      where s=any(valid_scopes)
    ),'{}'::text[])
  )
  on conflict (profile_key) do update
  set pending_scopes=coalesce((
    select array_agg(distinct s order by s)
    from unnest(
      coalesce(public.yt1988_refresh_state.pending_scopes,'{}'::text[]) ||
      coalesce(excluded.pending_scopes,'{}'::text[])
    ) s
    where s=any(valid_scopes)
  ),'{}'::text[]);
end;
$$;

create or replace function public.yt1988_finish_refresh_v2(
  p_profile_key text,
  p_ok boolean,
  p_error text default ''
)
returns text[]
language plpgsql
security definer
set search_path=public
as $$
declare
  pending text[] := '{}'::text[];
begin
  select coalesce(pending_scopes,'{}'::text[])
  into pending
  from public.yt1988_refresh_state
  where profile_key=p_profile_key
  for update;

  update public.yt1988_refresh_state
  set running_until=null,
      last_finished_at=now(),
      last_ok=coalesce(p_ok,false),
      last_error=left(coalesce(p_error,''),2000),
      pending_scopes='{}'::text[]
  where profile_key=p_profile_key;

  return coalesce(pending,'{}'::text[]);
end;
$$;

revoke all on function public.yt1988_queue_refresh(text,text[]) from public,anon,authenticated;
revoke all on function public.yt1988_finish_refresh_v2(text,boolean,text) from public,anon,authenticated;
grant execute on function public.yt1988_queue_refresh(text,text[]) to service_role;
grant execute on function public.yt1988_finish_refresh_v2(text,boolean,text) to service_role;

-- Seed channel snapshots from whatever good package data already exists.
-- The worker will refresh/normalize these rows incrementally afterwards.
with expanded as (
  select
    p.profile_key,
    coalesce(
      nullif(e.item->>'_sourceId',''),
      nullif(e.item->>'channelId',''),
      nullif(e.item->>'uploaderId','')
    ) as channel_id,
    e.item,
    p.updated_at,
    coalesce(
      nullif(e.item->>'_sourceName',''),
      nullif(e.item->>'uploaderName',''),
      nullif(e.item->>'uploader','')
    ) as source_name
  from public.yt1988_packages p
  cross join lateral jsonb_array_elements(p.items) e(item)
  where p.profile_key='owner'
),
grouped as (
  select
    profile_key,
    channel_id,
    jsonb_agg(item order by updated_at desc) as items,
    max(source_name) filter(where source_name is not null and source_name<>'') as source_name,
    max(updated_at) as at
  from expanded
  where channel_id ~ '^UC[A-Za-z0-9_-]+$'
  group by profile_key,channel_id
)
insert into public.yt1988_channel_cache(
  profile_key,channel_id,items,hash,source_name,
  checked_at,last_success_at,last_error,retry_after,version
)
select
  profile_key,
  channel_id,
  items,
  md5(items::text),
  coalesce(source_name,''),
  at,
  at,
  '',
  null,
  floor(extract(epoch from at)*1000)::bigint
from grouped
on conflict (profile_key,channel_id) do nothing;
