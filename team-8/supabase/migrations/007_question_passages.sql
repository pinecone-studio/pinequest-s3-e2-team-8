-- =============================================
-- 12. QUESTION PASSAGES (reading comprehension / shared context)
-- =============================================
create table if not exists public.question_passages (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references public.exams(id) on delete cascade not null,
  title text,
  content text not null,
  content_html text,
  image_url text,
  order_index integer not null default 0,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_question_passages_exam
  on public.question_passages(exam_id, order_index);

alter table public.questions
  add column if not exists passage_id uuid references public.question_passages(id) on delete set null;

create index if not exists idx_questions_passage
  on public.questions(passage_id);

alter table public.question_passages enable row level security;

create policy "Users can view accessible passages"
  on public.question_passages for select
  using (
    exists (
      select 1
      from public.exams
      where exams.id = question_passages.exam_id
      and (
        exams.created_by = auth.uid()
        or exists (
          select 1
          from public.profiles
          where id = auth.uid() and role = 'admin'
        )
        or (
          exams.is_published = true
          and exists (
            select 1
            from public.exam_recipients er
            where er.exam_id = exams.id
            and er.student_id = auth.uid()
          )
        )
      )
    )
  );

create policy "Teachers can manage passages"
  on public.question_passages for all
  using (
    exists (
      select 1
      from public.exams
      where exams.id = question_passages.exam_id
      and (
        exams.created_by = auth.uid()
        or exists (
          select 1
          from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      )
    )
  )
  with check (
    exists (
      select 1
      from public.exams
      where exams.id = question_passages.exam_id
      and (
        exams.created_by = auth.uid()
        or exists (
          select 1
          from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      )
    )
  );
