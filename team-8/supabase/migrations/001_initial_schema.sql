-- =============================================
-- PineExam LMS - Initial Database Schema
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- 1. PROFILES (extends Supabase Auth users)
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================
-- 2. SUBJECTS (хичээлүүд)
-- =============================================
create table public.subjects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =============================================
-- 3. EXAMS (шалгалтууд)
-- =============================================
create table public.exams (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  subject_id uuid references public.subjects(id) on delete set null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_minutes integer not null default 60,
  is_published boolean not null default false,
  max_attempts integer not null default 1,
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  passing_score numeric(5,2) default 60.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 4. QUESTIONS (асуултууд)
-- =============================================
create table public.questions (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references public.exams(id) on delete cascade not null,
  type text not null default 'multiple_choice' check (type in ('multiple_choice', 'true_false', 'essay', 'fill_blank')),
  content text not null,
  content_html text,
  image_url text,
  options jsonb,
  correct_answer text,
  points numeric(5,2) not null default 1.00,
  order_index integer not null default 0,
  explanation text,
  created_at timestamptz not null default now()
);

-- =============================================
-- 5. QUESTION BANK (асуултын сан - дахин ашиглах)
-- =============================================
create table public.question_bank (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid references public.subjects(id) on delete set null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  type text not null default 'multiple_choice' check (type in ('multiple_choice', 'true_false', 'essay', 'fill_blank')),
  content text not null,
  content_html text,
  image_url text,
  options jsonb,
  correct_answer text,
  points numeric(5,2) not null default 1.00,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  tags text[] default '{}',
  explanation text,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 6. EXAM SESSIONS (шалгалтын оролдлого)
-- =============================================
create table public.exam_sessions (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references public.exams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded', 'timed_out')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  total_score numeric(7,2),
  max_score numeric(7,2),
  attempt_number integer not null default 1,

  unique(exam_id, user_id, attempt_number)
);

-- =============================================
-- 7. ANSWERS (хариултууд)
-- =============================================
create table public.answers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.exam_sessions(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  answer text,
  is_correct boolean,
  score numeric(5,2),
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  feedback text,
  submitted_at timestamptz not null default now(),

  unique(session_id, question_id)
);

-- =============================================
-- 8. EXAM SCHEDULES (шалгалтын хуваарь зөрчилгүй)
-- =============================================
create table public.exam_schedules (
  id uuid primary key default uuid_generate_v4(),
  exam_id uuid references public.exams(id) on delete cascade not null unique,
  room text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now(),

  -- Overlap шалгах constraint
  constraint no_time_overlap exclude using gist (
    tstzrange(start_time, end_time) with &&,
    room with =
  ) where (room is not null)
);

-- =============================================
-- INDEXES (performance-д чухал)
-- =============================================
create index idx_exams_created_by on public.exams(created_by);
create index idx_exams_subject_id on public.exams(subject_id);
create index idx_exams_start_time on public.exams(start_time);
create index idx_exams_is_published on public.exams(is_published);

create index idx_questions_exam_id on public.questions(exam_id);
create index idx_questions_order on public.questions(exam_id, order_index);

create index idx_question_bank_subject on public.question_bank(subject_id);
create index idx_question_bank_tags on public.question_bank using gin(tags);
create index idx_question_bank_difficulty on public.question_bank(difficulty);
create index idx_question_bank_type on public.question_bank(type);

create index idx_exam_sessions_exam on public.exam_sessions(exam_id);
create index idx_exam_sessions_user on public.exam_sessions(user_id);
create index idx_exam_sessions_status on public.exam_sessions(status);

create index idx_answers_session on public.answers(session_id);
create index idx_answers_question on public.answers(question_id);
create index idx_answers_user on public.answers(user_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.question_bank enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.answers enable row level security;
alter table public.exam_schedules enable row level security;

-- PROFILES policies
create policy "Users can view all profiles"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- SUBJECTS policies
create policy "Anyone can view subjects"
  on public.subjects for select using (true);

create policy "Teachers and admins can manage subjects"
  on public.subjects for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'))
  );

-- EXAMS policies
create policy "Anyone can view published exams"
  on public.exams for select using (
    is_published = true
    or created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Teachers can create exams"
  on public.exams for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'))
  );

create policy "Teachers can update own exams"
  on public.exams for update using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Teachers can delete own exams"
  on public.exams for delete using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- QUESTIONS policies
create policy "Anyone can view questions of published exams"
  on public.questions for select using (
    exists (
      select 1 from public.exams
      where exams.id = questions.exam_id
      and (exams.is_published = true or exams.created_by = auth.uid())
    )
  );

create policy "Teachers can manage questions"
  on public.questions for all using (
    exists (
      select 1 from public.exams
      where exams.id = questions.exam_id
      and (exams.created_by = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

-- QUESTION BANK policies
create policy "Teachers can view question bank"
  on public.question_bank for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'))
  );

create policy "Teachers can manage own bank questions"
  on public.question_bank for all using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- EXAM SESSIONS policies
create policy "Students can view own sessions"
  on public.exam_sessions for select using (user_id = auth.uid());

create policy "Teachers can view all sessions for their exams"
  on public.exam_sessions for select using (
    exists (
      select 1 from public.exams
      where exams.id = exam_sessions.exam_id
      and (exams.created_by = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

create policy "Students can create own sessions"
  on public.exam_sessions for insert with check (user_id = auth.uid());

create policy "Students can update own in-progress sessions"
  on public.exam_sessions for update using (
    user_id = auth.uid() and status = 'in_progress'
  );

-- Allow teachers to update sessions (for grading)
create policy "Teachers can update sessions for grading"
  on public.exam_sessions for update using (
    exists (
      select 1 from public.exams
      where exams.id = exam_sessions.exam_id
      and (exams.created_by = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

-- ANSWERS policies
create policy "Students can view own answers"
  on public.answers for select using (user_id = auth.uid());

create policy "Teachers can view answers for their exams"
  on public.answers for select using (
    exists (
      select 1 from public.exam_sessions es
      join public.exams e on e.id = es.exam_id
      where es.id = answers.session_id
      and (e.created_by = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

create policy "Students can insert own answers"
  on public.answers for insert with check (user_id = auth.uid());

create policy "Students can update own answers during exam"
  on public.answers for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.exam_sessions
      where exam_sessions.id = answers.session_id
      and exam_sessions.status = 'in_progress'
    )
  );

-- Teachers can update answers (for grading essays)
create policy "Teachers can grade answers"
  on public.answers for update using (
    exists (
      select 1 from public.exam_sessions es
      join public.exams e on e.id = es.exam_id
      where es.id = answers.session_id
      and (e.created_by = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
    )
  );

-- EXAM SCHEDULES policies
create policy "Anyone can view schedules"
  on public.exam_schedules for select using (true);

create policy "Teachers can manage schedules"
  on public.exam_schedules for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'))
  );

-- =============================================
-- UPDATED_AT trigger function
-- =============================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger update_exams_updated_at
  before update on public.exams
  for each row execute function public.update_updated_at();

create trigger update_question_bank_updated_at
  before update on public.question_bank
  for each row execute function public.update_updated_at();
