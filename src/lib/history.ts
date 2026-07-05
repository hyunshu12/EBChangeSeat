import type { Arrangement, HistoryState } from './types'

export interface SessionRow {
  id: string
  created_at: string
  type: 'shuffle' | 'swap'
  invalidated: boolean
  executed_by?: string
}

export interface AssignmentRow {
  session_id: string
  student_id: string
  seat_id: string
}

/**
 * append-only 세션 로그를 시간순 재생해 이력을 파생한다.
 * - 배치 기간(셔플~다음 셔플)의 최종(스왑 반영) 자리가 counts에 1회씩 기록됨 (현재 기간 포함)
 * - 무효 세션은 스트림에서 제거 후 재생
 */
export function deriveHistory(sessions: SessionRow[], assignments: AssignmentRow[]): HistoryState {
  const rowsBySession = new Map<string, AssignmentRow[]>()
  for (const a of assignments) {
    const list = rowsBySession.get(a.session_id)
    if (list) list.push(a)
    else rowsBySession.set(a.session_id, [a])
  }

  const active = sessions
    .filter(s => !s.invalidated)
    .sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id))

  const periods: Arrangement[] = []
  let current: Arrangement | null = null
  for (const s of active) {
    const rows = rowsBySession.get(s.id) ?? []
    if (s.type === 'shuffle') {
      if (current) periods.push(current)
      current = Object.fromEntries(rows.map(r => [r.student_id, r.seat_id]))
    } else if (current) {
      current = { ...current }
      for (const r of rows) current[r.student_id] = r.seat_id
    }
  }
  if (current) periods.push(current)

  const counts: HistoryState['counts'] = {}
  for (const period of periods) {
    for (const [studentId, seatId] of Object.entries(period)) {
      counts[studentId] ??= {}
      counts[studentId][seatId] = (counts[studentId][seatId] ?? 0) + 1
    }
  }
  return { counts, current }
}
