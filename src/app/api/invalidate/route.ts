import { NextResponse } from 'next/server'
import { checkAndRecordPin } from '@/lib/auth'
import { setSessionInvalidated } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (typeof body?.pin !== 'string' || typeof body?.sessionId !== 'string' || !body.sessionId) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const auth = await checkAndRecordPin(ip, body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  await setSessionInvalidated(body.sessionId)
  return NextResponse.json({ ok: true })
}
