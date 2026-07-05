-- 세션 + 배정을 단일 트랜잭션으로 기록 (고아 세션 방지)
create or replace function insert_session_with_assignments(
  p_type text,
  p_executed_by text,
  p_avoid_prev boolean,
  p_seed text,
  p_redraw_count int,
  p_prob_snapshot jsonb,
  p_assignments jsonb  -- [{ "student_id": "...", "seat_id": "..." }, ...]
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_session_id uuid;
begin
  if p_assignments is null or jsonb_array_length(p_assignments) = 0 then
    raise exception 'assignments must be a non-empty array';
  end if;

  insert into sessions (type, executed_by, avoid_prev, seed, redraw_count, prob_snapshot)
  values (p_type, p_executed_by, p_avoid_prev, p_seed, coalesce(p_redraw_count, 0), p_prob_snapshot)
  returning id into v_session_id;

  insert into assignments (session_id, student_id, seat_id)
  select v_session_id, a->>'student_id', a->>'seat_id'
  from jsonb_array_elements(p_assignments) as a;

  return v_session_id;
end;
$$;
