-- v336: LIVE is a real-time feed and must never be starved by repeated
-- pending work from large non-live tabs. Reserve a scheduler slot for LIVE
-- whenever it is due, then use the remaining slot fairly.

create or replace function public.yt1988_enqueue_refresh()
returns bigint
language plpgsql
security definer
set search_path=public,net
as $$
declare
  chosen_scopes text[] := '{}'::text[];
  live_due boolean := false;
  hash_scope text;
  other_scope text;
  request_id bigint;
begin
  select exists(
    select 1
    from public.yt1988_refresh_config c
    where c.profile_key='owner'
      and c.scope='live'
      and c.enabled=true
      and (
        c.last_enqueued_at is null
        or c.last_enqueued_at <= now()-make_interval(mins=>greatest(1,c.interval_minutes))
        or exists(
          select 1
          from public.yt1988_refresh_state r,
               unnest(coalesce(r.pending_scopes,'{}'::text[])) p(scope)
          where r.profile_key='owner' and p.scope='live'
        )
      )
  ) into live_due;

  if live_due then
    chosen_scopes := array_append(chosen_scopes,'live');
  end if;

  with enabled_hashes as (
    select
      c.scope,
      c.last_enqueued_at,
      greatest(1,c.interval_minutes) interval_minutes,
      coalesce(h.position,9999) position,
      p.updated_at package_updated_at,
      exists(
        select 1
        from public.yt1988_refresh_state r,
             unnest(coalesce(r.pending_scopes,'{}'::text[])) q(scope)
        where r.profile_key='owner' and q.scope=c.scope
      ) is_pending
    from public.yt1988_refresh_config c
    join public.yt1988_hashtags h
      on h.profile_key=c.profile_key
     and h.hashtag_id=c.scope
     and h.enabled=true
    left join public.yt1988_packages p
      on p.profile_key=c.profile_key and p.scope=c.scope
    where c.profile_key='owner'
      and c.enabled=true
      and exists(
        select 1 from public.yt1988_source_state s
        where s.profile_key=c.profile_key
          and s.scope=c.scope
          and s.status='selected'
      )
      and (
        c.last_enqueued_at is null
        or c.last_enqueued_at <= now()-make_interval(mins=>greatest(1,c.interval_minutes))
        or exists(
          select 1
          from public.yt1988_refresh_state r,
               unnest(coalesce(r.pending_scopes,'{}'::text[])) q(scope)
          where r.profile_key='owner' and q.scope=c.scope
        )
      )
  )
  select scope into hash_scope
  from enabled_hashes
  order by is_pending desc, package_updated_at asc nulls first, last_enqueued_at asc nulls first, position, scope
  limit 1;

  if hash_scope is not null and cardinality(chosen_scopes)<2 then
    chosen_scopes := array_append(chosen_scopes,hash_scope);
  end if;

  if cardinality(chosen_scopes)<2 then
    with systems as (
      select
        c.scope,
        c.last_enqueued_at,
        greatest(1,c.interval_minutes) interval_minutes,
        p.updated_at package_updated_at,
        exists(
          select 1
          from public.yt1988_refresh_state r,
               unnest(coalesce(r.pending_scopes,'{}'::text[])) q(scope)
          where r.profile_key='owner' and q.scope=c.scope
        ) is_pending,
        case
          when c.last_enqueued_at is null then 1000000::numeric
          else extract(epoch from (now()-c.last_enqueued_at)) /
               greatest(60::numeric,greatest(1,c.interval_minutes)*60::numeric)
        end overdue_ratio
      from public.yt1988_refresh_config c
      left join public.yt1988_packages p
        on p.profile_key=c.profile_key and p.scope=c.scope
      where c.profile_key='owner'
        and c.enabled=true
        and c.scope=any(array['live','latest','week']::text[])
        and not (c.scope=any(chosen_scopes))
        and (
          c.last_enqueued_at is null
          or c.last_enqueued_at <= now()-make_interval(mins=>greatest(1,c.interval_minutes))
          or exists(
            select 1
            from public.yt1988_refresh_state r,
                 unnest(coalesce(r.pending_scopes,'{}'::text[])) q(scope)
            where r.profile_key='owner' and q.scope=c.scope
          )
        )
    )
    select scope into other_scope
    from systems
    order by
      case scope when 'live' then 0 else 1 end,
      overdue_ratio desc,
      is_pending desc,
      package_updated_at asc nulls first,
      case scope when 'latest' then 1 when 'week' then 2 else 3 end
    limit 1;

    if other_scope is not null then
      chosen_scopes := array_append(chosen_scopes,other_scope);
    end if;
  end if;

  if coalesce(cardinality(chosen_scopes),0)=0 then
    return null;
  end if;

  update public.yt1988_refresh_config
  set last_enqueued_at=now(), updated_at=now()
  where profile_key='owner' and scope=any(chosen_scopes);

  update public.yt1988_refresh_state
  set pending_scopes=coalesce((
    select array_agg(x order by x)
    from unnest(coalesce(pending_scopes,'{}'::text[])) x
    where not (x=any(chosen_scopes))
  ),'{}'::text[])
  where profile_key='owner';

  request_id := net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-refresh',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := jsonb_build_object('scopes',to_jsonb(chosen_scopes))
  );
  return request_id;
end;
$$;

revoke all on function public.yt1988_enqueue_refresh() from public,anon,authenticated;
grant execute on function public.yt1988_enqueue_refresh() to postgres,service_role;

update public.yt1988_refresh_config
set last_enqueued_at=null, updated_at=now()
where profile_key='owner' and scope='live';
