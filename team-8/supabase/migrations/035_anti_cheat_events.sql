-- Add multi_monitor and keyboard_shortcut to proctor_events event_type CHECK constraint

-- Drop all existing event_type check constraints
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.proctor_events'::regclass
      and contype = 'c'
      and conname like '%event_type%'
  loop
    execute 'alter table public.proctor_events drop constraint ' || quote_ident(r.conname);
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
      'identity_verified',
      'multi_monitor',
      'keyboard_shortcut'
    )
  );
