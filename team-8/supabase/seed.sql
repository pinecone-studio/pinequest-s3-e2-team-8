-- =============================================
-- PineExam demo seed
-- 1 admin, 10 teachers, 50 students, 10 classes
--
-- Login credentials for all seeded users:
--   password = PineExam123!
--
-- Examples:
--   admin@pineexam.test
--   teacher01@pineexam.test ... teacher10@pineexam.test
--   student01@pineexam.test ... student50@pineexam.test
-- =============================================

create extension if not exists pgcrypto;

do $seed_learning_cleanup$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_practice_answers'
  ) then
    delete from public.student_practice_answers;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_practice_attempts'
  ) then
    delete from public.student_practice_attempts;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_practice_questions'
  ) then
    delete from public.student_practice_questions;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_practice_exams'
  ) then
    delete from public.student_practice_exams;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_subject_study_plans'
  ) then
    delete from public.student_subject_study_plans;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_topic_mastery'
  ) then
    delete from public.student_topic_mastery;
  end if;
end
$seed_learning_cleanup$;

-- -------------------------------------------------
-- FULL CLEANUP — бүх хуучин data устгах
-- -------------------------------------------------
delete from public.proctor_events;
delete from public.answers;
delete from public.exam_sessions;
delete from public.exam_recipients;
delete from public.exam_assignments;
delete from public.exam_schedules;
delete from public.questions;
delete from public.question_passages;
delete from public.question_bank;
delete from public.exams;
delete from public.teaching_assignments;
delete from public.teacher_subjects;
delete from public.student_group_members;
delete from public.student_groups;
delete from public.profiles;

-- auth хэрэглэгчдийг бүгдийг устгах
delete from auth.identities;
delete from auth.users;

-- -------------------------------------------------
-- Seed users
-- -------------------------------------------------
create temporary table tmp_seed_users (
  id uuid primary key,
  email text not null,
  full_name text not null,
  app_role text not null,
  password text not null,
  student_no integer,
  teacher_no integer
);

insert into tmp_seed_users (id, email, full_name, app_role, password, student_no, teacher_no)
values
  ('10000000-0000-0000-0000-000000000001', 'admin@pineexam.test', 'Системийн админ', 'admin', 'PineExam123!', null, null),
  ('20000000-0000-0000-0000-000000000001', 'teacher01@pineexam.test', 'Бат-Эрдэнэ', 'teacher', 'PineExam123!', null, 1),
  ('20000000-0000-0000-0000-000000000002', 'teacher02@pineexam.test', 'Нандинцэцэг', 'teacher', 'PineExam123!', null, 2),
  ('20000000-0000-0000-0000-000000000003', 'teacher03@pineexam.test', 'Сараа', 'teacher', 'PineExam123!', null, 3),
  ('20000000-0000-0000-0000-000000000004', 'teacher04@pineexam.test', 'Төгөлдөр', 'teacher', 'PineExam123!', null, 4),
  ('20000000-0000-0000-0000-000000000005', 'teacher05@pineexam.test', 'Оюунаа', 'teacher', 'PineExam123!', null, 5),
  ('20000000-0000-0000-0000-000000000006', 'teacher06@pineexam.test', 'Энхтүвшин', 'teacher', 'PineExam123!', null, 6),
  ('20000000-0000-0000-0000-000000000007', 'teacher07@pineexam.test', 'Мөнхцэцэг', 'teacher', 'PineExam123!', null, 7),
  ('20000000-0000-0000-0000-000000000008', 'teacher08@pineexam.test', 'Ганзориг', 'teacher', 'PineExam123!', null, 8),
  ('20000000-0000-0000-0000-000000000009', 'teacher09@pineexam.test', 'Дөлгөөн', 'teacher', 'PineExam123!', null, 9),
  ('20000000-0000-0000-0000-000000000010', 'teacher10@pineexam.test', 'Болормаа', 'teacher', 'PineExam123!', null, 10);

insert into tmp_seed_users (id, email, full_name, app_role, password, student_no, teacher_no)
select
  ('30000000-0000-0000-0000-' || lpad(gs::text, 12, '0'))::uuid,
  format('student%02s@pineexam.test', gs),
  format('Сурагч %s', lpad(gs::text, 2, '0')),
  'student',
  'PineExam123!',
  gs,
  null
from generate_series(1, 50) as gs;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  id,
  'authenticated',
  'authenticated',
  email,
  crypt(password, gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  jsonb_build_object('full_name', full_name, 'role', app_role),
  now(),
  now(),
  '',
  '',
  '',
  ''
from tmp_seed_users;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  id,
  created_at,
  updated_at,
  last_sign_in_at
)
select
  id::text,
  id,
  jsonb_build_object(
    'sub', id::text,
    'email', email,
    'email_verified', true
  ),
  'email',
  id,
  now(),
  now(),
  now()
from tmp_seed_users;

insert into public.profiles (id, email, full_name, role, created_at, updated_at)
select id, email, full_name, app_role, now(), now()
from tmp_seed_users
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  updated_at = now();

-- -------------------------------------------------
-- Subjects
-- -------------------------------------------------
insert into public.subjects (name, description, created_by)
select
  'Орос хэл',
  'Орос хэлний үгийн сан, дүрэм, уншлагын шалгалтууд',
  '10000000-0000-0000-0000-000000000001'::uuid
where not exists (
  select 1
  from public.subjects
  where name = 'Орос хэл'
);

update public.subjects
set created_by = '10000000-0000-0000-0000-000000000001'::uuid
where name in (
  'Математик',
  'Монгол хэл',
  'Англи хэл',
  'Орос хэл',
  'Физик',
  'Хими',
  'Биологи',
  'Түүх',
  'Нийгэм судлал',
  'Мэдээлэл зүй',
  'Газарзүй',
  'Иргэний ёс зүй'
)
and created_by is null;

-- -------------------------------------------------
-- Groups
-- -------------------------------------------------
create temporary table tmp_seed_groups (
  id uuid primary key,
  name text not null,
  grade smallint,
  group_type text not null,
  subject_name text,
  sort_order integer not null
);

insert into tmp_seed_groups (id, name, grade, group_type, subject_name, sort_order)
values
  ('40000000-0000-0000-0000-000000000001', '6A', 6, 'class', null, 1),
  ('40000000-0000-0000-0000-000000000002', '6B', 6, 'class', null, 2),
  ('40000000-0000-0000-0000-000000000003', '7A', 7, 'class', null, 3),
  ('40000000-0000-0000-0000-000000000004', '7B', 7, 'class', null, 4),
  ('40000000-0000-0000-0000-000000000005', '8A', 8, 'class', null, 5),
  ('40000000-0000-0000-0000-000000000006', '8B', 8, 'class', null, 6),
  ('40000000-0000-0000-0000-000000000007', '9A', 9, 'class', null, 7),
  ('40000000-0000-0000-0000-000000000008', '9B', 9, 'class', null, 8),
  ('40000000-0000-0000-0000-000000000009', '10A', 10, 'class', null, 9),
  ('40000000-0000-0000-0000-000000000010', '10B', 10, 'class', null, 10),
  ('40000000-0000-0000-0000-000000000101', '10-р ангийн сонгон Математик', 10, 'elective', 'Математик', 101),
  ('40000000-0000-0000-0000-000000000102', '10-р ангийн сонгон Англи хэл', 10, 'elective', 'Англи хэл', 102),
  ('40000000-0000-0000-0000-000000000103', 'Coding Club', 10, 'elective', 'Мэдээлэл зүй', 103);

insert into public.student_groups (id, name, grade, group_type, subject_id, created_by, created_at)
select
  g.id,
  g.name,
  g.grade,
  g.group_type,
  s.id,
  '10000000-0000-0000-0000-000000000001'::uuid,
  now()
from tmp_seed_groups g
left join public.subjects s on s.name = g.subject_name
on conflict (id) do update
set
  name = excluded.name,
  grade = excluded.grade,
  group_type = excluded.group_type,
  subject_id = excluded.subject_id,
  created_by = excluded.created_by;

-- 50 students → 10 classes, 5 students each
insert into public.student_group_members (group_id, student_id, joined_at)
select
  g.id,
  u.id,
  now()
from tmp_seed_users u
join tmp_seed_groups g
  on g.sort_order = ((u.student_no - 1) / 5) + 1
where u.app_role = 'student'
on conflict (group_id, student_id) do nothing;

-- Elective groups
-- Demo focus:
--   teacher01@pineexam.test teaches Math + Information Technology
--   student50@pineexam.test belongs to 10B + elective Math + Coding Club
delete from public.student_group_members
where group_id in (
  '40000000-0000-0000-0000-000000000101'::uuid,
  '40000000-0000-0000-0000-000000000102'::uuid,
  '40000000-0000-0000-0000-000000000103'::uuid
);

insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000101'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (41, 42, 43, 46, 47, 50)
on conflict (group_id, student_id) do nothing;

insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000102'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (44, 45, 48, 49)
on conflict (group_id, student_id) do nothing;

insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000103'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (41, 42, 43, 46, 47, 50)
on conflict (group_id, student_id) do nothing;

-- -------------------------------------------------
-- Teacher subjects and teaching assignments
-- -------------------------------------------------
create temporary table tmp_teacher_subjects (
  teacher_email text not null,
  subject_name text not null
);

insert into tmp_teacher_subjects (teacher_email, subject_name)
values
  ('teacher01@pineexam.test', 'Математик'),
  ('teacher01@pineexam.test', 'Мэдээлэл зүй'),
  ('teacher02@pineexam.test', 'Монгол хэл'),
  ('teacher03@pineexam.test', 'Англи хэл'),
  ('teacher03@pineexam.test', 'Орос хэл'),
  ('teacher04@pineexam.test', 'Физик'),
  ('teacher05@pineexam.test', 'Хими'),
  ('teacher06@pineexam.test', 'Биологи'),
  ('teacher07@pineexam.test', 'Түүх'),
  ('teacher08@pineexam.test', 'Нийгэм судлал'),
  ('teacher08@pineexam.test', 'Иргэний ёс зүй'),
  ('teacher09@pineexam.test', 'Мэдээлэл зүй'),
  ('teacher10@pineexam.test', 'Газарзүй');

delete from public.teacher_subjects
where teacher_id = '20000000-0000-0000-0000-000000000001'::uuid;

insert into public.teacher_subjects (teacher_id, subject_id, assigned_by, created_at)
select
  u.id,
  s.id,
  '10000000-0000-0000-0000-000000000001'::uuid,
  now()
from tmp_teacher_subjects ts
join tmp_seed_users u on u.email = ts.teacher_email
join public.subjects s on s.name = ts.subject_name
on conflict (teacher_id, subject_id) do update
set assigned_by = excluded.assigned_by;

create temporary table tmp_teaching_assignments (
  teacher_email text not null,
  group_name text not null,
  subject_name text not null
);

