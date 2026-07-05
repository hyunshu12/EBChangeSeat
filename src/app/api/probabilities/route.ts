import { NextResponse } from 'next/server'
import { config } from '@/config'
import { fetchHistoryRows } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { estimateProbabilities } from '@/lib/montecarlo'
import { generateSeed } from '@/lib/rng'
import { loadStudents } from '@/lib/roster'
import { SEATS } from '@/lib/seats'

export const dynamic = 'force-dynamic'

/** 다음 셔플 기준 확률. 조회는 공개 (PIN 불필요). */
export async function GET(req: Request) {
  const avoidPrev = new URL(req.url).searchParams.get('avoidPrev') === 'true'
  const students = loadStudents()
  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)
  const probabilities = estimateProbabilities({
    students, seats: SEATS, history, avoidPrev,
    decayFactor: config.decayFactor, iterations: config.mcIterations, seed: generateSeed(),
  })
  return NextResponse.json({ probabilities })
}
