import { supabaseAdmin } from './supabase'
import type { AssignmentRow, SessionRow } from './history'
import type { Arrangement, ProbMatrix } from './types'

export interface SessionDetail extends SessionRow {
  executed_by: string
  avoid_prev: boolean | null
  seed: string | null
  redraw_count: number
  prob_snapshot: ProbMatrix | null
  assignments: AssignmentRow[]
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
  const [sessions, assignments] = await Promise.all([
    db.from('sessions').select('id, created_at, type, invalidated, executed_by'),
    db.from('assignments').select('session_id, student_id, seat_id'),
  ])
  if (sessions.error) throw sessions.error
  if (assignments.error) throw assignments.error
  return { sessions: sessions.data as SessionRow[], assignments: assignments.data as AssignmentRow[] }
}

export async function fetchSessionsWithAssignments(): Promise<SessionDetail[]> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('sessions')
    .select('*, assignments(session_id, student_id, seat_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as SessionDetail[]
}

export async function insertShuffleSession(p: {
  executedBy: string
  avoidPrev: boolean
  seed: string
  redrawCount: number
  probSnapshot: ProbMatrix
  arrangement: Arrangement
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
  const { error } = await db.from('sessions').update({ invalidated: true }).eq('id', sessionId)
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
