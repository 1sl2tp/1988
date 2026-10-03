-- Normalize TikTok relationships around a stable internal channel UUID.
-- Handle remains a unique routing alias; user_id/sec_uid remain external IDs.

alter table public.yt1988_tiktok_channels
  add column if not exists id uuid default gen_random_uuid();

update public.yt1988_tiktok_channels set id=gen_random_uuid() where id is null;

alter table public.yt1988_tiktok_channels
  alter column id set default gen_random_uuid(),
  alter column id set not null;

alter table public.yt1988_tiktok_channels drop constraint if exists yt1988_tiktok_channels_pkey;
alter table public.yt1988_tiktok_channels drop constraint if exists yt1988_tiktok_channels_handle_key;
alter table public.yt1988_tiktok_channels add constraint yt1988_tiktok_channels_pkey primary key (id);
alter table public.yt1988_tiktok_channels add constraint yt1988_tiktok_channels_handle_key unique (handle);

create unique index if not exists yt1988_tiktok_channels_handle_lower_uidx
  on public.yt1988_tiktok_channels (lower(handle));
create unique index if not exists yt1988_tiktok_channels_user_id_uidx
  on public.yt1988_tiktok_channels (user_id) where user_id <> '';
create unique index if not exists yt1988_tiktok_channels_sec_uid_uidx
  on public.yt1988_tiktok_channels (sec_uid) where sec_uid <> '';

alter table public.yt1988_tiktok_live_channels add column if not exists channel_id uuid;
alter table public.yt1988_tiktok_video_channels add column if not exists channel_id uuid;
alter table public.yt1988_tiktok_videos add column if not exists channel_id uuid;

update public.yt1988_tiktok_live_channels l
set channel_id=c.id
from public.yt1988_tiktok_channels c
where lower(c.handle)=lower(l.handle) and l.channel_id is distinct from c.id;

update public.yt1988_tiktok_video_channels v
set channel_id=c.id
from public.yt1988_tiktok_channels c
where lower(c.handle)=lower(v.handle) and v.channel_id is distinct from c.id;

update public.yt1988_tiktok_videos v
set channel_id=c.id
from public.yt1988_tiktok_channels c
where lower(c.handle)=lower(v.handle) and v.channel_id is distinct from c.id;

delete from public.yt1988_tiktok_live_channels l
where l.channel_id is null
  and l.selected=false
  and l.live=false
  and l.playable=false;

do $$
begin
  if exists(select 1 from public.yt1988_tiktok_live_channels where channel_id is null) then
    raise exception 'unresolved_tiktok_live_channel_id';
  end if;
  if exists(select 1 from public.yt1988_tiktok_video_channels where channel_id is null) then
    raise exception 'unresolved_tiktok_video_channel_id';
  end if;
  if exists(select 1 from public.yt1988_tiktok_videos where channel_id is null) then
    raise exception 'unresolved_tiktok_video_id';
  end if;
end;
$$;

alter table public.yt1988_tiktok_live_channels alter column channel_id set not null;
alter table public.yt1988_tiktok_video_channels alter column channel_id set not null;
alter table public.yt1988_tiktok_videos alter column channel_id set not null;

alter table public.yt1988_tiktok_live_channels drop constraint if exists yt1988_tiktok_live_channels_pkey;
alter table public.yt1988_tiktok_live_channels drop constraint if exists yt1988_tiktok_live_channels_handle_key;
alter table public.yt1988_tiktok_live_channels add constraint yt1988_tiktok_live_channels_pkey primary key (channel_id);
alter table public.yt1988_tiktok_live_channels add constraint yt1988_tiktok_live_channels_handle_key unique (handle);

alter table public.yt1988_tiktok_video_channels drop constraint if exists yt1988_tiktok_video_channels_pkey;
alter table public.yt1988_tiktok_video_channels drop constraint if exists yt1988_tiktok_video_channels_handle_key;
alter table public.yt1988_tiktok_video_channels add constraint yt1988_tiktok_video_channels_pkey primary key (channel_id);
alter table public.yt1988_tiktok_video_channels add constraint yt1988_tiktok_video_channels_handle_key unique (handle);

alter table public.yt1988_tiktok_live_channels drop constraint if exists yt1988_tiktok_live_channels_channel_fk;
alter table public.yt1988_tiktok_live_channels add constraint yt1988_tiktok_live_channels_channel_fk
  foreign key (channel_id) references public.yt1988_tiktok_channels(id)
  on update cascade on delete cascade;

alter table public.yt1988_tiktok_video_channels drop constraint if exists yt1988_tiktok_video_channels_channel_fk;
alter table public.yt1988_tiktok_video_channels add constraint yt1988_tiktok_video_channels_channel_fk
  foreign key (channel_id) references public.yt1988_tiktok_channels(id)
  on update cascade on delete cascade;

alter table public.yt1988_tiktok_videos drop constraint if exists yt1988_tiktok_videos_channel_fk;
alter table public.yt1988_tiktok_videos add constraint yt1988_tiktok_videos_channel_fk
  foreign key (channel_id) references public.yt1988_tiktok_channels(id)
  on update cascade on delete restrict;

create index if not exists yt1988_tiktok_videos_channel_create_idx
  on public.yt1988_tiktok_videos(channel_id,create_time desc,video_id desc);

create or replace function public.yt1988_tiktok_bind_channel_id()
returns trigger
language plpgsql
set search_path=public
as $$
declare canonical_id uuid;
begin
  select id into canonical_id
  from public.yt1988_tiktok_channels
  where lower(handle)=lower(new.handle)
  limit 1;
  if canonical_id is null then raise exception 'unknown_tiktok_handle:%', new.handle; end if;
  new.channel_id := canonical_id;
  return new;
end;
$$;

drop trigger if exists yt1988_tiktok_live_bind_channel on public.yt1988_tiktok_live_channels;
create trigger yt1988_tiktok_live_bind_channel
before insert or update of handle on public.yt1988_tiktok_live_channels
for each row execute function public.yt1988_tiktok_bind_channel_id();

drop trigger if exists yt1988_tiktok_video_channel_bind_channel on public.yt1988_tiktok_video_channels;
create trigger yt1988_tiktok_video_channel_bind_channel
before insert or update of handle on public.yt1988_tiktok_video_channels
for each row execute function public.yt1988_tiktok_bind_channel_id();

drop trigger if exists yt1988_tiktok_video_bind_channel on public.yt1988_tiktok_videos;
create trigger yt1988_tiktok_video_bind_channel
before insert or update of handle on public.yt1988_tiktok_videos
for each row execute function public.yt1988_tiktok_bind_channel_id();

alter table public.yt1988_tiktok_live_channels drop column if exists selected;
alter table public.yt1988_tiktok_video_channels
  drop column if exists sec_uid,
  drop column if exists videos;

alter table public.yt1988_tiktok_channels
  drop column if exists live,
  drop column if exists live_title,
  drop column if exists live_cover_source_url,
  drop column if exists live_cover_stored_url,
  drop column if exists live_stream_type,
  drop column if exists live_stream_url,
  drop column if exists live_source_sig,
  drop column if exists live_checked_at,
  drop column if exists live_updated_at;

drop table if exists public.yt1988_tiktok_live_selected;

update public.yt1988_tiktok_videos
set mp4_url='',
    mp4_expires_at=null,
    mp4_source='',
    mp4_updated_at=null,
    updated_at=now()
where mp4_expires_at is not null
  and mp4_expires_at < now()
  and coalesce(mp4_url,'') <> '';
