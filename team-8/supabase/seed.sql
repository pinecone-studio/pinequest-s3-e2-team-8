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
