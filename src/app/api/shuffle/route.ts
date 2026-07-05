import { NextResponse } from 'next/server'
import { config } from '@/config'
import { checkAndRecordPin } from '@/lib/auth'
import { drawAssignment } from '@/lib/draw'
import { fetchHistoryRows, insertShuffleSession } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { estimateProbabilities } from '@/lib/montecarlo'
import { loadStudents } from '@/lib/roster'
import { generateSeed } from '@/lib/rng'
import { SEATS } from '@/lib/seats'

export const dynamic = 'force-dynamic'

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return ''
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const executedBy = typeof body?.executedBy === 'string' ? body.executedBy.trim() : ''
  if (!executedBy || executedBy.length > 20 || typeof body?.pin !== 'string' || typeof body?.avoidPrev !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const auth = await checkAndRecordPin(clientIp(req), body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  const students = loadStudents()
  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)

  // 낙관적 락 기준: 가장 최근 비무효 세션 id (동시 셔플 경합 감지용). 없으면 null.
  const latestSessionId = sessions
    .filter(s => !s.invalidated)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .at(-1)?.id ?? null

  const seed = generateSeed()
  // 셔플 직전 확률 스냅샷: 이 셔플과 같은 조건, 시드는 루트 시드에서 파생 → 스냅샷도 재현 가능
  const probSnapshot = estimateProbabilities({
    students, seats: SEATS, history,
    avoidPrev: body.avoidPrev, decayFactor: config.decayFactor,
    iterations: config.mcIterations, seed: `${seed}:snapshot`,
  })
  const result = drawAssignment({
    students, seats: SEATS, history,
    avoidPrev: body.avoidPrev, decayFactor: config.decayFactor,
    seed, maxRedraws: config.maxRedraws,
  })

  try {
    await insertShuffleSession({
      executedBy, avoidPrev: body.avoidPrev, seed: result.seed,
      redrawCount: result.redrawCount, probSnapshot, arrangement: result.arrangement,
      decayFactor: config.decayFactor, mcIterations: config.mcIterations,
      basedOnSessionId: latestSessionId,
    })
  } catch (e) {
    // 동시 셔플 경합: 우리가 기준 삼은 최신 세션 이후 다른 셔플이 커밋됨 (RPC 낙관적 락).
    if (errorMessage(e).includes('concurrent_shuffle')) {
      return NextResponse.json({ error: 'concurrent_shuffle' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({
    arrangement: result.arrangement,
    seed: result.seed,
    redrawCount: result.redrawCount,
  })
}