insert into tmp_teaching_assignments (teacher_email, group_name, subject_name)
values
  ('teacher01@pineexam.test', '10A', 'Математик'),
  ('teacher01@pineexam.test', '10B', 'Математик'),
  ('teacher01@pineexam.test', '10-р ангийн сонгон Математик', 'Математик'),
  ('teacher01@pineexam.test', '10B', 'Мэдээлэл зүй'),
  ('teacher01@pineexam.test', 'Coding Club', 'Мэдээлэл зүй'),

  ('teacher02@pineexam.test', '6A', 'Монгол хэл'),
  ('teacher02@pineexam.test', '6B', 'Монгол хэл'),
  ('teacher02@pineexam.test', '7A', 'Монгол хэл'),
  ('teacher02@pineexam.test', '7B', 'Монгол хэл'),
  ('teacher02@pineexam.test', '8A', 'Монгол хэл'),

  ('teacher03@pineexam.test', '8A', 'Англи хэл'),
  ('teacher03@pineexam.test', '8B', 'Англи хэл'),
  ('teacher03@pineexam.test', '9A', 'Англи хэл'),
  ('teacher03@pineexam.test', '9B', 'Англи хэл'),
  ('teacher03@pineexam.test', '10A', 'Англи хэл'),
  ('teacher03@pineexam.test', '10B', 'Англи хэл'),
  ('teacher03@pineexam.test', '10-р ангийн сонгон Англи хэл', 'Англи хэл'),
  ('teacher03@pineexam.test', '10A', 'Орос хэл'),
  ('teacher03@pineexam.test', '10B', 'Орос хэл'),

  ('teacher04@pineexam.test', '9A', 'Физик'),
  ('teacher04@pineexam.test', '9B', 'Физик'),
  ('teacher04@pineexam.test', '10A', 'Физик'),
  ('teacher04@pineexam.test', '10B', 'Физик'),

  ('teacher05@pineexam.test', '9A', 'Хими'),
  ('teacher05@pineexam.test', '9B', 'Хими'),
  ('teacher05@pineexam.test', '10A', 'Хими'),
  ('teacher05@pineexam.test', '10B', 'Хими'),

  ('teacher06@pineexam.test', '8A', 'Биологи'),
  ('teacher06@pineexam.test', '8B', 'Биологи'),
  ('teacher06@pineexam.test', '9A', 'Биологи'),
  ('teacher06@pineexam.test', '9B', 'Биологи'),

  ('teacher07@pineexam.test', '6A', 'Түүх'),
  ('teacher07@pineexam.test', '6B', 'Түүх'),
  ('teacher07@pineexam.test', '7A', 'Түүх'),
  ('teacher07@pineexam.test', '7B', 'Түүх'),
  ('teacher07@pineexam.test', '8A', 'Түүх'),
  ('teacher07@pineexam.test', '8B', 'Түүх'),

  ('teacher08@pineexam.test', '9A', 'Нийгэм судлал'),
  ('teacher08@pineexam.test', '9B', 'Нийгэм судлал'),
  ('teacher08@pineexam.test', '10A', 'Нийгэм судлал'),
  ('teacher08@pineexam.test', '10B', 'Нийгэм судлал'),
  ('teacher08@pineexam.test', '6A', 'Иргэний ёс зүй'),
  ('teacher08@pineexam.test', '6B', 'Иргэний ёс зүй'),
  ('teacher08@pineexam.test', '7A', 'Иргэний ёс зүй'),
  ('teacher08@pineexam.test', '7B', 'Иргэний ёс зүй'),

  ('teacher09@pineexam.test', '8A', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', '8B', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', '9A', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', '9B', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', '10A', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', '10B', 'Мэдээлэл зүй'),
  ('teacher09@pineexam.test', 'Coding Club', 'Мэдээлэл зүй'),

  ('teacher10@pineexam.test', '6A', 'Газарзүй'),
  ('teacher10@pineexam.test', '6B', 'Газарзүй'),
  ('teacher10@pineexam.test', '7A', 'Газарзүй'),
  ('teacher10@pineexam.test', '7B', 'Газарзүй'),
  ('teacher10@pineexam.test', '8A', 'Газарзүй'),
  ('teacher10@pineexam.test', '8B', 'Газарзүй');

delete from public.teaching_assignments
where teacher_id = '20000000-0000-0000-0000-000000000001'::uuid;

insert into public.teaching_assignments (
  id,
  teacher_id,
  group_id,
  subject_id,
  is_active,
  assigned_by,
  created_at
)
select
  uuid_generate_v4(),
  u.id,
  g.id,
  s.id,
  true,
  '10000000-0000-0000-0000-000000000001'::uuid,
  now()
from tmp_teaching_assignments ta
join tmp_seed_users u on u.email = ta.teacher_email
join public.student_groups g on g.name = ta.group_name
join public.subjects s on s.name = ta.subject_name
on conflict (teacher_id, group_id, subject_id) do update
set
  is_active = true,
  assigned_by = excluded.assigned_by;

-- -------------------------------------------------
-- Exams and schedules
-- -------------------------------------------------
create temporary table tmp_seed_exams (
  id uuid primary key,
  title text not null,
  description text,
  subject_name text,
  teacher_email text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_minutes integer not null,
  is_published boolean not null,
  max_attempts integer not null,
  shuffle_questions boolean not null,
  shuffle_options boolean not null,
  passing_score numeric(5,2),
  room text
);

insert into tmp_seed_exams
values
  (
    '50000000-0000-0000-0000-000000000001',
    'Математик - Функц ба график',
    'teacher01-ийн идэвхтэй demo шалгалт. student50 яг одоо өгөх боломжтой.',
    'Математик',
    'teacher01@pineexam.test',
    now() - interval '15 minutes',
    now() + interval '30 minutes',
    60,
    true,
    1,
    true,
    true,
    60,
    '201'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'Математик - Сонгон бодлого (ноорог)',
    'teacher01-ийн асуулт үүсгэх, эх материал холбох demo noorog шалгалт.',
    'Математик',
    'teacher01@pineexam.test',
    date_trunc('day', now()) + interval '7 day 14 hours',
    date_trunc('day', now()) + interval '7 day 14 hours 20 minutes',
    80,
    false,
    2,
    true,
    true,
    70,
    '202'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'Англи хэл - Reading Challenge',
    'Уншлагын чадвар болон үгийн сан шалгах тест.',
    'Англи хэл',
    'teacher03@pineexam.test',
    date_trunc('day', now()) + interval '1 day 11 hours',
    date_trunc('day', now()) + interval '1 day 12 hours',
    60,
    true,
    1,
    false,
    true,
    55,
    'Library'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    'Мэдээлэл зүй - Алгоритм ба хүснэгт',
    'teacher01-ийн удахгүй эхлэх мэдээлэл зүйн шалгалт.',
    'Мэдээлэл зүй',
    'teacher01@pineexam.test',
    date_trunc('day', now()) + interval '1 day 15 hours',
    date_trunc('day', now()) + interval '1 day 15 hours 30 minutes',
    50,
    true,
    2,
    true,
    true,
    60,
    'Lab-1'
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    'Монгол хэл - Эссэ ба эхийн задлал',
    'Нээлттэй асуулт давамгайлсан ноорог шалгалт.',
    'Монгол хэл',
    'teacher02@pineexam.test',
    date_trunc('day', now()) + interval '5 day 10 hours',
    date_trunc('day', now()) + interval '5 day 11 hours 30 minutes',
    90,
    false,
    1,
    false,
    false,
    60,
    '301'
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    'Физик - Хөдөлгөөн ба хүч',
    'Өмнөх долоо хоногт авсан шалгалтын demo result.',
    'Физик',
    'teacher04@pineexam.test',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours',
    date_trunc('day', now()) - interval '5 day' + interval '10 hours',
    60,
    true,
    1,
    false,
    false,
    50,
    'Lab-2'
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    'Хими - Урвал ба тэнцвэр',
    'Идэвхтэй явагдаж байгаа demo exam.',
    'Хими',
    'teacher05@pineexam.test',
    now() - interval '20 minutes',
    now() + interval '55 minutes',
    75,
    true,
    1,
    true,
    false,
    60,
    'Lab-3'
  ),
  (
    '50000000-0000-0000-0000-000000000008',
    'Математик - Тэгшитгэл ба функцийн дүн',
    'teacher01-ийн шалгаж дууссан demo шалгалт. student50 дээр бодит хариулт, оноо харагдана.',
    'Математик',
    'teacher01@pineexam.test',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 20 minutes',
    60,
    true,
    1,
    true,
    true,
    60,
    '202'
  ),
  (
    '50000000-0000-0000-0000-000000000009',
    'Мэдээлэл зүй - Код унших даалгавар',
    'teacher01-ийн багш шалгаж байгаа demo шалгалт. student50 дээр урьдчилсан дүн харагдана.',
    'Мэдээлэл зүй',
    'teacher01@pineexam.test',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 15 minutes',
    45,
    true,
    1,
    false,
    true,
    60,
    'Lab-2'
  );

insert into public.exams (
  id,
  title,
  description,
  subject_id,
  created_by,
  start_time,
  end_time,
  duration_minutes,
  is_published,
  max_attempts,
  shuffle_questions,
  shuffle_options,
  passing_score,
  created_at,
  updated_at
)
select
  e.id,
  e.title,
  e.description,
  s.id,
  u.id,
  e.start_time,
  e.end_time,
  e.duration_minutes,
  e.is_published,
  e.max_attempts,
  e.shuffle_questions,
  e.shuffle_options,
  e.passing_score,
  now(),
  now()
from tmp_seed_exams e
join public.subjects s on s.name = e.subject_name
join tmp_seed_users u on u.email = e.teacher_email
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  subject_id = excluded.subject_id,
  created_by = excluded.created_by,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  duration_minutes = excluded.duration_minutes,
  is_published = excluded.is_published,
  max_attempts = excluded.max_attempts,
  shuffle_questions = excluded.shuffle_questions,
  shuffle_options = excluded.shuffle_options,
  passing_score = excluded.passing_score,
  updated_at = now();

insert into public.exam_schedules (id, exam_id, room, start_time, end_time, created_at)
select
  ('51000000-0000-0000-0000-' || lpad(row_number() over (order by e.id)::text, 12, '0'))::uuid,
  e.id,
  e.room,
  e.start_time,
  e.end_time,
  now()
from tmp_seed_exams e
where e.room is not null
on conflict (exam_id) do update
set
  room = excluded.room,
  start_time = excluded.start_time,
  end_time = excluded.end_time;

create temporary table tmp_exam_group_assignments (
  exam_id uuid not null,
  group_name text not null
);

insert into tmp_exam_group_assignments (exam_id, group_name)
values
  ('50000000-0000-0000-0000-000000000001', '10B'),
  ('50000000-0000-0000-0000-000000000001', '10-р ангийн сонгон Математик'),
  ('50000000-0000-0000-0000-000000000002', '10A'),
  ('50000000-0000-0000-0000-000000000002', '10-р ангийн сонгон Математик'),
  ('50000000-0000-0000-0000-000000000003', '8A'),
  ('50000000-0000-0000-0000-000000000003', '8B'),
  ('50000000-0000-0000-0000-000000000003', '10-р ангийн сонгон Англи хэл'),
  ('50000000-0000-0000-0000-000000000004', '10B'),
  ('50000000-0000-0000-0000-000000000004', 'Coding Club'),
  ('50000000-0000-0000-0000-000000000006', '9A'),
  ('50000000-0000-0000-0000-000000000006', '9B'),
  ('50000000-0000-0000-0000-000000000007', '10A'),
  ('50000000-0000-0000-0000-000000000008', '10B'),
  ('50000000-0000-0000-0000-000000000008', '10-р ангийн сонгон Математик'),
  ('50000000-0000-0000-0000-000000000009', '10B'),
  ('50000000-0000-0000-0000-000000000009', 'Coding Club');

delete from public.exam_assignments
where exam_id in (select id from tmp_seed_exams);

insert into public.exam_assignments (id, exam_id, group_id, assigned_by, assigned_at)
select
  uuid_generate_v4(),
  ega.exam_id,
  g.id,
  e.created_by,
  now()
from tmp_exam_group_assignments ega
join public.student_groups g on g.name = ega.group_name
join public.exams e on e.id = ega.exam_id
on conflict (exam_id, group_id) do update
set assigned_by = excluded.assigned_by;

delete from public.exam_recipients
where exam_id in (
  select id
  from tmp_seed_exams
  where is_published = true
);

insert into public.exam_recipients (exam_id, student_id, assigned_by, assigned_at)
select distinct
  ea.exam_id,
  sgm.student_id,
  ea.assigned_by,
  now()
from public.exam_assignments ea
join public.exams e on e.id = ea.exam_id
join public.student_group_members sgm on sgm.group_id = ea.group_id
where e.id in (select id from tmp_seed_exams where is_published = true)
  and e.is_published = true
on conflict (exam_id, student_id) do nothing;

-- Additional archived exams for student50 learning profile
insert into public.exams (
  id,
  title,
  description,
  subject_id,
  created_by,
  start_time,
  end_time,
  duration_minutes,
  is_published,
  max_attempts,
  shuffle_questions,
  shuffle_options,
  passing_score,
  created_at,
  updated_at
)
select
  v.id,
  v.title,
  v.description,
  s.id,
  u.id,
  v.start_time,
  v.end_time,
  v.duration_minutes,
  true,
  1,
  v.shuffle_questions,
  v.shuffle_options,
  60,
  now(),
  now()
from (
  values
    (
      '50000000-0000-0000-0000-000000000010'::uuid,
      'Математик - Тригонометр ба функцийн ахиц',
      'student50-ийн mastery profile-д зориулсан өмнөх математикийн шалгалт.',
      'Математик',
      'teacher01@pineexam.test',
      date_trunc('day', now()) - interval '8 day' + interval '13 hours',
      date_trunc('day', now()) - interval '8 day' + interval '13 hours 50 minutes',
      50,
      true,
      true
    ),
    (
      '50000000-0000-0000-0000-000000000011'::uuid,
      'Мэдээлэл зүй - Тооллын систем ба алгоритм',
      'student50-ийн сул сэдвүүдийг харуулах өмнөх мэдээлэл зүйн шалгалт.',
      'Мэдээлэл зүй',
      'teacher01@pineexam.test',
      date_trunc('day', now()) - interval '6 day' + interval '09 hours',
      date_trunc('day', now()) - interval '6 day' + interval '09 hours 40 minutes',
      40,
      true,
      false
    )
) as v(id, title, description, subject_name, teacher_email, start_time, end_time, duration_minutes, shuffle_questions, shuffle_options)
join public.subjects s on s.name = v.subject_name
join tmp_seed_users u on u.email = v.teacher_email
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  subject_id = excluded.subject_id,
  created_by = excluded.created_by,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  duration_minutes = excluded.duration_minutes,
  is_published = excluded.is_published,
  max_attempts = excluded.max_attempts,
  shuffle_questions = excluded.shuffle_questions,
  shuffle_options = excluded.shuffle_options,
  passing_score = excluded.passing_score,
  updated_at = now();

insert into public.exam_schedules (id, exam_id, room, start_time, end_time, created_at)
values
  (
    '51000000-0000-0000-0000-000000000010',
    '50000000-0000-0000-0000-000000000010',
    '202',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 50 minutes',
    now()
  ),
  (
    '51000000-0000-0000-0000-000000000011',
    '50000000-0000-0000-0000-000000000011',
    'Lab-2',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 40 minutes',
    now()
  )
on conflict (exam_id) do update
set
  room = excluded.room,
  start_time = excluded.start_time,
  end_time = excluded.end_time;

insert into public.exam_assignments (id, exam_id, group_id, assigned_by, assigned_at)
select
  v.id,
  v.exam_id,
  g.id,
  teacher.id,
  now()
from (
  values
    ('52000000-0000-0000-0000-000000000010'::uuid, '50000000-0000-0000-0000-000000000010'::uuid, '10B'),
    ('52000000-0000-0000-0000-000000000011'::uuid, '50000000-0000-0000-0000-000000000010'::uuid, '10-р ангийн сонгон Математик'),
    ('52000000-0000-0000-0000-000000000012'::uuid, '50000000-0000-0000-0000-000000000011'::uuid, '10B'),
    ('52000000-0000-0000-0000-000000000013'::uuid, '50000000-0000-0000-0000-000000000011'::uuid, 'Coding Club')
) as v(id, exam_id, group_name)
join public.student_groups g on g.name = v.group_name
join public.profiles teacher on teacher.email = 'teacher01@pineexam.test'
on conflict (exam_id, group_id) do update
set
  assigned_by = excluded.assigned_by,
  assigned_at = excluded.assigned_at;

insert into public.exam_recipients (exam_id, student_id, assigned_by, assigned_at)
select distinct
  ea.exam_id,
  sgm.student_id,
  ea.assigned_by,
  now()
from public.exam_assignments ea
join public.student_group_members sgm on sgm.group_id = ea.group_id
where ea.exam_id in (
  '50000000-0000-0000-0000-000000000010'::uuid,
  '50000000-0000-0000-0000-000000000011'::uuid
)
on conflict (exam_id, student_id) do nothing;

-- -------------------------------------------------
-- Passages
-- -------------------------------------------------
insert into public.question_passages (
  id,
  exam_id,
  title,
  content,
  content_html,
  image_url,
  order_index,
  created_by,
  created_at
)
values
  (
    '75000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000003',
    'Reading Passage',
    'Pinecone Academy organized a green campus week to encourage students to reduce waste and plant trees.',
    '<p><strong>Pinecone Academy</strong> organized a <em>green campus week</em> to encourage students to reduce waste and plant trees.</p>',
    null,
    0,
    '20000000-0000-0000-0000-000000000003',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000005',
    'Эхийн хэсэг',
    'Хаврын анхны бороо ороход сургуулийн хашаа шинэхэн өнгөөр амьсгалж эхэлжээ.',
    '<p>Хаврын анхны бороо ороход сургуулийн хашаа <strong>шинэхэн өнгөөр</strong> амьсгалж эхэлжээ.</p>',
    null,
    0,
    '20000000-0000-0000-0000-000000000002',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    'Параболын график',
    'Доорх график болон тайлбарыг ашиглаад холбогдох асуултуудад хариул.',
    '<p>График нь <strong>f(x)=x^2-4x+3</strong> функцийг илэрхийлнэ.</p><ul><li>Орой нь (2,-1)</li><li>x-тэнхлэгийг 1 болон 3 дээр огтолно</li><li>y-тэнхлэгийг 3 дээр огтолно</li></ul>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200" viewBox="0 0 360 200"><rect width="360" height="200" fill="%23f8fafc"/><line x1="50" y1="25" x2="50" y2="170" stroke="%23334155" stroke-width="2"/><line x1="20" y1="140" x2="330" y2="140" stroke="%23334155" stroke-width="2"/><path d="M95 140 Q180 40 265 140" fill="none" stroke="%230f766e" stroke-width="4"/><circle cx="180" cy="75" r="5" fill="%230f766e"/><text x="188" y="72" font-size="12" fill="%230f172a">(2,-1)</text></svg>',
    0,
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000002',
    'Сонгон бодлогын нөхцөл',
    'Нэг нөхцөлтэй олон бодлого зохиох жишээ эх материал.',
    '<p>Адил хөлт гурвалжны периметр 24 см, суурь нь 8 см бол тэнцүү хажуу бүрийн уртыг ол.</p><p>Дараах асуултууд энэ нөхцөл дээр суурилна.</p>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23fff7ed"/><polygon points="160,25 60,145 260,145" fill="%23fde68a" stroke="%23924f19" stroke-width="3"/><text x="145" y="20" font-size="13" fill="%237c2d12">?</text><text x="85" y="160" font-size="13" fill="%237c2d12">8 см</text></svg>',
    0,
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000004',
    'Алгоритмын хүснэгт ба блок',
    'Кодын логикийг хүснэгт болон схемтэй нь уншаад хариулна.',
    '<p>Доорх хүснэгтэд клубийн даалгаврын оноог харуулав.</p><table><thead><tr><th>Сурагч</th><th>Даалгавар</th><th>Оноо</th></tr></thead><tbody><tr><td>Бат</td><td>Flowchart</td><td>8</td></tr><tr><td>Саруул</td><td>Python loop</td><td>10</td></tr><tr><td>Номин</td><td>HTML table</td><td>7</td></tr></tbody></table>',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="360" height="170" viewBox="0 0 360 170"><rect width="360" height="170" fill="%23eff6ff"/><rect x="40" y="20" width="90" height="40" rx="8" fill="%23bfdbfe" stroke="%231d4ed8"/><text x="68" y="45" font-size="13" fill="%231e3a8a">Эхлэх</text><rect x="140" y="20" width="90" height="40" rx="8" fill="%23dbeafe" stroke="%231d4ed8"/><text x="158" y="45" font-size="13" fill="%231e3a8a">Унших</text><rect x="240" y="20" width="90" height="40" rx="8" fill="%23bfdbfe" stroke="%231d4ed8"/><text x="268" y="45" font-size="13" fill="%231e3a8a">Дуусах</text><line x1="130" y1="40" x2="140" y2="40" stroke="%231d4ed8" stroke-width="3"/><line x1="230" y1="40" x2="240" y2="40" stroke="%231d4ed8" stroke-width="3"/></svg>',
    0,
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000009',
    'Клубийн даалгаврын хүснэгт',
    'Хүснэгтийг уншаад кодтой холбоотой асуултуудад хариул.',
    '<p>Дараах хүснэгтийг ажигла.</p><table><thead><tr><th>Нэр</th><th>Даалгавар</th><th>Гүйцэтгэл</th></tr></thead><tbody><tr><td>Тэмүүжин</td><td>Loop demo</td><td>5</td></tr><tr><td>Оюунаа</td><td>Scratch game</td><td>7</td></tr><tr><td>Марал</td><td>HTML layout</td><td>4</td></tr></tbody></table>',
    null,
    0,
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '75000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000008',
    'Функцийн утгын хүснэгт',
    'Доорх хүснэгтийг ашиглаад тэгшитгэл, функцийн асуултуудад хариул.',
    '<table><thead><tr><th>x</th><th>-1</th><th>0</th><th>1</th><th>2</th></tr></thead><tbody><tr><td>y</td><td>0</td><td>-3</td><td>-4</td><td>-3</td></tr></tbody></table><p>Хүснэгт нь нэг квадратыг илэрхийлнэ.</p>',
    null,
    0,
    '20000000-0000-0000-0000-000000000001',
    now()
  )
on conflict (id) do update
set
  exam_id = excluded.exam_id,
  content = excluded.content,
  content_html = excluded.content_html,
  image_url = excluded.image_url,
  title = excluded.title,
  order_index = excluded.order_index,
  created_by = excluded.created_by;

-- -------------------------------------------------
-- Questions
-- -------------------------------------------------
insert into public.questions (
  id,
  exam_id,
  passage_id,
  type,
  content,
  content_html,
  image_url,
  options,
  correct_answer,
  points,
  order_index,
  explanation,
  created_by,
  created_at
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000003',
    'multiple_choice',
    'Графикаас функцийн оройн x координатыг ол.',
    '<p>Дээрх графикт харуулсан параболын <strong>оройн x координат</strong> хэд вэ?</p>',
    null,
    '["1","2","3","4"]'::jsonb,
    '2',
    2,
    0,
    'График болон $$-b/2a$$ томьёогоор шалгахад x = 2.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    null,
    'fill_blank',
    'f(2)-ийн утгыг нөхөж бич.',
    '<p>$$f(x)=x^2-4x+3$$ үед $$f(2) = $$ ____</p>',
    null,
    null,
    '-1',
    2,
    1,
    'Оройн цэг нь (2,-1) тул $$f(2)=-1$$.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    null,
    'essay',
    'Парабол яагаад дээш нээгдэж байгааг 2-3 өгүүлбэрээр тайлбарла.',
    null,
    null,
    null,
    null,
    5,
    4,
    'a коэффициент эерэг тул график дээш нээгдэнэ. Орой ба тэнхлэгийн тухай дурдвал сайн.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000003',
    '75000000-0000-0000-0000-000000000001',
    'multiple_choice',
    'What was the main goal of the green campus week?',
    '<p>Choose the best answer based on the passage.</p>',
    null,
    '["To reduce waste and plant trees","To cancel classes","To build a new library","To sell uniforms"]'::jsonb,
    'To reduce waste and plant trees',
    3,
    0,
    'The passage clearly states the week encouraged reducing waste and planting trees.',
    '20000000-0000-0000-0000-000000000003',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000003',
    '75000000-0000-0000-0000-000000000001',
    'essay',
    'Write one short idea your class could use to make the campus greener.',
    null,
    null,
    null,
    null,
    4,
    1,
    'Open response about recycling, tree planting, or reducing plastic.',
    '20000000-0000-0000-0000-000000000003',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000003',
    null,
    'matching',
    'Match the word with its meaning: reduce, encourage, waste.',
    null,
    null,
    '["reduce|||make smaller","encourage|||give support","waste|||unused material"]'::jsonb,
    '[{"left":"reduce","right":"make smaller"},{"left":"encourage","right":"give support"},{"left":"waste","right":"unused material"}]',
    3,
    2,
    'Vocabulary matching.',
    '20000000-0000-0000-0000-000000000003',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000004',
    '75000000-0000-0000-0000-000000000005',
    'multiple_choice',
    'Хүснэгтээс хамгийн өндөр оноо авсан даалгаврыг сонго.',
    '<p>Хүснэгтэд харуулсан даалгавруудаас аль нь хамгийн өндөр оноотой вэ?</p>',
    null,
    '["Flowchart","Python loop","HTML table","Бүгд ижил"]'::jsonb,
    'Python loop',
    3,
    0,
    'Хүснэгтийн дагуу Python loop = 10 оноо.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000008',
    '50000000-0000-0000-0000-000000000004',
    null,
    'multiple_response',
    'Програмчлалын хэлнүүдийг бүгдийг нь сонго.',
    null,
    null,
    '["Python","HTML","JavaScript","Keyboard"]'::jsonb,
    '["Python","JavaScript"]',
    3,
    1,
    'Python and JavaScript are programming languages.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000009',
    '50000000-0000-0000-0000-000000000004',
    null,
    'fill_blank',
    'Binary system uses only ____ and ____.',
    null,
    null,
    null,
    '0,1',
    2,
    2,
    'Binary digits are 0 and 1.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000010',
    '50000000-0000-0000-0000-000000000006',
    null,
    'multiple_choice',
    'SI system-д хүчний нэгж аль нь вэ?',
    '<p>F = ma томьёотой холбоотой асуулт.</p>',
    null,
    '["Ньютон","Жоуль","Паскаль","Ватт"]'::jsonb,
    'Ньютон',
    2,
    0,
    'Хүчний SI нэгж нь Ньютон.',
    '20000000-0000-0000-0000-000000000004',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000011',
    '50000000-0000-0000-0000-000000000006',
    null,
    'fill_blank',
    '2 кг масстай биед 4 м/с² хурдатгал өгвөл хүч ____ Н болно.',
    '<p>$$F = ma$$ томьёог ашигла.</p>',
    null,
    null,
    '8',
    3,
    1,
    '2 × 4 = 8 Н.',
    '20000000-0000-0000-0000-000000000004',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000012',
    '50000000-0000-0000-0000-000000000006',
    null,
    'essay',
    'Хурд ба хурдатгалын ялгааг өөрийн үгээр тайлбарла.',
    null,
    null,
    null,
    null,
    5,
    2,
    'Тайлбарын чанараар багш үнэлнэ.',
    '20000000-0000-0000-0000-000000000004',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000013',
    '50000000-0000-0000-0000-000000000007',
    null,
    'multiple_choice',
    'Which formula shows water?',
    '<p>Choose the correct chemical formula.</p><p>$$H_2O$$</p>',
    null,
    '["CO2","NaCl","H2O","O2"]'::jsonb,
    'H2O',
    2,
    0,
    'Water is H2O.',
    '20000000-0000-0000-0000-000000000005',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000014',
    '50000000-0000-0000-0000-000000000007',
    null,
    'multiple_response',
    'Which are chemical changes? Choose all that apply.',
    null,
    null,
    '["Burning paper","Melting ice","Rusting iron","Boiling water"]'::jsonb,
    '["Burning paper","Rusting iron"]',
    3,
    1,
    'Burning and rusting are chemical changes.',
    '20000000-0000-0000-0000-000000000005',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000015',
    '50000000-0000-0000-0000-000000000007',
    null,
    'fill_blank',
    'Periodic table дахь Na тэмдэг нь ____ элемент.',
    null,
    null,
    null,
    'Натри',
    2,
    2,
    'Na = Sodium = Натри.',
    '20000000-0000-0000-0000-000000000005',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000016',
    '50000000-0000-0000-0000-000000000005',
    '75000000-0000-0000-0000-000000000002',
    'essay',
    'Эхийн өнгө аяс, дүрслэлийг тайлбарлан 120 үгтэй хариулт бич.',
    null,
    null,
    null,
    null,
    6,
    0,
    'Эхийн уран дүрслэл, сэтгэгдлийг багш үнэлнэ.',
    '20000000-0000-0000-0000-000000000002',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000017',
    '50000000-0000-0000-0000-000000000005',
    '75000000-0000-0000-0000-000000000002',
    'multiple_choice',
    'Эхийн дүрслэлд хамгийн тохирох мэдрэмжийг сонго.',
    null,
    null,
    '["Сэргэг ба шинэлэг","Айдас төрүүлсэн","Ууртай","Хүйтэн хөндий"]'::jsonb,
    'Сэргэг ба шинэлэг',
    2,
    1,
    'Хаврын бороо, шинэхэн өнгө гэсэн дүрслэл нь сэргэг мэдрэмж төрүүлнэ.',
    '20000000-0000-0000-0000-000000000002',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000018',
    '50000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000003',
    'multiple_response',
    'Графикаас зөв мэдээллүүдийг бүгдийг нь сонго.',
    '<p>Доорх сонголтуудаас зөв мэдээллүүдийг сонгоно уу.</p>',
    null,
    '["Орой нь x=2 дээр байна","x=1 болон x=3 дээр огтолно","y-огтлолцол нь 3","Доош нээгдэнэ"]'::jsonb,
    '["Орой нь x=2 дээр байна","x=1 болон x=3 дээр огтолно","y-огтлолцол нь 3"]',
    4,
    2,
    'Сүүлийн сонголтоос бусад нь зөв.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000019',
    '50000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000003',
    'matching',
    'Графиктай холбоотой ойлголтуудыг зөв холбо.',
    null,
    null,
    '["Орой|||(2,-1)","Симметрийн тэнхлэг|||x=2","y-огтлолцол|||3"]'::jsonb,
    '[{"left":"Орой","right":"(2,-1)"},{"left":"Симметрийн тэнхлэг","right":"x=2"},{"left":"y-огтлолцол","right":"3"}]',
    3,
    3,
    'Параболын үндсэн шинжүүдийг таних асуулт.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000020',
    '50000000-0000-0000-0000-000000000008',
    null,
    'multiple_choice',
    'y = 2x + 1 үед x = 3 бол y хэд вэ?',
    '<p>$$y = 2x + 1$$ үед $$x = 3$$.</p>',
    null,
    '["5","6","7","8"]'::jsonb,
    '7',
    2,
    0,
    '2*3+1 = 7.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000021',
    '50000000-0000-0000-0000-000000000008',
    null,
    'fill_blank',
    '|-4| = ____',
    '<p>Абсолют утгыг ол.</p>',
    null,
    null,
    '4',
    1,
    1,
    'Абсолют утга нь сөрөг биш байна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000022',
    '50000000-0000-0000-0000-000000000008',
    null,
    'multiple_response',
    'Анхны тоонуудыг бүгдийг нь сонго.',
    null,
    null,
    '["2","3","4","5"]'::jsonb,
    '["2","3","5"]',
    3,
    2,
    '2, 3, 5 нь анхны тоо.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000023',
    '50000000-0000-0000-0000-000000000008',
    null,
    'matching',
    'Томьёо болон утгыг зөв холбо.',
    null,
    null,
    '["2^3|||8","3^2|||9","√16|||4"]'::jsonb,
    '[{"left":"2^3","right":"8"},{"left":"3^2","right":"9"},{"left":"√16","right":"4"}]',
    3,
    3,
    'Үндсэн зэрэг, язгуурын ойлголтыг шалгана.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000024',
    '50000000-0000-0000-0000-000000000008',
    '75000000-0000-0000-0000-000000000007',
    'essay',
    'Квадрат функцийн оройг хүснэгтээс хэрхэн танихаа тайлбарла.',
    null,
    null,
    null,
    null,
    4,
    4,
    'Хамгийн бага эсвэл их y утгыг олж тайлбарлахыг хүлээнэ.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000025',
    '50000000-0000-0000-0000-000000000004',
    null,
    'matching',
    'Програмчлалын нэр томьёо ба үүргийг зөв холбо.',
    null,
    null,
    '["Variable|||өгөгдөл хадгална","Loop|||үйлдлийг давтана","Condition|||шийдвэр гаргана"]'::jsonb,
    '[{"left":"Variable","right":"өгөгдөл хадгална"},{"left":"Loop","right":"үйлдлийг давтана"},{"left":"Condition","right":"шийдвэр гаргана"}]',
    3,
    3,
    'Суурь нэр томьёог холбох асуулт.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000026',
    '50000000-0000-0000-0000-000000000009',
    '75000000-0000-0000-0000-000000000006',
    'multiple_choice',
    'Хүснэгтээс хамгийн олон даалгавар гүйцэтгэсэн сурагчийг сонго.',
    null,
    null,
    '["Тэмүүжин","Оюунаа","Марал","Бүгд ижил"]'::jsonb,
    'Оюунаа',
    2,
    0,
    'Хүснэгтэд Оюунаа 7 гүйцэтгэлтэй байна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000027',
    '50000000-0000-0000-0000-000000000009',
    null,
    'matching',
    'Кодын ойлголтыг зөв тайлбартай холбо.',
    null,
    null,
    '["Loop|||давталт","Sprite|||харагдах дүр","Variable|||утга хадгална"]'::jsonb,
    '[{"left":"Loop","right":"давталт"},{"left":"Sprite","right":"харагдах дүр"},{"left":"Variable","right":"утга хадгална"}]',
    3,
    1,
    'Scratch болон Python-ийн үндсэн ойлголтууд.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000028',
    '50000000-0000-0000-0000-000000000009',
    null,
    'essay',
    'Loop ашиглах нь кодыг яагаад товч, ойлгомжтой болгодгийг тайлбарла.',
    null,
    null,
    null,
    null,
    4,
    2,
    'Жишээтэй тайлбарлавал өндөр оноо авна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000029',
    '50000000-0000-0000-0000-000000000009',
    null,
    'fill_blank',
    'repeat 5 times блок нь үйлдлийг ____ удаа давтана.',
    null,
    null,
    null,
    '5',
    1,
    3,
    'repeat 5 times гэдэг нь 5 удаа давтахыг хэлнэ.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000030',
    '50000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000004',
    'multiple_choice',
    'Адил хөлт гурвалжны хоёр тэнцүү талын уртыг ол.',
    null,
    null,
    '["6 см","8 см","10 см","12 см"]'::jsonb,
    '8 см',
    2,
    0,
    '24 - 8 = 16, 16 / 2 = 8.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000031',
    '50000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000004',
    'fill_blank',
    'Хоёр тэнцүү талын нийлбэр ____ см байна.',
    null,
    null,
    null,
    '16',
    1,
    1,
    'Периметрээс суурийг хасна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000032',
    '50000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000004',
    'essay',
    'Энэ нөхцөлөөс цааш ямар 2 дэд бодлого зохиож болохоо тайлбарла.',
    null,
    null,
    null,
    null,
    4,
    2,
    'Нэг нөхцөлөөс олон асуулт салаалуулж болдгийг харуулах demo асуулт.',
    '20000000-0000-0000-0000-000000000001',
    now()
  )
on conflict (id) do update
set
  passage_id = excluded.passage_id,
  type = excluded.type,
  content = excluded.content,
  content_html = excluded.content_html,
  image_url = excluded.image_url,
  options = excluded.options,
  correct_answer = excluded.correct_answer,
  points = excluded.points,
  order_index = excluded.order_index,
  explanation = excluded.explanation,
  created_by = excluded.created_by;

insert into public.questions (
  id,
  exam_id,
  passage_id,
  type,
  content,
  content_html,
  image_url,
  options,
  correct_answer,
  points,
  order_index,
  explanation,
  created_by,
  created_at
)
values
  (
    '70000000-0000-0000-0000-000000000033',
    '50000000-0000-0000-0000-000000000010',
    null,
    'multiple_choice',
    'tan 45° хэдтэй тэнцүү вэ?',
    '<p>$$\\tan 45^\\circ$$ хэдтэй тэнцүү вэ?</p>',
    null,
    '["0","1","√3","1/2"]'::jsonb,
    '1',
    2,
    0,
    'tan 45° = 1.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000034',
    '50000000-0000-0000-0000-000000000010',
    null,
    'multiple_choice',
    'Парабол x-тэнхлэгийг хоёр цэгт огтолж байвал бодит шийдэл хэд байна гэсэн үг вэ?',
    '<p>График x-тэнхлэгийг 2 цэгт огтолж байвал бодит шийдлийн тоо хэд байх вэ?</p>',
    null,
    '["0","1","2","3"]'::jsonb,
    '2',
    2,
    1,
    'x-тэнхлэгтэй огтлолцсон цэгийн тоо нь бодит шийдлийн тоо байна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000035',
    '50000000-0000-0000-0000-000000000010',
    null,
    'multiple_choice',
    'y = x^2 - 6x + 5 функцийн оройн x координатыг сонго.',
    '<p>$$y = x^2 - 6x + 5$$ функцийн орой хэдэн x дээр байрлах вэ?</p>',
    null,
    '["2","3","5","6"]'::jsonb,
    '3',
    3,
    2,
    'Оройн x координат нь $$-b/2a$$ = 3.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000036',
    '50000000-0000-0000-0000-000000000010',
    null,
    'fill_blank',
    'y = 3x - 4 шулууны налалт ____ байна.',
    '<p>$$y = 3x - 4$$ үед налалтыг нөхөж бич.</p>',
    null,
    null,
    '3',
    2,
    3,
    'Налалт нь x-ийн коэффициент байна.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000037',
    '50000000-0000-0000-0000-000000000010',
    null,
    'matching',
    'Зэрэг ба язгуурын утгуудыг зөв холбо.',
    null,
    null,
    '["2^4|||16","√25|||5","3^2|||9"]'::jsonb,
    '[{"left":"2^4","right":"16"},{"left":"√25","right":"5"},{"left":"3^2","right":"9"}]',
    3,
    4,
    'Зэрэг ба язгуурын суурь ойлголтыг шалгана.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000038',
    '50000000-0000-0000-0000-000000000011',
    null,
    'multiple_choice',
    'CPU-ийн үндсэн үүрэг аль нь вэ?',
    '<p>CPU буюу процессорын үндсэн үүргийг сонго.</p>',
    null,
    '["Тооцоолол гүйцэтгэх","Дуу өсгөх","Зураг хэвлэх","Цахилгаан хадгалах"]'::jsonb,
    'Тооцоолол гүйцэтгэх',
    2,
    0,
    'CPU нь тооцоолол, боловсруулалт хийдэг.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000039',
    '50000000-0000-0000-0000-000000000011',
    null,
    'fill_blank',
    '1010 хоёртын тоо аравтын системд ____ болно.',
    '<p>$$1010_2$$ тоог аравтын системд хөрвүүл.</p>',
    null,
    null,
    '10',
    3,
    1,
    '1010₂ = 8 + 2 = 10.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000040',
    '50000000-0000-0000-0000-000000000011',
    null,
    'multiple_response',
    'Алгоритмын үндсэн бүтэцүүдийг сонго.',
    '<p>Доорх ойлголтуудаас алгоритмын суурь бүтцүүдийг сонго.</p>',
    null,
    '["Дараалал","Салаалалт","Давталт","Товчлуур"]'::jsonb,
    '["Дараалал","Салаалалт","Давталт"]',
    3,
    2,
    'Алгоритмын үндсэн бүтэц нь дараалал, салаалалт, давталт.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000041',
    '50000000-0000-0000-0000-000000000011',
    null,
    'multiple_choice',
    'Variable нь юуг хадгалдаг вэ?',
    '<p>Програмчлалд <strong>variable</strong> нь ихэвчлэн юуг хадгалдаг вэ?</p>',
    null,
    '["Утга","Дуу","Зураг хэвлэх команд","Интернет хурд"]'::jsonb,
    'Утга',
    2,
    3,
    'Variable нь утга хадгалдаг.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000042',
    '50000000-0000-0000-0000-000000000011',
    null,
    'essay',
    'Flowchart ашиглах нь алгоритмыг ойлгоход яагаад тустай вэ? 2 өгүүлбэрээр тайлбарла.',
    null,
    null,
    null,
    null,
    2,
    4,
    'Алгоритмын дарааллыг дүрсээр харуулах, ойлгоход туслах санааг дурдвал хангалттай.',
    '20000000-0000-0000-0000-000000000001',
    now()
  )
on conflict (id) do update
set
  exam_id = excluded.exam_id,
  passage_id = excluded.passage_id,
  type = excluded.type,
  content = excluded.content,
  content_html = excluded.content_html,
  image_url = excluded.image_url,
  options = excluded.options,
  correct_answer = excluded.correct_answer,
  points = excluded.points,
  order_index = excluded.order_index,
  explanation = excluded.explanation,
  created_by = excluded.created_by;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'questions'
      and column_name = 'subtopic'
  ) then
    update public.questions q
    set
      subject_id = s.id,
      subtopic = v.subtopic,
      source_question_bank_id = v.source_question_bank_id,
      topic_label_source = v.topic_label_source,
      topic_label_confidence = v.topic_label_confidence
    from (
      values
        ('70000000-0000-0000-0000-000000000001'::uuid, 'Математик', 'Функцийн график', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000002'::uuid, 'Математик', 'Квадрат функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000003'::uuid, 'Математик', 'Квадрат функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000018'::uuid, 'Математик', 'Функцийн график', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000019'::uuid, 'Математик', 'Функцийн график', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000020'::uuid, 'Математик', 'Шугаман функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000021'::uuid, 'Математик', 'Абсолют утга', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000022'::uuid, 'Математик', 'Анхны тоо', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000023'::uuid, 'Математик', 'Зэрэг ба язгуур', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000024'::uuid, 'Математик', 'Квадрат функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000025'::uuid, 'Мэдээлэл зүй', 'Алгоритм', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000026'::uuid, 'Мэдээлэл зүй', 'Компьютерын үндэс', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000027'::uuid, 'Мэдээлэл зүй', 'Програмчлалын ойлголт', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000028'::uuid, 'Мэдээлэл зүй', 'Алгоритм', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000029'::uuid, 'Мэдээлэл зүй', 'Алгоритм', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000033'::uuid, 'Математик', 'Тригонометр', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000034'::uuid, 'Математик', 'Функцийн график', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000035'::uuid, 'Математик', 'Квадрат функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000036'::uuid, 'Математик', 'Шугаман функц', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000037'::uuid, 'Математик', 'Зэрэг ба язгуур', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000038'::uuid, 'Мэдээлэл зүй', 'Компьютерын үндэс', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000039'::uuid, 'Мэдээлэл зүй', 'Тооллын систем', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000040'::uuid, 'Мэдээлэл зүй', 'Алгоритм', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000041'::uuid, 'Мэдээлэл зүй', 'Програмчлалын ойлголт', null::uuid, 'manual', 1::numeric),
        ('70000000-0000-0000-0000-000000000042'::uuid, 'Мэдээлэл зүй', 'Алгоритм', null::uuid, 'manual', 1::numeric)
    ) as v(id, subject_name, subtopic, source_question_bank_id, topic_label_source, topic_label_confidence)
    join public.subjects s on s.name = v.subject_name
    where q.id = v.id;
  end if;
