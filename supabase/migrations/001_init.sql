-- EB Change Seat 초기 스키마
-- 로그는 append-only: UPDATE는 invalidated 플래그만, DELETE 없음.

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  type          text not null check (type in ('shuffle', 'swap')),
  executed_by   text not null check (char_length(executed_by) between 1 and 20),
  avoid_prev    boolean,          -- shuffle만
  seed          text,             -- shuffle만, 공개 난수 시드
  redraw_count  int not null default 0,
  prob_snapshot jsonb,            -- shuffle만, 셔플 직전 확률 행렬
  invalidated   boolean not null default false
);

create table assignments (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id),
  student_id  text not null,
  seat_id     text not null
);
create index assignments_session_idx on assignments(session_id);

create table pin_attempts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ip          text not null,
  success     boolean not null
);
create index pin_attempts_ip_time_idx on pin_attempts(ip, created_at);

-- 접근은 서버의 service-role 키로만. RLS를 켜고 공개 정책은 만들지 않는다.
alter table sessions enable row level security;
alter table assignments enable row level security;
alter table pin_attempts enable row level security;
