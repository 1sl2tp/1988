create index if not exists yt1988_source_state_profile_channel_idx
  on public.yt1988_source_state(profile_key,channel_id);

alter function public.yt1988_set_source_state(
  text,text,text,text,text,text,text,bigint
) security invoker;

alter function public.yt1988_replace_source_state(
  text,jsonb,bigint
) security invoker;

revoke execute on function public.yt1988_set_source_state(
  text,text,text,text,text,text,text,bigint
) from public, anon, authenticated;
grant execute on function public.yt1988_set_source_state(
  text,text,text,text,text,text,text,bigint
) to service_role;

revoke execute on function public.yt1988_replace_source_state(
  text,jsonb,bigint
) from public, anon, authenticated;
grant execute on function public.yt1988_replace_source_state(
  text,jsonb,bigint
) to service_role;
