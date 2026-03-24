-- =============================================
-- 11. PROCTOR EVENTS (lightweight integrity log)
-- =============================================
create table public.proctor_events (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.exam_sessions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null check (
    event_type in (
      'tab_hidden',
      'window_blur',
      'copy_attempt',
      'paste_attempt',
      'context_menu'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_proctor_events_session
  on public.proctor_events(session_id, created_at desc);

create index idx_proctor_events_user
  on public.proctor_events(user_id);

alter table public.proctor_events enable row level security;

create policy "Students can view own proctor events"
  on public.proctor_events for select using (user_id = auth.uid());

create policy "Teachers can view proctor events for their exams"
  on public.proctor_events for select using (
    exists (
      select 1 from public.exam_sessions es
      join public.exams e on e.id = es.exam_id
      where es.id = proctor_events.session_id
      and (
        e.created_by = auth.uid()
        or exists (
          select 1 from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      )
    )
  );

create policy "Students can insert own in-progress proctor events"
  on public.proctor_events for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.exam_sessions
      where exam_sessions.id = proctor_events.session_id
      and exam_sessions.user_id = auth.uid()
      and exam_sessions.status = 'in_progress'
    )
  );
