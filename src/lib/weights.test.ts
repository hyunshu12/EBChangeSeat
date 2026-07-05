import { describe, expect, it } from 'vitest'
import { SEATS } from '@/lib/seats'
import { computeWeights } from '@/lib/weights'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }

describe('computeWeights', () => {
  it('이력 없음 → 모든 가중치 1', () => {
    const w = computeWeights({ students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 })
    for (const s of students) for (const t of SEATS) expect(w[s.id][t.id]).toBe(1)
  })

  it('n회 앉은 자리 → decayFactor^n', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 2 } }, current: null }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0.25)
    expect(w['2501']['1-1-R']).toBe(1)
  })

  it('decayFactor 변경이 반영됨 (0.7)', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.7 })
    expect(w['2501']['1-1-L']).toBeCloseTo(0.7)
  })

  it('avoidPrev ON → 직전 자리만 0, 과거 자리는 감소만', () => {
    const history: HistoryState = {
      counts: { '2501': { '1-1-L': 1, '2-2-R': 1 } },
      current: { '2501': '1-1-L' },
    }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: true, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0)   // 직전 자리 하드 제외
    expect(w['2501']['2-2-R']).toBe(0.5) // 과거 자리는 소프트 감소
  })

  it('avoidPrev OFF → 직전 자리도 감소만 적용', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: { '2501': '1-1-L' } }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0.5)
  })

  it('고정석 학생은 행에서 제외', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '1-1-L' } : s))
    const w = computeWeights({ students: withFixed, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']).toBeUndefined()
    expect(Object.keys(w)).toHaveLength(26)
  })

  it('decayFactor가 (0,1] 밖이면 에러', () => {
    for (const bad of [0, -0.5, 1.5]) {
      expect(() =>
        computeWeights({ students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: bad }),
      ).toThrow()
    }
  })
})
