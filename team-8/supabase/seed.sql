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
-- Clean previous demo users
-- -------------------------------------------------
delete from auth.identities
where user_id in (
  select id from auth.users where email like '%@pineexam.test'
);

delete from auth.users
where email like '%@pineexam.test';

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
insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000101'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (41, 42, 43, 46, 47)
on conflict (group_id, student_id) do nothing;

insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000102'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (44, 45, 48, 49, 50)
on conflict (group_id, student_id) do nothing;

insert into public.student_group_members (group_id, student_id, joined_at)
select
  '40000000-0000-0000-0000-000000000103'::uuid,
  u.id,
  now()
from tmp_seed_users u
where u.student_no in (31, 32, 33, 41, 42, 43)
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
  ('teacher01@pineexam.test', '9A', 'Математик'),
  ('teacher01@pineexam.test', '9B', 'Математик'),
  ('teacher01@pineexam.test', '10A', 'Математик'),
  ('teacher01@pineexam.test', '10B', 'Математик'),
  ('teacher01@pineexam.test', '10-р ангийн сонгон Математик', 'Математик'),

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
    'Математик - II улирлын сорил',
    '10-р ангийн алгебр, функцийн сорил.',
    'Математик',
    'teacher01@pineexam.test',
    date_trunc('day', now()) + interval '1 day 09 hours',
    date_trunc('day', now()) + interval '1 day 10 hours 15 minutes',
    75,
    true,
    1,
    true,
    true,
    60,
    '201'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'Математик - Сонгон бодлогын ноорог',
    'Сонгон математикийн бэлтгэл шалгалт.',
    'Математик',
    'teacher01@pineexam.test',
    date_trunc('day', now()) + interval '8 day 14 hours',
    date_trunc('day', now()) + interval '8 day 15 hours 30 minutes',
    90,
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
    'Мэдээлэл зүй - Coding Logic Quiz',
    'Алгоритм, өгөгдлийн бүтэц, логик сэтгэлгээ.',
    'Мэдээлэл зүй',
    'teacher09@pineexam.test',
    date_trunc('day', now()) + interval '2 day 15 hours',
    date_trunc('day', now()) + interval '2 day 16 hours',
    60,
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
  ('50000000-0000-0000-0000-000000000001', '10A'),
  ('50000000-0000-0000-0000-000000000001', '10B'),
  ('50000000-0000-0000-0000-000000000001', '10-р ангийн сонгон Математик'),
  ('50000000-0000-0000-0000-000000000003', '8A'),
  ('50000000-0000-0000-0000-000000000003', '8B'),
  ('50000000-0000-0000-0000-000000000003', '10-р ангийн сонгон Англи хэл'),
  ('50000000-0000-0000-0000-000000000004', '9A'),
  ('50000000-0000-0000-0000-000000000004', '10A'),
  ('50000000-0000-0000-0000-000000000004', 'Coding Club'),
  ('50000000-0000-0000-0000-000000000006', '9A'),
  ('50000000-0000-0000-0000-000000000006', '9B'),
  ('50000000-0000-0000-0000-000000000007', '10A'),
  ('50000000-0000-0000-0000-000000000007', '10B');

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
  )
on conflict (id) do update
set
  content = excluded.content,
  content_html = excluded.content_html,
  title = excluded.title,
  order_index = excluded.order_index;

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
    null,
    'multiple_choice',
    'f(x)=x^2-4x+3 функцийн оройн x координатыг ол.',
    '<p>Дараах функцийг ажигла: $$f(x)=x^2-4x+3$$</p><p>Оройн <strong>x</strong> координатыг ол.</p>',
    null,
    '["1","2","3","4"]'::jsonb,
    '2',
    2,
    0,
    'Квадрат функцийн оройн x координат нь -b/2a = 4/2 = 2.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    null,
    'fill_blank',
    '2x + 5 = 13 тэгшитгэлийн x-ийн утгыг нөхөж бич.',
    '<p>$$2x + 5 = 13$$ тэгшитгэлийн <em>x</em>-ийг ол.</p>',
    null,
    null,
    '4',
    3,
    1,
    '5-ыг нөгөө талд шилжүүлээд 8, дараа нь 2-т хуваана.',
    '20000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    null,
    'essay',
    'Квадрат функцийн графикийг яагаад парабол гэдгийг тайлбарла.',
    null,
    null,
    null,
    null,
    5,
    2,
    'Оргил, симметрийн тэнхлэг, коэффициентийн нөлөөг тайлбарлахыг хүлээнэ.',
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
    'essay',
    'Match the word with its meaning: reduce, encourage, waste.',
    null,
    null,
    null,
    null,
    3,
    2,
    'Vocabulary matching.',
    '20000000-0000-0000-0000-000000000003',
    now()
  ),

  (
    '70000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000004',
    null,
    'essay',
    'CPU, Bug, Loop нэр томьёонуудыг тайлбарла.',
    '<p>Algorithm-related terms.</p>',
    null,
    null,
    null,
    3,
    0,
    'Үндсэн нэр томьёог холбоно.',
    '20000000-0000-0000-0000-000000000009',
    now()
  ),
  (
    '70000000-0000-0000-0000-000000000008',
    '50000000-0000-0000-0000-000000000004',
    null,
    'multiple_choice',
    'Which of the following are programming languages?',
    null,
    null,
    '["Python","HTML","JavaScript","Keyboard"]'::jsonb,
    '"Python"',
    3,
    1,
    'Python and JavaScript are programming languages.',
    '20000000-0000-0000-0000-000000000009',
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
    '20000000-0000-0000-0000-000000000009',
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
    'multiple_choice',
    'Which are chemical changes?',
    null,
    null,
    '["Burning paper","Melting ice","Rusting iron","Boiling water"]'::jsonb,
    '"Burning paper"',
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
      visibility = 'shared_subject',
      last_used_at = now() - interval '3 day'
    where id in (
      '80000000-0000-0000-0000-000000000001'::uuid,
      '80000000-0000-0000-0000-000000000005'::uuid,
      '80000000-0000-0000-0000-000000000007'::uuid
    );

    update public.question_bank
    set
      visibility = 'admin_curated',
      last_used_at = now() - interval '1 day'
    where id in (
      '80000000-0000-0000-0000-000000000003'::uuid,
      '80000000-0000-0000-0000-000000000010'::uuid
    );

    update public.question_bank
    set
      visibility = 'archived',
      last_used_at = now() - interval '45 day'
    where id = '80000000-0000-0000-0000-000000000006'::uuid;
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
