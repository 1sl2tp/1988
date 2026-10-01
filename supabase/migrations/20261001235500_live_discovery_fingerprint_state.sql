-- Persist the slow global LIVE discovery cadence separately from fast
-- selected-channel fingerprints. This tiny row prevents keyword/trending fanout
-- from running on every LIVE refresh.
create table if not exists public.yt1988_discovery_state (
  profile_key text not null,
  discovery_key text not null,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_key,discovery_key)
);

alter table public.yt1988_discovery_state enable row level security;
revoke all on table public.yt1988_discovery_state from public,anon,authenticated;
grant all on table public.yt1988_discovery_state to service_role;

insert into public.yt1988_discovery_state(profile_key,discovery_key,checked_at)
values('owner','live_global',null)
on conflict (profile_key,discovery_key) do nothing;
