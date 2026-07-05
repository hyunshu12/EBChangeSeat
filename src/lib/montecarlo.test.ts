import { describe, expect, it } from 'vitest'
import { estimateProbabilities } from '@/lib/montecarlo'
import { SEATS } from '@/lib/seats'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }
const base = { students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 }

describe('estimateProbabilities', () => {
  it('각 학생의 행 합 = 1 (±1e-9)', () => {
    const p = estimateProbabilities({ ...base, iterations: 2000, seed: 'rowsum' })
    for (const s of students) {
      const sum = SEATS.reduce((acc, t) => acc + p[s.id][t.id], 0)
      expect(sum).toBeCloseTo(1, 9)
    }
  })

  it('각 좌석의 열 합 = 1 (전단사 배정의 구조적 불변량)', () => {
    const p = estimateProbabilities({ ...base, iterations: 2000, seed: 'colsum' })
    for (const t of SEATS) {
      const sum = students.reduce((acc, s) => acc + p[s.id][t.id], 0)
      expect(sum).toBeCloseTo(1, 9)
    }
  })

  it('시드 결정론: 같은 시드 → 같은 행렬', () => {
    const a = estimateProbabilities({ ...base, iterations: 500, seed: 'det' })
    const b = estimateProbabilities({ ...base, iterations: 500, seed: 'det' })
    expect(a).toEqual(b)
  })

  it('avoidPrev ON → 직전 자리 확률 정확히 0', () => {
    const prevSeat = '1-1-L'
    const history: HistoryState = { counts: {}, current: { '2501': prevSeat } }
    const p = estimateProbabilities({ ...base, history, avoidPrev: true, iterations: 2000, seed: 'zero' })
    expect(p['2501'][prevSeat]).toBe(0)
  })

  it('고정석 학생 → 고정석 확률 1, 다른 좌석 0, 타 학생은 그 좌석 0', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '2-3-L' } : s))
    const p = estimateProbabilities({ ...base, students: withFixed, iterations: 500, seed: 'fixed' })
    expect(p['2501']['2-3-L']).toBe(1)
    expect(p['2501']['1-1-L']).toBe(0)
    expect(p['2502']['2-3-L']).toBe(0)
  })

  it('한 번 앉은 자리는 균등 확률(1/27)보다 유의미하게 낮음', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const p = estimateProbabilities({ ...base, history, iterations: 10000, seed: 'decay' })
    expect(p['2501']['1-1-L']).toBeLessThan(1 / 27 * 0.8)
  })
})