end $$;

-- -------------------------------------------------
-- Question bank
-- -------------------------------------------------
insert into public.question_bank (
  id,
  subject_id,
  created_by,
  type,
  content,
  content_html,
  image_url,
  options,
  correct_answer,
  points,
  difficulty,
  tags,
  explanation,
  usage_count,
  created_at,
  updated_at
)
select
  v.id,
  s.id,
  u.id,
  v.type,
  v.content,
  v.content_html,
  v.image_url,
  v.options,
  v.correct_answer,
  v.points,
  v.difficulty,
  v.tags,
  v.explanation,
  v.usage_count,
  now(),
  now()
from (
  values
    (
      '80000000-0000-0000-0000-000000000001'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'sin 30° хэдтэй тэнцүү вэ?', '<p>$$\\sin 30^\\circ$$ хэд вэ?</p>', null, '["1/2","1","0","√3/2"]'::jsonb, '1/2',
      2::numeric, 'easy', array['trigonometry','grade-10']::text[], 'Суурь тригонометр.', 3
    ),
    (
      '80000000-0000-0000-0000-000000000002'::uuid, 'teacher02@pineexam.test', 'Монгол хэл', 'essay',
      'Өгөгдсөн сэдвээр богино эссэ бич.', null, null, null, null,
      5::numeric, 'medium', array['essay','writing']::text[], 'Бүтцээр үнэлнэ.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000003'::uuid, 'teacher03@pineexam.test', 'Англи хэл', 'essay',
      'Match school words with meanings: library, uniform.', null, null,
      null,
      null,
      2::numeric, 'easy', array['vocabulary']::text[], 'Vocabulary check.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000004'::uuid, 'teacher03@pineexam.test', 'Орос хэл', 'fill_blank',
      'Привет гэдэг үгийн утгыг нөхөж бич.', null, null, null, 'Сайн уу',
      1::numeric, 'easy', array['russian','basics']::text[], 'Суурь мэндчилгээ.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000005'::uuid, 'teacher04@pineexam.test', 'Физик', 'multiple_choice',
      'Ажлын нэгж аль нь вэ?', null, null, '["Жоуль","Ньютон","Кельвин","Метр"]'::jsonb, 'Жоуль',
      2::numeric, 'medium', array['work-energy']::text[], 'Ажлын нэгж = Жоуль.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000006'::uuid, 'teacher05@pineexam.test', 'Хими', 'multiple_choice',
      'Which are acids?', null, null, '["HCl","NaOH","H2SO4","KCl"]'::jsonb, '"HCl"',
      3::numeric, 'medium', array['acids','bases']::text[], 'Acid recognition.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000007'::uuid, 'teacher06@pineexam.test', 'Биологи', 'multiple_choice',
      'Cell-ийн energy center аль нь вэ?', null, null, '["Mitochondria","Nucleus","Membrane","Ribosome"]'::jsonb, 'Mitochondria',
      2::numeric, 'easy', array['cell']::text[], 'Mitochondria = powerhouse.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000008'::uuid, 'teacher07@pineexam.test', 'Түүх', 'essay',
      'Их Монгол улсын өргөжилтийн 2 шалтгааныг тайлбарла.', null, null, null, null,
      5::numeric, 'hard', array['mongol-empire']::text[], 'Шалтгаан ба үр дагаврыг үнэлнэ.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000009'::uuid, 'teacher08@pineexam.test', 'Нийгэм судлал', 'essay',
      'Иргэний оролцооны нэг бодит жишээ бич.', null, null, null, null,
      4::numeric, 'medium', array['civics']::text[], 'Нийгмийн оролцоог хэмжинэ.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000010'::uuid, 'teacher09@pineexam.test', 'Мэдээлэл зүй', 'essay',
      'Variable болон Loop гэсэн нэр томьёонуудыг тайлбарла.', null, null,
      null,
      null,
      2::numeric, 'easy', array['programming','logic']::text[], 'Basic CS terms.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000011'::uuid, 'teacher10@pineexam.test', 'Газарзүй', 'multiple_choice',
      'Монгол орны хамгийн урт гол аль нь вэ?', null, null, '["Орхон","Сэлэнгэ","Хэрлэн","Туул"]'::jsonb, 'Орхон',
      2::numeric, 'medium', array['mongolia','rivers']::text[], 'Орхон гол.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000012'::uuid, 'teacher08@pineexam.test', 'Иргэний ёс зүй', 'multiple_choice',
      'Багаар ажиллахад хамгийн чухал үнэт зүйл аль нь вэ?', null, null,
      '["Хүндлэл","Маргаан","Хойрго байдал","Хардалт"]'::jsonb, 'Хүндлэл',
      1::numeric, 'easy', array['ethics','teamwork']::text[], 'Хүндлэл, хамтын ажиллагаа.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000013'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_response',
      'Квадрат функцийн зөв шинжүүдийг бүгдийг нь сонго.', '<p>$$y = ax^2 + bx + c$$ функцтэй холбоотой зөв ойлголтуудыг сонго.</p>', null,
      '["Парабол хэлбэртэй","Симметрийн тэнхлэгтэй","Шулуун шугам болно","Орой цэгтэй"]'::jsonb, '["Парабол хэлбэртэй","Симметрийн тэнхлэгтэй","Орой цэгтэй"]',
      3::numeric, 'medium', array['quadratic','grade-10']::text[], 'Квадрат функцийн үндсэн шинжүүд.', 2
    ),
    (
      '80000000-0000-0000-0000-000000000014'::uuid, 'teacher01@pineexam.test', 'Математик', 'matching',
      'Томьёо ба утгыг зөв холбо.', null, null,
      '["2^3|||8","3^2|||9","√16|||4"]'::jsonb, '[{"left":"2^3","right":"8"},{"left":"3^2","right":"9"},{"left":"√16","right":"4"}]',
      3::numeric, 'easy', array['powers','roots']::text[], 'Зэрэг ба язгуурын ойлголт.', 1
    ),
    (
      '80000000-0000-0000-0000-000000000015'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_choice',
      'RAM санах ой юунд ашиглагддаг вэ?', '<p>Компьютерийн <strong>RAM</strong> нь ямар үүрэгтэй вэ?</p>', null,
      '["Түр хадгалалт","Байнгын хадгалалт","Зураг хэвлэх","Дуу өсгөх"]'::jsonb, 'Түр хадгалалт',
      2::numeric, 'easy', array['hardware','memory']::text[], 'RAM нь түр хадгалалтын санах ой.', 4
    ),
    (
      '80000000-0000-0000-0000-000000000016'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'fill_blank',
      'Binary тооллын системд зөвхөн ____ болон ____ гэсэн хоёр тэмдэг ашиглана.', null, null, null, '0,1',
      2::numeric, 'easy', array['binary','logic']::text[], 'Хоёртын системийн суурь ойлголт.', 3
    ),
    (
      '80000000-0000-0000-0000-000000000017'::uuid, 'admin@pineexam.test', 'Мэдээлэл зүй', 'multiple_response',
      'Алгоритмын үндсэн бүтэц аль нь вэ?', '<p>Суурь 3 бүтцийг сонгоно уу.</p>', null,
      '["Дараалал","Салаалалт","Давталт","Зураг будах"]'::jsonb, '["Дараалал","Салаалалт","Давталт"]',
      3::numeric, 'medium', array['algorithm','curated']::text[], 'Алгоритмын үндсэн бүтцүүд.', 6
    ),
    (
      '80000000-0000-0000-0000-000000000018'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'Зурагт аль график нь парабол вэ?', '<p>Доорх зурагт харуулсан нум хэлбэрийн графикийг ажигла.</p>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="280" height="150" viewBox="0 0 280 150"><rect width="280" height="150" fill="%23f8fafc"/><line x1="30" y1="120" x2="250" y2="120" stroke="%23334155" stroke-width="2"/><line x1="50" y1="20" x2="50" y2="130" stroke="%23334155" stroke-width="2"/><path d="M90 120 Q150 30 210 120" fill="none" stroke="%230f766e" stroke-width="4"/></svg>',
      '["Парабол","Шулуун","Тойрог","Синус"]'::jsonb, 'Парабол',
      2::numeric, 'easy', array['graph','visual']::text[], 'Зураг дээрх график нь парабол.', 2
    )
) as v(id, teacher_email, subject_name, type, content, content_html, image_url, options, correct_answer, points, difficulty, tags, explanation, usage_count)
join public.subjects s on s.name = v.subject_name
join tmp_seed_users u on u.email = v.teacher_email
on conflict (id) do update
set
  subject_id = excluded.subject_id,
  created_by = excluded.created_by,
  type = excluded.type,
  content = excluded.content,
  content_html = excluded.content_html,
  image_url = excluded.image_url,
  options = excluded.options,
  correct_answer = excluded.correct_answer,
  points = excluded.points,
  difficulty = excluded.difficulty,
  tags = excluded.tags,
  explanation = excluded.explanation,
  usage_count = excluded.usage_count,
  updated_at = now();

