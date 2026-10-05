revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

revoke execute on function public.yt1988_ai_runtime_config_gemini() from public, anon, authenticated;
grant execute on function public.yt1988_ai_runtime_config_gemini() to service_role;

revoke execute on function public.yt1988_enqueue_refresh() from public, anon, authenticated;
grant execute on function public.yt1988_enqueue_refresh() to service_role;

revoke execute on function public.yt1988_finish_refresh(text, boolean, text) from public, anon, authenticated;
grant execute on function public.yt1988_finish_refresh(text, boolean, text) to service_role;

revoke execute on function public.yt1988_finish_refresh_v2(text, boolean, text) from public, anon, authenticated;
grant execute on function public.yt1988_finish_refresh_v2(text, boolean, text) to service_role;

revoke execute on function public.yt1988_queue_refresh(text, text[]) from public, anon, authenticated;
grant execute on function public.yt1988_queue_refresh(text, text[]) to service_role;

revoke execute on function public.yt1988_set_package(text, text, text, text, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.yt1988_set_package(text, text, text, text, text, jsonb, bigint) to service_role;

revoke execute on function public.yt1988_sync_live_keywords_from_state() from public, anon, authenticated;
grant execute on function public.yt1988_sync_live_keywords_from_state() to service_role;

revoke execute on function public.yt1988_try_refresh_lock(text, integer) from public, anon, authenticated;
grant execute on function public.yt1988_try_refresh_lock(text, integer) to service_role;
