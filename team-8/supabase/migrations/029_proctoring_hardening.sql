-- =============================================
-- 29. Proctoring hardening + integrity analytics
-- =============================================

alter table public.exams
  add column if not exists proctoring_mode text not null default 'off'
    check (proctoring_mode in ('off', 'standard', 'strict')),
  add column if not exists require_fullscreen boolean not null default false,
  add column if not exists require_camera boolean not null default false,
  add column if not exists identity_verification boolean not null default false,
  add column if not exists evidence_mode text not null default 'metadata_only'
    check (evidence_mode in ('metadata_only', 'metadata_snapshots')),
  add column if not exists post_exam_similarity_enabled boolean not null default false;

update public.exams
set
  require_fullscreen = require_fullscreen or proctoring_mode <> 'off',
  require_camera = require_camera or identity_verification
where proctoring_mode <> 'off';

create table if not exists public.exam_identity_enrollments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  reference_image_data text not null,
  reference_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exam_identity_enrollments enable row level security;

drop policy if exists "Students can view own identity enrollment"
  on public.exam_identity_enrollments;
create policy "Students can view own identity enrollment"
  on public.exam_identity_enrollments for select
  using (student_id = auth.uid());

drop policy if exists "Students can insert own identity enrollment"
  on public.exam_identity_enrollments;
create policy "Students can insert own identity enrollment"
  on public.exam_identity_enrollments for insert
  with check (student_id = auth.uid());

drop policy if exists "Students can update own identity enrollment"
  on public.exam_identity_enrollments;
create policy "Students can update own identity enrollment"
  on public.exam_identity_enrollments for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop trigger if exists update_exam_identity_enrollments_updated_at
  on public.exam_identity_enrollments;
create trigger update_exam_identity_enrollments_updated_at
  before update on public.exam_identity_enrollments
  for each row execute function public.update_updated_at();

alter table public.exam_sessions
  add column if not exists risk_score integer not null default 0,
  add column if not exists risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  add column if not exists flag_status text not null default 'clear'
    check (flag_status in ('clear', 'flagged', 'reviewed', 'escalated')),
  add column if not exists flag_summary text,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists challenge_count integer not null default 0,
  add column if not exists last_snapshot_at timestamptz,
  add column if not exists review_note text;

create index if not exists idx_exam_sessions_exam_flag_status
  on public.exam_sessions(exam_id, flag_status);

create index if not exists idx_exam_sessions_exam_risk_level
  on public.exam_sessions(exam_id, risk_level);

alter table public.answers
  add column if not exists first_answered_at timestamptz,
  add column if not exists last_changed_at timestamptz,
  add column if not exists change_count integer not null default 0;

alter table public.proctor_events
  add column if not exists severity text not null default 'low'
    check (severity in ('low', 'medium', 'high', 'critical')),
  add column if not exists source text not null default 'client',
  add column if not exists snapshot_url text,
  add column if not exists derived_risk_delta integer not null default 0;

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
      'challenge_required',
      'challenge_passed',
      'challenge_failed',
      'identity_verified'
    )
  );
