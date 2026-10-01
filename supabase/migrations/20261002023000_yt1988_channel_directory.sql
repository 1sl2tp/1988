create table if not exists public.yt1988_channel_directory (
  profile_key text not null,
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]+$'),
  name text not null default '',
  thumbnail_url text not null default '',
  subscribers text not null default '',
  source text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_key, channel_id)
);

alter table public.yt1988_channel_directory enable row level security;

insert into public.yt1988_channel_directory (
  profile_key,
  channel_id,
  name,
  thumbnail_url,
  subscribers,
  source,
  first_seen_at,
  last_seen_at,
  updated_at
)
select
  profile_key,
  channel_id,
  coalesce((array_agg(nullif(name,'') order by updated_at desc) filter (where nullif(name,'') is not null))[1], ''),
  coalesce((array_agg(nullif(thumbnail_url,'') order by updated_at desc) filter (where nullif(thumbnail_url,'') is not null))[1], ''),
  coalesce((array_agg(nullif(subscribers,'') order by updated_at desc) filter (where nullif(subscribers,'') is not null))[1], ''),
  'source-state-migration',
  min(updated_at),
  max(updated_at),
  max(updated_at)
from public.yt1988_source_state
where channel_id ~ '^UC[A-Za-z0-9_-]+$'
group by profile_key, channel_id
on conflict (profile_key, channel_id) do nothing;

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
      left(regexp_replace(coalesce(x.source,''), '\s+', ' ', 'g'), 80) as source
    from jsonb_to_recordset(coalesce(p_channels, '[]'::jsonb))
      as x(channel_id text, name text, thumbnail_url text, subscribers text, source text)
    where btrim(coalesce(x.channel_id,'')) ~ '^UC[A-Za-z0-9_-]+$'
    order by btrim(x.channel_id)
  ),
  saved as (
    insert into public.yt1988_channel_directory as d (
      profile_key,
      channel_id,
      name,
      thumbnail_url,
      subscribers,
      source,
      first_seen_at,
      last_seen_at,
      updated_at
    )
    select
      p_profile_key,
      i.channel_id,
      i.name,
      i.thumbnail_url,
      i.subscribers,
      i.source,
      now(),
      now(),
      now()
    from incoming i
    where i.name <> '' or i.thumbnail_url <> '' or i.subscribers <> ''
    on conflict (profile_key, channel_id) do update
    set
      name = case when excluded.name <> '' then excluded.name else d.name end,
      thumbnail_url = case when excluded.thumbnail_url <> '' then excluded.thumbnail_url else d.thumbnail_url end,
      subscribers = case when excluded.subscribers <> '' then excluded.subscribers else d.subscribers end,
      source = case when excluded.source <> '' then excluded.source else d.source end,
      last_seen_at = now(),
      updated_at = case
        when
          (excluded.name <> '' and excluded.name is distinct from d.name) or
          (excluded.thumbnail_url <> '' and excluded.thumbnail_url is distinct from d.thumbnail_url) or
          (excluded.subscribers <> '' and excluded.subscribers is distinct from d.subscribers)
        then now()
        else d.updated_at
      end
    returning 1
  )
  select count(*) into v_count from saved;

  return coalesce(v_count, 0);
end;
$$;