-- question_bank INSERT дууссаны дараа source_question_bank_id backfill
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'questions' and column_name = 'source_question_bank_id'
  ) then
    update public.questions
    set source_question_bank_id = v.qb_id
    from (values
      ('70000000-0000-0000-0000-000000000023'::uuid, '80000000-0000-0000-0000-000000000014'::uuid),
      ('70000000-0000-0000-0000-000000000035'::uuid, '80000000-0000-0000-0000-000000000020'::uuid),
      ('70000000-0000-0000-0000-000000000036'::uuid, '80000000-0000-0000-0000-000000000022'::uuid),
      ('70000000-0000-0000-0000-000000000037'::uuid, '80000000-0000-0000-0000-000000000023'::uuid),
      ('70000000-0000-0000-0000-000000000038'::uuid, '80000000-0000-0000-0000-000000000028'::uuid),
      ('70000000-0000-0000-0000-000000000039'::uuid, '80000000-0000-0000-0000-000000000026'::uuid),
      ('70000000-0000-0000-0000-000000000040'::uuid, '80000000-0000-0000-0000-000000000017'::uuid),
      ('70000000-0000-0000-0000-000000000041'::uuid, '80000000-0000-0000-0000-000000000029'::uuid)
    ) as v(q_id, qb_id)
    where questions.id = v.q_id
      and exists (select 1 from public.question_bank where id = v.qb_id);
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_bank'
      and column_name = 'visibility'
  ) then
    update public.question_bank
    set
      visibility = 'admin_curated',
      last_used_at = now() - interval '3 day'
    where id in (
      '80000000-0000-0000-0000-000000000001'::uuid,
      '80000000-0000-0000-0000-000000000013'::uuid,
      '80000000-0000-0000-0000-000000000015'::uuid,
      '80000000-0000-0000-0000-000000000018'::uuid,
      '80000000-0000-0000-0000-000000000005'::uuid,
      '80000000-0000-0000-0000-000000000007'::uuid
    );

    update public.question_bank
    set
      visibility = 'admin_curated',
      last_used_at = now() - interval '1 day'
    where id in (
      '80000000-0000-0000-0000-000000000003'::uuid,
      '80000000-0000-0000-0000-000000000010'::uuid,
      '80000000-0000-0000-0000-000000000017'::uuid
    );

    update public.question_bank
    set
      visibility = 'admin_curated',
      last_used_at = now() - interval '6 day'
    where id in (
      '80000000-0000-0000-0000-000000000006'::uuid,
      '80000000-0000-0000-0000-000000000014'::uuid,
      '80000000-0000-0000-0000-000000000016'::uuid
    );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_bank'
      and column_name = 'grade_level'
  ) then
    update public.question_bank
    set
      grade_level = case id
        when '80000000-0000-0000-0000-000000000001'::uuid then 10
        when '80000000-0000-0000-0000-000000000013'::uuid then 10
        when '80000000-0000-0000-0000-000000000014'::uuid then 10
        when '80000000-0000-0000-0000-000000000015'::uuid then 10
        when '80000000-0000-0000-0000-000000000016'::uuid then 10
        when '80000000-0000-0000-0000-000000000017'::uuid then 10
        when '80000000-0000-0000-0000-000000000018'::uuid then 10
        else grade_level
      end,
      subtopic = case id
        when '80000000-0000-0000-0000-000000000001'::uuid then 'Тригонометр'
        when '80000000-0000-0000-0000-000000000013'::uuid then 'Квадрат функц'
        when '80000000-0000-0000-0000-000000000014'::uuid then 'Зэрэг ба язгуур'
        when '80000000-0000-0000-0000-000000000015'::uuid then 'Компьютерын үндэс'
        when '80000000-0000-0000-0000-000000000016'::uuid then 'Тооллын систем'
        when '80000000-0000-0000-0000-000000000017'::uuid then 'Алгоритм'
        when '80000000-0000-0000-0000-000000000018'::uuid then 'Функцийн график'
        else subtopic
      end,
      difficulty_level = case id
        when '80000000-0000-0000-0000-000000000001'::uuid then 1
        when '80000000-0000-0000-0000-000000000013'::uuid then 2
        when '80000000-0000-0000-0000-000000000014'::uuid then 1
        when '80000000-0000-0000-0000-000000000015'::uuid then 1
        when '80000000-0000-0000-0000-000000000016'::uuid then 1
        when '80000000-0000-0000-0000-000000000017'::uuid then 2
        when '80000000-0000-0000-0000-000000000018'::uuid then 2
        else difficulty_level
      end
    where id in (
      '80000000-0000-0000-0000-000000000001'::uuid,
      '80000000-0000-0000-0000-000000000013'::uuid,
      '80000000-0000-0000-0000-000000000014'::uuid,
      '80000000-0000-0000-0000-000000000015'::uuid,
      '80000000-0000-0000-0000-000000000016'::uuid,
      '80000000-0000-0000-0000-000000000017'::uuid,
      '80000000-0000-0000-0000-000000000018'::uuid
    );
  end if;
