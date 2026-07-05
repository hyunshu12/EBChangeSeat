import type { HistoryState, Seat, Student, WeightMatrix } from './types'

/**
 * weight(s, t) = decayFactor ^ n(s, t)   — n: 그 자리에 앉았던 배치 기간 수
 * avoidPrev ON이면 직전(현재) 자리만 0으로 하드 제외.
 * 고정석 학생은 추첨 대상이 아니므로 행을 만들지 않는다.
 */
export function computeWeights(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
}): WeightMatrix {
  const { students, seats, history, avoidPrev, decayFactor } = opts
  if (!(decayFactor > 0 && decayFactor <= 1)) {
    throw new Error(`decayFactor는 (0, 1] 범위여야 합니다: ${decayFactor}`)
  }
  const matrix: WeightMatrix = {}
  for (const s of students) {
    if (s.fixedSeatId) continue
    matrix[s.id] = {}
    const prevSeat = history.current?.[s.id]
    for (const t of seats) {
      const n = history.counts[s.id]?.[t.id] ?? 0
      matrix[s.id][t.id] = avoidPrev && prevSeat === t.id ? 0 : Math.pow(decayFactor, n)
    }
  }
  return matrix
}
