import { describe, expect, it } from 'vitest'
import { loadStudents, validateStudents, RosterError } from '@/lib/roster'
import type { Student } from '@/lib/types'

const valid: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))

describe('roster', () => {
  it('students.json 로드: 27명, 학번 중복 없음', () => {
    const students = loadStudents()
    expect(students).toHaveLength(27)
    expect(new Set(students.map(s => s.id)).size).toBe(27)
  })
  it('인원수가 좌석수와 다르면 RosterError', () => {
    expect(() => validateStudents(valid.slice(0, 26))).toThrow(RosterError)
  })
  it('학번 중복이면 RosterError', () => {
    const dup = [...valid.slice(0, 26), { ...valid[0], name: '복제' }]
    expect(() => validateStudents(dup)).toThrow(RosterError)
  })
  it('존재하지 않는 고정석이면 RosterError', () => {
    const bad = valid.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '9-9-L' } : s))
    expect(() => validateStudents(bad)).toThrow(RosterError)
  })
  it('고정석 중복이면 RosterError', () => {
    const bad = valid.map((s, i) => (i <= 1 ? { ...s, fixedSeatId: '1-1-L' } : s))
    expect(() => validateStudents(bad)).toThrow(RosterError)
  })
})
