alter table public.questions
  add column if not exists ai_variant_enabled boolean not null default false;

create table if not exists public.exam_session_question_variants (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.exam_sessions(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (
    type in (
      'multiple_choice',
      'multiple_response',
      'essay',
      'fill_blank',
      'matching'
    )
  ),
  content text not null,
  content_html text,
  image_url text,
  options jsonb,
  correct_answer text,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, question_id)
);

create index if not exists idx_exam_session_question_variants_session
  on public.exam_session_question_variants(session_id);

create index if not exists idx_exam_session_question_variants_question
  on public.exam_session_question_variants(question_id);

alter table public.exam_session_question_variants enable row level security;

create policy "Students can view own question variants"
  on public.exam_session_question_variants for select using (
    user_id = auth.uid()
  );

create policy "Students can create own question variants"
  on public.exam_session_question_variants for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.exam_sessions
      where exam_sessions.id = exam_session_question_variants.session_id
      and exam_sessions.user_id = auth.uid()
    )
  );

create policy "Students can update own in-progress question variants"
  on public.exam_session_question_variants for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.exam_sessions
      where exam_sessions.id = exam_session_question_variants.session_id
      and exam_sessions.user_id = auth.uid()
      and exam_sessions.status = 'in_progress'
    )
  );

create policy "Teachers can view question variants for managed exams"
  on public.exam_session_question_variants for select using (
    exists (
      select 1
      from public.exam_sessions es
      where es.id = exam_session_question_variants.session_id
      and (
        public.auth_is_exam_owner_or_admin(es.exam_id)
        or public.auth_has_teaching_scope_for_exam(es.exam_id)
      )
    )
  );
