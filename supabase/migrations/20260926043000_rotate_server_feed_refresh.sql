-- v305: spread central 1988 package refreshes across scopes.
-- Browsers remain download-only. One cron tick refreshes one bounded scope group
-- instead of fan-out over all selected channels in all 11 tabs at once.

create or replace function public.yt1988_enqueue_refresh()
returns bigint
language plpgsql
security definer
set search_path=public,net
as $$
declare
  slot integer := mod(floor(extract(epoch from clock_timestamp()) / 60)::bigint,10)::integer;
  scopes text[];
begin
  scopes := case slot
    when 0 then array['live']::text[]
    when 1 then array['latest']::text[]
    when 2 then array['week']::text[]
    when 3 then array['news']::text[]
    when 4 then array['economy']::text[]
    when 5 then array['law']::text[]
    when 6 then array['film']::text[]
    when 7 then array['music']::text[]
    when 8 then array['tech']::text[]
    else array['sports','entertainment']::text[]
  end;

  return net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-refresh',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := jsonb_build_object('scopes',to_jsonb(scopes))
  );
end;
$$;

revoke all on function public.yt1988_enqueue_refresh() from public,anon,authenticated;
grant execute on function public.yt1988_enqueue_refresh() to postgres,service_role;
