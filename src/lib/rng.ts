import seedrandom from 'seedrandom'

export type Rng = () => number

/** 시드 문자열 → 결정론적 [0,1) 난수 생성기. 알고리즘 코드의 유일한 난수 원천. */
export function createRng(seed: string): Rng {
  return seedrandom(seed)
}

/** 128비트 루트 시드. Web Crypto 사용 (Node/Edge 겸용, 클라이언트 번들 안전). */
export function generateSeed(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Fisher-Yates — 모든 순열이 균등 확률. 원본 배열은 변경하지 않음. */
export function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export class AllWeightsZeroError extends Error {
  constructor() {
    super('모든 가중치가 0이라 추첨할 수 없습니다')
  }
}

/** 가중치 비례 인덱스 추첨. 부동소수점 누적 오차는 마지막 양수 항목으로 방어. */
export function weightedPick(weights: readonly number[], rng: Rng): number {
  let total = 0
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) throw new Error(`잘못된 가중치: ${w}`)
    total += w
  }
  if (total <= 0) throw new AllWeightsZeroError()
  const r = rng() * total
  let acc = 0
  let lastPositive = -1
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue
    lastPositive = i
    acc += weights[i]
    if (r < acc) return i
  }
  return lastPositive
}
