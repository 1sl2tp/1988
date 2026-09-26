-- v323: dynamic server-owned hashtag feeds.
-- Live/Ngày/Tuần stay system scopes; every content tab becomes a neutral hash_* id.

create table if not exists public.yt1988_hashtags (
  profile_key text not null,
  hashtag_id text not null,
  label text not null,
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_key,hashtag_id),
  check (hashtag_id ~ '^hash_[a-z0-9]+$'),
  check (char_length(btrim(label)) between 1 and 40)
);

alter table public.yt1988_hashtags enable row level security;
revoke all on table public.yt1988_hashtags from public,anon,authenticated;
grant all on table public.yt1988_hashtags to service_role;

-- Remove the fixed whitelist so refresh cadence can follow newly created hashtags.
alter table public.yt1988_refresh_config
  drop constraint if exists yt1988_refresh_config_scope_check;

-- Seed the eight existing content tabs. Preserve any renamed display labels.
with seed(old_scope,hashtag_id,default_label,position) as (
  values
    ('news','hash_001','Khám phá',10),
    ('economy','hash_002','Review',20),
    ('law','hash_003','Hài',30),
    ('film','hash_004','Phim ngắn',40),
    ('music','hash_005','Nhạc',50),
    ('tech','hash_006','Công nghệ',60),
    ('sports','hash_007','Thể thao',70),
    ('entertainment','hash_008','Showbiz',80)
),
legacy as (
  select state
  from public.yt1988_user_state
  where profile_key='owner'
  limit 1
)
insert into public.yt1988_hashtags(profile_key,hashtag_id,label,position,enabled)
select
  'owner',
  s.hashtag_id,
  left(coalesce(nullif(btrim(legacy.state->'sourceLabels'->>s.old_scope),''),s.default_label),40),
  s.position,
  true
from seed s
left join legacy on true
on conflict (profile_key,hashtag_id) do update
set label=excluded.label,
    position=excluded.position,
    enabled=true,
    updated_at=now();

-- Move source state without losing selected/blocked rows or metadata.
with map(old_scope,new_scope) as (
  values
    ('news','hash_001'),('economy','hash_002'),('law','hash_003'),('film','hash_004'),
    ('music','hash_005'),('tech','hash_006'),('sports','hash_007'),('entertainment','hash_008')
)
insert into public.yt1988_source_state(
  profile_key,scope,channel_id,status,name,thumbnail_url,subscribers,version,updated_at
)
select s.profile_key,m.new_scope,s.channel_id,s.status,s.name,s.thumbnail_url,s.subscribers,s.version,s.updated_at
from public.yt1988_source_state s
join map m on m.old_scope=s.scope
on conflict (profile_key,scope,channel_id) do update
set status=excluded.status,
    name=case when excluded.name<>'' then excluded.name else yt1988_source_state.name end,
    thumbnail_url=case when excluded.thumbnail_url<>'' then excluded.thumbnail_url else yt1988_source_state.thumbnail_url end,
    subscribers=case when excluded.subscribers<>'' then excluded.subscribers else yt1988_source_state.subscribers end,
    version=greatest(yt1988_source_state.version,excluded.version),
    updated_at=greatest(yt1988_source_state.updated_at,excluded.updated_at);

delete from public.yt1988_source_state
where scope in ('news','economy','law','film','music','tech','sports','entertainment');

-- Move current server packages to their neutral identities for an uninterrupted rollout.
with map(old_scope,new_scope) as (
  values
    ('news','hash_001'),('economy','hash_002'),('law','hash_003'),('film','hash_004'),
    ('music','hash_005'),('tech','hash_006'),('sports','hash_007'),('entertainment','hash_008')
)
insert into public.yt1988_packages(
  profile_key,scope,hash,input_hash,source_signature,items,version,updated_at
)
select p.profile_key,m.new_scope,p.hash,p.input_hash,p.source_signature,p.items,p.version,p.updated_at
from public.yt1988_packages p
join map m on m.old_scope=p.scope
on conflict (profile_key,scope) do update
set hash=excluded.hash,
    input_hash=excluded.input_hash,
    source_signature=excluded.source_signature,
    items=excluded.items,
    version=greatest(yt1988_packages.version,excluded.version),
    updated_at=greatest(yt1988_packages.updated_at,excluded.updated_at);

