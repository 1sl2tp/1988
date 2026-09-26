-- v311: server-owned blocked keywords for the LIVE system feed.
create table if not exists public.yt1988_live_keywords (
  profile_key text not null,
  keyword_norm text not null,
  keyword_display text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_key,keyword_norm),
  check (char_length(keyword_norm) between 1 and 80),
  check (char_length(keyword_display) between 1 and 120)
);

create index if not exists yt1988_live_keywords_profile_updated_idx
  on public.yt1988_live_keywords(profile_key,updated_at desc);

alter table public.yt1988_live_keywords enable row level security;
revoke all on table public.yt1988_live_keywords from public,anon,authenticated;
grant select,insert,update,delete on table public.yt1988_live_keywords to service_role;
