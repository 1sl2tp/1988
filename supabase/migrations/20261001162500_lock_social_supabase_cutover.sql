-- Final cutover guard: keep every durable YouTube/TikTok callback on the new Supabase project.
-- Historical migrations may still mention the retired project ref. This migration
-- rewrites any surviving public function definition and pg_cron command, then
-- fails loudly if the old ref is still present.

do $$
declare
  r record;
  rewritten text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and pg_get_functiondef(p.oid) like '%gcnoahqsrquxkwkjbuxy%'
  loop
    rewritten := replace(
      r.def,
      'gcnoahqsrquxkwkjbuxy.supabase.co',
      'mstltsunsawqomzniqok.supabase.co'
    );
    execute rewritten;
  end loop;
end
$$;

do $$
declare
  r record;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for r in
      select jobid, command
      from cron.job
      where command like '%gcnoahqsrquxkwkjbuxy%'
    loop
      perform cron.alter_job(
        job_id := r.jobid,
        command := replace(
          r.command,
          'gcnoahqsrquxkwkjbuxy.supabase.co',
          'mstltsunsawqomzniqok.supabase.co'
        )
      );
    end loop;
  end if;
end
$$;

do $$
begin
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and pg_get_functiondef(p.oid) like '%gcnoahqsrquxkwkjbuxy%'
  ) then
    raise exception 'retired Supabase project ref remains in public function definitions';
  end if;

  if exists(select 1 from pg_extension where extname='pg_cron')
     and exists(
       select 1 from cron.job
       where command like '%gcnoahqsrquxkwkjbuxy%'
     ) then
    raise exception 'retired Supabase project ref remains in cron jobs';
  end if;
end
$$;
