-- v311: avoid PL/pgSQL variable/column ambiguity in LIVE keyword sync.
create or replace function public.yt1988_sync_live_keywords_from_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  raw_keywords text;
  v_keyword_display text;
  v_keyword_norm text;
begin
  delete from public.yt1988_live_keywords
  where profile_key=new.profile_key;

  raw_keywords := coalesce(new.state->'sourceLabels'->>'__live_keywords','');
  if btrim(raw_keywords)='' then
    return new;
  end if;

  for v_keyword_display in
    select btrim(regexp_replace(value,'\s+',' ','g'))
    from unnest(string_to_array(raw_keywords,E'\n')) value
  loop
    if coalesce(v_keyword_display,'')='' then
      continue;
    end if;

    v_keyword_norm := lower(v_keyword_display);
    insert into public.yt1988_live_keywords(
      profile_key,keyword_norm,keyword_display,updated_at
    )
    values(
      new.profile_key,
      left(v_keyword_norm,80),
      left(v_keyword_display,120),
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
