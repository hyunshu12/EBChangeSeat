import { describe, expect, it } from 'vitest'
import { AllWeightsZeroError, createRng, generateSeed, shuffled, weightedPick } from '@/lib/rng'

describe('createRng', () => {
  it('같은 시드 → 같은 수열 (결정론)', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-1')
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })
  it('다른 시드 → 다른 수열', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-2')
    const same = Array.from({ length: 20 }, () => a() === b())
    expect(same.every(Boolean)).toBe(false)
  })
})

describe('generateSeed', () => {
  it('32자 hex, 호출마다 다름', () => {
    const s1 = generateSeed()
    const s2 = generateSeed()
    expect(s1).toMatch(/^[0-9a-f]{32}$/)
    expect(s1).not.toBe(s2)
  })
})

describe('shuffled', () => {
  it('순열이다 (원소 보존)', () => {
    const input = Array.from({ length: 27 }, (_, i) => i)
    const out = shuffled(input, createRng('s'))
    expect([...out].sort((a, b) => a - b)).toEqual(input)
    expect(out).not.toBe(input) // 원본 불변
  })
  it('시드 결정론', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffled(input, createRng('x'))).toEqual(shuffled(input, createRng('x')))
  })
})

describe('weightedPick', () => {
  it('가중치 0인 항목은 절대 선택되지 않음', () => {
    const rng = createRng('zero-test')
    for (let i = 0; i < 5000; i++) {
      expect(weightedPick([0, 1, 0, 1, 0], rng)).not.toBeOneOf([0, 2, 4])
    }
  })
  it('전부 0이면 AllWeightsZeroError', () => {
    expect(() => weightedPick([0, 0, 0], createRng('s'))).toThrow(AllWeightsZeroError)
  })
  it('음수/NaN 가중치는 에러', () => {
    expect(() => weightedPick([1, -1], createRng('s'))).toThrow()
    expect(() => weightedPick([1, NaN], createRng('s'))).toThrow()
  })
  it('빈도가 가중치에 비례 (2:1, 허용오차 ±3%p)', () => {
    const rng = createRng('ratio-test')
    let first = 0
    const n = 30000
    for (let i = 0; i < n; i++) if (weightedPick([2, 1], rng) === 0) first++
    expect(first / n).toBeGreaterThan(2 / 3 - 0.03)
    expect(first / n).toBeLessThan(2 / 3 + 0.03)
  })
})
