import { describe, expect, it } from 'vitest'

import { WebGPUSchrodingerRenderer } from '@/rendering/webgpu/renderers/WebGPUSchrodingerRenderer'
import { freeScalarInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'

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

  it('contains retrocausal caustic shader enum 4 branch and pi assignment', () => {
    expect(freeScalarInitBlock).toContain('params.initCondition == 4u')
    expect(freeScalarInitBlock).toContain('computeRetrocausalCaustic(worldPos)')
    expect(freeScalarInitBlock).toContain('piVal = caustic.y')
  })

  it('contains rank-defect genesis shader enum 5 branch and orthogonal pi assignment', () => {
    expect(freeScalarInitBlock).toContain('params.initCondition == 5u')
    expect(freeScalarInitBlock).toContain('computeRankDefectGenesis(worldPos)')
    expect(freeScalarInitBlock).toContain('piVal = completion.y')
  })

  it('contains chronogenic shear shader enum 6 branch and sheared pi assignment', () => {
    expect(freeScalarInitBlock).toContain('params.initCondition == 6u')
    expect(freeScalarInitBlock).toContain('computeChronogenicShear(worldPos)')
    expect(freeScalarInitBlock).toContain('piVal = shear.y')
  })

  it('contains cauchy loom weave shader enum 7 branch and canonical pi assignment', () => {
    expect(freeScalarInitBlock).toContain('params.initCondition == 7u')
    expect(freeScalarInitBlock).toContain('computeCauchyLoomWeave(worldPos)')
    expect(freeScalarInitBlock).toContain('piVal = weave.y')
  })
})
