create index if not exists idx_exam_recipients_student_exam
  on public.exam_recipients(student_id, exam_id);

create index if not exists idx_answers_session_user
  on public.answers(session_id, user_id);

create index if not exists idx_exam_sessions_user_exam_attempt_desc
  on public.exam_sessions(user_id, exam_id, attempt_number desc);

create index if not exists idx_exam_sessions_user_submitted_desc
  on public.exam_sessions(user_id, submitted_at desc)
  where status in ('submitted', 'graded', 'timed_out');

create or replace function public.record_proctor_event_atomic(
  p_session_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb,
  p_severity text default 'low',
  p_source text default 'client',
  p_snapshot_url text default null,
  p_derived_risk_delta integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_session record;
  v_now timestamptz := now();
  v_next_risk_score integer;
  v_next_risk_level text;
  v_next_flag_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select
    es.id,
    es.user_id,
    es.status,
    es.risk_score,
    es.flag_status,
    es.last_heartbeat_at,
    es.challenge_count,
    es.spot_check_count
  into v_session
  from public.exam_sessions es
  where es.id = p_session_id
    and es.user_id = v_user_id;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  if v_session.status <> 'in_progress' then
    return jsonb_build_object('skipped', true);
  end if;

  insert into public.proctor_events (
    session_id,
    user_id,
    event_type,
    metadata,
    severity,
    source,
    snapshot_url,
    derived_risk_delta
  )
  values (
    p_session_id,
    v_user_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb),
    p_severity,
    coalesce(nullif(p_source, ''), 'client'),
    p_snapshot_url,
    coalesce(p_derived_risk_delta, 0)
  );

  v_next_risk_score := coalesce(v_session.risk_score, 0) + coalesce(p_derived_risk_delta, 0);
  v_next_risk_level := case
    when v_next_risk_score >= 70 then 'critical'
    when v_next_risk_score >= 40 then 'high'
    when v_next_risk_score >= 20 then 'medium'
    else 'low'
  end;
  v_next_flag_status := case
    when v_next_risk_score >= 70
      or p_event_type in ('challenge_failed', 'spot_check_failed', 'identity_failed')
      then 'flagged'
    else coalesce(v_session.flag_status, 'clear')
  end;

  update public.exam_sessions
  set
    risk_score = v_next_risk_score,
    risk_level = v_next_risk_level,
    flag_status = v_next_flag_status,
    last_heartbeat_at = case
      when p_event_type = 'heartbeat_lost' then exam_sessions.last_heartbeat_at
      else v_now
    end,
    identity_verified_at = case
      when p_event_type = 'identity_verified' then v_now
      else exam_sessions.identity_verified_at
    end,
    last_snapshot_at = case
      when p_snapshot_url is not null then v_now
      else exam_sessions.last_snapshot_at
    end,
    challenge_count = case
      when p_event_type in ('challenge_required', 'challenge_failed')
        then coalesce(exam_sessions.challenge_count, 0) + 1
      else exam_sessions.challenge_count
    end,
    last_spot_check_at = case
      when p_event_type in ('spot_check_required', 'spot_check_passed', 'spot_check_failed')
        then v_now
      else exam_sessions.last_spot_check_at
    end,
    spot_check_count = case
      when p_event_type = 'spot_check_required'
        then coalesce(exam_sessions.spot_check_count, 0) + 1
      else exam_sessions.spot_check_count
    end
  where exam_sessions.id = p_session_id
    and exam_sessions.user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'risk_score', v_next_risk_score,
    'risk_level', v_next_risk_level,
    'flag_status', v_next_flag_status
  );
end;
$$;

revoke all on function public.record_proctor_event_atomic(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  integer
) from public;
revoke all on function public.record_proctor_event_atomic(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  integer
) from anon;

grant execute on function public.record_proctor_event_atomic(
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  integer
) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_proctor_event_atomic(uuid, text, jsonb, text, text, text, integer) to service_role';
  end if;
end $$;