delete from public.yt1988_packages
where scope in ('news','economy','law','film','music','tech','sports','entertainment');

-- Migrate refresh configuration; all hashtags share the generic engine.
with map(old_scope,new_scope) as (
  values
    ('news','hash_001'),('economy','hash_002'),('law','hash_003'),('film','hash_004'),
    ('music','hash_005'),('tech','hash_006'),('sports','hash_007'),('entertainment','hash_008')
)
insert into public.yt1988_refresh_config(
  profile_key,scope,interval_minutes,enabled,last_enqueued_at,updated_at
)
select c.profile_key,m.new_scope,c.interval_minutes,c.enabled,c.last_enqueued_at,c.updated_at
from public.yt1988_refresh_config c
join map m on m.old_scope=c.scope
on conflict (profile_key,scope) do update
set interval_minutes=excluded.interval_minutes,
    enabled=excluded.enabled,
    last_enqueued_at=excluded.last_enqueued_at,
    updated_at=greatest(yt1988_refresh_config.updated_at,excluded.updated_at);

delete from public.yt1988_refresh_config
where scope in ('news','economy','law','film','music','tech','sports','entertainment');

-- Pending refreshes must accept current system scopes plus enabled hashtags.
create or replace function public.yt1988_queue_refresh(
  p_profile_key text,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.yt1988_refresh_state(profile_key,pending_scopes)
  values(
    p_profile_key,
    coalesce((
      select array_agg(distinct s order by s)
      from unnest(coalesce(p_scopes,'{}'::text[])) s
      where s=any(array['live','latest','week']::text[])
         or exists(
           select 1 from public.yt1988_hashtags h
           where h.profile_key=p_profile_key and h.hashtag_id=s and h.enabled=true
         )
    ),'{}'::text[])
  )
  on conflict (profile_key) do update
  set pending_scopes=coalesce((
    select array_agg(distinct s order by s)
    from unnest(
      coalesce(public.yt1988_refresh_state.pending_scopes,'{}'::text[]) ||
      coalesce(excluded.pending_scopes,'{}'::text[])
    ) s
    where s=any(array['live','latest','week']::text[])
       or exists(
         select 1 from public.yt1988_hashtags h
         where h.profile_key=p_profile_key and h.hashtag_id=s and h.enabled=true
       )
  ),'{}'::text[]);
end;
$$;

revoke all on function public.yt1988_queue_refresh(text,text[]) from public,anon,authenticated;
grant execute on function public.yt1988_queue_refresh(text,text[]) to service_role;

-- The scheduler never enqueues a hashtag with zero selected sources.
create or replace function public.yt1988_enqueue_refresh()
returns bigint
language plpgsql
security definer
set search_path=public,net
as $$
declare
  due_scopes text[];
  request_id bigint;
begin
  select array_agg(c.scope order by
    case c.scope when 'live' then 1 when 'latest' then 2 when 'week' then 3 else 10 end,
    coalesce(h.position,9999),c.scope
  )
  into due_scopes
  from public.yt1988_refresh_config c
  left join public.yt1988_hashtags h
    on h.profile_key=c.profile_key and h.hashtag_id=c.scope and h.enabled=true
  where c.profile_key='owner'
    and c.enabled=true
    and (
      c.last_enqueued_at is null
      or c.last_enqueued_at <= now()-make_interval(mins=>c.interval_minutes)
    )
    and (
      c.scope=any(array['live','latest','week']::text[])
      or (
        h.hashtag_id is not null
        and exists(
          select 1
          from public.yt1988_source_state s
          where s.profile_key=c.profile_key
            and s.scope=c.scope
            and s.status='selected'
        )
      )
    );

  if coalesce(cardinality(due_scopes),0)=0 then
    return null;
  end if;

  update public.yt1988_refresh_config
  set last_enqueued_at=now(),updated_at=now()
  where profile_key='owner' and scope=any(due_scopes);

  request_id := net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-refresh',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := jsonb_build_object('scopes',to_jsonb(due_scopes))
  );
  return request_id;
end;
$$;

revoke all on function public.yt1988_enqueue_refresh() from public,anon,authenticated;
grant execute on function public.yt1988_enqueue_refresh() to postgres,service_role;
