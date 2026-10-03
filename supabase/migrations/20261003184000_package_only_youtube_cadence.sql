-- 20261003: package-only YouTube cadence.
-- UI always reads committed packages. LIVE is rebuilt on first-open/client wake
-- and on Cloudflare discovery signals; other scopes refresh on demand when opened.

update public.yt1988_refresh_config
set enabled=true,
    interval_minutes=1,
    last_enqueued_at=null,
    updated_at=now()
where profile_key='owner' and scope='live';

update public.yt1988_refresh_config
set enabled=true,
    interval_minutes=5,
    updated_at=now()
where profile_key='owner' and scope='latest';

update public.yt1988_refresh_config
set enabled=true,
    interval_minutes=30,
    updated_at=now()
where profile_key='owner' and scope='week';

update public.yt1988_refresh_config
set enabled=true,
    interval_minutes=15,
    updated_at=now()
where profile_key='owner'
  and scope like 'hash\_%' escape '\';
