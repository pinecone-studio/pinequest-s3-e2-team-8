alter table public.exam_recipients
  add column if not exists access_start_time timestamptz,
  add column if not exists access_end_time timestamptz,
  add column if not exists max_attempts_override integer check (max_attempts_override is null or max_attempts_override > 0),
  add column if not exists excused_at timestamptz,
  add column if not exists excused_by uuid references public.profiles(id) on delete set null,
  add column if not exists status_note text;

drop policy if exists "Students can view own exam recipients" on public.exam_recipients;
create policy "Students can view own exam recipients"
  on public.exam_recipients for select
  using (
    student_id = auth.uid()
    or public.auth_is_exam_owner_or_admin(exam_id)
    or public.auth_has_teaching_scope_for_exam(exam_id)
  );

drop policy if exists "Teachers can manage exam recipients" on public.exam_recipients;
create policy "Teachers can manage exam recipients"
  on public.exam_recipients for all
  using (
    public.auth_is_exam_owner_or_admin(exam_id)
    or public.auth_has_teaching_scope_for_exam(exam_id)
  )
  with check (
    public.auth_is_exam_owner_or_admin(exam_id)
    or public.auth_has_teaching_scope_for_exam(exam_id)
  );
