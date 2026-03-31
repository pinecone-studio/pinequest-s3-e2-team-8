-- =============================================
-- 30. Mobile-first student exam flow
-- =============================================

alter table public.exams
  add column if not exists device_policy text not null default 'any'
    check (device_policy in ('any', 'mobile_preferred', 'desktop_only'));

update public.exams
set device_policy = case
  when proctoring_mode = 'strict' then 'desktop_only'
  when proctoring_mode = 'standard' then 'mobile_preferred'
  else 'any'
end
where device_policy not in ('any', 'mobile_preferred', 'desktop_only')
   or device_policy is null
   or (proctoring_mode = 'strict' and device_policy <> 'desktop_only');

alter table public.exam_sessions
  add column if not exists device_type text not null default 'desktop'
    check (device_type in ('desktop', 'mobile')),
  add column if not exists display_mode text not null default 'browser'
    check (display_mode in ('browser', 'standalone', 'fullscreen', 'unknown')),
  add column if not exists platform text,
  add column if not exists spot_check_count integer not null default 0,
  add column if not exists last_spot_check_at timestamptz;

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
      'face_missing',
      'fullscreen_exit',
      'camera_disconnected',
      'multi_face',
      'heartbeat_lost',
      'app_hidden',
      'page_frozen',
      'offline_started',
      'offline_restored',
      'spot_check_required',
      'spot_check_passed',
      'spot_check_failed',
      'orientation_changed',
      'identity_failed',
      'challenge_required',
      'challenge_passed',
      'challenge_failed',
      'identity_verified'
    )
  );
