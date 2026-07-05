export type SeatId = string // 형식: `${분단}-${행}-${'L'|'R'}` 예: '2-3-L'

export interface Seat {
  id: SeatId
  block: 1 | 2 | 3
  row: number // 1 = 교탁 쪽(맨 앞)
  col: 'L' | 'R'
}

export interface Student {
  id: string // 학번
  name: string
  fixedSeatId?: SeatId // 지정 시 추첨 제외, 항상 이 자리 (직전 자리 회피 규칙보다 우선)
}

/** studentId → seatId. 유효한 배치는 전단사(모든 학생·모든 좌석이 정확히 1회). */
export type Arrangement = Record<string, SeatId>

export interface HistoryState {
  /** counts[studentId][seatId] = 그 자리에 앉았던 배치 기간 수 (현재 진행 중 기간 포함) */
  counts: Record<string, Record<SeatId, number>>
  /** 스왑 반영된 현재 배치. 셔플 이력이 없으면 null */
  current: Arrangement | null
}

export type WeightMatrix = Record<string, Record<SeatId, number>>
export type ProbMatrix = Record<string, Record<SeatId, number>>

export interface DrawResult {
  arrangement: Arrangement
  /** 루트 시드. 재추첨 k회째 시드는 `${seed}#${k}`로 결정론적 파생 → seed+redrawCount만으로 전 과정 재현 */
  seed: string
  redrawCount: number
}
