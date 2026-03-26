alter table public.question_bank
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'shared_subject', 'admin_curated', 'archived'));

alter table public.question_bank
  add column if not exists last_used_at timestamptz;

update public.question_bank
set last_used_at = coalesce(last_used_at, updated_at)
where usage_count > 0;

create index if not exists idx_question_bank_visibility
  on public.question_bank(visibility);

create index if not exists idx_question_bank_subject_visibility
  on public.question_bank(subject_id, visibility);

drop policy if exists "Teachers can view question bank" on public.question_bank;

create policy "Teachers can view scoped question bank"
  on public.question_bank for select using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
      and role = 'admin'
    )
    or (
      visibility in ('shared_subject', 'admin_curated')
      and subject_id is not null
      and exists (
        select 1
        from public.teacher_subjects ts
        where ts.teacher_id = auth.uid()
        and ts.subject_id = question_bank.subject_id
      )
    )
  );
