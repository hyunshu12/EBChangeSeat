import { supabaseAdmin } from './supabase'
import type { AssignmentRow, SessionRow } from './history'
import type { Arrangement, ProbMatrix } from './types'

export interface SessionDetail extends SessionRow {
  executed_by: string
  avoid_prev: boolean | null
  seed: string | null
  redraw_count: number
  prob_snapshot: ProbMatrix | null
  // 감사 완전성 컬럼(003 마이그레이션). 과거 세션에는 없을 수 있어 optional.
  invalidated_at?: string | null
  decay_factor?: number | null
  mc_iterations?: number | null
  based_on_session_id?: string | null
  assignments: AssignmentRow[]
}

const PAGE_SIZE = 1000

/** 매 페이지마다 새로 만들어진, .range()로 이어 읽을 수 있는 쿼리 빌더. */
interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * PostgREST는 응답을 기본 1000행에서 조용히 잘라낸다(에러 없이). 그대로 두면
 * 셔플이 ~37회를 넘는 순간 assignments가 잘려 deriveHistory가 조용히 오염된다.
 * .range(from, to)로 1000행씩 페이지를 순회하고, 페이지가 PAGE_SIZE보다 작으면
 * 마지막 페이지로 보고 멈춘다. makeQuery는 페이지마다 새 빌더를 만들어야 한다
 * (PostgREST 빌더는 1회용).
 */
async function fetchAllRows<T>(makeQuery: () => RangeableQuery<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

export function arrangementToRows(sessionId: string, arrangement: Arrangement): AssignmentRow[] {
  return Object.entries(arrangement).map(([student_id, seat_id]) => ({
    session_id: sessionId,
    student_id,
    seat_id,
  }))
}

/** Arrangement → RPC p_assignments 페이로드 (session_id 없이 student_id/seat_id만). */
export function arrangementToRpcPayload(
  arrangement: Arrangement,
): Array<{ student_id: string; seat_id: string }> {
  return Object.entries(arrangement).map(([student_id, seat_id]) => ({ student_id, seat_id }))
}

export async function fetchHistoryRows(): Promise<{ sessions: SessionRow[]; assignments: AssignmentRow[] }> {
  const db = supabaseAdmin()
  // 두 쿼리 모두 페이지네이션: 셔플이 쌓이면 assignments는 물론 sessions도 1000행을 넘는다.
  const [sessions, assignments] = await Promise.all([
    fetchAllRows<SessionRow>(() => db.from('sessions').select('id, created_at, type, invalidated, executed_by') as unknown as RangeableQuery<SessionRow>),
    fetchAllRows<AssignmentRow>(() => db.from('assignments').select('session_id, student_id, seat_id') as unknown as RangeableQuery<AssignmentRow>),
  ])
  return { sessions, assignments }
}

export async function fetchSessionsWithAssignments(): Promise<SessionDetail[]> {
  const db = supabaseAdmin()
  // 상위 sessions 쿼리만 페이지네이션한다. 세션당 embedded assignments는 좌석 수(≤27)
  // 이하라, 상위 sessions 행이 모두 채워지면 각 세션 내부 배정은 잘릴 위험이 없다.
  return fetchAllRows<SessionDetail>(() =>
    db
      .from('sessions')
      .select('*, assignments(session_id, student_id, seat_id)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }) as unknown as RangeableQuery<SessionDetail>,
  )
}

export async function insertShuffleSession(p: {
  executedBy: string
  avoidPrev: boolean
  seed: string
  redrawCount: number
  probSnapshot: ProbMatrix
  arrangement: Arrangement
  /** 추첨에 쓰인 감소 계수 — 로그만으로 재현 가능하도록 함께 저장 */
  decayFactor: number
  /** 확률 스냅샷 몬테카를로 반복 횟수 */
  mcIterations: number
  /** 이 셔플의 기준(=직전 최신 비무효 세션) id. 낙관적 락 기준값도 겸함. null이면 최초 셔플 */
  basedOnSessionId: string | null
}): Promise<string> {
  const db = supabaseAdmin()
  const { data, error } = await db.rpc('insert_session_with_assignments', {
    p_type: 'shuffle',
    p_executed_by: p.executedBy,
    p_avoid_prev: p.avoidPrev,
    p_seed: p.seed,
    p_redraw_count: p.redrawCount,
    p_prob_snapshot: p.probSnapshot,
    p_assignments: arrangementToRpcPayload(p.arrangement),
    p_decay_factor: p.decayFactor,
    p_mc_iterations: p.mcIterations,
    p_based_on: p.basedOnSessionId,
    p_expected_latest: p.basedOnSessionId,
  })
  if (error) throw error
  return data as string
}

export async function insertSwapSession(p: {
  executedBy: string
  entries: Array<{ studentId: string; seatId: string }>
}): Promise<string> {
  const db = supabaseAdmin()
  const { data, error } = await db.rpc('insert_session_with_assignments', {
    p_type: 'swap',
    p_executed_by: p.executedBy,
    p_avoid_prev: null,
    p_seed: null,
    p_redraw_count: 0,
    p_prob_snapshot: null,
    p_assignments: p.entries.map(e => ({ student_id: e.studentId, seat_id: e.seatId })),
  })
  if (error) throw error
  return data as string
}

export async function setSessionInvalidated(sessionId: string): Promise<void> {
  const db = supabaseAdmin()
  // invalidated_at를 함께 기록 → 감사 재현 시 "T 시점에 이미 무효였는지" 판정 근거.
  const { error } = await db
    .from('sessions')
    .update({ invalidated: true, invalidated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}

export async function countRecentPinFailures(ip: string, windowMinutes: number): Promise<number> {
  const db = supabaseAdmin()
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { count, error } = await db
    .from('pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

export async function recordPinAttempt(ip: string, success: boolean): Promise<void> {
  const db = supabaseAdmin()
  const { error } = await db.from('pin_attempts').insert({ ip, success })
  if (error) throw error
}
