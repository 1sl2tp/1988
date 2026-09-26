-- v326: allow server-owned packages for dynamic hashtag scopes.

create or replace function public.yt1988_set_package(
  p_profile_key text,
  p_scope text,
  p_hash text,
  p_input_hash text,
  p_source_signature text,
  p_items jsonb,
  p_version bigint
)
returns public.yt1988_packages
language plpgsql
security definer
set search_path=public
as $$
declare
  saved public.yt1988_packages;
  scope_ok boolean := false;
begin
  if p_profile_key is null or length(trim(p_profile_key))=0 then
    raise exception 'bad_profile';
  end if;

  scope_ok :=
    p_scope=any(array['live','latest','week']::text[])
    or exists(
      select 1
      from public.yt1988_hashtags h
      where h.profile_key=trim(p_profile_key)
        and h.hashtag_id=p_scope
        and h.enabled=true
    );

  if not scope_ok then
    raise exception 'bad_scope';
  end if;

  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'bad_items';
  end if;

  insert into public.yt1988_packages(
    profile_key,scope,hash,input_hash,source_signature,items,version,updated_at
  )
  values(
    trim(p_profile_key),p_scope,coalesce(p_hash,''),coalesce(p_input_hash,''),
    coalesce(p_source_signature,''),coalesce(p_items,'[]'::jsonb),
    greatest(1,coalesce(p_version,1)),now()
  )
  on conflict (profile_key,scope) do update
    set hash=excluded.hash,
        input_hash=excluded.input_hash,
        source_signature=excluded.source_signature,
        items=excluded.items,
        version=excluded.version,
        updated_at=now()
    where excluded.version >= public.yt1988_packages.version
  returning * into saved;

  if saved.profile_key is null then
    select * into saved
    from public.yt1988_packages
    where profile_key=trim(p_profile_key) and scope=p_scope;
  end if;

  return saved;
end;
$$;

revoke all on function public.yt1988_set_package(text,text,text,text,text,jsonb,bigint)
from public,anon,authenticated;
grant execute on function public.yt1988_set_package(text,text,text,text,text,jsonb,bigint)
to service_role;