end $$;

do $$
declare
  v_admin_id uuid;
  v_math_id uuid;
  v_it_id uuid;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'sample_exams'
  ) then
    select id into v_admin_id from public.profiles where email = 'admin@pineexam.test';
    select id into v_math_id from public.subjects where name = 'Математик';
    select id into v_it_id from public.subjects where name = 'Мэдээлэл зүй';

    insert into public.sample_exams (
      id,
      title,
      description,
      subject_id,
      grade_level,
      subtopic,
      difficulty_level,
      duration_minutes,
      question_count,
      total_points,
      created_by
    )
    values
      (
        '81000000-0000-0000-0000-000000000001'::uuid,
        '10-р анги · Тригонометр ба зэрэг',
        'Суурь ойлголтыг шалгах жишиг шалгалт.',
        v_math_id,
        10,
        'Тригонометр',
        1,
        35,
        2,
        5,
        v_admin_id
      ),
      (
        '81000000-0000-0000-0000-000000000002'::uuid,
        '10-р анги · Квадрат функц ба график',
        'Функцийн хэлбэр, графикийг хамарсан жишиг шалгалт.',
        v_math_id,
        10,
        'Квадрат функц',
        2,
        40,
        2,
        5,
        v_admin_id
      ),
      (
        '81000000-0000-0000-0000-000000000003'::uuid,
        '10-р анги · Алгоритм ба компьютерын үндэс',
        'Мэдээлэл зүйн жишиг шалгалт.',
        v_it_id,
        10,
        'Алгоритм',
        2,
        45,
        3,
        7,
        v_admin_id
      )
    on conflict (id) do update
    set
      title = excluded.title,
      description = excluded.description,
      subject_id = excluded.subject_id,
      grade_level = excluded.grade_level,
      subtopic = excluded.subtopic,
      difficulty_level = excluded.difficulty_level,
      duration_minutes = excluded.duration_minutes,
      question_count = excluded.question_count,
      total_points = excluded.total_points,
      created_by = excluded.created_by,
      updated_at = now();

    delete from public.sample_exam_items
    where sample_exam_id in (
      '81000000-0000-0000-0000-000000000001'::uuid,
      '81000000-0000-0000-0000-000000000002'::uuid,
      '81000000-0000-0000-0000-000000000003'::uuid
    );

    insert into public.sample_exam_items (
      id,
      sample_exam_id,
      question_bank_id,
      order_index
    )
    values
      ('82000000-0000-0000-0000-000000000001'::uuid, '81000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000001'::uuid, 0),
      ('82000000-0000-0000-0000-000000000002'::uuid, '81000000-0000-0000-0000-000000000001'::uuid, '80000000-0000-0000-0000-000000000014'::uuid, 1),
      ('82000000-0000-0000-0000-000000000003'::uuid, '81000000-0000-0000-0000-000000000002'::uuid, '80000000-0000-0000-0000-000000000013'::uuid, 0),
      ('82000000-0000-0000-0000-000000000004'::uuid, '81000000-0000-0000-0000-000000000002'::uuid, '80000000-0000-0000-0000-000000000018'::uuid, 1),
      ('82000000-0000-0000-0000-000000000005'::uuid, '81000000-0000-0000-0000-000000000003'::uuid, '80000000-0000-0000-0000-000000000015'::uuid, 0),
      ('82000000-0000-0000-0000-000000000006'::uuid, '81000000-0000-0000-0000-000000000003'::uuid, '80000000-0000-0000-0000-000000000016'::uuid, 1),
      ('82000000-0000-0000-0000-000000000007'::uuid, '81000000-0000-0000-0000-000000000003'::uuid, '80000000-0000-0000-0000-000000000017'::uuid, 2)
    on conflict (id) do update
    set
      sample_exam_id = excluded.sample_exam_id,
      question_bank_id = excluded.question_bank_id,
      order_index = excluded.order_index;
  end if;
end $$;

-- -------------------------------------------------
-- Additional curated bank items for Student Learning Hub demo
-- -------------------------------------------------
insert into public.question_bank (
  id,
  subject_id,
  created_by,
  type,
  content,
  content_html,
  image_url,
  options,
  correct_answer,
  points,
  difficulty,
  tags,
  explanation,
  usage_count,
  created_at,
  updated_at
)
select
  v.id,
  s.id,
  u.id,
  v.type,
  v.content,
  v.content_html,
  v.image_url,
  v.options,
  v.correct_answer,
  v.points,
  v.difficulty,
  v.tags,
  v.explanation,
  v.usage_count,
  now(),
  now()
