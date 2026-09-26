-- v311: bridge the existing server state API to the LIVE keyword table.
-- The frontend stores one keyword per line in sourceLabels.__live_keywords.

create or replace function public.yt1988_sync_live_keywords_from_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  raw_keywords text;
  keyword_display text;
  keyword_norm text;
begin
  delete from public.yt1988_live_keywords
  where profile_key=new.profile_key;

  raw_keywords := coalesce(new.state->'sourceLabels'->>'__live_keywords','');
  if btrim(raw_keywords)='' then
    return new;
  end if;

  for keyword_display in
    select btrim(regexp_replace(value,'\s+',' ','g'))
    from unnest(string_to_array(raw_keywords,E'\n')) value
  loop
    if coalesce(keyword_display,'')='' then
      continue;
    end if;

    keyword_norm := lower(keyword_display);
    insert into public.yt1988_live_keywords(
      profile_key,keyword_norm,keyword_display,updated_at
    )
    values(
      new.profile_key,
      left(keyword_norm,80),
      left(keyword_display,120),
      now()
    )
    on conflict (profile_key,keyword_norm) do update
    set keyword_display=excluded.keyword_display,
        updated_at=excluded.updated_at;
  end loop;

  return new;
end;
$$;

revoke all on function public.yt1988_sync_live_keywords_from_state() from public,anon,authenticated;
grant execute on function public.yt1988_sync_live_keywords_from_state() to service_role;

drop trigger if exists yt1988_sync_live_keywords_from_state_trg
  on public.yt1988_user_state;

create trigger yt1988_sync_live_keywords_from_state_trg
after insert or update of state on public.yt1988_user_state
for each row
execute function public.yt1988_sync_live_keywords_from_state();

-- Backfill from the current owner state if the hidden setting already exists.
update public.yt1988_user_state
set state=state
where profile_key='owner';
