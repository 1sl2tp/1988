create table if not exists public.yt1988_video_meta (
  video_id text primary key,
  aspect_ratio double precision not null,
  media_kind text generated always as (
    case when aspect_ratio < 1 then 'portrait'::text else 'landscape'::text end
  ) stored,
  width integer,
  height integer,
  source text not null default 'server',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yt1988_video_meta_video_id_check check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint yt1988_video_meta_aspect_check check (aspect_ratio >= 0.25 and aspect_ratio <= 4)
);

create index if not exists yt1988_video_meta_updated_idx
  on public.yt1988_video_meta(updated_at desc);
