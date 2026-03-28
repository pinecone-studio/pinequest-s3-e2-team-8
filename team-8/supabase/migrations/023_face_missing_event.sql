-- =============================================
-- 23. Add face_missing to proctor event types
-- =============================================

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.proctor_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%event_type%'
  loop
    execute 'alter table public.proctor_events drop constraint if exists '
      || quote_ident(r.conname);
  end loop;
end
$$;

alter table public.proctor_events
  add constraint proctor_events_event_type_check check (
    event_type in (
      'tab_hidden',
      'window_blur',
      'copy_attempt',
      'paste_attempt',
      'context_menu',
      'camera_denied',
      'look_left',
      'look_right',
      'face_missing'
    )
  );
