import { NextResponse } from 'next/server'
import { config } from '@/config'
import { fetchHistoryRows } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { estimateProbabilities } from '@/lib/montecarlo'
import { loadStudents } from '@/lib/roster'
import { SEATS } from '@/lib/seats'
import type { ProbMatrix } from '@/lib/types'

export const dynamic = 'force-dynamic'

// 인스턴스별 메모. 이력은 새 세션(셔플·교환·무효)이 생겨야만 바뀌므로
// (최신 세션 id, avoidPrev)가 키로 충분하다. 익명 GET마다 10k회 MC를 다시 돌리지 않는다.
let cache: { key: string; probabilities: ProbMatrix } | null = null

/** 다음 셔플 기준 확률. 조회는 공개 (PIN 불필요). */
export async function GET(req: Request) {
  const avoidPrev = new URL(req.url).searchParams.get('avoidPrev') === 'true'
  const { sessions, assignments } = await fetchHistoryRows()

  const latestSessionId = sessions
    .filter(s => !s.invalidated)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .at(-1)?.id ?? 'none'
  const key = `${latestSessionId}:${avoidPrev}`
  if (cache && cache.key === key) return NextResponse.json({ probabilities: cache.probabilities })

  const students = loadStudents()
  const history = deriveHistory(sessions, assignments)
  const probabilities = estimateProbabilities({
    students, seats: SEATS, history, avoidPrev,
    decayFactor: config.decayFactor, iterations: config.mcIterations,
    // 결정론적 시드 (generateSeed() 대체) → 같은 이력·옵션이면 조회 확률도 재현 가능.
    seed: `${key}:live`,
  })
  cache = { key, probabilities }
  return NextResponse.json({ probabilities })
}
