-- v324: keep the feed refresh worker bounded and drain pending work gradually.
-- Two scopes per minute matches the configured cadence without creating
-- overlapping 150s edge executions.

update public.yt1988_refresh_config
set interval_minutes=10,
    updated_at=now()
where profile_key='owner'
  and scope like 'hash\_%' escape '\';

create or replace function public.yt1988_enqueue_refresh()
returns bigint
language plpgsql
security definer
set search_path=public,net
as $$
declare
  chosen_scopes text[] := '{}'::text[];
  request_id bigint;
begin
  with enabled_scopes as (
    select
      c.scope,
      greatest(1,c.interval_minutes) as interval_minutes,
      c.last_enqueued_at,
      coalesce(h.position,9999) as position
    from public.yt1988_refresh_config c
    left join public.yt1988_hashtags h
      on h.profile_key=c.profile_key
     and h.hashtag_id=c.scope
     and h.enabled=true
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
      exists(select 1 from pending p where p.scope=e.scope) as is_pending,
      case
        when e.last_enqueued_at is null then 1000000::numeric
        else extract(epoch from (now()-e.last_enqueued_at)) /
             greatest(60::numeric,e.interval_minutes*60::numeric)
      end as overdue_ratio
    from enabled_scopes e
    where exists(select 1 from pending p where p.scope=e.scope)
       or e.last_enqueued_at is null
       or e.last_enqueued_at <= now()-make_interval(mins=>e.interval_minutes)
  ),
  ranked as (
    select scope,
           row_number() over (
             order by
               is_pending desc,
               overdue_ratio desc,
               case scope when 'live' then 1 when 'latest' then 2 when 'week' then 3 else 10 end,
               position,
               scope
           ) as ord
    from candidates
    limit 2
  )
  select coalesce(array_agg(scope order by ord),'{}'::text[])
  into chosen_scopes
  from ranked;

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

-- Force one fresh scheduling cycle after rollout.
update public.yt1988_refresh_config
set last_enqueued_at=null,
    updated_at=now()
where profile_key='owner';
