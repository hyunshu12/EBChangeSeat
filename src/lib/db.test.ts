import { beforeEach, describe, expect, it, vi } from 'vitest'

// supabaseAdmin을 가짜 클라이언트로 대체 — .range() 페이지네이션 순회를 검증.
const rangeCalls: Record<string, Array<[number, number]>> = {}
let pagesByTable: Record<string, unknown[][]> = {}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const builder = {
        select: () => builder,
        order: () => builder,
        range(from: number, to: number) {
          ;(rangeCalls[table] ??= []).push([from, to])
          const idx = (rangeCalls[table]!.length - 1)
          const page = pagesByTable[table]?.[idx] ?? []
          return Promise.resolve({ data: page, error: null })
        },
      }
      return builder
    },
  }),
}))

import { arrangementToRows, arrangementToRpcPayload, fetchHistoryRows, fetchSessionsWithAssignments } from '@/lib/db'

function makePage(n: number): Array<{ i: number }> {
  return Array.from({ length: n }, (_, i) => ({ i }))
}

beforeEach(() => {
  for (const k of Object.keys(rangeCalls)) delete rangeCalls[k]
  pagesByTable = {}
})

describe('fetchAllRows 페이지네이션 (fetchHistoryRows 경유)', () => {
  it('2페이지 순회 — 꽉 찬 첫 페이지 다음 페이지까지 이어 붙인다', async () => {
    pagesByTable = {
      sessions: [makePage(1000), makePage(3)], // 1000 + 3 = 1003
      assignments: [makePage(2)],
    }
    const { sessions, assignments } = await fetchHistoryRows()
    expect(sessions).toHaveLength(1003)
    expect(assignments).toHaveLength(2)
    expect(rangeCalls.sessions).toHaveLength(2)
    expect(rangeCalls.sessions[0]).toEqual([0, 999])
    expect(rangeCalls.sessions[1]).toEqual([1000, 1999])
  })

  it('첫 페이지가 짧으면 루프를 멈춘다 (range 1회만 호출)', async () => {
    pagesByTable = {
      sessions: [makePage(5)],
      assignments: [makePage(0)],
    }
    const { sessions } = await fetchHistoryRows()
    expect(sessions).toHaveLength(5)
    expect(rangeCalls.sessions).toHaveLength(1)
    expect(rangeCalls.assignments).toHaveLength(1)
  })
})

describe('fetchSessionsWithAssignments 페이지네이션', () => {
  it('상위 sessions 쿼리를 페이지네이션해 이어 붙인다', async () => {
    pagesByTable = { sessions: [makePage(1000), makePage(7)] }
    const rows = await fetchSessionsWithAssignments()
    expect(rows).toHaveLength(1007)
    expect(rangeCalls.sessions).toHaveLength(2)
  })
})

describe('arrangementToRows', () => {
  it('Arrangement → assignments 행 배열', () => {
    const rows = arrangementToRows('sess-1', { a: '1-1-L', b: '1-1-R' })
    expect(rows).toEqual([
      { session_id: 'sess-1', student_id: 'a', seat_id: '1-1-L' },
      { session_id: 'sess-1', student_id: 'b', seat_id: '1-1-R' },
    ])
  })
})

describe('arrangementToRpcPayload', () => {
  it('Arrangement → RPC 페이로드 (session_id 없이 student_id/seat_id만)', () => {
    const payload = arrangementToRpcPayload({ a: '1-1-L', b: '1-1-R' })
    expect(payload).toEqual([
      { student_id: 'a', seat_id: '1-1-L' },
      { student_id: 'b', seat_id: '1-1-R' },
    ])
  })

  it('빈 Arrangement → 빈 배열', () => {
    expect(arrangementToRpcPayload({})).toEqual([])
  })
})
