-- Canonical YouTube identity cleanup.
-- Identity owner: yt1988_channel_directory(profile_key, channel_id).

insert into public.yt1988_channel_directory (
  profile_key, channel_id, name, thumbnail_url, subscribers,
  source, first_seen_at, last_seen_at, updated_at
)
select
  c.profile_key,
  c.channel_id,
  coalesce(c.source_name,''),
  coalesce(c.thumbnail_url,''),
  '',
  'channel-cache-backfill',
  coalesce(c.last_success_at,c.checked_at,now()),
  coalesce(c.last_success_at,c.checked_at,now()),
  now()
from public.yt1988_channel_cache c
left join public.yt1988_channel_directory d
  on d.profile_key=c.profile_key and d.channel_id=c.channel_id
where d.channel_id is null
on conflict (profile_key,channel_id) do nothing;

create or replace function public.yt1988_set_source_state(
  p_profile_key text,
  p_scope text,
  p_channel_id text,
  p_status text,
  p_name text default '',
  p_thumbnail_url text default '',
  p_subscribers text default '',
  p_version bigint default 0
)
returns public.yt1988_source_state
language plpgsql
security definer
set search_path=public
as $$
declare
  out_row public.yt1988_source_state;
begin
  if p_profile_key is null or btrim(p_profile_key) = '' then raise exception 'bad_profile_key'; end if;
  if p_scope is null or btrim(p_scope) = '' or length(p_scope) > 32 then raise exception 'bad_scope'; end if;
  if p_channel_id is null or p_channel_id !~ '^UC[A-Za-z0-9_-]+$' then raise exception 'bad_channel_id'; end if;
  if p_status not in ('selected','blocked','normal') then raise exception 'bad_status'; end if;

  insert into public.yt1988_source_state (
    profile_key, scope, channel_id, status, version, updated_at
  )
  values (
    btrim(p_profile_key), btrim(p_scope), btrim(p_channel_id), p_status,
    greatest(0,coalesce(p_version,0)), now()
  )
  on conflict (profile_key,scope,channel_id)
  do update set
    status=excluded.status,
    version=excluded.version,
    updated_at=now()
  where excluded.version >= public.yt1988_source_state.version
  returning * into out_row;

  if out_row.profile_key is null then
    select * into out_row
    from public.yt1988_source_state
    where profile_key=btrim(p_profile_key)
      and scope=btrim(p_scope)
      and channel_id=btrim(p_channel_id);
  end if;

  return out_row;
end;
$$;

create or replace function public.yt1988_replace_source_state(
  p_profile_key text,
  p_rows jsonb,
  p_version bigint
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  changed integer := 0;
begin
  if p_profile_key is null or btrim(p_profile_key) = '' then raise exception 'bad_profile_key'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad_rows'; end if;

  update public.yt1988_source_state
  set status='normal',
      version=greatest(version,coalesce(p_version,0)),
      updated_at=now()
  where profile_key=btrim(p_profile_key)
    and version <= coalesce(p_version,0);

  insert into public.yt1988_source_state (
    profile_key, scope, channel_id, status, version, updated_at
  )
  select
    btrim(p_profile_key),
    btrim(x.scope),
    btrim(x.channel_id),
    x.status,
    greatest(0,coalesce(p_version,0)),
    now()
  from jsonb_to_recordset(p_rows) as x(scope text, channel_id text, status text)
  where x.scope is not null
    and btrim(x.scope)<>''
    and length(btrim(x.scope))<=32
    and x.channel_id ~ '^UC[A-Za-z0-9_-]+$'
    and x.status in ('selected','blocked')
  on conflict (profile_key,scope,channel_id)
  do update set
    status=excluded.status,
    version=excluded.version,
    updated_at=now()
  where excluded.version >= public.yt1988_source_state.version;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

update public.yt1988_user_state
set state=jsonb_set(
          jsonb_set(coalesce(state,'{}'::jsonb),'{avatars}','{}'::jsonb,true),
          '{customSources}','[]'::jsonb,true
        ),
    updated_at=now()
where profile_key='owner';

alter table public.yt1988_source_state
  drop constraint if exists yt1988_source_state_channel_fk;
alter table public.yt1988_source_state
  add constraint yt1988_source_state_channel_fk
  foreign key (profile_key,channel_id)
  references public.yt1988_channel_directory(profile_key,channel_id)
  on update cascade on delete restrict;

alter table public.yt1988_channel_cache
  drop constraint if exists yt1988_channel_cache_channel_fk;
alter table public.yt1988_channel_cache
  add constraint yt1988_channel_cache_channel_fk
  foreign key (profile_key,channel_id)
  references public.yt1988_channel_directory(profile_key,channel_id)
  on update cascade on delete restrict;

alter table public.yt1988_source_state
  drop column if exists name,
  drop column if exists thumbnail_url,
  drop column if exists subscribers;

alter table public.yt1988_channel_cache
  drop column if exists source_name,
  drop column if exists thumbnail_url;
