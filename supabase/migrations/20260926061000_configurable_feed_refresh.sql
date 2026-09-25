-- v307: configurable per-scope refresh cadence.
-- The cron stays lightweight (every minute) and only enqueues scopes that are due.
-- Changing interval_minutes changes cadence without changing worker code.

create table if not exists public.yt1988_refresh_config (
  profile_key text not null,
  scope text not null,
  interval_minutes integer not null default 10
    check (interval_minutes between 1 and 1440),
  enabled boolean not null default true,
  last_enqueued_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_key,scope),
  check (scope in (
    'live','latest','week','news','economy','law',
    'film','music','tech','sports','entertainment'
  ))
);

alter table public.yt1988_refresh_config enable row level security;
revoke all on table public.yt1988_refresh_config from public,anon,authenticated;
grant all on table public.yt1988_refresh_config to service_role;

insert into public.yt1988_refresh_config(
  profile_key,scope,interval_minutes,enabled,last_enqueued_at
)
values
  ('owner','live',2,true,now()),
  ('owner','latest',2,true,now()),
  ('owner','week',5,true,now()),
  ('owner','news',5,true,now()),
  ('owner','economy',10,true,now()),
  ('owner','law',10,true,now()),
  ('owner','film',10,true,now()),
  ('owner','music',10,true,now()),
  ('owner','tech',5,true,now()),
  ('owner','sports',5,true,now()),
  ('owner','entertainment',5,true,now())
on conflict (profile_key,scope) do nothing;

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
  select array_agg(scope order by
    case scope
      when 'live' then 1 when 'latest' then 2 when 'week' then 3
      when 'news' then 4 when 'economy' then 5 when 'law' then 6
      when 'film' then 7 when 'music' then 8 when 'tech' then 9
      when 'sports' then 10 when 'entertainment' then 11 else 99
    end
  )
  into due_scopes
  from public.yt1988_refresh_config
  where profile_key='owner'
    and enabled=true
    and (
      last_enqueued_at is null
      or last_enqueued_at <= now()-make_interval(mins=>interval_minutes)
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
