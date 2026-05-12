import { describe, expect, it } from 'vitest'

import { ToScreenPass } from '@/rendering/webgpu/passes/ToScreenPass'

describe('ToScreenPass parameter sanitization', () => {
  it('sanitizes constructor exposure and sharpness', () => {
    const pass = new ToScreenPass({
      inputResource: 'final-color',
      exposure: Number.NaN,
      sharpness: 2,
    })

    expect(pass.getExposure()).toBe(1)
    expect(pass.getSharpness()).toBe(1)
  })

  it('keeps prior finite values when setter input is non-finite', () => {
    const pass = new ToScreenPass({
      inputResource: 'final-color',
      exposure: 1.25,
      sharpness: 0.4,
    })

    pass.setExposure(Number.NEGATIVE_INFINITY)
    pass.setSharpness(Number.NaN)

    expect(pass.getExposure()).toBe(1.25)
    expect(pass.getSharpness()).toBe(0.4)
  })

  it('clamps negative exposure and sharpness to zero', () => {
    const pass = new ToScreenPass({
      inputResource: 'final-color',
      exposure: -1,
      sharpness: -0.5,
    })

    expect(pass.getExposure()).toBe(0)
    expect(pass.getSharpness()).toBe(0)
  })
})
