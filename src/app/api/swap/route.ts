import { NextResponse } from 'next/server'
import { checkAndRecordPin } from '@/lib/auth'
import { fetchHistoryRows, insertSwapSession } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { loadStudents } from '@/lib/roster'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const executedBy = typeof body?.executedBy === 'string' ? body.executedBy.trim() : ''
  const { studentA, studentB } = body ?? {}
  if (
    !executedBy || executedBy.length > 20 || typeof body?.pin !== 'string' ||
    typeof studentA !== 'string' || typeof studentB !== 'string' || studentA === studentB
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const roster = new Set(loadStudents().map(s => s.id))
  if (!roster.has(studentA) || !roster.has(studentB)) {
    return NextResponse.json({ error: 'unknown_student' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const auth = await checkAndRecordPin(ip, body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)
  if (!history.current) return NextResponse.json({ error: 'no_arrangement' }, { status: 409 })

  const seatA = history.current[studentA]
  const seatB = history.current[studentB]
  await insertSwapSession({
    executedBy,
    entries: [
      { studentId: studentA, seatId: seatB },
      { studentId: studentB, seatId: seatA },
    ],
  })
  return NextResponse.json({ arrangement: { ...history.current, [studentA]: seatB, [studentB]: seatA } })
}
