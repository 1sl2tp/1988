-- v312: any source selection/block change affects the LIVE union.
-- Statement-level trigger prevents one HTTP refresh request per changed row.

create or replace function public.yt1988_refresh_live_after_source_change()
returns trigger
language plpgsql
set search_path=public,net
as $$
begin
  perform net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988-refresh',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{"scopes":["live"]}'::jsonb
  );
  return null;
end;
$$;

revoke all on function public.yt1988_refresh_live_after_source_change() from public,anon,authenticated;
grant execute on function public.yt1988_refresh_live_after_source_change() to postgres,service_role;

drop trigger if exists yt1988_source_change_refresh_live
  on public.yt1988_source_state;

create trigger yt1988_source_change_refresh_live
after insert or update or delete on public.yt1988_source_state
for each statement
execute function public.yt1988_refresh_live_after_source_change();
