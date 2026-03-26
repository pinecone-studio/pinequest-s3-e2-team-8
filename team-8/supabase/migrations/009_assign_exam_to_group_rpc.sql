create or replace function public.assign_exam_to_group(
  p_exam_id uuid,
  p_group_id uuid,
  p_assigned_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_assignment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Нэвтрээгүй байна';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'admin'
  ) into v_is_admin;

  if not exists (
    select 1
    from public.exams e
    where e.id = p_exam_id
      and (e.created_by = v_user_id or v_is_admin)
  ) then
    raise exception 'Таны шалгалт олдсонгүй';
  end if;

  if not exists (
    select 1
    from public.student_groups sg
    where sg.id = p_group_id
      and (sg.created_by = v_user_id or v_is_admin)
  ) then
    raise exception 'Сонгосон бүлэг олдсонгүй';
  end if;

  insert into public.exam_assignments (exam_id, group_id, assigned_by)
  values (p_exam_id, p_group_id, coalesce(p_assigned_by, v_user_id))
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

grant execute on function public.assign_exam_to_group(uuid, uuid, uuid) to authenticated;
