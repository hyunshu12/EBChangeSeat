import { describe, expect, it } from 'vitest'
import { drawAssignment } from '@/lib/draw'
import { estimateProbabilities } from '@/lib/montecarlo'
import { SEATS } from '@/lib/seats'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }
const base = { students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 }

// 카이제곱 임계값: df=26, α=0.001 → 54.052
// 시드 고정 몬테카를로라 테스트는 결정론적 (플레이키 아님)
const CHI2_CRIT_DF26_A001 = 54.052
const N = 20000

describe('통계 검증: 균등성', () => {
  it('이력 없음 → 각 학생의 좌석 분포가 균등 (카이제곱 df=26, α=0.001)', () => {
    const p = estimateProbabilities({ ...base, iterations: N, seed: 'stat:uniform' })
    const expected = N / 27
    // 27×27 확률 행렬이 이미 계산되어 있으므로 전원 카이제곱 합산은 마이크로초 비용.
    // FWER: 27개 검정 × α=0.001 → 합집합 상한 0.027, 고정 시드라 결정론적이며
    // 관측 chi² 값은 임계값(54.052)보다 훨씬 낮음.
    for (const s of students) {
      const chi2 = SEATS.reduce((acc, t) => {
        const observed = p[s.id][t.id] * N
        return acc + (observed - expected) ** 2 / expected
      }, 0)
      expect(chi2).toBeLessThan(CHI2_CRIT_DF26_A001)
    }
  })

  it('교환 가능성: 이력이 동일한 두 학생의 특정 좌석 확률이 통계 오차 내 일치', () => {
    const p = estimateProbabilities({ ...base, iterations: N, seed: 'stat:exch' })
    // 이력이 없으면 모든 학생이 대칭 → 같은 좌석 확률 차이는 표본오차(4σ ≈ 0.0053) 이내
    const seat = '2-3-L'
    const probs = students.map(s => p[s.id][seat])
    const max = Math.max(...probs)
    const min = Math.min(...probs)
    // 각 학생의 좌석 확률은 근사 정규 (p=1/27, N=20000 → σ=√(p(1-p)/N)≈0.001335).
    // max-min 은 27개 주변분포의 범위(range) 통계량이며 E[range]≈4σ≈0.0053.
    // 상한 0.011≈8σ 은 교환가능성 하에서 범위가 넘지 않을 보수적 한계.
    expect(max - min).toBeLessThan(0.011)
  })
})

describe('통계 검증: 감소 효과', () => {
  it('앉은 횟수가 많을수록 확률이 단조 감소', () => {
    const history: HistoryState = {
      counts: { '2501': { '1-1-L': 2, '1-2-L': 1 } },
      current: null,
    }
    const p = estimateProbabilities({ ...base, history, iterations: N, seed: 'stat:mono' })
    const twice = p['2501']['1-1-L']
    const once = p['2501']['1-2-L']
    const never = p['2501']['3-4-L']
    expect(twice).toBeLessThan(once)
    expect(once).toBeLessThan(never)
  })

  it('감소 계수를 완만하게(0.9) 하면 페널티도 완만해짐', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const strict = estimateProbabilities({ ...base, history, iterations: N, seed: 'stat:df' })
    const lenient = estimateProbabilities({ ...base, history, decayFactor: 0.9, iterations: N, seed: 'stat:df' })
    expect(strict['2501']['1-1-L']).toBeLessThan(lenient['2501']['1-1-L'])
  })
})

describe('통계 검증: 재현성 (감사 절차)', () => {
  it('로그에 기록될 (시드, 옵션, 이력)만으로 배정 전체를 재현할 수 있다', () => {
    // 셔플 3회 시뮬레이션: 매회 직전 결과가 이력이 됨
    let history: HistoryState = { counts: {}, current: null }
    for (let round = 0; round < 3; round++) {
      const seed = `audit-round-${round}`
      const official = drawAssignment({ ...base, history, avoidPrev: round > 0, seed })
      // 감사자 재현: 같은 공개 정보로 재실행
      const replay = drawAssignment({ ...base, history, avoidPrev: round > 0, seed })
      expect(replay.arrangement).toEqual(official.arrangement)
      expect(replay.redrawCount).toBe(official.redrawCount)
      // 다음 라운드 이력 구성
      const counts: HistoryState['counts'] = JSON.parse(JSON.stringify(history.counts))
      for (const [sid, tid] of Object.entries(official.arrangement)) {
        counts[sid] ??= {}
        counts[sid][tid] = (counts[sid][tid] ?? 0) + 1
      }
      history = { counts, current: official.arrangement }
    }
  })
})
