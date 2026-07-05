import { timingSafeEqual } from 'crypto'
import { countRecentPinFailures, recordPinAttempt } from './db'

export const RATE_LIMIT = { maxFailures: 5, windowMinutes: 10 }

/** 타이밍 공격에 안전한 PIN 비교. */
export function verifyPin(input: string): boolean {
  const expected = process.env.SHUFFLE_PIN
  if (!expected) throw new Error('SHUFFLE_PIN 환경 변수가 설정되지 않았습니다')
  const a = Buffer.from(String(input))
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 레이트리밋 확인 → PIN 검증 → 시도 기록. 모든 변경 API의 관문. */
export async function checkAndRecordPin(ip: string, pin: string): Promise<'ok' | 'rate_limited' | 'wrong_pin'> {
  const failures = await countRecentPinFailures(ip, RATE_LIMIT.windowMinutes)
  if (failures >= RATE_LIMIT.maxFailures) return 'rate_limited'
  const ok = verifyPin(pin)
  await recordPinAttempt(ip, ok)
  return ok ? 'ok' : 'wrong_pin'
}
