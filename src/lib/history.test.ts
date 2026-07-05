import { describe, expect, it } from 'vitest'
import { deriveHistory, type AssignmentRow, type SessionRow } from '@/lib/history'

function shuffle(id: string, at: string): SessionRow {
  return { id, created_at: at, type: 'shuffle', invalidated: false }
}
function swap(id: string, at: string): SessionRow {
  return { id, created_at: at, type: 'swap', invalidated: false }
}
function rows(sessionId: string, pairs: Array<[string, string]>): AssignmentRow[] {
  return pairs.map(([student_id, seat_id]) => ({ session_id: sessionId, student_id, seat_id }))
}

describe('deriveHistory', () => {
  it('이력 없음 → current null, counts 비어있음', () => {
    const h = deriveHistory([], [])
    expect(h.current).toBeNull()
    expect(h.counts).toEqual({})
  })

  it('셔플 1회 → 그 배치가 current이자 counts 1회', () => {
    const h = deriveHistory([shuffle('s1', '2026-07-01T00:00:00Z')], rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]))
    expect(h.current).toEqual({ a: '1-1-L', b: '1-1-R' })
    expect(h.counts['a']['1-1-L']).toBe(1)
  })

  it('셔플 후 스왑 → current와 counts 모두 스왑 반영 후 자리 기준', () => {
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), swap('w1', '2026-07-02T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('w1', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-R', b: '1-1-L' })
    expect(h.counts['a']).toEqual({ '1-1-R': 1 }) // 스왑 전 자리는 카운트 안 됨
  })

  it('배치 기간마다 1회씩 누적', () => {
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), shuffle('s2', '2026-07-08T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-L'], ['b', '1-1-R']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.counts['a']['1-1-L']).toBe(2)
  })

  it('무효 세션은 완전히 제외', () => {
    const s2: SessionRow = { ...shuffle('s2', '2026-07-08T00:00:00Z'), invalidated: true }
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), s2]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-L', b: '1-1-R' })
    expect(h.counts['a']).toEqual({ '1-1-L': 1 })
  })

  it('셔플 이전 스왑은 무시', () => {
    const h = deriveHistory([swap('w1', '2026-07-01T00:00:00Z')], rows('w1', [['a', '1-1-R']]))
    expect(h.current).toBeNull()
    expect(h.counts).toEqual({})
  })

  it('입력 순서와 무관하게 created_at 순으로 재생', () => {
    const sessions = [shuffle('s2', '2026-07-08T00:00:00Z'), shuffle('s1', '2026-07-01T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-R', b: '1-1-L' })
  })
})
