alter table public.exams
  add column if not exists published_snapshot jsonb,
  add column if not exists published_at timestamptz;
