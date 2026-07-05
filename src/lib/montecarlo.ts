import { drawAssignment } from './draw'
import type { HistoryState, ProbMatrix, Seat, Student } from './types'

/**
 * 실제 배정 알고리즘을 iterations회 실행해 경험적 확률을 추정한다.
 * 근사 공식이 아니라 배정 절차 그 자체의 통계이므로 표시 확률 = 실제 확률.
 * i회째 시드는 `${seed}:mc:${i}` — 시드가 같으면 행렬도 동일(재현 가능).
 */
export function estimateProbabilities(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
  iterations: number
  seed: string
}): ProbMatrix {
  const { students, seats, iterations, seed, ...rest } = opts
  if (!(Number.isInteger(iterations) && iterations > 0)) {
    throw new Error(`iterations는 양의 정수여야 합니다: ${iterations}`)
  }
  const count: Record<string, Record<string, number>> = {}
  for (const s of students) {
    count[s.id] = {}
    for (const t of seats) count[s.id][t.id] = 0
  }
  for (let i = 0; i < iterations; i++) {
    const { arrangement } = drawAssignment({ students, seats, ...rest, seed: `${seed}:mc:${i}` })
    for (const [studentId, seatId] of Object.entries(arrangement)) count[studentId][seatId]++
  }
  const matrix: ProbMatrix = {}
  for (const s of students) {
    matrix[s.id] = {}
    for (const t of seats) matrix[s.id][t.id] = count[s.id][t.id] / iterations
  }
  return matrix
}
