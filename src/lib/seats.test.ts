import { describe, expect, it } from 'vitest'
import { SEATS, SEAT_IDS } from '@/lib/seats'

describe('SEATS', () => {
  it('총 27석', () => {
    expect(SEATS).toHaveLength(27)
  })
  it('분단별 10/10/7석', () => {
    expect(SEATS.filter(s => s.block === 1)).toHaveLength(10)
    expect(SEATS.filter(s => s.block === 2)).toHaveLength(10)
    expect(SEATS.filter(s => s.block === 3)).toHaveLength(7)
  })
  it('3분단 4행은 왼쪽 한 자리뿐', () => {
    expect(SEAT_IDS).toContain('3-4-L')
    expect(SEAT_IDS).not.toContain('3-4-R')
    expect(SEAT_IDS.filter(id => id.startsWith('3-5'))).toHaveLength(0)
  })
  it('좌석 ID 중복 없음', () => {
    expect(new Set(SEAT_IDS).size).toBe(27)
  })
})
