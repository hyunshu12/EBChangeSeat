import { describe, expect, it } from 'vitest'
import { config } from '@/config'

describe('config', () => {
  it('기본값: decayFactor 0.5, mcIterations 10000, maxRedraws 100', () => {
    expect(config.decayFactor).toBe(0.5)
    expect(config.mcIterations).toBe(10000)
    expect(config.maxRedraws).toBe(100)
  })
})
