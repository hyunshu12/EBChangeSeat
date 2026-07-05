import { AllWeightsZeroError, createRng, shuffled, weightedPick, type Rng } from './rng'
import { computeWeights } from './weights'
import type { Arrangement, DrawResult, HistoryState, Seat, Student, WeightMatrix } from './types'

export class DrawImpossibleError extends Error {}

/**
 * 시드 결정론적 자리 배정.
 * 재추첨 k회째 시드는 `${seed}#${k}` — 루트 시드와 redrawCount만으로 전 과정 재현 가능.
 */
export function drawAssignment(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
  seed: string
  maxRedraws?: number
}): DrawResult {
  const { students, seats, history, avoidPrev, decayFactor, seed, maxRedraws = 100 } = opts
  if (students.length !== seats.length) {
    throw new Error(`인원(${students.length})과 좌석(${seats.length}) 수가 다릅니다`)
  }

  const weights = computeWeights({ students, seats, history, avoidPrev, decayFactor })
  const fixed = students.filter(s => s.fixedSeatId)
  const free = students.filter(s => !s.fixedSeatId)
  const fixedSeatIds = new Set(fixed.map(s => s.fixedSeatId as string))
  const pool = seats.filter(t => !fixedSeatIds.has(t.id))

  for (let attempt = 0; attempt <= maxRedraws; attempt++) {
    const attemptSeed = attempt === 0 ? seed : `${seed}#${attempt}`
    const partial = tryDraw(free, pool, weights, createRng(attemptSeed))
    if (partial) {
      const arrangement: Arrangement = { ...partial }
      for (const s of fixed) arrangement[s.id] = s.fixedSeatId as string
      return { arrangement, seed, redrawCount: attempt }
    }
  }
  throw new DrawImpossibleError(`${maxRedraws}회 재추첨 후에도 유효한 배정을 찾지 못했습니다`)
}

/** 한 번의 시도. 막다른 길이면 null (호출자가 파생 시드로 재시도). */
function tryDraw(free: Student[], pool: Seat[], weights: WeightMatrix, rng: Rng): Arrangement | null {
  const order = shuffled(free, rng)
  const remaining = [...pool]
  const arrangement: Arrangement = {}
  for (const s of order) {
    let idx: number
    try {
      idx = weightedPick(remaining.map(t => weights[s.id][t.id]), rng)
    } catch (e) {
      if (e instanceof AllWeightsZeroError) return null
      throw e
    }
    arrangement[s.id] = remaining[idx].id
    remaining.splice(idx, 1)
  }
  return arrangement
}