from (
  values
    (
      '80000000-0000-0000-0000-000000000019'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'cos 60° хэдтэй тэнцүү вэ?', '<p>$$\\cos 60^\\circ$$ хэд вэ?</p>', null,
      '["1/2","0","1","√3/2"]'::jsonb, '1/2',
      2::numeric, 'easy', array['trigonometry','grade-10']::text[], 'Суурь тригонометрийн утга.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000020'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'y = x^2 - 6x + 5 функцийн оройн x координат хэд вэ?', '<p>$$y = x^2 - 6x + 5$$ функцийн оройн <strong>x</strong> координатыг ол.</p>', null,
      '["2","3","5","6"]'::jsonb, '3',
      2::numeric, 'medium', array['quadratic','vertex']::text[], 'Оройн x координат нь $$-b/2a$$ томьёогоор 3 гарна.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000021'::uuid, 'teacher01@pineexam.test', 'Математик', 'fill_blank',
      '|-7| = ____', '<p>Абсолют утгыг нөхөж бич: $$|-7| =$$ ____</p>', null,
      null, '7',
      1::numeric, 'easy', array['absolute-value']::text[], 'Абсолют утга үргэлж эерэг байна.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000022'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'y = 3x - 4 шулууны налалт хэд вэ?', '<p>$$y = 3x - 4$$ шулууны налалтыг ол.</p>', null,
      '["-4","3","4","-3"]'::jsonb, '3',
      2::numeric, 'easy', array['linear-function','slope']::text[], 'Шулууны налалт нь x-ийн коэффициент байдаг.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000023'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_response',
      'Зөв тэнцэтгэлүүдийг бүгдийг нь сонго.', '<p>Зэрэг ба язгууртай холбоотой зөв тэнцэтгэлүүдийг сонго.</p>', null,
      '["√25 = 5","2^4 = 8","3^2 = 9","√9 = 4"]'::jsonb, '["√25 = 5","3^2 = 9"]',
      3::numeric, 'medium', array['powers','roots']::text[], 'Зөв хариултууд нь √25 = 5, 3^2 = 9.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000024'::uuid, 'teacher01@pineexam.test', 'Математик', 'multiple_choice',
      'f(x)=x^2 функцийн график ямар хэлбэртэй вэ?', '<p>$$f(x)=x^2$$ функцийн график ямар хэлбэртэй вэ?</p>', null,
      '["Парабол","Шулуун","Гипербол","Тойрог"]'::jsonb, 'Парабол',
      2::numeric, 'easy', array['graph','quadratic']::text[], 'x^2 функцийн график нь парабол байдаг.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000025'::uuid, 'teacher01@pineexam.test', 'Математик', 'matching',
      'Шугаман функцийн ойлголтуудыг зөв холбо.', null, null,
      '["Налалт|||x-ийн коэффициент","y-огтлолцол|||чөлөөт гишүүн","Шулуун|||графикийн хэлбэр"]'::jsonb, '[{"left":"Налалт","right":"x-ийн коэффициент"},{"left":"y-огтлолцол","right":"чөлөөт гишүүн"},{"left":"Шулуун","right":"графикийн хэлбэр"}]',
      3::numeric, 'medium', array['linear-function','matching']::text[], 'Шугаман функцийн үндсэн ойлголтуудыг холбох асуулт.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000026'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_choice',
      '1011 хоёртын тоо аравтын системд хэд вэ?', '<p>$$1011_2$$ тоог аравтын системд хөрвүүл.</p>', null,
      '["9","10","11","12"]'::jsonb, '11',
      2::numeric, 'easy', array['binary','conversion']::text[], '1011₂ = 8 + 2 + 1 = 11.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000027'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'fill_blank',
      'Алгоритмын эхний алхам нь асуудлыг ____ байдаг.', null, null,
      null, 'тодорхойлох',
      2::numeric, 'easy', array['algorithm','basics']::text[], 'Алгоритм эхлэхийн өмнө асуудлаа тодорхойлдог.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000028'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_choice',
      'CPU-ийн үндсэн үүрэг аль нь вэ?', '<p>CPU буюу процессорын үндсэн үүргийг сонго.</p>', null,
      '["Тооцоолол гүйцэтгэх","Дуу өсгөх","Зураг хэвлэх","Цахилгаан хадгалах"]'::jsonb, 'Тооцоолол гүйцэтгэх',
      2::numeric, 'easy', array['hardware','cpu']::text[], 'CPU нь үндсэн тооцоолол, боловсруулалт хийдэг.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000029'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_response',
      'Програмчлалын үндсэн ойлголтуудыг сонго.', '<p>Доорх ойлголтуудаас програмчлалд хамаарахыг бүгдийг нь сонго.</p>', null,
      '["Variable","Loop","Condition","Monitor"]'::jsonb, '["Variable","Loop","Condition"]',
      3::numeric, 'medium', array['programming','logic']::text[], 'Variable, loop, condition нь программын суурь ойлголтууд.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000030'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'matching',
      'Компьютерийн төхөөрөмж ба үүргийг зөв холбо.', null, null,
      '["RAM|||түр хадгална","SSD|||байнгын хадгална","CPU|||тооцоолол гүйцэтгэнэ"]'::jsonb, '[{"left":"RAM","right":"түр хадгална"},{"left":"SSD","right":"байнгын хадгална"},{"left":"CPU","right":"тооцоолол гүйцэтгэнэ"}]',
      3::numeric, 'medium', array['hardware','matching']::text[], 'Төхөөрөмжүүдийн үндсэн үүргийг холбох асуулт.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000031'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_choice',
      'repeat until блок ямар бүтэц вэ?', '<p>Scratch-ийн <strong>repeat until</strong> блок ямар бүтэц вэ?</p>', null,
      '["Давталт","Салаалалт","Оролт","Гаралт"]'::jsonb, 'Давталт',
      2::numeric, 'easy', array['algorithm','loops']::text[], 'repeat until нь давталтын бүтэц.', 0
    ),
    (
      '80000000-0000-0000-0000-000000000032'::uuid, 'teacher01@pineexam.test', 'Мэдээлэл зүй', 'multiple_response',
      'Хоёртын системд ашиглагдах тэмдгүүдийг сонго.', '<p>Хоёртын системийн зөв тэмдгүүдийг сонгоно уу.</p>', null,
      '["0","1","2","A"]'::jsonb, '["0","1"]',
      2::numeric, 'easy', array['binary','digits']::text[], 'Хоёртын системд зөвхөн 0 ба 1 ашиглана.', 0
    )
) as v(id, teacher_email, subject_name, type, content, content_html, image_url, options, correct_answer, points, difficulty, tags, explanation, usage_count)
join public.subjects s on s.name = v.subject_name
join tmp_seed_users u on u.email = v.teacher_email
on conflict (id) do update
set
  subject_id = excluded.subject_id,
  created_by = excluded.created_by,
  type = excluded.type,
  content = excluded.content,
  content_html = excluded.content_html,
  image_url = excluded.image_url,
  options = excluded.options,
  correct_answer = excluded.correct_answer,
  points = excluded.points,
  difficulty = excluded.difficulty,
  tags = excluded.tags,
  explanation = excluded.explanation,
  usage_count = excluded.usage_count,
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_bank'
      and column_name = 'visibility'
  ) then
    update public.question_bank
    set
      visibility = 'admin_curated',
      last_used_at = now() - interval '12 hour'
    where id in (
      '80000000-0000-0000-0000-000000000019'::uuid,
      '80000000-0000-0000-0000-000000000020'::uuid,
      '80000000-0000-0000-0000-000000000021'::uuid,
      '80000000-0000-0000-0000-000000000022'::uuid,
      '80000000-0000-0000-0000-000000000023'::uuid,
      '80000000-0000-0000-0000-000000000024'::uuid,
      '80000000-0000-0000-0000-000000000025'::uuid,
      '80000000-0000-0000-0000-000000000026'::uuid,
      '80000000-0000-0000-0000-000000000027'::uuid,
      '80000000-0000-0000-0000-000000000028'::uuid,
      '80000000-0000-0000-0000-000000000029'::uuid,
      '80000000-0000-0000-0000-000000000030'::uuid,
      '80000000-0000-0000-0000-000000000031'::uuid,
      '80000000-0000-0000-0000-000000000032'::uuid
    );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'question_bank'
      and column_name = 'grade_level'
  ) then
    update public.question_bank
    set
      grade_level = 10,
      difficulty_level = case id
        when '80000000-0000-0000-0000-000000000020'::uuid then 2
        when '80000000-0000-0000-0000-000000000023'::uuid then 2
        when '80000000-0000-0000-0000-000000000025'::uuid then 2
        when '80000000-0000-0000-0000-000000000029'::uuid then 2
        when '80000000-0000-0000-0000-000000000030'::uuid then 2
        else 1
      end,
      subtopic = case id
        when '80000000-0000-0000-0000-000000000019'::uuid then 'Тригонометр'
        when '80000000-0000-0000-0000-000000000020'::uuid then 'Квадрат функц'
        when '80000000-0000-0000-0000-000000000021'::uuid then 'Абсолют утга'
        when '80000000-0000-0000-0000-000000000022'::uuid then 'Шугаман функц'
        when '80000000-0000-0000-0000-000000000023'::uuid then 'Зэрэг ба язгуур'
        when '80000000-0000-0000-0000-000000000024'::uuid then 'Функцийн график'
        when '80000000-0000-0000-0000-000000000025'::uuid then 'Шугаман функц'
        when '80000000-0000-0000-0000-000000000026'::uuid then 'Тооллын систем'
        when '80000000-0000-0000-0000-000000000027'::uuid then 'Алгоритм'
        when '80000000-0000-0000-0000-000000000028'::uuid then 'Компьютерын үндэс'
        when '80000000-0000-0000-0000-000000000029'::uuid then 'Програмчлалын ойлголт'
        when '80000000-0000-0000-0000-000000000030'::uuid then 'Компьютерын үндэс'
        when '80000000-0000-0000-0000-000000000031'::uuid then 'Алгоритм'
        when '80000000-0000-0000-0000-000000000032'::uuid then 'Тооллын систем'
        else subtopic
      end
    where id in (
      '80000000-0000-0000-0000-000000000019'::uuid,
      '80000000-0000-0000-0000-000000000020'::uuid,
      '80000000-0000-0000-0000-000000000021'::uuid,
      '80000000-0000-0000-0000-000000000022'::uuid,
      '80000000-0000-0000-0000-000000000023'::uuid,
      '80000000-0000-0000-0000-000000000024'::uuid,
      '80000000-0000-0000-0000-000000000025'::uuid,
      '80000000-0000-0000-0000-000000000026'::uuid,
      '80000000-0000-0000-0000-000000000027'::uuid,
      '80000000-0000-0000-0000-000000000028'::uuid,
      '80000000-0000-0000-0000-000000000029'::uuid,
      '80000000-0000-0000-0000-000000000030'::uuid,
      '80000000-0000-0000-0000-000000000031'::uuid,
      '80000000-0000-0000-0000-000000000032'::uuid
    );
  end if;
end $$;

-- -------------------------------------------------
-- Sessions, answers, and proctor events
-- -------------------------------------------------
insert into public.exam_sessions (
  id,
  exam_id,
  user_id,
  status,
  started_at,
  submitted_at,
  total_score,
  max_score,
  attempt_number
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000031',
    'graded',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 48 minutes',
    7.5,
    10,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000036',
    'submitted',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 05 minutes',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 57 minutes',
    4,
    10,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000021',
    'graded',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 45 minutes',
    8,
    10,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000041',
    'in_progress',
    now() - interval '18 minutes',
    null,
    null,
    null,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000026',
    'submitted',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 05 minutes',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 50 minutes',
    5,
    10,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000050',
    'graded',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 03 minutes',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 41 minutes',
    12,
    13,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000050',
    'submitted',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 02 minutes',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 31 minutes',
    6,
    10,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000008',
    '50000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000046',
    'submitted',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 05 minutes',
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 34 minutes',
    3,
    10,
    1
  )
on conflict (id) do update
set
  status = excluded.status,
  started_at = excluded.started_at,
  submitted_at = excluded.submitted_at,
  total_score = excluded.total_score,
  max_score = excluded.max_score;

insert into public.answers (
  id,
  session_id,
  question_id,
  user_id,
  answer,
  is_correct,
  score,
  graded_by,
  graded_at,
  feedback,
  submitted_at
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000031',
    'Ньютон',
    true,
    2,
    '20000000-0000-0000-0000-000000000004',
    date_trunc('day', now()) - interval '5 day' + interval '10 hours 15 minutes',
    'Зөв',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 20 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000031',
    '8',
    true,
    3,
    '20000000-0000-0000-0000-000000000004',
    date_trunc('day', now()) - interval '5 day' + interval '10 hours 15 minutes',
    'Тооцоо зөв.',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 25 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000031',
    'Хурд нь хугацаанд туулсан зам, харин хурдатгал нь хурд хэр хурдан өөрчлөгдөхийг илэрхийлнэ.',
    null,
    2.5,
    '20000000-0000-0000-0000-000000000004',
    date_trunc('day', now()) - interval '5 day' + interval '10 hours 20 minutes',
    'Гол санаа зөв боловч жишээ дутуу.',
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 40 minutes'
  ),

  (
    '61000000-0000-0000-0000-000000000004',
    '60000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000036',
    'Жоуль',
    false,
    0,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 30 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000005',
    '60000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000036',
    '8',
    true,
    3,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 38 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000006',
    '60000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000036',
    'Хурд бол хөдөлгөөний хэмжээ.',
    null,
    null,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '5 day' + interval '09 hours 52 minutes'
  ),

  (
    '61000000-0000-0000-0000-000000000007',
    '60000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000021',
    'To reduce waste and plant trees',
    true,
    3,
    '20000000-0000-0000-0000-000000000003',
    date_trunc('day', now()) - interval '1 day' + interval '12 hours 10 minutes',
    'Correct.',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 20 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000008',
    '60000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000021',
    'We can organize a weekly recycling box in every classroom.',
    null,
    3,
    '20000000-0000-0000-0000-000000000003',
    date_trunc('day', now()) - interval '1 day' + interval '12 hours 12 minutes',
    'Practical and clear suggestion.',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 35 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000009',
    '60000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000021',
    '[{"left":"reduce","right":"make smaller"},{"left":"encourage","right":"give support"},{"left":"waste","right":"unused material"}]',
    true,
    2,
    '20000000-0000-0000-0000-000000000003',
    date_trunc('day', now()) - interval '1 day' + interval '12 hours 12 minutes',
    'Vocabulary matching correct.',
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 42 minutes'
  ),

  (
    '61000000-0000-0000-0000-000000000010',
    '60000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000041',
    'H2O',
    true,
    2,
    null,
    null,
    null,
    now() - interval '10 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000011',
    '60000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000041',
    '["Burning paper"]',
    null,
    null,
    null,
    null,
    null,
    now() - interval '6 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000012',
    '60000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000026',
    'To reduce waste and plant trees',
    true,
    3,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 23 minutes'
  ),

  (
    '61000000-0000-0000-0000-000000000013',
    '60000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000020',
    '30000000-0000-0000-0000-000000000050',
    '7',
    true,
    2,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '3 day' + interval '15 hours',
    'Тооцоо зөв.',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 15 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000014',
    '60000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000021',
    '30000000-0000-0000-0000-000000000050',
    '4',
    true,
    1,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '3 day' + interval '15 hours',
    'Зөв.',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 18 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000015',
    '60000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000022',
    '30000000-0000-0000-0000-000000000050',
    '["2","3","5"]',
    true,
    3,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '3 day' + interval '15 hours 01 minutes',
    'Анхны тоонуудыг зөв сонгосон.',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 25 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000016',
    '60000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000023',
    '30000000-0000-0000-0000-000000000050',
    '{"2^3":"8","3^2":"9","√16":"4"}',
    true,
    3,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '3 day' + interval '15 hours 01 minutes',
    'Бүгд зөв.',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 31 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000017',
    '60000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000024',
    '30000000-0000-0000-0000-000000000050',
    'Хүснэгтийн хамгийн бага y утгыг ажиглаад тухайн x дээр орой байрлаж байгааг тайлбарлаж болно.',
    null,
    3,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '3 day' + interval '15 hours 08 minutes',
    'Гол санаа зөв, жишээ нэмж болно.',
    date_trunc('day', now()) - interval '3 day' + interval '14 hours 37 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000018',
    '60000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000026',
    '30000000-0000-0000-0000-000000000050',
    'Оюунаа',
    true,
    2,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 12 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000019',
    '60000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000027',
    '30000000-0000-0000-0000-000000000050',
    '{"Loop":"давталт","Sprite":"харагдах дүр","Variable":"утга хадгална"}',
    true,
    3,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 18 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000020',
    '60000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000028',
    '30000000-0000-0000-0000-000000000050',
    'Loop ашиглавал ижил үйлдлийг олон давтахдаа кодыг товч, алдаа багатай бичиж болно.',
    null,
    null,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 25 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000021',
    '60000000-0000-0000-0000-000000000007',
    '70000000-0000-0000-0000-000000000029',
    '30000000-0000-0000-0000-000000000050',
    '5',
    true,
    1,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 29 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000022',
    '60000000-0000-0000-0000-000000000008',
    '70000000-0000-0000-0000-000000000026',
    '30000000-0000-0000-0000-000000000046',
    'Тэмүүжин',
    false,
    0,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 14 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000023',
    '60000000-0000-0000-0000-000000000008',
    '70000000-0000-0000-0000-000000000027',
    '30000000-0000-0000-0000-000000000046',
    '{"Loop":"давталт","Sprite":"харагдах дүр","Variable":"утга хадгална"}',
    true,
    3,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 21 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000024',
    '60000000-0000-0000-0000-000000000008',
    '70000000-0000-0000-0000-000000000028',
    '30000000-0000-0000-0000-000000000046',
    'Loop ашиглахад нэг кодоо олон давтаж бичихгүй байхад тусалдаг.',
    null,
    null,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 27 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000025',
    '60000000-0000-0000-0000-000000000008',
    '70000000-0000-0000-0000-000000000029',
    '30000000-0000-0000-0000-000000000046',
    '3',
    false,
    0,
    null,
    null,
    null,
    date_trunc('day', now()) - interval '1 day' + interval '10 hours 30 minutes'
  )
