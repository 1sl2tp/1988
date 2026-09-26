-- v335: source metadata refreshes must not recursively trigger LIVE refreshes.
-- Source selection changes already trigger package refresh explicitly through
-- yt1988-state; LIVE keyword changes use their own dedicated trigger.
drop trigger if exists yt1988_source_change_refresh_live on public.yt1988_source_state;
