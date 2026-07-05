import { describe, expect, it } from 'vitest'
import { arrangementToRows } from '@/lib/db'

describe('arrangementToRows', () => {
  it('Arrangement → assignments 행 배열', () => {
    const rows = arrangementToRows('sess-1', { a: '1-1-L', b: '1-1-R' })
    expect(rows).toEqual([
      { session_id: 'sess-1', student_id: 'a', seat_id: '1-1-L' },
      { session_id: 'sess-1', student_id: 'b', seat_id: '1-1-R' },
    ])
  })
})