on conflict (id) do update
set
  answer = excluded.answer,
  is_correct = excluded.is_correct,
  score = excluded.score,
  graded_by = excluded.graded_by,
  graded_at = excluded.graded_at,
  feedback = excluded.feedback,
  submitted_at = excluded.submitted_at;

insert into public.exam_sessions (
  id,
  exam_id,
  user_id,
  status,
  started_at,
  submitted_at,
  total_score,
  max_score,
  attempt_number
)
values
  (
    '60000000-0000-0000-0000-000000000009',
    '50000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000050',
    'graded',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 04 minutes',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 39 minutes',
    4,
    12,
    1
  ),
  (
    '60000000-0000-0000-0000-000000000010',
    '50000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000050',
    'graded',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 03 minutes',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 31 minutes',
    3,
    12,
    1
  )
on conflict (id) do update
set
  status = excluded.status,
  started_at = excluded.started_at,
  submitted_at = excluded.submitted_at,
  total_score = excluded.total_score,
  max_score = excluded.max_score,
  attempt_number = excluded.attempt_number;

insert into public.answers (
  id,
  session_id,
  question_id,
  user_id,
  answer,
  is_correct,
  score,
  graded_by,
  graded_at,
  feedback,
  submitted_at
)
values
  (
    '61000000-0000-0000-0000-000000000026',
    '60000000-0000-0000-0000-000000000009',
    '70000000-0000-0000-0000-000000000033',
    '30000000-0000-0000-0000-000000000050',
    '√3',
    false,
    0,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '8 day' + interval '14 hours',
    'Тригонометрийн нэгж тойргийг дахин давтах хэрэгтэй.',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 11 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000027',
    '60000000-0000-0000-0000-000000000009',
    '70000000-0000-0000-0000-000000000034',
    '30000000-0000-0000-0000-000000000050',
    '1',
    false,
    0,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '8 day' + interval '14 hours',
    'График ба тэгшитгэлийн шийдлийн холбоог анхаар.',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 16 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000028',
    '60000000-0000-0000-0000-000000000009',
    '70000000-0000-0000-0000-000000000035',
    '30000000-0000-0000-0000-000000000050',
    '2',
    false,
    1,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '8 day' + interval '14 hours 01 minutes',
    'Оройн томьёог бараг зөв хэрэглэсэн ч тооцооны алдаа гарсан.',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 21 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000029',
    '60000000-0000-0000-0000-000000000009',
    '70000000-0000-0000-0000-000000000036',
    '30000000-0000-0000-0000-000000000050',
    '4',
    false,
    1,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '8 day' + interval '14 hours 02 minutes',
    'Налалтын ойлголтыг мэдэж байгаа ч x-ийн коэффициентийг андуурсан.',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 27 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000030',
    '60000000-0000-0000-0000-000000000009',
    '70000000-0000-0000-0000-000000000037',
    '30000000-0000-0000-0000-000000000050',
    '{"2^4":"16","√25":"5","3^2":"8"}',
    false,
    2,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '8 day' + interval '14 hours 03 minutes',
    'Зөв холбоосуудын ихэнхийг олсон ч нэгийг нь буруу холбоод алдсан.',
    date_trunc('day', now()) - interval '8 day' + interval '13 hours 34 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000031',
    '60000000-0000-0000-0000-000000000010',
    '70000000-0000-0000-0000-000000000038',
    '30000000-0000-0000-0000-000000000050',
    'Тооцоолол гүйцэтгэх',
    true,
    2,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '6 day' + interval '10 hours',
    'Процессорын үндсэн үүргийг зөв мэдэж байна.',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 10 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000032',
    '60000000-0000-0000-0000-000000000010',
    '70000000-0000-0000-0000-000000000039',
    '30000000-0000-0000-0000-000000000050',
    '8',
    false,
    0,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '6 day' + interval '10 hours 01 minutes',
    'Хоёртын тоог аравтын системд хөрвүүлэх дасгал шаардлагатай.',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 15 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000033',
    '60000000-0000-0000-0000-000000000010',
    '70000000-0000-0000-0000-000000000040',
    '30000000-0000-0000-0000-000000000050',
    '["Дараалал","Давталт"]',
    false,
    0,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '6 day' + interval '10 hours 02 minutes',
    'Алгоритмын 3 үндсэн бүтцийг бүтнээр нь санах хэрэгтэй.',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 19 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000034',
    '60000000-0000-0000-0000-000000000010',
    '70000000-0000-0000-0000-000000000041',
    '30000000-0000-0000-0000-000000000050',
    'Команд',
    false,
    0,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '6 day' + interval '10 hours 03 minutes',
    'Variable ба command-ийг андуурсан байна.',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 24 minutes'
  ),
  (
    '61000000-0000-0000-0000-000000000035',
    '60000000-0000-0000-0000-000000000010',
    '70000000-0000-0000-0000-000000000042',
    '30000000-0000-0000-0000-000000000050',
    'Flowchart нь алгоритмын дарааллыг дүрсээр харахад тусалдаг.',
    null,
    1,
    '20000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) - interval '6 day' + interval '10 hours 05 minutes',
    'Гол санааг зөв хэлсэн ч жишээ дутуу байна.',
    date_trunc('day', now()) - interval '6 day' + interval '09 hours 28 minutes'
  )
on conflict (id) do update
set
  answer = excluded.answer,
  is_correct = excluded.is_correct,
  score = excluded.score,
  graded_by = excluded.graded_by,
  graded_at = excluded.graded_at,
  feedback = excluded.feedback,
  submitted_at = excluded.submitted_at;

insert into public.proctor_events (
  id,
  session_id,
  user_id,
  event_type,
  metadata,
  created_at
)
values
  (
    '62000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000041',
    'tab_hidden',
    '{"count":1,"source":"seed"}'::jsonb,
    now() - interval '8 minutes'
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000041',
    'copy_attempt',
    '{"count":1,"source":"seed"}'::jsonb,
    now() - interval '5 minutes'
  ),
  (
    '62000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000026',
    'window_blur',
    '{"count":1,"source":"seed"}'::jsonb,
    date_trunc('day', now()) - interval '1 day' + interval '11 hours 40 minutes'
  )
on conflict (id) do update
set
  event_type = excluded.event_type,
  metadata = excluded.metadata,
  created_at = excluded.created_at;

-- -------------------------------------------------
-- Parent emails (эцэг эхийн хуурамч email)
-- -------------------------------------------------
-- student50 → bumbaariunbat@gmail.com (жинхэнэ demo)
-- student01-49 → хуурамч email-үүд
UPDATE public.profiles
SET parent_email = format('parent.student%02s@pineexam.test', t.student_no)
FROM tmp_seed_users t
WHERE profiles.id = t.id
  AND t.student_no IS NOT NULL
  AND t.student_no != 50;

UPDATE public.profiles
SET parent_email = 'bumbaariunbat@gmail.com'
WHERE id = '30000000-0000-0000-0000-000000000050';

