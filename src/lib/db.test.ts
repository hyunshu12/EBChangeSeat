import { describe, expect, it } from 'vitest'
import { arrangementToRows, arrangementToRpcPayload } from '@/lib/db'

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
