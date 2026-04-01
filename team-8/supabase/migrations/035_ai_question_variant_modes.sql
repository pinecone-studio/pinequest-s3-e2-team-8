alter table public.questions
  add column if not exists ai_variant_mode text not null default 'per_student';

alter table public.questions
  drop constraint if exists questions_ai_variant_mode_check;

alter table public.questions
  add constraint questions_ai_variant_mode_check
  check (ai_variant_mode in ('per_student', 'two_fixed'));

create table if not exists public.question_ai_variant_presets (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid references public.questions(id) on delete cascade not null,
  slot smallint not null check (slot in (1, 2)),
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
  unique(question_id, slot)
);

create index if not exists idx_question_ai_variant_presets_question
  on public.question_ai_variant_presets(question_id);

alter table public.question_ai_variant_presets enable row level security;

create policy "Teachers can view preset variants for managed questions"
  on public.question_ai_variant_presets for select using (
    exists (
      select 1
      from public.questions q
      where q.id = question_ai_variant_presets.question_id
      and (
        public.auth_is_exam_owner_or_admin(q.exam_id)
        or public.auth_has_teaching_scope_for_exam(q.exam_id)
      )
    )
  );

create policy "Teachers can manage preset variants for owned questions"
  on public.question_ai_variant_presets for all using (
    exists (
      select 1
      from public.questions q
      where q.id = question_ai_variant_presets.question_id
      and public.auth_is_exam_owner_or_admin(q.exam_id)
    )
  )
  with check (
    exists (
      select 1
      from public.questions q
      where q.id = question_ai_variant_presets.question_id
      and public.auth_is_exam_owner_or_admin(q.exam_id)
    )
  );