-- -------------------------------------------------
-- Student Learning Hub demo data (student50)
-- -------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_topic_mastery'
  ) then
    insert into public.student_topic_mastery (
      id,
      student_id,
      subject_id,
      topic_key,
      topic_label,
      official_correct_points,
      official_total_points,
      practice_correct_points,
      practice_total_points,
      official_question_count,
      practice_question_count,
      mastery_score,
      updated_at
    )
    select
      v.id,
      '30000000-0000-0000-0000-000000000050'::uuid,
      s.id,
      v.topic_key,
      v.topic_label,
      v.official_correct_points,
      v.official_total_points,
      v.practice_correct_points,
      v.practice_total_points,
      v.official_question_count,
      v.practice_question_count,
      v.mastery_score,
      v.updated_at
    from (
      values
        ('93000000-0000-0000-0000-000000000001'::uuid, 'Мэдээлэл зүй', '__subject__', '__subject__', 3::numeric, 12::numeric, 11::numeric, 23::numeric, 5, 10, 30.71::numeric, date_trunc('minute', now()) - interval '35 minutes'),
        ('93000000-0000-0000-0000-000000000002'::uuid, 'Мэдээлэл зүй', 'програмчлалын ойлголт', 'Програмчлалын ойлголт', 0::numeric, 2::numeric, 0::numeric, 3::numeric, 1, 1, 0::numeric, date_trunc('minute', now()) - interval '35 minutes'),
        ('93000000-0000-0000-0000-000000000003'::uuid, 'Мэдээлэл зүй', 'алгоритм', 'Алгоритм', 1::numeric, 5::numeric, 0::numeric, 7::numeric, 2, 3, 15::numeric, date_trunc('minute', now()) - interval '35 minutes'),
        ('93000000-0000-0000-0000-000000000004'::uuid, 'Мэдээлэл зүй', 'тооллын систем', 'Тооллын систем', 0::numeric, 3::numeric, 4::numeric, 6::numeric, 1, 3, 16.67::numeric, date_trunc('minute', now()) - interval '35 minutes'),
        ('93000000-0000-0000-0000-000000000005'::uuid, 'Мэдээлэл зүй', 'компьютерын үндэс', 'Компьютерын үндэс', 2::numeric, 2::numeric, 7::numeric, 7::numeric, 1, 3, 100::numeric, date_trunc('minute', now()) - interval '35 minutes'),
        ('93000000-0000-0000-0000-000000000006'::uuid, 'Математик', '__subject__', '__subject__', 16::numeric, 25::numeric, 9::numeric, 23::numeric, 10, 10, 57.78::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000007'::uuid, 'Математик', 'тригонометр', 'Тригонометр', 0::numeric, 2::numeric, 0::numeric, 2::numeric, 1, 1, 0::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000008'::uuid, 'Математик', 'функцийн график', 'Функцийн график', 0::numeric, 2::numeric, 2::numeric, 4::numeric, 1, 2, 12.5::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000009'::uuid, 'Математик', 'квадрат функц', 'Квадрат функц', 4::numeric, 7::numeric, 0::numeric, 5::numeric, 2, 2, 42.86::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000010'::uuid, 'Математик', 'шугаман функц', 'Шугаман функц', 3::numeric, 4::numeric, 0::numeric, 5::numeric, 2, 2, 56.25::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000011'::uuid, 'Математик', 'зэрэг ба язгуур', 'Зэрэг ба язгуур', 5::numeric, 6::numeric, 6::numeric, 6::numeric, 2, 2, 87.5::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000012'::uuid, 'Математик', 'абсолют утга', 'Абсолют утга', 1::numeric, 1::numeric, 1::numeric, 1::numeric, 1, 1, 100::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000013'::uuid, 'Математик', 'анхны тоо', 'Анхны тоо', 3::numeric, 3::numeric, 0::numeric, 0::numeric, 1, 0, 100::numeric, date_trunc('minute', now()) - interval '55 minutes'),
        ('93000000-0000-0000-0000-000000000014'::uuid, 'Физик', '__subject__', '__subject__', 4::numeric, 10::numeric, 0::numeric, 0::numeric, 3, 0, 40::numeric, date_trunc('minute', now()) - interval '1 day')
    ) as v(id, subject_name, topic_key, topic_label, official_correct_points, official_total_points, practice_correct_points, practice_total_points, official_question_count, practice_question_count, mastery_score, updated_at)
    join public.subjects s on s.name = v.subject_name
    on conflict (student_id, subject_id, topic_key) do update
    set
      topic_label = excluded.topic_label,
      official_correct_points = excluded.official_correct_points,
      official_total_points = excluded.official_total_points,
      practice_correct_points = excluded.practice_correct_points,
      practice_total_points = excluded.practice_total_points,
      official_question_count = excluded.official_question_count,
      practice_question_count = excluded.practice_question_count,
      mastery_score = excluded.mastery_score,
      updated_at = excluded.updated_at;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_subject_study_plans'
  ) then
    insert into public.student_subject_study_plans (
      id,
      student_id,
      subject_id,
      mastery_updated_at,
      plan_json,
      generated_at,
      updated_at
    )
    select
      v.id,
      '30000000-0000-0000-0000-000000000050'::uuid,
      s.id,
      v.mastery_updated_at,
      v.plan_json,
      v.generated_at,
      v.generated_at
    from (
      values
        (
          '93100000-0000-0000-0000-000000000001'::uuid,
          'Мэдээлэл зүй',
          date_trunc('minute', now()) - interval '35 minutes',
          jsonb_build_object(
            'summary', 'Мэдээлэл зүй дээр binary, algorithm, programming concept гурван чиглэл дээр суурь ойлголтоо бататгах шаардлагатай байна. Компьютерын үндэс хэсэг дээр сайн байгаа учраас тэр чадвараа ашиглаад логик сэтгэлгээгээ тогтвортой өсгөөрэй.',
            'priorities', jsonb_build_array('Тооллын системийн хөрвүүлэлт', 'Алгоритмын 3 бүтэц', 'Variable, loop, condition-ийн ялгаа'),
            'steps', jsonb_build_array('Өдөр бүр 10 минут binary тоог хөрвүүлэх 5 жишээ ажилла.', 'Flowchart дээр дараалал, салаалалт, давталтын жишээ зур.', 'Variable болон loop ашигласан 3 богино код уншиж тайлбарла.'),
            'next_practice_focus', jsonb_build_array('Тооллын систем', 'Алгоритм', 'Програмчлалын ойлголт')
          ),
          date_trunc('minute', now()) - interval '30 minutes'
        ),
        (
          '93100000-0000-0000-0000-000000000002'::uuid,
          'Математик',
          date_trunc('minute', now()) - interval '55 minutes',
          jsonb_build_object(
            'summary', 'Математик дээр function graph, trigonometry, quadratic function хэсгүүд тогтворгүй байна. Харин absolute value, powers roots дээр суурь нь сайн тул хүчтэй хэсгээ түшиж сул сэдвүүдээ нөхөж чадна.',
            'priorities', jsonb_build_array('Тригонометрийн стандарт утгууд', 'График ба шийдлийн холбоо', 'Квадрат функцийн орой, тэнхлэг'),
            'steps', jsonb_build_array('sin, cos, tan 30°, 45°, 60°-ийн хүснэгт гаргаж өдөр бүр давт.', 'Парабол x-тэнхлэгийг хаана огтолж байгааг графикаас унших 4 жишээ бод.', 'Квадрат функцийн оройг хүснэгт, томьёо хоёроор давхар олох дасгал хий.'),
            'next_practice_focus', jsonb_build_array('Тригонометр', 'Функцийн график', 'Квадрат функц')
          ),
          date_trunc('minute', now()) - interval '50 minutes'
        )
    ) as v(id, subject_name, mastery_updated_at, plan_json, generated_at)
    join public.subjects s on s.name = v.subject_name
    on conflict (student_id, subject_id) do update
    set
      mastery_updated_at = excluded.mastery_updated_at,
      plan_json = excluded.plan_json,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_practice_exams'
  ) then
    insert into public.student_practice_exams (
      id,
      student_id,
      subject_id,
      title,
      description,
      selected_topics,
      question_count,
      generated_metadata,
      created_at,
      updated_at
    )
    select
      v.id,
      '30000000-0000-0000-0000-000000000050'::uuid,
      s.id,
      v.title,
      v.description,
      v.selected_topics,
      v.question_count,
      v.generated_metadata,
      v.created_at,
      v.created_at
    from (
      values
        (
          '94000000-0000-0000-0000-000000000001'::uuid,
          'Математик - Сул сэдвийн practice #1',
          'Function graph, quadratic, roots дээр төвлөрсөн bank-based practice.',
          'Математик',
          jsonb_build_array(
            jsonb_build_object('topic_key', 'тригонометр', 'topic_label', 'Тригонометр'),
            jsonb_build_object('topic_key', 'функцийн график', 'topic_label', 'Функцийн график'),
            jsonb_build_object('topic_key', 'квадрат функц', 'topic_label', 'Квадрат функц'),
            jsonb_build_object('topic_key', 'шугаман функц', 'topic_label', 'Шугаман функц'),
            jsonb_build_object('topic_key', 'зэрэг ба язгуур', 'topic_label', 'Зэрэг ба язгуур')
          ),
          10,
          jsonb_build_object('bank_question_count', 10, 'ai_question_count', 0, 'grade_level', 10),
          date_trunc('minute', now()) - interval '2 day'
        ),
        (
          '94000000-0000-0000-0000-000000000002'::uuid,
          'Мэдээлэл зүй - Сул сэдвийн practice #1',
          'Binary, algorithm, programming concept дээр төвлөрсөн practice.',
          'Мэдээлэл зүй',
          jsonb_build_array(
            jsonb_build_object('topic_key', 'тооллын систем', 'topic_label', 'Тооллын систем'),
            jsonb_build_object('topic_key', 'алгоритм', 'topic_label', 'Алгоритм'),
            jsonb_build_object('topic_key', 'програмчлалын ойлголт', 'topic_label', 'Програмчлалын ойлголт'),
            jsonb_build_object('topic_key', 'компьютерын үндэс', 'topic_label', 'Компьютерын үндэс')
          ),
          10,
          jsonb_build_object('bank_question_count', 10, 'ai_question_count', 0, 'grade_level', 10),
          date_trunc('minute', now()) - interval '1 day 4 hours'
        ),
        (
          '94000000-0000-0000-0000-000000000003'::uuid,
          'Математик - Богино давтлага',
          'Одоогоор үргэлжилж байгаа богино practice.',
          'Математик',
          jsonb_build_array(
            jsonb_build_object('topic_key', 'функцийн график', 'topic_label', 'Функцийн график'),
            jsonb_build_object('topic_key', 'квадрат функц', 'topic_label', 'Квадрат функц'),
            jsonb_build_object('topic_key', 'шугаман функц', 'topic_label', 'Шугаман функц')
          ),
          6,
          jsonb_build_object('bank_question_count', 6, 'ai_question_count', 0, 'grade_level', 10),
          date_trunc('minute', now()) - interval '35 minutes'
        )
    ) as v(id, title, description, subject_name, selected_topics, question_count, generated_metadata, created_at)
    join public.subjects s on s.name = v.subject_name
    on conflict (id) do update
    set
      subject_id = excluded.subject_id,
      title = excluded.title,
      description = excluded.description,
      selected_topics = excluded.selected_topics,
      question_count = excluded.question_count,
      generated_metadata = excluded.generated_metadata,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    insert into public.student_practice_questions (
      id,
      practice_exam_id,
      subject_id,
      source_type,
      source_question_bank_id,
      topic_key,
      subtopic,
      type,
      content,
      content_html,
      image_url,
      options,
      correct_answer,
      points,
      order_index,
      explanation,
      created_at
    )
    select
      v.id,
      v.practice_exam_id,
      qb.subject_id,
      'bank',
      qb.id,
      regexp_replace(lower(trim(coalesce(qb.subtopic, ''))), '\s+', ' ', 'g'),
      qb.subtopic,
      qb.type,
      qb.content,
      qb.content_html,
      qb.image_url,
      qb.options,
      qb.correct_answer,
      qb.points,
      v.order_index,
      qb.explanation,
      now()
    from (
      values
        ('94100000-0000-0000-0000-000000000001'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 0, '80000000-0000-0000-0000-000000000013'::uuid),
        ('94100000-0000-0000-0000-000000000002'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 1, '80000000-0000-0000-0000-000000000014'::uuid),
        ('94100000-0000-0000-0000-000000000003'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 2, '80000000-0000-0000-0000-000000000018'::uuid),
        ('94100000-0000-0000-0000-000000000004'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 3, '80000000-0000-0000-0000-000000000019'::uuid),
        ('94100000-0000-0000-0000-000000000005'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 4, '80000000-0000-0000-0000-000000000020'::uuid),
        ('94100000-0000-0000-0000-000000000006'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 5, '80000000-0000-0000-0000-000000000021'::uuid),
        ('94100000-0000-0000-0000-000000000007'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 6, '80000000-0000-0000-0000-000000000022'::uuid),
        ('94100000-0000-0000-0000-000000000008'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 7, '80000000-0000-0000-0000-000000000023'::uuid),
        ('94100000-0000-0000-0000-000000000009'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 8, '80000000-0000-0000-0000-000000000024'::uuid),
        ('94100000-0000-0000-0000-000000000010'::uuid, '94000000-0000-0000-0000-000000000001'::uuid, 9, '80000000-0000-0000-0000-000000000025'::uuid),
        ('94100000-0000-0000-0000-000000000011'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 0, '80000000-0000-0000-0000-000000000015'::uuid),
        ('94100000-0000-0000-0000-000000000012'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 1, '80000000-0000-0000-0000-000000000016'::uuid),
        ('94100000-0000-0000-0000-000000000013'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 2, '80000000-0000-0000-0000-000000000017'::uuid),
        ('94100000-0000-0000-0000-000000000014'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 3, '80000000-0000-0000-0000-000000000026'::uuid),
        ('94100000-0000-0000-0000-000000000015'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 4, '80000000-0000-0000-0000-000000000027'::uuid),
        ('94100000-0000-0000-0000-000000000016'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 5, '80000000-0000-0000-0000-000000000028'::uuid),
        ('94100000-0000-0000-0000-000000000017'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 6, '80000000-0000-0000-0000-000000000029'::uuid),
        ('94100000-0000-0000-0000-000000000018'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 7, '80000000-0000-0000-0000-000000000030'::uuid),
        ('94100000-0000-0000-0000-000000000019'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 8, '80000000-0000-0000-0000-000000000031'::uuid),
        ('94100000-0000-0000-0000-000000000020'::uuid, '94000000-0000-0000-0000-000000000002'::uuid, 9, '80000000-0000-0000-0000-000000000032'::uuid),
        ('94100000-0000-0000-0000-000000000021'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 0, '80000000-0000-0000-0000-000000000013'::uuid),
        ('94100000-0000-0000-0000-000000000022'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 1, '80000000-0000-0000-0000-000000000018'::uuid),
        ('94100000-0000-0000-0000-000000000023'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 2, '80000000-0000-0000-0000-000000000020'::uuid),
        ('94100000-0000-0000-0000-000000000024'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 3, '80000000-0000-0000-0000-000000000021'::uuid),
        ('94100000-0000-0000-0000-000000000025'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 4, '80000000-0000-0000-0000-000000000022'::uuid),
        ('94100000-0000-0000-0000-000000000026'::uuid, '94000000-0000-0000-0000-000000000003'::uuid, 5, '80000000-0000-0000-0000-000000000024'::uuid)
    ) as v(id, practice_exam_id, order_index, question_bank_id)
    join public.question_bank qb on qb.id = v.question_bank_id
    on conflict (id) do update
    set
      practice_exam_id = excluded.practice_exam_id,
      subject_id = excluded.subject_id,
      source_type = excluded.source_type,
      source_question_bank_id = excluded.source_question_bank_id,
      topic_key = excluded.topic_key,
      subtopic = excluded.subtopic,
      type = excluded.type,
      content = excluded.content,
      content_html = excluded.content_html,
      image_url = excluded.image_url,
      options = excluded.options,
      correct_answer = excluded.correct_answer,
      points = excluded.points,
      order_index = excluded.order_index,
      explanation = excluded.explanation;

    insert into public.student_practice_attempts (
      id,
      practice_exam_id,
      student_id,
      status,
      started_at,
      submitted_at,
      total_score,
      max_score,
      attempt_number
    )
    values
      (
        '94200000-0000-0000-0000-000000000001',
        '94000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000050',
        'graded',
        date_trunc('minute', now()) - interval '2 day' + interval '10 minutes',
        date_trunc('minute', now()) - interval '2 day' + interval '37 minutes',
        9,
        23,
        1
      ),
      (
        '94200000-0000-0000-0000-000000000002',
        '94000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000050',
        'graded',
        date_trunc('minute', now()) - interval '1 day 4 hours' + interval '12 minutes',
        date_trunc('minute', now()) - interval '1 day 4 hours' + interval '42 minutes',
        11,
        23,
        1
      ),
      (
        '94200000-0000-0000-0000-000000000003',
        '94000000-0000-0000-0000-000000000003',
        '30000000-0000-0000-0000-000000000050',
        'in_progress',
        date_trunc('minute', now()) - interval '35 minutes',
        null,
        null,
        null,
        1
      )
    on conflict (practice_exam_id, attempt_number) do update
    set
      student_id = excluded.student_id,
      status = excluded.status,
      started_at = excluded.started_at,
      submitted_at = excluded.submitted_at,
      total_score = excluded.total_score,
      max_score = excluded.max_score;

    insert into public.student_practice_answers (
      id,
      practice_attempt_id,
      practice_question_id,
      student_id,
      answer,
      is_correct,
      score,
      feedback,
      submitted_at
    )
    values
      ('94300000-0000-0000-0000-000000000001', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000050', '["Парабол хэлбэртэй","Симметрийн тэнхлэгтэй"]', false, 0, 'Квадрат функцийн бүх зөв шинжийг дахин санах хэрэгтэй.', date_trunc('minute', now()) - interval '2 day' + interval '13 minutes'),
      ('94300000-0000-0000-0000-000000000002', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000050', '{"2^3":"8","3^2":"9","√16":"4"}', true, 3, 'Зэрэг ба язгуур дээр сайн байна.', date_trunc('minute', now()) - interval '2 day' + interval '15 minutes'),
      ('94300000-0000-0000-0000-000000000003', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000050', 'Парабол', true, 2, 'Графикийн хэлбэрийг зөв таньсан.', date_trunc('minute', now()) - interval '2 day' + interval '18 minutes'),
      ('94300000-0000-0000-0000-000000000004', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000050', '0', false, 0, 'Тригонометрийн стандарт утгууд дээр дахин ажиллана.', date_trunc('minute', now()) - interval '2 day' + interval '20 minutes'),
      ('94300000-0000-0000-0000-000000000005', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000050', '2', false, 0, 'Оройн x координат дээр томьёогоо дахин хэрэглэ.', date_trunc('minute', now()) - interval '2 day' + interval '22 minutes'),
      ('94300000-0000-0000-0000-000000000006', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000050', '7', true, 1, 'Абсолют утгын даалгаврыг зөв бодсон.', date_trunc('minute', now()) - interval '2 day' + interval '24 minutes'),
      ('94300000-0000-0000-0000-000000000007', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000050', '-4', false, 0, 'Шугаман функцийн налалтыг x-ийн коэффициентоос танина.', date_trunc('minute', now()) - interval '2 day' + interval '26 minutes'),
      ('94300000-0000-0000-0000-000000000008', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000050', '["√25 = 5","3^2 = 9"]', true, 3, 'Зөв тэнцэтгэлүүдийг зөв сонгосон.', date_trunc('minute', now()) - interval '2 day' + interval '28 minutes'),
      ('94300000-0000-0000-0000-000000000009', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000050', 'Шулуун', false, 0, 'Парабол ба шулууны ялгааг графикаар давт.', date_trunc('minute', now()) - interval '2 day' + interval '30 minutes'),
      ('94300000-0000-0000-0000-000000000010', '94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000050', '{"Налалт":"чөлөөт гишүүн","y-огтлолцол":"чөлөөт гишүүн","Шулуун":"графикийн хэлбэр"}', false, 0, 'Шугаман функцийн нэр томьёог дахин ялгаж сур.', date_trunc('minute', now()) - interval '2 day' + interval '33 minutes'),
      ('94300000-0000-0000-0000-000000000011', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000050', 'Түр хадгалалт', true, 2, 'RAM-ийн үүргийг зөв мэдсэн.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '15 minutes'),
      ('94300000-0000-0000-0000-000000000012', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000050', '10', false, 0, 'Хоёртын тоо хөрвүүлэхдээ бүх орныг тооцоорой.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '17 minutes'),
      ('94300000-0000-0000-0000-000000000013', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000050', '["Дараалал","Давталт"]', false, 0, 'Салаалалтыг орхигдуулсан.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '19 minutes'),
      ('94300000-0000-0000-0000-000000000014', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000050', '11', true, 2, '1011₂-ийг зөв хөрвүүлсэн.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '21 minutes'),
      ('94300000-0000-0000-0000-000000000015', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000050', 'тайлбарлах', false, 0, 'Алгоритмын эхний алхам нь асуудлыг тодорхойлох гэдгийг санаарай.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '23 minutes'),
      ('94300000-0000-0000-0000-000000000016', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000016', '30000000-0000-0000-0000-000000000050', 'Тооцоолол гүйцэтгэх', true, 2, 'CPU-ийн үүргийг зөв таньсан.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '25 minutes'),
      ('94300000-0000-0000-0000-000000000017', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000017', '30000000-0000-0000-0000-000000000050', '["Variable","Condition"]', false, 0, 'Loop-ийг орхигдуулсан.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '28 minutes'),
      ('94300000-0000-0000-0000-000000000018', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000018', '30000000-0000-0000-0000-000000000050', '{"RAM":"түр хадгална","SSD":"байнгын хадгална","CPU":"тооцоолол гүйцэтгэнэ"}', true, 3, 'Төхөөрөмжүүдийн үүргийг бүгдийг нь зөв холбоод байна.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '31 minutes'),
      ('94300000-0000-0000-0000-000000000019', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000019', '30000000-0000-0000-0000-000000000050', 'Давталт', true, 2, 'repeat until нь давталтын бүтэц гэдгийг зөв мэдсэн.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '34 minutes'),
      ('94300000-0000-0000-0000-000000000020', '94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000020', '30000000-0000-0000-0000-000000000050', '["0","1"]', true, 2, 'Хоёртын системийн тэмдэгтүүдийг зөв сонгосон.', date_trunc('minute', now()) - interval '1 day 4 hours' + interval '37 minutes')
    on conflict (practice_attempt_id, practice_question_id) do update
    set
      answer = excluded.answer,
      is_correct = excluded.is_correct,
      score = excluded.score,
      feedback = excluded.feedback,
      submitted_at = excluded.submitted_at;
  end if;
end $$;
