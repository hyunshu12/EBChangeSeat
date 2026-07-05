import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  countRecentPinFailures: vi.fn(),
  recordPinAttempt: vi.fn(),
}))

import { checkAndRecordPin, verifyPin } from '@/lib/auth'
import { countRecentPinFailures, recordPinAttempt } from '@/lib/db'

beforeEach(() => {
  vi.stubEnv('SHUFFLE_PIN', '4321')
  vi.mocked(countRecentPinFailures).mockResolvedValue(0)
  vi.mocked(recordPinAttempt).mockResolvedValue()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('verifyPin', () => {
  it('일치 → true, 불일치/길이 다름 → false', () => {
    expect(verifyPin('4321')).toBe(true)
    expect(verifyPin('0000')).toBe(false)
    expect(verifyPin('43210')).toBe(false)
    expect(verifyPin('')).toBe(false)
  })
  it('SHUFFLE_PIN 미설정 → 에러 (조용한 통과 금지)', () => {
    vi.stubEnv('SHUFFLE_PIN', '')
    expect(() => verifyPin('4321')).toThrow()
  })
})

describe('checkAndRecordPin', () => {
  it('올바른 PIN → ok, 성공 시도 기록', async () => {
    await expect(checkAndRecordPin('1.2.3.4', '4321')).resolves.toBe('ok')
    expect(recordPinAttempt).toHaveBeenCalledWith('1.2.3.4', true)
  })
  it('틀린 PIN → wrong_pin, 실패 시도 기록', async () => {
    await expect(checkAndRecordPin('1.2.3.4', '9999')).resolves.toBe('wrong_pin')
    expect(recordPinAttempt).toHaveBeenCalledWith('1.2.3.4', false)
  })
  it('최근 실패 5회 이상 → rate_limited, PIN 검증 자체를 건너뜀', async () => {
    vi.mocked(countRecentPinFailures).mockResolvedValue(5)
    await expect(checkAndRecordPin('1.2.3.4', '4321')).resolves.toBe('rate_limited')
    expect(recordPinAttempt).not.toHaveBeenCalled()
  })
})
