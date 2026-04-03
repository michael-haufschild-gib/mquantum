import { describe, expect, it } from 'vitest'

import { WebGPUSchrodingerRenderer } from '@/rendering/webgpu/renderers/WebGPUSchrodingerRenderer'

describe('renderer temporal + free scalar interaction', () => {
  it('disables temporal outputs when quantumMode is freeScalarField even if temporal flag is true', () => {
    const renderer = new WebGPUSchrodingerRenderer({
      temporal: true,
      quantumMode: 'freeScalarField',
      dimension: 3,
    })
    const outputIds = renderer.config.outputs.map((o) => o.resourceId)
    expect(outputIds).not.toContain('quarter-color')
    expect(outputIds).not.toContain('quarter-position')
    expect(outputIds).toContain('object-color')
  })

  it('allows temporal outputs for non-free-scalar modes when temporal is true', () => {
    const renderer = new WebGPUSchrodingerRenderer({
      temporal: true,
      quantumMode: 'harmonicOscillator',
      dimension: 3,
    })
    const outputIds = renderer.config.outputs.map((o) => o.resourceId)
    expect(outputIds).toContain('quarter-color')
    expect(outputIds).toContain('quarter-position')
  })
})
