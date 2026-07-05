import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  fetchHistoryRows: vi.fn().mockResolvedValue({ sessions: [], assignments: [] }),
  insertShuffleSession: vi.fn().mockResolvedValue('sess-1'),
  countRecentPinFailures: vi.fn().mockResolvedValue(0),
  recordPinAttempt: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/shuffle/route'
import { insertShuffleSession } from '@/lib/db'

function req(body: unknown): Request {
  return new Request('http://test/api/shuffle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('SHUFFLE_PIN', '0119')
  vi.clearAllMocks()
})

describe('POST /api/shuffle', () => {
  it('정상 요청 → 200, 27명 배정 + 시드 반환, 세션 저장', async () => {
    const res = await POST(req({ executedBy: '김철수', pin: '0119', avoidPrev: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Object.keys(json.arrangement)).toHaveLength(27)
    expect(json.seed).toMatch(/^[0-9a-f]{32}$/)
    expect(insertShuffleSession).toHaveBeenCalledOnce()
  })
  it('PIN 불일치 → 401', async () => {
    const res = await POST(req({ executedBy: '김철수', pin: '9999', avoidPrev: false }))
    expect(res.status).toBe(401)
  })
  it('이름 누락/공백 → 400', async () => {
    const res = await POST(req({ executedBy: '  ', pin: '0119', avoidPrev: false }))
    expect(res.status).toBe(400)
  })
  it('본문이 JSON이 아니면 400', async () => {
    const res = await POST(new Request('http://test', { method: 'POST', body: 'x' }))
    expect(res.status).toBe(400)
  })
})
