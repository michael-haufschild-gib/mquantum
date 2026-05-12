import { describe, expect, it } from 'vitest'

import { SMAAPass } from '@/rendering/webgpu/passes/SMAAPass'

type TestableSMAAPass = {
  threshold: number
  maxSearchSteps: number
}

describe('SMAAPass option sanitization', () => {
  it('sanitizes constructor threshold and search-step values', () => {
    const pass = new SMAAPass({
      threshold: Number.NaN,
      maxSearchSteps: Number.POSITIVE_INFINITY,
    }) as unknown as TestableSMAAPass

    expect(pass.threshold).toBe(0.1)
    expect(pass.maxSearchSteps).toBe(16)
  })

  it('clamps mutable threshold and search-step values', () => {
    const pass = new SMAAPass()
    const internals = pass as unknown as TestableSMAAPass

    pass.setThreshold(-1)
    pass.setMaxSearchSteps(100)

    expect(internals.threshold).toBe(0.05)
    expect(internals.maxSearchSteps).toBe(32)
  })

  it('keeps prior finite values when setters receive non-finite input', () => {
    const pass = new SMAAPass({ threshold: 0.2, maxSearchSteps: 12 })
    const internals = pass as unknown as TestableSMAAPass

    pass.setThreshold(Number.NEGATIVE_INFINITY)
    pass.setMaxSearchSteps(Number.NaN)

    expect(internals.threshold).toBe(0.2)
    expect(internals.maxSearchSteps).toBe(12)
  })

  it('mirrors WGSL integer truncation for fractional search steps', () => {
    const pass = new SMAAPass({ maxSearchSteps: 12.9 }) as unknown as TestableSMAAPass

    expect(pass.maxSearchSteps).toBe(12)
  })
})
