-- v325: fair refresh scheduling for system feeds and dynamic hashtags.
-- Guarantee one due hashtag per tick when any hashtag needs work, then use the
-- second slot for the most overdue system feed (or another hashtag if needed).

create or replace function public.yt1988_enqueue_refresh()
returns bigint
language plpgsql
security definer
set search_path=public,net
as $$
declare
  chosen_scopes text[] := '{}'::text[];
  hash_scope text;
  other_scope text;
  request_id bigint;
begin
  with enabled_scopes as (
    select
      c.scope,
      greatest(1,c.interval_minutes) as interval_minutes,
      c.last_enqueued_at,
      coalesce(h.position,9999) as position,
      (h.hashtag_id is not null) as is_hash,
      p.updated_at as package_updated_at
    from public.yt1988_refresh_config c
    left join public.yt1988_hashtags h
      on h.profile_key=c.profile_key
     and h.hashtag_id=c.scope
     and h.enabled=true
    left join public.yt1988_packages p
      on p.profile_key=c.profile_key
     and p.scope=c.scope
    where c.profile_key='owner'
      and c.enabled=true
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
      )
  ),
  pending as (
    select unnest(coalesce(r.pending_scopes,'{}'::text[])) as scope
    from public.yt1988_refresh_state r
    where r.profile_key='owner'
  ),
  candidates as (
    select
      e.*,
      exists(select 1 from pending q where q.scope=e.scope) as is_pending,
      case
        when e.last_enqueued_at is null then 1000000::numeric
        else extract(epoch from (now()-e.last_enqueued_at)) /
             greatest(60::numeric,e.interval_minutes*60::numeric)
      end as overdue_ratio
    from enabled_scopes e
    where exists(select 1 from pending q where q.scope=e.scope)
       or e.last_enqueued_at is null
       or e.last_enqueued_at <= now()-make_interval(mins=>e.interval_minutes)
  )
  select scope
  into hash_scope
  from candidates
  where is_hash
  order by
    is_pending desc,
    package_updated_at asc nulls first,
    overdue_ratio desc,
    position,
    scope
  limit 1;

  if hash_scope is not null then
    chosen_scopes := array_append(chosen_scopes,hash_scope);

    with enabled_scopes as (
      select
        c.scope,
        greatest(1,c.interval_minutes) as interval_minutes,
        c.last_enqueued_at,
        coalesce(h.position,9999) as position,
        (h.hashtag_id is not null) as is_hash,
        p.updated_at as package_updated_at
      from public.yt1988_refresh_config c
      left join public.yt1988_hashtags h
        on h.profile_key=c.profile_key
       and h.hashtag_id=c.scope
       and h.enabled=true
      left join public.yt1988_packages p
        on p.profile_key=c.profile_key
       and p.scope=c.scope
      where c.profile_key='owner'
        and c.enabled=true
        and c.scope<>hash_scope
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
        )
    ),
    pending as (
      select unnest(coalesce(r.pending_scopes,'{}'::text[])) as scope
      from public.yt1988_refresh_state r
      where r.profile_key='owner'
    ),
    candidates as (
      select
        e.*,
        exists(select 1 from pending q where q.scope=e.scope) as is_pending,
        case
          when e.last_enqueued_at is null then 1000000::numeric
          else extract(epoch from (now()-e.last_enqueued_at)) /
               greatest(60::numeric,e.interval_minutes*60::numeric)
        end as overdue_ratio
      from enabled_scopes e
      where exists(select 1 from pending q where q.scope=e.scope)
         or e.last_enqueued_at is null
         or e.last_enqueued_at <= now()-make_interval(mins=>e.interval_minutes)
    )
    select scope
    into other_scope
    from candidates
    order by
      case when is_hash then 1 else 0 end,
      is_pending desc,
      overdue_ratio desc,
      package_updated_at asc nulls first,
      position,
      scope
    limit 1;

    if other_scope is not null then
      chosen_scopes := array_append(chosen_scopes,other_scope);
    end if;
  else
    with enabled_scopes as (
      select
        c.scope,
        greatest(1,c.interval_minutes) as interval_minutes,
        c.last_enqueued_at,
        coalesce(h.position,9999) as position,
        p.updated_at as package_updated_at
      from public.yt1988_refresh_config c
      left join public.yt1988_hashtags h
        on h.profile_key=c.profile_key
       and h.hashtag_id=c.scope
       and h.enabled=true
      left join public.yt1988_packages p
        on p.profile_key=c.profile_key
       and p.scope=c.scope
      where c.profile_key='owner'
        and c.enabled=true
        and c.scope=any(array['live','latest','week']::text[])
    ),
    pending as (
      select unnest(coalesce(r.pending_scopes,'{}'::text[])) as scope
      from public.yt1988_refresh_state r
      where r.profile_key='owner'
    ),
    candidates as (
      select
        e.*,
        exists(select 1 from pending q where q.scope=e.scope) as is_pending,
        case
          when e.last_enqueued_at is null then 1000000::numeric
          else extract(epoch from (now()-e.last_enqueued_at)) /
               greatest(60::numeric,e.interval_minutes*60::numeric)
        end as overdue_ratio
      from enabled_scopes e
      where exists(select 1 from pending q where q.scope=e.scope)
         or e.last_enqueued_at is null
         or e.last_enqueued_at <= now()-make_interval(mins=>e.interval_minutes)
    ),
    ranked as (
      select scope,
             row_number() over (
               order by
                 is_pending desc,
                 overdue_ratio desc,
                 package_updated_at asc nulls first,
                 case scope when 'live' then 1 when 'latest' then 2 else 3 end
             ) ord
      from candidates
      limit 2
    )
    select coalesce(array_agg(scope order by ord),'{}'::text[])
    into chosen_scopes
    from ranked;
  end if;

  if coalesce(cardinality(chosen_scopes),0)=0 then
    return null;
  end if;

  update public.yt1988_refresh_config
  set last_enqueued_at=now(),
      updated_at=now()
  where profile_key='owner'
    and scope=any(chosen_scopes);

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

-- Existing hashtag packages are stale from the previous blocked worker. Make
-- every hashtag immediately eligible so the fair queue drains them in order.
update public.yt1988_refresh_config
set last_enqueued_at=null,
    updated_at=now()
where profile_key='owner'
  and scope like 'hash\_%' escape '\';
