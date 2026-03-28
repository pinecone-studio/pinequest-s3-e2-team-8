alter table public.question_bank
  add column if not exists grade_level integer
  check (grade_level between 1 and 12);

alter table public.question_bank
  add column if not exists subtopic text;

alter table public.question_bank
  add column if not exists difficulty_level smallint not null default 2
  check (difficulty_level in (1, 2, 3));

update public.question_bank
set difficulty_level = case
  when difficulty = 'easy' then 1
  when difficulty = 'hard' then 3
  else 2
end
where difficulty_level is null
   or difficulty_level not in (1, 2, 3);

create index if not exists idx_question_bank_grade_level
  on public.question_bank(grade_level);

create index if not exists idx_question_bank_subtopic
  on public.question_bank(subtopic);

create index if not exists idx_question_bank_subject_grade_subtopic
  on public.question_bank(subject_id, grade_level, subtopic);

create table if not exists public.sample_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  grade_level integer not null check (grade_level between 1 and 12),
  subtopic text,
  difficulty_level smallint not null default 2 check (difficulty_level in (1, 2, 3)),
  duration_minutes integer not null default 40 check (duration_minutes > 0),
  question_count integer not null default 0 check (question_count >= 0),
  total_points numeric(8,2) not null default 0 check (total_points >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sample_exam_items (
  id uuid primary key default gen_random_uuid(),
  sample_exam_id uuid not null references public.sample_exams(id) on delete cascade,
  question_bank_id uuid not null references public.question_bank(id) on delete cascade,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  unique (sample_exam_id, question_bank_id),
  unique (sample_exam_id, order_index)
);

create index if not exists idx_sample_exams_subject_grade_subtopic
  on public.sample_exams(subject_id, grade_level, subtopic);

create index if not exists idx_sample_exam_items_exam
  on public.sample_exam_items(sample_exam_id, order_index);

alter table public.sample_exams enable row level security;
alter table public.sample_exam_items enable row level security;

drop trigger if exists update_sample_exams_updated_at on public.sample_exams;
create trigger update_sample_exams_updated_at
  before update on public.sample_exams
  for each row execute function public.update_updated_at();

drop policy if exists "Teachers can view sample exams" on public.sample_exams;
create policy "Teachers can view sample exams"
  on public.sample_exams for select using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
    or exists (
      select 1
      from public.teacher_subjects ts
      where ts.teacher_id = auth.uid()
      and ts.subject_id = sample_exams.subject_id
    )
  );

drop policy if exists "Admins can manage sample exams" on public.sample_exams;
create policy "Admins can manage sample exams"
  on public.sample_exams for all using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );

drop policy if exists "Teachers can view sample exam items" on public.sample_exam_items;
create policy "Teachers can view sample exam items"
  on public.sample_exam_items for select using (
    exists (
      select 1
      from public.sample_exams se
      where se.id = sample_exam_items.sample_exam_id
      and (
        exists (
          select 1
          from public.profiles
          where id = auth.uid()
          and role = 'admin'
        )
        or exists (
          select 1
          from public.teacher_subjects ts
          where ts.teacher_id = auth.uid()
          and ts.subject_id = se.subject_id
        )
      )
    )
  );

drop policy if exists "Admins can manage sample exam items" on public.sample_exam_items;
create policy "Admins can manage sample exam items"
  on public.sample_exam_items for all using (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
  );
