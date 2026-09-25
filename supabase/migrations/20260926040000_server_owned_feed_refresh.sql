-- v304: server-owned 1988 feed refresh
-- Clients are read-only package consumers. This lease prevents overlapping
-- central refreshes, while pg_cron only enqueues a server refresh tick.

create table if not exists public.yt1988_refresh_state (
  profile_key text primary key,
  running_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_ok boolean,
  last_error text
);

alter table public.yt1988_refresh_state enable row level security;

create or replace function public.yt1988_try_refresh_lock(
  p_profile_key text,
  p_lease_seconds integer default 110
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  got boolean := false;
begin
  insert into public.yt1988_refresh_state(
    profile_key,running_until,last_started_at,last_ok,last_error
  )
  values(
    p_profile_key,
    now() + make_interval(secs => greatest(30,least(coalesce(p_lease_seconds,110),300))),
    now(),
    null,
    ''
  )
  on conflict (profile_key) do update
    set running_until=excluded.running_until,
        last_started_at=excluded.last_started_at,
        last_ok=null,
        last_error=''
    where public.yt1988_refresh_state.running_until is null
       or public.yt1988_refresh_state.running_until < now()
  returning true into got;

  return coalesce(got,false);
end;
$$;

create or replace function public.yt1988_finish_refresh(
  p_profile_key text,
  p_ok boolean,
  p_error text default ''
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.yt1988_refresh_state
  set running_until=null,
      last_finished_at=now(),
      last_ok=coalesce(p_ok,false),
      last_error=left(coalesce(p_error,''),2000)
  where profile_key=p_profile_key;
end;
$$;

create or replace function public.yt1988_enqueue_refresh()
returns bigint
language sql
security definer
set search_path=public,net
as $$
  select net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-refresh',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$;

revoke all on function public.yt1988_try_refresh_lock(text,integer) from public,anon,authenticated;
revoke all on function public.yt1988_finish_refresh(text,boolean,text) from public,anon,authenticated;
revoke all on function public.yt1988_enqueue_refresh() from public,anon,authenticated;
grant execute on function public.yt1988_try_refresh_lock(text,integer) to service_role;
grant execute on function public.yt1988_finish_refresh(text,boolean,text) to service_role;
grant execute on function public.yt1988_enqueue_refresh() to postgres,service_role;

do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='yt1988-refresh-every-minute' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule(
  'yt1988-refresh-every-minute',
  '* * * * *',
  'select public.yt1988_enqueue_refresh();'
);
