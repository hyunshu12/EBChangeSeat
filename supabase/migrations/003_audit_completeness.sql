-- 감사 완전성(audit completeness):
--   1) 무효 처리 시각(invalidated_at) — 사후 무효가 언제 일어났는지 기록해
--      "세션 T 재현 시 T 시점에 이미 무효였던 세션만 제외" 판정의 근거가 된다.
--   2) 추첨 파라미터(decay_factor, mc_iterations) — "로그만으로 재현"을 무조건 참으로.
--   3) based_on_session_id — 이 셔플이 기준으로 삼은 직전 최신 비무효 세션(낙관적 락).

alter table sessions add column invalidated_at      timestamptz;
alter table sessions add column decay_factor         numeric;
alter table sessions add column mc_iterations         int;
alter table sessions add column based_on_session_id  uuid references sessions(id);

-- 002의 7-인자 함수를 먼저 제거한다. create or replace는 인자 목록을 바꿀 수 없어
-- 새 시그니처는 별도 오버로드가 되고, 명명 인자 호출이 두 함수 모두에 매칭되어
-- "function is not unique" 에러가 난다. 따라서 구 시그니처를 명시적으로 drop.
drop function if exists insert_session_with_assignments(text, text, boolean, text, int, jsonb, jsonb);

-- 세션 + 배정을 단일 트랜잭션으로 기록. 신규 컬럼과 동시 셔플 낙관적 락을 추가.
create or replace function insert_session_with_assignments(
  p_type text,
  p_executed_by text,
  p_avoid_prev boolean,
  p_seed text,
  p_redraw_count int,
  p_prob_snapshot jsonb,
  p_assignments jsonb,  -- [{ "student_id": "...", "seat_id": "..." }, ...]
  p_decay_factor numeric default null,
  p_mc_iterations int default null,
  p_based_on uuid default null,
  p_expected_latest uuid default null
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

  -- 동시 셔플 경합 방지(낙관적 락). 셔플에만 적용:
  --  1) 트랜잭션 범위 advisory lock으로 동시 셔플을 직렬화한다.
  --  2) 호출자가 기준으로 본 최신 비무효 세션(p_expected_latest)이 지금도 최신인지
  --     확인한다. 그 사이 다른 셔플이 끼어들었으면 다르므로 예외를 던진다.
  if p_type = 'shuffle' then
    perform pg_advisory_xact_lock(42);
    if p_expected_latest is distinct from (
      select id from sessions where invalidated = false order by created_at desc, id desc limit 1
    ) then
      raise exception 'concurrent_shuffle';
    end if;
  end if;

  insert into sessions (
    type, executed_by, avoid_prev, seed, redraw_count, prob_snapshot,
    decay_factor, mc_iterations, based_on_session_id
  )
  values (
    p_type, p_executed_by, p_avoid_prev, p_seed, coalesce(p_redraw_count, 0), p_prob_snapshot,
    p_decay_factor, p_mc_iterations, p_based_on
  )
  returning id into v_session_id;

  insert into assignments (session_id, student_id, seat_id)
  select v_session_id, a->>'student_id', a->>'seat_id'
  from jsonb_array_elements(p_assignments) as a;

  return v_session_id;
end;
$$;
